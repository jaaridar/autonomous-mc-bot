/**
 * World-class combat tactics - pure logic, no engine deps.
 * Handles: 16 skeletons, blaze, enderman, creeper, warden, etc.
 * ADAPTIVE: works for ANY mob list, not just hardcoded - uses behavior detection.
 * Priority #1: never fight bare hand - quick tool crafting.
 * Provides threat evaluation, tactical decisions, dodge patterns.
 */
import { MOB_ADAPTIVE, adaptTactic, getBlockInfo, getItemInfo } from "./knowledge.js";

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

export function combatThreatScore(entities, botPos) {
    let score = 0;
    for (const e of entities) {
        const stat = getMobStat(e.typeId);
        const dist = Math.hypot(e.location.x - botPos.x, e.location.y - botPos.y, e.location.z - botPos.z);
        const distFactor = dist < 3 ? 2.5 : dist < 6 ? 1.8 : dist < 10 ? 1.2 : dist < 16 ? 0.7 : 0.3;
        let fear = stat.fear * distFactor;
        if (entities.length > 1) fear *= (1 + (entities.length - 1) * stat.groupFear * 0.15);
        score += fear;
    }
    return score;
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

export function critWindow(isOnGround, lastCritTick, currentTick) {
    return isOnGround && currentTick - lastCritTick > 20;
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

export function findCoverPosition(botPos, threats, terrainCheck) {
    let best = null;
    let bestScore = -Infinity;
    const dirs = [
        { x: 1, z: 0 }, { x: -1, z: 0 }, { x: 0, z: 1 }, { x: 0, z: -1 },
        { x: 1, z: 1 }, { x: -1, z: -1 }, { x: 1, z: -1 }, { x: -1, z: 1 }
    ];
    for (const dir of dirs) {
        for (const dist of [3, 5, 7]) {
            const pos = { x: botPos.x + dir.x * dist, y: botPos.y, z: botPos.z + dir.z * dist };
            let score = 0;
            let blocksLOS = 0;
            for (const t of threats) {
                const stat = getMobStat(t.typeId);
                if (!stat.cover && !MOB_ADAPTIVE.isRanged(t.typeId)) continue;
                const d = Math.hypot(pos.x - t.location.x, pos.z - t.location.z);
                if (d > 12) score += 5;
                else if (d < 4) score -= 10;
                if (terrainCheck) {
                    const check = terrainCheck(pos, t.location);
                    if (check.blocksLOS) { score += 15; blocksLOS++; }
                }
            }
            if (blocksLOS > 0) score += blocksLOS * 10;
            if (score > bestScore) { bestScore = score; best = pos; }
        }
    }
    return best;
}

// Quick tool check - never bare hand
export function needsQuickTool(hasWeapon, inventory) {
    if (hasWeapon) return null;
    // Need to craft weapon immediately
    const hasPlanks = Object.keys(inventory).some(k => k.includes("_planks") && inventory[k] > 0);
    const hasLogs = Object.keys(inventory).some(k => k.includes("_log") && inventory[k] > 0);
    const hasSticks = (inventory["minecraft:stick"] ?? 0) > 0;
    const hasCobble = (inventory["minecraft:cobblestone"] ?? 0) > 0;

    if (!hasPlanks && hasLogs) return { craft: "minecraft:oak_planks", reason: "need planks for weapon" };
    if (!hasSticks && hasPlanks) return { craft: "minecraft:stick", reason: "need sticks for weapon" };
    if (hasPlanks && hasSticks) return { craft: "minecraft:wooden_sword", reason: "no weapon - craft wooden sword #1 priority" };
    if (hasCobble && hasSticks) return { craft: "minecraft:stone_sword", reason: "upgrade to stone sword" };
    return { craft: "minecraft:wooden_sword", reason: "emergency weapon needed" };
}
