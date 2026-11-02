// Movement policy on top of the avatar driver.
//
// This used to be a rolling-horizon A* with its own step/edge model, parkour
// planner, bridging planner and jump/sprint execution - about 1,200 lines.
// The engine already ships a
// pathfinder for simulated players (navigateToLocation / navigateToBlock route
// around obstacles, climb, open doors and swim; moveToLocation is the straight
// line), so the pack now uses it and keeps only the policy the engine cannot
// know about:
//
//   * the goal contract every caller already speaks: "done" / "running" /
//     "failed", with `reason`, `stuck`, `urgent`, `avoid`, `lastGoal`;
//   * refusing to start from unsafe ground or into a hazard;
//   * a stall is not the same as a refusal - one stall is retried with a
//     bridging fallback when the owner allows bridging, then reported failed so
//     the caller (miner, escape, mining director) can pick a different plan.
//
// The engine's navigator gets stuck and stops on its own; the driver watches
// movement and reports it, so no progress bookkeeping is duplicated here.
import { DONE, FAILED, RUNNING } from "../sim/avatar.js";
import { CARDINAL, floor, horizontal } from "../core/math.js";

const LEASH = 0.9;

export class Navigator {
    constructor(avatar, host, terrain) {
        this.avatar = avatar;
        this.host = host;
        this.terrain = terrain;
        // Flags the rest of the pack sets (kept as the same public surface).
        this.fast = false;
        /**
         * `!bot config parkour on|off`. The engine's pathfinder does the actual
         * parkour (climbing, gap jumps, doors, swimming); this flag only allows
         * the driver's verified straight-line shortcut for short, clear walks.
         * Off = every walk is a real engine navigation.
         */
        this.parkour = true;
        this.allowBridge = false;
        this.allowWater = false;   // callers that own water handling turn this on
        this.builder = undefined;
        // Threat avoidance, set by the combat/escape policy each tick.
        this.urgent = false;
        this.avoid = [];
        // Status
        this.reason = "";
        this.stuck = false;
        this.target = undefined;
        this.lastGoal = undefined;
        this.segments = 0;      // engine navigations started
        this.expansions = 0;    // fallback steps used (bridging, escape nudges)
        this.done = 0;
    }

    reset() {
        this.reason = "";
        this.stuck = false;
        this.target = undefined;
        this.avatar.clearNav();
    }

    fail(message) {
        this.reason = message;
        this.avatar.stopMoving();
        return "failed";
    }

    /**
     * Walk to `goal`. Same three answers as before, same reasons on the same
     * conditions, so no caller had to change.
     */
    go(goal, tick) {
        const avatar = this.avatar;
        this.target = { ...goal };
        this.lastGoal = { ...goal };
        if (avatar.inWater && !this.allowWater) {
            return this.fail("In water, need boat or swim to shore - water navigation");
        }
        const start = avatar.cell;
        if (!this.terrain.safe(start) && !this.terrain.safe({ x: start.x, y: start.y - 1, z: start.z })) {
            if (this.terrain.waterNear(start)) {
                return this.fail("Start in water or unsafe, need boat/bridge - water detected");
            }
        }
        if (this.terrain.dangerous(floor(goal))) {
            return this.fail("Destination is hazardous; refusing to walk into it.");
        }
        if (this.urgent) {
            const flee = this.flee(tick);
            if (flee) return flee;
        }
        const result = avatar.goto(goal, { leash: LEASH, speed: this.fast ? 1 : 0.85, allowWater: this.allowWater, allowHop: this.parkour });
        if (result === DONE) {
            this.done++;
            this.reason = "";
            this.stuck = false;
            this.target = undefined;
            return "done";
        }
        if (result === RUNNING) {
            if (avatar.navPartial && this.reason !== "Partial path; still trying.") {
                this.reason = "Partial path; still trying.";
            }
            return "running";
        }
        // FAILED: either the engine refused the goal, or the walk stalled.
        if (avatar.isStuck) {
            this.stuck = true;
            this.expansions++;
            if (this.allowBridge && this.builder) {
                const bridged = this.tryBridge(goal, tick);
                if (bridged) return "running";
            }
        }
        this.reason = avatar.reason || "Path failed.";
        return "failed";
    }

    /** One bridging attempt across the obstacle that stopped the walk. */
    tryBridge(goal, tick) {
        try {
            const r = this.builder.bridgeTo(goal, tick);
            if (r === "done" || r === "running" || r === "placed" || r === "solid") return true;
            if (typeof r === "string" && r.startsWith("no-")) {
                this.reason = "No blocks to bridge with.";
                return false;
            }
            return r !== undefined;
        }
        catch (e) {
            this.reason = `Bridging failed: ${String(e?.message ?? e).slice(0, 120)}`;
            return false;
        }
    }

    /**
     * Urgent movement (a threat is close): step directly away from the nearest
     * avoided position instead of routing around it. Falls through when there is
     * nowhere to run, so the normal goal path still runs.
     */
    flee(tick) {
        const avatar = this.avatar;
        let near;
        for (const a of this.avoid) {
            const d = horizontal(avatar.pos, a);
            if (d < (a.radius ?? 6) && (!near || d < near.d)) near = { a, d };
        }
        if (!near) return undefined;
        let dx = avatar.pos.x - near.a.x, dz = avatar.pos.z - near.a.z;
        let len = Math.hypot(dx, dz);
        if (len < 0.001) {
            // A threat exactly on top of us leaves no "away" vector: take the
            // first safe cardinal side instead of standing still.
            const side = CARDINAL.find((c) => this.terrain.safe({ x: avatar.cell.x + c.x, y: avatar.cell.y, z: avatar.cell.z + c.z }));
            if (!side) return undefined;
            dx = side.x;
            dz = side.z;
            len = 1;
        }
        const step = { x: avatar.pos.x + (dx / len) * 5, y: avatar.pos.y, z: avatar.pos.z + (dz / len) * 5 };
        const r = avatar.goto(step, { leash: 2, speed: 1 });
        if (r === DONE) { this.reset(); return "done"; }
        if (r === RUNNING) return "running";
        return undefined;
    }

    /** Where the pack last asked the bot to go (escape reads this for context). */
    goal() {
        return this.target ?? this.lastGoal;
    }

    status() {
        return { segments: this.segments, fallbacks: this.expansions, reached: this.done };
    }
}
