class BlockPlacementData {
}
/**
     * Block types that are automatically overridden when placing a new block in the same location.
     * @remark Snow layers are only overrideable depending on their permutation so it is not included in this list.
     * @remark Crops are included because they are technically replaceable; remove that section if AI players should preserve farms.
     */ BlockPlacementData.OverrideableBlocks = new Set([
    // Overworld vegetation
    "minecraft:short_grass",
    "minecraft:tall_grass",
    "minecraft:short_dry_grass",
    "minecraft:tall_dry_grass",
    "minecraft:fern",
    "minecraft:large_fern",
    "minecraft:deadbush",
    "minecraft:bush",
    "minecraft:sweet_berry_bush",
    "minecraft:leaf_litter",
    "minecraft:pink_petals",
    "minecraft:glow_lichen",
    "minecraft:resin_clump",
    "minecraft:sculk_vein",
    // Nether vegetation
    "minecraft:nether_sprouts",
    "minecraft:crimson_roots",
    "minecraft:warped_roots",
    "minecraft:crimson_fungus",
    "minecraft:warped_fungus",
    "minecraft:weeping_vines",
    "minecraft:twisting_vines",
    // Fire
    "minecraft:fire",
    "minecraft:soul_fire",
    // Fluids
    "minecraft:water",
    "minecraft:flowing_water",
    "minecraft:lava",
    "minecraft:flowing_lava",
    "minecraft:bubble_column",
    "minecraft:powder_snow"
]);
/**
     * Block types that do not occupy a full block height or otherwise cannot have torches placed on them,
     * but do allow other blocks to be placed on them.
     * @remark Slabs, stairs, trapdoors and snow layers are not included because their support depends on their permutation.
     */ BlockPlacementData.BlocksThatCannotSupportTorches = new Set([
    // Terrain / natural blocks
    "minecraft:grass_path",
    "minecraft:farmland",
    "minecraft:cactus",
    "minecraft:azalea",
    "minecraft:flowering_azalea",
    // Leaves
    "minecraft:oak_leaves",
    "minecraft:spruce_leaves",
    "minecraft:birch_leaves",
    "minecraft:jungle_leaves",
    "minecraft:acacia_leaves",
    "minecraft:dark_oak_leaves",
    "minecraft:mangrove_leaves",
    "minecraft:cherry_leaves",
    "minecraft:pale_oak_leaves",
    "minecraft:azalea_leaves",
    "minecraft:azalea_leaves_flowered",
    // Carpets
    "minecraft:white_carpet",
    "minecraft:orange_carpet",
    "minecraft:magenta_carpet",
    "minecraft:light_blue_carpet",
    "minecraft:yellow_carpet",
    "minecraft:lime_carpet",
    "minecraft:pink_carpet",
    "minecraft:gray_carpet",
    "minecraft:light_gray_carpet",
    "minecraft:cyan_carpet",
    "minecraft:purple_carpet",
    "minecraft:blue_carpet",
    "minecraft:brown_carpet",
    "minecraft:green_carpet",
    "minecraft:red_carpet",
    "minecraft:black_carpet",
    "minecraft:moss_carpet",
    "minecraft:pale_moss_carpet",
    // Eggs
    "minecraft:sniffer_egg",
    "minecraft:turtle_egg",
    "minecraft:dragon_egg",
    // Coal
    "minecraft:coal_ore",
    "minecraft:deepslate_coal_ore",
    // Copper
    "minecraft:copper_ore",
    "minecraft:deepslate_copper_ore",
    // Iron
    "minecraft:iron_ore",
    "minecraft:deepslate_iron_ore",
    // Gold
    "minecraft:gold_ore",
    "minecraft:deepslate_gold_ore",
    // Lapis Lazuli
    "minecraft:lapis_ore",
    "minecraft:deepslate_lapis_ore",
    // Redstone
    "minecraft:redstone_ore",
    "minecraft:deepslate_redstone_ore",
    "minecraft:lit_redstone_ore",
    "minecraft:lit_deepslate_redstone_ore",
    // Diamond
    "minecraft:diamond_ore",
    "minecraft:deepslate_diamond_ore",
    // Emerald
    "minecraft:emerald_ore",
    "minecraft:deepslate_emerald_ore",
    // Work Stations
    "minecraft:bed",
    "minecraft:brewing_stand",
    "minecraft:cauldron",
    "minecraft:composter",
    "minecraft:decorated_pot",
    "minecraft:enchanting_table",
    "minecraft:flower_pot",
    "minecraft:hopper",
    "minecraft:lectern",
    "minecraft:stonecutter_block",
    // Candles
    "minecraft:candle",
    "minecraft:white_candle",
    "minecraft:orange_candle",
    "minecraft:magenta_candle",
    "minecraft:light_blue_candle",
    "minecraft:yellow_candle",
    "minecraft:lime_candle",
    "minecraft:pink_candle",
    "minecraft:gray_candle",
    "minecraft:light_gray_candle",
    "minecraft:cyan_candle",
    "minecraft:purple_candle",
    "minecraft:blue_candle",
    "minecraft:brown_candle",
    "minecraft:green_candle",
    "minecraft:red_candle",
    "minecraft:black_candle",
    // Cakes
    "minecraft:cake",
    "minecraft:candle_cake",
    "minecraft:white_candle_cake",
    "minecraft:orange_candle_cake",
    "minecraft:magenta_candle_cake",
    "minecraft:light_blue_candle_cake",
    "minecraft:yellow_candle_cake",
    "minecraft:lime_candle_cake",
    "minecraft:pink_candle_cake",
    "minecraft:gray_candle_cake",
    "minecraft:light_gray_candle_cake",
    "minecraft:cyan_candle_cake",
    "minecraft:purple_candle_cake",
    "minecraft:blue_candle_cake",
    "minecraft:brown_candle_cake",
    "minecraft:green_candle_cake",
    "minecraft:red_candle_cake",
    "minecraft:black_candle_cake",
    // Misc
    "minecraft:end_portal_frame",
    "minecraft:sulfur_spike",
    "minecraft:pointed_dripstone"
]);
/** Liquid or air blocks */ BlockPlacementData.FluidBlocks = new Set([
    "minecraft:air",
    "minecraft:water",
    "minecraft:flowing_water",
    "minecraft:lava",
    "minecraft:flowing_lava"
]);
export { BlockPlacementData as default };

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkJsb2NrUGxhY2VtZW50RGF0YS50cyJdLCJzb3VyY2VzQ29udGVudCI6WyJleHBvcnQgZGVmYXVsdCBjbGFzcyBCbG9ja1BsYWNlbWVudERhdGEge1xyXG4gICAgLyoqXHJcbiAgICAgKiBCbG9jayB0eXBlcyB0aGF0IGFyZSBhdXRvbWF0aWNhbGx5IG92ZXJyaWRkZW4gd2hlbiBwbGFjaW5nIGEgbmV3IGJsb2NrIGluIHRoZSBzYW1lIGxvY2F0aW9uLlxyXG4gICAgICogQHJlbWFyayBTbm93IGxheWVycyBhcmUgb25seSBvdmVycmlkZWFibGUgZGVwZW5kaW5nIG9uIHRoZWlyIHBlcm11dGF0aW9uIHNvIGl0IGlzIG5vdCBpbmNsdWRlZCBpbiB0aGlzIGxpc3QuXHJcbiAgICAgKiBAcmVtYXJrIENyb3BzIGFyZSBpbmNsdWRlZCBiZWNhdXNlIHRoZXkgYXJlIHRlY2huaWNhbGx5IHJlcGxhY2VhYmxlOyByZW1vdmUgdGhhdCBzZWN0aW9uIGlmIEFJIHBsYXllcnMgc2hvdWxkIHByZXNlcnZlIGZhcm1zLlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHJlYWRvbmx5IE92ZXJyaWRlYWJsZUJsb2NrcyA9IG5ldyBTZXQoW1xyXG4gICAgICAgIC8vIE92ZXJ3b3JsZCB2ZWdldGF0aW9uXHJcbiAgICAgICAgXCJtaW5lY3JhZnQ6c2hvcnRfZ3Jhc3NcIixcclxuICAgICAgICBcIm1pbmVjcmFmdDp0YWxsX2dyYXNzXCIsXHJcbiAgICAgICAgXCJtaW5lY3JhZnQ6c2hvcnRfZHJ5X2dyYXNzXCIsXHJcbiAgICAgICAgXCJtaW5lY3JhZnQ6dGFsbF9kcnlfZ3Jhc3NcIixcclxuICAgICAgICBcIm1pbmVjcmFmdDpmZXJuXCIsXHJcbiAgICAgICAgXCJtaW5lY3JhZnQ6bGFyZ2VfZmVyblwiLFxyXG4gICAgICAgIFwibWluZWNyYWZ0OmRlYWRidXNoXCIsXHJcbiAgICAgICAgXCJtaW5lY3JhZnQ6YnVzaFwiLFxyXG4gICAgICAgIFwibWluZWNyYWZ0OnN3ZWV0X2JlcnJ5X2J1c2hcIixcclxuICAgICAgICBcIm1pbmVjcmFmdDpsZWFmX2xpdHRlclwiLFxyXG4gICAgICAgIFwibWluZWNyYWZ0OnBpbmtfcGV0YWxzXCIsXHJcbiAgICAgICAgXCJtaW5lY3JhZnQ6Z2xvd19saWNoZW5cIixcclxuICAgICAgICBcIm1pbmVjcmFmdDpyZXNpbl9jbHVtcFwiLFxyXG4gICAgICAgIFwibWluZWNyYWZ0OnNjdWxrX3ZlaW5cIixcclxuICAgICAgICAvLyBOZXRoZXIgdmVnZXRhdGlvblxyXG4gICAgICAgIFwibWluZWNyYWZ0Om5ldGhlcl9zcHJvdXRzXCIsXHJcbiAgICAgICAgXCJtaW5lY3JhZnQ6Y3JpbXNvbl9yb290c1wiLFxyXG4gICAgICAgIFwibWluZWNyYWZ0OndhcnBlZF9yb290c1wiLFxyXG4gICAgICAgIFwibWluZWNyYWZ0OmNyaW1zb25fZnVuZ3VzXCIsXHJcbiAgICAgICAgXCJtaW5lY3JhZnQ6d2FycGVkX2Z1bmd1c1wiLFxyXG4gICAgICAgIFwibWluZWNyYWZ0OndlZXBpbmdfdmluZXNcIixcclxuICAgICAgICBcIm1pbmVjcmFmdDp0d2lzdGluZ192aW5lc1wiLFxyXG4gICAgICAgIC8vIEZpcmVcclxuICAgICAgICBcIm1pbmVjcmFmdDpmaXJlXCIsXHJcbiAgICAgICAgXCJtaW5lY3JhZnQ6c291bF9maXJlXCIsXHJcbiAgICAgICAgLy8gRmx1aWRzXHJcbiAgICAgICAgXCJtaW5lY3JhZnQ6d2F0ZXJcIixcclxuICAgICAgICBcIm1pbmVjcmFmdDpmbG93aW5nX3dhdGVyXCIsXHJcbiAgICAgICAgXCJtaW5lY3JhZnQ6bGF2YVwiLFxyXG4gICAgICAgIFwibWluZWNyYWZ0OmZsb3dpbmdfbGF2YVwiLFxyXG4gICAgICAgIFwibWluZWNyYWZ0OmJ1YmJsZV9jb2x1bW5cIixcclxuICAgICAgICBcIm1pbmVjcmFmdDpwb3dkZXJfc25vd1wiLFxyXG4gICAgXSk7XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBCbG9jayB0eXBlcyB0aGF0IGRvIG5vdCBvY2N1cHkgYSBmdWxsIGJsb2NrIGhlaWdodCBvciBvdGhlcndpc2UgY2Fubm90IGhhdmUgdG9yY2hlcyBwbGFjZWQgb24gdGhlbSxcclxuICAgICAqIGJ1dCBkbyBhbGxvdyBvdGhlciBibG9ja3MgdG8gYmUgcGxhY2VkIG9uIHRoZW0uXHJcbiAgICAgKiBAcmVtYXJrIFNsYWJzLCBzdGFpcnMsIHRyYXBkb29ycyBhbmQgc25vdyBsYXllcnMgYXJlIG5vdCBpbmNsdWRlZCBiZWNhdXNlIHRoZWlyIHN1cHBvcnQgZGVwZW5kcyBvbiB0aGVpciBwZXJtdXRhdGlvbi5cclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyByZWFkb25seSBCbG9ja3NUaGF0Q2Fubm90U3VwcG9ydFRvcmNoZXMgPSBuZXcgU2V0KFtcclxuICAgICAgICAvLyBUZXJyYWluIC8gbmF0dXJhbCBibG9ja3NcclxuICAgICAgICBcIm1pbmVjcmFmdDpncmFzc19wYXRoXCIsXHJcbiAgICAgICAgXCJtaW5lY3JhZnQ6ZmFybWxhbmRcIixcclxuICAgICAgICBcIm1pbmVjcmFmdDpjYWN0dXNcIixcclxuICAgICAgICBcIm1pbmVjcmFmdDphemFsZWFcIixcclxuICAgICAgICBcIm1pbmVjcmFmdDpmbG93ZXJpbmdfYXphbGVhXCIsXHJcbiAgICAgICAgLy8gTGVhdmVzXHJcbiAgICAgICAgXCJtaW5lY3JhZnQ6b2FrX2xlYXZlc1wiLFxyXG4gICAgICAgIFwibWluZWNyYWZ0OnNwcnVjZV9sZWF2ZXNcIixcclxuICAgICAgICBcIm1pbmVjcmFmdDpiaXJjaF9sZWF2ZXNcIixcclxuICAgICAgICBcIm1pbmVjcmFmdDpqdW5nbGVfbGVhdmVzXCIsXHJcbiAgICAgICAgXCJtaW5lY3JhZnQ6YWNhY2lhX2xlYXZlc1wiLFxyXG4gICAgICAgIFwibWluZWNyYWZ0OmRhcmtfb2FrX2xlYXZlc1wiLFxyXG4gICAgICAgIFwibWluZWNyYWZ0Om1hbmdyb3ZlX2xlYXZlc1wiLFxyXG4gICAgICAgIFwibWluZWNyYWZ0OmNoZXJyeV9sZWF2ZXNcIixcclxuICAgICAgICBcIm1pbmVjcmFmdDpwYWxlX29ha19sZWF2ZXNcIixcclxuICAgICAgICBcIm1pbmVjcmFmdDphemFsZWFfbGVhdmVzXCIsXHJcbiAgICAgICAgXCJtaW5lY3JhZnQ6YXphbGVhX2xlYXZlc19mbG93ZXJlZFwiLFxyXG4gICAgICAgIC8vIENhcnBldHNcclxuICAgICAgICBcIm1pbmVjcmFmdDp3aGl0ZV9jYXJwZXRcIixcclxuICAgICAgICBcIm1pbmVjcmFmdDpvcmFuZ2VfY2FycGV0XCIsXHJcbiAgICAgICAgXCJtaW5lY3JhZnQ6bWFnZW50YV9jYXJwZXRcIixcclxuICAgICAgICBcIm1pbmVjcmFmdDpsaWdodF9ibHVlX2NhcnBldFwiLFxyXG4gICAgICAgIFwibWluZWNyYWZ0OnllbGxvd19jYXJwZXRcIixcclxuICAgICAgICBcIm1pbmVjcmFmdDpsaW1lX2NhcnBldFwiLFxyXG4gICAgICAgIFwibWluZWNyYWZ0OnBpbmtfY2FycGV0XCIsXHJcbiAgICAgICAgXCJtaW5lY3JhZnQ6Z3JheV9jYXJwZXRcIixcclxuICAgICAgICBcIm1pbmVjcmFmdDpsaWdodF9ncmF5X2NhcnBldFwiLFxyXG4gICAgICAgIFwibWluZWNyYWZ0OmN5YW5fY2FycGV0XCIsXHJcbiAgICAgICAgXCJtaW5lY3JhZnQ6cHVycGxlX2NhcnBldFwiLFxyXG4gICAgICAgIFwibWluZWNyYWZ0OmJsdWVfY2FycGV0XCIsXHJcbiAgICAgICAgXCJtaW5lY3JhZnQ6YnJvd25fY2FycGV0XCIsXHJcbiAgICAgICAgXCJtaW5lY3JhZnQ6Z3JlZW5fY2FycGV0XCIsXHJcbiAgICAgICAgXCJtaW5lY3JhZnQ6cmVkX2NhcnBldFwiLFxyXG4gICAgICAgIFwibWluZWNyYWZ0OmJsYWNrX2NhcnBldFwiLFxyXG4gICAgICAgIFwibWluZWNyYWZ0Om1vc3NfY2FycGV0XCIsXHJcbiAgICAgICAgXCJtaW5lY3JhZnQ6cGFsZV9tb3NzX2NhcnBldFwiLFxyXG4gICAgICAgIC8vIEVnZ3NcclxuICAgICAgICBcIm1pbmVjcmFmdDpzbmlmZmVyX2VnZ1wiLFxyXG4gICAgICAgIFwibWluZWNyYWZ0OnR1cnRsZV9lZ2dcIixcclxuICAgICAgICBcIm1pbmVjcmFmdDpkcmFnb25fZWdnXCIsXHJcbiAgICAgICAgLy8gQ29hbFxyXG4gICAgICAgIFwibWluZWNyYWZ0OmNvYWxfb3JlXCIsXHJcbiAgICAgICAgXCJtaW5lY3JhZnQ6ZGVlcHNsYXRlX2NvYWxfb3JlXCIsXHJcbiAgICAgICAgLy8gQ29wcGVyXHJcbiAgICAgICAgXCJtaW5lY3JhZnQ6Y29wcGVyX29yZVwiLFxyXG4gICAgICAgIFwibWluZWNyYWZ0OmRlZXBzbGF0ZV9jb3BwZXJfb3JlXCIsXHJcbiAgICAgICAgLy8gSXJvblxyXG4gICAgICAgIFwibWluZWNyYWZ0Omlyb25fb3JlXCIsXHJcbiAgICAgICAgXCJtaW5lY3JhZnQ6ZGVlcHNsYXRlX2lyb25fb3JlXCIsXHJcbiAgICAgICAgLy8gR29sZFxyXG4gICAgICAgIFwibWluZWNyYWZ0OmdvbGRfb3JlXCIsXHJcbiAgICAgICAgXCJtaW5lY3JhZnQ6ZGVlcHNsYXRlX2dvbGRfb3JlXCIsXHJcbiAgICAgICAgLy8gTGFwaXMgTGF6dWxpXHJcbiAgICAgICAgXCJtaW5lY3JhZnQ6bGFwaXNfb3JlXCIsXHJcbiAgICAgICAgXCJtaW5lY3JhZnQ6ZGVlcHNsYXRlX2xhcGlzX29yZVwiLFxyXG4gICAgICAgIC8vIFJlZHN0b25lXHJcbiAgICAgICAgXCJtaW5lY3JhZnQ6cmVkc3RvbmVfb3JlXCIsXHJcbiAgICAgICAgXCJtaW5lY3JhZnQ6ZGVlcHNsYXRlX3JlZHN0b25lX29yZVwiLFxyXG4gICAgICAgIFwibWluZWNyYWZ0OmxpdF9yZWRzdG9uZV9vcmVcIixcclxuICAgICAgICBcIm1pbmVjcmFmdDpsaXRfZGVlcHNsYXRlX3JlZHN0b25lX29yZVwiLFxyXG4gICAgICAgIC8vIERpYW1vbmRcclxuICAgICAgICBcIm1pbmVjcmFmdDpkaWFtb25kX29yZVwiLFxyXG4gICAgICAgIFwibWluZWNyYWZ0OmRlZXBzbGF0ZV9kaWFtb25kX29yZVwiLFxyXG4gICAgICAgIC8vIEVtZXJhbGRcclxuICAgICAgICBcIm1pbmVjcmFmdDplbWVyYWxkX29yZVwiLFxyXG4gICAgICAgIFwibWluZWNyYWZ0OmRlZXBzbGF0ZV9lbWVyYWxkX29yZVwiLFxyXG4gICAgICAgIC8vIFdvcmsgU3RhdGlvbnNcclxuICAgICAgICBcIm1pbmVjcmFmdDpiZWRcIixcclxuICAgICAgICBcIm1pbmVjcmFmdDpicmV3aW5nX3N0YW5kXCIsXHJcbiAgICAgICAgXCJtaW5lY3JhZnQ6Y2F1bGRyb25cIixcclxuICAgICAgICBcIm1pbmVjcmFmdDpjb21wb3N0ZXJcIixcclxuICAgICAgICBcIm1pbmVjcmFmdDpkZWNvcmF0ZWRfcG90XCIsXHJcbiAgICAgICAgXCJtaW5lY3JhZnQ6ZW5jaGFudGluZ190YWJsZVwiLFxyXG4gICAgICAgIFwibWluZWNyYWZ0OmZsb3dlcl9wb3RcIixcclxuICAgICAgICBcIm1pbmVjcmFmdDpob3BwZXJcIixcclxuICAgICAgICBcIm1pbmVjcmFmdDpsZWN0ZXJuXCIsXHJcbiAgICAgICAgXCJtaW5lY3JhZnQ6c3RvbmVjdXR0ZXJfYmxvY2tcIixcclxuICAgICAgICAvLyBDYW5kbGVzXHJcbiAgICAgICAgXCJtaW5lY3JhZnQ6Y2FuZGxlXCIsXHJcbiAgICAgICAgXCJtaW5lY3JhZnQ6d2hpdGVfY2FuZGxlXCIsXHJcbiAgICAgICAgXCJtaW5lY3JhZnQ6b3JhbmdlX2NhbmRsZVwiLFxyXG4gICAgICAgIFwibWluZWNyYWZ0Om1hZ2VudGFfY2FuZGxlXCIsXHJcbiAgICAgICAgXCJtaW5lY3JhZnQ6bGlnaHRfYmx1ZV9jYW5kbGVcIixcclxuICAgICAgICBcIm1pbmVjcmFmdDp5ZWxsb3dfY2FuZGxlXCIsXHJcbiAgICAgICAgXCJtaW5lY3JhZnQ6bGltZV9jYW5kbGVcIixcclxuICAgICAgICBcIm1pbmVjcmFmdDpwaW5rX2NhbmRsZVwiLFxyXG4gICAgICAgIFwibWluZWNyYWZ0OmdyYXlfY2FuZGxlXCIsXHJcbiAgICAgICAgXCJtaW5lY3JhZnQ6bGlnaHRfZ3JheV9jYW5kbGVcIixcclxuICAgICAgICBcIm1pbmVjcmFmdDpjeWFuX2NhbmRsZVwiLFxyXG4gICAgICAgIFwibWluZWNyYWZ0OnB1cnBsZV9jYW5kbGVcIixcclxuICAgICAgICBcIm1pbmVjcmFmdDpibHVlX2NhbmRsZVwiLFxyXG4gICAgICAgIFwibWluZWNyYWZ0OmJyb3duX2NhbmRsZVwiLFxyXG4gICAgICAgIFwibWluZWNyYWZ0OmdyZWVuX2NhbmRsZVwiLFxyXG4gICAgICAgIFwibWluZWNyYWZ0OnJlZF9jYW5kbGVcIixcclxuICAgICAgICBcIm1pbmVjcmFmdDpibGFja19jYW5kbGVcIixcclxuICAgICAgICAvLyBDYWtlc1xyXG4gICAgICAgIFwibWluZWNyYWZ0OmNha2VcIixcclxuICAgICAgICBcIm1pbmVjcmFmdDpjYW5kbGVfY2FrZVwiLFxyXG4gICAgICAgIFwibWluZWNyYWZ0OndoaXRlX2NhbmRsZV9jYWtlXCIsXHJcbiAgICAgICAgXCJtaW5lY3JhZnQ6b3JhbmdlX2NhbmRsZV9jYWtlXCIsXHJcbiAgICAgICAgXCJtaW5lY3JhZnQ6bWFnZW50YV9jYW5kbGVfY2FrZVwiLFxyXG4gICAgICAgIFwibWluZWNyYWZ0OmxpZ2h0X2JsdWVfY2FuZGxlX2Nha2VcIixcclxuICAgICAgICBcIm1pbmVjcmFmdDp5ZWxsb3dfY2FuZGxlX2Nha2VcIixcclxuICAgICAgICBcIm1pbmVjcmFmdDpsaW1lX2NhbmRsZV9jYWtlXCIsXHJcbiAgICAgICAgXCJtaW5lY3JhZnQ6cGlua19jYW5kbGVfY2FrZVwiLFxyXG4gICAgICAgIFwibWluZWNyYWZ0OmdyYXlfY2FuZGxlX2Nha2VcIixcclxuICAgICAgICBcIm1pbmVjcmFmdDpsaWdodF9ncmF5X2NhbmRsZV9jYWtlXCIsXHJcbiAgICAgICAgXCJtaW5lY3JhZnQ6Y3lhbl9jYW5kbGVfY2FrZVwiLFxyXG4gICAgICAgIFwibWluZWNyYWZ0OnB1cnBsZV9jYW5kbGVfY2FrZVwiLFxyXG4gICAgICAgIFwibWluZWNyYWZ0OmJsdWVfY2FuZGxlX2Nha2VcIixcclxuICAgICAgICBcIm1pbmVjcmFmdDpicm93bl9jYW5kbGVfY2FrZVwiLFxyXG4gICAgICAgIFwibWluZWNyYWZ0OmdyZWVuX2NhbmRsZV9jYWtlXCIsXHJcbiAgICAgICAgXCJtaW5lY3JhZnQ6cmVkX2NhbmRsZV9jYWtlXCIsXHJcbiAgICAgICAgXCJtaW5lY3JhZnQ6YmxhY2tfY2FuZGxlX2Nha2VcIixcclxuICAgICAgICAvLyBNaXNjXHJcbiAgICAgICAgXCJtaW5lY3JhZnQ6ZW5kX3BvcnRhbF9mcmFtZVwiLFxyXG4gICAgICAgIFwibWluZWNyYWZ0OnN1bGZ1cl9zcGlrZVwiLFxyXG4gICAgICAgIFwibWluZWNyYWZ0OnBvaW50ZWRfZHJpcHN0b25lXCIsXHJcbiAgICBdKTtcclxuXHJcbiAgICAvKiogTGlxdWlkIG9yIGFpciBibG9ja3MgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgRmx1aWRCbG9ja3MgPSBuZXcgU2V0KFtcclxuICAgICAgICBcIm1pbmVjcmFmdDphaXJcIixcclxuICAgICAgICBcIm1pbmVjcmFmdDp3YXRlclwiLFxyXG4gICAgICAgIFwibWluZWNyYWZ0OmZsb3dpbmdfd2F0ZXJcIixcclxuICAgICAgICBcIm1pbmVjcmFmdDpsYXZhXCIsXHJcbiAgICAgICAgXCJtaW5lY3JhZnQ6Zmxvd2luZ19sYXZhXCIsXHJcbiAgICBdKTtcclxufVxyXG4iXSwibmFtZXMiOlsiQmxvY2tQbGFjZW1lbnREYXRhIiwiT3ZlcnJpZGVhYmxlQmxvY2tzIiwiU2V0IiwiQmxvY2tzVGhhdENhbm5vdFN1cHBvcnRUb3JjaGVzIiwiRmx1aWRCbG9ja3MiXSwibWFwcGluZ3MiOiJBQUFlLE1BQU1BO0FBaUxyQjtBQWhMSTs7OztLQUlDLEdBTGdCQSxtQkFNTUMscUJBQXFCLElBQUlDLElBQUk7SUFDaEQsdUJBQXVCO0lBQ3ZCO0lBQ0E7SUFDQTtJQUNBO0lBQ0E7SUFDQTtJQUNBO0lBQ0E7SUFDQTtJQUNBO0lBQ0E7SUFDQTtJQUNBO0lBQ0E7SUFDQSxvQkFBb0I7SUFDcEI7SUFDQTtJQUNBO0lBQ0E7SUFDQTtJQUNBO0lBQ0E7SUFDQSxPQUFPO0lBQ1A7SUFDQTtJQUNBLFNBQVM7SUFDVDtJQUNBO0lBQ0E7SUFDQTtJQUNBO0lBQ0E7Q0FDSDtBQUVEOzs7O0tBSUMsR0E5Q2dCRixtQkErQ01HLGlDQUFpQyxJQUFJRCxJQUFJO0lBQzVELDJCQUEyQjtJQUMzQjtJQUNBO0lBQ0E7SUFDQTtJQUNBO0lBQ0EsU0FBUztJQUNUO0lBQ0E7SUFDQTtJQUNBO0lBQ0E7SUFDQTtJQUNBO0lBQ0E7SUFDQTtJQUNBO0lBQ0E7SUFDQSxVQUFVO0lBQ1Y7SUFDQTtJQUNBO0lBQ0E7SUFDQTtJQUNBO0lBQ0E7SUFDQTtJQUNBO0lBQ0E7SUFDQTtJQUNBO0lBQ0E7SUFDQTtJQUNBO0lBQ0E7SUFDQTtJQUNBO0lBQ0EsT0FBTztJQUNQO0lBQ0E7SUFDQTtJQUNBLE9BQU87SUFDUDtJQUNBO0lBQ0EsU0FBUztJQUNUO0lBQ0E7SUFDQSxPQUFPO0lBQ1A7SUFDQTtJQUNBLE9BQU87SUFDUDtJQUNBO0lBQ0EsZUFBZTtJQUNmO0lBQ0E7SUFDQSxXQUFXO0lBQ1g7SUFDQTtJQUNBO0lBQ0E7SUFDQSxVQUFVO0lBQ1Y7SUFDQTtJQUNBLFVBQVU7SUFDVjtJQUNBO0lBQ0EsZ0JBQWdCO0lBQ2hCO0lBQ0E7SUFDQTtJQUNBO0lBQ0E7SUFDQTtJQUNBO0lBQ0E7SUFDQTtJQUNBO0lBQ0EsVUFBVTtJQUNWO0lBQ0E7SUFDQTtJQUNBO0lBQ0E7SUFDQTtJQUNBO0lBQ0E7SUFDQTtJQUNBO0lBQ0E7SUFDQTtJQUNBO0lBQ0E7SUFDQTtJQUNBO0lBQ0E7SUFDQSxRQUFRO0lBQ1I7SUFDQTtJQUNBO0lBQ0E7SUFDQTtJQUNBO0lBQ0E7SUFDQTtJQUNBO0lBQ0E7SUFDQTtJQUNBO0lBQ0E7SUFDQTtJQUNBO0lBQ0E7SUFDQTtJQUNBO0lBQ0EsT0FBTztJQUNQO0lBQ0E7SUFDQTtDQUNIO0FBRUQseUJBQXlCLEdBektSRixtQkEwS01JLGNBQWMsSUFBSUYsSUFBSTtJQUN6QztJQUNBO0lBQ0E7SUFDQTtJQUNBO0NBQ0g7QUFoTEwsU0FBcUJGLGdDQWlMcEIifQ==