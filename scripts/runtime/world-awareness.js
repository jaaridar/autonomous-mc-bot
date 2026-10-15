/**
 * World Awareness - runtime scanning of surroundings, remembering important stuff.
 * Knows every block/item, retains important, detects structures, lava pools, sheep, iron ore.
 * Main goal upskilling.
 */
import { floor, add, distance, key, UP, DOWN, CARDINAL, COMPASS } from "../core/math.js";
import { scoreSurrounding, prioritizeGoal, bridgingPlan, parkourPlan, planDeathRecovery } from "../core/world-awareness.js";
import { detectStructure, retainScore, isCritical, STRUCTURE_SIGS } from "../core/knowledge.js";
import { isPassable } from "../core/blocks.js";

/**
 * Cells one awareness sweep examines: the first 513 cells, in the original
 * raster order, of the r=24 / dy -8..8 cylinder - the exact set the old
 * one-shot loop reached before its budget check stopped it. Precomputed.
 */
const SWEEP = (() => {
    const out = [], R = 24, BUDGET = 512;
    for (let dx = -R; dx <= R; dx++)
        for (let dz = -R; dz <= R; dz++) {
            if (dx * dx + dz * dz > R * R) continue;
            for (let dy = -8; dy <= 8; dy++) {
                if (out.length > BUDGET) return out;
                out.push({ x: dx, y: dy, z: dz });
            }
        }
    return out;
})();
/** One sweep per 60 ticks, delivered in slices every 10 ticks. */
const SWEEP_TICKS = 60, SLICE_TICKS = 10;
const HAZARD_OFFSETS = [];
for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) for (let dy = -4; dy <= 2; dy++) HAZARD_OFFSETS.push({ x: dx, y: dy, z: dz });

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

        this.scanRadius = 24;
        this.scanBudget = 512;
        this.sweep = undefined;
    }

    reset() {
        this.sweep = undefined;
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
    }

    tick(tick) {
        // A full sweep every 3 s as before, but sliced across 10-tick steps so
        // no single tick pays for 513 cells plus an entity query.
        // Phase 2 of each 10-tick window (staggered against the other directors).
        if (tick % SLICE_TICKS !== 2) return;
        this.lastScan = tick;
        this.scan(tick);
        // Track coords explored locations known lava pools safe routes escape paths
        if (tick - (this.lastExplored ?? -1000) >= 100) { this.lastExplored = tick; this.trackExplored(tick); }
        // Detect cliffs drops lava water currents (write-only telemetry today: a
        // fixed 6 s cadence instead of whenever a scan tick happened to be %40)
        if (tick - (this.lastHazardScan ?? -1000) >= 120) { this.lastHazardScan = tick; this.scanHazards(tick); }
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
        // Detect cliffs drops lava water currents before movement, understand jumping sprint-jumping climbing swimming falling block placement safe traversal
        try {
            const here = this.sim.location;
            const p = floor(here);
            const hazards = [];
            const survey = (q) => (this.terrain.typeSurvey ? this.terrain.typeSurvey(q, 60) : this.terrain.type(q));
            const open = (q) => { const t = survey(q); return !t || t === "minecraft:air"; };
            // Check 5 blocks ahead in movement direction (cached type snapshots)
            for (const o of HAZARD_OFFSETS) {
                const q = { x: p.x + o.x, y: p.y + o.y, z: p.z + o.z };
                const t = survey(q);
                if (!t) continue;
                if (t.includes("lava")) hazards.push({ type: "lava", pos: q, distance: distance(q, here) });
                if (t.includes("water") && t.includes("flowing")) hazards.push({ type: "water_current", pos: q, distance: distance(q, here) });
                // Cliff detection: air below 3 blocks
                if (o.y === -1 && open({ x: q.x, y: q.y - 1, z: q.z }) && open({ x: q.x, y: q.y - 2, z: q.z }) && open({ x: q.x, y: q.y - 3, z: q.z })) {
                    hazards.push({ type: "cliff", pos: q, distance: distance(q, here) });
                }
            }
            this.lastHazards = hazards.slice(0, 10);
        } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }
    }

    scan(tick) {
        let sw = this.sweep;
        if (!sw) sw = this.sweep = { origin: floor(this.sim.location), i: 0, blockCounts: {}, distanceMap: {}, blockPositions: {} };
        const { origin, blockCounts, distanceMap, blockPositions } = sw;
        const entityCounts = {};
        const here = this.sim.location;

        // Scan this slice of the sweep (cached type snapshots: one typeId read per new cell)
        const end = Math.min(SWEEP.length, sw.i + Math.ceil(SWEEP.length / (SWEEP_TICKS / SLICE_TICKS)));
        for (; sw.i < end; sw.i++) {
            {
                {
                    const o = SWEEP[sw.i];
                    const p = { x: origin.x + o.x, y: origin.y + o.y, z: origin.z + o.z };
                    const type = this.terrain.typeSurvey ? this.terrain.typeSurvey(p) : this.terrain.type(p);
                    if (!type || type === "minecraft:air") continue;
                    blockCounts[type] = (blockCounts[type] ?? 0) + 1;
                    if (distanceMap[type] === undefined) {
                        distanceMap[type] = distance(p, here);
                        blockPositions[type] = { ...p };
                    } else {
                        const d = distance(p, here);
                        if (d < distanceMap[type]) {
                            distanceMap[type] = d;
                            blockPositions[type] = { ...p };
                        }
                    }
                    // Track specific important
                    if (type.includes("lava")) {
                        if (!this.lavaPools.some(lp => distance(lp, p) < 6)) this.lavaPools.push({ ...p, tick });
                        if (this.lavaPools.length > 10) this.lavaPools.shift();
                    }
                    if (type.includes("water") && !type.includes("flowing")) {
                        if (!this.waterSources.some(ws => distance(ws, p) < 8)) this.waterSources.push({ ...p, tick });
                        if (this.waterSources.length > 10) this.waterSources.shift();
                    }
                    if (type.includes("iron_ore") || type.includes("raw_iron")) {
                        if (!this.ironSpots.some(ip => distance(ip, p) < 4)) {
                            this.ironSpots.push({ ...p, tick, score: 95 });
                            this.rememberSpot("iron_ore", p, tick, 95);
                        }
                        if (this.ironSpots.length > 20) this.ironSpots.shift();
                    }
                    if (type.includes("diamond_ore") || type === "minecraft:diamond_block") {
                        if (!this.diamondSpots.some(dp => distance(dp, p) < 6)) {
                            this.diamondSpots.push({ ...p, tick, score: 100 });
                            this.rememberSpot("diamond", p, tick, 100);
                        }
                        if (this.diamondSpots.length > 20) this.diamondSpots.shift();
                    }
                    if (type === "minecraft:chest" || type === "minecraft:trapped_chest" || type === "minecraft:barrel" || type.includes("shulker_box")) {
                        if (!this.chestSpots.some(cp => distance(cp, p) < 6)) {
                            this.chestSpots.push({ ...p, tick, score: 85, type });
                            this.rememberSpot("chest", p, tick, 85);
                        }
                    }
                    if (type === "minecraft:obsidian" || type === "minecraft:crying_obsidian") {
                        this.rememberSpot("obsidian", p, tick, 95);
                    }
                }
            }
        }
        if (sw.i < SWEEP.length) return;
        this.sweep = undefined;

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
                    if (!this.sheepSpots.some(sp => distance(sp, e.location) < 8)) {
                        this.sheepSpots.push({ ...floor(e.location), tick, entity: e, score: 85 });
                        this.rememberSpot("sheep", floor(e.location), tick, 85);
                    }
                }
                if (type === "minecraft:village" || type.includes("villager")) {
                    if (!this.villageSpots.some(vp => distance(vp, e.location) < 16)) {
                        this.villageSpots.push({ ...floor(e.location), tick, score: 95 });
                        this.rememberSpot("village", floor(e.location), tick, 95);
                    }
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

        // Clean old spots
        if (this.importantSpots.size > 100) {
            const sorted = [...this.importantSpots.entries()].sort((a,b) => b[1].score - a[1].score);
            this.importantSpots = new Map(sorted.slice(0, 80));
        }
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
            if (["chest","crafting_table","furnace","bed","portal"].includes(spotKind)) {
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
