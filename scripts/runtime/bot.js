import { system, world, EntityComponentTypes, Direction, } from "@minecraft/server";
import { add, floor, key, distance, away, horizontal, CARDINAL, COMPASS, UP, DOWN, center, } from "../core/math.js";
import { MINE, priority, toolTier, diggable, RANGED, EXPLOSIVE, HOSTILES as MOB_DEFENCE, } from "../core/policy.js";
import { RECIPES, craft, id, nextStep, matches, amountOf, bedTarget, } from "../core/recipes.js";
import { isUndergroundOre, isBulk } from "../core/ores.js";
import { sanitizePrefs } from "../core/memory.js";
import { Bag, NativeInventory } from "./inventory.js";
import { Hands } from "./hands.js";
import { Terrain, BlockScan } from "./world.js";
import { Explorer } from "./exploration.js";
import { SurvivalDirector } from "./survival.js";
import { Equipment } from "./equipment.js";
import { Escaper } from "./escape.js";
import { Miner } from "./mining.js";
import { Drops } from "./drops.js";
import { Scout } from "./scouting.js";
import { TaskFault, blockedTask, } from "../core/recovery.js";
import { Navigator } from "./navigation.js";
// New advanced modules
import { Builder } from "./builder.js";
import { Combat } from "./combat.js";
import { Looting } from "./looting.js";
import { Parkour } from "./parkour.js";
import { DeepMiner } from "./deepminer.js";
import { ResourceManager } from "./resource.js";
import { SpeedrunDirector } from "./speedrun.js";
import { isPassable, isUnbreakable, isFalling } from "../core/blocks.js";

/** Blocks the observer sweep records for the persistent memory. */
const OBSERVED = new Map([
    ["minecraft:chest", "chest"],
    ["minecraft:trapped_chest", "chest"],
    ["minecraft:barrel", "chest"],
    ["minecraft:crafting_table", "crafting_table"],
    ["minecraft:furnace", "furnace"],
    ["minecraft:lit_furnace", "furnace"],
    ["minecraft:nether_portal", "portal"],
]);
const totalItems = (c) => Object.values(c).reduce((a, b) => a + b, 0);
const BLOCKED_TTL = 1800;
const VALUABLE = /^minecraft:(diamond|emerald|netherite|.*_ingot|.*enchanted_book|golden_apple|enchanted_golden_apple|totem_of_undying|heart_of_the_sea|nautilus_shell|.*_horse_armor|saddle|name_tag|.*_bucket|.*_smithing_template|.*_armor_trim|music_disc_.*|.*_spawn_egg|.*_shulker_box|ancient_debris|obsidian|ender_pearl|blaze_rod|ender_eye|elytra|trident|.*_bed|.*_wool)/;

export class Bot {
    constructor(sim, ownerName, host, memory) {
        this.sim = sim;
        this.ownerName = ownerName;
        this.host = host;
        this.memory = memory ?? null;
        this.recoveryAttempts = 0;
        this.progressSignature = "";
        this.hurtTick = -1000;
        this.lastEquipmentCheck = -100;
        this.workKey = "";
        this.settings = {
            assistedCrafting: false,
            parkour: true,
            defend: true,
            fast: true,
            range: 256,
            hunting: true,
            armor: true,
            bridge: true,
            boat: true,
            deepMining: true,
            camp: true,
            pickup: true,
            loot: true,
            speedrun: false,
        };
        Object.assign(this.settings, sanitizePrefs(memory?.prefs()) ?? {});
        this.mode = "idle";
        this.paused = true;
        this.state = "paused";
        this.reason = "Spawned safely; choose a task.";
        this.explorer = new Explorer();
        this.stationTrips = 0;
        this.taskStart = 0;
        this.lastBranch = "";
        this.lastAttack = 0;
        this.lastCrit = 0;
        this.critArmed = false;
        this.lastStrafe = 0;
        this.eatingUntil = 0;
        this.retreatSince = 0;
        this.fleeSince = 0;
        this.escapeAttempts = 0;
        this.escapeOrigin = undefined;
        this.stage = 0;
        this.campState = undefined;
        this.escapeSeal = undefined;
        this.sealSince = 0;
        this.followBlocked = 0;
        this.gotoTold = 0;
        this.followFails = 0;
        this.swingCell = undefined;
        this.swingSince = 0;
        this.recoverTarget = undefined;
        this.recoverSince = 0;
        this.recoverSeen = 0;
        this.recoverPush = 0;
        this.grab = undefined;
        this.grabIgnore = new Map();
        this.deadSince = 0;
        this.respawnTried = false;
        this.postDeath = undefined;
        this.lastKnown = undefined;
        this.lootScan = 0;
        this.lootIgnore = new Map();
        this.lootState = undefined;
        this.lootReturn = undefined;
        this.boatTrip = undefined;
        this.boatIgnore = 0;
        this.golemRun = undefined;
        this.lastBlockedTell = undefined;
        this.thenAuto = false;
        this.log = [];
        this.errors = 0;
        this.startedTick = system.currentTick;
        this.bag = new Bag(sim);
        this.terrain = new Terrain(sim.dimension);
        this.nav = new Navigator(sim, host, this.terrain);
        this.escaper = new Escaper(this);
        this.miner = new Miner(this);
        this.drops = new Drops(this);
        this.scout = new Scout(this);
        this.lastDigReason = "";
        this.equipment = new Equipment(sim, this.bag);
        this.hands = new Hands(this);
        this.autonomy = new SurvivalDirector(this);
        // New advanced modules
        this.builder = new Builder(this);
        this.combat = new Combat(this);
        this.looting = new Looting(this);
        this.parkour = new Parkour(this);
        this.deepMiner = new DeepMiner(this);
        this.resource = new ResourceManager(this);
        this.speedrun = new SpeedrunDirector(this);
        this.nav.builder = this.builder;
        // Enhanced mining state
        this.obstructionClear = undefined;
        this.scaffoldState = undefined;
        this.lastTorchPlace = 0;
        this.mineStuckSince = 0;
        this.mineRetries = 0;
        sim.addTag("verdant.bot");
        this.record("spawned advanced bot v0.9");
    }

    owner() {
        return world.getAllPlayers().find((p) => p.name === this.ownerName && !p.hasTag("verdant.bot"));
    }
    record(event) {
        this.log.push({ tick: system.currentTick, event });
        if (this.log.length > 64) this.log.shift();
    }
    tell(msg) { this.owner()?.sendMessage(`§a[Verdant] §r${msg}`); }
    stopActions() {
        this.nav.reset();
        try { this.sim.stopBreakingBlock(); } catch {}
        try { this.sim.stopUsingItem(); } catch {}
        try { this.sim.stopInteracting(); } catch {}
        try { this.sim.isSneaking = false; } catch {}
        this.swingCell = undefined;
        this.grab = undefined;
        this.obstructionClear = undefined;
        this.scaffoldState = undefined;
        if (this.mining) this.mining.breakingSince = undefined;
    }
    dangerThreat() { return this.threat; }
    stop(reason = "Stopped by owner.") {
        this.stopActions();
        if (this.parkCamp()) this.tell("Shelter is still sealed; !bot resume opens it first.");
        this.escaper.reset();
        this.miner.reset();
        this.deepMiner.reset();
        this.builder.resetPillar?.();
        this.combat.reset();
        this.looting.reset();
        this.blocked = undefined;
        this.recoveryAttempts = 0;
        this.mode = "idle";
        this.paused = true;
        this.mining = undefined;
        this.pendingTable = undefined;
        this.goal = undefined;
        this.recoverTarget = undefined;
        this.state = "paused";
        this.reason = reason;
        this.record(reason);
        this.save();
    }
    parkCamp() {
        const s = this.campState;
        this.campState = undefined;
        if (s?.sealed && s.sealCell) {
            this.escapeSeal = { ...s.sealCell };
            this.sealSince = system.currentTick;
            return true;
        }
        return false;
    }
    blockTask(reason, recovery = "retry") {
        if (this.paused || this.mode === "idle") { this.pause(reason); return; }
        if (this.blocked) { this.stopActions(); this.state = "blocked"; return; }
        this.stopActions();
        this.blocked = blockedTask(reason, recovery, ++this.recoveryAttempts, system.currentTick);
        this.state = "blocked";
        this.reason = reason;
        this.record("task blocked: " + reason);
        const retrying = this.blocked.retryAt !== undefined;
        const text = `Problem: ${reason} (while ${this.mission()}). ` + (retrying ? "Retrying shortly; defence stays active." : "Task needs attention; defence stays active.");
        const last = this.lastBlockedTell;
        const now = system.currentTick;
        if (!last || last.text !== text || now - last.tick > 12000) {
            this.lastBlockedTell = { text, tick: now };
            this.tell(text);
        }
        this.save();
    }
    onHurt(event) {
        if (event.hurtEntity.id !== this.sim.id) return;
        this.hurtTick = system.currentTick;
        const attacker = event.damageSource.damagingEntity;
        if (attacker?.typeId !== "minecraft:player") this.recentAttacker = attacker;
        this.record("hurt: " + event.damage);
    }
    recoverTask(tick) {
        const remaining = this.mode === "mine" && this.mineRequest ? Math.max(1, (this.mining?.amount ?? this.mineRequest.count) - (this.mining?.broken ?? 0)) : undefined;
        this.cancelWork();
        if (remaining !== undefined && this.mineRequest) {
            this.mineRequest.count = remaining;
            this.mining = this.newMining(remaining, this.mineRequest.block);
        }
        this.autonomy.resume(tick);
        this.autonomy.recover();
        this.blocked = undefined;
        this.taskStart = tick;
        this.lastBranch = "";
        this.reason = "Replanning after recoverable task failure";
        this.record("automatic recovery");
    }
    pause(reason) {
        this.stopActions();
        if (this.parkCamp()) this.tell("Shelter is sealed; !bot resume opens it first.");
        this.escaper.reset();
        this.paused = true;
        this.state = "paused";
        this.reason = reason;
        this.record(reason);
        this.tell(reason);
        this.save();
    }
    resume() {
        this.stopActions();
        this.blocked = undefined;
        this.recoveryAttempts = 0;
        this.equipment.faultReason = "";
        this.paused = false;
        this.taskStart = system.currentTick;
        this.lastBranch = "";
        this.reason = "Resumed";
        this.autonomy.resume(system.currentTick);
        this.retreatSince = 0;
        this.eatingUntil = 0;
        this.record("resume");
    }
    setMode(mode, goal) {
        this.stopActions();
        this.parkCamp();
        this.escaper.reset();
        this.miner.reset();
        this.deepMiner.reset();
        this.combat.reset();
        this.escapeAttempts = 0;
        this.fleeSince = 0;
        this.mining = undefined;
        this.pendingTable = undefined;
        this.recoverTarget = undefined;
        this.goal = goal;
        this.anchor = { ...this.sim.location };
        this.mode = mode;
        this.mineRequest = undefined;
        this.blocked = undefined;
        this.followBlocked = 0;
        this.followFails = 0;
        this.recoveryAttempts = 0;
        this.lastBlockedTell = undefined;
        this.equipment.faultReason = "";
        this.progressSignature = JSON.stringify(this.bag.counts());
        this.paused = false;
        this.stage = 0;
        this.workKey = "";
        this.autonomy.reset(system.currentTick);
        this.speedrun.reset(system.currentTick);
        this.explorer.reset();
        this.stationTrips = 0;
        this.lastBranch = "";
        this.taskStart = system.currentTick;
        this.mineStuckSince = 0;
        this.mineRetries = 0;
        this.record(`mode:${mode}`);
    }
    startMine(block, amount) {
        if (!MINE[block]) throw Error("Unsupported block; see !bot help and docs/COMMANDS.md.");
        this.setMode("mine");
        this.mineRequest = { block, count: amount };
        this.mining = this.newMining(amount, block);
    }
    newMining(amount, block, item) {
        const drop = item ?? (block ? MINE[block]?.drops : undefined);
        const bulk = !!drop && isBulk(drop);
        if (bulk && !item) item = drop;
        const underground = !!drop && (isUndergroundOre(drop) || bulk) && this.settings.deepMining;
        return {
            amount, block, item, bulk, deepItem: drop, underground,
            startCount: amountOf(this.bag.counts(), drop),
            broken: 0, approachTry: 0,
            scan: new BlockScan(this.sim.location, underground ? 8 : 12),
            blocked: new Map(), loot: new Map(), lootSince: system.currentTick,
            noTargetSince: system.currentTick, failures: 0,
            treeMode: /(_log|_wood)$/.test(block ?? ""),
            cropMode: /(wheat|carrot|potato|beetroot|berry|melon|pumpkin|cactus|sugar_cane|kelp|bamboo)/.test(block ?? ""),
        };
    }
    newScan(m) { return new BlockScan(this.sim.location, m?.underground ? 8 : 12); }
    veinScan(m, tick) {
        const drop = m.item ?? m.deepItem ?? (m.block ? MINE[m.block]?.drops : undefined);
        if (!drop) return undefined;
        if (!m.wide || (m.wide.done && tick - (m.wideAt ?? 0) > 100)) {
            m.wide = new BlockScan(this.sim.location, 12);
            m.wideAt = tick;
        }
        if (m.wide.done) return undefined;
        const self = floor(this.sim.location);
        return m.wide.next(this.terrain, (type, p) => {
            const r = MINE[type];
            if (!r || !matches(r.drops, drop)) return false;
            if ((m.blocked.get(key(p)) ?? 0) > tick) return false;
            if (Math.abs(p.y - self.y) > 6) return false;
            if (p.x === self.x && p.z === self.z && p.y <= self.y) return false;
            return (this.safeToMine(p) && (this.mode === "survival" || this.mode === "starter" ? [...CARDINAL, { x: 0, y: 1, z: 0 }].some((d) => this.terrain.block(add(p, d))?.isAir) : this.terrain.line(this.sim.getHeadLocation(), add(p, { x: 0.5, y: 0.5, z: 0.5 }), p)));
        });
    }
    digCell(cell, tick) {
        const b = this.terrain.block(cell);
        if (!b || b.isAir) return "open";
        if (b.isLiquid) { this.lastDigReason = "Refusing to dig a liquid."; return "refused"; }
        if (this.terrain.lavaNear(cell)) { this.lastDigReason = "Lava beside that block; leaving it alone."; return "lava"; }
        if (this.terrain.waterNear(cell)) { this.lastDigReason = "Water beside that block; leaving it alone."; return "water"; }
        const rule = MINE[b.typeId] ?? diggable(b.typeId);
        if (!rule) { this.lastDigReason = `Cannot break ${b.typeId}.`; return "no-tool"; }
        if (rule.tier > 0) {
            if (!this.bag.tool(rule.tool, rule.tier)) { this.lastDigReason = `Need a ${rule.tool} tier ${rule.tier} to dig ${b.typeId}.`; return "no-tool"; }
        } else if (rule.tool === "axe") this.bag.tool("axe");
        else if (rule.tool === "shovel") this.bag.tool("shovel");
        this.sim.lookAtBlock(this.host.relative(center(cell)));
        if (!this.sim.breakBlock(this.host.relative(center(cell)))) { this.lastDigReason = `${b.typeId} is out of reach.`; return "unreachable"; }
        return "digging";
    }
    placeTorch(support) {
        try {
            if (!this.terrain.solid(support)) return false;
            const slot = this.bag.find((s) => s.typeId === "minecraft:torch");
            if (slot < 0) return false;
            const selected = this.bag.select(slot);
            this.sim.lookAtBlock(this.host.relative(center(support)));
            return this.sim.useItemInSlotOnBlock(selected, this.host.relative(center(support)), Direction.Up);
        } catch { return false; }
    }
    /**
     * Enhanced deep mining with new DeepMiner for branch mining.
     */
    deepMine(m, tick, met) {
        const full = this.bag.container.emptySlotsCount < 1;
        const wantedOut = this.miner.wantsOut || this.deepMiner.wantsOut;

        // If deepMiner active, delegate
        if (this.deepMiner.active) {
            if (met || full || wantedOut) {
                const r = this.deepMiner.ascend(tick);
                this.reason = this.deepMiner.reason;
                if (r === "surface") {
                    const why = wantedOut ? "No vein found on that shaft." : full && !met ? "Inventory full underground." : "";
                    this.deepMiner.reset();
                    this.miner.reset();
                    if (why) { this.blockTask(why + " Climbed out; resume to try a new shaft.", "manual"); return "blocked"; }
                    return "done";
                }
                if (r === "stalled") { this.blockTask(this.deepMiner.reason, "manual"); return "blocked"; }
                return "continue";
            }
            // Scan for ores to feed deepMiner
            const scanFn = () => {
                const drop = m.item ?? m.deepItem;
                if (!drop) return [];
                return this.terrain.scanOres(this.sim.location, 10, (type) => {
                    const r = MINE[type];
                    return r && matches(r.drops, drop);
                }, 400);
            };
            const r = this.deepMiner.tick(tick, scanFn, met);
            this.reason = this.deepMiner.reason;
            if (r === "done") return "done";
            if (r === "stalled" || r === "blocked" || r === "no-tool") return "blocked";
            return "continue";
        }

        if (this.miner.active && (met || full || wantedOut)) {
            const r = this.miner.ascend(tick);
            this.reason = this.miner.reason;
            if (r === "surface") {
                const why = wantedOut ? "No vein found on that shaft." : full && !met ? "Inventory full underground." : "";
                this.miner.reset();
                if (why) { this.blockTask(why + " Climbed out; resume to try a new shaft.", "manual"); return "blocked"; }
                return "done";
            }
            if (r === "stalled") { this.blockTask(this.miner.reason, "manual"); return "blocked"; }
            return "continue";
        }
        if (met) return "done";
        if (!this.miner.active && !m.bulk && tick - m.noTargetSince < 400) return "fallthrough";

        // For bulk or deep ores, use deepMiner for better branch mining
        if (m.underground && m.deepItem && this.settings.deepMining) {
            const started = this.deepMiner.start(m.deepItem, tick);
            if (started) {
                this.miner.reset();
                return "continue";
            }
        }

        const r = this.miner.ensure(m, tick);
        this.reason = this.miner.reason;
        if (r === "at-depth") return "fallthrough";
        if (r === "no-tool" || r === "lava" || r === "water" || r === "stalled" || r === "blocked") return "blocked";
        return "continue";
    }
    craft(item, batches = 1) {
        if (!this.settings.assistedCrafting) throw Error("Assisted crafting is off. !bot config crafting on explicitly enables inventory recipes.");
        if (item === id("bed")) {
            const colour = bedTarget(this.bag.counts());
            if (!colour) throw Error("No 3 wool of one colour in the bag (beds cannot mix colours).");
            item = colour;
        }
        const r = RECIPES.find((r) => r.output === item);
        if (!r) throw Error("Recipe not supported.");
        craft(this.bag, r, batches, this.terrain.tableNear(this.sim.location));
        this.record(`craft:${item} x${r.amount * batches}`);
    }
    tick() {
        const tick = system.currentTick;
        if (this.state === "dead") { this.deadTick(tick); return; }
        if (!this.sim.isValid) return;
        try { this.lastKnown = { p: { ...this.sim.location }, dim: this.sim.dimension.id }; } catch {}
        try { this.think(tick); this.errors = 0; } catch (e) {
            this.errors++; this.record(`error:${String(e).slice(0, 200)}`); console.warn(`[Verdant] ${e}`);
            try { this.stopActions(); } catch {}
            if (this.errors >= 3) { this.paused = true; this.state = "fault"; this.reason = `Circuit breaker: ${e}`; this.tell(this.reason); }
        }
    }
    think(tick) {
        if (this.paused) return;
        const owner = this.owner();
        if (!owner) { this.pause("Owner offline; no unattended world mutation."); return; }
        if (this.sim.dimension.id !== "minecraft:overworld" || owner.dimension.id !== this.sim.dimension.id) {
            this.pause("Dimension mismatch. Nether/End travel is not implemented."); return;
        }
        this.terrain.begin(tick);
        this.nav.fast = this.settings.fast;
        this.nav.parkour = this.settings.parkour;
        this.nav.allowBridge = this.settings.bridge;
        this.observe(tick);
        const hp = this.sim.getComponent(EntityComponentTypes.Health)?.currentValue ?? 0;
        if (hp <= 0) { this.recordDeath(); this.save(); this.state = "dead"; this.deadSince = tick; this.respawnTried = false; return; }
        if (this.escapeSeal && this.unseal(tick)) return;
        const hunger = this.sim.getComponent("minecraft:player.hunger")?.currentValue ?? 20;

        // Auto organize if needed
        if (tick % 200 === 0) { try { this.resource.organizeIfNeeded(); } catch {} }

        if (this.settings.armor && !this.equipment.faultReason && tick - this.lastEquipmentCheck >= 20) {
            this.lastEquipmentCheck = tick;
            try { if (this.equipment.autoEquip()) this.record("equipped better armour"); } catch (error) {
                this.equipment.faultReason = String(error); this.blockTask(this.equipment.faultReason, "manual");
            }
        }

        // Enhanced threat evaluation with combat module
        const info = this.settings.defend ? this.terrain.threatInfo(this.sim, owner) : { list: [], nearest: undefined, count: 0, ranged: 0, explosive: 0, melee: 0, closest: Infinity, bombNear: false, underFire: false };
        const attacker = this.recentAttacker;
        if (this.settings.defend && attacker?.isValid && tick - this.hurtTick < 300 && attacker.dimension.id === this.sim.dimension.id && distance(attacker.location, this.sim.location) <= 24 && attacker.typeId !== "minecraft:player" && MOB_DEFENCE.has(attacker.typeId) && !info.list.includes(attacker)) {
            info.list.unshift(attacker); info.count++; info.ranged += RANGED.has(attacker.typeId) ? 1 : 0; info.nearest = attacker; info.closest = Math.min(info.closest, distance(attacker.location, this.sim.location));
        }
        this.threat = info.nearest;

        const p = floor(this.sim.location), below = this.terrain.read(add(p, DOWN));
        const justStuck = this.nav.stuck;
        this.nav.stuck = false;
        let escapeKind = this.escaper.active ? this.escaper.mode : "";
        if (!escapeKind) {
            if (this.sim.isInWater) escapeKind = "water";
            else if (below?.hazard) escapeKind = "trapped";
            else if (justStuck && this.mode !== "idle") escapeKind = "trapped";
        }
        const usable = this.bag.usableCounts();
        const hasWeapon = Object.keys(usable).some((k) => usable[k] > 0 && (k.endsWith("_sword") || k.endsWith("_axe")));
        const desperate = hp <= 8 || hunger <= 4;
        const foodSlot = this.bag.food(desperate);
        let retreat = false;
        if (info.nearest) {
            retreat = hp <= 6 || info.bombNear || info.count >= 4 || (hp <= 12 && (info.count >= 2 || info.explosive > 0)) || (hp <= 10 && !hasWeapon) || (hp <= 14 && info.ranged > 0 && info.closest > 3);
        }
        if (retreat) this.fleeSince = this.fleeSince || tick; else this.fleeSince = 0;
        if (this.fleeSince && info.nearest && tick - this.fleeSince < 200) retreat = true;
        const eat = foodSlot >= 0 && hunger <= 17 && (!info.nearest || info.closest > 10 || hunger <= 6);
        const branch = priority({ paused: false, escape: !!escapeKind, retreat, eat, threat: !!info.nearest, });
        if (branch !== this.lastBranch) { this.stopActions(); this.lastBranch = branch; this.retreatSince = 0; this.eatingUntil = 0; }
        this.state = branch;
        if (branch === "escape") {
            if (!this.escaper.active) {
                if (this.escapeAttempts++ >= 14) { this.blockTask("Stuck repeatedly with no way out; needs help.", "retry"); return; }
                this.escapeOrigin = { ...this.sim.location };
            }
            const result = this.escaper.step(escapeKind || "trapped", tick);
            this.reason = this.escaper.lastReason;
            if (result === "done") {
                const moved = this.escapeOrigin ? distance(this.sim.location, this.escapeOrigin) : 0;
                this.escaper.reset(); this.nav.reset();
                if (moved >= 1) this.escapeAttempts = 0;
                this.fleeSince = 0; this.lastBranch = ""; this.record(moved >= 2 ? "escaped" : "escape made no progress");
            } else if (result === "failed") {
                const why = this.escaper.lastReason; this.escaper.reset(); this.nav.reset();
                this.blockTask("Escape failed: " + why, "retry");
            }
            return;
        }
        if (branch === "retreat") { this.retreat(info, tick); return; }
        if (branch === "eat") { this.eat(tick); return; }
        if (branch === "combat" && info.nearest) { this.fight(info, tick); return; }
        if (this.blocked) {
            this.state = "blocked";
            if (this.blocked.retryAt !== undefined && tick >= this.blocked.retryAt) { this.recoverTask(tick); }
            return;
        }
        const observed = JSON.stringify(this.bag.counts());
        if (observed !== this.progressSignature) { this.progressSignature = observed; this.recoveryAttempts = 0; this.escapeAttempts = 0; }
        if (tick - this.taskStart > (this.mode === "survival" || this.mode === "goto" || this.mode === "speedrun" ? 36000 : this.mode === "starter" ? 12000 : 7200) && ["mine", "goto", "starter", "speedrun"].includes(this.mode)) {
            this.blockTask("Task deadline exceeded; inspect terrain/supplies and retry.", "manual"); return;
        }
        if (this.camp(tick)) return;
        // Enhanced looting - runs in all modes
        if (this.settings.loot && this.looting.tick(tick)) return;
        if (this.maybeLoot(tick)) return;
        if (this.boatTravel(tick)) return;
        try {
            switch (this.mode) {
                case "idle": this.idle(tick); break;
                case "follow": this.follow(owner.location, tick, 3); break;
                case "guard": this.follow(this.anchor, tick, 2); break;
                case "goto":
                    if (this.goal) {
                        const r = this.navTo(this.goal, tick, 1);
                        if (r === "done") { this.stop("Destination reached."); this.tell(this.reason); }
                        else if (r === "blocked" || r === "failed") {
                            if (r === "failed") this.reason = this.nav.reason;
                            if (tick - this.gotoTold > 600) { this.gotoTold = tick; this.tell("Still trying to reach the destination" + (r === "failed" ? ` (${this.nav.reason})` : "") + "."); }
                        } else this.gotoTold = tick;
                    }
                    break;
                case "mine":
                    if (this.mining && this.mine(this.mining, tick)) {
                        // Don't pause if in auto chain? For mine command, pause is okay but with message to continue
                        if (this.settings.speedrun || this.mode === "survival" || this.mode === "starter") {
                            this.mining = undefined;
                            this.reason = "Mining quota complete, continuing.";
                        } else {
                            this.stop("Mining quota complete (blocks broken, drops collected).");
                            this.tell(this.reason);
                        }
                    }
                    break;
                case "survival": this.autonomy.tick(tick); break;
                case "starter": this.starter(tick); break;
                case "speedrun": this.speedrun.tick(tick); break;
                case "recover": this.recover(tick); break;
                case "collect": this.collect(tick); break;
                case "loot": this.loot(tick); break;
                case "golem": this.golemTick(tick); break;
            }
        } catch (error) { this.blockTask(String(error), error instanceof TaskFault ? error.recovery : "manual"); }
        if (tick % 100 === 0) this.save();
    }
    navTo(goal, tick, leash) {
        if (distance(this.sim.location, goal) <= leash) { this.nav.reset(); return "done"; }
        const base = floor(goal);
        const seen = new Set();
        const candidates = [];
        const offsets = [{ x: 0, y: 0, z: 0 }, ...COMPASS, ...COMPASS.map((d) => ({ x: d.x * 2, y: 0, z: d.z * 2 })), ...CARDINAL.map((d) => ({ x: d.x, y: -1, z: d.z })), { x: 0, y: 1, z: 0 }, { x: 0, y: -1, z: 0 }];
        for (const d of offsets) {
            const q = add(base, d), k = key(q);
            if (seen.has(k)) continue;
            seen.add(k);
            if (this.terrain.safe(q)) candidates.push(q);
        }
        if (!candidates.length) return "blocked";
        candidates.sort((a, b) => (distance(a, goal) - distance(b, goal)) || (distance(this.sim.location, a) - distance(this.sim.location, b)));
        return this.nav.go(center(candidates[0]), tick);
    }
    follow(goal, tick, leash) {
        const r = this.navTo(goal, tick, leash);
        if (r === "blocked") {
            this.followBlocked = this.followBlocked || tick;
            this.reason = "Holding position; no standable spot near the target yet.";
            try { this.sim.stopMoving(); } catch {}
            this.nav.reset();
            if (tick - this.followBlocked > 200) { this.followBlocked = tick; this.tell("Waiting for a standable spot near the target."); }
            return;
        }
        this.followBlocked = 0;
        if (r === "failed") {
            this.followFails = (this.followFails ?? 0) + 1;
            this.reason = this.nav.reason;
            if (this.followFails >= 6 && this.followFails % 6 === 0) this.tell(`Still trying to reach you (${this.nav.reason})`);
            return;
        }
        this.followFails = 0;
    }
    idle(tick) {
        if (!this.grab) try { this.sim.stopMoving(); } catch {}
        // Opportunistic resource gathering while idle
        if (tick % 40 === 0 && this.settings.hunting) {
            const opp = this.resource.findOpportunistic(tick);
            if (opp && distance(opp.e.location, this.sim.location) < 6) {
                this.reason = `Opportunistic: ${opp.type}`;
                const r = this.navTo(opp.e.location, tick, 1);
                if (r !== "failed") return;
            }
        }
        if (!this.settings.pickup || this.bag.container.emptySlotsCount < 1) return;
        const g = this.grab;
        if (g) {
            if (!g.e.isValid || distance(g.e.location, this.sim.location) > 12) { this.grab = undefined; return; }
            if (distance(g.e.location, this.sim.location) > 1.2) {
                g.contact = 0;
                if (tick - g.since > 120 || this.nav.go(center(floor(g.e.location)), tick) === "failed") { this.grabIgnore.set(g.e.id, tick + 400); this.grab = undefined; }
                return;
            }
            this.nav.reset();
            try { this.sim.stopMoving(); } catch {}
            if (!g.contact) g.contact = tick;
            else if (tick - g.contact > 60) { this.grabIgnore.set(g.e.id, tick + 400); this.grab = undefined; }
            return;
        }
        if (tick % 20 !== 0) return;
        if (this.grabIgnore.size > 64) for (const [entityId, until] of this.grabIgnore) if (until < tick) this.grabIgnore.delete(entityId);
        const near = this.sim.dimension.getEntities({ type: "minecraft:item", location: this.sim.location, maxDistance: 8, })
            .filter((e) => e.isValid && (this.grabIgnore.get(e.id) ?? 0) < tick && this.terrain.safe(e.location))
            .sort((a, b) => distance(a.location, this.sim.location) - distance(b.location, this.sim.location))[0];
        if (!near) return;
        this.reason = "Picking up loose drops nearby.";
        this.grab = { e: near, since: tick, contact: 0 };
    }
    collect(tick) {
        const g = this.goal;
        if (!g?.anchor) { this.stop("Collect: no sweep point."); return; }
        g.skipped ??= new Set(); g.startCounts ??= this.bag.counts(); g.deadline ??= tick + Math.max(600, g.radius * 60); g.idleSince ??= 0;
        if (this.bag.container.emptySlotsCount < 1) { this.blockTask("Inventory full; deposit before collecting.", "manual"); return; }
        const raw = this.sim.dimension.getEntities({ type: "minecraft:item", location: { x: g.anchor.x, y: g.anchor.y, z: g.anchor.z }, maxDistance: g.radius, }).filter((e) => e.isValid);
        if (tick > g.deadline) return this.finishCollect(raw, g, "Sweep budget reached");
        const drop = raw.filter((e) => !g.skipped.has(e.id) && this.terrain.safe(e.location)).sort((a, b) => distance(a.location, this.sim.location) - distance(b.location, this.sim.location))[0];
        if (drop) {
            g.idleSince = 0; this.reason = `Collecting drops: ${raw.length} in range of the sweep point.`;
            if (distance(drop.location, this.sim.location) > 1.2) {
                g.contact = 0;
                if (this.nav.go(center(floor(drop.location)), tick) === "failed") { g.skipped.add(drop.id); this.record("collect: one drop unreachable; skipping"); }
                return;
            }
            this.nav.reset(); try { this.sim.stopMoving(); } catch {}
            if (!g.contact) g.contact = tick;
            else if (tick - g.contact > 80) { g.skipped.add(drop.id); g.contact = 0; }
            return;
        }
        const blocked = raw.filter((e) => g.skipped.has(e.id) || !this.terrain.safe(e.location)).length;
        if (raw.length && blocked === raw.length) return this.finishCollect(raw, g, "Sweep done");
        if (!raw.length) { if (!g.idleSince) g.idleSince = tick; if (tick - g.idleSince > 40) return this.finishCollect(raw, g, "Sweep done"); } else g.idleSince = 0;
        try { this.sim.stopMoving(); } catch {}
        this.reason = `Sweeping for drops: ${raw.length} in range of the sweep point.`;
    }
    finishCollect(raw, g, label) {
        const gained = totalItems(this.bag.counts()) - totalItems(g.startCounts);
        const left = raw.filter((e) => e.isValid).length;
        this.stop(`${label}: picked up ${gained} item(s)` + (left ? `; ${left} drop(s) stayed out of reach or in a hazard.` : "."));
        this.tell(this.reason);
    }
    eat(tick) {
        const hunger = this.sim.getComponent("minecraft:player.hunger")?.currentValue ?? 20;
        const hp = this.sim.getComponent(EntityComponentTypes.Health)?.currentValue ?? 20;
        if (this.eatingUntil === 0) {
            const slot = this.bag.food(hp <= 8 || hunger <= 4);
            if (slot < 0) return;
            this.nav.reset();
            const held = this.bag.select(slot);
            if (!this.sim.useItemInSlot(held)) { this.blockTask("Food use rejected by engine."); return; }
            this.eatingUntil = tick + 40; this.reason = "Eating to recover hunger.";
        } else if (tick >= this.eatingUntil) { try { this.sim.stopUsingItem(); } catch {} this.eatingUntil = 0; }
    }
    fight(info, tick) {
        // Use advanced combat module
        const evalRes = this.combat.evaluate(tick);
        if (evalRes.shouldRetreat) { this.retreat(info, tick); return; }
        const target = evalRes.target ?? info.nearest;
        if (!target?.isValid) { this.nav.reset(); return; }
        if (info.count >= 3) { if (this.combat.groupTick(info, tick)) return; }
        this.combat.target = target;
        this.combat.tick(target, tick, info);
    }
    retreat(info, tick) {
        const threat = info?.nearest;
        if (!this.retreatSince) this.retreatSince = tick;
        const clear = !threat || !threat.isValid || distance(threat.location, this.sim.location) > 16;
        if (clear && tick - this.retreatSince > 20) {
            this.nav.urgent = false; this.nav.avoid = []; this.nav.reset(); this.retreatSince = 0; this.fleeSince = 0; this.lastBranch = ""; this.record("broke contact"); return;
        }
        if (this.miner.active && this.miner.route.length > 1) {
            const r = this.miner.ascend(tick); this.reason = this.miner.reason;
            if (r === "surface") { this.miner.reset(); this.blockTask("Climbed out of the shaft to break contact with a hostile.", "retry"); }
            else if (r !== "stalled") { return; }
        }
        if (this.deepMiner.active && this.deepMiner.route.length > 1) {
            const r = this.deepMiner.ascend(tick); this.reason = this.deepMiner.reason;
            if (r === "surface") { this.deepMiner.reset(); this.blockTask("Climbed out to break contact.", "retry"); }
            else if (r !== "stalled") return;
        }
        if (tick - this.retreatSince > 350) { this.nav.urgent = false; this.nav.avoid = []; this.blockTask("Could not break contact with a hostile; needs help.", "manual"); return; }
        this.nav.urgent = true;
        this.nav.avoid = (info?.list ?? []).map((e) => ({ x: e.location.x, y: e.location.y, z: e.location.z, radius: 6, }));
        const p = floor(this.sim.location);
        const here = threat ? distance(p, threat.location) : 0;
        const candidates = [];
        for (const d of COMPASS) for (const n of [4, 6, 8]) {
            const q = this.terrain.groundNear(p.x + d.x * n, p.z + d.z * n, p.y, 5);
            if (!q || this.terrain.dangerous(q)) continue;
            if (threat && distance(q, threat.location) <= here + 1) continue;
            candidates.push(q);
        }
        candidates.sort((a, b) => threat ? distance(b, threat.location) - distance(a, threat.location) : distance(a, this.owner()?.location ?? p) - distance(b, this.owner()?.location ?? p));
        this.reason = "Retreating from " + (threat?.typeId ?? "danger");
        if (!candidates.length) { this.nav.urgent = false; this.nav.avoid = []; this.nav.stuck = true; return; }
        if (this.nav.go(center(candidates[0]), tick) === "failed") { this.nav.urgent = false; this.nav.avoid = []; }
    }

    /**
     * Enhanced mining with obstruction clearing, tree handling, bridging, etc.
     */
    mine(m, tick) {
        const stock = this.bag.counts();
        const met = m.item ? amountOf(stock, m.item) - m.startCount >= m.amount : m.broken >= m.amount;
        if (met && this.bag.container.emptySlotsCount > 0) {
            if (m.sweepUntil === undefined) m.sweepUntil = tick + 300;
            if (tick < m.sweepUntil) {
                const stray = this.drops.near(m, this.sim.location, 10, tick);
                if (stray) { m.pickup = floor(stray.location); m.pickupEntity = stray; m.pickupUntil = tick + 80; }
                if (this.drops.run(m, tick)) return false;
            }
        }
        if (m.underground) {
            const deep = this.deepMine(m, tick, met);
            if (deep === "done") return true;
            if (deep === "blocked") { this.blockTask(this.deepMiner.reason || this.miner.reason, "retry"); return false; }
            if (deep === "continue") return false;
        }
        if (met) return true;
        if (this.bag.container.emptySlotsCount < 1) { this.blockTask("Inventory full; deposit before continuing.", "manual"); return false; }

        // Enhanced: if no target for a while, try to clear obstructions or explore
        if (tick - m.noTargetSince > 800 && !m.returning) {
            if (m.underground) {
                if (this.deepMiner.active) {
                    // Let deepMiner handle
                } else {
                    this.miner.wantsOut = true;
                    m.noTargetSince = tick;
                    this.reason = "No ore in range for a while; climbing out to try elsewhere.";
                    return false;
                }
            }
            if ((this.mode === "survival" || this.mode === "starter" || this.mode === "mine") && m.failures++ < 20) {
                m.exploring = true; m.target = undefined; m.breakingSince = undefined; m.noTargetSince = tick;
                try { this.sim.stopBreakingBlock(); } catch {}
                this.explorer.reset(); this.nav.reset();
            } else {
                // For mine mode, don't block immediately - try wider search then explore
                if (this.mode === "mine" && m.failures < 30) {
                    m.exploring = true; m.target = undefined; m.breakingSince = undefined; m.noTargetSince = tick;
                    this.explorer.reset(); this.nav.reset();
                    this.reason = `No ${m.item ?? m.block} nearby, exploring further...`;
                    return false;
                }
                this.blockTask(`Searched everywhere reachable: no ${m.item ?? m.block}. Move the bot near the resource and retry, or widen with !bot range.`);
            }
            return false;
        }

        if (m.returning) {
            if (tick - (m.peekAt ?? 0) > 10) { m.peekAt = tick; m.peek = new BlockScan(this.sim.location, 12); }
            if (m.peek && !m.peek.done) {
                const spot = m.peek.next(this.terrain, (type, p) => this.wantedToMine(m, type, p, tick));
                if (spot) {
                    m.returning = false; m.peek = undefined; m.target = spot; m.approach = undefined; m.approachTry = 0;
                    this.nav.reset(); this.reason = `Spotted ${m.item ?? m.block} on the way home; going for it.`; return false;
                }
            }
            const home = this.home();
            this.reason = "Heading home after a fruitless search";
            if (distance(this.sim.location, home) < 4 || this.navTo(home, tick, 3) === "done") {
                m.returning = false;
                this.blockTask(`Search finished: no ${m.item ?? m.block} within range of home. Move the bot near the resource, or widen with !bot range.`);
                return false;
            }
            if (this.nav.stuck) {
                m.returnFails = (m.returnFails ?? 0) + 1;
                if (m.returnFails >= 8) { m.returning = false; this.blockTask(`No ${m.item ?? m.block} found, and the route home failed. Bring the bot back manually.`); }
            } else m.returnFails = 0;
            return false;
        }

        if (m.exploring) {
            const stray = this.drops.near(m, this.sim.location, 8, tick);
            if (stray) { m.pickup = floor(stray.location); m.pickupEntity = stray; m.pickupUntil = tick + 80; }
            if (this.drops.run(m, tick)) return false;
            if (tick - (m.peekAt ?? 0) > 10) { m.peekAt = tick; m.peek = new BlockScan(this.sim.location, 12); }
            if (m.peek && !m.peek.done) {
                const spot = m.peek.next(this.terrain, (type, p) => this.wantedToMine(m, type, p, tick));
                if (spot) {
                    m.exploring = false; m.peek = undefined; m.target = spot; m.approach = undefined; m.approachTry = 0;
                    this.explorer.reset(); this.nav.reset();
                    this.reason = `Spotted ${m.item ?? m.block} while scouting; going for it.`; return false;
                }
            }
            this.reason = `Exploring for ${m.item ?? m.block}; visited ${this.explorer.trips} areas`;
            const result = this.explorer.step(this.sim.location, this.anchor, tick, this.terrain, this.nav, this.settings.range);
            if (result === "blocked") {
                m.exploring = false; m.peek = undefined;
                const home = this.home();
                if (distance(this.sim.location, home) > 24) {
                    m.returning = true;
                    this.tell(`No ${m.item ?? m.block} found around here; heading home. Widen with !bot range if the area is just empty.`);
                } else this.blockTask(`Searched the area: no ${m.item ?? m.block} within range. Widen with !bot range or move the bot near the resource.`);
                return false;
            }
            if (result === "arrived") { m.exploring = false; m.target = undefined; m.approach = undefined; m.scan = this.newScan(m); m.far = undefined; m.blocked.clear(); m.noTargetSince = tick; }
            return false;
        }

        if (this.drops.run(m, tick)) return false;

        // Handle obstruction clearing phase
        if (this.obstructionClear) {
            const obs = this.obstructionClear;
            if (tick - obs.since > 300) { this.obstructionClear = undefined; this.reason = "Obstruction clear timeout"; return false; }
            if (!obs.cells.length) { this.obstructionClear = undefined; return false; }
            const cell = obs.cells[0];
            const b = this.terrain.block(cell);
            if (!b || b.isAir || isPassable(b.typeId)) {
                obs.cells.shift();
                return false;
            }
            // Try to break obstruction
            const r = this.digCell(cell, tick);
            if (r === "digging") { this.reason = `Clearing obstruction ${b.typeId} to reach ${m.block}`; return false; }
            if (r === "open") { obs.cells.shift(); return false; }
            // If cannot break, blacklist target and clear
            if (r === "no-tool" || r === "lava" || r === "water") {
                m.blocked.set(key(obs.target), tick + BLOCKED_TTL);
                m.target = undefined; this.obstructionClear = undefined; return false;
            }
            return false;
        }

        if (!m.target) {
            if (m.underground && this.miner.active && (tick - this.miner.cavityAt < 500 || this.miner.turns >= 3)) m.target = this.veinScan(m, tick);
            if (!m.target) m.target = m.scan.next(this.terrain, (type, p) => this.wantedToMine(m, type, p, tick), 600);
            const lootReady = m.loot.size > 0 && ((!m.target && m.scan.done) || (m.target && horizontal(m.target, this.sim.location) > 2.5) || tick - (m.lootSince ?? tick) > 240);
            if (lootReady && this.drops.flush(m, tick, 6, 20)) return false;
            if (!m.target && m.scan.done && !m.underground) {
                if (!m.far || distance(m.farAt, this.sim.location) > 10) { m.far = new BlockScan(this.sim.location, 28); m.farAt = { ...this.sim.location }; m.farUntil = tick + 300; this.reason = `Nothing within 12; sweeping wider for ${m.item ?? m.block}`; }
                if (!m.far.done && tick < m.farUntil) m.target = m.far.next(this.terrain, (type, p) => this.wantedToMine(m, type, p, tick), 900);
            }
            if (!m.target) {
                if (!m.scan.done) return false;
                if (m.far && !m.far.done && tick < m.farUntil) return false;
                if (m.underground) {
                    if (this.miner.active || this.deepMiner.active) {
                        const r = this.miner.active ? this.miner.advance(m, tick) : "at-depth";
                        this.reason = this.miner.reason;
                        if (r === "exhausted" || r === "no-tool" || r === "stalled") this.miner.wantsOut = true;
                        else if (r === "stepped") { m.scan = this.newScan(m); m.wide = undefined; m.far = undefined; }
                    }
                } else if (this.mode === "survival" || this.mode === "starter" || this.mode === "mine") {
                    m.exploring = true; m.peek = undefined; this.explorer.reset(); this.nav.reset(); this.reason = `Nothing within 28 blocks; exploring for ${m.item ?? m.block}`;
                } else this.blockTask("No matching block within ~28 blocks. Use !bot auto for exploring, or move the bot nearer the resource.");
                return false;
            }
            m.type = this.terrain.block(m.target)?.typeId;
        }

        if ((horizontal(m.target, this.sim.location) > 2.5 || tick - (m.lootSince ?? tick) > 240) && this.drops.flush(m, tick, 6, 20)) return false;

        const target = m.target, b = this.terrain.block(target);
        if (!b) { m.target = undefined; m.approach = undefined; m.scan = this.newScan(m); return false; }
        if (b.typeId !== m.type) {
            this.terrain.invalidate(target);
            const wasBreaking = m.breakingSince !== undefined;
            try { this.sim.stopBreakingBlock(); } catch {}
            m.breakingSince = undefined;
            if (wasBreaking) {
                m.broken++; m.noTargetSince = tick;
                if (m.underground) this.miner.turns = 0;
                this.record(`blockChanged:${m.type}`);
            }
            m.target = undefined; m.approach = undefined; m.approachTry = 0;
            const stray = this.drops.near(m, center(target), 3, tick);
            const treeLike = /(_log|_wood)$/.test(m.type ?? "");
            const nearfoot = !!stray && distance(stray.location, this.sim.location) <= 1.6;
            if (stray && (!treeLike || nearfoot)) { m.pickup = floor(stray.location); m.pickupEntity = stray; m.pickupUntil = tick + 80; }
            else if (treeLike) { if (!m.loot.size) m.lootSince = tick; m.loot.set(key(target), tick); if (m.loot.size > 64) m.loot.delete(m.loot.keys().next().value); }
            m.scan = this.newScan(m);
            return false;
        }
        if (!this.safeToMine(target)) {
            // Try to find and clear obstruction instead of just blocking
            const obstructions = this.terrain.obstructionsBelow(this.sim.location, target);
            if (obstructions.length > 0 && obstructions.length <= 3) {
                this.obstructionClear = { target: { ...target }, cells: obstructions, since: tick };
                this.reason = `Clearing ${obstructions.length} block(s) above target to get below`;
                return false;
            }
            m.blocked.set(key(target), tick + BLOCKED_TTL); m.target = undefined; m.approach = undefined;
            try { this.sim.stopBreakingBlock(); } catch {}
            m.breakingSince = undefined;
            return false;
        }

        const at = add(target, { x: 0.5, y: 0.5, z: 0.5 });
        // For tree logs high up, need to pillar or jump
        if (m.treeMode && target.y > floor(this.sim.location).y + 2) {
            // Need to get higher
            const scaffold = this.builder.scaffoldTo(target, tick);
            if (scaffold === "placed" || scaffold === "jumping") { this.reason = "Scaffolding to reach high log"; return false; }
        }

        if (distance(this.sim.getHeadLocation(), at) > 4.6 || !this.terrain.line(this.sim.getHeadLocation(), at, target)) {
            const options = CARDINAL.map((d) => add(target, d)).flatMap((q) => [q, { ...q, y: q.y + 1 }, { ...q, y: q.y - 1 }, { ...q, y: q.y - 2 },]).filter((q) => this.terrain.safe(q) && this.terrain.line(add(center(q), { x: 0, y: 1.62, z: 0 }), at, target));
            options.sort((a, b) => distance(a, this.sim.location) - distance(b, this.sim.location));
            const tries = m.approachTry ?? 0;
            if (!m.approach) {
                if (!options.length || tries >= 5) {
                    // Before giving up, try to clear obstructions to approach
                    const obs = this.terrain.findObstructions(this.sim.location, center(target));
                    if (obs.length > 0 && obs.length <= 2 && tries < 3) {
                        this.obstructionClear = { target: { ...target }, cells: obs.slice(0,2), since: tick };
                        m.approachTry = tries + 1;
                        return false;
                    }
                    m.blocked.set(key(target), tick + BLOCKED_TTL); m.target = undefined; m.approachTry = 0; m.scan = this.newScan(m); return false;
                }
                m.approach = options[Math.min(tries, options.length - 1)];
            }
            const r = this.nav.go(center(m.approach), tick);
            if (r === "failed" || r === "done") { m.approach = undefined; m.approachTry = tries + 1; }
            return false;
        }
        m.approach = undefined; m.approachTry = 0; this.nav.reset();
        const rule = MINE[b.typeId];
        if (!m.breakingSince) {
            if (rule && !this.bag.tool(rule.tool, rule.tier)) {
                m.blocked.set(key(target), tick + BLOCKED_TTL); m.target = undefined; m.approach = undefined; m.approachTry = 0;
                if (rule.tier > 0) { this.blockTask(`Need ${rule.tool} tier ${rule.tier}; wooden=1, stone=2, iron=3.`, "retry"); return false; }
                try { this.bag.emptyHand(); } catch {}
            }
            this.sim.lookAtBlock(this.host.relative(target));
            if (!this.sim.breakBlock(this.host.relative(target))) { m.blocked.set(key(target), tick + BLOCKED_TTL); m.target = undefined; m.approach = undefined; return false; }
            m.breakingSince = tick;
        } else if (tick - m.breakingSince > 450) {
            try { this.sim.stopBreakingBlock(); } catch {}
            m.blocked.set(key(target), tick + BLOCKED_TTL); m.target = undefined; m.approach = undefined; m.breakingSince = undefined; this.record("mining timeout");
        }
        const held = this.bag.get(this.sim.selectedSlotIndex);
        if (rule && rule.tier > 0 && (!held?.typeId.endsWith("_pickaxe") || toolTier(held.typeId) < rule.tier)) {
            try { this.sim.stopBreakingBlock(); } catch {}
            this.blockTask("Required pickaxe lost or broken.");
        }
        return false;
    }

    wantedToMine(m, type, p, tick) {
        const r = MINE[type];
        if (!r) return false;
        const wanted = m.item ? matches(r.drops, m.item) : type === m.block;
        if (!wanted || (m.blocked.get(key(p)) ?? 0) > tick) return false;
        const self = floor(this.sim.location);
        // For tree logs, allow mining above
        if (m.treeMode) {
            if (p.x === self.x && p.z === self.z && p.y < self.y - 1) return false;
        } else {
            if (p.x === self.x && p.z === self.z && p.y <= self.y) {
                // Allow if it's directly below and we can clear above
                if (p.y < self.y - 1) {
                    const above = this.terrain.block({ x: p.x, y: p.y + 1, z: p.z });
                    if (above && !above.isAir && !isPassable(above.typeId)) {
                        // Will be handled by obstruction clearing
                    } else return false;
                } else return false;
            }
        }
        return (this.safeToMine(p) && (this.mode === "survival" || this.mode === "starter" ? [...CARDINAL, { x: 0, y: 1, z: 0 }].some((d) => this.terrain.block(add(p, d))?.isAir) : this.terrain.line(this.sim.getHeadLocation(), add(p, { x: 0.5, y: 0.5, z: 0.5 }), p)));
    }
    safeToMine(p) {
        const self = floor(this.sim.location);
        if (p.x === self.x && p.z === self.z && p.y < self.y - 1) {
            // Mining below - check if we can dig down
            const below = this.terrain.block({ x: self.x, y: self.y - 1, z: self.z });
            if (below && isUnbreakable(below.typeId)) return false;
            // Don't refuse just because falling blocks nearby if we can handle
        }
        if (p.x === self.x && p.z === self.z && p.y === self.y - 1) {
            // Directly under feet - allow if safeToMineEx says ok
            return this.terrain.safeToMineEx(p, false);
        }
        const around = [...CARDINAL, { x: 0, y: 1, z: 0 }, { x: 0, y: -1, z: 0 }];
        for (const d of around) {
            const b = this.terrain.block(add(p, d));
            if (!b || b.isLiquid || /^(minecraft:)(sand|red_sand|gravel|suspicious_sand|suspicious_gravel)$/.test(b.typeId)) {
                // For falling blocks, check if it's above target (would fall)
                if (d.y === 1) return false;
                // Otherwise allow - we can handle
                if (b && b.isLiquid) return false;
            }
        }
        return true;
    }

    isNight() { try { const t = world.getTimeOfDay(); return t >= 13000 && t < 23000; } catch { return false; } }
    observe(tick) {
        if (!this.memory || tick % 40 !== 0) return;
        const base = floor(this.sim.location), dim = this.sim.dimension.id;
        for (let dx = -5; dx <= 5; dx++) for (let dz = -5; dz <= 5; dz++) {
            if (dx * dx + dz * dz > 27) continue;
            for (let dy = -2; dy <= 2; dy++) {
                const b = this.terrain.block(add(base, { x: dx, y: dy, z: dz }));
                if (!b) continue;
                const kind = OBSERVED.get(b.typeId);
                if (kind) this.memory.notice(kind, b.location, dim, tick);
                else if (b.typeId.endsWith("_bed")) this.memory.notice("bed", b.location, dim, tick);
            }
        }
    }
    recordDeath() {
        this.postDeath = this.mode === "loot" && this.lootReturn ? { ...this.lootReturn } : {
            mode: this.mode, goal: this.goal ? { ...this.goal } : undefined, mine: this.minePlan(),
            anchor: this.anchor ? { ...this.anchor } : undefined,
            recover: this.recoverTarget ? { target: { ...this.recoverTarget }, since: this.recoverSince, seen: this.recoverSeen } : undefined,
        };
        let counts = {};
        try { counts = this.bag.counts(); } catch {}
        let where, dim;
        try { where = { ...this.sim.location }; dim = this.sim.dimension.id; } catch { where = this.lastKnown?.p; dim = this.lastKnown?.dim; }
        if (!where || !dim) return;
        try { this.memory?.setDeath(where, dim, system.currentTick, counts); } catch (e) { console.warn("[Verdant] Could not record death point: " + e); }
    }
    isSleeping() { try { return this.sim.isSleeping === true; } catch { return false; } }
    swing(cell, tick) {
        if (this.swingCell && key(this.swingCell) === key(cell)) {
            if (!this.terrain.solid(cell) || tick - this.swingSince > 240) this.swingCell = undefined;
            else return "digging";
        }
        const r = this.digCell(cell, tick);
        if (r === "digging") { this.swingCell = { ...cell }; this.swingSince = tick; }
        return r;
    }
    canCamp() {
        if (this.miner.active || this.deepMiner.active) return false;
        switch (this.mode) {
            case "idle": case "guard": case "goto": case "collect": case "starter": case "survival": case "mine": case "speedrun": return true;
            case "follow": { const o = this.owner(); return !o || distance(o.location, this.sim.location) > 48; }
            case "recover": return !this.armed();
            default: return false;
        }
    }
    armed() { const usable = this.bag.usableCounts(); return Object.keys(usable).some((k) => usable[k] > 0 && (k.endsWith("_sword") || k.endsWith("_axe"))); }
    camp(tick) {
        if (!this.settings.camp || !this.canCamp()) { this.campState = undefined; return false; }
        if (!this.isNight() || this.threat) { if (this.campState?.sealed) this.parkCamp(); else this.campState = undefined; return false; }
        if (this.terrain.threats(this.sim, this.owner()).length) { this.campState = undefined; return false; }
        const s = this.campState ?? (this.campState = { stage: "seek", since: tick, actionSince: tick, tried: new Set(), announced: false, });
        if (s.stage !== "seek" && s.f2 && !this.hands.nearCell(s.f2, 3.5, 2.5)) { s.stage = "seek"; s.actionSince = tick; }
        this.state = "camp";
        switch (s.stage) {
            case "seek": return this.campSeek(s, tick);
            case "dig1": case "dig2": this.campDig(s, tick); return true;
            case "enter":
                if (this.hands.nearCell(s.f2)) { s.stage = "seal"; s.actionSince = tick; }
                else if (tick - s.actionSince > 160) { s.tried.add(s.dirKey); s.stage = "seek"; }
                else { this.reason = "Camping: stepping into the shelter."; this.sim.moveToLocation(this.host.relative(center(s.f2)), { faceTarget: true }); }
                return true;
            case "seal": this.campSeal(s, tick); return true;
            case "sealCheck":
                if (this.terrain.solid(s.sealCell)) { s.sealed = true; this.record("camp: shelter sealed"); }
                s.stage = "wait"; s.actionSince = tick; return true;
            case "wait": this.campWait(s, tick); return true;
            case "exit": this.campExit(s, tick); return true;
        }
        this.campState = undefined; return false;
    }
    campSeek(s, tick) {
        const p = floor(this.sim.location);
        if (s.bed === undefined) s.bed = this.bag.find((x) => x.typeId.endsWith("_bed"));
        if (s.bed >= 0 && !s.bedTried) {
            const spot = CARDINAL.map((d) => ({ c: add(p, d), c2: add(p, { x: d.x * 2, z: d.z * 2 }) })).find(({ c, c2 }) => this.terrain.solid(add(c, DOWN)) && this.terrain.solid(add(c2, DOWN)) && this.terrain.empty(c) && this.terrain.empty(add(c, UP)) && this.terrain.empty(c2) && this.terrain.empty(add(c2, UP)) && !this.terrain.dangerous(add(c, DOWN)) && !this.terrain.dangerous(add(c2, DOWN)));
            s.bedTried = true;
            if (spot) {
                const r = this.hands.placeItemOn(add(spot.c, DOWN), s.bed);
                if (r === "placed") { s.bedCell = spot.c; s.p = { ...p }; s.stage = "wait"; s.actionSince = tick; if (!s.announced) { s.announced = true; this.tell("Nightfall; sleeping until dawn."); } return true; }
            }
        }
        const breakable = (b) => { const rule = MINE[b.typeId] ?? diggable(b.typeId); return !!rule && (rule.tier === 0 || this.bag.tool(rule.tool, rule.tier)); };
        for (const d of CARDINAL) {
            const dirKey = `${d.x},${d.z}`; if (s.tried.has(dirKey)) continue;
            const f1 = add(p, d), h1 = add(f1, UP); const f2 = add(p, { x: d.x * 2, z: d.z * 2 }), h2 = add(f2, UP);
            const front = this.terrain.block(f1); const inner = this.terrain.block(f2); const hi1 = this.terrain.block(h1); const hi2 = this.terrain.block(h2); const floorB = this.terrain.block(add(f2, DOWN));
            const bad = (b) => !b || b.isLiquid || this.terrain.lavaNear(b.location) || this.terrain.waterNear(b.location);
            s.tried.add(dirKey);
            if ([front, inner, hi1, hi2, floorB].some(bad)) continue;
            if (!front.isSolid || !breakable(front)) continue;
            if (!inner.isSolid || !breakable(inner)) continue;
            if (hi1.isSolid && !breakable(hi1)) continue;
            if (hi2.isSolid && !breakable(hi2)) continue;
            s.dirKey = dirKey; s.p = { ...p }; s.f1 = f1; s.h1 = h1; s.f2 = f2; s.h2 = h2; s.stage = "dig1"; s.actionSince = tick;
            if (!s.announced) { s.announced = true; this.tell("Nightfall; digging in until dawn."); } return true;
        }
        s.p = { ...p }; s.stage = "wait"; s.actionSince = tick; this.reason = "Nightfall; no shelter spot, standing watch."; return true;
    }
    campDig(s, tick) {
        const cells = s.stage === "dig1" ? [s.f1, s.h1] : [s.f2, s.h2];
        const cell = cells.find((c) => this.terrain.solid(c));
        if (!cell) { s.stage = s.stage === "dig1" ? "dig2" : "enter"; s.actionSince = tick; return; }
        if (tick - s.actionSince > 400) { this.reason = "Camping: the wall refuses to break; trying another spot."; s.stage = "seek"; s.actionSince = tick; return; }
        const r = this.swing(cell, tick);
        if (r === "digging" || r === "open") { this.reason = "Camping: digging the shelter."; return; }
        this.reason = "Camp dig: " + this.lastDigReason; s.stage = "seek"; s.actionSince = tick;
    }
    campSeal(s, tick) {
        const anchor = add(s.f1, DOWN);
        if (!this.terrain.solid(anchor)) { s.stage = "wait"; s.actionSince = tick; return; }
        const slot = this.hands.sealSlot(); const type = slot >= 0 ? this.bag.get(slot)?.typeId : undefined;
        if (!type || !this.hands.reopenable(type)) { this.reason = "Camping: nothing sealable that we could dig out again; staying on watch."; s.stage = "wait"; s.actionSince = tick; return; }
        const r = this.hands.place(anchor, Direction.Up, { sneak: true, slot });
        if (r === "placed") { s.sealCell = { ...s.f1 }; s.sealSince = tick; s.stage = "sealCheck"; this.reason = "Camping: sealing the shelter."; return; }
        s.stage = "wait"; s.actionSince = tick;
    }
    campWait(s, tick) {
        try { this.sim.stopMoving(); } catch {}
        if (s.sealed) { this.reason = "Camping: sealed in until dawn."; if (!this.isNight()) { s.stage = "exit"; s.actionSince = tick; } return; }
        if (s.bedCell && !s.sleepTried && tick - s.actionSince > 10) {
            s.sleepTried = true;
            const bed = this.terrain.block(s.bedCell);
            if (bed && bed.typeId.endsWith("_bed")) { try { if (typeof this.sim.interactWithBlock === "function" && !this.isSleeping()) this.sim.interactWithBlock(bed); } catch {} }
        }
        this.reason = s.bedCell ? "Camping: sleeping until dawn." : "Camping: standing watch until dawn.";
        if (!this.isNight()) { s.stage = "exit"; s.actionSince = tick; }
    }
    campExit(s, tick) {
        if (s.sealed && s.sealCell && this.terrain.solid(s.sealCell)) {
            this.reason = "Camping: opening the shelter wall."; const r = this.swing(s.sealCell, tick);
            if (r !== "digging" && r !== "open") { this.escapeSeal = { ...s.sealCell }; this.sealSince = tick; this.campState = undefined; }
            return;
        }
        if (s.bedCell && this.isSleeping()) {
            if (tick - s.actionSince > 40) { s.actionSince = tick; try { const bed = this.terrain.block(s.bedCell); if (bed && typeof this.sim.interactWithBlock === "function") this.sim.interactWithBlock(bed); } catch {} }
            return;
        }
        if (s.p && !this.hands.nearCell(s.p)) {
            if (tick - s.actionSince > 200) { this.campState = undefined; this.record("camp: left the shelter"); return; }
            this.sim.moveToLocation(this.host.relative(center(s.p)), { faceTarget: true }); return;
        }
        this.campState = undefined; this.lastBranch = ""; this.record("camp: left the shelter");
    }
    unseal(tick) {
        const cell = this.escapeSeal;
        if (!this.sim.isValid) { this.escapeSeal = undefined; return false; }
        const b = this.terrain.block(cell);
        if (!b) { this.reason = "Waiting to reopen the camp shelter (area not loaded)."; return true; }
        if (b.isAir) { this.escapeSeal = undefined; this.swingCell = undefined; this.stopActions(); this.lastBranch = ""; this.record("camp: shelter opened"); return false; }
        if (tick - this.sealSince > 400 || b.isLiquid) { this.escapeSeal = undefined; this.blockTask("Sealed in and the wall no longer opens; needs help.", "manual"); return true; }
        this.state = "camp"; this.reason = "Opening the camp shelter again."; this.nav.reset();
        const r = this.swing(cell, tick);
        if (r === "no-tool" || r === "unreachable") { this.escapeSeal = undefined; this.blockTask("Sealed in: " + this.lastDigReason, "manual"); }
        return true;
    }
    startRecover() {
        const grave = this.memory?.death();
        if (!grave) throw Error("No recorded death point.");
        if (this.sim.dimension.id !== grave.dim) throw Error(`Death point is in ${grave.dim}; dimension travel is not implemented yet.`);
        if (distance(this.sim.location, grave) > 256) throw Error("Death point is more than 256 blocks away; travel near it first (the scripted route only crosses loaded terrain).");
        if (system.currentTick - grave.t > 6000) this.tell("Note: dropped items despawn after about five minutes; they may already be gone.");
        this.setMode("recover"); this.recoverTarget = grave; this.recoverSince = 0; this.recoverSeen = 0; this.recoverPush = 0;
    }
    recover(tick) {
        const grave = this.recoverTarget;
        if (!grave) return;
        if (this.bag.container.emptySlotsCount < 1) { this.blockTask("Inventory full; deposit before continuing recovery.", "manual"); return; }
        const drops = this.sim.dimension.getEntities({ type: "minecraft:item", location: { x: grave.x, y: grave.y, z: grave.z }, maxDistance: 12 }).filter((e) => e.isValid);
        if (drops.length) {
            this.recoverSeen++; this.recoverSince = tick;
            drops.sort((a, b) => distance(a.location, this.sim.location) - distance(b.location, this.sim.location));
            const near = drops[0];
            if (distance(near.location, this.sim.location) > 1.2) {
                this.reason = `Recovering drops: ${drops.length} within range of the death point.`;
                const r = this.navTo(near.location, tick, 1);
                if (r === "failed" || r === "blocked") {
                    this.nav.reset();
                    if (distance(near.location, this.sim.location) <= 12 && this.recoverPush++ < 240) this.drops.pushToward(near.location);
                    else { this.blockTask("Cannot reach the drops: " + this.nav.reason, "retry"); this.recoverPush = 0; }
                } else this.recoverPush = 0;
            } else { this.reason = `Picking up drops: ${drops.length} within range.`; }
            return;
        }
        if (this.recoverSince && tick - this.recoverSince < 60) { this.reason = "Sweeping the death point for remaining drops."; return; }
        const found = this.recoverSeen > 0;
        this.memory?.clearDeath(); this.recoverTarget = undefined;
        if (this.postDeath) { this.tell(found ? "Recovered what drops remained." : "No drops remained at the death point."); this.resumePlan(tick); return; }
        this.stop(found ? "Death point swept; drops collected (what remains may have despawned)." : "No drops remained at the death point."); this.tell(this.reason);
    }
    attach(sim) {
        this.sim = sim; this.bag = new Bag(sim); this.terrain = new Terrain(sim.dimension); this.nav = new Navigator(sim, this.host, this.terrain);
        this.escaper = new Escaper(this); this.miner = new Miner(this); this.drops = new Drops(this); this.scout = new Scout(this); this.hands = new Hands(this); this.equipment = new Equipment(sim, this.bag); this.autonomy = new SurvivalDirector(this);
        this.builder = new Builder(this); this.combat = new Combat(this); this.looting = new Looting(this); this.parkour = new Parkour(this); this.deepMiner = new DeepMiner(this); this.resource = new ResourceManager(this); this.speedrun = new SpeedrunDirector(this);
        this.nav.builder = this.builder; this.threat = undefined; this.boatTrip = undefined; this.swingCell = undefined; this.grab = undefined;
    }
    aliveSim() {
        const hp = (e) => { try { return e.getComponent(EntityComponentTypes.Health)?.currentValue ?? 0; } catch { return 0; } };
        try { if (this.sim.isValid && hp(this.sim) > 0) return this.sim; } catch {}
        try { const byId = world.getEntity(this.sim.id); if (byId?.isValid && byId.typeId === "minecraft:player" && hp(byId) > 0) return byId; } catch {}
        try { const found = world.getAllPlayers().find((q) => q.name === this.ownerName && q.hasTag("verdant.bot") && hp(q) > 0); if (found?.isValid) return found; } catch {}
        return undefined;
    }
    deadTick(tick) {
        if (!this.deadSince) this.deadSince = tick;
        if (tick - this.deadSince < 40) return;
        if (!this.respawnTried) {
            this.respawnTried = true; let ok = false;
            try { if (typeof this.sim.respawn === "function") { this.sim.respawn(); ok = true; this.tell("Respawning automatically; the death point is remembered."); } } catch (e) { this.record("respawn failed: " + String(e).slice(0, 120)); }
            if (!ok) { this.state = "deadFailed"; this.reason = "Auto-respawn is not available in this build; use !bot spawn. Death point is remembered."; this.tell(this.reason); return; }
        }
        const back = this.aliveSim();
        if (back) { this.attach(back); this.deadSince = 0; this.respawnTried = false; this.state = "idle"; this.respawned(tick); return; }
        if (tick - this.deadSince > 200) { this.state = "deadFailed"; this.deadSince = 0; this.reason = "Respawn did not complete; use !bot spawn. Death point is remembered."; this.tell(this.reason); }
    }
    respawned(tick) {
        try { this.stopActions(); } catch {}
        this.blocked = undefined; this.paused = false; this.escapeSeal = undefined; this.nav.reset(); this.escaper.reset(); this.recentAttacker = undefined; this.lastBranch = "";
        const grave = this.memory?.death(); const here = this.sim.location;
        if (grave && grave.dim === this.sim.dimension.id && distance(here, grave) <= 256) { this.tell("Respawned. Returning to the death point for the drops."); this.startRecover(); return; }
        if (grave) { this.tell("Respawned. The death point is " + (grave.dim !== this.sim.dimension.id ? "in another dimension" : `${Math.round(distance(here, grave))} blocks away`) + "; cannot fetch those drops from here."); } else this.tell("Respawned.");
        this.resumePlan(tick);
    }
    resumePlan(tick) {
        const plan = this.postDeath; this.postDeath = undefined;
        if (plan && this.restore(plan)) { this.tell("Back to the interrupted task."); return; }
        this.setMode("idle"); this.reason = "Respawned; awaiting orders."; void tick;
    }
    restore(plan) {
        const mode = plan?.mode;
        if (!mode || mode === "idle" || mode === "dead" || mode === "loot") return false;
        if (mode === "mine") { if (!plan.mine || !MINE[plan.mine.block]) return false; this.startMine(plan.mine.block, plan.mine.count); return true; }
        if (mode === "recover") { if (!plan.recover?.target) return false; this.setMode("recover"); this.recoverTarget = { ...plan.recover.target }; this.recoverSince = plan.recover.since ?? 0; this.recoverSeen = plan.recover.seen ?? 0; return true; }
        if (!["follow", "guard", "goto", "collect", "survival", "starter", "speedrun"].includes(mode)) return false;
        if (mode === "goto" && !plan.goal) return false;
        this.setMode(mode, plan.goal);
        if (mode === "guard" && plan.anchor) this.anchor = { ...plan.anchor };
        return true;
    }
    minePlan() {
        if (!this.mineRequest) return undefined;
        const left = (this.mining?.amount ?? this.mineRequest.count) - (this.mining?.broken ?? 0);
        return { block: this.mineRequest.block, count: Math.max(1, left) };
    }
    maybeLoot(tick) {
        if (!this.settings.loot || this.mode === "loot" || this.miner.active || this.deepMiner.active) return false;
        if (!["goto", "follow", "survival", "recover", "collect", "idle", "speedrun"].includes(this.mode)) return false;
        if (this.sim.isInWater) return false;
        if (this.bag.container.emptySlotsCount < 2) return false;
        if (tick - this.lootScan < 40) return false;
        this.lootScan = tick;
        if (this.mode === "follow") { const o = this.owner(); if (o && distance(o.location, this.sim.location) <= 24) return false; }
        const home = this.memory?.home();
        for (const spot of this.terrain.storeNear(this.sim.location, 14, tick)) {
            if ((this.lootIgnore.get(key(spot)) ?? 0) > tick) continue;
            if (home && distance(spot, home) < 48) continue;
            this.startLoot(spot, tick); return true;
        }
        return false;
    }
    startLoot(spot, tick) {
        this.lootReturn = {
            mode: this.mode, goal: this.goal ? { ...this.goal } : undefined, mine: this.minePlan(),
            anchor: this.anchor ? { ...this.anchor } : undefined,
            recover: this.recoverTarget ? { target: { ...this.recoverTarget }, since: this.recoverSince, seen: this.recoverSeen } : undefined,
        };
        this.setMode("loot"); this.lootState = { target: { ...spot }, since: tick, tries: 0, opened: false, moved: 0, merged: 0 };
        this.tell("Found a container nearby; looting it on the way.");
    }
    loot(tick) {
        const s = this.lootState;
        const block = s ? this.terrain.block(s.target) : undefined;
        const still = block && (block.typeId === "minecraft:chest" || block.typeId === "minecraft:barrel" || block.typeId === "minecraft:trapped_chest" || block.typeId.includes("shulker"));
        if (!s || !still) { this.finishLoot(tick, "Container gone; back to the road."); return; }
        if (this.bag.container.emptySlotsCount < 1) { this.finishLoot(tick, "Inventory full; back to the road."); return; }
        const d = distance(this.sim.location, center(s.target));
        if (d > 3.6) {
            const r = this.navTo(center(s.target), tick, 3);
            if (r === "blocked" || r === "failed") {
                if (++s.tries > 3) { this.finishLoot(tick, "Could not reach the container; back to the road."); return; }
                this.reason = "Looting: finding a way to the container."; return;
            }
            this.reason = "Looting: walking to a container."; return;
        }
        this.nav.reset();
        try {
            const inv = block.getComponent("minecraft:inventory")?.container;
            if (!inv) throw Error("no inventory component");
            const chest = new NativeInventory(inv);
            const first = this.bag.withdraw(chest, (item) => VALUABLE.test(item.typeId), 4);
            const rest = this.bag.withdraw(chest, () => true, 4);
            s.moved += first.moved + rest.moved; s.merged += first.merged + rest.merged;
        } catch (e) { this.record("loot failed: " + String(e).slice(0, 120)); this.finishLoot(tick, "Container refused the transfer; back to the road."); return; }
        s.opened = true; this.memory?.notice("chest", { ...s.target }, this.sim.dimension.id, tick);
        const n = s.moved + s.merged;
        this.finishLoot(tick, n > 0 ? `Looted a container: ${n} stack move(s).` : "The container was already empty.");
    }
    finishLoot(tick, label) {
        const r = this.lootReturn; const s = this.lootState;
        this.lootReturn = undefined; this.lootState = undefined;
        if (s?.target && (!s.opened || !(s.moved + s.merged))) this.lootIgnore.set(key(s.target), tick + 12000);
        this.record("loot: " + ((s?.moved ?? 0) + (s?.merged ?? 0)) + " moved"); this.reason = label;
        if (!this.restore(r)) { this.setMode("idle"); this.reason = label + " Idle."; return; }
        this.tell(label + " Back to " + this.mode + ".");
    }
    boatTravel(tick) {
        const t = this.boatTrip;
        const target = this.mode === "goto" ? this.goal : this.mode === "follow" ? this.owner()?.location : this.mode === "recover" ? this.recoverTarget : this.mode === "collect" ? this.goal?.anchor : undefined;
        if (!this.settings.boat || !target || this.miner.active || this.deepMiner.active) { if (t) this.abortBoat("Water route over; continuing on foot."); return false; }
        if (!t) {
            if (this.boatIgnore > tick || tick % 20 !== 0) return false;
            const cell = this.waterAhead(target);
            if (!cell) return false;
            this.boatTrip = { phase: "board", since: tick, progressTick: tick, lastPos: { ...this.sim.location }, water: cell, impulse: false, told: false, };
        }
        const s = this.boatTrip;
        if (tick - s.since > 1800) { this.abortBoat("Boat crossing timed out; swimming instead."); return false; }
        const boat = this.ridingBoat();
        if (!boat) {
            if (!s.told) { s.told = true; this.tell("Open water ahead; crossing by boat."); }
            const r = this.boardBoat(tick);
            if (r === "boarded") { s.lastPos = { ...this.sim.location }; s.progressTick = tick; return true; }
            if (r === "waiting") return true;
            this.boatIgnore = tick + 1200; this.abortBoat("No boat available; swimming instead."); return false;
        }
        if (!this.sim.isInWater && this.onGround(boat)) {
            const aheadWater = this.waterAt(this.sim.location, target);
            if (!aheadWater) { this.abortBoat("Ashore after the crossing."); return false; }
        }
        if (tick - s.progressTick > 60 && distance(this.sim.location, s.lastPos) < 3) {
            if (!s.impulse) { s.impulse = true; s.progressTick = tick; s.lastPos = { ...this.sim.location }; this.tell("Steering is not moving the boat; trying paddle impulses."); }
            else { this.boatIgnore = tick + 1200; this.abortBoat("The boat is not getting anywhere; swimming instead."); return false; }
        }
        if (distance(this.sim.location, s.lastPos) > 3) { s.progressTick = tick; s.lastPos = { ...this.sim.location }; }
        if (s.impulse) {
            const dir = { x: target.x - this.sim.location.x, z: target.z - this.sim.location.z, };
            const len = Math.max(1, Math.hypot(dir.x, dir.z));
            if (tick % 5 === 0) {
                try { boat.applyImpulse({ x: (dir.x / len) * 0.15, y: 0.02, z: (dir.z / len) * 0.15 }); } catch { this.boatIgnore = tick + 1200; this.abortBoat("The engine refused boat impulses; swimming instead."); return false; }
            }
        } else { this.sim.moveToLocation(this.host.relative({ x: target.x, y: this.sim.location.y, z: target.z }), { faceTarget: true }); }
        this.reason = "Crossing open water by boat."; return true;
    }
    waterAhead(target) {
        const p = floor(this.sim.location);
        const dx = target.x - this.sim.location.x, dz = target.z - this.sim.location.z;
        const len = Math.hypot(dx, dz);
        if (len < 8) return undefined;
        const ux = dx / len, uz = dz / len;
        let water = 0, first;
        for (const n of [2, 4, 6, 8, 10, 12]) {
            const q = { x: Math.floor(p.x + ux * n), y: p.y, z: Math.floor(p.z + uz * n) };
            const hit = this.waterAt(q);
            if (hit) { water++; first ??= hit; }
        }
        return water >= 4 ? first : undefined;
    }
    waterAt(p) {
        for (const y of [p.y, p.y - 1]) {
            const b = this.terrain.block({ x: p.x, y, z: p.z });
            if (b && b.isLiquid && /water/.test(b.typeId)) return { x: p.x, y, z: p.z };
        }
        return undefined;
    }
    ridingBoat() {
        try { const ride = this.sim.getComponent("minecraft:riding")?.entityRidingOn; if (ride?.isValid && ride.typeId.endsWith("_boat")) return ride; } catch {}
        return undefined;
    }
    onGround(boat) { try { return this.sim.isOnGround || (boat?.isOnGround ?? false); } catch { return false; } }
    boardBoat(tick) {
        const existing = this.escaper.findBoat();
        if (existing) { if (this.escaper.mount(existing)) { this.reason = "Boarding a boat for the crossing."; return "boarded"; } return "waiting"; }
        let slot = this.bag.find((s) => s.typeId.endsWith("_boat"));
        if (slot < 0) {
            if (!this.settings.assistedCrafting) return "none";
            try { this.craft("minecraft:oak_boat", 1); } catch { return "none"; }
            slot = this.bag.find((s) => s.typeId.endsWith("_boat"));
            if (slot < 0) return "none";
        }
        const water = this.waterAt(this.sim.location) ?? this.waterAt(floor(this.sim.location));
        const cell = water ?? this.boatTrip?.water;
        if (!cell) return "none";
        const selected = this.bag.select(slot);
        try {
            this.sim.lookAtBlock(this.host.relative(center(cell)));
            this.sim.useItemInSlot(selected);
            this.reason = "Floating a boat for the crossing.";
            if (tick - this.boatTrip.since > 120) return "none";
            return "waiting";
        } catch { return "none"; }
    }
    abortBoat(reason) {
        const boat = this.ridingBoat();
        if (boat) {
            try { const rideable = boat.getComponent("minecraft:rideable"); if (rideable?.ejectRider) rideable.ejectRider(this.sim); else if (rideable?.ejectRiders) rideable.ejectRiders(); } catch {}
        }
        this.boatTrip = undefined; this.reason = reason; this.record("boat: " + reason);
    }
    startGolem() {
        const golem = this.nearestGolem();
        if (!golem) throw Error("No iron golem within 24 blocks.");
        if (this.bag.weapon() < 0) throw Error("A sword or axe is required to fight a golem.");
        this.setMode("golem"); this.golemRun = { since: system.currentTick, lastHit: 0, backoffUntil: 0, hits: 0, lastPos: undefined };
        this.tell("Engaging the iron golem: hit, then step away before it can swing.");
    }
    nearestGolem() {
        try {
            return this.sim.dimension.getEntities({ type: "minecraft:iron_golem", location: this.sim.location, maxDistance: 24 }).filter((e) => e.isValid && distance(e.location, this.sim.location) <= 24).sort((a, b) => distance(a.location, this.sim.location) - distance(b.location, this.sim.location))[0];
        } catch { return undefined; }
    }
    golemTick(tick) {
        const run = this.golemRun ?? (this.golemRun = { since: tick, lastHit: 0, backoffUntil: 0, hits: 0 });
        const hp = this.sim.getComponent(EntityComponentTypes.Health)?.currentValue ?? 20;
        const golem = this.nearestGolem();
        if (!golem) {
            const pos = run.lastPos; this.golemRun = undefined;
            if (pos && distance(this.sim.location, pos) < 20) { this.tell("Golem down; sweeping its drops."); this.setMode("collect", { anchor: { ...pos }, radius: 8 }); }
            else { this.stop("Golem gone."); this.tell(this.reason); }
            return;
        }
        run.lastPos = { ...golem.location };
        if (tick - run.since > 2400) { this.golemRun = undefined; this.blockTask("Golem fight timed out; it is still alive.", "retry"); return; }
        if (hp <= 8) { this.golemRun = undefined; this.blockTask("Too hurt to keep fighting the golem; broke off.", "retry"); return; }
        const d = distance(this.sim.location, golem.location);
        if (run.backoffUntil > tick) {
            this.reason = "Golem: hit, then stepping out of reach.";
            if (d < 3.4) {
                const p = floor(this.sim.location); const dir = away(p, floor(golem.location)); const spot = this.terrain.groundNear(p.x + dir.x * 3, p.z + dir.z * 3, p.y, 2);
                if (spot && !this.terrain.dangerous(spot) && distance(spot, golem.location) > d) { this.nav.urgent = true; this.navTo(center(spot), tick, 1); } else this.nav.reset();
            } else this.nav.reset();
            return;
        }
        if (hp <= 12 && d <= 3) { this.reason = "Golem: backing off to recover."; run.backoffUntil = tick + 40; return; }
        if (d > 2.6) {
            this.nav.urgent = true; const r = this.navTo(golem.location, tick, 2.2); this.reason = "Golem: closing in.";
            if (r === "failed" || r === "blocked") { this.golemRun = undefined; this.blockTask("Cannot reach the golem honestly: " + this.nav.reason, "retry"); }
            return;
        }
        this.nav.reset(); if (tick - run.lastHit < 14) return;
        if (!this.terrain.line(this.sim.getHeadLocation(), golem.getHeadLocation())) return;
        this.bag.weapon(); this.sim.lookAtEntity(golem); this.sim.attackEntity(golem); run.lastHit = tick; run.hits++; run.backoffUntil = tick + 28;
    }
    home() { return this.memory?.home() ?? this.anchor ?? this.sim.location; }
    cancelWork() { this.stopActions(); this.mining = undefined; this.workKey = ""; this.explorer.reset(); }
    obtain(target, amount, tick) {
        if (!this.settings.assistedCrafting) { this.blockTask("Assisted crafting must be enabled for autonomous dependencies."); return false; }
        const work = target + ":" + amount;
        if (this.workKey !== work) { this.cancelWork(); this.workKey = work; }
        if (this.pendingTable) {
            if (this.terrain.block(this.pendingTable.p)?.typeId === id("crafting_table")) { this.tablePosition = { ...this.pendingTable.p }; this.pendingTable = undefined; }
            else if (tick - this.pendingTable.tick > 30) { this.pendingTable = undefined; this.blockTask("Table placement not observed. Inspect location/item before resuming."); }
            return false;
        }
        if (amountOf(this.bag.usableCounts(), target) >= amount) { this.cancelWork(); return true; }
        if (this.mining) { if (this.mine(this.mining, tick)) { this.mining = undefined; this.stopActions(); } return false; }
        const nearTable = this.terrain.tableNear(this.sim.location);
        const tableBlock = this.tablePosition ? this.terrain.block(this.tablePosition) : undefined;
        if (tableBlock && tableBlock.typeId !== id("crafting_table")) this.tablePosition = undefined;
        const step = nextStep(target, amount, this.bag.usableCounts(), nearTable || !!this.tablePosition);
        if (step.kind === "craft" && RECIPES.find((r) => r.output === step.item)?.table && !nearTable && this.tablePosition) {
            const spots = CARDINAL.map((d) => add(this.tablePosition, d));
            const chosen = spots.find((p) => this.terrain.safe(p)) ?? spots[0];
            if (this.nav.go(center(chosen), tick) !== "failed") { this.reason = "Returning to remembered crafting table"; return false; }
            if (++this.stationTrips < 3) return false;
            this.tablePosition = undefined; return false;
        }
        this.reason = `Obtaining ${amount} ${target}: ${step.kind}`;
        switch (step.kind) {
            case "done": return true;
            case "blocked": this.blockTask(step.reason); break;
            case "gather": this.mining = this.newMining(step.count, undefined, step.item); break;
            case "craft": this.craft(step.item); break;
            case "placeTable": this.placeTable(tick); break;
        }
        return false;
    }
    starter(tick) {
        const milestones = ["stone_pickaxe", "stone_sword", "furnace"];
        if (this.stage >= milestones.length) {
            if (this.thenAuto) { this.thenAuto = false; this.setMode("survival"); this.tell("Starter kit complete; continuing with autonomous survival."); return; }
            this.stop("Local starter kit complete. Use auto for continuing survival progression."); return;
        }
        if (this.obtain(id(milestones[this.stage]), 1, tick)) { this.tell("Milestone: " + milestones[this.stage]); this.stage++; }
    }
    placeTable(tick) {
        const base = floor(this.sim.location);
        const p = CARDINAL.map((d) => add(base, { x: d.x * 2, y: 0, z: d.z * 2 })).find((q) => this.terrain.safe(q) && this.terrain.line(this.sim.getHeadLocation(), add(q, { x: 0.5, y: -0.01, z: 0.5 }), add(q, { x: 0, y: -1, z: 0 })));
        if (!p) { this.blockTask("No safe place for a table; place one manually within 3 blocks."); return; }
        const slot = this.bag.select(this.bag.find((s) => s.typeId === id("crafting_table")));
        const ground = add(p, { x: 0, y: -1, z: 0 });
        this.sim.lookAtBlock(this.host.relative(ground));
        if (!this.sim.useItemInSlotOnBlock(slot, this.host.relative(ground))) { this.blockTask("Table placement rejected."); return; }
        this.pendingTable = { p, tick };
    }
    mission() {
        const at = (p) => `(${Math.round(p.x)}, ${Math.round(p.y)}, ${Math.round(p.z)})`;
        const dist = (p) => `${Math.round(distance(this.sim.location, p))} blocks away`;
        if (this.state === "dead") return "dead; waiting to respawn";
        switch (this.mode) {
            case "mine": { const done = this.mining?.broken ?? 0; const target = this.mining?.amount ?? this.mineRequest?.count ?? "?"; return `mining ${done}/${target} ${id(this.mineRequest?.block ?? "")}`.trim(); }
            case "follow": { const o = this.owner(); return o ? `following ${this.ownerName} (${Math.round(distance(o.location, this.sim.location))} blocks)` : `following ${this.ownerName} (offline)`; }
            case "guard": return this.anchor ? `guarding ${at(this.anchor)}` : "guarding";
            case "goto": return this.goal ? `travelling to ${at(this.goal)} (${dist(this.goal)})` : "travelling to coordinates";
            case "collect": return this.goal ? `sweeping drops within ${this.goal.radius ?? 12} blocks of ${at(this.goal.anchor ?? this.anchor)}` : "sweeping loose drops";
            case "recover": return this.recoverTarget ? `recovering drops at ${at(this.recoverTarget)} (${dist(this.recoverTarget)})` : "recovering drops";
            case "starter": return `early-game bootstrap: stage ${Math.min(this.stage + 1, 3)}/3` + (this.thenAuto ? ", then auto survival" : "");
            case "loot": return this.lootState ? `looting a container at ${at(this.lootState.target)}` : "looting a container";
            case "golem": return "fighting an iron golem";
            case "survival": return "autonomous survival (gathering, mining, exploring)";
            case "speedrun": return `speedrun ${this.speedrun.status().phase} - ${this.speedrun.status().subPhase}`;
        }
        if (this.paused) return this.mode === "idle" ? "idle, paused" : `${this.mode}, paused`;
        return this.mode;
    }
    status() {
        const hp = this.sim.getComponent(EntityComponentTypes.Health)?.currentValue;
        return {
            version: 5,
            blocked: this.blocked,
            equipment: this.equipment.report(),
            autonomy: this.autonomy.status(),
            speedrun: this.speedrun.status(),
            navigation: { segments: this.nav.segments, expansions: this.nav.expansions, blockReads: this.terrain.reads, cacheHits: this.terrain.hits, },
            exploration: { areas: this.explorer.trips, range: this.settings.range },
            owner: this.ownerName, mode: this.mode, mission: this.mission(), paused: this.paused, state: this.state,
            escape: this.escaper.active ? this.escaper.mode : undefined, camp: this.campState?.stage, threat: this.threat?.typeId, reason: this.reason, health: hp,
            position: this.sim.location, dimension: this.sim.dimension.id, settings: this.settings, inventory: this.bag.counts(), memory: this.memory?.summary(),
            uptimeTicks: system.currentTick - this.startedTick, stage: this.stage, events: this.log,
            advanced: { deepMining: this.deepMiner.active ? this.deepMiner.phase : "inactive", lootingTrips: this.looting.trips, builder: this.builder.canBuild ? "ready" : "no-blocks" }
        };
    }
    save() {
        try {
            this.memory?.rememberPrefs(this.settings); this.memory?.flush();
            world.setDynamicProperty("verdant:journal", JSON.stringify(this.status()));
        } catch (e) { console.warn("[Verdant] Journal failed: " + e); }
    }
}
