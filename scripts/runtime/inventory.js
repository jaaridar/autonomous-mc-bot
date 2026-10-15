import { ItemStack, EntityComponentTypes, } from "@minecraft/server";
import { counts } from "../core/recipes.js";
import { FOOD, RAW_MEAT, RISKY_FOOD, toolTier } from "../core/policy.js";
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
const FOOD_BY_TYPE = new Map();
/** foodValue() memoized per item type: nutrition is a property of the type, not the stack. */
export function foodValueOf(stack, typeId) {
    const t = typeId ?? stack.typeId;
    if (FOOD_BY_TYPE.has(t))
        return FOOD_BY_TYPE.get(t);
    const v = foodValue(stack);
    if (FOOD_BY_TYPE.size < 512)
        FOOD_BY_TYPE.set(t, v);
    return v;
}
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
export class Bag {
    constructor(player) {
        this.player = player;
        // Per-tick snapshot. Only active after begin(tick) - the bot calls it
        // at the top of every tick. Each engine read here (getComponent,
        // .container, getItem, typeId, durability...) is a native call, and
        // the old accessors re-fetched the inventory component on every slot
        // of every loop: one builder.canBuild with no blocks cost ~9000 engine
        // calls. A Bag nobody calls begin() on reads the engine every time,
        // exactly as before.
        this._tick = undefined;
        /** Set by the bot when it hooks its own item-use calls (see select()). */
        this.useHooked = false;
        this.invalidate();
    }
    /** Start a new tick: drop the snapshot and the cached container. */
    begin(tick) {
        this._tick = tick;
        this._volatile = false;
        this._container = undefined;
        this.invalidate();
    }
    /** True while reads may be served from the per-tick snapshot. */
    get caching() {
        return this._tick !== undefined && !this._volatile;
    }
    /** Forget the slot snapshot (after any inventory mutation). */
    invalidate() {
        this._slots = undefined;
        this._types = undefined;
        this._counts = undefined;
        this._usable = undefined;
        this._worn = undefined;
        this._food = undefined;
    }
    get container() {
        if (this._container)
            return this._container;
        const c = this.player.getComponent(EntityComponentTypes.Inventory)?.container;
        if (!c)
            throw Error("Inventory unavailable.");
        // The container object itself is stable within a tick (selection
        // does not replace it), so it stays cached even when reads are live.
        if (this._tick !== undefined)
            this._container = c;
        return c;
    }
    /** Slot stacks (engine copies) and their typeIds, read once per tick. */
    snapshot() {
        if (this._slots)
            return this._slots;
        const c = this.container, n = c.size;
        const slots = new Array(n), types = new Array(n);
        for (let i = 0; i < n; i++) {
            const st = c.getItem(i);
            slots[i] = st;
            types[i] = st ? st.typeId : undefined;
        }
        if (this.caching) {
            this._slots = slots;
            this._types = types;
        }
        else
            this._lastTypes = types;
        return slots;
    }
    /** typeId per slot, from the same snapshot. */
    types() {
        this.snapshot();
        return this._types ?? this._lastTypes;
    }
    get size() {
        return this.caching ? this.snapshot().length : this.container.size;
    }
    get(i) {
        return this.caching ? this.snapshot()[i] : this.container.getItem(i);
    }
    set(i, item) {
        this.invalidate();
        this.container.setItem(i, item);
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
    /** Item totals by typeId. Returns a fresh object callers may mutate. */
    counts() {
        if (!this.caching)
            return counts(this);
        if (!this._counts) {
            const slots = this.snapshot(), types = this._types, out = {};
            for (let i = 0; i < slots.length; i++)
                if (slots[i])
                    out[types[i]] = (out[types[i]] ?? 0) + slots[i].amount;
            this._counts = out;
        }
        return { ...this._counts };
    }
    /** Empty slots, from the snapshot (no engine call once snapshotted). */
    freeSlots() {
        let n = 0;
        for (const st of this.snapshot())
            if (!st)
                n++;
        return n;
    }
    /** First slot holding exactly `type`, or -1. */
    findType(type) {
        return this.types().indexOf(type);
    }
    find(predicate) {
        const slots = this.snapshot();
        for (let i = 0; i < slots.length; i++) {
            const s = slots[i];
            if (s && predicate(s))
                return i;
        }
        return -1;
    }
    select(slot) {
        if (slot < 0)
            throw Error("Item unavailable.");
        // Selecting is the prelude to using/placing/eating, which consumes the
        // stack inside this tick (engine-side, not through set()). The bot
        // hooks its own use* calls (useHooked) to switch to live reads exactly
        // when an item is used; without that hook selecting does it, so a
        // craft()/deposit() commit can never be built from a pre-use copy.
        this.invalidate();
        if (!this.useHooked)
            this._volatile = true;
        if (slot > 8) {
            this.container.swapItems(slot, 8, this.container);
            slot = 8;
        }
        this.player.selectedSlotIndex = slot;
        return slot;
    }
    /**
     * An item was used (placed/eaten) engine-side this tick: drop the snapshot
     * and read the container live for the rest of the tick.
     */
    markUsed() {
        this.invalidate();
        this._volatile = true;
    }
    /** Like tool() but without selecting anything. */
    hasTool(kind, tier = 0) {
        const types = this.types(), suffix = "_" + kind;
        for (let i = 0; i < types.length; i++) {
            const t = types[i];
            if (t?.endsWith(suffix) && toolTier(t) >= tier && !this.worn(i))
                return true;
        }
        return false;
    }
    /**
     * "Nearly broken" (<= 2 uses left) per slot. Durability is a component
     * read, and it only moves when the tool is used, so a reading is reused
     * for 20 ticks while the slot still holds the same item type.
     */
    worn(i) {
        const s = this.get(i);
        if (!s)
            return false;
        const type = this.caching ? this._types[i] : s.typeId;
        const memo = this.caching ? (this._wornMemo ??= new Map()) : undefined;
        const hit = memo?.get(i);
        if (hit && hit.type === type && this._tick - hit.tick < 20 && this._tick >= hit.tick)
            return hit.worn;
        const d = s.getComponent("minecraft:durability");
        const worn = !!d && d.maxDurability - d.damage <= 2;
        memo?.set(i, { type, tick: this._tick, worn });
        return worn;
    }
    /** foodValue() per slot (memoized per item type). */
    foodAt(i) {
        const s = this.get(i);
        if (!s)
            return undefined;
        return foodValueOf(s, this.caching ? this._types[i] : undefined);
    }
    /**
     * Best edible slot. Safe food is preferred; raw meat/carrion is only used
     * when `desperate`, so a starving bot will still eat rather than stand
     * still at zero hunger.
     */
    food(desperate = false) {
        let best = -1, bestScore = -Infinity;
        const slots = this.snapshot();
        for (let i = 0; i < slots.length; i++) {
            if (!slots[i])
                continue;
            const v = this.foodAt(i);
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
        const slots = this.snapshot();
        for (let i = 0; i < slots.length; i++)
            if (slots[i] && this.foodAt(i))
                return true;
        return false;
    }
    /** First building block available for bridging/pillaring, or -1. */
    buildBlock() {
        // One pass over the snapshot instead of one full inventory scan per
        // candidate type (29 scans when no block was held).
        const types = this.types();
        for (const type of BUILD_BLOCKS) {
            const i = types.indexOf(type);
            if (i >= 0)
                return i;
        }
        return -1;
    }
    /** Best held weapon slot (sword preferred, then axe), or -1. */
    weapon() {
        let sword = -1, axe = -1, swordScore = -1, axeScore = -1;
        const types = this.types();
        for (let i = 0; i < types.length; i++) {
            const t = types[i];
            if (!t || !(t.endsWith("_sword") || t.endsWith("_axe")))
                continue;
            if (this.worn(i))
                continue;
            const tier = toolTier(t);
            if (t.endsWith("_sword") && tier > swordScore) {
                swordScore = tier;
                sword = i;
            }
            else if (t.endsWith("_axe") && tier > axeScore) {
                axeScore = tier;
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
        if (this.caching && this._usable)
            return { ...this._usable };
        const stock = this.counts();
        const slots = this.snapshot(), types = this.types();
        for (let i = 0; i < slots.length; i++) {
            const s = slots[i];
            if (s && this.worn(i))
                stock[types[i]] -= s.amount;
        }
        if (this.caching)
            this._usable = { ...stock };
        return stock;
    }
    tool(kind, tier = 0) {
        let best = -1, score = -1;
        const types = this.types(), suffix = "_" + kind;
        for (let i = 0; i < types.length; i++) {
            const t = types[i];
            if (!t?.endsWith(suffix))
                continue;
            if (this.worn(i))
                continue;
            const tt = toolTier(t);
            if (tt >= tier && tt > score) {
                score = tt;
                best = i;
            }
        }
        if (best < 0)
            return false;
        this.select(best);
        return true;
    }
    emptyHand() {
        const i = this.snapshot().findIndex((s) => !s);
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
