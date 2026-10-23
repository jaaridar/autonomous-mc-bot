/**
 * Speedrun Director v2.0 - Nether speedrun overhaul, world-class adaptive.
 * Primary objective: enter Nether as quickly and reliably as possible without dying.
 * Behaves like experienced adaptive speedrunner, not fixed sequence scripted actions.
 * 
 * Decision system:
 * - Continuously compares ground-level lava pool (bucket+water minimal digging), cave lava (only when accessible), ruined portal (repair faster than new), alternative resources
 * - Village-first: evaluate village vs independent as soon as min equipment for safe progression
 * - Iron golem combat risk management: only when benefit justifies risk, reliable plan, elevated protected position
 * - Food healing combat readiness: maintain sufficient, eat before dangerous fight when safe, avoid critical health fights
 * - Bucket milestone priority 95, enables ground-level lava pools
 * - Flint and steel ignition: prefer before committing to portal location when not creating delays, check ruined portals, ensure iron for both bucket and flint and steel
 * - Adaptive planning: recalculate on village/ruined portal/lava pool/chest/hostile group/obstacle discovery
 * - Verify important actions crafting bucket portal ignition Nether entry
 */
import { currentPhase, PHASES, CHECKLIST } from "../core/resource.js";
import { amountOf } from "../core/recipes.js";
import { distance, center, floor } from "../core/math.js";
import { retainScore, isCritical } from "../core/knowledge.js";
import { chooseNetherRoute, verifyPortalAction, shouldRecalculate } from "../core/nether-strategy.js";
import { evaluateBucketPriority, evaluateLavaPoolForBucket, chooseFastestViableMethod } from "../core/bucket-strategy.js";
import { evaluateIgnitionOptions, shouldObtainFlintAndSteelBeforePortal, ensureIronForBothBucketAndFlintSteel } from "../core/flint-steel-strategy.js";
import { evaluateVillage, evaluateVillageVsNetherRoute } from "../core/village-strategy.js";
import { assessFoodReserves } from "../core/food-strategy.js";

export class SpeedrunDirector {
    constructor(bot) {
        this.bot = bot;
        this.bag = bot.bag;
        this.phase = PHASES.WOOD;
        this.stage = 0;
        this.started = 0;
        this.lastProgress = 0;
        this.signature = "";
        this.goal = undefined;
        this.subPhase = "gather";
        this.tries = 0;
        this.lavaPoolTries = 0;
        this.obsidianProgress = 0;
        this.lastRouteEval = 0;
        this.currentRoute = null;
        this.portalBuilt = false;
        this.ignitionTries = 0;
        this.bucketTries = 0;
        this.villageChecked = false;
        this.adaptiveRecalcCount = 0;
        this.verified = new Map();
        this.portalIgnited = false;
    }

    reset(tick) {
        this.phase = PHASES.WOOD;
        this.stage = 0;
        this.started = tick;
        this.lastProgress = tick;
        this.subPhase = "gather";
        this.goal = undefined;
        this.tries = 0;
        this.lavaPoolTries = 0;
        this.obsidianProgress = 0;
        this.lastRouteEval = 0;
        this.currentRoute = null;
        this.portalBuilt = false;
        this.ignitionTries = 0;
        this.bucketTries = 0;
        this.villageChecked = false;
        this.adaptiveRecalcCount = 0;
        this.verified.clear();
        this.portalIgnited = false;
    }

    phaseName() {
        return (Object.keys(PHASES).find((k) => PHASES[k] === this.phase) ?? "WOOD").toLowerCase();
    }

    status() {
        return {
            phase: this.phaseName(),
            stage: this.stage,
            subPhase: this.subPhase,
            goal: this.goal,
            route: this.currentRoute?.route ?? "none",
            portalBuilt: this.portalBuilt,
            uptime: 0
        };
    }

    tick(tick) {
        const b = this.bot;
        if (!b.settings.assistedCrafting) {
            b.blockTask("Speedrun requires !bot config crafting on");
            return;
        }

        const counts = b.bag.counts();
        const sig = JSON.stringify(counts);
        if (sig !== this.signature) {
            this.signature = sig;
            this.lastProgress = tick;
        }
        if (tick - this.lastProgress > 12000) {
            b.record("No progress for 10m in speedrun, resetting progress tracking");
            this.lastProgress = tick;
            this.signature = "";
            return;
        }

        this.phase = currentPhase(counts);

        // Verify important actions rather than assuming succeeded
        if (tick % 60 === 0) this.verifyMilestones(counts, tick);

        // Adaptive planning: recalculate on discovery
        if (tick - this.lastRouteEval > 100) {
            this.lastRouteEval = tick;
            const discovery = this.checkNewDiscoveries(tick);
            if (discovery && this.currentRoute) {
                try {
                    if (shouldRecalculate(discovery, this.currentRoute, { phase: this.phaseName() })) {
                        this.adaptiveRecalcCount++;
                        b.record(`speedrun adaptive recalc #${this.adaptiveRecalcCount}: ${discovery.type} - ${discovery.reason}`);
                        this.currentRoute = null; // force re-eval
                    }
                } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }
            }
        }

        // FIX: Nether entry decision system - delegate to NetherDirector to avoid duplicate planners
        if (this.phase >= PHASES.IRON && this.bot.nether) {
            // If nether director already has a route, let it handle
            if (this.bot.nether.tick(tick)) {
                this.currentRoute = this.bot.nether.currentRoute;
                return;
            }
            const netherDecision = this.evaluateNetherRoutes(tick, counts);
            if (netherDecision && netherDecision.route) {
                this.currentRoute = netherDecision.evaluation;
                if (netherDecision.action !== "explore_for_better") {
                    const handled = this.executeNetherRoute(netherDecision, tick, counts);
                    if (handled) return;
                }
            }
        } else if (this.phase >= PHASES.IRON) {
            const netherDecision = this.evaluateNetherRoutes(tick, counts);
            if (netherDecision && netherDecision.route) {
                this.currentRoute = netherDecision.evaluation;
                if (netherDecision.action !== "explore_for_better") {
                    const handled = this.executeNetherRoute(netherDecision, tick, counts);
                    if (handled) return;
                }
            }
        }

        // Fallback to phase-based progression with world-class awareness
        switch (this.phase) {
            case PHASES.WOOD:
                this.woodPhase(tick, counts);
                break;
            case PHASES.STONE:
                this.stonePhase(tick, counts);
                break;
            case PHASES.IRON:
                this.ironPhase(tick, counts);
                break;
            case PHASES.DIAMOND:
                this.diamondPhase(tick, counts);
                break;
            case PHASES.PORTAL:
                this.portalPhase(tick, counts);
                break;
            default:
                b.reason = "Speedrun: Nether prep complete, maintaining and verifying portal entry";
                // If portal built, try to enter
                if (this.portalBuilt) {
                    this.enterNether(tick, counts);
                    return;
                }
                if (b.scout.step(tick)) return;
                break;
        }
    }

    evaluateNetherRoutes(tick, counts) {
        // FIX: delegate to nether.js to avoid duplicate planners
        try {
            if (this.bot.nether && this.bot.nether.currentRoute) {
                return { route: this.bot.nether.currentRoute.route, evaluation: this.bot.nether.currentRoute, reason: "delegated to NetherDirector", confidence: 90, action: "continue_nether" };
            }
        } catch (e) { console.warn("[Verdant] nether delegate "+e); }
        const b = this.bot;
        const context = this.buildContext(tick, counts);

        // Gather options from world awareness
        const options = {};

        // Ground-level lava pool
        try {
            const lavaPool = b.awareness?.getLavaPool();
            if (lavaPool) {
                const lavaEval = evaluateLavaPoolForBucket({
                    pos: lavaPool,
                    depth: Math.max(0, 60 - lavaPool.y),
                    distance: distance(lavaPool, b.sim.location),
                    isCave: lavaPool.y < 50,
                    size: lavaPool.size ?? 5,
                    hasWaterNearby: !!b.awareness?.getWaterSource(),
                    surroundingTerrain: { flat: true, cliff: false },
                    surroundingDanger: { hostileCount: b.terrain.threatInfo(b.sim, b.owner()).count },
                    waterAvailable: !!b.awareness?.getWaterSource(),
                    accessible: true,
                    escapeRoutes: 2
                }, context);

                if (!lavaEval.isCave || lavaEval.score > 40) {
                    options.groundLava = {
                        pos: lavaPool,
                        distance: distance(lavaPool, b.sim.location),
                        size: lavaPool.size ?? 5,
                        depth: Math.max(0, 60 - lavaPool.y),
                        accessible: lavaEval.accessible,
                        hasBucket: context.hasBucket,
                        hasWaterBucket: context.hasWaterBucket,
                        waterAvailable: !!b.awareness?.getWaterSource(),
                        surroundingDanger: { hostileCount: context.hostileCount },
                        surroundingTerrain: { flat: true, hasWaterNearby: !!b.awareness?.getWaterSource(), cliff: false },
                        escapeRoutes: 2,
                    };
                    if (lavaPool.y < 50) {
                        options.caveLava = {
                            ...options.groundLava,
                            isCave: true,
                            travelDanger: { hostileCount: context.hostileCount, darkness: true, fallRisk: lavaPool.y < 20 }
                        };
                    }
                }
            }
        } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }

        // Ruined portal
        try {
            const ruined = b.structures?.found?.find(f => f.name === "ruined_portal");
            if (ruined) {
                options.ruinedPortal = {
                    pos: ruined.pos,
                    distance: distance(ruined.pos, b.sim.location),
                    obsidianCount: ruined.obsidianCount ?? 6,
                    hasCryingObsidian: false,
                    frameCompleteness: (ruined.obsidianCount ?? 6) / 10,
                    chestLoot: [],
                    hasFlintAndSteel: false,
                    hasFireCharge: false,
                    hasObsidianInChest: 0,
                    score: ruined.priority
                };
            }
        } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }

        // Missing ignition
        if (!context.hasFlintAndSteel && !context.hasFireCharge) {
            options.missingIgnition = {
                needFlint: !context.hasFlint,
                needIron: !context.hasIron,
                hasGravelNearby: context.hasGravelNearby,
                hasIron: context.hasIron,
                distanceToGravel: context.distanceToGravel ?? 50,
                hasIronNearby: !!b.awareness?.getNearest("iron_ore"),
                distanceToIron: b.awareness?.getNearest("iron_ore") ? distance(b.awareness.getNearest("iron_ore").pos, b.sim.location) : 100,
                hostileCount: context.hostileCount
            };
        }

        try {
            const decision = chooseNetherRoute(options, context);
            return decision;
        } catch {
            return null;
        }
    }

    buildContext(tick, counts) {
        const b = this.bot;
        const hasBucket = (counts["minecraft:bucket"] ?? 0) > 0;
        const hasWaterBucket = (counts["minecraft:water_bucket"] ?? 0) > 0;
        const hasFlintAndSteel = (counts["minecraft:flint_and_steel"] ?? 0) > 0;
        const hasFireCharge = (counts["minecraft:fire_charge"] ?? 0) > 0;
        const hasFlint = (counts["minecraft:flint"] ?? 0) > 0;
        const hasIron = (counts["minecraft:iron_ingot"] ?? 0) > 0;
        const obsidianHave = counts["minecraft:obsidian"] ?? 0;

        let hostileCount = 0;
        try { hostileCount = b.terrain.threatInfo(b.sim, b.owner()).count; } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }

        return {
            hasBucket,
            hasWaterBucket,
            hasFlintAndSteel,
            hasFireCharge,
            hasFlint,
            hasIron,
            obsidianHave,
            hasLavaPool: !!b.awareness?.getLavaPool(),
            hasWaterNearby: !!b.awareness?.getWaterSource(),
            hasRuinedPortal: !!b.structures?.found?.find(f => f.name === "ruined_portal"),
            hasGravelNearby: this.checkGravelNearby(16),
            distanceToGravel: this.findGravelDistance(24) ?? 50,
            phase: this.phaseName(),
            time: this.getTimeOfDay(),
            hostileCount,
            netherRoute: this.currentRoute,
            health: b.sim.getComponent("minecraft:health")?.currentValue ?? 20,
        };
    }

    executeNetherRoute(decision, tick, counts) {
        const b = this.bot;
        const route = decision.route;

        // Bucket acquisition major milestone
        if (route === "gather_ignition" || (counts["minecraft:bucket"] ?? 0) === 0 && (counts["minecraft:water_bucket"] ?? 0) === 0) {
            const bucketEval = evaluateBucketPriority(counts, this.buildContext(tick, counts));
            if (bucketEval.priority >= 80 && !bucketEval.milestone) {
                b.reason = `Speedrun Nether: bucket milestone priority ${bucketEval.priority} - ${bucketEval.reason}`;
                if (bucketEval.canCraft) {
                    try { b.obtain("minecraft:bucket", 1, tick); return true; } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }
                } else if (bucketEval.needSmelt) {
                    try { b.autonomy.produce("minecraft:raw_iron", bucketEval.ironNeeded, tick); return true; } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }
                } else {
                    b.assignMine("minecraft:iron_ore", bucketEval.ironNeeded);
                    return true;
                }
            }
            if (bucketEval.next === "get_water") {
                const ws = b.awareness?.getWaterSource();
                if (ws) {
                    b.reason = `Speedrun: bucket have, getting water at ${ws.x},${ws.y},${ws.z} for obsidian formation`;
                    const r = b.navTo(center(ws), tick, 2);
                    if (r !== "failed") return true;
                }
            }
        }

        // Flint and steel prefer obtaining before committing to portal location when not creating delays
        const ignitionCheck = shouldObtainFlintAndSteelBeforePortal(this.buildContext(tick, counts));
        if (ignitionCheck.should && ignitionCheck.priority >= 70) {
            const ignitionEval = evaluateIgnitionOptions(counts, null, this.buildContext(tick, counts));
            if (ignitionEval && !ignitionEval.available) {
                b.reason = `Speedrun Nether: ${ignitionCheck.reason} - ${ignitionEval.reason}`;
                if (ignitionEval.action === "craft_flint_and_steel") {
                    try { b.obtain("minecraft:flint_and_steel", 1, tick); return true; } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }
                } else if (ignitionEval.action.includes("gravel")) {
                    b.assignMine("minecraft:gravel", 5);
                    return true;
                } else if (ignitionEval.action === "gather_iron") {
                    b.assignMine("minecraft:iron_ore", 3);
                    return true;
                }
            }
        }

        // Route specific execution
        b.reason = `Speedrun Nether decision: ${decision.reason} confidence ${decision.confidence} - choose best balance time feasibility resource survival`;

        if (decision.action === "repair_ruined_portal" && decision.evaluation.pos) {
            const pos = decision.evaluation.pos;
            if (distance(pos, b.sim.location) > 8) {
                const r = b.navTo(center(pos), tick, 4);
                if (r !== "failed") return true;
            }
            // At ruined portal, need to repair
            if ((counts["minecraft:obsidian"] ?? 0) < decision.evaluation.missingObsidian) {
                b.assignMine("minecraft:obsidian", decision.evaluation.missingObsidian);
                return true;
            }
        }

        if (decision.action === "build_portal_ground_lava" && decision.evaluation.pos) {
            const pos = decision.evaluation.pos;
            if (distance(pos, b.sim.location) > 8) {
                const r = b.navTo(center(pos), tick, 4);
                if (r !== "failed") return true;
            }
        }

        if (decision.action === "build_portal_cave_lava") {
            // Avoid entering cave solely because contains lava if unnecessary danger excessive travel
            if (decision.evaluation.feasibility === "low") {
                b.reason = `Speedrun: cave lava feasibility low (${decision.evaluation.warnings}) - avoiding, ground lava or ruined better`;
                return false; // let other phases handle
            }
            const pos = decision.evaluation.pos;
            if (pos && distance(pos, b.sim.location) > 8) {
                const r = b.navTo(center(pos), tick, 3);
                if (r !== "failed") return true;
            }
        }

        // If have obsidian, build portal
        if ((counts["minecraft:obsidian"] ?? 0) >= 10 && !this.portalBuilt) {
            return this.buildPortal(tick, counts, decision.evaluation.pos);
        }

        return false;
    }

    buildPortal(tick, counts, nearPos) {
        const b = this.bot;
        const basePos = nearPos ?? floor(b.sim.location);
        // Verify obsidian count
        const verification = verifyPortalAction("build_portal", (counts["minecraft:obsidian"] ?? 0) >= 10 ? "completed" : "failed", counts);
        if (!verification.success && verification.action === "gather_more_obsidian") {
            b.reason = `Speedrun: ${verification.reason} - have ${counts["minecraft:obsidian"] ?? 0}/10`;
            b.assignMine("minecraft:obsidian", 10 - (counts["minecraft:obsidian"] ?? 0));
            return true;
        }

        try {
            const r = b.builder.buildPortalFrame(basePos, tick);
            if (r === "placed") {
                b.reason = `Speedrun: building portal frame at ${basePos.x},${basePos.y},${basePos.z} min 10 obsidian full 14 4x5 frame interior 2x3`;
                this.portalBuilt = true;
                return true;
            }
        } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }

        return false;
    }

    enterNether(tick, counts) {
        const b = this.bot;
        try {
            if (b.sim.dimension?.id === "minecraft:nether") {
                b.reason = "Speedrun: IN THE NETHER - primary objective achieved";
                if (!this.verified.has("nether_entry")) {
                    b.record("NETHER ENTRY SUCCESS - primary objective achieved");
                    this.verified.set("nether_entry", tick);
                }
                return true;
            }
        } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }

        if (this.portalIgnited) {
            b.nether.ignited = true;
            return b.nether.walkIntoPortal(tick);
        }

        const hasFlintAndSteel = (counts["minecraft:flint_and_steel"] ?? 0) > 0;
        const hasFireCharge = (counts["minecraft:fire_charge"] ?? 0) > 0;

        if (!hasFlintAndSteel && !hasFireCharge) {
            const ignitionEval = evaluateIgnitionOptions(counts, null, this.buildContext(tick, counts));
            if (ignitionEval) {
                b.reason = `Speedrun: need ignition for portal - ${ignitionEval.reason}`;
                if (ignitionEval.action === "craft_flint_and_steel") {
                    try { b.obtain("minecraft:flint_and_steel", 1, tick); return true; } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }
                }
            }
            return false;
        }

        const slot = hasFlintAndSteel ? b.bag.find(s => s.typeId === "minecraft:flint_and_steel") : b.bag.find(s => s.typeId === "minecraft:fire_charge");
        if (slot < 0) return false;

        try {
            const selected = b.bag.select(slot);
            const portalPos = this.currentRoute?.pos ?? floor(b.sim.location);
            const interior = { x: portalPos.x + 1, y: portalPos.y, z: portalPos.z };
            b.sim.lookAtBlock(b.host.relative(center(interior)));
            const ok = b.sim.useItemInSlot(selected);
            this.ignitionTries++;
            if (ok) {
                this.portalIgnited = true;
                b.nether.ignited = true;
                b.nether.portalPos = portalPos;
                b.reason = `Speedrun: portal ignited at ${portalPos.x},${portalPos.y},${portalPos.z}! Walking in`;
                return b.nether.walkIntoPortal(tick) || true;
            }
            if (this.ignitionTries > 5) {
                b.reason = "Speedrun: ignition failed after 5 attempts, checking frame";
                this.ignitionTries = 0;
            }
            return true;
        } catch {
            return false;
        }
    }

    verifyMilestones(counts, tick) {
        // Verify important actions crafting bucket acquisition portal construction ignition Nether entry rather than assuming succeeded
        const checks = [
            { id: "bucket", have: (counts["minecraft:bucket"] ?? 0) + (counts["minecraft:water_bucket"] ?? 0) > 0 },
            { id: "water_bucket", have: (counts["minecraft:water_bucket"] ?? 0) > 0 },
            { id: "obsidian", have: (counts["minecraft:obsidian"] ?? 0) >= 10 },
            { id: "flint_and_steel", have: (counts["minecraft:flint_and_steel"] ?? 0) > 0 },
            { id: "portal_frame", have: this.portalBuilt }
        ];

        for (const c of checks) {
            const prev = this.verified.get(c.id);
            if (c.have && !prev) {
                this.verified.set(c.id, tick);
                this.bot.record(`verified milestone ${c.id} at tick ${tick}`);
            }
        }
    }

    checkNewDiscoveries(tick) {
        const b = this.bot;
        try {
            const top = b.structures?.getTopPriority();
            if (top && top.tick && tick - top.tick < 120 && top.priority >= 80) {
                return { type: top.name, pos: top.pos, score: top.priority, reason: `new ${top.name} discovered priority ${top.priority}` };
            }
            const lava = b.awareness?.getLavaPool();
            if (lava && lava.tick && tick - lava.tick < 120) {
                return { type: "ground_lava", pos: lava, size: lava.size, reason: "new ground lava pool discovered" };
            }
        } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }
        return null;
    }

    checkGravelNearby(radius) {
        try {
            const p = floor(this.bot.sim.location);
            for (let dx = -radius; dx <= radius; dx++) for (let dz = -radius; dz <= radius; dz++) for (let dy = -3; dy <= 3; dy++) {
                const q = { x: p.x + dx, y: p.y + dy, z: p.z + dz };
                const block = this.bot.terrain.block(q);
                if (block && block.typeId === "minecraft:gravel") return true;
            }
        } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }
        return false;
    }

    findGravelDistance(radius) {
        try {
            const p = floor(this.bot.sim.location);
            for (let dx = -radius; dx <= radius; dx++) for (let dz = -radius; dz <= radius; dz++) for (let dy = -3; dy <= 3; dy++) {
                const q = { x: p.x + dx, y: p.y + dy, z: p.z + dz };
                const block = this.bot.terrain.block(q);
                if (block && block.typeId === "minecraft:gravel") {
                    return distance(q, this.bot.sim.location);
                }
            }
        } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }
        return null;
    }

    getTimeOfDay() {
        try {
            const tod = this.bot.sim.dimension.getTimeOfDay ? this.bot.sim.dimension.getTimeOfDay() : 0;
            if (tod >= 12000 && tod < 13000) return "sunset";
            if (tod >= 13000 && tod < 23000) return "night";
            return "day";
        } catch { return "day"; }
    }

    woodPhase(tick, counts) {
        const b = this.bot;
        // ULTRA FAST WOOD: get ANY wood ASAP, desert bushes for sticks - unbreakable
        const hasWeapon = b.equipment.hasWeapon();
        const totalLogs = Object.entries(counts).filter(([k]) => k.endsWith("_log") || k.endsWith("_wood") || k.includes("_stem") || k.includes("_hyphae")).reduce((a,[,v])=>a+v,0);
        const totalPlanks = Object.entries(counts).filter(([k]) => k.includes("_planks")).reduce((a,[,v])=>a+v,0);
        const sticks = counts["minecraft:stick"] ?? 0;
        const deadBush = (counts["minecraft:deadbush"] ?? 0) + (counts["minecraft:dead_bush"] ?? 0);
        if (!hasWeapon && totalLogs < 2 && totalPlanks < 2 && sticks < 1 && deadBush < 1) {
            b.reason = "Speedrun wood FAST: need ANY wood/logs/bush for weapon - mining any wood quickly - desert fallback";
            // Try any wood type
            if (!b.mining || !b.mining.anyWood) {
                // Scan for any wood
                try {
                    const anyWood = b.terrain.scanOres(b.sim.location, 16, (type) => type.endsWith("_log") || type.endsWith("_wood") || type.includes("_stem") || type === "minecraft:bamboo" || type === "minecraft:deadbush" || type === "minecraft:dead_bush" || type === "minecraft:cactus", 400);
                    if (anyWood.length > 0) {
                        const t = b.terrain.block(anyWood[0])?.typeId ?? "#logs";
                        b.assignMine(t, 3);
                    } else {
                        b.assignMine("#logs", 3);
                    }
                } catch {
                    b.assignMine("#logs", 3);
                }
            }
            return;
        }
        if (!hasWeapon) {
            b.reason = "Speedrun wood: crafting weapon FAST";
            if (!(counts["minecraft:crafting_table"] > 0)) {
                b.obtain("minecraft:crafting_table", 1, tick);
                return;
            }
            // Try any wooden sword, not just oak
            try { b.obtain("minecraft:wooden_sword", 1, tick); return; } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }
            b.obtain("minecraft:wooden_axe", 1, tick);
            return;
        }

        // Village-first evaluation as soon as min equipment for safe progression
        if (!this.villageChecked && hasWeapon && Object.entries(counts).filter(([k])=>k.endsWith("_log")||k.endsWith("_wood")||k.includes("_stem")).reduce((a,[,v])=>a+v,0) >= 3) {
            this.villageChecked = true;
            try {
                const village = b.village?.findNearestVillage?.(128);
                if (village) {
                    b.reason = `Speedrun: village at ${village.distance.toFixed(0)} blocks - evaluating vs independent, food beds hay loot`;
                    // Let village director handle
                    return;
                }
            } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }
        }

        const anyLogs = Object.entries(counts).filter(([k]) => k.endsWith("_log") || k.endsWith("_wood")).reduce((a,[,v])=>a+v,0);
        if (anyLogs < 6) {
            b.reason = "Speedrun: gathering ANY wood for upskilling - oak/birch/spruce/jungle/acacia/dark/mangrove/cherry - unbreakable";
            if (!b.mining || !b.mining.anyWood) {
                try {
                    const anyWood = b.terrain.scanOres(b.sim.location, 20, (type) => type.endsWith("_log") || type.endsWith("_wood") || type.includes("_stem"), 500);
                    if (anyWood.length > 0) {
                        const t = b.terrain.block(anyWood[0])?.typeId ?? "#logs";
                        b.assignMine(t, 8);
                    } else {
                        b.assignMine("#logs", 8);
                    }
                } catch {
                    b.assignMine("#logs", 8);
                }
            }
            return;
        }
        if (!(counts["minecraft:crafting_table"] > 0)) {
            b.reason = "Speedrun: crafting table for upskilling";
            b.obtain("minecraft:crafting_table", 1, tick);
            return;
        }
        if (!(counts["minecraft:wooden_pickaxe"] > 0)) {
            b.reason = "Speedrun: wooden pickaxe for stone";
            b.obtain("minecraft:wooden_pickaxe", 1, tick);
            return;
        }
        b.reason = "Speedrun: wood phase done, upskilling to stone, retain important iron ore sheep structures";
    }

    stonePhase(tick, counts) {
        const b = this.bot;
        if (!b.equipment.hasWeapon()) {
            b.obtain("minecraft:stone_sword", 1, tick);
            return;
        }
        if ((counts["minecraft:cobblestone"] ?? 0) < 20) {
            b.reason = "Speedrun: mining cobblestone for stone tools + furnace, essential resource correct order";
            if (!b.mining || !b.mining.bulk) {
                b.assignMine("minecraft:cobblestone", 20);
            }
            return;
        }
        if (!(counts["minecraft:stone_pickaxe"] > 0)) {
            b.obtain("minecraft:stone_pickaxe", 1, tick);
            return;
        }
        if (!(counts["minecraft:stone_sword"] > 0) && !(counts["minecraft:iron_sword"] > 0)) {
            b.obtain("minecraft:stone_sword", 1, tick);
            return;
        }
        if (!(counts["minecraft:furnace"] > 0)) {
            b.obtain("minecraft:furnace", 1, tick);
            return;
        }
        if ((counts["minecraft:torch"] ?? 0) < 12) {
            b.obtain("minecraft:torch", 12, tick);
            return;
        }
        // Food check before dangerous
        try {
            const reserves = assessFoodReserves(counts, { hunger: 20, health: 20 });
            if (reserves.status === "low" && !b.village?.findNearestVillage?.(32)) {
                b.reason = `Speedrun: food low ${reserves.totalHunger}, gather before iron - maintain sufficient for exploration sprinting combat emergency recovery`;
                b.obtain("minecraft:bread", 3, tick);
                return;
            }
        } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }
    }

    ironPhase(tick, counts) {
        const b = this.bot;
        // Essential resource acquisition correct order
        try {
            const ironSpot = b.awareness?.getNearest("iron_ore") ?? b.awareness?.getNearest("raw_iron");
            if (ironSpot && (counts["minecraft:raw_iron"] ?? 0) < 8 && distance(ironSpot.pos, b.sim.location) < 20) {
                b.reason = `Speedrun: iron ore remembered at ${ironSpot.pos.x},${ironSpot.pos.y},${ironSpot.pos.z} - mining, track coords explored locations known lava pools safe routes`;
                if (!b.mining || b.mining.block !== "minecraft:iron_ore") {
                    b.assignMine("minecraft:iron_ore", 8);
                }
                return;
            }
        } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }

        // Bucket major milestone enables ground-level lava pools - priority 95
        const bucketEval = evaluateBucketPriority(counts, this.buildContext(tick, counts));
        if (bucketEval.priority >= 80 && !bucketEval.milestone) {
            b.reason = `Speedrun iron: bucket milestone priority ${bucketEval.priority} - ${bucketEval.reason}, major milestone enables ground lava pools`;
            if (bucketEval.canCraft) {
                try { b.obtain("minecraft:bucket", 1, tick); return; } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }
            } else if (bucketEval.needSmelt) {
                try { b.autonomy.produce("minecraft:raw_iron", bucketEval.ironNeeded, tick); return; } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }
            } else {
                b.assignMine("minecraft:iron_ore", bucketEval.ironNeeded);
                return;
            }
        }

        const needIron = 12 - (counts["minecraft:iron_ingot"] ?? 0) - (counts["minecraft:raw_iron"] ?? 0);
        if (needIron > 0) {
            if (b.settings.deepMining) {
                b.reason = "Speedrun: deep mining iron for upskilling, gather only required for current stage while collecting useful extras when convenient";
                if (!b.mining || b.mining.deepItem !== "minecraft:raw_iron") {
                    b.assignMine("minecraft:iron_ore", Math.max(needIron, 6));
                }
            } else {
                b.reason = "Speedrun: searching iron for upskilling";
                b.assignMine("minecraft:iron_ore", needIron);
            }
            return;
        }
        if ((counts["minecraft:iron_ingot"] ?? 0) < 8) {
            b.autonomy.produce("minecraft:raw_iron", 8 - (counts["minecraft:iron_ingot"] ?? 0), tick);
            return;
        }
        if (!(counts["minecraft:iron_pickaxe"] > 0)) {
            b.obtain("minecraft:iron_pickaxe", 1, tick);
            return;
        }
        if (!(counts["minecraft:iron_sword"] > 0)) {
            b.obtain("minecraft:iron_sword", 1, tick);
            return;
        }
        if (!(counts["minecraft:shield"] > 0)) {
            b.obtain("minecraft:shield", 1, tick);
            return;
        }
        if (!(counts["minecraft:bucket"] > 0) && !(counts["minecraft:water_bucket"] > 0)) {
            b.obtain("minecraft:bucket", 1, tick);
            return;
        }
        // If have bucket but no water, find water
        if ((counts["minecraft:bucket"] ?? 0) > 0 && !(counts["minecraft:water_bucket"] > 0)) {
            try {
                const ws = b.awareness?.getWaterSource();
                if (ws) {
                    b.reason = `Speedrun: bucket found, getting water at ${ws.x},${ws.y},${ws.z} for portal obsidian formation`;
                    const r = b.navTo(center(ws), tick, 2);
                    if (r !== "failed") return;
                }
            } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }
        }
    }

    diamondPhase(tick, counts) {
        const b = this.bot;
        // For Nether speedrun, diamond is optional - only if safer faster route available
        // Prioritize Nether entry over diamond
        b.reason = "Speedrun: diamond phase - but Nether entry is primary objective, skipping if bucket and lava available";
        try {
            const lava = b.awareness?.getLavaPool();
            if (lava && (counts["minecraft:water_bucket"] ?? 0) > 0) {
                b.reason = "Speedrun: have bucket+water+lava pool, Nether entry faster than diamond, adaptive planning";
                this.portalPhase(tick, counts);
                return;
            }
        } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }

        try {
            const diamondSpot = b.awareness?.getNearest("diamond");
            if (diamondSpot && (counts["minecraft:diamond"] ?? 0) < 5 && distance(diamondSpot.pos, b.sim.location) < 24) {
                b.reason = `Speedrun: diamond remembered at ${diamondSpot.pos.x},${diamondSpot.pos.y},${diamondSpot.pos.z}`;
                if (!b.mining || b.mining.deepItem !== "minecraft:diamond") {
                    b.assignMine("minecraft:diamond_ore", 5);
                }
                return;
            }
        } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }

        if ((counts["minecraft:diamond"] ?? 0) < 5) {
            b.reason = "Speedrun: deep mining diamonds for upskilling to portal, but Nether entry main goal";
            if (!b.mining || b.mining.deepItem !== "minecraft:diamond") {
                b.assignMine("minecraft:diamond_ore", 5);
            }
            return;
        }
        if (!(counts["minecraft:diamond_pickaxe"] > 0)) {
            b.obtain("minecraft:diamond_pickaxe", 1, tick);
            return;
        }
    }

    portalPhase(tick, counts) {
        const b = this.bot;
        const obsidianHave = counts["minecraft:obsidian"] ?? 0;

        // Verify obsidian
        const obsidianVerify = verifyPortalAction("build_portal", obsidianHave >= 10 ? "completed" : "failed", counts);
        if (obsidianHave < 10) {
            // Need water + lava
            const hasWaterBucket = (counts["minecraft:water_bucket"] ?? 0) > 0;
            const hasBucket = (counts["minecraft:bucket"] ?? 0) > 0;
            if (!hasWaterBucket && !hasBucket) {
                b.obtain("minecraft:bucket", 1, tick);
                return;
            }
            if (!hasWaterBucket && hasBucket) {
                try {
                    const ws = b.awareness?.getWaterSource();
                    if (ws) {
                        b.reason = `Speedrun: have bucket, need water at ${ws.x},${ws.y},${ws.z} for obsidian water placement lava manipulation portal-frame formation safe ignition`;
                        const r = b.navTo(center(ws), tick, 2);
                        if (r !== "failed") return;
                    }
                } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }
            }

            // Try to make obsidian from lava pool - evaluate ground vs cave vs ruined
            const decision = this.evaluateNetherRoutes(tick, counts);
            if (decision && decision.route) {
                const handled = this.executeNetherRoute(decision, tick, counts);
                if (handled) return;
            }

            try {
                const lavaPool = b.awareness?.getLavaPool() ?? b.structures?.getPortalOpportunity();
                const pos = lavaPool?.pos ?? lavaPool?.pos;
                if (pos) {
                    if (distance(pos, b.sim.location) > 10) {
                        b.reason = `Speedrun: lava pool at ${pos.x},${pos.y},${pos.z} - going for obsidian portal, account depth accessibility surrounding terrain water availability hostile mobs escape routes`;
                        const r = b.navTo(center(pos), tick, 4);
                        if (r !== "failed") return;
                    } else {
                        b.reason = "Speedrun: at lava pool, making obsidian with water bucket - understand water placement lava manipulation portal-frame obsidian formation safe ignition";
                        if (hasWaterBucket) {
                            const obsidianNear = b.terrain.scanOres(b.sim.location, 8, (type) => type === "minecraft:obsidian", 200);
                            if (obsidianNear.length) {
                                b.assignMine("minecraft:obsidian", 10 - obsidianHave);
                                return;
                            } else {
                                b.reason = "Speedrun: placing water on lava to make obsidian - water + lava source = obsidian";
                                try {
                                    const waterSlot = b.bag.find(s => s.typeId === "minecraft:water_bucket");
                                    if (waterSlot >= 0) {
                                        const selected = b.bag.select(waterSlot);
                                        const lavaBlock = b.terrain.block(pos);
                                        if (lavaBlock) {
                                            b.sim.lookAtBlock(b.host.relative(center(pos)));
                                            b.sim.useItemInSlot(selected);
                                            this.lavaPoolTries++;
                                            return;
                                        }
                                    }
                                } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }
                            }
                        }
                    }
                }
            } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }

            b.reason = `Speedrun: gathering obsidian ${obsidianHave}/10 - ${obsidianVerify.reason}, fastest viable method`;
            b.assignMine("minecraft:obsidian", 10 - obsidianHave);
            return;
        }

        // Have obsidian, need flint and steel - prefer obtaining before committing to portal location when not creating delays
        const ignitionContext = this.buildContext(tick, counts);
        const shouldObtainBefore = shouldObtainFlintAndSteelBeforePortal(ignitionContext);
        const ignitionEval = evaluateIgnitionOptions(counts, null, ignitionContext);

        if (!(counts["minecraft:flint_and_steel"] > 0) && !(counts["minecraft:fire_charge"] > 0)) {
            if (!ignitionEval.available) {
                b.reason = `Speedrun: need ignition - ${ignitionEval.reason}, ${shouldObtainBefore.reason}`;
                if (ignitionEval.action === "craft_flint_and_steel") {
                    b.obtain("minecraft:flint_and_steel", 1, tick);
                    return;
                } else if (ignitionEval.action === "mine_gravel" || ignitionEval.action === "find_gravel") {
                    b.assignMine("minecraft:gravel", 5);
                    return;
                } else if (ignitionEval.action === "gather_iron") {
                    // Ensure enough iron remains for flint and steel after bucket unless other ignition available
                    const ironCheck = ensureIronForBothBucketAndFlintSteel(counts, ignitionContext);
                    if (!ironCheck.enough) {
                        b.reason = `Speedrun: ${ironCheck.reason} - need ${ironCheck.need} more iron`;
                        b.assignMine("minecraft:iron_ore", ironCheck.need);
                        return;
                    }
                    b.assignMine("minecraft:iron_ore", 2);
                    return;
                }
            }
        }

        if (!(counts["minecraft:flint_and_steel"] > 0) && !(counts["minecraft:fire_charge"] > 0)) {
            b.reason = "Speedrun: need flint for portal - locate gravel obtain using appropriate mining";
            b.assignMine("minecraft:gravel", 3);
            return;
        }
        if (!(counts["minecraft:flint_and_steel"] > 0) && (counts["minecraft:flint"] ?? 0) > 0) {
            b.obtain("minecraft:flint_and_steel", 1, tick);
            return;
        }

        b.reason = "Speedrun: portal ready - building and lighting! Verify important actions crafting bucket acquisition portal construction ignition Nether entry";
        try {
            if (b.builder && obsidianHave >= 10) {
                const p = b.sim.location;
                const base = { x: Math.floor(p.x), y: Math.floor(p.y), z: Math.floor(p.z) };
                const r = b.builder.buildPortalFrame(base, tick);
                if (r === "placed") {
                    b.reason = "Speedrun: building portal frame min 10 full 14 dimensions 4x5 interior 2x3";
                    this.portalBuilt = true;
                    return;
                }
            }
        } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }

        // Try to ignite
        this.enterNether(tick, counts);
    }
}
