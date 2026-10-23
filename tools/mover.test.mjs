// SimulatedPlayer movement: swim, navigateToLocation(s), mining always surfaces.
import { chooseDrive, shouldAbortMine, stillUnderground, swimStroke } from "../scripts/core/mover.js";
import { Mover } from "../scripts/runtime/mover.js";
import { Navigator } from "../scripts/runtime/navigation.js";
import { DeepMiner } from "../scripts/runtime/deepminer.js";
import { Miner } from "../scripts/runtime/mining.js";
import { Terrain } from "../scripts/runtime/world.js";

let pass = 0, fail = 0;
const ok = (cond, name) => {
    if (cond) { pass++; console.log("pass " + name); }
    else { fail++; console.log("FAIL " + name); }
};

const AIR = { passable: true, support: false, hazard: false, type: "minecraft:air", isAir: true };
const STONE = { passable: false, support: true, hazard: false, type: "minecraft:stone", isAir: false };
const flat = (x, y, z) => (y <= 0 ? STONE : AIR);
function fakeDimension(fn) {
    return {
        getBlock(p) {
            const c = fn(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z));
            return { typeId: c.type, isAir: c.isAir, isLiquid: /water|lava/.test(c.type), isSolid: c.support, location: { ...p } };
        },
        getEntities() { return []; },
    };
}

// -------------------------------------------------------------- policy
ok(chooseDrive({ inWater: true }) === "swim", "drive: water -> swim");
ok(chooseDrive({ onGround: true, kinds: ["walk", "step", "drop"] }) === "native_route", "drive: walk corridor -> vanilla nav");
ok(chooseDrive({ onGround: true, kinds: ["jump"] }) === "custom", "drive: parkour stays on custom A*");
ok(chooseDrive({ onGround: true, nativeBanned: true, kinds: ["walk"] }) === "custom", "drive: banned native falls back");
ok(chooseDrive({ onGround: false, kinds: ["walk"] }) === "custom", "drive: airborne stays custom");
ok(chooseDrive({ onGround: true, kinds: ["sprintjump3"] }) === "custom", "drive: 3-block jump stays custom");

ok(shouldAbortMine({ quotaMet: true }).reason === "quota", "abort: quota");
ok(shouldAbortMine({ inventoryFull: true }).reason === "full", "abort: full inventory");
ok(shouldAbortMine({ hp: 8 }).reason === "low_health", "abort: hp <= 8");
ok(shouldAbortMine({ hunger: 4 }).reason === "starving", "abort: hunger <= 4");
ok(shouldAbortMine({ ticksUnderground: 2401 }).reason === "time", "abort: > 2400 ticks underground");
ok(shouldAbortMine({ inWater: true }).reason === "flooded", "abort: flooded shaft");
ok(shouldAbortMine({ lavaNear: true }).reason === "lava", "abort: lava");
ok(!shouldAbortMine({ hp: 9, hunger: 5, ticksUnderground: 100 }).abort, "abort: healthy mine continues");

ok(stillUnderground({ x: 0, y: 10, z: 0 }, { x: 0, y: 64, z: 0 }), "underground: 54 below origin");
ok(!stillUnderground({ x: 0, y: 63, z: 0 }, { x: 0, y: 64, z: 0 }), "underground: 1 below is surface slack");
ok(!stillUnderground({ x: 0, y: 10, z: 0 }, null), "underground: missing origin is not assumed surface");

ok(swimStroke({ headInWater: true }) === "surface", "stroke: drowning looks up");
ok(swimStroke({ hasShore: true }) === "shore", "stroke: shore when breathing");
ok(swimStroke({}) === "forward", "stroke: open water forward");

// -------------------------------------------------------------- Mover APIs
{
    const rels = [];
    const host = { relative: (p) => { rels.push({ ...p }); return { x: p.x + 100, y: p.y, z: p.z }; } };
    let navArg, routeArg, swimN = 0, stopSwimN = 0, relMove = 0, walked;
    const sim = {
        location: { x: 1, y: 2, z: 3 },
        isSprinting: false,
        navigateToLocation(p, speed) { navArg = { p, speed }; return { isFullPath: true }; },
        navigateToLocations(pts, speed) { routeArg = { pts, speed }; },
        swim() { swimN++; },
        stopSwimming() { stopSwimN++; },
        lookAtLocation() {},
        jump() { return true; },
        moveToLocation(p) { walked = p; },
        moveRelative() { relMove++; },
        stopMoving() {},
    };
    const m = new Mover(sim, host);
    ok(m.navigateTo({ x: 1, y: 2, z: 3 }, 0.8) && navArg.p.x === 101 && navArg.speed === 0.8, "mover: navigateToLocation uses host.relative");
    ok(m.navigateRoute([{ x: 0, y: 1, z: 0 }, { x: 2, y: 1, z: 0 }]) && routeArg.pts[0].x === 100 && routeArg.pts.length === 2, "mover: navigateToLocations uses host.relative");
    ok(m.swimToward({ x: 4, y: 2, z: 3 }, { headInWater: true }) === "swim" && swimN === 1 && m.swimming, "mover: swimToward calls sim.swim()");
    ok(walked && walked.x === 104, "mover: swimToward moveToLocation is relative");
    m.stopSwim();
    ok(stopSwimN === 1 && !m.swimming, "mover: stopSwimming");
    ok(m.moveRelative(0, 1, 1) && relMove === 1, "mover: moveRelative");
    let worldMove = 0;
    sim.move = () => { worldMove++; };
    ok(m.move({ x: 1, y: 0, z: 0 }, 1) && worldMove === 1, "mover: move (world-space)");
    const blocked = new Mover({ navigateToLocation: () => ({ isFullPath: false }) }, host);
    ok(!blocked.navigateTo({ x: 0, y: 1, z: 0 }), "mover: isFullPath false falls back");
    const missing = new Mover({}, host);
    ok(!missing.navigateTo({ x: 0, y: 1, z: 0 }) && !missing.navigateRoute([{ x: 0, y: 1, z: 0 }, { x: 1, y: 1, z: 0 }]), "mover: missing APIs return false");
}

// -------------------------------------------------------------- Navigator uses swim / native
{
    const swam = [];
    const sim = {
        location: { x: 0.5, y: 1, z: 0.5 },
        isInWater: true, isOnGround: false, isSprinting: false,
        getComponent: () => ({ currentValue: 20 }),
        moveToLocation() {}, stopMoving() {}, jump() {},
        swim() { swam.push("swim"); },
        stopSwimming() { swam.push("stop"); },
        lookAtLocation() {},
    };
    const t = new Terrain(fakeDimension(flat));
    t.begin(1);
    t.headInWater = () => true;
    const nav = new Navigator(sim, { relative: (p) => p }, t);
    const r = nav.go({ x: 8.5, y: 1, z: 0.5 }, 1);
    ok(r === "running" && swam.includes("swim"), "nav: in-water go() calls sim.swim()");
}
{
    const navCalls = [];
    const sim = {
        location: { x: 0.5, y: 1, z: 0.5 },
        isInWater: false, isOnGround: true, isSprinting: false,
        getComponent: () => ({ currentValue: 20 }),
        moveToLocation() {}, stopMoving() {}, jump() {},
        navigateToLocation(p, speed) { navCalls.push({ p, speed }); return { isFullPath: true }; },
    };
    const t = new Terrain(fakeDimension(flat));
    t.begin(1);
    const nav = new Navigator(sim, { relative: (p) => ({ ...p, tagged: true }) }, t);
    const r = nav.go({ x: 12.5, y: 1, z: 0.5 }, 1);
    ok(r === "running" && nav.nativeIssued && navCalls.length === 1, "nav: mid-range walk uses navigateToLocation");
    ok(navCalls[0].p.tagged === true, "nav: navigateToLocation receives host.relative coords");
}

// -------------------------------------------------------------- miners never "done" underground
function fakeBot(y) {
    const calls = { pillar: 0, dig: 0, nav: 0 };
    const sim = {
        location: { x: 0.5, y, z: 0.5 },
        isInWater: false, isOnGround: true, isSprinting: false,
        jump() {}, moveToLocation() {},
        getComponent: () => ({ currentValue: 20 }),
    };
    const bot = {
        sim,
        host: { relative: (p) => p },
        bag: { container: { emptySlotsCount: 10 }, tool: () => true, find: () => -1 },
        terrain: {
            lavaNear: () => false, waterNear: () => false, solid: () => true,
            block: () => ({ isAir: true, typeId: "minecraft:air" }),
            headInWater: () => false,
        },
        builder: { canBuild: true, pillar() { calls.pillar++; return "placed"; } },
        digCell() { calls.dig++; return "digging"; },
        nav: { reset() {}, go() { calls.nav++; return "running"; }, mover: null },
    };
    bot.nav.mover = new Mover(sim, bot.host);
    return { bot, calls, sim };
}
{
    const { bot, calls } = fakeBot(-20);
    const dm = new DeepMiner(bot);
    dm.site = { origin: { x: 0, y: 64, z: 0 }, targetY: -20 };
    dm.phase = "ascend";
    dm.wantsOut = true;
    dm.ascentStarted = true;
    dm.ascendSince = 0;
    dm.route = [];
    const r = dm.ascend(5000);
    ok(r === "working" && dm.wantsOut === true && calls.pillar === 1, "deepminer: lost route still pillars out, wantsOut stays");
    ok(r !== "stalled" && r !== "surface" && r !== "done", "deepminer: never claims surface while at Y=-20");
}
{
    const { bot, calls } = fakeBot(-12);
    const miner = new Miner(bot);
    miner.site = { origin: { x: 0, y: 64, z: 0 }, targetY: -12 };
    miner.underground = true;
    miner.wantsOut = true;
    miner.ascentStarted = true;
    miner.ascendSince = 0;
    miner.route = [];
    const r = miner.ascend(4000);
    ok(r === "working" && miner.wantsOut === true && calls.pillar === 1, "miner: stall keeps climbing, wantsOut stays");
}
{
    const { bot } = fakeBot(-5);
    const dm = new DeepMiner(bot);
    dm.site = { origin: { x: 0, y: 64, z: 0 }, targetY: -5, ore: "minecraft:iron_ore" };
    dm.phase = "branch";
    dm.since = 0;
    dm.route = [{ x: 0, y: -5, z: 0 }];
    dm.tick(2500, () => [], false);
    ok(dm.wantsOut === true, "deepminer: time-box sets wantsOut after 2400 ticks");
}

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
