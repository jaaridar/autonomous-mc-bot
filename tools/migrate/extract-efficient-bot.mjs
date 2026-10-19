// One-shot migration extractor: Efficient-Bot -> Verdant core/data.
//
// Reads the Efficient-Bot sources (github.com/Efficient123/Efficient-Bot,
// MIT-less public repo; provenance recorded in docs/MIGRATION.md) and emits two
// engine-free data modules:
//
//   scripts/core/data/recipes-efficient.js   crafting + furnace recipes
//   scripts/core/data/acquire.js             where each item comes from
//
//   node tools/migrate/extract-efficient-bot.mjs "<path to Efficient-Bot>/Bot BP"
//
// Curation rules (the upstream data is tagged "not all of them bug tested", so
// this tool deliberately drops entries it cannot represent honestly):
//   * shaped/shapeless recipes are imported only when `crafting_table` is in
//     `blocks` (stonecutter-only variants are skipped: Verdant has no
//     stonecutter execution path and must not claim a recipe it cannot craft).
//   * `family:planks` / `family:logs` substitute the upstream pseudo-items
//     "minecraft:planks" / "minecraft:logs"; the mutton typo is repaired.
//   * recipes that need pseudo-items we cannot resolve (boat / chest_boat) and
//     outputs that are not concrete ids or that lose data (dye) are dropped.
//   * recipes whose output Verdant already knows are dropped (existing data
//     stays authoritative); duplicate signatures are collapsed.
//   * furnace-type entries become smelt inputs; cooking stations (smoker,
//     campfire, blast furnace) map onto the furnace the bot actually builds.
//   * acquisition methods "loot" (laying hens) and "brush" (armadillos) are
//     dropped: the bot has no brush and will not camp an egg-laying chicken.
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join } from "node:path";

const repo = fileURLToPath(new URL("../../", import.meta.url));
const out = join(repo, "scripts", "core", "data");
const srcRoot = process.argv[2];
if (!srcRoot) {
    console.error('usage: node tools/migrate/extract-efficient-bot.mjs "<path to Efficient-Bot>/Bot BP"');
    process.exit(2);
}

const imported = await import(pathToFileURL(join(srcRoot, "scripts", "lookupTables", "recipes_lookup.js")).href);
const recipesSrc = imported.recipes;
const { findAt } = await import(pathToFileURL(join(srcRoot, "scripts", "locations", "findAt.js")).href);
const ours = await import(pathToFileURL(join(repo, "scripts", "core", "data", "recipes.js")).href);

const OUR_OUTPUTS = new Set(ours.RECIPE_LIST.map((r) => r.out));
const OUR_SMELTS = new Set(Object.values(ours.SMELT_MAP));

// ---------------------------------------------------------------- recipes

const INGREDIENT_MAP = {
    "minecraft:planks": "family:planks",
    "minecraft:logs": "family:logs",
    "minecraft:muttonRaw": "minecraft:mutton",
};
// Pseudo-items with no honest resolution in our graph.
const PSEUDO = new Set(["minecraft:boat", "minecraft:chest_boat", "minecraft:wooden_slab", "minecraft:wool"]);
// Pseudo outputs: abstract ids the bot bag never contains.
const PSEUDO_OUTPUTS = new Set(["minecraft:planks", "minecraft:logs", "minecraft:dye", "minecraft:boat", "minecraft:chest_boat", "minecraft:wool", "minecraft:wooden_slab"]);
// Generic/legacy upstream ids with no concrete Bedrock item behind them.
const LEGACY_OUTPUTS = new Set(["minecraft:fence_gate", "minecraft:sign", "minecraft:wooden_door"]);
// Upstream typos repaired rather than dropped.
const OUTPUT_REPAIR = { "minecraft:darkoak_sign": "minecraft:dark_oak_sign" };

const stats = { recipes: 0, skippedNoTable: 0, skippedExisting: 0, skippedPseudo: 0, skippedBad: 0, dup: 0, smelts: 0 };

function normId(v) {
    if (typeof v !== "string" || !v) return null;
    if (v.startsWith("minecraft:")) return /^minecraft:[a-z0-9_]+$/.test(v) ? v : null;
    return /^[a-z0-9_]+$/.test(v) ? "minecraft:" + v : null;
}

const seen = new Set();
const perOutput = new Map();
const EFFICIENT_RECIPES = [];
for (const [, r] of Object.entries(recipesSrc)) {
    if (r.type === "minecraft:recipe_furnace") continue; // handled below
    const blocks = r.blocks ?? [];
    if (!blocks.includes("crafting_table")) { stats.skippedNoTable++; continue; }
    const outId = OUTPUT_REPAIR[normId(r.output?.[0]?.item)] ?? normId(r.output?.[0]?.item);
    if (!outId || PSEUDO_OUTPUTS.has(outId) || LEGACY_OUTPUTS.has(outId)) { stats.skippedBad++; continue; }
    if (OUR_OUTPUTS.has(outId)) { stats.skippedExisting++; continue; }
    const n = r.output?.[0]?.count ?? 1;
    if (!Number.isInteger(n) || n < 1 || n > 64) { stats.skippedBad++; continue; }
    const ing = [];
    let bad = false;
    for (const i of r.ingredients ?? []) {
        const mapped = OUTPUT_REPAIR[i.item] ?? INGREDIENT_MAP[i.item] ?? i.item;
        const clean = mapped.startsWith("family:") ? mapped : normId(mapped);
        if (!clean || PSEUDO.has(clean)) { bad = true; break; }
        if (!Number.isInteger(i.count) || i.count < 1 || i.count > 64) { bad = true; break; }
        ing.push([clean, i.count]);
    }
    if (bad || ing.length === 0) { stats.skippedPseudo++; continue; }
    ing.sort((a, b) => a[0].localeCompare(b[0]));
    const signature = outId + "|" + ing.map(([id, c]) => `${id}x${c}`).join("+");
    if (seen.has(signature)) { stats.dup++; continue; }
    const variants = perOutput.get(outId) ?? 0;
    if (variants >= 2) { stats.dup++; continue; }
    seen.add(signature);
    perOutput.set(outId, variants + 1);
    EFFICIENT_RECIPES.push({ out: outId, n, in: ing, table: true });
}

const EFFICIENT_SMELTS = {};
for (const [key, r] of Object.entries(recipesSrc)) {
    const stations = new Set((r.blocks ?? []).map((b) => String(b).replace("minecraft:", "")));
    const cooks = r.type === "minecraft:recipe_furnace"
        || ["furnace", "blast_furnace", "smoker", "campfire", "soul_campfire"].some((s) => stations.has(s));
    if (!cooks) continue;
    const raw = normId(r.ingredients?.[0]?.item);
    const cooked = normId(r.output?.[0]?.item);
    if (!raw || !cooked || raw === cooked || PSEUDO.has(raw) || PSEUDO_OUTPUTS.has(cooked)) continue;
    // Recycling a tool back into nuggets is real, but as a *plan* it would melt
    // the bot's own gear; ore smelts shadow the miner, which gets the drop.
    if (/_ore$/.test(raw) || /_(axe|pickaxe|shovel|hoe|sword|helmet|chestplate|leggings|boots|spear)$/.test(raw)) continue;
    if (EFFICIENT_SMELTS[raw] || OUR_SMELTS.has(cooked)) continue;
    if ((r.ingredients ?? []).length !== 1 || (r.output ?? []).length !== 1) continue;
    EFFICIENT_SMELTS[raw] = cooked;
    stats.smelts++;
}

// A craft route to something the furnace already produces (iron_ingot from
// iron_block, which needs iron_ingots) is a planning loop, not a recipe.
const smeltOutputs = new Set([...Object.values(ours.SMELT_MAP), ...Object.values(EFFICIENT_SMELTS)]);
const filteredRecipes = EFFICIENT_RECIPES.filter((r) => !smeltOutputs.has(r.out));
stats.skippedSmeltOut = EFFICIENT_RECIPES.length - filteredRecipes.length;

// ---------------------------------------------------------------- acquire

const ACQUIRE = {};
const ACQUIRE_KEY_REPAIR = { "minecraft:sugarcane": "minecraft:sugar_cane" };
for (const [item, route] of Object.entries(findAt)) {
    const method = route.method?.[0] ?? "mine";
    if (method === "loot" || method === "brush") continue; // no brush; no egg-camping
    const kind = method === "kill" ? "mob" : "block";
    const targets = (route.on ?? []).map((t) => (t === "minecraft:logs" ? "#logs" : normId(t))).filter(Boolean);
    if (targets.length === 0) continue;
    const tool = !route.tool || route.tool === "none" ? null : normId(route.tool);
    const key = ACQUIRE_KEY_REPAIR[item] ?? item;
    ACQUIRE[key] = {
        method: kind === "mob" ? "kill" : method === "strip" ? "strip" : "mine",
        kind,
        targets,
        biomes: (route.at ?? []).filter((b) => b !== "anywhere"),
        time: route.time?.[0] ?? null,
        y: route.y_level ?? null,
        tool,
    };
}

// ---------------------------------------------------------------- emit

const header = (title, body) => `// ${title}
//
// MIGRATED DATA - generated by tools/migrate/extract-efficient-bot.mjs from
// Efficient-Bot (github.com/Efficient123/Efficient-Bot "Bot BP", public repo,
// no license file; see docs/MIGRATION.md). Re-run the tool to regenerate;
// hand edits will be overwritten.
//
${body.split("\n").map((l) => "// " + l).join("\n")}
`;

mkdirSync(out, { recursive: true });
writeFileSync(join(out, "recipes-efficient.js"), header(
    "Efficient-Bot recipe expansion (harvested subset).",
    `Curation (see the extractor for the full rules): crafting-table recipes only;
stonecutter-only variants are not imported; "minecraft:planks"/"minecraft:logs"
map onto family:planks / family:logs; pseudo-item recipes, legacy generic ids and
dye are dropped; outputs Verdant already knows - or that the furnace produces -
are left to the existing data.`,
) +
`\n/** Expansion recipes in the core Recipe shape: { out, n, in: [[id, n]], table }. */\nexport const EFFICIENT_RECIPE_LIST = ${JSON.stringify(filteredRecipes, null, 4)};\n\n/** Extra raw -> smelted pairs (furnace-family stations). */\nexport const EFFICIENT_SMELTS = ${JSON.stringify(EFFICIENT_SMELTS, null, 4)};\n`);

writeFileSync(join(out, "acquire.js"), header(
    "Efficient-Bot acquisition table (where each item comes from).",
    `Ported from Efficient-Bot's locations/findAt.js. One route per item:
{ method: "mine"|"strip"|"kill", kind: "block"|"mob", targets: [block|mob ids],
  biomes: [biome ids], time, y: [lo, hi]|null, tool: itemId|null }.
"loot" (egg-laying) and "brush" routes are dropped: the bot has no brush and no
egg-camping. Blocks are filtered at runtime against the MINE table, so a route
here never claims an item the miner cannot actually reach.`,
) +
`\n/** Item -> how to obtain it from the world (not by crafting). */\nexport const ACQUIRE = ${JSON.stringify(ACQUIRE, null, 4)};\n`);

console.log(`recipes-efficient.js`);
console.log(`  imported recipes: ${filteredRecipes.length} (outputs: ${new Set(filteredRecipes.map((r) => r.out)).size})`);
console.log(`  skipped: no-table=${stats.skippedNoTable} existing=${stats.skippedExisting} pseudo/odd=${stats.skippedPseudo} bad=${stats.skippedBad} smelt-output=${stats.skippedSmeltOut} dup=${stats.dup}`);
console.log(`  smelts: ${stats.smelts}`);
console.log(`acquire.js`);
console.log(`  routes: ${Object.keys(ACQUIRE).length} (mob: ${Object.values(ACQUIRE).filter((r) => r.kind === "mob").length})`);
