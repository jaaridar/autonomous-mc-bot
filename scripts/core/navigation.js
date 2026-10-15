import { add, horizontal, CARDINAL } from "./math.js";

/**
 * Standable: feet passable, head passable, support solid, no hazard.
 * This is the core predicate for walkable cells.
 */
export function standable(read, p) {
    const a = read(p), b = read(add(p, { x: 0, y: 1, z: 0 })), c = read(add(p, { x: 0, y: -1, z: 0 }));
    return !!(a?.passable &&
        b?.passable &&
        c?.support &&
        !a.hazard &&
        !b.hazard &&
        !c.hazard);
}

/**
 * Exact numeric key for a cell near the search start (x/z wrap every 65536
 * blocks, far beyond any search radius). Numbers hash without building a
 * string per lookup - the old `${x},${y},${z}` keys allocated on every probe.
 */
export const cellKey = (x, y, z) => ((x & 0xffff) * 65536 + (z & 0xffff)) * 1024 + ((y + 512) & 1023);

/** Binary min-heap on f; parallel arrays, no wrapper objects, no destructuring swaps. */
class Heap {
    constructor() { this.v = []; this.f = []; }
    get size() { return this.v.length; }
    push(v, f) {
        const V = this.v, F = this.f;
        let i = V.length;
        V.push(v);
        F.push(f);
        while (i > 0) {
            const p = (i - 1) >> 1;
            if (F[p] <= f) break;
            V[i] = V[p];
            F[i] = F[p];
            i = p;
        }
        V[i] = v;
        F[i] = f;
    }
    pop() {
        const V = this.v, F = this.f;
        if (!V.length) return undefined;
        const top = V[0];
        const lastV = V.pop(), lastF = F.pop();
        const n = V.length;
        if (n) {
            let i = 0;
            while (true) {
                let c = i * 2 + 1;
                if (c >= n) break;
                if (c + 1 < n && F[c + 1] < F[c]) c++;
                if (lastF <= F[c]) break;
                V[i] = V[c];
                F[i] = F[c];
                i = c;
            }
            V[i] = lastV;
            F[i] = lastF;
        }
        return top;
    }
}

const COST = {
    walk: 1, step: 1.5, drop: 1.5, bigdrop: 2.5, jump: 3.5, sprintjump: 5, sprintjump3: 7, sprintjump_up: 8,
    bridge_sprintjump3: 10, bridge_bridge_sprintjump3: 14, jumpup: 3, bridge: 8, pillar: 6,
};
/**
 * Heuristic weight on an admissible Manhattan estimate (every move costs at
 * least 1 per horizontal block and 0.5 per vertical block). A small weight
 * trades a few percent of path optimality for far fewer expansions; the old
 * 0.9 x Euclidean estimate under-shot badly on a 4-connected grid and made
 * A* flood the whole radius on diagonal goals.
 */
const H_WEIGHT = 1.15;

/**
 * Advanced PathSearch with:
 * - 1-block gap jumps
 * - 2-block sprint jumps
 * - 1-up steps
 * - drops up to 3 blocks
 * - bridging awareness (cost for gaps)
 * - threat avoidance
 * - parkour chain
 *
 * Time-sliced: the navigator calls step(budget) once per tick until the search
 * finishes. Cell reads are memoized for the life of the search.
 */
export class PathSearch {
    constructor(read, start, goal, tolerance = 0.7, parkour = true, maxNodes = 2000, radius = 32, allowPartial = false, avoid = [], options = {}) {
        this.read = read;
        this.start = start;
        this.goal = goal;
        this.tolerance = tolerance;
        this.parkour = parkour;
        this.maxNodes = maxNodes;
        this.radius = radius;
        this.allowPartial = allowPartial;
        this.avoid = avoid;
        this.avoidRadii = avoid.map((a) => (a.radius ?? 5) ** 2);
        this.status = "searching";
        this.path = [];
        this.expanded = 0;
        this.open = new Heap();
        this.costs = new Map();
        this.options = options; // {allowBridge, allowPillar, allowSprintJump}
        this.allowBridge = options.allowBridge ?? false;
        this.allowPillar = options.allowPillar ?? false;
        this.allowSprintJump = options.allowSprintJump ?? parkour;
        // UNBREAKABLE TOWER 100: allow up to 128 vertical for following high towers, 32 for normal
        this.vertLimit = options.vertLimit ?? (this.radius >= 100 ? 128 : (this.allowBridge ? 64 : 24));
        this.cells = new Map();
        this.stands = new Map();
        this.startGoal = horizontal(start, goal);
        const k = cellKey(start.x, start.y, start.z);
        const n = { p: { x: start.x, y: start.y, z: start.z, kind: "walk" }, g: 0, k, parent: undefined };
        this.open.push(n, 0);
        this.costs.set(k, 0);
    }

    /** Memoized terrain read for the life of the search (null = unloaded). */
    rd(x, y, z) {
        const k = cellKey(x, y, z);
        let c = this.cells.get(k);
        if (c === undefined) {
            c = this.read({ x, y, z }) ?? null;
            this.cells.set(k, c);
        }
        return c;
    }
    airAt(x, y, z) {
        const c = this.rd(x, y, z);
        return !!c && c.passable && !c.hazard;
    }
    standAt(x, y, z) {
        const k = cellKey(x, y, z);
        let s = this.stands.get(k);
        if (s === undefined) {
            const a = this.rd(x, y, z);
            s = !!(a && a.passable && !a.hazard);
            if (s) {
                const b = this.rd(x, y + 1, z);
                s = !!(b && b.passable && !b.hazard);
                if (s) {
                    const c = this.rd(x, y - 1, z);
                    s = !!(c && c.support && !c.hazard);
                }
            }
            this.stands.set(k, s);
        }
        return s;
    }
    // Object-taking forms kept for callers/tests that use them.
    air(p) { return this.airAt(p.x, p.y, p.z); }
    solid(p) {
        const c = this.rd(p.x, p.y, p.z);
        return !!c && c.support && !c.hazard;
    }
    safeStand(p) { return this.standAt(p.x, p.y, p.z); }

    neighbors(p) {
        const out = [];
        const px = p.x, py = p.y, pz = p.z;
        const sx = this.start.x, sy = this.start.y, sz = this.start.z;
        const r2 = this.radius * this.radius, vlim = this.vertLimit;
        const push = (x, y, z, kind, extra) => {
            const dx = x - sx, dz = z - sz;
            if (dx * dx + dz * dz > r2 || Math.abs(y - sy) > vlim) return;
            const q = { x, y, z, kind };
            if (extra) Object.assign(q, extra);
            out.push(q);
        };
        const headroom2 = this.airAt(px, py + 2, pz);
        let headroom3;
        for (const d of CARDINAL) {
            const qx = px + d.x, qz = pz + d.z;
            const standQ = this.standAt(qx, py, qz);
            // Normal walk
            if (standQ) {
                push(qx, py, qz, "walk");
            }
            // Step up 1
            else if (headroom2 && this.standAt(qx, py + 1, qz)) {
                push(qx, py + 1, qz, "step");
            }
            // Drop down 1-3
            else if (this.airAt(qx, py, qz) && this.airAt(qx, py + 1, qz)) {
                for (let drop = 1; drop <= 3; drop++) {
                    if (this.standAt(qx, py - drop, qz)) {
                        push(qx, py - drop, qz, drop === 1 ? "drop" : "bigdrop");
                        break;
                    }
                }
            }

            // Every jump kind crosses a gap at q: if q is plain walkable there
            // is nothing to jump over (the old code evaluated ~30 reads per
            // direction per node before discovering that).
            if (this.parkour && !standQ && headroom2) {
                const under = this.rd(qx, py - 1, qz);
                const gapClear = !!under && !under.hazard &&
                    this.airAt(qx, py, qz) && this.airAt(qx, py + 1, qz);
                if (gapClear) {
                    const gapHead = this.airAt(qx, py + 2, qz);
                    // 1-block gap jump
                    const lx = qx + d.x, lz = qz + d.z;
                    if (gapHead && this.airAt(lx, py + 2, lz) && this.standAt(lx, py, lz)) {
                        push(lx, py, lz, "jump");
                    }
                    // 2-block gap sprint jump (3 blocks distance)
                    if (this.allowSprintJump && !this.standAt(lx, py, lz)) {
                        const underLand = this.rd(lx, py - 1, lz);
                        const underLandOk = !!underLand && !underLand.hazard;
                        const landAir = this.airAt(lx, py, lz) && this.airAt(lx, py + 1, lz);
                        const g2x = lx + d.x, g2z = lz + d.z;
                        if (underLandOk && landAir && this.airAt(g2x, py + 2, g2z) && this.standAt(g2x, py, g2z)) {
                            push(g2x, py, g2z, "sprintjump");
                        }
                        // 3-block gaps (4 blocks distance), flat or one up
                        if (landAir && gapHead && !this.standAt(g2x, py, g2z)) {
                            if (headroom3 === undefined) headroom3 = this.airAt(px, py + 3, pz);
                            const wide = headroom3 && this.airAt(lx, py + 2, lz) &&
                                this.airAt(g2x, py, g2z) && this.airAt(g2x, py + 1, g2z) && this.airAt(g2x, py + 2, g2z);
                            if (wide) {
                                const g3x = g2x + d.x, g3z = g2z + d.z;
                                const g3Head = this.airAt(g3x, py + 1, g3z) && this.airAt(g3x, py + 2, g3z);
                                const underGap2 = this.rd(g2x, py - 1, g2z);
                                if (underLandOk && underGap2 && !underGap2.hazard && g3Head && this.standAt(g3x, py, g3z)) {
                                    push(g3x, py, g3z, "sprintjump3");
                                }
                                if (g3Head && this.standAt(g3x, py + 1, g3z)) {
                                    push(g3x, py + 1, g3z, "sprintjump_up");
                                }
                            }
                        }
                    }
                }
            }

            // === ADVANCED: >3 BLOCK GAP - PLACE BLOCK THEN 3-JUMP ===
            // Only across a real gap (q not walkable); the air run is measured
            // once instead of re-walked for every gap length 4..8.
            if (this.parkour && this.allowSprintJump && this.allowBridge && !standQ) {
                let run = 0, firstLava = 0;
                for (let i = 1; i <= 8; i++) {
                    const gx = px + d.x * i, gz = pz + d.z * i;
                    if (!this.airAt(gx, py, gz) || !this.airAt(gx, py + 1, gz)) break;
                    const below = this.rd(gx, py - 1, gz);
                    if (!firstLava && below && below.hazard && below.type && below.type.includes("lava")) firstLava = i;
                    run = i;
                }
                let bridged = false;
                for (let totalGap = 4; totalGap <= run; totalGap++) {
                    const hazardIsLava = firstLava > 0 && firstLava <= totalGap;
                    if (hazardIsLava && totalGap > 4) continue; // Don't bridge long over lava
                    const lx = px + d.x * (totalGap + 1), lz = pz + d.z * (totalGap + 1);
                    if (this.standAt(lx, py, lz)) {
                        if (totalGap <= 5) {
                            const at = totalGap === 4 ? 1 : 2;
                            const placeAt = { x: px + d.x * at, y: py, z: pz + d.z * at };
                            const pb = this.rd(placeAt.x, py - 1, placeAt.z);
                            if (!pb?.hazard || !(pb?.type ?? "").includes("lava")) {
                                push(lx, py, lz, "bridge_sprintjump3", { gap: totalGap, placeAt, placeCount: 1 });
                            }
                        } else if (totalGap === 6) {
                            push(lx, py, lz, "bridge_sprintjump3", { gap: totalGap, placeAt: { x: px + d.x * 2, y: py, z: pz + d.z * 2 }, placeCount: 2 });
                        } else if (!hazardIsLava) {
                            push(lx, py, lz, "bridge_bridge_sprintjump3", { gap: totalGap, placeAt: { x: px + d.x * 2, y: py, z: pz + d.z * 2 }, placeAt2: { x: px + d.x * 5, y: py, z: pz + d.z * 5 }, placeCount: 2 });
                        }
                    } else if (!bridged && totalGap <= 6 && this.airAt(lx, py, lz) && this.airAt(lx, py + 1, lz)) {
                        // Even if landing is air, we can still bridge towards it - progressive bridging
                        const bb = this.rd(qx, py - 1, qz);
                        if (!bb?.hazard || (bb && !(bb.type ?? "").includes("lava"))) {
                            push(qx, py, qz, "bridge", { gap: totalGap });
                            bridged = true;
                        }
                    }
                }
            }

            // Bridging: if gap with no support, allow if builder enabled (higher cost)
            if (this.allowBridge) {
                const belowRead = this.rd(qx, py - 1, qz);
                if (!belowRead?.support && this.airAt(qx, py, qz) && this.airAt(qx, py + 1, qz)) {
                    // Only if not over hazard - allow water but not lava for single bridge
                    if (!belowRead?.hazard || (belowRead && (belowRead.type ?? "").includes("water"))) {
                        const bx = qx + d.x, bz = qz + d.z;
                        if (this.standAt(bx, py, bz) || this.airAt(bx, py, bz)) {
                            push(qx, py, qz, "bridge");
                        }
                    }
                }
            }
        }
        // Pillar up: if need to go high (100 block tower), allow pillar up with build blocks
        // (once per node - it used to be pushed once per direction)
        if (this.allowBridge || this.options.allowPillar) {
            const below = this.rd(px, py - 1, pz);
            if (this.airAt(px, py + 1, pz) && headroom2 && !!below && below.support && !below.hazard) {
                push(px, py + 1, pz, "pillar");
            }
        }
        return out;
    }

    penalty(p) {
        if (!this.avoid.length) return 0;
        let cost = 0;
        for (let i = 0; i < this.avoid.length; i++) {
            const a = this.avoid[i];
            const dx = p.x - a.x, dz = p.z - a.z;
            const d2 = dx * dx + dz * dz;
            if (d2 < this.avoidRadii[i]) cost += (this.avoidRadii[i] - d2) * 0.5;
        }
        return cost;
    }

    step(budget = 50) {
        if (this.status !== "searching") return this.status;
        const goal = this.goal, gx = goal.x, gy = goal.y, gz = goal.z;
        while (budget-- > 0 && this.open.size) {
            const n = this.open.pop();
            if (n.g !== this.costs.get(n.k)) continue;
            if (++this.expanded > this.maxNodes) return (this.status = "budget");
            const np = n.p;
            const toGoal = horizontal(np, goal);
            const progress = this.allowPartial &&
                toGoal < this.startGoal - 6 &&
                horizontal(np, this.start) >= 16;
            if (progress ||
                (toGoal <= this.tolerance &&
                    Math.abs(np.y - gy) < 1.5)) {
                const path = [];
                let t = n;
                while (t?.parent) {
                    path.push(t.p);
                    t = t.parent;
                }
                this.path = path.reverse();
                return (this.status = progress ? "partial" : "found");
            }
            const next = this.neighbors(np);
            for (let i = 0; i < next.length; i++) {
                const q = next[i];
                const g = n.g + (COST[q.kind] ?? 1.5) + this.penalty(q);
                const k = cellKey(q.x, q.y, q.z);
                const old = this.costs.get(k);
                if (old !== undefined && g >= old) continue;
                this.costs.set(k, g);
                const h = (Math.abs(q.x - gx) + Math.abs(q.z - gz)) + Math.abs(q.y - gy) * 0.5;
                this.open.push({ p: q, g, k, parent: n }, g + h * H_WEIGHT);
            }
        }
        if (!this.open.size) this.status = "unreachable";
        return this.status;
    }
}
