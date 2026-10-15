// Links and evaluates every module under the given scripts root through
// Node's real ESM linker, with @minecraft/* stubbed. This catches exactly
// the class of failure that silently kills the pack in-game: a missing
// named export (link error), a circular-import TDZ error, or a top-level
// evaluation throw. Bedrock (QuickJS) enforces the same ESM link rules.
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
const root = process.argv[2];
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
process.exit(bad ? 1 : 0);
