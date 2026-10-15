// One module now: core/nether-strategy.js + core/bucket-strategy.js + core/flint-steel-strategy.js (see docs/ARCHITECTURE.md).
import { isCritical, retainScore } from "./knowledge.js";

// ---------------------------------------------------------------- nether-strategy.js

/**
 * Nether Strategy - core decision system for fastest reliable Nether entry.
 * Pure logic, no engine deps. Continuously compares 4 options:
 * 1. Ground-level lava pool (bucket+water minimal digging)
 * 2. Cave lava pool (only when accessible, usable, danger/travel acceptable)
 * 3. Ruined portal (inspect frame/loot, determine if completing faster than building new)
 * 4. Alternative nearby resources (gather missing ignition materials)
 * Chooses route with best balance time, feasibility, resource requirements, survival probability.
 */


export const ROUTES = {
    GROUND_LAVA: "ground_lava",
    CAVE_LAVA: "cave_lava",
    RUINED_PORTAL: "ruined_portal",
    GATHER_IGNITION: "gather_ignition",
};

export const ROUTE_SCORES = {
    // Base scores before adjustments
    ground_lava: 90,
    ruined_portal: 95, // often fastest if frame good
    cave_lava: 60,
    gather_ignition: 50,
};

/**
 * Evaluate ground-level lava pool
 * @param {Object} lavaPool {pos, size, depth, accessible, surroundingDanger, distance, waterAvailable, hasBucket, hasWaterBucket}
 */
export function evaluateGroundLava(lavaPool, context) {
    if (!lavaPool) return null;
    let score = ROUTE_SCORES.ground_lava;
    const { distance, size, depth, surroundingDanger, hasBucket, hasWaterBucket, waterAvailable } = lavaPool;

    // Must have bucket
    if (!hasBucket && !hasWaterBucket) {
        score -= 50; // need bucket first
    }
    if (hasWaterBucket) score += 15; // ready to make obsidian

    // Distance penalty
    if (distance > 128) score -= 30;
    else if (distance > 64) score -= 15;
    else if (distance < 32) score += 10;

    // Size bonus: bigger pool more obsidian potential
    if (size >= 10) score += 10;
    else if (size < 4) score -= 10;

    // Depth: ground-level is shallow (y >= 60 ideally)
    if (depth !== undefined) {
        if (depth > 10) score -= 20; // deep cave
        else if (depth <= 2) score += 10; // surface
    }

    // Surrounding danger
    if (surroundingDanger) {
        const { hostileCount, lavaSpread, cliff } = surroundingDanger;
        if (hostileCount >= 3) score -= 20;
        if (lavaSpread) score -= 15;
        if (cliff) score -= 10;
    }

    // Water availability
    if (!waterAvailable && !hasWaterBucket) score -= 20;

    // Accessibility
    if (lavaPool.accessible === false) score -= 30;

    // Time cost: ground is fastest
    const timeCost = Math.ceil(distance / 10) + (hasWaterBucket ? 2 : 5);
    score -= timeCost * 0.5;

    return {
        route: ROUTES.GROUND_LAVA,
        score: Math.max(0, score),
        pos: lavaPool.pos,
        timeCost,
        feasibility: score > 60 ? "high" : score > 30 ? "medium" : "low",
        requirements: {
            bucket: !hasBucket && !hasWaterBucket,
            water: !waterAvailable && !hasWaterBucket,
            blocks: 5, // minimal
        },
        reason: `Ground lava pool distance ${distance?.toFixed(0)} size ${size} ${hasWaterBucket ? "water bucket ready" : hasBucket ? "need water" : "need bucket"}`
    };
}

export function evaluateCaveLava(lavaPool, context) {
    if (!lavaPool) return null;
    let score = ROUTE_SCORES.cave_lava;
    const { distance, size, depth, surroundingDanger, hasBucket, hasWaterBucket, accessible, travelDanger } = lavaPool;

    if (!hasBucket && !hasWaterBucket) score -= 40;

    // Cave penalty unless accessible
    if (accessible === false) score -= 40;
    if (travelDanger) {
        const { hostileCount, darkness, fallRisk } = travelDanger;
        if (hostileCount >= 2) score -= 20;
        if (darkness) score -= 10;
        if (fallRisk) score -= 15;
    }

    // Depth: cave lava often deep
    if (depth > 20) score -= 25; // very deep, dangerous
    else if (depth > 10) score -= 10;

    // Distance
    if (distance > 64) score -= 20;
    else if (distance < 24) score += 5;

    // Size
    if (size >= 8) score += 5;

    // Ground-level preferred over cave unless cave is exceptionally good
    score -= 10; // bias against cave

    const timeCost = Math.ceil(distance / 8) + 8 + (travelDanger?.hostileCount ?? 0) * 2;

    return {
        route: ROUTES.CAVE_LAVA,
        score: Math.max(0, score),
        pos: lavaPool.pos,
        timeCost,
        feasibility: score > 60 ? "medium" : "low",
        requirements: {
            bucket: !hasBucket,
            torches: 8,
            blocks: 10,
            weapon: true,
        },
        reason: `Cave lava pool distance ${distance?.toFixed(0)} depth ${depth} travel danger ${travelDanger ? "yes" : "low"} - only if accessible and danger acceptable`,
        warning: "Avoid entering cave solely because it contains lava if route introduces unnecessary danger"
    };
}

export function evaluateRuinedPortal(ruinedPortal, context) {
    if (!ruinedPortal) return null;
    let score = ROUTE_SCORES.ruined_portal;
    const { pos, distance, frameCompleteness, obsidianCount, hasCryingObsidian, chestLoot, hasFlintAndSteel, hasFireCharge, hasObsidianInChest } = ruinedPortal;

    // Frame completeness: how many obsidian already placed
    // 10 is minimum for portal (without corners), 14 is full frame
    if (obsidianCount >= 10) score += 20; // almost complete
    else if (obsidianCount >= 6) score += 10;
    else if (obsidianCount >= 3) score += 0;
    else score -= 10;

    // Crying obsidian is useless for portal, need to replace
    if (hasCryingObsidian) score -= 15;

    // Loot bonus
    if (hasFlintAndSteel) score += 25; // ignition ready
    if (hasFireCharge) score += 15;
    if (hasObsidianInChest) score += 15;
    if (chestLoot) {
        const valuable = chestLoot.filter(item => isCritical(item) || retainScore(item) >= 80).length;
        score += valuable * 3;
    }

    // Distance
    if (distance > 128) score -= 20;
    else if (distance < 32) score += 10;

    // Frame condition: if frame is good, faster than building new
    const missingObsidian = Math.max(0, 10 - obsidianCount);
    const timeCost = Math.ceil(distance / 10) + missingObsidian * 2 + (hasFlintAndSteel || hasFireCharge ? 1 : 5);

    // Compare vs building new: if missing < 6 and has ignition, ruined portal is faster
    const isFasterThanNew = missingObsidian <= 6 && (hasFlintAndSteel || hasFireCharge || context.hasFlintAndSteel);

    return {
        route: ROUTES.RUINED_PORTAL,
        score: Math.max(0, score + (isFasterThanNew ? 15 : 0)),
        pos,
        timeCost,
        feasibility: score > 70 ? "high" : score > 40 ? "medium" : "low",
        requirements: {
            obsidian: missingObsidian,
            ignition: !(hasFlintAndSteel || hasFireCharge || context.hasFlintAndSteel),
            replaceCrying: hasCryingObsidian ? 2 : 0,
        },
        reason: `Ruined portal distance ${distance?.toFixed(0)} frame ${obsidianCount}/10 obsidian ${hasCryingObsidian ? "has crying obsidian need replace" : "good"} ${hasFlintAndSteel ? "flint and steel in chest" : hasFireCharge ? "fire charge in chest" : "need ignition"} ${isFasterThanNew ? "FASTER than new portal" : "evaluate vs new"}`,
        isFasterThanNew,
        frameCompleteness,
        obsidianCount,
        missingObsidian,
    };
}

export function evaluateGatherIgnition(missing, context) {
    let score = ROUTE_SCORES.gather_ignition;
    const { needFlint, needIron, needFireCharge, hasGravelNearby, hasIron, distanceToGravel } = missing;

    if (needFlint) {
        if (hasGravelNearby) score += 10;
        else score -= 15;
        if (distanceToGravel > 64) score -= 10;
    }
    if (needIron) {
        if (hasIron) score += 10;
        else score -= 10;
    }
    if (needFireCharge) {
        // Fire charge is rare, lower score
        score -= 10;
    }

    const timeCost = (needFlint ? 5 : 0) + (needIron ? 5 : 0) + (distanceToGravel ? Math.ceil(distanceToGravel / 10) : 0);

    return {
        route: ROUTES.GATHER_IGNITION,
        score: Math.max(0, score),
        timeCost,
        feasibility: "medium",
        requirements: missing,
        reason: `Gather ignition: ${needFlint ? "need flint from gravel" : ""} ${needIron ? "need iron" : ""} ${needFireCharge ? "need fire charge" : ""}`
    };
}

/**
 * Main decision system: continuously compare all options
 */
export function chooseNetherRoute(options, context) {
    // options: {groundLava, caveLava, ruinedPortal, missingIgnition}
    const evaluations = [];

    if (options.groundLava) {
        const evalGround = evaluateGroundLava(options.groundLava, context);
        if (evalGround) evaluations.push(evalGround);
    }
    if (options.caveLava) {
        const evalCave = evaluateCaveLava(options.caveLava, context);
        if (evalCave) evaluations.push(evalCave);
    }
    if (options.ruinedPortal) {
        const evalRuined = evaluateRuinedPortal(options.ruinedPortal, context);
        if (evalRuined) evaluations.push(evalRuined);
    }
    if (options.missingIgnition) {
        const evalGather = evaluateGatherIgnition(options.missingIgnition, context);
        if (evalGather) evaluations.push(evalGather);
    }

    if (!evaluations.length) {
        return {
            route: null,
            reason: "No Nether route options available yet, continue exploration and resource gathering",
            action: "explore"
        };
    }

    // Sort by score desc, then timeCost asc
    evaluations.sort((a,b) => b.score - a.score || a.timeCost - b.timeCost);

    const best = evaluations[0];
    const second = evaluations[1];

    // If best is ruined portal and it's faster than new, prioritize
    if (best.route === ROUTES.RUINED_PORTAL && best.isFasterThanNew) {
        return {
            route: best.route,
            evaluation: best,
            alternatives: evaluations.slice(1),
            reason: `Ruined portal is faster than new: ${best.reason}`,
            action: "repair_ruined_portal",
            confidence: "high"
        };
    }

    // If best is ground lava with water bucket, that's ideal minimal digging
    if (best.route === ROUTES.GROUND_LAVA && options.groundLava.hasWaterBucket) {
        return {
            route: best.route,
            evaluation: best,
            alternatives: evaluations.slice(1),
            reason: `Ground-level lava pool with water bucket ready: ${best.reason} - minimal digging`,
            action: "build_portal_ground_lava",
            confidence: "high"
        };
    }

    // If best score is low (<40), suggest exploration
    if (best.score < 40) {
        return {
            route: best.route,
            evaluation: best,
            alternatives: evaluations.slice(1),
            reason: `Best route score low (${best.score}): ${best.reason} - continue exploration for better option`,
            action: "explore_for_better",
            confidence: "low"
        };
    }

    // Check if second is close (within 10 score) - consider time cost
    if (second && Math.abs(best.score - second.score) <= 10) {
        if (second.timeCost < best.timeCost - 3) {
            // Second is faster
            return {
                route: second.route,
                evaluation: second,
                alternatives: [best, ...evaluations.slice(2)],
                reason: `Two close options, choosing faster: ${second.reason} (time ${second.timeCost} vs ${best.timeCost})`,
                action: second.route === ROUTES.RUINED_PORTAL ? "repair_ruined_portal" : second.route === ROUTES.GROUND_LAVA ? "build_portal_ground_lava" : "build_portal_cave_lava",
                confidence: "medium"
            };
        }
    }

    return {
        route: best.route,
        evaluation: best,
        alternatives: evaluations.slice(1),
        reason: best.reason,
        action: best.route === ROUTES.RUINED_PORTAL ? "repair_ruined_portal" : best.route === ROUTES.GROUND_LAVA ? "build_portal_ground_lava" : best.route === ROUTES.CAVE_LAVA ? "build_portal_cave_lava" : "gather_ignition",
        confidence: best.score > 70 ? "high" : best.score > 50 ? "medium" : "low"
    };
}

export function shouldRecalculate(newDiscovery, currentRoute, context) {
    // Recalculate plan whenever discovers village, ruined portal, lava pool, useful chest, hostile group, unexpected obstacle
    const triggers = ["village","ruined_portal","lava_pool","useful_chest","hostile_group","obstacle","ground_lava","cave_lava"];
    if (!triggers.includes(newDiscovery.type)) return false;

    // If discovery is better than current route, recalculate
    if (newDiscovery.type === "ruined_portal" && newDiscovery.obsidianCount >= 8) return true;
    if (newDiscovery.type === "ground_lava" && context.hasWaterBucket) return true;
    if (newDiscovery.type === "lava_pool" && newDiscovery.size >= 8 && context.hasBucket) return true;
    if (newDiscovery.type === "village" && context.phase === "wood") return true;
    if (newDiscovery.type === "useful_chest" && newDiscovery.hasCritical) return true;
    if (newDiscovery.type === "hostile_group" && currentRoute && currentRoute.pos) {
        // If hostile near current route, recalculate
        const dist = Math.hypot(newDiscovery.pos.x - currentRoute.pos.x, newDiscovery.pos.z - currentRoute.pos.z);
        if (dist < 16) return true;
    }
    if (newDiscovery.type === "obstacle") return true;

    return false;
}

export function verifyPortalAction(action, result, inventory) {
    // Verify important actions: crafting, bucket acquisition, portal construction, ignition, Nether entry
    switch (action) {
        case "craft_bucket":
            return (inventory["minecraft:bucket"] ?? 0) > 0 || (inventory["minecraft:water_bucket"] ?? 0) > 0 ? { success: true } : { success: false, reason: "bucket not in inventory after craft" };
        case "obtain_water":
            return (inventory["minecraft:water_bucket"] ?? 0) > 0 ? { success: true } : { success: false, reason: "water bucket not obtained" };
        case "build_portal_frame":
            return result === "placed" || result === "complete" ? { success: true } : { success: false, reason: `portal frame build result ${result}` };
        case "ignite_portal":
            return result === "ignited" ? { success: true } : { success: false, reason: `ignition failed ${result}` };
        case "enter_nether":
            return result === "in_nether" ? { success: true } : { success: false, reason: "not in nether after entry attempt" };
        default:
            return { success: true };
    }
}

// ---------------------------------------------------------------- bucket-strategy.js

/**
 * Bucket Acquisition & Nether Preparation - core logic.
 * Treat bucket as major progression milestone because enables efficient use ground-level lava pools and Nether-entry strategies.
 * Once bucket obtained, prioritize locating suitable lava pool or evaluating nearby ruined portal.
 * Understand mechanics water placement, lava manipulation, portal-frame construction, obsidian formation, safe portal ignition.
 * Know how to construct Nether portal using available resources fastest viable method.
 * Evaluate ground-level lava pools, cave lava pools, ruined portals as alternative routes rather than single rigid strategy.
 * Account depth, accessibility, surrounding terrain, water availability, hostile mobs, escape routes when choosing lava pool.
 * Avoid entering cave solely because it contains lava if route introduces unnecessary danger or excessive travel time.
 */

export const BUCKET_MILESTONE = {
    ironNeeded: 3,
    priority: 95,
    reason: "bucket enables ground-level lava pools, obsidian formation, water clutch, fastest Nether entry",
};

export const WATER_MECHANICS = {
    obsidianFormation: "water + lava source = obsidian, water + flowing lava = cobblestone (avoid)",
    placement: "place water above or adjacent to lava source, not directly into lava (creates cobble)",
    retrieval: "use bucket on water source to retrieve, or let flow",
    clutch: "water bucket clutch for falls, lava, fire",
    farming: "water for crops",
    escape: "water for enderman, blaze fire",
};

export function evaluateBucketPriority(inventory, context) {
    const hasBucket = (inventory["minecraft:bucket"] ?? 0) > 0;
    const hasWaterBucket = (inventory["minecraft:water_bucket"] ?? 0) > 0;
    const hasIron = (inventory["minecraft:iron_ingot"] ?? 0) >= 3;
    const hasRawIron = (inventory["minecraft:raw_iron"] ?? 0) >= 3;

    if (hasWaterBucket) {
        return { priority: 0, reason: "already have water bucket, milestone achieved", milestone: true };
    }
    if (hasBucket) {
        return { priority: 80, reason: "have bucket, need water for obsidian and clutch", milestone: true, next: "get_water" };
    }

    // Need bucket: 3 iron ingots
    const ironHave = (inventory["minecraft:iron_ingot"] ?? 0) + (inventory["minecraft:raw_iron"] ?? 0);
    const ironNeeded = Math.max(0, 3 - ironHave);

    let priority = BUCKET_MILESTONE.priority;
    if (context.phase === "iron" || context.phase === "diamond" || context.phase === "portal") priority += 10;
    if (context.hasLavaPool) priority += 15;
    if (context.hasRuinedPortal) priority += 5;

    return {
        priority,
        reason: BUCKET_MILESTONE.reason,
        ironNeeded,
        ironHave,
        hasIron: ironHave >= 3,
        hasRawIron: hasRawIron,
        canCraft: hasIron,
        needSmelt: hasRawIron && !hasIron,
        milestone: false,
        isMajorMilestone: true,
        nextSteps: hasIron ? ["craft_bucket"] : hasRawIron ? ["smelt_iron","craft_bucket"] : ["find_iron"]
    };
}

export function evaluateLavaPoolForBucket(lavaPool, context) {
    // Account depth, accessibility, surrounding terrain, water availability, hostile mobs, escape routes
    if (!lavaPool) return null;

    let score = 70;
    let reasons = [];
    let warnings = [];

    // Depth
    const depth = lavaPool.depth ?? (lavaPool.pos.y < 60 ? 60 - lavaPool.pos.y : 0);
    if (depth <= 2) {
        score += 20;
        reasons.push("ground-level lava pool (y>=60) minimal digging");
    } else if (depth <= 10) {
        score += 5;
        reasons.push("shallow cave lava pool, moderate digging");
    } else if (depth <= 20) {
        score -= 10;
        warnings.push("deep cave lava pool, significant travel");
    } else {
        score -= 25;
        warnings.push("very deep lava pool, excessive travel time and danger");
    }

    // Accessibility
    if (lavaPool.accessible === false) {
        score -= 30;
        warnings.push("not accessible");
    } else if (lavaPool.accessible) {
        score += 10;
        reasons.push("accessible");
    }

    // Surrounding terrain
    if (lavaPool.surroundingTerrain) {
        const { flat, hasWaterNearby, cliff, lavaSpread } = lavaPool.surroundingTerrain;
        if (flat) { score += 10; reasons.push("flat terrain easy portal build"); }
        if (hasWaterNearby) { score += 15; reasons.push("water nearby for obsidian"); }
        if (cliff) { score -= 10; warnings.push("near cliff, knockback risk"); }
        if (lavaSpread) { score -= 15; warnings.push("lava spread hazard"); }
    }

    // Water availability
    if (context.hasWaterBucket) {
        score += 15;
        reasons.push("have water bucket ready");
    } else if (context.hasWaterNearby || lavaPool.waterAvailable) {
        score += 5;
        reasons.push("water available nearby");
    } else {
        score -= 10;
        warnings.push("no water nearby, need bucket + water source");
    }

    // Hostile mobs
    if (lavaPool.hostileCount >= 3) {
        score -= 20;
        warnings.push(`hostile mobs ${lavaPool.hostileCount} near lava pool`);
    } else if (lavaPool.hostileCount === 0) {
        score += 5;
        reasons.push("no hostile mobs near lava pool");
    }

    // Escape routes
    if (lavaPool.escapeRoutes !== undefined) {
        if (lavaPool.escapeRoutes >= 2) { score += 10; reasons.push("multiple escape routes"); }
        else if (lavaPool.escapeRoutes === 0) { score -= 15; warnings.push("no escape route"); }
    }

    // Cave vs ground: avoid entering cave solely because it contains lava if route introduces unnecessary danger
    if (lavaPool.isCave && depth > 10) {
        if (lavaPool.hostileCount >= 2 || lavaPool.travelDanger) {
            score -= 20;
            warnings.push("cave lava pool with danger, avoid entering solely for lava if unnecessary danger or excessive travel");
        }
    }

    const timeCost = Math.ceil((lavaPool.distance ?? 50) / 10) + depth + (lavaPool.hostileCount ?? 0) * 2;

    return {
        pos: lavaPool.pos,
        score: Math.max(0, score),
        reasons: reasons.join("; "),
        warnings: warnings.join("; "),
        timeCost,
        feasibility: score > 70 ? "high" : score > 50 ? "medium" : "low",
        isGroundLevel: depth <= 2,
        isCave: lavaPool.isCave ?? depth > 10,
        shouldUse: score > 60,
        shouldAvoidCave: lavaPool.isCave && score < 50,
        requirements: {
            bucket: !context.hasBucket,
            water: !context.hasWaterBucket && !lavaPool.waterAvailable,
            blocks: 5,
            torches: lavaPool.isCave ? 8 : 0,
        },
        decision: score > 60 ? "use_lava_pool" : score > 40 ? "consider_with_caution" : "avoid_find_better"
    };
}

export function planObsidianFormation(lavaPool, hasWaterBucket, hasBucket) {
    // Water placement, lava manipulation, obsidian formation
    if (!lavaPool) return { action: "find_lava_pool", reason: "no lava pool" };

    if (hasWaterBucket) {
        return {
            action: "water_on_lava_source",
            steps: [
                "find lava source blocks (not flowing)",
                "place water above or adjacent to lava source, not directly into flowing",
                "water + lava source = obsidian",
                "mine obsidian with diamond pickaxe (or iron if no diamond? but need diamond for obsidian)",
                "collect 10 obsidian minimum"
            ],
            mechanics: WATER_MECHANICS.obsidianFormation,
            need: "diamond_pickaxe for obsidian, or if ruined portal has obsidian",
            reason: "have water bucket, can make obsidian directly from ground lava pool"
        };
    }

    if (hasBucket) {
        return {
            action: "bucket_lava_to_mold",
            steps: [
                "find water source, fill bucket to get water bucket",
                "build dirt mold 4x5 for portal frame",
                "bucket lava from pool into mold (place lava source)",
                "place water to make obsidian in mold",
                "repeat for 10 obsidian"
            ],
            reason: "have bucket but no water, get water first then bucket method"
        };
    }

    return {
        action: "need_bucket_first",
        steps: ["find iron 3 ingots", "craft bucket", "find water and lava"],
        reason: "need bucket for efficient lava pool use"
    };
}

export function chooseFastestViableMethod(options, context) {
    // Evaluate ground-level lava pools, cave lava pools, ruined portals as alternative routes rather than single rigid strategy
    const methods = [];

    if (options.groundLava) {
        const evalGround = evaluateLavaPoolForBucket(options.groundLava, context);
        if (evalGround) methods.push({ ...evalGround, route: "ground_lava", method: "bucket_lava_pool" });
    }
    if (options.caveLava) {
        const evalCave = evaluateLavaPoolForBucket({ ...options.caveLava, isCave: true }, context);
        if (evalCave) methods.push({ ...evalCave, route: "cave_lava", method: "cave_bucket" });
    }
    if (options.ruinedPortal) {
        methods.push({ ...portalPlan, score: options.ruinedPortal.score ?? 70, route: "ruined_portal" });
    }

    if (!methods.length) return { method: "explore", reason: "no lava pool or ruined portal yet, explore" };

    methods.sort((a,b) => (b.score ?? 50) - (a.score ?? 50) || (a.timeCost ?? 20) - (b.timeCost ?? 20));

    const best = methods[0];
    return {
        bestMethod: best.method,
        bestRoute: best.route,
        evaluation: best,
        alternatives: methods.slice(1),
        reason: `Fastest viable: ${best.method} - ${best.reason} (score ${best.score}, time ${best.timeCost})`,
        action: best.method
    };
}

// ---------------------------------------------------------------- flint-steel-strategy.js

/**
 * Flint and Steel & Portal Ignition - core logic.
 * Prefer obtaining flint and steel before committing to portal-building location when no unnecessary delays.
 * Check nearby ruined portals for usable obsidian, flint and steel, fire charges, useful loot.
 * Evaluate chest contents and portal condition to determine whether repairing existing portal faster than constructing new.
 * If ignition supplies unavailable, evaluate crafting flint and steel using iron and flint.
 * If flint missing, locate gravel and obtain flint using appropriate mining strategy.
 * Ensure enough iron remains for flint and steel after satisfying bucket requirement, unless another viable ignition method available.
 * Do not waste time searching for flint and steel if faster reliable ignition method already available.
 * If no ignition resource available, plan shortest safe route to obtain missing material before committing to portal location.
 */

export function evaluateIgnitionOptions(inventory, ruinedPortalLoot, context) {
    const hasFlintAndSteel = (inventory["minecraft:flint_and_steel"] ?? 0) > 0;
    const hasFireCharge = (inventory["minecraft:fire_charge"] ?? 0) > 0;
    const hasFlint = (inventory["minecraft:flint"] ?? 0) > 0;
    const hasIron = (inventory["minecraft:iron_ingot"] ?? 0) > 0;
    const hasGravel = (inventory["minecraft:gravel"] ?? 0) > 0;
    const hasBucket = (inventory["minecraft:bucket"] ?? 0) > 0 || (inventory["minecraft:water_bucket"] ?? 0) > 0;

    // Check ruined portals for usable ignition
    let ruinedHasFlintAndSteel = false;
    let ruinedHasFireCharge = false;
    let ruinedHasObsidian = 0;
    if (ruinedPortalLoot) {
        ruinedHasFlintAndSteel = ruinedPortalLoot.some(item => item.typeId === "minecraft:flint_and_steel");
        ruinedHasFireCharge = ruinedPortalLoot.some(item => item.typeId === "minecraft:fire_charge");
        ruinedHasObsidian = ruinedPortalLoot.filter(item => item.typeId === "minecraft:obsidian").reduce((sum, item) => sum + item.amount, 0);
    }

    if (hasFlintAndSteel) {
        return {
            method: "flint_and_steel",
            available: true,
            reason: "already have flint and steel, ignition ready",
            priority: 100,
            action: "ignite_portal",
            timeCost: 1,
            isFastestReliable: true
        };
    }

    if (hasFireCharge) {
        return {
            method: "fire_charge",
            available: true,
            reason: "have fire charge, can ignite portal",
            priority: 90,
            action: "ignite_portal",
            timeCost: 1,
            isFastestReliable: true
        };
    }

    if (ruinedHasFlintAndSteel) {
        return {
            method: "flint_and_steel_loot",
            available: false,
            needLoot: true,
            pos: context.ruinedPortalPos,
            reason: "ruined portal chest has flint and steel, loot it - faster than crafting",
            priority: 95,
            action: "loot_ruined_portal",
            timeCost: Math.ceil((context.distanceToRuinedPortal ?? 50) / 10) + 2,
            isFastestReliable: true
        };
    }

    if (ruinedHasFireCharge) {
        return {
            method: "fire_charge_loot",
            available: false,
            needLoot: true,
            pos: context.ruinedPortalPos,
            reason: "ruined portal chest has fire charge, loot it for ignition",
            priority: 85,
            action: "loot_ruined_portal",
            timeCost: Math.ceil((context.distanceToRuinedPortal ?? 50) / 10) + 2
        };
    }

    // Craft flint and steel: iron + flint
    if (hasFlint && hasIron) {
        // Ensure enough iron remains after bucket
        const ironNeededForBucket = hasBucket ? 0 : 3;
        const ironHave = inventory["minecraft:iron_ingot"] ?? 0;
        const ironRemainingAfterBucket = ironHave - ironNeededForBucket;

        if (ironRemainingAfterBucket >= 1 || hasBucket) {
            return {
                method: "flint_and_steel_craft",
                available: false,
                canCraft: true,
                reason: `can craft flint and steel: have flint and iron, remaining after bucket ${ironRemainingAfterBucket} >=1, ${hasBucket ? "bucket already have" : `need bucket ${ironNeededForBucket} iron`}`,
                priority: 90,
                action: "craft_flint_and_steel",
                recipe: "1 iron ingot + 1 flint",
                timeCost: 3,
                isFastestReliable: true,
                ironCheck: true
            };
        } else {
            return {
                method: "need_more_iron_for_both",
                available: false,
                reason: `need iron for both bucket (${ironNeededForBucket}) and flint and steel (1), have ${ironHave}, need ${ironNeededForBucket + 1 - ironHave} more`,
                priority: 80,
                action: "gather_iron",
                need: ironNeededForBucket + 1 - ironHave,
                timeCost: 10
            };
        }
    }

    if (!hasFlint) {
        // Need flint from gravel
        const hasGravelNearby = context.hasGravelNearby;
        const distanceToGravel = context.distanceToGravel ?? 50;

        return {
            method: "need_flint_from_gravel",
            available: false,
            needFlint: true,
            hasGravel,
            hasGravelNearby,
            distanceToGravel,
            reason: `need flint, ${hasGravel ? "have gravel in inventory, mine it" : hasGravelNearby ? `gravel nearby ${distanceToGravel.toFixed(0)} blocks` : "find gravel to get flint (10% drop rate)"}`,
            priority: 75,
            action: hasGravel ? "mine_gravel" : "find_gravel",
            miningStrategy: "mine gravel, 10% flint drop, fortune not needed",
            timeCost: hasGravel ? 3 : Math.ceil(distanceToGravel / 10) + 5
        };
    }

    if (!hasIron) {
        return {
            method: "need_iron",
            available: false,
            reason: "need iron ingot for flint and steel",
            priority: 70,
            action: "gather_iron",
            timeCost: 10
        };
    }

    return {
        method: "unknown",
        available: false,
        reason: "no ignition resource available, need to find flint and iron",
        priority: 50,
        action: "explore_for_ignition",
        timeCost: 20
    };
}

export function shouldObtainFlintAndSteelBeforePortal(context) {
    // Prefer obtaining flint and steel before committing to portal-building location when no unnecessary delays
    const { hasFlintAndSteel, hasFireCharge, hasRuinedPortalNearby, distanceToRuinedPortal, hasLavaPool, hasBucket, phase } = context;

    if (hasFlintAndSteel || hasFireCharge) {
        return { should: false, reason: "already have ignition, commit to portal location", priority: 0 };
    }

    if (hasRuinedPortalNearby && distanceToRuinedPortal < 64) {
        // Check if ruined portal has ignition in chest
        return { should: true, reason: "ruined portal nearby may have flint and steel or fire charge in chest, check before committing to new portal location", priority: 85, action: "check_ruined_portal_first" };
    }

    if (hasLavaPool && hasBucket && phase === "portal") {
        // If we have lava pool and bucket but no ignition, should get ignition first if not too far
        const hasFlint = context.hasFlint;
        const hasIron = context.hasIron;
        if (hasFlint && hasIron) {
            return { should: true, reason: "have lava pool and bucket, have flint and iron, craft flint and steel before committing to portal location (no delay)", priority: 90, action: "craft_flint_and_steel_quick" };
        }
        if (context.hasGravelNearby && context.distanceToGravel < 32) {
            return { should: true, reason: "lava pool ready, gravel nearby for flint, get ignition before portal (short delay)", priority: 75, action: "get_flint_quick" };
        }
    }

    return { should: false, reason: "no unnecessary delay for ignition, commit to portal then gather ignition if needed", priority: 20 };
}

export function ensureIronForBothBucketAndFlintSteel(inventory, context = {}) {
    // Ensure enough iron remains for flint and steel after satisfying bucket requirement, unless another viable ignition method available
    // context optional for richer reasoning (hasWaterNearby etc)
    const hasBucket = (inventory["minecraft:bucket"] ?? 0) > 0 || (inventory["minecraft:water_bucket"] ?? 0) > 0;
    const hasFlintAndSteel = (inventory["minecraft:flint_and_steel"] ?? 0) > 0;
    const hasFireCharge = (inventory["minecraft:fire_charge"] ?? 0) > 0;
    const ironHave = inventory["minecraft:iron_ingot"] ?? 0;

    const ironNeededForBucket = hasBucket ? 0 : 3;
    const ironNeededForFlintSteel = hasFlintAndSteel || hasFireCharge ? 0 : 1;
    const totalNeeded = ironNeededForBucket + ironNeededForFlintSteel;

    if (hasFireCharge) {
        // Fire charge available, no need iron for flint and steel
        return {
            needFlintSteel: false,
            enough: true,
            sufficient: true,
            reason: "have fire charge, no need iron for flint and steel",
            totalNeeded: ironNeededForBucket,
            ironHave,
            need: 0
        };
    }

    if (ironHave >= totalNeeded) {
        return {
            needFlintSteel: !hasFlintAndSteel,
            enough: true,
            sufficient: true,
            reason: `have ${ironHave} iron, need ${totalNeeded} for bucket+flint and steel, sufficient`,
            totalNeeded,
            ironHave,
            sufficient: true,
            remainingAfter: ironHave - totalNeeded,
            need: 0
        };
    } else {
        return {
            needFlintSteel: true,
            enough: false,
            sufficient: false,
            reason: `have ${ironHave} iron, need ${totalNeeded} for bucket+flint and steel, need ${totalNeeded - ironHave} more`,
            totalNeeded,
            ironHave,
            sufficient: false,
            needMore: totalNeeded - ironHave,
            need: totalNeeded - ironHave
        };
    }
}

export function shouldNotWasteTimeSearchingFlintSteel(context) {
    // Do not waste time searching for flint and steel if faster reliable ignition method already available
    if (context.hasFireCharge) {
        return { shouldNotSearch: true, reason: "have fire charge, faster reliable ignition already available, don't waste time searching flint and steel", alternative: "use_fire_charge" };
    }
    if (context.hasFlintAndSteel) {
        return { shouldNotSearch: true, reason: "already have flint and steel", alternative: "none" };
    }
    if (context.hasLavaAndWoodMethod && context.timeCostLavaWood < 10) {
        return { shouldNotSearch: false, reason: "lava and wood method available but slow, flint and steel still preferred if quick", alternative: "flint_and_steel_if_quick" };
    }

    return { shouldNotSearch: false, reason: "no faster reliable ignition available, search for flint and steel", alternative: "search_flint_and_steel" };
}
