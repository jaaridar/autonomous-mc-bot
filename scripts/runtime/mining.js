import { add, floor, center, horizontal, distance, UP, DOWN } from "../core/math.js";
import { oreLevel, isBulk, bulkLevel } from "../core/ores.js";
/** Corridor cells dug before the miner calls it a day and heads back up. */
const STEP_LIMIT = 200;
/** Straight run before the tunnel turns, so branches fan out instead of one line. */
const RUN_LENGTH = 16;
const short = (id) => id.replace("minecraft:", "");
/**
 * Underground ore hunting. It owns a 45-degree staircase down to an ore's
 * `best` Y, then a turning corridor that keeps exposing fresh faces, and it
 * remembers the exact cells it walked so it can climb back out without the
 * surface pathfinder (whose vertical range cannot span a whole shaft).
 *
 * It never breaks a cell with lava or water as a neighbour, never opens a hole
 * under itself, and never cuts into a gap it cannot stand in - those cases turn
 * the tunnel instead, so a world-class run does not end in a lava bath.
 */
export class Miner {
    constructor(bot) {
        this.bot = bot;
        this.reset();
    }
    get active() {
        return !!this.site || this.underground;
    }
    reset() {
        this.site = undefined;
        this.underground = false;
        this.route = [];
        this.dig = undefined;
        this.dir = { x: 0, y: 0, z: 1 };
        this.run = 0;
        this.dug = 0;
        this.turns = 0;
        this.wantsOut = false;
        this.moving = undefined;
        this.ascentStarted = false;
        this.ascendSince = 0;
        this.since = 0;
        this.gaveUpAt = 0;
        /** Set when a dig ran into open space (cave, ravine, aquifer). */
        this.cavityAt = 0;
        /** Stack being walked over so the shaft actually collects its drops. */
        this.grabDrop = undefined;
        /** Times falling sand/gravel re-filled the doorway currently being opened. */
        this.refills = 0;
        this.reason = "No shaft started.";
    }
    /**
     * The engine picks drops up when the bot stands on them; this walks it
     * over nearby stacks so a staircase actually collects what it mines.
     * Bounded: one stack at a time, 100 ticks, then tunnel work resumes.
     */
    maybeCollect(tick) {
        const b = this.bot;
        const g = this.grabDrop;
        if (g && (!g.e.isValid || tick - g.since > 100)) {
            this.grabDrop = undefined;
            return "clear";
        }
        if (g) {
            const loc = g.e.location;
            this.reason = "Collecting mined drops.";
            if (horizontal(b.sim.location, loc) < 1.1 &&
                Math.abs(b.sim.location.y - loc.y) < 1.6)
                return "busy";
            this.stepTo(floor(loc), tick);
            return "busy";
        }
        if (b.bag.container.emptySlotsCount < 1)
            return "clear";
        const near = b.sim.dimension
            .getEntities({ type: "minecraft:item", location: b.sim.location, maxDistance: 4.5 })
            .filter((e) => e.isValid &&
            Math.abs(e.location.y - b.sim.location.y) <= 1.6 &&
            !b.terrain.dangerous(floor(e.location)))
            .sort((x, y) => distance(x.location, b.sim.location) - distance(y.location, b.sim.location))[0];
        if (near) {
            this.grabDrop = { e: near, since: tick };
            return "busy";
        }
        return "clear";
    }
    /**
     * The dig met something it cannot open honestly (water, lava, a refusing
     * or unreachable cell). Turning is the plan; standing there is not. Tool
     * problems still surface so the brain can ask for gear.
     */
    faced(r) {
        if (r === "no-tool")
            return r;
        this.turn();
        this.reason = r === "water" || r === "lava"
            ? `Water or lava ahead (${r}); turning the tunnel.`
            : `The next cell will not open (${r}); turning the tunnel.`;
        return "working";
    }
    /**
     * Falling sand/gravel can re-fill the doorway that was just opened while
     * the bot is mid-move. Re-opening is the answer; after three refills the
     * tunnel turns instead of fighting the landslide forever.
     */
    refilled() {
        if (!this.moving)
            return false;
        const b = this.bot, t = this.moving;
        if (!b.terrain.solid(t) && !b.terrain.solid(add(t, UP)))
            return false;
        this.moving = undefined;
        if (++this.refills > 3) {
            this.refills = 0;
            this.reason = "Sand keeps collapsing; turning the tunnel.";
            this.turn();
        }
        else
            this.reason = "Falling sand refilled the step; re-opening.";
        return true;
    }
    /* ------------------------------- plumbing ------------------------------ */
    /** Open every solid cell in `cells`, highest first, tracking the dig. */
    open(cells, tick) {
        const b = this.bot;
        if (this.dig) {
            if (!b.terrain.solid(this.dig.cell)) {
                this.dig = undefined;
            }
            else if (tick - this.dig.since > 240) {
                this.dig = undefined;
                this.reason = "Digging stalled; turning the tunnel.";
                return "stalled";
            }
            else {
                return "digging";
            }
        }
        const todo = cells.filter((c) => b.terrain.solid(c));
        if (!todo.length)
            return "open";
        const cell = todo.sort((a, z) => z.y - a.y)[0];
        const r = b.digCell(cell, tick);
        if (r === "open")
            return "open";
        if (r !== "digging") {
            this.reason = b.lastDigReason;
            return r;
        }
        this.dig = { cell, since: tick };
        return "digging";
    }
    /** Walk one cell (jumping when it is higher). */
    stepTo(cell, tick) {
        const b = this.bot;
        const loc = center(cell);
        if (horizontal(b.sim.location, loc) < 0.5 &&
            Math.abs(b.sim.location.y - cell.y) < 1.2)
            return "arrived";
        b.nav.reset();
        b.sim.isSprinting = false;
        if (cell.y > floor(b.sim.location).y)
            b.sim.jump();
        b.sim.moveToLocation(b.host.relative(loc), { faceTarget: true });
        return "moving";
    }
    /** Issue a forward move; `settle` records it once the bot actually arrives. */
    goTo(cell, tick) {
        const b = this.bot;
        void tick;
        this.moving = { ...cell };
        b.nav.reset();
        b.sim.isSprinting = false;
        if (cell.y > floor(b.sim.location).y)
            b.sim.jump();
        b.sim.moveToLocation(b.host.relative(center(cell)), { faceTarget: true });
    }
    /**
     * Complete an in-flight move. The route is only recorded once the bot is
     * actually standing in the cell, which is what makes the ascent retraceable.
     */
    settle() {
        if (!this.moving)
            return "arrived";
        const b = this.bot, cell = this.moving;
        if (horizontal(b.sim.location, center(cell)) < 0.5 &&
            Math.abs(b.sim.location.y - cell.y) < 1.2) {
            this.moving = undefined;
            this.route.push({ ...cell });
            this.dug++;
            this.turns = 0;
            this.refills = 0;
            this.maybeTorch();
            return "arrived";
        }
        this.goTo(cell, 0);
        return "moving";
    }
    turn() {
        const d = this.dir;
        this.dir = d.x !== 0 ? { x: 0, y: 0, z: d.x } : { x: -d.z, y: 0, z: 0 };
        this.turns++;
        this.run = 0;
        this.refills = 0;
    }
    /** Drop a torch behind the bot so mobs do not spawn in the shaft. */
    maybeTorch() {
        if (this.dug % 8 !== 0 || this.route.length < 2)
            return;
        const behind = this.route[this.route.length - 2];
        this.bot.placeTorch(add(behind, DOWN));
    }
    /* ------------------------------- descent ------------------------------- */
    /** One 45-degree step down. Returns stepped/working/<failure>. */
    descendStep(tick) {
        const b = this.bot, p = floor(b.sim.location);
        if (this.maybeCollect(tick) === "busy")
            return "working";
        if (this.moving) {
            if (this.refilled())
                return "working";
            return this.settle() === "arrived" ? "stepped" : "working";
        }
        // Every direction is blocked: stop digging down and mine where we are.
        if (this.turns >= 4) {
            this.reason = "No safe stair in any direction; mining at this level instead.";
            return "give-up";
        }
        const n = { x: p.x + this.dir.x, y: p.y - 1, z: p.z + this.dir.z };
        const floorCell = add(n, DOWN);
        // No floor to land on: never open a hole over a drop or lava.
        if (!b.terrain.solid(floorCell)) {
            this.cavityAt = tick;
            this.turn();
            this.reason = "No floor for the next stair; turning.";
            return "working";
        }
        if (b.terrain.lavaNear(n)) {
            this.cavityAt = tick;
            this.turn();
            this.reason = "Lava beside the stair; turning.";
            return "working";
        }
        if (b.terrain.waterNear(n)) {
            this.cavityAt = tick;
            this.turn();
            this.reason = "Water beside the stair; turning.";
            return "working";
        }
        const r = this.open([add(n, UP), n], tick);
        if (r === "digging")
            return "working";
        if (r !== "open")
            return this.faced(r);
        this.goTo(n, tick);
        return "working";
    }
    /**
     * Make sure the bot is at the right depth with a valid shaft. Starts a new
     * site when needed and walks to the mine head on the surface.
     */
    ensure(m, tick) {
        const b = this.bot;
        const p = floor(b.sim.location);
        const item = m.deepItem ?? m.item;
        const level = oreLevel(item) ?? (isBulk(item) ? bulkLevel(p.y) : undefined);
        if (!level)
            return "at-depth";
        if (this.underground) {
            // A water pocket or cave may have stopped the stairs once; after
            // the corridor has moved on, try again from the fresh column, so
            // deep targets are actually reached instead of never.
            if (this.site &&
                p.y > this.site.targetY + 2 &&
                this.dug - (this.gaveUpAt ?? 0) > 10) {
                this.underground = false;
                this.turns = 0;
                this.reason = "Trying the stairs again from a fresh spot.";
            }
            else if (p.y > level.max + 4) {
                return this.descendStep(tick) === "give-up" ? "at-depth" : "working";
            }
            else
                return "at-depth";
        }
        if (!this.site) {
            this.site = { origin: { ...p }, targetY: level.best };
            this.route = [{ ...p }];
            this.dug = 0;
            this.since = tick;
            this.reason = `Opening a shaft to Y=${level.best} for ${short(item)}.`;
        }
        // Surface travel to the shaft head, only before the first stair is cut.
        if (this.dug === 0 && horizontal(b.sim.location, center(this.site.origin)) > 2) {
            const r = b.nav.go(center(this.site.origin), tick);
            this.reason = `Walking to the mine head for ${short(item)}.`;
            if (r === "failed" || r === "blocked")
                return "blocked";
            return "working";
        }
        const r = this.descendStep(tick);
        if (r === "no-tool" || r === "stalled")
            return r;
        if (r === "give-up" || floor(b.sim.location).y <= level.best) {
            if (r === "give-up")
                this.gaveUpAt = this.dug;
            this.turns = 0;
            this.underground = true;
            this.reason = `At Y=${floor(b.sim.location).y}; driving a corridor for ${short(item)}.`;
            return "at-depth";
        }
        return "working";
    }
    /* ------------------------------- corridor ------------------------------ */
    /** Extend the corridor one cell at the mining level. */
    advance(m, tick) {
        const b = this.bot;
        if (!this.underground)
            return "at-depth";
        if (this.maybeCollect(tick) === "busy")
            return "working";
        if (this.moving) {
            if (this.refilled())
                return "working";
            return this.settle() === "arrived" ? "stepped" : "working";
        }
        if (this.dug >= STEP_LIMIT) {
            this.wantsOut = true;
            this.reason = `Dug ${this.dug} blocks without a vein; heading back up.`;
            return "exhausted";
        }
        if (this.turns >= 4) {
            this.wantsOut = true;
            this.reason = "Boxed in underground; heading back up.";
            return "exhausted";
        }
        if (this.run >= RUN_LENGTH) {
            this.turn();
            this.reason = "Turning the tunnel to open a fresh branch.";
        }
        const p = floor(b.sim.location);
        const n = { x: p.x + this.dir.x, y: p.y, z: p.z + this.dir.z };
        const floorCell = add(n, DOWN);
        if (!b.terrain.solid(floorCell)) {
            this.cavityAt = tick;
            this.turn();
            this.reason = "Gap ahead; turning the tunnel.";
            return "working";
        }
        const r = this.open([add(n, UP), n], tick);
        if (r === "digging")
            return "working";
        if (r !== "open")
            return this.faced(r);
        this.run++;
        this.goTo(n, tick);
        return "working";
    }
    /* -------------------------------- ascent ------------------------------- */
    /** Retrace the recorded stair/corridor cells back to the surface. */
    ascend(tick) {
        const b = this.bot;
        if (!this.ascentStarted) {
            this.ascentStarted = true;
            this.ascendSince = tick;
        }
        if (this.dig) {
            if (b.terrain.solid(this.dig.cell) && tick - this.dig.since < 240)
                return "working";
            this.dig = undefined;
        }
        while (this.route.length) {
            const tail = this.route[this.route.length - 1];
            if (horizontal(b.sim.location, center(tail)) < 1.0 &&
                Math.abs(b.sim.location.y - tail.y) < 1.4)
                this.route.pop();
            else
                break;
        }
        if (this.route.length <= 1) {
            const origin = this.site?.origin;
            if (!origin ||
                (horizontal(b.sim.location, center(origin)) < 2.0 &&
                    Math.abs(b.sim.location.y - origin.y) < 2.0)) {
                this.reset();
                this.reason = "Back on the surface.";
                return "surface";
            }
        }
        if (!this.route.length) {
            this.reset();
            this.reason = "Back on the surface.";
            return "surface";
        }
        if (tick - this.ascendSince > 3000) {
            this.reason = "Could not retrace the shaft; needs help getting out.";
            this.wantsOut = false;
            return "stalled";
        }
        const next = this.route[this.route.length - 1];
        if (this.stepTo(next, tick) === "arrived")
            this.route.pop();
        this.reason = `Climbing the shaft (${this.route.length} cells to go).`;
        return "working";
    }
}
