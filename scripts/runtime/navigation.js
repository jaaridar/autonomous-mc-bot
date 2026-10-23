import { floor, horizontal, distance, center, key, add, CARDINAL } from "../core/math.js";
import { PathSearch } from "../core/navigation.js";
import { BidirectionalPathSearch, chooseSearchMode, unstuckAction } from "../core/pathfinder.js";

/**
 * Advanced Navigator: rolling-horizon A* with parkour, bridging, pillaring awareness.
 * Handles:
 * - Normal walk
 * - 1-block gap jumps, 2-block sprint jumps, jump-up
 * - Drops, bridging, pillaring
 * - Loop detection, stall detection
 * - Threat avoidance
 * - Fast path smoothing
 */
export class Navigator {
    constructor(sim, host, terrain) {
        this.sim = sim;
        this.host = host;
        this.terrain = terrain;
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
        this.ignore = [];             // exhausted cells (absolute {x,y,z}) skipped on the next search
        this.dimension = "overworld";
        this.swimSince = undefined;
        this.unsafeSince = undefined;
        this.didUnstuck = false;
    }

    reset() {
        try { this.sim.stopMoving(); } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }
        try { this.sim.isSprinting = false; } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }
        this.target = undefined;
        this.search = undefined;
        this.path = [];
        this.corridor = [];
        this.retries = 0;
        this.lastIssued = -1;
        this.endpoints.clear();
        this.urgent = false;
        this.avoid = [];
        this.trail = [];
        this.direct = undefined;
        this.swimSince = undefined;
        this.unsafeSince = undefined;
        this.didUnstuck = false;
        // keep this.ignore — the next attempt at the same goal should skip the cell we died on
    }

    replan(tick) {
        const allowBridge = this.allowBridge || this.builder?.canBuild;
        const allowPillar = allowBridge; // For 100 block tower, allow pillar but throttled to avoid lag
        const verticalDiff = Math.abs(floor(this.sim.location).y - floor(this.target).y);
        const horiz = horizontal(this.sim.location, this.target);
        // ULTRA LAG CUT: small rolling-horizon searches. Long trips are walked
        // as a chain of short partial paths (PathSearch returns its best
        // partial route when the budget runs out), so a 24-block horizon still
        // reaches far goals while costing ~1/3 of the old 2000-3000 nodes.
        // The tall search is only for a real tower (goal almost straight up).
        const isTower = verticalDiff > 12 && horiz < 4;
        const maxNodes = isTower ? 1500 : 1200;
        const radius = isTower ? 48 : 24;
        this.replans++;
        let dim = this.dimension;
        try { dim = this.sim.dimension?.id ?? dim; } catch { /* offline tests */ }
        this.dimension = dim;
        const mode = chooseSearchMode({ horiz, vert: verticalDiff, radius, isTower });
        const Search = mode === "bidirectional" ? BidirectionalPathSearch : PathSearch;
        this.search = new Search(
            this.terrain.read,
            floor(this.sim.location),
            floor(this.target),
            0.7,
            this.parkour,
            maxNodes,
            radius,
            horiz > 16,
            this.avoid,
            {
                allowBridge, allowPillar, allowSprintJump: this.allowSprintJump,
                ignore: this.ignore, strictSafety: true, dimension: dim,
            }
        );
        this.path = [];
        this.corridor = [];
        this.waypoint = 0;
        this.lastIssued = -1;
        this.lastProgress = tick;
        this.segmentStart = tick;
        this.lastPosition = { ...this.sim.location };
        try { this.sim.stopMoving(); } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }
    }

    fail(message) {
        this.lastGoal = this.target ? { ...this.target } : this.lastGoal;
        try {
            const here = floor(this.sim.location);
            this.ignore.push(here);
            if (this.ignore.length > 32) this.ignore.shift();
        } catch { /* ignore */ }
        this.reason = message;
        this.stuck = true;
        this.reset();
        return "failed";
    }

    unstuck(tick) {
        const p = floor(this.sim.location);
        const inWater = !!this.sim.isInWater;
        const onGround = this.sim.isOnGround !== false;
        const safeStart = this.terrain.safe(p);
        let frontSolid = false;
        try {
            const yaw = this.sim.getRotation?.()?.y ?? 0;
            const rad = yaw * Math.PI / 180;
            const fwd = { x: Math.round(-Math.sin(rad)), y: 0, z: Math.round(Math.cos(rad)) };
            const front = add(p, fwd.x || fwd.z ? fwd : CARDINAL[0]);
            const b = this.terrain.block(front);
            frontSolid = !!(b && !b.isAir && !b.isLiquid);
        } catch { /* ignore */ }
        const verb = unstuckAction({
            inWater, onGround, safeStart, retries: this.retries,
            oscillating: false,
            hasBlocks: !!this.builder?.canBuild,
            frontSolid,
        });
        this.reason = `Unstuck: ${verb}`;
        if (verb === "swim_shore") return this.swimToward(this.target ?? this.lastGoal ?? p, tick);
        if (verb === "wait_land") return "running";
        if (verb === "pillar" && this.builder?.canBuild) {
            try { this.builder.pillar(tick); } catch { /* ignore */ }
            return "running";
        }
        if (verb === "sidestep" || verb === "jump_replan" || verb === "ignore_cell_replan") {
            try { if (onGround) this.sim.jump(); } catch { /* ignore */ }
            for (const d of CARDINAL) {
                const q = add(p, d);
                if (this.terrain.safe(q)) {
                    try { this.sim.moveToLocation(this.host.relative(center(q)), { speed: 1, faceTarget: true }); } catch { /* ignore */ }
                    break;
                }
            }
        }
        return "running";
    }

    /**
     * In water the A* start cell is "unsafe" (water is a hazard), so we must
     * not fail the search. Swim toward the nearest standable shore, preferring
     * the side that still approaches the goal.
     */
    swimToward(goal, tick) {
        const p = floor(this.sim.location);
        this.swimSince = this.swimSince ?? tick;
        let best = null, bestScore = Infinity;
        for (let dx = -8; dx <= 8; dx++) {
            for (let dz = -8; dz <= 8; dz++) {
                for (let dy = -2; dy <= 3; dy++) {
                    const q = { x: p.x + dx, y: p.y + dy, z: p.z + dz };
                    if (!this.terrain.safe(q)) continue;
                    const score = horizontal(q, goal) + horizontal(q, p) * 0.3;
                    if (score < bestScore) { bestScore = score; best = q; }
                }
            }
        }
        try { this.sim.jump(); } catch { /* ignore */ }
        const dest = best ? center(best) : goal;
        try {
            this.sim.moveToLocation(this.host.relative(dest), { speed: 1, faceTarget: true });
        } catch { /* ignore */ }
        this.reason = best
            ? `Swimming to shore at ${best.x},${best.y},${best.z} then pathing`
            : "Swimming toward goal — no shore in range";
        if (tick - this.swimSince > 240) return this.fail("Could not leave water");
        return "running";
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
        this.trail.push({ tick, x: p.x, z: p.z, d: horizontal(p, this.target), k: here });
        while (this.trail.length && tick - this.trail[0].tick > 220) this.trail.shift();
        const first = this.trail[0];
        if (!first || tick - first.tick < 160) return false;
        const visits = this.trail.filter((s) => tick - s.tick <= 120 && s.k === here).length;
        if (visits >= 5) {
            this.trail = [];
            return true;
        }
        let travelled = 0;
        for (let i = 1; i < this.trail.length; i++)
            travelled += Math.hypot(this.trail[i].x - this.trail[i - 1].x, this.trail[i].z - this.trail[i - 1].z);
        if (travelled < 8) return false;
        const best = this.trail.reduce((m, s) => Math.min(m, s.d), Infinity);
        if (best <= first.d - 1.5) {
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
            // Bail out to A* when the hop stalls or the goal drifted away.
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

    go(goal, tick) {
        if (this.sim.isInWater) {
            return this.swimToward(goal, tick);
        }
        this.swimSince = undefined;
        const startFloor = floor(this.sim.location);
        const startSafe = this.terrain.safe(startFloor) || this.terrain.safe({ x: startFloor.x, y: startFloor.y - 1, z: startFloor.z });
        if (!startSafe) {
            if (this.terrain.waterNear(startFloor)) return this.swimToward(goal, tick);
            this.unsafeSince = this.unsafeSince ?? tick;
            if (!this.sim.isOnGround) {
                this.reason = "Falling; waiting to land before pathing";
                return "running";
            }
            this.unstuck(tick);
            if (tick - this.unsafeSince > 80) return this.fail("Start still unsafe after unstuck");
            return "running";
        }
        this.unsafeSince = undefined;
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
            if (!this.lastGoal || distance(goal, this.lastGoal) > 8) this.ignore = [];
            this.target = { ...goal };
            this.lastRetarget = tick;
            this.replan(tick);
        } else if (distance(goal, this.target) > moveThreshold && tick - this.lastRetarget >= 20) {
            this.target = { ...goal };
            this.lastRetarget = tick;
            this.retries = 0;
            this.endpoints.clear();
            this.trail = [];
            this.ignore = [];
            this.replan(tick);
        }
        if (tick - this.segmentStart > 700) return this.fail("Segment timeout; terrain blocked or unloaded.");

        if (this.search) {
            const before = this.search.expanded;
            const result = this.search.step(this.fast ? 120 : 50);
            this.expansions += this.search.expanded - before;
            if (result === "searching") return "running";
            if (result !== "found" && result !== "partial") return this.fail(`Path ${result}; no safe route.`);
            this.path = this.search.path;
            this.search = undefined;
            this.segments++;
            if (!this.path.length) return this.fail("No usable waypoint.");
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
                if (n > 2) return this.fail("Repeated endpoint; no progress.");
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
        }

        // Check if waypoint still safe, or if we need bridge - entire body must be able to go.
        // freshSafe() drops the cache and re-reads 3 cells natively, and it ran
        // for the waypoint + every corridor cell on every tick. Every 4 ticks
        // (or on a new waypoint) is plenty at walking speed.
        let waypointSafe = true, corridorBad = false;
        if (tick - this.lastFreshCheck >= 4 || this.lastIssued !== this.waypoint) {
            this.lastFreshCheck = tick;
            waypointSafe = w.kind === "bridge" || this.terrain.freshSafe(w);
            corridorBad = this.corridor.some((p) => p.kind !== "bridge" && p !== w && !this.terrain.freshSafe(p));
        }
        if (tick - this.lastProgress > 50 || !waypointSafe || corridorBad) {
            // Try to find obstruction that blocks entire body
            if (!waypointSafe && w) {
                try {
                    // Check feet and head at waypoint - entire body collision
                    const blocksToCheck = [w, { x: w.x, y: w.y + 1, z: w.z }, { x: w.x, y: w.y - 1, z: w.z }];
                    for (const pos of blocksToCheck) {
                        const b = this.terrain.block(pos);
                        if (b && !b.isAir) {
                            // Found obstruction blocking entire body path
                            const isObsidian = b.typeId === "minecraft:obsidian" || b.typeId === "minecraft:crying_obsidian";
                            if (!isObsidian) {
                                // Signal obstruction for workaround-then-break logic in bot.js navTo
                                return this.fail(`Obstruction ${b.typeId} at ${pos.x},${pos.y},${pos.z} blocks entire body path; needs workaround or break`);
                            }
                        }
                    }
                } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }
            }
            this.unstuck(tick);
            if (++this.retries > 6) return this.fail("Stuck or terrain changed after retries.");
            this.terrain.clear();
            this.replan(tick);
            return "running";
        }

        if (this.detectLoop(tick)) {
            this.unstuck(tick);
            try { this.ignore.push(floor(this.sim.location)); } catch { /* ignore */ }
            if (++this.retries > 6) return this.fail("Circling without progress; treating as blocking.");
            this.terrain.clear();
            this.replan(tick);
            return "running";
        }

        if (this.lastIssued !== this.waypoint) {
            // Smoothing: combine collinear walks
            const first = this.waypoint;
            const previous = first > 0 ? this.path[first - 1] : floor(this.sim.location);
            const alongX = previous.z === w.z && previous.x !== w.x;
            let end = this.waypoint;
            const limit = Math.min(this.path.length, end + 6);
            if (w.kind === "walk") {
                for (let j = end + 1; j < limit; j++) {
                    const q = this.path[j];
                    if (q.kind !== "walk" || q.y !== w.y || (alongX ? q.z !== w.z : q.x !== w.x) || !this.terrain.safe(q)) break;
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
            const sprint = canSprint && (this.urgent || (this.fast && w.kind === "walk" && horizontal(this.sim.location, w) > 1));

            // Handle special kinds - world-class arbitrary bridging + place+3jump for >3 blocks
            // ADVANCED: >3 block gap - place block then 3-jump
            if (w.kind === "bridge_sprintjump3" || w.kind === "bridge_bridge_sprintjump3") {
                if (this.builder && this.builder.canBuild) {
                    const p = floor(this.sim.location);
                    // Place intermediate block(s) first
                    const placePos = w.placeAt;
                    if (placePos) {
                        const belowPlace = add(placePos, { x: 0, y: -1, z: 0 });
                        const belowBlock = this.terrain.block(belowPlace);
                        // Try to place at placePos if not already solid
                        if (!this.terrain.solid(placePos)) {
                            const support = this.builder.findSupportFor(placePos) || this.builder.findSupportFor(belowPlace);
                            const anchor = support ? support.pos : belowPlace;
                            // For water gaps, allow placement
                            const r = this.builder.placeAt(placePos, anchor, { sneak: true, autoAnchor: true, allowFalling: false });
                            if (r === "placed" || r === "placed_support") {
                                this.reason = `Large gap ${w.gap} blocks: placed intermediate block at ${placePos.x},${placePos.y},${placePos.z} then will do 3-block jump - advanced`;
                                return "running";
                            }
                            // If place failed, try alternative
                            if (r === "no-block") {
                                return this.fail("Need blocks to place for large gap 3-jump - will mine nearby");
                            }
                        }
                        // If intermediate block placed or already exists, do 3-block sprint jump to landing
                        if (this.terrain.solid(placePos) || this.terrain.safe(placePos)) {
                            // For double bridge case, place second block too
                            if (w.kind === "bridge_bridge_sprintjump3" && w.placeAt2) {
                                const placePos2 = w.placeAt2;
                                if (!this.terrain.solid(placePos2)) {
                                    const below2 = add(placePos2, { x: 0, y: -1, z: 0 });
                                    const support2 = this.builder.findSupportFor(placePos2) || this.builder.findSupportFor(below2);
                                    const anchor2 = support2 ? support2.pos : below2;
                                    const r2 = this.builder.placeAt(placePos2, anchor2, { sneak: true, autoAnchor: true });
                                    if (r2 === "placed") {
                                        this.reason = `Large gap ${w.gap}: placed second intermediate block at ${placePos2.x},${placePos2.y},${placePos2.z} - advanced`;
                                        return "running";
                                    }
                                }
                            }
                            // Now do 3-block sprint jump to final landing
                            this.sim.isSprinting = true;
                            if (this.sim.isOnGround) this.sim.jump();
                            try {
                                this.sim.moveToLocation(this.host.relative(center(w)), { speed: 1, faceTarget: true });
                                this.reason = `Large gap ${w.gap}: placed block then 3-block sprint jump to ${w.x},${w.y},${w.z} - advanced movement`;
                            } catch {
                                return this.fail("3-block jump after place failed");
                            }
                            return "running";
                        }
                    }
                } else {
                    return this.fail("Need blocks for large gap place+3jump");
                }
            }

            if (w.kind === "bridge") {
                // Need to bridge - horizontal, diagonal, arbitrary
                if (this.builder && this.builder.canBuild) {
                    const p = floor(this.sim.location);
                    // Arbitrary direction: can be diagonal
                    const dir = { x: Math.sign(w.x - p.x), y: Math.sign(w.y - p.y), z: Math.sign(w.z - p.z) };
                    let r;
                    if (dir.x !== 0 && dir.z !== 0) {
                        // Diagonal bridging
                        r = this.builder.bridgeDiagonal(dir, tick);
                    } else {
                        r = this.builder.bridge(dir, tick);
                    }
                    if (r === "placed" || r === "placed_support") {
                        this.reason = `Bridging ${dir.x !== 0 && dir.z !== 0 ? "diagonal" : "horizontal"} gap`;
                        return "running";
                    } else if (r === "solid") {
                        // Already solid, continue
                    } else if (r === "no-support" || r === "hazard_lava") {
                        // Try alternative support
                        const altSupport = this.builder.findSupportFor(add(p, dir));
                        if (altSupport) {
                            const r2 = this.builder.placeAt(add(p, dir), altSupport.pos, { sneak: true, autoAnchor: true });
                            if (r2 === "placed") return "running";
                        }
                        this.allowBridge = false;
                        this.replan(tick);
                        return "running";
                    } else {
                        // Can't bridge, replan
                        this.replan(tick);
                        return "running";
                    }
                } else {
                    // UNBREAKABLE: Gap requires bridging but no blocks - don't fail permanently, try to mine blocks or find workaround
                    // Signal need blocks but allow retry - bot will mine dirt/cobble/logs nearby
                    this.retries++;
                    if (this.retries <= 2) {
                        this.terrain.clear();
                        this.replan(tick);
                        return "running";
                    }
                    // After retries, fail with specific reason that bot's recover can handle by mining blocks
                    return this.fail("Gap requires bridging but no blocks - need dirt/cobble - will mine nearby blocks");
                }
            }

            // Pillar handling
            if (w.kind === "pillar") {
                if (this.builder && this.builder.canBuild) {
                    const r = this.builder.pillar(tick);
                    if (r === "placed" || r === "jumping") {
                        this.reason = "Pillaring up";
                        return "running";
                    }
                }
            }

            // Advanced 3-block sprinting jumps - always sprint for these
            this.sim.isSprinting = sprint || w.kind === "jump" || w.kind === "sprintjump" || w.kind === "sprintjump3" || w.kind === "sprintjump_up";

            if (w.kind === "step" || w.kind === "jump" || w.kind === "sprintjump" || w.kind === "sprintjump3" || w.kind === "sprintjump_up" || w.kind === "jumpup") {
                if (!this.sim.isOnGround) {
                    this.lastIssued = -1;
                    return "running";
                }
                this.sim.jump();
            }

            if (w.kind === "bigdrop") {
                // For big drops, don't sprint
                this.sim.isSprinting = false;
            }
            // For 3-block jumps, ensure extra sprint speed
            if (w.kind === "sprintjump3" || w.kind === "sprintjump_up") {
                this.sim.isSprinting = true;
            }

            try {
                this.sim.moveToLocation(this.host.relative(center(w)), {
                    speed: this.fast || this.urgent ? 1 : 0.65,
                    faceTarget: true,
                });
            } catch {
                return this.fail("Move rejected by engine.");
            }
        }
        return "running";
    }
}
