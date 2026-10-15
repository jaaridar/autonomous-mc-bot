import { STATUS, REASON, running, success, failed, coerce } from "./results.js";
import { violations } from "./rules.js";

export function defineSkill(spec) {
    if (!spec || typeof spec.id !== "string") throw new Error("skill needs an id");
    if (typeof spec.run !== "function") throw new Error(`skill ${spec.id} needs run()`);
    return Object.freeze({
        id: spec.id,
        maxTicks: spec.maxTicks ?? 1200,
        pre: spec.pre ?? (() => true),
        post: spec.post ?? (() => true),
        action: spec.action ?? (() => null),
        run: spec.run,
        abort: spec.abort ?? (() => {}),
    });
}

export class SkillRunner {
    constructor() { this.cur = null; }
    get active() { return this.cur !== null; }
    get id() { return this.cur?.skill.id ?? ""; }

    start(skill, args, ctx, tick) {
        if (this.cur) this.cancel(ctx);
        try {
            if (!skill.pre(ctx, args)) return failed(REASON.PRECONDITION, `${skill.id}: precondition not met`);
            const act = skill.action(ctx, args);
            if (act) {
                const v = violations(act, ctx);
                if (v.length) return failed(REASON.UNSAFE, `${skill.id}: ${v.map((x) => x.id).join(",")}`);
            }
        } catch (e) { return failed(REASON.UNKNOWN, `${skill.id}: start threw ${String(e).slice(0, 80)}`); }
        this.cur = { skill, args, startTick: tick ?? 0 };
        return running(`${skill.id}:started`);
    }

    step(ctx, tick) {
        const c = this.cur;
        if (!c) return failed(REASON.UNKNOWN, "no active skill");
        if ((tick ?? 0) - c.startTick > c.skill.maxTicks) return this._finish(ctx, failed(REASON.TIMEOUT, `${c.skill.id}: exceeded ${c.skill.maxTicks} ticks`));
        let r;
        try { r = coerce(c.skill.run(ctx, c.args, tick)); }
        catch (e) { return this._finish(ctx, failed(REASON.UNKNOWN, `${c.skill.id}: ${String(e).slice(0, 80)}`)); }
        if (r.status === STATUS.RUNNING) return r;
        if (r.status === STATUS.SUCCESS) {
            let ok = false;
            try { ok = !!c.skill.post(ctx, c.args); } catch { ok = false; }
            if (!ok) r = failed(REASON.POSTCONDITION, `${c.skill.id}: claimed success but the world disagrees`);
        }
        return this._finish(ctx, r);
    }

    cancel(ctx) {
        const c = this.cur;
        this.cur = null;
        if (c) { try { c.skill.abort(ctx, c.args); } catch {} }
    }
    _finish(ctx, r) { this.cur = null; return r; }
}

export const SKILL_CATALOG = Object.freeze({
    chop_tree:       "walk to the nearest known tree and harvest logs",
    mine_stone:      "mine surface or exposed stone/cobblestone",
    mine_ore:        "walk to a KNOWN ore of args.ore and mine it (tier-checked)",
    branch_mine:     "descend to the ore's best Y and branch-mine, torching, with hazard checks",
    dig_down_safe:   "stair-dig down without ever opening a drop or touching liquid",
    explore:         "travel to unexplored frontier for args.for (trees|stone|cave|water|animals|village)",
    hunt:            "kill and collect from nearby passive animals",
    loot_structure:  "walk to a known structure chest and withdraw useful items",
    ensure_table:    "place a crafting table nearby (or walk to a remembered one)",
    ensure_furnace:  "place/locate a furnace",
    craft:           "craft args.item x args.n",
    smelt:           "smelt args.input x args.n with fuel",
    fill_bucket:     "fill a bucket at a known water source",
    eat:             "eat the best available food",
    sleep:           "place a bed and sleep, or skip the night",
    seal_shelter:    "dig/enclose a reopenable shelter niche",
    light_area:      "place torches to prevent spawns",
    fight:           "tactical melee/ranged engagement",
    flee:            "move to the safest reachable cell away from threats",
    water_clutch:    "place water under a fall",
    pillar_up:       "jump-place blocks to climb out",
    bridge:          "place blocks to cross a gap",
    tunnel:          "cut a safe tunnel toward a target",
    go_home:         "return to the remembered base",
    recover_death:   "return to the death point and collect drops",
});
