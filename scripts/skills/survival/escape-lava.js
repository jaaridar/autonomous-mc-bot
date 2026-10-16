// Get out of lava, fire or powder snow - the "you have seconds" skill.
//
// Priority 99 and a tiny budget: this must beat everything else, and it must not
// think too hard. Water bucket first (it is the fastest way out of fire), then a
// block-under-feet jump, then walking to the nearest non-hazardous neighbour.

import { defineSkill, done, failed, running } from "../contract.js";
import { boost, hazardAround } from "../util.js";
import { COMPASS, distance } from "../../core/math.js";
import { standable } from "../../core/parkour-plan.js";

export const escapeLavaSkill = defineSkill({
    id: "survival.escape-lava",
    category: "survival",
    tags: ["lava", "fire", "burning", "emergency", "escape"],
    priority: 99,
    cost: 1,
    budget: 160,
    cooldown: 10,
    plan(ctx) {
        const here = floorSelf(ctx);
        const inHazard = isHazardish(ctx.read(here.x, here.y, here.z)) || isHazardish(ctx.read(here.x, here.y - 1, here.z));
        const escapes = [];
        for (const dir of COMPASS) {
            for (const dy of [0, 1, -1, 2]) {
                const cell = { x: here.x + dir.x, y: here.y + dy, z: here.z + dir.z };
                if (!standable(ctx.read, cell))
                    continue;
                if (isHazardish(ctx.read(cell.x, cell.y - 1, cell.z)) || isHazardish(ctx.read(cell.x, cell.y, cell.z)))
                    continue;
                escapes.push({ ...cell, d: distance(ctx.self.pos, cell) });
            }
        }
        escapes.sort((a, b) => (a.d - b.d) || (a.y - b.y) || (a.x - b.x) || (a.z - b.z));
        return { inHazard, escapes, hasWater: ctx.bag.has("minecraft:water_bucket") };
    },
    requires(ctx) {
        const plan = this?.plan?.(ctx);
        return plan?.inHazard === true || ctx.self.onFire === true || ctx.self.inLava === true;
    },
    score(ctx) {
        if (ctx.self.inLava)
            return 200;
        if (ctx.self.onFire)
            return 150 + boost(ctx, "survival.escape-lava");
        const here = floorSelf(ctx);
        if (isHazardish(ctx.read(here.x, here.y - 1, here.z)))
            return 140;
        return boost(ctx, "survival.escape-lava");
    },
    run(ctx, run) {
        const plan = this.plan(ctx);
        if (!plan.inHazard && !ctx.self.onFire)
            return done("out of the hazard");
        if (ctx.self.inLava) {
            // Swim up and out: the fastest way off a lava floor is upward.
            ctx.act.swimUp();
            return running("climbing out of the lava");
        }
        if (ctx.self.onFire && plan.hasWater) {
            ctx.act.use("minecraft:water_bucket");
            return running("dousing the fire");
        }
        const target = run.state.target ?? plan.escapes[0];
        if (!target)
            return failed("no safe cell to escape to");
        run.state.target = target;
        const status = ctx.act.walkTo({ x: target.x + 0.5, y: target.y, z: target.z + 0.5 }, { leash: 0.4, sprint: true });
        if (status === "blocked") {
            run.state.target = undefined;
            return running("first escape route failed; trying another");
        }
        run.steps++;
        return running(`escaping the hazard (${Math.round(distance(ctx.self.pos, target))} blocks)`);
    },
    verify(ctx) {
        return !ctx.self.inLava && !ctx.self.onFire;
    },
    start() { return {}; },
});

/** Lava, fire, magma, powder snow: everything that hurts on contact. */
export function isHazardish(id) {
    return /^(minecraft:(lava|flowing_lava|fire|soul_fire|magma_block|campfire|soul_campfire|powder_snow))$/.test(id ?? "");
}

const floorSelf = (ctx) => ({ x: Math.floor(ctx.self.pos.x), y: Math.floor(ctx.self.pos.y), z: Math.floor(ctx.self.pos.z) });
export { hazardAround };
