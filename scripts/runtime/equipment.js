import { EquipmentSlot, EntityComponentTypes, } from "@minecraft/server";
import { TaskFault } from "../core/recovery.js";
import { QUICK_TOOL_CHAIN, retainScore, isCritical } from "../core/knowledge.js";

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

function weaponRank(type) {
    if (type.includes("netherite_sword")) return 6;
    if (type.includes("diamond_sword")) return 5;
    if (type.includes("iron_sword")) return 4;
    if (type.includes("stone_sword")) return 3;
    if (type.includes("wooden_sword")) return 2;
    if (type.includes("iron_axe")) return 3.5;
    if (type.includes("stone_axe")) return 2.5;
    if (type.includes("wooden_axe")) return 1.5;
    if (type.includes("_axe")) return 1;
    if (type.includes("_pickaxe")) return 0.5;
    if (type.includes("_shovel")) return 0.3;
    return 0;
}

function usable(item) {
    if (!item) return false;
    const d = item.getComponent("minecraft:durability");
    return !d || d.maxDurability - d.damage > 2;
}

function score(item) {
    if (!usable(item)) return -1;
    const d = item.getComponent("minecraft:durability");
    return (rank(item.typeId) * 100 + (d ? (d.maxDurability - d.damage) / d.maxDurability : 1));
}

function weaponScore(item) {
    if (!usable(item)) return -1;
    const d = item.getComponent("minecraft:durability");
    const base = weaponRank(item.typeId) * 100;
    return base + (d ? (d.maxDurability - d.damage) / d.maxDurability : 1);
}

export class Equipment {
    constructor(sim, bag) {
        this.sim = sim;
        this.bag = bag;
        this.faultReason = "";
        this.lastQuickTool = 0;
    }

    equippable() {
        const eq = this.sim.getComponent(EntityComponentTypes.Equippable);
        if (!eq) throw new TaskFault("Equippable component unavailable.");
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

    // World-class: never fight bare hand, quick tool priority #1
    hasWeapon() {
        const counts = this.bag.counts();
        const weapons = ["minecraft:wooden_sword","minecraft:stone_sword","minecraft:iron_sword","minecraft:diamond_sword","minecraft:netherite_sword","minecraft:wooden_axe","minecraft:stone_axe","minecraft:iron_axe","minecraft:diamond_axe"];
        for (const w of weapons) {
            if ((counts[w] ?? 0) > 0) return true;
        }
        // Check equipped
        try {
            const eq = this.equippable();
            // Main hand not directly equippable, but check if any weapon in inventory is usable
            for (let i = 0; i < this.bag.size; i++) {
                const item = this.bag.get(i);
                if (!item) continue;
                if (weaponRank(item.typeId) > 0 && usable(item)) return true;
            }
        } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }
        return false;
    }

    bestWeaponSlot() {
        let best = -1, bestScore = -1;
        for (let i = 0; i < this.bag.size; i++) {
            const item = this.bag.get(i);
            if (!item) continue;
            const ws = weaponScore(item);
            if (ws > bestScore) {
                bestScore = ws;
                best = i;
            }
        }
        return best;
    }

    ensureWeaponEquipped() {
        const slot = this.bestWeaponSlot();
        if (slot < 0) return false;
        try {
            this.bag.select(slot);
            return true;
        } catch { return false; }
    }

    quickToolNeeded(tick) {
        // Check quick tool chain - priority #1 never bare hand
        const counts = this.bag.counts();
        const hasWeapon = this.hasWeapon();

        // If no weapon at all, emergency quick tool - UNBREAKABLE: any wood, desert bushes
        if (!hasWeapon) {
            // Check what we can craft immediately - any log type, any wood, even desert
            const logs = Object.entries(counts).filter(([k]) => k.endsWith("_log") || k.endsWith("_wood") || k.includes("_stem") || k.includes("_hyphae")).reduce((a,[,v])=>a+v,0);
            const planks = Object.entries(counts).filter(([k]) => k.includes("_planks")).reduce((a,[,v])=>a+v,0);
            const sticks = counts["minecraft:stick"] ?? 0;
            const cobble = counts["minecraft:cobblestone"] ?? 0;
            const iron = counts["minecraft:iron_ingot"] ?? 0;
            const hasDeadBush = (counts["minecraft:deadbush"] ?? 0) + (counts["minecraft:dead_bush"] ?? 0);

            if (logs >= 1 && planks < 4) return { need: "minecraft:oak_planks", reason: "need planks for quick weapon - any wood works", priority: 1000 };
            if (planks >= 2 && sticks < 2) return { need: "minecraft:stick", reason: "need sticks for quick weapon - any wood works", priority: 1000 };
            if ((planks >= 2 || hasDeadBush >= 1) && sticks < 2) {
                // In desert, dead bush gives sticks - try to get sticks via mining dead bush
                if (sticks < 2 && hasDeadBush === 0) {
                    // Need to mine dead bush
                    return { need: "minecraft:stick", reason: "need sticks from dead bush in desert", priority: 1000 };
                }
            }
            if ((planks >= 2 && sticks >= 1) || (sticks >= 1 && hasDeadBush >= 1) && !hasWeapon) {
                // Can craft wooden sword or axe - any wood works
                return { need: "minecraft:wooden_sword", reason: "no weapon - craft wooden sword #1 priority - any wood", priority: 1000, craft: true };
            }
            if (cobble >= 3 && sticks >= 2) {
                return { need: "minecraft:stone_sword", reason: "upgrade to stone sword", priority: 900, craft: true };
            }
            if (iron >= 2 && sticks >= 1) {
                return { need: "minecraft:iron_sword", reason: "upgrade to iron sword", priority: 950, craft: true };
            }
        }

        // Normal quick tool chain evaluation
        for (const step of QUICK_TOOL_CHAIN) {
            const have = step.have.every(h => (counts[h] ?? 0) > 0 || Object.keys(counts).some(k => k.includes(h.split(":")[1] ?? h)));
            const needHave = counts[step.need] ?? 0;
            if (needHave < step.amount) {
                // Check if we have prerequisites
                let canCraft = true;
                // Simplified check
                if (step.need === "minecraft:oak_planks" && (counts["minecraft:oak_log"] ?? 0) < 1) canCraft = false;
                if (step.need === "minecraft:stick" && (counts["minecraft:oak_planks"] ?? 0) < 2) canCraft = false;
                if (step.need.includes("_pickaxe") && (counts["minecraft:stick"] ?? 0) < 2) canCraft = false;
                if (canCraft) {
                    return { need: step.need, reason: step.reason, priority: 800 + (step.need.includes("sword") ? 200 : 0), craft: true };
                }
            }
        }
        return null;
    }

    autoEquip() {
        const eq = this.equippable();
        let changes = 0;
        for (const armor of ARMOR) {
            const worn = eq.getEquipment(armor.slot);
            let best = -1, bestScore = score(worn);
            for (let i = 0; i < this.bag.size; i++) {
                const item = this.bag.get(i);
                if (!item?.typeId.endsWith("_" + armor.suffix)) continue;
                const value = score(item);
                if (value > bestScore) {
                    best = i;
                    bestScore = value;
                }
            }
            if (best < 0) continue;
            const candidate = this.bag.get(best);
            try {
                if (!eq.setEquipment(armor.slot, candidate)) throw Error("Equipment write rejected.");
                this.bag.set(best, worn);
            } catch (error) {
                let failed = false;
                try { if (!eq.setEquipment(armor.slot, worn)) failed = true; } catch { failed = true; }
                try { this.bag.set(best, candidate); } catch { failed = true; }
                throw new TaskFault((failed ? "CRITICAL equipment rollback failed: " : "Equipment swap failed: ") + String(error));
            }
            changes++;
        }
        // Also equip shield in offhand if have and no shield equipped
        try {
            const offhand = eq.getEquipment(EquipmentSlot.Offhand);
            if (!offhand || !offhand.typeId.includes("shield")) {
                for (let i = 0; i < this.bag.size; i++) {
                    const item = this.bag.get(i);
                    if (item?.typeId === "minecraft:shield" && usable(item)) {
                        const prev = offhand;
                        if (eq.setEquipment(EquipmentSlot.Offhand, item)) {
                            this.bag.set(i, prev);
                            changes++;
                            break;
                        }
                    }
                }
            }
        } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }
        return changes;
    }

    unequipAll() {
        const eq = this.equippable(), slots = [...ARMOR.map((a) => a.slot), EquipmentSlot.Offhand];
        const present = slots.filter((s) => !!eq.getEquipment(s));
        if (this.bag.container.emptySlotsCount < present.length) throw new TaskFault("Make enough empty inventory slots before unequipping.");
        let count = 0;
        for (const slot of present) {
            const item = eq.getEquipment(slot);
            let target = -1;
            for (let i = 0; i < this.bag.size; i++) if (!this.bag.get(i)) { target = i; break; }
            try {
                if (!eq.setEquipment(slot, undefined)) throw Error("Equipment removal rejected.");
                this.bag.set(target, item);
            } catch (error) {
                let failed = false;
                try { if (!eq.setEquipment(slot, item)) failed = true; } catch { failed = true; }
                try { this.bag.set(target, undefined); } catch { failed = true; }
                throw new TaskFault((failed ? "CRITICAL unequip rollback failed: " : "Unequip failed: ") + String(error));
            }
            count++;
        }
        return count;
    }
}
