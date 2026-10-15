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

export class FailureRecord {
    constructor() {
        this.map = new Map(); // id -> {count, lastTick, lastReason, lastPos}
    }

    record(id, tick, reason, pos) {
        const existing = this.map.get(id) || { count: 0, lastTick: 0, lastReason: "", positions: [] };
        // Old failures decay: a director that last failed a minute ago starts fresh.
        if (tick - existing.lastTick > 1200) existing.count = 0;
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

/**
 * Stand-in for behaviours the bot's main loop already runs with the right
 * arguments (mission switch, escape branch, combat branch). The arbiter only
 * ranks them; ticking them here called bot.follow(tick)/bot.mine(tick)/
 * combat.tick(tick) with the wrong signatures, which reset navigation every
 * 5 ticks, threw (and logged) every tick, or reset combat movement.
 */
const DEFER = Object.freeze({ tick: () => "defer", deferred: true });
/** Directors that do real work when ticked here; a RUNNING result owns the tick. */
export const EXECUTING = new Set(["survival_master", "food", "village", "nether"]);

export class Arbiter {
    constructor(bot) {
        this.bot = bot;
        this.current = null; // {id, director, priority, startedTick, reason}
        this.failures = new FailureRecord();
        this.lastEvaluate = -100;
        this.evaluations = [];
        this.cooldown = new Map(); // id -> tick until which a declined director is not re-picked
    }

    reset() {
        this.current = null;
        this.failures = new FailureRecord();
        this.evaluations = [];
        this.cooldown.clear();
        this.lastEvaluate = -100;
    }

    cooling(id, tick) {
        const until = this.cooldown.get(id);
        return until !== undefined && tick < until;
    }

    // Evaluate all directors and return scored list
    evaluate(tick) {
        const bot = this.bot;
        const candidates = [];
        const owner = bot.owner();
        const hp = (bot.health ? bot.health() : bot.sim.getComponent("minecraft:health")?.currentValue) ?? 20;
        const hunger = (bot.hunger ? bot.hunger() : bot.sim.getComponent("minecraft:player.hunger")?.currentValue) ?? 20;
        const inWater = bot.inWater ? bot.inWater() : bot.sim.isInWater;
        const threatInfo = (() => {
            try { return bot.terrain.threatInfo(bot.sim, owner); } 
            catch (e) { console.warn("[Verdant] threatInfo failed "+e); return { count: 0, nearest: null, closest: Infinity }; }
        })();

        // Survival master - highest priority if danger
        try {
            // A real fall in progress (4+ blocks below where it started), not
            // any jump: fallStartY is set on every hop and kept for 60 ticks,
            // which pinned survival_master at score 100 almost permanently.
            const fallRisk = bot.fallDepth ? bot.fallDepth() >= 4 : (bot.survivalMaster?.fallStartY ?? null) !== null;
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
                    director: DEFER,
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
                    director: DEFER,
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
                    director: DEFER,
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

        // Village - called once via arbiter, not twice
        try {
            if (bot.village && (bot.mode === "survival" || bot.mode === "starter" || bot.mode === "speedrun" || bot.mode === "idle")) {
                const villageScore = (() => {
                    try {
                        const top = bot.structures?.getTopPriority();
                        if (top && top.name === "village" && top.priority >= 60) return top.priority;
                        const foodLow = hunger <= 8;
                        if (foodLow) return 75;
                        return 0;
                    } catch { return 0; }
                })();
                if (villageScore > 0) {
                    candidates.push({
                        id: "village",
                        director: bot.village,
                        score: villageScore,
                        reason: `village priority ${villageScore} - single call via arbiter`,
                        tags: ["resource", "exploration"]
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
            // Re-evaluate every 20 ticks, or every 5 while nothing is current.
            if ((!this.current && tick - this.lastEvaluate >= 5) || tick - this.lastEvaluate > 20) {
                const candidates = this.evaluate(tick);
                const best = candidates.find((c) => !this.cooling(c.id, tick));
                if (!best) {
                    return { code: REASON_CODES.NO_TARGET, reason: "No candidate behaviors", score: 0 };
                }
                if (this.shouldInterrupt(this.current, best, tick)) {
                    if (this.current && this.current.id !== best.id) {
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
            const id = this.current.id;
            let result;
            try {
                result = this.current.director.tick(tick);
            } catch (e) {
                console.warn(`[Verdant] director ${id} threw ${e}`);
                this.failures.record(id, tick, String(e).slice(0,200));
                this.cooldown.set(id, tick + 100);
                this.current = null;
                return { code: REASON_CODES.FAILED, reason: `Director ${id} threw: ${e}`, error: e, id };
            }

            if (result === "defer") {
                // The main loop runs this behaviour itself this tick.
                return { code: "defer", reason: this.current.reason, id };
            }
            // Interpret result - directors return true if handled, false if not, or reason codes
            if (result === true) {
                return { code: REASON_CODES.RUNNING, reason: this.current.director.reason || this.current.reason, id };
            } else if (result === false) {
                // Not handled: give the tick back to the main loop and let the
                // next evaluation pick something else. (This used to record a
                // failure, run a second full evaluate() - another entity scan -
                // and claim RUNNING for a fallback that was never ticked.)
                this.failures.record(id, tick, "not handled");
                this.cooldown.set(id, tick + 20);
                this.current = null;
                return { code: REASON_CODES.NO_TARGET, reason: `${id} not handled`, id };
            }
            // Assume running
            return { code: REASON_CODES.RUNNING, reason: this.current.reason, id };
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
