/**
 * Parkour module - advanced movement: jumps, sprints, climbs, bridging.
 */
import { floor, add, center, distance, key, horizontal } from "../core/math.js";
import { CARDINAL, UP, DOWN } from "../core/math.js";

export class Parkour {
    constructor(bot) {
        this.bot = bot;
        this.sim = bot.sim;
        this.terrain = bot.terrain;
        this.host = bot.host;
        this.lastJump = 0;
    }

    /**
     * Check if a 1-block gap jump is possible from p in dir.
     */
    canJumpGap(p, dir) {
        const gap = add(p, dir);
        const land = add(gap, dir);
        if (!this.terrain.safe(land)) return false;
        if (!this.terrain.empty(gap) || !this.terrain.empty(add(gap, UP))) return false;
        if (!this.terrain.empty(add(p, { x:0, y:2, z:0 }))) return false;
        if (!this.terrain.empty(add(land, { x:0, y:2, z:0 }))) return false;
        // Check no hazard below gap
        const belowGap = add(gap, DOWN);
        const b = this.terrain.block(belowGap);
        if (b && (b.isLiquid || /lava|fire|magma|cactus/.test(b.typeId))) return false;
        return true;
    }

    /**
     * Check if a 1-up step is possible (jump onto higher block)
     */
    canStepUp(p, dir) {
        const forward = add(p, dir);
        const up = add(forward, UP);
        if (!this.terrain.safe(up)) return false;
        if (!this.terrain.empty(forward) || !this.terrain.empty(add(forward, UP))) {
            // Need headroom
            const fBlock = this.terrain.block(forward);
            const headBlock = this.terrain.block(add(forward, UP));
            if (fBlock && !fBlock.isAir) return false;
            if (headBlock && !headBlock.isAir) return false;
        }
        return true;
    }

    /**
     * Execute a jump in direction.
     */
    jump(dir, tick) {
        if (tick - this.lastJump < 10) return false;
        if (!this.sim.isOnGround) return false;
        this.sim.jump();
        this.lastJump = tick;
        const target = add(floor(this.sim.location), dir);
        this.sim.moveToLocation(this.host.relative(center(target)), { faceTarget: true });
        return true;
    }

    /**
     * Sprint jump for 2-block gap.
     */
    sprintJump(dir, tick) {
        if (!this.sim.isOnGround) return false;
        this.sim.isSprinting = true;
        this.sim.jump();
        this.lastJump = tick;
        const p = floor(this.sim.location);
        const target = add(add(p, dir), dir);
        this.sim.moveToLocation(this.host.relative(center(target)), { faceTarget: true });
        return true;
    }

    /**
     * Climb ladder/vine if nearby.
     */
    climbIfNeeded(tick) {
        const p = floor(this.sim.location);
        for (const d of [...CARDINAL, UP, DOWN]) {
            const q = add(p, d);
            const b = this.terrain.block(q);
            if (!b) continue;
            if (/ladder|vine|scaffolding/.test(b.typeId)) {
                // Move towards it
                this.sim.moveToLocation(this.host.relative(center(q)), { faceTarget: true });
                if (d.y === 1) this.sim.jump();
                return true;
            }
        }
        return false;
    }

    /**
     * Bridge assist: if gap ahead, place block.
     */
    bridgeIfNeeded(dir, tick) {
        const p = floor(this.sim.location);
        const forward = add(p, dir);
        const belowForward = add(forward, DOWN);
        const belowBlock = this.terrain.block(belowForward);
        if (!belowBlock || belowBlock.isAir) {
            // Need bridge
            if (this.bot.builder) {
                const r = this.bot.builder.bridge(dir, tick);
                return r === "placed";
            }
        }
        return false;
    }

    /**
     * Auto parkour along path: check next waypoint and apply parkour if needed.
     */
    assist(waypoint, tick) {
        if (!this.bot.settings.parkour) return false;
        const p = floor(this.sim.location);
        const dx = waypoint.x - p.x;
        const dz = waypoint.z - p.z;
        const dir = { x: Math.sign(dx), y: 0, z: Math.sign(dz) };
        if (dir.x === 0 && dir.z === 0) return false;

        // Check gap
        if (this.canJumpGap(p, dir)) {
            return this.jump(dir, tick);
        }
        // Check step up
        if (waypoint.y > p.y && this.canStepUp(p, dir)) {
            return this.jump(dir, tick);
        }
        return false;
    }
}
