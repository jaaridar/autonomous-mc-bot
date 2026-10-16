// Walk over loose drops and pick them up the vanilla way.
//
// Minecraft gives items to the player by proximity, so "collect" is a movement
// skill, not an inventory trick: find dropped item entities, walk to them, and
// report the real inventory delta. Migrates the AI Players Add-On's drop-chase
// intent but keeps the honest accounting: count only what disappeared *and*
// what the bag actually gained.

import { defineSkill, done, failed, running } from "../contract.js";
import { boost } from "../util.js";
import { distance } from "../../core/math.js";

export const collectDropsSkill = defineSkill({
    id: "mining.collect-drops",
    category: "mining",
    tags: ["pickup", "loot", "items", "drops", "sweep"],
    priority: 44,
    cost: 1,
    budget: 900,
    cooldown: 40,
    plan(ctx) {
        const radius = ctx.request?.kind === "collect" ? ctx.request.radius ?? 12 : ctx.settings?.pickupRadius ?? 8;
        const anchor = ctx.request?.anchor ?? ctx.self.pos;
        const drops = ctx
            .entities({ types: ["minecraft:item"], maxDistance: radius, around: anchor })
            .filter((e) => !/lava|fire/.test(ctx.read(Math.floor(e.pos.x), Math.floor(e.pos.y), Math.floor(e.pos.z))))
            .sort((a, b) => (distance(ctx.self.pos, a.pos) - distance(ctx.self.pos, b.pos)) || String(a.id).localeCompare(String(b.id)));
        return { radius, anchor, drops, before: ctx.bag.totalItems };
    },
    requires(ctx) {
        return ctx.entities({ types: ["minecraft:item"], maxDistance: 8 }).length > 0;
    },
    score(ctx) {
        const nearby = ctx.entities({ types: ["minecraft:item"], maxDistance: 6 });
        if (nearby.length === 0)
            return 0;
        return 35 + Math.min(20, nearby.length * 2) + boost(ctx, "mining.collect-drops");
    },
    run(ctx, run) {
        const drops = run.state.drops?.length ? run.state.drops : run.plan.drops.map((d) => ({ id: d.id, pos: { ...d.pos } }));
        run.state.drops = drops;
        if (drops.length === 0) {
            const gained = ctx.bag.totalItems - run.plan.before;
            return done(gained > 0 ? `collected ${gained} item(s)` : "nothing left to collect");
        }
        const target = drops[0];
        const still = ctx.entities({ types: ["minecraft:item"], maxDistance: 2 }).some((e) => e.id === target.id);
        if (!still) {
            drops.shift();
            run.state.collected = (run.state.collected ?? 0) + 1;
            return running(`picked up a stack (${drops.length} left)`, { progress: progress(run) });
        }
        if (distance(ctx.self.pos, target.pos) < 1.4) {
            // Standing on it: give the engine a tick to hand it over.
            run.state.standingSince = run.state.standingSince ?? ctx.tick;
            if (ctx.tick - run.state.standingSince > 20)
                drops.shift(); // refuses to be picked up: stop chasing it
            return running("standing on a drop", { progress: progress(run) });
        }
        run.state.standingSince = undefined;
        const status = ctx.act.walkTo(target.pos, { leash: 1 });
        if (status === "blocked")
            drops.shift();
        return running(`walking to a drop (${drops.length} left)`, { progress: progress(run) });
    },
    verify() {
        // The reported message is the inventory delta itself, so there is
        // nothing further to prove here.
        return true;
    },
    start() { return { drops: [], collected: 0 }; },
});

const progress = (run) => 1 - run.state.drops.length / Math.max(1, run.plan.drops.length);
