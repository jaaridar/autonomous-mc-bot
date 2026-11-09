/**
 * Ownership state machine: exactly ONE behaviour drives the bot each tick.
 *
 * The old `think()` was a chain of ~15 `if (director.tick()) return;` calls in
 * one function, each re-evaluating the world itself and each able to "steal"
 * the bot for a single tick. That is why the bot looked stuck in loops:
 *
 *   - two directors could both claim the tick, alternating every other tick
 *     (mine -> bucket -> mine -> nether ...), so neither ever finished;
 *   - a director that returned true once and false the next dropped control to
 *     the dispatcher, which reset the navigator and re-planned from scratch;
 *   - a director that returned false forever (throttled) still consumed the
 *     tick before the mission ran.
 *
 * This module is the decision layer only - pure data in, one owner out - with
 * hysteresis (min hold, switch margin, failure cooldown) so a stable job keeps
 * running and an emergency still pre-empts instantly.
 *
 * Owners, in hard priority order (an emergency always wins):
 *   escape > survive > combat > retreat > eat > unstuck > mission > idle
 */

export const OWNERS = Object.freeze({
    ESCAPE: "escape",
    SURVIVE: "survive",
    COMBAT: "combat",
    RETREAT: "retreat",
    EAT: "eat",
    UNSTUCK: "unstuck",
    MISSION: "mission",
    IDLE: "idle",
});

/**
 * Owners whose work is stateful: leaving one mid-action loses progress, so the
 * caller must not switch away from them unless the new owner is an emergency
 * or they have released control themselves. EATING is excluded on purpose -
 * eating is polled by the owner (see ownsEating) precisely so it can fire as
 * soon as no threat is adjacent.
 */
export const STATEFUL = new Set(["escape", "survive", "combat", "retreat", "unstuck"]);

/** How long an owner must keep control before a non-emergency may replace it. */
const MIN_HOLD = {
    [OWNERS.ESCAPE]: 8,
    [OWNERS.SURVIVE]: 20,
    [OWNERS.COMBAT]: 15,
    [OWNERS.RETREAT]: 25,
    [OWNERS.EAT]: 20,
    [OWNERS.UNSTUCK]: 40,
    [OWNERS.MISSION]: 30,
    [OWNERS.IDLE]: 40,
};

/** Utility needed to take over from the current owner. */
const SWITCH_MARGIN = 12;

/**
 * @param {object} s snapshot of the world and the bot
 * @param {object} [prev] the previous decision `{ owner, since, utility }`
 * @param {number} [tick]
 * @param {string|null} [job] the arbiter's current job id, when one is active
 * @returns {{ owner: string, utility: number, reason: string, emergency: boolean, switched: boolean }}
 */
export function chooseOwner(s, prev, tick = 0, job = null) {
    const score = new Map();
    const why = new Map();
    const put = (owner, utility, reason) => {
        if (utility <= 0) return;
        if (utility > (score.get(owner) ?? 0)) { score.set(owner, utility); why.set(owner, reason); }
    };

    const hp = num(s.health, 20);
    const hunger = num(s.hunger, 20);
    const threats = num(s.threatCount, 0);
    const closest = num(s.closestThreat, Infinity);
    const fall = num(s.fallDepthBelow, 0);

    /* ---------------------------- escape (hard) ---------------------------- */
    if (s.headInWater) put(OWNERS.ESCAPE, 100, "head under water");
    if (s.onLava || s.inLava) put(OWNERS.ESCAPE, 100, "standing in lava");
    if (s.lavaAdjacent) put(OWNERS.ESCAPE, 96, "lava beside the bot");
    if (s.onFire) put(OWNERS.ESCAPE, 98, "on fire");
    if (s.inWater && !s.headInWater) put(OWNERS.ESCAPE, 70, "in water");
    // A drop below that would hurt badly is worth stepping back from.
    if (fall > 3 && fall >= hp - 1) put(OWNERS.ESCAPE, 92, `fatal drop below (${fall})`);
    if (s.trapped) put(OWNERS.ESCAPE, 88, "no walkable exit");

    /* --------------------------- survive (body) ---------------------------- */
    if (hp <= 6) put(OWNERS.SURVIVE, 100, `health ${hp}`);
    if (s.stuckLevel >= 4) put(OWNERS.SURVIVE, 85, "critically stuck");
    if (s.suffocating) put(OWNERS.SURVIVE, 100, "suffocating");

    /* ------------------------------- combat -------------------------------- */
    if (threats > 0 && hp > 8) {
        let u = 45 + Math.min(30, threats * 8);
        if (s.hasWeapon) u += 8;
        else u -= 10;
        if (closest <= 4) u += 12;
        if (s.bombNear) u -= 20; // a creeper at arm's length is a retreat problem
        put(OWNERS.COMBAT, u, `${threats} hostile(s) at ${fmt(closest)}`);
    }

    /* ------------------------------- retreat ------------------------------- */
    if (threats > 0) {
        let u = 0;
        if (hp <= 10 && !s.hasWeapon) u = 80;
        else if (hp <= 8) u = 85;
        else if (s.bombNear) u = 80;
        else if (threats >= 4) u = 70;
        else if (threats >= 2 && hp <= 12) u = 68;
        else if (s.rangedThreats >= 1 && hp <= 12 && closest > 3) u = 60;
        if (u) put(OWNERS.RETREAT, u, `retreat: hp ${hp}, ${threats} mobs`);
    }

    /* --------------------------------- eat --------------------------------- */
    if (s.hasFood && hunger <= 17) {
        const starving = hunger <= 6;
        const safeToEat = threats === 0 || closest > 10 || starving;
        if (safeToEat) put(OWNERS.EAT, starving ? 90 : 55 + (17 - hunger), `hunger ${hunger}`);
    }

    /* -------------------------------- unstuck ------------------------------ */
    // Level 3 is the top of the local ladder (dig / shake / climb / abandon).
    // At level 4 the local remedies have all been tried, so control moves to
    // SURVIVE, which is allowed to stop, shelter or ask for help instead of
    // grinding the same failure again.
    if (s.stuckLevel >= 2) put(OWNERS.UNSTUCK, 55 + 10 * Math.min(3, s.stuckLevel), `no progress (level ${s.stuckLevel})`);

    /* -------------------------------- mission ------------------------------ */
    // The mission is the floor: it runs whenever nothing above needs the body.
    // When the arbiter has picked a progression/resource job (nether, village,
    // looting, speedrun), that job IS the mission - naming it here keeps the
    // body services from calling it a drift.
    const jobName = job && job !== OWNERS.MISSION ? job : null;
    const missionUtility = s.missionActive ? 40 : 15;
    put(OWNERS.MISSION, missionUtility,
        jobName ? `job ${jobName}` : s.missionActive ? `mission ${s.mode ?? ""}`.trim() : "no job: guard");

    /* ------------------------------- arbitrate ----------------------------- */
    const candidates = [...score.entries()].sort((a, b) => b[1] - a[1]);
    const [topOwner, topUtility] = candidates[0] ?? [OWNERS.IDLE, 0];
    const emergency = topUtility >= 85;

    if (prev && prev.owner) {
        const held = tick - num(prev.since, tick);
        const prevUtility = score.get(prev.owner) ?? 0;
        const prevHold = MIN_HOLD[prev.owner] ?? 20;
        if (topOwner === prev.owner) {
            return { owner: prev.owner, utility: topUtility, reason: why.get(topOwner) ?? "", emergency, switched: false };
        }
        if (!emergency && held < prevHold) {
            return { owner: prev.owner, utility: prevUtility, reason: why.get(prev.owner) ?? "committed (min hold)", emergency: false, switched: false };
        }
        if (!emergency && topUtility < prevUtility + SWITCH_MARGIN) {
            return { owner: prev.owner, utility: prevUtility, reason: why.get(prev.owner) ?? "kept (no clear winner)", emergency: false, switched: false };
        }
    }

    return {
        owner: topOwner,
        utility: topUtility,
        reason: why.get(topOwner) ?? "",
        emergency,
        switched: !prev || prev.owner !== topOwner,
    };
}

/** Ranked utilities for `!bot status` / journaling. */
/**
 * Does `owner` hold EAT right now? Used by the run dispatcher so food is eaten
 * in the gaps between work instead of only when nothing else was queued.
 */
export function ownsEating(snapshot) {
    return chooseOwner({ ...snapshot, missionActive: false }, null, 0).owner === OWNERS.EAT;
}

export function ownerUtilities(s) {
    const out = {};
    const prev = undefined;
    const base = chooseOwner({ ...s, missionActive: false }, prev, 0);
    void base;
    for (const owner of Object.values(OWNERS)) {
        const probe = chooseOwner({ ...s, missionActive: owner === OWNERS.MISSION }, prev, 0);
        if (probe.owner === owner) out[owner] = probe.utility;
    }
    return out;
}

function num(v, d) {
    return typeof v === "number" && Number.isFinite(v) ? v : d;
}
function fmt(v) {
    return Number.isFinite(v) ? `${Math.round(v)}b` : "?";
}
