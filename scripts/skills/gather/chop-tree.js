// Fell a tree: the first resource of every survival run.
//
// The bot digs the trunk from the bottom up, then the canopy if it still needs
// wood, and never leaves a floating stump it will fall off later. Wood is also
// the trigger for the whole tech tree, so this skill reports how much it actually
// collected - the craft planner consumes that number.

import { defineSkill, done, failed, running } from "../contract.js";
import { boost, inReach } from "../util.js";
import { breakTicks } from "../../core/mining-plan.js";
import { targetBlocks, walkOrder } from "../mining/support.js";
import { isAnyLog } from "../../core/progression.js";

export const chopTreeSkill = defineSkill({
    id: "gather.chop-tree",
    category: "gather",
    tags: ["wood", "log", "tree", "chop", "timber", "starter"],
    priority: 47,
    cost: 2,
    budget: 1200,
    cooldown: 40,
    plan(ctx) {
        const typeIds = ctx.request?.kind === "mine" ? [ctx.request.target] : ["#logs"];
        const cells = targetBlocks(ctx, typeIds, { radius: ctx.settings?.woodRadius ?? 20, limit: 32 });
        return { amount: ctx.request?.amount ?? 4, cells: walkOrder(cells, ctx.self.pos), tool: ctx.bag.best("axe"), typeIds };
    },
    requires(ctx) {
        return ctx.blocks({ types: ["#logs"], radius: ctx.settings?.woodRadius ?? 20, limit: 1 }).length > 0;
    },
    score(ctx) {
        const need = ctx.mission?.wood ?? 0;
        const have = countLogs(ctx);
        if (need && have >= need)
            return 0;
        const nearby = ctx.blocks({ types: ["#logs"], radius: ctx.settings?.woodRadius ?? 20, limit: 2 }).length;
        return (nearby ? 45 : 12) + boost(ctx, "gather.chop-tree");
    },
    run(ctx, run) {
        const order = run.state.order?.length ? run.state.order : run.plan.cells;
        run.state.order = order;
        const goal = run.plan.amount;
        if ((run.state.logs ?? 0) >= goal)
            return done(`collected ${run.state.logs} logs`);
        if (order.length === 0)
            return run.state.logs ? done(`chopped ${run.state.logs ?? 0} logs, no more nearby`) : failed("no tree within range");
        const cell = order[0];
        const id = ctx.read(cell.x, cell.y, cell.z);
        if (!isAnyLog(id)) {
            order.shift();
            return running(`trunk cell already gone (${order.length} left)`);
        }
        if (!inReach(ctx, cell, 4.5)) {
            const status = ctx.act.walkTo(cell, { leash: 1.5 });
            if (status === "blocked")
                return failed(`cannot reach the trunk at ${cell.x},${cell.y},${cell.z}`);
            return running(`walking to the trunk (${order.length} cells)`);
        }
        const verdict = ctx.act.dig(cell, { tool: run.plan.tool ?? ctx.bag.best("axe") });
        if (verdict === "broken") {
            order.shift();
            run.state.logs = (run.state.logs ?? 0) + 1;
            if (breakTicks(id, run.plan.tool) > 40)
                return running(`slow chop: no axe (${run.state.logs}/${goal})`);
            return running(`chopped ${short(id)} (${run.state.logs}/${goal})`, { progress: run.state.logs / goal });
        }
        if (verdict === "blocked")
            return failed(`cannot break ${short(id)}`);
        return running(`chopping ${short(id)}`, { progress: (run.state.logs ?? 0) / goal });
    },
    verify(ctx, plan) {
        return true;
    },
    start() { return { logs: 0, order: [] }; },
});

export function countLogs(ctx) {
    let n = 0;
    for (const [id, amount] of Object.entries(ctx.bag.counts()))
        if (isAnyLog(id))
            n += amount;
    return n;
}

const short = (id) => String(id ?? "").replace("minecraft:", "");
