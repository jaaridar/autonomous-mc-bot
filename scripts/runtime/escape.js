/**
 * World-class Escaper - can escape any situation: 16 skeletons, blaze, enderman, warden, lava, water, pit, etc.
 * Phases: ASSESS -> COVER -> BUILD -> RETREAT -> RECOVER
 * Uses builder, parkour, and tactical assessment.
 */
import { Direction } from "@minecraft/server";
import { add, floor, center, distance, key, CARDINAL, COMPASS, UP, DOWN, away } from "../core/math.js";
import { diggable, HAZARDS, RANGED, EXPLOSIVE } from "../core/policy.js";
import { getProfile, assess, bunkerPlan, chooseCoverDirection } from "../core/escape-strategy.js";
import { getMobStat } from "../core/combat.js";
import { Hands } from "./hands.js";

const FACES = new Map([
    ["1,0,0", Direction.East],
    ["-1,0,0", Direction.West],
    ["0,0,1", Direction.South],
    ["0,0,-1", Direction.North],
    ["0,1,0", Direction.Up],
    ["0,-1,0", Direction.Down],
]);
const dirFace = (d) => FACES.get(`${d.x},${d.y},${d.z}`);

export class Escaper {
    constructor(bot) {
        this.bot = bot;
        this.sim = bot.sim;
        this.bag = bot.bag;
        this.terrain = bot.terrain;
        this.nav = bot.nav;
        this.host = bot.host;
        this.hands = new Hands(bot);
        this.builder = bot.builder;
        this.mode = "";
        this.since = 0;
        this.pillarStart = 0;
        this.placed = false;
        this.jumpFrom = undefined;
        this.pillarCol = undefined;
        this.breaking = "";
        this.steps = 0;
        this.lastReason = "";
        this.riding = false;
        this.ridingEntity = undefined;
        this.boatTries = 0;
        this.boatSince = 0;
        this.drowning = undefined;
        this.swimming = false;
        this.escapeDir = undefined;
        this.deadDirs = [];
        // World-class additions
        this.phase = "assess"; // assess, cover, build, retreat, recover, bunker, water, pillar
        this.assessment = undefined;
        this.coverAttempts = 0;
        this.bunkerAttempts = 0;
        this.retreatTarget = undefined;
        this.emergencyBlocks = 0;
        this.lastWaterPlace = 0;
        this.endermanMode = false;
        this.skeletonSwarmMode = false;
        this.blazeMode = false;
    }

    get active() { return !!this.mode; }

    reset() {
        if (this.riding) this.eject();
        this.mode = "";
        this.phase = "assess";
        this.placed = false;
        this.pillarStart = 0;
        this.jumpFrom = undefined;
        this.pillarCol = undefined;
        this.breaking = "";
        this.crossing = undefined;
        this.steps = 0;
        this.boatTries = 0;
        this.drowning = undefined;
        this.swimming = false;
        this.escapeDir = undefined;
        this.deadDirs = [];
        this.assessment = undefined;
        this.coverAttempts = 0;
        this.bunkerAttempts = 0;
        this.retreatTarget = undefined;
        this.endermanMode = false;
        this.skeletonSwarmMode = false;
        this.blazeMode = false;
        try { this.sim.stopBreakingBlock(); } catch {}
        try { this.sim.isSneaking = false; } catch {}
    }

    bump() {
        if (++this.steps > 12) {
            this.lastReason = "Handing back to pathfinder.";
            this.reset();
            return false;
        }
        return true;
    }

    walkTo(loc) {
        if (!this.bump()) return "done";
        try { this.sim.moveToLocation(this.host.relative(loc), { faceTarget: true }); } catch {}
        return "running";
    }

    giveUp(reason) {
        this.lastReason = reason;
        this.reset();
        return "failed";
    }

    step(kind, tick) {
        if (this.mode !== kind) {
            this.reset();
            this.mode = kind;
            this.since = tick;
            this.placed = false;
            this.pillarStart = 0;
            this.phase = "assess";
        }
        if (tick - this.since > 800) {
            if (kind === "water") {
                this.lastReason = "Still in water; handing back.";
                this.reset();
                return "done";
            }
            return this.giveUp("Escape attempt took too long; needs help.");
        }

        // World-class: first assess situation
        if (this.phase === "assess") {
            this.assessSituation(tick);
            // Choose next phase based on assessment
            if (this.assessment) {
                if (this.assessment.hasEnderman) {
                    this.phase = "enderman";
                    this.endermanMode = true;
                } else if (this.assessment.hasSkeletonSwarm) {
                    this.phase = "skeleton_swarm";
                    this.skeletonSwarmMode = true;
                } else if (this.assessment.hasBlaze) {
                    this.phase = "blaze";
                    this.blazeMode = true;
                } else if (this.assessment.totalFear > 25) {
                    this.phase = "bunker";
                } else if (this.assessment.rangedCount > 0) {
                    this.phase = "cover";
                } else {
                    this.phase = "retreat";
                }
            }
        }

        if (kind === "water") return this.water(tick);
        if (kind === "combat_escape") return this.combatEscape(tick);
        return this.trapped(tick);
    }

    assessSituation(tick) {
        const hp = this.sim.getComponent("minecraft:health")?.currentValue ?? 20;
        const info = this.terrain.threatInfo(this.sim, this.bot.owner());
        const threats = info.list.map(e => ({
            typeId: e.typeId,
            location: e.location,
            distance: distance(e.location, this.sim.location),
            entity: e
        }));
        const hasShield = this.bag.find(s => s.typeId === "minecraft:shield") >= 0;
        const hasWater = this.bag.find(s => s.typeId === "minecraft:water_bucket") >= 0;
        const hasBlocks = this.bag.buildBlock() >= 0;
        const blockCount = this.countBlocks();
        const resources = { hasShield, hasWater, hasBlocks, blockCount, hasTotem: this.bag.find(s => s.typeId === "minecraft:totem_of_undying") >= 0, weaponTier: this.getWeaponTier(), armorValue: 0 };
        this.assessment = assess(hp, threats, resources, this.sim.location);
        this.lastReason = `Assessed: fear ${this.assessment.totalFear.toFixed(1)} threats ${threats.length} decision ${this.assessment.decision}`;
    }

    countBlocks() {
        let count = 0;
        for (let i = 0; i < this.bag.size; i++) {
            const s = this.bag.get(i);
            if (s && (s.typeId.includes("cobblestone") || s.typeId.includes("dirt") || s.typeId.includes("stone"))) count += s.amount;
        }
        return count;
    }

    getWeaponTier() {
        for (let i = 0; i < this.bag.size; i++) {
            const s = this.bag.get(i);
            if (!s) continue;
            if (s.typeId.includes("netherite")) return 5;
            if (s.typeId.includes("diamond")) return 4;
            if (s.typeId.includes("iron")) return 3;
            if (s.typeId.includes("stone")) return 2;
            if (s.typeId.includes("wooden")) return 1;
        }
        return 0;
    }

    /**
     * Combat escape for extreme situations: 16 skeletons, blaze, enderman
     */
    combatEscape(tick) {
        if (!this.assessment) this.assessSituation(tick);

        // Enderman special
        if (this.assessment?.hasEnderman) {
            return this.escapeEnderman(tick);
        }
        // Skeleton swarm
        if (this.assessment?.hasSkeletonSwarm) {
            return this.escapeSkeletonSwarm(tick);
        }
        // Blaze
        if (this.assessment?.hasBlaze) {
            return this.escapeBlaze(tick);
        }
        // General high fear
        if (this.assessment?.totalFear > 25) {
            return this.escapeBunker(tick);
        }
        // Ranged cover
        if (this.assessment?.rangedCount > 0) {
            return this.escapeRanged(tick);
        }

        return this.trapped(tick);
    }

    escapeEnderman(tick) {
        const p = floor(this.sim.location);
        const hasWater = this.bag.find(s => s.typeId === "minecraft:water_bucket") >= 0;
        const hasBlocks = this.bag.buildBlock() >= 0;

        // Phase 1: Place water if have it
        if (hasWater && tick - this.lastWaterPlace > 60) {
            const slot = this.bag.find(s => s.typeId === "minecraft:water_bucket");
            if (slot >= 0) {
                const selected = this.bag.select(slot);
                try {
                    this.sim.lookAtBlock(this.host.relative(center(p)));
                    if (this.sim.useItemInSlot(selected)) {
                        this.lastWaterPlace = tick;
                        this.lastReason = "Enderman escape: placed water";
                        return "running";
                    }
                } catch {}
            }
        }

        // Phase 2: Build low roof (2 high) - enderman is 3 tall
        if (hasBlocks && this.bunkerAttempts < 5) {
            const roof = { x: p.x, y: p.y + 2, z: p.z };
            if (this.terrain.empty(roof)) {
                // Need support
                const support = { x: p.x + 1, y: p.y + 1, z: p.z };
                if (this.terrain.empty(support)) {
                    const below = { x: p.x + 1, y: p.y, z: p.z };
                    if (this.terrain.solid(add(below, DOWN))) {
                        const res = this.builder ? this.builder.placeAt(below, add(below, DOWN), { sneak: true }) : this.hands.place(add(below, DOWN), Direction.Up, { sneak: true });
                        if (res === "placed") return "running";
                    }
                } else {
                    const res = this.builder ? this.builder.placeAt(roof, support, { sneak: true }) : this.hands.place(support, Direction.Up, { sneak: true });
                    if (res === "placed") {
                        this.bunkerAttempts++;
                        this.lastReason = "Enderman escape: built low roof (2-high)";
                        return "running";
                    }
                }
            } else {
                // Already have roof, stay under it
                this.lastReason = "Enderman escape: under low roof, safe";
                try { this.sim.stopMoving(); } catch {}
                return "running";
            }
        }

        // Phase 3: Retreat to water or safe spot
        const waterSpot = this.findWaterNearby();
        if (waterSpot) {
            this.lastReason = "Enderman escape: retreating to water";
            return this.walkTo(center(waterSpot));
        }

        // Fallback: pillar up? Enderman can teleport, so better to retreat far
        return this.retreatFar(tick);
    }

    escapeSkeletonSwarm(tick) {
        const p = floor(this.sim.location);
        const info = this.terrain.threatInfo(this.sim, this.bot.owner());

        // Find cover that blocks LOS from most skeletons
        const cover = this.findCoverFromRanged(info.list);
        if (cover) {
            this.coverAttempts++;
            this.lastReason = `Skeleton swarm: moving to cover (${this.coverAttempts})`;
            const r = this.bot.navTo(cover, tick, 1);
            if (r !== "failed") return "running";
        }

        // Build cover wall if no natural cover
        if (this.builder?.canBuild && this.coverAttempts < 6) {
            // Build 2-high wall towards average skeleton position
            let avgX = 0, avgZ = 0;
            let ranged = info.list.filter(e => RANGED.has(e.typeId) || e.typeId.includes("skeleton"));
            if (!ranged.length) ranged = info.list;
            for (const e of ranged) { avgX += e.location.x; avgZ += e.location.z; }
            if (ranged.length) { avgX /= ranged.length; avgZ /= ranged.length; }
            const dir = { x: Math.sign(avgX - p.x) || 1, z: Math.sign(avgZ - p.z) || 0 };
            const wall1 = add(p, dir);
            const wall2 = add(wall1, UP);

            if (this.terrain.empty(wall1) && this.terrain.solid(add(wall1, DOWN))) {
                const res = this.builder.placeAt(wall1, add(wall1, DOWN), { sneak: true });
                if (res === "placed") {
                    this.lastReason = "Skeleton swarm: built cover wall";
                    return "running";
                }
            }
            if (this.terrain.solid(wall1) && this.terrain.empty(wall2)) {
                const res = this.builder.placeAt(wall2, wall1, { sneak: true });
                if (res === "placed") {
                    this.lastReason = "Skeleton swarm: built wall layer 2";
                    return "running";
                }
            }
        }

        // If still no cover, retreat far with zigzag
        this.lastReason = "Skeleton swarm: no cover, zigzag retreat";
        return this.retreatZigzag(tick, info.list);
    }

    escapeBlaze(tick) {
        const p = floor(this.sim.location);
        const info = this.terrain.threatInfo(this.sim, this.bot.owner());
        const blazes = info.list.filter(e => e.typeId === "minecraft:blaze");

        // Blaze fireballs - need to strafe constantly and find cover
        const cover = this.findCoverFromRanged(blazes);
        if (cover) {
            this.lastReason = "Blaze escape: moving to cover from fireballs";
            return this.walkTo(cover);
        }

        // Build cover
        if (this.builder?.canBuild) {
            let avgX = 0, avgZ = 0;
            for (const e of blazes) { avgX += e.location.x; avgZ += e.location.z; }
            if (blazes.length) { avgX /= blazes.length; avgZ /= blazes.length; }
            const dir = { x: Math.sign(avgX - p.x) || 1, z: Math.sign(avgZ - p.z) || 0 };
            const wall = add(p, dir);
            if (this.terrain.empty(wall) && this.terrain.solid(add(wall, DOWN))) {
                const res = this.builder.placeAt(wall, add(wall, DOWN), { sneak: true });
                if (res === "placed") return "running";
            }
        }

        // Dodge and retreat
        return this.retreatZigzag(tick, blazes);
    }

    escapeBunker(tick) {
        // Build emergency bunker for any high fear situation
        const p = floor(this.sim.location);
        if (this.bunkerAttempts > 8) {
            return this.giveUp("Bunker build failed after 8 attempts");
        }

        // Build 3x3x2 bunker with roof
        const walls = [
            add(p, { x: 1, y: 0, z: 0 }), add(p, { x: -1, y: 0, z: 0 }),
            add(p, { x: 0, y: 0, z: 1 }), add(p, { x: 0, y: 0, z: -1 }),
            add(p, { x: 1, y: 1, z: 0 }), add(p, { x: -1, y: 1, z: 0 }),
            add(p, { x: 0, y: 1, z: 1 }), add(p, { x: 0, y: 1, z: -1 }),
        ];
        const roof = add(p, { x: 0, y: 2, z: 0 });

        for (const wall of walls) {
            if (this.terrain.empty(wall)) {
                const support = add(wall, DOWN);
                if (this.terrain.solid(support)) {
                    const res = this.builder ? this.builder.placeAt(wall, support, { sneak: true }) : this.hands.place(support, Direction.Up, { sneak: true });
                    if (res === "placed") {
                        this.bunkerAttempts++;
                        this.lastReason = `Bunker: built wall ${this.bunkerAttempts}`;
                        return "running";
                    }
                }
            }
        }

        if (this.terrain.empty(roof)) {
            const support = add(p, { x: 1, y: 1, z: 0 });
            if (this.terrain.solid(support) || this.terrain.solid(add(p, { x: 0, y: 1, z: 0 }))) {
                const res = this.builder ? this.builder.placeAt(roof, support, { sneak: true }) : this.hands.place(support, Direction.Up, { sneak: true });
                if (res === "placed") {
                    this.bunkerAttempts++;
                    this.lastReason = "Bunker: built roof, safe inside";
                    try { this.sim.stopMoving(); } catch {}
                    return "running";
                }
            }
        }

        // If bunker built, stay inside and heal
        if (this.bunkerAttempts >= 3) {
            this.lastReason = "In bunker, healing and waiting";
            try { this.sim.stopMoving(); } catch {}
            // Try to eat
            const food = this.bag.food(true);
            if (food >= 0) {
                const held = this.bag.select(food);
                try { this.sim.useItemInSlot(held); } catch {}
            }
            return "running";
        }

        return this.retreatFar(tick);
    }

    escapeRanged(tick) {
        const info = this.terrain.threatInfo(this.sim, this.bot.owner());
        const cover = this.findCoverFromRanged(info.list);
        if (cover) {
            this.lastReason = "Ranged escape: moving to cover";
            return this.walkTo(cover);
        }
        return this.retreatZigzag(tick, info.list);
    }

    findCoverFromRanged(threats) {
        const p = floor(this.sim.location);
        for (const dir of COMPASS) {
            for (const dist of [3, 5, 7, 10]) {
                const checkPos = { x: p.x + dir.x * dist, y: p.y, z: p.z + dir.z * dist };
                const ground = this.terrain.groundNear(checkPos.x, checkPos.z, checkPos.y, 3);
                if (!ground || this.terrain.dangerous(ground)) continue;
                let blocks = 0;
                for (const e of threats) {
                    if (!RANGED.has(e.typeId) && e.typeId !== "minecraft:blaze" && !e.typeId.includes("skeleton")) continue;
                    const threatHead = e.getHeadLocation ? e.getHeadLocation() : e.location;
                    const botHead = { x: ground.x + 0.5, y: ground.y + 1.62, z: ground.z + 0.5 };
                    if (!this.terrain.line(threatHead, botHead)) blocks++;
                }
                if (blocks > 0) return center(ground);
            }
        }
        return null;
    }

    findWaterNearby() {
        const p = floor(this.sim.location);
        for (let dx = -8; dx <= 8; dx++) {
            for (let dz = -8; dz <= 8; dz++) {
                for (let dy = -2; dy <= 2; dy++) {
                    const q = add(p, { x: dx, y: dy, z: dz });
                    if (this.terrain.waterAt(q)) return q;
                }
            }
        }
        return null;
    }

    retreatFar(tick) {
        const p = floor(this.sim.location);
        const threat = this.bot.dangerThreat();
        let dir;
        if (threat?.isValid) dir = away(p, floor(threat.location));
        else dir = this.escapeDirection();

        for (const n of [8, 12, 16]) {
            const q = this.terrain.groundNear(p.x + dir.x * n, p.z + dir.z * n, p.y, 5);
            if (q && !this.terrain.dangerous(q)) {
                this.lastReason = `Retreating far ${n} blocks`;
                return this.walkTo(center(q));
            }
        }
        // Try any direction
        for (const d of CARDINAL) {
            const q = this.terrain.groundNear(p.x + d.x * 8, p.z + d.z * 8, p.y, 4);
            if (q && !this.terrain.dangerous(q)) return this.walkTo(center(q));
        }
        return this.giveUp("No retreat path");
    }

    retreatZigzag(tick, threats) {
        const p = floor(this.sim.location);
        // Zigzag: move perpendicular to average threat direction
        let avgX = 0, avgZ = 0;
        for (const e of threats) { avgX += e.location.x; avgZ += e.location.z; }
        if (threats.length) { avgX /= threats.length; avgZ /= threats.length; }
        const awayDir = { x: p.x - avgX, z: p.z - avgZ };
        const len = Math.hypot(awayDir.x, awayDir.z) || 1;
        awayDir.x /= len; awayDir.z /= len;
        // Perpendicular
        const perp = { x: -awayDir.z, z: awayDir.x };
        // Alternate zigzag every 20 ticks
        const usePerp = (tick % 40) < 20;
        const dir = usePerp ? perp : { x: awayDir.x, z: awayDir.z };

        for (const n of [5, 8, 12]) {
            const q = this.terrain.groundNear(p.x + dir.x * n, p.z + dir.z * n, p.y, 4);
            if (q && !this.terrain.dangerous(q)) {
                this.lastReason = `Zigzag retreat ${usePerp ? "perp" : "away"}`;
                this.sim.isSprinting = true;
                return this.walkTo(center(q));
            }
        }
        return this.retreatFar(tick);
    }

    water(tick) {
        const sim = this.sim;
        if (this.riding) {
            const shore = this.terrain.shoreNear(sim.location, 48);
            if (!sim.isInWater || (shore && shore.distance <= 1.6)) {
                this.eject();
                this.lastReason = "Ashore; leaving boat.";
                return "running";
            }
            if (shore) {
                sim.moveToLocation(this.host.relative(center(shore.cell)), { faceTarget: true });
                this.lastReason = "Boating to shore.";
                return "running";
            }
            if (tick - this.boatSince > 200) {
                this.eject();
                this.boatTries = 1; // allow retry, not permanent fail
                this.lastReason = "Boat not moving; swimming.";
            }
            return "running";
        }
        if (!sim.isInWater) {
            if (this.swimming) {
                try { sim.stopSwimming(); } catch {}
                this.swimming = false;
            }
            this.reset();
            return "done";
        }
        this.nav.reset();
        sim.isSprinting = false;
        if (!this.swimming) {
            this.swimming = true;
            try { sim.swim(); } catch {}
        }
        if (this.terrain.headInWater(sim)) {
            if (this.drowning === undefined) this.drowning = tick;
            if (tick - this.drowning > 40) { // faster boat attempt when drowning
                const r = this.boat(tick);
                if (r) return r;
            }
            const p = sim.location;
            sim.jump();
            sim.moveToLocation(this.host.relative({ x: p.x, y: p.y + 1.6, z: p.z }));
            this.lastReason = "Surfacing to breathe - will make boat.";
            return "running";
        }
        this.drowning = undefined;
        // UNBREAKABLE WATER LOGIC: try boat first, then bridge, then swim
        const shore = this.terrain.shoreNear(sim.location, 48);
        if (!shore) {
            // No shore within 48 - try boat aggressively, then bridge with blocks, then swim to owner
            const r = this.boat(tick);
            if (r) return r;
            // If have blocks, try to bridge / pillar out of water
            if (this.bot.settings.bridge && this.bag.buildBlock() >= 0) {
                // Try to place block under to make land
                const p = floor(sim.location);
                const below = add(p, DOWN);
                if (this.terrain.waterAt(below) || this.terrain.waterAt(p)) {
                    // Try to pillar with blocks to create island
                    const pillarResult = this.pillar(tick);
                    if (pillarResult !== "failed") {
                        this.lastReason = "No shore, pillaring with blocks to create land";
                        return pillarResult;
                    }
                }
                // Try bridging towards owner or nearest land direction
                const owner = this.bot.owner();
                const dir = owner ? away(p, floor(owner.location)) : this.escapeDirection();
                // Actually towards owner
                const towardOwner = owner ? { x: Math.sign(owner.location.x - sim.location.x), y: 0, z: Math.sign(owner.location.z - sim.location.z) } : dir;
                const bridgeResult = this.bridge(towardOwner, tick);
                if (bridgeResult !== "failed") {
                    this.lastReason = "No shore, bridging with blocks towards target";
                    return bridgeResult;
                }
            }
            // Last resort: swim towards owner
            const owner = this.bot.owner();
            const toward = owner ? { x: owner.location.x - sim.location.x, y: 0, z: owner.location.z - sim.location.z } : { x: 0, y: 0, z: 1 };
            const len = Math.hypot(toward.x, toward.z) || 1;
            const p = sim.location;
            sim.moveToLocation(this.host.relative({ x: p.x + (toward.x/len) * 3, y: p.y + 0.4, z: p.z + (toward.z/len) * 3 }), { faceTarget: true });
            if (tick % 20 < 2) sim.jump();
            this.lastReason = "No shore within 48, swimming towards owner - will craft boat if possible";
            return "running";
        }
        // Shore found - try boat if far, else swim
        if (shore.distance > 8) {
            const r = this.boat(tick);
            if (r) {
                this.lastReason = `Far shore ${shore.distance.toFixed(0)} blocks, using boat`;
                return r;
            }
        }
        sim.moveToLocation(this.host.relative(center(shore.cell)), { faceTarget: true });
        if (tick % 20 < 2) sim.jump();
        this.lastReason = `Swimming to shore (${shore.distance.toFixed(0)} blocks) - boat fallback if needed`;
        return "running";
    }

    findBoat() {
        try { return this.sim.dimension.getEntities({ type: "minecraft:boat", location: this.sim.location, maxDistance: 8 })[0]; } catch { return undefined; }
    }

    mount(boat) {
        try { const rideable = boat.getComponent("minecraft:rideable"); if (rideable?.addRider?.(this.sim)) return true; } catch {}
        try { if (typeof this.sim.interactWithEntity === "function" && this.sim.interactWithEntity(boat)) return true; } catch {}
        try { return typeof this.sim.interact === "function" ? !!this.sim.interact() : false; } catch { return false; }
    }

    eject() {
        const boat = this.ridingEntity;
        this.riding = false;
        this.ridingEntity = undefined;
        try {
            const rideable = boat?.getComponent?.("minecraft:rideable");
            if (rideable?.ejectRider) rideable.ejectRider(this.sim);
            else if (rideable?.ejectRiders) rideable.ejectRiders();
        } catch {}
    }

    boat(tick) {
        const b = this.bot, sim = this.sim;
        if (!b.settings.boat) return undefined;
        // Allow infinite retries but with cooldown - unbreakable
        if (this.boatTries >= 5) {
            if (tick - this.boatSince < 200) return undefined;
            this.boatTries = 0; // reset after cooldown
        }
        const existing = this.findBoat();
        if (existing) {
            if (this.mount(existing)) {
                this.riding = true;
                this.ridingEntity = existing;
                this.boatSince = tick;
                this.boatTries = 0;
                this.lastReason = "Boarding boat to keep afloat.";
                return "running";
            }
            // Don't permanently fail, try again next tick
            return undefined;
        }
        let slot = this.bag.find((s) => s.typeId.endsWith("_boat"));
        if (slot < 0) {
            if (!b.settings.assistedCrafting) {
                // Try to craft anyway - unbreakable should try to make boat if has wood
                this.lastReason = "No boat, trying to craft one - need wood";
                try {
                    // Try any boat type
                    const boatTypes = ["minecraft:oak_boat","minecraft:birch_boat","minecraft:spruce_boat","minecraft:jungle_boat","minecraft:acacia_boat","minecraft:dark_oak_boat","minecraft:mangrove_boat","minecraft:cherry_boat"];
                    for (const bt of boatTypes) {
                        try { b.craft(bt, 1); slot = this.bag.find((s) => s.typeId.endsWith("_boat")); if (slot >=0) break; } catch {}
                    }
                    // If still no boat, try to craft planks from logs
                    if (slot < 0) {
                        const logs = b.bag.find((s) => s.typeId.endsWith("_log"));
                        if (logs >= 0) {
                            const logType = b.bag.get(logs).typeId;
                            const plankType = logType.replace("_log","_planks").replace("_wood","_planks");
                            try { b.craft(plankType, 4); } catch {}
                            // Try boat again
                            for (const bt of boatTypes) {
                                try { b.craft(bt, 1); slot = this.bag.find((s) => s.typeId.endsWith("_boat")); if (slot >=0) break; } catch {}
                            }
                        }
                    }
                } catch (e) {
                    this.lastReason = "Cannot make boat yet: " + String(e).slice(0, 80) + " - will try to get wood or swim";
                    // Don't give up, will try swimming
                    return undefined;
                }
            } else {
                try {
                    const boatTypes = ["minecraft:oak_boat","minecraft:birch_boat","minecraft:spruce_boat","minecraft:jungle_boat","minecraft:acacia_boat","minecraft:dark_oak_boat","minecraft:mangrove_boat","minecraft:cherry_boat","minecraft:bamboo_raft"];
                    for (const bt of boatTypes) {
                        try { b.craft(bt, 1); slot = this.bag.find((s) => s.typeId.endsWith("_boat")); if (slot >=0) break; } catch {}
                    }
                } catch (e) { this.lastReason = "Cannot make boat: " + String(e).slice(0, 80); }
            }
            slot = this.bag.find((s) => s.typeId.endsWith("_boat"));
            if (slot < 0) {
                // No boat, but don't permanently fail - allow swimming and retry later
                if (tick % 60 === 0) this.boatTries++;
                return undefined;
            }
        }
        this.boatTries++;
        this.boatSince = tick;
        const selected = this.bag.select(slot);
        const p = sim.location;
        sim.lookAtBlock(this.host.relative(center(floor(p))));
        try { sim.useItemInSlot(selected); this.lastReason = "Floating a boat - unbreakable water escape"; } catch { this.lastReason = "Engine rejected boat placement, will try again"; }
        return "running";
    }

    escapeDirection() {
        const p = floor(this.sim.location);
        const threat = this.bot.dangerThreat();
        if (threat?.isValid) return away(p, floor(threat.location));
        const target = this.nav.target ?? this.nav.lastGoal ?? this.bot.home() ?? this.bot.owner()?.location;
        if (target) {
            const dx = target.x - p.x, dz = target.z - p.z;
            if (Math.abs(dx) >= Math.abs(dz)) return { x: Math.sign(dx) || 1, y: 0, z: 0 };
            return { x: 0, y: 0, z: Math.sign(dz) || 1 };
        }
        return CARDINAL[0];
    }

    candidateDirs() {
        const pref = this.escapeDirection();
        const side = { x: -pref.z, y: 0, z: pref.x };
        const order = [pref, side, { x: -side.x, y: 0, z: -side.z }, { x: -pref.x, y: 0, z: -pref.z }];
        if (this.escapeDir) {
            const at = order.findIndex((d) => d.x === this.escapeDir.x && d.z === this.escapeDir.z);
            if (at > 0) { order.splice(at, 1); order.unshift(this.escapeDir); }
        }
        return order.filter((d) => !this.deadDirs.some((q) => q.x === d.x && q.z === d.z));
    }

    probe(dir, p) {
        const foot = add(p, dir), head = add(foot, UP), floorCell = add(foot, DOWN);
        if (this.terrain.solid(foot)) {
            if (this.terrain.empty(head) && this.terrain.empty(add(head, UP))) return { kind: "climb" };
            const footType = this.terrain.block(foot)?.typeId ?? "";
            const rule = diggable(footType);
            if (this.terrain.lavaNear(foot)) return { kind: "dead", why: "lava beside wall" };
            if (rule && (rule.tier === 0 || this.bag.tool("pickaxe", rule.tier))) return { kind: "tunnel" };
            if (!this.terrain.empty(head)) return { kind: "dead", why: rule ? `need ${rule.tool} tier ${rule.tier} to break ${footType}` : `${footType} unbreakable` };
            return { kind: "dead", why: "no headroom to climb" };
        }
        if (this.terrain.solid(head)) {
            const headType = this.terrain.block(head)?.typeId ?? "";
            const rule = diggable(headType);
            if (this.terrain.lavaNear(head)) return { kind: "dead", why: "lava beside low ceiling" };
            if (rule && (rule.tier === 0 || this.bag.tool("pickaxe", rule.tier))) return { kind: "tunnel" };
            return { kind: "dead", why: rule ? `need ${rule.tool} tier ${rule.tier} to break ${headType}` : `${headType} unbreakable` };
        }
        const floorBlock = this.terrain.block(floorCell);
        if (!floorBlock || floorBlock.isLiquid || !floorBlock.isSolid) {
            const isWater = floorBlock && floorBlock.isLiquid && /water/.test(floorBlock.typeId);
            const isLava = floorBlock && /lava/.test(floorBlock.typeId) || this.terrain.lavaNear(floorCell);
            // Allow bridging over water, but not lava
            if (this.bot.settings.bridge && this.bag.buildBlock() >= 0 && !isLava) {
                // If water, still allow bridge - we can place block in water or over it
                return { kind: "bridge" };
            }
            if (!isLava) {
                const drop = this.terrain.groundNear(foot.x, foot.z, foot.y - 1, 6);
                if (drop && !this.terrain.dangerous(drop) && !this.terrain.lavaNear(drop)) return { kind: "drop" };
                // Even if no ground, if we have blocks, try to bridge over water gap
                if (isWater && this.bot.settings.bridge && this.bag.buildBlock() >= 0) {
                    return { kind: "bridge" };
                }
            }
            return { kind: "dead", why: isLava ? "lava gap, cannot bridge" : "gap with nothing safe to bridge/drop" };
        }
        return { kind: "walk" };
    }

    trapped(tick) {
        const sim = this.sim;
        const p = floor(sim.location);

        // If high fear situation, delegate to combat escape
        if (this.assessment && this.assessment.totalFear > 20) {
            return this.combatEscape(tick);
        }

        if (this.terrain.dangerous(p) || this.terrain.dangerous(add(p, DOWN))) {
            const spot = COMPASS.map((d) => this.terrain.groundNear(p.x + d.x * 2, p.z + d.z * 2, p.y, 4))
                .filter((q) => q && !this.terrain.dangerous(q))
                .sort((a, b) => distance(a, sim.location) - distance(b, sim.location))[0];
            if (spot) {
                sim.isSprinting = true;
                this.lastReason = "Stepping off hazard.";
                return this.walkTo(center(spot));
            }
        }
        const preferred = this.escapeDirection();
        const goalward = (d) => d.x === preferred.x && d.z === preferred.z;
        const why = [];
        for (const dir of this.candidateDirs()) {
            const plan = this.probe(dir, p);
            if (plan.kind === "dead") {
                if (!this.deadDirs.some((d) => d.x === dir.x && d.z === dir.z)) this.deadDirs.push(dir);
                const committed = this.escapeDir && this.escapeDir.x === dir.x && this.escapeDir.z === dir.z;
                if (committed) this.escapeDir = undefined;
                if (goalward(dir)) why.unshift(plan.why); else why.push(plan.why);
                continue;
            }
            const committed = this.escapeDir && this.escapeDir.x === dir.x && this.escapeDir.z === dir.z;
            if (!committed && !goalward(dir) && (plan.kind === "walk" || plan.kind === "drop")) continue;
            this.escapeDir = dir;
            if (plan.kind === "tunnel") {
                const r = this.tunnel(dir, tick);
                if (r === "failed") this.escapeDir = undefined;
                return r;
            }
            if (plan.kind === "bridge") return this.bridge(dir, tick);
            if (plan.kind === "climb") {
                if (sim.isOnGround) sim.jump();
                this.lastReason = "Climbing out.";
                return this.walkTo(center(add(add(p, dir), UP)));
            }
            if (plan.kind === "drop") {
                const drop = this.terrain.groundNear(p.x + dir.x, p.z + dir.z, p.y - 1, 6);
                if (!drop || this.terrain.dangerous(drop)) continue;
                sim.isSprinting = true;
                this.lastReason = "Dropping to lower ground.";
                return this.walkTo(center(drop));
            }
            const walk = this.terrain.groundNear(p.x + dir.x, p.z + dir.z, p.y, 3);
            if (!walk || this.terrain.dangerous(walk)) continue;
            sim.isSprinting = true;
            this.lastReason = "Walking out.";
            return this.walkTo(center(walk));
        }
        // UNBREAKABLE: if have blocks, pillar up to get out
        if (this.bot.settings.bridge && this.bag.buildBlock() >= 0) {
            const pillarRes = this.pillar(tick);
            if (pillarRes !== "failed") return pillarRes;
        }
        // UNBREAKABLE: if in or near water, try boat
        if (this.sim.isInWater || this.terrain.waterNear(p) || this.terrain.waterNear(add(p, DOWN))) {
            const boatRes = this.boat(tick);
            if (boatRes) {
                this.lastReason = "Trapped near water, trying boat - unbreakable";
                return boatRes;
            }
            // Try swimming to shore
            const shore = this.terrain.shoreNear(this.sim.location, 48);
            if (shore) {
                this.lastReason = `Trapped in water, swimming to shore ${shore.distance.toFixed(0)} blocks`;
                return this.walkTo(center(shore.cell));
            }
        }
        // UNBREAKABLE: no blocks? Try to mine nearby dirt/sand/logs for blocks
        if (this.bag.buildBlock() < 0) {
            try {
                const nearBlocks = this.terrain.scanOres(this.sim.location, 5, (type) => {
                    return type === "minecraft:dirt" || type === "minecraft:sand" || type === "minecraft:gravel" || type === "minecraft:oak_log" || type === "minecraft:birch_log" || type.endsWith("_log") || type === "minecraft:coarse_dirt";
                }, 200);
                if (nearBlocks.length > 0) {
                    const target = nearBlocks[0];
                    this.lastReason = `No blocks to escape, mining ${this.terrain.block(target)?.typeId} at ${target.x},${target.y},${target.z} for blocks`;
                    // Try to dig it
                    const bot = this.bot;
                    const digRes = bot.digCell ? bot.digCell(target, tick) : undefined;
                    if (digRes === "digging") return "running";
                    // Or navigate to it
                    const navRes = this.bot.nav.go(center(target), tick);
                    if (navRes !== "failed") return "running";
                }
            } catch {}
        }
        // Last resort: try any direction with drop even if dangerous? No, give up but with better message
        // Instead of giving up immediately, try to break obstruction in any direction
        for (const dir of this.candidateDirs()) {
            const foot = add(p, dir);
            const b = this.terrain.block(foot);
            if (b && !b.isAir && !b.isLiquid) {
                const rule = this.terrain.block(foot)?.typeId ? { tier: 0 } : null;
                try {
                    const digRes = this.bot.digCell ? this.bot.digCell(foot, tick) : undefined;
                    if (digRes === "digging") {
                        this.lastReason = `Last resort: breaking ${b.typeId} to escape`;
                        return "running";
                    }
                } catch {}
            }
        }
        return this.giveUp(why.length ? "No way out: " + why[0] + ". Trying boat/bridge/mine failed." : "No escape route and no blocks; need dirt/cobble to bridge/pillar - tried mining but failed.");
    }

    tunnel(dir, tick) {
        const sim = this.sim;
        const p = floor(sim.location);
        const foot = add(p, dir), head = add(foot, UP);
        const cells = [foot, head].filter((c) => this.terrain.solid(c));
        if (!cells.length) {
            const walk = this.terrain.groundNear(foot.x, foot.z, p.y, 4);
            if (walk && !this.terrain.dangerous(walk)) {
                sim.moveToLocation(this.host.relative(center(walk)), { faceTarget: true });
                this.lastReason = "Tunnelling forward.";
                return "running";
            }
            return this.giveUp("Tunnel opened but no walkable cell ahead.");
        }
        if (tick - this.since > 500) return this.giveUp("Tunnel escape timed out.");
        const cell = cells[0], type = this.terrain.block(cell)?.typeId;
        if (this.terrain.lavaNear(cell)) return this.giveUp("Refusing to tunnel beside lava.");
        const rule = diggable(type);
        if (!rule) return this.giveUp(`Cannot break ${type} to escape.`);
        if (rule.tier > 0) { if (!this.bag.tool("pickaxe", rule.tier)) return this.giveUp(`Need ${rule.tool} tier ${rule.tier} to tunnel.`); }
        else if (rule.tool === "axe") this.bag.tool("axe");
        else if (rule.tool === "shovel") this.bag.tool("shovel");
        if (this.breaking !== key(cell)) {
            sim.lookAtBlock(this.host.relative(center(cell)));
            if (!sim.breakBlock(this.host.relative(center(cell)))) return this.giveUp(`${type} out of reach to tunnel.`);
            this.breaking = key(cell);
        }
        this.lastReason = "Tunnelling through " + type;
        return "running";
    }

    bridge(dir, tick) {
        const sim = this.sim;
        if (this.crossing) {
            const walk = this.crossing;
            if (!this.terrain.solid(add(walk, DOWN))) { this.crossing = undefined; }
            else {
                sim.isSprinting = false;
                sim.moveToLocation(this.host.relative(center(walk)), { faceTarget: true });
                const flat = Math.hypot(sim.location.x - (walk.x + 0.5), sim.location.z - (walk.z + 0.5));
                if (flat < 0.6 && Math.abs(sim.location.y - walk.y) < 1.1) {
                    this.crossing = undefined;
                    this.lastReason = "Crossed bridge.";
                    const n = this.escapeDir ?? this.escapeDirection();
                    const q = floor(sim.location);
                    const t = add(add(q, DOWN), n);
                    const tb = this.terrain.block(t);
                    const gap = !tb || tb.isAir || tb.isLiquid;
                    if (gap && !this.terrain.solid(t) && !this.lavaAhead(t)) return "running";
                    return "done";
                }
                return "running";
            }
        }
        const p = floor(sim.location);
        const anchor = add(p, DOWN), target = add(anchor, dir), walk = add(target, UP);
        if (this.lavaAhead(target)) return this.giveUp("Refusing to bridge over lava/fire.");
        if (tick - this.since > 600) return this.giveUp("Bridge escape timed out.");
        if (this.terrain.solid(target)) {
            sim.isSprinting = false;
            sim.moveToLocation(this.host.relative(center(walk)), { faceTarget: true });
            this.crossing = walk;
            this.lastReason = "Stepping across.";
            return "running";
        }
        const tb = this.terrain.block(target);
        if (tb && !tb.isAir && !tb.isLiquid && !tb.isSolid) {
            sim.lookAtBlock(this.host.relative(center(target)));
            sim.breakBlock(this.host.relative(center(target)));
            this.lastReason = "Clearing bridge line.";
            return "running";
        }
        const f = dirFace(dir);
        if (!f) return this.giveUp("Invalid bridge direction.");
        const placed = this.hands.place(anchor, f, { sneak: true });
        if (placed === "no-block") return this.giveUp("No blocks to bridge.");
        if (placed === "rejected") return this.giveUp("Bridge placement rejected.");
        this.crossing = walk;
        this.lastReason = "Bridging gap.";
        return "running";
    }

    lavaAhead(cell) {
        const b = this.terrain.block(cell);
        if (b && !b.isAir && !b.isLiquid && HAZARDS.has(b.typeId)) return true;
        return this.terrain.lavaNear(cell);
    }

    pillar(tick) {
        const sim = this.sim;
        const p = floor(sim.location);
        if (!this.pillarStart) this.pillarStart = p.y;
        const exit = COMPASS.map((d) => this.terrain.groundNear(p.x + d.x * 2, p.z + d.z * 2, p.y, 3)).find((q) => q && Math.abs(q.y - p.y) <= 1 && !this.terrain.dangerous(q));
        if (exit && sim.isOnGround && p.y > this.pillarStart + 1) {
            this.reset();
            this.lastReason = "Pillar reached open ground.";
            return "done";
        }
        if (tick - this.since > 500) return this.giveUp("Pillar escape timed out.");
        if (!this.hands.canBuild) return this.giveUp("No blocks to pillar.");
        sim.isSneaking = true;
        if (sim.isOnGround) {
            this.jumpFrom = p.y;
            this.pillarCol = { x: p.x, z: p.z };
            sim.jump();
            return "running";
        }
        if (this.jumpFrom !== undefined && this.pillarCol && p.y > this.jumpFrom) {
            const anchor = { x: this.pillarCol.x, y: this.jumpFrom - 1, z: this.pillarCol.z };
            const r = this.hands.place(anchor, Direction.Up, { sneak: true });
            if (r === "no-block") return this.giveUp("No blocks to pillar.");
            if (r === "placed" || this.terrain.solid({ ...this.pillarCol, y: this.jumpFrom })) this.lastReason = "Pillaring up out of pit.";
        }
        return "running";
    }
}
