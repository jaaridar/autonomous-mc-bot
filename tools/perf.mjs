// Offline lag profiler for the Verdant bot.
//
//   node tools/perf.mjs                      # profile the working tree
//   node tools/perf.mjs --ref <git-ref>      # profile a committed version
//   node tools/perf.mjs --compare <git-ref>  # before/after table vs a ref
//   node tools/perf.mjs --scenario follow-walk --ticks 600
//   node tools/perf.mjs --check              # fast smoke run for run-all
//
// The real bot code (scripts/) runs tick by tick against tools/perf/fake-mc.mjs,
// a deterministic procedural world whose every engine getter/method counts as
// one native call. Bedrock runs pack scripts on QuickJS (an interpreter, no
// JIT) and each script<->engine crossing has a real cost, so "native calls per
// tick" is the primary lag metric here. A* expansions, console.warn spam,
// faults and Node wall time are reported alongside, together with behaviour
// metrics (owner distance, logs gained, ...) so a speed-up that breaks the
// bot shows up as a regression instead of a win.
import { mkdirSync, writeFileSync, readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { loadScripts } from "./perf/load.mjs";

const tools = fileURLToPath(new URL(".", import.meta.url));

const argv = process.argv.slice(2);
const opt = (name, fallback) => {
    const i = argv.indexOf("--" + name);
    return i >= 0 ? argv[i + 1] : fallback;
};
const flag = (name) => argv.includes("--" + name);

if (opt("compare")) {
    const ref = opt("compare");
    const ticks = opt("ticks");
    const only = opt("scenario");
    const extra = [...(ticks ? ["--ticks", ticks] : []), ...(only ? ["--scenario", only] : [])];
    const run = (args) => {
        const out = join(tools, "perf-load", `result-${Math.random().toString(36).slice(2)}.json`);
        mkdirSync(join(tools, "perf-load"), { recursive: true });
        const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), ...args, ...extra, "--json", out, "--quiet"], { stdio: "inherit" });
        if (r.status !== 0) process.exit(r.status ?? 1);
        return JSON.parse(readFileSync(out, "utf8"));
    };
    const before = run(["--ref", ref]);
    const after = run([]);
    printCompare(ref, before, after);
    process.exit(0);
}

/* ------------------------------------------------------- load the bot */

const ref = opt("ref");
const { work, mc, load } = await loadScripts({ ref });
const { Bot } = await load("runtime/bot.js");

/* -------------------------------------------- optional method profiler */

// --profile wraps every class method in scripts/ and attributes native calls
// (exclusive and inclusive) to the method that made them.
const PROFILE = new Map();
const TRACE = Number(opt("trace", 0));
if (flag("profile")) {
    const stack = [];
    for (const dir of ["runtime", "core"]) {
        for (const f of readdirSync(join(work, "scripts", dir)).filter((n) => n.endsWith(".js"))) {
            const mod = await import(pathToFileURL(join(work, "scripts", dir, f)).href);
            for (const [ename, cls] of Object.entries(mod)) {
                if (typeof cls !== "function" || !cls.prototype) continue;
                for (const name of Object.getOwnPropertyNames(cls.prototype)) {
                    if (name === "constructor") continue;
                    const d = Object.getOwnPropertyDescriptor(cls.prototype, name);
                    if (!d || typeof d.value !== "function") continue;
                    const orig = d.value, label = `${ename}.${name}`;
                    cls.prototype[name] = function (...args) {
                        const frame = { child: 0 };
                        stack.push(frame);
                        const n0 = mc.totalNative();
                        try { return orig.apply(this, args); }
                        finally {
                            stack.pop();
                            const incl = mc.totalNative() - n0;
                            const r = PROFILE.get(label) ?? { calls: 0, incl: 0, excl: 0 };
                            r.calls++; r.incl += incl; r.excl += incl - frame.child;
                            PROFILE.set(label, r);
                            if (stack.length) stack[stack.length - 1].child += incl;
                        }
                    };
                }
            }
        }
    }
}

/* ------------------------------------------------------------ helpers */

function mulberry32(a) {
    return () => {
        a |= 0; a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
const ground = (x, z, near) => mc.groundY(Math.floor(x), Math.floor(z), near ?? mc.heightAt(Math.floor(x), Math.floor(z)) + 1);
function dryColumn(x0, z0) {
    for (let r = 0; r < 64; r++)
        for (let dx = -r; dx <= r; dx++)
            for (const dz of [-r, r]) {
                const x = x0 + dx, z = z0 + dz;
                if (mc.heightAt(x, z) > mc.SEA + 1 && mc.typeAt(x, mc.heightAt(x, z) + 1, z) !== "minecraft:oak_log") return { x, z };
            }
    return { x: x0, z: z0 };
}
function wetColumn(x0, z0) {
    for (let r = 0; r < 96; r++)
        for (let dx = -r; dx <= r; dx++)
            for (const dz of [-r, r]) {
                const x = x0 + dx, z = z0 + dz;
                if (mc.heightAt(x, z) < mc.SEA - 2) return { x, z };
            }
    return undefined;
}
const dist = (a, b) => Math.hypot(a._loc.x - b._loc.x, a._loc.y - b._loc.y, a._loc.z - b._loc.z);
const pct = (arr, p) => { if (!arr.length) return 0; const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
const sum = (arr) => arr.reduce((a, b) => a + b, 0);

/* ---------------------------------------------------------- scenarios */

const STARTER = [["minecraft:wooden_axe", 1], ["minecraft:wooden_pickaxe", 1], ["minecraft:bread", 8]];
const SCENARIOS = {
    "follow-walk": {
        about: "owner walks away in a straight line at walking speed; follow mode",
        setup(w) { w.bot.setMode("follow"); },
        owner(w, t) { if (t > 20) walkOwner(w.owner, 0.2, 0); },
        metric: followMetric,
    },
    "follow-far": {
        about: "owner jumps 120 blocks away at t=20 and waits; follow mode",
        setup(w) { w.bot.setMode("follow"); },
        owner(w, t) { if (t === 20) { const c = dryColumn(Math.floor(w.owner._loc.x) + 120, Math.floor(w.owner._loc.z) + 10); w.owner._loc = { x: c.x + 0.5, y: ground(c.x, c.z), z: c.z + 0.5 }; } },
        metric: followMetric,
    },
    "follow-near": {
        about: "owner strolls in a small circle around the bot; follow mode",
        setup(w) { w.bot.setMode("follow"); w.cx = w.owner._loc.x; w.cz = w.owner._loc.z; },
        owner(w, t) {
            const a = t / 120, x = w.cx + Math.cos(a) * 6, z = w.cz + Math.sin(a) * 6;
            const y = ground(x, z, Math.floor(w.owner._loc.y));
            if (y !== undefined) w.owner._loc = { x, y, z };
        },
        metric: followMetric,
    },
    "follow-tower": {
        about: "owner stands on a 20-block pillar right next to the bot; follow mode",
        setup(w) {
            const bx = Math.floor(w.sim._loc.x) + 3, bz = Math.floor(w.sim._loc.z), base = mc.heightAt(bx, bz);
            for (let y = base + 1; y <= base + 20; y++) mc.setType(bx, y, bz, "minecraft:stone");
            w.owner._loc = { x: bx + 0.5, y: base + 21, z: bz + 0.5 };
            w.sim._inv.give("minecraft:cobblestone", 64);
            w.bot.setMode("follow");
        },
        owner() { },
        metric: followMetric,
    },
    idle: {
        about: "idle (active guarding) with the owner standing nearby",
        setup(w) { w.bot.setMode("idle"); },
        owner() { },
        metric: (w) => ({ moved: +w.sim.moved.toFixed(1) }),
    },
    "mine-logs": {
        about: "!bot mine oak_log 12 near spawn",
        setup(w) { w.start = logCount(w.sim); w.bot.startMine("minecraft:oak_log", 12); },
        owner() { },
        metric: (w) => ({ logsGained: logCount(w.sim) - w.start, broken: w.sim.broken }),
    },
    survival: {
        about: "!bot auto (survival autonomy, assisted crafting on)",
        setup(w) { w.bot.settings.assistedCrafting = true; w.bot.setMode("survival"); },
        owner() { },
        metric: (w) => ({ broken: w.sim.broken, placed: w.sim.placed, kinds: new Set(w.sim._inv._s.filter(Boolean).map((s) => s._t)).size }),
    },
    night: {
        about: "idle at night (camp/shelter logic) with the owner nearby",
        setup(w) { mc.state.time = 14000; w.bot.setMode("idle"); },
        owner() { },
        metric: (w) => ({ moved: +w.sim.moved.toFixed(1), broken: w.sim.broken, placed: w.sim.placed }),
    },
    speedrun: {
        about: "!bot speedrun (speedrun/nether/bucket directors, assisted crafting on)",
        setup(w) { w.bot.settings.assistedCrafting = true; w.bot.settings.speedrun = true; w.bot.setMode("speedrun"); },
        owner() { },
        metric: (w) => ({ broken: w.sim.broken, placed: w.sim.placed, kinds: new Set(w.sim._inv._s.filter(Boolean).map((s) => s._t)).size }),
    },
    respawn: {
        about: "bot dies at t=100 while following, respawns and carries on",
        setup(w) { w.bot.setMode("follow"); },
        owner(w, t) {
            if (t === 100) w.sim._hp = 0;
            if (t > 100 && t < 140) w.sim._hp = 0; // stays dead until the engine respawns it
            if (t > 200) walkOwner(w.owner, 0.1, 0);
        },
        metric: (w) => ({ ...followMetric(w), state: w.bot.state, hp: w.sim._hp }),
    },
    water: {
        about: "bot spawned in a pond, owner on dry land 16+ blocks away; follow mode",
        setup(w) {
            const c = wetColumn(Math.floor(w.sim._loc.x), Math.floor(w.sim._loc.z));
            if (c) w.sim._loc = { x: c.x + 0.5, y: mc.SEA, z: c.z + 0.5 };
            w.bot.setMode("follow");
        },
        owner() { },
        metric: (w) => ({ ...followMetric(w), inWaterAtEnd: w.sim.isInWater }),
    },
    threat: {
        about: "two zombies approach while following a nearby owner",
        setup(w) {
            w.bot.setMode("follow");
            for (const dx of [7, -8]) {
                const x = w.sim._loc.x + dx, z = w.sim._loc.z + 2;
                mc.state.entities.push(new mc.Entity("minecraft:zombie", { x, y: ground(x, z), z }, { families: ["monster", "zombie", "undead", "mob"] }));
            }
        },
        owner() { },
        mobs(w) {
            for (const e of mc.state.entities) {
                if (e._typeId !== "minecraft:zombie" || !e._valid) continue;
                const dx = w.sim._loc.x - e._loc.x, dz = w.sim._loc.z - e._loc.z, d = Math.hypot(dx, dz);
                if (d > 1.2) { e._loc.x += (dx / d) * 0.1; e._loc.z += (dz / d) * 0.1; const y = ground(e._loc.x, e._loc.z, Math.floor(e._loc.y)); if (y !== undefined) e._loc.y = y; }
                else if (mc.state.tick % 20 === 0) w.sim._hp = Math.max(1, w.sim._hp - 2);
            }
        },
        metric: (w) => ({ zombiesLeft: mc.state.entities.filter((e) => e._typeId === "minecraft:zombie" && e._valid).length, hp: w.sim._hp }),
    },
};
function walkOwner(o, vx, vz) {
    const x = o._loc.x + vx, z = o._loc.z + vz;
    const y = ground(x, z, Math.floor(o._loc.y));
    if (y !== undefined) o._loc = { x, y, z };
    else o._loc = { x, y: o._loc.y, z }; // owners can swim
}
function followMetric(w) {
    return { avgOwnerDist: +(sum(w.dists) / Math.max(1, w.dists.length)).toFixed(1), finalOwnerDist: +dist(w.sim, w.owner).toFixed(1), within8: +(w.dists.filter((d) => d <= 8).length / Math.max(1, w.dists.length)).toFixed(2) };
}
function logCount(sim) { return sim._inv._s.reduce((n, s) => n + (s && s._t === "minecraft:oak_log" ? s._a : 0), 0); }

/* ------------------------------------------------------------- runner */

function runScenario(name, spec, ticks) {
    mc.resetWorld();
    Math.random = mulberry32(1234);
    const spawn = dryColumn(0, 0);
    const sy = ground(spawn.x, spawn.z);
    const owner = new mc.Player("Owner", { x: spawn.x + 2.5, y: ground(spawn.x + 2, spawn.z) ?? sy, z: spawn.z + 0.5 });
    const sim = new mc.SimPlayer("Verdant", { x: spawn.x + 0.5, y: sy, z: spawn.z + 0.5 });
    mc.state.players.push(owner, sim);
    for (const [t, n] of STARTER) sim._inv.give(t, n);
    const warns = { n: 0, samples: new Map() };
    const realWarn = console.warn;
    console.warn = (...a) => { warns.n++; const m = String(a[0]).slice(0, 120); warns.samples.set(m, (warns.samples.get(m) ?? 0) + 1); };
    let bot;
    try {
        bot = new Bot(sim, "Owner", { relative: (p) => p }, null);
    } catch (e) { console.warn = realWarn; throw e; }
    let records = 0;
    const rec = bot.record.bind(bot);
    bot.record = (e) => { records++; rec(e); };
    const w = { bot, sim, owner, dists: [] };
    spec.setup(w);
    // --hook obj.method[,obj.method]: log each call's result (debugging aid)
    for (const h of (opt("hook", "") || "").split(",").filter(Boolean)) {
        const [objName, method] = h.split(".");
        const target = objName === "bot" ? bot : bot[objName];
        const orig = target?.[method];
        if (typeof orig !== "function") continue;
        target[method] = function (...a) { const r = orig.apply(this, a); if (flag("stacks")) { const st = (new Error().stack ?? "").split("\n").slice(2, 5).map((l) => l.trim().replace(/^at /, "").replace(/\(.*\/scripts\//, "(")).join(" < "); console.log(`  [t=${mc.state.tick}] ${h} from ${st}`); return r; } console.log(`  [t=${mc.state.tick}] ${h}(${a.map((x) => typeof x === "object" ? JSON.stringify(x)?.slice(0, 60) : x).join(", ")}) -> ${typeof r === "object" ? JSON.stringify(r)?.slice(0, 80) : r} y=${sim._loc.y.toFixed(2)} ground=${sim._ground}`); return r; };
    }
    const natives = [], ms = [], cats = Object.fromEntries(Object.keys(mc.N).map((k) => [k, 0]));
    const exp0 = bot.nav.expansions;
    const faults0 = faultCount(bot);
    let worstTick = { natives: 0, tick: 0 };
    for (let t = 1; t <= ticks; t++) {
        mc.advance();
        sim.physics();
        spec.owner(w, t);
        spec.mobs?.(w);
        mc.resetCounters();
        const t0 = performance.now();
        bot.tick();
        ms.push(performance.now() - t0);
        const n = mc.totalNative();
        natives.push(n);
        if (n > worstTick.natives) worstTick = { natives: n, tick: t, mode: bot.mode, state: bot.state, reason: String(bot.reason).slice(0, 70) };
        for (const k of Object.keys(mc.N)) cats[k] += mc.N[k];
        w.dists.push(dist(sim, owner));
        if (flag("heavy")) (w.heavy ??= []).push({ t, n, reason: String(bot.reason).slice(0, 60), arb: bot.arbiter?.current?.id });
        if (TRACE && t % TRACE === 0) {
            const L = sim._loc;
            console.log(`  [t=${t}] ${bot.mode}/${bot.state} pos ${L.x.toFixed(1)},${L.y.toFixed(1)},${L.z.toFixed(1)} water=${sim.isInWater} owner ${dist(sim, owner).toFixed(1)}b natives ${n} | ${String(bot.reason).slice(0, 90)}${flag("navtrace") ? ` || nav: ${bot.nav.reason} path=${bot.nav.path?.length ?? 0} wp=${bot.nav.waypoint} kind=${bot.nav.path?.[bot.nav.waypoint]?.kind} search=${bot.nav.search?.status ?? "-"} direct=${!!bot.nav.direct} ground=${sim._ground} vy=${sim._vy.toFixed(2)} move=${sim._move ? `${sim._move.x.toFixed(1)},${sim._move.y.toFixed(1)},${sim._move.z.toFixed(1)}` : "-"}` : ""}`);
        }
    }
    console.warn = realWarn;
    if (w.heavy) {
        const top = [...w.heavy].sort((a, b) => b.n - a.n).slice(0, 12);
        console.log(`  heaviest ticks: ${top.map((h) => `t${h.t}(${h.n}, mod20=${h.t % 20}, mod40=${h.t % 40}, mod60=${h.t % 60})`).join(" ")}`);
        const byMod = new Map();
        for (const h of w.heavy) { const k = h.t % 20; const r = byMod.get(k) ?? [0, 0]; r[0] += h.n; r[1]++; byMod.set(k, r); }
        console.log(`  avg natives by tick%20: ${[...byMod.entries()].sort((a, b) => a[0] - b[0]).map(([k, [sum, c]]) => `${k}:${Math.round(sum / c)}`).join(" ")}`);
    }
    const expansions = bot.nav.expansions - exp0;
    let profile;
    if (PROFILE.size) {
        const sortKey = flag("incl") ? "incl" : "excl";
        profile = [...PROFILE.entries()].sort((a, b) => b[1][sortKey] - a[1][sortKey]).slice(0, flag("incl") ? 30 : 18)
            .map(([k, v]) => `${k}: excl ${(v.excl / ticks).toFixed(1)}/tick incl ${(v.incl / ticks).toFixed(1)}/tick calls ${v.calls}`);
        PROFILE.clear();
    }
    return {
        name, about: spec.about, ticks,
        nativesAvg: +(sum(natives) / ticks).toFixed(1),
        nativesP95: pct(natives, 0.95),
        nativesMax: Math.max(...natives),
        worstTick,
        byCategory: Object.fromEntries(Object.entries(cats).map(([k, v]) => [k, +(v / ticks).toFixed(1)]).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])),
        msAvg: +(sum(ms) / ticks).toFixed(3),
        msP95: +pct(ms, 0.95).toFixed(3),
        msMax: +Math.max(...ms).toFixed(2),
        expansions,
        expansionsPer60: +(expansions / ticks * 60).toFixed(0),
        warns: warns.n,
        warnTop: [...warns.samples.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3),
        faults: faultCount(bot) - faults0,
        records,
        stateLog: bot.state,
        behaviour: spec.metric(w),
        profile,
    };
}
function faultCount(bot) {
    let n = 0;
    for (const r of (bot.faults ?? new Map()).values()) n += r.n ?? 0;
    return n;
}

const only = opt("scenario");
const check = flag("check");
const ticks = Number(opt("ticks", check ? 200 : 1200));
const names = only ? only.split(",") : check ? ["follow-walk", "idle", "mine-logs", "water"] : Object.keys(SCENARIOS);
const results = [];
for (const name of names) {
    const spec = SCENARIOS[name];
    if (!spec) { console.error(`unknown scenario ${name}; known: ${Object.keys(SCENARIOS).join(", ")}`); process.exit(2); }
    results.push(runScenario(name, spec, ticks));
}

const out = opt("json");
if (out) writeFileSync(out, JSON.stringify({ ref: ref ?? "worktree", results }, null, 2));
if (!flag("quiet")) printResults(ref ?? "working tree", results);

if (check) {
    // Smoke gate: the profiler must run and the bot must stay inside sane
    // per-tick budgets. Thresholds are generous - this guards against a lag
    // regression of the order of magnitude this tool was written to remove.
    let bad = 0;
    for (const r of results) {
        const limit = 400;
        if (r.nativesAvg > limit) { bad++; console.log(`perf check FAIL: ${r.name} averages ${r.nativesAvg} native calls/tick (limit ${limit})`); }
        if (r.faults > r.ticks / 4) { bad++; console.log(`perf check FAIL: ${r.name} raised ${r.faults} faults in ${r.ticks} ticks`); }
        if (r.warns > r.ticks / 4) { bad++; console.log(`perf check FAIL: ${r.name} printed ${r.warns} console warnings in ${r.ticks} ticks`); }
    }
    console.log(bad ? `perf check: ${bad} problem(s)` : "perf check: ok");
    process.exit(bad ? 1 : 0);
}

/* ------------------------------------------------------------ output */

function printResults(label, rs) {
    console.log(`\nVerdant perf profile (${label}) - native engine calls per bot tick, A* work, log spam`);
    for (const r of rs) {
        console.log(`\n# ${r.name}: ${r.about} [${r.ticks} ticks]`);
        console.log(`  native calls/tick  avg ${r.nativesAvg}  p95 ${r.nativesP95}  max ${r.nativesMax} (t=${r.worstTick.tick} ${r.worstTick.mode}/${r.worstTick.state}: ${r.worstTick.reason})`);
        console.log(`  by category        ${Object.entries(r.byCategory).map(([k, v]) => `${k} ${v}`).join(", ")}`);
        console.log(`  A* expansions      ${r.expansions} total, ${r.expansionsPer60} per 60 ticks`);
        console.log(`  node ms/tick       avg ${r.msAvg}  p95 ${r.msP95}  max ${r.msMax}`);
        console.log(`  console.warn ${r.warns}, faults ${r.faults}, journal records ${r.records}`);
        if (r.warnTop.length) console.log(`  top warnings       ${r.warnTop.map(([m, n]) => `${n}x ${m}`).join(" | ")}`);
        console.log(`  behaviour          ${JSON.stringify(r.behaviour)}`);
        if (r.profile) for (const line of r.profile) console.log(`    ${line}`);
    }
}
function printCompare(refLabel, before, after) {
    const pctChange = (a, b) => (a === 0 ? (b === 0 ? "  0%" : " new") : `${b <= a ? "-" : "+"}${Math.abs(Math.round((b - a) / a * 100))}%`);
    console.log(`\nBefore (${refLabel}) vs after (working tree)`);
    const rows = [["scenario", "natives/tick", "p95", "max", "A*/60t", "warns", "faults", "records", "ms/tick"]];
    for (const b of before.results) {
        const a = after.results.find((r) => r.name === b.name);
        if (!a) continue;
        rows.push([b.name,
            `${b.nativesAvg} -> ${a.nativesAvg} (${pctChange(b.nativesAvg, a.nativesAvg)})`,
            `${b.nativesP95} -> ${a.nativesP95}`,
            `${b.nativesMax} -> ${a.nativesMax}`,
            `${b.expansionsPer60} -> ${a.expansionsPer60}`,
            `${b.warns} -> ${a.warns}`,
            `${b.faults} -> ${a.faults}`,
            `${b.records} -> ${a.records}`,
            `${b.msAvg} -> ${a.msAvg}`]);
    }
    const widths = rows[0].map((_, i) => Math.max(...rows.map((r) => String(r[i]).length)));
    for (const r of rows) console.log(r.map((c, i) => String(c).padEnd(widths[i])).join("  "));
    console.log("\nBehaviour (before -> after)");
    for (const b of before.results) {
        const a = after.results.find((r) => r.name === b.name);
        if (a) console.log(`  ${b.name.padEnd(13)} ${JSON.stringify(b.behaviour)} -> ${JSON.stringify(a.behaviour)}`);
    }
}
