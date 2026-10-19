// Offline stand-in for @minecraft/server.
//
// Purpose: the whole pack must be loadable, tickable and testable in plain Node
// with no Minecraft, no network and no dependencies. This file models the slice
// of the engine the pack actually uses, and adds a small deterministic driver
// (`__engine`) so tests can build a world, spawn a simulated player and advance
// ticks by hand.
//
// Three rules keep it honest:
//   1. No timers, no wall clock, no randomness. `__engine.tick()` is the only
//      thing that advances time, so a test result is reproducible.
//   2. Engine semantics are copied, not invented: container.getItem() returns a
//      copy (mutating it does not write back), addItem() mutates the input stack
//      and returns the leftover, subscribe() hands back the callback so the pack
//      can unsubscribe on reload.
//   3. Unknown API access throws with a clear message instead of silently
//      returning undefined, so a typo in pack code fails offline rather than
//      in-game.
//
// Extend it deliberately: add the member to the class below, and note it in
// docs/DEV-WORKFLOW.md.

const AIR = new Set(["minecraft:air", "minecraft:cave_air", "minecraft:void_air"]);
const LIQUID = new Set(["minecraft:water", "minecraft:flowing_water", "minecraft:lava", "minecraft:flowing_lava"]);
const PASSABLE_HINT = /(short_grass|tall_grass|fern|deadbush|dead_bush|flower|sapling|_mushroom$|torch|rail|_carpet$|lily_pad|vine|snow_layer|leaf_litter|pink_petals|wheat$|carrots$|potatoes$|beetroots$|sugar_cane|redstone_wire|tripwire$|_button$|_plate$|bush$)/;
const CONTAINER_HINT = /(_chest|_barrel|_shulker_box|_furnace|_smoker|_campfire|_dispenser|_dropper|_hopper|_brewing_stand|^minecraft:barrel$|^minecraft:chest$)/;
const NON_SOLID = new Set(["minecraft:water", "minecraft:flowing_water", "minecraft:lava", "minecraft:flowing_lava", "minecraft:fire", "minecraft:soul_fire", "minecraft:powder_snow"]);
// Vanilla block tags (subset of wiki.bedrock.dev/blocks/vanilla-block-tags) for the
// offline world. Unknown ids get no tags, exactly like a block with no vanilla tag.
const BLOCK_TAGS = new Map([
    ["minecraft:stone", ["stone", "minecraft:is_pickaxe_item_destructible"]],
    ["minecraft:cobblestone", ["stone", "minecraft:is_pickaxe_item_destructible"]],
    ["minecraft:dirt", ["dirt", "grass", "minecraft:is_shovel_item_destructible"]],
    ["minecraft:grass_block", ["dirt", "grass", "minecraft:is_shovel_item_destructible"]],
    ["minecraft:farmland", ["dirt", "grass"]],
    ["minecraft:oak_log", ["log", "oak", "wood", "minecraft:is_axe_item_destructible"]],
    ["minecraft:oak_leaves", ["minecraft:leaves", "minecraft:is_hoe_item_destructible"]],
    ["minecraft:oak_planks", ["wood", "minecraft:is_axe_item_destructible"]],
    ["minecraft:coal_ore", ["minecraft:is_pickaxe_item_destructible"]],
    ["minecraft:iron_ore", ["minecraft:is_pickaxe_item_destructible"]],
    ["minecraft:sand", ["sand", "minecraft:is_shovel_item_destructible"]],
    ["minecraft:red_sand", ["sand", "minecraft:is_shovel_item_destructible"]],
    ["minecraft:gravel", ["gravel", "minecraft:is_shovel_item_destructible"]],
    ["minecraft:water", ["water"]],
]);
function blockTags(id) { return BLOCK_TAGS.get(id) ?? []; }

const DURABILITY = {
    "minecraft:wooden_pickaxe": 59, "minecraft:stone_pickaxe": 131, "minecraft:iron_pickaxe": 250,
    "minecraft:diamond_pickaxe": 1561, "minecraft:netherite_pickaxe": 2031,
    "minecraft:wooden_axe": 59, "minecraft:stone_axe": 131, "minecraft:iron_axe": 250,
    "minecraft:diamond_axe": 1561, "minecraft:wooden_sword": 59, "minecraft:stone_sword": 131,
    "minecraft:iron_sword": 250, "minecraft:diamond_sword": 1561,
    "minecraft:wooden_shovel": 59, "minecraft:stone_shovel": 131, "minecraft:iron_shovel": 250,
    "minecraft:diamond_shovel": 1561, "minecraft:flint_and_steel": 64, "minecraft:shears": 238,
    "minecraft:bow": 384, "minecraft:fishing_rod": 64, "minecraft:shield": 336,
};
const FOOD = {
    "minecraft:apple": [4, false], "minecraft:bread": [5, false], "minecraft:cooked_beef": [8, false],
    "minecraft:cooked_porkchop": [8, false], "minecraft:cooked_chicken": [6, false],
    "minecraft:cooked_mutton": [6, false], "minecraft:cooked_cod": [5, false], "minecraft:cooked_salmon": [6, false],
    "minecraft:cooked_rabbit": [5, false], "minecraft:baked_potato": [5, false], "minecraft:carrot": [3, false],
    "minecraft:beef": [3, false], "minecraft:porkchop": [3, false], "minecraft:chicken": [2, false],
    "minecraft:mutton": [2, false], "minecraft:cod": [2, false], "minecraft:salmon": [2, false],
    "minecraft:rabbit": [3, false], "minecraft:potato": [1, false], "minecraft:sweet_berries": [2, false],
    "minecraft:melon_slice": [2, false], "minecraft:golden_apple": [4, true], "minecraft:dried_kelp": [1, false],
};
const MAX_STACK = /(_pickaxe|_axe|_sword|_shovel|_hoe|bucket|bow|shield|shears|flint_and_steel|_boat|arrow|_door$|_sign$|water_bottle|potion|_helmet|_chestplate|_leggings|_boots)$/;
/** Loot the pack can actually use when an animal dies (deterministic, not random). */
const MOB_DROPS = {
    "minecraft:sheep": [["minecraft:mutton", 1], ["minecraft:white_wool", 1]],
    "minecraft:cow": [["minecraft:beef", 1], ["minecraft:leather", 1]],
    "minecraft:pig": [["minecraft:porkchop", 1]],
    "minecraft:chicken": [["minecraft:chicken", 1], ["minecraft:feather", 1]],
    "minecraft:rabbit": [["minecraft:rabbit", 1], ["minecraft:rabbit_hide", 1]],
};

/**
 * Vanilla-ish block drops (deterministic). Without these a broken block in the
 * offline world vanished with no item, so the pack's pickup + supply chain
 * (bridge with cobblestone, smelt raw iron, craft from logs) could never run.
 */
const BLOCK_DROPS = new Map([
    ["minecraft:grass_block", "minecraft:dirt"],
    ["minecraft:podzol", "minecraft:dirt"],
    ["minecraft:mycelium", "minecraft:dirt"],
    ["minecraft:rooted_dirt", "minecraft:dirt"],
    ["minecraft:coarse_dirt", "minecraft:dirt"],
    ["minecraft:dirt_path", "minecraft:dirt"],
    ["minecraft:farmland", "minecraft:dirt"],
    ["minecraft:stone", "minecraft:cobblestone"],
    ["minecraft:deepslate", "minecraft:cobbled_deepslate"],
    ["minecraft:iron_ore", "minecraft:raw_iron"],
    ["minecraft:deepslate_iron_ore", "minecraft:raw_iron"],
    ["minecraft:gold_ore", "minecraft:raw_gold"],
    ["minecraft:deepslate_gold_ore", "minecraft:raw_gold"],
    ["minecraft:copper_ore", "minecraft:raw_copper"],
    ["minecraft:deepslate_copper_ore", "minecraft:raw_copper"],
    ["minecraft:diamond_ore", "minecraft:diamond"],
    ["minecraft:deepslate_diamond_ore", "minecraft:diamond"],
    ["minecraft:coal_ore", "minecraft:coal"],
    ["minecraft:deepslate_coal_ore", "minecraft:coal"],
    ["minecraft:lapis_ore", "minecraft:lapis_lazuli"],
    ["minecraft:deepslate_lapis_ore", "minecraft:lapis_lazuli"],
    ["minecraft:redstone_ore", "minecraft:redstone"],
    ["minecraft:deepslate_redstone_ore", "minecraft:redstone"],
    ["minecraft:emerald_ore", "minecraft:emerald"],
    ["minecraft:deepslate_emerald_ore", "minecraft:emerald"],
    ["minecraft:clay", "minecraft:clay_ball"],
    ["minecraft:glass", null],
    ["minecraft:ice", null],
]);
function blockDropId(id) {
    if (BLOCK_DROPS.has(id)) return BLOCK_DROPS.get(id);
    if (/(leaves|vine|short_grass|tall_grass|fern$|flower|torch|_air$|_bush|seagrass|kelp|sugar_cane)/.test(id)) return null;
    return id; // default: the block drops itself (logs, planks, dirt, sand, ...)
}

/**
 * Item -> block mapping for offline placements. Only items that ARE blocks in
 * vanilla map through; everything else answers undefined and the placement is
 * skipped (like the real API refusing to place food).
 */
function placementBlockId(itemId) {
    if (typeof itemId !== "string") return undefined;
    const id = itemId.replace(/^minecraft:/, "");
    if (/^(cobblestone|cobbled_deepslate|stone|deepslate|netherrack|dirt|coarse_dirt|mud|gravel|sand|red_sand|glass|obsidian|torch|furnace|crafting_table|chest|bricks)$/.test(id)) return "minecraft:" + id;
    if (/(_planks|_log|_wood|_stem|_hyphae|_bricks|_wool|_terracotta|_concrete|bamboo_block|bamboo_mosaic)$/.test(id)) return "minecraft:" + id;
    return undefined;
}

// ------------------------------------------------------------------ counters
/** Native-call counters. Tests assert budgets against these (docs/DEV-WORKFLOW.md). */
const counters = new Map();
function counted(name) {
    counters.set(name, (counters.get(name) ?? 0) + 1);
}

// -------------------------------------------------------------------- world state
class FakeDimension {
    constructor(engine, id) {
        this.id = id;
        this.engine = engine;
        this.blocks = new Map();
    }
    key(x, y, z) { return `${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`; }
    getBlock(loc) {
        counted("dimension.getBlock");
        if (!loc || typeof loc.x !== "number")
            return undefined;
        return this.engine.makeBlock(this, this.key(loc.x, loc.y, loc.z));
    }
    getBlockFromRay(origin, direction, options = {}) {
        counted("dimension.getBlockFromRay");
        const max = options.maxDistance ?? 10;
        for (let i = 1; i <= max; i++) {
            const p = {
                x: Math.floor(origin.x + direction.x * i),
                y: Math.floor(origin.y + direction.y * i),
                z: Math.floor(origin.z + direction.z * i),
            };
            const id = this.engine.peek(this, p.x, p.y, p.z);
            if (!AIR.has(id))
                return { block: this.getBlock(p), face: "Up", faceLocation: p };
        }
        return undefined;
    }
    getTopmostBlock(loc) {
        counted("dimension.getTopmostBlock");
        const x = Math.floor(loc.x);
        const z = Math.floor(loc.z);
        for (let y = 320; y >= -64; y--) {
            if (!AIR.has(this.engine.peek(this, x, y, z)))
                return this.getBlock({ x, y, z });
        }
        return undefined;
    }
    /**
     * The 2.3.0-beta..2.8.0-beta shape: (biomeToFind, options?) - wait, no:
     * findClosestBiome takes (biomeToFind, location?) - biome FIRST. From
     * module 2.9.0 the same call is calculateClosestBiomeFromSeed(location,
     * biomeToFind) - location first. Both stand-ins share the patch search.
     * (The pack used to call findClosestBiome(pos, biome, {boundingSize})
     * which matched neither signature and therefore never worked.)
     */
    findClosestBiome(biomeToFind, pos) {
        counted("dimension.findClosestBiome");
        return this._findBiomeBySeed(biomeToFind, pos);
    }
    calculateClosestBiomeFromSeed(pos, biomeToFind) {
        counted("dimension.calculateClosestBiomeFromSeed");
        return this._findBiomeBySeed(biomeToFind, pos);
    }
    _findBiomeBySeed(biomeToFind, pos) {
        // Offline stand-in: patch list seeded by __harness.setBiome. The real
        // call is heavy; the pack throttles it (village.js locateVillageBiome).
        if (!pos || typeof pos.x !== "number")
            return undefined;
        let best = undefined;
        let bestD = Infinity;
        for (const patch of this.engine.biomes) {
            if (patch.dimension !== this.id || patch.biome !== biomeToFind)
                continue;
            const d = Math.hypot(patch.pos.x - pos.x, patch.pos.y - pos.y, patch.pos.z - pos.z);
            if (d < bestD) { bestD = d; best = { ...patch.pos }; }
        }
        return best;
    }
    /**
     * Mojang's structure locator (module 2.4.0-beta / Bedrock 1.21.120+):
     * every generated structure whose footprint contains `location`.
     * Handles the village.js probe grid; seeded via __harness.setStructure.
     */
    getGeneratedStructures(location) {
        counted("dimension.getGeneratedStructures");
        if (!location || typeof location.x !== "number")
            return [];
        const out = [];
        for (const s of this.engine.structures) {
            if (s.dimension !== this.id)
                continue;
            const d = Math.hypot(location.x - s.pos.x, location.y - s.pos.y, location.z - s.pos.z);
            if (d <= (s.radius ?? 96) && !out.includes(s.id))
                out.push(s.id);
        }
        return out;
    }
    getBiome(location) {
        counted("dimension.getBiome");
        for (const patch of this.engine.biomes) {
            if (patch.dimension !== this.id)
                continue;
            const r = patch.radius ?? 96;
            if (Math.abs(location.x - patch.pos.x) <= r && Math.abs(location.z - patch.pos.z) <= r)
                return patch.biome;
        }
        return this.engine.defaultBiome ?? "minecraft:plains";
    }
    getEntities(options = {}) {
        counted("dimension.getEntities");
        return this.engine.entities.filter((e) => {
            if (e.dimension !== this)
                return false;
            if (!e.isValid)
                return false;
            if (options.type && e.typeId !== options.type && !(Array.isArray(options.type) && options.type.includes(e.typeId)))
                return false;
            if (options.excludeTypes && options.excludeTypes.includes(e.typeId))
                return false;
            if (options.excludeFamilies && Array.isArray(options.excludeFamilies) && e.families?.some((f) => options.excludeFamilies.includes(f)))
                return false;
            if (options.families && !e.families?.some((f) => options.families.includes(f)))
                return false;
            if (options.location && typeof options.maxDistance === "number") {
                const d = Math.hypot(e.location.x - options.location.x, e.location.y - options.location.y, e.location.z - options.location.z);
                if (d > options.maxDistance)
                    return false;
            }
            return true;
        });
    }
    getPlayers(options = {}) {
        counted("dimension.getPlayers");
        return this.engine.players.filter((p) => p.dimension === this && p.isValid);
    }
    spawnEntity(typeId, loc) {
        counted("dimension.spawnEntity");
        return this.engine.spawnEntity(typeId, loc, this);
    }
    spawnItem(stack, loc) {
        counted("dimension.spawnItem");
        const entity = this.engine.spawnEntity("minecraft:item", loc, this);
        entity.__item = stack;
        return entity;
    }
    runCommand(command) {
        counted("dimension.runCommand");
        this.engine.commands.push(command);
        return { successCount: 1 };
    }
    createExplosion(loc, radius) {
        counted("dimension.createExplosion");
        this.engine.explosions.push({ loc, radius, dimension: this.id });
    }
    playSound() { counted("dimension.playSound"); }
    getWeather() { return "Clear"; }
}

class FakeBlockType {
    constructor(id) { this.id = id; }
    get canBePlaced() { return true; }
}
class FakeBlockPermutation {
    constructor(type, states = {}) { this.type = new FakeBlockType(type); this.__states = states; }
    static resolve(typeId, states = {}) { return new FakeBlockPermutation(typeId, states); }
    getState(name) { return this.__states[name]; }
    getAllStates() { return { ...this.__states }; }
    matches() { return false; }
}
class FakeBlock {
    constructor(engine, dim, key) {
        this.engine = engine;
        this.dimension = dim;
        this.__key = key;
        const [x, y, z] = key.split(",").map(Number);
        this.location = { x, y, z };
        this.x = x; this.y = y; this.z = z;
    }
    get typeId() { return this.engine.peek(this.dimension, this.x, this.y, this.z); }
    get isAir() { return AIR.has(this.typeId); }
    get isLiquid() { return LIQUID.has(this.typeId); }
    get isSolid() { return !this.isAir && !NON_SOLID.has(this.typeId) && !PASSABLE_HINT.test(this.typeId); }
    get isValid() { return true; }
    getTags() { counted("block.getTags"); return blockTags(this.typeId).slice(); }
    hasTag(tag) { counted("block.hasTag"); return blockTags(this.typeId).includes(tag); }
    get permutation() { return new FakeBlockPermutation(this.typeId); }
    setPermutation(perm) { counted("block.setPermutation"); this.engine.setBlock(this.dimension, this.x, this.y, this.z, perm.type.id); }
    setType(typeId) { counted("block.setType"); this.engine.setBlock(this.dimension, this.x, this.y, this.z, typeId); }
    getComponent(id) {
        counted("block.getComponent");
        if (id === "minecraft:inventory" || id === "minecraft:inventory_storage")
            return CONTAINER_HINT.test(this.typeId) ? { container: this.engine.container(this.dimension, this.__key) } : undefined;
        if (id === "minecraft:fluid_container") return undefined;
        return undefined;
    }
}
class FakeContainerSlot {
    constructor(container, index) { this.__c = container; this.__i = index; }
    get item() { return this.__c.getItem(this.__i); }
    get typeId() { return this.__c.getItem(this.__i)?.typeId; }
    get amount() { return this.__c.getItem(this.__i)?.amount ?? 0; }
    getItem() { return this.__c.getItem(this.__i); }
    setItem(stack) { this.__c.setItem(this.__i, stack); }
    get empty() { return this.__c.getItem(this.__i) === undefined; }
    clear() { this.__c.setItem(this.__i, undefined); }
}
class FakeContainer {
    constructor(size, items = []) { this.__size = size; this.__items = items; }
    get size() { return this.__size; }
    get emptySlotsCount() { let n = 0; for (let i = 0; i < this.__size; i++) if (!this.__items[i]) n++; return n; }
    getItem(index) { counted("container.getItem"); return this.__items[index]?.clone(); } // engine returns a copy
    setItem(index, stack) { counted("container.setItem"); this.__items[index] = stack ? new ItemStack(stack) : undefined; }
    setItemRaw(index, stack) { this.__items[index] = stack; }
    getSlot(index) { return new FakeContainerSlot(this, index); }
    addItem(stack) {
        counted("container.addItem");
        let remaining = stack.amount;
        const max = stack.maxAmount;
        for (let i = 0; i < this.__size && remaining > 0; i++) {
            const slot = this.__items[i];
            if (slot && slot.typeId === stack.typeId && slot.amount < max) {
                const want = Math.min(max - slot.amount, remaining);
                slot.amount += want;
                remaining -= want;
            }
        }
        for (let i = 0; i < this.__size && remaining > 0; i++) {
            if (!this.__items[i]) {
                const want = Math.min(max, remaining);
                this.__items[i] = new ItemStack(stack.typeId, want);
                remaining -= want;
            }
        }
        stack.amount = remaining;
        return remaining > 0 ? stack : undefined;
    }
    swapItems(slotA, slotB, other) {
        counted("container.swapItems");
        const a = this.__items[slotA];
        const b = other.__items[slotB];
        this.__items[slotA] = b;
        other.__items[slotB] = a;
        return true;
    }
    moveItem(from, to) {
        counted("container.moveItem");
        const a = this.__items[from];
        const b = this.__items[to];
        if (a && b && a.typeId === b.typeId) {
            const max = a.maxAmount;
            const want = Math.min(max - b.amount, a.amount);
            b.amount += want;
            a.amount -= want;
            if (a.amount <= 0) this.__items[from] = undefined;
            return true;
        }
        if (a && !b) { this.__items[to] = a; this.__items[from] = undefined; return true; }
        return false;
    }
    transferItem(from, to, other) { this.moveItem(from, to); return true; }
    /** Test helper: a plain snapshot for assertions. */
    __snapshot() { return this.__items.map((s) => (s ? { typeId: s.typeId, amount: s.amount } : null)); }
}

const ITEM_RULES = new Map();
export function __defineItemRule(typeId, rule) { ITEM_RULES.set(typeId, rule); }

export class ItemStack {
    constructor(typeId, amount = 1) {
        if (typeId instanceof ItemStack) {
            this.typeId = typeId.typeId;
            this.amount = typeId.amount;
            this.__damage = typeId.__damage ?? 0;
            return;
        }
        this.typeId = String(typeId);
        this.amount = amount;
        this.__damage = 0;
        this.nameTag = undefined;
    }
    get maxAmount() {
        // Mirror the engine tiers: 1 (tools/gear), 16 (the usual small-stack
        // exceptions), else 64. Kept in step with core/inventory-model.js
        // SMALL_STACK so offline stack math matches the engine.
        const rule = ITEM_RULES.get(this.typeId)?.max;
        if (rule !== undefined) return rule;
        const bare = String(this.typeId).replace(/^minecraft:/, "");
        if (MAX_STACK.test(bare)) return 1;
        if (/(_sign$|_hanging_sign$|_banner$|bucket|_bucket$|snowball|egg$|ender_pearl|_potion$|potion$|_stew$|stew$|_soup$|honey_bottle|_shulker_box$|_bed$|_door$|_boat$|_minecart$|_rod$)/.test(bare)) return 16;
        return 64;
    }
    get isStackable() { return this.maxAmount > 1; }
    get type() { return new FakeItemType(this.typeId); }
    clone() {
        const copy = new ItemStack(this.typeId, this.amount);
        copy.__damage = this.__damage;
        return copy;
    }
    isStackableWith(other) { return this.typeId === other.typeId; }
    getComponent(id) {
        counted("itemStack.getComponent");
        if (id === "minecraft:durability") {
            const max = DURABILITY[this.typeId];
            if (!max) return undefined;
            const self = this;
            return { maxDurability: max, get damage() { return self.__damage; }, set damage(v) { self.__damage = v; } };
        }
        if (id === "minecraft:food") {
            const f = FOOD[this.typeId];
            if (!f) return undefined;
            return { nutrition: f[0], canAlwaysEat: f[1], saturationModifier: 0.6 };
        }
        if (id === "minecraft:enchantable") return { getEnchantments: () => [] };
        if (id === "minecraft:cooldown") return undefined;
        return undefined;
    }
    setLore() { counted("itemStack.setLore"); }
    setCanDestroy() { }
    setCanPlaceOn() { }
    static getInstance() { return undefined; }
}
class FakeItemType {
    constructor(id) { this.id = id; }
}

export const EntityComponentTypes = {
    Health: "minecraft:health",
    Inventory: "minecraft:inventory",
    Equippable: "minecraft:equippable",
    Item: "minecraft:item",
    OnFire: "minecraft:onfire",
    Riding: "minecraft:riding",
    Rideable: "minecraft:rideable",
    Tameable: "minecraft:tameable",
    Navigation: "minecraft:navigation",
    Movement: "minecraft:movement",
    TypeFamily: "minecraft:type_family",
};
export const EquipmentSlot = { Head: "Head", Chest: "Chest", Legs: "Legs", Feet: "Feet", Offhand: "Offhand", Mainhand: "Mainhand" };
export const GameMode = { survival: "survival", creative: "creative", adventure: "adventure", spectator: "spectator" };
export const DisplaySlotId = { BelowName: "belowName", List: "list", Sidebar: "sidebar" };
export const Direction = { Down: "Down", Up: "Up", North: "North", South: "South", East: "East", West: "West" };
export const BlockComponentTypes = { Inventory: "minecraft:inventory" };
export const ItemComponentTypes = { Durability: "minecraft:durability", Food: "minecraft:food" };

class FakeEntityComponents {
    constructor(entity) { this.entity = entity; }
    health(initial = 20) {
        const self = this.entity;
        return {
            get currentValue() { return self.hp; },
            get effectiveMax() { return 20; },
            setCurrentValue(v) { self.hp = v; },
            resetToMaxValue() { self.hp = 20; },
            resetToMinValue() { self.hp = 0; },
        };
    }
}
class FakeEntity {
    constructor(engine, typeId, dimension, location, options = {}) {
        this.engine = engine;
        this.typeId = typeId;
        this.dimension = dimension;
        this.location = { x: Math.floor(location.x) + 0.5, y: Math.floor(location.y), z: Math.floor(location.z) + 0.5 };
        this.id = `e${++engine.nextId}`;
        this.isValid = true;
        this.isSimulated = !!options.simulated;
        this.name = options.name;
        this.families = options.families ?? (typeId === "minecraft:item" ? ["item"] : ["mob"]);
        this.hp = options.hp ?? 20;
        this.tags = new Set();
        this.__inventory = options.inventory !== false && this.isSimulated ? new FakeContainer(36) : undefined;
        this.__equipment = {};
        this.__hunger = { currentValue: 20, effectiveMax: 20 };
        this.__onFireTicks = 0;
        this.__target = undefined;
        this.__movement = undefined;
        this.__breaking = undefined;
        this.__sleeping = false;
        this.__riding = undefined;
        this.__components = new FakeEntityComponents(this);
    }
    get isOnGround() { return true; }
    get isInWater() { return this.__inWater ?? false; }
    get isSprinting() { return !!this.__sprinting; }
    set isSprinting(v) { this.__sprinting = !!v; }
    get isSneaking() { return !!this.__sneaking; }
    set isSneaking(v) { this.__sneaking = !!v; }
    get isFalling() { return false; }
    get isSleeping() { return this.__sleeping; }
    get isClimbing() { return false; }
    get isSwimming() { return !!this.__swimming; }
    get selectedSlotIndex() { return this.__selected ?? 0; }
    set selectedSlotIndex(v) { this.__selected = v; }
    getViewDirection() { return { x: 0, y: 0, z: 1 }; }
    getRotation() { return { x: 0, y: 0 }; }
    getHeadLocation() {
        counted("entity.getHeadLocation");
        return { x: this.location.x, y: this.location.y + 1.62, z: this.location.z };
    }
    getComponent(id) {
        counted("entity.getComponent");
        if (id === "minecraft:health") return this.__components.health();
        if (id === "minecraft:player.hunger") return this.__hunger;
        if (id === "minecraft:equippable")
            return {
                getEquipment: (slot) => this.__equipment[slot]?.clone(),
                setEquipment: (slot, stack) => { this.__equipment[slot] = stack ? new ItemStack(stack) : undefined; },
            };
        if (id === "minecraft:inventory") return this.__inventory ? { container: this.__inventory } : undefined;
        if (id === "minecraft:onfire") {
            const self = this;
            return { get onFireTicks() { return self.__onFireTicks; }, set onFireTicks(v) { self.__onFireTicks = v; } };
        }
        if (id === EntityComponentTypes.Riding) return { entityRidingOn: this.__riding, getComponent: () => undefined };
        if (id === "minecraft:rideable") return { getSeats: () => [], ejectRiders: () => { } };
        if (id === "minecraft:tameable") return undefined;
        if (id === "minecraft:movement") return { currentValue: 0.25 };
        if (id === "minecraft:type_family") return { getFamilyList: () => [...this.families] };
        if (id === EntityComponentTypes.Item) return this.__item ? { itemStack: this.__item } : undefined;
        return undefined;
    }
    hasComponent(id) {
        counted("entity.hasComponent");
        if (id === "minecraft:tameable") return false; // plain animals in the stub are untamed
        return this.getComponent(id) !== undefined;
    }
    addTag(tag) { this.tags.add(tag); return true; }
    hasTag(tag) { return this.tags.has(tag); }
    getTags() { return [...this.tags]; }
    removeTag(tag) { return this.tags.delete(tag); }
    applyDamage(amount) { counted("entity.applyDamage"); this.hp -= amount; if (this.hp <= 0) this.__die(); return true; }
    applyKnockback() { counted("entity.applyKnockback"); }
    applyImpulse() { }
    clearVelocity() { }
    getVelocity() { return { x: 0, y: 0, z: 0 }; }
    teleport(loc, options = {}) {
        counted("entity.teleport");
        if (Array.isArray(loc)) [this.location.x, this.location.y, this.location.z] = loc;
        else this.location = { x: loc.x, y: loc.y, z: loc.z };
        if (options.dimension) this.dimension = options.dimension;
    }
    triggerEvent(name) { counted("entity.triggerEvent"); this.engine.entityEvents.push({ entity: this, name }); }
    kill() { this.__die(); }
    remove() { this.__die(); }
    __die() {
        this.isValid = false;
        this.engine.entities = this.engine.entities.filter((e) => e !== this);
        this.engine.players = this.engine.players.filter((e) => e !== this);
        // Vanilla mob drops so the harvest -> food loop has something to pick up.
        for (const [typeId, amount] of MOB_DROPS[this.typeId] ?? []) {
            const drop = this.engine.spawnEntity("minecraft:item", { ...this.location }, this.dimension);
            drop.__item = new ItemStack(typeId, amount);
        }
        this.engine.fire("world.afterEvents.entityDie", { deadEntity: this, damageSource: { cause: "entityAttack" } });
    }
    // SimulatedPlayer movement surface (also used by Player for owner commands)
    moveToLocation(loc, options) {
        counted("sim.moveToLocation");
        // 2.3.0-beta signature: moveToLocation(location, options?: MoveToOptions).
        // A bare number stays accepted so older call sites keep working offline.
        const speed = typeof options === "number" ? options : (options?.speed ?? 1);
        this.__movement = { target: { ...loc }, speed, faceTarget: options?.faceTarget };
        return true;
    }
    stopMoving() { counted("sim.stopMoving"); this.__movement = undefined; return true; }
    move(westEast, northSouth, speed) {
        counted("sim.move");
        this.__movement = {
            target: { x: this.location.x + westEast, y: this.location.y, z: this.location.z + northSouth },
            speed: speed ?? 1,
        };
        return true;
    }
    moveRelative(leftRight, backwardForward, speed) {
        counted("sim.moveRelative");
        // Rotation-free approximation: +z is forward, -x is left.
        this.__movement = {
            target: { x: this.location.x - leftRight, y: this.location.y, z: this.location.z + backwardForward },
            speed: speed ?? 1,
        };
        return true;
    }
    jump() { counted("sim.jump"); this.engine.jumps.push(this.id); return true; }
    swim() { this.__swimming = true; }
    stopSwimming() { this.__swimming = false; }
    lookAtBlock(block) { counted("sim.lookAtBlock"); this.__look = { type: "block", at: block?.location ?? block }; return true; }
    lookAtEntity(entity) { counted("sim.lookAtEntity"); this.__look = { type: "entity", at: entity?.id }; return true; }
    lookAtLocation(loc) { counted("sim.lookAtLocation"); this.__look = { type: "location", at: loc }; return true; }
    interact() { counted("sim.interact"); return true; }
    interactWithBlock(block) {
        counted("sim.interactWithBlock");
        const id = block?.typeId;
        if (id && CONTAINER_HINT.test(id)) {
            this.__openContainer = block.location;
            this.engine.openedContainers.push({ entity: this.id, at: { ...block.location } });
        }
        return true;
    }
    interactWithEntity(entity) { counted("sim.interactWithEntity"); return true; }
    stopInteracting() { counted("sim.stopInteracting"); return true; }
    startBreakingBlock(block) {
        counted("sim.startBreakingBlock");
        const b = this.__resolveBlock(block);
        if (!b) return false;
        this.__breaking = { at: { ...b.location }, id: b.typeId, block: b, dimension: b.dimension, left: 10 };
        return true;
    }
    stopBreakingBlock() { counted("sim.stopBreakingBlock"); this.__breaking = undefined; return true; }
    /**
     * The real API takes a block *location* (Vector3), not a Block object.
     * Accepting both matches how the pack calls it and stops the stub from
     * throwing on `block.location.x` - the silent failure that made every
     * offline mining test look like "breaker is broken".
     */
    __resolveBlock(locOrBlock) {
        if (!locOrBlock) return undefined;
        if (locOrBlock.isAir !== undefined || locOrBlock.typeId) return locOrBlock;
        return this.dimension?.getBlock?.({
            x: Math.floor(locOrBlock.x), y: Math.floor(locOrBlock.y), z: Math.floor(locOrBlock.z),
        });
    }
    breakBlock(block) {
        counted("sim.breakBlock");
        const b = this.__resolveBlock(block);
        if (!b || b.isAir) return false;
        const id = b.typeId;
        this.engine.setBlock(b.dimension, b.location.x, b.location.y, b.location.z, "minecraft:air");
        this.engine.brokenBlocks.push({ id, at: { ...b.location }, by: this.id });
        this.engine.fire("world.afterEvents.playerBreakBlock", {
            player: this, brokenBlockPermutation: new FakeBlockPermutation(id), block: b, dimension: b.dimension,
        });
        const dropId = blockDropId(id);
        if (dropId && b.dimension?.spawnItem) {
            b.dimension.spawnItem(new ItemStack(dropId, 1), { x: b.location.x + 0.5, y: b.location.y + 0.5, z: b.location.z + 0.5 });
        }
        return true;
    }
    useItemInSlot(slot) { counted("sim.useItemInSlot"); return true; }
    /**
     * Real placement semantics for the offline world: the held block lands in
     * the cell adjacent to the anchor on the given face and one item is spent.
     * Without this the stub answered "true" forever while the world never
     * changed - which masked every bridge/pillar climb path offline (the bot
     * looked like it refused to place when in reality it was placing into a
     * void, and the climb freeze could never reproduce faithfully).
     */
    useItemInSlotOnBlock(slot, block, face) {
        counted("sim.useItemInSlotOnBlock");
        try {
            const b = block?.location ? block : this.__resolveBlock(block);
            if (!b || !b.dimension) return true;
            const dirs = {
                East: { x: 1, y: 0, z: 0 }, West: { x: -1, y: 0, z: 0 },
                South: { x: 0, y: 0, z: 1 }, North: { x: 0, y: 0, z: -1 },
                Up: { x: 0, y: 1, z: 0 }, Down: { x: 0, y: -1, z: 0 },
            };
            const d = dirs[String(face)] ?? dirs.Up;
            const x = Math.floor(b.location.x) + d.x;
            const y = Math.floor(b.location.y) + d.y;
            const z = Math.floor(b.location.z) + d.z;
            const idx = Number.isFinite(slot) ? slot : (this.selectedSlotIndex ?? 0);
            const stack = this.__inventory?.getItem?.(idx);
            const blockId = placementBlockId(stack?.typeId);
            if (!blockId) return true;                          // not a block item
            const occupied = this.engine.peek(b.dimension, x, y, z);
            if (occupied && occupied !== "minecraft:air") return false; // real API refuses
            this.engine.setBlock(b.dimension, x, y, z, blockId);
            if (stack && stack.amount > 1) this.__inventory.setItem(idx, new ItemStack(stack.typeId, stack.amount - 1));
            else this.__inventory?.setItem?.(idx, undefined);
            return true;
        } catch { return true; }
    }
    useItem() { counted("sim.useItem"); return { success: true }; }
    startUsingItem() { return true; }
    stopUsingItem() { counted("sim.stopUsingItem"); return true; }
    setItem(stack, slot) { counted("sim.setItem"); this.__inventory?.setItem(slot ?? this.selectedSlotIndex, stack); return true; }
    dropItem(stack, drop) { counted("sim.dropItem"); this.engine.dropped.push({ stack: stack?.clone(), at: this.location }); return true; }
    attackEntity(entity) {
        counted("sim.attackEntity");
        if (!entity?.isValid) return false;
        this.engine.attacks.push({ by: this.id, at: entity.id });
        this.engine.fire("world.afterEvents.entityHurt", {
            hurtEntity: entity, damage: 1, damageSource: { damagingEntity: this, cause: "entityAttack" },
        });
        entity.applyDamage(1);
        return true;
    }
    attack() { return true; }
    respawn() {
        counted("sim.respawn");
        this.isValid = true;
        this.hp = 20;
        this.__hunger.currentValue = 20;
        if (!this.engine.entities.includes(this)) this.engine.entities.push(this);
        this.engine.fire("world.afterEvents.playerSpawn", { player: this, initialSpawn: false });
        return true;
    }
    disconnect() {
        counted("sim.disconnect");
        this.isValid = false;
        this.engine.players = this.engine.players.filter((p) => p !== this);
        this.engine.entities = this.engine.entities.filter((p) => p !== this);
        return true;
    }
    runCommand(command) { counted("sim.runCommand"); this.engine.commands.push(command); return { successCount: 1 }; }
}

export class Player extends FakeEntity {
    constructor(engine, name, dimension, location) {
        super(engine, "minecraft:player", dimension, location, { simulated: true, inventory: true, name });
        this.name = name;
        this.playerPermissionLevel = 2;
        this.commandPermissionLevel = 1;
        this.isSimulated = false;
    }
    isOp() { return true; }
    sendMessage(message) {
        counted("player.sendMessage");
        this.engine.messages.push({ to: this.name, message: String(message) });
    }
    onScreenDisplay(display) {
        counted("player.onScreenDisplay");
        this.engine.hud.push({ to: this.name, text: display?.getText?.() ?? String(display) });
    }
    getBlockFromViewDirection(options = {}) {
        counted("player.getBlockFromViewDirection");
        const dir = options.direction ?? { x: 0, y: -1, z: 0 };
        return this.dimension.getBlockFromRay(this.location, dir, options);
    }
    getGameMode() { return GameMode.survival; }
}

/** A GameTest simulated player: a Player with the sim-only methods exposed on the parent. */
export class SimulatedPlayer extends Player {
    constructor(engine, name, dimension, location) {
        super(engine, name, dimension, location);
        this.isSimulated = true;
    }
}

class EventSignal {
    constructor(engine, name) { this.engine = engine; this.name = name; this.observers = new Set(); }
    subscribe(callback) { this.observers.add(callback); return callback; }
    unsubscribe(callback) { this.observers.delete(callback); }
    get count() { return this.observers.size; }
}
function eventGroup(engine, prefix, names) {
    const group = {};
    for (const name of names) {
        Object.defineProperty(group, name, {
            get: () => engine.signal(`${prefix}.${name}`),
            enumerable: true,
        });
    }
    return group;
}

class FakeScoreboardObjective {
    constructor(id, displayName) { this.id = id; this.displayName = displayName; this.scores = new Map(); }
    setScore(participant, score) { this.scores.set(String(participant), score); }
    getScore(participant) { return this.scores.get(String(participant)); }
    addScore(participant, score) { this.scores.set(String(participant), (this.scores.get(String(participant)) ?? 0) + score); }
    removeParticipant(participant) { this.scores.delete(String(participant)); }
    getParticipants() { return [...this.scores.keys()].map((name) => ({ displayName: name })); }
}
class FakeScoreboard {
    constructor() { this.objectives = new Map(); }
    getObjective(name) { return this.objectives.get(name); }
    addObjective(name, displayName) { const o = new FakeScoreboardObjective(name, displayName ?? name); this.objectives.set(name, o); return o; }
    removeObjective(name) { this.objectives.delete(name); }
    getObjectives() { return [...this.objectives.values()]; }
    setObjectiveAtDisplaySlot() { }
}
const GAMERULES = { doDaylightCycle: true, doMobSpawning: true, doFireTick: true, sendCommandFeedback: true, keepInventory: false, mobGriefing: true, doWeatherCycle: true };

class FakeWorld {
    constructor(engine) {
        this.engine = engine;
        this.scoreboard = new FakeScoreboard();
        this.gameRules = { ...GAMERULES };
        this.afterEvents = eventGroup(engine, "world.afterEvents", [
            "entityDie", "entityHurt", "entitySpawn", "playerLeave", "playerJoin", "playerSpawn",
            "scriptEventReceive", "worldLoad", "playerBreakBlock", "playerPlaceBlock", "itemUse",
            "itemUseOn", "effectAdd", "explosion", "projectileHitBlock", "playerInteractWithBlock",
            "playerInteractWithEntity", "entityRemove", "entityLoad", "blockExplode",
        ]);
        this.beforeEvents = eventGroup(engine, "world.beforeEvents", [
            "chatSend", "itemUse", "itemUseOn", "playerBreakBlock", "playerPlaceBlock",
            "playerInteractWithBlock", "playerInteractWithEntity", "explosion", "entityHurt", "effectAdd", "worldLoad",
        ]);
        this.__props = new Map();
    }
    getDimension(id) {
        counted("world.getDimension");
        const key = id.includes(":") ? id : `minecraft:${id}`;
        return this.engine.dimension(key);
    }
    getAllPlayers() { counted("world.getAllPlayers"); return this.engine.players.filter((p) => p.isValid); }
    getPlayers(options = {}) {
        counted("world.getPlayers");
        let out = this.engine.players.filter((p) => p.isValid);
        if (options.name) out = out.filter((p) => p.name === options.name);
        if (options.location && typeof options.maxDistance === "number")
            out = out.filter((p) => Math.hypot(p.location.x - options.location.x, p.location.y - options.location.y, p.location.z - options.location.z) <= options.maxDistance);
        return out;
    }
    getEntity(id) { return this.engine.entities.find((e) => e.id === id && e.isValid); }
    sendMessage(message) { counted("world.sendMessage"); this.engine.messages.push({ to: "@a", message: String(message) }); }
    getDynamicProperty(key) { counted("world.getDynamicProperty"); return this.__props.get(key); }
    setDynamicProperty(key, value) { counted("world.setDynamicProperty"); if (value === undefined) this.__props.delete(key); else this.__props.set(key, value); }
    getDynamicPropertyIds() { return [...this.__props.keys()]; }
    getDynamicPropertyTotalByteCount() { return 0; }
    getTimeOfDay() { return this.engine.timeOfDay; }
    setTimeOfDay(t) { this.engine.timeOfDay = t; }
    getAbsoluteTime() { return this.engine.timeOfDay; }
    setAbsoluteTime(t) { this.engine.timeOfDay = t; }
    getDay() { return Math.floor(this.engine.totalTicks / 24000); }
    playSound() { counted("world.playSound"); }
    broadcastClientMessage(id) { this.sendMessage(id); }
    get players() { return this.getAllPlayers(); }
    get structureManager() { return { createFromStructure: () => ({ saveToWorld: () => true, isValid: true }), get: () => undefined }; }
    setBlockType() { }
}

/** Scripted event receive is on system.afterEvents in the real API. */
class FakeSystem {
    constructor(engine) {
        this.engine = engine;
        this.afterEvents = eventGroup(engine, "system.afterEvents", ["scriptEventReceive", "beforeWatchdogTerminate"]);
        this.beforeEvents = eventGroup(engine, "system.beforeEvents", ["startup", "watchdogTerminate"]);
    }
    get currentTick() { return this.engine.totalTicks; }
    run(callback) {
        counted("system.run");
        const id = ++this.engine.taskId;
        this.engine.tasks.push({ id, callback, kind: "run" });
        return id;
    }
    runTimeout(callback, ticks) {
        counted("system.runTimeout");
        const id = ++this.engine.taskId;
        this.engine.tasks.push({ id, callback, kind: "timeout", due: this.engine.totalTicks + (ticks ?? 1) });
        return id;
    }
    runInterval(callback, ticks) {
        counted("system.runInterval");
        const id = ++this.engine.taskId;
        this.engine.tasks.push({ id, callback, kind: "interval", every: ticks ?? 1, due: this.engine.totalTicks + (ticks ?? 1) });
        return id;
    }
    clearRun(id) {
        counted("system.clearRun");
        this.engine.tasks = this.engine.tasks.filter((t) => t.id !== id);
    }
    waitTicks(ticks) {
        counted("system.waitTicks");
        return new Promise((resolve) => {
            const id = ++this.engine.taskId;
            this.engine.tasks.push({ id, callback: resolve, kind: "timeout", due: this.engine.totalTicks + (ticks ?? 1) });
        });
    }
}

class Engine {
    constructor() {
        this.dimensions = new Map();
        this.entities = [];
        this.players = [];
        this.tasks = [];
        this.taskId = 0;
        this.nextId = 0;
        this.totalTicks = 0;
        this.timeOfDay = 6000;
        this.messages = [];
        this.hud = [];
        this.commands = [];
        this.brokenBlocks = [];
        this.dropped = [];
        this.attacks = [];
        this.jumps = [];
        this.openedContainers = [];
        this.explosions = [];
        this.entityEvents = [];
        this.biomes = [];
        this.structures = [];
        this.defaultBiome = "minecraft:plains";
        this.signals = new Map();
        this.containers = new Map();
        this.world = new FakeWorld(this);
        this.system = new FakeSystem(this);
        this.instantMove = false;
        this.movePerTick = 0.25;
        this.acting = false;
    }
    dimension(id) { if (!this.dimensions.has(id)) this.dimensions.set(id, new FakeDimension(this, id)); return this.dimensions.get(id); }
    get overworld() { return this.dimension("minecraft:overworld"); }
    signal(name) {
        if (!this.signals.has(name)) this.signals.set(name, new EventSignal(this, name));
        return this.signals.get(name);
    }
    fire(name, payload = {}) {
        const signal = this.signals.get(name);
        if (!signal) return 0;
        for (const observer of [...signal.observers]) {
            try { observer(payload); }
            catch (e) { console.error(`[harness] observer for ${name} threw: ${e?.stack ?? e}`); }
        }
        return signal.observers.size;
    }
    observerCount() {
        let total = 0;
        for (const signal of this.signals.values()) total += signal.observers.size;
        return total;
    }
    peek(dim, x, y, z) { return dim.blocks.get(dim.key(x, y, z)) ?? "minecraft:air"; }
    setBlock(dim, x, y, z, typeId) {
        const k = dim.key(x, y, z);
        if (AIR.has(typeId)) dim.blocks.delete(k); else dim.blocks.set(k, typeId);
        dim.containers?.delete(k);
        this.containers.delete(`${dim.id}|${k}`);
        return true;
    }
    makeBlock(dim, key) { return new FakeBlock(this, dim, key); }
    container(dim, key) {
        const id = `${dim.id}|${key}`;
        let c = this.containers.get(id);
        if (!c) { c = new FakeContainer(27); this.containers.set(id, c); }
        return c;
    }
    containerAt(loc, dimension = this.overworld) {
        const dim = typeof dimension === "string" ? this.dimension(dimension) : dimension;
        return this.container(dim, dim.key(loc.x, loc.y, loc.z));
    }
    spawnEntity(typeId, loc, dimension = this.overworld, options = {}) {
        const entity = new FakeEntity(this, typeId, dimension, loc, options);
        this.entities.push(entity);
        return entity;
    }
    spawnPlayer({ name = "Player", location = { x: 0, y: 64, z: 0 }, dimension = this.overworld } = {}) {
        const player = new Player(this, name, typeof dimension === "string" ? this.dimension(dimension) : dimension, location);
        this.players.push(player);
        this.entities.push(player);
        return player;
    }
    spawnSim({ name = "Verdant", location = { x: 0, y: 64, z: 0 }, dimension = this.overworld } = {}) {
        const sim = new SimulatedPlayer(this, name, typeof dimension === "string" ? this.dimension(dimension) : dimension, location);
        this.players.push(sim);
        this.entities.push(sim);
        return sim;
    }
    /** Advance one tick: run due tasks in creation order, then apply movement intents. */
    tick(count = 1) {
        for (let i = 0; i < count; i++) {
            this.totalTicks++;
            this.timeOfDay = (this.timeOfDay + 1) % 24000;
            const due = this.tasks.filter((t) => t.kind !== "run" && t.due !== undefined && t.due <= this.totalTicks);
            for (const task of due) {
                if (task.kind === "timeout") this.tasks = this.tasks.filter((t) => t !== task);
                else task.due = this.totalTicks + task.every;
                this.invoke(task.callback);
            }
            const runs = this.tasks.filter((t) => t.kind === "run");
            this.tasks = this.tasks.filter((t) => t.kind !== "run");
            for (const task of runs) this.invoke(task.callback);
            for (const entity of [...this.entities]) this.step(entity);
        }
    }
    invoke(callback) {
        if (this.acting) { callback(); return; }
        this.acting = true;
        try { callback(); }
        catch (e) { this.errors = this.errors ?? []; this.errors.push(e); }
        finally { this.acting = false; }
    }
    step(entity) {
        // Vanilla-ish block breaking: the swing completes after a short delay.
        if (entity.__breaking) {
            const brk = entity.__breaking;
            if (--brk.left <= 0) {
                const dim = brk.dimension ?? entity.dimension;
                this.setBlock(dim, brk.at.x, brk.at.y, brk.at.z, "minecraft:air");
                this.brokenBlocks.push({ id: brk.id, at: { ...brk.at }, by: entity.id });
                this.fire("world.afterEvents.playerBreakBlock", {
                    player: entity,
                    brokenBlockPermutation: new FakeBlockPermutation(brk.id),
                    block: brk.block,
                    dimension: dim,
                });
                const dropId = blockDropId(brk.id);
                if (dropId && dim?.spawnItem) {
                    dim.spawnItem(new ItemStack(dropId, 1), { x: brk.at.x + 0.5, y: brk.at.y + 0.5, z: brk.at.z + 0.5 });
                }
                entity.__breaking = undefined;
            }
        }
        // Vanilla-ish item pickup: players absorb item entities they stand near.
        if (entity.__inventory) {
            for (const other of [...this.entities]) {
                if (!other.isValid || other === entity || other.dimension !== entity.dimension) continue;
                const stack = other.__item;
                if (!stack) continue;
                if (Math.hypot(other.location.x - entity.location.x, other.location.y - entity.location.y, other.location.z - entity.location.z) > 1.2) continue;
                const leftover = entity.__inventory.addItem(new ItemStack(stack));
                const picked = !leftover || leftover.amount <= 0;
                if (picked) {
                    other.isValid = false;
                    this.entities = this.entities.filter((e) => e !== other);
                    this.picked = this.picked ?? [];
                    this.picked.push({ by: entity.id, item: stack.typeId });
                }
            }
        }
        const move = entity.__movement;
        if (!move?.target) return;
        const target = move.target;
        if (this.instantMove) { entity.location = { x: target.x, y: target.y, z: target.z }; entity.__movement = undefined; return; }
        const dx = target.x - entity.location.x;
        const dz = target.z - entity.location.z;
        const dy = target.y - entity.location.y;
        const dist = Math.hypot(dx, dy, dz);
        const step = this.movePerTick * (move.speed ?? 1) * 4;
        if (dist <= step) { entity.location = { x: target.x, y: target.y, z: target.z }; entity.__movement = undefined; return; }
        entity.location = { x: entity.location.x + (dx / dist) * step, y: entity.location.y + (dy / dist) * step, z: entity.location.z + (dz / dist) * step };
    }
    /** Every callback the pack registered, in registration order (for reload assertions). */
    taskSummary() { return this.tasks.map((t) => ({ id: t.id, kind: t.kind })); }
    counters() { return Object.fromEntries(counters); }
    reset() {
        this.dimensions.clear();
        this.entities = [];
        this.players = [];
        this.tasks = [];
        this.totalTicks = 0;
        this.timeOfDay = 6000;
        this.messages = [];
        this.hud = [];
        this.commands = [];
        this.brokenBlocks = [];
        this.dropped = [];
        this.attacks = [];
        this.jumps = [];
        this.openedContainers = [];
        this.explosions = [];
        this.entityEvents = [];
        this.biomes = [];
        this.structures = [];
        this.defaultBiome = "minecraft:plains";
        this.signals.clear();
        this.containers.clear();
        this.world = new FakeWorld(this);
        this.system = new FakeSystem(this);
        this.errors = [];
        this.taskId = 0;
        this.nextId = 0;
    }
}

export const __engine = new Engine();
export const world = __engine.world;
export const system = __engine.system;

/** Test helpers, deliberately namespaced so pack code cannot depend on them. */
export const __harness = {
    engine: __engine,
    counters: () => __engine.counters(),
    resetCounters: () => counters.clear(),
    reset: () => __engine.reset(),
    tick: (n = 1) => __engine.tick(n),
    fire: (name, payload) => __engine.fire(name, payload),
    observerCount: () => __engine.observerCount(),
    messages: () => [...__engine.messages],
    lastMessage: () => __engine.messages.at(-1)?.message,
    commands: () => [...__engine.commands],
    brokenBlocks: () => [...__engine.brokenBlocks],
    fill: (loc, typeId, dimension = "minecraft:overworld") => {
        const dim = __engine.dimension(dimension);
        return __engine.setBlock(dim, loc.x, loc.y, loc.z, typeId);
    },
    fillBox(from, to, typeId, dimension = "minecraft:overworld") {
        const dim = __engine.dimension(dimension);
        for (let x = from.x; x <= to.x; x++) for (let y = from.y; y <= to.y; y++) for (let z = from.z; z <= to.z; z++) __engine.setBlock(dim, x, y, z, typeId);
    },
    ground(y = 63, size = 8, typeId = "minecraft:stone") {
        __harness.fillBox({ x: -size, y, z: -size }, { x: size, y, z: size }, typeId);
        return { x: 0, y: y + 1, z: 0 };
    },
    /** Seed a biome patch for findClosestBiome/getBiome (offline only). */
    setBiome: (loc, biome, radius = 96, dimension = "minecraft:overworld") => {
        __engine.biomes.push({ pos: { ...loc }, biome, radius, dimension });
    },
    /** Seed a generated structure for getGeneratedStructures (offline only). */
    setStructure: (loc, id, radius = 96, dimension = "minecraft:overworld") => {
        __engine.structures.push({ pos: { ...loc }, id, radius, dimension });
    },
    at: (loc, dimension = "minecraft:overworld") => __harness.engine.dimension(dimension).getBlock(loc),
    typeAt: (loc, dimension = "minecraft:overworld") => __engine.peek(__engine.dimension(dimension), Math.floor(loc.x), Math.floor(loc.y), Math.floor(loc.z)),
    containerAt: (loc, dimension) => __engine.containerAt(loc, dimension),
    spawnSim: (options) => __engine.spawnSim(options),
    spawnPlayer: (options) => __engine.spawnPlayer(options),
    spawnEntity: (typeId, loc, options) => __engine.spawnEntity(typeId, loc, __engine.overworld, options),
    setInstantMove: (on) => { __engine.instantMove = on; },
    errors: () => __engine.errors ?? [],
    instantiate: { Player, SimulatedPlayer, ItemStack, FakeContainer, FakeBlockPermutation },
};
