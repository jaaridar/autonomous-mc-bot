// Offline stand-in for @minecraft/server-gametest.
//
// The pack uses this module for exactly one thing: registering the remote host
// test that ultimately spawns the simulated player. Offline, `register()`
// returns a chainable Test handle and records the registration so a test can
// drive it by hand:
//
//   const test = __gametest.tests.get("verdant:host");
//   const sim = await test.run();            // same as the engine running it
//
// Nothing runs on its own; no timers, no world mutation.

import { __harness, __engine } from "@minecraft/server";

class FakeTest {
    constructor(group, name, callback) {
        this.group = group;
        this.name = name;
        this.callback = callback;
        this.maxTicksValue = 100;
        this.structureNameValue = undefined;
        this.batch = undefined;
        this.required = true;
        this.simulations = [];
    }
    maxTicks(ticks) { this.maxTicksValue = ticks; return this; }
    structureName(name) { this.structureNameValue = name; return this; }
    batch(batch) { this.batch = batch; return this; }
    requiredSuccess() { this.required = true; return this; }
    optional() { this.required = false; return this; }
    tag() { return this; }
    /**
     * Real engine: `test.spawnSimulatedPlayer(options)` creates the sim inside
     * the test's structure. Offline it creates one in the fake world.
     */
    spawnSimulatedPlayer(options = {}) {
        const location = options.location ?? options.position ?? { x: 0, y: 65, z: 0 };
        const dimension = options.dimension ?? "minecraft:overworld";
        const sim = __engine.spawnSim({ name: options.name ?? "Verdant", location, dimension });
        sim.__gametestName = options.name ?? "Verdant";
        this.simulations.push(sim);
        return sim;
    }
    spawnEntity(typeId, location, options = {}) {
        const sim = __engine.spawnEntity(typeId, location ?? { x: 0, y: 65, z: 0 }, __engine.overworld, options);
        this.simulations.push(sim);
        return sim;
    }
    assert(condition) { if (!condition) throw new Error("GameTest assertion failed"); }
    succeed() { this.__succeeded = true; }
    fail(message) { this.__failed = message ?? "failed"; }
    getWorld() { return __engine.world; }
    selectPlayer(player) { return player; }
    run() {
        const result = this.callback(this);
        return result && typeof result.then === "function" ? result : Promise.resolve(result);
    }
}

const tests = new Map();
const batches = new Map();

export function register(group, name, callback) {
    const test = new FakeTest(group, name, callback);
    tests.set(`${group}:${name}`, test);
    return test;
}
export function registerAsync(group, name, callback) { return register(group, name, callback); }

export class SimulatedPlayer { }
export const __gametest = {
    tests,
    batches,
    /** Run a registered test by "group:name" and return the spawned sims. */
    async run(key) {
        const test = tests.get(key);
        if (!test) throw new Error(`no registered test ${key} (have: ${[...tests.keys()].join(", ")})`);
        await test.run();
        return test.simulations;
    },
    reset() { tests.clear(); batches.clear(); },
    list: () => [...tests.keys()],
    _harness: __harness,
};
