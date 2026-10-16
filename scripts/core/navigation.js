import { add, key, horizontal, CARDINAL } from "./math.js";

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

class Heap {
    constructor() { this.v = []; this.f = []; }
    get size() { return this.v.length; }
    push(v, f) {
        // Parallel arrays + temp swaps: the old version allocated a {v,f}
        // wrapper per push and a throwaway array per swap ([a,b]=[b,a]).
        const V = this.v, F = this.f;
        let i = V.length;
        V.push(v);
        F.push(f);
        while (i) {
            const p = (i - 1) >> 1;
            if (F[p] <= f) break;
            V[i] = V[p]; F[i] = F[p];
            i = p;
        }
        V[i] = v; F[i] = f;
    }
    pop() {
        const V = this.v, F = this.f;
        if (!V.length) return;
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
                V[i] = V[c]; F[i] = F[c];
                i = c;
            }
            V[i] = lv; F[i] = lf;
        }
        return top;
    }
}

const KIND_COST = {
    walk: 1, jump: 3.5, sprintjump: 5, sprintjump3: 7, sprintjump_up: 8,
    bridge_sprintjump3: 10, bridge_bridge_sprintjump3: 14, jumpup: 3,
    bridge: 8, pillar: 6, bigdrop: 2.5,
};
const LAVA = /lava/, WATER = /water/;

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
 * Performance: cells are memoised per search under a packed numeric key
 * (the old code built a "x,y,z" string and a fresh vector object for every
 * one of the ~100 reads per expanded node), and when the node budget runs
 * out the best partial route found so far is returned instead of failing,
 * so small budgets still make progress on long trips.
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
        this.cells = new Map();
        this.options = options; // {allowBridge, allowPillar, allowSprintJump}
        this.allowBridge = options.allowBridge ?? false;
        this.allowPillar = options.allowPillar ?? false;
        this.allowSprintJump = options.allowSprintJump ?? parkour;
        this.vertLimit = this.radius >= 100 ? 128 : (this.allowBridge ? 64 : 24);
        this.startH = horizontal(start, goal);
        this.best = undefined;
        this.bestH = Infinity;
        const n = { p: { x: start.x, y: start.y, z: start.z, kind: "walk" }, g: 0 };
        this.open.push(n, 0);
        this.costs.set(this.k(start.x, start.y, start.z), 0);
    }

    /** Packed numeric cell key relative to the start (|dx|,|dz| < 2048, |y| < 2048). */
    k(x, y, z) {
        return ((x - this.start.x + 2048) * 4096 + (z - this.start.z + 2048)) * 4096 + (y + 2048);
    }
    rd(x, y, z) {
        const k = this.k(x, y, z);
        let c = this.cells.get(k);
        if (c === undefined) {
            c = this.read({ x, y, z }) ?? null;
            this.cells.set(k, c);
        }
        return c;
    }
    isAir(x, y, z) {
        const c = this.rd(x, y, z);
        return !!c?.passable && !c.hazard;
    }
    isSolid(x, y, z) {
        const c = this.rd(x, y, z);
        return !!c?.support && !c.hazard;
    }
    stand(x, y, z) {
        const a = this.rd(x, y, z);
        if (!a?.passable || a.hazard) return false;
        const b = this.rd(x, y + 1, z);
        if (!b?.passable || b.hazard) return false;
        const c = this.rd(x, y - 1, z);
        return !!c?.support && !c.hazard;
    }
    // Vector forms kept for compatibility.
    air(p) { return this.isAir(p.x, p.y, p.z); }
    solid(p) { return this.isSolid(p.x, p.y, p.z); }
    safeStand(p) { return this.stand(p.x, p.y, p.z); }

    neighbors(p) {
        const out = [];
        const px = p.x, py = p.y, pz = p.z;
        const push = (x, y, z, kind, extra) => {
            if (Math.hypot(x - this.start.x, z - this.start.z) > this.radius || Math.abs(y - this.start.y) > this.vertLimit) return;
            out.push(extra ? { x, y, z, kind, ...extra } : { x, y, z, kind });
        };
        const headClear = this.isAir(px, py + 2, pz);
        let headClear3;
        for (const d of CARDINAL) {
            const dx = d.x, dz = d.z;
            const qx = px + dx, qz = pz + dz;
            const qStand = this.stand(qx, py, qz);
            // Normal walk
            if (qStand) {
                push(qx, py, qz, "walk");
            }
            // Step up 1
            else if (this.stand(qx, py + 1, qz) && headClear) {
                push(qx, py + 1, qz, "step");
            }
            // Drop down 1-3
            else if (this.isAir(qx, py, qz) && this.isAir(qx, py + 1, qz)) {
                for (let drop = 1; drop <= 3; drop++) {
                    if (this.stand(qx, py - drop, qz)) {
                        push(qx, py - drop, qz, drop === 1 ? "drop" : "bigdrop");
                        break;
                    }
                }
            }

            if (this.parkour) {
                // gap = q, land = q + d
                const gx = qx, gz = qz, lx = gx + dx, lz = gz + dz;
                const underGap = this.rd(gx, py - 1, gz);
                const gapOk = !qStand && !!underGap && !underGap.hazard;
                const gapAir2 = gapOk && this.isAir(gx, py, gz) && this.isAir(gx, py + 1, gz);
                // 1-block gap jump
                if (gapAir2 && this.isAir(gx, py + 2, gz) && headClear &&
                    this.isAir(lx, py + 2, lz) && this.stand(lx, py, lz)) {
                    push(lx, py, lz, "jump");
                }

                if (this.allowSprintJump && gapAir2) {
                    const landStand = this.stand(lx, py, lz);
                    const underLand = this.rd(lx, py - 1, lz);
                    const g2x = lx + dx, g2z = lz + dz;
                    // 2-block gap sprint jump (3 blocks distance)
                    if (!landStand && underLand && !underLand.hazard &&
                        this.isAir(lx, py, lz) && this.isAir(lx, py + 1, lz) && headClear &&
                        this.isAir(g2x, py + 2, g2z) && this.stand(g2x, py, g2z)) {
                        push(g2x, py, g2z, "sprintjump");
                    }

                    if (!landStand) {
                        const g2Stand = this.stand(g2x, py, g2z);
                        const g3x = g2x + dx, g3z = g2z + dz;
                        if (headClear3 === undefined) headClear3 = headClear && this.isAir(px, py + 3, pz);
                        const corridor3 = !g2Stand && headClear3 &&
                            this.isAir(gx, py + 2, gz) &&
                            this.isAir(lx, py, lz) && this.isAir(lx, py + 1, lz) && this.isAir(lx, py + 2, lz) &&
                            this.isAir(g2x, py, g2z) && this.isAir(g2x, py + 1, g2z) && this.isAir(g2x, py + 2, g2z);
                        if (corridor3) {
                            // 3-BLOCK GAP SPRINT JUMP - ADVANCED (4 blocks distance)
                            const underGap2 = this.rd(g2x, py - 1, g2z);
                            if (underLand && !underLand.hazard && underGap2 && !underGap2.hazard &&
                                this.isAir(g3x, py + 1, g3z) && this.isAir(g3x, py + 2, g3z) &&
                                this.stand(g3x, py, g3z)) {
                                push(g3x, py, g3z, "sprintjump3");
                            }
                            // 3-block jump with 1 up
                            if (this.isAir(g3x, py + 1, g3z) && this.isAir(g3x, py + 2, g3z) &&
                                this.stand(g3x, py + 1, g3z)) {
                                push(g3x, py + 1, g3z, "sprintjump_up");
                            }
                        }
                    }
                }

                // === ADVANCED: >3 BLOCK GAP - PLACE BLOCK THEN 3-JUMP ===
                // Only for a REAL gap: every intermediate cell must be open
                // and unstandable. (The old loop also fired on flat ground,
                // pushing ~5 bogus bridge candidates per direction per node.)
                if (this.allowSprintJump && this.allowBridge && !qStand) {
                    let run = 0;
                    const lavaPrefix = [false];
                    let lava = false;
                    for (let i = 1; i <= 8; i++) {
                        const x = px + dx * i, z = pz + dz * i;
                        if (!this.isAir(x, py, z) || !this.isAir(x, py + 1, z) || this.stand(x, py, z)) break;
                        const below = this.rd(x, py - 1, z);
                        if (below && below.hazard && below.type && LAVA.test(below.type)) lava = true;
                        lavaPrefix[i] = lava;
                        run = i;
                    }
                    for (let totalGap = 4; totalGap <= run; totalGap++) {
                        const hazardIsLava = lavaPrefix[totalGap];
                        if (hazardIsLava && totalGap > 4) continue; // Don't bridge long over lava
                        const Lx = px + dx * (totalGap + 1), Lz = pz + dz * (totalGap + 1);
                        if (this.stand(Lx, py, Lz)) {
                            const landing = { x: Lx, y: py, z: Lz };
                            if (totalGap === 4 || totalGap === 5) {
                                const at = totalGap === 4 ? 1 : 2;
                                const placePos = { x: px + dx * at, y: py, z: pz + dz * at };
                                const placeBelowRead = this.rd(placePos.x, py - 1, placePos.z);
                                if (!placeBelowRead?.hazard || !LAVA.test(placeBelowRead?.type ?? "")) {
                                    push(landing.x, landing.y, landing.z, "bridge_sprintjump3", { gap: totalGap, placeAt: placePos, placeCount: 1 });
                                }
                            } else if (totalGap === 6) {
                                const placePos = { x: px + dx * 2, y: py, z: pz + dz * 2 };
                                push(landing.x, landing.y, landing.z, "bridge_sprintjump3", { gap: totalGap, placeAt: placePos, placeCount: 2 });
                            } else if (!hazardIsLava) {
                                const placePos1 = { x: px + dx * 2, y: py, z: pz + dz * 2 };
                                const placePos2 = { x: px + dx * 5, y: py, z: pz + dz * 5 };
                                push(landing.x, landing.y, landing.z, "bridge_bridge_sprintjump3", { gap: totalGap, placeAt: placePos1, placeAt2: placePos2, placeCount: 2 });
                            }
                        } else if (totalGap <= 6 && this.isAir(Lx, py, Lz) && this.isAir(Lx, py + 1, Lz)) {
                            // Progressive bridging towards an open landing.
                            const belowBridgeRead = this.rd(qx, py - 1, qz);
                            if (!belowBridgeRead?.hazard || (belowBridgeRead && !LAVA.test(belowBridgeRead.type ?? ""))) {
                                push(qx, py, qz, "bridge", { gap: totalGap });
                            }
                        }
                    }
                }

                // Jump up 1 + forward (parkour up)
                if (headClear && this.stand(qx, py + 1, qz)) {
                    if (headClear3 === undefined) headClear3 = this.isAir(px, py + 3, pz);
                    if (headClear3 && this.isAir(qx, py + 2, qz)) push(qx, py + 1, qz, "jumpup");
                }
            }

            // Bridging: if gap with no support, allow if builder enabled (higher cost)
            if (this.allowBridge) {
                const belowRead = this.rd(qx, py - 1, qz);
                if (!belowRead?.support && this.isAir(qx, py, qz) && this.isAir(qx, py + 1, qz)) {
                    // Only if not over hazard - allow water but not lava for single bridge
                    if (!belowRead?.hazard || (belowRead && WATER.test(belowRead.type ?? ""))) {
                        const bx = qx + dx, bz = qz + dz;
                        if (this.stand(bx, py, bz) || this.isAir(bx, py, bz)) {
                            push(qx, py, qz, "bridge");
                        }
                    }
                }
            }
        }
        // Pillar up (once per node; it used to be pushed 4x inside the loop).
        if (this.allowBridge || this.options.allowPillar) {
            if (this.isAir(px, py + 1, pz) && headClear && this.isSolid(px, py - 1, pz)) {
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

    trace(n) {
        const path = [];
        let t = n;
        while (t?.parent) {
            path.push(t.p);
            t = t.parent;
        }
        return path.reverse();
    }

    /** Out of budget / options: hand back the best partial route if it gets us meaningfully closer. */
    bestEffort(status) {
        if (this.best && this.best.parent && this.bestH <= this.startH - 3) {
            this.path = this.trace(this.best);
            return (this.status = "partial");
        }
        return (this.status = status);
    }

    step(budget = 50) {
        if (this.status !== "searching") return this.status;
        const goal = this.goal;
        while (budget-- > 0 && this.open.size) {
            const n = this.open.pop();
            const np = n.p;
            if (n.g !== this.costs.get(this.k(np.x, np.y, np.z))) continue;
            if (++this.expanded > this.maxNodes) return this.bestEffort("budget");
            const h = horizontal(np, goal);
            if (h < this.bestH && n.parent) { this.bestH = h; this.best = n; }
            const progress = this.allowPartial &&
                horizontal(np, this.start) >= 16 &&
                h < this.startH - 6;
            if (progress || (h <= this.tolerance && Math.abs(np.y - goal.y) < 1.5)) {
                this.path = this.trace(n);
                return (this.status = progress ? "partial" : "found");
            }
            for (const q of this.neighbors(np)) {
                const cost = KIND_COST[q.kind] ?? 1.5;
                const g = n.g + cost + this.penalty(q), k = this.k(q.x, q.y, q.z);
                if (g >= (this.costs.get(k) ?? Infinity)) continue;
                this.costs.set(k, g);
                this.open.push({ p: q, g, parent: n }, g + horizontal(q, goal) * 0.9 + Math.abs(q.y - goal.y) * 0.3);
            }
        }
        if (!this.open.size) return this.bestEffort("unreachable");
        return this.status;
    }
}
