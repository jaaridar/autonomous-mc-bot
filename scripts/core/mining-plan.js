// Mining maths and dig planning - pure, engine-free.
//
// Two jobs:
//
//   1. Decide *whether* and *how long* a block takes to break, so the bot never
//      starts a dig it cannot finish or that costs a pickaxe it needs later.
//      Hardness comes from the migrated vanilla table (core/data/hardness.js);
//      tool requirements come from the harvest rules below, which mirror the
//      block tags the engine exposes (`is_pickaxe_item_destructible` and the
//      tier tags) so the same answer works offline and in-game.
//
//   2. Plan dig *shapes*: staircase, corridor, shaft, branch layout, vein
//      follow, escape and ascend. Every planner returns cells in a walkable
//      order (a skill can dig them front to back without trapping itself).
//
// Nothing here touches the world: callers pass a `read(x, y, z) => typeId`
// function, which makes every plan reproducible in a test.

import { add, key } from "./math.js";
import { HARDNESS, hardnessOf } from "./data/hardness.js";
import { PICKAXE_EXEMPT, RESTRICTED_BLOCKS, canonicalBlock } from "./data/block-rules.js";
import { clusterPoints } from "./spatial.js";

/** Tool material -> mining tier (what it can harvest) and speed multiplier. */
export const MATERIAL_TIER = { wooden: 1, golden: 1, stone: 2, copper: 2, iron: 3, diamond: 4, netherite: 5 };
export const MATERIAL_SPEED = { wooden: 2, golden: 12, stone: 4, copper: 4, iron: 6, diamond: 8, netherite: 9 };
export const TOOL_KINDS = ["pickaxe", "axe", "shovel", "hoe", "shears", "sword"];

/**
 * Harvest rules, first match wins. `tier` is the minimum tool material tier
 * that yields drops; a block with no rule drops with anything (or bare hands).
 */
export const HARVEST_RULES = [
    // --- pickaxe, tier 4: only diamond or better
    [/^(minecraft:(obsidian|crying_obsidian|ancient_debris|netherite_block|respawn_anchor|.*_shulker_box))$/, "pickaxe", 4],
    // --- pickaxe, tier 3: iron or better
    [/^(minecraft:(diamond_ore|deepslate_diamond_ore|gold_ore|deepslate_gold_ore|redstone_ore|lit_redstone_ore|deepslate_redstone_ore|lit_deepslate_redstone_ore|emerald_ore|deepslate_emerald_ore|gold_block|diamond_block|emerald_block|raw_gold_block|.*_ore))$/, "pickaxe", 3],
    // --- pickaxe, tier 2: stone or better
    [/^(minecraft:(iron_ore|deepslate_iron_ore|copper_ore|deepslate_copper_ore|lapis_ore|deepslate_lapis_ore|iron_block|copper_block|raw_iron_block|raw_copper_block|lightning_rod|.*_ores))$/, "pickaxe", 2],
    // --- pickaxe, tier 1: wooden or better
    [/^(minecraft:(stone|cobblestone|mossy_cobblestone|smooth_stone|deepslate|cobbled_deepslate|tuff|granite|diorite|andesite|calcite|dripstone_block|basalt|smooth_basalt|blackstone|netherrack|end_stone|sandstone|red_sandstone|.*_sandstone|.*_terracotta|.*_concrete|.*_bricks|prismarine|.*_prismarine|.*_stairs|.*_slab|.*_wall|.*_fence|.*_fence_gate|.*_door|.*_trapdoor|.*_pressure_plate|.*_button|.*_rail|.*_pipe|.*_purpur.*|.*quartz.*|.*purpur.*|.*_ore_.*))$/, "pickaxe", 1],
    // --- shovel
    [/^(minecraft:(.*_dirt|dirt|grass_block|grass_path|.*_path|coarse_dirt|rooted_dirt|podzol|mycelium|farmland|mud|.*_mud|sand|red_sand|gravel|clay|soul_sand|soul_soil|snow|snow_layer|.*_concrete_powder|.*_shovel_target))$/, "shovel", 1],
    // --- axe
    [/^(minecraft:(.*_log|.*_wood|.*_stem|.*_hyphae|.*_planks|bamboo|bamboo_block|.*_sapling_wood|.*_fence|.*_fence_gate|.*_door|.*_trapdoor|.*_sign|.*_hanging_sign|.*_bookshelf|.*_chest_boat|.*_boat|crafting_table|cartography_table|fletching_table|smithing_table|loom|lectern|composter|barrel|.*_slab|.*_stairs))$/, "axe", 1],
    // --- hoe: hay, wart blocks, leaves (fast)
    [/^(minecraft:(hay_block|dried_kelp_block|target|.*_wart_block|nether_wart_block|warped_wart_block|.*_leaves|.*_leaves_.*|sponge|wet_sponge|sculk.*))$/, "hoe", 1],
    // --- shears: wool, cobweb, vines, glow lichen
    [/^(minecraft:(.*_wool|cobweb|.*_vine|vine|glow_lichen|tall_grass|short_grass|fern|large_fern|dead_bush|.*_leaves))$/, "shears", 1],
    // --- sword: bamboo, melon, pumpkin, cobweb
    [/^(minecraft:(cobweb|bamboo|melon|pumpkin|carved_pumpkin|jack_o_lantern|.*_cactus))$/, "sword", 1],
];

/** Blocks that break instantly and drop nothing useful (flowers, torches, grass). */
export function isInstant(typeId) {
    return hardnessOf(typeId) === 0;
}

/** Parse a concrete item id into { kind, material, tier, speed }, or null. */
export function toolProfile(itemId) {
    if (typeof itemId !== "string")
        return null;
    const bare = itemId.replace("minecraft:", "");
    for (const kind of TOOL_KINDS) {
        if (!bare.endsWith(`_${kind}`) && !(kind === "shears" && bare === "shears"))
            continue;
        if (bare === "shears")
            return { kind: "shears", material: "iron", tier: 1, speed: 5 };
        const material = bare.slice(0, bare.length - kind.length - 1);
        const tier = MATERIAL_TIER[material];
        if (tier === undefined)
            return null;
        return { kind, material, tier, speed: MATERIAL_SPEED[material] ?? 1 };
    }
    return null;
}

/** The tool kind + minimum tier this block needs, or null when anything works. */
export function harvestRequirement(typeId) {
    const id = canonicalBlock(typeId);
    if (PICKAXE_EXEMPT.has(id))
        return null;
    for (const [re, tool, tier] of HARVEST_RULES)
        if (re.test(id))
            return { tool, tier };
    return null;
}

/** Does this tool (or bare hands when undefined) yield drops for this block? */
export function canHarvest(typeId, toolId) {
    const need = harvestRequirement(typeId);
    if (!need)
        return true;
    const tool = toolProfile(toolId);
    if (!tool || tool.kind !== need.tool)
        return false;
    return tool.tier >= need.tier;
}

/**
 * Ticks to break a block: vanilla's formula (hardness x 1.5 with the right tool,
 * x5 without) divided by the tool speed multiplier.
 */
export function breakTicks(typeId, toolId, { efficiency = 0, haste = 0 } = {}) {
    const hardness = hardnessOf(typeId);
    if (hardness < 0)
        return Infinity;
    if (hardness === 0)
        return 0;
    const tool = toolProfile(toolId);
    const need = harvestRequirement(typeId);
    const rightKind = tool && (!need || tool.kind === need.tool);
    const multiplier = canHarvest(typeId, toolId) ? 1.5 : 5;
    let speed = rightKind ? tool.speed : 1;
    if (efficiency > 0)
        speed += efficiency * efficiency + 1;
    if (haste > 0)
        speed *= 1 + 0.2 * haste;
    return (hardness * multiplier) / speed;
}

/** Can this block be broken at all, and is the bot allowed to? */
export function isMineable(typeId) {
    if (!typeId || typeId === "minecraft:air" || typeId === "minecraft:cave_air" || typeId === "minecraft:void_air")
        return false;
    if (/water|lava|bubble_column/.test(typeId))
        return false;
    if (hardnessOf(typeId) < 0)
        return false;
    return !RESTRICTED_BLOCKS.has(canonicalBlock(typeId));
}

/** True when mining the block would waste a tool the bot still needs. */
export function isWasteful(typeId, toolId, { reserve = null } = {}) {
    if (!reserve)
        return false;
    const tool = toolProfile(toolId);
    if (!tool)
        return false;
    return !!reserve[tool.kind] && tool.tier >= (reserve[tool.kind] ?? 0);
}

/**
 * Best tool for a block out of a counts map ({ "minecraft:iron_pickaxe": 1 }).
 * Pure: no inventory access, so a test can assert the choice.
 */
export function bestToolFor(typeId, counts = {}, { acceptAnyTool = true } = {}) {
    const need = harvestRequirement(typeId);
    const candidates = [];
    for (const [itemId, amount] of Object.entries(counts)) {
        if (!(amount > 0))
            continue;
        const tool = toolProfile(itemId);
        if (!tool)
            continue;
        if (need && tool.kind !== need.tool)
            continue;
        if (!need && !acceptAnyTool)
            continue;
        if (need && tool.tier < need.tier)
            continue;
        candidates.push({ itemId, tool });
    }
    if (candidates.length === 0)
        return undefined;
    candidates.sort((a, b) => (b.tool.speed - a.tool.speed) || (a.tool.tier - b.tool.tier) || a.itemId.localeCompare(b.itemId));
    return candidates[0].itemId;
}

// ------------------------------------------------------------------ dig shapes

/** Cells that must be open for a bot to stand in a 1x2 space at `p`. */
export function bodyCells(p) {
    return [{ ...p }, { ...p, y: p.y + 1 }];
}

/** Widen a path cell into the clearance a body needs. */
export function clearance(cells, height = 2) {
    const out = [];
    for (const cell of cells)
        for (let dy = 0; dy < height; dy++)
            out.push({ x: cell.x, y: cell.y + dy, z: cell.z, kind: cell.kind });
    return out;
}

/** Staircase down/up one block per step, keeping two blocks of head room. */
export function staircasePlan(start, dir, { steps = 8, descend = true } = {}) {
    const cells = [];
    let p = { ...start };
    for (let i = 1; i <= steps; i++) {
        const stepped = { x: p.x + dir.x, y: p.y + (descend ? -1 : 1), z: p.z + dir.z };
        for (const cell of bodyCells(stepped))
            cells.push({ ...cell, kind: "step", step: i });
        p = stepped;
    }
    return cells;
}

/** Straight corridor of `length` blocks, `height` tall. */
export function corridorPlan(start, dir, { length = 16, height = 2 } = {}) {
    const cells = [];
    let p = { ...start };
    for (let i = 1; i <= length; i++) {
        p = { x: p.x + dir.x, y: p.y, z: p.z + dir.z };
        for (const cell of bodyCells(p))
            cells.push({ ...cell, kind: "corridor" });
        for (let dy = 2; dy < height; dy++)
            cells.push({ x: p.x, y: p.y + dy, z: p.z, kind: "corridor" });
    }
    return cells;
}

/** Vertical shaft. `down` digs below the bot (needs a way back up). */
export function shaftPlan(start, { depth = 8, down = true } = {}) {
    const cells = [];
    for (let i = 1; i <= depth; i++) {
        const y = down ? start.y - i : start.y + i;
        cells.push({ x: start.x, y, z: start.z, kind: "shaft" });
    }
    return cells;
}

/**
 * Branch layout: a main corridor with perpendicular branches, all offsets
 * relative to `start` and ordered main-then-branch so a bot never digs itself
 * into a dead end it cannot leave.
 */
export function branchLayout(start, dir, { length = 48, spacing = 4, branchLength = 12, height = 2 } = {}) {
    const right = { x: -dir.z, y: 0, z: dir.x };
    const left = { x: dir.z, y: 0, z: -dir.x };
    const cells = [];
    for (let i = 0; i < length; i++) {
        const main = { x: start.x + dir.x * i, y: start.y, z: start.z + dir.z * i };
        for (const cell of bodyCells(main))
            cells.push({ ...cell, kind: "main" });
        if (i > 0 && i % spacing === 0) {
            for (const side of [left, right]) {
                for (let b = 1; b <= branchLength; b++) {
                    const p = { x: main.x + side.x * b, y: main.y, z: main.z + side.z * b };
                    for (const cell of bodyCells(p))
                        cells.push({ ...cell, kind: "branch", from: i });
                }
            }
        }
    }
    return cells;
}

/**
 * Cells to pillar up: the bot places a block under itself and repeats. Returns
 * the cells the bot must occupy, lowest first.
 */
export function ascendPlan(start, { height = 4 } = {}) {
    const cells = [];
    for (let i = 1; i <= height; i++)
        cells.push({ x: start.x, y: start.y + i, z: start.z, kind: "ascend" });
    return cells;
}

/**
 * Vein follow: BFS out from `origin` over cells whose id matches, using the
 * 26-neighbourhood an ore vein actually spreads through. Returns the dig order,
 * clustered so the bot finishes one pocket before walking to the next.
 */
export function veinPlan(read, origin, { match, radius = 1, maxSize = 128 } = {}) {
    const matches = match ?? (() => true);
    const found = [];
    const seen = new Set();
    const queue = [{ ...origin }];
    seen.add(key(origin));
    while (queue.length && found.length < maxSize) {
        const p = queue.shift();
        if (!matches(read(p.x, p.y, p.z), p))
            continue;
        found.push(p);
        for (let dx = -radius; dx <= radius; dx++)
            for (let dy = -radius; dy <= radius; dy++)
                for (let dz = -radius; dz <= radius; dz++) {
                    const n = { x: p.x + dx, y: p.y + dy, z: p.z + dz };
                    const k = key(n);
                    if (seen.has(k))
                        continue;
                    seen.add(k);
                    if (matches(read(n.x, n.y, n.z), n))
                        queue.push(n);
                }
    }
    return clusterOreOrder(found, origin);
}

/** Group cells by pocket (max 2 apart), biggest pocket first, then nearest. */
export function clusterOreOrder(cells, from) {
    if (cells.length <= 1)
        return [...cells];
    const clusters = clusterPoints(cells, 2);
    clusters.sort((a, b) => (b.length - a.length) || (cheapDistance(a[0], from) - cheapDistance(b[0], from)));
    const out = [];
    for (const cluster of clusters)
        out.push(...orderDigPath(cluster, from));
    return out;
}

/**
 * Walk a set of cells nearest-first, never jumping more than `step` away from
 * what has already been visited (a miner digs the way it walks).
 */
export function orderDigPath(cells, from, { step = 8 } = {}) {
    const remaining = cells.map((c) => ({ ...c }));
    const out = [];
    let current = { ...from };
    while (remaining.length) {
        let bestIndex = -1;
        let bestScore = Infinity;
        for (let i = 0; i < remaining.length; i++) {
            const d = cheapDistance(remaining[i], current);
            if (d < bestScore - 1e-9) {
                bestScore = d;
                bestIndex = i;
            }
            else if (Math.abs(d - bestScore) <= 1e-9 && bestIndex >= 0 && key(remaining[i]) < key(remaining[bestIndex])) {
                bestIndex = i;
            }
        }
        const chosen = remaining.splice(bestIndex, 1)[0];
        const gap = cheapDistance(chosen, current);
        out.push(gap > step ? { ...chosen, kind: `${chosen.kind ?? "dig"}:far` } : chosen);
        current = chosen;
    }
    return out;
}

function cheapDistance(a, b) {
    return Math.abs(a.x - b.x) + Math.abs((a.y ?? 0) - (b.y ?? 0)) + Math.abs(a.z - b.z);
}

/**
 * Hazards around a cell: the checks that stop the bot flooding a tunnel. Reads
 * only what the caller gives it, so it can be tested with a table of blocks.
 */
export function digHazards(read, cell) {
    const dangerous = [];
    for (let dx = -1; dx <= 1; dx++)
        for (let dy = -1; dy <= 1; dy++)
            for (let dz = -1; dz <= 1; dz++) {
                if (dx === 0 && dy === 0 && dz === 0)
                    continue;
                const id = read(cell.x + dx, cell.y + dy, cell.z + dz);
                if (/lava|water|bubble_column|powder_snow/.test(id))
                    dangerous.push({ at: { x: cell.x + dx, y: cell.y + dy, z: cell.z + dz }, id });
            }
    const below = read(cell.x, cell.y - 1, cell.z);
    const openBelow = below === "minecraft:air" || /lava|water/.test(below);
    return { dangerous, openBelow, safe: dangerous.length === 0 };
}

/** Total hardness left to dig a plan - used to budget a mining trip. */
export function planCost(cells, read, toolId) {
    let ticks = 0;
    let blocks = 0;
    for (const cell of cells) {
        const id = read(cell.x, cell.y, cell.z);
        if (!isMineable(id))
            continue;
        ticks += breakTicks(id, toolId);
        blocks++;
    }
    return { ticks, blocks };
}

/** Item/ore names people actually say -> the block ids a vein scan should look for. */
const ORE_ALIASES = {
    iron: "iron_ore", raw_iron: "iron_ore", iron_ingot: "iron_ore",
    copper: "copper_ore", raw_copper: "copper_ore", copper_ingot: "copper_ore",
    gold: "gold_ore", raw_gold: "gold_ore", gold_ingot: "gold_ore",
    coal: "coal_ore", diamond: "diamond_ore", emerald: "emerald_ore",
    redstone: "redstone_ore", lapis: "lapis_ore", lapis_lazuli: "lapis_ore",
    quartz: "quartz_ore", ancient_debris: "ancient_debris",
};

/** Block ids for an ore, including the deepslate variant and item-id aliases. */
export function oreVeinIds(oreId) {
    const bare = String(oreId ?? "").replace("minecraft:", "").replace("deepslate_", "");
    const ore = ORE_ALIASES[bare] ?? (bare.endsWith("_ore") ? bare : `${bare}_ore`);
    const ids = new Set([`minecraft:${ore}`, `minecraft:deepslate_${ore}`]);
    if (ore === "redstone_ore")
        ids.add("minecraft:lit_redstone_ore").add("minecraft:lit_deepslate_redstone_ore");
    return ids;
}

export { HARDNESS, hardnessOf, PICKAXE_EXEMPT, RESTRICTED_BLOCKS, add };
