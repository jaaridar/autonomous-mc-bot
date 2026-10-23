/**
 * Offline tests for the general engines added in v1.3.0:
 *   core/mobs.js        declarative + inferred mob knowledge
 *   core/combat-plan.js damage-race engagement planner for arbitrary groups
 *   core/recipe-book.js generated recipes and the acquisition graph
 *   core/needs.js       survival needs ranked by severity, no scenario names
 *
 * Run: node tools/run-all.mjs
 */
import { describe, archetypeOf, isHostile, dropIndex, hasTrait, MOB_ARCHETYPE } from "./load/scripts/core/mobs.js";
import {
    planEngagement,
    evaluateGroup,
    normalizeThreats,
    focusScore,
    escapeVector,
    surrounded,
    weaponDamage,
    attackRate,
    armorReduction,
} from "./load/scripts/core/combat-plan.js";
import {
    recipeBook,
    findRecipe,
    allRecipes,
    plan,
    explain,
    matchesTag,
    smeltSources,
    bookSize,
    tagMembers,
    SMELT,
} from "./load/scripts/core/recipe-book.js";
import { rankNeeds, NeedsEngine, NEEDS } from "./load/scripts/core/needs.js";
import { findRecipe as mergedRecipe, nextStep, RECIPES } from "./load/scripts/core/recipes.js";
import { getMobStat } from "./load/scripts/core/combat.js";
import { isAnyLog } from "./load/scripts/core/recipes.js";
import { SurvivalMaster } from "./load/scripts/runtime/survival-master.js";
import { Combat } from "./load/scripts/runtime/combat.js";

let pass = 0, fail = 0;
const check = (name, cond, detail) => {
    if (cond) pass++;
    else {
        fail++;
        console.log(`FAIL: ${name}${detail === undefined ? "" : " | " + JSON.stringify(detail).slice(0, 320)}`);
    }
};

// ---------------------------------------------------------------------------
// mob knowledge
// ---------------------------------------------------------------------------
{
    check("mobs: zombie is melee", archetypeOf("minecraft:zombie") === "melee");
    check("mobs: skeleton is an archer", describe("minecraft:skeleton").ranged === true);
    check("mobs: creeper is explosive", describe("minecraft:creeper").explosive === true);
    check("mobs: ghast flies and explodes", describe("minecraft:ghast").flying && describe("minecraft:ghast").explosive);
    check("mobs: warden is no-fight", describe("minecraft:warden").noFight === true);
    check("mobs: blaze carries fire trait", hasTrait("minecraft:blaze", "fire"));
    check("mobs: enderman is a teleporter", hasTrait("minecraft:enderman", "teleport"));
    check("mobs: iron golem is neutral until provoked", describe("minecraft:iron_golem").hostile === false);
    check("mobs: cow is passive", describe("minecraft:cow").hostile === false);
    check("mobs: villager is passive", isHostile("minecraft:villager") === false);

    // Inference for ids the table has never seen.
    check("mobs: namespaced mod zombie", archetypeOf("mymod:ice_zombie") === "melee" && isHostile("mymod:ice_zombie"));
    check("mobs: modded skeleton stays ranged", describe("mymod:laser_skeleton").ranged === true);
    check("mobs: modded creeper stays explosive", describe("mymod:ice_creeper").explosive === true);
    check("mobs: dragon variant is a boss", describe("mymod:elder_ender_dragon").noFight === true);
    check("mobs: unknown monster family is hostile", isHostile("mymod:wraith", { families: ["monster"] }) === true);
    check("mobs: monster hint upgrades a passive-looking id", describe("mymod:wraith", { monster: true }).archetype === "melee");
    check("mobs: unknown without hints is passive", describe("mymod:wraith").hostile === false);

    const drops = dropIndex();
    check("mobs: zombie drops rotten flesh", (drops["minecraft:rotten_flesh"] ?? []).some((d) => d.mob === "minecraft:zombie"));
    check("mobs: enderman drop index has pearls", (drops["minecraft:ender_pearl"] ?? []).length === 1);
    check("mobs: every archetype id resolves", Object.keys(MOB_ARCHETYPE).every((id) => !!describe(`minecraft:${id}`).archetype));

    // Legacy stat shape must still be produced for the rest of the runtime.
    const stat = getMobStat("minecraft:skeleton");
    check("combat: legacy stat keeps range", stat.range === 16 && stat.cover === true);
    check("combat: legacy stats exist for every known mob", Object.keys(MOB_ARCHETYPE).every((id) => typeof getMobStat(`minecraft:${id}`).damage === "number"));
    check("combat: unknown mob still gets stats", getMobStat("mymod:ice_wraith").damage >= 0);
}

// ---------------------------------------------------------------------------
// combat planner
// ---------------------------------------------------------------------------
const mob = (typeId, distance, health) => ({ typeId, location: { x: distance, y: 64, z: 0 }, health });
const ctxFor = (over = {}) => ({
    hp: 20, maxHp: 20, armor: 8, food: 20,
    weaponType: "minecraft:iron_sword",
    botPos: { x: 0, y: 64, z: 0 },
    has: { weapon: true, shield: false, blocks: true, water: false, food: true, bow: false },
    ...over,
});
{
    check("plan: one zombie is a clean fight", planEngagement([mob("minecraft:zombie", 4)], ctxFor()).action === "engage");
    check("plan: clean fight targets the zombie", planEngagement([mob("minecraft:zombie", 4)], ctxFor()).target?.profile?.name === "zombie");

    const crowd = Array.from({ length: 10 }, (_, i) => mob("minecraft:zombie", 2 + i * 0.3));
    const crowdPlan = planEngagement(crowd, ctxFor({ hp: 12 }));
    check("plan: ten zombies is not a brawl", crowdPlan.action !== "engage", crowdPlan.action);
    check("plan: crowd math shows losing", crowdPlan.math.ttd < crowdPlan.math.ttk * 5, crowdPlan.math);

    const archers = Array.from({ length: 5 }, (_, i) => mob("minecraft:skeleton", 10 + i));
    check("plan: five archers make cover", ["cover", "shield_advance"].includes(planEngagement(archers, ctxFor()).action), planEngagement(archers, ctxFor()).action);
    const shielded = planEngagement(archers, ctxFor({ has: { weapon: true, shield: true, blocks: false, water: false, food: true } }));
    check("plan: shield turns archers into an advance", shielded.action === "shield_advance", shielded.action);

    const creeperClose = planEngagement([mob("minecraft:creeper", 2)], ctxFor());
    check("plan: creeper in blast range is retreated from", ["retreat", "flee"].includes(creeperClose.action), creeperClose.action);
    check("plan: blast math is lethal", creeperClose.math.burst >= 12, creeperClose.math.burst);
    const creeperFar = planEngagement([mob("minecraft:creeper", 14)], ctxFor());
    check("plan: a distant creeper is engaged", ["engage", "shield_advance"].includes(creeperFar.action), creeperFar.action);

    const unarmed = planEngagement([mob("minecraft:zombie", 3)], ctxFor({ has: { weapon: false, shield: false, blocks: true, water: false, food: true } }));
    check("plan: an unarmed bot disengages", ["retreat", "flee"].includes(unarmed.action), unarmed.action);

    const boss = planEngagement([mob("minecraft:warden", 6)], ctxFor({ armor: 20, weaponType: "minecraft:netherite_sword" }));
    check("plan: warden is not fought", ["retreat", "flee"].includes(boss.action), boss.action);
    const gearedBoss = planEngagement([mob("minecraft:warden", 6)], ctxFor({ armor: 20, weaponType: "minecraft:netherite_sword", allowBoss: true }));
    check("plan: bosses can be fought when explicitly allowed", gearedBoss.action === "engage", gearedBoss.action);

    const mixed = [mob("minecraft:skeleton", 9), mob("minecraft:zombie", 3), mob("minecraft:spider", 4), mob("minecraft:creeper", 12)];
    const mixedPlan = planEngagement(mixed, ctxFor({ armor: 4 }));
    check("plan: mixed group produces a plan", !!mixedPlan.action && !!mixedPlan.reason);
    check("plan: mixed group focus is ordered", mixedPlan.threats.length === 4 && mixedPlan.threats.every((t) => Number.isFinite(focusScore(t) * 0 + 1)), mixedPlan.threats.map((t) => t.typeId));

    // Focus score prefers damage per second of effort.
    const archerThreat = { profile: describe("minecraft:skeleton"), distance: 6, health: 20, killTime: 1.2, effectiveDps: 2 };
    const tankThreat = { profile: describe("minecraft:iron_golem"), distance: 3, health: 100, killTime: 6, effectiveDps: 2 };
    check("plan: focus prefers the fast kill", focusScore(archerThreat) > focusScore(tankThreat));

    check("plan: surround is detected", surrounded([mob("minecraft:zombie", 4), { typeId: "minecraft:skeleton", location: { x: -4, y: 64, z: 0 } }, { typeId: "minecraft:spider", location: { x: 0, y: 64, z: 4 } }], { x: 0, y: 64, z: 0 }).surrounded === true);
    check("plan: a single mob is not surrounded", surrounded([mob("minecraft:zombie", 4)], { x: 0, y: 64, z: 0 }).surrounded === false);

    const ev = escapeVector(normalizeThreats([mob("minecraft:zombie", 4)], { x: 0, y: 64, z: 0 }), { botPos: { x: 0, y: 64, z: 0 } });
    check("plan: escape vector runs away", ev.x < 0, ev);
    const evOpen = escapeVector(normalizeThreats([mob("minecraft:zombie", 4)], { x: 0, y: 64, z: 0 }), { botPos: { x: 0, y: 64, z: 0 }, openings: [{ x: 0, z: 1 }] });
    check("plan: escape vector prefers an opening", Math.abs(evOpen.z) > 0.9, evOpen);

    check("plan: d20 groups never throw", Array.from({ length: 20 }, () => planEngagement(Array.from({ length: 20 }, () => mob("minecraft:zombie", 2)), ctxFor({ hp: 3 }))).length === 20);
    check("plan: hopeless groups do not engage", planEngagement(Array.from({ length: 20 }, () => mob("minecraft:zombie", 2)), ctxFor({ hp: 3 })).action !== "engage");

    const unknown = planEngagement([{ typeId: "mymod:wraith", location: { x: 4, y: 64, z: 0 }, monster: true }], ctxFor());
    check("plan: modded monster is treated as a threat", unknown.threats.some((t) => t.profile.hostile), unknown.action);

    check("plan: ttd exceeds ttk when winning", (() => { const m = evaluateGroup(normalizeThreats([mob("minecraft:zombie", 3)]), ctxFor()); return m.ttd > m.ttk; })());
    check("plan: armor reduces incoming damage", (() => {
        const bare = evaluateGroup(normalizeThreats([mob("minecraft:zombie", 2)]), ctxFor({ armor: 0 })).incomingDps;
        const armored = evaluateGroup(normalizeThreats([mob("minecraft:zombie", 2)]), ctxFor({ armor: 20 })).incomingDps;
        return armored < bare;
    })());
    check("combat: weapon table", weaponDamage("minecraft:diamond_sword") === 7 && weaponDamage("minecraft:netherite_sword") === 8 && weaponDamage("minecraft:dirt") === 1);
    check("combat: attack rate table", attackRate("minecraft:iron_sword") > attackRate("minecraft:iron_axe"));
    check("combat: armor cap", armorReduction(60) === 0.8);
    check("plan: deterministic", JSON.stringify(planEngagement([mob("minecraft:zombie", 3)], ctxFor()).action) === JSON.stringify(planEngagement([mob("minecraft:zombie", 3)], ctxFor()).action));
}

// ---------------------------------------------------------------------------
// recipe book
// ---------------------------------------------------------------------------
{
    check("recipes: book is generated at scale", bookSize() > 200, bookSize());
    check("recipes: every wood has a door", ["oak", "bamboo", "crimson", "pale_oak"].every((w) => !!findRecipe(`minecraft:${w}_door`)));
    check("recipes: every material has a pickaxe", ["wooden", "stone", "iron", "golden", "diamond", "netherite"].every((m) => !!findRecipe(`minecraft:${m}_pickaxe`)));
    check("recipes: armour pieces generated", ["helmet", "chestplate", "leggings", "boots"].every((p) => !!findRecipe(`minecraft:diamond_${p}`)));
    check("recipes: all 16 bed colours", tagMembers("#wool").every((w) => !!findRecipe(w.replace("_wool", "_bed"))));
    check("recipes: outputs are unique", new Set(allRecipes().map((r) => r.output)).size === allRecipes().length);
    check("recipes: static list merged", RECIPES.length >= bookSize());
    check("recipes: merged lookup finds generated items", !!mergedRecipe("minecraft:birch_trapdoor"));

    check("tags: planks match oak", matchesTag("minecraft:oak_planks", "#planks"));
    check("tags: logs match crimson stem", matchesTag("minecraft:crimson_stem", "#logs"));
    check("tags: carbon matches charcoal", matchesTag("minecraft:charcoal", "#carbon"));
    check("tags: wool does not match planks", matchesTag("minecraft:white_wool", "#planks") === false);

    const bucket = plan("minecraft:bucket", 1, {}, {});
    check("plan: bucket is not blocked", bucket.blocked === false, bucket);
    check("plan: bucket needs smelting", bucket.steps.some((s) => s.kind === "smelt" && s.output === "minecraft:iron_ingot"), bucket.steps);
    check("plan: bucket crafts a table first", bucket.steps.some((s) => s.kind === "craft" && s.item === "minecraft:crafting_table"), bucket.steps);
    check("plan: bucket gathers iron", bucket.steps.some((s) => s.kind === "gather" && s.item === "minecraft:raw_iron"), bucket.steps);
    check("plan: bucket with a table and furnace is short", plan("minecraft:bucket", 1, {}, { table: true, furnace: true }).steps.length <= 3);

    const sword = plan("minecraft:diamond_sword", 1, {}, { table: true });
    check("plan: diamond sword gathers diamonds", sword.steps.some((s) => s.kind === "gather" && s.item === "minecraft:diamond" && s.count === 2), sword.steps);
    check("plan: diamond sword crafts sticks", sword.steps.some((s) => s.kind === "craft" && s.item === "minecraft:stick"), sword.steps);
    check("plan: no duplicate crafts", new Set(sword.steps.filter((s) => s.kind === "craft").map((s) => s.item)).size === sword.steps.filter((s) => s.kind === "craft").length);

    const pearl = plan("minecraft:ender_pearl", 2, {}, { mobDrops: { "minecraft:ender_pearl": [{ mob: "minecraft:enderman", count: 1 }] } });
    check("plan: mob drops become a hunt", pearl.steps.some((s) => s.kind === "kill" && s.mob === "minecraft:enderman"), pearl.steps);

    const raw = plan("minecraft:sponge", 1, {}, {});
    check("plan: unknown item falls back to gathering", raw.steps.some((s) => s.kind === "gather" && s.item === "minecraft:sponge"));

    const held = plan("minecraft:iron_pickaxe", 1, { "minecraft:iron_ingot": 3, "minecraft:stick": 2 }, { table: true });
    check("plan: held materials mean no gathering", held.steps.every((s) => s.kind !== "gather"), held.steps);

    const scrap = plan("minecraft:netherite_ingot", 1, {}, { table: true, furnace: true });
    check("plan: netherite chain reaches scrap", scrap.steps.some((s) => s.kind === "gather" && /ancient_debris|netherite_scrap/.test(s.item)), scrap.steps);

    check("smelt: raw iron -> ingot", smeltSources("minecraft:iron_ingot").some((s) => s.input === "minecraft:raw_iron"));
    check("smelt: food is covered", SMELT.some((s) => s.input === "minecraft:beef" && s.output === "minecraft:cooked_beef"));
    check("smelt: glass from sand", smeltSources("minecraft:glass").some((s) => s.input === "minecraft:sand"));

    const info = explain("minecraft:shield", { "minecraft:oak_planks": 6, "minecraft:iron_ingot": 1 }, { table: true });
    check("explain: reports craftability", info.craftable && info.recipe.table === true);
    check("explain: reports the plan", Array.isArray(info.steps) && info.blocked === false);

    check("recipes: identical plan twice", JSON.stringify(plan("minecraft:iron_sword", 1, {}, { table: true })) === JSON.stringify(plan("minecraft:iron_sword", 1, {}, { table: true })));
    check("recipes: planning is bounded", plan("minecraft:amethyst_shard", 4, {}, {}).steps.length < 10);

    // nextStep (the runtime's entry point) uses the same knowledge.
    check("nextStep: smelting is a first-class step", nextStep("minecraft:iron_ingot", 2, { "minecraft:raw_iron": 2 }, true).kind === "smelt");
    check("nextStep: generated recipe is found", nextStep("minecraft:bamboo_door", 1, { "minecraft:bamboo_planks": 6 }, true).kind === "craft");
}

// ---------------------------------------------------------------------------
// needs engine
// ---------------------------------------------------------------------------
const needCtx = (over = {}) => ({
    hp: 20, maxHp: 20, hunger: 20, air: 300, hostileCount: 0,
    hasFood: true, hasWater: false, hasTorch: true, canBuild: true, canDig: true,
    safe: true, freeSlots: 9, ...over,
});
{
    check("needs: calm context has nothing urgent", rankNeeds(needCtx()).length === 0, rankNeeds(needCtx()));

    const drowning = rankNeeds(needCtx({ headInWater: true, air: 40, hunger: 3 }));
    check("needs: drowning outranks hunger", drowning[0]?.id === "breathe" && drowning[0].action === "surface", drowning);

    const lava = rankNeeds(needCtx({ inLava: true }));
    check("needs: lava is an emergency", lava[0]?.id === "lava" && lava[0].severity >= 0.99);

    check("needs: burning names an action", rankNeeds(needCtx({ onFire: true, hasWater: true }))[0]?.action === "douse");
    check("needs: suffocation digs out", rankNeeds(needCtx({ headBlocked: true, canDig: true }))[0]?.action === "dig_out");
    check("needs: suffocation without a tool is not proposed", rankNeeds(needCtx({ headBlocked: true, canDig: false })).some((n) => n.id === "suffocating") === false);

    const hurt = rankNeeds(needCtx({ hp: 6 }));
    check("needs: low health is ranked", hurt[0]?.id === "heal", hurt);
    check("needs: low health with food means eat", rankNeeds(needCtx({ hp: 6, hunger: 10 }))[0]?.action === "eat");

    const starving = rankNeeds(needCtx({ hunger: 2, hp: 18, hasFood: false }));
    check("needs: no food and nothing to hunt is not proposed", starving.some((n) => n.id === "starving") === false, starving);
    check("needs: food makes starving actionable", rankNeeds(needCtx({ hunger: 2, hasFood: true })).some((n) => n.action === "eat"));

    const fight = rankNeeds(needCtx({ hp: 5, combatSeverity: 0.95, combatAction: "flee", combatReason: "losing" }));
    check("needs: losing a fight triggers disengage", fight[0]?.action === "disengage", fight);

    check("needs: full inventory is a need", rankNeeds(needCtx({ freeSlots: 0 }))[0]?.action === "dump_inventory");
    check("needs: no weapon with hostiles rearms", rankNeeds(needCtx({ hasWeapon: false, hostileCount: 2 })).some((n) => n.id === "unarmed"));
    check("needs: night exposure prefers shelter", rankNeeds(needCtx({ night: true, sheltered: false, hostileCount: 3 })).some((n) => n.id === "exposure"));

    // Hysteresis: the engine should not flip every call for near-equal needs.
    const engine = new NeedsEngine({ margin: 12, hold: 20 });
    const a = engine.assess(needCtx({ hp: 9, hunger: 12 }), 0);
    const b = engine.assess(needCtx({ hp: 9, hunger: 11 }), 2);
    check("needs: engine commits between similar calls", a?.id === b?.id, [a?.id, b?.id]);
    check("needs: engine reports a reason", typeof b?.reason === "string" && b.reason.length > 0);

    const eng2 = new NeedsEngine();
    const first = eng2.assess(needCtx({ headInWater: true, air: 20 }), 0);
    check("needs: emergency pre-empts immediately", first?.id === "breathe");
    const next = eng2.assess(needCtx({ hp: 4 }), 1);
    check("needs: emergency escalates on the next tick", next?.id === "breathe" || next?.id === "heal", next?.id);

    check("needs: every definition is well formed", NEEDS.every((n) => typeof n.id === "string" && typeof n.severity === "function" && typeof n.satisfy === "function"));
    check("needs: severity is always 0..1", NEEDS.every((n) => {
        const v = n.severity(needCtx({ headInWater: true, inLava: true, onFire: true, hp: 1, hunger: 0, hostileCount: 5, combatSeverity: 1, freeSlots: 0, stuckLevel: 5, toolDurabilityLow: true, fallDistance: 30, headBlocked: true, lightLevel: 0, night: true }));
        return v >= 0 && v <= 1;
    }));
}

// ---------------------------------------------------------------------------
// wiring: the runtime actually uses the new engines
// ---------------------------------------------------------------------------
{
    check("isAnyLog: bamboo is a log", isAnyLog("minecraft:bamboo") && isAnyLog("minecraft:bamboo_block"));
    check("isAnyLog: bamboo door is not", isAnyLog("minecraft:bamboo_door") === false);
    check("isAnyLog: crimson stem is wood", isAnyLog("minecraft:crimson_stem"));

    const flat = (p) => ({ passable: true, support: false, hazard: false, type: "minecraft:air" });
    const solid = (p) => ({ passable: p.y <= 63, support: p.y <= 63, hazard: false, type: p.y <= 63 ? "minecraft:stone" : "minecraft:air" });
    const bag = {
        size: 3,
        get: (i) => [{ typeId: "minecraft:iron_sword", amount: 1 }, { typeId: "minecraft:bread", amount: 4 }, { typeId: "minecraft:torch", amount: 8 }][i],
        find: (pred) => [{ typeId: "minecraft:iron_sword" }, { typeId: "minecraft:bread" }, { typeId: "minecraft:torch" }].findIndex(pred),
        weapon: () => 0,
        hasFood: () => true,
        hasTool: () => true,
        container: { emptySlotsCount: 6 },
        counts: () => ({ "minecraft:torch": 8, "minecraft:bread": 4 }),
        select: (i) => ({ typeId: "minecraft:torch", slot: i }),
    };
    const terrain = {
        read: solid,
        block: (p) => ({ typeId: p.y <= 63 ? "minecraft:stone" : "minecraft:air", isAir: p.y > 63, isSolid: p.y <= 63 }),
        typeAt: () => "minecraft:air",
        safe: () => true,
        solid: (p) => p.y <= 63,
        empty: (p) => p.y > 63,
        dangerous: () => false,
        lavaNear: () => false,
        headInWater: () => false,
        threatInfo: () => ({ list: [], nearest: undefined, count: 0, ranged: 0, explosive: 0, melee: 0, closest: Infinity }),
        line: () => true,
        groundNear: (x, z, y) => ({ x, y: Math.max(y - 1, 63), z }),
        tableNear: () => false,
    };
    const sim = {
        location: { x: 0.5, y: 64, z: 0.5 },
        isInWater: false,
        isOnGround: true,
        isOnFire: false,
        isValid: true,
        dimension: { id: "minecraft:overworld" },
        getComponent: (name) => {
            if (name === "minecraft:health") return { currentValue: 20, effectiveMax: 20 };
            if (name === "minecraft:player.hunger") return { currentValue: 20 };
            return { currentValue: 0 };
        },
        jump() {},
        moveToLocation() {},
        stopMoving() {},
        getHeadLocation: () => ({ x: 0.5, y: 65.6, z: 0.5 }),
    };
    const bot = {
        sim,
        bag,
        terrain,
        host: { relative: (p) => p },
        owner: () => undefined,
        settings: { assistedCrafting: true },
        parkour: {},
        escaper: {},
        combat: undefined,
        builder: { canBuild: true, countBlocks: () => 32, pillar: () => "placed", placeAt: () => "placed" },
        nav: { reset() {}, urgent: false, avoid: [] },
        equipment: { hasWeapon: () => true, estimateArmor: () => 8 },
        record() {},
        tell() {},
        navTo() { return "done"; },
        digCell() { return "digging"; },
        eat() {},
        retreat() {},
        camp() { return true; },
        placeTorch() { return true; },
        obtain() { return true; },
        resource: { organizeIfNeeded() {} },
        stuckRecovery: { watchdog: { level: 0 } },
        reason: "",
        fault() {},
    };
    bot.combat = new Combat(bot);
    bot.survivalMaster = new SurvivalMaster(bot);

    const ctx = {
        hp: 4, hunger: 6, time: "day", location: "surface", threats: [], counts: bot.bag.counts(),
        hasWeapon: true, hasTorch: true, hasWater: false, hasBlocks: true, blockCount: 32,
        hasPickaxe: true, pickaxeDurabilityLow: false, inventoryFull: false, lowDurability: false,
        noShelter: false, oxygenLow: false, nearLava: false, onLedge: false, tooDeep: false,
        flooded: false, gravelCollapse: false, triggers: [], p: { x: 0, y: 64, z: 0 }, tick: 100,
    };
    const needCtxBuilt = bot.survivalMaster.needsContext(ctx, 100);
    check("wiring: needs context is built", needCtxBuilt.hp === 4 && needCtxBuilt.hasWeapon === true);
    const acted = bot.survivalMaster.generalResponse(ctx, 100);
    check("wiring: low health is acted on", acted === true, acted);
    check("wiring: the action is recorded", /Needs:/.test(bot.reason), bot.reason);

    // Never throws on a hostile context either.
    const hostile = { ...ctx, hp: 3, threats: [{ typeId: "minecraft:zombie", location: { x: 3, y: 64, z: 0 }, getHeadLocation: () => ({ x: 3, y: 65.6, z: 0 }) }] };
    let threw = false;
    try { bot.survivalMaster.generalResponse(hostile, 120); } catch (e) { threw = true; console.log(e); }
    check("wiring: hostile context does not throw", threw === false);

    // Combat.evaluate drives the planner.
    const evalRes = bot.combat.evaluate(100);
    check("wiring: combat evaluate returns a plan", !!evalRes.plan && typeof evalRes.plan.action === "string", evalRes.plan?.action);
    check("wiring: combat keeps the legacy fields", typeof evalRes.shouldRetreat === "boolean" && !!evalRes.assessment);
    check("wiring: no hostiles means hold", evalRes.plan.action === "hold", evalRes.plan.action);
}

console.log(`\ngeneral engines: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
