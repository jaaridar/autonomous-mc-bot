// FROZEN REFERENCE: PathSearch exactly as it was before the ultra-efficiency
// pass (v1.2.4). Used only by tools/perf.test.mjs as an oracle for the
// neighbour-equivalence fuzz and the expansion/read benchmarks. Do not edit.
import { add, key, horizontal, CARDINAL } from "../../scripts/core/math.js";

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
    constructor() { this.a = []; }
    get size() { return this.a.length; }
    push(v, f) {
        const a = this.a;
        a.push({ v, f });
        let i = a.length - 1;
        while (i) {
            const p = (i - 1) >> 1;
            if (a[p].f <= f) break;
            [a[p], a[i]] = [a[i], a[p]];
            i = p;
        }
    }
    pop() {
        const a = this.a;
        if (!a.length) return;
        const v = a[0].v, tail = a.pop();
        if (a.length) {
            a[0] = tail;
            let i = 0;
            while (true) {
                let c = i * 2 + 1;
                if (c >= a.length) break;
                if (c + 1 < a.length && a[c + 1].f < a[c].f) c++;
                if (a[i].f <= a[c].f) break;
                [a[i], a[c]] = [a[c], a[i]];
                i = c;
            }
        }
        return v;
    }
}

/**
 * Advanced PathSearch with:
 * - 1-block gap jumps
 * - 2-block sprint jumps
 * - 1-up steps
 * - drops up to 3 blocks
 * - bridging awareness (cost for gaps)
 * - threat avoidance
 * - parkour chain
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
        const n = { p: { ...start, kind: "walk" }, g: 0 };
        this.open.push(n, 0);
        this.costs.set(key(start), 0);
    }

    air(p) {
        const c = this.read(p);
        return !!c?.passable && !c.hazard;
    }
    solid(p) {
        const c = this.read(p);
        return !!c?.support && !c.hazard;
    }
    safeStand(p) {
        return standable(this.read, p);
    }

    neighbors(p) {
        const out = [];
        for (const d of CARDINAL) {
            const q = add(p, d);
            // Normal walk
            if (this.safeStand(q)) {
                out.push({ ...q, kind: "walk" });
            }
            // Step up 1
            else if (this.safeStand(add(q, { x: 0, y: 1, z: 0 })) && this.air(add(p, { x: 0, y: 2, z: 0 }))) {
                out.push({ ...q, y: q.y + 1, kind: "step" });
            }
            // Drop down 1-3
            else {
                for (let drop = 1; drop <= 3; drop++) {
                    const dq = { x: q.x, y: q.y - drop, z: q.z };
                    if (this.air(q) && this.air(add(q, { x: 0, y: 1, z: 0 })) && this.safeStand(dq)) {
                        out.push({ ...dq, kind: drop === 1 ? "drop" : "bigdrop" });
                        break;
                    }
                }
            }

            if (this.parkour) {
                // 1-block gap jump
                const gap = add(p, d);
                const land = add(gap, d);
                const underGap = this.read(add(gap, { x: 0, y: -1, z: 0 }));
                if (!this.safeStand(gap) &&
                    underGap && !underGap.hazard &&
                    this.air(gap) &&
                    this.air(add(gap, { x: 0, y: 1, z: 0 })) &&
                    this.air(add(gap, { x: 0, y: 2, z: 0 })) &&
                    this.air(add(p, { x: 0, y: 2, z: 0 })) &&
                    this.air(add(land, { x: 0, y: 2, z: 0 })) &&
                    this.safeStand(land)) {
                    out.push({ ...land, kind: "jump" });
                }

                // 2-block gap sprint jump (3 blocks distance)
                if (this.allowSprintJump) {
                    const gap2 = add(land, d);
                    if (!this.safeStand(gap) && !this.safeStand(land) &&
                        underGap && !underGap.hazard &&
                        this.read(add(land, { x: 0, y: -1, z: 0 })) &&
                        !this.read(add(land, { x: 0, y: -1, z: 0 }))?.hazard &&
                        this.air(gap) && this.air(add(gap, { x: 0, y: 1, z: 0 })) &&
                        this.air(land) && this.air(add(land, { x: 0, y: 1, z: 0 })) &&
                        this.air(add(p, { x: 0, y: 2, z: 0 })) &&
                        this.air(add(gap2, { x: 0, y: 2, z: 0 })) &&
                        this.safeStand(gap2)) {
                        out.push({ ...gap2, kind: "sprintjump" });
                    }

                    // 3-BLOCK GAP SPRINT JUMP - ADVANCED (4 blocks distance)
                    const gap3 = add(gap2, d);
                    const underGap2 = this.read(add(gap2, { x: 0, y: -1, z: 0 }));
                    if (!this.safeStand(gap) && !this.safeStand(land) && !this.safeStand(gap2) &&
                        underGap && !underGap.hazard &&
                        this.read(add(land, { x: 0, y: -1, z: 0 })) && !this.read(add(land, { x: 0, y: -1, z: 0 }))?.hazard &&
                        underGap2 && !underGap2.hazard &&
                        this.air(gap) && this.air(add(gap, { x: 0, y: 1, z: 0 })) && this.air(add(gap, { x: 0, y: 2, z: 0 })) &&
                        this.air(land) && this.air(add(land, { x: 0, y: 1, z: 0 })) && this.air(add(land, { x: 0, y: 2, z: 0 })) &&
                        this.air(gap2) && this.air(add(gap2, { x: 0, y: 1, z: 0 })) && this.air(add(gap2, { x: 0, y: 2, z: 0 })) &&
                        this.air(add(p, { x: 0, y: 2, z: 0 })) && this.air(add(p, { x: 0, y: 3, z: 0 })) &&
                        this.air(add(gap3, { x: 0, y: 1, z: 0 })) && this.air(add(gap3, { x: 0, y: 2, z: 0 })) &&
                        this.safeStand(gap3)) {
                        out.push({ ...gap3, kind: "sprintjump3" });
                    }

                    // 3-block jump with 1 up
                    const upLand3 = add(gap3, { x: 0, y: 1, z: 0 });
                    if (!this.safeStand(gap) && !this.safeStand(land) && !this.safeStand(gap2) &&
                        underGap && !underGap.hazard &&
                        this.air(gap) && this.air(add(gap, { x: 0, y: 1, z: 0 })) && this.air(add(gap, { x: 0, y: 2, z: 0 })) &&
                        this.air(land) && this.air(add(land, { x: 0, y: 1, z: 0 })) && this.air(add(land, { x: 0, y: 2, z: 0 })) &&
                        this.air(gap2) && this.air(add(gap2, { x: 0, y: 1, z: 0 })) && this.air(add(gap2, { x: 0, y: 2, z: 0 })) &&
                        this.air(add(p, { x: 0, y: 2, z: 0 })) && this.air(add(p, { x: 0, y: 3, z: 0 })) &&
                        this.air(upLand3) && this.air(add(upLand3, { x: 0, y: 1, z: 0 })) &&
                        this.safeStand(upLand3)) {
                        out.push({ ...upLand3, kind: "sprintjump_up" });
                    }

                    // === ADVANCED: >3 BLOCK GAP - PLACE BLOCK THEN 3-JUMP ===
                    // For gaps 4,5,6,7 blocks: if we have blocks, we can place intermediate block(s) to enable 3-block jump
                    // This handles all conditions: over water, lava, void, diagonal, etc - checks hazard and support
                    if (this.allowBridge) {
                        // Check up to 8 blocks ahead for landing
                        for (let totalGap = 4; totalGap <= 8; totalGap++) {
                            const landingPos = add(p, { x: d.x * (totalGap + 1), y: 0, z: d.z * (totalGap + 1) });
                            const landingBelow = add(landingPos, { x: 0, y: -1, z: 0 });
                            const landingBelowRead = this.read(landingBelow);
                            
                            // Landing must be safe or at least not hazard (could be air if we will bridge further)
                            const landingSafe = this.safeStand(landingPos);
                            const landingAir = this.air(landingPos) && this.air(add(landingPos, { x: 0, y: 1, z: 0 }));
                            
                            // Check if all intermediate gaps are air and not over lava (hazard check)
                            let allAir = true;
                            let hasHazard = false;
                            let hazardIsLava = false;
                            for (let i = 1; i <= totalGap; i++) {
                                const gapPos = add(p, { x: d.x * i, y: 0, z: d.z * i });
                                const belowGap = add(gapPos, { x: 0, y: -1, z: 0 });
                                const belowRead = this.read(belowGap);
                                if (!this.air(gapPos) || !this.air(add(gapPos, { x: 0, y: 1, z: 0 }))) {
                                    allAir = false;
                                    break;
                                }
                                if (belowRead && belowRead.hazard) {
                                    hasHazard = true;
                                    if (belowRead.type && /lava/.test(belowRead.type)) hazardIsLava = true;
                                }
                            }
                            
                            if (!allAir) continue;
                            // Don't bridge over lava unless we have to and have safe blocks? But allow if not lava or if we can still bridge with caution
                            if (hazardIsLava && totalGap > 4) continue; // Don't bridge long over lava
                            
                            if (landingSafe) {
                                // Found landing beyond large gap
                                // Strategy: place block(s) to reduce gap to <=3, then do 3-block jump
                                // For gap 4: place at 1, then jump 3 (1->5)
                                // For gap 5: place at 2, then jump 3 (2->6)
                                // For gap 6: place at 2-3, then jump 3
                                // For gap 7: place at 3, then jump 3 (3->7) + need one more bridge
                                // For gap 8: place at 3 and 6, etc
                                
                                if (totalGap === 4) {
                                    // Place 1 block at distance 1, then 3-block jump from there to landing
                                    const placePos = add(p, { x: d.x * 1, y: 0, z: d.z * 1 });
                                    const placeBelow = add(placePos, { x: 0, y: -1, z: 0 });
                                    const placeBelowRead = this.read(placeBelow);
                                    // Need support for placed block or allow bridging
                                    if (!placeBelowRead?.hazard || !/lava/.test(placeBelowRead?.type ?? "")) {
                                        out.push({ ...landingPos, kind: "bridge_sprintjump3", gap: totalGap, placeAt: placePos, placeCount: 1 });
                                    }
                                } else if (totalGap === 5) {
                                    const placePos = add(p, { x: d.x * 2, y: 0, z: d.z * 2 });
                                    const placeBelow = add(placePos, { x: 0, y: -1, z: 0 });
                                    const placeBelowRead = this.read(placeBelow);
                                    if (!placeBelowRead?.hazard || !/lava/.test(placeBelowRead?.type ?? "")) {
                                        out.push({ ...landingPos, kind: "bridge_sprintjump3", gap: totalGap, placeAt: placePos, placeCount: 1 });
                                    }
                                } else if (totalGap === 6) {
                                    const placePos = add(p, { x: d.x * 2, y: 0, z: d.z * 2 });
                                    out.push({ ...landingPos, kind: "bridge_sprintjump3", gap: totalGap, placeAt: placePos, placeCount: 2 });
                                } else if (totalGap >= 7) {
                                    // For 7-8 blocks, need 2 intermediate blocks then 3-block jump
                                    const placePos1 = add(p, { x: d.x * 2, y: 0, z: d.z * 2 });
                                    const placePos2 = add(p, { x: d.x * 5, y: 0, z: d.z * 5 });
                                    // Only if not over lava for long gaps
                                    if (!hazardIsLava) {
                                        out.push({ ...landingPos, kind: "bridge_bridge_sprintjump3", gap: totalGap, placeAt: placePos1, placeAt2: placePos2, placeCount: 2 });
                                    }
                                }
                            } else if (landingAir && this.allowBridge && totalGap <= 6) {
                                // Even if landing is air, we can still bridge towards it - progressive bridging
                                // Add bridge candidate to continue building
                                const bridgePos = add(p, { x: d.x * 1, y: 0, z: d.z * 1 });
                                const belowBridge = add(bridgePos, { x: 0, y: -1, z: 0 });
                                const belowBridgeRead = this.read(belowBridge);
                                if (!belowBridgeRead?.hazard || (belowBridgeRead && !/lava/.test(belowBridgeRead.type ?? ""))) {
                                    out.push({ ...bridgePos, kind: "bridge", gap: totalGap });
                                }
                            }
                        }
                    }
                }

                // Jump up 1 + forward (parkour up)
                const upForward = add(add(p, { x: 0, y: 1, z: 0 }), d);
                if (this.safeStand(upForward) &&
                    this.air(add(p, { x: 0, y: 2, z: 0 })) &&
                    this.air(add(p, { x: 0, y: 3, z: 0 })) &&
                    this.air(add(upForward, { x: 0, y: 1, z: 0 }))) {
                    out.push({ ...upForward, kind: "jumpup" });
                }
            }

            // Pillar up: if need to go high (100 block tower), allow pillar up with build blocks
            if (this.allowBridge || this.options.allowPillar) {
                const up = add(p, { x: 0, y: 1, z: 0 });
                const up2 = add(p, { x: 0, y: 2, z: 0 });
                // If up is air and we have solid below, we can pillar
                if (this.air(up) && this.air(up2) && this.solid(add(p, { x: 0, y: -1, z: 0 }))) {
                    out.push({ ...up, kind: "pillar" });
                }
            }

            // Bridging: if gap with no support, allow if builder enabled (higher cost)
            if (this.allowBridge) {
                const belowQ = add(q, { x: 0, y: -1, z: 0 });
                const belowRead = this.read(belowQ);
                if (!belowRead?.support && this.air(q) && this.air(add(q, { x: 0, y: 1, z: 0 }))) {
                    // Need to bridge - mark as bridge candidate with high cost
                    // Only if not over hazard - allow water but not lava for single bridge
                    if (!belowRead?.hazard || (belowRead && /water/.test(belowRead.type ?? ""))) {
                        const landBeyond = add(q, d);
                        if (this.safeStand(landBeyond) || this.air(landBeyond)) {
                            out.push({ ...q, kind: "bridge" });
                        }
                    } else if (belowRead && /water/.test(belowRead.type ?? "")) {
                        // Water below - allow bridging over water (boat alternative)
                        out.push({ ...q, kind: "bridge" });
                    }
                }
            }
        }
        // UNBREAKABLE TOWER 100: allow up to 128 vertical for following high towers, 32 for normal
        const vertLimit = this.radius >= 100 ? 128 : (this.allowBridge ? 64 : 24);
        return out.filter((q) => horizontal(q, this.start) <= this.radius &&
            Math.abs(q.y - this.start.y) <= vertLimit);
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
        while (budget-- > 0 && this.open.size) {
            const n = this.open.pop();
            if (n.g !== this.costs.get(key(n.p))) continue;
            if (++this.expanded > this.maxNodes) return (this.status = "budget");
            const progress = this.allowPartial &&
                horizontal(n.p, this.start) >= 16 &&
                horizontal(n.p, this.goal) < horizontal(this.start, this.goal) - 6;
            if (progress ||
                (horizontal(n.p, this.goal) <= this.tolerance &&
                    Math.abs(n.p.y - this.goal.y) < 1.5)) {
                const path = [];
                let t = n;
                while (t?.parent) {
                    path.push(t.p);
                    t = t.parent;
                }
                this.path = path.reverse();
                return (this.status = progress ? "partial" : "found");
            }
            for (const q of this.neighbors(n.p)) {
                let cost = 1;
                if (q.kind === "jump") cost = 3.5;
                else if (q.kind === "sprintjump") cost = 5;
                else if (q.kind === "sprintjump3") cost = 7;
                else if (q.kind === "sprintjump_up") cost = 8;
                else if (q.kind === "bridge_sprintjump3") cost = 10; // place 1 block + 3-jump - advanced
                else if (q.kind === "bridge_bridge_sprintjump3") cost = 14; // place 2 + 3-jump - large gap
                else if (q.kind === "jumpup") cost = 3;
                else if (q.kind === "walk") cost = 1;
                else if (q.kind === "bridge") cost = 8;
                else if (q.kind === "pillar") cost = 6;
                else if (q.kind === "bigdrop") cost = 2.5;
                else cost = 1.5;
                const g = n.g + cost + this.penalty(q), k = key(q);
                if (g >= (this.costs.get(k) ?? Infinity)) continue;
                this.costs.set(k, g);
                this.open.push({ p: q, g, parent: n }, g + horizontal(q, this.goal) * 0.9 + Math.abs(q.y - this.goal.y) * 0.3);
            }
        }
        if (!this.open.size) this.status = "unreachable";
        return this.status;
    }
}
