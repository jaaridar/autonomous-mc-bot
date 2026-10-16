// Pure inventory model: slots, stacks, hotbar choice, gear scoring.
//
// The runtime `Bag` reads the live container; this module models what the bot
// *plans* with, and is the piece migrates the useful half of the AI Players
// Add-On virtual inventory / virtual hotbar / virtual equipment components into
// engine-free code. A skill can therefore ask "can I afford this craft, which
// slot would I hold, what is my armour" without touching the engine - and a test
// can assert the answer.
//
// Stack semantics match Bedrock: tools and armour do not stack, everything else
// stacks to 64 (16 for the usual exceptions).

import { toolProfile } from "./mining-plan.js";

export const DEFAULT_SLOTS = 36;
export const HOTBAR_SLOTS = 9;
export const ARMOR_SLOTS = ["Head", "Chest", "Legs", "Feet"];
export const OFFHAND_SLOT = "Offhand";

const SMALL_STACK = /(_sign$|_hanging_sign$|_banner$|bucket|_bucket$|snowball|egg$|ender_pearl|_potion$|potion$|_stew$|stew$|_soup$|honey_bottle|_shulker_box$|_bed$|_door$|_boat$|_minecart$|_tool$|_rod$)/;

/** Max stack size for an item id (engine-accurate enough for planning). */
export function maxStack(typeId) {
    if (toolProfile(typeId))
        return 1;
    if (/(_helmet|_chestplate|_leggings|_boots|shield|bow|crossbow|trident|elytra|flint_and_steel|shears|_horse_armor)$/.test(typeId))
        return 1;
    if (SMALL_STACK.test(typeId))
        return 16;
    return 64;
}

const ARMOR_POINTS = { leather: 1, golden: 2, chainmail: 2, iron: 3, copper: 3, turtle: 3, diamond: 4, netherite: 5 };
const WEAPON_DAMAGE = { wooden: 4, golden: 4, stone: 5, copper: 5, iron: 6, diamond: 7, netherite: 8 };

export function armorScore(typeId) {
    if (!typeId)
        return 0;
    const bare = typeId.replace("minecraft:", "");
    const material = bare.split("_")[0];
    const points = ARMOR_POINTS[material] ?? 0;
    if (points === 0)
        return 0;
    if (bare.endsWith("_chestplate")) return points * 3;
    if (bare.endsWith("_leggings")) return points * 2.4;
    if (bare.endsWith("_helmet")) return points * 1.4;
    if (bare.endsWith("_boots")) return points * 1.1;
    return points;
}

/** Weapon damage estimate: swords beat axes per swing, tools are last resort. */
export function weaponDamage(typeId) {
    if (!typeId)
        return 1;
    const bare = typeId.replace("minecraft:", "");
    const material = bare.split("_")[0];
    if (bare.endsWith("_sword")) return WEAPON_DAMAGE[material] ?? 4;
    if (bare.endsWith("_axe")) return (WEAPON_DAMAGE[material] ?? 4) - 1;
    if (bare.endsWith("_pickaxe") || bare.endsWith("_shovel")) return (WEAPON_DAMAGE[material] ?? 4) - 2;
    return 1;
}

export function weaponTier(typeId) {
    if (!typeId)
        return 0;
    const material = typeId.replace("minecraft:", "").split("_")[0];
    return { netherite: 5, diamond: 4, iron: 3, stone: 2, copper: 2, golden: 1, wooden: 1 }[material] ?? 0;
}

/**
 * A virtual inventory. Mirrors the engine's stack rules:
 * `add` fills matching stacks first, then empty slots, and returns the leftover.
 */
export class VInv {
    constructor(size = DEFAULT_SLOTS, slots = []) {
        this.size = size;
        this.slots = new Array(size).fill(null);
        for (let i = 0; i < Math.min(size, slots.length); i++)
            this.slots[i] = slots[i] ? { ...slots[i] } : null;
    }
    static fromCounts(counts, size = DEFAULT_SLOTS) {
        const inv = new VInv(size);
        for (const [typeId, amount] of Object.entries(counts ?? {}))
            inv.add(typeId, amount);
        return inv;
    }
    static fromSlots(slots, size = DEFAULT_SLOTS) {
        return new VInv(size, slots);
    }
    clone() { return new VInv(this.size, this.slots); }
    count(typeId) {
        let n = 0;
        for (const slot of this.slots) if (slot?.typeId === typeId) n += slot.amount;
        return n;
    }
    has(typeId, amount = 1) { return this.count(typeId) >= amount; }
    counts() {
        const out = {};
        for (const slot of this.slots)
            if (slot)
                out[slot.typeId] = (out[slot.typeId] ?? 0) + slot.amount;
        return out;
    }
    get freeSlots() {
        let n = 0;
        for (const slot of this.slots) if (!slot) n++;
        return n;
    }
    get usedSlots() { return this.size - this.freeSlots; }
    get totalItems() {
        let n = 0;
        for (const slot of this.slots) if (slot) n += slot.amount;
        return n;
    }
    /** Returns the leftover amount that did not fit. */
    add(typeId, amount = 1) {
        let remaining = amount;
        const max = maxStack(typeId);
        for (let i = 0; i < this.size && remaining > 0; i++) {
            const slot = this.slots[i];
            if (slot && slot.typeId === typeId && slot.amount < max) {
                const want = Math.min(max - slot.amount, remaining);
                slot.amount += want;
                remaining -= want;
            }
        }
        for (let i = 0; i < this.size && remaining > 0; i++) {
            if (!this.slots[i]) {
                const want = Math.min(max, remaining);
                this.slots[i] = { typeId, amount: want };
                remaining -= want;
            }
        }
        return remaining;
    }
    /** Removes up to `amount`; returns how much was actually removed. */
    remove(typeId, amount = 1) {
        let remaining = amount;
        for (let i = 0; i < this.size && remaining > 0; i++) {
            const slot = this.slots[i];
            if (!slot || slot.typeId !== typeId)
                continue;
            const take = Math.min(slot.amount, remaining);
            slot.amount -= take;
            remaining -= take;
            if (slot.amount <= 0)
                this.slots[i] = null;
        }
        return amount - remaining;
    }
    /** Merge partial stacks into full ones (the `!bot organize` behaviour). */
    merge() {
        const moved = [];
        for (let i = 0; i < this.size; i++) {
            const slot = this.slots[i];
            if (!slot)
                continue;
            const max = maxStack(slot.typeId);
            if (slot.amount >= max)
                continue;
            for (let j = i + 1; j < this.size && slot.amount < max; j++) {
                const other = this.slots[j];
                if (!other || other.typeId !== slot.typeId)
                    continue;
                const want = Math.min(max - slot.amount, other.amount);
                slot.amount += want;
                other.amount -= want;
                moved.push({ from: j, to: i, amount: want });
                if (other.amount <= 0)
                    this.slots[j] = null;
            }
        }
        return moved;
    }
    /**
     * Best item of a kind: highest weapon damage / tool speed.
     * `kind` is a tool kind ("pickaxe") or "weapon" / "food".
     */
    best(kind, { minTier = 0 } = {}) {
        let best;
        for (const [typeId, amount] of Object.entries(this.counts())) {
            if (amount <= 0)
                continue;
            if (kind === "weapon") {
                const score = weaponDamage(typeId);
                if (score > 1 && (!best || score > best.score))
                    best = { typeId, score };
                continue;
            }
            const tool = toolProfile(typeId);
            if (tool && tool.kind === kind && tool.tier >= minTier && (!best || tool.speed > best.score))
                best = { typeId, score: tool.speed, tier: tool.tier };
        }
        return best?.typeId;
    }
    /** Total armour points across the four slots of an equipment map. */
    static armorPoints(equipment = {}) {
        let points = 0;
        for (const slot of ARMOR_SLOTS)
            points += armorScore(equipment[slot]);
        return points;
    }
    /** Which hotbar slot (0..8) should be held to use `typeId`, or -1. */
    hotbarIndex(typeId) {
        for (let i = 0; i < Math.min(HOTBAR_SLOTS, this.size); i++)
            if (this.slots[i]?.typeId === typeId)
                return i;
        return -1;
    }
    /** Items to drop to free `needed` slots, least valuable first, by `value(id)`. */
    junk(needed, value = () => 0, options = {}) {
        if (needed <= 0)
            return [];
        const keep = options.keep ?? (() => false);
        const candidates = this.slots
            .map((slot, index) => ({ slot, index }))
            .filter((x) => x.slot && !keep(x.slot.typeId))
            .map((x) => ({ ...x, score: value(x.slot.typeId) / Math.max(1, x.slot.amount) }))
            .sort((a, b) => (a.score - b.score) || (a.index - b.index));
        return candidates.slice(0, needed);
    }
}

/** Compare two inventories for the resources a task needs (skill scoring helper). */
export function covers(inv, requirements = {}) {
    for (const [typeId, amount] of Object.entries(requirements))
        if (!inv.has(typeId, amount))
            return false;
    return true;
}
