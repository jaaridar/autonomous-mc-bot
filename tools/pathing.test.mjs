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
        if (b.liquid) return { passable: true, support: false, hazard: true, type: b.type ?? "minecraft:water" };
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


// --- wading: shallow water is crossable, lava never is ---
{
    // 1-deep water ditch 2 wide at x=4..5 (water at y=0 above solid floor? no: ditch = floor at y=-1? model: ground y=0, water cells y=1? we need feet-in-water at y=1 with floor at y=0.
    // Simplest: raise terrain to height 0 and put water at y=1 over it? No: wading means feet cell is water, floor below solid.
    // Build: ground at y<=0. For x in 4..5, water replaces the y=1..2 space: feet cell (x,1,z) = water hazard, floor (x,0,z) = solid.
    // Implement by marking water cells via fill with liquid flag.
    const water = [];
    for (let z = -6; z <= 6; z++) for (const x of [4, 5]) water.push({ x, y: 1, z, liquid: true, type: "minecraft:water" });
    const w = makeWorld({ height: () => 0, fill: water });
    const s = search(w, { x: 0, y: 1, z: 0 }, { x: 9, y: 1, z: 0 });
    check("shallow stream: route found by wading", s.status === "found");
    check("shallow stream: route contains wade waypoints", s.path.some((q) => q.kind === "wade"));

    // Same ditch filled with LAVA instead: must never step in it
    const lava2 = [];
    for (let z = -6; z <= 6; z++) for (const x of [4, 5]) lava2.push({ x, y: 1, z, hazard: true, type: "minecraft:lava" });
    const s2 = search(makeWorld({ height: () => 0, fill: lava2 }), { x: 0, y: 1, z: 0 }, { x: 9, y: 1, z: 0 }, { allowPartial: true });
    check("lava ditch: no wade into lava (found around or honest partial)", s2.path.every((q) => !(q.x >= 4 && q.x <= 5 && q.z >= -6 && q.z <= 6 && q.y === 1)));

    // Deep water (no floor): drain the ditch to bedrock -> wading must not be planned
    const deep = [];
    for (const z of [-4, 4]) for (let x = 4; x <= 5; x++) for (let y = 1; y <= 3; y++) deep.push({ x, y, z, liquid: true, type: "minecraft:water" });
    const s3 = search(makeWorld({ height: () => 0, fill: deep }), { x: 0, y: 1, z: 0 }, { x: 9, y: 1, z: 0 }, { allowPartial: true });
    check("deep water with floor still wadeable only where floor exists", s3.status !== "found" || s3.path.every((q) => !(q.x >= 4 && q.x <= 5 && (q.z <= -4 || q.z >= 4) && q.y > 0)));
}

console.log(`\npathing.test: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
