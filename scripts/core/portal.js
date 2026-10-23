/**
 * Portal + dimension-travel core (pure).
 *
 * Bedrock nether portals are a 4x5 obsidian frame around a 2x3 interior. This
 * module owns the geometry, validation, linking maths (overworld x/z are eight
 * times nether x/z) and the safe-arrival search used by runtime/portal-travel.js.
 * Nothing here touches the engine: callers pass a `read({x,y,z})` cell reader.
 */

export const OVERWORLD = "minecraft:overworld";
export const NETHER = "minecraft:nether";
export const THE_END = "minecraft:the_end";

export const PORTAL_BLOCK = "minecraft:nether_portal";
export const FRAME_TYPES = ["minecraft:obsidian", "minecraft:crying_obsidian"];
export const IGNITION_TYPES = ["minecraft:flint_and_steel", "minecraft:fire_charge"];

/** Overworld -> Nether: coordinates are divided by eight. */
export function scaleToNether(p) {
    return { x: Math.floor(p.x / 8), y: Math.max(-64, Math.min(319, Math.floor(p.y))), z: Math.floor(p.z / 8) };
}

/** Nether -> Overworld: coordinates are multiplied by eight. */
export function scaleToOverworld(p) {
    return { x: Math.floor(p.x * 8), y: Math.max(-64, Math.min(319, Math.floor(p.y))), z: Math.floor(p.z * 8) };
}

/** Coordinate-scaled guess of where a portal in `from` should link in `to`. */
export function linkedGuess(from, fromDimension, toDimension) {
    if (fromDimension === toDimension) return { ...from };
    if (fromDimension === OVERWORLD && toDimension === NETHER) return scaleToNether(from);
    if (fromDimension === NETHER && toDimension === OVERWORLD) return scaleToOverworld(from);
    return { ...from };
}

/**
 * Frame geometry for an axis-aligned portal. `base` is the bottom-left obsidian
 * block; with axis "x" the frame lies along x, with axis "z" along z.
 */
export function portalFrame(base, axis = "x") {
    const along = axis === "z" ? { x: 0, z: 1 } : { x: 1, z: 0 };
    const side = axis === "z" ? { x: 1, z: 0 } : { x: 0, z: 1 };
    const at = (a, y) => ({ x: base.x + along.x * a, y: base.y + y, z: base.z + along.z * a });
    // 14-frame positions; the four corners are optional (10 obsidian minimum),
    // which is exactly what the vanilla game accepts.
    const frame = [];
    const required = [];
    for (let y = 0; y <= 4; y++) {
        frame.push(at(0, y), at(3, y));
        if (y > 0 && y < 4) required.push(at(0, y), at(3, y));
    }
    for (let a = 1; a <= 2; a++) {
        frame.push(at(a, 0), at(a, 4));
        required.push(at(a, 0), at(a, 4));
    }
    const interior = [];
    for (let a = 1; a <= 2; a++) for (let y = 1; y <= 3; y++) interior.push(at(a, y));
    // Ignition is the bottom interior block; the player stands one block out
    // from it (on the side axis) to light and then walk in.
    const ignition = at(1, 1);
    const stand = { x: interior[0].x + side.x, y: base.y, z: interior[0].z + side.z };
    return { base: { ...base }, axis, frame, required, interior, ignition, stand, along, side };
}

export function isFrameType(type) {
    return FRAME_TYPES.includes(String(type ?? ""));
}

/** Validate a frame against the live reader. Returns completeness + holes. */
export function validatePortalFrame(read, base, axis = "x") {
    const plan = portalFrame(base, axis);
    const missing = [];
    for (const pos of plan.required) {
        const c = read(pos);
        if (!c || !isFrameType(c.type ?? c.typeId)) missing.push(pos);
    }
    const interiorClear = plan.interior.every((pos) => {
        const c = read(pos);
        return c && c.passable === true && !c.hazard;
    });
    return {
        base: plan.base,
        axis,
        plan,
        complete: missing.length === 0,
        missing,
        interiorClear,
        usable: missing.length === 0 && interiorClear,
        frameCount: plan.required.length - missing.length,
    };
}

/** Is a block a lit portal? */
export function isPortalCell(c) {
    if (!c) return false;
    const type = String(c.type ?? c.typeId ?? "");
    return type === PORTAL_BLOCK || type.endsWith(":nether_portal") || type.endsWith(":portal");
}

/**
 * Bounded scan for the nearest lit portal. Coarse stride-2 scan then a local
 * refinement, so a 12-block probe costs ~1/8 of the reads a cube walk would.
 */
export function findPortalNear(read, at, radius = 24, stride = 2) {
    const r = Math.max(2, Math.min(64, Math.floor(radius)));
    let best = null;
    for (let dy = -8; dy <= 10; dy += 2) {
        for (let dx = -r; dx <= r; dx += stride) {
            for (let dz = -r; dz <= r; dz += stride) {
                const d2 = dx * dx + dz * dz;
                if (d2 > r * r) continue;
                const pos = { x: at.x + dx, y: at.y + dy, z: at.z + dz };
                if (isPortalCell(read(pos)) && (!best || d2 < best.d2)) best = { pos, d2 };
            }
        }
    }
    if (!best) return null;
    // Refine to the true portal block (coarse cells may be one block off).
    let refined = best;
    for (let dx = -2; dx <= 2; dx++) {
        for (let dy = -2; dy <= 2; dy++) {
            for (let dz = -2; dz <= 2; dz++) {
                const pos = { x: best.pos.x + dx, y: best.pos.y + dy, z: best.pos.z + dz };
                if (!isPortalCell(read(pos))) continue;
                const d2 = (pos.x - at.x) ** 2 + (pos.z - at.z) ** 2;
                if (d2 <= refined.d2) refined = { pos, d2 };
            }
        }
    }
    return { pos: refined.pos, distance: Math.sqrt(refined.d2) };
}

/** Spiral offsets, nearest first, bounded. */
export function offsets(radius, horizontalOnly = false) {
    const r = Math.max(1, Math.floor(radius));
    const out = [];
    for (let dy = horizontalOnly ? 0 : -r; dy <= (horizontalOnly ? 0 : r); dy++) {
        for (let dx = -r; dx <= r; dx++) {
            for (let dz = -r; dz <= r; dz++) {
                const d2 = dx * dx + dz * dz + dy * dy * 4;
                if (d2 <= r * r) out.push({ x: dx, y: dy, z: dz, d2 });
            }
        }
    }
    out.sort((a, b) => a.d2 - b.d2);
    return out;
}

const OFFSET_CACHE = new Map();
function cachedOffsets(radius) {
    let o = OFFSET_CACHE.get(radius);
    if (!o) {
        o = offsets(radius);
        OFFSET_CACHE.set(radius, o);
    }
    return o;
}

function cellType(c) {
    return String(c?.type ?? c?.typeId ?? "");
}

function solidFloor(c) {
    return !!c && (c.support === true || c.solid === true || c.isSolid === true);
}

function hazard(c) {
    return !!c && (c.hazard === true || /lava/.test(cellType(c)));
}

function canStand(c) {
    return !!c && c.passable === true && !hazard(c);
}

/**
 * Choose an anchor for a new portal: a flat, safe, 4x5 patch of air with solid
 * ground under the frame. Returns the frame plan or null.
 */
export function choosePortalAnchor(read, near, options = {}) {
    const radius = Math.min(24, Math.max(3, options.radius ?? 8));
    const axisPreference = options.axis ?? "x";
    for (const off of cachedOffsets(radius)) {
        for (const axis of axisPreference === "z" ? ["z", "x"] : ["x", "z"]) {
            const base = { x: near.x + off.x, y: near.y + off.y, z: near.z + off.z };
            const plan = portalFrame(base, axis);
            let ok = true;
            for (const pos of plan.frame) {
                const c = read(pos);
                if (!c || !canStand(c) || hazard(c)) { ok = false; break; }
                // Only the bottom row needs a floor under it; the rest of the
                // frame is held up by the frame itself.
                if (pos.y === base.y && !solidFloor(read({ x: pos.x, y: pos.y - 1, z: pos.z }))) { ok = false; break; }
            }
            if (!ok) continue;
            for (const pos of plan.interior) {
                const c = read(pos);
                if (!c || !canStand(c)) { ok = false; break; }
            }
            if (!ok) continue;
            // Standing spot and a clear approach.
            if (!canStand(read({ x: plan.stand.x, y: plan.stand.y, z: plan.stand.z }))) continue;
            return plan;
        }
    }
    return null;
}

/**
 * Safe arrival cell near `target`, scanning a bounded vertical window.
 * Water and lava are never returned. If nothing is open, the closest solid
 * ceiling/floor pair is returned with `needsDig: true` so the caller can carve
 * a landing instead of guessing.
 */
export function chooseArrival(read, target, options = {}) {
    const radius = Math.min(16, Math.max(2, options.radius ?? 6));
    let digCandidate = null;
    for (const off of cachedOffsets(radius)) {
        const pos = { x: target.x + off.x, y: target.y + off.y, z: target.z + off.z };
        if (pos.y < -60 || pos.y > 315) continue;
        const feet = read(pos);
        const head = read({ x: pos.x, y: pos.y + 1, z: pos.z });
        const floor = read({ x: pos.x, y: pos.y - 1, z: pos.z });
        if (!feet || !head || hazard(feet) || hazard(head)) continue;
        if (canStand(feet) && canStand(head) && solidFloor(floor)) {
            return { pos, needsDig: false, distance: Math.sqrt(off.d2) };
        }
        if (!digCandidate && canStand(feet) && !canStand(head) && solidFloor(floor)) {
            const headType = cellType(head);
            if (!/bedrock/.test(headType)) digCandidate = { pos, needsDig: true, distance: Math.sqrt(off.d2) };
        }
    }
    if (options.allowDig !== false) return digCandidate;
    return null;
}

/**
 * Decide what the traveler should do at a portal:
 *  - "walk"    : inside/next to the portal, keep walking into the interior
 *  - "wait"    : standing in a portal, give the engine a few ticks to move us
 *  - "teleport": portal exists but the engine has not transported us
 *  - "ignite"  : a complete frame with no portal blocks
 *  - "build"   : nothing usable nearby
 */
export function portalAction(obs = {}) {
    const inPortal = obs.inPortal === true;
    const onPortal = obs.nearPortal === true;
    const frame = obs.frame;
    if (inPortal) return obs.waited >= (obs.graceTicks ?? 40) ? "teleport" : "wait";
    if (onPortal) return "walk";
    if (frame?.complete && !frame?.interiorClear) return "clear";
    if (frame?.complete && frame?.interiorClear) return "ignite";
    if (frame && !frame.complete) return "repair";
    return "build";
}

/** Should the bot travel back to the Overworld? (health/food/time based) */
export function shouldReturnToOverworld(ctx = {}) {
    const hp = ctx.health ?? 20;
    const food = ctx.food ?? 20;
    const hasReturn = ctx.hasReturnPortal === true;
    if (ctx.dimension !== NETHER) return { return: false, reason: "not in the nether" };
    if (!hasReturn) return { return: true, reason: "no return portal within reach" };
    if (hp <= 8) return { return: true, reason: `low health (${hp})` };
    if (food <= 5) return { return: true, reason: `low food (${food})` };
    if (ctx.hostiles >= 4 && hp <= 12) return { return: true, reason: "overwhelmed in the nether" };
    return { return: false, reason: "nether trip can continue" };
}

/**
 * Nether exploration goal scoring: prefer quartz/gold/fortress/bastion that is
 * close, reachable and not across a lava sea; never lead the bot beyond the
 * leash from its return portal.
 */
export function scoreNetherTarget(target, here, ctx = {}) {
    const d = Math.hypot(target.x - here.x, target.z - here.z);
    const leash = ctx.leash ?? 96;
    if (d > leash) return -Infinity;
    const portalDistance = ctx.portal ? Math.hypot(target.x - ctx.portal.x, target.z - ctx.portal.z) : 0;
    const kind = target.kind ?? target.name ?? "resource";
    const value = { fortress: 90, bastion: 80, quartz: 45, gold: 55, magma: 20, lava: 0, resource: 30 }[kind] ?? 30;
    if (portalDistance > leash) return -Infinity;
    return value - d * 0.35 - (ctx.hostilesNear ?? 0) * 6;
}

/** Pick the best scored target (ties keep the nearest). */
export function chooseNetherTarget(targets = [], here, ctx = {}) {
    let best = null;
    for (const t of targets) {
        const pos = t.pos ?? t;
        const score = scoreNetherTarget({ ...t, ...pos }, here, ctx);
        if (score === -Infinity) continue;
        if (!best || score > best.score) best = { target: t, score };
    }
    return best;
}
