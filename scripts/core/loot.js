/**
 * Loot evaluation - pure logic for chest looting decisions.
 * Scores items by speedrun value.
 */

export const LOOT_VALUE = {
    // Weapons/tools
    "minecraft:diamond": 1000,
    "minecraft:diamond_sword": 900,
    "minecraft:diamond_pickaxe": 950,
    "minecraft:iron_ingot": 400,
    "minecraft:iron_sword": 350,
    "minecraft:iron_pickaxe": 380,
    "minecraft:gold_ingot": 200,
    "minecraft:emerald": 300,
    "minecraft:enchanted_golden_apple": 1000,
    "minecraft:golden_apple": 600,
    "minecraft:totem_of_undying": 1000,
    "minecraft:saddle": 250,
    "minecraft:iron_horse_armor": 150,
    "minecraft:diamond_horse_armor": 300,
    "minecraft:name_tag": 100,
    "minecraft:obsidian": 500,
    "minecraft:ender_pearl": 700,
    "minecraft:blaze_rod": 800,
    "minecraft:ender_eye": 800,
    "minecraft:ancient_debris": 900,
    "minecraft:netherite_scrap": 850,
    "minecraft:cooked_beef": 120,
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
    "minecraft:bucket": 200,
    "minecraft:water_bucket": 250,
    "minecraft:lava_bucket": 250,
    "minecraft:boat": 120,
    "minecraft:oak_boat": 120,
    "minecraft:bed": 150,
    "minecraft:white_bed": 150,
    "minecraft:furnace": 100,
    "minecraft:crafting_table": 80,
};

export const JUNK = new Set([
    "minecraft:rotten_flesh","minecraft:poisonous_potato","minecraft:spider_eye",
    "minecraft:gunpowder","minecraft:wheat_seeds","minecraft:beetroot_seeds",
    "minecraft:dead_bush","minecraft:dirt","minecraft:coarse_dirt","minecraft:gravel"
]);

export function scoreItem(typeId, amount = 1) {
    if (JUNK.has(typeId)) return 1 * amount;
    const base = LOOT_VALUE[typeId] ?? 10;
    return base * amount;
}

export function isValuable(typeId) {
    return (LOOT_VALUE[typeId] ?? 0) >= 200;
}

export function isUpgrade(currentType, candidateType) {
    const cur = LOOT_VALUE[currentType] ?? 0;
    const cand = LOOT_VALUE[candidateType] ?? 0;
    return cand > cur * 1.2;
}

/**
 * Decide which items to take from a chest given current inventory.
 * Returns list of slot indices to pull (best first).
 */
export function chooseLoot(chestItems, bagCounts, freeSlots) {
    const scored = chestItems.map((item, idx) => ({
        idx,
        type: item.typeId,
        amount: item.amount,
        score: scoreItem(item.typeId, item.amount),
        valuable: isValuable(item.typeId)
    })).filter(s => !JUNK.has(s.type));
    // Sort valuable first, then by score desc
    scored.sort((a,b) => (b.valuable - a.valuable) || (b.score - a.score));
    // Only take if we have space or it's an upgrade
    const toTake = [];
    let used = 0;
    for (const s of scored) {
        if (s.valuable) {
            toTake.push(s.idx);
            used++;
            if (used >= freeSlots + 2) break; // keep 2 free
        } else if (s.score > 50 && freeSlots > 3) {
            toTake.push(s.idx);
            used++;
        }
    }
    return toTake;
}

export function shouldLootChest(distance, homeDistance, freeSlots) {
    if (freeSlots < 1) return false;
    if (homeDistance < 48) return false; // likely player base
    if (distance > 16) return false;
    return true;
}
