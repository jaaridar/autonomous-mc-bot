export const ESCALATION = ["none", "replan", "change_area", "dig_out", "go_home", "safe_pause"];
const THRESHOLDS = [0, 600, 1200, 2400, 4800, 9000];
const CELL = 4;
const WINDOW = 1200;

export class StuckDetector {
    constructor() { this.reset(0); }
    reset(tick = 0) {
        this.lastProgress = tick;
        this.invSig = "";
        this.visited = new Map();
        this.recent = [];
        this.level = 0;
        this.emittedAt = -Infinity;
        this.emittedLevel = 0;
    }

    observe(o) {
        const tick = o.tick ?? 0, pos = o.pos ?? { x: 0, y: 0, z: 0 };
        const cell = `${Math.floor(pos.x / CELL)},${Math.floor(pos.y / CELL)},${Math.floor(pos.z / CELL)}`;
        let progress = false;

        if (o.invSig !== this.invSig) { this.invSig = o.invSig; progress = true; }
        const seen = this.visited.get(cell);
        if (seen === undefined || tick - seen > WINDOW) progress = progress || seen === undefined;
        this.visited.set(cell, tick);
        if (this.visited.size > 600) for (const [k, t] of this.visited) { if (tick - t > WINDOW) this.visited.delete(k); if (this.visited.size <= 400) break; }

        this.recent.push(cell);
        if (this.recent.length > 8) this.recent.shift();
        const r = this.recent, n = r.length;
        const oscillating = n >= 8 && r[n - 1] === r[n - 3] && r[n - 2] === r[n - 4] && r[n - 1] === r[n - 5] && r[n - 2] === r[n - 6] && r[n - 1] !== r[n - 2];

        if (progress) { this.lastProgress = tick; this.level = 0; }
        const idle = tick - this.lastProgress;
        let level = 0;
        for (let i = THRESHOLDS.length - 1; i >= 1; i--) if (idle >= THRESHOLDS[i]) { level = i; break; }
        if (oscillating) level = Math.max(level, 1);
        if ((o.failures ?? 0) >= 6) level = Math.max(level, 2);
        this.level = Math.max(this.level, level);
        if (!progress && this.level < level) this.level = level;

        return { level: this.level, action: ESCALATION[this.level], since: idle, oscillating };
    }

    due(tick) {
        if (this.level === 0) return false;
        if (this.emittedLevel !== this.level) { this.emittedLevel = this.level; this.emittedAt = tick; return true; }
        if (tick - this.emittedAt >= 600) { this.emittedAt = tick; return true; }
        return false;
    }
}
