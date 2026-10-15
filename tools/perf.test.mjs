// Ultra-efficiency regression suite.
//
// Proves the lag fixes are real AND behaviour-preserving, offline:
//   * A* neighbour generation is equivalent to the frozen v1.2.4 search
//     (fuzzed on random worlds), minus the bogus "big gap" candidates on
//     solid ground, and expands fewer nodes / does fewer block reads.
//   * Terrain answers repeated environment queries from cache (native
//     getBlock / property reads counted on a fake dimension).
//   * threatInfo() runs one entity query per tick no matter how many callers.
//   * Bag reads the inventory once per tick and never selects a slot when
//     only asked "do I have a tool?".
//   * The arbiter no longer ticks mission/combat/escape with wrong arguments
//     (which reset the navigator every 5 ticks) and never double-evaluates.
//   * Navigator uses the reduced budgets and walks short clear hops directly.
//
// Runtime modules that import @minecraft/* are loaded from tools/load (the
// stubbed copy rebuilt by run-all.mjs); pure modules from scripts/.
import { PathSearch } from "../scripts/core/navigation.js";
import { PathSearch as LegacySearch } from "./perf/legacy-navigation.mjs";
import { Terrain, RollingSweep, BlockScan } from "../scripts/runtime/world.js";
import { Navigator } from "../scripts/runtime/navigation.js";
import { Arbiter, DEFERRED } from "../scripts/core/arbiter.js";
import { cellDanger, pathPenalty, dangerMap } from "../scripts/core/brain/danger.js";
import { Bag } from "./load/scripts/runtime/inventory.js";

let pass = 0, fail = 0;
const ok = (cond, name) => {
    if (cond) { pass++; console.log("pass " + name); }
    else { fail++; console.log("FAIL " + name); }
};
const rng = (seed) => () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

// ---------------------------------------------------------------- toy worlds
/** Cell model matching Terrain.read(): passable/support/hazard/type. */
const AIR = { passable: true, support: false, hazard: false, type: "minecraft:air", isAir: true };
const STONE = { passable: false, support: true, hazard: false, type: "minecraft:stone", isAir: false };
const LAVA = { passable: false, support: false, hazard: true, type: "minecraft:lava", isAir: false };
const WATER = { passable: false, support: false, hazard: true, type: "minecraft:water", isAir: false };

function makeWorld(fn) {
    const stats = { reads: 0 };
    const read = (p) => { stats.reads++; return fn(p.x, p.y, p.z); };
    return { read, stats };
}
const flat = (x, y, z) => (y <= 0 ? STONE : AIR);
function randomWorld(seed) {
    const r = rng(seed);
    const cells = new Map();
    return (x, y, z) => {
        const k = `${x},${y},${z}`;
        let c = cells.get(k);
        if (!c) {
            const v = r();
            if (y < -1) c = STONE;
            else if (y > 3) c = AIR;
            else c = v < 0.42 ? AIR : v < 0.82 ? STONE : v < 0.9 ? LAVA : v < 0.95 ? WATER : AIR;
            cells.set(k, c);
        }
        return c;
    };
}
const sig = (list) => [...new Set(list.map((q) => `${q.x},${q.y},${q.z},${q.kind}`))].sort();

// ------------------------------------------------- A* neighbour equivalence
{
    let identical = 0, subset = 0, total = 0, bogusRemoved = 0;
    for (let seed = 1; seed <= 60; seed++) {
        const w = randomWorld(seed);
        for (const allowBridge of [false, true]) {
            const opts = { allowBridge, allowPillar: allowBridge, allowSprintJump: true };
            const a = new PathSearch((p) => w(p.x, p.y, p.z), { x: 0, y: 1, z: 0 }, { x: 20, y: 1, z: 0 }, 0.7, true, 2000, 32, false, [], opts);
            const b = new LegacySearch((p) => w(p.x, p.y, p.z), { x: 0, y: 1, z: 0 }, { x: 20, y: 1, z: 0 }, 0.7, true, 2000, 32, false, [], opts);
            for (let i = 0; i < 40; i++) {
                const p = { x: (i * 7) % 13 - 6, y: (i % 3), z: (i * 5) % 11 - 5 };
                const n = sig(a.neighbors(p)), o = sig(b.neighbors(p));
                total++;
                if (!allowBridge) { if (n.join("|") === o.join("|")) identical++; }
                else {
                    const os = new Set(o);
                    if (n.every((x) => os.has(x))) subset++;
                    bogusRemoved += o.length - n.length;
                }
            }
        }
    }
    ok(identical === total / 2, `A*: neighbours identical to v1.2.4 without bridging (${identical}/${total / 2} cells)`);
    ok(subset === total / 2, `A*: with bridging, neighbours are a subset of v1.2.4 (${subset}/${total / 2})`);
    console.log(`     (removed ${bogusRemoved} bogus/duplicate bridge+pillar candidates)`);
}
{
    // Flat ground: the old search proposed place-block-and-jump moves onto
    // plain floor (cost 10) in every direction from every node.
    const w = makeWorld(flat);
    const opts = { allowBridge: true, allowPillar: true, allowSprintJump: true };
    const n = new PathSearch(w.read, { x: 0, y: 1, z: 0 }, { x: 9, y: 1, z: 0 }, 0.7, true, 2000, 32, false, [], opts).neighbors({ x: 0, y: 1, z: 0 });
    const o = new LegacySearch(w.read, { x: 0, y: 1, z: 0 }, { x: 9, y: 1, z: 0 }, 0.7, true, 2000, 32, false, [], opts).neighbors({ x: 0, y: 1, z: 0 });
    ok(!n.some((q) => q.kind.startsWith("bridge")), "A*: no bridge/jump-over-gap candidates on solid flat ground");
    ok(o.filter((q) => q.kind.startsWith("bridge")).length > 0, "A*: (legacy really did emit them - regression guard)");
    ok(n.filter((q) => q.kind === "pillar").length === 1 && o.filter((q) => q.kind === "pillar").length === 4, "A*: pillar candidate emitted once (was 4x)");
}

// --------------------------------------------------- A* results + cost
function run(Search, worldFn, start, goal, maxNodes, radius, opts = {}, allowPartial = false) {
    const w = makeWorld(worldFn);
    const s = new Search(w.read, start, goal, 0.7, true, maxNodes, radius, allowPartial, [], opts);
    let r;
    for (let i = 0; i < 400 && (r = s.step(120)) === "searching"; i++);
    return { status: r, path: s.path, expanded: s.expanded, reads: w.stats.reads };
}
{
    const a = run(PathSearch, flat, { x: 0, y: 1, z: 0 }, { x: 15, y: 1, z: 6 }, 2000, 32);
    const b = run(LegacySearch, flat, { x: 0, y: 1, z: 0 }, { x: 15, y: 1, z: 6 }, 2000, 32);
    ok(a.status === "found" && b.status === "found", "A*: flat route found by both");
    ok(a.path.length === b.path.length, `A*: same path length on flat ground (${a.path.length} vs ${b.path.length})`);
    ok(a.reads < b.reads / 4, `A*: block reads per search cut ${b.reads} -> ${a.reads}`);

    // Wall with a door
    const wall = (x, y, z) => (y <= 0 ? STONE : x === 6 && z !== 5 && y <= 3 ? STONE : AIR);
    const c = run(PathSearch, wall, { x: 0, y: 1, z: 0 }, { x: 12, y: 1, z: 0 }, 2000, 32);
    const d = run(LegacySearch, wall, { x: 0, y: 1, z: 0 }, { x: 12, y: 1, z: 0 }, 2000, 32);
    ok(c.status === "found" && c.path.some((p) => p.x === 6 && p.z === 5), "A*: routes through the door in a wall");
    ok(c.path.length === d.path.length, `A*: door route length matches legacy (${c.path.length})`);

    // Gap jump
    const gap = (x, y, z) => (y <= 0 && x !== 4 ? STONE : y < -3 ? STONE : AIR);
    const e = run(PathSearch, gap, { x: 0, y: 1, z: 0 }, { x: 8, y: 1, z: 0 }, 2000, 32);
    ok(e.status === "found" && e.path.some((p) => p.kind === "jump" || p.kind === "drop" || p.kind === "bigdrop"), "A*: crosses a 1-block trench");

    // Lava moat: never step into hazard
    const moat = (x, y, z) => (y < 0 ? STONE : y === 0 ? (x >= 3 && x <= 5 && z > -6 && z < 6 ? LAVA : STONE) : AIR);
    const f = run(PathSearch, moat, { x: 0, y: 1, z: 0 }, { x: 9, y: 1, z: 0 }, 2000, 32, { allowBridge: false });
    ok(f.status === "found" && f.path.every((p) => !(p.x >= 3 && p.x <= 5 && p.z > -6 && p.z < 6 && p.y === 1)), "A*: walks around a lava strip (never on it)");

    // Budget exhaustion -> best-effort partial instead of failure
    // Wall with a far door: the full route does not fit in 120 nodes.
    const longWall = (x, y, z) => (y <= 0 ? STONE : (x === 6 && z !== 14 && y <= 3) ? STONE : AIR);
    const g = run(PathSearch, longWall, { x: 0, y: 1, z: 0 }, { x: 12, y: 1, z: 0 }, 120, 24);
    const h = run(LegacySearch, longWall, { x: 0, y: 1, z: 0 }, { x: 12, y: 1, z: 0 }, 120, 24);
    ok(h.status === "budget", "A*: legacy gives up when the budget runs out");
    const end = g.path[g.path.length - 1];
    ok(g.status === "partial" && end && Math.hypot(end.x - 12, end.z) <= 12 - 3, `A*: new search returns a best-effort partial route instead (${g.status})`);
    // Truly unreachable: still reported as such (no fake progress).
    const sealed = (x, y, z) => (y <= 0 ? STONE : (x === 2) ? STONE : AIR);
    const u = run(PathSearch, sealed, { x: 0, y: 1, z: 0 }, { x: 8, y: 1, z: 0 }, 400, 24);
    ok(u.status !== "found" && u.status !== "partial", `A*: sealed-off goal still fails honestly (${u.status})`);
}
{
    // Budget sanity: expansions per long trip with the new runtime budgets
    // (1200 nodes / radius 24) vs the old (2000 / 32).
    const rough = randomWorld(99);
    const terrainFn = (x, y, z) => (y <= 0 ? STONE : y === 1 && (Math.abs(x * 31 + z * 17) % 9 === 0) ? STONE : AIR);
    void rough;
    const a = run(PathSearch, terrainFn, { x: 0, y: 1, z: 0 }, { x: 60, y: 1, z: 4 }, 1200, 24, {}, true);
    const b = run(LegacySearch, terrainFn, { x: 0, y: 1, z: 0 }, { x: 60, y: 1, z: 4 }, 2000, 32, {}, true);
    ok(a.status === "partial", "A*: long trip makes rolling-horizon progress with the small budget");
    ok(a.reads <= b.reads, `A*: long-trip segment block reads ${b.reads} -> ${a.reads}`);
}

// ------------------------------------------------------------ Terrain cache
function fakeDimension(fn) {
    const stats = { getBlock: 0, props: 0, entities: 0 };
    const dim = {
        stats,
        getBlock(p) {
            stats.getBlock++;
            const c = fn(p.x, p.y, p.z);
            const type = c.type;
            return {
                get typeId() { stats.props++; return type; },
                get isAir() { stats.props++; return type === "minecraft:air"; },
                get isLiquid() { stats.props++; return /water|lava/.test(type); },
                get isSolid() { stats.props++; return c.support; },
                location: { ...p },
            };
        },
        getEntities() { stats.entities++; return []; },
    };
    return dim;
}
{
    const worldFn = (x, y, z) => (y <= 0 ? STONE : x === 3 && y === 1 ? WATER : (x === -2 && z === 1 && y === 1 ? { ...STONE, type: "minecraft:crafting_table" } : AIR));
    const dim = fakeDimension(worldFn);
    const t = new Terrain(dim);
    t.begin(100);
    for (let i = 0; i < 50; i++) t.waterNear({ x: 2, y: 1, z: 0 });
    const afterWater = dim.stats.getBlock + dim.stats.props;
    ok(t.waterNear({ x: 2, y: 1, z: 0 }) === true, "terrain: waterNear finds adjacent water");
    ok(afterWater <= 12, `terrain: 50x waterNear costs ${afterWater} native calls (was ~${50 * 7 * 3})`);

    const before = dim.stats.getBlock + dim.stats.props;
    for (let i = 0; i < 50; i++) t.tableNear({ x: 0.5, y: 1, z: 0.5 });
    const tableCost = dim.stats.getBlock + dim.stats.props - before;
    ok(t.tableNear({ x: 0.5, y: 1, z: 0.5 }) === true, "terrain: tableNear finds the table");
    ok(tableCost < 150, `terrain: 50x tableNear costs ${tableCost} native calls (was ~${50 * 100 * 2})`);

    // Air cells never read isSolid/isLiquid
    const d2 = fakeDimension(flat), t2 = new Terrain(d2);
    t2.begin(1);
    const c = t2.read({ x: 0, y: 5, z: 0 });
    ok(c.passable && !c.support && !c.hazard && d2.stats.props === 1, "terrain: an air cell costs exactly 1 property read (lazy Cell)");

    // Snapshot expiry and invalidate
    t2.begin(1);
    const reads0 = d2.stats.getBlock;
    t2.safe({ x: 0, y: 1, z: 0 });
    t2.safe({ x: 0, y: 1, z: 0 });
    ok(d2.stats.getBlock - reads0 <= 3, "terrain: safe() re-reads come from cache");
    t2.invalidate({ x: 0, y: 1, z: 0 });
    const r1 = d2.stats.getBlock;
    t2.read({ x: 0, y: 1, z: 0 });
    ok(d2.stats.getBlock === r1 + 1, "terrain: invalidate() forces a fresh native read");

    // threatInfo: one entity query per tick for any number of callers
    const d3 = fakeDimension(flat), t3 = new Terrain(d3);
    let now = 10;
    t3.clock = () => now;
    const bot = { location: { x: 0, y: 1, z: 0 } };
    for (let i = 0; i < 8; i++) t3.threatInfo(bot, undefined);
    ok(d3.stats.entities === 1, "terrain: 8 threatInfo() calls in one tick = 1 entity query");
    now = 11; t3.threatInfo(bot, undefined); now = 12; t3.threatInfo(bot, undefined);
    ok(d3.stats.entities === 1, "terrain: clear area re-queried at most every 3 ticks");
    now = 13; t3.threatInfo(bot, undefined);
    ok(d3.stats.entities === 2, "terrain: ...and refreshed after that");
    const info = t3.threatInfo(bot, undefined);
    info.list.push("x"); info.count = 99;
    ok(t3.threatInfo(bot, undefined).count === 0 && t3.threatInfo(bot, undefined).list.length === 0, "terrain: callers mutating threatInfo can not poison the cache");
}
{
    // scanOres: nearest-first, no per-call point build/sort
    const ore = (x, y, z) => (x === 2 && y === 0 && z === 1 ? { ...STONE, type: "minecraft:iron_ore" } : x === -4 && y === 1 && z === 0 ? { ...STONE, type: "minecraft:iron_ore" } : y <= 0 ? STONE : AIR);
    const t = new Terrain(fakeDimension(ore));
    t.begin(1);
    const found = t.scanOres({ x: 0.5, y: 1, z: 0.5 }, 6, (type) => type === "minecraft:iron_ore", 2000);
    ok(found.length === 2 && found[0].x === 2, "terrain: scanOres finds ores nearest first");

    // BlockScan uses the snapshot path
    const scan = new BlockScan({ x: 0, y: 1, z: 0 }, 6);
    const hit = scan.next(t, (type) => type === "minecraft:iron_ore", 5000);
    ok(hit && hit.x === 2 && hit.z === 1, "terrain: BlockScan finds the nearest ore via cached reads");

    // RollingSweep: nearest-first, bounded per step, covers everything
    const sw = new RollingSweep(6, -2, 2, 50, 24);
    const seen = [];
    let steps = 0, res;
    do { res = sw.step(t, { x: 0, y: 1, z: 0 }, (type, p) => { if (type === "minecraft:iron_ore") seen.push(p); }); steps++; } while (!res.finished && steps < 1000);
    ok(res.finished && seen.length === 2, `sweep: full coverage in ${steps} bounded steps, found both ores`);
    ok(seen[0].x === 2, "sweep: nearest ore visited first");
}

// ----------------------------------------------------------------- Bag cache
function fakePlayer(slots) {
    const stats = { component: 0, getItem: 0, durability: 0, food: 0 };
    const item = (typeId, amount, extra = {}) => ({
        typeId, amount, maxAmount: extra.dur !== undefined ? 1 : 64,
        getComponent(name) {
            if (name === "minecraft:durability") { stats.durability++; return extra.dur !== undefined ? { maxDurability: 60, damage: 60 - extra.dur } : undefined; }
            if (name === "minecraft:food") { stats.food++; return extra.food ? { nutrition: extra.food } : undefined; }
            return undefined;
        },
        isStackableWith(o) { return o.typeId === typeId; },
        clone() { return item(typeId, amount, extra); },
    });
    const container = {
        size: slots.length,
        emptySlotsCount: slots.filter((s) => !s).length,
        getItem(i) { stats.getItem++; const s = slots[i]; return s ? item(...s) : undefined; },
        setItem(i, s) { slots[i] = s ? [s.typeId, s.amount] : undefined; },
        swapItems(a, b) { const t = slots[a]; slots[a] = slots[b]; slots[b] = t; },
    };
    return {
        stats, slots,
        selectedSlotIndex: 0,
        getComponent() { stats.component++; return { container }; },
    };
}
{
    const slots = new Array(36).fill(undefined);
    slots[0] = ["minecraft:cobblestone", 32];
    slots[3] = ["minecraft:bread", 5, { food: 5 }];
    slots[12] = ["minecraft:stone_pickaxe", 1, { dur: 40 }];
    slots[20] = ["minecraft:wooden_sword", 1, { dur: 1 }];
    slots[21] = ["minecraft:cobblestone", 10];
    const pl = fakePlayer(slots);
    const bag = new Bag(pl);
    let tick = 5;
    bag.clock = () => tick;

    for (let i = 0; i < 10; i++) { bag.counts(); bag.usableCounts(); bag.food(false); bag.hasFood(); bag.find((s) => s.typeId === "x"); }
    ok(pl.stats.getItem === 36 && pl.stats.component === 1, `bag: 50 inventory scans in one tick = 36 getItem + 1 component (got ${pl.stats.getItem} + ${pl.stats.component})`);
    ok(bag.counts()["minecraft:cobblestone"] === 42, "bag: counts() correct");
    const u = bag.usableCounts();
    ok(u["minecraft:wooden_sword"] === 0 && u["minecraft:stone_pickaxe"] === 1, "bag: usableCounts() drops nearly-broken tools");
    const c1 = bag.counts(); c1["minecraft:cobblestone"] = 0;
    ok(bag.counts()["minecraft:cobblestone"] === 42, "bag: mutating a counts() result does not poison the cache");

    ok(bag.hasTool("pickaxe", 1) && pl.selectedSlotIndex === 0, "bag: hasTool() answers without selecting a slot");
    ok(bag.findTool("sword") === -1, "bag: findTool() skips a sword with 1 durability left");

    bag.set(0, undefined);
    ok(bag.counts()["minecraft:cobblestone"] === 10, "bag: set() invalidates the snapshot immediately");

    tick = 6;
    const g0 = pl.stats.getItem;
    bag.counts();
    ok(pl.stats.getItem === g0 + 36, "bag: a new tick re-reads the inventory once");

    const f0 = pl.stats.food;
    tick = 7; bag.food(false); tick = 8; bag.food(false); tick = 9; bag.food(false);
    ok(pl.stats.food === f0, "bag: food nutrition is cached per item type");

    const noClock = new Bag(fakePlayer([["minecraft:dirt", 1]]));
    noClock.clock = () => NaN;
    noClock.counts(); noClock.counts();
    ok(noClock.player.stats.getItem === 2, "bag: without a numeric clock nothing is cached (offline-safe)");
}

// ------------------------------------------------------------------ Arbiter
{
    const calls = { follow: 0, combat: 0, navReset: 0, threat: 0 };
    const bot = {
        mode: "follow",
        settings: { loot: false, speedrun: false },
        sim: { location: { x: 0, y: 64, z: 0 }, isInWater: false, getComponent: () => ({ currentValue: 20 }) },
        owner: () => ({ location: { x: 30, y: 64, z: 0 } }),
        terrain: {
            threatInfo: () => { calls.threat++; return { count: 1, nearest: { typeId: "minecraft:zombie" }, closest: 6, list: [] }; },
            read: () => ({ hazard: false }),
            headInWater: () => false,
        },
        nav: { stuck: false, reset: () => calls.navReset++ },
        follow: () => calls.follow++,
        combat: { tick: () => { calls.combat++; return false; } },
        survivalMaster: { fallStartY: null },
        miner: { active: false }, deepMiner: { active: false },
        record: () => {},
    };
    const arb = new Arbiter(bot);
    let deferred = 0;
    for (let t = 0; t < 200; t += 5) { const r = arb.tick(t); if (r.code === DEFERRED) deferred++; }
    ok(calls.follow === 0 && calls.combat === 0, "arbiter: never calls follow()/combat.tick() with a tick as the target");
    ok(calls.navReset === 0, "arbiter: never resets the navigator (old adapters did, every 5 ticks)");
    ok(deferred === 40, "arbiter: mission/combat picks are deferred to the main loop");
    ok(calls.threat <= 10, `arbiter: ${calls.threat} threat queries for 40 ticks (re-evaluates every 20 ticks, never twice)`);

    // A director that returns false falls back without a second evaluate()
    let evals = 0;
    const arb2 = new Arbiter(bot);
    const realEval = arb2.evaluate.bind(arb2);
    arb2.evaluate = (t) => { evals++; const c = realEval(t); c.unshift({ id: "food", director: { tick: () => false }, score: 99, tags: [] }); arb2.evaluations = c; return c; };
    arb2.tick(0);
    ok(evals === 1 && arb2.current && arb2.current.id !== "food", "arbiter: 'not handled' falls back using the existing evaluation");

    // Throwing director: logged once, no per-tick spam
    const warn = console.warn; let warns = 0; console.warn = () => warns++;
    const arb3 = new Arbiter(bot);
    for (let t = 0; t < 100; t++) { arb3.current = { id: "boom", director: { tick: () => { throw new Error("x"); } }, score: 1, tags: [] }; arb3.lastEvaluate = t; arb3.tick(t); }
    console.warn = warn;
    ok(warns <= 3, `arbiter: a director throwing 100x logs ${warns}x (was 100x)`);
}

// ---------------------------------------------------------------- Navigator
{
    const moves = [];
    const sim = {
        location: { x: 0.5, y: 1, z: 0.5 }, isInWater: false, isOnGround: true, isSprinting: false,
        getComponent: () => ({ currentValue: 20 }),
        moveToLocation: (p) => moves.push(p), stopMoving: () => {}, jump: () => {},
    };
    const host = { relative: (p) => p };
    const t = new Terrain(fakeDimension(flat));
    t.begin(1);
    const nav = new Navigator(sim, host, t);
    const r = nav.go({ x: 4.5, y: 1, z: 2.5 }, 1);
    ok(r === "running" && !nav.search && nav.direct && moves.length === 1, "nav: short clear hop walks directly (no A* search allocated)");
    nav.reset();
    const wallWorld = (x, y, z) => (y <= 0 ? STONE : x === 2 && y <= 2 ? STONE : AIR);
    const t2 = new Terrain(fakeDimension(wallWorld)); t2.begin(1);
    const nav2 = new Navigator(sim, host, t2);
    nav2.go({ x: 4.5, y: 1, z: 0.5 }, 1);
    ok(!nav2.direct && nav2.search, "nav: blocked straight line falls back to A*");
    ok(nav2.search.maxNodes === 1200 && nav2.search.radius === 24, "nav: normal search budget 1200 nodes / radius 24 (was 2000 / 32)");
    const nav3 = new Navigator(sim, host, t2);
    nav3.go({ x: 1.5, y: 40, z: 0.5 }, 1);
    ok(nav3.search && nav3.search.maxNodes === 1500 && nav3.search.radius === 48, "nav: tower search 1500 / 48 only when the goal is overhead (was 3000 / 64)");
    const t4 = new Terrain(fakeDimension(flat)); t4.begin(1);
    const nav4 = new Navigator(sim, host, t4);
    nav4.go({ x: 30.5, y: 1, z: 0.5 }, 1);
    const firstSearch = nav4.search; let replans = nav4.replans;
    for (let tick = 2; tick < 60; tick++) nav4.go({ x: 30.5 + tick * 0.1, y: 1, z: 0.5 }, tick);
    ok(nav4.replans - replans <= 1, `nav: goal drifting 6 blocks over 3s causes ${nav4.replans - replans} replans (was ~4)`);
    void firstSearch;
}

// ------------------------------------------------------------------- danger
{
    let reads = 0;
    const world = { block(x, y, z) { reads++; return y <= 0 ? { solid: true, liquid: null, passable: false } : (x === 3 && y === 1 ? { solid: false, liquid: "lava", passable: false } : { solid: false, liquid: null, passable: true }); } };
    const cells = [];
    for (let x = -5; x <= 5; x++) for (let z = -5; z <= 5; z++) cells.push({ x, y: 1, z });
    reads = 0;
    const plain = cells.map((p) => pathPenalty(world, p, []));
    const plainReads = reads;
    reads = 0;
    const map = dangerMap(world, []);
    const fast = cells.map((p) => map.penalty(p));
    const mapReads = reads;
    ok(plain.every((v, i) => v === fast[i]), "danger: dangerMap gives identical penalties");
    ok(mapReads < plainReads / 2, `danger: dangerMap block reads ${plainReads} -> ${mapReads}`);
    ok(cellDanger(world, { x: 2, y: 1, z: 0 }, []).parts.lava > 0, "danger: lava adjacency still scored");
}

console.log(`\nperf.test: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
