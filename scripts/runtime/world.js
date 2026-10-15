import { add, floor, distance, key, UP, DOWN, CARDINAL, COMPASS } from "../core/math.js";
import { standable } from "../core/navigation.js";
import { HAZARDS, HOSTILES, RANGED, EXPLOSIVE, threatRank } from "../core/policy.js";
// Hostiles are noticed out to this radius, well beyond melee reach, so an
// archer or a charging creeper is engaged instead of ignored.
const THREAT_RADIUS = 16;
// Blocks a player walks straight through: no collision box, so they never
// block a step. Kept deliberately narrow - anything that damages or slows
// (sweet_berry_bush, powder_snow, cactus) stays non-passable and hazardous.
const WALKABLE = /(short_grass|tallgrass|tall_grass|fern|large_fern|deadbush|dead_bush|yellow_flower|red_flower|dandelion|poppy|blue_orchid|allium|azure_bluet|_tulip$|oxeye_daisy|sunflower|lilac|rose_bush|peony|cornflower|lily_of_the_valley|_rose$|eyeblossom|torchflower|_mushroom$|sapling|^minecraft:bush$|crimson_roots|warped_roots|nether_sprouts|_carpet$|lily_pad|torch|redstone_wire|tripwire$|_button$|_plate$|_rail$|^minecraft:rail$|^minecraft:wheat$|^minecraft:carrots$|^minecraft:potatoes$|^minecraft:beetroots$|melon_stem$|pumpkin_stem$|sugar_cane|_vine|^minecraft:vine$|glow_lichen|sculk_vein|hanging_roots|snow_layer|pink_petals|wildflowers|leaf_litter)/;
export class Terrain {
    begin(tick) {
        this.tick = tick;
        this.reads = 0;
        this.hits = 0;
        if (this.cache.size > 16000) {
            let n = 2000;
            for (const k of this.cache.keys()) {
                this.cache.delete(k);
                if (--n <= 0)
                    break;
            }
        }
    }
    freshSafe(p) {
        const b = floor(p);
        for (const y of [-1, 0, 1])
            this.cache.delete(key(add(b, { x: 0, y, z: 0 })));
        return this.safe(b);
    }
    invalidate(p) {
        this.cache.delete(key(floor(p)));
    }
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
                    // Walk-through blocks have no collision box, so the bot
                    // can move in and out of their cell freely.
                    passable: b.isAir || WALKABLE.test(b.typeId),
                    // Any solid block is a floor: slabs, stairs, chests,
                    // farmland, paths, snow layers and leaves are all real
                    // ground a player stands on. Hazard blocks are excluded
                    // by the `hazard` flag, so this never invites magma.
                    support: b.isSolid,
                    hazard,
                };
            }
            this.cache.set(k, {
                value: result,
                expires: this.tick + (result ? 40 : 2),
            });
            return result;
        };
    }
    clear() {
        this.cache.clear();
    }
    block(p) {
        try {
            return this.dimension.getBlock(floor(p));
        }
        catch {
            return undefined;
        }
    }
    solid(p) {
        const b = this.block(p);
        return !!b && b.isSolid;
    }
    empty(p) {
        const b = this.block(p);
        return !b || b.isAir;
    }
    liquid(p) {
        const b = this.block(p);
        return !!b && b.isLiquid;
    }
    dangerous(p) {
        const b = this.block(p);
        return !!b && (b.isLiquid || HAZARDS.has(b.typeId));
    }
    waterAt(p) {
        const b = this.block(p);
        return !!b && b.isLiquid && /water/.test(b.typeId);
    }
    lavaAt(p) {
        const b = this.block(p);
        return !!b && /lava/.test(b.typeId);
    }
    /** Lava in the cell or any of its six neighbours: digging it would be fatal. */
    lavaNear(p) {
        return (this.lavaAt(p) ||
            [UP, DOWN, ...CARDINAL].some((d) => this.lavaAt(add(p, d))));
    }
    /**
     * Water in the cell or any of its six neighbours: breaking it would flood
     * the tunnel, so the miner must go around instead.
     */
    waterNear(p) {
        return (this.waterAt(p) ||
            [UP, DOWN, ...CARDINAL].some((d) => this.waterAt(add(p, d))));
    }
    /** True when the entity's head is inside a water block (drowning). */
    headInWater(entity) {
        const h = entity.getHeadLocation();
        return this.waterAt(floor(h));
    }
    /**
     * Nearest dry, standable shore within `radius`. Sampled rings keep this
     * cheap enough to run every tick while drowning. Only cells at or above the
     * caller's level count, so a bot in deep water swims to the bank and not to
     * a submerged seabed.
     */
    shoreNear(location, radius = 24) {
        const p = floor(location);
        let best, bestD = Infinity;
        for (const n of [2, 4, 6, 8, 12, 16, 24]) {
            if (n > radius)
                break;
            for (const d of COMPASS) {
                const q = this.groundNear(p.x + d.x * n, p.z + d.z * n, p.y, 3);
                if (!q || this.dangerous(q) || q.y < p.y - 1)
                    continue;
                const dd = distance(q, location);
                if (dd < bestD) {
                    bestD = dd;
                    best = q;
                }
            }
            if (best)
                break;
        }
        return best ? { cell: best, distance: bestD } : undefined;
    }
    /**
     * Coarse sweep for structure stores (chests, barrels) around a point. The
     * grid steps two cells and flips parity every forty ticks, so consecutive
     * calls cover every cell while each one stays cheap. Blocks behind walls
     * are reported too; the route to them is still walked honestly.
     */
    storeNear(location, radius = 12, tick = 0) {
        const base = floor(location);
        const parity = Math.floor(tick / 40) % 2;
        const found = [];
        for (let dx = -radius + parity; dx <= radius; dx += 2)
            for (let dz = -radius + parity; dz <= radius; dz += 2) {
                if (dx * dx + dz * dz > radius * radius)
                    continue;
                for (let dy = -3; dy <= 3; dy++) {
                    const p = add(base, { x: dx, y: dy, z: dz });
                    const b = this.block(p);
                    if (b &&
                        (b.typeId === "minecraft:chest" || b.typeId === "minecraft:barrel"))
                        found.push({ ...p });
                }
            }
        return found.sort((a, b) => distance(a, base) - distance(b, base));
    }
    safe(p) {
        return standable(this.read, floor(p));
    }
    /** Nearest standable cell in a column, scanning outward from `y`. */
    groundNear(x, z, y, span = 4) {
        for (const dy of [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5]) {
            if (Math.abs(dy) > span)
                continue;
            const p = { x, y: y + dy, z };
            if (this.safe(p))
                return p;
        }
        return undefined;
    }
    line(from, to, target) {
        const len = distance(from, to);
        if (len < 0.05)
            return true;
        const d = {
            x: (to.x - from.x) / len,
            y: (to.y - from.y) / len,
            z: (to.z - from.z) / len,
        };
        try {
            const hit = this.dimension.getBlockFromRay(from, d, {
                maxDistance: len,
                includeLiquidBlocks: true,
                includePassableBlocks: false,
            });
            return (!hit ||
                (target !== undefined && key(hit.block.location) === key(target)));
        }
        catch {
            return false;
        }
    }
    tableNear(p) {
        const b = floor(p);
        for (let x = -3; x <= 3; x++)
            for (let z = -3; z <= 3; z++)
                for (let y = -1; y <= 1; y++) {
                    const q = add(b, { x, y, z });
                    if (distance(p, q) <= 3.5 &&
                        this.block(q)?.typeId === "minecraft:crafting_table")
                        return true;
                }
        return false;
    }
    /**
     * Hostiles the bot should react to. A skeleton at twelve blocks that is
     * already shooting must count, so the radius is wider than melee reach and
     * line of sight is not required for inclusion.
     */
    threats(bot, owner) {
        return this.dimension
            .getEntities({ location: bot.location, maxDistance: THREAT_RADIUS + 4 })
            .filter((e) => HOSTILES.has(e.typeId) &&
            e.isValid &&
            (distance(e.location, bot.location) <= THREAT_RADIUS ||
                (owner && distance(e.location, owner.location) <= 10)))
            .sort((a, b) => distance(a.location, bot.location) -
            distance(b.location, bot.location))
            .slice(0, 8);
    }
    /** Aggregate view of nearby danger used for branch selection. */
    threatInfo(bot, owner) {
        const list = this.threats(bot, owner);
        let ranged = 0, explosive = 0, melee = 0, closest = Infinity;
        for (const e of list) {
            const d = distance(e.location, bot.location);
            if (d < closest)
                closest = d;
            const rank = threatRank(e.typeId);
            if (rank === 3)
                explosive++;
            else if (rank === 2)
                ranged++;
            else
                melee++;
        }
        return {
            list,
            nearest: list[0],
            count: list.length,
            ranged,
            explosive,
            melee,
            closest,
            /** A creeper close enough that a single blast is lethal. */
            bombNear: list.some((e) => EXPLOSIVE.has(e.typeId) &&
                distance(e.location, bot.location) < 5),
            /** Incoming fire from beyond melee reach. */
            underFire: list.some((e) => RANGED.has(e.typeId) &&
                distance(e.location, bot.location) > 3),
        };
    }
}
/** Bounded nearest-first scan; callers cap cells per brain tick (default 256). */
export class BlockScan {
    constructor(origin, radius = 10) {
        this.points = [];
        this.cursor = 0;
        const p = floor(origin);
        for (let x = -radius; x <= radius; x++)
            for (let z = -radius; z <= radius; z++)
                for (let y = -3; y <= 4; y++)
                    if (x * x + z * z <= radius * radius)
                        this.points.push(add(p, { x, y, z }));
        this.points.sort((a, b) => distance(a, origin) - distance(b, origin));
    }
    next(terrain, predicate, budget = 256) {
        while (budget-- > 0 && this.cursor < this.points.length) {
            const p = this.points[this.cursor++], b = terrain.block(p);
            if (b && predicate(b.typeId, p))
                return p;
        }
        return undefined;
    }
    get done() {
        return this.cursor >= this.points.length;
    }
}
