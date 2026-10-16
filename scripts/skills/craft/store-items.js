// Put loot away: open a container and deposit, topping up matching stacks first.
//
// Runs when the bot is full or has returned to base, and it never destroys
// anything: if no container is reachable it says so and stops rather than
// dropping the loot (which the old bot reported as "stored").

import { defineSkill, done, failed, running } from "../contract.js";
import { boost, dropJunk } from "../util.js";
import { distance } from "../../core/math.js";
import { isPreciousFood } from "../survival/eat.js";

export const storeItemsSkill = defineSkill({
    id: "craft.store-items",
    category: "craft",
    tags: ["deposit", "chest", "store", "base", "storage"],
    priority: 42,
    cost: 1,
    budget: 700,
    cooldown: 120,
    plan(ctx) {
        const here = ctx.self.pos;
        const chests = (ctx.blocks({ types: ["@containers"], radius: ctx.settings?.storageRadius ?? 24, limit: 8 }) ?? [])
            .map((c) => ({ ...c, distance: distance(here, c) }))
            .sort((a, b) => (a.distance - b.distance) || (a.x - b.x) || (a.y - b.y) || (a.z - b.z));
        const known = ctx.memory?.nearest?.("chest", ctx.self.dimension, here) ?? null;
        return { chests, known: known ? { ...known, distance: distance(here, known) } : null, before: ctx.bag.totalItems, keep: ctx.keepList?.() ?? [] };
    },
    requires(ctx) {
        return ctx.bag.totalItems > 0;
    },
    score(ctx) {
        const full = ctx.bag.freeSlots <= 1;
        const excess = ctx.bag.totalItems > 20;
        if (!full && !excess)
            return boost(ctx, "craft.store-items");
        const storage = (ctx.blocks({ types: ["@containers"], radius: 16, limit: 1 }) ?? []).length > 0;
        return (storage ? 46 : 12) + boost(ctx, "craft.store-items");
    },
    run(ctx, run) {
        if (ctx.bag.totalItems === 0)
            return done("nothing to store");
        const target = run.state.chest ?? run.plan.chests[0] ?? run.plan.known;
        if (!target)
            return failed("no chest or barrel within range (stand near one, or mark a base with !bot base)");
        run.state.chest = target;
        if (distance(ctx.self.pos, target) > 3.5) {
            const status = ctx.act.walkTo(target, { leash: 1 });
            if (status === "blocked")
                return failed("chest unreachable");
            return running("walking to storage");
        }
        const opened = ctx.act.openContainer?.(target);
        if (!opened)
            return failed("could not open the container");
        const result = ctx.act.deposit?.(target, { keep: [...(run.plan.keep ?? []), ...preciousThingIds(ctx)] });
        if (!result)
            return failed("deposit refused");
        const moved = ctx.bag.totalItems - run.plan.before;
        return done(`stored ${Math.abs(moved)} item(s) in ${Math.round(result.moved ?? 0)} stack(s)`);
    },
    verify() {
        return true;
    },
    start() { return {}; },
});

/** Things the bot should not dump into a chest even when full. */
function preciousThingIds(ctx) {
    const keep = [];
    for (const [id, amount] of Object.entries(ctx.bag.counts())) {
        if (amount <= 0)
            continue;
        if (/_(pickaxe|axe|sword|shovel)$|torch|crafting_table|furnace|bread|cooked_/.test(id) || isPreciousFood(id))
            keep.push(id);
    }
    return keep;
}

export { dropJunk };
