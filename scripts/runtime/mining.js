/**
 * Miner v2 - REWRITTEN UNBREAKABLE with front block fix
 * - Front block: direct break without nav
 * - Torching, drop collection
 * - Tool awareness
 */
import { add, floor, center, horizontal, distance, UP, DOWN } from "../core/math.js";
import { oreLevel, isBulk, bulkLevel } from "../core/ores.js";
import { MINE } from "../core/policy.js";
import { isUnbreakable } from "../core/blocks.js";

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

    // FRONT BLOCK FIX: direct break
    tryDirectBreak(cell, tick) {
        const bot = this.bot;
        const head = bot.sim.getHeadLocation();
        const at = add(cell, { x: 0.5, y: 0.5, z: 0.5 });
        if (distance(head, at) > 5.5) return false;
        const b = bot.terrain.block(cell);
        if (!b || b.isAir) return true;
        if (isUnbreakable(b.typeId)) return false;
        if (bot.terrain.lavaNear(cell) || bot.terrain.waterNear(cell)) return false;
        const rule = MINE[b.typeId];
        if (rule && rule.tier > 0 && !bot.bag.tool(rule.tool, rule.tier)) return false;

        if (this.breakTarget && this.breakTarget.x === cell.x && this.breakTarget.y === cell.y && this.breakTarget.z === cell.z) {
            if (tick - this.breakingSince > 200) {
                try { bot.sim.stopBreakingBlock(); } catch {}
                this.breakTarget = null;
                this.breakingSince = 0;
                this.blocked.set(`${cell.x},${cell.y},${cell.z}`, tick + BLOCKED_TTL);
                return false;
            }
            return true;
        }

        try { bot.sim.stopBreakingBlock(); } catch {}
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
                try { b.sim.stopBreakingBlock(); } catch {}
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
        if (horizontal(b.sim.location, loc) < 0.5 && Math.abs(b.sim.location.y - cell.y) < 1.2) return "arrived";
        b.nav.reset();
        b.sim.isSprinting = false;
        if (cell.y > floor(b.sim.location).y) b.sim.jump();
        b.sim.moveToLocation(b.host.relative(loc), { faceTarget: true });
        return "moving";
    }

    goTo(cell, tick) {
        const b = this.bot;
        void tick;
        this.moving = { ...cell };
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
        try { this.bot.placeTorch(add(behind, DOWN)); } catch {}
    }

    descendStep(tick) {
        const b = this.bot, p = floor(b.sim.location);
        if (this.maybeCollect(tick) === "busy") return "working";
        if (this.moving) {
            if (this.refilled()) return "working";
            return this.settle() === "arrived" ? "stepped" : "working";
        }
        if (this.turns >= 4) {
            this.reason = "No safe stair; mining at this level - front fix";
            return "give-up";
        }
        const n = { x: p.x + this.dir.x, y: p.y - 1, z: p.z + this.dir.z };
        const floorCell = add(n, DOWN);
        if (!b.terrain.solid(floorCell)) {
            this.cavityAt = tick;
            this.turn();
            this.reason = "No floor for next stair; turning - advanced";
            return "working";
        }
        if (b.terrain.lavaNear(n)) {
            this.cavityAt = tick;
            this.turn();
            this.reason = "Lava beside stair; turning - advanced";
            return "working";
        }
        if (b.terrain.waterNear(n)) {
            this.cavityAt = tick;
            this.turn();
            this.reason = "Water beside stair; turning - advanced";
            return "working";
        }
        const r = this.open([add(n, UP), n], tick);
        if (r === "digging") return "working";
        if (r !== "open") return this.faced(r);
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
            if (r === "failed" || r === "blocked") return "blocked";
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
            return this.settle() === "arrived" ? "stepped" : "working";
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
