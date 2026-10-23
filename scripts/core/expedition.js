/**
 * Expedition readiness — when is the bot allowed to leave for the Nether?
 *
 * Going early is how a bot dies: no pickaxe to dig netherrack, no food for the
 * trip back, nothing to light a portal with. Going too late is how it never
 * leaves. This module answers with a small, tunable model instead of an
 * `if (iron >= 3)` buried in a director:
 *
 *   assessExpedition(ctx) -> { ready, score, blockers[], plan[], reason }
 *
 * `blockers` are ordered by how much they matter, and each one names the real
 * item that is missing, so the runtime can either provision it or wait. The
 * travel machine itself delegates obsidian gathering, so "obsidian" only counts
 * as a blocker when there is no bucket path and no known portal either.
 *
 * Pure: the runtime reads the bag and the world and passes a plain context.
 */

const K = (s) => (s.includes(":") ? s : `minecraft:${s}`);

/** Thresholds, in one place so they can be tuned without touching logic. */
export const EXPEDITION = {
    minHealth: 14,          // half a bar plus: enough to survive a bad arrival
    minFood: 6,             // items, not hunger points
    minPickaxeTier: 2,      // stone pickaxe: netherrack, quartz, gold, bricks
    minObsidian: 10,        // the cheap 4x5 frame (corners optional)
    minIronForIgnition: 1,  // flint and steel
    minGravel: 1,           // flint source for ignition
    travelCooldown: 6000,   // ticks between autonomous trips (~5 minutes)
    hostileRadius: 12,      // do not walk away mid-fight
};

/** Pickaxe tier the bot actually carries, from item ids. */
export function pickaxeTier(counts = {}) {
    const has = (name) => (counts[K(name)] ?? 0) > 0;
    if (has("netherite_pickaxe")) return 5;
    if (has("diamond_pickaxe")) return 4;
    if (has("iron_pickaxe")) return 3;
    if (has("stone_pickaxe")) return 2;
    if (has("wooden_pickaxe")) return 1;
    return 0;
}

export function foodCount(counts = {}) {
    const FOOD = /(_cooked|bread|cookie|apple|carrot|potato|beetroot|melon_slice|berries|stew|beef|porkchop|mutton|chicken|rabbit|cod|salmon|dried_kelp)$/;
    let n = 0;
    for (const [type, amount] of Object.entries(counts)) if (FOOD.test(type)) n += amount;
    return n;
}

function hasIgnition(counts) {
    if ((counts[K("flint_and_steel")] ?? 0) > 0) return true;
    if ((counts[K("fire_charge")] ?? 0) > 0) return true;
    // Craftable on the spot: iron + flint (flint from gravel).
    const iron = (counts[K("iron_ingot")] ?? 0) > 0;
    const flint = (counts[K("flint")] ?? 0) > 0;
    const gravel = (counts[K("gravel")] ?? 0) > 0;
    return iron && (flint || gravel);
}

function hasObsidianPath(counts, ctx) {
    if ((counts[K("obsidian")] ?? 0) >= EXPEDITION.minObsidian) return true;
    // Bucket + water: the bot can make obsidian on demand.
    if ((counts[K("bucket")] ?? 0) > 0 || (counts[K("water_bucket")] ?? 0) > 0) return true;
    // A portal is already known (remembered or visible).
    if (ctx.portalKnown) return true;
    return false;
}

/**
 * @param {object} ctx
 *   counts          inventory {typeId: n}
 *   health, maxHealth
 *   food            item count (defaults to counting `counts`)
 *   dimension       current dimension id
 *   travelActive    a trip is already running
 *   travelReadyAt   tick before which no new trip may start
 *   tick
 *   hostiles        number of hostiles within EXPEDITION.hostileRadius
 *   inWater, inLava, onFire, falling
 *   portalKnown     a portal is remembered/visible nearby
 *   allowNether     setting (false = never)
 *   mode            bot mode ("survival" | "speedrun" | ...)
 *   netherLoot      items gathered on the last trip (for reporting)
 */
export function assessExpedition(ctx = {}) {
    const counts = ctx.counts ?? {};
    const health = ctx.health ?? 20;
    const maxHealth = ctx.maxHealth ?? 20;
    const dimension = ctx.dimension ?? "minecraft:overworld";
    const tick = ctx.tick ?? 0;
    const blockers = [];
    const plan = [];

    const inOverworld = dimension === "minecraft:overworld";
    const add = (id, need, why, severity) => blockers.push({ id, need, why, severity });

    if (ctx.allowNether === false) return { ready: false, score: 0, blockers: [{ id: "disabled", need: 0, why: "autonomous Nether travel is off", severity: 100 }], plan: [], reason: "autonomous Nether travel is off" };
    if (dimension === "minecraft:nether") return { ready: false, score: 0, blockers: [{ id: "already", need: 0, why: "already in the Nether", severity: 100 }], plan: [], reason: "already in the Nether" };
    if (!inOverworld) return { ready: false, score: 0, blockers: [{ id: "dimension", need: 0, why: `unsupported dimension ${dimension}`, severity: 100 }], plan: [], reason: "not in the Overworld" };
    if (ctx.travelActive) return { ready: false, score: 0, blockers: [{ id: "travelling", need: 0, why: "a trip is already running", severity: 100 }], plan: [], reason: "a trip is already running" };
    if (ctx.travelReadyAt && tick < ctx.travelReadyAt) {
        const left = Math.ceil((ctx.travelReadyAt - tick) / 20);
        add("cooldown", ctx.travelReadyAt - tick, `resting ${left}s between trips`, 40);
    }
    if (ctx.inLava || ctx.onFire) add("danger", 0, "standing in fire or lava", 100);
    if (ctx.inWater) add("danger", 0, "in water - swimming first", 90);
    if (ctx.falling) add("danger", 0, "mid-fall", 95);
    if ((ctx.hostiles ?? 0) > 0) add("combat", ctx.hostiles, `${ctx.hostiles} hostile(s) nearby`, 85);

    const hpRatio = maxHealth > 0 ? health / maxHealth : 1;
    if (health < EXPEDITION.minHealth || hpRatio < 0.65) add("health", Math.ceil(EXPEDITION.minHealth - health), `health ${Math.round(health)}/${Math.round(maxHealth)} is too low for a trip`, 80);

    const food = ctx.food ?? foodCount(counts);
    if (food < EXPEDITION.minFood) add("food", EXPEDITION.minFood - food, `only ${food} food items (need ${EXPEDITION.minFood})`, 70);

    const tier = ctx.pickaxeTier ?? pickaxeTier(counts);
    if (tier < EXPEDITION.minPickaxeTier) add("pickaxe", EXPEDITION.minPickaxeTier - tier, `pickaxe tier ${tier} is below stone`, 60);

    if (!hasIgnition(counts)) add("ignition", 1, "no flint and steel, fire charge, or flint + iron", 55);
    if (!hasObsidianPath(counts, ctx)) add("obsidian", EXPEDITION.minObsidian, "no obsidian, no bucket for obsidian, and no known portal", 50);

    // A provisional plan for whoever asks (chat, journals, status).
    if (blockers.some((b) => b.id === "health")) plan.push("heal and eat until healthy");
    if (blockers.some((b) => b.id === "food")) plan.push(`gather ${EXPEDITION.minFood} food`);
    if (blockers.some((b) => b.id === "pickaxe")) plan.push("craft a stone pickaxe");
    if (blockers.some((b) => b.id === "ignition")) plan.push("craft flint and steel (gravel -> flint, iron)");
    if (blockers.some((b) => b.id === "obsidian")) plan.push("get a bucket and water, or 10 obsidian, or find a portal");
    plan.push("travel to the Nether");

    blockers.sort((a, b) => b.severity - a.severity);
    // Any blocker means "not yet": they are ordered by severity, so the runtime
    // always works on the most dangerous one first.
    const ready = blockers.length === 0;
    const score = Math.max(0, Math.min(100, 100 - blockers.reduce((n, b) => n + b.severity, 0)));
    return {
        ready,
        score,
        blockers,
        plan,
        reason: ready ? "expedition ready" : `not ready: ${blockers.map((b) => b.why).join("; ")}`,
    };
}

/**
 * What to do about the most important blocker. The runtime performs the action;
 * this only says which one it is, so the decision stays testable.
 */
export function provisionStep(assessment) {
    const top = assessment?.blockers?.[0];
    if (!top) return undefined;
    switch (top.id) {
        case "health":
        case "food":
            return { action: "eat", why: top.why };
        case "pickaxe": {
            const tier = top.need >= 2 ? "wooden_pickaxe" : "stone_pickaxe";
            return { action: "craft", item: K(tier), why: top.why };
        }
        case "ignition":
            return { action: "craft", item: K("flint_and_steel"), why: top.why };
        case "obsidian":
            return { action: "bucket", item: K("bucket"), why: top.why };
        case "combat":
            return { action: "fight", why: top.why };
        case "cooldown":
        case "travelling":
        case "already":
        case "disabled":
        case "dimension":
            return { action: "wait", why: top.why };
        default:
            return { action: "wait", why: top.why };
    }
}
