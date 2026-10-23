/**
 * Pathfinder service — the engine-facing owner of the wide planner.
 *
 * `core/pathfinder.js` is pure and knows nothing about the bot. This class:
 *  - builds its options from live settings (parkour/bridge/dig, radius, budget),
 *  - turns nearby lava into bounded avoid-penalties (never into "safe" cells),
 *  - runs one-shot `plan()` calls for the navigator, and
 *  - runs long searches across ticks with `begin()` / `step()` so no single tick
 *    spends the whole watchdog budget inside A*.
 *
 * Results carry `status` (`found` | `partial` | `budget` | `unreachable` |
 * `failed` | `timeout`), `path` (waypoints, excluding the start), `expanded`,
 * `cost`, `strategy` (`astar` | `bidirectional`) and `reason`. Nothing is
 * invented: a `partial` path is explicitly partial, and callers must not treat
 * it as a route to the goal.
 */
import { system } from "@minecraft/server";
import { PathFinder, planPath } from "../core/pathfinder.js";
import { floor, key } from "../core/math.js";

const CACHE_TTL = 60;
const CACHE_CAP = 24;
const AVOID_TTL = 120;
const AVOID_RADIUS = 8;
const AVOID_BUDGET = 220;
const MAX_JOB_TICKS = 400;

/** Blocks the planner may tunnel through; everything else is a wall. */
const BREAKABLE = /^(minecraft:)?(dirt|grass_block|podzol|mycelium|sand|red_sand|gravel|clay|snow|soul_sand|soul_soil|moss_block|mud|farmland|tuff|calcite|basalt|blackstone|netherrack|crimson_nylium|warped_nylium|stone|deepslate|andesite|diorite|granite|nether_bricks|nether_brick|_planks|_log|_wood|_stem|_hyphae|_leaves)$/;

export function breakableType(typeId) {
    const id = String(typeId ?? "").replace("minecraft:", "");
    if (!id) return false;
    if (/(obsidian|bedrock|barrier|command_block|structure|jigsaw|end_portal|end_gateway|nether_portal|water|lava|chest|shulker|spawner|reinforced_deepslate)/.test(id)) return false;
    return BREAKABLE.test(id);
}

export class PathfinderService {
    constructor(bot) {
        this.bot = bot;
        this.cache = new Map();
        this.pending = undefined;
        this.avoid = { tick: -AVOID_TTL, list: [] };
        this.last = undefined;
        this.stats = { plans: 0, found: 0, partial: 0, failed: 0, cached: 0, expanded: 0 };
    }

    clear() {
        this.cache.clear();
        this.pending = undefined;
        this.last = undefined;
    }

    /** World changed under us (mining/placing, dimension change). */
    invalidate() {
        this.cache.clear();
    }

    /** Full reset after a dimension change: caches, job and avoid points. */
    reset() {
        this.clear();
        this.avoid = { tick: -AVOID_TTL, list: [] };
    }

    get read() {
        return this.bot.terrain.read;
    }

    get now() {
        const t = system.currentTick;
        return typeof t === "number" ? t : (this.bot.terrain?.tick ?? 0);
    }

    /**
     * Cells to steer around. The planner never *needs* these to avoid lava (the
     * safety check already refuses it); they make a route prefer the dry side of
     * a lava lake instead of hugging its edge, where one fall would be fatal.
     */
    avoidList(tick) {
        if (tick - this.avoid.tick < AVOID_TTL) return this.avoid.list;
        const list = [];
        try {
            const spots = this.bot.terrain.scanOres(this.bot.sim.location, AVOID_RADIUS, (type) => /lava/.test(String(type)), AVOID_BUDGET) ?? [];
            for (const p of spots.slice(0, 24)) list.push({ x: p.x, y: p.y, z: p.z, radius: 3, weight: 40 });
        } catch {
            /* no scanner: no avoid list */
        }
        this.avoid = { tick, list };
        return list;
    }

    options(overrides = {}, tick = this.now) {
        const s = this.bot.settings ?? {};
        const here = floor(this.bot.sim.location);
        // An override of `undefined` means "caller has no opinion"; dropping it
        // keeps the settings-derived value instead of resetting to the default.
        const extra = {};
        for (const [k, v] of Object.entries(overrides ?? {})) if (v !== undefined) extra[k] = v;
        return {
            maxNodes: s.pathNodes ?? 6000,
            radius: s.pathRadius ?? 64,
            vertLimit: 24,
            maxDrop: 3,
            diagonal: true,
            parkour: s.parkour !== false,
            allowDig: s.pathDig !== false,
            allowBridge: s.pathBridge !== false && s.bridge !== false,
            allowPillar: true,
            allowYAxisFlood: false,
            bidirectional: true,
            bidirMinDistance: 24,
            breakable: breakableType,
            avoid: this.avoidList(tick),
            origin: here,
            smooth: true,
            ...extra,
        };
    }

    keyOf(from, to) {
        return `${key(from)}>${key(to)}`;
    }

    /** Public capability check used by the miner/builder/anti-stuck code. */
    breakable(typeId) {
        return breakableType(typeId);
    }

    /**
     * Is this result something the navigator may execute? Accepts a result
     * object or a bare path. A cached route is only reused while its first few
     * waypoints still hold real floor and open feet/head space.
     */
    usable(result, from, to) {
        const path = Array.isArray(result) ? result : result?.path;
        if (!Array.isArray(path) || !path.length) return false;
        if (!Array.isArray(result) && result?.status && result.status !== "found" && result.status !== "partial") return false;
        for (const p of path.slice(0, 4)) {
            const c = this.bot.terrain.read(p);
            if (!c || !c.passable || c.hazard) return false;
            const below = this.bot.terrain.read({ x: p.x, y: p.y - 1, z: p.z });
            if (!below || !below.support) return false;
        }
        return true;
    }

    /** One-shot plan. Returns the planner result; never throws. */
    plan(from, to, overrides = {}) {
        const start = floor(from);
        const goal = floor(to);
        const k = this.keyOf(start, goal);
        const hit = this.cache.get(k);
        if (hit && this.now - hit.tick < CACHE_TTL && this.usable(hit.result)) {
            this.stats.cached++;
            return hit.result;
        }
        this.stats.plans++;
        let result;
        try {
            result = planPath(this.read, start, goal, this.options(overrides));
        } catch (error) {
            result = { status: "failed", path: [], expanded: 0, cost: Infinity, reason: String(error?.message ?? error), partial: false, strategy: "error" };
        }
        if (result.status === "found") this.stats.found++;
        else if (result.status === "partial") this.stats.partial++;
        else this.stats.failed++;
        this.stats.expanded += result.expanded ?? 0;
        this.last = { ...result, from: start, to: goal, at: this.now };
        if (result.path?.length) {
            this.cache.set(k, { tick: this.now, result });
            if (this.cache.size > CACHE_CAP) this.cache.delete(this.cache.keys().next().value);
        }
        return result;
    }

    /**
     * Start a sliced search. `step()` must be called until it returns a final
     * status; only one job is kept, because two wide searches in one tick is
     * already more than a server tick should pay for.
     */
    begin(from, to, overrides = {}) {
        const start = floor(from);
        const goal = floor(to);
        const opts = this.options(overrides);
        this.pending = {
            from: start,
            to: goal,
            started: this.now,
            finder: new PathFinder(this.read, start, goal, opts),
        };
        this.stats.plans++;
        return this.pending;
    }

    get busy() {
        return !!this.pending;
    }

    step(tick = this.now, budget = 128) {
        const job = this.pending;
        if (!job) return undefined;
        if (tick - job.started > MAX_JOB_TICKS) {
            this.pending = undefined;
            this.stats.failed++;
            return { status: "timeout", path: [], expanded: 0, cost: Infinity, reason: "job-timeout", partial: false, strategy: "astar" };
        }
        const status = job.finder.step(budget);
        if (status === "searching") return { status, path: [], expanded: job.finder.expanded, cost: Infinity, reason: "", partial: false };
        this.pending = undefined;
        const result = job.finder.result;
        if (result.status === "found") this.stats.found++;
        else if (result.status === "partial") this.stats.partial++;
        else this.stats.failed++;
        this.stats.expanded += result.expanded ?? 0;
        this.last = { ...result, from: job.from, to: job.to, at: tick };
        if (result.path?.length) {
            const k = this.keyOf(job.from, job.to);
            this.cache.set(k, { tick, result });
            if (this.cache.size > CACHE_CAP) this.cache.delete(this.cache.keys().next().value);
        }
        return result;
    }

    /** Last result, for `!bot path` and the anti-stuck ladder. */
    report() {
        const rate = this.stats.plans ? Math.round((this.stats.found / this.stats.plans) * 100) : 0;
        return {
            ...this.stats,
            foundRate: `${rate}%`,
            cache: this.cache.size,
            pending: !!this.pending,
            last: this.last ? {
                status: this.last.status,
                strategy: this.last.strategy,
                expanded: this.last.expanded,
                length: this.last.path?.length ?? 0,
                reason: this.last.reason,
            } : undefined,
        };
    }
}
