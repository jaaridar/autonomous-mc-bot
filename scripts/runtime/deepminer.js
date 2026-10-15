/**
 * DeepMiner - advanced deep mining with branch mining, vein clustering, efficient resource management.
 * Replaces/supplements old Miner for deep ores.
 */
import { floor, add, center, distance, key, horizontal } from "../core/math.js";
import { bestYFor, clusterVeins, branchPattern, optimalSpacing } from "../core/mining-strategy.js";
import { valueOf, isPassable } from "../core/blocks.js";
import { MINE } from "../core/policy.js";
import { UP, DOWN, CARDINAL } from "../core/math.js";

const STEP_LIMIT = 300;
const RUN_LENGTH = 20;

export class DeepMiner {
    constructor(bot) {
        this.bot = bot;
        this.sim = bot.sim;
        this.bag = bot.bag;
        this.terrain = bot.terrain;
        this.host = bot.host;
        this.nav = bot.nav;
        this.builder = bot.builder;
        this.reset();
    }

    reset() {
        this.phase = "idle"; // idle, shaft, branch, vein, ascend, prospect
        this.site = undefined;
        this.route = [];
        this.dig = undefined;
        this.dir = { x: 1, y: 0, z: 0 };
        this.run = 0;
        this.dug = 0;
        this.turns = 0;
        this.wantsOut = false;
        this.moving = undefined;
        this.ascentStarted = false;
        this.ascendSince = 0;
        this.since = 0;
        this.gaveUpAt = 0;
        this.cavityAt = 0;
        this.grabDrop = undefined;
        this.refills = 0;
        this.targetY = undefined;
        this.branchPath = [];
        this.branchIndex = 0;
        this.veins = [];
        this.currentVein = undefined;
        this.veinKey = undefined;
        this.veinSince = 0;
        this.veinDugAt = -1;
        this.reason = "No deep mine active.";
        this.torchTimer = 0;
    }

    get active() { return this.phase !== "idle"; }

    /**
     * Start deep mining for a specific ore.
     */
    start(oreType, tick) {
        this.reset();
        const p = floor(this.sim.location);
        this.targetY = bestYFor(oreType);
        this.site = { origin: { ...p }, targetY: this.targetY, ore: oreType };
        this.route = [{ ...p }];
        this.phase = "shaft";
        this.since = tick;
        this.reason = `Starting deep shaft to Y=${this.targetY} for ${oreType}`;
        return true;
    }

    /**
     * Collect drops near bot (same as old miner but more robust)
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
            if (horizontal(b.sim.location, loc) < 1.1 && Math.abs(b.sim.location.y - loc.y) < 1.6)
                return "busy";
            this.stepTo(floor(loc), tick);
            return "busy";
        }
        if (b.bag.container.emptySlotsCount < 1) return "clear";
        const near = b.sim.dimension.getEntities({ type: "minecraft:item", location: b.sim.location, maxDistance: 4.5 })
            .filter(e => e.isValid && Math.abs(e.location.y - b.sim.location.y) <= 1.6 && !b.terrain.dangerous(floor(e.location)))
            .sort((x,y) => distance(x.location, b.sim.location) - distance(y.location, b.sim.location))[0];
        if (near) {
            this.grabDrop = { e: near, since: tick };
            return "busy";
        }
        return "clear";
    }

    open(cells, tick) {
        const b = this.bot;
        if (this.dig) {
            if (!b.terrain.solid(this.dig.cell)) {
                this.dig = undefined;
            } else if (tick - this.dig.since > 240) {
                this.dig = undefined;
                this.reason = "Digging stalled; turning.";
                return "stalled";
            } else if (tick - (this.dig.retryAt ?? this.dig.since) >= 90) {
                // One absorbed swing must not freeze the tunnel: re-issue the dig.
                this.dig.retryAt = tick;
                const rr = b.digCell(this.dig.cell, tick);
                if (rr === "open") { this.dig = undefined; return "open"; }
                if (rr !== "digging") { this.dig = undefined; this.reason = b.lastDigReason; return rr; }
                return "digging";
            } else {
                return "digging";
            }
        }
        const todo = cells.filter(c => b.terrain.solid(c));
        if (!todo.length) return "open";
        const cell = todo.sort((a,z) => z.y - a.y)[0];
        const r = b.digCell(cell, tick);
        if (r === "open") return "open";
        if (r !== "digging") {
            this.reason = b.lastDigReason;
            return r;
        }
        this.dig = { cell, since: tick };
        return "digging";
    }

    stepTo(cell, tick) {
        const b = this.bot;
        const loc = center(cell);
        if (horizontal(b.sim.location, loc) < 0.5 && Math.abs(b.sim.location.y - cell.y) < 1.2)
            return "arrived";
        b.nav.reset();
        b.sim.isSprinting = false;
        if (cell.y > floor(b.sim.location).y) b.sim.jump();
        b.sim.moveToLocation(b.host.relative(loc), { faceTarget: true });
        return "moving";
    }

    goTo(cell, tick) {
        this.moving = { ...cell };
        const b = this.bot;
        b.nav.reset();
        b.sim.isSprinting = false;
        if (cell.y > floor(b.sim.location).y) b.sim.jump();
        b.sim.moveToLocation(b.host.relative(center(cell)), { faceTarget: true });
    }

    settle() {
        if (!this.moving) return "arrived";
        const b = this.bot, cell = this.moving;
        if (horizontal(b.sim.location, center(cell)) < 0.5 && Math.abs(b.sim.location.y - cell.y) < 1.2) {
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

    maybeTorch() {
        if (this.dug % 8 !== 0 || this.route.length < 2) return;
        const behind = this.route[this.route.length - 2];
        this.bot.placeTorch(add(behind, DOWN));
    }

    /**
     * Descend shaft: 45-degree staircase down.
     */
    descendStep(tick) {
        const b = this.bot, p = floor(b.sim.location);
        if (this.maybeCollect(tick) === "busy") return "working";
        if (this.moving) {
            return this.settle() === "arrived" ? "stepped" : "working";
        }
        if (this.turns >= 4) {
            this.reason = "No safe stair; mining at current level.";
            return "give-up";
        }
        const n = { x: p.x + this.dir.x, y: p.y - 1, z: p.z + this.dir.z };
        const floorCell = add(n, DOWN);
        if (!b.terrain.solid(floorCell)) {
            this.cavityAt = tick;
            this.turn();
            this.reason = "No floor for stair; turning.";
            return "working";
        }
        if (b.terrain.lavaNear(n) || b.terrain.waterNear(n)) {
            this.cavityAt = tick;
            this.turn();
            this.reason = "Fluid near stair; turning.";
            return "working";
        }
        const r = this.open([add(n, UP), n], tick);
        if (r === "digging") return "working";
        if (r !== "open") {
            this.turn();
            this.reason = `Stair blocked (${r}); turning.`;
            return "working";
        }
        this.goTo(n, tick);
        return "working";
    }

    ensureShaft(tick) {
        const b = this.bot;
        const p = floor(b.sim.location);
        if (!this.site) return "at-depth";
        if (p.y <= this.site.targetY + 1) {
            this.phase = "branch";
            this.branchPath = branchPattern(80, 16, optimalSpacing(this.site.ore));
            this.branchIndex = 0;
            this.turns = 0;
            this.reason = `At Y=${p.y}; starting branch mining for ${this.site.ore}`;
            return "at-depth";
        }
        // Walk to origin if needed
        if (this.dug === 0 && horizontal(b.sim.location, center(this.site.origin)) > 2) {
            const r = b.nav.go(center(this.site.origin), tick);
            this.reason = `Walking to shaft head`;
            if (r === "failed") return "blocked";
            return "working";
        }
        const r = this.descendStep(tick);
        if (r === "give-up") {
            this.phase = "branch";
            this.branchPath = branchPattern(60, 12, 3);
            this.branchIndex = 0;
            return "at-depth";
        }
        if (r === "no-tool" || r === "stalled") return r;
        return "working";
    }

    /**
     * Branch mining: follow branch pattern, scanning for ores.
     */
    branchStep(tick, scanForOres) {
        const b = this.bot;
        if (this.maybeCollect(tick) === "busy") return "working";
        if (this.moving) {
            return this.settle() === "arrived" ? "stepped" : "working";
        }
        if (this.dug >= STEP_LIMIT) {
            this.wantsOut = true;
            this.reason = `Branch limit ${this.dug}; ascending.`;
            return "exhausted";
        }
        if (this.turns >= 4) {
            this.wantsOut = true;
            this.reason = "Boxed in; ascending.";
            return "exhausted";
        }
        if (this.branchIndex >= this.branchPath.length) {
            this.wantsOut = true;
            this.reason = "Branch pattern complete; ascending.";
            return "exhausted";
        }

        // Scan for veins periodically
        if (tick % 20 === 0 && scanForOres) {
            const veins = scanForOres();
            if (veins && veins.length) {
                // Found ore - switch to vein mining
                const clusters = clusterVeins(veins, 4);
                if (clusters.length && clusters[0].length >= 1) {
                    this.veins = clusters;
                    this.currentVein = clusters[0];
                    this.phase = "vein";
                    this.reason = `Found vein of ${clusters[0].length} blocks; mining it.`;
                    return "vein-found";
                }
            }
        }

        const next = this.branchPath[this.branchIndex];
        if (!next) {
            this.branchIndex++;
            return "working";
        }
        const p = floor(b.sim.location);
        const target = { x: this.site.origin.x + next.x, y: p.y, z: this.site.origin.z + next.z };
        const floorCell = add(target, DOWN);
        if (!b.terrain.solid(floorCell)) {
            this.cavityAt = tick;
            this.branchIndex++;
            this.turn();
            return "working";
        }
        const r = this.open([add(target, UP), target], tick);
        if (r === "digging") return "working";
        if (r !== "open") {
            this.branchIndex++;
            this.turn();
            this.reason = `Branch blocked (${r}); skipping.`;
            return "working";
        }
        this.run++;
        this.branchIndex++;
        this.goTo(target, tick);
        return "working";
    }

    /** Drop one ore block from the current vein with an honest reason. */
    skipOre(ore, why) {
        this.currentVein = (this.currentVein ?? []).filter((o) => !(o.x === ore.x && o.y === ore.y && o.z === ore.z));
        this.veinKey = undefined;
        this.reason = why;
    }

    /**
     * Vein mining: mine every block of the found cluster. Blocks beyond reach
     * are reached by CUTTING A SAFE TUNNEL one cell at a time - the bot never
     * walks into solid ore (that used to push at the rock face forever). Each
     * ore block gets a bounded progress deadline and is skipped honestly when
     * nothing changes for 45s, so a vein can never stall the run.
     */
    veinStep(tick) {
        if (!this.currentVein || !this.currentVein.length) {
            this.phase = "branch";
            return "done";
        }
        const b = this.bot;
        if (this.maybeCollect(tick) === "busy") return "working";
        if (this.moving) {
            return this.settle() === "arrived" ? "stepped" : "working";
        }
        // Find nearest ore in vein
        const p = floor(b.sim.location);
        let nearest = undefined;
        let nearestDist = Infinity;
        for (const ore of this.currentVein) {
            const block = b.terrain.block(ore);
            if (!block || block.isAir) continue;
            const d = distance(p, ore);
            if (d < nearestDist) {
                nearestDist = d;
                nearest = ore;
            }
        }
        if (!nearest) {
            // Vein exhausted
            this.veins.shift();
            this.currentVein = this.veins[0];
            this.veinKey = undefined;
            if (!this.currentVein) {
                this.phase = "branch";
                return "done";
            }
            return "working";
        }
        // Bounded progress deadline per ore: skip it honestly when stuck.
        const oreKey = `${nearest.x},${nearest.y},${nearest.z}`;
        if (this.veinKey !== oreKey || this.veinDugAt !== this.dug) {
            this.veinKey = oreKey;
            this.veinSince = tick;
            this.veinDugAt = this.dug;
        } else if (tick - this.veinSince > 900) {
            this.skipOre(nearest, `Ore at ${nearest.x},${nearest.y},${nearest.z} is unreachable; skipping it.`);
            return "working";
        }
        b.terrain.invalidate(nearest);
        // Within reach with a clear line: mine it directly.
        if (distance(b.sim.getHeadLocation(), center(nearest)) <= 4.5 &&
            b.terrain.line(b.sim.getHeadLocation(), center(nearest), nearest)) {
            const r = b.digCell(nearest, tick);
            if (r === "digging" || r === "open") {
                this.reason = `Mining vein block at ${nearest.x},${nearest.y},${nearest.z}`;
                return "working";
            }
            this.reason = b.lastDigReason ?? "Cannot break vein block right now.";
            return "working"; // the deadline above keeps this bounded
        }
        // Out of reach: cut a safe tunnel toward it, one cell at a time.
        const delta = { x: nearest.x - p.x, y: nearest.y - p.y, z: nearest.z - p.z };
        let step;
        if (Math.abs(delta.x) <= 1 && Math.abs(delta.z) <= 1 && delta.y < -1) {
            step = { x: p.x, y: p.y - 1, z: p.z }; // directly above it: go straight down
        } else if (Math.abs(delta.x) > Math.abs(delta.z)) {
            step = { x: p.x + Math.sign(delta.x), y: p.y, z: p.z };
        } else if (delta.z !== 0) {
            step = { x: p.x, y: p.y, z: p.z + Math.sign(delta.z) };
        } else {
            step = { x: p.x, y: p.y - 1, z: p.z };
        }
        if (!b.terrain.solid(add(step, DOWN))) {
            this.skipOre(nearest, `No floor toward ore at ${nearest.x},${nearest.y},${nearest.z}; skipping it.`);
            return "working";
        }
        if (b.terrain.lavaNear(step) || b.terrain.waterNear(step)) {
            this.skipOre(nearest, `Fluid between bot and ore at ${nearest.x},${nearest.y},${nearest.z}; skipping it.`);
            return "working";
        }
        const r = this.open(step.y < p.y ? [step] : [add(step, UP), step], tick);
        if (r === "digging") return "working";
        if (r !== "open") {
            this.skipOre(nearest, `Tunnel blocked (${r}); skipping ore at ${nearest.x},${nearest.y},${nearest.z}.`);
            return "working";
        }
        this.reason = `Cutting a tunnel toward ore at ${nearest.x},${nearest.y},${nearest.z}`;
        this.goTo(step, tick);
        return "working";
    }

    ascend(tick) {
        const b = this.bot;
        if (!this.ascentStarted) {
            this.ascentStarted = true;
            this.ascendSince = tick;
        }
        if (this.dig) {
            if (b.terrain.solid(this.dig.cell) && tick - this.dig.since < 240) return "working";
            this.dig = undefined;
        }
        while (this.route.length) {
            const tail = this.route[this.route.length - 1];
            if (horizontal(b.sim.location, center(tail)) < 1.0 && Math.abs(b.sim.location.y - tail.y) < 1.4)
                this.route.pop();
            else break;
        }
        if (this.route.length <= 1) {
            const origin = this.site?.origin;
            if (!origin || (horizontal(b.sim.location, center(origin)) < 2.0 && Math.abs(b.sim.location.y - origin.y) < 2.0)) {
                this.reset();
                this.reason = "Back on surface.";
                return "surface";
            }
        }
        if (!this.route.length) {
            this.reset();
            return "surface";
        }
        if (tick - this.ascendSince > 4000) {
            this.reason = "Cannot retrace shaft; needs help.";
            this.wantsOut = false;
            return "stalled";
        }
        const next = this.route[this.route.length - 1];
        if (this.stepTo(next, tick) === "arrived") this.route.pop();
        this.reason = `Climbing shaft (${this.route.length} left)`;
        return "working";
    }

    /**
     * Main tick for deep mining.
     * scanFn: function that returns list of ore positions nearby
     */
    tick(tick, scanFn, met) {
        if (met) {
            if (this.phase === "branch" || this.phase === "vein") {
                // Keep mining until wantsOut? Actually if quota met, ascend
                this.wantsOut = true;
            }
        }
        if (this.wantsOut) {
            const r = this.ascend(tick);
            if (r === "surface") return "done";
            if (r === "stalled") return "stalled";
            return "continue";
        }

        switch (this.phase) {
            case "shaft": {
                const r = this.ensureShaft(tick);
                if (r === "at-depth") return "continue";
                if (r === "blocked" || r === "no-tool" || r === "stalled") return r;
                return "continue";
            }
            case "branch": {
                const r = this.branchStep(tick, scanFn);
                if (r === "exhausted") {
                    this.wantsOut = true;
                    return "continue";
                }
                if (r === "vein-found") return "continue";
                return "continue";
            }
            case "vein": {
                const r = this.veinStep(tick);
                return "continue";
            }
            default:
                return "blocked";
        }
    }
}
