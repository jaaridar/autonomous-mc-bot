// Skill contract.
//
// A *skill* is one bounded, verifiable thing the bot can do: dig a vein, cross a
// gap, win a trade, survive the night, deposit loot. A skill is a plain object
// with a pure `plan()` and a tick-driven `run()`, and it never imports the engine
// - it acts through the context it is handed (see scripts/runtime/skill-runtime.js).
//
// That single rule is what makes the pack testable: a skill can be planned
// against a fake world in Node, its decisions are pure functions of the context,
// and the runtime adapter is the only place that knows Minecraft exists.
//
// Lifecycle:
//
//   idle --score()--> candidate --start(ctx)--> running --run()-> done
//                                                |--run()-> running
//                                                |--run()-> failed   (retryable)
//                                                `--run()-> blocked  (needs the operator)
//
// Every skill declares what it costs, what it needs, and how to tell whether it
// worked (`verify`). The scheduler will not start a skill whose `requires` fails,
// and will not keep running one that has spent its budget.

export const STATUS = {
    IDLE: "idle",
    RUNNING: "running",
    DONE: "done",
    FAILED: "failed",
    BLOCKED: "blocked",
    CANCELLED: "cancelled",
};

export const CATEGORIES = ["survival", "mining", "parkour", "combat", "pvp", "gather", "craft", "build", "explore", "meta"];

/** Recovery hint attached to a failed/blocked skill. */
export const RECOVERY = {
    RETRY: "retry",
    LATER: "later",
    MANUAL: "manual",
};

let counter = 0;

/**
 * Validate and freeze a skill definition. Throws at load time - a malformed
 * skill should break the pack offline, not in the middle of a duel.
 */
export function defineSkill(spec) {
    const required = ["id", "category", "run"];
    for (const field of required)
        if (!spec[field])
            throw new Error(`skill is missing '${field}'`);
    if (!CATEGORIES.includes(spec.category))
        throw new Error(`skill ${spec.id}: unknown category '${spec.category}'`);
    if (typeof spec.run !== "function")
        throw new Error(`skill ${spec.id}: run must be a function`);
    for (const fn of ["plan", "verify", "requires", "score", "start", "abort"])
        if (spec[fn] !== undefined && typeof spec[fn] !== "function")
            throw new Error(`skill ${spec.id}: ${fn} must be a function`);
    return Object.freeze({
        priority: 50,
        cost: 1,
        budget: 400,
        cooldown: 100,
        tags: [],
        requires: () => true,
        score: () => 0,
        plan: () => ({}),
        verify: () => true,
        start: () => ({}),
        abort: () => { },
        ...spec,
        order: ++counter,
    });
}

/** Result helpers - skills return these, never throw, for control-flow cases. */
export function running(message, extra) { return { status: STATUS.RUNNING, message, ...extra }; }
export function done(message, extra) { return { status: STATUS.DONE, message, ...extra }; }
export function failed(reason, extra) { return { status: STATUS.FAILED, reason, recovery: RECOVERY.RETRY, ...extra }; }
export function blocked(reason, extra) { return { status: STATUS.BLOCKED, reason, recovery: RECOVERY.MANUAL, ...extra }; }
export const idle = (message) => ({ status: STATUS.IDLE, message });

/**
 * A skill run in progress. The scheduler owns this; skills only read from it.
 */
export class SkillRun {
    constructor(skill, ctx, plan, tick) {
        this.skill = skill;
        this.id = skill.id;
        this.ctx = ctx;
        this.plan = plan ?? {};
        this.state = skill.start(ctx, this.plan) ?? {};
        this.startedTick = tick;
        this.lastTick = tick;
        this.ticks = 0;
        this.steps = 0;
        this.status = STATUS.RUNNING;
        this.message = "";
        this.reason = "";
        this.recovery = RECOVERY.RETRY;
        this.finishedTick = undefined;
        this.progress = 0;
    }
    get spent() { return this.ticks; }
    get elapsed() { return this.lastTick - this.startedTick; }
    get expired() { return this.spent >= this.skill.budget; }
    /** Apply what the skill returned, tracking status and end tick. */
    apply(result, tick) {
        this.lastTick = tick;
        if (!result || typeof result !== "object")
            throw new Error(`skill ${this.id} returned ${typeof result} instead of a result object`);
        this.status = result.status ?? STATUS.RUNNING;
        this.message = result.message ?? this.message;
        this.reason = result.reason ?? this.reason;
        this.recovery = result.recovery ?? this.recovery;
        if (result.progress !== undefined)
            this.progress = result.progress;
        if (this.status !== STATUS.RUNNING && this.finishedTick === undefined)
            this.finishedTick = tick;
        return this;
    }
    summary() {
        return {
            id: this.id,
            category: this.skill.category,
            status: this.status,
            message: this.message,
            reason: this.reason,
            ticks: this.ticks,
            steps: this.steps,
            progress: Math.round(this.progress * 100) / 100,
        };
    }
}

/**
 * Failure memory with cooldowns. Migrated shape from core/arbiter.js's
 * FailureRecord, but scoped to skills and engine-free.
 */
export class FailureMemory {
    constructor({ cooldown = 200, maxEntries = 64 } = {}) {
        this.entries = new Map();
        this.cooldown = cooldown;
        this.maxEntries = maxEntries;
    }
    record(id, tick, reason, recovery = RECOVERY.RETRY) {
        const entry = this.entries.get(id) ?? { id, count: 0, lastTick: -Infinity, reason: "", recovery };
        entry.count++;
        entry.lastTick = tick;
        entry.reason = reason;
        entry.recovery = recovery;
        this.entries.set(id, entry);
        if (this.entries.size > this.maxEntries) {
            const oldest = [...this.entries.values()].sort((a, b) => a.lastTick - b.lastTick)[0];
            this.entries.delete(oldest.id);
        }
        return entry;
    }
    count(id) { return this.entries.get(id)?.count ?? 0; }
    reason(id) { return this.entries.get(id)?.reason ?? ""; }
    /** True while a recently failed skill should be left alone. */
    blocked(id, tick, cooldown = this.cooldown) {
        const entry = this.entries.get(id);
        if (!entry)
            return false;
        const penalty = cooldown * Math.min(4, entry.count);
        return tick - entry.lastTick < penalty;
    }
    clear(id) { this.entries.delete(id); }
    reset() { this.entries.clear(); }
    summary() {
        return [...this.entries.values()]
            .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id))
            .map((e) => ({ id: e.id, failures: e.count, lastTick: e.lastTick, reason: e.reason }));
    }
}

/** The tick budget a skill gets, scaled by how urgent it is. */
export function budgetFor(skill, { urgent = false } = {}) {
    return urgent ? skill.budget : skill.budget;
}
