/**
 * Arbiter - decides which *job* owns the bot.
 *
 * Two layers, and they must not be mixed up:
 *
 *   1. OWNER layer (core/state-machine.js): body services - escape, survive,
 *      combat, retreat, eat, unstuck - can pre-empt anything, instantly for an
 *      emergency. Those are per-tick reflexes and live in Bot.think().
 *
 *   2. JOB layer (this file): the long-running work - missions, progression
 *      (nether, village), resource gathering (looting), deep mining. A job
 *      should be kept until it finishes or a clearly better job appears.
 *
 * The old file tried to do both and got both wrong:
 *   - `nether` was pushed unconditionally whenever the mode was survival /
 *     starter / speedrun / idle (score 60!), so it outranked the actual mission
 *     every time and the bot wandered off to look for gravel instead of doing
 *     what it was told;
 *   - `village` was pushed on `hunger <= 8` even with no village discovered;
 *   - `looting` called `bot.looting.evaluate()` which never existed - the whole
 *     branch threw and was swallowed, so looting never ran;
 *   - `deferTo()` jobs returned `deferred` and were re-picked from a *stale*
 *     evaluation list, so the bot could be "owned" by a job nobody was running.
 *
 * Rules used here:
 *   - a job is only a candidate when its PRECONDITIONS hold (capability gate),
 *   - mission and job are mutually exclusive: an explicit command outranks
 *     self-directed progression unless the progression is an emergency,
 *   - hysteresis: keep the current job until it finishes/fails or a challenger
 *     wins by `margin`,
 *   - failures are recorded and back off exponentially, so a job that cannot
 *     progress stops being re-picked every 20 ticks (the "stuck in a loop"
 *     symptom).
 */

export const REASON_CODES = {
    SUCCESS: "success",
    RUNNING: "running",
    FAILED: "failed",
    BLOCKED: "blocked",
    NO_TARGET: "no_target",
    NO_TOOL: "no_tool",
    NO_BLOCKS: "no_blocks",
    NO_FOOD: "no_food",
    IN_WATER: "in_water",
    THREAT_NEAR: "threat_near",
    LOW_HEALTH: "low_health",
    INVENTORY_FULL: "inventory_full",
    PATH_FAILED: "path_failed",
    BREAK_FAILED: "break_failed",
    PLACE_FAILED: "place_failed",
    TIMEOUT: "timeout",
    INTERRUPTED: "interrupted",
};

/**
 * Sentinel director for behaviours the main loop runs itself (missions, combat,
 * escape). The arbiter only *selects* them; it must not tick them. The old
 * adapters called `bot.follow(tick)` / `combat.tick(tick)` / `escaper.tick(tick)`
 * with the wrong arguments or on methods that do not exist: follow() got a
 * number as its goal and reset the navigator, combat saw no target and reset the
 * navigator, escape threw - every 5 ticks, each followed by a second full
 * evaluate(). That forced a fresh A* replan several times a second and was the
 * single largest source of lag.
 */
export const DEFERRED = "deferred";
const deferTo = (reason) => ({ tick: () => DEFERRED, reason, deferred: true });

const FACTIONS = Object.freeze({ MISSION: "mission", PROGRESSION: "progression", RESOURCE: "resource" });

export class FailureRecord {
    constructor() {
        this.map = new Map(); // id -> {count, lastTick, lastReason, lastPos, penalty}
    }

    record(id, tick, reason, pos) {
        const e = this.map.get(id) || { count: 0, lastTick: 0, lastReason: "", positions: [], penalty: 0 };
        e.count++;
        e.lastTick = tick;
        e.lastReason = reason;
        if (pos) {
            e.positions.push({ ...pos, tick });
            if (e.positions.length > 5) e.positions.shift();
        }
        this.map.set(id, e);
    }

    getFailCount(id) {
        return this.map.get(id)?.count || 0;
    }

    /** Exponential back-off (in ticks) after repeated failures, capped at 5 minutes. */
    penalty(id) {
        const e = this.map.get(id);
        if (!e) return 0;
        return Math.min(6000, 200 * 2 ** Math.min(e.count - 1, 5));
    }

    shouldAvoid(id, tick, cooldown = 200) {
        const rec = this.map.get(id);
        if (!rec) return false;
        if (tick - rec.lastTick < Math.max(cooldown, this.penalty(id))) return true;
        return false;
    }

    getReason(id) {
        return this.map.get(id)?.lastReason || "";
    }

    clear(id) {
        this.map.delete(id);
    }

    summary() {
        const out = {};
        for (const [id, data] of this.map) {
            out[id] = { count: data.count, lastReason: data.lastReason, lastTick: data.lastTick };
        }
        return out;
    }
}

export class Arbiter {
    constructor(bot) {
        this.bot = bot;
        this.current = null; // {id, director, score, priority, startedTick, reason, tags, faction}
        this.failures = new FailureRecord();
        this.lastEvaluate = 0;
        this.evaluations = [];
        this.margin = 15;
    }

    reset() {
        this.current = null;
        this.failures = new FailureRecord();
        this.evaluations = [];
    }

    // ---------------------------------------------------------------- helpers
    counts() {
        try { return this.bot.bag?.counts() ?? {}; } catch { return {}; }
    }

    /** True when an explicit command/state makes self-directed work wrong. */
    missionCommanded() {
        const b = this.bot;
        if (!b.mode) return false;
        return b.mode !== "idle" && b.mode !== "survival" && b.mode !== "starter";
    }

    push(candidates, c) {
        try {
            const d = c.director;
            // capability gate: a job with no director, or one that threw while
            // being asked, is not a candidate at all.
            if (c.job && (!d || typeof d.tick !== "function")) return;
            candidates.push(c);
        } catch { /* ignore a partially built candidate */ }
    }

    // --------------------------------------------------------------- evaluate
    evaluate(tick) {
        const bot = this.bot;
        const candidates = [];
        const owner = bot.owner?.();
        const hp = bot.sim.getComponent("minecraft:health")?.currentValue ?? 20;
        const hunger = bot.sim.getComponent("minecraft:player.hunger")?.currentValue ?? 20;
        const inWater = !!bot.sim.isInWater;
        const counts = this.counts();
        const threatInfo = (() => {
            try { return bot.terrain.threatInfo(bot.sim, owner); }
            catch { return { count: 0, nearest: null, closest: Infinity, ranged: 0, explosive: 0 }; }
        })();
        const depth = typeof bot.sim.location?.y === "number" ? bot.sim.location.y : 64;

        // 1) Body emergencies: preserve the old scores the perf tests rely on.
        try {
            const fallRisk = bot.survivalMaster?.fallStartY != null;
            const drowning = inWater && (() => { try { return bot.terrain.headInWater(bot.sim); } catch { return false; } })();
            const score = fallRisk ? 100 : drowning ? 98 : threatInfo.count >= 3 ? 95 : hp <= 6 ? 90 : 0;
            if (score > 0) {
                this.push(candidates, {
                    id: "survival_master", director: bot.survivalMaster, score,
                    reason: `danger: fall=${fallRisk} threats=${threatInfo.count} hp=${hp}`,
                    tags: ["survival", "essential"], faction: FACTIONS.MISSION, job: true,
                });
            }
        } catch { /* survival master not wired: skip */ }

        try {
            if (hunger <= 6 || (hunger <= 12 && threatInfo.count === 0)) {
                this.push(candidates, {
                    id: "food", director: bot.food, score: hunger <= 4 ? 92 : 70,
                    reason: `hunger ${hunger}`, tags: ["survival", "food"], faction: FACTIONS.MISSION, job: true,
                });
            }
        } catch { /* skip */ }

        try {
            if (threatInfo.nearest && hp > 8) {
                this.push(candidates, {
                    id: "combat", director: deferTo("combat runs in the main loop"),
                    score: threatInfo.count >= 2 ? 85 : 75,
                    reason: `threat ${threatInfo.nearest.typeId} count ${threatInfo.count}`,
                    tags: ["combat"], faction: FACTIONS.MISSION, job: false,
                });
            }
        } catch { /* skip */ }

        try {
            const below = bot.terrain.read({
                x: Math.floor(bot.sim.location.x), y: Math.floor(bot.sim.location.y) - 1, z: Math.floor(bot.sim.location.z),
            });
            const escapeNeeded = inWater || below?.hazard || bot.nav.stuck;
            if (escapeNeeded) {
                this.push(candidates, {
                    id: "escape", director: deferTo("escape runs in the main loop"),
                    score: inWater ? 88 : below?.hazard ? 86 : 80,
                    reason: `escape needed: inWater=${inWater} hazard=${below?.hazard} stuck=${bot.nav.stuck}`,
                    tags: ["survival"], faction: FACTIONS.MISSION, job: false,
                });
            }
        } catch { /* skip */ }

        // Track ids that already have a candidate, so the mode/phase entries
        // below never duplicate them (two candidates for one director means the
        // fallback path can pick the same director twice).
        const seen = new Set(candidates.map((c) => c.id));

        // 2) The commanded mission. An explicit command always outranks
        //    self-directed progression, otherwise the bot does the wrong job.
        const commanded = this.missionCommanded();
        try {
            const mode = bot.mode;
            if (mode && mode !== "idle" && !seen.has(mode)) {
                let score = 50;
                if (mode === "follow" && owner) {
                    try {
                        const d = Math.hypot(bot.sim.location.x - owner.location.x, bot.sim.location.z - owner.location.z);
                        score = d > 12 ? 80 : 60;
                    } catch { /* keep 50 */ }
                } else if (mode === "mine") score = 65;
                else if (mode === "survival" || mode === "starter") score = 60;
                else if (mode === "speedrun") score = 70;
                if (this.current && this.current.id === mode) score += 10; // stickiness
                if (commanded) score += 25; // explicit command: do not drift off it
                this.push(candidates, {
                    id: mode, director: deferTo(`mission ${mode} runs in the main loop`), score,
                    reason: `mission ${mode}`, tags: ["mission"], faction: FACTIONS.MISSION, job: false,
                });
            }
        } catch { /* skip */ }

        // 3) Progression / resource jobs. Every one of these is gated on a
        //    concrete precondition - "has the things the job needs" - not on the
        //    mode name. That is what stops nether/village from outranking the
        //    mission forever.
        const busyMining = !!(bot.mining || bot.miner?.active || bot.deepMiner?.active);
        // Owner in another dimension: no *new* self-directed dimension travel
        // (that is the unattended world mutation the old hard `return` was
        // trying to prevent). Survival jobs above still run.
        const travelBlocked = !!bot.ownerElsewhere;

        // Village: only when a village is actually known to the structures
        // tracker, or the bot is starving and one may be nearby.
        try {
            if (!seen.has("village") && !busyMining && !travelBlocked && bot.village && bot.settings?.loot !== false) {
                const top = (() => { try { return bot.structures?.getTopPriority(); } catch { return null; } })();
                const knownVillage = top && top.name === "village" && top.priority >= 60;
                const starvingNearby = hunger <= 8 && !!bot.structures?.village?.(128);
                const villageScore = knownVillage ? Math.min(85, top.priority) : starvingNearby ? 70 : 0;
                if (villageScore > 0) {
                    this.push(candidates, {
                        id: "village", director: bot.village, score: commanded ? 0 : villageScore,
                        reason: knownVillage ? `village discovered (priority ${top.priority})` : `hunger ${hunger}, village nearby`,
                        tags: ["resource", "exploration"], faction: FACTIONS.RESOURCE, job: true,
                    });
                }
            }
        } catch { /* skip */ }

        // Bucket / speedrun phases: these used to run as unconditional calls in
        // think(), outside the arbiter, so they could fire during a mining
        // mission. They are jobs now, gated on their own preconditions.
        try {
            if (!seen.has("bucket") && !busyMining && bot.bucket && !commanded && (bot.mode === "survival" || bot.mode === "starter" || bot.mode === "speedrun")) {
                const iron = counts["minecraft:iron_ingot"] ?? 0;
                const hasBucket = (counts["minecraft:bucket"] ?? 0) > 0 || (counts["minecraft:water_bucket"] ?? 0) > 0;
                if (!hasBucket && iron >= 3) {
                    this.push(candidates, {
                        id: "bucket", director: bot.bucket, score: 62, reason: `bucket milestone (iron ${iron})`,
                        tags: ["progression"], faction: FACTIONS.PROGRESSION, job: true,
                    });
                    seen.add("bucket");
                }
            }
        } catch { /* skip */ }
        try {
            if (!seen.has("speedrun") && !busyMining && !travelBlocked && bot.speedrun && bot.mode === "speedrun" && !commanded) {
                this.push(candidates, {
                    id: "speedrun", director: bot.speedrun, score: 68,
                    reason: `speedrun phase ${bot.speedrun.phase ?? "?"}`,
                    tags: ["mission"], faction: FACTIONS.MISSION, job: true,
                });
                seen.add("speedrun");
            }
        } catch { /* skip */ }

        // Nether: only when the route planner actually has something to act on
        // and the bot is in a progression mode. Never in an explicit mission.
        try {
            const route = bot.nether?.currentRoute ?? null;
            const progressing = bot.mode === "survival" || bot.mode === "starter" || bot.mode === "speedrun";
            if (!seen.has("nether") && !busyMining && !travelBlocked && bot.nether && progressing && !commanded && bot.settings?.nether !== false) {
                const ready = !!route || (hunger > 12 && hp > 12 && (counts["minecraft:iron_ingot"] ?? 0) >= 3);
                if (ready) {
                    this.push(candidates, {
                        id: "nether", director: bot.nether, score: route ? 72 : 55,
                        reason: `nether route ${route?.route ?? "none"} (iron ${counts["minecraft:iron_ingot"] ?? 0})`,
                        tags: ["progression"], faction: FACTIONS.PROGRESSION, job: true,
                    });
                }
            }
        } catch { /* skip */ }

        // Looting: real precondition (a chest in reach), real method name.
        try {
            if (!seen.has("looting") && !busyMining && bot.settings?.loot !== false && bot.looting && !commanded) {
                let loot = 0;
                try { loot = Number(bot.looting.priority?.(tick) ?? 0) || 0; } catch { loot = 0; }
                if (loot > 30) {
                    this.push(candidates, {
                        id: "looting", director: bot.looting, score: Math.min(90, loot),
                        reason: `loot worth ${Math.round(loot)} nearby`, tags: ["resource"], faction: FACTIONS.RESOURCE, job: true,
                    });
                }
            }
        } catch { /* skip */ }

        candidates.sort((a, b) => b.score - a.score);
        this.evaluations = candidates;
        this.lastEvaluate = tick;
        return candidates;
    }

    // Should an arbitrary candidate interrupt the current job?
    shouldInterrupt(current, candidate, tick) {
        if (!current) return true;
        if (!candidate) return false;
        // Emergency survival is kept unless a stronger survival job appears.
        if (current.tags?.includes("survival") && current.score >= 80) {
            return !!(candidate.tags?.includes("survival") && candidate.score > current.score + 10);
        }
        // A commanded mission is never interrupted by self-directed work.
        if (current.faction === FACTIONS.MISSION && candidate.faction !== FACTIONS.MISSION) {
            if (!candidate.tags?.includes("survival")) return false;
        }
        if (this.failures.shouldAvoid(current.id, tick)) return true;
        if (candidate.score > current.score + this.margin) return true;
        if (tick - current.startedTick > 6000) return true;
        return false;
    }

    // ------------------------------------------------------------------- tick
    tick(tick) {
        try {
            if (!this.current || tick - this.lastEvaluate > 20) {
                const candidates = this.evaluate(tick);
                const best = candidates[0];
                if (!best) return { code: REASON_CODES.NO_TARGET, reason: "No candidate behaviors", score: 0 };
                if (this.shouldInterrupt(this.current, best, tick)) {
                    if (this.current) {
                        this.bot.record?.(`Arbiter interrupt: ${this.current.id} (${this.current.score}) -> ${best.id} (${best.score}) reason: ${best.reason}`);
                    }
                    this.current = {
                        id: best.id, director: best.director, score: best.score, startedTick: tick,
                        reason: best.reason, tags: best.tags, faction: best.faction,
                    };
                }
            }

            if (!this.current) return { code: REASON_CODES.NO_TARGET, reason: "No current behavior" };

            const cur = this.current;
            let result;
            try {
                result = cur.director?.tick ? cur.director.tick(tick) : DEFERRED;
            } catch (e) {
                const n = this.failures.getFailCount(cur.id);
                if (n === 0 || n % 50 === 0) console.warn(`[Verdant] director ${cur.id} threw ${e}`);
                this.failures.record(cur.id, tick, String(e).slice(0, 200), this.bot.sim.location);
                this.current = null;
                return { code: REASON_CODES.FAILED, reason: `Director ${cur.id} threw: ${e}`, error: e };
            }

            if (result === DEFERRED || (result && result.deferred)) {
                return { code: DEFERRED, reason: cur.reason, id: cur.id };
            }
            if (result === true) {
                this.failures.clear(cur.id);
                return { code: REASON_CODES.RUNNING, reason: cur.director.reason || cur.reason, id: cur.id };
            }
            if (result === false) {
                // Nothing to do this tick (most directors self-throttle and
                // return false between assessments). Fall back to the next
                // candidate from the evaluation we already have instead of
                // running a second full evaluate() (entity query + scans).
                const next = this.evaluations.find((c) => c.id !== cur.id);
                if (next) {
                    this.current = {
                        id: next.id, director: next.director, score: next.score, startedTick: tick,
                        reason: next.reason, tags: next.tags, faction: next.faction,
                    };
                    return { code: REASON_CODES.NO_TARGET, reason: `Fallback to ${next.id}: ${next.reason}`, id: next.id };
                }
                return { code: REASON_CODES.NO_TARGET, reason: `No handler for ${cur.id}` };
            }
            return { code: REASON_CODES.RUNNING, reason: cur.reason, id: cur.id };
        } catch (e) {
            console.warn("[Verdant] Arbiter tick failed " + e);
            return { code: REASON_CODES.FAILED, reason: `Arbiter failed: ${e}`, error: e };
        }
    }

    /** The current job reported failure: back off and stop re-picking it. */
    fail(id, tick, reason = "") {
        this.failures.record(id, tick, reason, this.bot.sim?.location);
        if (this.current?.id === id) this.current = null;
    }

    status() {
        return {
            current: this.current
                ? { id: this.current.id, score: this.current.score, startedTick: this.current.startedTick, reason: this.current.reason }
                : null,
            evaluations: this.evaluations.map((e) => ({ id: e.id, score: e.score, reason: e.reason })),
            failures: this.failures.summary(),
        };
    }
}
