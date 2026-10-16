import { world } from "@minecraft/server";
import { blank, fromJson, toJson, upsertSpot, removeSpot, nearestSpot, spotsOf, setHome, clearHome, setDeath, clearDeath, sanitizePrefs, summary, } from "../core/memory.js";
const KEY = "verdant:mem";
/**
 * Persistent memory on top of the world's dynamic properties. Writes happen
 * only when the store genuinely changed (a new chest, a new base, a death),
 * so the common tick costs one boolean check. Reads never throw: a corrupt
 * store degrades to an empty one with a console warning.
 */
export class Memory {
    constructor() {
        this.store = blank();
        this.dirty = false;
        this.loaded = false;
        this.prefsJson = "";
        this.writes = 0;
    }
    /** Idempotent lazy load; deferred until the world is definitely awake. */
    load() {
        if (this.loaded)
            return this.store;
        try {
            this.store = fromJson(world.getDynamicProperty(KEY));
        }
        catch (e) {
            console.warn("[Verdant] Memory read failed; starting empty: " + e);
            this.store = blank();
        }
        this.loaded = true;
        return this.store;
    }
    /** Persist if anything changed. Cheap to call every save point. */
    flush() {
        if (!this.dirty)
            return false;
        try {
            world.setDynamicProperty(KEY, toJson(this.store));
            this.dirty = false;
            this.writes++;
            return true;
        }
        catch (e) {
            console.warn("[Verdant] Memory write failed: " + e);
            return false;
        }
    }
    /* ------------------------------ preferences ---------------------------- */
    prefs() {
        return this.load().prefs;
    }
    /** Persist operator settings when they actually differ (string compare). */
    rememberPrefs(settings) {
        const json = JSON.stringify(sanitizePrefs(settings) ?? {});
        if (json === this.prefsJson)
            return;
        this.prefsJson = json;
        this.store.prefs = JSON.parse(json);
        this.dirty = true;
    }
    /* --------------------------------- home -------------------------------- */
    home() {
        const h = this.load().home;
        return h ? { x: h.x, y: h.y, z: h.z, dim: h.dim } : undefined;
    }
    setHome(pos, dim) {
        setHome(this.store, pos, dim);
        this.dirty = true;
    }
    clearHome() {
        clearHome(this.store);
        this.dirty = true;
    }
    /* -------------------------------- markers ------------------------------ */
    /** Record a sighting; returns true when it was new information. */
    notice(kind, pos, dim, tick) {
        if (upsertSpot(this.store, { kind, dim, x: pos.x, y: pos.y, z: pos.z, t: tick })) {
            this.dirty = true;
            return true;
        }
        return false;
    }
    forget(kind, pos, dim) {
        if (removeSpot(this.store, kind, dim, pos))
            this.dirty = true;
    }
    nearest(kind, dim, pos) {
        return nearestSpot(this.store, kind, dim, pos);
    }
    ofKind(kind, dim) {
        return spotsOf(this.store, kind, dim);
    }
    /* --------------------------------- death ------------------------------- */
    death() {
        const d = this.load().death;
        return d ? { x: d.x, y: d.y, z: d.z, dim: d.dim, t: d.t, items: d.items } : undefined;
    }
    setDeath(pos, dim, tick, counts) {
        if (setDeath(this.store, pos, dim, tick, counts)) {
            this.dirty = true;
            return true;
        }
        return false;
    }
    clearDeath() {
        clearDeath(this.store);
        this.dirty = true;
    }
    summary() {
        return summary(this.load());
    }
}
