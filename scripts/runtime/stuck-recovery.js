/**
 * Stuck recovery — turns the pure `StuckWatchdog` ladder into real actions.
 *
 * This is the answer to "no issues getting stuck": instead of failing a task
 * after a few retries (the old behaviour), the bot now classifies *why* it is
 * stuck (cage, lava, loop, no route, unloaded chunks, portal) and works through
 * replan -> dig/bridge/pillar -> relocate -> retreat -> safe pause, honestly
 * reporting when it has to stop.
 */
import { floor, add, UP, DOWN, COMPASS, horizontal, distance } from "../core/math.js";
import { StuckWatchdog } from "../core/anti-stuck.js";

const HEAD_PROBES = COMPASS;

export class StuckRecovery {
    constructor(bot) {
        this.bot = bot;
        this.watchdog = new StuckWatchdog();
        this.goal = undefined;
        this.lastGoalKey = "";
        this.lastAction = "";
        this.lastReason = "";
        this.result = "idle";
        this.lastObserve = 0;
        this.portalProbe = 0;
        this.portalNear = undefined;
    }

    reset(tick = 0) {
        this.watchdog.reset(tick);
        this.goal = undefined;
        this.lastGoalKey = "";
        this.lastAction = "";
        this.lastReason = "";
        this.result = "idle";
        this.portalNear = undefined;
    }

    noteFailure(reason, tick) {
        this.watchdog.failure(reason, tick);
    }

    noteSuccess() {
        this.watchdog.success();
    }

    /** Retarget the watchdog when the bot changes where it is going. */
    retarget(goal, tick) {
        if (!goal) return;
        const k = `${Math.floor(goal.x)},${Math.floor(goal.y)},${Math.floor(goal.z)}`;
        if (k === this.lastGoalKey) return;
        this.lastGoalKey = k;
        this.goal = { ...goal };
        this.watchdog.retarget(tick);
    }

    /** Build one observation from live state (cheap: cached terrain reads). */
    observe(tick) {
        const bot = this.bot;
        const pos = floor(bot.sim.location);
        const terrain = bot.terrain;
        const goal = bot.nav?.target ?? bot.goal ?? this.goal;
        this.retarget(goal, tick);
        const feet = terrain.read(pos);
        const head = terrain.read(add(pos, UP));
        const below = terrain.read(add(pos, DOWN));
        const typeOf = (c) => String(c?.type ?? "");
        const hazard = (c) => !!c && (c.hazard === true || /lava/.test(typeOf(c)) || /water/.test(typeOf(c)));
        let openNeighbors = 0;
        for (const d of HEAD_PROBES) {
            if (terrain.safe(add(pos, d))) openNeighbors++;
        }
        const hunger = bot.sim.getComponent("minecraft:player.hunger")?.currentValue ?? 20;
        // Portal probe is bounded and cached: only worth it near a dimension goal.
        if (bot.travel?.active && tick - this.portalProbe > 40) {
            this.portalProbe = tick;
            try {
                this.portalNear = bot.travel.portalWithin(12) ?? undefined;
            } catch {
                this.portalNear = undefined;
            }
        }
        const obs = {
            tick,
            pos,
            dimension: bot.sim.dimension?.id,
            targetDimension: bot.travel?.targetDimension,
            distance: goal ? horizontal(pos, goal) : undefined,
            hp: bot.sim.getComponent("minecraft:health")?.currentValue ?? 20,
            food: hunger,
            headInWater: !!bot.terrain.headInWater?.(bot.sim),
            inWater: !!bot.sim.isInWater,
            inLava: /lava/.test(typeOf(feet)),
            belowLava: /lava/.test(typeOf(below)) || !!below?.hazard,
            suffocating: !!head && head.passable === false,
            caged: openNeighbors === 0,
            openNeighbors,
            oscillating: false,
            noPath: this.bot.nav?.stuck === true || this.result === "failed",
            goalLoaded: goal ? terrain.read(goal) !== null : undefined,
            portalNear: !!this.portalNear,
            hasPickaxe: bot.bag.tool?.("pickaxe") >= 0,
            hasBlocks: (bot.builder?.countBlocks?.() ?? 0) > 0,
            hasFood: (bot.bag.food?.(false) ?? -1) >= 0,
            home: bot.memory?.summary?.().home,
            failStreak: this.watchdog.failStreak,
            ticksWithoutProgress: tick - this.watchdog.lastProgress,
        };
        this.lastObserve = tick;
        return this.watchdog.observe(obs);
    }

    /**
     * Main entry: called once per tick from Bot.think when navigation is
     * struggling. Returns true when a recovery action owned the tick.
     */
    tick(tick, force = false) {
        const situation = this.observe(tick);
        const urgent = situation.kind !== "none";
        if (!force && !urgent) {
            this.result = "idle";
            return false;
        }
        const decision = this.watchdog.decide(tick, situation, {
            hasPickaxe: this.bot.bag.tool?.("pickaxe") >= 0,
            hasBlocks: (this.bot.builder?.countBlocks?.() ?? 0) > 0,
            portalNear: !!this.portalNear,
            home: this.bot.memory?.summary?.().home,
            food: this.bot.sim.getComponent("minecraft:player.hunger")?.currentValue ?? 20,
            hasFood: (this.bot.bag.food?.(false) ?? -1) >= 0,
        });
        if (!decision) {
            this.result = "waiting";
            return false;
        }
        this.lastAction = decision.action;
        this.lastReason = `${situation.kind}: ${decision.why}`;
        this.bot.reason = `Stuck recovery (${decision.action}, level ${decision.level}): ${decision.why}`;
        const ok = this.execute(decision.action, tick);
        this.watchdog.noteResult(decision.action, ok, tick);
        this.result = ok ? "acting" : "failed";
        if (!ok && this.watchdog.exhausted) this.pause(tick);
        return ok;
    }

    /** Execute one recovery action. Returning true means it owns this tick. */
    execute(action, tick) {
        const bot = this.bot;
        try {
            switch (action) {
                case "replan":
                    bot.nav.reset();
                    bot.nav.stuck = false;
                    return true;
                case "replan_wide":
                    bot.nav.reset();
                    bot.nav.stuck = false;
                    bot.nav.forceWide = true;
                    bot.pathfinder?.invalidate?.();
                    bot.terrain.clear?.();
                    return true;
                case "jump":
                    if (bot.sim.isOnGround) bot.sim.jump();
                    return true;
                case "dig_forward":
                    return this.digForward(tick);
                case "dig_up":
                    return this.digUp(tick);
                case "pillar_up": {
                    const r = bot.builder?.pillar?.(tick);
                    return r === "placed" || r === "jumping";
                }
                case "bridge_forward":
                    return this.bridgeForward(tick);
                case "backtrack":
                    return this.backtrack(tick);
                case "change_area":
                    bot.nav.reset();
                    bot.pathfinder?.invalidate?.();
                    bot.reason = "Stuck: relocating to approach from another side";
                    return bot.scout?.step?.(tick) ?? true;
                case "surface":
                    return this.surface(tick);
                case "escape_lava":
                    return this.escapeLava(tick);
                case "escape_water":
                    bot.escaper?.step?.("water", tick);
                    return true;
                case "eat":
                    bot.eat?.(tick);
                    return true;
                case "use_portal":
                    if (this.portalNear) {
                        bot.travel?.enter?.(this.portalNear, tick);
                        return true;
                    }
                    return false;
                case "return_home": {
                    const home = bot.memory?.summary?.().home;
                    if (!home) return false;
                    bot.goal = { ...home };
                    bot.setMode?.("goto");
                    return bot.navTo?.(home, tick, 2) !== "failed";
                }
                case "wait":
                    bot.nav.stuck = false;
                    return true;
                case "pause":
                    this.pause(tick);
                    return true;
                default:
                    return false;
            }
        } catch (error) {
            bot.fault?.(error);
            return false;
        }
    }

    /** Break the cheapest soft block toward the current goal. */
    digForward(tick) {
        const bot = this.bot;
        const pos = floor(bot.sim.location);
        const goal = bot.nav?.target ?? this.goal;
        const dirs = goal ? [...COMPASS].sort((a, b) => distance(add(pos, a), goal) - distance(add(pos, b), goal)) : COMPASS;
        for (const d of dirs) {
            for (const y of [0, 1, -1]) {
                const cell = add(pos, { x: d.x, y: d.y + y, z: d.z });
                const c = bot.terrain.block(cell);
                if (!c || c.isAir || c.isLiquid) continue;
                if (!bot.pathfinder?.breakable?.(c.typeId)) continue;
                const r = bot.digCell(cell, tick);
                if (r === "digging" || r === "open") {
                    bot.reason = `Stuck: digging ${c.typeId.replace("minecraft:", "")} toward the goal`;
                    return true;
                }
            }
        }
        return false;
    }

    /** Dig the block overhead, then above it, to escape a sealed pocket. */
    digUp(tick) {
        const bot = this.bot;
        const pos = floor(bot.sim.location);
        for (const dy of [1, 2]) {
            const cell = add(pos, { x: 0, y: dy, z: 0 });
            const c = bot.terrain.block(cell);
            if (!c || c.isAir) {
                if (dy === 1 && bot.sim.isOnGround) bot.sim.jump();
                continue;
            }
            if (!bot.pathfinder?.breakable?.(c.typeId)) continue;
            const r = bot.digCell(cell, tick);
            if (r === "digging" || r === "open") return true;
        }
        // Nothing breakable above: pillar instead.
        return bot.builder?.pillar?.(tick) === "placed";
    }

    bridgeForward(tick) {
        const bot = this.bot;
        if (!bot.builder?.canBuild) return false;
        const pos = floor(bot.sim.location);
        const goal = bot.nav?.target ?? this.goal;
        const d = goal ? { x: Math.sign(goal.x - pos.x), y: 0, z: Math.sign(goal.z - pos.z) } : { x: 1, y: 0, z: 0 };
        if (d.x !== 0 && d.z !== 0) return bot.builder.bridgeDiagonal(d, tick) === "placed";
        return bot.builder.bridge(d, tick) === "placed";
    }

    backtrack(tick) {
        const bot = this.bot;
        const samples = this.watchdog.samples;
        for (let i = samples.length - 1; i >= 0; i--) {
            const p = samples[i].pos;
            if (p && bot.terrain.safe(p)) {
                bot.nav.reset();
                return bot.navTo(p, tick, 1) !== "failed";
            }
        }
        return false;
    }

    surface(tick) {
        const bot = this.bot;
        const pos = floor(bot.sim.location);
        for (let dy = 1; dy <= 4; dy++) {
            const cell = add(pos, { x: 0, y: dy, z: 0 });
            const c = bot.terrain.block(cell);
            if (!c || c.isAir) continue;
            if (!bot.pathfinder?.breakable?.(c.typeId)) continue;
            const r = bot.digCell(cell, tick);
            if (r === "digging" || r === "open") return true;
        }
        return bot.builder?.pillar?.(tick) === "placed";
    }

    /** Move to the nearest safe cell within six blocks, then replan. */
    escapeLava(tick) {
        const bot = this.bot;
        const pos = floor(bot.sim.location);
        let best;
        for (let dx = -6; dx <= 6; dx++) {
            for (let dz = -6; dz <= 6; dz++) {
                for (let dy = 0; dy <= 3; dy++) {
                    const q = { x: pos.x + dx, y: pos.y + dy, z: pos.z + dz };
                    if (!bot.terrain.safe(q)) continue;
                    const d = horizontal(q, pos);
                    if (!best || d < best.d) best = { q, d };
                }
            }
        }
        if (best && best.d > 0) {
            if (bot.sim.isOnGround) bot.sim.jump();
            bot.nav.reset();
            return bot.navTo(best.q, tick, 1) !== "failed";
        }
        return bot.builder?.pillar?.(tick) === "placed";
    }

    pause(tick) {
        const bot = this.bot;
        const reason = `No safe recovery left after ${this.watchdog.attempts} attempts (${this.lastAction || this.watchdog.lastKind}).`;
        bot.record?.(reason);
        bot.blockTask?.(reason, "retry");
        this.result = "paused";
        this.lastReason = reason;
        this.lastPause = tick;
    }

    report() {
        return { ...this.watchdog.report(), lastAction: this.lastAction, lastReason: this.lastReason, result: this.result };
    }
}
