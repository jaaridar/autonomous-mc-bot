// Player-versus-player planning - pure tactics, no engine calls.
//
// Verdant's combat core (core/combat.js) handles mobs: rushers, creepers,
// skeletons at range. A *player* opponent is different in ways that matter:
// they keep distance on purpose, they punish a straight-line approach, they can
// pillar, they come back after dying, and they can be your own owner. So this
// module owns player-specific decisions:
//
//   - consent: the bot never raises a weapon at a player unless PvP is enabled
//     and the target is not the owner or an ally (owner-gating stays in runtime);
//   - tactic: rush / orbit / kite / tower / disengage / water, chosen from gear,
//     health, distance and how many opponents there are;
//   - execution detail: which way to strafe, when to jump for a crit, when to
//     sprint into the hit for knockback, and where to push the opponent;
//   - exit: a disengage plan the bot can actually follow (cover, water, blocks).
//
// Determinism: every random-looking choice (orbit flips) comes from a seeded Rng
// so a duel replays the same way twice. Tests assert tactic selection directly.

import { clamp, distance } from "./math.js";
import { weaponDamage, weaponTier, armorScore } from "./inventory-model.js";

/** Practical swing cadence. Bedrock has no Java-style attack cooldown, but an
 *  unbroken max-rate swing spam looks inhuman and wastes durability, so the bot
 *  swings on a fixed interval (tunable in one place). */
export const SWING_INTERVAL = 9;

/** Reach in blocks for a melee swing against a player. */
export const MELEE_REACH = 3.0;

export const TACTICS = {
    rush: { aggression: 1.0, keepDistance: 1.6 },
    orbit: { aggression: 0.9, keepDistance: 2.2 },
    kite: { aggression: 0.4, keepDistance: 6.0 },
    tower: { aggression: 0.7, keepDistance: 2.0 },
    disengage: { aggression: 0, keepDistance: 12.0 },
    water: { aggression: 0.2, keepDistance: 8.0 },
};

/**
 * Health/gear snapshot for one duel. Everything optional except hp and distance
 * keeps this usable from a skill that has only partial information.
 */
export function duelContext({
    hp = 20, hunger = 20, armor = 0, weapon, shield = false, bow = false, blocks = 0, water = false,
    targetHp = 20, targetArmor = 0, targetWeapon, targetBow = false, targetCount = 1, distance: dist = 4,
    sprint = true, hazardNearby = false, escapeRoute = false,
} = {}) {
    const myDamage = weaponDamage(weapon);
    const myTier = weaponTier(weapon);
    const theirDamage = weaponDamage(targetWeapon);
    const theirTier = weaponTier(targetWeapon);
    return {
        hp, hunger, armor, weapon, shield, bow, blocks, water,
        targetHp, targetArmor, targetWeapon, targetBow, targetCount, distance: dist,
        sprint, hazardNearby, escapeRoute,
        myDamage, myTier, theirDamage, theirTier,
        advantage: (myDamage + myTier * 0.5 + armor * 0.08) - (theirDamage + theirTier * 0.5 + targetArmor * 0.08),
    };
}

/**
 * Decide whether to engage and how. `enabled` is the runtime's PvP consent flag;
 * without it this returns a refusal, which is the safety default.
 */
export function chooseDuelTactic(ctx, { enabled = false, owner = false, ally = false, settings = {} } = {}) {
    if (owner)
        return { engage: false, tactic: "none", reason: "target is the owner" };
    if (ally)
        return { engage: false, tactic: "none", reason: "target is an ally" };
    if (!enabled)
        return { engage: false, tactic: "none", reason: "PvP is disabled (needs !bot config pvp on and an explicit target)" };
    if (ctx.hp <= (settings.retreatHp ?? 6))
        return { engage: false, tactic: "disengage", reason: `health ${ctx.hp} at or below retreat threshold` };
    if (ctx.hunger <= 6 && ctx.hp < 14)
        return { engage: false, tactic: "disengage", reason: "hungry and hurt - eat first" };

    const outnumbered = ctx.targetCount >= 2;
    const losingTrades = ctx.advantage < -1.5;
    const winningTrades = ctx.advantage > 1.5;

    if (outnumbered && ctx.blocks >= 8 && ctx.hp >= 12)
        return { engage: true, tactic: "tower", reason: `${ctx.targetCount} opponents: take the high ground` };
    if (ctx.hp <= 10 && !winningTrades)
        return { engage: false, tactic: "disengage", reason: "hurt and not winning the trade" };
    if (ctx.targetBow && ctx.distance > 5 && ctx.shield)
        return { engage: true, tactic: "rush", reason: "close under the shield against a bow" };
    if (ctx.bow && ctx.distance > 6 && !losingTrades)
        return { engage: true, tactic: "kite", reason: "hold range with the bow" };
    if (losingTrades && (ctx.escapeRoute || ctx.water))
        return { engage: false, tactic: ctx.water ? "water" : "disengage", reason: "gear disadvantage, leave" };
    if (winningTrades && ctx.distance <= 4)
        return { engage: true, tactic: "rush", reason: "gear advantage: press the attack" };
    if (ctx.hazardNearby && ctx.targetCount === 1)
        return { engage: true, tactic: "orbit", reason: "avoid the hazard, trade around it" };
    return { engage: true, tactic: "orbit", reason: "even fight: circle and strike" };
}

/**
 * Strafe direction with hysteresis: flips only when the current direction has
 * been held long enough, or when a wall/hazard is in the way.
 */
export function orbitStep(state, { rng, tick, blocked = false, hazard = false } = {}) {
    const held = tick - (state.since ?? tick);
    const mustFlip = blocked || hazard;
    const mayFlip = held > (state.holdFor ?? 20);
    const flip = mustFlip || (mayFlip && rng.next() < 0.35);
    if (flip) {
        state.direction = -(state.direction ?? 1);
        state.since = tick;
        state.holdFor = rng.int(12, 30);
    }
    state.direction = state.direction ?? 1;
    return {
        direction: state.direction,
        angle: state.direction > 0 ? 1 : -1,
        holdFor: state.holdFor,
        until: (state.since ?? tick) + (state.holdFor ?? 20),
    };
}

/** Aim point offset for a strafing hit: swings land more often when leading. */
export function strikeOffset(target, orbit, lead = 0.6) {
    const lateral = { x: -target.z, y: 0, z: target.x };
    return { x: lateral.x * orbit.angle * lead, y: 0, z: lateral.z * orbit.angle * lead };
}

/**
 * Jump-critical: land a hit while falling. True when the bot is airborne and
 * descending with the target in reach.
 */
export function shouldCritJump(state, ctx, { onGround, falling = false, inReach = true } = {}) {
    if (!inReach || !onGround)
        return false;
    if (ctx.distance > MELEE_REACH)
        return false;
    const last = state.lastCritJumpTick ?? -99;
    return state.tick - last >= 10 && ctx.hunger > 8;
}

/** Sprint into the hit for knockback: worth it near an edge or hazard. */
export function shouldSprintHit(ctx, { targetNearHazard = false, targetNearEdge = false } = {}) {
    if (!ctx.sprint)
        return false;
    if (ctx.distance > MELEE_REACH + 0.5)
        return false;
    return targetNearHazard || targetNearEdge;
}

/** Swing gate: don't machine-gun, and don't waste swings out of reach. */
export function shouldSwing(state, ctx, tick) {
    if (ctx.distance > MELEE_REACH)
        return false;
    return tick - (state.lastSwingTick ?? -99) >= SWING_INTERVAL;
}

/**
 * Where to push the opponent: the direction that moves them towards the nearest
 * hazard or ledge, so knockback and sprint-hits do real work. Returns a unit
 * direction from the target, or null.
 */
export function knockbackDirection(target, threats = []) {
    let best = null;
    for (const hazard of threats) {
        const d = distance(target, hazard);
        if (d > 8)
            continue;
        const dir = { x: Math.sign(target.x - hazard.x), y: 0, z: Math.sign(target.z - hazard.z) };
        if (dir.x === 0 && dir.z === 0)
            continue;
        const score = 1 / Math.max(0.5, d);
        if (!best || score > best.score)
            best = { dir: { x: -dir.x, y: 0, z: -dir.z }, score, at: hazard };
    }
    return best;
}

/**
 * Disengage plan: which way to run, what to drop behind, and whether water or
 * blocks are the better tool. Mirrors the mob escaper but keeps the *player*
 * case distinct (players chase, mobs mostly do not).
 */
export function disengagePlan(ctx, { terrain = {}, threats = [], dirs = [] } = {}) {
    const options = [];
    for (const dir of dirs) {
        const blocked = terrain.blocked?.[`${dir.x},${dir.z}`];
        if (blocked)
            continue;
        let score = 0;
        for (const threat of threats) {
            const before = distance(ctx.from ?? { x: 0, y: 0, z: 0 }, threat);
            const after = distance({ x: (ctx.from?.x ?? 0) + dir.x * 4, y: 0, z: (ctx.from?.z ?? 0) + dir.z * 4 }, threat);
            score += after - before;
        }
        if (terrain.open?.[`${dir.x},${dir.z}`])
            score += 2;
        options.push({ dir, score });
    }
    options.sort((a, b) => (b.score - a.score) || (a.dir.x - b.dir.x) || (a.dir.z - b.dir.z));
    const best = options[0] ?? null;
    const useWater = ctx.water && ctx.targetBow === false;
    return {
        dir: best?.dir ?? null,
        score: best?.score ?? 0,
        useWater,
        placeBlocks: ctx.blocks >= 4 && !useWater,
        shielding: !!ctx.shield,
        reason: best ? "open ground behind" : "no open direction found",
    };
}

/** Damage the bot should expect from one clean hit (for the retreat check). */
export function incomingDamage(ctx) {
    const reduction = clamp(ctx.armor * 0.04, 0, 0.8);
    return ctx.theirDamage * (1 - reduction);
}

/** Turns to survive at the current exchange rate, or Infinity when winning. */
export function survivableHits(ctx) {
    const dmg = incomingDamage(ctx);
    if (dmg <= 0)
        return Infinity;
    return Math.floor(ctx.hp / dmg);
}

/** Compact summary for chat/HUD. */
export function describeDuel(ctx, decision) {
    return `${decision.tactic} (${decision.reason}) hp ${ctx.hp}/${ctx.targetHp} dmg ${ctx.myDamage}v${ctx.theirDamage} armor ${ctx.armor}v${ctx.targetArmor}`;
}

export { armorScore, weaponDamage, weaponTier };
