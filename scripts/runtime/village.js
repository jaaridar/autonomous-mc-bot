// One module now: runtime/village.js + runtime/golem.js (see docs/ARCHITECTURE.md).
import { CARDINAL, DOWN, add, center, distance, floor } from "../core/math.js";
import { GOLEM_STATS, chooseBestGolemStrategy, evaluateGolemFight, evaluateVillage, evaluateVillageVsNetherRoute, shouldCraftBedIndependently, shouldDisengageDuringFight } from "../core/village.js";
import { timeOfDay, weaponTierLoose } from "./world.js";

// ---------------------------------------------------------------- village.js

/**
 * Village Runtime - village-first strategy for Nether speedrun.
 * As soon as minimum equipment acquired, evaluate whether nearby village offers better route.
 * Prioritize villages when provide food, beds, hay bales, crafting resources, loot, speedrun advantages.
 * Inspect food sources best combo accessibility saturation hunger restoration time efficiency.
 * Loot useful chests gather food without wasting time low-value.
 * Identify beds use to skip night when useful safe.
 * If no suitable village or bed, obtain wool wood craft bed independently when efficient.
 * Hunt sheep for wool when necessary, understand wool blocks planks required.
 * Do not assume village always best: compare distance risks against immediate Nether-entry route.
 */



export class VillageDirector {
    constructor(bot) {
        this.bot = bot;
        this.sim = bot.sim;
        this.bag = bot.bag;
        this.terrain = bot.terrain;
        this.host = bot.host;
        this.memory = bot.memory;

        this.lastScan = 0;
        this.knownVillages = [];
        this.currentVillage = null;
        this.foodOptions = [];
        this.bedPos = null;
        this.lastBedUse = 0;
        this.villageTrips = 0;
    }

    reset(tick) {
        this.currentVillage = null;
        this.foodOptions = [];
        this.bedPos = null;
    }

    tick(tick) {
        if (tick - this.lastScan < 60) return false;
        this.lastScan = tick;

        const context = this.buildContext(tick);
        const village = this.findNearestVillage(128);

        if (!village) {
            // No village, check if should craft bed independently
            const bedCraft = shouldCraftBedIndependently(context);
            if (bedCraft.should && bedCraft.priority >= 70) {
                this.bot.reason = `Village: ${bedCraft.reason} - need 3 wool same color + 3 planks`;
                if (bedCraft.sheep) {
                    const sheep = this.findSheepNearby(32);
                    if (sheep) {
                        const r = this.bot.navTo(center(sheep.pos), tick, 2);
                        if (r !== "failed") return true;
                    }
                }
                if ((context.woolCount ?? 0) >= 3 && (context.woodCount ?? 0) >= 3) {
                    try { this.bot.obtain("minecraft:white_bed", 1, tick); return true; } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }
                }
            }
            return false;
        }

        // Evaluate village
        const villageEval = evaluateVillage(village, context);
        if (!villageEval) return false;

        // Evaluate vs Nether route
        const netherRoute = this.bot.nether?.currentRoute ?? null;
        const comparison = evaluateVillageVsNetherRoute(villageEval, netherRoute, context);

        // ROBUST: Village should be priority when food low, even without minimum equipment - user reported food search fails
        const foodLow = (context.foodAmount ?? 0) < 3 || context.hasFood === false;
        const hungerLow = (this.bot.sim.getComponent("minecraft:player.hunger")?.currentValue ?? 20) <= 14;
        if (foodLow || hungerLow) {
            // Force village as priority when food low
            this.currentVillage = village;
            this.bot.reason = `Village: FOOD LOW ${context.foodAmount} hunger low - village at ${village.pos.x},${village.pos.y},${village.pos.z} distance ${village.distance.toFixed(0)} PRIORITY for food ${villageEval.benefits.join(",")}`;
            return this.executeVillageRun(village, villageEval, tick, context);
        }

        if (comparison.decision === "village" && villageEval.shouldGo) {
            this.currentVillage = village;
            this.bot.reason = `Village: ${comparison.reason} - village at ${village.pos.x},${village.pos.y},${village.pos.z} distance ${village.distance.toFixed(0)} benefits ${villageEval.benefits.join(",")} - ${villageEval.foodEfficiency}`;

            // If have minimum equipment, go to village - ROBUST: also go even without min equipment if village is close (<64) for food
            if (context.hasMinimumEquipment || village.distance < 64) {
                return this.executeVillageRun(village, villageEval, tick, context);
            }
        }

        // Even if not going to village as main, if close and has food/beds, loot quickly - ANY STRUCTURE priority
        if (village.distance < 48 && villageEval.score > 30) {
            // Try loot target first
            const loot = this.bot.structures?.getLootTarget();
            if (loot && distance(loot.pos, this.sim.location) < 32) {
                this.bot.reason = `Village: close village ${village.distance.toFixed(0)} blocks, quick loot food/beds - any structure priority`;
                const r = this.bot.navTo(center(loot.pos), tick, 2);
                if (r !== "failed") return true;
            }
            // Direct village navigation if no loot target
            if (village.distance > 8) {
                const r = this.bot.navTo(center(village.pos), tick, 4);
                if (r !== "failed") {
                    this.bot.reason = `Village: close village ${village.distance.toFixed(0)} blocks no loot target, direct nav for food - priority`;
                    return true;
                }
            }
        }

        return false;
    }

    buildContext(tick) {
        const counts = this.bag.counts();
        const hasWood = Object.entries(counts).filter(([k])=>k.endsWith("_log")||k.endsWith("_wood")||k.includes("_stem")).reduce((a,[,v])=>a+v,0) >= 3;
        const hasStone = (counts["minecraft:cobblestone"] ?? 0) >= 8;
        const hasFood = Object.keys(counts).some(k => k.includes("bread") || k.includes("cooked_") || k.includes("potato") || k.includes("carrot"));
        const foodAmount = Object.entries(counts).filter(([k]) => k.includes("bread") || k.includes("cooked_") || k.includes("potato") || k.includes("carrot")).reduce((sum, [,v]) => sum + v, 0);
        const hasBed = Object.keys(counts).some(k => k.endsWith("_bed"));
        const hasWool = Object.keys(counts).some(k => k.includes("_wool"));
        const woolCount = Object.entries(counts).filter(([k]) => k.includes("_wool")).reduce((sum, [,v]) => sum + v, 0);
        const woodCount = Object.entries(counts).filter(([k])=>k.endsWith("_log")||k.endsWith("_planks")||k.includes("_stem")).reduce((a,[,v])=>a+v,0);
        const hasIron = (counts["minecraft:iron_ingot"] ?? 0) >= 1;
        const hasBucket = (counts["minecraft:bucket"] ?? 0) > 0 || (counts["minecraft:water_bucket"] ?? 0) > 0;
        const hasFurnace = (counts["minecraft:furnace"] ?? 0) > 0;
        const hasFuel = (counts["minecraft:coal"] ?? 0) > 0 || (counts["minecraft:charcoal"] ?? 0) > 0;

        const threats = this.bot.terrain.threatInfo(this.sim, this.bot.owner());
        const phase = this.bot.speedrun?.phase ?? 0;

        // Cache sheep lookup to avoid double entity scan
        let sheepNearby = null;
        try { sheepNearby = this.findSheepNearby(32); } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }
        return {
            hasWood,
            hasStone,
            hasFood,
            foodAmount,
            hasBed,
            hasWool,
            woolCount,
            woodCount,
            hasIron,
            hasBucket,
            hasWaterBucket: (counts["minecraft:water_bucket"] ?? 0) > 0,
            hasFurnace,
            hasFuel,
            hasMinimumEquipment: hasWood && (hasFood || foodAmount >= 3),
            phase,
            time: timeOfDay(this.sim),
            distanceToSheep: sheepNearby ? distance(sheepNearby.pos, this.sim.location) : 100,
            sheepCount: sheepNearby ? 1 : 0,
            hasVillage: null, // avoid recursive expensive scan in buildContext
            netherRoute: this.bot.nether?.currentRoute,
            health: this.sim.getComponent("minecraft:health")?.currentValue ?? 20,
            equipment: { weaponTier: weaponTierLoose(this.bag), armorValue: 0 },
            inventory: counts,
        };
    }

    findNearestVillage(radius) {
        // Fast path: check awareness and structures first (bounded, cheap)
        try {
            const awareVillage = this.bot.awareness?.villageSpots?.[0];
            if (awareVillage) {
                const dist = distance(awareVillage, this.sim.location);
                if (dist <= radius) {
                    return {
                        pos: awareVillage,
                        distance: dist,
                        hasFood: true,
                        hasBeds: true,
                        hasHay: true,
                        hasCrafting: true,
                        hasChest: true,
                        hasGolem: false,
                        hasWool: false,
                        dangerLevel: { hostileCount: 0 },
                        villageScore: 5,
                    };
                }
            }
            const structVillage = this.bot.structures?.found?.find(f => f.name === "village");
            if (structVillage) {
                const dist = distance(structVillage.pos, this.sim.location);
                if (dist <= radius) {
                    return {
                        pos: structVillage.pos,
                        distance: dist,
                        hasFood: true,
                        hasBeds: true,
                        hasHay: true,
                        hasCrafting: true,
                        hasChest: true,
                        hasGolem: false,
                        hasWool: false,
                        dangerLevel: { hostileCount: 0 },
                        villageScore: 5,
                    };
                }
            }
        } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }

        try {
            // Try /locate if commands available
            const located = this.tryLocateVillage();
            if (located) return located;
        } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }

        // Environmental detection: find village via blocks and entities - BUDGETED (max 800 block checks per call)
        const p = floor(this.sim.location);
        const villageBlocks = ["minecraft:hay_block","minecraft:bell","minecraft:farmland","minecraft:composter","minecraft:blast_furnace","minecraft:smoker","minecraft:bed"];
        let villageScore = 0;
        let centerPos = null;
        let checks = 0;
        const budget = 800;

        // Scan for village blocks - bounded
        for (let dx = -radius; dx <= radius && checks < budget; dx += 8) {
            for (let dz = -radius; dz <= radius && checks < budget; dz += 8) {
                if (dx*dx + dz*dz > radius*radius) continue;
                for (let dy = -2; dy <= 2 && checks < budget; dy++) {
                    const q = add(p, { x: dx, y: dy, z: dz });
                    checks++;
                    const b = this.terrain.block(q);
                    if (!b) continue;
                    if (villageBlocks.includes(b.typeId)) {
                        villageScore++;
                        if (!centerPos) centerPos = { ...q };
                        if (villageScore >= 4) break;
                    }
                }
                if (villageScore >= 4) break;
            }
            if (villageScore >= 4) break;
        }

        // Scan for villagers - limited radius 48 for performance, not full 128
        try {
            const scanRadius = Math.min(radius, 48);
            const entities = this.sim.dimension.getEntities({ location: this.sim.location, maxDistance: scanRadius });
            let villagerCount = 0;
            let villagerPos = null;
            for (const e of entities) {
                if (e.typeId === "minecraft:villager" || e.typeId === "minecraft:villager_v2" || e.typeId === "minecraft:iron_golem" || e.typeId === "minecraft:cat") {
                    villagerCount++;
                    if (!villagerPos) villagerPos = floor(e.location);
                }
            }
            if (villagerCount >= 2 || villageScore >= 3) {
                const pos = villagerPos ?? centerPos ?? p;
                const dist = distance(pos, this.sim.location);
                return {
                    pos,
                    distance: dist,
                    hasFood: villageScore >= 2,
                    hasBeds: true,
                    hasHay: true,
                    hasCrafting: true,
                    hasChest: villageScore >= 1,
                    hasGolem: entities.some(e => e.typeId === "minecraft:iron_golem"),
                    hasWool: false,
                    dangerLevel: { hostileCount: 0 },
                    villagerCount,
                    villageScore,
                    chestHasObsidian: false,
                    chestHasIron: false,
                };
            }
        } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }

        if (villageScore >= 4 && centerPos) {
            const dist = distance(centerPos, this.sim.location);
            return {
                pos: centerPos,
                distance: dist,
                hasFood: true,
                hasBeds: true,
                hasHay: true,
                hasCrafting: true,
                hasChest: true,
                hasGolem: false,
                hasWool: false,
                dangerLevel: { hostileCount: 0 },
                villageScore,
            };
        }

        return null;
    }

    tryLocateVillage() {
        // The /locate result text is not exposed to scripts, so parsing it never
        // worked - skip the command entirely (it ran on every village scan).
        return null;
    }

    executeVillageRun(village, villageEval, tick, context) {
        const dist = village.distance;

        if (dist > 8) {
            const r = this.bot.navTo(center(village.pos), tick, 4);
            if (r !== "failed") {
                this.bot.reason = `Village: going to village at ${village.pos.x},${village.pos.y},${village.pos.z} distance ${dist.toFixed(0)} - food, beds, hay bales, loot`;
                return true;
            }
        }

        // At village, prioritize food, beds, hay, chests
        // 1. Food: hay bales best efficiency
        if (village.hasHay && (context.foodAmount < 8)) {
            const hayPos = this.findHayBaleNearby(village.pos, 16);
            if (hayPos) {
                const r = this.bot.navTo(center(hayPos), tick, 2);
                if (r !== "failed") {
                    this.bot.reason = `Village: hay bale at ${hayPos.x},${hayPos.y},${hayPos.z} - 9 wheat = 3 bread, best food efficiency`;
                    return true;
                }
            }
        }

        // 2. Loot chests
        const lootTarget = this.bot.structures?.getLootTarget();
        if (lootTarget && distance(lootTarget.pos, this.sim.location) < 16) {
            const r = this.bot.navTo(center(lootTarget.pos), tick, 2);
            if (r !== "failed") {
                this.bot.reason = `Village: looting chest at ${lootTarget.pos.x},${lootTarget.pos.y},${lootTarget.pos.z} useful loot without wasting time low-value`;
                return true;
            }
        }

        // 3. Beds: identify and use to skip night when useful safe
        if (village.hasBeds && (context.time === "sunset" || context.time === "night")) {
            const bedPos = this.findBedNearby(village.pos, 16);
            if (bedPos) {
                const r = this.bot.navTo(center(bedPos), tick, 2);
                if (r !== "failed") {
                    this.bot.reason = `Village: bed at ${bedPos.x},${bedPos.y},${bedPos.z} - use to skip night when useful safe`;
                    // Try to use bed
                    if (distance(bedPos, this.sim.location) < 3 && tick - this.lastBedUse > 100) {
                        try {
                            this.sim.lookAtBlock(this.bot.host.relative(center(bedPos)));
                            this.sim.useItemInSlotOnBlock(this.bag.select(0), this.bot.host.relative(center(bedPos)), 1);
                            this.lastBedUse = tick;
                            this.bedPos = bedPos;
                        } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }
                    }
                    return true;
                }
            }
        }

        // 4. Crafting resources
        if (village.hasCrafting) {
            // Use village crafting table/furnace
            this.bot.reason = "Village: using village crafting table, furnace, blast furnace";
            // For now, just record
        }

        this.villageTrips++;
        return false;
    }

    findHayBaleNearby(villagePos, radius) {
        for (let dx = -radius; dx <= radius; dx++) for (let dy = -2; dy <= 4; dy++) for (let dz = -radius; dz <= radius; dz++) {
            const p = add(villagePos, { x: dx, y: dy, z: dz });
            const b = this.terrain.block(p);
            if (b && b.typeId === "minecraft:hay_block") return p;
        }
        return null;
    }

    findBedNearby(villagePos, radius) {
        for (let dx = -radius; dx <= radius; dx++) for (let dy = -1; dy <= 2; dy++) for (let dz = -radius; dz <= radius; dz++) {
            const p = add(villagePos, { x: dx, y: dy, z: dz });
            const b = this.terrain.block(p);
            if (b && b.typeId.includes("_bed")) return p;
        }
        return null;
    }

    findSheepNearby(radius) {
        try {
            const entities = this.sim.dimension.getEntities({ location: this.sim.location, maxDistance: radius });
            for (const e of entities) {
                if (e.typeId === "minecraft:sheep") {
                    return { pos: floor(e.location), entity: e, distance: distance(e.location, this.sim.location) };
                }
            }
        } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }
        return null;
    }

    countSheepNearby(radius) {
        try {
            const entities = this.sim.dimension.getEntities({ location: this.sim.location, maxDistance: radius });
            return entities.filter(e => e.typeId === "minecraft:sheep").length;
        } catch { return 0; }
    }


}

// ---------------------------------------------------------------- golem.js

/**
 * Iron Golem Combat & Risk Management - runtime.
 * Recognize golem and evaluate whether fighting worthwhile based on iron, equipment, health, terrain, time.
 * Only attempt when benefit justifies risk and reliable combat plan.
 * Understand attack range, movement, LOS, knockback, ability to reach elevated positions.
 * Evaluate strategies: protected elevated position or terrain separation.
 * Avoid fall damage, unexpected block access, other hostile mobs, environmental hazards during fight.
 * Reassess health positioning continuously and disengage if unsafe.
 * Collect iron drops efficiently and prioritize bucket.
 * Never mandatory if safer faster route available.
 */


export class GolemDirector {
    constructor(bot) {
        this.bot = bot;
        this.sim = bot.sim;
        this.bag = bot.bag;
        this.terrain = bot.terrain;
        this.host = bot.host;
        this.builder = bot.builder;
        this.combat = bot.combat;

        this.targetGolem = null;
        this.fightStart = 0;
        this.pillarPos = null;
        this.fightStage = "idle"; // idle, pillaring, fighting, collecting, disengaged
        this.lastHealthCheck = 0;
        this.lastScan = 0;
        this.hits = 0;
        this.lastHit = 0;
    }

    reset() {
        this.targetGolem = null;
        this.fightStart = 0;
        this.pillarPos = null;
        this.fightStage = "idle";
        this.hits = 0;
    }

    tick(tick) {
        if (!this.bot.settings.defend) return false;
        // ROBUST QUICK: only scan every 20 ticks unless in active fight
        if (this.fightStage === "idle" && tick - this.lastScan < 20) return false;
        this.lastScan = tick;

        // Find golem nearby
        const golem = this.findGolemNearby(24);
        if (!golem) {
            if (this.fightStage !== "idle") this.reset();
            return false;
        }

        const context = this.buildContext(golem, tick);
        const evaluation = evaluateGolemFight(context);

        // Only attempt when benefit justifies risk and reliable combat plan
        if (!evaluation.shouldFight) {
            if (this.fightStage !== "idle") {
                this.bot.reason = `Golem: ${evaluation.reasons} - disengaging, ${evaluation.alternative}`;
                this.reset();
            }
            return false;
        }

        // Never mandatory if safer faster route available
        if (evaluation.alternative && context.saferFasterRouteAvailable) {
            this.bot.reason = `Golem: safer faster route available - ${evaluation.alternative}, skipping golem`;
            return false;
        }

        this.targetGolem = golem;

        // Reassess health positioning continuously
        if (tick - this.lastHealthCheck > 20) {
            this.lastHealthCheck = tick;
            const disengageCheck = shouldDisengageDuringFight({
                health: context.health,
                golemHealth: golem.health,
                distanceToGolem: distance(golem.location, this.sim.location),
                hasBlocks: context.hasBlocks,
                otherHostileCount: context.otherHostileCount,
                fallRisk: this.isFallRisk(),
                golemReach: GOLEM_STATS.attackRange
            });

            if (disengageCheck.disengage) {
                this.bot.reason = `Golem: disengaging during fight - ${disengageCheck.reason}`;
                this.fightStage = "disengaged";
                const retreat = this.findRetreatSpot(floor(this.sim.location), 12);
                if (retreat) {
                    this.bot.navTo(center(retreat), tick, 2);
                    return true;
                }
                this.reset();
                return false;
            }
        }

        return this.executeFight(golem, evaluation, tick, context);
    }

    buildContext(golem, tick) {
        const counts = this.bag.counts();
        const hasIron = (counts["minecraft:iron_ingot"] ?? 0) > 0;
        const ironAmount = counts["minecraft:iron_ingot"] ?? 0;
        const hasBucket = (counts["minecraft:bucket"] ?? 0) > 0 || (counts["minecraft:water_bucket"] ?? 0) > 0;
        const health = this.sim.getComponent("minecraft:health")?.currentValue ?? 20;
        const hasBlocks = this.builder?.canBuild ?? false;
        const blockCount = this.builder?.countBlocks() ?? 0;
        const hasWaterBucket = this.bag.find(s => s.typeId === "minecraft:water_bucket") >= 0;

        const p = floor(this.sim.location);
        const hasHill = this.hasHillNearby(p, 8);
        const hasDoorway = this.hasDoorwayNearby(p, 8);
        const flatArea = !hasHill && !hasDoorway;

        const threats = this.bot.terrain.threatInfo(this.sim, this.bot.owner());
        const otherHostileCount = threats.list.filter(e => e.id !== golem.id).length;

        const hasVillage = !!this.bot.structures?.found?.find(f => f.name === "village");
        const saferFasterRoute = this.hasSaferFasterRoute(counts);

        return {
            hasIron,
            ironAmount,
            hasBucket,
            health,
            maxHealth: 20,
            equipment: {
                weaponTier: weaponTierLoose(this.bag),
                armorValue: this.getArmorValue()
            },
            terrain: {
                hasHill,
                hasDoorway,
                flatArea
            },
            hasBlocks,
            blockCount,
            hasWaterBucket,
            otherHostileCount,
            hasVillage,
            time: timeOfDay(this.sim),
            saferFasterRouteAvailable: saferFasterRoute,
            hasFurnace: (counts["minecraft:furnace"] ?? 0) > 0
        };
    }

    executeFight(golem, evaluation, tick, context) {
        const strategy = evaluation.recommendedStrategy ?? chooseBestGolemStrategy(context);
        if (!strategy) {
            this.bot.reason = "Golem: no reliable combat plan, skipping";
            return false;
        }

        this.bot.reason = `Golem: fighting with strategy ${strategy.name} - ${strategy.description}, effectiveness ${strategy.effectiveness}, risk ${strategy.risk}, iron need ${evaluation.ironDeficit}, ${evaluation.reasons}`;

        switch (strategy.name) {
            case "pillar_3_high":
                return this.executePillarStrategy(golem, tick, context);
            case "elevated_platform":
                return this.executePlatformStrategy(golem, tick, context);
            case "terrain_hill":
                return this.executeHillStrategy(golem, tick, context);
            case "doorway_trap":
                return this.executeDoorwayTrap(golem, tick, context);
            case "water_bucket":
                return this.executeWaterBucketStrategy(golem, tick, context);
            default:
                return this.executePillarStrategy(golem, tick, context);
        }
    }

    executePillarStrategy(golem, tick, context) {
        const p = floor(this.sim.location);
        const dist = distance(golem.location, this.sim.location);

        if (this.fightStage === "idle") {
            this.fightStage = "pillaring";
            this.fightStart = tick;
            this.pillarPos = { ...p };
        }

        if (this.fightStage === "pillaring") {
            // Pillar 3 high
            if (p.y < this.pillarPos.y + 3) {
                const result = this.builder.pillar(tick);
                if (result === "placed" || result === "jumping") {
                    this.bot.reason = `Golem: pillaring 3 high - ${p.y - this.pillarPos.y}/3, golem cannot reach 3 high if built correctly`;
                    return true;
                }
                if (result === "no-block") {
                    this.bot.reason = "Golem: no blocks for pillar, aborting golem fight";
                    this.reset();
                    return false;
                }
            } else {
                this.fightStage = "fighting";
            }
        }

        if (this.fightStage === "fighting") {
            // Check if golem can reach elevated position
            if (dist < GOLEM_STATS.canReachHeight + 1) {
                // Too close, need higher or retreat
                if (p.y < this.pillarPos.y + 4) {
                    const result = this.builder.pillar(tick);
                    if (result === "placed" || result === "jumping") return true;
                }
            }

            // Attack golem from elevated position
            if (dist <= 4) {
                this.sim.lookAtEntity(golem);
                try { this.sim.attackEntity(golem); this.hits++; this.lastHit = tick; } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }
                this.bot.reason = `Golem: attacking from elevated position ${p.y - this.pillarPos.y} high, hits ${this.hits}, golem health ${golem.health ?? "unknown"}, avoid fall damage`;

                // Avoid fall damage: sneak
                this.sim.isSneaking = true;

                // Check for unexpected block access
                if (this.isGolemCanReach()) {
                    this.bot.reason = "Golem: golem can reach elevated position, pillar higher or retreat";
                    const result = this.builder.pillar(tick);
                    if (result === "placed" || result === "jumping") return true;
                }

                return true;
            } else {
                // Golem too far, need to lure closer but maintain separation
                this.sim.isSneaking = false;
                return false;
            }
        }

        return false;
    }

    executePlatformStrategy(golem, tick, context) {
        // Build 4x4 platform with walls
        const p = floor(this.sim.location);

        if (this.fightStage === "idle") {
            this.fightStage = "pillaring";
            this.fightStart = tick;
            this.pillarPos = { ...p };
        }

        if (this.fightStage === "pillaring") {
            // Pillar up 3, then build platform
            if (p.y < this.pillarPos.y + 3) {
                const result = this.builder.pillar(tick);
                if (result === "placed" || result === "jumping") return true;
            } else {
                // Build platform 4x4
                const platformBuilt = this.buildPlatform(p, tick);
                if (platformBuilt) {
                    this.fightStage = "fighting";
                    return true;
                }
            }
        }

        if (this.fightStage === "fighting") {
            return this.executePillarStrategy(golem, tick, context);
        }

        return false;
    }

    executeHillStrategy(golem, tick, context) {
        // Use existing hill to maintain separation
        const hillPos = this.findHillNearby(floor(this.sim.location), 8);
        if (!hillPos) return this.executePillarStrategy(golem, tick, context);

        const dist = distance(golem.location, this.sim.location);
        if (dist < 4) {
            // On hill, attack
            this.sim.lookAtEntity(golem);
            try { this.sim.attackEntity(golem); this.hits++; } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }
            this.bot.reason = `Golem: using hill at ${hillPos.x},${hillPos.y},${hillPos.z} for separation, attack range ${GOLEM_STATS.attackRange}, movement ${GOLEM_STATS.movementSpeed}, LOS, knockback`;
            return true;
        } else {
            const r = this.bot.navTo(center(hillPos), tick, 2);
            if (r !== "failed") {
                this.bot.reason = "Golem: navigating to hill for terrain separation";
                return true;
            }
        }

        return false;
    }

    executeDoorwayTrap(golem, tick, context) {
        // Use village doorway with blocks to trap golem
        const doorway = this.findDoorwayNearby(floor(this.sim.location), 8);
        if (!doorway) return this.executePillarStrategy(golem, tick, context);

        const dist = distance(golem.location, this.sim.location);
        if (dist < 3) {
            // Place blocks to trap
            if (context.hasBlocks) {
                const trapPos = add(doorway, { x: 0, y: 1, z: 0 });
                if (this.terrain.empty(trapPos)) {
                    const support = this.builder.findSupportFor(trapPos);
                    if (support) {
                        const res = this.builder.placeAt(trapPos, support.pos, { sneak: true });
                        if (res === "placed") {
                            this.bot.reason = "Golem: doorway trap - placing blocks to trap golem";
                            return true;
                        }
                    }
                }
            }
            // Attack
            this.sim.lookAtEntity(golem);
            try { this.sim.attackEntity(golem); this.hits++; } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }
            return true;
        } else {
            const r = this.bot.navTo(center(doorway), tick, 2);
            if (r !== "failed") {
                this.bot.reason = "Golem: navigating to doorway for trap strategy";
                return true;
            }
        }

        return false;
    }

    executeWaterBucketStrategy(golem, tick, context) {
        if (!context.hasWaterBucket) return this.executePillarStrategy(golem, tick, context);

        const dist = distance(golem.location, this.sim.location);
        if (dist < 5) {
            // Place water to slow golem
            const waterSlot = this.bag.find(s => s.typeId === "minecraft:water_bucket");
            if (waterSlot >= 0) {
                const selected = this.bag.select(waterSlot);
                try {
                    this.sim.lookAtBlock(this.host.relative(center(floor(golem.location))));
                    this.sim.useItemInSlot(selected);
                    this.bot.reason = "Golem: water bucket to slow golem and maintain distance";
                    return true;
                } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }
            }
            // Attack
            this.sim.lookAtEntity(golem);
            try { this.sim.attackEntity(golem); this.hits++; } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }
            return true;
        }

        return false;
    }

    findGolemNearby(radius) {
        try {
            const entities = this.sim.dimension.getEntities({ location: this.sim.location, maxDistance: radius });
            for (const e of entities) {
                if (e.typeId === "minecraft:iron_golem") {
                    return e;
                }
            }
        } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }
        return null;
    }

    hasHillNearby(p, radius) {
        for (let dx = -radius; dx <= radius; dx++) for (let dz = -radius; dz <= radius; dz++) {
            const q = add(p, { x: dx, y: 2, z: dz });
            if (this.terrain.solid(q)) return true;
        }
        return false;
    }

    findHillNearby(p, radius) {
        for (let r = 3; r <= radius; r++) for (const d of CARDINAL) {
            const q = add(p, { x: d.x * r, y: 2, z: d.z * r });
            if (this.terrain.solid(q)) {
                const ground = this.terrain.groundNear(q.x, q.z, q.y, 2);
                if (ground) return ground;
            }
        }
        return null;
    }

    hasDoorwayNearby(p, radius) {
        for (let dx = -radius; dx <= radius; dx++) for (let dz = -radius; dz <= radius; dz++) {
            const q = add(p, { x: dx, y: 0, z: dz });
            const b = this.terrain.block(q);
            if (b && b.typeId.includes("_door")) return true;
        }
        return false;
    }

    findDoorwayNearby(p, radius) {
        for (let dx = -radius; dx <= radius; dx++) for (let dz = -radius; dz <= radius; dz++) {
            const q = add(p, { x: dx, y: 0, z: dz });
            const b = this.terrain.block(q);
            if (b && b.typeId.includes("_door")) return q;
        }
        return null;
    }

    buildPlatform(p, tick) {
        // Build 4x4 platform around p
        let placed = 0;
        for (let dx = -1; dx <= 2; dx++) for (let dz = -1; dz <= 2; dz++) {
            if (dx === 0 && dz === 0) continue;
            const target = add(p, { x: dx, y: -1, z: dz });
            if (this.terrain.empty(target)) {
                const support = this.builder.findSupportFor(target);
                if (support) {
                    const res = this.builder.placeAt(target, support.pos, { sneak: true });
                    if (res === "placed") placed++;
                }
            }
        }
        return placed > 0;
    }

    isGolemCanReach() {
        if (!this.targetGolem) return false;
        const dist = distance(this.targetGolem.location, this.sim.location);
        return dist <= GOLEM_STATS.canReachHeight + 0.5;
    }

    isFallRisk() {
        const p = floor(this.sim.location);
        const below = add(p, DOWN);
        const below2 = add(below, DOWN);
        return !this.terrain.solid(below) && !this.terrain.solid(below2);
    }

    findRetreatSpot(p, radius) {
        for (let r = radius; r >= 4; r -= 2) for (const d of CARDINAL) {
            const q = this.terrain.groundNear(p.x + d.x * r, p.z + d.z * r, p.y, 4);
            if (q && !this.terrain.dangerous(q)) return q;
        }
        return null;
    }

    hasSaferFasterRoute(counts) {
        // If have iron from other sources or village chest, golem not mandatory
        const hasIron = (counts["minecraft:iron_ingot"] ?? 0) >= 3;
        const hasVillageChestIron = this.bot.structures?.found?.some(f => f.name === "village" && f.hasChest);
        const hasCaveIron = !!this.bot.awareness?.getNearest("iron_ore");

        if (hasIron) return true;
        if (hasVillageChestIron) return true;
        if (hasCaveIron && this.bot.awareness.getNearest("iron_ore").distance < 24) return true;

        return false;
    }


    getArmorValue() {
        // Simplified armor value
        try {
            const eq = this.sim.getComponent("minecraft:equippable");
            let value = 0;
            for (const slot of ["head","chest","legs","feet"]) {
                const item = eq.getEquipment(slot);
                if (item) {
                    if (item.typeId.includes("iron")) value += 5;
                    else if (item.typeId.includes("diamond")) value += 7;
                    else if (item.typeId.includes("leather")) value += 2;
                }
            }
            return value;
        } catch { return 0; }
    }

}
