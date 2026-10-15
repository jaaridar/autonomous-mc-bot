/**
 * World-class Builder: arbitrary bridging (horizontal, diagonal, up, down, any direction)
 * depends on terrain and goal. Never fails due to obstructing blocks without detection.
 * Handles: scaffold, pillar, bridge, wall, bunker, low-roof for enderman, portal frame.
 * Knows every block and best use in situation.
 */
import { floor, center, add, distance, key, UP, DOWN } from "../core/math.js";
import { Direction } from "@minecraft/server";
import { isPassable, isSolid, isFalling, isLiquid, isHazard, isUnbreakable } from "../core/blocks.js";
import { getBlockInfo, bestFor, retainScore } from "../core/knowledge.js";
import { bridgingPlan } from "../core/world-awareness.js";

const FACES = new Map([
    ["1,0,0", Direction.East],
    ["-1,0,0", Direction.West],
    ["0,0,1", Direction.South],
    ["0,0,-1", Direction.North],
    ["0,1,0", Direction.Up],
    ["0,-1,0", Direction.Down],
]);
const faceFor = (d) => FACES.get(`${d.x},${d.y},${d.z}`);

const BUILD_BLOCKS_PRIORITY = [
    // Best bridging: cobble, stone, deepslate - blast resistant, not falling, not valuable
    "minecraft:cobblestone","minecraft:cobbled_deepslate","minecraft:stone","minecraft:deepslate",
    "minecraft:netherrack","minecraft:dirt","minecraft:coarse_dirt","minecraft:mud",
    "minecraft:oak_planks","minecraft:birch_planks","minecraft:spruce_planks","minecraft:jungle_planks",
    "minecraft:gravel","minecraft:sand" // falling last resort
];

const SCAFFOLD_BLOCKS = [
    "minecraft:dirt","minecraft:coarse_dirt","minecraft:netherrack","minecraft:cobblestone","minecraft:gravel","minecraft:sand"
];

export class Builder {
    constructor(bot) {
        this.bot = bot;
        this.sim = bot.sim;
        this.bag = bot.bag;
        this.terrain = bot.terrain;
        this.host = bot.host;
        this.lastPlace = 0;
        this.bridging = undefined;
        this.pillaring = undefined;
        this.scaffold = [];
        this.placeAttempts = 0;
        this.lastTarget = undefined;
    }

    get canBuild() {
        return this.findBuildSlot() >= 0;
    }

    countBlocks() {
        let total = 0;
        for (let i = 0; i < this.bag.size; i++) {
            const s = this.bag.get(i);
            if (!s) continue;
            const info = getBlockInfo(s.typeId);
            if (info.build !== undefined || BUILD_BLOCKS_PRIORITY.includes(s.typeId) || s.typeId.includes("_planks") || s.typeId.includes("cobble") || s.typeId === "minecraft:dirt") {
                total += s.amount;
            }
        }
        return total;
    }

    findBuildSlot(preferred, allowFalling = false) {
        if (preferred) {
            const idx = this.bag.find(s => s.typeId === preferred);
            if (idx >= 0) return idx;
        }
        for (const type of BUILD_BLOCKS_PRIORITY) {
            if (!allowFalling && (type === "minecraft:sand" || type === "minecraft:gravel")) continue;
            const idx = this.bag.find(s => s.typeId === type);
            if (idx >= 0) return idx;
        }
        // Any buildable
        const idx = this.bag.buildBlock();
        if (idx >= 0) {
            const s = this.bag.get(idx);
            if (!allowFalling && s && (s.typeId.includes("sand") || s.typeId.includes("gravel"))) {
                // try next
                for (let i = idx+1; i < this.bag.size; i++) {
                    const s2 = this.bag.get(i);
                    if (s2 && !s2.typeId.includes("sand") && !s2.typeId.includes("gravel")) {
                        const info = getBlockInfo(s2.typeId);
                        if (info.build !== undefined || s2.typeId.includes("planks") || s2.typeId.includes("cobble") || s2.typeId === "minecraft:dirt") return i;
                    }
                }
            }
            return idx;
        }
        return -1;
    }

    /**
     * Place a block at target using anchor as support.
     * Enhanced: checks every direction, handles arbitrary placement.
     */
    placeAt(target, anchor, options = {}) {
        const anchorBlock = this.terrain.block(anchor);
        if (!anchorBlock || !anchorBlock.isSolid) {
            // Try to find alternative anchor nearby target
            if (options.autoAnchor) {
                const alt = this.findSupportFor(target);
                if (alt) {
                    anchor = alt.pos;
                } else {
                    return "no-support";
                }
            } else {
                return "no-support";
            }
        }
        const targetBlock = this.terrain.block(target);
        if (targetBlock && !targetBlock.isAir && !isPassable(targetBlock.typeId)) {
            if (options.replace) {
                // Need to break first
                return "occupied";
            }
            return "occupied";
        }
        if (!options.allowHazard) {
            if (this.terrain.lavaNear(target)) return "hazard_lava";
            if (targetBlock && isHazard(targetBlock.typeId)) return "hazard";
        }
        // Check if anchor is stable (not falling block that will fall)
        if (anchorBlock && isFalling(anchorBlock.typeId)) {
            const belowAnchor = add(anchor, DOWN);
            if (!this.terrain.solid(belowAnchor)) return "unstable_anchor";
        }

        const dir = { x: target.x - anchor.x, y: target.y - anchor.y, z: target.z - anchor.z };
        // Must be adjacent (Manhattan 1)
        if (Math.abs(dir.x) + Math.abs(dir.y) + Math.abs(dir.z) !== 1) return "not_adjacent";
        const face = faceFor(dir);
        if (!face) return "rejected";

        const allowFalling = options.allowFalling ?? false;
        const slot = this.findBuildSlot(options.blockType, allowFalling);
        if (slot < 0) return "no-block";

        const selected = this.bag.select(slot);
        try {
            if (options.sneak) this.sim.isSneaking = true;
            this.sim.lookAtBlock(this.host.relative(center(anchor)));
            const ok = this.sim.useItemInSlotOnBlock(selected, this.host.relative(center(anchor)), face);
            this.lastPlace = Date.now();
            this.placeAttempts = 0;
            this.lastTarget = { ...target };
            return ok ? "placed" : "rejected";
        } catch (e) {
            this.placeAttempts++;
            return "rejected";
        }
    }

    findSupportFor(target) {
        const neighbors = [
            { pos: add(target, { x: 1, y: 0, z: 0 }), dir: { x: -1, y: 0, z: 0 } },
            { pos: add(target, { x: -1, y: 0, z: 0 }), dir: { x: 1, y: 0, z: 0 } },
            { pos: add(target, { x: 0, y: 0, z: 1 }), dir: { x: 0, y: 0, z: -1 } },
            { pos: add(target, { x: 0, y: 0, z: -1 }), dir: { x: 0, y: 0, z: 1 } },
            { pos: add(target, { x: 0, y: -1, z: 0 }), dir: { x: 0, y: 1, z: 0 } },
            { pos: add(target, { x: 0, y: 1, z: 0 }), dir: { x: 0, y: -1, z: 0 } },
        ];
        for (const n of neighbors) {
            const b = this.terrain.block(n.pos);
            if (b && b.isSolid && !isFalling(b.typeId)) {
                return n;
            }
        }
        // Fallback to any solid including falling
        for (const n of neighbors) {
            const b = this.terrain.block(n.pos);
            if (b && b.isSolid) return n;
        }
        return null;
    }

    /**
     * Arbitrary bridging: horizontal, diagonal, or any direction depending on terrain and goal.
     * Goal-aware: analyzes from->to, builds path with support checks.
     */
    bridgeTo(goal, tick) {
        const from = floor(this.sim.location);
        const to = floor(goal);
        const plan = bridgingPlan(from, to, {});
        return this.executeBridgePlan(plan, to, tick);
    }

    /**
     * Bridge in direction - enhanced to handle diagonal.
     * dir can be {x, z} or {x,y,z}. Handles arbitrary.
     */
    bridge(dir, tick) {
        const p = floor(this.sim.location);
        // Normalize dir
        const norm = { x: Math.sign(dir.x || 0), y: Math.sign(dir.y || 0), z: Math.sign(dir.z || 0) };
        // If diagonal (both x and z non-zero), need to handle L-shaped bridging
        if (norm.x !== 0 && norm.z !== 0) {
            return this.bridgeDiagonal(norm, tick);
        }
        if (norm.y !== 0) {
            return norm.y > 0 ? this.pillar(tick) : this.bridgeDown(tick);
        }
        // Horizontal
        return this.bridgeHorizontal(norm, tick);
    }

    bridgeHorizontal(dir, tick) {
        const p = floor(this.sim.location);
        const forward = add(p, dir);
        const belowForward = add(forward, DOWN);

        const belowBlock = this.terrain.block(belowForward);
        if (!belowBlock || belowBlock.isAir || isLiquid(belowBlock.typeId) || isPassable(belowBlock.typeId)) {
            // Need to place at belowForward
            const support = this.findSupportFor(belowForward);
            if (!support) return "no-support";
            const r = this.placeAt(belowForward, support.pos, { sneak: true, autoAnchor: true });
            return r;
        }
        return "solid";
    }

    bridgeDiagonal(dir, tick) {
        // Diagonal: need to place two blocks to make L, or one if we can place diagonally via support
        const p = floor(this.sim.location);
        // Try x first then z
        const xStep = { x: dir.x, y: 0, z: 0 };
        const zStep = { x: 0, y: 0, z: dir.z };

        // Check if x step is solid
        const xForward = add(p, xStep);
        const belowX = add(xForward, DOWN);
        const belowXBlock = this.terrain.block(belowX);
        const xSolid = belowXBlock && belowXBlock.isSolid;

        const zForward = add(p, zStep);
        const belowZ = add(zForward, DOWN);
        const belowZBlock = this.terrain.block(belowZ);
        const zSolid = belowZBlock && belowZBlock.isSolid;

        // Place the missing one
        if (!xSolid) {
            const r = this.bridgeHorizontal(xStep, tick);
            if (r === "placed") return "placed";
        }
        if (!zSolid) {
            const r = this.bridgeHorizontal(zStep, tick);
            if (r === "placed") return "placed";
        }

        // Now diagonal gap
        const diagForward = add(p, dir);
        const belowDiag = add(diagForward, DOWN);
        const belowDiagBlock = this.terrain.block(belowDiag);
        if (!belowDiagBlock || belowDiagBlock.isAir || isLiquid(belowDiagBlock.typeId)) {
            const support = this.findSupportFor(belowDiag);
            if (!support) {
                // Need to place x or z first as support
                if (!xSolid) return this.bridgeHorizontal(xStep, tick);
                if (!zSolid) return this.bridgeHorizontal(zStep, tick);
                return "no-support";
            }
            return this.placeAt(belowDiag, support.pos, { sneak: true });
        }
        return "solid";
    }

    bridgeDown(tick) {
        // Descend: place blocks to make safe descent or find ground
        const p = floor(this.sim.location);
        const below = add(p, DOWN);
        const belowBlock = this.terrain.block(below);
        if (belowBlock && belowBlock.isSolid) return "solid";
        // Need to place below if gap
        const support = this.findSupportFor(below);
        if (!support) return "no-support";
        return this.placeAt(below, support.pos, { sneak: true });
    }

    executeBridgePlan(plan, goal, tick) {
        switch (plan.type) {
            case "pillar_up":
                return this.pillar(tick);
            case "bridge_horizontal":
                return this.bridgeHorizontal({ x: Math.sign(plan.dx), y: 0, z: Math.sign(plan.dz) }, tick);
            case "bridge_diagonal":
                return this.bridgeDiagonal({ x: Math.sign(plan.dx), y: 0, z: Math.sign(plan.dz) }, tick);
            case "descend":
                return this.bridgeDown(tick);
            default:
                return "solid";
        }
    }

    /**
     * Pillar up: world-class - jump, place, sneak, with scaffold awareness.
     * Retains important blocks, uses scaffold blocks first.
     */
    pillar(tick) {
        const p = floor(this.sim.location);
        if (!this.pillaring) {
            this.pillaring = { startY: p.y, col: { x: p.x, z: p.z }, since: tick, placed: 0, lastJump: 0 };
        }
        const state = this.pillaring;
        // For 100 block tower, allow much longer - 3000 ticks = 150 sec for 100 blocks
        if (tick - state.since > 3000) {
            this.resetPillar();
            return "timeout";
        }

        const below = add(p, DOWN);
        const belowBlock = this.terrain.block(below);

        // If we have solid below, jump and place under
        if (belowBlock && belowBlock.isSolid) {
            if (this.sim.isOnGround) {
                if (tick - state.lastJump > 10) {
                    this.sim.jump();
                    state.lastJump = tick;
                }
                return "jumping";
            } else {
                // Airborne, place at previous feet
                const anchor = add(below, DOWN);
                const anchorBlock = this.terrain.block(anchor);
                if (!anchorBlock || !anchorBlock.isSolid) {
                    // Need to place anchor first? Actually below is solid, anchor is below that
                    // We want to place at below? No, we already have below solid.
                    // We want to place where we jumped from, which is below
                    // But below is already solid, so we need to place one higher? Let's re-evaluate.
                    // Standard pillar: jump, place block at feet position (which becomes below after jump)
                    // Actually after jump, feet is empty, so place at below
                    // But below is already solid before jump, so we need to place at current feet after landing?
                    // Simplified: if on ground, jump, else try place at below
                }
                // Try place at below (feet)
                const r = this.placeAt(below, anchor, { sneak: true, autoAnchor: true });
                if (r === "placed") {
                    state.placed++;
                    state.startY = p.y;
                    return "placed";
                }
                return r;
            }
        } else {
            // No support, need to place at below
            const anchor = add(below, DOWN);
            // Find support for below
            const support = this.findSupportFor(below);
            if (!support) {
                // No support at all, need to place at anchor first?
                // If anchor is air, we can't pillar from mid-air, need to land
                return "no-support";
            }
            const r = this.placeAt(below, support.pos, { sneak: true });
            if (r === "placed") {
                state.placed++;
                return "placed";
            }
            return r;
        }
    }

    resetPillar() {
        this.pillaring = undefined;
        try { this.sim.isSneaking = false; } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }
    }

    /**
     * Build arbitrary structure: wall, bunker, low-roof for enderman.
     */
    buildWall(at, direction, length, height, tick) {
        // Build wall length blocks in direction, height high
        const results = [];
        for (let l = 0; l < length; l++) {
            for (let h = 0; h < height; h++) {
                const pos = add(at, { x: direction.x * l, y: h, z: direction.z * l });
                if (this.terrain.empty(pos)) {
                    const support = this.findSupportFor(pos);
                    if (!support) continue;
                    const r = this.placeAt(pos, support.pos, { sneak: true });
                    results.push(r);
                    if (r === "placed") return "placed";
                }
            }
        }
        return results.includes("placed") ? "placed" : "no-place";
    }

    buildLowRoof(centerPos, tick) {
        // Enderman: 2-high roof, enderman is 3 tall can't enter
        const roof = add(centerPos, { x: 0, y: 2, z: 0 });
        if (!this.terrain.empty(roof)) return "occupied";
        // Need support: adjacent block at y+1
        const supports = [
            add(centerPos, { x: 1, y: 1, z: 0 }),
            add(centerPos, { x: -1, y: 1, z: 0 }),
            add(centerPos, { x: 0, y: 1, z: 1 }),
            add(centerPos, { x: 0, y: 1, z: -1 }),
        ];
        for (const sup of supports) {
            if (this.terrain.solid(sup)) {
                const r = this.placeAt(roof, sup, { sneak: true });
                if (r === "placed") return "placed";
            } else if (this.terrain.empty(sup)) {
                // Need to place support first
                const belowSup = add(sup, DOWN);
                if (this.terrain.solid(belowSup)) {
                    const r1 = this.placeAt(sup, belowSup, { sneak: true });
                    if (r1 === "placed") return "placed_support";
                }
            }
        }
        return "no-support";
    }

    buildBunker(centerPos, tick, withRoof = true) {
        // 3x3x2 bunker with roof
        const p = floor(centerPos);
        const walls = [
            add(p, { x: 1, y: 0, z: 0 }), add(p, { x: -1, y: 0, z: 0 }),
            add(p, { x: 0, y: 0, z: 1 }), add(p, { x: 0, y: 0, z: -1 }),
            add(p, { x: 1, y: 1, z: 0 }), add(p, { x: -1, y: 1, z: 0 }),
            add(p, { x: 0, y: 1, z: 1 }), add(p, { x: 0, y: 1, z: -1 }),
        ];
        const roof = add(p, { x: 0, y: 2, z: 0 });

        for (const wall of walls) {
            if (this.terrain.empty(wall)) {
                const support = this.findSupportFor(wall);
                if (!support) continue;
                const r = this.placeAt(wall, support.pos, { sneak: true });
                if (r === "placed") return "placed";
            }
        }
        if (withRoof && this.terrain.empty(roof)) {
            const support = this.findSupportFor(roof);
            if (support) {
                const r = this.placeAt(roof, support.pos, { sneak: true });
                if (r === "placed") return "placed_roof";
            }
        }
        return "done_or_no_support";
    }

    /**
     * Clear obstructing blocks to reach target below - world-class detection.
     * Returns list of cells to break, with reason.
     */
    clearBelow(target) {
        const p = floor(this.sim.location);
        const toBreak = [];
        if (target.x === p.x && target.z === p.z && target.y < p.y) {
            for (let y = p.y - 1; y > target.y; y--) {
                const cell = { x: p.x, y, z: p.z };
                const b = this.terrain.block(cell);
                if (b && !b.isAir && !isPassable(b.typeId)) {
                    if (isUnbreakable(b.typeId)) continue;
                    toBreak.push({ pos: cell, type: b.typeId, reason: "obstructing_below" });
                }
            }
        } else {
            // Arbitrary: check line from p to target
            const obstruct = this.terrain.findObstructions(p, target);
            for (const ob of obstruct) {
                const b = this.terrain.block(ob);
                if (b && !b.isAir && !isPassable(b.typeId) && !isUnbreakable(b.typeId)) {
                    toBreak.push({ pos: ob, type: b.typeId, reason: "obstructing_line" });
                }
            }
        }
        return toBreak;
    }

    scaffoldTo(target, tick) {
        const p = floor(this.sim.location);
        const dy = target.y - p.y;
        // FIX: tree logs up to 6 high don't need scaffold/pillar, direct break
        if (this.bot?.mining?.treeMode && dy <= 6) return "close";
        if (dy <= 2) return "close";
        return this.pillar(tick);
    }

    placeTorch(support) {
        if (!this.terrain.solid(support)) return false;
        const slot = this.bag.find(s => s.typeId === "minecraft:torch");
        if (slot < 0) return false;
        const selected = this.bag.select(slot);
        try {
            this.sim.lookAtBlock(this.host.relative(center(support)));
            return this.sim.useItemInSlotOnBlock(selected, this.host.relative(center(support)), Direction.Up);
        } catch {
            return false;
        }
    }

    /**
     * Build nether portal frame - 10 minimum obsidian.
     * Returns status.
     */
    buildPortalFrame(basePos, tick) {
        // Portal: 4 wide, 5 high, corners optional (10 min)
        const obsidianSlot = this.bag.find(s => s.typeId === "minecraft:obsidian");
        if (obsidianSlot < 0) return "no_obsidian";

        // Check if we have 10 obsidian
        let count = 0;
        for (let i = 0; i < this.bag.size; i++) {
            const s = this.bag.get(i);
            if (s && s.typeId === "minecraft:obsidian") count += s.amount;
        }
        if (count < 10) return "not_enough_obsidian";

        // Build frame: bottom 4, sides 3 each, top 4 = 10 with no corners? Actually 10 min includes corners? Let's build 4x5 hollow
        const frame = [];
        // Bottom
        for (let x = 0; x < 4; x++) frame.push(add(basePos, { x, y: 0, z: 0 }));
        // Sides
        for (let y = 1; y < 4; y++) {
            frame.push(add(basePos, { x: 0, y, z: 0 }));
            frame.push(add(basePos, { x: 3, y, z: 0 }));
        }
        // Top
        for (let x = 0; x < 4; x++) frame.push(add(basePos, { x, y: 4, z: 0 }));

        for (const pos of frame) {
            if (this.terrain.empty(pos) || isPassable(this.terrain.block(pos)?.typeId)) {
                const support = this.findSupportFor(pos);
                if (!support) continue;
                const r = this.placeAt(pos, support.pos, { sneak: true, blockType: "minecraft:obsidian" });
                if (r === "placed") return "placed";
            }
        }
        return "building";
    }
}
