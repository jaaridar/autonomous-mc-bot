// One module now: runtime/equipment.js + runtime/furnace.js (see docs/ARCHITECTURE.md).
import { TaskFault } from "../core/arbiter.js";
import { QUICK_TOOL_CHAIN } from "../core/knowledge.js";
import { CARDINAL, add, center, distance, floor } from "../core/math.js";
import { destination, fuelCount, smeltOutput, transfer } from "../core/recipes.js";
import { NativeInventory } from "./inventory.js";
import { EntityComponentTypes, EquipmentSlot, ItemStack } from "@minecraft/server";

// ---------------------------------------------------------------- equipment.js

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
    constructor(sim, bag, avatar) {
        this.sim = sim;
        this.bag = bag;
        this.avatar = avatar;   // furnace/bed placement goes through the driver
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

// ---------------------------------------------------------------- furnace.js

/** Uses a real placed furnace: 0=input, 1=fuel, 2=output. Engine does the cooking. */
export class Furnace {
    constructor(sim, bag, terrain, nav, host) {
        this.sim = sim;
        this.bag = bag;
        this.terrain = terrain;
        this.nav = nav;
        this.host = host;
        this.lastReason = "No furnace placed.";
    }
    get jobActive() {
        return !!this.job;
    }
    get placing() {
        return !!this.pending;
    }
    get active() {
        return !!this.job || !!this.pending;
    }
    status() {
        return {
            position: this.location,
            pending: this.pending,
            job: this.job,
            reason: this.lastReason,
        };
    }
    inventory() {
        if (!this.location)
            throw Error("No owned furnace.");
        const b = this.terrain.block(this.location);
        if (!b ||
            !["minecraft:furnace", "minecraft:lit_furnace"].includes(b.typeId))
            throw Error("Owned furnace missing/unloaded; recover it manually.");
        const c = b.getComponent("minecraft:inventory")?.container;
        if (!c || c.size < 3)
            throw Error("Native furnace inventory unavailable.");
        return new NativeInventory(c);
    }
    releaseEmpty() {
        if (this.pending) {
            const b = this.terrain.block(this.pending.p);
            if (!b ||
                !["minecraft:furnace", "minecraft:lit_furnace"].includes(b.typeId))
                throw Error("Resolve pending placement first.");
            this.location = this.pending.p;
            this.pending = undefined;
        }
        if (!this.location)
            return;
        const inv = this.inventory();
        if (Array.from({ length: inv.size }, (_, i) => inv.get(i)).some(Boolean))
            throw Error("Empty the furnace input/fuel/output manually before releasing it.");
        this.job = undefined;
        this.location = undefined;
        this.lastReason =
            "Empty furnace released by owner; block remains in world.";
    }
    hasItems() {
        if (this.pending || this.job)
            return true;
        if (!this.location)
            return false;
        try {
            const c = this.inventory();
            return Array.from({ length: c.size }, (_, i) => c.get(i)).some(Boolean);
        }
        catch {
            return true;
        }
    }
    place(tick) {
        if (this.pending) {
            const b = this.terrain.block(this.pending.p);
            if (b &&
                ["minecraft:furnace", "minecraft:lit_furnace"].includes(b.typeId)) {
                this.location = { ...this.pending.p };
                this.pending = undefined;
                this.lastReason = "Furnace placement verified.";
                return true;
            }
            if (tick - this.pending.tick > 30)
                throw Error("Furnace placement not observed; inspect consumed item/location.");
            return false;
        }
        if (this.location) {
            this.inventory();
            return true;
        }
        const slot = this.bag.find((s) => s.typeId === "minecraft:furnace");
        if (slot < 0)
            throw Error("A furnace item is required.");
        const base = floor(this.sim.location);
        const p = CARDINAL.map((d) => add(base, { x: d.x * 2, y: 0, z: d.z * 2 })).find((p) => this.terrain.freshSafe(p) &&
            this.terrain.line(this.sim.getHeadLocation(), add(p, { x: 0.5, y: -0.01, z: 0.5 }), add(p, { x: 0, y: -1, z: 0 })));
        if (!p)
            throw new TaskFault("No safe furnace placement surface.", "retry");
        const selected = this.bag.select(slot), ground = add(p, { x: 0, y: -1, z: 0 });
        this.avatar.lookBlock(ground);
        if (!this.avatar.useOn(selected, ground))
            throw Error("Furnace placement rejected by engine.");
        this.pending = { p, tick };
        this.access = floor(this.sim.location);
        this.lastReason = "Waiting for native furnace placement.";
        return false;
    }
    approach(tick) {
        if (!this.location)
            throw Error("No furnace location.");
        if (distance(this.sim.location, this.location) <= 3.5 &&
            this.terrain.line(this.sim.getHeadLocation(), add(this.location, { x: 0.5, y: 0.5, z: 0.5 }), this.location)) {
            this.nav.reset();
            return true;
        }
        if (distance(this.sim.location, this.location) > 12 && this.access) {
            if (this.nav.go(center(this.access), tick) === "failed")
                throw Error("Cannot return to furnace region: " + this.nav.reason);
            return false;
        }
        const choices = CARDINAL.map((d) => add(this.location, d)).filter((p) => this.terrain.safe(p));
        choices.sort((a, b) => distance(a, this.sim.location) - distance(b, this.sim.location));
        if (!choices.length)
            throw new TaskFault("No accessible furnace standing position.", "retry");
        if (this.nav.go(center(choices[0]), tick) === "failed")
            throw new TaskFault("Cannot return to furnace: " + this.nav.reason, "retry");
        return false;
    }
    start(inputSlot, amount, fuelSlot, tick) {
        if (this.job)
            throw Error("Furnace already has a tracked job.");
        if (!this.location || distance(this.sim.location, this.location) > 3.5)
            throw Error("Too far from furnace.");
        const inv = this.inventory(), input = this.bag.get(inputSlot), fuel = this.bag.get(fuelSlot);
        if (!input || !fuel || inputSlot === fuelSlot)
            throw Error("Input/fuel unavailable.");
        const output = smeltOutput(input.typeId);
        if (!output)
            throw Error("Unsupported smelting recipe.");
        const n = fuelCount(fuel.typeId, amount);
        if (input.amount < amount || fuel.amount < n)
            throw Error("Insufficient input or fuel.");
        // Only use this bot's own empty furnace, never an arbitrary user's container.
        if (inv.get(0) || inv.get(1) || inv.get(2))
            throw Error("Furnace contains untracked material. Reclaim it first.");
        if (destination(this.bag, new ItemStack(output, amount), amount) < 0)
            throw Error("No space reserved for furnace output.");
        transfer(this.bag, fuelSlot, inv, 1, n);
        try {
            transfer(this.bag, inputSlot, inv, 0, amount);
        }
        catch (e) {
            try {
                transfer(inv, 1, this.bag, fuelSlot, n);
            }
            catch {
                throw Error("CRITICAL furnace-load rollback failed. Inspect both inventories.");
            }
            throw e;
        }
        this.job = {
            input: input.typeId,
            output,
            amount,
            collected: 0,
            started: tick,
        };
        this.lastReason =
            "Waiting for real engine smelting; no output is generated by script.";
    }
    poll(tick) {
        if (!this.job)
            return true;
        if (!this.approach(tick))
            return false;
        const inv = this.inventory(), job = this.job, out = inv.get(2), input = inv.get(0);
        if (input && input.typeId !== job.input)
            throw Error("Furnace input changed unexpectedly.");
        if (out) {
            if (out.typeId !== job.output || out.amount > job.amount - job.collected)
                throw Error("Unexpected furnace output; stop and inspect.");
            const slot = destination(this.bag, out, out.amount);
            if (slot < 0)
                throw Error("Inventory full while collecting furnace output.");
            transfer(inv, 2, this.bag, slot, out.amount);
            job.collected += out.amount;
        }
        if (job.collected >= job.amount) {
            if (inv.get(0))
                throw Error("Furnace finished output but input remains; external interference suspected.");
            // Return unused fuel exactly as stored by the engine; burning fuel cannot be reclaimed.
            const spare = inv.get(1);
            if (spare) {
                const slot = destination(this.bag, spare, spare.amount);
                if (slot < 0)
                    throw Error("No space for unused fuel.");
                transfer(inv, 1, this.bag, slot, spare.amount);
            }
            this.job = undefined;
            this.lastReason = "Observed output collected; unused fuel returned.";
            return true;
        }
        if (tick - job.started > job.amount * 200 + 800)
            throw Error("Native furnace made insufficient progress. Items remain in the furnace; no synthetic output/restoration.");
        return false;
    }
}
