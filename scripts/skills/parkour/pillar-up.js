// Pillar up: place a block under yourself and jump onto it, repeatedly.
//
// The escape hatch of Minecraft survival - out of a ravine, over a wall, away
// from a mob pile. Requires blocks and headroom; refuses when the ceiling is
// solid, because that is the classic "bot suffocates itself" failure.

import { defineSkill, done, failed, running } from "../contract.js";
import { boost } from "../util.js";
import { ascendPlan } from "../../core/mining-plan.js";
import { bagBlock, countBlocks } from "./reach.js";

export const pillarUpSkill = defineSkill({
    id: "parkour.pillar-up",
    category: "parkour",
    tags: ["pillar", "escape", "climb", "tower", "scaffold"],
    priority: 58,
    cost: 2,
    budget: 600,
    cooldown: 60,
    plan(ctx) {
        const height = ctx.request?.height ?? ctx.mission?.escapeHeight ?? 4;
        const start = floorSelf(ctx);
        return { height, cells: ascendPlan(start, { height }), block: bagBlock(ctx), available: countBlocks(ctx) };
    },
    requires(ctx) {
        return countBlocks(ctx) > 0 && ctx.self.onGround;
    },
    score(ctx) {
        const trapped = ctx.self.trapped || ctx.mission?.escapeHeight;
        if (!trapped)
            return boost(ctx, "parkour.pillar-up");
        return 60 + boost(ctx, "parkour.pillar-up");
    },
    run(ctx, run) {
        const cells = run.state.cells?.length ? run.state.cells : run.plan.cells;
        run.state.cells = cells;
        if (cells.length === 0)
            return done(`pillared up to y=${Math.round(ctx.self.pos.y)}`);
        const target = cells[0];
        const feet = { x: target.x, y: target.y, z: target.z };
        const head = { x: target.x, y: target.y + 1, z: target.z };
        if (countBlocks(ctx) <= 0)
            return failed("out of blocks to pillar with");
        // Ceiling check: pillaring into a solid ceiling traps the bot in a wall.
        if (!isOpen(ctx.read(head.x, head.y, head.z)))
            return failed("ceiling is solid; cannot pillar up here");
        if (Math.abs(ctx.self.pos.y - target.y) < 0.6 && isStanding(ctx, target)) {
            cells.shift();
            return running(`pillared to y=${Math.round(ctx.self.pos.y)}`);
        }
        if (isOpen(ctx.read(feet.x, feet.y, feet.z)) && isStanding(ctx, target)) {
            const placed = ctx.act.place(feet, { item: bagBlock(ctx) });
            if (!placed)
                return running("placing the pillar block");
            return running(`pillar block placed at y=${feet.y}`);
        }
        if (!isStanding(ctx, target)) {
            // Still standing below the block we placed: jump onto it.
            ctx.act.jump();
            return running("jumping onto the pillar");
        }
        cells.shift();
        return running(`pillar step up (${cells.length} left)`);
    },
    verify(ctx, plan) {
        return ctx.self.pos.y >= plan.cells[0]?.y ?? false;
    },
    start() { return { cells: [] }; },
});

/** The bot is standing on the block below `cell`. */
function isStanding(ctx, cell) {
    return Math.abs(ctx.self.pos.y - cell.y) < 1.2;
}

const floorSelf = (ctx) => ({ x: Math.floor(ctx.self.pos.x), y: Math.floor(ctx.self.pos.y), z: Math.floor(ctx.self.pos.z) });
const isOpen = (id) => id === "minecraft:air" || id === "minecraft:cave_air";
