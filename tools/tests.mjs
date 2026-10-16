// Pack unit tests, one file instead of four (each group keeps its own body and
// counts; a group that fails fails the whole file):
//
//   * persistent-memory schema (core/memory.js): garbage input, dedupe, caps, prefs
//   * survival capabilities + goal decomposition (core/survival.js, core/progression.js)
//   * WALKABLE regex guard (runtime/world.js): typo and substring traps
//   * drop-flush tests (runtime/looting.js Drops.flush), against the load copy
//     that has the @minecraft/* stubs available
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { composeCapabilities, evaluateCapability, CAPABILITIES } from "../scripts/core/survival.js";
import { decomposeMission, analyzeRequirements, isAnyLog } from "../scripts/core/progression.js";
import { fromJson, toJson, blank, upsertSpot, nearestSpot, removeSpot, setDeath, setHome, summary, sanitize } from "./load/scripts/core/memory.js";
import { Drops } from "./load/scripts/runtime/looting.js";

function memoryTests() {
    let pass = 0, fail = 0;
    const check = (name, cond) => { if (cond) pass++; else { fail++; console.log("FAIL: " + name); } };

    // garbage input never throws
    check("garbage null", JSON.stringify(fromJson(null)) === JSON.stringify(blank()));
    check("garbage text", JSON.stringify(fromJson("not json{")) === JSON.stringify(blank()));
    check("garbage array", JSON.stringify(fromJson("[1,2,3]")) === JSON.stringify(blank()));
    check("garbage object", fromJson(JSON.stringify({ x: "evil", spots: [{ kind: "lava", x: 0, y: 0, z: 0 }] })).spots.length === 0);

    // upsert dedupe
    const s = blank();
    check("first notice", upsertSpot(s, { kind: "chest", dim: "minecraft:overworld", x: 1, y: 64, z: 2, t: 100 }) === true);
    check("same again", upsertSpot(s, { kind: "chest", dim: "minecraft:overworld", x: 1, y: 64, z: 2, t: 200 }) === false);
    check("spots kept", s.spots.length === 1);
    check("different kind same cell", upsertSpot(s, { kind: "furnace", dim: "minecraft:overworld", x: 1, y: 64, z: 2, t: 200 }) === true);
    check("invalid kind refused", upsertSpot(s, { kind: "nuke", dim: "minecraft:overworld", x: 5, y: 64, z: 5, t: 1 }) === false);
    check("invalid pos refused", upsertSpot(s, { kind: "chest", dim: "minecraft:overworld", x: NaN, y: 64, z: 5, t: 1 }) === false);

    // nearest
    upsertSpot(s, { kind: "chest", dim: "minecraft:overworld", x: 100, y: 64, z: 100, t: 10 });
    const n = nearestSpot(s, "chest", "minecraft:overworld", { x: 90, y: 64, z: 100 });
    check("nearest picks close", n && n.x === 100);
    const nd = nearestSpot(s, "chest", "minecraft:nether", { x: 90, y: 64, z: 100 });
    check("nearest respects dimension", nd === undefined);

    // removal
    check("remove existing", removeSpot(s, "chest", "minecraft:overworld", { x: 1, y: 64, z: 2 }) === true);
    check("remove missing", removeSpot(s, "chest", "minecraft:overworld", { x: 1, y: 64, z: 2 }) === false);

    // roundtrip through json
    const s2 = fromJson(toJson(s));
    check("roundtrip spots", s2.spots.length === 2);
    check("roundtrip kinds", s2.spots.some((o) => o.kind === "furnace") && s2.spots.some((o) => o.kind === "chest"));

    // prefs whitelist + clamps
    const s3 = sanitize({ prefs: { camp: false, range: 9000, evil: true, parkour: "yes" }, v: 99 });
    check("prefs keep bool", s3.prefs && s3.prefs.camp === false);
    check("prefs clamp range", s3.prefs && s3.prefs.range === undefined);
    check("prefs drop unknown", s3.prefs && s3.prefs.evil === undefined && s3.prefs.parkour === undefined);

    // death + home
    check("death set", setDeath(s3, { x: 10, y: 70, z: 10 }, "minecraft:overworld", 500, { "minecraft:diamond": 3, bad: -1, worse: "x" }) === true);
    check("death items filtered", Object.keys(s3.death.items).length === 1);
    check("home set", (setHome(s3, { x: 1, y: 2, z: 3 }, "minecraft:overworld"), s3.home.x === 1));

    // caps
    const s4 = blank();
    for (let i = 0; i < 200; i++) upsertSpot(s4, { kind: "chest", dim: "minecraft:overworld", x: i, y: 64, z: 0, t: i });
    check("cap enforced", s4.spots.length <= 96);
    check("cap keeps newest", s4.spots.every((o) => o.t >= 200 - 96));

    // summary
    const sum = summary(s4);
    check("summary spots counted", sum.spots.chest === s4.spots.length);
    check("summary total", sum.spotsTotal === s4.spots.length);

    console.log(`\n${pass} passed, ${fail} failed`);
    return fail;
}

function capabilityTests() {
    let passed = 0, failed = 0;
    function test(name, fn) {
      try { fn(); console.log(`pass ${name}`); passed++; }
      catch (e) { console.log(`FAIL ${name}: ${e.message}`); failed++; }
    }

    test("any log detection", () => {
      if (!isAnyLog("minecraft:birch_log")) throw Error("birch should be any log");
      if (!isAnyLog("minecraft:crimson_stem")) throw Error("crimson should be any log");
      if (isAnyLog("minecraft:stone")) throw Error("stone should not be any log");
    });

    test("goal decomposition wood has hierarchy", () => {
      const tree = decomposeMission("wood");
      if (!tree.children.length) throw Error("wood should have children");
      const flat = tree.flatten();
      const hasAction = flat.some(f => f.node.hierarchy === 6);
      if (!hasAction) throw Error("should have ACTION level");
      const hasPrereq = flat.some(f => f.node.hierarchy === 5);
      if (!hasPrereq) throw Error("should have PREREQUISITE level");
    });

    test("follow goal has tower+water+gap", () => {
      const tree = decomposeMission("follow");
      const flat = tree.flatten();
      const hasTower = flat.some(f => f.node.id.includes("tower") || f.node.display.includes("pillar"));
      const hasWater = flat.some(f => f.node.id.includes("water") || f.node.id.includes("boat"));
      const hasGap = flat.some(f => f.node.id.includes("gap"));
      if (!hasTower) throw Error("follow should have tower");
      if (!hasWater) throw Error("follow should have water");
      if (!hasGap) throw Error("follow should have gap");
    });

    test("capabilities compose mixed situations", () => {
      const caps = composeCapabilities({ health: 4, threatCount: 3, hunger: 5, gapSize: 5, verticalDiff: 20, foodCount: 1, inWater: false, belowHazard: false, bombNear: true });
      if (caps.length < 2) throw Error("mixed situation should compose multiple capabilities, got "+caps.length);
      const hasEscape = caps.some(c => c.capability === CAPABILITIES.ESCAPE);
      const hasRetreat = caps.some(c => c.capability === CAPABILITIES.COMBAT_RETREAT);
      if (!hasEscape && !hasRetreat) throw Error("should have escape or retreat");
    });

    test("any log request analysis", () => {
      const tree = decomposeMission("wood");
      const missing = analyzeRequirements(tree, {}, {});
      if (!missing.length) throw Error("empty inventory should have missing");
      const hasLog = missing.some(m => m.id.includes("log"));
      if (!hasLog) throw Error("should have log missing");
    });

    console.log(`\n${passed} passed, ${failed} failed`);
    return failed;
}

function walkableGuard() {
    const worldFile = fileURLToPath(new URL("../scripts/runtime/world.js", import.meta.url));
    const source = readFileSync(worldFile, "utf8");
    const found = source.match(/WALKABLE\s*=\s*(\/.+\/[a-z]*);/);
    if (!found) {
        console.error("walkable: WALKABLE regex not found in scripts/runtime/world.js");
        return 1;
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
    return fail;
}

function flushTests() {
    const mkBot = (loc, entities) => ({
        sim: {
            location: loc,
            stopMoving() { },
            isSprinting: false,
            moveToLocation() { },
            isOnGround: true,
            jump() { },
        },
        terrain: { dimension: { getEntities: () => entities }, safe: () => true },
        nav: { reset() { }, stuck: false },
        host: { relative: (p) => p },
    });
    const mkEntity = (x, y, z, type) => ({
        isValid: true,
        location: { x, y, z },
        getComponent: () => ({ itemStack: { typeId: type } }),
    });
    let fails = 0;
    const ok = (cond, name) => {
        console.log((cond ? "pass" : "FAIL") + " " + name);
        if (!cond)
            fails++;
    };
    {
        const e = mkEntity(11, 10, 10, "minecraft:oak_log");
        const bot = mkBot({ x: 10.5, y: 10, z: 10.5 }, [e]);
        const d = new Drops(bot);
        const m = { item: "minecraft:oak_log", loot: new Map([["11,10,10", 1]]), blocked: new Map() };
        const r = d.flush(m, 100, 3, 20);
        ok(r === true && m.pickup && m.pickupEntity === e && m.loot.size === 0, "flush picks the matching drop and drops the cell");
    }
    {
        const bot = mkBot({ x: 10, y: 10, z: 10 }, []);
        const d = new Drops(bot);
        const m = { item: "minecraft:oak_log", loot: new Map([["11,10,10", 1]]), blocked: new Map() };
        ok(d.flush(m, 100, 3, 20) === false && m.loot.size === 0, "flush forgets cells with nothing left");
    }
    {
        const bot = mkBot({ x: 0, y: 10, z: 0 }, []);
        const d = new Drops(bot);
        const m = { item: "minecraft:oak_log", loot: new Map([["40,10,40", 1]]), blocked: new Map() };
        ok(d.flush(m, 100, 3, 20) === false && m.loot.size === 1, "flush ignores cells beyond reach");
    }
    {
        const far = mkEntity(14, 10, 10, "minecraft:oak_log");
        const near = mkEntity(11, 10, 10, "minecraft:oak_log");
        const bot = mkBot({ x: 10.5, y: 10, z: 10.5 }, [far, near]);
        const d = new Drops(bot);
        const m = { item: "minecraft:oak_log", loot: new Map([["14,10,10", 1], ["11,10,10", 1]]), blocked: new Map() };
        d.flush(m, 100, 3, 20);
        ok(m.pickupEntity === near && m.loot.size === 1, "flush takes the nearest cell first");
    }
    {
        const e = mkEntity(11, 10, 10, "minecraft:birch_log");
        const bot = mkBot({ x: 10.5, y: 10, z: 10.5 }, [e]);
        const d = new Drops(bot);
        const m = { item: "minecraft:oak_log", loot: new Map([["11,10,10", 1]]), blocked: new Map() };
        ok(d.flush(m, 100, 3, 20) === false && m.loot.size === 0, "flush ignores other item types");
    }
    console.log(fails ? "FLUSH FAILED: " + fails : "flush tests passed");
    return fails;
}


const sections = [
    ["persistent memory schema", memoryTests],
    ["survival capabilities + goal decomposition", capabilityTests],
    ["walkable regex guard", walkableGuard],
    ["drop-flush (Drops.flush)", flushTests],
];
let failedSections = 0;
for (const [name, fn] of sections) {
    console.log(`\n-- ${name}`);
    const n = fn();
    if (n) {
        failedSections++;
        console.log(`${name}: ${n} FAILED`);
    }
}
console.log(failedSections ? `\n${failedSections} section(s) FAILED` : "\ntests: all sections passed");
process.exit(failedSections ? 1 : 0);
