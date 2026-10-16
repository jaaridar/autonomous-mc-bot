// One module now: runtime/equipment.js + runtime/furnace.js (see docs/ARCHITECTURE.md).
import { TaskFault } from "../core/arbiter.js";
import { QUICK_TOOL_CHAIN } from "../core/knowledge.js";
import { CARDINAL, COMPASS, add, center, distance, floor, key } from "../core/math.js";
import { amountOf, destination, fuelCount, smeltOutput, transfer } from "../core/recipes.js";
import { NativeInventory } from "./inventory.js";
import { Direction, EntityComponentTypes, EquipmentSlot, ItemStack } from "@minecraft/server";

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

        const anyLogs = amountOf(counts, "#logs");
        const anyPlanks = amountOf(counts, "#planks");
        // If no weapon at all, emergency quick tool - any wood works, never oak-only
        if (!hasWeapon) {
            const sticks = counts["minecraft:stick"] ?? 0;
            if (anyLogs >= 1 && anyPlanks < 4) return { need: "#planks", reason: "need planks for quick weapon - any wood works", priority: 1000, craft: true };
            if (anyPlanks >= 2 && sticks < 2) return { need: "minecraft:stick", reason: "need sticks for quick weapon - any wood works", priority: 1000, craft: true };
            if (anyPlanks >= 2 && sticks >= 1) return { need: "minecraft:wooden_sword", reason: "no weapon - craft wooden sword #1 priority - any wood", priority: 1000, craft: true };
            if ((counts["minecraft:cobblestone"] ?? 0) + (counts["minecraft:cobbled_deepslate"] ?? 0) >= 3 && sticks >= 2) return { need: "minecraft:stone_sword", reason: "upgrade to stone sword", priority: 900, craft: true };
            if ((counts["minecraft:iron_ingot"] ?? 0) >= 2 && sticks >= 1) return { need: "minecraft:iron_sword", reason: "upgrade to iron sword", priority: 950, craft: true };
        }

        // Normal quick tool chain evaluation
        for (const step of QUICK_TOOL_CHAIN) {
            const needHave = amountOf(counts, step.need);
            if (needHave < step.amount) return { need: step.need, reason: step.reason, priority: 800 + (step.need.includes("sword") ? 200 : 0), craft: true };
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
const FURNACE_BLOCKS = new Set(["minecraft:furnace", "minecraft:lit_furnace"]);
/** Face of a clicked block the engine places into for a direction (builder.js rule). */
const FACES = new Map([
    ["1,0,0", Direction.East],
    ["-1,0,0", Direction.West],
    ["0,0,1", Direction.South],
    ["0,0,-1", Direction.North],
    ["0,1,0", Direction.Up],
    ["0,-1,0", Direction.Down],
]);
const faceFor = (d) => FACES.get(`${d.x},${d.y},${d.z}`);

export class Furnace {
    constructor(sim, bag, terrain, nav, host, bot) {
        this.sim = sim;
        this.bag = bag;
        this.terrain = terrain;
        this.nav = nav;
        this.host = host;
        this.bot = bot;
        this.rejected = new Map();
        this.attempts = 0;
        this.carve = undefined;
        this.noSpotSince = 0;
        this.relocateSince = 0;
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
        // A placement was requested: verify, adopt a mis-aimed result, or retry.
        if (this.pending) {
            const b = this.terrain.block(this.pending.p);
            if (b && FURNACE_BLOCKS.has(b.typeId)) {
                this.location = { ...this.pending.p };
                this.pending = undefined;
                this.attempts = 0;
                this.noSpotSince = 0;
                this.lastReason = "Furnace placement verified.";
                return true;
            }
            if (tick - this.pending.tick <= 30)
                return false;
            const at = { ...this.pending.p };
            this.pending = undefined;
            this.reject(at, tick);
            // The engine can land the block on a neighbouring face: adopt any
            // furnace that appeared around the attempt or the access point.
            const found = this.nearbyFurnace(at, 2) ?? (this.access ? this.nearbyFurnace(this.access, 2) : undefined);
            if (found) {
                this.location = found;
                this.attempts = 0;
                this.lastReason = "Furnace placement verified (adopted the block the engine placed).";
                return true;
            }
            if (this.bag.find((s) => s.typeId === "minecraft:furnace") < 0)
                throw new TaskFault("Furnace item was consumed without a placed block; re-obtaining one.", "retry");
            this.attempts++;
            this.lastReason = "Placement was not observed at the last spot; trying another surface.";
            // fall through: pick another spot on this tick
        }
        if (this.location) {
            this.inventory();
            return true;
        }
        const slot = this.bag.find((s) => s.typeId === "minecraft:furnace");
        if (slot < 0)
            throw Error("A furnace item is required.");
        const base = floor(this.sim.location);
        const spot = this.findPlacementSpot(base, tick);
        if (spot) {
            this.attempts++;
            if (this.tryPlace(spot, slot)) {
                this.pending = { p: spot.p, tick };
                this.access = floor(this.sim.location);
                this.lastReason = "Waiting for native furnace placement.";
                return false;
            }
            this.reject(spot.p, tick);
            this.lastReason = "The engine refused the placement; trying another surface.";
            if (this.attempts > 12)
                throw new TaskFault("Furnace placement refused everywhere nearby; backing off to retry.", "retry");
            return false;
        }
        // No surface at all nearby: carve a niche at foot level (a wall block
        // becomes a shelf; the opened cell becomes a placement surface).
        if (this.carveSpot(base, tick)) {
            this.noSpotSince = 0;
            return false;
        }
        // Relocate towards open ground and keep trying - never a dead end.
        if (this.relocateSpot(base, tick)) {
            this.noSpotSince = 0;
            return false;
        }
        if (!this.noSpotSince) this.noSpotSince = tick;
        if (tick - this.noSpotSince > 600)
            throw new TaskFault("No furnace placement surface anywhere nearby; waiting to retry.", "retry");
        this.lastReason = "No furnace surface here yet; searching for open ground.";
        return false;
    }
    tryPlace(spot, slot) {
        try {
            const selected = this.bag.select(slot);
            this.sim.lookAtBlock(this.host.relative(center(spot.block)));
            const ok = !!this.sim.useItemInSlotOnBlock(selected, this.host.relative(center(spot.block)), spot.face);
            this.bag.invalidate?.();
            return ok;
        }
        catch (_e) {
            return false;
        }
    }
    /** Nearest-first flat surfaces, then a wall face beside the bot. */
    findPlacementSpot(base, tick) {
        for (const r of [2, 3, 4])
            for (const dy of [0, -1, 1])
                for (const d of CARDINAL) {
                    const p = add(base, { x: d.x * r, y: dy, z: d.z * r });
                    if ((this.rejected.get(key(p)) ?? 0) > tick)
                        continue;
                    if (!this.terrain.freshSafe(p))
                        continue;
                    if (!this.terrain.line(this.sim.getHeadLocation(), add(p, { x: 0.5, y: -0.01, z: 0.5 }), add(p, { x: 0, y: -1, z: 0 })))
                        continue;
                    return { p, block: add(p, { x: 0, y: -1, z: 0 }), face: Direction.Up };
                }
        // Wall/ceiling support: click a solid block one step further out so the
        // furnace lands in the open cell beside the bot (1-wide shafts, cave walls).
        for (const d of CARDINAL)
            for (const dy of [0, 1]) {
                const c = add(base, { x: d.x, y: dy, z: d.z });
                if ((this.rejected.get(key(c)) ?? 0) > tick)
                    continue;
                const s = add(base, { x: d.x * 2, y: dy, z: d.z * 2 });
                this.terrain.freshSafe(c);
                if (!this.terrain.empty(c))
                    continue;
                if (!this.terrain.solid(s))
                    continue;
                const face = faceFor({ x: -d.x, y: 0, z: -d.z });
                if (!face)
                    continue;
                if (!this.terrain.line(this.sim.getHeadLocation(), add(s, { x: 0.5, y: 0.5, z: 0.5 }), s))
                    continue;
                return { p: c, block: s, face };
            }
        return undefined;
    }
    /** Open a spot when none exists: break one adjacent wall block, one swing at a time. */
    carveSpot(base, tick) {
        const dig = this.bot?.digCell;
        if (typeof dig !== "function")
            return false;
        if (this.carve) {
            const tb = this.terrain.block(this.carve.cell);
            if (!tb || tb.isAir) { this.carve = undefined; return false; }
            if (tick - this.carve.since > 240) {
                this.reject(this.carve.cell, tick);
                this.carve = undefined;
                return false;
            }
            if (tick - this.carve.at >= 90) {
                this.carve.at = tick;
                let r;
                try { r = dig.call(this.bot, this.carve.cell, tick); } catch (_e) { r = undefined; }
                if (r === "open") { this.carve = undefined; return false; }
            }
            return true;
        }
        for (const d of CARDINAL) {
            const cell = add(base, d);
            if ((this.rejected.get(key(cell)) ?? 0) > tick)
                continue;
            const b = this.terrain.block(cell);
            if (!b || b.isAir || b.isLiquid)
                continue;
            if (this.terrain.lavaNear(cell))
                continue;
            let r;
            try { r = dig.call(this.bot, cell, tick); } catch (_e) { r = undefined; }
            if (r === "open" || r === "digging") {
                this.carve = { cell: { ...cell }, since: tick, at: tick };
                this.lastReason = "Carving a spot for the furnace (" + b.typeId + ").";
                return true;
            }
            this.reject(cell, tick);
        }
        return false;
    }
    /** Walk to nearby open ground when this position offers nothing at all. */
    relocateSpot(base, tick) {
        if (tick - this.relocateSince < 60)
            return false;
        this.relocateSince = tick;
        for (const r of [4, 6, 10])
            for (const d of CARDINAL) {
                const q = add(base, { x: d.x * r, y: 0, z: d.z * r });
                const g = this.terrain.groundNear(q.x, q.z, q.y, 3);
                if (!g || this.terrain.dangerous(g))
                    continue;
                try {
                    if (this.nav.go(center(g), tick) !== "failed") {
                        this.lastReason = "Moving towards open ground to place the furnace.";
                        return true;
                    }
                }
                catch (_e) { /* keep looking */ }
            }
        return false;
    }
    reject(p, tick) {
        this.rejected.set(key(p), tick + 600);
        if (this.rejected.size > 48)
            this.rejected.clear();
    }
    nearbyFurnace(c, r = 2) {
        for (let dx = -r; dx <= r; dx++)
            for (let dz = -r; dz <= r; dz++)
                for (let dy = -r; dy <= r; dy++) {
                    const b = this.terrain.block({ x: c.x + dx, y: c.y + dy, z: c.z + dz });
                    if (b && FURNACE_BLOCKS.has(b.typeId))
                        return { x: c.x + dx, y: c.y + dy, z: c.z + dz };
                }
        return undefined;
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
