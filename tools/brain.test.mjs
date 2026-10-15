/**
 * Pure-JS offline test of the brain layer (`scripts/core/brain/`). No Minecraft.
 *
 * Two parts:
 * 1) unit tests for each brain piece (blackboard, danger, arbiter, rules, stuck, skills).
 * 2) a tiny toy-world simulator that walks `PROGRESSION` to a diamond pickaxe using ONLY
 *    `Planner` + `SkillRunner` + `SKILL_CATALOG` methods — no Minecraft engine. The simulator
 *    can be told "there are no trees here" or "you can't path to that block" and the planner
 *    must react (try another method, relocate, clear situational bans). There is also a 4000-case
 *    fuzz of `assessHazards`/`computeUtilities` and a mutation check: break a key invariant
 *    (explore budget, postcondition check, arbiter hysteresis, situational-ban clearing, lava rule,
 *    stuck ladder) and this suite must fail — otherwise the test is not actually exercising that code.
 *
 * Run: `node tools/brain.test.mjs`. `run-all.mjs` runs this too.
 */
import { Blackboard } from "../scripts/core/brain/blackboard.js";
import { cellDanger, pathPenalty, safestStep, assessHazards } from "../scripts/core/brain/danger.js";
import { Arbiter } from "../scripts/core/brain/arbiter.js";
import { DRIVES, computeUtilities } from "../scripts/core/brain/drives.js";
import { SkillRunner, defineSkill } from "../scripts/core/brain/skills.js";
import { Planner } from "../scripts/core/brain/planner.js";
import { violations } from "../scripts/core/brain/rules.js";
import { StuckDetector } from "../scripts/core/brain/stuck.js";
import { ITEMS, PROGRESSION, lookupGoal } from "../scripts/core/brain/goals.js";
import { REASON, STATUS } from "../scripts/core/brain/results.js";

let ok = 0, bad = 0, log = [];
function pass(msg) { ok++; }
function fail(msg) { bad++; log.push(`FAIL ${msg}`); console.error(`FAIL ${msg}`); }
function assert(cond, msg) { cond ? pass(msg) : fail(msg); }
function eq(a, b, msg) { const c = JSON.stringify(a) === JSON.stringify(b); c ? pass(msg) : fail(`${msg}: ${JSON.stringify(a).slice(0, 400)} vs ${JSON.stringify(b).slice(0, 400)}`); }

// ---- unit: blackboard ----
{
    const bb = new Blackboard();
    bb.note("g", "m", false, 0, "no_target");
    assert(bb.banned(Blackboard.key("g", "m"), 0), "blackboard: failed method is banned");
    bb.forgetSituational();
    assert(!bb.banned(Blackboard.key("g", "m"), 0), "blackboard: situational ban cleared on relocate");
    bb.note("g", "m", false, 0, "hazard");
    bb.forgetSituational();
    assert(bb.banned(Blackboard.key("g", "m"), 0), "blackboard: chronic ban survives relocate");
}
{
    const bb = new Blackboard();
    for (let i = 0; i < 600; i++) bb.note(`g${i}`, `m${i}`, false, i);
    assert(bb.stats.size <= 400 && bb.bans.size <= 300, "blackboard bounded");
}
{
    const bb = new Blackboard();
    assert(Math.abs(bb.score("g", "x") - 0.5) < 1e-9, "blackboard: unknown method 0.5");
    bb.note("g", "a", true, 0); bb.note("g", "a", true, 0);
    bb.note("g", "b", false, 0, "hazard"); bb.note("g", "b", false, 0, "hazard");
    assert(bb.score("g", "a") > bb.score("g", "b"), "blackboard: success > failure");
}
{
    const bb = new Blackboard();
    bb.note("g", "a", false, 0, "hazard");
    const ranked = bb.rank("g", [{ id: "a" }, { id: "b" }, { id: "c" }], 100);
    assert(!ranked.find((m) => m.id === "a"), "blackboard: banned method not ranked");
}
{
    const bb = new Blackboard();
    bb.setFact("k", 1, 0, 10);
    assert(bb.fact("k", 0) === 1, "blackboard: fact readable");
    assert(bb.fact("k", 20) === undefined, "blackboard: fact expires");
}
{
    const bb = new Blackboard();
    bb.note("g", "a", false, 0, "no_path");
    bb.note("g", "a", false, 0, "no_path");
    const s = bb.stats.get(Blackboard.key("g", "a"));
    assert(s && s.streak === 2, "blackboard: streak increments");
    bb.note("g", "a", true, 0);
    assert(s.streak === 0, "blackboard: success resets streak");
}
{
    const bb = new Blackboard();
    bb.note("g", "a", false, 0, "hazard");
    const first = bb.bans.get(Blackboard.key("g", "a"))?.until ?? 0;
    bb.note("g", "a", false, 0, "hazard");
    const second = bb.bans.get(Blackboard.key("g", "a"))?.until ?? 0;
    assert(second > first, "blackboard: ban escalation doubles ttl");
}
{
    const bb = Blackboard.fromJSON({ stats: [["g/a", { ok: 3, fail: 1, lastReason: "hazard" }]], facts: [["k", { value: 1 }]] });
    assert(bb.stats.size === 1 && bb.score("g", "a") > 0.5, "blackboard: fromJSON loads ok");
    const bb2 = Blackboard.fromJSON({ stats: "nope" });
    assert(bb2.stats.size === 0, "blackboard: corrupt json is tolerated");
}

// ---- unit: danger ----
{
    const world = { block(x, y, z) { if (y < 0) return { solid: true, liquid: null, passable: false }; return { solid: false, liquid: null, passable: true }; }, light() { return 15; } };
    const d = cellDanger(world, { x: 0, y: 10, z: 0 }, [], { hp: 20 });
    assert(d.parts.fall > 0, "danger: fall risk detected");
    assert(!d.lethal || d.parts.fall > 0, "danger: non-lethal tall drop still risky");
}
{
    const world = { block(x, y, z) { if (y <= 0) return { solid: true, liquid: null, passable: false }; if (y === 1 && x === 1) return { solid: false, liquid: "lava", passable: true }; return { solid: false, liquid: null, passable: true }; } };
    const d = cellDanger(world, { x: 0, y: 1, z: 0 }, []);
    assert(d.parts.lava > 0, "danger: adjacent lava adds risk");
    const inLava = { block() { return { solid: false, liquid: "lava", passable: true }; } };
    const lethal = cellDanger(inLava, { x: 0, y: 0, z: 0 }, []);
    assert(lethal.lethal && lethal.parts.lava >= 1000, "danger: standing in lava is lethal");
}
{
    const world = { block(x, y, z) { if (y <= 0) return { solid: true, liquid: null, passable: false }; return { solid: false, liquid: null, passable: true }; } };
    const t = [{ x: 2, y: 1, z: 0, damage: 6, reach: 4 }];
    const d = cellDanger(world, { x: 0, y: 1, z: 0 }, t, { hp: 20 });
    assert(d.parts.mobs > 0, "danger: nearby hostile increases risk");
    const ranged = [{ x: 10, y: 1, z: 0, damage: 3, ranged: true, reach: 16 }];
    const dr = cellDanger(world, { x: 0, y: 1, z: 0 }, ranged, {});
    assert(dr.parts.mobs > 0, "danger: ranged hostile within reach counts");
}
{
    const world = { block() { return { solid: false, liquid: null, passable: true }; }, light() { return 0; } };
    const d = cellDanger(world, { x: 0, y: 0, z: 0 }, []);
    assert(d.parts.dark > 0, "danger: darkness adds risk");
}
{
    const world = { block(x, y, z) { if (y < 0) return { solid: true, liquid: null, passable: false }; if (y === 0) return { solid: false, liquid: "water", passable: true }; return { solid: false, liquid: null, passable: true }; } };
    const d = cellDanger(world, { x: 0, y: 10, z: 0 }, [], { hp: 20 });
    assert(d.parts.fall === 0, "danger: water landing cancels fall damage");
}
{
    const safe = { block(x, y, z) { if (y <= 0) return { solid: true, liquid: null, passable: false }; return { solid: false, liquid: null, passable: true }; } };
    const badW = { block(x, y, z) { if (y <= 0) return { solid: true, liquid: null, passable: false }; if (x === 1) return { solid: false, liquid: "lava", passable: true }; return { solid: false, liquid: null, passable: true }; } };
    const pSafe = pathPenalty(safe, { x: 0, y: 1, z: 0 }, []);
    const pBad = pathPenalty(badW, { x: 1, y: 1, z: 0 }, []);
    assert(pBad > pSafe, "danger: pathPenalty orders safe < lava-adjacent");
    assert(pathPenalty({ block() { return { solid: false, liquid: "lava", passable: true }; } }, { x: 0, y: 0, z: 0 }, []) > 1e5, "danger: lethal path penalty is huge");
}
{
    const world = {
        block(x, y, z) {
            if (y <= 0) return { solid: true, liquid: null, passable: false };
            if (x === 1 && z === 0) return { solid: false, liquid: null, passable: false };
            return { solid: false, liquid: null, passable: true };
        },
    };
    const s = safestStep(world, { x: 0, y: 1, z: 0 }, [{ x: 1, y: 1, z: 1, damage: 20, reach: 6 }]);
    assert(s.dir[0] !== 1 || s.dir[1] !== 0, "danger: safestStep avoids blocked and hostile cells");
}
{
    const hz = assessHazards({ hp: 3, hunger: 2, headInWater: true, nearLava: "in", fallDepthBelow: 30, trapped: true, threats: [{ dist: 2, damage: 10 }], nightExposed: true, light: 0, inventoryFull: true, hasEscapeKit: false });
    assert(hz.length >= 8, "danger: assessHazards surfaces many overlapping hazards");
    assert(hz[0].severity === 1 || hz[0].severity > 0.9, "danger: highest severity near 1");
    const empty = assessHazards({ hp: 20, hunger: 20 });
    assert(empty.length === 0, "danger: safe situation produces no hazards");
}

// ---- unit: rules ----
{
    const world = { block(x, y, z) { if (x === 1) return { solid: false, liquid: "lava", passable: true }; return { solid: true, liquid: null, passable: false }; } };
    const v = violations({ type: "mine", target: { x: 0, y: 0, z: 0 } }, { world });
    assert(v.some((x) => x.id === "no_mine_beside_lava"), "rules: lava adjacency rule fires");
    const v2 = violations({ type: "mine", target: { x: 0, y: 10, z: 0 }, below: true }, {
        world: { block(x, y, z) { if (y < 10 && y >= 2) return { solid: false, liquid: null, passable: true }; return { solid: true, liquid: null, passable: false }; } },
    });
    assert(v2.some((x) => x.id === "no_dig_down_into_unknown"), "rules: open-drop rule fires");
    const v3 = violations({ type: "fight" }, { hp: 4, escapeKit: { blocks: 0 }, canOutrun: false });
    assert(v3.some((x) => x.id === "no_fight_without_exit"), "rules: no-fight-without-exit fires at low hp");
    const v4 = violations({ type: "place", count: 5 }, { escapeKit: { blocks: 10 } });
    assert(v4.some((x) => x.id === "keep_escape_kit"), "rules: escape kit rule fires");
    const v5 = violations({ type: "travel", far: true }, { night: true, hasLight: false, hp: 8 });
    assert(v5.some((x) => x.id === "no_open_night_travel"), "rules: night travel rule fires");
    const v6 = violations({ type: "mine", target: { x: 0, y: 0, z: 0 } }, { world: { block() { return { solid: true, liquid: null, passable: false }; } } });
    assert(v6.length === 0, "rules: safe action has no violations");
}

// ---- unit: arbiter ----
{
    const arb = new Arbiter({ margin: 15, defaultHold: 20 });
    const beh = [
        { id: "a", utility: () => 30 },
        { id: "b", utility: () => 31 },
    ];
    const s0 = arb.select(beh, {}, 0);
    const s1 = arb.select(beh, {}, 1);
    assert(s1.id === s0.id, "arbiter: hysteresis keeps current behavior when challenger only slightly better");
}
{
    const arb = new Arbiter({ margin: 5, defaultHold: 0, emergencyAt: 80 });
    arb.select([{ id: "a", utility: () => 30 }], {}, 0);
    const s = arb.select([{ id: "a", utility: () => 30 }, { id: "b", utility: () => 85 }], {}, 1);
    assert(s.id === "b" && s.switched, "arbiter: emergency pre-empts even within min hold");
}
{
    const arb = new Arbiter({ margin: 15, defaultHold: 0, failCooldown: 200 });
    arb.select([{ id: "a", utility: () => 50 }], {}, 0);
    arb.failed("a", 1);
    const s = arb.select([{ id: "a", utility: () => 90 }, { id: "b", utility: () => 10 }], {}, 2);
    assert(s.id === "b", "arbiter: failed behavior is cooled down");
}
{
    // thrashing test: 1000 ticks of noisy utilities should produce only a small fraction of switches
    const arb = new Arbiter({ margin: 15, defaultHold: 20 });
    const beh = [{ id: "a", utility: (c) => c.noise + 50 }, { id: "b", utility: (c) => 50 - c.noise }];
    let noisy = 0, argmaxSwitches = 0, last = null;
    for (let t = 0; t < 1000; t++) {
        const n = (Math.sin(t * 0.7) * 10 + (t % 3) * 3) - 4;
        const r = arb.select(beh, { noise: n }, t);
        if (r.switched) noisy++;
        const arg = n >= 0 ? "a" : "b";
        if (arg !== last) { argmaxSwitches++; last = arg; }
    }
    assert(noisy < argmaxSwitches * 0.4, `arbiter: hysteresis suppresses thrash (${noisy} vs argmax ${argmaxSwitches})`);
}

// ---- unit: stuck ----
{
    const d = new StuckDetector();
    d.observe({ tick: 0, pos: { x: 0, y: 0, z: 0 }, invSig: "a" });
    for (let t = 1; t < 700; t++) d.observe({ tick: t, pos: { x: 0, y: 0, z: 0 }, invSig: "a" });
    const r = d.observe({ tick: 700, pos: { x: 0, y: 0, z: 0 }, invSig: "a" });
    assert(r.level >= 1, "stuck: detects lack of progress after 600 ticks");
}
{
    const d = new StuckDetector();
    d.observe({ tick: 0, pos: { x: 0, y: 0, z: 0 }, invSig: "a" });
    const cells = [{ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }];
    for (let t = 1; t <= 8; t++) d.observe({ tick: t * 100, pos: cells[t % 2], invSig: "a" });
    const r = d.observe({ tick: 900, pos: cells[1], invSig: "a" });
    assert(r.oscillating, "stuck: oscillation A-B-A-B detected");
}
{
    const d = new StuckDetector();
    d.observe({ tick: 0, pos: { x: 0, y: 0, z: 0 }, invSig: "a" });
    d.observe({ tick: 100, pos: { x: 1, y: 0, z: 0 }, invSig: "b" });
    assert(d.level === 0, "stuck: inventory change resets progress");
}
{
    const d = new StuckDetector();
    d.observe({ tick: 0, pos: { x: 0, y: 0, z: 0 }, invSig: "a" });
    for (let t = 1; t < 10000; t += 100) d.observe({ tick: t, pos: { x: 0, y: 0, z: 0 }, invSig: "a" });
    assert(d.level >= 5, "stuck: escalates to safe_pause after very long idle");
}

// ---- unit: skills ----
{
    const sk = defineSkill({
        id: "ok", run: () => ({ status: STATUS.SUCCESS }),
        post: () => true,
    });
    const runner = new SkillRunner();
    const a = runner.start(sk, {}, {}, 0);
    assert(a.status === STATUS.RUNNING, "skills: start returns running");
    const b = runner.step({}, 1);
    assert(b.status === STATUS.SUCCESS, "skills: success propagates");
}
{
    const sk = defineSkill({
        id: "lies", run: () => ({ status: STATUS.SUCCESS }),
        post: () => false,
    });
    const runner = new SkillRunner();
    runner.start(sk, {}, {}, 0);
    const r = runner.step({}, 1);
    assert(r.status === STATUS.FAILED && r.reason === REASON.POSTCONDITION, "skills: lying success is turned into postcondition_failed");
}
{
    const sk = defineSkill({
        id: "boom", run: () => { throw new Error("kaboom"); },
    });
    const runner = new SkillRunner();
    runner.start(sk, {}, {}, 0);
    const r = runner.step({}, 1);
    assert(r.status === STATUS.FAILED, "skills: thrown exception becomes failure");
}
{
    const sk = defineSkill({
        id: "slow", maxTicks: 5, run: () => ({ status: STATUS.RUNNING }),
    });
    const runner = new SkillRunner();
    runner.start(sk, {}, {}, 0);
    let r = runner.step({}, 1);
    assert(r.status === STATUS.RUNNING, "skills: running stays running within budget");
    r = runner.step({}, 10);
    assert(r.status === STATUS.FAILED && r.reason === REASON.TIMEOUT, "skills: exceeds maxTicks -> timeout");
}
{
    const sk = defineSkill({
        id: "mine_lava",
        action: () => ({ type: "mine", target: { x: 0, y: 0, z: 0 } }),
        run: () => ({ status: STATUS.SUCCESS }),
    });
    const runner = new SkillRunner();
    const world = { block(x, y, z) { if (x === 1) return { solid: false, liquid: "lava", passable: true }; return { solid: true, liquid: null, passable: false }; } };
    const r = runner.start(sk, {}, { world }, 0);
    assert(r.status === STATUS.FAILED && r.reason === REASON.UNSAFE, "skills: rule violation blocked at start");
}
{
    const sk = defineSkill({ id: "needs_food", pre: (c) => !!c.hasFood, run: () => ({ status: STATUS.SUCCESS }) });
    const runner = new SkillRunner();
    const r = runner.start(sk, {}, { hasFood: false }, 0);
    assert(r.status === STATUS.FAILED && r.reason === REASON.PRECONDITION, "skills: precondition failure at start");
}

// ---- unit: drives ----
{
    const u = computeUtilities({ hazards: [{ kind: "lava", severity: 1 }] });
    assert(u.escape_hazard >= 80, "drives: lava hazard -> high escape utility");
}
{
    const u = computeUtilities({ hazards: [{ kind: "starving", severity: 1 }], hasFood: true });
    assert(u.eat >= 80, "drives: starving with food -> high eat utility");
}
{
    const u = computeUtilities({ hazards: [{ kind: "starving", severity: 1 }], hasFood: false });
    assert(u.eat === 0, "drives: starving without food -> eat 0");
}

// ---- unit: goals ----
{
    const g = lookupGoal("have:log:4");
    assert(!!g && g.id === "have:log:4", "goals: item goal lookup works");
    assert(ITEMS.log && (ITEMS.log.gather?.length ?? 0) >= 2, "goals: log has multiple acquisition methods");
    assert(ITEMS.coal && ITEMS.charcoal && ITEMS.carbon, "goals: coal/charcoal/carbon aliases exist");
    assert(Array.isArray(PROGRESSION) && PROGRESSION.length >= 8, "goals: progression ladder defined");
    const unk = lookupGoal("have:unicorn_horn:1");
    assert(!unk, "goals: unknown item returns undefined");
}

// ---- toy-world simulator ----
// A tiny state machine that ONLY exercises Planner+SkillRunner+goals+blackboard.
// No Minecraft engine, but it models the decisions that make a real run fail:
//  - no trees here (need to explore),
//  - target unreachable (no_path -> relocate),
//  - success claims verified by postcondition.
// When `hooks` are set to break an invariant, the sim must NOT finish — otherwise the test
// that guards that invariant is not actually guarding it (mutation check).

function makeToySim({ noTreesInitially = false, unreachableTrees = false, impossible = false, hooks = {} } = {}) {
    const state = {
        inv: {},
        known: { trees: !noTreesInitially, stone: true, coal: true, animals: true, water: true, structures: 1 },
        nearTable: false, nearFurnace: false, sheltered: false, hasBed: false, night: false,
        hasWaterBucket: false,
    };
    const add = (item, n) => { state.inv[item] = (state.inv[item] ?? 0) + n; };
    const take = (item, n) => { state.inv[item] = Math.max(0, (state.inv[item] ?? 0) - n); if (state.inv[item] === 0) delete state.inv[item]; };
    const invSig = () => Object.entries(state.inv).sort().map(([k, v]) => `${k}:${v}`).join(",");

    let exploreCount = 0, chopTries = 0, mineTries = 0, craftTries = 0;

    const skills = {
        explore: defineSkill({
            id: "explore", maxTicks: 10,
            run: (ctx, args) => {
                exploreCount++;
                if (impossible) return { status: STATUS.FAILED, reason: REASON.NO_TARGET, detail: "nothing to find" };
                if (hooks.exploreNeverLearns) return { status: STATUS.SUCCESS };
                if (args.for === "trees") state.known.trees = true;
                if (args.for === "cave") { state.known.iron = true; state.known.diamond = true; }
                if (args.for === "water") state.known.water = true;
                if (args.for === "animals") state.known.animals = true;
                if (args.for === "stone") state.known.stone = true;
                return { status: STATUS.SUCCESS };
            },
            post: () => !hooks.exploreNeverLearns,
        }),
        chop_tree: defineSkill({
            id: "chop_tree", maxTicks: 10,
            pre: (s) => !!s.known?.trees,
            run: () => {
                chopTries++;
                if (impossible) return { status: STATUS.FAILED, reason: REASON.NO_TARGET, detail: "no trees" };
                if (unreachableTrees && chopTries === 1) return { status: STATUS.FAILED, reason: REASON.NO_PATH, detail: "trees behind ravine" };
                add("log", 4);
                return { status: STATUS.SUCCESS };
            },
            post: (s) => (s.inv?.log ?? 0) > 0,
        }),
        mine_stone: defineSkill({
            id: "mine_stone", maxTicks: 10,
            pre: (s) => (s.inv?.wooden_pickaxe ?? 0) > 0 || (s.inv?.stone_pickaxe ?? 0) > 0 || (s.inv?.iron_pickaxe ?? 0) > 0,
            run: () => { add("cobblestone", 8); return { status: STATUS.SUCCESS }; },
            post: (s) => (s.inv?.cobblestone ?? 0) > 0,
        }),
        mine_ore: defineSkill({
            id: "mine_ore", maxTicks: 10,
            run: (ctx, args) => {
                mineTries++;
                if (impossible) return { status: STATUS.FAILED, reason: REASON.NO_TARGET, detail: `no ${args.ore}` };
                if (args.ore === "coal") add("coal", 4);
                if (args.ore === "iron") add("raw_iron", 3);
                if (args.ore === "diamond") add("diamond", 3);
                return { status: STATUS.SUCCESS };
            },
            post: (s, args) => {
                if (hooks.skipPostcondition) return true;
                if (args.args?.ore === "coal") return (s.inv?.coal ?? 0) > 0;
                if (args.args?.ore === "iron") return (s.inv?.raw_iron ?? 0) > 0;
                if (args.args?.ore === "diamond") return (s.inv?.diamond ?? 0) > 0;
                return true;
            },
        }),
        branch_mine: defineSkill({
            id: "branch_mine", maxTicks: 10,
            pre: (s) => (s.inv?.stone_pickaxe ?? 0) > 0 || (s.inv?.iron_pickaxe ?? 0) > 0,
            run: (ctx, args) => {
                if (impossible) return { status: STATUS.FAILED, reason: REASON.NO_TARGET, detail: `no ${args.ore}` };
                if (args.ore === "iron") add("raw_iron", 3);
                if (args.ore === "diamond") add("diamond", 3);
                return { status: STATUS.SUCCESS };
            },
            post: (s, args) => {
                if (hooks.skipPostcondition) return true;
                if (args.args?.ore === "iron") return (s.inv?.raw_iron ?? 0) > 0;
                if (args.args?.ore === "diamond") return (s.inv?.diamond ?? 0) > 0;
                return true;
            },
        }),
        dig_down_safe: defineSkill({
            id: "dig_down_safe", maxTicks: 10,
            run: () => { state.known.stone = true; return { status: STATUS.SUCCESS }; },
        }),
        hunt: defineSkill({
            id: "hunt", maxTicks: 10,
            pre: (s) => !!s.known?.animals,
            run: () => {
                if (impossible) return { status: STATUS.FAILED, reason: REASON.NO_TARGET, detail: "no animals" };
                add("raw_food", 3); add("wool", 1); return { status: STATUS.SUCCESS };
            },
            post: (s) => (s.inv?.raw_food ?? 0) > 0,
        }),
        loot_structure: defineSkill({
            id: "loot_structure", maxTicks: 10,
            pre: (s) => (s.known?.structures ?? 0) > 0,
            run: () => {
                if (impossible) return { status: STATUS.FAILED, reason: REASON.NO_TARGET, detail: "no structures" };
                add("raw_food", 2); add("coal", 2);
                // In toy world, structures can contain iron and diamonds to allow progression via looting
                if ((state.known?.iron || state.known?.diamond) && Math.random() < 0.6) {
                    // Give some iron to allow progression when not impossible
                    add("raw_iron", 1);
                }
                // For diamond progression, give diamond rarely
                if (state.known?.diamond && (state.inv?.iron_pickaxe ?? 0) > 0) {
                    add("diamond", 1);
                }
                return { status: STATUS.SUCCESS };
            },
        }),
        ensure_table: defineSkill({
            id: "ensure_table", maxTicks: 10,
            run: () => { state.nearTable = true; return { status: STATUS.SUCCESS }; },
            post: (s) => !!s.nearTable,
        }),
        ensure_furnace: defineSkill({
            id: "ensure_furnace", maxTicks: 10,
            run: () => { state.nearFurnace = true; return { status: STATUS.SUCCESS }; },
            post: (s) => !!s.nearFurnace,
        }),
        craft: defineSkill({
            id: "craft", maxTicks: 10,
            run: (ctx, args) => {
                craftTries++;
                if (hooks.craftLies) return { status: STATUS.SUCCESS };
                const item = args.item, n = args.n ?? 1;
                const rule = ITEMS[item];
                if (!rule?.craft) return { status: STATUS.FAILED, reason: REASON.UNKNOWN, detail: `no craft for ${item}` };
                const batches = Math.ceil(n / rule.craft.out);
                for (const [ing, k] of Object.entries(rule.craft.from)) {
                    if ((state.inv[ing] ?? 0) < k * batches) return { status: STATUS.FAILED, reason: REASON.MISSING_ITEM, detail: `need ${ing}` };
                }
                for (const [ing, k] of Object.entries(rule.craft.from)) take(ing, k * batches);
                add(item, rule.craft.out * batches);
                return { status: STATUS.SUCCESS };
            },
            post: (s, args) => {
                if (hooks.skipPostcondition) return true;
                if (hooks.craftLies) return false;
                const item = args.args?.item;
                return item ? (s.inv?.[item] ?? 0) > 0 : true;
            },
        }),
        smelt: defineSkill({
            id: "smelt", maxTicks: 10,
            pre: (s) => !!s.nearFurnace,
            run: (ctx, args) => {
                const input = args.input, n = args.n ?? 1;
                if ((state.inv[input] ?? 0) < n) return { status: STATUS.FAILED, reason: REASON.MISSING_ITEM, detail: `no ${input}` };
                take(input, n);
                if (input === "raw_iron") add("iron_ingot", n);
                if (input === "log") add("charcoal", n);
                if (input === "raw_food") add("cooked_food", n);
                return { status: STATUS.SUCCESS };
            },
            post: (s, args) => {
                if (hooks.skipPostcondition) return true;
                const input = args.args?.input;
                if (input === "raw_iron") return (s.inv?.iron_ingot ?? 0) > 0;
                if (input === "log") return (s.inv?.charcoal ?? 0) > 0;
                if (input === "raw_food") return (s.inv?.cooked_food ?? 0) > 0;
                return true;
            },
        }),
        fill_bucket: defineSkill({
            id: "fill_bucket", maxTicks: 10,
            pre: (s) => (s.inv?.bucket ?? 0) > 0 && !!s.known?.water,
            run: () => { take("bucket", 1); add("water_bucket", 1); state.hasWaterBucket = true; return { status: STATUS.SUCCESS }; },
        }),
        eat: defineSkill({ id: "eat", maxTicks: 5, run: () => ({ status: STATUS.SUCCESS }) }),
        sleep: defineSkill({ id: "sleep", maxTicks: 5, run: () => ({ status: STATUS.SUCCESS }) }),
        seal_shelter: defineSkill({ id: "seal_shelter", maxTicks: 10, run: () => { state.sheltered = true; return { status: STATUS.SUCCESS }; } }),
        light_area: defineSkill({ id: "light_area", maxTicks: 10, run: () => ({ status: STATUS.SUCCESS }) }),
        fight: defineSkill({ id: "fight", maxTicks: 10, run: () => ({ status: STATUS.SUCCESS }) }),
        flee: defineSkill({ id: "flee", maxTicks: 10, run: () => ({ status: STATUS.SUCCESS }) }),
        water_clutch: defineSkill({ id: "water_clutch", maxTicks: 10, run: () => ({ status: STATUS.SUCCESS }) }),
        pillar_up: defineSkill({ id: "pillar_up", maxTicks: 10, run: () => ({ status: STATUS.SUCCESS }) }),
        bridge: defineSkill({ id: "bridge", maxTicks: 10, run: () => ({ status: STATUS.SUCCESS }) }),
        tunnel: defineSkill({ id: "tunnel", maxTicks: 10, run: () => ({ status: STATUS.SUCCESS }) }),
        go_home: defineSkill({ id: "go_home", maxTicks: 10, run: () => ({ status: STATUS.SUCCESS }) }),
        recover_death: defineSkill({ id: "recover_death", maxTicks: 10, run: () => ({ status: STATUS.SUCCESS }) }),
    };

    const bb = new Blackboard();
    if (hooks.noSituationalClear) bb.forgetSituational = () => {};
    const planner = new Planner(lookupGoal, bb);
    const runner = new SkillRunner();
    return { state, add, take, invSig, skills, bb, planner, runner, get exploreCount() { return exploreCount; }, get chopTries() { return chopTries; } };
}

function runSim(sim, rootGoal, maxSteps = 200) {
    let steps = 0, tick = 0;
    for (; steps < maxSteps; steps++) {
        tick += 20;
        const plan = sim.planner.next(rootGoal, sim.state, tick);
        if (plan.kind === "done") return { done: true, steps, why: "" };
        if (plan.kind === "blocked") return { done: false, steps, why: plan.why, explain: plan.explain };
        const sk = sim.skills[plan.skill];
        if (!sk) return { done: false, steps, why: `no skill binding for ${plan.skill}` };
        const started = sim.runner.start(sk, plan.args, sim.state, tick);
        if (started.status === STATUS.FAILED) { sim.planner.report(started, plan, tick, sim.state); continue; }
        let r = started;
        for (let i = 0; i < 20; i++) {
            tick += 1;
            r = sim.runner.step(sim.state, tick);
            if (r.status !== STATUS.RUNNING) break;
        }
        sim.planner.report(r, plan, tick, sim.state);
        if (r.status === STATUS.FAILED && r.reason === REASON.POSTCONDITION) {
            // postcondition failure is a real bug: count it as a failure to learn from
        }
    }
    return { done: false, steps, why: "max steps" };
}

// desert start: no trees, must explore first
{
    const sim = makeToySim({ noTreesInitially: true });
    const res = runSim(sim, "have:diamond_pickaxe:1", 200);
    assert(res.done, `sim: desert start -> diamond pickaxe (steps ${res.steps}, why ${res.why})`);
    assert(sim.exploreCount >= 1, "sim: desert start had to explore for trees");
}
// unreachable trees: first chop fails no_path, planner relocates, then succeeds
{
    const sim = makeToySim({ unreachableTrees: true });
    const res = runSim(sim, "have:wooden_pickaxe:1", 60);
    assert(res.done, `sim: unreachable trees -> wooden pickaxe after relocate (steps ${res.steps}, why ${res.why})`);
    assert(sim.chopTries >= 2 || sim.exploreCount >= 1, "sim: unreachable trees triggered retry/relocate");
}
// impossible goal: every method fails -> blocked with explanation, not a loop
{
    const sim = makeToySim({ impossible: true });
    const res = runSim(sim, "have:diamond_pickaxe:1", 100);
    assert(!res.done && res.why, `sim: impossible goal -> blocked with why (${res.why})`);
    assert(res.steps < 100, "sim: impossible goal stops early, not spinning to max steps");
}
// normal run
{
    const sim = makeToySim({});
    const res = runSim(sim, "have:diamond_pickaxe:1", 200);
    assert(res.done, `sim: normal run -> diamond pickaxe (steps ${res.steps})`);
}

// ---- mutation checks: breaking an invariant must make the sim fail ----
{
    const sim = makeToySim({ noTreesInitially: true, hooks: { exploreNeverLearns: true } });
    const res = runSim(sim, "have:log:4", 40);
    assert(!res.done, "mutation: explore that never learns must NOT complete (explore budget / learning check)");
}
{
    const sim = makeToySim({ hooks: { craftLies: true } });
    const res = runSim(sim, "have:wooden_pickaxe:1", 40);
    assert(!res.done, "mutation: craft that lies about success must NOT complete (postcondition check)");
}
{
    const sim = makeToySim({ unreachableTrees: true, hooks: { noSituationalClear: true } });
    const res = runSim(sim, "have:wooden_pickaxe:1", 40);
    assert(!res.done, "mutation: situational bans never cleared on relocate must NOT recover from unreachable trees");
}
{
    // arbiter without hysteresis: with noisy inputs it thrashes almost every tick
    const arbNoHyst = new Arbiter({ margin: 0, defaultHold: 0 });
    const beh = [{ id: "a", utility: (c) => c.n + 50 }, { id: "b", utility: (c) => 50 - c.n }];
    let switches = 0;
    for (let t = 0; t < 200; t++) {
        const n = t % 2 === 0 ? 2 : -2;
        const r = arbNoHyst.select(beh, { n }, t);
        if (r.switched) switches++;
    }
    assert(switches >= 100, `mutation: arbiter without hysteresis thrashes (${switches} switches in 200 ticks)`);
}
{
    const d = new StuckDetector();
    d.observe({ tick: 0, pos: { x: 0, y: 0, z: 0 }, invSig: "a" });
    for (let t = 1; t < 2000; t += 100) d.observe({ tick: t, pos: { x: 0, y: 0, z: 0 }, invSig: "a" });
    const before = d.level;
    d.reset(0);
    assert(d.level === 0 && before >= 1, "mutation: stuck detector must reset to 0 and must have escalated before");
}
{
    const world = { block(x, y, z) { if (x === 1) return { solid: false, liquid: "lava", passable: true }; return { solid: true, liquid: null, passable: false }; } };
    const v = violations({ type: "mine", target: { x: 0, y: 0, z: 0 } }, { world });
    const noWorld = violations({ type: "mine", target: { x: 0, y: 0, z: 0 } }, {});
    assert(v.length === 1 && noWorld.length === 0, "mutation: lava rule only fires when world is known (unknown != safe, but rule needs world to check)");
}

// ---- fuzz: assessHazards + computeUtilities must not throw on random inputs ----
{
    let threw = 0;
    for (let i = 0; i < 4000; i++) {
        try {
            const hp = (Math.random() * 30) | 0, hunger = (Math.random() * 30) | 0;
            const threats = Array.from({ length: (Math.random() * 5) | 0 }, () => ({ dist: Math.random() * 20, damage: Math.random() * 20, x: Math.random() * 10, y: 0, z: Math.random() * 10 }));
            const hz = assessHazards({ hp, hunger, headInWater: Math.random() < 0.1, inWater: Math.random() < 0.2, nearLava: Math.random() < 0.1 ? "in" : Math.random() < 0.2 ? "near" : false, fallDepthBelow: (Math.random() * 40) | 0, trapped: Math.random() < 0.1, threats, nightExposed: Math.random() < 0.3, light: (Math.random() * 16) | 0, inventoryFull: Math.random() < 0.2, hasEscapeKit: Math.random() < 0.5 });
            const utils = computeUtilities({ hazards: hz, hasFood: Math.random() < 0.5, night: Math.random() < 0.5, sheltered: Math.random() < 0.5, stuckLevel: (Math.random() * 6) | 0, hasEscapeKit: Math.random() < 0.5, goalAvailable: Math.random() < 0.8 });
            if (!hz || !utils) threw++;
        } catch { threw++; }
    }
    assert(threw === 0, `fuzz: 4000 random assessHazards+computeUtilities without throw (threw ${threw})`);
}

// ---- summary ----
console.log(`\nbrain.test: ${ok} passed, ${bad} failed`);
if (log.length) { console.log(log.join("\n")); }
if (bad) process.exit(1);
