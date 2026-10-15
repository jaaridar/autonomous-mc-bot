/**
 * Omni-knowledge registry - every Bedrock block/item mapped to its best use.
 * Pure logic, no engine imports. Exhaustive Bedrock 1.21.114 knowledge.
 * The bot uses this to decide what to keep, craft, and how to use in any situation.
 */

// ===== BLOCK CATEGORIES =====
export const BLOCK_CAT = {
    WOOD: "wood", // logs, planks - fuel, building, crafting
    STONE: "stone", // cobble, stone - building, tools
    ORE: "ore", // iron, diamond - valuable
    SOIL: "soil", // dirt, sand - building, farming
    LEAVES: "leaves",
    CROPS: "crops",
    LIQUID: "liquid",
    HAZARD: "hazard",
    BUILDING: "building",
    DECOR: "decor",
    REDSTONE: "redstone",
    NETHER: "nether",
    END: "end",
    PORTAL: "portal", // obsidian
};

export const ITEM_CAT = {
    TOOL: "tool", // pickaxe, axe, shovel, hoe
    WEAPON: "weapon", // sword, axe, bow, crossbow, trident
    ARMOR: "armor",
    FOOD: "food",
    MATERIAL: "material", // ingot, gem
    BUILDING: "building",
    FUEL: "fuel",
    REDSTONE: "redstone",
    TRANSPORT: "transport", // boat, saddle, etc
    UTILITY: "utility", // bucket, flint_and_steel
    TREASURE: "treasure", // emerald, diamond, netherite
    BLOCK: "block",
};

// ===== EXHAUSTIVE BLOCK DATABASE =====
// Key: typeId, Value: { cat, hardness, tool, tier, fuel, buildStrength, blast, flammable, valuable, uses, retainScore }
export const BLOCKS = {
    // Wood - CRITICAL: first priority, quick tools
    "minecraft:oak_log": { cat: BLOCK_CAT.WOOD, hardness: 2, tool: "axe", tier: 0, fuel: 15, build: 5, retain: 90, uses: ["planks","crafting_table","tools","fuel","building"], quickTool: true },
    "minecraft:birch_log": { cat: BLOCK_CAT.WOOD, hardness: 2, tool: "axe", tier: 0, fuel: 15, build: 5, retain: 85, uses: ["planks","tools","fuel"], quickTool: true },
    "minecraft:spruce_log": { cat: BLOCK_CAT.WOOD, hardness: 2, tool: "axe", tier: 0, fuel: 15, build: 5, retain: 85, uses: ["planks","tools"], quickTool: true },
    "minecraft:jungle_log": { cat: BLOCK_CAT.WOOD, hardness: 2, tool: "axe", tier: 0, fuel: 15, build: 5, retain: 85, uses: ["planks"], quickTool: true },
    "minecraft:acacia_log": { cat: BLOCK_CAT.WOOD, hardness: 2, tool: "axe", tier: 0, fuel: 15, build: 5, retain: 80, uses: ["planks"], quickTool: true },
    "minecraft:dark_oak_log": { cat: BLOCK_CAT.WOOD, hardness: 2, tool: "axe", tier: 0, fuel: 15, build: 5, retain: 80, uses: ["planks"], quickTool: true },
    "minecraft:mangrove_log": { cat: BLOCK_CAT.WOOD, hardness: 2, tool: "axe", tier: 0, fuel: 15, build: 5, retain: 80, uses: ["planks"], quickTool: true },
    "minecraft:cherry_log": { cat: BLOCK_CAT.WOOD, hardness: 2, tool: "axe", tier: 0, fuel: 15, build: 5, retain: 80, uses: ["planks"], quickTool: true },
    "minecraft:pale_oak_log": { cat: BLOCK_CAT.WOOD, hardness: 2, tool: "axe", tier: 0, fuel: 15, build: 5, retain: 80, uses: ["planks"], quickTool: true },
    "minecraft:crimson_stem": { cat: BLOCK_CAT.WOOD, hardness: 2, tool: "axe", tier: 0, fuel: 0, build: 5, retain: 70, uses: ["planks"], quickTool: false },
    "minecraft:warped_stem": { cat: BLOCK_CAT.WOOD, hardness: 2, tool: "axe", tier: 0, fuel: 0, build: 5, retain: 70, uses: ["planks"], quickTool: false },
    "minecraft:bamboo_block": { cat: BLOCK_CAT.WOOD, hardness: 1, tool: "axe", tier: 0, fuel: 15, build: 4, retain: 60, uses: ["planks","fuel"], quickTool: true },

    "minecraft:oak_planks": { cat: BLOCK_CAT.WOOD, hardness: 2, tool: "axe", tier: 0, fuel: 15, build: 5, retain: 80, uses: ["crafting_table","tools","building","fuel"], quickTool: true },
    "minecraft:crafting_table": { cat: BLOCK_CAT.BUILDING, hardness: 2.5, tool: "axe", tier: 0, fuel: 15, build: 10, retain: 95, uses: ["crafting","fuel"], critical: true },

    // Stone - second priority after wood
    "minecraft:stone": { cat: BLOCK_CAT.STONE, hardness: 1.5, tool: "pickaxe", tier: 1, build: 8, retain: 80, uses: ["cobblestone","tools","building","furnace"], quickTool: true },
    "minecraft:cobblestone": { cat: BLOCK_CAT.STONE, hardness: 2, tool: "pickaxe", tier: 1, build: 8, retain: 85, uses: ["tools","furnace","building","bridging"], quickTool: true, bridge: true },
    "minecraft:cobbled_deepslate": { cat: BLOCK_CAT.STONE, hardness: 3.5, tool: "pickaxe", tier: 1, build: 8, retain: 80, uses: ["tools","building","bridging"], bridge: true },
    "minecraft:deepslate": { cat: BLOCK_CAT.STONE, hardness: 3, tool: "pickaxe", tier: 1, build: 8, retain: 75, uses: ["building"], bridge: true },

    // Ores - retain always
    "minecraft:coal_ore": { cat: BLOCK_CAT.ORE, hardness: 3, tool: "pickaxe", tier: 1, retain: 85, valuable: 70, uses: ["torch","fuel","smelting"], quickTool: false },
    "minecraft:deepslate_coal_ore": { cat: BLOCK_CAT.ORE, hardness: 4.5, tool: "pickaxe", tier: 1, retain: 85, valuable: 70, uses: ["torch","fuel"] },
    "minecraft:iron_ore": { cat: BLOCK_CAT.ORE, hardness: 3, tool: "pickaxe", tier: 2, retain: 95, valuable: 90, uses: ["iron_ingot","tools","armor","bucket","shield"], critical: true },
    "minecraft:deepslate_iron_ore": { cat: BLOCK_CAT.ORE, hardness: 4.5, tool: "pickaxe", tier: 2, retain: 95, valuable: 90, uses: ["iron_ingot"], critical: true },
    "minecraft:raw_iron": { cat: BLOCK_CAT.ORE, hardness: 0, retain: 95, valuable: 90, uses: ["iron_ingot"], critical: true },
    "minecraft:copper_ore": { cat: BLOCK_CAT.ORE, hardness: 3, tool: "pickaxe", tier: 2, retain: 60, valuable: 40, uses: ["copper_ingot","building"] },
    "minecraft:gold_ore": { cat: BLOCK_CAT.ORE, hardness: 3, tool: "pickaxe", tier: 3, retain: 80, valuable: 70, uses: ["gold_ingot","golden_apple"] },
    "minecraft:deepslate_gold_ore": { cat: BLOCK_CAT.ORE, hardness: 4.5, tool: "pickaxe", tier: 3, retain: 80, valuable: 70, uses: ["gold_ingot"] },
    "minecraft:redstone_ore": { cat: BLOCK_CAT.ORE, hardness: 3, tool: "pickaxe", tier: 3, retain: 70, valuable: 60, uses: ["redstone","mechanism"] },
    "minecraft:lapis_ore": { cat: BLOCK_CAT.ORE, hardness: 3, tool: "pickaxe", tier: 2, retain: 75, valuable: 65, uses: ["enchanting","dye"] },
    "minecraft:diamond_ore": { cat: BLOCK_CAT.ORE, hardness: 3, tool: "pickaxe", tier: 3, retain: 100, valuable: 100, uses: ["diamond","tools","armor","enchanting_table"], critical: true },
    "minecraft:deepslate_diamond_ore": { cat: BLOCK_CAT.ORE, hardness: 4.5, tool: "pickaxe", tier: 3, retain: 100, valuable: 100, uses: ["diamond"], critical: true },
    "minecraft:emerald_ore": { cat: BLOCK_CAT.ORE, hardness: 3, tool: "pickaxe", tier: 3, retain: 85, valuable: 80, uses: ["emerald","villager_trade"] },
    "minecraft:ancient_debris": { cat: BLOCK_CAT.ORE, hardness: 30, tool: "pickaxe", tier: 4, retain: 100, valuable: 100, uses: ["netherite"], critical: true },

    // Soil/building - good for bridging
    "minecraft:dirt": { cat: BLOCK_CAT.SOIL, hardness: 0.5, tool: "shovel", tier: 0, build: 3, retain: 40, uses: ["bridging","farming","scaffold"], bridge: true, scaffold: true },
    "minecraft:coarse_dirt": { cat: BLOCK_CAT.SOIL, hardness: 0.5, tool: "shovel", tier: 0, build: 3, retain: 35, uses: ["bridging"], bridge: true },
    "minecraft:grass_block": { cat: BLOCK_CAT.SOIL, hardness: 0.6, tool: "shovel", tier: 0, build: 3, retain: 40, uses: ["building"], bridge: true },
    "minecraft:sand": { cat: BLOCK_CAT.SOIL, hardness: 0.5, tool: "shovel", tier: 0, build: 2, retain: 45, uses: ["glass","bridging","tnt"], bridge: true, falling: true },
    "minecraft:gravel": { cat: BLOCK_CAT.SOIL, hardness: 0.6, tool: "shovel", tier: 0, build: 2, retain: 50, uses: ["flint","bridging","concrete"], bridge: true, falling: true },
    "minecraft:clay": { cat: BLOCK_CAT.SOIL, hardness: 0.6, tool: "shovel", tier: 0, build: 4, retain: 40, uses: ["bricks","terracotta"] },

    // Critical utility
    "minecraft:obsidian": { cat: BLOCK_CAT.PORTAL, hardness: 50, tool: "pickaxe", tier: 4, build: 10, blast: 1200, retain: 100, valuable: 95, uses: ["portal","enchanting_table","beacon"], critical: true, portal: true },
    "minecraft:crying_obsidian": { cat: BLOCK_CAT.PORTAL, hardness: 50, tool: "pickaxe", tier: 4, build: 10, retain: 90, valuable: 85, uses: ["respawn_anchor","portal_alt"] },
    "minecraft:lava": { cat: BLOCK_CAT.LIQUID, hardness: 0, retain: 80, valuable: 75, uses: ["obsidian","portal","fuel","trap","light"], critical: true, hazard: true, portal: true },
    "minecraft:flowing_lava": { cat: BLOCK_CAT.LIQUID, hardness: 0, retain: 80, uses: ["obsidian","fuel"], hazard: true, portal: true },
    "minecraft:water": { cat: BLOCK_CAT.LIQUID, hardness: 0, retain: 85, valuable: 80, uses: ["obsidian","farming","clutch","escape","boat"], critical: true },
    "minecraft:flowing_water": { cat: BLOCK_CAT.LIQUID, hardness: 0, retain: 85, uses: ["farming","escape"] },

    // Wool - sheep important for bed
    "minecraft:white_wool": { cat: BLOCK_CAT.BUILDING, hardness: 0.8, tool: "shears", tier: 0, build: 2, flammable: true, retain: 70, uses: ["bed","building"], sheep: true },
    "minecraft:bed": { cat: BLOCK_CAT.BUILDING, hardness: 0.2, retain: 80, uses: ["sleep","spawn","nether_bomb"], critical: true },

    // Leaves, crops
    "minecraft:oak_leaves": { cat: BLOCK_CAT.LEAVES, hardness: 0.2, tool: "shears", tier: 0, flammable: true, retain: 20, uses: ["sapling","compost"] },
    "minecraft:wheat": { cat: BLOCK_CAT.CROPS, hardness: 0, retain: 50, uses: ["bread","hay","breeding"] },
    "minecraft:hay_block": { cat: BLOCK_CAT.CROPS, hardness: 0.5, retain: 60, uses: ["food","breeding","fall_cushion"] },
};

// ===== ITEM DATABASE =====
export const ITEMS = {
    // Tools - QUICK TOOL PRIORITY #1
    "minecraft:wooden_pickaxe": { cat: ITEM_CAT.TOOL, tier: 1, durability: 59, retain: 70, uses: ["mine_stone","quick_tool"], craft: ["planks","stick"], priority: 100, quickTool: true },
    "minecraft:wooden_axe": { cat: ITEM_CAT.TOOL, tier: 1, durability: 59, retain: 70, uses: ["chop_wood","weapon","quick_tool"], craft: ["planks","stick"], priority: 95, quickTool: true },
    "minecraft:wooden_sword": { cat: ITEM_CAT.WEAPON, tier: 1, durability: 59, retain: 60, uses: ["combat","quick_weapon"], craft: ["planks","stick"], priority: 90, quickTool: true },
    "minecraft:wooden_shovel": { cat: ITEM_CAT.TOOL, tier: 1, durability: 59, retain: 50, uses: ["dig_dirt"], craft: ["planks","stick"], priority: 40 },
    "minecraft:stone_pickaxe": { cat: ITEM_CAT.TOOL, tier: 2, durability: 131, retain: 80, uses: ["mine_iron","mine_copper"], craft: ["cobblestone","stick"], priority: 95, quickTool: true },
    "minecraft:stone_axe": { cat: ITEM_CAT.TOOL, tier: 2, durability: 131, retain: 75, uses: ["chop","weapon"], craft: ["cobblestone","stick"], priority: 80, quickTool: true },
    "minecraft:stone_sword": { cat: ITEM_CAT.WEAPON, tier: 2, durability: 131, retain: 75, uses: ["combat"], craft: ["cobblestone","stick"], priority: 85, quickTool: true },
    "minecraft:iron_pickaxe": { cat: ITEM_CAT.TOOL, tier: 3, durability: 250, retain: 90, uses: ["mine_diamond","mine_gold","mine_obsidian_lite"], craft: ["iron_ingot","stick"], priority: 100, critical: true },
    "minecraft:iron_axe": { cat: ITEM_CAT.TOOL, tier: 3, durability: 250, retain: 85, uses: ["chop","weapon","shield_break"], craft: ["iron_ingot","stick"], priority: 85 },
    "minecraft:iron_sword": { cat: ITEM_CAT.WEAPON, tier: 3, durability: 250, retain: 90, uses: ["combat","main_weapon"], craft: ["iron_ingot","stick"], priority: 95, critical: true },
    "minecraft:iron_shovel": { cat: ITEM_CAT.TOOL, tier: 3, durability: 250, retain: 70, uses: ["dig"], craft: ["iron_ingot","stick"], priority: 60 },
    "minecraft:diamond_pickaxe": { cat: ITEM_CAT.TOOL, tier: 4, durability: 1561, retain: 100, uses: ["mine_obsidian","mine_ancient_debris"], craft: ["diamond","stick"], priority: 100, critical: true },
    "minecraft:diamond_sword": { cat: ITEM_CAT.WEAPON, tier: 4, durability: 1561, retain: 100, uses: ["combat","best_weapon"], craft: ["diamond","stick"], priority: 100, critical: true },
    "minecraft:netherite_pickaxe": { cat: ITEM_CAT.TOOL, tier: 5, durability: 2031, retain: 100, uses: ["mine_all"], priority: 100, critical: true },
    "minecraft:netherite_sword": { cat: ITEM_CAT.WEAPON, tier: 5, durability: 2031, retain: 100, uses: ["combat"], priority: 100, critical: true },
    "minecraft:shield": { cat: ITEM_CAT.TOOL, tier: 3, durability: 336, retain: 95, uses: ["block_arrows","block_melee","skeleton_swarm"], craft: ["planks","iron_ingot"], priority: 90, critical: true },
    "minecraft:bow": { cat: ITEM_CAT.WEAPON, tier: 2, durability: 384, retain: 80, uses: ["ranged","skeleton","ghast","blaze"], craft: ["stick","string"], priority: 80 },
    "minecraft:crossbow": { cat: ITEM_CAT.WEAPON, tier: 2, durability: 465, retain: 75, uses: ["ranged"], priority: 70 },

    // Materials - retain important
    "minecraft:stick": { cat: ITEM_CAT.MATERIAL, retain: 80, uses: ["tools","torch","ladder"], craft: ["planks"], priority: 90, quickTool: true },
    "minecraft:coal": { cat: ITEM_CAT.MATERIAL, retain: 85, uses: ["torch","fuel","smelting"], priority: 85, fuel: 80 },
    "minecraft:charcoal": { cat: ITEM_CAT.MATERIAL, retain: 80, uses: ["torch","fuel"], priority: 80, fuel: 80 },
    "minecraft:iron_ingot": { cat: ITEM_CAT.MATERIAL, retain: 95, uses: ["tools","armor","bucket","shield","flint_and_steel"], priority: 100, critical: true },
    "minecraft:raw_iron": { cat: ITEM_CAT.MATERIAL, retain: 90, uses: ["iron_ingot"], priority: 95, critical: true },
    "minecraft:gold_ingot": { cat: ITEM_CAT.MATERIAL, retain: 75, uses: ["golden_apple","barter"], priority: 70 },
    "minecraft:diamond": { cat: ITEM_CAT.TREASURE, retain: 100, uses: ["tools","armor","enchanting_table","jukebox"], priority: 100, critical: true },
    "minecraft:emerald": { cat: ITEM_CAT.TREASURE, retain: 80, uses: ["villager_trade"], priority: 75 },
    "minecraft:flint": { cat: ITEM_CAT.MATERIAL, retain: 70, uses: ["flint_and_steel","arrow","fletching_table"], priority: 70 },
    "minecraft:string": { cat: ITEM_CAT.MATERIAL, retain: 75, uses: ["bow","fishing_rod","wool","scaffold"], priority: 75 },
    "minecraft:leather": { cat: ITEM_CAT.MATERIAL, retain: 60, uses: ["armor","item_frame","books"], priority: 50 },
    "minecraft:feather": { cat: ITEM_CAT.MATERIAL, retain: 65, uses: ["arrow"], priority: 60 },

    // Food
    "minecraft:bread": { cat: ITEM_CAT.FOOD, retain: 70, hunger: 5, saturation: 6, uses: ["food"], priority: 80 },
    "minecraft:cooked_beef": { cat: ITEM_CAT.FOOD, retain: 85, hunger: 8, saturation: 12.8, uses: ["food","best_food"], priority: 90 },
    "minecraft:cooked_porkchop": { cat: ITEM_CAT.FOOD, retain: 85, hunger: 8, saturation: 12.8, uses: ["food"], priority: 90 },
    "minecraft:apple": { cat: ITEM_CAT.FOOD, retain: 60, hunger: 4, uses: ["food","golden_apple"], priority: 60 },
    "minecraft:golden_apple": { cat: ITEM_CAT.FOOD, retain: 90, uses: ["heal","regen","combat"], priority: 95, critical: true },
    "minecraft:enchanted_golden_apple": { cat: ITEM_CAT.FOOD, retain: 100, uses: ["heal","boss_fight"], priority: 100, critical: true },

    // Utility - critical for portal etc
    "minecraft:bucket": { cat: ITEM_CAT.UTILITY, retain: 90, uses: ["water","lava","milk","obsidian","portal"], craft: ["iron_ingot"], priority: 95, critical: true, portal: true },
    "minecraft:water_bucket": { cat: ITEM_CAT.UTILITY, retain: 95, uses: ["obsidian","clutch","farming","escape","blaze","enderman"], priority: 100, critical: true, portal: true },
    "minecraft:lava_bucket": { cat: ITEM_CAT.UTILITY, retain: 85, uses: ["obsidian","portal","fuel","trap"], priority: 85, portal: true, fuel: 1000 },
    "minecraft:flint_and_steel": { cat: ITEM_CAT.UTILITY, retain: 90, uses: ["portal_light","fire","tnt"], craft: ["flint","iron_ingot"], priority: 90, critical: true, portal: true },
    "minecraft:torch": { cat: ITEM_CAT.UTILITY, retain: 80, uses: ["light","prevent_spawn","mark"], craft: ["stick","coal"], priority: 85 },
    "minecraft:furnace": { cat: ITEM_CAT.UTILITY, retain: 85, uses: ["smelt","cook"], craft: ["cobblestone"], priority: 85, critical: true },
    "minecraft:crafting_table": { cat: ITEM_CAT.UTILITY, retain: 95, uses: ["craft"], craft: ["planks"], priority: 100, critical: true },
    "minecraft:chest": { cat: ITEM_CAT.UTILITY, retain: 70, uses: ["storage"], craft: ["planks"], priority: 60 },
    "minecraft:bed": { cat: ITEM_CAT.UTILITY, retain: 80, uses: ["sleep","spawn","nether_bomb"], craft: ["wool","planks"], priority: 80 },
    "minecraft:boat": { cat: ITEM_CAT.TRANSPORT, retain: 70, uses: ["water_travel","escape"], craft: ["planks"], priority: 70 },
    "minecraft:oak_boat": { cat: ITEM_CAT.TRANSPORT, retain: 70, uses: ["water_travel"], priority: 70 },
    "minecraft:saddle": { cat: ITEM_CAT.TRANSPORT, retain: 75, uses: ["horse","pig","strider"], priority: 75 },

    // Portal critical
    "minecraft:obsidian": { cat: ITEM_CAT.BLOCK, retain: 100, uses: ["portal","enchanting"], priority: 100, critical: true, portal: true },

    // Treasure
    "minecraft:totem_of_undying": { cat: ITEM_CAT.TREASURE, retain: 100, uses: ["survive_death"], priority: 100, critical: true },
    "minecraft:ender_pearl": { cat: ITEM_CAT.TREASURE, retain: 90, uses: ["teleport","ender_eye","escape"], priority: 90 },
    "minecraft:blaze_rod": { cat: ITEM_CAT.TREASURE, retain: 90, uses: ["brewing","ender_eye","fuel"], priority: 90, portal: true },
    "minecraft:ender_eye": { cat: ITEM_CAT.TREASURE, retain: 95, uses: ["portal","locate_stronghold"], priority: 95, portal: true },
    "minecraft:ancient_debris": { cat: ITEM_CAT.TREASURE, retain: 100, uses: ["netherite"], priority: 100, critical: true },
    "minecraft:netherite_ingot": { cat: ITEM_CAT.TREASURE, retain: 100, uses: ["tools","armor"], priority: 100, critical: true },
    "minecraft:enchanted_book": { cat: ITEM_CAT.TREASURE, retain: 85, uses: ["enchant"], priority: 85 },
    "minecraft:name_tag": { cat: ITEM_CAT.TREASURE, retain: 60, uses: ["name_mob"], priority: 50 },
};

// ===== SITUATIONAL BEST USE =====
export const SITUATION_USE = {
    combat_melee: { best: ["minecraft:netherite_sword","minecraft:diamond_sword","minecraft:iron_sword","minecraft:stone_sword","minecraft:wooden_sword","minecraft:iron_axe"], need: "weapon" },
    combat_ranged: { best: ["minecraft:bow","minecraft:crossbow","minecraft:shield"], need: "ranged_defense" },
    combat_skeleton_swarm: { best: ["minecraft:shield","minecraft:iron_sword","minecraft:bow"], tactic: "cover_wall", need: "shield+weapon" },
    combat_blaze: { best: ["minecraft:bow","minecraft:shield","minecraft:water_bucket"], tactic: "strafe_water", need: "ranged+water" },
    combat_enderman: { best: ["minecraft:water_bucket","minecraft:shield","minecraft:iron_sword"], tactic: "low_roof_water", need: "water+low_roof" },
    combat_creeper: { best: ["minecraft:bow","minecraft:shield","minecraft:iron_sword"], tactic: "hit_and_retreat", need: "shield" },
    mining_stone: { best: ["minecraft:wooden_pickaxe"], need: "pickaxe_tier1" },
    mining_iron: { best: ["minecraft:stone_pickaxe","minecraft:iron_pickaxe"], need: "pickaxe_tier2" },
    mining_diamond: { best: ["minecraft:iron_pickaxe","minecraft:diamond_pickaxe"], need: "pickaxe_tier3" },
    mining_obsidian: { best: ["minecraft:diamond_pickaxe","minecraft:netherite_pickaxe"], need: "pickaxe_tier4" },
    bridging_gap: { best: ["minecraft:cobblestone","minecraft:dirt","minecraft:cobbled_deepslate","minecraft:oak_planks"], tactic: "arbitrary_support_check", need: "blocks" },
    bridging_lava: { best: ["minecraft:cobblestone","minecraft:stone"], tactic: "sneak_place", need: "blast_resistant" },
    pillaring_up: { best: ["minecraft:dirt","minecraft:cobblestone","minecraft:netherrack"], tactic: "jump_place", need: "blocks" },
    parkour_gap: { best: ["sprint_jump","bridge"], tactic: "momentum", need: "speed" },
    portal_lava_pool: { best: ["minecraft:water_bucket","minecraft:bucket","minecraft:obsidian"], tactic: "water_on_lava", need: "water_bucket+lava_pool", critical: true },
    portal_build: { best: ["minecraft:obsidian","minecraft:flint_and_steel","minecraft:fire_charge"], tactic: "frame_10_min", need: "obsidian_10+flint_and_steel" },
    escape_water: { best: ["minecraft:boat","minecraft:oak_boat","swim"], tactic: "boat_or_swim", need: "boat" },
    escape_lava: { best: ["minecraft:water_bucket","minecraft:fire_resistance"], tactic: "water_clutch", need: "water_bucket" },
    escape_pit: { best: ["minecraft:cobblestone","minecraft:dirt"], tactic: "pillar", need: "blocks_20+" },
    food_low: { best: ["minecraft:cooked_beef","minecraft:bread","minecraft:apple","minecraft:golden_apple"], need: "food" },
    light_dark: { best: ["minecraft:torch"], need: "torch" },
    sheep: { best: ["shears","minecraft:iron_sword"], uses: ["wool","bed","mutton"], retain: true },
    iron_ore_found: { action: "remember", priority: 95, reason: "critical for tools/armor/bucket/shield", retain: true },
    diamond_found: { action: "remember", priority: 100, reason: "critical for obsidian/endgame", retain: true },
    lava_pool_found: { action: "remember", priority: 100, reason: "portal opportunity", retain: true, portal: true },
    village_found: { action: "loot_priority", priority: 95, reason: "chests, beds, food, iron", retain: true },
    structure_found: { action: "loot_priority", priority: 90, reason: "treasure", retain: true },
};

// ===== QUICK TOOL PRIORITY - NEVER FIGHT BARE HAND =====
export const QUICK_TOOL_CHAIN = [
    { have: [], need: "minecraft:oak_log", amount: 3, craft: "minecraft:oak_planks", reason: "first wood for quick tools" },
    { have: ["minecraft:oak_planks"], need: "minecraft:crafting_table", amount: 1, craft: "table", reason: "crafting access" },
    { have: ["minecraft:oak_planks"], need: "minecraft:stick", amount: 8, craft: "sticks", reason: "tool handles" },
    { have: ["minecraft:oak_planks","minecraft:stick"], need: "minecraft:wooden_pickaxe", amount: 1, craft: "wooden_pickaxe", reason: "mine stone - priority #1" },
    { have: ["minecraft:oak_planks","minecraft:stick"], need: "minecraft:wooden_axe", amount: 1, craft: "wooden_axe", reason: "faster wood + weapon" },
    { have: ["minecraft:oak_planks","minecraft:stick"], need: "minecraft:wooden_sword", amount: 1, craft: "wooden_sword", reason: "never bare-hand" },
    { have: ["minecraft:cobblestone"], need: "minecraft:stone_pickaxe", amount: 1, craft: "stone_pickaxe", reason: "iron tier" },
    { have: ["minecraft:cobblestone"], need: "minecraft:stone_sword", amount: 1, craft: "stone_sword", reason: "better weapon" },
    { have: ["minecraft:iron_ingot"], need: "minecraft:iron_pickaxe", amount: 1, craft: "iron_pickaxe", reason: "diamond tier" },
    { have: ["minecraft:iron_ingot"], need: "minecraft:iron_sword", amount: 1, craft: "iron_sword", reason: "main weapon" },
    { have: ["minecraft:iron_ingot"], need: "minecraft:shield", amount: 1, craft: "shield", reason: "ranged defense critical" },
    { have: ["minecraft:iron_ingot"], need: "minecraft:bucket", amount: 1, craft: "bucket", reason: "water/lava for portal/clutch" },
];

// ===== RETENTION SCORING - what to keep when inventory tight =====
export const RETAIN_SCORE = {
    "minecraft:diamond": 100,
    "minecraft:netherite_ingot": 100,
    "minecraft:ancient_debris": 100,
    "minecraft:totem_of_undying": 100,
    "minecraft:enchanted_golden_apple": 100,
    "minecraft:obsidian": 95,
    "minecraft:iron_ingot": 95,
    "minecraft:raw_iron": 90,
    "minecraft:iron_pickaxe": 95,
    "minecraft:diamond_pickaxe": 100,
    "minecraft:iron_sword": 90,
    "minecraft:diamond_sword": 100,
    "minecraft:shield": 95,
    "minecraft:water_bucket": 95,
    "minecraft:bucket": 90,
    "minecraft:flint_and_steel": 90,
    "minecraft:ender_pearl": 85,
    "minecraft:blaze_rod": 85,
    "minecraft:golden_apple": 85,
    "minecraft:cooked_beef": 80,
    "minecraft:bread": 70,
    "minecraft:coal": 80,
    "minecraft:torch": 75,
    "minecraft:cobblestone": 60,
    "minecraft:oak_log": 70,
    "minecraft:dirt": 30,
    "minecraft:gravel": 40,
    "minecraft:sand": 30,
    "minecraft:rotten_flesh": 5,
    "minecraft:poisonous_potato": 2,
};

export function retainScore(typeId) {
    return RETAIN_SCORE[typeId] ?? ITEMS[typeId]?.retain ?? BLOCKS[typeId]?.retain ?? 10;
}

export function isCritical(typeId) {
    return (ITEMS[typeId]?.critical || BLOCKS[typeId]?.critical || RETAIN_SCORE[typeId] >= 90) ?? false;
}

export function isQuickTool(typeId) {
    return (ITEMS[typeId]?.quickTool || BLOCKS[typeId]?.quickTool) ?? false;
}

export function bestFor(situation) {
    return SITUATION_USE[situation] ?? null;
}

export function getBlockInfo(typeId) {
    return BLOCKS[typeId] ?? { cat: "unknown", hardness: 1, retain: 10, uses: ["unknown"] };
}

export function getItemInfo(typeId) {
    return ITEMS[typeId] ?? { cat: "unknown", retain: 10, uses: ["unknown"] };
}

export function shouldRetain(typeId, haveCount, freeSlots) {
    const score = retainScore(typeId);
    if (score >= 90) return true; // always keep critical
    if (score >= 70 && freeSlots > 2) return true;
    if (score >= 50 && freeSlots > 5) return true;
    if (score < 20 && haveCount > 16) return false; // junk
    return haveCount < 32; // default keep reasonable
}

// ===== STRUCTURE SIGNATURES =====
export const STRUCTURE_SIGS = {
    village: {
        blocks: ["minecraft:hay_block","minecraft:crafting_table","minecraft:furnace","minecraft:bed","minecraft:bell","minecraft:farmland","minecraft:composter","minecraft:blast_furnace","minecraft:smoker"],
        minMatches: 3,
        priority: 95,
        loot: ["chest","food","iron","bed","crafting_table"],
        reason: "village = free loot, beds, food, iron golem"
    },
    desert_temple: {
        blocks: ["minecraft:sandstone","minecraft:cut_sandstone","minecraft:chiseled_sandstone","minecraft:blue_terracotta","minecraft:orange_terracotta","minecraft:tnt"],
        minMatches: 4,
        priority: 90,
        loot: ["chest","tnt","treasure","bones","rotten_flesh","enchanted_book"],
        reason: "desert temple = 4 chests under floor"
    },
    jungle_temple: {
        blocks: ["minecraft:mossy_cobblestone","minecraft:cobblestone","minecraft:chiseled_stone_bricks","minecraft:lever","minecraft:tripwire_hook","minecraft:dispenser"],
        minMatches: 3,
        priority: 85,
        loot: ["chest","arrow","bones","treasure"]
    },
    shipwreck: {
        blocks: ["minecraft:stripped_oak_log","minecraft:oak_planks","minecraft:chest","minecraft:barrel"],
        minMatches: 2,
        priority: 85,
        loot: ["chest","buried_treasure_map","iron","emerald","food"]
    },
    ruined_portal: {
        blocks: ["minecraft:crying_obsidian","minecraft:obsidian","minecraft:gold_block","minecraft:netherrack","minecraft:magma_block"],
        minMatches: 2,
        priority: 100,
        loot: ["obsidian","gold","flint_and_steel","fire_charge","chest","enchanted_golden_apple"],
        reason: "ruined portal = free obsidian for portal",
        portal: true
    },
    igloo: {
        blocks: ["minecraft:snow_block","minecraft:packed_ice","minecraft:furnace","minecraft:crafting_table","minecraft:bed"],
        minMatches: 3,
        priority: 80,
        loot: ["chest","golden_apple","furnace"]
    },
    woodland_mansion: {
        blocks: ["minecraft:dark_oak_planks","minecraft:cobblestone","minecraft:dark_oak_log","minecraft:carpet"],
        minMatches: 5,
        priority: 90,
        loot: ["chest","totem","enchanted_book","rare"]
    },
    nether_fortress: {
        blocks: ["minecraft:nether_bricks","minecraft:nether_brick_fence","minecraft:soul_sand","minecraft:blaze_spawner","minecraft:chest"],
        minMatches: 3,
        priority: 95,
        loot: ["blaze_rod","nether_wart","chest","saddle","diamond"]
    },
    bastion: {
        blocks: ["minecraft:blackstone","minecraft:gilded_blackstone","minecraft:polished_blackstone_bricks","minecraft:gold_block"],
        minMatches: 3,
        priority: 95,
        loot: ["gold","netherite_scrap","ancient_debris","lodestone"]
    },
    mineshaft: {
        blocks: ["minecraft:oak_fence","minecraft:rail","minecraft:cobweb","minecraft:chest","minecraft:oak_planks"],
        minMatches: 3,
        priority: 85,
        loot: ["chest","rail","iron","gold","diamond","enchanted_book"]
    },
    lava_pool: {
        blocks: ["minecraft:lava","minecraft:obsidian","minecraft:magma_block","minecraft:basalt"],
        minMatches: 5,
        priority: 100,
        loot: ["obsidian","portal"],
        reason: "lava pool = portal if have water bucket",
        portal: true
    },
    amethyst_geode: {
        blocks: ["minecraft:amethyst_block","minecraft:budding_amethyst","minecraft:calcite","minecraft:smooth_basalt"],
        minMatches: 3,
        priority: 70,
        loot: ["amethyst_shard","spyglass"]
    },
};

export function detectStructure(blockCounts, radius) {
    const results = [];
    for (const [name, sig] of Object.entries(STRUCTURE_SIGS)) {
        let matches = 0;
        for (const block of sig.blocks) {
            if (blockCounts[block] > 0) matches++;
        }
        if (matches >= sig.minMatches) {
            results.push({ name, priority: sig.priority, matches, loot: sig.loot, reason: sig.reason, portal: sig.portal ?? false });
        }
    }
    results.sort((a,b) => b.priority - a.priority);
    return results;
}

// ===== ADAPTIVE MOB HANDLING - ANY MOB, NOT JUST LIST =====
export const MOB_ADAPTIVE = {
    // Generic handling by behavior, not hardcoded type
    isHostile: (typeId) => {
        if (!typeId) return false;
        const hostileKeywords = ["zombie","skeleton","creeper","spider","enderman","witch","blaze","ghast","slime","magma","silverfish","endermite","pillager","vindicator","evoker","vex","phantom","drowned","husk","stray","bogged","wither_skeleton","zoglin","hoglin","piglin_brute","guardian","shulker","warden","ravager","wither","ender_dragon"];
        return hostileKeywords.some(k => typeId.includes(k));
    },
    isRanged: (typeId) => {
        if (!typeId) return false;
        const ranged = ["skeleton","stray","bogged","drowned","pillager","witch","blaze","ghast","shulker","guardian","wither","evoker","illusioner"];
        return ranged.some(k => typeId.includes(k));
    },
    isExplosive: (typeId) => typeId.includes("creeper") || typeId.includes("ghast") || typeId.includes("tnt"),
    isEnderman: (typeId) => typeId.includes("enderman"),
    isFlying: (typeId) => typeId.includes("ghast") || typeId.includes("phantom") || typeId.includes("blaze") || typeId.includes("vex") || typeId.includes("bat") || typeId.includes("parrot"),
    isBoss: (typeId) => typeId.includes("wither") || typeId.includes("ender_dragon") || typeId.includes("elder_guardian") || typeId.includes("warden"),
    isFast: (typeId) => typeId.includes("spider") || typeId.includes("enderman") || typeId.includes("baby") || typeId.includes("chicken_jockey"),
    isWaterMob: (typeId) => typeId.includes("drowned") || typeId.includes("guardian"),
    isFireMob: (typeId) => typeId.includes("blaze") || typeId.includes("magma") || typeId.includes("ghast") || typeId.includes("strider"),
};

export function adaptTactic(mobType, hp, resources, count) {
    // Adaptive, works for any mob even unknown
    const isRanged = MOB_ADAPTIVE.isRanged(mobType);
    const isExplosive = MOB_ADAPTIVE.isExplosive(mobType);
    const isEnderman = MOB_ADAPTIVE.isEnderman(mobType);
    const isBoss = MOB_ADAPTIVE.isBoss(mobType);
    const isFlying = MOB_ADAPTIVE.isFlying(mobType);
    const isFast = MOB_ADAPTIVE.isFast(mobType);

    if (isBoss && hp < 16) return { action: "flee", reason: "boss no fight low hp", need: "retreat_far" };
    if (isEnderman) {
        if (resources.hasWater) return { action: "water_place", reason: "enderman weak to water", need: "water_bucket" };
        if (resources.hasBlocks) return { action: "low_roof", reason: "enderman 3 tall, build 2-high roof", need: "blocks_5" };
        return { action: "flee", reason: "enderman no water/no blocks", need: "retreat" };
    }
    if (isExplosive) return { action: "retreat_hit", reason: "explosive punish close", need: "bow_or_hit_retreat" };
    if (isRanged && count >= 4) return { action: "cover_build", reason: `ranged swarm x${count}`, need: "shield+cover" };
    if (isRanged) return { action: "rush_strafe", reason: "ranged rush with strafe", need: "shield" };
    if (isFlying) return { action: "ranged_or_cover", reason: "flying need bow or cover", need: "bow" };
    if (isFast) return { action: "pillar_or_water", reason: "fast mob pillar up", need: "blocks" };
    // Default melee
    return { action: "kite", reason: "melee kite", need: "weapon" };
}
