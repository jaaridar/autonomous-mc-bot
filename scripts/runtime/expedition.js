/**
 * Expedition director — the bot decides on its own when to go to the Nether.
 *
 * Before this existed the only way to reach the Nether was `!bot nether` or the
 * speedrun chain: a survival bot would happily mine forever. This director:
 *
 *   1. waits until the readiness model says the trip is safe
 *      (`core/expedition.js`),
 *   2. provisions the one thing that is blocking it when that thing is cheap
 *      and local (food, a pickaxe, flint and steel), by delegating to the
 *      existing obtain/eat paths — it never duplicates their logic,
 *   3. starts real travel, which owns the tick and performs portal
 *      build/light/enter/link itself,
 *   4. afterwards records the loot and backs off for a cooldown, so two trips
 *      never stack and the bot does not ping-pong between dimensions.
 *
 * It is a *director*: it returns true only when it actually did something this
 * tick, so every emergency above it (combat, lava, drowning, eating) still wins.
 */
import { floor, distance } from "../core/math.js";
import { OVERWORLD, NETHER } from "../core/portal.js";
import { assessExpedition, provisionStep, EXPEDITION, pickaxeTier, foodCount } from "../core/expedition.js";
import { planEngagement } from "../core/combat-plan.js";

const CADENCE = 40;
const RETRY_AFTER_FAILURE = 400;

export class ExpeditionDirector {
    constructor(bot) {
        this.bot = bot;
        this.lastAssess = 0;
        this.nextAt = 0;
        this.assessment = undefined;
        this.provisions = 0;
        this.lastProvision = "";
        this.trips = 0;
        this.lastTrip = 0;
        this.lastLoot = 0;
        this.failures = 0;
        this.suppressedUntil = 0;
        this.wasTravelling = false;
        this.reason = "waiting";
    }

    reset(tick = 0) {
        this.lastAssess = tick;
        this.assessment = undefined;
        this.reason = "waiting";
    }

    /** Is this a mode that should be allowed to wander into another dimension? */
    get eligibleMode() {
        return ["survival", "speedrun"].includes(this.bot.mode);
    }

    get enabled() {
        return this.bot.settings?.autoNether !== false;
    }

    buildContext(tick) {
        const bot = this.bot;
        const counts = bot.bag.counts();
        const health = bot.sim.getComponent("minecraft:health");
        const hp = health?.currentValue ?? 20;
        const maxHp = health?.effectiveMax ?? health?.defaultValue ?? 20;
        let hostile = 0;
        try {
            const info = bot.terrain.threatInfo(bot.sim, bot.owner?.());
            hostile = (info.list ?? []).filter((e) => distance(e.location, bot.sim.location) <= EXPEDITION.hostileRadius).length;
        } catch { hostile = 0; }
        let portalKnown = false;
        try {
            const spot = bot.memory?.nearest?.("portal", bot.sim.dimension.id, bot.sim.location);
            portalKnown = !!spot;
        } catch { portalKnown = false; }
        return {
            counts,
            health: hp,
            maxHealth: maxHp,
            food: foodCount(counts),
            dimension: bot.sim.dimension.id,
            travelActive: !!bot.travel?.active,
            travelReadyAt: Math.max(this.nextAt, this.suppressedUntil),
            tick,
            hostiles: hostile,
            inWater: !!bot.sim.isInWater,
            inLava: /lava/.test(bot.terrain.typeAt(floor(bot.sim.location)) ?? ""),
            onFire: !!bot.sim.isOnFire,
            falling: bot.sim.isOnGround === false && (bot.survivalMaster?.fallStartY ?? null) !== null,
            portalKnown,
            allowNether: this.enabled,
            mode: bot.mode,
            pickaxeTier: pickaxeTier(counts),
        };
    }

    tick(tick) {
        const bot = this.bot;
        // A trip that just finished: record what it was worth, then rest.
        const travelling = !!bot.travel?.active;
        if (this.wasTravelling && !travelling) {
            this.wasTravelling = false;
            if (bot.travel?.state === "done" || bot.travel?.state === "idle") {
                this.trips++;
                this.lastTrip = tick;
                this.nextAt = tick + EXPEDITION.travelCooldown;
                this.reason = "trip finished; resting before the next one";
            } else if (bot.travel?.state === "failed") {
                this.failures++;
                this.suppressedUntil = tick + RETRY_AFTER_FAILURE;
                this.reason = `trip failed (${bot.travel?.lastReason ?? "unknown"}); retrying later`;
                bot.record?.(`Expedition: ${this.reason}`);
            }
        }
        this.wasTravelling = travelling;
        if (travelling) return false;

        if (tick - this.lastAssess < CADENCE) return false;
        this.lastAssess = tick;
        if (!this.enabled) { this.reason = "autonomous Nether travel is off"; return false; }
        if (!this.eligibleMode) { this.reason = `mode ${bot.mode} does not leave the Overworld on its own`; return false; }
        if (bot.sim.dimension.id !== OVERWORLD) return false;
        if (bot.paused || bot.blocked) return false;
        if (bot.mining || bot.deepMiner?.active) {
            // Never abandon a shaft mid-way: the bot is already making progress.
            this.reason = "finishing the current mining task first";
            return false;
        }

        const ctx = this.buildContext(tick);
        const assessment = assessExpedition(ctx);
        this.assessment = assessment;

        if (!assessment.ready) {
            this.reason = assessment.reason;
            // Provision only the cheap, local blockers; the risky ones (obsidian,
            // combat, health) are left to the directors that own them.
            const step = provisionStep(assessment);
            if (step && this.maybeProvision(step, ctx, tick)) return true;
            return false;
        }

        // Final safety gate: never walk away from a fight or with a lethal threat.
        if (this.unsafeToLeave(tick)) return false;

        const result = bot.travelTo(NETHER, floor(bot.sim.location), tick);
        if (result === "started") {
            this.reason = "leaving for the Nether";
            this.wasTravelling = true;
            bot.record?.("Expedition: heading to the Nether on my own");
            bot.tell?.("Heading to the Nether on my own - portal, transit and return are handled.");
            return true;
        }
        this.reason = `travel did not start: ${result}`;
        this.suppressedUntil = tick + RETRY_AFTER_FAILURE;
        return false;
    }

    /**
     * Do one cheap step toward readiness. Returns true only if an action was
     * actually issued this tick.
     */
    maybeProvision(step, ctx, tick) {
        const bot = this.bot;
        if (bot.paused || !bot.settings?.assistedCrafting && step.action === "craft") return false;
        if (step.action === "eat") {
            if (!bot.bag.hasFood()) return false;
            if (tick - this.lastAssess < CADENCE) return false;
            try { bot.eat(tick); } catch { return false; }
            this.note(step);
            return true;
        }
        if (step.action === "craft") {
            // Only craft things that come from materials we already hold; the
            // normal obtain() path does the dependency work.
            try {
                bot.obtain(step.item, 1, tick);
                this.note(step);
                return true;
            } catch {
                return false;
            }
        }
        if (step.action === "bucket") {
            if (tick < this.suppressedUntil) return false;
            try {
                bot.obtain("minecraft:bucket", 1, tick);
                this.note(step);
                return true;
            } catch {
                return false;
            }
        }
        return false;
    }

    note(step) {
        this.provisions++;
        this.lastProvision = `${step.action}:${step.item ?? ""}`;
        this.bot.reason = `Expedition prep: ${step.why}`;
    }

    /** Losing a fight, low health, or a creeper nearby means "not now". */
    unsafeToLeave(tick) {
        const bot = this.bot;
        let threats = [];
        try { threats = bot.terrain.threatInfo(bot.sim, bot.owner?.()).list ?? []; } catch { threats = []; }
        if (!threats.length) return false;
        const hp = bot.sim.getComponent("minecraft:health")?.currentValue ?? 20;
        let plan;
        try {
            plan = planEngagement(threats, {
                hp,
                maxHp: bot.sim.getComponent("minecraft:health")?.effectiveMax ?? 20,
                armor: bot.combat?.estimateArmor?.() ?? 0,
                botPos: bot.sim.location,
                has: {
                    weapon: !!bot.equipment?.hasWeapon?.(),
                    shield: bot.bag.find((s) => s.typeId === "minecraft:shield") >= 0,
                    blocks: bot.builder?.canBuild,
                    food: bot.bag.hasFood(),
                },
            });
        } catch { plan = undefined; }
        if (plan && (plan.action === "retreat" || plan.action === "flee")) {
            this.reason = `postponing the trip: ${plan.reason}`;
            return true;
        }
        return threats.some((e) => distance(e.location, bot.sim.location) <= 6);
    }

    report() {
        return {
            enabled: this.enabled,
            ready: this.assessment?.ready ?? false,
            score: this.assessment?.score,
            reason: this.reason,
            blockers: (this.assessment?.blockers ?? []).slice(0, 4).map((b) => b.why),
            plan: this.assessment?.plan ?? [],
            trips: this.trips,
            provisions: this.provisions,
            failures: this.failures,
            nextTripIn: Math.max(0, Math.ceil((Math.max(this.nextAt, this.suppressedUntil) - this.lastAssess) / 20)),
        };
    }
}
