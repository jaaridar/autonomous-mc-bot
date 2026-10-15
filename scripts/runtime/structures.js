/**
 * Structure detector - runtime that prioritizes loot from structures.
 * Lava pool -> portal logic included. Main priority if found.
 */
import { floor, add, distance, key, UP, DOWN, CARDINAL } from "../core/math.js";
import { STRUCTURE_SIGS, detectStructure } from "../core/knowledge.js";
import { shouldLootChest } from "../core/loot.js";

/**
 * The cells one sweep examines: the first 400 cells, in the original raster
 * order, of the r=20 / dy -6..6 cylinder - exactly the set the old one-shot
 * loop visited before its budget ran out. Precomputed once.
 */
const SWEEP = (() => {
    const out = [], R = 20;
    for (let dx = -R; dx <= R && out.length < 400; dx++)
        for (let dz = -R; dz <= R && out.length < 400; dz++) {
            if (dx * dx + dz * dz > R * R) continue;
            for (let dy = -6; dy <= 6 && out.length < 400; dy++) out.push({ x: dx, y: dy, z: dz });
        }
    return out;
})();
/** Sweep is time-sliced into this many parts so no single tick pays for all of it. */
const SLICES = 4;

export class StructureDetector {
    constructor(bot) {
        this.bot = bot;
        this.sim = bot.sim;
        this.terrain = bot.terrain;
        this.bag = bot.bag;
        this.memory = bot.memory;

        this.lastScan = 0;
        this.sweep = undefined; // in-progress sliced sweep
        this.found = []; // {name, pos, priority, loot, reason, portal, tick}
        this.lavaPools = []; // {pos, size, tick}
        this.portalCandidates = []; // potential portal builds
        this.lootQueue = []; // chests to loot sorted by priority
    }

    reset() {
        this.sweep = undefined;
        this.found = [];
        this.lavaPools = [];
        this.portalCandidates = [];
        this.lootQueue = [];
    }

    tick(tick) {
        // One sweep per 40 ticks (20 when food is low), delivered as SLICES
        // slices every 10 (5) ticks. Hunger comes from the bot's per-tick
        // cache: it used to be a component read on every single tick.
        const hunger = (this.bot.hunger ? this.bot.hunger() : this.bot.sim.getComponent("minecraft:player.hunger")?.currentValue) ?? 20;
        const interval = hunger <= 10 ? 20 : 40;
        const step = interval / SLICES;
        if (tick % step !== 5 % step) return; // phase 5 (of 10): staggered against the other directors
        this.lastScan = tick;
        if (this.scan(tick)) {
            try { this.scanEntities(tick); } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }
        }
    }

    scanEntities(tick) {
        // ROBUST: Detect village via entities, not just blocks - critical for village priority when food low
        try {
            const entities = this.sim.dimension.getEntities({ location: this.sim.location, maxDistance: 48 });
            let villagerCount = 0;
            let villagerPos = null;
            let golemPos = null;
            for (const e of entities) {
                if (e.typeId === "minecraft:villager" || e.typeId === "minecraft:villager_v2") {
                    villagerCount++;
                    if (!villagerPos) villagerPos = { x: Math.floor(e.location.x), y: Math.floor(e.location.y), z: Math.floor(e.location.z) };
                }
                if (e.typeId === "minecraft:iron_golem") {
                    golemPos = { x: Math.floor(e.location.x), y: Math.floor(e.location.y), z: Math.floor(e.location.z) };
                }
            }
            if (villagerCount >= 1) {
                const pos = villagerPos ?? golemPos ?? { x: Math.floor(this.sim.location.x), y: Math.floor(this.sim.location.y), z: Math.floor(this.sim.location.z) };
                if (!this.found.some(f => f.name === "village" && distance(f.pos, pos) < 24)) {
                    this.found.push({ name: "village", pos, priority: 95, loot: ["food","bed","hay","chest","iron"], reason: "village detected via villagers for food priority", portal: false, tick, matches: villagerCount });
                    this.bot.record(`Structure: village via entities count ${villagerCount} at ${pos.x},${pos.y},${pos.z}`);
                }
            }
            // Also detect ruined portal via chest + obsidian entities? Already via blocks
        } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }
    }

    /**
     * Advance the sliced sweep by one slice; returns true when a sweep just
     * completed (detection ran). Cell reads use the terrain's cached type
     * snapshot (1 typeId read per new cell) instead of 3-7 live reads.
     */
    scan(tick) {
        let sw = this.sweep;
        if (!sw) sw = this.sweep = { origin: floor(this.sim.location), i: 0, blockCounts: {}, chestPositions: [], lavaPositions: [], obsidianPositions: [] };
        const { origin, blockCounts, chestPositions, lavaPositions, obsidianPositions } = sw;
        const end = Math.min(SWEEP.length, sw.i + Math.ceil(SWEEP.length / SLICES));
        for (; sw.i < end; sw.i++) {
            const o = SWEEP[sw.i];
            const p = { x: origin.x + o.x, y: origin.y + o.y, z: origin.z + o.z };
            const t = this.terrain.typeSurvey ? this.terrain.typeSurvey(p) : this.terrain.type(p);
            if (!t || t === "minecraft:air") continue;
            blockCounts[t] = (blockCounts[t] ?? 0) + 1;
            if (t === "minecraft:chest" || t === "minecraft:trapped_chest" || t === "minecraft:barrel") {
                chestPositions.push({ ...p, type: t });
            }
            if (t === "minecraft:lava" || t === "minecraft:flowing_lava") {
                lavaPositions.push({ ...p });
            }
            if (t === "minecraft:obsidian" || t === "minecraft:crying_obsidian") {
                obsidianPositions.push({ ...p });
            }
        }
        if (sw.i < SWEEP.length) return false;
        this.sweep = undefined;
        const scanR = 20;

        // Detect structures
        const detected = detectStructure(blockCounts, scanR);
        for (const d of detected) {
            // Find pos: nearest chest or relevant block
            let pos = origin;
            if (d.name === "lava_pool" && lavaPositions.length) {
                pos = lavaPositions[0];
            } else if (chestPositions.length) {
                pos = chestPositions[0];
            }
            // Check if already known
            const existing = this.found.find(f => f.name === d.name && distance(f.pos, pos) < 12);
            if (!existing) {
                this.found.push({ name: d.name, pos, priority: d.priority, loot: d.loot, reason: d.reason, portal: d.portal ?? false, tick, matches: d.matches });
                if (this.found.length > 20) this.found.shift();
            }
        }

        // Lava pool analysis for portal
        if (lavaPositions.length >= 5) {
            // Cluster lava positions
            const center = this.clusterCenter(lavaPositions);
            const size = lavaPositions.length;
            const existing = this.lavaPools.find(lp => distance(lp.pos, center) < 10);
            if (!existing) {
                this.lavaPools.push({ pos: center, size, tick, lavaPositions });
                if (this.lavaPools.length > 10) this.lavaPools.shift();
            } else {
                existing.size = Math.max(existing.size, size);
                existing.tick = tick;
            }
            // If have water bucket, this is portal opportunity
            const hasWater = this.bag.find(s => s.typeId === "minecraft:water_bucket") >= 0;
            const hasBucket = this.bag.find(s => s.typeId === "minecraft:bucket") >= 0;
            if (hasWater || hasBucket) {
                const candidate = {
                    type: "lava_pool_portal",
                    pos: center,
                    size,
                    priority: 100,
                    reason: hasWater ? "lava pool + water bucket = obsidian portal" : "lava pool + bucket, get water for portal",
                    hasWater,
                    tick
                };
                if (!this.portalCandidates.some(pc => distance(pc.pos, center) < 12)) {
                    this.portalCandidates.push(candidate);
                }
            }
        }

        // Ruined portal = free obsidian
        if (obsidianPositions.length >= 2) {
            const center = this.clusterCenter(obsidianPositions);
            if (!this.found.some(f => f.name === "ruined_portal" && distance(f.pos, center) < 16)) {
                this.found.push({ name: "ruined_portal", pos: center, priority: 100, loot: ["obsidian","gold","chest"], reason: "free obsidian for portal", portal: true, tick, matches: obsidianPositions.length });
            }
        }

        // Build loot queue: sort chests by structure priority
        this.lootQueue = chestPositions.map(cp => {
            // Find nearest structure
            let struct = null, bestD = Infinity;
            for (const f of this.found) {
                const d = distance(f.pos, cp);
                if (d < bestD && d < 24) { bestD = d; struct = f; }
            }
            const priority = struct ? struct.priority : 70;
            const home = this.bot.home();
            const homeDist = home ? distance(cp, home) : 100;
            const freeSlots = this.bag.container.emptySlotsCount;
            const should = shouldLootChest(distance(cp, this.sim.location), homeDist, freeSlots);
            return { pos: cp, priority, should, structure: struct?.name, dist: distance(cp, this.sim.location) };
        }).filter(q => q.should).sort((a,b) => b.priority - a.priority || a.dist - b.dist);
        return true;
    }

    clusterCenter(positions) {
        let x=0,y=0,z=0;
        for (const p of positions) { x+=p.x; y+=p.y; z+=p.z; }
        return { x: Math.floor(x/positions.length), y: Math.floor(y/positions.length), z: Math.floor(z/positions.length) };
    }

    // Main priority if structure found
    getTopPriority() {
        // Highest priority, earliest found on ties (same as the stable sort it replaces) - no copy+sort per call.
        let best = null;
        for (const f of this.found) if (!best || f.priority > best.priority) best = f;
        return best;
    }

    getLootTarget() {
        return this.lootQueue[0] ?? null;
    }

    getPortalOpportunity() {
        if (!this.portalCandidates.length) {
            // Also check lavaPools directly
            if (!this.lavaPools.length) return null;
            const hasWater = this.bag.find(s => s.typeId === "minecraft:water_bucket") >= 0;
            if (!hasWater) return null;
            const best = [...this.lavaPools].sort((a,b) => b.size - a.size || distance(a.pos, this.sim.location) - distance(b.pos, this.sim.location))[0];
            return { type: "lava_pool_portal", pos: best.pos, size: best.size, priority: 100, reason: "lava pool portal", hasWater: true };
        }
        const sorted = [...this.portalCandidates].sort((a,b) => b.priority - a.priority);
        return sorted[0];
    }

    // Build portal from lava pool
    buildPortalFromLava(lavaPos, tick) {
        // Need water bucket
        const waterSlot = this.bag.find(s => s.typeId === "minecraft:water_bucket");
        if (waterSlot < 0) return { result: "no_water", reason: "need water bucket" };

        // Strategy: find flat area near lava pool, place water to make obsidian
        // Then mine obsidian and build portal
        // This is high-level, actual building done by builder
        return { result: "ready", reason: "water bucket + lava pool, can make obsidian", need: "water_bucket" };
    }

    // Score for whether to prioritize structure loot over current task
    shouldInterruptForLoot(currentPriority) {
        const top = this.getTopPriority();
        if (!top) return false;
        if (top.priority >= 95 && currentPriority < 90) return true; // village, ruined portal, lava pool
        if (top.priority >= 85 && currentPriority < 70) return true;
        return false;
    }

    summary() {
        return {
            structures: this.found.map(f => ({ name: f.name, priority: f.priority, pos: `${f.pos.x},${f.pos.y},${f.pos.z}` })),
            lavaPools: this.lavaPools.length,
            portalCandidates: this.portalCandidates.length,
            lootQueue: this.lootQueue.length
        };
    }
}
