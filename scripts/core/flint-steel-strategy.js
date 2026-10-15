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

export const IGNITION_METHODS = {
    flint_and_steel: { priority: 95, iron: 1, flint: 1, time: 3, reliability: 95, craftable: true },
    fire_charge: { priority: 80, time: 1, reliability: 90, craftable: false, lootOnly: true, note: "from ruined portal chest or blaze+gunpowder+coal" },
    lava_and_wood: { priority: 50, time: 20, reliability: 60, craftable: false, note: "place lava next to wood to ignite portal - slow, unreliable" },
    flaming_arrow: { priority: 40, time: 15, reliability: 50, craftable: false, note: "enchanted bow with flame, rare" },
    ghast_fireball: { priority: 30, time: 30, reliability: 30, note: "ghast fireball ignites portal, very unreliable" },
};

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

export function evaluateRuinedPortalForIgnitionAndObsidian(ruinedPortal, context) {
    // Check nearby ruined portals for usable obsidian, flint and steel, fire charges, useful loot
    // Evaluate chest contents and portal condition to determine whether repairing existing portal faster than constructing new
    if (!ruinedPortal) return null;

    const { obsidianCount, hasCryingObsidian, chestItems, distance, frameCompleteness } = ruinedPortal;
    let score = 50;
    let reasons = [];

    // Obsidian evaluation
    if (obsidianCount >= 10) {
        score += 30;
        reasons.push(`frame has ${obsidianCount}/10 obsidian, complete or near complete`);
    } else if (obsidianCount >= 6) {
        score += 15;
        reasons.push(`frame has ${obsidianCount}/10 obsidian, missing ${10 - obsidianCount}, repair faster than new`);
    } else if (obsidianCount >= 3) {
        score += 5;
        reasons.push(`frame has ${obsidianCount}/10 obsidian, moderate repair needed`);
    } else {
        score -= 10;
        reasons.push(`frame has only ${obsidianCount}/10 obsidian, significant repair needed`);
    }

    if (hasCryingObsidian) {
        score -= 15;
        reasons.push("has crying obsidian, need to replace with obsidian (cannot use crying for portal)");
    }

    // Chest contents
    let hasFlintAndSteel = false;
    let hasFireCharge = false;
    let hasObsidianInChest = 0;
    let hasGold = 0;
    let hasUsefulLoot = 0;

    if (chestItems) {
        for (const item of chestItems) {
            if (item.typeId === "minecraft:flint_and_steel") { hasFlintAndSteel = true; score += 25; reasons.push("chest has flint and steel"); }
            if (item.typeId === "minecraft:fire_charge") { hasFireCharge = true; score += 15; reasons.push("chest has fire charge"); }
            if (item.typeId === "minecraft:obsidian") { hasObsidianInChest += item.amount; score += 10; reasons.push(`chest has ${item.amount} obsidian`); }
            if (item.typeId === "minecraft:gold_ingot" || item.typeId === "minecraft:gold_block") { hasGold += item.amount; score += 5; }
            if (item.typeId.includes("enchanted_golden_apple") || item.typeId.includes("totem")) { hasUsefulLoot++; score += 10; }
        }
    }

    // Distance
    if (distance > 128) score -= 20;
    else if (distance < 32) score += 10;

    const missingObsidian = Math.max(0, 10 - obsidianCount);
    const totalObsidianAvailable = obsidianCount + hasObsidianInChest;
    const canComplete = totalObsidianAvailable >= 10;

    const isFasterThanNew = missingObsidian <= 6 && (hasFlintAndSteel || hasFireCharge) && canComplete;
    const timeCost = Math.ceil(distance / 10) + missingObsidian * 2 + (hasFlintAndSteel || hasFireCharge ? 1 : 5);

    return {
        pos: ruinedPortal.pos,
        distance,
        obsidianCount,
        hasCryingObsidian,
        hasFlintAndSteel,
        hasFireCharge,
        hasObsidianInChest,
        hasGold,
        hasUsefulLoot,
        missingObsidian,
        totalObsidianAvailable,
        canComplete,
        isFasterThanNew,
        score: Math.max(0, score + (isFasterThanNew ? 20 : 0)),
        reasons: reasons.join("; "),
        timeCost,
        feasibility: score > 70 ? "high" : score > 40 ? "medium" : "low",
        recommendation: isFasterThanNew ? "repair_ruined_portal_faster" : canComplete ? "repair_ruined_portal" : "gather_more_obsidian_then_repair",
        action: isFasterThanNew ? "repair_ruined_portal" : "evaluate_vs_new_portal"
    };
}

export function ensureIronForBothBucketAndFlintSteel(inventory) {
    // Ensure enough iron remains for flint and steel after satisfying bucket requirement, unless another viable ignition method available
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
            reason: "have fire charge, no need iron for flint and steel",
            totalNeeded: ironNeededForBucket,
            ironHave,
            sufficient: ironHave >= ironNeededForBucket
        };
    }

    if (ironHave >= totalNeeded) {
        return {
            needFlintSteel: !hasFlintAndSteel,
            reason: `have ${ironHave} iron, need ${totalNeeded} for bucket+flint and steel, sufficient`,
            totalNeeded,
            ironHave,
            sufficient: true,
            remainingAfter: ironHave - totalNeeded
        };
    } else {
        return {
            needFlintSteel: true,
            reason: `have ${ironHave} iron, need ${totalNeeded} for bucket+flint and steel, need ${totalNeeded - ironHave} more`,
            totalNeeded,
            ironHave,
            sufficient: false,
            needMore: totalNeeded - ironHave
        };
    }
}

export function planShortestSafeRouteToIgnition(missing, context) {
    // If no ignition resource available, plan shortest safe route to obtain missing material before committing to portal location
    const { needFlint, needIron, hasGravelNearby, distanceToGravel, hasIronNearby, distanceToIron, hostileCount } = missing;

    const options = [];

    if (needFlint) {
        if (hasGravelNearby) {
            options.push({
                action: "mine_gravel_nearby",
                distance: distanceToGravel,
                timeCost: Math.ceil(distanceToGravel / 10) + 3,
                risk: hostileCount >= 2 ? "medium" : "low",
                reason: `gravel nearby ${distanceToGravel.toFixed(0)} blocks, mine for flint 10% drop`,
                priority: 80
            });
        } else {
            options.push({
                action: "find_gravel",
                distance: 100, // unknown
                timeCost: 15,
                risk: "medium",
                reason: "find gravel to get flint",
                priority: 60
            });
        }
    }

    if (needIron) {
        if (hasIronNearby) {
            options.push({
                action: "mine_iron_nearby",
                distance: distanceToIron,
                timeCost: Math.ceil(distanceToIron / 10) + 5,
                risk: hostileCount >= 2 ? "medium" : "low",
                reason: `iron nearby ${distanceToIron.toFixed(0)} blocks`,
                priority: 85
            });
        } else {
            options.push({
                action: "find_iron",
                distance: 100,
                timeCost: 20,
                risk: "medium",
                reason: "find iron ore for bucket and flint and steel",
                priority: 70
            });
        }
    }

    options.sort((a,b) => a.timeCost - b.timeCost || b.priority - a.priority);

    return {
        bestRoute: options[0] ?? null,
        alternatives: options.slice(1),
        reason: options[0] ? `Shortest safe route to ignition: ${options[0].action} - ${options[0].reason}` : "no route found, explore",
        action: options[0]?.action ?? "explore"
    };
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
