// Craft a target item by executing a plan from core/craft-plan.js.
//
// The plan layer already knows the dependency tree, which recipes need a table,
// and what base material is missing. This skill does the physical part: make sure
// a table is placed when the plan needs one, hold the right ingredients (the
// adapter handles slot shuffling), craft each step in order, and refuse to claim
// an item the bag does not show.

import { defineSkill, blocked, done, failed, running } from "../contract.js";
import { boost } from "../util.js";
import { describePlan, planCraft } from "../../core/craft-plan.js";
import { maxStack } from "../../core/inventory-model.js";

export const craftItemSkill = defineSkill({
    id: "craft.craft-item",
    category: "craft",
    tags: ["craft", "make", "tools", "recipes", "table"],
    priority: 60,
    cost: 2,
    budget: 900,
    cooldown: 40,
    plan(ctx) {
        const request = ctx.request?.kind === "craft" ? ctx.request : null;
        const item = request?.target ?? ctx.mission?.craft ?? ctx.intent?.target?.craft;
        if (!item)
            return { item: null };
        const counts = ctx.bag.counts();
        const plan = planCraft(item, counts, { amount: request?.amount ?? 1, table: ctx.nearTable?.() !== false });
        return { item, amount: request?.amount ?? 1, plan, before: counts[item] ?? 0 };
    },
    requires(ctx) {
        const item = ctx.request?.kind === "craft" ? ctx.request.target : ctx.mission?.craft;
        return !!item;
    },
    score(ctx) {
        const item = ctx.request?.kind === "craft" ? ctx.request.target : ctx.mission?.craft;
        if (!item)
            return 0;
        const have = ctx.bag.count(item);
        if ((ctx.request?.amount ?? 1) <= have)
            return 0;
        const plan = planCraft(item, ctx.bag.counts(), { amount: ctx.request?.amount ?? 1 });
        if (!plan.ok && plan.steps.length === 0)
            return 0; // nothing craftable: the gather/mining skills own this
        return 62 + boost(ctx, "craft.craft-item");
    },
    run(ctx, run) {
        const { item, plan } = run.plan;
        if (!item)
            return failed("nothing to craft");
        if (ctx.bag.count(item) >= (run.plan.amount ?? 1) + (plan.ok ? plan.steps.length : 0))
            return done(`have ${ctx.bag.count(item)}x ${short(item)}`);
        if (!plan.ok && plan.steps.length === 0)
            return failed(`cannot craft ${short(item)}: need ${describeMissing(plan)}`);
        const steps = run.state.steps ?? plan.steps;
        run.state.steps = steps;
        if (steps.length === 0) {
            const gained = ctx.bag.count(item) - run.plan.before;
            return gained > 0 ? done(`crafted ${gained}x ${short(item)}`) : failed(`crafting ${short(item)} produced nothing`);
        }
        const step = steps[0];
        if (step.table && !ctx.nearTable?.()) {
            const placed = ctx.act.placeStation?.("minecraft:crafting_table");
            if (!placed && !ctx.bag.has("minecraft:crafting_table"))
                return blocked("crafting table needed but not available");
            return running("placing a crafting table");
        }
        if (!hasIngredients(ctx, step.consumes))
            return failed(`missing ${describeMissing(plan)} for ${short(step.out)}`);
        const result = step.kind === "smelt"
            ? ctx.act.smelt(step.consumes[0]?.[0], step.amount)
            : ctx.act.craft(step.out, step.amount);
        run.steps++;
        if (!result?.ok)
            return failed(`craft failed: ${result?.reason ?? "engine refused"}`);
        steps.shift();
        return steps.length === 0
            ? done(`crafted ${step.amount}x ${short(step.out)}`)
            : running(`${short(step.out)} done; ${steps.length} step(s) left`, { progress: 1 - steps.length / plan.steps.length });
    },
    verify(ctx, plan) {
        return !plan.item || ctx.bag.count(plan.item) > plan.before;
    },
    start() { return {}; },
});

function hasIngredients(ctx, consumes = []) {
    for (const [id, amount] of consumes)
        if (!ctx.bag.has(id, amount))
            return false;
    return true;
}

function describeMissing(plan) {
    if (plan.steps.length && !plan.ok)
        return `materials (${plan.missing.map((m) => `${m.amount}x ${short(m.id)}`).join(", ")})`;
    return plan.missing.length ? plan.missing.map((m) => `${m.amount}x ${short(m.id)}`).join(", ") : "a recipe";
}

const short = (id) => String(id ?? "").replace("minecraft:", "");
export { describePlan, maxStack };
