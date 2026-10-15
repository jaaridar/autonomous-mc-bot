/**
 * Advanced Combat module - handles all mob fighting, retreat, protection.
 * Integrates with bot brain for tactical decisions.
 */
import { distance, floor, add, center, away } from "../core/math.js";
import { getMobStat, shouldRetreat, combatThreatScore, chooseTactic } from "../core/combat.js";
import { EXPLOSIVE, RANGED, HOSTILES } from "../core/policy.js";

export class Combat {
    constructor(bot) {
        this.bot = bot;
        this.sim = bot.sim;
        this.bag = bot.bag;
        this.terrain = bot.terrain;
        this.nav = bot.nav;
        this.host = bot.host;
        this.lastAttack = 0;
        this.lastCrit = 0;
        this.critArmed = false;
        this.lastStrafe = 0;
        this.target = undefined;
        this.combo = 0;
        this.kiteSince = 0;
    }

    reset() {
        this.target = undefined;
        this.combo = 0;
        this.kiteSince = 0;
    }

    /**
     * Evaluate current threats and pick best target.
     * Returns {target, tactic, shouldRetreat}
     */
    evaluate(tick) {
        const hp = this.sim.getComponent("minecraft:health")?.currentValue ?? 20;
        const info = this.terrain.threatInfo(this.sim, this.bot.owner());
        const hasWeapon = this.bag.weapon() >= 0;
        const threatScore = combatThreatScore(info.list, this.sim.location);

        // Creeper special: always retreat if <5 blocks
        const creeper = info.list.find(e => EXPLOSIVE.has(e.typeId) && distance(e.location, this.sim.location) < 5);
        if (creeper) {
            return { target: creeper, tactic: "retreat", shouldRetreat: true, info };
        }

        if (shouldRetreat(hp, threatScore, info.count, hasWeapon)) {
            return { target: info.nearest, tactic: "retreat", shouldRetreat: true, info };
        }

        // Pick target: highest priority within 8 blocks, else nearest
        let best = info.nearest;
        if (info.list.length > 1) {
            const sorted = [...info.list].sort((a,b) => {
                const sa = getMobStat(a.typeId).priority;
                const sb = getMobStat(b.typeId).priority;
                if (sa !== sb) return sb - sa;
                return distance(a.location, this.sim.location) - distance(b.location, this.sim.location);
            });
            best = sorted[0];
        }

        if (!best) return { target: undefined, tactic: "none", shouldRetreat: false, info };

        return { target: best, tactic: chooseTactic(best.typeId), shouldRetreat: false, info };
    }

    /**
     * Execute combat tick. Returns true if combat handled tick, false to let other branches.
     */
    tick(target, tick, info) {
        if (!target?.isValid) {
            this.nav.reset();
            return false;
        }
        const d = distance(this.sim.location, target.location);
        const stat = getMobStat(target.typeId);

        // Handle explosive
        if (EXPLOSIVE.has(target.typeId) && d < 5) {
            this.retreatFrom(target, tick);
            return true;
        }

        // Ranged mobs: rush them
        if (RANGED.has(target.typeId) && d > 3) {
            this.nav.urgent = true;
            this.nav.avoid = [];
            const r = this.bot.navTo(target.location, tick, 2.5);
            if (r === "failed") this.retreatFrom(target, tick);
            return true;
        }

        // Melee: kite if low hp
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
        if (!this.terrain.line(this.sim.getHeadLocation(), target.getHeadLocation())) return true;
        if (tick - this.lastAttack < 10) return true;

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
            this.sim.jump();
            return true;
        }

        this.attack(target, tick);
        return true;
    }

    attack(target, tick) {
        this.bag.weapon();
        this.sim.lookAtEntity(target);
        this.sim.attackEntity(target);
        this.lastAttack = tick;
        this.combo++;
        this.strafe(tick);
    }

    strafe(tick) {
        if (tick - this.lastStrafe < 8) return;
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
                this.sim.moveToLocation(this.host.relative(center(q)), { faceTarget: true });
                return;
            }
        }
    }

    kite(target, tick) {
        const p = floor(this.sim.location);
        const awayDir = away(p, floor(target.location));
        const spot = this.terrain.groundNear(p.x + awayDir.x * 3, p.z + awayDir.z * 3, p.y, 2);
        if (spot && !this.terrain.dangerous(spot)) {
            this.nav.urgent = true;
            this.bot.navTo(center(spot), tick, 1);
        }
    }

    retreatFrom(target, tick) {
        const p = floor(this.sim.location);
        const dir = away(p, floor(target.location));
        const candidates = [];
        for (let n = 4; n <= 8; n += 2) {
            const q = this.terrain.groundNear(p.x + dir.x * n, p.z + dir.z * n, p.y, 3);
            if (q && !this.terrain.dangerous(q)) candidates.push(q);
        }
        if (candidates.length) {
            this.nav.urgent = true;
            this.bot.navTo(center(candidates[0]), tick, 1);
        } else {
            this.nav.stuck = true;
        }
    }

    /**
     * Group combat: handle multiple mobs by focusing and positioning.
     */
    groupTick(info, tick) {
        if (info.count <= 1) return false;
        // Find safe position that maximizes distance from all
        const p = floor(this.sim.location);
        let best = undefined;
        let bestScore = -Infinity;
        for (const d of [{x:1,z:0},{x:-1,z:0},{x:0,z:1},{x:0,z:-1},{x:1,z:1},{x:-1,z:-1},{x:1,z:-1},{x:-1,z:1}]) {
            const q = this.terrain.groundNear(p.x + d.x * 3, p.z + d.z * 3, p.y, 2);
            if (!q || this.terrain.dangerous(q)) continue;
            let score = 0;
            for (const e of info.list) {
                score += distance(q, e.location);
            }
            if (score > bestScore) {
                bestScore = score;
                best = q;
            }
        }
        if (best) {
            this.bot.navTo(center(best), tick, 1);
            return true;
        }
        return false;
    }
}
