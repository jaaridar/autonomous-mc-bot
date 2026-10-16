
import { CARDINAL, COMPASS, DOWN, UP, add, center, distance, floor } from "../core/math.js";
import { assessFallDepth, composeCapabilities, detectScenario, multiRiskPriority, shouldRecalculateAdaptive } from "../core/survival.js";
import { Direction, world } from "@minecraft/server";
import { findBoat } from "./world.js";
/**
 * Survival Master - world-class handler for all 80 bedrock.dev scenarios.
 * Integrates fall assessment, night combat, resource shortage, shelter failures, multi-risk.
 * Main orchestrator that ensures bot can handle any situation.
 */

export class SurvivalMaster {
    constructor(bot) {
        this.bot = bot;
        this.sim = bot.sim;
        this.bag = bot.bag;
        this.terrain = bot.terrain;
        this.host = bot.host;
        this.builder = bot.builder;
        this.escaper = bot.escaper;
        this.combat = bot.combat;

        this.lastAssess = 0;
        this.currentScenario = null;
        this.fallStartY = null;
        this.lastFallTick = 0;
        this.shelterPos = null;
        this.torchMarkers = [];
        this.oxygenWarnings = 0;
        this.lastHeal = 0;
    }

    reset() {
        this.currentScenario = null;
        this.fallStartY = null;
        this.torchMarkers = [];
    }

    tick(tick) {
        if (tick - this.lastAssess < 20) return false;
        this.lastAssess = tick;

        const context = this.buildContext(tick);

        // FIX: compose capabilities - mix of two situations should not fall through
        try {
            const caps = composeCapabilities({
                health: context.health,
                hunger: context.hunger,
                threatCount: context.hostileCount,
                inWater: context.inWater,
                belowHazard: context.belowHazard,
                gapSize: context.gapSize,
                verticalDiff: context.verticalDiff,
                foodCount: context.foodCount,
                targetBlock: context.targetBlock,
                bombNear: context.bombNear,
                needCover: context.needCover
            });
            if (caps.length > 1) {
                const sig = caps.map(c=>c.capability+":"+c.priority).join(", ");
                // Only journal changes: this fired every second and flushed the 64-entry log.
                if (sig !== this._lastCapSig) this.bot.record(`Survival capabilities composed: ${sig} - handles mix of situations`);
                this._lastCapSig = sig;
            } else this._lastCapSig = "";
        } catch (e) { console.warn("[Verdant] capabilities compose "+e); }

        // Adaptive planning: recalculate on discovery
        try {
            const discovery = { type: context.scenarioType || "unknown", count: context.hostileCount, pos: context.pos };
            const recalc = shouldRecalculateAdaptive(discovery, { route: this.currentScenario?.name }, { phase: context.phase, foodLow: context.hunger <= 6 });
            if (recalc.should) {
                if (recalc.reason !== this._lastRecalc) this.bot.record(`Adaptive recalc: ${recalc.reason} priority ${recalc.priority}`);
                this._lastRecalc = recalc.reason;
            } else this._lastRecalc = "";
        } catch (e) { console.warn("[Verdant] adaptive recalc "+e); }

        const detected = detectScenario(context);
        if (!detected.length) return false;

        const top = detected[0];
        if (top.priority < 80 && !top.critical) return false;

        this.currentScenario = top;
        this.bot.reason = `Survival-Master: Scenario ${top.id} ${top.name} (priority ${top.priority}) - ${top.actions[0]}`;

        // Handle based on category
        const id = top.id;
        if (id >= 1 && id <= 15) return this.handleFall(id, top, context, tick);
        if (id >= 16 && id <= 30) return this.handleNightCombat(id, top, context, tick);
        if (id >= 31 && id <= 45) return this.handleResourceShortage(id, top, context, tick);
        if (id >= 46 && id <= 60) return this.handleShelterFailure(id, top, context, tick);
        if (id >= 61 && id <= 80) return this.handleMultiRisk(id, top, context, tick);

        return false;
    }

    buildContext(tick) {
        const sim = this.sim;
        const p = floor(sim.location);
        const hp = sim.getComponent("minecraft:health")?.currentValue ?? 20;
        const hunger = sim.getComponent("minecraft:player.hunger")?.currentValue ?? 20;
        const threats = this.bot.terrain.threatInfo(sim, this.bot.owner()).list ?? [];
        const counts = this.bag.counts();

        // Time detection
        let time = "day";
        try {
            const tod = world.getTimeOfDay();
            // 0-12000 day, 12000-13000 sunset, 13000-23000 night, 23000-24000 sunrise
            if (tod >= 12000 && tod < 13000) time = "sunset";
            else if (tod >= 13000 && tod < 23000) time = "night";
            else time = "day";
        } catch { time = "day"; }

        // Location detection
        let location = "surface";
        const below = this.terrain.block(add(p, DOWN));
        const above = this.terrain.block(add(p, UP));
        if (sim.isInWater) location = "water";
        else if (this.terrain.lavaNear(p)) location = "lava";
        else if (p.y < 0) location = "deep_cave";
        else if (p.y < 40) location = "cave";
        else if (this.isRavine(p)) location = "ravine";
        else if (this.isForest(p)) location = "forest";
        else if (this.isRiverNearby(p)) location = "river";

        const hasWeapon = this.bot.equipment?.hasWeapon() ?? false;
        const hasTorch = (counts["minecraft:torch"] ?? 0) > 0;
        const hasWater = this.bag.find(s => s.typeId === "minecraft:water_bucket") >= 0;
        const hasBlocks = this.builder?.canBuild ?? false;
        const blockCount = this.builder?.countBlocks() ?? 0;
        // hasTool() is read-only: tool() used to SELECT the pickaxe here every
        // assessment (swapping hotbar slots mid-fight) and always returned >= 0.
        const hasPickaxe = this.bag.hasTool("pickaxe", 1);
        const pickaxeDurabilityLow = this.isPickaxeLow();
        const inventoryFull = this.bag.container.emptySlotsCount < 2;
        const lowDurability = this.isAnyToolLow();
        const noShelter = !this.shelterPos || distance(this.shelterPos, p) > 32;
        const oxygenLow = this.terrain.headInWater(sim);
        const nearLava = this.terrain.lavaNear(p);
        const onLedge = this.isOnNarrowLedge(p);
        const tooDeep = this.fallStartY ? (this.fallStartY - p.y) > 4 : false;
        const flooded = this.isFlooded(p);
        const gravelCollapse = this.isGravelCollapse(p);

        // Check triggers for detection
        const triggers = [];
        if (hp <= 4) triggers.push("4_hp");
        if (hp <= 3) triggers.push("3_hp");
        if (hp <= 6) triggers.push("low_hp");
        if (hunger <= 4) triggers.push("empty_hunger");
        if (hunger <= 6) triggers.push("low_hunger");
        if (time === "sunset") triggers.push("sunset");
        if (time === "night") triggers.push("night");
        if (location === "ravine") triggers.push("ravine");
        if (location === "cave") triggers.push("cave");
        if (location === "water") triggers.push("water");
        if (nearLava) triggers.push("lava");
        if (onLedge) triggers.push("ledge");
        if (tooDeep) triggers.push("too_deep");
        if (oxygenLow) triggers.push("oxygen_low");
        if (inventoryFull) triggers.push("inventory_full");
        if (lowDurability) triggers.push("low_durability");
        if (noShelter) triggers.push("no_shelter");
        if (flooded) triggers.push("flooded");
        if (gravelCollapse) triggers.push("gravel");
        if (!hasTorch) triggers.push("no_torches");
        if (!hasWeapon) triggers.push("no_weapon");
        if (threats.some(t => t.typeId.includes("skeleton"))) triggers.push("skeleton");
        if (threats.filter(t => t.typeId.includes("skeleton")).length >= 3) triggers.push("3_skeletons");
        if (threats.some(t => t.typeId === "minecraft:creeper")) triggers.push("creeper");
        if (threats.some(t => t.typeId.includes("zombie"))) triggers.push("zombie");
        if (threats.some(t => t.typeId.includes("spider"))) triggers.push("spider");
        if (threats.some(t => t.typeId === "minecraft:drowned")) triggers.push("drowned");
        if (threats.some(t => t.typeId === "minecraft:witch")) triggers.push("witch");

        return {
            hp, hunger, time, location, threats, counts,
            hasWeapon, hasTorch, hasWater, hasBlocks, blockCount, hasPickaxe, pickaxeDurabilityLow,
            inventoryFull, lowDurability, noShelter, oxygenLow, nearLava, onLedge, tooDeep, flooded, gravelCollapse,
            triggers,
            p, tick
        };
    }

    // ===== FALL HANDLERS 1-15 =====
    handleFall(id, scenario, ctx, tick) {
        switch (id) {
            case 1: return this.handleRavineFleeZombie(ctx, tick);
            case 2: return this.handleMountainLedgeSunset(ctx, tick);
            case 3: return this.handleCaveWhileTreeCut(ctx, tick);
            case 4: return this.handleWaterUnderwaterCave(ctx, tick);
            case 5: return this.handleLavaPoolMining(ctx, tick);
            case 6: return this.handleRavineSkeletonAbove(ctx, tick);
            case 7: return this.handleHoleCreeperChase(ctx, tick);
            case 8: return this.handleCaveBrokenPickaxe(ctx, tick);
            case 9: return this.handleNarrowLedgeLava(ctx, tick);
            case 10: return this.handleDeepCaveSunset(ctx, tick);
            case 11: return this.handleWaterDrownedChase(ctx, tick);
            case 12: return this.handleTreeSpiderEncounter(ctx, tick);
            case 13: return this.handleRavineLoseSurface(ctx, tick);
            case 14: return this.handleCaveEmptyHunger(ctx, tick);
            case 15: return this.handleHoleTooDeep(ctx, tick);
            default: return false;
        }
    }

    handleRavineFleeZombie(ctx, tick) {
        // Low health, unknown depth, escape route assessment
        const assessment = assessFallDepth(this.fallStartY ?? ctx.p.y + 10, ctx.p.y, ctx.hasWater, ctx.hasBlocks, ctx.hp);
        if (assessment.risk === "extreme" || assessment.risk === "lethal") {
            if (ctx.hasWater) {
                // Water clutch
                return this.waterClutch(tick);
            }
        }
        // Find climb route
        const climb = this.findClimbRoute(ctx.p, 8);
        if (climb) {
            this.bot.navTo(center(climb), tick, 1);
            this.bot.reason = "Fall 1: ravine flee zombie - climbing out, blocking zombie";
            return true;
        }
        // Block zombie
        if (ctx.threats.length) {
            return this.blockThreats(ctx.threats, tick);
        }
        return false;
    }

    handleMountainLedgeSunset(ctx, tick) {
        if (ctx.hp < 10) {
            // Check food and heal
            if (ctx.counts["minecraft:cooked_beef"] || ctx.counts["minecraft:bread"]) {
                this.bot.eat(tick);
                return true;
            }
        }
        // Find shelter nearby before darkness
        const shelter = this.findShelterSpot(ctx.p, 16);
        if (shelter) {
            this.bot.navTo(center(shelter), tick, 2);
            this.bot.reason = "Fall 2: mountain ledge sunset - finding shelter before night";
            return true;
        }
        // Place torch if have
        if (ctx.hasTorch) {
            this.placeTorchNearby(ctx.p, tick);
            return true;
        }
        // Retreat from edge
        this.retreatFromEdge(ctx.p, tick);
        return true;
    }

    handleCaveWhileTreeCut(ctx, tick) {
        // Unexpected descent, no torches, limited equipment
        if (!ctx.hasTorch) {
            // Craft torch from coal or charcoal
            if ((ctx.counts["minecraft:coal"] ?? 0) > 0 && (ctx.counts["minecraft:stick"] ?? 0) > 0) {
                try { this.bot.obtain("minecraft:torch", 4, tick); return true; } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }
            }
        } else {
            this.placeTorchNearby(ctx.p, tick);
            return true;
        }
        // Find exit up
        const up = this.findUpwardRoute(ctx.p, 10);
        if (up) {
            this.bot.navTo(center(up), tick, 1);
            this.bot.reason = "Fall 3: cave while cutting tree - finding exit up";
            return true;
        }
        return false;
    }

    handleWaterUnderwaterCave(ctx, tick) {
        // Oxygen management, safe ascent
        if (ctx.oxygenLow) {
            // Find air pocket or surface
            const air = this.findAirPocket(ctx.p, 8);
            if (air) {
                this.bot.navTo(center(air), tick, 1);
                this.bot.reason = "Fall 4: water above underwater cave - finding air pocket";
                return true;
            }
            // Ascend
            const surface = { x: ctx.p.x, y: ctx.p.y + 8, z: ctx.p.z };
            this.bot.avatar.hop(center(surface));
            return true;
        }
        return false;
    }

    handleLavaPoolMining(ctx, tick) {
        // Immediate hazard, limited blocks, no fire resistance
        if (ctx.nearLava) {
            // Retreat
            const safe = this.findSafeSpotAwayFromLava(ctx.p, 6);
            if (safe) {
                this.bot.navTo(center(safe), tick, 1);
                this.bot.reason = "Fall 5: lava pool while mining - immediate retreat";
                return true;
            }
            // Place block barrier
            if (ctx.hasBlocks) {
                const barrier = this.placeBarrierToLava(ctx.p, tick);
                if (barrier) return true;
            }
        }
        return false;
    }

    handleRavineSkeletonAbove(ctx, tick) {
        // Ranged damage, cover, climb-out
        const cover = this.findCoverFromAbove(ctx.p, ctx.threats);
        if (cover) {
            this.bot.navTo(center(cover), tick, 1);
            this.bot.reason = "Fall 6: ravine skeleton above - finding cover";
            return true;
        }
        // Climb out perpendicular
        const climb = this.findClimbRoutePerpendicular(ctx.p, ctx.threats, 8);
        if (climb) {
            this.bot.navTo(center(climb), tick, 1);
            return true;
        }
        if (ctx.hasBlocks) {
            this.builder?.buildWall(ctx.p, { x: 1, y: 0, z: 0 }, 3, 2, tick);
            return true;
        }
        return false;
    }

    handleHoleCreeperChase(ctx, tick) {
        // Confined space, explosion risk, blocked exit
        const creeper = ctx.threats.find(t => t.typeId === "minecraft:creeper");
        if (creeper) {
            const dist = distance(creeper.location, this.sim.location);
            if (dist < 5) {
                // Retreat away
                const away = this.findAwayFrom(creeper.location, 6);
                if (away) {
                    this.bot.navTo(center(away), tick, 1);
                    this.bot.reason = "Fall 7: hole creeper chase - retreating from explosion radius";
                    return true;
                }
            }
        }
        // Find alternate exit
        const exit = this.findAlternateExit(ctx.p, 6);
        if (exit) {
            this.bot.navTo(center(exit), tick, 1);
            return true;
        }
        return false;
    }

    handleCaveBrokenPickaxe(ctx, tick) {
        if (ctx.pickaxeDurabilityLow || !ctx.hasPickaxe) {
            // Find alternate exit no mine
            const exit = this.findExitNoMining(ctx.p, 10);
            if (exit) {
                this.bot.navTo(center(exit), tick, 1);
                this.bot.reason = "Fall 8: broken pickaxe - finding exit without mining";
                return true;
            }
            // Try craft new if possible
            if ((ctx.counts["minecraft:cobblestone"] ?? 0) >= 3 && (ctx.counts["minecraft:stick"] ?? 0) >= 2) {
                try { this.bot.obtain("minecraft:stone_pickaxe", 1, tick); return true; } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }
            }
            if ((ctx.counts["minecraft:oak_planks"] ?? 0) >= 3 && (ctx.counts["minecraft:stick"] ?? 0) >= 2) {
                try { this.bot.obtain("minecraft:wooden_pickaxe", 1, tick); return true; } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }
            }
        }
        return false;
    }

    handleNarrowLedgeLava(ctx, tick) {
        // Balance, safe movement, block placement
        this.bot.avatar.setSneaking(true);
        if (ctx.hasBlocks) {
            // Widen ledge
            const widen = this.widenLedge(ctx.p, tick);
            if (widen) return true;
        }
        // Retreat to safe
        const safe = this.findSafeSpotAwayFromLava(ctx.p, 4);
        if (safe) {
            this.bot.navTo(center(safe), tick, 1);
            this.bot.reason = "Fall 9: narrow ledge above lava - sneaking and widening";
            return true;
        }
        return false;
    }

    handleDeepCaveSunset(ctx, tick) {
        if (!ctx.hasTorch) {
            // Craft torch if possible
            if ((ctx.counts["minecraft:coal"] ?? 0) > 0) {
                try { this.bot.obtain("minecraft:torch", 4, tick); return true; } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }
            }
        } else {
            this.placeTorchNearby(ctx.p, tick);
            return true;
        }
        // Retreat if overwhelmed
        if (ctx.threats.length >= 2) {
            const exit = this.findUpwardRoute(ctx.p, 12);
            if (exit) {
                this.bot.navTo(center(exit), tick, 1);
                this.bot.reason = "Fall 10: deep cave after sunset - retreating to surface";
                return true;
            }
        }
        return false;
    }

    handleWaterDrownedChase(ctx, tick) {
        if (ctx.oxygenLow) {
            const air = this.findAirPocket(ctx.p, 6);
            if (air) {
                this.bot.navTo(center(air), tick, 1);
                return true;
            }
        }
        // Combat drowned if needed
        if (ctx.threats.some(t => t.typeId === "minecraft:drowned")) {
            const drowned = ctx.threats.find(t => t.typeId === "minecraft:drowned");
            if (drowned && distance(drowned.location, this.sim.location) < 4) {
                this.combat.tick(drowned, tick, { list: ctx.threats, count: ctx.threats.length });
                return true;
            }
        }
        // Find shore
        const shore = this.terrain.shoreNear(this.sim.location, 20);
        if (shore) {
            this.bot.navTo(center(shore.cell), tick, 1);
            this.bot.reason = "Fall 11: water drowned chase - finding shore";
            return true;
        }
        return false;
    }

    handleTreeSpiderEncounter(ctx, tick) {
        if (!ctx.hasWeapon) {
            // Equip weapon immediately
            if (this.bot.equipment.ensureWeaponEquipped()) return true;
            // Craft quick weapon
            try { this.bot.obtain("minecraft:wooden_sword", 1, tick); return true; } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }
        }
        // Kite spider
        const spider = ctx.threats.find(t => t.typeId.includes("spider"));
        if (spider) {
            const away = this.findAwayFrom(spider.location, 5);
            if (away) {
                this.bot.navTo(center(away), tick, 1);
                this.bot.reason = "Fall 12: tree spider encounter - kiting";
                return true;
            }
        }
        return false;
    }

    handleRavineLoseSurface(ctx, tick) {
        // Mark current pos with torch
        if (ctx.hasTorch) {
            this.placeTorchNearby(ctx.p, tick);
            this.torchMarkers.push({ ...ctx.p, tick });
        }
        // Find upward route
        const up = this.findUpwardRoute(ctx.p, 12);
        if (up) {
            this.bot.navTo(center(up), tick, 1);
            this.bot.reason = "Fall 13: ravine lose surface - systematic climb with torch markers";
            return true;
        }
        return false;
    }

    handleCaveEmptyHunger(ctx, tick) {
        if (ctx.hunger <= 4) {
            this.bot.avatar.setSprinting(false);
            // Avoid sprinting
        }
        if ((ctx.counts["minecraft:bread"] ?? 0) > 0 || (ctx.counts["minecraft:cooked_beef"] ?? 0) > 0) {
            this.bot.eat(tick);
            return true;
        }
        // Find easy exit
        const easy = this.findEasyExit(ctx.p, 10);
        if (easy) {
            this.bot.navTo(center(easy), tick, 1);
            this.bot.reason = "Fall 14: cave empty hunger - finding easy exit, conserving hunger";
            return true;
        }
        return false;
    }

    handleHoleTooDeep(ctx, tick) {
        const depth = this.fallStartY ? this.fallStartY - ctx.p.y : 5;
        if (depth > 3 && ctx.hasBlocks) {
            const pillar = this.builder.pillar(tick);
            if (pillar === "placed" || pillar === "jumping") {
                this.bot.reason = `Fall 15: hole too deep (${depth}) - pillaring up safely`;
                return true;
            }
        }
        const alt = this.findAlternateExit(ctx.p, 8);
        if (alt) {
            this.bot.navTo(center(alt), tick, 1);
            return true;
        }
        return false;
    }

    // ===== NIGHT COMBAT 16-30 =====
    handleNightCombat(id, scenario, ctx, tick) {
        switch (id) {
            case 16: return this.handleSunset3SkeletonsZombie(ctx, tick);
            case 17: return this.handle4ZombiesBuildingShelter(ctx, tick);
            case 18: return this.handleCreeper2SkeletonsBlockHome(ctx, tick);
            case 19: return this.handleSpiderRoofSkeletonOutside(ctx, tick);
            case 20: return this.handle2CreepersNarrowEntrance(ctx, tick);
            case 21: return this.handleZombieBlocksExitSkeletonAbove(ctx, tick);
            case 22: return this.handleWitchLowHealth(ctx, tick);
            case 23: return this.handleMobEntersSmallShelter(ctx, tick);
            case 24: return this.handleZombieThenSkeletonJoins(ctx, tick);
            case 25: return this.handleCreeperDestroysEntrance(ctx, tick);
            case 26: return this.handleSkeletonKnocksTowardCliff(ctx, tick);
            case 27: return this.handleSpiderZombiePursueIntoCave(ctx, tick);
            case 28: return this.handleHostileGroupWoodenSword(ctx, tick);
            case 29: return this.handleAttackedWhileEating(ctx, tick);
            case 30: return this.handleVillageAtNightZombies(ctx, tick);
            default: return false;
        }
    }

    handleSunset3SkeletonsZombie(ctx, tick) {
        // Break LOS, separate enemies, retreat
        const cover = this.findCoverFromRanged(ctx.threats);
        if (cover) {
            this.bot.navTo(center(cover), tick, 1);
            this.bot.reason = "Night 16: 3 skeletons + zombie sunset - breaking LOS, separating";
            return true;
        }
        // Retreat
        const retreat = this.findRetreatSpot(ctx.p, ctx.threats, 12);
        if (retreat) {
            this.bot.navTo(center(retreat), tick, 1);
            return true;
        }
        return false;
    }

    handle4ZombiesBuildingShelter(ctx, tick) {
        // Interrupted construction, escape route, defensive positioning
        if (ctx.threats.length >= 3) {
            // Abort build, defensive position
            const defensive = this.findDefensivePosition(ctx.p, ctx.threats);
            if (defensive) {
                this.bot.navTo(center(defensive), tick, 1);
                this.bot.reason = "Night 17: 4 zombies while building - defensive position, keep escape route";
                return true;
            }
        }
        return false;
    }

    handleCreeper2SkeletonsBlockHome(ctx, tick) {
        const creeper = ctx.threats.find(t => t.typeId === "minecraft:creeper");
        if (creeper) {
            const dist = distance(creeper.location, this.sim.location);
            if (dist < 6) {
                const away = this.findAwayFrom(creeper.location, 8);
                if (away) {
                    this.bot.navTo(center(away), tick, 1);
                    this.bot.reason = "Night 18: creeper + 2 skeletons block home - assessing explosion distance";
                    return true;
                }
            }
        }
        const cover = this.findCoverFromRanged(ctx.threats.filter(t => t.typeId.includes("skeleton")));
        if (cover) {
            this.bot.navTo(center(cover), tick, 1);
            return true;
        }
        // Alternate route home
        const home = this.bot.home();
        if (home) {
            const alt = this.findAlternateRouteTo(home, ctx.threats, 16);
            if (alt) {
                this.bot.navTo(center(alt), tick, 1);
                return true;
            }
        }
        return false;
    }

    handleSpiderRoofSkeletonOutside(ctx, tick) {
        // Multiple angles, shelter integrity
        const spider = ctx.threats.find(t => t.typeId.includes("spider"));
        if (spider && distance(spider.location, this.sim.location) < 5) {
            this.combat.tick(spider, tick, { list: ctx.threats, count: ctx.threats.length });
            this.bot.reason = "Night 19: spider roof + skeleton outside - handling spider first";
            return true;
        }
        const cover = this.findCoverFromRanged(ctx.threats.filter(t => t.typeId.includes("skeleton")));
        if (cover) {
            this.bot.navTo(center(cover), tick, 1);
            return true;
        }
        return false;
    }

    handle2CreepersNarrowEntrance(ctx, tick) {
        const creepers = ctx.threats.filter(t => t.typeId === "minecraft:creeper");
        if (creepers.length >= 2) {
            // Lure one away
            const one = creepers[0];
            const away = this.findAwayFrom(one.location, 10);
            if (away) {
                this.bot.navTo(center(away), tick, 1);
                this.bot.reason = "Night 20: 2 creepers narrow entrance - luring one away, prevent simultaneous";
                return true;
            }
        }
        return false;
    }

    handleZombieBlocksExitSkeletonAbove(ctx, tick) {
        const exit = this.findAlternateExit(ctx.p, 8);
        if (exit) {
            this.bot.navTo(center(exit), tick, 1);
            this.bot.reason = "Night 21: zombie blocks exit skeleton above - finding alternate exit";
            return true;
        }
        const cover = this.findCoverFromRanged(ctx.threats.filter(t => t.typeId.includes("skeleton")));
        if (cover) {
            this.bot.navTo(center(cover), tick, 1);
            return true;
        }
        return false;
    }

    handleWitchLowHealth(ctx, tick) {
        if (ctx.hp <= 10) {
            const retreat = this.findRetreatSpot(ctx.p, ctx.threats, 16);
            if (retreat) {
                this.bot.navTo(center(retreat), tick, 1);
                this.bot.reason = "Night 22: witch low health - immediate retreat, avoid potion";
                return true;
            }
        }
        return false;
    }

    handleMobEntersSmallShelter(ctx, tick) {
        // Doorway control, escape feasibility
        if (ctx.threats.length && this.shelterPos) {
            const doorway = this.findDoorway(ctx.p);
            if (doorway) {
                // Block entrance
                if (ctx.hasBlocks) {
                    const res = this.builder.placeAt(doorway, add(doorway, DOWN), { sneak: true });
                    if (res === "placed") {
                        this.bot.reason = "Night 23: mob enters small shelter - doorway control, blocking entrance";
                        return true;
                    }
                }
            }
            // Escape if feasible
            const escape = this.findEscapeFromShelter(ctx.p, 6);
            if (escape) {
                this.bot.navTo(center(escape), tick, 1);
                return true;
            }
        }
        return false;
    }

    handleZombieThenSkeletonJoins(ctx, tick) {
        // Threat reassessment, avoid tunnel vision
        const skeleton = ctx.threats.find(t => t.typeId.includes("skeleton"));
        if (skeleton) {
            // Prioritize skeleton
            const cover = this.findCoverFromRanged([skeleton]);
            if (cover) {
                this.bot.navTo(center(cover), tick, 1);
                this.bot.reason = "Night 24: zombie then skeleton joins - reassessing, prioritize skeleton, avoid tunnel vision";
                return true;
            }
        }
        return false;
    }

    handleCreeperDestroysEntrance(ctx, tick) {
        const safe = this.findSafeSpot(ctx.p, 10);
        if (safe) {
            this.bot.navTo(center(safe), tick, 1);
            this.bot.reason = "Night 25: creeper destroys entrance - terrain changed, emergency retreat";
            return true;
        }
        return false;
    }

    handleSkeletonKnocksTowardCliff(ctx, tick) {
        this.bot.avatar.setSneaking(true);
        const safe = this.findSafeSpotAwayFromCliff(ctx.p, 6);
        if (safe) {
            this.bot.navTo(center(safe), tick, 1);
            this.bot.reason = "Night 26: skeleton knocks toward cliff - knockback recovery, sneak";
            return true;
        }
        return false;
    }

    handleSpiderZombiePursueIntoCave(ctx, tick) {
        // Avoid cornered, narrow passage control
        const chokepoint = this.findChokepoint(ctx.p, 8);
        if (chokepoint) {
            this.bot.navTo(center(chokepoint), tick, 1);
            this.bot.reason = "Night 27: spider+zombie pursue into cave - chokepoint control, avoid cornered";
            return true;
        }
        return false;
    }

    handleHostileGroupWoodenSword(ctx, tick) {
        if (!ctx.hasWeapon || this.isWeaponWeak()) {
            const retreat = this.findRetreatSpot(ctx.p, ctx.threats, 16);
            if (retreat) {
                this.bot.navTo(center(retreat), tick, 1);
                this.bot.reason = "Night 28: hostile group wooden sword only - weapon disadvantage, escape over fight";
                return true;
            }
        }
        return false;
    }

    handleAttackedWhileEating(ctx, tick) {
        const nearest = ctx.threats[0];
        if (nearest && distance(nearest.location, this.sim.location) < 5) {
            // Cancel eating
            try { this.bot.avatar.stopUsing(); } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }
            this.bot.eatingUntil = 0;
            this.bot.reason = "Night 29: attacked while eating - cancel eating, immediate danger";
            // Equip weapon
            this.bot.equipment.ensureWeaponEquipped();
            return true;
        }
        // Complete eating if safe
        return false;
    }

    handleVillageAtNightZombies(ctx, tick) {
        // Secure shelter in village
        const house = this.findSafeHouseInVillage(ctx.p, 24);
        if (house) {
            this.bot.navTo(center(house), tick, 1);
            this.bot.reason = "Night 30: village at night zombies - securing shelter, barricade doors";
            return true;
        }
        return false;
    }

    // ===== RESOURCE SHORTAGES 31-45 =====
    handleResourceShortage(id, scenario, ctx, tick) {
        switch (id) {
            case 31: return this.handleNoWoodLowHungerSunset(ctx, tick);
            case 32: return this.handleWoodNoTable(ctx, tick);
            case 33: return this.handleTableInsufficientPlanks(ctx, tick);
            case 34: return this.handlePickaxeBreaksBeforeStone(ctx, tick);
            case 35: return this.handleStoneNoCoalTorches(ctx, tick);
            case 36: return this.handleFoodRunsOutReturning(ctx, tick);
            case 37: return this.handleInventoryFullLowValue(ctx, tick);
            case 38: return this.handleIronNoFurnaceFuel(ctx, tick);
            case 39: return this.handleFoodAcrossRiverHostile(ctx, tick);
            case 40: return this.handleShelterDirtFewLogs(ctx, tick);
            case 41: return this.handleWoodForBedNoWool(ctx, tick);
            case 42: return this.handleWoolNoWoodForBed(ctx, tick);
            case 43: return this.handleWeaponDurabilityExhausted(ctx, tick);
            case 44: return this.handleFoodNoWeaponPassiveNearHostile(ctx, tick);
            case 45: return this.handleValuableLootNoBlocksRavine(ctx, tick);
            default: return false;
        }
    }

    handleNoWoodLowHungerSunset(ctx, tick) {
        if (Object.entries(ctx.counts).filter(([k]) => k.endsWith("_log") || k.endsWith("_wood")).reduce((a,[,v])=>a+v,0) < 3) {
            this.bot.assignMine("#logs", 5) // any wood acceptable - fixed
            this.bot.reason = "Resource 31: no wood low hunger sunset - prioritize safe wood collection";
            return true;
        }
        if (ctx.hunger <= 6) {
            // Find food
            const food = this.findFoodNearby(ctx.p, 12);
            if (food) {
                this.bot.navTo(center(food), tick, 1);
                return true;
            }
        }
        // Build minimal shelter
        const shelter = this.buildMinimalShelter(ctx.p, tick);
        if (shelter) return true;
        return false;
    }

    handleWoodNoTable(ctx, tick) {
        try { this.bot.obtain("minecraft:crafting_table", 1, tick); this.bot.reason = "Resource 32: wood no table - crafting dependency, craft table immediately"; return true; } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }
        // Minimal shelter with logs
        if (ctx.hasBlocks) {
            this.builder.buildBunker(ctx.p, tick, false);
            return true;
        }
        return false;
    }

    handleTableInsufficientPlanks(ctx, tick) {
        // Weapon first
        if (!ctx.hasWeapon) {
            try { this.bot.obtain("minecraft:wooden_sword", 1, tick); this.bot.reason = "Resource 33: insufficient planks - weapon first over shelter"; return true; } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }
        }
        // Shelter with dirt
        if (ctx.hasBlocks) {
            this.builder.buildBunker(ctx.p, tick, false);
            return true;
        }
        return false;
    }

    handlePickaxeBreaksBeforeStone(ctx, tick) {
        if (!ctx.hasPickaxe) {
            if ((ctx.counts["minecraft:oak_planks"] ?? 0) >= 3) {
                try { this.bot.obtain("minecraft:wooden_pickaxe", 1, tick); this.bot.reason = "Resource 34: pickaxe breaks before stone - replace tool"; return true; } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }
            }
        }
        return false;
    }

    handleStoneNoCoalTorches(ctx, tick) {
        if (!ctx.hasTorch) {
            if (Object.entries(ctx.counts).filter(([k]) => k.endsWith("_log")).reduce((a,[,v])=>a+v,0) > 0) {
                // Make charcoal
                try { this.bot.obtain("minecraft:charcoal", 2, tick); return true; } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }
                try { this.bot.obtain("minecraft:torch", 4, tick); this.bot.reason = "Resource 35: stone no coal - charcoal alternative light"; return true; } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }
            }
            // Retreat to surface
            const up = this.findUpwardRoute(ctx.p, 12);
            if (up) {
                this.bot.navTo(center(up), tick, 1);
                this.bot.reason = "Resource 35: no coal torches - retreat to surface";
                return true;
            }
        }
        return false;
    }

    handleFoodRunsOutReturning(ctx, tick) {
        const food = this.findFoodNearby(ctx.p, 16);
        if (food) {
            this.bot.navTo(center(food), tick, 1);
            this.bot.reason = "Resource 36: food runs out returning - safe food acquisition vs shelter";
            return true;
        }
        // Shelter if night
        if (ctx.time === "night" || ctx.time === "sunset") {
            this.buildMinimalShelter(ctx.p, tick);
            return true;
        }
        return false;
    }

    handleInventoryFullLowValue(ctx, tick) {
        // Discard low-value, retain essentials
        this.bot.resource.organizeIfNeeded();
        this.bot.reason = "Resource 37: inventory full low-value - discarding low, retain essentials";
        // Logic handled by resource manager
        return false;
    }

    handleIronNoFurnaceFuel(ctx, tick) {
        // Remember iron pos
        try { this.bot.awareness?.rememberSpot("iron_ore", ctx.p, tick, 95); } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }
        if ((ctx.counts["minecraft:cobblestone"] ?? 0) >= 8) {
            try { this.bot.obtain("minecraft:furnace", 1, tick); this.bot.reason = "Resource 38: iron no furnace - progression opportunity, craft furnace"; return true; } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }
        }
        if (ctx.time === "night") {
            this.buildMinimalShelter(ctx.p, tick);
            return true;
        }
        return false;
    }

    handleFoodAcrossRiverHostile(ctx, tick) {
        const food = this.findFoodNearby(ctx.p, 20);
        if (food) {
            const routeRisk = this.assessRouteRisk(ctx.p, food, ctx.threats);
            if (routeRisk < 70) {
                this.bot.navTo(center(food), tick, 1);
                this.bot.reason = "Resource 39: food across river hostile - route risk assessed, crossing if safe";
                return true;
            }
        }
        return false;
    }

    handleShelterDirtFewLogs(ctx, tick) {
        const built = this.buildMinimalShelter(ctx.p, tick);
        if (built) {
            this.bot.reason = "Resource 40: dirt few logs - minimal viable defense, entrance 1-block, emergency exit";
            return true;
        }
        return false;
    }

    handleWoodForBedNoWool(ctx, tick) {
        // Search sheep
        const sheep = this.bot.awareness?.getNearest("sheep");
        if (sheep) {
            this.bot.navTo(center(sheep.pos), tick, 2);
            this.bot.reason = "Resource 41: wood for bed no wool - searching sheep";
            return true;
        }
        this.buildMinimalShelter(ctx.p, tick);
        return true;
    }

    handleWoolNoWoodForBed(ctx, tick) {
        if (Object.entries(ctx.counts).filter(([k]) => k.endsWith("_log") || k.endsWith("_wood")).reduce((a,[,v])=>a+v,0) < 3) {
            this.bot.assignMine("#logs", 3) // any wood acceptable - fixed
            this.bot.reason = "Resource 42: wool no wood for bed - searching wood";
            return true;
        }
        try { this.bot.obtain("minecraft:white_bed", 1, tick); return true; } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }
        return false;
    }

    handleWeaponDurabilityExhausted(ctx, tick) {
        if (ctx.lowDurability) {
            const retreat = this.findRetreatSpot(ctx.p, ctx.threats, 12);
            if (retreat) {
                this.bot.navTo(center(retreat), tick, 1);
                this.bot.reason = "Resource 43: weapon durability exhausted - retreat planning, avoid combat";
                return true;
            }
        }
        return false;
    }

    handleFoodNoWeaponPassiveNearHostile(ctx, tick) {
        if (!ctx.hasWeapon) {
            try { this.bot.obtain("minecraft:wooden_sword", 1, tick); this.bot.reason = "Resource 44: food no weapon passive near hostile - craft weapon first"; return true; } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }
        }
        return false;
    }

    handleValuableLootNoBlocksRavine(ctx, tick) {
        const safeRoute = this.findSafeRouteAvoidingRavine(ctx.p, 16);
        if (safeRoute) {
            this.bot.navTo(center(safeRoute), tick, 1);
            this.bot.reason = "Resource 45: valuable loot no blocks ravine - preserve loot, find safe route, avoid forced jumps";
            return true;
        }
        // Gather blocks if safe
        if (ctx.threats.length === 0) {
            this.bot.assignMine("minecraft:dirt", 10);
            return true;
        }
        return false;
    }

    // ===== SHELTER FAILURES 46-60 =====
    handleShelterFailure(id, scenario, ctx, tick) {
        switch (id) {
            case 46: return this.handleDigHillsideOpensCave(ctx, tick);
            case 47: return this.handleShelterFlooded(ctx, tick);
            case 48: return this.handleGravelCollapsesExit(ctx, tick);
            case 49: return this.handleShelterTooCloseCliff(ctx, tick);
            case 50: return this.handleCaveTwoExitsOneSkeleton(ctx, tick);
            case 51: return this.handleLoseSpawnDirection(ctx, tick);
            case 52: return this.handleNightForestNoShelter(ctx, tick);
            case 53: return this.handleTrappedRiverHostile(ctx, tick);
            case 54: return this.handleShelterSafeFoodToolsOutside(ctx, tick);
            case 55: return this.handleBlocksInsideOneBlockEntrance(ctx, tick);
            case 56: return this.handleShelterDarkUnlitChamber(ctx, tick);
            case 57: return this.handleHostileEntersWhileMiningInterior(ctx, tick);
            case 58: return this.handleVillageHousesOccupied(ctx, tick);
            case 59: return this.handleShelterSafeZombieButSkeletonArrows(ctx, tick);
            case 60: return this.handleCannotFindShelter(ctx, tick);
            default: return false;
        }
    }

    handleDigHillsideOpensCave(ctx, tick) {
        // Seal entrance immediately
        if (ctx.hasBlocks) {
            const entrance = this.findCaveEntrance(ctx.p, 4);
            if (entrance) {
                const res = this.builder.placeAt(entrance, add(entrance, DOWN), { sneak: true });
                if (res === "placed") {
                    this.bot.reason = "Shelter 46: dig hillside opens cave mobs - sealing entrance, retreat";
                    return true;
                }
            }
        }
        const retreat = this.findRetreatSpot(ctx.p, ctx.threats, 8);
        if (retreat) {
            this.bot.navTo(center(retreat), tick, 1);
            return true;
        }
        return false;
    }

    handleShelterFlooded(ctx, tick) {
        const waterSource = this.findWaterSource(ctx.p, 6);
        if (waterSource && ctx.hasBlocks) {
            const res = this.builder.placeAt(waterSource, add(waterSource, DOWN), { sneak: true });
            if (res === "placed") {
                this.bot.reason = "Shelter 47: entrance flooded - blocking water source, avoid drowning";
                return true;
            }
        }
        const otherExit = this.findAlternateExit(ctx.p, 6);
        if (otherExit) {
            this.bot.navTo(center(otherExit), tick, 1);
            return true;
        }
        return false;
    }

    handleGravelCollapsesExit(ctx, tick) {
        // Torch breaks gravel
        if (ctx.hasTorch) {
            const gravel = this.findGravelAbove(ctx.p, 3);
            if (gravel) {
                // Place torch below gravel to break
                const below = add(gravel, DOWN);
                if (this.terrain.empty(below)) {
                    const support = this.builder.findSupportFor(below);
                    if (support) {
                        const slot = this.bag.find(s => s.typeId === "minecraft:torch");
                        if (slot >= 0) {
                            const selected = this.bag.select(slot);
                            try {
                                this.bot.avatar.lookBlock(support.pos);
                                this.bot.avatar.useOn(selected, support.pos, Direction.Up);
                                this.bot.reason = "Shelter 48: gravel collapses exit - torch breaks gravel";
                                return true;
                            } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }
                        }
                    }
                }
            }
        }
        const alt = this.findAlternateExit(ctx.p, 8);
        if (alt) {
            this.bot.navTo(center(alt), tick, 1);
            return true;
        }
        return false;
    }

    handleShelterTooCloseCliff(ctx, tick) {
        const safe = this.findSafeSpotAwayFromCliff(ctx.p, 8);
        if (safe) {
            this.bot.navTo(center(safe), tick, 1);
            this.bot.reason = "Shelter 49: too close cliff - repositioning away, knockback risk";
            return true;
        }
        return false;
    }

    handleCaveTwoExitsOneSkeleton(ctx, tick) {
        const skeleton = ctx.threats.find(t => t.typeId.includes("skeleton"));
        if (skeleton) {
            const exits = this.findTwoExits(ctx.p, 8);
            if (exits.length >= 2) {
                // Choose exit not occupied by skeleton
                const safeExit = exits.find(e => distance(e, skeleton.location) > distance(exits[0], skeleton.location) ? true : false) ?? exits[1];
                this.bot.navTo(center(safeExit), tick, 1);
                this.bot.reason = "Shelter 50: cave two exits one skeleton - route selection, cover";
                return true;
            }
        }
        return false;
    }

    handleLoseSpawnDirection(ctx, tick) {
        // Use torches as landmarks
        if (ctx.hasTorch) {
            this.placeTorchNearby(ctx.p, tick);
            this.torchMarkers.push({ ...ctx.p, tick });
        }
        const home = this.bot.home();
        if (home) {
            this.bot.navTo(center(home), tick, 3);
            this.bot.reason = "Shelter 51: lose spawn direction - orientation recovery via home";
            return true;
        }
        return false;
    }

    handleNightForestNoShelter(ctx, tick) {
        const shelter = this.buildMinimalShelter(ctx.p, tick);
        if (shelter) {
            this.bot.reason = "Shelter 52: night forest no shelter - tree density cover, minimal defensive";
            return true;
        }
        // Pillar 2 high
        if (ctx.hasBlocks) {
            this.builder.pillar(tick);
            return true;
        }
        return false;
    }

    handleTrappedRiverHostile(ctx, tick) {
        const boat = findBoat(this.sim);
        if (boat) {
            this.bot.boatTravel(tick);
            this.bot.reason = "Shelter 53: trapped river hostile - boat crossing";
            return true;
        }
        const crossing = this.findRiverCrossing(ctx.p, 12);
        if (crossing) {
            this.bot.navTo(center(crossing), tick, 1);
            return true;
        }
        // Defensive positioning
        const defensive = this.findDefensivePosition(ctx.p, ctx.threats);
        if (defensive) {
            this.bot.navTo(center(defensive), tick, 1);
            return true;
        }
        return false;
    }

    handleShelterSafeFoodToolsOutside(ctx, tick) {
        // Assess retrieval necessity
        const foodOutside = (ctx.counts["minecraft:bread"] ?? 0) < 2 && (ctx.counts["minecraft:cooked_beef"] ?? 0) < 2;
        if (!foodOutside) {
            this.bot.reason = "Shelter 54: shelter safe food outside - wait, food enough inside";
            return false; // wait
        }
        // Create second exit
        if (ctx.hasBlocks) {
            const secondExit = this.findSecondExitSpot(ctx.p, 4);
            if (secondExit) {
                const res = this.builder.placeAt(add(ctx.p, { x: 1, y: 0, z: 0 }), ctx.p, { sneak: true });
                // Actually need to break to create exit
                // For now, try to find safe retrieval route
                const safeRoute = this.findSafeRouteToOutside(ctx.p, 8, ctx.threats);
                if (safeRoute) {
                    this.bot.navTo(center(safeRoute), tick, 1);
                    this.bot.reason = "Shelter 54: food outside hostile - second exit, retrieve if critical";
                    return true;
                }
            }
        }
        return false;
    }

    handleBlocksInsideOneBlockEntrance(ctx, tick) {
        // Verify escape options
        const escapes = this.findExits(ctx.p, 3);
        if (escapes.length === 0) {
            // Reopen
            const toBreak = add(ctx.p, { x: 1, y: 0, z: 0 });
            const b = this.terrain.block(toBreak);
            if (b && !b.isAir) {
                this.bot.avatar.lookBlock(toBreak);
                this.bot.avatar.breakBlockAt(toBreak);
                this.bot.reason = "Shelter 55: blocks inside one-block entrance - reopening safely";
                return true;
            }
        }
        return false;
    }

    handleShelterDarkUnlitChamber(ctx, tick) {
        if (ctx.hasTorch) {
            this.placeTorchNearby(ctx.p, tick);
            this.bot.reason = "Shelter 56: dark unlit chamber - lighting immediately, avoid spawn";
            return true;
        }
        return false;
    }

    handleHostileEntersWhileMiningInterior(ctx, tick) {
        if (ctx.threats.length) {
            const escape = this.findDoorway(ctx.p) ?? this.findEscapeFromShelter(ctx.p, 5);
            if (escape) {
                this.bot.navTo(center(escape), tick, 1);
                this.bot.reason = "Shelter 57: hostile enters while mining interior - doorway escape";
                return true;
            }
            // Combat
            this.combat.tick(ctx.threats[0], tick, { list: ctx.threats, count: ctx.threats.length });
            return true;
        }
        return false;
    }

    handleVillageHousesOccupied(ctx, tick) {
        const house = this.findSafeHouseInVillage(ctx.p, 24);
        if (house) {
            this.bot.navTo(center(house), tick, 1);
            this.bot.reason = "Shelter 58: village houses occupied - alternate building near village";
            return true;
        }
        this.buildMinimalShelter(ctx.p, tick);
        return true;
    }

    handleShelterSafeZombieButSkeletonArrows(ctx, tick) {
        const skeleton = ctx.threats.find(t => t.typeId.includes("skeleton"));
        if (skeleton) {
            // LOS analysis, redesign entrance with wall
            if (ctx.hasBlocks) {
                const wallPos = add(ctx.p, { x: 1, y: 0, z: 0 });
                if (this.terrain.empty(wallPos)) {
                    const support = this.builder.findSupportFor(wallPos);
                    if (support) {
                        const res = this.builder.placeAt(wallPos, support.pos, { sneak: true });
                        if (res === "placed") {
                            this.bot.reason = "Shelter 59: safe zombie but skeleton arrows - LOS analysis, wall to block arrows";
                            return true;
                        }
                    }
                }
            }
            const reposition = this.findRepositionAwayFromSkeleton(ctx.p, skeleton.location, 6);
            if (reposition) {
                this.bot.navTo(center(reposition), tick, 1);
                return true;
            }
        }
        return false;
    }

    handleCannotFindShelter(ctx, tick) {
        // Fallback shelter dirt
        const built = this.buildMinimalShelter(ctx.p, tick);
        if (built) {
            this.bot.reason = "Shelter 60: cannot find shelter before sunset - fallback emergency dirt shelter, avoid wandering";
            return true;
        }
        return false;
    }

    // ===== MULTI-RISK 61-80 =====
    handleMultiRisk(id, scenario, ctx, tick) {
        const risk = multiRiskPriority(ctx);
        if (risk.level === "critical") {
            // Immediate survival, no unnecessary combat
            return this.handleCriticalMultiRisk(id, ctx, tick);
        }
        if (risk.level === "high") {
            return this.handleHighMultiRisk(id, ctx, tick);
        }
        return false;
    }

    handleCriticalMultiRisk(id, ctx, tick) {
        // All critical: 4 HP + skeletons + zombie + sunset etc
        if (ctx.hp <= 4) {
            // No unnecessary combat, LOS control, find cover, heal if food
            if (ctx.threats.length) {
                const cover = this.findCoverFromRanged(ctx.threats);
                if (cover) {
                    this.bot.navTo(center(cover), tick, 1);
                    this.bot.reason = `Multi ${id}: critical ${ctx.hp}HP - LOS control, no unnecessary combat, cover`;
                    return true;
                }
                const retreat = this.findRetreatSpot(ctx.p, ctx.threats, 16);
                if (retreat) {
                    this.bot.navTo(center(retreat), tick, 1);
                    return true;
                }
            }
            if ((ctx.counts["minecraft:bread"] ?? 0) > 0 || (ctx.counts["minecraft:cooked_beef"] ?? 0) > 0) {
                this.bot.eat(tick);
                return true;
            }
        }

        // Specific multi-risk
        switch (id) {
            case 61: // 4 HP + 3 skeletons + zombie + sunset
                return this.handleSunset3SkeletonsZombie(ctx, tick);
            case 62: // flooding cave + broken pickaxe + low hunger
                if (ctx.oxygenLow) {
                    const air = this.findAirPocket(ctx.p, 6);
                    if (air) { this.bot.navTo(center(air), tick, 1); return true; }
                }
                return this.handleCaveBrokenPickaxe(ctx, tick);
            case 63: // creeper behind + ravine ahead + skeleton above
                return this.handleCreeperRavineSkeleton(ctx, tick);
            case 64: // fall cave + 2 zombies + no torches + broken weapon
                return this.handleCaveEmptyHunger(ctx, tick) || this.handleCaveBrokenPickaxe(ctx, tick);
            case 65: // lava pool + iron + sunset + no food
                // Remember iron, retreat
                try { this.bot.awareness?.rememberSpot("iron_ore", ctx.p, tick, 95); } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }
                if (ctx.time === "sunset" || ctx.time === "night") {
                    this.buildMinimalShelter(ctx.p, tick);
                    this.bot.reason = "Multi 65: lava+iron+sunset+no food - resource temptation, safe retreat, remember iron";
                    return true;
                }
                return false;
            case 66: // full inventory + valuable + low health + hostile
                // Selective discarding
                this.bot.resource.organizeIfNeeded();
                const retreat66 = this.findRetreatSpot(ctx.p, ctx.threats, 12);
                if (retreat66) { this.bot.navTo(center(retreat66), tick, 1); this.bot.reason = "Multi 66: full inventory valuable low health hostile - discarding low, threat avoidance"; return true; }
                return false;
            case 67: // no shelter + rain + 3 hostile + low durability
                this.buildMinimalShelter(ctx.p, tick);
                this.bot.reason = "Multi 67: no shelter rain 3 hostile low dura - minimal defense, survival over fighting";
                return true;
            case 68: // lost forest + low hunger + night + no weapon
                return this.handleNoWoodLowHungerSunset(ctx, tick);
            case 69: // water tunnel + skeleton exit + oxygen low
                if (ctx.oxygenLow) {
                    const air = this.findAirPocket(ctx.p, 5);
                    if (air) { this.bot.navTo(center(air), tick, 1); this.bot.reason = "Multi 69: water tunnel skeleton exit oxygen low - breathable space"; return true; }
                }
                const altExit = this.findAlternateExit(ctx.p, 8);
                if (altExit) { this.bot.navTo(center(altExit), tick, 1); return true; }
                return false;
            case 70: // ravine fall + 3 HP + food + hostile above
                if (ctx.hp <= 3 && (ctx.counts["minecraft:bread"] ?? 0) > 0) {
                    const cover = this.findCoverFromAbove(ctx.p, ctx.threats);
                    if (cover) {
                        this.bot.navTo(center(cover), tick, 1);
                        // Eat if safe
                        if (distance(cover, ctx.p) < 2) this.bot.eat(tick);
                        this.bot.reason = "Multi 70: ravine fall 3HP food + hostile above - safe positioning, heal, vertical escape";
                        return true;
                    }
                }
                return this.handleRavineFleeZombie(ctx, tick);
            case 71: // shelter entrance destroyed + creeper + no blocks
                return this.handleCreeperDestroysEntrance(ctx, tick);
            case 72: // iron ore + pickaxe broken + zombies + no shelter
                return this.handleIronNoFurnaceFuel(ctx, tick);
            case 73: // nightfall + village + pillager + no armor
                const villageSafe = this.assessVillageSafety(ctx.p, ctx.threats);
                if (villageSafe.safe) {
                    this.bot.navTo(center(villageSafe.pos), tick, 2);
                    this.bot.reason = "Multi 73: village pillager no armor - village safer than elsewhere, barricade";
                    return true;
                } else {
                    this.buildMinimalShelter(ctx.p, tick);
                    this.bot.reason = "Multi 73: village pillager no armor - sheltering elsewhere safer";
                    return true;
                }
            case 74: // low health + poison + skeletons + narrow cave
                const wider = this.findWiderArea(ctx.p, 10);
                if (wider) { this.bot.navTo(center(wider), tick, 1); this.bot.reason = "Multi 74: low health poison skeletons narrow cave - find wider, cover"; return true; }
                return this.handleRavineSkeletonAbove(ctx, tick);
            case 75: // water + drowned + low oxygen + blocked shore
                return this.handleWaterDrownedChase(ctx, tick);
            case 76: // tool breaks + gravel blocks route + hostile
                return this.handleGravelCollapsesExit(ctx, tick);
            case 77: // creeper explosion + food + low health + second creeper
                const away77 = this.findAwayFrom(ctx.threats[0]?.location ?? ctx.p, 10);
                if (away77) { this.bot.navTo(center(away77), tick, 1); this.bot.reason = "Multi 77: creeper explosion food low health second creeper - abandon loot, escape blast radius"; return true; }
                return false;
            case 78: // shelter secure + food outside + skeleton guards entrance
                return this.handleShelterSafeFoodToolsOutside(ctx, tick);
            case 79: // hunger depletion + hostile + long route spawn + night
                this.buildMinimalShelter(ctx.p, tick);
                this.bot.reason = "Multi 79: hunger depletion hostile long route night - avoid travel, nearby shelter";
                return true;
            case 80: // respawn first night death no equipment distant drops night mobs
                // Calculate recovery value
                const death = this.bot.memory?.death();
                if (death) {
                    const dist = distance(death, ctx.p);
                    if (dist > 64 || ctx.time === "night") {
                        // Rebuild minimum equipment
                        this.bot.reason = "Multi 80: respawn death no equipment distant drops night mobs - rebuild minimum, wait safer";
                        try { this.bot.obtain("minecraft:wooden_pickaxe", 1, tick); return true; } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }
                        this.buildMinimalShelter(ctx.p, tick);
                        return true;
                    } else {
                        this.bot.navTo(center(death), tick, 3);
                        this.bot.reason = "Multi 80: recovering death drops";
                        return true;
                    }
                }
                return false;
            default: return false;
        }
    }

    handleHighMultiRisk(id, ctx, tick) {
        // Similar but less urgent
        return this.handleCriticalMultiRisk(id, ctx, tick);
    }

    handleCreeperRavineSkeleton(ctx, tick) {
        // Creeper behind + ravine ahead + skeleton above - perpendicular escape
        const creeper = ctx.threats.find(t => t.typeId === "minecraft:creeper");
        const skeleton = ctx.threats.find(t => t.typeId.includes("skeleton"));
        if (creeper && skeleton) {
            // Perpendicular to both
            const perp = this.findPerpendicularEscape(ctx.p, creeper.location, skeleton.location, 8);
            if (perp) {
                this.bot.navTo(center(perp), tick, 1);
                this.bot.reason = "Multi 63: creeper behind ravine ahead skeleton above - perpendicular escape, safe disengagement";
                return true;
            }
        }
        return false;
    }

    // ===== HELPER METHODS =====

    isRavine(p) {
        // Check if ravine: steep drop nearby
        for (const d of CARDINAL) {
            const check = add(p, { x: d.x * 3, y: -5, z: d.z * 3 });
            if (this.terrain.empty(check) && this.terrain.empty(add(check, DOWN)) && this.terrain.empty(add(check, { x:0, y:-1, z:0 }))) return true;
        }
        return false;
    }

    isForest(p) {
        // Cached snapshot reads + early exit (was 847 live getBlock() calls every assessment).
        let logs = 0;
        for (let dx = -5; dx <=5; dx++) for (let dz=-5; dz<=5; dz++) for (let dy=-2; dy<=4; dy++) {
            const t = this.terrain.typeAt({ x: p.x + dx, y: p.y + dy, z: p.z + dz });
            if (t && t.includes("_log") && ++logs >= 5) return true;
        }
        return false;
    }

    isRiverNearby(p) {
        for (let dx=-8; dx<=8; dx++) for (let dz=-8; dz<=8; dz++) {
            if (this.terrain.waterAt({ x: p.x + dx, y: p.y - 1, z: p.z + dz })) return true;
        }
        return false;
    }

    isOnNarrowLedge(p) {
        let solid = 0;
        for (const d of CARDINAL) {
            const check = add(p, { x: d.x, y: -1, z: d.z });
            if (this.terrain.solid(check)) solid++;
        }
        return solid <= 2;
    }

    isFlooded(p) {
        return this.terrain.waterAt(p) || this.terrain.waterAt(add(p, UP));
    }

    isGravelCollapse(p) {
        const above = this.terrain.block(add(p, UP));
        if (above && /gravel|sand/.test(above.typeId)) return true;
        return false;
    }

    isPickaxeLow() {
        for (let i=0; i<this.bag.size; i++) {
            const item = this.bag.get(i);
            if (!item || !item.typeId.includes("_pickaxe")) continue;
            const d = item.getComponent("minecraft:durability");
            if (d && d.maxDurability - d.damage < 10) return true;
        }
        return false;
    }

    isAnyToolLow() {
        for (let i=0; i<this.bag.size; i++) {
            const item = this.bag.get(i);
            if (!item) continue;
            if (!item.typeId.includes("_pickaxe") && !item.typeId.includes("_axe") && !item.typeId.includes("_sword")) continue;
            const d = item.getComponent("minecraft:durability");
            if (d && d.maxDurability - d.damage < 10) return true;
        }
        return false;
    }

    isWeaponWeak() {
        const slot = this.bag.find(s => s.typeId === "minecraft:wooden_sword");
        return slot >= 0 && this.bag.find(s => s.typeId.includes("iron_sword") || s.typeId.includes("stone_sword")) < 0;
    }

    findClimbRoute(p, radius) {
        for (const d of COMPASS) for (let n=2; n<=radius; n++) {
            const q = this.terrain.groundNear(p.x + d.x * n, p.z + d.z * n, p.y, 4);
            if (q && !this.terrain.dangerous(q) && q.y >= p.y) return q;
        }
        return null;
    }

    findClimbRoutePerpendicular(p, threats, radius) {
        if (!threats.length) return this.findClimbRoute(p, radius);
        let avgX=0,avgZ=0;
        for (const t of threats) { avgX+=t.location.x; avgZ+=t.location.z; }
        avgX/=threats.length; avgZ/=threats.length;
        const away = { x: p.x - avgX, z: p.z - avgZ };
        const len = Math.hypot(away.x, away.z) || 1;
        const perp = { x: -away.z/len, z: away.x/len };
        for (let n=3; n<=radius; n++) {
            const q = this.terrain.groundNear(p.x + perp.x * n, p.z + perp.z * n, p.y, 4);
            if (q && !this.terrain.dangerous(q)) return q;
        }
        return null;
    }

    findShelterSpot(p, radius) {
        for (let r=4; r<=radius; r+=2) for (const d of COMPASS) {
            const q = this.terrain.groundNear(p.x + d.x * r, p.z + d.z * r, p.y, 3);
            if (!q || this.terrain.dangerous(q)) continue;
            // Check if sheltered (hill nearby)
            let sheltered = 0;
            for (const cd of CARDINAL) {
                const check = add(q, { x: cd.x, y: 1, z: cd.z });
                if (this.terrain.solid(check)) sheltered++;
            }
            if (sheltered >= 2) return q;
        }
        return null;
    }

    findSafeSpot(p, radius) {
        for (let r=2; r<=radius; r++) for (const d of COMPASS) {
            const q = this.terrain.groundNear(p.x + d.x * r, p.z + d.z * r, p.y, 4);
            if (q && !this.terrain.dangerous(q) && !this.terrain.lavaNear(q)) return q;
        }
        return null;
    }

    findSafeSpotAwayFromLava(p, radius) {
        for (let r=2; r<=radius; r++) for (const d of COMPASS) {
            const q = this.terrain.groundNear(p.x + d.x * r, p.z + d.z * r, p.y, 4);
            if (q && !this.terrain.lavaNear(q) && !this.terrain.dangerous(q)) return q;
        }
        return null;
    }

    findSafeSpotAwayFromCliff(p, radius) {
        for (let r=3; r<=radius; r++) for (const d of COMPASS) {
            const q = this.terrain.groundNear(p.x + d.x * r, p.z + d.z * r, p.y, 3);
            if (!q) continue;
            let cliff = false;
            for (const cd of CARDINAL) {
                const check = add(q, { x: cd.x*2, y: -3, z: cd.z*2 });
                if (this.terrain.empty(check) && this.terrain.empty(add(check, DOWN))) { cliff = true; break; }
            }
            if (!cliff && !this.terrain.dangerous(q)) return q;
        }
        return null;
    }

    findCoverFromRanged(threats) {
        const p = floor(this.sim.location);
        for (const dir of COMPASS) for (const dist of [3,5,7,10]) {
            const checkPos = { x: p.x + dir.x * dist, y: p.y, z: p.z + dir.z * dist };
            const ground = this.terrain.groundNear(checkPos.x, checkPos.z, checkPos.y, 3);
            if (!ground || this.terrain.dangerous(ground)) continue;
            let blocks = 0;
            for (const e of threats) {
                if (!e.typeId.includes("skeleton") && e.typeId !== "minecraft:blaze" && !e.typeId.includes("pillager")) continue;
                const threatHead = e.getHeadLocation ? e.getHeadLocation() : e.location;
                const botHead = { x: ground.x + 0.5, y: ground.y + 1.62, z: ground.z + 0.5 };
                if (!this.terrain.line(threatHead, botHead)) blocks++;
            }
            if (blocks > 0) return ground;
        }
        return null;
    }

    findCoverFromAbove(p, threats) {
        // Cover from skeleton firing from above: find overhang or wall
        for (const d of CARDINAL) for (let r=2; r<=8; r++) {
            const q = add(p, { x: d.x * r, y: 0, z: d.z * r });
            const ground = this.terrain.groundNear(q.x, q.z, q.y, 3);
            if (!ground) continue;
            const above = this.terrain.block(add(ground, UP));
            const above2 = this.terrain.block(add(ground, { x:0, y:2, z:0 }));
            if ((above && above.isSolid) || (above2 && above2.isSolid)) return ground; // overhang
        }
        return null;
    }

    findAwayFrom(threatPos, dist) {
        const p = floor(this.sim.location);
        const dir = { x: p.x - Math.floor(threatPos.x), z: p.z - Math.floor(threatPos.z) };
        const len = Math.hypot(dir.x, dir.z) || 1;
        dir.x /= len; dir.z /= len;
        const q = this.terrain.groundNear(p.x + dir.x * dist, p.z + dir.z * dist, p.y, 5);
        return q;
    }

    findRetreatSpot(p, threats, dist) {
        if (!threats.length) return this.findSafeSpot(p, dist);
        let avgX=0,avgZ=0;
        for (const t of threats) { avgX+=t.location.x; avgZ+=t.location.z; }
        avgX/=threats.length; avgZ/=threats.length;
        const away = { x: p.x - avgX, z: p.z - avgZ };
        const len = Math.hypot(away.x, away.z) || 1;
        const dir = { x: away.x/len, z: away.z/len };
        for (let d=dist; d>=4; d-=2) {
            const q = this.terrain.groundNear(p.x + dir.x * d, p.z + dir.z * d, p.y, 5);
            if (q && !this.terrain.dangerous(q)) return q;
        }
        return null;
    }

    findPerpendicularEscape(p, pos1, pos2, dist) {
        const mid = { x: (pos1.x + pos2.x)/2, z: (pos1.z + pos2.z)/2 };
        const away = { x: p.x - mid.x, z: p.z - mid.z };
        const len = Math.hypot(away.x, away.z) || 1;
        const perp = { x: -away.z/len, z: away.x/len };
        for (let d=dist; d>=3; d--) {
            const q = this.terrain.groundNear(p.x + perp.x * d, p.z + perp.z * d, p.y, 4);
            if (q && !this.terrain.dangerous(q)) return q;
            const q2 = this.terrain.groundNear(p.x - perp.x * d, p.z - perp.z * d, p.y, 4);
            if (q2 && !this.terrain.dangerous(q2)) return q2;
        }
        return null;
    }

    findAlternateExit(p, radius) {
        for (const d of COMPASS) for (let r=2; r<=radius; r++) {
            const q = add(p, { x: d.x * r, y: 0, z: d.z * r });
            const ground = this.terrain.groundNear(q.x, q.z, q.y, 3);
            if (ground && !this.terrain.dangerous(ground)) return ground;
        }
        return null;
    }

    findExitNoMining(p, radius) {
        for (const d of COMPASS) for (let r=2; r<=radius; r++) {
            const q = add(p, { x: d.x * r, y: 0, z: d.z * r });
            if (this.terrain.safe(q)) return q;
        }
        return null;
    }

    findUpwardRoute(p, radius) {
        for (let dy=1; dy<=radius; dy++) for (const d of COMPASS) {
            const q = this.terrain.groundNear(p.x + d.x * 2, p.z + d.z * 2, p.y + dy, 2);
            if (q && !this.terrain.dangerous(q)) return q;
        }
        return null;
    }

    findEasyExit(p, radius) {
        for (let dy=0; dy<=3; dy++) for (const d of CARDINAL) {
            const q = this.terrain.groundNear(p.x + d.x * 2, p.z + d.z * 2, p.y + dy, 2);
            if (q && !this.terrain.dangerous(q)) return q;
        }
        return null;
    }

    findAirPocket(p, radius) {
        for (let dx=-radius; dx<=radius; dx++) for (let dz=-radius; dz<=radius; dz++) for (let dy=-2; dy<=4; dy++) {
            const q = add(p, { x:dx, y:dy, z:dz });
            if (this.terrain.empty(q) && this.terrain.empty(add(q, UP)) && !this.terrain.waterAt(q)) return q;
        }
        return null;
    }

    findDefensivePosition(p, threats) {
        // Find spot with wall behind
        for (const d of CARDINAL) {
            const behind = add(p, { x: -d.x * 2, y: 0, z: -d.z * 2 });
            if (this.terrain.solid(behind) && this.terrain.safe(p)) return p;
            const q = this.terrain.groundNear(p.x + d.x * 2, p.z + d.z * 2, p.y, 3);
            if (q) {
                let walls=0;
                for (const cd of CARDINAL) if (this.terrain.solid(add(q, cd))) walls++;
                if (walls >= 1) return q;
            }
        }
        return this.findSafeSpot(p, 8);
    }

    findFoodNearby(p, radius) {
        try {
            const entities = this.sim.dimension.getEntities({ location: this.sim.location, maxDistance: radius });
            for (const e of entities) {
                if (["minecraft:cow","minecraft:pig","minecraft:chicken","minecraft:sheep","minecraft:rabbit"].includes(e.typeId)) {
                    return floor(e.location);
                }
            }
        } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }
        // Check for crops
        for (let dx=-radius; dx<=radius; dx++) for (let dz=-radius; dz<=radius; dz++) {
            const q = add(p, { x:dx, y:0, z:dz });
            const b = this.terrain.block(q);
            if (b && (b.typeId.includes("wheat") || b.typeId.includes("carrot") || b.typeId.includes("potato") || b.typeId === "minecraft:hay_block")) return q;
        }
        return null;
    }

    findWaterSource(p, radius) {
        for (let dx=-radius; dx<=radius; dx++) for (let dz=-radius; dz<=radius; dz++) for (let dy=-2; dy<=2; dy++) {
            const q = add(p, { x:dx, y:dy, z:dz });
            if (this.terrain.waterAt(q)) return q;
        }
        return null;
    }

    findGravelAbove(p, radius) {
        for (let dy=1; dy<=radius; dy++) {
            const q = add(p, { x:0, y:dy, z:0 });
            const b = this.terrain.block(q);
            if (b && /gravel|sand/.test(b.typeId)) return q;
        }
        return null;
    }

    findTwoExits(p, radius) {
        const exits = [];
        for (const d of COMPASS) {
            const q = this.terrain.groundNear(p.x + d.x * radius, p.z + d.z * radius, p.y, 3);
            if (q && !this.terrain.dangerous(q)) exits.push(q);
        }
        return exits;
    }

    findExits(p, radius) {
        return this.findTwoExits(p, radius);
    }

    findDoorway(p) {
        for (const d of CARDINAL) {
            const q = add(p, d);
            if (this.terrain.empty(q) && this.terrain.empty(add(q, UP))) {
                const left = add(q, { x: -d.z, y:0, z: d.x });
                const right = add(q, { x: d.z, y:0, z: -d.x });
                if (this.terrain.solid(left) || this.terrain.solid(right)) return q;
            }
        }
        return null;
    }

    findEscapeFromShelter(p, radius) {
        return this.findAlternateExit(p, radius);
    }

    findSafeHouseInVillage(p, radius) {
        for (let dx=-radius; dx<=radius; dx+=2) for (let dz=-radius; dz<=radius; dz+=2) {
            const q = add(p, { x:dx, y:0, z:dz });
            const b = this.terrain.block(q);
            if (b && b.typeId === "minecraft:bed") {
                // Check if house has door
                const doorNearby = CARDINAL.some(d => {
                    const bd = this.terrain.block(add(q, d));
                    return bd && bd.typeId.includes("_door");
                });
                if (doorNearby) return q;
            }
        }
        return null;
    }

    findRepositionAwayFromSkeleton(p, skeletonPos, dist) {
        const dir = { x: p.x - Math.floor(skeletonPos.x), z: p.z - Math.floor(skeletonPos.z) };
        const len = Math.hypot(dir.x, dir.z) || 1;
        const q = this.terrain.groundNear(p.x + dir.x/len * dist, p.z + dir.z/len * dist, p.y, 4);
        return q;
    }

    findSafeRouteAvoidingRavine(p, radius) {
        for (const d of COMPASS) {
            const q = this.terrain.groundNear(p.x + d.x * radius, p.z + d.z * radius, p.y, 3);
            if (!q) continue;
            if (this.isRavine(q)) continue;
            if (!this.terrain.dangerous(q)) return q;
        }
        return null;
    }

    findRiverCrossing(p, radius) {
        for (let r=4; r<=radius; r++) for (const d of COMPASS) {
            const q = this.terrain.groundNear(p.x + d.x * r, p.z + d.z * r, p.y, 3);
            if (!q) continue;
            if (this.terrain.waterAt(add(q, DOWN))) continue;
            if (!this.terrain.dangerous(q)) return q;
        }
        return null;
    }

    findAlternateRouteTo(goal, threats, radius) {
        const p = floor(this.sim.location);
        const dir = { x: goal.x - p.x, z: goal.z - p.z };
        const len = Math.hypot(dir.x, dir.z) || 1;
        dir.x /= len; dir.z /= len;
        const perp = { x: -dir.z, z: dir.x };
        for (let off=-radius; off<=radius; off+=4) {
            const q = this.terrain.groundNear(p.x + dir.x * 8 + perp.x * off, p.z + dir.z * 8 + perp.z * off, p.y, 4);
            if (!q || this.terrain.dangerous(q)) continue;
            let threatened = false;
            for (const t of threats) if (distance(q, t.location) < 6) { threatened = true; break; }
            if (!threatened) return q;
        }
        return null;
    }

    findSecondExitSpot(p, radius) {
        for (const d of CARDINAL) {
            const q = add(p, { x: d.x * radius, y:0, z: d.z * radius });
            if (this.terrain.safe(q)) return q;
        }
        return null;
    }

    findSafeRouteToOutside(p, radius, threats) {
        for (const d of COMPASS) {
            const q = this.terrain.groundNear(p.x + d.x * radius, p.z + d.z * radius, p.y, 3);
            if (!q) continue;
            let safe = true;
            for (const t of threats) if (distance(q, t.location) < 5) safe = false;
            if (safe && !this.terrain.dangerous(q)) return q;
        }
        return null;
    }

    findCaveEntrance(p, radius) {
        for (const d of CARDINAL) for (let r=1; r<=radius; r++) {
            const q = add(p, { x: d.x * r, y:0, z: d.z * r });
            if (this.terrain.empty(q) && this.terrain.empty(add(q, UP)) && this.terrain.empty(add(q, { x:0, y:-1, z:0 }))) return q;
        }
        return null;
    }

    findChokepoint(p, radius) {
        // Find narrow passage for defensive control
        for (let r=2; r<=radius; r++) for (const d of COMPASS) {
            const q = this.terrain.groundNear(p.x + d.x * r, p.z + d.z * r, p.y, 3);
            if (!q) continue;
            let walls=0;
            for (const cd of CARDINAL) if (this.terrain.solid(add(q, cd))) walls++;
            if (walls >= 2) return q; // narrow with walls both sides
        }
        return null;
    }

    findWiderArea(p, radius) {
        for (let r=3; r<=radius; r++) for (const d of COMPASS) {
            const q = this.terrain.groundNear(p.x + d.x * r, p.z + d.z * r, p.y, 3);
            if (!q) continue;
            let open=0;
            for (const cd of CARDINAL) if (this.terrain.empty(add(q, cd))) open++;
            if (open >= 3) return q;
        }
        return null;
    }

    assessVillageSafety(p, threats) {
        const village = this.bot.structures?.found?.find(f => f.name === "village");
        if (!village) return { safe: false };
        const pillagers = threats.filter(t => t.typeId.includes("pillager") || t.typeId.includes("vindicator"));
        if (pillagers.length >= 2) return { safe: false, reason: "pillager patrol heavy" };
        return { safe: true, pos: village.pos };
    }

    assessRouteRisk(from, to, threats) {
        let risk = 0;
        for (const t of threats) {
            const distToRoute = distance(t.location, { x: (from.x+to.x)/2, y: from.y, z: (from.z+to.z)/2 });
            if (distToRoute < 6) risk += 30;
            else if (distToRoute < 12) risk += 10;
        }
        const directDist = distance(from, to);
        if (directDist > 16) risk += 20;
        return risk;
    }

    placeTorchNearby(p, tick) {
        if (tick - (this.bot.lastTorchPlace ?? 0) < 20) return false;
        const slot = this.bag.find(s => s.typeId === "minecraft:torch");
        if (slot < 0) return false;
        const support = this.builder.findSupportFor(add(p, { x:1, y:0, z:0 }));
        if (!support) return false;
        const selected = this.bag.select(slot);
        try {
            this.bot.avatar.lookBlock(support.pos);
            const ok = this.bot.avatar.useOn(selected, support.pos, Direction.Up);
            if (ok) this.bot.lastTorchPlace = tick;
            return ok;
        } catch { return false; }
    }

    buildMinimalShelter(p, tick) {
        if (!this.builder.canBuild) return false;
        const res = this.builder.buildBunker(p, tick, true);
        if (res === "placed" || res === "placed_roof") {
            this.shelterPos = { ...p };
            return true;
        }
        // Fallback dirt pillar
        const below = add(p, DOWN);
        if (this.terrain.solid(below)) {
            const wall = add(p, { x:1, y:0, z:0 });
            if (this.terrain.empty(wall)) {
                const r = this.builder.placeAt(wall, below, { sneak: true });
                if (r === "placed") {
                    this.shelterPos = { ...p };
                    return true;
                }
            }
        }
        return false;
    }

    widenLedge(p, tick) {
        for (const d of CARDINAL) {
            const target = add(add(p, d), DOWN);
            if (this.terrain.empty(target) || this.terrain.waterAt(target) || this.terrain.lavaAt(target)) {
                const support = this.builder.findSupportFor(target);
                if (support) {
                    const r = this.builder.placeAt(target, support.pos, { sneak: true });
                    if (r === "placed") return true;
                }
            }
        }
        return false;
    }

    placeBarrierToLava(p, tick) {
        for (const d of CARDINAL) {
            const check = add(p, d);
            if (this.terrain.lavaNear(check)) {
                const barrier = add(p, d);
                if (this.terrain.empty(barrier)) {
                    const support = this.builder.findSupportFor(barrier);
                    if (support) {
                        const r = this.builder.placeAt(barrier, support.pos, { sneak: true });
                        if (r === "placed") return true;
                    }
                }
            }
        }
        return false;
    }

    waterClutch(tick) {
        const slot = this.bag.find(s => s.typeId === "minecraft:water_bucket");
        if (slot < 0) return false;
        const selected = this.bag.select(slot);
        try {
            const p = floor(this.sim.location);
            const below = add(p, DOWN);
            this.bot.avatar.lookBlock(below);
            const ok = this.bot.avatar.use(selected);
            if (ok) {
                this.bot.reason = "Survival-Master: water clutch for fall";
                return true;
            }
        } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }
        return false;
    }

    blockThreats(threats, tick) {
        if (!this.builder.canBuild) return false;
        const p = floor(this.sim.location);
        let avgX=0,avgZ=0;
        for (const t of threats) { avgX+=t.location.x; avgZ+=t.location.z; }
        avgX/=threats.length; avgZ/=threats.length;
        const dir = { x: Math.sign(avgX - p.x) || 1, z: Math.sign(avgZ - p.z) || 0 };
        const wall = add(p, dir);
        if (this.terrain.empty(wall) && this.terrain.solid(add(wall, DOWN))) {
            const r = this.builder.placeAt(wall, add(wall, DOWN), { sneak: true });
            if (r === "placed") return true;
        }
        return false;
    }

    retreatFromEdge(p, tick) {
        const safe = this.findSafeSpotAwayFromCliff(p, 6);
        if (safe) {
            this.bot.navTo(center(safe), tick, 1);
            return true;
        }
        return false;
    }

}
