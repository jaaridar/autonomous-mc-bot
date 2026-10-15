import { TaskFault } from "../core/recovery.js";
import { ItemStack } from "@minecraft/server";
import { CARDINAL, add, floor, center, distance } from "../core/math.js";
import { smeltOutput, fuelCount } from "../core/survival.js";
import { transfer, destination } from "../core/transfer.js";
import { NativeInventory } from "./inventory.js";
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
        this.sim.lookAtBlock(this.host.relative(ground));
        if (!this.sim.useItemInSlotOnBlock(selected, this.host.relative(ground)))
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
