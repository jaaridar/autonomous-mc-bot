// Fight a hostile mob: pick a tactic with core/combat.js, then execute it.
//
// The tactics (rush / kite / retreat / crit windows / strafe) already exist as
// pure functions; this skill is the part that was missing - a single place that
// owns one fight from "target chosen" to "target dead or disengaged", with a
// bounded budget and an honest report.

import { defineSkill, done, failed, running } from "../contract.js";
import { boost } from "../util.js";
import { chooseTactic, dodgePattern, endermanSafeLook, shouldRetreat, strafeDirection, THREAT_PROFILES } from "../../core/combat.js";
import { EXPOSIVE_SAFE_DISTANCE, isDangerous } from "./support.js";
import { distance } from "../../core/math.js";

export const meleeMobSkill = defineSkill({
    id: "combat.melee-mob",
    category: "combat",
    tags: ["fight", "kill", "mob", "zombie", "skeleton", "spider", "creeper"],
    priority: 70,
    cost: 1,
    budget: 1200,
    cooldown: 20,
    plan(ctx) {
        const threat = ctx.intent?.target ?? ctx.threats(ctx.settings?.threatRadius ?? 16)[0];
        if (!threat)
            return { threat: null };
        const tactic = chooseTactic(threat.typeId, {
            hp: ctx.self.hp,
            hunger: ctx.self.hunger,
            weapon: ctx.bag.best("weapon"),
            armor: ctx.armorPoints,
            blocks: ctx.bag.count("minecraft:cobblestone"),
            water: ctx.bag.has("minecraft:water_bucket"),
            distance: threat.distance,
        });
        return { threat, tactic, weapon: ctx.bag.best("weapon") };
    },
    requires(ctx) {
        return ctx.threats(ctx.settings?.threatRadius ?? 16).length > 0;
    },
    score(ctx) {
        const threats = ctx.threats(ctx.settings?.threatRadius ?? 16);
        if (threats.length === 0 || ctx.settings?.defend === false)
            return 0;
        const nearest = threats[0];
        const retaliation = ctx.intent?.target?.id === nearest.id ? 25 : 0;
        return 55 + threats.length * 4 + retaliation + boost(ctx, "combat.melee-mob");
    },
    run(ctx, run) {
        const target = run.state.target ?? run.plan.threat;
        if (!target)
            return done("no threat left");
        run.state.target = target;
        const live = ctx.nearestEntity({ id: target.id, maxDistance: 24 }) ?? ctx.threats(24).find((t) => t.id === target.id);
        if (!live)
            return done(`killed or lost ${short(target.typeId)}`);
        const distanceNow = distance(ctx.self.pos, live.pos);
        const profile = THREAT_PROFILES[live.typeId] ?? { kind: "melee" };

        // Retreat check every tick: health, hunger and count decide it.
        const others = ctx.threats(ctx.settings?.threatRadius ?? 16);
        const retreat = shouldRetreat(ctx.self.hp, ctx.threatScore ?? 0, others.length, !!run.plan.weapon, ctx.armorPoints, false, ctx.bag.has("minecraft:water_bucket"), others);
        if (retreat)
            return failed(`disengaging from ${short(live.typeId)} at ${ctx.self.hp} hp`);

        if (profile.kind === "explosive" || live.typeId === "minecraft:creeper") {
            if (distanceNow < profile.detonateRange ?? 4) {
                const dir = strafeDirection(ctx.self.pos, live.pos, run.state.left ?? true);
                run.state.left = !(run.state.left ?? true);
                ctx.act.walkTo({ x: ctx.self.pos.x + dir.x * 3, y: ctx.self.pos.y, z: ctx.self.pos.z + dir.z * 3 }, { leash: 0.5, sprint: true });
                return running(`backing off the creeper (${distanceNow.toFixed(1)} blocks)`);
            }
        }
        if (live.typeId === "minecraft:enderman") {
            ctx.act.lookAt(endermanSafeLook(live.pos));
        }
        else {
            ctx.act.lookAt({ x: live.pos.x, y: live.pos.y + 1.2, z: live.pos.z });
        }
        if (distanceNow > 2.6) {
            ctx.act.walkTo(live.pos, { leash: 0.6, sprint: true });
            return running(`closing on ${short(live.typeId)} (${distanceNow.toFixed(1)} blocks)`);
        }
        const dodge = dodgePattern(ctx.tick, live.typeId, ctx.self.pos, live.pos);
        if (dodge && run.steps % 6 === 0)
            ctx.act.walkTo({ x: ctx.self.pos.x + dodge.x, y: ctx.self.pos.y, z: ctx.self.pos.z + dodge.z }, { leash: 0.4 });
        const hit = ctx.act.attack(live);
        run.steps++;
        if (!hit)
            return running(`swing at ${short(live.typeId)} missed`);
        const hp = ctx.nearestEntity({ id: target.id, maxDistance: 24 })?.hp;
        if (hp !== undefined && hp <= 0)
            return done(`killed ${short(live.typeId)}`);
        return running(`hitting ${short(live.typeId)}${hp !== undefined ? ` (${Math.round(hp)} hp)` : ""}`);
    },
    verify(ctx, run) {
        return !ctx.nearestEntity({ id: run.plan.threat?.id, maxDistance: 24 });
    },
    start() { return {}; },
});

const short = (id) => String(id ?? "").replace("minecraft:", "");
export { EXPOSIVE_SAFE_DISTANCE, isDangerous };
