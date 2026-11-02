// Engine API surface, distilled from the typings of the version this manifest
// targets: @minecraft/server 2.3.0-beta and @minecraft/server-gametest 1.0.0-beta
// on engine 1.21.114 (manifest min_engine_version).
//
// Why this exists: the pack can only be exercised in-game, and a single wrong
// member name - `sim.isSprinting` fine, `sim.isSprint` not; an enum member that
// does not exist in this API version; a component id that is spelled
// differently - is a silent no-op inside a try/catch or a crash at the exact
// moment the bot needs it. The gates in gates.mjs check the pack against
// itself; this file lets them check the pack against the engine.
//
//   node tools/api.mjs build <server.d.ts> <gametest.d.ts>   # regenerate the JSON
//   node tools/api.mjs stats                                 # what is on record
//
// The JSON is committed so the gate is hermetic (no network, no node_modules).
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const OUT = fileURLToPath(new URL("api-surface.json", import.meta.url));

/** Split a .d.ts into its exported declarations. */
function declarations(src) {
    const out = [];
    const re = /^export\s+(?:declare\s+)?(class|interface|enum|function|const|let)\s+([A-Za-z_$][\w$]*)/gm;
    let m;
    while ((m = re.exec(src)))
        out.push({ kind: m[1], name: m[2], start: m.index, head: m[0] });
    for (let i = 0; i < out.length; i++)
        out[i].end = i + 1 < out.length ? out[i + 1].start : src.length;
    return out;
}

/** Base class name from the declaration line (bare or module-qualified). */
function baseOf(head, src, at) {
    const lineEnd = src.indexOf("\n", at);
    const line = head + src.slice(at + head.length, lineEnd === -1 ? src.length : lineEnd);
    const m = /extends\s+([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?)/.exec(line);
    return m ? m[1].split(".").pop() : undefined;
}

/** Member names declared directly in a class/interface body. */
function membersOf(body) {
    const names = new Set();
    for (const m of body.matchAll(/^\s{4}(?:static\s+)?(?:readonly\s+)?(?:get\s+|set\s+)?([A-Za-z_$][\w$]*)\s*(?:<[^>]*>)?\s*[(:]/gm))
        names.add(m[1]);
    return [...names].sort();
}

function enumMembers(body) {
    const members = {};
    for (const m of body.matchAll(/^\s{4}([A-Za-z_$][\w$]*)\s*=\s*(('[^']*')|("[^"]*")|([-\w.]+))/gm))
        members[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
    return members;
}

function buildModule(src) {
    const classes = {};
    const enums = {};
    const functions = [];
    const constants = [];
    for (const d of declarations(src)) {
        if (d.kind === "class" || d.kind === "interface") {
            const body = src.slice(d.start, d.end);
            const rec = classes[d.name] ?? { members: [], extends: undefined };
            rec.members = [...new Set([...rec.members, ...membersOf(body)])].sort();
            const base = baseOf(d.head, src, d.start);
            if (base)
                rec.extends = base;
            classes[d.name] = rec;
        }
        else if (d.kind === "enum") {
            enums[d.name] = { ...(enums[d.name] ?? {}), ...enumMembers(src.slice(d.start, d.end)) };
        }
        else if (d.kind === "function")
            functions.push(d.name);
        else
            constants.push(d.name);
    }
    return { classes, enums, functions: functions.sort(), constants: constants.sort() };
}

/** Component ids the engine answers to: every minecraft:* enum value. */
function componentIds(modules) {
    const ids = new Set();
    for (const mod of Object.values(modules))
        for (const values of Object.values(mod.enums))
            for (const value of Object.values(values))
                if (typeof value === "string" && /^minecraft:/.test(value))
                    ids.add(value);
    return [...ids].sort();
}

export function load() {
    return JSON.parse(readFileSync(OUT, "utf8"));
}

/** Every member of `name`, own plus inherited, across both modules. */
export function members(surface, name, seen = new Set()) {
    if (!name || seen.has(name))
        return [];
    seen.add(name);
    for (const mod of Object.values(surface.modules)) {
        const rec = mod.classes[name];
        if (!rec)
            continue;
        return [...new Set([...rec.members, ...members(surface, rec.extends, seen)])].sort();
    }
    return [];
}

export function enumMembersOf(surface, name) {
    for (const mod of Object.values(surface.modules)) {
        if (mod.enums[name])
            return mod.enums[name];
    }
    return undefined;
}

export function hasClass(surface, name) {
    return Object.values(surface.modules).some((m) => !!m.classes[name]);
}

if (process.argv[1] && process.argv[1].endsWith("api.mjs")) {
    const [, , mode, serverDts, gametestDts] = process.argv;
    if (mode === "build") {
        if (!serverDts || !gametestDts) {
            console.error("usage: node tools/api.mjs build <server.d.ts> <gametest.d.ts>");
            process.exit(2);
        }
        const modules = {
            "@minecraft/server": buildModule(readFileSync(serverDts, "utf8")),
            "@minecraft/server-gametest": buildModule(readFileSync(gametestDts, "utf8")),
        };
        const surface = {
            source: "@minecraft/server 2.3.0-beta + @minecraft/server-gametest 1.0.0-beta (engine 1.21.114)",
            modules,
            components: componentIds(modules),
        };
        writeFileSync(OUT, JSON.stringify(surface));
        console.log(`api-surface.json written: ${Object.values(modules).reduce((n, m) => n + Object.keys(m.classes).length, 0)} classes, ` +
            `${Object.values(modules).reduce((n, m) => n + Object.keys(m.enums).length, 0)} enums, ${surface.components.length} component ids`);
    }
    else if (mode === "stats") {
        const surface = load();
        console.log(`source: ${surface.source}`);
        for (const [name, mod] of Object.entries(surface.modules))
            console.log(`  ${name}: ${Object.keys(mod.classes).length} classes, ${Object.keys(mod.enums).length} enums, ${mod.functions.length} functions`);
        console.log(`  SimulatedPlayer: ${members(surface, "SimulatedPlayer").length} members (own + inherited)`);
        console.log(`  component ids: ${surface.components.length}`);
    }
    else {
        console.error("usage: node tools/api.mjs <build|stats>");
        process.exit(2);
    }
}
