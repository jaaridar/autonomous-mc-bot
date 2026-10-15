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

/**
 * Choose best cover direction.
 * For ranged swarm, cover is essential - find direction that maximizes blocking.
 */
export function chooseCoverDirection(botPos, threats, terrainCheck) {
    // terrainCheck is function(pos) => {hasCover, isSafe}
    const dirs = [
        { x: 1, z: 0 }, { x: -1, z: 0 }, { x: 0, z: 1 }, { x: 0, z: -1 },
        { x: 1, z: 1 }, { x: -1, z: -1 }, { x: 1, z: -1 }, { x: -1, z: 1 }
    ];
    let best = null;
    let bestScore = -Infinity;
    for (const dir of dirs) {
        let score = 0;
        for (const t of threats) {
            const prof = getProfile(t.typeId);
            if (!prof.cover) continue;
            // If we move in dir, does it put cover between us and threat?
            // Simplified: dot product - moving away from threat is good, but for ranged we want cover not just distance
            const toThreat = { x: t.location.x - botPos.x, z: t.location.z - botPos.z };
            const dot = dir.x * toThreat.x + dir.z * toThreat.z;
            // Negative dot = moving away
            if (dot < 0) score += prof.fear * 0.5;
            // Bonus if terrainCheck says cover there
            const checkPos = { x: botPos.x + dir.x * 3, y: botPos.y, z: botPos.z + dir.z * 3 };
            const check = terrainCheck ? terrainCheck(checkPos) : { hasCover: false, isSafe: true };
            if (check.hasCover) score += 10;
            if (!check.isSafe) score -= 20;
        }
        if (score > bestScore) { bestScore = score; best = dir; }
    }
    return best;
}

/**
 * Bunker design for emergency.
 * Returns plan: {type: "low_roof" for enderman, "full" for swarm, "wall" for skeletons}
 */
export function bunkerPlan(assessment) {
    if (assessment.hasEnderman) {
        return { type: "low_roof", height: 2, roof: true, water: assessment.resources.hasWater, description: "2-high roof for enderman, water inside" };
    }
    if (assessment.hasSkeletonSwarm) {
        return { type: "wall", height: 2, length: 3, roof: false, description: "2-high wall to block skeleton LOS" };
    }
    if (assessment.threatCount >= 6) {
        return { type: "full", size: 3, height: 2, roof: true, door: false, description: "3x3x2 bunker with roof for swarm" };
    }
    if (assessment.rangedCount > 0) {
        return { type: "wall", height: 2, length: 2, roof: false, description: "quick wall for ranged" };
    }
    return { type: "none", description: "no bunker needed" };
}

/**
 * Tactical positioning for fighting.
 */
export function tacticalPosition(botPos, threats, mode) {
    if (mode === "skeleton_swarm") {
        // Find position that minimizes exposure: maximize cover, minimize number of skeletons with LOS
        // For now, return direction with fewest threats
        const dirs = [{ x: 1, z: 0 }, { x: -1, z: 0 }, { x: 0, z: 1 }, { x: 0, z: -1 }];
        let best = null;
        let minExposure = Infinity;
        for (const dir of dirs) {
            const pos = { x: botPos.x + dir.x * 5, y: botPos.y, z: botPos.z + dir.z * 5 };
            let exposure = 0;
            for (const t of threats) {
                const dist = Math.hypot(pos.x - t.location.x, pos.z - t.location.z);
                if (dist < 16) exposure++;
            }
            if (exposure < minExposure) { minExposure = exposure; best = pos; }
        }
        return best;
    }
    if (mode === "enderman") {
        // Find low roof spot or water
        return { x: botPos.x, y: botPos.y, z: botPos.z, tactic: "low_roof" };
    }
    return null;
}

export function shouldUseShield(threats, hasShield) {
    if (!hasShield) return false;
    return threats.some(t => {
        const p = getProfile(t.typeId);
        return p.shield && p.type.includes("ranged");
    });
}

export function shouldUseWater(threats, hasWater) {
    if (!hasWater) return false;
    return threats.some(t => t.typeId === "minecraft:enderman" || getProfile(t.typeId).fire);
}

export function strafePattern(tick, threatType) {
    // Return strafe direction that changes every N ticks to dodge arrows
    const prof = getProfile(threatType);
    if (prof.type.includes("ranged")) {
        const cycle = Math.floor(tick / 10) % 4;
        if (cycle === 0) return { x: 1, z: 0 };
        if (cycle === 1) return { x: -1, z: 0 };
        if (cycle === 2) return { x: 0, z: 1 };
        return { x: 0, z: -1 };
    }
    return null;
}
