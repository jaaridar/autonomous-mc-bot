/**
 * Danger map: ONE shared, composable risk model instead of 80 scripted scenarios.
 *
 * "Ravine + zombie", "ledge + lava + sunset", "flooded cave + skeleton" are not separate cases:
 * they are cells whose risk is the SUM of independent factors (fall, lava, water, mobs, dark,
 * suffocation). Navigation, mining, building and fleeing all read this model, so a combination
 * nobody wrote a handler for is still handled.
 *
 * `world` interface (supplied by the runtime or a test):
 *   world.block(x, y, z) -> { solid:boolean, liquid:"water"|"lava"|null, passable:boolean } | null
 *   world.light?(x, y, z) -> 0..15
 * threats: [{ x, y, z, type?, damage?, reach?, ranged?, explosive? }]
 */
const NEIGHBORS6 = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0], [0, -1, 0]];
const MAX_FALL_SCAN = 24;

const cell = (world, x, y, z) => {
    try { return world.block(x, y, z) ?? { solid: false, liquid: null, passable: true, unknown: true }; }
    catch { return { solid: false, liquid: null, passable: true, unknown: true }; }
};

export function fallDepth(world, x, y, z, max = MAX_FALL_SCAN) {
    let d = 0;
    for (let i = 1; i <= max; i++) {
        const c = cell(world, x, y - i, z);
        if (c.solid || c.liquid) return d;
        d++;
    }
    return max;
}

export function fallDamage(depth, landsInWater = false) {
    if (landsInWater) return 0;
    return Math.max(0, depth - 3);
}

function landsInWater(world, x, y, z, depth) {
    const c = cell(world, x, y - depth - 1, z);
    return c.liquid === "water";
}

export function cellDanger(world, pos, threats = [], opts = {}) {
    const x = Math.floor(pos?.x), y = Math.floor(pos?.y), z = Math.floor(pos?.z);
    if (![x, y, z].every(Number.isFinite)) return { score: 1e6, parts: { unknown: 1e6 }, lethal: true };
    if (!Array.isArray(threats)) threats = [];
    const hp = Number.isFinite(opts.hp) ? opts.hp : 20;
    const parts = { fall: 0, lava: 0, water: 0, mobs: 0, dark: 0, suffocate: 0 };
    let lethal = false;

    const feet = cell(world, x, y, z), head = cell(world, x, y + 1, z);
    if (feet.liquid === "lava" || head.liquid === "lava") { parts.lava = 1000; lethal = true; }
    if (feet.solid && head.solid) { parts.suffocate = 60; }
    else if (head.solid) parts.suffocate = 25;
    if (feet.liquid === "water") parts.water = head.liquid === "water" ? 18 : 6;

    for (const [dx, dy, dz] of NEIGHBORS6) {
        const n = cell(world, x + dx, y + dy, z + dz);
        if (n.liquid === "lava") parts.lava += dy === -1 ? 30 : 40;
    }

    const depth = fallDepth(world, x, y, z);
    if (depth > 3) {
        const dmg = fallDamage(depth, landsInWater(world, x, y, z, depth));
        parts.fall = dmg * 6;
        if (dmg >= hp - 1) { parts.fall += 200; lethal = true; }
    }

    for (const t of threats) {
        if (!t || ![t.x, t.z].every(Number.isFinite)) continue;
        const dx = t.x - x, dy = (Number.isFinite(t.y) ? t.y : y) - y, dz = t.z - z;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const reach = (t.reach ?? (t.ranged ? 16 : 3)) + 2;
        if (d > reach) continue;
        const dmg = t.damage ?? (t.explosive ? 12 : t.ranged ? 3 : 4);
        parts.mobs += dmg * (1 - d / reach) * (t.ranged ? 4 : 5) + (t.explosive && d < 4 ? 25 : 0);
    }

    if (typeof world.light === "function") {
        let l = 15;
        try { l = world.light(x, y, z) ?? 15; } catch {}
        if (l < 7) parts.dark = (7 - l) * 1.5;
    }

    const score = Object.values(parts).reduce((a, b) => a + b, 0);
    return { score, parts, lethal };
}

/**
 * Memoising view of a `world`: each (x,y,z) is read once. Neighbouring cells
 * share ~90% of their reads (6 neighbours + a 24-deep fall column), so a
 * search that scores thousands of cells drops from ~30 reads per cell to ~1.
 */
export function cachedWorld(world) {
    if (world && world.__cached) return world;
    const cells = new Map();
    const view = {
        __cached: true,
        block(x, y, z) {
            const k = `${x},${y},${z}`;
            if (cells.has(k)) return cells.get(k);
            let v;
            try { v = world.block(x, y, z); } catch { v = null; }
            cells.set(k, v);
            return v;
        },
        size: () => cells.size,
    };
    if (typeof world?.light === "function") view.light = (x, y, z) => world.light(x, y, z);
    return view;
}

/**
 * Precomputed danger map for one planning pass: memoised cell reads plus
 * memoised per-cell results. Use `penalty(pos)` as an A* cost term instead
 * of calling pathPenalty() per expanded node.
 */
export function dangerMap(world, threats = [], opts = {}) {
    const w = cachedWorld(world);
    const results = new Map();
    const danger = (pos) => {
        const k = `${Math.floor(pos?.x)},${Math.floor(pos?.y)},${Math.floor(pos?.z)}`;
        let d = results.get(k);
        if (!d) { d = cellDanger(w, pos, threats, opts); results.set(k, d); }
        return d;
    };
    return {
        danger,
        penalty: (pos) => { const d = danger(pos); return d.lethal ? 1e6 : d.score; },
        reads: () => w.size(),
    };
}

export function pathPenalty(world, pos, threats = [], opts = {}) {
    const d = cellDanger(world, pos, threats, opts);
    return d.lethal ? 1e6 : d.score;
}

export function safestStep(world, pos, threats = [], opts = {}) {
    const p = { x: Math.floor(pos?.x), y: Math.floor(pos?.y), z: Math.floor(pos?.z) };
    const here = cellDanger(world, p, threats, opts);
    let best = { dir: [0, 0], danger: here, stay: true };
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const q = { x: p.x + dx, y: p.y, z: p.z + dz };
        const body = cell(world, q.x, q.y, q.z), head = cell(world, q.x, q.y + 1, q.z);
        if (!body.passable || !head.passable) continue;
        const d = cellDanger(world, q, threats, opts);
        if (d.lethal) continue;
        if (d.score < best.danger.score - 1e-9) best = { dir: [dx, dz], danger: d, stay: false };
    }
    return best;
}

export function assessHazards(state = {}) {
    const hz = [];
    const add = (kind, severity, detail = "") => { if (severity > 0) hz.push({ kind, severity: Math.min(1, Math.max(0, severity)), detail }); };
    const hp = Number.isFinite(state.hp) ? state.hp : 20, hunger = Number.isFinite(state.hunger) ? state.hunger : 20;
    const threats = Array.isArray(state.threats) ? state.threats : [];

    add("low_hp", hp <= 4 ? 1 : hp <= 8 ? 0.7 : hp <= 12 ? 0.35 : 0, `hp ${hp}`);
    add("starving", hunger <= 2 ? 0.9 : hunger <= 6 ? 0.6 : hunger <= 10 ? 0.25 : 0, `hunger ${hunger}`);
    add("drowning", state.headInWater ? 0.95 : state.inWater ? 0.4 : 0);
    add("lava", state.nearLava === "in" ? 1 : state.nearLava ? 0.8 : 0);
    const fd = state.fallDepthBelow ?? 0;
    add("fall", fd >= hp + 3 ? 1 : fd > 3 ? Math.min(0.9, (fd - 3) / Math.max(4, hp)) : 0, `drop ${fd}`);
    add("trapped", state.trapped ? 0.85 : 0);
    if (threats.length) {
        const dmg = threats.reduce((a, t) => a + (t.damage ?? (t.explosive ? 12 : 4)), 0);
        const near = Math.min(...threats.map((t) => t.dist ?? 99));
        const pressure = Math.min(1, (dmg / Math.max(6, hp)) * (near < 4 ? 1 : near < 8 ? 0.7 : 0.4));
        add("mobs", pressure, `${threats.length} hostile, nearest ${Number.isFinite(near) ? near.toFixed(0) : "?"}`);
    }
    add("night_exposed", state.nightExposed ? 0.55 : 0);
    add("no_light", state.light !== undefined && state.light < 4 ? 0.3 : 0);
    add("inventory_full", state.inventoryFull ? 0.3 : 0);
    if (state.hasEscapeKit === false) add("no_escape_kit", 0.25);
    return hz.sort((a, b) => b.severity - a.severity);
}
