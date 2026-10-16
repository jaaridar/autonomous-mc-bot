// One module now: core/goal-decomposition.js + core/resource.js (see docs/ARCHITECTURE.md).
import { isCritical, retainScore } from "./knowledge.js";
import { amountOf } from "./recipes.js";

// ---------------------------------------------------------------- goal-decomposition.js

/**
 * Hierarchical Goal Decomposition - structured, tagged with hierarchy
 * Every goal expands into subgoals/tasks/prerequisites/actions
 * Reuses recipe resolver but exposes full dependency tree
 */

export const HIERARCHY = {
    MISSION: 0,      // top level: SPEEDRUN_NETHER, SURVIVAL, FOLLOW_OWNER
    PHASE: 1,        // WOOD, STONE, IRON, DIAMOND, PORTAL, NETHER
    GOAL: 2,         // craft iron_pickaxe, enter nether, mine diamond
    SUBGOAL: 3,      // have 3 iron_ingot, have 2 sticks
    TASK: 4,         // smelt raw_iron, mine iron_ore, craft planks
    PREREQUISITE: 5, // have furnace, have fuel, have stone_pickaxe, near table
    ACTION: 6        // find_ore, move_to, break_block, place_block, craft_item
};

export const TAGS = {
    ESSENTIAL: "essential",
    OPTIONAL: "optional",
    PROGRESSION: "progression",
    RESOURCE: "resource",
    TOOL: "tool",
    CRAFTING: "crafting",
    SMELTING: "smelting",
    NAVIGATION: "navigation",
    COMBAT: "combat",
    SURVIVAL: "survival",
    FUEL: "fuel",
    BUILDING: "building",
    FOOD: "food",
    EXPLORATION: "exploration"
};

// Any log types acceptable - fixes oak-only search bug
export const ANY_LOG_TYPES = [
    "minecraft:oak_log", "minecraft:birch_log", "minecraft:spruce_log",
    "minecraft:jungle_log", "minecraft:acacia_log", "minecraft:dark_oak_log",
    "minecraft:mangrove_log", "minecraft:cherry_log", "minecraft:pale_oak_log",
    "minecraft:crimson_stem", "minecraft:warped_stem",
    "minecraft:stripped_oak_log", "minecraft:stripped_birch_log",
    "minecraft:bamboo_block", "minecraft:bamboo"
];

export const ANY_WOOD_PATTERN = /(_log|_wood|_stem|_hyphae|bamboo_block|bamboo$)/;

export function isAnyLog(typeId) {
    return ANY_WOOD_PATTERN.test(typeId) || ANY_LOG_TYPES.includes(typeId);
}

export function isAnyWoodRequest(target) {
    if (!target) return false;
    if (target === "#logs" || target === "#planks") return true;
    if (target.endsWith("_log") || target.endsWith("_wood") || target.includes("_stem") || target.includes("bamboo")) return true;
    return false;
}

// Goal Node definition with full hierarchy
export class GoalNode {
    constructor({ id, hierarchy, tags = [], display, requires = {}, provides = {}, children = [], priority = 50, estimatedTime = 60, danger = 0, reason }) {
        this.id = id;
        this.hierarchy = hierarchy;
        this.hierarchyName = Object.keys(HIERARCHY).find(k => HIERARCHY[k] === hierarchy) || "UNKNOWN";
        this.tags = tags;
        this.display = display || id;
        this.requires = requires; // { items: [{id,count, alternatives}], tools: [{tool,tier}], conditions: [{type, value}], prerequisites: [{id}] }
        this.provides = provides; // { items: [{id,count}], state: "can_mine_diamond" }
        this.children = children; // GoalNode[]
        this.priority = priority;
        this.estimatedTime = estimatedTime;
        this.danger = danger;
        this.reason = reason || "";
        this.failCount = 0;
        this.lastFail = null;
    }

    // Get all prerequisites recursively
    getAllPrerequisites() {
        const prereqs = [];
        const walk = (node) => {
            if (node.hierarchy === HIERARCHY.PREREQUISITE) prereqs.push(node);
            for (const child of node.children) walk(child);
        };
        walk(this);
        return prereqs;
    }

    // Get all actions leaf nodes
    getAllActions() {
        const actions = [];
        const walk = (node) => {
            if (node.hierarchy === HIERARCHY.ACTION) actions.push(node);
            for (const child of node.children) walk(child);
        };
        walk(this);
        return actions;
    }

    // Flatten to list with hierarchy path
    flatten(prefix = []) {
        const path = [...prefix, this.id];
        const result = [{ node: this, path, depth: prefix.length }];
        for (const child of this.children) {
            result.push(...child.flatten(path));
        }
        return result;
    }

    // Check if requirements met given inventory
    isMet(inventory, conditions = {}) {
        // Check items
        if (this.requires.items) {
            for (const req of this.requires.items) {
                const have = inventory[req.id] ?? 0;
                // Check alternatives (any log)
                if (req.alternatives && isAnyWoodRequest(req.id)) {
                    const anyHave = Object.entries(inventory)
                        .filter(([k]) => isAnyLog(k) || req.alternatives.includes(k))
                        .reduce((a, [, v]) => a + v, 0);
                    if (anyHave < req.count) return false;
                } else {
                    if (have < req.count) return false;
                }
            }
        }
        // Check tools
        if (this.requires.tools) {
            for (const toolReq of this.requires.tools) {
                const hasTool = Object.keys(inventory).some(k => 
                    k.includes(toolReq.tool) && (inventory[k] > 0) &&
                    (!toolReq.tier || getToolTier(k) >= toolReq.tier)
                );
                if (!hasTool) return false;
            }
        }
        // Check conditions
        if (this.requires.conditions) {
            for (const cond of this.requires.conditions) {
                if (conditions[cond.type] === undefined) continue;
                if (cond.type === "near_table" && !conditions.near_table) return false;
                if (cond.type === "inventory_space" && (conditions.inventory_space ?? 0) < cond.min) return false;
            }
        }
        return true;
    }
}

function getToolTier(typeId) {
    if (typeId.includes("netherite_")) return 5;
    if (typeId.includes("diamond_")) return 4;
    if (typeId.includes("iron_")) return 3;
    if (typeId.includes("stone_")) return 2;
    if (typeId.includes("wooden_") || typeId.includes("golden_")) return 1;
    return 0;
}

// Predefined goal decompositions with full hierarchy

export function decomposeWoodTools() {
    return new GoalNode({
        id: "wood_tools",
        hierarchy: HIERARCHY.PHASE,
        tags: [TAGS.ESSENTIAL, TAGS.PROGRESSION],
        display: "Wood Phase: Gather any wood + craft tools",
        priority: 100,
        reason: "First phase - quick tool priority #1, never bare hand",
        children: [
            new GoalNode({
                id: "any_logs_3",
                hierarchy: HIERARCHY.GOAL,
                tags: [TAGS.ESSENTIAL, TAGS.RESOURCE],
                display: "Gather 3 any logs (oak/birch/spruce/jungle/acacia/dark/mangrove/cherry/pale/crimson/warped/bamboo)",
                requires: { items: [] },
                provides: { items: [{ id: "#logs", count: 3 }] },
                priority: 100,
                children: [
                    new GoalNode({
                        id: "find_any_tree",
                        hierarchy: HIERARCHY.TASK,
                        tags: [TAGS.EXPLORATION, TAGS.NAVIGATION],
                        display: "Find any tree within 32 blocks",
                        children: [
                            new GoalNode({
                                id: "scan_any_log",
                                hierarchy: HIERARCHY.ACTION,
                                tags: [TAGS.NAVIGATION],
                                display: "Scan for any _log/_wood/_stem/bamboo",
                                requires: { conditions: [{ type: "scan_radius", value: 32 }] }
                            })
                        ]
                    }),
                    new GoalNode({
                        id: "mine_any_log",
                        hierarchy: HIERARCHY.TASK,
                        tags: [TAGS.RESOURCE],
                        display: "Mine any log - direct break, no oak-only",
                        requires: { tools: [{ tool: "axe", tier: 0, optional: true }] },
                        children: [
                            new GoalNode({
                                id: "approach_log",
                                hierarchy: HIERARCHY.ACTION,
                                tags: [TAGS.NAVIGATION],
                                display: "Move to log within 5 blocks"
                            }),
                            new GoalNode({
                                id: "break_log",
                                hierarchy: HIERARCHY.ACTION,
                                tags: [TAGS.RESOURCE],
                                display: "Break log - handles logs up to 6 high directly",
                                requires: { conditions: [{ type: "line_of_sight", value: true }] }
                            })
                        ]
                    })
                ]
            }),
            new GoalNode({
                id: "planks_4",
                hierarchy: HIERARCHY.GOAL,
                tags: [TAGS.ESSENTIAL, TAGS.CRAFTING],
                display: "Craft 4 planks from any logs",
                requires: { items: [{ id: "#logs", count: 1, alternatives: ANY_LOG_TYPES }] },
                children: [
                    new GoalNode({
                        id: "have_logs",
                        hierarchy: HIERARCHY.PREREQUISITE,
                        tags: [TAGS.RESOURCE],
                        display: "Have any logs",
                        requires: { items: [{ id: "#logs", count: 1 }] }
                    }),
                    new GoalNode({
                        id: "craft_planks",
                        hierarchy: HIERARCHY.ACTION,
                        tags: [TAGS.CRAFTING],
                        display: "Craft planks (4 per log)"
                    })
                ]
            }),
            new GoalNode({
                id: "crafting_table",
                hierarchy: HIERARCHY.GOAL,
                tags: [TAGS.ESSENTIAL, TAGS.CRAFTING],
                display: "Craft crafting table",
                requires: { items: [{ id: "#planks", count: 4 }] },
                children: [
                    new GoalNode({
                        id: "have_planks_4",
                        hierarchy: HIERARCHY.PREREQUISITE,
                        tags: [TAGS.RESOURCE],
                        display: "Have 4 planks"
                    }),
                    new GoalNode({
                        id: "craft_table",
                        hierarchy: HIERARCHY.ACTION,
                        tags: [TAGS.CRAFTING],
                        display: "Craft crafting table"
                    })
                ]
            }),
            new GoalNode({
                id: "wooden_pickaxe",
                hierarchy: HIERARCHY.GOAL,
                tags: [TAGS.ESSENTIAL, TAGS.TOOL],
                display: "Craft wooden pickaxe",
                requires: { items: [{ id: "#planks", count: 3 }, { id: "minecraft:stick", count: 2 }], conditions: [{ type: "near_table", value: true }] },
                provides: { items: [{ id: "minecraft:wooden_pickaxe", count: 1 }], state: "can_mine_stone" },
                children: [
                    new GoalNode({
                        id: "sticks_2",
                        hierarchy: HIERARCHY.SUBGOAL,
                        tags: [TAGS.RESOURCE],
                        display: "Have 2 sticks",
                        requires: { items: [{ id: "#planks", count: 2 }] },
                        children: [
                            new GoalNode({
                                id: "craft_sticks",
                                hierarchy: HIERARCHY.ACTION,
                                tags: [TAGS.CRAFTING],
                                display: "Craft sticks"
                            })
                        ]
                    }),
                    new GoalNode({
                        id: "have_table_near",
                        hierarchy: HIERARCHY.PREREQUISITE,
                        tags: [TAGS.CRAFTING],
                        display: "Have crafting table nearby"
                    }),
                    new GoalNode({
                        id: "craft_wooden_pickaxe",
                        hierarchy: HIERARCHY.ACTION,
                        tags: [TAGS.CRAFTING],
                        display: "Craft wooden pickaxe"
                    })
                ]
            }),
            new GoalNode({
                id: "wooden_sword",
                hierarchy: HIERARCHY.GOAL,
                tags: [TAGS.ESSENTIAL, TAGS.COMBAT],
                display: "Craft wooden sword - never bare hand",
                requires: { items: [{ id: "#planks", count: 2 }, { id: "minecraft:stick", count: 1 }] },
                provides: { state: "has_weapon" },
                priority: 95,
                children: [
                    new GoalNode({
                        id: "craft_wooden_sword",
                        hierarchy: HIERARCHY.ACTION,
                        tags: [TAGS.CRAFTING, TAGS.COMBAT],
                        display: "Craft wooden sword"
                    })
                ]
            })
        ]
    });
}

export function decomposeStoneTools() {
    return new GoalNode({
        id: "stone_tools",
        hierarchy: HIERARCHY.PHASE,
        tags: [TAGS.ESSENTIAL, TAGS.PROGRESSION],
        display: "Stone Phase: Cobblestone + stone tools + furnace",
        priority: 90,
        children: [
            new GoalNode({
                id: "cobblestone_20",
                hierarchy: HIERARCHY.GOAL,
                tags: [TAGS.ESSENTIAL, TAGS.RESOURCE],
                display: "Mine 20 cobblestone",
                requires: { tools: [{ tool: "pickaxe", tier: 1 }] },
                children: [
                    new GoalNode({
                        id: "have_wooden_pickaxe",
                        hierarchy: HIERARCHY.PREREQUISITE,
                        tags: [TAGS.TOOL],
                        display: "Have wooden pickaxe",
                        requires: { items: [{ id: "minecraft:wooden_pickaxe", count: 1, alternatives: ["minecraft:stone_pickaxe", "minecraft:iron_pickaxe"] }] }
                    }),
                    new GoalNode({
                        id: "find_stone",
                        hierarchy: HIERARCHY.TASK,
                        tags: [TAGS.EXPLORATION],
                        display: "Find stone/cobblestone",
                        children: [
                            new GoalNode({ id: "scan_stone", hierarchy: HIERARCHY.ACTION, tags: [TAGS.NAVIGATION], display: "Scan for stone" }),
                            new GoalNode({ id: "mine_stone", hierarchy: HIERARCHY.ACTION, tags: [TAGS.RESOURCE], display: "Mine stone" })
                        ]
                    })
                ]
            }),
            new GoalNode({
                id: "stone_pickaxe",
                hierarchy: HIERARCHY.GOAL,
                tags: [TAGS.ESSENTIAL, TAGS.TOOL],
                display: "Craft stone pickaxe",
                requires: { items: [{ id: "minecraft:cobblestone", count: 3 }, { id: "minecraft:stick", count: 2 }] },
                provides: { state: "can_mine_iron" },
                children: [
                    new GoalNode({ id: "craft_stone_pickaxe", hierarchy: HIERARCHY.ACTION, tags: [TAGS.CRAFTING], display: "Craft stone pickaxe" })
                ]
            }),
            new GoalNode({
                id: "furnace",
                hierarchy: HIERARCHY.GOAL,
                tags: [TAGS.ESSENTIAL, TAGS.CRAFTING],
                display: "Craft furnace",
                requires: { items: [{ id: "minecraft:cobblestone", count: 8 }] },
                children: [
                    new GoalNode({ id: "craft_furnace", hierarchy: HIERARCHY.ACTION, tags: [TAGS.CRAFTING], display: "Craft furnace" })
                ]
            })
        ]
    });
}

export function decomposeIronTools() {
    return new GoalNode({
        id: "iron_tools",
        hierarchy: HIERARCHY.PHASE,
        tags: [TAGS.ESSENTIAL, TAGS.PROGRESSION],
        display: "Iron Phase: Iron ingot + iron tools + bucket + shield",
        priority: 85,
        children: [
            new GoalNode({
                id: "raw_iron_12",
                hierarchy: HIERARCHY.GOAL,
                tags: [TAGS.ESSENTIAL, TAGS.RESOURCE],
                display: "Mine 12 raw iron",
                requires: { tools: [{ tool: "pickaxe", tier: 2 }] },
                children: [
                    new GoalNode({
                        id: "have_stone_pickaxe",
                        hierarchy: HIERARCHY.PREREQUISITE,
                        tags: [TAGS.TOOL],
                        display: "Have stone pickaxe"
                    }),
                    new GoalNode({
                        id: "find_iron_ore",
                        hierarchy: HIERARCHY.TASK,
                        tags: [TAGS.EXPLORATION],
                        display: "Find iron ore Y=-20 to 50",
                        children: [
                            new GoalNode({ id: "scan_iron", hierarchy: HIERARCHY.ACTION, tags: [TAGS.NAVIGATION], display: "Scan for iron_ore" }),
                            new GoalNode({ id: "deep_mine_iron", hierarchy: HIERARCHY.TASK, tags: [TAGS.RESOURCE], display: "Deep mine to Y=16 if needed" })
                        ]
                    }),
                    new GoalNode({
                        id: "mine_iron_ore",
                        hierarchy: HIERARCHY.ACTION,
                        tags: [TAGS.RESOURCE],
                        display: "Mine iron ore"
                    })
                ]
            }),
            new GoalNode({
                id: "iron_ingot_12",
                hierarchy: HIERARCHY.GOAL,
                tags: [TAGS.ESSENTIAL, TAGS.SMELTING],
                display: "Smelt 12 iron ingot",
                requires: { items: [{ id: "minecraft:raw_iron", count: 12 }] },
                children: [
                    new GoalNode({
                        id: "have_furnace",
                        hierarchy: HIERARCHY.PREREQUISITE,
                        tags: [TAGS.CRAFTING],
                        display: "Have furnace placed"
                    }),
                    new GoalNode({
                        id: "have_fuel",
                        hierarchy: HIERARCHY.PREREQUISITE,
                        tags: [TAGS.FUEL],
                        display: "Have fuel (coal/charcoal/planks)",
                        requires: { items: [{ id: "#fuel", count: 4, alternatives: ["minecraft:coal", "minecraft:charcoal", "#planks"] }] }
                    }),
                    new GoalNode({
                        id: "smelt_iron",
                        hierarchy: HIERARCHY.ACTION,
                        tags: [TAGS.SMELTING],
                        display: "Smelt raw iron in furnace"
                    })
                ]
            }),
            new GoalNode({
                id: "iron_pickaxe",
                hierarchy: HIERARCHY.GOAL,
                tags: [TAGS.ESSENTIAL, TAGS.TOOL],
                display: "Craft iron pickaxe",
                requires: { items: [{ id: "minecraft:iron_ingot", count: 3 }, { id: "minecraft:stick", count: 2 }] },
                provides: { state: "can_mine_diamond_obsidian" },
                priority: 90,
                children: [
                    new GoalNode({ id: "craft_iron_pickaxe", hierarchy: HIERARCHY.ACTION, tags: [TAGS.CRAFTING], display: "Craft iron pickaxe" })
                ]
            }),
            new GoalNode({
                id: "bucket",
                hierarchy: HIERARCHY.GOAL,
                tags: [TAGS.ESSENTIAL, TAGS.PROGRESSION],
                display: "Craft bucket - enables water/lava, major milestone",
                requires: { items: [{ id: "minecraft:iron_ingot", count: 3 }] },
                provides: { state: "can_make_obsidian" },
                priority: 95,
                children: [
                    new GoalNode({ id: "craft_bucket", hierarchy: HIERARCHY.ACTION, tags: [TAGS.CRAFTING], display: "Craft bucket" })
                ]
            }),
            new GoalNode({
                id: "shield",
                hierarchy: HIERARCHY.GOAL,
                tags: [TAGS.ESSENTIAL, TAGS.COMBAT],
                display: "Craft shield - defense vs skeleton swarm",
                requires: { items: [{ id: "minecraft:iron_ingot", count: 6 }, { id: "#planks", count: 1 }] },
                priority: 85,
                children: [
                    new GoalNode({ id: "craft_shield", hierarchy: HIERARCHY.ACTION, tags: [TAGS.CRAFTING], display: "Craft shield" })
                ]
            })
        ]
    });
}

export function decomposeFollowOwner() {
    return new GoalNode({
        id: "follow_owner",
        hierarchy: HIERARCHY.MISSION,
        tags: [TAGS.ESSENTIAL, TAGS.NAVIGATION],
        display: "Follow owner - wherever you are, find way to reach you - unbreakable 100 block tower + water",
        priority: 100,
        children: [
            new GoalNode({
                id: "locate_owner",
                hierarchy: HIERARCHY.TASK,
                tags: [TAGS.NAVIGATION],
                display: "Locate owner position",
                children: [
                    new GoalNode({ id: "get_owner_pos", hierarchy: HIERARCHY.ACTION, tags: [TAGS.NAVIGATION], display: "Get owner location" })
                ]
            }),
            new GoalNode({
                id: "assess_gap",
                hierarchy: HIERARCHY.TASK,
                tags: [TAGS.NAVIGATION],
                display: "Assess gap: horizontal, vertical, water, obstacles",
                children: [
                    new GoalNode({ id: "check_vertical_diff", hierarchy: HIERARCHY.ACTION, tags: [TAGS.NAVIGATION], display: "Check vertical diff" }),
                    new GoalNode({ id: "check_water_between", hierarchy: HIERARCHY.ACTION, tags: [TAGS.NAVIGATION], display: "Check water between" }),
                    new GoalNode({ id: "check_obstructions", hierarchy: HIERARCHY.ACTION, tags: [TAGS.NAVIGATION], display: "Check obstructions" })
                ]
            }),
            new GoalNode({
                id: "choose_method",
                hierarchy: HIERARCHY.TASK,
                tags: [TAGS.NAVIGATION],
                display: "Choose fastest method: walk, pillar, bridge, boat",
                children: [
                    new GoalNode({
                        id: "if_tower",
                        hierarchy: HIERARCHY.SUBGOAL,
                        tags: [TAGS.BUILDING],
                        display: "If owner >12 above: pillar method",
                        requires: { conditions: [{ type: "vertical_diff", min: 12 }] },
                        children: [
                            new GoalNode({ id: "have_build_blocks", hierarchy: HIERARCHY.PREREQUISITE, tags: [TAGS.RESOURCE], display: "Have build blocks (dirt/cobble)" }),
                            new GoalNode({ id: "move_to_column", hierarchy: HIERARCHY.ACTION, tags: [TAGS.NAVIGATION], display: "Move to owner's X/Z column" }),
                            new GoalNode({ id: "pillar_up", hierarchy: HIERARCHY.ACTION, tags: [TAGS.BUILDING], display: "Pillar up with blocks" })
                        ]
                    }),
                    new GoalNode({
                        id: "if_water",
                        hierarchy: HIERARCHY.SUBGOAL,
                        tags: [TAGS.NAVIGATION],
                        display: "If water between: boat method",
                        requires: { conditions: [{ type: "water_between", value: true }] },
                        children: [
                            new GoalNode({ id: "have_boat", hierarchy: HIERARCHY.PREREQUISITE, tags: [TAGS.RESOURCE], display: "Have boat or craft from any wood" }),
                            new GoalNode({ id: "craft_boat_any_wood", hierarchy: HIERARCHY.TASK, tags: [TAGS.CRAFTING], display: "Craft boat from any planks", requires: { items: [{ id: "#planks", count: 5 }] } }),
                            new GoalNode({ id: "use_boat", hierarchy: HIERARCHY.ACTION, tags: [TAGS.NAVIGATION], display: "Place and ride boat to owner" })
                        ]
                    }),
                    new GoalNode({
                        id: "if_gap_large",
                        hierarchy: HIERARCHY.SUBGOAL,
                        tags: [TAGS.BUILDING],
                        display: "If gap >3 blocks: place block then 3-jump",
                        requires: { conditions: [{ type: "gap_size", min: 4, max: 8 }] },
                        children: [
                            new GoalNode({ id: "have_blocks", hierarchy: HIERARCHY.PREREQUISITE, tags: [TAGS.RESOURCE], display: "Have build blocks" }),
                            new GoalNode({ id: "place_intermediate", hierarchy: HIERARCHY.ACTION, tags: [TAGS.BUILDING], display: "Place intermediate block at distance 1-3" }),
                            new GoalNode({ id: "sprintjump3", hierarchy: HIERARCHY.ACTION, tags: [TAGS.NAVIGATION], display: "3-block sprint jump (4 distance)" })
                        ]
                    }),
                    new GoalNode({
                        id: "normal_walk",
                        hierarchy: HIERARCHY.SUBGOAL,
                        tags: [TAGS.NAVIGATION],
                        display: "Normal walk/jump/sprintjump",
                        children: [
                            new GoalNode({ id: "pathfind_to_owner", hierarchy: HIERARCHY.ACTION, tags: [TAGS.NAVIGATION], display: "A* pathfind to owner with parkour" })
                        ]
                    })
                ]
            })
        ]
    });
}

// Full mission decomposition
export function decomposeMission(missionType, inventory = {}) {
    switch (missionType) {
        case "wood":
        case "starter":
            return decomposeWoodTools();
        case "stone":
            return decomposeStoneTools();
        case "iron":
            return decomposeIronTools();
        case "follow":
            return decomposeFollowOwner();
        case "survival":
            return new GoalNode({
                id: "survival",
                hierarchy: HIERARCHY.MISSION,
                tags: [TAGS.ESSENTIAL, TAGS.PROGRESSION, TAGS.SURVIVAL],
                display: "Survival mission: upskill wood->stone->iron->diamond",
                children: [
                    decomposeWoodTools(),
                    decomposeStoneTools(),
                    decomposeIronTools()
                ]
            });
        default:
            return new GoalNode({
                id: missionType,
                hierarchy: HIERARCHY.GOAL,
                tags: [TAGS.ESSENTIAL],
                display: `Goal: ${missionType}`,
                children: []
            });
    }
}

// Check if goal is achievable and return missing requirements structured
export function analyzeRequirements(goalNode, inventory, conditions = {}) {
    const missing = [];
    const walk = (node, path = []) => {
        const currentPath = [...path, node.id];
        if (!node.isMet(inventory, conditions)) {
            if (node.hierarchy === HIERARCHY.PREREQUISITE || node.hierarchy === HIERARCHY.SUBGOAL) {
                missing.push({
                    id: node.id,
                    hierarchy: node.hierarchyName,
                    path: currentPath.join(" > "),
                    display: node.display,
                    requires: node.requires,
                    tags: node.tags,
                    priority: node.priority
                });
            }
        }
        for (const child of node.children) {
            walk(child, currentPath);
        }
    };
    walk(goalNode);
    return missing;
}

// ---------------------------------------------------------------- resource.js

/**
 * Resource management for speedrun - pure logic.
 * Tracks what the bot has, what it needs next, optimal acquisition order.
 * Main goal upskilling itself, retains important stuff, aware of surroundings.
 */


export const PHASES = {
    WOOD: 0,
    STONE: 1,
    IRON: 2,
    DIAMOND: 3,
    PORTAL: 4,
    NETHER: 5
};

export const CHECKLIST = {
    [PHASES.WOOD]: [
        { item: "#logs", count: 8, reason: "any logs: oak/birch/spruce/jungle/acacia/dark/mangrove/cherry/pale/crimson/warped/bamboo - quick tool #1" },
        { item: "minecraft:crafting_table", count: 1, reason: "crafting - critical" },
        { item: "minecraft:stick", count: 8, reason: "tool handles" },
        { item: "minecraft:wooden_pickaxe", count: 1, reason: "mine stone - upskill" },
        { item: "minecraft:wooden_sword", count: 1, reason: "never bare hand - quick weapon" },
        { item: "minecraft:wooden_axe", count: 1, reason: "faster wood + weapon" },
    ],
    [PHASES.STONE]: [
        { item: "minecraft:cobblestone", count: 20, reason: "stone tools + furnace + bridging" },
        { item: "minecraft:stone_pickaxe", count: 1, reason: "iron tier - upskill" },
        { item: "minecraft:stone_sword", count: 1, reason: "defense - never bare hand" },
        { item: "minecraft:furnace", count: 1, reason: "smelting" },
        { item: "minecraft:torch", count: 16, reason: "lighting + prevent spawn" },
        { item: "minecraft:stone_axe", count: 1, reason: "better chopping" },
    ],
    [PHASES.IRON]: [
        { item: "minecraft:raw_iron", count: 12, reason: "iron gear - retain important" },
        { item: "minecraft:iron_ingot", count: 12, reason: "smelted - critical" },
        { item: "minecraft:iron_pickaxe", count: 1, reason: "diamonds - upskill" },
        { item: "minecraft:iron_sword", count: 1, reason: "combat main weapon" },
        { item: "minecraft:bucket", count: 1, reason: "water/lava for portal/clutch - critical" },
        { item: "minecraft:shield", count: 1, reason: "defense vs skeleton swarm - critical" },
        { item: "minecraft:iron_axe", count: 1, reason: "better weapon + shield break", optional: true },
    ],
    [PHASES.DIAMOND]: [
        { item: "minecraft:diamond", count: 5, reason: "diamond pick + sword - upskill" },
        { item: "minecraft:diamond_pickaxe", count: 1, reason: "obsidian - portal" },
        { item: "minecraft:diamond_sword", count: 1, reason: "best weapon before netherite", optional: true },
        { item: "minecraft:obsidian", count: 10, reason: "portal - critical" },
    ],
    [PHASES.PORTAL]: [
        { item: "minecraft:flint_and_steel", count: 1, reason: "light portal - critical" },
        { item: "minecraft:water_bucket", count: 1, reason: "obsidian making + clutch - critical", optional: true },
        { item: "minecraft:golden_apple", count: 1, reason: "heal for nether", optional: true },
    ]
};

export function currentPhase(inventory) {
    const has = (type, count = 1) => (inventory[type] ?? 0) >= count;
    // Wood phase: any logs >=3 + table - ultra efficient, never oak-only
    if (amountOf(inventory, "#logs") < 3 && !has("minecraft:crafting_table", 1)) return PHASES.WOOD;
    if (!has("minecraft:cobblestone", 8) || !has("minecraft:stone_pickaxe", 1)) return PHASES.STONE;
    if (!has("minecraft:iron_pickaxe", 1) || !has("minecraft:iron_ingot", 4)) return PHASES.IRON;
    if (!has("minecraft:diamond", 3) || !has("minecraft:diamond_pickaxe", 1)) return PHASES.DIAMOND;
    if (!has("minecraft:obsidian", 10)) return PHASES.PORTAL;
    return PHASES.NETHER;
}

export function nextNeeded(inventory, phase) {
    const list = CHECKLIST[phase] ?? [];
    for (const need of list) {
        if (need.optional) continue;
        const have = need.item.startsWith("#") ? amountOf(inventory, need.item) : (inventory[need.item] ?? 0);
        if (have < need.count) {
            return { ...need, have, need: need.count - have };
        }
    }
    for (const need of list) {
        if (!need.optional) continue;
        const have = need.item.startsWith("#") ? amountOf(inventory, need.item) : (inventory[need.item] ?? 0);
        if (have < need.count && isCritical(need.item)) {
            return { ...need, have, need: need.count - have };
        }
    }
    if (phase < PHASES.NETHER) {
        return nextNeeded(inventory, phase + 1);
    }
    return null;
}

export function priorityOf(item) {
    const score = retainScore(item);
    if (score >= 90) return 100;
    if (score >= 80) return 90;
    if (score >= 70) return 80;
    if (score >= 50) return 60;
    if (score >= 30) return 40;
    return 10;
}

export function shouldRetain(item, have, freeSlots) {
    const score = retainScore(item);
    if (isCritical(item)) return true;
    if (score >= 80) return true;
    if (score >= 60 && freeSlots > 2) return true;
    if (score >= 40 && freeSlots > 5) return true;
    if (score < 20 && have > 16) return false;
    return have < 32;
}
