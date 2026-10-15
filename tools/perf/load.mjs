// Loads a copy of scripts/ (working tree or a git ref) wired to the
// instrumented fake engine in tools/perf/fake-mc.mjs. Shared by tools/perf.mjs
// and tools/runtime.test.mjs. Work dirs live under tools/perf-load/ (ignored).
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join } from "node:path";

export const toolsDir = fileURLToPath(new URL("..", import.meta.url));
export const repoDir = fileURLToPath(new URL("../..", import.meta.url));

/** Prepare tools/perf-load/<name>/ and return helpers to import from it. */
export async function loadScripts({ ref, name } = {}) {
    const work = join(toolsDir, "perf-load", name ?? (ref ? "ref-" + ref.replace(/[^\w.-]/g, "_") : "worktree"));
    rmSync(work, { recursive: true, force: true });
    mkdirSync(work, { recursive: true });
    if (ref) {
        const tar = spawnSync("git", ["-C", repoDir, "archive", "--format=tar", ref, "scripts"], { maxBuffer: 1 << 28 });
        if (tar.status !== 0) throw Error(String(tar.stderr));
        const x = spawnSync("tar", ["-x", "-C", work], { input: tar.stdout });
        if (x.status !== 0) throw Error(String(x.stderr));
    } else {
        cpSync(join(repoDir, "scripts"), join(work, "scripts"), { recursive: true });
    }
    for (const [pkg, file] of [["server", "fake-mc.mjs"], ["server-gametest", "fake-gametest.mjs"]]) {
        const dir = join(work, "node_modules", "@minecraft", pkg);
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "@minecraft/" + pkg, type: "module", main: "index.js" }));
        writeFileSync(join(dir, "index.js"), `export * from ${JSON.stringify(pathToFileURL(join(toolsDir, "perf", file)).href)};\n`);
    }
    const mc = await import(pathToFileURL(join(toolsDir, "perf", "fake-mc.mjs")).href);
    const load = (rel) => import(pathToFileURL(join(work, "scripts", rel)).href);
    return { work, mc, load };
}
