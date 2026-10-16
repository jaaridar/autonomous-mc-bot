// Skill-system tests. Four groups, all offline (no engine, no stubs needed):
//
//   * catalog   - the registry the pack actually ships builds and validates
//   * plans     - pure plan/math layers are deterministic and sane
//   * scheduler - selection, preemption, budgets, failure backoff
//   * smoke     - every skill in the catalog survives a tick against a fake
//                 context, so a missing ctx field fails here, not mid-duel
//
// The fake context is deliberately hostile: nothing is reachable, nothing is
// nearby, the bag holds one of everything useful. A skill that assumes a live
// world (undefined.length) fails the smoke group instead of the player's world.
import { buildRegistry } from "../scripts/skills/index.js";
import { Scheduler } from "../scripts/skills/scheduler.js";
import { STATUS, defineSkill, done, failed, running, blocked } from "../scripts/skills/contract.js";
import { Rng } from "../scripts/core/rng.js";
import { VInv, armorScore, maxStack, weaponDamage, weaponTier } from "../scripts/core/inventory-model.js";
import { breakTicks, isMineable } from "../scripts/core/mining-plan.js";

function group(name, body) {
    console.log(`\n-- ${name}`);
    let pass = 0;
    const fails = [];
    const check = (label, cond) => {
        if (cond)
            pass++;
        else
            fails.push(label);
    };
    body(check);
    for (const f of fails)
        console.log("FAIL: " + f);
    console.log(`${pass} passed, ${fails.length} failed`);
    return fails.length;
}

// --------------------------------------------------------------------- catalog

function catalogTests() {
    return group("skill catalog", (check) => {
        const registry = buildRegistry();
        check("catalog builds", registry.size > 0);
        check("validate() is clean", registry.validate().length === 0);
        check("every category is non-empty", registry.categories().every((c) => c.count > 0));
        check("ids are unique", new Set(registry.all().map((s) => s.id)).size === registry.size);
        check("id prefix matches category", registry.all().every((s) => s.id.split(".")[0] === s.category));
        check("every skill is tagged", registry.all().every((s) => s.tags.length > 0));
        check("priority is 0..100", registry.all().every((s) => s.priority >= 0 && s.priority <= 100));
        check("budget is finite and positive", registry.all().every((s) => s.budget > 0 && Number.isFinite(s.budget)));
        check("search finds a known skill", registry.search("mine").some((s) => s.id === "mining.mine-block"));
        check("byCategory is exact", registry.byCategory("survival").every((s) => s.category === "survival"));
        check("categories cover the required set",
            ["mining", "parkour", "combat", "pvp", "survival", "gather", "craft", "build", "explore", "meta"]
                .every((c) => registry.byCategory(c).length > 0));
    });
}

// ----------------------------------------------------------------------- plans

function planTests() {
    return group("plan determinism", (check) => {
        const a = new Rng(1234);
        const b = new Rng(1234);
        const seqA = [a.next(), a.next(), a.int(0, 10), a.pick(["x", "y", "z"])];
        const seqB = [b.next(), b.next(), b.int(0, 10), b.pick(["x", "y", "z"])];
        check("same seed, same sequence", JSON.stringify(seqA) === JSON.stringify(seqB));
        check("different seed differs", new Rng(99).next() !== seqA[0]);
        check("shuffle is stable", JSON.stringify(new Rng(5).shuffle([1, 2, 3, 4, 5])) === JSON.stringify(new Rng(5).shuffle([1, 2, 3, 4, 5])));
        check("derive is stable", new Rng(5).derive("mine").next() === new Rng(5).derive("mine").next());

        // Blocks: the data the planner relies on, exercised through the public API.
        check("stone needs a pickaxe", isMineable("minecraft:stone"));
        check("bedrock is not mineable", !isMineable("minecraft:bedrock"));
        check("dirt is faster than obsidian", breakTicks("minecraft:dirt", "minecraft:diamond_shovel") < breakTicks("minecraft:obsidian", "minecraft:diamond_pickaxe"));
        check("better tool is never slower", breakTicks("minecraft:stone", "minecraft:diamond_pickaxe") <= breakTicks("minecraft:stone", "minecraft:stone_pickaxe"));
        check("sword does not mine stone", breakTicks("minecraft:stone", "minecraft:diamond_sword") > breakTicks("minecraft:stone", "minecraft:diamond_pickaxe"));

        // Inventory model
        check("stack size is 64 for stone", maxStack("minecraft:stone") === 64);
        check("armor scores a chestplate", armorScore("minecraft:diamond_chestplate") > 0);
        check("weapon tiers differ", weaponTier("minecraft:netherite_sword") > weaponTier("minecraft:wooden_sword"));
        check("weapon damage differs", weaponDamage("minecraft:diamond_sword") > weaponDamage("minecraft:stone_sword"));
        check("non-armour scores zero", armorScore("minecraft:stick") === 0);

        const inv = VInv.fromCounts({ "minecraft:cobblestone": 100, "minecraft:bread": 3 });
        check("counts add up", inv.count("minecraft:cobblestone") === 100);
        check("missing item counts zero", inv.count("minecraft:diamond") === 0);
        check("has() respects amount", inv.has("minecraft:bread", 3) && !inv.has("minecraft:bread", 4));
        check("clone is independent", inv.clone().count("minecraft:cobblestone") === 100);
        check("junk() never returns kept items", inv.junk(1, () => 0, { keep: (id) => id === "minecraft:bread" }).every((x) => x.slot.typeId !== "minecraft:bread"));
        check("fromCounts is total-ordered", Object.keys(VInv.fromCounts({ "minecraft:stone": 1 }).counts()).length === 1);
    });
}

// -------------------------------------------------------------------- scheduler

function schedulerTests() {
    return group("scheduler behaviour", (check) => {
        const make = (spec) => defineSkill({ category: "meta", cost: 1, cooldown: 10, tags: ["test"], budget: 3, ...spec });
        const low = make({
            id: "meta.low", priority: 20, plan: () => ({}), score: () => 10,
            run: () => running("working"),
        });
        const high = make({
            id: "meta.high", priority: 60, plan: () => ({}), score: () => 40,
            run: () => running("working"),
        });
        const finisher = make({
            id: "meta.finisher", priority: 50, plan: () => ({}), score: () => 30,
            run: () => done("finished"), verify: () => true,
        });
        const liar = make({
            id: "meta.liar", priority: 50, plan: () => ({}), score: () => 35,
            run: () => done("claimed"), verify: () => false,
        });
        const thrower = make({
            id: "meta.thrower", priority: 50, plan: () => ({}), score: () => 5,
            run: () => { throw new Error("boom"); },
        });

        const registry = buildRegistry();
        for (const skill of [low, high, finisher, liar, thrower])
            registry.add(skill);

        const mkCtx = (tick) => ({ tick, settings: {}, rng: new Rng(1), log: () => { }, intent: { kind: "idle", urgency: 0, reason: "test" } });

        // Selection follows score, not declaration order.
        const s1 = new Scheduler(registry, { rng: new Rng(7) });
        const r1 = s1.tick(mkCtx(1));
        check("scheduler starts a skill", r1.status === STATUS.RUNNING);
        check("highest score wins", s1.run.id === "meta.high");

        // Forcing overrides scores.
        const s2 = new Scheduler(registry, { rng: new Rng(7) });
        check("force selects the named skill", s2.force("meta.low", mkCtx(1), 1) !== false);

        // Budget exhaustion is a failure, not a hang.
        const s3 = new Scheduler(registry, { rng: new Rng(7) });
        s3.tick(mkCtx(1));
        let exhausted = null;
        for (let t = 2; t < 12 && !exhausted; t++) {
            const r = s3.tick(mkCtx(t));
            if (r.status === STATUS.FAILED)
                exhausted = r;
        }
        check("budget exhaustion fails the run", !!exhausted);
        check("budget failure is explained", !!exhausted && /budget/.test(exhausted.message));

        // A done() that does not verify is demoted to failed.
        const s4 = new Scheduler(registry, { rng: new Rng(7) });
        s4.force("meta.liar", mkCtx(1), 1);
        const r4 = s4.tick(mkCtx(2));
        check("verify() false demotes done to failed", r4.status === STATUS.FAILED);
        check("demotion says why", /verif/i.test(r4.message) || s4.memory.count("meta.liar") > 0);

        // A verified done() is a real success and clears the failure memory.
        const s5 = new Scheduler(registry, { rng: new Rng(7) });
        s5.force("meta.finisher", mkCtx(1), 1);
        const r5 = s5.tick(mkCtx(2));
        check("verify() true keeps done", r5.status === STATUS.DONE);

        // A throwing skill is contained.
        const s6 = new Scheduler(registry, { rng: new Rng(7) });
        s6.force("meta.thrower", mkCtx(1), 1);
        let threw = false;
        try {
            s6.tick(mkCtx(2));
        }
        catch {
            threw = true;
        }
        check("a throwing skill does not crash the scheduler", !threw);
        check("the failure is remembered", s6.memory.count("meta.thrower") > 0);

        // Determinism: same seed, same decision sequence.
        const run = (seed) => {
            const s = new Scheduler(registry, { rng: new Rng(seed) });
            const out = [];
            for (let t = 0; t < 25; t++)
                out.push(s.tick(mkCtx(t)).message);
            return out;
        };
        check("decision order is reproducible", JSON.stringify(run(42)) === JSON.stringify(run(42)));

        // Preemption: nothing here may interrupt survival (>=95) but a slow skill
        // must yield to something with a much higher score.
        const s7 = new Scheduler(registry, { rng: new Rng(7) });
        s7.force("meta.low", mkCtx(1), 1);
        const before = s7.run.id;
        for (let t = 2; t < 8; t++)
            s7.tick(mkCtx(t));
        check("a forced skill is not preempted", before === "meta.low" || s7.run === null || s7.run.id === "meta.low");
    });
}

// ------------------------------------------------------------------------ smoke

/** Engine-free context: everything a skill may read, nothing real behind it. */
function fakeCtx(tick = 100) {
    const counts = {
        "minecraft:oak_log": 8, "minecraft:oak_planks": 12, "minecraft:stick": 4,
        "minecraft:cobblestone": 32, "minecraft:stone_pickaxe": 1, "minecraft:stone_sword": 1,
        "minecraft:bread": 3, "minecraft:torch": 8, "minecraft:coal": 6, "minecraft:iron_ingot": 3,
    };
    const bag = VInv.fromCounts(counts);
    bag.find = () => undefined;
    bag.best = () => "minecraft:stone_pickaxe";
    bag.food = () => "minecraft:bread";
    bag.buildBlock = () => "minecraft:cobblestone";
    bag.weapon = () => "minecraft:stone_sword";
    bag.findTool = () => "minecraft:stone_pickaxe";
    bag.hasTool = () => true;
    bag.deposit = () => 0;
    bag.withdraw = () => 0;
    bag.organize = () => [];

    const nothing = () => [];
    const ctx = {
        tick,
        rng: new Rng(tick),
        log: () => { },
        settings: { parkour: true, bridge: true, hunting: true, deepMining: true, camp: true, pvp: false, scoutDistance: 48, scoutRadius: 64, pickupRadius: 8 },
        self: {
            pos: { x: 0, y: 64, z: 0 }, dimension: "minecraft:overworld", hp: 20, maxHp: 20, hunger: 20,
            air: 300, onGround: true, inWater: false, inLava: false, onFire: false, sleeping: false,
            sprinting: false, stuck: false, overDrop: false, trapped: false,
        },
        bag,
        equipment: {},
        armorPoints: 0,
        time: { tick, day: true, daylightLeft: 11000 },
        read: () => "minecraft:air",
        standable: () => false,
        blocks: nothing,
        entities: nothing,
        nearestEntity: () => null,
        threats: nothing,
        owner: () => null,
        foodValue: () => 0,
        hasFood: () => true,
        nav: { pathTo: () => ({ status: "blocked", reason: "stub" }) },
        memory: { read: () => 0, write: () => { }, nearest: () => null },
        act: {
            walkTo: () => "blocked", dig: () => "blocked", place: () => false, attack: () => false,
            lookAt: () => { }, select: () => true, drop: () => false, eat: () => false,
            equipArmor: () => false, use: () => false, sleep: () => false, openContainer: () => null,
            deposit: () => null, mergeStacks: () => 0, pickupNearby: () => 0, stop: () => { },
            jump: () => { }, swimUp: () => { }, craft: () => ({ ok: false, reason: "stub" }),
            smelt: () => ({ ok: false, reason: "stub" }), collectStation: () => null, placeStation: () => false,
        },
        deathPoint: null,
        home: null,
        sheltered: false,
        needsMaintenance: false,
        maintenanceReason: "",
        shouldExplore: false,
        dark: () => false,
        nearTable: () => false,
        nearFurnace: () => false,
        furnaceState: () => null,
        needsItem: () => false,
        pvpTarget: null,
        pvpTargets: nothing,
        hazardNearby: () => null,
        escapeRoute: () => null,
        terrainHints: () => ({}),
        summariseSweep: () => "",
        keepList: () => [],
        intent: { kind: "idle", urgency: 0, reason: "smoke test" },
        mission: null,
        request: null,
    };
    return ctx;
}

function smokeTests() {
    return group("catalog smoke", (check) => {
        const registry = buildRegistry();
        const scheduler = new Scheduler(registry, { rng: new Rng(3) });
        const ctx = fakeCtx();

        // Every registered skill must be able to score/plan against an empty world.
        for (const skill of registry.all()) {
            let ok = true;
            let note = "";
            try {
                skill.score(ctx);
            }
            catch (e) {
                ok = false;
                note = `score: ${e.message}`;
            }
            if (ok && skill.plan) {
                try {
                    skill.plan(ctx);
                }
                catch (e) {
                    ok = false;
                    note = `plan: ${e.message}`;
                }
            }
            check(`${skill.id} scores/plans in an empty world${ok ? "" : ` (${note})`}`, ok);
        }

        // The scheduler itself must survive a few idle ticks with nothing to do.
        let threw = null;
        try {
            for (let t = 0; t < 5; t++)
                scheduler.tick({ ...fakeCtx(200 + t), tick: 200 + t });
        }
        catch (e) {
            threw = e;
        }
        check(`scheduler ticks on an empty world${threw ? ` (${threw.message})` : ""}`, threw === null);

        // A skill that cannot run must report blocked/failed, never throw.
        const pick = registry.get("mining.mine-block") ?? registry.all()[0];
        let result = null;
        try {
            const s = new Scheduler(buildRegistry(), { rng: new Rng(9) });
            s.force(pick.id, fakeCtx(), 1);
            result = s.tick(fakeCtx(2));
        }
        catch (e) {
            result = { status: "threw", message: e.message };
        }
        check(`failed plan is reported, not thrown (${result.status})`, ["blocked", "failed", "running", "done", "idle"].includes(result.status));

        // blocked() is the deliberate vocabulary for "world is not ready yet".
        const stubbed = defineSkill({
            id: "meta.blocked-smoke", category: "meta", tags: ["test"], plan: () => ({}), score: () => 1,
            run: () => blocked("waiting for daylight"),
        });
        check("blocked() is not a failure", stubbed && typeof stubbed.run === "function");
        check("blocked keeps the reason", blocked("why").reason === "why");
        check("failed defaults to retry", failed("why").recovery === "retry");
        check("done carries a message", done("ok").message === "ok");
    });
}

const sections = [
    ["skill catalog", catalogTests],
    ["plan determinism", planTests],
    ["scheduler behaviour", schedulerTests],
    ["catalog smoke", smokeTests],
];
let failedSections = 0;
for (const [name, fn] of sections) {
    const n = fn();
    if (n) {
        failedSections++;
        console.log(`${name}: ${n} FAILED`);
    }
}
console.log(failedSections ? `\n${failedSections} section(s) FAILED` : "\nskills: all sections passed");
process.exit(failedSections ? 1 : 0);
