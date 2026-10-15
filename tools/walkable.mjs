// Guards the WALKABLE regex in scripts/runtime/world.js against typos and
// substring traps (mushroom_stem, crimson_stem, dried_kelp_block...). The
// regex is read straight from the real file, so this guard cannot drift.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const worldFile = fileURLToPath(new URL("../scripts/runtime/world.js", import.meta.url));
const source = readFileSync(worldFile, "utf8");
const found = source.match(/WALKABLE\s*=\s*(\/.+\/[a-z]*);/);
if (!found) {
    console.error("walkable: WALKABLE regex not found in scripts/runtime/world.js");
    process.exit(2);
}
const WALKABLE = new Function(`return ${found[1]};`)();
let pass = 0, fail = 0;
const t = (id, want) => {
    const got = WALKABLE.test("minecraft:" + id);
    if (got === want) pass++;
    else { fail++; console.log(`FAIL: ${id} expected passable=${want} got ${got}`); }
};
// walk-through
for (const id of ["short_grass", "tallgrass", "tall_grass", "fern", "large_fern", "deadbush", "dead_bush",
    "yellow_flower", "red_flower", "dandelion", "poppy", "blue_orchid", "allium", "azure_bluet",
    "red_tulip", "orange_tulip", "white_tulip", "pink_tulip", "oxeye_daisy", "sunflower", "lilac",
    "rose_bush", "peony", "cornflower", "lily_of_the_valley", "wither_rose", "torchflower",
    "red_mushroom", "brown_mushroom", "oak_sapling", "birch_sapling", "bush",
    "crimson_roots", "warped_roots", "nether_sprouts", "wheat", "carrots", "potatoes", "beetroots",
    "melon_stem", "pumpkin_stem", "attached_melon_stem", "attached_pumpkin_stem", "sugar_cane",
    "vine", "cave_vines", "cave_vines_plant", "weeping_vines", "twisting_vines", "glow_lichen",
    "sculk_vein", "hanging_roots", "snow_layer", "pink_petals", "wildflowers", "leaf_litter",
    "white_carpet", "moss_carpet", "pale_moss_carpet", "lily_pad", "torch", "soul_torch",
    "redstone_torch", "unlit_redstone_torch", "redstone_wire", "tripwire", "oak_button",
    "stone_pressure_plate", "light_weighted_pressure_plate", "heavy_weighted_pressure_plate",
    "rail", "golden_rail", "detector_rail", "activator_rail"])
    t(id, true);
// must NOT be passable
for (const id of ["stone", "dirt", "grass_block", "snow", "snow_block", "powder_snow", "sweet_berry_bush",
    "cactus", "dried_kelp_block", "mushroom_stem", "crimson_stem", "warped_stem", "stripped_mangrove_log",
    "mangrove_roots", "muddy_mangrove_roots", "seagrass", "kelp", "kelp_plant", "water", "flowing_water",
    "lava", "oak_planks", "chest", "oak_slab", "oak_stairs", "oak_leaves",
    "fire", "soul_fire", "scaffolding", "ladder", "tripwire_hook", "oak_fence", "glass", "hay_block",
    "big_dripleaf_stem", "bamboo", "candle", "sea_pickle", "frog_spawn", "spore_blossom", "azalea",
    "flowering_azalea", "sweet_berries", "glow_berries", "cocoa", "chorus_flower", "pointed_dripstone"])
    t(id, false);
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
