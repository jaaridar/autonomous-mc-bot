// Verification gates for this pack, one entry point per check:
//
//   node tools/gates.mjs parse   [scripts]              module-goal syntax, file by file
//   node tools/gates.mjs link    [tools/load/scripts]   ESM link + evaluate against the @minecraft stubs
//   node tools/gates.mjs undef   [scripts]              calls to names never imported + this.<field> typos
//   node tools/gates.mjs imports [scripts]              imports that point at files that do not exist
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
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/** Every .js/.mjs file under `dir`, recursively (shared by the layer gates). */
function walk(dir, out = []) {
    for (const entry of readdirSync(dir)) {
        const p = join(dir, entry);
        if (statSync(p).isDirectory())
            walk(p, out);
        else if (p.endsWith(".js") || p.endsWith(".mjs"))
            out.push(p);
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
        for (const m of src.matchAll(/for\s*\(\s*(?:const|let|var\s+)?([A-Za-z_$][\w$]*)\s+(?:of|in)\s/g))
            defined.add(m[1]);
        // catch (e)
        for (const m of src.matchAll(/catch\s*\(\s*([A-Za-z_$][\w$]*)/g))
            defined.add(m[1]);

        const findings = [];
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
 * layers: core/ and skills/ must stay engine-free, and skills must not reach into
 * runtime/. This is the rule that keeps the pure half testable offline and lets
 * the whole bot run headless in Node - the fastest possible dev cycle.
 */
function layersGate(root) {
    const ENGINE = /^\s*import[^;]*from\s+["']@minecraft\//m;
    const dirs = [join(root, "core"), join(root, "skills")];
    let bad = 0;
    let files = 0;
    for (const dir of dirs) {
        if (!existsSync(dir))
            continue;
        for (const file of walk(dir)) {
            files++;
            const text = readFileSync(file, "utf8");
            if (ENGINE.test(text)) {
                bad++;
                console.error(`LAYER FAIL: ${relative(root, file)} imports @minecraft/* (core and skills must be engine-free; act through the skill context)`);
            }
            if (file.includes(`${sep}skills${sep}`) && /from\s+["'][^"']*runtime\//.test(text)) {
                bad++;
                console.error(`LAYER FAIL: ${relative(root, file)} imports from runtime/ (skills must only depend on core/)`);
            }
        }
    }
    console.log(`${files} core/skill file(s) checked, ${bad} layer violation(s)`);
    return bad ? 1 : 0;
}

/**
 * reload: everything that registers itself with the engine must go through
 * runtime/lifecycle.js, so `/reload` cannot leave a second brain ticking or a
 * duplicated chat handler behind.
 */
function reloadGate(root) {
    const ALLOWED = [`${sep}runtime${sep}lifecycle.js`];
    let bad = 0;
    let files = 0;
    for (const file of walk(root)) {
        files++;
        const text = readFileSync(file, "utf8")
            .replace(/\/\/[^\n]*/g, "")
            .replace(/\/\*[\s\S]*?\*\//g, "");
        const rel = relative(root, file);
        if (!ALLOWED.some((a) => file.endsWith(a))) {
            if (/\.subscribe\s*\(/.test(text)) {
                bad++;
                console.error(`RELOAD FAIL: ${rel} subscribes directly; use on(...) from runtime/lifecycle.js`);
            }
            if (/system\.runInterval\s*\(/.test(text)) {
                bad++;
                console.error(`RELOAD FAIL: ${rel} starts a repeating timer directly; use pump(...) from runtime/lifecycle.js`);
            }
        }
        if (/Math\.random\s*\(/.test(text)) {
            bad++;
            console.error(`RELOAD FAIL: ${rel} uses Math.random(); behaviour must be reproducible (core/rng.js)`);
        }
        if (/Date\.now\s*\(/.test(text)) {
            bad++;
            console.error(`RELOAD FAIL: ${rel} uses Date.now(); use the tick counter so a replay matches`);
        }
    }
    console.log(`${files} file(s) checked, ${bad} reload/determinism violation(s)`);
    return bad ? 1 : 0;
}

/**
 * skills: build the catalog offline (no engine) and validate every definition.
 * A malformed skill should fail here, not mid-duel.
 */
async function skillsGate() {
    const entry = pathToFileURL(join(root0, "skills", "index.js")).href;
    let registry;
    try {
        ({ buildRegistry } = await import(entry));
        registry = buildRegistry();
    }
    catch (e) {
        console.error("SKILL FAIL: catalog did not build: " + (e?.message ?? e));
        return 1;
    }
    let bad = 0;
    const problems = registry.validate();
    for (const problem of problems) {
        bad++;
        console.error("SKILL FAIL: " + problem);
    }
    const ids = new Set();
    for (const skill of registry.all()) {
        if (ids.has(skill.id)) {
            bad++;
            console.error(`SKILL FAIL: duplicate id ${skill.id}`);
        }
        ids.add(skill.id);
        if (skill.id.split(".")[0] !== skill.category) {
            bad++;
            console.error(`SKILL FAIL: ${skill.id} is in category '${skill.category}'`);
        }
        if (!skill.tags.length) {
            bad++;
            console.error(`SKILL FAIL: ${skill.id} has no tags (needed for !bot skill list <filter>)`);
        }
    }
    console.log(`${registry.size} skill(s) across ${registry.categories().length} categor(ies), ${bad} problem(s)`);
    return bad ? 1 : 0;
}

const MODES = { parse: parseGate, link: linkGate, undef: undefGate, imports: importsGate, layers: layersGate, reload: reloadGate, skills: skillsGate };
const DEFAULT_ROOT = { parse: "scripts", link: "tools/load/scripts", undef: "scripts", imports: "scripts", layers: "scripts", reload: "scripts", skills: "scripts" };

const mode = process.argv[2];
if (!MODES[mode]) {
    console.error("usage: node tools/gates.mjs <parse|link|undef|imports> [root]");
    process.exit(2);
}
const root = process.argv[3] ?? DEFAULT_ROOT[mode];
const root0 = "scripts";
let buildRegistry;
process.exit(await MODES[mode](root));
