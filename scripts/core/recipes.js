/**
 * scripts/core/recipes.js
 *
 * Merged from: core/recipes.js, core/survival.js, core/transfer.js
 */
import { toolTier } from "./world.js";

// ---------------------------------------------------------------- recipes.js

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
// 12 types: 9 woods + crimson/warped + bamboo - any log is valid for tools
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
    "crimson",
    "warped",
    "bamboo",
];
// For matching: crimson/warped use _stem, bamboo uses _block and bamboo itself
const LOG_SUFFIXES = ["_log", "_stem", "_wood", "_hyphae", "bamboo"];
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
export function isAnyLog(typeId) {
    if (!typeId) return false;
    const t = String(typeId);
    // Direct suffix check - ultra fast path
    if (t.endsWith("_log") || t.endsWith("_stem") || t.endsWith("_wood") || t.endsWith("_hyphae") || t.includes("bamboo")) return true;
    // Fallback to WOODS list
    return WOODS.some((w) => t === id(w + "_log") || t === id(w + "_stem") || t === id(w + "_wood") || t === id(w + "_hyphae") || t === id(w + "_planks") || t === id("stripped_" + w + "_log"));
}
export function matches(type, wanted) {
    if (wanted === "#carbon") return [id("coal"), id("charcoal")].includes(type);
    if (wanted === "#logs") return isAnyLog(type);
    if (wanted === "#planks") return WOODS.some((w) => type === id(w + "_planks"));
    if (wanted === "#wool") return WOOLS.some((w) => type === id(w + "_wool"));
    return type === wanted;
}
export function amountOf(stock, wanted) {
    // Fast path for #logs
    if (wanted === "#logs") {
        let n = 0;
        for (const [type, count] of Object.entries(stock)) if (isAnyLog(type)) n += count;
        return n;
    }
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
    if (isAnyLog(target)) return GATHER_BATCH["#logs"];
    return GATHER_BATCH[target] ?? 0;
}
/** The bed colour the bot can actually make, if 3 wool of one colour are held. */
export function bedTarget(stock) {
    const c = WOOLS.find((w) => (stock[id(w + "_wool")] ?? 0) >= 3);
    return c ? id(c + "_bed") : undefined;
}
/**
 * Raw materials that must be mined, and the pickaxe tier each one needs.
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
    ...WOODS.filter(w => !["crimson","warped","bamboo"].includes(w)).map((w) => recipe(w + "_planks", 4, { [w + "_log"]: 1 })),
    // Crimson/warped use stem -> planks
    recipe("crimson_planks", 4, { "crimson_stem": 1 }),
    recipe("warped_planks", 4, { "warped_stem": 1 }),
    recipe("bamboo_planks", 4, { "bamboo_block": 1 }),
    recipe("bamboo_block", 1, { "bamboo": 9 }),
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
    // Nether route essentials: bucket, ignition, shield, food
    recipe("bucket", 1, { iron_ingot: 3 }, true),
    recipe("flint_and_steel", 1, { iron_ingot: 1, flint: 1 }),
    recipe("shield", 1, { "#planks": 6, iron_ingot: 1 }, true),
    recipe("bread", 1, { wheat: 3 }, true),
];
export function counts(inv) {
    const out = {};
    for (let i = 0; i < inv.size; i++) {
        const s = inv.get(i);
        if (s) out[s.typeId] = (out[s.typeId] ?? 0) + s.amount;
    }
    return out;
}
export function craft(inv, r, batches, table) {
    if (!Number.isInteger(batches) || batches < 1 || batches > 64) throw Error("Batches must be 1..64.");
    if (r.table && !table) throw Error("A crafting table must be within reach.");
    const old = Array.from({ length: inv.size }, (_, i) => inv.get(i));
    const next = old.map((s) => (s ? inv.clone(s, s.amount) : undefined));
    for (const [type, amount] of Object.entries(r.ingredients)) {
        let need = amount * batches;
        for (let i = 0; i < next.length && need; i++) {
            const s = next[i];
            if (!s || !matches(s.typeId, type)) continue;
            const take = Math.min(need, s.amount);
            need -= take;
            next[i] = s.amount === take ? undefined : inv.clone(s, s.amount - take);
        }
        if (need) throw Error(`Missing ${need} ${type}.`);
    }
    const proto = inv.create(r.output, 1);
    let remain = r.amount * batches;
    for (let i = 0; i < next.length && remain; i++) {
        const s = next[i];
        if (!s || !inv.stackable(s, proto)) continue;
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
    if (remain) throw Error("Inventory full; nothing consumed.");
    try {
        for (let i = 0; i < next.length; i++) inv.set(i, next[i]);
    } catch (e) {
        let failed = false;
        for (let i = 0; i < old.length; i++) try { inv.set(i, old[i]); } catch { failed = true; }
        if (failed) throw Error("CRITICAL: inventory rollback failed. Stop and inspect inventory.");
        throw e;
    }
}
/** Reactive dependency decomposition: recomputed from observed stock, never assumed effects. */
export function nextStep(target, amount, stock, table, seen = new Set()) {
    if (amountOf(stock, target) >= amount) return { kind: "done" };
    if (seen.has(target)) return { kind: "blocked", reason: "Recipe dependency cycle" };
    seen = new Set(seen).add(target);
    // Any log type -> gather #logs (ultra efficient, never block on specific log)
    if (target === "#logs" || isAnyLog(target)) {
        return {
            kind: "gather",
            item: "#logs",
            count: Math.max(amount - amountOf(stock, "#logs"), gatherBatch("#logs")),
        };
    }
    if (target === "#carbon") {
        const short = amount - amountOf(stock, target);
        return { kind: "gather", item: id("coal"), count: Math.max(short, gatherBatch(id("coal"))) };
    }
    if (target === "#planks") {
        const w = WOODS.find((w) => (stock[id(w + "_log")] ?? 0) > 0 || (stock[id(w + "_stem")] ?? 0) > 0 || (stock[id(w + "_wood")] ?? 0) > 0 || (stock[id("bamboo")] ?? 0) > 0 || (stock[id("bamboo_block")] ?? 0) > 0);
        if (w) {
            // Find actual log type held
            const held = Object.keys(stock).find(k => isAnyLog(k) && (stock[k] ?? 0) > 0);
            if (held) {
                // Map held log to its planks
                const base = held.replace("minecraft:", "").replace("_log","").replace("_stem","").replace("_wood","").replace("_block","").replace("stripped_","").replace("bamboo","bamboo");
                const planksId = id((base === "bamboo" ? "bamboo_planks" : base + "_planks"));
                return { kind: "craft", item: planksId };
            }
            return { kind: "craft", item: id(w + "_planks") };
        }
        const short = Math.ceil((amount - amountOf(stock, target)) / 4);
        return { kind: "gather", item: "#logs", count: Math.max(short, gatherBatch("#logs")) };
    }
    const r = RECIPES.find((r) => r.output === target);
    if (!r) {
        const tier = GATHER_TIER[target];
        if (tier !== undefined) {
            const hasTool = Object.keys(stock).some((k) => k.endsWith("_pickaxe") && stock[k] > 0 && toolTier(k) >= tier);
            if (!hasTool) return nextStep(id(tier <= 1 ? "wooden_pickaxe" : tier === 2 ? "stone_pickaxe" : "iron_pickaxe"), 1, stock, table, seen);
            return { kind: "gather", item: target, count: Math.max(amount - amountOf(stock, target), gatherBatch(target)) };
        }
        // Fallback: if it looks like a log, gather #logs instead of blocking
        if (String(target).includes("_log") || String(target).includes("_stem") || String(target).includes("bamboo")) {
            return { kind: "gather", item: "#logs", count: Math.max(amount - amountOf(stock, "#logs"), gatherBatch("#logs")) };
        }
        return { kind: "blocked", reason: `No acquisition skill for ${target}; supply it manually.` };
    }
    if (r.table && !table) {
        if ((stock[id("crafting_table")] ?? 0) > 0) return { kind: "placeTable" };
        return nextStep(id("crafting_table"), 1, stock, table, seen);
    }
    for (const [type, n] of Object.entries(r.ingredients)) if (amountOf(stock, type) < n) return nextStep(type, n, stock, table, seen);
    return { kind: "craft", item: target };
}

// ---------------------------------------------------------------- survival.js

export const RAW_TO_COOKED = Object.fromEntries([
    ["beef", "cooked_beef"],
    ["porkchop", "cooked_porkchop"],
    ["chicken", "cooked_chicken"],
    ["mutton", "cooked_mutton"],
    ["rabbit", "cooked_rabbit"],
    ["cod", "cooked_cod"],
    ["salmon", "cooked_salmon"],
].map(([a, b]) => [id(a), id(b)]));
export const EMERGENCY_FOOD = new Set(["beef", "porkchop", "mutton", "rabbit", "cod", "salmon"].map(id));
export const PREY = new Set(["cow", "pig", "sheep", "chicken"].map(id));
export function fuelCount(type, inputs) {
    const seconds = type === id("coal") || type === id("charcoal")
        ? 80
        : type.endsWith("_planks")
            ? 15
            : 0;
    if (!seconds || !Number.isInteger(inputs) || inputs < 1 || inputs > 8)
        throw Error("Unsupported fuel or batch.");
    return Math.ceil((inputs * 10) / seconds);
}
export function smeltOutput(input) {
    return (RAW_TO_COOKED[input] ??
        (input === id("raw_iron")
            ? id("iron_ingot")
            : input.endsWith("_log")
                ? id("charcoal")
                : undefined));
}

// ---------------------------------------------------------------- transfer.js

/** Move existing items; no output is fabricated. Synchronous rollback, not crash-atomic. */
export function transfer(from, slot, to, target, amount) {
    if (from === to && slot === target)
        throw Error("Same transfer slot.");
    const a = from.get(slot), b = to.get(target);
    if (!a || !Number.isInteger(amount) || amount < 1 || amount > a.amount)
        throw Error("Invalid transfer amount.");
    if (b && (!to.stackable(a, b) || b.amount + amount > b.maxAmount))
        throw Error("Destination cannot accept stack.");
    if (!b && amount > a.maxAmount)
        throw Error("Destination capacity exceeded.");
    const nextA = a.amount === amount ? undefined : from.clone(a, a.amount - amount);
    const nextB = b ? to.clone(b, b.amount + amount) : to.clone(a, amount);
    try {
        from.set(slot, nextA);
        to.set(target, nextB);
    }
    catch (error) {
        let failed = false;
        try {
            from.set(slot, a);
        }
        catch {
            failed = true;
        }
        try {
            to.set(target, b);
        }
        catch {
            failed = true;
        }
        if (failed)
            throw Error("CRITICAL transfer rollback failure; stop and inspect both inventories.");
        throw error;
    }
}
export function destination(inv, item, amount) {
    for (let i = 0; i < inv.size; i++) {
        const s = inv.get(i);
        if (s && inv.stackable(s, item) && s.amount + amount <= s.maxAmount)
            return i;
    }
    for (let i = 0; i < inv.size; i++)
        if (!inv.get(i))
            return i;
    return -1;
}
