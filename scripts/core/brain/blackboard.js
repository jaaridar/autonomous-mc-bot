/**
 * Blackboard: the bot's short- and medium-term memory of what it TRIED and how that went.
 * This is the piece that turns "retry forever" into "try something else":
 *  - method stats (success/fail streaks) rank alternatives,
 *  - bans with escalating cooldowns stop failing approaches from being re-picked,
 *  - facts hold transient knowledge ("no trees within 64 blocks of here").
 * Pure, bounded, JSON-serialisable.
 */
const MAX_STATS = 400, MAX_BANS = 300, MAX_FACTS = 200;
// Failures that depend on WHERE the bot is. They ban the method for a while but are forgotten the
// moment the bot relocates, because a new place is a new situation.
export const SITUATIONAL = new Set(["no_target", "no_path"]);
const BASE_BAN_TICKS = 1200;      // 1 minute at 20 tps
const MAX_BAN_TICKS = 24000;      // 20 minutes

export class Blackboard {
    constructor() {
        this.stats = new Map();   // "goal/method" -> {ok, fail, streak, lastReason, lastTick}
        this.bans = new Map();    // key -> {until, why}
        this.facts = new Map();   // key -> {value, until}
    }

    static key(goalId, methodId) { return `${goalId}/${methodId}`; }

    ban(key, tick, ttl, why = "") {
        const t = Math.max(1, Math.min(MAX_BAN_TICKS, Math.floor(ttl) || BASE_BAN_TICKS));
        this.bans.set(key, { until: (tick ?? 0) + t, why });
        this._trim(this.bans, MAX_BANS);
    }
    banned(key, tick) {
        const b = this.bans.get(key);
        if (!b) return false;
        if ((tick ?? 0) >= b.until) { this.bans.delete(key); return false; }
        return true;
    }
    banReason(key) { return this.bans.get(key)?.why ?? ""; }

    /** Record an outcome. Failures escalate the cooldown: 1m, 2m, 4m … capped at 20m. */
    note(goalId, methodId, ok, tick, reason = "") {
        const k = Blackboard.key(goalId, methodId);
        const s = this.stats.get(k) ?? { ok: 0, fail: 0, sit: 0, streak: 0, lastReason: "", lastTick: 0 };
        s.lastTick = tick ?? 0;
        if (ok) { s.ok++; s.streak = 0; s.sit = 0; this.bans.delete(k); }
        else {
            if (SITUATIONAL.has(reason)) s.sit++; else s.fail++;   // only chronic failures demote the method for good
            s.streak++; s.lastReason = reason;
            this.ban(k, tick, BASE_BAN_TICKS * 2 ** (Math.min(s.streak, 10) - 1), reason);
        }
        this.stats.set(k, s);
        this._trim(this.stats, MAX_STATS);
        return s;
    }

    /** The bot moved somewhere new: drop bans/streaks that only made sense at the old place. */
    forgetSituational() {
        for (const [k, b] of [...this.bans]) if (SITUATIONAL.has(b.why)) this.bans.delete(k);
        for (const s of this.stats.values()) if (SITUATIONAL.has(s.lastReason)) { s.streak = 0; s.sit = 0; }
    }

    /** Laplace-smoothed success rate: unknown methods score 0.5, so they still get tried. */
    score(goalId, methodId) {
        const s = this.stats.get(Blackboard.key(goalId, methodId));
        return s ? (s.ok + 1) / (s.ok + s.fail + 2) : 0.5;
    }

    /**
     * Pick the best non-banned method. Declared order is the prior (earlier = preferred);
     * observed success rate re-ranks only when there is evidence, so a method that keeps
     * failing sinks below untried alternatives.
     */
    rank(goalId, methods, tick) {
        return methods
            .map((m, i) => ({ m, i, banned: this.banned(Blackboard.key(goalId, m.id), tick), sc: this.score(goalId, m.id) }))
            .filter((x) => !x.banned)
            .sort((a, b) => (b.sc - a.sc) || (a.i - b.i))
            .map((x) => x.m);
    }

    setFact(key, value, tick, ttl = Infinity) {
        this.facts.set(key, { value, until: ttl === Infinity ? Infinity : (tick ?? 0) + ttl });
        this._trim(this.facts, MAX_FACTS);
    }
    fact(key, tick) {
        const f = this.facts.get(key);
        if (!f) return undefined;
        if ((tick ?? 0) >= f.until) { this.facts.delete(key); return undefined; }
        return f.value;
    }

    /** Human/log-friendly summary of recent failures (for "why am I stuck" reports). */
    explain(tick) {
        const out = [];
        for (const [k, s] of this.stats) if (s.streak > 0) out.push({ method: k, streak: s.streak, reason: s.lastReason, banned: this.banned(k, tick) });
        return out.sort((a, b) => b.streak - a.streak).slice(0, 8);
    }

    toJSON() {
        return {
            stats: [...this.stats].slice(-MAX_STATS),
            facts: [...this.facts].filter(([, f]) => f.until === Infinity).slice(-MAX_FACTS),
        };
    }
    static fromJSON(raw) {
        const bb = new Blackboard();
        try {
            for (const [k, s] of raw?.stats ?? [])
                if (typeof k === "string" && s && Number.isFinite(s.ok) && Number.isFinite(s.fail))
                    bb.stats.set(k.slice(0, 120), { ok: s.ok | 0, fail: s.fail | 0, sit: 0, streak: 0, lastReason: String(s.lastReason ?? "").slice(0, 60), lastTick: 0 });
            for (const [k, f] of raw?.facts ?? [])
                if (typeof k === "string") bb.facts.set(k.slice(0, 120), { value: f?.value, until: Infinity });
        } catch { /* corrupt save: start fresh */ }
        return bb;
    }

    _trim(map, max) { while (map.size > max) map.delete(map.keys().next().value); }
}
