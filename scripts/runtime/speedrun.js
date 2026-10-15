/**
 * Speedrun Director - end-to-end speedrun planner with world awareness.
 * Main goal upskilling itself: wood->stone->iron->diamond->portal->nether.
 * Knows every block/item and best use in situation. Structure loot main priority,
 * lava pool -> portal, quick tool priority #1, death recovery, retain important.
 */
import { currentPhase, PHASES, CHECKLIST } from "../core/resource.js";
import { amountOf } from "../core/recipes.js";
import { distance, center } from "../core/math.js";
import { retainScore, isCritical } from "../core/knowledge.js";

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
        this.subPhase = "gather";
        this.tries = 0;
        this.lavaPoolTries = 0;
        this.obsidianProgress = 0;
    }

    reset(tick) {
        this.phase = PHASES.WOOD;
        this.stage = 0;
        this.started = tick;
        this.lastProgress = tick;
        this.subPhase = "gather";
        this.goal = undefined;
        this.tries = 0;
        this.lavaPoolTries = 0;
        this.obsidianProgress = 0;
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

        // Check structure loot main priority - if found high priority structure, loot first
        try {
            const topStruct = b.structures?.getTopPriority();
            if (topStruct && topStruct.priority >= 90 && (this.phase === PHASES.WOOD || this.phase === PHASES.STONE)) {
                const lootTarget = b.structures.getLootTarget();
                if (lootTarget && distance(lootTarget.pos, b.sim.location) < 24) {
                    b.reason = `Speedrun: structure ${topStruct.name} priority ${topStruct.priority} - looting before upskilling`;
                    const r = b.navTo(center(lootTarget.pos), tick, 2);
                    if (r !== "failed") return;
                }
            }
            // Lava pool portal opportunity - if have water bucket, prioritize obsidian
            const portalOpp = b.structures?.getPortalOpportunity();
            if (portalOpp && portalOpp.hasWater && this.phase >= PHASES.IRON) {
                if ((counts["minecraft:obsidian"] ?? 0) < 10) {
                    b.reason = `Speedrun: lava pool portal opportunity at ${portalOpp.pos.x},${portalOpp.pos.y},${portalOpp.pos.z} - making obsidian`;
                    // Navigate to lava pool if far
                    if (distance(portalOpp.pos, b.sim.location) > 8) {
                        const r = b.navTo(center(portalOpp.pos), tick, 4);
                        if (r !== "failed") return;
                    } else {
                        // Close to lava pool, try to make obsidian
                        this.portalPhase(tick, counts);
                        return;
                    }
                }
            }
        } catch {}

        this.phase = currentPhase(counts);

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
                b.reason = "Speedrun complete - maintaining and upskilling";
                // Upskill: maintain gear, explore, find better
                if (b.scout.step(tick)) return;
                break;
        }
    }

    woodPhase(tick, counts) {
        const b = this.bot;
        // Quick tool priority #1 - never bare hand
        const hasWeapon = b.equipment.hasWeapon();
        if (!hasWeapon) {
            b.reason = "Speedrun wood: no weapon - quick tool #1 priority";
            if ((counts["minecraft:oak_log"] ?? 0) < 2) {
                if (!b.mining || b.mining.block !== "minecraft:oak_log") b.startMine("minecraft:oak_log", 4);
                return;
            }
            if (!(counts["minecraft:crafting_table"] > 0)) {
                b.obtain("minecraft:crafting_table", 1, tick);
                return;
            }
            if ((counts["minecraft:stick"] ?? 0) < 4) {
                b.obtain("minecraft:stick", 4, tick);
                return;
            }
            b.obtain("minecraft:wooden_sword", 1, tick);
            return;
        }

        if ((counts["minecraft:oak_log"] ?? 0) < 6 && (counts["minecraft:birch_log"] ?? 0) < 6 && (counts["minecraft:spruce_log"] ?? 0) < 6) {
            b.reason = "Speedrun: gathering wood for upskilling";
            if (!b.mining || b.mining.block !== "minecraft:oak_log") {
                b.startMine("minecraft:oak_log", 8);
            }
            return;
        }
        if (!(counts["minecraft:crafting_table"] > 0)) {
            b.reason = "Speedrun: crafting table for upskilling";
            b.obtain("minecraft:crafting_table", 1, tick);
            return;
        }
        if (!(counts["minecraft:wooden_pickaxe"] > 0)) {
            b.reason = "Speedrun: wooden pickaxe for stone";
            b.obtain("minecraft:wooden_pickaxe", 1, tick);
            return;
        }
        b.reason = "Speedrun: wood phase done, upskilling to stone";
    }

    stonePhase(tick, counts) {
        const b = this.bot;
        // Ensure weapon
        if (!b.equipment.hasWeapon()) {
            b.obtain("minecraft:stone_sword", 1, tick);
            return;
        }
        if ((counts["minecraft:cobblestone"] ?? 0) < 20) {
            b.reason = "Speedrun: mining cobblestone for stone tools + furnace";
            if (!b.mining || !b.mining.bulk) {
                b.startMine("minecraft:cobblestone", 20);
            }
            return;
        }
        if (!(counts["minecraft:stone_pickaxe"] > 0)) {
            b.obtain("minecraft:stone_pickaxe", 1, tick);
            return;
        }
        if (!(counts["minecraft:stone_sword"] > 0) && !(counts["minecraft:iron_sword"] > 0)) {
            b.obtain("minecraft:stone_sword", 1, tick);
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
        // Check awareness for iron ore spots
        try {
            const ironSpot = b.awareness?.getNearest("iron_ore") ?? b.awareness?.getNearest("raw_iron");
            if (ironSpot && (counts["minecraft:raw_iron"] ?? 0) < 8 && distance(ironSpot.pos, b.sim.location) < 20) {
                b.reason = `Speedrun: iron ore remembered at ${ironSpot.pos.x},${ironSpot.pos.y},${ironSpot.pos.z} - mining`;
                if (!b.mining || b.mining.block !== "minecraft:iron_ore") {
                    b.startMine("minecraft:iron_ore", 8);
                }
                return;
            }
        } catch {}

        const needIron = 12 - (counts["minecraft:iron_ingot"] ?? 0) - (counts["minecraft:raw_iron"] ?? 0);
        if (needIron > 0) {
            if (b.settings.deepMining) {
                b.reason = "Speedrun: deep mining iron for upskilling";
                if (!b.mining || b.mining.deepItem !== "minecraft:raw_iron") {
                    b.startMine("minecraft:iron_ore", Math.max(needIron, 6));
                }
            } else {
                b.reason = "Speedrun: searching iron for upskilling";
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
        if (!(counts["minecraft:iron_sword"] > 0)) {
            b.obtain("minecraft:iron_sword", 1, tick);
            return;
        }
        if (!(counts["minecraft:shield"] > 0)) {
            b.obtain("minecraft:shield", 1, tick);
            return;
        }
        if (!(counts["minecraft:bucket"] > 0) && !(counts["minecraft:water_bucket"] > 0)) {
            b.obtain("minecraft:bucket", 1, tick);
            return;
        }
        // If have bucket but no water, find water
        if ((counts["minecraft:bucket"] ?? 0) > 0 && !(counts["minecraft:water_bucket"] > 0)) {
            try {
                const water = b.awareness?.getWaterSource() ?? b.structures?.lavaPools?.[0];
                if (b.awareness?.getWaterSource()) {
                    const ws = b.awareness.getWaterSource();
                    b.reason = `Speedrun: bucket found, getting water at ${ws.x},${ws.y},${ws.z} for portal`;
                    const r = b.navTo(center(ws), tick, 2);
                    if (r !== "failed") return;
                }
            } catch {}
        }
    }

    diamondPhase(tick, counts) {
        const b = this.bot;
        try {
            const diamondSpot = b.awareness?.getNearest("diamond");
            if (diamondSpot && (counts["minecraft:diamond"] ?? 0) < 5 && distance(diamondSpot.pos, b.sim.location) < 24) {
                b.reason = `Speedrun: diamond remembered at ${diamondSpot.pos.x},${diamondSpot.pos.y},${diamondSpot.pos.z}`;
                if (!b.mining || b.mining.deepItem !== "minecraft:diamond") {
                    b.startMine("minecraft:diamond_ore", 5);
                }
                return;
            }
        } catch {}

        if ((counts["minecraft:diamond"] ?? 0) < 5) {
            b.reason = "Speedrun: deep mining diamonds for upskilling to portal";
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
        const obsidianHave = counts["minecraft:obsidian"] ?? 0;
        if (obsidianHave < 10) {
            // Need water + lava
            const hasWaterBucket = (counts["minecraft:water_bucket"] ?? 0) > 0;
            const hasBucket = (counts["minecraft:bucket"] ?? 0) > 0;
            if (!hasWaterBucket && !hasBucket) {
                b.obtain("minecraft:bucket", 1, tick);
                return;
            }
            if (!hasWaterBucket && hasBucket) {
                // Find water source
                try {
                    const ws = b.awareness?.getWaterSource();
                    if (ws) {
                        b.reason = `Speedrun: have bucket, need water at ${ws.x},${ws.y},${ws.z} for obsidian`;
                        const r = b.navTo(center(ws), tick, 2);
                        if (r !== "failed") return;
                    }
                } catch {}
            }

            // Try to make obsidian from lava pool
            try {
                const lavaPool = b.awareness?.getLavaPool() ?? b.structures?.getPortalOpportunity();
                const pos = lavaPool?.pos ?? lavaPool?.pos;
                if (pos) {
                    if (distance(pos, b.sim.location) > 10) {
                        b.reason = `Speedrun: lava pool at ${pos.x},${pos.y},${pos.z} - going for obsidian portal`;
                        const r = b.navTo(center(pos), tick, 4);
                        if (r !== "failed") return;
                    } else {
                        b.reason = "Speedrun: at lava pool, making obsidian with water bucket";
                        // Place water on lava - actual placement handled by hands/builder
                        // For now, start mining obsidian if water placed
                        if (hasWaterBucket) {
                            // Look for obsidian nearby
                            const obsidianNear = b.terrain.scanOres(b.sim.location, 8, (type) => type === "minecraft:obsidian", 200);
                            if (obsidianNear.length) {
                                b.startMine("minecraft:obsidian", 10 - obsidianHave);
                                return;
                            } else {
                                // Need to place water
                                b.reason = "Speedrun: placing water on lava to make obsidian";
                                // Water placement logic: use water bucket on lava
                                try {
                                    const waterSlot = b.bag.find(s => s.typeId === "minecraft:water_bucket");
                                    if (waterSlot >= 0) {
                                        const selected = b.bag.select(waterSlot);
                                        const lavaBlock = b.terrain.block(pos);
                                        if (lavaBlock) {
                                            b.sim.lookAtBlock(b.host.relative(center(pos)));
                                            b.sim.useItemInSlot(selected);
                                            this.lavaPoolTries++;
                                            return;
                                        }
                                    }
                                } catch {}
                            }
                        }
                    }
                }
            } catch {}

            b.reason = "Speedrun: gathering obsidian (find lava pool for portal)";
            b.startMine("minecraft:obsidian", 10 - obsidianHave);
            return;
        }

        // Have obsidian, need flint and steel
        if (!(counts["minecraft:flint_and_steel"] > 0) && !(counts["minecraft:flint"] > 0)) {
            b.reason = "Speedrun: need flint for portal";
            b.startMine("minecraft:gravel", 3);
            return;
        }
        if (!(counts["minecraft:flint_and_steel"] > 0)) {
            b.obtain("minecraft:flint_and_steel", 1, tick);
            return;
        }

        b.reason = "Speedrun: portal ready - building and lighting! Upskilling complete, ready for nether";
        // Try to build portal frame
        try {
            if (b.builder && obsidianHave >= 10) {
                const p = b.sim.location;
                const base = { x: Math.floor(p.x), y: Math.floor(p.y), z: Math.floor(p.z) };
                const r = b.builder.buildPortalFrame(base, tick);
                if (r === "placed") {
                    b.reason = "Speedrun: building portal frame";
                    return;
                }
            }
        } catch {}
    }
}
