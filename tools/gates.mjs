// Verification gates for this pack, one entry point per check:
//
//   node tools/gates.mjs parse   [scripts]              module-goal syntax, file by file
//   node tools/gates.mjs link    [tools/load/scripts]   ESM link + evaluate against the @minecraft stubs
//   node tools/gates.mjs undef   [scripts]              calls to names never imported + this.<field> typos
//   node tools/gates.mjs imports [scripts]              imports that point at files that do not exist
//   node tools/gates.mjs components [scripts]           component member calls that resolve to nothing
//   node tools/gates.mjs sim [scripts]                  raw avatar control outside scripts/sim
//   node tools/gates.mjs api [scripts]                  engine members/enums/component ids vs the target API version
//   node tools/gates.mjs scope [scripts]                engine work at module scope, before the world is loaded
//
// Each mode exits 0 when clean and 1 on findings (2 on a usage error), so
// run-all.mjs can fail the run on any gate. The checks used to live in four
// near-identical scripts that each re-implemented "walk a scripts tree"; the
// checking logic below is unchanged - only the scaffolding is shared.
//
// parse: `node --check` does NOT always parse in module goal, yet Bedrock
// parses every pack file that way, so one bad line can silently kill the whole
// pack in-game. Each file is copied to .mjs first to force module-goal parsing.
//
// link: Node's real ESM linker is what catches a missing named export, an
// import cycle TDZ error or a top-level throw - the failures that kill the pack
// without a single log line.
//
// undef: the exact class of bug that shipped in 0.8.7 (bot.js called
// horizontal() without importing it) and 0.8.8 (this.scan.next() on a field
// never assigned).
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { enumMembersOf, load, members } from "./api.mjs";

/** Replace strings and comments with inert placeholders of equal shape. */
function strip(src) {
    let out = "";
    let i = 0;
    const n = src.length;
    while (i < n) {
        const c = src[i];
        if (c === "/" && src[i + 1] === "/") {
            const start = i;
            while (i < n && src[i] !== "\n") i++;
            // Keep the exemption marker visible to the member-scope check.
            if (/undef-ok/.test(src.slice(start, i)))
                out += " undef-ok";
            continue;
        }
        if (c === "/" && src[i + 1] === "*") {
            const start = i;
            i += 2;
            while (i < n && !(src[i] === "*" && src[i + 1] === "/")) {
                if (src[i] === "\n")
                    out += "\n"; // keep line numbers aligned
                i++;
            }
            if (/undef-ok/.test(src.slice(start, i)))
                out += " undef-ok";
            i += 2;
            continue;
        }
        // Regex literal: avoid treating /.../.test as division + name
        if (c === "/" && !/[A-Za-z0-9_$)]/.test(out.trimEnd().slice(-1))) {
            let j = i + 1;
            let esc = false;
            let inClass = false;
            while (j < n) {
                const ch = src[j];
                if (!esc) {
                    if (ch === "[" ) inClass = true;
                    else if (ch === "]") inClass = false;
                    else if (ch === "/" && !inClass) break;
                    else if (ch === "\n") break;
                }
                esc = !esc && ch === "\\";
                if (ch !== "\\") esc = ch === "\\" ? !esc : false;
                // simpler escape tracking
                if (src[j] === "\\") { j++; if (j < n) j++; continue; }
                j++;
            }
            if (j < n && src[j] === "/") {
                // consume flags
                j++;
                while (j < n && /[gimsuy]/.test(src[j])) j++;
                out += '""';
                i = j;
                continue;
            }
        }
        if (c === '"' || c === "'") {
            i++;
            while (i < n && src[i] !== c) {
                if (src[i] === "\\") i++;
                i++;
            }
            i++;
            out += '""';
            continue;
        }
        if (c === "`") {
            i++;
            let depth = 0;
            while (i < n) {
                if (src[i] === "\\") { i += 2; continue; }
                if (src[i] === "$" && src[i + 1] === "{") { depth++; i += 2; continue; }
                if (depth > 0 && src[i] === "}") { depth--; i++; continue; }
                if (depth === 0 && src[i] === "`") break;
                i++;
            }
            i++;
            out += '""';
            continue;
        }
        out += c;
        i++;
    }
    return out;
}

function undefGate(root) {
    const BUILTINS = new Set([
        "Math", "JSON", "console", "Object", "Array", "String", "Number", "Boolean",
        "Map", "Set", "WeakMap", "WeakSet", "Promise", "Error", "TypeError",
        "RangeError", "ReferenceError", "SyntaxError", "Date", "RegExp", "Symbol",
        "BigInt", "parseInt", "parseFloat", "isNaN", "isFinite", "Infinity", "NaN",
        "undefined", "globalThis", "structuredClone",
        // syntax keywords that can be followed by "("
        "if", "else", "for", "while", "do", "switch", "case", "catch", "return",
        "typeof", "new", "delete", "void", "in", "of", "instanceof", "function",
        "class", "extends", "super", "this", "throw", "await", "async", "yield",
        "try", "finally", "break", "continue", "const", "let", "var", "default",
        "import", "export", "from", "as", "static", "get", "set",
    ]);



    function addIdentifiers(set, chunk) {
        for (const name of chunk.split(/[^A-Za-z0-9_$]+/)) {
            if (/^[A-Za-z_$][\w$]*$/.test(name)) set.add(name);
        }
    }

    function collect(file, src) {
        const defined = new Set();
        // import { a, b as c } from "..."
        for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from/g))
            for (const part of m[1].split(",")) {
                const name = part.trim().split(/\s+as\s+/).pop().trim();
                if (/^[A-Za-z_$][\w$]*$/.test(name)) defined.add(name);
            }
        // import def from / import * as ns from
        for (const m of src.matchAll(/import\s+([A-Za-z_$][\w$]*)\s*(?:,|from)/g))
            defined.add(m[1]);
        for (const m of src.matchAll(/import\s*\*\s*as\s+([A-Za-z_$][\w$]*)/g))
            defined.add(m[1]);
        // declarations
        for (const m of src.matchAll(/(?:^|[^\w$.])function\s*\*?\s*([A-Za-z_$][\w$]*)/g))
            defined.add(m[1]);
        for (const m of src.matchAll(/(?:^|[^\w$.])class\s+([A-Za-z_$][\w$]*)/g))
            defined.add(m[1]);
        for (const m of src.matchAll(/(?:^|[^\w$.])(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g))
            defined.add(m[1]);
        for (const m of src.matchAll(/(?:const|let|var)\s*\{([^}]*)\}\s*=/g))
            addIdentifiers(defined, m[1].replace(/:/g, ","));
        for (const m of src.matchAll(/(?:const|let|var)\s*\[([^\]]*)\]\s*=/g))
            addIdentifiers(defined, m[1]);
        for (const m of src.matchAll(/,\s*([A-Za-z_$][\w$]*)\s*=/g))
            defined.add(m[1]);
        // parameters: function(...) / (...) => / single-arg arrow / methods
        for (const m of src.matchAll(/function\s*\w*\s*\(([^)]*)\)/g))
            addIdentifiers(defined, m[1]);
        for (const m of src.matchAll(/\(([^()]*)\)\s*=>/g))
            addIdentifiers(defined, m[1]);
        for (const m of src.matchAll(/(?:^|[^\w$.])([A-Za-z_$][\w$]*)\s*=>/g))
            defined.add(m[1]);
        // method definitions: name(...) {  /  get name() {  /  async name(...) {
        for (const m of src.matchAll(/(?:^|[;{}(,]|\\n)\s*(?:async\s+|get\s+|set\s+|static\s+)*([A-Za-z_$][\w$]*)\s*\(([^)]*)\)\s*\{/g)) {
            defined.add(m[1]);
            addIdentifiers(defined, m[2]);
        }
        // for (const x of y) / for (x of y) / for (x in y)
        for (const m of src.matchAll(/for\s*\(\s*(?:const|let|var)\s*([A-Za-z_$][\w$]*)\s+(?:of|in)\s/g))
            defined.add(m[1]);
        // for (const [a, b] of y) / for (const {a, b} of y)
        for (const m of src.matchAll(/for\s*\(\s*(?:const|let|var)\s*[\[{]([^\]}]*)[\]}]\s+(?:of|in)\s/g))
            addIdentifiers(defined, m[1].replace(/:/g, ","));
        // catch (e)
        for (const m of src.matchAll(/catch\s*\(\s*([A-Za-z_$][\w$]*)/g))
            defined.add(m[1]);

        const findings = [];
        // Bare identifier used as a receiver (`world.getTimeOfDay()`): it must be
        // imported, declared or a JS global, or the line throws a ReferenceError
        // the moment it runs.
        for (const m of src.matchAll(/(?<![\w$.])([A-Za-z_$][\w$]*)\s*\.\s*[A-Za-z_$]/g)) {
            const name = m[1];
            if (defined.has(name) || BUILTINS.has(name))
                continue;
            const lineStart = src.lastIndexOf("\n", m.index) + 1;
            let lineEnd = src.indexOf("\n", m.index);
            if (lineEnd === -1) lineEnd = src.length;
            const line = src.slice(lineStart, lineEnd);
            if (/undef-ok/.test(line))
                continue;
            findings.push({
                line: src.slice(0, m.index).split("\n").length,
                name,
                text: line.trim().slice(0, 100),
            });
        }
        for (const m of src.matchAll(/(?<![\w$.])([A-Za-z_$][\w$]*)\s*\(/g)) {
            const name = m[1];
            if (defined.has(name) || BUILTINS.has(name)) continue;
            const lineStart = src.lastIndexOf("\n", m.index) + 1;
            let lineEnd = src.indexOf("\n", m.index);
            if (lineEnd === -1) lineEnd = src.length;
            const line = src.slice(lineStart, lineEnd);
            // Skip definitions that look like "name(args) {" on their own line.
            const defRe = new RegExp(`^\\s*(?:async\\s+|get\\s+|set\\s+|static\\s+)*${name}\\s*\\(.*\\)\\s*\\{\\s*$`);
            if (defRe.test(line)) continue;
            findings.push({
                line: src.slice(0, m.index).split("\n").length,
                name,
                text: line.trim().slice(0, 100),
            });
        }
        return findings;
    }

    /**
     * Member-scope check: every `this.<name>` read must correspond to a name that
     * is assigned somewhere in the file (`this.name = ...`) or defined on the
     * class body as a method/accessor/field. This is the exact shape of the 0.8.8
     * regression: `this.scan.next(...)` — `this.scan` was never assigned anywhere,
     * so the bot threw "cannot read property 'next' of undefined" the moment it
     * looked for a mining target. Bare-name checks cannot see member typos.
     */
    function memberDangers(src) {
        const assigned = new Set();
        for (const m of src.matchAll(/this\.([A-Za-z_$][\w$]*)\s*(?:\?\?=|\|\|=|&&=|[-+*/%|&^]?=(?![=>]))/g))
            assigned.add(m[1]);
        const defined = new Set();
        const KEYWORDS = new Set(["if", "for", "while", "switch", "catch", "return",
            "function", "else", "do", "new", "typeof", "await", "yield", "constructor"]);
        for (const m of src.matchAll(/^\s+(?:static\s+|async\s+|\*\s*)*(?:get\s+|set\s+)?([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/gm))
            if (!KEYWORDS.has(m[1]))
                defined.add(m[1]);
        for (const m of src.matchAll(/^\s+(?:static\s+)?([A-Za-z_$][\w$]*)\s*=/gm))
            defined.add(m[1]);
        const findings = [];
        const seen = new Set();
        for (const m of src.matchAll(/this\.([A-Za-z_$][\w$]*)/g)) {
            const name = m[1];
            if (assigned.has(name) || defined.has(name) || seen.has(name))
                continue;
            const lineStart = src.lastIndexOf("\n", m.index) + 1;
            let lineEnd = src.indexOf("\n", m.index);
            if (lineEnd === -1) lineEnd = src.length;
            const prevStart = lineStart > 0 ? src.lastIndexOf("\n", lineStart - 2) + 1 : 0;
            const around = src.slice(prevStart, lineEnd);
            if (/undef-ok/.test(around))
                continue;
            seen.add(name);
            findings.push({
                line: src.slice(0, m.index).split("\n").length,
                name,
                text: src.slice(lineStart, lineEnd).trim().slice(0, 100),
            });
        }
        return findings;
    }

    function walk(dir, out = []) {
        for (const entry of readdirSync(dir)) {
            const p = join(dir, entry);
            if (statSync(p).isDirectory()) walk(p, out);
            else if (p.endsWith(".js") || p.endsWith(".mjs")) out.push(p);
        }
        return out;
    }

    let bad = 0;
    let files = 0;
    for (const file of walk(root)) {
        files++;
        let src;
        try {
            src = strip(readFileSync(file, "utf8"));
        }
        catch (e) {
            console.error(`undef: cannot read ${file}: ${e}`);
            bad++;
            continue;
        }
        for (const f of collect(file, src)) {
            bad++;
            console.error(`${relative(root, file)}:${f.line}: call to undefined name '${f.name}'  |  ${f.text}`);
        }
        for (const f of memberDangers(src)) {
            bad++;
            console.error(`${relative(root, file)}:${f.line}: this.${f.name} is never assigned or defined in this file  |  ${f.text}`);
        }
    }
    if (bad) {
        console.error(`\nundef: FAIL - ${bad} undefined call(s) across ${files} files`);
        return 1;
    }
    console.log(`undef: OK - no undefined calls across ${files} files`);
    return 0;

}

async function parseGate(root) {
    const out = fileURLToPath(new URL("parse-out/", import.meta.url));
    rmSync(out, { recursive: true, force: true });
    mkdirSync(out, { recursive: true });
    const files = [];
    (function walk(d) {
        for (const e of readdirSync(d)) {
            const p = join(d, e);
            if (statSync(p).isDirectory())
                walk(p);
            else if (p.endsWith(".js"))
                files.push(p);
        }
    })(root);
    let bad = 0;
    let i = 0;
    for (const f of files) {
        const dest = join(out, `${i++}-${basename(f)}.mjs`);
        copyFileSync(f, dest);
        const r = spawnSync(process.execPath, ["--check", dest], { encoding: "utf8" });
        if (r.status !== 0) {
            bad++;
            console.error(`SYNTAX FAIL: ${f}`);
            console.error((r.stderr ?? "").trim().split("\n").slice(0, 6).join("\n"));
        }
    }
    console.log(`${files.length} files module-goal parsed, ${bad} bad`);
    return bad ? 1 : 0;

}

async function linkGate(root) {
    const files = [];
    (function walk(d) {
        for (const e of readdirSync(d)) {
            const p = join(d, e);
            if (statSync(p).isDirectory())
                walk(p);
            else if (p.endsWith(".js"))
                files.push(p);
        }
    })(root);
    let bad = 0;
    for (const f of files) {
        try {
            await import(pathToFileURL(f).href);
        }
        catch (e) {
            bad++;
            const short = String(e && e.stack ? e.stack : e)
                .split("\n")
                .filter((l) => l.trim())
                .slice(0, 6)
                .join("\n  ");
            console.error("LOAD FAIL: " + f + "\n  " + short);
        }
    }
    console.log(files.length + " modules loaded, " + bad + " failed");
    return bad ? 1 : 0;

}

function importsGate(root) {
    const files = [];
    (function walk(d) {
      for (const e of readdirSync(d)) {
        const p = join(d, e);
        if (statSync(p).isDirectory()) walk(p);
        else if (p.endsWith(".js")) files.push(p);
      }
    })(root);
    let bad = 0;
    for (const f of files) {
      const text = readFileSync(f, "utf8");
      for (const m of text.matchAll(/from\s+["']([^"']+)["']/g)) {
        const spec = m[1];
        if (!spec.startsWith(".")) continue;
        const target = resolve(dirname(f), spec);
        if (!existsSync(target)) { console.log("MISSING: " + spec + " imported by " + f); bad++; }
      }
    }
    console.log(files.length + " files scanned, " + bad + " missing imports");
    return bad ? 1 : 0;

}



/**
 * Component-method gate: every `<this|bot|b>.<component>.<method>(` call - and
 * every `host.<method>(` / `memory.<method>(` call in main.js - must resolve to
 * a member that component's class actually defines.
 *
 * Member calls are invisible to the no-undef gate (it only looks at bare call
 * names), so this is the class of regression a method-hoisting refactor can
 * introduce silently: moving `escaper.findBoat()` to a free `findBoat(sim)`
 * left one live caller behind and nothing in the suite noticed.
 */
const COMPONENTS = {
    // instance field -> the file that defines the class, relative to scripts/
    escaper: "runtime/escape.js", escape: "runtime/escape.js",
    builder: "runtime/builder.js", hands: "runtime/builder.js",
    terrain: "runtime/world.js",
    bag: "runtime/inventory.js", resource: "runtime/inventory.js",
    nav: "runtime/navigation.js",
    avatar: "sim/avatar.js",
    combat: "runtime/combat.js", equipment: "runtime/equipment.js", furnace: "runtime/equipment.js",
    awareness: "runtime/world-awareness.js",
    looting: "runtime/looting.js", drops: "runtime/looting.js",
    miner: "runtime/mining.js", deepMiner: "runtime/mining.js",
    survivalMaster: "runtime/survival-master.js",
    speedrun: "runtime/speedrun.js", nether: "runtime/nether.js", bucket: "runtime/nether.js",
    village: "runtime/village.js", golem: "runtime/village.js",
    food: "runtime/survival.js", autonomy: "runtime/survival.js", forager: "runtime/survival.js",
    scout: "runtime/scouting.js",
    memory: "runtime/memory.js", host: "runtime/host.js", ui: "runtime/ui.js",
};
/** Instances held directly in main.js rather than reached through the bot. */
const DIRECT = { host: "runtime/host.js", memory: "runtime/memory.js" };
/** Engine objects, plain arrays/fields and locals - not one of our components. */
const NOT_COMPONENTS = new Set(["sim", "player", "owner", "dimension", "world", "system", "structures", "explorer", "arbiter", "scan", "cache", "p"]);
/** Built-in methods: a component field holding an array/Map/String can still be called through. */
const BUILTIN_METHODS = new Set(["slice", "filter", "find", "findIndex", "map", "forEach", "sort", "push", "pop", "shift", "unshift", "splice", "includes", "indexOf", "join", "keys", "values", "entries", "has", "get", "set", "add", "delete", "some", "every", "reduce", "concat", "replace", "split", "trim", "startsWith", "endsWith", "toLowerCase", "toUpperCase", "toFixed", "toString", "flat", "flatMap", "reverse", "fill", "test"]);

const membersOfComponent = (root, file) => {
    const src = readFileSync(join(root, file), "utf8");
    return new Set([
        ...[...src.matchAll(/^ {4}(?:get\s+|set\s+|async\s+|static\s+|\*\s*)*([A-Za-z_$][\w$]*)\s*\(/gm)].map((m) => m[1]),
        ...[...src.matchAll(/this\.([A-Za-z_$][\w$]*)\s*=/g)].map((m) => m[1]),
    ]);
};

function collectJs(dir, out = []) {
    for (const entry of readdirSync(dir)) {
        const p = join(dir, entry);
        if (statSync(p).isDirectory())
            collectJs(p, out);
        else if (p.endsWith(".js"))
            out.push(p);
    }
    return out;
}

function componentGate(dir) {
    const root = dir;
    const cache = new Map();
    const members = (comp) => {
        if (!cache.has(comp))
            cache.set(comp, membersOfComponent(root, COMPONENTS[comp] ?? DIRECT[comp]));
        return cache.get(comp);
    };
    const check = (src, file, comp, method, index) => {
        if (NOT_COMPONENTS.has(comp) || BUILTIN_METHODS.has(method) || !(COMPONENTS[comp] ?? DIRECT[comp]))
            return 0;
        if (members(comp).has(method))
            return 0;
        const line = src.slice(0, index).split("\n").length;
        console.error(`${relative(dir, file)}:${line}: ${comp}.${method}() is not defined on ${COMPONENTS[comp] ?? DIRECT[comp]}`);
        return 1;
    };
    let bad = 0;
    let files = 0;
    for (const file of collectJs(dir)) {
        files++;
        const src = readFileSync(file, "utf8");
        for (const m of src.matchAll(/(?:this|bot|b)\.([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)\s*\(/g))
            bad += check(src, file, m[1], m[2], m.index);
        for (const m of src.matchAll(/(?<![\w.$])(host|memory)\.([A-Za-z_$][\w$]*)\s*\(/g))
            bad += check(src, file, m[1], m[2], m.index);
    }
    if (bad) {
        console.error(`\ncomponents: FAIL - ${bad} unresolved component call(s) across ${files} files`);
        return 1;
    }
    console.log(`components: OK - every component call resolves across ${files} files`);
    return 0;
}

/**
 * Avatar-boundary gate: only scripts/sim may drive the simulated player.
 *
 * Every bug class this pack has actually shipped came from a raw engine call
 * somewhere in a policy module: a positional argument that never went through
 * host.relative() (the camp bed passed a Cell object where a location belonged),
 * a swing re-issued every tick, navigation restarted while it was still
 * playing, `attackEntity() === false` read as "no target" when the documented
 * meaning is "on cooldown". None of those are visible to a syntax, import or
 * bare-name gate. So the rule is mechanical: ACTION methods may only be called
 * from the driver, and property WRITES may only happen there too.
 *
 * Reads (`sim.location`, `sim.isOnGround`, `sim.getComponent`, ...) are still
 * allowed from anywhere: they are idempotent, they cannot corrupt engine state,
 * and the count is printed so the remaining surface stays visible.
 *
 * Two exemptions, both single-purpose interfaces rather than policy:
 *   - runtime/inventory.js owns the inventory interface, which includes the
 *     selected hotbar slot (`selectedSlotIndex`);
 *   - main.js tears the avatar down for `!bot remove` (`disconnect()`).
 */
const AVATAR_ACTIONS = new Set([
    "attack", "attackEntity", "breakBlock", "chat", "disconnect", "dropSelectedItem",
    "fly", "giveItem", "glide", "interact", "interactWithBlock", "interactWithEntity",
    "jump", "lookAtBlock", "lookAtEntity", "lookAtLocation", "move", "moveRelative",
    "moveToBlock", "moveToLocation", "navigateToBlock", "navigateToEntity",
    "navigateToLocation", "navigateToLocations", "respawn", "rotateBody",
    "setBodyRotation", "setItem", "setSkin", "startBuild", "stopBreakingBlock",
    "stopBuild", "stopFlying", "stopGliding", "stopInteracting", "stopMoving",
    "stopSwimming", "stopUsingItem", "swim", "useItem", "useItemInSlot",
    "useItemInSlotOnBlock", "useItemOnBlock",
]);
const AVATAR_WRITES = new Set(["isSneaking", "isSprinting", "selectedSlotIndex"]);
/**
 * runtime/inventory.js owns the inventory interface, and that interface
 * includes the selected hotbar slot; the driver owns everything else.
 */
const SIM_EXEMPT = new Set(["sim/avatar.js", "runtime/inventory.js"]);

function simGate(dir) {
    let bad = 0;
    let reads = 0;
    let files = 0;
    for (const file of collectJs(dir)) {
        files++;
        const rel = relative(dir, file).split("\\").join("/");
        const exempt = SIM_EXEMPT.has(rel);
        const src = readFileSync(file, "utf8");
        // `<owner>.sim.<member>` OR a bare `sim.<member>` (a local alias).
        for (const m of src.matchAll(/(?<![\w$.])(?:([A-Za-z_$][\w$]*)\.)?sim\.([A-Za-z_$][\w$]*)(\s*\()?/g)) {
            const owner = m[1] ? `${m[1]}.` : "";
            const member = m[2];
            const isCall = !!m[3];
            const isWrite = AVATAR_WRITES.has(member) && !isCall && /^\s*=(?!=)/.test(src.slice(m.index + m[0].length - (m[3] ? m[3].length : 0)));
            const where = `${rel}:${src.slice(0, m.index).split("\n").length}`;
            if (isCall && AVATAR_ACTIONS.has(member)) {
                if (!exempt) {
                    console.error(`${where}: ${owner}sim.${member}() - only scripts/sim may drive the avatar`);
                    bad++;
                }
                continue;
            }
            if (isWrite) {
                if (!exempt) {
                    console.error(`${where}: ${owner}sim.${member} = - only scripts/sim may drive the avatar`);
                    bad++;
                }
                continue;
            }
            if (!isCall && !isWrite) reads++;   // position/flag/component reads stay allowed
        }
    }
    if (bad) {
        console.error(`\nsim: FAIL - ${bad} raw avatar call(s) outside scripts/sim across ${files} files`);
        return 1;
    }
    console.log(`sim: OK - the driver is the only writer across ${files} files (${reads} read-only uses elsewhere)`);
    return 0;
}

/**
 * Engine API gate: every member access, enum member and component id the pack
 * uses must exist in the typings of the API version this manifest targets
 * (tools/api-surface.json, distilled from @minecraft/server 2.3.0-beta and
 * @minecraft/server-gametest 1.0.0-beta on engine 1.21.114).
 *
 * The other gates check the pack against itself. This one checks it against the
 * engine, because that is where a whole class of silent failure lives:
 * `sim.isSprint` instead of `isSprinting`, an enum member that does not exist
 * in this API version, or a component id spelled differently are invisible
 * offline - they are either a no-op inside a try/catch or a crash at the exact
 * moment the bot depends on the value.
 *
 * Reads and writes are both covered: `sim.<member>` must be a real member of
 * SimulatedPlayer (own or inherited), so the check also protects fields the
 * driver only ever sets.
 */
const API_RECEIVERS = {
    // Dotted entries are Object.assign-style receivers on another engine object.
    // A typo in an event name is invisible at runtime - the subscription simply
    // never fires - so these are worth checking even though there are few.
    "world.afterEvents": "WorldAfterEvents",
    "world.beforeEvents": "WorldBeforeEvents",
    "system.afterEvents": "SystemAfterEvents",
    "system.beforeEvents": "SystemBeforeEvents",
    sim: "SimulatedPlayer",
    world: "World",
    system: "System",
    dimension: "Dimension",
    dim: "Dimension",
    owner: "Player",
    player: "Player",
    container: "Container",
    stack: "ItemStack",
    // Deliberately NOT mapped: `block` holds a block-id *string* in this pack
    // (isWoodRequest(block), mission.block, MINE[block]); it is never a Block
    // object, so mapping it would only ever produce false positives. Engine
    // Block values are read through locals with their own names (b, bb, pad).

};
/** Members every JS value has, so they are absent from the typings. */
const JS_MEMBERS = new Set(["toString", "valueOf", "constructor", "hasOwnProperty", "isPrototypeOf", "then"]);

function apiGate(dir) {
    const surface = load();
    const memberCache = new Map();
    const memberSet = (cls) => {
        if (!memberCache.has(cls))
            memberCache.set(cls, new Set(members(surface, cls)));
        return memberCache.get(cls);
    };
    const components = new Set(surface.components);
    const enumCache = new Map();
    const enumOf = (name) => {
        if (!enumCache.has(name))
            enumCache.set(name, enumMembersOf(surface, name));
        return enumCache.get(name);
    };
    const version = surface.source;

    let bad = 0;
    let files = 0;
    let checked = 0;
    for (const file of collectJs(dir)) {
        files++;
        const raw = readFileSync(file, "utf8");
        const src = strip(raw);
        const rel = relative(dir, file).split("\\").join("/");
        const report = (index, what, basis = src, text = src) => {
            const line = basis.slice(0, index).split("\n").length;
            const body = text.slice(index).split("\n")[0].trim().slice(0, 90);
            console.error(`${rel}:${line}: ${what}\n    ${body}`);
            bad++;
        };
        // 1. member access on an engine receiver, both `this.sim.x` and `sim.x`
        for (const [name, cls] of Object.entries(API_RECEIVERS)) {
            for (const prefix of ["\\.", "(?<![\\w$.])"]) {
                const re = new RegExp(prefix + name.replace(/\./g, "\\.") + "(\\??\\.)([A-Za-z_$][\\w$]*)", "g");
                for (const m of src.matchAll(re)) {
                    const member = m[2];
                    if (JS_MEMBERS.has(member))
                        continue;
                    checked++;
                    if (!memberSet(cls).has(member))
                        report(m.index, `${name}.${member} is not a member of ${cls} (${version})`);
                }
            }
        }
        // 2. enum members
        for (const m of src.matchAll(/(?<![\w$.])([A-Z][\w$]*)(\??\.)([A-Za-z_$][\w$]*)/g)) {
            const values = enumOf(m[1]);
            if (!values)
                continue;
            checked++;
            if (!(m[3] in values))
                report(m.index, `${m[1]}.${m[3]} is not a member of that enum (${version})`);
        }
        // 3. component ids - read from the raw text, since strip() blanks strings
        for (const m of raw.matchAll(/getComponent\(\s*"([^"]+)"/g)) {
            checked++;
            if (!components.has(m[1]))
                report(m.index, `getComponent("${m[1]}") is not a component id in this API version`, raw, src);
        }
    }
    if (bad) {
        console.error(`\napi: FAIL - ${bad} engine API mismatch(es) across ${files} files (${checked} checked)`);
        return 1;
    }
    console.log(`api: OK - ${checked} engine references match ${version}`);
    return 0;
}

/**
 * Script API 2.x runs every module body BEFORE the world is loaded. `world` is
 * importable at that point but not awake: dimensions, time, entities and
 * dynamic properties either throw or answer nothing, so anything done here that
 * touches the world is a silent no-op (the constructor of a class built at
 * module scope counts too). The only module-scope engine work that is both
 * legal and necessary is registration:
 *
 *   * `x.afterEvents.E.subscribe(...)` / `x.beforeEvents.E.subscribe(...)` -
 *     subscribing early is how a pack hears `worldLoad` at all;
 *   * `system.run / runInterval / runTimeout / runJob / clearRun` - scheduling
 *     needs no loaded world.
 *
 * Real work belongs in a `world.afterEvents.worldLoad.subscribe(...)` body, as
 * the Bedrock wiki's Script API 2.0.0 section describes.
 */
function scopeGate(dir) {
    const names = [...new Set(Object.keys(API_RECEIVERS).map((k) => k.split(".")[0]))].join("|");
    const RECEIVER = new RegExp(`(?<![\\w$.])(${names})(\\??\\.)`, "g");
    const ALLOWED = [
        /\.(?:afterEvents|beforeEvents)\.[A-Za-z_$][\w$]*\s*\.\s*subscribe\s*\(/,
        /\bsystem\s*\.\s*(?:run|runInterval|runTimeout|runJob|clearRun)\s*\(/,
    ];

    let bad = 0;
    let files = 0;
    let checked = 0;
    for (const file of collectJs(dir)) {
        files++;
        const src = strip(readFileSync(file, "utf8"));
        const rel = relative(dir, file).split("\\").join("/");
        const lines = src.split("\n");
        let depth = 0;
        for (let n = 0; n < lines.length; n++) {
            const line = lines[n];
            if (depth === 0) {
                for (const m of line.matchAll(RECEIVER)) {
                    checked++;
                    // The statement the receiver belongs to, so that a call
                    // spread over several lines is judged as one thing.
                    let stmt = "";
                    for (let k = n; k < Math.min(lines.length, n + 4); k++) {
                        stmt += k === n ? lines[k].slice(m.index) : lines[k];
                        if (stmt.includes(";"))
                            break;
                    }
                    if (ALLOWED.some((re) => re.test(stmt)))
                        continue;
                    console.error(`${rel}:${n + 1}: ${m[1]} is used at module scope, before the world is loaded\n    ${line.trim().slice(0, 90)}`);
                    bad++;
                }
            }
            for (const ch of line) {
                if (ch === "{" || ch === "(" || ch === "[")
                    depth++;
                else if (ch === "}" || ch === ")" || ch === "]")
                    depth--;
            }
        }
        // Never report a clean file that could not be read: an unbalanced copy
        // means the depth model is wrong, so every line in it was judged blind.
        if (depth !== 0) {
            console.error(`${rel}: could not analyse - bracket depth ends at ${depth}, not 0`);
            bad++;
        }
    }
    if (bad) {
        console.error(`\nscope: FAIL - ${bad} module-scope engine use(s) across ${files} files`);
        return 1;
    }
    console.log(`scope: OK - module scope only registers handlers across ${files} files (${checked} engine references, all subscriptions or scheduling)`);
    return 0;
}

const MODES = { parse: parseGate, link: linkGate, undef: undefGate, imports: importsGate, components: componentGate, sim: simGate, api: apiGate, scope: scopeGate };
const DEFAULT_ROOT = { parse: "scripts", link: "tools/load/scripts", undef: "scripts", imports: "scripts", components: "scripts", sim: "scripts", api: "scripts", scope: "scripts" };

const mode = process.argv[2];
if (!MODES[mode]) {
    console.error("usage: node tools/gates.mjs <parse|link|undef|imports|components|sim|api|scope> [root]");
    process.exit(2);
}
const root = process.argv[3] ?? DEFAULT_ROOT[mode];
process.exit(await MODES[mode](root));
