// Materialises the offline engine into tools/load/node_modules so the pack's
// `import ... from "@minecraft/server"` resolves exactly as it does in-game.
//
// Why generate it instead of committing node_modules: node_modules is excluded
// from workspace snapshots and from the repo, so a generated copy is the only
// one that survives a fresh clone. The sources live in tools/stubs/ and are
// committed.
//
//   node tools/stubs/install.mjs        # write the modules
//
// run-all.mjs calls this itself, so a plain `node tools/run-all.mjs` always
// works from a clean checkout.

import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join } from "node:path";

const stubs = fileURLToPath(new URL(".", import.meta.url));
const load = fileURLToPath(new URL("../load/", import.meta.url));

const MODULES = [
    ["@minecraft/server", "1.21.114", "server.js", "Bedrock Minecraft server scripting API (offline stub)"],
    ["@minecraft/server-gametest", "1.0.0-beta", "server-gametest.js", "Bedrock GameTest framework (offline stub)"],
];

export function installStubs(log = () => { }) {
    const nodeModules = join(load, "node_modules");
    for (const [name, version, file, description] of MODULES) {
        const dir = join(nodeModules, ...name.split("/"));
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, "package.json"), JSON.stringify({
            name,
            version,
            description,
            type: "module",
            main: "index.js",
            exports: { ".": "./index.js" },
        }, null, 2) + "\n");
        cpSync(join(stubs, "minecraft", file), join(dir, "index.js"));
        log(`  ${name}@${version}`);
    }
    return nodeModules;
}

export function resetLoad() {
    rmSync(load, { recursive: true, force: true });
}

// Windows argv[1] is a backslash path while import.meta.url is a file URL, so
// compare resolved paths instead of string suffixes.
const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (invokedDirectly) {
    resetLoad();
    mkdirSync(load, { recursive: true });
    console.log("installed offline engine stubs into tools/load/node_modules:");
    installStubs((line) => console.log(line));
}
