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
