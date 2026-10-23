/**
 * Nether explorer — what the bot does once it is actually in the Nether.
 *
 * Goals, in priority order:
 *  1. never die: leave when health/food are low, keep away from lava seas,
 *     do not wander past the leash of the arrival portal,
 *  2. gather real nether resources (quartz, gold, magma, nether wart),
 *  3. look for a fortress/bastion with the bounded structure scanner,
 *  4. return to the Overworld when the trip has paid off or the budget runs out.
 *
 * It does not build a return portal proactively: the traveler's linked fallback
 * brings the bot back to the remembered Overworld frame, so a nether trip can
 * never strand it without obsidian.
 */
import { NETHER, OVERWORLD, chooseNetherTarget, shouldReturnToOverworld } from "../core/portal.js";
import { distance, floor } from "../core/math.js";

const TRIP_BUDGET = 12000;
const VALUABLE = ["minecraft:quartz", "minecraft:nether_gold_ore", "minecraft:gold_nugget", "minecraft:magma_cream", "minecraft:nether_wart", "minecraft:blaze_rod", "minecraft:ancient_debris"];

export class NetherExplorer {
    constructor(bot) {
        this.bot = bot;
        this.portal = undefined;
        this.started = 0;
        this.lastTick = 0;
        this.lastGoal = undefined;
        this.lastRoute = 0;
        this.loot = 0;
        this.trip = 0;
        this.reason = "";
        this.returnRequested = false;
    }

    reset(tick = 0) {
        this.portal = undefined;
        this.started = tick;
        this.lastTick = tick;
        this.lastGoal = undefined;
        this.lastRoute = tick;
        this.loot = 0;
        this.trip = 0;
        this.reason = "";
        this.returnRequested = false;
    }

    get active() {
        return this.bot.sim.dimension?.id === NETHER;
    }

    /** Remember the arrival point so the leash and return always have an anchor. */
    anchor(p) {
        if (p) this.portal = floor(p);
        return this.portal;
    }

    /** Bounded cached scan for a nether block the awareness map may not track. */
    findResource(type, radius = 16) {
        try {
            const found = this.bot.terrain?.scanOres?.(this.bot.sim.location, radius, (t) => t === type, 320) ?? [];
            return found[0];
        } catch {
            return undefined;
        }
    }

    valuableCount(counts) {
        let n = 0;
        for (const type of VALUABLE) n += counts[type] ?? 0;
        return n;
    }

    tick(tick) {
        if (!this.active || this.bot.travel?.active) return false;
        if (!this.started) this.started = tick;
        this.trip = tick - this.started;
        if (tick - this.lastTick < 20) return false;
        this.lastTick = tick;
        const bot = this.bot;
        const counts = bot.bag.counts();
        const hp = bot.sim.getComponent("minecraft:health")?.currentValue ?? 20;
        const food = bot.sim.getComponent("minecraft:player.hunger")?.currentValue ?? 20;
        const here = floor(bot.sim.location);
        if (!this.portal) this.anchor(here);
        this.loot = this.valuableCount(counts);

        // 1. Leave before it becomes a death.
        if (!this.returnRequested) {
            const back = shouldReturnToOverworld({
                dimension: NETHER,
                health: hp,
                food,
                hasReturnPortal: false,
                hostiles: bot.terrain.threatInfo(bot.sim, bot.owner())?.count ?? 0,
            });
            const done = this.trip > TRIP_BUDGET || this.loot >= 16;
            if (back.return || done) {
                this.returnRequested = true;
                const reason = back.return ? back.reason : done ? (this.trip > TRIP_BUDGET ? "trip budget reached" : `gathered ${this.loot} nether items`) : "";
                this.reason = `Returning to the Overworld: ${reason}`;
                bot.reason = this.reason;
                bot.tell(this.reason);
                bot.record?.(this.reason);
                bot.travel.begin(OVERWORLD, this.portal, tick);
                return true;
            }
        } else if (!bot.travel.active) {
            // Return attempt ended (arrived or failed). Reset for the next trip.
            this.returnRequested = false;
            this.started = tick;
            this.loot = 0;
        }

        // 2. Keep hostile pressure to the regular combat/escape directors.
        const threat = bot.terrain.threatInfo(bot.sim, bot.owner());
        if (threat?.count >= 2 || threat?.list?.some((e) => e.typeId === "minecraft:ghast")) return false;

        // 3. Mine a real nether resource when it is close and visible.
        if (!bot.mining && tick - this.lastRoute > 60) {
            for (const type of ["minecraft:nether_quartz_ore", "minecraft:nether_gold_ore"]) {
                const spot = bot.awareness?.getNearest?.(type.replace("minecraft:", "")) ?? this.findResource(type);
                if (!spot) continue;
                if (distance(spot.pos, here) > 40) continue;
                this.lastRoute = tick;
                bot.reason = `Nether: mining ${type.replace("minecraft:", "")} at ${spot.pos.x},${spot.pos.y},${spot.pos.z}`;
                bot.assignMine(type, 8);
                return true;
            }
        }

        // 4. Explore within the leash, preferring useful structure targets.
        if (tick - this.lastRoute > 120) {
            this.lastRoute = tick;
            const targets = [];
            const top = bot.structures?.getTopPriority?.();
            if (top?.name) targets.push({ pos: top.pos, kind: /fortress|bastion/.test(top.name) ? "fortress" : "resource" });
            const quartz = bot.awareness?.getNearest?.("nether_quartz_ore") ?? this.findResource("minecraft:nether_quartz_ore");
            if (quartz) targets.push({ pos: quartz.pos ?? quartz, kind: "quartz" });
            const gold = bot.awareness?.getNearest?.("nether_gold_ore") ?? this.findResource("minecraft:nether_gold_ore");
            if (gold) targets.push({ pos: gold.pos ?? gold, kind: "gold" });
            const chosen = chooseNetherTarget(targets, here, { leash: 96, portal: this.portal, hostilesNear: threat?.count ?? 0 });
            if (chosen) {
                const pos = chosen.target.pos;
                bot.reason = `Nether: heading for ${chosen.target.kind} at ${pos.x},${pos.y},${pos.z}`;
                const r = bot.navTo(pos, tick, 2);
                if (r !== "failed") return true;
            }
            // Nothing scored: explore a step, but turn back at the leash.
            if (distance(here, this.portal) > 96) {
                bot.reason = "Nether: leash reached, returning toward the arrival portal";
                bot.navTo(this.portal, tick, 2);
                return true;
            }
            if (bot.scout?.step?.(tick)) return true;
        }
        return false;
    }

    report() {
        return {
            active: this.active,
            portal: this.portal,
            loot: this.loot,
            trip: this.trip,
            reason: this.reason,
            returning: this.returnRequested,
        };
    }
}
