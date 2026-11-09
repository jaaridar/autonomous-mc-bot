/**
 * Escaper - gets the bot OUT of a bad place without dying.
 *
 * Every reported "it just stands there / falls in lava / drowns / can't escape"
 * path lands here, so the rules are explicit:
 *
 *  - Standing on or beside a hazard: step off FIRST, before anything else.
 *  - In water: swim up, then to the nearest shore. Boats are a convenience,
 *    never a requirement, and never crafted 10x in one tick.
 *  - In a pit / ravine / hole / cave with no walkable exit: stair-dig upward
 *    (one block forward + one up, which is always climbable by hand for soil
 *    and with any pickaxe for stone), then tunnel toward open ground.
 *  - Pillar only when there is real headroom and blocks to spare.
 *  - Everything is bounded and ends with an honest reason, and the caller
 *    escalates instead of repeating the same failed attempt forever.
 */
import { Direction } from "@minecraft/server";
import { add, floor, center, distance, key, horizontal, CARDINAL, COMPASS, UP, DOWN, away } from "../core/math.js";
import { diggable, HAZARDS, RANGED } from "../core/policy.js";
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
const LAVA_RE = /lava|fire|magma|campfire|soul_fire/;
const SAFE_DROP = 3;

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
        this.phase = "assess";
        this.since = 0;
        this.deadline = 0;
        this.steps = 0;
        this.lastReason = "";
        this.escapeDir = undefined;
        this.deadDirs = [];
        this.tunnelDir = undefined;
        this.pillarStart = 0;
        this.jumpFrom = undefined;
        this.pillarCol = undefined;
        this.crossing = undefined;
        this.riding = false;
        this.ridingEntity = undefined;
        this.boatTries = 0;
        this.boatSince = 0;
        this.drowning = undefined;
        this.swimming = false;
        this.lastWaterPlace = 0;
        this.stairDir = undefined;
        this.digCell = undefined;
        this.digSince = 0;
        this.lastDigFail = 0;
    }

    get active() { return !!this.mode; }

    reset() {
        if (this.riding) this.eject();
        this.mode = "";
        this.phase = "assess";
        this.deadline = 0;
        this.steps = 0;
        this.escapeDir = undefined;
        this.deadDirs = [];
        this.tunnelDir = undefined;
        this.pillarStart = 0;
        this.jumpFrom = undefined;
        this.pillarCol = undefined;
        this.crossing = undefined;
        this.boatTries = 0;
        this.drowning = undefined;
        this.swimming = false;
        this.stairDir = undefined;
        this.digCell = undefined;
        try { this.sim.stopBreakingBlock(); } catch { /* body may be gone */ }
        try { this.sim.isSneaking = false; } catch { /* body may be gone */ }
    }

    /** Does the situation actually need the escaper? (used by the brain) */
    needEscape() {
        const p = floor(this.sim.location);
        const feet = this.terrain.read(p);
        const below = this.terrain.read(add(p, DOWN));
        if (this.sim.isInWater && /water/.test(String(feet?.type ?? ""))) {
            // Shallow puddle with solid ground below is just walking.
            if (below?.support && !this.terrain.waterAt(add(p, DOWN))) return false;
            return true;
        }
        if (this.terrain.headInWater(this.sim)) return true;
        const hazardBelow = !!below?.hazard && !/water/.test(String(below?.type ?? ""));
        if (hazardBelow) return true;
        if (feet?.hazard && !/water/.test(String(feet?.type ?? ""))) return true;
        return false;
    }

    bump(limit = 16) {
        if (++this.steps > limit) {
            this.lastReason = "Escape budget spent. Handing back to the pathfinder.";
            this.reset();
            return false;
        }
        return true;
    }

    walkTo(loc, sprint = true) {
        if (!this.bump()) return "done";
        try {
            this.sim.isSprinting = sprint;
            this.sim.moveToLocation(this.host.relative(loc), { faceTarget: true, speed: sprint ? 1 : 0.7 });
        } catch { /* engine rejected the move: retry next tick */ }
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
            this.deadline = tick + 1200;
        }
        if (tick > this.deadline) {
            if (kind === "water") {
                this.lastReason = "Water escape ran long; handing control back to the pathfinder.";
                this.reset();
                return "done";
            }
            return this.giveUp("Escape attempt took too long.");
        }
        if (kind === "water") return this.water(tick);
        if (kind === "combat_escape") return this.combatEscape(tick);
        return this.trapped(tick);
    }

    /* ------------------------------- water -------------------------------- */

    /**
     * Topmost water cell in the column above the feet - i.e. where the body
     * floats. Swimming is "move along this height", never "move to y+0.4".
     */
    surfaceY(p) {
        // Walk DOWN from just above the head until the first water cell, then
        // up to the last contiguous water cell. Scanning upward from the body
        // is self-defeating: every tick the body is moved a bit higher, the
        // scan starts higher, and "the surface" climbs with it (the levitation
        // bug). Downward from the head is stable for any body inside the water.
        const typeAt = (y) => {
            const c = this.terrain.block({ x: p.x, y, z: p.z });
            const t = String(c?.typeId ?? c?.type ?? "");
            return { water: /water/.test(t) && !/lava/.test(t), liquid: !!c?.isLiquid };
        };
        let top = null;
        for (let y = p.y + 8; y >= p.y - 3; y--) {
            const t = typeAt(y);
            if (t.water) { if (top === null) top = y; }
            else if (top !== null) break;
        }
        return top;
    }

    findBoat(radius = 8) {
        try { return this.sim.dimension.getEntities({ type: "minecraft:boat", location: this.sim.location, maxDistance: radius })[0]; } catch { return undefined; }
    }

    mount(boat) {
        try { const rideable = boat.getComponent("minecraft:rideable"); if (rideable?.addRider?.(this.sim)) return true; } catch { /* not rideable */ }
        try { if (typeof this.sim.interactWithEntity === "function" && this.sim.interactWithEntity(boat)) return true; } catch { /* engine refused */ }
        return false;
    }

    eject() {
        const boat = this.ridingEntity;
        this.riding = false;
        this.ridingEntity = undefined;
        try {
            const rideable = boat?.getComponent?.("minecraft:rideable");
            if (rideable?.ejectRider) rideable.ejectRider(this.sim);
            else if (rideable?.ejectRiders) rideable.ejectRiders();
        } catch { /* already out */ }
    }

    /** Boat only when it actually helps: near shore it is slower than swimming. */
    boat(tick) {
        if (!this.bot.settings.boat) return undefined;
        if (this.riding) return "running";
        if (tick - this.boatSince < 20) return undefined;
        this.boatSince = tick;
        const existing = this.findBoat();
        if (existing && this.mount(existing)) {
            this.riding = true;
            this.ridingEntity = existing;
            this.lastReason = "Boarded a boat";
            return "running";
        }
        const slot = this.bag.find((s) => s.typeId.endsWith("_boat") || s.typeId.endsWith("_raft"));
        if (slot < 0) {
            // One crafting attempt per 200 ticks, with a single boat type.
            if (this.boatTries++ > 2 || !this.bot.settings.assistedCrafting) return undefined;
            try {
                const log = Object.keys(this.bag.counts()).find((k) => k.endsWith("_log") || k.endsWith("_wood") || k.includes("_stem"));
                const plank = log ? log.replace("_log", "_planks").replace("_wood", "_planks").replace("_stem", "_planks") : "minecraft:oak_planks";
                const boat = plank.replace("_planks", "_boat");
                this.bot.craft(boat, 1);
            } catch { /* not enough wood: swimming is the answer */ }
            return undefined;
        }
        const selected = this.bag.select(slot);
        try {
            this.sim.lookAtBlock(this.host.relative(center(floor(this.sim.location))));
            this.sim.useItemInSlot(selected);
            this.lastReason = "Placing a boat";
        } catch { /* retry next tick */ }
        return "running";
    }

    water(tick) {
        const sim = this.sim;
        const p = floor(sim.location);

        if (this.riding) {
            const shore = this.terrain.shoreNear(sim.location, 64);
            if (!sim.isInWater || (shore && shore.distance <= 2)) {
                this.eject();
                this.lastReason = "Ashore; left the boat";
                return "running";
            }
            if (shore?.cell) {
                sim.moveToLocation(this.host.relative(center(shore.cell)), { faceTarget: true });
                this.lastReason = "Boating to shore";
                return "running";
            }
            return "running";
        }

        if (!sim.isInWater && !this.terrain.headInWater(sim)) {
            if (this.swimming) { this.swimming = false; }
            this.lastReason = "Out of the water";
            this.reset();
            return "done";
        }

        this.nav.reset();
        if (!this.swimming) {
            this.swimming = true;
            try { sim.isSprinting = false; } catch { /* ignore */ }
        }

        const headInWater = this.terrain.headInWater(sim);
        if (headInWater) {
            if (this.drowning === undefined) this.drowning = tick;
            // Surface: jump is the vanilla "swim up" control.
            try { sim.jump(); } catch { /* ignore */ }
            const cur = sim.location;
            // Aim at the water surface, NOT "two blocks above where I am".
            // `cur.y + 2` was re-evaluated every tick against a body that had
            // just been moved up, so a bot in a single water block (or one
            // whose `headInWater` probe is off by a block) levitated
            // indefinitely instead of surfacing. Once the target is the surface
            // row, the climb terminates by construction.
            const surface = this.surfaceY(p);
            const aimY = surface !== null && surface !== undefined ? surface + 0.9 : cur.y + 2;
            try { sim.moveToLocation(this.host.relative({ x: cur.x, y: aimY, z: cur.z }), { faceTarget: true }); } catch { /* ignore */ }
            this.lastReason = "Drowning: surfacing";
            return "running";
        }
        this.drowning = undefined;

        if (!this.bump(400)) return "done";
        const shore = this.terrain.shoreNear(sim.location, 64);
        // Deep water / far shore: a boat genuinely helps.
        if ((!shore || shore.distance > 16) && tick - this.since > 40) {
            const r = this.boat(tick);
            if (r) { this.lastReason = "Deep water: using a boat"; return r; }
        }
        if (shore?.cell) {
            const aim = center(shore.cell);
            // Swim *along* the water line to the shore cell. The old aim was
            // `Math.max(shore.y, currentY + 0.2)`, which added 0.2 to the body
            // height on every tick: the bot climbed out of the water column
            // into the air instead of swimming across, and since it never got
            // wet again it never re-entered the "done" state - it just kept
            // rising. Aim at the shore's own height, which is what a player
            // swimming to a bank does.
            // Aim at the *surface* row (the topmost water cell), i.e. swim on
            // top of the water like a player. `center(cell)` is +0.5 into the
            // cell, which is already the water line when the shore is at the
            // same depth, and stays dry-land height when the bank is higher.
            const surface = this.surfaceY(p);
            const y = surface !== null && surface !== undefined ? surface + 0.2 : aim.y;
            try { sim.moveToLocation(this.host.relative({ x: aim.x, y, z: aim.z }), { faceTarget: true, speed: 1 }); } catch { /* ignore */ }
            if (tick % 10 === 0) { try { sim.jump(); } catch { /* ignore */ } }
            this.lastReason = `Swimming to shore (${Math.round(shore.distance)} blocks)`;
            // Close enough to step out: hand back so the pathfinder takes over
            // on dry land instead of swimming through the beach.
            if (horizontal(center(shore.cell), sim.location) < 1.2) {
                this.lastReason = "Reached the shore";
                this.swimming = false;
                this.reset();
                return "done";
            }
            return "running";
        }
        // No shore in range: head for the goal/owner so we are not paddling in
        // circles. Keep the swim height at the *water surface*, not "current +0.4":
        // that piled 0.4 onto the body y every tick, so the bot "swam" upward
        // into the sky instead of across the lake, and never reached land.
        const target = this.bot.owner()?.location ?? this.nav.lastGoal ?? this.bot.home();
        const cur = sim.location;
        if (target) {
            const dx = target.x - cur.x, dz = target.z - cur.z;
            const len = Math.hypot(dx, dz) || 1;
            const surfaceY = this.surfaceY(p) ?? cur.y;
            try {
                sim.moveToLocation(this.host.relative({
                    x: cur.x + (dx / len) * 4,
                    y: surfaceY,
                    z: cur.z + (dz / len) * 4,
                }), { faceTarget: true });
            } catch { /* ignore */ }
            if (tick % 8 === 0) { try { sim.jump(); } catch { /* ignore */ } }
            this.lastReason = "No shore in range: swimming across toward safety";
            return "running";
        }
        this.lastReason = "Swimming at the surface";
        try { sim.jump(); } catch { /* ignore */ }
        return "running";
    }

    /* ----------------------------- combat escape --------------------------- */

    combatEscape(tick) {
        const info = this.terrain.threatInfo(this.sim, this.bot.owner());
        const hp = this.sim.getComponent("minecraft:health")?.currentValue ?? 20;
        // A real escape from mobs is: break line of sight, then RUN. The old
        // version built 3x3 bunkers around itself in the open, which is how the
        // bot got surrounded and died; building only happens with a wall between
        // us and the mobs and enough blocks to close the last side.
        const cover = this.findCoverFromRanged(info.list);
        if (cover && hp > 6) {
            this.lastReason = "Combat escape: breaking line of sight";
            return this.walkTo(cover);
        }
        if (hp <= 6 && this.bot.builder?.canBuild && tick - this.since > 20) {
            // Last resort: seal one side and use the terrain wall behind us.
            const built = this.bot.builder.buildLowRoof?.(floor(this.sim.location), tick);
            if (built === "placed" || built === "placed_support") {
                this.lastReason = "Combat escape: ducking under cover";
                return "running";
            }
        }
        if (this.sim.isInWater) return this.water(tick);
        this.lastReason = "Combat escape: sprinting clear";
        return this.retreatFar(tick);
    }

    findCoverFromRanged(threats) {
        const p = floor(this.sim.location);
        const ranged = (threats ?? []).filter((e) => RANGED.has(e.typeId) || /skeleton|pillager|blaze|witch/.test(e.typeId));
        if (!ranged.length) return null;
        let best, bestScore = -Infinity;
        for (const dir of COMPASS) {
            for (const dist of [3, 5, 7, 10]) {
                const q = this.terrain.groundNear(p.x + dir.x * dist, p.z + dir.z * dist, p.y, 3);
                if (!q || this.terrain.dangerous(q) || this.terrain.lavaNear(q)) continue;
                let covered = 0;
                for (const e of ranged) {
                    const head = e.getHeadLocation ? e.getHeadLocation() : e.location;
                    if (!this.terrain.line(head, { x: q.x + 0.5, y: q.y + 1.6, z: q.z + 0.5 })) covered++;
                }
                const score = covered * 10 - distance(q, this.sim.location);
                if (score > bestScore) { bestScore = score; best = center(q); }
            }
        }
        return bestScore > 0 ? best : null;
    }

    retreatFar(tick) {
        const p = floor(this.sim.location);
        const threat = this.bot.dangerThreat();
        const dir = threat?.isValid ? away(p, floor(threat.location)) : this.escapeDirection();
        for (const d of [dir, { x: dir.z, y: 0, z: dir.x }, { x: -dir.z, y: 0, z: -dir.x }, { x: -dir.x, y: 0, z: -dir.z }]) {
            for (const n of [8, 12, 16, 24]) {
                const q = this.terrain.groundNear(p.x + d.x * n, p.z + d.z * n, p.y, 6);
                if (q && !this.terrain.dangerous(q) && !this.terrain.lavaNear(q)) {
                    this.lastReason = `Retreating ${n} blocks`;
                    try { this.sim.isSprinting = true; } catch { /* ignore */ }
                    return this.walkTo(center(q));
                }
            }
        }
        return this.giveUp("No retreat path");
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
        // A failed escape must not be repeated with the same first direction:
        // after `variant` failures, rotate the preference. Same-world retries
        // that start identically fail identically - that is the loop.
        const v = (this.bot._escapeVariants ?? 0) % 4;
        if (v) for (let i = 0; i < v; i++) order.push(order.shift());
        if (this.escapeDir) {
            const at = order.findIndex((d) => d.x === this.escapeDir.x && d.z === this.escapeDir.z);
            if (at > 0) { order.splice(at, 1); order.unshift(this.escapeDir); }
        }
        return order.filter((d) => !this.deadDirs.some((q) => q.x === d.x && q.z === d.z));
    }

    /* ------------------------------- trapped ------------------------------- */

    lavaAhead(cell) {
        const b = this.terrain.block(cell);
        if (b && !b.isAir && !b.isLiquid && HAZARDS.has(b.typeId)) return true;
        return this.terrain.lavaNear(cell);
    }

    /** What does stepping one block in `dir` look like? */
    probe(dir, p) {
        const foot = add(p, dir), head = add(foot, UP), floorCell = add(foot, DOWN);
        if (this.terrain.solid(foot)) {
            if (this.terrain.empty(head) && this.terrain.empty(add(head, UP))) return { kind: "climb" };
            const footType = this.terrain.block(foot)?.typeId ?? "";
            const rule = diggable(footType);
            if (this.terrain.lavaNear(foot)) return { kind: "dead", why: "lava beside the wall" };
            if (rule && (rule.tier === 0 || this.bag.tool("pickaxe", rule.tier))) return { kind: "tunnel" };
            return { kind: "dead", why: rule ? `needs ${rule.tool} tier ${rule.tier} for ${footType}` : `${footType} is unbreakable` };
        }
        if (this.terrain.solid(head)) {
            const headType = this.terrain.block(head)?.typeId ?? "";
            const rule = diggable(headType);
            if (this.terrain.lavaNear(head)) return { kind: "dead", why: "lava beside the low ceiling" };
            if (rule && (rule.tier === 0 || this.bag.tool("pickaxe", rule.tier))) return { kind: "tunnel" };
            return { kind: "dead", why: rule ? `needs ${rule.tool} tier ${rule.tier} for ${headType}` : `${headType} is unbreakable` };
        }
        const floorBlock = this.terrain.block(floorCell);
        if (!floorBlock || floorBlock.isAir || floorBlock.isLiquid || !floorBlock.isSolid) {
            const isWater = !!floorBlock && floorBlock.isLiquid && /water/.test(floorBlock.typeId);
            const isLava = (floorBlock && LAVA_RE.test(floorBlock.typeId)) || this.terrain.lavaNear(floorCell);
            if (isLava) return { kind: "dead", why: "lava gap" };
            // A safe drop (<=3 blocks or into water) is a way out.
            const drop = this.terrain.groundNear(foot.x, foot.z, foot.y - 1, 12);
            if (drop && !this.terrain.dangerous(drop) && !this.terrain.lavaNear(drop) &&
                (foot.y - drop.y <= SAFE_DROP || isWater || this.terrain.waterNear(drop))) {
                return { kind: "drop" };
            }
            if (this.bot.settings.bridge && this.bag.buildBlock() >= 0) return { kind: "bridge" };
            return { kind: "dead", why: isWater ? "open water, no bridge blocks" : "gap with nothing safe below" };
        }
        return { kind: "walk" };
    }

    trapped(tick) {
        const sim = this.sim;
        const p = floor(sim.location);
        const hp = sim.getComponent("minecraft:health")?.currentValue ?? 20;

        // 1. Standing on / beside something that hurts: leave immediately.
        const feet = this.terrain.read(p);
        const below = this.terrain.read(add(p, DOWN));
        const hazardHere = (feet?.hazard && !/water/.test(String(feet?.type ?? ""))) ||
            (below?.hazard && !/water/.test(String(below?.type ?? ""))) ||
            this.terrain.lavaNear(p);
        if (hazardHere) {
            let best, bestD = Infinity;
            for (const d of COMPASS) {
                for (const n of [2, 3, 4]) {
                    const q = this.terrain.groundNear(p.x + d.x * n, p.z + d.z * n, p.y, 4);
                    if (!q || this.terrain.dangerous(q) || this.terrain.lavaNear(q) || q.y > p.y + 2) continue;
                    const dd = distance(q, sim.location);
                    if (dd < bestD) { bestD = dd; best = q; }
                }
            }
            if (best) {
                this.lastReason = "Stepping off the hazard";
                try { sim.isSprinting = true; } catch { /* ignore */ }
                return this.walkTo(center(best));
            }
            // Surrounded by hazard: bridge/block our way out upward.
            if (this.bag.buildBlock() >= 0) return this.pillar(tick);
        }

        // 2. Water is the swimmer's job, not the pit-climber's.
        if (sim.isInWater) return this.water(tick);

        if (!this.bump(600)) return "done";

        // 3. Walk / jump out if any direction is open.
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
            if (plan.kind === "climb") {
                if (sim.isOnGround) { try { sim.jump(); } catch { /* ignore */ } }
                this.lastReason = "Climbing out";
                return this.walkTo(center(add(add(p, dir), UP)));
            }
            if (plan.kind === "drop") {
                const drop = this.terrain.groundNear(p.x + dir.x, p.z + dir.z, p.y - 1, 12);
                if (!drop || this.terrain.dangerous(drop)) { this.deadDirs.push(dir); continue; }
                this.lastReason = "Dropping to lower ground";
                try { sim.isSprinting = true; } catch { /* ignore */ }
                return this.walkTo(center(drop));
            }
            if (plan.kind === "tunnel" || plan.kind === "bridge") {
                this.tunnelDir = dir;
                const r = plan.kind === "bridge" ? this.bridge(dir, tick) : this.tunnel(dir, tick);
                if (r === "failed") { this.deadDirs.push(dir); this.tunnelDir = undefined; continue; }
                return r;
            }
            const walk = this.terrain.groundNear(p.x + dir.x, p.z + dir.z, p.y, 3);
            if (!walk || this.terrain.dangerous(walk)) { this.deadDirs.push(dir); continue; }
            this.lastReason = "Walking out";
            try { sim.isSprinting = true; } catch { /* ignore */ }
            return this.walkTo(center(walk));
        }

        // 4. Every direction is walled. Climb: stair-dig (works in every
        //    terrain) is preferred over pillaring because a pillar needs blocks
        //    the trapped bot usually does not have.
        const climbed = this.stairUp(tick);
        if (climbed) return climbed;

        // 5. Pillar out (needs blocks) as a second choice.
        if (this.bot.settings.bridge && this.bag.buildBlock() >= 0) {
            const r = this.pillar(tick);
            if (r !== "failed") return r;
        }

        // 6. Nothing to build with: dig out through the nearest wall.
        for (const dir of this.candidateDirs()) {
            const foot = add(p, dir);
            const b = this.terrain.block(foot);
            if (b && !b.isAir && !b.isLiquid) {
                const r = this.bot.digCell ? this.bot.digCell(foot, tick) : undefined;
                if (r === "digging") {
                    this.lastReason = `Breaking ${b.typeId} to escape`;
                    return "running";
                }
            }
        }
        if (hp <= 6) return this.giveUp("Boxed in at low health");
        return this.giveUp(why.length ? "No way out: " + why[0] : "No escape route and nothing to build with");
    }

    /**
     * Stair-dig out of a pit: mine the block in front *and one up*, then step
     * up into it. This is the classic "get out of a hole you fell into" move
     * and needs no blocks at all.
     */
    stairUp(tick) {
        const sim = this.sim;
        const p = floor(sim.location);
        const dirs = [...this.candidateDirs(), ...CARDINAL];
        const seen = new Set();
        for (const dir of dirs) {
            const key2 = `${dir.x},${dir.z}`;
            if (seen.has(key2)) continue;
            seen.add(key2);
            const low = { x: p.x + dir.x, y: p.y, z: p.z + dir.z };
            const mid = { x: p.x + dir.x, y: p.y + 1, z: p.z + dir.z };
            const top = { x: p.x + dir.x, y: p.y + 2, z: p.z + dir.z };
            if (this.terrain.lavaNear(low) || this.terrain.lavaNear(mid)) continue;
            const lowSolid = this.terrain.solid(low);
            const midSolid = this.terrain.solid(mid);
            if (!lowSolid && !midSolid) {
                if (this.terrain.empty(top) || !this.terrain.solid(top)) {
                    this.stairDir = dir;
                    if (sim.isOnGround) { try { sim.jump(); } catch { /* ignore */ } }
                    this.lastReason = "Stair-climbing out";
                    return this.walkTo(center({ x: low.x, y: p.y + 1, z: low.z }), false);
                }
            }
            if (lowSolid) {
                const lowType = this.terrain.block(low)?.typeId ?? "";
                const rule = diggable(lowType);
                if (!rule || (rule.tier > 0 && !this.bag.tool("pickaxe", rule.tier))) continue;
                if (this.terrain.waterNear(low)) continue;
                const r = this.bot.digCell ? this.bot.digCell(low, tick) : undefined;
                if (r === "digging" || r === "open") {
                    this.stairDir = dir;
                    this.lastReason = `Stair-digging out through ${lowType}`;
                    return "running";
                }
            } else if (midSolid) {
                const midType = this.terrain.block(mid)?.typeId ?? "";
                const rule = diggable(midType);
                if (!rule || (rule.tier > 0 && !this.bag.tool("pickaxe", rule.tier))) continue;
                const r = this.bot.digCell ? this.bot.digCell(mid, tick) : undefined;
                if (r === "digging" || r === "open") {
                    this.stairDir = dir;
                    this.lastReason = `Stair-digging the ceiling (${midType})`;
                    return "running";
                }
            }
        }
        return undefined;
    }

    tunnel(dir, tick) {
        const sim = this.sim;
        const p = floor(sim.location);
        const foot = add(p, dir), head = add(foot, UP);
        // A cell we cleared last tick is now open: step into it BEFORE probing
        // again. Without this the bot keeps clearing the *next* block from the
        // same standing spot and never advances - it digs a tunnel it never
        // walks through (the "digs forever, stays stuck" report).
        if (this.stepInto) {
            const aim = this.stepInto;
            this.stepInto = undefined;
            try { sim.moveToLocation(this.host.relative(center(aim)), { faceTarget: true }); } catch { /* ignore */ }
            this.lastReason = "Stepping into the cleared tunnel";
            return "running";
        }
        const cells = [foot, head].filter((c) => this.terrain.solid(c));
        if (!cells.length) {
            // The way is open: STEP INTO IT. The old version re-ran
            // `digCell`/`groundNear` here forever because nothing ever moved
            // the body into the cell it had just cleared, so the bot dug the
            // same wall from the same spot until the budget ran out - the
            // classic "it digs but never escapes" loop.
            const walk = this.terrain.groundNear(foot.x, foot.z, p.y, 4);
            try { sim.moveToLocation(this.host.relative(center(walk ?? foot)), { faceTarget: true }); } catch { /* ignore */ }
            this.lastReason = "Stepping into the tunnel";
            return "running";
        }
        const cell = cells[0];
        const type = this.terrain.block(cell)?.typeId;
        if (this.terrain.lavaNear(cell)) return this.giveUp("Refusing to tunnel beside lava");
        const rule = diggable(type);
        if (!rule) return this.giveUp(`Cannot break ${type} to escape`);
        if (rule.tier > 0 && !this.bag.tool("pickaxe", rule.tier)) return this.giveUp(`Need a pickaxe tier ${rule.tier} to tunnel`);
        if (rule.tool === "axe") this.bag.tool("axe");
        else if (rule.tool === "shovel") this.bag.tool("shovel");
        const r = this.bot.digCell ? this.bot.digCell(cell, tick) : undefined;
        if (r === "digging") {
            // Remember where to go once the swing lands. `digCell` returning
            // "digging" means the engine accepted the swing, not that the block
            // is gone yet; the step is attempted next tick and silently no-ops
            // if the block is still there (moveToLocation simply does not
            // penetrate a solid block).
            this.stepInto = foot;
            this.lastReason = "Tunnelling through " + type;
            return "running";
        }
        // "open" means the swing found it already gone / startable: treat it as
        // progress and move on next tick instead of waiting for a break that
        // will never be reported.
        if (r === "open") { this.lastReason = "Tunnel opening up"; return "running"; }
        if (r === "unreachable") {
            try { sim.moveToLocation(this.host.relative(center(foot)), { faceTarget: true }); } catch { /* ignore */ }
            this.lastReason = "Stepping closer to tunnel";
            return "running";
        }
        return this.giveUp(this.bot.lastDigReason || `Cannot reach ${type}`);
    }

    bridge(dir, tick) {
        const sim = this.sim;
        if (this.crossing) {
            const walk = this.crossing;
            if (!this.terrain.solid(add(walk, DOWN))) { this.crossing = undefined; }
            else {
                try { sim.isSprinting = false; sim.moveToLocation(this.host.relative(center(walk)), { faceTarget: true }); } catch { /* ignore */ }
                const flat = Math.hypot(sim.location.x - (walk.x + 0.5), sim.location.z - (walk.z + 0.5));
                if (flat < 0.6 && Math.abs(sim.location.y - walk.y) < 1.1) {
                    this.crossing = undefined;
                    this.lastReason = "Crossed the bridge";
                    return "done";
                }
                return "running";
            }
        }
        const p = floor(sim.location);
        const anchor = add(p, DOWN), target = add(anchor, dir), walk = add(target, UP);
        if (this.lavaAhead(target)) return this.giveUp("Refusing to bridge over lava");
        const tb = this.terrain.block(target);
        if (tb && !tb.isAir && !tb.isLiquid && !tb.isSolid) {
            try {
                sim.lookAtBlock(this.host.relative(center(target)));
                if (sim.breakBlock(this.host.relative(center(target)))) this.terrain.noteBroken?.(target);
            } catch { /* ignore */ }
            this.lastReason = "Clearing the bridge line";
            return "running";
        }
        const f = dirFace(dir);
        if (!f) return this.giveUp("Invalid bridge direction");
        const placed = this.hands.place(anchor, f, { sneak: true });
        if (placed === "no-block") return this.giveUp("No blocks to bridge with");
        if (placed === "rejected") return this.bot.settings.bridge && this.bag.buildBlock() >= 0 ? "running" : this.giveUp("Bridge placement rejected");
        this.crossing = walk;
        this.lastReason = "Bridging the gap";
        return "running";
    }

    pillar(tick) {
        const sim = this.sim;
        const p = floor(sim.location);
        if (!this.pillarStart) this.pillarStart = p.y;
        if (p.y > this.pillarStart + 40) return this.giveUp("Pillar went too high without an exit");
        if (!this.hands.canBuild) return "failed";
        // Once high enough, look for ground to step onto.
        if (p.y > this.pillarStart + 1 && sim.isOnGround) {
            const exit = COMPASS.map((d) => this.terrain.groundNear(p.x + d.x * 2, p.z + d.z * 2, p.y, 2))
                .find((q) => q && Math.abs(q.y - p.y) <= 1 && !this.terrain.dangerous(q));
            if (exit) {
                this.lastReason = "Pillar reached open ground";
                this.reset();
                return "done";
            }
        }
        try { sim.isSneaking = true; } catch { /* ignore */ }
        if (sim.isOnGround) {
            this.jumpFrom = p.y;
            this.pillarCol = { x: p.x, z: p.z };
            try { sim.jump(); } catch { /* ignore */ }
            return "running";
        }
        if (this.jumpFrom !== undefined && this.pillarCol && p.y > this.jumpFrom) {
            const anchor = { x: this.pillarCol.x, y: this.jumpFrom - 1, z: this.pillarCol.z };
            const r = this.hands.place(anchor, Direction.Up, { sneak: true });
            if (r === "no-block") return "failed";
            if (r === "placed" || this.terrain.solid({ ...this.pillarCol, y: this.jumpFrom })) {
                this.lastReason = "Pillaring up";
            }
        }
        return "running";
    }
}
