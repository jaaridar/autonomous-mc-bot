// One module now: core/combat.js + core/escape-strategy.js (see docs/ARCHITECTURE.md).
import { MOB_ADAPTIVE, adaptTactic } from "./knowledge.js";

// ---------------------------------------------------------------- combat.js

/**
 * World-class combat tactics - pure logic, no engine deps.
 * Handles: 16 skeletons, blaze, enderman, creeper, warden, etc.
 * ADAPTIVE: works for ANY mob list, not just hardcoded - uses behavior detection.
 * Priority #1: never fight bare hand - quick tool crafting.
 * Provides threat evaluation, tactical decisions, dodge patterns.
 */

export const MOB_STATS = {
    "minecraft:zombie": { damage: 3, speed: 0.23, range: 1.5, tactic: "kite", priority: 1, fear: 3, groupFear: 0.4, kite: true },
    "minecraft:zombie_villager": { damage: 3, speed: 0.23, range: 1.5, tactic: "kite", priority: 1, fear: 3, groupFear: 0.4, kite: true },
    "minecraft:husk": { damage: 3, speed: 0.23, range: 1.5, tactic: "kite", priority: 1, fear: 4, groupFear: 0.4, kite: true, hunger: true },
    "minecraft:drowned": { damage: 3, speed: 0.23, range: 8, tactic: "cover_rush", priority: 2, fear: 5, groupFear: 0.5, cover: true },
    "minecraft:skeleton": { damage: 4, speed: 0.25, range: 16, tactic: "cover_rush", priority: 6, fear: 6, groupFear: 0.8, cover: true, strafe: true, shield: true },
    "minecraft:stray": { damage: 4, speed: 0.25, range: 16, tactic: "cover_rush", priority: 7, fear: 7, groupFear: 0.8, cover: true, strafe: true, shield: true, slow: true },
    "minecraft:bogged": { damage: 4, speed: 0.25, range: 16, tactic: "cover_rush", priority: 7, fear: 7, groupFear: 0.8, cover: true, strafe: true, shield: true, poison: true },
    "minecraft:wither_skeleton": { damage: 8, speed: 0.25, range: 1.5, tactic: "kite", priority: 7, fear: 7, groupFear: 0.6, wither: true },
    "minecraft:creeper": { damage: 22, speed: 0.25, range: 3, tactic: "retreat", priority: 10, fear: 10, groupFear: 0.5, retreat: true, explosive: true },
    "minecraft:spider": { damage: 2, speed: 0.32, range: 1.5, tactic: "strafe", priority: 2, fear: 4, groupFear: 0.5, kite: true, climb: true },
    "minecraft:cave_spider": { damage: 2, speed: 0.32, range: 1.5, tactic: "strafe", priority: 4, fear: 6, groupFear: 0.6, poison: true, kite: true },
    "minecraft:enderman": { damage: 7, speed: 0.32, range: 3, tactic: "low_roof", priority: 5, fear: 7, groupFear: 0.3, water: true, lowRoof: true, noEyeContact: true, teleport: true },
    "minecraft:witch": { damage: 6, speed: 0.25, range: 10, tactic: "rush", priority: 8, fear: 8, groupFear: 0.7, cover: true, potion: true },
    "minecraft:blaze": { damage: 6, speed: 0.3, range: 16, tactic: "dodge_rush", priority: 8, fear: 8, groupFear: 1.2, cover: true, strafe: true, fire: true, flying: true },
    "minecraft:ghast": { damage: 12, speed: 0.2, range: 32, tactic: "cover", priority: 9, fear: 9, groupFear: 1.5, cover: true, explosive: true, flying: true },
    "minecraft:phantom": { damage: 6, speed: 0.4, range: 2, tactic: "timed", priority: 6, fear: 6, groupFear: 0.8, cover: true, flying: true },
    "minecraft:slime": { damage: 3, speed: 0.2, range: 1.5, tactic: "kite", priority: 1, fear: 2, groupFear: 0.3, kite: true },
    "minecraft:magma_cube": { damage: 4, speed: 0.2, range: 1.5, tactic: "kite", priority: 2, fear: 4, groupFear: 0.4, fire: true },
    "minecraft:silverfish": { damage: 1, speed: 0.25, range: 1, tactic: "kite", priority: 2, fear: 3, groupFear: 0.8, swarm: true },
    "minecraft:endermite": { damage: 2, speed: 0.25, range: 1, tactic: "kite", priority: 2, fear: 3, groupFear: 0.5 },
    "minecraft:iron_golem": { damage: 14, speed: 0.25, range: 2.5, tactic: "pillar", priority: 9, fear: 9, groupFear: 1.0, pillar: true, heavy: true },
    "minecraft:ravager": { damage: 12, speed: 0.3, range: 2.5, tactic: "pillar", priority: 9, fear: 9, groupFear: 1.0, pillar: true, heavy: true },
    "minecraft:warden": { damage: 30, speed: 0.3, range: 4, tactic: "flee", priority: 10, fear: 10, groupFear: 2.0, noFight: true, boss: true },
    "minecraft:ender_dragon": { damage: 10, speed: 0.5, range: 5, tactic: "flee", priority: 10, fear: 10, groupFear: 2.0, noFight: true, boss: true, flying: true },
    "minecraft:wither": { damage: 8, speed: 0.3, range: 20, tactic: "flee", priority: 10, fear: 10, groupFear: 2.0, boss: true, flying: true, explosive: true },
    "minecraft:piglin_brute": { damage: 8, speed: 0.3, range: 2, tactic: "kite", priority: 7, fear: 7, groupFear: 0.8, heavy: true },
    "minecraft:evoker": { damage: 6, speed: 0.25, range: 12, tactic: "rush", priority: 8, fear: 8, groupFear: 0.8, summon: true },
    "minecraft:evocation_illager": { damage: 6, speed: 0.25, range: 12, tactic: "rush", priority: 8, fear: 8, groupFear: 0.8, summon: true },
    "minecraft:vindicator": { damage: 7, speed: 0.28, range: 1.5, tactic: "kite", priority: 6, fear: 6, groupFear: 0.7, heavy: true },
    "minecraft:pillager": { damage: 4, speed: 0.25, range: 12, tactic: "cover_rush", priority: 5, fear: 5, groupFear: 0.7, cover: true, strafe: true },
    "minecraft:guardian": { damage: 6, speed: 0.3, range: 12, tactic: "cover", priority: 6, fear: 6, groupFear: 0.6, cover: true },
    "minecraft:elder_guardian": { damage: 8, speed: 0.3, range: 12, tactic: "flee", priority: 8, fear: 8, groupFear: 1.0, boss: true },
    "minecraft:shulker": { damage: 4, speed: 0, range: 16, tactic: "cover", priority: 6, fear: 6, groupFear: 0.5, cover: true, levitation: true },
    "minecraft:hoglin": { damage: 6, speed: 0.3, range: 2, tactic: "pillar", priority: 6, fear: 6, groupFear: 0.6, heavy: true },
    "minecraft:zoglin": { damage: 8, speed: 0.3, range: 2, tactic: "pillar", priority: 7, fear: 7, groupFear: 0.7, heavy: true },
    "minecraft:piglin": { damage: 4, speed: 0.25, range: 2, tactic: "kite", priority: 3, fear: 4, groupFear: 0.5 },
    "minecraft:vex": { damage: 5, speed: 0.35, range: 1.5, tactic: "strafe", priority: 6, fear: 6, groupFear: 0.7, flying: true, fast: true },
};

export function getMobStat(typeId) {
    if (MOB_STATS[typeId]) return MOB_STATS[typeId];
    // ADAPTIVE: for unknown mobs, infer from name
    const isRanged = MOB_ADAPTIVE.isRanged(typeId);
    const isExplosive = MOB_ADAPTIVE.isExplosive(typeId);
    const isBoss = MOB_ADAPTIVE.isBoss(typeId);
    const isFlying = MOB_ADAPTIVE.isFlying(typeId);
    const isEnderman = MOB_ADAPTIVE.isEnderman(typeId);
    const isFast = MOB_ADAPTIVE.isFast(typeId);

    if (isBoss) return { damage: 15, speed: 0.3, range: 4, tactic: "flee", priority: 10, fear: 10, groupFear: 2.0, noFight: true, boss: true };
    if (isEnderman) return { damage: 7, speed: 0.32, range: 3, tactic: "low_roof", priority: 5, fear: 7, groupFear: 0.3, water: true, lowRoof: true, teleport: true };
    if (isExplosive) return { damage: 20, speed: 0.25, range: 3, tactic: "retreat", priority: 10, fear: 10, groupFear: 0.5, explosive: true };
    if (isRanged) return { damage: 4, speed: 0.25, range: 16, tactic: "cover_rush", priority: 6, fear: 6, groupFear: 0.8, cover: true, strafe: true, shield: true };
    if (isFlying) return { damage: 5, speed: 0.35, range: 8, tactic: "cover", priority: 6, fear: 6, groupFear: 0.6, cover: true, flying: true };
    if (isFast) return { damage: 3, speed: 0.35, range: 1.5, tactic: "pillar", priority: 4, fear: 5, groupFear: 0.5, fast: true };
    // Default melee
    return { damage: 3, speed: 0.25, range: 1.5, tactic: "kite", priority: 2, fear: 4, groupFear: 0.5, kite: true };
}

export function shouldRetreat(hp, threatScore, count, hasWeapon, armor, hasShield, hasWater, threats) {
    // NEVER fight bare hand - priority #1 quick tool
    if (!hasWeapon) return true;
    // Warden or boss = always retreat unless well geared
    if (threats?.some(t => getMobStat(t.typeId).noFight)) return true;
    if (hp <= 6) return true;
    if (threatScore >= 25) return true;
    if (count >= 8) return true;
    if (count >= 4 && hp <= 14) return true;
    // Adaptive: check for ranged swarm without shield
    const rangedCount = threats?.filter(t => MOB_ADAPTIVE.isRanged(t.typeId)).length ?? 0;
    if (rangedCount >= 4 && !hasShield) return true;
    if (rangedCount >= 6) return true;
    // Enderman without water and low hp
    if (hp <= 10 && threats?.some(t => MOB_ADAPTIVE.isEnderman(t.typeId)) && !hasWater) return true;
    // Blaze swarm
    if (threats?.filter(t => t.typeId === "minecraft:blaze").length >= 3 && hp <= 12) return true;
    // Any swarm with low armor
    if (count >= 6 && hp <= 12 && !hasShield) return true;
    return false;
}

export function chooseTactic(targetType, context) {
    // Adaptive tactic that works for any mob
    const adaptive = adaptTactic(targetType, context?.hp ?? 20, context?.resources ?? {}, context?.threatCount ?? 1);
    if (adaptive) {
        // Map adaptive action to tactic
        const map = {
            "water_place": "low_roof",
            "low_roof": "low_roof",
            "flee": "flee",
            "cover_build": "cover_build",
            "rush_strafe": "cover_rush",
            "retreat_hit": "retreat",
            "ranged_or_cover": "cover",
            "pillar_or_water": "pillar",
            "kite": "kite"
        };
        return map[adaptive.action] ?? adaptive.action;
    }
    const stat = getMobStat(targetType);
    if (context?.hasEnderman && targetType === "minecraft:enderman") return "low_roof";
    if (context?.rangedCount >= 6) return "cover_build";
    if (context?.threatCount >= 8) return "bunker";
    return stat.tactic;
}

export function strafeDirection(botPos, targetPos, left) {
    const dx = targetPos.x - botPos.x;
    const dz = targetPos.z - botPos.z;
    if (left) return { x: -dz, z: dx };
    return { x: dz, z: -dx };
}

export function dodgePattern(tick, threatType, botPos, threatPos) {
    const stat = getMobStat(threatType);
    if (!stat.strafe && !stat.cover && !MOB_ADAPTIVE.isRanged(threatType)) return null;
    const cycle = Math.floor(tick / 8) % 4;
    const perp = strafeDirection(botPos, threatPos, cycle % 2 === 0);
    const forward = cycle < 2 ? 1 : -1;
    const dx = threatPos.x - botPos.x;
    const dz = threatPos.z - botPos.z;
    const len = Math.hypot(dx, dz) || 1;
    return {
        x: perp.x * 0.7 + (dx / len) * forward * 0.3,
        z: perp.z * 0.7 + (dz / len) * forward * 0.3
    };
}

export function endermanSafeLook(targetPos) {
    return { x: targetPos.x, y: targetPos.y - 1.5, z: targetPos.z };
}

// Quick tool check - never bare hand
export function needsQuickTool(hasWeapon, inventory) {
    if (hasWeapon) return null;
    // obtain() resolves the full chain (any logs -> planks -> sticks -> sword) for ANY wood type - never oak-only.
    return { craft: "minecraft:wooden_sword", reason: "no weapon - obtain wooden sword (any wood)" };
}

// ---------------------------------------------------------------- escape-strategy.js

/**
 * World-class escape strategy - pure logic, no engine deps.
 * Handles: skeleton swarm (16), blaze, enderman, creeper, warden, etc.
 * Provides assessment, cover finding, bunker planning, tactical retreat.
 */

export const THREAT_PROFILES = {
    "minecraft:skeleton": { type: "ranged", damage: 4, range: 16, speed: 0.25, fear: 6, cover: true, strafe: true, shield: true, groupFear: 0.8 },
    "minecraft:stray": { type: "ranged", damage: 4, range: 16, speed: 0.25, fear: 7, cover: true, strafe: true, shield: true, groupFear: 0.8, slow: true },
    "minecraft:bogged": { type: "ranged", damage: 4, range: 16, speed: 0.25, fear: 7, cover: true, strafe: true, shield: true, groupFear: 0.8, poison: true },
    "minecraft:blaze": { type: "flying_ranged", damage: 6, range: 16, speed: 0.3, fear: 8, cover: true, strafe: true, shield: false, fire: true, groupFear: 1.2 },
    "minecraft:ghast": { type: "flying_ranged", damage: 12, range: 32, speed: 0.2, fear: 9, cover: true, strafe: true, shield: false, explosive: true, groupFear: 1.5 },
    "minecraft:enderman": { type: "teleport_melee", damage: 7, range: 3, speed: 0.3, fear: 7, cover: false, water: true, lowRoof: true, noEyeContact: true, groupFear: 0.3 },
    "minecraft:creeper": { type: "explosive", damage: 22, range: 3, speed: 0.25, fear: 10, cover: false, retreat: true, groupFear: 0.5 },
    "minecraft:zombie": { type: "melee", damage: 3, range: 1.5, speed: 0.23, fear: 3, kite: true, groupFear: 0.4 },
    "minecraft:husk": { type: "melee", damage: 3, range: 1.5, speed: 0.23, fear: 4, kite: true, hunger: true, groupFear: 0.4 },
    "minecraft:drowned": { type: "melee_ranged", damage: 3, range: 8, speed: 0.23, fear: 5, cover: true, groupFear: 0.5 },
    "minecraft:spider": { type: "melee", damage: 2, range: 1.5, speed: 0.32, fear: 4, kite: true, climb: true, groupFear: 0.5 },
    "minecraft:cave_spider": { type: "melee", damage: 2, range: 1.5, speed: 0.32, fear: 6, poison: true, kite: true, groupFear: 0.6 },
    "minecraft:witch": { type: "ranged", damage: 6, range: 10, speed: 0.25, fear: 8, cover: true, rush: true, groupFear: 0.7, potion: true },
    "minecraft:phantom": { type: "flying_melee", damage: 6, range: 2, speed: 0.4, fear: 6, cover: true, timed: true, groupFear: 0.8 },
    "minecraft:iron_golem": { type: "heavy_melee", damage: 14, range: 2.5, speed: 0.25, fear: 9, pillar: true, groupFear: 1.0 },
    "minecraft:ravager": { type: "heavy_melee", damage: 12, range: 2.5, speed: 0.3, fear: 9, pillar: true, groupFear: 1.0 },
    "minecraft:warden": { type: "boss", damage: 30, range: 3, speed: 0.3, fear: 10, flee: true, groupFear: 2.0, noFight: true },
    "minecraft:ender_dragon": { type: "boss", damage: 10, range: 5, speed: 0.5, fear: 10, flee: true, groupFear: 2.0, noFight: true },
    "minecraft:wither": { type: "boss", damage: 8, range: 20, speed: 0.3, fear: 10, flee: true, cover: true, groupFear: 2.0 },
};

export function getProfile(typeId) {
    return THREAT_PROFILES[typeId] ?? { type: "melee", damage: 2, range: 1.5, speed: 0.23, fear: 3, kite: true, groupFear: 0.4 };
}

/**
 * Assess overall situation.
 * @param {number} hp
 * @param {Array} threats - list of {typeId, location, distance}
 * @param {Object} resources - {hasShield, hasWater, hasBlocks, blockCount, hasTotem, hasFood, weaponTier, armorValue}
 * @returns {Object} assessment
 */
export function assess(hp, threats, resources, botPos) {
    let totalFear = 0;
    let rangedCount = 0;
    let meleeCount = 0;
    let explosiveNear = false;
    let hasEnderman = false;
    let hasBlaze = false;
    let hasSkeletonSwarm = false;
    let closest = Infinity;
    let types = new Set();

    for (const t of threats) {
        const prof = getProfile(t.typeId);
        const dist = t.distance ?? Math.hypot(t.location.x - botPos.x, t.location.z - botPos.z);
        const distFactor = dist < 4 ? 2 : dist < 8 ? 1.2 : dist < 16 ? 0.8 : 0.4;
        totalFear += prof.fear * distFactor;
        if (prof.type.includes("ranged") || prof.type.includes("flying")) rangedCount++;
        else meleeCount++;
        if (prof.type === "explosive" && dist < 5) explosiveNear = true;
        if (t.typeId === "minecraft:enderman") hasEnderman = true;
        if (t.typeId === "minecraft:blaze") hasBlaze = true;
        if (dist < closest) closest = dist;
        types.add(t.typeId);
    }

    if (rangedCount >= 6) hasSkeletonSwarm = true;

    // Adjust fear by group
    const groupMultiplier = threats.length > 1 ? 1 + (threats.length - 1) * 0.3 : 1;
    totalFear *= groupMultiplier;

    // Resources adjustment
    if (resources.hasShield) totalFear *= 0.8;
    if (resources.hasWater && hasEnderman) totalFear *= 0.5;
    if (resources.armorValue >= 10) totalFear *= 0.7;
    if (resources.weaponTier >= 3) totalFear *= 0.8;
    if (resources.hasTotem) totalFear *= 0.6;

    let decision = "fight";
    if (hp <= 6) decision = "emergency_bunker";
    else if (explosiveNear) decision = "retreat";
    else if (hasEnderman && !resources.hasWater && hp <= 12) decision = "low_roof_bunker";
    else if (hasSkeletonSwarm && totalFear > 25) decision = "cover_build";
    else if (totalFear > 30) decision = "bunker";
    else if (totalFear > 18) decision = "cover_retreat";
    else if (totalFear > 10) decision = "strafe_fight";
    else decision = "fight";

    // Warden or boss always flee
    if (threats.some(t => getProfile(t.typeId).noFight)) decision = "flee";

    return {
        totalFear, rangedCount, meleeCount, explosiveNear, hasEnderman, hasBlaze, hasSkeletonSwarm,
        closest, threatCount: threats.length, types: [...types], decision,
        resources
    };
}
