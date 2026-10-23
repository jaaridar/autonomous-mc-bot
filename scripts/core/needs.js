/**
 * Survival needs — a general response engine instead of 80 named scenarios.
 *
 * Every survival situation reduces to the same question: which *need* is most
 * urgent right now, and what is the cheapest action that satisfies it? The
 * engine answers with arithmetic:
 *
 *   severity = how bad the value is (0..1), scaled by how fast it gets worse
 *
 * A need is only proposed when it can actually be satisfied with what the bot
 * has (food to eat, blocks to build, a tool to swing), so the returned action is
 * executable rather than aspirational. Hysteresis and per-action cooldowns stop
 * it flapping between "eat" and "fight" every tick — it reuses the tested
 * `brain/arbiter.js` selector for that.
 *
 * Pure: the runtime builds the context, this decides, the runtime executes.
 */
import { Arbiter } from "./brain/arbiter.js";

const clamp01 = (n) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

/**
 * Need definitions. `severity(ctx)` returns 0..1; `satisfy(ctx)` returns an
 * action name, or null when the bot cannot do anything about it (in which case
 * the need is not proposed at all — silence is better than a fake plan).
 */
const NEED_DEFS = [
    {
        id: "breathe",
        emergency: true,
        severity: (c) => (c.headInWater ? 0.85 + 0.15 * (1 - clamp01((c.air ?? 300) / 300)) : 0),
        satisfy: (c) => (c.headInWater ? "surface" : null),
        reason: (c) => `head under water (air ${Math.round(c.air ?? 0)})`,
    },
    {
        id: "lava",
        emergency: true,
        severity: (c) => (c.inLava ? 1 : c.nearLava ? 0.8 : 0),
        satisfy: (c) => {
            if (c.inLava) return c.canBuild ? "climb_out" : "run";
            return c.hasWater ? "cool_lava" : "run";
        },
        reason: () => "lava adjacent",
    },
    {
        id: "burning",
        emergency: true,
        severity: (c) => (c.onFire ? 0.65 + (c.inWater ? 0 : 0.15) : 0),
        satisfy: (c) => (c.hasWater ? "douse" : c.inWater ? "surface" : "run"),
        reason: () => "on fire",
    },
    {
        id: "falling",
        emergency: true,
        severity: (c) => (c.fallDistance > 2 ? clamp01((c.fallDistance - 2) / 20) * 0.9 : 0),
        satisfy: (c) => (c.hasWater ? "water_clutch" : c.canBuild ? "land_safe" : null),
        reason: (c) => `falling ${Math.round(c.fallDistance ?? 0)} blocks`,
    },
    {
        id: "suffocating",
        emergency: true,
        severity: (c) => (c.headBlocked ? 0.95 : 0),
        satisfy: (c) => (c.canDig ? "dig_out" : null),
        reason: () => "head inside a solid block",
    },
    {
        id: "combat",
        emergency: true,
        // The combat planner supplies `combatSeverity` (0..1) from the damage
        // race; when it is absent the need simply is not urgent.
        severity: (c) => clamp01(c.combatSeverity ?? 0),
        satisfy: (c) => (c.combatAction === "flee" || c.combatAction === "retreat" ? "disengage" : null),
        reason: (c) => c.combatReason ?? "losing the fight",
    },
    {
        id: "heal",
        severity: (c) => {
            const hpRatio = clamp01((c.hp ?? 20) / (c.maxHp ?? 20));
            const threatFactor = c.hostileCount > 0 ? 1.25 : 0.75;
            return hpRatio >= 0.75 ? 0 : clamp01((0.75 - hpRatio) / 0.75) * threatFactor;
        },
        satisfy: (c) => {
            if (c.hasFood && (c.hunger ?? 20) < 20) return "eat";
            if (c.safe && c.hostileCount === 0) return "rest";
            if (c.canBuild && c.hostileCount > 0) return "shelter";
            return null;
        },
        reason: (c) => `health ${Math.round(c.hp ?? 0)}/${Math.round(c.maxHp ?? 20)}`,
    },
    {
        id: "starving",
        severity: (c) => clamp01((14 - (c.hunger ?? 20)) / 14) * (c.hp < 10 ? 1.2 : 1),
        satisfy: (c) => (c.hasFood ? "eat" : c.preyNear ? "hunt" : c.hasFishingRod ? "fish" : null),
        reason: (c) => `hunger ${Math.round(c.hunger ?? 0)}`,
    },
    {
        id: "exposure",
        severity: (c) => {
            if (!c.night) return 0;
            const hostile = clamp01((c.hostileCount ?? 0) / 4);
            const open = c.sheltered ? 0 : 1;
            return open * (0.35 + 0.4 * hostile) * (c.nightProgress ?? 1);
        },
        satisfy: (c) => (c.shelterKnown ? "go_shelter" : c.canBuild ? "shelter" : null),
        reason: () => "night, exposed",
    },
    {
        id: "darkness",
        severity: (c) => (c.lightLevel !== undefined && c.lightLevel <= 3 && (c.night || c.underground) ? 0.3 : 0),
        satisfy: (c) => (c.hasTorch ? "light_area" : null),
        reason: () => "too dark to see spawns",
    },
    {
        id: "tooling",
        severity: (c) => (c.toolDurabilityLow ? 0.45 : 0),
        satisfy: (c) => (c.canCraft ? "rearm" : null),
        reason: () => "tool about to break",
    },
    {
        id: "unarmed",
        severity: (c) => (!c.hasWeapon && c.hostileCount > 0 ? 0.7 : 0),
        satisfy: (c) => (c.canCraft ? "rearm" : "disengage"),
        reason: () => "no weapon while hostiles are near",
    },
    {
        id: "inventory",
        severity: (c) => (c.freeSlots !== undefined && c.freeSlots <= 0 ? 0.35 : 0),
        satisfy: (c) => "dump_inventory",
        reason: () => "inventory full",
    },
    {
        id: "lost",
        severity: (c) => (c.stuckLevel >= 3 ? 0.5 : 0),
        satisfy: (c) => "unstick",
        reason: () => `no progress for ${Math.round(c.stuckLevel ?? 0)} levels`,
    },
];

/**
 * Every severity is clamped to 0..1 once, here, so a formula can be written
 * naturally ("starving hurts more when badly hurt") without risking an
 * out-of-range value reaching the selector.
 */
export const NEEDS = NEED_DEFS.map((need) => {
    const raw = need.severity;
    return { ...need, severity: (ctx) => clamp01(raw(ctx)) };
});

const MIN_SEVERITY = 0.30;

/** Rank all needs for a context. Exposed for tests and diagnostics. */
export function rankNeeds(ctx, behaviors = NEEDS) {
    const out = [];
    for (const need of behaviors) {
        let severity = 0;
        try { severity = clamp01(need.severity(ctx)); } catch { severity = 0; }
        if (severity < MIN_SEVERITY) continue;
        let action = null;
        try { action = need.satisfy(ctx); } catch { action = null; }
        if (!action) continue;
        let reason = need.id;
        try { reason = need.reason?.(ctx) ?? need.id; } catch { /* reason is cosmetic */ }
        out.push({ id: need.id, severity, action, reason, emergency: need.emergency === true });
    }
    out.sort((a, b) => b.severity - a.severity || (b.emergency - a.emergency));
    return out;
}

/**
 * Stateful selector: ranks needs, then applies hysteresis and cooldowns so the
 * bot commits to one response instead of oscillating between two.
 */
export class NeedsEngine {
    constructor({ margin = 12, hold = 20 } = {}) {
        this.arbiter = new Arbiter({ emergencyAt: 85, margin, defaultHold: hold });
        this.current = undefined;
        this.lastReason = "";
    }

    reset() {
        this.arbiter = new Arbiter({ emergencyAt: 85, margin: 12, defaultHold: 20 });
        this.current = undefined;
        this.lastReason = "";
    }

    /**
     * Returns `{id, action, severity, reason, ranked}` or undefined when nothing
     * needs doing. The caller must still execute the action.
     */
    assess(ctx, tick = 0) {
        const ranked = rankNeeds(ctx);
        if (!ranked.length) {
            this.current = undefined;
            return undefined;
        }
        const behaviors = ranked.map((r) => ({
            id: r.id,
            utility: () => r.severity * 100,
            emergency: r.emergency,
            minHold: r.emergency ? 6 : 20,
        }));
        const byId = new Map(ranked.map((r) => [r.id, r]));
        const pick = this.arbiter.select(behaviors, ctx, tick);
        if (!pick?.id) {
            this.current = undefined;
            return undefined;
        }
        const need = byId.get(pick.id);
        this.current = need;
        this.lastReason = `${need.id}: ${need.reason} (${need.severity.toFixed(2)})`;
        return { ...need, ranked, switched: pick.switched, arbiterReason: pick.reason };
    }

    noteProgress() {
        this.arbiter.done(this.current?.id);
        this.current = undefined;
    }

    noteFailure(tick = 0) {
        if (this.current) this.arbiter.failed(this.current.id, tick);
        this.current = undefined;
    }
}
