// Instrumented offline fake of @minecraft/server for tools/perf.mjs.
//
// This is not a game. It is just enough engine surface for the real bot code
// to run its normal per-tick paths against a deterministic procedural world.
// Every getter/method that would cross the script<->native boundary in
// Bedrock increments a counter in N, so a run reports how many engine calls
// the bot makes per tick. Bedrock's script engine (QuickJS, no JIT) pays a
// real price for each of those calls, so native-call counts are the main
// lag metric; wall time under Node/V8 is reported as a secondary signal.

/** Native-call counters by category. */
export const N = {
    getBlock: 0, blockProp: 0, getEntities: 0, entityProp: 0, getComponent: 0,
    container: 0, item: 0, sim: 0, world: 0,
};
export function resetCounters() { for (const k of Object.keys(N)) N[k] = 0; }
export function totalNative() { let t = 0; for (const k of Object.keys(N)) t += N[k]; return t; }

/* ----------------------------------------------------------------- world */

export const state = {
    tick: 0,
    time: 1000,
    edits: new Map(),        // numeric cell key -> typeId (breaks/places)
    gen: new Map(),          // memo of generated types
    entities: [],
    players: [],
    props: new Map(),
    propBytes: 0,
    queue: [],
    timeouts: [],
    messages: 0,
};

const ck = (x, y, z) => ((x & 0xffff) * 65536 + (z & 0xffff)) * 1024 + ((y + 512) & 1023);

function hash(x, z, s = 0) {
    let h = Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263) ^ Math.imul(s | 0, 1442695041);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return (h ^ (h >>> 16)) >>> 0;
}
export function heightAt(x, z) {
    return 64 + Math.round(4 * Math.sin(x / 13) + 3 * Math.cos(z / 17) + 2 * Math.sin((x + z) / 7));
}
export const SEA = 61;
const isTrunk = (x, z) => hash(x, z, 1) % 61 === 0 && heightAt(x, z) > SEA;

function generate(x, y, z) {
    if (y < -64 || y > 319) return undefined;
    if (y === -64) return "minecraft:bedrock";
    const h = heightAt(x, z);
    if (y > h) {
        if (h > SEA) {
            if (isTrunk(x, z) && y <= h + 5) return "minecraft:oak_log";
            if (y >= h + 4 && y <= h + 6) {
                for (let dx = -2; dx <= 2; dx++)
                    for (let dz = -2; dz <= 2; dz++)
                        if ((dx || dz) && isTrunk(x + dx, z + dz) && Math.abs(heightAt(x + dx, z + dz) - h) <= 1)
                            return "minecraft:oak_leaves";
            }
            if (y === h + 1 && hash(x, z, 2) % 4 === 0) return "minecraft:short_grass";
        }
        if (y <= SEA) return "minecraft:water";
        return "minecraft:air";
    }
    if (y === h) return h <= SEA ? "minecraft:sand" : "minecraft:grass_block";
    if (y > h - 4) return h <= SEA ? "minecraft:sand" : "minecraft:dirt";
    const r = hash(x * 31 + y, z, 3) % 1000;
    if (r < 9) return "minecraft:coal_ore";
    if (r < 13 && y < 56) return "minecraft:iron_ore";
    if (y < 0) return "minecraft:deepslate";
    return "minecraft:stone";
}
export function typeAt(x, y, z) {
    const k = ck(x, y, z);
    const e = state.edits.get(k);
    if (e !== undefined) return e;
    let g = state.gen.get(k);
    if (g === undefined) {
        g = generate(x, y, z) ?? null;
        state.gen.set(k, g);
    }
    return g ?? undefined;
}
export function setType(x, y, z, t) { state.edits.set(ck(x, y, z), t); }

const LIQUID = /^minecraft:(flowing_)?(water|lava)$/;
const NON_SOLID = /(air|water|lava|short_grass|tallgrass|_flower|torch|sapling|chest|carpet|rail|button|_plate|ladder|vine|snow_layer|fern)/;
const isSolidType = (t) => !!t && !NON_SOLID.test(t);

/** Standable feet cell near (x, y, z) for the toy physics. */
export function groundY(x, z, nearY) {
    for (const dy of [0, 1, -1, 2, -2, -3, -4, -5, -6, 3, 4]) {
        const y = nearY + dy;
        const feet = typeAt(x, y, z), head = typeAt(x, y + 1, z), below = typeAt(x, y - 1, z);
        if (!isSolidType(feet) && !isSolidType(head) && isSolidType(below)) return y;
    }
    return undefined;
}

/* --------------------------------------------------------------- enums */

export const Direction = { Down: "Down", Up: "Up", North: "North", South: "South", West: "West", East: "East" };
export const EntityComponentTypes = {
    Inventory: "minecraft:inventory", Health: "minecraft:health", Equippable: "minecraft:equippable",
    Riding: "minecraft:riding", Rideable: "minecraft:rideable", Item: "minecraft:item",
};
export const EquipmentSlot = { Head: "Head", Chest: "Chest", Legs: "Legs", Feet: "Feet", Mainhand: "Mainhand", Offhand: "Offhand" };
export const GameMode = { Survival: "survival", Creative: "creative", Adventure: "adventure", Spectator: "spectator" };

/* ---------------------------------------------------------------- items */

const TOOL = /_(pickaxe|axe|shovel|hoe|sword|helmet|chestplate|leggings|boots)$|^minecraft:(shield|bow|flint_and_steel|fishing_rod)$/;
const FOODS = { "minecraft:bread": 5, "minecraft:cooked_beef": 8, "minecraft:apple": 4, "minecraft:cooked_porkchop": 8, "minecraft:carrot": 3, "minecraft:beef": 3 };
const SINGLE = /(_bucket|^minecraft:bucket$|_bed$|^minecraft:boat$|_boat$)/;

export class ItemStack {
    constructor(typeId, amount = 1) {
        const t = String(typeId);
        this._t = t.includes(":") ? t : "minecraft:" + t;
        this._a = amount;
        this._dmg = 0;
    }
    _copy() { const s = new ItemStack(this._t, this._a); s._dmg = this._dmg; return s; }
    get typeId() { N.item++; return this._t; }
    get amount() { N.item++; return this._a; }
    set amount(v) { N.item++; this._a = v; }
    get maxAmount() { N.item++; return TOOL.test(this._t) ? 1 : SINGLE.test(this._t) ? 1 : 64; }
    get isStackable() { N.item++; return !TOOL.test(this._t); }
    get nameTag() { N.item++; return undefined; }
    clone() { N.item++; return this._copy(); }
    isStackableWith(o) { N.item++; return !!o && o._t === this._t && !TOOL.test(this._t) && !SINGLE.test(this._t); }
    getComponent(name) {
        N.item++;
        const n = String(name).replace("minecraft:", "");
        if (n === "durability" && TOOL.test(this._t)) {
            const s = this;
            return { get damage() { N.item++; return s._dmg; }, set damage(v) { N.item++; s._dmg = v; }, get maxDurability() { N.item++; return 131; } };
        }
        if (n === "food" && FOODS[this._t]) return { nutrition: FOODS[this._t], canAlwaysEat: false, saturationModifier: 0.6 };
        return undefined;
    }
    getLore() { N.item++; return []; }
    setLore() { N.item++; }
    getTags() { N.item++; return []; }
    hasTag() { N.item++; return false; }
}

export class Container {
    constructor(size) { this._s = new Array(size).fill(undefined); }
    get size() { N.container++; return this._s.length; }
    get emptySlotsCount() { N.container++; let n = 0; for (const s of this._s) if (!s) n++; return n; }
    get isValid() { N.container++; return true; }
    getItem(i) { N.container++; const s = this._s[i]; return s ? s._copy() : undefined; }
    setItem(i, item) { N.container++; if (i < 0 || i >= this._s.length) throw Error("slot out of range"); this._s[i] = item ? item._copy() : undefined; }
    swapItems(a, b, other) { N.container++; const o = other ?? this; const t = this._s[a]; this._s[a] = o._s[b]; o._s[b] = t; }
    moveItem(a, b, other) { N.container++; const o = other ?? this; if (!o._s[b]) { o._s[b] = this._s[a]; this._s[a] = undefined; } }
    transferItem(a, other) { N.container++; const s = this._s[a]; if (!s) return undefined; this._s[a] = undefined; return other._add(s); }
    addItem(item) { N.container++; return this._add(item._copy()); }
    _add(s) {
        const max = TOOL.test(s._t) || SINGLE.test(s._t) ? 1 : 64;
        for (let i = 0; i < this._s.length && s._a > 0; i++) {
            const d = this._s[i];
            if (d && d._t === s._t && d._a < max) { const n = Math.min(max - d._a, s._a); d._a += n; s._a -= n; }
        }
        for (let i = 0; i < this._s.length && s._a > 0; i++) if (!this._s[i]) { this._s[i] = s._copy(); s._a = 0; }
        return s._a > 0 ? s : undefined;
    }
    clearAll() { N.container++; this._s.fill(undefined); }
    /** Harness helper: give items without counting. */
    give(type, amount) { this._add(new ItemStack(type, amount)); }
}

/* --------------------------------------------------------------- blocks */

class Block {
    constructor(dim, x, y, z) { this.dimension = dim; this._x = x; this._y = y; this._z = z; }
    get _t() { return typeAt(this._x, this._y, this._z) ?? "minecraft:air"; }
    get location() { N.blockProp++; return { x: this._x, y: this._y, z: this._z }; }
    get x() { N.blockProp++; return this._x; }
    get y() { N.blockProp++; return this._y; }
    get z() { N.blockProp++; return this._z; }
    get typeId() { N.blockProp++; return this._t; }
    get isAir() { N.blockProp++; return this._t === "minecraft:air"; }
    get isLiquid() { N.blockProp++; return LIQUID.test(this._t); }
    get isSolid() { N.blockProp++; return isSolidType(this._t); }
    get isValid() { N.blockProp++; return true; }
    get isWaterlogged() { N.blockProp++; return false; }
    get type() { N.blockProp++; return { id: this._t }; }
    get permutation() {
        N.blockProp++;
        const t = this._t;
        return { type: { id: t }, matches: (id) => id === t, getState: () => undefined, getAllStates: () => ({}), withState() { return this; }, getTags: () => [], hasTag: () => false };
    }
    getComponent(name) {
        N.getComponent++;
        const n = String(name).replace("minecraft:", "");
        if (n === "inventory" && /(chest|barrel|furnace)/.test(this._t)) return { container: chestAt(this._x, this._y, this._z) };
        return undefined;
    }
    above(n = 1) { N.blockProp++; return new Block(this.dimension, this._x, this._y + n, this._z); }
    below(n = 1) { N.blockProp++; return new Block(this.dimension, this._x, this._y - n, this._z); }
    north(n = 1) { N.blockProp++; return new Block(this.dimension, this._x, this._y, this._z - n); }
    south(n = 1) { N.blockProp++; return new Block(this.dimension, this._x, this._y, this._z + n); }
    east(n = 1) { N.blockProp++; return new Block(this.dimension, this._x + n, this._y, this._z); }
    west(n = 1) { N.blockProp++; return new Block(this.dimension, this._x - n, this._y, this._z); }
    setType(t) { N.blockProp++; setType(this._x, this._y, this._z, typeof t === "string" ? t : t?.id); }
    setPermutation(p) { N.blockProp++; setType(this._x, this._y, this._z, p?.type?.id ?? "minecraft:air"); }
    getTags() { N.blockProp++; return []; }
    hasTag() { N.blockProp++; return false; }
}
const chests = new Map();
function chestAt(x, y, z) {
    const k = ck(x, y, z);
    if (!chests.has(k)) chests.set(k, new Container(27));
    return chests.get(k);
}

/* ------------------------------------------------------------- entities */

let nextId = 1;
const FACE = { Up: [0, 1, 0], Down: [0, -1, 0], North: [0, 0, -1], South: [0, 0, 1], East: [1, 0, 0], West: [-1, 0, 0] };

export class Entity {
    constructor(typeId, loc, opts = {}) {
        this._typeId = typeId.includes(":") ? typeId : "minecraft:" + typeId;
        this._loc = { x: loc.x, y: loc.y, z: loc.z };
        this._valid = true;
        this._id = String(-(nextId++));
        this._tags = new Set();
        this._hp = opts.hp ?? 20;
        this._families = opts.families ?? [];
        this._item = opts.item;
        this.dimension = OVERWORLD;
    }
    get typeId() { N.entityProp++; return this._typeId; }
    get location() { N.entityProp++; return { x: this._loc.x, y: this._loc.y, z: this._loc.z }; }
    get isValid() { N.entityProp++; return this._valid; }
    get id() { N.entityProp++; return this._id; }
    get nameTag() { N.entityProp++; return ""; }
    get isOnGround() { N.entityProp++; return true; }
    get isInWater() { N.entityProp++; return LIQUID.test(typeAt(Math.floor(this._loc.x), Math.floor(this._loc.y), Math.floor(this._loc.z)) ?? ""); }
    get isSneaking() { N.entityProp++; return false; }
    set isSneaking(v) { N.entityProp++; }
    get isSleeping() { N.entityProp++; return false; }
    get isOnFire() { N.entityProp++; return false; }
    get isSwimming() { N.entityProp++; return false; }
    getComponent(name) {
        N.getComponent++;
        const n = String(name).replace("minecraft:", "");
        if (n === "health") { const e = this; return { get currentValue() { N.getComponent++; return e._hp; }, effectiveMax: 20, defaultValue: 20, setCurrentValue(v) { e._hp = v; return true; }, resetToMaxValue() { e._hp = 20; } }; }
        if (n === "item" && this._item) return { itemStack: this._item._copy() };
        return undefined;
    }
    hasComponent(name) { N.getComponent++; return !!this.getComponent(name); }
    hasTag(t) { N.entityProp++; return this._tags.has(t); }
    addTag(t) { N.entityProp++; this._tags.add(t); return true; }
    removeTag(t) { N.entityProp++; return this._tags.delete(t); }
    getTags() { N.entityProp++; return [...this._tags]; }
    getHeadLocation() { N.entityProp++; return { x: this._loc.x, y: this._loc.y + 1.62, z: this._loc.z }; }
    getVelocity() { N.entityProp++; return { x: 0, y: 0, z: 0 }; }
    getRotation() { N.entityProp++; return { x: 0, y: 0 }; }
    getViewDirection() { N.entityProp++; return { x: 0, y: 0, z: 1 }; }
    getEffect() { N.entityProp++; return undefined; }
    addEffect() { N.entityProp++; }
    applyDamage(n) { N.entityProp++; this._hp -= n; if (this._hp <= 0) this.remove(); return true; }
    applyImpulse() { N.entityProp++; }
    teleport(p) { N.entityProp++; this._loc = { x: p.x, y: p.y, z: p.z }; }
    kill() { N.entityProp++; this.remove(); return true; }
    remove() { this._valid = false; const i = state.entities.indexOf(this); if (i >= 0) state.entities.splice(i, 1); }
    triggerEvent() { N.entityProp++; }
}

export class Player extends Entity {
    constructor(name, loc) {
        super("minecraft:player", loc);
        this._name = name;
        const self = this;
        this.onScreenDisplay = {
            setActionBar() { N.world++; },
            setTitle() { N.world++; },
            updateSubtitle() { N.world++; },
        };
        this._self = self;
    }
    get name() { N.entityProp++; return this._name; }
    sendMessage() { N.world++; state.messages++; }
    playSound() { N.world++; }
    getGameMode() { N.entityProp++; return "survival"; }
}

/** The simulated player the bot drives. Movement is a toy integrator. */
export class SimPlayer extends Player {
    constructor(name, loc) {
        super(name, loc);
        this._inv = new Container(36);
        this._hunger = 20;
        this._hp = 20;
        this._slot = 0;
        this._sprint = false;
        this._sneak = false;
        this._move = undefined;
        this._vy = 0;
        this._swim = 0;
        this._ground = true;
        this._breaking = undefined;
        this._equip = {};
        this.broken = 0;
        this.placed = 0;
        this.moved = 0;
    }
    getComponent(name) {
        N.getComponent++;
        const n = String(name).replace("minecraft:", "");
        const self = this;
        if (n === "inventory") return { container: this._inv, inventorySize: 36 };
        if (n === "health") return { get currentValue() { N.getComponent++; return self._hp; }, effectiveMax: 20, defaultValue: 20, setCurrentValue(v) { self._hp = v; return true; }, resetToMaxValue() { self._hp = 20; } };
        if (n === "player.hunger") return { get currentValue() { N.getComponent++; return self._hunger; }, effectiveMax: 20, setCurrentValue(v) { self._hunger = v; return true; } };
        if (n === "equippable") return {
            getEquipment(slot) { N.item++; return self._equip[slot]?._copy(); },
            setEquipment(slot, item) { N.item++; self._equip[slot] = item ? item._copy() : undefined; return true; },
            getEquipmentSlot(slot) { N.item++; return { getItem: () => self._equip[slot]?._copy(), setItem: (i) => { self._equip[slot] = i?._copy(); } }; },
        };
        return undefined;
    }
    get isOnGround() { N.entityProp++; return this._ground; }
    get isInWater() { N.entityProp++; return LIQUID.test(typeAt(Math.floor(this._loc.x), Math.floor(this._loc.y), Math.floor(this._loc.z)) ?? ""); }
    get isSprinting() { N.entityProp++; return this._sprint; }
    set isSprinting(v) { N.entityProp++; this._sprint = !!v; }
    get isSneaking() { N.entityProp++; return this._sneak; }
    set isSneaking(v) { N.entityProp++; this._sneak = !!v; }
    get selectedSlotIndex() { N.sim++; return this._slot; }
    set selectedSlotIndex(v) { N.sim++; this._slot = v; }
    moveToLocation(loc, opts) { N.sim++; this._move = { x: loc.x, y: loc.y, z: loc.z, speed: opts?.speed ?? 1 }; }
    moveToBlock(loc) { N.sim++; this._move = { x: loc.x + 0.5, y: loc.y, z: loc.z + 0.5, speed: 1 }; }
    navigateToLocation(loc) { N.sim++; this._move = { x: loc.x, y: loc.y, z: loc.z, speed: 1 }; return { isFullPath: true, path: [] }; }
    stopMoving() { N.sim++; this._move = undefined; }
    jump() {
        N.sim++;
        if (this._inWater()) this._swim = 6;
        else if (this._ground) { this._vy = 0.42; this._ground = false; }
        return true;
    }
    _inWater() { return LIQUID.test(typeAt(Math.floor(this._loc.x), Math.floor(this._loc.y), Math.floor(this._loc.z)) ?? ""); }
    /** Height the feet can rest at in the current column (top of the first solid block below). */
    _supportY() {
        const x = Math.floor(this._loc.x), z = Math.floor(this._loc.z), fy = Math.floor(this._loc.y + 1e-6);
        for (let y = fy; y >= fy - 8; y--) if (isSolidType(typeAt(x, y - 1, z))) return y;
        return -Infinity;
    }
    lookAtBlock() { N.sim++; }
    lookAtEntity() { N.sim++; }
    lookAtLocation() { N.sim++; }
    setBodyRotation() { N.sim++; }
    breakBlock(loc) {
        N.sim++;
        const x = Math.floor(loc.x), y = Math.floor(loc.y), z = Math.floor(loc.z);
        const t = typeAt(x, y, z);
        if (!t || t === "minecraft:air" || LIQUID.test(t) || t === "minecraft:bedrock") return false;
        this._breaking = { x, y, z, until: state.tick + 6 };
        return true;
    }
    stopBreakingBlock() { N.sim++; this._breaking = undefined; }
    useItemInSlot(slot) {
        N.sim++;
        const s = this._inv._s[slot];
        if (s && FOODS[s._t]) { this._hunger = Math.min(20, this._hunger + FOODS[s._t]); if (--s._a <= 0) this._inv._s[slot] = undefined; return true; }
        return false;
    }
    useItemInSlotOnBlock(slot, loc, face) {
        N.sim++;
        const s = this._inv._s[slot];
        if (!s || TOOL.test(s._t) || FOODS[s._t]) return false;
        const f = FACE[face ?? "Up"] ?? FACE.Up;
        const x = Math.floor(loc.x) + f[0], y = Math.floor(loc.y) + f[1], z = Math.floor(loc.z) + f[2];
        const t = typeAt(x, y, z);
        if (t && t !== "minecraft:air" && !LIQUID.test(t) && t !== "minecraft:short_grass") return false;
        setType(x, y, z, s._t);
        if (--s._a <= 0) this._inv._s[slot] = undefined;
        this.placed++;
        return true;
    }
    stopUsingItem() { N.sim++; }
    stopInteracting() { N.sim++; }
    interact() { N.sim++; return false; }
    interactWithBlock() { N.sim++; return false; }
    interactWithEntity() { N.sim++; return false; }
    attackEntity(e) { N.sim++; if (e?._valid) e.applyDamage(5); return true; }
    attack() { N.sim++; return false; }
    respawn() { N.sim++; this._hp = 20; }
    swim() { N.sim++; }
    stopSwimming() { N.sim++; }
    useItem() { N.sim++; return false; }
    giveItem(item) { N.sim++; this._inv._add(item._copy()); return true; }
    /** Toy physics, called by the harness once per tick (not counted). */
    physics() {
        if (this._breaking && state.tick >= this._breaking.until) {
            const b = this._breaking;
            this._breaking = undefined;
            const t = typeAt(b.x, b.y, b.z);
            if (t && t !== "minecraft:air") {
                setType(b.x, b.y, b.z, "minecraft:air");
                this.broken++;
                const drop = t === "minecraft:stone" ? "minecraft:cobblestone" : t === "minecraft:grass_block" ? "minecraft:dirt" :
                    t === "minecraft:coal_ore" ? "minecraft:coal" : t === "minecraft:iron_ore" ? "minecraft:raw_iron" :
                        t === "minecraft:deepslate" ? "minecraft:cobbled_deepslate" : t === "minecraft:oak_leaves" || t === "minecraft:short_grass" ? undefined : t;
                if (drop) this._inv._add(new ItemStack(drop, 1));
            }
        }
        const L = this._loc;
        // Horizontal: walk toward the move target; solid cells at feet/body/head height block.
        const m = this._move;
        if (m) {
            const dx = m.x - L.x, dz = m.z - L.z, d = Math.hypot(dx, dz);
            if (d > 0.05) {
                const step = Math.min(d, 0.216 * (this._sprint ? 1.3 : 1) * (m.speed ?? 1) * (this._inWater() ? 0.5 : 1));
                const nx = L.x + (dx / d) * step, nz = L.z + (dz / d) * step;
                const cx = Math.floor(nx), cz = Math.floor(nz);
                const blocked = isSolidType(typeAt(cx, Math.floor(L.y + 0.01), cz)) || isSolidType(typeAt(cx, Math.floor(L.y + 1), cz)) || isSolidType(typeAt(cx, Math.floor(L.y + 1.7), cz));
                if (!blocked) { L.x = nx; L.z = nz; this.moved += step; }
            }
        }
        // Vertical: gravity and jump arcs on land, slow sinking / swimming up in water.
        // (Velocity is applied before gravity, as in Minecraft: a 0.42 jump peaks ~1.25 blocks.)
        const support = this._supportY();
        const water = this._inWater();
        if (water && this._swim > 0) { this._swim--; this._vy = 0.12; }
        let ny = L.y + this._vy;
        if (this._vy > 0 && isSolidType(typeAt(Math.floor(L.x), Math.floor(ny + 1.8), Math.floor(L.z)))) { ny = L.y; this._vy = 0; }
        if (water) this._vy = this._swim > 0 ? this._vy : Math.max(this._vy - 0.02, -0.06);
        else this._vy = (this._vy - 0.08) * 0.98;
        if (ny <= support) { ny = support; this._vy = 0; }
        L.y = ny;
        this._ground = ny === support && this._vy === 0;
    }
}

/* ------------------------------------------------------------ dimension */

function matchQuery(e, o) {
    if (!e._valid) return false;
    if (o.type && e._typeId !== (o.type.includes(":") ? o.type : "minecraft:" + o.type)) return false;
    if (o.excludeTypes && o.excludeTypes.some((t) => e._typeId === (t.includes(":") ? t : "minecraft:" + t))) return false;
    if (o.families && !o.families.every((f) => e._families.includes(f))) return false;
    if (o.excludeFamilies && o.excludeFamilies.some((f) => e._families.includes(f))) return false;
    if (o.name && e._name !== o.name) return false;
    if (o.tags && !o.tags.every((t) => e._tags.has(t))) return false;
    if (o.excludeTags && o.excludeTags.some((t) => e._tags.has(t))) return false;
    if (o.location && o.maxDistance !== undefined) {
        const d = Math.hypot(e._loc.x - o.location.x, e._loc.y - o.location.y, e._loc.z - o.location.z);
        if (d > o.maxDistance) return false;
        if (o.minDistance !== undefined && d < o.minDistance) return false;
    }
    return true;
}

class Dimension {
    constructor() { this.id = "minecraft:overworld"; this.heightRange = { min: -64, max: 320 }; }
    getBlock(loc) {
        N.getBlock++;
        const x = Math.floor(loc.x), y = Math.floor(loc.y), z = Math.floor(loc.z);
        if (y < -64 || y >= 320) return undefined;
        return new Block(this, x, y, z);
    }
    getTopmostBlock(loc) {
        N.getBlock++;
        const x = Math.floor(loc.x), z = Math.floor(loc.z);
        return new Block(this, x, heightAt(x, z), z);
    }
    getEntities(o = {}) {
        N.getEntities++;
        let out = state.entities.filter((e) => matchQuery(e, o));
        if (o.closest && o.location) out = out.sort((a, b) => Math.hypot(a._loc.x - o.location.x, a._loc.z - o.location.z) - Math.hypot(b._loc.x - o.location.x, b._loc.z - o.location.z)).slice(0, o.closest);
        return out;
    }
    getEntitiesAtBlockLocation(loc) { N.getEntities++; return state.entities.filter((e) => Math.floor(e._loc.x) === Math.floor(loc.x) && Math.floor(e._loc.y) === Math.floor(loc.y) && Math.floor(e._loc.z) === Math.floor(loc.z)); }
    getPlayers(o = {}) { N.world++; return state.players.filter((p) => matchQuery(p, o)); }
    getBlockFromRay(from, dir, opts = {}) {
        N.getBlock++;
        const max = opts.maxDistance ?? 16;
        for (let t = 0.25; t <= max; t += 0.25) {
            const x = Math.floor(from.x + dir.x * t), y = Math.floor(from.y + dir.y * t), z = Math.floor(from.z + dir.z * t);
            const ty = typeAt(x, y, z);
            if (!ty) return undefined;
            if (isSolidType(ty) || (opts.includeLiquidBlocks && LIQUID.test(ty)))
                return { block: new Block(this, x, y, z), face: Direction.Up, faceLocation: { x: 0.5, y: 1, z: 0.5 } };
        }
        return undefined;
    }
    getEntitiesFromRay() { N.getEntities++; return []; }
    runCommand() { N.world++; return { successCount: 0 }; }
    runCommandAsync() { N.world++; return Promise.resolve({ successCount: 0 }); }
    spawnItem(item, loc) { N.world++; const e = new Entity("minecraft:item", loc, { item: item._copy() }); state.entities.push(e); return e; }
    spawnEntity(type, loc) { N.world++; const e = new Entity(type, loc); state.entities.push(e); return e; }
    spawnParticle() { N.world++; }
    setBlockType(loc, t) { N.world++; setType(Math.floor(loc.x), Math.floor(loc.y), Math.floor(loc.z), t); }
    getWeather() { N.world++; return "Clear"; }
    playSound() { N.world++; }
}
export const OVERWORLD = new Dimension();

/* ---------------------------------------------------------------- world */

class Objective {
    constructor(id) { this.id = id; this.displayName = id; this._scores = new Map(); }
    get isValid() { N.world++; return true; }
    getParticipants() { N.world++; return [...this._scores.keys()].map((n) => ({ get displayName() { N.world++; return n; }, id: 0, type: "FakePlayer" })); }
    setScore(name, score) { N.world++; this._scores.set(typeof name === "string" ? name : name.displayName, score); }
    addScore(name, n) { N.world++; this._scores.set(name, (this._scores.get(name) ?? 0) + n); }
    getScore(name) { N.world++; return this._scores.get(name); }
    removeParticipant(name) { N.world++; return this._scores.delete(typeof name === "string" ? name : name.displayName); }
    hasParticipant(name) { N.world++; return this._scores.has(name); }
    getScores() { N.world++; return [...this._scores].map(([n, s]) => ({ participant: { displayName: n }, score: s })); }
}
const objectives = new Map();
const noopSignal = () => ({ subscribe: (f) => f, unsubscribe() { } });
const signals = new Proxy({}, { get: () => noopSignal() });

export const world = {
    getAllPlayers() { N.world++; return state.players.filter((p) => p._valid); },
    getPlayers(o = {}) { N.world++; return state.players.filter((p) => matchQuery(p, o)); },
    getDimension() { N.world++; return OVERWORLD; },
    getDynamicProperty(k) { N.world++; return state.props.get(k); },
    setDynamicProperty(k, v) { N.world++; state.propBytes += typeof v === "string" ? v.length : 8; state.props.set(k, v); },
    getDynamicPropertyIds() { N.world++; return [...state.props.keys()]; },
    getTimeOfDay() { N.world++; return state.time % 24000; },
    getAbsoluteTime() { N.world++; return state.time; },
    getDay() { N.world++; return Math.floor(state.time / 24000); },
    getMoonPhase() { N.world++; return 0; },
    sendMessage() { N.world++; state.messages++; },
    getEntity(id) { N.world++; return state.entities.find((e) => e._id === id) ?? state.players.find((p) => p._id === id); },
    playSound() { N.world++; },
    scoreboard: {
        getObjective(id) { N.world++; return objectives.get(id); },
        addObjective(id) { N.world++; const o = new Objective(id); objectives.set(id, o); return o; },
        removeObjective(id) { N.world++; return objectives.delete(typeof id === "string" ? id : id.id); },
        setObjectiveAtDisplaySlot() { N.world++; },
        clearObjectiveAtDisplaySlot() { N.world++; },
        getObjectives() { N.world++; return [...objectives.values()]; },
    },
    gameRules: new Proxy({}, { get: () => true, set: () => true }),
    afterEvents: signals,
    beforeEvents: signals,
};

export const system = {
    get currentTick() { return state.tick; },
    run(fn) { state.queue.push(fn); return state.queue.length; },
    runTimeout(fn, t = 1) { state.timeouts.push({ at: state.tick + t, fn }); return state.timeouts.length; },
    runInterval() { return 0; },
    runJob() { return 0; },
    clearRun() { },
    clearJob() { },
    waitTicks() { return Promise.resolve(); },
    afterEvents: signals,
    beforeEvents: signals,
};

/** Reset world state between scenarios. */
export function resetWorld() {
    state.tick = 0;
    state.time = 1000;
    state.edits.clear();
    state.entities.length = 0;
    state.players.length = 0;
    state.props.clear();
    state.propBytes = 0;
    state.queue.length = 0;
    state.timeouts.length = 0;
    state.messages = 0;
    objectives.clear();
    chests.clear();
}

/** Advance harness time by one tick and run queued callbacks. */
export function advance() {
    state.tick++;
    state.time++;
    const q = state.queue.splice(0);
    for (const fn of q) try { fn(); } catch { /* bot-side errors are counted by the bot */ }
    const due = state.timeouts.filter((t) => t.at <= state.tick);
    state.timeouts = state.timeouts.filter((t) => t.at > state.tick);
    for (const t of due) try { t.fn(); } catch { /* ignore */ }
}
