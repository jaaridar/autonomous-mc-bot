/**
 * Engine-free rules for the bot's persistent memory: one small JSON document
 * that survives world reloads. Stored data is untrusted (a world can be
 * edited, upgraded or corrupted), so every read re-validates field by field
 * and failure degrades to "remember nothing" instead of throwing into the
 * tick loop. The runtime wrapper (scripts/runtime/memory.js) owns storage;
 * this module owns the rules, so it can be unit-tested without the game.
 */
export const VIEW = 1;
/** Bounded lists keep the stored document under a couple of kilobytes. */
export const CAPS = { spots: 96, itemKeys: 64 };
/**
 * Where the bot may record a marker. Only places it can verify before use are
 * listed; a stale marker is harmless because every consumer re-reads the
 * block before trusting it.
 */
export const SPOT_KINDS = new Set([
    "chest",
    "crafting_table",
    "furnace",
    "bed",
    "portal",
]);
const DIM = /^minecraft:[a-z_]+$/;
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
function position(raw) {
    const x = num(raw?.x), y = num(raw?.y), z = num(raw?.z);
    if (x === undefined || y === undefined || z === undefined)
        return undefined;
    const p = { x: Math.floor(x), y: Math.floor(y), z: Math.floor(z) };
    // Same envelope core/math.js uses for valid world positions.
    return Math.abs(p.x) < 29999900 &&
        Math.abs(p.z) < 29999900 &&
        p.y >= -64 &&
        p.y < 320
        ? p
        : undefined;
}
const dimension = (d) => (typeof d === "string" && DIM.test(d) ? d : "minecraft:overworld");
export function blank() {
    return { v: VIEW, prefs: undefined, home: undefined, death: undefined, spots: [] };
}
function spotFrom(raw) {
    if (!raw || typeof raw !== "object")
        return undefined;
    const p = position(raw);
    if (!p || !SPOT_KINDS.has(raw.kind))
        return undefined;
    return {
        kind: raw.kind,
        dim: dimension(raw.dim),
        x: p.x,
        y: p.y,
        z: p.z,
        t: num(raw.t) ?? 0,
    };
}
function homeFrom(raw) {
    if (!raw || typeof raw !== "object")
        return undefined;
    const p = position(raw);
    if (!p)
        return undefined;
    return { dim: dimension(raw.dim), x: p.x, y: p.y, z: p.z };
}
function deathFrom(raw) {
    if (!raw || typeof raw !== "object")
        return undefined;
    const p = position(raw);
    if (!p)
        return undefined;
    const items = {};
    if (raw.items && typeof raw.items === "object" && !Array.isArray(raw.items)) {
        for (const [type, count] of Object.entries(raw.items).slice(0, CAPS.itemKeys))
            if (typeof type === "string" && typeof count === "number" && Number.isFinite(count) && count > 0)
                items[type] = Math.floor(count);
    }
    return { dim: dimension(raw.dim), x: p.x, y: p.y, z: p.z, t: num(raw.t) ?? 0, items };
}
const BOOL_PREFS = [
    "assistedCrafting",
    "parkour",
    "defend",
    "fast",
    "hunting",
    "armor",
    "bridge",
    "boat",
    "deepMining",
    "camp",
    "pickup",
    "loot",
    "speedrun",
    "pathDig",
    "pathBridge",
    "crossDimension",
    "autoNether",
];
/** Whitelisted, type-checked operator preferences; unknown keys are dropped. */
export function sanitizePrefs(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
        return undefined;
    const out = {};
    for (const k of BOOL_PREFS)
        if (typeof raw[k] === "boolean")
            out[k] = raw[k];
    if (Number.isInteger(raw.range) && raw.range >= 32 && raw.range <= 4096)
        out.range = raw.range;
    return Object.keys(out).length ? out : undefined;
}
/** Validate an arbitrary parsed document into a usable store. Never throws. */
export function sanitize(raw) {
    const store = blank();
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
        return store;
    // A higher version means a newer writer; unknown fields are simply not
    // read, so the safe degradation is to use only what is understood.
    store.prefs = sanitizePrefs(raw.prefs);
    store.home = homeFrom(raw.home);
    store.death = deathFrom(raw.death);
    if (Array.isArray(raw.spots))
        for (const s of raw.spots.slice(0, CAPS.spots * 2)) {
            const spot = spotFrom(s);
            if (spot)
                store.spots.push(spot);
        }
    compact(store);
    return store;
}
export function fromJson(text) {
    if (typeof text !== "string" || !text)
        return blank();
    try {
        return sanitize(JSON.parse(text));
    }
    catch {
        return blank();
    }
}
/** Keep the newest entries when a list exceeds its cap. */
export function compact(store) {
    if (store.spots.length > CAPS.spots) {
        store.spots.sort((a, b) => b.t - a.t);
        store.spots.length = CAPS.spots;
    }
    return store;
}
export function toJson(store) {
    return JSON.stringify(compact(store));
}
const posKey = (dim, p) => `${dim}|${p.x},${p.y},${p.z}`;
/**
 * Record a marker. Returns true only when it is genuinely new information, so
 * the runtime layer can write to disk lazily instead of on every sighting.
 */
export function upsertSpot(store, spot) {
    const s = spotFrom(spot);
    if (!s)
        return false;
    const k = posKey(s.dim, s);
    if (store.spots.some((o) => o.kind === s.kind && posKey(o.dim, o) === k))
        return false;
    store.spots.push(s);
    compact(store);
    return true;
}
export function removeSpot(store, kind, dim, p) {
    const k = posKey(dimension(dim), p);
    const before = store.spots.length;
    store.spots = store.spots.filter((o) => !(o.kind === kind && posKey(o.dim, o) === k));
    return store.spots.length !== before;
}
export function spotsOf(store, kind, dim) {
    return store.spots.filter((o) => o.kind === kind && o.dim === dimension(dim));
}
/** Nearest recorded marker of a kind, or undefined. Callers verify before use. */
export function nearestSpot(store, kind, dim, p) {
    let best, bestD = Infinity;
    for (const o of store.spots) {
        if (o.kind !== kind || o.dim !== dimension(dim))
            continue;
        const d = Math.hypot(o.x - p.x, o.y - p.y, o.z - p.z);
        if (d < bestD) {
            bestD = d;
            best = o;
        }
    }
    return best;
}
export function setHome(store, p, dim) {
    const at = position(p);
    if (!at)
        throw Error("Invalid home position.");
    store.home = { dim: dimension(dim), ...at };
}
export function clearHome(store) {
    store.home = undefined;
}
export function setDeath(store, p, dim, tick, counts = {}) {
    const at = position(p);
    if (!at)
        return false;
    const items = {};
    for (const [type, count] of Object.entries(counts)
        .filter(([, n]) => typeof n === "number" && n > 0)
        .slice(0, CAPS.itemKeys))
        items[type] = Math.floor(count);
    store.death = { dim: dimension(dim), ...at, t: tick, items };
    return true;
}
export function clearDeath(store) {
    store.death = undefined;
}
export function summary(store) {
    const spots = {};
    for (const s of store.spots)
        spots[s.kind] = (spots[s.kind] ?? 0) + 1;
    return {
        home: store.home ?? null,
        death: store.death
            ? {
                position: { x: store.death.x, y: store.death.y, z: store.death.z },
                dim: store.death.dim,
                tick: store.death.t,
                droppedKinds: Object.keys(store.death.items).length,
            }
            : null,
        spots,
        spotsTotal: store.spots.length,
        prefs: store.prefs ? Object.keys(store.prefs) : [],
    };
}
