/**
 * Entity knowledge — one declarative table, no per-mob `if` chains.
 *
 * A mob is described by an *archetype* (how it fights) plus overrides. Every
 * vanilla mob maps to an archetype; anything unknown (a modded entity, a new
 * mob after an update, a renamed variant) is inferred from its id with ordered
 * pattern rules, so the combat and survival code never has to be taught about
 * a mob to behave sanely against it.
 *
 * Pure: no engine imports. Used by core/combat.js (legacy stat shape),
 * core/combat-plan.js (engagement math) and core/recipe-book.js (drops).
 */

const K = (s) => (s.includes(":") ? s : `minecraft:${s}`);

/**
 * Archetypes. A single object per fighting style:
 *   hp        typical health
 *   damage    damage per hit
 *   reach     melee reach, or projectile range for ranged archetypes
 *   speed     relative movement speed (0..1)
 *   interval  ticks between attacks
 *   traits    behavioural flags the planners read
 *   terror    base fear (0..10) used by the legacy fear score
 *   priority  kill order bias (higher = kill first)
 *   groupFear extra fear per additional mob of this kind
 *   tactic    the legacy tactic name the runtime understands
 */
export const ARCHETYPES = {
    melee: { hp: 20, damage: 3, reach: 1.5, speed: 0.23, interval: 20, traits: ["melee"], terror: 3, priority: 2, groupFear: 0.4, tactic: "kite" },
    brute: { hp: 24, damage: 7, reach: 2, speed: 0.27, interval: 24, traits: ["melee", "heavy"], terror: 6, priority: 6, groupFear: 0.7, tactic: "kite" },
    archer: { hp: 20, damage: 4, reach: 16, speed: 0.25, interval: 40, traits: ["ranged", "projectile"], terror: 6, priority: 6, groupFear: 0.8, tactic: "cover_rush" },
    crossbow: { hp: 24, damage: 5, reach: 18, speed: 0.25, interval: 50, traits: ["ranged", "projectile"], terror: 6, priority: 6, groupFear: 0.7, tactic: "cover_rush" },
    bomber: { hp: 20, damage: 22, reach: 3, speed: 0.25, interval: 30, traits: ["explosive", "suicide"], terror: 10, priority: 10, groupFear: 0.5, tactic: "retreat" },
    leaper: { hp: 16, damage: 2, reach: 1.5, speed: 0.32, interval: 20, traits: ["melee", "fast", "climb"], terror: 4, priority: 2, groupFear: 0.5, tactic: "strafe" },
    poisoner: { hp: 12, damage: 2, reach: 1.5, speed: 0.32, interval: 20, traits: ["melee", "fast", "poison"], terror: 6, priority: 4, groupFear: 0.6, tactic: "strafe" },
    teleporter: { hp: 40, damage: 7, reach: 3, speed: 0.32, interval: 20, traits: ["melee", "teleport", "neutral", "water_weak"], terror: 7, priority: 5, groupFear: 0.3, tactic: "low_roof" },
    fire_ranged: { hp: 20, damage: 6, reach: 16, speed: 0.3, interval: 30, traits: ["ranged", "fire", "flying", "projectile"], terror: 8, priority: 8, groupFear: 1.2, tactic: "dodge_rush" },
    flying_bomber: { hp: 10, damage: 12, reach: 32, speed: 0.2, interval: 60, traits: ["ranged", "explosive", "flying", "projectile"], terror: 9, priority: 9, groupFear: 1.5, tactic: "cover" },
    potion: { hp: 26, damage: 6, reach: 10, speed: 0.25, interval: 40, traits: ["ranged", "potion", "heals"], terror: 8, priority: 9, groupFear: 0.7, tactic: "rush" },
    summoner: { hp: 24, damage: 6, reach: 12, speed: 0.25, interval: 40, traits: ["ranged", "summon"], terror: 8, priority: 9, groupFear: 0.8, tactic: "rush" },
    flyer: { hp: 14, damage: 5, reach: 1.5, speed: 0.35, interval: 20, traits: ["melee", "flying", "fast"], terror: 6, priority: 6, groupFear: 0.7, tactic: "strafe" },
    aquatic: { hp: 30, damage: 6, reach: 12, speed: 0.3, interval: 40, traits: ["ranged", "aquatic", "projectile"], terror: 6, priority: 6, groupFear: 0.6, tactic: "cover" },
    turret: { hp: 30, damage: 4, reach: 16, speed: 0, interval: 40, traits: ["ranged", "static", "levitation"], terror: 6, priority: 6, groupFear: 0.5, tactic: "cover" },
    splitter: { hp: 16, damage: 3, reach: 1.5, speed: 0.2, interval: 20, traits: ["melee", "splits"], terror: 2, priority: 1, groupFear: 0.3, tactic: "kite" },
    fire_melee: { hp: 16, damage: 4, reach: 1.5, speed: 0.2, interval: 20, traits: ["melee", "fire"], terror: 4, priority: 3, groupFear: 0.4, tactic: "kite" },
    swarm: { hp: 8, damage: 1, reach: 1, speed: 0.25, interval: 20, traits: ["melee", "swarm"], terror: 3, priority: 2, groupFear: 0.8, tactic: "kite" },
    heavy: { hp: 100, damage: 14, reach: 2.5, speed: 0.25, interval: 20, traits: ["melee", "heavy", "knockback"], terror: 9, priority: 9, groupFear: 1.0, tactic: "pillar" },
    boss: { hp: 300, damage: 30, reach: 4, speed: 0.3, interval: 20, traits: ["boss", "melee", "heavy"], terror: 10, priority: 10, groupFear: 2.0, tactic: "flee", noFight: true },
    boss_ranged: { hp: 300, damage: 8, reach: 20, speed: 0.3, interval: 30, traits: ["boss", "ranged", "flying", "explosive"], terror: 10, priority: 10, groupFear: 2.0, tactic: "flee", noFight: true },
};

/** Vanilla mobs -> archetype. Data, not logic. */
export const MOB_ARCHETYPE = {
    zombie: "melee", zombie_villager: "melee", zombie_villager_v2: "melee", husk: "melee", drowned: "archer",
    zombie_horse: "melee", zombified_piglin: "melee",
    skeleton: "archer", stray: "archer", bogged: "archer", wither_skeleton: "brute",
    spider: "leaper", cave_spider: "poisoner", silverfish: "swarm", endermite: "swarm",
    creeper: "bomber", slime: "splitter", magma_cube: "fire_melee",
    enderman: "teleporter",
    blaze: "fire_ranged", ghast: "flying_bomber", phantom: "flyer",
    witch: "potion", evocation_illager: "summoner", evoker: "summoner", illusioner: "summoner",
    pillager: "crossbow", vindicator: "brute", vex: "flyer", ravager: "heavy",
    guardian: "aquatic", elder_guardian: "aquatic", shulker: "turret",
    piglin: "melee", piglin_brute: "brute", hoglin: "heavy", zoglin: "heavy",
    warden: "boss", wither: "boss_ranged", ender_dragon: "boss_ranged",
    iron_golem: "heavy", snow_golem: "swarm",
    // Passive mobs: still described (drops, flee) but never counted as hostile.
    chicken: "passive", cow: "passive", pig: "passive", sheep: "passive", rabbit: "passive",
    horse: "passive", donkey: "passive", mule: "passive", llama: "passive", villager: "passive",
    wolf: "passive", cat: "passive", ocelot: "passive", fox: "passive", bat: "passive",
    squid: "passive", glow_squid: "passive", cod: "passive", salmon: "passive", tropical_fish: "passive",
    pufferfish: "poisoner", turtle: "passive", strider: "passive", axolotl: "passive",
    allay: "passive", frog: "passive", goat: "passive", camel: "passive", sniffer: "passive",
    armadillo: "passive", breeze: "flyer", bogged_skeleton: "archer", creaking: "brute",
    happy_ghast: "passive",
};

ARCHETYPES.passive = { hp: 10, damage: 0, reach: 1, speed: 0.2, interval: 20, traits: ["passive"], terror: 0, priority: 0, groupFear: 0, tactic: "none" };

/** Ordered inference rules for ids the table does not know. First match wins. */
const INFERENCE = [
    [/ender_dragon|wither(?!_skeleton)|warden|elder_guardian/, "boss"],
    [/creeper|tnt_/, "bomber"],
    [/ghast/, "flying_bomber"],
    [/blaze|wither_skeleton|magma/, "fire_ranged"],
    [/skeleton|stray|bogged|archer/, "archer"],
    [/pillager|crossbow|illusioner/, "crossbow"],
    [/witch|evoker|evocation|illusioner|summon/, "summoner"],
    [/enderman|shulker|teleport/, "teleporter"],
    [/spider|silverfish|endermite|mite/, "poisoner"],
    [/slime|cube|magma_cube/, "splitter"],
    [/phantom|vex|bat|allay|breeze/, "flyer"],
    [/guardian|drowned|squid|fish|axolotl/, "aquatic"],
    [/golem|ravager|hoglin|zoglin|brute|iron_|warden/, "heavy"],
    [/zombie|husk|piglin|vindicator|illager/, "melee"],
    [/cow|pig|sheep|chicken|rabbit|horse|villager|cat|wolf|fox|turtle|strider|frog|goat|camel|sniffer|armadillo|bee|passive/, "passive"],
];

/** Hostile families: what the bot must treat as a threat when it sees it. */
const HOSTILE_RULES = [
    /^(zombie|husk|drowned|skeleton|stray|bogged|wither_skeleton|creeper|spider|cave_spider|slime|magma_cube|silverfish|endermite|enderman|witch|blaze|ghast|phantom|pillager|vindicator|evocation_illager|evoker|illusioner|vex|ravager|guardian|elder_guardian|shulker|piglin|piglin_brute|hoglin|zoglin|warden|wither|ender_dragon)$/,
    /^(zombie_|husk_|drowned_|skeleton_|creeper_|spider_|phantom_|pillager_|vex_|shulker_|piglin_|hoglin_)/,
    // Anywhere in the path: covers modded names like `ice_zombie`, `nether_creeper`.
    /(^|_)(zombie|husk|drowned|skeleton|stray|creeper|spider|slime|cube|enderman|witch|blaze|ghast|phantom|pillager|vindicator|vex|ravager|guardian|shulker|piglin|hoglin|warden|wither|mite|silverfish)(_|$)/,
];
const NEVER_HOSTILE = /^(villager|wandering_trader|iron_golem|snow_golem|allay|axolotl|bat|cod|salmon|tropical_fish|pufferfish|turtle|strider|frog|goat|camel|sniffer|armadillo|happy_ghast|bee|cat|ocelot|wolf|fox|parrot|chicken|cow|pig|sheep|rabbit|horse|donkey|mule|llama|trader_llama|squid|glow_squid)$/;

const DROPS = {
    zombie: { rotten_flesh: 2 }, husk: { rotten_flesh: 2, sand: 0 }, drowned: { rotten_flesh: 1, copper_ingot: 0, trident: 0 },
    zombie_villager: { rotten_flesh: 1 }, skeleton: { bone: 2, arrow: 2 }, stray: { bone: 2, arrow: 2, tipped_arrow: 0 },
    bogged: { bone: 2, arrow: 2 }, wither_skeleton: { bone: 1, coal: 1 }, creeper: { gunpowder: 2 },
    spider: { string: 2, spider_eye: 1 }, cave_spider: { string: 1, spider_eye: 0 }, enderman: { ender_pearl: 1 },
    endermite: { ender_pearl: 0 }, silverfish: {}, slime: { slime_ball: 2 }, magma_cube: { magma_cream: 1 },
    blaze: { blaze_rod: 1 }, ghast: { ghast_tear: 1, gunpowder: 2 }, phantom: { phantom_membrane: 1 },
    witch: { glowstone_dust: 1, redstone: 1, sugar: 1, spider_eye: 1, glass_bottle: 1 },
    evocation_illager: { totem_of_undying: 1, emerald: 1 }, evoker: { totem_of_undying: 1, emerald: 1 },
    vindicator: { emerald: 1 }, pillager: { arrow: 2 }, vex: {}, ravager: { saddle: 1 },
    guardian: { prismarine_shard: 2, prismarine_crystals: 1, cod: 1 }, elder_guardian: { sponge: 1, prismarine_shard: 2 },
    shulker: { shulker_shell: 1 }, piglin: { gold_nugget: 3 }, piglin_brute: { golden_axe: 0 },
    hoglin: { porkchop: 2, leather: 1 }, zoglin: { rotten_flesh: 2 }, warden: { sculk_catalyst: 1 },
    iron_golem: { iron_ingot: 3, poppy: 2 }, snow_golem: { snowball: 4 },
    chicken: { chicken: 1, feather: 2 }, cow: { beef: 2, leather: 2 }, pig: { porkchop: 2 },
    sheep: { mutton: 2, wool: 1 }, rabbit: { rabbit: 1, rabbit_hide: 1, rabbit_foot: 0 },
    squid: { ink_sac: 2 }, glow_squid: { glow_ink_sac: 2 }, cod: { cod: 1 }, salmon: { salmon: 1 },
    bat: {}, horse: { leather: 1 }, strider: { string: 2 }, turtle: { seagrass: 0 },
    wither: { nether_star: 1 }, ender_dragon: { dragon_egg: 1 },
};

function normalizeId(typeId) {
    // Any namespace (minecraft:, a mod id) is dropped: behaviour is inferred
    // from the path, so `mymod:ice_zombie` is treated as a zombie.
    const parts = String(typeId ?? "").split(":");
    return parts[parts.length - 1];
}

/**
 * Resolve the archetype for any type id, known or not.
 * `unknown` falls back to `melee` when the id looks hostile and to `passive`
 * otherwise, so a brand-new modded mob is still handled sensibly.
 */
export function archetypeOf(typeId) {
    const raw = normalizeId(typeId);
    if (!raw) return "passive";
    if (MOB_ARCHETYPE[raw]) return MOB_ARCHETYPE[raw];
    for (const [pattern, archetype] of INFERENCE) if (pattern.test(raw)) return archetype;
    return HOSTILE_RULES.some((r) => r.test(raw)) ? "melee" : "passive";
}

/**
 * Hostility. The id table covers vanilla; `hints.families` (from the engine's
 * type_family component) covers modded mobs, which is the only reliable signal
 * for an id nobody has seen before.
 */
export function isHostile(typeId, hints = {}) {
    const raw = normalizeId(typeId);
    if (!raw) return false;
    const families = hints.families ?? [];
    if (families.some((f) => /monster|undead|arthropod|illager|aquatic_monster|skeleton/.test(String(f)))) return true;
    if (hints.monster === true) return true;
    if (NEVER_HOSTILE.test(raw)) return false;
    if (HOSTILE_RULES.some((r) => r.test(raw))) return true;
    return false;
}

/** Descriptions are immutable, so the plain form is cached per id. */
const DESCRIBE_CACHE = new Map();

/** Full description of a mob: archetype stats, traits, drops, threat class. */
export function describe(typeId, hints = {}) {
    const cacheable = !hints || (!hints.monster && !hints.families?.length);
    const cacheKey = String(typeId ?? "");
    if (cacheable) {
        const hit = DESCRIBE_CACHE.get(cacheKey);
        if (hit) return hit;
    }
    const out = describeUncached(typeId, hints);
    if (cacheable && DESCRIBE_CACHE.size < 512) DESCRIBE_CACHE.set(cacheKey, out);
    return out;
}

function describeUncached(typeId, hints = {}) {
    const raw = normalizeId(typeId);
    let archetype = archetypeOf(raw);
    // An engine-reported monster with an unrecognised name is a melee mob until
    // its behaviour proves otherwise; never silently ignore it.
    if (archetype === "passive" && isHostile(raw, hints)) archetype = "melee";
    const base = ARCHETYPES[archetype] ?? ARCHETYPES.melee;
    const traits = [...base.traits];
    const drops = {};
    for (const [item, n] of Object.entries(DROPS[raw] ?? {})) drops[K(item)] = n;
    return {
        id: K(raw),
        name: raw,
        archetype,
        hostile: isHostile(raw, hints) && archetype !== "passive",
        hp: base.hp,
        damage: base.damage,
        reach: base.reach,
        range: base.reach,
        speed: base.speed,
        interval: base.interval,
        traits,
        terror: base.terror,
        priority: base.priority,
        groupFear: base.groupFear,
        tactic: base.tactic,
        noFight: base.noFight === true || traits.includes("boss"),
        flying: traits.includes("flying"),
        ranged: traits.includes("ranged"),
        explosive: traits.includes("explosive"),
        aquatic: traits.includes("aquatic"),
        drops,
    };
}

export function hasTrait(typeId, trait) {
    return describe(typeId).traits.includes(trait);
}

/** All known drops keyed by item id, for the recipe/acquisition graph. */
export function dropIndex() {
    const index = {};
    for (const mob of Object.keys(DROPS)) {
        const d = describe(K(mob));
        for (const [item, n] of Object.entries(d.drops)) {
            if (!n) continue;
            (index[item] ??= []).push({ mob: K(mob), count: n });
        }
    }
    return index;
}

/** Legacy hostiles set export, kept so older imports keep working. */
export const HOSTILE_IDS = Object.keys(MOB_ARCHETYPE)
    .map(K)
    .filter((id) => isHostile(id) && archetypeOf(id) !== "passive");
