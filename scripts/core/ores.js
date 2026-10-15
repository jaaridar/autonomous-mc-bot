/**
 * Where ores live in Bedrock 1.18+/1.21. `best` is the Y a shaft is aimed at:
 * the middle of the most productive band, not the extreme edge. Ranges come
 * from the Bedrock ore distributions; they are guidance for the miner, not a
 * promise that a specific chunk contains a vein.
 */
export const ORE_LEVELS = {
    "minecraft:coal": { best: 48, min: 0, max: 192 },
    "minecraft:raw_iron": { best: 16, min: -24, max: 56 },
    "minecraft:raw_copper": { best: 48, min: -16, max: 112 },
    "minecraft:raw_gold": { best: -16, min: -64, max: 32 },
    "minecraft:diamond": { best: -59, min: -64, max: 16 },
    "minecraft:redstone": { best: -59, min: -64, max: 15 },
    "minecraft:lapis_lazuli": { best: 0, min: -64, max: 64 },
};
/**
 * Drops worth digging a dedicated shaft for when they are not visible from the
 * surface. Coal and copper are deliberately absent: both are common in
 * hillsides and caves, so surface search is cheaper than a shaft.
 */
export const UNDERGROUND = new Set([
    "minecraft:raw_iron",
    "minecraft:raw_gold",
    "minecraft:diamond",
    "minecraft:redstone",
    "minecraft:lapis_lazuli",
]);
/** Every ore drop plus gems/gunpowder-ish valuables the bot should never waste. */
export const VALUABLE = new Set([
    "minecraft:coal",
    "minecraft:charcoal",
    "minecraft:raw_iron",
    "minecraft:raw_copper",
    "minecraft:raw_gold",
    "minecraft:diamond",
    "minecraft:emerald",
    "minecraft:redstone",
    "minecraft:lapis_lazuli",
    "minecraft:quartz",
    "minecraft:ancient_debris",
]);
export function oreLevel(item) {
    return ORE_LEVELS[item];
}
export function isUndergroundOre(item) {
    return UNDERGROUND.has(item);
}
/**
 * Bulk blocks a shaft is opened for directly: they sit everywhere under the
 * soil, so digging down where the bot stands always beats a surface search
 * (which is what used to send it off hunting cobblestone in caves).
 */
export const BULK = new Set([
    "minecraft:cobblestone",
    "minecraft:cobbled_deepslate",
    "minecraft:stone",
    "minecraft:deepslate",
]);
export function isBulk(item) {
    return BULK.has(item);
}
/** Shallow target for a bulk dig: just below the local soil layer. */
export function bulkLevel(y) {
    return { best: Math.max(y - 14, 8), min: -64, max: 320 };
}
/** Deepest useful depth for a drop, or undefined when it is not a known ore. */
export function targetDepth(item) {
    return ORE_LEVELS[item]?.best;
}
