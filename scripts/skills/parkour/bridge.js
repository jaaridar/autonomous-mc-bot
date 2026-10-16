// Bridge across a gap, one block at a time, checking each placement.
//
// Bridging is how the bot crosses ravines, rivers and its own mining trenches.
// The unsafe version of this skill walks off a ledge and dies; so every step
// verifies (a) the bot has blocks, (b) the next cell is empty and not a hazard,
// and (c) the placement actually happened before stepping onto it.

import { defineSkill, done, failed, running } from "../contract.js";
import { boost, hazardAround } from "../util.js";
import { bridgeCells } from "../../core/parkour-plan.js";
import { bagBlock, countBlocks, destination } from "./reach.js";

export const bridgeSkill = defineSkill({
    id: "parkour.bridge",
    category: "parkour",
    tags: ["bridge", "gap", "ravine", "cross", "place"],
    priority: 52,
    cost: 2,
    budget: 900,
    cooldown: 60,
    plan(ctx) {
        const goal = destination(ctx) ?? ctx.mission?.travelTo;
        if (!goal)
            return { goal: null };
        const from = floorSelf(ctx);
        const cells = bridgeCells(ctx.read, from, goal, 12);
        return { goal, cells, block: bagBlock(ctx), available: countBlocks(ctx) };
    },
    requires(ctx) {
        const goal = destination(ctx);
        if (!goal || countBlocks(ctx) <= 0)
            return false;
        const from = floorSelf(ctx);
        if (distance2(ctx.self.pos, goal) < 2)
            return false;
        // Only bridge when the direct line actually needs a floor.
        const cells = bridgeCells(ctx.read, from, goal, 4);
        return cells.some((c) => c.kind === "bridge");
    },
    score(ctx) {
        return 25 + boost(ctx, "parkour.bridge");
    },
    run(ctx, run) {
        const cells = run.state.cells?.length ? run.state.cells : (run.plan.cells ?? []);
        run.state.cells = cells;
        if (cells.length === 0)
            return done("nothing to bridge");
        const cell = cells[0];
        if (countBlocks(ctx) <= 0)
            return failed("out of building blocks");
        const id = ctx.read(cell.x, cell.y, cell.z);
        if (id !== "minecraft:air" && id !== "minecraft:water") {
            cells.shift();
            return running(`already solid at ${cell.x},${cell.y},${cell.z} (${cells.length} left)`);
        }
        if (cell.kind === "bridge") {
            const hazard = hazardAround(ctx, cell);
            if (hazard.dangerous)
                return failed(`refusing to bridge over ${short(hazard.id)}`);
            if (distance3(ctx.self.pos, cell) > 4.5) {
                const status = ctx.act.walkTo(cell, { leash: 0.8 });
                if (status === "blocked")
                    return failed("cannot reach the bridge head");
                return running("approaching the gap");
            }
            const placed = ctx.act.place(cell, { item: bagBlock(ctx) });
            if (!placed)
                return running(`placing ${short(bagBlock(ctx))}`);
            cells.shift();
            run.steps++;
            return running(`bridged ${run.steps} block(s), ${cells.length} left`);
        }
        // "clear" cells: dig through instead of placing.
        const verdict = ctx.act.dig(cell, {});
        if (verdict === "broken")
            cells.shift();
        if (verdict === "blocked")
            return failed(`cannot clear ${short(id)}`);
        return running(`clearing ${short(id)}`);
    },
    verify(ctx, plan) {
        return !plan.goal || distance2(ctx.self.pos, plan.goal) < 2 || ctx.read(Math.floor(ctx.self.pos.x), Math.floor(ctx.self.pos.y) - 1, Math.floor(ctx.self.pos.z)) !== "minecraft:air";
    },
    start() { return { cells: [] }; },
});

const floorSelf = (ctx) => ({ x: Math.floor(ctx.self.pos.x), y: Math.floor(ctx.self.pos.y), z: Math.floor(ctx.self.pos.z) });
const distance3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const distance2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const short = (id) => String(id ?? "").replace("minecraft:", "");
