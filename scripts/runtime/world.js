import { add, floor, distance, key, UP, DOWN, CARDINAL, COMPASS } from "../core/math.js";
import { standable } from "../core/navigation.js";
import { HAZARDS, HOSTILES, RANGED, EXPLOSIVE, threatRank } from "../core/policy.js";

const THREAT_RADIUS = 18;
const TABLE_OFFSETS = [];
for (let x = -3; x <= 3; x++)
    for (let z = -3; z <= 3; z++)
        for (let y = -1; y <= 1; y++)
            TABLE_OFFSETS.push({ x, y, z });
TABLE_OFFSETS.sort((a, b) => (a.x * a.x + a.y * a.y + a.z * a.z) - (b.x * b.x + b.y * b.y + b.z * b.z));
const isStore = (t) => !!t && (t === "minecraft:chest" || t === "minecraft:trapped_chest" || t === "minecraft:barrel" || t.includes("shulker_box") || t === "minecraft:ender_chest");
const NEAR6 = [UP, DOWN, ...CARDINAL];
const NEAR7 = [{ x: 0, y: 0, z: 0 }, ...NEAR6];

// Walk-through blocks: no collision - keep narrow, anchored where needed to avoid substring traps like stairs containing \"air\"
const WALKABLE = /(short_grass|tallgrass|tall_grass|fern|large_fern|deadbush|dead_bush|yellow_flower|red_flower|dandelion|poppy|blue_orchid|allium|azure_bluet|_tulip$|oxeye_daisy|sunflower|lilac|rose_bush|peony|cornflower|lily_of_the_valley|_rose$|eyeblossom|torchflower|_mushroom$|sapling|^minecraft:bush$|crimson_roots|warped_roots|nether_sprouts|_carpet$|lily_pad|torch|redstone_wire|tripwire$|_button$|_plate$|_rail$|^minecraft:rail$|^minecraft:wheat$|^minecraft:carrots$|^minecraft:potatoes$|^minecraft:beetroots$|melon_stem$|pumpkin_stem$|sugar_cane|_vine|^minecraft:vine$|glow_lichen|sculk_vein|hanging_roots|snow_layer|pink_petals|wildflowers|leaf_litter|^minecraft:air$|^minecraft:cave_air$|^minecraft:void_air$)/;

/** Exact numeric key for a cell (x/z wrap every 65536 blocks; entries store x/z to reject wraps). */
const cellKey = (x, y, z) => ((x & 0xffff) * 65536 + (z & 0xffff)) * 1024 + ((y + 512) & 1023);
const AIR = new Set(["minecraft:air", "minecraft:cave_air", "minecraft:void_air"]);
const LIQUID_TYPE = /^minecraft:(flowing_)?(water|lava)$/;
/** Facts derived from a typeId alone: regex/set work runs once per type, not once per cell. */
const TYPE_INFO = new Map();
export function typeInfo(type) {
    let t = TYPE_INFO.get(type);
    if (t === undefined) {
        const air = AIR.has(type);
        const liquid = LIQUID_TYPE.test(type) || type === "minecraft:bubble_column";
        t = {
            air,
            liquid,
            passable: air || WALKABLE.test(type),
            hazard: HAZARDS.has(type) || liquid,
            water: liquid && !type.includes("lava"),
            lava: type.includes("lava"),
        };
        TYPE_INFO.set(type, t);
    }
    return t;
}
/** How long a block handle is reused. Handles are live: properties read through them are always current. */
const HANDLE_TTL = 40;
/** How long a typeId/isSolid snapshot is trusted (solid blocks rarely change; air and fluids do). */
const SOLID_TTL = 40;
const OPEN_TTL = 10;
/** Entities that are never threats; excluded engine-side so they are not even wrapped. */
const NOT_THREATS = ["minecraft:item", "minecraft:xp_orb", "minecraft:arrow", "minecraft:player", "minecraft:falling_block", "minecraft:painting", "minecraft:armor_stand", "minecraft:leash_knot"];

class Cell {
    constructor(x, y, z) {
        this.x = x;
        this.y = y;
        this.z = z;
        this.b = undefined; // Block handle, null when unloaded/outside the world
        this.bt = -1;       // handle reusable while tick < bt
        this.t = undefined; // typeId snapshot (null when no block)
        this.s = undefined; // isSolid snapshot (lazy)
        this.dt = -1;       // snapshot trusted while tick < dt
        this.at = -1;       // tick the snapshot was taken
        this.g = -1;        // Terrain.gen the snapshot belongs to
        this.w = -1;        // watched (always read live) until this tick
        this.v = undefined; // read() record built from the snapshot
    }
}

export class Terrain {
    constructor(dimension) {
        this.dimension = dimension;
        this.cache = new Map();
        this.gen = 0;
        this.tick = 0;
        this.reads = 0;
        this.hits = 0;
        this.threatMemo = undefined;
        this.read = (p) => this.readXYZ(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z));
    }
    begin(tick) {
        this.tick = tick;
        this.reads = 0;
        this.hits = 0;
        if (this.cache.size > 24000)
            this.prune();
    }
    prune() {
        const now = this.tick;
        for (const [k, c] of this.cache)
            if (c.dt <= now && c.bt <= now)
                this.cache.delete(k);
        if (this.cache.size > 20000) {
            let n = this.cache.size - 16000;
            for (const k of this.cache.keys()) {
                this.cache.delete(k);
                if (--n <= 0)
                    break;
            }
        }
    }
    cell(x, y, z) {
        const k = cellKey(x, y, z);
        let c = this.cache.get(k);
        if (c === undefined || c.x !== x || c.z !== z) {
            c = new Cell(x, y, z);
            this.cache.set(k, c);
        }
        return c;
    }
    handle(c) {
        if (c.bt > this.tick && c.b !== undefined)
            return c.b;
        let b;
        try {
            b = this.dimension.getBlock({ x: c.x, y: c.y, z: c.z });
        }
        catch {
            b = undefined;
        }
        this.reads++;
        c.b = b ?? null;
        c.bt = this.tick + (b ? HANDLE_TTL : 2);
        return c.b;
    }
    /** Cached typeId of a cell; undefined when unloaded or outside the world. */
    typeOf(c, maxAge) {
        if (c.g === this.gen && c.dt > this.tick && c.w < this.tick && (maxAge === undefined || this.tick - c.at <= maxAge)) {
            this.hits++;
            return c.t ?? undefined;
        }
        const b = this.handle(c);
        let t = null;
        if (b) {
            try {
                t = b.typeId;
            }
            catch {
                t = null;
                c.b = undefined;
                c.bt = -1;
            }
        }
        c.t = t;
        c.s = undefined;
        c.v = undefined;
        c.g = this.gen;
        c.at = this.tick;
        if (t === null)
            c.dt = this.tick + 2;
        else {
            const info = typeInfo(t);
            c.dt = this.tick + (info.air || info.liquid ? OPEN_TTL : SOLID_TTL);
        }
        return t ?? undefined;
    }
    solidOf(c) {
        if (c.s === undefined) {
            let s = false;
            const info = c.t ? typeInfo(c.t) : undefined;
            if (info && !info.air && !info.liquid && c.b) {
                try {
                    s = c.b.isSolid;
                }
                catch {
                    s = false;
                }
            }
            c.s = s;
        }
        return c.s;
    }
    /** Pathing snapshot of a cell (cached; see SOLID_TTL/OPEN_TTL). Shared object - do not mutate. */
    readXYZ(x, y, z, maxAge) {
        const c = this.cell(x, y, z);
        const t = this.typeOf(c, maxAge);
        if (t === undefined)
            return undefined;
        if (c.v === undefined) {
            const info = typeInfo(t);
            const solid = this.solidOf(c);
            c.v = { passable: info.passable, support: solid, hazard: info.hazard, type: t, isAir: info.air, isLiquid: info.liquid, isSolid: solid };
        }
        return c.v;
    }
    /** Cached typeId at p (for scans). Verify a hit with typeFresh() before acting on it. */
    type(p) {
        return this.typeOf(this.cell(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z)));
    }
    /**
     * typeId for far-field surveys (awareness/structure sweeps): any snapshot
     * up to maxAge ticks old is accepted even past its normal TTL, so a bot
     * standing still does not re-read the same distant cells every sweep.
     * invalidate()/clear() still force a fresh read.
     */
    typeSurvey(p, maxAge = 120) {
        const c = this.cell(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z));
        if (c.g === this.gen && c.t !== undefined && c.t !== null && c.at >= 0 && c.w < this.tick && this.tick - c.at <= maxAge && this.tick >= c.at) {
            this.hits++;
            return c.t;
        }
        return this.typeOf(c);
    }
    /** Current typeId at p, read through the live handle (refreshes the snapshot). */
    typeFresh(p) {
        const c = this.cell(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z));
        c.dt = -1;
        c.at = -1;
        return this.typeOf(c);
    }
    freshSafe(p, maxAge = 0) {
        const x = Math.floor(p.x), y = Math.floor(p.y), z = Math.floor(p.z);
        const a = this.readXYZ(x, y, z, maxAge), b = this.readXYZ(x, y + 1, z, maxAge), c = this.readXYZ(x, y - 1, z, maxAge);
        return !!(a?.passable && b?.passable && c?.support && !a.hazard && !b.hazard && !c.hazard);
    }
    invalidate(p) {
        const c = this.cache.get(cellKey(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z)));
        if (c) {
            c.dt = -1;
            c.at = -1;
        }
    }
    /**
     * The bot is changing this cell (placing, breaking): serve it from live
     * reads for the next `ticks` ticks so every snapshot user (A*, scans,
     * tableNear) sees the change as soon as the engine applies it.
     */
    watch(p, ticks = 40) {
        const c = this.cell(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z));
        c.w = Math.max(c.w, this.tick + ticks);
        c.dt = -1;
        c.at = -1;
    }
    /** Distrust every snapshot (O(1)); live block handles stay reusable. */
    clear() {
        this.gen++;
    }
    /** Live block handle (cached handle, properties always current). */
    block(p) {
        return this.handle(this.cell(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z))) ?? undefined;
    }
    /** Uncached direct read for when you need fresh */
    blockUncached(p) {
        try { return this.dimension.getBlock(floor(p)); } catch { return undefined; }
    }
    solid(p) { const b = this.block(p); return !!b && b.isSolid; }
    empty(p) { const b = this.block(p); return !b || b.isAir; }
    liquid(p) { const b = this.block(p); return !!b && b.isLiquid; }
    dangerous(p) { const b = this.block(p); return !!b && (b.isLiquid || HAZARDS.has(b.typeId)); }
    waterAt(p) { const b = this.block(p); return !!b && b.isLiquid && /water/.test(b.typeId); }
    lavaAt(p) { const b = this.block(p); return !!b && /lava/.test(b.typeId); }
    lavaNear(p) {
        if (this.lavaAt(p))
            return true;
        for (const d of NEAR6)
            if (this.lavaAt({ x: p.x + d.x, y: p.y + d.y, z: p.z + d.z }))
                return true;
        return false;
    }
    waterNear(p) {
        if (this.waterAt(p))
            return true;
        for (const d of NEAR6)
            if (this.waterAt({ x: p.x + d.x, y: p.y + d.y, z: p.z + d.z }))
                return true;
        return false;
    }
    /** waterNear() from snapshots no older than maxAge ticks (cheap; for steering, not for digging safety). */
    waterNearCached(p, maxAge = 10) {
        const x = Math.floor(p.x), y = Math.floor(p.y), z = Math.floor(p.z);
        for (const d of NEAR7) {
            const t = this.typeOf(this.cell(x + d.x, y + d.y, z + d.z), maxAge);
            if (t && typeInfo(t).water)
                return true;
        }
        return false;
    }
    headInWater(entity) {
        const h = entity.getHeadLocation();
        return this.waterAt(floor(h));
    }

    shoreNear(location, radius = 64) { // Increased from 28 to 64 for deep water swimming fix
        const p = floor(location);
        let best, bestD = Infinity;
        for (const n of [2, 4, 6, 8, 12, 16, 24, 28, 32, 48, 64]) {
            if (n > radius) break;
            for (const d of COMPASS) {
                const q = this.groundNear(p.x + d.x * n, p.z + d.z * n, p.y, 4);
                if (!q || this.dangerous(q) || q.y < p.y - 1) continue;
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
                    const p = { x: base.x + dx, y: base.y + dy, z: base.z + dz };
                    // Cached snapshot for the sweep; a hit is confirmed live below.
                    if (isStore(this.type(p)) && isStore(this.typeFresh(p)))
                        found.push(p);
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
            const b = this.block(p);
            if (b && !b.isAir && !WALKABLE.test(b.typeId)) {
                obstruct.push(p);
            }
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
                const b = this.block(cell);
                if (b && !b.isAir && !WALKABLE.test(b.typeId)) {
                    obstruct.push(cell);
                }
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
    headFrontObstruction(botPos) {
        const bp = floor(botPos);
        // Check all 4 cardinal directions at head level (y) and feet level (y-1) for blocks that would be in front when looking down
        for (const d of [{x:1,y:0,z:0},{x:-1,y:0,z:0},{x:0,y:0,z:1},{x:0,y:0,z:-1}]) {
            for (const dy of [0, 1]) {
                const p = { x: bp.x + d.x, y: bp.y + dy, z: bp.z + d.z };
                const b = this.block(p);
                if (b && !b.isAir && b.isSolid && !WALKABLE.test(b.typeId) && !b.isLiquid) {
                    // This block is in front of head, would obstruct going down
                    return p;
                }
            }
        }
        return null;
    }

    /**
     * Is a cell safe to mine? Enhanced with falling block and fluid checks,
     * plus check for blocks above that would fall.
     */
    safeToMineEx(p, checkAbove = true) {
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
        // Check lava/water near
        if (this.lavaNear(self) || this.waterNear(self)) return false;
        return true;
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

    tableNear(p) {
        // A table found in the last 100 ticks is re-checked with one live read
        // instead of a 147-cell sweep. Only hits are remembered: caching a miss
        // would hide a table the bot has just placed and make it place another.
        const known = this.lastTable;
        if (known && this.tick - known.tick <= 100 && this.tick >= known.tick && distance(p, known.cell) <= 3.5) {
            if (this.typeFresh(known.cell) === "minecraft:crafting_table") return true;
            this.lastTable = undefined;
        }
        const b = floor(p);
        for (const q of TABLE_OFFSETS) {
            const c = { x: b.x + q.x, y: b.y + q.y, z: b.z + q.z };
            if (distance(p, c) <= 3.5 && this.type(c) === "minecraft:crafting_table" && this.typeFresh(c) === "minecraft:crafting_table") {
                this.lastTable = { cell: c, tick: this.tick };
                return true;
            }
        }
        return false;
    }

    threats(bot, owner) {
        return this.threatInfo(bot, owner).list;
    }

    /**
     * Hostiles near the bot (or within 12 of the owner), nearest first, max 10.
     * One engine query per tick no matter how many directors ask: about twenty
     * call sites used to run their own getEntities() every tick. When the last
     * scan was empty it is reused for 2 more ticks (forgetThreats() on damage).
     */
    threatInfo(bot, owner) {
        const m = this.threatMemo, now = this.tick;
        if (m && m.bot === bot && m.hasOwner === !!owner && (m.tick === now || (m.info.count === 0 && now - m.tick <= 2 && now >= m.tick)))
            return m.info;
        const info = this.scanThreats(bot, owner);
        this.threatMemo = { tick: now, bot, hasOwner: !!owner, info };
        return info;
    }
    forgetThreats() {
        this.threatMemo = undefined;
    }
    scanThreats(bot, owner) {
        const here = bot.location;
        const ownerAt = owner ? owner.location : undefined;
        const rows = [];
        let list = [];
        try {
            list = this.dimension.getEntities({ location: here, maxDistance: THREAT_RADIUS + 4, excludeTypes: NOT_THREATS });
        }
        catch {
            list = [];
        }
        for (const e of list) {
            if (!HOSTILES.has(e.typeId) || !e.isValid)
                continue;
            const at = e.location;
            const d = distance(at, here);
            if (d <= THREAT_RADIUS || (ownerAt && distance(at, ownerAt) <= 12))
                rows.push({ e, d, t: e.typeId });
        }
        rows.sort((a, b) => a.d - b.d);
        if (rows.length > 10)
            rows.length = 10;
        let ranged = 0, explosive = 0, melee = 0, closest = Infinity, bombNear = false, underFire = false;
        for (const r of rows) {
            if (r.d < closest) closest = r.d;
            const rank = threatRank(r.t);
            if (rank === 3) explosive++;
            else if (rank === 2) ranged++;
            else melee++;
            if (EXPLOSIVE.has(r.t) && r.d < 5) bombNear = true;
            if (RANGED.has(r.t) && r.d > 3) underFire = true;
        }
        const out = rows.map((r) => r.e);
        return { list: out, nearest: out[0], count: out.length, ranged, explosive, melee, closest, bombNear, underFire };
    }

    /**
     * Scan for ores in radius, returns positions of matching ore types,
     * nearest first. Only the nearest `budget` cells are ever examined, so the
     * offsets come from one precomputed nearest-first list instead of building
     * and sorting the whole sphere on every call (137k points at radius 32).
     * Matches are confirmed with a live read before being returned.
     */
    scanOres(origin, radius, predicate, budget = 512) {
        const p = floor(origin);
        const r2 = radius * radius;
        const offsets = sphereOffsets(budget + 1);
        const found = [];
        let used = 0;
        for (const o of offsets) {
            if (o.d2 > r2) break;
            if (used++ > budget) break;
            const pt = { x: p.x + o.x, y: p.y + o.y, z: p.z + o.z };
            const t = this.type(pt);
            if (t && predicate(t, pt)) {
                const live = this.typeFresh(pt);
                if (live && predicate(live, pt)) found.push(pt);
            }
        }
        return found;
    }
}

/** Nearest-first sphere offsets, grown on demand (shared by every scanOres call). */
let SPHERE = [];
let SPHERE_R = 0;
function sphereOffsets(count) {
    while (SPHERE.length < count) {
        const r = SPHERE_R + 4;
        const pts = [];
        for (let x = -r; x <= r; x++)
            for (let y = -r; y <= r; y++)
                for (let z = -r; z <= r; z++) {
                    const d2 = x * x + y * y + z * z;
                    if (d2 <= r * r) pts.push({ x, y, z, d2 });
                }
        pts.sort((a, b) => a.d2 - b.d2);
        SPHERE = pts;
        SPHERE_R = r;
    }
    return SPHERE;
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
            // Cached snapshot for the sweep; only a candidate costs a live read.
            const t = terrain.type ? terrain.type(p) : terrain.block(p)?.typeId;
            if (t && predicate(t, p)) {
                const live = terrain.typeFresh ? terrain.typeFresh(p) : t;
                if (live && predicate(live, p)) return p;
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
