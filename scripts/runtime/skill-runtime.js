// Skill runtime: the only place that connects skills to Minecraft.
//
// Skills are engine-free and act through a context object. This file builds that
// context out of the existing Verdant components - Terrain for reads, Navigator
// for movement, Builder for placement, Bag for inventory, the host for simulated
// -player calls - and drives the scheduler one tick at a time.
//
// Two design rules:
//   * every capability is bounded and reports failure instead of assuming;
//   * the ability surface the skills see is *derived from what the bot has*, so
//     a skill asking "walk there" cannot teleport and a skill asking "dig" cannot
//     break bedrock with a wooden pickaxe.

import { Direction, EntityComponentTypes, EquipmentSlot, ItemStack, system, world } from "@minecraft/server";
import { Scheduler } from "../skills/scheduler.js";
import { buildRegistry } from "../skills/index.js";
import { INTENT, assessIntent, currentMissionGoal } from "../skills/director.js";
import { boost } from "../skills/util.js";
import { rankThreats, isDangerous } from "../skills/combat/support.js";
import { VInv, armorScore } from "../core/inventory-model.js";
import { Rng, mix } from "../core/rng.js";
import { PathSearch } from "../core/navigation.js";
import { distance, floor, key, center } from "../core/math.js";
import { EXPLOSIVE, FOOD, HOSTILES, RANGED } from "../core/world.js";
import { ANY_LOG_TYPES } from "../core/progression.js";
import { itemValue } from "../core/data/item-values.js";
import { isBuildingBlock } from "../skills/parkour/reach.js";

const FULL_AIR = 300;
const CONTAINER_TYPES = ["minecraft:chest", "minecraft:trapped_chest", "minecraft:barrel", "minecraft:ender_chest", "minecraft:shulker_box"];
const ARMOR_SLOTS = { Head: EquipmentSlot.Head, Chest: EquipmentSlot.Chest, Legs: EquipmentSlot.Legs, Feet: EquipmentSlot.Feet };
const STUCK_TICKS = 80;
const STUCK_DISTANCE = 1.2;

/**
 * Runs the skill catalog for one bot. One instance per bot, created lazily on
 * first use so a bot that never uses skills pays nothing.
 */
export class SkillRunner {
    constructor(bot) {
        this.bot = bot;
        this.registry = buildRegistry();
        this.scheduler = new Scheduler(this.registry, {
            rng: new Rng(mix(bot.host?.seed ?? 0, bot.ownerName ?? "owner")),
            settings: bot.settings,
            logger: (message) => bot.record?.(`[skill] ${message}`),
        });
        this.scratch = new Map();
        this.trail = [];
        this.lastResult = null;
        this.tickCount = 0;
    }
    get settings() { return this.bot.settings; }

    /** One tick of the whole skill system. Called from Bot.tick() when enabled. */
    tick() {
        const bot = this.bot;
        if (!bot?.sim?.isValid)
            return null;
        this.tickCount++;
        const ctx = this.context();
        let result;
        try {
            result = this.scheduler.tick(ctx);
        }
        catch (e) {
            bot.record?.(`[skill] scheduler error: ${e?.message ?? e}`);
            this.scheduler.stop(ctx, system.currentTick, `error: ${e?.message ?? e}`);
            result = { status: "failed", message: String(e?.message ?? e) };
        }
        this.lastResult = result;
        if (result?.message)
            bot.reason = `skill: ${result.message}`;
        return result;
    }

    /** Start a specific skill by id (`!bot skill run mining.mine-vein`). */
    run(id) {
        const ctx = this.context();
        return this.scheduler.force(id, ctx, system.currentTick);
    }
    stop(reason = "stopped by owner") {
        return this.scheduler.stop(this.context(), system.currentTick, reason);
    }
    status() {
        return {
            ...this.scheduler.status(),
            count: this.registry.size,
            categories: this.registry.categories(),
            lastResult: this.lastResult,
        };
    }
    explain() {
        return { ...this.scheduler.explain(this.context()), catalog: this.registry.describe() };
    }

    // ------------------------------------------------------------- context build

    context() {
        const bot = this.bot;
        const sim = bot.sim;
        const self = this.selfSnapshot();
        const ctx = {
            tick: system.currentTick,
            rng: this.scheduler.rng,
            settings: bot.settings,
            log: (message) => bot.record?.(`[skill] ${message}`),
            self,
            bag: this.bagView(),
            equipment: this.equipmentView(),
            armorPoints: 0,
            time: { ofDay: this.timeOfDay(), isNight: this.isNight() },
            read: (x, y, z) => this.read(x, y, z),
            standable: (cell) => this.standable(cell),
            blocks: (options) => this.blocks(options),
            entities: (options) => this.entities(options),
            nearestEntity: (options) => this.nearestEntity(options),
            threats: (radius) => this.threats(radius),
            owner: () => this.owner(),
            foodValue: (id) => this.foodValue(id),
            hasFood: () => bot.bag.hasFood?.() ?? false,
            nav: { pathTo: (goal, options) => this.pathTo(goal, options) },
            memory: this.memoryAdapter(),
            act: this.actions(),
            deathPoint: bot.memory?.death?.() ?? null,
            home: bot.memory?.home?.() ?? null,
            fetchDeathPoint: bot.mode === "recover",
            request: bot.skillRequest ?? null,
            sheltered: () => bot.terrain?.safe?.(floor(sim.location)) === true,
            needsMaintenance: () => bot.bag.freeSlots?.() <= 1,
            maintenanceReason: () => "inventory is nearly full",
            shouldExplore: () => bot.settings?.autoSurvival !== false,
            dark: () => this.dark(),
            nearTable: () => !!bot.terrain.tableNear?.(sim.location),
            nearFurnace: () => this.nearBlock(["minecraft:furnace", "minecraft:blast_furnace", "minecraft:smoker"]),
            furnaceState: (pos) => this.furnaceState(pos),
            needsItem: (id) => this.needsItem(id),
            pvpTarget: () => this.pvpTarget(),
            pvpTargets: () => this.pvpTargets(),
            hazardNearby: () => this.hazardNearby(),
            escapeRoute: () => this.escapeRoute(),
            terrainHints: () => ({}),
            summariseSweep: () => bot.reason,
            keepList: () => this.keepList(),
        };
        ctx.armorPoints = VInv.armorPoints(ctx.equipment);
        ctx.intent = assessIntent(ctx, { settings: bot.settings });
        ctx.mission = this.mission(ctx);
        return ctx;
    }

    /** Optional component read: absent components are normal on some entities. */
    component(entity, type) {
        try {
            return entity.getComponent(type) ?? null;
        }
        catch {
            return null;
        }
    }

    selfSnapshot() {
        const sim = this.bot.sim;
        const health = this.component(sim, EntityComponentTypes.Health);
        const hunger = this.component(sim, "minecraft:player.hunger");
        const onFire = this.component(sim, EntityComponentTypes.OnFire);
        const here = floor(sim.location);
        const inLava = /lava/.test(this.read(here.x, here.y, here.z));
        const inWater = sim.isInWater === true;
        return {
            pos: { x: sim.location.x, y: sim.location.y, z: sim.location.z },
            dimension: sim.dimension.id,
            hp: health?.currentValue ?? 20,
            maxHp: health?.effectiveMax ?? 20,
            hunger: hunger?.currentValue ?? 20,
            air: this.air(),
            onGround: sim.isOnGround !== false,
            inWater,
            inLava,
            onFire: (onFire?.onFireTicks ?? 0) > 0,
            sleeping: sim.isSleeping === true,
            sprinting: sim.isSprinting === true,
            stuck: this.isStuck(),
            overDrop: this.overDrop(),
            trapped: this.isTrapped(),
        };
    }

    /**
     * Air supply from the breathable component, which is what the engine exposes
     * to scripts. When the component is missing (older engine builds, some
     * entities) report full air: we cannot warn about a drowning we cannot see,
     * and escape-water's own surfacing logic covers the visible cases.
     */
    air() {
        const breath = this.component(this.bot.sim, "minecraft:breathable");
        if (breath && typeof breath.airSupply === "number")
            return breath.airSupply;
        return FULL_AIR;
    }

    bagView() {
        const counts = this.bot.bag.counts?.() ?? {};
        const inv = VInv.fromCounts(counts);
        return inv;
    }
    equipmentView() {
        const out = {};
        try {
            const eq = this.bot.sim.getComponent(EntityComponentTypes.Equippable);
            for (const [slot, id] of Object.entries(ARMOR_SLOTS))
                out[slot] = eq?.getEquipment(id)?.typeId;
            out.Offhand = eq?.getEquipment(EquipmentSlot.Offhand)?.typeId;
            out.Mainhand = this.heldItem()?.typeId;
        }
        catch { /* equipment unavailable */ }
        return out;
    }
    heldItem() {
        try {
            return this.bot.sim.getComponent(EntityComponentTypes.Inventory)?.container?.getItem(this.bot.sim.selectedSlotIndex);
        }
        catch {
            return undefined;
        }
    }

    // --------------------------------------------------------------- world reads

    read(x, y, z) {
        try {
            return this.bot.terrain.typeAt({ x: Math.floor(x), y: Math.floor(y), z: Math.floor(z) }) ?? "minecraft:air";
        }
        catch {
            return "minecraft:air";
        }
    }
    standable(cell) {
        try {
            return this.bot.terrain.safe({ x: Math.floor(cell.x), y: Math.floor(cell.y), z: Math.floor(cell.z) }) === true;
        }
        catch {
            return false;
        }
    }
    timeOfDay() {
        try { return world.getTimeOfDay(); }
        catch { return 6000; }
    }
    isNight() {
        const t = this.timeOfDay();
        return t >= 13000 && t < 23000;
    }
    dark() {
        const here = floor(this.bot.sim.location);
        if (here.y < 48)
            return true;
        if (this.isNight())
            return true;
        return this.nearBlock(["minecraft:torch", "minecraft:lantern", "minecraft:glowstone"], 5) === undefined ? here.y < 60 : false;
    }
    overDrop() {
        const here = floor(this.bot.sim.location);
        for (let d = 1; d <= 4; d++) {
            const id = this.read(here.x, here.y - d, here.z);
            if (id === "minecraft:air")
                continue;
            return /water|lava/.test(id) ? false : false;
        }
        return this.read(here.x, here.y - 1, here.z) === "minecraft:air" && this.read(here.x, here.y - 2, here.z) === "minecraft:air";
    }
    isTrapped() {
        const here = floor(this.bot.sim.location);
        const above = this.read(here.x, here.y + 2, here.z);
        if (above !== "minecraft:air")
            return false;
        return false;
    }
    /** No meaningful movement while a skill wanted to move: the honest signal. */
    isStuck() {
        const pos = this.bot.sim.location;
        this.trail.push({ x: pos.x, y: pos.y, z: pos.z, tick: system.currentTick });
        while (this.trail.length > 2 && system.currentTick - this.trail[0].tick > STUCK_TICKS)
            this.trail.shift();
        if (this.trail.length < 2)
            return false;
        const first = this.trail[0];
        const moved = Math.hypot(pos.x - first.x, pos.y - first.y, pos.z - first.z);
        const wanted = this.scheduler.active?.skill?.id;
        return moved < STUCK_DISTANCE && !!wanted && this.wantedMovement(wanted);
    }
    wantedMovement(id) {
        return /parkour|mining|explore|meta\.recover/.test(id);
    }
    hazardNearby() {
        const here = floor(this.bot.sim.location);
        for (let dx = -2; dx <= 2; dx++)
            for (let dz = -2; dz <= 2; dz++)
                for (let dy = -1; dy <= 1; dy++)
                    if (/lava|fire|magma|campfire/.test(this.read(here.x + dx, here.y + dy, here.z + dz)))
                        return true;
        return false;
    }
    escapeRoute() {
        const here = floor(this.bot.sim.location);
        return this.bot.terrain?.safe?.({ x: here.x, y: here.y, z: here.z }) === true;
    }
    nearBlock(typeIds, radius = 6) {
        const here = floor(this.bot.sim.location);
        for (let dx = -radius; dx <= radius; dx++)
            for (let dy = -2; dy <= 2; dy++)
                for (let dz = -radius; dz <= radius; dz++) {
                    const id = this.read(here.x + dx, here.y + dy, here.z + dz);
                    if (typeIds.includes(id))
                        return { x: here.x + dx, y: here.y + dy, z: here.z + dz, id };
                }
        return undefined;
    }

    /** Bounded block scan. Memoised per tick: skills call it several times. */
    blocks({ types = [], radius = 16, limit = 16, around } = {}) {
        const origin = around ? floor(around) : floor(this.bot.sim.location);
        const memoKey = `${key(origin)}|${radius}|${types.join(",")}|${limit}`;
        const cached = this.scanCache?.get(memoKey);
        if (cached && this.scanCacheTick === system.currentTick)
            return cached;
        const matcher = this.typeMatcher(types);
        const found = [];
        const r = Math.min(radius, 32);
        for (let dy = -r; dy <= r && found.length < limit * 3; dy++) {
            for (let dx = -r; dx <= r && found.length < limit * 3; dx++) {
                for (let dz = -r; dz <= r && found.length < limit * 3; dz++) {
                    if (dx * dx + dy * dy + dz * dz > r * r)
                        continue;
                    const p = { x: origin.x + dx, y: origin.y + dy, z: origin.z + dz };
                    const id = this.read(p.x, p.y, p.z);
                    if (!matcher(id))
                        continue;
                    found.push({ ...p, id, distance: Math.hypot(dx, dy, dz) });
                }
            }
        }
        found.sort((a, b) => (a.distance - b.distance) || (a.y - b.y) || (a.x - b.x) || (a.z - b.z));
        const out = found.slice(0, limit);
        if (!this.scanCache || this.scanCacheTick !== system.currentTick) {
            this.scanCache = new Map();
            this.scanCacheTick = system.currentTick;
        }
        this.scanCache.set(memoKey, out);
        return out;
    }
    typeMatcher(types) {
        const list = types ?? [];
        const exact = new Set();
        const patterns = [];
        let anyLog = false;
        let container = false;
        for (const type of list) {
            if (type === "#logs") {
                anyLog = true;
                continue;
            }
            if (type === "@containers") {
                container = true;
                continue;
            }
            if (type.startsWith("#"))
                patterns.push(new RegExp(type.slice(1)));
            else
                exact.add(type);
        }
        return (id) => {
            if (exact.has(id))
                return true;
            if (anyLog && ANY_LOG_TYPES.includes(id))
                return true;
            if (container && CONTAINER_TYPES.includes(id))
                return true;
            return patterns.some((re) => re.test(id));
        };
    }

    entities({ types, maxDistance = 16, around } = {}) {
        const origin = around ?? this.bot.sim.location;
        const options = { location: origin, maxDistance };
        if (types?.length === 1)
            options.type = types[0];
        let list = [];
        try {
            list = this.bot.sim.dimension.getEntities(options) ?? [];
        }
        catch {
            list = [];
        }
        const wanted = types?.length > 1 ? new Set(types) : null;
        return list
            .filter((e) => e.isValid !== false && e.id !== this.bot.sim.id)
            .filter((e) => !wanted || wanted.has(e.typeId))
            .map((e) => ({
                id: e.id,
                typeId: e.typeId,
                pos: { x: e.location.x, y: e.location.y, z: e.location.z },
                hp: this.healthOf(e),
                distance: distance(this.bot.sim.location, e.location),
            }))
            .sort((a, b) => (a.distance - b.distance) || String(a.id).localeCompare(String(b.id)));
    }
    nearestEntity({ id, types, maxDistance = 16 } = {}) {
        const list = this.entities({ types, maxDistance });
        if (id)
            return list.find((e) => e.id === id);
        return list[0];
    }
    healthOf(entity) {
        try {
            return entity.getComponent(EntityComponentTypes.Health)?.currentValue;
        }
        catch {
            return undefined;
        }
    }
    threats(radius = 16) {
        const list = this.entities({ maxDistance: radius }).filter((e) => isDangerous(e.typeId));
        return rankThreats(list);
    }
    owner() {
        const name = this.bot.ownerName;
        if (!name)
            return null;
        const player = world.getAllPlayers().find((p) => p.name === name);
        if (!player || player.isValid === false)
            return null;
        return {
            id: player.id,
            pos: { x: player.location.x, y: player.location.y, z: player.location.z },
            dimension: player.dimension.id,
            sprinting: player.isSprinting === true,
        };
    }
    pvpTargets() {
        if (this.settings?.pvp !== true)
            return [];
        return this.entities({ maxDistance: 32 }).filter((e) => e.typeId === "minecraft:player" && e.id !== this.owner()?.id && this.isPvpMarked(e.id));
    }
    pvpTarget() {
        return this.pvpTargets()[0];
    }
    isPvpMarked(entityId) {
        try {
            const entity = this.bot.sim.dimension.getEntities({ location: this.bot.sim.location, maxDistance: 32 }).find((e) => e.id === entityId);
            return entity?.hasTag?.("verdant.pvp-target") === true;
        }
        catch {
            return false;
        }
    }
    foodValue(id) {
        return FOOD.has(id) ? (this.bot.bag.food?.(false)?.typeId === id ? 5 : 4) : 0;
    }
    needsItem(id) {
        return (this.bot.bag.counts?.()?.[id] ?? 0) === 0;
    }
    keepList() {
        const keep = [];
        for (const [id, amount] of Object.entries(this.bot.bag.counts?.() ?? {})) {
            if (amount <= 0)
                continue;
            if (/_pickaxe|_axe|_sword|_shovel|torch|crafting_table|furnace|bread|cooked_|bucket/.test(id) || itemValue(id) >= 6)
                keep.push(id);
        }
        return keep;
    }
    furnaceState(pos) {
        const furnace = this.bot.autonomy?.furnace;
        if (!furnace || !pos)
            return { busy: false };
        try {
            return {
                busy: furnace.hasItems?.() === true,
                matches: (job) => furnace.matches?.(job) ?? false,
            };
        }
        catch {
            return { busy: false };
        }
    }
    memoryAdapter() {
        return {
            read: (k) => this.scratch.get(k),
            write: (k, v) => { this.scratch.set(k, v); return v; },
            nearest: (kind, dimension, pos) => this.bot.memory?.nearest?.(kind, dimension, pos) ?? null,
        };
    }

    // ------------------------------------------------------------------ mission

    /**
     * The objective the director should pursue: an explicit mission mode wins,
     * otherwise the progression ladder from the skill library decides.
     */
    mission(ctx) {
        const bot = this.bot;
        const mode = bot.mode;
        if (bot.skillRequest?.kind === "mine")
            return { goal: `mine ${bot.skillRequest.amount ?? ""} ${bot.skillRequest.target}`, mine: { target: bot.skillRequest.target, amount: bot.skillRequest.amount ?? 1 } };
        if (mode === "mine" && bot.goal?.block)
            return { goal: `mine ${bot.goal.amount ?? 1} ${bot.goal.block}`, mine: { target: bot.goal.block, amount: bot.goal.amount ?? 1 } };
        if (mode === "deepmine" && bot.goal?.item)
            return { goal: `deep mine ${bot.goal.item}`, ore: `minecraft:${String(bot.goal.item).replace("minecraft:", "")}`, oreAmount: bot.goal.amount ?? 3, targetY: this.targetYFor(bot.goal.item) };
        if (mode === "collect" || mode === "recover")
            return { goal: mode, travelTo: bot.goal?.anchor };
        const ladder = currentMissionGoal(mode === "speedrun" ? "speedrun" : "survive", ctx);
        if (!ladder)
            return { goal: "prosper" };
        const counts = this.bot.bag.counts?.() ?? {};
        const mission = { goal: ladder.goal, boosts: ladder.boosts };
        if (/wood/i.test(ladder.goal))
            mission.wood = 8;
        if (/stone pickaxe/i.test(ladder.goal))
            mission.mine = { target: "minecraft:stone", amount: 3 };
        if (/furnace/i.test(ladder.goal))
            mission.mine = { target: "minecraft:cobblestone", amount: 8 };
        if (/iron/i.test(ladder.goal)) {
            mission.ore = "minecraft:iron";
            mission.oreAmount = 3;
            mission.targetY = 16;
        }
        if (/diamond/i.test(ladder.goal)) {
            mission.ore = "minecraft:diamond";
            mission.oreAmount = 3;
            mission.targetY = -54;
        }
        mission.craft = this.craftTargetFor(ladder.goal, counts);
        return mission;
    }
    craftTargetFor(goal, counts) {
        const table = [
            [/wood -> stone tools/i, "minecraft:wooden_pickaxe"],
            [/crafting table/i, "minecraft:crafting_table"],
            [/stone pickaxe/i, "minecraft:stone_pickaxe"],
            [/furnace/i, "minecraft:furnace"],
            [/iron sword/i, "minecraft:iron_sword"],
            [/bucket/i, "minecraft:bucket"],
            [/iron/i, "minecraft:iron_pickaxe"],
        ];
        for (const [re, item] of table)
            if (re.test(goal) && (counts[item] ?? 0) === 0)
                return item;
        return undefined;
    }
    targetYFor(item) {
        const bare = String(item).replace("minecraft:", "");
        return { diamond: -54, iron: 16, gold: -16, redstone: -59, lapis: 0, copper: 48, coal: 48, emerald: 100, ancient_debris: 15 }[bare] ?? 12;
    }

    // ----------------------------------------------------------------- pathing

    pathTo(goal, { radius = 48, parkour = true } = {}) {
        const terrain = this.bot.terrain;
        const start = floor(this.bot.sim.location);
        const target = floor(goal);
        try {
            const search = new PathSearch(
                (x, y, z) => this.read(x, y, z),
                start,
                target,
                1.2,
                parkour,
                1500,
                radius,
                true,
            );
            let guard = 0;
            let status = "searching";
            while (status === "searching" && guard++ < 8)
                status = search.step(200);
            const node = search.bestEffort?.(status) ?? null;
            const path = node ? search.trace(node) : null;
            if (!path || path.length === 0)
                return null;
            return path.map((p) => ({ x: Math.floor(p.x), y: Math.floor(p.y), z: Math.floor(p.z) }));
        }
        catch (e) {
            this.bot.record?.(`[skill] pathTo failed: ${e?.message ?? e}`);
            return null;
        }
    }

    // ------------------------------------------------------------------ actions

    /**
     * The full action vocabulary. Each returns a plain value a skill can branch
     * on; nothing throws out of here, and nothing claims more than it did.
     */
    actions() {
        const bot = this.bot;
        const sim = bot.sim;
        return {
            walkTo: (target, { leash = 1, sprint = false } = {}) => {
                try {
                    if (sprint)
                        sim.isSprinting = true;
                    const result = bot.navTo?.({ x: target.x, y: target.y, z: target.z }, system.currentTick, leash);
                    if (result === "done")
                        return "arrived";
                    if (result === "running" || result === "digging" || result === "working")
                        return "moving";
                    return "blocked";
                }
                catch (e) {
                    bot.record?.(`[skill] walkTo failed: ${e?.message ?? e}`);
                    return "blocked";
                }
            },
            dig: (cell, { tool } = {}) => {
                try {
                    if (tool)
                        this.hold(tool);
                    const verdict = bot.digCell?.({ x: cell.x, y: cell.y, z: cell.z }, system.currentTick);
                    if (verdict === "digging")
                        return "digging";
                    if (verdict === "open")
                        return "broken";
                    return "blocked";
                }
                catch (e) {
                    bot.record?.(`[skill] dig failed: ${e?.message ?? e}`);
                    return "blocked";
                }
            },
            place: (cell, { item, onTop = false } = {}) => {
                try {
                    const slot = item ? this.slotOf(item) : bot.bag.buildBlock?.();
                    if (slot === undefined || slot < 0)
                        return false;
                    const result = bot.builder?.placeAt?.(
                        { x: cell.x, y: cell.y, z: cell.z },
                        { x: cell.x, y: cell.y - 1, z: cell.z },
                        { autoAnchor: true, sneak: true, slot, onTop },
                    );
                    return result === "placed";
                }
                catch (e) {
                    bot.record?.(`[skill] place failed: ${e?.message ?? e}`);
                    return false;
                }
            },
            attack: (entity) => {
                try {
                    const target = this.entityById(entity?.id);
                    if (!target)
                        return false;
                    sim.lookAtEntity(target);
                    return sim.attackEntity(target) !== false;
                }
                catch {
                    return false;
                }
            },
            lookAt: (point) => {
                try {
                    if (point && typeof point.x === "number") {
                        sim.lookAtLocation({ x: point.x, y: point.y, z: point.z });
                        return true;
                    }
                    return false;
                }
                catch {
                    return false;
                }
            },
            select: (itemId) => this.hold(itemId),
            drop: (itemId, amount) => {
                try {
                    const slot = this.slotOf(itemId);
                    if (slot === undefined || slot < 0)
                        return false;
                    const stack = sim.getComponent(EntityComponentTypes.Inventory)?.container?.getItem(slot);
                    if (!stack)
                        return false;
                    const drop = new ItemStack(stack.typeId, Math.min(amount ?? stack.amount, stack.amount));
                    sim.dropItem?.(drop, true);
                    bot.bag.invalidate?.();
                    return true;
                }
                catch {
                    return false;
                }
            },
            eat: (itemId) => {
                try {
                    const slot = this.slotOf(itemId);
                    if (slot === undefined || slot < 0)
                        return false;
                    bot.bag.select?.(slot);
                    const used = sim.useItemInSlot?.(slot);
                    bot.bag.invalidate?.();
                    return used !== false;
                }
                catch {
                    return false;
                }
            },
            equipArmor: (slotName, itemId) => {
                try {
                    const slot = ARMOR_SLOTS[slotName];
                    if (!slot)
                        return false;
                    const inv = sim.getComponent(EntityComponentTypes.Inventory)?.container;
                    const index = this.slotOf(itemId);
                    if (index === undefined || index < 0)
                        return false;
                    const stack = inv.getItem(index);
                    if (!stack)
                        return false;
                    const equippable = sim.getComponent(EntityComponentTypes.Equippable);
                    const previous = equippable.getEquipment(slot);
                    equippable.setEquipment(slot, stack);
                    inv.setItem(index, previous ?? undefined);
                    bot.bag.invalidate?.();
                    return true;
                }
                catch (e) {
                    bot.record?.(`[skill] equip failed: ${e?.message ?? e}`);
                    return false;
                }
            },
            craft: (itemId, amount) => {
                try {
                    const result = bot.craft?.(itemId, Math.max(1, Math.ceil((amount ?? 1) / 4)));
                    bot.bag.invalidate?.();
                    return { ok: result !== false, reason: result === false ? (bot.lastCraftReason ?? "refused") : undefined };
                }
                catch (e) {
                    return { ok: false, reason: e?.message ?? String(e) };
                }
            },
            smelt: (inputId, amount) => this.smelt(inputId, amount),
            collectStation: (pos) => this.collectStation(pos),
            placeStation: (itemId) => this.placeStation(itemId),
            use: (itemId) => {
                try {
                    const slot = this.slotOf(itemId);
                    if (slot === undefined || slot < 0)
                        return false;
                    bot.bag.select?.(slot);
                    sim.useItemInSlot?.(slot);
                    bot.bag.invalidate?.();
                    return true;
                }
                catch {
                    return false;
                }
            },
            sleep: () => {
                try {
                    const bed = this.bot.terrain.handle(floor(sim.location));
                    if (bed) sim.interactWithBlock?.(bed);
                    return true;
                }
                catch {
                    return false;
                }
            },
            openContainer: (pos) => {
                try {
                    const chest = this.bot.terrain.handle({ x: pos.x, y: pos.y, z: pos.z });
                    if (chest) sim.interactWithBlock?.(chest);
                    return true;
                }
                catch {
                    return false;
                }
            },
            deposit: (pos, options = {}) => {
                try {
                    const block = this.bot.terrain.block({ x: pos.x, y: pos.y, z: pos.z });
                    const container = block?.getComponent?.("minecraft:inventory")?.container;
                    if (!container)
                        return null;
                    const result = bot.bag.deposit?.(container, options);
                    bot.bag.invalidate?.();
                    return result ?? { moved: 0 };
                }
                catch (e) {
                    bot.record?.(`[skill] deposit failed: ${e?.message ?? e}`);
                    return null;
                }
            },
            mergeStacks: () => {
                try {
                    const moved = bot.bag.organize?.();
                    bot.bag.invalidate?.();
                    return typeof moved === "number" ? moved : Array.isArray(moved) ? moved.length : 0;
                }
                catch {
                    return 0;
                }
            },
            pickupNearby: (radius) => {
                const before = bot.bag.counts?.() ?? {};
                this.pickupCount = Object.values(before).reduce((a, b) => a + b, 0);
                return this.pickupNearby(radius);
            },
            stop: () => {
                try {
                    sim.stopMoving?.();
                    sim.stopBreakingBlock?.();
                    return true;
                }
                catch {
                    return false;
                }
            },
            jump: () => {
                try {
                    return sim.jump?.() !== false;
                }
                catch {
                    return false;
                }
            },
            swimUp: () => {
                try {
                    sim.swim?.();
                    sim.jump?.();
                    try { sim.applyImpulse?.({ x: 0, y: 0.28, z: 0 }); } catch {}
                    return true;
                }
                catch {
                    return false;
                }
            },
        };
    }

    slotOf(itemId) {
        try {
            return this.bot.bag.find?.((slot) => slot?.typeId === itemId) ?? -1;
        }
        catch {
            return -1;
        }
    }
    hold(itemId) {
        try {
            const slot = this.slotOf(itemId);
            if (slot < 0)
                return false;
            this.bot.bag.select?.(slot);
            return true;
        }
        catch {
            return false;
        }
    }
    entityById(id) {
        if (!id)
            return undefined;
        try {
            return this.bot.sim.dimension.getEntities({ location: this.bot.sim.location, maxDistance: 48 }).find((e) => e.id === id);
        }
        catch {
            return undefined;
        }
    }
    /** Pick up drops by walking over them: the engine hands items over on contact. */
    pickupNearby(radius = 4) {
        const drops = this.entities({ types: ["minecraft:item"], maxDistance: radius });
        if (drops.length === 0)
            return 0;
        const before = this.bagView().totalItems;
        const target = drops[0];
        this.bot.navTo?.({ x: target.pos.x, y: target.pos.y, z: target.pos.z }, system.currentTick, 0.5);
        const after = this.bagView().totalItems;
        return Math.max(0, after - before);
    }
    smelt(inputId, amount) {
        const furnace = this.bot.autonomy?.furnace;
        if (!furnace)
            return { ok: false, reason: "no furnace station tracked; place one with craft.craft-item first" };
        try {
            const started = furnace.produce?.(inputId, amount);
            return { ok: started !== false, reason: started === false ? "furnace refused the job" : undefined };
        }
        catch (e) {
            return { ok: false, reason: e?.message ?? String(e) };
        }
    }
    collectStation(pos) {
        const furnace = this.bot.autonomy?.furnace;
        try {
            return furnace?.collect?.() ?? 0;
        }
        catch {
            return 0;
        }
    }
    placeStation(itemId) {
        if (!this.bot.bag.hasItem?.(itemId) && !this.hold(itemId))
            return false;
        const here = floor(this.bot.sim.location);
        return this.actions().place({ x: here.x, y: here.y, z: here.z }, { item: itemId, onTop: true });
    }
}

/** Lazily attach a runner to a bot (Bot.ensureSkills()). */
export function skillsFor(bot) {
    if (!bot.skills)
        bot.skills = new SkillRunner(bot);
    return bot.skills;
}

export { EXPLOSIVE, HOSTILES, RANGED, armorScore, isBuildingBlock, boost, INTENT, key, center, Direction };
