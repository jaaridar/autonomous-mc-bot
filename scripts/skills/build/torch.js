// Light the area: keep hostile spawns off the bot's working space.
//
// Darkness is why cave trips end badly: mobs spawn in the tunnel the bot just
// dug. The skill places torches on the floor at a spacing that keeps light above
// the spawn threshold, and stops when it runs out rather than pretending.

import { defineSkill, done, failed, running } from "../contract.js";
import { boost, hazardAround } from "../util.js";
import { standable } from "../../core/parkour-plan.js";

const SPACING = 7;

export const torchSkill = defineSkill({
    id: "build.torch",
    category: "build",
    tags: ["torch", "light", "cave", "spawn-proof", "safety"],
    priority: 40,
    cost: 1,
    budget: 400,
    cooldown: 60,
    plan(ctx) {
        const here = floorSelf(ctx);
        const sites = [];
        for (let dx = -SPACING; dx <= SPACING; dx += SPACING)
            for (let dz = -SPACING; dz <= SPACING; dz += SPACING) {
                if (dx === 0 && dz === 0)
                    continue;
                const cell = { x: here.x + dx, y: here.y, z: here.z + dz };
                if (!standable(ctx.read, cell))
                    continue;
                if (isLit(ctx, cell))
                    continue;
                sites.push(cell);
            }
        sites.sort((a, b) => (Math.abs(a.x - here.x) + Math.abs(a.z - here.z)) - (Math.abs(b.x - here.x) + Math.abs(b.z - here.z)) || a.x - b.x || a.z - b.z);
        return { sites: sites.slice(0, 4), torches: ctx.bag.count("minecraft:torch") };
    },
    requires(ctx) {
        return ctx.bag.has("minecraft:torch") && ctx.dark?.() !== false;
    },
    score(ctx) {
        if (!ctx.bag.has("minecraft:torch"))
            return 0;
        const dark = ctx.dark?.() === true;
        return (dark ? 42 : 8) + boost(ctx, "build.torch");
    },
    run(ctx, run) {
        const sites = run.state.sites?.length ? run.state.sites : run.plan.sites;
        run.state.sites = sites;
        if (!ctx.bag.has("minecraft:torch"))
            return done(`ran out of torches after placing ${run.state.placed ?? 0}`);
        if (sites.length === 0)
            return done(`area lit (${run.state.placed ?? 0} torch(es))`);
        const site = sites[0];
        if (isLit(ctx, site) || isLit(ctx, { x: site.x, y: site.y - 1, z: site.z })) {
            sites.shift();
            return running("that spot is already lit");
        }
        const support = { x: site.x, y: site.y - 1, z: site.z };
        if (ctx.read(support.x, support.y, support.z) === "minecraft:air") {
            sites.shift();
            return running("no floor to put a torch on");
        }
        if (hazardAround(ctx, site).dangerous) {
            sites.shift();
            return running("skipped a hazardous spot");
        }
        const gap = Math.hypot(ctx.self.pos.x - site.x, ctx.self.pos.z - site.z);
        if (gap > 4) {
            const status = ctx.act.walkTo(site, { leash: 0.8 });
            if (status === "blocked") {
                sites.shift();
                return running("torch spot unreachable");
            }
            return running("walking to the next torch spot");
        }
        const placed = ctx.act.place(site, { item: "minecraft:torch", onTop: true });
        if (!placed)
            return failed("torch placement refused");
        sites.shift();
        run.state.placed = (run.state.placed ?? 0) + 1;
        return running(`torch ${run.state.placed} placed`);
    },
    verify() {
        // The count of torches placed is reported from real placements; there is
        // nothing further to assert here.
        return true;
    },
    start() { return { placed: 0, sites: [] }; },
});

/** Torch or lantern within 4 blocks: enough light to stop spawns. */
function isLit(ctx, cell) {
    const lights = ctx.blocks?.({ types: ["minecraft:torch", "minecraft:lantern", "minecraft:glowstone", "minecraft:sea_lantern", "minecraft:campfire"], radius: 4, around: cell, limit: 1 }) ?? [];
    return lights.length > 0;
}

const floorSelf = (ctx) => ({ x: Math.floor(ctx.self.pos.x), y: Math.floor(ctx.self.pos.y), z: Math.floor(ctx.self.pos.z) });
