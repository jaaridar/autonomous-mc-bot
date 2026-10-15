const sev = (ctx, kind) => (ctx.hazards ?? []).find((h) => h.kind === kind)?.severity ?? 0;

export const DRIVES = [
    { id: "escape_hazard",  emergency: true, minHold: 10,
      utility: (c) => 100 * Math.max(sev(c, "lava"), sev(c, "drowning"), sev(c, "fall"), sev(c, "trapped")) },
    { id: "survive_combat", emergency: true, minHold: 20,
      utility: (c) => { const m = sev(c, "mobs"); return m <= 0 ? 0 : 55 + 45 * Math.max(m, sev(c, "low_hp")); } },
    { id: "eat",            minHold: 30,
      utility: (c) => (c.hasFood ? 100 * sev(c, "starving") : 0) * (sev(c, "mobs") > 0.5 ? 0.4 : 1) },
    { id: "recover_health", minHold: 60,
      utility: (c) => sev(c, "mobs") > 0 ? 0 : 70 * sev(c, "low_hp") },
    { id: "get_shelter",    minHold: 120,
      utility: (c) => (c.night && !c.sheltered ? 50 + 30 * sev(c, "night_exposed") : 0) },
    { id: "manage_inventory", minHold: 40,
      utility: (c) => 60 * sev(c, "inventory_full") * (sev(c, "mobs") > 0 ? 0 : 1) },
    { id: "restock_escape_kit", minHold: 60,
      utility: (c) => c.hasEscapeKit === false && sev(c, "mobs") === 0 ? 35 : 0 },
    { id: "unstick",        minHold: 80,
      utility: (c) => (c.stuckLevel ?? 0) >= 2 ? 45 + 8 * Math.min(4, c.stuckLevel) : 0 },
    { id: "pursue_goal",    minHold: 20,
      utility: (c) => (c.goalAvailable === false ? 0 : 30) },
];

export function computeUtilities(ctx) {
    const out = {};
    for (const d of DRIVES) { let u = 0; try { u = d.utility(ctx); } catch { u = 0; } out[d.id] = Number.isFinite(u) ? u : 0; }
    return out;
}
