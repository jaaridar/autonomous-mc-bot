/**
 * Combat planner — one engagement model instead of per-mob special cases.
 *
 * The question a fight asks is arithmetic, not a lookup table:
 *   - how much damage arrives per second, and when does it arrive?
 *   - how long until the bot dies, and how long until the group dies?
 *   - is there an exit that is strictly better than standing here?
 *
 * Everything below is computed from `core/mobs.js` traits (damage, interval,
 * reach, speed, hp) plus what the bot carries. Adding a mob, a weapon or a
 * shield does not require new branches: the numbers change and the decision
 * follows. Unknown/modded mobs get inferred traits, so they are handled too.
 *
 * Pure. The runtime passes a plain context; nothing here touches the engine.
 */
import { describe } from "./mobs.js";

const TPS = 20;
const PLAYER_WALK = 4.3;      // blocks/sec, matching the navigator's pace
const PLAYER_REACH = 3.2;     // sword reach used for "can I hit it first"
const BLAST_RADIUS = 3.6;     // creeper/ghast blast distance that matters
const HEAL_PER_SEC = 0.5;     // natural regeneration, only while fed and safe

const KEY_WEAPONS = [
    [/netherite_sword/, 8], [/_sword$/, 0], // tier resolved below
];

/** Damage per hit for a weapon type id, or bare hands. */
export function weaponDamage(typeId) {
    const t = String(typeId ?? "").replace("minecraft:", "");
    if (!t) return 1;
    if (t.includes("netherite")) return 8;
    if (t.includes("diamond")) return 7;
    if (t.includes("iron")) return 6;
    if (t.includes("stone")) return 5;
    if (t.includes("golden") || t.includes("wooden")) return 4;
    if (t.includes("trident")) return 9;
    if (t.includes("axe")) return 7;
    return 1;
}

/** Attacks/sec for the weapon family (swords are fastest). */
export function attackRate(typeId) {
    const t = String(typeId ?? "");
    if (t.includes("axe")) return 1.0;
    if (t.includes("trident")) return 1.1;
    if (t.includes("sword")) return 1.6;
    return 1.9; // fists / tools
}

/** Armour points -> damage reduction fraction (Bedrock-ish, capped). */
export function armorReduction(armorPoints = 0) {
    return Math.min(0.8, Math.max(0, Number(armorPoints) || 0) * 0.04);
}

function distanceTo(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

/**
 * Normalise a raw entity list into threats with the fields the planner needs.
 * Accepts engine entities (`typeId`, `location`, `health`) or plain objects.
 */
export function normalizeThreats(list = [], botPos = { x: 0, y: 0, z: 0 }) {
    const out = [];
    for (const raw of list) {
        if (!raw) continue;
        const typeId = raw.typeId ?? raw.type ?? "minecraft:unknown";
        const profile = describe(typeId, { families: raw.families, monster: raw.monster ?? raw.isMonster });
        const pos = raw.pos ?? raw.location ?? botPos;
        const distance = Number.isFinite(raw.distance) ? raw.distance : distanceTo(pos, botPos);
        const health = Number.isFinite(raw.health) ? raw.health : profile.hp;
        out.push({
            typeId,
            profile,
            pos: { x: pos.x, y: pos.y, z: pos.z },
            distance,
            health,
            maxHealth: Number.isFinite(raw.maxHealth) ? raw.maxHealth : profile.hp,
            los: raw.los !== false,
            alerted: raw.alerted !== false,
            entity: raw.entity,
            raw,
        });
    }
    return out;
}

/** Seconds until this threat can start hitting, and the damage it brings. */
export function threatTiming(threat) {
    const p = threat.profile;
    if (!p.hostile || p.damage <= 0) return { arrival: Infinity, dps: 0, canHitNow: false };
    const reach = p.reach;
    const canHitNow = threat.distance <= reach + 0.5 && (p.ranged ? threat.los : true);
    const gap = Math.max(0, threat.distance - reach);
    const speed = Math.max(0.05, p.speed) * PLAYER_WALK;
    const arrival = gap / speed;
    const dps = p.damage / (Math.max(1, p.interval) / TPS);
    return { arrival, dps, canHitNow };
}

/**
 * Evaluate a group. Returns per-threat numbers plus group totals:
 *   dps       incoming damage per second once everyone is in range
 *   burst     worst single hit that can land right now
 *   contact   how many threats can hit this instant
 *   ttk       seconds for the bot to clear the group
 *   ttd       seconds until the bot is dead at this rate
 */
export function evaluateGroup(threats, ctx = {}) {
    const hp = Math.max(1, ctx.hp ?? 20);
    const armor = armorReduction(ctx.armor ?? 0);
    const weapon = {
        damage: ctx.weapon?.damage ?? weaponDamage(ctx.weaponType ?? ctx.weapon?.typeId),
        rate: ctx.weapon?.rate ?? attackRate(ctx.weaponType ?? ctx.weapon?.typeId),
        reach: ctx.weapon?.reach ?? PLAYER_REACH,
    };
    const weaponDps = Math.max(0.5, weapon.damage * weapon.rate);
    const threatsOut = [];
    let dps = 0;
    let burst = 0;
    let contact = 0;
    let killTime = 0;
    let hostileCount = 0;

    for (const threat of threats) {
        const timing = threatTiming(threat);
        if (!threat.profile.hostile) {
            threatsOut.push({ ...threat, ...timing, effectiveDps: 0, killTime: Infinity });
            continue;
        }
        hostileCount++;
        const damageTaken = threat.profile.damage * (1 - armor);
        // A raised shield blocks most projectile damage; it does nothing against
        // a creeper blast, which is why explosives are handled before this.
        const shieldFactor = ctx.has?.shield && threat.profile.ranged && !threat.profile.explosive ? 0.2 : 1;
        const effectiveDps = threat.profile.explosive
            ? (timing.canHitNow ? damageTaken * 2 : damageTaken * 0.35)
            : timing.dps * (1 - armor) * shieldFactor;
        const ttk = threat.health / weaponDps;
        killTime += ttk;
        if (timing.canHitNow) {
            contact++;
            if (threat.profile.explosive) burst = Math.max(burst, damageTaken);
            else burst = Math.max(burst, damageTaken * (1 + 0.15 * (contact - 1)));
        }
        dps += effectiveDps;
        threatsOut.push({ ...threat, ...timing, effectiveDps, killTime: ttk, damageTaken });
    }

    // Mobs cannot all hit at once; a melee pack queues, ranged does not.
    const meleeContact = threatsOut.filter((t) => t.canHitNow && !t.profile.ranged).length;
    const queue = meleeContact > 2 ? 0.55 + 0.15 * Math.min(3, meleeContact - 2) : 1;
    const pressure = Math.min(1, queue);
    const incomingDps = dps * (threatsOut.some((t) => t.profile.ranged) ? 1 : pressure);
    const regen = (ctx.food ?? 20) >= 18 ? HEAL_PER_SEC : 0;
    const netDps = Math.max(0.05, incomingDps - regen);
    const ttd = hp / netDps;

    return {
        weaponDps,
        weapon,
        incomingDps,
        burst,
        contact,
        hostileCount,
        ttk: hostileCount ? killTime : 0,
        ttd,
        survivable: ttd > killTime,
        confidence: hostileCount ? Math.max(0, Math.min(1, (ttd - killTime) / Math.max(4, ttd))) : 1,
        threats: threatsOut.sort((a, b) => focusScore(b, weaponDps) - focusScore(a, weaponDps)),
    };
}

/**
 * Kill order: hurt the bot the most per second of effort. `dps / ttk` ranks a
 * glass cannon above a tank, and proximity breaks ties, which is exactly the
 * behaviour wanted against mixed groups.
 */
export function focusScore(threat, weaponDps = 1) {
    if (!threat?.profile?.hostile) return -Infinity;
    const ttk = Math.max(0.4, threat.killTime ?? (threat.health / weaponDps));
    const dps = threat.effectiveDps ?? threat.profile.damage / (Math.max(1, threat.profile.interval) / TPS);
    const proximity = 1 / (1 + Math.max(0, threat.distance - 3) * 0.12);
    return (dps / ttk) * proximity;
}

/** Weighted escape vector: away from the mass of attackers, toward open terrain. */
export function escapeVector(threats, ctx = {}) {
    let x = 0, z = 0;
    for (const raw of threats) {
        const t = raw?.profile ? raw : { ...raw, profile: describe(raw?.typeId) };
        if (!t.profile.hostile) continue;
        const d = Math.max(1, t.distance);
        const w = (t.profile.explosive ? 2 : 1) / d;
        x -= ((t.pos.x - (ctx.botPos?.x ?? 0)) / d) * w;
        z -= ((t.pos.z - (ctx.botPos?.z ?? 0)) / d) * w;
    }
    if (!x && !z) {
        x = 1;
        z = 0;
    }
    const len = Math.hypot(x, z) || 1;
    let dir = { x: x / len, z: z / len };
    // Prefer an opening if the caller knows the terrain around the bot.
    const openings = ctx.openings ?? [];
    if (openings.length) {
        let best = dir, bestDot = -Infinity;
        for (const o of openings) {
            const olen = Math.hypot(o.x, o.z) || 1;
            const dot = (o.x / olen) * dir.x + (o.z / olen) * dir.z;
            if (dot > bestDot) {
                bestDot = dot;
                best = { x: o.x / olen, z: o.z / olen };
            }
        }
        dir = best;
    }
    return dir;
}

/** Are the threats spread around the bot (front/back/sides)? */
export function surrounded(threats, botPos = { x: 0, y: 0, z: 0 }) {
    const sectors = new Set();
    for (const raw of threats) {
        if (!raw) continue;
        const t = raw.profile ? raw : {
            ...raw,
            profile: describe(raw.typeId),
            pos: raw.pos ?? raw.location ?? botPos,
            distance: raw.distance ?? distanceTo(raw.pos ?? raw.location ?? botPos, botPos),
        };
        if (!t.profile.hostile || t.distance > 12) continue;
        const a = Math.atan2(t.pos.z - botPos.z, t.pos.x - botPos.x);
        sectors.add(Math.round(((a + Math.PI) / (Math.PI * 2)) * 8) % 8);
    }
    return { sectors: sectors.size, surrounded: sectors.size >= 3 };
}

/**
 * The decision. Returns
 *   { action, target, stance, direction, math, reason, confidence }
 *
 * action: engage | kite | shield_advance | cover | retreat | tower | flee | hold
 * stance: how the executor should move/attack while the action holds.
 */
export function planEngagement(rawThreats, ctx = {}) {
    const botPos = ctx.botPos ?? { x: 0, y: 0, z: 0 };
    const threats = normalizeThreats(rawThreats, botPos);
    const math = evaluateGroup(threats, ctx);
    const hpRatio = Math.max(0, Math.min(1, (ctx.hp ?? 20) / Math.max(1, ctx.maxHp ?? 20)));
    const has = ctx.has ?? {};
    const ring = surrounded(threats, botPos);
    const dir = escapeVector(threats, { ...ctx, botPos });
    const base = {
        threats: math.threats,
        math,
        direction: dir,
        surrounded: ring.surrounded,
        target: math.threats.find((t) => t.profile.hostile)?.entity ?? math.threats.find((t) => t.profile.hostile),
    };
    const decide = (action, stance, reason, target) => ({
        ...base,
        action,
        stance,
        reason,
        confidence: math.hostileCount ? math.confidence : 1,
        target: target ?? base.target,
    });

    const hostiles = math.threats.filter((t) => t.profile.hostile);
    if (!hostiles.length) return decide("hold", "idle", "no hostiles");

    // 1. Anything that cannot be won is not fought.
    const boss = hostiles.find((t) => t.profile.noFight);
    if (boss) {
        const strong = (ctx.armor ?? 0) >= 16 && math.weaponDps >= 9 && hpRatio > 0.7;
        if (strong && (ctx.allowBoss ?? false)) return decide("engage", "kite", `geared enough for ${boss.profile.name}`, boss.entity);
        return decide(ring.surrounded ? "flee" : "retreat", "retreat", `${boss.profile.name} is not a winnable fight`, boss.entity);
    }

    // 2. Lethal burst already in range (creeper fuse, ghast fireball close).
    const bomber = hostiles.find((t) => t.profile.explosive && t.distance <= BLAST_RADIUS + 1.5);
    if (bomber) {
        if (math.burst >= (ctx.hp ?? 20) * 0.9 && math.weaponDps < 3) return decide("flee", "retreat", `blast (${math.burst.toFixed(0)}) would kill`, bomber.entity);
        // Back off perpendicular: walking straight back keeps you in the blast.
        const perp = { x: -dir.z, z: dir.x };
        return decide("retreat", "retreat", `explosive at ${bomber.distance.toFixed(1)} - clearing the blast`, bomber.entity);
    }

    // 3. No weapon: never brawl. Withdraw and let the quick-tool director arm us.
    if (!has.weapon) {
        const canOutrun = math.incomingDps < 2 || hpRatio > 0.6;
        return decide(canOutrun ? "retreat" : "flee", "retreat", "unarmed - disengage and arm up");
    }

    // 4. Pressure that is specifically ranged is answered with geometry first:
    //    cover or a shield converts an unwinnable stand-off into a winnable
    //    approach. Standing in the open is what loses these fights.
    const ranged = hostiles.filter((t) => t.profile.ranged && t.distance > 4);
    const rangedDps = ranged.reduce((n, t) => n + t.effectiveDps, 0);
    const rangedPressure = math.incomingDps > 0 && rangedDps / math.incomingDps >= 0.6;
    if (rangedPressure && ranged.length >= 2 && hpRatio > 0.3) {
        if (has.shield) return decide("shield_advance", "shield", `shield up against ${ranged.length} ranged`, ranged[0].entity);
        if (has.blocks && ranged.length >= 3) return decide("cover", "build", `breaking line of fire from ${ranged.length} ranged`);
    }

    // 5. Losing the arithmetic: act on it before health runs out.
    const losing = math.ttd < math.ttk * 0.85;
    const critical = hpRatio <= 0.35;

    if (critical && !math.survivable) {
        return decide(ring.surrounded ? "flee" : "retreat", "retreat", `critical hp ${(hpRatio * 100).toFixed(0)}% and losing (${math.ttd.toFixed(1)}s vs ${math.ttk.toFixed(1)}s)`);
    }

    if (losing) {
        // Escape options are ranked by what the bot actually has.
        if (has.blocks && ring.surrounded && hpRatio > 0.25) return decide("tower", "climb", `surrounded by ${math.hostileCount}; gaining high ground`);
        if (has.blocks && hpRatio <= 0.5) return decide("cover", "build", "losing - build cover and reset");
        if (has.food && hpRatio < 0.6 && math.incomingDps < 3) return decide("kite", "kite", "low hp - kite while regenerating");
        return decide(math.incomingDps > 4 ? "flee" : "retreat", "retreat", "losing the damage race");
    }

    // 6. Fast/flying attackers that cannot be outrun are met at a wall/tower.
    const fliers = hostiles.filter((t) => t.profile.flying);
    if (fliers.length && !has.bow && math.contact === 0 && has.blocks) {
        return decide("tower", "climb", "flying attackers - deny altitude", fliers[0].entity);
    }

    // 7. Swarm without a shield: backpedal while hitting the closest.
    if (math.contact >= 3 && !has.shield) {
        return decide("kite", "kite", `${math.contact} in contact - backpedal and thin them`);
    }
    if (ring.surrounded && math.hostileCount >= 3) {
        return decide("retreat", "retreat", `surrounded (${ring.sectors}/8 sectors) - break out`, hostiles[0].entity);
    }

    // 8. Clean fight: focus the highest value target.
    const target = hostiles[0];
    return decide("engage", "strafe", `winning: ${math.ttd.toFixed(1)}s to die vs ${math.ttk.toFixed(1)}s to clear`, target.entity);
}

/** Short human-readable summary for `!bot status` / journals. */
export function describePlan(plan) {
    if (!plan) return "no plan";
    const m = plan.math ?? {};
    return `${plan.action}/${plan.stance}${plan.target?.profile ? ` vs ${plan.target.profile.name}` : ""} · dps ${(m.incomingDps ?? 0).toFixed(1)} · ttd ${(m.ttd ?? 0).toFixed(1)}s · ttk ${(m.ttk ?? 0).toFixed(1)}s`;
}
