import { add, floor, distance, key, UP, DOWN, CARDINAL, COMPASS } from "../core/math.js";
import { standable } from "../core/navigation.js";
import { HAZARDS, HOSTILES, RANGED, EXPLOSIVE, threatRank } from "../core/policy.js";

const THREAT_RADIUS = 18;

// Walk-through blocks: no collision - keep narrow, anchored where needed to avoid substring traps like stairs containing \"air\"
const WALKABLE = /(short_grass|tallgrass|tall_grass|fern|large_fern|deadbush|dead_bush|yellow_flower|red_flower|dandelion|poppy|blue_orchid|allium|azure_bluet|_tulip$|oxeye_daisy|sunflower|lilac|rose_bush|peony|cornflower|lily_of_the_valley|_rose$|eyeblossom|torchflower|_mushroom$|sapling|^minecraft:bush$|crimson_roots|warped_roots|nether_sprouts|_carpet$|lily_pad|torch|redstone_wire|tripwire$|_button$|_plate$|_rail$|^minecraft:rail$|^minecraft:wheat$|^minecraft:carrots$|^minecraft:potatoes$|^minecraft:beetroots$|melon_stem$|pumpkin_stem$|sugar_cane|_vine|^minecraft:vine$|glow_lichen|sculk_vein|hanging_roots|snow_layer|pink_petals|wildflowers|leaf_litter|^minecraft:air$|^minecraft:cave_air$|^minecraft:void_air$)/;

export class Terrain {
    begin(tick) {
        this.tick = tick;
        this.reads = 0;
        this.hits = 0;
        if (this.cache.size > 18000) {
            let n = 2500;
            for (const k of this.cache.keys()) {
                this.cache.delete(k);
                if (--n <= 0) break;
            }
        }
    }
    freshSafe(p) {
        const b = floor(p);
        for (const y of [-1, 0, 1]) this.cache.delete(key(add(b, { x: 0, y, z: 0 })));
        return this.safe(b);
    }
    invalidate(p) { this.cache.delete(key(floor(p))); }
    constructor(dimension) {
        this.dimension = dimension;
        this.cache = new Map();
        this.tick = 0;
        this.reads = 0;
        this.hits = 0;
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
            if (b) {
                const hazard = HAZARDS.has(b.typeId) || b.isLiquid;
                result = {
                    passable: b.isAir || WALKABLE.test(b.typeId),
                    support: b.isSolid,
                    hazard,
                    type: b.typeId,
                    isAir: b.isAir,
                    isLiquid: b.isLiquid,
                    isSolid: b.isSolid,
                };
            }
            this.cache.set(k, { value: result, expires: this.tick + (result ? 40 : 2) });
            return result;
        };
    }
    clear() { this.cache.clear(); }
    // Fast cached block read - uses read cache for performance, critical for mining speed
    block(p) {
        try {
            const fp = floor(p);
            const k = key(fp);
            const cached = this.cache.get(k);
            if (cached && cached.expires > this.tick) {
                // Return synthetic block from cached read if possible, else fetch
                if (cached.value && cached.value._block) return cached.value._block;
            }
            const b = this.dimension.getBlock(fp);
            // Cache it
            if (b) {
                const hazard = HAZARDS.has(b.typeId) || b.isLiquid;
                this.cache.set(k, { 
                    value: {
                        passable: b.isAir || WALKABLE.test(b.typeId),
                        support: b.isSolid,
                        hazard,
                        type: b.typeId,
                        isAir: b.isAir,
                        isLiquid: b.isLiquid,
                        isSolid: b.isSolid,
                        _block: b
                    }, 
                    expires: this.tick + (b.isSolid ? 40 : 2) 
                });
            }
            return b;
        } catch { return undefined; }
    }
    // Uncached direct read for when you need fresh
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
        return (this.lavaAt(p) || [UP, DOWN, ...CARDINAL].some((d) => this.lavaAt(add(p, d))));
    }
    waterNear(p) {
        return (this.waterAt(p) || [UP, DOWN, ...CARDINAL].some((d) => this.waterAt(add(p, d))));
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
                    const p = add(base, { x: dx, y: dy, z: dz });
                    const b = this.block(p);
                    if (b && (b.typeId === "minecraft:chest" || b.typeId === "minecraft:trapped_chest" || b.typeId === "minecraft:barrel" || b.typeId.includes("shulker_box") || b.typeId === "minecraft:ender_chest"))
                        found.push({ ...p });
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
            // ROBUST: check block in front of head that gets in between when going down - critical fix for mining down obstruction
            // When mining below, bot looks down, but block at head level in front can block LOS or movement
            for (const d of [{x:1,y:0,z:0},{x:-1,y:0,z:0},{x:0,y:0,z:1},{x:0,y:0,z:-1},{x:1,y:1,z:0},{x:-1,y:1,z:0},{x:0,y:1,z:1},{x:0,y:1,z:-1}]) {
                const headFront = { x: bp.x + d.x, y: bp.y + d.y, z: bp.z + d.z };
                const b = this.block(headFront);
                if (b && !b.isAir && b.isSolid && !WALKABLE.test(b.typeId)) {
                    // Only add if it blocks line of sight to below target (check if it's in front and at head level)
                    if (d.y >= 0) {
                        obstruct.push(headFront);
                    }
                }
            }
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
        const b = floor(p);
        for (let x = -3; x <= 3; x++)
            for (let z = -3; z <= 3; z++)
                for (let y = -1; y <= 1; y++) {
                    const q = add(b, { x, y, z });
                    if (distance(p, q) <= 3.5 && this.block(q)?.typeId === "minecraft:crafting_table") return true;
                }
        return false;
    }

    threats(bot, owner) {
        return this.dimension.getEntities({ location: bot.location, maxDistance: THREAT_RADIUS + 4 })
            .filter((e) => HOSTILES.has(e.typeId) && e.isValid &&
                (distance(e.location, bot.location) <= THREAT_RADIUS || (owner && distance(e.location, owner.location) <= 12)))
            .sort((a, b) => distance(a.location, bot.location) - distance(b.location, bot.location))
            .slice(0, 10);
    }

    threatInfo(bot, owner) {
        const list = this.threats(bot, owner);
        let ranged = 0, explosive = 0, melee = 0, closest = Infinity;
        for (const e of list) {
            const d = distance(e.location, bot.location);
            if (d < closest) closest = d;
            const rank = threatRank(e.typeId);
            if (rank === 3) explosive++;
            else if (rank === 2) ranged++;
            else melee++;
        }
        return {
            list, nearest: list[0], count: list.length, ranged, explosive, melee, closest,
            bombNear: list.some((e) => EXPLOSIVE.has(e.typeId) && distance(e.location, bot.location) < 5),
            underFire: list.some((e) => RANGED.has(e.typeId) && distance(e.location, bot.location) > 3),
        };
    }

    /**
     * Scan for ores in radius, returns positions of matching ore types.
     */
    scanOres(origin, radius, predicate, budget = 512) {
        const points = [];
        const p = floor(origin);
        for (let x = -radius; x <= radius; x++)
            for (let z = -radius; z <= radius; z++)
                for (let y = -radius; y <= radius; y++) {
                    if (x*x + y*y + z*z > radius*radius) continue;
                    points.push(add(p, { x, y, z }));
                }
        points.sort((a,b) => distance(a, origin) - distance(b, origin));
        const found = [];
        let used = 0;
        for (const pt of points) {
            if (used++ > budget) break;
            const b = this.block(pt);
            if (b && predicate(b.typeId, pt)) found.push(pt);
        }
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
            const b = terrain.block(p);
            if (b && predicate(b.typeId, p)) return p;
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
