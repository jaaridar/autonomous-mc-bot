import { Direction } from "@minecraft/server";
import { add, floor, center, distance, key, CARDINAL, COMPASS, UP, DOWN, away } from "../core/math.js";
import { diggable, HAZARDS } from "../core/policy.js";
import { Hands } from "./hands.js";
const FACES = new Map([
    ["1,0,0", Direction.East],
    ["-1,0,0", Direction.West],
    ["0,0,1", Direction.South],
    ["0,0,-1", Direction.North],
    ["0,1,0", Direction.Up],
    ["0,-1,0", Direction.Down],
]);
const dirFace = (d) => FACES.get(`${d.x},${d.y},${d.z}`);
/**
 * Last-resort mobility. Swims to shore, tunnels through a wall, bridges a gap,
 * or pillars up out of a pit. When trapped it probes the goal-ward direction
 * first and then the other three before giving up, so one sealed wall cannot
 * strand the bot. Every block placement is verified against the world before
 * the bot commits, and a failure becomes a blocked task rather than a silent
 * stall. Block placing only runs when `bridge` is enabled.
 */
export class Escaper {
    constructor(bot) {
        this.bot = bot;
        this.sim = bot.sim;
        this.bag = bot.bag;
        this.terrain = bot.terrain;
        this.nav = bot.nav;
        this.host = bot.host;
        this.hands = new Hands(bot);
        this.mode = "";
        this.since = 0;
        this.pillarStart = 0;
        this.placed = false;
        this.jumpFrom = undefined;
        this.pillarCol = undefined;
        this.breaking = "";
        this.steps = 0;
        this.lastReason = "";
        this.riding = false;
        this.ridingEntity = undefined;
        this.boatTries = 0;
        this.boatSince = 0;
        this.drowning = undefined;
        this.swimming = false;
        /** Direction the current escape committed to; sticky across calls. */
        this.escapeDir = undefined;
        /** Directions probed dead this escape session (lava, unbreakable, no tool). */
        this.deadDirs = [];
    }
    get active() {
        return !!this.mode;
    }
    reset() {
        if (this.riding)
            this.eject();
        this.mode = "";
        this.placed = false;
        this.pillarStart = 0;
        this.jumpFrom = undefined;
        this.pillarCol = undefined;
        this.breaking = "";
        this.crossing = undefined;
        this.steps = 0;
        this.boatTries = 0;
        this.drowning = undefined;
        this.swimming = false;
        this.escapeDir = undefined;
        this.deadDirs = [];
        this.sim.stopBreakingBlock();
        this.sim.isSneaking = false;
    }
    /**
     * Budget for plain "just move" escape steps. Once spent the plan hands
     * back to the pathfinder instead of turning one stuck moment into an
     * unbounded march. Tunnelling, bridging and pillaring are self-terminating
     * and do not draw on this budget.
     */
    bump() {
        if (++this.steps > 10) {
            this.lastReason = "Handing back to the pathfinder.";
            this.reset();
            return false;
        }
        return true;
    }
    /** Move helper for the generic escape branches. */
    walkTo(loc) {
        if (!this.bump())
            return "done";
        this.sim.moveToLocation(this.host.relative(loc), { faceTarget: true });
        return "running";
    }
    giveUp(reason) {
        this.lastReason = reason;
        this.reset();
        return "failed";
    }
    /** Entry point. `kind` is "water" or "trapped"; returns running/done/failed. */
    step(kind, tick) {
        if (this.mode !== kind) {
            this.reset();
            this.mode = kind;
            this.since = tick;
            this.placed = false;
            this.pillarStart = 0;
        }
        if (tick - this.since > 600) {
            // Water is endless: hand back rather than freeze, and let the brain
            // re-enter escape. Repeated no-progress attempts still stop it.
            if (kind === "water") {
                this.lastReason = "Still in the water; handing back to the task.";
                this.reset();
                return "done";
            }
            return this.giveUp("Escape attempt took too long; needs help.");
        }
        return kind === "water" ? this.water(tick) : this.trapped(tick);
    }
    /**
     * Stay alive in water: surface to breathe, then swim to the nearest shore.
     * When no shore is reachable and drowning is setting in, fall back to a
     * boat, which floats even if the engine ignores our steering input.
     */
    water(tick) {
        const sim = this.sim;
        if (this.riding) {
            const shore = this.terrain.shoreNear(sim.location, 24);
            if (!sim.isInWater || (shore && shore.distance <= 1.6)) {
                this.eject();
                this.lastReason = "Ashore; leaving the boat.";
                return "running";
            }
            if (shore) {
                sim.moveToLocation(this.host.relative(center(shore.cell)), { faceTarget: true });
                this.lastReason = "Boating to the nearest shore.";
                return "running";
            }
            if (tick - this.boatSince > 200) {
                this.eject();
                this.boatTries = 3;
                this.lastReason = "The boat is not getting anywhere; swimming for it.";
            }
            return "running";
        }
        if (!sim.isInWater) {
            if (this.swimming) {
                try {
                    sim.stopSwimming();
                }
                catch { /* not fatal */ }
                this.swimming = false;
            }
            this.reset();
            return "done";
        }
        this.nav.reset();
        sim.isSprinting = false;
        if (!this.swimming) {
            this.swimming = true;
            try {
                sim.swim();
            }
            catch { /* swim() is absent in some versions */ }
        }
        // Breathe first: rise until the head is clear of the water.
        if (this.terrain.headInWater(sim)) {
            if (this.drowning === undefined)
                this.drowning = tick;
            if (tick - this.drowning > 120 && this.boatTries < 3) {
                const r = this.boat(tick);
                if (r)
                    return r;
            }
            const p = sim.location;
            sim.jump();
            sim.moveToLocation(this.host.relative({ x: p.x, y: p.y + 1.6, z: p.z }));
            this.lastReason = "Surfacing to breathe.";
            return "running";
        }
        this.drowning = undefined;
        const shore = this.terrain.shoreNear(sim.location, 24);
        if (!shore) {
            if (this.boatTries < 3) {
                const r = this.boat(tick);
                if (r)
                    return r;
            }
            const owner = this.bot.owner();
            const toward = owner ? away(owner.location, sim.location) : { x: 0, y: 0, z: 1 };
            const p = sim.location;
            sim.moveToLocation(this.host.relative({
                x: p.x + toward.x * 2,
                y: p.y + 0.4,
                z: p.z + toward.z * 2,
            }), { faceTarget: true });
            this.lastReason = "No shore within 24 blocks; swimming on.";
            return "running";
        }
        sim.moveToLocation(this.host.relative(center(shore.cell)), { faceTarget: true });
        if (tick % 20 < 2)
            sim.jump();
        this.lastReason = `Swimming to shore (${shore.distance.toFixed(0)} blocks).`;
        return "running";
    }
    /** Nearest boat entity, if one is adrift nearby. */
    findBoat() {
        try {
            return this.sim.dimension.getEntities({
                type: "minecraft:boat",
                location: this.sim.location,
                maxDistance: 6,
            })[0];
        }
        catch {
            return undefined;
        }
    }
    /** Board a boat via the rideable component, falling back to interaction. */
    mount(boat) {
        try {
            const rideable = boat.getComponent("minecraft:rideable");
            if (rideable?.addRider?.(this.sim))
                return true;
        }
        catch { /* fall through to interaction */ }
        try {
            if (typeof this.sim.interactWithEntity === "function" && this.sim.interactWithEntity(boat))
                return true;
        }
        catch { /* fall through */ }
        try {
            return typeof this.sim.interact === "function" ? !!this.sim.interact() : false;
        }
        catch {
            return false;
        }
    }
    eject() {
        const boat = this.ridingEntity;
        this.riding = false;
        this.ridingEntity = undefined;
        try {
            const rideable = boat?.getComponent?.("minecraft:rideable");
            if (rideable?.ejectRider)
                rideable.ejectRider(this.sim);
            else if (rideable?.ejectRiders)
                rideable.ejectRiders();
        }
        catch { /* the game will drop us out on its own */ }
    }
    /**
     * Craft, place or board a boat. Returns undefined when boating is not
     * possible, so the caller can keep swimming instead of stalling.
     */
    boat(tick) {
        const b = this.bot, sim = this.sim;
        if (!b.settings.boat || this.boatTries >= 3)
            return undefined;
        const existing = this.findBoat();
        if (existing) {
            if (this.mount(existing)) {
                this.riding = true;
                this.ridingEntity = existing;
                this.boatSince = tick;
                this.boatTries++;
                this.lastReason = "Boarding a boat to keep afloat.";
                return "running";
            }
            this.boatTries = 3;
            return undefined;
        }
        let slot = this.bag.find((s) => s.typeId.endsWith("_boat"));
        if (slot < 0) {
            if (!b.settings.assistedCrafting) {
                this.boatTries = 3;
                return undefined;
            }
            try {
                b.craft("minecraft:oak_boat", 1);
            }
            catch (e) {
                this.lastReason = "Cannot make a boat: " + String(e).slice(0, 80);
                this.boatTries = 3;
                return undefined;
            }
            slot = this.bag.find((s) => s.typeId.endsWith("_boat"));
            if (slot < 0) {
                this.boatTries = 3;
                return undefined;
            }
        }
        this.boatTries++;
        const selected = this.bag.select(slot);
        const p = sim.location;
        sim.lookAtBlock(this.host.relative(center(floor(p))));
        try {
            sim.useItemInSlot(selected);
            this.lastReason = "Floating a boat.";
        }
        catch {
            this.lastReason = "The engine rejected placing a boat here.";
        }
        return "running";
    }
    /** Direction the bot should move to get out of trouble. */
    escapeDirection() {
        const p = floor(this.sim.location);
        const threat = this.bot.dangerThreat();
        if (threat?.isValid)
            return away(p, floor(threat.location));
        const target = this.nav.target ?? this.nav.lastGoal ?? this.bot.home() ?? this.bot.owner()?.location;
        if (target) {
            const dx = target.x - p.x, dz = target.z - p.z;
            if (Math.abs(dx) >= Math.abs(dz))
                return { x: Math.sign(dx) || 1, y: 0, z: 0 };
            return { x: 0, y: 0, z: Math.sign(dz) || 1 };
        }
        return CARDINAL[0];
    }
    /** Compass order for probing: committed direction first, then goal-ward, the sides, the back. */
    candidateDirs() {
        const pref = this.escapeDirection();
        const side = { x: -pref.z, y: 0, z: pref.x };
        const order = [pref, side, { x: -side.x, y: 0, z: -side.z }, { x: -pref.x, y: 0, z: -pref.z }];
        if (this.escapeDir) {
            const at = order.findIndex((d) => d.x === this.escapeDir.x && d.z === this.escapeDir.z);
            if (at > 0) {
                order.splice(at, 1);
                order.unshift(this.escapeDir);
            }
        }
        return order.filter((d) => !this.deadDirs.some((q) => q.x === d.x && q.z === d.z));
    }
    /**
     * What, if anything, a direction offers. Pure: reads the world, commits to
     * nothing. Kinds: climb, tunnel, bridge, drop, walk, dead (with a reason).
     */
    probe(dir, p) {
        const foot = add(p, dir), head = add(foot, UP), floorCell = add(foot, DOWN);
        if (this.terrain.solid(foot)) {
            // A clean one-block step up: no digging needed.
            if (this.terrain.empty(head) && this.terrain.empty(add(head, UP)))
                return { kind: "climb" };
            const footType = this.terrain.block(foot)?.typeId ?? "";
            const rule = diggable(footType);
            if (this.terrain.lavaNear(foot))
                return { kind: "dead", why: "lava beside the wall" };
            if (rule && (rule.tier === 0 || this.bag.tool("pickaxe", rule.tier)))
                return { kind: "tunnel" };
            if (!this.terrain.empty(head))
                return { kind: "dead", why: rule
                    ? `need a ${rule.tool} tier ${rule.tier} to break ${footType}`
                    : `${footType} is unbreakable` };
            return { kind: "dead", why: "no headroom to climb over" };
        }
        if (this.terrain.solid(head)) {
            // A one-high passage: open the ceiling cell so it becomes walkable.
            const headType = this.terrain.block(head)?.typeId ?? "";
            const rule = diggable(headType);
            if (this.terrain.lavaNear(head))
                return { kind: "dead", why: "lava beside the low ceiling" };
            if (rule && (rule.tier === 0 || this.bag.tool("pickaxe", rule.tier)))
                return { kind: "tunnel" };
            return { kind: "dead", why: rule
                ? `need a ${rule.tool} tier ${rule.tier} to break ${headType}`
                : `${headType} is unbreakable` };
        }
        const floorBlock = this.terrain.block(floorCell);
        if (!floorBlock || floorBlock.isLiquid || !floorBlock.isSolid) {
            if (this.bot.settings.bridge && this.bag.buildBlock() >= 0 && !this.terrain.dangerous(floorCell))
                return { kind: "bridge" };
            const drop = this.terrain.groundNear(foot.x, foot.z, foot.y - 1, 5);
            if (drop && !this.terrain.dangerous(drop))
                return { kind: "drop" };
            return { kind: "dead", why: "a gap with nothing safe to bridge or drop onto" };
        }
        return { kind: "walk" };
    }
    /**
     * General unstick: step off hazard, then probe directions in order -
     * goal-ward first, the sides and back if it is sealed - to dig through,
     * bridge over, climb or drop. Pillaring up and an honest give-up are the
     * last resorts, so a single bad wall cannot strand the bot.
     */
    trapped(tick) {
        const sim = this.sim;
        const p = floor(sim.location);
        if (this.terrain.dangerous(p) || this.terrain.dangerous(add(p, DOWN))) {
            const spot = COMPASS.map((d) => this.terrain.groundNear(p.x + d.x * 2, p.z + d.z * 2, p.y, 3))
                .filter((q) => q && !this.terrain.dangerous(q))
                .sort((a, b) => distance(a, sim.location) - distance(b, sim.location))[0];
            if (spot) {
                sim.isSprinting = true;
                this.lastReason = "Stepping off the hazard.";
                return this.walkTo(center(spot));
            }
        }
        const preferred = this.escapeDirection();
        const goalward = (d) => d.x === preferred.x && d.z === preferred.z;
        const why = [];
        for (const dir of this.candidateDirs()) {
            const plan = this.probe(dir, p);
            if (plan.kind === "dead") {
                if (!this.deadDirs.some((d) => d.x === dir.x && d.z === dir.z))
                    this.deadDirs.push(dir);
                const committed = this.escapeDir && this.escapeDir.x === dir.x && this.escapeDir.z === dir.z;
                if (committed)
                    this.escapeDir = undefined;
                if (goalward(dir))
                    why.unshift(plan.why);
                else
                    why.push(plan.why);
                continue;
            }
            const committed = this.escapeDir && this.escapeDir.x === dir.x && this.escapeDir.z === dir.z;
            // Side and back directions exist to break through or over; plain
            // walking belongs to the pathfinder, not the escape module.
            if (!committed && !goalward(dir) && (plan.kind === "walk" || plan.kind === "drop"))
                continue;
            this.escapeDir = dir;
            if (plan.kind === "tunnel") {
                const r = this.tunnel(dir, tick);
                if (r === "failed")
                    this.escapeDir = undefined;
                return r;
            }
            if (plan.kind === "bridge")
                return this.bridge(dir, tick);
            if (plan.kind === "climb") {
                if (sim.isOnGround)
                    sim.jump();
                this.lastReason = "Climbing out.";
                return this.walkTo(center(add(add(p, dir), UP)));
            }
            if (plan.kind === "drop") {
                const drop = this.terrain.groundNear(p.x + dir.x, p.z + dir.z, p.y - 1, 5);
                if (!drop || this.terrain.dangerous(drop))
                    continue;
                sim.isSprinting = true;
                this.lastReason = "Dropping to lower ground.";
                return this.walkTo(center(drop));
            }
            const walk = this.terrain.groundNear(p.x + dir.x, p.z + dir.z, p.y, 2);
            if (!walk || this.terrain.dangerous(walk))
                continue;
            sim.isSprinting = true;
            this.lastReason = "Walking out.";
            return this.walkTo(center(walk));
        }
        if (this.bot.settings.bridge && this.bag.buildBlock() >= 0)
            return this.pillar(tick);
        return this.giveUp(why.length
            ? "No way out: " + why[0] + "."
            : "No escape route and no building blocks; give me dirt or cobblestone to bridge or pillar out.");
    }
    /** Break the blocking cell(s) directly ahead so a path can be carved. */
    tunnel(dir, tick) {
        const sim = this.sim;
        const p = floor(sim.location);
        const foot = add(p, dir), head = add(foot, UP);
        const cells = [foot, head].filter((c) => this.terrain.solid(c));
        if (!cells.length) {
            const walk = this.terrain.groundNear(foot.x, foot.z, p.y, 3);
            if (walk && !this.terrain.dangerous(walk)) {
                sim.moveToLocation(this.host.relative(center(walk)), { faceTarget: true });
                this.lastReason = "Tunnelling forward.";
                return "running";
            }
            return this.giveUp("Tunnel opened but no walkable cell ahead.");
        }
        if (tick - this.since > 400)
            return this.giveUp("Tunnel escape timed out.");
        const cell = cells[0], type = this.terrain.block(cell)?.typeId;
        if (this.terrain.lavaNear(cell))
            return this.giveUp("Refusing to tunnel beside lava.");
        const rule = diggable(type);
        if (!rule)
            return this.giveUp(`Cannot break ${type} to escape.`);
        if (rule.tier > 0) {
            if (!this.bag.tool("pickaxe", rule.tier))
                return this.giveUp(`Need a ${rule.tool} tier ${rule.tier} to tunnel out.`);
        }
        else if (rule.tool === "axe")
            this.bag.tool("axe");
        else if (rule.tool === "shovel")
            this.bag.tool("shovel");
        if (this.breaking !== key(cell)) {
            sim.lookAtBlock(this.host.relative(center(cell)));
            if (!sim.breakBlock(this.host.relative(center(cell))))
                return this.giveUp(`${type} is out of reach to tunnel through.`);
            this.breaking = key(cell);
        }
        this.lastReason = "Tunnelling through " + type;
        return "running";
    }
    /**
     * Extend a walkable surface one block toward `dir` over a gap, then step
     * onto it. Never bridges over lava/fire. Call repeatedly to cross a span.
     */
    bridge(dir, tick) {
        const sim = this.sim;
        // Finish stepping onto a block we just placed before extending further.
        if (this.crossing) {
            const walk = this.crossing;
            if (!this.terrain.solid(add(walk, DOWN))) {
                this.crossing = undefined;
            }
            else {
                sim.isSprinting = false;
                sim.moveToLocation(this.host.relative(center(walk)), { faceTarget: true });
                const flat = Math.hypot(sim.location.x - (walk.x + 0.5), sim.location.z - (walk.z + 0.5));
                if (flat < 0.6 && Math.abs(sim.location.y - walk.y) < 1.1) {
                    this.crossing = undefined;
                    this.lastReason = "Crossed a bridge.";
                    // Keep extending while the gap continues toward the goal;
                    // returning "done" on every single block would hand the
                    // whole span back to the pathfinder one cell at a time.
                    const n = this.escapeDir ?? this.escapeDirection();
                    const q = floor(sim.location);
                    const t = add(add(q, DOWN), n);
                    const tb = this.terrain.block(t);
                    const gap = !tb || tb.isAir || tb.isLiquid;
                    if (gap && !this.terrain.solid(t) && !this.lavaAhead(t))
                        return "running";
                    return "done";
                }
                return "running";
            }
        }
        const p = floor(sim.location);
        const anchor = add(p, DOWN), target = add(anchor, dir), walk = add(target, UP);
        if (this.lavaAhead(target))
            return this.giveUp("Refusing to bridge over lava/fire.");
        if (tick - this.since > 500)
            return this.giveUp("Bridge escape timed out.");
        if (this.terrain.solid(target)) {
            // Terrain already continues; just walk on.
            sim.isSprinting = false;
            sim.moveToLocation(this.host.relative(center(walk)), { faceTarget: true });
            this.crossing = walk;
            this.lastReason = "Stepping across.";
            return "running";
        }
        const tb = this.terrain.block(target);
        if (tb && !tb.isAir && !tb.isLiquid && !tb.isSolid) {
            // grass, a flower or a snow layer in the line: sweep it, place next tick.
            sim.lookAtBlock(this.host.relative(center(target)));
            sim.breakBlock(this.host.relative(center(target)));
            this.lastReason = "Clearing the bridge line.";
            return "running";
        }
        const f = dirFace(dir);
        if (!f)
            return this.giveUp("Invalid bridge direction.");
        const placed = this.hands.place(anchor, f, { sneak: true });
        if (placed === "no-block")
            return this.giveUp("No building blocks to bridge with.");
        if (placed === "rejected")
            return this.giveUp("Bridge placement rejected by engine.");
        this.crossing = walk;
        this.lastReason = "Bridging a gap.";
        return "running";
    }
    /** Lava or fire in the cell, or lava directly under it. Water is fine. */
    lavaAhead(cell) {
        const b = this.terrain.block(cell);
        if (b && !b.isAir && !b.isLiquid && HAZARDS.has(b.typeId))
            return true;
        return this.terrain.lavaNear(cell);
    }
    /**
     * Build a 1x1 tower to leave a pit; stops once a lateral exit exists.
     * The block goes back into the cell the bot jumped out of, placed on top
     * of the old floor - never under the airborne bot, where the engine would
     * always refuse it because the cell is occupied.
     */
    pillar(tick) {
        const sim = this.sim;
        const p = floor(sim.location);
        if (!this.pillarStart)
            this.pillarStart = p.y;
        const exit = COMPASS.map((d) => this.terrain.groundNear(p.x + d.x * 2, p.z + d.z * 2, p.y, 2)).find((q) => q && Math.abs(q.y - p.y) <= 1 && !this.terrain.dangerous(q));
        if (exit && sim.isOnGround && p.y > this.pillarStart + 1) {
            this.reset();
            this.lastReason = "Pillar reached open ground.";
            return "done";
        }
        if (tick - this.since > 400)
            return this.giveUp("Pillar escape timed out.");
        if (!this.hands.canBuild)
            return this.giveUp("No building blocks to pillar out with.");
        sim.isSneaking = true;
        if (sim.isOnGround) {
            // Remember the cell being jumped out of; it is the cell to fill.
            this.jumpFrom = p.y;
            this.pillarCol = { x: p.x, z: p.z };
            sim.jump();
            return "running";
        }
        // Airborne: the old feet cell is only free once the feet have risen
        // fully above it, so only place on the ticks where that is true.
        if (this.jumpFrom !== undefined && this.pillarCol && p.y > this.jumpFrom) {
            const anchor = { x: this.pillarCol.x, y: this.jumpFrom - 1, z: this.pillarCol.z };
            const r = this.hands.place(anchor, Direction.Up, { sneak: true });
            if (r === "no-block")
                return this.giveUp("No building blocks to pillar out with.");
            if (r === "placed" || this.terrain.solid({ ...this.pillarCol, y: this.jumpFrom }))
                this.lastReason = "Pillaring up out of a pit.";
        }
        return "running";
    }
}
