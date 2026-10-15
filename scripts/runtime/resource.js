/**
 * Resource Manager - efficient acquisition and inventory management.
 */
import { amountOf } from "../core/recipes.js";
import { priorityOf, nextNeeded, currentPhase, PHASES } from "../core/resource.js";
import { distance } from "../core/math.js";

export class ResourceManager {
    constructor(bot) {
        this.bot = bot;
        this.bag = bot.bag;
        this.terrain = bot.terrain;
        this.lastEval = 0;
        this.queue = [];
        this.currentTask = undefined;
        this.stuckCount = 0;
    }

    reset() {
        this.queue = [];
        this.currentTask = undefined;
        this.stuckCount = 0;
    }

    evaluate(tick) {
        if (tick - this.lastEval < 40) return this.currentTask;
        this.lastEval = tick;
        const counts = this.bag.counts();
        const phase = currentPhase(counts);
        const need = nextNeeded(counts, phase);
        if (!need) {
            this.currentTask = undefined;
            return undefined;
        }
        // If current task still relevant, keep it
        if (this.currentTask && this.currentTask.item === need.item) {
            return this.currentTask;
        }
        this.currentTask = need;
        return need;
    }

    /**
     * Should we gather this item entity?
     */
    shouldGatherItem(itemType, amount) {
        const counts = this.bag.counts();
        const free = this.bag.container.emptySlotsCount;
        if (free < 1) return false;
        const prio = priorityOf(itemType);
        if (prio >= 70) return true;
        const have = counts[itemType] ?? 0;
        // Don't over-gather
        if (have > 64) return false;
        return true;
    }

    /**
     * Auto-sort inventory when messy.
     */
    organizeIfNeeded() {
        // If many partial stacks, organize
        let partials = 0;
        for (let i = 0; i < this.bag.size; i++) {
            const s = this.bag.get(i);
            if (s && s.amount < s.maxAmount / 2) partials++;
        }
        if (partials > 6) {
            return this.bag.organize();
        }
        return 0;
    }

    /**
     * Find best nearby resource to gather opportunistically.
     */
    findOpportunistic(tick) {
        const pos = this.bot.sim.location;
        const counts = this.bag.counts();
        // Look for high-value drops within 8 blocks
        try {
            const drops = this.bot.sim.dimension.getEntities({ type: "minecraft:item", location: pos, maxDistance: 8 })
                .filter(e => e.isValid)
                .map(e => {
                    const item = e.getComponent("minecraft:item")?.itemStack;
                    if (!item) return null;
                    return { e, type: item.typeId, score: priorityOf(item.typeId), dist: distance(e.location, pos) };
                })
                .filter(Boolean)
                .sort((a,b) => b.score - a.score || a.dist - b.dist);
            if (drops.length && drops[0].score >= 50) {
                return drops[0];
            }
        } catch {}
        return undefined;
    }

    /**
     * Deposit low-value items to chest if nearby and inventory full.
     */
    shouldDeposit() {
        const free = this.bag.container.emptySlotsCount;
        if (free > 4) return false;
        // If low-value items taking space, deposit
        const counts = this.bag.counts();
        let lowValue = 0;
        for (const [type, amount] of Object.entries(counts)) {
            if (priorityOf(type) < 20) lowValue += amount;
        }
        return lowValue > 16;
    }
}
