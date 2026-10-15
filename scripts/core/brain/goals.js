const need = (item, n = 1) => ({ goal: `have:${item}:${n}` });
const known = (key) => (s) => !!s.known?.[key];

export const ITEMS = {
    log: { gather: [
        { id: "chop_known_tree", skill: "chop_tree", when: known("trees") },
        { id: "explore_for_trees", skill: "explore", args: { for: "trees" } },
    ] },
    planks: { craft: { out: 4, from: { log: 1 } } },
    stick: { craft: { out: 4, from: { planks: 2 } } },
    crafting_table: { craft: { out: 1, from: { planks: 4 } } },
    wooden_pickaxe: { craft: { out: 1, from: { planks: 3, stick: 2 }, table: true } },
    cobblestone: { gather: [
        { id: "mine_exposed_stone", skill: "mine_stone", needs: ["wooden_pickaxe"], when: known("stone") },
        { id: "dig_down_for_stone", skill: "dig_down_safe", needs: ["wooden_pickaxe"] },
        { id: "explore_for_stone", skill: "explore", args: { for: "stone" } },
    ] },
    stone_pickaxe: { craft: { out: 1, from: { cobblestone: 3, stick: 2 }, table: true } },
    stone_sword: { craft: { out: 1, from: { cobblestone: 2, stick: 1 }, table: true } },
    furnace: { craft: { out: 1, from: { cobblestone: 8 }, table: true } },
    coal: { gather: [
        { id: "mine_known_coal", skill: "mine_ore", args: { ore: "coal" }, needs: ["wooden_pickaxe"], when: known("coal") },
        { id: "explore_cave_for_coal", skill: "explore", args: { for: "cave" }, needs: ["wooden_pickaxe"] },
    ] },
    charcoal: { smelt: { from: "log", fuelFrom: "planks" } },
    carbon: { alias: ["coal", "charcoal"] },
    fuel: { alias: ["coal", "planks"] },
    torch: { craft: { out: 4, from: { carbon: 1, stick: 1 } } },
    raw_iron: { gather: [
        { id: "mine_known_iron", skill: "mine_ore", args: { ore: "iron" }, needs: ["stone_pickaxe"], when: known("iron") },
        { id: "branch_mine_for_iron", skill: "branch_mine", args: { ore: "iron" }, needs: ["stone_pickaxe"] },
        { id: "loot_structure_for_iron", skill: "loot_structure", when: (s) => (s.known?.structures ?? 0) > 0 },
        { id: "explore_cave_for_iron", skill: "explore", args: { for: "cave" }, needs: ["stone_pickaxe"] },
    ] },
    iron_ingot: { smelt: { from: "raw_iron" } },
    iron_pickaxe: { craft: { out: 1, from: { iron_ingot: 3, stick: 2 }, table: true } },
    iron_sword: { craft: { out: 1, from: { iron_ingot: 2, stick: 1 }, table: true } },
    bucket: { craft: { out: 1, from: { iron_ingot: 3 }, table: true } },
    water_bucket: { gather: [
        { id: "fill_at_known_water", skill: "fill_bucket", needs: ["bucket"], when: known("water") },
        { id: "explore_for_water", skill: "explore", args: { for: "water" }, needs: ["bucket"] },
    ] },
    diamond: { gather: [
        { id: "mine_known_diamond", skill: "mine_ore", args: { ore: "diamond" }, needs: ["iron_pickaxe"], when: known("diamond") },
        { id: "branch_mine_for_diamond", skill: "branch_mine", args: { ore: "diamond" }, needs: ["iron_pickaxe"] },
    ] },
    diamond_pickaxe: { craft: { out: 1, from: { diamond: 3, stick: 2 }, table: true } },
    raw_food: { gather: [
        { id: "hunt_known_animals", skill: "hunt", when: known("animals") },
        { id: "explore_for_animals", skill: "explore", args: { for: "animals" } },
        { id: "loot_structure_for_food", skill: "loot_structure", when: (s) => (s.known?.structures ?? 0) > 0 },
    ] },
    cooked_food: { smelt: { from: "raw_food", fuelFrom: "fuel" } },
    wool: { gather: [
        { id: "hunt_sheep", skill: "hunt", args: { animal: "sheep" }, when: known("animals") },
        { id: "explore_for_sheep", skill: "explore", args: { for: "animals" } },
    ] },
    bed: { craft: { out: 1, from: { wool: 3, planks: 3 }, table: true } },
};

const have = (s, item) => {
    const rule = ITEMS[item];
    if (rule?.alias) return rule.alias.reduce((a, x) => a + (s.inv?.[x] ?? 0), 0);
    return s.inv?.[item] ?? 0;
};

function buildItemMethods(item, n, rule, ctx) {
    const s = ctx.state, missing = Math.max(1, n - have(s, item));
    const methods = [];

    if (rule.alias) {
        for (const a of rule.alias) methods.push({ id: `via_${a}`, steps: () => [need(a, n)] });
        return methods;
    }
    if (rule.craft) {
        const c = rule.craft, batches = Math.ceil(missing / c.out);
        methods.push({
            id: "craft",
            steps: () => [
                ...Object.entries(c.from).map(([ing, k]) => need(ing, k * batches)),
                ...(c.table ? [{ goal: "table_ready" }] : []),
                { skill: "craft", args: { item, n: missing } },
            ],
        });
    }
    if (rule.smelt) {
        const sm = rule.smelt;
        methods.push({
            id: "smelt",
            steps: () => [
                need(sm.from, missing),
                need(sm.fuelFrom ?? "fuel", Math.max(1, Math.ceil(missing / 8))),
                { goal: "furnace_ready" },
                { skill: "smelt", args: { input: sm.from, n: missing } },
            ],
        });
    }
    for (const g of rule.gather ?? []) {
        methods.push({
            id: g.id,
            applicable: g.when ? (c) => g.when(c.state) : undefined,
            steps: () => [
                ...(g.needs ?? []).map((t) => need(t, 1)),
                { skill: g.skill, args: { ...(g.args ?? {}), item, n: missing } },
            ],
        });
    }
    return methods;
}

const cache = new Map();
function itemGoal(item, n) {
    const rule = ITEMS[item];
    if (!rule || !(n >= 1)) return undefined;
    const id = `have:${item}:${n}`;
    if (!cache.has(id)) cache.set(id, { id, satisfied: (s) => have(s, item) >= n, methods: (ctx) => buildItemMethods(item, n, rule, ctx) });
    return cache.get(id);
}

const NAMED = {
    table_ready: {
        id: "table_ready",
        satisfied: (s) => !!s.nearTable,
        methods: () => [
            { id: "place_carried", applicable: (c) => (c.state.inv?.crafting_table ?? 0) > 0, steps: () => [{ skill: "ensure_table" }] },
            { id: "craft_then_place", steps: () => [need("crafting_table", 1), { skill: "ensure_table" }] },
        ],
    },
    furnace_ready: {
        id: "furnace_ready",
        satisfied: (s) => !!s.nearFurnace,
        methods: () => [
            { id: "place_carried", applicable: (c) => (c.state.inv?.furnace ?? 0) > 0, steps: () => [{ skill: "ensure_furnace" }] },
            { id: "craft_then_place", steps: () => [need("furnace", 1), { skill: "ensure_furnace" }] },
        ],
    },
    shelter_tonight: {
        id: "shelter_tonight",
        satisfied: (s) => s.sheltered === true,
        methods: () => [
            { id: "sleep_in_bed", applicable: (c) => !!c.state.hasBed || (c.state.inv?.bed ?? 0) > 0, steps: () => [{ skill: "sleep" }] },
            { id: "seal_niche", steps: () => [{ skill: "seal_shelter" }] },
            { id: "lit_hold", steps: () => [need("torch", 4), { skill: "light_area" }] },
        ],
    },
    safe_food: { id: "safe_food", satisfied: (s) => have(s, "cooked_food") >= 4, methods: () => [{ id: "stock", steps: () => [need("cooked_food", 4)] }] },
};

export const PROGRESSION = [
    ["wooden_pickaxe", 1], ["stone_pickaxe", 1], ["stone_sword", 1], ["furnace", 1],
    ["cooked_food", 4], ["torch", 8],
    ["iron_pickaxe", 1], ["iron_sword", 1], ["bucket", 1],
    ["diamond_pickaxe", 1],
];

NAMED.overworld_progress = {
    id: "overworld_progress",
    satisfied: (s) => have(s, "diamond_pickaxe") >= 1,
    methods: () => [{ id: "ladder", steps: () => PROGRESSION.map(([item, n]) => need(item, n)) }],
};

export function lookupGoal(id) {
    if (NAMED[id]) return NAMED[id];
    const m = /^have:([a-z_]+):(\d+)$/.exec(id ?? "");
    return m ? itemGoal(m[1], parseInt(m[2], 10)) : undefined;
}
