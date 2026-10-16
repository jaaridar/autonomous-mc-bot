// Shared survival helpers.
//
// REOPENABLE is the safety rule the old bot learned the hard way: only seal a
// shelter with a block that the bot can definitely break again with a stone
// pickaxe. If it has nothing on that list, it leaves the wall open.

/** Blocks a shelter may be sealed with (diggable again with a stone pickaxe). */
export const REOPENABLE = /^(minecraft:(cobblestone|cobbled_deepslate|dirt|oak_planks|birch_planks|spruce_planks|jungle_planks|acacia_planks|dark_oak_planks|netherrack|sandstone|stone|deepslate|gravel|sand|andesite|diorite|granite|tuff))$/;

/** Foods that are worth keeping for an emergency (golden apples, cooked meat). */
export const EMERGENCY_FOOD = /^(minecraft:(golden_apple|enchanted_golden_apple|golden_carrot|cooked_beef|cooked_porkchop|cooked_chicken|cooked_mutton))$/;

/** Is this a block the bot can seal with, given what it carries? */
export function sealBlock(ctx) {
    const counts = ctx.bag.counts();
    for (const [id, amount] of Object.entries(counts)) {
        if (amount > 0 && REOPENABLE.test(id))
            return id;
    }
    return undefined;
}

/** Is the bot somewhere safe enough to stop and eat? */
export function safeToPause(ctx, radius = 8) {
    return ctx.threats(radius).length === 0;
}

/** Rough remaining daylight in ticks (0 when it is night). */
export function daylightLeft(ctx) {
    const t = ctx.time?.ofDay ?? 0;
    if (t >= 13000)
        return 0;
    return 13000 - t;
}
