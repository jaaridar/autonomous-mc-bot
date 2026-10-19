// Craft planning over the migrated recipe graph.
//
// Given what the bot carries, answer: (a) can I craft X, (b) what exactly do I
// do, in order, and (c) if not, what raw materials am I missing. This replaces
// hand-written per-item helpers: the AI Players Add-On shipped the recipe graph
// (core/data/recipes.js) and a recursive "first missing base ingredient" walk,
// which is exactly the shape an autonomous bot needs - mine the missing base,
// then craft the whole chain from the bottom up.
//
// Pure: no engine, no inventory access, no randomness. Same inputs, same plan.

import {
    INGREDIENT_TO_RESULT, RECIPES_BY_OUTPUT, SMELT_MAP, STONE_FAMILY, TAG_RESOLUTIONS, WOOD_FAMILIES,
} from "./data/recipes.js";
import { EFFICIENT_RECIPE_LIST, EFFICIENT_SMELTS } from "./data/recipes-efficient.js";

export const PLANK_FAMILIES = WOOD_FAMILIES.map((f) => f.planks);
export const LOG_VARIANTS = WOOD_FAMILIES.flatMap((f) => [f.log, f.strippedLog, f.wood, f.strippedWood]).filter(Boolean);

// Efficient-Bot port: 240 harvested recipes that widen the graph without
// touching the curated data. Indexed by output and consulted only when the
// migrated data has nothing for the item.
const EXPANSION_BY_OUTPUT = {};
for (const r of EFFICIENT_RECIPE_LIST)
    (EXPANSION_BY_OUTPUT[r.out] ??= []).push(r);

/** Recipe(s) producing an item, or undefined. Curation order: data, then expansion. */
export function recipesFor(itemId) {
    return RECIPES_BY_OUTPUT[itemId] ?? EXPANSION_BY_OUTPUT[itemId];
}

const TAG_KEYS = {
    "family:planks": "#planks",
    "family:logs": "#logs",
    "family:stone": "#cobble",
};

/**
 * Executor-shaped recipe from the expansion: core/recipes.js craft() consumes
 * `{ output, amount, ingredients: { "#planks": 4, ... } }`, so family ids are
 * mapped onto the existing wildcard keys.
 */
export function expansionRecipeFor(itemId) {
    const r = EXPANSION_BY_OUTPUT[itemId]?.[0];
    if (!r)
        return null;
    const ingredients = {};
    for (const [id, n] of r.in) {
        const key = TAG_KEYS[id] ?? id;
        ingredients[key] = (ingredients[key] ?? 0) + n;
    }
    return { output: itemId, amount: r.n, ingredients, table: r.table };
}

export function requiresTable(itemId) {
    const recipes = recipesFor(itemId);
    if (!recipes)
        return false;
    return recipes.some((r) => r.table);
}

/** The concrete item ids that can satisfy a family ingredient. */
export function resolveTag(tagId) {
    return TAG_RESOLUTIONS[tagId] ?? null;
}

/** Cheapest available concrete id for an ingredient, preferring what we hold. */
export function findIngredientId(ingredientId, counts) {
    const options = resolveTag(ingredientId);
    if (!options)
        return ingredientId;
    let best;
    for (const id of options) {
        const have = counts[id] ?? 0;
        if (have > 0)
            return id;
        if (!best || id < best)
            best = id;
    }
    return best ?? ingredientId;
}

/** Concrete result for a family recipe given the ingredient actually used. */
export function resolveResult(resultId, ingredientId) {
    return INGREDIENT_TO_RESULT[ingredientId] ?? resultId;
}

/** Raw material that smelts into `itemId`, or null. Data first, then expansion. */
export function smeltSource(itemId) {
    const candidates = [];
    for (const [raw, cooked] of Object.entries(SMELT_MAP))
        if (cooked === itemId)
            candidates.push(raw);
    if (candidates.length === 0)
        for (const [raw, cooked] of Object.entries(EFFICIENT_SMELTS))
            if (cooked === itemId)
                candidates.push(raw);
    if (candidates.length === 0)
        return null;
    // Multiple raw sources (sand and red_sand both tick to glass): prefer the
    // canonical short id over the exotic variant.
    candidates.sort((a, b) => a.length - b.length || a.localeCompare(b));
    return candidates[0];
}

/**
 * Can the bot craft `itemId` right now (with everything it already holds)?
 * `depth` guards against pathological recursion in a malformed graph.
 */
export function canCraft(itemId, counts, { depth = 12, table = true } = {}) {
    return planCraft(itemId, counts, { depth, table }).steps.length > 0;
}

/**
 * Build an ordered plan.
 *
 * Returns:
 *   steps:   [{ kind: "craft"|"smelt", out, amount, consumes: [[id, n]], table }]
 *            in execution order (ingredients first)
 *   missing: [{ id, amount }] base materials the bot must go and get
 *   leftovers: counts after executing the plan (what the plan does not consume)
 *
 * `greedy` (default) uses the counts it has, including intermediate crafts.
 */
export function planCraft(itemId, counts = {}, { amount = 1, depth = 12, table = true, allowSmelt = true } = {}) {
    const steps = [];
    const missing = new Map();
    const stock = {};
    for (const [id, n] of Object.entries(counts))
        stock[id] = n;

    const take = (id, n) => {
        const have = stock[id] ?? 0;
        const used = Math.min(have, n);
        stock[id] = have - used;
        return used;
    };
    const give = (id, n) => { stock[id] = (stock[id] ?? 0) + n; };

    function craftOne(targetId, want, level) {
        if (want <= 0)
            return true;
        if (level > depth) {
            missing.set(targetId, (missing.get(targetId) ?? 0) + want);
            return false;
        }
        const have = take(targetId, want);
        let needed = want - have;
        if (needed <= 0)
            return true;
        // Already planned earlier in this run: craft the remainder directly.
        const recipes = recipesFor(targetId) ?? [];
        const recipe = recipes.find((r) => table || !r.table) ?? recipes[0];
        if (!recipe) {
            const source = allowSmelt ? smeltSource(targetId) : null;
            if (source) {
                let ok = true;
                const batches = needed;
                for (let i = 0; i < batches; i++)
                    ok = craftOne(source, 1, level + 1) && ok;
                if (ok) {
                    steps.push({ kind: "smelt", out: targetId, amount: needed, consumes: [[source, needed]], table: false });
                    give(targetId, 0);
                    return true;
                }
                return false;
            }
            missing.set(targetId, (missing.get(targetId) ?? 0) + needed);
            return false;
        }
        // Craft in batches of the recipe output.
        const batches = Math.ceil(needed / recipe.n);
        let ok = true;
        const consumed = [];
        for (const [ingredientId, ingredientAmount] of recipe.in) {
            const concrete = findIngredientId(ingredientId, stock);
            const total = ingredientAmount * batches;
            ok = craftOne(concrete, total, level + 1) && ok;
            consumed.push([concrete, total]);
        }
        if (!ok)
            return false;
        const produced = recipe.n * batches;
        steps.push({
            kind: "craft",
            out: resolveResult(targetId, consumed[0]?.[0] ?? targetId),
            amount: produced,
            consumes: consumed,
            table: recipe.table,
        });
        give(targetId, produced - needed);
        return true;
    }

    const ok = craftOne(itemId, amount, 0);
    return {
        ok,
        steps,
        missing: [...missing.entries()].map(([id, n]) => ({ id, amount: n })).sort((a, b) => a.id.localeCompare(b.id)),
        leftovers: stock,
    };
}

/**
 * Walk the graph to the first base material that is genuinely missing - the
 * mining/gathering target for "make me an iron pickaxe" when the bot has nothing.
 */
export function firstMissingBase(itemId, counts = {}, { amount = 1, table = true, seen = new Set() } = {}) {
    const plan = planCraft(itemId, counts, { amount, table });
    if (plan.ok)
        return null;
    const first = plan.missing[0];
    return first ? { id: first.id, amount: first.amount } : null;
}

/**
 * Crafting table tiers: a table is needed for anything with 3x3 recipes. The
 * bot should plonk one down before working through a plan that says so.
 */
export function planNeedsTable(plan) {
    return plan.steps.some((s) => s.table);
}

/** The vanilla-stone alternatives a plan may substitute (cobble/deepslate/blackstone). */
export function stoneAlternatives() {
    return [...STONE_FAMILY];
}

/** Human-readable one-liner for the HUD and !bot status. */
export function describePlan(plan) {
    if (plan.ok && plan.steps.length === 0)
        return "already have it";
    if (!plan.ok && plan.steps.length === 0)
        return plan.missing.map((m) => `${m.amount}x ${m.id.replace("minecraft:", "")}`).join(", ") || "no recipe";
    const parts = plan.steps.map((s) => `${s.kind} ${s.amount}x ${s.out.replace("minecraft:", "")}`);
    if (!plan.ok)
        parts.push(`then mine ${plan.missing.map((m) => `${m.amount}x ${m.id.replace("minecraft:", "")}`).join(", ")}`);
    return parts.join(" -> ");
}
