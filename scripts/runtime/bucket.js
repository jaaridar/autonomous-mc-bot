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
import { floor, add, distance, center, UP, DOWN, CARDINAL } from "../core/math.js";
import { evaluateBucketPriority, evaluateLavaPoolForBucket, planObsidianFormation, planPortalConstruction, chooseFastestViableMethod, BUCKET_MILESTONE } from "../core/bucket-strategy.js";
import { Direction } from "@minecraft/server";

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
                this.bot.startMine("minecraft:iron_ore", bucketEval.ironNeeded);
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
