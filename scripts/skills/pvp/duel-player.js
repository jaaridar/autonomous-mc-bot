// Fight a *player* - consent-gated, tactic-driven, and reversible.
//
// Differences from fighting mobs that shape this skill: players keep distance,
// they punish a straight approach, they can pillar and they may be your friend.
// So: the skill refuses to run at all unless PvP is explicitly enabled, never
// targets the owner or an ally, and always keeps a disengage path.
//
// Planning is pure (core/pvp-plan.js): tactic choice, orbit direction, crit and
// sprint-hit timing all come from there, seeded from the session RNG so a duel
// replays the same way.

import { defineSkill, blocked, done, failed, running } from "../contract.js";
import { boost } from "../util.js";
import { chooseDuelTactic, duelContext, orbitStep, shouldCritJump, shouldSprintHit, shouldSwing, strikeOffset, TACTICS } from "../../core/pvp-plan.js";
import { distance } from "../../core/math.js";

export const duelPlayerSkill = defineSkill({
    id: "pvp.duel-player",
    category: "pvp",
    tags: ["pvp", "player", "duel", "fight", "combat"],
    priority: 75,
    cost: 1,
    budget: 1600,
    cooldown: 100,
    plan(ctx) {
        const target = ctx.pvpTarget?.();
        if (!target)
            return { target: null };
        const duel = duelContext({
            hp: ctx.self.hp,
            hunger: ctx.self.hunger,
            armor: ctx.armorPoints,
            weapon: ctx.bag.best("weapon"),
            shield: ctx.bag.has("minecraft:shield"),
            bow: ctx.bag.has("minecraft:bow"),
            blocks: ctx.bag.count("minecraft:cobblestone"),
            water: ctx.bag.has("minecraft:water_bucket"),
            targetHp: target.hp ?? 20,
            targetArmor: target.armor ?? 0,
            targetWeapon: target.weapon,
            targetBow: target.bow === true,
            targetCount: ctx.pvpTargets?.().length ?? 1,
            distance: distance(ctx.self.pos, target.pos),
            hazardNearby: ctx.hazardNearby?.() === true,
            escapeRoute: ctx.escapeRoute?.() === true,
        });
        const decision = chooseDuelTactic(duel, { enabled: ctx.settings?.pvp === true, owner: false, ally: false, settings: ctx.settings });
        return { target, duel, decision };
    },
    requires(ctx) {
        return ctx.settings?.pvp === true && !!ctx.pvpTarget?.();
    },
    score(ctx) {
        if (ctx.settings?.pvp !== true)
            return 0;
        const target = ctx.pvpTarget?.();
        if (!target)
            return 0;
        return 65 + boost(ctx, "pvp.duel-player");
    },
    run(ctx, run) {
        const target = run.state.target ?? run.plan.target;
        const live = ctx.nearestEntity({ id: target?.id, maxDistance: 32 });
        if (!live)
            return done("target is gone");
        const decision = run.plan.decision;
        if (!decision.engage) {
            const remedy = decision.tactic === "disengage" || decision.tactic === "water";
            if (remedy)
                return failed(`${decision.reason}`, { next: "pvp.disengage-player" });
            return blocked(decision.reason);
        }
        const duel = duelContext({
            hp: ctx.self.hp,
            armor: ctx.armorPoints,
            weapon: ctx.bag.best("weapon"),
            shield: ctx.bag.has("minecraft:shield"),
            blocks: ctx.bag.count("minecraft:cobblestone"),
            targetHp: live.hp ?? 20,
            targetArmor: live.armor ?? 0,
            targetWeapon: live.weapon,
            targetBow: live.bow === true,
            distance: distance(ctx.self.pos, live.pos),
        });
        const gap = duel.distance;

        // Disengage the moment the exchange turns (health, not pride, decides).
        if (ctx.self.hp <= (ctx.settings?.retreatHp ?? 6) || ctx.self.hunger <= 6)
            return failed("breaking off: health or food too low", { next: "pvp.disengage-player" });

        const orbit = orbitStep(run.state.orbit ??= {}, { rng: ctx.rng, tick: ctx.tick, hazard: ctx.hazardNearby?.() === true });

        if (decision.tactic === "tower" && ctx.bag.count("minecraft:cobblestone") >= 4) {
            ctx.act.place({ x: Math.floor(ctx.self.pos.x), y: Math.floor(ctx.self.pos.y) - 1, z: Math.floor(ctx.self.pos.z) }, { item: "minecraft:cobblestone" });
            ctx.act.jump();
            return running("towering for the height advantage");
        }
        if (decision.tactic === "kite" && ctx.bag.has("minecraft:bow")) {
            if (gap < 5) {
                ctx.act.walkTo(away(ctx.self.pos, live.pos, 3), { leash: 0.5, sprint: true });
                return running("making room to shoot");
            }
            ctx.act.lookAt({ x: live.pos.x, y: live.pos.y + 1.2, z: live.pos.z });
            ctx.act.use("minecraft:bow");
            return running(`shooting from ${gap.toFixed(1)} blocks`);
        }
        const keep = TACTICS[decision.tactic]?.keepDistance ?? 2.2;
        if (gap > keep + 0.6) {
            ctx.act.lookAt({ x: live.pos.x, y: live.pos.y + 1.0, z: live.pos.z });
            ctx.act.walkTo(live.pos, { leash: 0.5, sprint: decision.tactic === "rush" });
            return running(`closing on the player (${gap.toFixed(1)} blocks)`);
        }
        // In range: orbit, crit, sprint-hit.
        const offset = strikeOffset(live.pos, orbit);
        const aim = { x: live.pos.x + offset.x, y: live.pos.y + 1.1, z: live.pos.z + offset.z };
        if (circularStep(ctx, live, orbit, run))
            return running("circling the target");
        if (shouldCritJump(run.state, duel, { onGround: ctx.self.onGround, inReach: gap <= 3 })) {
            ctx.act.jump();
            run.state.lastCritJumpTick = ctx.tick;
        }
        if (!shouldSwing(run.state, duel, ctx.tick))
            return running("waiting for a clean swing");
        ctx.act.lookAt(aim);
        const hit = ctx.act.attack(live);
        run.state.lastSwingTick = ctx.tick;
        if (!hit)
            return running("swing missed");
        const now = ctx.nearestEntity({ id: live.id, maxDistance: 32 });
        if (!now)
            return done("opponent is down");
        return running(`hit the player (${Math.round(now.hp ?? 20)} hp left)`);
    },
    verify(ctx, plan) {
        if (!plan.target)
            return true;
        return !ctx.nearestEntity({ id: plan.target.id, maxDistance: 32 });
    },
    abort(ctx, state, reason) {
        ctx.act.stop();
        ctx.log?.(`pvp duel aborted: ${reason}`);
    },
    start() { return { orbit: {}, lastSwingTick: -99, lastCritJumpTick: -99 }; },
});

/** Move one small step along the orbit circle around the target. */
function circularStep(ctx, live, orbit, run) {
    if (run.steps % 4 !== 0)
        return false;
    const lateral = { x: -Math.sign(live.pos.z - ctx.self.pos.z) || 0, z: Math.sign(live.pos.x - ctx.self.pos.x) || 0 };
    const step = { x: ctx.self.pos.x + lateral.x * orbit.angle, y: ctx.self.pos.y, z: ctx.self.pos.z + lateral.z * orbit.angle };
    ctx.act.walkTo(step, { leash: 0.3 });
    return true;
}

const away = (from, to, scale) => {
    const dx = from.x - to.x;
    const dz = from.z - to.z;
    const len = Math.hypot(dx, dz) || 1;
    return { x: from.x + (dx / len) * scale, y: from.y, z: from.z + (dz / len) * scale };
};
