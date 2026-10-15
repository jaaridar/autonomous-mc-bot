// One module now: core/blocks.js + core/ores.js + core/policy.js + core/mining-strategy.js (see docs/ARCHITECTURE.md).


// ---------------------------------------------------------------- blocks.js

/**
 * Exhaustive Bedrock block taxonomy for the bot.
 * No engine imports - pure logic, testable offline.
 * Covers: walkable, solid support, hazard, fluid, climbable, scaffold, etc.
 * Based on Bedrock 1.21.114 block list + wiki forensic.
 */

// Walk-through blocks: no collision, bot can occupy same cell.
export const PASSABLE_RE = /(short_grass|tallgrass|tall_grass|fern|large_fern|deadbush|dead_bush|yellow_flower|red_flower|dandelion|poppy|blue_orchid|allium|azure_bluet|_tulip$|oxeye_daisy|sunflower|lilac|rose_bush|peony|cornflower|lily_of_the_valley|_rose$|eyeblossom|torchflower|_mushroom$|sapling|^minecraft:bush$|crimson_roots|warped_roots|nether_sprouts|_carpet$|lily_pad|torch|redstone_wire|tripwire$|_button$|_plate$|_rail$|^minecraft:rail$|^minecraft:wheat$|^minecraft:carrots$|^minecraft:potatoes$|^minecraft:beetroots$|melon_stem$|pumpkin_stem$|sugar_cane|_vine|^minecraft:vine$|glow_lichen|sculk_vein|hanging_roots|snow_layer|pink_petals|wildflowers|leaf_litter|air)/;

// Blocks that can be stood on (solid support) - slabs, stairs, chests etc count.

// Falling blocks that can bury the bot
export const FALLING_RE = /^(minecraft:(sand|red_sand|gravel|suspicious_sand|suspicious_gravel|anvil|dragon_egg|concrete_powder|pointed_dripstone))$/;

// Liquids
export const LIQUID_RE = /(water|flowing_water|lava|flowing_lava)/;

// Hazard blocks - damages on contact
export const HAZARD_IDS = new Set([
    "minecraft:lava","minecraft:flowing_lava","minecraft:fire","minecraft:soul_fire",
    "minecraft:magma","minecraft:cactus","minecraft:sweet_berry_bush","minecraft:powder_snow",
    "minecraft:campfire","minecraft:soul_campfire","minecraft:wither_rose","minecraft:lava_cauldron"
]);

// Unbreakable / should never attempt
export const UNBREAKABLE_RE = /(bedrock|barrier|command_block|structure|jigsaw|end_portal|end_gateway|nether_portal|moving_block|light_block|deny|allow|border|reinforced_deepslate)/;

// Climbable

// Scaffold / temporary

// Wood

// Soil

// Ores

// Leaves

// Crops

export function isPassable(typeId) {
    if (!typeId) return true;
    if (typeId === "minecraft:air" || typeId === "minecraft:cave_air" || typeId === "minecraft:void_air") return true;
    return PASSABLE_RE.test(typeId);
}
export function isSolid(typeId) {
    if (!typeId) return false;
    if (isPassable(typeId)) return false;
    if (LIQUID_RE.test(typeId)) return false;
    // Most blocks are solid except passable; keep allowlist simple
    return true;
}
export function isFalling(typeId) { return FALLING_RE.test(typeId); }
export function isLiquid(typeId) { return LIQUID_RE.test(typeId); }
export function isHazard(typeId) { return HAZARD_IDS.has(typeId); }
export function isUnbreakable(typeId) { return UNBREAKABLE_RE.test(typeId); }

// ---------------------------------------------------------------- ores.js

/**
 * Where ores live in Bedrock 1.18+/1.21. `best` is the Y a shaft is aimed at:
 * the middle of the most productive band, not the extreme edge. Ranges come
 * from the Bedrock ore distributions; they are guidance for the miner, not a
 * promise that a specific chunk contains a vein.
 */
export const ORE_LEVELS = {
    "minecraft:coal": { best: 48, min: 0, max: 192 },
    "minecraft:raw_iron": { best: 16, min: -24, max: 56 },
    "minecraft:raw_copper": { best: 48, min: -16, max: 112 },
    "minecraft:raw_gold": { best: -16, min: -64, max: 32 },
    "minecraft:diamond": { best: -59, min: -64, max: 16 },
    "minecraft:redstone": { best: -59, min: -64, max: 15 },
    "minecraft:lapis_lazuli": { best: 0, min: -64, max: 64 },
};
/**
 * Drops worth digging a dedicated shaft for when they are not visible from the
 * surface. Coal and copper are deliberately absent: both are common in
 * hillsides and caves, so surface search is cheaper than a shaft.
 */
export const UNDERGROUND = new Set([
    "minecraft:raw_iron",
    "minecraft:raw_gold",
    "minecraft:diamond",
    "minecraft:redstone",
    "minecraft:lapis_lazuli",
]);
/** Every ore drop plus gems/gunpowder-ish valuables the bot should never waste. */
export const VALUABLE = new Set([
    "minecraft:coal",
    "minecraft:charcoal",
    "minecraft:raw_iron",
    "minecraft:raw_copper",
    "minecraft:raw_gold",
    "minecraft:diamond",
    "minecraft:emerald",
    "minecraft:redstone",
    "minecraft:lapis_lazuli",
    "minecraft:quartz",
    "minecraft:ancient_debris",
]);
export function oreLevel(item) {
    return ORE_LEVELS[item];
}
export function isUndergroundOre(item) {
    return UNDERGROUND.has(item);
}
/**
 * Bulk blocks a shaft is opened for directly: they sit everywhere under the
 * soil, so digging down where the bot stands always beats a surface search
 * (which is what used to send it off hunting cobblestone in caves).
 */
export const BULK = new Set([
    "minecraft:cobblestone",
    "minecraft:cobbled_deepslate",
    "minecraft:stone",
    "minecraft:deepslate",
]);
export function isBulk(item) {
    return BULK.has(item);
}
/** Shallow target for a bulk dig: just below the local soil layer. */
export function bulkLevel(y) {
    return { best: Math.max(y - 14, 8), min: -64, max: 320 };
}
/** Deepest useful depth for a drop, or undefined when it is not a known ore. */

// ---------------------------------------------------------------- policy.js

/**
 * Branch arbitration. The caller computes each flag from observed state; this
 * function only orders them. Order matters: survival first, work last.
 */
export function priority(s) {
    if (s.paused)
        return "paused";
    if (s.escape)
        return "escape";
    if (s.retreat)
        return "retreat";
    if (s.eat)
        return "eat";
    if (s.threat)
        return "combat";
    return "task";
}
export const HOSTILES = new Set([
    "zombie",
    "zombie_villager",
    "zombie_villager_v2",
    "husk",
    "drowned",
    "skeleton",
    "stray",
    "bogged",
    "wither_skeleton",
    "spider",
    "cave_spider",
    "creeper",
    "slime",
    "magma_cube",
    "silverfish",
    "endermite",
    "pillager",
    "vindicator",
    "evocation_illager",
    "illusioner",
    "vex",
    "witch",
    "phantom",
    "blaze",
    "zoglin",
    "hoglin",
    "piglin",
    "piglin_brute",
    "guardian",
    "elder_guardian",
    "shulker",
    "ghast",
    "ravager",
    "wither",
].map((s) => "minecraft:" + s));
/** Mobs that damage at range: melee approach is the correct response, not fleeing. */
export const RANGED = new Set([
    "skeleton",
    "stray",
    "bogged",
    "drowned",
    "pillager",
    "witch",
    "blaze",
    "ghast",
    "evocation_illager",
    "illusioner",
    "guardian",
    "elder_guardian",
    "shulker",
    "wither",
].map((s) => "minecraft:" + s));
/** Mobs that punish standing still nearby (explosive or aura damage). */
export const EXPLOSIVE = new Set(["creeper", "ghast"].map((s) => "minecraft:" + s));
export function threatRank(typeId) {
    if (EXPLOSIVE.has(typeId))
        return 3;
    if (RANGED.has(typeId))
        return 2;
    return 1;
}
/**
 * Blocks an escape/tunnel action may break. Returns the tool family the engine
 * expects and the minimum pickaxe tier, or undefined for unobtainable blocks.
 */
const UNBREAKABLE = /(bedrock|barrier|command_block|structure|jigsaw|end_portal|end_gateway|nether_portal|water|flowing_|lava|moving_block|light_block|deny|allow|border|reinforced_deepslate)/;
const SOIL = /(dirt|grass_block|grass_path|podzol|mycelium|sand|red_sand|gravel|clay|soul_soil|soul_sand|snow|moss_block|mud|farmland|rooted_dirt|sus|sculk)/;
const WOODY = /(_log|_wood|_stem|_hyphae|_planks|bamboo|cactus|_fence|_slab|_stairs|_door|_trapdoor|ladder|scaffolding)/;
export function diggable(typeId) {
    if (!typeId || UNBREAKABLE.test(typeId))
        return undefined;
    if (MINE[typeId])
        return { tool: MINE[typeId].tool, tier: MINE[typeId].tier };
    if (SOIL.test(typeId))
        return { tool: "shovel", tier: 0 };
    if (WOODY.test(typeId))
        return { tool: "axe", tier: 0 };
    if (/(deepslate|obsidian_)/.test(typeId))
        return { tool: "pickaxe", tier: 1 };
    return { tool: "pickaxe", tier: 0 };
}
export const HAZARDS = new Set([
    "lava",
    "flowing_lava",
    "fire",
    "soul_fire",
    "magma",
    "cactus",
    "sweet_berry_bush",
    "powder_snow",
    "campfire",
    "soul_campfire",
    "wither_rose",
].map((s) => "minecraft:" + s));
export const FOOD = new Set([
    "bread",
    "cooked_beef",
    "cooked_porkchop",
    "cooked_chicken",
    "cooked_mutton",
    "cooked_rabbit",
    "cooked_salmon",
    "cooked_cod",
    "baked_potato",
    "golden_carrot",
    "apple",
    "carrot",
    "sweet_berries",
    "glow_berries",
    "melon_slice",
    "dried_kelp",
    "beetroot",
    "beetroot_soup",
    "mushroom_stew",
    "rabbit_stew",
    "cookie",
    "pumpkin_pie",
    "honey_bottle",
    "potato",
].map((s) => "minecraft:" + s));
/** Safe but low-value raw food: edible at any time, just less nourishing. */
export const RAW_MEAT = new Set([
    "beef",
    "porkchop",
    "mutton",
    "rabbit",
    "cod",
    "salmon",
].map((s) => "minecraft:" + s));
/** Edible but harmful (nausea/poison/hunger effect). Only eaten when desperate. */
export const RISKY_FOOD = new Set([
    "chicken",
    "tropical_fish",
    "rotten_flesh",
    "spider_eye",
    "poisonous_potato",
    "pufferfish",
].map((s) => "minecraft:" + s));
export const MINE = {};
for (const wood of [
    "oak",
    "birch",
    "spruce",
    "jungle",
    "acacia",
    "dark_oak",
    "mangrove",
    "cherry",
    "pale_oak",
]) {
    MINE[`minecraft:${wood}_log`] = {
        drops: `minecraft:${wood}_log`,
        tool: "axe",
        tier: 0,
    };
    MINE[`minecraft:${wood}_wood`] = {
        drops: `minecraft:${wood}_log`,
        tool: "axe",
        tier: 0,
    };
    MINE[`minecraft:stripped_${wood}_log`] = {
        drops: `minecraft:stripped_${wood}_log`,
        tool: "axe",
        tier: 0,
    };
}
for (const [block, drops] of [
    ["wheat", "wheat"],
    ["carrots", "carrot"],
    ["potatoes", "potato"],
    ["beetroots", "beetroot"],
    ["sweet_berry_bush", "sweet_berries"],
    ["melon_block", "melon_slice"],
    ["pumpkin", "pumpkin"],
    ["sugar_cane", "sugar_cane"],
    ["cactus", "cactus"],
    ["kelp", "kelp"],
    ["bamboo", "bamboo"],
    ["hay_block", "wheat"],
    ["oak_leaves", "oak_sapling"],
    ["birch_leaves", "birch_sapling"],
    ["spruce_leaves", "spruce_sapling"],
    // Desert / any wood fallback
    ["deadbush", "stick"],
    ["dead_bush", "stick"],
    ["short_grass", "wheat_seeds"],
    ["tallgrass", "wheat_seeds"],
    ["fern", "wheat_seeds"],
    ["crimson_stem", "crimson_stem"],
    ["warped_stem", "warped_stem"],
    ["crimson_hyphae", "crimson_stem"],
    ["warped_hyphae", "warped_stem"],
    ["bamboo_block", "bamboo"],
    ["bamboo_mosaic", "bamboo"],
]) {
    MINE["minecraft:" + block] = {
        drops: "minecraft:" + drops,
        tool: "hand",
        tier: 0,
    };
}
// Speedrun/nether essentials: any-wood pseudo block, gravel (flint source for ignition), obsidian (portal frame)
MINE["#logs"] = { drops: "#logs", tool: "axe", tier: 0 };
MINE["minecraft:gravel"] = { drops: "minecraft:gravel", tool: "shovel", tier: 0 };
MINE["minecraft:obsidian"] = { drops: "minecraft:obsidian", tool: "pickaxe", tier: 4 };
for (const [block, drops, tier] of [
    ["stone", "cobblestone", 1],
    ["cobblestone", "cobblestone", 1],
    ["deepslate", "cobbled_deepslate", 1],
    ["cobbled_deepslate", "cobbled_deepslate", 1],
    ["andesite", "andesite", 1],
    ["diorite", "diorite", 1],
    ["granite", "granite", 1],
    ["tuff", "tuff", 1],
    ["coal_ore", "coal", 1],
    ["deepslate_coal_ore", "coal", 1],
    ["copper_ore", "raw_copper", 2],
    ["deepslate_copper_ore", "raw_copper", 2],
    ["lapis_ore", "lapis_lazuli", 2],
    ["deepslate_lapis_ore", "lapis_lazuli", 2],
    ["iron_ore", "raw_iron", 2],
    ["deepslate_iron_ore", "raw_iron", 2],
    ["gold_ore", "raw_gold", 3],
    ["deepslate_gold_ore", "raw_gold", 3],
    ["redstone_ore", "redstone", 3],
    ["lit_redstone_ore", "redstone", 3],
    ["deepslate_redstone_ore", "redstone", 3],
    ["lit_deepslate_redstone_ore", "redstone", 3],
    ["diamond_ore", "diamond", 3],
    ["deepslate_diamond_ore", "diamond", 3],
    ["emerald_ore", "emerald", 3],
    ["deepslate_emerald_ore", "emerald", 3],
])
    MINE["minecraft:" + block] = {
        drops: "minecraft:" + drops,
        tool: "pickaxe",
        tier,
    };
export function toolTier(type) {
    if (type.includes("netherite_"))
        return 5;
    if (type.includes("diamond_"))
        return 4;
    if (type.includes("iron_"))
        return 3;
    if (type.includes("stone_"))
        return 2;
    if (type.includes("wooden_") || type.includes("golden_"))
        return 1;
    return 0;
}

// ---------------------------------------------------------------- mining-strategy.js

/**
 * Deep mining strategies - pure logic.
 * Provides branch mining patterns, vein clustering, and efficient dig orders.
 */

/**
 * Branch mining pattern: main corridor with side branches every N blocks.
 * Returns array of {x,z} offsets relative to start, in order.
 */
export function branchPattern(length = 64, branchLength = 20, spacing = 4) {
    const path = [];
    let dir = 0; // 0:+x, 1:+z, 2:-x, 3:-z
    let pos = { x: 0, z: 0 };
    const dirs = [{x:1,z:0},{x:0,z:1},{x:-1,z:0},{x:0,z:-1}];
    for (let i = 0; i < length; i++) {
        path.push({ ...pos, kind: "main" });
        if (i % spacing === 0 && i > 0) {
            // left branch
            const left = (dir + 3) % 4;
            for (let b = 1; b <= branchLength; b++) {
                path.push({ x: pos.x + dirs[left].x * b, z: pos.z + dirs[left].z * b, kind: "branch" });
            }
            for (let b = branchLength; b >= 1; b--) {
                path.push({ x: pos.x + dirs[left].x * b, z: pos.z + dirs[left].z * b, kind: "return" });
            }
            // right branch
            const right = (dir + 1) % 4;
            for (let b = 1; b <= branchLength; b++) {
                path.push({ x: pos.x + dirs[right].x * b, z: pos.z + dirs[right].z * b, kind: "branch" });
            }
            for (let b = branchLength; b >= 1; b--) {
                path.push({ x: pos.x + dirs[right].x * b, z: pos.z + dirs[right].z * b, kind: "return" });
            }
        }
        pos.x += dirs[dir].x;
        pos.z += dirs[dir].z;
    }
    return path;
}

/**
 * Vein clustering: given a list of ore positions, cluster them by proximity.
 * Returns clusters sorted by size (largest first).
 */
export function clusterVeins(positions, radius = 4) {
    const clusters = [];
    const visited = new Set();
    for (let i = 0; i < positions.length; i++) {
        if (visited.has(i)) continue;
        const cluster = [positions[i]];
        visited.add(i);
        const queue = [positions[i]];
        while (queue.length) {
            const cur = queue.shift();
            for (let j = 0; j < positions.length; j++) {
                if (visited.has(j)) continue;
                const other = positions[j];
                const dist = Math.hypot(cur.x - other.x, cur.y - other.y, cur.z - other.z);
                if (dist <= radius) {
                    visited.add(j);
                    cluster.push(other);
                    queue.push(other);
                }
            }
        }
        clusters.push(cluster);
    }
    clusters.sort((a,b) => b.length - a.length);
    return clusters;
}

/**
 * Choose best mining Y for a given ore based on Bedrock distributions.
 */
export function bestYFor(oreType) {
    const map = {
        "minecraft:coal": 48,
        "minecraft:raw_iron": 16,
        "minecraft:raw_copper": 48,
        "minecraft:raw_gold": -16,
        "minecraft:diamond": -59,
        "minecraft:redstone": -59,
        "minecraft:lapis_lazuli": 0,
        "minecraft:emerald": 236, // mountain
        "minecraft:ancient_debris": 15, // nether
        "minecraft:cobblestone": 0,
        "minecraft:stone": 0,
        "minecraft:deepslate": -20,
    };
    return map[oreType] ?? -20;
}

export function optimalSpacing(oreType) {
    // Diamonds benefit from wider spacing due to larger veins
    if (oreType === "minecraft:diamond") return 3;
    if (oreType === "minecraft:raw_iron") return 3;
    return 2;
}
