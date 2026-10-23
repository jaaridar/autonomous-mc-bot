/**
 * Recipe book — generative crafting knowledge, not a hand-written list.
 *
 * The old table named ~60 items one by one, so anything it forgot (copper tools,
 * every wood variant of a door, a modded ingot, cooked food, stone bricks) came
 * back as "No acquisition skill". This module instead *derives* recipes from a
 * small amount of material data:
 *
 *   - tool shapes x material families -> every pickaxe/axe/shovel/sword/hoe,
 *   - armour shapes x material families -> every helmet/chestplate/leggings/boots,
 *   - wood families -> planks/sticks/doors/trapdoors/fences/gates/slabs/stairs,
 *   - wool colours -> every bed, banner and carpet,
 *   - ore -> ingot -> block chains, plus smelting/food tables.
 *
 * On top of that it exposes an *acquisition graph*: for any item, the ways the
 * bot could obtain it (craft, smelt, mine, kill, loot, farm). The planner walks
 * that graph, so "get a bucket" becomes iron ore -> smelt -> craft without a
 * per-item script, and an unknown item still resolves to whatever produces it
 * (a mob drop, a block drop, or an honest `blocked` with a reason).
 *
 * Pure: no engine imports. `#tag` ingredients match families exactly as the
 * crafting executor already understands them.
 */

const K = (s) => (s.includes(":") ? s : `minecraft:${s}`);
const bar = (s) => String(s ?? "").replace(/^minecraft:/, "");

// ---------------------------------------------------------------------------
// material families
// ---------------------------------------------------------------------------

/** Wood types and the stem/block suffix each one uses. */
export const WOODS = [
    { name: "oak", log: "oak_log" },
    { name: "birch", log: "birch_log" },
    { name: "spruce", log: "spruce_log" },
    { name: "jungle", log: "jungle_log" },
    { name: "acacia", log: "acacia_log" },
    { name: "dark_oak", log: "dark_oak_log" },
    { name: "mangrove", log: "mangrove_log" },
    { name: "cherry", log: "cherry_log" },
    { name: "pale_oak", log: "pale_oak_log" },
    { name: "crimson", log: "crimson_stem" },
    { name: "warped", log: "warped_stem" },
    { name: "bamboo", log: "bamboo_block" },
];

export const WOOLS = [
    "white", "orange", "magenta", "light_blue", "yellow", "lime", "pink", "gray",
    "light_gray", "cyan", "purple", "blue", "brown", "green", "red", "black",
];

/**
 * Tool/armour materials. `material` is what the crafting grid wants, `tier` is
 * the mining tier the item grants (0 hand, 1 wood, 2 stone, 3 iron, 4 diamond,
 * 5 netherite) and `durability` is only used for planning priorities.
 */
export const TOOL_MATERIALS = [
    { name: "wooden", material: "#planks", tier: 1, durability: 59 },
    { name: "stone", material: "cobblestone", tier: 2, durability: 131 },
    { name: "iron", material: "iron_ingot", tier: 3, durability: 250 },
    { name: "golden", material: "gold_ingot", tier: 1, durability: 32 },
    { name: "diamond", material: "diamond", tier: 4, durability: 1561 },
    { name: "netherite", material: "netherite_ingot", tier: 5, durability: 2031 },
];

/** Armour only exists for these material families (leather has no tools). */
export const ARMOR_MATERIALS = [
    { name: "leather", material: "leather", points: 1 },
    { name: "iron", material: "iron_ingot", points: 2 },
    { name: "golden", material: "gold_ingot", points: 1 },
    { name: "diamond", material: "diamond", points: 2 },
    { name: "netherite", material: "netherite_ingot", points: 2 },
];

/** name -> {material, count} for every tool shape (counts are vanilla-shaped). */
export const TOOL_SHAPES = {
    pickaxe: { material: 3, stick: 2 },
    axe: { material: 3, stick: 2 },
    shovel: { material: 1, stick: 2 },
    sword: { material: 2, stick: 1 },
    hoe: { material: 2, stick: 2 },
};

/** piece -> material count. */
export const ARMOR_PIECES = { helmet: 5, chestplate: 8, leggings: 7, boots: 4 };

// ---------------------------------------------------------------------------
// recipe records
// ---------------------------------------------------------------------------

const recipe = (output, amount, ingredients, table = false, extra = {}) => ({
    output: K(output),
    amount,
    ingredients: Object.fromEntries(Object.entries(ingredients).map(([k, v]) => [
        k.startsWith("#") ? k : K(k),
        v,
    ])),
    table,
    ...extra,
});

/** True when `type` satisfies the `wanted` ingredient (item id or #tag). */
export function matchesTag(type, wanted) {
    const t = K(type);
    if (!wanted) return false;
    if (!wanted.startsWith("#")) return t === K(wanted);
    switch (wanted) {
        case "#logs":
            return WOODS.some((w) => t === K(w.log)) || /(_log|_stem|_wood|_hyphae)$/.test(t);
        case "#planks":
            return WOODS.some((w) => t === K(`${w.name}_planks`)) || /_planks$/.test(t);
        case "#wool":
            return WOOLS.some((c) => t === K(`${c}_wool`)) || /_wool$/.test(t);
        case "#stone":
            return /^(minecraft:)?(cobblestone|cobbled_deepslate|stone|deepslate|andesite|diorite|granite|tuff|blackstone|netherrack)$/.test(t);
        case "#carbon":
            return t === K("coal") || t === K("charcoal");
        case "#coal":
            return t === K("coal");
        case "#sand":
            return /^(minecraft:)?(sand|red_sand)$/.test(t);
        case "#string":
            return t === K("string");
        case "#leather":
            return t === K("leather");
        case "#slime":
            return t === K("slime_ball");
        case "#any_planks_or_log":
            return matchesTag(t, "#planks") || matchesTag(t, "#logs");
        default:
            return t === K(wanted.slice(1));
    }
}

// ---------------------------------------------------------------------------
// generated recipe families
// ---------------------------------------------------------------------------

function woodRecipes() {
    const out = [];
    for (const w of WOODS) {
        const planks = `${w.name}_planks`;
        out.push(recipe(planks, 4, { [w.log]: 1 }));
        out.push(recipe(`${w.name}_slab`, 6, { [planks]: 3 }, true));
        out.push(recipe(`${w.name}_stairs`, 4, { [planks]: 6 }, true));
        out.push(recipe(`${w.name}_fence`, 3, { [planks]: 4, stick: 2 }, true));
        out.push(recipe(`${w.name}_fence_gate`, 1, { [planks]: 4, stick: 2 }, true));
        out.push(recipe(`${w.name}_door`, 3, { [planks]: 6 }, true));
        out.push(recipe(`${w.name}_trapdoor`, 2, { [planks]: 6 }, true));
        out.push(recipe(`${w.name}_sign`, 3, { [planks]: 6, stick: 1 }, true));
        out.push(recipe(`${w.name}_pressure_plate`, 1, { [planks]: 2 }, true));
        out.push(recipe(`${w.name}_button`, 1, { [planks]: 1 }));
    }
    return out;
}

function toolRecipes() {
    const out = [];
    for (const m of TOOL_MATERIALS) {
        for (const [tool, need] of Object.entries(TOOL_SHAPES)) {
            out.push(recipe(`${m.name}_${tool}`, 1, { [m.material]: need.material, stick: need.stick }, true));
        }
    }
    return out;
}

function armorRecipes() {
    const out = [];
    for (const m of ARMOR_MATERIALS) {
        for (const [piece, n] of Object.entries(ARMOR_PIECES)) out.push(recipe(`${m.name}_${piece}`, 1, { [m.material]: n }, true));
    }
    return out;
}

function woolRecipes() {
    const out = [];
    for (const c of WOOLS) {
        out.push(recipe(`${c}_bed`, 1, { [`${c}_wool`]: 3, "#planks": 3 }, true));
        out.push(recipe(`${c}_carpet`, 3, { [`${c}_wool`]: 2 }, true));
        out.push(recipe(`${c}_banner`, 1, { [`${c}_wool`]: 6, stick: 1 }, true));
    }
    out.push(recipe("white_wool", 1, { string: 4 }));
    return out;
}

function blockRecipes() {
    return [
        recipe("stick", 4, { "#planks": 2 }),
        recipe("crafting_table", 1, { "#planks": 4 }),
        recipe("chest", 1, { "#planks": 8 }, true),
        recipe("furnace", 1, { cobblestone: 8 }, true),
        recipe("blast_furnace", 1, { iron_ingot: 5, furnace: 1, "#stone": 3 }, true),
        recipe("smoker", 1, { furnace: 1, "#logs": 4 }, true),
        recipe("stonecutter", 1, { iron_ingot: 1, "#stone": 3 }, true),
        recipe("barrel", 1, { "#planks": 6, stick: 2 }, true),
        recipe("torch", 4, { "#carbon": 1, stick: 1 }),
        recipe("ladder", 3, { stick: 7 }, true),
        recipe("scaffolding", 6, { bamboo: 6, string: 1 }),
        recipe("bucket", 1, { iron_ingot: 3 }, true),
        recipe("shears", 1, { iron_ingot: 2 }),
        recipe("flint_and_steel", 1, { iron_ingot: 1, flint: 1 }),
        recipe("shield", 1, { "#planks": 6, iron_ingot: 1 }, true),
        recipe("bow", 1, { stick: 3, string: 3 }, true),
        recipe("crossbow", 1, { stick: 2, string: 3, iron_ingot: 1 }, true),
        recipe("arrow", 4, { flint: 1, stick: 1, feather: 1 }),
        recipe("fishing_rod", 1, { stick: 3, string: 2 }),
        recipe("oak_boat", 1, { "#planks": 5 }),
        recipe("minecart", 1, { iron_ingot: 5 }),
        recipe("rail", 16, { iron_ingot: 6, stick: 1 }, true),
        recipe("paper", 3, { sugar_cane: 3 }, true),
        recipe("book", 1, { paper: 3, leather: 1 }),
        recipe("glass_bottle", 3, { glass: 3 }, true),
        recipe("brewing_stand", 1, { blaze_rod: 1, "#stone": 3 }, true),
        recipe("cauldron", 1, { iron_ingot: 7 }, true),
        recipe("anvil", 1, { iron_block: 3, iron_ingot: 4 }, true),
        recipe("iron_block", 1, { iron_ingot: 9 }, true),
        recipe("gold_block", 1, { gold_ingot: 9 }, true),
        recipe("diamond_block", 1, { diamond: 9 }, true),
        recipe("coal_block", 1, { coal: 9 }, true),
        recipe("netherite_ingot", 1, { netherite_scrap: 4, gold_ingot: 4 }, true),
        recipe("bread", 1, { wheat: 3 }, true),
        recipe("cookie", 8, { wheat: 2, cocoa_beans: 1 }, true),
        recipe("hay_block", 1, { wheat: 9 }, true),
        recipe("mushroom_stew", 1, { red_mushroom: 1, brown_mushroom: 1, bowl: 1 }),
        recipe("bowl", 4, { "#planks": 3 }, true),
        recipe("campfire", 1, { stick: 3, "#logs": 3, "#coal": 1 }, true),
        recipe("target", 1, { redstone: 4, hay_block: 1 }, true),
        recipe("snow_block", 1, { snowball: 4 }),
        recipe("clay", 1, { clay_ball: 4 }),
        recipe("bricks", 1, { brick: 4 }, true),
    ];
}

/** Recipes that were already curated, kept so nothing regresses. */
function legacyRecipes() {
    return [
        recipe("bamboo_planks", 4, { bamboo_block: 1 }),
        recipe("bamboo_block", 1, { bamboo: 9 }),
        recipe("oak_boat", 1, { "#planks": 5 }),
        recipe("flint_and_steel", 1, { iron_ingot: 1, flint: 1 }),
    ];
}

let cachedBook;

/** Every recipe the bot knows, keyed by output. Static recipes win on conflict. */
export function recipeBook() {
    if (cachedBook) return cachedBook;
    const map = new Map();
    const add = (r) => {
        if (!r?.output) return;
        if (!map.has(r.output)) map.set(r.output, r);
    };
    for (const r of blockRecipes()) add(r);
    for (const r of woodRecipes()) add(r);
    for (const r of toolRecipes()) add(r);
    for (const r of armorRecipes()) add(r);
    for (const r of woolRecipes()) add(r);
    for (const r of legacyRecipes()) add(r);
    cachedBook = map;
    return map;
}

export function findRecipe(item) {
    if (!item) return undefined;
    return recipeBook().get(K(item));
}

export function allRecipes() {
    return [...recipeBook().values()];
}

/** Does the book know how to craft this item? */
export function craftable(item) {
    return recipeBook().has(K(item));
}

// ---------------------------------------------------------------------------
// smelting / cooking
// ---------------------------------------------------------------------------

const smelt = (input, output, amount = 1, extra = {}) => ({ input: K(input), output: K(output), amount, ...extra });

/** Furnace recipes, generated for the ore -> ingot and block -> material chains. */
export const SMELT = (() => {
    const out = [];
    const METALS = [
        ["raw_iron", "iron_ingot"], ["iron_ore", "iron_ingot"], ["deepslate_iron_ore", "iron_ingot"],
        ["raw_gold", "gold_ingot"], ["gold_ore", "gold_ingot"], ["deepslate_gold_ore", "gold_ingot"],
        ["raw_copper", "copper_ingot"], ["copper_ore", "copper_ingot"], ["deepslate_copper_ore", "copper_ingot"],
        ["ancient_debris", "netherite_scrap"],
    ];
    for (const [a, b] of METALS) out.push(smelt(a, b));
    out.push(smelt("sand", "glass"), smelt("red_sand", "glass"));
    out.push(smelt("cobblestone", "stone"), smelt("cobbled_deepslate", "deepslate"));
    out.push(smelt("clay_ball", "brick_item"), smelt("clay", "terracotta"));
    out.push(smelt("cactus", "green_dye"));
    out.push(smelt("kelp", "dried_kelp"));
    out.push(smelt("oak_log", "charcoal"), smelt("birch_log", "charcoal"), smelt("spruce_log", "charcoal"));
    for (const [raw, cooked] of [
        ["beef", "cooked_beef"], ["porkchop", "cooked_porkchop"], ["chicken", "cooked_chicken"],
        ["mutton", "cooked_mutton"], ["rabbit", "cooked_rabbit"], ["cod", "cooked_cod"],
        ["salmon", "cooked_salmon"], ["potato", "baked_potato"],
    ]) out.push(smelt(raw, cooked));
    out.push(smelt("nether_quartz_ore", "quartz"), smelt("nether_gold_ore", "gold_ingot"));
    out.push(smelt("iron_ingot", "iron_ingot", 1, { note: "blast furnace is faster" }));
    return out;
})();

const SMELT_BY_OUTPUT = new Map();
for (const s of SMELT) {
    const list = SMELT_BY_OUTPUT.get(s.output) ?? [];
    list.push(s);
    SMELT_BY_OUTPUT.set(s.output, list);
}

export function smeltSources(item) {
    return SMELT_BY_OUTPUT.get(K(item)) ?? [];
}

// ---------------------------------------------------------------------------
// acquisition graph
// ---------------------------------------------------------------------------

/** Food that restores hunger without cooking. */
export const FOOD = new Set([
    "apple", "bread", "carrot", "golden_apple", "golden_carrot", "melon_slice", "sweet_berries",
    "glow_berries", "baked_potato", "cooked_beef", "cooked_porkchop", "cooked_chicken",
    "cooked_mutton", "cooked_rabbit", "cooked_cod", "cooked_salmon", "cookie", "dried_kelp",
    "mushroom_stew", "beetroot_soup", "rabbit_stew", "suspicious_stew", "tropical_fish", "cod", "salmon",
].map(K));

/**
 * Where an item comes from, in preference order. Every entry is a real action
 * the runtime can perform; nothing here invents items.
 */
export function sources(item, ctx = {}) {
    const t = K(item);
    const out = [];
    const r = findRecipe(t);
    if (r) out.push({ kind: "craft", recipe: r, why: "crafting recipe" });
    for (const s of smeltSources(t)) out.push({ kind: "smelt", input: s.input, output: s.output, amount: s.amount, why: "furnace recipe" });
    if (ctx.blockDrops instanceof Map || ctx.blockDrops instanceof Set) {
        if (ctx.blockDrops instanceof Map) for (const [block, drop] of ctx.blockDrops) if (K(drop) === t) out.push({ kind: "mine", block: K(block), why: "block drop" });
        else if (ctx.blockDrops.has(t)) out.push({ kind: "mine", block: t, why: "block drop" });
    }
    for (const d of ctx.mobDrops?.[t] ?? []) out.push({ kind: "kill", mob: d.mob, count: d.count, why: "mob drop" });
    if (ctx.planted?.has?.(t)) out.push({ kind: "farm", item: t, why: "farmable" });
    if (ctx.loot?.has?.(t)) out.push({ kind: "loot", item: t, why: "chest loot" });
    return out;
}

/**
 * Full acquisition plan for `item` x `amount` from `stock`.
 *
 * The planner walks the recipe graph against a *virtual* inventory: every
 * planned gather, craft and smelt is applied to the scratch copy, so a material
 * needed by two sub-recipes is only gathered once and a crafting table is only
 * built once. Cycle-safe and depth-capped.
 *
 * Steps are actions the runtime can perform:
 *   {kind:"gather", item, count}      mine / farm / kill the raw item
 *   {kind:"craft", item, batches}     craft one or more batches
 *   {kind:"smelt", input, output, batches}
 *   {kind:"placeTable"} / {kind:"placeFurnace"}
 *   {kind:"kill", item, mob, count}   hunt a specific mob for a drop
 *   {kind:"loot", item, count}        find it in a chest
 */
export function plan(item, amount, stock = {}, ctx = {}) {
    const inv = { ...stock };
    const steps = [];
    const state = {
        ctx,
        inv,
        steps,
        tables: ctx.table ? 1 : countOf(inv, "minecraft:crafting_table"),
        furnaces: ctx.furnace ? 1 : countOf(inv, "minecraft:furnace"),
        blocked: undefined,
    };
    const ok = resolve(K(item), Math.max(0, amount), state, 0, new Set());
    const compact = compactSteps(steps);
    if (!ok) return { steps: compact, blocked: true, reason: state.blocked ?? `cannot obtain ${bar(item)}` };
    return { steps: compact, blocked: false, reason: `plan for ${bar(item)}` };
}

function resolve(target, need, state, depth, stack) {
    if (need <= 0) return true;
    const have = countOf(state.inv, target);
    if (have >= need) {
        take(state.inv, target, need);
        return true;
    }
    const missing = need - have;
    if (have > 0) take(state.inv, target, have);
    if (depth > 8) {
        state.blocked = `dependency chain too deep at ${bar(target)}`;
        return false;
    }
    if (stack.has(target)) {
        state.blocked = `recipe cycle at ${bar(target)}`;
        return false;
    }
    const inner = new Set(stack).add(target);

    const r = findRecipe(target);
    if (r) {
        const batches = Math.max(1, Math.ceil(missing / r.amount));
        if (r.table && !state.tables) {
            if (!resolve("minecraft:crafting_table", 1, state, depth + 1, inner)) return false;
            state.steps.push({ kind: "placeTable", why: "crafting table needed" });
            state.tables = 1;
        }
        for (const [ingredient, n] of Object.entries(r.ingredients)) {
            if (!n) continue;
            if (!resolveIngredient(ingredient, n * batches, state, depth, inner)) return false;
        }
        add(state.inv, target, r.amount * batches);
        state.steps.push({ kind: "craft", item: target, batches, why: "crafting recipe" });
        take(state.inv, target, missing);
        return true;
    }

    const smelts = smeltSources(target);
    if (smelts.length) {
        const s = smelts[0];
        const batches = Math.max(1, Math.ceil(missing / s.amount));
        if (!state.furnaces) {
            if (!resolve("minecraft:furnace", 1, state, depth + 1, inner)) return false;
            state.steps.push({ kind: "placeFurnace", why: "furnace needed to smelt" });
            state.furnaces = 1;
        }
        if (!resolve(s.input, batches, state, depth + 1, inner)) return false;
        add(state.inv, target, s.amount * batches);
        state.steps.push({ kind: "smelt", input: s.input, output: target, batches, why: "furnace recipe" });
        take(state.inv, target, missing);
        return true;
    }

    // Raw material: gather it, or hunt/loot it when we know the drop.
    const drop = state.ctx.mobDrops?.[target]?.[0];
    if (drop) {
        const count = Math.max(missing, drop.count ?? 1);
        state.steps.push({ kind: "kill", item: target, mob: drop.mob, count, why: "mob drop" });
        add(state.inv, target, count);
        take(state.inv, target, missing);
        return true;
    }
    if (state.ctx.lootOnly?.has?.(target)) {
        state.steps.push({ kind: "loot", item: target, count: missing, why: "chest loot" });
        add(state.inv, target, missing);
        take(state.inv, target, missing);
        return true;
    }
    state.steps.push({
        kind: "gather",
        item: target,
        count: missing,
        block: state.ctx.blockDrops?.get?.(target),
        why: "raw material",
    });
    add(state.inv, target, missing);
    take(state.inv, target, missing);
    return true;
}

function resolveIngredient(ingredient, count, state, depth, stack) {
    if (!ingredient.startsWith("#")) return resolve(K(ingredient), count, state, depth + 1, stack);
    const already = available(state.inv, ingredient);
    if (already >= count) {
        takeTag(state.inv, ingredient, count);
        return true;
    }
    if (already > 0) {
        takeTag(state.inv, ingredient, already);
        count -= already;
    }
    // Prefer a member already in the inventory, then the first that resolves.
    const members = tagMembers(ingredient);
    const held = members.find((m) => countOf(state.inv, m) > 0);
    const ordered = held ? [held, ...members.filter((m) => m !== held)] : members;
    for (const member of ordered) {
        const snapshot = { ...state.inv };
        const stepsAt = state.steps.length;
        if (resolve(member, count, state, depth + 1, stack)) {
            take(state.inv, member, count);
            return true;
        }
        // Roll the failed attempt back and try the next member.
        state.inv = snapshot;
        state.steps.length = stepsAt;
        state.blocked = undefined;
    }
    state.blocked = `no ${ingredient} available`;
    return false;
}

function add(inv, item, n) {
    inv[item] = (inv[item] ?? 0) + n;
}
function take(inv, item, n) {
    if (!n) return;
    if (item.startsWith("#")) return takeTag(inv, item, n);
    inv[item] = Math.max(0, (inv[item] ?? 0) - n);
}
function takeTag(inv, tag, n) {
    for (const [type, amount] of Object.entries(inv)) {
        if (n <= 0) break;
        if (!matchesTag(type, tag) || amount <= 0) continue;
        const taken = Math.min(amount, n);
        inv[type] = amount - taken;
        n -= taken;
    }
}

/** Concrete items for a tag (bounded, deterministic order). */
export function tagMembers(tag) {
    switch (tag) {
        case "#planks": return WOODS.map((w) => K(`${w.name}_planks`));
        case "#logs": return WOODS.map((w) => K(w.log));
        case "#wool": return WOOLS.map((c) => K(`${c}_wool`));
        case "#stone": return [K("cobblestone"), K("cobbled_deepslate"), K("stone")];
        case "#carbon": return [K("coal"), K("charcoal")];
        case "#sand": return [K("sand"), K("red_sand")];
        case "#leather": return [K("leather")];
        case "#string": return [K("string")];
        default: return [];
    }
}

/** Convert "kill 4 zombies" duplicates into one step and drop zero-count gathers. */
export function compactSteps(steps) {
    const out = [];
    const index = new Map();
    for (const step of steps) {
        const key = `${step.kind}|${step.item ?? step.output ?? step.input ?? step.why}`;
        const at = index.get(key);
        if (at === undefined || step.kind === "placeTable" || step.kind === "placeFurnace") {
            if (at !== undefined) continue;
            index.set(key, out.length);
            out.push({ ...step });
            continue;
        }
        const prev = out[at];
        if (step.count) prev.count = (prev.count ?? 0) + step.count;
        if (step.batches) prev.batches = (prev.batches ?? 0) + step.batches;
    }
    return out.map((s) => {
        if (s.count !== undefined) s.count = Math.max(1, s.count);
        if (s.batches !== undefined) s.batches = Math.max(1, s.batches);
        return s;
    });
}

export function countOf(stock, item) {
    if (item.startsWith("#")) return available(stock, item);
    return stock[K(item)] ?? 0;
}

/** Count of stock matching an id or a tag. */
export function available(stock, wanted) {
    if (!wanted.startsWith("#")) return stock[K(wanted)] ?? 0;
    let n = 0;
    for (const [type, amount] of Object.entries(stock)) if (matchesTag(type, wanted)) n += amount;
    return n;
}

/** Summary for `!bot recipe <item>` and diagnostics. */
export function explain(item, stock = {}, ctx = {}) {
    const target = K(item);
    const r = findRecipe(target);
    const p = plan(target, 1, stock, ctx);
    return {
        item: target,
        craftable: !!r,
        recipe: r ? { amount: r.amount, ingredients: r.ingredients, table: r.table } : undefined,
        smelt: smeltSources(target).map((s) => s.input),
        steps: p.steps,
        blocked: p.blocked,
        reason: p.reason,
    };
}

export function bookSize() {
    return recipeBook().size;
}
