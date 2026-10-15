import { assess, bunkerPlan, chooseCoverDirection, chooseTactic, combatThreatScore, dodgePattern, endermanSafeLook, findCoverPosition, getMobStat, shouldRetreat, shouldUseShield, shouldUseWater, strafePattern } from "../core/combat.js";
import { CARDINAL, COMPASS, DOWN, UP, add, away, center, distance, floor } from "../core/math.js";
import { EXPLOSIVE, HOSTILES, RANGED } from "../core/world.js";
/**
 * World-class Combat module - handles any situation: 16 skeletons, blaze, enderman, warden, etc.
 * Tactics: cover, bunker, low-roof, dodge, pillar, water, shield, retreat, group kiting.
 */





export class Combat {
    constructor(bot) {
        this.bot = bot;
        this.sim = bot.sim;
        this.bag = bot.bag;
        this.terrain = bot.terrain;
        this.nav = bot.nav;
        this.host = bot.host;
        this.builder = bot.builder;
        this.lastAttack = 0;
        this.lastCrit = 0;
        this.critArmed = false;
        this.lastStrafe = 0;
        this.target = undefined;
        this.combo = 0;
        this.kiteSince = 0;
        this.coverPos = undefined;
        this.bunkerBuilt = false;
        this.bunkerPos = undefined;
        this.lastDodge = 0;
        this.shieldEquipped = false;
        this.waterPlaced = 0;
        this.tactic = "fight";
        this.assessment = undefined;
    }

    reset() {
        this.target = undefined;
        this.combo = 0;
        this.kiteSince = 0;
        this.coverPos = undefined;
        this.bunkerBuilt = false;
        this.bunkerPos = undefined;
        this.tactic = "fight";
        this.assessment = undefined;
        this.shieldEquipped = false;
    }

    /**
     * Evaluate current threats with world-class assessment.
     */
    evaluate(tick) {
        const hp = this.sim.getComponent("minecraft:health")?.currentValue ?? 20;
        const armor = this.bot.equipment ? this.estimateArmor() : 0;
        const info = this.terrain.threatInfo(this.sim, this.bot.owner());
        const hasWeapon = this.bag.weapon() >= 0;
        const hasShield = this.bag.find(s => s.typeId === "minecraft:shield") >= 0;
        const hasWater = this.bag.find(s => s.typeId === "minecraft:water_bucket") >= 0 || this.bag.find(s => s.typeId === "minecraft:bucket") >= 0;
        const hasBlocks = this.bag.buildBlock() >= 0;
        const blockCount = this.countBlocks();
        const hasTotem = this.bag.find(s => s.typeId === "minecraft:totem_of_undying") >= 0;
        const weaponTier = this.getWeaponTier();

        const threats = info.list.map(e => ({
            typeId: e.typeId,
            location: e.location,
            distance: distance(e.location, this.sim.location),
            entity: e
        }));

        const resources = { hasShield, hasWater, hasBlocks, blockCount, hasTotem, hasFood: this.bag.hasFood(), weaponTier, armorValue: armor };
        const assessment = assess(hp, threats, resources, this.sim.location);
        this.assessment = assessment;

        // Special cases
        const creeper = threats.find(t => EXPLOSIVE.has(t.typeId) && t.distance < 5);
        if (creeper) {
            return { target: creeper.entity, tactic: "retreat", shouldRetreat: true, info, assessment, reason: "creeper near" };
        }

        const warden = threats.find(t => getMobStat(t.typeId).noFight);
        if (warden) {
            return { target: warden.entity, tactic: "flee", shouldRetreat: true, info, assessment, reason: "boss/warden - flee" };
        }

        if (shouldRetreat(hp, assessment.totalFear, info.count, hasWeapon, armor, hasShield, hasWater, threats)) {
            return { target: info.nearest, tactic: assessment.decision, shouldRetreat: true, info, assessment, reason: `fear ${assessment.totalFear.toFixed(1)} hp ${hp} count ${info.count}` };
        }

        // Pick best target based on priority and distance
        let best = info.nearest;
        if (info.list.length > 1) {
            const sorted = [...threats].sort((a, b) => {
                const sa = getMobStat(a.typeId).priority;
                const sb = getMobStat(b.typeId).priority;
                // For skeleton swarm, prioritize closest
                if (assessment.hasSkeletonSwarm) {
                    return a.distance - b.distance;
                }
                if (sa !== sb) return sb - sa;
                return a.distance - b.distance;
            });
            best = sorted[0].entity;
        }

        if (!best) return { target: undefined, tactic: "none", shouldRetreat: false, info, assessment };

        const tactic = chooseTactic(best.typeId, assessment);
        return { target: best, tactic, shouldRetreat: false, info, assessment };
    }

    estimateArmor() {
        try {
            const eq = this.sim.getComponent("minecraft:equippable");
            if (!eq) return 0;
            let val = 0;
            for (const slot of ["Head", "Chest", "Legs", "Feet"]) {
                const item = eq.getEquipment(slot);
                if (!item) continue;
                if (item.typeId.includes("netherite")) val += 3;
                else if (item.typeId.includes("diamond")) val += 2.5;
                else if (item.typeId.includes("iron")) val += 2;
                else if (item.typeId.includes("chainmail")) val += 1;
                else if (item.typeId.includes("leather")) val += 0.5;
            }
            return val;
        } catch { return 0; }
    }

    countBlocks() {
        let count = 0;
        for (let i = 0; i < this.bag.size; i++) {
            const s = this.bag.get(i);
            if (s && (s.typeId.includes("cobblestone") || s.typeId.includes("dirt") || s.typeId.includes("stone") || s.typeId.includes("planks"))) {
                count += s.amount;
            }
        }
        return count;
    }

    getWeaponTier() {
        for (let i = 0; i < this.bag.size; i++) {
            const s = this.bag.get(i);
            if (!s) continue;
            if (s.typeId.includes("netherite_sword") || s.typeId.includes("netherite_axe")) return 5;
            if (s.typeId.includes("diamond_sword") || s.typeId.includes("diamond_axe")) return 4;
            if (s.typeId.includes("iron_sword") || s.typeId.includes("iron_axe")) return 3;
            if (s.typeId.includes("stone_sword") || s.typeId.includes("stone_axe")) return 2;
            if (s.typeId.includes("wooden_sword")) return 1;
        }
        return 0;
    }

    /**
     * World-class combat tick - handles any mob.
     */
    tick(target, tick, info) {
        if (!target?.isValid) {
            this.nav.reset();
            return false;
        }

        const assessment = this.assessment;
        const d = distance(this.sim.location, target.location);
        const stat = getMobStat(target.typeId);

        // Handle special tactics first
        if (this.tactic === "emergency_bunker" || assessment?.decision === "emergency_bunker") {
            if (this.buildEmergencyBunker(tick)) return true;
        }
        if (this.tactic === "low_roof_bunker" || assessment?.decision === "low_roof_bunker" || target.typeId === "minecraft:enderman") {
            if (this.handleEnderman(target, tick, info)) return true;
        }
        if (this.tactic === "cover_build" || assessment?.decision === "cover_build" || assessment?.hasSkeletonSwarm) {
            if (this.handleSkeletonSwarm(target, tick, info)) return true;
        }
        if (this.tactic === "bunker" || assessment?.decision === "bunker") {
            if (this.buildEmergencyBunker(tick)) return true;
        }

        // Explosive
        if (EXPLOSIVE.has(target.typeId) && d < 5) {
            this.retreatFrom(target, tick, 10);
            return true;
        }

        // Blaze handling
        if (target.typeId === "minecraft:blaze") {
            return this.handleBlaze(target, tick, info);
        }

        // Enderman handling
        if (target.typeId === "minecraft:enderman") {
            return this.handleEnderman(target, tick, info);
        }

        // Ranged swarm handling
        if (assessment?.rangedCount >= 3) {
            return this.handleRangedSwarm(target, tick, info);
        }

        // Standard ranged
        if (RANGED.has(target.typeId) && d > 3.5) {
            // Use cover if available, else rush
            if (assessment?.totalFear > 15) {
                const cover = this.findCover(tick, info);
                if (cover) {
                    this.nav.urgent = true;
                    this.bot.navTo(cover, tick, 1);
                    return true;
                }
            }
            this.nav.urgent = true;
            this.nav.avoid = [];
            const r = this.bot.navTo(target.location, tick, 2.5);
            if (r === "failed") this.retreatFrom(target, tick, 6);
            return true;
        }

        // Melee with low hp
        const hp = this.sim.getComponent("minecraft:health")?.currentValue ?? 20;
        if (hp <= 10 && d < 2.5 && stat.damage >= 6) {
            this.kite(target, tick);
            return true;
        }

        if (d > 2.8) {
            this.nav.urgent = true;
            this.bot.navTo(target.location, tick, 2.2);
            return true;
        }

        // In melee range
        this.nav.urgent = false;
        this.nav.reset();
        if (!this.terrain.line(this.sim.getHeadLocation(), target.getHeadLocation())) {
            // No LOS - need to reposition
            this.strafe(tick, true);
            return true;
        }
        if (tick - this.lastAttack < 10) {
            // Dodge while waiting for attack cooldown
            if (stat.strafe && tick - this.lastDodge > 12) {
                this.dodge(tick, target);
            }
            return true;
        }

        // Crit logic
        if (this.critArmed) {
            if (!this.sim.isOnGround) {
                this.critArmed = false;
                this.attack(target, tick);
                return true;
            }
            this.critArmed = false;
        } else if (this.sim.isOnGround && tick - this.lastCrit > 25) {
            this.lastCrit = tick;
            this.critArmed = true;
            try { this.sim.jump(); } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }
            return true;
        }

        this.attack(target, tick);
        return true;
    }

    handleSkeletonSwarm(target, tick, info) {
        const hp = this.sim.getComponent("minecraft:health")?.currentValue ?? 20;
        // If low hp, build cover first
        if (hp <= 12 || this.assessment?.totalFear > 20) {
            if (!this.bunkerBuilt && this.builder?.canBuild) {
                if (this.buildWallCover(tick, info)) return true;
            }
            // Find cover
            const cover = this.findCover(tick, info);
            if (cover) {
                this.reason = `Skeleton swarm: moving to cover`;
                this.bot.navTo(cover, tick, 1);
                return true;
            }
        }

        // For skeleton swarm, fight one by one, using cover between kills
        const d = distance(this.sim.location, target.location);
        if (d > 3.5) {
            // Zigzag approach to dodge arrows
            if (tick % 16 < 8) {
                this.strafe(tick, true);
            }
            this.nav.urgent = true;
            this.bot.navTo(target.location, tick, 2.5);
            return true;
        }

        // In range, attack with strafing
        this.nav.reset();
        if (tick - this.lastAttack < 10) {
            this.dodge(tick, target);
            return true;
        }
        this.attack(target, tick);
        return true;
    }

    handleBlaze(target, tick, info) {
        const d = distance(this.sim.location, target.location);
        // Blaze shoots fireballs - need to strafe constantly
        if (tick - this.lastDodge > 6) {
            this.dodge(tick, target);
        }

        // If too far, rush
        if (d > 4) {
            this.nav.urgent = true;
            // Zigzag to dodge fireballs
            if (tick % 10 < 5) this.strafe(tick, false);
            this.bot.navTo(target.location, tick, 3);
            return true;
        }

        // In melee range, attack and strafe to avoid fire
        this.nav.reset();
        if (tick - this.lastAttack < 10) {
            this.strafe(tick, true);
            return true;
        }

        // Check if on fire - need water or retreat
        try {
            if (this.sim.isOnFire) {
                const hasWater = this.bag.find(s => s.typeId === "minecraft:water_bucket") >= 0;
                if (hasWater && tick - this.waterPlaced > 100) {
                    this.placeWater(tick);
                    return true;
                }
                // Retreat to water or safe spot
                this.retreatFrom(target, tick, 8);
                return true;
            }
        } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }

        this.attack(target, tick);
        return true;
    }

    handleEnderman(target, tick, info) {
        const d = distance(this.sim.location, target.location);
        const hasWater = this.bag.find(s => s.typeId === "minecraft:water_bucket") >= 0;
        const hasBlocks = this.builder?.canBuild;

        // If enderman is angry and close, need low roof bunker or water
        if (d < 8) {
            // Try water first
            if (hasWater && tick - this.waterPlaced > 80) {
                if (this.placeWater(tick)) {
                    this.reason = "Enderman: placing water to repel";
                    return true;
                }
            }
            // Build low roof shelter (2 high)
            if (hasBlocks && !this.bunkerBuilt) {
                if (this.buildLowRoofBunker(tick)) return true;
            }
            // If we have bunker, stay inside and attack legs
            if (this.bunkerBuilt && this.bunkerPos) {
                const bunkerDist = distance(this.sim.location, this.bunkerPos);
                if (bunkerDist > 2) {
                    this.bot.navTo(this.bunkerPos, tick, 1);
                    return true;
                }
                // Inside bunker, attack legs
                if (d < 4 && tick - this.lastAttack >= 10) {
                    this.attackEndermanLegs(target, tick);
                    return true;
                }
                return true;
            }
        }

        // If not in immediate danger, fight normally but look at legs
        if (d > 3.5) {
            this.nav.urgent = true;
            this.bot.navTo(target.location, tick, 2.5);
            return true;
        }

        this.nav.reset();
        if (tick - this.lastAttack < 10) {
            this.strafe(tick, false);
            return true;
        }

        this.attackEndermanLegs(target, tick);
        return true;
    }

    handleRangedSwarm(target, tick, info) {
        // Find cover, then peek and attack
        if (info.count >= 3) {
            const cover = this.findCover(tick, info);
            if (cover && distance(this.sim.location, cover) > 2) {
                this.bot.navTo(cover, tick, 1);
                return true;
            }
        }
        return this.handleSkeletonSwarm(target, tick, info);
    }

    buildWallCover(tick, info) {
        if (!this.builder?.canBuild) return false;
        const p = floor(this.sim.location);
        // Find direction of most threats
        let avgX = 0, avgZ = 0;
        for (const e of info.list) { avgX += e.location.x; avgZ += e.location.z; }
        if (info.list.length) { avgX /= info.list.length; avgZ /= info.list.length; }
        const dir = { x: Math.sign(avgX - p.x) || 1, z: Math.sign(avgZ - p.z) || 0 };
        // Build wall 2 high in that direction
        const wallPos = add(p, dir);
        const wallPosUp = add(wallPos, UP);
        const anchor = add(p, DOWN);

        // Try to place at wallPos using anchor as support? Need adjacent support
        // Simplified: place wall at wallPos using p as support if possible
        // Actually need to place at wallPos: anchor is p, face is dir
        try {
            const res = this.builder.placeAt(wallPos, p, { sneak: true });
            if (res === "placed") {
                this.bunkerBuilt = true;
                this.bunkerPos = { ...p };
                return true;
            }
            // Try second layer
            const res2 = this.builder.placeAt(wallPosUp, wallPos, { sneak: true });
            if (res2 === "placed") return true;
        } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }
        return false;
    }

    buildEmergencyBunker(tick) {
        if (!this.builder?.canBuild) return false;
        const p = floor(this.sim.location);
        if (this.bunkerBuilt && this.bunkerPos && distance(this.sim.location, this.bunkerPos) < 3) {
            // Already in bunker, heal
            this.bot.reason = "In emergency bunker, healing";
            try { this.sim.stopMoving(); } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }
            // Eat if needed
            const hunger = this.sim.getComponent("minecraft:player.hunger")?.currentValue ?? 20;
            if (hunger <= 16) {
                const food = this.bag.food(true);
                if (food >= 0) {
                    const held = this.bag.select(food);
                    try { this.sim.useItemInSlot(held); } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }
                }
            }
            return true;
        }

        // Build 3x3 bunker with roof
        // For simplicity, build walls around current pos
        const walls = [
            add(p, { x: 1, y: 0, z: 0 }), add(p, { x: -1, y: 0, z: 0 }),
            add(p, { x: 0, y: 0, z: 1 }), add(p, { x: 0, y: 0, z: -1 }),
            add(p, { x: 1, y: 1, z: 0 }), add(p, { x: -1, y: 1, z: 0 }),
            add(p, { x: 0, y: 1, z: 1 }), add(p, { x: 0, y: 1, z: -1 }),
        ];
        const roof = add(p, { x: 0, y: 2, z: 0 });

        for (const wall of walls) {
            if (this.terrain.empty(wall)) {
                // Find support for wall
                const support = add(wall, DOWN);
                if (this.terrain.solid(support)) {
                    const res = this.builder.placeAt(wall, support, { sneak: true });
                    if (res === "placed") {
                        this.bunkerBuilt = true;
                        this.bunkerPos = { ...p };
                        return true;
                    }
                }
            }
        }
        // Try roof
        if (this.terrain.empty(roof)) {
            const support = add(p, { x: 1, y: 1, z: 0 });
            if (this.terrain.solid(support) || this.terrain.solid(add(p, { x: 0, y: 1, z: 0 }))) {
                const res = this.builder.placeAt(roof, p, { sneak: true });
                if (res === "placed") {
                    this.bunkerBuilt = true;
                    this.bunkerPos = { ...p };
                    return true;
                }
            }
        }

        return false;
    }

    buildLowRoofBunker(tick) {
        if (!this.builder?.canBuild) return false;
        const p = floor(this.sim.location);
        // Build 2-high shelter: roof at y+2
        const roof = { x: p.x, y: p.y + 2, z: p.z };
        if (this.terrain.empty(roof)) {
            // Need support at y+1
            const support = { x: p.x + 1, y: p.y + 1, z: p.z };
            if (!this.terrain.solid(support)) {
                // Build support first
                const supportBelow = { x: p.x + 1, y: p.y, z: p.z };
                if (this.terrain.solid(add(supportBelow, DOWN))) {
                    this.builder.placeAt(supportBelow, add(supportBelow, DOWN), { sneak: true });
                    return true;
                }
            }
            const res = this.builder.placeAt(roof, support, { sneak: true });
            if (res === "placed") {
                this.bunkerBuilt = true;
                this.bunkerPos = { ...p };
                this.bot.record("built low roof for enderman");
                return true;
            }
        }
        // Build walls for low roof
        return this.buildEmergencyBunker(tick);
    }

    findCover(tick, info) {
        const p = floor(this.sim.location);
        // Look for existing cover: blocks that block LOS
        for (const dir of COMPASS) {
            for (const dist of [3, 5, 7, 10]) {
                const checkPos = { x: p.x + dir.x * dist, y: p.y, z: p.z + dir.z * dist };
                const ground = this.terrain.groundNear(checkPos.x, checkPos.z, checkPos.y, 3);
                if (!ground || this.terrain.dangerous(ground)) continue;
                // Does this position have cover from threats?
                let coverScore = 0;
                for (const e of info.list) {
                    if (!RANGED.has(e.typeId) && e.typeId !== "minecraft:blaze" && e.typeId !== "minecraft:ghast") continue;
                    // Check if line from threat to checkPos is blocked
                    const threatHead = e.getHeadLocation ? e.getHeadLocation() : e.location;
                    const botHead = { x: checkPos.x + 0.5, y: checkPos.y + 1.62, z: checkPos.z + 0.5 };
                    if (!this.terrain.line(threatHead, botHead)) coverScore++;
                }
                if (coverScore > 0) return center(ground);
            }
        }
        return null;
    }

    placeWater(tick) {
        const slot = this.bag.find(s => s.typeId === "minecraft:water_bucket");
        if (slot < 0) return false;
        const selected = this.bag.select(slot);
        try {
            this.sim.lookAtBlock(this.host.relative(center(floor(this.sim.location))));
            const ok = this.sim.useItemInSlot(selected);
            if (ok) {
                this.waterPlaced = tick;
                return true;
            }
        } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }
        return false;
    }

    attack(target, tick) {
        this.bag.weapon();
        // For enderman, don't look at eyes
        if (target.typeId === "minecraft:enderman") {
            this.attackEndermanLegs(target, tick);
            return;
        }
        try { this.sim.lookAtEntity(target); } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }
        try { this.sim.attackEntity(target); } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }
        this.lastAttack = tick;
        this.combo++;
        this.strafe(tick, false);
    }

    attackEndermanLegs(target, tick) {
        this.bag.weapon();
        try {
            const legs = endermanSafeLook(target.location);
            this.sim.lookAtLocation(legs);
        } catch {
            try { this.sim.lookAtEntity(target); } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }
        }
        try { this.sim.attackEntity(target); } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }
        this.lastAttack = tick;
        this.combo++;
        // Don't strafe too much for enderman - it teleports
        if (tick % 20 === 0) this.strafe(tick, false);
    }

    strafe(tick, force = false) {
        if (!force && tick - this.lastStrafe < 8) return;
        const p = floor(this.sim.location);
        const target = this.target?.location ?? this.bot.threat?.location;
        const side = target ? Math.sign(p.z - floor(target).z) || 1 : 1;
        const dirs = [
            { x: side, y: 0, z: 0 },
            { x: -side, y: 0, z: 0 },
            { x: 0, y: 0, z: side },
            { x: 0, y: 0, z: -side },
        ];
        for (const d of dirs) {
            const q = add(p, d);
            if (this.terrain.safe(q)) {
                this.lastStrafe = tick;
                try { this.sim.moveToLocation(this.host.relative(center(q)), { faceTarget: true }); } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }
                return;
            }
        }
    }

    dodge(tick, target) {
        this.lastDodge = tick;
        const pattern = dodgePattern(tick, target.typeId, this.sim.location, target.location);
        if (!pattern) {
            this.strafe(tick, true);
            return;
        }
        const p = floor(this.sim.location);
        const dodgePos = { x: p.x + Math.sign(pattern.x) * 2, y: p.y, z: p.z + Math.sign(pattern.z) * 2 };
        const ground = this.terrain.groundNear(dodgePos.x, dodgePos.z, dodgePos.y, 2);
        if (ground && !this.terrain.dangerous(ground)) {
            try { this.sim.moveToLocation(this.host.relative(center(ground)), { faceTarget: true }); } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }
            this.lastStrafe = tick;
        } else {
            this.strafe(tick, true);
        }
    }

    kite(target, tick) {
        const p = floor(this.sim.location);
        const awayDir = away(p, floor(target.location));
        const spot = this.terrain.groundNear(p.x + awayDir.x * 4, p.z + awayDir.z * 4, p.y, 3);
        if (spot && !this.terrain.dangerous(spot)) {
            this.nav.urgent = true;
            this.bot.navTo(center(spot), tick, 1);
        }
    }

    retreatFrom(target, tick, dist = 8) {
        const p = floor(this.sim.location);
        const dir = away(p, floor(target.location));
        const candidates = [];
        for (let n = 4; n <= dist; n += 2) {
            const q = this.terrain.groundNear(p.x + dir.x * n, p.z + dir.z * n, p.y, 4);
            if (q && !this.terrain.dangerous(q)) candidates.push(q);
        }
        // Also try perpendicular for dodging
        const perp = { x: -dir.z, z: dir.x };
        for (let n = 3; n <= 6; n += 2) {
            const q1 = this.terrain.groundNear(p.x + perp.x * n, p.z + perp.z * n, p.y, 3);
            const q2 = this.terrain.groundNear(p.x - perp.x * n, p.z - perp.z * n, p.y, 3);
            if (q1 && !this.terrain.dangerous(q1)) candidates.push(q1);
            if (q2 && !this.terrain.dangerous(q2)) candidates.push(q2);
        }
        if (candidates.length) {
            // Sort by distance from threats
            candidates.sort((a, b) => distance(b, target.location) - distance(a, target.location));
            this.nav.urgent = true;
            this.bot.navTo(center(candidates[0]), tick, 1);
        } else {
            this.nav.stuck = true;
        }
    }

    groupTick(info, tick) {
        if (info.count <= 1) return false;
        const assessment = this.assessment;
        if (assessment?.hasSkeletonSwarm) {
            // For skeleton swarm, find cover that minimizes exposure
            const cover = this.findCover(tick, info);
            if (cover) {
                this.bot.navTo(cover, tick, 1);
                return true;
            }
        }
        // General group: find position maximizing distance from all
        const p = floor(this.sim.location);
        let best = undefined;
        let bestScore = -Infinity;
        for (const d of [{ x: 1, z: 0 }, { x: -1, z: 0 }, { x: 0, z: 1 }, { x: 0, z: -1 }, { x: 1, z: 1 }, { x: -1, z: -1 }, { x: 1, z: -1 }, { x: -1, z: 1 }]) {
            const q = this.terrain.groundNear(p.x + d.x * 4, p.z + d.z * 4, p.y, 3);
            if (!q || this.terrain.dangerous(q)) continue;
            let score = 0;
            for (const e of info.list) {
                const dist = distance(q, e.location);
                const prof = getMobStat(e.typeId);
                // Prefer distance from high fear mobs
                score += dist * (prof.fear / 5);
            }
            if (score > bestScore) { bestScore = score; best = q; }
        }
        if (best) {
            this.bot.navTo(center(best), tick, 1);
            return true;
        }
        return false;
    }
}
