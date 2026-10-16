// One command for the whole verification suite. Runs from any cwd:
//
//   1. Installs the offline engine (@minecraft/server stubs, tools/stubs) into
//      tools/load/node_modules and rebuilds tools/load/scripts from the pack
//      sources, so relative and bare imports both resolve exactly as in-game.
//   2. Runs every gate in order; a non-zero exit from a real gate fails the run.
//   3. Runs the deliberately broken fixtures in tools/selftest and REQUIRES them
//      to fail - that proves the no-undef gate still catches bugs.
//
// Flags:
//   --quick     skip the perf suite (fast inner loop while editing)
//   --watch     re-run on every change under scripts/
//   --no-perf   alias of --quick
import { cpSync, mkdirSync, rmSync, watch } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { installStubs } from "./stubs/install.mjs";

const tools = fileURLToPath(new URL(".", import.meta.url));
const repo = fileURLToPath(new URL("..", import.meta.url));
const args = process.argv.slice(2);
const quick = args.includes("--quick") || args.includes("--no-perf");

function build() {
    rmSync(join(tools, "load", "scripts"), { recursive: true, force: true });
    mkdirSync(join(tools, "load", "scripts"), { recursive: true });
    cpSync(join(repo, "scripts"), join(tools, "load", "scripts"), { recursive: true });
    installStubs();
}

const steps = [
    { name: "module-goal parse (exactly how the engine parses it)", file: "gates.mjs", args: ["parse"] },
    { name: "link + evaluate against the offline engine", file: "gates.mjs", args: ["link"] },
    { name: "no-undef gate (missing imports + this.<field> typos)", file: "gates.mjs", args: ["undef"] },
    { name: "import scan", file: "gates.mjs", args: ["imports"] },
    { name: "layer gate (core/skills stay engine-free, runtime only adapts)", file: "gates.mjs", args: ["layers"] },
    { name: "reload gate (no bare event subscriptions, no leaked timers)", file: "gates.mjs", args: ["reload"] },
    { name: "skill gate (registry contract + catalog integrity)", file: "gates.mjs", args: ["skills"] },
    { name: "unit tests (memory schema, capabilities, walkable guard, drop flush)", file: "tests.mjs" },
    { name: "skill tests (plans, scheduler determinism, harness smoke)", file: "skills.test.mjs" },
    { name: "perf/efficiency tests (native-call + A* budgets, equivalence vs v1.2.4)", file: "perf.test.mjs", skip: quick },
    { name: "no-undef gate catches its fixtures (expected to fail)", file: "gates.mjs", args: ["undef", "tools/selftest"], mustFail: true },
];

function run() {
    build();
    let failed = 0;
    for (const step of steps) {
        if (step.skip)
            continue;
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
    return failed ? 1 : 0;
}

if (args.includes("--watch")) {
    let pending = false;
    const rerun = () => {
        if (pending) return;
        pending = true;
        setTimeout(() => { pending = false; run(); }, 120);
    };
    run();
    console.log("\nwatching scripts/ and tools/ - edit, save, see the result (Ctrl-C to stop)");
    watch(join(repo, "scripts"), { recursive: true }, rerun);
    watch(join(tools), { recursive: true, persistent: true }, (_event, file) => {
        if (file && (file.startsWith("load") || file.startsWith("parse-out"))) return;
        rerun();
    });
}
else {
    process.exit(run());
}
