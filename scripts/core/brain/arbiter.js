/**
 * Arbiter: picks WHICH behavior owns the bot this tick.
 *
 * The old design was a priority chain where whoever came first and returned true won every tick,
 * so behaviors that act every N ticks were constantly pre-empted by lower layers. Here:
 *  - every behavior reports a utility 0..100,
 *  - emergencies (utility >= emergencyAt) pre-empt immediately,
 *  - otherwise the current behavior is KEPT until it finishes, fails, drops to 0, has held for
 *    its minimum time and a challenger beats it by `margin` (hysteresis -> no thrashing),
 *  - a behavior that just failed is put on a short cooldown so it cannot be re-picked at once.
 */
export class Arbiter {
    constructor({ emergencyAt = 80, margin = 15, defaultHold = 40, failCooldown = 200 } = {}) {
        this.emergencyAt = emergencyAt;
        this.margin = margin;
        this.defaultHold = defaultHold;
        this.failCooldown = failCooldown;
        this.cur = null;            // { id, since }
        this.cool = new Map();      // id -> until tick
        this.switches = 0;
    }

    /** behaviors: [{ id, utility(ctx)->number, minHold?, emergency? }] */
    select(behaviors, ctx, tick = 0) {
        const scored = [];
        for (const b of behaviors) {
            let u = 0;
            try { u = Number(b.utility(ctx)); } catch { u = 0; }
            if (!Number.isFinite(u)) u = 0;
            u = Math.max(0, Math.min(100, u));
            if ((this.cool.get(b.id) ?? 0) > tick) u = 0;
            scored.push({ b, u });
        }
        scored.sort((x, y) => y.u - x.u);
        const top = scored[0];
        if (!top || top.u <= 0) { return this._set(null, tick, "nothing wants control"); }

        const cur = this.cur ? scored.find((s) => s.b.id === this.cur.id) : null;
        if (top.u >= this.emergencyAt && (!cur || top.b.id !== cur.b.id) && (!cur || top.u > cur.u)) {
            return this._set(top.b, tick, `emergency ${top.b.id} (${top.u.toFixed(0)})`);
        }
        if (cur && cur.u > 0) {
            const held = tick - this.cur.since, minHold = cur.b.minHold ?? this.defaultHold;
            if (held < minHold) return { id: cur.b.id, reason: "committed (min hold)", switched: false, utility: cur.u };
            if (top.b.id === cur.b.id || top.u < cur.u + this.margin) return { id: cur.b.id, reason: "kept (no clear winner)", switched: false, utility: cur.u };
        }
        return this._set(top.b, tick, `best utility ${top.b.id} (${top.u.toFixed(0)})`);
    }

    /** The running behavior finished normally. */
    done(id) { if (this.cur?.id === id) this.cur = null; }
    /** The running behavior failed: drop it and keep it from being re-picked immediately. */
    failed(id, tick = 0) {
        this.cool.set(id, tick + this.failCooldown);
        if (this.cur?.id === id) this.cur = null;
    }

    _set(b, tick, reason) {
        const id = b?.id ?? null;
        const switched = (this.cur?.id ?? null) !== id;
        if (switched) { this.switches++; this.cur = id ? { id, since: tick } : null; }
        return { id, reason, switched, utility: undefined };
    }
}
