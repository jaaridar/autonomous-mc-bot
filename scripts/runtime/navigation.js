import { floor, horizontal, distance, center, key, add } from "../core/math.js";
import { RANGED, EXPLOSIVE } from "../core/policy.js";
import { PathSearch } from "../core/navigation.js";

/**
 * Navigator: rolling-horizon A* with parkour, bridging, swimming and pillaring.
 *
 * Design rules (all of these are fixes for reported "gets stuck" behaviour):
 *  - The search is RESUMED across ticks instead of being rebuilt, so a 1200-node
 *    budget is spent on one route rather than restarting from the same cell.
 *  - Being in water is a normal state (swim to the closest shore), never an
 *    instant failure.
 *  - A failed/blocked route degrades through an escape ladder (replan with more
 *    effort -> tunnel toward the goal -> swim/shore -> give up honestly) instead
 *    of dropping control mid-task.
 *  - Progress is measured against the best distance ever reached for the current
 *    goal, so "circling" is detected even when the bot visits new cells each time.
 */
export class Navigator {
    constructor(sim, host, terrain, bot) {
        this.sim = sim;
        this.host = host;
        this.terrain = terrain;
        this.bot = bot;
        this.path = [];
        this.waypoint = 0;
        this.lastProgress = 0;
        this.retries = 0;
        this.lastIssued = -1;
        this.segmentStart = 0;
        this.corridor = [];
        this.endpoints = new Map();
        this.lastRetarget = 0;
        this.reason = "";
        this.parkour = true;
        this.fast = true;
        this.segments = 0;
        this.expansions = 0;
        this.urgent = false;
        this.avoid = [];
        this.lastGoal = undefined;
        this.stuck = false;
        this.trail = [];
        this.lastSample = 0;
        this.allowBridge = false;
        this.allowSprintJump = true;
        this.builder = undefined; // set by bot
        this.lastFreshCheck = -100;
        this.direct = undefined;      // { goal, since, issued, lastMove, best } short straight hop without A*
        this.noDirectUntil = 0;
        this.replans = 0;
        this.bestDistance = Infinity;
        this.tunnelPlan = undefined;
        this.ladderLevel = 0;
        this.segmentsSinceProgress = 0;
        this.stillSince = undefined;
        this.tick = 0;
    }

    reset() {
        try { this.sim.stopMoving(); } catch (e) { console.warn("[Verdant] " + String(e?.message || e).slice(0, 300)); }
        try { this.sim.isSprinting = false; } catch (e) { console.warn("[Verdant] " + String(e?.message || e).slice(0, 300)); }
        this.target = undefined;
        this.search = undefined;
        this.path = [];
        this.corridor = [];
        this.retries = 0;
        this.lastIssued = -1;
        this.stillSince = undefined;
        this.endpoints.clear();
        this.urgent = false;
        this.avoid = [];
        this.trail = [];
        this.direct = undefined;
        this.bestDistance = Infinity;
        this.tunnelPlan = undefined;
        this.ladderLevel = 0;
        this.segmentsSinceProgress = 0;
    }

    /**
     * Snapshot of the threats worth routing around, in the shape
     * `core/brain/danger.js` expects. Cached for a few ticks: the threat scan is
     * an entity query and a replan can happen several times a second.
     */
    dangerContext(tick) {
        const cache = (this._danger ??= { tick: -1000, ctx: null });
        if (tick - cache.tick < 10 && tick >= cache.tick) return cache.ctx;
        cache.tick = tick;
        let threats = [];
        let hp = 20;
        try {
            hp = this.sim.getComponent?.("minecraft:health")?.currentValue ?? 20;
            const info = this.bot?.terrain?.threatInfo?.(this.sim, this.bot?.owner?.());
            threats = (info?.list ?? [])
                .map((e) => ({
                    x: e.location.x, y: e.location.y, z: e.location.z,
                    ranged: RANGED.has(e.typeId),
                    explosive: EXPLOSIVE.has(e.typeId),
                    type: e.typeId,
                }))
                .slice(0, 8);
        } catch { threats = []; }
        cache.ctx = { threats, hp };
        return cache.ctx;
    }

    /** Keep the plan but stop the body (used when a special action takes over). */
    hold() {
        try { this.sim.stopMoving(); } catch { /* body may be gone */ }
    }

    replan(tick) {
        const allowBridge = this.allowBridge || this.builder?.canBuild;
        const allowPillar = allowBridge;
        const self = floor(this.sim.location);
        const goal = floor(this.target);
        const verticalDiff = Math.abs(self.y - goal.y);
        const horiz = horizontal(self, goal);
        // Rolling horizons: a long trip is walked as a chain of short partial
        // paths (PathSearch hands back its best partial route) so a 24-block
        // horizon reaches far goals at a fraction of the node cost. The tall
        // search is only for a real tower (goal almost straight up).
        const isTower = verticalDiff > 12 && horiz < 4;
        // `wide` is set by the blocked() ladder: after several genuine failures
        // the same 24-block horizon is guaranteed to fail again, so widen it
        // (and the node budget) instead of repeating the identical search.
        const wide = !!this.wide;
        const maxNodes = isTower ? 1500 : wide ? 2200 : 1200;
        const radius = isTower ? 48 : wide ? 48 : 24;
        this.replans++;
        this.wide = false;
        this.search = new PathSearch(
            this.terrain.read,
            self,
            goal,
            0.7,
            this.parkour,
            maxNodes,
            radius,
            horiz > 16,
            this.avoid,
            {
                allowBridge,
                allowPillar,
                allowSprintJump: this.allowSprintJump,
                // Swimming is how a player crosses water; the old navigator
                // failed outright ("need boat or swim") at the first water cell.
                allowSwim: true,
                // ONE risk model for the whole route: lava, deep drops, mobs and
                // darkness are priced together, so a combination nobody wrote a
                // rule for (ledge + lava + skeleton) is avoided as a whole.
                danger: this.dangerContext(tick),
                // Explicit adapter: `cellDanger` reads cells through `read(p)`.
                // Handing it the Terrain directly relied on the reader guessing
                // the shape, and a guess that lands on `block(x, y, z)` returns
                // air for every cell - the whole world then scores as a lethal
                // fall and no route exists anywhere (the bot cannot even leave
                // an open field). A one-line adapter removes the ambiguity.
                dangerWorld: this.bot?.terrain
                    ? { read: (p) => this.bot.terrain.read(p) }
                    : { read: (p) => this.terrain.read(p) },
            }
        );
        this.path = [];
        this.corridor = [];
        this.waypoint = 0;
        this.lastIssued = -1;
        this.tick = tick;
        this.lastProgress = tick;
        this.segmentStart = tick;
        this.lastPosition = { ...this.sim.location };
        this.hold();
    }

    fail(message) {
        this.lastGoal = this.target ? { ...this.target } : this.lastGoal;
        this.reason = message;
        this.stuck = true;
        this.reset();
        return "failed";
    }

    /**
     * Something stopped the route. Climb the escape ladder before reporting a
     * failure: a blocked path is usually a temporary build/tree/water situation,
     * not a reason to give up a mission.
     */
    blocked(message, tick) {
        this.retries++;
        this.ladderLevel = Math.min(4, this.retries);
        // Rung 1-2: replan. Cheap, and most blocks are temporary (a tree grew,
        // a mob pushed us, a chunk loaded).
        if (this.retries <= 2) {
            this.reason = `${message}; re-planning (${this.retries}/2)`;
            this.terrain.clear();
            this.search = undefined;
            this.path = [];
            this.waypoint = 0;
            this.lastIssued = -1;
            this.lastProgress = tick;
            this.segmentStart = tick;
            return "running";
        }
        // Rung 3: change the world. If the route is blocked by terrain, cut
        // through it instead of asking the same question again - this is the
        // rung that turns "cannot get there" into progress in caves, ravines
        // and under overhangs. Only when we are already underground or the goal
        // is close enough that a short tunnel is worthwhile.
        const goal = this.target ?? this.lastGoal;
        if (this.retries === 3 && goal && this.bot?.digCell) {
            const here = floor(this.sim.location);
            const dist = horizontal(here, floor(goal));
            const underground = here.y < 55 || !this.terrain.empty({ x: here.x, y: here.y + 3, z: here.z });
            if (dist <= 24 || underground) {
                this.reason = `${message}; tunnelling through`;
                if (this.tunnel(tick) === "running") return "running";
            }
        }
        // Rung 4: gain height / change vantage - a pillar or a wider horizon
        // finds the way round a wall that a 24-block search cannot see past.
        if (this.retries === 4 && this.builder?.pillar) {
            this.reason = `${message}; climbing for a wider view`;
            const r = this.builder.pillar(tick);
            if (r === "placed" || r === "jumping" || r === "waiting") return "running";
        }
        if (this.retries > 4) {
            this.reason = `${message}; searching wider`;
            this.terrain.clear();
            this.wide = true;
            this.search = undefined;
            this.path = [];
            this.waypoint = 0;
            this.lastIssued = -1;
            this.lastProgress = tick;
            this.segmentStart = tick;
            this.retries = 2;
            return "running";
        }
        if (this.inWaterState()) {
            // Water never dead-ends: head for the nearest shore.
            this.reason = "Water in the way; swimming to the closest shore";
            const shore = this.terrain.shoreNear(this.sim.location, 64);
            if (shore?.cell) {
                this.target = center(shore.cell);
                this.retries = 0;
                this.replan(tick);
                return "running";
            }
        }
        this.reason = message;
        this.stuck = true;
        this.reset();
        return "failed";
    }

    inWaterState() {
        try { return this.sim.isInWater === true; } catch { return false; }
    }

    detectLoop(tick) {
        if (!this.target) return false;
        if (tick - this.lastRetarget < 120) {
            this.trail = [];
            return false;
        }
        if (tick - this.lastSample < 10) return false;
        this.lastSample = tick;
        const p = this.sim.location;
        const here = key(floor(p));
        const d = horizontal(p, this.target);
        if (d < this.bestDistance - 0.75) {
            this.bestDistance = d;
            this.segmentsSinceProgress = 0;
        } else this.segmentsSinceProgress++;
        this.trail.push({ tick, x: p.x, z: p.z, d, k: here });
        while (this.trail.length && tick - this.trail[0].tick > 220) this.trail.shift();
        const first = this.trail[0];
        if (!first || tick - first.tick < 160) return false;
        const visits = this.trail.filter((s) => tick - s.tick <= 120 && s.k === here).length;
        if (visits >= 6) {
            this.trail = [];
            return true;
        }
        let travelled = 0;
        for (let i = 1; i < this.trail.length; i++)
            travelled += Math.hypot(this.trail[i].x - this.trail[i - 1].x, this.trail[i].z - this.trail[i - 1].z);
        if (travelled < 10) return false;
        const best = this.trail.reduce((m, s) => Math.min(m, s.d), Infinity);
        // Tolerance of 2.5 blocks: the old 1.5 flagged honest zig-zag detours
        // around a ravine as an infinite loop and aborted the mission.
        if (best <= first.d - 2.5 || this.segmentsSinceProgress < 6) {
            this.trail = this.trail.slice(-4);
            return false;
        }
        this.trail = [];
        return true;
    }

    /**
     * Straight-line walk for short, flat, clear hops. Returns undefined when
     * not applicable (caller falls back to A*), else "running"/"done".
     */
    tryDirect(goal, tick) {
        const loc = this.sim.location;
        const d = this.direct;
        const hd = horizontal(loc, goal);
        const dy = goal.y - loc.y;
        if (d) {
            if (hd < d.best - 0.2) { d.best = hd; d.lastMove = tick; }
            const stalled = tick - d.lastMove > 30 || tick - d.since > 160;
            if (stalled || hd >= 6.5 || Math.abs(dy) > 1.2) {
                this.direct = undefined;
                if (stalled) this.noDirectUntil = tick + 100; // snagged: let A* handle this spot for a while
                try { this.sim.stopMoving(); } catch { /* ignore */ }
                return undefined;
            }
            if (hd < 0.7 && Math.abs(dy) < 1.2) { this.reset(); return "done"; }
            if (distance(goal, d.goal) > 0.6 || tick - d.issued >= 20) {
                if (distance(goal, d.goal) > 0.6 && !this.straightClear(loc, goal)) { this.direct = undefined; return undefined; }
                d.goal = { ...goal };
                d.issued = tick;
                try { this.sim.moveToLocation(this.host.relative(goal), { speed: this.fast || this.urgent ? 1 : 0.65, faceTarget: true }); }
                catch { this.direct = undefined; return undefined; }
            }
            return "running";
        }
        if (this.search || tick < this.noDirectUntil || hd >= 6 || Math.abs(dy) > 0.6) return undefined;
        if (!this.straightClear(loc, goal)) return undefined;
        this.search = undefined;
        this.path = [];
        this.corridor = [];
        this.target = { ...goal };
        this.lastRetarget = tick;
        this.segmentStart = tick;
        this.lastProgress = tick;
        this.bestDistance = hd;
        this.direct = { goal: { ...goal }, since: tick, issued: tick, lastMove: tick, best: hd };
        try { this.sim.isSprinting = false; } catch { /* ignore */ }
        try { this.sim.moveToLocation(this.host.relative(goal), { speed: this.fast || this.urgent ? 1 : 0.65, faceTarget: true }); }
        catch { this.direct = undefined; return undefined; }
        return "running";
    }

    /** Every cell under a straight line from->to is standable at the same level (cached reads only). */
    straightClear(from, to) {
        const y = Math.floor(from.y + 0.01);
        const dx = to.x - from.x, dz = to.z - from.z;
        const len = Math.hypot(dx, dz);
        if (len < 1e-6) return true;
        // Sample the centre line and both edges of the 0.6-wide hitbox so a
        // diagonal hop cannot clip a block corner.
        const px = (-dz / len) * 0.3, pz = (dx / len) * 0.3;
        const steps = Math.max(1, Math.ceil(len * 2));
        const seen = new Set();
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            for (const side of [0, 1, -1]) {
                const x = Math.floor(from.x + dx * t + px * side), z = Math.floor(from.z + dz * t + pz * side);
                const k = x + "," + z;
                if (seen.has(k)) continue;
                seen.add(k);
                if (!this.terrain.safe({ x, y, z })) return false;
            }
        }
        return true;
    }

    /** Swim toward the closest shoreline while the goal is out of the water. */
    swimToShore(tick) {
        const shore = this.terrain.shoreNear(this.sim.location, 64);
        this.reason = "Swimming to shore";
        try {
            if (this.sim.isOnGround) this.sim.jump();
        } catch { /* ignore */ }
        if (shore?.cell) {
            const target = center(shore.cell);
            // Move on the water surface: aim slightly above the feet so the
            // vanilla swim controller keeps the head out of the water.
            const aim = { x: target.x, y: Math.max(target.y, this.sim.location.y + 0.2), z: target.z };
            try { this.sim.moveToLocation(this.host.relative(aim), { faceTarget: true, speed: 1 }); } catch { /* ignore */ }
            return "running";
        }
        // No shore found in range: keep paddling toward the goal (or home).
        const goal = this.target ?? this.lastGoal;
        if (goal) {
            try { this.sim.moveToLocation(this.host.relative({ x: goal.x, y: this.sim.location.y + 0.2, z: goal.z }), { faceTarget: true, speed: 1 }); } catch { /* ignore */ }
            this.reason = "Swimming toward the goal (no shore in range)";
            return "running";
        }
        return "failed";
    }

    /** Cut a safe tunnel one cell at a time toward the goal when no surface route exists. */
    tunnel(tick) {
        // No goal = no tunnel. `floor(undefined)` throws, and the caller's
        // try/catch used to swallow it mid-plan, leaving `tunnelPlan` pointing
        // at a direction that no longer related to anything -> the bot "tunnelled"
        // to arbitrary places (including straight up) while a goto was active.
        if (!this.target || !Number.isFinite(this.target.x) || !Number.isFinite(this.target.z)) {
            this.tunnelPlan = undefined;
            return this.fail("Tunnel needs a goal");
        }
        const p = floor(this.sim.location);
        const goal = floor(this.target);
        const plan = this.tunnelPlan;
        const stale = plan && (plan.goal && horizontal(plan.goal, goal) > 8);
        if (stale) this.tunnelPlan = undefined;
        if (!plan || stale || tick - plan.since > 600) {
            const dx = goal.x - p.x, dz = goal.z - p.z;
            // Prefer the dominant horizontal axis, and go up only when the goal
            // is clearly above (stair-casing), never straight down blindly.
            let dir;
            if (Math.abs(dx) >= Math.abs(dz) && dx !== 0) dir = { x: Math.sign(dx), y: 0, z: 0 };
            else if (dz !== 0) dir = { x: 0, y: 0, z: Math.sign(dz) };
            else if (goal.y > p.y) return this.fail("Tunnel end: goal is directly above");
            else return this.fail("Tunnel end: standing on the goal column");
            if (goal.y - p.y > 2) dir = { ...dir, y: 1 };
            else if (p.y - goal.y > 3) dir = { ...dir, y: -1 };
            this.tunnelPlan = { dir, since: tick, cells: [], goal: { ...goal } };
        }
        const dir = this.tunnelPlan.dir;
        const foot = { x: p.x + dir.x, y: p.y + (dir.y || 0), z: p.z + dir.z };
        const head = add(foot, { x: 0, y: 1, z: 0 });
        const cells = [foot, head].filter((c) => this.terrain.solid(c));
        if (!cells.length) {
            // Open: step into it.
            this.reason = "Tunnelling forward";
            try { this.sim.moveToLocation(this.host.relative(center(foot)), { faceTarget: true }); } catch { /* ignore */ }
            return "running";
        }
        const target = cells[0];
        if (this.terrain.lavaNear(target)) return this.fail("Refusing to tunnel beside lava");
        const dig = this.bot?.digCell ? this.bot.digCell(target, tick) : undefined;
        if (dig === "digging") {
            this.reason = "Tunnelling through obstructing block";
            return "running";
        }
        if (dig === "no-tool") return this.fail("No tool for the tunnel block");
        if (dig === "unreachable") {
            // Step closer first.
            try { this.sim.moveToLocation(this.host.relative(center(foot)), { faceTarget: true }); } catch { /* ignore */ }
            return "running";
        }
        return this.fail(this.bot?.lastDigReason || "Tunnel blocked");
    }

    go(goal, tick) {
        // Water is not a failure state: cross it by swimming, then resume.
        if (this.inWaterState() && horizontal(this.sim.location, goal) > 1.5) {
            if (this.swimToShore(tick) === "running") return "running";
            return this.blocked("No way out of the water", tick);
        }
        const startFloor = floor(this.sim.location);
        if (!this.terrain.safe(startFloor) && !this.terrain.safe({ x: startFloor.x, y: startFloor.y - 1, z: startFloor.z })) {
            // A start that is not "standable" is normal while falling, jumping
            // or swimming - keep walking instead of failing the mission.
            if (this.terrain.waterNear(startFloor)) return this.blocked("Start is in water", tick);
        }
        if (horizontal(this.sim.location, goal) < 0.7 && Math.abs(this.sim.location.y - goal.y) < 1.2) {
            this.reset();
            return "done";
        }
        // SHORT HOP: goal < 6 blocks away on the same level with a clear,
        // standable straight line - just walk there, no A* at all.
        const directResult = this.tryDirect(goal, tick);
        if (directResult) return directResult;
        // Retarget only when the goal really moved: a walking owner used to
        // trigger a full replan every 12 ticks. The threshold grows with the
        // remaining distance (owner moving 3 blocks barely matters at 40).
        const remaining = horizontal(this.sim.location, goal);
        const moveThreshold = Math.max(3, Math.min(8, remaining * 0.25));
        if (!this.target) {
            this.target = { ...goal };
            this.lastRetarget = tick;
            this.bestDistance = remaining;
            this.segmentsSinceProgress = 0;
            this.replan(tick);
        } else if (distance(goal, this.target) > moveThreshold && tick - this.lastRetarget >= 20) {
            this.target = { ...goal };
            this.lastRetarget = tick;
            this.retries = 0;
            this.endpoints.clear();
            this.trail = [];
            this.replan(tick);
        }
        if (tick - this.segmentStart > 700) {
            // One very long segment is a real problem, but the search may simply
            // be walking a long way: reset the segment clock and re-plan once
            // before giving up, so a 300-block trek does not trip this.
            if (this.ladderLevel >= 2) return this.blocked("Segment timeout; terrain blocked or unloaded.", tick);
            this.ladderLevel++;
            this.search = undefined;
            this.path = [];
            this.waypoint = 0;
            this.lastIssued = -1;
            this.segmentStart = tick;
            this.replan(tick);
            return "running";
        }

        if (this.search) {
            const before = this.search.expanded;
            const result = this.search.step(this.fast ? 120 : 50);
            this.expansions += this.search.expanded - before;
            if (result === "searching") return "running";
            if (result === "budget") {
                // Out of nodes is NOT "there is no route": the horizon was just
                // too small for this goal. Widen once (cheap, one replan) and
                // only then hand it to the blocked ladder. Treating it as a
                // hard failure is part of why long trips in caves gave up.
                if (!this.wide) {
                    this.wide = true;
                    this.search = undefined;
                    this.replan(tick);
                    this.reason = "Search horizon too small; widening once.";
                    return "running";
                }
                return this.blocked("Path search exhausted; still no route.", tick);
            }
            if (result !== "found" && result !== "partial") {
                return this.blocked(`Path ${result}; no safe route.`, tick);
            }
            this.path = this.search.path;
            this.search = undefined;
            this.segments++;
            if (!this.path.length) return this.blocked("No usable waypoint.", tick);
        }

        let w = this.path[this.waypoint];
        if (!w) {
            this.replan(tick);
            return "running";
        }

        if (horizontal(this.sim.location, center(w)) < 0.5 && Math.abs(this.sim.location.y - w.y) < 0.7) {
            this.waypoint++;
            this.lastProgress = tick;
            if (this.waypoint === this.path.length) {
                if (horizontal(this.sim.location, goal) < 0.9 && Math.abs(this.sim.location.y - goal.y) < 1.3) {
                    this.reset();
                    return "done";
                }
                const k = key(floor(this.sim.location)), n = (this.endpoints.get(k) ?? 0) + 1;
                this.endpoints.set(k, n);
                if (n > 2) return this.blocked("Repeated endpoint; no progress.", tick);
                if (this.endpoints.size > 128) this.endpoints.delete(this.endpoints.keys().next().value);
                this.target = { ...goal };
                this.retries = 0;
                this.replan(tick);
                return "running";
            }
            w = this.path[this.waypoint];
        }

        if (this.lastPosition && distance(this.sim.location, this.lastPosition) > 0.2) {
            this.lastProgress = tick;
            this.lastPosition = { ...this.sim.location };
            this.stillSince = undefined;
        } else if (this.stillSince === undefined) {
            this.stillSince = tick;
        }

        // Cheap progress check: if we are not getting closer, re-plan rather
        // than continuing a route the world has invalidated.
        let waypointSafe = true, corridorBad = false;
        if (tick - this.lastFreshCheck >= 4 || this.lastIssued !== this.waypoint) {
            this.lastFreshCheck = tick;
            waypointSafe = w.kind === "bridge" || this.terrain.freshSafe(w);
            corridorBad = this.corridor.some((p) => p.kind !== "bridge" && p !== w && !this.terrain.freshSafe(p));
        }
        if (tick - this.lastProgress > 60 || !waypointSafe || corridorBad) {
            this.terrain.clear();
            return this.blocked("Terrain changed under the route", tick);
        }

        if (this.detectLoop(tick)) return this.blocked("Circling without progress", tick);

        if (this.lastIssued !== this.waypoint) {
            this.issueWaypoint(w, tick);
        }
        return "running";
    }

    /**
     * How long the bot has been physically unable to move while a route is
     * active. The state machine uses this to hand control to the "unstuck"
     * owner: being *asked* to walk somewhere and not moving is different from
     * a route that simply takes a long time.
     */
    get noProgressTicks() {
        if (this.stillSince === undefined) return 0;
        return Math.max(0, (this.tick ?? 0) - this.stillSince);
    }

    /** Issue the movement for one waypoint (called once per waypoint). */
    issueWaypoint(w, tick) {
        // Smoothing: combine collinear walks
        const first = this.waypoint;
        const previous = first > 0 ? this.path[first - 1] : floor(this.sim.location);
        const alongX = previous.z === w.z && previous.x !== w.x;
        let end = this.waypoint;
        const limit = Math.min(this.path.length, end + 6);
        if (w.kind === "walk" || w.kind === "diagonal" || w.kind === "swim") {
            for (let j = end + 1; j < limit; j++) {
                const q = this.path[j];
                if (q.kind !== w.kind || q.y !== w.y || (alongX ? q.z !== w.z : q.x !== w.x) || !this.terrain.safe(q)) break;
                end = j;
            }
        }
        if (end > this.waypoint) {
            this.waypoint = end;
            w = this.path[end];
        }
        this.corridor = this.path.slice(first, end + 1);
        this.lastIssued = this.waypoint;

        const hunger = this.sim.getComponent("minecraft:player.hunger")?.currentValue ?? 20;
        const hp = this.sim.getComponent("minecraft:health")?.currentValue ?? 20;
        const canSprint = hunger > 6 && hp > 6;
        const sprint = canSprint && (this.urgent || (this.fast && horizontal(this.sim.location, w) > 1));

        // Special movement kinds first.
        if (w.kind === "bridge_sprintjump3" || w.kind === "bridge_bridge_sprintjump3") {
            this.placeAndJump(w, tick);
            return;
        }
        if (w.kind === "bridge") {
            this.bridgeStep(w, tick);
            return;
        }
        if (w.kind === "pillar") {
            if (this.builder && this.builder.canBuild) {
                const r = this.builder.pillar(tick);
                if (r === "placed" || r === "jumping") {
                    this.reason = "Pillaring up";
                    return;
                }
                if (r === "no-support" || r === "timeout") {
                    this.builder.resetPillar?.();
                    this.lastIssued = -1;
                }
            }
            this.reason = "Cannot pillar: no blocks or no support";
            return;
        }

        const jumping = w.kind === "step" || w.kind === "jump" || w.kind === "sprintjump" ||
            w.kind === "sprintjump3" || w.kind === "sprintjump_up" || w.kind === "jumpup";
        // Sprint for jumps: vanilla needs sprint velocity for 2-3 block gaps.
        try {
            this.sim.isSprinting = sprint || w.kind === "jump" || w.kind === "sprintjump" ||
                w.kind === "sprintjump3" || w.kind === "sprintjump_up";
        } catch { /* ignore */ }
        if (jumping) {
            if (!this.sim.isOnGround) {
                this.lastIssued = -1;
                return;
            }
            try { this.sim.jump(); } catch { /* ignore */ }
        }
        if (w.kind === "bigdrop") {
            try { this.sim.isSprinting = false; } catch { /* ignore */ }
        }
        try {
            this.sim.moveToLocation(this.host.relative(center(w)), {
                speed: this.fast || this.urgent ? 1 : 0.65,
                faceTarget: true,
            });
        } catch {
            this.lastIssued = -1;
            this.reason = "Move rejected by engine";
        }
    }

    /** Place an intermediate block, then sprint-jump the remaining gap. */
    placeAndJump(w, tick) {
        if (!this.builder || !this.builder.canBuild) {
            this.lastIssued = -1;
            this.reason = "Need blocks to bridge a large gap";
            return;
        }
        const placePos = w.placeAt;
        if (placePos && !this.terrain.solid(placePos)) {
            const belowPlace = add(placePos, { x: 0, y: -1, z: 0 });
            const support = this.builder.findSupportFor(placePos) || this.builder.findSupportFor(belowPlace);
            const anchor = support ? support.pos : belowPlace;
            const r = this.builder.placeAt(placePos, anchor, { sneak: true, autoAnchor: true, allowFalling: false });
            if (r === "placed" || r === "placed_support") {
                this.reason = `Large gap ${w.gap}: placed a block at ${placePos.x},${placePos.y},${placePos.z}`;
                this.lastIssued = -1;
                return;
            }
            if (r === "no-block") {
                this.lastIssued = -1;
                this.reason = "Need blocks for the large gap";
                return;
            }
        }
        if (this.terrain.solid(placePos) || this.terrain.safe(placePos)) {
            if (w.kind === "bridge_bridge_sprintjump3" && w.placeAt2) {
                const placePos2 = w.placeAt2;
                if (!this.terrain.solid(placePos2)) {
                    const below2 = add(placePos2, { x: 0, y: -1, z: 0 });
                    const support2 = this.builder.findSupportFor(placePos2) || this.builder.findSupportFor(below2);
                    const anchor2 = support2 ? support2.pos : below2;
                    const r2 = this.builder.placeAt(placePos2, anchor2, { sneak: true, autoAnchor: true });
                    if (r2 === "placed") {
                        this.reason = `Large gap ${w.gap}: placed the second block at ${placePos2.x},${placePos2.y},${placePos2.z}`;
                        this.lastIssued = -1;
                        return;
                    }
                }
            }
            try { this.sim.isSprinting = true; } catch { /* ignore */ }
            try { if (this.sim.isOnGround) this.sim.jump(); } catch { /* ignore */ }
            try {
                this.sim.moveToLocation(this.host.relative(center(w)), { speed: 1, faceTarget: true });
                this.reason = `Large gap ${w.gap}: sprint jump to ${w.x},${w.y},${w.z}`;
            } catch {
                this.lastIssued = -1;
            }
            return;
        }
        this.lastIssued = -1;
    }

    /** Place one block for a bridging waypoint. */
    bridgeStep(w, tick) {
        if (!this.builder || !this.builder.canBuild) {
            this.lastIssued = -1;
            this.reason = "Need blocks to bridge";
            return;
        }
        const p = floor(this.sim.location);
        const dir = { x: Math.sign(w.x - p.x), y: Math.sign(w.y - p.y), z: Math.sign(w.z - p.z) };
        let r;
        try {
            r = dir.x !== 0 && dir.z !== 0 ? this.builder.bridgeDiagonal(dir, tick) : this.builder.bridge(dir, tick);
        } catch {
            r = "rejected";
        }
        if (r === "placed" || r === "placed_support") {
            this.reason = `Bridging ${dir.x !== 0 && dir.z !== 0 ? "diagonal" : "horizontal"} gap`;
            return;
        }
        if (r === "solid") {
            // Already supported: walk the waypoint.
            try { this.sim.moveToLocation(this.host.relative(center(w)), { faceTarget: true }); } catch { /* ignore */ }
            return;
        }
        // Placement failed: drop the bridge plan and re-plan without bridging so
        // the search finds a land route instead of hammering one gap forever.
        this.allowBridge = false;
        this.lastIssued = -1;
        this.reason = `Bridge rejected (${r}); looking for a land route`;
        this.search = undefined;
        this.path = [];
        this.waypoint = 0;
    }
}
