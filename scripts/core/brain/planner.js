import { Blackboard } from "./blackboard.js";
import { REASON, STATUS } from "./results.js";

const blockedR = (goal, why) => ({ kind: "blocked", goal: String(goal), why });
function learnSig(state) {
    try {
        const k = state?.known ?? {}, inv = state?.inv ?? {};
        return JSON.stringify([Object.keys(k).filter((x) => k[x]).sort(), Object.keys(inv).sort().map((x) => [x, inv[x]])]);
    } catch { return ""; }
}
const MAX_DEPTH = 14;
const MAX_FRUITLESS_RELOCATIONS = 6;
const RELOCATING = new Set(["explore", "go_home", "recover_death", "flee"]);

export class Planner {
    constructor(lookup, bb = new Blackboard()) {
        this.lookup = lookup;
        this.bb = bb;
        this.lastPlan = null;
        this.explore = new Map();
    }

    next(rootId, state, tick = 0) {
        const ctx = { state, bb: this.bb, tick };
        if (typeof rootId !== "string" || !rootId) return { kind: "blocked", goal: String(rootId), why: "invalid goal id", explain: [] };
        const r = this._resolve(rootId, ctx, []);
        if (r.kind === "done") { this.lastPlan = null; return { kind: "done" }; }
        if (r.kind === "blocked") {
            this.lastPlan = null;
            return { kind: "blocked", goal: r.goal, why: r.why, explain: this.bb.explain(tick) };
        }
        this.lastPlan = r;
        return { kind: "action", skill: r.skill, args: r.args ?? {}, path: r.path, goalId: r.owner.goalId, methodId: r.owner.methodId };
    }

    report(result, action, tick = 0, state = undefined) {
        if (!action || !result) return;
        const owner = { goalId: action.goalId, methodId: action.methodId };
        const key = `${owner.goalId}/${owner.methodId}`;
        if (result.status === STATUS.SUCCESS) {
            if (RELOCATING.has(action.skill)) {
                this.bb.forgetSituational();
                const sig = learnSig(state);
                const t = this.explore.get(key) ?? { n: 0, sig };
                if (sig !== t.sig) { t.n = 0; t.sig = sig; }
                t.n++;
                this.explore.set(key, t);
                if (this.explore.size > 200) this.explore.delete(this.explore.keys().next().value);
                if (t.n >= MAX_FRUITLESS_RELOCATIONS) {
                    this.explore.delete(key);
                    this.bb.note(owner.goalId, owner.methodId, false, tick, REASON.TIMEOUT);
                }
            } else {
                this.explore.delete(key);
                this.bb.note(owner.goalId, owner.methodId, true, tick);
            }
            return;
        }
        if (result.status === STATUS.FAILED) {
            if (result.reason === REASON.INTERRUPTED) return;
            this.explore.delete(key);
            this.bb.note(owner.goalId, owner.methodId, false, tick, result.reason ?? REASON.UNKNOWN);
        }
    }

    _resolve(goalId, ctx, path) {
        if (path.length >= MAX_DEPTH) return blockedR(goalId, "plan too deep (possible cycle)");
        if (path.some((p) => p.goalId === goalId)) return blockedR(goalId, "goal depends on itself");
        const goal = this.lookup(goalId);
        if (!goal) return blockedR(goalId, "unknown goal");
        let sat = false;
        try { sat = !!goal.satisfied(ctx.state); } catch { sat = false; }
        if (sat) return { kind: "done" };

        let methods = [];
        try { methods = goal.methods(ctx) ?? []; } catch { methods = []; }
        const applicable = methods.filter((m) => { try { return m.applicable ? !!m.applicable(ctx) : true; } catch { return false; } });
        const ranked = this.bb.rank(goalId, applicable, ctx.tick);
        if (!ranked.length) {
            const why = applicable.length ? `all ${applicable.length} method(s) recently failed` : "no method applicable in this situation";
            return blockedR(goalId, why);
        }

        let lastBlock = null;
        for (const m of ranked) {
            let steps = [];
            try { steps = m.steps(ctx) ?? []; } catch { continue; }
            let viable = true;
            for (const step of steps) {
                if (step.goal) {
                    const r = this._resolve(step.goal, ctx, [...path, { goalId, methodId: m.id }]);
                    if (r.kind === "done") continue;
                    if (r.kind === "blocked") { lastBlock = r; viable = false; break; }
                    return r;
                }
                if (step.skip) { let s = false; try { s = !!step.skip(ctx.state); } catch { s = false; } if (s) continue; }
                return { kind: "action", skill: step.skill, args: step.args ?? {}, path: [...path, { goalId, methodId: m.id }], owner: { goalId, methodId: m.id } };
            }
            if (viable) return { kind: "done" };
        }
        return lastBlock ? { ...lastBlock } : blockedR(goalId, "no viable method");
    }
}
