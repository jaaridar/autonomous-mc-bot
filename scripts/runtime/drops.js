import { center, distance, floor, horizontal, key } from "../core/math.js";
import { matches } from "../core/recipes.js";
import { MINE } from "../core/world.js";
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
                return !!item && matches(item.typeId, want);
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
            m.blocked?.set(key(floor(e.location)), tick + 900);
            m.pickup = undefined;
            m.pickupEntity = undefined;
            m.standSince = undefined;
            b.nav.reset();
            return false;
        }
        m.pickup = floor(e.location);
        if (distance(e.location, b.sim.location) > 1.0) {
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
            // delay. Wait a moment, then treat a stack that refuses to
            // vanish as unreachable and move on - a live task sweep will
            // revisit the area; orbiting it forever reads as a stuck bot.
            b.nav.reset();
            b.sim.stopMoving();
            m.standSince = m.standSince ?? tick;
            if (tick - m.standSince > 10) { // FAST: was 30, now 10 ticks = 0.5 sec
                m.blocked?.set(key(floor(e.location)), tick + 900);
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
