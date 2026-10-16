// Smelt raw materials into usable ones (iron ore -> ingot, meat -> cooked meat).
//
// Smelting needs a furnace, fuel and time, so this skill is a *place and wait*
// skill rather than an instant action: it finds or places a furnace, feeds it,
// waits for the output, and takes it. The accounting is honest - a smelt that
// produces nothing is a failure, not a success with an excuse.

import { defineSkill, blocked, done, failed, running } from "../contract.js";
import { boost } from "../util.js";
import { smeltSource } from "../../core/craft-plan.js";
import { fuelCount, smeltOutput } from "../../core/recipes.js";

export const smeltItemSkill = defineSkill({
    id: "craft.smelt-item",
    category: "craft",
    tags: ["smelt", "furnace", "cook", "iron", "fuel"],
    priority: 58,
    cost: 2,
    budget: 1400,
    cooldown: 60,
    plan(ctx) {
        const wanted = ctx.request?.kind === "smelt" ? ctx.request.target : ctx.mission?.smelt;
        const counts = ctx.bag.counts();
        const sources = [];
        if (wanted) {
            const source = smeltSource(wanted);
            if (source && (counts[source] ?? 0) > 0)
                sources.push({ out: wanted, source, amount: counts[source] });
        }
        else {
            for (const [rawId, amount] of Object.entries(counts)) {
                const out = smeltOutput(rawId);
                if (out && out !== rawId && amount > 0 && ctx.needsItem?.(out) !== false)
                    sources.push({ out, source: rawId, amount });
            }
        }
        sources.sort((a, b) => b.amount - a.amount || a.out.localeCompare(b.out));
        const hasFurnace = ctx.bag.has("minecraft:furnace");
        // Fuel maths: what we would burn for this batch, and with what. Coal first
        // (it smelts 8), planks as the fallback (they smelt 1.5 each).
        const batch = Math.min(8, Math.max(1, sources[0]?.amount ?? 1));
        const coal = (counts["minecraft:coal"] ?? 0) + (counts["minecraft:charcoal"] ?? 0);
        const fuelKind = coal > 0 ? "minecraft:coal" : "minecraft:oak_planks";
        const fuel = fuelCount(fuelKind, batch);
        return { job: sources[0] ?? null, sources, hasFurnace, fuel, fuelKind, batch, before: sources[0] ? counts[sources[0].out] ?? 0 : 0 };
    },
    requires(ctx) {
        const counts = ctx.bag.counts();
        const hasRaw = Object.keys(counts).some((id) => smeltOutput(id) && smeltOutput(id) !== id);
        return hasRaw && (counts["minecraft:furnace"] ?? 0) > 0 || !!ctx.nearFurnace?.();
    },
    score(ctx) {
        const counts = ctx.bag.counts();
        const raw = Object.keys(counts).filter((id) => smeltOutput(id) && smeltOutput(id) !== id && counts[id] > 0);
        if (raw.length === 0)
            return 0;
        if (!ctx.nearFurnace?.() && !(counts["minecraft:furnace"] > 0))
            return 0;
        return 48 + raw.length * 3 + boost(ctx, "craft.smelt-item");
    },
    run(ctx, run) {
        const job = run.plan.job;
        if (!job)
            return done("nothing worth smelting");
        const station = ctx.nearFurnace?.();
        if (!station) {
            if (!ctx.bag.has("minecraft:furnace"))
                return blocked("no furnace: craft one first");
            const placed = ctx.act.placeStation?.("minecraft:furnace");
            if (!placed)
                return running("placing the furnace");
            return running("furnace placed");
        }
        if (!ctx.bag.has(job.source, 1)) {
            const produced = ctx.bag.count(job.out) - run.plan.before;
            return produced > 0 ? done(`smelted ${produced}x ${short(job.out)}`) : failed(`ran out of ${short(job.source)}`);
        }
        const state = ctx.furnaceState?.(station);
        if (state?.busy && !state.matches?.(job)) {
            run.steps++;
            if (run.steps > 120)
                return failed("furnace busy with something else", { recovery: "retry" });
            return running("waiting for the furnace");
        }
        if (!state?.busy) {
            const fed = ctx.act.smelt(job.source, Math.min(job.amount, 8));
            if (!fed?.ok)
                return failed(`could not start the smelt: ${fed?.reason ?? "engine refused"}`);
            return running(`smelting ${short(job.source)} -> ${short(job.out)}`);
        }
        run.steps++;
        const collected = ctx.act.collectStation?.(station);
        if (collected > 0)
            return done(`smelted ${collected}x ${short(job.out)}`);
        return running("waiting for the smelt to finish");
    },
    verify(ctx, plan) {
        return !plan.job || ctx.bag.count(plan.job.out) > plan.before;
    },
    start() { return {}; },
});

const short = (id) => String(id ?? "").replace("minecraft:", "");
export { fuelCount, smeltOutput, smeltSource };
