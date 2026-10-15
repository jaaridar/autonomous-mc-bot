/**
 * Survival Capabilities - replaces 80 numbered scenarios with small composable set
 * Each capability is testable via fixtures
 */

export const CAPABILITIES = {
    ESCAPE: "escape",           // flee from danger, find safe spot
    BRIDGE: "bridge",           // bridge gaps, tower up, build cover
    COMBAT_RETREAT: "combat_retreat", // retreat when low health, many mobs
    FIND_FOOD: "find_food",     // locate and gather food
    FIND_SHELTER: "find_shelter", // find or build shelter at night
    HEAL: "heal",               // eat, regen
    MINE_RESOURCE: "mine_resource", // mine specific resource with tool tier
    NAVIGATE: "navigate",       // pathfind to target
    WATER_CROSSING: "water_crossing", // boat, swim, bridge over water
    LAVA_AVOIDANCE: "lava_avoidance", // avoid lava, make obsidian safely
    DARKNESS_LIGHT: "darkness_light", // place torches, avoid dark
    FALL_RECOVERY: "fall_recovery"  // recover from fall, water bucket clutch
};

export const CAPABILITY_TESTS = {
    [CAPABILITIES.ESCAPE]: [
        { scenario: "ravine_zombie", threats: ["zombie"], terrain: "ravine", health: 12 },
        { scenario: "mountain_skeleton", threats: ["skeleton"], terrain: "mountain", health: 8 },
        { scenario: "cave_spider", threats: ["cave_spider"], terrain: "cave", health: 10 }
    ],
    [CAPABILITIES.BRIDGE]: [
        { scenario: "gap_3_blocks", gap: 3, hasBlocks: true },
        { scenario: "gap_5_blocks_place_jump", gap: 5, hasBlocks: true },
        { scenario: "tower_20_blocks", vertical: 20, hasBlocks: true },
        { scenario: "tower_100_blocks", vertical: 100, hasBlocks: true }
    ],
    [CAPABILITIES.COMBAT_RETREAT]: [
        { scenario: "4hp_3_skeletons", health: 4, threats: ["skeleton","skeleton","skeleton"] },
        { scenario: "creeper_close", health: 10, threats: ["creeper"], closest: 3 },
        { scenario: "8_mobs_swarm", health: 12, threatCount: 8 }
    ],
    [CAPABILITIES.FIND_FOOD]: [
        { scenario: "hunger_4_no_food", hunger: 4, food: 0 },
        { scenario: "village_food", hunger: 8, hasVillage: true }
    ],
    [CAPABILITIES.FIND_SHELTER]: [
        { scenario: "night_no_shelter", time: "night", hasShelter: false },
        { scenario: "rain_no_shelter", time: "rain", hasShelter: false }
    ],
    [CAPABILITIES.MINE_RESOURCE]: [
        { scenario: "any_log", target: "#logs", hasAxe: false },
        { scenario: "iron_ore", target: "iron_ore", hasPickaxeTier: 2 },
        { scenario: "diamond_ore", target: "diamond_ore", hasPickaxeTier: 3 }
    ]
};

export function evaluateCapability(capability, context) {
    switch (capability) {
        case CAPABILITIES.ESCAPE:
            return {
                needed: context.threatCount >= 2 || context.health <= 8 || context.inWater || context.belowHazard,
                priority: context.health <= 4 ? 100 : context.threatCount >= 3 ? 90 : 70,
                reason: `escape needed: health=${context.health} threats=${context.threatCount} water=${context.inWater}`
            };
        case CAPABILITIES.BRIDGE:
            return {
                needed: context.gapSize >= 3 || context.verticalDiff > 8 || context.needCover,
                priority: context.verticalDiff > 20 ? 85 : context.gapSize >= 4 ? 75 : 60,
                reason: `bridge needed: gap=${context.gapSize} vertical=${context.verticalDiff}`
            };
        case CAPABILITIES.COMBAT_RETREAT:
            return {
                needed: context.health <= 8 || context.threatCount >= 4 || context.bombNear,
                priority: context.health <= 4 ? 95 : context.threatCount >= 4 ? 85 : 70,
                reason: `retreat needed: health=${context.health} threats=${context.threatCount} bomb=${context.bombNear}`
            };
        case CAPABILITIES.FIND_FOOD:
            return {
                needed: context.hunger <= 10 || context.foodCount < 3,
                priority: context.hunger <= 4 ? 90 : context.hunger <= 8 ? 75 : 50,
                reason: `food needed: hunger=${context.hunger} food=${context.foodCount}`
            };
        case CAPABILITIES.MINE_RESOURCE:
            return {
                needed: !!context.targetBlock,
                priority: context.targetBlock === "#logs" ? 100 : 70,
                reason: `mine needed: ${context.targetBlock}`
            };
        default:
            return { needed: false, priority: 0, reason: "unknown capability" };
    }
}

export function composeCapabilities(contexts) {
    // Mix of two situations should not fall through - compose multiple capabilities
    const needed = [];
    for (const cap of Object.values(CAPABILITIES)) {
        const evalResult = evaluateCapability(cap, contexts);
        if (evalResult.needed) {
            needed.push({ capability: cap, ...evalResult });
        }
    }
    needed.sort((a,b) => b.priority - a.priority);
    return needed;
}
