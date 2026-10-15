/**
 * Combat tactics - pure logic, no engine deps.
 * Assigns threat levels, tactics, retreat thresholds.
 */

export const MOB_STATS = {
    "minecraft:zombie": { damage: 3, speed: 0.23, range: 1, tactic: "kite", priority: 1 },
    "minecraft:husk": { damage: 3, speed: 0.23, range: 1, tactic: "kite", priority: 1 },
    "minecraft:drowned": { damage: 3, speed: 0.23, range: 1, tactic: "kite", priority: 2 },
    "minecraft:skeleton": { damage: 4, speed: 0.25, range: 16, tactic: "rush", priority: 5 },
    "minecraft:stray": { damage: 4, speed: 0.25, range: 16, tactic: "rush", priority: 5 },
    "minecraft:bogged": { damage: 4, speed: 0.25, range: 16, tactic: "rush", priority: 5 },
    "minecraft:creeper": { damage: 22, speed: 0.25, range: 3, tactic: "retreat", priority: 10 },
    "minecraft:spider": { damage: 2, speed: 0.3, range: 1, tactic: "strafe", priority: 2 },
    "minecraft:cave_spider": { damage: 2, speed: 0.3, range: 1, tactic: "strafe", priority: 3 },
    "minecraft:enderman": { damage: 7, speed: 0.3, range: 1, tactic: "shield", priority: 4 },
    "minecraft:witch": { damage: 0, speed: 0.25, range: 10, tactic: "rush", priority: 6 },
    "minecraft:blaze": { damage: 6, speed: 0.23, range: 16, tactic: "rush", priority: 6 },
    "minecraft:phantom": { damage: 6, speed: 0.3, range: 2, tactic: "timed", priority: 5 },
    "minecraft:iron_golem": { damage: 14, speed: 0.25, range: 2, tactic: "pillar", priority: 9 },
    "minecraft:ravager": { damage: 12, speed: 0.3, range: 2, tactic: "pillar", priority: 9 },
    "minecraft:warden": { damage: 30, speed: 0.3, range: 2, tactic: "flee", priority: 10 },
};

export function getMobStat(typeId) {
    return MOB_STATS[typeId] ?? { damage: 2, speed: 0.23, range: 1, tactic: "kite", priority: 1 };
}

export function combatThreatScore(entities, botPos) {
    let score = 0;
    for (const e of entities) {
        const stat = getMobStat(e.typeId);
        const dist = Math.hypot(e.location.x - botPos.x, e.location.z - botPos.z);
        const distFactor = dist < 4 ? 2 : dist < 8 ? 1 : 0.5;
        score += stat.priority * distFactor;
    }
    return score;
}

export function shouldRetreat(hp, threatScore, count, hasWeapon) {
    if (hp <= 6) return true;
    if (threatScore >= 15) return true;
    if (count >= 4 && hp <= 12) return true;
    if (!hasWeapon && count >= 1) return true;
    return false;
}

export function chooseTactic(targetType) {
    return getMobStat(targetType).tactic;
}

/**
 * Parkour combat: strafe direction that keeps distance but maintains LOS.
 */
export function strafeDirection(botPos, targetPos, left) {
    const dx = targetPos.x - botPos.x;
    const dz = targetPos.z - botPos.z;
    // perpendicular
    if (left) return { x: -dz, z: dx };
    return { x: dz, z: -dx };
}

export function critWindow(isOnGround, lastCritTick, currentTick) {
    return isOnGround && currentTick - lastCritTick > 20;
}
