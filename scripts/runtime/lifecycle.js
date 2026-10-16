// Reload lifecycle: what survives `/reload`, and what must be rebuilt.
//
// `/reload` (and re-entering a world) tears the script context down and runs
// main.js again from scratch. Three things go wrong if that is ignored:
//
//   1. subscriptions are registered twice, so every chat command runs twice;
//   2. the tick pump from the previous load keeps running (two brains, one bot);
//   3. the simulated player from the previous load is still standing in the
//      world with no brain attached, and the new load refuses to spawn "because
//      a Verdant already exists".
//
// This module makes the first two detectable and fixable, and hands main.js the
// information it needs for the third (the orphan takeover already lives in
// main.js's spawn path). Everything is cheap: one dynamic property read and a
// counter at load time, plus a small registry of handles.
//
// Contract for pack code: register every event subscription through `on()`, and
// every repeating timer through `timer()`. The offline gate `node tools/gates.mjs
// reload` fails the build if a raw `.subscribe(` or `system.runInterval(` appears
// outside this file.

import { system, world } from "@minecraft/server";

const LOAD_KEY = "verdant:loads";
const handles = new Map();
let loadId = 0;
let pumpId = undefined;
const notes = [];

/** Register an event subscription and return its unsubscribe handle. */
export function on(name, signal, callback) {
    if (!signal || typeof signal.subscribe !== "function") {
        notes.push(`subscription '${name}' unavailable on this engine version`);
        return () => { };
    }
    const handle = signal.subscribe(callback);
    handles.set(name, { kind: "event", signal, handle });
    return () => {
        try { signal.unsubscribe?.(handle); }
        catch { /* already gone */ }
        handles.delete(name);
    };
}

/** Start (or restart) the single 20 Hz tick pump. Refuses to double-pump. */
export function pump(name, callback, every = 1) {
    if (pumpId !== undefined) {
        notes.push(`pump '${name}' replaced the previous pump (previous load leaked it?)`);
        try { system.clearRun(pumpId); }
        catch { /* nothing to clear */ }
    }
    pumpId = system.runInterval(() => {
        try { callback(); }
        catch (e) { console.warn(`[Verdant] tick error: ${e?.stack ?? e}`); }
    }, every);
    handles.set(`pump:${name}`, { kind: "interval", id: pumpId, name });
    return pumpId;
}

/** Track a repeating timer so it can be disposed on reload. */
export function timer(name, callback, ticks, repeating = true) {
    const id = repeating ? system.runInterval(callback, ticks) : system.runTimeout(callback, ticks);
    handles.set(`timer:${name}`, { kind: repeating ? "interval" : "timeout", id, name });
    return id;
}

export function clear(name) {
    const entry = handles.get(name);
    if (!entry)
        return false;
    try {
        if (entry.kind === "event")
            entry.signal.unsubscribe?.(entry.handle);
        else
            system.clearRun(entry.id);
    }
    catch { /* already gone */ }
    handles.delete(name);
    return true;
}

/** Undo every registration made by the previous load of this module. */
export function disposeAll(reason = "reload") {
    let disposed = 0;
    for (const [name, entry] of [...handles]) {
        try {
            if (entry.kind === "event")
                entry.signal.unsubscribe?.(entry.handle);
            else
                system.clearRun(entry.id);
            disposed++;
        }
        catch { /* already gone */ }
        handles.delete(name);
    }
    if (pumpId !== undefined) {
        try { system.clearRun(pumpId); }
        catch { /* already gone */ }
        pumpId = undefined;
    }
    if (disposed)
        console.warn(`[Verdant] lifecycle: disposed ${disposed} handle(s) on ${reason}`);
    return disposed;
}

/**
 * Called once per module evaluation. Records the load in a dynamic property so
 * the bot can tell the operator "this is reload #N" - which is exactly the
 * question you ask when the bot behaves oddly after an edit.
 */
export function beginLoad() {
    loadId = readLoads() + 1;
    try { world.setDynamicProperty(LOAD_KEY, loadId); }
    catch { /* read-only world */ }
    notes.length = 0;
    handles.clear();
    pumpId = undefined;
    console.warn(`[Verdant] script load #${loadId}`);
    return loadId;
}

function readLoads() {
    try {
        const value = world.getDynamicProperty(LOAD_KEY);
        return typeof value === "number" ? value : 0;
    }
    catch {
        return 0;
    }
}

/** What `/reload` should tell the operator: the state of this load. */
export function status() {
    return {
        loadId,
        registrations: [...handles.keys()],
        pump: pumpId !== undefined,
        notes: [...notes],
        loads: readLoads(),
    };
}

export function describe() {
    const s = status();
    return `load #${s.loadId} • pump ${s.pump ? "running" : "missing"} • ${s.registrations.length} registration(s)${s.notes.length ? ` • ${s.notes.join("; ")}` : ""}`;
}

/**
 * The reload checklist, run at load time. It is deliberately quiet: the pack must
 * still start in a world where the previous load left nothing behind.
 */
export function beginSession({ onReload } = {}) {
    const id = beginLoad();
    // Fix load-ordering artefact: a pump left by a previous load cannot survive a
    // real `/reload` (the context is destroyed), but in a debugger re-eval it can.
    disposeAll("session start");
    if (id > 1 && onReload)
        onReload(id);
    return id;
}

export { LOAD_KEY };
