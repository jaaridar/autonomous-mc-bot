/**
 * scripts/runtime/nether.js
 *
 * Merged from: runtime/nether.js, runtime/bucket.js
 */
import { CARDINAL, UP, add, center, distance, floor } from "../core/math.js";
import { chooseFastestViableMethod, chooseNetherRoute, evaluateBucketPriority, evaluateIgnitionOptions, evaluateLavaPoolForBucket, planObsidianFormation, shouldNotWasteTimeSearchingFlintSteel, shouldObtainFlintAndSteelBeforePortal, shouldRecalculate, verifyPortalAction } from "../core/nether.js";

// ---------------------------------------------------------------- nether.js

/**
 * Nether Runtime - world-class Nether entry decision system.
 * Continuously compares ground-level lava pool, cave lava pool, ruined portal, alternative resources.
 * Chooses fastest viable route with best balance time, feasibility, resource requirements, survival probability.
 * Handles bucket milestone, water placement, lava manipulation, portal frame construction, obsidian formation, ignition.
 */





export class NetherDirector {
    constructor(bot) {
        this.bot = bot;
        this.sim = bot.sim;
        this.bag = bot.bag;
        this.terrain = bot.terrain;
        this.host = bot.host;
        this.builder = bot.builder;

        this.lastEval = 0;
        this.currentRoute = null;
        this.portalPos = null;
        this.portalFrame = [];
        this.obsidianMined = 0;
        this.ignitionAttempts = 0;
        this.lavaPoolAttempts = 0;
        this.ruinedPortalAttempts = 0;
        this.lastRecalc = 0;
        this.verifiedActions = new Map();
    }

    reset(tick) {
        this.currentRoute = null;
        this.portalPos = null;
        this.portalFrame = [];
        this.obsidianMined = 0;
        this.ignitionAttempts = 0;
        this.lavaPoolAttempts = 0;
        this.ruinedPortalAttempts = 0;
        this.lastRecalc = tick;
    }

    tick(tick) {
        // Never interfere with an active mining task (director mining runs centrally).
        if (this.bot.mining) return false;
        // In speedrun mode, nether prep waits for the iron tier: the speedrun
        // director owns wood -> stone -> iron (PHASES.IRON = 2).
        if (this.bot.mode === "speedrun" && (this.bot.speedrun?.phase ?? 0) < 2) return false;
        if (tick - this.lastEval < 40) return false;
        this.lastEval = tick;

        const counts = this.bag.counts();
        const context = this.buildContext(tick, counts);

        // Bucket milestone check
        const bucketEval = evaluateBucketPriority(counts, context);
        if (bucketEval.priority >= 80 && !bucketEval.milestone) {
            // Need bucket
            this.bot.reason = `Nether: bucket milestone priority ${bucketEval.priority} - ${bucketEval.reason}, iron needed ${bucketEval.ironNeeded}`;
            if (bucketEval.canCraft) {
                try { this.bot.obtain("minecraft:bucket", 1, tick); return true; } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }
            } else if (bucketEval.needSmelt) {
                try { this.bot.autonomy.produce("minecraft:raw_iron", bucketEval.ironNeeded, tick); return true; } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }
            } else {
                // Find iron
                const ironSpot = this.bot.awareness?.getNearest("iron_ore");
                if (ironSpot) {
                    const r = this.bot.navTo(center(ironSpot.pos), tick, 2);
                    if (r !== "failed") return true;
                }
                this.bot.assignMine("minecraft:iron_ore", bucketEval.ironNeeded);
                return true;
            }
        }

        // If have bucket but no water, get water
        if (bucketEval.next === "get_water") {
            const waterSource = this.bot.awareness?.getWaterSource();
            if (waterSource) {
                const r = this.bot.navTo(center(waterSource), tick, 2);
                if (r !== "failed") {
                    this.bot.reason = `Nether: have bucket, getting water at ${waterSource.x},${waterSource.y},${waterSource.z} for obsidian`;
                    return true;
                }
            }
            // Try to use bucket on water
            return this.tryFillWaterBucket(tick);
        }

        // Ignition check: prefer obtaining flint and steel before committing to portal location
        const ignitionCheck = shouldObtainFlintAndSteelBeforePortal(context);
        if (ignitionCheck.should && ignitionCheck.priority >= 75) {
            const ignitionEval = evaluateIgnitionOptions(counts, context.ruinedPortalChestLoot, context);
            if (ignitionEval && !ignitionEval.available) {
                this.bot.reason = `Nether: ${ignitionCheck.reason} - ${ignitionEval.reason}`;
                if (ignitionEval.action === "loot_ruined_portal" && ignitionEval.pos) {
                    const r = this.bot.navTo(center(ignitionEval.pos), tick, 2);
                    if (r !== "failed") return true;
                } else if (ignitionEval.action === "craft_flint_and_steel") {
                    try { this.bot.obtain("minecraft:flint_and_steel", 1, tick); return true; } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }
                } else if (ignitionEval.action === "mine_gravel" || ignitionEval.action === "find_gravel") {
                    this.bot.assignMine("minecraft:gravel", 5);
                    return true;
                } else if (ignitionEval.action === "gather_iron") {
                    this.bot.assignMine("minecraft:iron_ore", 3);
                    return true;
                }
            }
        }

        // Don't waste time searching flint and steel if faster reliable ignition already available
        const wasteCheck = shouldNotWasteTimeSearchingFlintSteel(context);
        if (wasteCheck.shouldNotSearch) {
            // Use existing ignition
            this.bot.reason = `Nether: ${wasteCheck.reason}`;
        }

        // Evaluate Nether routes
        const options = this.gatherRouteOptions(tick, counts, context);
        const decision = chooseNetherRoute(options, context);

        if (!decision.route) {
            this.bot.reason = `Nether: ${decision.reason} - exploring for lava pool or ruined portal`;
            // Explore
            if (this.bot.scout.step(tick)) return true;
            return false;
        }

        this.currentRoute = decision.evaluation;

        // Check if should recalculate due to new discovery
        if (tick - this.lastRecalc > 200) {
            try {
                const newDiscovery = this.checkNewDiscoveries(tick, context);
                if (newDiscovery && shouldRecalculate(newDiscovery, this.currentRoute, context)) {
                    this.lastRecalc = tick;
                    this.bot.reason = `Nether: recalculating plan due to new discovery ${newDiscovery.type} - ${newDiscovery.reason}`;
                    // Re-evaluate
                    const newOptions = this.gatherRouteOptions(tick, counts, context);
                    const newDecision = chooseNetherRoute(newOptions, context);
                    if (newDecision.evaluation.score > decision.evaluation.score + 10) {
                        this.currentRoute = newDecision.evaluation;
                        this.bot.reason = `Nether: new discovery better, switching to ${newDecision.route} - ${newDecision.reason}`;
                        return this.executeRoute(newDecision, tick, counts, context);
                    }
                }
            } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }
        }

        return this.executeRoute(decision, tick, counts, context);
    }

    buildContext(tick, counts) {
        const hasBucket = (counts["minecraft:bucket"] ?? 0) > 0;
        const hasWaterBucket = (counts["minecraft:water_bucket"] ?? 0) > 0;
        const hasFlintAndSteel = (counts["minecraft:flint_and_steel"] ?? 0) > 0;
        const hasFireCharge = (counts["minecraft:fire_charge"] ?? 0) > 0;
        const hasFlint = (counts["minecraft:flint"] ?? 0) > 0;
        const hasIron = (counts["minecraft:iron_ingot"] ?? 0) > 0;
        const obsidianHave = counts["minecraft:obsidian"] ?? 0;

        const lavaPool = this.bot.awareness?.getLavaPool();
        const waterSource = this.bot.awareness?.getWaterSource();
        const ruinedPortal = this.bot.structures?.found?.find(f => f.name === "ruined_portal");
        const topStruct = this.bot.structures?.getTopPriority();

        const phase = this.bot.speedrun?.phaseName?.() ?? "wood";

        return {
            hasBucket,
            hasWaterBucket,
            hasFlintAndSteel,
            hasFireCharge,
            hasFlint,
            hasIron,
            obsidianHave,
            hasLavaPool: !!lavaPool,
            hasWaterNearby: !!waterSource,
            hasRuinedPortal: !!ruinedPortal,
            hasRuinedPortalNearby: ruinedPortal && distance(ruinedPortal.pos, this.sim.location) < 64,
            distanceToRuinedPortal: ruinedPortal ? distance(ruinedPortal.pos, this.sim.location) : 100,
            ruinedPortalPos: ruinedPortal?.pos,
            ruinedPortalChestLoot: null, // would need to scan chest
            hasGravelNearby: this.checkGravelNearby(16),
            distanceToGravel: this.findGravelDistance(24) ?? 50,
            phase,
            time: this.getTimeOfDay(),
            distanceToLavaPool: lavaPool ? distance(lavaPool, this.sim.location) : 100,
            hostileCount: this.bot.terrain.threatInfo(this.sim, this.bot.owner()).count,
            netherRoute: this.currentRoute,
        };
    }

    gatherRouteOptions(tick, counts, context) {
        const options = {};

        // Ground-level lava pool
        const lavaPool = this.bot.awareness?.getLavaPool();
        if (lavaPool) {
            const groundLava = {
                pos: lavaPool,
                distance: distance(lavaPool, this.sim.location),
                size: lavaPool.size ?? 5,
                depth: Math.max(0, 60 - lavaPool.y),
                accessible: true,
                hasBucket: context.hasBucket,
                hasWaterBucket: context.hasWaterBucket,
                waterAvailable: !!this.bot.awareness?.getWaterSource(),
                surroundingDanger: {
                    hostileCount: context.hostileCount,
                    lavaSpread: false,
                    cliff: false
                },
                surroundingTerrain: {
                    flat: true,
                    hasWaterNearby: !!this.bot.awareness?.getWaterSource(),
                    cliff: false,
                    lavaSpread: false
                },
                escapeRoutes: 2,
            };
            options.groundLava = groundLava;

            // Also check if cave lava
            if (lavaPool.y < 50) {
                options.caveLava = {
                    ...groundLava,
                    isCave: true,
                    depth: 60 - lavaPool.y,
                    travelDanger: {
                        hostileCount: context.hostileCount,
                        darkness: true,
                        fallRisk: lavaPool.y < 20
                    }
                };
            }
        }

        // Ruined portal
        const ruined = this.bot.structures?.found?.find(f => f.name === "ruined_portal");
        if (ruined) {
            // Need to evaluate frame completeness - scan obsidian around
            const obsidianCount = this.countObsidianAround(ruined.pos, 8);
            const hasCrying = this.hasCryingObsidianAround(ruined.pos, 8);
            options.ruinedPortal = {
                pos: ruined.pos,
                distance: distance(ruined.pos, this.sim.location),
                obsidianCount,
                hasCryingObsidian: hasCrying,
                frameCompleteness: obsidianCount / 10,
                chestLoot: [], // would scan
                hasFlintAndSteel: false,
                hasFireCharge: false,
                hasObsidianInChest: 0,
                score: ruined.priority
            };
        }

        // Missing ignition
        if (!context.hasFlintAndSteel && !context.hasFireCharge) {
            options.missingIgnition = {
                needFlint: !context.hasFlint,
                needIron: !context.hasIron,
                needFireCharge: false,
                hasGravelNearby: context.hasGravelNearby,
                hasIron: context.hasIron,
                distanceToGravel: context.distanceToGravel,
                hasIronNearby: !!this.bot.awareness?.getNearest("iron_ore"),
                distanceToIron: this.bot.awareness?.getNearest("iron_ore") ? distance(this.bot.awareness.getNearest("iron_ore").pos, this.sim.location) : 100,
                hostileCount: context.hostileCount
            };
        }

        return options;
    }

    executeRoute(decision, tick, counts, context) {
        const route = decision.route;
        const evaluation = decision.evaluation;

        this.bot.reason = `Nether: ${decision.reason} (confidence ${decision.confidence})`;

        switch (decision.action) {
            case "build_portal_ground_lava":
                return this.handleGroundLavaPortal(evaluation, tick, counts, context);
            case "build_portal_cave_lava":
                return this.handleCaveLavaPortal(evaluation, tick, counts, context);
            case "repair_ruined_portal":
                return this.handleRuinedPortal(evaluation, tick, counts, context);
            case "gather_ignition":
                return this.handleGatherIgnition(evaluation, tick, counts, context);
            case "explore_for_better":
                if (this.bot.scout.step(tick)) return true;
                return false;
            default:
                return false;
        }
    }

    handleGroundLavaPortal(evaluation, tick, counts, context) {
        const pos = evaluation.pos;
        if (!pos) return false;

        const dist = distance(pos, this.sim.location);
        if (dist > 8) {
            const r = this.bot.navTo(center(pos), tick, 4);
            if (r !== "failed") {
                this.bot.reason = `Nether: ground lava pool at ${pos.x},${pos.y},${pos.z} distance ${dist.toFixed(0)} - navigating, minimal digging`;
                return true;
            }
        }

        // At lava pool, make obsidian
        if (context.hasWaterBucket) {
            // Check for obsidian nearby
            const obsidianNear = this.terrain.scanOres(this.sim.location, 8, (type) => type === "minecraft:obsidian", 200);
            if (obsidianNear.length && (counts["minecraft:obsidian"] ?? 0) < 10) {
                this.bot.assignMine("minecraft:obsidian", 10 - (counts["minecraft:obsidian"] ?? 0));
                this.bot.reason = `Nether: obsidian nearby ${obsidianNear.length} blocks, mining for portal`;
                return true;
            }

            // Place water on lava to make obsidian
            if ((counts["minecraft:obsidian"] ?? 0) < 10) {
                const result = this.placeWaterOnLava(pos, tick);
                if (result) return true;
            }
        }

        // If have obsidian, build portal
        if ((counts["minecraft:obsidian"] ?? 0) >= 10) {
            return this.buildPortal(tick, counts, pos);
        }

        return false;
    }

    handleCaveLavaPortal(evaluation, tick, counts, context) {
        // Only if accessible and danger acceptable
        if (evaluation.feasibility === "low") {
            this.bot.reason = `Nether: cave lava pool feasibility low (${evaluation.warnings}) - avoiding, excessive danger, find ground lava instead`;
            return false;
        }

        const pos = evaluation.pos;
        const dist = distance(pos, this.sim.location);
        if (dist > 8) {
            const r = this.bot.navTo(center(pos), tick, 3);
            if (r !== "failed") {
                this.bot.reason = `Nether: cave lava pool at ${pos.x},${pos.y},${pos.z} - accessible, danger acceptable, navigating`;
                return true;
            }
        }

        // Similar to ground but with torch and weapon checks
        if ((counts["minecraft:torch"] ?? 0) < 4) {
            try { this.bot.obtain("minecraft:torch", 8, tick); return true; } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }
        }

        return this.handleGroundLavaPortal(evaluation, tick, counts, context);
    }

    handleRuinedPortal(evaluation, tick, counts, context) {
        const pos = evaluation.pos;
        if (!pos) return false;

        const dist = distance(pos, this.sim.location);
        if (dist > 6) {
            const r = this.bot.navTo(center(pos), tick, 3);
            if (r !== "failed") {
                this.bot.reason = `Nether: ruined portal at ${pos.x},${pos.y},${pos.z} distance ${dist.toFixed(0)} frame ${evaluation.obsidianCount}/10 ${evaluation.isFasterThanNew ? "FASTER than new" : ""} - repairing`;
                return true;
            }
        }

        // At ruined portal, inspect and repair
        if (evaluation.missingObsidian > 0 && (counts["minecraft:obsidian"] ?? 0) >= evaluation.missingObsidian) {
            // Place missing obsidian
            const result = this.repairRuinedPortalFrame(pos, evaluation, tick);
            if (result) return true;
        }

        if ((counts["minecraft:obsidian"] ?? 0) < evaluation.missingObsidian) {
            // Need more obsidian
            this.bot.assignMine("minecraft:obsidian", evaluation.missingObsidian);
            this.bot.reason = `Nether: ruined portal needs ${evaluation.missingObsidian} obsidian, have ${counts["minecraft:obsidian"] ?? 0}, gathering`;
            return true;
        }

        // If frame complete, ignite
        if (evaluation.obsidianCount >= 10 || (counts["minecraft:obsidian"] ?? 0) >= 10) {
            return this.ignitePortal(tick, counts, pos);
        }

        return false;
    }

    handleGatherIgnition(evaluation, tick, counts, context) {
        const req = evaluation.requirements;
        if (req.needFlint) {
            // Walk to visible gravel when it is not in reach, then mine it for the flint drop.
            const gravelPos = this.findGravelNearby(24);
            if (gravelPos && distance(gravelPos, this.sim.location) > 4) {
                const r = this.bot.navTo(center(gravelPos), tick, 2);
                if (r !== "failed") {
                    this.bot.reason = `Nether: need flint, gravel at ${gravelPos.x},${gravelPos.y},${gravelPos.z} - walking there to mine`;
                    return true;
                }
            }
            this.bot.assignMine("minecraft:gravel", 5);
            this.bot.reason = "Nether: mining gravel for flint 10% drop rate";
            return true;
        }
        if (req.needIron) {
            this.bot.assignMine("minecraft:iron_ore", 2);
            this.bot.reason = "Nether: need iron for flint and steel";
            return true;
        }
        return false;
    }

    buildPortal(tick, counts, nearPos) {
        const basePos = nearPos ?? floor(this.sim.location);
        // Find flat ground
        const flat = this.findFlatGround(basePos, 8);
        const buildPos = flat ?? basePos;

        if ((counts["minecraft:obsidian"] ?? 0) < 10) return false;

        const result = this.builder.buildPortalFrame(buildPos, tick);
        if (result === "placed") {
            this.bot.reason = `Nether: building portal frame at ${buildPos.x},${buildPos.y},${buildPos.z} - 10 min obsidian, 4x5 frame`;
            this.portalPos = buildPos;
            return true;
        } else if (result === "no_obsidian") {
            this.bot.reason = "Nether: no obsidian for portal frame";
            return false;
        } else if (result === "not_enough_obsidian") {
            this.bot.reason = `Nether: not enough obsidian have ${counts["minecraft:obsidian"] ?? 0}/10`;
            return false;
        }

        // If frame built, ignite
        if (this.portalFrame.length >= 10 || this.isPortalFrameComplete(buildPos)) {
            return this.ignitePortal(tick, counts, buildPos);
        }

        return false;
    }

    ignitePortal(tick, counts, portalPos) {
        const hasFlintAndSteel = (counts["minecraft:flint_and_steel"] ?? 0) > 0;
        const hasFireCharge = (counts["minecraft:fire_charge"] ?? 0) > 0;

        if (!hasFlintAndSteel && !hasFireCharge) {
            // Need ignition
            const ignitionEval = evaluateIgnitionOptions(counts, null, { hasGravelNearby: this.checkGravelNearby(16), distanceToGravel: this.findGravelDistance(24) ?? 50 });
            if (ignitionEval && ignitionEval.action === "craft_flint_and_steel") {
                try { this.bot.obtain("minecraft:flint_and_steel", 1, tick); return true; } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }
            }
            return false;
        }

        const slot = hasFlintAndSteel ? this.bag.find(s => s.typeId === "minecraft:flint_and_steel") : this.bag.find(s => s.typeId === "minecraft:fire_charge");
        if (slot < 0) return false;

        const selected = this.bag.select(slot);
        try {
            // Look at portal interior bottom
            const interior = add(portalPos, { x: 1, y: 0, z: 0 });
            this.sim.lookAtBlock(this.host.relative(center(interior)));
            const ok = this.sim.useItemInSlot(selected);
            this.ignitionAttempts++;

            if (ok) {
                const verification = verifyPortalAction("ignite_portal", "ignited", counts);
                if (verification.success) {
                    this.bot.reason = `Nether: portal ignited at ${portalPos.x},${portalPos.y},${portalPos.z}! Entering Nether - primary objective achieved`;
                    // Try to enter
                    this.sim.moveToLocation(this.host.relative(center(interior)));
                    return true;
                }
            }

            if (this.ignitionAttempts > 5) {
                this.bot.reason = "Nether: ignition failed after 5 attempts, checking frame";
                this.ignitionAttempts = 0;
            }

            return true;
        } catch {
            return false;
        }
    }

    placeWaterOnLava(lavaPos, tick) {
        const waterSlot = this.bag.find(s => s.typeId === "minecraft:water_bucket");
        if (waterSlot < 0) return false;

        const selected = this.bag.select(waterSlot);
        try {
            // Find lava source nearby
            const lavaBlock = this.terrain.block(lavaPos);
            if (!lavaBlock || !lavaBlock.typeId.includes("lava")) {
                // Find nearby lava
                const nearbyLava = this.findLavaNearby(lavaPos, 4);
                if (!nearbyLava) return false;
                lavaPos = nearbyLava;
            }

            // Place water above or adjacent to lava source, not directly into flowing
            const waterPlacePos = add(lavaPos, UP);
            if (this.terrain.empty(waterPlacePos)) {
                this.sim.lookAtBlock(this.host.relative(center(lavaPos)));
                const ok = this.sim.useItemInSlot(selected);
                if (ok) {
                    this.bot.reason = `Nether: placing water on lava at ${lavaPos.x},${lavaPos.y},${lavaPos.z} to make obsidian (water + lava source = obsidian)`;
                    this.lavaPoolAttempts++;
                    return true;
                }
            }

            // Try adjacent
            for (const d of CARDINAL) {
                const adj = add(lavaPos, d);
                const aboveAdj = add(adj, UP);
                if (this.terrain.empty(aboveAdj) && this.terrain.block(adj)?.typeId.includes("lava")) {
                    this.sim.lookAtBlock(this.host.relative(center(adj)));
                    const ok = this.sim.useItemInSlot(selected);
                    if (ok) return true;
                }
            }

            return false;
        } catch {
            return false;
        }
    }

    repairRuinedPortalFrame(pos, evaluation, tick) {
        // Find missing obsidian positions
        const framePositions = this.getRuinedPortalFramePositions(pos);
        for (const framePos of framePositions) {
            const block = this.terrain.block(framePos);
            if (!block || block.isAir || block.typeId === "minecraft:crying_obsidian") {
                // Need to place obsidian here
                const support = this.builder.findSupportFor(framePos);
                if (!support) continue;
                const result = this.builder.placeAt(framePos, support.pos, { sneak: true, blockType: "minecraft:obsidian" });
                if (result === "placed") {
                    this.bot.reason = `Nether: repairing ruined portal frame at ${framePos.x},${framePos.y},${framePos.z} missing ${evaluation.missingObsidian} obsidian`;
                    return true;
                }
            }
        }
        return false;
    }

    getRuinedPortalFramePositions(basePos) {
        // Ruined portal frame: 4 wide, 5 high, corners may be missing or crying obsidian
        const positions = [];
        // Bottom
        for (let x = 0; x < 4; x++) positions.push(add(basePos, { x, y: 0, z: 0 }));
        // Sides
        for (let y = 1; y < 4; y++) {
            positions.push(add(basePos, { x: 0, y, z: 0 }));
            positions.push(add(basePos, { x: 3, y, z: 0 }));
        }
        // Top
        for (let x = 0; x < 4; x++) positions.push(add(basePos, { x, y: 4, z: 0 }));
        return positions;
    }

    isPortalFrameComplete(basePos) {
        const positions = this.getRuinedPortalFramePositions(basePos);
        let obsidianCount = 0;
        for (const pos of positions) {
            const block = this.terrain.block(pos);
            if (block && block.typeId === "minecraft:obsidian") obsidianCount++;
        }
        return obsidianCount >= 10;
    }

    tryFillWaterBucket(tick) {
        const bucketSlot = this.bag.find(s => s.typeId === "minecraft:bucket");
        if (bucketSlot < 0) return false;

        const waterSource = this.bot.awareness?.getWaterSource();
        if (!waterSource) return false;

        const selected = this.bag.select(bucketSlot);
        try {
            this.sim.lookAtBlock(this.host.relative(center(waterSource)));
            const ok = this.sim.useItemInSlot(selected);
            if (ok) {
                this.bot.reason = `Nether: filling bucket with water at ${waterSource.x},${waterSource.y},${waterSource.z} for obsidian`;
                return true;
            }
        } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }
        return false;
    }

    countObsidianAround(pos, radius) {
        // ROBUST QUICK: budgeted scan, radius capped 5, max 400 checks
        let count = 0;
        let checks = 0;
        const maxChecks = 400;
        radius = Math.min(radius, 5);
        for (let dx = -radius; dx <= radius && checks < maxChecks; dx++) for (let dy = -2; dy <= 4 && checks < maxChecks; dy++) for (let dz = -radius; dz <= radius && checks < maxChecks; dz++) {
            const p = add(pos, { x: dx, y: dy, z: dz });
            checks++;
            const b = this.terrain.block(p);
            if (b && b.typeId === "minecraft:obsidian") count++;
            if (count >= 14) return 14;
        }
        return Math.min(count, 14);
    }

    hasCryingObsidianAround(pos, radius) {
        let checks = 0;
        const maxChecks = 200;
        radius = Math.min(radius, 5);
        for (let dx = -radius; dx <= radius && checks < maxChecks; dx++) for (let dy = -2; dy <= 4 && checks < maxChecks; dy++) for (let dz = -radius; dz <= radius && checks < maxChecks; dz++) {
            const p = add(pos, { x: dx, y: dy, z: dz });
            checks++;
            const b = this.terrain.block(p);
            if (b && b.typeId === "minecraft:crying_obsidian") return true;
        }
        return false;
    }

    checkGravelNearby(radius) {
        // QUICK: budgeted, max 300 checks
        const p = floor(this.sim.location);
        let checks = 0;
        const maxChecks = 300;
        for (let dx = -radius; dx <= radius && checks < maxChecks; dx++) for (let dz = -radius; dz <= radius && checks < maxChecks; dz++) for (let dy = -3; dy <= 3 && checks < maxChecks; dy++) {
            const q = add(p, { x: dx, y: dy, z: dz });
            checks++;
            const b = this.terrain.block(q);
            if (b && b.typeId === "minecraft:gravel") return true;
        }
        return false;
    }

    findGravelNearby(radius) {
        const p = floor(this.sim.location);
        for (let dx = -radius; dx <= radius; dx++) for (let dz = -radius; dz <= radius; dz++) for (let dy = -3; dy <= 3; dy++) {
            const q = add(p, { x: dx, y: dy, z: dz });
            const b = this.terrain.block(q);
            if (b && b.typeId === "minecraft:gravel") return q;
        }
        return null;
    }

    findGravelDistance(radius) {
        const gravel = this.findGravelNearby(radius);
        return gravel ? distance(gravel, this.sim.location) : null;
    }

    findLavaNearby(pos, radius) {
        for (let dx = -radius; dx <= radius; dx++) for (let dz = -radius; dz <= radius; dz++) for (let dy = -2; dy <= 2; dy++) {
            const q = add(pos, { x: dx, y: dy, z: dz });
            const b = this.terrain.block(q);
            if (b && b.typeId.includes("lava")) return q;
        }
        return null;
    }

    findFlatGround(pos, radius) {
        for (let r = 2; r <= radius; r++) for (const d of CARDINAL) {
            const q = this.terrain.groundNear(pos.x + d.x * r, pos.z + d.z * r, pos.y, 3);
            if (!q) continue;
            let flat = true;
            for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) {
                const check = add(q, { x, y: 0, z });
                const ground = this.terrain.groundNear(check.x, check.z, check.y, 1);
                if (!ground || Math.abs(ground.y - q.y) > 1) { flat = false; break; }
            }
            if (flat && !this.terrain.lavaNear(q)) return q;
        }
        return null;
    }

    checkNewDiscoveries(tick, context) {
        // Check if new village, ruined portal, lava pool discovered since last recalc
        const structures = this.bot.structures?.found ?? [];
        for (const struct of structures) {
            if (tick - struct.tick < 100) {
                // New discovery within last 5 seconds
                if (struct.name === "ruined_portal" && struct.priority >= 90) {
                    return { type: "ruined_portal", pos: struct.pos, obsidianCount: 8, reason: "new ruined portal discovered" };
                }
                if (struct.name === "lava_pool" && struct.priority >= 90) {
                    return { type: "lava_pool", pos: struct.pos, size: 8, reason: "new lava pool discovered" };
                }
                if (struct.name === "village") {
                    return { type: "village", pos: struct.pos, reason: "new village discovered" };
                }
            }
        }

        const lavaPool = this.bot.awareness?.getLavaPool();
        if (lavaPool && tick - lavaPool.tick < 100) {
            return { type: "ground_lava", pos: lavaPool, size: lavaPool.size, reason: "new ground lava pool" };
        }

        return null;
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

// ---------------------------------------------------------------- bucket.js

/**
 * Bucket Runtime - bucket acquisition & Nether preparation.
 * Bucket major milestone enables ground-level lava pools.
 * Once obtained prioritize locating suitable lava pool or evaluating ruined portal.
 * Understand water placement lava manipulation portal-frame obsidian formation safe ignition.
 * Know how to construct Nether portal available resources fastest viable method.
 * Evaluate ground-level cave ruined as alternative not single rigid.
 * Account depth accessibility surrounding terrain water availability hostile mobs escape routes when choosing lava pool.
 * Avoid entering cave solely because contains lava if unnecessary danger excessive travel.
 */



export class BucketDirector {
    constructor(bot) {
        this.bot = bot;
        this.sim = bot.sim;
        this.bag = bot.bag;
        this.terrain = bot.terrain;
        this.host = bot.host;
        this.builder = bot.builder;

        this.lastEval = 0;
        this.waterAttempts = 0;
        this.obsidianAttempts = 0;
        this.lavaPoolTried = new Set();
    }

    reset() {
        this.waterAttempts = 0;
        this.obsidianAttempts = 0;
        this.lavaPoolTried.clear();
    }

    tick(tick) {
        // Never interfere with an active mining task (director mining runs centrally).
        if (this.bot.mining) return false;
        if (tick - this.lastEval < 60) return false;
        this.lastEval = tick;

        const counts = this.bag.counts();
        const context = this.buildContext(tick, counts);
        const bucketEval = evaluateBucketPriority(counts, context);

        // Bucket major milestone priority 95
        if (!bucketEval.milestone && bucketEval.priority >= 70) {
            this.bot.reason = `Bucket: ${bucketEval.reason} - major milestone enables ground-level lava pools, priority ${bucketEval.priority}`;
            if (bucketEval.canCraft) {
                try { this.bot.obtain("minecraft:bucket", 1, tick); return true; } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }
            } else if (bucketEval.needSmelt) {
                try { this.bot.autonomy.produce("minecraft:raw_iron", bucketEval.ironNeeded, tick); return true; } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }
            } else {
                const ironSpot = this.bot.awareness?.getNearest("iron_ore");
                if (ironSpot) {
                    const r = this.bot.navTo(center(ironSpot.pos), tick, 2);
                    if (r !== "failed") return true;
                }
                this.bot.assignMine("minecraft:iron_ore", bucketEval.ironNeeded);
                return true;
            }
        }

        if (bucketEval.next === "get_water") {
            const waterSource = this.bot.awareness?.getWaterSource();
            if (waterSource) {
                const r = this.bot.navTo(center(waterSource), tick, 2);
                if (r !== "failed") {
                    this.bot.reason = `Bucket: have bucket, getting water at ${waterSource.x},${waterSource.y},${waterSource.z} for obsidian formation - water placement lava manipulation`;
                    return true;
                }
            }
            // Try fill
            if (this.tryFillWater(tick)) return true;
        }

        if (bucketEval.next === "find_lava_pool" || bucketEval.next === "make_obsidian") {
            const lavaPool = this.bot.awareness?.getLavaPool();
            if (!lavaPool) {
                // Explore for lava
                if (this.bot.scout.step(tick)) {
                    this.bot.reason = "Bucket: no lava pool known, exploring for suitable lava pool accounting depth accessibility terrain water hostile escape routes";
                    return true;
                }
                return false;
            }

            // Evaluate lava pool for bucket use
            const lavaEval = evaluateLavaPoolForBucket({
                pos: lavaPool,
                depth: Math.max(0, 60 - lavaPool.y),
                distance: distance(lavaPool, this.sim.location),
                isCave: lavaPool.y < 50,
                size: lavaPool.size ?? 5,
                hasWaterNearby: !!this.bot.awareness?.getWaterSource(),
                surroundingTerrain: { flat: true, cliff: false, hasWaterNearby: !!this.bot.awareness?.getWaterSource() },
                surroundingDanger: { hostileCount: context.hostileCount },
                waterAvailable: !!this.bot.awareness?.getWaterSource(),
                accessible: true,
                escapeRoutes: 2
            }, context);

            // Avoid entering cave solely because contains lava if unnecessary danger excessive travel
            if (lavaEval.isCave && lavaEval.feasibility === "low") {
                this.bot.reason = `Bucket: cave lava pool feasibility low ${lavaEval.warnings} - avoiding, excessive danger, find ground lava instead`;
                return false;
            }

            if (distance(lavaPool, this.sim.location) > 8) {
                const r = this.bot.navTo(center(lavaPool), tick, 4);
                if (r !== "failed") {
                    this.bot.reason = `Bucket: suitable lava pool at ${lavaPool.x},${lavaPool.y},${lavaPool.z} score ${lavaEval.score} - depth accessibility terrain water hostile escape evaluated`;
                    return true;
                }
            }

            // At lava pool, make obsidian - water placement lava manipulation portal-frame obsidian formation
            if ((counts["minecraft:water_bucket"] ?? 0) > 0) {
                const obsidianFormation = planObsidianFormation(lavaPool, true, true);
                if (obsidianFormation && obsidianFormation.feasible) {
                    const result = this.makeObsidian(lavaPool, tick);
                    if (result) return true;
                }
            }
        }

        if (bucketEval.next === "build_portal") {
            // Have obsidian, build portal - fastest viable method, evaluate ground cave ruined as alternative not single rigid
            const options = this.gatherPortalOptions(tick, counts, context);
            const fastest = chooseFastestViableMethod(options, context);
            if (fastest && fastest.evaluation) {
                this.bot.reason = `Bucket: ${fastest.reason} - fastest viable portal construction`;
                if (fastest.bestRoute === "ruined_portal") {
                    const ruined = this.bot.structures?.found?.find(f => f.name === "ruined_portal");
                    if (ruined) {
                        const r = this.bot.navTo(center(ruined.pos), tick, 3);
                        if (r !== "failed") return true;
                    }
                } else {
                    // Build new
                    const base = floor(this.sim.location);
                    const res = this.builder.buildPortalFrame(base, tick);
                    if (res === "placed") {
                        this.bot.reason = "Bucket: building portal frame min 10 full 14 4x5 interior 2x3";
                        return true;
                    }
                }
            }
        }

        return false;
    }

    buildContext(tick, counts) {
        const hasBucket = (counts["minecraft:bucket"] ?? 0) > 0;
        const hasWaterBucket = (counts["minecraft:water_bucket"] ?? 0) > 0;
        const obsidianHave = counts["minecraft:obsidian"] ?? 0;

        let hostileCount = 0;
        try { hostileCount = this.bot.terrain.threatInfo(this.sim, this.bot.owner()).count; } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }

        return {
            hasBucket,
            hasWaterBucket,
            obsidianHave,
            hasLavaPool: !!this.bot.awareness?.getLavaPool(),
            hasWaterNearby: !!this.bot.awareness?.getWaterSource(),
            hasRuinedPortal: !!this.bot.structures?.found?.find(f => f.name === "ruined_portal"),
            hasGravelNearby: false,
            phase: this.bot.speedrun?.phase ?? 0,
            time: "day",
            hostileCount,
            hasBlocks: (this.builder?.countBlocks() ?? 0) > 0
        };
    }

    gatherPortalOptions(tick, counts, context) {
        const options = {};
        const lavaPool = this.bot.awareness?.getLavaPool();
        if (lavaPool) {
            options.groundLava = {
                pos: lavaPool,
                depth: Math.max(0, 60 - lavaPool.y),
                distance: distance(lavaPool, this.sim.location),
                isCave: lavaPool.y < 50,
                size: lavaPool.size ?? 5,
                hasWaterNearby: !!this.bot.awareness?.getWaterSource(),
                surroundingTerrain: { flat: true },
                surroundingDanger: { hostileCount: context.hostileCount },
                waterAvailable: !!this.bot.awareness?.getWaterSource(),
                accessible: true,
                escapeRoutes: 2,
                obsidianHave: counts["minecraft:obsidian"] ?? 0,
                hasWaterBucket: context.hasWaterBucket
            };
            if (lavaPool.y < 50) {
                options.caveLava = { ...options.groundLava, isCave: true };
            }
        }
        const ruined = this.bot.structures?.found?.find(f => f.name === "ruined_portal");
        if (ruined) {
            options.ruinedPortal = {
                pos: ruined.pos,
                distance: distance(ruined.pos, this.sim.location),
                obsidianCount: 6,
                hasCryingObsidian: false,
                frameCompleteness: 0.6,
                hasFlintAndSteel: false,
                hasFireCharge: false,
                hasObsidianInChest: 0,
                score: 80
            };
        }
        return options;
    }

    tryFillWater(tick) {
        const bucketSlot = this.bag.find(s => s.typeId === "minecraft:bucket");
        if (bucketSlot < 0) return false;
        const waterSource = this.bot.awareness?.getWaterSource();
        if (!waterSource) return false;

        const selected = this.bag.select(bucketSlot);
        try {
            this.sim.lookAtBlock(this.host.relative(center(waterSource)));
            const ok = this.sim.useItemInSlot(selected);
            if (ok) {
                this.bot.reason = `Bucket: filling bucket with water at ${waterSource.x},${waterSource.y},${waterSource.z} for obsidian formation`;
                this.waterAttempts++;
                return true;
            }
        } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }
        return false;
    }

    makeObsidian(lavaPos, tick) {
        const waterSlot = this.bag.find(s => s.typeId === "minecraft:water_bucket");
        if (waterSlot < 0) return false;

        const selected = this.bag.select(waterSlot);
        try {
            // Water placement lava manipulation portal-frame obsidian formation safe ignition
            // Place water above lava source to make obsidian: water + lava source = obsidian
            this.sim.lookAtBlock(this.host.relative(center(lavaPos)));
            const ok = this.sim.useItemInSlot(selected);
            if (ok) {
                this.bot.reason = `Bucket: placing water on lava at ${lavaPos.x},${lavaPos.y},${lavaPos.z} to make obsidian - water + lava source = obsidian, mold method also viable`;
                this.obsidianAttempts++;
                return true;
            }
        } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }
        return false;
    }
}
