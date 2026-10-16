// Do not drown: get air, then get to a block you can stand on.
//
// Runs before anything else that is merely useful. Three cases, in order: the bot
// is under water (swim up), it is in deep water and cannot touch the bottom (swim
// to the nearest shore), or it is standing in water with somewhere better nearby.

import { defineSkill, done, failed, running } from "../contract.js";
import { boost } from "../util.js";
import { standable } from "../../core/parkour-plan.js";
import { COMPASS, distance } from "../../core/math.js";

const BREATH_WARNING = 12;

export const escapeWaterSkill = defineSkill({
    id: "survival.escape-water",
    category: "survival",
    tags: ["water", "drown", "air", "emergency", "swim"],
    priority: 96,
    cost: 1,
    budget: 400,
    cooldown: 10,
    plan(ctx) {
        const here = floorSelf(ctx);
        const shores = [];
        for (const dir of COMPASS) {
            for (let step = 1; step <= 6; step++) {
                for (const dy of [0, 1, -1]) {
                    const cell = { x: here.x + dir.x * step, y: here.y + dy, z: here.z + dir.z * step };
                    if (!standable(ctx.read, cell) || isWater(ctx.read(cell.x, cell.y, cell.z)))
                        continue;
                    shores.push({ ...cell, d: distance(ctx.self.pos, cell), step });
                }
            }
        }
        shores.sort((a, b) => (a.d - b.d) || (a.y - b.y) || (a.x - b.x) || (a.z - b.z));
        return { shores: shores.slice(0, 8), air: ctx.self.air ?? 300 };
    },
    requires(ctx) {
        return ctx.self.inWater === true;
    },
    score(ctx) {
        if (!ctx.self.inWater)
            return 0;
        const air = ctx.self.air ?? 300;
        if (air <= BREATH_WARNING)
            return 180 + boost(ctx, "survival.escape-water");
        return 40 + boost(ctx, "survival.escape-water");
    },
    run(ctx, run) {
        if (!ctx.self.inWater)
            return done("out of the water");
        const air = ctx.self.air ?? 300;
        if (air <= BREATH_WARNING) {
            ctx.act.swimUp();
            return running(`surfacing for air (${air} left)`);
        }
        const shore = run.state.shore ?? run.plan.shores[0];
        if (!shore)
            return failed("no shore within reach");
        run.state.shore = shore;
        const status = ctx.act.walkTo({ x: shore.x + 0.5, y: shore.y, z: shore.z + 0.5 }, { leash: 0.5 });
        if (status === "blocked") {
            run.state.shore = undefined;
            return running("shore unreachable; trying another");
        }
        run.steps++;
        return running(`swimming to shore (${Math.round(distance(ctx.self.pos, shore))} blocks)`);
    },
    verify(ctx) {
        return !ctx.self.inWater || (ctx.self.air ?? 300) > BREATH_WARNING;
    },
    start() { return {}; },
});

const isWater = (id) => /^(minecraft:(water|flowing_water|bubble_column))$/.test(id ?? "");
const floorSelf = (ctx) => ({ x: Math.floor(ctx.self.pos.x), y: Math.floor(ctx.self.pos.y), z: Math.floor(ctx.self.pos.z) });
