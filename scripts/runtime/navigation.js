import { floor, horizontal, distance, center, key } from "../core/math.js";
import { PathSearch } from "../core/navigation.js";
/** Rolling-horizon, time-sliced A*. This is NOT D* Lite or a precomputed HPA* graph. */
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
        this.parkour = false;
        this.fast = true;
        this.segments = 0;
        this.expansions = 0;
        /** Set by the brain while fleeing/fighting; forces sprint and max speed. */
        this.urgent = false;
        /** Threat positions the planner should curve around. */
        this.avoid = [];
        /** Last goal go() was asked for; survives fail() so escape can use it. */
        this.lastGoal = undefined;
        /** True after the last go() gave up, so the brain can escalate to escape. */
        this.stuck = false;
    }
    reset() {
        this.sim.stopMoving();
        this.sim.isSprinting = false;
        this.target = undefined;
        this.search = undefined;
        this.path = [];
        this.corridor = [];
        this.retries = 0;
        this.lastIssued = -1;
        this.endpoints.clear();
        this.urgent = false;
        this.avoid = [];
    }
    replan(tick) {
        this.search = new PathSearch(this.terrain.read, floor(this.sim.location), floor(this.target), 0.5, this.parkour, 2600, 32, horizontal(this.sim.location, this.target) > 20, this.avoid);
        this.path = [];
        this.corridor = [];
        this.waypoint = 0;
        this.lastIssued = -1;
        this.lastProgress = tick;
        this.segmentStart = tick;
        this.lastPosition = { ...this.sim.location };
        this.sim.stopMoving();
    }
    fail(message) {
        this.lastGoal = this.target ? { ...this.target } : this.lastGoal;
        this.reason = message;
        this.stuck = true;
        this.reset();
        return "failed";
    }
    go(goal, tick) {
        if (horizontal(this.sim.location, goal) < 0.65 &&
            Math.abs(this.sim.location.y - goal.y) < 1.1) {
            this.reset();
            return "done";
        }
        if (!this.target) {
            this.target = { ...goal };
            this.lastRetarget = tick;
            this.replan(tick);
        }
        // Moving targets update at a bounded rate; don't restart a search every frame.
        else if (distance(goal, this.target) > 3 &&
            tick - this.lastRetarget >= 12) {
            this.target = { ...goal };
            this.lastRetarget = tick;
            this.retries = 0;
            this.endpoints.clear();
            this.replan(tick);
        }
        if (tick - this.segmentStart > 600)
            return this.fail("Segment timeout; terrain may be unavailable or obstructed.");
        if (this.search) {
            const before = this.search.expanded;
            const result = this.search.step(this.fast ? 96 : 40);
            this.expansions += this.search.expanded - before;
            if (result === "searching")
                return "running";
            if (result !== "found" && result !== "partial")
                return this.fail(`Path ${result}; unknown terrain is not traversed.`);
            this.path = this.search.path;
            this.search = undefined;
            this.segments++;
            if (!this.path.length)
                return this.fail("No usable waypoint.");
        }
        let w = this.path[this.waypoint];
        if (!w) {
            this.replan(tick);
            return "running";
        }
        if (horizontal(this.sim.location, center(w)) < 0.45 &&
            Math.abs(this.sim.location.y - w.y) < 0.6) {
            this.waypoint++;
            this.lastProgress = tick;
            if (this.waypoint === this.path.length) {
                if (horizontal(this.sim.location, goal) < 0.8 &&
                    Math.abs(this.sim.location.y - goal.y) < 1.1) {
                    this.reset();
                    return "done";
                }
                const k = key(floor(this.sim.location)), n = (this.endpoints.get(k) ?? 0) + 1;
                this.endpoints.set(k, n);
                if (n > 2)
                    return this.fail("Repeated segment endpoint; no forward progress.");
                if (this.endpoints.size > 128)
                    this.endpoints.delete(this.endpoints.keys().next().value);
                this.target = { ...goal };
                this.retries = 0;
                this.replan(tick);
                return "running";
            }
            w = this.path[this.waypoint];
        }
        if (this.lastPosition &&
            distance(this.sim.location, this.lastPosition) > 0.2) {
            this.lastProgress = tick;
            this.lastPosition = { ...this.sim.location };
        }
        if (tick - this.lastProgress > 45 ||
            !this.terrain.freshSafe(w) ||
            this.corridor.some((p) => !this.terrain.freshSafe(p))) {
            if (++this.retries > 3)
                return this.fail("Stuck or changed terrain after 3 retries.");
            this.terrain.clear();
            this.replan(tick);
            return "running";
        }
        if (this.lastIssued !== this.waypoint) {
            // Combine collinear ground steps so the engine does not stop at every block.
            const first = this.waypoint;
            const previous = first > 0 ? this.path[first - 1] : floor(this.sim.location);
            const alongX = previous.z === w.z && previous.x !== w.x;
            let end = this.waypoint;
            const limit = Math.min(this.path.length, end + 5);
            if (w.kind === "walk")
                for (let j = end + 1; j < limit; j++) {
                    const q = this.path[j];
                    if (q.kind !== "walk" ||
                        q.y !== w.y ||
                        (alongX ? q.z !== w.z : q.x !== w.x) ||
                        !this.terrain.freshSafe(q))
                        break;
                    end = j;
                }
            if (end > this.waypoint) {
                this.waypoint = end;
                w = this.path[end];
            }
            this.corridor = this.path.slice(first, end + 1);
            this.lastIssued = this.waypoint;
            // Sprint whenever there is food and health to spend, and always when
            // the brain flagged urgency (fleeing or closing on a threat).
            const hunger = this.sim.getComponent("minecraft:player.hunger")?.currentValue ?? 20;
            const hp = this.sim.getComponent("minecraft:health")?.currentValue ?? 20;
            const canSprint = hunger > 6 && hp > 6;
            const sprint = canSprint &&
                (this.urgent ||
                    (this.fast &&
                        w.kind === "walk" &&
                        horizontal(this.sim.location, w) > 1));
            this.sim.isSprinting = sprint || w.kind === "jump";
            if (w.kind === "step" || w.kind === "jump") {
                if (!this.sim.isOnGround) {
                    this.lastIssued = -1;
                    return "running";
                }
                this.sim.jump();
            }
            this.sim.moveToLocation(this.host.relative(center(w)), {
                speed: this.fast || this.urgent ? 1 : 0.65,
                faceTarget: true,
            });
        }
        return "running";
    }
}
