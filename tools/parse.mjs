// Module-goal syntax check for every .js under a scripts root.
//
// Why this exists: `node --check file.js` does NOT always parse in module
// goal, so it can pass a file that a real ES-module parse rejects (for
// example `++(x ??= 0)` - invalid left-hand side in prefix operation).
// Bedrock parses every behavior-pack file in module goal, so one such line
// silently kills the entire pack in-game: no chat replies, no commands,
// nothing. This checker copies each file to a .mjs and runs `node --check`
// on the copy, which forces module-goal parsing and reports file:line.
import { readdirSync, statSync, copyFileSync, mkdirSync, rmSync } from "node:fs";
import { join, basename } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = process.argv[2];
if (!root) {
    console.error("usage: node parse.mjs <scripts-dir>");
    process.exit(2);
}
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
process.exit(bad ? 1 : 0);
