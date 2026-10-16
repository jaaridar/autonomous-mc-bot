/* eslint-disable max-lines */ import { TicksPerSecond } from "@minecraft/server";
class CraftingTreeData {
}
/** A mapping from raw material types to their corresponding smelting result type*/ CraftingTreeData.RawMaterialToSmeltedMaterialMap = {
    "minecraft:raw_iron": "minecraft:iron_ingot",
    "minecraft:raw_copper": "minecraft:copper_ingot",
    "minecraft:raw_gold": "minecraft:gold_ingot",
    "minecraft:chicken": "minecraft:cooked_chicken",
    "minecraft:porkchop": "minecraft:cooked_porkchop",
    "minecraft:beef": "minecraft:cooked_beef",
    "minecraft:mutton": "minecraft:cooked_mutton",
    "minecraft:rabbit": "minecraft:cooked_rabbit",
    "minecraft:cod": "minecraft:cooked_cod",
    "minecraft:salmon": "minecraft:cooked_salmon",
    "minecraft:potato": "minecraft:baked_potato"
};
//Mapping of all stone variants for the sake of crafting.
CraftingTreeData.StoneFamily = [
    "minecraft:cobblestone",
    "minecraft:cobbled_deepslate",
    "minecraft:blackstone"
];
//Mapping of all wood/log variants to their corresponding planks for the sake of crafting.
CraftingTreeData.WoodFamilies = [
    {
        log: "minecraft:oak_log",
        strippedLog: "minecraft:stripped_oak_log",
        wood: "minecraft:oak_wood",
        strippedWood: "minecraft:stripped_oak_wood",
        planks: "minecraft:oak_planks"
    },
    {
        log: "minecraft:spruce_log",
        strippedLog: "minecraft:stripped_spruce_log",
        wood: "minecraft:spruce_wood",
        strippedWood: "minecraft:stripped_spruce_wood",
        planks: "minecraft:spruce_planks"
    },
    {
        log: "minecraft:birch_log",
        strippedLog: "minecraft:stripped_birch_log",
        wood: "minecraft:birch_wood",
        strippedWood: "minecraft:stripped_birch_wood",
        planks: "minecraft:birch_planks"
    },
    {
        log: "minecraft:jungle_log",
        strippedLog: "minecraft:stripped_jungle_log",
        wood: "minecraft:jungle_wood",
        strippedWood: "minecraft:stripped_jungle_wood",
        planks: "minecraft:jungle_planks"
    },
    {
        log: "minecraft:acacia_log",
        strippedLog: "minecraft:stripped_acacia_log",
        wood: "minecraft:acacia_wood",
        strippedWood: "minecraft:stripped_acacia_wood",
        planks: "minecraft:acacia_planks"
    },
    {
        log: "minecraft:dark_oak_log",
        strippedLog: "minecraft:stripped_dark_oak_log",
        wood: "minecraft:dark_oak_wood",
        strippedWood: "minecraft:stripped_dark_oak_wood",
        planks: "minecraft:dark_oak_planks"
    },
    {
        log: "minecraft:mangrove_log",
        strippedLog: "minecraft:stripped_mangrove_log",
        wood: "minecraft:mangrove_wood",
        strippedWood: "minecraft:stripped_mangrove_wood",
        planks: "minecraft:mangrove_planks"
    },
    {
        log: "minecraft:cherry_log",
        strippedLog: "minecraft:stripped_cherry_log",
        wood: "minecraft:cherry_wood",
        strippedWood: "minecraft:stripped_cherry_wood",
        planks: "minecraft:cherry_planks"
    },
    {
        log: "minecraft:bamboo_block",
        strippedLog: null,
        wood: null,
        strippedWood: null,
        planks: "minecraft:bamboo_planks"
    },
    {
        log: "minecraft:crimson_stem",
        strippedLog: "minecraft:stripped_crimson_stem",
        wood: "minecraft:crimson_hyphae",
        strippedWood: "minecraft:stripped_crimson_hyphae",
        planks: "minecraft:crimson_planks"
    },
    {
        log: "minecraft:warped_stem",
        strippedLog: "minecraft:stripped_warped_stem",
        wood: "minecraft:warped_hyphae",
        strippedWood: "minecraft:stripped_warped_hyphae",
        planks: "minecraft:warped_planks"
    }
];
CraftingTreeData.Recipes = [
    /************
         * MATERIALS AND MISC
         ************/ //Torches
    {
        ingredients: [
            {
                id: "minecraft:stick",
                amount: 1
            },
            {
                id: "minecraft:coal",
                amount: 1
            }
        ],
        result: {
            id: "minecraft:torch",
            amount: 4
        },
        requiresCraftingTable: false,
        timeToCraft: 2 * TicksPerSecond
    },
    //Sticks
    {
        ingredients: [
            {
                id: "family:planks",
                amount: 2
            }
        ],
        result: {
            id: "minecraft:stick",
            amount: 4
        },
        requiresCraftingTable: false,
        timeToCraft: 2 * TicksPerSecond
    },
    //Planks
    {
        ingredients: [
            {
                id: "family:logs",
                amount: 1
            }
        ],
        result: {
            id: "family:planks",
            amount: 4
        },
        requiresCraftingTable: false,
        timeToCraft: 2 * TicksPerSecond
    },
    //Crafting table
    {
        ingredients: [
            {
                id: "family:planks",
                amount: 4
            }
        ],
        result: {
            id: "minecraft:crafting_table",
            amount: 1
        },
        requiresCraftingTable: false,
        timeToCraft: 3 * TicksPerSecond
    },
    //Furnace
    {
        ingredients: [
            {
                id: "family:stone",
                amount: 8
            }
        ],
        result: {
            id: "minecraft:furnace",
            amount: 1
        },
        requiresCraftingTable: true,
        timeToCraft: 3 * TicksPerSecond
    },
    /************
         * WOODEN AGE
         ************/ //Wooden pickaxe
    {
        ingredients: [
            {
                id: "family:planks",
                amount: 3
            },
            {
                id: "minecraft:stick",
                amount: 2
            }
        ],
        result: {
            id: "minecraft:wooden_pickaxe",
            amount: 1
        },
        requiresCraftingTable: true,
        timeToCraft: 3 * TicksPerSecond
    },
    //Wooden axe
    {
        ingredients: [
            {
                id: "family:planks",
                amount: 3
            },
            {
                id: "minecraft:stick",
                amount: 2
            }
        ],
        result: {
            id: "minecraft:wooden_axe",
            amount: 1
        },
        requiresCraftingTable: true,
        timeToCraft: 3 * TicksPerSecond
    },
    //Wooden shovel
    {
        ingredients: [
            {
                id: "family:planks",
                amount: 1
            },
            {
                id: "minecraft:stick",
                amount: 2
            }
        ],
        result: {
            id: "minecraft:wooden_shovel",
            amount: 1
        },
        requiresCraftingTable: true,
        timeToCraft: 3 * TicksPerSecond
    },
    //Wooden sword
    {
        ingredients: [
            {
                id: "family:planks",
                amount: 2
            },
            {
                id: "minecraft:stick",
                amount: 1
            }
        ],
        result: {
            id: "minecraft:wooden_sword",
            amount: 1
        },
        requiresCraftingTable: true,
        timeToCraft: 3 * TicksPerSecond
    },
    /************
         * STONE AGE
         ************/ //Stone pickaxe
    {
        ingredients: [
            {
                id: "family:stone",
                amount: 3
            },
            {
                id: "minecraft:stick",
                amount: 2
            }
        ],
        result: {
            id: "minecraft:stone_pickaxe",
            amount: 1
        },
        requiresCraftingTable: true,
        timeToCraft: 3 * TicksPerSecond
    },
    //Stone axe
    {
        ingredients: [
            {
                id: "family:stone",
                amount: 3
            },
            {
                id: "minecraft:stick",
                amount: 2
            }
        ],
        result: {
            id: "minecraft:stone_axe",
            amount: 1
        },
        requiresCraftingTable: true,
        timeToCraft: 3 * TicksPerSecond
    },
    //Stone shovel
    {
        ingredients: [
            {
                id: "family:stone",
                amount: 1
            },
            {
                id: "minecraft:stick",
                amount: 2
            }
        ],
        result: {
            id: "minecraft:stone_shovel",
            amount: 1
        },
        requiresCraftingTable: true,
        timeToCraft: 3 * TicksPerSecond
    },
    //Stone sword
    {
        ingredients: [
            {
                id: "family:stone",
                amount: 2
            },
            {
                id: "minecraft:stick",
                amount: 1
            }
        ],
        result: {
            id: "minecraft:stone_sword",
            amount: 1
        },
        requiresCraftingTable: true,
        timeToCraft: 3 * TicksPerSecond
    },
    /************
         * COPPER AGE
         ************/ //Copper pickaxe
    {
        ingredients: [
            {
                id: "minecraft:copper_ingot",
                amount: 3
            },
            {
                id: "minecraft:stick",
                amount: 2
            }
        ],
        result: {
            id: "minecraft:copper_pickaxe",
            amount: 1
        },
        requiresCraftingTable: true,
        timeToCraft: 3 * TicksPerSecond
    },
    //Copper axe
    {
        ingredients: [
            {
                id: "minecraft:copper_ingot",
                amount: 3
            },
            {
                id: "minecraft:stick",
                amount: 2
            }
        ],
        result: {
            id: "minecraft:copper_axe",
            amount: 1
        },
        requiresCraftingTable: true,
        timeToCraft: 3 * TicksPerSecond
    },
    //Copper shovel
    {
        ingredients: [
            {
                id: "minecraft:copper_ingot",
                amount: 1
            },
            {
                id: "minecraft:stick",
                amount: 2
            }
        ],
        result: {
            id: "minecraft:copper_shovel",
            amount: 1
        },
        requiresCraftingTable: true,
        timeToCraft: 3 * TicksPerSecond
    },
    //Copper sword
    {
        ingredients: [
            {
                id: "minecraft:copper_ingot",
                amount: 2
            },
            {
                id: "minecraft:stick",
                amount: 1
            }
        ],
        result: {
            id: "minecraft:copper_sword",
            amount: 1
        },
        requiresCraftingTable: true,
        timeToCraft: 3 * TicksPerSecond
    },
    //Copper helmet
    {
        ingredients: [
            {
                id: "minecraft:copper_ingot",
                amount: 5
            }
        ],
        result: {
            id: "minecraft:copper_helmet",
            amount: 1
        },
        requiresCraftingTable: true,
        timeToCraft: 3 * TicksPerSecond
    },
    //Copper chestplate
    {
        ingredients: [
            {
                id: "minecraft:copper_ingot",
                amount: 8
            }
        ],
        result: {
            id: "minecraft:copper_chestplate",
            amount: 1
        },
        requiresCraftingTable: true,
        timeToCraft: 3 * TicksPerSecond
    },
    //Copper leggings
    {
        ingredients: [
            {
                id: "minecraft:copper_ingot",
                amount: 7
            }
        ],
        result: {
            id: "minecraft:copper_leggings",
            amount: 1
        },
        requiresCraftingTable: true,
        timeToCraft: 3 * TicksPerSecond
    },
    //Copper boots
    {
        ingredients: [
            {
                id: "minecraft:copper_ingot",
                amount: 4
            }
        ],
        result: {
            id: "minecraft:copper_boots",
            amount: 1
        },
        requiresCraftingTable: true,
        timeToCraft: 3 * TicksPerSecond
    },
    /************
         * IRON AGE
         ************/ //Iron pickaxe
    {
        ingredients: [
            {
                id: "minecraft:iron_ingot",
                amount: 3
            },
            {
                id: "minecraft:stick",
                amount: 2
            }
        ],
        result: {
            id: "minecraft:iron_pickaxe",
            amount: 1
        },
        requiresCraftingTable: true,
        timeToCraft: 3 * TicksPerSecond
    },
    //Iron axe
    {
        ingredients: [
            {
                id: "minecraft:iron_ingot",
                amount: 3
            },
            {
                id: "minecraft:stick",
                amount: 2
            }
        ],
        result: {
            id: "minecraft:iron_axe",
            amount: 1
        },
        requiresCraftingTable: true,
        timeToCraft: 3 * TicksPerSecond
    },
    //Iron shovel
    {
        ingredients: [
            {
                id: "minecraft:iron_ingot",
                amount: 1
            },
            {
                id: "minecraft:stick",
                amount: 2
            }
        ],
        result: {
            id: "minecraft:iron_shovel",
            amount: 1
        },
        requiresCraftingTable: true,
        timeToCraft: 3 * TicksPerSecond
    },
    //Iron sword
    {
        ingredients: [
            {
                id: "minecraft:iron_ingot",
                amount: 2
            },
            {
                id: "minecraft:stick",
                amount: 1
            }
        ],
        result: {
            id: "minecraft:iron_sword",
            amount: 1
        },
        requiresCraftingTable: true,
        timeToCraft: 3 * TicksPerSecond
    },
    //Iron helmet
    {
        ingredients: [
            {
                id: "minecraft:iron_ingot",
                amount: 5
            }
        ],
        result: {
            id: "minecraft:iron_helmet",
            amount: 1
        },
        requiresCraftingTable: true,
        timeToCraft: 3 * TicksPerSecond
    },
    //Iron chestplate
    {
        ingredients: [
            {
                id: "minecraft:iron_ingot",
                amount: 8
            }
        ],
        result: {
            id: "minecraft:iron_chestplate",
            amount: 1
        },
        requiresCraftingTable: true,
        timeToCraft: 3 * TicksPerSecond
    },
    //Iron leggings
    {
        ingredients: [
            {
                id: "minecraft:iron_ingot",
                amount: 7
            }
        ],
        result: {
            id: "minecraft:iron_leggings",
            amount: 1
        },
        requiresCraftingTable: true,
        timeToCraft: 3 * TicksPerSecond
    },
    //Iron boots
    {
        ingredients: [
            {
                id: "minecraft:iron_ingot",
                amount: 4
            }
        ],
        result: {
            id: "minecraft:iron_boots",
            amount: 1
        },
        requiresCraftingTable: true,
        timeToCraft: 3 * TicksPerSecond
    },
    /************
         * DIAMOND AGE
         ************/ //Diamond pickaxe
    {
        ingredients: [
            {
                id: "minecraft:diamond",
                amount: 3
            },
            {
                id: "minecraft:stick",
                amount: 2
            }
        ],
        result: {
            id: "minecraft:diamond_pickaxe",
            amount: 1
        },
        requiresCraftingTable: true,
        timeToCraft: 3 * TicksPerSecond
    },
    //Diamond axe
    {
        ingredients: [
            {
                id: "minecraft:diamond",
                amount: 3
            },
            {
                id: "minecraft:stick",
                amount: 2
            }
        ],
        result: {
            id: "minecraft:diamond_axe",
            amount: 1
        },
        requiresCraftingTable: true,
        timeToCraft: 3 * TicksPerSecond
    },
    //Diamond shovel
    {
        ingredients: [
            {
                id: "minecraft:diamond",
                amount: 1
            },
            {
                id: "minecraft:stick",
                amount: 2
            }
        ],
        result: {
            id: "minecraft:diamond_shovel",
            amount: 1
        },
        requiresCraftingTable: true,
        timeToCraft: 3 * TicksPerSecond
    },
    //Diamond sword
    {
        ingredients: [
            {
                id: "minecraft:diamond",
                amount: 2
            },
            {
                id: "minecraft:stick",
                amount: 1
            }
        ],
        result: {
            id: "minecraft:diamond_sword",
            amount: 1
        },
        requiresCraftingTable: true,
        timeToCraft: 3 * TicksPerSecond
    },
    //Diamond helmet
    {
        ingredients: [
            {
                id: "minecraft:diamond",
                amount: 5
            }
        ],
        result: {
            id: "minecraft:diamond_helmet",
            amount: 1
        },
        requiresCraftingTable: true,
        timeToCraft: 3 * TicksPerSecond
    },
    //Diamond chestplate
    {
        ingredients: [
            {
                id: "minecraft:diamond",
                amount: 8
            }
        ],
        result: {
            id: "minecraft:diamond_chestplate",
            amount: 1
        },
        requiresCraftingTable: true,
        timeToCraft: 3 * TicksPerSecond
    },
    //Diamond leggings
    {
        ingredients: [
            {
                id: "minecraft:diamond",
                amount: 7
            }
        ],
        result: {
            id: "minecraft:diamond_leggings",
            amount: 1
        },
        requiresCraftingTable: true,
        timeToCraft: 3 * TicksPerSecond
    },
    //Diamond boots
    {
        ingredients: [
            {
                id: "minecraft:diamond",
                amount: 4
            }
        ],
        result: {
            id: "minecraft:diamond_boots",
            amount: 1
        },
        requiresCraftingTable: true,
        timeToCraft: 3 * TicksPerSecond
    },
    /************
         * EVERGREEN AGE
         ************/ //Copper block
    {
        ingredients: [
            {
                id: "minecraft:copper_ingot",
                amount: 9
            }
        ],
        result: {
            id: "minecraft:copper_block",
            amount: 1
        },
        requiresCraftingTable: true,
        timeToCraft: 3 * TicksPerSecond
    },
    //Iron block
    {
        ingredients: [
            {
                id: "minecraft:iron_ingot",
                amount: 9
            }
        ],
        result: {
            id: "minecraft:iron_block",
            amount: 1
        },
        requiresCraftingTable: true,
        timeToCraft: 3 * TicksPerSecond
    },
    //Gold block
    {
        ingredients: [
            {
                id: "minecraft:gold_ingot",
                amount: 9
            }
        ],
        result: {
            id: "minecraft:gold_block",
            amount: 1
        },
        requiresCraftingTable: true,
        timeToCraft: 3 * TicksPerSecond
    },
    //Diamond block
    {
        ingredients: [
            {
                id: "minecraft:diamond",
                amount: 9
            }
        ],
        result: {
            id: "minecraft:diamond_block",
            amount: 1
        },
        requiresCraftingTable: true,
        timeToCraft: 3 * TicksPerSecond
    },
    //Lapis block
    {
        ingredients: [
            {
                id: "minecraft:lapis_lazuli",
                amount: 9
            }
        ],
        result: {
            id: "minecraft:lapis_block",
            amount: 1
        },
        requiresCraftingTable: true,
        timeToCraft: 3 * TicksPerSecond
    },
    //Redstone block
    {
        ingredients: [
            {
                id: "minecraft:redstone",
                amount: 9
            }
        ],
        result: {
            id: "minecraft:redstone_block",
            amount: 1
        },
        requiresCraftingTable: true,
        timeToCraft: 3 * TicksPerSecond
    },
    //Emerald block
    {
        ingredients: [
            {
                id: "minecraft:emerald",
                amount: 9
            }
        ],
        result: {
            id: "minecraft:emerald_block",
            amount: 1
        },
        requiresCraftingTable: true,
        timeToCraft: 3 * TicksPerSecond
    }
];
export { CraftingTreeData as default };

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkNyYWZ0aW5nVHJlZURhdGEudHMiXSwic291cmNlc0NvbnRlbnQiOlsiLyogZXNsaW50LWRpc2FibGUgbWF4LWxpbmVzICovXHJcbmltcG9ydCB7IFRpY2tzUGVyU2Vjb25kIH0gZnJvbSBcIkBtaW5lY3JhZnQvc2VydmVyXCI7XHJcblxyXG5leHBvcnQgaW50ZXJmYWNlIEluZ3JlZGllbnQge1xyXG4gICAgaWQ6IHN0cmluZztcclxuICAgIGFtb3VudDogbnVtYmVyO1xyXG59XHJcblxyXG5leHBvcnQgaW50ZXJmYWNlIFJlY2lwZSB7XHJcbiAgICBpbmdyZWRpZW50czogSW5ncmVkaWVudFtdO1xyXG4gICAgcmVzdWx0OiBJbmdyZWRpZW50O1xyXG4gICAgcmVxdWlyZXNDcmFmdGluZ1RhYmxlOiBib29sZWFuO1xyXG4gICAgdGltZVRvQ3JhZnQ6IG51bWJlcjtcclxufVxyXG5cclxuZXhwb3J0IGludGVyZmFjZSBXb29kRmFtaWx5IHtcclxuICAgIGxvZzogc3RyaW5nO1xyXG4gICAgc3RyaXBwZWRMb2c6IHN0cmluZyB8IG51bGw7XHJcbiAgICB3b29kOiBzdHJpbmcgfCBudWxsO1xyXG4gICAgc3RyaXBwZWRXb29kOiBzdHJpbmcgfCBudWxsO1xyXG4gICAgcGxhbmtzOiBzdHJpbmc7XHJcbn1cclxuXHJcbmV4cG9ydCBkZWZhdWx0IGNsYXNzIENyYWZ0aW5nVHJlZURhdGEge1xyXG4gICAgLyoqIEEgbWFwcGluZyBmcm9tIHJhdyBtYXRlcmlhbCB0eXBlcyB0byB0aGVpciBjb3JyZXNwb25kaW5nIHNtZWx0aW5nIHJlc3VsdCB0eXBlKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgUmF3TWF0ZXJpYWxUb1NtZWx0ZWRNYXRlcmlhbE1hcDogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHtcclxuICAgICAgICBcIm1pbmVjcmFmdDpyYXdfaXJvblwiOiBcIm1pbmVjcmFmdDppcm9uX2luZ290XCIsXHJcbiAgICAgICAgXCJtaW5lY3JhZnQ6cmF3X2NvcHBlclwiOiBcIm1pbmVjcmFmdDpjb3BwZXJfaW5nb3RcIixcclxuICAgICAgICBcIm1pbmVjcmFmdDpyYXdfZ29sZFwiOiBcIm1pbmVjcmFmdDpnb2xkX2luZ290XCIsXHJcbiAgICAgICAgXCJtaW5lY3JhZnQ6Y2hpY2tlblwiOiBcIm1pbmVjcmFmdDpjb29rZWRfY2hpY2tlblwiLFxyXG4gICAgICAgIFwibWluZWNyYWZ0OnBvcmtjaG9wXCI6IFwibWluZWNyYWZ0OmNvb2tlZF9wb3JrY2hvcFwiLFxyXG4gICAgICAgIFwibWluZWNyYWZ0OmJlZWZcIjogXCJtaW5lY3JhZnQ6Y29va2VkX2JlZWZcIixcclxuICAgICAgICBcIm1pbmVjcmFmdDptdXR0b25cIjogXCJtaW5lY3JhZnQ6Y29va2VkX211dHRvblwiLFxyXG4gICAgICAgIFwibWluZWNyYWZ0OnJhYmJpdFwiOiBcIm1pbmVjcmFmdDpjb29rZWRfcmFiYml0XCIsXHJcbiAgICAgICAgXCJtaW5lY3JhZnQ6Y29kXCI6IFwibWluZWNyYWZ0OmNvb2tlZF9jb2RcIixcclxuICAgICAgICBcIm1pbmVjcmFmdDpzYWxtb25cIjogXCJtaW5lY3JhZnQ6Y29va2VkX3NhbG1vblwiLFxyXG4gICAgICAgIFwibWluZWNyYWZ0OnBvdGF0b1wiOiBcIm1pbmVjcmFmdDpiYWtlZF9wb3RhdG9cIixcclxuICAgIH07XHJcblxyXG4gICAgLy9NYXBwaW5nIG9mIGFsbCBzdG9uZSB2YXJpYW50cyBmb3IgdGhlIHNha2Ugb2YgY3JhZnRpbmcuXHJcbiAgICBwdWJsaWMgc3RhdGljIHJlYWRvbmx5IFN0b25lRmFtaWx5ID0gW1wibWluZWNyYWZ0OmNvYmJsZXN0b25lXCIsIFwibWluZWNyYWZ0OmNvYmJsZWRfZGVlcHNsYXRlXCIsIFwibWluZWNyYWZ0OmJsYWNrc3RvbmVcIl07XHJcblxyXG4gICAgLy9NYXBwaW5nIG9mIGFsbCB3b29kL2xvZyB2YXJpYW50cyB0byB0aGVpciBjb3JyZXNwb25kaW5nIHBsYW5rcyBmb3IgdGhlIHNha2Ugb2YgY3JhZnRpbmcuXHJcbiAgICBwdWJsaWMgc3RhdGljIHJlYWRvbmx5IFdvb2RGYW1pbGllczogV29vZEZhbWlseVtdID0gW1xyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbG9nOiBcIm1pbmVjcmFmdDpvYWtfbG9nXCIsXHJcbiAgICAgICAgICAgIHN0cmlwcGVkTG9nOiBcIm1pbmVjcmFmdDpzdHJpcHBlZF9vYWtfbG9nXCIsXHJcbiAgICAgICAgICAgIHdvb2Q6IFwibWluZWNyYWZ0Om9ha193b29kXCIsXHJcbiAgICAgICAgICAgIHN0cmlwcGVkV29vZDogXCJtaW5lY3JhZnQ6c3RyaXBwZWRfb2FrX3dvb2RcIixcclxuICAgICAgICAgICAgcGxhbmtzOiBcIm1pbmVjcmFmdDpvYWtfcGxhbmtzXCIsXHJcbiAgICAgICAgfSxcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGxvZzogXCJtaW5lY3JhZnQ6c3BydWNlX2xvZ1wiLFxyXG4gICAgICAgICAgICBzdHJpcHBlZExvZzogXCJtaW5lY3JhZnQ6c3RyaXBwZWRfc3BydWNlX2xvZ1wiLFxyXG4gICAgICAgICAgICB3b29kOiBcIm1pbmVjcmFmdDpzcHJ1Y2Vfd29vZFwiLFxyXG4gICAgICAgICAgICBzdHJpcHBlZFdvb2Q6IFwibWluZWNyYWZ0OnN0cmlwcGVkX3NwcnVjZV93b29kXCIsXHJcbiAgICAgICAgICAgIHBsYW5rczogXCJtaW5lY3JhZnQ6c3BydWNlX3BsYW5rc1wiLFxyXG4gICAgICAgIH0sXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsb2c6IFwibWluZWNyYWZ0OmJpcmNoX2xvZ1wiLFxyXG4gICAgICAgICAgICBzdHJpcHBlZExvZzogXCJtaW5lY3JhZnQ6c3RyaXBwZWRfYmlyY2hfbG9nXCIsXHJcbiAgICAgICAgICAgIHdvb2Q6IFwibWluZWNyYWZ0OmJpcmNoX3dvb2RcIixcclxuICAgICAgICAgICAgc3RyaXBwZWRXb29kOiBcIm1pbmVjcmFmdDpzdHJpcHBlZF9iaXJjaF93b29kXCIsXHJcbiAgICAgICAgICAgIHBsYW5rczogXCJtaW5lY3JhZnQ6YmlyY2hfcGxhbmtzXCIsXHJcbiAgICAgICAgfSxcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGxvZzogXCJtaW5lY3JhZnQ6anVuZ2xlX2xvZ1wiLFxyXG4gICAgICAgICAgICBzdHJpcHBlZExvZzogXCJtaW5lY3JhZnQ6c3RyaXBwZWRfanVuZ2xlX2xvZ1wiLFxyXG4gICAgICAgICAgICB3b29kOiBcIm1pbmVjcmFmdDpqdW5nbGVfd29vZFwiLFxyXG4gICAgICAgICAgICBzdHJpcHBlZFdvb2Q6IFwibWluZWNyYWZ0OnN0cmlwcGVkX2p1bmdsZV93b29kXCIsXHJcbiAgICAgICAgICAgIHBsYW5rczogXCJtaW5lY3JhZnQ6anVuZ2xlX3BsYW5rc1wiLFxyXG4gICAgICAgIH0sXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsb2c6IFwibWluZWNyYWZ0OmFjYWNpYV9sb2dcIixcclxuICAgICAgICAgICAgc3RyaXBwZWRMb2c6IFwibWluZWNyYWZ0OnN0cmlwcGVkX2FjYWNpYV9sb2dcIixcclxuICAgICAgICAgICAgd29vZDogXCJtaW5lY3JhZnQ6YWNhY2lhX3dvb2RcIixcclxuICAgICAgICAgICAgc3RyaXBwZWRXb29kOiBcIm1pbmVjcmFmdDpzdHJpcHBlZF9hY2FjaWFfd29vZFwiLFxyXG4gICAgICAgICAgICBwbGFua3M6IFwibWluZWNyYWZ0OmFjYWNpYV9wbGFua3NcIixcclxuICAgICAgICB9LFxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbG9nOiBcIm1pbmVjcmFmdDpkYXJrX29ha19sb2dcIixcclxuICAgICAgICAgICAgc3RyaXBwZWRMb2c6IFwibWluZWNyYWZ0OnN0cmlwcGVkX2Rhcmtfb2FrX2xvZ1wiLFxyXG4gICAgICAgICAgICB3b29kOiBcIm1pbmVjcmFmdDpkYXJrX29ha193b29kXCIsXHJcbiAgICAgICAgICAgIHN0cmlwcGVkV29vZDogXCJtaW5lY3JhZnQ6c3RyaXBwZWRfZGFya19vYWtfd29vZFwiLFxyXG4gICAgICAgICAgICBwbGFua3M6IFwibWluZWNyYWZ0OmRhcmtfb2FrX3BsYW5rc1wiLFxyXG4gICAgICAgIH0sXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsb2c6IFwibWluZWNyYWZ0Om1hbmdyb3ZlX2xvZ1wiLFxyXG4gICAgICAgICAgICBzdHJpcHBlZExvZzogXCJtaW5lY3JhZnQ6c3RyaXBwZWRfbWFuZ3JvdmVfbG9nXCIsXHJcbiAgICAgICAgICAgIHdvb2Q6IFwibWluZWNyYWZ0Om1hbmdyb3ZlX3dvb2RcIixcclxuICAgICAgICAgICAgc3RyaXBwZWRXb29kOiBcIm1pbmVjcmFmdDpzdHJpcHBlZF9tYW5ncm92ZV93b29kXCIsXHJcbiAgICAgICAgICAgIHBsYW5rczogXCJtaW5lY3JhZnQ6bWFuZ3JvdmVfcGxhbmtzXCIsXHJcbiAgICAgICAgfSxcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGxvZzogXCJtaW5lY3JhZnQ6Y2hlcnJ5X2xvZ1wiLFxyXG4gICAgICAgICAgICBzdHJpcHBlZExvZzogXCJtaW5lY3JhZnQ6c3RyaXBwZWRfY2hlcnJ5X2xvZ1wiLFxyXG4gICAgICAgICAgICB3b29kOiBcIm1pbmVjcmFmdDpjaGVycnlfd29vZFwiLFxyXG4gICAgICAgICAgICBzdHJpcHBlZFdvb2Q6IFwibWluZWNyYWZ0OnN0cmlwcGVkX2NoZXJyeV93b29kXCIsXHJcbiAgICAgICAgICAgIHBsYW5rczogXCJtaW5lY3JhZnQ6Y2hlcnJ5X3BsYW5rc1wiLFxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgeyBsb2c6IFwibWluZWNyYWZ0OmJhbWJvb19ibG9ja1wiLCBzdHJpcHBlZExvZzogbnVsbCwgd29vZDogbnVsbCwgc3RyaXBwZWRXb29kOiBudWxsLCBwbGFua3M6IFwibWluZWNyYWZ0OmJhbWJvb19wbGFua3NcIiB9LFxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbG9nOiBcIm1pbmVjcmFmdDpjcmltc29uX3N0ZW1cIixcclxuICAgICAgICAgICAgc3RyaXBwZWRMb2c6IFwibWluZWNyYWZ0OnN0cmlwcGVkX2NyaW1zb25fc3RlbVwiLFxyXG4gICAgICAgICAgICB3b29kOiBcIm1pbmVjcmFmdDpjcmltc29uX2h5cGhhZVwiLFxyXG4gICAgICAgICAgICBzdHJpcHBlZFdvb2Q6IFwibWluZWNyYWZ0OnN0cmlwcGVkX2NyaW1zb25faHlwaGFlXCIsXHJcbiAgICAgICAgICAgIHBsYW5rczogXCJtaW5lY3JhZnQ6Y3JpbXNvbl9wbGFua3NcIixcclxuICAgICAgICB9LFxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbG9nOiBcIm1pbmVjcmFmdDp3YXJwZWRfc3RlbVwiLFxyXG4gICAgICAgICAgICBzdHJpcHBlZExvZzogXCJtaW5lY3JhZnQ6c3RyaXBwZWRfd2FycGVkX3N0ZW1cIixcclxuICAgICAgICAgICAgd29vZDogXCJtaW5lY3JhZnQ6d2FycGVkX2h5cGhhZVwiLFxyXG4gICAgICAgICAgICBzdHJpcHBlZFdvb2Q6IFwibWluZWNyYWZ0OnN0cmlwcGVkX3dhcnBlZF9oeXBoYWVcIixcclxuICAgICAgICAgICAgcGxhbmtzOiBcIm1pbmVjcmFmdDp3YXJwZWRfcGxhbmtzXCIsXHJcbiAgICAgICAgfSxcclxuICAgIF07XHJcblxyXG4gICAgcHVibGljIHN0YXRpYyByZWFkb25seSBSZWNpcGVzOiBSZWNpcGVbXSA9IFtcclxuICAgICAgICAvKioqKioqKioqKioqXHJcbiAgICAgICAgICogTUFURVJJQUxTIEFORCBNSVNDXHJcbiAgICAgICAgICoqKioqKioqKioqKi9cclxuXHJcbiAgICAgICAgLy9Ub3JjaGVzXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBpbmdyZWRpZW50czogW1xyXG4gICAgICAgICAgICAgICAgeyBpZDogXCJtaW5lY3JhZnQ6c3RpY2tcIiwgYW1vdW50OiAxIH0sXHJcbiAgICAgICAgICAgICAgICB7IGlkOiBcIm1pbmVjcmFmdDpjb2FsXCIsIGFtb3VudDogMSB9LFxyXG4gICAgICAgICAgICBdLFxyXG4gICAgICAgICAgICByZXN1bHQ6IHsgaWQ6IFwibWluZWNyYWZ0OnRvcmNoXCIsIGFtb3VudDogNCB9LFxyXG4gICAgICAgICAgICByZXF1aXJlc0NyYWZ0aW5nVGFibGU6IGZhbHNlLFxyXG4gICAgICAgICAgICB0aW1lVG9DcmFmdDogMiAqIFRpY2tzUGVyU2Vjb25kLFxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgLy9TdGlja3NcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGluZ3JlZGllbnRzOiBbeyBpZDogXCJmYW1pbHk6cGxhbmtzXCIsIGFtb3VudDogMiB9XSxcclxuICAgICAgICAgICAgcmVzdWx0OiB7IGlkOiBcIm1pbmVjcmFmdDpzdGlja1wiLCBhbW91bnQ6IDQgfSxcclxuICAgICAgICAgICAgcmVxdWlyZXNDcmFmdGluZ1RhYmxlOiBmYWxzZSxcclxuICAgICAgICAgICAgdGltZVRvQ3JhZnQ6IDIgKiBUaWNrc1BlclNlY29uZCxcclxuICAgICAgICB9LFxyXG4gICAgICAgIC8vUGxhbmtzXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBpbmdyZWRpZW50czogW3sgaWQ6IFwiZmFtaWx5OmxvZ3NcIiwgYW1vdW50OiAxIH1dLFxyXG4gICAgICAgICAgICByZXN1bHQ6IHsgaWQ6IFwiZmFtaWx5OnBsYW5rc1wiLCBhbW91bnQ6IDQgfSxcclxuICAgICAgICAgICAgcmVxdWlyZXNDcmFmdGluZ1RhYmxlOiBmYWxzZSxcclxuICAgICAgICAgICAgdGltZVRvQ3JhZnQ6IDIgKiBUaWNrc1BlclNlY29uZCxcclxuICAgICAgICB9LFxyXG4gICAgICAgIC8vQ3JhZnRpbmcgdGFibGVcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGluZ3JlZGllbnRzOiBbeyBpZDogXCJmYW1pbHk6cGxhbmtzXCIsIGFtb3VudDogNCB9XSxcclxuICAgICAgICAgICAgcmVzdWx0OiB7IGlkOiBcIm1pbmVjcmFmdDpjcmFmdGluZ190YWJsZVwiLCBhbW91bnQ6IDEgfSxcclxuICAgICAgICAgICAgcmVxdWlyZXNDcmFmdGluZ1RhYmxlOiBmYWxzZSxcclxuICAgICAgICAgICAgdGltZVRvQ3JhZnQ6IDMgKiBUaWNrc1BlclNlY29uZCxcclxuICAgICAgICB9LFxyXG4gICAgICAgIC8vRnVybmFjZVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgaW5ncmVkaWVudHM6IFt7IGlkOiBcImZhbWlseTpzdG9uZVwiLCBhbW91bnQ6IDggfV0sXHJcbiAgICAgICAgICAgIHJlc3VsdDogeyBpZDogXCJtaW5lY3JhZnQ6ZnVybmFjZVwiLCBhbW91bnQ6IDEgfSxcclxuICAgICAgICAgICAgcmVxdWlyZXNDcmFmdGluZ1RhYmxlOiB0cnVlLFxyXG4gICAgICAgICAgICB0aW1lVG9DcmFmdDogMyAqIFRpY2tzUGVyU2Vjb25kLFxyXG4gICAgICAgIH0sXHJcblxyXG4gICAgICAgIC8qKioqKioqKioqKipcclxuICAgICAgICAgKiBXT09ERU4gQUdFXHJcbiAgICAgICAgICoqKioqKioqKioqKi9cclxuXHJcbiAgICAgICAgLy9Xb29kZW4gcGlja2F4ZVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgaW5ncmVkaWVudHM6IFtcclxuICAgICAgICAgICAgICAgIHsgaWQ6IFwiZmFtaWx5OnBsYW5rc1wiLCBhbW91bnQ6IDMgfSxcclxuICAgICAgICAgICAgICAgIHsgaWQ6IFwibWluZWNyYWZ0OnN0aWNrXCIsIGFtb3VudDogMiB9LFxyXG4gICAgICAgICAgICBdLFxyXG4gICAgICAgICAgICByZXN1bHQ6IHsgaWQ6IFwibWluZWNyYWZ0Ondvb2Rlbl9waWNrYXhlXCIsIGFtb3VudDogMSB9LFxyXG4gICAgICAgICAgICByZXF1aXJlc0NyYWZ0aW5nVGFibGU6IHRydWUsXHJcbiAgICAgICAgICAgIHRpbWVUb0NyYWZ0OiAzICogVGlja3NQZXJTZWNvbmQsXHJcbiAgICAgICAgfSxcclxuICAgICAgICAvL1dvb2RlbiBheGVcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGluZ3JlZGllbnRzOiBbXHJcbiAgICAgICAgICAgICAgICB7IGlkOiBcImZhbWlseTpwbGFua3NcIiwgYW1vdW50OiAzIH0sXHJcbiAgICAgICAgICAgICAgICB7IGlkOiBcIm1pbmVjcmFmdDpzdGlja1wiLCBhbW91bnQ6IDIgfSxcclxuICAgICAgICAgICAgXSxcclxuICAgICAgICAgICAgcmVzdWx0OiB7IGlkOiBcIm1pbmVjcmFmdDp3b29kZW5fYXhlXCIsIGFtb3VudDogMSB9LFxyXG4gICAgICAgICAgICByZXF1aXJlc0NyYWZ0aW5nVGFibGU6IHRydWUsXHJcbiAgICAgICAgICAgIHRpbWVUb0NyYWZ0OiAzICogVGlja3NQZXJTZWNvbmQsXHJcbiAgICAgICAgfSxcclxuICAgICAgICAvL1dvb2RlbiBzaG92ZWxcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGluZ3JlZGllbnRzOiBbXHJcbiAgICAgICAgICAgICAgICB7IGlkOiBcImZhbWlseTpwbGFua3NcIiwgYW1vdW50OiAxIH0sXHJcbiAgICAgICAgICAgICAgICB7IGlkOiBcIm1pbmVjcmFmdDpzdGlja1wiLCBhbW91bnQ6IDIgfSxcclxuICAgICAgICAgICAgXSxcclxuICAgICAgICAgICAgcmVzdWx0OiB7IGlkOiBcIm1pbmVjcmFmdDp3b29kZW5fc2hvdmVsXCIsIGFtb3VudDogMSB9LFxyXG4gICAgICAgICAgICByZXF1aXJlc0NyYWZ0aW5nVGFibGU6IHRydWUsXHJcbiAgICAgICAgICAgIHRpbWVUb0NyYWZ0OiAzICogVGlja3NQZXJTZWNvbmQsXHJcbiAgICAgICAgfSxcclxuICAgICAgICAvL1dvb2RlbiBzd29yZFxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgaW5ncmVkaWVudHM6IFtcclxuICAgICAgICAgICAgICAgIHsgaWQ6IFwiZmFtaWx5OnBsYW5rc1wiLCBhbW91bnQ6IDIgfSxcclxuICAgICAgICAgICAgICAgIHsgaWQ6IFwibWluZWNyYWZ0OnN0aWNrXCIsIGFtb3VudDogMSB9LFxyXG4gICAgICAgICAgICBdLFxyXG4gICAgICAgICAgICByZXN1bHQ6IHsgaWQ6IFwibWluZWNyYWZ0Ondvb2Rlbl9zd29yZFwiLCBhbW91bnQ6IDEgfSxcclxuICAgICAgICAgICAgcmVxdWlyZXNDcmFmdGluZ1RhYmxlOiB0cnVlLFxyXG4gICAgICAgICAgICB0aW1lVG9DcmFmdDogMyAqIFRpY2tzUGVyU2Vjb25kLFxyXG4gICAgICAgIH0sXHJcblxyXG4gICAgICAgIC8qKioqKioqKioqKipcclxuICAgICAgICAgKiBTVE9ORSBBR0VcclxuICAgICAgICAgKioqKioqKioqKioqL1xyXG5cclxuICAgICAgICAvL1N0b25lIHBpY2theGVcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGluZ3JlZGllbnRzOiBbXHJcbiAgICAgICAgICAgICAgICB7IGlkOiBcImZhbWlseTpzdG9uZVwiLCBhbW91bnQ6IDMgfSxcclxuICAgICAgICAgICAgICAgIHsgaWQ6IFwibWluZWNyYWZ0OnN0aWNrXCIsIGFtb3VudDogMiB9LFxyXG4gICAgICAgICAgICBdLFxyXG4gICAgICAgICAgICByZXN1bHQ6IHsgaWQ6IFwibWluZWNyYWZ0OnN0b25lX3BpY2theGVcIiwgYW1vdW50OiAxIH0sXHJcbiAgICAgICAgICAgIHJlcXVpcmVzQ3JhZnRpbmdUYWJsZTogdHJ1ZSxcclxuICAgICAgICAgICAgdGltZVRvQ3JhZnQ6IDMgKiBUaWNrc1BlclNlY29uZCxcclxuICAgICAgICB9LFxyXG4gICAgICAgIC8vU3RvbmUgYXhlXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBpbmdyZWRpZW50czogW1xyXG4gICAgICAgICAgICAgICAgeyBpZDogXCJmYW1pbHk6c3RvbmVcIiwgYW1vdW50OiAzIH0sXHJcbiAgICAgICAgICAgICAgICB7IGlkOiBcIm1pbmVjcmFmdDpzdGlja1wiLCBhbW91bnQ6IDIgfSxcclxuICAgICAgICAgICAgXSxcclxuICAgICAgICAgICAgcmVzdWx0OiB7IGlkOiBcIm1pbmVjcmFmdDpzdG9uZV9heGVcIiwgYW1vdW50OiAxIH0sXHJcbiAgICAgICAgICAgIHJlcXVpcmVzQ3JhZnRpbmdUYWJsZTogdHJ1ZSxcclxuICAgICAgICAgICAgdGltZVRvQ3JhZnQ6IDMgKiBUaWNrc1BlclNlY29uZCxcclxuICAgICAgICB9LFxyXG4gICAgICAgIC8vU3RvbmUgc2hvdmVsXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBpbmdyZWRpZW50czogW1xyXG4gICAgICAgICAgICAgICAgeyBpZDogXCJmYW1pbHk6c3RvbmVcIiwgYW1vdW50OiAxIH0sXHJcbiAgICAgICAgICAgICAgICB7IGlkOiBcIm1pbmVjcmFmdDpzdGlja1wiLCBhbW91bnQ6IDIgfSxcclxuICAgICAgICAgICAgXSxcclxuICAgICAgICAgICAgcmVzdWx0OiB7IGlkOiBcIm1pbmVjcmFmdDpzdG9uZV9zaG92ZWxcIiwgYW1vdW50OiAxIH0sXHJcbiAgICAgICAgICAgIHJlcXVpcmVzQ3JhZnRpbmdUYWJsZTogdHJ1ZSxcclxuICAgICAgICAgICAgdGltZVRvQ3JhZnQ6IDMgKiBUaWNrc1BlclNlY29uZCxcclxuICAgICAgICB9LFxyXG4gICAgICAgIC8vU3RvbmUgc3dvcmRcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGluZ3JlZGllbnRzOiBbXHJcbiAgICAgICAgICAgICAgICB7IGlkOiBcImZhbWlseTpzdG9uZVwiLCBhbW91bnQ6IDIgfSxcclxuICAgICAgICAgICAgICAgIHsgaWQ6IFwibWluZWNyYWZ0OnN0aWNrXCIsIGFtb3VudDogMSB9LFxyXG4gICAgICAgICAgICBdLFxyXG4gICAgICAgICAgICByZXN1bHQ6IHsgaWQ6IFwibWluZWNyYWZ0OnN0b25lX3N3b3JkXCIsIGFtb3VudDogMSB9LFxyXG4gICAgICAgICAgICByZXF1aXJlc0NyYWZ0aW5nVGFibGU6IHRydWUsXHJcbiAgICAgICAgICAgIHRpbWVUb0NyYWZ0OiAzICogVGlja3NQZXJTZWNvbmQsXHJcbiAgICAgICAgfSxcclxuXHJcbiAgICAgICAgLyoqKioqKioqKioqKlxyXG4gICAgICAgICAqIENPUFBFUiBBR0VcclxuICAgICAgICAgKioqKioqKioqKioqL1xyXG5cclxuICAgICAgICAvL0NvcHBlciBwaWNrYXhlXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBpbmdyZWRpZW50czogW1xyXG4gICAgICAgICAgICAgICAgeyBpZDogXCJtaW5lY3JhZnQ6Y29wcGVyX2luZ290XCIsIGFtb3VudDogMyB9LFxyXG4gICAgICAgICAgICAgICAgeyBpZDogXCJtaW5lY3JhZnQ6c3RpY2tcIiwgYW1vdW50OiAyIH0sXHJcbiAgICAgICAgICAgIF0sXHJcbiAgICAgICAgICAgIHJlc3VsdDogeyBpZDogXCJtaW5lY3JhZnQ6Y29wcGVyX3BpY2theGVcIiwgYW1vdW50OiAxIH0sXHJcbiAgICAgICAgICAgIHJlcXVpcmVzQ3JhZnRpbmdUYWJsZTogdHJ1ZSxcclxuICAgICAgICAgICAgdGltZVRvQ3JhZnQ6IDMgKiBUaWNrc1BlclNlY29uZCxcclxuICAgICAgICB9LFxyXG4gICAgICAgIC8vQ29wcGVyIGF4ZVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgaW5ncmVkaWVudHM6IFtcclxuICAgICAgICAgICAgICAgIHsgaWQ6IFwibWluZWNyYWZ0OmNvcHBlcl9pbmdvdFwiLCBhbW91bnQ6IDMgfSxcclxuICAgICAgICAgICAgICAgIHsgaWQ6IFwibWluZWNyYWZ0OnN0aWNrXCIsIGFtb3VudDogMiB9LFxyXG4gICAgICAgICAgICBdLFxyXG4gICAgICAgICAgICByZXN1bHQ6IHsgaWQ6IFwibWluZWNyYWZ0OmNvcHBlcl9heGVcIiwgYW1vdW50OiAxIH0sXHJcbiAgICAgICAgICAgIHJlcXVpcmVzQ3JhZnRpbmdUYWJsZTogdHJ1ZSxcclxuICAgICAgICAgICAgdGltZVRvQ3JhZnQ6IDMgKiBUaWNrc1BlclNlY29uZCxcclxuICAgICAgICB9LFxyXG4gICAgICAgIC8vQ29wcGVyIHNob3ZlbFxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgaW5ncmVkaWVudHM6IFtcclxuICAgICAgICAgICAgICAgIHsgaWQ6IFwibWluZWNyYWZ0OmNvcHBlcl9pbmdvdFwiLCBhbW91bnQ6IDEgfSxcclxuICAgICAgICAgICAgICAgIHsgaWQ6IFwibWluZWNyYWZ0OnN0aWNrXCIsIGFtb3VudDogMiB9LFxyXG4gICAgICAgICAgICBdLFxyXG4gICAgICAgICAgICByZXN1bHQ6IHsgaWQ6IFwibWluZWNyYWZ0OmNvcHBlcl9zaG92ZWxcIiwgYW1vdW50OiAxIH0sXHJcbiAgICAgICAgICAgIHJlcXVpcmVzQ3JhZnRpbmdUYWJsZTogdHJ1ZSxcclxuICAgICAgICAgICAgdGltZVRvQ3JhZnQ6IDMgKiBUaWNrc1BlclNlY29uZCxcclxuICAgICAgICB9LFxyXG4gICAgICAgIC8vQ29wcGVyIHN3b3JkXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBpbmdyZWRpZW50czogW1xyXG4gICAgICAgICAgICAgICAgeyBpZDogXCJtaW5lY3JhZnQ6Y29wcGVyX2luZ290XCIsIGFtb3VudDogMiB9LFxyXG4gICAgICAgICAgICAgICAgeyBpZDogXCJtaW5lY3JhZnQ6c3RpY2tcIiwgYW1vdW50OiAxIH0sXHJcbiAgICAgICAgICAgIF0sXHJcbiAgICAgICAgICAgIHJlc3VsdDogeyBpZDogXCJtaW5lY3JhZnQ6Y29wcGVyX3N3b3JkXCIsIGFtb3VudDogMSB9LFxyXG4gICAgICAgICAgICByZXF1aXJlc0NyYWZ0aW5nVGFibGU6IHRydWUsXHJcbiAgICAgICAgICAgIHRpbWVUb0NyYWZ0OiAzICogVGlja3NQZXJTZWNvbmQsXHJcbiAgICAgICAgfSxcclxuICAgICAgICAvL0NvcHBlciBoZWxtZXRcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGluZ3JlZGllbnRzOiBbeyBpZDogXCJtaW5lY3JhZnQ6Y29wcGVyX2luZ290XCIsIGFtb3VudDogNSB9XSxcclxuICAgICAgICAgICAgcmVzdWx0OiB7IGlkOiBcIm1pbmVjcmFmdDpjb3BwZXJfaGVsbWV0XCIsIGFtb3VudDogMSB9LFxyXG4gICAgICAgICAgICByZXF1aXJlc0NyYWZ0aW5nVGFibGU6IHRydWUsXHJcbiAgICAgICAgICAgIHRpbWVUb0NyYWZ0OiAzICogVGlja3NQZXJTZWNvbmQsXHJcbiAgICAgICAgfSxcclxuICAgICAgICAvL0NvcHBlciBjaGVzdHBsYXRlXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBpbmdyZWRpZW50czogW3sgaWQ6IFwibWluZWNyYWZ0OmNvcHBlcl9pbmdvdFwiLCBhbW91bnQ6IDggfV0sXHJcbiAgICAgICAgICAgIHJlc3VsdDogeyBpZDogXCJtaW5lY3JhZnQ6Y29wcGVyX2NoZXN0cGxhdGVcIiwgYW1vdW50OiAxIH0sXHJcbiAgICAgICAgICAgIHJlcXVpcmVzQ3JhZnRpbmdUYWJsZTogdHJ1ZSxcclxuICAgICAgICAgICAgdGltZVRvQ3JhZnQ6IDMgKiBUaWNrc1BlclNlY29uZCxcclxuICAgICAgICB9LFxyXG4gICAgICAgIC8vQ29wcGVyIGxlZ2dpbmdzXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBpbmdyZWRpZW50czogW3sgaWQ6IFwibWluZWNyYWZ0OmNvcHBlcl9pbmdvdFwiLCBhbW91bnQ6IDcgfV0sXHJcbiAgICAgICAgICAgIHJlc3VsdDogeyBpZDogXCJtaW5lY3JhZnQ6Y29wcGVyX2xlZ2dpbmdzXCIsIGFtb3VudDogMSB9LFxyXG4gICAgICAgICAgICByZXF1aXJlc0NyYWZ0aW5nVGFibGU6IHRydWUsXHJcbiAgICAgICAgICAgIHRpbWVUb0NyYWZ0OiAzICogVGlja3NQZXJTZWNvbmQsXHJcbiAgICAgICAgfSxcclxuICAgICAgICAvL0NvcHBlciBib290c1xyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgaW5ncmVkaWVudHM6IFt7IGlkOiBcIm1pbmVjcmFmdDpjb3BwZXJfaW5nb3RcIiwgYW1vdW50OiA0IH1dLFxyXG4gICAgICAgICAgICByZXN1bHQ6IHsgaWQ6IFwibWluZWNyYWZ0OmNvcHBlcl9ib290c1wiLCBhbW91bnQ6IDEgfSxcclxuICAgICAgICAgICAgcmVxdWlyZXNDcmFmdGluZ1RhYmxlOiB0cnVlLFxyXG4gICAgICAgICAgICB0aW1lVG9DcmFmdDogMyAqIFRpY2tzUGVyU2Vjb25kLFxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgLyoqKioqKioqKioqKlxyXG4gICAgICAgICAqIElST04gQUdFXHJcbiAgICAgICAgICoqKioqKioqKioqKi9cclxuXHJcbiAgICAgICAgLy9Jcm9uIHBpY2theGVcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGluZ3JlZGllbnRzOiBbXHJcbiAgICAgICAgICAgICAgICB7IGlkOiBcIm1pbmVjcmFmdDppcm9uX2luZ290XCIsIGFtb3VudDogMyB9LFxyXG4gICAgICAgICAgICAgICAgeyBpZDogXCJtaW5lY3JhZnQ6c3RpY2tcIiwgYW1vdW50OiAyIH0sXHJcbiAgICAgICAgICAgIF0sXHJcbiAgICAgICAgICAgIHJlc3VsdDogeyBpZDogXCJtaW5lY3JhZnQ6aXJvbl9waWNrYXhlXCIsIGFtb3VudDogMSB9LFxyXG4gICAgICAgICAgICByZXF1aXJlc0NyYWZ0aW5nVGFibGU6IHRydWUsXHJcbiAgICAgICAgICAgIHRpbWVUb0NyYWZ0OiAzICogVGlja3NQZXJTZWNvbmQsXHJcbiAgICAgICAgfSxcclxuICAgICAgICAvL0lyb24gYXhlXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBpbmdyZWRpZW50czogW1xyXG4gICAgICAgICAgICAgICAgeyBpZDogXCJtaW5lY3JhZnQ6aXJvbl9pbmdvdFwiLCBhbW91bnQ6IDMgfSxcclxuICAgICAgICAgICAgICAgIHsgaWQ6IFwibWluZWNyYWZ0OnN0aWNrXCIsIGFtb3VudDogMiB9LFxyXG4gICAgICAgICAgICBdLFxyXG4gICAgICAgICAgICByZXN1bHQ6IHsgaWQ6IFwibWluZWNyYWZ0Omlyb25fYXhlXCIsIGFtb3VudDogMSB9LFxyXG4gICAgICAgICAgICByZXF1aXJlc0NyYWZ0aW5nVGFibGU6IHRydWUsXHJcbiAgICAgICAgICAgIHRpbWVUb0NyYWZ0OiAzICogVGlja3NQZXJTZWNvbmQsXHJcbiAgICAgICAgfSxcclxuICAgICAgICAvL0lyb24gc2hvdmVsXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBpbmdyZWRpZW50czogW1xyXG4gICAgICAgICAgICAgICAgeyBpZDogXCJtaW5lY3JhZnQ6aXJvbl9pbmdvdFwiLCBhbW91bnQ6IDEgfSxcclxuICAgICAgICAgICAgICAgIHsgaWQ6IFwibWluZWNyYWZ0OnN0aWNrXCIsIGFtb3VudDogMiB9LFxyXG4gICAgICAgICAgICBdLFxyXG4gICAgICAgICAgICByZXN1bHQ6IHsgaWQ6IFwibWluZWNyYWZ0Omlyb25fc2hvdmVsXCIsIGFtb3VudDogMSB9LFxyXG4gICAgICAgICAgICByZXF1aXJlc0NyYWZ0aW5nVGFibGU6IHRydWUsXHJcbiAgICAgICAgICAgIHRpbWVUb0NyYWZ0OiAzICogVGlja3NQZXJTZWNvbmQsXHJcbiAgICAgICAgfSxcclxuICAgICAgICAvL0lyb24gc3dvcmRcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGluZ3JlZGllbnRzOiBbXHJcbiAgICAgICAgICAgICAgICB7IGlkOiBcIm1pbmVjcmFmdDppcm9uX2luZ290XCIsIGFtb3VudDogMiB9LFxyXG4gICAgICAgICAgICAgICAgeyBpZDogXCJtaW5lY3JhZnQ6c3RpY2tcIiwgYW1vdW50OiAxIH0sXHJcbiAgICAgICAgICAgIF0sXHJcbiAgICAgICAgICAgIHJlc3VsdDogeyBpZDogXCJtaW5lY3JhZnQ6aXJvbl9zd29yZFwiLCBhbW91bnQ6IDEgfSxcclxuICAgICAgICAgICAgcmVxdWlyZXNDcmFmdGluZ1RhYmxlOiB0cnVlLFxyXG4gICAgICAgICAgICB0aW1lVG9DcmFmdDogMyAqIFRpY2tzUGVyU2Vjb25kLFxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgLy9Jcm9uIGhlbG1ldFxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgaW5ncmVkaWVudHM6IFt7IGlkOiBcIm1pbmVjcmFmdDppcm9uX2luZ290XCIsIGFtb3VudDogNSB9XSxcclxuICAgICAgICAgICAgcmVzdWx0OiB7IGlkOiBcIm1pbmVjcmFmdDppcm9uX2hlbG1ldFwiLCBhbW91bnQ6IDEgfSxcclxuICAgICAgICAgICAgcmVxdWlyZXNDcmFmdGluZ1RhYmxlOiB0cnVlLFxyXG4gICAgICAgICAgICB0aW1lVG9DcmFmdDogMyAqIFRpY2tzUGVyU2Vjb25kLFxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgLy9Jcm9uIGNoZXN0cGxhdGVcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGluZ3JlZGllbnRzOiBbeyBpZDogXCJtaW5lY3JhZnQ6aXJvbl9pbmdvdFwiLCBhbW91bnQ6IDggfV0sXHJcbiAgICAgICAgICAgIHJlc3VsdDogeyBpZDogXCJtaW5lY3JhZnQ6aXJvbl9jaGVzdHBsYXRlXCIsIGFtb3VudDogMSB9LFxyXG4gICAgICAgICAgICByZXF1aXJlc0NyYWZ0aW5nVGFibGU6IHRydWUsXHJcbiAgICAgICAgICAgIHRpbWVUb0NyYWZ0OiAzICogVGlja3NQZXJTZWNvbmQsXHJcbiAgICAgICAgfSxcclxuICAgICAgICAvL0lyb24gbGVnZ2luZ3NcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGluZ3JlZGllbnRzOiBbeyBpZDogXCJtaW5lY3JhZnQ6aXJvbl9pbmdvdFwiLCBhbW91bnQ6IDcgfV0sXHJcbiAgICAgICAgICAgIHJlc3VsdDogeyBpZDogXCJtaW5lY3JhZnQ6aXJvbl9sZWdnaW5nc1wiLCBhbW91bnQ6IDEgfSxcclxuICAgICAgICAgICAgcmVxdWlyZXNDcmFmdGluZ1RhYmxlOiB0cnVlLFxyXG4gICAgICAgICAgICB0aW1lVG9DcmFmdDogMyAqIFRpY2tzUGVyU2Vjb25kLFxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgLy9Jcm9uIGJvb3RzXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBpbmdyZWRpZW50czogW3sgaWQ6IFwibWluZWNyYWZ0Omlyb25faW5nb3RcIiwgYW1vdW50OiA0IH1dLFxyXG4gICAgICAgICAgICByZXN1bHQ6IHsgaWQ6IFwibWluZWNyYWZ0Omlyb25fYm9vdHNcIiwgYW1vdW50OiAxIH0sXHJcbiAgICAgICAgICAgIHJlcXVpcmVzQ3JhZnRpbmdUYWJsZTogdHJ1ZSxcclxuICAgICAgICAgICAgdGltZVRvQ3JhZnQ6IDMgKiBUaWNrc1BlclNlY29uZCxcclxuICAgICAgICB9LFxyXG4gICAgICAgIC8qKioqKioqKioqKipcclxuICAgICAgICAgKiBESUFNT05EIEFHRVxyXG4gICAgICAgICAqKioqKioqKioqKiovXHJcblxyXG4gICAgICAgIC8vRGlhbW9uZCBwaWNrYXhlXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBpbmdyZWRpZW50czogW1xyXG4gICAgICAgICAgICAgICAgeyBpZDogXCJtaW5lY3JhZnQ6ZGlhbW9uZFwiLCBhbW91bnQ6IDMgfSxcclxuICAgICAgICAgICAgICAgIHsgaWQ6IFwibWluZWNyYWZ0OnN0aWNrXCIsIGFtb3VudDogMiB9LFxyXG4gICAgICAgICAgICBdLFxyXG4gICAgICAgICAgICByZXN1bHQ6IHsgaWQ6IFwibWluZWNyYWZ0OmRpYW1vbmRfcGlja2F4ZVwiLCBhbW91bnQ6IDEgfSxcclxuICAgICAgICAgICAgcmVxdWlyZXNDcmFmdGluZ1RhYmxlOiB0cnVlLFxyXG4gICAgICAgICAgICB0aW1lVG9DcmFmdDogMyAqIFRpY2tzUGVyU2Vjb25kLFxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgLy9EaWFtb25kIGF4ZVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgaW5ncmVkaWVudHM6IFtcclxuICAgICAgICAgICAgICAgIHsgaWQ6IFwibWluZWNyYWZ0OmRpYW1vbmRcIiwgYW1vdW50OiAzIH0sXHJcbiAgICAgICAgICAgICAgICB7IGlkOiBcIm1pbmVjcmFmdDpzdGlja1wiLCBhbW91bnQ6IDIgfSxcclxuICAgICAgICAgICAgXSxcclxuICAgICAgICAgICAgcmVzdWx0OiB7IGlkOiBcIm1pbmVjcmFmdDpkaWFtb25kX2F4ZVwiLCBhbW91bnQ6IDEgfSxcclxuICAgICAgICAgICAgcmVxdWlyZXNDcmFmdGluZ1RhYmxlOiB0cnVlLFxyXG4gICAgICAgICAgICB0aW1lVG9DcmFmdDogMyAqIFRpY2tzUGVyU2Vjb25kLFxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgLy9EaWFtb25kIHNob3ZlbFxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgaW5ncmVkaWVudHM6IFtcclxuICAgICAgICAgICAgICAgIHsgaWQ6IFwibWluZWNyYWZ0OmRpYW1vbmRcIiwgYW1vdW50OiAxIH0sXHJcbiAgICAgICAgICAgICAgICB7IGlkOiBcIm1pbmVjcmFmdDpzdGlja1wiLCBhbW91bnQ6IDIgfSxcclxuICAgICAgICAgICAgXSxcclxuICAgICAgICAgICAgcmVzdWx0OiB7IGlkOiBcIm1pbmVjcmFmdDpkaWFtb25kX3Nob3ZlbFwiLCBhbW91bnQ6IDEgfSxcclxuICAgICAgICAgICAgcmVxdWlyZXNDcmFmdGluZ1RhYmxlOiB0cnVlLFxyXG4gICAgICAgICAgICB0aW1lVG9DcmFmdDogMyAqIFRpY2tzUGVyU2Vjb25kLFxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgLy9EaWFtb25kIHN3b3JkXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBpbmdyZWRpZW50czogW1xyXG4gICAgICAgICAgICAgICAgeyBpZDogXCJtaW5lY3JhZnQ6ZGlhbW9uZFwiLCBhbW91bnQ6IDIgfSxcclxuICAgICAgICAgICAgICAgIHsgaWQ6IFwibWluZWNyYWZ0OnN0aWNrXCIsIGFtb3VudDogMSB9LFxyXG4gICAgICAgICAgICBdLFxyXG4gICAgICAgICAgICByZXN1bHQ6IHsgaWQ6IFwibWluZWNyYWZ0OmRpYW1vbmRfc3dvcmRcIiwgYW1vdW50OiAxIH0sXHJcbiAgICAgICAgICAgIHJlcXVpcmVzQ3JhZnRpbmdUYWJsZTogdHJ1ZSxcclxuICAgICAgICAgICAgdGltZVRvQ3JhZnQ6IDMgKiBUaWNrc1BlclNlY29uZCxcclxuICAgICAgICB9LFxyXG4gICAgICAgIC8vRGlhbW9uZCBoZWxtZXRcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGluZ3JlZGllbnRzOiBbeyBpZDogXCJtaW5lY3JhZnQ6ZGlhbW9uZFwiLCBhbW91bnQ6IDUgfV0sXHJcbiAgICAgICAgICAgIHJlc3VsdDogeyBpZDogXCJtaW5lY3JhZnQ6ZGlhbW9uZF9oZWxtZXRcIiwgYW1vdW50OiAxIH0sXHJcbiAgICAgICAgICAgIHJlcXVpcmVzQ3JhZnRpbmdUYWJsZTogdHJ1ZSxcclxuICAgICAgICAgICAgdGltZVRvQ3JhZnQ6IDMgKiBUaWNrc1BlclNlY29uZCxcclxuICAgICAgICB9LFxyXG4gICAgICAgIC8vRGlhbW9uZCBjaGVzdHBsYXRlXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBpbmdyZWRpZW50czogW3sgaWQ6IFwibWluZWNyYWZ0OmRpYW1vbmRcIiwgYW1vdW50OiA4IH1dLFxyXG4gICAgICAgICAgICByZXN1bHQ6IHsgaWQ6IFwibWluZWNyYWZ0OmRpYW1vbmRfY2hlc3RwbGF0ZVwiLCBhbW91bnQ6IDEgfSxcclxuICAgICAgICAgICAgcmVxdWlyZXNDcmFmdGluZ1RhYmxlOiB0cnVlLFxyXG4gICAgICAgICAgICB0aW1lVG9DcmFmdDogMyAqIFRpY2tzUGVyU2Vjb25kLFxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgLy9EaWFtb25kIGxlZ2dpbmdzXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBpbmdyZWRpZW50czogW3sgaWQ6IFwibWluZWNyYWZ0OmRpYW1vbmRcIiwgYW1vdW50OiA3IH1dLFxyXG4gICAgICAgICAgICByZXN1bHQ6IHsgaWQ6IFwibWluZWNyYWZ0OmRpYW1vbmRfbGVnZ2luZ3NcIiwgYW1vdW50OiAxIH0sXHJcbiAgICAgICAgICAgIHJlcXVpcmVzQ3JhZnRpbmdUYWJsZTogdHJ1ZSxcclxuICAgICAgICAgICAgdGltZVRvQ3JhZnQ6IDMgKiBUaWNrc1BlclNlY29uZCxcclxuICAgICAgICB9LFxyXG4gICAgICAgIC8vRGlhbW9uZCBib290c1xyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgaW5ncmVkaWVudHM6IFt7IGlkOiBcIm1pbmVjcmFmdDpkaWFtb25kXCIsIGFtb3VudDogNCB9XSxcclxuICAgICAgICAgICAgcmVzdWx0OiB7IGlkOiBcIm1pbmVjcmFmdDpkaWFtb25kX2Jvb3RzXCIsIGFtb3VudDogMSB9LFxyXG4gICAgICAgICAgICByZXF1aXJlc0NyYWZ0aW5nVGFibGU6IHRydWUsXHJcbiAgICAgICAgICAgIHRpbWVUb0NyYWZ0OiAzICogVGlja3NQZXJTZWNvbmQsXHJcbiAgICAgICAgfSxcclxuXHJcbiAgICAgICAgLyoqKioqKioqKioqKlxyXG4gICAgICAgICAqIEVWRVJHUkVFTiBBR0VcclxuICAgICAgICAgKioqKioqKioqKioqL1xyXG4gICAgICAgIC8vQ29wcGVyIGJsb2NrXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBpbmdyZWRpZW50czogW3sgaWQ6IFwibWluZWNyYWZ0OmNvcHBlcl9pbmdvdFwiLCBhbW91bnQ6IDkgfV0sXHJcbiAgICAgICAgICAgIHJlc3VsdDogeyBpZDogXCJtaW5lY3JhZnQ6Y29wcGVyX2Jsb2NrXCIsIGFtb3VudDogMSB9LFxyXG4gICAgICAgICAgICByZXF1aXJlc0NyYWZ0aW5nVGFibGU6IHRydWUsXHJcbiAgICAgICAgICAgIHRpbWVUb0NyYWZ0OiAzICogVGlja3NQZXJTZWNvbmQsXHJcbiAgICAgICAgfSxcclxuICAgICAgICAvL0lyb24gYmxvY2tcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGluZ3JlZGllbnRzOiBbeyBpZDogXCJtaW5lY3JhZnQ6aXJvbl9pbmdvdFwiLCBhbW91bnQ6IDkgfV0sXHJcbiAgICAgICAgICAgIHJlc3VsdDogeyBpZDogXCJtaW5lY3JhZnQ6aXJvbl9ibG9ja1wiLCBhbW91bnQ6IDEgfSxcclxuICAgICAgICAgICAgcmVxdWlyZXNDcmFmdGluZ1RhYmxlOiB0cnVlLFxyXG4gICAgICAgICAgICB0aW1lVG9DcmFmdDogMyAqIFRpY2tzUGVyU2Vjb25kLFxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgLy9Hb2xkIGJsb2NrXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBpbmdyZWRpZW50czogW3sgaWQ6IFwibWluZWNyYWZ0OmdvbGRfaW5nb3RcIiwgYW1vdW50OiA5IH1dLFxyXG4gICAgICAgICAgICByZXN1bHQ6IHsgaWQ6IFwibWluZWNyYWZ0OmdvbGRfYmxvY2tcIiwgYW1vdW50OiAxIH0sXHJcbiAgICAgICAgICAgIHJlcXVpcmVzQ3JhZnRpbmdUYWJsZTogdHJ1ZSxcclxuICAgICAgICAgICAgdGltZVRvQ3JhZnQ6IDMgKiBUaWNrc1BlclNlY29uZCxcclxuICAgICAgICB9LFxyXG4gICAgICAgIC8vRGlhbW9uZCBibG9ja1xyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgaW5ncmVkaWVudHM6IFt7IGlkOiBcIm1pbmVjcmFmdDpkaWFtb25kXCIsIGFtb3VudDogOSB9XSxcclxuICAgICAgICAgICAgcmVzdWx0OiB7IGlkOiBcIm1pbmVjcmFmdDpkaWFtb25kX2Jsb2NrXCIsIGFtb3VudDogMSB9LFxyXG4gICAgICAgICAgICByZXF1aXJlc0NyYWZ0aW5nVGFibGU6IHRydWUsXHJcbiAgICAgICAgICAgIHRpbWVUb0NyYWZ0OiAzICogVGlja3NQZXJTZWNvbmQsXHJcbiAgICAgICAgfSxcclxuICAgICAgICAvL0xhcGlzIGJsb2NrXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBpbmdyZWRpZW50czogW3sgaWQ6IFwibWluZWNyYWZ0OmxhcGlzX2xhenVsaVwiLCBhbW91bnQ6IDkgfV0sXHJcbiAgICAgICAgICAgIHJlc3VsdDogeyBpZDogXCJtaW5lY3JhZnQ6bGFwaXNfYmxvY2tcIiwgYW1vdW50OiAxIH0sXHJcbiAgICAgICAgICAgIHJlcXVpcmVzQ3JhZnRpbmdUYWJsZTogdHJ1ZSxcclxuICAgICAgICAgICAgdGltZVRvQ3JhZnQ6IDMgKiBUaWNrc1BlclNlY29uZCxcclxuICAgICAgICB9LFxyXG4gICAgICAgIC8vUmVkc3RvbmUgYmxvY2tcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGluZ3JlZGllbnRzOiBbeyBpZDogXCJtaW5lY3JhZnQ6cmVkc3RvbmVcIiwgYW1vdW50OiA5IH1dLFxyXG4gICAgICAgICAgICByZXN1bHQ6IHsgaWQ6IFwibWluZWNyYWZ0OnJlZHN0b25lX2Jsb2NrXCIsIGFtb3VudDogMSB9LFxyXG4gICAgICAgICAgICByZXF1aXJlc0NyYWZ0aW5nVGFibGU6IHRydWUsXHJcbiAgICAgICAgICAgIHRpbWVUb0NyYWZ0OiAzICogVGlja3NQZXJTZWNvbmQsXHJcbiAgICAgICAgfSxcclxuICAgICAgICAvL0VtZXJhbGQgYmxvY2tcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGluZ3JlZGllbnRzOiBbeyBpZDogXCJtaW5lY3JhZnQ6ZW1lcmFsZFwiLCBhbW91bnQ6IDkgfV0sXHJcbiAgICAgICAgICAgIHJlc3VsdDogeyBpZDogXCJtaW5lY3JhZnQ6ZW1lcmFsZF9ibG9ja1wiLCBhbW91bnQ6IDEgfSxcclxuICAgICAgICAgICAgcmVxdWlyZXNDcmFmdGluZ1RhYmxlOiB0cnVlLFxyXG4gICAgICAgICAgICB0aW1lVG9DcmFmdDogMyAqIFRpY2tzUGVyU2Vjb25kLFxyXG4gICAgICAgIH0sXHJcbiAgICBdO1xyXG59XHJcbiJdLCJuYW1lcyI6WyJUaWNrc1BlclNlY29uZCIsIkNyYWZ0aW5nVHJlZURhdGEiLCJSYXdNYXRlcmlhbFRvU21lbHRlZE1hdGVyaWFsTWFwIiwiU3RvbmVGYW1pbHkiLCJXb29kRmFtaWxpZXMiLCJsb2ciLCJzdHJpcHBlZExvZyIsIndvb2QiLCJzdHJpcHBlZFdvb2QiLCJwbGFua3MiLCJSZWNpcGVzIiwiaW5ncmVkaWVudHMiLCJpZCIsImFtb3VudCIsInJlc3VsdCIsInJlcXVpcmVzQ3JhZnRpbmdUYWJsZSIsInRpbWVUb0NyYWZ0Il0sIm1hcHBpbmdzIjoiQUFBQSw0QkFBNEIsR0FDNUIsU0FBU0EsY0FBYyxRQUFRLG9CQUFvQjtBQXNCcEMsTUFBTUM7QUFrZnJCO0FBamZJLGlGQUFpRixHQURoRUEs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