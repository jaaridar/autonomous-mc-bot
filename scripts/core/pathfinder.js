/**
 * Pathfinder core — safety-checked, generator-sliced A* and bidirectional A*.
 *
 * The approach (a BlockSafetyChecker-style predicate per candidate cell, an
 * explicit open/closed frontier, a node budget and a cooperative generator that
 * yields work back to the engine) is adapted from the Pathfinder utilities in
 * nox7/mc-bedrock-script-utilities (Apache-2.0):
 *   https://github.com/nox7/mc-bedrock-script-utilities/tree/main/Pathfinder
 * The implementation below is rewritten for this pack's pure-JS cell model so
 * it can run offline in `tools/` and be time-sliced from `system.runJob`-style
 * callers without touching `@minecraft/server`.
 *
 * What it adds over the legacy `PathSearch` in core/navigation.js:
 *  - bidirectional search for long trips (two frontiers, meet in the middle),
 *  - an explicit closed set with duplicate suppression,
 *  - a documented option surface (ignore lists, passable overrides, blocks that
 *    cannot be jumped over, Y-axis flood, dig/bridge/pillar edges),
 *  - a cooperative generator (`step(budget)` / `*search()`) so a large search
 *    can be spread across ticks,
 *  - string-pulling smoothing of the raw grid path,
 *  - a bounded best-effort partial route when the node budget runs out.
 *
 * This file is pure: it only calls `read({x,y,z})` and expects the cell shape
 * used by runtime/world.js (`passable`, `support`, `hazard`, `type`).
 */

export const DIRECTIONS = [
    { x: 1, y: 0, z: 0 }, { x: -1, y: 0, z: 0 },
    { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 },
    { x: 1, y: 0, z: 1 }, { x: 1, y: 0, z: -1 },
    { x: -1, y: 0, z: 1 }, { x: -1, y: 0, z: -1 },
];

/** Movement cost table. `dig` and `bridge` are deliberately expensive. */
export const MOVE_COST = {
    walk: 1,
    diagonal: 1.414,
    step: 1.6,
    drop: 1.4,
    bigdrop: 2.2,
    jump: 3.2,
    sprintjump: 4.6,
    dig: 9,
    bridge: 11,
    pillar: 8,
    flood: 2,
};

export const DEFAULTS = {
    /** Hard cap on expanded nodes (the reference MaximumNodesToConsider). */
    maxNodes: 4000,
    /** Horizontal search radius around the start. */
    radius: 64,
    /** Vertical window around the start. */
    vertLimit: 24,
    /** Deepest safe fall accepted. */
    maxDrop: 3,
    /** Diagonals are allowed but corner-cut-checked. */
    diagonal: true,
    /** Gap jumps (1-2 blocks) like the legacy parkour search. */
    parkour: true,
    /** Dig-through edges for soft blocks (opt-in; the executor breaks them). */
    allowDig: false,
    /** Bridge edges across gaps (opt-in; the executor places blocks). */
    allowBridge: false,
    /** Pillar up edges (opt-in; the executor places a block below). */
    allowPillar: false,
    /** Reference `AllowYAxisFlood`: straight up/down moves for swimmers/flyers. */
    allowYAxisFlood: false,
    /** Try a bidirectional search first for trips at least this long. */
    bidirectional: true,
    bidirMinDistance: 24,
    /** Success tolerance in blocks (goal may be an entity position). */
    tolerance: 1.5,
    /** Heuristic multiplier; 1 keeps A* exact. */
    heuristicWeight: 1.05,
    /** Cells never to consider (`{x,y,z}` or "x,y,z"). */
    ignore: [],
    /** Type ids (strings) never to consider. */
    typeIdsToIgnore: [],
    /** Type ids always treated as passable (flowers, grass, ...). */
    typeIdsToConsiderPassable: [],
    /** Type ids that block a gap jump (fences, walls, panes). */
    typeIdsThatCannotBeJumpedOver: [],
    /** Predicate for dig edges; defaults to a conservative soft-block list. */
    breakable: null,
    /** Danger penalties: [{x,y,z,radius,weight}]. */
    avoid: [],
    /** Smooth the raw grid path before returning it (executor-friendly). */
    smooth: true,
    /** Generator granularity: expansions between yields. */
    yieldEvery: 32,
    /** A partial route must get this many blocks closer to qualify. */
    minProgress: 4,
};

const SOFT = /(dirt|grass_block|sand|gravel|clay|snow|netherrack|soul_soil|soul_sand|podzol|mycelium|moss_block|mud|tuff|deepslate|stone|andesite|diorite|granite|calcite|basalt|blackstone|soul|leaves|_log|_wood|_planks|sculk)/;
const LAVA = /lava/;
const WATER = /water/;

/** Merge user options with defaults without mutating either. */
export function normalizeOptions(options = {}) {
    const o = { ...DEFAULTS, ...(options ?? {}) };
    o.ignore = Array.isArray(o.ignore) ? o.ignore : [];
    if (typeof o.ignore === "string") o.ignore = [o.ignore];
    o.ignoreKeys = new Set(o.ignore.map((p) => (typeof p === "string" ? p : `${p.x},${p.y},${p.z}`)));
    o.typeIdsToIgnore = Array.isArray(o.typeIdsToIgnore) ? o.typeIdsToIgnore : [];
    o.typeIdsToConsiderPassable = Array.isArray(o.typeIdsToConsiderPassable) ? o.typeIdsToConsiderPassable : [];
    o.typeIdsThatCannotBeJumpedOver = Array.isArray(o.typeIdsThatCannotBeJumpedOver) ? o.typeIdsThatCannotBeJumpedOver : [];
    o.avoid = Array.isArray(o.avoid) ? o.avoid : [];
    for (const a of o.avoid) a.r2 = (a.radius ?? 5) ** 2;
    o.breakable = typeof o.breakable === "function" ? o.breakable : (type) => SOFT.test(String(type ?? ""));
    o.maxNodes = Math.max(16, Math.floor(o.maxNodes));
    o.yieldEvery = Math.max(1, Math.floor(o.yieldEvery));
    o.radius = Math.max(4, Math.floor(o.radius));
    return o;
}

export function cellKey(p) {
    return `${p.x},${p.y},${p.z}`;
}

function raw(read, p) {
    try {
        return read({ x: p.x, y: p.y, z: p.z }) ?? null;
    } catch {
        return null;
    }
}

function typeOf(c) {
    return String(c?.type ?? c?.typeId ?? "");
}

export function isHazardCell(c) {
    if (!c) return false;
    if (c.hazard) return true;
    const t = typeOf(c);
    return LAVA.test(t);
}

export function isLiquidCell(c) {
    if (!c) return false;
    if (c.isLiquid) return true;
    const t = typeOf(c);
    return LAVA.test(t) || WATER.test(t);
}

/** True when the cell can be occupied (air, grass, flower, ...). */
export function isPassableCell(c, opts) {
    if (!c) return false;
    if (isHazardCell(c) && !WATER.test(typeOf(c))) return false;
    if (opts && opts.typeIdsToIgnore.includes(typeOf(c))) return false;
    if (opts && opts.typeIdsToConsiderPassable.includes(typeOf(c))) return true;
    if (c.passable === true) return true;
    if (c.passable === false) return false;
    return !!(c.isAir === true || c.solid === false);
}

/** True when the cell can support a standing player. */
export function isSupportCell(c, opts) {
    if (!c) return false;
    if (isHazardCell(c)) return false;
    if (opts && opts.typeIdsToIgnore.includes(typeOf(c))) return false;
    if (c.support === true) return true;
    if (c.support === false) return false;
    if (c.solid === true) return true;
    if (c.isSolid === true) return true;
    if (typeof c.passable === "boolean") return c.passable === false;
    return false;
}

function ignored(c, opts) {
    return !!c && opts.typeIdsToIgnore.includes(typeOf(c));
}

/** Feet + head passable, floor solid, nothing hazardous. */
export function standable(read, p, options = {}) {
    const opts = options.ignoreKeys ? options : normalizeOptions(options);
    if (opts.ignoreKeys.has(cellKey(p))) return false;
    const feet = raw(read, p);
    if (!isPassableCell(feet, opts) || isHazardCell(feet)) return false;
    const head = raw(read, { x: p.x, y: p.y + 1, z: p.z });
    if (!isPassableCell(head, opts) || isHazardCell(head)) return false;
    const floor = raw(read, { x: p.x, y: p.y - 1, z: p.z });
    return isSupportCell(floor, opts);
}

/**
 * BlockSafetyChecker-style verdict for one cell, ported from the reference
 * (IsSafe / CanSafelyFallFrom / CanSafelyJumpOnto) and extended with a landing
 * cell so the search can emit the correct `drop` move.
 */
export function checkSafety(read, p, options = {}) {
    const opts = options.ignoreKeys ? options : normalizeOptions(options);
    if (opts.ignoreKeys.has(cellKey(p))) return { IsSafe: false, reason: "ignored" };
    const feet = raw(read, p);
    const head = raw(read, { x: p.x, y: p.y + 1, z: p.z });
    if (isHazardCell(feet) || isHazardCell(head)) return { IsSafe: false, reason: "hazard" };
    if (!isPassableCell(feet, opts) || !isPassableCell(head, opts)) return { IsSafe: false, reason: "blocked" };
    const below = raw(read, { x: p.x, y: p.y - 1, z: p.z });
    if (ignored(below, opts)) return { IsSafe: false, reason: "ignored-floor" };
    if (isSupportCell(below, opts)) {
        return { IsSafe: true, CanSafelyFallFrom: false, CanSafelyJumpOnto: false, landing: { ...p } };
    }
    // Nothing under our feet: only safe if a solid, non-hazard floor is close.
    if (isHazardCell(below) && !WATER.test(typeOf(below))) return { IsSafe: false, reason: "lava-floor" };
    for (let d = 2; d <= opts.maxDrop + 1; d++) {
        const floor = raw(read, { x: p.x, y: p.y - d, z: p.z });
        const passed = raw(read, { x: p.x, y: p.y - (d - 1), z: p.z });
        if (isHazardCell(floor) && !WATER.test(typeOf(floor))) return { IsSafe: false, reason: "lava-floor" };
        // Every cell we fall through must be open.
        if (!isPassableCell(passed, opts) || isHazardCell(passed)) return { IsSafe: false, reason: "fall-blocked" };
        if (isSupportCell(floor, opts)) {
            const landing = { x: p.x, y: p.y - (d - 1), z: p.z };
            const feetAt = raw(read, landing);
            const headAt = raw(read, { x: landing.x, y: landing.y + 1, z: landing.z });
            if (!isPassableCell(feetAt, opts) || !isPassableCell(headAt, opts)) return { IsSafe: false, reason: "landing-blocked" };
            return { IsSafe: true, CanSafelyFallFrom: true, CanSafelyJumpOnto: false, landing };
        }
    }
    return { IsSafe: false, reason: "void" };
}

/** Can a player jump from `from` up onto `to` (one block up + forward)? */
export function canJumpOnto(read, from, to, options = {}) {
    const opts = options.ignoreKeys ? options : normalizeOptions(options);
    if (to.y - from.y !== 1) return false;
    if (!standable(read, to, opts)) return false;
    // Headroom over the origin so the jump can start.
    for (let h = 1; h <= 3; h++) {
        const c = raw(read, { x: from.x, y: from.y + h, z: from.z });
        if (!isPassableCell(c, opts)) return false;
    }
    return true;
}

function penalty(p, opts) {
    if (!opts.avoid.length) return 0;
    let cost = 0;
    for (const a of opts.avoid) {
        const dx = p.x - a.x, dz = p.z - a.z, dy = p.y - a.y;
        const d2 = dx * dx + dz * dz + dy * dy;
        if (d2 < a.r2) cost += ((a.r2 - d2) / a.r2) * (a.weight ?? 8);
    }
    return cost;
}

/** Manhattan/octile heuristic, admissible with the movement cost table. */
export function heuristic(a, b, diagonal = true) {
    const dx = Math.abs(a.x - b.x), dy = Math.abs(a.y - b.y), dz = Math.abs(a.z - b.z);
    if (!diagonal) return (dx + dz + dy) * MOVE_COST.walk;
    const flat = Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz);
    return flat + dy * 0.8;
}

/** Tiny binary heap with parallel arrays (no per-push wrapper object). */
export class PathHeap {
    constructor() {
        this.v = [];
        this.f = [];
    }
    get size() {
        return this.v.length;
    }
    push(value, f) {
        const V = this.v, F = this.f;
        let i = V.length;
        V.push(value);
        F.push(f);
        while (i > 0) {
            const p = (i - 1) >> 1;
            if (F[p] <= f) break;
            V[i] = V[p];
            F[i] = F[p];
            i = p;
        }
        V[i] = value;
        F[i] = f;
    }
    pop() {
        const V = this.v, F = this.f;
        if (!V.length) return undefined;
        const top = V[0];
        const lv = V.pop(), lf = F.pop();
        const n = V.length;
        if (n) {
            let i = 0;
            while (true) {
                let c = i * 2 + 1;
                if (c >= n) break;
                if (c + 1 < n && F[c + 1] < F[c]) c++;
                if (lf <= F[c]) break;
                V[i] = V[c];
                F[i] = F[c];
                i = c;
            }
            V[i] = lv;
            F[i] = lf;
        }
        return top;
    }
}

/**
 * Generate legal moves out of `p`.
 * Each move: `{x,y,z,kind,cost}` and may include `breakAt`, `placeAt`.
 */
export function neighbors(read, p, options = {}) {
    const opts = options.ignoreKeys ? options : normalizeOptions(options);
    const out = [];
    const start = opts.origin ?? p;
    const within = (q) =>
        Math.hypot(q.x - start.x, q.z - start.z) <= opts.radius &&
        Math.abs(q.y - start.y) <= opts.vertLimit;

    const push = (x, y, z, kind, extra) => {
        if (opts.ignoreKeys.has(`${x},${y},${z}`)) return;
        const q = { x, y, z, kind, cost: MOVE_COST[kind] ?? MOVE_COST.walk, ...(extra ?? {}) };
        if (within(q)) out.push(q);
    };

    const dirs = opts.diagonal ? DIRECTIONS : DIRECTIONS.slice(0, 4);
    for (const d of dirs) {
        const diag = d.x !== 0 && d.z !== 0;
        const qx = p.x + d.x, qz = p.z + d.z;
        const walkCost = diag ? MOVE_COST.diagonal : MOVE_COST.walk;
        const centre = { x: qx, y: p.y, z: qz };
        const headAt = raw(read, { x: p.x, y: p.y + 2, z: p.z });
        const canStraight = isPassableCell(raw(read, centre), opts) && isPassableCell(raw(read, { x: qx, y: p.y + 1, z: qz }), opts);
        // Side cells must be open for a diagonal (no corner cutting).
        if (diag && (!isPassableCell(raw(read, { x: p.x + d.x, y: p.y, z: p.z }), opts) ||
            !isPassableCell(raw(read, { x: p.x, y: p.y, z: p.z + d.z }), opts))) {
            continue;
        }
        // Walk / diagonal at the same level.
        if (standable(read, centre, opts)) push(qx, p.y, qz, diag ? "diagonal" : "walk");
        // Step up one.
        const up = { x: qx, y: p.y + 1, z: qz };
        if (canJumpOnto(read, p, up, opts)) push(qx, p.y + 1, qz, "step");
        // Drop down.
        if (canStraight) {
            for (let drop = 1; drop <= opts.maxDrop; drop++) {
                const land = { x: qx, y: p.y - drop, z: qz };
                if (standable(read, land, opts)) {
                    push(qx, land.y, qz, drop === 1 ? "drop" : "bigdrop");
                    break;
                }
            }
        }
        if (!opts.parkour) {
            if (opts.allowDig) addDigEdges(read, p, d, opts, push, canStraight);
            if (opts.allowBridge) addBridgeEdge(read, p, d, opts, push, canStraight);
            continue;
        }
        // Gap jumps: one or two gap columns, landing at the same level.
        const gapBlocked = !canStraight;
        if (gapBlocked && !diag && headAt && isPassableCell(headAt, opts)) {
            const blockedType = typeOf(raw(read, centre));
            if (!opts.typeIdsThatCannotBeJumpedOver.includes(blockedType)) {
                const l1 = { x: p.x + d.x * 2, y: p.y, z: p.z + d.z * 2 };
                if (standable(read, l1, opts) && headroom(read, p, opts, 1) && headroom(read, l1, opts, 1)) {
                    push(l1.x, l1.y, l1.z, "jump");
                } else {
                    const l2 = { x: p.x + d.x * 3, y: p.y, z: p.z + d.z * 3 };
                    if (standable(read, l2, opts) && headroom(read, p, opts, 2) && headroom(read, l2, opts, 1) &&
                        !opts.typeIdsThatCannotBeJumpedOver.includes(blockedType)) {
                        push(l2.x, l2.y, l2.z, "sprintjump");
                    }
                }
            }
        }
        if (opts.allowDig) addDigEdges(read, p, d, opts, push, canStraight);
        if (opts.allowBridge) addBridgeEdge(read, p, d, opts, push, canStraight);
    }

    // Pillar up one block: the executor places a block under itself, so the
    // new cell only needs headroom (each pillar placement becomes the support
    // for the next one).
    if (opts.allowPillar) {
        const above = { x: p.x, y: p.y + 1, z: p.z };
        const aboveHead = { x: p.x, y: p.y + 2, z: p.z };
        if (isPassableCell(raw(read, above), opts) && isPassableCell(raw(read, aboveHead), opts)) {
            push(above.x, above.y, above.z, "pillar");
        }
    }
    // Y-axis flood (reference AllowYAxisFlood): straight vertical moves for
    // swimming/flying contexts where normal standability does not apply.
    if (opts.allowYAxisFlood) {
        const up = { x: p.x, y: p.y + 1, z: p.z };
        if (isPassableCell(raw(read, up), opts) && isPassableCell(raw(read, { x: p.x, y: p.y + 2, z: p.z }), opts)) push(up.x, up.y, up.z, "flood");
        const down = { x: p.x, y: p.y - 1, z: p.z };
        if (isPassableCell(raw(read, down), opts) && isPassableCell(raw(read, { x: p.x, y: p.y - 2, z: p.z }), opts)) push(down.x, down.y, down.z, "flood");
    }
    return out;
}

function headroom(read, p, opts, extra) {
    for (let h = 1; h <= 2 + extra; h++) {
        if (!isPassableCell(raw(read, { x: p.x, y: p.y + h, z: p.z }), opts)) return false;
    }
    return true;
}

function addDigEdges(read, p, d, opts, push, canStraight) {
    if (d.x !== 0 && d.z !== 0) return; // dig only on cardinals
    const q = { x: p.x + d.x, y: p.y, z: p.z + d.z };
    const feet = raw(read, q);
    const head = raw(read, { x: q.x, y: q.y + 1, z: q.z });
    const floor = raw(read, { x: q.x, y: q.y - 1, z: q.z });
    if (!feet && !head) return;
    const softFeet = feet && !isPassableCell(feet, opts) && !isHazardCell(feet) && opts.breakable(typeOf(feet));
    const softHead = head && !isPassableCell(head, opts) && !isHazardCell(head) && opts.breakable(typeOf(head));
    if (!softFeet && !softHead) return;
    if (isHazardCell(floor)) return;
    if (!isSupportCell(floor) && !canStraight) {
        // Digging into a hole would drop into the void; still allow if a floor
        // is within the drop window.
        let ok = false;
        for (let k = 1; k <= opts.maxDrop; k++) {
            if (isSupportCell(raw(read, { x: q.x, y: p.y - k, z: q.z }), opts)) { ok = true; break; }
        }
        if (!ok) return;
    }
    push(q.x, q.y, q.z, "dig", { breakAt: q, breakHead: softHead, breakFeet: softFeet });
}

function addBridgeEdge(read, p, d, opts, push, canStraight) {
    if (d.x !== 0 && d.z !== 0) return;
    const q = { x: p.x + d.x, y: p.y, z: p.z + d.z };
    const feet = raw(read, q);
    const head = raw(read, { x: q.x, y: q.y + 1, z: q.z });
    if (!isPassableCell(feet, opts) || !isPassableCell(head, opts)) return;
    const below = raw(read, { x: q.x, y: q.y - 1, z: q.z });
    if (isSupportCell(below, opts)) return;
    if (isHazardCell(below) && !WATER.test(typeOf(below))) return;
    push(q.x, q.y, q.z, "bridge", { placeAt: below });
}

/** String-pulled smoothing: drop collinear walk nodes and skip clear lines. */
export function smoothPath(read, path, options = {}) {
    if (!Array.isArray(path) || path.length < 3) return path ?? [];
    const opts = normalizeOptions(options);
    const simple = [path[0]];
    for (let i = 1; i < path.length - 1; i++) {
        const a = simple[simple.length - 1], b = path[i], c = path[i + 1];
        const sameKind = (b.kind ?? "walk") === "walk" && (a.kind ?? "walk") === "walk" && (c.kind ?? "walk") === "walk";
        const collinear = (a.x === b.x && b.x === c.x) || (a.z === b.z && b.z === c.z);
        const flat = a.y === b.y && b.y === c.y;
        if (sameKind && flat && collinear) continue;
        simple.push(b);
    }
    simple.push(path[path.length - 1]);

    // Line-of-sight pass: only over flat walk nodes (safe to check cheaply).
    const out = [simple[0]];
    let i = 0;
    while (i < simple.length - 1) {
        let j = simple.length - 1;
        for (; j > i + 1; j--) {
            if (sameLevelWalk(simple[i], simple[j]) && clearWalkLine(read, simple[i], simple[j], opts)) break;
        }
        out.push(simple[j]);
        i = j;
    }
    return out;
}

function sameLevelWalk(a, b) {
    return a.y === b.y && (a.kind ?? "walk") === "walk" && (b.kind ?? "walk") === "walk";
}

function clearWalkLine(read, a, b, opts) {
    const dx = b.x - a.x, dz = b.z - a.z;
    const len = Math.max(Math.abs(dx), Math.abs(dz));
    if (!len) return true;
    for (let i = 1; i <= len; i++) {
        const x = Math.round(a.x + (dx * i) / len);
        const z = Math.round(a.z + (dz * i) / len);
        const y = a.y;
        if (!standable(read, { x, y, z }, opts)) return false;
        if (dx !== 0 && dz !== 0) {
            // No corner cutting on the smoothed diagonal.
            if (!isPassableCell(raw(read, { x, y, z: a.z }), opts)) return false;
            if (!isPassableCell(raw(read, { x: a.x, y, z }), opts)) return false;
        }
    }
    return true;
}

function nodeAt(p, parent) {
    return { p: { x: p.x, y: p.y, z: p.z, kind: p.kind, cost: p.cost, ...(p.breakAt ? { breakAt: p.breakAt, breakHead: p.breakHead, breakFeet: p.breakFeet } : {}), ...(p.placeAt ? { placeAt: p.placeAt } : {}) }, parent };
}

/**
 * Single-direction A* over the safety-checked cell graph.
 *
 * Usage:
 *   const s = new PathFinder(read, start, goal, options);
 *   const result = s.run(2000);            // synchronous
 *   // or step it: while (s.step(64) === "searching") { ... yield to engine ... }
 */
export class PathFinder {
    constructor(read, start, goal, options = {}) {
        this.opts = normalizeOptions({ ...options, origin: { x: start.x, y: start.y, z: start.z } });
        this.read = read;
        this.start = { x: start.x, y: start.y, z: start.z };
        this.goal = { x: goal.x, y: goal.y, z: goal.z };
        this.open = new PathHeap();
        this.costs = new Map();
        this.closed = new Set();
        this.expanded = 0;
        this.status = "searching";
        this.path = [];
        this.best = undefined;
        this.bestH = Infinity;
        this.reason = "";
        this.startH = heuristic(this.start, this.goal, this.opts.diagonal);
        this.cost = 0;
        this.open.push(nodeAt({ ...this.start, kind: "walk" }, undefined), this.startH * this.opts.heuristicWeight);
        this.costs.set(cellKey(this.start), 0);
    }

    get done() {
        return this.status !== "searching";
    }

    /** Generator form for system.runJob-style time slicing. */
    *search() {
        let since = 0;
        while (this.status === "searching") {
            this.step(this.opts.yieldEvery);
            since += this.opts.yieldEvery;
            if (this.status === "searching" && since >= this.opts.yieldEvery) {
                since = 0;
                yield this.expanded;
            }
        }
        return this.result;
    }

    /** Expand at most `budget` nodes and return the current status. */
    step(budget = 64) {
        if (this.status !== "searching") return this.status;
        const opts = this.opts;
        let n = Math.max(1, Math.floor(budget));
        while (n-- > 0 && this.open.size) {
            const node = this.open.pop();
            const p = node.p;
            const key = cellKey(p);
            if (this.closed.has(key)) continue;
            const known = this.costs.get(key);
            if (known === undefined) continue;
            this.closed.add(key);
            if (++this.expanded > opts.maxNodes) {
                this.finishBudget();
                return this.status;
            }
            const h = heuristic(p, this.goal, opts.diagonal);
            if (p === node.p && node.parent && h < this.bestH) {
                this.bestH = h;
                this.best = node;
            }
            if (this.isGoal(p)) {
                this.path = this.trace(node);
                this.cost = this.costs.get(key) ?? 0;
                this.status = "found";
                return this.status;
            }
            const g = this.costs.get(key) ?? 0;
            for (const q of neighbors(this.read, p, opts)) {
                const qk = cellKey(q);
                if (this.closed.has(qk)) continue;
                const ng = g + q.cost + penalty(q, opts);
                if (ng >= (this.costs.get(qk) ?? Infinity)) continue;
                this.costs.set(qk, ng);
                const nh = heuristic(q, this.goal, opts.diagonal);
                this.open.push(nodeAt(q, node), ng + nh * opts.heuristicWeight);
            }
        }
        if (!this.open.size) {
            this.finishNoRoute();
            return this.status;
        }
        return this.status;
    }

    /** Run to completion with a node budget; returns the result object. */
    run(maxNodes) {
        if (typeof maxNodes === "number") this.opts.maxNodes = Math.max(16, Math.floor(maxNodes));
        if (!standable(this.read, this.start, this.opts) && this.startH > this.opts.tolerance) {
            // The bot can be mid-jump or standing in a 1-block nook; still try,
            // but record it for the caller's diagnostics.
            this.reason = "start-not-standable";
        }
        while (this.status === "searching") this.step(256);
        return this.result;
    }

    isGoal(p) {
        const h = Math.hypot(p.x - this.goal.x, p.z - this.goal.z);
        return h <= this.opts.tolerance && Math.abs(p.y - this.goal.y) <= 1.25;
    }

    trace(node) {
        const path = [];
        let t = node;
        while (t?.parent) {
            path.push(t.p);
            t = t.parent;
        }
        path.reverse();
        if (this.opts.smooth) return smoothPath(this.read, path, this.opts);
        return path;
    }

    finishBudget() {
        this.status = "budget";
        this.reason = "node-budget";
        this.applyBestEffort("budget");
    }

    finishNoRoute() {
        this.status = "unreachable";
        this.reason = "open-set-empty";
        this.applyBestEffort("unreachable");
    }

    /** Hand back the best partial route when it meaningfully approaches the goal. */
    applyBestEffort(status) {
        if (this.best && this.best.parent && this.startH - this.bestH >= this.opts.minProgress) {
            this.path = this.trace(this.best);
            this.reason = status + "-partial";
            if (this.path.length) this.status = "partial";
        }
    }

    get result() {
        return {
            status: this.status,
            path: this.path,
            expanded: this.expanded,
            cost: this.cost,
            reason: this.reason,
            partial: this.status === "partial",
        };
    }
}

/**
 * Bidirectional A* (frontier from the start and from the goal, meet in the
 * middle). Uses the symmetric subset of the move graph (flat walk, diagonal,
 * one-up, shallow drop) so both directions agree. If it cannot connect, the
 * caller falls back to the unidirectional search, which keeps the richer
 * parkour/dig/bridge edges.
 */
export class BidirectionalPathFinder {
    constructor(read, start, goal, options = {}) {
        this.opts = normalizeOptions({
            ...options,
            diagonal: true,
            parkour: false,
            allowDig: false,
            allowBridge: false,
            allowPillar: false,
            allowYAxisFlood: false,
            origin: { x: start.x, y: start.y, z: start.z },
        });
        this.read = read;
        this.start = { x: start.x, y: start.y, z: start.z };
        this.goal = { x: goal.x, y: goal.y, z: goal.z };
        this.forward = this.frontier(this.start);
        this.backward = this.frontier(this.goal);
        this.meet = undefined;
        this.bestCost = Infinity;
        this.expanded = 0;
        this.status = "searching";
        this.path = [];
        this.reason = "";
        this.strategy = "bidirectional";
        this.settled = false;
    }

    frontier(origin) {
        const f = { origin, open: new PathHeap(), costs: new Map(), nodes: new Map(), closed: new Set() };
        const root = nodeAt({ ...origin, kind: "walk" }, undefined);
        f.open.push(root, 0);
        f.costs.set(cellKey(origin), 0);
        f.nodes.set(cellKey(origin), root);
        return f;
    }

    *search() {
        while (this.status === "searching") {
            this.step(this.opts.yieldEvery);
            if (this.status === "searching") yield this.expanded;
        }
        return this.result;
    }

    /** One expansion per side per iteration; returns the current status. */
    step(budget = 32) {
        if (this.status !== "searching") return this.status;
        let n = Math.max(1, Math.floor(budget));
        while (n-- > 0) {
            if (!this.forward.open.size || !this.backward.open.size) {
                this.status = this.bestCost < Infinity ? "found" : "unreachable";
                this.reason = "frontier-empty";
                break;
            }
            const frontSide = (this.expanded & 1) === 0;
            const side = frontSide ? this.forward : this.backward;
            const other = frontSide ? this.backward : this.forward;
            const node = side.open.pop();
            const p = node.p;
            const key = cellKey(p);
            if (side.closed.has(key)) continue;
            side.closed.add(key);
            if (++this.expanded > this.opts.maxNodes) {
                this.status = this.bestCost < Infinity ? "found" : "budget";
                this.reason = "node-budget";
                break;
            }
            const otherCost = other.costs.get(key);
            if (otherCost !== undefined) {
                const total = (side.costs.get(key) ?? 0) + otherCost;
                if (total < this.bestCost) {
                    this.bestCost = total;
                    this.meet = { key, front: frontSide ? side.nodes.get(key) : other.nodes.get(key), back: frontSide ? other.nodes.get(key) : side.nodes.get(key) };
                }
            }
            // Optimality stop: the cheapest possible completion through the
            // open frontiers already exceeds the best meeting cost.
            if (this.meet) {
                const topF = this.forward.open.size ? this.forward.open.f[0] : Infinity;
                const topB = this.backward.open.size ? this.backward.open.f[0] : Infinity;
                if (topF + topB >= this.bestCost) {
                    this.settled = true;
                    break;
                }
            }
            const sideOpts = { ...this.opts, origin: side.origin };
            for (const q of neighbors(this.read, p, sideOpts)) {
                const qk = cellKey(q);
                if (side.closed.has(qk)) continue;
                const ng = (side.costs.get(key) ?? 0) + q.cost + penalty(q, this.opts);
                if (ng >= (side.costs.get(qk) ?? Infinity)) continue;
                side.costs.set(qk, ng);
                const child = nodeAt(q, node);
                side.nodes.set(qk, child);
                const h = heuristic(q, other.origin, this.opts.diagonal);
                side.open.push(child, ng + h * this.opts.heuristicWeight);
            }
        }
        if (this.status === "searching" && this.meet && (this.settled || this.expanded > this.opts.maxNodes)) {
            this.status = this.bestCost < Infinity ? "found" : "unreachable";
        }
        if (this.status === "searching" && !this.forward.open.size && !this.backward.open.size) {
            this.status = this.bestCost < Infinity ? "found" : "unreachable";
        }
        if (this.status === "searching" && this.expanded > this.opts.maxNodes) {
            this.status = this.bestCost < Infinity ? "found" : "budget";
            this.reason = "node-budget";
        }
        if (this.status === "found") this.reconstruct();
        return this.status;
    }

    reconstruct() {
        if (!this.meet?.front || !this.meet?.back) {
            this.status = "unreachable";
            this.reason = "meet-not-stored";
            return;
        }
        const fwd = traceOf(this.meet.front);
        // The backward tree roots at the goal, so its parent chain runs
        // goal -> meet. Reverse it and drop the duplicated meeting cell.
        const bwd = traceOf(this.meet.back);
        bwd.reverse();
        if (bwd.length) bwd.shift();
        const path = [...fwd, ...bwd];
        this.path = this.opts.smooth ? smoothPath(this.read, path, this.opts) : path;
        this.status = this.path.length ? "found" : "unreachable";
        this.reason = this.status === "found" ? "meet" : "empty-path";
    }

    run(maxNodes) {
        if (typeof maxNodes === "number") this.opts.maxNodes = Math.max(16, Math.floor(maxNodes));
        while (this.status === "searching") this.step(128);
        if (this.status === "found") this.reconstruct();
        return this.result;
    }

    get result() {
        return { status: this.status, path: this.path, expanded: this.expanded, cost: this.bestCost, reason: this.reason, partial: false, strategy: "bidirectional" };
    }
}

function traceOf(node) {
    const out = [];
    let t = node;
    while (t?.parent) {
        out.push(t.p);
        t = t.parent;
    }
    return out.reverse();
}

/**
 * One-call planner used by the runtime service.
 * Tries the bidirectional search for long trips, then the unidirectional search
 * (which owns the richer move set). Returns a result object; never throws.
 */
export function planPath(read, start, goal, options = {}) {
    const opts = normalizeOptions(options);
    const distance = Math.hypot(goal.x - start.x, goal.z - start.z);
    try {
        if (opts.bidirectional && distance >= opts.bidirMinDistance) {
            const bi = new BidirectionalPathFinder(read, start, goal, { ...opts, maxNodes: Math.max(64, Math.floor(opts.maxNodes * 0.45)) });
            const r = bi.run();
            if (r.status === "found" && r.path.length) return { ...r, strategy: "bidirectional" };
            // Bidirectional found a meeting chain but not a full route here: the
            // unidirectional search below owns the richer edges and smoothing.
        }
        const solo = new PathFinder(read, start, goal, opts);
        const r = solo.run(opts.maxNodes);
        return { ...r, strategy: "astar" };
    } catch (error) {
        return { status: "failed", path: [], expanded: 0, cost: Infinity, reason: String(error?.message ?? error), partial: false, strategy: "error" };
    }
}
