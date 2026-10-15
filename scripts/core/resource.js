/**
 * Resource management for speedrun - pure logic.
 * Tracks what the bot has, what it needs next, optimal acquisition order.
 * Main goal upskilling itself, retains important stuff, aware of surroundings.
 */
import { retainScore, isCritical } from "./knowledge.js";
import { amountOf } from "./recipes.js";

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

export function shouldGather(item, inventory, freeSlots) {
    if (freeSlots < 1) {
        if (isCritical(item)) return true;
        return false;
    }
    if (freeSlots < 2 && !isCritical(item)) return false;
    const score = retainScore(item);
    if (score >= 80) return true;
    const have = item.startsWith("#") ? amountOf(inventory, item) : (inventory[item] ?? 0);
    if ((item.includes("log") || item === "#logs") && have >= 32) return false;
    if (item.includes("cobblestone") && have >= 64) return false;
    if (item.includes("dirt") && have >= 32) return false;
    return true;
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

export function upskillGoal(inventory) {
    const phase = currentPhase(inventory);
    const need = nextNeeded(inventory, phase);
    if (!need) return { goal: "explore", reason: "upskill complete, explore for better" };
    return { goal: `gather_${need.item}`, phase, need, reason: need.reason };
}
