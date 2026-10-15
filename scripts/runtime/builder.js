/**
 * Builder: bridging, pillaring, scaffolding, placing.
 * Handles all block placement with verification and robust bridging.
 */
import { floor, center, add, distance, key } from "../core/math.js";
import { Direction } from "@minecraft/server";
import { isPassable, isSolid, isFalling, isLiquid, isHazard, isUnbreakable } from "../core/blocks.js";

const FACES = new Map([
    ["1,0,0", Direction.East],
    ["-1,0,0", Direction.West],
    ["0,0,1", Direction.South],
    ["0,0,-1", Direction.North],
    ["0,1,0", Direction.Up],
    ["0,-1,0", Direction.Down],
]);
const faceFor = (d) => FACES.get(`${d.x},${d.y},${d.z}`);

const BUILD_BLOCKS = [
    "minecraft:cobblestone","minecraft:cobbled_deepslate","minecraft:stone","minecraft:deepslate",
    "minecraft:dirt","minecraft:coarse_dirt","minecraft:gravel","minecraft:sand","minecraft:netherrack",
    "minecraft:oak_planks","minecraft:birch_planks","minecraft:spruce_planks"
];

export class Builder {
    constructor(bot) {
        this.bot = bot;
        this.sim = bot.sim;
        this.bag = bot.bag;
        this.terrain = bot.terrain;
        this.host = bot.host;
        this.lastPlace = 0;
        this.bridging = undefined; // {target, anchor, since}
        this.pillaring = undefined; // {height, since, col}
        this.scaffold = [];
    }

    get canBuild() {
        return this.bag.find(s => BUILD_BLOCKS.includes(s.typeId)) >= 0 || this.bag.buildBlock() >= 0;
    }

    findBuildSlot(preferred) {
        if (preferred) {
            const idx = this.bag.find(s => s.typeId === preferred);
            if (idx >= 0) return idx;
        }
        for (const type of BUILD_BLOCKS) {
            const idx = this.bag.find(s => s.typeId === type);
            if (idx >= 0) return idx;
        }
        return this.bag.buildBlock();
    }

    /**
     * Place a block at `target` using `anchor` as support.
     * anchor must be solid, target must be empty/air.
     * Returns "placed", "no-block", "rejected", "hazard", "unbreakable".
     */
    placeAt(target, anchor, options = {}) {
        const anchorBlock = this.terrain.block(anchor);
        if (!anchorBlock || !anchorBlock.isSolid) return "no-support";
        const targetBlock = this.terrain.block(target);
        if (targetBlock && !targetBlock.isAir && !isPassable(targetBlock.typeId)) {
            // If falling block, we can still try to replace after breaking
            if (isFalling(targetBlock.typeId) || isPassable(targetBlock.typeId)) {
                // need to break first
                return "occupied";
            }
            return "occupied";
        }
        if (this.terrain.lavaNear(target) || this.terrain.waterNear(target)) {
            // Check if bridging over lava - refuse unless explicitly allowed
            if (!options.allowHazard) return "hazard";
        }
        const dir = { x: target.x - anchor.x, y: target.y - anchor.y, z: target.z - anchor.z };
        const face = faceFor(dir);
        if (!face) return "rejected";
        const slot = this.findBuildSlot(options.blockType);
        if (slot < 0) return "no-block";
        const selected = this.bag.select(slot);
        try {
            if (options.sneak) this.sim.isSneaking = true;
            this.sim.lookAtBlock(this.host.relative(center(anchor)));
            const ok = this.sim.useItemInSlotOnBlock(selected, this.host.relative(center(anchor)), face);
            this.lastPlace = Date.now();
            return ok ? "placed" : "rejected";
        } catch {
            return "rejected";
        }
    }

    /**
     * Bridge towards direction: place block in front/below to cross gap.
     * Handles: need support, need to place under feet, etc.
     */
    bridge(dir, tick) {
        const p = floor(this.sim.location);
        const anchor = add(p, { x: 0, y: -1, z: 0 });
        const forward = add(p, dir);
        const belowForward = add(forward, { x: 0, y: -1, z: 0 });

        // Case 1: gap ahead at feet level - need to place belowForward
        const belowBlock = this.terrain.block(belowForward);
        if (!belowBlock || belowBlock.isAir || isLiquid(belowBlock.typeId)) {
            // Need to place at belowForward using anchor or p
            // Try anchor as support for forward placement? Actually need to place at belowForward using anchor? No.
            // Bridge logic: place block at belowForward, using anchor as support if adjacent, or using block below anchor?
            // Simplified: place at belowForward using anchor (down anchor, east/west etc not directly adjacent)
            // Better: find any solid neighbor of belowForward
            const neighbors = [
                { pos: add(belowForward, { x: 1, y: 0, z: 0 }), dir: { x: -1, y: 0, z: 0 } },
                { pos: add(belowForward, { x: -1, y: 0, z: 0 }), dir: { x: 1, y: 0, z: 0 } },
                { pos: add(belowForward, { x: 0, y: 0, z: 1 }), dir: { x: 0, y: 0, z: -1 } },
                { pos: add(belowForward, { x: 0, y: 0, z: -1 }), dir: { x: 0, y: 0, z: 1 } },
                { pos: add(belowForward, { x: 0, y: -1, z: 0 }), dir: { x: 0, y: 1, z: 0 } },
                { pos: add(belowForward, { x: 0, y: 1, z: 0 }), dir: { x: 0, y: -1, z: 0 } },
            ];
            for (const n of neighbors) {
                const b = this.terrain.block(n.pos);
                if (b && b.isSolid) {
                    const r = this.placeAt(belowForward, n.pos, { sneak: true });
                    if (r === "placed") return "placed";
                }
            }
            // Fallback: try placing at forward (wall) using p as anchor
            const forwardBlock = this.terrain.block(forward);
            if (!forwardBlock || forwardBlock.isAir) {
                // Place at forward using p below? Actually need support
                const r = this.placeAt(forward, p, { sneak: true });
                if (r === "placed") return "placed";
            }
            return "no-support";
        }
        return "solid";
    }

    /**
     * Pillar up: build column under feet while jumping.
     * Returns "placed", "no-block", "done", "stuck"
     */
    pillar(tick) {
        const p = floor(this.sim.location);
        if (!this.pillaring) {
            this.pillaring = { startY: p.y, col: { x: p.x, z: p.z }, since: tick, placed: 0 };
        }
        const state = this.pillaring;
        const below = add(p, { x: 0, y: -1, z: 0 });
        const belowBlock = this.terrain.block(below);
        if (belowBlock && belowBlock.isSolid) {
            // Already have support, need to jump and place under
            if (this.sim.isOnGround) {
                this.sim.jump();
                return "jumping";
            } else {
                // Airborne, place at previous feet position
                const anchor = add(below, { x: 0, y: -1, z: 0 });
                const target = below; // actually we want to place where we jumped from
                // The feet cell after jump is empty, so place at below
                const r = this.placeAt(below, anchor, { sneak: true });
                if (r === "placed") {
                    state.placed++;
                    return "placed";
                }
                return r;
            }
        } else {
            // No support, need to place at below
            const anchor = add(below, { x: 0, y: -1, z: 0 });
            const r = this.placeAt(below, anchor, { sneak: true });
            if (r === "placed") {
                state.placed++;
                return "placed";
            }
            return r;
        }
    }

    resetPillar() {
        this.pillaring = undefined;
    }

    /**
     * Clear obstructing blocks to reach target below.
     * Returns list of cells to break, or empty if none.
     */
    clearBelow(target) {
        const p = floor(this.sim.location);
        const toBreak = [];
        // If target is below, check column
        if (target.x === p.x && target.z === p.z && target.y < p.y) {
            for (let y = p.y - 1; y >= target.y; y--) {
                const cell = { x: p.x, y, z: p.z };
                const b = this.terrain.block(cell);
                if (b && !b.isAir && !isPassable(b.typeId)) {
                    // Don't break unbreakable
                    if (isUnbreakable(b.typeId)) continue;
                    // Don't break if hazard nearby? We'll check later
                    toBreak.push(cell);
                }
            }
        }
        return toBreak;
    }

    /**
     * Scaffold to reach a high block: build up to it.
     */
    scaffoldTo(target, tick) {
        const p = floor(this.sim.location);
        const dy = target.y - p.y;
        if (dy <= 2) return "close";
        // Need to pillar up
        return this.pillar(tick);
    }

    /**
     * Place torch on support.
     */
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
}
