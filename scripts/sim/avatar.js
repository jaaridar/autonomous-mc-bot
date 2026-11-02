// The avatar driver: the ONE place that talks to SimulatedPlayer.
//
// Every other module used to call the engine directly - 138 raw `sim.*` sites
// in bot.js alone, each wrapped in its own try/catch (365 across the pack).
// That spread is where the bugs lived: forgetting `host.relative()` on a
// coordinate, re-issuing navigation every tick (which restarts the engine's
// pathfinder), or treating `attackEntity() === false` as "no target" when the
// documented meaning is "the player is on cooldown".
//
// So this file owns the avatar and nothing else:
//
//   * world coordinates in, world coordinates out. The GameTest-relative
//     conversion every positional API needs happens exactly once, here.
//   * engine calls never throw outward: each is converted to a value plus a
//     recorded reason, so callers branch instead of wrapping try/catch.
//   * engine semantics are honoured as documented, not guessed:
//       - navigateTo* needs the player touching the ground to start, and the
//         engine stops on its own if the player gets stuck;
//       - breakBlock() returns "the block there is solid", and hits until the
//         block breaks, an item is used, or stopBreakingBlock() is called, so
//         the driver starts a break once and then polls the world;
//       - attackEntity() returns false when the attack was refused (cooldown),
//         so the cooldown signal is free - no timers to duplicate;
//       - stopUsingItem() returns the item that was in use, which is the only
//         reliable "was I mid-use" answer;
//       - moveToLocation() is a straight line and overrides any navigation,
//         so it is only used for short, verified-clear hops.
//
// Mechanism only: what to dig, whether a tier allows it, and when to flee are
// policy and stay in the modules that own that decision.
import { add, center, distance, floor, horizontal } from "../core/math.js";

/** Navigation / movement results. */
export const DONE = "done";
export const RUNNING = "running";
export const FAILED = "failed";
/** Dig results. `blocked` means something closer absorbed the swing. */
export const DIGGING = "digging";
export const BLOCKED = "blocked";
export const UNREACHABLE = "unreachable";

const REACH = 5.5;            // head-to-block distance the engine will accept
const DIG_TIMEOUT = 240;      // ticks on one block before we call it stuck
const STALL_TICKS = 25;       // ticks without movement before navigation is stuck
const NAV_DEADLINE = 900;     // hard cap on a single goto()
const SHORT_HOP = 6;          // straight-line range where moveToLocation is safe
const SUCCESS_H = 0.9;        // horizontal arrival tolerance
const SUCCESS_V = 1.3;        // vertical arrival tolerance

export class Avatar {
    constructor(sim, host, terrain) {
        this.sim = sim;
        this.host = host;
        this.terrain = terrain;
        this.errors = 0;
        this.lastError = undefined;
        this.reason = "";
        this.tick = 0;
        // per-tick snapshot (one native read each instead of hundreds)
        this.pos = { x: 0, y: 0, z: 0 };
        this.head = { x: 0, y: 0, z: 0 };
        this.dim = "minecraft:overworld";
        this.onGround = false;
        this.inWater = false;
        this.sprinting = false;
        this.sneaking = false;
        this.valid = false;
        // movement state
        this.navGoal = undefined;
        this.navSince = 0;
        this.navPartial = false;
        this.lastProgress = 0;
        this.lastPos = undefined;
        this.stalled = false;
        this.moving = false;
        // dig state
        this.digCell = undefined;
        this.digSince = 0;
    }

    // ---------------------------------------------------------------- errors

    /**
     * Every engine call goes through here. A throw becomes a recorded reason
     * plus the fallback value, so no caller needs its own try/catch and the
     * circuit breaker has one counter to read.
     */
    guard(label, fn, fallback) {
        try {
            return fn();
        }
        catch (e) {
            this.errors++;
            this.lastError = { label, message: String(e?.message ?? e).slice(0, 200), tick: this.tick };
            return fallback;
        }
    }

    // ------------------------------------------------------------------ state

    /** Refresh the cached snapshot. Call once per tick, before anything else. */
    sync(tick) {
        this.tick = tick ?? this.tick + 1;
        const s = this.sim;
        this.valid = this.guard("isValid", () => s.isValid === true, false);
        if (!this.valid) return this;
        const loc = this.guard("location", () => s.location, this.pos);
        this.pos = loc ? { x: loc.x, y: loc.y, z: loc.z } : this.pos;
        const head = this.guard("getHeadLocation", () => s.getHeadLocation(), undefined);
        this.head = head ? { x: head.x, y: head.y, z: head.z } : { x: this.pos.x, y: this.pos.y + 1.6, z: this.pos.z };
        this.dim = this.guard("dimension", () => s.dimension?.id, this.dim) ?? this.dim;
        this.onGround = this.guard("isOnGround", () => s.isOnGround === true, false);
        this.inWater = this.guard("isInWater", () => s.isInWater === true, false);
        this.sprinting = this.guard("isSprinting", () => s.isSprinting === true, false);
        this.sneaking = this.guard("isSneaking", () => s.isSneaking === true, false);
        return this;
    }

    /**
     * Am I on fire? `Entity.isOnFire` does not exist in the API version this
     * pack targets (verified against its typings), so read the component that
     * does - the old `sim.isOnFire` check was always undefined, which meant a
     * burning bot never put itself out.
     */
    get burning() {
        return this.guard("onfire", () => {
            const c = this.sim.getComponent("minecraft:onfire");
            return (c?.onFireTicksRemaining ?? 0) > 0;
        }, false);
    }

    get cell() {
        return floor(this.pos);
    }

    /** True when the last goto() stopped making progress (the arbiter reads it). */
    get isStuck() {
        return this.stalled;
    }

    // --------------------------------------------------------------- movement

    /** Straight line of standable cells, all cached reads; no native calls. */
    lineClear(from, to) {
        const n = Math.ceil(horizontal(from, to));
        if (n > SHORT_HOP) return false;
        for (let i = 1; i <= n; i++) {
            const t = i / n;
            const p = floor({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t, z: from.z + (to.z - from.z) * t });
            if (!this.terrain.safe(p)) return false;
        }
        return true;
    }

    /**
     * Walk to a world-space target. Returns DONE / RUNNING / FAILED and sets
     * `reason` on failure. Engine navigation does the walking; this method only
     * decides when to (re)start it, when to stop, and when to give up.
     */
    goto(target, opts = {}) {
        const leash = opts.leash ?? SUCCESS_H;
        const speed = opts.speed ?? 1;
        this.stalled = false;
        if (horizontal(this.pos, target) <= leash && Math.abs(this.pos.y - target.y) < SUCCESS_V) {
            this.stopMoving();
            this.navGoal = undefined;
            return DONE;
        }
        if (this.inWater && !opts.allowWater) {
            // Engine navigation swims, but the caller usually wants the boat or
            // escape path to handle water first - same contract as before.
            this.reason = "In water: swimming/bridging is handled by the caller.";
            return FAILED;
        }
        if (!this.onGround) {
            // Navigation can only start from the ground. Falling is not failure:
            // report progress and let the next tick try again.
            this.reason = "Not on the ground yet.";
            return RUNNING;
        }
        const live = this.navGoal && horizontal(this.navGoal, target) < Math.max(2, horizontal(this.pos, target) * 0.25);
        const spent = this.tick - this.navSince;
        if (!live || spent > NAV_DEADLINE) {
            if (spent > NAV_DEADLINE) {
                this.stopMoving();
                this.reason = "Took too long to reach the destination.";
                return FAILED;
            }
            this.startNav(target, speed, opts);
        }
        if (!this.navGoal) return FAILED;
        // Progress tracking: the engine stops by itself when it gets stuck, and
        // silence would otherwise look like progress forever.
        if (!this.lastPos || distance(this.pos, this.lastPos) > 0.15) {
            this.lastPos = { x: this.pos.x, y: this.pos.y, z: this.pos.z };
            this.lastProgress = this.tick;
        }
        else if (this.tick - this.lastProgress > STALL_TICKS) {
            this.stopMoving();
            this.navGoal = undefined;
            this.stalled = true;
            this.reason = `Stuck at ${this.cell.x},${this.cell.y},${this.cell.z} on the way to ${target.x},${target.y},${target.z}.`;
            return FAILED;
        }
        if (this.tick - this.navSince > NAV_DEADLINE) this.navGoal = undefined;
        return RUNNING;
    }

    /**
     * Start engine navigation, or a verified short hop when that is enough.
     * `opts.allowHop: false` forbids the straight-line shortcut (`!bot config
     * parkour off`), so every walk goes through the engine's pathfinder.
     */
    startNav(target, speed, opts) {
        this.navGoal = { ...target };
        this.navSince = this.tick;
        this.navPartial = false;
        this.moving = true;
        this.lastProgress = this.tick;
        this.lastPos = { x: this.pos.x, y: this.pos.y, z: this.pos.z };
        // Feet cell to goal cell: a body-line through the head can never be
        // "safe" (its support is the air the body stands in).
        if (opts.allowHop !== false && horizontal(this.pos, target) <= SHORT_HOP && this.lineClear(this.cell, floor(target))) {
            this.guard("moveToLocation", () => this.sim.moveToLocation(this.host.relative(center(target)), { faceTarget: true, speed }), undefined);
            return;
        }
        const result = this.guard("navigateToLocation", () => this.sim.navigateToLocation(this.host.relative(center(target)), speed), undefined);
        if (result === undefined) {
            // The engine refused outright (unreachable or still moving). Keep the
            // goal so the stall detector can time it out instead of hammering.
            this.navPartial = true;
            this.reason = "No usable path from the engine.";
            return;
        }
        this.navPartial = this.guard("isFullPath", () => result.isFullPath === false, false) === true;
    }

    stopMoving() {
        this.navGoal = undefined;
        this.lastPos = undefined;
        if (!this.moving && !this.stalled) return;
        this.moving = false;
        this.guard("stopMoving", () => this.sim.stopMoving(), undefined);
    }

    /**
     * One-shot straight-line move to an exact world position (a jump-swing
     * point, a shelter doorway, a shore). No pathfinding: callers use this when
     * the few blocks in between are already known to be clear.
     */
    hop(target, opts = {}) {
        this.navGoal = undefined;
        this.lastPos = undefined;
        this.moving = true;
        return this.guard("moveToLocation", () => {
            this.sim.moveToLocation(this.host.relative(target), { faceTarget: true, speed: opts.speed ?? 1 });
            return true;
        }, false);
    }

    /**
     * Forget the current route without cancelling it in the engine. Policy code
     * that merely re-targets calls this: stopping the walk on every re-plan
     * would cancel the engine's path every few ticks.
     */
    clearNav() {
        this.navGoal = undefined;
        this.lastPos = undefined;
        this.stalled = false;
    }

    jump() {
        return this.guard("jump", () => this.sim.jump() === true, false);
    }

    swim() {
        return this.guard("swim", () => (this.sim.swim(), true), false);
    }

    stopSwimming() {
        return this.guard("stopSwimming", () => (this.sim.stopSwimming(), true), false);
    }

    // ------------------------------------------------------------- interaction

    /**
     * Make the block at `cell` stop existing. Start the break once, then poll
     * the world - re-calling breakBlock every tick would restart the swing.
     * Callers do the policy (reachability, tier, hazards) beforehand.
     */
    dig(cell, reach = REACH) {
        const key = `${cell.x},${cell.y},${cell.z}`;
        const at = add(cell, { x: 0.5, y: 0.5, z: 0.5 });
        const block = this.terrain.block(cell);
        if (!block || block.isAir) {
            this.stopDigging();
            return DONE;
        }
        if (distance(this.head, at) > reach) return UNREACHABLE;
        if (this.digCell === key) {
            if (this.tick - this.digSince > DIG_TIMEOUT) {
                this.stopDigging();
                this.reason = `Could not break ${block.typeId} in time.`;
                return BLOCKED;
            }
            return DIGGING;
        }
        this.lookBlock(cell);
        const started = this.guard("breakBlock", () => this.sim.breakBlock(this.host.relative(at)), false);
        if (!started) {
            // Documented meaning: the block there is not solid. A solid block
            // that still refuses means a nearer block absorbed the swing, which
            // is the caller's cue to clear that blocker (bot.breakThrough does).
            const now = this.terrain.block(cell);
            if (!now || now.isAir) {
                this.stopDigging();
                return DONE;
            }
            this.stopDigging();
            return BLOCKED;
        }
        this.digCell = key;
        this.digSince = this.tick;
        return DIGGING;
    }

    stopDigging() {
        if (!this.digCell) return;
        this.digCell = undefined;
        this.digSince = 0;
        this.guard("stopBreakingBlock", () => this.sim.stopBreakingBlock(), undefined);
    }

    /**
     * One-shot swing: look at the cell and start a break, without the driver's
     * poll bookkeeping. For the few callers that already track their own target
     * (tunnelling, bridge clearing, shelter doors). Prefer dig().
     */
    breakBlockAt(cell) {
        this.lookBlock(cell);
        return this.guard("breakBlock", () => this.sim.breakBlock(this.host.relative(center(cell))) === true, false);
    }

    lookBlock(cell) {
        this.guard("lookAtBlock", () => this.sim.lookAtBlock(this.host.relative(center(cell))), undefined);
    }

    lookEntity(entity) {
        this.guard("lookAtEntity", () => this.sim.lookAtEntity(entity), undefined);
    }

    lookLocation(loc) {
        this.guard("lookAtLocation", () => this.sim.lookAtLocation(this.host.relative(loc)), undefined);
    }

    interactBlock(cell, face = undefined) {
        const at = this.host.relative(center(cell));
        return this.guard("interactWithBlock", () => (face === undefined ? this.sim.interactWithBlock(at) : this.sim.interactWithBlock(at, face)) === true, false);
    }

    interactEntity(entity) {
        return this.guard("interactWithEntity", () => this.sim.interactWithEntity(entity) === true, false);
    }

    /** Raycast from the head and interact with whatever is first (boats, doors). */
    interact() {
        return this.guard("interact", () => this.sim.interact() === true, false);
    }

    use(slot) {
        return this.guard("useItemInSlot", () => this.sim.useItemInSlot(slot) === true, false);
    }

    useOn(slot, cell, direction, faceLocation = undefined) {
        const at = this.host.relative(center(cell));
        return this.guard("useItemInSlotOnBlock", () => (faceLocation === undefined
            ? this.sim.useItemInSlotOnBlock(slot, at, direction)
            : this.sim.useItemInSlotOnBlock(slot, at, direction, faceLocation)) === true, false);
    }

    /** Stops the active use and reports what was being used, if anything. */
    stopUsing() {
        return this.guard("stopUsingItem", () => this.sim.stopUsingItem(), undefined);
    }

    /**
     * Attack. False means "refused" - by the documented contract that is the
     * cooldown, so callers retry next tick instead of tracking their own timer.
     */
    attack(entity) {
        return this.guard("attackEntity", () => this.sim.attackEntity(entity) === true, false);
    }

    setSneaking(on) {
        return this.guard("isSneaking", () => {
            this.sim.isSneaking = on === true;
            return true;
        }, false);
    }

    setSprinting(on) {
        return this.guard("isSprinting", () => {
            this.sim.isSprinting = on === true;
            return true;
        }, false);
    }

    // --------------------------------------------------------------- lifecycle

    respawn() {
        return this.guard("respawn", () => this.sim.respawn() === true, false);
    }

    say(text) {
        return this.guard("chat", () => (this.sim.chat(String(text)), true), false);
    }

    disconnect() {
        return this.guard("disconnect", () => (this.sim.disconnect(), true), false);
    }

    /** Drop every action in flight. Safe to call at any time; never throws. */
    stopAll() {
        this.stopDigging();
        this.guard("stopMoving", () => this.sim.stopMoving(), undefined);
        this.guard("stopUsingItem", () => this.sim.stopUsingItem(), undefined);
        this.guard("stopInteracting", () => this.sim.stopInteracting(), undefined);
        this.setSneaking(false);
        this.navGoal = undefined;
        this.lastPos = undefined;
        this.stalled = false;
    }
}
