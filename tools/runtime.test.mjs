// Runtime-layer regression tests for the 1.2.5 lag work, run against the
// instrumented fake engine (tools/perf/fake-mc.mjs). They pin the properties
// the caches must keep: inventory snapshots never serve stale data to a
// commit (no item fabrication or loss), terrain snapshots respect
// invalidation, live block handles stay live, the threat query is shared per
// tick, A* still finds correct routes, and the arbiter defers the behaviours
// the main loop runs.
import { loadScripts } from "./perf/load.mjs";

const { mc, load } = await loadScripts({ name: "runtime-test" });
const { Bag } = await load("runtime/inventory.js");
const { Terrain } = await load("runtime/world.js");
const { PathSearch } = await load("core/navigation.js");
const { Arbiter } = await load("core/arbiter.js");
const { Navigator } = await load("runtime/navigation.js");
const { Bot } = await load("runtime/bot.js");
const { craft, RECIPES } = await load("core/recipes.js");

let pass = 0, fail = 0;
const t = (name, fn) => {
    try { fn(); pass++; console.log("pass " + name); }
    catch (e) { fail++; console.log("FAIL " + name + ": " + (e?.stack ?? e)); }
};
const eq = (a, b, msg = "") => { if (JSON.stringify(a) !== JSON.stringify(b)) throw Error(`${msg} expected ${JSON.stringify(b)} got ${JSON.stringify(a)}`); };
const ok = (v, msg = "") => { if (!v) throw Error(msg || "expected truthy"); };

function world() {
    mc.resetWorld();
    const x = 4, z = 4, y = mc.heightAt(x, z) + 1;
    const owner = new mc.Player("Owner", { x: x + 2.5, y, z: z + 0.5 });
    const sim = new mc.SimPlayer("Verdant", { x: x + 0.5, y, z: z + 0.5 });
    mc.state.players.push(owner, sim);
    return { sim, owner, x, y, z };
}
const tickTo = (n) => { while (mc.state.tick < n) mc.advance(); };

/* ------------------------------------------------------------------ Bag */

t("bag: counts match the container and are safe to mutate", () => {
    const { sim } = world();
    sim._inv.give("minecraft:oak_planks", 10); sim._inv.give("minecraft:stick", 4);
    const bag = new Bag(sim); bag.begin(1);
    const c = bag.counts();
    eq(c["minecraft:oak_planks"], 10); eq(c["minecraft:stick"], 4);
    c["minecraft:stick"] = 99;
    eq(bag.counts()["minecraft:stick"], 4, "memo must not be shared with callers");
});

t("bag: one engine snapshot per tick for repeated reads", () => {
    const { sim } = world();
    sim._inv.give("minecraft:cobblestone", 5);
    const bag = new Bag(sim); bag.begin(1);
    bag.counts();
    mc.resetCounters();
    bag.counts(); bag.find((s) => s.typeId === "minecraft:cobblestone"); bag.buildBlock(); bag.freeSlots();
    ok(mc.N.container === 0 && mc.N.getComponent === 0, `no container reads expected, got ${mc.N.container}/${mc.N.getComponent}`);
});

t("bag: set() invalidates; next tick sees outside changes (pickups)", () => {
    const { sim } = world();
    const bag = new Bag(sim); bag.begin(1);
    eq(bag.counts()["minecraft:dirt"], undefined);
    bag.set(3, new mc.ItemStack("minecraft:dirt", 7));
    eq(bag.counts()["minecraft:dirt"], 7);
    sim._inv.give("minecraft:dirt", 2); // engine-side pickup between ticks
    eq(bag.counts()["minecraft:dirt"], 7, "same tick still uses the snapshot");
    bag.begin(2);
    eq(bag.counts()["minecraft:dirt"], 9);
});

t("bag: item use through the hooked sim switches to live reads (no stale commit)", () => {
    const { sim, x, y, z } = world();
    sim._inv.give("minecraft:oak_planks", 4);
    sim._inv.give("minecraft:cobblestone", 1);
    const bot = new Bot(sim, "Owner", { relative: (p) => p }, null);
    bot.bag.begin(mc.state.tick + 1);
    ok(bot.bag.useHooked, "bot should hook its own use* calls");
    eq(bot.bag.counts()["minecraft:cobblestone"], 1);
    mc.setType(x + 3, y - 1, z, "minecraft:stone");
    mc.setType(x + 3, y, z, "minecraft:air");
    const slot = bot.bag.select(bot.bag.buildBlock());
    eq(bot.bag.counts()["minecraft:cobblestone"], 1, "read between select and use");
    ok(sim.useItemInSlotOnBlock(slot, { x: x + 3, y: y - 1, z }, "Up"), "placement should succeed");
    eq(bot.bag.counts()["minecraft:cobblestone"], undefined, "consumed stack must be gone");
    // A full-inventory commit right after the use must not resurrect the block.
    craft(bot.bag, RECIPES["minecraft:stick"] ?? { ingredients: { "#planks": 2 }, output: "minecraft:stick", amount: 4 }, 1, false);
    const after = bot.bag.counts();
    eq(after["minecraft:cobblestone"], undefined, "craft commit duplicated a used item");
    eq(after["minecraft:oak_planks"], 2);
    eq(after["minecraft:stick"], 4);
});

t("bag: without begin() every read is live (other Bag users unchanged)", () => {
    const { sim } = world();
    const bag = new Bag(sim);
    eq(bag.counts()["minecraft:dirt"], undefined);
    sim._inv.give("minecraft:dirt", 3);
    eq(bag.counts()["minecraft:dirt"], 3);
});

t("bag: buildBlock priority, worn tools excluded from usableCounts", () => {
    const { sim } = world();
    sim._inv.give("minecraft:dirt", 5); sim._inv.give("minecraft:cobblestone", 5);
    const pick = new mc.ItemStack("minecraft:stone_pickaxe", 1); pick._dmg = 130;
    sim._inv._s[20] = pick;
    const bag = new Bag(sim); bag.begin(1);
    eq(bag.get(bag.buildBlock()).typeId, "minecraft:cobblestone");
    eq(bag.usableCounts()["minecraft:stone_pickaxe"], 0);
    eq(bag.counts()["minecraft:stone_pickaxe"], 1);
    ok(!bag.hasTool("pickaxe", 1), "a nearly broken pickaxe is not a usable tool");
});

/* -------------------------------------------------------------- Terrain */

t("terrain: snapshots are cached, typeFresh/invalidate/clear force real reads", () => {
    const { sim, x, y, z } = world();
    const terrain = new Terrain(sim.dimension); terrain.begin(1);
    const p = { x: x + 5, y: y - 1, z };
    const before = terrain.type(p);
    mc.setType(p.x, p.y, p.z, "minecraft:gold_block");
    eq(terrain.type(p), before, "cached snapshot expected");
    eq(terrain.block(p).typeId, "minecraft:gold_block", "block() handles must stay live");
    eq(terrain.typeFresh(p), "minecraft:gold_block");
    mc.setType(p.x, p.y, p.z, "minecraft:stone");
    terrain.invalidate(p);
    eq(terrain.type(p), "minecraft:stone");
    mc.setType(p.x, p.y, p.z, "minecraft:diamond_block");
    terrain.clear();
    eq(terrain.read(p).type, "minecraft:diamond_block");
    terrain.begin(1 + 41);
    mc.setType(p.x, p.y, p.z, "minecraft:stone");
    eq(terrain.type(p), "minecraft:stone", "snapshot must expire");
});

t("terrain: read() records and standability", () => {
    const { sim, x, y, z } = world();
    const terrain = new Terrain(sim.dimension); terrain.begin(1);
    const ground = terrain.read({ x, y: y - 1, z });
    ok(ground.support && !ground.passable && !ground.hazard, "ground should be solid support");
    ok(terrain.read({ x, y, z }).passable, "feet cell should be passable");
    ok(terrain.safe({ x, y, z }), "spawn cell should be standable");
    mc.setType(x, y, z, "minecraft:lava");
    terrain.clear();
    ok(!terrain.safe({ x, y, z }), "lava is not standable");
    ok(terrain.read({ x, y, z }).hazard, "lava is a hazard");
});

t("terrain: one threat query per tick, reused while empty, re-run on damage", () => {
    const { sim, x, y, z } = world();
    const terrain = new Terrain(sim.dimension); terrain.begin(1);
    mc.resetCounters();
    const a = terrain.threatInfo(sim, undefined), b = terrain.threatInfo(sim, undefined);
    ok(a === b && mc.N.getEntities === 1, "same tick must share one query");
    terrain.begin(2); terrain.threatInfo(sim, undefined);
    eq(mc.N.getEntities, 1, "empty result reused for 2 ticks");
    mc.state.entities.push(new mc.Entity("minecraft:zombie", { x: x + 4, y, z }));
    terrain.forgetThreats(); terrain.threatInfo(sim, undefined);
    eq(mc.N.getEntities, 2, "forgetThreats() must force a rescan");
    terrain.begin(3);
    const c = terrain.threatInfo(sim, undefined);
    eq(c.count, 1); eq(c.nearest.typeId, "minecraft:zombie");
    terrain.begin(4); terrain.threatInfo(sim, undefined);
    eq(mc.N.getEntities, 4, "non-empty results are re-scanned every tick");
});

t("terrain: scanOres is nearest-first, bounded and verified", () => {
    const { sim, x, y, z } = world();
    const terrain = new Terrain(sim.dimension); terrain.begin(1);
    mc.setType(x + 3, y, z, "minecraft:emerald_ore");
    mc.setType(x + 1, y, z, "minecraft:emerald_ore");
    mc.setType(x + 9, y, z, "minecraft:emerald_ore");
    const hits = terrain.scanOres({ x: x + 0.5, y, z: z + 0.5 }, 5, (t) => t === "minecraft:emerald_ore", 512);
    eq(hits.map((p) => p.x - x), [1, 3]);
    mc.setType(x + 1, y, z, "minecraft:air");
    terrain.begin(2);
    const again = terrain.scanOres({ x: x + 0.5, y, z: z + 0.5 }, 5, (t) => t === "minecraft:emerald_ore", 512);
    eq(again.map((p) => p.x - x), [3], "a stale snapshot hit must be rejected by the live check");
});

t("terrain: tableNear remembers hits only and re-verifies them", () => {
    const { sim, x, y, z } = world();
    const terrain = new Terrain(sim.dimension); terrain.begin(1);
    ok(!terrain.tableNear({ x: x + 0.5, y, z: z + 0.5 }));
    mc.setType(x + 1, y, z, "minecraft:crafting_table"); // placed by someone else
    terrain.begin(12); // open-cell snapshots last 10 ticks
    ok(terrain.tableNear({ x: x + 0.5, y, z: z + 0.5 }), "an outside table is seen once its air snapshot expires");
    mc.setType(x + 1, y, z, "minecraft:air");
    terrain.begin(13);
    ok(!terrain.tableNear({ x: x + 0.5, y, z: z + 0.5 }), "a removed table must not be served from the memo");
});

t("terrain: the bot's own placements and breaks are visible immediately", () => {
    const { sim, x, y, z } = world();
    sim._inv.give("minecraft:crafting_table", 1);
    const bot = new Bot(sim, "Owner", { relative: (p) => p }, null);
    mc.advance(); bot.bag.begin(mc.state.tick); bot.terrain.begin(mc.state.tick);
    mc.setType(x + 1, y - 1, z, "minecraft:stone");
    mc.setType(x + 1, y, z, "minecraft:air");
    ok(!bot.terrain.tableNear({ x: x + 0.5, y, z: z + 0.5 }), "no table yet (snapshots now cached)");
    const slot = bot.bag.select(bot.bag.findType("minecraft:crafting_table"));
    ok(sim.useItemInSlotOnBlock(slot, { x: x + 1, y: y - 1, z }, "Up"), "table placement should succeed");
    mc.advance(); bot.bag.begin(mc.state.tick); bot.terrain.begin(mc.state.tick);
    ok(bot.terrain.tableNear({ x: x + 0.5, y, z: z + 0.5 }), "a table the bot just placed must be seen at once");
    eq(bot.terrain.read({ x: x + 1, y, z }).type, "minecraft:crafting_table", "A* snapshot must see it too");
    ok(sim.breakBlock({ x: x + 1, y, z }), "break should start");
    for (let i = 0; i < 7; i++) { mc.advance(); sim.physics(); }
    bot.terrain.begin(mc.state.tick);
    eq(bot.terrain.read({ x: x + 1, y, z }).type, "minecraft:air", "a block the bot broke must not linger in snapshots");
});

/* ------------------------------------------------------------ PathSearch */

function flat(map) {
    // map: rows of chars, '#' wall (2 high), '.' floor, 'L' lava floor; y=0 feet level
    const cells = new Map();
    map.forEach((row, z) => [...row].forEach((ch, x) => cells.set(`${x},${z}`, ch)));
    return (p) => {
        const ch = cells.get(`${p.x},${p.z}`) ?? "#";
        if (p.y < 0) return ch === "L" ? { passable: false, support: false, hazard: true, type: "minecraft:lava" } : { passable: false, support: true, hazard: false, type: "minecraft:stone" };
        if (p.y <= 1 && ch === "#") return { passable: false, support: true, hazard: false, type: "minecraft:stone" };
        return { passable: true, support: false, hazard: false, type: "minecraft:air" };
    };
}
const run = (s) => { let r; for (let i = 0; i < 200 && (r = s.step(64)) === "searching"; i++); return r; };

t("path: straight line on open floor", () => {
    const read = flat(["..........", "..........", ".........."]);
    const s = new PathSearch(read, { x: 0, y: 0, z: 1 }, { x: 9, y: 0, z: 1 }, 0.7, false, 1200, 24);
    eq(run(s), "found"); eq(s.path.length, 9); ok(s.path.every((p) => p.kind === "walk" && p.z === 1));
});

t("path: detours around a wall and avoids lava", () => {
    const read = flat(["..........", "....#.....", "....#.....", "....L....."]);
    const s = new PathSearch(read, { x: 0, y: 0, z: 2 }, { x: 9, y: 0, z: 2 }, 0.7, false, 1200, 24);
    eq(run(s), "found");
    ok(!s.path.some((p) => p.x === 4 && p.z !== 0), "must go through the only gap");
    ok(!s.path.some((p) => p.x === 4 && p.z === 3), "must not step on lava");
});

t("path: enclosed goal is reported, not looped", () => {
    const read = flat(["......###", "......#.#", "......###"]);
    const s = new PathSearch(read, { x: 0, y: 0, z: 1 }, { x: 7, y: 0, z: 1 }, 0.7, false, 1200, 24);
    const r = run(s);
    ok(r === "unreachable" || r === "budget", "got " + r);
});

/* --------------------------------------------------------------- Arbiter */

function fakeBot(overrides = {}) {
    const sim = { location: { x: 0, y: 64, z: 0 }, getComponent: () => ({ currentValue: 20 }), isInWater: false };
    return Object.assign({
        sim, mode: "follow", settings: { loot: false, speedrun: false }, reason: "", records: [],
        owner: () => ({ location: { x: 30, y: 64, z: 0 } }),
        record(e) { this.records.push(e); },
        terrain: { threatInfo: () => ({ count: 0, nearest: null, closest: Infinity, list: [] }), read: () => ({ hazard: false }), headInWater: () => false },
        nav: { stuck: false }, miner: { active: false }, deepMiner: { active: false },
        survivalMaster: { fallStartY: null, tick: () => false }, fallDepth: () => 0,
    }, overrides);
}

t("arbiter: mission/escape/combat are deferred to the main loop", () => {
    const a = new Arbiter(fakeBot());
    const r = a.tick(100);
    eq(r.code, "defer"); eq(r.id, "follow");
});

t("arbiter: a declined director hands the tick back without a second evaluation", () => {
    let evaluations = 0;
    const bot = fakeBot({ survivalMaster: { fallStartY: 70, tick: () => false }, fallDepth: () => 6 });
    const a = new Arbiter(bot);
    const orig = a.evaluate.bind(a);
    a.evaluate = (tick) => { evaluations++; return orig(tick); };
    const r = a.tick(100);
    eq(r.code, "no_target"); eq(a.current, null); eq(evaluations, 1);
    ok(a.cooling("survival_master", 110), "declined director should cool down");
    const next = a.tick(105);
    eq(next.code, "defer", "next pick skips the cooling director");
});

t("arbiter: a throwing director is benched and reported once", () => {
    const bot = fakeBot({ survivalMaster: { fallStartY: 70, tick: () => { throw Error("boom"); } }, fallDepth: () => 6 });
    const a = new Arbiter(bot);
    const warn = console.warn; let warned = 0; console.warn = () => { warned++; };
    try {
        const r = a.tick(100);
        eq(r.code, "failed"); ok(r.reason.includes("survival_master"), "reason must name the director");
        ok(a.cooling("survival_master", 199), "thrower benched for 100 ticks");
        a.tick(105); a.tick(110);
        eq(warned, 1);
    } finally { console.warn = warn; }
});

/* ------------------------------------------------------------- Navigator */

t("navigator: short clear hops walk directly; long ones search", () => {
    const { sim, x, y, z } = world();
    const terrain = new Terrain(sim.dimension); terrain.begin(1);
    const nav = new Navigator(sim, { relative: (p) => p }, terrain);
    const near = { x: x + 3.5, y, z: z + 0.5 };
    if (terrain.safe({ x: x + 1, y, z }) && terrain.safe({ x: x + 2, y, z }) && terrain.safe({ x: x + 3, y, z })) {
        eq(nav.go(near, 1), "running");
        ok(!nav.search && nav.direct, "expected a direct move without A*");
    }
    nav.reset();
    const far = { x: x + 15.5, y: mc.heightAt(x + 15, z) + 1, z: z + 0.5 };
    nav.go(far, 2);
    ok(nav.search || nav.path.length || nav.direct === undefined, "a far goal should start a search");
});

t("navigator: small goal drift keeps the running search", () => {
    const { sim, x, y, z } = world();
    const terrain = new Terrain(sim.dimension); terrain.begin(1);
    const nav = new Navigator(sim, { relative: (p) => p }, terrain);
    const goal = { x: x + 20.5, y: mc.heightAt(x + 20, z) + 1, z: z + 0.5 };
    nav.go(goal, 1);
    const search = nav.search;
    if (search && search.status === "searching") {
        nav.go({ ...goal, x: goal.x + 2 }, 20);
        ok(nav.search === search, "a 2-block drift must not restart A*");
    }
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
