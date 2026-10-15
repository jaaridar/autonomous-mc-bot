import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { readdirSync, statSync } from "node:fs";
const root = process.argv[2];
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
process.exit(bad ? 1 : 0);
