import { EquipmentSlot, TicksPerSecond } from "@minecraft/server";
export class InventoryData {
}
/* Maximum number of hotbar slots to manage. */ InventoryData.MaxHotbarSlots = 8;
/* Maximum number of inventory slots to manage. */ InventoryData.MaxInventorySlots = 27;
/* Priorities for determining the best tool to equip, ordered from highest to lowest. */ InventoryData.ToolPriority = [
    "netherite",
    "diamond",
    "golden",
    "iron",
    "copper",
    "stone",
    "wooden"
];
/* Priorities for determining the best armor to equip, ordered from highest to lowest. */ InventoryData.ArmorPriority = [
    "netherite",
    "diamond",
    "iron",
    "chainmail",
    "golden",
    "copper",
    "leather"
];
/** Mapping of item types to their priority arrays */ InventoryData.GearPriorities = {
    pickaxe: InventoryData.ToolPriority,
    axe: InventoryData.ToolPriority,
    shovel: InventoryData.ToolPriority,
    sword: InventoryData.ToolPriority,
    helmet: InventoryData.ArmorPriority,
    chestplate: InventoryData.ArmorPriority,
    leggings: InventoryData.ArmorPriority,
    boots: InventoryData.ArmorPriority
};
/* Mapping of equipment slots to the corresponding gear type */ InventoryData.ArmorSlotToType = {
    [EquipmentSlot.Head]: "helmet",
    [EquipmentSlot.Chest]: "chestplate",
    [EquipmentSlot.Legs]: "leggings",
    [EquipmentSlot.Feet]: "boots"
};
/** The minimum pickaxe required to harvest each mineable feature type */ InventoryData.FeatureTypeToRequiredPickaxe = {
    stone: "minecraft:wooden_pickaxe",
    coal: "minecraft:wooden_pickaxe",
    copper: "minecraft:stone_pickaxe",
    iron: "minecraft:stone_pickaxe",
    gold: "minecraft:iron_pickaxe",
    diamond: "minecraft:iron_pickaxe",
    lapis: "minecraft:stone_pickaxe",
    redstone: "minecraft:iron_pickaxe",
    emerald: "minecraft:iron_pickaxe"
};
/* Mapping of block tags to the required tool tier to mine them. */ InventoryData.TierTags = [
    [
        "minecraft:netherite_tier_destructible",
        "netherite"
    ],
    [
        "minecraft:diamond_tier_destructible",
        "diamond"
    ],
    [
        "minecraft:gold_tier_destructible",
        "golden"
    ],
    [
        "minecraft:iron_tier_destructible",
        "iron"
    ],
    //There is no copper_tier_destructible
    [
        "minecraft:stone_tier_destructible",
        "stone"
    ],
    // No `wooden_tier_destructible` tag exists
    // Fallback check uses pickaxe tag only as axe / shovel blocks tend to be destructible with fists
    [
        "minecraft:is_pickaxe_item_destructible",
        "wooden"
    ]
];
/**
     * Priorities for determining the best food to eat, ordered from highest to lowest.
     * Sorted by hearts restored. Foods with negative effects are deprioritised.
     * Source: https://minecraft.wiki/w/Food
     */ InventoryData.FoodPriority = {
    "minecraft:enchanted_golden_apple": 40,
    "minecraft:golden_apple": 30,
    "minecraft:rabbit_stew": 25,
    "minecraft:cooked_porkchop": 20,
    "minecraft:pumpkin_pie": 20,
    "minecraft:cooked_beef": 20,
    "minecraft:beetroot_soup": 15,
    "minecraft:cooked_chicken": 15,
    "minecraft:cooked_mutton": 15,
    "minecraft:cooked_salmon": 15,
    "minecraft:golden_carrot": 15,
    "minecraft:honey_bottle": 15,
    "minecraft:mushroom_stew": 15,
    "minecraft:baked_potato": 13,
    "minecraft:bread": 13,
    "minecraft:cooked_cod": 13,
    "minecraft:cooked_rabbit": 13,
    "minecraft:apple": 10,
    "minecraft:chorus_fruit": 10,
    "minecraft:carrot": 8,
    "minecraft:beef": 8,
    "minecraft:porkchop": 8,
    "minecraft:rabbit": 8,
    "minecraft:cookie": 5,
    "minecraft:glow_berries": 5,
    "minecraft:melon_slice": 5,
    "minecraft:cod": 5,
    "minecraft:mutton": 5,
    "minecraft:salmon": 5,
    "minecraft:sweet_berries": 5,
    "minecraft:beetroot": 3,
    "minecraft:dried_kelp": 3,
    "minecraft:potato": 3,
    "minecraft:tropical_fish": 3,
    "minecraft:chicken": 5
};
/**
     * Mapping of tool tiers and their mining efficiency multiplier.
     * Source: https://minecraft.wiki/w/Breaking#Mining_efficiency
     */ InventoryData.MiningEfficiency = {
    netherite: 9,
    diamond: 8,
    golden: 12,
    iron: 6,
    copper: 5,
    stone: 4,
    wooden: 2
};
/**
     * Base time to break a block with the proper tool. Used in the actual duration calculation.
     * Source: https://minecraft.wiki/w/Breaking#Mining_efficiency
     */ InventoryData.BaseBreakDuration = 1.5 * TicksPerSecond;
/**
     * Base time to break a block without the proper tool.
     * Source: https://minecraft.wiki/w/Breaking#Mining_efficiency
     */ InventoryData.BaseBreakDurationWithoutProperTool = 5 * TicksPerSecond;
/** Exact item type ID to value score */ InventoryData.ExactItemValues = {
    "minecraft:torch": 8,
    "minecraft:crafting_table": 8,
    "minecraft:furnace": 8,
    "minecraft:coal": 6,
    "minecraft:redstone": 5,
    "minecraft:lapis_lazuli": 5,
    "minecraft:stone": 4,
    "minecraft:cobblestone": 4,
    "minecraft:deepslate": 4,
    "minecraft:stick": 3,
    "minecraft:dirt": 2
};
/** Substring patterns to value score, checked in order (first match wins) */ InventoryData.SubstringItemValues = [
    [
        "diamond",
        10
    ],
    [
        "emerald",
        10
    ],
    [
        "golden",
        7
    ],
    [
        "gold",
        7
    ],
    [
        "iron",
        6
    ],
    [
        "copper",
        5
    ],
    [
        "chainmail",
        5
    ],
    [
        "leather",
        4
    ],
    [
        "stone_",
        4
    ],
    [
        "log",
        3
    ],
    [
        "planks",
        3
    ],
    [
        "wooden",
        3
    ]
];
/** Default value score for items not listed above. */ InventoryData.DefaultItemValue = 1;
/** Lists of blocks in order of priority to be used for pathing.
     * The boolean indicates whether the block is usable for bridging (true) or only usable for pillaring (false) */ InventoryData.PathingBlockPriorities = {
    "minecraft:dirt": true,
    "minecraft:cobblestone": true,
    "minecraft:cobbled_deepslate": true,
    "minecraft:mud": true,
    "minecraft:clay": true,
    "minecraft:stone": true,
    "minecraft:smooth_stone": true,
    "minecraft:granite": true,
    "minecraft:polished_granite": true,
    "minecraft:diorite": true,
    "minecraft:polished_diorite": true,
    "minecraft:andesite": true,
    "minecraft:polished_andesite": true,
    "minecraft:deepslate": true,
    "minecraft:polished_deepslate": true,
    "minecraft:stone_bricks": true,
    "minecraft:tuff": true,
    "minecraft:polished_tuff": true,
    "minecraft:calcite": true,
    "minecraft:dripstone_block": true,
    "minecraft:basalt": true,
    "minecraft:smooth_basalt": true,
    "minecraft:blackstone": true,
    "minecraft:netherrack": true,
    "minecraft:oak_planks": true,
    "minecraft:spruce_planks": true,
    "minecraft:birch_planks": true,
    "minecraft:jungle_planks": true,
    "minecraft:acacia_planks": true,
    "minecraft:dark_oak_planks": true,
    "minecraft:mangrove_planks": true,
    "minecraft:cherry_planks": true,
    "minecraft:pale_oak_planks": true,
    "minecraft:bamboo_planks": true,
    "minecraft:bamboo_mosaic": true,
    "minecraft:crimson_planks": true,
    "minecraft:warped_planks": true,
    "minecraft:oak_log": true,
    "minecraft:spruce_log": true,
    "minecraft:birch_log": true,
    "minecraft:jungle_log": true,
    "minecraft:acacia_log": true,
    "minecraft:dark_oak_log": true,
    "minecraft:mangrove_log": true,
    "minecraft:cherry_log": true,
    "minecraft:pale_oak_log": true,
    "minecraft:stripped_oak_log": true,
    "minecraft:stripped_spruce_log": true,
    "minecraft:stripped_birch_log": true,
    "minecraft:stripped_jungle_log": true,
    "minecraft:stripped_acacia_log": true,
    "minecraft:stripped_dark_oak_log": true,
    "minecraft:stripped_mangrove_log": true,
    "minecraft:stripped_cherry_log": true,
    "minecraft:stripped_pale_oak_log": true,
    "minecraft:crimson_stem": true,
    "minecraft:warped_stem": true,
    "minecraft:stripped_crimson_stem": true,
    "minecraft:stripped_warped_stem": true,
    "minecraft:bamboo_block": true,
    "minecraft:stripped_bamboo_block": true,
    "minecraft:cinnabar": true,
    "minecraft:cinnabar_stairs": false,
    "minecraft:cinnabar_wall": false,
    "minecraft:polished_cinnabar": true,
    "minecraft:polished_cinnabar_stairs": false,
    "minecraft:polished_cinnabar_wall": false,
    "minecraft:cinnabar_bricks": true,
    "minecraft:cinnabar_brick_stairs": false,
    "minecraft:cinnabar_brick_wall": false,
    "minecraft:chiseled_cinnabar": true,
    "minecraft:sulfur": true,
    "minecraft:sulfur_stairs": false,
    "minecraft:sulfur_wall": false,
    "minecraft:polished_sulfur": true,
    "minecraft:polished_sulfur_stairs": false,
    "minecraft:polished_sulfur_wall": false,
    "minecraft:sulfur_bricks": true,
    "minecraft:sulfur_brick_stairs": false,
    "minecraft:sulfur_brick_wall": false,
    "minecraft:chiseled_sulfur": true,
    "minecraft:potent_sulfur": true,
    "minecraft:sulfur_spike": false,
    "minecraft:sand": false,
    "minecraft:red_sand": false,
    "minecraft:gravel": false,
    "minecraft:suspicious_sand": false,
    "minecraft:suspicious_gravel": false,
    "minecraft:white_concrete_powder": false,
    "minecraft:orange_concrete_powder": false,
    "minecraft:magenta_concrete_powder": false,
    "minecraft:light_blue_concrete_powder": false,
    "minecraft:yellow_concrete_powder": false,
    "minecraft:lime_concrete_powder": false,
    "minecraft:pink_concrete_powder": false,
    "minecraft:gray_concrete_powder": false,
    "minecraft:light_gray_concrete_powder": false,
    "minecraft:cyan_concrete_powder": false,
    "minecraft:purple_concrete_powder": false,
    "minecraft:blue_concrete_powder": false,
    "minecraft:brown_concrete_powder": false,
    "minecraft:green_concrete_powder": false,
    "minecraft:red_concrete_powder": false,
    "minecraft:black_concrete_powder": false,
    "minecraft:anvil": false,
    "minecraft:chipped_anvil": false,
    "minecraft:damaged_anvil": false,
    "minecraft:dragon_egg": false,
    "minecraft:pointed_dripstone": false,
    "minecraft:scaffolding": false,
    "minecraft:snow_layer": false
};
/** When smelting outside of crafting, the order of priority for which materials to smelt first */ InventoryData.SmeltingPriority = [
    //Food
    "minecraft:porkchop",
    "minecraft:beef",
    "minecraft:mutton",
    "minecraft:chicken",
    "minecraft:salmon",
    "minecraft:cod",
    "minecraft:rabbit",
    "minecraft:potato",
    //Ores
    "minecraft:raw_gold",
    "minecraft:raw_iron",
    "minecraft:raw_copper"
];
/** The number of ticks to wait before allowing an AIP to pick up a item that an AIP threw. */ InventoryData.ThrownItemCooldown = 5 * TicksPerSecond;

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkludmVudG9yeURhdGEudHMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgRXF1aXBtZW50U2xvdCwgVGlja3NQZXJTZWNvbmQgfSBmcm9tIFwiQG1pbmVjcmFmdC9zZXJ2ZXJcIjtcclxuaW1wb3J0IHsgRmVhdHVyZUlkZW50aWZpZXIgfSBmcm9tIFwiRmVhdHVyZUNhY2hlL1R5cGVzXCI7XHJcblxyXG5leHBvcnQgY2xhc3MgSW52ZW50b3J5RGF0YSB7XHJcbiAgICAvKiBNYXhpbXVtIG51bWJlciBvZiBob3RiYXIgc2xvdHMgdG8gbWFuYWdlLiAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBNYXhIb3RiYXJTbG90czogbnVtYmVyID0gODtcclxuXHJcbiAgICAvKiBNYXhpbXVtIG51bWJlciBvZiBpbnZlbnRvcnkgc2xvdHMgdG8gbWFuYWdlLiAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBNYXhJbnZlbnRvcnlTbG90czogbnVtYmVyID0gMjc7XHJcblxyXG4gICAgLyogUHJpb3JpdGllcyBmb3IgZGV0ZXJtaW5pbmcgdGhlIGJlc3QgdG9vbCB0byBlcXVpcCwgb3JkZXJlZCBmcm9tIGhpZ2hlc3QgdG8gbG93ZXN0LiAqL1xyXG4gICAgcHVibGljIHN0YXRpYyByZWFkb25seSBUb29sUHJpb3JpdHkgPSBbXCJuZXRoZXJpdGVcIiwgXCJkaWFtb25kXCIsIFwiZ29sZGVuXCIsIFwiaXJvblwiLCBcImNvcHBlclwiLCBcInN0b25lXCIsIFwid29vZGVuXCJdO1xyXG5cclxuICAgIC8qIFByaW9yaXRpZXMgZm9yIGRldGVybWluaW5nIHRoZSBiZXN0IGFybW9yIHRvIGVxdWlwLCBvcmRlcmVkIGZyb20gaGlnaGVzdCB0byBsb3dlc3QuICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHJlYWRvbmx5IEFybW9yUHJpb3JpdHkgPSBbXCJuZXRoZXJpdGVcIiwgXCJkaWFtb25kXCIsIFwiaXJvblwiLCBcImNoYWlubWFpbFwiLCBcImdvbGRlblwiLCBcImNvcHBlclwiLCBcImxlYXRoZXJcIl07XHJcblxyXG4gICAgLyoqIE1hcHBpbmcgb2YgaXRlbSB0eXBlcyB0byB0aGVpciBwcmlvcml0eSBhcnJheXMgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgR2VhclByaW9yaXRpZXM6IFJlY29yZDxzdHJpbmcsIHN0cmluZ1tdPiA9IHtcclxuICAgICAgICBwaWNrYXhlOiBJbnZlbnRvcnlEYXRhLlRvb2xQcmlvcml0eSxcclxuICAgICAgICBheGU6IEludmVudG9yeURhdGEuVG9vbFByaW9yaXR5LFxyXG4gICAgICAgIHNob3ZlbDogSW52ZW50b3J5RGF0YS5Ub29sUHJpb3JpdHksXHJcbiAgICAgICAgc3dvcmQ6IEludmVudG9yeURhdGEuVG9vbFByaW9yaXR5LFxyXG4gICAgICAgIGhlbG1ldDogSW52ZW50b3J5RGF0YS5Bcm1vclByaW9yaXR5LFxyXG4gICAgICAgIGNoZXN0cGxhdGU6IEludmVudG9yeURhdGEuQXJtb3JQcmlvcml0eSxcclxuICAgICAgICBsZWdnaW5nczogSW52ZW50b3J5RGF0YS5Bcm1vclByaW9yaXR5LFxyXG4gICAgICAgIGJvb3RzOiBJbnZlbnRvcnlEYXRhLkFybW9yUHJpb3JpdHksXHJcbiAgICB9O1xyXG5cclxuICAgIC8qIE1hcHBpbmcgb2YgZXF1aXBtZW50IHNsb3RzIHRvIHRoZSBjb3JyZXNwb25kaW5nIGdlYXIgdHlwZSAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBBcm1vclNsb3RUb1R5cGU6IFBhcnRpYWw8UmVjb3JkPEVxdWlwbWVudFNsb3QsIHN0cmluZz4+ID0ge1xyXG4gICAgICAgIFtFcXVpcG1lbnRTbG90LkhlYWRdOiBcImhlbG1ldFwiLFxyXG4gICAgICAgIFtFcXVpcG1lbnRTbG90LkNoZXN0XTogXCJjaGVzdHBsYXRlXCIsXHJcbiAgICAgICAgW0VxdWlwbWVudFNsb3QuTGVnc106IFwibGVnZ2luZ3NcIixcclxuICAgICAgICBbRXF1aXBtZW50U2xvdC5GZWV0XTogXCJib290c1wiLFxyXG4gICAgfTtcclxuXHJcbiAgICAvKiogVGhlIG1pbmltdW0gcGlja2F4ZSByZXF1aXJlZCB0byBoYXJ2ZXN0IGVhY2ggbWluZWFibGUgZmVhdHVyZSB0eXBlICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHJlYWRvbmx5IEZlYXR1cmVUeXBlVG9SZXF1aXJlZFBpY2theGU6IFBhcnRpYWw8UmVjb3JkPEZlYXR1cmVJZGVudGlmaWVyLCBzdHJpbmc+PiA9IHtcclxuICAgICAgICBzdG9uZTogXCJtaW5lY3JhZnQ6d29vZGVuX3BpY2theGVcIixcclxuICAgICAgICBjb2FsOiBcIm1pbmVjcmFmdDp3b29kZW5fcGlja2F4ZVwiLFxyXG4gICAgICAgIGNvcHBlcjogXCJtaW5lY3JhZnQ6c3RvbmVfcGlja2F4ZVwiLFxyXG4gICAgICAgIGlyb246IFwibWluZWNyYWZ0OnN0b25lX3BpY2theGVcIixcclxuICAgICAgICBnb2xkOiBcIm1pbmVjcmFmdDppcm9uX3BpY2theGVcIixcclxuICAgICAgICBkaWFtb25kOiBcIm1pbmVjcmFmdDppcm9uX3BpY2theGVcIixcclxuICAgICAgICBsYXBpczogXCJtaW5lY3JhZnQ6c3RvbmVfcGlja2F4ZVwiLFxyXG4gICAgICAgIHJlZHN0b25lOiBcIm1pbmVjcmFmdDppcm9uX3BpY2theGVcIixcclxuICAgICAgICBlbWVyYWxkOiBcIm1pbmVjcmFmdDppcm9uX3BpY2theGVcIixcclxuICAgIH07XHJcblxyXG4gICAgLyogTWFwcGluZyBvZiBibG9jayB0YWdzIHRvIHRoZSByZXF1aXJlZCB0b29sIHRpZXIgdG8gbWluZSB0aGVtLiAqL1xyXG4gICAgcHVibGljIHN0YXRpYyByZWFkb25seSBUaWVyVGFnczogW3RhZzogc3RyaW5nLCB0aWVyOiBzdHJpbmddW10gPSBbXHJcbiAgICAgICAgW1wibWluZWNyYWZ0Om5ldGhlcml0ZV90aWVyX2Rlc3RydWN0aWJsZVwiLCBcIm5ldGhlcml0ZVwiXSxcclxuICAgICAgICBbXCJtaW5lY3JhZnQ6ZGlhbW9uZF90aWVyX2Rlc3RydWN0aWJsZVwiLCBcImRpYW1vbmRcIl0sXHJcbiAgICAgICAgW1wibWluZWNyYWZ0OmdvbGRfdGllcl9kZXN0cnVjdGlibGVcIiwgXCJnb2xkZW5cIl0sXHJcbiAgICAgICAgW1wibWluZWNyYWZ0Omlyb25fdGllcl9kZXN0cnVjdGlibGVcIiwgXCJpcm9uXCJdLFxyXG4gICAgICAgIC8vVGhlcmUgaXMgbm8gY29wcGVyX3RpZXJfZGVzdHJ1Y3RpYmxlXHJcbiAgICAgICAgW1wibWluZWNyYWZ0OnN0b25lX3RpZXJfZGVzdHJ1Y3RpYmxlXCIsIFwic3RvbmVcIl0sXHJcbiAgICAgICAgLy8gTm8gYHdvb2Rlbl90aWVyX2Rlc3RydWN0aWJsZWAgdGFnIGV4aXN0c1xyXG4gICAgICAgIC8vIEZhbGxiYWNrIGNoZWNrIHVzZXMgcGlja2F4ZSB0YWcgb25seSBhcyBheGUgLyBzaG92ZWwgYmxvY2tzIHRlbmQgdG8gYmUgZGVzdHJ1Y3RpYmxlIHdpdGggZmlzdHNcclxuICAgICAgICBbXCJtaW5lY3JhZnQ6aXNfcGlja2F4ZV9pdGVtX2Rlc3RydWN0aWJsZVwiLCBcIndvb2RlblwiXSxcclxuICAgIF07XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBQcmlvcml0aWVzIGZvciBkZXRlcm1pbmluZyB0aGUgYmVzdCBmb29kIHRvIGVhdCwgb3JkZXJlZCBmcm9tIGhpZ2hlc3QgdG8gbG93ZXN0LlxyXG4gICAgICogU29ydGVkIGJ5IGhlYXJ0cyByZXN0b3JlZC4gRm9vZHMgd2l0aCBuZWdhdGl2ZSBlZmZlY3RzIGFyZSBkZXByaW9yaXRpc2VkLlxyXG4gICAgICogU291cmNlOiBodHRwczovL21pbmVjcmFmdC53aWtpL3cvRm9vZFxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHJlYWRvbmx5IEZvb2RQcmlvcml0eTogUmVjb3JkPHN0cmluZywgbnVtYmVyPiA9IHtcclxuICAgICAgICBcIm1pbmVjcmFmdDplbmNoYW50ZWRfZ29sZGVuX2FwcGxlXCI6IDQwLFxyXG4gICAgICAgIFwibWluZWNyYWZ0OmdvbGRlbl9hcHBsZVwiOiAzMCxcclxuICAgICAgICBcIm1pbmVjcmFmdDpyYWJiaXRfc3Rld1wiOiAyNSxcclxuICAgICAgICBcIm1pbmVjcmFmdDpjb29rZWRfcG9ya2Nob3BcIjogMjAsXHJcbiAgICAgICAgXCJtaW5lY3JhZnQ6cHVtcGtpbl9waWVcIjogMjAsXHJcbiAgICAgICAgXCJtaW5lY3JhZnQ6Y29va2VkX2JlZWZcIjogMjAsXHJcbiAgICAgICAgXCJtaW5lY3JhZnQ6YmVldHJvb3Rfc291cFwiOiAxNSxcclxuICAgICAgICBcIm1pbmVjcmFmdDpjb29rZWRfY2hpY2tlblwiOiAxNSxcclxuICAgICAgICBcIm1pbmVjcmFmdDpjb29rZWRfbXV0dG9uXCI6IDE1LFxyXG4gICAgICAgIFwibWluZWNyYWZ0OmNvb2tlZF9zYWxtb25cIjogMTUsXHJcbiAgICAgICAgXCJtaW5lY3JhZnQ6Z29sZGVuX2NhcnJvdFwiOiAxNSxcclxuICAgICAgICBcIm1pbmVjcmFmdDpob25leV9ib3R0bGVcIjogMTUsXHJcbiAgICAgICAgXCJtaW5lY3JhZnQ6bXVzaHJvb21fc3Rld1wiOiAxNSxcclxuICAgICAgICBcIm1pbmVjcmFmdDpiYWtlZF9wb3RhdG9cIjogMTMsXHJcbiAgICAgICAgXCJtaW5lY3JhZnQ6YnJlYWRcIjogMTMsXHJcbiAgICAgICAgXCJtaW5lY3JhZnQ6Y29va2VkX2NvZFwiOiAxMyxcclxuICAgICAgICBcIm1pbmVjcmFmdDpjb29rZWRfcmFiYml0XCI6IDEzLFxyXG4gICAgICAgIFwibWluZWNyYWZ0OmFwcGxlXCI6IDEwLFxyXG4gICAgICAgIFwibWluZWNyYWZ0OmNob3J1c19mcnVpdFwiOiAxMCxcclxuICAgICAgICBcIm1pbmVjcmFmdDpjYXJyb3RcIjogOCxcclxuICAgICAgICBcIm1pbmVjcmFmdDpiZWVmXCI6IDgsXHJcbiAgICAgICAgXCJtaW5lY3JhZnQ6cG9ya2Nob3BcIjogOCxcclxuICAgICAgICBcIm1pbmVjcmFmdDpyYWJiaXRcIjogOCxcclxuICAgICAgICBcIm1pbmVjcmFmdDpjb29raWVcIjogNSxcclxuICAgICAgICBcIm1pbmVjcmFmdDpnbG93X2JlcnJpZXNcIjogNSxcclxuICAgICAgICBcIm1pbmVjcmFmdDptZWxvbl9zbGljZVwiOiA1LFxyXG4gICAgICAgIFwibWluZWNyYWZ0OmNvZFwiOiA1LFxyXG4gICAgICAgIFwibWluZWNyYWZ0Om11dHRvblwiOiA1LFxyXG4gICAgICAgIFwibWluZWNyYWZ0OnNhbG1vblwiOiA1LFxyXG4gICAgICAgIFwibWluZWNyYWZ0OnN3ZWV0X2JlcnJpZXNcIjogNSxcclxuICAgICAgICBcIm1pbmVjcmFmdDpiZWV0cm9vdFwiOiAzLFxyXG4gICAgICAgIFwibWluZWNyYWZ0OmRyaWVkX2tlbHBcIjogMyxcclxuICAgICAgICBcIm1pbmVjcmFmdDpwb3RhdG9cIjogMyxcclxuICAgICAgICBcIm1pbmVjcmFmdDp0cm9waWNhbF9maXNoXCI6IDMsXHJcbiAgICAgICAgXCJtaW5lY3JhZnQ6Y2hpY2tlblwiOiA1LFxyXG4gICAgfTtcclxuXHJcbiAgICAvKipcclxuICAgICAqIE1hcHBpbmcgb2YgdG9vbCB0aWVycyBhbmQgdGhlaXIgbWluaW5nIGVmZmljaWVuY3kgbXVsdGlwbGllci5cclxuICAgICAqIFNvdXJjZTogaHR0cHM6Ly9taW5lY3JhZnQud2lraS93L0JyZWFraW5nI01pbmluZ19lZmZpY2llbmN5XHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgTWluaW5nRWZmaWNpZW5jeTogUmVjb3JkPHN0cmluZywgbnVtYmVyPiA9IHtcclxuICAgICAgICBuZXRoZXJpdGU6IDksXHJcbiAgICAgICAgZGlhbW9uZDogOCxcclxuICAgICAgICBnb2xkZW46IDEyLFxyXG4gICAgICAgIGlyb246IDYsXHJcbiAgICAgICAgY29wcGVyOiA1LFxyXG4gICAgICAgIHN0b25lOiA0LFxyXG4gICAgICAgIHdvb2RlbjogMixcclxuICAgIH07XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBCYXNlIHRpbWUgdG8gYnJlYWsgYSBibG9jayB3aXRoIHRoZSBwcm9wZXIgdG9vbC4gVXNlZCBpbiB0aGUgYWN0dWFsIGR1cmF0aW9uIGNhbGN1bGF0aW9uLlxyXG4gICAgICogU291cmNlOiBodHRwczovL21pbmVjcmFmdC53aWtpL3cvQnJlYWtpbmcjTWluaW5nX2VmZmljaWVuY3lcclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyByZWFkb25seSBCYXNlQnJlYWtEdXJhdGlvbiA9IDEuNSAqIFRpY2tzUGVyU2Vjb25kO1xyXG4gICAgLyoqXHJcbiAgICAgKiBCYXNlIHRpbWUgdG8gYnJlYWsgYSBibG9jayB3aXRob3V0IHRoZSBwcm9wZXIgdG9vbC5cclxuICAgICAqIFNvdXJjZTogaHR0cHM6Ly9taW5lY3JhZnQud2lraS93L0JyZWFraW5nI01pbmluZ19lZmZpY2llbmN5XHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgQmFzZUJyZWFrRHVyYXRpb25XaXRob3V0UHJvcGVyVG9vbCA9IDUgKiBUaWNrc1BlclNlY29uZDtcclxuXHJcbiAgICAvKiogRXhhY3QgaXRlbSB0eXBlIElEIHRvIHZhbHVlIHNjb3JlICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHJlYWRvbmx5IEV4YWN0SXRlbVZhbHVlczogUmVjb3JkPHN0cmluZywgbnVtYmVyPiA9IHtcclxuICAgICAgICBcIm1pbmVjcmFmdDp0b3JjaFwiOiA4LFxyXG4gICAgICAgIFwibWluZWNyYWZ0OmNyYWZ0aW5nX3RhYmxlXCI6IDgsXHJcbiAgICAgICAgXCJtaW5lY3JhZnQ6ZnVybmFjZVwiOiA4LFxyXG4gICAgICAgIFwibWluZWNyYWZ0OmNvYWxcIjogNixcclxuICAgICAgICBcIm1pbmVjcmFmdDpyZWRzdG9uZVwiOiA1LFxyXG4gICAgICAgIFwibWluZWNyYWZ0OmxhcGlzX2xhenVsaVwiOiA1LFxyXG4gICAgICAgIFwibWluZWNyYWZ0OnN0b25lXCI6IDQsXHJcbiAgICAgICAgXCJtaW5lY3JhZnQ6Y29iYmxlc3RvbmVcIjogNCxcclxuICAgICAgICBcIm1pbmVjcmFmdDpkZWVwc2xhdGVcIjogNCxcclxuICAgICAgICBcIm1pbmVjcmFmdDpzdGlja1wiOiAzLFxyXG4gICAgICAgIFwibWluZWNyYWZ0OmRpcnRcIjogMixcclxuICAgIH07XHJcblxyXG4gICAgLyoqIFN1YnN0cmluZyBwYXR0ZXJucyB0byB2YWx1ZSBzY29yZSwgY2hlY2tlZCBpbiBvcmRlciAoZmlyc3QgbWF0Y2ggd2lucykgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgU3Vic3RyaW5nSXRlbVZhbHVlczogW3N1YnN0cmluZzogc3RyaW5nLCB2YWx1ZTogbnVtYmVyXVtdID0gW1xyXG4gICAgICAgIFtcImRpYW1vbmRcIiwgMTBdLFxyXG4gICAgICAgIFtcImVtZXJhbGRcIiwgMTBdLFxyXG4gICAgICAgIFtcImdvbGRlblwiLCA3XSxcclxuICAgICAgICBbXCJnb2xkXCIsIDddLFxyXG4gICAgICAgIFtcImlyb25cIiwgNl0sXHJcbiAgICAgICAgW1wiY29wcGVyXCIsIDVdLFxyXG4gICAgICAgIFtcImNoYWlubWFpbFwiLCA1XSxcclxuICAgICAgICBbXCJsZWF0aGVyXCIsIDRdLFxyXG4gICAgICAgIFtcInN0b25lX1wiLCA0XSxcclxuICAgICAgICBbXCJsb2dcIiwgM10sXHJcbiAgICAgICAgW1wicGxhbmtzXCIsIDNdLFxyXG4gICAgICAgIFtcIndvb2RlblwiLCAzXSxcclxuICAgIF07XHJcblxyXG4gICAgLyoqIERlZmF1bHQgdmFsdWUgc2NvcmUgZm9yIGl0ZW1zIG5vdCBsaXN0ZWQgYWJvdmUuICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHJlYWRvbmx5IERlZmF1bHRJdGVtVmFsdWUgPSAxO1xyXG5cclxuICAgIC8qKiBMaXN0cyBvZiBibG9ja3MgaW4gb3JkZXIgb2YgcHJpb3JpdHkgdG8gYmUgdXNlZCBmb3IgcGF0aGluZy5cclxuICAgICAqIFRoZSBib29sZWFuIGluZGljYXRlcyB3aGV0aGVyIHRoZSBibG9jayBpcyB1c2FibGUgZm9yIGJyaWRnaW5nICh0cnVlKSBvciBvbmx5IHVzYWJsZSBmb3IgcGlsbGFyaW5nIChmYWxzZSkgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgUGF0aGluZ0Jsb2NrUHJpb3JpdGllczogUmVjb3JkPHN0cmluZywgYm9vbGVhbj4gPSB7XHJcbiAgICAgICAgXCJtaW5lY3JhZnQ6ZGlydFwiOiB0cnVlLFxyXG4gICAgICAgIFwibWluZWNyYWZ0OmNvYmJsZXN0b25lXCI6IHRydWUsXHJcbiAgICAgICAgXCJtaW5lY3JhZnQ6Y29iYmxlZF9kZWVwc2xhdGVcIjogdHJ1ZSxcclxuICAgICAgICBcIm1pbmVjcmFmdDptdWRcIjogdHJ1ZSxcclxuICAgICAgICBcIm1pbmVjcmFmdDpjbGF5XCI6IHRydWUsXHJcbiAgICAgICAgXCJtaW5lY3JhZnQ6c3RvbmVcIjogdHJ1ZSxcclxuICAgICAgICBcIm1pbmVjcmFmdDpzbW9vdGhfc3RvbmVcIjogdHJ1ZSxcclxuICAgICAgICBcIm1pbmVjcmFmdDpncmFuaXRlXCI6IHRydWUsXHJcbiAgICAgICAgXCJtaW5lY3JhZnQ6cG9saXNoZWRfZ3Jhbml0ZVwiOiB0cnVlLFxyXG4gICAgICAgIFwibWluZWNyYWZ0OmRpb3JpdGVcIjogdHJ1ZSxcclxuICAgICAgICBcIm1pbmVjcmFmdDpwb2xpc2hlZF9kaW9yaXRlXCI6IHRydWUsXHJcbiAgICAgICAgXCJtaW5lY3JhZnQ6YW5kZXNpdGVcIjogdHJ1ZSxcclxuICAgICAgICBcIm1pbmVjcmFmdDpwb2xpc2hlZF9hbmRlc2l0ZVwiOiB0cnVlLFxyXG4gICAgICAgIFwibWluZWNyYWZ0OmRlZXBzbGF0ZVwiOiB0cnVlLFxyXG4gICAgICAgIFwibWluZWNyYWZ0OnBvbGlzaGVkX2RlZXBzbGF0ZVwiOiB0cnVlLFxyXG4gICAgICAgIFwibWluZWNyYWZ0OnN0b25lX2JyaWNrc1wiOiB0cnVlLFxyXG4gICAgICAgIFwibWluZWNyYWZ0OnR1ZmZcIjogdHJ1ZSxcclxuICAgICAgICBcIm1pbmVjcmFmdDpwb2xpc2hlZF90dWZmXCI6IHRydWUsXHJcbiAgICAgICAgXCJtaW5lY3JhZnQ6Y2FsY2l0ZVwiOiB0cnVlLFxyXG4gICAgICAgIFwibWluZWNyYWZ0OmRyaXBzdG9uZV9ibG9ja1wiOiB0cnVlLFxyXG4gICAgICAgIFwibWluZWNyYWZ0OmJhc2FsdFwiOiB0cnVlLFxyXG4gICAgICAgIFwibWluZWNyYWZ0OnNtb290aF9iYXNhbHRcIjogdHJ1ZSxcclxuICAgICAgICBcIm1pbmVjcmFmdDpibGFja3N0b25lXCI6IHRydWUsXHJcbiAgICAgICAgXCJtaW5lY3JhZnQ6bmV0aGVycmFja1wiOiB0cnVlLFxyXG4gICAgICAgIFwibWluZWNyYWZ0Om9ha19wbGFua3NcIjogdHJ1ZSxcclxuICAgICAgICBcIm1pbmVjcmFmdDpzcHJ1Y2VfcGxhbmtzXCI6IHRydWUsXHJcbiAgICAgICAgXCJtaW5lY3JhZnQ6YmlyY2hfcGxhbmtzXCI6IHRydWUsXHJcbiAgICAgICAgXCJtaW5lY3JhZnQ6anVuZ2xlX3BsYW5rc1wiOiB0cnVlLFxyXG4gICAgICAgIFwibWluZWNyYWZ0OmFjYWNpYV9wbGFua3NcIjogdHJ1ZSxcclxuICAgICAgICBcIm1pbmVjcmFmdDpkYXJrX29ha19wbGFua3NcIjogdHJ1ZSxcclxuICAgICAgICBcIm1pbmVjcmFmdDptYW5ncm92ZV9wbGFua3NcIjogdHJ1ZSxcclxuICAgICAgICBcIm1pbmVjcmFmdDpjaGVycnlfcGxhbmtzXCI6IHRydWUsXHJcbiAgICAgICAgXCJtaW5lY3JhZnQ6cGFsZV9vYWtfcGxhbmtzXCI6IHRydWUsXHJcbiAgICAgICAgXCJtaW5lY3JhZnQ6YmFtYm9vX3BsYW5rc1wiOiB0cnVlLFxyXG4gICAgICAgIFwibWluZWNyYWZ0OmJhbWJvb19tb3NhaWNcIjogdHJ1ZSxcclxuICAgICAgICBcIm1pbmVjcmFmdDpjcmltc29uX3BsYW5rc1wiOiB0cnVlLFxyXG4gICAgICAgIFwibWluZWNyYWZ0OndhcnBlZF9wbGFua3NcIjogdHJ1ZSxcclxuICAgICAgICBcIm1pbmVjcmFmdDpvYWtfbG9nXCI6IHRydWUsXHJcbiAgICAgICAgXCJtaW5lY3JhZnQ6c3BydWNlX2xvZ1wiOiB0cnVlLFxyXG4gICAgICAgIFwibWluZWNyYWZ0OmJpcmNoX2xvZ1wiOiB0cnVlLFxyXG4gICAgICAgIFwibWluZWNyYWZ0Omp1bmdsZV9sb2dcIjogdHJ1ZSxcclxuICAgICAgICBcIm1pbmVjcmFmdDphY2FjaWFfbG9nXCI6IHRydWUsXHJcbiAgICAgICAgXCJtaW5lY3JhZnQ6ZGFya19vYWtfbG9nXCI6IHRydWUsXHJcbiAgICAgICAgXCJtaW5lY3JhZnQ6bWFuZ3JvdmVfbG9nXCI6IHRydWUsXHJcbiAgICAgICAgXCJtaW5lY3JhZnQ6Y2hlcnJ5X2xvZ1wiOiB0cnVlLFxyXG4gICAgICAgIFwibWluZWNyYWZ0OnBhbGVfb2FrX2xvZ1wiOiB0cnVlLFxyXG4gICAgICAgIFwibWluZWNyYWZ0OnN0cmlwcGVkX29ha19sb2dcIjogdHJ1ZSxcclxuICAgICAgICBcIm1pbmVjcmFmdDpzdHJpcHBlZF9zcHJ1Y2VfbG9nXCI6IHRydWUsXHJcbiAgICAgICAgXCJtaW5lY3JhZnQ6c3RyaXBwZWRfYmlyY2hfbG9nXCI6IHRydWUsXHJcbiAgICAgICAgXCJtaW5lY3JhZnQ6c3RyaXBwZWRfanVuZ2xlX2xvZ1wiOiB0cnVlLFxyXG4gICAgICAgIFwibWluZWNyYWZ0OnN0cmlwcGVkX2FjYWNpYV9sb2dcIjogdHJ1ZSxcclxuICAgICAgICBcIm1pbmVjcmFmdDpzdHJpcHBlZF9kYXJrX29ha19sb2dcIjogdHJ1ZSxcclxuICAgICAgICBcIm1pbmVjcmFmdDpzdHJpcHBlZF9tYW5ncm92ZV9sb2dcIjogdHJ1ZSxcclxuICAgICAgICBcIm1pbmVjcmFmdDpzdHJpcHBlZF9jaGVycnlfbG9nXCI6IHRydWUsXHJcbiAgICAgICAgXCJtaW5lY3JhZnQ6c3RyaXBwZWRfcGFsZV9vYWtfbG9nXCI6IHRydWUsXHJcbiAgICAgICAgXCJtaW5lY3JhZnQ6Y3JpbXNvbl9zdGVtXCI6IHRydWUsXHJcbiAgICAgICAgXCJtaW5lY3JhZnQ6d2FycGVkX3N0ZW1cIjogdHJ1ZSxcclxuICAgICAgICBcIm1pbmVjcmFmdDpzdHJpcHBlZF9jcmltc29uX3N0ZW1cIjogdHJ1ZSxcclxuICAgICAgICBcIm1pbmVjcmFmdDpzdHJpcHBlZF93YXJwZWRfc3RlbVwiOiB0cnVlLFxyXG4gICAgICAgIFwibWluZWNyYWZ0OmJhbWJvb19ibG9ja1wiOiB0cnVlLFxyXG4gICAgICAgIFwibWluZWNyYWZ0OnN0cmlwcGVkX2JhbWJvb19ibG9ja1wiOiB0cnVlLFxyXG4gICAgICAgIFwibWluZWNyYWZ0OmNpbm5hYmFyXCI6IHRydWUsXHJcbiAgICAgICAgXCJtaW5lY3JhZnQ6Y2lubmFiYXJfc3RhaXJzXCI6IGZhbHNlLFxyXG4gICAgICAgIFwibWluZWNyYWZ0OmNpbm5hYmFyX3dhbGxcIjogZmFsc2UsXHJcbiAgICAgICAgXCJtaW5lY3JhZnQ6cG9saXNoZWRfY2lubmFiYXJcIjogdHJ1ZSxcclxuICAgICAgICBcIm1pbmVjcmFmdDpwb2xpc2hlZF9jaW5uYWJhcl9zdGFpcnNcIjogZmFsc2UsXHJcbiAgICAgICAgXCJtaW5lY3JhZnQ6cG9saXNoZWRfY2lubmFiYXJfd2FsbFwiOiBmYWxzZSxcclxuICAgICAgICBcIm1pbmVjcmFmdDpjaW5uYWJhcl9icmlja3NcIjogdHJ1ZSxcclxuICAgICAgICBcIm1pbmVjcmFmdDpjaW5uYWJhcl9icmlja19zdGFpcnNcIjogZmFsc2UsXHJcbiAgICAgICAgXCJtaW5lY3JhZnQ6Y2lubmFiYXJfYnJpY2tfd2FsbFwiOiBmYWxzZSxcclxuICAgICAgICBcIm1pbmVjcmFmdDpjaGlzZWxlZF9jaW5uYWJhclwiOiB0cnVlLFxyXG4gICAgICAgIFwibWluZWNyYWZ0OnN1bGZ1clwiOiB0cnVlLFxyXG4gICAgICAgIFwibWluZWNyYWZ0OnN1bGZ1cl9zdGFpcnNcIjogZmFsc2UsXHJcbiAgICAgICAgXCJtaW5lY3JhZnQ6c3VsZnVyX3dhbGxcIjogZmFsc2UsXHJcbiAgICAgICAgXCJtaW5lY3JhZnQ6cG9saXNoZWRfc3VsZnVyXCI6IHRydWUsXHJcbiAgICAgICAgXCJtaW5lY3JhZnQ6cG9saXNoZWRfc3VsZnVyX3N0YWlyc1wiOiBmYWxzZSxcclxuICAgICAgICBcIm1pbmVjcmFmdDpwb2xpc2hlZF9zdWxmdXJfd2FsbFwiOiBmYWxzZSxcclxuICAgICAgICBcIm1pbmVjcmFmdDpzdWxmdXJfYnJpY2tzXCI6IHRydWUsXHJcbiAgICAgICAgXCJtaW5lY3JhZnQ6c3VsZnVyX2JyaWNrX3N0YWlyc1wiOiBmYWxzZSxcclxuICAgICAgICBcIm1pbmVjcmFmdDpzdWxmdXJfYnJpY2tfd2FsbFwiOiBmYWxzZSxcclxuICAgICAgICBcIm1pbmVjcmFmdDpjaGlzZWxlZF9zdWxmdXJcIjogdHJ1ZSxcclxuICAgICAgICBcIm1pbmVjcmFmdDpwb3RlbnRfc3VsZnVyXCI6IHRydWUsXHJcbiAgICAgICAgXCJtaW5lY3JhZnQ6c3VsZnVyX3NwaWtlXCI6IGZhbHNlLFxyXG4gICAgICAgIFwibWluZWNyYWZ0OnNhbmRcIjogZmFsc2UsXHJcbiAgICAgICAgXCJtaW5lY3JhZnQ6cmVkX3NhbmRcIjogZmFsc2UsXHJcbiAgICAgICAgXCJtaW5lY3JhZnQ6Z3JhdmVsXCI6IGZhbHNlLFxyXG4gICAgICAgIFwibWluZWNyYWZ0OnN1c3BpY2lvdXNfc2FuZFwiOiBmYWxzZSxcclxuICAgICAgICBcIm1pbmVjcmFmdDpzdXNwaWNpb3VzX2dyYXZlbFwiOiBmYWxzZSxcclxuICAgICAgICBcIm1pbmVjcmFmdDp3aGl0ZV9jb25jcmV0ZV9wb3dkZXJcIjogZmFsc2UsXHJcbiAgICAgICAgXCJtaW5lY3JhZnQ6b3JhbmdlX2NvbmNyZXRlX3Bvd2RlclwiOiBmYWxzZSxcclxuICAgICAgICBcIm1pbmVjcmFmdDptYWdlbnRhX2NvbmNyZXRlX3Bvd2RlclwiOiBmYWxzZSxcclxuICAgICAgICBcIm1pbmVjcmFmdDpsaWdodF9ibHVlX2NvbmNyZXRlX3Bvd2RlclwiOiBmYWxzZSxcclxuICAgICAgICBcIm1pbmVjcmFmdDp5ZWxsb3dfY29uY3JldGVfcG93ZGVyXCI6IGZhbHNlLFxyXG4gICAgICAgIFwibWluZWNyYWZ0OmxpbWVfY29uY3JldGVfcG93ZGVyXCI6IGZhbHNlLFxyXG4gICAgICAgIFwibWluZWNyYWZ0OnBpbmtfY29uY3JldGVfcG93ZGVyXCI6IGZhbHNlLFxyXG4gICAgICAgIFwibWluZWNyYWZ0OmdyYXlfY29uY3JldGVfcG93ZGVyXCI6IGZhbHNlLFxyXG4gICAgICAgIFwibWluZWNyYWZ0OmxpZ2h0X2dyYXlfY29uY3JldGVfcG93ZGVyXCI6IGZhbHNlLFxyXG4gICAgICAgIFwibWluZWNyYWZ0OmN5YW5fY29uY3JldGVfcG93ZGVyXCI6IGZhbHNlLFxyXG4gICAgICAgIFwibWluZWNyYWZ0OnB1cnBsZV9jb25jcmV0ZV9wb3dkZXJcIjogZmFsc2UsXHJcbiAgICAgICAgXCJtaW5lY3JhZnQ6Ymx1ZV9jb25jcmV0ZV9wb3dkZXJcIjogZmFsc2UsXHJcbiAgICAgICAgXCJtaW5lY3JhZnQ6YnJvd25fY29uY3JldGVfcG93ZGVyXCI6IGZhbHNlLFxyXG4gICAgICAgIFwibWluZWNyYWZ0OmdyZWVuX2NvbmNyZXRlX3Bvd2RlclwiOiBmYWxzZSxcclxuICAgICAgICBcIm1pbmVjcmFmdDpyZWRfY29uY3JldGVfcG93ZGVyXCI6IGZhbHNlLFxyXG4gICAgICAgIFwibWluZWNyYWZ0OmJsYWNrX2NvbmNyZXRlX3Bvd2RlclwiOiBmYWxzZSxcclxuICAgICAgICBcIm1pbmVjcmFmdDphbnZpbFwiOiBmYWxzZSxcclxuICAgICAgICBcIm1pbmVjcmFmdDpjaGlwcGVkX2FudmlsXCI6IGZhbHNlLFxyXG4gICAgICAgIFwibWluZWNyYWZ0OmRhbWFnZWRfYW52aWxcIjogZmFsc2UsXHJcbiAgICAgICAgXCJtaW5lY3JhZnQ6ZHJhZ29uX2VnZ1wiOiBmYWxzZSxcclxuICAgICAgICBcIm1pbmVjcmFmdDpwb2ludGVkX2RyaXBzdG9uZVwiOiBmYWxzZSxcclxuICAgICAgICBcIm1pbmVjcmFmdDpzY2FmZm9sZGluZ1wiOiBmYWxzZSxcclxuICAgICAgICBcIm1pbmVjcmFmdDpzbm93X2xheWVyXCI6IGZhbHNlLFxyXG4gICAgfTtcclxuXHJcbiAgICAvKiogV2hlbiBzbWVsdGluZyBvdXRzaWRlIG9mIGNyYWZ0aW5nLCB0aGUgb3JkZXIgb2YgcHJpb3JpdHkgZm9yIHdoaWNoIG1hdGVyaWFscyB0byBzbWVsdCBmaXJzdCAqL1xyXG4gICAgcHVibGljIHN0YXRpYyByZWFkb25seSBTbWVsdGluZ1ByaW9yaXR5OiBzdHJpbmdbXSA9IFtcclxuICAgICAgICAvL0Zvb2RcclxuICAgICAgICBcIm1pbmVjcmFmdDpwb3JrY2hvcFwiLFxyXG4gICAgICAgIFwibWluZWNyYWZ0OmJlZWZcIixcclxuICAgICAgICBcIm1pbmVjcmFmdDptdXR0b25cIixcclxuICAgICAgICBcIm1pbmVjcmFmdDpjaGlja2VuXCIsXHJcbiAgICAgICAgXCJtaW5lY3JhZnQ6c2FsbW9uXCIsXHJcbiAgICAgICAgXCJtaW5lY3JhZnQ6Y29kXCIsXHJcbiAgICAgICAgXCJtaW5lY3JhZnQ6cmFiYml0XCIsXHJcbiAgICAgICAgXCJtaW5lY3JhZnQ6cG90YXRvXCIsXHJcbiAgICAgICAgLy9PcmVzXHJcbiAgICAgICAgXCJtaW5lY3JhZnQ6cmF3X2dvbGRcIixcclxuICAgICAgICBcIm1pbmVjcmFmdDpyYXdfaXJvblwiLFxyXG4gICAgICAgIFwibWluZWNyYWZ0OnJhd19jb3BwZXJcIixcclxuICAgIF07XHJcblxyXG4gICAgLyoqIFRoZSBudW1iZXIgb2YgdGlja3MgdG8gd2FpdCBiZWZvcmUgYWxsb3dpbmcgYW4gQUlQIHRvIHBpY2sgdXAgYSBpdGVtIHRoYXQgYW4gQUlQIHRocmV3LiAqL1xyXG4gICAgcHVibGljIHN0YXRpYyByZWFkb25seSBUaHJvd25JdGVtQ29vbGRvd24gPSA1ICogVGlja3NQZXJTZWNvbmQ7XHJcbn1cclxuIl0sIm5hbWVzIjpbIkVxdWlwbWVudFNsb3QiLCJUaWNrc1BlclNlY29uZCIsIkludmVudG9yeURhdGEiLCJNYXhIb3RiYXJTbG90cyIsIk1heEludmVudG9yeVNsb3RzIiwiVG9vbFByaW9yaXR5IiwiQXJtb3JQcmlvcml0eSIsIkdlYXJQcmlvcml0aWVzIiwicGlja2F4ZSIsImF4ZSIsInNob3ZlbCIsInN3b3JkIiwiaGVsbWV0IiwiY2hlc3RwbGF0ZSIsImxlZ2dpbmdzIiwiYm9vdHMiLCJBcm1vclNsb3RUb1R5cGUiLCJIZWFkIiwiQ2hlc3QiLCJMZWdzIiwiRmVldCIsIkZlYXR1cmVUeXBlVG9SZXF1aXJlZFBpY2theGUiLCJzdG9uZSIsImNvYWwiLCJjb3BwZXIiLCJpcm9uIiwiZ29sZCIsImRpYW1vbmQiLCJsYXBpcyIsInJlZHN0b25lIiwiZW1lcmFsZCIsIlRpZXJUYWdzIiwiRm9vZFByaW9yaXR5IiwiTWluaW5nRWZmaWNpZW5jeSIsIm5ldGhlcml0ZSIsImdvbGRlbiIsIndvb2RlbiIsIkJhc2VCcmVha0R1cmF0aW9uIiwiQmFzZUJyZWFrRHVyYXRpb25XaXRob3V0UHJvcGVyVG9vbCIsIkV4YWN0SXRlbVZhbHVlcyIsIlN1YnN0cmluZ0l0ZW1WYWx1ZXMiLCJEZWZhdWx0SXRlbVZhbHVlIiwiUGF0aGluZ0Jsb2NrUHJpb3JpdGllcyIsIlNtZWx0aW5nUHJpb3JpdHkiLCJUaHJvd25JdGVtQ29vbGRvd24iXSwibWFwcGluZ3MiOiJBQUFBLFNBQVNBLGFBQWEsRUFBRUMsY0FBYyxRQUFRLG9CQUFvQjtBQUdsRSxPQUFPLE1BQU1DO0FBd1NiO0FBdlNJLDZDQUE2QyxHQURwQ0EsY0FFS0MsaUJBQXlCO0FBRXZDLGdEQUFnRCxHQUp2Q0QsY0FLS0Usb0JBQTRCO0FBRTFDLHNGQUFzRixHQVA3RUYsY0FRY0csZUFBZTtJQUFDO0lBQWE7SUFBVztJQUFVO0lBQVE7SUFBVTtJQUFTO0NBQVM7QUFFN0csdUZBQXVGLEdBVjlFSCxjQVdjSSxnQkFBZ0I7SUFBQztJQUFhO0lBQVc7SUFBUTtJQUFhO0lBQVU7SUFBVTtDQUFVO0FBRW5ILG1EQUFtRCxHQWIxQ0osY0FjY0ssaUJBQTJDO0lBQzlEQyxTQUFTTixjQUFjRyxZ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