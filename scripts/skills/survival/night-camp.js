// Survive the night: bed first, otherwise a sealed 1x2 niche with a way out.
//
// Migrated behaviour from Verdant's camp routine plus the AI Players Add-On's
// "dig into a hillside" idea, with two rules kept intact: never dig next to
// liquid, and only seal the entrance with a block the bot can definitely dig
// back out - otherwise leave the wall open and keep watch.

import { defineSkill, done, failed, running } from "../contract.js";
import { boost, hazardAround } from "../util.js";
import { COMPASS } from "../../core/math.js";
import { REOPENABLE } from "./support.js";

export const nightCampSkill = defineSkill({
    id: "survival.night-camp",
    category: "survival",
    tags: ["night", "shelter", "camp", "sleep", "bed", "safe"],
    priority: 72,
    cost: 2,
    budget: 1400,
    cooldown: 200,
    plan(ctx) {
        const seconds = ctx.time?.ofDay ?? 0;
        return {
            night: seconds >= (ctx.settings?.nightStart ?? 13000) && seconds < 23000,
            bed: ctx.bag.has("minecraft:bed") ? "minecraft:bed" : undefined,
            hasFood: ctx.bag.totalItems > 0,
        };
    },
    requires(ctx) {
        return ctx.settings?.camp !== false;
    },
    score(ctx) {
        const night = isNight(ctx);
        if (!night)
            return boost(ctx, "survival.night-camp") * 0.3;
        if (ctx.threats(12).length > 0)
            return 0; // deal with the threat first, then camp
        return 58 + boost(ctx, "survival.night-camp");
    },
    run(ctx, run) {
        if (!isNight(ctx))
            return done("daylight is back");
        if (ctx.threats(12).length > 0)
            return failed("a hostile found the camp", { recovery: "retry" });
        const stage = run.state.stage ?? "seek";
        run.state.stage = stage;

        if (stage === "seek") {
            const site = run.state.site ?? findDigSite(ctx, run);
            if (ctx.bag.has("minecraft:bed")) {
                const placed = ctx.act.place(floorSelf(ctx), { item: "minecraft:bed" });
                if (placed) {
                    run.state.stage = "sleep";
                    return running("bed placed; sleeping the night away");
                }
            }
            if (!site)
                return run.state.dug ? running("watching the night from the niche") : running("looking for a hillside to dig into");
            run.state.site = site;
            if (!inReach(ctx, site.entry)) {
                const status = ctx.act.walkTo(site.entry, { leash: 0.8 });
                if (status === "blocked")
                    return failed("cannot reach the dig site");
                return running("walking to a hillside");
            }
            run.state.stage = "dig";
            return running("digging a niche");
        }

        if (stage === "dig") {
            const site = run.state.site;
            for (const cell of site.cells) {
                const id = ctx.read(cell.x, cell.y, cell.z);
                if (id === "minecraft:air")
                    continue;
                const hazard = hazardAround(ctx, cell);
                if (hazard.dangerous)
                    return failed(`refused to dig beside ${short(hazard.id)}`);
                const verdict = ctx.act.dig(cell, {});
                if (verdict === "blocked")
                    return failed(`cannot dig into ${short(id)}`);
                if (verdict !== "broken")
                    return running(`digging the niche (${short(id)})`);
                return running("niche progressing");
            }
            run.state.stage = "seal";
            return running("niche dug");
        }

        if (stage === "seal") {
            const site = run.state.site;
            const block = ctx.bag.counts()["minecraft:cobblestone"] ? "minecraft:cobblestone" : undefined;
            const seal = block && REOPENABLE.test(block);
            if (seal && ctx.act.place(site.seal, { item: block })) {
                run.state.stage = "wait";
                return running("sealed in for the night");
            }
            run.state.stage = "wait";
            return running("camping with the entrance left open (nothing safe to seal with)");
        }

        if (stage === "wait") {
            if (!isNight(ctx) || ctx.threats(6).length > 0)
                return running("breaking camp");
            return running(`waiting out the night (${nightRemaining(ctx)} ticks)`);
        }

        if (stage === "sleep") {
            if (!isNight(ctx))
                return done("slept through the night");
            ctx.act.sleep();
            run.steps++;
            if (!ctx.self.sleeping && run.steps > 60)
                return failed("the bed was refused (mobs nearby or not night)", { recovery: "retry" });
            return running("sleeping");
        }
        return failed(`unknown camp stage '${stage}'`);
    },
    verify(ctx) {
        return !isNight(ctx) || (ctx.self.sleeping === true) || ctx.threats(6).length === 0;
    },
    start() { return { stage: "seek" }; },
});

/** Find a wall to dig into: two solid blocks deep, no liquid in reach. */
function findDigSite(ctx, run) {
    const here = floorSelf(ctx);
    for (const dir of COMPASS) {
        for (let step = 1; step <= 3; step++) {
            const entry = { x: here.x + dir.x * step, y: here.y, z: here.z + dir.z * step };
            if (ctx.read(entry.x, entry.y, entry.z) === "minecraft:air")
                continue;
            const cells = [
                { x: entry.x, y: entry.y, z: entry.z },
                { x: entry.x, y: entry.y + 1, z: entry.z },
                { x: entry.x + dir.x, y: entry.y, z: entry.z + dir.z },
                { x: entry.x + dir.x, y: entry.y + 1, z: entry.z + dir.z },
            ];
            if (cells.some((c) => hazardAround(ctx, c).dangerous))
                continue;
            return { entry, cells, seal: { x: entry.x, y: entry.y, z: entry.z } };
        }
    }
    return null;
}

function isNight(ctx) {
    const t = ctx.time?.ofDay ?? 0;
    return t >= (ctx.settings?.nightStart ?? 13000) && t < (ctx.settings?.nightEnd ?? 23000);
}
function nightRemaining(ctx) {
    const t = ctx.time?.ofDay ?? 0;
    return t < 23000 ? 23000 - t : 0;
}
const floorSelf = (ctx) => ({ x: Math.floor(ctx.self.pos.x), y: Math.floor(ctx.self.pos.y), z: Math.floor(ctx.self.pos.z) });
const inReach = (ctx, cell) => Math.hypot(ctx.self.pos.x - cell.x, ctx.self.pos.y - cell.y, ctx.self.pos.z - cell.z) <= 4.5;
const short = (id) => String(id ?? "").replace("minecraft:", "");
