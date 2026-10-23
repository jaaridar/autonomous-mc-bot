// Bidirectional A*, block-safety checker, unstuck policy, portal entry plan.
import { PathSearch } from "../scripts/core/navigation.js";
import {
    AStarOptions, BidirectionalPathSearch, blockSafetyCheck, chooseSearchMode,
    relabelPath, unstuckAction,
} from "../scripts/core/pathfinder.js";
import { planPortalEntry, verifyPortalAction } from "../scripts/core/nether-strategy.js";
import { CANNOT_JUMP_OVER_RE, SLOW_TERRAIN_RE } from "../scripts/core/blocks.js";

let pass = 0, fail = 0;
const ok = (cond, name) => {
    if (cond) { pass++; console.log("pass " + name); }
    else { fail++; console.log("FAIL " + name); }
};

const AIR = { passable: true, support: false, hazard: false, type: "minecraft:air", isAir: true };
const STONE = { passable: false, support: true, hazard: false, type: "minecraft:stone", isAir: false };
const LAVA = { passable: false, support: false, hazard: true, type: "minecraft:lava", isAir: false };
const WATER = { passable: false, support: false, hazard: true, type: "minecraft:water", isAir: false };
const FENCE = { passable: false, support: true, hazard: false, type: "minecraft:oak_fence", isAir: false };

const flat = (x, y, z) => (y <= 0 ? STONE : AIR);
const readOf = (fn) => (p) => fn(p.x, p.y, p.z);

function run(Search, worldFn, start, goal, maxNodes = 2000, radius = 32, opts = {}, allowPartial = false) {
    const s = new Search(readOf(worldFn), start, goal, 0.7, true, maxNodes, radius, allowPartial, [], opts);
    let r;
    for (let i = 0; i < 400 && (r = s.step(120)) === "searching"; i++);
    return { status: r, path: s.path, expanded: s.expanded };
}

// -------------------------------------------------------------- search mode
ok(chooseSearchMode({ horiz: 4, vert: 0, radius: 24 }) === "direct", "mode: short hop is direct");
ok(chooseSearchMode({ horiz: 15, vert: 0, radius: 24 }) === "bidirectional", "mode: mid-range is bidirectional");
ok(chooseSearchMode({ horiz: 30, vert: 0, radius: 24 }) === "unidirectional", "mode: long trip is rolling unidirectional");
ok(chooseSearchMode({ horiz: 2, vert: 20, radius: 24, isTower: true }) === "unidirectional", "mode: tower is unidirectional");
ok(chooseSearchMode({ horiz: 2, vert: 20, radius: 24 }) === "unidirectional", "mode: overhead climb counted as tower");

// -------------------------------------------------------------- unstuck
ok(unstuckAction({ inWater: true }) === "swim_shore", "unstuck: water -> swim");
ok(unstuckAction({ inWater: false, onGround: false }) === "wait_land", "unstuck: falling -> wait");
ok(unstuckAction({ inWater: false, onGround: true, safeStart: false, hasBlocks: true }) === "pillar", "unstuck: hole with blocks -> pillar");
ok(unstuckAction({ inWater: false, onGround: true, safeStart: true, frontSolid: true }) === "dig_front", "unstuck: wall in face -> dig");
ok(unstuckAction({ inWater: false, onGround: true, safeStart: true, oscillating: true }) === "ignore_cell_replan", "unstuck: looping -> ignore cell");
ok(unstuckAction({ inWater: false, onGround: true, safeStart: true, retries: 3 }) === "sidestep", "unstuck: retries -> sidestep");
ok(unstuckAction({ inWater: false, onGround: true, safeStart: true, retries: 0 }) === "jump_replan", "unstuck: first stall -> jump");

// -------------------------------------------------------------- safety checker
{
    const walk = blockSafetyCheck(readOf(flat), { x: 0, y: 1, z: 0 });
    ok(walk.isSafe && !walk.canSafelyFallFrom && !walk.canSafelyJumpOnto, "safety: standable air over stone is a walk");

    const cliffWorld = (x, y, z) => (y <= -3 ? STONE : AIR);
    const cliff = blockSafetyCheck(readOf(cliffWorld), { x: 0, y: 1, z: 0 });
    ok(!cliff.isSafe && cliff.isPossibleCliff, "safety: two air below is a cliff");

    const fallWorld = (x, y, z) => (y <= -1 ? STONE : AIR);
    const fall = blockSafetyCheck(readOf(fallWorld), { x: 0, y: 1, z: 0 });
    ok(fall.isSafe && fall.canSafelyFallFrom, "safety: one air below is a safe fall");

    const lavaWorld = (x, y, z) => (y === 0 ? LAVA : y < 0 ? STONE : AIR);
    const lava = blockSafetyCheck(readOf(lavaWorld), { x: 0, y: 1, z: 0 });
    ok(!lava.isSafe && lava.hasLavaBelow, "safety: lava below is refused");

    const jumpWorld = (x, y, z) => (y <= 1 ? STONE : AIR);
    const jump = blockSafetyCheck(readOf(jumpWorld), { x: 0, y: 1, z: 0 });
    ok(jump.isSafe && jump.canSafelyJumpOnto, "safety: solid with headroom is jump-onto");

    const fenceWorld = (x, y, z) => (y === 1 ? FENCE : y <= 0 ? STONE : AIR);
    const fence = blockSafetyCheck(readOf(fenceWorld), { x: 0, y: 1, z: 0 });
    ok(!fence.isSafe && fence.cannotBeJumpedOver, "safety: oak fence cannot be jumped onto");

    const flood = blockSafetyCheck(readOf(flat), { x: 0, y: 5, z: 0 }, { allowYAxisFlood: true });
    ok(flood.isSafe, "safety: Y-axis flood treats open air as passable");
}

ok(CANNOT_JUMP_OVER_RE.test("minecraft:oak_fence") && CANNOT_JUMP_OVER_RE.test("minecraft:cobblestone_wall"), "taxonomy: fences and walls cannot be jumped onto");
ok(SLOW_TERRAIN_RE.test("minecraft:soul_sand") && SLOW_TERRAIN_RE.test("minecraft:soul_soil"), "taxonomy: nether soul sand/soil is slow");

// -------------------------------------------------------------- relabel
{
    const p = relabelPath([
        { x: 0, y: 1, z: 0, kind: "walk" },
        { x: 1, y: 1, z: 0 },
        { x: 3, y: 1, z: 0 },
        { x: 3, y: 0, z: 0 },
        { x: 4, y: 1, z: 0 },
    ]);
    ok(p[1].kind === "walk" && p[2].kind === "jump" && p[3].kind === "drop" && p[4].kind === "step",
        `relabel: walk/jump/drop/step (got ${p.map((n) => n.kind).join(",")})`);
}

// -------------------------------------------------------------- bidirectional A*
{
    const a = run(BidirectionalPathSearch, flat, { x: 0, y: 1, z: 0 }, { x: 15, y: 1, z: 6 });
    const b = run(PathSearch, flat, { x: 0, y: 1, z: 0 }, { x: 15, y: 1, z: 6 });
    ok(a.status === "found" && b.status === "found", "bi: flat route found by both");
    const end = a.path[a.path.length - 1];
    ok(end && Math.abs(end.x - 15) <= 1 && Math.abs(end.z - 6) <= 1, "bi: flat path ends at the goal");

    const wall = (x, y, z) => (y <= 0 ? STONE : x === 6 && z !== 5 && y <= 3 ? STONE : AIR);
    const c = run(BidirectionalPathSearch, wall, { x: 0, y: 1, z: 0 }, { x: 12, y: 1, z: 0 });
    ok(c.status === "found" && c.path.some((p) => p.x === 6 && p.z === 5), "bi: routes through the door in a wall");

    const moat = (x, y, z) => (y < 0 ? STONE : y === 0 ? (x >= 3 && x <= 5 && z > -6 && z < 6 ? LAVA : STONE) : AIR);
    const f = run(BidirectionalPathSearch, moat, { x: 0, y: 1, z: 0 }, { x: 9, y: 1, z: 0 }, 2000, 32, { allowBridge: false });
    ok(f.status === "found" && f.path.every((p) => !(p.x >= 3 && p.x <= 5 && p.z > -6 && p.z < 6 && p.y === 1)),
        "bi: walks around a lava strip (never on it)");

    // 1-wide hallway; the ignored cell must not appear as a waypoint (walk around/jump over).
    const hall = (x, y, z) => (y <= 0 ? STONE : (z !== 0 && y <= 2) ? STONE : AIR);
    const ignored = run(BidirectionalPathSearch, hall, { x: 0, y: 1, z: 0 }, { x: 10, y: 1, z: 0 }, 2000, 32, { ignore: [{ x: 5, y: 1, z: 0 }] });
    ok(!ignored.path.some((p) => p.x === 5 && p.y === 1 && p.z === 0),
        "bi: ignore list never uses the banned cell as a waypoint");
    ok(ignored.status !== "found",
        `bi: blocking the only hallway cell prevents a full route (${ignored.status})`);

    const sealed = (x, y, z) => (y <= 0 ? STONE : (x === 2) ? STONE : AIR);
    const u = run(BidirectionalPathSearch, sealed, { x: 0, y: 1, z: 0 }, { x: 8, y: 1, z: 0 }, 400, 24);
    ok(u.status !== "found" && u.status !== "partial", `bi: sealed-off goal still fails honestly (${u.status})`);

    const opts = new AStarOptions({ x: 0, y: 1, z: 0 }, { x: 10, y: 1, z: 0 }, { maximumNodesToConsider: 300, dimension: "nether" });
    ok(opts.maximumNodesToConsider === 300 && opts.dimension === "nether" && opts.strictSafety === true, "AStarOptions: nether defaults");
}

// -------------------------------------------------------------- portal entry plan
ok(planPortalEntry({ inNether: true }).action === "done", "portal: already in nether is done");
ok(planPortalEntry({ inNether: false, ignited: false, portalBlock: null }).action === "ignite", "portal: not ignited -> ignite");
ok(planPortalEntry({ inNether: false, ignited: true, portalBlock: { x: 1, y: 64, z: 1 }, atPortal: false }).action === "walk_in", "portal: ignited -> walk in");
ok(planPortalEntry({ inNether: false, ignited: true, portalBlock: { x: 1, y: 64, z: 1 }, atPortal: true, waitTicks: 10 }).action === "wait", "portal: standing in portal -> wait");
ok(planPortalEntry({ inNether: false, ignited: true, portalBlock: { x: 1, y: 64, z: 1 }, atPortal: true, waitTicks: 90 }).action === "retry_walk", "portal: waited too long -> retry");
ok(verifyPortalAction("enter_nether", "in_nether", {}).success === true, "portal: enter_nether verifies on in_nether");
ok(verifyPortalAction("enter_nether", "still_overworld", {}).success === false, "portal: enter_nether refuses a fake result");

console.log(`\npathfinder.test: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
