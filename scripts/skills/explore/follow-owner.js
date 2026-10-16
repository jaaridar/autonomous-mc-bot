// Stay with the owner: the "!bot follow" behaviour.
//
// Follow is not just walking: a companion that stands inside your feet is worse
// than useless, so this skill keeps a comfort band (2-5 blocks), stops when the
// owner stops, sprints when they sprint, and gives up cleanly when the owner is
// in another dimension (rather than pathing to an unreachable coordinate).

import { defineSkill, blocked, done, failed, running } from "../contract.js";
import { boost } from "../util.js";
import { distance } from "../../core/math.js";

const NEAR = 2.5;
const FAR = 5.0;

export const followOwnerSkill = defineSkill({
    id: "explore.follow-owner",
    category: "explore",
    tags: ["follow", "companion", "owner", "stay"],
    priority: 64,
    cost: 1,
    budget: 40000,
    cooldown: 20,
    plan(ctx) {
        const owner = ctx.owner?.();
        return { owner: owner ? { id: owner.id, pos: { ...owner.pos }, dimension: owner.dimension, sprinting: owner.sprinting === true } : null, band: { near: NEAR, far: FAR } };
    },
    requires(ctx) {
        return ctx.settings?.mode === "follow" || ctx.request?.kind === "follow";
    },
    score(ctx) {
        if (ctx.settings?.mode === "follow")
            return 68 + boost(ctx, "explore.follow-owner");
        return boost(ctx, "explore.follow-owner");
    },
    run(ctx, run) {
        const owner = ctx.owner?.();
        if (!owner)
            return blocked("owner is offline");
        if (owner.dimension !== ctx.self.dimension)
            return blocked(`owner is in ${owner.dimension.replace("minecraft:", "")}`);
        const gap = distance(ctx.self.pos, owner.pos);
        if (gap <= NEAR)
            return running(`staying close (${gap.toFixed(1)} blocks)`);
        if (gap > 96)
            return blocked(`owner is ${Math.round(gap)} blocks away: too far to path reliably`);
        const status = ctx.act.walkTo(owner.pos, { leash: FAR, sprint: owner.sprinting || gap > 12 });
        if (status === "blocked")
            return failed("cannot keep up with the owner");
        if (status === "arrived")
            return running("caught up");
        run.steps++;
        return running(`following (${Math.round(gap)} blocks behind)`);
    },
    verify(ctx) {
        const owner = ctx.owner?.();
        return !owner || distance(ctx.self.pos, owner.pos) <= FAR + 2;
    },
    start() { return {}; },
});
