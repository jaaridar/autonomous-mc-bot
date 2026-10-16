// Unstick: the bot has not made progress for a while, and something local is wrong.
//
// Every autonomous bot eventually wedges itself - inside a 1x1 hole it dug, on a
// fence, behind a door, against a wall it keeps trying to walk through. Instead
// of teleporting (which the pack refuses to do) this skill tries the four honest
// escapes in order: step out, jump out, dig out, or climb out - and reports which
// one worked so the cause can be fixed.

import { defineSkill, done, failed, running } from "../contract.js";
import { boost, hazardAround } from "../util.js";
import { standable } from "../../core/parkour-plan.js";
import { COMPASS } from "../../core/math.js";

const ATTEMPTS = 6;

export const unstickSkill = defineSkill({
    id: "survival.unstick",
    category: "survival",
    tags: ["stuck", "unstuck", "recovery", "wedged"],
    priority: 88,
    cost: 1,
    budget: 300,
    cooldown: 120,
    plan(ctx) {
        const here = floorSelf(ctx);
        const exits = [];
        for (const dir of COMPASS) {
            for (const dy of [0, 1, -1]) {
                const cell = { x: here.x + dir.x, y: here.y + dy, z: here.z + dir.z };
                if (standable(ctx.read, cell))
                    exits.push({ ...cell, dy });
            }
        }
        return { exits, headBlocked: !standable(ctx.read, { x: here.x, y: here.y, z: here.z }) };
    },
    requires(ctx) {
        return ctx.self.stuck === true;
    },
    score(ctx) {
        return ctx.self.stuck ? 90 + boost(ctx, "survival.unstick") : 0;
    },
    run(ctx, run) {
        if (!ctx.self.stuck)
            return done("moving again");
        const attempts = (run.state.attempts ?? 0) + 1;
        run.state.attempts = attempts;
        if (attempts > ATTEMPTS)
            return failed("still stuck after every honest escape", { recovery: "manual" });
        const mode = attempts % 3;

        if (mode === 0) {
            const exit = run.plan.exits[(attempts / 3) | 0] ?? run.plan.exits[0];
            if (exit) {
                const status = ctx.act.walkTo({ x: exit.x + 0.5, y: exit.y, z: exit.z + 0.5 }, { leash: 0.4 });
                return running(status === "blocked" ? "exit blocked; trying another way" : `stepping out to ${exit.x},${exit.y},${exit.z}`);
            }
        }
        if (mode === 1) {
            ctx.act.jump();
            return running("jumping free");
        }
        // Dig the exit: the honest way out of a hole is a pickaxe, not a teleport.
        const exit = run.plan.exits[0];
        const target = exit ?? { x: floorSelf(ctx).x + 1, y: floorSelf(ctx).y, z: floorSelf(ctx).z };
        const overhead = { x: floorSelf(ctx).x, y: floorSelf(ctx).y + 2, z: floorSelf(ctx).z };
        if (ctx.read(overhead.x, overhead.y, overhead.z) !== "minecraft:air" && !hazardAround(ctx, overhead).dangerous) {
            const verdict = ctx.act.dig(overhead, {});
            return running(verdict === "broken" ? "opened the ceiling" : "digging overhead");
        }
        const verdict = ctx.act.dig(target, {});
        if (verdict === "broken")
            return running("dug a way out");
        if (verdict === "blocked")
            return failed(`cannot dig ${short(ctx.read(target.x, target.y, target.z))} to escape`);
        return running("digging free");
    },
    verify(ctx) {
        return ctx.self.stuck !== true;
    },
    start() { return {}; },
});

const floorSelf = (ctx) => ({ x: Math.floor(ctx.self.pos.x), y: Math.floor(ctx.self.pos.y), z: Math.floor(ctx.self.pos.z) });
const short = (id) => String(id ?? "").replace("minecraft:", "");
