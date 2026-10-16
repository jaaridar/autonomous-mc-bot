// After dying: go back to the death point and collect what dropped.
//
// Drops despawn after about five minutes, so this is a race with a budget. The
// skill goes straight there, picks up whatever is left, and reports honestly when
// it arrived too late - the old behaviour of "recovered" without items is exactly
// what an autonomous bot must never do.

import { defineSkill, blocked, done, failed, running } from "../contract.js";
import { boost } from "../util.js";
import { distance } from "../../core/math.js";

const DESPAWN_TICKS = 6000;
const URGENT = 3600;

export const recoverDeathSkill = defineSkill({
    id: "meta.recover-death",
    category: "meta",
    tags: ["death", "drops", "recover", "gravestone", "corpse"],
    priority: 66,
    cost: 2,
    budget: 2400,
    cooldown: 60,
    plan(ctx) {
        const point = ctx.deathPoint;
        const elapsed = point ? ctx.tick - (point.tick ?? ctx.tick) : Infinity;
        return { point, elapsed, urgent: elapsed < URGENT, expired: elapsed > DESPAWN_TICKS };
    },
    requires(ctx) {
        return !!ctx.deathPoint;
    },
    score(ctx) {
        const point = ctx.deathPoint;
        if (!point)
            return 0;
        const elapsed = ctx.tick - (point.tick ?? ctx.tick);
        if (elapsed > DESPAWN_TICKS)
            return 5; // drops are gone: pick the memory up quietly
        const urgent = elapsed < URGENT ? 30 : 0;
        return 70 + urgent + boost(ctx, "meta.recover-death");
    },
    run(ctx, run) {
        if (!run.plan.point)
            return done("no death point to recover");
        if (run.plan.expired)
            return blocked("the drops have despawned (more than 5 minutes passed)");
        const point = run.plan.point;
        if (point.dimension && point.dimension !== ctx.self.dimension)
            return blocked(`death point is in ${point.dimension.replace("minecraft:", "")}`);
        const gap = distance(ctx.self.pos, point.pos);
        if (gap <= 1.5) {
            const collected = ctx.act.pickupNearby?.(6) ?? 0;
            const remaining = ctx.entities({ types: ["minecraft:item"], maxDistance: 6 }).length;
            if (remaining === 0)
                return done(collected > 0 ? `recovered ${collected} stack(s) from the death point` : "arrived at the death point: the drops were already gone or picked up");
            return running(`collecting at the death point (${remaining} drop(s) left)`);
        }
        const status = ctx.act.walkTo(point.pos, { leash: 2, sprint: gap > 20 });
        if (status === "blocked") {
            if (run.steps > 40)
                return failed("cannot reach the death point");
            return running("route blocked; trying again");
        }
        run.steps++;
        return running(`returning to the death point (${Math.round(gap)} blocks)`);
    },
    verify(ctx, plan) {
        if (!plan.point)
            return true;
        return distance(ctx.self.pos, plan.point.pos) < 8 || ctx.entities({ types: ["minecraft:item"], maxDistance: 8 }).length === 0;
    },
    start() { return {}; },
});
