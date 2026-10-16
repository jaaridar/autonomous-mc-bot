// Scout: walk the frontier looking for what the mission needs.
//
// Exploration is a resource strategy, not wandering: the skill picks a direction
// it has not swept recently, walks it while scanning for ores, structures, water,
// animals and hazards, and remembers the spots worth returning to. The direction
// choice is seeded, so a session's exploration is reproducible.

import { defineSkill, done, failed, running } from "../contract.js";
import { boost } from "../util.js";
import { COMPASS } from "../../core/math.js";

const SECTOR_TICKS = 2400; // how long one sweep direction holds

export const scoutSkill = defineSkill({
    id: "explore.scout",
    category: "explore",
    tags: ["explore", "scout", "search", "frontier", "structures", "village"],
    priority: 30,
    cost: 2,
    budget: 2400,
    cooldown: 100,
    plan(ctx) {
        const sector = ctx.memory?.read?.("sector") ?? 0;
        const dir = COMPASS[sector % COMPASS.length];
        const distance = ctx.settings?.scoutDistance ?? 48;
        const target = {
            x: Math.floor(ctx.self.pos.x + dir.x * distance),
            y: Math.floor(ctx.self.pos.y),
            z: Math.floor(ctx.self.pos.z + dir.z * distance),
        };
        return { dir, target, sector, radius: ctx.settings?.scoutRadius ?? 12, target64: ctx.mission?.travelTo ?? null };
    },
    requires(ctx) {
        return ctx.settings?.autoSurvival !== false;
    },
    score(ctx) {
        if (ctx.settings?.autoSurvival === false)
            return 0;
        if (ctx.bag.freeSlots <= 2)
            return 0; // inventory first
        return 20 + boost(ctx, "explore.scout");
    },
    run(ctx, run) {
        const goal = run.plan.target64 ?? run.plan.target;
        if (ctx.settings?.mode === "guard")
            return done("guard mode: holding position");
        if (!run.state.started) {
            run.state.started = ctx.tick;
            ctx.memory?.write?.("sector", (run.plan.sector + 1) % COMPASS.length, ctx.tick + SECTOR_TICKS);
            return running(`scouting ${dirName(run.plan.dir)} (${run.plan.radius} block sweep)`);
        }
        if (ctx.tick - run.state.started > SECTOR_TICKS)
            return done("sweep finished; turning the sector");
        if (ctx.threats(10).length > 0)
            return failed("interrupted by a hostile");
        const status = ctx.act.walkTo(goal, { leash: 4, sprint: true });
        if (status === "blocked") {
            // Blocked frontier: rotate to the next sector rather than grinding.
            ctx.memory?.write?.("sector", (run.plan.sector + 1) % COMPASS.length, ctx.tick);
            return failed(`scouting route blocked heading ${dirName(run.plan.dir)}`);
        }
        // Report what the sweep noticed (the runtime already recorded the spots).
        if (run.steps % 200 === 0)
            return running(`scouting ${dirName(run.plan.dir)}: ${ctx.summariseSweep?.() ?? "scanning"}`);
        return running(`scouting ${dirName(run.plan.dir)}`, { progress: (ctx.tick - run.state.started) / SECTOR_TICKS });
    },
    verify() {
        return true;
    },
    start() { return { started: undefined }; },
});

function dirName(dir) {
    if (dir.x > 0 && dir.z === 0) return "east";
    if (dir.x < 0 && dir.z === 0) return "west";
    if (dir.z > 0 && dir.x === 0) return "south";
    if (dir.z < 0 && dir.x === 0) return "north";
    return `${dir.x},${dir.z}`;
}
