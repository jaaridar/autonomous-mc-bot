/**
 * Offline tests for portal/dimension travel, the pathfinder service and the
 * navigator's wide-plan handoff. No Minecraft engine: synthetic dimensions.
 *
 * Run: node tools/run-all.mjs (or: node tools/travel.test.mjs after that copy exists)
 */
import {
    OVERWORLD,
    NETHER,
    scaleToNether,
    scaleToOverworld,
    linkedGuess,
    portalFrame,
    validatePortalFrame,
    findPortalNear,
    choosePortalAnchor,
    chooseArrival,
    portalAction,
    shouldReturnToOverworld,
    chooseNetherTarget,
    isPortalCell,
} from "./load/scripts/core/portal.js";
import { PathfinderService } from "./load/scripts/runtime/pathfinder.js";
import { Navigator } from "./load/scripts/runtime/navigation.js";
import { Terrain } from "./load/scripts/runtime/world.js";
import { Builder } from "./load/scripts/runtime/builder.js";

let pass = 0, fail = 0;
const check = (name, cond, detail) => {
    if (cond) pass++;
    else {
        fail++;
        console.log(`FAIL: ${name}${detail === undefined ? "" : " | " + JSON.stringify(detail).slice(0, 320)}`);
    }
};

/** Flat world with a materialised obsidian frame and optional portal blocks. */
function makeWorld(options = {}) {
    const types = new Map();
    const put = (p, type) => types.set(`${p.x},${p.y},${p.z}`, { passable: false, support: true, hazard: false, type });
    const read = (p) => {
        const k = `${p.x},${p.y},${p.z}`;
        if (types.has(k)) {
            const t = types.get(k);
            return { ...t, passable: t.passable === true };
        }
        if (p.y <= 63) return { passable: false, support: true, hazard: false, type: "minecraft:stone" };
        if (options.lava && options.lava.has(`${p.x},${p.y},${p.z}`)) return { passable: true, support: false, hazard: true, type: "minecraft:lava" };
        if (options.water && options.water.has(`${p.x},${p.y},${p.z}`)) return { passable: true, support: false, hazard: true, type: "minecraft:water" };
        return { passable: true, support: false, hazard: false, type: "minecraft:air" };
    };
    return { read, types, put };
}

function materialiseFrame(world, base, axis = "x", lit = false) {
    const plan = portalFrame(base, axis);
    for (const pos of plan.frame) world.put(pos, "minecraft:obsidian");
    for (const pos of plan.interior) {
        world.types.set(`${pos.x},${pos.y},${pos.z}`, { passable: true, support: false, hazard: false, type: lit ? "minecraft:nether_portal" : "minecraft:air" });
    }
    return plan;
}

// ---------------------------------------------------------------------------
// coordinate scaling + linking
// ---------------------------------------------------------------------------
{
    check("nether scale divides by 8", JSON.stringify(scaleToNether({ x: 80, y: 64, z: -160 })) === JSON.stringify({ x: 10, y: 64, z: -20 }));
    check("overworld scale multiplies by 8", JSON.stringify(scaleToOverworld({ x: 10, y: 64, z: -20 })) === JSON.stringify({ x: 80, y: 64, z: -160 }));
    check("scale floors fractions", scaleToNether({ x: 87, y: 70, z: 15 }).x === 10);
    const linked = linkedGuess({ x: 80, y: 70, z: -160 }, OVERWORLD, NETHER);
    check("linked guess overworld->nether", linked.x === 10 && linked.z === -20, linked);
    const back = linkedGuess({ x: 10, y: 70, z: -20 }, NETHER, OVERWORLD);
    check("linked guess nether->overworld", back.x === 80 && back.z === -160, back);
    check("same dimension link keeps coordinates", linkedGuess({ x: 3, y: 4, z: 5 }, NETHER, NETHER).x === 3);
}

// ---------------------------------------------------------------------------
// frame geometry + validation (10 required, corners optional)
// ---------------------------------------------------------------------------
{
    const plan = portalFrame({ x: 0, y: 64, z: 0 }, "x");
    check("frame: 14 blocks total", plan.frame.length === 14, plan.frame.length);
    check("frame: 10 required blocks", plan.required.length === 10, plan.required.length);
    check("frame: 2x3 interior", plan.interior.length === 6, plan.interior.length);
    check("frame: ignition is bottom interior", plan.ignition.x === 1 && plan.ignition.y === 65, plan.ignition);
    check("frame: standing spot is outside the plane", plan.stand.z === 1, plan.stand);
    const zAxis = portalFrame({ x: 0, y: 64, z: 0 }, "z");
    check("frame: z-axis rotates the plan", zAxis.frame.some((p) => p.z === 3), zAxis.frame);

    const world = makeWorld();
    materialiseFrame(world, { x: 0, y: 64, z: 0 });
    const complete = validatePortalFrame(world.read, { x: 0, y: 64, z: 0 });
    check("validate: complete frame is usable", complete.complete && complete.usable, complete);
    check("validate: interior clear", complete.interiorClear === true);

    // Remove a corner: still usable (vanilla accepts 10 obsidian).
    world.types.delete("0,64,0");
    const cornerless = validatePortalFrame(world.read, { x: 0, y: 64, z: 0 });
    check("validate: corners are optional", cornerless.usable === true, cornerless);

    // Remove a required side block.
    world.types.delete("0,66,0");
    const broken = validatePortalFrame(world.read, { x: 0, y: 64, z: 0 });
    check("validate: missing side is reported", broken.complete === false && broken.missing.some((p) => p.x === 0 && p.y === 66), broken.missing);

    // -----------------------------------------------------------------------
    // builder: ten obsidian + four scaffold corners is enough (order matters)
    // -----------------------------------------------------------------------
    {
        const build = (axis) => {
            const world = makeWorld();
            const placed = [];
            const slots = [
                { typeId: "minecraft:obsidian", amount: 10 },
                { typeId: "minecraft:dirt", amount: 8 },
            ];
            const bag = {
                size: slots.length,
                get: (i) => slots[i],
                find: (pred) => slots.findIndex(pred),
                select: (i) => slots[i],
                invalidate() {},
            };
            const builder = new Builder({
                sim: { lookAtBlock() {} },
                bag,
                terrain: {
                    block: () => ({ typeId: "minecraft:air", isAir: true, isSolid: false }),
                    empty: () => true,
                    lavaNear: () => false,
                    invalidate() {},
                },
                host: { relative: (p) => p },
            });
            builder.findSupportFor = () => ({ pos: { x: 0, y: 63, z: 0 } });
            builder.placeAt = (pos, anchor, opts = {}) => {
                const type = opts.blockType ?? "minecraft:dirt";
                if (world.types.has(`${pos.x},${pos.y},${pos.z}`)) return "occupied";
                world.put(pos, type);
                placed.push(type);
                return "placed";
            };
            for (let i = 0; i < 40; i++) {
                if (builder.buildPortalFrame({ x: 0, y: 64, z: 0 }, 0, axis) !== "placed") break;
            }
            const frame = validatePortalFrame(world.read, { x: 0, y: 64, z: 0 }, axis);
            return { frame, placed };
        };

        const x = build("x");
        check("builder: ten obsidian builds a usable frame", x.frame.complete && x.frame.usable, x.frame.missing);
        check("builder: exactly ten obsidian used", x.placed.filter((t) => t === "minecraft:obsidian").length === 10, x.placed);
        check("builder: four corners are scaffolding", x.placed.filter((t) => t !== "minecraft:obsidian").length === 4, x.placed);
        const z = build("z");
        check("builder: z-axis frame validates", z.frame.complete && z.frame.usable, z.frame.missing);
    }

    // Blocked interior.
    const blocked = makeWorld();
    materialiseFrame(blocked, { x: 0, y: 64, z: 0 });
    blocked.put({ x: 1, y: 66, z: 0 }, "minecraft:stone");
    const b = validatePortalFrame(blocked.read, { x: 0, y: 64, z: 0 });
    check("validate: blocked interior is not usable", b.complete && !b.usable && !b.interiorClear, b);
}

{
    // Portal detection uses a bounded coarse scan and can see a lit portal.
    const world = makeWorld();
    materialiseFrame(world, { x: 10, y: 64, z: 10 }, "x", true);
    const found = findPortalNear(world.read, { x: 8, y: 64, z: 8 }, 12);
    check("portal: coarse scan finds the frame", !!found, found);
    check("portal: portal block identified", isPortalCell(world.read({ x: 11, y: 65, z: 10 })) === true);
    check("portal: nothing found in an empty area", findPortalNear(world.read, { x: -40, y: 64, z: -40 }, 8) === null);
}

// ---------------------------------------------------------------------------
// anchor + arrival selection
// ---------------------------------------------------------------------------
{
    const world = makeWorld();
    const anchor = choosePortalAnchor(world.read, { x: 0, y: 64, z: 0 }, { radius: 6 });
    check("anchor: found on flat ground", !!anchor, anchor);
    check("anchor: base is above the floor", anchor && anchor.base.y === 64, anchor?.base);
    // Every frame cell must be open and floor-supported.
    check("anchor: frame cells are open", anchor && anchor.frame.every((p) => world.read(p).passable === true));

    // Lava pool blocks the nearest area.
    const hot = makeWorld({ lava: new Set(["0,64,0", "1,64,0", "0,64,1", "0,63,0"]) });
    const hotAnchor = choosePortalAnchor(hot.read, { x: 0, y: 64, z: 0 }, { radius: 6 });
    check("anchor: lava cells are never chosen", hotAnchor && !["0,64,0", "1,64,0", "0,64,1"].includes(`${hotAnchor.base.x},${hotAnchor.base.y},${hotAnchor.base.z}`), hotAnchor?.base);
}

{
    const world = makeWorld();
    const arrival = chooseArrival(world.read, { x: 0, y: 64, z: 0 }, { radius: 4 });
    check("arrival: safe cell found", !!arrival && arrival.pos.y === 64, arrival);
    check("arrival: no dig needed on open ground", arrival && arrival.needsDig === false);
    const hot = makeWorld();
    hot.types.set("0,64,0", { passable: true, support: false, hazard: true, type: "minecraft:lava" });
    const near = chooseArrival(hot.read, { x: 0, y: 64, z: 0 }, { radius: 3 });
    check("arrival: never lands in lava", !!near && !(near.pos.x === 0 && near.pos.z === 0), near);
    const capped = makeWorld();
    for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) capped.put({ x, y: 65, z }, "minecraft:stone");
    const dig = chooseArrival(capped.read, { x: 0, y: 64, z: 0 }, { radius: 2 });
    check("arrival: a blocked head reports needsDig", !!dig && dig.needsDig === true, dig);
    const bedrock = makeWorld();
    for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) bedrock.put({ x, y: 65, z }, "minecraft:bedrock");
    const noDig = chooseArrival(bedrock.read, { x: 0, y: 64, z: 0 }, { radius: 2 });
    check("arrival: never proposes digging bedrock", noDig === null, noDig);
}

// ---------------------------------------------------------------------------
// travel decisions
// ---------------------------------------------------------------------------
{
    check("travel: inside a portal waits for the engine", portalAction({ inPortal: true, waited: 5, graceTicks: 40 }) === "wait");
    check("travel: inside a portal past grace teleports", portalAction({ inPortal: true, waited: 80, graceTicks: 40 }) === "teleport");
    check("travel: next to a portal walks in", portalAction({ nearPortal: true }) === "walk");
    check("travel: complete frame ignites", portalAction({ frame: { complete: true, interiorClear: true } }) === "ignite");
    check("travel: blocked interior is cleared", portalAction({ frame: { complete: true, interiorClear: false } }) === "clear");
    check("travel: broken frame is repaired", portalAction({ frame: { complete: false } }) === "repair");
    check("travel: nothing nearby builds", portalAction({}) === "build");

    check("nether: low health returns", shouldReturnToOverworld({ dimension: NETHER, health: 5, hasReturnPortal: true }).return === true);
    check("nether: low food returns", shouldReturnToOverworld({ dimension: NETHER, food: 3, hasReturnPortal: true }).return === true);
    check("nether: missing return portal returns", shouldReturnToOverworld({ dimension: NETHER, hasReturnPortal: false }).return === true);
    check("nether: a healthy trip continues", shouldReturnToOverworld({ dimension: NETHER, health: 20, food: 18, hasReturnPortal: true }).return === false);
    check("overworld: nothing to return from", shouldReturnToOverworld({ dimension: OVERWORLD }).return === false);
}

{
    const here = { x: 0, y: 64, z: 0 };
    const targets = [
        { pos: { x: 20, y: 64, z: 0 }, kind: "quartz" },
        { pos: { x: 10, y: 64, z: 0 }, kind: "fortress" },
        { pos: { x: 400, y: 64, z: 0 }, kind: "bastion" },
    ];
    const choice = chooseNetherTarget(targets, here, { leash: 96, portal: here });
    check("nether: fortress preferred when close", choice?.target.kind === "fortress", choice);
    const none = chooseNetherTarget([{ pos: { x: 400, y: 64, z: 0 }, kind: "fortress" }], here, { leash: 96, portal: here });
    check("nether: targets beyond the leash are ignored", none === null);
    check("nether: empty list is safe", chooseNetherTarget([], here, {}) === null);
}

// ---------------------------------------------------------------------------
// pathfinder service: plan, cache, slicing, breakable filter
// ---------------------------------------------------------------------------
function fakeBot(read, options = {}) {
    let tick = options.tick ?? 1;
        return {
        settings: { parkour: true, bridge: true, pathDig: true, pathBridge: true, pathRadius: 64, pathNodes: 4000 },
        sim: { location: { x: 0.5, y: 64, z: 0.5 }, isInWater: false, jump() {}, isOnGround: true },
        terrain: {
            read,
            now: () => tick,
            scanOres: () => [],
            begin(t) { tick = t; },
        },
        awareness: { getLavaPool: () => null },
        bag: { tool: () => 0 },
        builder: { countBlocks: () => 8 },
        memory: { nearest: () => undefined, summary: () => ({}) },
        travel: { active: false },
        fault() {},
    };
}

{
    const world = makeWorld();
    const bot = fakeBot(world.read);
    const service = new PathfinderService(bot);
    const r = service.plan({ x: 0, y: 64, z: 0 }, { x: 20, y: 64, z: 0 });
    check("service: plan finds a route", r.status === "found" && r.path.length > 0, r.status);
    check("service: usable route reported", service.usable(r, { x: 0, y: 64, z: 0 }, { x: 20, y: 64, z: 0 }) === true);
    check("service: found counted", service.report().found >= 1, service.report());
    const before = service.report().plans;
    const again = service.plan({ x: 0, y: 64, z: 0 }, { x: 20, y: 64, z: 0 });
    check("service: identical plan is cached", again === r && service.report().plans === before, service.report());
    check("service: cache hit counted", service.report().cached >= 1);
    check("service: dirt is breakable", service.breakable("minecraft:dirt") === true);
    check("service: obsidian is not breakable", service.breakable("minecraft:obsidian") === false);
    check("service: bedrock is not breakable", service.breakable("minecraft:bedrock") === false);
    check("service: netherrack is breakable", service.breakable("minecraft:netherrack") === true);
    check("service: report has pending flag", service.report().pending === false);
}

{
    const world = makeWorld();
    const bot = fakeBot(world.read);
    const service = new PathfinderService(bot);
    const pending = service.begin({ x: 0, y: 64, z: 0 }, { x: 30, y: 64, z: 0 });
    check("service: begin creates a pending search", !!pending && service.report().pending === true);
    const slice = service.step(1, 5);
    check("service: a tiny slice stays searching", slice.status === "searching", slice.status);
    const done = service.step(2, 5000);
    check("service: a large slice finishes", done.status === "found", done.status);
    check("service: pending cleared after finishing", service.report().pending === false);
    service.invalidate();
    check("service: invalidate clears the route cache", service.report().cache === 0);
}

// ---------------------------------------------------------------------------
// navigator handoff: a dead end escalates to the wide plan
// ---------------------------------------------------------------------------
{
    const world = makeWorld();
    // Wall with a door: the rolling horizon cannot see it, the wide planner can.
    for (let z = -12; z <= 12; z++) for (let y = 64; y <= 68; y++) {
        if (z === 0 && y <= 65) continue;
        world.put({ x: 30, y, z }, "minecraft:stone");
    }
    const bot = fakeBot(world.read);
    const service = new PathfinderService(bot);
    const calls = { moves: 0 };
    const sim = {
        location: { x: 0.5, y: 64, z: 0.5 },
        isInWater: false,
        isOnGround: true,
        isSprinting: false,
        jump() {},
        moveToLocation() { calls.moves++; },
        stopMoving() {},
        getComponent: () => ({ currentValue: 20 }),
    };
    const host = { relative: (p) => p };
    const terrain = {
        read: world.read,
        safe: (p) => {
            const c = world.read(p);
            return c.passable === true && !c.hazard && world.read({ x: p.x, y: p.y + 1, z: p.z }).passable === true && world.read({ x: p.x, y: p.y - 1, z: p.z }).support === true;
        },
        freshSafe: () => true,
        block: (p) => ({ typeId: world.read(p).type, isAir: world.read(p).passable }),
        clear() {},
        invalidate() {},
        solid: (p) => world.read(p).support === true,
        headFrontObstruction: () => null,
        findObstructions: () => [],
    };
    const nav = new Navigator(sim, host, terrain);
    nav.pathfinder = service;
    nav.target = { x: 34.5, y: 64, z: 0.5 };
    check("nav: wide plan is adopted", nav.usePathfinder(1) === true, nav.reason);
    check("nav: adopted route is non-empty", nav.path.length > 0, nav.path.length);
    check("nav: wide plan counted", nav.widePlans === 1);
    check("nav: forceWide is cleared", nav.forceWide === false);
    check("nav: pathfinder handoff leaves A* search unused", nav.search === undefined);
    // Walk the adopted route a few ticks; it should issue real movement orders.
    const tick = { n: 1 };
    let status = "running";
    for (let i = 0; i < 40 && status === "running"; i++) {
        tick.n++;
        status = nav.go({ x: 34.5, y: 64, z: 0.5 }, tick.n);
    }
    check("nav: movement orders issued along the route", calls.moves > 0, calls);
}

// ---------------------------------------------------------------------------
// portal traveller state machine (fake engine)
// ---------------------------------------------------------------------------
{
    const world = makeWorld();
    materialiseFrame(world, { x: 10, y: 64, z: 10 }, "x", true);
    const notices = [];
    const bot = {
        sim: { dimension: { id: OVERWORLD }, location: { x: 8.5, y: 64, z: 8.5 } },
        terrain: { read: world.read, now: () => 1, block: (p) => ({ typeId: world.read(p).type, isAir: world.read(p).passable }), clear() {} },
        bag: { counts: () => ({ "minecraft:obsidian": 10 }), find: () => -1 },
        builder: { buildPortalFrame: () => "building", pillar: () => "placed" },
        memory: { nearest: () => undefined, notice: (...a) => notices.push(a), summary: () => ({}) },
        host: { relative: (p) => p },
        nav: { reset() {}, fast: true },
        navTo: () => "running",
        travel: undefined,
        tell() {},
        record() {},
        fault() {},
        pathfinder: { breakable: () => true },
        digCell: () => "digging",
    };
    const { PortalTraveler } = await import("./load/scripts/runtime/portal-travel.js");
    const traveller = new PortalTraveler(bot);
    check("traveller: idle by default", traveller.active === false);
    check("traveller: remembers a known portal", traveller.portalWithin(16, 1) !== null, traveller.portalWithin(16, 1));
    const started = traveller.begin(NETHER, { x: 10, y: 64, z: 10 }, 1);
    check("traveller: begin starts a trip", started === "started", started);
    check("traveller: target dimension set", traveller.targetDimension === NETHER);
    check("traveller: known portal is used", traveller.report().state === "enter" || traveller.report().state === "seek", traveller.report());
    check("traveller: same-dimension begin is a no-op", traveller.begin(OVERWORLD, { x: 1, y: 64, z: 1 }, 2) === "already");
    traveller.reset();
    check("traveller: reset returns to idle", traveller.active === false);
}

// ---------------------------------------------------------------------------
// full Outbound Nether run on a fake engine: build -> light -> enter -> arrive
// ---------------------------------------------------------------------------
{
    const { PortalTraveler } = await import("./load/scripts/runtime/portal-travel.js");
    const state = { tick: 1, obsidian: 10, currentPlan: undefined };
    const overworld = makeWorld();
    const nether = makeWorld();
    const blockView = (c, p) => ({
        typeId: c.type,
        location: { ...p },
        isAir: c.passable === true,
        isSolid: c.support === true,
        isLiquid: /water|lava/.test(c.type),
    });
    const fakeDim = (id, world) => ({
        id,
        getBlock(p) {
            const c = world.read(p);
            return c ? blockView(c, p) : undefined;
        },
    });
    const dims = { [OVERWORLD]: fakeDim(OVERWORLD, overworld), [NETHER]: fakeDim(NETHER, nether) };
    const spots = [];
    const memory = {
        nearest(kind, dim, pos) {
            const list = spots.filter((s) => s.kind === kind && s.dim === dim);
            list.sort((a, b) => Math.hypot(a.pos.x - pos.x, a.pos.z - pos.z) - Math.hypot(b.pos.x - pos.x, b.pos.z - pos.z));
            return list[0]?.pos;
        },
        notice(kind, pos, dim) {
            if (!spots.some((s) => s.kind === kind && s.dim === dim && s.pos.x === pos.x && s.pos.y === pos.y && s.pos.z === pos.z)) spots.push({ kind, pos: { ...pos }, dim });
        },
    };
    const terrain = new Terrain(dims[OVERWORLD]);
    terrain.clock = () => state.tick;
    const builder = {
        canBuild: true,
        countBlocks: () => 64,
        buildPortalFrame(base) {
            const plan = portalFrame(base, "x");
            state.currentPlan = plan;
            for (const pos of plan.frame) {
                const c = overworld.read(pos);
                if (!c.passable) continue;
                overworld.put(pos, "minecraft:obsidian");
                return "placed";
            }
            return "building";
        },
        pillar: () => "placed",
        placeAt: () => "placed",
    };
    const travellerRef = { current: undefined };
    const bot = {
        settings: { bridge: true, parkour: true, pathDig: true, pathBridge: true },
        sim: {
            dimension: dims[OVERWORLD],
            location: { x: 0.5, y: 64, z: 0.5 },
            isInWater: false,
            isOnGround: true,
            getComponent: () => ({ currentValue: 20 }),
            lookAtBlock() {},
            stopMoving() {},
            moveToLocation(p) { this.location = p; },
            useItemInSlot() {
                const plan = state.currentPlan;
                if (!plan) return false;
                for (const pos of plan.interior) overworld.types.set(`${pos.x},${pos.y},${pos.z}`, { passable: true, support: false, hazard: false, type: "minecraft:nether_portal" });
                return true;
            },
            teleport(loc, options) {
                this.dimension = options.dimension;
                this.location = loc;
                bot.terrain.retarget(options.dimension);
            },
        },
        terrain,
        bag: {
            counts: () => ({ "minecraft:obsidian": state.obsidian }),
            find: (pred) => (pred({ typeId: "minecraft:flint_and_steel" }) ? 0 : -1),
            select: () => ({ typeId: "minecraft:flint_and_steel" }),
            tool: () => 0,
        },
        builder,
        memory,
        host: { relative: (p) => p },
        nav: { reset() {}, fast: true, stuck: false, reason: "" },
        navTo(target) {
            bot.sim.location = target;
            return "done";
        },
        tell() {},
        record() {},
        fault() {},
        digCell: () => "digging",
        pathfinder: { breakable: () => true, invalidate() {} },
        dimensionFor: (id) => dims[id],
        get travel() { return travellerRef.current; },
    };
    const traveller = new PortalTraveler(bot);
    travellerRef.current = traveller;
    const started = traveller.begin(NETHER, { x: 0, y: 64, z: 0 }, state.tick);
    check("trip: trip starts", started === "started", started);
    let arrived = false;
    const trail = [];
    for (let i = 0; i < 300 && !arrived; i++) {
        state.tick++;
        terrain.begin(state.tick);
        const busy = traveller.tick(state.tick);
        const phase = traveller.report().state;
        if (trail.at(-1) !== phase) trail.push(phase);
        if (bot.sim.dimension.id === NETHER && traveller.report().state === "done") arrived = true;
        if (!busy && traveller.report().state === "failed") break;
    }
    check("trip: reaches the Nether autonomously", arrived, { state: traveller.report(), trail, location: bot.sim.location });
    check("trip: built a full portal frame", state.currentPlan && overworld.read(state.currentPlan.frame[0]).type !== "minecraft:air", trail);
    check("trip: portal was lit", state.currentPlan && overworld.read(state.currentPlan.interior[0]).type === "minecraft:nether_portal");
    check("trip: overworld portal remembered", spots.some((s) => s.kind === "portal" && s.dim === OVERWORLD), spots);
    check("trip: arrival has a safe floor", bot.sim.location.y >= 62, bot.sim.location);
    check("trip: traveller is no longer busy", traveller.active === false, traveller.report());
    check("trip: phase trail is sane", trail.includes("seek") || trail.includes("build") || trail.includes("enter"), trail);

    // Return trip with no nether obsidian uses the remembered overworld link.
    state.obsidian = 0;
    const back = traveller.begin(OVERWORLD, { x: Math.floor(bot.sim.location.x), y: 64, z: Math.floor(bot.sim.location.z) }, state.tick);
    check("return: trip starts", back === "started", back);
    let home = false;
    const backTrail = [];
    for (let i = 0; i < 300 && !home; i++) {
        state.tick++;
        terrain.begin(state.tick);
        traveller.tick(state.tick);
        const phase = traveller.report().state;
        if (backTrail.at(-1) !== phase) backTrail.push(phase);
        if (bot.sim.dimension.id === OVERWORLD && traveller.report().state === "done") home = true;
    }
    check("return: returns to the Overworld without nether obsidian", home, { state: traveller.report(), backTrail, dimension: bot.sim.dimension.id });
    check("return: linked transit was used", traveller.report().links === 1, traveller.report());
    check("return: home is near the remembered portal", Math.abs(bot.sim.location.x) < 16 && Math.abs(bot.sim.location.z) < 16, bot.sim.location);
}

console.log(`\ntravel/service: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
