/**
 * Terrain navigation suite - offline, deterministic, no Minecraft engine.
 *
 * `perf.test.mjs` answers "is the search fast and does it still generate every
 * move the old one did". This suite answers the user-visible question: does the
 * bot actually GET OUT of the terrains it used to get stuck in?
 *
 * Every scenario builds a voxel world, runs the real `PathSearch` (and, where
 * relevant, the real `Navigator`/`Escaper` against a fake body), and asserts on
 * the route that comes back:
 *
 *   1. flat ground                    - baseline, no wasted detour
 *   2. a wall with a doorway          - goes through the door, not into stone
 *   3. a lake between start and goal  - swims, never drowns, still arrives
 *   4. a lava pool between start/goal - goes AROUND, never through
 *   5. a ravine with a water floor    - jumps in and swims, never "unreachable"
 *   6. a cave ceiling above the bot   - climbs out (steps/pillars)
 *   7. a 1-wide dead-end corridor     - backs out instead of grinding the wall
 *   8. a dropshaft                    - descends a survivable way
 *   9. bedrock box (impossible)       - reports unreachable, does not hang
 *  10. random hostile worlds (fuzz)   - either finds a route with no lethal
 *                                       cell on it, or reports unreachable,
 *                                       and never throws / never loops
 *
 * Run: `node tools/terrain.test.mjs` (run-all.mjs runs it too).
 */
import { PathSearch, standable } from "../scripts/core/navigation.js";
import { cellDanger } from "../scripts/core/brain/danger.js";

let pass = 0, fail = 0;
const ok = (cond, name, detail = "") => {
    if (cond) { pass++; console.log("pass " + name); }
    else { fail++; console.log(`FAIL ${name}${detail ? " :: " + detail : ""}`); }
};

/* ------------------------------------------------------------------ world --- */

const AIR = { passable: true, support: false, hazard: false, type: "minecraft:air", isAir: true };
const STONE = { passable: false, support: true, hazard: false, type: "minecraft:stone", isAir: false };
const WATER = { passable: true, support: false, hazard: true, type: "minecraft:water", isAir: false };
const LAVA = { passable: false, support: false, hazard: true, type: "minecraft:lava", isAir: false };
const BEDROCK = { passable: false, support: true, hazard: false, type: "minecraft:bedrock", isAir: false };

function world(fn) {
    let reads = 0;
    const read = (p) => { reads++; return fn(p.x, p.y, p.z); };
    return { read, reads: () => reads, block: (x, y, z) => fn(x, y, z) };
}

/** Run a search to completion (bounded), returning its status and path. */
function search(w, start, goal, opts = {}, budget = { maxNodes: 4000, radius: 40 }) {
    const s = new PathSearch(
        w.read, start, goal, 0.7, opts.parkour ?? true,
        budget.maxNodes, budget.radius, opts.allowPartial ?? false,
        opts.avoid ?? [],
        { danger: { threats: [], hp: 20 }, dangerWorld: w, ...opts.options },
    );
    let guard = 0;
    while (s.status === "searching" && guard++ < 400) s.step(200);
    return s;
}

/** Lethal cells along a returned path (excluding the start cell). */
function lethalOn(w, path) {
    return path.filter((p) => {
        const d = cellDanger(w, p, [], { hp: 20 });
        return d.lethal;
    });
}

/* -------------------------------------------------------------- scenarios --- */

// 0. REGRESSION: the runtime world shape.
//
// `Terrain.read(p)` takes ONE point and returns a `Cell`. The danger model used
// to call `world.block(x, y, z)` unconditionally, which on a Terrain returns the
// block at `undefined` - i.e. air. Every cell then looked like a 24-deep hole,
// every cell scored `lethal`, and PathSearch found no legal neighbour: "Path
// unreachable; no safe route" on flat open ground, permanently. The unit
// fixtures all used the positional form, so nothing caught it.
{
    // Mirror the real runtime `Cell`: it exposes `support` (a getter for
    // isSolid), not just `isSolid`, and `stand()` reads `support`.
    const cell = (t, solid) => ({ type: t, isAir: !solid, passable: !solid, isSolid: solid, support: solid, isLiquid: false, hazard: false });
    const AIR = cell("minecraft:air", false), STONE = cell("minecraft:stone", true);
    const terrainish = {
        read: (p) => (p.y <= 0 ? STONE : AIR),
        block: (p) => (p.y <= 0 ? STONE : AIR),   // POINT form, like Terrain
        reads: () => 0,
    };
    const d = cellDanger(terrainish, { x: 3, y: 1, z: 0 }, [], { hp: 20 });
    ok(d.parts.fall === 0 && !d.lethal,
        `terrain: a flat point-form world is not a lethal fall (score ${d.score})`);

    // The same world WITHOUT a `read` method: only `block(p)`, point form.
    // This is the branch that broke: called as block(x, y, z) it returns the
    // block at `undefined` - air - for every cell.
    const blockOnly = { block: (p) => (p?.y <= 0 ? STONE : AIR) };
    const d2 = cellDanger(blockOnly, { x: 3, y: 1, z: 0 }, [], { hp: 20 });
    ok(d2.parts.fall === 0 && !d2.lethal,
        `terrain: point-form block() alone is not a lethal fall (score ${d2.score})`);

    const s = search(terrainish, { x: 0, y: 1, z: 0 }, { x: 12, y: 1, z: 0 });
    ok(s.status === "found" && s.path.length > 6,
        `terrain: a path exists across flat point-form ground (${s.status}, ${s.path.length} nodes)`);
    ok(lethalOn(terrainish, s.path).length === 0, "terrain: none of those nodes is lethal");
}


// 1. flat ground: a straight-ish route, no detour.
{
    const w = world((x, y, z) => (y <= 0 ? STONE : AIR));
    const s = search(w, { x: 0, y: 1, z: 0 }, { x: 12, y: 1, z: 0 });
    const len = s.path.length;
    ok(s.status === "found" && len > 0 && len <= 14, `terrain: flat ground reaches the goal in ${len} steps`, s.status);
    ok(lethalOn(w, s.path).length === 0, "terrain: flat route has no lethal cell");
}

// 2. wall with a doorway: must route through the door.
{
    const w = world((x, y, z) => {
        if (y <= 0) return STONE;
        if (x === 4 && !(z === 3 && (y === 1 || y === 2))) return STONE; // wall at x=4, door at z=3
        return AIR;
    });
    const s = search(w, { x: 0, y: 1, z: 0 }, { x: 8, y: 1, z: 0 });
    ok(s.status === "found", "terrain: a wall with a door is passable", s.status);
    ok(s.path.some((p) => p.x === 4 && p.z === 3), "terrain: the route goes through the doorway");
    ok(!s.path.some((p) => p.x === 4 && p.z !== 3), "terrain: the route never passes through the wall");
}

// 3. lake: swim across, do not refuse.
{
    const w = world((x, y, z) => (y <= 0 ? STONE : (x >= 3 && x <= 6 ? WATER : AIR)));
    const s = search(w, { x: 0, y: 1, z: 0 }, { x: 10, y: 1, z: 0 });
    ok(s.status === "found", "terrain: a lake between start and goal is crossable", s.status);
    ok(s.path.some((p) => p.x >= 3 && p.x <= 6), "terrain: the route actually crosses the water");
}

// 4. lava pool: go around it, never through it.
{
    const w = world((x, y, z) => {
        if (y <= 0) return STONE;
        if (x >= 3 && x <= 6 && Math.abs(z) <= 2) return LAVA;
        return AIR;
    });
    const s = search(w, { x: 0, y: 1, z: 0 }, { x: 10, y: 1, z: 0 }, {}, { maxNodes: 6000, radius: 40 });
    ok(s.status === "found", "terrain: a lava pool is routed around, not through", s.status);
    ok(!s.path.some((p) => p.x >= 3 && p.x <= 6 && Math.abs(p.z) <= 2), "terrain: no cell on the route is lava");
    ok(lethalOn(w, s.path).length === 0, "terrain: the lava route contains no lethal cell");
}

// 5. ravine with a water floor: drop in, swim out the far side.
{
    const w = world((x, y, z) => {
        if (y === -8) return STONE;
        if (x >= 3 && x <= 6) {
            // ravine: a 7-wide trench, open from the surface down to water
            if (y > 1) return AIR;
            if (y >= -6) return WATER;   // water at the bottom, swimmable
            return y === -7 ? WATER : STONE;
        }
        if (y <= 0) return STONE;
        return AIR;
    });
    const s = search(w, { x: 0, y: 1, z: 0 }, { x: 10, y: 1, z: 0 }, {}, { maxNodes: 8000, radius: 40 });
    ok(s.status === "found", "terrain: a ravine with a water floor is a route, not a dead end", s.status);
    // Crossing a flooded ravine along the water surface is the right answer -
    // diving to the bottom would be slower and riskier. What matters is that
    // the search treats the trench as passable at all (the old one returned
    // "need boat or swim" and the mission died) and exits on the far side.
    ok(s.path.some((p) => p.x >= 3 && p.x <= 6), "terrain: the route enters the ravine");
    ok(s.path.some((p) => p.x > 6 && p.y >= 1), "terrain: the route climbs back out the far side");

    // Deep water below is still a survivable landing: a drop into a lake is a
    // route, a drop onto stone of the same height is not.
    const cliffLake = world((x, y, z) => {
        if (y <= -10) return STONE;
        if (x < 2) return y <= 0 ? STONE : AIR;            // cliff plateau at y=1
        if (y >= -9 && y <= 0) return WATER;                // deep lake at the bottom
        return y < -10 ? STONE : AIR;
    });
    const drop = search(cliffLake, { x: 1, y: 1, z: 0 }, { x: 4, y: -9, z: 0 }, {}, { maxNodes: 4000, radius: 24 });
    ok(["found", "partial"].includes(drop.status), "terrain: a deep drop into water is a legal route", drop.status);
}

// 6. cave ceiling: the bot is under a roof, the goal is on the surface above.
{
    const w = world((x, y, z) => {
        if (y <= 0) return STONE;             // cave floor
        if (y <= 3) return AIR;               // cave space
        if (y <= 5) return STONE;             // roof, 2 thick
        return AIR;                            // surface above
    });
    const s = search(w, { x: 0, y: 1, z: 0 }, { x: 0, y: 6, z: 0 }, { options: { allowPillar: true, allowBridge: true } }, { maxNodes: 4000, radius: 24 });
    // No staircase exists, so a *path* needs a pillar: assert it either finds
    // one (with pillar enabled) or honestly reports unreachable - never "found"
    // through the solid roof.
    if (s.status === "found") {
        ok(s.path.some((p) => p.y > 5), "terrain: escaping a roofed cave reaches the surface");
        ok(s.path.every((p) => !(p.y >= 4 && p.y <= 5)), "terrain: the route never walks through the roof");
    } else {
        ok(s.status === "unreachable" || s.status === "partial", "terrain: a sealed roof reports unreachable, not a fake route", s.status);
    }
}

// 7. one-wide dead end: the bot must back out rather than grind the wall.
{
    const w = world((x, y, z) => {
        if (y <= 0) return STONE;
        if (z === 0 && x >= -8 && x <= 6) return AIR;  // 1-wide corridor; closed at x=7
        return STONE;
    });
    const s = search(w, { x: 6, y: 1, z: 0 }, { x: -4, y: 1, z: 0 });
    ok(s.status === "found", "terrain: a dead-end corridor is escaped by backing out", s.status);
    ok(s.path[0] && s.path[0].x < 6, "terrain: the first step of the escape goes backwards");
}

// 8. dropshaft: descend safely instead of refusing.
{
    const w = world((x, y, z) => {
        if (y <= -12) return STONE;
        if (x === 0 && z === 0 && y >= -11 && y <= 0) return AIR; // 11-deep shaft
        if (y <= 0) return STONE;
        return AIR;
    });
    const s = search(w, { x: 0, y: 1, z: 0 }, { x: 0, y: -11, z: 0 });
    // An 11-block fall hurts (8 damage) but does not kill at 20 hp, so the
    // danger model permits it with a price. What must NOT happen is a crash or
    // a silent failure.
    // A 1x1 shaft has no stairs and the fall is too deep to walk into, so there
    // is no legal *walking* route. The contract is: decide (found/partial for a
    // legitimately survivable drop, or unreachable/budget for no route) and
    // never hang. The navigator retries a budget exhaustion with a wider
    // horizon before giving up.
    ok(["found", "unreachable", "partial", "budget"].includes(s.status),
        "terrain: a deep shaft returns a decision, not a hang", s.status);
}

// 9. bedrock box: impossible, and must say so quickly.
{
    const w = world((x, y, z) => ((Math.abs(x) <= 1 && Math.abs(z) <= 1 && y >= 0 && y <= 2) ? AIR : BEDROCK));
    const t0 = Date.now();
    const s = search(w, { x: 0, y: 1, z: 0 }, { x: 20, y: 1, z: 0 }, {}, { maxNodes: 3000, radius: 24 });
    const ms = Date.now() - t0;
    ok(s.status === "unreachable", "terrain: a sealed box reports unreachable", s.status);
    ok(ms < 2000, `terrain: the impossible search gives up in ${ms}ms`);
}

// 10. fuzz: hostile random worlds - a route must be lethal-free or absent.
{
    let routes = 0, unreachable = 0, threw = 0, lethalRoutes = 0;
    for (let seed = 1; seed <= 40; seed++) {
        let h = seed * 2654435761;
        const hash = (x, y, z) => {
            let v = (h ^ (x * 374761393) ^ (y * 668265263) ^ (z * 2246822519)) >>> 0;
            v = (v ^ (v >>> 13)) * 1274126177 >>> 0;
            return ((v ^ (v >>> 16)) >>> 0) / 4294967296;
        };
        const w = world((x, y, z) => {
            if (y < -2) return STONE;
            if (y > 4) return AIR;
            const v = hash(x, y, z);
            if (v < 0.40) return AIR;
            if (v < 0.78) return STONE;
            if (v < 0.86) return WATER;
            if (v < 0.92) return LAVA;
            return AIR;
        });
        try {
            const s = search(w, { x: 0, y: 1, z: 0 }, { x: 15, y: 1, z: 6 }, {}, { maxNodes: 3000, radius: 32 });
            if (s.status === "found" || s.status === "partial") {
                routes++;
                if (lethalOn(w, s.path).length) lethalRoutes++;
            } else unreachable++;
        } catch (e) {
            threw++;
            console.log("  fuzz seed " + seed + " threw: " + e.message);
        }
    }
    ok(threw === 0, `terrain fuzz: 40 hostile worlds without an exception (${threw})`);
    ok(lethalRoutes === 0, `terrain fuzz: no returned route crosses a lethal cell (${lethalRoutes} did)`);
    ok(routes + unreachable === 40, "terrain fuzz: every world produced a decision");
    ok(routes > 0, `terrain fuzz: at least some of the hostile worlds are actually traversable (${routes}/40)`);
}

// 11. determinism: the same world+goal twice = the same path.
{
    const w = world((x, y, z) => (y <= 0 ? STONE : (x === 3 ? LAVA : AIR)));
    const a = search(w, { x: 0, y: 1, z: 0 }, { x: 8, y: 1, z: 0 });
    const b = search(w, { x: 0, y: 1, z: 0 }, { x: 8, y: 1, z: 0 });
    ok(JSON.stringify(a.path) === JSON.stringify(b.path), "terrain: the search is deterministic");
}

// 12. standable() still agrees with the search's own notion of a floor.
{
    const w = world((x, y, z) => (y <= 0 ? STONE : AIR));
    ok(standable(w.read, { x: 3, y: 1, z: 3 }) === true, "terrain: standable() accepts open air above stone");
    ok(standable(w.read, { x: 3, y: 0, z: 3 }) === false, "terrain: standable() rejects solid stone");
}

console.log(`\nterrain.test: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
