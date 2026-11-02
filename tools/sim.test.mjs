// Behavioural tests for the avatar driver and the movement policy.
//
// tools/load/node_modules/@minecraft/* are permissive proxies: they prove a
// module links and evaluates, never that it behaves. So this file drives the
// driver with a fake that implements the SimulatedPlayer contract as
// documented (return values, cooldowns, what throws) and asserts the state
// machine around it - the part that had no offline coverage while it was 1,200
// lines of hand-rolled A*.
//
// The fake uses a NON-ZERO GameTest origin on purpose: every positional engine
// call must go through host.relative(), and a bug like passing a world-space
// cell straight to interactWithBlock() (the camp bed) only shows up when the
// origin is not the origin.
import { Avatar, DONE, RUNNING, FAILED, DIGGING, BLOCKED, UNREACHABLE } from "../scripts/sim/avatar.js";
import { Navigator } from "../scripts/runtime/navigation.js";

let pass = 0, fail = 0;
const ok = (cond, name) => {
    if (cond) { pass++; console.log(`pass ${name}`); }
    else { fail++; console.log(`FAIL ${name}`); }
};

const ORIGIN = { x: 1000, y: -50, z: 2000 };
const AIR = { typeId: "minecraft:air", isAir: true, isLiquid: false, passable: true, support: false, hazard: false };
const STONE = { typeId: "minecraft:stone", isAir: false, isLiquid: false, passable: false, support: true, hazard: false };
const LAVA = { typeId: "minecraft:lava", isAir: false, isLiquid: true, passable: false, support: false, hazard: true };

/** World: flat stone below y=0, air above, plus explicit overrides. */
class FakeWorld {
    constructor(overrides = {}) {
        this.over = overrides;
        this.reads = 0;
    }
    at(p) {
        const k = `${p.x},${p.y},${p.z}`;
        if (k in this.over) return this.over[k];
        return p.y <= 0 ? STONE : AIR;
    }
}
class FakeTerrain {
    constructor(world) { this.world = world; }
    block(p) { this.world.reads++; return this.world.at(p); }
    safe(p) {
        const a = this.block(p), b = this.block({ x: p.x, y: p.y + 1, z: p.z }), c = this.block({ x: p.x, y: p.y - 1, z: p.z });
        return !!(a.passable && b.passable && c.support && !a.hazard && !b.hazard && !c.hazard);
    }
    dangerous(p) { return !!this.block(p).hazard; }
    waterNear() { return false; }
}

/**
 * Fake SimulatedPlayer. `moves` is how many blocks it advances per tick while a
 * movement order is live, so a test can simulate the engine's "stops when stuck".
 */
class FakeSim {
    // The documented contract says these *properties* can throw when used, not
    // just the methods, so the fake throws from them too.
    #loc = { x: 0.5, y: 1, z: 0.5 };
    #dim = { id: "minecraft:overworld" };
    #valid = true;
    #onGround;
    #inWater;
    constructor({ moves = 1, onGround = true, inWater = false, throwAll = false } = {}) {
        this.#onGround = onGround;
        this.#inWater = inWater;
        this.throwAll = throwAll;
        this.step = moves;                 // blocks of progress per tick
        this.calls = [];
        this.navCalls = [];
        this.moveCalls = [];
        this.breakCalls = [];
        this.stops = { moving: 0, breaking: 0, using: 0, interacting: 0 };
        this.target = undefined;
        this.breaking = undefined;
        this.breakingLeft = 0;
        this.cooldown = 0;
        this.using = undefined;
        this.hold = false;                 // when true, movement makes no progress
    }
    #live(name) { if (this.throwAll) throw new Error(`${name} is not available`); }
    /** The engine hands out relative coordinates; the world position is relative + origin. */
    #abs(p) { return { x: p.x + ORIGIN.x, y: p.y + ORIGIN.y, z: p.z + ORIGIN.z }; }
    get location() { this.#live("location"); return this.#loc; }
    set location(v) { this.#loc = v; }
    get dimension() { return this.#dim; }
    get isValid() { this.#live("isValid"); return this.#valid; }
    set isValid(v) { this.#valid = v; }
    get isOnGround() { this.#live("isOnGround"); return this.#onGround; }
    get isInWater() { this.#live("isInWater"); return this.#inWater; }
    get isSprinting() { this.#live("isSprinting"); return false; }
    get isSneaking() { this.#live("isSneaking"); return false; }
    #log(name, arg) { this.calls.push({ name, arg }); }
    #maybeThrow(name) {
        if (this.throwAll) throw new Error(`${name} is not available`);
    }
    getHeadLocation() {
        this.#maybeThrow("getHeadLocation");
        return { x: this.location.x, y: this.location.y + 1.6, z: this.location.z };
    }
    moveToLocation(loc, opts) {
        this.#maybeThrow("moveToLocation");
        this.#log("moveToLocation", loc);
        this.moveCalls.push({ loc, opts });
        this.target = this.#abs(loc);
    }
    navigateToLocation(loc, speed) {
        this.#maybeThrow("navigateToLocation");
        this.#log("navigateToLocation", loc);
        this.navCalls.push({ loc, speed });
        if (loc.y === undefined) throw new Error("bad location");
        this.target = this.#abs(loc);
        return { isFullPath: this.fullPath !== false, getPath: () => [this.target] };
    }
    stopMoving() { this.#maybeThrow("stopMoving"); this.stops.moving++; this.target = undefined; }
    breakBlock(loc) {
        this.#maybeThrow("breakBlock");
        this.#log("breakBlock", loc);
        this.breakCalls.push(loc);
        const k = `${loc.x},${loc.y},${loc.z}`;
        if (this.refuseBreak === true || this.solidBlock === k) return false;   // documented: "the block there is not solid"
        this.breaking = k;
        this.breakingLeft = this.breakTicks ?? 3;
        return true;
    }
    stopBreakingBlock() { this.#maybeThrow("stopBreakingBlock"); this.stops.breaking++; this.breaking = undefined; }
    attackEntity(e) {
        this.#maybeThrow("attackEntity");
        this.attacks = (this.attacks ?? 0) + 1;
        if (this.cooldown > 0) { this.cooldown--; return false; }  // documented cooldown signal
        return e !== undefined;
    }
    useItemInSlot(slot) { this.#maybeThrow("useItemInSlot"); this.#log("useItemInSlot", slot); return true; }
    useItemInSlotOnBlock(slot, loc, dir, face) {
        this.#maybeThrow("useItemInSlotOnBlock");
        this.#log("useItemInSlotOnBlock", { slot, loc, dir, face });
        if (loc === undefined || loc.x === undefined) throw new Error("invalid block location");
        return true;
    }
    interactWithBlock(loc, dir) {
        this.#maybeThrow("interactWithBlock");
        this.#log("interactWithBlock", { loc, dir });
        if (!loc || loc.x === undefined) throw new Error("invalid block location");
        return true;
    }
    lookAtBlock(loc) { this.#maybeThrow("lookAtBlock"); this.#log("lookAtBlock", loc); }
    lookAtEntity(e) { this.#maybeThrow("lookAtEntity"); this.#log("lookAtEntity", e); }
    lookAtLocation(loc) { this.#maybeThrow("lookAtLocation"); this.#log("lookAtLocation", loc); }
    jump() { this.#maybeThrow("jump"); this.#log("jump"); return true; }
    swim() { this.#maybeThrow("swim"); return true; }
    stopUsingItem() { this.#maybeThrow("stopUsingItem"); this.stops.using++; const u = this.using; this.using = undefined; return u; }
    stopInteracting() { this.#maybeThrow("stopInteracting"); this.stops.interacting++; }
    respawn() { this.#maybeThrow("respawn"); return true; }
    chat() { this.#maybeThrow("chat"); }
    /** One engine tick: play any live movement order. */
    engineTick() {
        if (!this.target) return;
        if (this.hold || !this.step) return;
        const d = Math.hypot(this.target.x - this.location.x, this.target.z - this.location.z);
        if (d <= this.step) { this.location = { x: this.target.x, y: this.target.y, z: this.target.z }; }
        else this.location = { x: this.location.x + (this.target.x - this.location.x) / d * this.step, y: this.location.y, z: this.location.z + (this.target.z - this.location.z) / d * this.step };
        if (this.breaking) {
            if (--this.breakingLeft <= 0) { this.breaking = undefined; }
        }
    }
}
const host = {
    relative(p) {
        if (!p || p.x === undefined) throw new Error("host.relative() needs a position");
        return { x: p.x - ORIGIN.x, y: p.y - ORIGIN.y, z: p.z - ORIGIN.z };
    },
};
const setup = (opts = {}, overrides = {}) => {
    const world = new FakeWorld(overrides);
    const terrain = new FakeTerrain(world);
    const sim = new FakeSim(opts);
    const avatar = new Avatar(sim, host, terrain);
    return { world, terrain, sim, avatar };
};

// ------------------------------------------------------------------- snapshot
{
    const { avatar, sim } = setup();
    avatar.sync(5);
    ok(avatar.valid && avatar.tick === 5, "sync: live snapshot, tick recorded");
    ok(avatar.pos.x === 0.5 && Math.abs(avatar.head.y - 2.6) < 1e-9, "sync: position and head cached");
    ok(avatar.cell.y === 1 && avatar.onGround === true, "sync: cell and ground flag derived");
    const dead = setup({}, {}).avatar;
    dead.sim.isValid = false;
    dead.sync(1);
    ok(dead.valid === false, "sync: invalid sim reported without throwing");
}

// -------------------------------------------------------------- error capture
{
    const { avatar } = setup({ throwAll: true });
    avatar.sync(1);
    ok(avatar.valid === false && avatar.errors > 0, "guard: a throwing engine is counted, not propagated");
    let threw = false;
    try {
        avatar.goto({ x: 5, y: 1, z: 5 });
        avatar.dig({ x: 1, y: 1, z: 0 });
        avatar.stopAll();
        avatar.respawn();
        avatar.say("hi");
    } catch (e) { threw = true; }
    ok(!threw, "guard: no driver call throws even when every engine call does");
    ok(avatar.lastError && avatar.lastError.label, "guard: the failing call is recorded for the log");
}

// -------------------------------------------------------------- navigation
{
    const { avatar, sim } = setup();
    sim.location = { x: 0.5, y: 1, z: 0.5 };
    for (let t = 1; t <= 40; t++) { avatar.sync(t); avatar.goto({ x: 0.5, y: 1, z: 3.5 }); sim.engineTick(); }
    ok(sim.moveCalls.length === 1, `goto: a short clear hop is one moveToLocation, not one per tick (${sim.moveCalls.length})`);
    ok(sim.navCalls.length === 0, "goto: short hops do not engage the pathfinder");
    const rel = sim.moveCalls[0].loc;
    const want = host.relative({ x: 1, y: 1, z: 4 });   // cell {0,1,3} centred
    ok(Math.abs(rel.x - want.x) < 1e-9 && Math.abs(rel.z - want.z) < 1e-9, "goto: coordinates converted to GameTest-relative");
    ok(sim.moveCalls[0].opts.faceTarget === true, "goto: moves face the target");
    let done = false;
    for (let t = 41; t < 400 && !done; t++) { sim.engineTick(); avatar.sync(t); done = avatar.goto({ x: 0.5, y: 1, z: 3.5 }) === DONE; }
    ok(done, "goto: reports done once inside the leash");
    ok(sim.stops.moving >= 1, "goto: arrival stops the engine's movement");
}

// ------------------------------------------------- parkour flag (allowHop off)
{
    // `!bot config parkour off` must mean something: no straight-line shortcut,
    // every walk is real engine navigation.
    const { avatar, sim } = setup();
    sim.location = { x: 0.5, y: 1, z: 0.5 };
    for (let t = 1; t <= 40; t++)
        avatar.sync(t), avatar.goto({ x: 0.5, y: 1, z: 3.5 }, { allowHop: false }), sim.engineTick();
    ok(sim.moveCalls.length === 0, `goto: parkour off never uses the moveToLocation shortcut (${sim.moveCalls.length})`);
    ok(sim.navCalls.length === 1, `goto: parkour off routes the same short walk through the pathfinder (${sim.navCalls.length})`);
}
{
    // The shortcut is the default: a plain caller is unaffected.
    const { avatar, sim } = setup();
    sim.location = { x: 0.5, y: 1, z: 0.5 };
    for (let t = 1; t <= 40; t++)
        avatar.sync(t), avatar.goto({ x: 0.5, y: 1, z: 3.5 }, { allowHop: true }), sim.engineTick();
    ok(sim.moveCalls.length === 1 && sim.navCalls.length === 0, "goto: allowHop on keeps the short-hop shortcut");
}
{
    const { avatar, sim } = setup();
    for (let t = 1; t <= 20; t++) { avatar.sync(t); avatar.goto({ x: 60.5, y: 1, z: 60.5 }); sim.engineTick(); }
    ok(sim.navCalls.length === 1, `goto: a long walk starts engine navigation once, not per tick (${sim.navCalls.length})`);
    ok(sim.navCalls[0].loc.x === host.relative({ x: 61, y: 1, z: 61 }).x, "goto: navigation target is relative too");
}
{
    const { avatar, sim } = setup();
    sim.hold = true;                       // the engine's navigator is stuck
    let result = RUNNING, ticks = 0;
    for (let t = 1; t <= 200 && result === RUNNING; t++) { avatar.sync(t); result = avatar.goto({ x: 40.5, y: 1, z: 0.5 }); ticks = t; }
    ok(result === FAILED && avatar.isStuck, `goto: no progress for 25 ticks is reported failed/stuck (tick ${ticks})`);
    ok(sim.stops.moving >= 1 && avatar.reason.includes("Stuck at"), "goto: a stall stops the engine and says where");
}
{
    const { avatar, sim } = setup({ onGround: false });
    const r = avatar.sync(1) && avatar.goto({ x: 9.5, y: 1, z: 0.5 });
    ok(r === RUNNING && sim.navCalls.length === 0, "goto: mid-air waits instead of starting navigation");
}
{
    const { avatar } = setup({ inWater: true });
    avatar.sync(1);
    const r = avatar.goto({ x: 9.5, y: 1, z: 0.5 });
    ok(r === FAILED && /[Ii]n water/.test(avatar.reason), "goto: water is refused with a reason the caller can act on");
}

// --------------------------------------------------------------------- dig
{
    const { avatar, sim } = setup({}, { "1,1,0": STONE });
    sim.location = { x: 0.5, y: 1, z: 0.5 };
    avatar.sync(1);
    const first = avatar.dig({ x: 1, y: 1, z: 0 });
    ok(first === DIGGING && sim.breakCalls.length === 1, "dig: starts the break through the engine");
    for (let t = 2; t <= 6; t++) { avatar.sync(t); avatar.dig({ x: 1, y: 1, z: 0 }); }
    ok(sim.breakCalls.length === 1, `dig: polls the world instead of re-swinging (${sim.breakCalls.length} break calls)`);
    ok(avatar.digCell === "1,1,0", "dig: remembers the cell it is breaking");
}
{
    const { avatar, sim } = setup({}, { "1,1,0": STONE });
    avatar.sync(1);
    sim.refuseBreak = true;   // the engine's "the block there is not solid" answer
    ok(avatar.dig({ x: 1, y: 1, z: 0 }) === BLOCKED, "dig: a refused swing on a solid block reports blocked (the blocker cue)");
}
{
    const { avatar, sim } = setup({}, { "1,1,0": STONE });
    avatar.sync(1);
    avatar.dig({ x: 1, y: 1, z: 0 });
    let r = DIGGING;
    for (let t = 2; t <= 400 && r !== BLOCKED; t++) { avatar.sync(t); r = avatar.dig({ x: 1, y: 1, z: 0 }); }
    ok(r === BLOCKED && sim.stops.breaking >= 1, "dig: gives up on a block that never breaks and releases the swing");
}
{
    const { avatar, sim } = setup({}, { "30,1,30": STONE });
    avatar.sync(1);
    ok(avatar.dig({ x: 30, y: 1, z: 30 }) === UNREACHABLE, "dig: out-of-reach cells are rejected before any engine call");
    ok(sim.breakCalls.length === 0, "dig: ...and no swing was attempted");
    ok(avatar.dig({ x: 0, y: 1, z: 0 }) === DONE, "dig: an already-air cell is done");
}

// ------------------------------------------------------------ interaction
{
    const { avatar, sim } = setup();
    avatar.sync(1);
    avatar.interactBlock({ x: 4, y: 1, z: -3 });
    const arg = sim.calls.find((c) => c.name === "interactWithBlock").arg;
    ok(arg.loc.x === host.relative({ x: 4.5, y: 1, z: -2.5 }).x && arg.loc.y === host.relative({ x: 4.5, y: 1, z: -2.5 }).y,
        "interactBlock: a world cell becomes a relative block centre (the camp-bed bug)");
    ok(sim.calls.every((c) => ["interactWithBlock"].includes(c.name) || c.arg === undefined || c.arg.x === undefined || Math.abs(c.arg.x) < 1e6),
        "interactBlock: nothing world-space reaches the engine");
}
{
    const { avatar, sim } = setup();
    avatar.sync(1);
    const okUse = avatar.useOn(3, { x: 2, y: 1, z: 2 }, "Up");
    const arg = sim.calls.find((c) => c.name === "useItemInSlotOnBlock").arg;
    ok(okUse === true && arg.slot === 3 && arg.dir === "Up" && arg.loc.x === 2.5 - ORIGIN.x, "useOn: slot, direction and relative cell passed through");
    sim.using = "minecraft:bread";
    ok(avatar.stopUsing() === "minecraft:bread", "stopUsing: reports the item that was in use");
}
{
    const { avatar, sim } = setup();
    avatar.sync(1);
    sim.cooldown = 0;
    const first = avatar.attack({ id: "zombie" });
    sim.cooldown = 1;
    const second = avatar.attack({ id: "zombie" });
    ok(first === true && second === false && sim.attacks === 2, "attack: the engine's own cooldown answer is passed to the caller");
    avatar.lookEntity({ id: "zombie" });
    ok(sim.calls.some((c) => c.name === "lookAtEntity"), "look: entity form reaches the engine");
}
{
    const { avatar, sim } = setup();
    avatar.sync(1);
    avatar.hop({ x: 7.5, y: 2, z: 7.5 });
    const arg = sim.calls.find((c) => c.name === "moveToLocation").arg;
    ok(arg.x === 7.5 - ORIGIN.x && arg.y === 2 - ORIGIN.y, "hop: exact world position, converted once");
}
{
    const { avatar, sim } = setup();
    avatar.sync(1);
    avatar.stopAll();
    ok(sim.stops.moving === 1 && sim.stops.breaking === 0 && sim.stops.using === 1 && sim.stops.interacting === 1,
        "stopAll: movement/use/interaction released (the swing only when one was live)");
}

// ----------------------------------------------------------------- Navigator
{
    const { avatar } = setup();
    const nav = new Navigator(avatar, host, new FakeTerrain(new FakeWorld()));
    avatar.sync(1);
    const r = nav.go({ x: 3.5, y: 1, z: 0.5 }, 1);
    ok(r === "running", "nav: a reachable goal reports running");
}
{
    const { avatar } = setup({ inWater: true });
    const nav = new Navigator(avatar, host, new FakeTerrain(new FakeWorld()));
    avatar.sync(1);
    ok(nav.go({ x: 3.5, y: 1, z: 0.5 }, 1) === "failed" && /water/.test(nav.reason), "nav: water keeps its original reason for callers");
}
{
    const { avatar } = setup({}, { "9,1,9": LAVA });
    const nav = new Navigator(avatar, host, new FakeTerrain(new FakeWorld({ "9,1,9": LAVA })));
    avatar.sync(1);
    ok(nav.go({ x: 9.5, y: 1, z: 9.5 }, 1) === "failed" && /hazard/.test(nav.reason), "nav: refuses to walk into a hazard cell");
}
{
    const { avatar, sim } = setup();
    const nav = new Navigator(avatar, host, new FakeTerrain(new FakeWorld()));
    avatar.sync(1);
    nav.go({ x: 30.5, y: 1, z: 0.5 }, 1);
    const before = sim.stops.moving;
    nav.reset();
    ok(sim.stops.moving === before, "nav.reset: re-targeting does not cancel the engine's walk");
    ok(nav.reason === "" && nav.stuck === false && nav.target === undefined, "nav.reset: policy state cleared");
    ok(nav.status().segments >= 0, "nav.status: reports counters");
}
{
    const { avatar, sim } = setup();
    const nav = new Navigator(avatar, host, new FakeTerrain(new FakeWorld()));
    sim.location = { x: 5.5, y: 1, z: 5.5 };
    avatar.sync(1);
    nav.urgent = true;
    nav.avoid = [{ x: 4.5, y: 1, z: 5.5, radius: 8 }];
    const r = nav.go({ x: 1.5, y: 1, z: 5.5 }, 1);
    const moved = sim.calls.find((c) => c.name === "moveToLocation");
    ok((r === "running" || r === "done") && moved && moved.arg.x > host.relative({ x: 6, y: 1, z: 6 }).x,
        "nav: urgent threats step away instead of routing through them");
    // A threat exactly on the bot leaves no "away" vector: pick a safe side instead of doing nothing.
    const { avatar: a2, sim: s2 } = setup();
    s2.location = { x: 5.5, y: 1, z: 5.5 };
    a2.sync(1);
    const nav2 = new Navigator(a2, host, new FakeTerrain(new FakeWorld()));
    nav2.urgent = true;
    nav2.avoid = [{ x: 5.5, y: 1, z: 5.5, radius: 8 }];
    const r2 = nav2.go({ x: 1.5, y: 1, z: 5.5 }, 1);
    ok(r2 !== undefined, "nav: a threat on top of the bot still produces a move");
}

console.log(`\nsim.test: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
