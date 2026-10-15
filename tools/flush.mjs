// Focused tests for Drops.flush (deferred tree-loot pickup pass), run against
// the load copy, which has @minecraft/* stubs available. Drops itself imports
// only core modules, so no stub is strictly needed, but the copy keeps every
// import path exactly as the pack ships them.
import { Drops } from "./load/scripts/runtime/looting.js";
const mkBot = (loc, entities) => ({
    sim: {
        location: loc,
        stopMoving() { },
        isSprinting: false,
        moveToLocation() { },
        isOnGround: true,
        jump() { },
    },
    terrain: { dimension: { getEntities: () => entities }, safe: () => true },
    nav: { reset() { }, stuck: false },
    host: { relative: (p) => p },
});
const mkEntity = (x, y, z, type) => ({
    isValid: true,
    location: { x, y, z },
    getComponent: () => ({ itemStack: { typeId: type } }),
});
let fails = 0;
const ok = (cond, name) => {
    console.log((cond ? "pass" : "FAIL") + " " + name);
    if (!cond)
        fails++;
};
{
    const e = mkEntity(11, 10, 10, "minecraft:oak_log");
    const bot = mkBot({ x: 10.5, y: 10, z: 10.5 }, [e]);
    const d = new Drops(bot);
    const m = { item: "minecraft:oak_log", loot: new Map([["11,10,10", 1]]), blocked: new Map() };
    const r = d.flush(m, 100, 3, 20);
    ok(r === true && m.pickup && m.pickupEntity === e && m.loot.size === 0, "flush picks the matching drop and drops the cell");
}
{
    const bot = mkBot({ x: 10, y: 10, z: 10 }, []);
    const d = new Drops(bot);
    const m = { item: "minecraft:oak_log", loot: new Map([["11,10,10", 1]]), blocked: new Map() };
    ok(d.flush(m, 100, 3, 20) === false && m.loot.size === 0, "flush forgets cells with nothing left");
}
{
    const bot = mkBot({ x: 0, y: 10, z: 0 }, []);
    const d = new Drops(bot);
    const m = { item: "minecraft:oak_log", loot: new Map([["40,10,40", 1]]), blocked: new Map() };
    ok(d.flush(m, 100, 3, 20) === false && m.loot.size === 1, "flush ignores cells beyond reach");
}
{
    const far = mkEntity(14, 10, 10, "minecraft:oak_log");
    const near = mkEntity(11, 10, 10, "minecraft:oak_log");
    const bot = mkBot({ x: 10.5, y: 10, z: 10.5 }, [far, near]);
    const d = new Drops(bot);
    const m = { item: "minecraft:oak_log", loot: new Map([["14,10,10", 1], ["11,10,10", 1]]), blocked: new Map() };
    d.flush(m, 100, 3, 20);
    ok(m.pickupEntity === near && m.loot.size === 1, "flush takes the nearest cell first");
}
{
    const e = mkEntity(11, 10, 10, "minecraft:birch_log");
    const bot = mkBot({ x: 10.5, y: 10, z: 10.5 }, [e]);
    const d = new Drops(bot);
    const m = { item: "minecraft:oak_log", loot: new Map([["11,10,10", 1]]), blocked: new Map() };
    ok(d.flush(m, 100, 3, 20) === false && m.loot.size === 0, "flush ignores other item types");
}
console.log(fails ? "FLUSH FAILED: " + fails : "flush tests passed");
process.exit(fails ? 1 : 0);
