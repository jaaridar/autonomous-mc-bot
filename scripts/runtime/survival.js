import { TaskFault } from "../core/arbiter.js";
import { center, distance, floor } from "../core/math.js";
import { PREY, RAW_TO_COOKED, amountOf, bedTarget, fuelCount, id, matches } from "../core/recipes.js";
import { adjustTacticForHostile, assessFoodReserves, prioritizeEscapeCoverSurvival, reassessAfterDamage, shouldAvoidCombat, shouldEatBeforeFight } from "../core/survival.js";
import { FOOD, RAW_MEAT, RISKY_FOOD } from "../core/world.js";
import { Furnace } from "./equipment.js";
import { Explorer } from "./scouting.js";
// One module now: runtime/survival.js + runtime/foraging.js + runtime/food.js (see docs/ARCHITECTURE.md).


// ---------------------------------------------------------------- survival.js

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
        // FIXED: maintain should NOT roam without mission when owner nearby - guard instead
        const owner = b.owner();
        const ownerDist = owner ? distance(owner.location, b.sim.location) : Infinity;
        if (owner && ownerDist < 24) {
            b.reason = `Maintain: fully equipped stage ${this.stage}, guarding near owner ${b.ownerName} ${Math.round(ownerDist)}b - ready for command`;
            b.nav.reset();
            try { b.sim.stopMoving(); } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }
            return;
        }
        // Only scout if no owner nearby and home far, and not in follow mode previously
        if (ownerDist > 48) {
            b.reason = "Maintain: fully equipped, scouting for villages/structures - use !bot follow to call back";
            if (b.scout.step(tick))
                return;
        } else {
            b.reason = `Maintain: fully equipped stage ${this.stage}, guarding home - ${Math.round(distance(b.sim.location, b.home()))}b from base`;
        }
        if (distance(b.sim.location, b.home()) > 5) {
            if (b.nav.go(b.home(), tick) === "failed") {
                b.reason =
                    "Maintenance: home route unavailable; guarding current location - awaiting command";
                b.nav.reset();
            }
        }
        else {
            b.nav.reset();
            try { b.sim.stopMoving(); } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }
        }
    }
}

// ---------------------------------------------------------------- foraging.js

export function allowedPrey(e) {
    return (e.isValid &&
        PREY.has(e.typeId) &&
        !e.nameTag &&
        !e.hasTag("verdant.protected") &&
        !e.getComponent("minecraft:tameable")?.isTamed &&
        !e.hasComponent("minecraft:is_baby"));
}
/** Physical pickup and reach-gated hunting. Never gives/destroys entities via commands. */
export class Forager {
    constructor(sim, bag, terrain, nav) {
        this.sim = sim;
        this.bag = bag;
        this.terrain = terrain;
        this.nav = nav;
        this.targetSince = 0;
        this.lastAttack = 0;
        this.lastSeenLoot = 0;
        this.blocked = new Map();
        this.explorer = new Explorer();
        this.started = 0;
        this.lootWaitUntil = 0;
        this.reason = "";
    }
    reset() {
        this.target = undefined;
        this.started = 0;
        this.lootWaitUntil = 0;
        this.explorer.reset();
    }
    step(tick, home, range, hunting) {
        if (!this.started)
            this.started = tick;
        if (tick - this.started > 6000)
            throw new TaskFault("No accessible food after five minutes. Supply food or move to a different habitat.", "retry");
        const food = this.sim.dimension
            .getEntities({
            type: "minecraft:item",
            location: this.sim.location,
            maxDistance: 12,
        })
            .find((e) => {
            const item = e.getComponent("minecraft:item")?.itemStack;
            return (!!item &&
                (FOOD.has(item.typeId) || !!RAW_TO_COOKED[item.typeId]) &&
                (this.blocked.get(e.id) ?? 0) < tick &&
                this.terrain.safe(e.location));
        });
        if (food) {
            this.reason = "Collecting observed food drops.";
            if (distance(food.location, this.sim.location) < 1.2) {
                this.nav.reset();
                if (!this.lastSeenLoot)
                    this.lastSeenLoot = tick;
                if (tick - this.lastSeenLoot > 60) {
                    this.blocked.set(food.id, tick + 400);
                    this.lastSeenLoot = 0;
                }
                return;
            }
            this.lastSeenLoot = 0;
            if (this.nav.go(center(floor(food.location)), tick) === "failed")
                this.blocked.set(food.id, tick + 400);
            return;
        }
        if (this.target &&
            (!allowedPrey(this.target) ||
                (this.target.getComponent("minecraft:health")?.currentValue ?? 1) <= 0)) {
            this.target = undefined;
            this.lootWaitUntil = tick + 20;
            this.nav.reset();
        }
        if (tick < this.lootWaitUntil) {
            this.reason = "Waiting for native drops.";
            return;
        }
        if (this.target && tick - this.targetSince > 600) {
            this.blocked.set(this.target.id, tick + 1200);
            this.target = undefined;
            this.nav.reset();
        }
        if (!this.target && hunting) {
            this.target = this.sim.dimension
                .getEntities({ location: this.sim.location, maxDistance: 20 })
                .filter((e) => allowedPrey(e) && (this.blocked.get(e.id) ?? 0) < tick)
                .sort((a, b) => distance(a.location, this.sim.location) -
                distance(b.location, this.sim.location))[0];
            this.targetSince = tick;
        }
        if (this.target) {
            const target = this.target;
            this.reason = "Hunting " + target.typeId;
            if (distance(this.sim.location, target.location) > 2.8) {
                if (this.nav.go(target.location, tick) === "failed") {
                    this.blocked.set(target.id, tick + 1200);
                    this.target = undefined;
                }
                return;
            }
            this.nav.reset();
            if (!this.terrain.line(this.sim.getHeadLocation(), target.getHeadLocation())) {
                this.blocked.set(target.id, tick + 200);
                this.target = undefined;
                return;
            }
            if (tick - this.lastAttack >= 10) {
                this.bag.tool("sword") || this.bag.tool("axe");
                this.sim.lookAtEntity(target);
                if (allowedPrey(target))
                    this.sim.attackEntity(target);
                this.lastAttack = tick;
            }
            return;
        }
        this.reason = hunting
            ? "Exploring for reachable food animals/drops."
            : "Exploring for food drops; hunting disabled.";
        if (this.explorer.step(this.sim.location, home, tick, this.terrain, this.nav, range) === "blocked")
            throw new TaskFault("No safe food-search frontier.", "retry");
        if (this.blocked.size > 96)
            this.blocked.delete(this.blocked.keys().next().value);
    }
}

// ---------------------------------------------------------------- food.js

/**
 * Food Runtime - food healing combat readiness.
 * Maintain sufficient food exploration sprinting combat emergency recovery.
 * Track hunger health saturation availability replacement.
 * Before dangerous fight eat when necessary when safe.
 * Avoid beginning combat critical health insufficient resources unless no safer alternative.
 * Prioritize escape cover survival vs multiple hostile unfavorable.
 * Recognize every relevant hostile adjust tactics attack pattern range movement environmental advantages.
 * After damage reassess instead blindly continuing plan.
 */

export class FoodDirector {
    constructor(bot) {
        this.bot = bot;
        this.sim = bot.sim;
        this.bag = bot.bag;
        this.lastEatCheck = 0;
        this.lastDamage = 0;
        this.prevHealth = 20;
        this.consecutiveAvoids = 0;
    }

    reset() {
        this.lastEatCheck = 0;
        this.consecutiveAvoids = 0;
    }

    tick(tick) {
        const counts = this.bag.counts();
        const hunger = this.sim.getComponent("minecraft:player.hunger")?.currentValue ?? 20;
        const health = this.sim.getComponent("minecraft:health")?.currentValue ?? 20;

        // Track damage for reassess
        if (health < this.prevHealth) {
            this.lastDamage = tick;
            try {
                const threatInfo = this.bot.terrain.threatInfo(this.sim, this.bot.owner());
                const reassess = reassessAfterDamage(null, this.prevHealth - health, health, threatInfo.list, { hasBlocks: (this.bot.builder?.countBlocks() ?? 0) > 0 });
                if (reassess && reassess.priority >= 80) {
                    this.bot.reason = `Food: ${reassess.reason} - reassess after damage ${this.prevHealth - health} dmg`;
                }
            } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }
        }
        this.prevHealth = health;

        if (tick - this.lastEatCheck < 40) return false;
        this.lastEatCheck = tick;

        const reserves = assessFoodReserves(counts);
        const threatInfo = this.bot.terrain.threatInfo(this.sim, this.bot.owner());
        const threatTypes = threatInfo.list.map(e => e.typeId);

        // Before dangerous fight eat when necessary when safe
        if (threatInfo.nearest && threatInfo.count >= 1) {
            const eatBefore = shouldEatBeforeFight(hunger, health, threatInfo.count, threatTypes);
            if (eatBefore.shouldEat) {
                const foodSlot = this.bag.food(health <= 8 || hunger <= 6);
                if (foodSlot >= 0 && (threatInfo.closest > 6 || hunger <= 8)) {
                    this.bot.reason = `Food: ${eatBefore.reason} - eating before fight`;
                    this.bot.eat(tick);
                    return true;
                }
            }

            // Avoid beginning combat critical health insufficient resources unless no safer alternative
            const avoidCombat = shouldAvoidCombat(health, hunger, reserves, { hasWeapon: this.bot.equipment.hasWeapon() }, threatInfo.count, threatTypes);
            if (avoidCombat.avoid) {
                this.consecutiveAvoids++;
                if (this.consecutiveAvoids < 3) {
                    this.bot.reason = `Food: ${avoidCombat.reason} - avoiding combat critical health insufficient resources`;
                    const retreatSpot = this.findSafeSpot(12);
                    if (retreatSpot) {
                        const r = this.bot.navTo(retreatSpot, tick, 2);
                        if (r !== "failed") return true;
                    }
                }
            } else {
                this.consecutiveAvoids = 0;
            }

            // Prioritize escape cover survival vs multiple hostile unfavorable
            if (threatInfo.count >= 3) {
                const escapePlan = prioritizeEscapeCoverSurvival(threatInfo.list, health, false, (this.bot.builder?.countBlocks() ?? 0) > 0);
                if (escapePlan.priority >= 80) {
                    this.bot.reason = `Food: ${escapePlan.reason} - prioritizing ${escapePlan.action} vs multiple hostile unfavorable`;
                    return false;
                }
            }

            // Recognize every relevant hostile adjust tactics
            if (threatInfo.nearest) {
                try {
                    const tactic = adjustTacticForHostile(threatInfo.nearest.typeId, { distance: threatInfo.closest, health, hasShield: (counts["minecraft:shield"] ?? 0) > 0 });
                    if (tactic.tactic !== "melee") {
                        this.bot.reason = `Food: hostile ${threatInfo.nearest.typeId} tactic ${tactic.tactic} - ${tactic.reason}`;
                    }
                } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }
            }
        }

        // Maintain sufficient food exploration sprinting combat emergency recovery
        if (reserves.totalHunger < 20 && this.bot.mode !== "idle") {
            this.bot.reason = `Food: reserves critical ${reserves.totalHunger} hunger - prioritize food before exploration`;
            const foodSpot = this.bot.awareness?.getNearest("bread") ?? this.bot.awareness?.getNearest("potato");
            if (foodSpot) {
                const r = this.bot.navTo(foodSpot.pos, tick, 2);
                if (r !== "failed") return true;
            }
        }

        return false;
    }

    findSafeSpot(radius) {
        try {
            const p = this.bot.terrain.groundNear(this.sim.location.x, this.sim.location.z, this.sim.location.y, radius);
            if (p && !this.bot.terrain.dangerous(p)) return p;
        } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }
        return null;
    }
}
