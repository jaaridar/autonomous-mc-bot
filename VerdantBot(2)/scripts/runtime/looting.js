// One module now: runtime/looting.js + runtime/drops.js (see docs/ARCHITECTURE.md).
import { chooseLoot, shouldLootChest } from "../core/knowledge.js";
import { add, center, distance, floor, horizontal, key } from "../core/math.js";
import { matches } from "../core/recipes.js";
import { MINE } from "../core/world.js";
import { NativeInventory } from "./inventory.js";

// ---------------------------------------------------------------- looting.js

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
        // Expired ignore entries otherwise linger for the whole session; prune
        // at scan cadence once the map grows (bounded, trivial cost).
        if (this.ignore.size > 256) {
            for (const [k, until] of this.ignore)
                if ((until ?? 0) <= tick) this.ignore.delete(k);
        }
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
                    // Keep going: chooseLoot returns every stack worth taking, so
                    // draining the first type must not abandon the rest (this used
                    // to ignore the chest for 10 minutes after one successful grab).
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

    /**
     * Arbiter probe: score > 30 when a chest worth looting exists right now.
     * Mirrors tick()'s candidate test without acting, so the arbiter can rank
     * the looting director against the others (it was never proposed before).
     */
    evaluate(tick) {
        if (!this.bot.settings.loot) return 0;
        if (this.currentChest) return this.terrain.block(this.currentChest) ? 60 : 0;
        const free = this.bag.container.emptySlotsCount;
        const topStruct = this.bot.structures?.getTopPriority();
        if (free < 1 && (!topStruct || topStruct.priority < 90)) return 0;
        for (const c of this.scan(20, tick)) {
            if (this.evaluateChest(c.pos, tick)) return 60;
        }
        return 0;
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

// ---------------------------------------------------------------- drops.js

/**
 * Loose-drop collection: the one place that answers "where did the item go?".
 *
 * Blocks break into item entities that fall, bounce and despawn, so every
 * pickup walks to the *entity* - never just the cell the block stood in - and
 * the entity disappearing is the only success signal that matters. Item
 * entities are read-only facts; walking and waiting are the engine's own
 * mechanics. A stack that cannot be reached within its window is blacklisted
 * briefly so the owner task can move on instead of orbiting it forever.
 */
export class Drops {
    constructor(bot) {
        this.bot = bot;
    }
    /**
     * Nearest matching loose drop around a spot, skipping cells that already
     * failed recently. `m` is the task whose loot is wanted (m.item, the
     * block's drops, or the deep-mining fallback target).
     */
    near(m, loc, radius, tick) {
        const b = this.bot;
        const want = m.item ?? m.deepItem ?? (m.block ? MINE[m.block]?.drops : undefined);
        if (!want)
            return undefined;
        try {
            return b.terrain.dimension
                .getEntities({ type: "minecraft:item", location: loc, maxDistance: radius })
                .filter((e) => {
                if (!e.isValid)
                    return false;
                const cell = floor(e.location);
                if ((m.blocked?.get(key(cell)) ?? 0) > tick)
                    return false;
                return b.terrain.safe(cell);
            })
                .sort((a, c) => distance(a.location, b.sim.location) - distance(c.location, b.sim.location))
                .find((e) => {
                const item = e.getComponent("minecraft:item")?.itemStack;
                return !!item && (matches(item.typeId, want) || (m.type && matches(item.typeId, MINE[m.type]?.drops)));
            });
        }
        catch {
            return undefined;
        }
    }
    /**
     * Walk onto (and wait out) one loose drop. Returns true while the pickup
     * owns the tick. An entity that is gone means the engine collected it -
     * that is the only success signal needed. Bounded: a stack that survives
     * its window is blacklisted briefly so the sweep or corridor work can
     * move on instead of orbiting it forever.
     */
    run(m, tick) {
        const b = this.bot;
        if (!m.pickup)
            return false;
        const e = m.pickupEntity?.isValid ? m.pickupEntity : undefined;
        if (!e) {
            m.pickup = undefined;
            m.pickupEntity = undefined;
            b.nav.reset();
            m.scan = b.newScan(m);
            return false;
        }
        if (tick > (m.pickupUntil ?? 0)) {
            m.blocked?.set(key(floor(e.location)), tick + 300);
            m.pickup = undefined;
            m.pickupEntity = undefined;
            m.standSince = undefined;
            b.nav.reset();
            return false;
        }
        m.pickup = floor(e.location);
        const dist = distance(e.location, b.sim.location);
        if (dist > 1.2) {
            m.standSince = undefined;
            let r = b.nav.go(center(m.pickup), tick);
            if (r === "failed")
                r = b.navTo(e.location, tick, 1);
            if (r === "failed" || r === "blocked") {
                // Short hop the planner refuses (leaves, a fence line, a
                // seam): walk it directly, bounded by the pickup window.
                b.nav.reset();
                b.nav.stuck = false;
                this.pushToward(e.location);
            }
        }
        else {
            // Standing on it: the engine's own pickup runs after a short
            // delay (typically 10-20 ticks). Wait up to 30 ticks (1.5s),
            // then move on if inventory is full or stack is uncollectable.
            b.nav.reset();
            b.sim.stopMoving();
            m.standSince = m.standSince ?? tick;
            if (tick - m.standSince > 30) {
                m.blocked?.set(key(floor(e.location)), tick + 300);
                m.pickup = undefined;
                m.pickupEntity = undefined;
                m.standSince = undefined;
                return false;
            }
        }
        return true;
    }
    /**
     * Loot pass for cells the brain remembered (m.loot): the nearest matching
     * stack still present within `reach` takes over the tick; cells with
     * nothing left there anymore are forgotten immediately. True while a
     * pickup owns the tick.
     */
    flush(m, tick, radius = 3, reach = 20) {
        const b = this.bot;
        if (!m.loot?.size)
            return false;
        const here = b.sim.location, cells = [];
        for (const k of m.loot.keys()) {
            const [x, y, z] = k.split(",").map(Number);
            const p = { x, y, z };
            const d = distance(p, here);
            if (d <= reach)
                cells.push({ k, p, d });
        }
        cells.sort((a, c) => a.d - c.d);
        for (const c of cells) {
            const e = this.near(m, c.p, radius, tick);
            if (e) {
                m.pickup = floor(e.location);
                m.pickupEntity = e;
                m.pickupUntil = tick + 30; // FAST: was 80, now 30 ticks
                m.loot.delete(c.k);
                return true;
            }
            m.loot.delete(c.k); // nothing matching left there; stop tracking
        }
        return false;
    }
    /**
     * Straight-line last resort used when the planner refuses a short hop
     * (drops on leaves, behind a fence, in a seam the search cannot resolve):
     * walk at the point, hopping the one-block steps. Nearest-first, no
     * detours, so it cannot wander off. Callers bound it with their own tick
     * budget and an honest fallback message.
     */
    pushToward(loc) {
        const b = this.bot;
        if (horizontal(b.sim.location, loc) < 1.4 &&
            Math.abs(b.sim.location.y - loc.y) < 1.6) {
            b.sim.stopMoving();
            return;
        }
        b.sim.isSprinting = false;
        b.sim.moveToLocation(b.host.relative({ x: loc.x, y: loc.y, z: loc.z }), { faceTarget: true });
        if (b.sim.isOnGround)
            b.sim.jump();
    }
}
