/**
 * Speedrun Director - end-to-end speedrun planner.
 * Phases: wood -> stone -> iron -> diamond -> portal.
 * Integrates with survival, deepminer, looting, combat.
 */
import { currentPhase, PHASES, CHECKLIST } from "../core/resource.js";
import { amountOf } from "../core/recipes.js";
import { distance } from "../core/math.js";

export class SpeedrunDirector {
    constructor(bot) {
        this.bot = bot;
        this.bag = bot.bag;
        this.phase = PHASES.WOOD;
        this.stage = 0;
        this.started = 0;
        this.lastProgress = 0;
        this.signature = "";
        this.goal = undefined;
        this.subPhase = "gather"; // gather, craft, mine, smelt, explore
        this.tries = 0;
    }

    reset(tick) {
        this.phase = PHASES.WOOD;
        this.stage = 0;
        this.started = tick;
        this.lastProgress = tick;
        this.subPhase = "gather";
        this.goal = undefined;
        this.tries = 0;
    }

    status() {
        return {
            phase: Object.keys(PHASES).find(k => PHASES[k] === this.phase),
            stage: this.stage,
            subPhase: this.subPhase,
            goal: this.goal,
            uptime: this.bot ? this.bot.sim ? 0 : 0 : 0
        };
    }

    tick(tick) {
        const b = this.bot;
        if (!b.settings.assistedCrafting) {
            b.blockTask("Speedrun requires !bot config crafting on");
            return;
        }

        const counts = b.bag.counts();
        const sig = JSON.stringify(counts);
        if (sig !== this.signature) {
            this.signature = sig;
            this.lastProgress = tick;
        }
        if (tick - this.lastProgress > 12000) {
            b.blockTask("No progress for 10m in speedrun; check terrain.", "manual");
            return;
        }

        this.phase = currentPhase(counts);

        // Phase-specific logic
        switch (this.phase) {
            case PHASES.WOOD:
                this.woodPhase(tick, counts);
                break;
            case PHASES.STONE:
                this.stonePhase(tick, counts);
                break;
            case PHASES.IRON:
                this.ironPhase(tick, counts);
                break;
            case PHASES.DIAMOND:
                this.diamondPhase(tick, counts);
                break;
            case PHASES.PORTAL:
                this.portalPhase(tick, counts);
                break;
            default:
                b.reason = "Speedrun complete - maintaining";
                if (b.scout.step(tick)) return;
                break;
        }
    }

    woodPhase(tick, counts) {
        const b = this.bot;
        if ((counts["minecraft:oak_log"] ?? 0) < 6 && (counts["minecraft:birch_log"] ?? 0) < 6) {
            b.reason = "Speedrun: gathering wood";
            if (!b.mining || b.mining.block !== "minecraft:oak_log") {
                b.startMine("minecraft:oak_log", 8);
            }
            return;
        }
        if (!(counts["minecraft:crafting_table"] > 0)) {
            b.reason = "Speedrun: crafting table";
            b.obtain("minecraft:crafting_table", 1, tick);
            return;
        }
        if (!(counts["minecraft:wooden_pickaxe"] > 0)) {
            b.reason = "Speedrun: wooden pickaxe";
            b.obtain("minecraft:wooden_pickaxe", 1, tick);
            return;
        }
        b.reason = "Speedrun: wood phase done, moving to stone";
    }

    stonePhase(tick, counts) {
        const b = this.bot;
        if ((counts["minecraft:cobblestone"] ?? 0) < 20) {
            b.reason = "Speedrun: mining cobblestone";
            if (!b.mining || !b.mining.bulk) {
                b.startMine("minecraft:cobblestone", 20);
            }
            return;
        }
        if (!(counts["minecraft:stone_pickaxe"] > 0)) {
            b.obtain("minecraft:stone_pickaxe", 1, tick);
            return;
        }
        if (!(counts["minecraft:furnace"] > 0)) {
            b.obtain("minecraft:furnace", 1, tick);
            return;
        }
        if ((counts["minecraft:torch"] ?? 0) < 12) {
            b.obtain("minecraft:torch", 12, tick);
            return;
        }
    }

    ironPhase(tick, counts) {
        const b = this.bot;
        const needIron = 12 - (counts["minecraft:iron_ingot"] ?? 0) - (counts["minecraft:raw_iron"] ?? 0);
        if (needIron > 0) {
            // Try to find exposed iron first, else deep mine
            if (b.settings.deepMining) {
                b.reason = "Speedrun: deep mining iron";
                if (!b.mining || b.mining.deepItem !== "minecraft:raw_iron") {
                    b.startMine("minecraft:iron_ore", Math.max(needIron, 6));
                }
            } else {
                b.reason = "Speedrun: searching iron";
                b.startMine("minecraft:iron_ore", needIron);
            }
            return;
        }
        if ((counts["minecraft:iron_ingot"] ?? 0) < 8) {
            b.autonomy.produce("minecraft:raw_iron", 8 - (counts["minecraft:iron_ingot"] ?? 0), tick);
            return;
        }
        if (!(counts["minecraft:iron_pickaxe"] > 0)) {
            b.obtain("minecraft:iron_pickaxe", 1, tick);
            return;
        }
        if (!(counts["minecraft:bucket"] > 0)) {
            b.obtain("minecraft:bucket", 1, tick);
            return;
        }
    }

    diamondPhase(tick, counts) {
        const b = this.bot;
        if ((counts["minecraft:diamond"] ?? 0) < 5) {
            b.reason = "Speedrun: deep mining diamonds";
            if (!b.mining || b.mining.deepItem !== "minecraft:diamond") {
                b.startMine("minecraft:diamond_ore", 5);
            }
            return;
        }
        if (!(counts["minecraft:diamond_pickaxe"] > 0)) {
            b.obtain("minecraft:diamond_pickaxe", 1, tick);
            return;
        }
    }

    portalPhase(tick, counts) {
        const b = this.bot;
        if ((counts["minecraft:obsidian"] ?? 0) < 10) {
            // Need water + lava
            if (!(counts["minecraft:water_bucket"] > 0 || counts["minecraft:bucket"] > 0)) {
                b.obtain("minecraft:bucket", 1, tick);
                return;
            }
            b.reason = "Speedrun: gathering obsidian (find lava pool)";
            // Look for lava
            b.startMine("minecraft:obsidian", 10);
            return;
        }
        b.reason = "Speedrun: portal ready - light it!";
        // Could place portal here
    }
}
