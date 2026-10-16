// Break contact: get out of a fight that cannot be won right now.
//
// Retreat is a survival skill, not a combat one: it is allowed to spend blocks
// building cover, water to break a chase, and it always reports *where* it ran
// to so the bot can come back for the loot later.

import { defineSkill, done, failed, running } from "../contract.js";
import { boost } from "../util.js";
import { fleeDirection } from "../../core/parkour-plan.js";
import { coverCells, rankThreats, threatScore } from "./support.js";
import { COMPASS, distance } from "../../core/math.js";

export const retreatSkill = defineSkill({
    id: "combat.retreat",
    category: "combat",
    tags: ["flee", "escape", "disengage", "survive", "cover"],
    priority: 92,
    cost: 1,
    budget: 600,
    cooldown: 40,
    plan(ctx) {
        const threats = rankThreats(ctx.threats(ctx.settings?.threatRadius ?? 16));
        const dir = fleeDirection(ctx.read, floorSelf(ctx), threats, COMPASS);
        const cover = coverCells(ctx, { radius: 4 }).slice(0, 4);
        return { threats, dir, cover, score: threatScore(threats), blocks: ctx.bag.count("minecraft:cobblestone") };
    },
    requires(ctx) {
        return ctx.threats(ctx.settings?.threatRadius ?? 16).length > 0;
    },
    score(ctx) {
        const threats = ctx.threats(ctx.settings?.threatRadius ?? 16);
        if (threats.length === 0)
            return 0;
        const critical = ctx.self.hp <= (ctx.settings?.criticalHp ?? 6);
        const outnumbered = threats.length >= 3;
        if (!critical && !outnumbered && ctx.self.hp > 12)
            return boost(ctx, "combat.retreat");
        return 88 + boost(ctx, "combat.retreat");
    },
    run(ctx, run) {
        const threats = ctx.threats(ctx.settings?.threatRadius ?? 16);
        if (threats.length === 0)
            return done("out of danger");
        const nearest = threats[0];
        const gap = distance(ctx.self.pos, nearest.pos);
        if (gap > 20)
            return done(`broke contact (${Math.round(gap)} blocks clear)`);
        if ((ctx.self.hp ?? 20) > (ctx.settings?.criticalHp ?? 6) + 6 && threats.length === 1 && ctx.self.hunger > 6)
            return done(`no longer critical (${ctx.self.hp} hp)`);

        const dir = run.state.dir ?? run.plan.dir?.dir;
        const target = run.state.target;
        if (!target) {
            const choice = dir ? { dir, to: { x: floorSelf(ctx).x + dir.x * 6, y: floorSelf(ctx).y, z: floorSelf(ctx).z + dir.z * 6 } } : fleeDirection(ctx.read, floorSelf(ctx), threats, COMPASS);
            if (!choice)
                return failed("nowhere to flee");
            run.state.dir = choice.dir;
            run.state.target = choice.to;
        }
        const to = run.state.target;
        if (distance(ctx.self.pos, to) < 1.5) {
            run.state.target = undefined;
            return running("fleeing further");
        }
        const status = ctx.act.walkTo(to, { leash: 3, sprint: true });
        if (status === "blocked") {
            run.state.target = undefined;
            run.state.dir = undefined;
            return running("route blocked; looking for another way out");
        }
        run.steps++;
        return running(`fleeing ${short(nearest.typeId)} (${Math.round(gap)} blocks)`);
    },
    verify(ctx) {
        const threats = ctx.threats(6);
        return threats.length === 0 || ctx.self.hp > (ctx.settings?.criticalHp ?? 6);
    },
    start() { return {}; },
});

const floorSelf = (ctx) => ({ x: Math.floor(ctx.self.pos.x), y: Math.floor(ctx.self.pos.y), z: Math.floor(ctx.self.pos.z) });
const short = (id) => String(id ?? "").replace("minecraft:", "");
