import { counts } from "../core/recipes.js";
import { FOOD, RAW_MEAT, RISKY_FOOD, toolTier } from "../core/world.js";
import { EntityComponentTypes, ItemStack, system } from "@minecraft/server";
/** Building blocks usable for bridging, pillaring and blocking, best first. */
const BUILD_BLOCKS = [
    "minecraft:cobblestone",
    "minecraft:cobbled_deepslate",
    "minecraft:stone",
    "minecraft:deepslate",
    "minecraft:andesite",
    "minecraft:diorite",
    "minecraft:granite",
    "minecraft:tuff",
    "minecraft:dirt",
    "minecraft:coarse_dirt",
    "minecraft:sand",
    "minecraft:red_sand",
    "minecraft:gravel",
    "minecraft:netherrack",
    "minecraft:oak_planks",
    "minecraft:birch_planks",
    "minecraft:spruce_planks",
    "minecraft:jungle_planks",
    "minecraft:acacia_planks",
    "minecraft:dark_oak_planks",
    "minecraft:mangrove_planks",
    "minecraft:cherry_planks",
    "minecraft:pale_oak_planks",
    "minecraft:glass",
];
/**
 * Reads the authoritative `minecraft:food` component. Nutrition comes from the
 * item itself, so new/renamed foods work without a hardcoded table.
 */
export function foodValue(stack) {
    let nutrition = 0, always = false;
    try {
        const f = stack.getComponent("minecraft:food");
        if (f) {
            nutrition = f.nutrition ?? 0;
            always = !!f.canAlwaysEat;
        }
    }
    catch {
        /* not a food item */
    }
    if (!nutrition) {
        if (FOOD.has(stack.typeId))
            nutrition = 4;
        else if (RAW_MEAT.has(stack.typeId))
            nutrition = 3;
        else if (RISKY_FOOD.has(stack.typeId))
            nutrition = 3;
        else
            return undefined;
    }
    return { nutrition, always, risky: RISKY_FOOD.has(stack.typeId) };
}
/**
 * Nutrition is a property of the item type, so it is looked up once per type
 * instead of reading the food component of every slot on every tick.
 */
const FOOD_CACHE = new Map();
export function foodValueCached(stack) {
    const t = stack.typeId;
    if (FOOD_CACHE.has(t))
        return FOOD_CACHE.get(t);
    const v = foodValue(stack);
    if (FOOD_CACHE.size < 512)
        FOOD_CACHE.set(t, v);
    return v;
}
function gameTick() {
    try {
        const t = system.currentTick;
        return typeof t === "number" ? t : NaN;
    }
    catch {
        return NaN;
    }
}
/**
 * Inventory view with a per-tick slot snapshot.
 *
 * Every `get(i)` used to re-resolve the inventory component and every scan
 * (counts, usableCounts, food, weapon, tool, find...) walked all 36 slots
 * natively; think() alone did ~5 such scans per tick (~400 native calls).
 * Now the container is resolved once per tick, the slots are read once per
 * tick, and derived data (counts, durability) is memoised on that snapshot.
 * Any write through this class invalidates it; callers that change the
 * inventory behind its back (placing a block, eating) can call invalidate().
 * With no numeric clock (offline tests) nothing is cached.
 */
export class Bag {
    constructor(player) {
        this.player = player;
        this.clock = gameTick;
        this._c = undefined;
        this._cTick = NaN;
        this._snap = undefined;
    }
    invalidate() {
        this._snap = undefined;
    }
    get container() {
        const t = this.clock();
        if (this._c && t === this._cTick)
            return this._c;
        const c = this.player.getComponent(EntityComponentTypes.Inventory)?.container;
        if (!c)
            throw Error("Inventory unavailable.");
        this._c = c;
        this._cTick = t;
        return c;
    }
    /** Per-tick slot snapshot, or undefined when there is no usable clock. */
    snapshot() {
        const t = this.clock();
        if (!Number.isFinite(t))
            return undefined;
        const s = this._snap;
        if (s && s.tick === t)
            return s;
        const c = this.container;
        const size = c.size;
        const items = new Array(size);
        for (let i = 0; i < size; i++)
            items[i] = c.getItem(i);
        return (this._snap = { tick: t, size, items, counts: undefined, dur: new Array(size) });
    }
    get size() {
        const s = this.snapshot();
        return s ? s.size : this.container.size;
    }
    get(i) {
        const s = this.snapshot();
        return s ? s.items[i] : this.container.getItem(i);
    }
    set(i, item) {
        this.container.setItem(i, item);
        this.invalidate();
    }
    /** Remaining durability of slot i (Infinity for items without durability). */
    durabilityLeft(i) {
        const s = this.snapshot();
        let v = s ? s.dur[i] : undefined;
        if (v === undefined) {
            v = Infinity;
            const item = s ? s.items[i] : this.get(i);
            if (item) {
                try {
                    const d = item.getComponent("minecraft:durability");
                    if (d)
                        v = d.maxDurability - d.damage;
                }
                catch {
                    /* no durability */
                }
            }
            if (s)
                s.dur[i] = v;
        }
        return v;
    }
    clone(item, amount) {
        const s = item.clone();
        s.amount = amount;
        return s;
    }
    create(type, amount) {
        return new ItemStack(type, amount);
    }
    stackable(a, b) {
        return a.isStackableWith(b);
    }
    counts() {
        const s = this.snapshot();
        if (!s) {
            const c = this.container;
            return counts({ size: c.size, get: (i) => c.getItem(i) });
        }
        if (!s.counts)
            s.counts = counts(this);
        return { ...s.counts };
    }
    find(predicate) {
        for (let i = 0; i < this.size; i++) {
            const s = this.get(i);
            if (s && predicate(s))
                return i;
        }
        return -1;
    }
    select(slot) {
        if (slot < 0)
            throw Error("Item unavailable.");
        if (slot > 8) {
            this.container.swapItems(slot, 8, this.container);
            this.invalidate();
            slot = 8;
        }
        this.player.selectedSlotIndex = slot;
        return slot;
    }
    /**
     * Best edible slot. Safe food is preferred; raw meat/carrion is only used
     * when `desperate`, so a starving bot will still eat rather than stand
     * still at zero hunger.
     */
    food(desperate = false) {
        let best = -1, bestScore = -Infinity;
        for (let i = 0; i < this.size; i++) {
            const s = this.get(i);
            if (!s)
                continue;
            const v = foodValueCached(s);
            if (!v)
                continue;
            if (v.risky && !desperate)
                continue;
            const score = v.nutrition * 10 - (v.risky ? 60 : 0) + (v.always ? 5 : 0);
            if (score > bestScore) {
                bestScore = score;
                best = i;
            }
        }
        return best;
    }
    /** Any edible item, including risky food, ignoring nutritional preference. */
    hasFood() {
        return this.find((s) => !!foodValueCached(s)) >= 0;
    }
    /** First building block available for bridging/pillaring, or -1. */
    buildBlock() {
        for (const type of BUILD_BLOCKS) {
            const i = this.find((s) => s.typeId === type);
            if (i >= 0)
                return i;
        }
        return -1;
    }
    /** Best held weapon slot (sword preferred, then axe), or -1. */
    weapon() {
        let sword = -1, axe = -1, swordScore = -1, axeScore = -1;
        for (let i = 0; i < this.size; i++) {
            const s = this.get(i);
            if (!s)
                continue;
            if (!s.typeId.endsWith("_sword") && !s.typeId.endsWith("_axe"))
                continue;
            if (this.durabilityLeft(i) <= 2)
                continue;
            const t = toolTier(s.typeId);
            if (s.typeId.endsWith("_sword") && t > swordScore) {
                swordScore = t;
                sword = i;
            }
            else if (s.typeId.endsWith("_axe") && t > axeScore) {
                axeScore = t;
                axe = i;
            }
        }
        if (sword >= 0) {
            this.select(sword);
            return sword;
        }
        if (axe >= 0) {
            this.select(axe);
            return axe;
        }
        return -1;
    }
    usableCounts() {
        const stock = this.counts();
        const size = this.size;
        for (let i = 0; i < size; i++) {
            const s = this.get(i);
            if (s && this.durabilityLeft(i) <= 2)
                stock[s.typeId] -= s.amount;
        }
        return stock;
    }
    /** Best usable tool slot of `kind` at `tier`+, or -1. Never touches the hotbar. */
    findTool(kind, tier = 0) {
        let best = -1, score = -1;
        for (let i = 0; i < this.size; i++) {
            const s = this.get(i);
            if (!s?.typeId.endsWith("_" + kind))
                continue;
            if (this.durabilityLeft(i) <= 2)
                continue;
            const t = toolTier(s.typeId);
            if (t >= tier && t > score) {
                score = t;
                best = i;
            }
        }
        return best;
    }
    hasTool(kind, tier = 0) {
        return this.findTool(kind, tier) >= 0;
    }
    tool(kind, tier = 0) {
        const best = this.findTool(kind, tier);
        if (best < 0)
            return false;
        this.select(best);
        return true;
    }
    emptyHand() {
        let i = this.find(() => false);
        for (let n = 0; n < this.size; n++)
            if (!this.get(n)) {
                i = n;
                break;
            }
        if (i >= 0)
            this.select(i);
        else
            throw Error("No empty slot for hand mining.");
    }
    /**
     * Consolidate partial stacks of identical items into the earliest slot
     * with room, so storage stays sorted instead of one stack per trip. Order
     * of first appearances is preserved and nothing is ever dropped. Same
     * prepare-then-commit discipline as core craft(): a failed commit rolls
     * every touched slot back to its original stack.
     */
    organize() {
        const size = this.size;
        const old = Array.from({ length: size }, (_, i) => this.get(i));
        const next = old.map((s) => (s ? this.clone(s, s.amount) : undefined));
        let merged = 0;
        for (let i = 0; i < size; i++) {
            const target = next[i];
            if (!target || target.amount >= target.maxAmount)
                continue;
            for (let j = i + 1; j < size; j++) {
                const src = next[j];
                if (!src || !this.stackable(target, src))
                    continue;
                const space = target.maxAmount - target.amount;
                if (space <= 0)
                    break;
                const move = Math.min(space, src.amount);
                next[i] = this.clone(target, target.amount + move);
                next[j] = src.amount === move ? undefined : this.clone(src, src.amount - move);
                merged++;
            }
        }
        if (!merged)
            return 0;
        try {
            for (let i = 0; i < size; i++)
                this.set(i, next[i]);
        }
        catch (e) {
            let failed = false;
            for (let i = 0; i < size; i++)
                try {
                    this.set(i, old[i]);
                }
                catch {
                    failed = true;
                }
            if (failed)
                throw Error("CRITICAL: inventory rollback failed during organize. Stop and inspect inventory.");
            throw e;
        }
        return merged;
    }
    /**
     * Move everything possible into `target`: first top up matching stacks
     * (so chests stay sorted), then fill empty slots. Prepared, validated,
     * committed with rollback on both inventories — a half-moved deposit here
     * would be item loss, which this pack never accepts.
     */
    deposit(target) {
        const size = this.size, tsize = target.size;
        const oldSelf = Array.from({ length: size }, (_, i) => this.get(i));
        const oldTarget = Array.from({ length: tsize }, (_, i) => target.getItem(i));
        const nextSelf = oldSelf.map((s) => (s ? this.clone(s, s.amount) : undefined));
        const nextTarget = oldTarget.map((s) => (s ? this.clone(s, s.amount) : undefined));
        let moved = 0, merged = 0;
        for (let i = 0; i < size; i++) {
            let src = nextSelf[i];
            if (!src)
                continue;
            for (let j = 0; j < tsize && src; j++) {
                const dst = nextTarget[j];
                if (!dst || !this.stackable(dst, src))
                    continue;
                const space = dst.maxAmount - dst.amount;
                if (space <= 0)
                    continue;
                const n = Math.min(space, src.amount);
                nextTarget[j] = this.clone(dst, dst.amount + n);
                src = src.amount === n ? undefined : this.clone(src, src.amount - n);
                merged++;
            }
            for (let j = 0; j < tsize && src; j++) {
                if (nextTarget[j])
                    continue;
                nextTarget[j] = src;
                src = undefined;
                moved++;
            }
            nextSelf[i] = src;
        }
        if (!moved && !merged)
            return { moved: 0, merged: 0 };
        const commit = (inv, from, to) => {
            for (let i = 0; i < to.length; i++)
                if (from[i]?.typeId !== to[i]?.typeId ||
                    from[i]?.amount !== to[i]?.amount)
                    inv.set(i, to[i]);
        };
        try {
            commit(target, oldTarget, nextTarget);
            commit(this, oldSelf, nextSelf);
        }
        catch (e) {
            // Whatever state the two commits left behind, write every slot
            // back to the exact stack it held before. Both sides are reverted.
            let failed = false;
            for (const [inv, from, to] of [
                [target, nextTarget, oldTarget],
                [this, nextSelf, oldSelf],
            ])
                try {
                    commit(inv, from, to);
                }
                catch {
                    failed = true;
                }
            if (failed)
                throw Error("CRITICAL: deposit rollback failed. Stop and inspect both inventories.");
            throw e;
        }
        return { moved, merged };
    }
    /**
     * Reverse of deposit(): pull stacks out of `target` (a chest/barrel) into
     * this inventory. `allow` is an optional item filter (valuables first);
     * `reserve` empty slots are kept free so travel drops can still be picked
     * up. Prepared, validated and committed with rollback on both inventories
     * — items are only ever moved, never fabricated.
     */
    withdraw(target, allow = undefined, reserve = 0) {
        const size = this.size, tsize = target.size;
        const oldSelf = Array.from({ length: size }, (_, i) => this.get(i));
        const oldTarget = Array.from({ length: tsize }, (_, i) => target.getItem(i));
        const nextSelf = oldSelf.map((s) => (s ? this.clone(s, s.amount) : undefined));
        const nextTarget = oldTarget.map((s) => (s ? this.clone(s, s.amount) : undefined));
        let moved = 0, merged = 0;
        for (let j = 0; j < tsize; j++) {
            let src = nextTarget[j];
            if (!src || (allow && !allow(src)))
                continue;
            for (let i = 0; i < size && src; i++) {
                const dst = nextSelf[i];
                if (!dst || !this.stackable(dst, src))
                    continue;
                const space = dst.maxAmount - dst.amount;
                if (space <= 0)
                    continue;
                const n = Math.min(space, src.amount);
                nextSelf[i] = this.clone(dst, dst.amount + n);
                src = src.amount === n ? undefined : this.clone(src, src.amount - n);
                merged++;
            }
            const free = nextSelf.reduce((a, s) => a + (s ? 0 : 1), 0);
            let room = free - reserve;
            for (let i = 0; i < size && src; i++) {
                if (nextSelf[i] || room <= 0)
                    continue;
                nextSelf[i] = src;
                src = undefined;
                room--;
                moved++;
            }
            nextTarget[j] = src;
        }
        if (!moved && !merged)
            return { moved: 0, merged: 0 };
        const commit = (inv, from, to) => {
            for (let i = 0; i < to.length; i++)
                if (from[i]?.typeId !== to[i]?.typeId ||
                    from[i]?.amount !== to[i]?.amount)
                    inv.set(i, to[i]);
        };
        try {
            commit(target, oldTarget, nextTarget);
            commit(this, oldSelf, nextSelf);
        }
        catch (e) {
            let failed = false;
            for (const [inv, from, to] of [
                [target, nextTarget, oldTarget],
                [this, nextSelf, oldSelf],
            ])
                try {
                    commit(inv, from, to);
                }
                catch {
                    failed = true;
                }
            if (failed)
                throw Error("CRITICAL: withdraw rollback failed. Stop and inspect both inventories.");
            throw e;
        }
        return { moved, merged };
    }
}
/** Exposes native station inventory through the same tested transfer boundary. */
export class NativeInventory {
    constructor(container) {
        this.container = container;
    }
    get size() {
        return this.container.size;
    }
    get(i) {
        return this.container.getItem(i);
    }
    set(i, s) {
        this.container.setItem(i, s);
    }
    clone(s, amount) {
        const next = s.clone();
        next.amount = amount;
        return next;
    }
    create(type, amount) {
        return new ItemStack(type, amount);
    }
    stackable(a, b) {
        return a.isStackableWith(b);
    }
}
