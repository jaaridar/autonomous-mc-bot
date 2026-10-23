/**
 * Thin wrapper over SimulatedPlayer movement APIs:
 *   swim / stopSwimming
 *   navigateToLocation / navigateToLocations  (vanilla mob pathfinder)
 *   moveToLocation / moveRelative / jump / lookAtLocation / stopMoving
 *
 * Every call is optional-and-caught so offline tests and older runtimes
 * that lack a method still work. Returns false when the engine refused.
 */
export class Mover {
    constructor(sim, host) {
        this.sim = sim;
        this.host = host;
        this.swimming = false;
    }

    rel(p) {
        return this.host.relative(p);
    }

    call(name, ...args) {
        try {
            const fn = this.sim[name];
            if (typeof fn !== "function") return undefined;
            return fn.apply(this.sim, args);
        } catch {
            return undefined;
        }
    }

    stop() {
        this.call("stopMoving");
        this.stopSwim();
        try { this.sim.isSprinting = false; } catch { /* ignore */ }
    }

    startSwim() {
        if (this.swimming) return true;
        if (typeof this.sim.swim !== "function") return false;
        this.call("swim");
        this.swimming = true;
        return true;
    }

    stopSwim() {
        if (!this.swimming && typeof this.sim.stopSwimming !== "function") return;
        this.call("stopSwimming");
        this.swimming = false;
    }

    look(p) {
        return this.call("lookAtLocation", this.rel(p)) !== undefined || typeof this.sim.lookAtLocation === "function";
    }

    jump() {
        const r = this.call("jump");
        return r !== false;
    }

    /**
     * Vanilla GameTest pathfinder. Requires the player on the ground.
     * Returns false if missing, thrown, or NavigationResult.isFullPath === false.
     */
    navigateTo(goal, speed = 1) {
        if (typeof this.sim.navigateToLocation !== "function") return false;
        try {
            const r = this.sim.navigateToLocation(this.rel(goal), speed);
            if (r && r.isFullPath === false) return false;
            return true;
        } catch {
            return false;
        }
    }

    /** Follow an explicit route (our A* waypoints) via the vanilla navigator. */
    navigateRoute(points, speed = 1) {
        if (!points || points.length < 2) return false;
        if (typeof this.sim.navigateToLocations !== "function") return false;
        try {
            this.sim.navigateToLocations(points.map((p) => this.rel(p)), speed);
            return true;
        } catch {
            return false;
        }
    }

    walkTo(goal, speed = 1) {
        if (typeof this.sim.moveToLocation !== "function") return false;
        try {
            this.sim.moveToLocation(this.rel(goal), { speed, faceTarget: true });
            return true;
        } catch {
            return false;
        }
    }

    /** leftRight, forwardBack in player-local space. */
    moveRelative(leftRight, forward, speed = 1) {
        return this.call("moveRelative", leftRight, forward, speed) !== undefined
            || typeof this.sim.moveRelative === "function";
    }

    /**
     * In-water locomotion: sim.swim() + look + jump-to-surface + moveToLocation.
     */
    swimToward(dest, opts = {}) {
        this.startSwim();
        const headInWater = !!opts.headInWater;
        const here = this.sim.location;
        const look = headInWater
            ? { x: dest.x, y: (here?.y ?? dest.y) + 6, z: dest.z }
            : dest;
        this.look(look);
        if (headInWater) this.jump();
        try { this.sim.isSprinting = !headInWater; } catch { /* ignore */ }
        const target = headInWater
            ? { x: dest.x, y: (here?.y ?? dest.y) + 1.6, z: dest.z }
            : dest;
        if (this.walkTo(target, 1)) return "swim";
        if (this.moveRelative(0, 1, 1)) return "swim";
        return "swim";
    }
}
