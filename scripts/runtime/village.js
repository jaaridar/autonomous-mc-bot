// One module now: runtime/village.js + runtime/golem.js (see docs/ARCHITECTURE.md).
import { CARDINAL, DOWN, add, center, distance, floor } from "../core/math.js";
import { GOLEM_STATS, chooseBestGolemStrategy, evaluateGolemFight, evaluateVillage, evaluateVillageVsNetherRoute, shouldCraftBedIndependently, shouldDisengageDuringFight } from "../core/village.js";
import { bedTarget } from "../core/recipes.js";
import { timeOfDay, weaponTierLoose } from "./world.js";

// ---------------------------------------------------------------- structures

/**
 * Village discovery ladder.
 *
 * Primary (what Mojang provides): Dimension.getGeneratedStructures(location)
 * - script module 2.4.0-beta / Bedrock 1.21.120+. It reports every generated
 * structure (villages included) whose footprint contains the sample point, so
 * a hit IS a village, not a hunch. The bot walks a coarse grid of sample
 * points outward from its position across successive search cycles.
 *
 * Secondary (engines without that binding): the seed-derived search -
 * Dimension.calculateClosestBiomeFromSeed(location, biome[, options]) from
 * module 2.9.0, or the identical idea under its older name Dimension.
 * findClosestBiome(biome, location?) on 2.3.0-beta..2.8.0-beta. That locates
 * the nearest village-capable biome PATCH, then the trip+sweep machinery
 * below looks for the actual village once the patch is reached.
 *
 * (/locate chat output is not readable from scripts on any version, so a
 * runCommand-based finder is deliberately not part of this ladder.)
 */
const VILLAGE_BIOMES = [
    "minecraft:plains", "minecraft:sunflower_plains", "minecraft:desert",
    "minecraft:savanna", "minecraft:savanna_plateau", "minecraft:taiga",
    "minecraft:snowy_plains", "minecraft:snowy_taiga",
];
/** Mojang-sensitive sample set (getGeneratedStructures): id pick. */
const VILLAGE_ID = /village/i; // matches minecraft:village, village_plains, ... (not pillager)
const BIOME_SEARCH_EVERY = 600; // ticks between heavy structure/biome searches
const BIOME_LEAD_TTL = 6000; // a cached lead expires after ~5 minutes
const BIOME_LEAD_MIN = 56; // closer than this = already in/near that spot, detection owns it
const BIOME_LEAD_ARRIVED = 20; // inside this radius the located spot counts as reached
const BIOME_LEAD_SPENT_TTL = 6000; // do not re-target a spent patch for ~5 minutes
const BIOME_SWEEP_TICKS = 4000; // after arrival: hold the gate and sweep this long

// Sample grid for getGeneratedStructures probes (primary finder on 1.21.120+).
const PROBE_STEP = 64; // grid pitch; village footprints span dozens of blocks
const PROBE_RADIUS_MAX = 384; // outward growth cap (~6 rings of 44 cells)
const PROBES_PER_SCAN = 10; // sample points evaluated per search cycle
const PROBE_MISS_TTL = 43200; // a missed cell is trusted for ~36 in-game minutes
const PROBE_DISABLE_FAILS = 8; // consecutive sample exceptions -> probes off, biome search on

// Village raid schedule: the raid is due as soon as the tools exist; if the
// bot has been busy (deep mining, smelting) the five-minute cap forces the
// trip regardless. "Forced but unreachable" only unlocks deep mining again
// after a longer grace so the bot can never be deadlocked by a phantom village.
const VILLAGE_RAID_DEADLINE = 6000; // 5 minutes -> raid becomes overdue/forced
const VILLAGE_RAID_GRACE = 6000; // overdue + this with zero progress -> give up

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
        // Village-first planning: the first looted trip unlocks autonomous deep
        // mining, and a known-but-unreached village holds new deep shafts back.
        this.visited = false;
        this.firstTripGivenUp = false;
        this.forced = false;
        this._firstTripAt = 0;
        this._golemSeen = undefined;
        this.nearest = null;
        // Script-API "locate" state: nearest village-capable biome patch and
        // the post-arrival sweep that searches it (see locateVillageBiome).
        this.biomeLead = null;
        this.biomeLeadTick = -99999;
        this._spentLeads = new Map();
        this.biomeSweep = null;
        this.sweepUntil = 0;
        // getGeneratedStructures probe state (primary finder on 1.21.120+).
        this._probes = new Map(); // "gx,gz" -> tick when the miss cache expires
        this._probeRadius = PROBE_STEP; // outward growth of the sample annulus
        this._probeFails = 0; // consecutive probe exceptions on this engine
    }

    reset(tick) {
        this.currentVillage = null;
        this.foodOptions = [];
        this.bedPos = null;
    }

    tick(tick) {
        if (this.currentVillage) {
            const context = this.buildContext(tick);
            const dist = distance(this.currentVillage.pos, this.sim.location);
            this.currentVillage.distance = dist;
            const res = this.executeVillageRun(this.currentVillage, null, tick, context);
            if (res) return true;
            this.currentVillage = null;
        }

        if (tick - this.lastScan < 120) return false;
        this.lastScan = tick;

        const context = this.buildContext(tick);
        const village = this.findNearestVillage(128, tick);

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
                    const bed = bedTarget(this.bag.counts());
                    if (bed) { try { this.bot.obtain(bed, 1, tick); return true; } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); } }
                }
            }
            return false;
        }

        // Script-API "locate" fallback: no village SEEN yet, but a
        // village-capable biome patch was located - head straight there
        // (and once there, sweep it) instead of wandering.
        if (village.biomeLead) return this.biomeTrip(village, tick);

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
            this.currentVillage = village;
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
        const isWood = (k) => k.endsWith("_log") || k.endsWith("_wood") || k.includes("_stem") || k.includes("_hyphae") || k === "minecraft:bamboo_block";
        const hasWood = Object.entries(counts).filter(([k])=>isWood(k)).reduce((a,[,v])=>a+v,0) >= 3;
        const hasStone = (counts["minecraft:cobblestone"] ?? 0) >= 8;
        const hasFood = Object.keys(counts).some(k => k.includes("bread") || k.includes("cooked_") || k.includes("potato") || k.includes("carrot"));
        const foodAmount = Object.entries(counts).filter(([k]) => k.includes("bread") || k.includes("cooked_") || k.includes("potato") || k.includes("carrot")).reduce((sum, [,v]) => sum + v, 0);
        const hasBed = Object.keys(counts).some(k => k.endsWith("_bed") || k === "minecraft:bed");
        const hasWool = Object.keys(counts).some(k => k.includes("_wool"));
        const woolCount = Object.entries(counts).filter(([k]) => k.includes("_wool")).reduce((sum, [,v]) => sum + v, 0);
        const woodCount = Object.entries(counts).filter(([k])=>isWood(k)||k.endsWith("_planks")).reduce((a,[,v])=>a+v,0);
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

    findNearestVillage(radius, tick = 0) {
        // Record the freshest sighting for the village-first gate; the body
        // stays in _findNearestVillage.
        let v = this._findNearestVillage(radius);
        if (!v) {
            // Nothing SEEN yet: use the locate ladder (Mojang structure probe,
            // else the seed-derived biome patch) as the target.
            const lead = this.locateVillageBiome(tick);
            if (lead) v = { pos: lead.pos, distance: distance(lead.pos, this.sim.location), biome: lead.biome, biomeLead: true };
        }
        if (!v && tick > 0 && this.biomeSweep) {
            if (tick >= this.sweepUntil) { this.biomeSweep = null; this.sweepUntil = 0; }
            else v = { pos: this.biomeSweep.pos, distance: distance(this.biomeSweep.pos, this.sim.location), biome: this.biomeSweep.biome, biomeLead: true, sweep: true };
        }
        this.nearest = v && v.pos ? v : null;
        return v;
    }

    /**
     * Village "locate": the best current answer to "where is a village?".
     * 1. Mojang's structure locator (getGeneratedStructures) on a coarse,
     *    outward-growing grid - a hit IS a generated village.
     * 2. Seed-derived biome patch (calculateClosestBiomeFromSeed from 2.9.0,
     *    else findClosestBiome on 2.3.0-beta..2.8.0-beta engines) - a capacity
     *    hunch that the trip+sweep machinery verifies on the ground.
     * The call is heavy, so the ladder runs at most every BIOME_SEARCH_EVERY
     * ticks; the freshest lead is cached in between and biomeTrip() drives
     * the bot to it.
     */
    locateVillageBiome(tick) {
        if (this.biomeSweep) {
            if (tick > 0 && tick >= this.sweepUntil) { this.biomeSweep = null; this.sweepUntil = 0; }
            else return null; // while sweeping, hold the gate - no new searches
        }
        if (this.biomeLead && tick > 0 && tick - this.biomeLead.tick > BIOME_LEAD_TTL) this.biomeLead = null;
        if (tick <= 0) return this.biomeLead;
        if (tick - this.biomeLeadTick < BIOME_SEARCH_EVERY) return this.biomeLead;
        this.biomeLeadTick = tick;
        const best = this.probeGeneratedStructures(tick) ?? this.findBiomeLead(tick);
        this.biomeLead = best;
        if (best) this.bot.record?.(`Village locate: ${best.biome.replace("minecraft:", "")} is ${Math.round(best.dist)} blocks away at ${Math.round(best.pos.x)},${Math.round(best.pos.y)},${Math.round(best.pos.z)} - heading straight there`);
        if (this._spentLeads.size > 64) this._spentLeads.delete(this._spentLeads.keys().next().value);
        return best;
    }

    /**
     * One probe cycle of Mojang's structure locator: walk the annulus for the
     * current radius (innermost ring first), sample PROBES_PER_SCAN fresh
     * cells against dimension.getGeneratedStructures, negative-cache misses
     * so no cell is re-sampled inside PROBE_MISS_TTL, then widen the net.
     */
    probeGeneratedStructures(tick) {
        const dim = this.sim.dimension;
        const get = dim?.getGeneratedStructures;
        if (typeof get !== "function" || this._probeFails >= PROBE_DISABLE_FAILS)
            return null; // API absent (pre-1.21.120 engine) or proven unusable
        const origin = floor(this.sim.location);
        let lead = null;
        for (let n = 0; n < PROBES_PER_SCAN && !lead; n++) {
            const cell = this.nextProbeCell(origin, tick);
            if (!cell) {
                // Whole annulus sampled or negative-cached: widen the net and
                // give this cycle's remaining budget back to the next one.
                if (this._probeRadius < PROBE_RADIUS_MAX) this._probeRadius += PROBE_STEP;
                break;
            }
            const p = { x: cell.x * PROBE_STEP, y: 64, z: cell.z * PROBE_STEP };
            let ids;
            try { ids = get.call(dim, p); this._probeFails = 0; }
            catch {
                // Sample point is not queryable (usually an unloaded chunk):
                // neither a miss nor a hit, and a run of failures disables the
                // probes outright so the biome search takes over.
                if (++this._probeFails >= PROBE_DISABLE_FAILS)
                    this.bot.record?.(`Village locate: Mojang locator unusable after ${this._probeFails} bad calls; biome search takes over`);
                continue;
            }
            const hit = (Array.isArray(ids) ? ids : []).find((s) =>
                typeof s === "string" && VILLAGE_ID.test(s));
            if (hit)
                lead = { pos: p, biome: hit, dist: distance(p, this.sim.location), tick, fails: 0, probe: true };
            else
                this._probes.set(cell.key, tick + PROBE_MISS_TTL);
        }
        // Miss-cache hygiene: trim the oldest entries once oversized.
        if (this._probes.size > 512) {
            const drop = this._probes.size - 384;
            let dropped = 0;
            for (const k of this._probes.keys()) { this._probes.delete(k); if (++dropped >= drop) break; }
        }
        return lead;
    }

    /** Next grid vertex to sample: ring surfaces only, skipping fresh misses. */
    nextProbeCell(origin, tick) {
        const ex = Math.floor(origin.x / PROBE_STEP);
        const ez = Math.floor(origin.z / PROBE_STEP);
        const r = Math.max(1, Math.round(this._probeRadius / PROBE_STEP));
        for (let ring = 1; ring <= r; ring++) {
            for (let dx = -ring; dx <= ring; dx++) {
                for (let dz = -ring; dz <= ring; dz++) {
                    if (Math.abs(dx) !== ring && Math.abs(dz) !== ring)
                        continue; // ring surface only - interior rings were walked
                    const key = `${ex + dx},${ez + dz}`;
                    if ((this._probes.get(key) ?? 0) > tick)
                        continue; // recent miss
                    return { x: ex + dx, z: ez + dz, key };
                }
            }
        }
        return null;
    }

    /**
     * Secondary finder: closest village-capable biome patch via the seed.
     * calculateClosestBiomeFromSeed (2.9.0+) samples (location, biome); the
     * older findClosestBiome (2.3.0-beta..2.8.0-beta) samples (biome, location)
     * - the order switched with the rename, matching neither order was why the
     * old call silently returned nothing here.
     */
    findBiomeLead(tick) {
        const dim = this.sim.dimension;
        const from = floor(this.sim.location);
        let best = null;
        for (const biome of VILLAGE_BIOMES) {
            let p;
            try {
                p = typeof dim?.calculateClosestBiomeFromSeed === "function"
                    ? dim.calculateClosestBiomeFromSeed(from, biome)
                    : (typeof dim?.findClosestBiome === "function" ? dim.findClosestBiome(biome, from) : undefined);
            }
            catch { p = undefined; }
            if (!p || !Number.isFinite(p.x)) continue;
            const d = distance(p, this.sim.location);
            if (d < BIOME_LEAD_MIN) continue; // already in/near it - detection owns it
            const k = `${Math.floor(p.x / 64)},${Math.floor(p.z / 64)}`;
            if ((this._spentLeads.get(k) ?? 0) > tick) continue; // patch recently checked out
            if (!best || d < best.dist) best = { pos: { x: p.x, y: p.y, z: p.z }, biome, dist: d, tick, fails: 0 };
        }
        return best;
    }

    /** Spend a biome lead (patch reached / unroutable): ignore that patch a while. */
    spendBiomeLead(tick, reason, sweep = false) {
        const lead = this.biomeLead;
        this.biomeLead = null;
        if (!lead) return;
        const k = `${Math.floor(lead.pos.x / 64)},${Math.floor(lead.pos.z / 64)}`;
        this._spentLeads.set(k, tick + BIOME_LEAD_SPENT_TTL);
        if (sweep) { this.biomeSweep = { pos: lead.pos, biome: lead.biome }; this.sweepUntil = tick + BIOME_SWEEP_TICKS; }
        if (reason) this.bot.record?.(`Village locate: ${reason}`);
    }

    /** Head straight for the located biome patch; on arrival, sweep it. */
    biomeTrip(lead, tick) {
        const name = lead.biome.replace("minecraft:", "");
        const d = distance(lead.pos, this.sim.location);
        if (lead.sweep) {
            // Arrived: hold around the located spot while the sighting sweep
            // (awareness rays + Explorer) looks for the actual village.
            if (tick >= this.sweepUntil) { this.biomeSweep = null; this.sweepUntil = 0; return false; }
            this.bot.reason = `Village: sweeping the ${name} biome for the village (${Math.round(d)} blocks off the located spot)`;
            if (d < 10) return false; // sitting on it - keep eyes open
            return this.bot.navTo(center(lead.pos), tick, 4) !== "failed";
        }
        if (d < BIOME_LEAD_ARRIVED) {
            this.spendBiomeLead(tick, `reached the ${name} biome; sweeping it for the village`, true);
            return false;
        }
        this.bot.reason = `Village lead: heading to the ${name} biome ${Math.round(d)} blocks at ${Math.round(lead.pos.x)},${Math.round(lead.pos.z)}`;
        const r = this.bot.navTo(center(lead.pos), tick, 4);
        if (r !== "failed") return true;
        const canon = this.biomeLead;
        if (canon) {
            canon.fails = (canon.fails ?? 0) + 1;
            if (canon.fails > 20) this.spendBiomeLead(tick, "biome patch unreachable; dropping that lead");
        }
        return false;
    }

    /**
     * True while the first village raid is still owed: a village is known,
     * none has been looted yet, and the errand is inside the forced window.
     * Survival holds new deep shafts while this is true, and after
     * VILLAGE_RAID_DEADLINE the raid is FORCED (see overdue): the rule is
     * "deep mining can wait, but after 5 minutes go to the village at any how".
     */
    pendingFirstTrip(tick = 0) {
        if (this.visited || this.firstTripGivenUp) return false;
        if (!this.nearest) return false;
        this.overdue(tick);
        if (this.forced && this._firstTripAt && tick - this._firstTripAt > VILLAGE_RAID_DEADLINE + VILLAGE_RAID_GRACE) {
            this.firstTripGivenUp = true;
            this.bot.record?.("Village raid unreachable inside the forced window; deep mining allowed again");
            return false;
        }
        return true;
    }

    /**
     * True once the raid is overdue: a village is known, none has been
     * looted, and the trip was deferred longer than the five-minute cap.
     * The survival branch forces the raid on this flag and the deep-shaft
     * gate keeps refusing new shafts - "after 5 minutes go at any how".
     */
    overdue(tick = 0) {
        if (this.visited || this.firstTripGivenUp) return false;
        if (!this.nearest) return false;
        if (!this._firstTripAt) this._firstTripAt = tick;
        if (!this.forced && this._firstTripAt && tick - this._firstTripAt > VILLAGE_RAID_DEADLINE) {
            this.forced = true;
            this.bot.record?.(`Village raid overdue (${Math.round(VILLAGE_RAID_DEADLINE / 1200)} min): forcing the trip - golem, chests, food`);
        }
        return this.forced;
    }

    _findNearestVillage(radius) {
        // Fast path: check awareness, structures, and memory first (bounded, cheap)
        try {
            const candidates = [];
            for (const v of (this.bot.awareness?.villageSpots ?? [])) {
                candidates.push(v);
            }
            for (const f of (this.bot.structures?.found ?? [])) {
                if (f.name === "village" && f.pos) candidates.push(f.pos);
            }
            // memory.knownSpots never existed; ofKind is the real persistent-memory
            // reader and village spots are persisted now.
            for (const s of (this.memory?.ofKind?.("village", this.sim.dimension.id) ?? [])) {
                const pos = s?.pos ?? s;
                if (pos && Number.isFinite(pos.x)) candidates.push(pos);
            }
            if (candidates.length) {
                candidates.sort((a, b) => distance(a, this.sim.location) - distance(b, this.sim.location));
                const best = candidates[0];
                const dist = distance(best, this.sim.location);
                if (dist <= radius) {
                    return {
                        pos: best,
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

        // Scan for villagers - limited radius 48 for performance, not full 128.
        // Filtered to the villager family so the common case (nothing around)
        // does not fetch every sheep, pig and ghost in the query volume.
        try {
            const scanRadius = Math.min(radius, 48);
            const entities = this.sim.dimension.getEntities({ location: this.sim.location, maxDistance: scanRadius, families: ["villager"] });
            let villagerCount = 0;
            let villagerPos = null;
            let golemFound = false;
            for (const e of entities) {
                if (e.typeId === "minecraft:villager" || e.typeId === "minecraft:villager_v2") {
                    villagerCount++;
                    if (!villagerPos) villagerPos = floor(e.location);
                }
            }
            if (villagerCount >= 2 || villageScore >= 3) {
                // Golems stand inside villages: only pay the second query when a
                // village context is already confirmed.
                try { golemFound = this.sim.dimension.getEntities({ location: this.sim.location, maxDistance: scanRadius, type: "minecraft:iron_golem" }).length > 0; } catch { golemFound = false; }
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
                    hasGolem: golemFound,
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
        // Village leads now come from locateVillageBiome(): Mojang's
        // getGeneratedStructures when present, else the seed-derived biome
        // search. There is no /locate-based path - its chat output is not
        // readable from scripts on any engine version.
        return null;
    }

    executeVillageRun(village, villageEval, tick, context) {
        const dist = village.distance;

        if (dist > 8) {
            const r = this.bot.navTo(center(village.pos), tick, 4);
            if (r !== "failed") {
                this.bot.reason = `Village: travelling to village at ${village.pos.x},${village.pos.y},${village.pos.z} (${dist.toFixed(0)}b) - golem, stores, food, beds`;
                return true;
            }
        }

        // 0. Iron golem: the raid's main prize (3-5 ingots fund the bucket).
        //    The golem director always keeps its safety checks; the raid flag
        //    only drops the soft "iron is available elsewhere" out.
        if (this.bot.settings.defend && this.bot.golem) {
            const golem = this.bot.golem.findGolemNearby(24);
            if (golem) {
                this._golemSeen = { pos: floor(golem.location), tick };
                if (this.bot.golem.tick(tick, true)) return true;
            } else if (this._golemSeen && tick - this._golemSeen.tick < 1800) {
                // It went down: sweep its drops before moving on - nothing
                // valuable despawns on this bot's watch.
                if (this.sweepDrops(tick, "minecraft:iron_ingot", this._golemSeen.pos, 12)) return true;
                this._golemSeen = undefined;
            }
        }

        // At village: prioritize harvesting hay bales for abundant food (bread), looting chests, and beds
        // 1. Food: hay bales -> wheat -> bread (best efficiency)
        if (context.foodAmount < 16) {
            const hayPos = this.findHayBaleNearby(this.sim.location, 24) ?? this.findHayBaleNearby(village.pos, 24);
            if (hayPos) {
                const distHay = distance(this.sim.location, center(hayPos));
                if (distHay <= 4.5) {
                    this.bot.reason = `Village: harvesting hay bale at ${hayPos.x},${hayPos.y},${hayPos.z} for bread`;
                    this.bot.breakThrough(hayPos);
                    // Craft wheat into bread if held
                    const counts = this.bag.counts();
                    if ((counts["minecraft:hay_block"] ?? 0) > 0) {
                        try { this.bot.craft("minecraft:wheat", (counts["minecraft:hay_block"] ?? 0) * 9); } catch (_) {}
                    }
                    if ((counts["minecraft:wheat"] ?? 0) >= 3) {
                        try { this.bot.craft("minecraft:bread", Math.floor((counts["minecraft:wheat"] ?? 0) / 3)); } catch (_) {}
                    }
                    return true;
                }
                const r = this.bot.navTo(center(hayPos), tick, 2);
                if (r !== "failed") {
                    this.bot.reason = `Village: heading to hay bale at ${hayPos.x},${hayPos.y},${hayPos.z} for bread`;
                    return true;
                }
            }
        }

        // 2. Loot EVERY chest in the village. lootChest() drains a chest and
        //    ignores it afterwards, so repeated sweeps walk chest to chest
        //    until the stores are empty (or the bag is full) - not just the
        //    first one found.
        const structChest = this.bot.structures?.getLootTarget();
        if (structChest && distance(structChest.pos, this.sim.location) <= 32 && distance(structChest.pos, this.sim.location) > 3.5) {
            const r = this.bot.navTo(center(structChest.pos), tick, 2);
            if (r !== "failed") {
                this.bot.reason = `Village: approaching the ${structChest.name ?? "structure"} chest at ${structChest.pos.x},${structChest.pos.y},${structChest.pos.z}`;
                return true;
            }
        }
        if (this.bot.looting?.tick(tick)) return true;

        // 3. Beds: identify, sleep if night, or take one for camping
        const bedPos = this.findBedNearby(this.sim.location, 20) ?? this.findBedNearby(village.pos, 24);
        if (bedPos) {
            const distBed = distance(bedPos, this.sim.location);
            if (context.time === "sunset" || context.time === "night") {
                if (distBed <= 3.5 && tick - this.lastBedUse > 100) {
                    try {
                        this.sim.lookAtBlock(this.bot.host.relative(center(bedPos)));
                        this.sim.useItemInSlotOnBlock(this.bag.select(0), this.bot.host.relative(center(bedPos)), 1);
                        this.lastBedUse = tick;
                        this.bedPos = bedPos;
                    } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }
                    this.bot.reason = `Village: sleeping in bed at ${bedPos.x},${bedPos.y},${bedPos.z} to skip night`;
                    return true;
                }
                const r = this.bot.navTo(center(bedPos), tick, 2);
                if (r !== "failed") {
                    this.bot.reason = `Village: heading to bed at ${bedPos.x},${bedPos.y},${bedPos.z} to sleep`;
                    return true;
                }
            } else if (!Object.keys(this.bag.counts()).some(k => k.endsWith("_bed") || k === "minecraft:bed") && this.bot.settings.camp) {
                // Daytime and no bed carried: take one for portable night camping
                if (distBed <= 4) {
                    this.bot.reason = `Village: claiming bed at ${bedPos.x},${bedPos.y},${bedPos.z} for night shelter`;
                    this.bot.breakThrough(bedPos);
                    return true;
                }
                const r = this.bot.navTo(center(bedPos), tick, 2);
                if (r !== "failed") {
                    this.bot.reason = `Village: heading to bed at ${bedPos.x},${bedPos.y},${bedPos.z}`;
                    return true;
                }
            }
        }

        // 3b. Iron bucket: 3 ingots, however they arrived (golem or chests).
        //     Place a table if the village has none in reach first.
        const counts = this.bag.counts();
        if ((counts["minecraft:iron_ingot"] ?? 0) >= 3 && !context.hasBucket && this.bot.settings.assistedCrafting) {
            if (!this.terrain.tableNear(this.sim.location)) {
                const tableSlot = this.bag.find((s) => s.typeId === "minecraft:crafting_table");
                if (tableSlot < 0) {
                    this.bot.reason = "Village raid: getting a crafting table for the bucket";
                    try { this.bot.obtain("minecraft:crafting_table", 1, tick); } catch (e) { this.bot.record?.("Village raid: table obtain failed - " + String(e?.message ?? e).slice(0, 80)); }
                    return true;
                }
                const p = floor(this.sim.location);
                let placedTable = false;
                for (const d of CARDINAL) {
                    const spot = add(p, d);
                    if (this.terrain.block(spot)?.isAir && this.terrain.solid(add(spot, DOWN))) {
                        if (this.bot.builder.placeAt(spot, add(spot, DOWN), { autoAnchor: true, blockType: "minecraft:crafting_table" }) === "placed") { placedTable = true; break; }
                    }
                }
                this._tableTries = placedTable ? 0 : (this._tableTries ?? 0) + 1;
                if (this._tableTries > 80) { this._tableTries = 0; return false; } // no spot here: let the sweep continue
                return true;
            }
            try {
                this.bot.craft("minecraft:bucket", 1);
                this.bot.reason = `Village raid: iron bucket crafted (${(this.bag.counts()["minecraft:iron_ingot"] ?? 0)} iron left in the bag)`;
                this.bot.record?.("Village raid: crafted the iron bucket");
                return true;
            } catch (e) {
                this.bot.record?.("Village raid: bucket craft failed - " + String(e?.message ?? e).slice(0, 80));
            }
        }

        // 4. Craft wheat to bread if still holding wheat
        if ((counts["minecraft:wheat"] ?? 0) >= 3) {
            try { this.bot.craft("minecraft:bread", Math.floor((counts["minecraft:wheat"] ?? 0) / 3)); } catch (_) {}
        }

        this.villageTrips++;
        this.visited = true;
        this.firstTripGivenUp = false;
        return false;
    }

    /** Walk onto a recent golem/chest drop pile until the engine collects it. */
    sweepDrops(tick, item, pos, radius = 8) {
        const b = this.bot;
        const e = b.drops?.near?.({ item }, pos, radius, tick);
        if (!e) return false;
        this.bot.reason = `Village: collecting the golem's ${item.replace("minecraft:", "")} drops`;
        const r = b.navTo(e.location, tick, 1);
        if (r === "failed" || r === "blocked") b.drops.pushToward?.(e.location, 1.05);
        return true;
    }

    findHayBaleNearby(villagePos, radius = 24) {
        if (!this.terrain?.scanOres) return null;
        const found = this.terrain.scanOres(villagePos, Math.min(radius, 24), (t) => t === "minecraft:hay_block", 200);
        return found.length > 0 ? found[0] : null;
    }

    findBedNearby(villagePos, radius = 24) {
        if (!this.terrain?.scanOres) return null;
        const found = this.terrain.scanOres(villagePos, Math.min(radius, 20), (t) => t === "minecraft:bed" || t.endsWith("_bed"), 200);
        return found.length > 0 ? found[0] : null;
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
        // The fight sneaks near the pillar edge ("avoid fall damage"); the
        // edge-sneak must not outlive the fight - a lingering sneak blocks
        // the next navigation jump.
        try { this.sim.isSneaking = false; } catch { /* best effort */ }
    }

    tick(tick, raid = false) {
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

        // A village raid actively wants the golem (3-5 ingots = the bucket):
        // it may ignore the SOFT "iron is available elsewhere" deductions,
        // but never the safety ones - a raid still walks away from a fight
        // the score rates as genuinely bad (low health / weak weapon / mobs).
        const softOut = context.saferFasterRouteAvailable || evaluation.alternative;
        const raidOk = raid && evaluation.score >= 30 && context.health > 12;
        if (!evaluation.shouldFight && !raidOk) {
            if (this.fightStage !== "idle") {
                this.bot.reason = `Golem: ${evaluation.reasons} - disengaging, ${evaluation.alternative}`;
                this.reset();
            }
            return false;
        }

        // Never mandatory if safer faster route available
        if (softOut && !raid) {
            this.bot.reason = `Golem: safer faster route available - ${evaluation.alternative}, skipping golem`;
            return false;
        }

        this.targetGolem = golem;

        // Reassess health positioning continuously
        if (tick - this.lastHealthCheck > 20) {
            this.lastHealthCheck = tick;
            let golemHp;
            try { golemHp = golem.getComponent("minecraft:health")?.currentValue; } catch {}
            const disengageCheck = shouldDisengageDuringFight({
                health: context.health,
                golemHealth: golemHp,
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
                let golemHp;
                try { golemHp = golem.getComponent("minecraft:health")?.currentValue; } catch {}
                this.bot.reason = `Golem: attacking from elevated position ${p.y - this.pillarPos.y} high, hits ${this.hits}, golem health ${golemHp ?? "unknown"}, avoid fall damage`;

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
        // found entries never carried hasChest - use the loot list. getNearest
        // spots carry pos, not `distance`.
        const hasVillageChestIron = this.bot.structures?.found?.some(f => f.name === "village" && (f.loot ?? []).includes("chest"));
        const nearIron = this.bot.awareness?.getNearest("iron_ore");

        if (hasIron) return true;
        if (hasVillageChestIron) return true;
        if (nearIron?.pos && distance(nearIron.pos, this.sim.location) < 24) return true;

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
