/**
 * Loot evaluation - pure logic for chest looting decisions.
 * Scores items by speedrun value. Structure loot main priority.
 * Knows every block/item and best use in situation.
 */
import { retainScore, isCritical, STRUCTURE_SIGS } from "./knowledge.js";

export const LOOT_VALUE = {
    // Critical - always take
    "minecraft:diamond": 1000,
    "minecraft:netherite_ingot": 1000,
    "minecraft:ancient_debris": 1000,
    "minecraft:totem_of_undying": 1000,
    "minecraft:enchanted_golden_apple": 1000,
    "minecraft:obsidian": 950,
    "minecraft:diamond_sword": 900,
    "minecraft:diamond_pickaxe": 950,
    "minecraft:netherite_sword": 1000,
    "minecraft:netherite_pickaxe": 1000,
    "minecraft:iron_ingot": 400,
    "minecraft:raw_iron": 380,
    "minecraft:iron_sword": 350,
    "minecraft:iron_pickaxe": 380,
    "minecraft:shield": 400,
    "minecraft:bucket": 380,
    "minecraft:water_bucket": 420,
    "minecraft:lava_bucket": 400,
    "minecraft:flint_and_steel": 380,
    "minecraft:gold_ingot": 200,
    "minecraft:emerald": 300,
    "minecraft:golden_apple": 600,
    "minecraft:saddle": 250,
    "minecraft:iron_horse_armor": 150,
    "minecraft:diamond_horse_armor": 300,
    "minecraft:name_tag": 100,
    "minecraft:ender_pearl": 700,
    "minecraft:blaze_rod": 800,
    "minecraft:ender_eye": 800,
    "minecraft:netherite_scrap": 850,
    "minecraft:cooked_beef": 120,
    "minecraft:cooked_porkchop": 120,
    "minecraft:bread": 100,
    "minecraft:torch": 80,
    "minecraft:coal": 90,
    "minecraft:oak_log": 70,
    "minecraft:oak_planks": 60,
    "minecraft:stick": 50,
    "minecraft:string": 110,
    "minecraft:feather": 90,
    "minecraft:flint": 80,
    "minecraft:leather": 70,
    "minecraft:iron_chestplate": 320,
    "minecraft:iron_leggings": 300,
    "minecraft:iron_helmet": 280,
    "minecraft:iron_boots": 260,
    "minecraft:chainmail_chestplate": 200,
    "minecraft:boat": 120,
    "minecraft:oak_boat": 120,
    "minecraft:white_bed": 150,
    "minecraft:bed": 150,
    "minecraft:furnace": 100,
    "minecraft:crafting_table": 80,
    "minecraft:iron_axe": 300,
    "minecraft:stone_sword": 200,
    "minecraft:stone_pickaxe": 200,
    "minecraft:wooden_sword": 150,
    "minecraft:bow": 250,
    "minecraft:arrow": 80,
    "minecraft:enchanted_book": 400,
    "minecraft:fire_charge": 200,
    "minecraft:gold_block": 300,
    "minecraft:crying_obsidian": 300,
    "minecraft:hay_block": 90,
    "minecraft:wheat": 60,
    "minecraft:apple": 70,
};

export const JUNK = new Set([
    "minecraft:rotten_flesh","minecraft:poisonous_potato","minecraft:spider_eye",
    "minecraft:gunpowder","minecraft:wheat_seeds","minecraft:beetroot_seeds",
    "minecraft:dead_bush","minecraft:coarse_dirt","minecraft:gravel",
    "minecraft:dirt","minecraft:sand","minecraft:flint","minecraft:stick"
]);

// Structure loot priority multiplier
export const STRUCTURE_LOOT_MULTIPLIER = {
    village: 1.5,
    desert_temple: 2.0,
    jungle_temple: 1.8,
    shipwreck: 1.7,
    ruined_portal: 2.5, // free obsidian
    igloo: 1.5,
    woodland_mansion: 2.2,
    nether_fortress: 2.0,
    bastion: 2.3,
    mineshaft: 1.8,
    lava_pool: 2.5, // portal opportunity
    amethyst_geode: 1.2,
};

export function scoreItem(typeId, amount = 1, structure = null) {
    if (JUNK.has(typeId) && !isCritical(typeId)) return 1 * amount;
    const base = LOOT_VALUE[typeId] ?? retainScore(typeId) ?? 10;
    let multiplier = 1;
    if (structure && STRUCTURE_LOOT_MULTIPLIER[structure]) {
        multiplier = STRUCTURE_LOOT_MULTIPLIER[structure];
    }
    // Critical always high
    if (isCritical(typeId)) multiplier = Math.max(multiplier, 1.5);
    return base * amount * multiplier;
}

export function isValuable(typeId) {
    return (LOOT_VALUE[typeId] ?? retainScore(typeId) ?? 0) >= 200 || isCritical(typeId);
}

export function isUpgrade(currentType, candidateType) {
    const cur = LOOT_VALUE[currentType] ?? retainScore(currentType) ?? 0;
    const cand = LOOT_VALUE[candidateType] ?? retainScore(candidateType) ?? 0;
    return cand > cur * 1.2;
}

/**
 * Decide which items to take from a chest given current inventory.
 * Structure loot main priority.
 */
export function chooseLoot(chestItems, bagCounts, freeSlots, structure = null) {
    const scored = chestItems.map((item, idx) => ({
        idx,
        type: item.typeId,
        amount: item.amount,
        score: scoreItem(item.typeId, item.amount, structure),
        valuable: isValuable(item.typeId),
        critical: isCritical(item.typeId)
    })).filter(s => !JUNK.has(s.type) || s.critical);

    // Sort critical first, valuable second, then by score desc
    scored.sort((a,b) => (b.critical - a.critical) || (b.valuable - a.valuable) || (b.score - a.score));

    const toTake = [];
    let used = 0;
    for (const s of scored) {
        if (s.critical) {
            toTake.push(s.idx);
            used++;
            if (used >= freeSlots + 3) break;
        } else if (s.valuable) {
            toTake.push(s.idx);
            used++;
            if (used >= freeSlots + 2) break;
        } else if (s.score > 50 && freeSlots > 3) {
            toTake.push(s.idx);
            used++;
        }
    }
    return toTake;
}

export function shouldLootChest(distance, homeDistance, freeSlots, structure = null) {
    if (freeSlots < 1 && !structure) return false;
    // Structure loot main priority - always loot if structure, even if low slots
    if (structure) {
        const mult = STRUCTURE_LOOT_MULTIPLIER[structure] ?? 1;
        if (mult >= 2.0) return true; // ruined portal, lava pool always
        if (mult >= 1.5 && freeSlots >= 1) return true;
    }
    if (homeDistance < 32) return false; // likely player base, but allow if structure high priority
    if (distance > 20) return false;
    if (freeSlots < 1) return false;
    return true;
}

// For lava pool portal
export function shouldMakePortal(inventory, hasLavaPool, hasWaterBucket) {
    const obsidian = inventory["minecraft:obsidian"] ?? 0;
    if (obsidian >= 10) return false;
    if (hasLavaPool && hasWaterBucket) return true;
    if (hasLavaPool && (inventory["minecraft:bucket"] ?? 0) > 0) return true; // need water
    return false;
}
