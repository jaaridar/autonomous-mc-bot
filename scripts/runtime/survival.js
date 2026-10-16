import { TaskFault } from "../core/arbiter.js";
import { COMPASS, away, center, distance, floor } from "../core/math.js";
import { PREY, RAW_TO_COOKED, amountOf, bedTarget, fuelCount, id, matches } from "../core/recipes.js";
import { adjustTacticForHostile, assessFoodReserves, prioritizeEscapeCoverSurvival, reassessAfterDamage, shouldAvoidCombat, shouldEatBeforeFight } from "../core/survival.js";
import { FOOD, RAW_MEAT, RISKY_FOOD } from "../core/world.js";
import { Furnace } from "./equipment.js";
import { Explorer } from "./scouting.js";
// One module now: runtime/survival.js + runtime/foraging.js + runtime/food.js (see docs/ARCHITECTURE.md).

// ---------------------------------------------------------------- constants

const STALL_TICKS    = 12000; // 10 minutes — no inventory progress watchdog
const FORAGE_TICKS   =  6000; // 5 minutes  — food-search timeout
const HUNT_TIMEOUT   =   600; // ticks before giving up on a single prey
const MELEE_RANGE    =   2.8; // blocks
const PICKUP_RANGE   =   1.2; // blocks
const BLOCKED_MAX    =    64; // max blocked-entity entries before expiry sweep

const ID_FURNACE     = id("furnace");
const ID_COBBLE      = id("cobblestone");
const ID_RAW_IRON    = id("raw_iron");
const ID_IRON_INGOT  = id("iron_ingot");
const ID_IRON_PICK   = id("iron_pickaxe");
const ID_IRON_SWORD  = id("iron_sword");
const ID_IRON_AXE    = id("iron_axe");
const ID_DIAMOND     = id("diamond");
const ID_DIAMOND_PICK = id("diamond_pickaxe");
const ID_DIAMOND_SWORD = id("diamond_sword");
const ID_TORCH       = id("torch");

// Helper: stop bot movement, silently swallowing any engine error.
function stopMoving(sim) {
    try { sim.stopMoving(); } catch (_) {}
}

// ---------------------------------------------------------------- survival.js

/** Observation-driven survival loop. No fabricated items or claimed speedrun completion. */
export class SurvivalDirector {
    constructor(bot) {
        this.bot      = bot;
        this.branch   = "";
        this.stage    = 0;
        this.sigSum   = -1;   // lightweight inventory change detector (sum of amounts)
        this.lastProgress = 0;
        this.began    = 0;
        this.furnace  = new Furnace(bot.sim, bot.bag, bot.terrain, bot.nav, bot.host, bot);
        this.forager  = new Forager(bot.sim, bot.bag, bot.terrain, bot.nav);
    }

    reset(tick) {
        this.branch = "";
        this.stage  = 0;
        this.lastProgress = tick;
        this.began  = tick;
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

    /** Switch active branch; cancel work and reset forager on branch change. */
    enter(branch) {
        if (this.branch === branch) return;
        this.bot.cancelWork();
        this.branch = branch;
        if (branch !== "food-search") this.forager.reset();
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

    /**
     * Smelt `amount` of `inputWanted` in the nearest furnace.
     * Always returns false — callers must wait for furnace.jobActive to clear.
     */
    produce(inputWanted, amount, tick) {
        const b = this.bot;

        // 1. Already smelting — just poll.
        if (this.furnace.jobActive) {
            this.enter("smelting");
            b.reason = "Waiting for furnace output";
            this.furnace.poll(tick);
            return false;
        }

        // 2. Need a placed furnace.
        if (!this.furnace.location) {
            if (!this.furnace.placing && !amountOf(b.bag.counts(), ID_FURNACE)) {
                this.ensure(ID_FURNACE, 1, tick);
                return false;
            }
            this.enter("place-furnace");
            b.reason = "Placing furnace";
            this.furnace.place(tick);
            return false;
        }

        // 3. Need enough input.
        if (amountOf(b.bag.counts(), inputWanted) < amount) {
            this.ensure(inputWanted, amount, tick);
            return false;
        }

        // 4. Find fuel.
        const input = b.bag.get(b.bag.find((s) => matches(s.typeId, inputWanted)));
        if (!input) return false;

        let fuelSlot = -1, batch = 0;
        fuelSearch: for (const kind of [id("coal"), id("charcoal"), "#planks"])
            for (let slot = 0; slot < b.bag.size; slot++) {
                const item = b.bag.get(slot);
                if (!item || !matches(item.typeId, kind)) continue;
                const capacity = Math.ceil(item.amount * (kind === "#planks" ? 1.5 : 8));
                const n = Math.min(8, amount, input.amount, capacity);
                if (n > 0 && item.amount >= fuelCount(item.typeId, n)) {
                    fuelSlot = slot; batch = n;
                    break fuelSearch;
                }
            }

        if (fuelSlot < 0) {
            this.ensure("#planks", amountOf(b.bag.counts(), "#planks") + 2, tick);
            return false;
        }

        // 5. Approach furnace and load — re-read both slots fresh to avoid stale indices.
        this.enter("load-furnace");
        b.reason = "Loading furnace";
        if (!this.furnace.approach(tick)) return false;

        const freshInput = b.bag.find((s) => s.typeId === input.typeId);
        const freshFuel  = b.bag.find((s) => s.typeId === b.bag.get(fuelSlot)?.typeId);
        if (freshInput < 0 || freshFuel < 0) return false;

        this.furnace.start(freshInput, batch, freshFuel, tick);
        return false;
    }

    tick(tick) {
        const b = this.bot;
        if (!b.settings.assistedCrafting) {
            b.blockTask("auto requires !bot config crafting on.");
            return;
        }

        // Lightweight inventory-change detector (sum of all item amounts).
        const stock  = b.bag.counts();
        const usable = b.bag.usableCounts();
        const sigSum = Object.values(stock).reduce((s, n) => s + n, 0);
        if (sigSum !== this.sigSum) { this.sigSum = sigSum; this.lastProgress = tick; }

        // Watchdog: no inventory progress for STALL_TICKS → reset and yield.
        if (tick - this.lastProgress > STALL_TICKS) {
            b.record("No inventory progress for 10m — resetting stall tracking");
            this.lastProgress = tick;
            this.sigSum = -1;
            return;
        }

        // Keep any in-flight furnace job running without interruption.
        if (this.furnace.placing) {
            this.enter("place-furnace");
            this.furnace.place(tick);
            return;
        }
        if (this.furnace.jobActive) {
            this.enter("smelting");
            b.reason = "Waiting for furnace output";
            this.furnace.poll(tick);
            return;
        }

        // ---- Food check --------------------------------------------------
        const hunger = b.sim.getComponent("minecraft:player.hunger")?.currentValue ?? 20;
        let safeFood = 0, anyFood = 0;
        for (const [type, amt] of Object.entries(stock)) {
            if (FOOD.has(type))                                         { safeFood += amt; anyFood += amt; }
            else if (RAW_MEAT.has(type) || RISKY_FOOD.has(type))       { anyFood  += amt; }
        }

        // With an owned furnace keep a stock of cooked food: hunt nearby animals,
        // collect the drops and smelt them (kill -> collect -> smelt).
        const furnaceReady = !!this.furnace.location;
        const foodTarget   = furnaceReady ? 8 : 4;
        if ((hunger <= 16 || this.stage >= 6 || furnaceReady) && safeFood < foodTarget) {
            // Cook carried raw meat first.
            const rawSlot = b.bag.find((s) => !!RAW_TO_COOKED[s.typeId]);
            if (rawSlot >= 0) {
                const raw = b.bag.get(rawSlot);
                this.produce(raw.typeId, Math.min(foodTarget, raw.amount), tick);
                return;
            }
            if (anyFood < 3 || hunger <= 6 || (furnaceReady && b.settings.hunting)) {
                this.enter("food-search");
                this.forager.step(tick, b.home(), b.settings.range, b.settings.hunting);
                b.reason = this.forager.reason;
                return;
            }
        }

        // ---- Village opportunity: loot stores, beds & food as soon as basic resources are acquired ----
        if (b.village && b.settings.loot) {
            const hasBasic = ((usable["minecraft:wooden_pickaxe"] ?? 0) > 0 || (usable["minecraft:stone_pickaxe"] ?? 0) > 0 ||
                              (stock["#logs"] ?? 0) > 0 || (stock["#planks"] ?? 0) > 0 ||
                              (stock[ID_COBBLE] ?? 0) > 0);
            const v = b.village.findNearestVillage(128);
            const ironHave = stock[ID_IRON_INGOT] ?? 0;
            if (v && hasBasic && (v.distance < 96 || ironHave < 5 || safeFood < 8)) {
                this.enter("village-loot");
                if (b.village.tick(tick)) return;
            }
        }

        // ---- Opportunistic Iron Mining: mine nearby iron ore whenever holding a stone+ pickaxe ----
        const hasIronPickOrStone = (usable[id("stone_pickaxe")] ?? 0) > 0 || hasTier("pickaxe");
        const totalIron = (stock[ID_IRON_INGOT] ?? 0) + (stock[ID_RAW_IRON] ?? 0);
        if (hasIronPickOrStone && totalIron < 32 && !b.threat && b.mode !== "mine") {
            const nearOre = b.awareness?.getNearest("iron_ore") ?? b.awareness?.getNearest("raw_iron");
            let orePos = (nearOre && distance(nearOre.pos ?? nearOre, b.sim.location) <= 14) ? (nearOre.pos ?? nearOre) : null;
            if (!orePos) {
                const scanned = b.terrain.scanOres(b.sim.location, 12, (t) => t.includes("iron_ore") || t.includes("raw_iron"), 50);
                if (scanned.length > 0) orePos = scanned[0];
            }
            if (orePos) {
                if (!b.mining || (b.mining.block !== "minecraft:iron_ore" && b.mining.block !== "minecraft:deepslate_iron_ore")) {
                    b.record(`Opportunistic iron ore spotted at ${orePos.x},${orePos.y},${orePos.z} — mining immediately`);
                    b.assignMine("minecraft:iron_ore", 4, true);
                    this.enter("opportunistic-iron");
                    b.reason = `Opportunistic mining: iron ore at ${orePos.x},${orePos.y},${orePos.z}`;
                    return;
                }
            }
        }

        // ---- Stone tools -------------------------------------------------
        const toolKinds = ["pickaxe", "axe", "sword"];
        const TIERS     = ["iron_", "diamond_", "netherite_"];
        const hasTier   = (kind) => TIERS.some((t) => (usable[id(t + kind)] ?? 0) > 0);

        // Get 3 cobble for stone pickaxe first (fast upgrade), then gather remainder with stone pickaxe
        const neededCobble = !(usable[id("stone_pickaxe")] > 0 || hasTier("pickaxe")) ? 3 : 14;
        if (toolKinds.some((k) => !hasTier(k)) && (stock[ID_COBBLE] ?? 0) < neededCobble) {
            this.stage = 0;
            this.ensure(ID_COBBLE, neededCobble, tick);
            return;
        }
        for (let i = 0; i < toolKinds.length; i++) {
            const kind = toolKinds[i];
            const stone = id("stone_" + kind);
            if (!hasTier(kind) && !(usable[stone] > 0)) {
                this.stage = i;
                this.ensure(stone, 1, tick);
                return;
            }
        }

        // ---- Furnace placement -------------------------------------------
        this.stage = 3;
        if (!this.furnace.location) {
            if (!(stock[ID_FURNACE] > 0)) { this.ensure(ID_FURNACE, 1, tick); return; }
            this.enter("place-furnace");
            this.furnace.place(tick);
            return;
        }

        // ---- Iron tools --------------------------------------------------
        const needPick  = !(usable[ID_IRON_PICK]   > 0 || usable[ID_DIAMOND_PICK]  > 0 || (usable[id("netherite_pickaxe")] ?? 0) > 0);
        const needSword = !(usable[ID_IRON_SWORD]   > 0 || usable[ID_DIAMOND_SWORD] > 0 || (usable[id("netherite_sword")]   ?? 0) > 0);
        const ironNeeded = (needPick ? 3 : 0) + (needSword ? 2 : 0);
        const ironHave   = stock[ID_IRON_INGOT] ?? 0;

        if (ironHave < ironNeeded) {
            this.stage = 4;
            this.produce(ID_RAW_IRON, ironNeeded - ironHave, tick);
            return;
        }
        if (needPick)  { this.ensure(ID_IRON_PICK,  1, tick); return; }
        if (needSword) { this.ensure(ID_IRON_SWORD, 1, tick); return; }

        // ---- Torches -----------------------------------------------------
        this.stage = 5;
        if ((stock[ID_TORCH] ?? 0) < 8) {
            if (amountOf(stock, "#carbon") < 1) { this.produce("#logs", 1, tick); return; }
            this.ensure(ID_TORCH, 8, tick);
            return;
        }

        // ---- Armor -------------------------------------------------------
        this.stage = 6;
        if (b.settings.armor) {
            const armor = b.equipment.nextIronGoal();
            if (armor) {
                if ((usable[armor.item] ?? 0) > 0) { b.equipment.autoEquip(); return; }
                const ingotHave = stock[ID_IRON_INGOT] ?? 0;
                if (ingotHave < armor.ingots) { this.produce(ID_RAW_IRON, armor.ingots - ingotHave, tick); return; }
                this.ensure(armor.item, 1, tick);
                return;
            }
        }

        // ---- Opportunistic upgrades (only from stock already held) --------
        this.stage = 7;
        const has = (type) => (usable[type] ?? 0) > 0;
        const diamonds = stock[ID_DIAMOND] ?? 0;

        if (b.settings.deepMining && diamonds < 3 && !has(ID_DIAMOND_PICK) && !has(id("netherite_pickaxe")) && usable[ID_IRON_PICK] > 0) {
            this.ensure(ID_DIAMOND, 3 - diamonds, tick); return;
        }
        if (!has(ID_IRON_AXE) && !["diamond", "netherite"].some((m) => has(id(m + "_axe"))) && ironHave >= 3) {
            this.ensure(ID_IRON_AXE, 1, tick); return;
        }
        if (diamonds >= 3 && !has(ID_DIAMOND_PICK) && !has(id("netherite_pickaxe"))) {
            this.ensure(ID_DIAMOND_PICK, 1, tick); return;
        }
        if (diamonds >= 2 && !has(ID_DIAMOND_SWORD) && !has(id("netherite_sword"))) {
            this.ensure(ID_DIAMOND_SWORD, 1, tick); return;
        }
        if (b.settings.camp && !Object.keys(stock).some((k) => k.endsWith("_bed") || k === "minecraft:bed")) {
            const bed = bedTarget(stock);
            if (bed) { this.ensure(bed, 1, tick); return; }
        }

        // ---- Maintain ----------------------------------------------------
        this.lastProgress = tick;
        this.enter("maintain");

        const owner     = b.owner();
        const ownerDist = owner ? distance(owner.location, b.sim.location) : Infinity;

        // Guard near owner (≤ 48 b) or scout when owner is distant / absent.
        if (owner && ownerDist <= 48) {
            b.reason = `Maintain: guarding ${b.ownerName} (${Math.round(ownerDist)}b) — ready for command`;
            b.nav.reset();
            stopMoving(b.sim);
            return;
        }

        b.reason = "Maintain: fully equipped — scouting (use !bot follow to recall)";
        if (b.scout.step(tick)) return;

        // Return home if more than 5 blocks away.
        if (distance(b.sim.location, b.home()) > 5) {
            if (b.nav.go(b.home(), tick) === "failed") {
                b.reason = "Maintain: home route blocked — guarding position";
                b.nav.reset();
            }
        } else {
            b.nav.reset();
            stopMoving(b.sim);
        }
    }
}

// ---------------------------------------------------------------- foraging.js

export function allowedPrey(e) {
    return (
        e.isValid &&
        PREY.has(e.typeId) &&
        !e.nameTag &&
        !e.hasTag("verdant.protected") &&
        !e.getComponent("minecraft:tameable")?.isTamed &&
        !e.hasComponent("minecraft:is_baby")
    );
}

/** Physical pickup and reach-gated hunting. Never gives/destroys entities via commands. */
export class Forager {
    constructor(sim, bag, terrain, nav) {
        this.sim         = sim;
        this.bag         = bag;
        this.terrain     = terrain;
        this.nav         = nav;
        this.target      = undefined;
        this.targetSince = 0;
        this.lastAttack  = 0;
        this.lastSeenLoot = 0;
        this.lootWaitUntil = 0;
        this.blocked     = new Map();
        this.explorer    = new Explorer();
        this.started     = 0;
        this.reason      = "";
    }

    reset() {
        this.target        = undefined;
        this.started       = 0;
        this.lootWaitUntil = 0;
        this.explorer.reset();
    }

    step(tick, home, range, hunting) {
        if (!this.started) this.started = tick;
        if (tick - this.started > FORAGE_TICKS)
            throw new TaskFault("No accessible food after five minutes. Supply food or move to a different habitat.", "retry");

        // Purge expired blocked entries when the map grows large.
        if (this.blocked.size > BLOCKED_MAX)
            for (const [k, exp] of this.blocked)
                if (exp < tick) this.blocked.delete(k);

        // 1. Pick up any food item on the ground nearby.
        const food = this.sim.dimension
            .getEntities({ type: "minecraft:item", location: this.sim.location, maxDistance: 12 })
            .find((e) => {
                const item = e.getComponent("minecraft:item")?.itemStack;
                return item &&
                    (FOOD.has(item.typeId) || !!RAW_TO_COOKED[item.typeId]) &&
                    (this.blocked.get(e.id) ?? 0) < tick &&
                    this.terrain.safe(e.location);
            });

        if (food) {
            this.reason = "Collecting observed food drops.";
            if (distance(food.location, this.sim.location) < PICKUP_RANGE) {
                this.nav.reset();
                if (!this.lastSeenLoot) this.lastSeenLoot = tick;
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

        // 2. Invalidate dead/invalid target; wait briefly for drops.
        if (this.target && (!allowedPrey(this.target) || (this.target.getComponent("minecraft:health")?.currentValue ?? 1) <= 0)) {
            this.target = undefined;
            this.lootWaitUntil = tick + 20;
            this.nav.reset();
        }
        if (tick < this.lootWaitUntil) { this.reason = "Waiting for drops."; return; }

        // 3. Give up on a target that has been chased too long.
        if (this.target && tick - this.targetSince > HUNT_TIMEOUT) {
            this.blocked.set(this.target.id, tick + 1200);
            this.target = undefined;
            this.nav.reset();
        }

        // 4. Pick nearest valid prey.
        if (!this.target && hunting) {
            this.target = this.sim.dimension
                .getEntities({ location: this.sim.location, maxDistance: 20, families: ["mob"] })
                .filter((e) => allowedPrey(e) && (this.blocked.get(e.id) ?? 0) < tick)
                .sort((a, b) => distance(a.location, this.sim.location) - distance(b.location, this.sim.location))[0];
            this.targetSince = tick;
        }

        // 5. Chase and attack.
        if (this.target) {
            const t = this.target;
            this.reason = "Hunting " + t.typeId;
            if (distance(this.sim.location, t.location) > MELEE_RANGE) {
                if (this.nav.go(t.location, tick) === "failed") {
                    this.blocked.set(t.id, tick + 1200);
                    this.target = undefined;
                }
                return;
            }
            this.nav.reset();
            if (!this.terrain.line(this.sim.getHeadLocation(), t.getHeadLocation())) {
                this.blocked.set(t.id, tick + 200);
                this.target = undefined;
                return;
            }
            if (tick - this.lastAttack >= 10) {
                this.bag.tool("sword") || this.bag.tool("axe");
                this.sim.lookAtEntity(t);
                if (allowedPrey(t)) this.sim.attackEntity(t);
                this.lastAttack = tick;
            }
            return;
        }

        // 6. Explore.
        this.reason = hunting ? "Exploring for food animals/drops." : "Exploring for drops; hunting disabled.";
        const exRes = this.explorer.step(this.sim.location, home, tick, this.terrain, this.nav, range);
        if (exRes === "blocked") {
            this.explorer.reset();
            this.reason = "Food search frontier blocked; resetting and scanning wider.";
            return;
        }
    }
}

// ---------------------------------------------------------------- food.js

/** Food/combat readiness director. Runs on every tick as an advisory layer. */
export class FoodDirector {
    constructor(bot) {
        this.bot      = bot;
        this.sim      = bot.sim;
        this.bag      = bot.bag;
        this.lastEatCheck      = 0;
        this.prevHealth        = 20;
        this.consecutiveAvoids = 0;
    }

    reset() {
        this.lastEatCheck      = 0;
        this.consecutiveAvoids = 0;
    }

    tick(tick) {
        const health = this.sim.getComponent("minecraft:health")?.currentValue ?? 20;
        const hunger = this.sim.getComponent("minecraft:player.hunger")?.currentValue ?? 20;
        const counts = this.bag.counts();

        // Track damage and log a reassessment reason (advisory only).
        if (health < this.prevHealth) {
            try {
                const ti = this.bot.terrain.threatInfo(this.sim, this.bot.owner());
                const r  = reassessAfterDamage(null, this.prevHealth - health, health, ti.list, { hasBlocks: (this.bot.builder?.countBlocks() ?? 0) > 0 });
                if (r?.priority >= 80)
                    this.bot.reason = `Food: ${r.reason} — reassess after ${this.prevHealth - health} dmg`;
            } catch (_) {}
        }
        this.prevHealth = health;

        // Throttle heavy checks to every 40 ticks.
        if (tick - this.lastEatCheck < 40) return false;
        this.lastEatCheck = tick;

        // Single threatInfo call shared by all checks below.
        const threatInfo  = this.bot.terrain.threatInfo(this.sim, this.bot.owner());
        const reserves    = assessFoodReserves(counts);
        const threatTypes = threatInfo.list.map((e) => e.typeId);

        if (threatInfo.nearest) {
            // Eat before engaging if conditions allow.
            const eatBefore = shouldEatBeforeFight(hunger, health, threatInfo.count, threatTypes);
            const golden = this.bag.find((s) => s.typeId === "minecraft:golden_apple" || s.typeId === "minecraft:enchanted_golden_apple") >= 0;
            if (eatBefore.shouldEat && (hunger < 20 || golden) && this.bag.food(health <= 8 || hunger <= 6) >= 0 && (threatInfo.closest > 6 || hunger <= 8)) {
                this.bot.reason = `Food: ${eatBefore.reason} — eating before fight`;
                this.bot.eat(tick);
                return true;
            }

            // Retreat if critically low.
            const avoid = shouldAvoidCombat(health, hunger, reserves, { hasWeapon: this.bot.equipment.hasWeapon() }, threatInfo.count, threatTypes);
            if (avoid.avoid) {
                this.consecutiveAvoids++;
                if (this.consecutiveAvoids < 3) {
                    this.bot.reason = `Food: ${avoid.reason} — retreating`;
                    const spot = this._safeSpot(12);
                    if (spot && this.bot.navTo(spot, tick, 2) !== "failed") return true;
                }
            } else {
                this.consecutiveAvoids = 0;
            }

            // Escape from a mob swarm.
            if (threatInfo.count >= 3) {
                const plan = prioritizeEscapeCoverSurvival(threatInfo.list, health, false, (this.bot.builder?.countBlocks() ?? 0) > 0);
                if (plan.priority >= 80) {
                    this.bot.reason = `Food: ${plan.reason} — ${plan.action}`;
                    return false;
                }
            }

            // Advisory tactic hint for non-standard hostiles.
            try {
                const tactic = adjustTacticForHostile(threatInfo.nearest.typeId, { distance: threatInfo.closest, health, hasShield: (counts["minecraft:shield"] ?? 0) > 0 });
                if (tactic.tactic !== "melee")
                    this.bot.reason = `Food: ${threatInfo.nearest.typeId} → tactic ${tactic.tactic} — ${tactic.reason}`;
            } catch (_) {}
        }

        // Navigate toward known food if reserves are critical.
        if (reserves.totalHunger < 20 && this.bot.mode !== "idle") {
            this.bot.reason = `Food: reserves ${reserves.totalHunger} hunger — seeking food`;
            const FOOD_TYPES = ["bread", "cooked_beef", "cooked_chicken", "cooked_porkchop", "carrot", "potato", "apple"];
            for (const type of FOOD_TYPES) {
                const spot = this.bot.awareness?.getNearest(type);
                if (spot && this.bot.navTo(spot.pos, tick, 2) !== "failed") return true;
            }
        }

        return false;
    }

    _safeSpot(radius) {
        // A spot that is genuinely away from the nearest threat: the old version
        // searched the bot's own column, so "retreating" went nowhere and the
        // bot just shuffled around the mobs.
        try {
            const p = floor(this.sim.location);
            const ti = this.bot.terrain.threatInfo(this.sim, this.bot.owner());
            const threat = ti.nearest;
            const here = threat ? distance(p, threat.location) : 0;
            const dirs = threat && threat.isValid ? [away(p, floor(threat.location)), ...COMPASS] : COMPASS;
            for (const d of dirs) {
                if (d.y) continue;
                for (const n of [4, 6, 8, 12]) {
                    if (n > radius) break;
                    const q = this.bot.terrain.groundNear(p.x + d.x * n, p.z + d.z * n, p.y, 2);
                    if (!q || this.bot.terrain.dangerous(q)) continue;
                    if (threat && threat.isValid && distance(q, threat.location) <= here + 1) continue;
                    return q;
                }
            }
        } catch (_) {}
        return null;
    }
}
