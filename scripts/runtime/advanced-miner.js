import { floor, add, center, distance, key, horizontal, UP, DOWN, CARDINAL, COMPASS } from "../core/math.js";
import { MINE, toolTier } from "../core/policy.js";
import { isPassable, isUnbreakable } from "../core/blocks.js";
import { retainScore } from "../core/knowledge.js";
import { BlockScan } from "./world.js";
import { bestYFor, clusterVeins, branchPattern, optimalSpacing } from "../core/mining-strategy.js";

const BLOCKED_TTL = 1800;

/**
 * Advanced Miner - Unbreakable, handles front block, deep mining, vein clustering
 * Rewrites entire mining strategy to be fast and reliable
 */
export class AdvancedMiner {
    constructor(bot) {
        this.bot = bot;
        this.phase = "idle"; // idle, scanning, approaching, breaking, collecting, exploring, shaft, branch, vein, ascend
        this.target = null;
        this.targetType = null;
        this.breakingSince = 0;
        this.scan = null;
        this.farScan = null;
        this.blocked = new Map();
        this.failures = 0;
        this.noTargetSince = 0;
        this.broken = 0;
        this.amount = 0;
        this.requestedBlock = null;
        this.requestedItem = null;
        this.treeMode = false;
        this.underground = false;
        this.exploring = false;
        this.returning = false;
        this.approach = null;
        this.approachTry = 0;
        this.obstructionClear = null;
        this.route = []; // for deep mining shaft
        this.dir = { x: 1, y: 0, z: 0 };
        this.run = 0;
        this.turns = 0;
        this.dug = 0;
        this.wantsOut = false;
        this.moving = null;
        this.branchPath = [];
        this.branchIndex = 0;
        this.veins = [];
        this.currentVein = null;
        this.targetY = null;
        this.site = null;
        this.since = 0;
        this.loot = new Map();
        this.dig = null;
        this.cavityAt = 0;
        this.refills = 0;
        this.startCount = 0;
    }

    reset() {
        this.phase = "idle";
        this.target = null;
        this.targetType = null;
        this.breakingSince = 0;
        this.scan = null;
        this.farScan = null;
        this.blocked.clear();
        this.failures = 0;
        this.noTargetSince = 0;
        this.broken = 0;
        this.amount = 0;
        this.requestedBlock = null;
        this.requestedItem = null;
        this.treeMode = false;
        this.underground = false;
        this.exploring = false;
        this.returning = false;
        this.approach = null;
        this.approachTry = 0;
        this.obstructionClear = null;
        this.route = [];
        this.dir = { x: 1, y: 0, z: 0 };
        this.run = 0;
        this.turns = 0;
        this.dug = 0;
        this.wantsOut = false;
        this.moving = null;
        this.branchPath = [];
        this.branchIndex = 0;
        this.veins = [];
        this.currentVein = null;
        this.targetY = null;
        this.site = null;
        this.since = 0;
        this.loot.clear();
        this.dig = null;
        this.cavityAt = 0;
        this.refills = 0;
        this.startCount = 0;
    }

    start(block, amount, tick) {
        this.reset();
        this.requestedBlock = block;
        this.requestedItem = MINE[block]?.drops;
        this.amount = amount;
        const startStock = this.bot.bag.counts();
        this.startCount = Object.entries(startStock).filter(([k]) => k === this.requestedItem || (this.requestedBlock && k === this.requestedBlock)).reduce((a, [, v]) => a + v, 0);
        this.treeMode = /(_log|_wood|_stem|_hyphae)$/.test(block);
        this.underground = !!(this.requestedItem && (this.isUndergroundOre(this.requestedItem) || this.isBulk(this.requestedItem)));
        this.scan = new BlockScan(this.bot.sim.location, this.underground ? 8 : 12);
        this.noTargetSince = tick;
        this.since = tick;
        this.phase = this.underground ? "shaft" : "scanning";
        if (this.underground) {
            const p = floor(this.bot.sim.location);
            this.targetY = bestYFor(this.requestedItem);
            this.site = { origin: { ...p }, targetY: this.targetY, ore: this.requestedItem };
            this.route = [{ ...p }];
        }
        this.bot.reason = `Advanced mining: ${block} x${amount} - ${this.underground ? `deep to Y=${this.targetY}` : "surface scan"} - unbreakable`;
        return true;
    }

    isUndergroundOre(item) {
        const orePattern = /(_ore|_debris)/;
        return orePattern.test(item) || ["minecraft:raw_iron","minecraft:raw_gold","minecraft:raw_copper","minecraft:diamond","minecraft:redstone","minecraft:lapis_lazuli"].includes(item);
    }

    isBulk(item) {
        return ["minecraft:cobblestone","minecraft:stone","minecraft:deepslate"].includes(item);
    }

    // Check if type matches requested (any wood fallback)
    matchesRequested(type) {
        const req = this.requestedBlock;
        if (!req) return false;
        if (type === req) return true;
        // Any wood fallback
        if (req.endsWith("_log") || req.endsWith("_wood") || req.includes("_stem")) {
            if (type.endsWith("_log") || type.endsWith("_wood") || type.includes("_stem") || type.includes("_hyphae")) return true;
        }
        if (req.includes("planks") && (type.endsWith("_log") || type.endsWith("_wood"))) return true;
        if (req.includes("stick") && (type === "minecraft:deadbush" || type === "minecraft:dead_bush" || type.endsWith("_log"))) return true;
        // Check drops
        const rule = MINE[type];
        if (rule && this.requestedItem && rule.drops === this.requestedItem) return true;
        // Generic: if requested item matches
        if (this.requestedItem && rule && rule.drops === this.requestedItem) return true;
        return false;
    }

    findTarget(tick) {
        const bot = this.bot;
        // Fast path for tree: adjacent logs
        if (this.treeMode && this.broken > 0 && this.target) {
            const adj = this.findAdjacentLogs(tick);
            if (adj) return adj;
        }

        // Use scan
        if (!this.scan) this.scan = new BlockScan(bot.sim.location, this.underground ? 8 : 12);
        let found = this.scan.next(bot.terrain, (type, p) => {
            if ((this.blocked.get(key(p)) ?? 0) > tick) return false;
            if (!this.matchesRequested(type)) return false;
            // Don't mine under feet directly
            const self = floor(bot.sim.location);
            if (p.x === self.x && p.z === self.z && p.y < self.y - 1) {
                // Allow if we can clear above
                const above = bot.terrain.block({ x: p.x, y: p.y + 1, z: p.z });
                if (above && !above.isAir && !isPassable(above.typeId)) {
                    // Will handle via obstruction clear
                } else return false;
            }
            if (p.x === self.x && p.z === self.z && p.y === self.y - 1) {
                return bot.terrain.safeToMineEx(p, false);
            }
            return bot.safeToMine ? bot.safeToMine(p) : true;
        }, 400);

        if (found) return found;

        // Far scan
        if (this.scan.done) {
            if (!this.farScan) {
                this.farScan = new BlockScan(bot.sim.location, 24);
                this.farScanAt = { ...bot.sim.location };
                this.farUntil = tick + 300;
            }
            if (!this.farScan.done && tick < this.farUntil) {
                found = this.farScan.next(bot.terrain, (type, p) => {
                    if ((this.blocked.get(key(p)) ?? 0) > tick) return false;
                    return this.matchesRequested(type);
                }, 600);
                if (found) return found;
            }
        }

        return null;
    }

    findAdjacentLogs(tick) {
        if (!this.target) return null;
        const centerPos = this.target;
        for (let dx = -3; dx <= 3; dx++) for (let dy = -1; dy <= 4; dy++) for (let dz = -3; dz <= 3; dz++) {
            if (dx===0 && dy===0 && dz===0) continue;
            const p = { x: centerPos.x + dx, y: centerPos.y + dy, z: centerPos.z + dz };
            if ((this.blocked.get(key(p)) ?? 0) > tick) continue;
            const b = this.bot.terrain.block(p);
            if (!b) continue;
            if (this.matchesRequested(b.typeId) || b.typeId.endsWith("_log") || b.typeId.endsWith("_wood")) {
                if (this.bot.safeToMine ? this.bot.safeToMine(p) : true) return p;
            }
        }
        return null;
    }

    // UNBREAKABLE FRONT BLOCK MINING: directly break front block without nav
    tryBreakFront(tick) {
        const bot = this.bot;
        const target = this.target;
        if (!target) return false;

        const head = bot.sim.getHeadLocation();
        const at = add(target, { x: 0.5, y: 0.5, z: 0.5 });
        const dist = distance(head, at);
        const self = floor(bot.sim.location);

        // If target is front block (within 5 blocks, same level or 1 up/down), try direct break
        const isFront = dist <= 5.5 && Math.abs(target.y - self.y) <= 2 && horizontal(target, self) <= 4;
        
        if (isFront) {
            // Check head front obstruction first - clear it if blocks front
            const headObstruct = bot.terrain.headFrontObstruction ? bot.terrain.headFrontObstruction(bot.sim.location) : null;
            if (headObstruct && !(headObstruct.x === target.x && headObstruct.y === target.y && headObstruct.z === target.z)) {
                const b = bot.terrain.block(headObstruct);
                if (b && !b.isAir && b.isSolid) {
                    const r = bot.digCell(headObstruct, tick);
                    if (r === "digging") {
                        bot.reason = `Clearing front ${b.typeId} at ${headObstruct.x},${headObstruct.y},${headObstruct.z} to reach ${this.requestedBlock} - front block fix`;
                        return true; // handled this tick
                    }
                }
            }

            // Check obstructions below if mining down
            if (target.y < self.y) {
                const obs = bot.terrain.obstructionsBelow ? bot.terrain.obstructionsBelow(bot.sim.location, target) : [];
                if (obs.length > 0 && obs.length <= 3) {
                    for (const cell of obs.slice(0,2)) {
                        if (cell.x === target.x && cell.y === target.y && cell.z === target.z) continue;
                        const b = bot.terrain.block(cell);
                        if (b && !b.isAir) {
                            const r = bot.digCell(cell, tick);
                            if (r === "digging") {
                                bot.reason = `Clearing below obstruction ${b.typeId} to reach ${this.requestedBlock}`;
                                return true;
                            }
                        }
                    }
                }
            }

            // Try direct break - no nav needed for front block
            const rule = MINE[bot.terrain.block(target)?.typeId];
            if (rule && rule.tier > 0) {
                if (!bot.bag.tool(rule.tool, rule.tier)) {
                    // Need better tool
                    bot.reason = `Need ${rule.tool} tier ${rule.tier} for ${target.x},${target.y},${target.z} - getting better tool`;
                    // Will be handled by tool tier logic in bot.js
                    return false;
                }
            }

            // Direct break attempt
            if (!this.breakingSince) {
                bot.sim.lookAtBlock(bot.host.relative(target));
                if (!bot.sim.breakBlock(bot.host.relative(target))) {
                    // If direct break fails, try approach via nav
                    return false;
                }
                this.breakingSince = tick;
                bot.reason = `Breaking front ${this.requestedBlock} at ${target.x},${target.y},${target.z} - direct front mining`;
                return true;
            } else {
                const timeout = this.treeMode ? 80 : 200;
                if (tick - this.breakingSince > timeout) {
                    try { bot.sim.stopBreakingBlock(); } catch {}
                    this.blocked.set(key(target), tick + BLOCKED_TTL);
                    this.target = null;
                    this.breakingSince = 0;
                    bot.record("mining timeout front block");
                    return false;
                }
                // Check if tool still valid
                const held = bot.bag.get(bot.sim.selectedSlotIndex);
                if (rule && rule.tier > 0 && (!held?.typeId.endsWith("_pickaxe") || toolTier(held.typeId) < rule.tier)) {
                    try { bot.sim.stopBreakingBlock(); } catch {}
                    this.breakingSince = 0;
                    return false;
                }
                return true; // still breaking
            }
        }

        return false; // not front, need nav
    }

    approachTarget(tick) {
        const bot = this.bot;
        const target = this.target;
        if (!target) return false;

        const at = add(target, { x: 0.5, y: 0.5, z: 0.5 });
        const head = bot.sim.getHeadLocation();

        // If already in range and line, don't need approach
        if (distance(head, at) <= 4.6) {
            try {
                if (bot.terrain.line(head, at, target)) {
                    return true; // in range, can break
                }
            } catch {}
        }

        // Need to approach - find safe spots around target
        const options = CARDINAL.map(d => add(target, d))
            .flatMap(q => [q, { ...q, y: q.y + 1 }, { ...q, y: q.y - 1 }])
            .filter(q => bot.terrain.safe(q))
            .filter(q => {
                try { return bot.terrain.line(add(center(q), { x: 0, y: 1.62, z: 0 }), at, target); } catch { return false; }
            })
            .sort((a,b) => distance(a, bot.sim.location) - distance(b, bot.sim.location));

        if (!options.length) {
            // Try to clear obstruction
            try {
                const obs = bot.terrain.findObstructions(bot.sim.location, center(target));
                if (obs.length > 0 && obs.length <= 2) {
                    for (const cell of obs.slice(0,2)) {
                        const b = bot.terrain.block(cell);
                        if (!b || b.isAir) continue;
                        if (b.typeId === "minecraft:obsidian") continue;
                        if (isUnbreakable(b.typeId)) continue;
                        const score = retainScore(b.typeId);
                        if (score >= 80) continue;
                        const r = bot.digCell(cell, tick);
                        if (r === "digging") {
                            bot.reason = `Clearing obstruction ${b.typeId} to approach ${this.requestedBlock}`;
                            return true; // handling
                        }
                    }
                }
            } catch {}
            this.blocked.set(key(target), tick + BLOCKED_TTL);
            this.target = null;
            return false;
        }

        const tries = this.approachTry ?? 0;
        if (!this.approach) {
            this.approach = options[Math.min(tries, options.length - 1)];
        }

        const r = bot.nav.go(center(this.approach), tick);
        if (r === "done") {
            this.approach = null;
            this.approachTry = 0;
            return true;
        }
        if (r === "failed") {
            this.approach = null;
            this.approachTry = tries + 1;
            if (tries >= 3) {
                this.blocked.set(key(target), tick + BLOCKED_TTL);
                this.target = null;
            }
            return false;
        }
        return true; // still approaching
    }

    // Deep mining phases
    ensureShaft(tick) {
        const bot = this.bot;
        const p = floor(bot.sim.location);
        if (!this.site) return "at-depth";
        if (p.y <= this.site.targetY + 1) {
            this.phase = "branch";
            this.branchPath = branchPattern(80, 16, optimalSpacing(this.site.ore));
            this.branchIndex = 0;
            this.turns = 0;
            bot.reason = `Deep at Y=${p.y}, branching for ${this.site.ore}`;
            return "at-depth";
        }
        if (this.route.length === 1 && horizontal(bot.sim.location, center(this.site.origin)) > 2) {
            const r = bot.nav.go(center(this.site.origin), tick);
            if (r === "failed") return "blocked";
            return "working";
        }
        // Descend step
        const n = { x: p.x + this.dir.x, y: p.y - 1, z: p.z + this.dir.z };
        const floorCell = add(n, DOWN);
        if (!bot.terrain.solid(floorCell)) {
            this.turn();
            return "working";
        }
        if (bot.terrain.lavaNear(n) || bot.terrain.waterNear(n)) {
            this.turn();
            return "working";
        }
        const r = this.openCells([add(n, UP), n], tick);
        if (r === "digging") return "working";
        if (r !== "open") {
            this.turn();
            return "working";
        }
        this.goTo(n, tick);
        return "working";
    }

    openCells(cells, tick) {
        const bot = this.bot;
        if (this.dig) {
            if (!bot.terrain.solid(this.dig.cell)) {
                this.dig = null;
            } else if (tick - this.dig.since > 240) {
                this.dig = null;
                return "stalled";
            } else return "digging";
        }
        const todo = cells.filter(c => bot.terrain.solid(c));
        if (!todo.length) return "open";
        const cell = todo.sort((a,b) => b.y - a.y)[0];
        const r = bot.digCell(cell, tick);
        if (r === "open") return "open";
        if (r !== "digging") return r;
        this.dig = { cell, since: tick };
        return "digging";
    }

    goTo(cell, tick) {
        this.moving = { ...cell };
        const bot = this.bot;
        bot.nav.reset();
        bot.sim.isSprinting = false;
        if (cell.y > floor(bot.sim.location).y) bot.sim.jump();
        bot.sim.moveToLocation(bot.host.relative(center(cell)), { faceTarget: true });
    }

    settle() {
        if (!this.moving) return "arrived";
        const bot = this.bot;
        const cell = this.moving;
        if (horizontal(bot.sim.location, center(cell)) < 0.5 && Math.abs(bot.sim.location.y - cell.y) < 1.2) {
            this.moving = null;
            this.route.push({ ...cell });
            this.dug++;
            this.turns = 0;
            return "arrived";
        }
        this.goTo(cell, 0);
        return "moving";
    }

    turn() {
        const d = this.dir;
        this.dir = d.x !== 0 ? { x: 0, y: 0, z: d.x } : { x: -d.z, y: 0, z: 0 };
        this.turns++;
        this.run = 0;
    }

    branchStep(tick) {
        const bot = this.bot;
        if (this.moving) return this.settle() === "arrived" ? "stepped" : "working";
        if (this.dug >= 300) { this.wantsOut = true; return "exhausted"; }
        if (this.turns >= 4) { this.wantsOut = true; return "exhausted"; }
        if (this.branchIndex >= this.branchPath.length) { this.wantsOut = true; return "exhausted"; }

        // Scan for ores every 20 ticks
        if (tick % 20 === 0) {
            const ores = bot.terrain.scanOres(bot.sim.location, 8, (type) => {
                const r = MINE[type];
                return r && r.drops === this.requestedItem;
            }, 400);
            if (ores.length) {
                const clusters = clusterVeins(ores, 4);
                if (clusters.length && clusters[0].length) {
                    this.veins = clusters;
                    this.currentVein = clusters[0];
                    this.phase = "vein";
                    bot.reason = `Found vein ${clusters[0].length} blocks`;
                    return "vein-found";
                }
            }
        }

        const next = this.branchPath[this.branchIndex];
        if (!next) { this.branchIndex++; return "working"; }
        const p = floor(bot.sim.location);
        const target = { x: this.site.origin.x + next.x, y: p.y, z: this.site.origin.z + next.z };
        const floorCell = add(target, DOWN);
        if (!bot.terrain.solid(floorCell)) { this.branchIndex++; this.turn(); return "working"; }

        const r = this.openCells([add(target, UP), target], tick);
        if (r === "digging") return "working";
        if (r !== "open") { this.branchIndex++; this.turn(); return "working"; }

        this.branchIndex++;
        this.goTo(target, tick);
        return "working";
    }

    veinStep(tick) {
        if (!this.currentVein || !this.currentVein.length) {
            this.phase = "branch";
            return "done";
        }
        const bot = this.bot;
        if (this.moving) return this.settle() === "arrived" ? "stepped" : "working";

        const p = floor(bot.sim.location);
        let nearest = null, nearestDist = Infinity;
        for (const ore of this.currentVein) {
            const block = bot.terrain.block(ore);
            if (!block || block.isAir) continue;
            const d = distance(p, ore);
            if (d < nearestDist) { nearestDist = d; nearest = ore; }
        }
        if (!nearest) {
            this.veins.shift();
            this.currentVein = this.veins[0];
            if (!this.currentVein) { this.phase = "branch"; return "done"; }
            return "working";
        }
        if (distance(bot.sim.location, center(nearest)) > 4.5) {
            const r = bot.nav.go(center(nearest), tick);
            if (r === "failed") this.goTo(nearest, tick);
            return "working";
        }
        const r = bot.digCell(nearest, tick);
        if (r === "digging") return "working";
        if (r === "open") {
            this.currentVein = this.currentVein.filter(o => !(o.x===nearest.x && o.y===nearest.y && o.z===nearest.z));
            return "working";
        }
        return "working";
    }

    ascend(tick) {
        const bot = this.bot;
        while (this.route.length) {
            const tail = this.route[this.route.length-1];
            if (horizontal(bot.sim.location, center(tail)) < 1.0 && Math.abs(bot.sim.location.y - tail.y) < 1.4) this.route.pop();
            else break;
        }
        if (this.route.length <= 1) { this.reset(); return "surface"; }
        if (!this.route.length) { this.reset(); return "surface"; }
        const next = this.route[this.route.length-1];
        const loc = center(next);
        if (horizontal(bot.sim.location, loc) < 0.5 && Math.abs(bot.sim.location.y - next.y) < 1.2) {
            this.route.pop();
        } else {
            bot.nav.reset();
            bot.sim.moveToLocation(bot.host.relative(loc), { faceTarget: true });
        }
        return "working";
    }

    tick(tick) {
        const bot = this.bot;
        const stock = bot.bag.counts();
        const gained = this.requestedItem ? (Object.entries(stock).filter(([k]) => k===this.requestedItem || (this.requestedBlock && k===this.requestedBlock)).reduce((a,[,v])=>a+v,0) - (this.startCount ?? 0)) : this.broken;
        const met = this.requestedItem ? gained >= this.amount : this.broken >= this.amount;

        if (met) {
            if (this.underground && this.phase !== "idle") {
                this.wantsOut = true;
            } else {
                return true; // done
            }
        }

        if (this.wantsOut) {
            const r = this.ascend(tick);
            if (r === "surface") return true;
            return false;
        }

        // Handle obstruction clear
        if (this.obstructionClear) {
            const obs = this.obstructionClear;
            if (tick - obs.since > 150) { this.obstructionClear = null; return false; }
            if (!obs.cells.length) { this.obstructionClear = null; return false; }
            const cell = obs.cells[0];
            const b = bot.terrain.block(cell);
            if (!b || b.isAir || isPassable(b.typeId)) { obs.cells.shift(); return false; }
            const r = bot.digCell(cell, tick);
            if (r === "digging") return false;
            if (r === "open") { obs.cells.shift(); return false; }
            return false;
        }

        // Deep mining phases
        if (this.underground) {
            switch (this.phase) {
                case "shaft": {
                    const r = this.ensureShaft(tick);
                    if (r === "at-depth") return false;
                    if (r === "blocked") { bot.reason = "Shaft blocked, trying alternative"; this.turn(); return false; }
                    return false;
                }
                case "branch": {
                    const r = this.branchStep(tick);
                    if (r === "exhausted") { this.wantsOut = true; return false; }
                    return false;
                }
                case "vein": {
                    this.veinStep(tick);
                    return false;
                }
            }
        }

        // Surface mining - unbreakable front block handling
        if (!this.target) {
            const found = this.findTarget(tick);
            if (!found) {
                // ANTI-IDLE: never stay idle - fast threshold 20/40
                if (tick % 15 === 0 && tick - this.noTargetSince > 10) {
                    // Keep moving while scanning
                    const result = bot.explorer.step(bot.sim.location, bot.anchor, tick, bot.terrain, bot.nav, bot.settings.range);
                    if (result === "running") {
                        bot.reason = `Scanning for ${this.requestedBlock} while moving - never idle - advanced`;
                    }
                }
                if (tick - this.noTargetSince > (this.treeMode ? 20 : 40)) {
                    this.failures++;
                    this.noTargetSince = tick;
                    bot.explorer.reset();
                    bot.nav.reset();
                    const result = bot.explorer.step(bot.sim.location, bot.anchor, tick, bot.terrain, bot.nav, bot.settings.range);
                    bot.reason = `Exploring for ${this.requestedBlock} - any wood accepted - ${this.failures} tries - ${result}`;
                    if (result === "blocked") {
                        // Widen search
                        this.scan = new BlockScan(bot.sim.location, 24);
                        bot.reason = `Widening search for ${this.requestedBlock} to 24 blocks - unbreakable`;
                    }
                    return false;
                }
                return false;
            }
            this.target = found;
            this.targetType = bot.terrain.block(found)?.typeId;
            this.noTargetSince = tick;
            bot.reason = `Found ${this.requestedBlock} at ${found.x},${found.y},${found.z} - going`;
        }

        // Try front block direct break first - fixes front block stops issue
        if (this.tryBreakFront(tick)) return false;

        // Need to approach
        if (!this.approachTarget(tick)) {
            // Approach failed, will retry
            return false;
        }

        // In range, break
        if (!this.breakingSince) {
            const b = bot.terrain.block(this.target);
            if (!b || !this.matchesRequested(b.typeId)) {
                this.target = null;
                this.breakingSince = 0;
                return false;
            }
            // Tool tier check
            const rule = MINE[b.typeId];
            if (rule && rule.tier > 0 && !bot.bag.tool(rule.tool, rule.tier)) {
                bot.reason = `Need ${rule.tool} tier ${rule.tier} for ${b.typeId} - getting better tool - unbreakable`;
                // Try to get better tool via obtain
                try {
                    if (rule.tier >= 2) bot.obtain("minecraft:stone_pickaxe", 1, tick);
                    if (rule.tier >= 3) {
                        const counts = bot.bag.counts();
                        if ((counts["minecraft:iron_ingot"] ?? 0) >= 3) bot.obtain("minecraft:iron_pickaxe", 1, tick);
                    }
                } catch {}
                return false;
            }

            bot.sim.lookAtBlock(bot.host.relative(this.target));
            if (!bot.sim.breakBlock(bot.host.relative(this.target))) {
                this.blocked.set(key(this.target), tick + BLOCKED_TTL);
                this.target = null;
                return false;
            }
            this.breakingSince = tick;
            bot.reason = `Breaking ${this.requestedBlock} at ${this.target.x},${this.target.y},${this.target.z} - front fix`;
        } else {
            const timeout = this.treeMode ? 80 : 200;
            if (tick - this.breakingSince > timeout) {
                try { bot.sim.stopBreakingBlock(); } catch {}
                this.blocked.set(key(this.target), tick + BLOCKED_TTL);
                this.target = null;
                this.breakingSince = 0;
                bot.record("mining timeout");
                return false;
            }
        }

        return false;
    }
}
