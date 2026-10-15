/**
 * Advanced Looting module - chest/barrel looting with scoring, village detection, etc.
 */
import { floor, distance, center, add, key } from "../core/math.js";
import { scoreItem, isValuable, shouldLootChest, chooseLoot, JUNK } from "../core/loot.js";
import { NativeInventory } from "./inventory.js";

export class Looting {
    constructor(bot) {
        this.bot = bot;
        this.sim = bot.sim;
        this.bag = bot.bag;
        this.terrain = bot.terrain;
        this.nav = bot.nav;
        this.host = bot.host;
        this.memory = bot.memory;
        this.ignore = new Map(); // chest pos -> tick until retry
        this.lastScan = 0;
        this.currentChest = undefined;
        this.trips = 0;
    }

    reset() {
        this.currentChest = undefined;
    }

    /**
     * Scan for chests/barrels near bot. Returns sorted list of positions.
     */
    scan(radius = 16, tick = 0) {
        if (tick - this.lastScan < 20) return [];
        this.lastScan = tick;
        const base = floor(this.sim.location);
        const found = [];
        for (let dx = -radius; dx <= radius; dx++) {
            for (let dz = -radius; dz <= radius; dz++) {
                if (dx*dx + dz*dz > radius*radius) continue;
                for (let dy = -4; dy <= 4; dy++) {
                    const p = add(base, { x: dx, y: dy, z: dz });
                    if ((this.ignore.get(key(p)) ?? 0) > tick) continue;
                    const b = this.terrain.block(p);
                    if (!b) continue;
                    if (b.typeId === "minecraft:chest" || b.typeId === "minecraft:trapped_chest" || b.typeId === "minecraft:barrel") {
                        found.push({ pos: p, type: b.typeId, dist: Math.hypot(dx, dy, dz) });
                    }
                }
            }
        }
        found.sort((a,b) => a.dist - b.dist);
        return found;
    }

    /**
     * Evaluate if chest is worth looting.
     */
    evaluateChest(pos, tick) {
        const home = this.memory?.home();
        const homeDist = home ? distance(pos, home) : Infinity;
        const free = this.bag.container.emptySlotsCount;
        if (!shouldLootChest(distance(pos, this.sim.location), homeDist, free)) {
            this.ignore.set(key(pos), tick + 12000);
            return false;
        }
        return true;
    }

    /**
     * Loot a specific chest position. Returns true while handling, false when done.
     */
    lootChest(pos, tick) {
        const block = this.terrain.block(pos);
        if (!block || !(block.typeId === "minecraft:chest" || block.typeId === "minecraft:barrel" || block.typeId === "minecraft:trapped_chest")) {
            this.currentChest = undefined;
            return false;
        }
        const d = distance(this.sim.location, center(pos));
        if (d > 3.5) {
            const r = this.bot.navTo(center(pos), tick, 2.5);
            if (r === "failed" || r === "blocked") {
                this.ignore.set(key(pos), tick + 6000);
                this.currentChest = undefined;
                return false;
            }
            this.bot.reason = `Going to chest at ${pos.x},${pos.y},${pos.z}`;
            return true;
        }

        // In range: open and evaluate contents
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
            // Score and choose
            const toTake = chooseLoot(items.map(x => x.item), this.bag.counts(), this.bag.container.emptySlotsCount);
            if (!toTake.length) {
                this.ignore.set(key(pos), tick + 12000);
                this.currentChest = undefined;
                return false;
            }
            let moved = 0;
            for (const idx of toTake) {
                const chestSlot = items[idx]?.slot;
                if (chestSlot === undefined) continue;
                // Find destination
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
                    // Use withdraw logic? Simplified transfer
                    const res = this.bag.withdraw(chest, (it) => it.typeId === item.typeId, 2);
                    moved += res.moved + res.merged;
                    break; // withdraw does batch
                } catch {
                    // Fallback single transfer via container swap?
                    try {
                        chest.container.swapItems ? chest.container : null;
                    } catch {}
                }
            }
            // If we moved anything, remember chest
            if (moved > 0) {
                this.memory?.notice("chest", pos, this.sim.dimension.id, tick);
                this.trips++;
                this.bot.record(`loot: ${moved} from ${key(pos)}`);
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

    /**
     * Main tick: find and loot nearest valuable chest. Returns true if handling.
     */
    tick(tick) {
        if (!this.bot.settings.loot) return false;
        if (this.bag.container.emptySlotsCount < 1) return false;
        if (this.currentChest) {
            return this.lootChest(this.currentChest, tick);
        }
        const chests = this.scan(16, tick);
        for (const c of chests) {
            if (!this.evaluateChest(c.pos, tick)) continue;
            this.currentChest = c.pos;
            return this.lootChest(c.pos, tick);
        }
        return false;
    }

    /**
     * Village detection: find villager/cat/trader as proxy for village.
     */
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
