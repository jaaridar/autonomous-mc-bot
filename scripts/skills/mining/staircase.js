// Dig a staircase to a target depth (or to a target block).
//
// The shape comes from core/mining-plan.js (staircasePlan), so the geometry is
// testable. This skill owns the *execution* concerns: never dig into lava, never
// open a hole over a long drop, keep the way back walkable, and stop at the
// requested Y.

import { defineSkill, done, failed, running } from "../contract.js";
import { boost, hazardAround, inReach } from "../util.js";
import { staircasePlan, orderDigPath, breakTicks } from "../../core/mining-plan.js";
import { COMPASS } from "../../core/math.js";
import { toolChoice } from "./support.js";

export const staircaseSkill = defineSkill({
    id: "mining.staircase",
    category: "mining",
    tags: ["dig", "descend", "y-level", "tunnel"],
    priority: 48,
    cost: 3,
    budget: 3000,
    cooldown: 120,
    plan(ctx) {
        const targetY = ctx.request?.y ?? ctx.mission?.targetY ?? 12;
        const dir = chooseDirection(ctx);
        const steps = Math.max(1, Math.ceil(Math.abs(ctx.self.pos.y - targetY)) + 4);
        const start = { x: Math.floor(ctx.self.pos.x), y: Math.floor(ctx.self.pos.y), z: Math.floor(ctx.self.pos.z) };
        const cells = staircasePlan(start, dir, { steps: Math.min(steps, 64), descend: targetY < ctx.self.pos.y });
        return { targetY, dir, cells, tool: toolChoice(ctx, "minecraft:stone") };
    },
    requires(ctx) {
        const targetY = ctx.mission?.targetY ?? 12;
        return ctx.self.pos.y - targetY > 2 || Math.abs(ctx.self.pos.y - targetY) > 3;
    },
    score(ctx) {
        const targetY = ctx.mission?.targetY ?? 12;
        const delta = Math.abs(ctx.self.pos.y - targetY);
        if (delta <= 2)
            return 0;
        return 30 + Math.min(40, delta) * 0.5 + boost(ctx, "mining.staircase");
    },
    run(ctx, run) {
        const { targetY, cells } = run.plan;
        const remaining = run.state.remaining?.length ? run.state.remaining : orderDigPath(cells, ctx.self.pos);
        run.state.remaining = remaining;
        const atTarget = Math.abs(ctx.self.pos.y - targetY) <= 1;
        if (atTarget || remaining.length === 0)
            return atTarget ? done(`reached y=${Math.round(ctx.self.pos.y)}`) : failed("ran out of staircase before reaching the target depth");

        const cell = remaining[0];
        const id = ctx.read(cell.x, cell.y, cell.z);
        const above = ctx.read(cell.x, cell.y + 1, cell.z);
        if (isOpen(id) && isOpen(above)) {
            remaining.shift();
            return running(`walking the staircase (${remaining.length} cells left)`);
        }
        if (!inReach(ctx, cell, 4.5)) {
            const status = ctx.act.walkTo(cell, { leash: 1 });
            if (status === "blocked")
                return failed(`staircase blocked at ${cell.x},${cell.y},${cell.z}`);
            return running("advancing into the staircase");
        }
        if (id !== "minecraft:air") {
            const hazard = hazardAround(ctx, cell);
            if (hazard.dangerous)
                return failed(`refused to dig next to ${short(hazard.id)} at ${hazard.at.x},${hazard.at.y},${hazard.at.z}`);
            const cost = breakTicks(id, run.plan.tool);
            if (!Number.isFinite(cost))
                return failed(`${short(id)} cannot be broken`);
            const verdict = ctx.act.dig(cell, { tool: run.plan.tool });
            if (verdict === "blocked")
                return failed(`cannot break ${short(id)} on the staircase`);
            if (verdict !== "broken")
                return running(`digging ${short(id)} (step ${Math.round(ctx.self.pos.y)})`);
        }
        remaining.shift();
        run.steps++;
        return running(`step down: ${Math.round(ctx.self.pos.y)} -> ${targetY}`);
    },
    verify(ctx, plan) {
        return Math.abs(ctx.self.pos.y - plan.targetY) <= 2;
    },
    start() { return { remaining: [] }; },
});

/** Prefer the direction with the most open space; deterministic tie-break. */
function chooseDirection(ctx) {
    let best;
    for (const dir of COMPASS) {
        let open = 0;
        for (let i = 1; i <= 3; i++) {
            const id = ctx.read(Math.floor(ctx.self.pos.x) + dir.x * i, Math.floor(ctx.self.pos.y) - i, Math.floor(ctx.self.pos.z) + dir.z * i);
            if (id === "minecraft:air")
                open++;
        }
        const hazard = /lava|water/.test(ctx.read(Math.floor(ctx.self.pos.x) + dir.x * 2, Math.floor(ctx.self.pos.y) - 2, Math.floor(ctx.self.pos.z) + dir.z * 2)) ? -5 : 0;
        const score = open + hazard;
        if (!best || score > best.score || (score === best.score && (dir.x < best.dir.x || (dir.x === best.dir.x && dir.z < best.dir.z))))
            best = { dir, score };
    }
    return best?.dir ?? { x: 1, y: 0, z: 0 };
}

const isOpen = (id) => id === "minecraft:air" || id === "minecraft:cave_air";
const short = (id) => String(id ?? "").replace("minecraft:", "");
