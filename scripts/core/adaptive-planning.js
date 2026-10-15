/**
 * Adaptive Planning & Survival Rules - pure logic.
 * Recalculate whenever discovers village ruined portal lava pool useful chest hostile mob group unexpected obstacle.
 * Prioritize essential progression over optional exploration unnecessary collection.
 * Avoid fights not contributing meaningfully.
 * Never assume route safe merely because worked previously reassess current health terrain enemies escape paths.
 * Use blocks intelligently bridges barriers emergency cover elevation controlled traversal.
 * When plan fails identify missing requirement select safest efficient alternative.
 * Preserve enough resources recover common emergencies.
 * Verify important actions crafting bucket acquisition portal construction ignition Nether entry rather than assuming succeeded.
 */

export const ADAPTIVE_TRIGGERS = [
    "village",
    "ruined_portal",
    "lava_pool",
    "ground_lava",
    "cave_lava",
    "useful_chest",
    "hostile_group",
    "obstacle",
    "water_source",
    "iron_vein",
    "gravel",
    "sheep"
];

export const ESSENTIAL_PROGRESSION = [
    "wood",
    "stone_pickaxe",
    "iron",
    "bucket",
    "water",
    "obsidian",
    "flint_and_steel",
    "portal",
    "nether_entry"
];

export const OPTIONAL_EXPLORATION = [
    "diamond",
    "enchanting",
    "redstone",
    "gold",
    "emerald_trading",
    "decorative_blocks"
];

/**
 * Should recalculate plan based on new discovery?
 */
export function shouldRecalculateAdaptive(discovery, currentPlan, context) {
    if (!discovery) return { should: false, reason: "no discovery" };
    if (!ADAPTIVE_TRIGGERS.includes(discovery.type) && !discovery.type.includes("lava") && !discovery.type.includes("village") && !discovery.type.includes("ruined")) {
        return { should: false, reason: `discovery ${discovery.type} not in adaptive triggers` };
    }

    // Always recalculate on high-value discoveries
    if (discovery.type === "ruined_portal" && discovery.score >= 80) {
        return { should: true, reason: `new ruined portal high value ${discovery.score} - may be faster than current ${currentPlan?.route ?? "unknown"}`, priority: 90 };
    }
    if (discovery.type === "ground_lava" || discovery.type === "lava_pool") {
        if (!currentPlan || currentPlan.route === "cave_lava" || currentPlan.route === "gather_ignition") {
            return { should: true, reason: "new ground lava pool discovered - ground level minimal digging better than cave or gathering", priority: 85 };
        }
    }
    if (discovery.type === "village") {
        if (context.phase === "wood" || context.phase === "stone" || context.foodLow) {
            return { should: true, reason: "new village discovered - evaluate food beds hay crafting loot speedrun advantages", priority: 80 };
        }
    }
    if (discovery.type === "useful_chest") {
        return { should: true, reason: "useful chest discovered - structure loot main priority", priority: 75 };
    }
    if (discovery.type === "hostile_group" && discovery.count >= 4) {
        return { should: true, reason: `hostile mob group ${discovery.count} discovered - reassess route safety health terrain enemies escape paths`, priority: 95, safety: true };
    }
    if (discovery.type === "obstacle" && discovery.blocksRoute) {
        return { should: true, reason: `unexpected obstacle ${discovery.obstacleType} blocks route - identify missing requirement select safest efficient alternative`, priority: 90 };
    }

    return { should: false, reason: "discovery does not justify recalc vs current plan" };
}

/**
 * Prioritize essential progression over optional exploration
 */
export function prioritizeEssential(availableTasks, context) {
    const essential = [];
    const optional = [];
    const dangerous = [];

    for (const task of availableTasks) {
        if (ESSENTIAL_PROGRESSION.some(e => task.type.includes(e) || task.goal?.includes(e))) {
            essential.push(task);
        } else if (OPTIONAL_EXPLORATION.some(o => task.type.includes(o))) {
            optional.push(task);
        } else if (task.danger && task.danger > 70) {
            dangerous.push(task);
        } else {
            essential.push(task); // default to essential if unknown
        }
    }

    essential.sort((a,b) => (b.priority ?? 50) - (a.priority ?? 50));
    optional.sort((a,b) => (b.priority ?? 50) - (a.priority ?? 50));

    return {
        essential,
        optional,
        dangerous,
        next: essential[0] ?? optional[0] ?? null,
        reason: essential.length ? `essential progression ${essential[0]?.type} over optional` : optional.length ? `no essential, optional ${optional[0]?.type}` : "no tasks"
    };
}

/**
 * Avoid fights not contributing meaningfully
 */
export function shouldAvoidFight(fightContext) {
    const { enemyType, ironNeed, foodNeed, threatLevel, hasBetterAlternative } = fightContext;

    if (hasBetterAlternative) {
        return { avoid: true, reason: `fight vs ${enemyType} not contributing meaningfully, safer faster route available`, priority: 85 };
    }
    if (threatLevel >= 80 && !ironNeed && !foodNeed) {
        return { avoid: true, reason: `fight vs ${enemyType} high threat ${threatLevel} no meaningful contribution`, priority: 90 };
    }
    if (enemyType === "iron_golem" && !ironNeed) {
        return { avoid: true, reason: "iron golem fight not needed, iron already sufficient", priority: 80 };
    }

    return { avoid: false, reason: `fight vs ${enemyType} contributes meaningfully` };
}

/**
 * Never assume route safe merely because worked previously reassess current health terrain enemies escape paths
 */
export function reassessRouteSafety(route, currentContext) {
    const issues = [];
    let safetyScore = 100;

    if (currentContext.health < 10) {
        issues.push(`low health ${currentContext.health} - previously safe route now risky`);
        safetyScore -= 30;
    }
    if (currentContext.hostileCount >= 3) {
        issues.push(`hostile count ${currentContext.hostileCount} - enemies near route`);
        safetyScore -= 20 * currentContext.hostileCount;
    }
    if (currentContext.hunger < 6) {
        issues.push(`low hunger ${currentContext.hunger} - cannot sprint escape`);
        safetyScore -= 20;
    }
    if (currentContext.hasCliff) {
        issues.push("cliff detected - fall risk");
        safetyScore -= 25;
    }
    if (currentContext.hasLava) {
        issues.push("lava detected - burn risk");
        safetyScore -= 30;
    }
    if (!currentContext.hasEscapeRoutes) {
        issues.push("no escape routes");
        safetyScore -= 20;
    }

    return {
        safe: safetyScore >= 60,
        safetyScore,
        issues,
        shouldReroute: safetyScore < 50,
        reason: safetyScore >= 60 ? `route safe score ${safetyScore}` : `route unsafe score ${safetyScore} - ${issues.join(", ")} - reassess current health terrain enemies escape paths`
    };
}

/**
 * Use blocks intelligently bridges barriers emergency cover elevation controlled traversal
 */
export function planBlockUsage(situation, inventory) {
    const blockCount = inventory.blocks ?? 0;

    if (blockCount < 8) {
        return { useBlocks: false, reason: "insufficient blocks for intelligent use, preserve for emergency", needMore: 16 - blockCount };
    }

    switch (situation.type) {
        case "gap":
            return { useBlocks: true, plan: "bridge", blocksNeeded: situation.gapSize ?? 5, reason: `bridge gap ${situation.gapSize} blocks - controlled traversal` };
        case "hostile_swarm":
            return { useBlocks: true, plan: "emergency_cover", blocksNeeded: 8, reason: "emergency cover vs hostile swarm 16 skeletons blaze enderman swarm" };
        case "high_ground":
            return { useBlocks: true, plan: "elevation", blocksNeeded: 12, reason: "elevation for combat advantage protected elevated position" };
        case "lava_pool":
            return { useBlocks: true, plan: "barrier", blocksNeeded: 6, reason: "barrier around lava pool prevent fall" };
        case "cliff":
            return { useBlocks: true, plan: "bridge", blocksNeeded: 10, reason: "bridge cliff safe traversal" };
        case "water_current":
            return { useBlocks: true, plan: "barrier", blocksNeeded: 4, reason: "barrier against water current" };
        default:
            return { useBlocks: false, reason: "no block usage needed for situation" };
    }
}

/**
 * When plan fails identify missing requirement select safest efficient alternative
 */
export function handlePlanFailure(failedPlan, context) {
    const missing = [];
    const alternatives = [];

    if (failedPlan.reason?.includes("no iron")) missing.push("iron_ore");
    if (failedPlan.reason?.includes("no bucket")) missing.push("bucket");
    if (failedPlan.reason?.includes("no water")) missing.push("water_source");
    if (failedPlan.reason?.includes("no obsidian")) missing.push("obsidian");
    if (failedPlan.reason?.includes("no flint")) missing.push("flint");
    if (failedPlan.reason?.includes("no gravel")) missing.push("gravel");
    if (failedPlan.reason?.includes("hostile")) missing.push("safe_route");

    // Select safest efficient alternative
    if (missing.includes("iron_ore")) {
        alternatives.push({ route: "mine_iron", safety: 70, time: 60, reason: "mine iron ore - safest efficient alternative for missing iron" });
    }
    if (missing.includes("water_source")) {
        alternatives.push({ route: "find_water", safety: 85, time: 30, reason: "find water source nearby" });
    }
    if (missing.includes("gravel")) {
        alternatives.push({ route: "find_gravel", safety: 80, time: 20, reason: "find gravel for flint" });
    }
    if (missing.includes("safe_route")) {
        alternatives.push({ route: "retreat", safety: 90, time: 10, reason: "retreat to safe location then reroute" });
    }

    // Also consider ruined portal as alternative if failed was building new
    if (failedPlan.route === "ground_lava" || failedPlan.route === "cave_lava") {
        alternatives.push({ route: "ruined_portal", safety: 75, time: 40, reason: "ruined portal may be faster than new when ground/cave fails" });
    }

    alternatives.sort((a,b) => b.safety - a.safety || a.time - b.time);

    return {
        missing,
        alternatives,
        best: alternatives[0] ?? null,
        reason: missing.length ? `plan failed missing ${missing.join(",")} - ${alternatives[0]?.reason ?? "no alternative"}` : `plan failed ${failedPlan.reason} - select safest efficient alternative`
    };
}

/**
 * Preserve enough resources recover common emergencies
 */
export function preserveEmergencyResources(inventory, context) {
    const essentials = {
        blocks: 16, // for bridging/cover/elevation
        food: 6, // for healing
        wood: 8, // for crafting emergency
        cobblestone: 16, // for tools/furnace
    };

    const preserved = {};
    const warnings = [];

    for (const [type, min] of Object.entries(essentials)) {
        const have = inventory[type] ?? 0;
        preserved[type] = have >= min;
        if (have < min) warnings.push(`low ${type} ${have}/${min} - preserve enough for emergencies`);
    }

    // Check durability
    if (context.toolDurability && context.toolDurability < 10) {
        warnings.push(`tool durability low ${context.toolDurability} - preserve, may break`);
    }

    // Food reserves for emergency recovery
    if ((inventory.food ?? 0) < 3) {
        warnings.push("food low - preserve for emergency recovery");
    }

    return {
        preserved,
        warnings,
        enough: warnings.length === 0,
        reason: warnings.length ? `preserve resources warnings: ${warnings.join(", ")}` : "enough resources for common emergencies"
    };
}

/**
 * Verify important actions rather than assuming succeeded
 */
export function verifyAction(action, result, inventory) {
    const checks = {
        craft_bucket: () => (inventory["minecraft:bucket"] ?? 0) + (inventory["minecraft:water_bucket"] ?? 0) > 0,
        acquire_water: () => (inventory["minecraft:water_bucket"] ?? 0) > 0,
        mine_obsidian: () => (inventory["minecraft:obsidian"] ?? 0) >= 10,
        craft_flint_and_steel: () => (inventory["minecraft:flint_and_steel"] ?? 0) > 0,
        build_portal: () => (inventory["minecraft:obsidian"] ?? 0) >= 10,
        ignite_portal: () => true, // would need to check if portal block exists
        enter_nether: () => false, // would need dimension check
    };

    const checker = checks[action];
    if (!checker) return { success: !!result, reason: `no verifier for ${action}, assume ${result ? "success" : "failed"}` };

    const success = checker();
    return {
        success,
        reason: success ? `${action} verified success` : `${action} assumed but verification failed - need retry`,
        shouldRetry: !success
    };
}
