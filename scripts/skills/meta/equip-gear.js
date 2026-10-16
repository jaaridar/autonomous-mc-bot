// Wear the best gear carried, and keep a weapon in hand when danger is near.
//
// Two rules the old bot learned in play: armour left in the bag is armour that
// does nothing, and a bot that fights with a pickaxe loses fights it should win.
// This skill is cheap and runs often, but only acts when there is an actual
// upgrade to make.

import { defineSkill, done, failed, running } from "../contract.js";
import { armorScore, boost, weaponDamage, weaponTier } from "../util.js";

const ARMOR_RE = /_(helmet|chestplate|leggings|boots)$/;
const ORDER = ["Head", "Chest", "Legs", "Feet"];

export const equipGearSkill = defineSkill({
    id: "meta.equip-gear",
    category: "meta",
    tags: ["armor", "equip", "gear", "weapon", "upkeep"],
    priority: 38,
    cost: 1,
    budget: 200,
    cooldown: 30,
    plan(ctx) {
        const carried = {};
        for (const [id, amount] of Object.entries(ctx.bag.counts())) {
            if (amount <= 0)
                continue;
            const slot = slotFor(id);
            if (!slot)
                continue;
            const score = armorScore(id);
            if (!carried[slot] || score > carried[slot].score)
                carried[slot] = { id, score };
        }
        const upgrades = [];
        for (const slot of ORDER) {
            const best = carried[slot];
            if (!best)
                continue;
            const worn = ctx.equipment?.[slot];
            if (!worn || armorScore(worn) < best.score)
                upgrades.push({ slot, item: best.id, from: worn, score: best.score });
        }
        const weapon = ctx.bag.best("weapon");
        const held = ctx.equipment?.Mainhand;
        const weaponUpgrade = weapon && weapon !== held && weaponDamage(weapon) >= weaponDamage(held);
        return { upgrades, weapon, weaponUpgrade, armorPoints: ctx.armorPoints };
    },
    requires(ctx) {
        return ctx.bag.totalItems > 0;
    },
    score(ctx) {
        const plan = this.plan(ctx);
        if (plan.upgrades.length === 0 && !plan.weaponUpgrade)
            return 0;
        const danger = ctx.threats(16).length > 0;
        return (danger ? 66 : 26) + plan.upgrades.length * 3 + boost(ctx, "meta.equip-gear");
    },
    run(ctx, run) {
        const plan = this.plan(ctx);
        const upgrade = plan.upgrades[0];
        if (!upgrade) {
            if (plan.weaponUpgrade && ctx.act.select(plan.weapon))
                return done(`holding ${short(plan.weapon)}`);
            return done(plan.upgrades.length === 0 ? "gear is already the best carried" : "done");
        }
        const ok = ctx.act.equipArmor?.(upgrade.slot, upgrade.item);
        if (!ok)
            return failed(`could not equip ${short(upgrade.item)}`);
        return done(`wearing ${short(upgrade.item)} (${plan.upgrades.length} upgrade(s))`);
    },
    verify(ctx, plan) {
        return plan.upgrades.length === 0 || ctx.armorPoints > 0;
    },
    start() { return {}; },
});

function slotFor(id) {
    if (!ARMOR_RE.test(id))
        return undefined;
    const slot = id.replace("minecraft:", "").split("_").slice(-1)[0];
    return { helmet: "Head", chestplate: "Chest", leggings: "Legs", boots: "Feet" }[slot];
}

const short = (id) => String(id ?? "").replace("minecraft:", "");
export { weaponDamage, weaponTier };
