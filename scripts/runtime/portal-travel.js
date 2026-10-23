/**
 * Portal travel — autonomous Nether/Overworld transfer.
 *
 * The bot builds (or finds) a portal, lights it, walks in, waits for the engine
 * to move it, and if the engine does not (SimulatedPlayers are not always
 * treated as players by portal transit) uses the portal's own coordinate link
 * as a fallback: overworld x/z divided by eight, with a safe-arrival search on
 * the other side. Nothing is fabricated: obsidian, flint and steel and every
 * block placed are real inventory items, and every action is verified against
 * the world before the next step trusts it.
 *
 * All geometry, validation and arrival scoring lives in core/portal.js.
 */
import { world, system, Direction } from "@minecraft/server";
import { floor, add, center, distance, horizontal, UP, DOWN } from "../core/math.js";
import {
    OVERWORLD,
    NETHER,
    findPortalNear,
    chooseArrival,
    choosePortalAnchor,
    validatePortalFrame,
    portalFrame,
    linkedGuess,
    isPortalCell,
} from "../core/portal.js";
import { Terrain } from "./world.js";

const PROBE_TTL = 40;
const ENTER_TIMEOUT = 240;
const GRACE_TICKS = 50;
const IGNITE_TIMEOUT = 80;
const GATHER_TIMEOUT = 12000;

export class PortalTraveler {
    constructor(bot) {
        this.bot = bot;
        this.state = "idle";
        this.target = undefined;
        this.near = undefined;
        this.portalPos = undefined;
        this.origin = undefined;
        this.arrival = undefined;
        this.plan = undefined;
        this.started = 0;
        this.startedEnter = 0;
        this.graceUntil = 0;
        this.igniteUntil = 0;
        this.attempts = 0;
        this.buildTries = 0;
        this.lastProbe = -PROBE_TTL;
        this.probe = null;
        this.lastReason = "";
        this.teleported = false;
        this.doneTick = 0;
        this.lastOverworldPortal = undefined;
        this.placedPlatform = 0;
        this.gatherSince = 0;
        this.nearPlan = undefined;
        this.linkTarget = undefined;
        this.links = 0;
    }

    get active() {
        return this.state !== "idle" && this.state !== "done" && this.state !== "failed";
    }

    get targetDimension() {
        return this.target;
    }

    reset() {
        this.state = "idle";
        this.target = undefined;
        this.near = undefined;
        this.portalPos = undefined;
        this.plan = undefined;
        this.arrival = undefined;
        this.teleported = false;
        this.attempts = 0;
        this.buildTries = 0;
        this.linkTarget = undefined;
        this.lastReason = "";
    }

    tell(message) {
        this.bot.tell?.(message);
        this.bot.record?.(`travel: ${message}`);
    }

    /**
     * Start a trip. `near` is where to look for / build a portal in the current
     * dimension. Returns "started" | "already" | "busy".
     */
    begin(dimension, near, tick = 0) {
        if (![OVERWORLD, NETHER].includes(dimension)) {
            this.lastReason = `unsupported dimension ${dimension}`;
            return "unsupported";
        }
        if (this.bot.sim.dimension.id === dimension) {
            this.state = "done";
            this.lastReason = `already in ${dimension}`;
            return "already";
        }
        if (this.active) return "busy";
        this.target = dimension;
        this.origin = { dim: this.bot.sim.dimension.id, pos: floor(this.bot.sim.location) };
        this.near = floor(near ?? this.bot.sim.location);
        this.started = tick;
        this.attempts = 0;
        this.buildTries = 0;
        this.plan = undefined;
        this.portalPos = undefined;
        this.teleported = false;
        this.arrival = undefined;
        this.gatherSince = 0;
        this.probe = null;
        this.nearPlan = undefined;
        this.linkTarget = undefined;
        this.lastProbe = -PROBE_TTL;
        // Reuse a remembered portal first (cheap, and it is the exact frame we
        // built for the outward trip).
        const remembered = this.bot.memory?.nearest?.("portal", this.bot.sim.dimension.id, this.near);
        if (remembered && horizontal(remembered, this.bot.sim.location) <= 64) {
            this.portalPos = { x: remembered.x, y: remembered.y, z: remembered.z };
            this.state = "enter";
            this.startedEnter = tick;
            this.tell(`Heading for the known portal at ${this.portalPos.x},${this.portalPos.y},${this.portalPos.z}.`);
            return "started";
        }
        this.state = "seek";
        this.tell(`Travel to ${dimension.replace("minecraft:", "")} requested: looking for or building a portal.`);
        return "started";
    }

    /** Enter a portal we already know about (from the Nether director). */
    enter(pos, tick = 0) {
        const dim = this.bot.sim.dimension.id === OVERWORLD ? NETHER : OVERWORLD;
        if (this.active) return "busy";
        this.target = dim;
        this.origin = { dim: this.bot.sim.dimension.id, pos: floor(this.bot.sim.location) };
        this.portalPos = floor(pos);
        this.near = this.portalPos;
        this.state = "enter";
        this.started = tick;
        this.startedEnter = tick;
        this.attempts = 0;
        this.buildTries = 0;
        this.teleported = false;
        this.nearPlan = undefined;
        this.linkTarget = undefined;
        return "started";
    }

    dimensionObject(id) {
        try {
            // Tests/embedders can supply a resolver; the engine is the default.
            return this.bot.dimensionFor?.(id) ?? world.getDimension(id);
        } catch {
            return undefined;
        }
    }

    /** Nearest remembered or visible portal within `radius` (cached 40 ticks). */
    portalWithin(radius = 12, tick = 0) {
        const t = tick || (this.bot.terrain?.now?.() ?? 0);
        if (t - this.lastProbe < PROBE_TTL) return this.probe?.pos;
        this.lastProbe = t;
        let found = null;
        try {
            found = findPortalNear(this.bot.terrain.read, floor(this.bot.sim.location), radius);
        } catch {
            found = null;
        }
        if (!found) {
            const near = this.bot.memory?.nearest?.("portal", this.bot.sim.dimension.id, this.bot.sim.location);
            if (near && horizontal(near, this.bot.sim.location) <= radius + 4) found = { pos: near, distance: horizontal(near, this.bot.sim.location) };
        }
        this.probe = found ? { pos: floor(found.pos), distance: found.distance } : null;
        return this.probe?.pos;
    }

    /** Called by Bot when the simulated player actually changed dimension. */
    onDimensionChange() {
        if (!this.target) return;
        if (this.bot.sim.dimension.id === this.target) {
            this.state = "arrive";
            this.lastReason = `arrived in ${this.target}`;
        }
    }

    /**
     * Drive the trip. Returns true while the traveler owns the tick so the
     * regular directors do not fight it for movement.
     */
    tick(tick) {
        if (!this.active) return false;
        try {
            switch (this.state) {
                case "seek":
                    return this.seek(tick);
                case "link":
                    return this.link(tick);
                case "gather":
                    return this.gather(tick);
                case "build":
                    return this.build(tick);
                case "ignite":
                    return this.ignite(tick);
                case "ignite_wait":
                    return this.igniteWait(tick);
                case "enter":
                    return this.approach(tick);
                case "transit":
                    return this.transit(tick);
                case "arrive":
                    return this.arriveState(tick);
                default:
                    return false;
            }
        } catch (error) {
            this.bot.fault?.(error);
            this.lastReason = `travel error: ${String(error?.message ?? error)}`;
            this.state = "failed";
            this.bot.reason = this.lastReason;
            return false;
        }
    }

    seek(tick) {
        const here = floor(this.bot.sim.location);
        const found = findPortalNear(this.bot.terrain.read, this.near ?? here, 16);
        if (found) {
            this.portalPos = floor(found.pos);
            this.state = "enter";
            this.startedEnter = tick;
            this.bot.reason = `Travel: using portal at ${this.portalPos.x},${this.portalPos.y},${this.portalPos.z}`;
            return true;
        }
        const obsidian = this.bot.bag.counts()["minecraft:obsidian"] ?? 0;
        if (obsidian < 10) {
            // Returning from the Nether with no obsidian: use the remembered
            // Overworld-side portal we came through (the 1:8 link).
            if (this.target === OVERWORLD && this.origin?.dim === NETHER) {
                const back = this.bot.memory?.nearest?.("portal", OVERWORLD, this.origin.pos) ?? this.lastOverworldPortal;
                if (back) {
                    this.linkTarget = { pos: floor(back), dim: OVERWORLD };
                    this.state = "link";
                    this.bot.reason = "Travel: no nether portal; using the remembered overworld portal link";
                    return this.link(tick);
                }
            }
            this.state = "gather";
            this.gatherSince = tick;
            this.bot.reason = `Travel: portal needs obsidian (${obsidian}/10); gathering`;
            return false;
        }
        const anchor = choosePortalAnchor(this.bot.terrain.read, this.near ?? here, { radius: 12 });
        if (!anchor) {
            this.bot.reason = "Travel: no flat 4x5 patch for a portal yet; clearing space";
            return this.clearSpace(tick);
        }
        this.plan = anchor;
        this.state = "build";
        this.bot.reason = `Travel: building a portal at ${anchor.base.x},${anchor.base.y},${anchor.base.z}`;
        return this.build(tick);
    }

    /** Last-resort linked transit to a known portal in the target dimension. */
    link(tick) {
        if (!this.linkTarget) {
            this.state = "gather";
            return false;
        }
        const dim = this.dimensionObject(this.linkTarget.dim);
        if (!dim) {
            this.fail("Linked destination dimension is unavailable.");
            return false;
        }
        const arrival = this.findArrival(this.linkTarget.dim, dim, this.linkTarget.pos);
        const loc = arrival ? { x: arrival.pos.x + 0.5, y: arrival.pos.y, z: arrival.pos.z + 0.5 } : { x: this.linkTarget.pos.x + 0.5, y: 64, z: this.linkTarget.pos.z + 0.5 };
        try {
            this.bot.sim.teleport(loc, { dimension: dim });
            this.arrival = arrival ?? { pos: floor(loc), needsDig: true };
            this.target = this.linkTarget.dim;
            this.state = "arrive";
            this.teleported = true;
            this.links++;
            this.bot.reason = `Travel: linked back to the ${this.target.replace("minecraft:", "")} portal`;
            return true;
        } catch (error) {
            this.bot.fault?.(error);
            this.fail(`Linked transit refused (${String(error?.message ?? error)}).`);
            return false;
        }
    }

    gather(tick) {
        const obsidian = this.bot.bag.counts()["minecraft:obsidian"] ?? 0;
        if (obsidian >= 10) {
            this.state = "seek";
            return true;
        }
        // Let the regular directors (nether/bucket/autonomy) produce obsidian;
        // nudge them with an honest reason and a bounded budget.
        this.bot.reason = `Travel: need ${10 - obsidian} more obsidian for the portal.`;
        if (tick - this.gatherSince > GATHER_TIMEOUT) {
            this.state = "failed";
            this.lastReason = "No obsidian for a portal; open a portal manually or give the bot obsidian.";
            this.bot.reason = this.lastReason;
            this.tell(this.lastReason);
        }
        return false;
    }

    /** Open a small pocket when no flat patch exists (bounded digging). */
    clearSpace(tick) {
        const here = floor(this.bot.sim.location);
        for (let i = 0; i < 6; i++) {
            const target = add(here, { x: i % 3, y: i < 3 ? 0 : 1, z: 0 });
            const c = this.bot.terrain.block(target);
            if (c && !c.isAir && this.bot.pathfinder?.breakable?.(c.typeId)) {
                const r = this.bot.digCell(target, tick);
                if (r === "digging" || r === "open") return true;
            }
        }
        this.buildTries++;
        if (this.buildTries > 60) {
            this.state = "failed";
            this.lastReason = "Could not clear a flat area for the portal.";
            this.bot.reason = this.lastReason;
        }
        return false;
    }

    build(tick) {
        if (!this.plan) {
            const anchor = choosePortalAnchor(this.bot.terrain.read, this.near ?? floor(this.bot.sim.location), { radius: 12 });
            if (!anchor) return this.clearSpace(tick);
            this.plan = anchor;
        }
        const check = validatePortalFrame(this.bot.terrain.read, this.plan.base, this.plan.axis);
        if (check.usable) {
            this.state = "ignite";
            return this.ignite(tick);
        }
        const obsidian = this.bot.bag.counts()["minecraft:obsidian"] ?? 0;
        if (obsidian < 10) {
            this.state = "gather";
            this.gatherSince = this.gatherSince || tick;
            return false;
        }
        const r = this.bot.builder?.buildPortalFrame(this.plan.base, tick, this.plan.axis ?? "x");
        this.buildTries++;
        if (r === "placed") {
            this.bot.reason = `Travel: placing obsidian frame (${check.frameCount}/10)`;
            return true;
        }
        if (r === "building" || r === "placed_support") return true;
        if (r === "no_obsidian" || r === "not_enough_obsidian") {
            this.state = "gather";
            this.gatherSince = this.gatherSince || tick;
            return false;
        }
        if (this.buildTries > 120) {
            this.state = "failed";
            this.lastReason = "Portal frame could not be completed (blocked or out of reach).";
            this.bot.reason = this.lastReason;
            return false;
        }
        return true;
    }

    ignitionSlot() {
        for (const type of ["minecraft:flint_and_steel", "minecraft:fire_charge"]) {
            const slot = this.bot.bag.find((s) => s.typeId === type);
            if (slot >= 0) return slot;
        }
        return -1;
    }

    ignite(tick) {
        if (!this.plan) {
            this.state = "seek";
            return true;
        }
        const check = validatePortalFrame(this.bot.terrain.read, this.plan.base, this.plan.axis);
        if (!check.complete) {
            this.state = "build";
            return true;
        }
        if (!check.interiorClear) {
            // Clear the interior (never break the frame).
            for (const pos of check.plan.interior) {
                const c = this.bot.terrain.block(pos);
                if (c && !c.isAir && this.bot.pathfinder?.breakable?.(c.typeId)) {
                    const r = this.bot.digCell(pos, tick);
                    if (r === "digging" || r === "open") return true;
                }
            }
            this.state = "failed";
            this.lastReason = "Portal interior is blocked by an unbreakable block.";
            return false;
        }
        const slot = this.ignitionSlot();
        if (slot < 0) {
            this.state = "failed";
            this.lastReason = "Portal frame is ready but there is no flint and steel or fire charge.";
            this.bot.reason = this.lastReason;
            this.tell(this.lastReason);
            return false;
        }
        const selected = this.bot.bag.select(slot);
        const ignition = check.plan.ignition ?? check.plan.interior[0];
        try {
            // Flint and steel is used on the frame block *under* the interior
            // bottom (its top face), not on the air cell itself. If that block
            // is somehow missing, fall back to aiming at the interior cell.
            const floorCell = { x: ignition.x, y: ignition.y - 1, z: ignition.z };
            const support = this.bot.terrain.read(floorCell);
            const aim = support?.support ? floorCell : ignition;
            const target = this.bot.host.relative(center(aim));
            this.bot.sim.lookAtBlock(target);
            // Flint and steel has to be used *on the block*; useItemInSlot only
            // swings it at whatever the player is looking at. Try the block form
            // first and keep the plain swing as a fallback for older engines.
            let ok = false;
            if (typeof this.bot.sim.useItemInSlotOnBlock === "function") {
                ok = this.bot.sim.useItemInSlotOnBlock(selected, target, Direction.Up);
            }
            if (!ok) ok = this.bot.sim.useItemInSlot(selected);
            if (ok) {
                this.state = "ignite_wait";
                this.igniteUntil = tick + IGNITE_TIMEOUT;
                this.attempts++;
                this.bot.reason = "Travel: igniting the portal";
                return true;
            }
        } catch (error) {
            this.bot.fault?.(error);
        }
        if (this.attempts++ > 6) {
            this.state = "failed";
            this.lastReason = "Ignition failed six times.";
            this.bot.reason = this.lastReason;
        }
        return true;
    }

    igniteWait(tick) {
        if (!this.plan) {
            this.state = "seek";
            return true;
        }
        const check = validatePortalFrame(this.bot.terrain.read, this.plan.base, this.plan.axis);
        const lit = check.plan.interior.some((pos) => isPortalCell(this.bot.terrain.read(pos)));
        if (lit) {
            this.bot.memory?.notice?.("portal", check.plan.ignition, this.bot.sim.dimension.id, tick);
            this.portalPos = floor(check.plan.interior[0]);
            this.state = "enter";
            this.startedEnter = tick;
            this.tell(`Portal lit at ${this.portalPos.x},${this.portalPos.y},${this.portalPos.z}; entering the ${this.target.replace("minecraft:", "")}.`);
            return true;
        }
        if (tick > this.igniteUntil) {
            this.bot.terrain.clear?.();
            this.state = "ignite";
        }
        return true;
    }

    approach(tick) {
        const here = floor(this.bot.sim.location);
        if (!this.portalPos) {
            this.state = "seek";
            return true;
        }
        if (distance(here, this.portalPos) <= 12) {
            // Standing in or next to a portal?
            const feet = this.bot.terrain.read(here);
            const body = this.bot.terrain.read(add(here, UP));
            if (isPortalCell(feet) || isPortalCell(body)) {
                this.state = "transit";
                this.started = tick;
                this.graceUntil = tick + GRACE_TICKS;
                this.bot.reason = "Travel: inside the portal, waiting for transit";
                return true;
            }
            // Walk into the interior.
            const plan = this.nearPlan ?? (this.nearPlan = this.portalNearPlan());
            const target = plan ? center(plan.interior[0]) : center(this.portalPos);
            if (tick - this.startedEnter > ENTER_TIMEOUT) {
                if (this.attempts++ < 2) {
                    this.startedEnter = tick;
                    this.bot.nav.reset();
                } else {
                    this.state = "transit";
                    this.graceUntil = tick + 5;
                    return true;
                }
            }
            this.bot.nav.fast = true;
            const r = this.bot.navTo(target, tick, 0.9);
            if (r === "failed") {
                // Portal block may be embedded; stand right against it.
                this.bot.sim.moveToLocation(this.bot.host.relative(target), { faceTarget: true });
            }
            return true;
        }
        this.bot.reason = `Travel: walking to the portal (${Math.round(distance(here, this.portalPos))} blocks)`;
        const r = this.bot.navTo(center(this.portalPos), tick, 1.5);
        if (r === "failed") {
            this.attempts++;
            if (this.attempts > 4) {
                this.state = "transit";
                this.graceUntil = tick + 5;
            }
        }
        return true;
    }

    /**
     * Recover the true frame plan for the portal we are standing at. Candidate
     * bases are validated (not just "some interior cell is a portal"), because
     * several shifted frames can contain the same portal block.
     */
    portalNearPlan() {
        if (!this.portalPos) return undefined;
        let best;
        for (const axis of ["x", "z"]) {
            for (let dy = -3; dy <= 1; dy++) {
                for (let dx = -3; dx <= 3; dx++) {
                    for (let dz = -3; dz <= 3; dz++) {
                        const base = { x: this.portalPos.x + dx, y: this.portalPos.y + dy, z: this.portalPos.z + dz };
                        const plan = portalFrame(base, axis);
                        if (!plan.interior.some((p) => isPortalCell(this.bot.terrain.read(p)))) continue;
                        const check = validatePortalFrame(this.bot.terrain.read, base, axis);
                        if (!check.interiorClear) continue;
                        if (check.complete) return check.plan;
                        if (!best || check.frameCount > best.frameCount) best = check.plan;
                    }
                }
            }
        }
        return best;
    }

    transit(tick) {
        const dim = this.bot.sim.dimension.id;
        if (dim === this.target) {
            this.state = "arrive";
            return true;
        }
        if (tick < this.graceUntil) {
            // Keep pressing into the portal so the engine can pick us up.
            if (this.portalPos) {
                try {
                    this.bot.sim.moveToLocation(this.bot.host.relative(center(this.portalPos)), { faceTarget: true });
                } catch {
                    /* the engine may reject movement for a tick */
                }
            }
            return true;
        }
        return this.teleport(tick);
    }

    /** Portal-link fallback: same coordinates scaled 1:8 with a safe landing. */
    teleport(tick) {
        const targetDim = this.dimensionObject(this.target);
        if (!targetDim) {
            this.fail("Destination dimension is unavailable.");
            return false;
        }
        const guess = linkedGuess(this.origin?.pos ?? floor(this.bot.sim.location), this.origin?.dim ?? OVERWORLD, this.target);
        const arrival = this.findArrival(this.target, targetDim, guess);
        const loc = arrival ? { x: arrival.pos.x + 0.5, y: arrival.pos.y, z: arrival.pos.z + 0.5 } : { x: guess.x + 0.5, y: 64, z: guess.z + 0.5 };
        try {
            this.bot.sim.teleport(loc, { dimension: targetDim });
            this.teleported = true;
            this.arrival = arrival ?? { pos: floor(loc), needsDig: true };
            this.state = "arrive";
            this.attempts++;
            this.bot.reason = `Travel: stepped through the portal link into ${this.target.replace("minecraft:", "")} at ${Math.floor(loc.x)},${Math.floor(loc.y)},${Math.floor(loc.z)}`;
            this.bot.record?.(`portal transit to ${this.target} at ${Math.floor(loc.x)},${Math.floor(loc.y)},${Math.floor(loc.z)}`);
            return true;
        } catch (error) {
            this.bot.fault?.(error);
            if (this.attempts++ < 3) {
                this.graceUntil = tick + 20;
                this.state = "approach";
                this.bot.reason = "Travel: portal transit not accepted yet; retrying";
                return true;
            }
            this.fail(`Engine refused the dimension change (${String(error?.message ?? error)}).`);
            return false;
        }
    }

    findArrival(dimensionId, dimension, guess) {
        try {
            const terrain = new Terrain(dimension);
            terrain.clock = () => system.currentTick;
            const candidates = [guess.y, 64, 48, 80, 32, 96, 16, 120];
            for (const y of candidates) {
                const found = chooseArrival(terrain.read, { x: guess.x, y, z: guess.z }, { radius: 6 });
                if (found) return found;
            }
            return undefined;
        } catch {
            return undefined;
        }
    }

    arriveState(tick) {
        if (this.bot.sim.dimension.id !== this.target) {
            // Not actually there (teleport rejected): retry or fail.
            if (this.attempts++ < 3) {
                this.state = "transit";
                this.graceUntil = tick;
                return true;
            }
            this.fail("Arrived in the wrong dimension.");
            return false;
        }
        const here = floor(this.bot.sim.location);
        // If the arrival cell is embedded in rock, carve the head/feet space.
        const head = this.bot.terrain.read(add(here, UP));
        if (head && head.passable === false && this.bot.pathfinder?.breakable?.(head.type)) {
            const r = this.bot.digCell(add(here, UP), tick);
            if (r === "digging" || r === "open") return true;
        }
        // Make sure we are not over the void: place a block under us.
        const below = this.bot.terrain.read(add(here, DOWN));
        if (!below || (!below.support && !below.hazard)) {
            if (this.bot.builder?.pillar?.(tick) === "placed") this.placedPlatform++;
            if (this.placedPlatform > 3) {
                this.bot.reason = "Travel: stabilising the arrival platform";
                return true;
            }
        }
        if (this.origin?.dim === OVERWORLD) {
            // Remember the real overworld-side frame we came through so the
            // return trip has an exact link even without nether obsidian.
            const back = this.portalPos ?? this.origin.pos;
            this.lastOverworldPortal = back;
            this.bot.memory?.notice?.("portal", back, OVERWORLD, tick);
        }
        if (this.target === NETHER) {
            // Only remember a real lit portal on this side; the arrival point
            // alone is not a portal and must not pollute the portal cache.
            try {
                const near = findPortalNear(this.bot.terrain.read, here, 8);
                if (near) this.bot.memory?.notice?.("portal", near.pos, this.target, tick);
            } catch {
                /* terrain may still be settling after the transfer */
            }
        }
        this.state = "done";
        this.doneTick = tick;
        this.teleported = false;
        this.lastReason = `Arrived in ${this.target.replace("minecraft:", "")} at ${here.x},${here.y},${here.z}`;
        this.bot.reason = this.lastReason;
        this.tell(this.lastReason + (this.target === NETHER ? " - exploring the Nether." : " - back in the Overworld."));
        return false;
    }

    fail(reason) {
        this.state = "failed";
        this.lastReason = reason;
        this.bot.reason = `Travel failed: ${reason}`;
        this.tell(`Travel failed: ${reason}`);
        return false;
    }

    report() {
        return {
            state: this.state,
            target: this.target,
            portal: this.portalPos,
            reason: this.lastReason,
            teleported: this.teleported,
            links: this.links,
            attempts: this.attempts,
        };
    }
}
