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
