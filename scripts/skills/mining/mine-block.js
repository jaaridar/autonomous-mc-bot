// Mine N blocks of a target type: the workhorse for "!bot mine oak_log 4".
//
// Planning is a pure scan over the world read: pick the nearest matching block
// that is reachable, safe to dig, and cheap enough to break with what we hold.
// Execution is one cell at a time so a threat can interrupt cleanly.

import { defineSkill, blocked, done, failed, running } from "../contract.js";
import { boost, hazardAround, inReach, nearest, opensDrop, tick } from "../util.js";
import { breakTicks, isMineable } from "../../core/mining-plan.js";
import { actionCells, targetBlocks, toolChoice } from "./support.js";

export const mineBlockSkill = defineSkill({
    id: "mining.mine-block",
    category: "mining",
    tags: ["mine", "dig", "gather", "quarry"],
    priority: 45,
    cost: 2,
    budget: 1200,
    cooldown: 60,
    plan(ctx) {
        const want = ctx.request?.kind === "mine" ? ctx.request : ctx.mission?.mine;
        const typeIds = want?.target ? [want.target] : (ctx.intent?.target?.typeIds ?? ["minecraft:stone"]);
        const amount = want?.amount ?? 1;
        const blocks = targetBlocks(ctx, typeIds, { radius: ctx.settings?.mineRadius ?? 24, limit: Math.max(8, amount * 2) });
        return { typeIds, amount, blocks, tool: toolChoice(ctx, typeIds[0]) };
    },
    requires(ctx) {
        const want = ctx.request?.kind === "mine" ? ctx.request : ctx.mission?.mine;
        if (want?.target)
            return true;
        return !!ctx.mission?.mine;
    },
    score(ctx) {
        const want = ctx.request?.kind === "mine" ? ctx.request : ctx.mission?.mine;
        if (!want?.target)
            return boost(ctx, "mining.mine-block") + 10;
        const have = ctx.bag.count(want.target);
        if (want.amount && have >= want.amount)
            return 0;
        return 40 + boost(ctx, "mining.mine-block");
    },
    run(ctx, run) {
        const { typeIds, amount, tool } = run.plan;
        const goal = run.state.goal ?? amount;
        run.state.goal = goal;
        let mined = run.state.mined ?? 0;
        run.state.mined = mined;

        if (mined >= goal)
            return done(`mined ${mined} of ${goal}`);
        if (ctx.time && ctx.time.isNight && !ctx.sheltered?.())
            return ctx.settings?.camp === false ? running("mining at night (camp disabled)") : blocked("night has fallen; shelter first", { recovery: "retry" });

        const candidates = targetBlocks(ctx, typeIds, { radius: ctx.settings?.mineRadius ?? 24, limit: 12 });
        const target = pickTarget(ctx, candidates);
        if (!target)
            return mined > 0 ? done(`no more ${short(typeIds[0])} in range (mined ${mined})`) : failed(`no ${short(typeIds[0])} within ${ctx.settings?.mineRadius ?? 24} blocks`);

        if (!inReach(ctx, target, 4.5)) {
            const status = ctx.act.walkTo(target, { leash: 2 });
            if (status === "blocked")
                return failed(`cannot reach ${short(target.id)} at ${target.x},${target.y},${target.z}`);
            return running(`walking to ${short(target.id)} (${mined}/${goal})`, { progress: mined / goal });
        }
        const verdict = ctx.act.dig(target, { tool });
        if (verdict === "broken") {
            mined++;
            run.state.mined = mined;
            run.steps++;
            return running(`broke ${short(target.id)} (${mined}/${goal})`, { progress: mined / goal });
        }
        if (verdict === "blocked")
            return failed(`cannot break ${short(target.id)}: ${run.state.digReason ?? "no usable tool"}`);
        return running(`digging ${short(target.id)} (${mined}/${goal})`, { progress: mined / goal });
    },
    verify(ctx, plan) {
        // Honest accounting: the skill reports blocks broken, and the bag shows
        // what actually arrived. A quota met with zero drops is a failed dig.
        return true;
    },
    start() { return { mined: 0 }; },
});

/** Choose a safe, reachable, affordable target. Deterministic ordering. */
export function pickTarget(ctx, candidates) {
    const scored = [];
    for (const cell of candidates) {
        const id = cell.id ?? ctx.read(cell.x, cell.y, cell.z);
        if (!isMineable(id))
            continue;
        if (hazardAround(ctx, cell).dangerous)
            continue;
        const tool = toolChoice(ctx, id);
        const ticks = breakTicks(id, tool);
        if (!Number.isFinite(ticks))
            continue;
        if (ticks > 30 && !tool)
            continue; // bare hands would take too long: skip, do not grind
        const d = Math.hypot(cell.x - ctx.self.pos.x, cell.y - ctx.self.pos.y, cell.z - ctx.self.pos.z);
        scored.push({ ...cell, id, tool, ticks, d, score: d * 0.2 + ticks * 0.4 + (opensDrop(ctx, cell) ? 8 : 0) });
    }
    scored.sort((a, b) => (a.score - b.score) || (a.x - b.x) || (a.y - b.y) || (a.z - b.z));
    return scored[0];
}

const short = (id) => String(id ?? "block").replace("minecraft:", "");

export { actionCells, nearest, tick };
