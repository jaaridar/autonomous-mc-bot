// Cross water (and survive it).
//
// Water is where an airborne bot loses: it cannot jump out of deep water against
// a current, it drowns while mining a tunnel, and it gets pushed into a flow by
// mobs. This skill does the deliberate crossing - pick the shore cell on the far
// side, swim, climb out, and check air the whole way.

import { defineSkill, done, failed, running } from "../contract.js";
import { boost } from "../util.js";
import { standable, isLiquid } from "../../core/parkour-plan.js";
import { COMPASS, distance } from "../../core/math.js";
import { destination } from "./reach.js";

const AIR_WARNING = 10;

export const swimCrossSkill = defineSkill({
    id: "parkour.swim-cross",
    category: "parkour",
    tags: ["water", "swim", "river", "cross", "drown", "escape"],
    priority: 62,
    cost: 2,
    budget: 1200,
    cooldown: 60,
    plan(ctx) {
        const goal = ctx.mission?.travelTo ?? destination(ctx);
        const exits = [];
        if (goal) {
            for (const dir of COMPASS) {
                const p = { x: goal.x + dir.x, y: goal.y, z: goal.z + dir.z };
                if (standable(ctx.read, p))
                    exits.push(p);
            }
        }
        return { goal, exits, submerged: ctx.self.inWater && (ctx.self.air ?? 300) < 200 };
    },
    requires(ctx) {
        if (ctx.self.inWater)
            return true;
        // Water in front of us on the direct line to the objective.
        const ahead = ctx.read(Math.floor(ctx.self.pos.x), Math.floor(ctx.self.pos.y), Math.floor(ctx.self.pos.z));
        return isLiquid(ahead) || !!ctx.mission?.waterCross;
    },
    score(ctx) {
        if (ctx.self.inWater && (ctx.self.air ?? 300) <= AIR_WARNING)
            return 95 + boost(ctx, "parkour.swim-cross");
        if (ctx.self.inWater)
            return 45 + boost(ctx, "parkour.swim-cross");
        return boost(ctx, "parkour.swim-cross") * 0.5;
    },
    run(ctx, run) {
        if (!ctx.self.inWater) {
            const target = run.state.exit ?? run.plan.exits[0];
            if (!target)
                return done("out of the water");
            const status = ctx.act.walkTo(target, { leash: 0.5 });
            if (status === "blocked")
                return failed("cannot find a way out of the water");
            return running(`climbing out onto ${target.x},${target.y},${target.z}`);
        }
        if ((ctx.self.air ?? 300) <= AIR_WARNING) {
            // Surface first: drowning, not crossing, is the emergency.
            ctx.act.swimUp();
            return running(`surfacing (air ${ctx.self.air ?? "?"})`);
        }
        const target = run.state.exit ?? run.plan.exits[0];
        if (!target)
            return failed("no shore to swim to");
        const status = ctx.act.walkTo({ x: target.x + 0.5, y: target.y, z: target.z + 0.5 }, { leash: 0.5 });
        if (status === "blocked") {
            // Pick a different exit rather than treading water forever.
            const next = run.plan.exits.find((p) => distance(p, target) > 1);
            if (next) {
                run.state.exit = next;
                return running("switching to another shore");
            }
            return failed("no reachable shore");
        }
        return running(`swimming (${Math.round(distance(ctx.self.pos, target))} blocks to shore)`);
    },
    verify(ctx, plan) {
        return !ctx.self.inWater && (!plan.goal || distance(ctx.self.pos, plan.goal) < 8);
    },
    start() { return {}; },
});
