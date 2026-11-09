/**
 * Regression tests for the terrain/navigation/escape fixes:
 *  - HP-aware drop moves in PathSearch (healthy bot may take a 5-block drop,
 *    a hurt bot may not)
 *  - lava-adjacent routing (paths keep headroom from lava when a detour exists)
 *  - best-effort partial route on partially open terrain
 *  - rankEscapePlans: no plan is silently discarded; tunnels/preferred walks win
 * Run: `node tools/pathing.test.mjs` (run-all.mjs runs it too).
 */
import { PathSearch } from "../scripts/core/navigation.js";
import { rankEscapePlans } from "../scripts/core/escape-strategy.js";

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) pass++; else { fail++; console.log("FAIL: " + name); } };

// Tiny voxel world: ground plane with configurable height map and hazard fills.
function makeWorld({ size = 40, height = () => 0, fill = [] }) {
    const H = new Map();
    for (let x = -size; x <= size; x++) for (let z = -size; z <= size; z++) {
        const top = height(x, z);
        for (let y = -64; y <= top; y++) H.set(`${x},${y},${z}`, { solid: true });
    }
    for (const b of fill) {
        const k = `${b.x},${b.y},${b.z}`;
        if (b.remove) H.delete(k); else H.set(k, b);
    }
    return (p) => {
        const b = H.get(`${Math.floor(p.x)},${Math.floor(p.y)},${Math.floor(p.z)}`);
        if (!b) return { passable: true, support: false, hazard: false, type: "minecraft:air" };
        if (b.hazard) return { passable: false, support: true, hazard: true, type: b.type ?? "minecraft:lava" };
        return { passable: false, support: true, hazard: false, type: b.type ?? "minecraft:stone" };
    };
}
const search = (read, start, goal, opts = {}) => {
    const s = new PathSearch(read, start, goal, 0.7, true, opts.maxNodes ?? 2000, opts.radius ?? 32, opts.allowPartial ?? false, [], opts);
    let n = 0;
    while (s.status === "searching" && n++ < 100000) s.step(200);
    return s;
};

// Flat ground routes fine
check("flat route found", search(makeWorld({ height: () => 0 }), { x: 0, y: 1, z: 0 }, { x: 15, y: 1, z: 0 }).status === "found");

// 5-block cliff: healthy bot plans the drop, hurt bot refuses it
check("healthy bot takes 5-block cliff drop", search(makeWorld({ height: (x) => (x >= 5 ? -5 : 0) }), { x: 0, y: 1, z: 0 }, { x: 10, y: -4, z: 0 }, { maxDrop: 5 }).status === "found");
check("hurt bot refuses 5-block cliff drop", search(makeWorld({ height: (x) => (x >= 5 ? -5 : 0) }), { x: 0, y: 1, z: 0 }, { x: 10, y: -4, z: 0 }, { maxDrop: 3, allowPartial: true }).status !== "found");
check("medium bot takes 4-block drop", search(makeWorld({ height: (x) => (x >= 5 ? -4 : 0) }), { x: 0, y: 1, z: 0 }, { x: 10, y: -3, z: 0 }, { maxDrop: 4 }).status === "found");

// Lava strip: route found that keeps headroom from lava
const lava = [];
for (let x = 5; x <= 7; x++) for (let z = -2; z <= 2; z++) lava.push({ x, y: 0, z, hazard: true, type: "minecraft:lava" });
{
    const s = search(makeWorld({ height: () => 0, fill: lava }), { x: 0, y: 1, z: 0 }, { x: 12, y: 1, z: 0 }, { allowPartial: true });
    const lavaAdjacent = (q) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => (s.read({ x: q.x + dx, y: q.y, z: q.z + dz })?.type ?? "").includes("lava"));
    check("lava strip: route found", s.status === "found");
    check("lava strip: no lava-adjacent cells on the route", s.path.every((q) => !lavaAdjacent(q)));
}

// Best effort: sealed in a small pocket - walks toward the wall honestly, never "found"
// Wall long enough that no in-radius detour exists -> never reported reached.
const pocket = [];
for (let z = -15; z <= 15; z++) for (const y of [1, 2, 3]) pocket.push({ x: 2, y, z });
{
    const s = search(makeWorld({ height: () => 0, fill: pocket }), { x: 0, y: 1, z: 0 }, { x: 10, y: 1, z: 0 }, { allowPartial: true, maxNodes: 400, radius: 8 });
    check("walled goal does not fake success", s.status !== "found");
}

// Escape plan ranking: preferred first, tunnels beat walks, nothing valid is dropped
const ranked = rankEscapePlans([
    { kind: "walk", preferred: false },
    { kind: "tunnel", preferred: false },
    { kind: "walk", preferred: true },
    { kind: "dead", preferred: true },
]);
check("dead plans are dropped", ranked.length === 3);
check("preferred walk outranks sideways walk", ranked.findIndex((p) => p.kind === "walk" && p.preferred) < ranked.findIndex((p) => p.kind === "walk" && !p.preferred));
check("tunnel outranks sideways walk", ranked.findIndex((p) => p.kind === "tunnel") < ranked.findIndex((p) => p.kind === "walk" && !p.preferred));
const onlySideways = rankEscapePlans([{ kind: "walk", preferred: false }]);
check("sideways walk is still offered when it is the only way out", onlySideways.length === 1 && onlySideways[0].kind === "walk");
check("empty input does not throw", rankEscapePlans(undefined).length === 0);

console.log(`\npathing.test: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
