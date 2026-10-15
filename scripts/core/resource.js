/**
 * Resource management for speedrun - pure logic.
 * Tracks what the bot has, what it needs next, and optimal acquisition order.
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
        { item: "minecraft:oak_log", count: 8, reason: "planks, table, tools" },
        { item: "minecraft:crafting_table", count: 1, reason: "crafting" },
        { item: "minecraft:wooden_pickaxe", count: 1, reason: "mine stone" },
    ],
    [PHASES.STONE]: [
        { item: "minecraft:cobblestone", count: 20, reason: "stone tools + furnace" },
        { item: "minecraft:stone_pickaxe", count: 1, reason: "iron" },
        { item: "minecraft:stone_sword", count: 1, reason: "defense" },
        { item: "minecraft:furnace", count: 1, reason: "smelting" },
        { item: "minecraft:torch", count: 16, reason: "lighting" },
    ],
    [PHASES.IRON]: [
        { item: "minecraft:raw_iron", count: 12, reason: "iron gear" },
        { item: "minecraft:iron_ingot", count: 12, reason: "smelted" },
        { item: "minecraft:iron_pickaxe", count: 1, reason: "diamonds" },
        { item: "minecraft:iron_sword", count: 1, reason: "combat" },
        { item: "minecraft:bucket", count: 1, reason: "water/lava" },
        { item: "minecraft:shield", count: 1, reason: "defense", optional: true },
    ],
    [PHASES.DIAMOND]: [
        { item: "minecraft:diamond", count: 5, reason: "diamond pick + sword" },
        { item: "minecraft:diamond_pickaxe", count: 1, reason: "obsidian" },
        { item: "minecraft:obsidian", count: 10, reason: "portal" },
    ],
    [PHASES.PORTAL]: [
        { item: "minecraft:flint_and_steel", count: 1, reason: "light portal" },
    ]
};

export function currentPhase(inventory) {
    const has = (type, count = 1) => (inventory[type] ?? 0) >= count;
    if (!has("minecraft:oak_log", 3) && !has("minecraft:crafting_table", 1)) return PHASES.WOOD;
    if (!has("minecraft:cobblestone", 8) || !has("minecraft:stone_pickaxe", 1)) return PHASES.STONE;
    if (!has("minecraft:iron_pickaxe", 1) || !has("minecraft:iron_ingot", 4)) return PHASES.IRON;
    if (!has("minecraft:diamond", 3) || !has("minecraft:diamond_pickaxe", 1)) return PHASES.DIAMOND;
    if (!has("minecraft:obsidian", 10)) return PHASES.PORTAL;
    return PHASES.NETHER;
}

export function nextNeeded(inventory, phase) {
    const list = CHECKLIST[phase] ?? [];
    for (const need of list) {
        const have = inventory[need.item] ?? 0;
        if (have < need.count) {
            return { ...need, have, need: need.count - have };
        }
    }
    // If phase complete, look to next phase
    if (phase < PHASES.NETHER) {
        return nextNeeded(inventory, phase + 1);
    }
    return null;
}

export function priorityOf(item) {
    const priorities = {
        "minecraft:diamond": 100,
        "minecraft:iron_ingot": 90,
        "minecraft:raw_iron": 85,
        "minecraft:coal": 80,
        "minecraft:oak_log": 70,
        "minecraft:cobblestone": 60,
        "minecraft:torch": 50,
        "minecraft:cooked_beef": 55,
        "minecraft:bread": 50,
    };
    return priorities[item] ?? 10;
}

export function shouldGather(item, inventory, freeSlots) {
    if (freeSlots < 2) return false;
    const prio = priorityOf(item);
    if (prio >= 80) return true; // always gather high value
    // Don't over-gather
    const have = inventory[item] ?? 0;
    if (item.includes("log") && have >= 32) return false;
    if (item.includes("cobblestone") && have >= 64) return false;
    return true;
}
