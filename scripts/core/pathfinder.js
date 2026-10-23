/**
 * Pathfinder — bidirectional A* + block-safety classification.
 *
 * Techniques adapted from nox7/mc-bedrock-script-utilities Pathfinder and
 * BlockSafetyChecker (Apache-2.0): search from both ends until they meet,
 * classify each cell as walk / safe-fall / jump-onto / cliff / cannot-jump-over,
 * ignore exhausted cells, and yield in budgeted steps so the engine stays
 * responsive. Reimplemented against this pack's engine-free cell model so
 * core stays unit-testable (no @minecraft/server, no Block handles).
 *
 * Neighbour generation is the existing PathSearch parkour/bridge/pillar
 * model — bidirectional search is a drop-in with the same step() contract.
 */
import { horizontal } from "./math.js";
import { CANNOT_JUMP_OVER_RE } from "./blocks.js";
import { PathSearch, Heap, KIND_COST } from "./navigation.js";

const LAVA = /lava/;
const WATER = /water/;

/**
 * Options for a pathfinding run. Mirrors AStarOptions from the nox7
 * Pathfinder, minus Dimension (the caller supplies `read` instead).
 */
export class AStarOptions {
    constructor(startLocation, goalLocation, extra = {}) {
        this.startLocation = startLocation;
        this.goalLocation = goalLocation;
        this.maximumNodesToConsider = extra.maximumNodesToConsider ?? 1200;
        this.locationsToIgnore = extra.locationsToIgnore ?? extra.ignore ?? [];
        this.typeIdsToConsiderPassable = extra.typeIdsToConsiderPassable ?? [];
        this.typeIdsThatCannotBeJumpedOver = extra.typeIdsThatCannotBeJumpedOver ?? [];
        this.allowYAxisFlood = extra.allowYAxisFlood ?? false;
        this.entityHeight = extra.entityHeight ?? 2;
        this.maxFall = extra.maxFall ?? 3;
        this.dimension = extra.dimension ?? "overworld";
        this.strictSafety = extra.strictSafety ?? true;
        this.allowBridge = extra.allowBridge ?? false;
        this.allowPillar = extra.allowPillar ?? extra.allowBridge ?? false;
        this.allowSprintJump = extra.allowSprintJump ?? true;
        this.parkour = extra.parkour ?? true;
        this.radius = extra.radius ?? 24;
        this.tolerance = extra.tolerance ?? 0.7;
        this.allowPartial = extra.allowPartial ?? false;
        this.avoid = extra.avoid ?? [];
    }
}

/**
 * Pick the search flavour for a trip. Short clear hops are walked directly
 * by the navigator; mid-range goals (both ends inside the rolling horizon)
 * use bidirectional A*; long trips and towers stay unidirectional so a
 * best-effort partial route can still make progress.
 */
export function chooseSearchMode({ horiz, vert = 0, radius = 24, isTower = false }) {
    if (isTower || (vert > 12 && horiz < 4)) return "unidirectional";
    if (horiz <= 6) return "direct";
    if (horiz <= radius) return "bidirectional";
    return "unidirectional";
}

/**
 * Cheap unstuck policy. The runtime maps these verbs onto jump / sidestep /
 * dig / swim / pillar; keeping the decision here means it is testable.
 */
export function unstuckAction(s) {
    if (s.inWater) return "swim_shore";
    if (!s.onGround) return "wait_land";
    if (!s.safeStart && s.hasBlocks) return "pillar";
    if (s.frontSolid) return "dig_front";
    if (s.oscillating) return "ignore_cell_replan";
    if ((s.retries ?? 0) >= 2) return "sidestep";
    return "jump_replan";
}

function isPassableCell(c, options) {
    if (!c) return false;
    if (c.passable) return true;
    if (c.type && options.typeIdsToConsiderPassable?.includes(c.type)) return true;
    return false;
}

function isLavaCell(c) {
    return !!(c && (c.hazard && c.type && LAVA.test(c.type) || c.type === "minecraft:lava" || c.type === "minecraft:flowing_lava"));
}

function isWaterCell(c) {
    return !!(c && c.type && WATER.test(c.type) && !LAVA.test(c.type));
}

function cannotJumpOver(c, options) {
    if (!c?.type) return false;
    if (options.typeIdsThatCannotBeJumpedOver?.includes(c.type)) return true;
    return CANNOT_JUMP_OVER_RE.test(c.type);
}

/**
 * Block-safety classification (nox7 BlockSafetyChecker, cell-model port).
 *
 * `read(pos)` returns `{ passable, support, hazard, type }` or null/undefined
 * for unloaded. Result flags match the original: isSafe, canSafelyFallFrom,
 * canSafelyJumpOnto, isPossibleCliff, hasLavaBelow, cannotBeJumpedOver.
 */
export function blockSafetyCheck(read, pos, options = {}) {
    const opts = {
        entityHeight: options.entityHeight ?? 2,
        maxFall: options.maxFall ?? 3,
        allowYAxisFlood: options.allowYAxisFlood ?? false,
        typeIdsToConsiderPassable: options.typeIdsToConsiderPassable ?? [],
        typeIdsThatCannotBeJumpedOver: options.typeIdsThatCannotBeJumpedOver ?? [],
    };
    const at = (x, y, z) => {
        try { return read({ x, y, z }); }
        catch { return null; }
    };
    const result = {
        isSafe: false,
        canSafelyFallFrom: false,
        canSafelyJumpOnto: false,
        isPossibleCliff: false,
        isWater: false,
        isLava: false,
        hasWaterBelow: false,
        hasLavaBelow: false,
        cannotBeJumpedOver: false,
        notEnoughSpaceAboveBlockToWalkTo: false,
        notEnoughSpaceAboveBlockToJumpTo: false,
        adjacentBlockIsInUnloadedChunk: false,
    };
    const block = at(pos.x, pos.y, pos.z);
    if (block === null || block === undefined) {
        result.adjacentBlockIsInUnloadedChunk = true;
        return result;
    }
    if (isLavaCell(block)) { result.isLava = true; return result; }
    if (isWaterCell(block)) { result.isWater = true; return result; }

    if (opts.allowYAxisFlood) {
        result.isSafe = isPassableCell(block, opts);
        return result;
    }

    if (isPassableCell(block, opts)) {
        const below = at(pos.x, pos.y - 1, pos.z);
        if (below === null || below === undefined) {
            result.adjacentBlockIsInUnloadedChunk = true;
            return result;
        }
        if (isPassableCell(below, opts)) {
            const further = at(pos.x, pos.y - 2, pos.z);
            if (further === null || further === undefined) {
                result.adjacentBlockIsInUnloadedChunk = true;
                return result;
            }
            if (isPassableCell(further, opts)) {
                result.isPossibleCliff = true;
                return result;
            }
            if (isLavaCell(further)) { result.hasLavaBelow = true; return result; }
            if (isWaterCell(further)) { result.hasWaterBelow = true; return result; }
            result.isSafe = true;
            result.canSafelyFallFrom = true;
            return result;
        }
        if (isLavaCell(below)) { result.hasLavaBelow = true; return result; }
        if (isWaterCell(below)) { result.hasWaterBelow = true; return result; }
        if (cannotJumpOver(below, opts)) { result.cannotBeJumpedOver = true; return result; }
        for (let i = 0; i < opts.entityHeight - 1; i++) {
            const above = at(pos.x, pos.y + i + 1, pos.z);
            if (above === null || above === undefined) {
                result.adjacentBlockIsInUnloadedChunk = true;
                return result;
            }
            if (!isPassableCell(above, opts)) {
                result.notEnoughSpaceAboveBlockToWalkTo = true;
                return result;
            }
        }
        result.isSafe = true;
        return result;
    }

    if (cannotJumpOver(block, opts)) {
        result.cannotBeJumpedOver = true;
        return result;
    }
    for (let i = 0; i < opts.entityHeight; i++) {
        const above = at(pos.x, pos.y + i + 1, pos.z);
        if (above === null || above === undefined) {
            result.adjacentBlockIsInUnloadedChunk = true;
            return result;
        }
        if (!isPassableCell(above, opts)) {
            result.notEnoughSpaceAboveBlockToJumpTo = true;
            return result;
        }
    }
    result.isSafe = true;
    result.canSafelyJumpOnto = true;
    return result;
}

/**
 * After a bidirectional stitch the reverse half's movement kinds point the
 * wrong way. Relabel from consecutive cells so the navigator jumps/drops
 * correctly.
 */
export function relabelPath(path) {
    if (!path?.length) return path ?? [];
    const out = [{ x: path[0].x, y: path[0].y, z: path[0].z, kind: path[0].kind ?? "walk" }];
    for (let i = 1; i < path.length; i++) {
        const a = path[i - 1], b = path[i];
        const dx = Math.abs(b.x - a.x), dz = Math.abs(b.z - a.z), dy = b.y - a.y;
        const horiz = Math.max(dx, dz);
        let kind = "walk";
        if (dx + dz === 0 && dy === 1) kind = "pillar";
        else if (horiz <= 1 && dy === 0) kind = "walk";
        else if (horiz <= 1 && dy === 1) kind = "step";
        else if (horiz <= 1 && dy === -1) kind = "drop";
        else if (horiz <= 1 && dy < -1) kind = "bigdrop";
        else if (horiz === 2 && dy <= 1) kind = "jump";
        else if (horiz === 3 && dy <= 1) kind = dy === 1 ? "sprintjump_up" : "sprintjump";
        else if (horiz >= 4) kind = "sprintjump3";
        else if (b.kind) kind = b.kind;
        const node = { x: b.x, y: b.y, z: b.z, kind };
        if (b.placeAt) node.placeAt = b.placeAt;
        if (b.placeAt2) node.placeAt2 = b.placeAt2;
        if (b.gap != null) node.gap = b.gap;
        if (b.placeCount != null) node.placeCount = b.placeCount;
        out.push(node);
    }
    return out;
}

/**
 * Bidirectional A* with the same step()/status/path contract as PathSearch.
 * Expands from start and goal until the two closed sets meet, then stitches
 * and relabels. Falls back to a best-effort partial from the forward side
 * when the node budget runs out — same honesty as PathSearch.
 */
export class BidirectionalPathSearch {
    constructor(read, start, goal, tolerance = 0.7, parkour = true, maxNodes = 2000, radius = 32, allowPartial = false, avoid = [], options = {}) {
        this.probe = new PathSearch(read, start, goal, tolerance, parkour, maxNodes, radius, allowPartial, avoid, options);
        this.read = read;
        this.start = start;
        this.goal = goal;
        this.tolerance = tolerance;
        this.parkour = parkour;
        this.maxNodes = maxNodes;
        this.radius = radius;
        this.allowPartial = allowPartial;
        this.avoid = avoid;
        this.options = options;
        this.status = "searching";
        this.path = [];
        this.expanded = 0;
        this.startH = horizontal(start, goal);
        this.best = undefined;
        this.bestH = Infinity;
        this.engine = "bidirectional";

        this.fwdOpen = new Heap();
        this.revOpen = new Heap();
        this.fwdCosts = new Map();
        this.revCosts = new Map();
        this.fwdClosed = new Map();
        this.revClosed = new Map();
        this.fwdNodes = new Map();
        this.revNodes = new Map();

        const sk = this.k(start.x, start.y, start.z);
        const gk = this.k(goal.x, goal.y, goal.z);
        const sNode = { p: { x: start.x, y: start.y, z: start.z, kind: "walk" }, g: 0, parent: null };
        const gNode = { p: { x: goal.x, y: goal.y, z: goal.z, kind: "walk" }, g: 0, parent: null };
        this.fwdOpen.push(sNode, 0);
        this.fwdCosts.set(sk, 0);
        this.fwdNodes.set(sk, sNode);
        this.revOpen.push(gNode, 0);
        this.revCosts.set(gk, 0);
        this.revNodes.set(gk, gNode);
    }

    k(x, y, z) { return this.probe.k(x, y, z); }
    neighbors(p) { return this.probe.neighbors(p); }

    trace(n) {
        const path = [];
        let t = n;
        while (t?.parent) {
            path.push(t.p);
            t = t.parent;
        }
        return path.reverse();
    }

    stitch(fwdNode, revNode) {
        const fwd = this.trace(fwdNode);
        const revFull = [];
        let t = revNode;
        while (t) {
            revFull.push(t.p);
            t = t.parent;
        }
        // fwd: after-start ... meeting; revFull: meeting ... goal
        let combined = fwd.length ? [...fwd, ...revFull.slice(1)] : revFull.slice(1);
        if (!combined.length && revFull.length) combined = [revFull[revFull.length - 1]];
        this.path = relabelPath(combined);
        return (this.status = "found");
    }

    bestEffort(status) {
        if (this.best && this.best.parent && this.bestH <= this.startH - 3) {
            this.path = relabelPath(this.trace(this.best));
            return (this.status = "partial");
        }
        return (this.status = status);
    }

    expand(side) {
        const open = side === "fwd" ? this.fwdOpen : this.revOpen;
        const costs = side === "fwd" ? this.fwdCosts : this.revCosts;
        const closed = side === "fwd" ? this.fwdClosed : this.revClosed;
        const nodes = side === "fwd" ? this.fwdNodes : this.revNodes;
        const otherClosed = side === "fwd" ? this.revClosed : this.fwdClosed;
        const otherNodes = side === "fwd" ? this.revNodes : this.fwdNodes;
        const toward = side === "fwd" ? this.goal : this.start;
        if (!open.size) return "empty";
        const n = open.pop();
        const np = n.p;
        const k = this.k(np.x, np.y, np.z);
        if (n.g !== costs.get(k)) return "skip";
        if (++this.expanded > this.maxNodes) return "budget";
        if (side === "fwd") {
            const h = horizontal(np, this.goal);
            if (h < this.bestH && n.parent) { this.bestH = h; this.best = n; }
            if (this.allowPartial && horizontal(np, this.start) >= 16 && h < this.startH - 6) {
                closed.set(k, n);
                this.path = relabelPath(this.trace(n));
                return "partial";
            }
            if (h <= this.tolerance && Math.abs(np.y - this.goal.y) < 1.5) {
                this.path = relabelPath(this.trace(n));
                return "found";
            }
        }
        const other = otherClosed.get(k) || otherNodes.get(k);
        if (other && other !== n) {
            closed.set(k, n);
            return side === "fwd" ? this.stitch(n, other) : this.stitch(other, n);
        }
        closed.set(k, n);
        for (const q of this.neighbors(np)) {
            const cost = KIND_COST[q.kind] ?? 1.5;
            const g = n.g + cost + this.probe.penalty(q);
            const qk = this.k(q.x, q.y, q.z);
            if (g >= (costs.get(qk) ?? Infinity)) continue;
            costs.set(qk, g);
            const node = { p: q, g, parent: n };
            nodes.set(qk, node);
            open.push(node, g + horizontal(q, toward) * 0.9 + Math.abs(q.y - toward.y) * 0.3);
        }
        return "ok";
    }

    step(budget = 50) {
        if (this.status !== "searching") return this.status;
        while (budget > 0 && (this.fwdOpen.size || this.revOpen.size)) {
            if (this.fwdOpen.size) {
                budget--;
                const r = this.expand("fwd");
                if (r === "found" || r === "partial") return this.status === "searching" ? (this.status = r) : this.status;
                if (r === "budget") return this.bestEffort("budget");
            }
            if (this.revOpen.size && this.status === "searching") {
                budget--;
                const r = this.expand("rev");
                if (r === "found" || r === "partial") return this.status === "searching" ? (this.status = r) : this.status;
                if (r === "budget") return this.bestEffort("budget");
            }
        }
        if (!this.fwdOpen.size && !this.revOpen.size) return this.bestEffort("unreachable");
        return this.status;
    }
}
