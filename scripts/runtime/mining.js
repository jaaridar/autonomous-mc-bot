// One module now: runtime/mining.js + runtime/deepminer.js (see docs/ARCHITECTURE.md).
import { DOWN, UP, add, center, distance, floor, horizontal, key } from "../core/math.js";
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

/**
 * Per-tick safety guards for any mining step. Returns a reason string when the
 * director must yield the tick, or undefined when safe to mine. Handles:
 * - drowning / boat: head in water or feet in deep water
 * - lava leak / hazard near feet
 * - gravel/sand suffocation imminent (falling block above)
 * - hunger <= 6 and no food (pause to eat)
 * - inventory full (request ascend)
 * - falling damage risk (air gap > 4 below)
 * - chunk unload (caught by safeBlock but flagged via terrain.read miss)
 */
/** True while a drop this bot intentionally shed is shunned from pickups. */
function shunnedDrop(b, e, tick) {
    return (b.grabIgnore?.get(e.id) ?? 0) >= tick;
}

function safetyYield(miner, tick) {
    const b = miner.bot;
    try {
        if (b.terrain.headInWater(b.sim)) return "Head in water - surfacing";
        if (b.sim.isInWater) return "In water - swimming to shore";
        const p = floor(b.sim.location);
        if (b.terrain.lavaNear(p)) return "Lava near feet - avoiding";
        if (b.terrain.dangerous(p) || b.terrain.dangerous(add(p, UP))) return "Hazard at feet";
        // Falling block above (gravel/sand)
        for (let dy = 1; dy <= 3; dy++) {
            const above = b.terrain.block({ x: p.x, y: p.y + dy, z: p.z });
            if (!above || above.isAir) break;
            if (/^(minecraft:)?(sand|red_sand|gravel|suspicious_sand|suspicious_gravel)$/.test(above.typeId)) {
                return `Falling ${above.typeId} above - clearing`;
            }
        }
        // Hunger guard: if starving and has food, yield to eat
        const hunger = b.sim.getComponent("minecraft:player.hunger")?.currentValue ?? 20;
        if (hunger <= 6 && b.bag.hasFood && b.bag.hasFood()) return "Hunger critical - eating";
        // Inventory full guard
        if (b.bag.container.emptySlotsCount < 1) {
            miner.wantsOut = true;
            return "Inventory full - ascending";
        }
        // Big drop below (deep hole) - need scaffold
        let gap = 0;
        for (let dy = 1; dy <= 6; dy++) {
            const below = b.terrain.block({ x: p.x, y: p.y - dy, z: p.z });
            if (!below || below.isAir) gap++;
            else break;
        }
        if (gap >= 4) return `Deep hole ${gap}b below - placing scaffold`;
    } catch {}
    return undefined;
}

export class Miner {
    constructor(bot) {
        this.bot = bot;
        this.trail = []; // breadcrumb map of the whole trip; survives reset()
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
        // Ascent / climb state (see routeAscend): ascending = the climb owns
        // settle() (never push ascended cells back onto the route), climbed =
        // a staircase/pillar step was taken this ascent (stale route cells at
        // or below the feet are behind the bot).
        this.ascending = false;
        this.climbed = false;
        this.ascProgressAt = 0;
        this.ascHighY = 0;
        this.ascFail = 0;
        this.stairWhy = "";
        this.pillarDisabledUntil = 0;
        this.pillarState = undefined;
    }

    /**
     * Breadcrumb map of the whole trip: settle() records every cell the miner
     * walks and bot.mine() records nav-walk positions too. The trail is
     * deliberately NOT cleared by reset(), so a mid-trip recovery or blocked
     * task can never lose the concrete way back to the surface again.
     * The body lives in trailTrack() so DeepMiner can share it: the deep miner
     * called this.track() on every settled step while the method only existed
     * here, which killed each trip with "this.track is not a function".
     */
    track(cell) {
        trailTrack(this, cell);
    }

    /** Ascend prep: prefer the full breadcrumb map over the reduced route. */
    adoptTrail() {
        const trail = this.trail ?? [];
        if (trail.length <= this.route.length) return;
        let end = trail.length;
        const spot = this.bot.sim.location;
        while (end > 1) {
            const c = trail[end - 1];
            if (horizontal(spot, center(c)) < 1.2 && Math.abs(spot.y - c.y) < 2) end--;
            else break;
        }
        this.route = trail.slice(0, end).map((c) => ({ ...c }));
        this.reason = `Mapping the whole way back (${this.route.length} marked cells) - front fix`;
    }

    /** Clear the map when the trip is genuinely over (fresh command). */
    dropTrail() {
        this.trail = [];
    }

    tryBridge(target, fromPos, tick) {
        const b = this.bot;
        if (b.terrain.solid(target)) return true;
        // Never fill the cell the bot stands in or the cell its head is in:
        // the builder accepted such a placement happily, the bot suffocated,
        // the think() suffocation handler broke the block, and the climb
        // re-placed it - the endless place/dig loop at the top of a staircase.
        const bp = floor(b.sim.location);
        if (target.x === bp.x && target.z === bp.z && (target.y === bp.y || target.y === bp.y + 1)) return false;
        const bk = key(target);
        if ((this.blocked.get(bk) ?? 0) > tick) return false;
        if (b.builder && b.builder.countBlocks() > 0) {
            const anchor = b.builder.findSupportFor?.(target)?.pos ?? add(fromPos, DOWN);
            const res = b.builder.placeAt(target, anchor, { autoAnchor: true, sneak: true, allowHazard: true });
            if (res === "placed") {
                this.reason = `Bridging at ${target.x},${target.y},${target.z} - miner`;
                return true;
            }
            if (res === "no-block") this.blocked.set(bk, tick + 600);
        } else {
            // No block source yet: gather ONE block from the face straight
            // ahead (never random side walls) and at most every 200 ticks, so
            // a cave floor cannot turn the trip into a hole-drilling spree.
            if (tick - (this.gatherAt ?? -999) < 200) return false;
            const p = floor(b.sim.location);
            const wallCell = add(p, this.dir ?? { x: 0, y: 0, z: 1 });
            const wb = b.terrain.block(wallCell);
            if (wb && wb.isSolid && !isUnbreakable(wb.typeId)) {
                if (this.tryDirectBreak(wallCell, tick)) {
                    this.gatherAt = tick;
                    this.reason = `Gathering a block ahead at ${wallCell.x},${wallCell.y},${wallCell.z} to bridge the gap`;
                    return true;
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
                // Never lock an ORE cell over one absorbed swing (see the
                // DeepMiner twin of this branch).
                if (!/ore/.test(bot.terrain.block(cell)?.typeId ?? "")) this.blocked.set(`${cell.x},${cell.y},${cell.z}`, tick + BLOCKED_TTL);
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
        // Never chase a drop while a dig is open ("mine one block, walk back
        // for the drop, mine one block" - that shuffle killed real tunneling).
        // The sweep is short-range too: face/underfoot drops only.
        if (this.dig || this.breakTarget) return "clear";
        // The item sweep was the single biggest per-tick cost while mining (an
        // entity query on every tick). Eight ticks is less than half a block of
        // walking, so drops are still collected, and the 60 fps budget is safe.
        if (tick - (this.dropScanAt ?? -99) < 8) return "clear";
        this.dropScanAt = tick;
        const near = b.sim.dimension.getEntities({ type: "minecraft:item", location: b.sim.location, maxDistance: 2.4 })
            .filter((e) => e.isValid && Math.abs(e.location.y - b.sim.location.y) <= 1.6 && !b.terrain.dangerous(floor(e.location)) && !shunnedDrop(b, e, tick))
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
                // Ore cells never get the long lock: a stalled swing on the
                // block we are actively hunting must stay retryable.
                if (!/ore/.test(tb.typeId ?? "")) this.blocked.set(`${this.breakTarget.x},${this.breakTarget.y},${this.breakTarget.z}`, tick + BLOCKED_TTL);
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
        // Proactively clear fallen gravel / sand / rock along the backtrack path
        const footBlock = b.terrain.block(cell);
        if (footBlock && !footBlock.isAir && !isUnbreakable(footBlock.typeId) && !footBlock.isLiquid) {
            this.tryDirectBreak(cell, tick);
        }
        const headBlock = b.terrain.block(add(cell, UP));
        if (headBlock && !headBlock.isAir && !isUnbreakable(headBlock.typeId) && !headBlock.isLiquid) {
            this.tryDirectBreak(add(cell, UP), tick);
        }
        b.nav.reset();
        b.sim.isSprinting = false;
        // Jump only from the ground: the old unguarded jump fired every tick and
        // made the bot bunny-hop in place whenever the step-up was blocked.
        this.hop(tick, cell);
        try { b.sim.moveToLocation(b.host.relative(loc), { faceTarget: true }); } catch {}
        return "moving";
    }

    goTo(cell, tick) {
        const b = this.bot;
        const prev = this.moving;
        // A NEW step starts its clock; re-issued moveTo commands for the same
        // cell must NOT reset movingSince - that reset made settle()'s stuck
        // timeouts dead code and the bot paced/hung forever on one step.
        if (!prev || prev.x !== cell.x || prev.y !== cell.y || prev.z !== cell.z) {
            this.movingSince = tick || (this.movingSince || 1);
            this.movingStart = undefined;
        }
        this.moving = { ...cell };
        b.nav.reset();
        b.sim.isSprinting = false;
        this.hop(tick, cell);
        try { b.sim.moveToLocation(b.host.relative(center(cell)), { faceTarget: true }); } catch {}
    }

    settle(tick = 0) {
        if (!this.moving) return "arrived";
        const b = this.bot, cell = this.moving;
        if (horizontal(b.sim.location, center(cell)) < 0.6 && Math.abs(b.sim.location.y - cell.y) < 1.3) {
            this.moving = undefined;
            this.movingSince = 0;
            this.movingStart = undefined;
            // While ascending, a settle of a staircase cell must NOT push the
            // cell back onto the route being drained (that looped forever).
            if (!this.ascending) {
                this.route.push({ ...cell });
                this.dug++;
                this.turns = 0;
                this.refills = 0;
                maybeTorch(this);
            }
            this.track(cell);
            return "arrived";
        }
        if (!this.movingStart) this.movingStart = { ...floor(b.sim.location) };
        // Zero progress for 25 ticks while grounded: the step is blocked; stop the
        // hop-and-walk loop early instead of bouncing against it for 80 ticks.
        // "blocked" (not "arrived"): the caller must never pop route cells for a
        // step that never happened - that fake arrival drained whole ascents.
        if (tick && tick - this.movingSince > 25 && b.sim.isOnGround && horizontal(b.sim.location, center(this.movingStart)) < 0.7) {
            this.moving = undefined;
            this.movingSince = 0;
            this.movingStart = undefined;
            this.blocked.set(`${cell.x},${cell.y},${cell.z}`, tick + 400);
            this.turn();
            return "blocked";
        }
        if (this.movingSince && tick && tick - this.movingSince > 80) {
            this.moving = undefined;
            this.movingSince = 0;
            this.movingStart = undefined;
            this.blocked.set(`${cell.x},${cell.y},${cell.z}`, tick + 400);
            this.turn();
            return "blocked";
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

    /**
     * One controlled step-up hop. The bot used to jump on every single tick
     * while a blocked step was retried - "jumps 20 times for no reason". Now:
     * only for a true one-block step-up, only from the ground, at most one hop
     * every 12 ticks, and only twice in a row without gaining height. After
     * that the hop goes quiet so the caller's settle timeout can park the step
     * and the stair/pillar primitives dig a real way up. Live symptom that
     * forced this: a hop every 12 ticks kept the bot permanently airborne, the
     * grounded settle checks never fired, and "Climbing shaft (1 left)" became
     * endless jumping.
     */
    hop(tick, cell) {
        const b = this.bot;
        if (cell.y - floor(b.sim.location).y !== 1 || !b.sim.isOnGround) return false;
        const feetY = floor(b.sim.location).y;
        const hk = `${cell.x},${cell.y},${cell.z}`;
        if (tick - (this.lastHop ?? -99) < 12) return false;
        // A hop that lands back on the same block is a locked step, not a
        // missed jump: after two futile attempts let the 25/80-tick settle
        // timeout declare the step blocked so the dig direction takes over.
        const prev = this.hopTry;
        if (prev && prev.k === hk && feetY <= prev.y) {
            this.hopFutile = (this.hopFutile ?? 0) + 1;
            if (this.hopFutile >= 2) return false;
        } else {
            this.hopFutile = 0;
        }
        this.lastHop = tick;
        this.hopTry = { k: hk, y: feetY };
        try { b.sim.jump(); } catch {}
        return true;
    }


    descendStep(tick) {
        const b = this.bot, p = floor(b.sim.location);
        const safe = safetyYield(this, tick);
        if (safe) { this.reason = safe; if (safe.startsWith("Inventory")) this.wantsOut = true; return "working"; }
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
        // Stop at the site's snapshot target. level.best is recomputed from
        // the CURRENT y on every call (bulkLevel(p.y)), so the old check
        // (floor(y) <= p.y - 4) could never fire and a bulk shaft staircased
        // through dirt indefinitely instead of stopping at its depth.
        if (r === "give-up" || floor(b.sim.location).y <= (this.site?.targetY ?? level.best)) {
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
        const safe = safetyYield(this, tick);
        if (safe) { this.reason = safe; if (safe.startsWith("Inventory")) this.wantsOut = true; return "working"; }
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
            if (this.tryBridge(floorCell, p, tick)) return "working";
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

    /**
     * Climb out along the mapped route. Delegates to the shared routeAscend:
     * it re-verifies every route cell (rebuildRoute), climbs columns with
     * pillar/staircase primitives instead of trusting A* (which cannot climb
     * a dug shaft), and never fakes an arrival.
     */
    ascend(tick) {
        return routeAscend(this.bot, this, tick, "front fix");
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
        this.straight = false;
        // Ascent / climb state (see routeAscend): same contract as Miner.
        this.ascending = false;
        this.climbed = false;
        this.ascProgressAt = 0;
        this.ascHighY = 0;
        this.ascFail = 0;
        this.stairWhy = "";
        this.pillarDisabledUntil = 0;
        this.pillarState = undefined;
        this.climbAim = undefined;
        this.climbSince = 0;
        this.climbY = 0;
        this.rescue = undefined; // digToSurface pocket-climb state (per token attempt)
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
        // Never fill the cell the bot stands in or the cell its head is in:
        // the builder accepted such a placement happily, the bot suffocated,
        // the think() suffocation handler broke the block, and the climb
        // re-placed it - the endless place/dig loop at the top of a staircase.
        const bp = floor(b.sim.location);
        if (target.x === bp.x && target.z === bp.z && (target.y === bp.y || target.y === bp.y + 1)) return false;
        const bk = key(target);
        if ((this.blocked.get(bk) ?? 0) > tick) return false;
        if (b.builder && b.builder.countBlocks() > 0) {
            const anchor = b.builder.findSupportFor?.(target)?.pos ?? add(fromPos, DOWN);
            const res = b.builder.placeAt(target, anchor, { autoAnchor: true, sneak: true, allowHazard: true });
            if (res === "placed") {
                this.reason = `Bridging at ${target.x},${target.y},${target.z} - deep miner`;
                return true;
            }
            if (res === "no-block") this.blocked.set(bk, tick + 600);
        } else {
            // No block source yet: gather ONE block from the face straight
            // ahead (never random side walls) and at most every 200 ticks, so
            // a cave floor cannot turn the trip into a hole-drilling spree.
            if (tick - (this.gatherAt ?? -999) < 200) return false;
            const p = floor(b.sim.location);
            const wallCell = add(p, this.dir ?? { x: 0, y: 0, z: 1 });
            const wb = b.terrain.block(wallCell);
            if (wb && wb.isSolid && !isUnbreakable(wb.typeId)) {
                if (this.tryDirectBreak(wallCell, tick)) {
                    this.gatherAt = tick;
                    this.reason = `Gathering a block ahead at ${wallCell.x},${wallCell.y},${wallCell.z} to bridge the gap`;
                    return true;
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
                // Never lock an ORE cell out of the run over one absorbed
                // swing: a 1800-tick block entry was why the SAME visible iron
                // got skipped "again and again". veinStep's per-ore deadline
                // bounds retries instead.
                if (!/ore/.test(bot.terrain.block(cell)?.typeId ?? "")) this.blocked.set(key(cell), tick + BLOCKED_TTL);
                return false;
            }
            return true; // still breaking
        }

        // Start breaking front block directly - no nav needed
        try { bot.sim.stopBreakingBlock(); } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }
        if (bot.breakThrough(cell) !== "digging") {
            return false;
        }
        const fresh = bot.terrain.block(cell);
        if (!fresh || fresh.isAir) {
            // The swing landed on a cell that turned out to be open (a prior
            // break completed this very tick): nothing to track, no "breaking
            // air" reason to own the next ticks.
            return true;
        }
        this.breakTarget = { ...cell };
        this.breakingSince = tick;
        this.reason = `Breaking front ${fresh.typeId} at ${cell.x},${cell.y},${cell.z} - direct front mining deep`;
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
        // Never chase a drop while a dig is open: the "mine one block, walk
        // back for the drop, mine one block" shuffle the user saw was exactly
        // this. And the sweep is short-range now - only the face/underfoot
        // drops - so a tunnel keeps its forward goal; the trail gets swept on
        // the way out instead.
        if (this.dig || this.breakTarget) return "clear";
        // Same throttle as Miner.maybeCollect: no entity query more than once
        // per 8 ticks while the deep trip runs.
        if (tick - (this.dropScanAt ?? -99) < 8) return "clear";
        this.dropScanAt = tick;
        const near = b.sim.dimension.getEntities({ type: "minecraft:item", location: b.sim.location, maxDistance: 2.4 })
            .filter(e => e.isValid && Math.abs(e.location.y - b.sim.location.y) <= 2 && !b.terrain.dangerous(floor(e.location)) && !shunnedDrop(b, e, tick))
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
                // Same ore exemption as everywhere else in the dig loop.
                if (!/ore/.test(tb.typeId ?? "")) this.blocked.set(key(this.breakTarget), tick + BLOCKED_TTL);
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
        // Proactively clear fallen gravel / sand / rock along backtrack route
        const footBlock = b.terrain.block(cell);
        if (footBlock && !footBlock.isAir && !isUnbreakable(footBlock.typeId) && !footBlock.isLiquid) {
            this.tryDirectBreak(cell, tick);
        }
        const headBlock = b.terrain.block(add(cell, UP));
        if (headBlock && !headBlock.isAir && !isUnbreakable(headBlock.typeId) && !headBlock.isLiquid) {
            this.tryDirectBreak(add(cell, UP), tick);
        }
        b.nav.reset();
        b.sim.isSprinting = false;
        this.hop(tick, cell);
        try { b.sim.moveToLocation(b.host.relative(loc), { faceTarget: true }); } catch {}
        return "moving";
    }

    goTo(cell, tick) {
        const prev = this.moving;
        // Same clock fix as Miner.goTo: only a genuinely new step restarts the
        // stuck-timer, otherwise settle() can never time out a bad step.
        if (!prev || prev.x !== cell.x || prev.y !== cell.y || prev.z !== cell.z) {
            this.movingSince = tick || (this.movingSince || 1);
            this.movingStart = undefined;
        }
        this.moving = { ...cell };
        const b = this.bot;
        b.nav.reset();
        b.sim.isSprinting = false;
        this.hop(tick, cell);
        try { b.sim.moveToLocation(b.host.relative(center(cell)), { faceTarget: true }); } catch {}
    }

    settle(tick = 0) {
        if (!this.moving) return "arrived";
        const b = this.bot, cell = this.moving;
        if (horizontal(b.sim.location, center(cell)) < 0.6 && Math.abs(b.sim.location.y - cell.y) < 1.3) {
            this.moving = undefined;
            this.movingSince = 0;
            this.movingStart = undefined;
            // While ascending, a settle of a staircase cell must NOT push the
            // cell back onto the route being drained (that looped forever).
            if (!this.ascending) {
                this.route.push({ ...cell });
                this.dug++;
                this.turns = 0;
                this.refills = 0;
                maybeTorch(this);
            }
            this.track(cell);
            return "arrived";
        }
        if (!this.movingStart) this.movingStart = { ...floor(b.sim.location) };
        // Zero progress for 25 ticks while grounded: the step is blocked. For a
        // straight shaft, re-issue the drop instead of turning away - turning
        // back into already-dug dirt is the "break two blocks and come back"
        // loop. After 80 ticks the straight attempt is parked and the
        // staircase takes over; no direction ever turns back on itself.
        // Give-up returns "blocked" (NOT "arrived"): a step that never happened
        // must never pop a route cell - fake arrivals drained whole ascents.
        const giveUpStep = !!(tick && tick - this.movingSince > 80);
        if (tick && tick - this.movingSince > 25 && b.sim.isOnGround && horizontal(b.sim.location, center(this.movingStart)) < 0.7 && !giveUpStep) {
            if (this.straight && !this.ascending) {
                this.goTo(cell, tick);
                return "moving";
            }
            this.moving = undefined;
            this.movingSince = 0;
            this.movingStart = undefined;
            this.blocked.set(key(cell), tick + 400);
            this.turn();
            return "blocked";
        }
        if (giveUpStep) {
            this.moving = undefined;
            this.movingSince = 0;
            this.movingStart = undefined;
            if (this.straight && !this.ascending) {
                this.straight = false;
                this.straightBlockedUntil = tick + 600;
                this.blocked.set(key(cell), tick + 120);
                this.turns = 0;
                this.reason = "Straight shaft blocked - switching to the staircase";
            } else {
                this.blocked.set(key(cell), tick + 400);
                this.turn();
            }
            return "blocked";
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

    /**
     * One controlled step-up hop. The bot used to jump on every single tick
     * while a blocked step was retried - "jumps 20 times for no reason". Now:
     * only for a true one-block step-up, only from the ground, at most one hop
     * every 12 ticks, and only twice in a row without gaining height. After
     * that the hop goes quiet so the caller's settle timeout can park the step
     * and the stair/pillar primitives dig a real way up. Live symptom that
     * forced this: a hop every 12 ticks kept the bot permanently airborne, the
     * grounded settle checks never fired, and "Climbing shaft (1 left)" became
     * endless jumping.
     */
    hop(tick, cell) {
        const b = this.bot;
        if (cell.y - floor(b.sim.location).y !== 1 || !b.sim.isOnGround) return false;
        const feetY = floor(b.sim.location).y;
        const hk = `${cell.x},${cell.y},${cell.z}`;
        if (tick - (this.lastHop ?? -99) < 12) return false;
        // A hop that lands back on the same block is a locked step, not a
        // missed jump: after two futile attempts let the 25/80-tick settle
        // timeout declare the step blocked so the dig direction takes over.
        const prev = this.hopTry;
        if (prev && prev.k === hk && feetY <= prev.y) {
            this.hopFutile = (this.hopFutile ?? 0) + 1;
            if (this.hopFutile >= 2) return false;
        } else {
            this.hopFutile = 0;
        }
        this.lastHop = tick;
        this.hopTry = { k: hk, y: feetY };
        try { b.sim.jump(); } catch {}
        return true;
    }


    descendStep(tick) {
        const b = this.bot, p = floor(b.sim.location);
        const safe = safetyYield(this, tick);
        if (safe) { this.reason = safe; if (safe.startsWith("Inventory")) this.wantsOut = true; return "working"; }
        if (this.maybeCollect(tick) === "busy") return "working";
        if (this.moving) {
            return this.settle(tick) === "arrived" ? "stepped" : "working";
        }
        if (this.turns >= 2) {
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

    ensureShaft(tick, scanForOres) {
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
        // Seeing the ore beats digging past it: this is the "there is iron
        // RIGHT THERE and it kept going down" report. A matching ore within
        // reach of the shaft switches the trip to vein mining on the spot.
        if (scanForOres && tick % 20 === 0) {
            const veins = scanForOres();
            if (veins && veins.length) {
                const clusters = clusterVeins(veins, 4);
                const first = clusters[0];
                const n = first?.find((o) => distance(p, o) <= 8);
                if (n) {
                    this.veins = clusters;
                    this.currentVein = first;
                    for (const o of first) this.blocked.delete(key(o));
                    this.phase = "vein";
                    this.reason = `Ore spotted ${Math.round(distance(p, n))} blocks away at Y=${n.y}; mining it now - advanced`;
                    return "working";
                }
            }
        }
        if (this.route.length === 1 && horizontal(b.sim.location, center(this.site.origin)) > 2) {
            const r = b.nav.go(center(this.site.origin), tick);
            this.reason = `Walking to shaft head - advanced`;
            if (r === "failed") return "blocked";
            return "working";
        }
        // Above the target level the shaft goes straight down: one cell per
        // step, no turns, no re-digging. The staircase is only the fallback
        // where the straight column is unsafe (lava, cavities, bedrock).
        if (!this.straight && p.y > this.site.targetY + 6 && tick >= (this.straightBlockedUntil ?? 0)) {
            this.straight = true;
            this.reason = "Shafting straight to the target depth";
        }
        if (this.straight && tick >= (this.straightBlockedUntil ?? 0)) {
            const rr = this.straightDown(tick);
            if (rr === "at-depth") {
                this.straight = false;
                const q = floor(b.sim.location);
                this.phase = "branch";
                this.branchOrigin = { ...q };
                this.branchPath = branchPattern(80, 16, optimalSpacing(this.site.ore));
                this.branchIndex = 0;
                this.turns = 0;
                this.reason = `Straight shaft reached Y=${q.y}; branch mining for ${this.site.ore} - advanced unbreakable`;
                return "at-depth";
            }
            if (rr === "unsafe") {
                this.straight = false;
                this.turns = 0;
                this.reason = "Straight shaft unsafe - resuming the staircase";
                return "working";
            }
            return "working";
        }
        const r = this.descendStep(tick);
        if (r === "give-up") {
            // Never branch at the wrong depth. Above the target level, or stuck
            // in a soil pocket, keep going straight down instead - branching in
            // dirt at Y=60 is exactly what made trips "mine dirt and random
            // blocks" for no reason.
            const floorType = b.terrain.block(add(p, DOWN))?.typeId;
            if (p.y > this.site.targetY + 6 || isSoil(floorType)) {
                if (tick >= (this.straightBlockedUntil ?? 0)) {
                    this.straight = true;
                    this.turns = 0;
                    this.reason = "Staircase jammed - switching to a straight-down shaft";
                } else {
                    // Straight down is on cooldown (lava/cavity below): rotate to
                    // a fresh heading instead of turning back on old cells.
                    this.dir = { x: -this.dir.z, y: 0, z: this.dir.x };
                    this.turns = 0;
                    this.reason = "Staircase jammed; rotating to a fresh heading";
                }
                return "working";
            }
            this.phase = "branch";
            this.branchOrigin = { ...p };
            this.branchPath = branchPattern(60, 12, 3);
            this.branchIndex = 0;
            return "at-depth";
        }
        if (r === "no-tool" || r === "stalled") return r;
        return "working";
    }

    /** Same breadcrumb map as Miner.track - shared via trailTrack(). */
    track(cell) {
        trailTrack(this, cell);
    }

    /**
     * Emergency straight-down shaft: stand still, break the block underfoot,
     * drop into the hole, repeat. Used when the staircase cannot advance (cave
     * floors, soil pockets) so the trip keeps making downward progress instead
     * of turning in circles and drilling sideways holes at the wrong depth.
     * Bails back to the staircase at bedrock, lava, or any deep cavity.
     */
    straightDown(tick) {
        const b = this.bot, p = floor(b.sim.location);
        if (this.moving) {
            return this.settle(tick) === "arrived" ? "stepped" : "working";
        }
        if (this.site && p.y <= this.site.targetY + 1) return "at-depth";
        const safe = safetyYield(this, tick);
        if (safe) { this.reason = safe; if (safe.startsWith("Inventory")) this.wantsOut = true; return "working"; }
        if (this.maybeCollect(tick) === "busy") return "working";
        const below = add(p, DOWN);
        const bb = b.terrain.block(below);
        if (!bb) return "working"; // chunk not loaded: never dig blind
        // Exposed ore beside the shaft is mined the moment it is seen: the face
        // neighbours of the cell we are about to open are checked first, so a
        // vein is never sealed behind the shaft wall.
        const sideOffsets = [{ x: 1, y: 0, z: 0 }, { x: -1, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 }, { x: 0, y: -1, z: 0 }];
        for (const d of sideOffsets) {
            const spot = add(below, d);
            if ((this.blocked.get(key(spot)) ?? 0) > tick) continue;
            const t = b.terrain.typeAt(spot);
            if (t && (/_ore$/.test(t) || t === "minecraft:ancient_debris")) {
                const rr = this.open([spot], tick);
                if (rr === "digging" || rr === "open") {
                    this.reason = `Exposed ${t.replace("minecraft:", "")} beside the shaft - mining it now`;
                    return "working";
                }
            }
        }
        if (bb.isLiquid || b.terrain.lavaAt(below) || b.terrain.lavaAt(add(below, DOWN))) {
            this.straightBlockedUntil = tick + 600;
            this.reason = "Lava under the shaft - back to the staircase";
            return "unsafe";
        }
        if (isUnbreakable(bb.typeId)) {
            this.straightBlockedUntil = tick + 600;
            this.reason = "Bedrock under the shaft - back to the staircase";
            return "unsafe";
        }
        if (bb.isAir) {
            // A cavity: only step down when the landing is close.
            let depth = 0;
            for (let dy = 2; dy <= 5; dy++) {
                const nb = b.terrain.block({ x: p.x, y: p.y - dy, z: p.z });
                if (nb && !nb.isAir) break;
                depth++;
            }
            if (depth >= 3) {
                this.straightBlockedUntil = tick + 600;
                this.reason = "Deep cavity under the shaft - back to the staircase";
                return "unsafe";
            }
            this.goTo(below, tick);
            return "working";
        }
        const r = this.open([below], tick);
        if (r === "digging") return "working";
        if (r !== "open") {
            this.straightBlockedUntil = tick + 600;
            this.reason = `Straight-down blocked (${r}) - back to the staircase`;
            return "unsafe";
        }
        this.reason = `Shaft down: opening ${below.x},${below.y},${below.z} (Y ${p.y} to ${this.site?.targetY ?? "?"})`;
        this.goTo(below, tick);
        return "working";
    }

    branchStep(tick, scanForOres) {
        const b = this.bot;
        const safe = safetyYield(this, tick);
        if (safe) { this.reason = safe; if (safe.startsWith("Inventory")) this.wantsOut = true; return "working"; }
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
                    // Fresh look at every ore in the cluster: stale `blocked`
                    // entries from transient failures must not hide the ore
                    // that is literally in front of the bot.
                    for (const o of clusters[0]) this.blocked.delete(key(o));
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
            if (boundedBridge(this, floorCell, p, tick) === "working") return "working";
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
            // Resume the descent when the vein was found mid-shaft; only fall
            // back to branch mining at the target depth. (A vein spotted at
            // Y=45 must not leave the bot branching in the wrong place.)
            const q = floor(this.bot.sim.location);
            this.phase = this.site && q.y > (this.site.targetY ?? -64) + 6 ? "shaft" : "branch";
            return "done";
        }
        const b = this.bot;
        const safe = safetyYield(this, tick);
        if (safe) { this.reason = safe; if (safe.startsWith("Inventory")) this.wantsOut = true; return "working"; }
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
                const q = floor(b.sim.location);
                this.phase = this.site && q.y > (this.site.targetY ?? -64) + 6 ? "shaft" : "branch";
                return "done";
            }
            return "working";
        }
        // Bounded progress deadline per ore: skip it honestly when stuck - but
        // do NOT lock the cell for 1800 ticks. The lock was why the SAME
        // visible iron got "skipped again and again": one transient failure
        // kept the ore out of every later scan for 90 seconds.
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
            if (r === "no-tool" || r === "lava" || r === "water") {
                // Only persistent obstacles get the long lock. "unreachable" /
                // "refused" are one-tick transients (wrong tool in hand, an
                // absorbed swing); locking those kept the same visible ore
                // skipped for 1800 ticks - the reported "skipping it again and
                // again". The per-ore 900-tick deadline above keeps retries
                // bounded without a hard lock.
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
            if (boundedBridge(this, stepFloor, p, tick) === "working") return "working";
            this.skipOre(nearest, `No floor toward ore at ${nearest.x},${nearest.y},${nearest.z}; skipping it.`);
            return "working";
        }
        if (b.terrain.liquid(step)) {
            if (boundedBridge(this, step, p, tick) === "working") return "working";
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

    /**
     * Climb out along the mapped route. Delegates to the shared routeAscend:
     * it re-verifies every route cell (rebuildRoute), climbs columns with
     * pillar/staircase primitives instead of trusting A* (which cannot climb
     * a dug shaft), and never fakes an arrival.
     */
    ascend(tick) {
        return routeAscend(this.bot, this, tick, "advanced unbreakable");
    }

    /**
     * Bounded climb toward a cell that is NOT on the route (the walk-out
     * breadcrumb case in bot.mine()). Climbs with pillar/staircase primitives;
     * gives "done" when the cell is reached, "running" while climbing and
     * "blocked" after 700 ticks without gaining height.
     */
    climbStep(target, tick) {
        const b = this.bot;
        if (!this.climbAim || this.climbAim.x !== target.x || this.climbAim.y !== target.y || this.climbAim.z !== target.z) {            this.climbAim = { ...target };
            this.climbSince = tick;
            this.climbY = floor(b.sim.location).y;
            this.ascending = true;
        }
        const p = floor(b.sim.location);
        if (p.y > this.climbY) { this.climbY = p.y; this.climbSince = tick; }
        if (tick - this.climbSince > 700) {
            this.ascending = false;
            this.reason = "Cannot climb back to the mapped path" + (this.stairWhy ? " (" + this.stairWhy + ")" : "") + "; switching to the entrance column";
            return "blocked";
        }
        const r = ascendStep(b, this, target, tick, headingToward(b, target));
        if (r === "arrived") {
            this.ascending = false;
            this.climbAim = undefined;
            this.reason = "Back on the mapped path - advanced";
            return "done";
        }
        this.reason = `Climbing back to the mapped path (${target.y - p.y} up) - advanced`;
        return r === "blocked" ? "blocked" : "running";
    }

    /**
     * Last-ditch self rescue BEFORE handing a stuck return to the owner: the
     * bot can always mine and bridge up. Ordinary climb primitives (pillar /
     * staircase) are retried each tick; when the staircase refuses every
     * direction, a fresh 1x1 pocket is cut into an unopened wall and the climb
     * restarts from its floor. The cut is gated on terrain.safeToMineEx so a
     * dig up respects the three care points: no falling column (gravel/sand)
     * overhead, no water or lava in or beside the cut. Bounded - 900 ticks
     * without gaining a block of height returns "blocked", after which the
     * caller hands the task over honestly.
     */
    digToSurface(tick) {
        const b = this.bot;
        const p = floor(b.sim.location);
        if (!this.rescue) this.rescue = { since: tick, top: p.y, tried: new Map() };
        if (p.y > this.rescue.top) { this.rescue.top = p.y; this.rescue.since = tick; }
        if (tick - this.rescue.since > 900) {
            this.reason = "Self-rescue gained no height; handing the stuck shaft over";
            this.rescue = undefined;
            return "blocked";
        }
        if (climbUp(b, this, tick, this.rescue.dir) === "working") return "working";
        // Every staircase direction refused: cut a pocket into a wall that
        // the staircase could not be carved beside, then climb from there.
        const dirs = [];
        const push = (d) => {
            const x = Math.sign(d?.x), z = Math.sign(d?.z);
            if ((x || z) && !dirs.some((q) => q.x === x && q.z === z))
                dirs.push({ x, y: 0, z });
        };
        push(this.rescue.dir);
        for (const d of STAIR_DIRS) push(d);
        for (const d of dirs) {
            const k = `${d.x},${d.z}`;
            if ((this.rescue.tried.get(k) ?? 0) > tick)
                continue; // this wall just refused or was recently cut
            const pw = add(p, d); // pocket cell, body level
            if ((this.blocked.get(key(pw)) ?? 0) > tick)
                continue;
            if (!b.terrain.solid(pw) && !b.terrain.solid(add(pw, UP))) {
                // Already an open cell: stand in it and climb from there.
                this.rescue.dir = { x: d.x, y: 0, z: d.z };
                this.dir = this.rescue.dir;
                this.goTo(pw, tick);
                return "working";
            }
            if (!b.terrain.solid(add(pw, DOWN)) || b.terrain.liquid(add(pw, DOWN))) {
                // A pocket needs its own floor to stand on while carving up.
                this.rescue.tried.set(k, tick + 600);
                continue;
            }
            // The cut itself must be safe: liquid in the cells being opened,
            // lava/water ring around it, falling column above - all refuse.
            if (!b.terrain.safeToMineEx(pw)) {
                this.rescue.tried.set(k, tick + 600);
                continue;
            }
            const r = this.open([add(pw, UP), pw], tick);
            if (r === "digging") {
                this.reason = `Digging a pocket ${d.x > 0 ? "east" : d.x < 0 ? "west" : d.z > 0 ? "south" : "north"} to cut the climb free`;
                return "working";
            }
            if (r === "open") {
                this.rescue.dir = { x: d.x, y: 0, z: d.z };
                this.dir = this.rescue.dir;
                this.goTo(pw, tick);
                return "working";
            }
            this.rescue.tried.set(k, tick + 600); // refused (no-tool, stalled...)
        }
        this.reason = `No climb and no diggable wall (${this.stairWhy || "every direction refused"})`;
        return "blocked";
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
                const r = this.ensureShaft(tick, scanFn);
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
/** Soil-ish blocks: a staircase or branch here is digging dirt, not ore. */
const SOIL_RE = /^(dirt|coarse_dirt|rooted_dirt|grass_block|podzol|mycelium|farmland|.*_path|sand|red_sand|gravel|clay|mud|.*_mud|snow|snow_layer|.*_concrete_powder)$/;
function isSoil(typeId) {
    return typeof typeId === "string" && SOIL_RE.test(typeId.replace(/^minecraft:/, ""));
}

/**
 * Shared breadcrumb bookkeeping for Miner and DeepMiner. Records the walked
 * cell, unwinds short revisit loops so the map stays the shortest path, and
 * caps the length. Module scope on purpose: a method that only one of the two
 * miner classes owns is exactly how "this.track is not a function" shipped.
 */
function trailTrack(m, cell) {
    const trail = (m.trail ??= []);
    const n = trail.length;
    if (n) {
        const last = trail[n - 1];
        if (last.x === cell.x && last.y === cell.y && last.z === cell.z) return;
        // Revisited an older cell (wandering / backtracking): unwind the loop
        // so the map stays the shortest path from the shaft head outward.
        for (let i = n - 8; i >= 0 && i >= n - 60; i--) {
            const t = trail[i];
            if (t.x === cell.x && t.y === cell.y && t.z === cell.z) {
                trail.length = i + 1;
                return;
            }
        }
    }
    trail.push({ ...cell });
    if (trail.length > 1200) trail.splice(0, 400);
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

// ------------------------------------------------------------ climb helpers
//
// Walking (moveToLocation) cannot move a player UP a dug shaft: there is no
// floor to step onto, so every retry slides back to the bottom. The old ascent
// had no climb primitive at all - it issued moveTo to the cell above, waited,
// then handed the whole job to A* (`nav.go(origin)`), which cannot climb the
// shaft either. That pair is the "walks 5 blocks forward and 5 back, unable to
// come out" loop. These helpers are the missing primitive, shared by both
// miners and by the cave-exit path:
//   - pillarStep:  jump + place a block under the feet (a straight column up)
//   - digUpStep:   mine the block above the head, then pillar into the freed
//                  space - the fastest straight-up escape when rock roofs the
//                  column
//   - stairUpStep: carve a fresh 1x1 staircase upward beside the shaft (no
//                  blocks needed - the ceiling block is dug, not placed)
//   - climbUp:     pillar when the column is open, digUp when it is roofed,
//                  carve the staircase otherwise - all bounded
//   - ascendStep:  verify/rebuild the next route cell before trusting it
//                  (bridge a missing floor, reopen a buried tunnel, climb a
//                  column) - the blast/cave recovery the handoff calls
//                  rebuildRoute(), applied to the walk-out.

const STAIR_DIRS = [
    { x: 1, y: 0, z: 0 }, { x: -1, y: 0, z: 0 },
    { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 },
];
/** Sand/gravel family: falling blocks that would pour into an opened shaft. */
const FALLING_RE = /^(minecraft:)?(sand|red_sand|gravel|suspicious_sand|suspicious_gravel)$/;

/** Dominant-axis unit direction from the bot toward a cell (null when aligned). */
function headingToward(bot, target) {
    const p = floor(bot.sim.location);
    const dx = target.x - p.x, dz = target.z - p.z;
    if (!dx && !dz) return null;
    if (Math.abs(dx) >= Math.abs(dz)) return { x: Math.sign(dx), y: 0, z: 0 };
    return { x: 0, y: 0, z: Math.sign(dz) };
}

/**
 * Bounded tryBridge for the climb paths. A placement that is accepted but
 * never actually lands in the world (absorbed swing, protected cell, engine
 * refusing the place) must not pin a climb: the old unbounded retry printed
 * "Climbing shaft (47 left)" for 900 ticks while re-issuing the same bridge
 * every single tick. After `budget` ticks on the same cell the bridge is
 * declared unavailable so the caller can carve a staircase instead.
 */
function boundedBridge(m, target, fromPos, tick, budget = 140) {
    const k = key(target);
    if (m.bridgeKey !== k) { m.bridgeKey = k; m.bridgeSince = tick; }
    if (tick - (m.bridgeSince ?? tick) > budget) return "unavailable";
    if (m.tryBridge(target, fromPos, tick)) return "working";
    m.bridgeKey = undefined;    // a clean refusal may be retried next tick
    return "unavailable";
}

/**
 * One column-climb step: jump and fill the cell under the feet. Bail out when
 * the builder cannot gain a single block of height (no blocks, no physics
 * support, occupied cell) so the caller can carve a staircase instead. The
 * result is a hint, not a promise: "working" also covers "jump started".
 */
function pillarStep(bot, m, tick) {
    if (tick < (m.pillarDisabledUntil ?? 0)) return "unavailable";
    if (bot.builder.countBlocks() < 1) { m.pillarDisabledUntil = tick + 600; return "unavailable"; }
    const p = floor(bot.sim.location);
    if (!bot.terrain.block(add(p, DOWN))) { m.pillarDisabledUntil = tick + 600; return "unavailable"; }
    const st = m.pillarState;
    if (!st || st.x !== p.x || st.z !== p.z) m.pillarState = { x: p.x, z: p.z, top: p.y, since: tick };
    const s = m.pillarState;
    if (p.y > s.top) { s.top = p.y; s.since = tick; }          // rising: keep going
    else if (tick - s.since > 80) {                             // 4s, not one block up
        try { bot.builder.resetPillar?.(); } catch { /* ignore */ }
        m.pillarDisabledUntil = tick + 600;
        m.pillarState = undefined;
        return "unavailable";
    }
    const r = bot.builder.pillar(tick);
    if (r === "no-block" || r === "blocked" || r === "timeout") {
        try { bot.builder.resetPillar?.(); } catch { /* ignore */ }
        m.pillarDisabledUntil = tick + 600;
        m.pillarState = undefined;
        return "unavailable";
    }
    m.climbed = true;
    return "working";
}

/**
 * Carve one 1x1 staircase step upward beside the current column: clear the two
 * cells the body needs at (+dir, y+1) and walk/hop onto the block that was
 * already beside the feet. Never steps over a hole (bridge or skip) and never
 * digs the support block. The chosen direction is committed so the bot cannot
 * dither between two candidates - that dithering was the 5-blocks-back-and-forth
 * walk.
 */
function stairUpStep(bot, m, tick, ideal) {
    const p = floor(bot.sim.location);
    const dirs = [];
    const push = (d) => {
        if (!d) return;
        const x = Math.sign(d.x), z = Math.sign(d.z);
        if (!x && !z) return;
        if (!dirs.some((q) => q.x === x && q.z === z)) dirs.push({ x, y: 0, z });
    };
    push(ideal);
    push(m.dir);
    for (const d of dirs.slice()) { push({ x: -d.z, z: d.x }); push({ x: d.z, z: -d.x }); }
    for (const d of STAIR_DIRS) push(d);
    const why = [];
    let waterStep;
    for (const d of dirs) {
        const n = { x: p.x + d.x, y: p.y + 1, z: p.z + d.z };
        if ((m.blocked.get(key(n)) ?? 0) > tick) continue;
        if (bot.terrain.lavaAt(n) || bot.terrain.lavaAt(add(n, UP))) { why.push("lava"); continue; }
        if (bot.terrain.dangerous(n) || bot.terrain.dangerous(add(n, UP))) { why.push("hazard"); continue; }
        const foot = add(n, DOWN);
        if (!bot.terrain.solid(foot) || bot.terrain.liquid(foot)) {
            // The step needs its support block; place one when the bag has it,
            // otherwise try another direction instead of stepping into a hole.
            if (boundedBridge(m, foot, p, tick) === "working") { m.dir = d; m.climbed = true; return "working"; }
            // Out of blocks? Mine the wall above the step for one: stone drops
            // cobblestone and cobblestone is a legal bridge. "Always mine and
            // bridge up" - a miner holding a pickaxe is never actually out of
            // bridge material, it just had not looked yet.
            if (bot.builder.countBlocks() < 1) {
                const o = m.open([n, add(n, UP)], tick);
                if (o === "digging") { m.dir = d; m.climbed = true; return "working"; }
            }
            why.push("no floor");
            continue;
        }
        if (bot.terrain.liquid(n)) {
            // Lava was already refused above, so this is water: remember one
            // swim step as a last resort instead of giving up on the climb.
            if (!waterStep) waterStep = d;
            why.push("water");
            continue;
        }
        const r = m.open([add(n, UP), n], tick);
        if (r === "digging") { m.dir = d; m.climbed = true; return "working"; }
        if (r !== "open") { why.push(String(r)); continue; }
        m.dir = { x: d.x, y: 0, z: d.z };
        m.climbed = true;
        m.goTo(n, tick);
        return "working";
    }
    // In a flooded column with no dry step at all: swim up it (refuses lava).
    if (floodedClimb(bot, m, tick) === "working") return "working";
    // Dry feet, every dry step unavailable, but one direction opens into
    // water: take it. Rising through a flooded step beats declaring help.
    if (waterStep) {
        m.dir = waterStep;
        m.climbed = true;
        m.goTo({ x: p.x + waterStep.x, y: p.y + 1, z: p.z + waterStep.z }, tick);
        return "working";
    }
    m.stairWhy = why.slice(0, 3).join("/") || "no direction";
    return "blocked";
}

/**
 * Fastest straight-up escape ("up & out"): mine the block above the head, then
 * pillar-jump into the freed space - the classic player "dig straight up to
 * the surface" move. This is the primitive the old climb lacked whenever the
 * space above the head was solid rock: the pillar could not rise and the only
 * fallback was carving a slow sideways staircase.
 *
 * Safety is strict because an opened ceiling is irreversible:
 *   - lava anywhere in the next five cells above: refuse (the staircase owns
 *     that column, and the mine is remembered for a while)
 *   - falling blocks (sand/gravel) two-plus cells above the ceiling: refuse
 *     (they would pour into the shaft while the body is airborne)
 *   - water at the head or ceiling: flooded climb / the staircase own those
 *   - unbreakable or blacklisted ceiling: refuse and remember it
 * The block directly above (the ceiling itself) may be sand/gravel: breaking
 * it just drops it - a falling block only pours when a NEIGHBOUR is broken -
 * so the one-cell chain stays contained above the body. Without pillar
 * material the freshly mined cobble is swept up first; anything else falls
 * through to stairUpStep, so behaviour can only improve, never regress.
 * Returns "working" while digging/pillaring, "unavailable" to pass.
 */
function digUpStep(bot, m, tick) {
    if (tick < (m.digUpDisabledUntil ?? 0)) return "unavailable";
    const p = floor(bot.sim.location);
    const head = add(p, UP);
    const ceil = { x: p.x, y: p.y + 2, z: p.z };
    for (let dy = 1; dy <= 5; dy++) {
        const c = { x: p.x, y: p.y + dy, z: p.z };
        if (bot.terrain.lavaAt(c)) {
            m.digUpDisabledUntil = tick + 900;
            m.stairWhy = "lava above";
            return "unavailable";
        }
        if (dy >= 3) {
            const bb = bot.terrain.block(c);
            if (bb && !bb.isAir && !bb.isLiquid && FALLING_RE.test(bb.typeId)) {
                m.digUpDisabledUntil = tick + 600;
                m.stairWhy = "falling blocks above";
                return "unavailable";
            }
        }
    }
    if (bot.terrain.waterAt(head) || bot.terrain.waterAt(ceil)) return "unavailable";

    const headSolid = bot.terrain.solid(head);
    const ceilSolid = bot.terrain.solid(ceil);
    if (headSolid || ceilSolid) {
        const cells = [];
        if (headSolid) cells.push(head);
        if (ceilSolid) cells.push(ceil);
        const o = m.open(cells, tick);
        if (o === "digging") {
            m.digUpCleared = true;
            m.climbed = true;
            m.reason = `Up & out: mining overhead Y=${p.y + 2} to pillar straight up`;
            return "working";
        }
        if (o === "open" && !bot.terrain.solid(ceil) && !bot.terrain.solid(head)) {
            m.digUpCleared = true;
            m.climbed = true;
            return "working";
        }
        // blocked / no-tool / stalled / a blacklisted cell reported open: the
        // straight column is not our way out right now - carve sideways.
        m.digUpDisabledUntil = tick + (o === "open" ? 600 : 300);
        m.stairWhy = m.stairWhy ?? (o === "open" ? "ceiling unbreakable" : `ceiling: ${o}`);
        return "unavailable";
    }

    // Column above is open: pillar step (fastest). Without material, sweep the
    // cobble the ceiling dig just dropped instead of leaving it lying there.
    if (bot.builder.countBlocks() < 1) {
        if (m.maybeCollect?.(tick) === "busy") { m.digUpCleared = true; return "working"; }
        return "unavailable";
    }
    if (m.digUpCleared) {
        // The ceiling WE just cleared (or the cobble WE just swept) may have
        // retired a pillar cooldown a blocked/no-block probe had set; give the
        // opened column a clean chance before falling through to the stairs.
        m.digUpCleared = false;
        m.pillarDisabledUntil = 0;
        m.pillarState = undefined;
        try { bot.builder.resetPillar?.(); } catch { /* ignore */ }
    }
    const r = pillarStep(bot, m, tick);
    return r === "working" ? "working" : "unavailable";
}

/** Open column: pillar. Roofed column: mine up & pillar. Anything else: carve
 *  the staircase. Returns working|blocked (bounded by each step's own logic). */
function climbUp(bot, m, tick, ideal) {
    const p = floor(bot.sim.location);
    const ceilingOpen = !bot.terrain.solid({ x: p.x, y: p.y + 2, z: p.z });
    if (ceilingOpen) {
        const pil = pillarStep(bot, m, tick);
        if (pil === "working") return "working";
    }
    if (digUpStep(bot, m, tick) === "working") return "working";
    return stairUpStep(bot, m, tick, ideal);
}

/**
 * Last-resort move when a climb sits in a flooded column: swim up. Water is
 * passable, aquifer pockets are bounded, and rising through the flood is the
 * one way up that needs neither blocks nor a dry wall. Callers already refuse
 * lava per-direction / per-route-cell; this also refuses to rise towards any
 * lava it can see above, so a flood that touches a lava pocket stays a plain
 * block, never a bath. The swim target is the first passable cell above the
 * water (the breach); when solid rock roofs the flood there is nothing to
 * swim to and the caller carves sideways instead.
 * Returns "working" while swimming, "blocked" when it cannot help.
 */
function floodedClimb(bot, m, tick) {
    const p = floor(bot.sim.location);
    const head = add(p, UP);
    if (!bot.terrain.waterAt(p) && !bot.terrain.waterAt(head)) return "blocked";
    let breach;
    for (let y = p.y + 2; y <= p.y + 64; y++) {
        const q = { x: p.x, y, z: p.z };
        if (bot.terrain.lavaAt(q)) return "blocked";
        if (!bot.terrain.waterAt(q)) {
            if (!bot.terrain.solid(q)) breach = q;
            break;
        }
    }
    if (!breach) return "blocked";
    m.climbed = true;
    m.floodedClimbs = (m.floodedClimbs ?? 0) + 1;
    const r = bot.escaper.water(tick, center(breach));
    if (r !== "done") return "working";
    // Dry feet under a flooded ceiling: hop up into the flood; the escaper
    // takes over from the next tick.
    if (bot.terrain.waterAt(head)) { m.goTo(head, tick); return "working"; }
    return "blocked";
}

/**
 * Verify and rebuild ONE route cell before walking it (the blast/cave recovery
 * path). Returns:
 *   "arrived" - the bot stands in the cell (caller may pop it)
 *   "working" - dig/bridge/pillar/stair action started; ask again next tick
 *   "blocked" - this cell cannot be rebuilt into a step right now
 */
function ascendStep(bot, m, cell, tick, ideal) {
    const sim = bot.sim.location;
    const p = floor(sim);
    if (horizontal(sim, center(cell)) < 0.8 && Math.abs(sim.y - cell.y) < 1.4) return "arrived";
    const dy = cell.y - p.y;
    const col = horizontal(sim, center(cell));

    // Finish (or abandon) an in-flight staircase step that is not this route
    // cell before deciding anything else.
    if (m.moving && (m.moving.x !== cell.x || m.moving.y !== cell.y || m.moving.z !== cell.z)) {
        const s = m.settle(tick);
        if (s === "moving") return "working";
        m.moving = undefined;
        m.movingSince = 0;
        m.movingStart = undefined;
    }

    // --- rebuildRoute verification -----------------------------------
    if (bot.terrain.dangerous(cell) || bot.terrain.lavaAt(cell)) { m.blocked.set(key(cell), tick + 300); return "blocked"; }
    if (bot.terrain.liquid(cell)) {
        if (boundedBridge(m, cell, p, tick) === "working") return "working";
        if (floodedClimb(bot, m, tick) === "working") return "working";
        return "blocked";
    }
    const foot = add(cell, DOWN);
    const head = add(p, UP);
    const footIsHead = foot.x === head.x && foot.y === head.y && foot.z === head.z;
    if (bot.terrain.liquid(foot) && !footIsHead) {
        if (boundedBridge(m, foot, p, tick) === "working") return "working";
        if (floodedClimb(bot, m, tick) === "working") return "working";
        return "blocked";
    }
    if (!bot.terrain.solid(foot)) {
        // Floor blown out (creeper, gravel fall, cave breach): bridge it
        // before stepping, exactly like the descent did. Never bridge the
        // cell the head is in (a 2-high column climb puts the foot exactly
        // there) - that suffocates the bot, which breaks the block, and the
        // climb only re-places it. Climb instead; the staircase digs it.
        if (!footIsHead && boundedBridge(m, foot, p, tick) === "working") return "working";
        if (dy >= 1) {
            const u = climbUp(bot, m, tick, ideal ?? headingToward(bot, cell));
            return u === "blocked" ? "blocked" : "working";
        }
        return "blocked";
    }

    // Vertical progress cannot be walked: pillar in a straight column, carve a
    // staircase for anything steeper than one diagonal step.
    if (dy >= 1 && (col < 0.9 || dy >= 2)) {
        const u = climbUp(bot, m, tick, ideal ?? headingToward(bot, cell));
        return u === "blocked" ? "blocked" : "working";
    }

    // Buried route cell (refilled tunnel / blast debris): reopen it.
    if (bot.terrain.solid(cell) || bot.terrain.solid(add(cell, UP))) {
        const o = m.open([cell, add(cell, UP)], tick);
        if (o === "digging" || o === "open") return "working";
        return "blocked";
    }

    // Verified walk: same level, down-shaft remnant or one diagonal up-step.
    m.goTo(cell, tick);
    const w = m.settle(tick);
    if (w === "arrived") return "arrived";
    if (w === "moving") return "working";
    if (dy >= 1) {
        const u = climbUp(bot, m, tick, ideal ?? headingToward(bot, cell));
        return u === "blocked" ? "blocked" : "working";
    }
    return "blocked";
}

/**
 * Shared ascent for Miner and DeepMiner. The route is the concrete descent
 * path; every cell is re-verified before it is walked (rebuildRoute), the
 * climb itself is done with pillar/staircase primitives instead of A* (which
 * cannot climb a dug shaft), and the only honest surrender is "stalled" after
 * 900 ticks without gaining height.
 */
function routeAscend(bot, m, tick, tag) {
    if (!m.ascentStarted) {
        m.ascentStarted = true;
        m.ascendSince = tick;
        m.ascProgressAt = tick;
        m.ascHighY = floor(bot.sim.location).y;
        m.climbed = false;
    }
    m.ascending = true;
    if (m.dig) {
        if (bot.terrain.solid(m.dig.cell) && tick - m.dig.since < 240) return "working";
        m.dig = undefined;
    }
    if (m.breakTarget) {
        const tb = bot.terrain.block(m.breakTarget);
        if (tb && !tb.isAir && tick - m.breakingSince < 200) return "working";
        m.breakTarget = null;
    }
    const p = floor(bot.sim.location);
    const origin = m.site?.origin;

    // Progress clock: a climb from deep can take minutes, so the old fixed
    // 4000/5000-tick deadline (which stalled working climbs) is replaced by
    // "no net height gained for 900 ticks".
    if (p.y > (m.ascHighY ?? -999)) { m.ascHighY = p.y; m.ascProgressAt = tick; }

    // Trim route cells at or below the feet, and cells the bot stands in. A
    // cell ONE ABOVE is never popped here: the old |dy| < 1.4 test popped the
    // whole shaft column from the bottom - the fake "surface" that started the
    // endless walk-out loop.
    while (m.route.length) {
        const tail = m.route[m.route.length - 1];
        const h = horizontal(bot.sim.location, center(tail));
        const dy = bot.sim.location.y - tail.y;
        if (dy > -0.6 && (h < 1.6 || m.climbed)) m.route.pop();
        else break;
    }

    if (m.route.length <= 1) {
        if (!origin || (horizontal(bot.sim.location, center(origin)) < 2.0 && Math.abs(bot.sim.location.y - origin.y) < 2.0)) {
            m.reason = `Back on surface - ${tag}`;
            return "surface";                       // caller resets after its checks
        }
    }
    if (!m.route.length) {
        // Never hand an underground vertical to A*: keep climbing toward the
        // origin's column until its height is reached.
        if (origin && p.y < origin.y - 1) {
            const u = climbUp(bot, m, tick, headingToward(bot, origin) ?? m.dir);
            if (u === "blocked" && tick - m.ascProgressAt > 900) {
                m.wantsOut = false;
                m.reason = "Cannot retrace shaft - needs help - advanced";
                return "stalled";
            }
            m.reason = `Climbing towards surface origin Y=${origin.y}`;
            return "working";
        }
        m.reason = `Back on surface - ${tag}`;
        return "surface";
    }
    if (tick - m.ascProgressAt > 900) {
        m.wantsOut = false;
        m.reason = `Cannot retrace shaft (${m.stairWhy || "no climb"}) - needs help - advanced`;
        return "stalled";
    }
    const next = m.route[m.route.length - 1];
    const r = ascendStep(bot, m, next, tick, headingToward(bot, next));
    if (r === "arrived") {
        m.route.pop();
        m.ascProgressAt = tick;
        m.ascFail = 0;
    } else if (r === "blocked") {
        m.ascFail = (m.ascFail ?? 0) + 1;
        if (m.ascFail >= 3) {
            // This exact cell cannot be rebuilt into a step: climb past it.
            const u = climbUp(bot, m, tick, headingToward(bot, next) ?? headingToward(bot, origin));
            if (u !== "blocked") m.ascFail = 0;
        }
    }
    m.reason = `Climbing shaft (${m.route.length} left) - ${tag}`;
    return "working";
}
