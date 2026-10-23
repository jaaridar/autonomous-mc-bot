// One command for the whole verification suite. Runs from any cwd:
//
//   1. Rebuilds tools/load/scripts from the pack sources (the copy that the
//      stubbed @minecraft/* modules in tools/load/node_modules resolve for).
//   2. Runs every gate in order; a non-zero exit from a real gate fails the
//      run.
//   3. Runs the deliberately broken fixtures in tools/selftest and REQUIRES
//      them to fail - that proves the no-undef gate still catches bugs.
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const tools = fileURLToPath(new URL(".", import.meta.url));
const repo = fileURLToPath(new URL("..", import.meta.url));

rmSync(join(tools, "load", "scripts"), { recursive: true, force: true });
mkdirSync(join(tools, "load", "scripts"), { recursive: true });
cpSync(join(repo, "scripts"), join(tools, "load", "scripts"), { recursive: true });

const steps = [
    { name: "module-goal parse (exactly how the engine parses it)", file: "parse.mjs", args: ["scripts"] },
    { name: "link + evaluate against @minecraft stubs", file: "linkcheck.mjs", args: ["tools/load/scripts"] },
    { name: "no-undef gate (missing imports + this.<field> typos)", file: "undef.mjs", args: ["scripts"] },
    { name: "import scan", file: "imports.mjs", args: ["scripts"] },
    { name: "core unit tests", file: "test.mjs" },
    { name: "pathfinder (bidirectional A*, safety, unstuck, portal walk)", file: "pathfinder.test.mjs" },
    { name: "brain layer tests (offline toy world + fuzz + mutation)", file: "brain.test.mjs" },
    { name: "survival capability tests", file: "test-capabilities.mjs" },
    { name: "walkable regex guard", file: "walkable.mjs" },
    { name: "drop-flush tests", file: "flush.mjs" },
    { name: "perf/efficiency tests (native-call + A* budgets, equivalence vs v1.2.4)", file: "perf.test.mjs" },
    { name: "no-undef gate catches its fixtures (expected to fail)", file: "undef.mjs", args: ["tools/selftest"], mustFail: true },
];

let failed = 0;
for (const step of steps) {
    console.log(`\n== ${step.name}`);
    const r = spawnSync(process.execPath, [join(tools, step.file), ...(step.args ?? [])], {
        cwd: repo,
        stdio: "inherit",
    });
    const ok = step.mustFail ? r.status !== 0 : r.status === 0;
    if (!ok) {
        failed++;
        console.log(`== FAILED (exit ${r.status})`);
    }
}
console.log(`\n${failed ? `${failed} step(s) FAILED` : "all steps passed"}`);
process.exit(failed ? 1 : 0);
