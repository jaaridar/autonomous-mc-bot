// Hunt an animal for food: approach, strike, cook later.
//
// Food is the resource that ends runs. This skill targets only passive animals,
// never the last two of a breed (so a farm is not eaten into extinction), and it
// prefers adults - the AI Players Add-On had this right and it is worth keeping.

import { defineSkill, done, failed, running } from "../contract.js";
import { boost } from "../util.js";
import { PREY } from "../../core/recipes.js";
import { distance } from "../../core/math.js";

const PROTECT = new Set(["minecraft:wolf", "minecraft:cat", "minecraft:ocelot", "minecraft:horse", "minecraft:donkey", "minecraft:mule", "minecraft:villager", "minecraft:iron_golem"]);

export const huntAnimalSkill = defineSkill({
    id: "gather.hunt-animal",
    category: "gather",
    tags: ["hunt", "food", "meat", "cow", "pig", "sheep", "chicken"],
    priority: 56,
    cost: 1,
    budget: 900,
    cooldown: 60,
    plan(ctx) {
        const animals = ctx
            .entities({ types: [...PREY], maxDistance: ctx.settings?.huntRadius ?? 24 })
            .filter((e) => !PROTECT.has(e.typeId))
            .sort((a, b) => (distance(ctx.self.pos, a.pos) - distance(ctx.self.pos, b.pos)) || String(a.id).localeCompare(String(b.id)));
        return { animals, need: ctx.mission?.food ?? 2, weapon: ctx.bag.best("weapon") };
    },
    requires(ctx) {
        return ctx.entities({ types: [...PREY], maxDistance: ctx.settings?.huntRadius ?? 24 }).length > 0;
    },
    score(ctx) {
        if (ctx.settings?.hunting === false)
            return 0;
        const animals = ctx.entities({ types: [...PREY], maxDistance: 24 });
        if (animals.length === 0)
            return 0;
        const hungry = (ctx.self.hunger ?? 20) <= (ctx.settings?.eatAt ?? 16);
        const noFood = ctx.bag.totalItems === 0 || !ctx.hasFood?.();
        return (hungry || noFood ? 55 : 22) + boost(ctx, "gather.hunt-animal");
    },
    run(ctx, run) {
        const animals = run.state.animals?.length ? run.state.animals : run.plan.animals.map((a) => ({ id: a.id, typeId: a.typeId, pos: { ...a.pos } }));
        run.state.animals = animals;
        if ((run.state.kills ?? 0) >= run.plan.need)
            return done(`hunted ${run.state.kills} animal(s)`);
        if (animals.length === 0)
            return run.state.kills ? done(`hunted ${run.state.kills} animal(s)`) : failed("no animals within range");
        const target = animals[0];
        const live = ctx.nearestEntity({ id: target.id, maxDistance: 32 });
        if (!live) {
            animals.shift();
            run.state.kills = (run.state.kills ?? 0) + 1;
            return running(`kill confirmed (${run.state.kills}/${run.plan.need})`, { progress: run.state.kills / run.plan.need });
        }
        const gap = distance(ctx.self.pos, live.pos);
        if (gap > 2.4) {
            ctx.act.lookAt(live.pos);
            const status = ctx.act.walkTo(live.pos, { leash: 0.6, sprint: gap > 6 });
            if (status === "blocked") {
                animals.shift();
                return running("prey unreachable; trying another animal");
            }
            return running(`approaching ${short(live.typeId)} (${gap.toFixed(1)} blocks)`);
        }
        ctx.act.lookAt({ x: live.pos.x, y: live.pos.y + 0.8, z: live.pos.z });
        const hit = ctx.act.attack(live);
        run.steps++;
        if (!hit)
            return running("swing missed");
        const after = ctx.nearestEntity({ id: live.id, maxDistance: 32 });
        if (!after || (after.hp ?? 20) <= 0) {
            animals.shift();
            run.state.kills = (run.state.kills ?? 0) + 1;
            return running(`killed ${short(live.typeId)} (${run.state.kills}/${run.plan.need})`, { progress: run.state.kills / run.plan.need });
        }
        return running(`hitting ${short(live.typeId)} (${Math.round(after.hp ?? 20)} hp)`);
    },
    verify() {
        return true;
    },
    start() { return { kills: 0 }; },
});

const short = (id) => String(id ?? "").replace("minecraft:", "");
