// Build cover when a fight cannot be won in the open.
//
// The bot walls itself into a 1x1x2 pocket (or behind a wall) and fights from
// cover - the tactic that keeps a low-health bot alive until the mobs lose
// interest. Every block placed must be diggable again by the bot itself, so
// "cover" can never become a coffin.

import { defineSkill, done, failed, running } from "../contract.js";
import { boost } from "../util.js";
import { COMPASS } from "../../core/math.js";
import { isBuildingBlock } from "../parkour/reach.js";

export const bunkerSkill = defineSkill({
    id: "combat.bunker",
    category: "combat",
    tags: ["bunker", "cover", "wall", "shelter", "survive", "defend"],
    priority: 90,
    cost: 2,
    budget: 500,
    cooldown: 120,
    plan(ctx) {
        const here = floorSelf(ctx);
        const threats = ctx.threats(12);
        const towards = threats[0]?.pos;
        const walls = [];
        for (const dir of COMPASS) {
            if (towards) {
                // Only wall off the side the threat is on.
                const towardsDir = { x: Math.sign(towards.x - ctx.self.pos.x), z: Math.sign(towards.z - ctx.self.pos.z) };
                if (dir.x !== towardsDir.x && dir.z !== towardsDir.z && dir.x !== 0 && dir.z !== 0)
                    continue;
            }
            walls.push({ x: here.x + dir.x, y: here.y, z: here.z + dir.z, dir });
            walls.push({ x: here.x + dir.x, y: here.y + 1, z: here.z + dir.z, dir });
        }
        return { walls: walls.slice(0, 6), block: ctx.bag.counts()["minecraft:cobblestone"] ? "minecraft:cobblestone" : bestBlock(ctx), threats: threats.length };
    },
    requires(ctx) {
        return ctx.threats(10).length >= 2 && hasBlocks(ctx);
    },
    score(ctx) {
        const threats = ctx.threats(10);
        if (threats.length < 2 || !hasBlocks(ctx))
            return 0;
        const low = ctx.self.hp <= (ctx.settings?.criticalHp ?? 6) + 6;
        return (low ? 86 : 40) + threats.length * 2 + boost(ctx, "combat.bunker");
    },
    run(ctx, run) {
        const threats = ctx.threats(12);
        if (threats.length === 0)
            return done("cover no longer needed");
        if (!hasBlocks(ctx))
            return failed("out of blocks to build cover with");
        const walls = run.state.walls?.length ? run.state.walls : run.plan.walls;
        run.state.walls = walls;
        if (walls.length === 0)
            return done("cover built");
        const wall = walls[0];
        if (ctx.read(wall.x, wall.y, wall.z) !== "minecraft:air") {
            walls.shift();
            return running("wall already solid");
        }
        const placed = ctx.act.place(wall, { item: run.plan.block });
        if (!placed)
            return failed("block placement refused");
        walls.shift();
        run.steps++;
        return running(`cover: ${run.steps} block(s) placed`);
    },
    verify(ctx) {
        return ctx.threats(6).length === 0;
    },
    start() { return { walls: [] }; },
});

function hasBlocks(ctx) {
    for (const [id, amount] of Object.entries(ctx.bag.counts()))
        if (amount > 0 && isBuildingBlock(id))
            return true;
    return false;
}
function bestBlock(ctx) {
    for (const [id, amount] of Object.entries(ctx.bag.counts()))
        if (amount > 0 && isBuildingBlock(id))
            return id;
    return undefined;
}
const floorSelf = (ctx) => ({ x: Math.floor(ctx.self.pos.x), y: Math.floor(ctx.self.pos.y), z: Math.floor(ctx.self.pos.z) });
