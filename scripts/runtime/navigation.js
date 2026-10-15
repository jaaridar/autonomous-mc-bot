import { floor, horizontal, distance, center, key, add } from "../core/math.js";
import { PathSearch } from "../core/navigation.js";

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
    }

    reset() {
        try { this.sim.stopMoving(); } catch {}
        try { this.sim.isSprinting = false; } catch {}
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
    }

    replan(tick) {
        const allowBridge = this.allowBridge || this.builder?.canBuild;
        const allowPillar = allowBridge; // For 100 block tower, allow pillar
        const verticalDiff = Math.abs(floor(this.sim.location).y - floor(this.target).y);
        const horiz = horizontal(this.sim.location, this.target);
        // For high tower (100 blocks), increase search radius and nodes
        const isHighTower = verticalDiff > 20 || horiz > 50;
        const maxNodes = isHighTower ? 8000 : 3000;
        const radius = isHighTower ? 128 : 36;
        this.search = new PathSearch(
            this.terrain.read,
            floor(this.sim.location),
            floor(this.target),
            0.7,
            this.parkour,
            maxNodes,
            radius,
            horizontal(this.sim.location, this.target) > 20,
            this.avoid,
            { allowBridge, allowPillar, allowSprintJump: this.allowSprintJump }
        );
        this.path = [];
        this.corridor = [];
        this.waypoint = 0;
        this.lastIssued = -1;
        this.lastProgress = tick;
        this.segmentStart = tick;
        this.lastPosition = { ...this.sim.location };
        try { this.sim.stopMoving(); } catch {}
    }

    fail(message) {
        this.lastGoal = this.target ? { ...this.target } : this.lastGoal;
        this.reason = message;
        this.stuck = true;
        this.reset();
        return "failed";
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

    go(goal, tick) {
        // UNBREAKABLE: if in water, don't try normal pathfinding - need boat/swim
        if (this.sim.isInWater) {
            return this.fail("In water, need boat or swim to shore - water navigation");
        }
        // If start not safe (in water, falling, etc), fail fast
        const startFloor = floor(this.sim.location);
        if (!this.terrain.safe(startFloor) && !this.terrain.safe({ x: startFloor.x, y: startFloor.y - 1, z: startFloor.z })) {
            // Check if water nearby
            if (this.terrain.waterNear(startFloor)) {
                return this.fail("Start in water or unsafe, need boat/bridge - water detected");
            }
        }
        if (horizontal(this.sim.location, goal) < 0.7 && Math.abs(this.sim.location.y - goal.y) < 1.2) {
            this.reset();
            return "done";
        }
        if (!this.target) {
            this.target = { ...goal };
            this.lastRetarget = tick;
            this.replan(tick);
        } else if (distance(goal, this.target) > 3 && tick - this.lastRetarget >= 12) {
            this.target = { ...goal };
            this.lastRetarget = tick;
            this.retries = 0;
            this.endpoints.clear();
            this.trail = [];
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

        // Check if waypoint still safe, or if we need bridge - entire body must be able to go
        const waypointSafe = this.terrain.freshSafe(w) || w.kind === "bridge";
        if (tick - this.lastProgress > 50 || !waypointSafe || this.corridor.some((p) => !this.terrain.freshSafe(p) && p.kind !== "bridge")) {
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
                } catch {}
            }
            if (++this.retries > 4) return this.fail("Stuck or terrain changed after retries.");
            this.terrain.clear();
            this.replan(tick);
            return "running";
        }

        if (this.detectLoop(tick)) return this.fail("Circling without progress; treating as blocking.");

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
                    if (q.kind !== "walk" || q.y !== w.y || (alongX ? q.z !== w.z : q.x !== w.x) || !this.terrain.freshSafe(q)) break;
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

            // Handle special kinds - world-class arbitrary bridging
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

            this.sim.isSprinting = sprint || w.kind === "jump" || w.kind === "sprintjump";

            if (w.kind === "step" || w.kind === "jump" || w.kind === "sprintjump" || w.kind === "jumpup") {
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
