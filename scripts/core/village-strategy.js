/**
 * Village Strategy - village-first evaluation for Nether speedrun.
 * Pure logic, no engine deps. Evaluates whether nearby village offers better route
 * than gathering everything independently.
 */

import { retainScore, isCritical } from "./knowledge.js";

export const VILLAGE_BENEFITS = {
    food: { score: 30, items: ["minecraft:bread","minecraft:potato","minecraft:carrot","minecraft:beetroot","minecraft:hay_block"] },
    beds: { score: 20, items: ["minecraft:white_bed","minecraft:bed"] },
    hay: { score: 25, items: ["minecraft:hay_block"] }, // 9 wheat each, best food efficiency
    crafting: { score: 15, items: ["minecraft:crafting_table","minecraft:furnace","minecraft:blast_furnace","minecraft:smoker"] },
    loot: { score: 20, items: ["minecraft:chest","minecraft:iron_ingot","minecraft:iron_nugget","minecraft:obsidian","minecraft:gold_ingot"] },
    iron: { score: 30, items: ["iron_golem"] }, // golem = 3-5 iron ingots
    wool: { score: 15, items: ["minecraft:white_wool"] },
    trades: { score: 10, items: ["minecraft:emerald"] },
};

export const FOOD_EFFICIENCY = {
    // Accessibility, saturation, hunger restoration, time efficiency
    "minecraft:bread": { hunger: 5, saturation: 6, accessibility: 90, time: 5, efficiency: 85 }, // village hay -> bread easy
    "minecraft:hay_block": { hunger: 0, saturation: 0, accessibility: 95, time: 3, efficiency: 90, note: "9 wheat = 3 bread, best village food" },
    "minecraft:potato": { hunger: 1, saturation: 0.6, accessibility: 80, time: 4, efficiency: 60 },
    "minecraft:baked_potato": { hunger: 5, saturation: 6, accessibility: 60, time: 15, efficiency: 75 }, // need furnace
    "minecraft:carrot": { hunger: 3, saturation: 3.6, accessibility: 80, time: 4, efficiency: 70 },
    "minecraft:beetroot": { hunger: 1, saturation: 1.2, accessibility: 70, time: 4, efficiency: 50 },
    "minecraft:cooked_beef": { hunger: 8, saturation: 12.8, accessibility: 50, time: 20, efficiency: 85 }, // need cow + furnace
    "minecraft:apple": { hunger: 4, saturation: 2.4, accessibility: 60, time: 10, efficiency: 65 },
    "minecraft:sweet_berries": { hunger: 2, saturation: 0.4, accessibility: 70, time: 5, efficiency: 55 },
};

export function evaluateFoodSource(foodType, distance, hasFurnace, hasFuel) {
    const info = FOOD_EFFICIENCY[foodType];
    if (!info) return { efficiency: 30, reason: "unknown food" };

    let efficiency = info.efficiency;
    // Adjust for distance
    if (distance > 64) efficiency -= 20;
    else if (distance > 32) efficiency -= 10;
    else if (distance < 16) efficiency += 10;

    // Adjust for furnace requirement
    if (foodType === "minecraft:baked_potato" || foodType === "minecraft:cooked_beef") {
        if (!hasFurnace) efficiency -= 15;
        if (!hasFuel) efficiency -= 10;
    }

    return {
        foodType,
        efficiency: Math.max(0, efficiency),
        hunger: info.hunger,
        saturation: info.saturation,
        accessibility: info.accessibility,
        timeCost: info.time + Math.ceil(distance / 10),
        reason: `${foodType} hunger ${info.hunger} sat ${info.saturation} access ${info.accessibility} time ${info.time} distance ${distance.toFixed(0)} efficiency ${efficiency}`
    };
}

export function findBestFoodOption(availableFoods, context) {
    // availableFoods: [{type, distance, amount}]
    const evaluations = availableFoods.map(f => evaluateFoodSource(f.type, f.distance, context.hasFurnace, context.hasFuel));
    evaluations.sort((a,b) => b.efficiency - a.efficiency || a.timeCost - b.timeCost);
    return evaluations[0] ?? null;
}

export function evaluateVillage(village, context) {
    // village: {pos, distance, hasFood, hasBeds, hasHay, hasCrafting, hasChest, hasGolem, hasWool, dangerLevel, timeCostEstimate}
    // context: {phase, hasWood, hasStone, hasFood, hasBed, hasWool, inventory, currentGoal, health, equipment}
    if (!village) return null;

    let score = 50; // base
    let benefits = [];
    let reasons = [];

    // Distance penalty/bonus
    const dist = village.distance;
    if (dist > 256) score -= 30;
    else if (dist > 128) score -= 15;
    else if (dist > 64) score -= 5;
    else if (dist < 32) score += 15;
    else if (dist < 64) score += 5;

    // Time cost vs gathering independently
    // If village provides food, beds, hay, crafting, loot, iron, wool
    if (village.hasFood) {
        score += VILLAGE_BENEFITS.food.score;
        benefits.push("food");
        reasons.push("village provides food");
    }
    if (village.hasBeds) {
        score += VILLAGE_BENEFITS.beds.score;
        benefits.push("beds");
        reasons.push("village has beds to skip night");
        if (!context.hasBed) score += 10; // extra if no bed
    }
    if (village.hasHay) {
        score += VILLAGE_BENEFITS.hay.score;
        benefits.push("hay");
        reasons.push("hay bales = 9 wheat each = 3 bread, best food efficiency");
        if (!context.hasFood || context.foodAmount < 8) score += 15;
    }
    if (village.hasCrafting) {
        score += VILLAGE_BENEFITS.crafting.score;
        benefits.push("crafting");
        reasons.push("crafting table, furnace, blast furnace available");
    }
    if (village.hasChest) {
        score += VILLAGE_BENEFITS.loot.score;
        benefits.push("loot");
        reasons.push("chests with useful loot");
        if (village.chestHasObsidian) score += 20;
        if (village.chestHasIron) score += 10;
    }
    if (village.hasGolem) {
        score += VILLAGE_BENEFITS.iron.score;
        benefits.push("golem");
        reasons.push("iron golem = 3-5 iron ingots for bucket");
        if (!context.hasIron) score += 20; // extra if need iron
    }
    if (village.hasWool) {
        score += VILLAGE_BENEFITS.wool.score;
        benefits.push("wool");
        reasons.push("wool for bed");
        if (!context.hasWool && !context.hasBed) score += 10;
    }

    // Danger level
    if (village.dangerLevel) {
        const { hostileCount, pillager, zombieSiege } = village.dangerLevel;
        if (hostileCount >= 5) score -= 25;
        else if (hostileCount >= 3) score -= 10;
        if (pillager) score -= 20;
        if (zombieSiege) score -= 15;
    }

    // Phase consideration: village-first strategy as soon as minimum equipment
    // Minimum equipment: wood tools, some food
    const hasMinimum = context.hasWood && (context.hasFood || village.hasFood);
    if (!hasMinimum) {
        score -= 20;
        reasons.push("no minimum equipment yet, village may be risky");
    } else {
        score += 10;
        reasons.push("has minimum equipment, village evaluation viable");
    }

    // Compare distance and risks against immediate Nether-entry route
    if (context.netherRoute) {
        const netherDist = context.netherRoute.distance ?? 100;
        const netherScore = context.netherRoute.score ?? 50;
        if (netherDist < dist && netherScore > 70) {
            // Nether route closer and good
            score -= 15;
            reasons.push(`immediate Nether route closer (${netherDist.toFixed(0)} vs ${dist.toFixed(0)}) and score ${netherScore} - village may not be better`);
        } else if (dist < netherDist && score > 60) {
            score += 10;
            reasons.push(`village closer than Nether route (${dist.toFixed(0)} vs ${netherDist.toFixed(0)}) and provides advantages`);
        }
    }

    // Time cost estimate
    const timeCost = Math.ceil(dist / 12) + (village.dangerLevel?.hostileCount ?? 0) * 2;

    return {
        village: village.pos,
        distance: dist,
        score: Math.max(0, score),
        benefits,
        reasons: reasons.join("; "),
        timeCost,
        feasibility: score > 70 ? "high" : score > 50 ? "medium" : "low",
        shouldGo: score > 60 && timeCost < 30,
        isBetterThanIndependent: score > 65,
        foodEfficiency: village.hasHay ? "hay bales best (9 wheat = 3 bread)" : village.hasFood ? "village crops" : "need to gather",
        bedAvailable: village.hasBeds,
        recommendation: score > 70 ? "go_to_village" : score > 50 ? "consider_village" : "skip_village"
    };
}

export function shouldCraftBedIndependently(context) {
    // If no suitable village or bed, obtain wool and wood to craft bed when efficient
    const { hasWool, woolCount, hasWood, woodCount, hasBed, time, distanceToSheep, sheepCount, hasVillage } = context;

    if (hasBed) return { should: false, reason: "already has bed" };
    if (hasVillage && hasVillage.hasBeds) return { should: false, reason: "village has beds, use those" };

    // Need 3 wool same color and 3 planks
    const woolNeeded = Math.max(0, 3 - (woolCount ?? 0));
    const woodNeeded = hasWood ? 0 : 3; // planks, but need logs

    if (woolNeeded === 0 && woodCount >= 3) {
        return { should: true, reason: "has wool and wood, craft bed now to skip night", priority: 80, recipe: "3 wool + 3 planks" };
    }

    if (woolNeeded > 0 && sheepCount > 0 && distanceToSheep < 32) {
        return { should: true, reason: `need ${woolNeeded} wool, sheep nearby ${distanceToSheep.toFixed(0)} blocks, hunt sheep`, priority: 70, need: `${woolNeeded} wool, ${woodNeeded} planks`, sheep: true };
    }

    if (time === "sunset" || time === "night") {
        // Nighttime, bed useful if can get quickly
        if (woolNeeded <= 2 && woodNeeded <= 3) {
            return { should: true, reason: "nighttime, bed useful, resources can be acquired efficiently", priority: 75 };
        } else {
            return { should: false, reason: "nighttime but wool/wood too far, build minimal shelter instead", priority: 30, alternative: "minimal_shelter" };
        }
    }

    return { should: false, reason: "bed not critical yet, prioritize Nether resources", priority: 20 };
}

export function evaluateVillageVsNetherRoute(villageEval, netherEval, context) {
    if (!villageEval) return { decision: "nether", reason: "no village" };
    if (!netherEval) return { decision: "village", reason: "no nether route yet, village provides resources" };

    // Compare distance, risks, time, benefits
    const villageScore = villageEval.score - villageEval.timeCost;
    const netherScore = netherEval.score - netherEval.timeCost;

    if (villageScore > netherScore + 20) {
        return { decision: "village", reason: `village score ${villageScore.toFixed(0)} > nether ${netherScore.toFixed(0)} +20, village provides food/beds/iron advantage`, villageEval, netherEval };
    }
    if (netherScore > villageScore + 20) {
        return { decision: "nether", reason: `nether score ${netherScore.toFixed(0)} > village ${villageScore.toFixed(0)} +20, immediate Nether entry faster`, villageEval, netherEval };
    }

    // Close, consider phase: if early wood/stone phase, village better; if iron+ has bucket, nether better
    if (context.phase === "wood" || context.phase === "stone") {
        return { decision: "village", reason: "early phase wood/stone, village provides better route than independent gathering", villageEval, netherEval };
    }
    if (context.hasBucket || context.hasWaterBucket) {
        return { decision: "nether", reason: "has bucket, Nether entry is immediate priority", villageEval, netherEval };
    }

    return { decision: "village", reason: "scores close, village provides safety and resources for Nether prep", villageEval, netherEval };
}
