// One module now: runtime/scouting.js + runtime/exploration.js (see docs/ARCHITECTURE.md).
import { CARDINAL, UP, add, center, distance, floor, key } from "../core/math.js";
import { amountOf } from "../core/recipes.js";
import { allowedPrey } from "./survival.js";
import { BlockScan } from "./world.js";
import { system } from "@minecraft/server";

// ---------------------------------------------------------------- scouting.js

/**
 * Roaming duties: villages worth looting, fresh ground worth scouting, and
 * opportunistic foraging on the way (a trunk for logs, a sheep for wool).
 *
 * Runs only in the survival "maintain" stage - when the kit is done and
 * nothing urgent is pending. Everything here is physical (real swings, real
 * walk-over pickups), bounded by per-chore budgets, and a threat or blocked
 * task cancels it immediately because the brain checks those first. When
 * there is genuinely nothing left to scout, it says so once instead of
 * silently orbiting the base.
 */
export class Scout {
    constructor(bot) {
        this.bot = bot;
        /** Current foraging chore (see forageDetour()); one at a time. */
        this.chore = undefined;
        /** Last time a foraging pass started; keeps passes ~30s apart. */
        this.choreAt = 0;
        /** Village-detection cache; the lookup runs every maintain tick. */
        this.villageCache = undefined;
        /** One honest "nothing left to scout" message per blocked episode. */
        this.toldBlocked = false;
    }
    /** One tick of scouting. Returns true while it owns the bot's action. */
    step(tick) {
        const b = this.bot;
        if (!b.settings.loot)
            return false;
        const target = this.villageNear(64);
        if (target && distance(target.location, b.sim.location) > 8) {
            b.reason = "A village is close; heading over to loot its stores.";
            const r = b.navTo(target.location, tick, 6);
            if (r === "failed" || r === "blocked")
                b.nav.reset();
            else
                return true;
        }
        // Trees and sheep passed on the way are worth a quick, bounded grab
        // before walking on. Physical only; threats and orders cancel it.
        if (this.forageDetour(tick))
            return true;
        // In town (or nobody around): sweep the ground; maybeLoot picks up
        // chests as the route crosses them.
        b.reason = target
            ? "In a village; sweeping for stores."
            : "Scouting the area for villages and structures.";
        const r = b.explorer.step(b.sim.location, b.anchor, tick, b.terrain, b.nav, b.settings.range);
        if (r === "arrived")
            b.explorer.reset();
        if (r === "blocked" && !this.toldBlocked) {
            this.toldBlocked = true;
            b.tell("Scouted everything within range of home; guarding from here. Move me or widen with !bot range to search further.");
        }
        if (r !== "blocked")
            this.toldBlocked = false;
        return r !== "blocked";
    }
    /** Nearest villager/cat/trader: strong evidence of a village to loot. */
    villageNear(radius = 64) {
        const b = this.bot;
        // Queried every maintain tick; a 10-tick cache keeps it cheap.
        const now = system.currentTick;
        if (this.villageCache && now - this.villageCache.at < 10 &&
            (!this.villageCache.e || this.villageCache.e.isValid))
            return this.villageCache.e;
        let best, bestD = Infinity;
        try {
            const list = b.sim.dimension.getEntities({ location: b.sim.location, maxDistance: radius });
            for (const e of list) {
                const t = e.typeId;
                if (t !== "minecraft:villager" && t !== "minecraft:villager_v2" &&
                    t !== "minecraft:wandering_trader" && t !== "minecraft:cat")
                    continue;
                const d = distance(e.location, b.sim.location);
                if (d < bestD) {
                    bestD = d;
                    best = e;
                }
            }
        }
        catch {
            best = undefined;
        }
        this.villageCache = { at: now, e: best };
        return best;
    }
    /* ------------------------ opportunistic foraging ------------------------ */
    /**
     * While roaming (auto scouting/maintenance): a trunk in reach is worth a
     * few logs, a sheep is worth wool for the bed and mutton for the pot - no
     * more standing around next to resources it could use. One short pass per
     * ~30s; threats, blocks and orders hand the tick straight back.
     */
    forageDetour(tick) {
        const b = this.bot;
        if (!b.settings.hunting)
            return false;
        if (this.forageTick(tick))
            return true;
        if (b.threat || b.blocked || b.nav.stuck ||
            b.bag.container.emptySlotsCount < 2 ||
            tick - this.choreAt < 600)
            return false;
        const here = b.sim.location;
        // Wool first: three of one colour is what the bed still needs.
        if (amountOf(b.bag.counts(), "#wool") < 3) {
            const sheep = b.sim.dimension
                .getEntities({ type: "minecraft:sheep", location: here, maxDistance: 12 })
                .filter((e) => e.isValid && allowedPrey(e))
                .sort((a, c) => distance(a.location, here) - distance(c.location, here))[0];
            if (sheep) {
                this.choreAt = tick;
                this.chore = {
                    kind: "sheep",
                    e: sheep,
                    until: tick + 400,
                    lastSwing: 0,
                    loot: floor(sheep.location),
                };
                return true;
            }
        }
        const stock = b.bag.counts();
        if (amountOf(stock, "#logs") < 4 && amountOf(stock, "#planks") < 16) {
            const scan = new BlockScan(here, 8);
            const cell = scan.next(b.terrain, (type, p) =>
                /(_log|_wood)$/.test(type) &&
                [...CARDINAL, UP].some((d) => b.terrain.block(add(p, d))?.isAir));
            if (cell) {
                this.choreAt = tick;
                this.chore = {
                    kind: "tree",
                    cell,
                    until: tick + 400,
                    lastSwing: 0,
                    got: 0,
                };
                return true;
            }
        }
        return false;
    }
    /** One tick of whichever foraging chore is running, if any. */
    forageTick(tick) {
        const b = this.bot;
        const c = this.chore;
        if (!c)
            return false;
        if (b.threat || tick > c.until) {
            this.chore = undefined;
            b.nav.reset();
            return false;
        }
        return c.kind === "sheep"
            ? this.forageSheep(tick, c)
            : this.forageTree(tick, c);
    }
    /** Close in on a sheep, swing on a cadence, then walk the spot it fell. */
    forageSheep(tick, c) {
        const b = this.bot;
        const e = c.e;
        if (!e || !e.isValid) {
            // Dead (or gone): collect what it dropped where it fell.
            if (!c.loot) {
                this.chore = undefined;
                return false;
            }
            const flat = distance(center(c.loot), b.sim.location);
            if (flat > 1.2) {
                const r = b.navTo(c.loot, tick, 1);
                if (r === "failed" || r === "blocked") {
                    b.nav.reset();
                    b.nav.stuck = false;
                    b.drops.pushToward(center(c.loot));
                }
            }
            else {
                b.nav.reset();
                b.sim.stopMoving();
                c.dwell = c.dwell ?? tick;
                if (tick - c.dwell > 40) {
                    this.chore = undefined;
                    return false;
                }
            }
            b.reason = "Collecting the sheep drop.";
            return true;
        }
        c.loot = floor(e.location);
        if (distance(e.location, b.sim.location) > 2.8) {
            b.reason = "Chasing a sheep for wool.";
            const r = b.navTo(e.location, tick, 1);
            if (r === "failed" || r === "blocked") {
                b.nav.reset();
                this.chore = undefined;
            }
            return true;
        }
        b.nav.reset();
        b.reason = "Hunting a sheep for wool.";
        b.sim.lookAtEntity(e);
        if (tick - c.lastSwing >= 10 && allowedPrey(e)) {
            b.bag.tool("sword") || b.bag.tool("axe");
            b.sim.attackEntity(e);
            c.lastSwing = tick;
        }
        return true;
    }
    /** A few logs off the nearest trunk, walking over each drop as it falls. */
    forageTree(tick, c) {
        const b = this.bot;
        if (c.walk) {
            if (distance(center(c.walk), b.sim.location) > 1.0) {
                const r = b.navTo(c.walk, tick, 1);
                if (r === "failed" || r === "blocked") {
                    b.nav.reset();
                    b.nav.stuck = false;
                    b.drops.pushToward(center(c.walk));
                }
            }
            else
                c.walk = undefined;
            if (!c.walk && c.got >= 4) {
                this.chore = undefined;
                return false;
            }
            return true;
        }
        if (c.breaking) {
            const blk = b.terrain.block(c.cell);
            if (blk && /(_log|_wood)$/.test(blk.typeId) && tick - c.breaking < 100)
                return true; // swing in flight
            if (blk && /(_log|_wood)$/.test(blk.typeId)) {
                // Stubborn trunk (tool too weak for this wood): move on.
                this.chore = undefined;
                return false;
            }
            c.breaking = 0;
            c.got++;
            b.record("forage:log");
            c.walk = c.cell;
            c.cell = undefined;
            return true;
        }
        if (c.cell) {
            const blk = b.terrain.block(c.cell);
            if (!blk || !/(_log|_wood)$/.test(blk.typeId))
                c.cell = undefined;
        }
        if (!c.cell) {
            const scan = new BlockScan(b.sim.location, 8);
            c.cell = scan.next(b.terrain, (type, p) =>
                /(_log|_wood)$/.test(type) &&
                [...CARDINAL, UP].some((d) => b.terrain.block(add(p, d))?.isAir));
            if (!c.cell) {
                this.chore = undefined;
                return false;
            }
        }
        const at = add(c.cell, { x: 0.5, y: 0.5, z: 0.5 });
        if (distance(b.sim.getHeadLocation(), center(c.cell)) > 4.0 ||
            !b.terrain.line(b.sim.getHeadLocation(), at, c.cell)) {
            const r = b.navTo(c.cell, tick, 2);
            if (r === "failed" || r === "blocked") {
                b.nav.reset();
                this.chore = undefined;
            }
            b.reason = "Walking to a nearby tree.";
            return true;
        }
        b.nav.reset();
        b.reason = "Grabbing logs from a nearby tree.";
        if (!b.bag.tool("axe"))
            b.bag.emptyHand();
        try {
            b.sim.lookAtBlock(b.host.relative(c.cell));
            if (b.sim.breakBlock(b.host.relative(c.cell)))
                c.breaking = tick;
            else
                c.cell = undefined; // cannot open it from here; pick another cell
        } catch {
            c.cell = undefined;
        }
        return true;
    }
}

// ---------------------------------------------------------------- exploration.js

/** Bounded frontier wandering. Does not pretend to know structures in unloaded chunks. */
export class Explorer {
    constructor() {
        this.visits = new Map();
        this.blocked = new Map();
        this.since = 0;
        this.turns = 0;
        this.trips = 0;
        this.heading = undefined;
    }
    reset() {
        this.goal = undefined;
    }
    step(position, home, tick, terrain, nav, range = 256) {
        if (this.goal && distance(this.goal, home) > range) {
            nav.reset();
            this.goal = undefined;
            this.heading = undefined;
        }
        if (this.goal) {
            const result = nav.go(this.goal, tick);
            if (result === "running" && tick - this.since < 500)
                return "running";
            const k = key(this.goal);
            const v = this.visits.get(k);
            if (v) v.n++;
            else this.visits.set(k, { x: this.goal.x, y: this.goal.y, z: this.goal.z, n: 1 });
            if (result !== "done") {
                this.blocked.set(k, tick + 600);
                this.heading = undefined;
            }
            this.goal = undefined;
            this.trips++;
            nav.reset();
            return "arrived";
        }
        const origin = floor(position), options = [];
        this.turns++;
        for (let dir = 0; dir < 8; dir++)
            for (const radius of [20, 14]) {
                const angle = (dir * Math.PI) / 4;
                const x = Math.round(Math.cos(angle) * radius), z = Math.round(Math.sin(angle) * radius);
                for (const y of [0, 1, -1, 2, -2, 3, -3, 4, -4]) {
                    const p = add(origin, { x, y, z });
                    if (distance(p, home) > range ||
                        (this.blocked.get(key(p)) ?? 0) > tick ||
                        !terrain.safe(p))
                        continue;
                    let penalty = 0;
                    for (const v of this.visits.values()) {
                        if (distance(p, v) < 16)
                            penalty += v.n * 40;
                    }
                    let turnDiff = 0;
                    if (this.heading !== undefined) {
                        const raw = Math.abs(dir - this.heading);
                        turnDiff = Math.min(raw, 8 - raw);
                    }
                    options.push({
                        p,
                        dir,
                        score: penalty +
                            turnDiff * 6 +
                            Math.abs(y) * 2 +
                            (20 - radius),
                    });
                    break;
                }
            }
        options.sort((a, b) => a.score - b.score);
        if (!options.length) {
            this.heading = undefined;
            return "blocked";
        }
        this.goal = options[0].p;
        this.heading = options[0].dir;
        this.since = tick;
        if (this.visits.size > 96)
            this.visits.delete(this.visits.keys().next().value);
        if (this.blocked.size > 96)
            this.blocked.delete(this.blocked.keys().next().value);
        return "running";
    }
}
