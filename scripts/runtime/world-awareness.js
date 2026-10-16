// One module now: runtime/world-awareness.js + runtime/structures.js (see docs/ARCHITECTURE.md).
import { STRUCTURE_SIGS, bridgingPlan, detectStructure, parkourPlan, prioritizeGoal, retainScore, scoreSurrounding, shouldLootChest } from "../core/knowledge.js";
import { add, distance, floor, key } from "../core/math.js";
import { RollingSweep } from "./world.js";

// ---------------------------------------------------------------- world-awareness.js

/**
 * World Awareness - runtime scanning of surroundings, remembering important stuff.
 * Knows every block/item, retains important, detects structures, lava pools, sheep, iron ore.
 * Main goal upskilling.
 */


export class WorldAwareness {
    constructor(bot) {
        this.bot = bot;
        this.sim = bot.sim;
        this.terrain = bot.terrain;
        this.bag = bot.bag;
        this.memory = bot.memory;

        this.lastScan = 0;
        this.surrounding = []; // scored list
        this.structures = [];
        this.importantSpots = new Map(); // key -> {type, pos, score, tick, retain}
        this.lavaPools = [];
        this.waterSources = [];
        this.sheepSpots = [];
        this.ironSpots = [];
        this.diamondSpots = [];
        this.chestSpots = [];
        this.villageSpots = [];
        // Grid-bucket Maps for O(1) proximity dedup inside scan callback
        this._lavaGrid     = new Map();
        this._waterGrid    = new Map();
        this._ironGrid     = new Map();
        this._diamondGrid  = new Map();
        this._chestGrid    = new Map();
        this._sheepGrid    = new Map();
        this._villageGrid  = new Map();

        this.scanRadius = 24;
        this.scanBudget = 400;
        // One shared, amortised sweep (radius 20, y-6..+6, 400 cached reads per
        // pass) feeds both this class and the StructureDetector.
        this.sweep = new RollingSweep(20, -6, 6, this.scanBudget, 24);
        this.acc = undefined;
    }

    reset() {
        this.surrounding = [];
        this.structures = [];
        this.importantSpots.clear();
        this.lavaPools = [];
        this.waterSources = [];
        this.sheepSpots = [];
        this.ironSpots = [];
        this.diamondSpots = [];
        this.chestSpots = [];
        this.villageSpots = [];
        // Grid-bucket Maps for O(1) proximity dedup inside scan callback
        this._lavaGrid     = new Map();
        this._waterGrid    = new Map();
        this._ironGrid     = new Map();
        this._diamondGrid  = new Map();
        this._chestGrid    = new Map();
        this._sheepGrid    = new Map();
        this._villageGrid  = new Map();
    }

    tick(tick) {
        if (tick - this.lastScan < 30) return; // amortised sweep step every 1.5 sec
        this.lastScan = tick;
        this.scan(tick);
        // Try /locate when permitted every 10 sec
        if (tick % 200 === 0) this.tryLocateStructures(tick);
        // Track coords explored locations known lava pools safe routes escape paths
        if (tick % 100 === 0) this.trackExplored(tick);
        // Detect cliffs drops lava water currents before movement
        if (tick % 60 === 0) this.scanHazards(tick);
    }

    tryLocateStructures(tick) {
        // The /locate command's output text is not readable from scripts, so this
        // never produced coordinates - skipped entirely (it cost 3 commands every
        // 10 seconds, including an invalid one, for zero information).
        return;
    }

    trackExplored(tick) {
        // Track coords explored locations known lava pools safe routes escape paths
        try {
            const pos = floor(this.sim.location);
            const k = key(pos);
            if (!this.explored) this.explored = new Map();
            if (!this.explored.has(k)) {
                this.explored.set(k, { pos: { ...pos }, tick, visited: 1 });
                // Keep size bounded
                if (this.explored.size > 500) {
                    const first = this.explored.keys().next().value;
                    this.explored.delete(first);
                }
            } else {
                const entry = this.explored.get(k);
                entry.visited++;
                entry.tick = tick;
            }
        } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }
    }

    scanHazards(tick) {
        // Reduced scan cube (±2,±3,±2 = 125 cells, was 441) and throttled to every 60 ticks.
        try {
            const p = floor(this.sim.location);
            const hazards = [];
            for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
                for (let dy = -3; dy <= 2; dy++) {
                    const q = { x: p.x + dx, y: p.y + dy, z: p.z + dz };
                    const c = this.terrain.read(q);
                    if (!c) continue;
                    const t = c.type;
                    if (t.includes("lava")) hazards.push({ type: "lava", pos: q, distance: distance(q, this.sim.location) });
                    if (t.includes("water") && t.includes("flowing")) hazards.push({ type: "water_current", pos: q, distance: distance(q, this.sim.location) });
                }
                // Cliff check: only once per xz column at dy=0
                const ground = { x: p.x + dx, y: p.y, z: p.z + dz };
                const a1 = this.terrain.read({ x: ground.x, y: ground.y - 1, z: ground.z });
                const a2 = this.terrain.read({ x: ground.x, y: ground.y - 2, z: ground.z });
                const a3 = this.terrain.read({ x: ground.x, y: ground.y - 3, z: ground.z });
                if ((!a1 || a1.isAir) && (!a2 || a2.isAir) && (!a3 || a3.isAir))
                    hazards.push({ type: "cliff", pos: ground, distance: distance(ground, this.sim.location) });
            }
            this.lastHazards = hazards.slice(0, 10);
        } catch (_) {}
    }

    scan(tick) {
        const origin = floor(this.sim.location);
        const here = this.sim.location;
        const structures = this.bot.structures;
        if (!this.acc || this.sweep.needsRestart(here)) {
            this.acc = { blockCounts: {}, distanceMap: {}, blockPositions: {} };
            try { structures?.beginSweep?.(origin, tick); } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }
        }
        const acc = this.acc;
        const blockCounts = acc.blockCounts;
        const entityCounts = {};

        // Helper: bucket a coordinate to a grid cell of size `sz`
        const bucket = (p, sz) => `${Math.floor(p.x/sz)},${Math.floor(p.y/sz)},${Math.floor(p.z/sz)}`;

        this.sweep.step(this.terrain, here, (type, p) => {
            const distanceMap = acc.distanceMap, blockPositions = acc.blockPositions;
            try { structures?.acceptCell?.(type, p, tick); } catch { /* best effort */ }
            blockCounts[type] = (blockCounts[type] ?? 0) + 1;
            if (distanceMap[type] === undefined) {
                distanceMap[type] = distance(p, here);
                blockPositions[type] = { ...p };
            } else {
                const d = distance(p, here);
                if (d < distanceMap[type]) { distanceMap[type] = d; blockPositions[type] = { ...p }; }
            }
            // O(1) proximity dedup via grid buckets
            if (type.includes("lava")) {
                const k = bucket(p, 6);
                if (!this._lavaGrid.has(k)) { this._lavaGrid.set(k, true); this.lavaPools.push({ ...p, tick }); if (this.lavaPools.length > 10) this.lavaPools.shift(); }
            }
            if (type.includes("water") && !type.includes("flowing")) {
                const k = bucket(p, 8);
                if (!this._waterGrid.has(k)) { this._waterGrid.set(k, true); this.waterSources.push({ ...p, tick }); if (this.waterSources.length > 10) this.waterSources.shift(); }
            }
            if (type.includes("iron_ore") || type.includes("raw_iron")) {
                const k = bucket(p, 4);
                if (!this._ironGrid.has(k)) { this._ironGrid.set(k, true); this.ironSpots.push({ ...p, tick, score: 95 }); this.rememberSpot("iron_ore", p, tick, 95); if (this.ironSpots.length > 20) this.ironSpots.shift(); }
            }
            if (type.includes("diamond_ore") || type === "minecraft:diamond_block") {
                const k = bucket(p, 6);
                if (!this._diamondGrid.has(k)) { this._diamondGrid.set(k, true); this.diamondSpots.push({ ...p, tick, score: 100 }); this.rememberSpot("diamond", p, tick, 100); if (this.diamondSpots.length > 20) this.diamondSpots.shift(); }
            }
            if (type === "minecraft:chest" || type === "minecraft:trapped_chest" || type === "minecraft:barrel" || type.includes("shulker_box")) {
                const k = bucket(p, 6);
                if (!this._chestGrid.has(k)) { this._chestGrid.set(k, true); this.chestSpots.push({ ...p, tick, score: 85, type }); this.rememberSpot("chest", p, tick, 85); if (this.chestSpots.length > 40) this.chestSpots.shift(); }
            }
            if (type === "minecraft:obsidian" || type === "minecraft:crying_obsidian") {
                this.rememberSpot("obsidian", p, tick, 95);
            }
        });
        // Per-pass copies: entity distances must not leak into the sweep accumulator.
        const distanceMap = { ...acc.distanceMap };
        const blockPositions = { ...acc.blockPositions }; // type -> nearest pos

        // Scan entities
        try {
            const entities = this.sim.dimension.getEntities({ location: this.sim.location, maxDistance: this.scanRadius });
            for (const e of entities) {
                if (!e.isValid) continue;
                const type = e.typeId;
                entityCounts[type] = (entityCounts[type] ?? 0) + 1;
                if (distanceMap[type] === undefined) {
                    distanceMap[type] = distance(e.location, this.sim.location);
                    blockPositions[type] = floor(e.location);
                }
            if (type === "minecraft:sheep") {
                    const sk = `${Math.floor(e.location.x/8)},${Math.floor(e.location.z/8)}`;
                    if (!this._sheepGrid.has(sk)) { this._sheepGrid.set(sk, true); this.sheepSpots.push({ ...floor(e.location), tick, entity: e, score: 85 }); this.rememberSpot("sheep", floor(e.location), tick, 85); }
                }
                if (type === "minecraft:village" || type.includes("villager") || type === "minecraft:iron_golem") {
                    const vk = `${Math.floor(e.location.x/16)},${Math.floor(e.location.z/16)}`;
                    if (!this._villageGrid.has(vk)) { this._villageGrid.set(vk, true); this.villageSpots.push({ ...floor(e.location), tick, score: 95 }); this.rememberSpot("village", floor(e.location), tick, 95); }
                }
            }
        } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }

        // Detect structures via block signatures
        const structs = detectStructure(blockCounts, this.scanRadius);
        // Enrich with pos
        for (const s of structs) {
            // Find nearest relevant block for pos
            let pos = null;
            for (const bType of STRUCTURE_SIGS[s.name]?.blocks ?? []) {
                if (blockPositions[bType]) { pos = blockPositions[bType]; break; }
            }
            s.pos = pos ?? { ...origin };
            s.tick = tick;
            // Remember critical structures
            if (s.priority >= 90) {
                this.rememberSpot(s.name, s.pos, tick, s.priority);
            }
        }
        this.structures = structs;
        this.surrounding = scoreSurrounding(blockCounts, entityCounts, distanceMap).map(item => ({
            ...item,
            pos: blockPositions[item.type] ?? null
        }));

        // Update importantSpots map
        for (const item of this.surrounding) {
            if (item.retain && item.score > 70) {
                const k = `${item.type}|${item.pos ? key(item.pos) : "unknown"}`;
                if (!this.importantSpots.has(k)) {
                    this.importantSpots.set(k, { ...item, tick, remembered: true });
                }
            }
        }

        // Clean old spots — evict the oldest entry (O(1)) instead of sort+spread.
        if (this.importantSpots.size > 100)
            this.importantSpots.delete(this.importantSpots.keys().next().value);
    }

    rememberSpot(kind, pos, tick, score) {
        try {
            // Map kind to memory spot kind
            const spotKind = kind === "chest" ? "chest" : kind === "village" ? "village" : kind;
            // Use existing memory if compatible, else store in importantSpots
            const k = `${kind}|${key(pos)}`;
            if (!this.importantSpots.has(k)) {
                this.importantSpots.set(k, { type: kind, pos: { ...pos }, tick, score, retain: score >= 80 });
            }
            // Also try to use persistent memory for known kinds
            if (["chest","crafting_table","furnace","bed","portal","village"].includes(spotKind)) {
                try { this.memory.notice(spotKind, pos, this.sim.dimension.id, tick); } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }
            }
        } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }
    }

    getGoals(hp, hunger, hasWeapon, phase) {
        const inv = this.bag.counts();
        return prioritizeGoal(inv, this.surrounding, this.structures, hp, hunger, hasWeapon, phase);
    }

    getNearest(typeSubstring) {
        let best = null, bestD = Infinity;
        for (const [k, v] of this.importantSpots) {
            if (v.type.includes(typeSubstring)) {
                const d = v.pos ? distance(v.pos, this.sim.location) : v.dist ?? 100;
                if (d < bestD) { bestD = d; best = v; }
            }
        }
        return best;
    }

    getLavaPool() {
        if (!this.lavaPools.length) return null;
        let best = null, bestD = Infinity;
        for (const lp of this.lavaPools) {
            const d = distance(lp, this.sim.location);
            if (d < bestD) { bestD = d; best = lp; }
        }
        return best;
    }

    getWaterSource() {
        if (!this.waterSources.length) return null;
        let best = null, bestD = Infinity;
        for (const ws of this.waterSources) {
            const d = distance(ws, this.sim.location);
            if (d < bestD) { bestD = d; best = ws; }
        }
        return best;
    }

    getStructureLootPriority() {
        // Return highest priority structure that has chests
        const sorted = [...this.structures].sort((a,b) => b.priority - a.priority);
        return sorted[0] ?? null;
    }

    // For bridging/parkour: analyze terrain to goal
    analyzePathTo(goal) {
        const from = floor(this.sim.location);
        const to = floor(goal);
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const dz = to.z - from.z;

        // Check obstructions
        const obstruct = this.terrain.findObstructions(from, to);
        const below = this.terrain.obstructionsBelow(this.sim.location, to);

        const bridge = bridgingPlan(from, to, { obstruct, below });
        const parkour = parkourPlan(from, to, { obstruct });

        return { bridge, parkour, obstruct, below, from, to, dx, dy, dz };
    }

    // Retain important stuff logic
    shouldKeep(typeId, count, freeSlots) {
        const score = retainScore(typeId);
        if (score >= 90) return true;
        if (score >= 80 && freeSlots > 1) return true;
        if (score >= 60 && freeSlots > 4) return true;
        if (score < 20) return false;
        return count < 64;
    }

    summary() {
        return {
            surrounding: this.surrounding.slice(0, 5),
            structures: this.structures.slice(0, 3),
            importantCount: this.importantSpots.size,
            lavaPools: this.lavaPools.length,
            ironSpots: this.ironSpots.length,
            diamondSpots: this.diamondSpots.length,
            sheepSpots: this.sheepSpots.length,
            chestSpots: this.chestSpots.length
        };
    }
}

// ---------------------------------------------------------------- structures.js

/**
 * Structure detector - runtime that prioritizes loot from structures.
 * Lava pool -> portal logic included. Main priority if found.
 */


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
        this.acc = undefined;  // per-sweep accumulator fed by WorldAwareness' shared sweep
        this.ownSweep = undefined; // fallback when no awareness sweep is running
        this.fedTick = -1000;
    }

    /** Called by WorldAwareness when its shared sweep restarts. Chests near the new origin carry over. */
    beginSweep(origin, tick) {
        const keep = (this.acc?.chests ?? []).filter((c) => distance(c, origin) <= 24);
        this.acc = { blockCounts: {}, chests: keep, lava: [], obsidian: [], seen: new Set(keep.map((c) => key(c))) };
        this.fedTick = tick ?? this.fedTick;
    }

    /** One non-air cell from the shared sweep. */
    acceptCell(type, p, tick) {
        const a = this.acc ?? (this.beginSweep(floor(this.sim.location)), this.acc);
        a.blockCounts[type] = (a.blockCounts[type] ?? 0) + 1;
        if (type === "minecraft:chest" || type === "minecraft:trapped_chest" || type === "minecraft:barrel") {
            const k = key(p);
            if (!a.seen.has(k)) { a.seen.add(k); a.chests.push({ ...p, type }); }
        } else if (type === "minecraft:lava" || type === "minecraft:flowing_lava") {
            if (a.lava.length < 256) a.lava.push({ ...p });
        } else if (type === "minecraft:obsidian" || type === "minecraft:crying_obsidian") {
            if (a.obsidian.length < 256) a.obsidian.push({ ...p });
        }
        if (tick !== undefined) this.fedTick = tick;
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
            if (villagerCount >= 1 || golemPos) {
                const pos = villagerPos ?? golemPos ?? { x: Math.floor(this.sim.location.x), y: Math.floor(this.sim.location.y), z: Math.floor(this.sim.location.z) };
                if (!this.found.some(f => f.name === "village" && distance(f.pos, pos) < 24)) {
                    this.found.push({ name: "village", pos, priority: 95, loot: ["food","bed","hay","chest","iron"], reason: "village detected via villagers for food priority", portal: false, tick, matches: villagerCount || 1 });
                    this.bot.record(`Structure: village via entities count ${villagerCount || 1} at ${pos.x},${pos.y},${pos.z}`);
                }
            }
            // Also detect ruined portal via chest + obsidian entities? Already via blocks
        } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }
    }

    scan(tick) {
        const origin = floor(this.sim.location);
        const scanR = 20;
        // Blocks come from the shared amortised sweep in WorldAwareness. If that
        // has not fed us recently (awareness disabled/faulting), run our own.
        if (tick - this.fedTick > 200) {
            this.ownSweep ??= new RollingSweep(scanR, -6, 6, 300, 24);
            if (!this.acc || this.ownSweep.needsRestart(this.sim.location)) this.beginSweep(origin, this.fedTick);
            this.ownSweep.step(this.terrain, this.sim.location, (type, p) => this.acceptCell(type, p));
        }
        if (!this.acc) return;
        const blockCounts = this.acc.blockCounts;
        const chestPositions = this.acc.chests.slice().sort((a, b) => distance(a, origin) - distance(b, origin));
        const lavaPositions = this.acc.lava;
        const obsidianPositions = this.acc.obsidian;

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
