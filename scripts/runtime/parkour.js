/**
 * World-class Parkour - amazing parkour, bridging up horizontal diagonal arbitrary
 * depends on terrain and goal. Handles 1-gap, 2-gap, 3-gap, jump-up, drop, ladder, vine, scaffold.
 * Integrates with builder for arbitrary bridging.
 */
import { floor, add, center, distance, key, horizontal } from "../core/math.js";
import { CARDINAL, UP, DOWN, COMPASS } from "../core/math.js";
import { parkourPlan, bridgingPlan } from "../core/world-awareness.js";
import { isPassable } from "../core/blocks.js";

export class Parkour {
    constructor(bot) {
        this.bot = bot;
        this.sim = bot.sim;
        this.terrain = bot.terrain;
        this.host = bot.host;
        this.builder = bot.builder;
        this.lastJump = 0;
        this.lastBridge = 0;
        this.failCount = 0;
        this.lastGoal = undefined;
    }

    reset() {
        this.failCount = 0;
        this.lastGoal = undefined;
    }

    canJumpGap(p, dir, gapSize = 1) {
        // gapSize 1 = 1 block gap, 2 = 2 blocks etc
        for (let i = 1; i <= gapSize; i++) {
            const gap = add(p, { x: dir.x * i, y: 0, z: dir.z * i });
            if (!this.terrain.empty(gap) || !this.terrain.empty(add(gap, UP))) return false;
            const belowGap = add(gap, DOWN);
            const b = this.terrain.block(belowGap);
            if (b && (b.isLiquid || /lava|fire|magma|cactus|powder_snow/.test(b.typeId))) return false;
        }
        const land = add(p, { x: dir.x * (gapSize + 1), y: 0, z: dir.z * (gapSize + 1) });
        if (!this.terrain.safe(land)) return false;
        if (!this.terrain.empty(add(p, { x:0, y:2, z:0 }))) return false;
        if (!this.terrain.empty(add(land, { x:0, y:2, z:0 }))) return false;
        return true;
    }

    canStepUp(p, dir) {
        const forward = add(p, dir);
        const up = add(forward, UP);
        if (!this.terrain.safe(up)) return false;
        const fBlock = this.terrain.block(forward);
        if (fBlock && !fBlock.isAir && !isPassable(fBlock.typeId)) return false;
        const headBlock = this.terrain.block(add(forward, UP));
        if (headBlock && !headBlock.isAir && !isPassable(headBlock.typeId)) {
            // Need headroom
            const head2 = this.terrain.block(add(forward, { x:0, y:2, z:0 }));
            if (head2 && !head2.isAir && !isPassable(head2.typeId)) return false;
        }
        return true;
    }

    canDrop(p, dir, dropHeight = 3) {
        // Safe drop: check landing safe within dropHeight
        for (let d = 1; d <= dropHeight; d++) {
            const below = add(add(p, dir), { x:0, y:-d, z:0 });
            if (this.terrain.safe(below)) return { safe: true, land: below, height: d };
            const b = this.terrain.block(below);
            if (b && (b.isLiquid || /water/.test(b.typeId))) return { safe: true, land: below, height: d, water: true };
        }
        return { safe: false };
    }

    canDiagonal(p, dir) {
        // Diagonal: x and z both non-zero
        if (dir.x === 0 || dir.z === 0) return false;
        const diag = add(p, dir);
        const belowDiag = add(diag, DOWN);
        // Need support at x and z steps
        const xStep = add(p, { x: dir.x, y: 0, z: 0 });
        const zStep = add(p, { x: 0, y: 0, z: dir.z });
        const xSafe = this.terrain.safe(xStep) || this.terrain.safe(add(xStep, DOWN)) || this.terrain.solid(add(xStep, DOWN));
        const zSafe = this.terrain.safe(zStep) || this.terrain.safe(add(zStep, DOWN)) || this.terrain.solid(add(zStep, DOWN));
        // Diagonal needs at least one side solid for support
        return xSafe || zSafe;
    }

    jump(dir, tick) {
        if (tick - this.lastJump < 10) return false;
        if (!this.sim.isOnGround) return false;
        this.sim.jump();
        this.lastJump = tick;
        const target = add(floor(this.sim.location), dir);
        this.sim.moveToLocation(this.host.relative(center(target)), { faceTarget: true });
        return true;
    }

    sprintJump(dir, tick) {
        if (!this.sim.isOnGround) return false;
        this.sim.isSprinting = true;
        this.sim.jump();
        this.lastJump = tick;
        const p = floor(this.sim.location);
        // For gapSize, jump further
        const dist = Math.hypot(dir.x, dir.z);
        const target = add(p, { x: dir.x * Math.ceil(dist), y: dir.y, z: dir.z * Math.ceil(dist) });
        this.sim.moveToLocation(this.host.relative(center(target)), { faceTarget: true });
        return true;
    }

    climbIfNeeded(tick) {
        const p = floor(this.sim.location);
        for (const d of [...CARDINAL, UP, DOWN, ...COMPASS]) {
            const q = add(p, d);
            const b = this.terrain.block(q);
            if (!b) continue;
            if (/ladder|vine|scaffolding|weeping_vines|twisting_vines/.test(b.typeId)) {
                this.sim.moveToLocation(this.host.relative(center(q)), { faceTarget: true });
                if (d.y === 1) this.sim.jump();
                return true;
            }
        }
        return false;
    }

    /**
     * Arbitrary bridging: horizontal, diagonal, up depending on terrain and goal.
     */
    bridgeToGoal(goal, tick) {
        const from = floor(this.sim.location);
        const to = floor(goal);
        const plan = bridgingPlan(from, to, {});

        if (plan.type === "pillar_up") {
            if (this.builder) {
                const r = this.builder.pillar(tick);
                if (r === "placed" || r === "jumping") return true;
            }
        }
        if (plan.type === "bridge_horizontal" || plan.type === "bridge_diagonal") {
            if (this.builder && this.builder.canBuild) {
                if (tick - this.lastBridge < 20) return false;
                const dir = { x: Math.sign(plan.dx), y: 0, z: Math.sign(plan.dz) };
                const r = this.builder.bridge(dir, tick);
                if (r === "placed") {
                    this.lastBridge = tick;
                    return true;
                }
            }
        }
        return false;
    }

    bridgeIfNeeded(dir, tick) {
        const p = floor(this.sim.location);
        const forward = add(p, dir);
        const belowForward = add(forward, DOWN);
        const belowBlock = this.terrain.block(belowForward);
        if (!belowBlock || belowBlock.isAir || belowBlock.isLiquid || isPassable(belowBlock.typeId)) {
            if (this.bot.builder && this.bot.builder.canBuild) {
                if (tick - this.lastBridge < 15) return false;
                const r = this.bot.builder.bridge(dir, tick);
                if (r === "placed") {
                    this.lastBridge = tick;
                    return true;
                }
            }
        }
        return false;
    }

    /**
     * Amazing parkour assist: analyzes waypoint and applies best movement.
     * Handles gaps, step-up, diagonal, drop, climb.
     */
    assist(waypoint, tick) {
        if (!this.bot.settings.parkour) return false;
        const p = floor(this.sim.location);
        const dx = waypoint.x - p.x;
        const dy = waypoint.y - p.y;
        const dz = waypoint.z - p.z;
        const hDist = Math.hypot(dx, dz);
        const dir = { x: Math.sign(dx), y: Math.sign(dy), z: Math.sign(dz) };
        if (dir.x === 0 && dir.z === 0 && dir.y === 0) return false;

        // If goal far, use bridging plan
        if (hDist > 3 || Math.abs(dy) > 2) {
            if (this.bridgeToGoal(waypoint, tick)) return true;
        }

        // Diagonal handling
        if (dir.x !== 0 && dir.z !== 0) {
            if (this.canDiagonal(p, dir)) {
                // Try diagonal walk, if gap then bridge diagonal
                if (hDist > 1.5) {
                    if (this.bridgeIfNeeded(dir, tick)) return true;
                }
            }
        }

        // Horizontal gaps
        if (dy === 0 || Math.abs(dy) <= 1) {
            if (hDist > 1 && hDist <= 2.5 && this.canJumpGap(p, dir, 1)) {
                return this.jump(dir, tick);
            }
            if (hDist > 2.5 && hDist <= 4 && this.canJumpGap(p, { x: dir.x, y: 0, z: dir.z }, 2)) {
                return this.sprintJump({ x: dir.x * 2, y: 0, z: dir.z * 2 }, tick);
            }
            if (hDist > 1 && this.bridgeIfNeeded(dir, tick)) return true;
        }

        // Step up
        if (dy >= 1 && dy <= 2 && hDist <= 1.5) {
            if (this.canStepUp(p, dir)) {
                return this.jump(dir, tick);
            }
        }

        // Ascend gap (up + forward)
        if (dy === 1 && hDist > 1 && hDist <= 3) {
            if (this.canStepUp(p, dir) && this.canJumpGap(p, dir, 1)) {
                return this.sprintJump(dir, tick);
            }
        }

        // Drop
        if (dy < 0) {
            const drop = this.canDrop(p, dir, 6);
            if (drop.safe) {
                // If water, just walk off, else check safe
                if (drop.water || drop.height <= 3) {
                    this.sim.moveToLocation(this.host.relative(center(drop.land)), { faceTarget: true });
                    return true;
                }
                // For higher drops, try water clutch if have bucket
                if (drop.height > 3 && drop.height <= 12) {
                    const waterSlot = this.bot.bag.find(s => s.typeId === "minecraft:water_bucket");
                    if (waterSlot >= 0) {
                        // Water clutch - will be handled by escape
                        return false;
                    }
                }
            }
        }

        // Climb
        if (this.climbIfNeeded(tick)) return true;

        return false;
    }

    /**
     * Arbitrary parkour to goal: decides best sequence of moves.
     */
    planToGoal(goal, tick) {
        const from = floor(this.sim.location);
        const to = floor(goal);
        const pPlan = parkourPlan(from, to, {});
        const bPlan = bridgingPlan(from, to, {});

        return { parkour: pPlan, bridge: bPlan, from, to };
    }

    // Water clutch for big drops
    waterClutch(tick) {
        const slot = this.bot.bag.find(s => s.typeId === "minecraft:water_bucket");
        if (slot < 0) return false;
        const selected = this.bot.bag.select(slot);
        try {
            const p = floor(this.sim.location);
            const below = add(p, DOWN);
            this.sim.lookAtBlock(this.host.relative(center(below)));
            return this.sim.useItemInSlot(selected);
        } catch {
            return false;
        }
    }
}
