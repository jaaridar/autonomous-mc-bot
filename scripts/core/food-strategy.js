/**
 * Food, Healing & Combat Readiness - core logic.
 * Maintain sufficient food for exploration, sprinting, combat, emergency recovery.
 * Track hunger, health, saturation where observable, availability replacement food.
 * Before dangerous fight, eat when necessary and when situation allows safely.
 * Avoid beginning combat with critical health or insufficient resources unless no safer alternative.
 * Prioritize escape, cover, survival when facing multiple hostile mobs or unfavorable encounters.
 * Recognize every hostile entity and adjust combat tactics to its attack pattern, range, movement, environmental advantages.
 * After taking damage, reassess situation instead of blindly continuing original plan.
 */

export const FOOD_VALUES = {
    "minecraft:bread": { hunger: 5, saturation: 6, healPotential: 2.5 },
    "minecraft:cooked_beef": { hunger: 8, saturation: 12.8, healPotential: 6.4 },
    "minecraft:cooked_porkchop": { hunger: 8, saturation: 12.8, healPotential: 6.4 },
    "minecraft:cooked_chicken": { hunger: 6, saturation: 7.2, healPotential: 3.6 },
    "minecraft:baked_potato": { hunger: 5, saturation: 6, healPotential: 3 },
    "minecraft:carrot": { hunger: 3, saturation: 3.6, healPotential: 1.8 },
    "minecraft:apple": { hunger: 4, saturation: 2.4, healPotential: 1.2 },
    "minecraft:golden_apple": { hunger: 4, saturation: 9.6, healPotential: 10, effect: "regen_absorption" },
    "minecraft:enchanted_golden_apple": { hunger: 4, saturation: 9.6, healPotential: 20, effect: "regen_absorption_resist_fire" },
    "minecraft:cooked_mutton": { hunger: 6, saturation: 9.6, healPotential: 4.8 },
    "minecraft:beef": { hunger: 3, saturation: 1.8, healPotential: 0.9, raw: true },
    "minecraft:porkchop": { hunger: 3, saturation: 1.8, healPotential: 0.9, raw: true },
    "minecraft:chicken": { hunger: 2, saturation: 1.2, healPotential: 0.6, raw: true, risky: true },
    "minecraft:rotten_flesh": { hunger: 4, saturation: 0.8, healPotential: 0.4, risky: true, effect: "hunger" },
};

export const COMBAT_FOOD_THRESHOLD = {
    // Hunger thresholds for combat readiness
    critical: 6, // must eat
    low: 14, // should eat before dangerous fight
    safe: 18, // safe to fight
    sprint: 6, // below cannot sprint
};

export const HEALTH_THRESHOLDS = {
    critical: 6, // must retreat/heal, avoid combat
    low: 10, // avoid dangerous fights
    medium: 14, // cautious
    safe: 18, // safe to fight
};

export function assessFoodReserves(inventory) {
    let totalHunger = 0;
    let totalSaturation = 0;
    let foodCount = 0;
    let bestFood = null;
    let bestValue = -1;

    for (const [type, amount] of Object.entries(inventory)) {
        const food = FOOD_VALUES[type];
        if (!food) continue;
        totalHunger += food.hunger * amount;
        totalSaturation += food.saturation * amount;
        foodCount += amount;
        const value = food.hunger + food.saturation;
        if (value > bestValue) {
            bestValue = value;
            bestFood = type;
        }
    }

    return {
        totalHunger,
        totalSaturation,
        foodCount,
        bestFood,
        sufficientForExploration: totalHunger >= 20,
        sufficientForCombat: totalHunger >= 30,
        sufficientForEmergency: totalHunger >= 10,
        needMore: totalHunger < 20,
        reason: `food reserves: ${foodCount} items, ${totalHunger} hunger, ${totalSaturation.toFixed(1)} saturation, best ${bestFood}`
    };
}

export function shouldEatBeforeFight(hunger, health, threatCount, threatTypes) {
    // Before initiating potentially dangerous fight, eat when necessary and when situation allows safely
    if (hunger <= COMBAT_FOOD_THRESHOLD.critical) {
        return { shouldEat: true, reason: `hunger ${hunger} <= critical ${COMBAT_FOOD_THRESHOLD.critical}, must eat before any fight`, priority: 100 };
    }
    if (health <= HEALTH_THRESHOLDS.critical) {
        return { shouldEat: true, reason: `health ${health} <= critical ${HEALTH_THRESHOLDS.critical}, heal before fight if possible`, priority: 95, needSafe: true };
    }

    const isDangerousFight = threatCount >= 3 || threatTypes.some(t => t.includes("creeper") || t.includes("skeleton") || t.includes("witch") || t.includes("blaze"));
    if (isDangerousFight) {
        if (hunger <= COMBAT_FOOD_THRESHOLD.low) {
            return { shouldEat: true, reason: `dangerous fight ${threatCount} mobs, hunger ${hunger} <= low ${COMBAT_FOOD_THRESHOLD.low}, eat if safe`, priority: 85, needSafe: true };
        }
        if (health <= HEALTH_THRESHOLDS.low) {
            return { shouldEat: true, reason: `dangerous fight, health ${health} <= low ${HEALTH_THRESHOLDS.low}, heal if safe`, priority: 85, needSafe: true };
        }
    }

    if (hunger <= COMBAT_FOOD_THRESHOLD.safe && threatCount === 1) {
        return { shouldEat: false, reason: `hunger ${hunger} <= safe but single mob, can fight then eat`, priority: 40 };
    }

    return { shouldEat: false, reason: `hunger ${hunger} health ${health} sufficient for fight`, priority: 20 };
}

export function shouldAvoidCombat(health, hunger, foodReserves, equipment, threatCount, threatTypes) {
    // Avoid beginning combat with critical health or insufficient resources unless no safer alternative
    if (health <= HEALTH_THRESHOLDS.critical) {
        return { avoid: true, reason: `health ${health} <= critical ${HEALTH_THRESHOLDS.critical}, avoid combat unless no safer alternative`, priority: 100, alternative: "retreat" };
    }
    if (hunger <= COMBAT_FOOD_THRESHOLD.critical && foodReserves.foodCount === 0) {
        return { avoid: true, reason: `hunger ${hunger} critical and no food reserves, avoid combat`, priority: 90, alternative: "find_food" };
    }
    if (!equipment.hasWeapon) {
        return { avoid: true, reason: "no weapon, avoid combat, craft quick tool #1 priority", priority: 95, alternative: "craft_weapon" };
    }
    if (threatCount >= 4) {
        return { avoid: true, reason: `multiple hostile mobs ${threatCount}, prioritize escape cover survival`, priority: 90, alternative: "escape_cover" };
    }
    if (threatCount >= 2 && health <= HEALTH_THRESHOLDS.low) {
        return { avoid: true, reason: `low health ${health} + ${threatCount} mobs, unfavorable, escape`, priority: 85, alternative: "retreat" };
    }

    return { avoid: false, reason: "combat acceptable" };
}

export function prioritizeEscapeCoverSurvival(threats, health, hasCover, hasBlocks) {
    // Prioritize escape, cover, survival when facing multiple hostile mobs or unfavorable encounters
    const count = threats.length;
    const hasRanged = threats.some(t => t.typeId.includes("skeleton") || t.typeId.includes("blaze"));
    const hasExplosive = threats.some(t => t.typeId === "minecraft:creeper");

    if (count >= 3) {
        if (hasRanged && hasCover) {
            return { action: "cover", reason: `${count} mobs including ranged, use cover`, priority: 95 };
        }
        if (hasExplosive) {
            return { action: "retreat_from_creeper", reason: "explosive present, retreat", priority: 100 };
        }
        return { action: "escape", reason: `multiple mobs ${count}, escape over fight`, priority: 90 };
    }

    if (health <= HEALTH_THRESHOLDS.critical) {
        return { action: "retreat_heal", reason: `critical health ${health}, retreat and heal`, priority: 100 };
    }

    if (hasRanged && !hasCover && hasBlocks) {
        return { action: "build_cover", reason: "ranged without cover, build wall", priority: 85 };
    }

    return { action: "fight_or_retreat", reason: "situation manageable", priority: 50 };
}

export function adjustTacticForHostile(hostileType, context) {
    // Recognize every relevant hostile entity and adjust combat tactics to its attack pattern, range, movement, environmental advantages
    const { hasShield, hasWater, hasBlocks, health, distance } = context;

    // Use knowledge.js MOB_ADAPTIVE if available, else fallback
    const type = hostileType;

    if (type.includes("skeleton") || type.includes("stray") || type.includes("bogged")) {
        return {
            tactic: "cover_rush_strafe",
            pattern: "zigzag every 8 ticks, rush 4 blocks, use shield",
            range: "16 blocks ranged, close to 4 blocks",
            movement: "strafe perpendicular",
            environmental: "use cover, wall 2 high",
            needs: hasShield ? "shield ready" : "need shield for swarm",
            reason: "skeleton: ranged, strafe, cover, shield"
        };
    }
    if (type === "minecraft:creeper") {
        return {
            tactic: "hit_and_retreat",
            pattern: "hit once, retreat 6 blocks, avoid explosion radius 3",
            range: "3 blocks explosion, 1.5 melee",
            movement: "retreat after hit",
            environmental: "open ground, avoid confined",
            needs: "open space",
            reason: "creeper: explosive punishes standing still"
        };
    }
    if (type.includes("zombie") || type.includes("husk") || type.includes("drowned")) {
        return {
            tactic: "kite",
            pattern: "hit, step back, crit if on ground",
            range: "1.5 melee",
            movement: "kite backward",
            environmental: "avoid water if drowned, avoid hunger if husk",
            reason: "zombie: melee kite"
        };
    }
    if (type.includes("spider") || type.includes("cave_spider")) {
        return {
            tactic: "strafe_pillar",
            pattern: "strafe, jump, pillar if fast",
            range: "1.5 melee, climb",
            movement: "fast 0.32, strafe",
            environmental: "avoid walls (climb), pillar 2 high",
            needs: hasBlocks ? "blocks for pillar" : "open ground",
            reason: "spider: fast, climb, poison if cave spider"
        };
    }
    if (type === "minecraft:enderman") {
        return {
            tactic: "low_roof_water",
            pattern: "water first, then low roof 2 high, look at legs not eyes",
            range: "3 melee, teleport",
            movement: "avoid eye contact, water place",
            environmental: "low roof 2 high (enderman 3 tall), water",
            needs: hasWater ? "water bucket ready" : hasBlocks ? "blocks for low roof" : "retreat",
            reason: "enderman: water weak, low roof safe, no eye contact"
        };
    }
    if (type === "minecraft:blaze") {
        return {
            tactic: "dodge_rush_water",
            pattern: "dodge every 6 ticks, rush 4 blocks, water clutch if on fire",
            range: "16 ranged fireballs, flying",
            movement: "constant strafe",
            environmental: "cover from fireballs, water",
            needs: hasWater ? "water for fire" : "cover",
            reason: "blaze: fire, flying, strafe, water clutch"
        };
    }
    if (type === "minecraft:witch") {
        return {
            tactic: "rush",
            pattern: "rush quickly, avoid potion, no time to waste",
            range: "10 potion",
            movement: "rush",
            environmental: "cover if need heal",
            reason: "witch: potion threat, rush"
        };
    }
    if (type === "minecraft:ghast") {
        return {
            tactic: "cover_bow",
            pattern: "cover from fireballs, bow if have",
            range: "32 explosive",
            movement: "cover",
            environmental: "cover essential",
            reason: "ghast: long range explosive, cover"
        };
    }
    if (type === "minecraft:iron_golem") {
        return {
            tactic: "pillar_3_high",
            pattern: "pillar 3 high, golem cannot reach",
            range: "2.5 melee 14 damage",
            movement: "maintain separation 3+ blocks high",
            environmental: "elevated protected position",
            reason: "golem: heavy damage, pillar safe"
        };
    }
    if (type === "minecraft:warden" || type === "minecraft:ender_dragon" || type === "minecraft:wither") {
        return {
            tactic: "flee",
            pattern: "flee, no fight, boss",
            range: "boss",
            movement: "flee far",
            environmental: "avoid",
            reason: "boss: no fight unless endgame"
        };
    }

    // Default melee
    return {
        tactic: "kite",
        pattern: "kite, crit",
        range: "1.5 melee",
        movement: "kite",
        environmental: "open ground",
        reason: `${type}: default melee kite`
    };
}

export function reassessAfterDamage(previousPlan, damageTaken, newHealth, newThreats, context) {
    // After taking damage, reassess situation instead of blindly continuing original plan
    const healthDrop = (context.previousHealth ?? 20) - newHealth;
    const isSignificantDamage = damageTaken >= 4 || healthDrop >= 4;

    if (newHealth <= HEALTH_THRESHOLDS.critical) {
        return {
            reassess: true,
            newPlan: "retreat_heal",
            reason: `took ${damageTaken} damage, health now ${newHealth} critical, abort original plan, retreat and heal`,
            priority: 100,
            previousPlanAborted: true
        };
    }

    if (isSignificantDamage) {
        // Check if new threats appeared
        if (newThreats.length > (context.previousThreatCount ?? 0)) {
            return {
                reassess: true,
                newPlan: "escape_cover",
                reason: `took significant damage ${damageTaken}, new threats ${newThreats.length} vs ${context.previousThreatCount}, reassess, avoid tunnel vision`,
                priority: 90,
                previousPlanAborted: true
            };
        }

        return {
            reassess: true,
            newPlan: "cautious_continue_or_retreat",
            reason: `took significant damage ${damageTaken}, health ${newHealth}, reassess situation, check if original plan still safe`,
            priority: 70,
            previousPlanAborted: false
        };
    }

    return {
        reassess: false,
        newPlan: previousPlan,
        reason: `damage ${damageTaken} not significant, health ${newHealth}, continue original plan with caution`,
        priority: 30
    };
}
