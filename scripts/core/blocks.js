/**
 * Exhaustive Bedrock block taxonomy for the bot.
 * No engine imports - pure logic, testable offline.
 * Covers: walkable, solid support, hazard, fluid, climbable, scaffold, etc.
 * Based on Bedrock 1.21.114 block list + wiki forensic.
 */

// Walk-through blocks: no collision, bot can occupy same cell.
export const PASSABLE_RE = /(short_grass|tallgrass|tall_grass|fern|large_fern|deadbush|dead_bush|yellow_flower|red_flower|dandelion|poppy|blue_orchid|allium|azure_bluet|_tulip$|oxeye_daisy|sunflower|lilac|rose_bush|peony|cornflower|lily_of_the_valley|_rose$|eyeblossom|torchflower|_mushroom$|sapling|^minecraft:bush$|crimson_roots|warped_roots|nether_sprouts|_carpet$|lily_pad|torch|redstone_wire|tripwire$|_button$|_plate$|_rail$|^minecraft:rail$|^minecraft:wheat$|^minecraft:carrots$|^minecraft:potatoes$|^minecraft:beetroots$|melon_stem$|pumpkin_stem$|sugar_cane|_vine|^minecraft:vine$|glow_lichen|sculk_vein|hanging_roots|snow_layer|pink_petals|wildflowers|leaf_litter|air)/;

// Blocks that can be stood on (solid support) - slabs, stairs, chests etc count.
export const SOLID_SUPPORT_RE = /^(minecraft:(stone|deepslate|cobblestone|dirt|grass_block|sand|gravel|.*_planks|.*_log|.*_wood|crafting_table|furnace|chest|barrel|.*_slab|.*_stairs|farmland|path|.*_concrete|.*_wool|bedrock|obsidian|netherrack|end_stone|soul_sand|soul_soil|mud|clay|.*_ore|.*terracotta|glass|leaves|.*_leaves).*)/;

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
export const CLIMBABLE_RE = /(ladder|vine|scaffolding|weeping_vines|twisting_vines)/;

// Scaffold / temporary
export const SCAFFOLD_RE = /(scaffolding|dirt|gravel|sand|cobblestone)/;

// Wood
export const WOOD_RE = /(_log|_wood|_stem|_hyphae|_planks|bamboo|cactus|_fence|_slab|_stairs|_door|_trapdoor|ladder|scaffolding)/;

// Soil
export const SOIL_RE = /(dirt|grass_block|grass_path|podzol|mycelium|sand|red_sand|gravel|clay|soul_soil|soul_sand|snow|moss_block|mud|farmland|rooted_dirt|sus|sculk)/;

// Ores
export const ORE_RE = /(_ore$)/;

// Leaves
export const LEAVES_RE = /(leaves$)/;

// Crops
export const CROP_RE = /(wheat|carrots|potatoes|beetroots|melon_stem|pumpkin_stem|sweet_berry_bush|cocoa)/;

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
export function isClimbable(typeId) { return CLIMBABLE_RE.test(typeId); }
export function isOre(typeId) { return ORE_RE.test(typeId); }
export function isWood(typeId) { return WOOD_RE.test(typeId); }
export function isLeaves(typeId) { return LEAVES_RE.test(typeId); }
export function isCrop(typeId) { return CROP_RE.test(typeId); }

/**
 * Returns tool family and tier needed to break efficiently.
 * tier: 0 hand, 1 wood/gold, 2 stone, 3 iron, 4 diamond, 5 netherite
 */
export function toolFor(typeId) {
    if (!typeId || isUnbreakable(typeId)) return undefined;
    if (SOIL_RE.test(typeId)) return { tool: "shovel", tier: 0 };
    if (WOOD_RE.test(typeId) || LEAVES_RE.test(typeId)) return { tool: "axe", tier: 0 };
    if (/(deepslate|obsidian|ancient_debris|respawn_anchor|crying_obsidian)/.test(typeId)) return { tool: "pickaxe", tier: 1 };
    // default pickaxe
    return { tool: "pickaxe", tier: 0 };
}

/**
 * For a target block, which intermediate blocks must be cleared to reach it?
 * Example: mining block below feet requires breaking feet and head cells if solid.
 * Returns array of relative offsets that obstruct.
 */
export function obstructingCells(botPos, targetPos) {
    const obstruct = [];
    // If target is directly below bot, need to clear feet/head? Actually bot stands above.
    // If target y < bot y, and x,z same, need to check cells between.
    const dx = targetPos.x - botPos.x;
    const dy = targetPos.y - botPos.y;
    const dz = targetPos.z - botPos.z;
    // Same column below
    if (dx === 0 && dz === 0 && dy < 0) {
        for (let y = botPos.y - 1; y > targetPos.y; y--) {
            obstruct.push({ x: 0, y: y - botPos.y, z: 0 });
        }
    }
    // If target is 1 away horizontally but at feet level, need to check head clearance
    if (Math.abs(dx) + Math.abs(dz) === 1 && dy <= 0) {
        // Head cell may block line
        obstruct.push({ x: 0, y: 1, z: 0 });
    }
    return obstruct;
}

/**
 * Score for how valuable a block is for speedrun.
 * Higher = more important.
 */
export const VALUE_SCORE = {
    "minecraft:diamond": 1000,
    "minecraft:ancient_debris": 900,
    "minecraft:emerald": 800,
    "minecraft:raw_gold": 700,
    "minecraft:gold_ore": 700,
    "minecraft:raw_iron": 600,
    "minecraft:iron_ore": 600,
    "minecraft:lapis_lazuli": 500,
    "minecraft:redstone": 400,
    "minecraft:coal": 300,
    "minecraft:oak_log": 200,
    "minecraft:birch_log": 190,
    "minecraft:spruce_log": 190,
};

export function valueOf(typeId) {
    return VALUE_SCORE[typeId] ?? (isOre(typeId) ? 250 : isWood(typeId) ? 150 : 10);
}
