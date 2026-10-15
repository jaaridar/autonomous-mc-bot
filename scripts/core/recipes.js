import { toolTier } from "./policy.js";
export const id = (s) => (s.includes(":") ? s : `minecraft:${s}`);
const recipe = (output, amount, ingredients, table = false) => ({
    output: id(output),
    amount,
    ingredients: Object.fromEntries(Object.entries(ingredients).map(([k, v]) => [
        k.startsWith("#") ? k : id(k),
        v,
    ])),
    table,
});
export const WOODS = [
    "oak",
    "birch",
    "spruce",
    "jungle",
    "acacia",
    "dark_oak",
    "mangrove",
    "cherry",
    "pale_oak",
];
export const WOOLS = [
    "white",
    "orange",
    "magenta",
    "light_blue",
    "yellow",
    "lime",
    "pink",
    "gray",
    "light_gray",
    "cyan",
    "purple",
    "blue",
    "brown",
    "green",
    "red",
    "black",
];
export function matches(type, wanted) {
    return wanted === "#carbon"
        ? [id("coal"), id("charcoal")].includes(type)
        : wanted === "#logs"
            ? WOODS.some((w) => type === id(w + "_log"))
            : wanted === "#planks"
                ? WOODS.some((w) => type === id(w + "_planks"))
                : wanted === "#wool"
                    ? WOOLS.some((w) => type === id(w + "_wool"))
                    : type === wanted;
}
export function amountOf(stock, wanted) {
    return Object.entries(stock).reduce((n, [type, count]) => n + (matches(type, wanted) ? count : 0), 0);
}
/**
 * Bulk materials are worth one longer trip rather than a fresh excursion per
 * recipe. A shortfall smaller than the batch is rounded up instead of sending
 * the bot back for two cobblestone.
 */
export const GATHER_BATCH = {
    "minecraft:cobblestone": 16,
    "minecraft:cobbled_deepslate": 16,
    "minecraft:coal": 8,
    "#logs": 8,
    "#planks": 16,
    "minecraft:stick": 16,
};
export function gatherBatch(target) {
    return GATHER_BATCH[target] ?? 0;
}
/** The bed colour the bot can actually make, if 3 wool of one colour are held. */
export function bedTarget(stock) {
    const c = WOOLS.find((w) => (stock[id(w + "_wool")] ?? 0) >= 3);
    return c ? id(c + "_bed") : undefined;
}
/**
 * Raw materials that must be mined, and the pickaxe tier each one needs.
 * Keeping this next to the batch table means "go get iron" never recurses into
 * a wooden pickaxe by accident, and asking for diamonds first builds iron gear.
 */
export const GATHER_TIER = {
    "minecraft:coal": 1,
    "minecraft:cobblestone": 1,
    "minecraft:cobbled_deepslate": 1,
    "minecraft:raw_copper": 2,
    "minecraft:raw_iron": 2,
    "minecraft:lapis_lazuli": 2,
    "minecraft:raw_gold": 3,
    "minecraft:redstone": 3,
    "minecraft:diamond": 3,
    "minecraft:emerald": 3,
};
export const RECIPES = [
    ...WOODS.map((w) => recipe(w + "_planks", 4, { [w + "_log"]: 1 })),
    recipe("stick", 4, { "#planks": 2 }),
    recipe("crafting_table", 1, { "#planks": 4 }),
    recipe("wooden_pickaxe", 1, { "#planks": 3, stick: 2 }, true),
    recipe("wooden_axe", 1, { "#planks": 3, stick: 2 }, true),
    recipe("wooden_sword", 1, { "#planks": 2, stick: 1 }, true),
    recipe("stone_pickaxe", 1, { cobblestone: 3, stick: 2 }, true),
    recipe("stone_axe", 1, { cobblestone: 3, stick: 2 }, true),
    recipe("stone_sword", 1, { cobblestone: 2, stick: 1 }, true),
    recipe("furnace", 1, { cobblestone: 8 }, true),
    recipe("torch", 4, { "#carbon": 1, stick: 1 }),
    recipe("oak_boat", 1, { "#planks": 5 }),
    // Beds: one colour per bed - vanilla wool colours do not mix, so each
    // colour gets its own recipe and the bot crafts from wool it truly holds.
    ...WOOLS.map((w) => recipe(w + "_bed", 1, { [w + "_wool"]: 3, "#planks": 3 }, true)),
    recipe("iron_pickaxe", 1, { iron_ingot: 3, stick: 2 }, true),
    recipe("iron_axe", 1, { iron_ingot: 3, stick: 2 }, true),
    recipe("iron_sword", 1, { iron_ingot: 2, stick: 1 }, true),
    recipe("diamond_pickaxe", 1, { diamond: 3, stick: 2 }, true),
    recipe("diamond_axe", 1, { diamond: 3, stick: 2 }, true),
    recipe("diamond_sword", 1, { diamond: 2, stick: 1 }, true),
    recipe("iron_chestplate", 1, { iron_ingot: 8 }, true),
    recipe("iron_leggings", 1, { iron_ingot: 7 }, true),
    recipe("iron_helmet", 1, { iron_ingot: 5 }, true),
    recipe("iron_boots", 1, { iron_ingot: 4 }, true),
];
export function counts(inv) {
    const out = {};
    for (let i = 0; i < inv.size; i++) {
        const s = inv.get(i);
        if (s)
            out[s.typeId] = (out[s.typeId] ?? 0) + s.amount;
    }
    return out;
}
/** Prepare all changes first, preserve item metadata; synchronous commit with rollback. */
export function craft(inv, r, batches, table) {
    if (!Number.isInteger(batches) || batches < 1 || batches > 64)
        throw Error("Batches must be 1..64.");
    if (r.table && !table)
        throw Error("A crafting table must be within reach.");
    const old = Array.from({ length: inv.size }, (_, i) => inv.get(i));
    const next = old.map((s) => (s ? inv.clone(s, s.amount) : undefined));
    for (const [type, amount] of Object.entries(r.ingredients)) {
        let need = amount * batches;
        for (let i = 0; i < next.length && need; i++) {
            const s = next[i];
            if (!s || !matches(s.typeId, type))
                continue;
            const take = Math.min(need, s.amount);
            need -= take;
            next[i] = s.amount === take ? undefined : inv.clone(s, s.amount - take);
        }
        if (need)
            throw Error(`Missing ${need} ${type}.`);
    }
    const proto = inv.create(r.output, 1);
    let remain = r.amount * batches;
    for (let i = 0; i < next.length && remain; i++) {
        const s = next[i];
        if (!s || !inv.stackable(s, proto))
            continue;
        const n = Math.min(remain, s.maxAmount - s.amount);
        if (n > 0) {
            next[i] = inv.clone(s, s.amount + n);
            remain -= n;
        }
    }
    for (let i = 0; i < next.length && remain; i++)
        if (!next[i]) {
            const n = Math.min(remain, proto.maxAmount);
            next[i] = inv.create(r.output, n);
            remain -= n;
        }
    if (remain)
        throw Error("Inventory full; nothing consumed.");
    try {
        for (let i = 0; i < next.length; i++)
            inv.set(i, next[i]);
    }
    catch (e) {
        let failed = false;
        for (let i = 0; i < old.length; i++)
            try {
                inv.set(i, old[i]);
            }
            catch {
                failed = true;
            }
        if (failed)
            throw Error("CRITICAL: inventory rollback failed. Stop and inspect inventory.");
        throw e;
    }
}
/** Reactive dependency decomposition: recomputed from observed stock, never assumed effects. */
export function nextStep(target, amount, stock, table, seen = new Set()) {
    if (amountOf(stock, target) >= amount)
        return { kind: "done" };
    if (seen.has(target))
        return { kind: "blocked", reason: "Recipe dependency cycle" };
    seen = new Set(seen).add(target);
    if (target === "#carbon") {
        const short = amount - amountOf(stock, target);
        return {
            kind: "gather",
            item: id("coal"),
            count: Math.max(short, gatherBatch(id("coal"))),
        };
    }
    if (target === "#planks") {
        const w = WOODS.find((w) => (stock[id(w + "_log")] ?? 0) > 0);
        if (w)
            return { kind: "craft", item: id(w + "_planks") };
        const short = Math.ceil((amount - amountOf(stock, target)) / 4);
        return {
            kind: "gather",
            item: "#logs",
            count: Math.max(short, gatherBatch("#logs")),
        };
    }
    const r = RECIPES.find((r) => r.output === target);
    if (!r) {
        const tier = GATHER_TIER[target];
        if (tier !== undefined) {
            const hasTool = Object.keys(stock).some((k) => k.endsWith("_pickaxe") &&
                stock[k] > 0 &&
                toolTier(k) >= tier);
            if (!hasTool)
                return nextStep(id(tier <= 1
                    ? "wooden_pickaxe"
                    : tier === 2
                        ? "stone_pickaxe"
                        : "iron_pickaxe"), 1, stock, table, seen);
            return {
                kind: "gather",
                item: target,
                count: Math.max(amount - amountOf(stock, target), gatherBatch(target)),
            };
        }
        if (target === "#logs") {
            return {
                kind: "gather",
                item: target,
                count: Math.max(amount - amountOf(stock, target), gatherBatch(target)),
            };
        }
        return {
            kind: "blocked",
            reason: `No acquisition skill for ${target}; supply it manually.`,
        };
    }
    if (r.table && !table) {
        if ((stock[id("crafting_table")] ?? 0) > 0)
            return { kind: "placeTable" };
        return nextStep(id("crafting_table"), 1, stock, table, seen);
    }
    for (const [type, n] of Object.entries(r.ingredients))
        if (amountOf(stock, type) < n)
            return nextStep(type, n, stock, table, seen);
    return { kind: "craft", item: target };
}
