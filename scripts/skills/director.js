// Intent director: what does the bot *want* right now?
//
// Skills answer "how"; the director answers "what for". It reads the same
// context a skill does and produces one intent, ordered by a fixed urgency
// ladder. Keeping this pure means the priority order can be tested directly
// instead of being buried inside a tick loop - the reason the old bot needed
// 80 hand-written scenarios is that the ladder was implicit in code.
//
// Ladder (first match wins):
//   1. about to die (drowning, on fire, critical health, lava)
//   2. mortal threat in range
//   3. starving / hurt enough to need food
//   4. nightfall without shelter
//   5. owner request (follow / guard / goto / mine x n)
//   6. mission (the current progression goal)
//   7. maintenance (gear, torches, deposit, housekeeping)
//   8. explore / scout

export const INTENT = {
    SURVIVE: "survive",
    FIGHT: "fight",
    EAT: "eat",
    SHELTER: "shelter",
    OWNER: "owner",
    MISSION: "mission",
    MAINTAIN: "maintain",
    EXPLORE: "explore",
    IDLE: "idle",
};

export const URGENCY = {
    [INTENT.SURVIVE]: 100,
    [INTENT.FIGHT]: 90,
    [INTENT.EAT]: 80,
    [INTENT.SHELTER]: 70,
    [INTENT.OWNER]: 65,
    [INTENT.MISSION]: 50,
    [INTENT.MAINTAIN]: 40,
    [INTENT.EXPLORE]: 25,
    [INTENT.IDLE]: 0,
};

export const DEFAULTS = {
    criticalHp: 6,
    eatAt: 16,
    nightStart: 13000,
    nightEnd: 23000,
    threatRadius: 16,
    drownAir: 6,
    fireTicks: 20,
};

/**
 * @returns {{kind: string, urgency: number, reason: string, target?: any, boosts?: object}}
 */
export function assessIntent(ctx, { settings = {}, defaults = DEFAULTS } = {}) {
    const self = ctx.self ?? {};
    const intent = (kind, reason, extra = {}) => ({ kind, urgency: URGENCY[kind], reason, ...extra });

    // 1. imminent death
    if (self.onFire) {
        return intent(INTENT.SURVIVE, "on fire", { boosts: { "survival.extinguish": 200 } });
    }
    if ((self.air ?? 300) <= defaults.drownAir) {
        return intent(INTENT.SURVIVE, "drowning", { boosts: { "survival.escape-water": 200, "parkour.swim-cross": 120 } });
    }
    if ((self.hp ?? 20) <= defaults.criticalHp) {
        const threat = ctx.threats?.(defaults.threatRadius)[0];
        if (threat)
            return intent(INTENT.SURVIVE, `critical health ${self.hp} with ${threat.typeId ?? "a threat"} nearby`, {
                target: threat, boosts: { "combat.retreat": 160, "survival.flee": 150 },
            });
        return intent(INTENT.SURVIVE, `critical health ${self.hp}`, { boosts: { "survival.eat": 120, "meta.equip-gear": 80 } });
    }
    if (self.inLava)
        return intent(INTENT.SURVIVE, "standing in lava", { boosts: { "survival.escape-lava": 200 } });
    if (self.stuck)
        return intent(INTENT.SURVIVE, "no progress for a while", { boosts: { "survival.unstick": 150 } });

    // 2. threats
    const threats = ctx.threats?.(defaults.threatRadius) ?? [];
    if (threats.length && settings.defend !== false) {
        const ranked = [...threats].sort((a, b) => (a.distance ?? 99) - (b.distance ?? 99));
        const nearest = ranked[0];
        const outnumbered = ranked.length >= 3;
        const lowHp = (self.hp ?? 20) < 12;
        if (outnumbered && lowHp)
            return intent(INTENT.SURVIVE, `${ranked.length} hostiles and low health`, {
                target: nearest, boosts: { "combat.retreat": 140, "combat.bunker": 90 },
            });
        return intent(INTENT.FIGHT, `engaging ${nearest.typeId ?? "hostile"}`, { target: nearest });
    }

    // 3. food
    if ((self.hunger ?? 20) <= defaults.eatAt) {
        const hasFood = ctx.bag?.has?.(ctx.bestFood?.(ctx) ?? "");
        return intent(INTENT.EAT, `hunger ${self.hunger}`, {
            boosts: hasFood ? { "survival.eat": 120 } : { "gather.hunt-animal": 100, "gather.forage": 100 },
        });
    }

    // 4. nightfall
    const time = ctx.time ?? {};
    const night = (time.ofDay ?? 0) >= defaults.nightStart && (time.ofDay ?? 0) < defaults.nightEnd;
    if (night && settings.camp !== false && !ctx.sheltered?.()) {
        return intent(INTENT.SHELTER, "night falling without shelter", { boosts: { "survival.night-camp": 110 } });
    }

    // 5. the owner asked for something
    if (ctx.request) {
        const { kind, target, amount } = ctx.request;
        const boosts = { "explore.follow-owner": 0 };
        if (kind === "follow")
            boosts["explore.follow-owner"] = 130;
        else if (kind === "goto")
            boosts["parkour.reach"] = 130;
        else if (kind === "mine")
            boosts["mining.mine-block"] = 130;
        else if (kind === "mine-ore")
            boosts["mining.mine-vein"] = 130;
        else if (kind === "collect")
            boosts["mining.collect-drops"] = 120;
        else if (kind === "recover")
            boosts["meta.recover-death"] = 140;
        return intent(INTENT.OWNER, `owner request: ${kind}`, { target, amount, boosts });
    }

    // 6. mission from the progression ladder
    if (ctx.mission) {
        const { goal, boosts } = ctx.mission;
        if (goal)
            return intent(INTENT.MISSION, `mission: ${goal}`, { boosts: boosts ?? {} });
    }

    // 7. maintenance
    if (ctx.needsMaintenance?.())
        return intent(INTENT.MAINTAIN, ctx.maintenanceReason?.() ?? "housekeeping", { boosts: { "meta.equip-gear": 45, "craft.craft-item": 40 } });

    // 8. explore
    if (ctx.shouldExplore?.())
        return intent(INTENT.EXPLORE, "scouting for resources", { boosts: { "explore.scout": 30 } });

    return intent(INTENT.IDLE, "nothing pressing", {});
}

/**
 * Turn a free-text mission into an ordered list of concrete goals. Used by the
 * mission layer to hand the director something actionable ("iron", "diamond",
 * "nether", "shelter") instead of a vague title.
 */
export function missionGoals(mission, { counts = {} } = {}) {
    const have = (id, n = 1) => (counts[id] ?? 0) >= n;
    const goals = [];
    const push = (goal, skill, boosts) => goals.push({ goal, skill, boosts });
    if (!have("minecraft:wooden_pickaxe") && !have("minecraft:stone_pickaxe") && !have("minecraft:iron_pickaxe"))
        push("wood -> stone tools", "craft.craft-item", { "gather.chop-tree": 60, "craft.craft-item": 55, "mining.mine-block": 30 });
    if (!have("minecraft:crafting_table"))
        push("crafting table", "craft.craft-item", { "craft.craft-item": 60, "gather.chop-tree": 40 });
    if (!have("minecraft:stone_pickaxe") && !have("minecraft:iron_pickaxe"))
        push("stone pickaxe", "mining.mine-block", { "mining.mine-block": 55, "craft.craft-item": 50 });
    if (!have("minecraft:furnace"))
        push("furnace", "craft.craft-item", { "craft.craft-item": 55, "mining.mine-block": 35 });
    if (!have("minecraft:iron_pickaxe"))
        push("iron", "mining.mine-vein", { "mining.mine-vein": 60, "craft.smelt-item": 45, "mining.staircase": 40 });
    if (!have("minecraft:iron_sword"))
        push("iron sword", "craft.craft-item", { "craft.craft-item": 55, "mining.mine-vein": 30 });
    if ((counts["minecraft:diamond"] ?? 0) < 3)
        push("diamonds", "mining.branch", { "mining.branch": 60, "mining.staircase": 45, "mining.mine-vein": 40 });
    if (!have("minecraft:bucket"))
        push("bucket", "craft.craft-item", { "craft.craft-item": 50, "mining.mine-vein": 35 });
    push(mission ?? "prosper", "explore.scout", { "explore.scout": 25, "gather.forage": 20, "mining.collect-drops": 20 });
    return goals;
}

/** The single goal the mission ladder is currently on. */
export function currentMissionGoal(mission, ctx) {
    const counts = ctx.bag?.counts?.() ?? {};
    const goals = missionGoals(mission, { counts });
    return goals[0];
}

export function describeIntent(intent) {
    if (!intent)
        return "idle";
    const boosts = intent.boosts ? Object.entries(intent.boosts).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k]) => k).join(",") : "";
    return `${intent.kind}: ${intent.reason}${boosts ? ` [${boosts}]` : ""}`;
}
