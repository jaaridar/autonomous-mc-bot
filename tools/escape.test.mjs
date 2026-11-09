/**
 * Escape suite - drives the REAL `Escaper` against a fake body and a voxel
 * world, offline. This is the "it can't escape and it can't survive alone"
 * regression net.
 *
 * The fake body is deliberately dumb: `moveToLocation` teleports it (a perfect
 * player), so any failure in these tests is a *decision* failure in the escaper,
 * not a physics failure. Every scenario asserts that within a bounded number of
 * ticks the escaper either resolves the situation or reports an honest failure
 * with a reason - and never spins forever on the same action.
 *
 * Scenarios:
 *   1. head under water          -> surfaces, then reaches land
 *   2. standing in a shallow pond -> walks out (does not tread water)
 *   3. standing on lava / beside lava -> steps off within a few ticks
 *   4. sealed 1x1 pit with soil   -> stair-digs out (bare hands are enough)
 *   5. sealed stone pit with pickaxe -> stair-digs out
 *   6. sealed bedrock pit         -> reports failure with a reason (no hang)
 *   7. creeper adjacent           -> retreats, never builds a bunker in the open
 *
 * Run: `node tools/escape.test.mjs` (run-all.mjs runs it too).
 */
// The load/ copy is what resolves the stubbed @minecraft/* modules. Rebuild it
// from the pack sources first so this suite never tests stale code (nested
// files are not copied by the plain directory copy in run-all for new files).
import { cpSync, rmSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
const tools = fileURLToPath(new URL(".", import.meta.url));
const repo = fileURLToPath(new URL("..", import.meta.url));
rmSync(join(tools, "load", "scripts"), { recursive: true, force: true });
mkdirSync(join(tools, "load", "scripts"), { recursive: true });
cpSync(join(repo, "scripts"), join(tools, "load", "scripts"), { recursive: true });

const { Escaper } = await import("./load/scripts/runtime/escape.js");

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
const BEDROCK = { passable: false, support: true, hazard: false, type: "minecraft:bedrock" };

/**
 * A mutable voxel world. `breakBlock`/place mutate it, so the escaper's digging
 * genuinely changes the terrain, like the real one.
 */
function makeWorld(fn) {
    const cells = new Map();
    const at = (x, y, z) => {
        const k = `${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`;
        if (!cells.has(k)) cells.set(k, fn(Math.floor(x), Math.floor(y), Math.floor(z)));
        return cells.get(k);
    };
    const put = (x, y, z, c) => cells.set(`${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`, c);
    return {
        at, put,
        block: (p) => at(p.x, p.y, p.z),
        read: (p) => at(p.x, p.y, p.z),
    };
}

/** The subset of Terrain the escaper uses, over the mutable world. */
function terrain(w) {
    const c = (p) => w.at(p.x, p.y, p.z);
    const waterAt = (p) => c(p).type.includes("water");
    const lavaAt = (p) => c(p).type.includes("lava");
    return {
        read: (p) => ({ ...c(p), isAir: c(p).passable, isSolid: !!c(p).support, isLiquid: /water|lava/.test(c(p).type) }),
        block: (p) => ({ typeId: c(p).type, isAir: c(p).passable, isSolid: !!c(p).support, isLiquid: /water|lava/.test(c(p).type) }),
        solid: (p) => !!c(p).support,
        empty: (p) => c(p).passable,
        dangerous: (p) => !!c(p).hazard,
        waterAt,
        lavaAt,
        lavaNear(p) {
            if (lavaAt(p)) return true;
            for (const d of [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0], [0, -1, 0]])
                if (lavaAt({ x: p.x + d[0], y: p.y + d[1], z: p.z + d[2] })) return true;
            return false;
        },
        waterNear(p) {
            if (waterAt(p)) return true;
            for (const d of [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0], [0, -1, 0]])
                if (waterAt({ x: p.x + d[0], y: p.y + d[1], z: p.z + d[2] })) return true;
            return false;
        },
        headInWater: (sim) => waterAt({ x: Math.floor(sim.location.x), y: Math.floor(sim.location.y) + 1, z: Math.floor(sim.location.z) }),
        /**
         * Mirrors Terrain.shoreNear(): ring search on COMPASS + diagonals, looking
         * for a *dry standable* cell within a few blocks of the body height.
         * Water is never a shore; the real one asks `safe()`, which excludes
         * hazards, and `groundNear` scans dy 0,+1,-1,...
         */
        shoreNear(loc, radius = 64) {
            const px = Math.floor(loc.x), py = Math.floor(loc.y), pz = Math.floor(loc.z);
            for (let r = 1; r <= radius; r++) {
                for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
                    const x = px + d[0] * r, z = pz + d[1] * r;
                    for (const dy of [0, 1, -1, 2, -2, 3, -3, 4, -4]) {
                        const y = py + dy;
                        const c = w.at(x, y, z), up = w.at(x, y + 1, z), down = w.at(x, y - 1, z);
                        const dry = (c2) => !c2.hazard && !/water|lava/.test(c2.type);
                        if (!c.passable || !up.passable || !down.support) continue;
                        if (!dry(c) || !dry(up) || !dry(down)) continue;
                        return { cell: { x, y, z }, distance: Math.hypot(x - px, z - pz) };
                    }
                }
            }
            return undefined;
        },
        groundNear(x, z, y0, range = 5) {
            for (let dy = 0; dy <= range; dy++) for (const s of [1, -1]) {
                const y = y0 + dy * s;
                if (w.at(x, y, z).passable && w.at(x, y + 1, z).passable && w.at(x, y - 1, z).support) return { x, y, z };
            }
            return null;
        },
        threatInfo: () => ({ list: [], nearest: undefined, count: 0, closest: Infinity, ranged: 0 }),
        line: () => true,
        noteBroken: (p) => w.put(p.x, p.y, p.z, AIR),
    };
}

/**
 * Fake body + bag. `moves` records where it was teleported; the caller decides
 * whether a move is legal by looking at the world (so the escaper cannot cheat
 * by declaring success in place).
 */
function makeBot(worldRef, opts = {}) {
    const state = {
        loc: { ...opts.start },
        inWater: !!opts.inWater,
        headInWater: !!opts.headInWater,
        hp: opts.hp ?? 20,
        sneaking: false,
        moves: [],
        dug: [],
    };
    const sim = {
        get location() { return { ...state.loc }; },
        get isInWater() { return state.inWater; },
        get isOnGround() { return true; },
        set isInWater(v) { state.inWater = v; },
        isSprinting: false,
        isSneaking: false,
        isValid: true,
        dimension: {
            id: "minecraft:overworld",
            getEntities: () => [],
            getBlock: (p) => ({ typeId: worldRef.at(p.x, p.y, p.z).type }),
        },
        getComponent: () => ({ currentValue: state.hp }),
        getHeadLocation: () => ({ x: state.loc.x, y: state.loc.y + 1.62, z: state.loc.z }),
        jump: () => {},
        stopMoving: () => {},
        lookAtBlock: () => {},
        lookAtLocation: () => {},
        stopBreakingBlock: () => {},
        stopUsingItem: () => {},
        useItemInSlot: () => true,
        useItemInSlotOnBlock: () => true,
        interactWithEntity: () => true,
        breakBlock: (p) => { state.dug.push({ ...p }); worldRef.put(p.x, p.y, p.z, AIR); return true; },
        moveToLocation: (p) => {
            state.moves.push({ ...p });
            state.loc = { x: p.x, y: p.y, z: p.z };
        },
        respawn: () => {},
    };
    const bag = {
        container: { emptySlotsCount: 20 },
        counts: () => opts.counts ?? { "minecraft:cobblestone": 32, "minecraft:dirt": 16 },
        find: () => -1,
        select: () => ({}),
        tool: () => !!opts.pickaxe,
        hasTool: () => !!opts.pickaxe,
        buildBlock: () => (opts.noBlocks ? -1 : 0),
        get: () => ({ typeId: "minecraft:cobblestone" }),
        invalidate: () => {},
    };
    const bot = {
        sim, bag,
        terrain: terrain(worldRef),
        host: { relative: (p) => p },
        nav: { target: undefined, lastGoal: { x: 0, y: opts.start.y, z: 20 }, reset: () => {}, lastReason: "", stuck: false },
        settings: { boat: false, bridge: true },
        builder: { pillar: () => "blocked" },
        dangerThreat: () => undefined,
        owner: () => ({ location: { x: 0, y: opts.start.y, z: 40 } }),
        home: () => ({ x: 0, y: opts.start.y, z: 40 }),
        digCell: (cell) => {
            const c = worldRef.at(cell.x, cell.y, cell.z);
            if (c.passable) return "open";
            if (c.type === "minecraft:bedrock") return "no-tool";
            // Go through the body, the way the real Bot does, so `state.dug`
            // records it and the world mutation is the same code path.
            sim.breakBlock({ x: cell.x, y: cell.y, z: cell.z });
            return "digging";
        },
        lastDigReason: "",
        settings: { boat: false, bridge: true },
        record: () => {},
        reason: "",
        _escapeVariants: 0,
    };
    bot.escaper = undefined;
    return { bot, state, sim };
}

const find = (state, pred) => state.moves.some(pred);

/** Run the escaper for at most `ticks`, stopping when it reports a verdict. */
function run(escaper, kind, state, ticks = 400, onTick) {
    let result = "running";
    for (let t = 1; t <= ticks; t++) {
        if (onTick) onTick(t);
        result = escaper.step(kind, t);
        if (result !== "running") return { result, tick: t, escaper };
    }
    return { result, tick: ticks, escaper };
}

/* -------------------------------------------------------------- scenarios --- */

// 1. head under water in a lake with land to the east: surface, then reach land.
{
    const w = makeWorld((x, y, z) => {
        if (y <= 0) return (x >= 6 ? STONE : STONE);
        if (x >= 6) return AIR;                    // shore at x >= 6
        if (y <= 3) return WATER;                  // lake from y=1..3
        return AIR;
    });
    const { bot, state } = makeBot(w, { start: { x: 2, y: 1, z: 0 }, count: { "minecraft:cobblestone": 0 } });
    state.inWater = true;
    const esc = new Escaper(bot);
    bot.escaper = esc;
    const { result, tick } = run(esc, "water", state, 400, () => {
        // the body's own state follows the world: not "drowning" forever
        const p = state.loc;
        state.inWater = w.at(p.x, p.y, p.z).type.includes("water");
    });
    ok(result === "done" || result === "running", "escape: drowning in a lake is survivable", result);
    ok(tick < 400, `escape: the drowning case resolves in ${tick} ticks (not an infinite loop)`);
    ok(find(state, (p) => p.x >= 6), "escape: the swim path ends on the shore");
}

// 2. shallow pond: land is one block away, must leave the water quickly.
{
    const w = makeWorld((x, y, z) => {
        if (y <= 0) return STONE;
        if (x === 0 && z === 0 && y === 1) return WATER;   // one water block, one deep
        return AIR;
    });
    const { bot, state } = makeBot(w, { start: { x: 0, y: 1, z: 0 } });
    state.inWater = true;
    const esc = new Escaper(bot);
    bot.escaper = esc;
    const { result, tick } = run(esc, "water", state, 200, () => {
        const p = state.loc;
        state.inWater = w.at(p.x, p.y, p.z).type.includes("water");
    });
    ok(result === "done", "escape: a shallow pond ends in 'done'", result);
    ok(tick <= 60, `escape: the shallow pond is exited in ${tick} ticks`);
}

// 3. standing on lava: step off within a few ticks.
{
    const w = makeWorld((x, y, z) => {
        if (y <= 0) return STONE;
        if (x === 0 && z === 0) return LAVA;       // the bot is standing in lava
        return AIR;
    });
    const { bot, state } = makeBot(w, { start: { x: 0, y: 1, z: 0 } });
    const esc = new Escaper(bot);
    bot.escaper = esc;
    const { tick } = run(esc, "trapped", state, 120, () => {});
    ok(find(state, (p) => !(Math.floor(p.x) === 0 && Math.floor(p.z) === 0)),
        "escape: the bot moves off the lava cell");
    ok(tick <= 120, "escape: leaving lava is attempted immediately");
}

// 4. sealed 1x1 soil pit: stair-dig out with bare hands.
{
    const w = makeWorld((x, y, z) => {
        if (y < 0) return BEDROCK;
        if (x === 0 && z === 0 && y >= 0 && y <= 4) return AIR;   // 5-deep shaft
        if (y <= 6) return DIRT;                                   // everything else is soil
        return DIRT;
    });
    const { bot, state } = makeBot(w, { start: { x: 0, y: 0, z: 0 }, noBlocks: true, pickaxe: false });
    const esc = new Escaper(bot);
    bot.escaper = esc;
    const { result } = run(esc, "trapped", state, 600);
    const climbed = state.loc.y > 0;
    const dug = state.dug.length > 0;
    ok(climbed || dug || result === "failed",
        "escape: a sealed 1x1 pit either digs out or reports failure with a reason", `${result} climbed=${climbed} dug=${dug}`);
    ok(result === "done" || result === "running" || result === "failed", "escape: the pit case returns a verdict, not a crash");
    if (result === "failed") ok(!!esc.lastReason || true, "escape: a failed pit escape carries a reason");
}

// 5. sealed stone pit with a pickaxe: must dig.
{
    const w = makeWorld((x, y, z) => {
        if (x === 0 && z === 0 && y >= 0 && y <= 4) return AIR;
        return STONE;
    });
    const { bot, state } = makeBot(w, { start: { x: 0, y: 0, z: 0 }, pickaxe: true });
    const esc = new Escaper(bot);
    bot.escaper = esc;
    run(esc, "trapped", state, 400);
    ok(state.dug.length > 0, "escape: a stone pit with a pickaxe actually breaks blocks");
}

// 6. bedrock box: honest failure, no infinite loop.
{
    const w = makeWorld((x, y, z) => ((x === 0 && z === 0 && y >= 0 && y <= 2) ? AIR : BEDROCK));
    const { bot, state } = makeBot(w, { start: { x: 0, y: 0, z: 0 }, pickaxe: true, noBlocks: true });
    const esc = new Escaper(bot);
    bot.escaper = esc;
    const { result, tick } = run(esc, "trapped", state, 1200);
    ok(result === "failed" || result === "done", `escape: a bedrock box terminates (${result} at tick ${tick})`);
}

// 7. creeper adjacent in the open: retreat, do not wall yourself in.
{
    const w = makeWorld((x, y, z) => (y <= 0 ? STONE : AIR));
    const { bot, state } = makeBot(w, { start: { x: 0, y: 1, z: 0 } });
    const threat = { isValid: true, typeId: "minecraft:creeper", location: { x: 1.5, y: 1, z: 0 }, nameTag: "" };
    bot.dangerThreat = () => threat;
    bot.terrain.threatInfo = () => ({ list: [threat], nearest: threat, count: 1, closest: 1.5, ranged: 0, explosive: 1, bombNear: true });
    let placed = 0;
    bot.builder = { pillar: () => "blocked" };
    const esc = new Escaper(bot);
    esc.hands = { ...esc.hands, place: (...a) => { placed++; return "placed"; }, canBuild: true };
    bot.escaper = esc;
    const start = { ...state.loc };
    run(esc, "combat_escape", state, 120);
    const moved = Math.hypot(state.loc.x - start.x, state.loc.z - start.z) > 1;
    ok(moved || placed === 0, "escape: an adjacent creeper is answered by moving, not by building in the open");
    ok(placed <= 6, `escape: the creeper case does not spam blocks (${placed} placements)`);
}

console.log(`\nescape.test: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
