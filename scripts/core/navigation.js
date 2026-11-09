import { add, key, horizontal, CARDINAL } from "./math.js";
import { cellDanger } from "./brain/danger.js";

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
 * Standing in a fluid is legal for the pathfinder: the bot swims/wades, and
 * refusing water made every river, lake and flooded cave "unreachable" - the
 * single most common way the old search dead-ended. Lava and other damaging
 * blocks stay forbidden. Landing IN water never hurts in Minecraft, so a drop
 * of any depth into water is safe.
 */
export function swimStandable(read, p) {
    const a = read(p), b = read(add(p, { x: 0, y: 1, z: 0 }));
    if (!a?.passable || !b?.passable) return false;
    if (a.hazard && !isWaterCell(a)) return false;
    if (b.hazard && !isWaterCell(b)) return false;
    if (isWaterCell(a)) return true;
    const c = read(add(p, { x: 0, y: -1, z: 0 }));
    return !!c?.support && !c.hazard;
}

/** A cell whose fluid content is water (the Terrain Cell exposes `type`). */
export function isWaterCell(c) {
    return !!c && /water/.test(String(c.type ?? ""));
}
export function isLavaCell(c) {
    return !!c && /lava/.test(String(c.type ?? ""));
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
    bridge: 8, pillar: 6, bigdrop: 2.5, step: 1.6, drop: 1.4,
    swim: 2.2, diagonal: 1.5,
};
const LAVA = /lava/, WATER = /water/;
/** Drop depths that are always survivable without a water bucket. */
const SAFE_DROP = 3;

/**
 * Advanced PathSearch with:
 * - 1/2/3-block gap jumps (sprint-jump aware)
 * - 1-up steps, drops up to a safe depth (deeper only when landing in water)
 * - bridging awareness (cost for gaps) - horizontal and diagonal
 * - swimming through water instead of refusing it
 * - falling-block aware floors (sand/gravel are not supports you may stand on
 *   while digging, but they are normal floors to walk on)
 * - threat avoidance
 *
 * Performance: cells are memoised per search under a packed numeric key,
 * and when the node budget runs out the best partial route found so far is
 * returned instead of failing, so small budgets still make progress on long
 * trips. The frontier is *incremental*: a search object can be resumed on the
 * next tick instead of being thrown away and rebuilt.
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
        this.options = options; // {allowBridge, allowPillar, allowSprintJump, allowSwim}
        // {threats:[{x,y,z,damage,reach}], hp} - enables the composable risk model.
        this.danger = options.danger ?? null;
        this.dangerWorld = options.dangerWorld ?? null;
        this.riskCache = new Map();
        this.allowBridge = options.allowBridge ?? false;
        this.allowPillar = options.allowPillar ?? false;
        this.allowSprintJump = options.allowSprintJump ?? parkour;
        this.allowSwim = options.allowSwim ?? true;
        // A vertical limit of 24 above/below the start is ample for stairs,
        // caves and shallow ravines while a 128 limit let a search wander into
        // a whole mountain. It is widened only for genuine towers.
        this.vertLimit = this.radius >= 100 ? 128 : (this.allowBridge ? 48 : 24);
        this.startH = horizontal(start, goal);
        this.best = undefined;
        this.bestH = Infinity;
        // Longer trips are scored with a bigger distance weight so the search
        // heads for the goal instead of exhaustively filling the horizon.
        this.hWeight = this.startH > 40 ? 1.15 : 0.95;
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
    isWater(x, y, z) { return isWaterCell(this.rd(x, y, z)); }
    isLava(x, y, z) { return isLavaCell(this.rd(x, y, z)); }

    /** Feet/head passable, no hazard except swimmable water. */
    clear(x, y, z) {
        const a = this.rd(x, y, z);
        if (!a?.passable) return false;
        if (a.hazard && !isWaterCell(a)) return false;
        const b = this.rd(x, y + 1, z);
        if (!b?.passable) return false;
        if (b.hazard && !isWaterCell(b)) return false;
        return true;
    }
    inWater(x, y, z) {
        return this.isWater(x, y, z) || this.isWater(x, y + 1, z);
    }

    stand(x, y, z) {
        const a = this.rd(x, y, z);
        if (!a?.passable || (a.hazard && !isWaterCell(a))) return false;
        const b = this.rd(x, y + 1, z);
        if (!b?.passable || (b.hazard && !isWaterCell(b))) return false;
        if (isWaterCell(a)) return true;
        const c = this.rd(x, y - 1, z);
        return !!c?.support && !c.hazard;
    }
    // Vector forms kept for compatibility.
    air(p) { return this.isAir(p.x, p.y, p.z); }
    solid(p) { return this.isSolid(p.x, p.y, p.z); }
    safeStand(p) { return this.stand(p.x, p.y, p.z); }

    /** True when dropping from (x,y,z) to (x,ty,z) cannot hurt. */
    safeDrop(x, fromY, z, ty) {
        if (fromY - ty <= SAFE_DROP) return true;
        // Any water in the fall column column or at the landing pool saves it.
        for (let y = fromY; y >= ty; y--) if (this.isWater(x, y, z)) return true;
        return false;
    }

    neighbors(p) {
        const out = [];
        const px = p.x, py = p.y, pz = p.z;
        const push = (x, y, z, kind, extra) => {
            if (Math.hypot(x - this.start.x, z - this.start.z) > this.radius || Math.abs(y - this.start.y) > this.vertLimit) return;
            if (this.avoid.length && this.avoidPenalty(x, y, z) > 900) return;
            // Lethal cells are walls. A route may not be "cheap" through a cell
            // that ends the run, however close to the goal it is.
            if (this.danger) {
                const d = this.risk(x, y, z);
                if (d?.lethal) return;
            }
            out.push(extra ? { x, y, z, kind, ...extra } : { x, y, z, kind });
        };
        const headClear = this.isAir(px, py + 2, pz);
        const standingInWater = this.inWater(px, py, pz);
        let headClear3;
        for (const d of CARDINAL) {
            const dx = d.x, dz = d.z;
            const qx = px + dx, qz = pz + dz;
            const qStand = this.stand(qx, py, qz);
            const qOpen = this.clear(qx, py, qz);
            // Normal walk (includes swimming across the surface).
            if (qStand) {
                push(qx, py, qz, standingInWater || this.inWater(qx, py, qz) ? "swim" : "walk");
            }
            // Step up 1
            else if (headClear && this.stand(qx, py + 1, qz)) {
                push(qx, py + 1, qz, "step");
            }
            // Drop down: support at any depth that is survivable. Landing in
            // water is always survivable, so a lake below a cliff is a route.
            else if (qOpen) {
                for (let drop = 1; drop <= 24; drop++) {
                    if (this.stand(qx, py - drop, qz)) {
                        if (!this.safeDrop(qx, py, qz, py - drop)) break; // too far without water
                        push(qx, py - drop, qz, drop <= 1 ? "drop" : "bigdrop");
                        break;
                    }
                    // Stop scanning once a floor exists that is not standable
                    const below = this.rd(qx, py - drop, qz);
                    if (below && below.support) break;
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
                // and unstandable.
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

            // Bridging: if gap with no support, allow if builder enabled (higher cost).
            // Water below is bridged freely; lava only one cell (never a long bridge).
            if (this.allowBridge) {
                const belowRead = this.rd(qx, py - 1, qz);
                if (!belowRead?.support && this.isAir(qx, py, qz) && this.isAir(qx, py + 1, qz)) {
                    const hazard = !!belowRead?.hazard;
                    const lava = hazard && LAVA.test(belowRead?.type ?? "");
                    if (!hazard || (belowRead && WATER.test(belowRead.type ?? "")) || (lava && !qStand)) {
                        const bx = qx + dx, bz = qz + dz;
                        // A bridge step is only proposed when it makes progress:
                        // the far side is standable, or at least open air so the
                        // bridge can continue next node.
                        if (this.stand(bx, py, bz) || this.isAir(bx, py, bz)) push(qx, py, qz, "bridge");
                    }
                }
            }
        }
        // Diagonal movement: Minecraft players move diagonally all the time; the
        // old grid was cardinal-only which made open ground 40% slower and made
        // "walk around the corner" trails look like pacing. A diagonal step is
        // allowed only when both adjacent cardinal cells are open (no corner
        // clipping) and the destination is standable.
        const diag = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
        for (const [dx, dz] of diag) {
            const qx = px + dx, qz = pz + dz;
            if (!this.stand(qx, py, qz)) continue;
            if (!this.clear(px + dx, py, pz) || !this.clear(px, py, pz + dz)) continue;
            push(qx, py, qz, "diagonal");
        }
        // Pillar up (once per node; it used to be pushed 4x inside the loop).
        if (this.allowBridge || this.options.allowPillar) {
            if (this.isAir(px, py + 1, pz) && headClear && this.isSolid(px, py - 1, pz)) {
                push(px, py + 1, pz, "pillar");
            }
        }
        return out;
    }

    avoidPenalty(x, y, z) {
        if (!this.avoid.length) return 0;
        let cost = 0;
        for (let i = 0; i < this.avoid.length; i++) {
            const a = this.avoid[i];
            const dx = x - a.x, dz = z - a.z;
            const d2 = dx * dx + dz * dz;
            if (d2 < this.avoidRadii[i]) cost += (this.avoidRadii[i] - d2) * 0.5;
        }
        return cost;
    }
    penalty(p) {
        return this.avoid.length ? this.avoidPenalty(p.x, p.y, p.z) : 0;
    }

    /**
     * Composable risk for one cell, from the shared danger model.
     *
     * HAZARDS used to be handled one predicate at a time (isLava? isWater?
     * drop too deep? mob nearby?), so combinations nobody wrote a rule for -
     * a 4-drop onto a block next to lava at 2 HP, or a dark ledge over water -
     * were either free or fatal. `cellDanger` sums the independent factors and
     * marks the lethal ones, and the search treats lethal cells as walls.
     *
     * `dangerWorld` defaults to *this* search's memoised reader, so this adds
     * no extra block reads beyond the 3x3 column already cached.
     */
    risk(x, y, z) {
        if (!this.danger) return undefined;
        const key3 = (x + 1024) * 4096 * 4096 + (y + 1024) * 4096 + (z + 1024);
        const cached = this.riskCache.get(key3);
        if (cached !== undefined) return cached;
        let d;
        try {
            const world = this.dangerWorld ?? { block: (bx, by, bz) => this.rd(bx, by, bz) };
            d = cellDanger(world, { x, y, z }, this.danger.threats ?? [], { hp: this.danger.hp ?? 20 });
        } catch { d = undefined; }
        this.riskCache.set(key3, d);
        return d;
    }

    /** Extra movement cost for standing on (x,y,z). Lethal cells are excluded upstream. */
    riskPenalty(x, y, z) {
        const d = this.risk(x, y, z);
        if (!d) return 0;
        // Lethal cells never reach here (they are filtered as walls), so this
        // only prices down the survivable-but-bad ones: falls, water, mobs.
        let p = 0;
        if (d.parts) {
            p += (d.parts.fall ?? 0) * 0.8;
            p += (d.parts.water ?? 0) * 0.6;
            p += (d.parts.mobs ?? 0) * 0.35;
            p += (d.parts.dark ?? 0) * 0.15;
        }
        return p;
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
        if (this.best && this.best.parent && this.bestH <= this.startH - Math.min(3, this.startH * 0.2)) {
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
                const g = n.g + cost + this.penalty(q) + this.riskPenalty(q.x, q.y, q.z), k = this.k(q.x, q.y, q.z);
                if (g >= (this.costs.get(k) ?? Infinity)) continue;
                this.costs.set(k, g);
                this.open.push({ p: q, g, parent: n }, g + (horizontal(q, goal) * this.hWeight + Math.abs(q.y - goal.y) * 0.3));
            }
        }
        if (!this.open.size) return this.bestEffort("unreachable");
        return this.status;
    }
}
