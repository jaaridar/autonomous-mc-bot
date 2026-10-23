/**
 * Which SimulatedPlayer API to drive, and when a mine must abort and climb
 * out. Pure logic — the runtime wrapper maps these verbs onto
 * sim.swim / navigateToLocation / navigateToLocations / moveToLocation.
 */

export const WALKISH = new Set(["walk", "step", "drop", "bigdrop"]);

/**
 * @param {{ inWater?: boolean, onGround?: boolean, kinds?: string[], nativeBanned?: boolean }} s
 * @returns {"swim"|"native_route"|"native_goal"|"custom"}
 */
export function chooseDrive(s) {
    if (s.inWater) return "swim";
    if (s.nativeBanned) return "custom";
    if (s.onGround === false) return "custom";
    if (s.kinds && s.kinds.length && s.kinds.every((k) => !k || WALKISH.has(k))) return "native_route";
    return "custom";
}

/**
 * @param {{ quotaMet?: boolean, inventoryFull?: boolean, wantsOut?: boolean, hp?: number, hunger?: number, ticksUnderground?: number, inWater?: boolean, lavaNear?: boolean }} s
 */
export function shouldAbortMine(s) {
    if (s.quotaMet) return { abort: true, reason: "quota" };
    if (s.inventoryFull) return { abort: true, reason: "full" };
    if (s.wantsOut) return { abort: true, reason: "wants_out" };
    if ((s.hp ?? 20) <= 8) return { abort: true, reason: "low_health" };
    if ((s.hunger ?? 20) <= 4) return { abort: true, reason: "starving" };
    if ((s.ticksUnderground ?? 0) > 2400) return { abort: true, reason: "time" };
    if (s.inWater) return { abort: true, reason: "flooded" };
    if (s.lavaNear) return { abort: true, reason: "lava" };
    return { abort: false, reason: "" };
}

/** True when the bot is still clearly below the shaft head. */
export function stillUnderground(pos, origin, slack = 3) {
    if (!pos || !origin) return false;
    if (!Number.isFinite(pos.y) || !Number.isFinite(origin.y)) return false;
    return origin.y - pos.y > slack;
}

/**
 * @param {{ headInWater?: boolean, hasShore?: boolean }} s
 * @returns {"surface"|"shore"|"forward"}
 */
export function swimStroke(s) {
    if (s.headInWater) return "surface";
    if (s.hasShore) return "shore";
    return "forward";
}
