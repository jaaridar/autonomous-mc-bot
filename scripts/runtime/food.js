import { COMBAT_FOOD_THRESHOLD, HEALTH_THRESHOLDS, adjustTacticForHostile, assessFoodReserves, prioritizeEscapeCoverSurvival, reassessAfterDamage, shouldAvoidCombat, shouldEatBeforeFight } from "../core/survival.js";
/**
 * Food Runtime - food healing combat readiness.
 * Maintain sufficient food exploration sprinting combat emergency recovery.
 * Track hunger health saturation availability replacement.
 * Before dangerous fight eat when necessary when safe.
 * Avoid beginning combat critical health insufficient resources unless no safer alternative.
 * Prioritize escape cover survival vs multiple hostile unfavorable.
 * Recognize every relevant hostile adjust tactics attack pattern range movement environmental advantages.
 * After damage reassess instead blindly continuing plan.
 */

export class FoodDirector {
    constructor(bot) {
        this.bot = bot;
        this.sim = bot.sim;
        this.bag = bot.bag;
        this.lastEatCheck = 0;
        this.lastDamage = 0;
        this.prevHealth = 20;
        this.consecutiveAvoids = 0;
    }

    reset() {
        this.lastEatCheck = 0;
        this.consecutiveAvoids = 0;
    }

    tick(tick) {
        const counts = this.bag.counts();
        const hunger = this.sim.getComponent("minecraft:player.hunger")?.currentValue ?? 20;
        const health = this.sim.getComponent("minecraft:health")?.currentValue ?? 20;

        // Track damage for reassess
        if (health < this.prevHealth) {
            this.lastDamage = tick;
            try {
                const threatInfo = this.bot.terrain.threatInfo(this.sim, this.bot.owner());
                const reassess = reassessAfterDamage(null, this.prevHealth - health, health, threatInfo.list, { hasBlocks: (this.bot.builder?.countBlocks() ?? 0) > 0 });
                if (reassess && reassess.priority >= 80) {
                    this.bot.reason = `Food: ${reassess.reason} - reassess after damage ${this.prevHealth - health} dmg`;
                }
            } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }
        }
        this.prevHealth = health;

        if (tick - this.lastEatCheck < 40) return false;
        this.lastEatCheck = tick;

        const reserves = assessFoodReserves(counts);
        const threatInfo = this.bot.terrain.threatInfo(this.sim, this.bot.owner());
        const threatTypes = threatInfo.list.map(e => e.typeId);

        // Before dangerous fight eat when necessary when safe
        if (threatInfo.nearest && threatInfo.count >= 1) {
            const eatBefore = shouldEatBeforeFight(hunger, health, threatInfo.count, threatTypes);
            if (eatBefore.shouldEat) {
                const foodSlot = this.bag.food(health <= 8 || hunger <= 6);
                if (foodSlot >= 0 && (threatInfo.closest > 6 || hunger <= 8)) {
                    this.bot.reason = `Food: ${eatBefore.reason} - eating before fight`;
                    this.bot.eat(tick);
                    return true;
                }
            }

            // Avoid beginning combat critical health insufficient resources unless no safer alternative
            const avoidCombat = shouldAvoidCombat(health, hunger, reserves, { hasWeapon: this.bot.equipment.hasWeapon() }, threatInfo.count, threatTypes);
            if (avoidCombat.avoid) {
                this.consecutiveAvoids++;
                if (this.consecutiveAvoids < 3) {
                    this.bot.reason = `Food: ${avoidCombat.reason} - avoiding combat critical health insufficient resources`;
                    const retreatSpot = this.findSafeSpot(12);
                    if (retreatSpot) {
                        const r = this.bot.navTo(retreatSpot, tick, 2);
                        if (r !== "failed") return true;
                    }
                }
            } else {
                this.consecutiveAvoids = 0;
            }

            // Prioritize escape cover survival vs multiple hostile unfavorable
            if (threatInfo.count >= 3) {
                const escapePlan = prioritizeEscapeCoverSurvival(threatInfo.list, health, false, (this.bot.builder?.countBlocks() ?? 0) > 0);
                if (escapePlan.priority >= 80) {
                    this.bot.reason = `Food: ${escapePlan.reason} - prioritizing ${escapePlan.action} vs multiple hostile unfavorable`;
                    return false;
                }
            }

            // Recognize every relevant hostile adjust tactics
            if (threatInfo.nearest) {
                try {
                    const tactic = adjustTacticForHostile(threatInfo.nearest.typeId, { distance: threatInfo.closest, health, hasShield: (counts["minecraft:shield"] ?? 0) > 0 });
                    if (tactic.tactic !== "melee") {
                        this.bot.reason = `Food: hostile ${threatInfo.nearest.typeId} tactic ${tactic.tactic} - ${tactic.reason}`;
                    }
                } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }
            }
        }

        // Maintain sufficient food exploration sprinting combat emergency recovery
        if (reserves.totalHunger < 20 && this.bot.mode !== "idle") {
            this.bot.reason = `Food: reserves critical ${reserves.totalHunger} hunger - prioritize food before exploration`;
            const foodSpot = this.bot.awareness?.getNearest("bread") ?? this.bot.awareness?.getNearest("potato");
            if (foodSpot) {
                const r = this.bot.navTo(foodSpot.pos, tick, 2);
                if (r !== "failed") return true;
            }
        }

        return false;
    }

    findSafeSpot(radius) {
        try {
            const p = this.bot.terrain.groundNear(this.sim.location.x, this.sim.location.z, this.sim.location.y, radius);
            if (p && !this.bot.terrain.dangerous(p)) return p;
        } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }
        return null;
    }
}
