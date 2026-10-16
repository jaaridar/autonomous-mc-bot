// Get down safely: find the shallowest safe way down and take it.
//
// Falls are the most common way a survival bot dies while doing everything else
// right. This skill walks to the nearest ledge whose drop is survivable (or
// water/hay), and refuses drops that are not - the alternative is digging a
// staircase, which mining.staircase handles once this skill reports "no safe
// descent".

import { defineSkill, done, failed, running } from "../contract.js";
import { boost } from "../util.js";
import { dropDepth, isLiquid, standable } from "../../core/parkour-plan.js";
import { COMPASS, distance } from "../../core/math.js";

export const descendSkill = defineSkill({
    id: "parkour.descend",
    category: "parkour",
    tags: ["down", "fall", "safe", "cliff", "ravine"],
    priority: 60,
    cost: 2,
    budget: 600,
    cooldown: 80,
    plan(ctx) {
        const maxSafe = ctx.settings?.maxSafeFall ?? 3;
        const options = [];
        for (const dir of COMPASS) {
            for (let step = 1; step <= 3; step++) {
                const p = { x: Math.floor(ctx.self.pos.x) + dir.x * step, y: Math.floor(ctx.self.pos.y), z: Math.floor(ctx.self.pos.z) + dir.z * step };
                const { depth, landing } = dropDepth(ctx.read, p, 16);
                if (depth === 0 && standable(ctx.read, { x: p.x, y: p.y - 1, z: p.z }))
                    continue;
                const safe = depth <= maxSafe || isLiquid(landing) || /hay_block|slime_block|powder_snow|honey_block|_bed$|scaffolding|cobweb|sweet_berry_bush/.test(landing);
                if (!safe)
                    continue;
                options.push({ p, depth, landing, dir, score: depth * 1.5 - step });
            }
        }
        options.sort((a, b) => (b.score - a.score) || (a.p.x - b.p.x) || (a.p.z - b.p.z));
        return { options: options.slice(0, 6), maxSafe, target: options[0] ?? null };
    },
    requires(ctx) {
        return ctx.mission?.needDescend === true || ctx.self.overDrop === true;
    },
    score(ctx) {
        if (ctx.self.overDrop)
            return 60 + boost(ctx, "parkour.descend");
        return boost(ctx, "parkour.descend") * 0.6;
    },
    run(ctx, run) {
        const target = run.plan.target;
        if (!target)
            return failed("no safe descent within reach; dig a staircase instead");
        if (distance(ctx.self.pos, target.p) < 0.8 || ctx.self.onGround && Math.floor(ctx.self.pos.y) <= target.p.y - target.depth) {
            return done(`descended ${target.depth} block(s) onto ${short(target.landing)}`);
        }
        const status = ctx.act.walkTo({ x: target.p.x + 0.5, y: target.p.y, z: target.p.z + 0.5 }, { leash: 0.6 });
        if (status === "blocked")
            return failed("could not walk to the descent point");
        return running(`descending ${target.depth} block(s) onto ${short(target.landing)}`);
    },
    verify(ctx, plan) {
        return !plan.target || Math.floor(ctx.self.pos.y) <= plan.target.p.y;
    },
    start() { return {}; },
});

const short = (id) => String(id ?? "").replace("minecraft:", "");
