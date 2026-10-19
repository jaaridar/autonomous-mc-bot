// One module now: core/arbiter.js + core/recovery.js (see docs/ARCHITECTURE.md).


// ---------------------------------------------------------------- arbiter.js

/**
 * Arbiter - replaces 430-line chain of if (director.tick()) return;
 * Keeps current behavior until it finishes or something clearly better appears
 * Every action returns reason code for failure, shared record of what has failed
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
    INTERRUPTED: "interrupted"
};

/**
 * Sentinel director for behaviours that the bot's main loop runs itself
 * (missions, combat, escape). The arbiter only *selects* them; it must not
 * tick them. The old adapters called `bot.follow(tick)` / `combat.tick(tick)`
 * / `escaper.tick(tick)` with the wrong arguments or on methods that do not
 * exist: follow() got a number as its goal and reset the navigator, combat
 * saw no target and reset the navigator, escape threw - every 5 ticks, each
 * followed by a second full evaluate(). That forced a fresh A* replan
 * several times a second and was the single largest source of lag.
 */
export const DEFERRED = "deferred";
const deferTo = (reason) => ({ tick: () => DEFERRED, reason, deferred: true });

export class FailureRecord {
    constructor() {
        this.map = new Map(); // id -> {count, lastTick, lastReason, lastPos}
    }

    record(id, tick, reason, pos) {
        const existing = this.map.get(id) || { count: 0, lastTick: 0, lastReason: "", positions: [] };
        existing.count++;
        existing.lastTick = tick;
        existing.lastReason = reason;
        if (pos) {
            existing.positions.push({ ...pos, tick });
            if (existing.positions.length > 5) existing.positions.shift();
        }
        this.map.set(id, existing);
    }

    getFailCount(id) {
        return this.map.get(id)?.count || 0;
    }

    shouldAvoid(id, tick, cooldown = 200) {
        const rec = this.map.get(id);
        if (!rec) return false;
        if (rec.count >= 5) return true; // avoid after 5 fails
        if (tick - rec.lastTick < cooldown) return true;
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
        this.current = null; // {id, director, priority, startedTick, reason}
        this.failures = new FailureRecord();
        this.lastEvaluate = 0;
        this.evaluations = [];
    }

    reset() {
        this.current = null;
        this.failures = new FailureRecord();
        this.evaluations = [];
    }

    // Evaluate all directors and return scored list
    evaluate(tick) {
        const bot = this.bot;
        const candidates = [];
        const owner = bot.owner();
        const hp = bot.sim.getComponent("minecraft:health")?.currentValue ?? 20;
        const hunger = bot.sim.getComponent("minecraft:player.hunger")?.currentValue ?? 20;
        const inWater = bot.sim.isInWater;
        const threatInfo = (() => {
            try { return bot.terrain.threatInfo(bot.sim, owner); } 
            catch (e) { console.warn("[Verdant] threatInfo failed "+e); return { count: 0, nearest: null, closest: Infinity }; }
        })();

        // Survival master - highest priority if danger
        try {
            const fallRisk = bot.survivalMaster?.fallStartY !== null;
            const score = (() => {
                if (fallRisk) return 100;
                if (threatInfo.count >= 3) return 95;
                if (hp <= 6) return 90;
                if (inWater && bot.terrain.headInWater(bot.sim)) return 98;
                return 0;
            })();
            if (score > 0) {
                candidates.push({
                    id: "survival_master",
                    director: bot.survivalMaster,
                    score,
                    reason: `danger: fall=${fallRisk} threats=${threatInfo.count} hp=${hp}`,
                    tags: ["survival", "essential"]
                });
            }
        } catch (e) { console.warn("[Verdant] survival eval "+e); }

        // Food - if low
        try {
            if (hunger <= 6 || (hunger <= 12 && threatInfo.count === 0)) {
                candidates.push({
                    id: "food",
                    director: bot.food,
                    score: hunger <= 4 ? 92 : 70,
                    reason: `hunger ${hunger}`,
                    tags: ["survival", "food"]
                });
            }
        } catch (e) { console.warn("[Verdant] food eval "+e); }

        // Combat - if threat and not fleeing
        try {
            if (threatInfo.nearest && hp > 8) {
                const score = threatInfo.count >= 2 ? 85 : 75;
                candidates.push({
                    id: "combat",
                    director: deferTo("combat runs in the main loop"),
                    score,
                    reason: `threat ${threatInfo.nearest.typeId} count ${threatInfo.count}`,
                    tags: ["combat"]
                });
            }
        } catch (e) { console.warn("[Verdant] combat eval "+e); }

        // Escape - water, trapped
        try {
            const below = bot.terrain.read({ x: Math.floor(bot.sim.location.x), y: Math.floor(bot.sim.location.y)-1, z: Math.floor(bot.sim.location.z) });
            const escapeNeeded = inWater || below?.hazard || bot.nav.stuck;
            if (escapeNeeded) {
                candidates.push({
                    id: "escape",
                    director: deferTo("escape runs in the main loop"),
                    score: inWater ? 88 : 80,
                    reason: `escape needed: inWater=${inWater} hazard=${below?.hazard} stuck=${bot.nav.stuck}`,
                    tags: ["survival"]
                });
            }
        } catch (e) { console.warn("[Verdant] escape eval "+e); }

        // Current mission - follow, goto, mine, survival, etc
        try {
            const mode = bot.mode;
            if (mode && mode !== "idle") {
                let score = 50;
                if (mode === "follow" && owner) {
                    try { 
                        const d = Math.hypot(bot.sim.location.x - owner.location.x, bot.sim.location.z - owner.location.z);
                        score = d > 12 ? 80 : 60;
                    } catch {}
                } else if (mode === "mine") {
                    score = 65;
                } else if (mode === "survival" || mode === "starter") {
                    score = 60;
                } else if (mode === "speedrun") {
                    score = 70;
                }
                // Boost if current behavior is same - keep current until finishes or clearly better appears
                if (this.current && this.current.id === mode) {
                    score += 10; // stickiness
                }
                candidates.push({
                    id: mode,
                    director: deferTo(`mission ${mode} runs in the main loop`),
                    score,
                    reason: `mission ${mode}`,
                    tags: ["mission"]
                });
            }
        } catch (e) { console.warn("[Verdant] mission eval "+e); }

        // Looting - single implementation via Looting director, not 3 times
        try {
            if (bot.settings.loot && !bot.miner.active && !bot.deepMiner.active) {
                const lootScore = bot.looting?.evaluate ? bot.looting.evaluate(tick) : 0;
                if (lootScore > 30) {
                    candidates.push({
                        id: "looting",
                        director: bot.looting,
                        score: lootScore,
                        reason: "nearby valuable chest/loot - single looting implementation",
                        tags: ["resource", "optional"]
                    });
                }
            }
        } catch (e) { console.warn("[Verdant] looting eval "+e); }

        // Village - prioritized when basic resources are acquired or village is detected nearby
        try {
            if (bot.village && (bot.mode === "survival" || bot.mode === "starter" || bot.mode === "speedrun" || bot.mode === "idle")) {
                const villageScore = (() => {
                    try {
                        const stock = bot.bag ? bot.bag.counts() : {};
                        const hasBasicGear = ((stock["#logs"] ?? 0) > 0 || (stock["#planks"] ?? 0) > 0) &&
                                             (bot.bag?.tool("pickaxe", 1) || bot.bag?.tool("sword", 1) || (stock["minecraft:cobblestone"] ?? 0) >= 3);
                        const hasVillageSpot = (bot.awareness?.villageSpots?.length > 0) ||
                                              (bot.structures?.found?.some(f => f.name === "village")) ||
                                              !!bot.village.findNearestVillage(128);
                        const top = bot.structures?.getTopPriority();
                        if (top && top.name === "village" && top.priority >= 60) return top.priority;
                        if (hasVillageSpot) {
                            if (hunger <= 14) return 92; // Food needed, village has hay bales and food
                            if (hasBasicGear) return 82; // Acquired relevant resources -> head to village to loot!
                            return 75;
                        }
                        if (hunger <= 8) return 75;
                        return 0;
                    } catch { return 0; }
                })();
                if (villageScore > 0) {
                    candidates.push({
                        id: "village",
                        director: bot.village,
                        score: villageScore,
                        reason: `village priority ${villageScore} - looting stores and gathering supplies`,
                        tags: ["resource", "exploration", "essential"]
                    });
                }
            }
        } catch (e) { console.warn("[Verdant] village eval "+e); }

        // Nether - single planner via NetherDirector, Speedrun delegates
        try {
            if (bot.nether && bot.settings.speedrun !== false && (bot.mode === "survival" || bot.mode === "starter" || bot.mode === "speedrun" || bot.mode === "idle")) {
                const netherScore = bot.nether.currentRoute ? 80 : 60;
                candidates.push({
                    id: "nether",
                    director: bot.nether,
                    score: netherScore,
                    reason: `nether route ${bot.nether.currentRoute?.route ?? "none"} - merged speedrun into nether`,
                    tags: ["progression", "essential"]
                });
            }
        } catch (e) { console.warn("[Verdant] nether eval "+e); }

        // Sort by score descending
        candidates.sort((a,b) => b.score - a.score);
        this.evaluations = candidates;
        this.lastEvaluate = tick;
        return candidates;
    }

    // Should interrupt current for new candidate?
    shouldInterrupt(current, candidate, tick) {
        if (!current) return true;
        if (!candidate) return false;
        // If current is survival/escape and still valid, keep it
        if (current.tags?.includes("survival") && current.score >= 80) {
            // Only interrupt survival if even higher survival score appears
            if (candidate.tags?.includes("survival") && candidate.score > current.score + 10) return true;
            return false;
        }
        // If candidate score is clearly better (15+ points), interrupt
        if (candidate.score > current.score + 15) return true;
        // If current failed recently, interrupt
        if (this.failures.getFailCount(current.id) >= 3) return true;
        // If current timed out (5 min)
        if (tick - current.startedTick > 6000) return true;
        return false;
    }

    // Main tick - returns action result with reason code
    tick(tick) {
        try {
            // Re-evaluate every 20 ticks or if no current
            if (!this.current || tick - this.lastEvaluate > 20) {
                const candidates = this.evaluate(tick);
                const best = candidates[0];
                if (!best) {
                    return { code: REASON_CODES.NO_TARGET, reason: "No candidate behaviors", score: 0 };
                }
                if (this.shouldInterrupt(this.current, best, tick)) {
                    if (this.current) {
                        this.bot.record(`Arbiter interrupt: ${this.current.id} (${this.current.score}) -> ${best.id} (${best.score}) reason: ${best.reason}`);
                    }
                    this.current = {
                        id: best.id,
                        director: best.director,
                        score: best.score,
                        startedTick: tick,
                        reason: best.reason,
                        tags: best.tags
                    };
                }
            }

            if (!this.current) {
                return { code: REASON_CODES.NO_TARGET, reason: "No current behavior" };
            }

            // Tick current director
            let result;
            const cur = this.current;
            try {
                result = cur.director?.tick ? cur.director.tick(tick) : DEFERRED;
            } catch (e) {
                // Rate-limited: a throwing director used to log on every tick.
                const n = this.failures.getFailCount(cur.id);
                if (n === 0 || n % 50 === 0) console.warn(`[Verdant] director ${cur.id} threw ${e}`);
                this.failures.record(cur.id, tick, String(e).slice(0,200), this.bot.sim.location);
                this.current = null;
                return { code: REASON_CODES.FAILED, reason: `Director ${cur.id} threw: ${e}`, error: e };
            }

            if (result === DEFERRED) {
                return { code: DEFERRED, reason: cur.reason, id: cur.id };
            }
            // Interpret result - directors return true if handled, false if not, or reason codes
            if (result === true) {
                return { code: REASON_CODES.RUNNING, reason: cur.director.reason || cur.reason, id: cur.id };
            } else if (result === false) {
                // Nothing to do this tick (most directors self-throttle and
                // return false between assessments). Fall back to the next
                // candidate from the evaluation we already have instead of
                // running a second full evaluate() (entity query + scans).
                const next = this.evaluations.find(c => c.id !== cur.id);
                if (next) {
                    this.current = {
                        id: next.id,
                        director: next.director,
                        score: next.score,
                        startedTick: tick,
                        reason: next.reason,
                        tags: next.tags
                    };
                    return { code: REASON_CODES.NO_TARGET, reason: `Fallback to ${next.id}: ${next.reason}`, id: next.id };
                }
                return { code: REASON_CODES.NO_TARGET, reason: `No handler for ${cur.id}` };
            } else {
                // Assume running
                return { code: REASON_CODES.RUNNING, reason: cur.reason, id: cur.id };
            }
        } catch (e) {
            console.warn("[Verdant] Arbiter tick failed "+e);
            return { code: REASON_CODES.FAILED, reason: `Arbiter failed: ${e}`, error: e };
        }
    }

    status() {
        return {
            current: this.current ? { id: this.current.id, score: this.current.score, startedTick: this.current.startedTick, reason: this.current.reason } : null,
            evaluations: this.evaluations.map(e => ({ id: e.id, score: e.score, reason: e.reason })),
            failures: this.failures.summary()
        };
    }
}

// ---------------------------------------------------------------- recovery.js

export class TaskFault extends Error {
    constructor(message, recovery = "manual") {
        super(message);
        this.recovery = recovery;
        this.name = "TaskFault";
    }
}
const MANY_RETRIES = 5;
export function blockedTask(reason, recovery, attempt, tick) {
    // Bounded backoff, but never a dead end: retry blocks keep coming back (delay capped at about a minute).
    // Only explicitly manual blocks (owner hold / equipment faults) wait for the owner.
    const delay = Math.min(40 * 2 ** Math.max(0, attempt - 1), 1200);
    // "retry-bounded" marks an UNEXPECTED error (a throw that was not a TaskFault):
    // mostly engine hiccups, far more often than real bugs. It rides the same
    // backoff ladder so the task self-recovers with no command, but after
    // MANY_RETRIES consecutive failures without progress it hands over to the
    // owner honestly instead of re-running the same throw forever.
    const bounded = recovery === "retry-bounded";
    const capped = bounded && attempt > MANY_RETRIES;
    const retrying = (recovery === "retry" || bounded) && !capped;
    return {
        reason,
        recovery: retrying ? "retry" : "manual",
        attempt,
        since: tick,
        retryAt: retrying ? tick + delay : undefined,
        capped,
    };
}
