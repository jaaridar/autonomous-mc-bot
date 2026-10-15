import { add, floor, key, distance } from "../core/math.js";
/** Bounded frontier wandering. Does not pretend to know structures in unloaded chunks. */
export class Explorer {
    constructor() {
        this.visits = new Map();
        this.blocked = new Map();
        this.since = 0;
        this.turns = 0;
        this.trips = 0;
    }
    reset() {
        this.goal = undefined;
    }
    step(position, home, tick, terrain, nav, range = 256) {
        if (this.goal && distance(this.goal, home) > range) {
            nav.reset();
            this.goal = undefined;
        }
        if (this.goal) {
            const result = nav.go(this.goal, tick);
            if (result === "running" && tick - this.since < 500)
                return "running";
            const k = key(this.goal);
            this.visits.set(k, (this.visits.get(k) ?? 0) + 1);
            if (result !== "done")
                this.blocked.set(k, tick + 1200);
            this.goal = undefined;
            this.trips++;
            nav.reset();
            return "arrived";
        }
        const origin = floor(position), options = [];
        this.turns++;
        for (let dir = 0; dir < 8; dir++)
            for (const radius of [12, 20]) {
                const angle = (dir * Math.PI) / 4;
                const x = Math.round(Math.cos(angle) * radius), z = Math.round(Math.sin(angle) * radius);
                for (const y of [0, 1, -1, 2, -2, 3, -3, 4, -4]) {
                    const p = add(origin, { x, y, z });
                    if (distance(p, home) > range ||
                        (this.blocked.get(key(p)) ?? 0) > tick ||
                        !terrain.safe(p))
                        continue;
                    let penalty = 0;
                    for (const [visited, n] of this.visits) {
                        const [vx, vy, vz] = visited.split(",").map(Number);
                        if (distance(p, { x: vx, y: vy, z: vz }) < 12)
                            penalty += n * 20;
                    }
                    options.push({
                        p,
                        score: penalty +
                            Math.abs(y) * 2 +
                            Math.abs(dir - (this.turns % 8)) * 0.35 +
                            16 -
                            radius,
                    });
                    break;
                }
            }
        options.sort((a, b) => a.score - b.score);
        if (!options.length)
            return "blocked";
        this.goal = options[0].p;
        this.since = tick;
        if (this.visits.size > 96)
            this.visits.delete(this.visits.keys().next().value);
        if (this.blocked.size > 96)
            this.blocked.delete(this.blocked.keys().next().value);
        return "running";
    }
}
