// Parkour: turn "go from A to B" into the movement the bot must actually
// perform - walk, jump, sprint-jump, drop, swim, climb, bridge or pillar.
//
// core/navigation.js owns *where* to go (A* with parkour edges); this module
// owns *how* each step is executed, how long it takes, and what it needs in the
// hand (a block to bridge with, nothing to jump a gap). Keeping the two apart is
// what lets a skill verify a movement before committing to it: if the plan says
// "sprint-jump a 4-block gap" the bot had better have a run-up and a landing.
//
// Pure: the caller supplies read(x, y, z) => typeId.

import { add, key } from "./math.js";

export const PRIMITIVES = {
    walk: { cost: 1.0, needs: null },
    jump: { cost: 1.4, needs: null },
    "jump-up": { cost: 1.6, needs: null },
    "sprint-jump": { cost: 1.8, needs: null },
    drop: { cost: 1.2, needs: null },
    swim: { cost: 2.0, needs: null },
    climb: { cost: 2.2, needs: null },
    bridge: { cost: 4.0, needs: "blocks" },
    pillar: { cost: 4.5, needs: "blocks" },
    dig: { cost: 6.0, needs: "tool" },
    nope: { cost: Infinity, needs: null },
};

const AIR = /^(minecraft:(air|cave_air|void_air))$/;
const PASSABLE_HINT = /(short_grass|tall_grass|fern|deadbush|dead_bush|flower|sapling|torch|rail|_carpet$|lily_pad|vine|snow_layer|leaf_litter|pink_petals|wheat$|carrots$|potatoes$|beetroots$|sugar_cane|redstone_wire|tripwire$|_button$|_plate$|bush$)/;
const LIQUID = /(water|flowing_water|lava|flowing_lava|bubble_column)/;
const CLIMBABLE = /(ladder|vine|scaffolding|_stem$|_hyphae$)/;
const SAFE_FALL = /(water|flowing_water|bubble_column|hay_block|slime_block|powder_snow|honey_block|_bed$|scaffolding|cobweb|sweet_berry_bush)/;

export function isAir(id) { return AIR.test(id); }
export function isPassable(id) { return AIR.test(id) || PASSABLE_HINT.test(id) || LIQUID.test(id); }
export function isLiquid(id) { return LIQUID.test(id); }
export function isLava(id) { return /lava/.test(id); }
export function isClimbable(id) { return CLIMBABLE.test(id); }
export function isHazard(id) { return /(lava|fire|soul_fire|magma_block|cactus|powder_snow|campfire)/.test(id); }

/** Can the bot stand at p: two passable cells with solid ground below (or liquid to swim). */
export function standable(read, p) {
    const feet = read(p.x, p.y, p.z);
    const head = read(p.x, p.y + 1, p.z);
    if (!isPassable(feet) || !isPassable(head))
        return false;
    const below = read(p.x, p.y - 1, p.z);
    if (isHazard(below))
        return false;
    return true;
}

/** How far down the first solid/hazard surface is below a cell. */
export function dropDepth(read, p, max = 24) {
    for (let d = 1; d <= max; d++) {
        const id = read(p.x, p.y - d, p.z);
        if (isLiquid(id) || (!isAir(id) && !isPassable(id)))
            return { depth: d - 1, landing: id, at: { x: p.x, y: p.y - d, z: p.z } };
    }
    return { depth: max, landing: "minecraft:air", at: { x: p.x, y: p.y - max, z: p.z } };
}

/**
 * Measure the gap straight ahead: how many empty cells before `dir` hits
 * something, and what the landing looks like.
 */
export function gapInfo(read, from, dir, max = 6) {
    let gap = 0;
    let cursor = { ...from };
    while (gap < max) {
        cursor = { x: cursor.x + dir.x, y: cursor.y, z: cursor.z + dir.z };
        const feet = read(cursor.x, cursor.y, cursor.z);
        const head = read(cursor.x, cursor.y + 1, cursor.z);
        const floor = read(cursor.x, cursor.y - 1, cursor.z);
        if (isPassable(feet) && isPassable(head)) {
            // A jumpable landing: solid (or safe) floor with head room.
            const solidFloor = !isAir(floor) && !isPassable(floor) && !isLava(floor);
            if (solidFloor)
                return { cells: gap, landing: { ...cursor }, floor, safe: !isHazard(floor) };
            gap++;
            continue;
        }
        // Blocked by terrain: jump-up if the obstacle is one block tall.
        const above = read(cursor.x, cursor.y + 1, cursor.z);
        const above2 = read(cursor.x, cursor.y + 2, cursor.z);
        if (!isPassable(feet) && isPassable(above) && isPassable(above2))
            return { cells: gap, landing: { ...cursor }, floor: read(cursor.x, cursor.y - 1, cursor.z), stepUp: true, safe: true };
        return { cells: gap, blockedBy: feet, safe: false };
    }
    return { cells: gap, safe: false, exhausted: true };
}

/** Movement primitive to get from one cell to an adjacent/close one. */
export function primitiveFor(read, from, to) {
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const dy = to.y - from.y;
    const steps = Math.abs(dx) + Math.abs(dz);
    if (steps === 0 && dy === 0)
        return { kind: "walk", cost: 0 };
    const dir = steps > 0 ? { x: Math.sign(dx), y: 0, z: Math.sign(dz) } : { x: 0, y: 0, z: 0 };
    // Vertical first: a wall in the way is either jumped or pillared.
    if (dy >= 1) {
        if (dy === 1 && steps <= 1 && standable(read, to))
            return { kind: "jump-up", cost: PRIMITIVES["jump-up"].cost };
        if (standable(read, to))
            return { kind: "pillar", cost: PRIMITIVES.pillar.cost, needs: "blocks", cells: dy };
        return { kind: "nope", cost: Infinity, reason: "no room to pillar up" };
    }
    if (dy <= -1) {
        const { depth, landing } = dropDepth(read, from, Math.abs(dy) + 8);
        if (dy <= -4 && !SAFE_FALL.test(landing) && !isLiquid(landing))
            return { kind: "nope", cost: Infinity, reason: `drop of ${Math.abs(dy)} onto ${landing.replace("minecraft:", "")}` };
        return { kind: "drop", cost: PRIMITIVES.drop.cost + Math.abs(dy) * 0.1, drop: Math.abs(dy), landing, depth };
    }
    // Same level: walk, jump a gap, bridge over it, or dig through.
    const target = read(to.x, to.y, to.z);
    if (isLiquid(target))
        return { kind: "swim", cost: PRIMITIVES.swim.cost };
    if (isClimbable(target))
        return { kind: "climb", cost: PRIMITIVES.climb.cost };
    if (steps === 1) {
        const info = gapInfo(read, from, dir, 1);
        if (!info.blockedBy && !info.stepUp)
            return { kind: "walk", cost: PRIMITIVES.walk.cost };
        if (info.stepUp)
            return { kind: "jump-up", cost: PRIMITIVES["jump-up"].cost };
        return { kind: "dig", cost: PRIMITIVES.dig.cost, needs: "tool", blockedBy: info.blockedBy };
    }
    // Diagonals and short hops: a gap needs a jump, a long one needs bridging.
    const info = gapInfo(read, from, dir, steps);
    if (info.safe && info.cells <= 1)
        return { kind: "jump", cost: PRIMITIVES.jump.cost };
    if (info.safe && info.cells <= 4)
        return { kind: "sprint-jump", cost: PRIMITIVES["sprint-jump"].cost + info.cells * 0.1, gap: info.cells };
    return { kind: "bridge", cost: PRIMITIVES.bridge.cost + info.cells, needs: "blocks", gap: info.cells };
}

/**
 * Turn a path (list of cells, as navigation returns them) into primitives plus
 * a total cost and a needs set. This is what a parkour skill executes.
 */
export function planPath(read, path, { blocks = 0, sprint = true } = {}) {
    const moves = [];
    const needs = new Set();
    let cost = 0;
    let cursor = path[0];
    for (let i = 1; i < path.length; i++) {
        const move = primitiveFor(read, cursor, path[i]);
        if (move.kind === "nope")
            return { ok: false, moves, cost: Infinity, needs, reason: move.reason, at: cursor };
        if (move.kind === "sprint-jump" && !sprint)
            return { ok: false, moves, cost: Infinity, needs, reason: "gap needs a sprint jump", at: cursor };
        if (move.needs === "blocks" && blocks <= 0)
            return { ok: false, moves, cost: Infinity, needs, reason: "needs blocks to bridge or pillar", at: cursor };
        if (move.needs)
            needs.add(move.needs);
        if (move.kind === "bridge" || move.kind === "pillar")
            blocks--;
        cost += move.cost;
        moves.push({ ...move, to: { ...path[i] } });
        cursor = path[i];
    }
    return { ok: true, moves, cost, needs: [...needs], blocksUsed: moves.filter((m) => m.needs).length };
}

/** Cells a bridge must fill to cross from `from` towards `to`. */
export function bridgeCells(read, from, to, max = 8) {
    const cells = [];
    let cursor = { ...from };
    const dir = { x: Math.sign(to.x - from.x), y: 0, z: Math.sign(to.z - from.z) };
    for (let i = 0; i < max; i++) {
        cursor = { x: cursor.x + dir.x, y: cursor.y, z: cursor.z + dir.z };
        const floor = read(cursor.x, cursor.y - 1, cursor.z);
        if (isAir(floor) || isPassable(floor))
            cells.push({ x: cursor.x, y: cursor.y - 1, z: cursor.z, kind: "bridge" });
        const feet = read(cursor.x, cursor.y, cursor.z);
        if (!isPassable(feet))
            cells.push({ x: cursor.x, y: cursor.y, z: cursor.z, kind: "clear" });
        if (Math.abs(cursor.x - to.x) + Math.abs(cursor.z - to.z) === 0)
            break;
    }
    return cells;
}

/**
 * Escape direction: away from the threat, preferring somewhere that is
 * standable and not a dead end. Deterministic tie-break by direction order.
 */
export function fleeDirection(read, from, threats, dirs) {
    let best;
    for (const dir of dirs) {
        const candidate = { x: from.x + dir.x, y: from.y, z: from.z + dir.z };
        const up = { x: candidate.x, y: candidate.y + 1, z: candidate.z };
        const down = { x: candidate.x, y: candidate.y - 1, z: candidate.z };
        const target = standable(read, candidate) ? candidate : standable(read, up) ? up : standable(read, down) ? down : null;
        if (!target)
            continue;
        const move = primitiveFor(read, from, target);
        if (move.kind === "nope")
            continue;
        let score = -move.cost;
        for (const threat of threats) {
            const before = Math.hypot(from.x - threat.x, from.z - threat.z);
            const after = Math.hypot(target.x - threat.x, target.z - threat.z);
            score += (after - before) * 2;
        }
        if (isHazard(read(target.x, target.y - 1, target.z)))
            score -= 10;
        if (!best || score > best.score)
            best = { dir, to: target, move, score };
    }
    return best ?? null;
}

/** Compact log line for a movement plan (used by skills' reporting). */
export function describePath(plan) {
    if (!plan.ok)
        return `blocked: ${plan.reason}`;
    const counts = {};
    for (const move of plan.moves)
        counts[move.kind] = (counts[move.kind] ?? 0) + 1;
    return Object.entries(counts).map(([k, n]) => `${n}x ${k}`).join(", ") + ` (cost ${plan.cost.toFixed(1)})`;
}

export { add, key };
