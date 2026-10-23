/**
 * World-class combat tactics - pure logic, no engine deps.
 * Handles: 16 skeletons, blaze, enderman, creeper, warden, etc.
 * ADAPTIVE: works for ANY mob list, not just hardcoded - uses behavior detection.
 * Priority #1: never fight bare hand - quick tool crafting.
 * Provides threat evaluation, tactical decisions, dodge patterns.
 */
import { MOB_ADAPTIVE, adaptTactic, getBlockInfo, getItemInfo } from "./knowledge.js";
import { describe, archetypeOf } from "./mobs.js";
import { MOB_ARCHETYPE } from "./mobs.js";

const KNOWN = Object.keys(MOB_ARCHETYPE);

/**
 * Legacy stat view over `core/mobs.js`. Everything here is derived, so a mob the
 * table has never seen still gets sensible damage/speed/fear values instead of
 * silently falling through to a default melee blob.
 *
 * Kept as a plain object because older modules index it directly.
 */
const profiles = new Map();

export const MOB_STATS = {};
for (const id of KNOWN) {
    const full = `minecraft:${id}`;
    profiles.set(full, describe(full));
    MOB_STATS[full] = statFromProfile(profiles.get(full));
}

/** Flatten a mob description into the legacy stat shape. */
function statFromProfile(p) {
    const trait = (t) => p.traits.includes(t);
    return {
        damage: p.damage,
        speed: p.speed,
        range: p.reach,
        tactic: p.tactic,
        priority: p.priority,
        fear: p.terror,
        groupFear: p.groupFear,
        noFight: p.noFight,
        boss: trait("boss"),
        explosive: p.explosive,
        flying: p.flying,
        ranged: p.ranged,
        cover: trait("ranged") || trait("flying"),
        strafe: trait("fast") || trait("ranged"),
        shield: trait("ranged"),
        kite: p.archetype === "melee" || p.archetype === "leaper",
        water: trait("water_weak"),
        lowRoof: trait("teleport"),
        teleport: trait("teleport"),
        heavy: trait("heavy"),
        fast: trait("fast"),
        swarm: trait("swarm"),
        fire: trait("fire"),
        potion: trait("potion"),
        summon: trait("summon"),
        pillar: p.archetype === "heavy",
        poison: trait("poison"),
        wither: false,
        levitation: trait("levitation"),
        climb: trait("climb"),
    };
}

export function getMobStat(typeId) {
    const id = String(typeId ?? "");
    if (!profiles.has(id)) profiles.set(id, describe(id));
    return statFromProfile(profiles.get(id));
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
