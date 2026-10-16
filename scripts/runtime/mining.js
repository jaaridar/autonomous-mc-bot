// One module now: runtime/mining.js + runtime/deepminer.js (see docs/ARCHITECTURE.md).
import { CARDINAL, DOWN, UP, add, center, distance, floor, horizontal, key } from "../core/math.js";
import { MINE, bestYFor, branchPattern, bulkLevel, clusterVeins, isBulk, isUnbreakable, optimalSpacing, oreLevel } from "../core/world.js";

// ---------------------------------------------------------------- mining.js

/**
 * Miner v2 - REWRITTEN UNBREAKABLE with front block fix
 * - Front block: direct break without nav
 * - Torching, drop collection
 * - Tool awareness
 */


const STEP_LIMIT = 250;
const RUN_LENGTH = 16;
const BLOCKED_TTL = 1800;
const short = (id) => id.replace("minecraft:", "");

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
        this.cavityAt = 0;
        this.grabDrop = undefined;
        this.refills = 0;
        this.reason = "No shaft started.";
        this.blocked = new Map();
        this.breakingSince = 0;
        this.breakTarget = null;
    }

    tryBridge(target, fromPos, tick) {
        const b = this.bot;
        if (b.terrain.solid(target)) return true;
        if (b.builder && b.builder.countBlocks() > 0) {
            // The stair floor cell sits 2 Manhattan from the block under the bot's
            // feet, so that anchor is always "not_adjacent" - search a real support.
            const anchor = b.builder.findSupportFor?.(target)?.pos ?? add(fromPos, DOWN);
            const res = b.builder.placeAt(target, anchor, { autoAnchor: true, sneak: true, allowHazard: true });
            if (res === "placed") {
                this.reason = `Bridging at ${target.x},${target.y},${target.z} - miner`;
                return true;
            }
        } else {
            const p = floor(b.sim.location);
            for (const d of CARDINAL) {
                const wallCell = add(p, d);
                const wb = b.terrain.block(wallCell);
                if (wb && wb.isSolid && !isUnbreakable(wb.typeId)) {
                    if (this.tryDirectBreak(wallCell, tick)) {
                        this.reason = `Gathering blocks at ${wallCell.x},${wallCell.y},${wallCell.z} to bridge gap`;
                        return true;
                    }
                }
            }
        }
        return false;
    }

    // FRONT BLOCK FIX: direct break
    tryDirectBreak(cell, tick) {
        const bot = this.bot;
        const head = bot.sim.getHeadLocation();
        const at = add(cell, { x: 0.5, y: 0.5, z: 0.5 });
        if (distance(head, at) > 5.5) return false;
        const b = bot.terrain.block(cell);
        if (!b || b.isAir) return true;
        if (isUnbreakable(b.typeId)) return false;
        if (b.isLiquid) {
            if (bot.builder && bot.builder.countBlocks() > 0) {
                bot.builder.placeAt(cell, add(floor(bot.sim.location), DOWN), { autoAnchor: true, sneak: true, allowHazard: true });
                return true;
            }
            return false;
        }
        if (bot.terrain.lavaAt(add(cell, UP))) return false;

        const rule = MINE[b.typeId];
        if (rule && rule.tier > 0) {
            if (!bot.bag.tool(rule.tool, rule.tier)) {
                if (rule.tool === "pickaxe" && bot.ensureMiningTool(rule.tier, tick)) {
                    // Tool upskilled successfully
                } else {
                    return false;
                }
            }
        }

        if (this.breakTarget && this.breakTarget.x === cell.x && this.breakTarget.y === cell.y && this.breakTarget.z === cell.z) {
            if (tick - this.breakingSince > 200) {
                try { bot.sim.stopBreakingBlock(); } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }
                this.breakTarget = null;
                this.breakingSince = 0;
                this.blocked.set(`${cell.x},${cell.y},${cell.z}`, tick + BLOCKED_TTL);
                return false;
            }
            return true;
        }

        try { bot.sim.stopBreakingBlock(); } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }
        if (bot.breakThrough(cell) !== "digging") return false;
        this.breakTarget = { ...cell };
        this.breakingSince = tick;
        this.reason = `Breaking front ${b.typeId} at ${cell.x},${cell.y},${cell.z} - miner front fix`;
        return true;
    }

    maybeCollect(tick) {
        const b = this.bot;
        const g = this.grabDrop;
        if (g && (!g.e.isValid || tick - g.since > 100)) {
            this.grabDrop = undefined;
            return "clear";
        }
        if (g) {
            const loc = g.e.location;
            this.reason = "Collecting mined drops - miner";
            if (horizontal(b.sim.location, loc) < 1.1 && Math.abs(b.sim.location.y - loc.y) < 1.6)
                return "busy";
            this.stepTo(floor(loc), tick);
            return "busy";
        }
        if (b.bag.container.emptySlotsCount < 1) return "clear";
        const near = b.sim.dimension.getEntities({ type: "minecraft:item", location: b.sim.location, maxDistance: 4.5 })
            .filter((e) => e.isValid && Math.abs(e.location.y - b.sim.location.y) <= 1.6 && !b.terrain.dangerous(floor(e.location)))
            .sort((x, y) => distance(x.location, b.sim.location) - distance(y.location, b.sim.location))[0];
        if (near) {
            this.grabDrop = { e: near, since: tick };
            return "busy";
        }
        return "clear";
    }

    faced(r) {
        if (r === "no-tool") return r;
        this.turn();
        this.reason = r === "water" || r === "lava" ? `Fluid ahead (${r}); turning - front fix` : `Next cell won't open (${r}); turning - front fix`;
        return "working";
    }

    refilled() {
        if (!this.moving) return false;
        const b = this.bot, t = this.moving;
        if (!b.terrain.solid(t) && !b.terrain.solid(add(t, UP))) return false;
        this.moving = undefined;
        if (++this.refills > 3) {
            this.refills = 0;
            this.reason = "Sand collapsing; turning - front fix";
            this.turn();
        } else this.reason = "Falling sand refilled; re-opening - front fix";
        return true;
    }

    open(cells, tick) {
        const b = this.bot;
        if (this.dig) {
            if (!b.terrain.solid(this.dig.cell)) {
                this.dig = undefined;
            } else if (tick - this.dig.since > 240) {
                this.dig = undefined;
                this.reason = "Digging stalled; turning - front fix";
                return "stalled";
            }
            else if (tick - (this.dig.retryAt ?? this.dig.since) >= 90) {
                // One absorbed swing must not freeze the tunnel: re-issue the dig.
                this.dig.retryAt = tick;
                const rr = b.digCell(this.dig.cell, tick);
                if (rr === "open") { this.dig = undefined; return "open"; }
                if (rr !== "digging") { this.dig = undefined; this.reason = b.lastDigReason; return rr; }
                return "digging";
            }
            else {
                return "digging";
            }
        }
        if (this.breakTarget) {
            const tb = b.terrain.block(this.breakTarget);
            if (!tb || tb.isAir) {
                this.breakTarget = null;
                this.breakingSince = 0;
            } else if (tick - this.breakingSince > 200) {
                try { b.sim.stopBreakingBlock(); } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }
                this.blocked.set(`${this.breakTarget.x},${this.breakTarget.y},${this.breakTarget.z}`, tick + BLOCKED_TTL);
                this.breakTarget = null;
                this.breakingSince = 0;
                return "stalled";
            } else return "digging";
        }
        const todo = cells.filter((c) => b.terrain.solid(c) && (this.blocked.get(`${c.x},${c.y},${c.z}`) ?? 0) < tick);
        if (!todo.length) return "open";
        const cell = todo.sort((a, z) => z.y - a.y)[0];

        // Front block fix: try direct break
        if (this.tryDirectBreak(cell, tick)) {
            this.dig = { cell, since: tick };
            return "digging";
        }

        const r = b.digCell(cell, tick);
        if (r === "open") return "open";
        if (r !== "digging") {
            this.reason = b.lastDigReason;
            if (r === "no-tool" || r === "lava" || r === "water") return r;
            this.blocked.set(`${cell.x},${cell.y},${cell.z}`, tick + 600);
            return "blocked";
        }
        this.dig = { cell, since: tick };
        return "digging";
    }

    stepTo(cell, tick) {
        const b = this.bot;
        const loc = center(cell);
        if (horizontal(b.sim.location, loc) < 0.8 && Math.abs(b.sim.location.y - cell.y) < 1.4) return "arrived";
        b.nav.reset();
        b.sim.isSprinting = false;
        // Jump only from the ground: the old unguarded jump fired every tick and
        // made the bot bunny-hop in place whenever the step-up was blocked.
        if (cell.y > floor(b.sim.location).y && b.sim.isOnGround) b.sim.jump();
        try { b.sim.moveToLocation(b.host.relative(loc), { faceTarget: true }); } catch {}
        return "moving";
    }

    goTo(cell, tick) {
        const b = this.bot;
        this.moving = { ...cell };
        this.movingSince = tick || (this.movingSince || 1);
        b.nav.reset();
        b.sim.isSprinting = false;
        if (cell.y > floor(b.sim.location).y && b.sim.isOnGround) b.sim.jump();
        try { b.sim.moveToLocation(b.host.relative(center(cell)), { faceTarget: true }); } catch {}
    }

    settle(tick = 0) {
        if (!this.moving) return "arrived";
        const b = this.bot, cell = this.moving;
        if (horizontal(b.sim.location, center(cell)) < 0.6 && Math.abs(b.sim.location.y - cell.y) < 1.3) {
            this.moving = undefined;
            this.movingSince = 0;
            this.movingStart = undefined;
            this.route.push({ ...cell });
            this.dug++;
            this.turns = 0;
            this.refills = 0;
            maybeTorch(this);
            return "arrived";
        }
        if (!this.movingStart) this.movingStart = { ...floor(b.sim.location) };
        // Zero progress for 25 ticks while grounded: the step is blocked; stop the
        // hop-and-walk loop early instead of bouncing against it for 80 ticks.
        if (tick && tick - this.movingSince > 25 && b.sim.isOnGround && horizontal(b.sim.location, center(this.movingStart)) < 0.7) {
            this.moving = undefined;
            this.movingSince = 0;
            this.movingStart = undefined;
            this.blocked.set(`${cell.x},${cell.y},${cell.z}`, tick + 400);
            this.turn();
            return "arrived";
        }
        if (this.movingSince && tick && tick - this.movingSince > 80) {
            this.moving = undefined;
            this.movingSince = 0;
            this.movingStart = undefined;
            this.blocked.set(`${cell.x},${cell.y},${cell.z}`, tick + 400);
            this.turn();
            return "arrived";
        }
        this.goTo(cell, tick);
        return "moving";
    }

    turn() {
        const d = this.dir;
        this.dir = d.x !== 0 ? { x: 0, y: 0, z: d.x } : { x: -d.z, y: 0, z: 0 };
        this.turns++;
        this.run = 0;
        this.refills = 0;
    }


    descendStep(tick) {
        const b = this.bot, p = floor(b.sim.location);
        if (this.maybeCollect(tick) === "busy") return "working";
        if (this.moving) {
            if (this.refilled()) return "working";
            return this.settle(tick) === "arrived" ? "stepped" : "working";
        }
        if (this.turns >= 4) {
            this.reason = "No safe stair; mining at this level - front fix";
            return "give-up";
        }
        const n = { x: p.x + this.dir.x, y: p.y - 1, z: p.z + this.dir.z };
        const floorCell = add(n, DOWN);
        if (!b.terrain.solid(floorCell) || b.terrain.liquid(floorCell)) {
            if (this.tryBridge(floorCell, p, tick)) return "working";
            this.cavityAt = tick;
            this.turn();
            this.reason = "No floor for next stair; turning - advanced";
            return "working";
        }
        if (b.terrain.liquid(n)) {
            if (this.tryBridge(n, p, tick)) return "working";
        }
        // 3-high opening for downward stair: head block at p.y + 1, eye block at p.y, foot block at p.y - 1
        const r = this.open([add(n, { x: 0, y: 2, z: 0 }), add(n, UP), n], tick);
        if (r === "digging") return "working";
        if (r !== "open") {
            try {
                const headFront = b.terrain.headFrontObstruction ? b.terrain.headFrontObstruction(b.sim.location, this.dir) : null;
                if (headFront) {
                    const hb = b.terrain.block(headFront);
                    if (hb && !hb.isAir && !isUnbreakable(hb.typeId)) {
                        if (this.tryDirectBreak(headFront, tick)) return "working";
                    }
                }
            } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }
            return this.faced(r);
        }
        this.goTo(n, tick);
        return "working";
    }

    ensure(m, tick) {
        const b = this.bot;
        const p = floor(b.sim.location);
        const item = m.deepItem ?? m.item;
        const level = oreLevel(item) ?? (isBulk(item) ? bulkLevel(p.y) : undefined);
        if (!level) return "at-depth";
        if (this.underground) {
            if (this.site && p.y > this.site.targetY + 2 && this.dug - (this.gaveUpAt ?? 0) > 10) {
                this.underground = false;
                this.turns = 0;
                this.reason = "Retrying stairs from fresh spot - front fix";
            } else if (p.y > level.max + 4) {
                return this.descendStep(tick) === "give-up" ? "at-depth" : "working";
            } else return "at-depth";
        }
        if (!this.site) {
            this.site = { origin: { ...p }, targetY: level.best };
            this.route = [{ ...p }];
            this.dug = 0;
            this.since = tick;
            this.reason = `Opening shaft to Y=${level.best} for ${short(item)} - front fix`;
        }
        if (this.dug === 0 && horizontal(b.sim.location, center(this.site.origin)) > 2) {
            const r = b.nav.go(center(this.site.origin), tick);
            this.reason = `Walking to mine head for ${short(item)} - advanced`;
            if (r === "failed" || r === "blocked") {
                this.walkFails = (this.walkFails ?? 0) + 1;
                if (this.walkFails >= 3) {
                    const here = floor(b.sim.location);
                    this.walkFails = 0;
                    this.site = { origin: { ...here }, targetY: level.best };
                    this.route = [{ ...here }];
                    this.dug = 0;
                    this.reason = "Old shaft head unreachable; opening a fresh shaft here - advanced";
                    return "working";
                }
                return "blocked";
            }
            this.walkFails = 0;
            return "working";
        }
        const r = this.descendStep(tick);
        if (r === "no-tool" || r === "stalled") return r;
        if (r === "give-up" || floor(b.sim.location).y <= level.best) {
            if (r === "give-up") this.gaveUpAt = this.dug;
            this.turns = 0;
            this.underground = true;
            this.reason = `At Y=${floor(b.sim.location).y}; corridor for ${short(item)} - front fix`;
            return "at-depth";
        }
        return "working";
    }

    advance(m, tick) {
        const b = this.bot;
        if (!this.underground) return "at-depth";
        if (this.maybeCollect(tick) === "busy") return "working";
        if (this.moving) {
            if (this.refilled()) return "working";
            return this.settle(tick) === "arrived" ? "stepped" : "working";
        }
        if (this.dug >= STEP_LIMIT) {
            this.wantsOut = true;
            this.reason = `Dug ${this.dug} without vein; heading up - advanced`;
            return "exhausted";
        }
        if (this.turns >= 4) {
            this.wantsOut = true;
            this.reason = "Boxed in; heading up - advanced";
            return "exhausted";
        }
        if (this.run >= RUN_LENGTH) {
            this.turn();
            this.reason = "Turning tunnel to fresh branch - advanced";
        }
        const p = floor(b.sim.location);
        const n = { x: p.x + this.dir.x, y: p.y, z: p.z + this.dir.z };
        const floorCell = add(n, DOWN);
        if (!b.terrain.solid(floorCell)) {
            this.cavityAt = tick;
            this.turn();
            this.reason = "Gap ahead; turning - advanced";
            return "working";
        }
        const r = this.open([add(n, UP), n], tick);
        if (r === "digging") return "working";
        if (r !== "open") return this.faced(r);
        this.run++;
        this.goTo(n, tick);
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
        if (this.breakTarget) {
            const tb = b.terrain.block(this.breakTarget);
            if (tb && !tb.isAir && tick - this.breakingSince < 200) return "working";
            this.breakTarget = null;
        }
        while (this.route.length) {
            const tail = this.route[this.route.length - 1];
            if (horizontal(b.sim.location, center(tail)) < 1.0 && Math.abs(b.sim.location.y - tail.y) < 1.4) this.route.pop();
            else break;
        }
        if (this.route.length <= 1) {
            const origin = this.site?.origin;
            if (!origin || (horizontal(b.sim.location, center(origin)) < 2.0 && Math.abs(b.sim.location.y - origin.y) < 2.0)) {
                this.reset();
                this.reason = "Back on surface - front fix";
                return "surface";
            }
        }
        if (!this.route.length) {
            this.reset();
            this.reason = "Back on surface - front fix";
            return "surface";
        }
        if (tick - this.ascendSince > 3000) {
            this.reason = "Could not retrace shaft - needs help - advanced";
            this.wantsOut = false;
            return "stalled";
        }
        const next = this.route[this.route.length - 1];
        if (this.stepTo(next, tick) === "arrived") this.route.pop();
        this.reason = `Climbing shaft (${this.route.length} left) - front fix`;
        return "working";
    }
}

// ---------------------------------------------------------------- deepminer.js

/**
 * DeepMiner v2 - REWRITTEN UNBREAKABLE DEEP MINING
 * - Front block fix: direct break without nav failure
 * - Efficient shaft descent to best Y
 * - Branch mining with vein clustering
 * - Torching, drop collection, tool awareness
 * - Never stops on front block
 */


const DEEP_STEP_LIMIT = 400;

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
        this.phase = "idle"; // idle, shaft, branch, vein, ascend
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
        this.blocked = new Map();
        this.breakingSince = 0;
        this.breakTarget = null;
        this.branchOrigin = undefined;
        this.movingSince = 0;
    }

    get active() { return this.phase !== "idle"; }

    start(oreType, tick) {
        this.reset();
        const p = floor(this.sim.location);
        this.targetY = bestYFor(oreType);
        this.site = { origin: { ...p }, targetY: this.targetY, ore: oreType };
        this.route = [{ ...p }];
        this.phase = "shaft";
        this.since = tick;
        this.reason = `Deep shaft to Y=${this.targetY} for ${oreType} - unbreakable front fix`;
        return true;
    }

    tryBridge(target, fromPos, tick) {
        const b = this.bot;
        if (b.terrain.solid(target)) return true;
        if (b.builder && b.builder.countBlocks() > 0) {
            // Same adjacency fix as the stair miner: search a support adjacent to
            // the gap cell instead of trusting the anchor under the bot's feet.
            const anchor = b.builder.findSupportFor?.(target)?.pos ?? add(fromPos, DOWN);
            const res = b.builder.placeAt(target, anchor, { autoAnchor: true, sneak: true, allowHazard: true });
            if (res === "placed") {
                this.reason = `Bridging at ${target.x},${target.y},${target.z} - deep miner`;
                return true;
            }
        } else {
            const p = floor(b.sim.location);
            for (const d of CARDINAL) {
                const wallCell = add(p, d);
                const wb = b.terrain.block(wallCell);
                if (wb && wb.isSolid && !isUnbreakable(wb.typeId)) {
                    if (this.tryDirectBreak(wallCell, tick)) {
                        this.reason = `Gathering blocks at ${wallCell.x},${wallCell.y},${wallCell.z} to bridge gap`;
                        return true;
                    }
                }
            }
        }
        return false;
    }

    // FRONT BLOCK FIX: direct break method that never fails on front block
    tryDirectBreak(cell, tick) {
        const bot = this.bot;
        const head = bot.sim.getHeadLocation();
        const at = add(cell, { x: 0.5, y: 0.5, z: 0.5 });
        const dist = distance(head, at);
        if (dist > 5.5) return false; // too far, need approach

        const b = bot.terrain.block(cell);
        if (!b || b.isAir) return true; // already open
        if (isUnbreakable(b.typeId)) return false;
        if (b.isLiquid) {
            if (bot.builder && bot.builder.countBlocks() > 0) {
                bot.builder.placeAt(cell, add(floor(bot.sim.location), DOWN), { autoAnchor: true, sneak: true, allowHazard: true });
                return true;
            }
            return false;
        }
        if (bot.terrain.lavaAt(add(cell, UP))) return false;

        const rule = MINE[b.typeId];
        if (rule && rule.tier > 0) {
            if (!bot.bag.tool(rule.tool, rule.tier)) {
                if (rule.tool === "pickaxe" && bot.ensureMiningTool(rule.tier, tick)) {
                    // Tool upskilled successfully
                } else {
                    this.reason = `Need ${rule.tool} tier ${rule.tier} for ${b.typeId} in shaft - upskilling tool`;
                    return false;
                }
            }
        }

        // If already breaking same cell, continue
        if (this.breakTarget && this.breakTarget.x === cell.x && this.breakTarget.y === cell.y && this.breakTarget.z === cell.z) {
            if (tick - this.breakingSince > 200) {
                try { bot.sim.stopBreakingBlock(); } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }
                this.breakTarget = null;
                this.breakingSince = 0;
                this.blocked.set(key(cell), tick + BLOCKED_TTL);
                return false;
            }
            return true; // still breaking
        }

        // Start breaking front block directly - no nav needed
        try { bot.sim.stopBreakingBlock(); } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }
        if (bot.breakThrough(cell) !== "digging") {
            return false;
        }
        this.breakTarget = { ...cell };
        this.breakingSince = tick;
        this.reason = `Breaking front ${b.typeId} at ${cell.x},${cell.y},${cell.z} - direct front mining deep`;
        return true;
    }

    maybeCollect(tick) {
        const b = this.bot;
        const g = this.grabDrop;
        if (g && (!g.e.isValid || tick - g.since > 100)) {
            this.grabDrop = undefined;
            return "clear";
        }
        if (g) {
            const loc = g.e.location;
            this.reason = "Collecting mined drops - deep";
            if (horizontal(b.sim.location, loc) < 1.1 && Math.abs(b.sim.location.y - loc.y) < 1.6)
                return "busy";
            this.stepTo(floor(loc), tick);
            return "busy";
        }
        if (b.bag.container.emptySlotsCount < 1) return "clear";
        const near = b.sim.dimension.getEntities({ type: "minecraft:item", location: b.sim.location, maxDistance: 5 })
            .filter(e => e.isValid && Math.abs(e.location.y - b.sim.location.y) <= 2 && !b.terrain.dangerous(floor(e.location)))
            .sort((x,y) => distance(x.location, b.sim.location) - distance(y.location, b.sim.location))[0];
        if (near) {
            this.grabDrop = { e: near, since: tick };
            return "busy";
        }
        return "clear";
    }

    open(cells, tick) {
        const b = this.bot;
        // Check if we are already breaking a cell
        if (this.dig) {
            if (!b.terrain.solid(this.dig.cell)) {
                this.dig = undefined;
                this.breakTarget = null;
            } else if (tick - this.dig.since > 240) {
                this.dig = undefined;
                this.breakTarget = null;
                this.reason = "Digging stalled - turning - front fix";
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
        if (this.breakTarget) {
            const tb = b.terrain.block(this.breakTarget);
            if (!tb || tb.isAir) {
                this.breakTarget = null;
                this.breakingSince = 0;
            } else if (tick - this.breakingSince > 200) {
                try { b.sim.stopBreakingBlock(); } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }
                this.blocked.set(key(this.breakTarget), tick + BLOCKED_TTL);
                this.breakTarget = null;
                this.breakingSince = 0;
                return "stalled";
            } else {
                return "digging";
            }
        }

        const todo = cells.filter(c => b.terrain.solid(c) && (this.blocked.get(key(c)) ?? 0) < tick);
        if (!todo.length) return "open";
        // Sort by highest first (head then feet) for safety
        const cell = todo.sort((a,z) => z.y - a.y)[0];

        // FRONT BLOCK FIX: try direct break first
        if (this.tryDirectBreak(cell, tick)) {
            this.dig = { cell, since: tick };
            return "digging";
        }

        // Fallback to digCell
        const r = b.digCell(cell, tick);
        if (r === "open") return "open";
        if (r !== "digging") {
            this.reason = b.lastDigReason;
            if (r === "no-tool" || r === "lava" || r === "water") return r;
            // For other failures, mark blocked and try next
            this.blocked.set(key(cell), tick + 600);
            return "blocked";
        }
        this.dig = { cell, since: tick };
        return "digging";
    }

    stepTo(cell, tick) {
        const b = this.bot;
        const loc = center(cell);
        if (horizontal(b.sim.location, loc) < 0.8 && Math.abs(b.sim.location.y - cell.y) < 1.4)
            return "arrived";
        b.nav.reset();
        b.sim.isSprinting = false;
        if (cell.y > floor(b.sim.location).y && b.sim.isOnGround) b.sim.jump();
        try { b.sim.moveToLocation(b.host.relative(loc), { faceTarget: true }); } catch {}
        return "moving";
    }

    goTo(cell, tick) {
        this.moving = { ...cell };
        this.movingSince = tick || (this.movingSince || 1);
        const b = this.bot;
        b.nav.reset();
        b.sim.isSprinting = false;
        if (cell.y > floor(b.sim.location).y && b.sim.isOnGround) b.sim.jump();
        try { b.sim.moveToLocation(b.host.relative(center(cell)), { faceTarget: true }); } catch {}
    }

    settle(tick = 0) {
        if (!this.moving) return "arrived";
        const b = this.bot, cell = this.moving;
        if (horizontal(b.sim.location, center(cell)) < 0.6 && Math.abs(b.sim.location.y - cell.y) < 1.3) {
            this.moving = undefined;
            this.movingSince = 0;
            this.movingStart = undefined;
            this.route.push({ ...cell });
            this.dug++;
            this.turns = 0;
            this.refills = 0;
            maybeTorch(this);
            return "arrived";
        }
        if (!this.movingStart) this.movingStart = { ...floor(b.sim.location) };
        // Zero progress for 25 ticks while grounded: the step is blocked; stop the
        // hop-and-walk loop early instead of bouncing against it for 80 ticks.
        if (tick && tick - this.movingSince > 25 && b.sim.isOnGround && horizontal(b.sim.location, center(this.movingStart)) < 0.7) {
            this.moving = undefined;
            this.movingSince = 0;
            this.movingStart = undefined;
            this.blocked.set(key(cell), tick + 400);
            this.turn();
            return "arrived";
        }
        if (this.movingSince && tick && tick - this.movingSince > 80) {
            this.moving = undefined;
            this.movingSince = 0;
            this.movingStart = undefined;
            this.blocked.set(key(cell), tick + 400);
            this.turn();
            return "arrived";
        }
        this.goTo(cell, tick);
        return "moving";
    }

    turn() {
        const d = this.dir;
        this.dir = d.x !== 0 ? { x: 0, y: 0, z: d.x } : { x: -d.z, y: 0, z: 0 };
        this.turns++;
        this.run = 0;
        this.refills = 0;
    }


    descendStep(tick) {
        const b = this.bot, p = floor(b.sim.location);
        if (this.maybeCollect(tick) === "busy") return "working";
        if (this.moving) {
            return this.settle(tick) === "arrived" ? "stepped" : "working";
        }
        if (this.turns >= 4) {
            this.reason = "No safe stair - mining at current level - front fix";
            return "give-up";
        }
        const n = { x: p.x + this.dir.x, y: p.y - 1, z: p.z + this.dir.z };
        const floorCell = add(n, DOWN);

        // Ensure floor: bridge across gaps, cavities, or fluids
        if (!b.terrain.solid(floorCell) || b.terrain.liquid(floorCell)) {
            if (this.tryBridge(floorCell, p, tick)) return "working";
            this.cavityAt = tick;
            this.turn();
            this.reason = "No floor for stair - turning - advanced";
            return "working";
        }

        // Plug any fluid occupying the step itself
        if (b.terrain.liquid(n)) {
            if (this.tryBridge(n, p, tick)) return "working";
        }

        // 3-high opening for downward stair: head block at p.y + 1, eye block at p.y, foot block at p.y - 1
        const r = this.open([add(n, { x: 0, y: 2, z: 0 }), add(n, UP), n], tick);
        if (r === "digging") return "working";
        if (r !== "open") {
            // If blocked, try to clear front obstruction along this.dir
            try {
                const headFront = b.terrain.headFrontObstruction ? b.terrain.headFrontObstruction(b.sim.location, this.dir) : null;
                if (headFront) {
                    const hb = b.terrain.block(headFront);
                    if (hb && !hb.isAir && !isUnbreakable(hb.typeId)) {
                        if (this.tryDirectBreak(headFront, tick)) return "working";
                    }
                }
            } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }
            this.turn();
            this.reason = `Stair blocked (${r}) - turning - front fix`;
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
            this.branchOrigin = { ...p };
            this.branchPath = branchPattern(80, 16, optimalSpacing(this.site.ore));
            this.branchIndex = 0;
            this.turns = 0;
            this.reason = `At Y=${p.y}; branch mining for ${this.site.ore} - advanced unbreakable`;
            return "at-depth";
        }
        if (this.route.length === 1 && horizontal(b.sim.location, center(this.site.origin)) > 2) {
            const r = b.nav.go(center(this.site.origin), tick);
            this.reason = `Walking to shaft head - advanced`;
            if (r === "failed") return "blocked";
            return "working";
        }
        const r = this.descendStep(tick);
        if (r === "give-up") {
            this.phase = "branch";
            this.branchOrigin = { ...p };
            this.branchPath = branchPattern(60, 12, 3);
            this.branchIndex = 0;
            return "at-depth";
        }
        if (r === "no-tool" || r === "stalled") return r;
        return "working";
    }

    branchStep(tick, scanForOres) {
        const b = this.bot;
        if (this.maybeCollect(tick) === "busy") return "working";
        if (this.moving) {
            return this.settle(tick) === "arrived" ? "stepped" : "working";
        }
        if (this.dug >= DEEP_STEP_LIMIT) {
            this.wantsOut = true;
            this.reason = `Branch limit ${this.dug}; ascending - advanced`;
            return "exhausted";
        }
        if (this.turns >= 4) {
            this.wantsOut = true;
            this.reason = "Boxed in; ascending - advanced";
            return "exhausted";
        }
        if (this.branchIndex >= this.branchPath.length) {
            this.wantsOut = true;
            this.reason = "Branch pattern complete; ascending - advanced";
            return "exhausted";
        }

        if (tick % 20 === 0 && scanForOres) {
            const veins = scanForOres();
            if (veins && veins.length) {
                const clusters = clusterVeins(veins, 4);
                if (clusters.length && clusters[0].length >= 1) {
                    this.veins = clusters;
                    this.currentVein = clusters[0];
                    this.phase = "vein";
                    this.reason = `Found vein ${clusters[0].length} blocks - advanced mining`;
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
        const base = this.branchOrigin ?? this.site?.origin ?? p;
        const target = { x: base.x + next.x, y: base.y ?? p.y, z: base.z + next.z };
        const floorCell = add(target, DOWN);
        if (!b.terrain.solid(floorCell) || b.terrain.liquid(floorCell)) {
            if (this.tryBridge(floorCell, p, tick)) return "working";
            this.cavityAt = tick;
            if (next.kind === "branch") {
                while (this.branchIndex < this.branchPath.length && this.branchPath[this.branchIndex].kind === "branch") {
                    this.branchIndex++;
                }
            } else {
                this.branchIndex++;
            }
            this.turn();
            return "working";
        }
        const r = this.open([add(target, UP), target], tick);
        if (r === "digging") return "working";
        if (r !== "open") {
            if (next.kind === "branch") {
                while (this.branchIndex < this.branchPath.length && this.branchPath[this.branchIndex].kind === "branch") {
                    this.branchIndex++;
                }
            } else {
                this.branchIndex++;
            }
            this.turn();
            this.reason = `Branch blocked (${r}) - skipping`;
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
            return this.settle(tick) === "arrived" ? "stepped" : "working";
        }
        const p = floor(b.sim.location);
        let nearest = undefined;
        let nearestDist = Infinity;
        for (const ore of this.currentVein) {
            const block = b.terrain.block(ore);
            if (!block || block.isAir) continue;
            if ((this.blocked.get(key(ore)) ?? 0) > tick) continue;
            const d = distance(p, ore);
            if (d < nearestDist) {
                nearestDist = d;
                nearest = ore;
            }
        }
        if (!nearest) {
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
            this.blocked.set(key(nearest), tick + BLOCKED_TTL);
            this.skipOre(nearest, `Ore at ${nearest.x},${nearest.y},${nearest.z} is unreachable; skipping it.`);
            return "working";
        }
        b.terrain.invalidate(nearest);
        // Within reach with a clear line: mine it directly (direct break first).
        if (distance(b.sim.getHeadLocation(), center(nearest)) <= 4.5 &&
            b.terrain.line(b.sim.getHeadLocation(), center(nearest), nearest)) {
            if (this.tryDirectBreak(nearest, tick)) {
                this.reason = `Mining vein block at ${nearest.x},${nearest.y},${nearest.z}`;
                return "working";
            }
            const r = b.digCell(nearest, tick);
            if (r === "digging" || r === "open") {
                this.reason = `Mining vein block at ${nearest.x},${nearest.y},${nearest.z}`;
                return "working";
            }
            if (r === "no-tool" || r === "unreachable" || r === "refused" || r === "lava" || r === "water") {
                this.blocked.set(key(nearest), tick + BLOCKED_TTL);
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
        const stepFloor = add(step, DOWN);
        if (!b.terrain.solid(stepFloor) || b.terrain.liquid(stepFloor)) {
            if (this.tryBridge(stepFloor, p, tick)) return "working";
            this.skipOre(nearest, `No floor toward ore at ${nearest.x},${nearest.y},${nearest.z}; skipping it.`);
            return "working";
        }
        if (b.terrain.liquid(step)) {
            if (this.tryBridge(step, p, tick)) return "working";
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
        if (this.breakTarget) {
            const tb = b.terrain.block(this.breakTarget);
            if (tb && !tb.isAir && tick - this.breakingSince < 200) return "working";
            this.breakTarget = null;
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
                this.reason = "Back on surface - advanced unbreakable";
                return "surface";
            }
        }
        if (!this.route.length) {
            this.reset();
            return "surface";
        }
        if (tick - this.ascendSince > 4000) {
            this.reason = "Cannot retrace shaft - needs help - advanced";
            this.wantsOut = false;
            return "stalled";
        }
        const next = this.route[this.route.length - 1];
        if (this.stepTo(next, tick) === "arrived") this.route.pop();
        this.reason = `Climbing shaft (${this.route.length} left) - advanced`;
        return "working";
    }

    tick(tick, scanFn, met) {
        if (met) {
            if (this.phase === "branch" || this.phase === "vein") {
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
                this.veinStep(tick);
                return "continue";
            }
            default:
                return "blocked";
        }
    }
}
/** Shared by Miner and DeepMiner: torch every 8th block, behind the digger. */
function maybeTorch(m) {
    if (m.dug % 8 !== 0 || m.route.length < 2)
        return;
    const behind = m.route[m.route.length - 2];
    try {
        m.bot.placeTorch(add(behind, DOWN));
    }
    catch (e) {
        console.warn("[Verdant] " + String(e?.message || e).slice(0, 300));
    }
}
