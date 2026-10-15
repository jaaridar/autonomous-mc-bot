const hasLiquidNear = (world, x, y, z, kind) => {
    for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0], [0, -1, 0]]) {
        let c = null;
        try { c = world.block(x + dx, y + dy, z + dz); } catch {}
        if (c?.liquid === kind) return true;
    }
    return false;
};

export const RULES = [
    {
        id: "no_mine_beside_lava",
        applies: (a) => a.type === "mine" && a.target,
        check: (a, ctx) => ctx.world && hasLiquidNear(ctx.world, a.target.x, a.target.y, a.target.z, "lava")
            ? "target is adjacent to lava; breaking it can release a flow" : null,
    },
    {
        id: "no_dig_down_into_unknown",
        applies: (a) => a.type === "mine" && a.target && a.below === true,
        check: (a, ctx) => {
            if (!ctx.world) return null;
            let open = 0;
            for (let i = 1; i <= 8; i++) {
                let c = null;
                try { c = ctx.world.block(a.target.x, a.target.y - i, a.target.z); } catch {}
                if (!c || c.solid || c.liquid) break;
                open++;
            }
            return open >= 5 ? "digging here opens a drop of 5+ blocks" : null;
        },
    },
    {
        id: "no_fight_without_exit",
        applies: (a) => a.type === "fight",
        check: (a, ctx) => {
            const hp = ctx.hp ?? 20, kit = ctx.escapeKit ?? { blocks: 0, waterBucket: false };
            const exit = kit.blocks >= 4 || kit.waterBucket || ctx.canOutrun;
            return hp <= 6 && !exit ? "low health with no way to break off the fight" : null;
        },
    },
    {
        id: "keep_escape_kit",
        applies: (a) => a.type === "place" && !a.emergency,
        check: (a, ctx) => ((ctx.escapeKit?.blocks ?? 99) - (a.count ?? 1)) < 8 ? "would spend the last of the escape blocks on a non-emergency" : null,
    },
    {
        id: "no_open_night_travel",
        applies: (a) => a.type === "travel" && a.far,
        check: (a, ctx) => ctx.night && !ctx.hasLight && (ctx.hp ?? 20) < 12 ? "long surface trip in the dark while hurt" : null,
    },
];

export function violations(action, ctx = {}) {
    const out = [];
    for (const r of RULES) {
        try {
            if (!r.applies(action ?? {}, ctx)) continue;
            const why = r.check(action, ctx);
            if (why) out.push({ id: r.id, why });
        } catch {}
    }
    return out;
}
export const allowed = (action, ctx) => violations(action, ctx).length === 0;
