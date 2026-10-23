/**
 * Anti-stuck core — a fair, escalating recovery ladder.
 *
 * The runtime feeds one observation per tick. The watchdog keeps a short
 * position history, notices real progress (distance to the current goal, not
 * mere movement), and when progress stalls it picks the cheapest action that
 * can plausibly fix the situation, escalating only if that action failed:
 *
 *   replan -> local fix (jump / dig / bridge / pillar) -> relocate
 *          -> retreat home -> honest safe pause
 *
 * It is deliberately engine-free so `tools/` can test every branch offline.
 * Situations it recognises: suffocation, lava, drowning, being caged, loops,
 * stalls, repeated navigation failure, unloaded / unreachable goals, and a
 * ready portal for a dimension goal.
 */

export const WATCHDOG_DEFAULTS = {
    /** Ticks without goal progress before the first rung. */
    stallTicks: 120,
    /** Ticks of no progress at all before escalating a rung. */
    escalateTicks: 240,
    /** Position samples are taken this often. */
    sampleTicks: 10,
    /** A loop is this many repeats of the same two cells. */
    loopRepeats: 3,
    /** Explicit navigation failures that count as "stuck" on their own. */
    failStreak: 3,
    /** Minimum ticks between two recovery attempts. */
    cooldown: 30,
    /** Never try more than this many different actions in one episode. */
    maxAttempts: 12,
    /** Per-action cooldown (ticks). */
    actionCooldown: { dig_forward: 20, dig_up: 20, pillar_up: 40, bridge_forward: 40, replan_wide: 60, change_area: 200, return_home: 600, use_portal: 60, surface: 20, escape_lava: 15, escape_water: 15, eat: 100, wait: 40, pause: 600, backtrack: 80 },
};

/** Every recovery action the runtime knows how to execute. */
export const RECOVERY_ACTIONS = [
    "replan",
    "replan_wide",
    "jump",
    "dig_forward",
    "dig_up",
    "pillar_up",
    "bridge_forward",
    "backtrack",
    "change_area",
    "surface",
    "escape_lava",
    "escape_water",
    "eat",
    "use_portal",
    "return_home",
    "wait",
    "pause",
];

const ESCALATION = [
    ["replan"],
    ["replan_wide", "jump"],
    ["dig_forward", "dig_up", "pillar_up", "bridge_forward"],
    ["backtrack", "change_area"],
    ["surface", "eat"],
    ["return_home", "use_portal"],
    ["pause"],
];

function num(n, fallback) {
    return typeof n === "number" && Number.isFinite(n) ? n : fallback;
}

function cellKey(pos) {
    return `${Math.floor(pos.x / 2)},${Math.floor(pos.y / 2)},${Math.floor(pos.z / 2)}`;
}

/**
 * Classify the current observation. The first matching (most urgent) situation
 * wins; all matches are returned in `all` for diagnostics and tests.
 */
export function classifySituation(obs = {}) {
    const found = [];
    const add = (kind, severity, reason) => found.push({ kind, severity, reason });
    if (obs.suffocating) add("suffocating", 100, "head is inside a solid block");
    if (obs.inLava || obs.belowLava) add("lava", 98, "in lava or standing on it");
    if (obs.headInWater) add("drowning", 96, "head is under water");
    if (obs.inWater && !obs.headInWater) add("swimming", 40, "in water");
    if (obs.caged === true || obs.openNeighbors === 0) add("caged", 90, "no open neighbour to step into");
    if (obs.oscillating) add("loop", 70, "repeating the same cells without closing distance");
    if (num(obs.failStreak, 0) >= num(obs.failStreakLimit, 3)) add("failing", 60, `${obs.failStreak} navigation failures in a row`);
    if (obs.goalLoaded === false) add("unloaded", 55, "goal chunk is not loaded");
    if (obs.noPath) add("no_path", 65, "no route to the current goal");
    if (obs.targetDimension && obs.dimension && obs.targetDimension !== obs.dimension && obs.portalNear) {
        add("portal_ready", 75, "a portal to the target dimension is within reach");
    }
    const stalled = num(obs.ticksWithoutProgress, 0) >= num(obs.stallTicks, WATCHDOG_DEFAULTS.stallTicks);
    if (stalled) add("stalled", 50, `${obs.ticksWithoutProgress} ticks without closing distance`);
    found.sort((a, b) => b.severity - a.severity);
    return { kind: found[0]?.kind ?? "none", severity: found[0]?.severity ?? 0, reason: found[0]?.reason ?? "", all: found };
}

/**
 * Ordered recovery plan for a situation, filtered by what the bot can actually
 * do right now. `ctx` is the same observation plus capability flags.
 */
export function planRecovery(kind, ctx = {}) {
    const can = {
        dig: ctx.hasPickaxe !== false,
        blocks: ctx.hasBlocks === true || num(ctx.blocks, 0) > 0,
        portal: ctx.portalNear === true,
        home: !!ctx.home,
        food: ctx.hasFood !== false && num(ctx.food, 20) < 20,
        waterBucket: ctx.hasWaterBucket === true,
    };
    const map = {
        suffocating: [["dig_up", "dig straight up out of the block"], ["dig_forward", "dig a side tunnel"]],
        lava: [["escape_lava", "move off the lava now"], ["pillar_up", "pillar above the lava"], ["backtrack", "return to the last safe cell"], ["return_home", "retreat home"]],
        drowning: [["surface", "swim to the surface"], ["escape_water", "leave the water"], ["backtrack", "return to the bank"]],
        swimming: [["surface", "surface and continue on land"], ["escape_water", "find the nearest shore"]],
        caged: [["dig_forward", "dig out of the cage"], ["dig_up", "dig up out of the cage"], ["pillar_up", "pillar out if digging is impossible"], ["change_area", "relocate after breaking out"]],
        loop: [["replan_wide", "replan with a wider search"], ["dig_forward", "cut a short tunnel"], ["bridge_forward", "bridge the gap"], ["change_area", "approach from another side"]],
        stalled: [["replan_wide", "replan with a wider search and fresh terrain"], ["jump", "clear a one-block lip"], ["dig_forward", "cut through the obstruction"], ["bridge_forward", "bridge the gap"], ["change_area", "try from another side"]],
        failing: [["replan_wide", "replan with a wider budget"], ["change_area", "relocate before retrying"], ["return_home", "fall back to base"]],
        no_path: [["replan_wide", "widen the search radius"], ["dig_forward", "dig a corridor toward the goal"], ["bridge_forward", "bridge over the gap"], ["change_area", "approach from another side"]],
        unloaded: [["replan_wide", "wait for chunks and replan"], ["change_area", "walk toward the goal to load chunks"]],
        portal_ready: [["use_portal", "enter the portal"]],
    };
    const list = map[kind] ?? [];
    const out = [];
    for (const [action, why] of list) {
        if (action === "dig_forward" || action === "dig_up") {
            if (!can.dig) continue;
        }
        if (action === "bridge_forward" && !can.blocks) continue;
        if (action === "use_portal" && !can.portal) continue;
        if (action === "return_home" && !can.home) continue;
        if (action === "eat" && !can.food) continue;
        out.push({ action, why });
    }
    // A situation must never produce an empty plan: waiting is always safe and
    // lets the watchdog escalate on the next pass.
    if (!out.length) out.push({ action: "wait", why: "nothing local can help; wait one cycle" });
    return out;
}

/**
 * Stateful watchdog. Pure: no engine calls, no timers.
 */
export class StuckWatchdog {
    constructor(options = {}) {
        this.opts = { ...WATCHDOG_DEFAULTS, ...(options ?? {}) };
        this.reset(0);
    }

    reset(tick = 0) {
        this.lastProgress = tick;
        this.lastSample = tick;
        this.bestDistance = Infinity;
        this.samples = [];
        this.level = 0;
        this.attempts = 0;
        this.lastAttempt = -Infinity;
        this.lastAction = "";
        this.actionCooldowns = new Map();
        this.episodeStart = tick;
        this.stuckSince = 0;
        this.lastKind = "none";
        this.reason = "";
        this.failStreak = 0;
        this.lastFailure = "";
    }

    /** Explicit navigation failure signal from the executor. */
    failure(reason, tick = 0) {
        this.failStreak++;
        this.lastFailure = String(reason ?? "navigation failed");
        if (this.failStreak >= this.opts.failStreak && !this.stuckSince) this.stuckSince = tick;
        return this.failStreak;
    }

    success() {
        this.failStreak = 0;
        this.lastFailure = "";
    }

    /** Note a new goal: progress baselines restart so a retarget is not a stall. */
    retarget(tick = 0) {
        this.lastProgress = tick;
        this.bestDistance = Infinity;
        this.samples = [];
        this.level = 0;
        this.attempts = 0;
        this.stuckSince = 0;
        this.failStreak = 0;
    }

    /** Feed one observation; returns the classification plus watchdog state. */
    observe(obs = {}) {
        const tick = num(obs.tick, 0);
        const pos = obs.pos ?? { x: 0, y: 0, z: 0 };
        if (obs.failStreak !== undefined) this.failStreak = Math.max(this.failStreak, num(obs.failStreak, 0));
        if (obs.distance !== undefined && Number.isFinite(obs.distance)) {
            if (obs.distance < this.bestDistance - 0.5) {
                this.bestDistance = obs.distance;
                this.lastProgress = tick;
                if (this.level > 0) {
                    this.level = 0;
                    this.attempts = 0;
                    this.lastAction = "";
                    this.stuckSince = 0;
                }
                this.failStreak = 0;
            }
        }
        if (tick - this.lastSample >= this.opts.sampleTicks) {
            this.lastSample = tick;
            this.samples.push({ tick, key: cellKey(pos), pos: { ...pos } });
            const keep = Math.max(8, this.opts.loopRepeats * 4 + 4);
            while (this.samples.length > keep) this.samples.shift();
        }
        const ticksWithoutProgress = tick - this.lastProgress;
        // Repetition only counts once it has gone on long enough to rule out a
        // sampling artefact (two full A-B cycles at the sampling cadence).
        const oscillating = this.isOscillating() &&
            ticksWithoutProgress >= this.opts.sampleTicks * this.opts.loopRepeats * 2;
        const situation = classifySituation({
            ...obs,
            tick,
            stallTicks: this.opts.stallTicks,
            oscillating,
            ticksWithoutProgress,
            failStreak: this.failStreak,
            failStreakLimit: this.opts.failStreak,
        });
        // Escalation is driven by time and by a failing action history.
        const dueForEscalation = ticksWithoutProgress >= this.opts.escalateTicks * (this.level + 1);
        if (dueForEscalation && this.level < ESCALATION.length - 1) this.level++;
        if (situation.kind !== "none" && this.level === 0 && this.stuckSince === 0) this.stuckSince = tick;
        this.lastKind = situation.kind;
        this.reason = situation.reason;
        return { ...situation, level: this.level, oscillating, ticksWithoutProgress, attempts: this.attempts };
    }

    isOscillating() {
        const s = this.samples;
        const n = s.length;
        if (n < 3) return false;
        let alternations = 0;
        for (let i = n - 1; i > 0; i--) {
            if (s[i].key === s[i - 1].key) break;
            alternations++;
        }
        return alternations >= this.opts.loopRepeats * 2;
    }

    /** True when a recovery attempt should be made now. */
    due(tick = 0, situation) {
        if (!situation || situation.kind === "none") return false;
        if (this.attempts >= this.opts.maxAttempts) return false;
        if (tick - this.lastAttempt < this.opts.cooldown) return false;
        return true;
    }

    /**
     * Pick the next action. Escalation rungs are tried first, then the
     * situation-specific plan; actions already tried in this episode (and those
     * still cooling down) are skipped. Returns undefined when nothing is due.
     */
    decide(tick = 0, situation, ctx = {}) {
        if (!this.due(tick, situation)) return undefined;
        const plans = [];
        for (const rung of ESCALATION.slice(0, this.level + 1)) plans.push(...rung);
        for (const step of planRecovery(situation.kind, ctx)) plans.push(step.action);
        const sources = planRecovery(situation.kind, ctx);
        const whyFor = (action) => sources.find((s) => s.action === action)?.why ?? `recovery rung ${this.level}`;
        for (const action of plans) {
            if (!RECOVERY_ACTIONS.includes(action)) continue;
            if (action === this.lastAction && this.attempts > 0 && this.opts.allowRepeat !== true) continue;
            const until = this.actionCooldowns.get(action) ?? -Infinity;
            if (tick < until) continue;
            this.lastAction = action;
            this.lastAttempt = tick;
            this.attempts++;
            this.actionCooldowns.set(action, tick + (this.opts.actionCooldown[action] ?? 40));
            return { action, why: whyFor(action), kind: situation.kind, level: this.level, attempt: this.attempts };
        }
        return undefined;
    }

    /** Record the outcome of an action; failures escalate immediately. */
    noteResult(action, ok, tick = 0) {
        if (ok) {
            this.level = 0;
            this.attempts = 0;
            this.lastAction = "";
            this.lastProgress = tick;
            this.stuckSince = 0;
            return;
        }
        if (this.level < ESCALATION.length - 1) this.level++;
        this.actionCooldowns.set(action, tick + (this.opts.actionCooldown[action] ?? 40) * 2);
    }

    /** Exhausted ladder: the caller should stop honestly rather than thrash. */
    get exhausted() {
        return this.attempts >= this.opts.maxAttempts;
    }

    /** Diagnostics for `!bot status`. */
    report() {
        return {
            level: this.level,
            kind: this.lastKind,
            reason: this.reason,
            attempts: this.attempts,
            lastAction: this.lastAction,
            failures: this.failStreak,
        };
    }
}
