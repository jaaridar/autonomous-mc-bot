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

        // Combat - if threat and not fleeing (director-style tick(tick) only; fights stay on the main chain)
        try {
            if (threatInfo.nearest && hp > 8 && typeof bot.combat?.tick === "function" && bot.combat.tick.length <= 1) {
                const score = threatInfo.count >= 2 ? 85 : 75;
                candidates.push({
                    id: "combat",
                    director: bot.combat,
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
            if (escapeNeeded && typeof bot.escaper?.tick === "function" && bot.escaper.tick.length <= 1) {
                candidates.push({
                    id: "escape",
                    director: bot.escaper,
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
                    const dist = bot.terrain ? bot.terrain.distance ? 0 : 0 : 0;
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
                    // Side-effect free claim: the main dispatcher ticks the mission every tick.
                    // Calling bot[mode](t) here crashed/spammed during mine/speedrun/golem and double-ran others.
                    director: { tick: () => true, reason: bot.reason },
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
            try {
                result = this.current.director.tick(tick);
            } catch (e) {
                console.warn(`[Verdant] director ${this.current.id} threw ${e}`);
                this.failures.record(this.current.id, tick, String(e).slice(0,200), this.bot.sim.location);
                this.current = null;
                return { code: REASON_CODES.FAILED, reason: `Director ${this.current?.id} threw: ${e}`, error: e };
            }

            // Interpret result - directors return true if handled, false if not, or reason codes
            if (result === true) {
                return { code: REASON_CODES.RUNNING, reason: this.current.director.reason || this.current.reason, id: this.current.id };
            } else if (result === false) {
                // Not handled, try next candidate
                this.failures.record(this.current.id, tick, "not handled", this.bot.sim.location);
                const candidates = this.evaluate(tick);
                const next = candidates.find(c => c.id !== this.current.id);
                if (next) {
                    this.current = {
                        id: next.id,
                        director: next.director,
                        score: next.score,
                        startedTick: tick,
                        reason: next.reason,
                        tags: next.tags
                    };
                    return { code: REASON_CODES.RUNNING, reason: `Fallback to ${next.id}: ${next.reason}`, id: next.id };
                }
                return { code: REASON_CODES.NO_TARGET, reason: `No handler for ${this.current.id}` };
            } else {
                // Assume running
                return { code: REASON_CODES.RUNNING, reason: this.current.reason, id: this.current.id };
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
