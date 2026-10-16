// Branch mining at a target depth - the diamond-pattern work.
//
// Layout comes from core/mining-plan.js branchLayout(): a main corridor with
// side branches. The skill walks the layout, digs what is solid, lights the
// corridor every few blocks (torches prevent the classic "miner gets ambushed in
// the dark" failure), and reports ore found rather than stone removed.

import { defineSkill, done, failed, running } from "../contract.js";
import { boost, hazardAround, inReach } from "../util.js";
import { branchLayout, orderDigPath } from "../../core/mining-plan.js";
import { COMPASS } from "../../core/math.js";
import { oreIds, toolChoice } from "./support.js";

const TORCH_EVERY = 6;

export const branchMineSkill = defineSkill({
    id: "mining.branch",
    category: "mining",
    tags: ["branch", "diamond", "deep", "efficient", "ores"],
    priority: 46,
    cost: 4,
    budget: 4800,
    cooldown: 200,
    plan(ctx) {
        const targetY = ctx.mission?.targetY ?? -54;
        const dir = chooseDirection(ctx);
        const start = { x: Math.floor(ctx.self.pos.x), y: Math.floor(ctx.self.pos.y), z: Math.floor(ctx.self.pos.z) };
        const cells = branchLayout(start, dir, { length: 40, spacing: 4, branchLength: 10 });
        return { targetY, dir, cells, tool: toolChoice(ctx, "minecraft:stone"), ore: ctx.mission?.ore ?? "minecraft:diamond" };
    },
    requires(ctx) {
        return ctx.settings?.deepMining !== false && ctx.bag.best("pickaxe", { minTier: 2 }) !== undefined;
    },
    score(ctx) {
        if (ctx.mission?.ore !== "minecraft:diamond")
            return boost(ctx, "mining.branch") * 0.5;
        const have = ctx.bag.count("minecraft:diamond");
        if ((ctx.mission?.oreAmount ?? 3) <= have)
            return 0;
        return 55 + boost(ctx, "mining.branch");
    },
    run(ctx, run) {
        const remaining = run.state.remaining?.length ? run.state.remaining : orderDigPath(run.plan.cells, ctx.self.pos);
        run.state.remaining = remaining;
        if (remaining.length === 0)
            return done(`branch layout finished: ${run.state.ore ?? 0} ore, ${run.steps} blocks dug`);
        const cell = remaining[0];
        const id = ctx.read(cell.x, cell.y, cell.z);
        if (isOpen(id)) {
            remaining.shift();
            maybeTorch(ctx, run, cell);
            return running(`walking branch (${remaining.length} left)`);
        }
        if (!inReach(ctx, cell, 4.5)) {
            const status = ctx.act.walkTo(cell, { leash: 1 });
            if (status === "blocked")
                return failed("branch corridor blocked");
            return running(`advancing (${remaining.length} cells left)`, { progress: progress(run) });
        }
        const hazard = hazardAround(ctx, cell);
        if (hazard.dangerous) {
            remaining.shift();
            return running(`bypassed ${short(hazard.id)}`);
        }
        const verdict = ctx.act.dig(cell, { tool: run.plan.tool });
        if (verdict === "blocked")
            return failed(`cannot break ${short(id)}`);
        if (verdict === "broken") {
            if (run.plan.ore && id.includes(run.plan.ore.replace("minecraft:", "").replace("diamond", "diamond_ore")).replace(/.*_ore/, "_ore").length > 0 && /_ore$|^minecraft:(diamond|gold|iron|redstone|lapis|coal|emerald|copper)$/.test(id))
                run.state.ore = (run.state.ore ?? 0) + 1;
            remaining.shift();
            maybeTorch(ctx, run, cell);
            return running(`dug ${short(id)} (${remaining.length} left)`, { progress: progress(run) });
        }
        return running(`digging ${short(id)}`, { progress: progress(run) });
    },
    verify() {
        // A branch trip is "done" when the layout is walked; the ore count is
        // reported, never assumed.
        return true;
    },
    start() { return { remaining: [], torches: 0, ore: 0 }; },
});

/** Place a torch every few blocks so the corridor is not a mob spawn tube. */
function maybeTorch(ctx, run, cell) {
    run.steps++;
    if (run.steps % TORCH_EVERY !== 0)
        return;
    if (!ctx.bag.has("minecraft:torch", 1))
        return;
    const support = { x: cell.x, y: cell.y - 1, z: cell.z };
    if (ctx.standable(support) || ctx.read(support.x, support.y, support.z) !== "minecraft:air") {
        if (ctx.act.place(cell, { item: "minecraft:torch" }))
            run.state.torches = (run.state.torches ?? 0) + 1;
    }
}

function chooseDirection(ctx) {
    let best;
    for (const dir of COMPASS) {
        const x = Math.floor(ctx.self.pos.x) + dir.x * 2;
        const z = Math.floor(ctx.self.pos.z) + dir.z * 2;
        const y = Math.floor(ctx.self.pos.y);
        let score = 0;
        for (let i = 1; i <= 4; i++) {
            const id = ctx.read(x + dir.x * i, y, z + dir.z * i);
            if (id === "minecraft:air")
                score += 1;
            if (/lava|water/.test(id))
                score -= 6;
        }
        if (!best || score > best.score || (score === best.score && (dir.x < best.dir.x || (dir.x === best.dir.x && dir.z < best.dir.z))))
            best = { dir, score };
    }
    return best?.dir ?? { x: 1, y: 0, z: 0 };
}

const progress = (run) => 1 - run.state.remaining.length / Math.max(1, run.plan.cells.length);
const isOpen = (id) => id === "minecraft:air" || id === "minecraft:cave_air";
const short = (id) => String(id ?? "").replace("minecraft:", "");
export { oreIds };
