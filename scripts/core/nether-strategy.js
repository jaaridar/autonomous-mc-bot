/**
 * Nether Strategy - core decision system for fastest reliable Nether entry.
 * Pure logic, no engine deps. Continuously compares 4 options:
 * 1. Ground-level lava pool (bucket+water minimal digging)
 * 2. Cave lava pool (only when accessible, usable, danger/travel acceptable)
 * 3. Ruined portal (inspect frame/loot, determine if completing faster than building new)
 * 4. Alternative nearby resources (gather missing ignition materials)
 * Chooses route with best balance time, feasibility, resource requirements, survival probability.
 */

import { retainScore, isCritical } from "./knowledge.js";

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

/**
 * Portal walk-in state machine. After the frame is ignited the bot must
 * actually stand in a nether_portal block and wait for the dimension change
 * instead of assuming ignition === entry.
 */
export function planPortalEntry(s) {
    if (s.inNether) return { action: "done", reason: "already in nether" };
    if (s.portalBlock) {
        if (s.atPortal) {
            if ((s.waitTicks ?? 0) < 80) return { action: "wait", reason: "standing in portal, waiting for teleport" };
            return { action: "retry_walk", reason: "portal did not teleport, re-enter" };
        }
        return { action: "walk_in", target: s.portalBlock, reason: "walk into nether portal" };
    }
    if (!s.ignited) return { action: "ignite", reason: "need ignition" };
    return { action: "find_portal", reason: "locate nether portal block" };
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
