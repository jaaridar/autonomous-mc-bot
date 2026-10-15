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

export const LAVA_MECHANICS = {
    sourceVsFlowing: "source lava (still) makes obsidian with water, flowing makes cobble/stone",
    detection: "source has no flow, check if lava block is source",
    poolSize: "need at least 10 lava sources for portal (10 obsidian min, 14 full frame)",
    groundLevel: "y >= 60 ideal, minimal digging, safe",
    caveLevel: "y < 40 often, but danger and travel cost must be acceptable",
    hazards: "lava spread, fire, fall, hostile mobs in caves",
};

export const PORTAL_FRAME = {
    minObsidian: 10, // without corners: 4 bottom, 3+3 sides, 4 top = 14? Actually 10 min is 4x5 hollow without corners: bottom 4, sides 3 each (6), top 4 = 14? Wait 10 min is with corners missing: bottom 2 + sides 3+3 + top 2 = 10? Let's use 10 as game minimum
    fullFrame: 14, // with corners
    dimensions: { width: 4, height: 5, interior: { width: 2, height: 3 } },
    constructionMethods: {
        bucket_lava_pool: "place water on ground lava pool to make obsidian, mine obsidian, build frame",
        ruined_portal_repair: "inspect existing frame, fill missing obsidian, replace crying obsidian",
        cave_lava_bucket: "bucket lava from cave pool, place in frame mold with water",
        lava_pool_mold: "build dirt mold, place lava with bucket, water to make obsidian in place",
    },
    fastestViable: "depends on resources: if ruined portal has >=6 obsidian and ignition, repair is fastest; if ground lava pool + water bucket, bucket method minimal digging; if no bucket, find ruined portal",
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

export function planPortalConstruction(availableObsidian, hasRuinedPortal, ruinedPortalInfo, context) {
    // Know how to construct Nether portal using available resources fastest viable method
    const obsidianHave = availableObsidian ?? 0;

    if (hasRuinedPortal && ruinedPortalInfo) {
        const missing = Math.max(0, 10 - ruinedPortalInfo.obsidianCount);
        if (missing <= 6 && obsidianHave >= missing) {
            return {
                method: "repair_ruined_portal",
                reason: `ruined portal has ${ruinedPortalInfo.obsidianCount}/10 obsidian, missing ${missing}, faster than building new`,
                steps: [
                    `inspect frame at ${ruinedPortalInfo.pos.x},${ruinedPortalInfo.pos.y},${ruinedPortalInfo.pos.z}`,
                    `replace crying obsidian if any (${ruinedPortalInfo.hasCryingObsidian ? "yes need replace" : "no"})`,
                    `place ${missing} obsidian to complete frame`,
                    "ignite portal"
                ],
                obsidianNeeded: missing,
                isFastest: true,
                timeCost: 5 + missing * 2
            };
        }
    }

    if (obsidianHave >= 10) {
        return {
            method: "build_new_portal",
            reason: `have ${obsidianHave} obsidian, build new portal 4x5 frame (10 min without corners, 14 full)`,
            steps: [
                "find flat ground 4x5 area",
                "build frame: bottom 4, sides 3 each, top 4 = 10 min (corners optional) or 14 full",
                "ensure interior 2x3 empty",
                "ignite portal"
            ],
            dimensions: PORTAL_FRAME.dimensions,
            obsidianNeeded: 0,
            isFastest: !hasRuinedPortal,
            timeCost: 15
        };
    }

    // Need more obsidian
    return {
        method: "gather_obsidian",
        reason: `have ${obsidianHave}/10 obsidian, need ${10 - obsidianHave} more from lava pool`,
        steps: [
            "find ground-level lava pool (y>=60) minimal digging",
            "use water bucket to make obsidian: water + lava source",
            "mine obsidian with diamond pickaxe",
            `gather ${10 - obsidianHave} more obsidian`
        ],
        obsidianNeeded: 10 - obsidianHave,
        timeCost: 10 + (10 - obsidianHave) * 3
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
        const portalPlan = planPortalConstruction(context.obsidianHave, true, options.ruinedPortal, context);
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
