// Eat: pick the best food for the situation, eat it, verify the hunger bar moved.
//
// Two details make this more than "use a food item": the bot must not eat its
// last golden apple while starving with raw beef in the bag, and it must not
// claim a meal it did not get (the engine refuses to eat when full). Both are
// checked here, and the hunger delta is the proof.

import { defineSkill, done, failed, running } from "../contract.js";
import { boost, bestFood } from "../util.js";
import { FOOD } from "../../core/world.js";
import { itemValue } from "../../core/data/item-values.js";

export const eatSkill = defineSkill({
    id: "survival.eat",
    category: "survival",
    tags: ["eat", "food", "hunger", "heal"],
    priority: 85,
    cost: 1,
    budget: 200,
    cooldown: 20,
    plan(ctx) {
        const food = bestFood(ctx);
        return { food, before: ctx.self.hunger, at: ctx.self.hunger };
    },
    requires(ctx) {
        return !!bestFood(ctx);
    },
    score(ctx) {
        const hunger = ctx.self.hunger ?? 20;
        const critical = ctx.self.hp <= (ctx.settings?.criticalHp ?? 6) + 4;
        if (hunger > (ctx.settings?.eatAt ?? 16) && !critical)
            return boost(ctx, "survival.eat");
        return 60 + (20 - hunger) * 3 + boost(ctx, "survival.eat");
    },
    run(ctx, run) {
        const food = run.plan.food;
        if (!food)
            return failed("no food in the bag");
        if (!ctx.bag.has(food, 1))
            return failed(`${short(food)} ran out`);
        if ((ctx.self.hunger ?? 20) >= 20 && (ctx.self.hp ?? 20) >= 20)
            return done("not hungry");
        if (ctx.self.inWater && (ctx.self.air ?? 300) < 60)
            return failed("cannot eat while drowning");
        ctx.act.select(food);
        const ate = ctx.act.eat(food);
        run.steps++;
        if (!ate)
            return running(`chewing ${short(food)}`);
        if (run.steps > 6)
            return failed(`could not eat ${short(food)} (offhand or blocked)`);
        return done(`ate ${short(food)} (hunger ${ctx.self.hunger})`);
    },
    verify(ctx, plan) {
        return (ctx.self.hunger ?? 0) >= (plan.at ?? 0);
    },
    start() { return {}; },
});

/** Food that should be kept for emergencies even when starving. */
export function isPreciousFood(typeId) {
    return /golden_apple|enchanted_golden_apple|golden_carrot/.test(typeId) || itemValue(typeId) >= 6;
}

export { FOOD };
const short = (id) => String(id ?? "").replace("minecraft:", "");
