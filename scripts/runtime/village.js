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
import { floor, add, distance, center, key, UP, DOWN, CARDINAL, COMPASS } from "../core/math.js";
import { evaluateVillage, findBestFoodOption, shouldCraftBedIndependently, evaluateVillageVsNetherRoute } from "../core/village-strategy.js";
import { retainScore } from "../core/knowledge.js";

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
                    try { this.bot.obtain("minecraft:white_bed", 1, tick); return true; } catch {}
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

        if (comparison.decision === "village" && villageEval.shouldGo) {
            this.currentVillage = village;
            this.bot.reason = `Village: ${comparison.reason} - village at ${village.pos.x},${village.pos.y},${village.pos.z} distance ${village.distance.toFixed(0)} benefits ${villageEval.benefits.join(",")} - ${villageEval.foodEfficiency}`;

            // If have minimum equipment, go to village
            if (context.hasMinimumEquipment) {
                return this.executeVillageRun(village, villageEval, tick, context);
            }
        }

        // Even if not going to village as main, if close and has food/beds, loot quickly
        if (village.distance < 32 && villageEval.score > 50) {
            const loot = this.bot.structures?.getLootTarget();
            if (loot && distance(loot.pos, this.sim.location) < 24) {
                this.bot.reason = `Village: close village ${village.distance.toFixed(0)} blocks, quick loot food/beds`;
                const r = this.bot.navTo(center(loot.pos), tick, 2);
                if (r !== "failed") return true;
            }
        }

        return false;
    }

    buildContext(tick) {
        const counts = this.bag.counts();
        const hasWood = (counts["minecraft:oak_log"] ?? 0) >= 3 || Object.keys(counts).some(k => k.includes("_log") && counts[k] >= 2);
        const hasStone = (counts["minecraft:cobblestone"] ?? 0) >= 8;
        const hasFood = Object.keys(counts).some(k => k.includes("bread") || k.includes("cooked_") || k.includes("potato") || k.includes("carrot"));
        const foodAmount = Object.entries(counts).filter(([k]) => k.includes("bread") || k.includes("cooked_") || k.includes("potato") || k.includes("carrot")).reduce((sum, [,v]) => sum + v, 0);
        const hasBed = Object.keys(counts).some(k => k.endsWith("_bed"));
        const hasWool = Object.keys(counts).some(k => k.includes("_wool"));
        const woolCount = Object.entries(counts).filter(([k]) => k.includes("_wool")).reduce((sum, [,v]) => sum + v, 0);
        const woodCount = (counts["minecraft:oak_log"] ?? 0) + (counts["minecraft:oak_planks"] ?? 0);
        const hasIron = (counts["minecraft:iron_ingot"] ?? 0) >= 1;
        const hasBucket = (counts["minecraft:bucket"] ?? 0) > 0 || (counts["minecraft:water_bucket"] ?? 0) > 0;
        const hasFurnace = (counts["minecraft:furnace"] ?? 0) > 0;
        const hasFuel = (counts["minecraft:coal"] ?? 0) > 0 || (counts["minecraft:charcoal"] ?? 0) > 0;

        const threats = this.bot.terrain.threatInfo(this.sim, this.bot.owner());
        const phase = this.bot.speedrun?.phase ?? 0;

        // Cache sheep lookup to avoid double entity scan
        let sheepNearby = null;
        try { sheepNearby = this.findSheepNearby(32); } catch {}
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
            time: this.getTimeOfDay(),
            distanceToSheep: sheepNearby ? distance(sheepNearby.pos, this.sim.location) : 100,
            sheepCount: sheepNearby ? 1 : 0,
            hasVillage: null, // avoid recursive expensive scan in buildContext
            netherRoute: this.bot.nether?.currentRoute,
            health: this.sim.getComponent("minecraft:health")?.currentValue ?? 20,
            equipment: { weaponTier: this.getWeaponTier(), armorValue: 0 },
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
        } catch {}

        try {
            // Try /locate if commands available
            const located = this.tryLocateVillage();
            if (located) return located;
        } catch {}

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
        } catch {}

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
        // Try /locate command when available and permitted
        try {
            const dim = this.sim.dimension;
            // In Bedrock, /locate village may work if cheats enabled
            const result = dim.runCommand("locate structure village");
            // Parse result - format varies, but try to get coordinates
            // This is best-effort, if fails fallback to environmental
            if (result.successCount > 0) {
                // Try to extract coordinates from result - depends on version
                // For now, return null to use environmental detection
                // Actual implementation would parse result message
                return null;
            }
        } catch {
            // Commands not available or not permitted, use environmental exploration
        }
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
                        } catch {}
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
        } catch {}
        return null;
    }

    countSheepNearby(radius) {
        try {
            const entities = this.sim.dimension.getEntities({ location: this.sim.location, maxDistance: radius });
            return entities.filter(e => e.typeId === "minecraft:sheep").length;
        } catch { return 0; }
    }

    getWeaponTier() {
        for (let i = 0; i < this.bag.size; i++) {
            const s = this.bag.get(i);
            if (!s) continue;
            if (s.typeId.includes("netherite")) return 5;
            if (s.typeId.includes("diamond")) return 4;
            if (s.typeId.includes("iron")) return 3;
            if (s.typeId.includes("stone")) return 2;
            if (s.typeId.includes("wooden")) return 1;
        }
        return 0;
    }

    getTimeOfDay() {
        try {
            const tod = this.sim.dimension.getTimeOfDay ? this.sim.dimension.getTimeOfDay() : 0;
            if (tod >= 12000 && tod < 13000) return "sunset";
            if (tod >= 13000 && tod < 23000) return "night";
            return "day";
        } catch { return "day"; }
    }
}
