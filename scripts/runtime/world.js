import { CARDINAL, COMPASS, DOWN, UP, add, distance, floor, key } from "../core/math.js";
import { standable } from "../core/navigation.js";
import { EXPLOSIVE, HAZARDS, HOSTILES, RANGED, threatRank } from "../core/world.js";
const THREAT_RADIUS = 18;
const NEAR6 = [UP, DOWN, ...CARDINAL];
const TABLE_OFFSETS = [];
for (let x = -3; x <= 3; x++) for (let z = -3; z <= 3; z++) for (let y = -1; y <= 1; y++) TABLE_OFFSETS.push({ x, y, z });
TABLE_OFFSETS.sort((a, b) => (a.x * a.x + a.y * a.y + a.z * a.z) - (b.x * b.x + b.y * b.y + b.z * b.z));

// Walk-through blocks: no collision - keep narrow, anchored where needed to avoid substring traps like stairs containing \"air\"
const WALKABLE = /(short_grass|tallgrass|tall_grass|fern|large_fern|deadbush|dead_bush|yellow_flower|red_flower|dandelion|poppy|blue_orchid|allium|azure_bluet|_tulip$|oxeye_daisy|sunflower|lilac|rose_bush|peony|cornflower|lily_of_the_valley|_rose$|eyeblossom|torchflower|_mushroom$|sapling|^minecraft:bush$|crimson_roots|warped_roots|nether_sprouts|_carpet$|lily_pad|torch|redstone_wire|tripwire$|_button$|_plate$|_rail$|^minecraft:rail$|^minecraft:wheat$|^minecraft:carrots$|^minecraft:potatoes$|^minecraft:beetroots$|melon_stem$|pumpkin_stem$|sugar_cane|_vine|^minecraft:vine$|glow_lichen|sculk_vein|hanging_roots|snow_layer|pink_petals|wildflowers|leaf_litter|^minecraft:air$|^minecraft:cave_air$|^minecraft:void_air$)/;

const AIR = new Set(["minecraft:air", "minecraft:cave_air", "minecraft:void_air"]);
const LIQUID_HINT = /water|lava|bubble/;
const TABLE = "minecraft:crafting_table";
/** Snapshot TTLs (ticks). Open cells expire sooner so newly placed blocks show up fast. */
const SOLID_TTL = 40, OPEN_TTL = 20, MISSING_TTL = 2, HANDLE_TTL = 40;
const CACHE_CAP = 18000, HANDLE_CAP = 6000;

/**
 * Cheap, cached view of a block. Only `typeId` is read eagerly (one native
 * property read); `isSolid` / `isLiquid` are read lazily the first time a
 * caller needs them, and never at all for air. Previously every fresh read
 * paid for four native property reads even when only the type was used.
 */
class Cell {
    constructor(b) {
        this.b = b;
        this.type = b.typeId;
        this.isAir = AIR.has(this.type);
        this.passable = this.isAir || WALKABLE.test(this.type);
        this._liquid = undefined;
        this._solid = undefined;
    }
    get isLiquid() {
        if (this._liquid === undefined) {
            if (this.isAir || !LIQUID_HINT.test(this.type)) this._liquid = false;
            else { try { this._liquid = !!this.b.isLiquid; } catch { this._liquid = false; } }
        }
        return this._liquid;
    }
    get isSolid() {
        if (this._solid === undefined) {
            if (this.isAir) this._solid = false;
            else { try { this._solid = !!this.b.isSolid; } catch { this._solid = false; } }
        }
        return this._solid;
    }
    get support() { return this.isSolid; }
    get hazard() { return HAZARDS.has(this.type) || this.isLiquid; }
}

/** Precomputed nearest-first sphere offsets per radius (scanOres used to build and sort ~2000 points per call). */
const SPHERE_CACHE = new Map();
function sphereOffsets(radius) {
    let out = SPHERE_CACHE.get(radius);
    if (out) return out;
    out = [];
    const r2 = radius * radius;
    for (let x = -radius; x <= radius; x++)
        for (let z = -radius; z <= radius; z++)
            for (let y = -radius; y <= radius; y++) {
                const d2 = x * x + y * y + z * z;
                if (d2 <= r2) out.push({ x, y, z, d2 });
            }
    out.sort((a, b) => a.d2 - b.d2);
    SPHERE_CACHE.set(radius, out);
    return out;
}

function prune(map, cap, n) {
    if (map.size <= cap) return;
    for (const k of map.keys()) {
        map.delete(k);
        if (--n <= 0) break;
    }
}

export class Terrain {
    begin(tick) {
        this.tick = tick;
        this.reads = 0;
        this.hits = 0;
        prune(this.cache, CACHE_CAP, 2500);
        prune(this.handles, HANDLE_CAP, 1500);
        if (this.memo.size > 512) this.memo.clear();
    }
    /** Current game tick: the bot installs a live clock; offline tests fall back to begin(). */
    now() {
        const t = this.clock ? this.clock() : this.tick;
        return typeof t === "number" && Number.isFinite(t) ? t : this.tick;
    }
    freshSafe(p) {
        const b = floor(p);
        this.cache.delete(key({ x: b.x, y: b.y - 1, z: b.z }));
        this.cache.delete(key(b));
        this.cache.delete(key({ x: b.x, y: b.y + 1, z: b.z }));
        return this.safe(b);
    }
    invalidate(p) {
        const k = key(floor(p));
        this.cache.delete(k);
        this.handles.delete(k);
        this.memo.clear();
    }
    constructor(dimension) {
        this.dimension = dimension;
        this.cache = new Map();   // key -> { value: Cell|undefined, expires }
        this.handles = new Map(); // key -> { b: Block, expires } (Block handles read live state)
        this.memo = new Map();    // small derived-query cache (tableNear, waterNear...)
        this.clock = undefined;
        this.tick = 0;
        this.reads = 0;
        this.hits = 0;
        this.nativeReads = 0;
        this._threat = undefined;
        this.read = (p) => {
            const k = key(p);
            const cached = this.cache.get(k);
            if (cached && cached.expires > this.tick) {
                this.hits++;
                return cached.value;
            }
            this.reads++;
            const b = this.block(p);
            let result;
            try { if (b) result = new Cell(b); } catch { result = undefined; }
            this.cache.set(k, { value: result, expires: this.tick + (result ? (result.passable ? OPEN_TTL : SOLID_TTL) : MISSING_TTL) });
            return result;
        };
    }
    clear() { this.cache.clear(); this.handles.clear(); this.memo.clear(); }
    /**
     * Block handle with a short-lived handle cache. A Block handle reads the
     * world live, so reusing it for a couple of seconds never returns stale
     * state but saves the native getBlock() call (the old cache was keyed so
     * read() overwrote it and nearly every block() call hit the engine).
     */
    /**
     * Throw-proof Block access. Native Block handles keep throwing
     * LocationInUnloadedChunkError long after getBlock() succeeded, whenever
     * the chunk unloads between the handle read and the consumer's property
     * access (that throw used to escape into the bot's task loops and park the
     * whole autonomy on "Task needs attention"). Every property read goes
     * through this guarded snapshot: on a failed read the cell is evicted and
     * the property falls back conservatively - an unreadable block behaves as
     * an impassable solid obstacle instead of throwing.
     */
    safeBlock(b, p, k) {
        const self = this;
        const dead = {};
        const evict = () => {
            if (k !== undefined) { self.handles.delete(k); self.cache.delete(k); }
        };
        const g = (prop, fallback) => {
            if (dead[prop]) return fallback;
            try { return b[prop]; }
            catch { dead[prop] = true; evict(); return fallback; }
        };
        return {
            get $raw() { return b; },
            get location() { return { x: p.x, y: p.y, z: p.z }; },
            get typeId() { return g("typeId", "minecraft:unloaded"); },
            get isAir() { return g("isAir", false); },
            get isSolid() { return g("isSolid", true); },
            get isLiquid() { return g("isLiquid", false); },
            get isWaterlogged() { return g("isWaterlogged", false); },
        };
    }
    block(p) {
        const fp = floor(p);
        const k = key(fp);
        try {
            const h = this.handles.get(k);
            if (h && h.expires > this.tick) return h.b;
            this.nativeReads++;
            const b = this.dimension.getBlock(fp);
            if (!b) { this.handles.delete(k); return undefined; }
            const s = this.safeBlock(b, fp, k);
            this.handles.set(k, { b: s, expires: this.tick + HANDLE_TTL });
            return s;
        } catch {
            this.handles.delete(k);
            this.cache.delete(k);
            return undefined;
        }
    }
    /** Raw native Block for engine pass-through calls (interactWithBlock and friends). */
    handle(p) {
        try { return this.dimension.getBlock(floor(p)); } catch { return undefined; }
    }
    /** Cached type id (no native call when the cell was read recently). */
    typeAt(p) { return this.read(floor(p))?.type; }
    // Uncached direct read for when you need fresh
    blockUncached(p) {
        try { return this.dimension.getBlock(floor(p)); } catch { return undefined; }
    }
    solid(p) { try { const b = this.block(p); return !!b && b.isSolid; } catch { return false; } }
    empty(p) { try { const b = this.block(p); return !b || b.isAir; } catch { return true; } }
    liquid(p) { try { const b = this.block(p); return !!b && b.isLiquid; } catch { return false; } }
    // Environment predicates read the cached Cell snapshot: no native call on a
    // cache hit. They used to fetch a live Block and read 2-3 native properties
    // per neighbour on every call (waterNear = 7 getBlock + 14 property reads).
    dangerous(p) { const c = this.read(floor(p)); return !!c && c.hazard; }
    waterAt(p) { const c = this.read(floor(p)); return !!c && c.type.includes("water") && c.isLiquid; }
    lavaAt(p) { const c = this.read(floor(p)); return !!c && c.type.includes("lava"); }
    lavaNear(p) {
        const b = floor(p);
        if (this.lavaAt(b)) return true;
        for (const d of NEAR6) if (this.lavaAt({ x: b.x + d.x, y: b.y + d.y, z: b.z + d.z })) return true;
        return false;
    }
    waterNear(p) {
        const b = floor(p);
        const k = "w" + key(b);
        const m = this.memo.get(k);
        if (m && m.expires > this.tick) return m.value;
        let value = this.waterAt(b);
        if (!value) for (const d of NEAR6) if (this.waterAt({ x: b.x + d.x, y: b.y + d.y, z: b.z + d.z })) { value = true; break; }
        this.memo.set(k, { value, expires: this.tick + 10 });
        return value;
    }
    headInWater(entity) {
        // Drowning check stays live (Block handle, no snapshot staleness).
        const b = this.block(floor(entity.getHeadLocation()));
        return !!b && b.isLiquid && /water/.test(b.typeId);
    }

    shoreNear(location, radius = 64) {
        const p = floor(location);
        let best, bestD = Infinity;
        const DIRS = [
            { x: 1, z: 0 }, { x: -1, z: 0 }, { x: 0, z: 1 }, { x: 0, z: -1 },
            { x: 1, z: 1 }, { x: 1, z: -1 }, { x: -1, z: 1 }, { x: -1, z: -1 }
        ];
        for (const n of [1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64]) {
            if (n > radius) break;
            for (const d of DIRS) {
                const targetX = Math.round(p.x + d.x * n);
                const targetZ = Math.round(p.z + d.z * n);
                const q = this.groundNear(targetX, targetZ, p.y, 4);
                if (!q || this.dangerous(q) || q.y < p.y - 1 || this.waterAt(q) || this.waterAt(add(q, UP))) continue;
                const dd = distance(q, location);
                if (dd < bestD) { bestD = dd; best = q; }
            }
            if (best) break;
        }
        return best ? { cell: best, distance: bestD } : undefined;
    }

    /**
     * Enhanced store scan: chests, barrels, trapped chests, shulker, ender chest
     */
    storeNear(location, radius = 14, tick = 0) {
        const base = floor(location);
        const parity = Math.floor(tick / 40) % 2;
        const found = [];
        for (let dx = -radius + parity; dx <= radius; dx += 2)
            for (let dz = -radius + parity; dz <= radius; dz += 2) {
                if (dx * dx + dz * dz > radius * radius) continue;
                for (let dy = -4; dy <= 4; dy++) {
                    const p = add(base, { x: dx, y: dy, z: dz });
                    try {
                        const b = this.block(p);
                        if (b && (b.typeId === "minecraft:chest" || b.typeId === "minecraft:trapped_chest" || b.typeId === "minecraft:barrel" || b.typeId.includes("shulker_box") || b.typeId === "minecraft:ender_chest"))
                            found.push({ ...p });
                    } catch {}
                }
            }
        return found.sort((a, b) => distance(a, base) - distance(b, base));
    }

    /**
     * Find obstructing blocks between bot and target.
     * Returns list of cells that block LOS or movement.
     */
    findObstructions(from, to) {
        const obstruct = [];
        const fromFloor = floor(from);
        const toFloor = floor(to);
        // Simple ray check: step along line
        const steps = Math.max(Math.abs(toFloor.x - fromFloor.x), Math.abs(toFloor.y - fromFloor.y), Math.abs(toFloor.z - fromFloor.z), 1);
        for (let i = 1; i < steps; i++) {
            const t = i / steps;
            const p = {
                x: Math.floor(fromFloor.x + (toFloor.x - fromFloor.x) * t),
                y: Math.floor(fromFloor.y + (toFloor.y - fromFloor.y) * t),
                z: Math.floor(fromFloor.z + (toFloor.z - fromFloor.z) * t),
            };
            try {
                const b = this.block(p);
                if (b && !b.isAir && !WALKABLE.test(b.typeId)) {
                    obstruct.push(p);
                }
            } catch {}
        }
        return obstruct;
    }

    /**
     * For mining below: what blocks are in the way? - ROBUST: also checks block front of head which gets in between when going down
     */
    obstructionsBelow(botPos, targetPos) {
        const obstruct = [];
        const bp = floor(botPos);
        if (targetPos.x === bp.x && targetPos.z === bp.z && targetPos.y < bp.y) {
            for (let y = bp.y - 1; y > targetPos.y; y--) {
                const cell = { x: bp.x, y, z: bp.z };
                try {
                    const b = this.block(cell);
                    if (b && !b.isAir && !WALKABLE.test(b.typeId)) {
                        obstruct.push(cell);
                    }
                } catch {}
            }
            // Head-front side cells are deliberately NOT listed here: when mining
            // straight down they are just the shaft walls, and listing them made
            // the clear phase dig sideways forever. breakThrough() clears a real
            // swing blocker only after a dig actually fails.
        }
        return obstruct;
    }

    /**
     * Find block directly in front of head that obstructs mining down - specific fix for user report
     */
    headFrontObstruction(botPos, dir = null) {
        const bp = floor(botPos);
        const dirs = dir && (dir.x !== 0 || dir.z !== 0)
            ? [dir, ...[{x:1,y:0,z:0},{x:-1,y:0,z:0},{x:0,y:0,z:1},{x:0,y:0,z:-1}].filter(d => d.x !== dir.x || d.z !== dir.z)]
            : [{x:1,y:0,z:0},{x:-1,y:0,z:0},{x:0,y:0,z:1},{x:0,y:0,z:-1}];
        for (const d of dirs) {
            for (const dy of [1, 0]) {
                const p = { x: bp.x + d.x, y: bp.y + dy, z: bp.z + d.z };
                try {
                    const b = this.block(p);
                    if (b && !b.isAir && b.isSolid && !WALKABLE.test(b.typeId) && !b.isLiquid) {
                        return p;
                    }
                } catch {}
            }
        }
        return null;
    }

    /**
     * Is a cell safe to mine? Enhanced with falling block and fluid checks,
     * plus check for blocks above that would fall.
     */
    safeToMineEx(p, checkAbove = true) {
        try {
            const self = floor(p);
            const around = [...CARDINAL, { x: 0, y: 1, z: 0 }, { x: 0, y: -1, z: 0 }];
            for (const d of around) {
                const b = this.block(add(self, d));
                if (!b) return false;
                if (b.isLiquid) return false;
                if (/^(minecraft:)(sand|red_sand|gravel|suspicious_sand|suspicious_gravel)$/.test(b.typeId)) {
                    // Falling block adjacent - risky but not fatal if above is not falling
                    if (d.y === 1 && checkAbove) {
                        // Block above is falling - would fall on bot
                        return false;
                    }
                }
            }
            // Check higher column for falling blocks (up to 5 blocks above target)
            if (checkAbove) {
                for (let dy = 1; dy <= 5; dy++) {
                    const above = this.block({ x: self.x, y: self.y + dy, z: self.z });
                    if (!above || above.isAir) break;
                    if (/^(minecraft:)(sand|red_sand|gravel|suspicious_sand|suspicious_gravel)$/.test(above.typeId)) {
                        return false;
                    }
                }
            }
            // Check lava/water near
            if (this.lavaNear(self) || this.waterNear(self)) return false;
            return true;
        } catch { return false; }
    }

    safe(p) { return standable(this.read, floor(p)); }

    groundNear(x, z, y, span = 5) {
        for (const dy of [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6]) {
            if (Math.abs(dy) > span) continue;
            const p = { x, y: y + dy, z };
            if (this.safe(p)) return p;
        }
        return undefined;
    }

    line(from, to, target) {
        const len = distance(from, to);
        if (len < 0.05) return true;
        const d = { x: (to.x - from.x) / len, y: (to.y - from.y) / len, z: (to.z - from.z) / len };
        try {
            const hit = this.dimension.getBlockFromRay(from, d, { maxDistance: len, includeLiquidBlocks: true, includePassableBlocks: false });
            return (!hit || (target !== undefined && key(hit.block.location) === key(target)));
        } catch { return false; }
    }

    /**
     * Crafting table within reach. Memoised per cell: hits for 60 ticks, misses
     * for 10 (so a freshly placed table is seen almost immediately). Reads the
     * cached snapshot instead of ~100 live getBlock() calls.
     */
    tableNear(p) {
        const b = floor(p);
        const k = "t" + key(b);
        const m = this.memo.get(k);
        if (m && m.expires > this.tick) return m.value;
        let value = false;
        for (const o of TABLE_OFFSETS) {
            const q = { x: b.x + o.x, y: b.y + o.y, z: b.z + o.z };
            if (distance(p, q) > 3.5) continue;
            if (this.read(q)?.type === TABLE) { value = true; break; }
        }
        this.memo.set(k, { value, expires: this.tick + (value ? 60 : 10) });
        return value;
    }

    threats(bot, owner) {
        return this.threatInfo(bot, owner).list;
    }

    /**
     * Hostiles around the bot. Memoised per tick (and for 3 ticks while the
     * area is clear): think(), the arbiter, food, combat, survival-master and
     * camp each ran their own getEntities() query every tick before. Callers
     * get a copy, so mutating the result (think() prepends the attacker) can
     * not leak into the cache.
     */
    threatInfo(bot, owner) {
        const now = this.now();
        const m = this._threat;
        if (m && m.bot === bot && m.owner === owner && (m.tick === now || (m.info.count === 0 && now - m.tick >= 0 && now - m.tick < 3))) {
            return { ...m.info, list: m.info.list.slice() };
        }
        const loc = bot.location;
        const list = this.dimension.getEntities({ location: loc, maxDistance: THREAT_RADIUS + 4 })
            .filter((e) => HOSTILES.has(e.typeId) && e.isValid &&
                (distance(e.location, loc) <= THREAT_RADIUS || (owner && distance(e.location, owner.location) <= 12)))
            .map((e) => ({ e, d: distance(e.location, loc) }))
            .sort((a, b) => a.d - b.d)
            .slice(0, 10);
        let ranged = 0, explosive = 0, melee = 0, closest = Infinity, bombNear = false, underFire = false;
        for (const { e, d } of list) {
            if (d < closest) closest = d;
            const rank = threatRank(e.typeId);
            if (rank === 3) explosive++;
            else if (rank === 2) ranged++;
            else melee++;
            if (d < 5 && EXPLOSIVE.has(e.typeId)) bombNear = true;
            if (d > 3 && RANGED.has(e.typeId)) underFire = true;
        }
        const entities = list.map((x) => x.e);
        const info = { list: entities, nearest: entities[0], count: entities.length, ranged, explosive, melee, closest, bombNear, underFire };
        this._threat = { tick: now, bot, owner, info };
        return { ...info, list: entities.slice() };
    }

    /**
     * Scan for ores in radius, returns positions of matching ore types.
     */
    scanOres(origin, radius, predicate, budget = 512) {
        const p = floor(origin);
        const fx = origin.x - p.x, fy = origin.y - p.y, fz = origin.z - p.z;
        const offsets = sphereOffsets(radius);
        const found = [];
        let used = 0;
        for (const o of offsets) {
            if (used++ > budget) break;
            const pt = { x: p.x + o.x, y: p.y + o.y, z: p.z + o.z };
            const c = this.read(pt);
            if (c && predicate(c.type, pt)) found.push(pt);
        }
        // Offsets are nearest-first from the cell; re-sort by the true origin
        // only among hits (tiny list) so results match the old ordering.
        if (fx || fy || fz) found.sort((a, b) => distance(a, origin) - distance(b, origin));
        return found;
    }
}

/**
 * Bounded nearest-first scan with improved budget handling - OPTIMIZED FOR SPEED
 * Precomputes sorted offsets per radius to avoid sorting every scan (was extremely slow)
 */
const OFFSET_CACHE = new Map(); // radius -> sorted offsets [{x,y,z,distSq}]
function getSortedOffsets(radius) {
    if (OFFSET_CACHE.has(radius)) return OFFSET_CACHE.get(radius);
    const offsets = [];
    for (let x = -radius; x <= radius; x++)
        for (let z = -radius; z <= radius; z++)
            for (let y = -4; y <= 5; y++) {
                if (x * x + z * z <= radius * radius) {
                    offsets.push({ x, y, z, distSq: x*x + y*y + z*z });
                }
            }
    offsets.sort((a,b) => a.distSq - b.distSq);
    OFFSET_CACHE.set(radius, offsets);
    return offsets;
}

export class BlockScan {
    constructor(origin, radius = 12) {
        this.radius = radius;
        this.cursor = 0;
        this.origin = { ...floor(origin) };
        this.offsets = getSortedOffsets(radius);
        this.points = null; // lazy computed only if needed, else use offsets directly
    }
    next(terrain, predicate, budget = 384) {
        // Fast path: iterate offsets directly without creating points array
        const origin = this.origin;
        while (budget-- > 0 && this.cursor < this.offsets.length) {
            const off = this.offsets[this.cursor++];
            const p = { x: origin.x + off.x, y: origin.y + off.y, z: origin.z + off.z };
            if (terrain.read) {
                const c = terrain.read(p);
                if (c && predicate(c.type, p)) return p;
            } else {
                const b = terrain.block(p);
                if (b && predicate(b.typeId, p)) return p;
            }
        }
        return undefined;
    }
    get done() { return this.cursor >= this.offsets.length; }
    reset(origin, radius) {
        this.cursor = 0;
        this.origin = { ...floor(origin) };
        if (radius !== undefined && radius !== this.radius) {
            this.radius = radius;
            this.offsets = getSortedOffsets(radius);
        }
    }
    // For compatibility with code that expects points array
    getPoints() {
        if (!this.points) {
            this.points = this.offsets.map(off => ({ x: this.origin.x + off.x, y: this.origin.y + off.y, z: this.origin.z + off.z }));
        }
        return this.points;
    }
}

/** Nearest-first cylinder offsets (|dx|,|dz| <= radius, dy in [dyMin, dyMax]). */
const CYL_CACHE = new Map();
function cylinderOffsets(radius, dyMin, dyMax) {
    const k = `${radius}|${dyMin}|${dyMax}`;
    let out = CYL_CACHE.get(k);
    if (out) return out;
    out = [];
    for (let x = -radius; x <= radius; x++)
        for (let z = -radius; z <= radius; z++) {
            if (x * x + z * z > radius * radius) continue;
            for (let y = dyMin; y <= dyMax; y++) out.push({ x, y, z, d2: x * x + y * y * 2 + z * z });
        }
    out.sort((a, b) => a.d2 - b.d2);
    CYL_CACHE.set(k, out);
    return out;
}

/**
 * Amortised area sweep: visits a fixed budget of cells per call, nearest
 * first, from a fixed origin until the whole cylinder is covered, then starts
 * over from wherever the bot is. The old awareness/structure scans looped
 * x-major from the corner and spent their entire budget on the far edge of
 * the cube every time, so they paid for ~900 live reads per pass and never
 * saw what was next to the bot.
 */
export class RollingSweep {
    constructor(radius = 20, dyMin = -6, dyMax = 6, budget = 400, maxDrift = 24) {
        this.offsets = cylinderOffsets(radius, dyMin, dyMax);
        this.budget = budget;
        this.maxDrift = maxDrift;
        this.origin = undefined;
        this.cursor = 0;
        this.sweeps = 0;
    }
    /** True when the next step() starts a fresh sweep. */
    needsRestart(pos) {
        return !this.origin || this.cursor >= this.offsets.length || distance(this.origin, pos) > this.maxDrift;
    }
    /**
     * Visit up to `budget` non-air cells: visit(type, p). Returns
     * { started, finished } so callers can reset/finalise per sweep.
     */
    step(terrain, pos, visit) {
        let started = false;
        if (this.needsRestart(pos)) {
            this.origin = floor(pos);
            this.cursor = 0;
            this.sweeps++;
            started = true;
        }
        const o = this.origin, offs = this.offsets;
        let n = this.budget;
        while (n-- > 0 && this.cursor < offs.length) {
            const d = offs[this.cursor++];
            const p = { x: o.x + d.x, y: o.y + d.y, z: o.z + d.z };
            const c = terrain.read(p);
            if (c && !c.isAir) visit(c.type, p);
        }
        return { started, finished: this.cursor >= offs.length };
    }
}

/**
 * Current time bucket of a dimension clock: "day" | "sunset" | "night".
 * Shared by every director that reasons about night (they each carried an
 * identical private copy).
 *
 * The World object is injected (setTimeSource in main.js) instead of imported
 * so this file stays loadable by the offline perf harness, which requires
 * runtime/world.js to be engine-import-free. Default is "day" before that:
 * the offline stubs and tests never depend on the clock.
 */
let worldSource = undefined;
export function setTimeSource(source) {
    worldSource = source;
}
export function timeOfDay(sim) {
    try {
        const tod = typeof worldSource?.getTimeOfDay === "function" ? worldSource.getTimeOfDay() : 0;
        if (tod >= 12000 && tod < 13000)
            return "sunset";
        if (tod >= 13000 && tod < 23000)
            return "night";
        return "day";
    }
    catch {
        return "day";
    }
}
/** Highest weapon tier carried, by typeId substring (lenient variant). */
export function weaponTierLoose(bag) {
    for (let i = 0; i < bag.size; i++) {
        const s = bag.get(i);
        if (!s)
            continue;
        if (s.typeId.includes("netherite"))
            return 5;
        if (s.typeId.includes("diamond"))
            return 4;
        if (s.typeId.includes("iron"))
            return 3;
        if (s.typeId.includes("stone"))
            return 2;
        if (s.typeId.includes("wooden"))
            return 1;
    }
    return 0;
}
/**
 * True for any Bedrock water craft the bot can ride. Bedrock spawns every
 * wood type under one entity id ("minecraft:boat"; "minecraft:chest_boat" for
 * the chest variant) - per-wood ids such as "minecraft:oak_boat" only exist
 * for the items. Accept both spellings so the check keeps working either way.
 */
export function isBoatEntity(typeId) {
    return typeId === "minecraft:boat" ||
        typeId === "minecraft:chest_boat" ||
        (typeof typeId === "string" && (typeId.endsWith("_boat") || typeId.endsWith("_raft")));
}
/** Nearest boat within 8 blocks, or undefined (shared by escape + survival). */
export function findBoat(sim) {
    try {
        const here = sim.location;
        return sim.dimension.getEntities({ type: "minecraft:boat", location: here, maxDistance: 8 })
            .filter((e) => e.isValid)
            .sort((a, b) => distance(a.location, here) - distance(b.location, here))[0];
    }
    catch {
        return undefined;
    }
}
