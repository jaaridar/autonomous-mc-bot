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

                // 2-block gap sprint jump
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
                    // Only if not over hazard
                    if (!belowRead?.hazard) {
                        const landBeyond = add(q, d);
                        if (this.safeStand(landBeyond) || this.air(landBeyond)) {
                            out.push({ ...q, kind: "bridge" });
                        }
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
                else if (q.kind === "jumpup") cost = 3;
                else if (q.kind === "walk") cost = 1;
                else if (q.kind === "bridge") cost = 8;
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
