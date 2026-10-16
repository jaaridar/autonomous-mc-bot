// The scheduler decides what the bot does next, one skill at a time.
//
// It is deliberately small and entirely deterministic: candidates are scored by
// pure functions of the context, ties break by priority then id, and the only
// random nudge comes from a seeded Rng derived per skill. Given the same world
// state and seed, the same skill is chosen - every time, in a test as in-game.
//
// Rules that keep it honest:
//   - every candidate must pass `requires(ctx)`, which must be cheap;
//   - a skill that failed recently is skipped until its cooldown expires;
//   - a running skill is only interrupted by something with a *higher* priority
//     and a meaningfully better score (hysteresis, so the bot does not thrash);
//   - a skill that exceeds its tick budget is failed with a reason, never
//     silently dropped, and its `abort()` runs.

import { FailureMemory, RECOVERY, STATUS, SkillRun } from "./contract.js";

const INTERRUPT_MARGIN = 25;

export class Scheduler {
    constructor(registry, { rng, settings = {}, logger = null } = {}) {
        this.registry = registry;
        this.rng = rng;
        this.settings = settings;
        this.logger = logger;
        this.memory = new FailureMemory();
        this.run = null;
        this.tick0 = 0;
        this.tickCount = 0;
        this.history = [];
        this.stats = new Map();
        this.lastDecision = null;
        this.enabled = true;
        this.forced = null;
    }
    get active() { return this.run; }

    /** Start a specific skill, bypassing scoring (`!bot skill run <id>`). */
    force(id, ctx, tick) {
        const skill = this.registry.get(id);
        if (!skill)
            return { ok: false, reason: `unknown skill '${id}'` };
        this.stop(ctx, tick, "replaced by a forced skill");
        this.forced = id;
        const plan = this.safePlan(skill, ctx);
        if (plan.error)
            return { ok: false, reason: plan.error };
        this.start(skill, ctx, tick, plan.value);
        return { ok: true, skill: skill.id, plan: this.run.plan };
    }

    safePlan(skill, ctx) {
        try {
            return { value: skill.plan(ctx) ?? {} };
        }
        catch (e) {
            return { error: `plan() threw: ${e?.message ?? e}` };
        }
    }
    safeScore(skill, ctx) {
        try {
            const score = Number(skill.score(ctx));
            if (!Number.isFinite(score))
                return 0;
            return score;
        }
        catch {
            return 0;
        }
    }
    safeRequires(skill, ctx) {
        try { return !!skill.requires(ctx); }
        catch { return false; }
    }
    start(skill, ctx, tick, plan) {
        const started = new SkillRun(skill, ctx, plan, tick);
        this.run = started;
        this.history.push({ id: skill.id, tick, event: "start" });
        this.log(`start ${skill.id} ${JSON.stringify(plan ?? {}).slice(0, 160)}`);
        return started;
    }
    stop(ctx, tick, reason = "stopped") {
        if (!this.run)
            return null;
        try { this.run.skill.abort(ctx, this.run.state, reason); }
        catch (e) { this.log(`abort ${this.run.id} threw: ${e?.message ?? e}`); }
        const finished = this.run;
        finished.status = STATUS.CANCELLED;
        finished.reason = reason;
        finished.finishedTick = tick;
        this.finish(finished, tick);
        return finished;
    }
    finish(run, tick) {
        this.history.push({ id: run.id, tick, event: run.status, reason: run.reason, ticks: run.ticks });
        if (this.history.length > 200)
            this.history.splice(0, this.history.length - 200);
        const stat = this.stats.get(run.id) ?? { runs: 0, done: 0, failed: 0, blocked: 0, cancelled: 0, ticks: 0, lastTick: 0 };
        stat.runs++;
        stat.ticks += run.ticks;
        stat.lastTick = tick;
        if (run.status === STATUS.DONE)
            stat.done++;
        else if (run.status === STATUS.FAILED)
            stat.failed++;
        else if (run.status === STATUS.BLOCKED)
            stat.blocked++;
        else if (run.status === STATUS.CANCELLED)
            stat.cancelled++;
        this.stats.set(run.id, stat);
        if (run.status === STATUS.FAILED || run.status === STATUS.BLOCKED)
            this.memory.record(run.id, tick, run.reason || run.message, run.recovery ?? RECOVERY.RETRY);
        else if (run.status === STATUS.DONE)
            this.memory.clear(run.id);
        this.run = null;
        this.forced = null;
    }

    /**
     * Score every viable skill. Returns candidates sorted best-first with the
     * reason each scored what it did, which is what `!bot skill why` prints.
     */
    candidates(ctx) {
        const tick = ctx.tick;
        const out = [];
        for (const skill of this.registry.order) {
            if (!this.safeRequires(skill, ctx))
                continue;
            if (this.memory.blocked(skill.id, tick, this.settings.skillCooldown ?? skill.cooldown))
                continue;
            if (this.settings.disabledSkills?.has(skill.id))
                continue;
            const base = this.safeScore(skill, ctx);
            if (base <= 0)
                continue;
            const jitter = this.rng ? this.rng.derive(skill.id).next() * 0.5 : 0;
            out.push({ skill, base, score: base + jitter, priority: skill.priority });
        }
        out.sort((a, b) => (b.score - a.score) || (b.priority - a.priority) || a.skill.id.localeCompare(b.skill.id));
        return out;
    }

    /** Should the running skill be cut short for this candidate? */
    shouldPreempt(current, candidate) {
        if (!candidate)
            return false;
        if (candidate.priority >= 95 && candidate.priority > (current.skill.priority ?? 0))
            return true; // survival always wins
        if (candidate.priority <= (current.skill.priority ?? 0))
            return false;
        return candidate.base >= current.skill.interruptAt ?? INTERRUPT_MARGIN;
    }

    /** One scheduler tick: advance the active skill or pick a new one. */
    tick(ctx) {
        this.tickCount++;
        if (!this.enabled && !this.forced)
            return { status: STATUS.IDLE, message: "scheduler disabled" };

        if (this.run) {
            const result = this.advance(this.run, ctx);
            if (result.status === STATUS.RUNNING) {
                const candidate = this.forced ? null : this.candidates(ctx)[0];
                if (candidate && this.shouldPreempt(this.run, candidate)) {
                    this.lastDecision = { preempted: this.run.id, by: candidate.skill.id, score: candidate.score, tick: ctx.tick };
                    this.stop(ctx, ctx.tick, `preempted by ${candidate.skill.id}`);
                    this.start(candidate.skill, ctx, ctx.tick, this.safePlan(candidate.skill, ctx).value);
                    return { status: STATUS.RUNNING, message: `preempted -> ${candidate.skill.id}` };
                }
            }
            return result;
        }

        let best;
        if (this.forced) {
            const skill = this.registry.get(this.forced);
            if (skill)
                best = { skill, base: Infinity, score: Infinity, priority: skill.priority };
        }
        if (!best)
            best = this.candidates(ctx)[0];
        if (!best) {
            this.lastDecision = { idle: true, tick: ctx.tick, reason: ctx.intent?.reason ?? "nothing to do" };
            return { status: STATUS.IDLE, message: ctx.intent?.reason ?? "no viable skill" };
        }
        this.lastDecision = { started: best.skill.id, score: best.score, tick: ctx.tick, intent: ctx.intent?.kind };
        this.start(best.skill, ctx, ctx.tick, this.safePlan(best.skill, ctx).value);
        return { status: STATUS.RUNNING, message: `started ${best.skill.id}` };
    }

    /** Run the active skill for one tick, handling budget/errors uniformly. */
    advance(run, ctx) {
        run.ticks++;
        if (run.expired) {
            run.status = STATUS.FAILED;
            run.reason = `budget exhausted after ${run.ticks} ticks`;
            run.recovery = RECOVERY.RETRY;
            this.finish(run, ctx.tick);
            return { status: STATUS.FAILED, message: run.reason };
        }
        let result;
        try {
            result = run.skill.run(ctx, run);
        }
        catch (e) {
            run.status = STATUS.FAILED;
            run.reason = `threw: ${e?.message ?? e}`;
            this.finish(run, ctx.tick);
            return { status: STATUS.FAILED, message: run.reason };
        }
        run.apply(result, ctx.tick);
        if (run.status === STATUS.RUNNING)
            return result;
        let verified = run.status === STATUS.DONE;
        if (run.status === STATUS.DONE) {
            try { verified = !!run.skill.verify(ctx, run.plan); }
            catch (e) {
                verified = false;
                run.reason = `verify() threw: ${e?.message ?? e}`;
            }
            if (!verified) {
                run.status = STATUS.FAILED;
                run.reason = run.reason || "verify() reported the goal was not reached";
            }
        }
        this.finish(run, ctx.tick);
        return { status: run.status, message: run.message, reason: run.reason, verified };
    }

    /** Why is the bot doing this (or nothing)? Used by `!bot skill why`. */
    explain(ctx) {
        const candidates = this.candidates(ctx).slice(0, 8).map((c) => ({
            id: c.skill.id,
            score: Math.round(c.score * 100) / 100,
            base: Math.round(c.base * 100) / 100,
            priority: c.skill.priority,
        }));
        return {
            active: this.run?.summary() ?? null,
            intent: ctx.intent ?? null,
            candidates,
            lastDecision: this.lastDecision,
            failures: this.memory.summary(),
            disabled: this.settings.disabledSkills ? [...this.settings.disabledSkills] : [],
        };
    }
    status() {
        return {
            enabled: this.enabled,
            active: this.run?.summary() ?? null,
            forced: this.forced,
            decisions: this.history.filter((h) => h.event === "start").length,
            recent: this.history.slice(-6),
            failures: this.memory.summary().slice(0, 4),
            stats: [...this.stats.entries()].map(([id, s]) => ({ id, ...s })).sort((a, b) => b.runs - a.runs).slice(0, 10),
        };
    }
    reset() {
        this.run = null;
        this.memory.reset();
        this.history = [];
        this.stats.clear();
        this.lastDecision = null;
        this.forced = null;
    }
    log(message) {
        if (this.logger)
            this.logger(message);
    }
}
