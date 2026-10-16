// Shared helpers for skills - pure functions over the skill context.
//
// Anything two skills would otherwise copy lives here: target picking, reach and
// standability checks, food choice, tool choice, the intent boost lookup. Pure
// and engine-free, so it is all unit-testable.

import { distance, horizontal, key } from "../core/math.js";
import { FOOD } from "../core/world.js";
import { itemValue } from "../core/data/item-values.js";
import { isMineable, toolProfile, harvestRequirement, breakTicks, bestToolFor } from "../core/mining-plan.js";
import { armorScore, maxStack, weaponDamage, weaponTier } from "../core/inventory-model.js";
import { isHazard, isPassable, standable as pureStandable } from "../core/parkour-plan.js";

export { distance, horizontal, key, isHazard, isPassable, itemValue, maxStack, weaponDamage, armorScore, toolProfile };

/** How much the current intent wants this skill, as a score bonus. */
export function boost(ctx, id) {
    return ctx.intent?.boosts?.[id] ?? 0;
}

/** Nearest of a list of positions to the bot, deterministic tie-break. */
export function nearest(ctx, positions) {
    let best;
    let bestDistance = Infinity;
    for (const p of positions ?? []) {
        const d = distance(ctx.self.pos, p);
        if (d < bestDistance - 1e-9 || (Math.abs(d - bestDistance) < 1e-9 && best && key(p) < key(best))) {
            bestDistance = d;
            best = p;
        }
    }
    return best ? { ...best, distance: bestDistance } : undefined;
}

/** Best food item id in the bag, by hunger restored per item held. */
export function bestFood(ctx) {
    let best;
    for (const [id, amount] of Object.entries(ctx.bag?.counts?.() ?? {})) {
        if (amount <= 0 || !FOOD.has(id))
            continue;
        const food = ctx.foodValue?.(id) ?? 1;
        const score = food;
        if (!best || score > best.score || (score === best.score && id < best.id))
            best = { id, score, amount };
    }
    return best?.id;
}

/** Do we hold any food at all? */
export function hasFood(ctx) {
    return !!bestFood(ctx);
}

/** Tool for a block, from what the bot holds right now. */
export function toolFor(ctx, typeId) {
    const counts = ctx.bag?.counts?.() ?? {};
    const chosen = bestToolFor(typeId, counts);
    if (chosen)
        return chosen;
    const need = harvestRequirement(typeId);
    if (!need)
        return undefined;
    return undefined;
}

/** Is the target block within the bot's current reach? */
export function inReach(ctx, cell, reach = 4.5) {
    return distance(ctx.self.pos, { x: cell.x + 0.5, y: cell.y + 0.5, z: cell.z + 0.5 }) <= reach;
}

/** Type id at a cell, safely. */
export function at(ctx, cell) {
    return ctx.read(cell.x, cell.y, cell.z);
}

/** Can the bot stand at this cell (using the live world read)? */
export function canStand(ctx, cell) {
    return ctx.standable ? ctx.standable(cell) : pureStandable(ctx.read, cell);
}

/**
 * A walking surface next to a target cell: where the bot should stand to mine
 * or place something. Prefers the cardinal neighbour closest to the bot.
 */
export function approachCell(ctx, target, { reach = 4.5 } = {}) {
    const candidates = [];
    for (let dx = -1; dx <= 1; dx++)
        for (let dz = -1; dz <= 1; dz++) {
            if (dx === 0 && dz === 0)
                continue;
            for (const dy of [0, 1, -1]) {
                const cell = { x: target.x + dx, y: target.y + dy, z: target.z + dz };
                if (!canStand(ctx, cell))
                    continue;
                const d = distance(ctx.self.pos, cell);
                if (d > reach + 4)
                    continue;
                candidates.push({ ...cell, d });
            }
        }
    candidates.sort((a, b) => (a.d - b.d) || (a.x - b.x) || (a.z - b.z));
    return candidates[0];
}

/** Drop the least valuable stack(s) to free slots. Returns what it dropped. */
export function dropJunk(ctx, needed, { keep = [] } = {}) {
    const keepSet = new Set(keep);
    const junk = ctx.bag.junk(needed, itemValue, { keep: (id) => keepSet.has(id) });
    const dropped = [];
    for (const { slot } of junk) {
        if (!slot)
            continue;
        ctx.act.drop(slot.typeId, slot.amount);
        dropped.push({ typeId: slot.typeId, amount: slot.amount });
    }
    return dropped;
}

/** Mining progress bookkeeping shared by the dig-oriented skills. */
export class Progress {
    constructor(goal) {
        this.goal = goal;
        this.done = 0;
        this.attempts = 0;
        this.firstSeen = new Map();
    }
    advance(n = 1) {
        this.done += n;
        return this.ratio;
    }
    get ratio() {
        return this.goal <= 0 ? 1 : Math.min(1, this.done / this.goal);
    }
    complete() {
        return this.done >= this.goal;
    }
    /**
     * Watch a cell across ticks: true when it has not changed for `ticks` while
     * the bot was supposedly digging it (a stuck dig, not a slow one).
     */
    stalled(cell, typeId, tick, ticks = 60) {
        const k = key(cell);
        const seen = this.firstSeen.get(k);
        if (!seen || seen.typeId !== typeId) {
            this.firstSeen.set(k, { typeId, tick });
            return false;
        }
        return tick - seen.tick > ticks;
    }
}

/** Cells of a 3x3x3 neighbourhood (used for safety checks). */
export function around(cell, radius = 1) {
    const cells = [];
    for (let dx = -radius; dx <= radius; dx++)
        for (let dy = -radius; dy <= radius; dy++)
            for (let dz = -radius; dz <= radius; dz++) {
                if (dx === 0 && dy === 0 && dz === 0)
                    continue;
                cells.push({ x: cell.x + dx, y: cell.y + dy, z: cell.z + dz });
            }
    return cells;
}

/** Is any neighbouring block lava/fire/powder snow (the dig-safety check)? */
export function hazardAround(ctx, cell) {
    for (const c of around(cell, 1)) {
        const id = at(ctx, c);
        if (/lava|fire|soul_fire|powder_snow|magma/.test(id))
            return { dangerous: true, at: c, id };
    }
    return { dangerous: false };
}

/** Would digging this cell open a hole over a drop the bot cannot escape? */
export function opensDrop(ctx, cell, { maxDrop = 3 } = {}) {
    const below = { x: cell.x, y: cell.y - 1, z: cell.z };
    const id = at(ctx, below);
    if (isPassable(id))
        return true;
    let depth = 0;
    for (let i = 1; i <= maxDrop + 1; i++) {
        const under = at(ctx, { x: cell.x, y: cell.y - i, z: cell.z });
        if (isPassable(under))
            depth++;
        else
            break;
    }
    return depth >= maxDrop;
}

/** Time in ticks this bot needs to break a cell with what it holds. */
export function ticksToBreak(ctx, cell, toolId) {
    const id = at(ctx, cell);
    if (!isMineable(id))
        return Infinity;
    return breakTicks(id, toolId ?? toolFor(ctx, id));
}

/** Decide whether a mining trip can pay for itself (used by trip skills). */
export function tripAffordable(ctx, cells, toolId) {
    let ticks = 0;
    for (const cell of cells) {
        const id = at(ctx, cell);
        if (!isMineable(id))
            continue;
        ticks += breakTicks(id, toolId);
    }
    return { ticks, cells: cells.length, seconds: ticks / 20 };
}

/** Re-exported for skills that need the standability rule without the wrapper. */
export function readStandable(ctx, cell) {
    return pureStandable(ctx.read, cell);
}

/**
 * The tick the context was built for. Skills read time from here and never from
 * a clock, which is what makes a replay of the same seed identical.
 */
export function tick(ctx) {
    return ctx.tick ?? 0;
}

// Equipment/tool numbers are used by several meta skills; re-exported so a skill
// only needs one import from the pure layer.
export { weaponTier };
