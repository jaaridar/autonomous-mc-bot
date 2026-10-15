import { EquipmentSlot, EntityComponentTypes, } from "@minecraft/server";
import { TaskFault } from "../core/recovery.js";
export const ARMOR = [
    { slot: EquipmentSlot.Chest, suffix: "chestplate", iron: 8 },
    { slot: EquipmentSlot.Legs, suffix: "leggings", iron: 7 },
    { slot: EquipmentSlot.Head, suffix: "helmet", iron: 5 },
    { slot: EquipmentSlot.Feet, suffix: "boots", iron: 4 },
];
function rank(type) {
    for (const [i, material] of [
        "leather",
        "golden",
        "chainmail",
        "iron",
        "diamond",
        "netherite",
    ].entries())
        if (type.startsWith("minecraft:" + material + "_"))
            return i + 1;
    return 0;
}
function usable(item) {
    if (!item)
        return false;
    const d = item.getComponent("minecraft:durability");
    return !d || d.maxDurability - d.damage > 2;
}
function score(item) {
    if (!usable(item))
        return -1;
    const d = item.getComponent("minecraft:durability");
    return (rank(item.typeId) * 100 +
        (d ? (d.maxDurability - d.damage) / d.maxDurability : 1));
}
/** Inventory/equipment swaps preserve existing stacks. Material preference, not enchantment optimization. */
export class Equipment {
    constructor(sim, bag) {
        this.sim = sim;
        this.bag = bag;
        this.faultReason = "";
    }
    equippable() {
        const eq = this.sim.getComponent(EntityComponentTypes.Equippable);
        if (!eq)
            throw new TaskFault("Equippable component unavailable.");
        return eq;
    }
    report() {
        const eq = this.equippable();
        return Object.fromEntries([...ARMOR.map((a) => a.slot), EquipmentSlot.Offhand].map((slot) => [
            slot,
            eq.getEquipment(slot)?.typeId ?? null,
        ]));
    }
    nextIronGoal() {
        const eq = this.equippable();
        for (const a of ARMOR) {
            const worn = eq.getEquipment(a.slot);
            if (!usable(worn) || rank(worn.typeId) < 4)
                return { item: "minecraft:iron_" + a.suffix, ingots: a.iron };
        }
        return undefined;
    }
    autoEquip() {
        const eq = this.equippable();
        let changes = 0;
        for (const armor of ARMOR) {
            const worn = eq.getEquipment(armor.slot);
            let best = -1, bestScore = score(worn);
            for (let i = 0; i < this.bag.size; i++) {
                const item = this.bag.get(i);
                if (!item?.typeId.endsWith("_" + armor.suffix))
                    continue;
                const value = score(item);
                if (value > bestScore) {
                    best = i;
                    bestScore = value;
                }
            }
            if (best < 0)
                continue;
            const candidate = this.bag.get(best);
            try {
                if (!eq.setEquipment(armor.slot, candidate))
                    throw Error("Equipment write rejected.");
                this.bag.set(best, worn);
            }
            catch (error) {
                let failed = false;
                try {
                    if (!eq.setEquipment(armor.slot, worn))
                        failed = true;
                }
                catch {
                    failed = true;
                }
                try {
                    this.bag.set(best, candidate);
                }
                catch {
                    failed = true;
                }
                throw new TaskFault((failed
                    ? "CRITICAL equipment rollback failed: "
                    : "Equipment swap failed: ") + String(error));
            }
            changes++;
        }
        return changes;
    }
    unequipAll() {
        const eq = this.equippable(), slots = [...ARMOR.map((a) => a.slot), EquipmentSlot.Offhand];
        const present = slots.filter((s) => !!eq.getEquipment(s));
        if (this.bag.container.emptySlotsCount < present.length)
            throw new TaskFault("Make enough empty inventory slots before unequipping.");
        let count = 0;
        for (const slot of present) {
            const item = eq.getEquipment(slot);
            let target = -1;
            for (let i = 0; i < this.bag.size; i++)
                if (!this.bag.get(i)) {
                    target = i;
                    break;
                }
            try {
                if (!eq.setEquipment(slot, undefined))
                    throw Error("Equipment removal rejected.");
                this.bag.set(target, item);
            }
            catch (error) {
                let failed = false;
                try {
                    if (!eq.setEquipment(slot, item))
                        failed = true;
                }
                catch {
                    failed = true;
                }
                try {
                    this.bag.set(target, undefined);
                }
                catch {
                    failed = true;
                }
                throw new TaskFault((failed ? "CRITICAL unequip rollback failed: " : "Unequip failed: ") +
                    String(error));
            }
            count++;
        }
        return count;
    }
}
