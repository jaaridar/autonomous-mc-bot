// Shared mining helpers used by more than one mining skill.
//
// `targetBlocks` is the one place that decides which blocks count as a target -
// a scan over the live world through ctx.blocks(), filtered by the same
// mineability/hazard rules everywhere, so no skill can quietly mine lava or a
// player's chest.

import { HARDNESS } from "../../core/data/hardness.js";
import { PICKAXE_EXEMPT, RESTRICTED_BLOCKS, canonicalBlock } from "../../core/data/block-rules.js";
import { breakTicks, harvestRequirement, isMineable, oreVeinIds, toolProfile } from "../../core/mining-plan.js";
import { distance } from "../../core/math.js";

// Re-exported so skills import mining knowledge from one place.
export { HARDNESS, PICKAXE_EXEMPT, RESTRICTED_BLOCKS, canonicalBlock, breakTicks, harvestRequirement, isMineable, oreVeinIds, toolProfile, distance };

/** Blocks of the requested types near the bot, nearest first, filtered safe. */
export function targetBlocks(ctx, typeIds, { radius = 24, limit = 16, mineableOnly = true } = {}) {
    const found = ctx.blocks({ types: typeIds, radius, limit: limit * 3 });
    const out = [];
    for (const cell of found) {
        const id = cell.id ?? ctx.read(cell.x, cell.y, cell.z);
        if (mineableOnly && !isMineable(id))
            continue;
        out.push({ ...cell, id, distance: distance(ctx.self.pos, cell) });
    }
    out.sort((a, b) => (a.distance - b.distance) || (a.x - b.x) || (a.y - b.y) || (a.z - b.z));
    return out.slice(0, limit);
}

/** The item the bot should hold to break a block, from what it carries. */
export function toolChoice(ctx, typeId) {
    const need = harvestRequirement(typeId);
    const counts = ctx.bag.counts();
    if (!need)
        return ctx.bag.best("pickaxe") ?? ctx.bag.best("axe") ?? ctx.bag.best("shovel");
    return ctx.bag.best(need.tool, { minTier: need.tier });
}

/** Cells a skill may dig to move: mineable and not restricted. */
export function actionCells(ctx, cells) {
    return cells.filter((cell) => isMineable(ctx.read(cell.x, cell.y, cell.z)));
}

/** Ore ids plus their deepslate variants, for vein scans. */
export function oreIds(oreId) {
    return [...oreVeinIds(oreId)];
}

/** Group a block list into pockets 2 blocks apart - the vein the bot follows. */
export function pockets(cells, join = 2) {
    const clusters = [];
    const seen = new Set();
    const keyOf = (c) => `${c.x},${c.y},${c.z}`;
    for (const cell of cells) {
        if (seen.has(keyOf(cell)))
            continue;
        const cluster = [cell];
        seen.add(keyOf(cell));
        const queue = [cell];
        while (queue.length) {
            const p = queue.shift();
            for (const other of cells) {
                if (seen.has(keyOf(other)))
                    continue;
                if (Math.abs(other.x - p.x) <= join && Math.abs(other.y - p.y) <= join && Math.abs(other.z - p.z) <= join) {
                    seen.add(keyOf(other));
                    cluster.push(other);
                    queue.push(other);
                }
            }
        }
        clusters.push(cluster);
    }
    return clusters;
}

/** Sort cells into a dig order the bot can walk (nearest-first, chain). */
export function walkOrder(cells, from) {
    const remaining = [...cells];
    const out = [];
    let cursor = { ...from };
    while (remaining.length) {
        remaining.sort((a, b) => (distance(cursor, a) - distance(cursor, b)) || (a.y - b.y) || (a.x - b.x) || (a.z - b.z));
        const next = remaining.shift();
        out.push(next);
        cursor = next;
    }
    return out;
}
