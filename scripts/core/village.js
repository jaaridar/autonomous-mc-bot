// One module now: core/village-strategy.js + core/golem-strategy.js (see docs/ARCHITECTURE.md).


// ---------------------------------------------------------------- village-strategy.js

/**
 * Village Strategy - village-first evaluation for Nether speedrun.
 * Pure logic, no engine deps. Evaluates whether nearby village offers better route
 * than gathering everything independently.
 */


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

// ---------------------------------------------------------------- golem-strategy.js

/**
 * Iron Golem Combat & Risk Management - pure logic.
 * Recognize golem and evaluate whether fighting worthwhile based on iron, equipment, health, terrain, time.
 * Understand attack range, movement, LOS, knockback, ability to reach elevated positions.
 * Evaluate strategies: protected elevated position or terrain separation.
 * Avoid fall damage, unexpected block access, other hostile mobs, environmental hazards.
 * Reassess health positioning continuously, disengage if unsafe.
 * Collect iron drops efficiently, prioritize bucket.
 * Never mandatory if safer faster route available.
 */

export const GOLEM_STATS = {
    health: 100,
    damage: 14, // normal
    attackRange: 2.5,
    movementSpeed: 0.25,
    knockback: 1.5,
    canReachHeight: 3, // can hit 3 blocks up?
    detectionRange: 16,
    attackCooldown: 20, // ticks
    dropIronMin: 3,
    dropIronMax: 5,
    dropPoppy: 1,
};

export const GOLEM_STRATEGIES = {
    pillar_3_high: {
        name: "pillar_3_high",
        description: "Pillar 3 blocks up, golem cannot reach if properly built",
        blocksNeeded: 3,
        timeCost: 10,
        risk: "medium", // fall damage if knocked
        requirements: { blocks: 3, weapon: true },
        effectiveness: 85,
    },
    elevated_platform: {
        name: "elevated_platform",
        description: "Build protected elevated position 4x4 platform with walls",
        blocksNeeded: 12,
        timeCost: 25,
        risk: "low",
        requirements: { blocks: 12, weapon: true },
        effectiveness: 95,
    },
    terrain_hill: {
        name: "terrain_hill",
        description: "Use existing hill or terrain to maintain separation",
        blocksNeeded: 0,
        timeCost: 5,
        risk: "medium",
        requirements: { hill: true },
        effectiveness: 70,
    },
    doorway_trap: {
        name: "doorway_trap",
        description: "Use village doorway with blocks to trap golem",
        blocksNeeded: 2,
        timeCost: 10,
        risk: "low",
        requirements: { doorway: true, blocks: 2 },
        effectiveness: 80,
    },
    water_bucket: {
        name: "water_bucket",
        description: "Use water to slow golem and maintain distance",
        blocksNeeded: 0,
        timeCost: 5,
        risk: "low",
        requirements: { water_bucket: true },
        effectiveness: 75,
    },
};

export function evaluateGolemFight(context) {
    // context: {hasIron, ironAmount, hasBucket, health, maxHealth, equipment {weaponTier, armorValue}, terrain {hasHill, hasDoorway, flatArea}, time, hasBlocks, blockCount, hasWaterBucket, otherHostileCount, hasVillage, distanceToVillage, hasFurnace}
    const {
        hasIron, ironAmount, hasBucket, health, equipment, terrain, hasBlocks, blockCount, hasWaterBucket, otherHostileCount, hasVillage, time
    } = context;

    let score = 50; // base
    let reasons = [];
    let risks = [];

    // Benefit: iron needed?
    const ironNeededForBucket = hasBucket ? 0 : 3;
    const ironNeededForFlintAndSteel = 1;
    const totalIronNeeded = ironNeededForBucket + ironNeededForFlintAndSteel;
    const ironHave = ironAmount ?? 0;

    if (ironHave >= totalIronNeeded) {
        score -= 30;
        reasons.push(`already have ${ironHave} iron, need ${totalIronNeeded}, golem not needed`);
    } else {
        const ironDeficit = totalIronNeeded - ironHave;
        score += ironDeficit * 15;
        reasons.push(`need ${ironDeficit} more iron for bucket+flint and steel, golem provides 3-5 iron`);
    }

    // If already have bucket, lower priority unless need more iron for armor/tools
    if (hasBucket && ironHave >= 3) {
        score -= 20;
        reasons.push("already have bucket, golem less critical unless need armor");
    }

    // Health check
    if (health <= 8) {
        score -= 40;
        risks.push("low health <=8, golem does 14 damage, high death risk");
    } else if (health <= 12) {
        score -= 15;
        risks.push("health <=12, risky but possible with safe strategy");
    } else if (health >= 18) {
        score += 10;
        reasons.push("high health, safer to attempt");
    }

    // Equipment
    const weaponTier = equipment?.weaponTier ?? 0; // 0 bare, 1 wood, 2 stone, 3 iron
    if (weaponTier < 2) {
        score -= 20;
        risks.push("weapon tier <2 (wood), very slow kill, more exposure");
    } else if (weaponTier >= 3) {
        score += 10;
        reasons.push("iron+ weapon, faster kill");
    }

    const armorValue = equipment?.armorValue ?? 0;
    if (armorValue < 5) {
        score -= 10;
        risks.push("low armor, golem damage high");
    }

    // Terrain
    if (terrain?.hasHill) {
        score += 10;
        reasons.push("hill available for separation");
    }
    if (terrain?.hasDoorway && hasVillage) {
        score += 15;
        reasons.push("village doorway trap available, low risk");
    }
    if (terrain?.flatArea) {
        score -= 5;
        risks.push("flat area, no natural separation");
    }

    // Blocks
    if (!hasBlocks || blockCount < 3) {
        score -= 20;
        risks.push("no blocks for pillar/elevated position, cannot maintain separation");
    } else if (blockCount >= 12) {
        score += 10;
        reasons.push("enough blocks for protected elevated platform");
    }

    // Water bucket
    if (hasWaterBucket) {
        score += 10;
        reasons.push("water bucket can slow golem");
    }

    // Other hostile mobs during fight
    if (otherHostileCount >= 2) {
        score -= 25;
        risks.push(`other hostile mobs ${otherHostileCount} nearby, avoid during golem fight`);
    }

    // Time: don't fight at night if possible
    if (time === "night") {
        score -= 10;
        risks.push("nighttime, additional hostile spawns risk");
    }

    // Village context: if golem is village golem, killing may affect reputation? But for speedrun, okay if beneficial
    if (hasVillage) {
        // Village golem is easier to trap
        score += 5;
    }

    // Never mandatory if safer faster route available
    if (context.saferFasterRouteAvailable) {
        score -= 30;
        reasons.push("safer faster route to Nether available, golem kill not mandatory");
    }

    // Final decision
    const shouldFight = score > 60;
    const isWorthwhile = score > 50;

    return {
        score: Math.max(0, Math.min(100, score)),
        shouldFight,
        isWorthwhile,
        reasons: reasons.join("; "),
        risks: risks.join("; "),
        ironNeeded: totalIronNeeded,
        ironHave,
        ironDeficit: Math.max(0, totalIronNeeded - ironHave),
        recommendedStrategy: shouldFight ? chooseBestGolemStrategy(context) : null,
        timeCost: shouldFight ? (chooseBestGolemStrategy(context)?.timeCost ?? 20) : 0,
        riskLevel: risks.length >= 2 ? "high" : risks.length === 1 ? "medium" : "low",
        benefit: `golem drops 3-5 iron, need ${totalIronNeeded - ironHave} more`,
        decision: shouldFight ? "fight_golem" : "skip_golem",
        alternative: shouldFight ? null : "gather iron from caves or village chests, safer faster route"
    };
}

export function chooseBestGolemStrategy(context) {
    const { hasBlocks, blockCount, hasWaterBucket, terrain, hasVillage } = context;
    const strategies = [];

    // Evaluate each strategy
    for (const [key, strat] of Object.entries(GOLEM_STRATEGIES)) {
        let score = strat.effectiveness;
        let feasible = true;
        let reason = "";

        if (key === "pillar_3_high") {
            if (!hasBlocks || blockCount < 3) feasible = false;
            else reason = "3 blocks pillar, golem cannot reach 3 high if built correctly";
        } else if (key === "elevated_platform") {
            if (!hasBlocks || blockCount < 12) feasible = false;
            else reason = "protected platform low risk";
        } else if (key === "terrain_hill") {
            if (!terrain?.hasHill) feasible = false;
            else reason = "use hill, no blocks needed";
        } else if (key === "doorway_trap") {
            if (!terrain?.hasDoorway || !hasVillage) feasible = false;
            if (!hasBlocks || blockCount < 2) feasible = false;
            else reason = "village doorway trap low risk";
        } else if (key === "water_bucket") {
            if (!hasWaterBucket) feasible = false;
            else reason = "water slows golem";
        }

        if (feasible) {
            // Adjust score for time cost and risk
            score -= strat.timeCost * 0.5;
            if (strat.risk === "high") score -= 10;
            if (strat.risk === "low") score += 5;
            strategies.push({ ...strat, score, feasible, reason });
        }
    }

    strategies.sort((a,b) => b.score - a.score);
    return strategies[0] ?? null;
}

export function shouldDisengageDuringFight(context) {
    // Reassess health and positioning continuously, disengage if unsafe
    const { health, golemHealth, distanceToGolem, hasBlocks, otherHostileCount, fallRisk, golemReach } = context;

    if (health <= 6) return { disengage: true, reason: "health <=6, golem does 14 damage, disengage immediately" };
    if (otherHostileCount >= 1) return { disengage: true, reason: `other hostile ${otherHostileCount} appeared during fight, disengage` };
    if (fallRisk && distanceToGolem < 3) return { disengage: true, reason: "fall damage risk + golem close, disengage to safe position" };
    if (golemReach && distanceToGolem < golemReach) return { disengage: false, reason: "golem in reach, need to maintain separation", action: "pillar_higher_or_retreat" };
    if (golemHealth && golemHealth < 20 && health > 10) return { disengage: false, reason: "golem low health, continue" };

    return { disengage: false, reason: "situation okay, continue fight" };
}

export function collectIronDropsEfficiently(dropPositions, context) {
    // After golem kill, collect iron drops efficiently, prioritize bucket
    const hasBucket = context.hasBucket;
    const ironNeeded = hasBucket ? 0 : 3;

    return {
        action: "collect_iron_drops",
        priority: ironNeeded > 0 ? 95 : 70,
        reason: hasBucket ? "collect remaining iron for tools/armor" : "collect iron for bucket - major progression milestone",
        positions: dropPositions,
        shouldCraftBucketImmediately: !hasBucket && (context.ironAmount + 3) >= 3,
        nextStep: !hasBucket ? "craft_bucket" : "continue_nether_prep"
    };
}
