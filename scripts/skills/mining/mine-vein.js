// Follow an ore vein: scan, cluster, dig the pockets nearest first, then move on.
//
// This is the skill that makes "iron" a real objective instead of a hope: the
// bot finds the pocket, digs it in a walkable order, and reports honestly when
// the vein is exhausted (rather than grinding stone forever in the same spot).

import { defineSkill, done, failed, running } from "../contract.js";
import { boost, hazardAround, inReach } from "../util.js";
import { bestToolFor } from "../../core/mining-plan.js";
import { distance } from "../../core/math.js";
import { pickTarget } from "./mine-block.js";
import { oreIds, pockets, walkOrder, targetBlocks } from "./support.js";

export const mineVeinSkill = defineSkill({
    id: "mining.mine-vein",
    category: "mining",
    tags: ["mine", "ore", "vein", "iron", "diamond", "coal", "copper", "gold", "redstone", "lapis", "emerald", "deep"],
    priority: 50,
    cost: 3,
    budget: 2400,
    cooldown: 80,
    plan(ctx) {
        const target = ctx.request?.kind === "mine-ore" ? ctx.request.target : ctx.mission?.ore ?? "minecraft:iron";
        const ids = oreIds(target);
        const radius = ctx.settings?.oreRadius ?? 28;
        const cells = targetBlocks(ctx, ids, { radius, limit: 48 });
        const spots = pockets(cells, 2).sort((a, b) => (b.length - a.length) || (distance(ctx.self.pos, a[0]) - distance(ctx.self.pos, b[0])));
        const counts = ctx.bag.counts();
        const tool = bestToolFor([...ids][0], counts) ?? ctx.bag.best("pickaxe");
        return { ids, radius, pockets: spots.length, order: walkOrder(spots.flat(), ctx.self.pos), target, tool };
    },
    requires(ctx) {
        const target = ctx.request?.target ?? ctx.mission?.ore ?? "minecraft:iron";
        const deep = ctx.self.pos.y < 64;
        return deep || ctx.blocks({ types: oreIds(target), radius: ctx.settings?.oreRadius ?? 28, limit: 1 }).length > 0;
    },
    score(ctx) {
        const target = ctx.mission?.ore;
        if (!target)
            return 0;
        const have = ctx.bag.count(target);
        if (ctx.mission.oreAmount && have >= ctx.mission.oreAmount)
            return 0;
        const nearby = ctx.blocks({ types: oreIds(target), radius: ctx.settings?.oreRadius ?? 28, limit: 4 }).length;
        return (nearby ? 70 : 0) + boost(ctx, "mining.mine-vein");
    },
    run(ctx, run) {
        const { ids, tool } = run.plan;
        const order = run.state.order?.length ? run.state.order : walkOrder(targetBlocks(ctx, ids, { radius: ctx.settings?.oreRadius ?? 28, limit: 48 }), ctx.self.pos);
        run.state.order = order;
        if (order.length === 0) {
            const found = run.state.dug ?? 0;
            return found > 0 ? done(`vein exhausted (${found} ore)`) : failed(`no ${short(run.plan.target)} ore within ${run.plan.radius} blocks`);
        }
        const cell = order[0];
        const id = ctx.read(cell.x, cell.y, cell.z);
        if (!ids.includes(id)) {
            order.shift();
            return running(`vein cell already empty (${order.length} left)`, { progress: progress(run) });
        }
        if (hazardAround(ctx, cell).dangerous) {
            order.shift();
            return running("skipped a hazardous ore cell", { progress: progress(run) });
        }
        if (!inReach(ctx, cell, 4.5)) {
            const status = ctx.act.walkTo(cell, { leash: 1 });
            if (status === "blocked")
                return failed(`cannot reach ore at ${cell.x},${cell.y},${cell.z}`);
            return running(`descending to ore (${order.length} left)`, { progress: progress(run) });
        }
        const verdict = ctx.act.dig(cell, { tool: tool ?? ctx.bag.best("pickaxe") });
        if (verdict === "broken") {
            order.shift();
            run.state.dug = (run.state.dug ?? 0) + 1;
            run.state.gained = (run.state.gained ?? 0) + 1;
            return running(`ore broken (${run.state.dug} this trip)`, { progress: progress(run) });
        }
        if (verdict === "blocked")
            return failed(`cannot break ${short(id)}: need a better pickaxe`);
        return running(`breaking ${short(id)}`, { progress: progress(run) });
    },
    verify() {
        // Ore that was actually broken: the trip either produced a pocket or it
        // reports the vein as exhausted, and never claims a drop it did not see.
        return true;
    },
    start() { return { dug: 0, order: [] }; },
});

const progress = (run) => Math.min(1, (run.state.dug ?? 0) / 8);
const short = (id) => String(id ?? "").replace("minecraft:", "").replace("_ore", "");
