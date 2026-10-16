// Inventory triage: merge stacks, then drop the least valuable thing when full.
//
// A survival bot with a full bag stops being autonomous: it cannot pick up drops,
// cannot store loot, and its mining trips produce nothing. Triage keeps a couple
// of slots free by merging partial stacks first and, only if that fails, dropping
// the genuinely junk item - never tools, food, or anything the mission needs.

import { defineSkill, done, running } from "../contract.js";
import { boost, dropJunk } from "../util.js";
import { itemValue } from "../../core/data/item-values.js";

const RESERVE = 2;

export const triageSkill = defineSkill({
    id: "meta.triage",
    category: "meta",
    tags: ["inventory", "junk", "organise", "organize", "space", "full"],
    priority: 36,
    cost: 1,
    budget: 120,
    cooldown: 60,
    plan(ctx) {
        const merged = ctx.bag.freeSlots <= RESERVE ? ctx.bag.clone() : null;
        const wouldMerge = merged ? merged.merge().length : 0;
        return { freeSlots: ctx.bag.freeSlots, wouldMerge, keep: ctx.keepList?.() ?? [] };
    },
    requires(ctx) {
        return ctx.bag.freeSlots <= RESERVE + 1;
    },
    score(ctx) {
        const free = ctx.bag.freeSlots;
        if (free > RESERVE + 1)
            return boost(ctx, "meta.triage");
        return 30 + (RESERVE + 2 - free) * 4 + boost(ctx, "meta.triage");
    },
    run(ctx, run) {
        if (ctx.bag.freeSlots >= RESERVE + 1)
            return done(`bag has ${ctx.bag.freeSlots} free slot(s)`);
        const merged = ctx.act.mergeStacks?.() ?? 0;
        if (merged > 0)
            return running(`merged ${merged} partial stack(s)`);
        if (ctx.bag.freeSlots >= RESERVE)
            return done("enough space after merging");
        const dropped = dropJunk(ctx, RESERVE - ctx.bag.freeSlots, { keep: run.plan.keep });
        if (dropped.length === 0)
            return done("nothing safe to drop; head to a chest instead");
        return running(`dropped ${dropped.map((d) => short(d.typeId)).join(", ")} to free space`);
    },
    verify() {
        return true;
    },
    start() { return {}; },
});

const short = (id) => String(id ?? "").replace("minecraft:", "");
export { itemValue };
