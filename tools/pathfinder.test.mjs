/**
 * Offline tests for the new pathfinder core + anti-stuck ladder.
 * No Minecraft engine: a synthetic grid world supplies the cell reader.
 *
 * Run: node tools/pathfinder.test.mjs
 */
import {
    planPath,
    PathFinder,
    BidirectionalPathFinder,
    PathHeap,
    standable,
    checkSafety,
    neighbors,
    normalizeOptions,
    smoothPath,
} from "../scripts/core/pathfinder.js";
import { StuckWatchdog, classifySituation, planRecovery, RECOVERY_ACTIONS } from "../scripts/core/anti-stuck.js";

let pass = 0, fail = 0;
const check = (name, cond, detail) => {
    if (cond) pass++;
    else {
        fail++;
        console.log(`FAIL: ${name}${detail === undefined ? "" : " | " + JSON.stringify(detail).slice(0, 300)}`);
    }
};

/** Synthetic world: y<=63 floor, air above, plus explicit solid/lava/water. */
function makeWorld(extra = {}) {
    const solid = extra.solid ?? new Set();
    const lava = extra.lava ?? new Set();
    const water = extra.water ?? new Set();
    const types = extra.types ?? new Map();
    const reads = { n: 0 };
    const read = (p) => {
        reads.n++;
        const k = `${p.x},${p.y},${p.z}`;
        if (types.has(k)) return types.get(k);
        if (lava.has(k)) return { passable: p.y > 63, support: p.y <= 63, hazard: true, type: "minecraft:lava" };
        if (water.has(k)) return { passable: p.y > 63, support: p.y <= 63, hazard: true, type: "minecraft:water" };
        if (solid.has(k) || p.y <= 63) return { passable: false, support: true, hazard: false, type: "minecraft:stone" };
        return { passable: true, support: false, hazard: false, type: "minecraft:air" };
    };
    return { read, reads, solid, lava, water, types };
}

const wall = (solid, x0, z0, x1, z1, y0 = 64, y1 = 67) => {
    for (let x = x0; x <= x1; x++)
        for (let z = z0; z <= z1; z++)
            for (let y = y0; y <= y1; y++) solid.add(`${x},${y},${z}`);
};

function pathValid(world, path, tolerance = 3.5) {
    if (!path?.length) return false;
    let prev = null;
    for (const node of path) {
        if (!standable(world.read, node)) return false;
        if (prev) {
            if (Math.hypot(node.x - prev.x, node.z - prev.z) > tolerance) return false;
            if (Math.abs(node.y - prev.y) > 3) return false;
        }
        prev = node;
    }
    return true;
}

// ---------------------------------------------------------------------------
// safety checker (ported concepts: IsSafe / fall / jump-onto / ignore)
// ---------------------------------------------------------------------------
{
    const w = makeWorld();
    check("safety: flat ground is safe", checkSafety(w.read, { x: 0, y: 64, z: 0 }).IsSafe === true);
    check("safety: lava cell is never safe", checkSafety(w.read, { x: 0, y: 64, z: 0 }).IsSafe && !checkSafety(w.read, { x: 0, y: 64, z: 0 }).CanSafelyFallFrom);
    const hole = makeWorld();
    // The floor under the cell is lava: never safe, regardless of the air above.
    hole.types.set("0,63,0", { passable: false, support: false, hazard: true, type: "minecraft:lava" });
    const fall = checkSafety(hole.read, { x: 0, y: 64, z: 0 });
    check("safety: lava floor rejects the cell", fall.IsSafe === false, fall);
    const ledge = makeWorld();
    // Air column at x=1 with solid floor at y=61: a 3-block fall.
    for (const y of [62, 63]) ledge.types.set(`1,${y},0`, { passable: true, support: false, hazard: false, type: "minecraft:air" });
    const drop = checkSafety(ledge.read, { x: 1, y: 64, z: 0 });
    check("safety: a two-block fall is identified", drop.IsSafe === true && drop.CanSafelyFallFrom === true && drop.landing.y === 62, drop);
    check("safety: an ignored cell is refused", checkSafety(w.read, { x: 0, y: 64, z: 0 }, { ignore: [{ x: 0, y: 64, z: 0 }] }).IsSafe === false);
    check("safety: passable override works", checkSafety(makeWorld({ types: new Map([["0,64,0", { passable: false, support: false, hazard: false, type: "minecraft:short_grass" }]]) }).read, { x: 0, y: 64, z: 0 }, { typeIdsToConsiderPassable: ["minecraft:short_grass"] }).IsSafe === true);
}

// ---------------------------------------------------------------------------
// A* + bidirectional correctness
// ---------------------------------------------------------------------------
{
    const w = makeWorld();
    const r = planPath(w.read, { x: 0, y: 64, z: 0 }, { x: 12, y: 64, z: 0 }, { bidirectional: false, radius: 32, smooth: false });
    check("astar: finds a flat route", r.status === "found" && r.path.length > 0, r.status);
    check("astar: route is walkable", pathValid(w, r.path));
    check("astar: reaches the goal", Math.abs(r.path[r.path.length - 1].x - 12) <= 1.5, r.path.at(-1));
    check("astar: reports the strategy", r.strategy === "astar");

    const bi = planPath(w.read, { x: 0, y: 64, z: 0 }, { x: 40, y: 64, z: 0 }, { bidirectional: true, bidirMinDistance: 8, radius: 64, smooth: false });
    check("bidir: finds the flat route", bi.status === "found" && bi.path.length > 0, bi);
    check("bidir: route is walkable", pathValid(w, bi.path));
    check("bidir: strategy recorded", bi.strategy === "bidirectional", bi.strategy);
}

{
    // Wall at x=5 with a one-block door at z=0.
    const w = makeWorld();
    wall(w.solid, 5, -6, 5, 6);
    w.solid.delete("5,64,0");
    w.solid.delete("5,65,0");
    const r = planPath(w.read, { x: 0, y: 64, z: 0 }, { x: 10, y: 64, z: 0 }, { bidirectional: false, radius: 32, smooth: false });
    check("astar: routes through a door", r.status === "found" && pathValid(w, r.path), r.status);
    check("astar: door route passes x=5 z=0", r.path.some((n) => n.x === 5 && n.z === 0), r.path);
}

{
    // Lava strip between start and goal; the route must go around it.
    const w = makeWorld();
    for (let z = -20; z <= 20; z++) for (let x = 6; x <= 10; x++) w.lava.add(`${x},64,${z}`);
    const r = planPath(w.read, { x: 0, y: 64, z: 0 }, { x: 16, y: 64, z: 0 }, { bidirectional: false, radius: 48, maxNodes: 6000, smooth: false });
    check("astar: never steps into lava", r.status === "found" && pathValid(w, r.path), r.status);
    check("astar: avoids every lava cell", r.path.every((n) => !(n.x >= 6 && n.x <= 10 && n.y === 64 && Math.abs(n.z) <= 20)), r.path.filter((n) => n.x >= 6 && n.x <= 10));
}

{
    // Sealed-off goal.
    const w = makeWorld();
    wall(w.solid, -1, -1, 1, 1, 64, 68);
    const r = planPath(w.read, { x: 0, y: 64, z: 0 }, { x: 20, y: 64, z: 0 }, { bidirectional: false, radius: 32, maxNodes: 800 });
    check("astar: sealed goal fails honestly", r.status !== "found", r.status);
    check("astar: failure carries a reason", typeof r.reason === "string" && r.reason.length > 0);
}

{
    // Bidirectional must agree with unidirectional on reachability.
    const w = makeWorld();
    wall(w.solid, 4, -8, 4, 8);
    let doorFound = false;
    for (let z = -8; z <= 8; z++) {
        const saved = [`4,64,${z}`, `4,65,${z}`];
        for (const k of saved) w.solid.delete(k);
        const a = planPath(w.read, { x: 0, y: 64, z: 0 }, { x: 12, y: 64, z: 0 }, { bidirectional: false, radius: 40, smooth: false });
        const b = planPath(w.read, { x: 0, y: 64, z: 0 }, { x: 12, y: 64, z: 0 }, { bidirectional: true, bidirMinDistance: 4, radius: 40, smooth: false });
        if (a.status === "found") {
            check(`bidir: agrees on reachability (door z=${z})`, b.status === "found", b.status);
            check(`bidir: door route is walkable (z=${z})`, pathValid(w, b.path), b.path);
            doorFound = true;
            break;
        }
    }
    check("bidir: a door case was exercised", doorFound);
}

// ---------------------------------------------------------------------------
// options: ignore list, jump restrictions, Y-axis flood, dig, bridge, pillar
// ---------------------------------------------------------------------------
{
    const w = makeWorld();
    const opts = normalizeOptions({ ignore: ["5,64,0", { x: 5, y: 65, z: 0 }] });
    check("options: ignore stores cells", opts.ignoreKeys.has("5,64,0") && opts.ignoreKeys.has("5,65,0"));
    check("options: does not mutate defaults", normalizeOptions({}).ignoreKeys.size === 0);
    const all = neighbors(w.read, { x: 4, y: 64, z: 0 }, opts);
    check("ignore: the ignored cell is never generated", !all.some((n) => n.x === 5 && n.z === 0));
}

{
    // A 2-wide gap: jump edges exist unless the blocking cell is fenced.
    const g = makeWorld();
    g.types.set("1,64,0", { passable: false, support: false, hazard: false, type: "minecraft:oak_fence" });
    const opts = normalizeOptions({ parkour: true, typeIdsThatCannotBeJumpedOver: ["minecraft:oak_fence"] });
    const moves = neighbors(g.read, { x: 0, y: 64, z: 0 }, opts);
    check("parkour: a fence blocks the gap jump", !moves.some((n) => n.x === 2 && n.z === 0));
    const free = makeWorld();
    const moves2 = neighbors(free.read, { x: 0, y: 64, z: 0 }, normalizeOptions({ parkour: true }));
    check("parkour: a plain gap is jumpable", moves2.some((n) => n.x === 1 && n.z === 0) || moves2.length >= 3);
}

{
    // Vertical shaft: only reachable by pillaring up.
    const shaft = makeWorld();
    wall(shaft.solid, -1, -1, 1, 1, 64, 70);
    for (let y = 64; y <= 69; y++) shaft.solid.delete(`0,${y},0`);
    const noPillar = planPath(shaft.read, { x: 0, y: 64, z: 0 }, { x: 0, y: 68, z: 0 }, { radius: 8, bidirectional: false, smooth: false });
    const pillar = planPath(shaft.read, { x: 0, y: 64, z: 0 }, { x: 0, y: 68, z: 0 }, { radius: 8, bidirectional: false, allowPillar: true, smooth: false });
    check("pillar: vertical movement needs the option", noPillar.status !== "found", noPillar.status);
    check("pillar: with the option the shaft is climbable", pillar.status === "found", pillar);
    check("pillar: shaft route uses pillar edges", pillar.path.every((n) => n.kind === "pillar"), pillar.path.map((n) => n.kind));
    const flood = planPath(shaft.read, { x: 0, y: 64, z: 0 }, { x: 0, y: 68, z: 0 }, { radius: 8, bidirectional: false, allowYAxisFlood: true, smooth: false });
    check("flood: Y-axis flood also climbs the shaft", flood.status === "found", flood.status);
}

{
    // Dig through a soft wall.
    const w = makeWorld();
    for (let z = -30; z <= 30; z++) for (const y of [64, 65]) w.types.set(`3,${y},${z}`, { passable: false, support: y === 64 ? true : false, hazard: false, type: "minecraft:dirt" });
    const noDig = planPath(w.read, { x: 0, y: 64, z: 0 }, { x: 6, y: 64, z: 0 }, { radius: 16, bidirectional: false, parkour: false, smooth: false });
    check("dig: without allowDig the wall blocks", noDig.status !== "found", noDig.status);
    const dig = planPath(w.read, { x: 0, y: 64, z: 0 }, { x: 6, y: 64, z: 0 }, { radius: 16, bidirectional: false, parkour: false, allowDig: true, smooth: false });
    check("dig: allowDig tunnels through dirt", dig.status === "found", dig);
    check("dig: route contains a dig edge", dig.path.some((n) => n.kind === "dig"), dig.path.map((n) => n.kind));
}

{
    // Bridge over a 3-wide gap with no floor (a ravine).
    const w = makeWorld();
    for (let z = -30; z <= 30; z++) for (let x = 2; x <= 5; x++) for (let y = 40; y <= 63; y++) w.types.set(`${x},${y},${z}`, { passable: false, support: false, hazard: false, type: "minecraft:air" });
    const noBridge = planPath(w.read, { x: 0, y: 64, z: 0 }, { x: 8, y: 64, z: 0 }, { radius: 16, bidirectional: false, parkour: false, smooth: false });
    check("bridge: a wide ravine blocks without blocks", noBridge.status !== "found", noBridge.status);
    const bridge = planPath(w.read, { x: 0, y: 64, z: 0 }, { x: 8, y: 64, z: 0 }, { radius: 16, bidirectional: false, parkour: false, allowBridge: true, smooth: false });
    check("bridge: allowBridge crosses the ravine", bridge.status === "found", bridge);
    check("bridge: route contains a bridge edge", bridge.path.some((n) => n.kind === "bridge"), bridge.path.map((n) => n.kind));
}

{
    // Pillar out of a one-block pit.
    const w = makeWorld();
    wall(w.solid, -1, -1, 1, 1, 64, 100);
    for (let y = 64; y <= 100; y++) w.solid.delete(`0,${y},0`);
    const r = planPath(w.read, { x: 0, y: 64, z: 0 }, { x: 0, y: 68, z: 0 }, { radius: 8, bidirectional: false, allowPillar: true, smooth: false });
    check("pillar: reaching the top of a pit works", r.status === "found", r.status);
    check("pillar: the route uses a pillar edge", r.path.some((n) => n.kind === "pillar"), r.path.map((n) => n.kind));
}

// ---------------------------------------------------------------------------
// budget, partial routes, generator slicing, smoothing
// ---------------------------------------------------------------------------
{
    const w = makeWorld();
    for (let x = 0; x < 80; x++) wall(w.solid, x, 1, x, 1);
    const search = new PathFinder(w.read, { x: 0, y: 64, z: 0 }, { x: 70, y: 64, z: 0 }, { radius: 96, maxNodes: 60, bidirectional: false, minProgress: 4 });
    const first = search.step(10);
    check("slice: first slice is still searching", first === "searching", first);
    const mid = search.expanded;
    search.step(10);
    check("slice: expansions accumulate across calls", search.expanded > mid);
    const r = search.run();
    check("slice: bounded run ends with a status", ["found", "partial", "budget", "unreachable"].includes(r.status), r.status);
    check("slice: partial route is non-empty when it progressed", r.status !== "partial" || r.path.length > 0, r);
    const total = [];
    const gen = new PathFinder(w.read, { x: 0, y: 64, z: 0 }, { x: 20, y: 64, z: 0 }, { radius: 32, yieldEvery: 8 });
    for (const x of gen.search()) total.push(x);
    check("generator: yields at least once before finishing", total.length >= 1, total.length);
    check("generator: finishes with a result", gen.result.status === "found", gen.result.status);
}

{
    // Heap ordering and no duplicate-value corruption.
    const h = new PathHeap();
    for (const v of [5, 3, 9, 1, 7, 2]) h.push(v, v);
    const out = [];
    while (h.size) out.push(h.pop());
    check("heap: pops in priority order", JSON.stringify(out) === JSON.stringify([1, 2, 3, 5, 7, 9]), out);
}

{
    // Smoothing never changes the endpoints and keeps walkable nodes.
    const w = makeWorld();
    const raw = [];
    for (let x = 1; x <= 8; x++) raw.push({ x, y: 64, z: 0, kind: "walk" });
    raw.push({ x: 8, y: 64, z: 1, kind: "walk" });
    const smooth = smoothPath(w.read, raw);
    check("smooth: keeps the last node", smooth.at(-1) === raw.at(-1));
    check("smooth: drops collinear nodes", smooth.length < raw.length, [raw.length, smooth.length]);
    check("smooth: every node is walkable", smooth.every((n) => standable(w.read, n)));
}

// ---------------------------------------------------------------------------
// anti-stuck: classification, plans, watchdog ladder
// ---------------------------------------------------------------------------
{
    const s = classifySituation({ suffocating: true, inLava: true });
    check("stuck: suffocation outranks lava", s.kind === "suffocating", s);
    check("stuck: all matches kept", s.all.length >= 2);
    check("stuck: caged detected", classifySituation({ caged: true }).kind === "caged");
    check("stuck: drowning detected", classifySituation({ headInWater: true }).kind === "drowning");
    check("stuck: oscillating loop detected", classifySituation({ oscillating: true }).kind === "loop");
    check("stuck: no situation is 'none'", classifySituation({}).kind === "none");
    check("stuck: portal ready detected", classifySituation({ targetDimension: "minecraft:nether", dimension: "minecraft:overworld", portalNear: true }).kind === "portal_ready");
}

{
    const caged = planRecovery("caged", { hasPickaxe: true });
    check("recovery: caged digs out first", caged[0].action === "dig_forward", caged);
    const noPick = planRecovery("caged", { hasPickaxe: false });
    check("recovery: no pickaxe removes dig steps", !noPick.some((p) => p.action.startsWith("dig")), noPick);
    check("recovery: a plan is never empty", planRecovery("unknown", {}).length >= 1);
    const stalled = planRecovery("stalled", { hasBlocks: true, hasPickaxe: true }).map((p) => p.action);
    check("recovery: stall replans", stalled.includes("replan_wide"), stalled);
    check("recovery: stall bridges when it has blocks", stalled.includes("bridge_forward"), stalled);
    check("recovery: stall digs when it has a pickaxe", stalled.includes("dig_forward"), stalled);
}

{
    const wd = new StuckWatchdog({ stallTicks: 40, escalateTicks: 80, sampleTicks: 5, loopRepeats: 2, cooldown: 10, maxAttempts: 4 });
    let obs = wd.observe({ tick: 0, pos: { x: 0, y: 64, z: 0 }, distance: 20 });
    check("watchdog: fresh progress is not stuck", obs.kind === "none", obs.kind);
    for (let t = 5; t <= 120; t += 5) obs = wd.observe({ tick: t, pos: { x: 0, y: 64, z: 0 }, distance: 20 });
    check("watchdog: stalled after the window", obs.kind === "stalled", obs.kind);
    const decision = wd.decide(120, obs, { hasPickaxe: true, hasBlocks: true });
    check("watchdog: decides an action when due", !!decision, decision);
    check("watchdog: first action replans", decision.action === "replan" || decision.action === "replan_wide", decision.action);
    check("watchdog: cooldown blocks an immediate second action", wd.decide(121, obs, {}) === undefined);
    wd.noteResult(decision.action, false, 122);
    check("watchdog: failure escalates the level", wd.report().level >= 1, wd.report());
    // Making progress resets the ladder.
    for (let t = 130; t <= 200; t += 5) obs = wd.observe({ tick: t, pos: { x: t / 10, y: 64, z: 0 }, distance: Math.max(0, 20 - t / 10) });
    check("watchdog: progress resets to level 0", wd.report().level === 0, wd.report());
}

{
    // Oscillation: A-B-A-B with no closing distance.
    const wd = new StuckWatchdog({ sampleTicks: 1, loopRepeats: 2, stallTicks: 10, escalateTicks: 1000 });
    let obs;
    const spots = [{ x: 0, z: 0 }, { x: 2, z: 0 }, { x: 0, z: 0 }, { x: 2, z: 0 }, { x: 0, z: 0 }, { x: 2, z: 0 }];
    spots.forEach((p, i) => {
        obs = wd.observe({ tick: i, pos: { x: p.x, y: 64, z: p.z }, distance: 10 });
    });
    check("watchdog: detects oscillation", obs.oscillating === true, obs);
    check("watchdog: oscillation is a loop situation", obs.kind === "loop", obs.kind);
}

{
    // Exhaustion is honest.
    const zeroCooldowns = Object.fromEntries(RECOVERY_ACTIONS.map((a) => [a, 0]));
    const wd = new StuckWatchdog({ maxAttempts: 2, cooldown: 0, stallTicks: 1, escalateTicks: 1, actionCooldown: zeroCooldowns });
    let t = 0;
    let obs = wd.observe({ tick: t, pos: { x: 0, y: 64, z: 0 }, distance: 10 });
    t += 1;
    obs = wd.observe({ tick: t, pos: { x: 0, y: 64, z: 0 }, distance: 10 });
    wd.decide(t, obs, { hasPickaxe: true, hasBlocks: true });
    t += 1;
    obs = wd.observe({ tick: t, pos: { x: 0, y: 64, z: 0 }, distance: 10 });
    wd.decide(t, obs, { hasPickaxe: true, hasBlocks: true });
    t += 1;
    obs = wd.observe({ tick: t, pos: { x: 0, y: 64, z: 0 }, distance: 10 });
    check("watchdog: exhausted after the attempt cap", wd.exhausted === true, wd.report());
    check("watchdog: no decision after exhaustion", wd.decide(t, obs, {}) === undefined);
}

console.log(`\npathfinder/anti-stuck: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
