// Shared combat helpers.
//
// Mob ids, ranged/explosive classification and the "is this actually dangerous"
// test live here so the combat and survival skills agree on what a threat is.

import { HOSTILES, RANGED, EXPLOSIVE, threatRank } from "../../core/world.js";
import { MOB_STATS } from "../../core/combat.js";

export { HOSTILES, RANGED, EXPLOSIVE, threatRank, MOB_STATS };

export const EXPOSIVE_SAFE_DISTANCE = 5;

/** Rank threats: closer first, then by threat rank, then by id for stability. */
export function rankThreats(threats) {
    return [...threats].sort((a, b) =>
        (a.distance - b.distance) ||
        (threatRank(b.typeId) - threatRank(a.typeId)) ||
        String(a.id).localeCompare(String(b.id)));
}

/** Is this entity one the bot should treat as a danger? */
export function isDangerous(typeId) {
    return HOSTILES.has(typeId) || RANGED.has(typeId) || EXPLOSIVE.has(typeId);
}

/** Estimated damage one hit from this mob does, from the migrated stat table. */
export function mobDamage(typeId) {
    return MOB_STATS[typeId]?.damage ?? MOB_STATS[typeId.replace("minecraft:", "")]?.damage ?? 2;
}

/** Can this mob actually reach the bot where it stands (ranged vs melee)? */
export function canReach(typeId, distance) {
    if (RANGED.has(typeId) || typeId === "minecraft:skeleton" || typeId === "minecraft:stray")
        return distance <= 16;
    if (typeId === "minecraft:creeper")
        return distance <= 4;
    return distance <= 2.5;
}

/** Threat score used by the retreat rule. */
export function threatScore(threats) {
    let score = 0;
    for (const threat of threats)
        score += threatRank(threat.typeId) * (threat.distance <= 3 ? 1.5 : threat.distance <= 8 ? 1.0 : 0.5);
    return score;
}

/** Shelter/cover cells: solid blocks adjacent to the bot that block line of sight. */
export function coverCells(ctx, { radius = 5 } = {}) {
    const cells = [];
    const base = { x: Math.floor(ctx.self.pos.x), y: Math.floor(ctx.self.pos.y), z: Math.floor(ctx.self.pos.z) };
    for (let dx = -radius; dx <= radius; dx++)
        for (let dz = -radius; dz <= radius; dz++) {
            if (Math.abs(dx) <= 1 && Math.abs(dz) <= 1)
                continue;
            for (let dy = 0; dy <= 2; dy++) {
                const cell = { x: base.x + dx, y: base.y + dy, z: base.z + dz };
                const id = ctx.read(cell.x, cell.y, cell.z);
                if (id === "minecraft:air")
                    cells.push({ ...cell, distance: Math.hypot(dx, dz, dy) });
            }
        }
    cells.sort((a, b) => (a.distance - b.distance) || (a.x - b.x) || (a.y - b.y) || (a.z - b.z));
    return cells;
}
