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
import { floor, add, distance, center, key, UP, DOWN, CARDINAL } from "../core/math.js";
import { evaluateGolemFight, chooseBestGolemStrategy, shouldDisengageDuringFight, collectIronDropsEfficiently, GOLEM_STATS } from "../core/golem-strategy.js";

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
                weaponTier: this.getWeaponTier(),
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
            time: this.getTimeOfDay(),
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
                try { this.sim.attackEntity(golem); this.hits++; this.lastHit = tick; } catch {}
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
            try { this.sim.attackEntity(golem); this.hits++; } catch {}
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
            try { this.sim.attackEntity(golem); this.hits++; } catch {}
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
                } catch {}
            }
            // Attack
            this.sim.lookAtEntity(golem);
            try { this.sim.attackEntity(golem); this.hits++; } catch {}
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
        } catch {}
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

    getTimeOfDay() {
        try {
            const tod = this.sim.dimension.getTimeOfDay ? this.sim.dimension.getTimeOfDay() : 0;
            if (tod >= 12000 && tod < 13000) return "sunset";
            if (tod >= 13000 && tod < 23000) return "night";
            return "day";
        } catch { return "day"; }
    }
}
