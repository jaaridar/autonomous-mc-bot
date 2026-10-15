// No-undef gate: catches calls to identifiers that are never imported or
// declared in the file. This is the exact class of bug that shipped in 0.8.7:
// bot.js called horizontal(...) without importing it, which threw a
// ReferenceError on every tick with a target and tripped the circuit breaker
// ("stops out of sudden"). Neither parse.mjs nor linkcheck.mjs can see this -
// it is a runtime error inside a function body, not a parse or link error.
//
// Heuristic but conservative: strips comments/strings, collects every name
// that is imported, declared (function/class/const/let/var, incl. simple
// destructuring), or bound as a parameter (function/arrow/method/get/set),
// then flags remaining CALL positions. Method definitions are skipped.
//
// Usage: node undef.mjs <scripts-dir>
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.argv[2];
if (!root) {
    console.error("usage: node undef.mjs <scripts-dir>");
    process.exit(2);
}

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
    process.exit(1);
}
console.log(`undef: OK - no undefined calls across ${files} files`);
