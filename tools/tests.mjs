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
import { blockedTask, TaskFault } from "../scripts/core/arbiter.js";
import { chooseLoot } from "./load/scripts/core/knowledge.js";
import { Drops, isContainerBlock } from "./load/scripts/runtime/looting.js";
import { VillageDirector } from "./load/scripts/runtime/village.js";
// The load copy wires @minecraft/server to the same index.js file, so
// __harness here IS the engine instance the pack modules run against.
import { __harness } from "./load/node_modules/@minecraft/server/index.js";

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

/**
 * Village locate ladder (runtime/village.js VillageDirector.locateVillageBiome):
 *   1. primary - Dimension.getGeneratedStructures probes on an outward-growing
 *      grid (module 2.4.0-beta / Bedrock 1.21.120+); a hit IS a village.
 *   2. fallback - seed-derived biome patch via calculateClosestBiomeFromSeed
 *      (location, biome) on 2.9.0, else findClosestBiome (biome, location)
 *      on older engines - the arg-order swap was the old silent no-op.
 * Also covers the search throttle, the throw-driven probe disable, and the
 * graceful scroll-off when every finder is missing.
 */
function villageLocatorTests() {
    let fails = 0;
    const ok = (cond, name) => {
        console.log((cond ? "pass" : "FAIL") + " " + name);
        if (!cond) fails++;
    };
    const fresh = (loc) => {
        __harness.reset();
        const dim = __harness.engine.dimension("minecraft:overworld");
        const rec = [];
        return {
            d: new VillageDirector({ sim: { location: { ...loc }, dimension: dim }, record: (m) => rec.push(m) }),
            dim, rec,
        };
    };

    {
        // 1) primary finder: a getGeneratedStructures hit IS the village.
        //    Ring 1's nearest vertex (64,64,-64) sits 90 blocks from the
        //    footprint centred at (128,64,-128) with radius 100: first hit.
        const { d, rec } = fresh({ x: 0, y: 64, z: 0 });
        __harness.setStructure({ x: 128, y: 64, z: -128 }, "minecraft:village_plains", 100);
        const first = d.locateVillageBiome(1000);
        ok(!!first && first.probe === true && first.biome === "minecraft:village_plains", "ring-1 probe point inside the footprint reports a village hit");
        ok(!!first && Math.hypot(first.pos.x - 128, first.pos.z + 128) <= 100, "the probe point sits inside the structure's footprint");
        ok(d.locateVillageBiome(1200) === first, "search throttle returns the cached lead between cycles");
        ok(rec.some((m) => m.includes("Village locate: village_plains")), "hit is recorded on the owner feed");
    }

    {
        // 2) engines without the new bindings: corrected findClosestBiome order
        const { d, dim } = fresh({ x: 100, y: 64, z: 100 });
        dim.getGeneratedStructures = undefined; // pre-1.21.120 engine
        dim.calculateClosestBiomeFromSeed = undefined; // pre-2.9.0 module
        __harness.setBiome({ x: 400, y: 64, z: 100 }, "minecraft:plains", 96);
        ok(d.probeGeneratedStructures(500) === null, "probes report nothing when the binding is absent");
        const lead = d.locateVillageBiome(500);
        ok(!!lead && !lead.probe && lead.biome === "minecraft:plains" && lead.pos.x === 400 && lead.pos.z === 100, "biome fallback uses findClosestBiome(biome, location) and finds the seeded patch");
        ok(d.locateVillageBiome(900) === lead, "throttle returns the same cached lead between searches");
        dim.findClosestBiome = undefined; // no biome finder at all
        ok(d.locateVillageBiome(1100) === null, "missing every finder degrades to null without throwing");
    }

    {
        // 3) repeatedly throwing locator disables probes; biome search takes over
        const { d, dim, rec } = fresh({ x: 0, y: 64, z: 0 });
        // A village sits in ring 1's first cell - probes WOULD find it if they ran.
        __harness.setStructure({ x: 64, y: 64, z: -64 }, "minecraft:village_desert", 200);
        __harness.setBiome({ x: 900, y: 64, z: 0 }, "minecraft:desert", 96);
        dim.getGeneratedStructures = () => { throw new Error("chunk unloaded"); };
        const l1 = d.locateVillageBiome(1000);
        ok(!!l1 && !l1.probe && l1.biome === "minecraft:desert" && l1.pos.x === 900, "with probes failing, the biome finder serves the lead instead");
        ok(d._probeFails >= 8, "consecutive throws crossed the probe-disable threshold");
        ok(rec.some((m) => m.includes("unusable") && m.includes("biome search takes over")), "owner is told the primary finder was retired");
        const l2 = d.locateVillageBiome(1600);
        ok(!!l2 && l2.biome === "minecraft:desert", "after the threshold, searches go straight to the biome finder");
    }

    console.log(fails ? "LOCATOR FAILED: " + fails : "village locator tests passed");
    return fails;
}

/**
 * Chest handling (core/knowledge.js chooseLoot + runtime/looting.js
 * isContainerBlock): full-drain planning (every useful stack the bag can
 * hold, junk only when roomy, merges ride free) and component-first
 * container detection for every chest type Mojang ships.
 */
function chestLootTests() {
    let fails = 0;
    const ok = (cond, name) => {
        console.log((cond ? "pass" : "FAIL") + " " + name);
        if (!cond) fails++;
    };
    const stack = (typeId, amount = 1) => ({ typeId, amount });
    const kinds = (idxs, chest) => new Set(idxs.map((i) => chest[i]?.typeId));

    {
        // 1) full-drain: every useful stack rides into the room the bag has.
        const chest = [
            stack("minecraft:diamond", 2),
            stack("minecraft:diamond", 1),
            stack("minecraft:iron_ingot", 3),
            stack("minecraft:bread", 4),
            stack("minecraft:stick", 6), // junk
        ];
        const picked = kinds(chooseLoot(chest, {}, 6, null), chest);
        ok(chooseLoot(chest, {}, 6, null).length === 4, "with 6 free slots the plan takes all 4 useful stacks (2 diamond + iron ingot + bread)");
        ok(picked.has("minecraft:diamond") && picked.has("minecraft:iron_ingot") && picked.has("minecraft:bread"), "the chosen types are the useful ones");
        ok(!picked.has("minecraft:stick"), "junk stays behind when the bag is tight (junk budget 0 at budget 4)");
    }
    {
        // 2) mergeable stacks ride free even into a full bag.
        const chest = [stack("minecraft:diamond", 5)];
        const r = chooseLoot(chest, { "minecraft:diamond": 9 }, 0, null);
        ok(r.length === 1 && r[0] === 0, "a stack that merges into a carried partial stack is taken even at zero free slots");
    }
    {
        // 3) junk only when the bag is roomy.
        const chest = [
            stack("minecraft:gold_ingot", 4),
            stack("minecraft:gold_ingot", 1),
            stack("minecraft:apple", 3),
            stack("minecraft:rotten_flesh", 4),
            stack("minecraft:rotten_flesh", 2),
            stack("minecraft:rotten_flesh", 1),
        ];
        const roomy = kinds(chooseLoot(chest, {}, 12, null), chest);
        ok(roomy.has("minecraft:rotten_flesh"), "with 12 free slots the bag is roomy enough to also strip junk");
        const tight = kinds(chooseLoot(chest, {}, 5, null), chest);
        ok(!tight.has("minecraft:rotten_flesh"), "a tight bag leaves junk in the chest");
        ok(tight.has("minecraft:gold_ingot") && tight.has("minecraft:apple") && tight.size === 2, "a tight bag still takes the valuable gold + useful apple");
    }
    {
        // 4) every container the engine exposes is lootable - component first.
        const comp = () => ({});
        const none = () => undefined;
        ok(isContainerBlock({ typeId: "minecraft:copper_chest", getComponent: comp }), "copper chest detected via the inventory component (no id table to update)");
        ok(isContainerBlock({ typeId: "minecraft:white_shulker_box", getComponent: comp }), "coloured shulker box detected via the component");
        ok(isContainerBlock({ typeId: "minecraft:barrel", getComponent: comp }), "barrel detected via the component");
        ok(isContainerBlock({ typeId: "minecraft:trapped_chest" }), "trapped chest detected via the id fallback when no binding exists");
        ok(!isContainerBlock({ typeId: "minecraft:decorated_pot", getComponent: none }), "decorated pot is not planned as a chest");
        ok(!isContainerBlock({ typeId: "minecraft:ender_chest", getComponent: none }), "ender chest is skipped: its contents are not block-local");
        ok(!isContainerBlock({ typeId: "minecraft:oak_planks", getComponent: none }), "plain building blocks are not containers");
    }

    console.log(fails ? "CHESTLOOT FAILED: " + fails : "chest loot planning tests passed");
    return fails;
}


// core/arbiter.js blockedTask(): the recovery ladder behind blockTask(). An
// UNEXPECTED throw (not a TaskFault) used to park the task as "manual" forever -
// the "!bot auto had to be pressed" loop. It now rides a bounded retry ladder.
function blockedTaskTests() {
    let pass = 0, fail = 0;
    const check = (name, cond) => { if (cond) pass++; else { fail++; console.log("FAIL: " + name); } };

    // "retry": bounded backoff ladder that never gives up (40, 80, ... capped at 1200 ticks).
    const delayOf = (recovery, attempt) => blockedTask("why", recovery, attempt, 1000).retryAt - 1000;
    check("retry attempt 1 retries in 40 ticks", delayOf("retry", 1) === 40);
    check("retry attempt 2 retries in 80 ticks", delayOf("retry", 2) === 80);
    check("retry ladder caps at 1200 ticks", delayOf("retry", 40) === 1200);
    check("plain retry never turns into manual", blockedTask("why", "retry", 40, 0).recovery === "retry");

    // "retry-bounded": five clean retries, then an honest handover to the owner.
    const bounded = (attempt) => blockedTask("why", "retry-bounded", attempt, 0);
    check("bounded attempts 1-5 still retry", [1, 2, 3, 4, 5].every((a) => bounded(a).recovery === "retry" && bounded(a).retryAt !== undefined));
    check("bounded attempt 6 stops retrying (manual)", bounded(6).recovery === "manual" && bounded(6).retryAt === undefined);
    check("only the capped round is flagged", bounded(6).capped === true && [1, 2, 3, 4, 5].every((a) => bounded(a).capped === false));

    // "manual": genuine owner decisions never self-recover - only capping produces it for bounded faults.
    check("manual never self-recovers", blockedTask("why", "manual", 1, 0).retryAt === undefined && blockedTask("why", "manual", 40, 0).recovery === "manual");

    // TaskFault without an explicit recovery stays owner-facing (CRITICAL equipment rollback, component missing).
    check("TaskFault default recovery is manual", new TaskFault("critical").recovery === "manual");
    check("TaskFault keeps an explicit retry", new TaskFault("late", "retry").recovery === "retry");

    console.log(`\n${pass} passed, ${fail} failed`);
    return fail;
}


const sections = [
    ["persistent memory schema", memoryTests],
    ["survival capabilities + goal decomposition", capabilityTests],
    ["walkable regex guard", walkableGuard],
    ["drop-flush (Drops.flush)", flushTests],
    ["village locate ladder", villageLocatorTests],
    ["chest loot planning", chestLootTests],
    ["blocked-task recovery ladder", blockedTaskTests],
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
