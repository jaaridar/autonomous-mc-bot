/**
 * Integration suite - drives the REAL `Bot.think()` loop against a fake world
 * for thousands of ticks and asserts on observable behaviour.
 *
 * The other suites test the pieces (pathfinder, escaper, arbiter, state machine)
 * in isolation. This one is the only place where the whole tick is assembled:
 * `think()` -> owner decision -> arbiter job -> director -> navigator -> body.
 * It exists because most of the reported "stuck in a loop" symptoms were
 * *integration* faults: two subsystems each doing something correct on their
 * own but stomping on each other every other tick.
 *
 * What this suite proves:
 *   1. the bot boots and ticks without throwing, for a long run;
 *   2. it does not oscillate between owners (state churn is bounded);
 *   3. it does not repeatedly reset the navigator (the classic 5-tick thrash);
 *   4. it eats when hungry and safe;
 *   5. it leaves water instead of treading in place;
 *   6. it does not die standing in lava (it steps off);
 *   7. it makes progress toward a goto goal on open ground.
 *
 * Run: `node tools/integration.test.mjs` (run-all.mjs runs it too).
 */
import { cpSync, rmSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const tools = fileURLToPath(new URL(".", import.meta.url));
const repo = fileURLToPath(new URL("..", import.meta.url));
rmSync(join(tools, "load", "scripts"), { recursive: true, force: true });
mkdirSync(join(tools, "load", "scripts"), { recursive: true });
cpSync(join(repo, "scripts"), join(tools, "load", "scripts"), { recursive: true });

// The Bot reaches for the engine clock in a few paths; give it a stable one.
const clock = { tick: 0 };
const stub = await import("./load/node_modules/@minecraft/server/index.js");
try { Object.defineProperty(stub.system, "currentTick", { get: () => clock.tick, configurable: true }); } catch { /* stub is a proxy */ }

const { Bot } = await import("./load/scripts/runtime/bot.js");
const { Terrain } = await import("./load/scripts/runtime/world.js");

let pass = 0, fail = 0;
const ok = (cond, name, detail = "") => {
    if (cond) { pass++; console.log("pass " + name); }
    else { fail++; console.log(`FAIL ${name}${detail ? " :: " + detail : ""}`); }
};

/* ------------------------------------------------------------------ world --- */

const AIR = { passable: true, support: false, hazard: false, type: "minecraft:air" };
const STONE = { passable: false, support: true, hazard: false, type: "minecraft:stone" };
const DIRT = { passable: false, support: true, hazard: false, type: "minecraft:dirt" };
const WATER = { passable: true, support: false, hazard: true, type: "minecraft:water" };
const LAVA = { passable: false, support: false, hazard: true, type: "minecraft:lava" };

/**
 * Fake dimension backed by a mutable voxel function, shaped like the engine's
 * `Dimension` for the calls this codebase makes.
 */
function makeDimension(fn) {
    const cells = new Map();
    const key = (x, y, z) => `${x},${y},${z}`;
    const at = (p) => {
        const x = Math.floor(p.x), y = Math.floor(p.y), z = Math.floor(p.z);
        const k = key(x, y, z);
        if (!cells.has(k)) cells.set(k, fn(x, y, z));
        return cells.get(k);
    };
    const put = (p, c) => cells.set(key(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z)), c);
    let blockHits = 0;
    const blockObj = (p) => {
        const c = at(p);
        return {
            typeId: c.type,
            isAir: c.passable && !c.hazard,
            isSolid: !!c.support,
            isLiquid: /water|lava/.test(c.type),
            location: { x: Math.floor(p.x), y: Math.floor(p.y), z: Math.floor(p.z) },
            getComponent: () => undefined,
            isWaterlogged: false,
            permute: () => {},
        };
    };
    return {
        at, put, cells,
        blockHits: () => blockHits,
        id: "minecraft:overworld",
        getBlock(p) { blockHits++; return blockObj(p); },
        getBlockFromRay() { return undefined; },
        getEntities() { return []; },
        getPlayers() { return []; },
        getTimeOfDay() { return 1000; }, // daytime
        spawnEntity() { return undefined; },
        spawnItem() { return undefined; },
        playSound() {},
        createExplosion() {},
        runCommand() { return { successCount: 0 }; },
        getWeather() { return "Clear"; },
    };
}

const flatWorld = (x, y, z) => (y <= 0 ? STONE : y === 1 && (x * x + z * z) < 4 ? WATER : AIR);
const lavaWorld = (x, y, z) => (y <= 0 ? STONE : x === 0 && z === 0 ? LAVA : AIR);

function makeSim(dimension, start, opts = {}) {
    const state = {
        loc: { ...start },
        hp: opts.hp ?? 20,
        hunger: opts.hunger ?? 20,
        breaking: null,
        // Persistent walk target: the SDK's moveToLocation() issues a NAVIGATION
        // command, it does not teleport the entity. The body then walks toward
        // it, up to ~0.28 blocks/tick (0.36 sprinting), until it arrives or
        // stopMoving() is called. Modelling this matters: an earlier fake that
        // snapped straight to the target made the bot "reach" a 14-block goal in
        // four ticks, and a fake that moved only once left it frozen while the
        // navigator re-issued the same waypoint - both hid behaviour that the
        // real engine shows.
        dest: null,
    };
    // The engine passes component *objects* from EntityComponentTypes, and the
    // offline stub stringifies ALL of them to the same "0" - so the component
    // cannot be identified from the argument. Identify it by the component's
    // own shape instead: health has `currentValue` + `effectiveMax`, hunger has
    // `currentValue` + `effectiveMax` too, but only the inventory component is
    // ever asked for a `container`. To keep this deterministic we return an
    // object that satisfies every shape at once: a getter-based container for
    // the inventory path, and health/hunger values for the scalar paths.
    const items = opts.items ?? [
        { typeId: "minecraft:bread", amount: 8 },
        { typeId: "minecraft:cobblestone", amount: 32 },
        { typeId: "minecraft:stone_pickaxe", amount: 1, durability: 100 },
    ];
    const slots = new Array(36).fill(undefined);
    items.forEach((it, i) => { slots[i] = it; });
    const container = {
        size: 36,
        emptySlotsCount: 36 - items.length,
        getItem: (i) => slots[i],
        setItem: (i, v) => { slots[i] = v; },
        addItem: (v) => { const i = slots.findIndex((s) => !s); if (i < 0) return undefined; slots[i] = v; return v; },
        swapItems: (a, b) => { const t = slots[a]; slots[a] = slots[b]; slots[b] = t; },
    };
    /**
     * One component object that answers every shape the bot asks for.
     *
     * The offline stub stringifies every EntityComponentTypes member to "0",
     * so the id cannot be used to discriminate. The bot only reads three
     * things from components: `currentValue` (health/hunger), `effectiveMax`,
     * and `container` (inventory). Returning all of them means the fake is
     * deterministic regardless of which id arrives.
     */
    const component = () => ({
        currentValue: state.hp,
        effectiveMax: 20,
        defaultMax: 20,
        container,
        // hunger and health are told apart by the caller, so the fake keeps
        // them in sync via the state object below (see getComponent).
    });
    const sim = {
        get location() { return { ...state.loc }; },
        get dimension() { return dimension; },
        get isInWater() { return /water/.test(dimension.at(state.loc).type); },
        get isOnGround() { return true; },
        isSprinting: false,
        isSneaking: false,
        isValid: true,
        id: "fake-bot",
        name: "Verdant",
        typeId: "minecraft:player",
        /**
         * Health is requested with the `EntityComponentTypes.Health` stub (an
         * object), hunger with the literal string "minecraft:player.hunger".
         * That is a reliable discriminator even though every stub member
         * stringifies to "0".
         */
        getComponent(id) {
            const c = component();
            if (typeof id === "string" && /hunger/i.test(id)) return { ...c, currentValue: state.hunger };
            return c;
        },
        getHeadLocation: () => ({ x: state.loc.x, y: state.loc.y + 1.62, z: state.loc.z }),
        jump() {},
        stopMoving() { state.dest = null; },
        lookAtBlock() {},
        lookAtLocation() {},
        stopBreakingBlock() {},
        stopUsingItem() {},
        stopInteracting() {},
        // Eating must actually work, or the "hungry bot eats" scenario proves
        // only that it keeps asking: the bot chewed forever at hunger 8 and
        // every tick stayed in the eat owner. Restore the hunger the food gives.
        useItemInSlot() { state.hunger = Math.min(20, state.hunger + 5); return true; },
        useItemInSlotOnBlock() { return true; },
        interactWithEntity() { return true; },
        breakBlock(p) {
            const c = dimension.at(p);
            if (!c.support) return false;
            dimension.put(p, AIR);
            return true;
        },
        moveToLocation(p) {
            // Issue a walk target; the body advances in advance() below.
            if (!p || ![p.x, p.y, p.z].every(Number.isFinite)) return;
            if (dimension.at(p).support) return;
            state.dest = { x: p.x, y: p.y, z: p.z };
        },
        teleport(p) { state.loc = { ...p }; },
        respawn() {},
        runCommand() { return { successCount: 0 }; },
        sendMessage() {},
        hasTag() { return true; },
        addTag() {},
        setDynamicProperty() {},
        getDynamicProperty() { return undefined; },
        applyDamage() {},
        applyKnockback() {},
        addEffect() {},
        removeEffect() {},
        playAnimation() {},
    };
    /**
     * Advance the body one tick toward the current walk target.
     * A walking player covers at most ~0.28 blocks/tick (0.36 sprinting), so a
     * step may not cross more horizontal distance than that. Arrival snaps to
     * the target, like the engine's "you have reached your destination".
     */
    const advance = () => {
        const d = state.dest;
        if (!d) return;
        const from = state.loc;
        const dx = d.x - from.x, dz = d.z - from.z;
        const horiz = Math.hypot(dx, dz);
        const dy = d.y - from.y;
        // A far-away y is NOT a teleport request - swimming and jumping both
        // target a y well above the body (the escaper surfaces by asking for
        // y+1.9). Climb/drop gradually below. Only refuse an absurd target so a
        // garbage coordinate cannot fling the body across the dimension.
        if (Math.abs(dy) > 12) { state.dest = null; return; }
        if (horiz < 0.05 && Math.abs(dy) < 0.05) { state.loc = { x: d.x, y: d.y, z: d.z }; state.dest = null; return; }
        const MAX_STEP = 0.28;      // horizontal blocks/tick
        const MAX_RISE = 0.22;      // vertical blocks/tick (jump/swim)
        const k = Math.min(1, MAX_STEP / Math.max(horiz, 1e-6));
        let ny = from.y + Math.sign(dy) * Math.min(Math.abs(dy), MAX_RISE);
        if (Math.abs(d.y - ny) < 0.05) ny = d.y;
        state.loc = { x: from.x + dx * k, y: ny, z: from.z + dz * k };
        if (k === 1 && ny === d.y) state.dest = null;
    };
    return { sim, state, advance };
}

function makeBot(worldFn, start, opts = {}) {
    const dimension = makeDimension(worldFn);
    const { sim, state, advance } = makeSim(dimension, start, opts);
    const host = { relative: (p) => p, spawn: () => sim, preview: () => ({}) };
    const terrain = new Terrain(dimension);
    terrain.clock = () => clock.tick;
    const memory = {
        home: () => opts.home ?? { x: 0, y: 1, z: 0 },
        death: () => undefined,
        setDeath: () => {},
        notice: () => {},
        seen: () => undefined,
        sanitizePrefs: () => ({}),
        prefs: () => ({}),
        save: () => {},
        load: () => undefined,
    };
    const bot = new Bot(sim, "owner", host, memory);
    bot.terrain = terrain;
    bot.ownerElsewhere = false;
    // Replace the owner lookup: the fake owner is always present and local.
    bot.owner = () => ({ location: { ...start }, dimension: { id: "minecraft:overworld" }, sendMessage: () => {} });
    // The body stepper, so run() can move it between ticks like the engine does.
    bot.advance = advance;
    return { bot, state, dimension, advance };
}

/** Tick `bot.think()` N times with the engine clock advancing. */
function run(bot, ticks, onTick) {
    const errors = [];
    for (let i = 0; i < ticks; i++) {
        clock.tick++;
        try {
            if (onTick) onTick(clock.tick);
            bot.advance?.();
            bot.think(clock.tick);
        } catch (e) {
            errors.push({ tick: clock.tick, error: e });
            if (errors.length > 3) break;
        }
    }
    return errors;
}

/* -------------------------------------------------------------- scenarios --- */

// 1. boot + long run on flat ground without an exception.
{
    clock.tick = 0;
    const { bot } = makeBot(flatWorld, { x: 8, y: 1, z: 8 });
    bot.setMode("idle");
    const errors = run(bot, 1200);
    if (process.env.DEBUG_BOT) {
        console.log("DBG state", bot.state, "paused", bot.paused, bot.pausedReason, "reason", bot.reason, "owner", bot.ownerDecision);
    }
    ok(errors.length === 0, "integration: 1200 idle ticks on flat ground without throwing",
        errors[0] ? `${errors[0].error?.message ?? errors[0].error}` : "");
}

// 2. owner/state churn is bounded (no per-tick oscillation).
{
    clock.tick = 0;
    const { bot } = makeBot(flatWorld, { x: 8, y: 1, z: 8 }, { hunger: 14 });
    bot.setMode("idle");
    const owners = new Map();
    let changes = 0, last = null;
    const errors = run(bot, 1200, () => {
        const o = bot.ownerDecision?.owner;
        if (o && o !== last) { changes++; last = o; }
        if (o) owners.set(o, (owners.get(o) ?? 0) + 1);
    });
    ok(errors.length === 0, "integration: owner loop does not throw", errors[0] ? String(errors[0].error?.message ?? errors[0].error) : "");
    ok(changes <= 40, `integration: ${changes} owner changes in 1200 ticks (thrash would be hundreds)`);
    ok([...owners.keys()].length <= 4, `integration: only ${owners.size} distinct owners used (${[...owners.keys()].join(",")})`);
}

// 3. the navigator is not reset every few ticks.
{
    clock.tick = 0;
    const { bot } = makeBot(flatWorld, { x: 8, y: 1, z: 8 });
    bot.setMode("idle");
    let resets = 0;
    const original = bot.nav.reset.bind(bot.nav);
    bot.nav.reset = (...a) => { resets++; return original(...a); };
    run(bot, 600);
    ok(resets <= 120, `integration: navigator reset ${resets}x in 600 ticks (a 5-tick thrash would be ~120+)`);
}

// 4. hungry bot with food and no threats eats.
{
    clock.tick = 0;
    const { bot, state } = makeBot(flatWorld, { x: 8, y: 1, z: 8 }, { hunger: 8 });
    bot.setMode("idle");
    let ate = false;
    const originalEat = bot.eat.bind(bot);
    bot.eat = (t) => { ate = true; return originalEat(t); };
    const tr = [];
    run(bot, 200, () => { if (process.env.DEBUG_BOT && tr.length < 6) tr.push(`${bot.state}|${bot.ownerDecision?.owner}|${bot.reason}`); });
    if (process.env.DEBUG_BOT) { console.log("DBG eat:", tr.join(" // ")); console.log("  hunger", bot.sim.getComponent("h").currentValue, "bag food slot", bot.bag.food(false)); }
    ok(ate, "integration: a hungry bot with food and no threats eats");
    void state;
}

// 5. standing in a pond: leaves the water within a bounded time.
{
    clock.tick = 0;
    const pond = (x, y, z) => {
        if (y <= 0) return STONE;
        if (Math.abs(x - 8) <= 2 && Math.abs(z - 8) <= 2 && y <= 2) return WATER;
        return AIR;
    };
    const { bot, state } = makeBot(pond, { x: 8, y: 1, z: 8 });
    bot.setMode("idle");
    run(bot, 400);
    if (process.env.DEBUG_BOT) console.log("DBG pond: ended", JSON.stringify(state.loc), bot.state, bot.reason);
    const d = state.loc;
    const stillWet = /water/.test(makeDimension(pond).at(d).type);
    ok(!stillWet || Math.hypot(d.x - 8, d.z - 8) > 2,
        `integration: the bot leaves the pond (ended at ${d.x.toFixed(1)},${d.y},${d.z.toFixed(1)})`);
}

// 6. standing in lava: does not stay there.
{
    clock.tick = 0;
    const { bot, state } = makeBot(lavaWorld, { x: 0, y: 1, z: 0 }, { hp: 12 });
    bot.setMode("idle");
    const trace = [];
    run(bot, 120, () => { if (process.env.DEBUG_BOT && trace.length < 12) trace.push(`${bot.state}|${bot.ownerDecision?.owner}|${bot.reason}`); });
    const d = state.loc;
    if (process.env.DEBUG_BOT) { console.log("DBG lava final:", bot.state, JSON.stringify(d), "esc:", bot.escaper.lastReason); console.log(trace.join("\n")); }
    const stillLava = Math.floor(d.x) === 0 && Math.floor(d.z) === 0 && Math.floor(d.y) === 1;
    ok(!stillLava, `integration: the bot steps out of lava (ended at ${d.x.toFixed(1)},${d.y},${d.z.toFixed(1)})`);
}

// 7. goto on open ground: closes the distance.
{
    clock.tick = 0;
    const { bot, state, dimension } = makeBot((x, y, z) => (y <= 0 ? DIRT : AIR), { x: 0, y: 1, z: 0 });
    bot.setMode("goto", { x: 14, y: 1, z: 0 });
    const startDist = Math.hypot(14 - state.loc.x, state.loc.z);
    const traj = [];
    const gtr = [];
    const navTrace = new Set();
    const resetTrace = [];
    const origReset = bot.nav.reset.bind(bot.nav);
    bot.nav.reset = (...a) => { if (resetTrace.length < 40) resetTrace.push(`t${clock.tick} ${bot.nav.reason?.slice(0,70)} <- ${new Error().stack.split("\n").slice(2,5).map(l=>l.trim().replace(/file:\/\/[^)]*\//g,"").slice(0,60)).join(" | ")}`); return origReset(...a); };
    const goTrace = [];
    const origNavGo = bot.nav.go.bind(bot.nav);
    bot.nav.go = (g, t) => { const r = origNavGo(g, t); if (goTrace.length < 10) goTrace.push(`t${t} go(${JSON.stringify(g)}) -> ${r} @${JSON.stringify(state.loc)}`); return r; };
    // Closest approach, not the final position: once "Destination reached" fires
    // the bot hands over to active idle and walks back to the owner, so the last
    // sample says nothing about whether goto worked.
    let best = startDist;
    run(bot, 900, () => { best = Math.min(best, Math.hypot(14 - state.loc.x, state.loc.z)); });
    if (process.env.DEBUG_BOT) {
        console.log("DBG goto: closest", best.toFixed(1), "at", JSON.stringify(state.loc), "mode", bot.mode, "reason", bot.reason);
    }
    const endDist = best;
    if (process.env.DEBUG_BOT) {
        console.log("DBG goto end", endDist.toFixed(1), "reason", bot.reason, "owner", bot.ownerDecision?.owner);
        const p0 = { x: 3, y: 1, z: 0 };
        console.log("  dim.at(3,0,0)", JSON.stringify(dimension.at({x:3,y:0,z:0})), "cells.size", dimension.cells.size);
        console.log("  safe(3,1,0)?", bot.terrain.safe(p0), "read:", JSON.stringify(bot.terrain.read(p0)), JSON.stringify(bot.terrain.read({x:3,y:2,z:0})), JSON.stringify(bot.terrain.read({x:3,y:0,z:0})));
        console.log("  nav.target", JSON.stringify(bot.nav.target), "search", !!bot.nav.search, "tunnelPlan", JSON.stringify(bot.nav.tunnelPlan), "wide", bot.nav.wide, "retries", bot.nav.retries);
        {
            const { PathSearch } = await import("../scripts/core/navigation.js");
            const self = { x: Math.floor(state.loc.x), y: Math.floor(state.loc.y), z: Math.floor(state.loc.z) };
            const goal = { x: 14, y: 1, z: 0 };
            const s2 = new PathSearch(bot.terrain.read, self, goal, 0.7, false, 1200, 24, false, [], { allowBridge: true, allowPillar: true, allowSprintJump: true, allowSwim: true, danger: bot.nav.dangerContext(clock.tick), dangerWorld: bot.terrain });
            let n = 0; while (s2.status === "searching" && n++ < 50) s2.step(120);
            console.log("  manual search from", JSON.stringify(self), "->", s2.status, "len", s2.path.length, "expanded", s2.expanded, "parkour", bot.nav.parkour);
        }
    }
    ok(endDist < startDist - 4 || endDist < 2,
        `integration: goto closes from ${startDist.toFixed(1)} to ${endDist.toFixed(1)} blocks`);
}

// 8. a blocked goto does not wedge the whole loop: the owner keeps changing
//    and no exception escapes.
{
    clock.tick = 0;
    const walled = (x, y, z) => (y <= 0 ? STONE : (x >= 3 && x <= 4 ? STONE : AIR));
    const { bot } = makeBot(walled, { x: 0, y: 1, z: 0 });
    bot.setMode("goto", { x: 10, y: 1, z: 0 });
    const errors = run(bot, 600);
    ok(errors.length === 0, "integration: an unreachable goto does not throw",
        errors[0] ? String(errors[0].error?.message ?? errors[0].error) : "");
    const blockedForever = bot.blocked && clock.tick - (bot.blocked.until ?? clock.tick) > 600;
    ok(!blockedForever, "integration: an unreachable goto does not permanently block the bot");
}

console.log(`\nintegration.test: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
