import { Furnace } from "./furnace.js";
import { Forager } from "./foraging.js";
import { FOOD, RAW_MEAT, RISKY_FOOD } from "../core/policy.js";
import { RAW_TO_COOKED, fuelCount } from "../core/survival.js";
import { amountOf, id, matches, bedTarget } from "../core/recipes.js";
import { distance } from "../core/math.js";
/** Observation-driven survival loop. No fabricated items or claimed speedrun completion. */
export class SurvivalDirector {
    constructor(bot) {
        this.bot = bot;
        this.branch = "";
        this.stage = 0;
        this.signature = "";
        this.lastProgress = 0;
        this.began = 0;
        this.furnace = new Furnace(bot.sim, bot.bag, bot.terrain, bot.nav, bot.host);
        this.forager = new Forager(bot.sim, bot.bag, bot.terrain, bot.nav);
    }
    reset(tick) {
        this.branch = "";
        this.stage = 0;
        this.lastProgress = tick;
        this.began = tick;
        this.forager.reset();
    }
    recover() {
        this.branch = "";
        this.forager.reset();
    }
    resume(tick) {
        this.lastProgress = tick;
        this.forager.reset();
    }
    enter(branch) {
        if (this.branch !== branch) {
            this.bot.cancelWork();
            this.branch = branch;
            if (branch !== "food-search")
                this.forager.reset();
        }
    }
    status() {
        return {
            phase: this.branch,
            stage: this.stage,
            startedTick: this.began,
            lastInventoryProgress: this.lastProgress,
            furnace: this.furnace.status(),
        };
    }
    ensure(item, amount, tick) {
        this.enter("obtain:" + item);
        return this.bot.obtain(item, amount, tick);
    }
    produce(inputWanted, amount, tick) {
        const b = this.bot;
        if (this.furnace.jobActive) {
            this.enter("smelting");
            b.reason = "Waiting for/collecting native furnace output";
            return this.furnace.poll(tick);
        }
        if (!this.furnace.location) {
            if (!this.furnace.placing && !amountOf(b.bag.counts(), id("furnace"))) {
                this.ensure(id("furnace"), 1, tick);
                return false;
            }
            this.enter("place-furnace");
            b.reason = "Placing and verifying a real furnace";
            if (!this.furnace.place(tick))
                return false;
        }
        if (amountOf(b.bag.counts(), inputWanted) < amount) {
            this.ensure(inputWanted, amount, tick);
            return false;
        }
        let inputSlot = b.bag.find((s) => matches(s.typeId, inputWanted));
        if (inputSlot < 0)
            return false;
        const input = b.bag.get(inputSlot);
        let fuelSlot = -1, batch = 0;
        fuelSearch: for (const kind of [id("coal"), id("charcoal"), "#planks"])
            for (let slot = 0; slot < b.bag.size; slot++) {
                const item = b.bag.get(slot);
                if (!item || !matches(item.typeId, kind))
                    continue;
                const capacity = Math.floor(item.amount * (kind === "#planks" ? 1.5 : 8));
                const n = Math.min(8, amount, input.amount, capacity);
                if (n > 0 && item.amount >= fuelCount(item.typeId, n)) {
                    fuelSlot = slot;
                    batch = n;
                    break fuelSearch;
                }
            }
        if (fuelSlot < 0) {
            this.ensure("#planks", amountOf(b.bag.counts(), "#planks") + 2, tick);
            return false;
        }
        this.enter("load-furnace");
        b.reason = "Returning to furnace with input and fuel";
        if (!this.furnace.approach(tick))
            return false;
        // Slot reads are refreshed on every tick; no deferred inventory assumptions.
        inputSlot = b.bag.find((s) => s.typeId === input.typeId);
        this.furnace.start(inputSlot, batch, fuelSlot, tick);
        return false;
    }
    tick(tick) {
        const b = this.bot;
        if (!b.settings.assistedCrafting) {
            b.blockTask("auto requires !bot config crafting on.");
            return;
        }
        const stock = b.bag.counts(), signature = JSON.stringify(stock);
        if (signature !== this.signature) {
            this.signature = signature;
            this.lastProgress = tick;
        }
        if (tick - this.lastProgress > 12000) {
            b.record("No inventory progress for 10m, resetting taskStart and progress tracking");
            b.taskStart = tick;
            this.lastProgress = tick;
            this.signature = "";
            return;
        }
        const hunger = b.sim.getComponent("minecraft:player.hunger")?.currentValue ?? 20;
        // Finish already-loaded batches before issuing a different inventory job.
        if (this.furnace.jobActive || this.furnace.placing) {
            if (this.furnace.placing) {
                this.enter("place-furnace");
                this.furnace.place(tick);
            }
            else {
                this.enter("smelting");
                b.reason = "Waiting for/collecting real furnace output";
                this.furnace.poll(tick);
            }
            return;
        }
        const safeFood = Object.entries(stock).reduce((n, [type, amount]) => n + (FOOD.has(type) ? amount : 0), 0);
        const anyFood = Object.entries(stock).reduce((n, [type, amount]) => n + (FOOD.has(type) || RAW_MEAT.has(type) || RISKY_FOOD.has(type) ? amount : 0), 0);
        if ((hunger <= 16 || this.stage >= 6) && safeFood < 4) {
            // Cook raw meat already carried before ranging out for food.
            const raw = b.bag.find((s) => !!RAW_TO_COOKED[s.typeId]);
            if (raw >= 0) {
                const item = b.bag.get(raw);
                this.produce(item.typeId, Math.min(4, item.amount), tick);
                return;
            }
            // Risky food in hand keeps the bot alive; do not stall the whole plan.
            if (anyFood < 3 || hunger <= 6) {
                this.enter("food-search");
                this.forager.step(tick, b.home(), b.settings.range, b.settings.hunting);
                b.reason = this.forager.reason;
                return;
            }
        }
        const usable = b.bag.usableCounts();
        const basic = ["stone_pickaxe", "stone_axe", "stone_sword"];
        // --- Working reserves -------------------------------------------------
        // Gather the whole stone budget in one trip instead of returning to the
        // same rock face for three cobblestone per recipe.
        const needsStone = basic.some((name) => !["stone", "iron", "diamond", "netherite"].some((m) => (usable[id(m + "_" + name.split("_").slice(-1)[0])] ?? 0) > 0));
        if (needsStone && (stock[id("cobblestone")] ?? 0) < 20) {
            this.stage = 0;
            this.ensure(id("cobblestone"), 20, tick);
            return;
        }
        for (let i = 0; i < basic.length; i++) {
            const type = id(basic[i]);
            // Iron/diamond/netherite tools satisfy lower-tier maintenance goals.
            const kind = basic[i].split("_").slice(-1)[0];
            const better = Object.keys(usable).some((k) => k.endsWith("_" + kind) &&
                ["iron_", "diamond_", "netherite_"].some((material) => k.includes(material)) &&
                usable[k] > 0);
            if (!better && !(usable[type] > 0)) {
                this.stage = i;
                this.ensure(type, 1, tick);
                return;
            }
        }
        this.stage = 3;
        if (!this.furnace.location) {
            if (!(stock[id("furnace")] > 0)) {
                this.ensure(id("furnace"), 1, tick);
                return;
            }
            this.enter("place-furnace");
            this.furnace.place(tick);
            return;
        }
        const needPick = !(usable[id("iron_pickaxe")] > 0 ||
            usable[id("diamond_pickaxe")] > 0 ||
            usable[id("netherite_pickaxe")] > 0);
        const needSword = !(usable[id("iron_sword")] > 0 ||
            usable[id("diamond_sword")] > 0 ||
            usable[id("netherite_sword")] > 0);
        const ironNeeded = (needPick ? 3 : 0) + (needSword ? 2 : 0);
        if ((stock[id("iron_ingot")] ?? 0) < ironNeeded) {
            this.stage = 4;
            this.produce(id("raw_iron"), ironNeeded - (stock[id("iron_ingot")] ?? 0), tick);
            return;
        }
        if (needPick) {
            this.ensure(id("iron_pickaxe"), 1, tick);
            return;
        }
        if (needSword) {
            this.ensure(id("iron_sword"), 1, tick);
            return;
        }
        this.stage = 5;
        if ((stock[id("torch")] ?? 0) < 8) {
            if (amountOf(stock, "#carbon") < 1) {
                this.produce("#logs", 1, tick);
                return;
            }
            this.ensure(id("torch"), 8, tick);
            return;
        }
        this.stage = 6;
        if (b.settings.armor) {
            const armor = b.equipment.nextIronGoal();
            if (armor) {
                if ((usable[armor.item] ?? 0) > 0) {
                    b.equipment.autoEquip();
                    return;
                }
                if ((stock[id("iron_ingot")] ?? 0) < armor.ingots) {
                    this.produce(id("raw_iron"), armor.ingots - (stock[id("iron_ingot")] ?? 0), tick);
                    return;
                }
                this.ensure(armor.item, 1, tick);
                return;
            }
        }
        this.stage = 7;
        // --- Opportunistic upgrades -------------------------------------------
        // Only from materials already in stock: never commit to an open-ended
        // hunt for iron/diamonds, which would stall everything else.
        const has = (type) => (usable[type] ?? 0) > 0;
        // Diamonds are only worth a shaft once an iron pickaxe exists, because
        // deepslate diamond ore needs tier 3. The miner knows the right level.
        if (b.settings.deepMining &&
            (stock[id("diamond")] ?? 0) < 3 &&
            !has(id("diamond_pickaxe")) &&
            !has(id("netherite_pickaxe")) &&
            (usable[id("iron_pickaxe")] ?? 0) > 0) {
            this.ensure(id("diamond"), 3 - (stock[id("diamond")] ?? 0), tick);
            return;
        }
        if (!has(id("iron_axe")) &&
            !["diamond", "netherite"].some((m) => has(id(m + "_axe"))) &&
            (stock[id("iron_ingot")] ?? 0) >= 3) {
            this.ensure(id("iron_axe"), 1, tick);
            return;
        }
        if ((stock[id("diamond")] ?? 0) >= 3 &&
            !has(id("diamond_pickaxe")) &&
            !has(id("netherite_pickaxe"))) {
            this.ensure(id("diamond_pickaxe"), 1, tick);
            return;
        }
        if ((stock[id("diamond")] ?? 0) >= 2 &&
            !has(id("diamond_sword")) &&
            !has(id("netherite_sword"))) {
            this.ensure(id("diamond_sword"), 1, tick);
            return;
        }
        // A bed turns every night into a skipped night. Wool arrives as a
        // sheep-hunting byproduct; vanilla colours do not mix, so only craft
        // once 3 wool of a single colour are held.
        if (b.settings.camp && !Object.keys(stock).some((k) => k.endsWith("_bed"))) {
            const bed = bedTarget(stock);
            if (bed) {
                this.ensure(bed, 1, tick);
                return;
            }
        }
        this.lastProgress = tick;
        this.enter("maintain");
        b.reason =
            "Maintaining tools, armour, food reserve and torches; defending and monitoring supplies.";
        // Established and equipped: the real prize is out there. Scout for
        // villages and structures to loot; fall back to home duty on failure.
        if (b.scout.step(tick))
            return;
        if (distance(b.sim.location, b.home()) > 5) {
            if (b.nav.go(b.home(), tick) === "failed") {
                b.reason =
                    "Maintenance: home route unavailable; guarding current location.";
                b.nav.reset();
            }
        }
        else
            b.nav.reset();
    }
}
