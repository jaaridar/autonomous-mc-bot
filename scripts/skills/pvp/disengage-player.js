// Break off from a player without dying on the way out.
//
// Players chase; that is the whole problem. So the exit is a route, not a
// direction: put terrain between you and them, use water if you have it, place
// blocks to break line of sight, and do not stop until the gap holds.

import { defineSkill, done, failed, running } from "../contract.js";
import { boost } from "../util.js";
import { disengagePlan } from "../../core/pvp-plan.js";
import { COMPASS, distance } from "../../core/math.js";

export const disengagePlayerSkill = defineSkill({
    id: "pvp.disengage-player",
    category: "pvp",
    tags: ["pvp", "escape", "retreat", "disengage", "player"],
    priority: 94,
    cost: 1,
    budget: 800,
    cooldown: 60,
    plan(ctx) {
        const target = ctx.pvpTarget?.();
        if (!target)
            return { target: null };
        const plan = disengagePlan(
            { from: ctx.self.pos, hp: ctx.self.hp, water: ctx.bag.has("minecraft:water_bucket"), shield: ctx.bag.has("minecraft:shield"), targetBow: target.bow === true, blocks: ctx.bag.count("minecraft:cobblestone") },
            { threats: [target.pos], dirs: COMPASS, terrain: ctx.terrainHints?.() ?? {} },
        );
        return { target, plan };
    },
    requires(ctx) {
        return ctx.settings?.pvp === true && !!ctx.pvpTarget?.();
    },
    score(ctx) {
        const target = ctx.pvpTarget?.();
        if (!target)
            return 0;
        const losing = ctx.self.hp <= (ctx.settings?.retreatHp ?? 6) + 4;
        if (!losing && !ctx.intent?.boosts?.["pvp.disengage-player"])
            return 0;
        return 90 + boost(ctx, "pvp.disengage-player");
    },
    run(ctx, run) {
        const target = run.plan.target;
        const live = ctx.nearestEntity({ id: target?.id, maxDistance: 48 });
        if (!live)
            return done("lost them");
        const gap = distance(ctx.self.pos, live.pos);
        if (gap > 24 && (ctx.self.hp ?? 20) > 10)
            return done(`broke contact at ${Math.round(gap)} blocks`);
        if (run.plan.plan.useWater && ctx.bag.has("minecraft:water_bucket") && gap < 6) {
            ctx.act.use("minecraft:water_bucket");
            run.state.watered = true;
        }
        if (!run.state.target) {
            const dir = run.plan.plan.dir;
            if (!dir)
                return failed("no open direction to disengage through");
            run.state.target = { x: Math.floor(ctx.self.pos.x) + dir.x * 10, y: Math.floor(ctx.self.pos.y), z: Math.floor(ctx.self.pos.z) + dir.z * 10 };
        }
        if (distance(ctx.self.pos, run.state.target) < 2) {
            run.state.target = undefined;
            return running("widening the gap");
        }
        if (run.plan.plan.placeBlocks && run.steps % 6 === 0 && gap < 5) {
            // Wall off line of sight: a block behind you beats a sprint.
            ctx.act.place({ x: Math.floor(ctx.self.pos.x), y: Math.floor(ctx.self.pos.y), z: Math.floor(ctx.self.pos.z) }, { item: "minecraft:cobblestone" });
        }
        const status = ctx.act.walkTo(run.state.target, { leash: 2, sprint: true });
        if (status === "blocked") {
            run.state.target = undefined;
            return running("route blocked; finding another way out");
        }
        run.steps++;
        return running(`disengaging (${Math.round(gap)} blocks clear)`);
    },
    verify(ctx) {
        const live = ctx.pvpTarget?.();
        return !live || distance(ctx.self.pos, live.pos) > 16;
    },
    start() { return {}; },
});
