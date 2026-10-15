import { add, key, horizontal, CARDINAL } from "./math.js";
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
    constructor() {
        this.a = [];
    }
    get size() {
        return this.a.length;
    }
    push(v, f) {
        const a = this.a;
        a.push({ v, f });
        let i = a.length - 1;
        while (i) {
            const p = (i - 1) >> 1;
            if (a[p].f <= f)
                break;
            [a[p], a[i]] = [a[i], a[p]];
            i = p;
        }
    }
    pop() {
        const a = this.a;
        if (!a.length)
            return;
        const v = a[0].v, tail = a.pop();
        if (a.length) {
            a[0] = tail;
            let i = 0;
            while (true) {
                let c = i * 2 + 1;
                if (c >= a.length)
                    break;
                if (c + 1 < a.length && a[c + 1].f < a[c].f)
                    c++;
                if (a[i].f <= a[c].f)
                    break;
                [a[i], a[c]] = [a[c], a[i]];
                i = c;
            }
        }
        return v;
    }
}
/** Incremental A*: no native unbounded pathfinder, unknown chunks are obstacles. */
export class PathSearch {
    constructor(read, start, goal, tolerance = 0.7, parkour = false, maxNodes = 1400, radius = 24, allowPartial = false, avoid = []) {
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
        const n = { p: { ...start, kind: "walk" }, g: 0 };
        this.open.push(n, 0);
        this.costs.set(key(start), 0);
    }
    air(p) {
        const c = this.read(p);
        return !!c?.passable && !c.hazard;
    }
    neighbors(p) {
        const out = [];
        for (const d of CARDINAL) {
            const q = add(p, d);
            if (standable(this.read, q))
                out.push({ ...q, kind: "walk" });
            else if (standable(this.read, add(q, { x: 0, y: 1, z: 0 })) &&
                this.air(add(p, { x: 0, y: 2, z: 0 })))
                out.push({ ...q, y: q.y + 1, kind: "step" });
            else if (this.air(q) &&
                this.air(add(q, { x: 0, y: 1, z: 0 })) &&
                standable(this.read, add(q, { x: 0, y: -1, z: 0 })))
                out.push({ ...q, y: q.y - 1, kind: "drop" });
            if (this.parkour) {
                const land = add(q, d), under = this.read(add(q, { x: 0, y: -1, z: 0 }));
                // Experimental one-block gap only; no jump across known lava or unknown terrain.
                if (!standable(this.read, q) &&
                    under &&
                    !under.hazard &&
                    this.air(q) &&
                    this.air(add(q, { x: 0, y: 1, z: 0 })) &&
                    this.air(add(q, { x: 0, y: 2, z: 0 })) &&
                    this.air(add(p, { x: 0, y: 2, z: 0 })) &&
                    this.air(add(land, { x: 0, y: 2, z: 0 })) &&
                    standable(this.read, land))
                    out.push({ ...land, kind: "jump" });
            }
        }
        return out.filter((q) => horizontal(q, this.start) <= this.radius &&
            Math.abs(q.y - this.start.y) <= 8);
    }
    /** Extra cost for entering a cell near a known threat, so flee routes curve away. */
    penalty(p) {
        if (!this.avoid.length)
            return 0;
        let cost = 0;
        for (let i = 0; i < this.avoid.length; i++) {
            const a = this.avoid[i];
            const dx = p.x - a.x, dz = p.z - a.z;
            const d2 = dx * dx + dz * dz;
            if (d2 < this.avoidRadii[i])
                cost += (this.avoidRadii[i] - d2) * 0.5;
        }
        return cost;
    }
    step(budget = 35) {
        if (this.status !== "searching")
            return this.status;
        while (budget-- > 0 && this.open.size) {
            const n = this.open.pop();
            if (n.g !== this.costs.get(key(n.p)))
                continue;
            if (++this.expanded > this.maxNodes)
                return (this.status = "budget");
            const progress = this.allowPartial &&
                horizontal(n.p, this.start) >= 16 &&
                horizontal(n.p, this.goal) < horizontal(this.start, this.goal) - 6;
            if (progress ||
                (horizontal(n.p, this.goal) <= this.tolerance &&
                    Math.abs(n.p.y - this.goal.y) < 1.1)) {
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
                const g = n.g +
                    (q.kind === "jump" ? 3.5 : q.kind === "walk" ? 1 : 1.5) +
                    this.penalty(q), k = key(q);
                if (g >= (this.costs.get(k) ?? Infinity))
                    continue;
                this.costs.set(k, g);
                this.open.push({ p: q, g, parent: n }, g + horizontal(q, this.goal));
            }
        }
        if (!this.open.size)
            this.status = "unreachable";
        return this.status;
    }
}
