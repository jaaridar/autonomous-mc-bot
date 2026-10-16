// Go somewhere: navigation + parkour primitives, verified by arrival.
//
// This is the skill behind "!bot goto", follow-the-owner, going home and every
// other travel need. It asks core/navigation.js where to go (A* with parkour
// edges) and core/parkour-plan.js how to move, then executes one step per tick
// through ctx.act. Because the plan is a pure function of the world read, a
// blocked route is detected *before* the bot walks into it.

import { defineSkill, blocked, done, failed, running } from "../contract.js";
import { boost, hazardAround } from "../util.js";
import { planPath, primitiveFor } from "../../core/parkour-plan.js";
import { distance, key } from "../../core/math.js";

export const reachSkill = defineSkill({
    id: "parkour.reach",
    category: "parkour",
    tags: ["goto", "travel", "walk", "navigate", "follow"],
    priority: 55,
    cost: 2,
    budget: 3000,
    cooldown: 30,
    plan(ctx) {
        const goal = destination(ctx);
        if (!goal)
            return { goal: null, reason: "no destination" };
        const path = ctx.nav.pathTo(goal, { radius: ctx.settings?.navRadius ?? 48, parkour: ctx.settings?.parkour !== false });
        if (!path || path.length === 0)
            return { goal, path: null, reason: "no route" };
        const blocks = countBlocks(ctx);
        const plan = planPath(ctx.read, path, { blocks, sprint: true });
        return { goal, path, plan };
    },
    requires(ctx) {
        return !!destination(ctx);
    },
    score(ctx) {
        const goal = destination(ctx);
        if (!goal)
            return 0;
        const d = distance(ctx.self.pos, goal);
        if (d < 1.5)
            return 0;
        return 30 + Math.min(40, d / 4) + boost(ctx, "parkour.reach");
    },
    run(ctx, run) {
        if (!run.plan.goal)
            return blocked("no destination set");
        if (!run.plan.path)
            return failed(run.plan.reason === "no route" ? `no route to ${fmt(run.plan.goal)}` : String(run.plan.reason));
        const goal = run.plan.goal;
        if (distance(ctx.self.pos, goal) <= 1.6)
            return done(`arrived at ${fmt(goal)}`);

        // Re-plan when the world changed under us (someone placed a block, we
        // were knocked back) or every ~80 ticks on long trips.
        const stalePlan = ctx.tick - (run.state.plannedAt ?? 0) > 80;
        if (!run.state.path || stalePlan) {
            const path = ctx.nav.pathTo(goal, { radius: ctx.settings?.navRadius ?? 48, parkour: ctx.settings?.parkour !== false });
            if (!path || path.length < 2)
                return failed(`no route from ${fmt(ctx.self.pos)} to ${fmt(goal)}`);
            run.state.path = path;
            run.state.plannedAt = ctx.tick;
            run.state.index = 1;
            const plan = planPath(ctx.read, path, { blocks: countBlocks(ctx), sprint: true });
            run.state.plan = plan;
            if (!plan.ok)
                return failed(`route needs ${plan.reason}`);
        }

        const plan = run.state.plan;
        const path = run.state.path;
        const index = Math.max(1, Math.min(run.state.index ?? 1, path.length - 1));
        const next = path[index];
        if (!next)
            return done(`path exhausted ${fmt(ctx.self.pos)}`);
        const move = primitiveFor(ctx.read, path[index - 1] ?? floorSelf(ctx), next);

        // Out-of-reach waypoint: keep walking to the next cell in the path.
        if (distance(ctx.self.pos, next) > 8) {
            run.state.index = Math.max(1, index - 3);
            return running(`route jumped ${Math.round(distance(ctx.self.pos, next))} blocks; re-anchoring`);
        }

        if (move.kind === "nope")
            return failed(`cannot ${describe(move)} at ${fmt(next)}: ${move.reason ?? "unsafe"}`);

        switch (move.kind) {
            case "bridge":
            case "pillar": {
                if (countBlocks(ctx) <= 0)
                    return failed("need building blocks to bridge or pillar");
                const placed = ctx.act.place({ x: next.x, y: next.y - 1, z: next.z }, { item: bagBlock(ctx) });
                if (!placed)
                    return running(`placing a block at ${fmt(next)}`);
                run.state.index = index + 1;
                return running(`bridging (${path.length - index} steps left)`);
            }
            case "dig": {
                const verdict = ctx.act.dig(next, { tool: run.plan.tool });
                if (verdict === "blocked")
                    return failed(`cannot dig through ${String(move.blockedBy ?? "block").replace("minecraft:", "")}`);
                if (verdict === "broken") {
                    run.state.index = index + 1;
                    return running("tunnelling");
                }
                return running("digging through");
            }
            default: {
                const status = ctx.act.walkTo(next, { leash: 0.8, sprint: move.kind === "sprint-jump" });
                if (status === "blocked") {
                    run.state.path = null; // force a re-plan next tick
                    run.state.attempts = (run.state.attempts ?? 0) + 1;
                    if (run.state.attempts > 6)
                        return failed(`stuck walking to ${fmt(next)}`);
                    return running("blocked; re-planning");
                }
                if (status === "arrived" || distance(ctx.self.pos, next) < 1.2) {
                    run.state.index = index + 1;
                    run.state.attempts = 0;
                    return running(`moving (${path.length - index} steps left)`, { progress: 1 - index / path.length });
                }
                return running(`walking: ${move.kind}`, { progress: 1 - index / path.length });
            }
        }
    },
    verify(ctx, plan) {
        if (!plan.goal)
            return false;
        return distance(ctx.self.pos, plan.goal) <= 3;
    },
    start() { return { index: 1 }; },
});

/** Where the bot is currently trying to be: owner request, mission or home. */
export function destination(ctx) {
    if (ctx.request?.target)
        return normalize(ctx.request.target);
    if (ctx.request?.kind === "goto" && ctx.request.pos)
        return normalize(ctx.request.pos);
    if (ctx.mission?.travelTo)
        return normalize(ctx.mission.travelTo);
    if (ctx.fetchDeathPoint)
        return normalize(ctx.deathPoint?.pos);
    return null;
}

function normalize(target) {
    if (!target)
        return null;
    if (typeof target === "object" && Number.isFinite(target.x))
        return { x: Math.floor(target.x), y: Math.floor(target.y), z: Math.floor(target.z) };
    return null;
}

export function countBlocks(ctx) {
    const counts = ctx.bag.counts();
    let total = 0;
    for (const [id, amount] of Object.entries(counts)) {
        if (isBuildingBlock(id))
            total += amount;
    }
    return total;
}

export function bagBlock(ctx) {
    const counts = ctx.bag.counts();
    const wanted = [
        "minecraft:cobblestone", "minecraft:cobbled_deepslate", "minecraft:stone", "minecraft:deepslate",
        "minecraft:dirt", "minecraft:andesite", "minecraft:granite", "minecraft:diorite", "minecraft:tuff",
        "minecraft:netherrack", "minecraft:oak_planks", "minecraft:birch_planks", "minecraft:spruce_planks",
    ];
    for (const id of wanted)
        if ((counts[id] ?? 0) > 0)
            return id;
    for (const [id, amount] of Object.entries(counts))
        if (amount > 0 && isBuildingBlock(id))
            return id;
    return "minecraft:cobblestone";
}

export function isBuildingBlock(id) {
    return BUILD_EXACT.has(id) || BUILD_PATTERN.test(id);
}

// Deliberately generous: a wrong "yes" costs a slightly uglier bridge, while a
// wrong "no" makes a skill believe it has no material at all.
const BUILD_PATTERN = /(_planks|_log|_wood|cobblestone|cobbled_deepslate|andesite|granite|diorite|tuff|netherrack|sandstone|_bricks|gravel|terracotta|sand|glass)/;
const BUILD_EXACT = new Set(["minecraft:stone", "minecraft:dirt", "minecraft:deepslate"]);

const floorSelf = (ctx) => ({ x: Math.floor(ctx.self.pos.x), y: Math.floor(ctx.self.pos.y), z: Math.floor(ctx.self.pos.z) });
const fmt = (p) => p ? `${Math.floor(p.x)},${Math.floor(p.y)},${Math.floor(p.z)}` : "?";
const describe = (move) => move.kind;
export { key, hazardAround };
