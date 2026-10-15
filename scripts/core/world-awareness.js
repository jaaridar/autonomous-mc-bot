/**
 * World awareness - pure logic for scanning surroundings, remembering important stuff,
 * and prioritizing goals. The bot's main goal is upskilling itself.
 */
import { detectStructure, retainScore, isCritical, SITUATION_USE, MOB_ADAPTIVE } from "./knowledge.js";

export const IMPORTANT = {
    IRON_ORE: { type: "iron_ore", score: 95, retain: true, reason: "critical for tools/armor/bucket/shield" },
    DIAMOND_ORE: { type: "diamond_ore", score: 100, retain: true, reason: "critical for obsidian/endgame" },
    COAL_ORE: { type: "coal_ore", score: 80, retain: true, reason: "torches/fuel" },
    GOLD_ORE: { type: "gold_ore", score: 75, retain: true, reason: "golden apple/barter" },
    LAPIS_ORE: { type: "lapis_ore", score: 70, retain: true, reason: "enchanting" },
    SHEEP: { type: "sheep", score: 85, retain: true, reason: "wool for bed, food" },
    COW: { type: "cow", score: 80, retain: true, reason: "leather, beef" },
    PIG: { type: "pig", score: 60, retain: false, reason: "food" },
    CHICKEN: { type: "chicken", score: 70, retain: true, reason: "feather for arrows, food" },
    HORSE: { type: "horse", score: 75, retain: true, reason: "transport if saddle" },
    VILLAGE: { type: "village", score: 95, retain: true, reason: "loot, beds, food, iron" },
    TEMPLE: { type: "temple", score: 90, retain: true, reason: "chests, treasure" },
    LAVA_POOL: { type: "lava_pool", score: 100, retain: true, reason: "portal if have water bucket" },
    RUINED_PORTAL: { type: "ruined_portal", score: 100, retain: true, reason: "free obsidian" },
    CHEST: { type: "chest", score: 85, retain: true, reason: "loot" },
    WATER: { type: "water", score: 80, retain: true, reason: "farming, obsidian, clutch" },
    OBSIDIAN: { type: "obsidian", score: 95, retain: true, reason: "portal" },
    DIAMOND: { type: "diamond", score: 100, retain: true, reason: "endgame" },
    ANCIENT_DEBRIS: { type: "ancient_debris", score: 100, retain: true, reason: "netherite" },
};

export function scoreSurrounding(blockCounts, entityCounts, distanceMap) {
    const scored = [];
    // Blocks
    for (const [block, count] of Object.entries(blockCounts)) {
        if (count <= 0) continue;
        const base = retainScore(block);
        if (base < 30) continue;
        const dist = distanceMap[block] ?? 10;
        const score = base - dist * 0.5 + count * 2;
        if (score > 40) scored.push({ type: block, kind: "block", count, score, dist, retain: isCritical(block) });
    }
    // Entities
    for (const [entity, count] of Object.entries(entityCounts)) {
        if (count <= 0) continue;
        const info = IMPORTANT[entity.toUpperCase()] ?? { score: 30, retain: false };
        const dist = distanceMap[entity] ?? 10;
        const score = (info.score ?? 30) - dist * 0.8 + count * 5;
        if (score > 40) scored.push({ type: entity, kind: "entity", count, score, dist, retain: info.retain ?? false, reason: info.reason });
    }
    scored.sort((a,b) => b.score - a.score);
    return scored;
}

export function prioritizeGoal(currentInventory, surrounding, structures, hp, hunger, hasWeapon, phase) {
    // Main goal is upskilling, but adapt to surroundings
    const goals = [];

    // 1. Survival first
    if (hp <= 6) goals.push({ goal: "escape_heal", priority: 1000, reason: "low hp" });
    if (hunger <= 6) goals.push({ goal: "find_food", priority: 900, reason: "starving" });

    // 2. Quick tool priority - NEVER bare hand
    if (!hasWeapon) {
        goals.push({ goal: "quick_tool", priority: 950, reason: "no weapon - craft quick tool #1 priority" });
    }

    // 3. Structure loot main priority if found
    for (const s of structures) {
        if (s.priority >= 90) {
            goals.push({ goal: `loot_${s.name}`, priority: s.priority + 50, reason: s.reason ?? `structure ${s.name}`, pos: s.pos, structure: s });
        } else if (s.priority >= 80) {
            goals.push({ goal: `loot_${s.name}`, priority: s.priority, reason: s.reason, pos: s.pos, structure: s });
        }
    }

    // 4. Lava pool -> portal if have water bucket or bucket
    const hasWaterBucket = (currentInventory["minecraft:water_bucket"] ?? 0) > 0;
    const hasBucket = (currentInventory["minecraft:bucket"] ?? 0) > 0;
    const hasObsidian = (currentInventory["minecraft:obsidian"] ?? 0);
    const lavaPool = surrounding.find(s => s.type.includes("lava") || s.type === "lava_pool");
    if (lavaPool) {
        if (hasWaterBucket) {
            goals.push({ goal: "make_obsidian_portal", priority: 980, reason: "lava pool + water bucket = portal", pos: lavaPool.pos ?? null });
        } else if (hasBucket) {
            goals.push({ goal: "get_water_for_portal", priority: 850, reason: "lava pool found but need water", pos: lavaPool.pos });
        } else {
            goals.push({ goal: "remember_lava_pool", priority: 800, reason: "lava pool for later portal", pos: lavaPool.pos, remember: true });
        }
    }

    // 5. Important ores / sheep retain
    for (const s of surrounding) {
        if (s.retain && s.score > 80) {
            if (s.type.includes("iron_ore") || s.type.includes("raw_iron")) {
                goals.push({ goal: "mine_iron", priority: 900, reason: "iron critical for tools/armor/bucket/shield", pos: s.pos });
            } else if (s.type.includes("diamond")) {
                goals.push({ goal: "mine_diamond", priority: 1000, reason: "diamond critical", pos: s.pos });
            } else if (s.type.includes("sheep")) {
                goals.push({ goal: "get_wool", priority: 800, reason: "sheep = bed + food", pos: s.pos });
            } else if (s.type.includes("coal")) {
                goals.push({ goal: "mine_coal", priority: 750, reason: "torch fuel", pos: s.pos });
            }
        }
    }

    // 6. Upskilling main goal based on phase
    const phaseGoals = {
        wood: { goal: "gather_wood", priority: 700, reason: "upskill wood->stone" },
        stone: { goal: "gather_stone", priority: 700, reason: "upskill stone->iron" },
        iron: { goal: "gather_iron", priority: 800, reason: "upskill iron->diamond" },
        diamond: { goal: "gather_diamond", priority: 900, reason: "upskill diamond->portal" },
        portal: { goal: "build_portal", priority: 950, reason: "upskill portal->nether" },
    };
    if (phaseGoals[phase]) goals.push(phaseGoals[phase]);

    goals.sort((a,b) => b.priority - a.priority);
    return goals[0] ?? { goal: "explore", priority: 100, reason: "no urgent goal, explore to upskill" };
}

export function shouldRemember(typeId, distance, inventory, freeSlots) {
    const score = retainScore(typeId);
    if (score >= 90) return true;
    if (score >= 80 && distance < 32) return true;
    if (score >= 70 && freeSlots > 2) return true;
    return false;
}

export function filterRetain(inventory, freeSlots) {
    // Returns list of items to keep vs drop when full
    const entries = Object.entries(inventory).map(([type, count]) => ({ type, count, score: retainScore(type) }));
    entries.sort((a,b) => b.score - a.score);
    const keep = [];
    const drop = [];
    let slotsUsed = 0;
    for (const e of entries) {
        if (e.score >= 70 || slotsUsed < 20) {
            keep.push(e);
            slotsUsed++;
        } else {
            drop.push(e);
        }
    }
    return { keep, drop };
}

// ===== DEATH RECOVERY =====
export function planDeathRecovery(deathPos, currentPos, inventory, lastItems) {
    // If died, remember position and important items lost
    const criticalLost = Object.entries(lastItems ?? {}).filter(([type]) => isCritical(type));
    const distance = Math.hypot(deathPos.x - currentPos.x, deathPos.y - currentPos.y, deathPos.z - currentPos.z);
    return {
        goal: "recover_death",
        priority: criticalLost.length > 0 ? 950 : 700,
        reason: `died at ${deathPos.x},${deathPos.y},${deathPos.z}, lost ${criticalLost.length} critical items, distance ${distance.toFixed(0)}`,
        pos: deathPos,
        criticalLost,
        distance
    };
}

// ===== BRIDGING / PARKOUR DECISION =====
export function bridgingPlan(from, to, terrainInfo) {
    // Arbitrary bridging: horizontal, diagonal, up, down depending on terrain and goal
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dz = to.z - from.z;
    const dist = Math.hypot(dx, dy, dz);
    const horizontalDist = Math.hypot(dx, dz);

    if (dy > 2) {
        return { type: "pillar_up", blocks: Math.ceil(dy), tactic: "jump_place_sneak", need: "blocks", diagonal: false };
    }
    if (dy < -3) {
        return { type: "descend", blocks: 0, tactic: "safe_drop_or_ladder", need: "check_fall", diagonal: false };
    }
    if (horizontalDist > 1) {
        const isDiagonal = Math.abs(dx) > 0.5 && Math.abs(dz) > 0.5;
        if (isDiagonal) {
            return { type: "bridge_diagonal", blocks: Math.ceil(horizontalDist), tactic: "arbitrary_support_check_diagonal", need: "blocks", diagonal: true, dx, dz };
        } else {
            return { type: "bridge_horizontal", blocks: Math.ceil(horizontalDist), tactic: "arbitrary_support_check_horizontal", need: "blocks", diagonal: false, dx, dz };
        }
    }
    return { type: "walk", blocks: 0, tactic: "walk", need: "none" };
}

export function parkourPlan(from, to, terrainInfo) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dz = to.z - from.z;
    const hDist = Math.hypot(dx, dz);

    if (dy === 1 && hDist <= 1.5) {
        return { type: "step_up", tactic: "jump", need: "headroom_2" };
    }
    if (dy === 0 && hDist > 1 && hDist <= 2.5) {
        return { type: "gap_1", tactic: "sprint_jump", need: "runup_2" };
    }
    if (dy === 0 && hDist > 2.5 && hDist <= 4) {
        return { type: "gap_2", tactic: "sprint_jump_bridge", need: "runup_3+blocks" };
    }
    if (dy === 1 && hDist > 1 && hDist <= 3) {
        return { type: "ascend_gap", tactic: "sprint_jump_up", need: "runup" };
    }
    if (dy < 0 && hDist <= 2) {
        return { type: "drop", tactic: "safe_fall_or_water_clutch", need: "water_bucket_or_3_blocks_drop" };
    }
    return { type: "walk", tactic: "walk" };
}
