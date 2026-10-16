import { Arbiter, TaskFault, blockedTask } from "../core/arbiter.js";
import { needsQuickTool } from "../core/combat.js";
import { retainScore } from "../core/knowledge.js";
import { CARDINAL, COMPASS, DOWN, UP, add, away, center, distance, floor, horizontal, key } from "../core/math.js";
import { sanitizePrefs } from "../core/memory.js";
import { analyzeRequirements, decomposeMission } from "../core/progression.js";
import { RECIPES, amountOf, bedTarget, craft, id, isAnyLog, matches, nextStep } from "../core/recipes.js";
import { assessFoodReserves, reassessAfterDamage } from "../core/survival.js";
import { HOSTILES as MOB_DEFENCE, MINE, RANGED, diggable, isBulk, isPassable, isUnbreakable, isUndergroundOre, priority, toolTier } from "../core/world.js";
import { Builder, Hands } from "./builder.js";
import { Combat } from "./combat.js";
import { Equipment } from "./equipment.js";
import { Escaper } from "./escape.js";
import { Bag, NativeInventory, ResourceManager } from "./inventory.js";
import { Drops, Looting } from "./looting.js";
import { DeepMiner, Miner } from "./mining.js";
import { Navigator, Parkour } from "./navigation.js";
import { BucketDirector, NetherDirector } from "./nether.js";
import { Explorer, Scout } from "./scouting.js";
import { SpeedrunDirector } from "./speedrun.js";
import { SurvivalMaster } from "./survival-master.js";
import { FoodDirector, SurvivalDirector } from "./survival.js";
import { UI } from "./ui.js";
import { GolemDirector, VillageDirector } from "./village.js";
import { StructureDetector, WorldAwareness } from "./world-awareness.js";
import { BlockScan, Terrain, findBoat, isBoatEntity } from "./world.js";
import { Direction, EntityComponentTypes, system, world } from "@minecraft/server";
import { SkillRunner } from "./skill-runtime.js";
import { Rng, mix } from "../core/rng.js";
// New advanced modules

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
/** Tree-log neighbourhood, nearest first (dx,dz in -2..2, dy in -1..4). */
const LOG_OFFSETS = (() => {
    const out = [];
    for (let dx = -2; dx <= 2; dx++) for (let dy = -1; dy <= 4; dy++) for (let dz = -2; dz <= 2; dz++)
        if (dx || dy || dz) out.push({ x: dx, y: dy, z: dz });
    return out.sort((a, b) => (a.x * a.x + a.y * a.y + a.z * a.z) - (b.x * b.x + b.y * b.y + b.z * b.z));
})();
/** Cells probed around a navigation goal, deduplicated once at load. */
const NAV_OFFSETS = (() => {
    const raw = [{ x: 0, y: 0, z: 0 }, ...COMPASS, ...COMPASS.map((d) => ({ x: d.x * 2, y: 0, z: d.z * 2 })), ...CARDINAL.map((d) => ({ x: d.x, y: -1, z: d.z })), { x: 0, y: 1, z: 0 }, { x: 0, y: -1, z: 0 }];
    const seen = new Set();
    return raw.filter((d) => { const k = key(d); if (seen.has(k)) return false; seen.add(k); return true; });
})();
const BLOCKED_TTL = 1800;
const VALUABLE = /^minecraft:(diamond|emerald|netherite|.*_ingot|.*enchanted_book|golden_apple|enchanted_golden_apple|totem_of_undying|heart_of_the_sea|nautilus_shell|.*_horse_armor|saddle|name_tag|.*_bucket|.*_smithing_template|.*_armor_trim|music_disc_.*|.*_spawn_egg|.*_shulker_box|ancient_debris|obsidian|ender_pearl|blaze_rod|ender_eye|elytra|trident|.*_bed|.*_wool)/;
// UNBREAKABLE WOOD: any log/wood/stem is acceptable for wood needs
const ANY_WOOD = /(_log|_wood|_stem|_hyphae|bamboo_block)/;
function isAnyWood(type) { return ANY_WOOD.test(type); }
function isWoodRequest(block) { return block && (block === "#logs" || block.endsWith("_log") || block.endsWith("_wood") || block.includes("_stem") || block === "minecraft:bamboo"); }

function wrapSim(sim) {
    if (!sim || sim._verdantWrapped) return sim;
    try { sim._verdantWrapped = true; } catch {}
    const methods = [
        "lookAtBlock",
        "lookAtLocation",
        "lookAtEntity",
        "moveToLocation",
        "moveToBlock",
        "breakBlock",
        "interactWithBlock",
        "useItemOnBlock",
        "attackEntity",
    ];
    for (const m of methods) {
        try {
            const orig = sim[m];
            if (typeof orig === "function") {
                sim[m] = function(...args) {
                    try {
                        return orig.apply(this, args);
                    } catch (err) {
                        return false;
                    }
                };
            }
        } catch {}
    }
    return sim;
}

export class Bot {
    constructor(sim, ownerName, host, memory) {
        this.sim = wrapSim(sim);
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
            autoSurvival: false,
            // Skill system (scripts/skills). "legacy" keeps the original tick
            // loop as the brain; "skills" hands the tick to the skill scheduler.
            // `!bot engine skills|legacy` switches, and the choice persists.
            engine: "legacy",
            skills: false,
            pvp: false,
        };
        /** Extra state for the skill runtime (built lazily on first use). */
        this.skills = undefined;
        this.skillRequest = null;
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
        this.terrain.clock = () => system.currentTick;
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
        this.awareness = new WorldAwareness(this);
        this.structures = new StructureDetector(this);
        this.survivalMaster = new SurvivalMaster(this);
        this.nether = new NetherDirector(this);
        this.village = new VillageDirector(this);
        this.golem = new GolemDirector(this);
        this.food = new FoodDirector(this);
        this.bucket = new BucketDirector(this);
        this.ui = new UI(this);
        this.arbiter = new Arbiter(this);
        this.goalTree = null;
        this.currentGoal = null;
        this.nav.builder = this.builder;
        // Escaper is built before the Builder exists, so wire it here (without
        // this the escape walls/bunkers silently never get built).
        this.escaper.builder = this.builder;
        // Enhanced mining state
        this.obstructionClear = undefined;
        this.scaffoldState = undefined;
        this.lastTorchPlace = 0;
        this.mineStuckSince = 0;
        this.mineRetries = 0;
        this.lastQuickToolCheck = 0;
        this.deathRecovery = undefined;
        this.upskillPhase = "wood";
        this.retainCache = new Map();
        this.lastFoodCheck = 0;
        this.lastDamageTick = 0;
        this.previousHealth = 20;
        this.previousThreatCount = 0;
        this.faultResumeAt = 0;
        this.lastErrorTick = 0;
        sim.addTag("verdant.bot");
        this.record("spawned advanced bot v2.0 nether speedrun world-class");
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
        try { this.sim.stopBreakingBlock(); } catch (_e) { this.fault(_e); }
        try { this.sim.stopUsingItem(); } catch (_e) { this.fault(_e); }
        try { this.sim.stopInteracting(); } catch (_e) { this.fault(_e); }
        try { this.sim.isSneaking = false; } catch (_e) { this.fault(_e); }
        this.swingCell = undefined;
        this.grab = undefined;
        this.retreatGoal = undefined;
        this.obstructionClear = undefined;
        this.scaffoldState = undefined;
        if (this.mining) this.mining.breakingSince = undefined;
    }
    dangerThreat() { return this.threat; }
    retainImportant() {
        // Retain important stuff: iron ore, diamond, obsidian, etc - never drop critical
        const counts = this.bag.counts();
        const free = this.bag.container.emptySlotsCount;
        if (free > 2) return;
        // If inventory full, drop low-value first, keep critical
        const entries = Object.entries(counts).map(([type, count]) => ({ type, count, score: retainScore(type) }));
        entries.sort((a,b) => a.score - b.score); // low first
        for (const e of entries) {
            if (e.score < 20 && e.count > 0) {
                // Try to drop? Actually bot doesn't auto-drop, but we can tell
                // For now just record
                if (e.count > 16) this.record(`low value ${e.type} taking space, consider deposit`);
                break;
            }
        }
    }
    stop(reason = "Stopped by owner.") {
        this.stopActions();
        if (this.parkCamp()) this.tell("Shelter is still sealed; !bot resume opens it first.");
        this.escaper.reset();
        this.miner.reset();
        this.deepMiner.reset();
        this.builder.resetPillar?.();
        this.combat.reset();
        this.looting.reset();
        this.arbiter?.reset();
        this.awareness?.reset();
        this.structures?.reset();
        this.parkour?.reset();
        this.survivalMaster?.reset();
        this.nether?.reset?.(system.currentTick);
        this.village?.reset?.(system.currentTick);
        this.golem?.reset?.();
        this.food?.reset?.();
        this.bucket?.reset?.();
        this.blocked = undefined;
        this.recoveryAttempts = 0;
        this.mode = "idle";
        // ACTIVE IDLE: a finished task hands over to the guard/patrol watchdog instead of standing still.
        // Only a still-sealed emergency shelter keeps the bot held (resume opens it).
        this.paused = !!this.escapeSeal;
        this.pausedReason = this.escapeSeal ? "Shelter sealed; !bot resume opens it first." : "";
        this.mining = undefined;
        this.pendingTable = undefined;
        this.goal = undefined;
        this.recoverTarget = undefined;
        this.deathRecovery = undefined;
        this.state = this.paused ? "paused" : "idle";
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
        const why = String(reason);
        if (why.includes("LocationInUnloadedChunkError") || why.includes("not in a chunk currently loaded")) {
            this.record("Auto-recover: location in unloaded chunk, resuming safe navigation/survival");
            this.nav?.reset?.();
            if (this.mining) this.mining.target = undefined;
            if (this.explorer) this.explorer.reset?.();
            if (this.autonomy) this.autonomy.recover();
            this.stopActions();
            this.state = "idle";
            this.reason = "Repositioning from unloaded chunk boundary.";
            return;
        }
        // ULTRA AUTONOMY: never bother the player about wood types - any wood demand self-heals to #logs
        if ((why.includes("No acquisition skill") || why.includes("Missing ")) && /(#planks|#logs|bamboo|_planks|_log|_wood|_stem|_hyphae|oak)/.test(why)) {
            this.record("Auto-fix: wood-type blocked, falling back to #logs for autonomy");
            try { this.obtain("#logs", 8, system.currentTick); return; } catch (_e) { this.fault(_e); }
        }
        if (this.paused) { this.record("problem while paused: " + reason); return; }
        if (this.mode === "idle") {
            // No mission to hold: report honestly and stay watchful instead of freezing the watchdog.
            this.record("problem (idle): " + reason);
            const now = system.currentTick;
            const text = `Problem: ${reason} (idle) - staying watchful; defence stays active.`;
            const last = this.lastBlockedTell;
            if (!last || last.text !== text || now - last.tick > 12000) {
                this.lastBlockedTell = { text, tick: now };
                this.tell(text);
            }
            return;
        }
        if (this.blocked) { this.stopActions(); this.state = "blocked"; return; }
        this.stopActions();
        this.blocked = blockedTask(reason, recovery, ++this.recoveryAttempts, system.currentTick);
        this.state = "blocked";
        this.reason = reason;
        this.record("task blocked: " + reason);
        const retrying = this.blocked.retryAt !== undefined;
        const soon = (this.blocked.attempt ?? 1) <= 3;
        const text = `Problem: ${reason} (while ${this.mission()}). ` + (retrying
            ? (soon ? "Retrying shortly; defence stays active." : "Retrying periodically (about a minute); defence stays active.")
            : "Task needs attention; defence stays active.");
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
        this.pausedReason = reason;
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
        this.pausedReason = "";
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
        this.builder.resetPillar?.();
        this.arbiter?.reset();
        this.awareness?.reset();
        this.structures?.reset();
        this.parkour?.reset();
        this.survivalMaster?.reset();
        this.nether?.reset?.(system.currentTick);
        this.village?.reset?.(system.currentTick);
        this.golem?.reset?.();
        this.food?.reset?.();
        this.bucket?.reset?.();
        this.looting.reset();
        this.escapeAttempts = 0;
        this.fleeSince = 0;
        this.mining = undefined;
        this.pendingTable = undefined;
        this.recoverTarget = undefined;
        this.deathRecovery = undefined;
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
        this.progressSignature = totalItems(this.bag.counts());
        this.paused = false;
        this.pausedReason = "";
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
        this.lastQuickToolCheck = 0;
        this.upskillPhase = mode === "speedrun" ? "wood" : "wood";
        this.record(`mode:${mode}`);
    }
    startMine(block, amount) {
        if (!MINE[block]) throw Error("Unsupported block; see !bot help and docs/COMMANDS.md.");
        this.setMode("mine");
        this.mineRequest = { block, count: amount };
        this.mining = this.newMining(amount, block);
    }
    /**
     * Director-style mining: assign a task without leaving the current mode.
     * The main tick drives it centrally and the owning director (speedrun,
     * nether, bucket, survival-master) resumes the moment the quota is done.
     * Never clobbers a task that is already running.
     */
    assignMine(block, amount) {
        if (!MINE[block]) throw Error("Unsupported block; see !bot help and docs/COMMANDS.md.");
        if (this.mining) return;
        this.mineRequest = { block, count: amount };
        this.mining = this.newMining(amount, block);
    }
    newMining(amount, block, item) {
        // FIX: any log support - #logs means any tree log, fixes oak-only waste
        const woodLike = (v) => !!v && (v === "#logs" || v === "minecraft:bamboo" || v === "minecraft:bamboo_block" || v.endsWith("_log") || v.endsWith("_wood") || v.includes("_stem") || v.endsWith("_hyphae"));
        if (woodLike(block) || (!block && woodLike(item))) {
            block = "#logs";
            item = "#logs";
        }
        const drop = item ?? (block ? MINE[block]?.drops : undefined);
        const bulk = !!drop && isBulk(drop);
        // Track the concrete drop so quotas complete even when the deep miner does the
        // breaking (m.broken never counts deep-mined blocks - iron used to mine forever).
        if (!item && drop && !String(drop).startsWith("#")) item = drop;
        let underground = !!drop && (isUndergroundOre(drop) || bulk) && this.settings.deepMining && block !== "#logs";
        if (this.terrain && drop) {
            try {
                if (bulk) {
                    const nearStone = this.terrain.scanOres(this.sim.location, 16, (type) => type === "minecraft:stone" || type === "minecraft:cobblestone" || type === "minecraft:deepslate" || type === "minecraft:cobbled_deepslate", 150);
                    if (nearStone.length > 0) underground = false;
                } else if (isUndergroundOre(drop)) {
                    const nearOre = this.terrain.scanOres(this.sim.location, 16, (type) => {
                        const r = MINE[type];
                        return r && matches(r.drops, drop);
                    }, 150);
                    if (nearOre.length > 0) underground = false;
                }
            } catch (_) {}
        }
        const isWoodReq = block && (block === "#logs" || block.endsWith("_log") || block.endsWith("_wood") || block.includes("_stem"));
        return {
            amount, block, item, bulk, deepItem: drop, underground,
            startCount: amountOf(this.bag.counts(), drop),
            broken: 0, approachTry: 0,
            scan: new BlockScan(this.sim.location, underground ? 8 : 12),
            blocked: new Map(), loot: new Map(), lootSince: system.currentTick,
            noTargetSince: system.currentTick, failures: 0,
            treeMode: block === "#logs" || /(_log|_wood|_stem|_hyphae)$/.test(block ?? ""),
            cropMode: /(wheat|carrot|potato|beetroot|berry|melon|pumpkin|cactus|sugar_cane|kelp|bamboo|deadbush|dead_bush)/.test(block ?? ""),
            anyWood: isWoodReq, // UNBREAKABLE: accept any wood type
            desertFallback: isWoodReq, // also try dead bushes in desert
        };
    }
    pickaxeGuard(m) {
        // Never grind stone/ore bare-handed: if the task needs a pickaxe we lack, cancel
        // calmly and let obtain() plan the tool chain honestly (any wood works).
        const t = m.block ?? m.item;
        if (!t || t === "#logs" || String(t).startsWith("#")) return false;
        let rule;
        try { rule = MINE[t] ?? diggable(t); } catch { return false; }
        if (!rule || rule.tool !== "pickaxe" || !(rule.tier > 0)) return false;
        if (this.bag.tool("pickaxe", rule.tier)) return false;
        const tier = rule.tier;
        const pick = tier <= 1 ? "wooden_pickaxe" : tier === 2 ? "stone_pickaxe" : "iron_pickaxe";
        if (this.workKey !== `minecraft:${pick}:1`) this.reason = `Need ${pick} to mine ${t} - crafting the tool first, no bare-hand grinding`;
        this.cancelWork();
        try { this.obtain(`minecraft:${pick}`, 1, system.currentTick); } catch (_e) { this.fault(_e); }
        return true;
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
    /**
     * Start breaking `cell`. If the swing is absorbed by a solid block right in
     * front of the head - the classic "cannot mine the front block, it stops"
     * report - clear that one blocker and let the caller retry the real cell.
     * Only reacts on actual failure, and only when digging below the feet, so
     * shaft walls are never dug preemptively.
     */
    /**
     * Start breaking `cell`. If the swing is absorbed by a solid block in
     * front of the head/body, clear that front blocker first so reach succeeds.
     */
    breakThrough(cell) {
        try {
            const b = this.terrain.block(cell);
            if (b) {
                try {
                    const rule = MINE[b.typeId];
                    if (rule?.tool) this.bag.tool(rule.tool, rule.tier ?? 0);
                    else if (isAnyWood(b.typeId)) this.bag.tool("axe");
                } catch {}
            }
            const c = this.host.relative(center(cell));
            try { this.sim.lookAtBlock(c); } catch {}
            let started = false;
            try { started = this.sim.breakBlock(c); } catch { started = false; }
            if (started) return "digging";

            // Find blocker between head and cell (or front obstruction)
            const head = this.sim.getHeadLocation();
            const obs = this.terrain.findObstructions ? this.terrain.findObstructions(head, cell) : [];
            const candidates = obs.length ? obs : [this.terrain.headFrontObstruction ? this.terrain.headFrontObstruction(this.sim.location) : null].filter(Boolean);
            for (const blocker of candidates) {
                if (blocker.x === cell.x && blocker.y === cell.y && blocker.z === cell.z) continue;
                try {
                    const bb = this.terrain.block(blocker);
                    if (bb && !bb.isAir && !bb.isLiquid && !isUnbreakable(bb.typeId) && bb.typeId !== "minecraft:obsidian") {
                        const bc = this.host.relative(center(blocker));
                        try { this.sim.lookAtBlock(bc); } catch {}
                        try {
                            if (this.sim.breakBlock(bc)) {
                                this.lastDigReason = `Cleared front block ${bb.typeId} obstructing reach.`;
                                return "digging";
                            }
                        } catch (_e) { this.fault(_e); }
                    }
                } catch {}
            }
        } catch {
            return "blocked";
        }
        return "blocked";
    }

    /**
     * Upskill / craft a pickaxe of the requested tier on the spot.
     * Uses available raw materials and places a table if needed.
     */
    ensureMiningTool(tier, tick) {
        if (!this.bag) return false;
        if (this.bag.tool("pickaxe", tier)) return true;

        const counts = this.bag.counts();
        const cobbleCount = (counts["minecraft:cobblestone"] ?? 0) + (counts["minecraft:cobbled_deepslate"] ?? 0) + (counts["#cobble"] ?? 0);
        const ironCount = (counts["minecraft:iron_ingot"] ?? 0);

        const ensureSticks = (needed = 2) => {
            if ((this.bag.counts()["minecraft:stick"] ?? 0) >= needed) return true;
            if (amountOf(this.bag.counts(), "#planks") < 2 && amountOf(this.bag.counts(), "#logs") >= 1) {
                try {
                    const logSlot = this.bag.find(s => isAnyLog(s.typeId));
                    if (logSlot >= 0) {
                        const log = this.bag.get(logSlot);
                        const plankType = log.typeId.replace("_log", "_planks").replace("_wood", "_planks").replace("_stem", "_planks");
                        this.craft(plankType, 1);
                    }
                } catch (_) {}
            }
            if (amountOf(this.bag.counts(), "#planks") >= 2) {
                try { this.craft("minecraft:stick", 1); return true; } catch (_) {}
            }
            return (this.bag.counts()["minecraft:stick"] ?? 0) >= needed;
        };

        const ensureTable = () => {
            if (this.terrain.tableNear(this.sim.location)) return true;
            const tableSlot = this.bag.find(s => s.typeId === "minecraft:crafting_table");
            if (tableSlot >= 0) {
                const p = floor(this.sim.location);
                for (const d of CARDINAL) {
                    const spot = add(p, d);
                    if (this.terrain.block(spot)?.isAir && this.terrain.solid(add(spot, DOWN))) {
                        const res = this.builder.placeAt(spot, add(spot, DOWN), { autoAnchor: true, sneak: true, blockType: "minecraft:crafting_table" });
                        if (res === "placed") {
                            this.tablePosition = { ...spot };
                            return true;
                        }
                    }
                }
            } else if (amountOf(this.bag.counts(), "#planks") >= 4 || amountOf(this.bag.counts(), "#logs") >= 1) {
                if (amountOf(this.bag.counts(), "#planks") < 4) {
                    const logSlot = this.bag.find(s => isAnyLog(s.typeId));
                    if (logSlot >= 0) {
                        const log = this.bag.get(logSlot);
                        const plankType = log.typeId.replace("_log", "_planks").replace("_wood", "_planks").replace("_stem", "_planks");
                        try { this.craft(plankType, 1); } catch (_) {}
                    }
                }
                if (amountOf(this.bag.counts(), "#planks") >= 4) {
                    try { this.craft("minecraft:crafting_table", 1); return ensureTable(); } catch (_) {}
                }
            }
            return false;
        };

        if (tier >= 3 && ironCount >= 3) {
            ensureSticks(2);
            if (ensureTable()) {
                try {
                    this.craft("minecraft:iron_pickaxe", 1);
                    this.record("Upskilled: crafted iron pickaxe on the spot");
                    return !!this.bag.tool("pickaxe", 3);
                } catch (_) {}
            }
        }

        if (tier >= 2 && cobbleCount >= 3) {
            ensureSticks(2);
            if (ensureTable()) {
                try {
                    this.craft("minecraft:stone_pickaxe", 1);
                    this.record("Upskilled: crafted stone pickaxe on the spot");
                    return !!this.bag.tool("pickaxe", 2);
                } catch (_) {}
            }
        }

        if (tier >= 1 && (amountOf(this.bag.counts(), "#planks") >= 3 || amountOf(this.bag.counts(), "#logs") >= 1)) {
            ensureSticks(2);
            if (amountOf(this.bag.counts(), "#planks") < 3) {
                const logSlot = this.bag.find(s => isAnyLog(s.typeId));
                if (logSlot >= 0) {
                    const log = this.bag.get(logSlot);
                    const plankType = log.typeId.replace("_log", "_planks").replace("_wood", "_planks").replace("_stem", "_planks");
                    try { this.craft(plankType, 1); } catch (_) {}
                }
            }
            if (ensureTable()) {
                try {
                    this.craft("minecraft:wooden_pickaxe", 1);
                    this.record("Upskilled: crafted wooden pickaxe on the spot");
                    return !!this.bag.tool("pickaxe", 1);
                } catch (_) {}
            }
        }

        return false;
    }

    digCell(cell, tick) {
        const b = this.terrain.block(cell);
        if (!b || b.isAir) return "open";
        if (b.isLiquid) {
            if (this.builder && this.builder.countBlocks() > 0) {
                const res = this.builder.placeAt(cell, add(floor(this.sim.location), DOWN), { autoAnchor: true, sneak: true, allowHazard: true });
                if (res === "placed") return "open";
            }
            this.lastDigReason = "Refusing to dig a liquid.";
            return "refused";
        }
        if (this.terrain.lavaAt(add(cell, UP))) {
            this.lastDigReason = "Lava directly above; avoiding hazard.";
            return "lava";
        }
        const rule = MINE[b.typeId] ?? diggable(b.typeId);
        if (!rule) { this.lastDigReason = `Cannot break ${b.typeId}.`; return "no-tool"; }
        if (rule.tier > 0) {
            if (!this.bag.tool(rule.tool, rule.tier)) {
                if (rule.tool === "pickaxe" && this.ensureMiningTool(rule.tier, tick)) {
                    // Tool upskilled successfully
                } else {
                    this.lastDigReason = `Need a ${rule.tool} tier ${rule.tier} to dig ${b.typeId}.`;
                    return "no-tool";
                }
            }
        } else if (rule.tool === "axe") this.bag.tool("axe");
        else if (rule.tool === "shovel") this.bag.tool("shovel");
        if (this.breakThrough(cell) !== "digging") { this.lastDigReason = `${b.typeId} is out of reach.`; return "unreachable"; }
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
                    if (why) { this.record(why + " Climbed out; retrying robustly"); this.taskStart = tick; return "done"; }
                    return "done";
                }
                if (r === "stalled") { this.record("DeepMiner stalled: " + this.deepMiner.reason + ", retrying"); this.deepMiner.reset(); this.miner.reset(); return "done"; }
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
                if (why) { this.record(why + " Climbed out; retrying robustly"); this.taskStart = tick; return "done"; }
                return "done";
            }
            if (r === "stalled") { this.record("Miner stalled: " + this.miner.reason + ", retrying"); this.miner.reset(); return "done"; }
            return "continue";
        }
        if (met) return "done";
        if (!this.miner.active && !m.bulk && !m.underground && tick - m.noTargetSince < 400) return "fallthrough";

        // For deep ores (not surface/bulk stone), use deepMiner for branch mining
        if (m.underground && m.deepItem && !m.bulk && this.settings.deepMining) {
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
    /**
     * Record an error that used to be swallowed by an empty catch. The bot still keeps running
     * (these are optional directors), but the fault is counted, kept in a bounded table, and
     * surfaced in the journal on first occurrence and every 100th repeat.
     */
    fault(e) {
        const msg = String(e?.stack ?? e).split("\n").slice(0, 2).join(" @ ").slice(0, 160);
        const f = (this.faults ??= new Map());
        const rec = f.get(msg) ?? { n: 0, first: system.currentTick };
        rec.n++;
        rec.last = system.currentTick;
        if (!f.has(msg) && f.size >= 40) f.delete(f.keys().next().value);
        f.set(msg, rec);
        if (rec.n === 1 || rec.n % 100 === 0) {
            this.record(`fault x${rec.n}: ${msg}`);
            // Console output is expensive; the journal keeps every 100th, the console every 1000th.
            if (rec.n === 1 || rec.n % 1000 === 0) console.warn(`[Verdant] fault x${rec.n}: ${msg}`);
        }
    }
    faultReport() {
        return [...(this.faults ?? new Map()).entries()].map(([msg, r]) => ({ msg, count: r.n, last: r.last })).sort((x, y) => y.count - x.count).slice(0, 10);
    }
    tick() {
        const tick = system.currentTick;
        if (this.state === "dead") { this.deadTick(tick); return; }
        if (!this.sim.isValid) return;
        try { this.lastKnown = { p: { ...this.sim.location }, dim: this.sim.dimension.id }; } catch (_e) { this.fault(_e); }
        // Fall detection for survival master
        try {
            const curY = this.sim.location.y;
            const onGround = this.sim.isOnGround;
            if (!onGround && this.survivalMaster) {
                if (this.survivalMaster.fallStartY === null || this.survivalMaster.fallStartY === undefined) {
                    this.survivalMaster.fallStartY = curY;
                    this.survivalMaster.lastFallTick = tick;
                }
            } else if (onGround && this.survivalMaster && this.survivalMaster.fallStartY !== null) {
                // Landed, keep fallStartY for a bit to handle fall scenarios
                if (tick - this.survivalMaster.lastFallTick > 60) {
                    this.survivalMaster.fallStartY = null;
                }
            }
        } catch (_e) { this.fault(_e); }
        try { 
            if (this.usingSkills()) {
                // The skill scheduler owns the tick; the legacy brain stays
                // available for an instant fallback via `!bot engine legacy`.
                this.tickSkills(tick);
                this.errors = 0;
                this.lastErrorTick = 0;
                return;
            }
            this.think(tick); 
            this.errors = 0; 
            this.lastErrorTick = 0;
        } catch (e) {
            this.errors++; 
            this.record(`error:${String(e).slice(0, 200)} (count ${this.errors})`); 
            console.warn(`[Verdant] ${e}`);
            try { this.stopActions(); } catch (_e) { this.fault(_e); }
            // ROBUST: Circuit breaker now retries after 200 ticks instead of permanent shutdown
            if (this.errors >= 5) { 
                this.record(`Circuit breaker: ${e} - pausing 10 sec then retrying robustly`);
                this.paused = true; 
                this.state = "fault"; 
                this.reason = `Circuit breaker: ${e} - retrying in 10 sec`;
                this.tell(this.reason);
                // Auto-resume after 200 ticks (10 sec) for robustness
                this.faultResumeAt = tick + 200;
            }
        }
        // Auto-resume from fault for robustness
        if (this.state === "fault" && this.faultResumeAt && tick >= this.faultResumeAt) {
            this.record("Auto-resuming from fault for robustness");
            this.paused = false;
            this.pausedReason = "";
            this.state = "recovering";
            this.errors = 0;
            this.faultResumeAt = 0;
            this.taskStart = tick;
            this.reason = "Resumed after fault - robust quick";
        }
    }
    think(tick) {
        if (this.paused) {
            // Owner-availability pauses end automatically once the owner is back; owner-commanded pauses stay.
            const ownerPause = this.pausedReason === "Owner disconnected." || (this.pausedReason || "").startsWith("Owner offline");
            if (ownerPause && this.owner()) {
                this.record("Owner returned; resuming automatically.");
                this.resume();
            } else return;
        }
        const owner = this.owner();
        if (!owner) { this.pause("Owner offline; no unattended world mutation."); return; }
        // ROBUST: Allow Nether and End travel - was previously pausing with "Nether/End travel is not implemented" causing auto shutdown on portal entry
        // UI update - scoreboard + actionbar for spectating
        try { this.ui?.tick(tick); } catch (_e) { this.fault(_e); }

        // Now supports full-game speedrun Overworld -> Nether -> End
        if (owner.dimension.id !== this.sim.dimension.id) {
            // Owner and bot in different dimensions - pause to avoid unattended mutation, but record
            if (tick % 200 === 0) this.record(`Dimension mismatch: bot in ${this.sim.dimension.id}, owner in ${owner.dimension.id} - waiting for owner`);
            // Only pause if owner is in overworld and bot in nether/end without owner following - actually allow if both in same non-overworld
            if (this.sim.dimension.id === "minecraft:overworld" || owner.dimension.id === "minecraft:overworld") {
                // One in overworld, one not - wait but don't shutdown permanently, retry
                this.reason = `Dimension mismatch bot ${this.sim.dimension.id} vs owner ${owner.dimension.id} - waiting`;
                return;
            }
        }
        // Allow all dimensions: overworld, nether, end - for full-game speedrun
        this.terrain.begin(tick);
        this.nav.fast = this.settings.fast;

        // ANTI-DROWN: if in water, immediately handle swimming - never drown
        if (this.sim.isInWater) {
            // Force swimming behavior - jump every tick to stay at surface
            if (tick % 5 === 0) {
                try { this.sim.jump(); } catch (_e) { this.fault(_e); }
            }
            // If head in water, urgent surface
            try {
                if (this.terrain.headInWater(this.sim)) {
                    this.reason = "In water head submerged - urgent surfacing - anti-drown swimming fix";
                    try { this.sim.jump(); } catch (_e) { this.fault(_e); }
                    const cur = this.sim.location;
                    try {
                        this.sim.moveToLocation(this.host.relative({ x: cur.x, y: cur.y + 1.5, z: cur.z }), { faceTarget: true });
                    } catch (_e) { this.fault(_e); }
                    // Try boat immediately when drowning
                    const boatRes = this.escaper.boat(tick);
                    if (boatRes) return;
                }
            } catch (_e) { this.fault(_e); }
        }
        this.nav.parkour = this.settings.parkour;
        this.nav.allowBridge = this.settings.bridge;
        this.observe(tick);

        // World-class awareness: scan surroundings, remember important (iron ore, sheep, lava pools, structures)
        // STAGGERED: the directors self-throttle, but are not even consulted every tick.
        if (tick % 20 === 0) { try { this.awareness.tick(tick); } catch (_e) { this.fault(_e); } }
        if (tick % 20 === 10) { try { this.structures.tick(tick); } catch (_e) { this.fault(_e); } }

        const hp = this.sim.getComponent(EntityComponentTypes.Health)?.currentValue ?? 0;
        if (hp <= 0) { this.recordDeath(); this.save(); this.state = "dead"; this.deadSince = tick; this.respawnTried = false; return; }
        if (this.escapeSeal && this.unseal(tick)) return;
        const hunger = this.sim.getComponent("minecraft:player.hunger")?.currentValue ?? 20;

        // Auto organize if needed - retain important stuff
        if (tick % 400 === 0) { try { this.resource.organizeIfNeeded(); } catch (_e) { this.fault(_e); } }
        // Retain important items logic - never drop critical
        if (tick % 200 === 100) { try { this.retainImportant(); } catch (_e) { this.fault(_e); } }

        if (this.settings.armor && !this.equipment.faultReason && tick - this.lastEquipmentCheck >= 20) {
            this.lastEquipmentCheck = tick;
            try { if (this.equipment.autoEquip()) this.record("equipped better armour"); } catch (error) {
                this.equipment.faultReason = String(error); 
                this.record("equipment fault: " + this.equipment.faultReason + ", retrying");
                this.equipment.faultReason = "";
            }
        }

        // Cached threatInfo for this tick. Declared before first use: referencing
        // it earlier in the temporal dead zone threw a ReferenceError that was
        // swallowed by the catch and silently disabled the danger fast-path.
        let cachedThreatInfo = null;
        const getCachedThreat = () => {
            if (!cachedThreatInfo) {
                try { cachedThreatInfo = this.terrain.threatInfo(this.sim, owner); } catch { cachedThreatInfo = { list: [], count: 0, nearest: null, closest: Infinity, ranged:0, explosive:0, melee:0, bombNear:false, underFire:false }; }
            }
            return cachedThreatInfo;
        };

        // ARBITER: replaces 430-line chain of if (director.tick()) return;
        // Keeps current behavior until finishes or clearly better appears, returns reason codes
        try {
            // Every 5 ticks (survival-master keeps its fast lane). The old gate
            // also ran it on every tick whenever there was no current pick or
            // the bot was in water - i.e. constantly after any director error.
            if (tick % 5 === 0 || this.arbiter.current?.id === "survival_master") {
                const arbResult = this.arbiter.tick(tick);
                if (arbResult.code === "running") {
                    // If arbiter says running for survival/escape/combat/food, honor it.
                    // Mission-mode ids (mine, follow, golem, ...) must fall through to the dispatcher below,
                    // so no mode name may appear in this list.
                    if (["survival_master","escape","combat","food","bucket","village","nether"].includes(arbResult.id)) {
                        return;
                    }
                } else if (arbResult.code === "failed") {
                    this.record(`Arbiter failed: ${arbResult.reason}`);
                }
            }
        } catch (_e) { this.fault(_e); }

        // WORLD-CLASS SURVIVAL MASTER - now via arbiter, but keep direct call for fall fast path
        try {
            const shouldTickSurvival = (tick % 10 === 0) || (cachedThreatInfo && cachedThreatInfo.count >= 2) || (this.survivalMaster.fallStartY !== null);
            if (shouldTickSurvival && this.survivalMaster.tick(tick)) return;
        } catch (_e) { this.fault(_e); }

        // QUICK TOOL PRIORITY #1 - NEVER FIGHT BARE HAND
        if (tick - this.lastQuickToolCheck > 40) {
            this.lastQuickToolCheck = tick;
            try {
                const counts = this.bag.counts();
                const hasWeapon = this.equipment.hasWeapon();
                const quickNeed = this.equipment.quickToolNeeded(tick);
                if (quickNeed && !hasWeapon) {
                    // Emergency: craft quick tool immediately
                    this.reason = `Quick tool priority: ${quickNeed.reason}`;
                    if (quickNeed.craft && this.settings.assistedCrafting) {
                        try {
                            this.obtain(quickNeed.need, 1, tick);
                            return;
                        } catch (_e) { this.fault(_e); }
                    }
                }
                // Also check generic needsQuickTool from core/combat
                const need = needsQuickTool(hasWeapon, counts);
                if (need && !hasWeapon) {
                    this.reason = `No weapon - ${need.reason} #1 priority`;
                    if (this.settings.assistedCrafting) {
                        try { this.obtain(need.craft, 1, tick); return; } catch (_e) { this.fault(_e); }
                    }
                }
            } catch (_e) { this.fault(_e); }
        }

        // Death recovery - pick items if died
        if (this.memory?.death() && tick % 100 === 0) {
            try {
                const death = this.memory.death();
                if (death && death.dim === this.sim.dimension.id) {
                    const dist = distance(death, this.sim.location);
                    if (dist < 64) {
                        // Try to recover
                        if (!this.deathRecovery) this.deathRecovery = { pos: death, since: tick, tries: 0 };
                        // If close, collect drops
                        if (dist < 8) {
                            this.reason = `Recovering death items at ${death.x},${death.y},${death.z}`;
                            // Look for item entities near death
                            try {
                                const items = this.sim.dimension.getEntities({ type: "minecraft:item", location: death, maxDistance: 12 });
                                if (items.length) {
                                    const nearest = items.sort((a,b) => distance(a.location, this.sim.location) - distance(b.location, this.sim.location))[0];
                                    const r = this.navTo(nearest.location, tick, 1);
                                    if (r !== "failed") return;
                                }
                            } catch (_e) { this.fault(_e); }
                        }
                    }
                }
            } catch (_e) { this.fault(_e); }
        }

        // WORLD-CLASS FOOD & COMBAT READINESS + ADAPTIVE PLANNING
        try {
            const curHealth = this.sim.getComponent(EntityComponentTypes.Health)?.currentValue ?? 20;
            const prevHealth = this.previousHealth ?? curHealth;
            if (curHealth < prevHealth) {
                this.lastDamageTick = tick;
                try {
                    const reassess = reassessAfterDamage(null, prevHealth - curHealth, curHealth, (getCachedThreat().list ?? []), { hasBlocks: (this.builder?.countBlocks() ?? 0) > 0, previousHealth: prevHealth });
                    if (reassess.priority >= 80) {
                        this.reason = `Food: ${reassess.reason} - reassess after damage`;
                    }
                } catch (_e) { this.fault(_e); }
            }
            this.previousHealth = curHealth;

            // Adaptive planning: recalculate whenever discovers village/ruined portal/lava pool/useful chest/hostile group/unexpected obstacle
            if (tick % 60 === 0) {
                try {
                    const discovered = [];
                    const top = this.structures?.getTopPriority();
                    if (top && top.tick && tick - top.tick < 120) discovered.push(top.name);
                    const lava = this.awareness?.getLavaPool();
                    if (lava && lava.tick && tick - lava.tick < 120) discovered.push("lava_pool");
                    if (discovered.length) {
                        this.record(`adaptive recalc trigger: ${discovered.join(",")} - reevaluating Nether route`);
                        // Reset nether lastRecalc to force re-eval
                        if (this.nether) this.nether.lastRecalc = 0;
                    }
                } catch (_e) { this.fault(_e); }
            }

            // Food reserves assessment
            if (tick - (this.lastFoodCheck ?? 0) > 80) {
                this.lastFoodCheck = tick;
                try {
                    const reserves = assessFoodReserves(this.bag.counts(), { hunger, health: curHealth });
                    if (reserves.status === "critical" && this.mode !== "idle") {
                        this.reason = `Food critical ${reserves.totalHunger} hunger, ${reserves.status} - prioritizing food`;
                    }
                } catch (_e) { this.fault(_e); }
            }
        } catch (_e) { this.fault(_e); }

        // VILLAGE-FIRST via arbiter - single call, not duplicate

        // STRUCTURE LOOTING via arbiter + looting director - single implementation

        // NETHER + VILLAGE via arbiter - merged speedrun into nether, single call

        // IRON GOLEM COMBAT & RISK MANAGEMENT
        try {
            if (this.settings.defend && this.golem && this.golem.tick(tick)) return;
        } catch (_e) { this.fault(_e); }

        // FOOD HEALING COMBAT READINESS (10-tick cadence; it counted the whole
        // inventory and read components on every single tick before)
        try {
            if (this.food && tick % 10 === 0 && this.food.tick(tick)) return;
        } catch (_e) { this.fault(_e); }

        // BUCKET ACQUISITION & NETHER PREPARATION
        try {
            if ((this.mode === "speedrun" || this.mode === "survival" || this.mode === "starter") && !this.mining && this.bucket && this.bucket.tick(tick)) return;
        } catch (_e) { this.fault(_e); }

        // Structure loot main priority if found - interrupt current task if high priority
        try {
            const topStruct = this.structures.getTopPriority();
            if (topStruct && topStruct.priority >= 90) {
                const currentPrio = this.mode === "idle" ? 0 : 50;
                if (this.structures.shouldInterruptForLoot(currentPrio)) {
                    const lootTarget = this.structures.getLootTarget();
                    if (lootTarget) {
                        this.reason = `Structure priority: ${topStruct.name} (${topStruct.reason}) - looting chest`;
                        const r = this.navTo(center(lootTarget.pos), tick, 2);
                        if (r !== "failed") return;
                    }
                }
            }
            // Lava pool -> portal if have water bucket - main priority
            const portalOpp = this.structures.getPortalOpportunity();
            if (portalOpp && portalOpp.hasWater) {
                const inv = this.bag.counts();
                if ((inv["minecraft:obsidian"] ?? 0) < 10) {
                    this.reason = `Lava pool portal opportunity at ${portalOpp.pos.x},${portalOpp.pos.y},${portalOpp.pos.z} - making obsidian`;
                    // If near lava pool, try to make obsidian
                    if (distance(portalOpp.pos, this.sim.location) < 12) {
                        // Place water logic would be in survival/speedrun, but we can navigate there
                        const r = this.navTo(center(portalOpp.pos), tick, 3);
                        if (r !== "failed") return;
                    }
                }
            }
        } catch (_e) { this.fault(_e); }

        // Enhanced threat evaluation with combat module - use cached threatInfo for speed
        const info = this.settings.defend ? (cachedThreatInfo ?? this.terrain.threatInfo(this.sim, owner)) : { list: [], nearest: undefined, count: 0, ranged: 0, explosive: 0, melee: 0, closest: Infinity, bombNear: false, underFire: false };
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
            // World-class: extreme combat situations need dedicated escape
            else if (info.count >= 8 || info.bombNear || (info.ranged >= 6) || (info.list.some(e => e.typeId === "minecraft:ender_man") && (this.sim.getComponent("minecraft:health")?.currentValue ?? 20) <= 12)) {
                escapeKind = "combat_escape";
            }
        }
        const hasWeapon = this.armed();
        const desperate = hp <= 8 || hunger <= 4;
        // Only look for food when eating is actually on the table.
        const foodSlot = hunger <= 17 ? this.bag.food(desperate) : -1;
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
        // Progress signature: cheap integer sum checked once per second.
        if (tick % 20 === 0) {
            const observed = totalItems(this.bag.counts());
            if (observed !== this.progressSignature) { this.progressSignature = observed; this.recoveryAttempts = 0; this.escapeAttempts = 0; }
        }
        // ROBUST: Task deadline should NOT auto shutdown - reset and retry with exploring instead of manual block
        if (tick - this.taskStart > (this.mode === "survival" || this.mode === "goto" || this.mode === "speedrun" ? 36000 : this.mode === "starter" ? 12000 : 7200) && ["mine", "goto", "starter", "speedrun"].includes(this.mode)) {
            this.record(`Task deadline exceeded in ${this.mode}, resetting and retrying robustly`);
            this.taskStart = tick;
            this.recoveryAttempts = 0;
            if (this.mining) {
                this.mining.noTargetSince = tick;
                this.mining.exploring = true;
                this.mining.target = undefined;
                this.explorer.reset();
                this.nav.reset();
                this.reason = `Deadline exceeded for ${this.mining.item ?? this.mining.block}, exploring wider robustly`;
                return;
            }
            // For other modes, just reset taskStart and continue
            this.reason = `Task deadline exceeded, retrying ${this.mode} robustly`;
            return;
        }
        if (this.camp(tick)) return;
        // FIX: looting single implementation via arbiter, not 3 times
        // maybeLoot removed - Looting director handles all
        if (this.boatTravel(tick)) return;
        // DIRECTOR MINING: a task assigned via assignMine() is driven here, in place,
        // so director modes (speedrun/nether/bucket/survival-master) keep their state
        // and resume as soon as the quota is complete. startMine() keeps the command
        // semantics (mode "mine" + stop when finished).
        if (this.mining && this.mode !== "mine") {
            try {
                if (this.pickaxeGuard(this.mining)) return;
                if (this.mine(this.mining, tick)) {
                    this.mining = undefined;
                    this.reason = "Mining quota complete, continuing.";
                }
            } catch (error) {
                const why = String(error?.message ?? error);
                if (why.includes("LocationInUnloadedChunkError") || why.includes("not in a chunk currently loaded")) {
                    this.record("Unloaded chunk error during director mining - resetting target");
                    this.mining.target = undefined;
                    this.nav.reset();
                    return;
                }
                this.blockTask(String(error), error instanceof TaskFault ? error.recovery : "manual");
            }
            return;
        }
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
                        // Command mining (!bot mine/deepmine): finish, then hold position.
                        // Directors use assignMine() instead and never enter this mode.
                        this.stop("Mining quota complete (blocks broken, drops collected).");
                        this.tell(this.reason);
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
        } catch (error) {
            const why = String(error?.message ?? error);
            if (why.includes("LocationInUnloadedChunkError") || why.includes("not in a chunk currently loaded")) {
                this.record("Unloaded chunk error in " + this.mode + " - resetting nav and recovering");
                this.nav.reset();
                if (this.autonomy) this.autonomy.recover();
                this.state = "idle";
                this.reason = "Repositioning from unloaded chunk boundary.";
                return;
            }
            this.blockTask(String(error), error instanceof TaskFault ? error.recovery : "manual");
        }
        if (tick % 100 === 0) this.save();
    }
    navTo(goal, tick, leash) {
        if (distance(this.sim.location, goal) <= leash) { this.nav.reset(); return "done"; }
        const base = floor(goal);
        // Standable cells around the goal: reuse the last probe for 10 ticks
        // while the goal stays in the same cell (it re-probed 23 cells x 3
        // reads on every tick of every walk).
        const baseKey = key(base);
        let candidates;
        const nc = this._navCand;
        if (nc && nc.key === baseKey && tick - nc.tick < 10 && tick >= nc.tick) candidates = nc.list;
        else {
            candidates = [];
            for (const d of NAV_OFFSETS) {
                const q = add(base, d);
                if (this.terrain.safe(q)) candidates.push(q);
            }
            this._navCand = { key: baseKey, tick, list: candidates };
        }
        if (!candidates.length) {
            // ROBUST: No safe spot, try to find workaround by breaking obstruction unless obsidian or important
            try {
                const obstruct = this.terrain.findObstructions(this.sim.location, goal);
                if (obstruct.length > 0 && obstruct.length <= 3) {
                    for (const cell of obstruct) {
                        const b = this.terrain.block(cell);
                        if (!b || b.isAir) continue;
                        // Don't break obsidian or important (retainScore >=80) unless critical
                        if (b.typeId === "minecraft:obsidian" || b.typeId === "minecraft:crying_obsidian") continue;
                        if (isUnbreakable(b.typeId)) continue;
                        const score = retainScore(b.typeId);
                        if (score >= 80) continue; // important like chest, furnace, crafting_table, bed
                        // Break it - entire body should be able to go
                        const r = this.digCell(cell, tick);
                        if (r === "digging") {
                            this.reason = `Breaking obstruction ${b.typeId} at ${cell.x},${cell.y},${cell.z} to reach goal - entire body path`;
                            return "running";
                        }
                    }
                }
            } catch (_e) { this.fault(_e); }
            return "blocked";
        }
        let bestCand = candidates[0];
        if (candidates.length > 1) {
            const here = this.sim.location;
            let bd = Infinity, bs = Infinity;
            for (const c of candidates) {
                const d = distance(c, goal), ds = distance(here, c);
                if (d < bd || (d === bd && ds < bs)) { bd = d; bs = ds; bestCand = c; }
            }
        }
        const result = this.nav.go(center(bestCand), tick);
        if (result === "failed") {
            // ROBUST: Path failed, try to break obstruction in front unless obsidian or important
            try {
                const p = floor(this.sim.location);
                // Check block directly in front of head that blocks entire body
                const headFront = this.terrain.headFrontObstruction ? this.terrain.headFrontObstruction(this.sim.location) : null;
                const obstruct = headFront ? [headFront] : this.terrain.findObstructions(this.sim.location, center(bestCand));
                if (obstruct.length > 0 && obstruct.length <= 3) {
                    for (const cell of obstruct) {
                        const b = this.terrain.block(cell);
                        if (!b || b.isAir) continue;
                        if (b.typeId === "minecraft:obsidian" || b.typeId === "minecraft:crying_obsidian") continue;
                        if (isUnbreakable(b.typeId)) continue;
                        const score = retainScore(b.typeId);
                        if (score >= 80) continue;
                        const r = this.digCell(cell, tick);
                        if (r === "digging") {
                            this.reason = `Breaking obstruction ${b.typeId} at ${cell.x},${cell.y},${cell.z} - path failed workaround`;
                            return "running";
                        }
                        if (r === "open") continue;
                    }
                }
            } catch (_e) { this.fault(_e); }
        }
        return result;
    }
    follow(goal, tick, leash) {
        // FOLLOW V4: ultra-light. Scans throttled to 60 ticks, water probe
        // cached 80 ticks, far targets walked as short cached hops (cheap A*
        // inside a 24-block horizon), pillar/tower only when the owner is
        // really overhead. Standing still costs nothing.
        const loc = this.sim.location;
        const selfFloor = floor(loc);
        const verticalDiff = goal.y - loc.y;
        const horizDist = horizontal(loc, goal);
        const totalDist = distance(loc, goal);

        // FAST PATH: close enough - stop once, then do nothing per tick.
        if (totalDist <= leash) {
            // Stop once on arrival (or after any tick where something else ran).
            if (this._followParkedTick !== tick - 1) {
                this.nav.reset();
                try { this.sim.stopMoving(); } catch (_e) { this.fault(_e); }
            }
            this._followParkedTick = tick;
            return;
        }
        this._followParkedTick = -1;

        const fc = (this._followCache ??= { tick: -1000, blocks: [], water: null, waterNear: false, waterTick: -1000, hop: undefined, hopBan: 0 });
        const needsScan = tick - fc.tick >= 60;
        const inWater = this.sim.isInWater;
        if (tick - fc.waterTick >= 80) {
            fc.waterTick = tick;
            try { fc.waterNear = this.terrain.waterNear(selfFloor); } catch (_e) { this.fault(_e); fc.waterNear = false; }
        }

        // TOWER: owner well above AND nearly overhead -> walk to the column and pillar.
        // Anywhere else the normal (small-horizon) navigation finds stairs/slopes.
        if (verticalDiff > 12 && horizDist < 8) {
            const targetColumn = { x: Math.floor(goal.x), y: selfFloor.y, z: Math.floor(goal.z) };
            if (horizDist > 2) {
                const r = this.navTo(targetColumn, tick, 2);
                if (r === "running") {
                    this.reason = `Tower follow: moving to your column ${targetColumn.x},${targetColumn.z} then pillar ${Math.round(verticalDiff)}b up`;
                    return;
                }
            }
            if (this.builder && this.builder.canBuild) {
                const pr = this.builder.pillar(tick);
                if (pr === "placed" || pr === "jumping") {
                    this.reason = `Tower follow: pillaring ${Math.round(verticalDiff)}b to you at column ${targetColumn.x},${targetColumn.z}`;
                    return;
                }
                if (pr === "no-support") {
                    const below = add(selfFloor, { x: 0, y: -1, z: 0 });
                    try {
                        const support = this.builder.findSupportFor(below);
                        if (support) {
                            const r = this.builder.placeAt(below, support.pos, { sneak: true, autoAnchor: true });
                            if (r === "placed") return;
                        }
                    } catch (_e) { this.fault(_e); }
                }
            } else if (needsScan) {
                // Need blocks - throttled small scan (cached snapshot reads).
                fc.tick = tick;
                try {
                    const near = this.terrain.scanOres(loc, 6, (type) => type === "minecraft:dirt" || type === "minecraft:cobblestone" || type === "minecraft:stone" || type.endsWith("_log"), 80);
                    fc.blocks = near;
                    if (near.length) {
                        const r = this.nav.go(center(near[0]), tick);
                        if (r !== "failed") {
                            this.reason = `Tower follow: need blocks to pillar ${Math.round(verticalDiff)}b, mining nearby`;
                            return;
                        }
                    }
                } catch (_e) { this.fault(_e); }
            }
            const r = this.navTo(goal, tick, leash);
            if (r !== "failed" && r !== "blocked") return;
        }

        // WATER: throttled probe, not every tick
        if (needsScan) {
            try { fc.water = this.waterAhead ? this.waterAhead(goal) : null; } catch (_e) { this.fault(_e); fc.water = null; }
            fc.tick = tick;
        }
        if ((fc.water || inWater || fc.waterNear) && totalDist > 6) {
            try {
                const boatRes = this.escaper.boat(tick);
                if (boatRes) {
                    this.reason = `Follow: water traversal to you ${Math.round(totalDist)}b - boat`;
                    return;
                }
            } catch (_e) { this.fault(_e); }
        }

        // FAR (> 80 blocks): hop along the line to a cached ground waypoint
        // ~20 blocks ahead. Each hop is a tiny, fast A*; no 2000-node search
        // toward a target in half-loaded terrain.
        let target = goal, hopLeash = leash;
        if (horizDist > 80 && tick >= fc.hopBan) {
            const hop = this.followHop(goal, tick);
            if (hop) { target = hop; hopLeash = 2; }
        }
        const r = this.navTo(target, tick, hopLeash);
        if (target !== goal) {
            if (r === "done") { fc.hop = undefined; this.reason = `Follow: hopping toward you, ${Math.round(totalDist)}b`; return; }
            if (r === "failed" || r === "blocked") { fc.hop = undefined; fc.hopBan = tick + 100; }
            else { this.followBlocked = 0; this.followFails = 0; this.reason = `Follow: hopping toward you, ${Math.round(totalDist)}b`; return; }
        }
        if (r === "blocked") {
            this.followBlocked = this.followBlocked || tick;
            if (this.builder && this.builder.canBuild && tick % 60 === 0) {
                try {
                    const p = floor(this.sim.location);
                    const dir = { x: Math.sign(goal.x - p.x), y: 0, z: Math.sign(goal.z - p.z) };
                    if (dir.x !== 0 || dir.z !== 0) {
                        const bridgeRes = this.builder.bridge(dir, tick);
                        if (bridgeRes === "placed" || bridgeRes === "placed_support") {
                            this.reason = "Follow: bridging to reach you";
                            return;
                        }
                    }
                } catch (_e) { this.fault(_e); }
            }
            if (tick % 60 === 0) {
                try { this.explorer.step(this.sim.location, goal, tick, this.terrain, this.nav, Math.min(32, totalDist)); } catch (_e) { this.fault(_e); }
                return;
            }
            try { this.sim.stopMoving(); } catch (_e) { this.fault(_e); }
            this.nav.reset();
            if (tick - this.followBlocked > 200) {
                this.followBlocked = tick;
                try { this.tell("Still finding way to you - precise follow wherever you are"); } catch (_e) { this.fault(_e); }
            }
            return;
        }
        this.followBlocked = 0;
        if (r === "failed") {
            this.followFails = (this.followFails ?? 0) + 1;
            this.reason = this.nav.reason;
            if (this.followFails % 3 === 0) {
                try {
                    const obstruct = this.terrain.findObstructions(this.sim.location, goal);
                    if (obstruct.length > 0 && obstruct.length <= 3) {
                        for (const cell of obstruct) {
                            const b = this.terrain.block(cell);
                            if (!b || b.isAir) continue;
                            if (b.typeId === "minecraft:obsidian") continue;
                            if (isUnbreakable(b.typeId)) continue;
                            const score = retainScore(b.typeId);
                            if (score >= 80) continue;
                            const dr = this.digCell(cell, tick);
                            if (dr === "digging") { this.reason = `Follow: breaking ${b.typeId} to reach you`; return; }
                        }
                    }
                } catch (_e) { this.fault(_e); }
                if (verticalDiff > 8 && this.builder && this.builder.canBuild) {
                    try {
                        const pr = this.builder.pillar(tick);
                        if (pr === "placed" || pr === "jumping") { this.reason = `Follow: pillaring ${Math.round(verticalDiff)}b up to you`; return; }
                    } catch (_e) { this.fault(_e); }
                }
            }
            if (tick % 60 === 0) {
                try { this.explorer.step(this.sim.location, goal, tick, this.terrain, this.nav, Math.max(32, totalDist)); } catch (_e) { this.fault(_e); }
            }
            return;
        }
        this.followFails = 0;
    }

    /** Cached intermediate ground waypoint ~20 blocks toward a far goal (cached-snapshot reads only). */
    followHop(goal, tick) {
        const fc = this._followCache;
        const loc = this.sim.location;
        const h = fc.hop;
        if (h && tick - h.tick < 60 && distance(h.goal, goal) < 8 && horizontal(loc, h.p) > 2) return h.p;
        const dx = goal.x - loc.x, dz = goal.z - loc.z, len = Math.hypot(dx, dz);
        if (len < 1) return undefined;
        for (const step of [20, 14, 8]) {
            const x = Math.floor(loc.x + (dx / len) * step), z = Math.floor(loc.z + (dz / len) * step);
            const g = this.terrain.groundNear(x, z, Math.floor(loc.y), 6);
            if (g && !this.terrain.dangerous(add(g, DOWN))) {
                fc.hop = { p: center(g), goal: { ...goal }, tick };
                return fc.hop.p;
            }
        }
        fc.hop = undefined;
        return undefined;
    }

    idle(tick) {
        // ULTRA AUTONOMY: only auto-start survival after the bot has been idle for 60 s
        // and the owner is truly absent AND settings.autoSurvival is explicitly enabled.
        if (this.mode === "idle" && !this.paused) {
            this._idleSince ??= tick;
            const idleFor = tick - this._idleSince;
            const idleOwner = this.owner();
            const ownerNear = idleOwner && distance(idleOwner.location, this.sim.location) <= 100;
            if (!ownerNear && idleFor > 1200 && this.settings.autoSurvival === true) {
                this.record("Auto survival: idle > 60s with no nearby owner -> survival mode");
                this._idleSince = undefined;
                this.setMode("survival");
                return;
            }
        }

        const owner = this.owner();
        const home = this.home();
        const anchor = this.anchor ?? home;

        // If owner nearby, guard in place — hold position calmly.
        if (owner) {
            const distOwner = distance(owner.location, this.sim.location);
            if (distOwner <= 16) {
                this.reason = `Active idle: guarding ${this.ownerName} (${Math.round(distOwner)}b) — ready for command`;
                this.nav.reset();
                try { this.sim.stopMoving(); } catch (_e) { this.fault(_e); }
                return;
            } else if (distOwner <= 48) {
                this.reason = `Active idle: owner ${this.ownerName} ${Math.round(distOwner)}b away, moving closer`;
                const r = this.navTo(owner.location, tick, 6);
                if (r !== "failed" && r !== "blocked") return;
            }
        }

        // If has grab (item pickup), handle it within close range
        if (this.grab) {
            const g = this.grab;
            if (!g.e.isValid || distance(g.e.location, this.sim.location) > 8) { this.grab = undefined; }
            else {
                if (distance(g.e.location, this.sim.location) > 1.2) {
                    g.contact = 0;
                    if (tick - g.since > 120 || this.nav.go(center(floor(g.e.location)), tick) === "failed") { this.grabIgnore.set(g.e.id, tick + 400); this.grab = undefined; }
                    return;
                }
                this.nav.reset();
                try { this.sim.stopMoving(); } catch (_e) { this.fault(_e); }
                if (!g.contact) g.contact = tick;
                else if (tick - g.contact > 60) { this.grabIgnore.set(g.e.id, tick + 400); this.grab = undefined; }
                return;
            }
        }

        // Close item pickup when enabled (within 5 blocks, not running all over)
        if (this.settings.pickup && tick % 40 === 0 && this.bag.container.emptySlotsCount > 0) {
            if (this.grabIgnore.size > 64) for (const [entityId, until] of this.grabIgnore) if (until < tick) this.grabIgnore.delete(entityId);
            const here = this.sim.location;
            let near, best = Infinity;
            for (const e of this.sim.dimension.getEntities({ type: "minecraft:item", location: here, maxDistance: 5 })) {
                if (!e.isValid || (this.grabIgnore.get(e.id) ?? 0) >= tick) continue;
                const d = distance(e.location, here);
                if (d < best && this.terrain.safe(e.location)) { best = d; near = e; }
            }
            if (near) {
                this.reason = "Idle: collecting nearby item";
                this.grab = { e: near, since: tick, contact: 0 };
                return;
            }
        }

        // Only patrol if explicitly enabled via settings.patrol
        if (this.settings.patrol) {
            if (tick % 40 === 20 && this.settings.hunting) {
                const opp = this.resource.findOpportunistic(tick);
                if (opp && distance(opp.e.location, this.sim.location) < 10) {
                    this.reason = `Patrol: ${opp.type} within reach, hunting`;
                    const r = this.navTo(opp.e.location, tick, 2);
                    if (r !== "failed" && r !== "blocked") return;
                }
            }
            const leg = this._idleLeg;
            if (leg) {
                const r = this.nav.go(leg.goal, tick);
                if (r === "running" && tick - leg.since < 200) {
                    this.reason = `Patrolling near ${anchor.x},${anchor.y},${anchor.z}`;
                    return;
                }
                this._idleLeg = undefined;
                this._idleNext = tick + 100;
                if (r !== "done") this.nav.reset();
            }
            if (tick >= (this._idleNext ?? 0)) {
                this._idleNext = tick + 100;
                const p = floor(this.sim.location);
                const candidates = [];
                const far = distance(p, anchor) > 12;
                for (const d of COMPASS) {
                    for (const n of [4, 3]) {
                        const q = add(p, { x: d.x * n, y: 0, z: d.z * n });
                        if (far && distance(q, anchor) >= distance(p, anchor)) continue;
                        const g = this.terrain.groundNear(q.x, q.z, q.y, 2);
                        if (g) { candidates.push(g); break; }
                    }
                }
                if (candidates.length) {
                    const chosen = this.seededRng().pick(candidates);
                    this._idleLeg = { goal: center(chosen), since: tick };
                    this.reason = `Patrolling near ${anchor.x},${anchor.y},${anchor.z}`;
                    return;
                }
            }
        }

        // Default calm idle: hold position, watch around
        try { this.sim.stopMoving(); } catch (_e) { this.fault(_e); }
        this.reason = "Idle: holding position — ready for command";
    }

    collect(tick) {
        const g = this.goal;
        if (!g?.anchor) { this.stop("Collect: no sweep point."); return; }
        g.skipped ??= new Set(); g.startCounts ??= this.bag.counts(); g.deadline ??= tick + Math.max(600, g.radius * 60); g.idleSince ??= 0;
        if (this.bag.container.emptySlotsCount < 1) { 
            try { this.resource.organizeIfNeeded(); } catch (_e) { this.fault(_e); }
            if (this.bag.container.emptySlotsCount < 1) {
                this.reason = "Inventory full; organizing and retrying collection";
            }
            return; 
        }
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
            this.nav.reset(); try { this.sim.stopMoving(); } catch (_e) { this.fault(_e); }
            if (!g.contact) g.contact = tick;
            else if (tick - g.contact > 80) { g.skipped.add(drop.id); g.contact = 0; }
            return;
        }
        const blocked = raw.filter((e) => g.skipped.has(e.id) || !this.terrain.safe(e.location)).length;
        if (raw.length && blocked === raw.length) return this.finishCollect(raw, g, "Sweep done");
        if (!raw.length) { if (!g.idleSince) g.idleSince = tick; if (tick - g.idleSince > 40) return this.finishCollect(raw, g, "Sweep done"); } else g.idleSince = 0;
        try { this.sim.stopMoving(); } catch (_e) { this.fault(_e); }
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
            // The engine refuses ordinary food at full hunger - only always-edible
            // items (golden apples) pass. Never park the whole task on that refusal.
            if (hunger >= 20) {
                const golden = this.bag.find((s) => s.typeId === "minecraft:golden_apple" || s.typeId === "minecraft:enchanted_golden_apple");
                if (golden < 0) { this.reason = "Hunger is full; no food use needed."; return; }
                this.nav.reset();
                if (!this.sim.useItemInSlot(this.bag.select(golden))) { this.reason = "Golden apple use declined; continuing."; return; }
                this.eatingUntil = tick + 40; this.reason = "Eating a golden apple to heal.";
                return;
            }
            const slot = this.bag.food(hp <= 8 || hunger <= 4);
            if (slot < 0) return;
            this.nav.reset();
            const held = this.bag.select(slot);
            if (!this.sim.useItemInSlot(held)) {
                this.bag.invalidate?.();
                this.blockTask("Food use rejected by engine.", "retry");
                return;
            }
            this.eatingUntil = tick + 40; this.reason = "Eating to recover hunger.";
        } else if (tick >= this.eatingUntil) { try { this.sim.stopUsingItem(); } catch (_e) { this.fault(_e); } this.eatingUntil = 0; }
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
            this.nav.urgent = false; this.nav.avoid = []; this.nav.reset(); this.retreatGoal = undefined; this.retreatSince = 0; this.fleeSince = 0; this.lastBranch = ""; this.record("broke contact"); return;
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
        if (tick - this.retreatSince > 350) { 
            this.nav.urgent = false; this.nav.avoid = []; 
            this.retreatGoal = undefined;
            this.retreatSince = 0;
            this.record("Could not break contact, resetting retreat robustly");
            this.escaper.reset();
            this.nav.reset();
            return; 
        }
        this.nav.urgent = true;
        this.nav.avoid = (info?.list ?? []).map((e) => ({ x: e.location.x, y: e.location.y, z: e.location.z, radius: 6, }));
        const p = floor(this.sim.location);
        const here = threat ? distance(p, threat.location) : 0;
        // Commit to one retreat goal until it is reached, unsafe, unreachable, or
        // no longer away from the threat. Re-picking "the farthest spot" every
        // tick made the bot flip direction and circle around the mobs.
        if (this.retreatGoal) {
            const arrived = distance(p, this.retreatGoal) <= 2.5;
            const stale = this.terrain.dangerous(this.retreatGoal) || (threat && threat.isValid && distance(this.retreatGoal, threat.location) <= here + 1);
            if (!arrived && !stale) {
                if (this.nav.go(this.retreatGoal, tick) !== "failed") { this.reason = "Retreating from " + (threat?.typeId ?? "danger"); return; }
            }
            this.retreatGoal = undefined;
            if (arrived) return;
        }
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
        this.retreatGoal = { ...candidates[0] };
        if (this.nav.go(center(this.retreatGoal), tick) === "failed") { this.retreatGoal = undefined; this.nav.urgent = false; this.nav.avoid = []; }
    }

    /**
     * Enhanced mining with obstruction clearing, tree handling, bridging, etc.
     */
    /**
     * Enhanced mining - ROBUST QUICK EXTREMELY v1.2.4 (front-block fix merged with reactive clearing, vein tunneling, bounded skips)
     * Fixes: idle after breaking log, extremely slow, auto shutdown
     * - Fast treeMode: after breaking log, immediately scan adjacent logs within 3 blocks
     * - Reduced timeouts: wood 80 ticks, stone 150, ore 200 (was 450)
     * - Reduced sweep: 60 ticks not 300
     * - No manual blockTask for inventory full or no target - retry instead
     * - NoTaskSince 200 for wood, 400 for others (was 800)
     * - Fast adjacent log search to avoid idle
     */
    /**
     * REWRITTEN MINING - UNBREAKABLE FRONT BLOCK FIX + DEEP MINING
     * - Front block: directly break if within 5.5 blocks, no nav approach needed
     * - Head front obstruction: clear it before trying to break front
     * - Tree mode: fast adjacent log scan
     * - Any wood fallback + desert bushes
     * - Deep mining delegates to AdvancedMiner / DeepMiner
     */
    mine(m, tick) {
        // ANTI-DROWN: if in water while mining, surface first - never drown
        if (this.sim.isInWater) {
            try { this.sim.jump(); } catch (_e) { this.fault(_e); }
            if (this.terrain.headInWater(this.sim)) {
                this.reason = "Mining interrupted - in water head submerged, surfacing - anti-drown";
                const cur = this.sim.location;
                try { this.sim.moveToLocation(this.host.relative({ x: cur.x, y: cur.y + 1.2, z: cur.z }), { faceTarget: true }); } catch (_e) { this.fault(_e); }
                const boatRes = this.escaper.boat(tick);
                if (boatRes) return false;
                return false;
            }
            // Try to get to shore while mining
            const shore = this.terrain.shoreNear(this.sim.location, 32);
            if (shore) {
                this.reason = "Mining interrupted - in water, swimming to shore first - anti-drown";
                try { this.sim.moveToLocation(this.host.relative(center(shore.cell)), { faceTarget: true }); } catch (_e) { this.fault(_e); }
                if (tick % 10 === 0) { try { this.sim.jump(); } catch (_e) { this.fault(_e); } }
                return false;
            }
        }
        const stock = this.bag.counts();
        // Met check
        let met = false;
        if (m.item) {
            const gained = amountOf(stock, m.item) - m.startCount;
            if (m.treeMode) {
                met = (gained + m.broken + (m.loot?.size ?? 0)) >= m.amount || gained >= m.amount;
            } else {
                met = gained >= m.amount;
            }
        } else {
            met = m.broken >= m.amount;
        }
        if (met && this.bag.container.emptySlotsCount > 0) {
            if (m.treeMode) {
                const adj = this.findAdjacentLogs(m, tick);
                if (adj) {
                    m.sweepUntil = undefined;
                    m.target = adj;
                    m.type = this.terrain.block(adj)?.typeId;
                    this.reason = `Tree: fast continue to adjacent log ${adj.x},${adj.y},${adj.z} - advanced`;
                    return false;
                }
            }
            if (m.sweepUntil === undefined) m.sweepUntil = tick + 20;
            if (tick < m.sweepUntil) {
                const stray = this.drops.near(m, this.sim.location, 10, tick);
                if (stray) { m.pickup = floor(stray.location); m.pickupEntity = stray; m.pickupUntil = tick + 15; }
                if (this.drops.run(m, tick)) return false;
            }
        }
        // Delegate underground to deep miners
        if (m.underground) {
            const deep = this.deepMine(m, tick, met);
            if (deep === "done") return true;
            if (deep === "blocked") { 
                this.blockTask(this.deepMiner.reason || this.miner.reason, "retry"); 
                return false; 
            }
            if (deep === "continue") return false;
        }
        if (met) return true;
        if (this.bag.container.emptySlotsCount < 1) { 
            try { this.resource.organizeIfNeeded(); } catch (_e) { this.fault(_e); }
            if (this.bag.container.emptySlotsCount < 1) {
                this.blockTask("Inventory full; organizing and retrying.", "retry"); 
            }
            return false; 
        }

        // ANTI-IDLE: never stay idle - fast threshold 20 for wood, 40 for others
        const noTargetThreshold = m.treeMode ? 20 : m.cropMode ? 20 : 40;
        if (tick - m.noTargetSince > noTargetThreshold && !m.returning) {
            if (m.underground) {
                // Only try to start deepMiner if we haven't just set wantsOut (200-tick cooldown).
                const deepCooldown = (m._deepRetryAt ?? 0);
                if (!this.deepMiner.active && !this.miner.active && this.settings.deepMining && m.deepItem && tick >= deepCooldown) {
                    if (this.deepMiner.start(m.deepItem, tick)) {
                        this.miner.wantsOut = false;
                        this.deepMiner.wantsOut = false;
                        m.noTargetSince = tick;
                        m._deepRetryAt = undefined;
                        this.reason = `Descending for ${m.deepItem} - deep shaft to Y=${this.deepMiner.targetY}`;
                        return false;
                    } else {
                        // deepMiner couldn't start (no pickaxe / bad position) — climb out and retry later.
                        m._deepRetryAt = tick + 200;
                        this.miner.wantsOut = true;
                        m.noTargetSince = tick;
                        this.reason = "Deep mine start failed — climbing out to retry";
                        return false;
                    }
                }
                if (!this.deepMiner.active) {
                    this.miner.wantsOut = true;
                    m.noTargetSince = tick;
                    this.reason = "No ore in range, climbing out";
                    return false;
                }
            }
            if (isWoodRequest(m.block)) {
                try {
                    const anyWood = this.terrain.scanOres(this.sim.location, 16, (type) => isAnyWood(type), 400);
                    if (anyWood.length > 0) {
                        m.target = anyWood[0];
                        m.type = this.terrain.block(anyWood[0])?.typeId;
                        m.noTargetSince = tick;
                        this.reason = `No ${m.block} but found ${m.type} at ${anyWood[0].x},${anyWood[0].y},${anyWood[0].z} - any wood - unbreakable`;
                        return false;
                    }
                    const bushes = this.terrain.scanOres(this.sim.location, 16, (type) => type === "minecraft:deadbush" || type === "minecraft:dead_bush" || type === "minecraft:bamboo" || type === "minecraft:cactus", 300);
                    if (bushes.length > 0) {
                        m.target = bushes[0];
                        m.type = this.terrain.block(bushes[0])?.typeId;
                        m.noTargetSince = tick;
                        this.reason = `No wood, found ${m.type} desert fallback - unbreakable`;
                        return false;
                    }
                } catch (_e) { this.fault(_e); }
            }
            if ((this.mode === "survival" || this.mode === "starter" || this.mode === "mine" || this.mode === "speedrun") && m.failures < 40) {
                m.failures = (m.failures ?? 0) + 1;
                m.exploring = true; m.target = undefined; m.breakingSince = undefined; m.noTargetSince = tick;
                try { this.sim.stopBreakingBlock(); } catch (_e) { this.fault(_e); }
                this.explorer.reset(); this.nav.reset();
                this.reason = `No ${m.item ?? m.block} nearby, exploring (${m.failures}/40) - advanced`;
                return false;
            } else {
                try {
                    const anyWood = this.terrain.scanOres(this.sim.location, 32, (type) => isAnyWood(type) || type === "minecraft:deadbush" || type === "minecraft:dead_bush", 600);
                    if (anyWood.length > 0) {
                        m.target = anyWood[0];
                        m.type = this.terrain.block(anyWood[0])?.typeId;
                        m.noTargetSince = tick;
                        this.reason = `Still no ${m.block}, found ${m.type} 32b - unbreakable`;
                        return false;
                    }
                } catch (_e) { this.fault(_e); }
                m.failures = 0;
                m.exploring = true; m.target = undefined; m.breakingSince = undefined; m.noTargetSince = tick;
                this.explorer.reset(); this.nav.reset();
                if (this.mode === "follow") {
                    this.settings.range = Math.min(512, (this.settings.range ?? 256) + 32);
                    this.reason = `Still searching for ${m.item ?? m.block}, widening to ${this.settings.range} - following ${this.ownerName} - unbreakable`;
                } else {
                    this.reason = `Still searching for ${m.item ?? m.block}, widening - ANY wood - unbreakable`;
                }
                return false;
            }
        }

        if (m.returning) {
            if (tick - (m.peekAt ?? 0) > 10) { m.peekAt = tick; m.peek = new BlockScan(this.sim.location, 12); }
            if (m.peek && !m.peek.done) {
                const spot = m.peek.next(this.terrain, (type, p) => this.wantedToMine(m, type, p, tick));
                if (spot) {
                    m.returning = false; m.peek = undefined; m.target = spot; m.approach = undefined; m.approachTry = 0;
                    this.nav.reset(); this.reason = `Spotted ${m.item ?? m.block} on way home - advanced`; return false;
                }
            }
            const home = this.home();
            this.reason = "Heading home after fruitless search - advanced";
            if (distance(this.sim.location, home) < 4 || this.navTo(home, tick, 3) === "done") {
                m.returning = false; m.exploring = true; m.noTargetSince = tick; this.explorer.reset(); return false;
            }
            if (this.nav.stuck) {
                m.returnFails = (m.returnFails ?? 0) + 1;
                if (m.returnFails >= 8) { m.returning = false; m.exploring = true; m.returnFails = 0; this.explorer.reset(); }
            } else m.returnFails = 0;
            return false;
        }

        if (m.exploring) {
            const stray = this.drops.near(m, this.sim.location, 8, tick);
            if (stray) { m.pickup = floor(stray.location); m.pickupEntity = stray; m.pickupUntil = tick + 40; }
            if (this.drops.run(m, tick)) return false;
            if (tick - (m.peekAt ?? 0) > 10) {
                m.peekAt = tick;
                if (m.treeMode || isWoodRequest(m.block) || m.item === "#logs") {
                    const woodList = this.terrain.scanOres(this.sim.location, 24, (type, pt) => (isAnyWood(type) || type === "minecraft:deadbush" || type === "minecraft:dead_bush") && (m.blocked.get(key(pt)) ?? 0) <= tick, 300);
                    if (woodList.length > 0) {
                        m.exploring = false; m.peek = undefined; m.target = woodList[0]; m.type = this.terrain.block(woodList[0])?.typeId;
                        m.approach = undefined; m.approachTry = 0;
                        this.explorer.reset(); this.nav.reset();
                        this.reason = `Spotted wood at ${woodList[0].x},${woodList[0].y},${woodList[0].z} while scouting - fast lock`;
                        return false;
                    }
                }
                m.peek = new BlockScan(this.sim.location, 12);
            }
            if (m.peek && !m.peek.done) {
                const spot = m.peek.next(this.terrain, (type, p) => this.wantedToMine(m, type, p, tick));
                if (spot) {
                    m.exploring = false; m.peek = undefined; m.target = spot; m.approach = undefined; m.approachTry = 0;
                    this.explorer.reset(); this.nav.reset();
                    this.reason = `Spotted ${m.item ?? m.block} while scouting - advanced`; return false;
                }
            }
            this.reason = `Exploring for ${m.item ?? m.block}; visited ${this.explorer.trips} areas - advanced`;
            const result = this.explorer.step(this.sim.location, this.anchor, tick, this.terrain, this.nav, this.settings.range);
            if (result === "blocked") {
                m.exploring = false; m.peek = undefined;
                const home = this.home();
                if (distance(this.sim.location, home) > 24) m.returning = true;
                else { m.exploring = true; this.explorer.reset(); this.reason = `Searched area, widening for ${m.item ?? m.block} - advanced`; }
                return false;
            }
            if (result === "arrived") { m.exploring = false; m.target = undefined; m.approach = undefined; m.scan = this.newScan(m); m.far = undefined; m.blocked.clear(); m.noTargetSince = tick; }
            return false;
        }

        if (this.drops.run(m, tick)) return false;

        if (!m.pickup && !this.obstructionClear) {
            const nearDrop = this.drops.near(m, this.sim.location, 6, tick);
            if (nearDrop) {
                m.pickup = floor(nearDrop.location);
                m.pickupEntity = nearDrop;
                m.pickupUntil = tick + 60;
                if (this.drops.run(m, tick)) return false;
            }
        }

        if (this.obstructionClear) {
            const obs = this.obstructionClear;
            if (tick - obs.since > 150) { this.obstructionClear = undefined; this.reason = "Obstruction clear timeout - advanced"; return false; }
            if (!obs.cells.length) { this.obstructionClear = undefined; return false; }
            const cell = obs.cells[0];
            const b = this.terrain.block(cell);
            if (!b || b.isAir || isPassable(b.typeId)) { obs.cells.shift(); return false; }
            const r = this.digCell(cell, tick);
            if (r === "digging") { this.reason = `Clearing obstruction ${b.typeId} to reach ${m.block} - advanced`; return false; }
            if (r === "open") { obs.cells.shift(); return false; }
            if (r === "no-tool" || r === "lava" || r === "water" || r === "unreachable" || r === "refused") {
                m.blocked.set(key(obs.target), tick + BLOCKED_TTL);
                m.target = undefined; this.obstructionClear = undefined; return false;
            }
            obs.tries = (obs.tries ?? 0) + 1;
            if (obs.tries > 8) { m.blocked.set(key(obs.target), tick + BLOCKED_TTL); m.target = undefined; this.obstructionClear = undefined; }
            return false;
        }

        if (!m.target) {
            if (m.treeMode && m.broken > 0) {
                const adj = this.findAdjacentLogs(m, tick);
                if (adj) {
                    m.target = adj; m.type = this.terrain.block(adj)?.typeId; m.noTargetSince = tick;
                    this.reason = `Tree: adjacent log ${adj.x},${adj.y},${adj.z} - quick`; return false;
                }
            }
            if (!m.target && (m.treeMode || isWoodRequest(m.block) || m.item === "#logs" || m.block === "#logs")) {
                const woodList = this.terrain.scanOres(this.sim.location, 32, (type, pt) => (isAnyWood(type) || type === "minecraft:deadbush" || type === "minecraft:dead_bush") && (m.blocked.get(key(pt)) ?? 0) <= tick, 500);
                if (woodList.length > 0) {
                    m.target = woodList[0];
                    m.type = this.terrain.block(woodList[0])?.typeId;
                    m.noTargetSince = tick;
                    this.reason = `Tree: instant lock on ${m.type} at ${woodList[0].x},${woodList[0].y},${woodList[0].z}`;
                }
            }
            if (m.underground && this.miner.active && (tick - this.miner.cavityAt < 500 || this.miner.turns >= 3)) m.target = this.veinScan(m, tick);
            if (!m.target) m.target = m.scan.next(this.terrain, (type, p) => this.wantedToMine(m, type, p, tick), 384);
            const lootReady = m.loot.size > 0 && ((!m.target && m.scan.done) || (m.target && horizontal(m.target, this.sim.location) > 2.5) || tick - (m.lootSince ?? tick) > 120);
            if (lootReady && this.drops.flush(m, tick, 6, 20)) return false;
            if (!m.target && m.scan.done && !m.underground) {
                if (!m.far || distance(m.farAt, this.sim.location) > 10) { m.far = new BlockScan(this.sim.location, 20); m.farAt = { ...this.sim.location }; m.farUntil = tick + 200; this.reason = `Nothing within 12; sweeping wider for ${m.item ?? m.block} - advanced`; }
                if (!m.far.done && tick < m.farUntil) m.target = m.far.next(this.terrain, (type, p) => this.wantedToMine(m, type, p, tick), 192);
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
                } else {
                    m.exploring = true; m.peek = undefined; this.explorer.reset(); this.nav.reset(); 
                    this.reason = `Nothing within 20 blocks; exploring for ${m.item ?? m.block} - advanced - never idle`;
                    // Immediately start moving via explorer
                    const result = this.explorer.step(this.sim.location, this.anchor, tick, this.terrain, this.nav, this.settings.range);
                    if (result === "running") return false;
                }
                return false;
            }
            m.type = this.terrain.block(m.target)?.typeId;
        }

        if ((horizontal(m.target, this.sim.location) > 2.5 || tick - (m.lootSince ?? tick) > 120) && this.drops.flush(m, tick, 6, 20)) return false;

        const target = m.target, b = this.terrain.block(target);
        if (!b) { m.target = undefined; m.approach = undefined; m.scan = this.newScan(m); return false; }
        if (b.typeId !== m.type) {
            this.terrain.invalidate(target);
            const wasBreaking = m.breakingSince !== undefined;
            try { this.sim.stopBreakingBlock(); } catch (_e) { this.fault(_e); }
            m.breakingSince = undefined;
            if (wasBreaking) {
                m.broken++; m.noTargetSince = tick;
                if (m.underground) this.miner.turns = 0;
                this.record(`blockChanged:${m.type} - advanced`);
                if (m.treeMode) {
                    const adj = this.findAdjacentLogs(m, tick);
                    if (adj) { m.target = adj; m.type = this.terrain.block(adj)?.typeId; m.approach = undefined; m.approachTry = 0; this.reason = `Tree: log broken, next ${adj.x},${adj.y},${adj.z} - advanced`; return false; }
                }
            }
            m.target = undefined; m.approach = undefined; m.approachTry = 0;
            const stray = this.drops.near(m, center(target), 3.5, tick);
            if (stray) {
                m.pickup = floor(stray.location);
                m.pickupEntity = stray;
                m.pickupUntil = tick + 60;
            } else {
                if (!m.loot.size) m.lootSince = tick;
                m.loot.set(key(target), tick);
                if (m.loot.size > 64) m.loot.delete(m.loot.keys().next().value);
            }
            m.scan = this.newScan(m);
            return false;
        }
        // ===== FRONT BLOCK FIX: directly handle front block without nav failure =====
        // If target is front block (within 5.5 blocks, same level +/-2, horizontal <=4), try direct break
        const head = this.sim.getHeadLocation();
        const at = add(target, { x: 0.5, y: 0.5, z: 0.5 });
        const distHead = distance(head, at);
        const selfFloor = floor(this.sim.location);
        const isFrontBlock = distHead <= 5.5 && Math.abs(target.y - selfFloor.y) <= 2 && horizontal(target, selfFloor) <= 4;

        if (isFrontBlock) {
            // Front blocks are NOT cleared preemptively here - that dug the shaft
            // walls on every descent and could loop forever when the clear dig
            // came back "unreachable". breakThrough() below clears a blocker only
            // when a swing is actually absorbed, then retries the real target.
            // Check obstructions below if mining down
            if (target.y < selfFloor.y) {
                try {
                    const obs = this.terrain.obstructionsBelow ? this.terrain.obstructionsBelow(this.sim.location, target) : [];
                    if (obs.length > 0 && obs.length <= 2) {
                        for (const cell of obs.slice(0,1)) {
                            if (cell.x === target.x && cell.y === target.y && cell.z === target.z) continue;
                            const ob = this.terrain.block(cell);
                            if (ob && !ob.isAir) {
                                const r = this.digCell(cell, tick);
                                if (r === "digging") { this.reason = `Clearing below ${ob.typeId} to reach front ${m.block} - front fix`; return false; }
                            }
                        }
                    }
                } catch (_e) { this.fault(_e); }
            }
            // Direct break attempt for front block - skip nav approach entirely
            // Tool check
            const ruleFront = MINE[b.typeId];
            if (ruleFront && ruleFront.tier > 0) {
                if (!this.bag.tool(ruleFront.tool, ruleFront.tier)) {
                    // Try to obtain better tool
                    try {
                        if (ruleFront.tier >= 2) { const c = this.bag.counts(); if ((c["minecraft:cobblestone"]??0)>=3) { this.obtain("minecraft:stone_pickaxe",1,tick); return false; } }
                        if (ruleFront.tier >= 3) { const c = this.bag.counts(); if ((c["minecraft:iron_ingot"]??0)>=3) { this.obtain("minecraft:iron_pickaxe",1,tick); return false; } }
                    } catch (_e) { this.fault(_e); }
                    m.target = undefined; m.approach = undefined; m.breakingSince = undefined;
                    this.blockTask(`Need ${ruleFront.tool} tier ${ruleFront.tier} for front ${b.typeId}`, "retry");
                    return false;
                }
            }
            if (!m.breakingSince) {
                if (this.breakThrough(target) !== "digging") {
                    // If direct break fails, fall through to normal approach logic
                } else {
                    m.breakingSince = tick;
                    m.approach = undefined; m.approachTry = 0;
                    this.nav.reset();
                    this.reason = `Breaking front ${m.block} at ${target.x},${target.y},${target.z} - direct front fix`;
                    return false;
                }
            } else {
                const timeout = m.treeMode ? 80 : m.block === "minecraft:cobblestone" ? 150 : 200;
                if (tick - m.breakingSince > timeout) {
                    try { this.sim.stopBreakingBlock(); } catch (_e) { this.fault(_e); }
                    m.blocked.set(key(target), tick + BLOCKED_TTL); m.target = undefined; m.approach = undefined; m.breakingSince = undefined; this.record("mining timeout front - advanced");
                }
                return false;
            }
        }

        // Normal safeToMine check (non-front). Head-front walls are not cleared
        // preemptively - breakThrough() handles a real absorbed swing.
        if (!isFrontBlock) {
            if (!this.safeToMine(target)) {
                const obstructions = this.terrain.obstructionsBelow(this.sim.location, target);
                if (obstructions.length > 0 && obstructions.length <= 3) {
                    this.obstructionClear = { target: { ...target }, cells: obstructions.slice(0,3), since: tick };
                    this.reason = `Clearing ${obstructions.length} block(s) to get below - front fix`;
                    return false;
                }
                m.blocked.set(key(target), tick + BLOCKED_TTL); m.target = undefined; m.approach = undefined;
                try { this.sim.stopBreakingBlock(); } catch (_e) { this.fault(_e); } m.breakingSince = undefined; return false;
            }
        }

        // FIX: log breaking bug - don't pillar for tree logs, directly break up to 6 high
        if (m.treeMode && target.y > selfFloor.y + 2 && target.y <= selfFloor.y + 6) {
            // Direct break for tree logs up to 6 high - fixes keeps mining but cant break
            const dy = target.y - selfFloor.y;
            const horiz = horizontal(target, selfFloor);
            if (horiz <= 3) {
                // Look up and break directly
                try {
                    this.sim.lookAtBlock(this.host.relative(center(target)));
                    if (!m.breakingSince) {
                        if (this.sim.breakBlock(this.host.relative(center(target)))) {
                            m.breakingSince = tick;
                            this.nav.reset();
                            this.reason = `Tree: breaking log at ${target.x},${target.y},${target.z} dy=${dy} direct fix - no scaffold`;
                            return false;
                        }
                    } else {
                        if (tick - m.breakingSince > 80) {
                            try { this.sim.stopBreakingBlock(); } catch (_e) { this.fault(_e); }
                            m.blocked.set(key(target), tick + 200); // short TTL for logs, not 1800
                            m.target = undefined;
                            m.breakingSince = undefined;
                        }
                        return false;
                    }
                } catch (_e) { this.fault(_e); }
            }
        }
        if (m.treeMode && target.y > selfFloor.y + 6) {
            // For very high logs >6, try scaffold but with precise logic
            const scaffold = this.builder.scaffoldTo(target, tick);
            if (scaffold === "placed" || scaffold === "jumping") { this.reason = "Scaffolding to reach high log >6 - advanced"; return false; }
        }

        // Approach logic: if target is farther than reach (4.5 blocks), navigate to it!
        if (distance(this.sim.getHeadLocation(), at) > 4.5) {
            const r = this.navTo(center(target), tick, 3.0);
            if (r === "running") {
                this.reason = `Approaching ${m.item ?? m.block} at ${target.x},${target.y},${target.z} - closing distance`;
                return false;
            }
            if (r === "failed") {
                m.approachTry = (m.approachTry ?? 0) + 1;
                if (m.approachTry >= 3) {
                    m.blocked.set(key(target), tick + (m.treeMode ? 200 : BLOCKED_TTL));
                    m.target = undefined;
                    m.approachTry = 0;
                    this.nav.reset();
                    return false;
                }
            }
            if (r === "done") {
                this.nav.reset();
            }
            if (distance(this.sim.getHeadLocation(), at) > 4.5) return false;
        }

        const wasApproaching = !!m.approach || (m.approachTry ?? 0) > 0;
        m.approach = undefined; m.approachTry = 0;
        if (wasApproaching) this.nav.reset();
        const rule = MINE[b.typeId];
        if (rule && rule.tier > 0) {
            const hasTool = this.bag.tool(rule.tool, rule.tier);
            if (!hasTool) {
                const neededTier = rule.tier; const toolName = rule.tool;
                if (neededTier >= 2 && toolName === "pickaxe") {
                    const counts = this.bag.counts();
                    if ((counts["minecraft:cobblestone"] ?? 0) >= 3 || (counts["minecraft:cobbled_deepslate"] ?? 0) >= 3) {
                        this.reason = `Need ${toolName} tier ${neededTier} for ${b.typeId}, crafting stone pickaxe - tier awareness`;
                        try { this.obtain("minecraft:stone_pickaxe", 1, tick); return false; } catch (_e) { this.fault(_e); }
                    } else {
                        this.reason = `Need ${toolName} tier ${neededTier} for ${b.typeId}, need cobblestone`;
                        m.target = undefined;
                        try { 
                            const cobbleSpot = this.terrain.scanOres(this.sim.location, 8, (type) => type === "minecraft:cobblestone" || type === "minecraft:stone", 200);
                            if (cobbleSpot.length) { m.target = cobbleSpot[0]; m.type = "minecraft:cobblestone"; return false; }
                        } catch (_e) { this.fault(_e); }
                    }
                }
                if (neededTier >= 3 && toolName === "pickaxe") {
                    this.reason = `Need ${toolName} tier ${neededTier} for ${b.typeId}, need iron pickaxe`;
                    try { 
                        const counts = this.bag.counts();
                        if ((counts["minecraft:iron_ingot"] ?? 0) >= 3) { this.obtain("minecraft:iron_pickaxe", 1, tick); return false; }
                        else if ((counts["minecraft:raw_iron"] ?? 0) >= 3) { try { this.autonomy.produce("minecraft:raw_iron", 3, tick); return false; } catch (_e) { this.fault(_e); } }
                    } catch (_e) { this.fault(_e); }
                }
                m.target = undefined; m.approach = undefined; m.approachTry = 0;
                if (rule.tier > 0) { this.blockTask(`Need ${rule.tool} tier ${rule.tier}; wooden=1, stone=2, iron=3.`, "retry"); return false; }
                try { this.bag.emptyHand(); } catch (_e) { this.fault(_e); }
            }
        }
        if (!m.breakingSince) {
            if (this.breakThrough(target) !== "digging") { m.blocked.set(key(target), tick + (m.treeMode ? 200 : BLOCKED_TTL)); m.target = undefined; m.approach = undefined; return false; }
            m.breakingSince = tick;
        } else {
            const timeout = m.treeMode ? 80 : m.block === "minecraft:cobblestone" ? 150 : 200;
            if (tick - m.breakingSince > timeout) {
                try { this.sim.stopBreakingBlock(); } catch (_e) { this.fault(_e); }
                m.blocked.set(key(target), tick + (m.treeMode ? 200 : BLOCKED_TTL)); m.target = undefined; m.approach = undefined; m.breakingSince = undefined; this.record("mining timeout quick - advanced");
            }
        }
        const held = this.bag.get(this.sim.selectedSlotIndex);
        if (rule && rule.tier > 0 && (!held?.typeId.endsWith("_pickaxe") || toolTier(held.typeId) < rule.tier)) {
            try { this.sim.stopBreakingBlock(); } catch (_e) { this.fault(_e); }
            this.blockTask("Required pickaxe lost or broken.", "retry");
        }
        return false;
    }

    findAdjacentLogs(m, tick) {
        // Nearest-first 5x6x5 around the last log (150 cached reads, was 294
        // live getBlock() calls in x-major order), first acceptable wins.
        if (!m.target) return null;
        const c = m.target;
        for (const o of LOG_OFFSETS) {
            const p = { x: c.x + o.x, y: c.y + o.y, z: c.z + o.z };
            const t = this.terrain.typeAt(p);
            if (!t || t === "minecraft:air") continue;
            // Only real wood cells: a #logs task must never chase leaves/grass/stone.
            const woodish = t.endsWith("_log") || t.endsWith("_wood") || t.endsWith("_stem") || t.endsWith("_hyphae") || t.includes("bamboo");
            if (!woodish && t !== m.block && !(m.item && t === m.item)) continue;
            const blockedUntil = m.blocked.get(key(p)) ?? 0;
            if (blockedUntil > tick && blockedUntil - tick > 200) continue; // allow retry after short block
            if (this.safeToMine(p)) return p;
        }
        return null;
    }

    wantedToMine(m, type, p, tick) {
        const r = MINE[type];
        if (!r && !isAnyWood(type) && type !== "minecraft:bamboo" && type !== "minecraft:deadbush" && type !== "minecraft:dead_bush") return false;
        // FIX: #logs handling - any log acceptable, fixes oak-only waste
        let wanted = false;
        if (m.block === "#logs" || m.item === "#logs") {
            wanted = isAnyWood(type) || type.includes("bamboo");
        } else if (m.item) {
            wanted = matches(r?.drops ?? type, m.item);
            if (!wanted && isWoodRequest(m.block) && isAnyWood(type)) wanted = true;
            if (!wanted && m.block && m.block.includes("stick") && (type === "minecraft:deadbush" || type === "minecraft:dead_bush")) wanted = true;
            if (!wanted && m.block && m.block.includes("_planks") && isAnyWood(type)) wanted = true;
            if (!wanted && m.item === "#logs" && isAnyWood(type)) wanted = true;
        } else {
            wanted = type === m.block;
            if (!wanted && m.block === "#logs" && isAnyWood(type)) wanted = true;
            if (!wanted && isWoodRequest(m.block) && isAnyWood(type)) wanted = true;
            if (!wanted && m.block && m.block.includes("stick") && (type === "minecraft:deadbush" || type === "minecraft:dead_bush")) wanted = true;
            if (!wanted && m.block && m.block.includes("_planks") && isAnyWood(type)) wanted = true;
        }
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
        if (!this.safeToMine(p)) return false;
        if (m.treeMode) return true;
        const exposed = [...CARDINAL, { x: 0, y: 1, z: 0 }, { x: 0, y: -1, z: 0 }].some((d) => {
            const b = this.terrain.block(add(p, d));
            return !b || b.isAir || isPassable(b.typeId) || b.typeId.includes("leaves");
        });
        return exposed;
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
        // Memory sweep every 80 ticks from cached snapshots (was 40 ticks of live reads).
        if (!this.memory || tick % 80 !== 40) return;
        const base = floor(this.sim.location), dim = this.sim.dimension.id;
        for (let dx = -5; dx <= 5; dx++) for (let dz = -5; dz <= 5; dz++) {
            if (dx * dx + dz * dz > 27) continue;
            for (let dy = -2; dy <= 2; dy++) {
                const at = { x: base.x + dx, y: base.y + dy, z: base.z + dz };
                const t = this.terrain.typeAt(at);
                if (!t || t === "minecraft:air") continue;
                const kind = OBSERVED.get(t);
                if (kind) this.memory.notice(kind, at, dim, tick);
                else if (t.endsWith("_bed") || t === "minecraft:bed") this.memory.notice("bed", at, dim, tick);
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
        try { counts = this.bag.counts(); } catch (_e) { this.fault(_e); }
        let where, dim;
        try { where = { ...this.sim.location }; dim = this.sim.dimension.id; } catch { where = this.lastKnown?.p; dim = this.lastKnown?.dim; }
        if (!where || !dim) return;
        try { this.memory?.setDeath(where, dim, system.currentTick, counts); } catch (_e) { this.fault(_e); }
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
        // SPEEDRUN: don't waste time digging shelter, keep running
        if (this.mode === "speedrun" && this.settings.speedrun) {
            this.campState = undefined;
            return false;
        }
        if (!this.isNight() || this.threat) { if (this.campState?.sealed) this.parkCamp(); else this.campState = undefined; return false; }
        if (this.terrain.threatInfo(this.sim, this.owner()).count) { this.campState = undefined; return false; }
        const s = this.campState ?? (this.campState = { stage: "seek", since: tick, actionSince: tick, tried: new Set(), announced: false, });
        if (s.stage !== "seek" && s.f2 && !this.hands.nearCell(s.f2, 3.5, 2.5)) { s.stage = "seek"; s.actionSince = tick; }
        this.state = "camp";
        switch (s.stage) {
            case "seek": return this.campSeek(s, tick);
            case "dig1": case "dig2": this.campDig(s, tick); return true;
            case "enter":
                if (this.hands.nearCell(s.f2)) { s.stage = "seal"; s.actionSince = tick; }
                else if (tick - s.actionSince > 160) { s.tried.add(s.dirKey); s.stage = "seek"; }
                else { this.reason = "Camping: stepping into the shelter."; try { this.sim.moveToLocation(this.host.relative(center(s.f2)), { faceTarget: true }); } catch (_e) { this.fault(_e); } }
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
        if (s.bed === undefined) s.bed = this.bag.find((x) => x.typeId.endsWith("_bed") || x.typeId === "minecraft:bed");
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
        try { this.sim.stopMoving(); } catch (_e) { this.fault(_e); }
        if (s.sealed) { this.reason = "Camping: sealed in until dawn."; if (!this.isNight()) { s.stage = "exit"; s.actionSince = tick; } return; }
        if (s.bedCell && !s.sleepTried && tick - s.actionSince > 10) {
            s.sleepTried = true;
            const bed = this.terrain.block(s.bedCell);
            if (bed && (bed.typeId.endsWith("_bed") || bed.typeId === "minecraft:bed")) { try { if (typeof this.sim.interactWithBlock === "function" && !this.isSleeping()) this.sim.interactWithBlock(bed); } catch (_e) { this.fault(_e); } }
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
            if (tick - s.actionSince > 40) { s.actionSince = tick; try { const bed = this.terrain.block(s.bedCell); if (bed && typeof this.sim.interactWithBlock === "function") this.sim.interactWithBlock(bed); } catch (_e) { this.fault(_e); } }
            return;
        }
        if (s.p && !this.hands.nearCell(s.p)) {
            if (tick - s.actionSince > 200) { this.campState = undefined; this.record("camp: left the shelter"); return; }
            try { this.sim.moveToLocation(this.host.relative(center(s.p)), { faceTarget: true }); } catch (_e) { this.fault(_e); } return;
        }
        this.campState = undefined; this.lastBranch = ""; this.record("camp: left the shelter");
    }
    unseal(tick) {
        const cell = this.escapeSeal;
        if (!this.sim.isValid) { this.escapeSeal = undefined; return false; }
        const b = this.terrain.block(cell);
        if (!b) { this.reason = "Waiting to reopen the camp shelter (area not loaded)."; return true; }
        if (b.isAir) { this.escapeSeal = undefined; this.swingCell = undefined; this.stopActions(); this.lastBranch = ""; this.record("camp: shelter opened"); return false; }
        if (tick - this.sealSince > 400 || b.isLiquid) { 
            this.escapeSeal = undefined; 
            this.record("Sealed in timeout, opening robustly");
            try { this.sim.stopMoving(); } catch (_e) { this.fault(_e); }
            this.nav.reset();
            return true; 
        }
        this.state = "camp"; this.reason = "Opening the camp shelter again."; this.nav.reset();
        const r = this.swing(cell, tick);
        if (r === "no-tool" || r === "unreachable") { 
            this.escapeSeal = undefined; 
            this.record("Sealed in failed: " + this.lastDigReason + ", retrying");
            this.nav.reset();
        }
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
        if (this.bag.container.emptySlotsCount < 1) { 
            try { this.resource.organizeIfNeeded(); } catch (_e) { this.fault(_e); }
            this.reason = "Inventory full during recovery, organizing";
            return; 
        }
        const drops = this.sim.dimension.getEntities({ type: "minecraft:item", location: { x: grave.x, y: grave.y, z: grave.z }, maxDistance: 12 }).filter((e) => e.isValid);
        if (drops.length) {
            this.recoverSeen++; this.recoverSince = tick;
            drops.sort((a, b) => distance(a.location, this.sim.location) - distance(b.location, this.sim.location));
            const near = drops[0];
            if (distance(near.location, this.sim.location) > 1.2) {
                this.reason = `Recovering drops: ${drops.length} within range of death point ${grave.x},${grave.y},${grave.z} - unbreakable`;
                const r = this.navTo(near.location, tick, 1);
                if (r === "failed" || r === "blocked") {
                    // UNBREAKABLE RECOVERY: Never give up, always find a way
                    const navReason = this.nav.reason ?? "";
                    // If bridging needs blocks, mine nearby blocks for building
                    if (navReason.includes("bridging") || navReason.includes("blocks") || navReason.includes("Gap requires")) {
                        // Try to mine nearby dirt/cobble/logs for bridging
                        try {
                            const nearBlocks = this.terrain.scanOres(this.sim.location, 8, (type) => {
                                return type === "minecraft:dirt" || type === "minecraft:grass_block" || type === "minecraft:cobblestone" || type === "minecraft:stone" || type.endsWith("_log") || type === "minecraft:sand" || type === "minecraft:gravel" || type === "minecraft:coarse_dirt" || type === "minecraft:netherrack";
                            }, 300);
                            if (nearBlocks.length > 0) {
                                const target = nearBlocks[0];
                                const b = this.terrain.block(target);
                                this.reason = `Recovery needs blocks for bridging, mining ${b?.typeId ?? "block"} at ${target.x},${target.y},${target.z} - unbreakable`;
                                const digRes = this.digCell(target, tick);
                                if (digRes === "digging") return;
                                const nav2 = this.nav.go(center(target), tick);
                                if (nav2 !== "failed") return;
                            }
                        } catch (_e) { this.fault(_e); }
                        // Try builder to place if we have blocks now
                        if (this.builder?.canBuild) {
                            try {
                                const p = floor(this.sim.location);
                                const dir = { x: Math.sign(near.location.x - p.x), y: 0, z: Math.sign(near.location.z - p.z) };
                                if (dir.x !== 0 || dir.z !== 0) {
                                    const br = this.builder.bridge(dir, tick);
                                    if (br === "placed" || br === "placed_support") {
                                        this.reason = "Recovery bridging with blocks - unbreakable";
                                        return;
                                    }
                                }
                            } catch (_e) { this.fault(_e); }
                        }
                        // Try alternative path via explorer or larger search
                        if (tick % 60 === 0) {
                            this.explorer.reset();
                            this.terrain.clear();
                        }
                        this.reason = `Recovery: gap needs blocks, mining nearby for bridge material - ${navReason} - unbreakable retry`;
                        // Don't blockTask, just retry with pushToward as fallback
                        this.nav.reset();
                        if (distance(near.location, this.sim.location) <= 16 && this.recoverPush++ < 400) {
                            this.drops.pushToward(near.location);
                            return;
                        }
                        this.recoverPush = 0;
                        // Last resort: try to go via water/boat if water gap
                        if (this.terrain.waterNear(floor(this.sim.location)) || this.sim.isInWater) {
                            const boatRes = this.escaper.boat(tick);
                            if (boatRes) {
                                this.reason = "Recovery water gap, trying boat - unbreakable";
                                return;
                            }
                        }
                        // Never hard fail - keep retrying
                        return;
                    }
                    // For other failures, try workaround then retry
                    this.nav.reset();
                    if (distance(near.location, this.sim.location) <= 16 && this.recoverPush++ < 400) {
                        this.drops.pushToward(near.location);
                        this.reason = `Recovery pushToward ${Math.round(distance(near.location, this.sim.location))}b - unbreakable`;
                    } else {
                        // Try to break obstruction if any
                        try {
                            const obstruct = this.terrain.findObstructions(this.sim.location, near.location);
                            if (obstruct.length > 0 && obstruct.length <= 3) {
                                for (const cell of obstruct) {
                                    const b = this.terrain.block(cell);
                                    if (!b || b.isAir) continue;
                                    if (b.typeId === "minecraft:obsidian") continue;
                                    if (isUnbreakable(b.typeId)) continue;
                                    const score = retainScore(b.typeId);
                                    if (score >= 80) continue;
                                    const dr = this.digCell(cell, tick);
                                    if (dr === "digging") {
                                        this.reason = `Recovery breaking ${b.typeId} to reach drops - unbreakable`;
                                        return;
                                    }
                                }
                            }
                        } catch (_e) { this.fault(_e); }
                        this.recoverPush = 0;
                        this.reason = `Recovery retrying - ${this.nav.reason} - unbreakable, will mine blocks or find alternative`;
                        // Don't blockTask permanently, just keep trying - unbreakable
                        if (tick % 100 === 0) {
                            this.explorer.reset();
                            this.terrain.clear();
                        }
                    }
                } else this.recoverPush = 0;
            } else { this.reason = `Picking up drops: ${drops.length} within range - unbreakable recovery`; }
            return;
        }
        if (this.recoverSince && tick - this.recoverSince < 60) { this.reason = "Sweeping death point for remaining drops - unbreakable"; return; }
        const found = this.recoverSeen > 0;
        this.memory?.clearDeath(); this.recoverTarget = undefined;
        if (this.postDeath) { this.tell(found ? "Recovered what drops remained." : "No drops remained at death point."); this.resumePlan(tick); return; }
        this.stop(found ? "Death point swept; drops collected." : "No drops remained at death point."); this.tell(this.reason);
    }
    attach(sim) {
        // Rebuild every sim-bound module: half-updated references (old nav with
        // a new terrain, old directors with a dead bag) made post-respawn
        // behaviour erratic. Mirrors the constructor, including the live clock
        // and the cross-module wiring done after construction.
        this.sim = wrapSim(sim);
        this.bag = new Bag(sim);
        this.terrain = new Terrain(sim.dimension);
        this.terrain.clock = () => system.currentTick;
        this.nav = new Navigator(sim, this.host, this.terrain);
        this.escaper = new Escaper(this);
        this.miner = new Miner(this);
        this.drops = new Drops(this);
        this.scout = new Scout(this);
        this.hands = new Hands(this);
        this.equipment = new Equipment(sim, this.bag);
        this.autonomy = new SurvivalDirector(this);
        this.builder = new Builder(this);
        this.combat = new Combat(this);
        this.looting = new Looting(this);
        this.parkour = new Parkour(this);
        this.deepMiner = new DeepMiner(this);
        this.resource = new ResourceManager(this);
        this.speedrun = new SpeedrunDirector(this);
        this.awareness = new WorldAwareness(this);
        this.structures = new StructureDetector(this);
        this.survivalMaster = new SurvivalMaster(this);
        this.nether = new NetherDirector(this);
        this.village = new VillageDirector(this);
        this.golem = new GolemDirector(this);
        this.food = new FoodDirector(this);
        this.bucket = new BucketDirector(this);
        this.ui = new UI(this);
        this.nav.builder = this.builder;
        this.escaper.builder = this.builder;
        this.arbiter?.reset();
        this.goalTree = null;
        this.currentGoal = null;
        this.threat = undefined;
        this.boatTrip = undefined;
        this.swingCell = undefined;
        this.grab = undefined;
    }
    aliveSim() {
        const hp = (e) => { try { return e.getComponent(EntityComponentTypes.Health)?.currentValue ?? 0; } catch { return 0; } };
        try { if (this.sim.isValid && hp(this.sim) > 0) return this.sim; } catch (_e) { this.fault(_e); }
        try { const byId = world.getEntity(this.sim.id); if (byId?.isValid && byId.typeId === "minecraft:player" && hp(byId) > 0) return byId; } catch (_e) { this.fault(_e); }
        try { const found = world.getAllPlayers().find((q) => (q.name === "Verdant" || q.name === this.sim?.name) && q.hasTag("verdant.bot") && hp(q) > 0); if (found?.isValid) return found; } catch (_e) { this.fault(_e); }
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
        try { this.stopActions(); } catch (_e) { this.fault(_e); }
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
        } else { try { this.sim.moveToLocation(this.host.relative({ x: target.x, y: this.sim.location.y, z: target.z }), { faceTarget: true }); } catch (_e) { this.fault(_e); } }
        this.reason = "Crossing open water by boat."; return true;
    }
    waterAhead(target) {
        const p = floor(this.sim.location);
        const dx = target.x - this.sim.location.x, dz = target.z - this.sim.location.z;
        const len = Math.hypot(dx, dz);
        // If already in water, any water ahead should trigger boat, even for short distance
        if (this.sim.isInWater) {
            // Check if target is across water
            const hit = this.waterAt(p) ?? this.waterAt({ x: p.x, y: p.y - 1, z: p.z });
            if (hit) return hit;
            // Also check path to target for water
            const ux = len > 0 ? dx / len : 0, uz = len > 0 ? dz / len : 0;
            for (const n of [1, 2, 3, 4]) {
                const q = { x: Math.floor(p.x + ux * n), y: p.y, z: Math.floor(p.z + uz * n) };
                const h = this.waterAt(q);
                if (h) return h;
            }
        }
        if (len < 5) return undefined; // reduced from 8 to 5 for following
        const ux = dx / len, uz = dz / len;
        let water = 0, first;
        for (const n of [2, 4, 6, 8, 10, 12]) {
            const q = { x: Math.floor(p.x + ux * n), y: p.y, z: Math.floor(p.z + uz * n) };
            const hit = this.waterAt(q);
            if (hit) { water++; first ??= hit; }
        }
        return water >= 3 ? first : undefined; // reduced from 4 to 3
    }
    waterAt(p) {
        for (const y of [p.y, p.y - 1]) {
            const b = this.terrain.block({ x: p.x, y, z: p.z });
            if (b && b.isLiquid && /water/.test(b.typeId)) return { x: p.x, y, z: p.z };
        }
        return undefined;
    }
    ridingBoat() {
        try { const ride = this.sim.getComponent("minecraft:riding")?.entityRidingOn; if (ride?.isValid && isBoatEntity(ride.typeId)) return ride; } catch (_e) { this.fault(_e); }
        return undefined;
    }
    onGround(boat) { try { return this.sim.isOnGround || (boat?.isOnGround ?? false); } catch { return false; } }
    boardBoat(tick) {
        // findBoat is a shared free function in world.js (same one Escaper uses),
        // not a method on Escaper - calling it as a method crashed with
        // "TypeError ... is not a function" at boarding time (circuit breaker).
        const existing = findBoat(this.sim);
        if (existing) { if (this.escaper.mount(existing)) { this.reason = "Boarding a boat for the crossing."; return "boarded"; } return "waiting"; }
        let slot = this.bag.find((s) => s.typeId.endsWith("_boat") || s.typeId.endsWith("_raft"));
        if (slot < 0) {
            // Try any boat type, not just oak - unbreakable
            const boatTypes = ["minecraft:oak_boat","minecraft:birch_boat","minecraft:spruce_boat","minecraft:jungle_boat","minecraft:acacia_boat","minecraft:dark_oak_boat","minecraft:mangrove_boat","minecraft:cherry_boat","minecraft:bamboo_raft"];
            if (this.settings.assistedCrafting) {
                for (const bt of boatTypes) {
                    try { this.craft(bt, 1); slot = this.bag.find((s) => s.typeId.endsWith("_boat") || s.typeId.endsWith("_raft")); if (slot >=0) break; } catch (_e) { this.fault(_e); }
                }
                // Try craft planks from logs if no boat
                if (slot < 0) {
                    const logs = this.bag.find((s) => s.typeId.endsWith("_log") || s.typeId.endsWith("_wood") || s.typeId.endsWith("_stem") || s.typeId.endsWith("_hyphae"));
                    if (logs >= 0) {
                        try {
                            const logType = this.bag.get(logs).typeId;
                            const plankType = logType.includes("_log") ? logType.replace("_log", "_planks")
                                : logType.includes("_stem") ? logType.replace("_stem", "_planks")
                                : logType.includes("_hyphae") ? logType.replace("_hyphae", "_planks")
                                : logType.replace("_wood", "_planks")
                            this.craft(plankType, 4);
                            for (const bt of boatTypes) {
                                try { this.craft(bt, 1); slot = this.bag.find((s) => s.typeId.endsWith("_boat") || s.typeId.endsWith("_raft")); if (slot >=0) break; } catch (_e) { this.fault(_e); }
                            }
                        } catch (_e) { this.fault(_e); }
                    }
                }
            }
            if (slot < 0) return "none";
        }
        const water = this.waterAt(this.sim.location) ?? this.waterAt(floor(this.sim.location)) ?? this.waterAt({ x: floor(this.sim.location).x, y: floor(this.sim.location).y - 1, z: floor(this.sim.location).z });
        const cell = water ?? this.boatTrip?.water;
        if (!cell) return "none";
        const selected = this.bag.select(slot);
        try {
            this.sim.lookAtBlock(this.host.relative(center(cell)));
            this.sim.useItemInSlot(selected);
            this.reason = "Floating a boat for the crossing - unbreakable water travel";
            if (tick - this.boatTrip.since > 120) return "none";
            return "waiting";
        } catch { return "none"; }
    }
    abortBoat(reason) {
        const boat = this.ridingBoat();
        if (boat) {
            try { const rideable = boat.getComponent("minecraft:rideable"); if (rideable?.ejectRider) rideable.ejectRider(this.sim); else if (rideable?.ejectRiders) rideable.ejectRiders(); } catch (_e) { this.fault(_e); }
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
    // Ultra efficient counts cache per tick
    getCountsCached(tick) {
        if (this._countsCacheTick !== tick) {
            this._countsCache = this.bag.usableCounts();
            this._countsCacheTick = tick;
        }
        return this._countsCache;
    }
    obtain(target, amount, tick) {
        if (!this.settings.assistedCrafting) { this.blockTask("Assisted crafting must be enabled for autonomous dependencies."); return false; }
        // NEVER demand a specific wood: any log/planks request becomes a wildcard so a
        // birch/spruce/... world can never stall or complain about oak.
        if (typeof target === "string") {
            if (target.endsWith("_planks")) target = "#planks";
            else if (target === "minecraft:bamboo" || target === "minecraft:bamboo_block" || target.endsWith("_log") || target.endsWith("_wood") || target.includes("_stem") || target.endsWith("_hyphae")) target = "#logs";
        }
        const work = target + ":" + amount;
        if (this.workKey !== work) { this.cancelWork(); this.workKey = work; }
        if (this.pendingTable) {
            if (this.terrain.block(this.pendingTable.p)?.typeId === id("crafting_table")) { this.tablePosition = { ...this.pendingTable.p }; this.pendingTable = undefined; }
            else if (tick - this.pendingTable.tick > 30) { this.pendingTable = undefined; this.blockTask("Table placement not observed. Inspect location/item before resuming."); }
            return false;
        }
        if (amountOf(this.getCountsCached(tick), target) >= amount) { this.cancelWork(); return true; }
        if (this.mining) { if (this.mine(this.mining, tick)) { this.mining = undefined; this.stopActions(); } return false; }

        // GOAL DECOMPOSITION: structured hierarchy with tagged requirements
        try {
            if (!this.goalTree || this.goalTree.id !== target) {
                this.goalTree = decomposeMission(target, this.bag.counts());
                if (this.goalTree) {
                    const missing = analyzeRequirements(this.goalTree, this.bag.counts(), { near_table: this.terrain.tableNear(this.sim.location), inventory_space: this.bag.container.emptySlotsCount });
                    if (missing.length) {
                        this.record(`Goal ${target} decomposition: ${missing.length} missing - ${missing.slice(0,3).map(m=>m.path).join(", ")}`);
                    }
                }
            }
        } catch (_e) { this.fault(_e); }
        const nearTable = this.terrain.tableNear(this.sim.location);
        const tableBlock = this.tablePosition ? this.terrain.block(this.tablePosition) : undefined;
        if (tableBlock && tableBlock.typeId !== id("crafting_table")) this.tablePosition = undefined;
        const step = nextStep(target, amount, this.getCountsCached(tick), nearTable || !!this.tablePosition);
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
        // Wider candidate set (8 directions, radius 1-3): our own mining leaves craters, so the
        // old fixed 4 spots were often all unusable and the bot retried in place forever.
        const dirs = COMPASS.filter((d) => d.y === 0);
        const candidates = [];
        for (const d of dirs) for (let r = 1; r <= 3; r++) candidates.push(add(base, { x: d.x * r, y: 0, z: d.z * r }));
        const p = candidates.find((q) => this.terrain.safe(q) && distance(this.sim.location, center(q)) > 1 && this.terrain.line(this.sim.getHeadLocation(), add(q, { x: 0.5, y: -0.01, z: 0.5 }), add(q, { x: 0, y: -1, z: 0 })));
        if (!p) {
            // No usable ground here: move to open ground and retry - never a silent retry loop.
            let dest;
            for (let r = 2; r <= 8 && !dest; r++) for (const d of dirs) { const q = add(base, { x: d.x * r, y: 0, z: d.z * r }); if (this.terrain.safe(q)) { dest = q; break; } }
            if (dest) { this.reason = "Table spot blocked (craters) - relocating to place it"; this.navTo(center(dest), tick, 1); }
            else if (distance(this.sim.location, this.home()) > 3) { this.reason = "Table spot blocked - returning to base to place it"; this.navTo(this.home(), tick, 2); }
            else this.reason = "No safe place for table - searching for open ground";
            if (!this.placeLogTick || tick - this.placeLogTick > 120) { this.record("Looking for open ground to place the table"); this.placeLogTick = tick; }
            this.placeTries = (this.placeTries ?? 0) + 1;
            if (this.placeTries > 8) { this.placeTries = 0; this.tablePosition = undefined; }
            this.pendingTable = undefined;
            return;
        }
        this.placeTries = 0;
        const slot = this.bag.select(this.bag.find((s) => s.typeId === id("crafting_table")));
        const ground = add(p, { x: 0, y: -1, z: 0 });
        try { this.sim.lookAtBlock(this.host.relative(ground)); } catch {}
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
        } catch (_e) { this.fault(_e); }
    }

    /**
     * One seeded stream for legacy-brain choices. Determinism matters even here:
     * a patrol that differs on every reload cannot be debugged. Seeded from the
     * session seed and this bot's owner, so a reload repeats the same walk.
     */
    seededRng() {
        if (!this.rng)
            this.rng = new Rng(mix(this.host?.seed ?? 0, this.ownerName ?? "verdant"));
        return this.rng;
    }

    // ------------------------------------------------------------- skill system

    /**
     * True when the skill scheduler should drive this tick: either the operator
     * selected it (`!bot engine skills`), or a single skill is running (started
     * with `!bot skill run`, which works in legacy mode too and hands control
     * back the moment the skill finishes).
     */
    usingSkills() {
        if (typeof this.sim?.moveToLocation !== "function")
            return false;
        if (this.settings.engine === "skills")
            return true;
        return !!(this.skills && (this.skills.scheduler.active || this.skills.scheduler.forced));
    }
    /** Build the skill runtime on first use: a bot that never uses it pays nothing. */
    ensureSkills() {
        if (this.skills)
            return this.skills;
        try {
            this.skills = new SkillRunner(this);
        }
        catch (e) {
            this.record(`skill runtime unavailable: ${e?.message ?? e}`);
            this.skills = null;
        }
        return this.skills;
    }
    tickSkills(tick) {
        const runner = this.ensureSkills();
        if (!runner)
            return;
        const result = runner.tick();
        if (result?.status === "failed" && result.reason)
            this.reason = `skill failed: ${result.reason}`;
        if (this.skillRequest) {
            const done = this.skillRequest;
            this.skillRequest = null;
            if (result?.status && result.status !== "running")
                this.tell(`skill ${done.id ?? ""}: ${result.message ?? result.reason ?? result.status}`);
        }
    }
    skillStatus() {
        return this.ensureSkills()?.status() ?? null;
    }
    skillExplain() {
        return this.ensureSkills()?.explain() ?? null;
    }
    /** Run one named skill (owner command). Returns a short report string. */
    runSkill(id) {
        this.skillRequest = { id };
        const runner = this.ensureSkills();
        if (!runner)
            return "skill runtime unavailable";
        const started = runner.run(id);
        return started.ok ? `started ${started.skill}` : `cannot start '${id}': ${started.reason}`;
    }
    stopSkills(reason = "owner stop") {
        return this.ensureSkills()?.stop(reason) ?? null;
    }
}

export { Bot as default };
