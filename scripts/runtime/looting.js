import { JUNK, STRUCTURE_LOOT_MULTIPLIER, chooseLoot, isCritical, isValuable, retainScore, scoreItem, shouldLootChest } from "../core/knowledge.js";
import { add, center, distance, floor, key } from "../core/math.js";
import { NativeInventory } from "./inventory.js";
/**
 * Advanced Looting - chest/barrel looting with scoring, structure priority, village detection.
 * Structure loot main priority, lava pool -> portal, retain important.
 */




export class Looting {
    constructor(bot) {
        this.bot = bot;
        this.sim = bot.sim;
        this.bag = bot.bag;
        this.terrain = bot.terrain;
        this.nav = bot.nav;
        this.host = bot.host;
        this.memory = bot.memory;
        this.ignore = new Map();
        this.lastScan = 0;
        this.currentChest = undefined;
        this.trips = 0;
        this.structureCache = new Map();
    }

    reset() {
        this.currentChest = undefined;
    }

    scan(radius = 20, tick = 0) {
        if (tick - this.lastScan < 20) return [];
        this.lastScan = tick;
        const base = floor(this.sim.location);
        const found = [];
        // Near-field full coverage: the 600-check budget is consumed from one corner
        // of the sweep, so a large radius leaves most of the ring permanently
        // unscanned (blind wedge). Radius 8 + step 2 fits the whole budget.
        radius = Math.min(radius, 8);
        // ROBUST QUICK: budgeted scan max 600 checks per tick to avoid extreme slow
        let checks = 0;
        const maxChecks = 600;
        const step = 2; // parity optimization already, but also budget
        for (let dx = -radius; dx <= radius && checks < maxChecks; dx += step) {
            for (let dz = -radius; dz <= radius && checks < maxChecks; dz += step) {
                if (dx*dx + dz*dz > radius*radius) continue;
                for (let dy = -4; dy <= 4 && checks < maxChecks; dy++) {
                    const p = add(base, { x: dx, y: dy, z: dz });
                    checks++;
                    if ((this.ignore.get(key(p)) ?? 0) > tick) continue;
                    const b = this.terrain.block(p);
                    if (!b) continue;
                    if (b.typeId === "minecraft:chest" || b.typeId === "minecraft:trapped_chest" || b.typeId === "minecraft:barrel" || b.typeId.includes("shulker_box") || b.typeId === "minecraft:ender_chest") {
                        found.push({ pos: p, type: b.typeId, dist: Math.hypot(dx, dy, dz) });
                    }
                }
            }
        }
        // Sort by structure priority + distance
        found.forEach(c => {
            const struct = this.detectStructureForChest(c.pos);
            c.structure = struct?.name;
            c.priority = struct ? struct.priority : 70;
        });
        found.sort((a,b) => b.priority - a.priority || a.dist - b.dist);
        return found;
    }

    detectStructureForChest(chestPos) {
        // Check bot's structure detector for nearest structure
        try {
            const top = this.bot.structures?.found ?? [];
            let best = null, bestD = Infinity;
            for (const f of top) {
                const d = distance(f.pos, chestPos);
                if (d < bestD && d < 32) { bestD = d; best = f; }
            }
            return best;
        } catch { return null; }
    }

    evaluateChest(pos, tick) {
        const home = this.memory?.home();
        const homeDist = home ? distance(pos, home) : Infinity;
        const free = this.bag.container.emptySlotsCount;
        const struct = this.detectStructureForChest(pos);
        const structName = struct?.name ?? null;

        if (!shouldLootChest(distance(pos, this.sim.location), homeDist, free, structName)) {
            // Don't ignore if high priority structure
            if (!struct || struct.priority < 90) {
                this.ignore.set(key(pos), tick + 12000);
                return false;
            }
        }
        return true;
    }

    lootChest(pos, tick) {
        const block = this.terrain.block(pos);
        if (!block || !(block.typeId === "minecraft:chest" || block.typeId === "minecraft:barrel" || block.typeId === "minecraft:trapped_chest" || block.typeId.includes("shulker_box") || block.typeId === "minecraft:ender_chest")) {
            this.currentChest = undefined;
            return false;
        }
        const d = distance(this.sim.location, center(pos));
        if (d > 3.5) {
            const r = this.bot.navTo(center(pos), tick, 2.5);
            if (r === "failed" || r === "blocked") {
                const struct = this.detectStructureForChest(pos);
                if (!struct || struct.priority < 85) this.ignore.set(key(pos), tick + 6000);
                this.currentChest = undefined;
                return false;
            }
            const struct = this.detectStructureForChest(pos);
            this.bot.reason = struct ? `Looting ${struct.name} chest at ${pos.x},${pos.y},${pos.z} (priority ${struct.priority})` : `Going to chest at ${pos.x},${pos.y},${pos.z}`;
            return true;
        }

        this.nav.reset();
        try {
            const inv = block.getComponent("minecraft:inventory")?.container;
            if (!inv) throw Error("no inv");
            const chest = new NativeInventory(inv);
            const items = [];
            for (let i = 0; i < chest.size; i++) {
                const it = chest.get(i);
                if (it) items.push({ slot: i, item: it });
            }
            if (!items.length) {
                this.ignore.set(key(pos), tick + 12000);
                this.currentChest = undefined;
                this.bot.record(`loot: empty chest at ${key(pos)}`);
                return false;
            }
            const struct = this.detectStructureForChest(pos);
            const structName = struct?.name ?? null;
            const toTake = chooseLoot(items.map(x => x.item), this.bag.counts(), this.bag.container.emptySlotsCount, structName);
            if (!toTake.length) {
                this.ignore.set(key(pos), tick + 12000);
                this.currentChest = undefined;
                return false;
            }
            let moved = 0;
            for (const idx of toTake) {
                const chestSlot = items[idx]?.slot;
                if (chestSlot === undefined) continue;
                const item = chest.get(chestSlot);
                if (!item) continue;
                // Try merge first
                let dest = -1;
                for (let s = 0; s < this.bag.size; s++) {
                    const bagItem = this.bag.get(s);
                    if (bagItem && bagItem.isStackableWith(item) && bagItem.amount < bagItem.maxAmount) {
                        dest = s;
                        break;
                    }
                }
                if (dest < 0) {
                    for (let s = 0; s < this.bag.size; s++) {
                        if (!this.bag.get(s)) { dest = s; break; }
                    }
                }
                if (dest < 0) break;
                try {
                    const res = this.bag.withdraw(chest, (it) => it.typeId === item.typeId, 2);
                    moved += res.moved + res.merged;
                    break;
                } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }
            }
            if (moved > 0) {
                this.memory?.notice("chest", pos, this.sim.dimension.id, tick);
                this.trips++;
                this.bot.record(`loot: ${moved} from ${key(pos)} ${structName ? `(${structName})` : ""}`);
                // Remember important loot
                try { this.bot.awareness?.rememberSpot("chest", pos, tick, struct?.priority ?? 85); } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }
            }
            this.ignore.set(key(pos), tick + (moved > 0 ? 12000 : 6000));
            this.currentChest = undefined;
            return false;
        } catch (e) {
            this.bot.record(`loot fail: ${String(e).slice(0,80)}`);
            this.ignore.set(key(pos), tick + 6000);
            this.currentChest = undefined;
            return false;
        }
    }

    tick(tick) {
        if (!this.bot.settings.loot) return false;
        // Even if low slots, allow if high priority structure
        const free = this.bag.container.emptySlotsCount;
        const topStruct = this.bot.structures?.getTopPriority();
        if (free < 1 && (!topStruct || topStruct.priority < 90)) return false;

        if (this.currentChest) {
            return this.lootChest(this.currentChest, tick);
        }
        const chests = this.scan(20, tick);
        for (const c of chests) {
            if (!this.evaluateChest(c.pos, tick)) continue;
            this.currentChest = c.pos;
            return this.lootChest(c.pos, tick);
        }
        return false;
    }

    findVillage(radius = 64) {
        try {
            const list = this.sim.dimension.getEntities({ location: this.sim.location, maxDistance: radius });
            let best, bestD = Infinity;
            for (const e of list) {
                if (!["minecraft:villager","minecraft:villager_v2","minecraft:wandering_trader","minecraft:cat","minecraft:iron_golem"].includes(e.typeId)) continue;
                const d = distance(e.location, this.sim.location);
                if (d < bestD) { bestD = d; best = e; }
            }
            return best;
        } catch { return undefined; }
    }
}
