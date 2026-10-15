import { diggable } from "../core/policy.js";
import { center } from "../core/math.js";
/** Blocks that are cheap to break again without gear, best first for sealing. */
const SEAL_BLOCKS = [
    "minecraft:dirt",
    "minecraft:coarse_dirt",
    "minecraft:sand",
    "minecraft:red_sand",
    "minecraft:gravel",
];
const PLANKS = /_planks$/;
/**
 * The bot's hands: one shared implementation of "select an item, aim at a
 * block cell, use it, and be able to verify the result". Escape, camping and
 * future building tasks all place blocks through here so the aiming,
 * sneaking and verification rules cannot drift apart between modules.
 *
 * Placement is optimistic: the engine reports acceptance, and the caller
 * re-reads the world on a later tick (cells are cheap to re-check, engine
 * placement is not always visible in the same tick). Every helper reads the
 * world live and bypasses the Terrain cache, so a stale cache can never make
 * the bot believe in a block that is not there.
 */
export class Hands {
    constructor(bot) {
        this.bot = bot;
        this.sim = bot.sim;
        this.bag = bot.bag;
        this.terrain = bot.terrain;
        this.host = bot.host;
    }
    get canBuild() {
        return this.bag.buildBlock() >= 0;
    }
    /** Live cell reads; deliberately bypass the terrain cache. */
    filled(cell) {
        return this.terrain.solid(cell);
    }
    open(cell) {
        return this.terrain.empty(cell);
    }
    nearCell(cell, flat = 0.6, rise = 1.2) {
        const loc = this.sim.location;
        return (Math.hypot(loc.x - (cell.x + 0.5), loc.z - (cell.z + 0.5)) < flat &&
            Math.abs(loc.y - cell.y) < rise);
    }
    /**
     * Could the bot dig this block back out with what it is carrying? Used to
     * decide whether a shelter may be sealed at all, so the bot never walls
     * itself in behind a block it cannot break.
     */
    reopenable(typeId) {
        const rule = diggable(typeId);
        if (!rule)
            return false;
        if (rule.tier === 0)
            return true;
        return this.bag.tool(rule.tool, rule.tier);
    }
    /**
     * Slot of the best block for sealing a shelter: dirt/sand/gravel first
     * because they always reopen without gear, planks next, then whatever the
     * bag offers for building.
     */
    sealSlot() {
        for (const type of SEAL_BLOCKS) {
            const i = this.bag.find((s) => s.typeId === type);
            if (i >= 0)
                return i;
        }
        const planks = this.bag.find((s) => PLANKS.test(s.typeId));
        if (planks >= 0)
            return planks;
        const build = this.bag.buildBlock();
        if (build >= 0) {
            const type = this.bag.get(build)?.typeId;
            if (type && this.reopenable(type))
                return build;
        }
        return -1;
    }
    /**
     * Place one carried block into the cell on the clicked face of `anchor`.
     * Returns "placed" (engine accepted), "no-block" (nothing suitable held)
     * or "rejected" (engine refused this aim/face). Callers verify the cell
     * afterwards with filled(); rejection is normal when a neighbour popped in
     * or the aim was invalid, and simply retrying next tick is correct.
     */
    place(anchor, face, options = {}) {
        const slot = options.slot ?? this.bag.buildBlock();
        if (slot < 0)
            return "no-block";
        const selected = this.bag.select(slot);
        try {
            if (options.sneak)
                this.sim.isSneaking = true;
            this.sim.lookAtBlock(this.host.relative(center(anchor)));
            return this.sim.useItemInSlotOnBlock(selected, this.host.relative(center(anchor)), face)
                ? "placed"
                : "rejected";
        }
        catch {
            return "rejected";
        }
    }
    /** Place a carried item (bed, torch, table, ...) straight down onto a cell. */
    placeItemOn(ground, slot) {
        const selected = this.bag.select(slot);
        try {
            this.sim.lookAtBlock(this.host.relative(center(ground)));
            return this.sim.useItemInSlotOnBlock(selected, this.host.relative(center(ground)))
                ? "placed"
                : "rejected";
        }
        catch {
            return "rejected";
        }
    }
}
