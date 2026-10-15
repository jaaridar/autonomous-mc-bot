/**
 * Structure detector - runtime that prioritizes loot from structures.
 * Lava pool -> portal logic included. Main priority if found.
 */
import { floor, add, distance, key, UP, DOWN, CARDINAL } from "../core/math.js";
import { STRUCTURE_SIGS, detectStructure } from "../core/knowledge.js";
import { shouldLootChest } from "../core/loot.js";

export class StructureDetector {
    constructor(bot) {
        this.bot = bot;
        this.sim = bot.sim;
        this.terrain = bot.terrain;
        this.bag = bot.bag;
        this.memory = bot.memory;

        this.lastScan = 0;
        this.found = []; // {name, pos, priority, loot, reason, portal, tick}
        this.lavaPools = []; // {pos, size, tick}
        this.portalCandidates = []; // potential portal builds
        this.lootQueue = []; // chests to loot sorted by priority
    }

    reset() {
        this.found = [];
        this.lavaPools = [];
        this.portalCandidates = [];
        this.lootQueue = [];
    }

    tick(tick) {
        // ROBUST QUICK: scan every 40 ticks not 80 for faster structure detection, especially when food low
        const interval = (() => {
            try {
                const hunger = this.bot.sim.getComponent("minecraft:player.hunger")?.currentValue ?? 20;
                if (hunger <= 10) return 20; // food low, scan faster
            } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }
            return 40;
        })();
        if (tick - this.lastScan < interval) return;
        this.lastScan = tick;
        this.scan(tick);
        try { this.scanEntities(tick); } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }
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

    scan(tick) {
        const origin = floor(this.sim.location);
        const blockCounts = {};
        const chestPositions = [];
        const lavaPositions = [];
        const obsidianPositions = [];
        const scanR = 20;

        let budget = 400;
        for (let dx = -scanR; dx <= scanR && budget > 0; dx++) {
            for (let dz = -scanR; dz <= scanR && budget > 0; dz++) {
                if (dx*dx + dz*dz > scanR*scanR) continue;
                for (let dy = -6; dy <= 6 && budget > 0; dy++) {
                    budget--;
                    const p = add(origin, { x: dx, y: dy, z: dz });
                    const b = this.terrain.block(p);
                    if (!b || b.isAir) continue;
                    blockCounts[b.typeId] = (blockCounts[b.typeId] ?? 0) + 1;
                    if (b.typeId === "minecraft:chest" || b.typeId === "minecraft:trapped_chest" || b.typeId === "minecraft:barrel") {
                        chestPositions.push({ ...p, type: b.typeId });
                    }
                    if (b.typeId === "minecraft:lava" || b.typeId === "minecraft:flowing_lava") {
                        lavaPositions.push({ ...p });
                    }
                    if (b.typeId === "minecraft:obsidian" || b.typeId === "minecraft:crying_obsidian") {
                        obsidianPositions.push({ ...p });
                    }
                }
            }
        }

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
    }

    clusterCenter(positions) {
        let x=0,y=0,z=0;
        for (const p of positions) { x+=p.x; y+=p.y; z+=p.z; }
        return { x: Math.floor(x/positions.length), y: Math.floor(y/positions.length), z: Math.floor(z/positions.length) };
    }

    // Main priority if structure found
    getTopPriority() {
        if (!this.found.length) return null;
        const sorted = [...this.found].sort((a,b) => b.priority - a.priority);
        return sorted[0];
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
