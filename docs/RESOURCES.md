# VerdantBot — Resource Library

> Exhaustive organized docs index for coding + structuring this addon.
> Pack: Verdant Bot 1.2.9 - Bedrock 1.21.120 — BP + `@minecraft/server 2.4.0-beta` + `@minecraft/server-gametest 1.0.0-beta`
> Entry: `scripts/main.js` → `core/` (12 pure modules) + `runtime/` (20 adapters) + `structures/verdant/host.mcstructure` + `tools/run-all.mjs`
> How to use: start at Tier 0, then jump to the section matching the file you edit.

Last curated: 2026-10-16.

## 0. Start here — 10 highest ROI

| # | Title | URL |
|---|-------|-----|
| 0.1 | Script API Reference Landing | https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/?view=minecraft-bedrock-stable |
| 0.2 | Scripting Introduction | https://learn.microsoft.com/en-us/minecraft/creator/documents/scripting/introduction?view=minecraft-bedrock-stable |
| 0.3 | Scripting V2 Overview | https://learn.microsoft.com/en-us/minecraft/creator/documents/scripting/v2-overview?view=minecraft-bedrock-stable |
| 0.4 | Script Module Versioning | https://learn.microsoft.com/en-us/minecraft/creator/documents/scripting/versioning?view=minecraft-bedrock-stable |
| 0.5 | Intro to Scripting — Bedrock Wiki | https://wiki.bedrock.dev/scripting/scripting-intro |
| 0.6 | server-gametest Module | https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server-gametest/minecraft-server-gametest?view=minecraft-bedrock-experimental |
| 0.7 | SimulatedPlayer Class | https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server-gametest/simulatedplayer?view=minecraft-bedrock-experimental |
| 0.8 | Behavior Pack Doc | https://learn.microsoft.com/en-us/minecraft/creator/documents/behaviorpack?view=minecraft-bedrock-stable |
| 0.9 | Debugging Scripts | https://learn.microsoft.com/en-us/minecraft/creator/documents/scripting/debugging-scripts?view=minecraft-bedrock-stable |
| 0.10 | scripting-samples repo | https://github.com/microsoft/minecraft-scripting-samples/ |

## 1. Pack structure / manifest — manifest.json, folders

Fixes: `format_version, header, modules[], dependencies[], min_engine_version 1.21.120`.

### 1A. Official Learn
- [Behavior Pack](https://learn.microsoft.com/en-us/minecraft/creator/documents/behaviorpack?view=minecraft-bedrock-stable) — pack root contract
- [Behavior Packs from Scratch](https://learn.microsoft.com/en-us/minecraft/creator/documents/behaviorpackfromscratch?view=minecraft-bedrock-stable) — scaffolding
- [Comprehensive Pack Contents](https://learn.microsoft.com/en-us/minecraft/creator/documents/comprehensivepackcontents?view=minecraft-bedrock-stable) — full folder map
- [Addons Manifest Example](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/addonsreference/examples/addonmanifest?view=minecraft-bedrock-stable) — template
- [manifest:dependency](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/manifestreference/dependency?view=minecraft-bedrock-stable) — version pins
- [Manifest Validation (chkmanif)](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/mctoolsvalreference/chkmanif?view=minecraft-bedrock-stable) — parse gate
- [Add-On Development Workflow](https://learn.microsoft.com/en-us/minecraft/creator/documents/addondevelopmentworkflow?view=minecraft-bedrock-stable) — edit/deploy loop
- [Guidelines Cooperative Add-Ons](https://learn.microsoft.com/en-us/minecraft/creator/documents/practices/guidelinesforbuildingcooperativeaddons?view=minecraft-bedrock-stable) — owner-gating

### 1B. Manifest sources (GitHub)
- [PackManifest.md source](https://github.com/MicrosoftDocs/minecraft-creator/blob/main/creator/Reference/Content/AddonsReference/PackManifest.md)
- [module.md source](https://github.com/MicrosoftDocs/minecraft-creator/blob/main/creator/Reference/Content/ManifestReference/module.md) — `type: script`, `entry`
- [TickJsonIntroduction.md](https://github.com/MicrosoftDocs/minecraft-creator/blob/main/creator/Documents/TickJsonIntroduction.md)

### 1C. Bedrock Wiki structure
- [Project Setup](https://wiki.bedrock.dev/guide/project-setup) + [mirror](https://wiki.bedrock.dev/guide/project-setup.html)
- [Add-Ons Explained](https://wiki.bedrock.dev/guide/addons)
- [Add-On Performance](https://wiki.bedrock.dev/meta/addon-performance) — cache reads, time-slice A*

## 2. Script runtime core — scripts/main.js, runtime/bot.js

Fixes: 20Hz system.run pump, chat !bot parsing, getAllPlayers orphan takeover, circuit breaker.

- [Script Core Features — Wiki](https://wiki.bedrock.dev/scripting/script-server) + [mirror](https://wiki.bedrock.dev/scripting/script-server.html)
- [Engine Environment — Wiki](https://wiki.bedrock.dev/scripting/api-environment) + [source](https://github.com/Bedrock-OSS/bedrock-wiki/blob/wiki/docs/scripting/api-environment.md)
- [Game Loops / system.run Guide](https://learn.microsoft.com/en-us/minecraft/creator/documents/systemrunguide?view=minecraft-bedrock-stable) — **tick pump**
- [System Class](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/system?view=minecraft-bedrock-stable) + [source](https://github.com/MicrosoftDocs/minecraft-creator/blob/main/creator/ScriptAPI/minecraft/server/System.md)
- [World Class](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/world?view=minecraft-bedrock-stable)
- [@minecraft/server Root](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/minecraft-server?view=minecraft-bedrock-stable)
- [Player Class](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/player?view=minecraft-bedrock-stable)
- [Multiplayer Scripts](https://learn.microsoft.com/en-us/minecraft/creator/documents/scripting/multiplayer-scripts?view=minecraft-bedrock-stable) — owner gating
- [Placement Prevention — Wiki](https://wiki.bedrock.dev/scripting/placement-prevention) — builder Hands
- [Gameplay with TypeScript](https://learn.microsoft.com/en-us/minecraft/creator/documents/scriptinggettingstarted?view=minecraft-bedrock-stable)
- [TypeScript Starter](https://learn.microsoft.com/en-us/samples/microsoft/minecraft-scripting-samples/minecraft-typescript-starter-project/)
- [How-to Gallery Beta + GameTest](https://learn.microsoft.com/en-us/samples/microsoft/minecraft-scripting-samples/minecraft-how-to-gallery-for-beta-apis-and-gametest/)
- [Scripting Next Steps](https://learn.microsoft.com/en-us/minecraft/creator/documents/scripting/next-steps?view=minecraft-bedrock-stable)

## 3. GameTest + SimulatedPlayer — runtime/host.js, structures/verdant/host.mcstructure

Verdant IS a GameTest bot. Host ~4096 blocks away, ticking area, sim dies on reload.

### 3A. Official API
- [@minecraft/server-gametest](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server-gametest/minecraft-server-gametest?view=minecraft-bedrock-experimental)
- [SimulatedPlayer](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server-gametest/simulatedplayer?view=minecraft-bedrock-experimental)
- [Test Class](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server-gametest/test?view=minecraft-bedrock-experimental)
- [gametest.md source](https://github.com/MicrosoftDocs/minecraft-creator/blob/main/creator/ScriptAPI/minecraft/server-gametest/minecraft-server-gametest.md)
- [Test.md source](https://github.com/MicrosoftDocs/minecraft-creator/blob/main/creator/ScriptAPI/minecraft/server-gametest/Test.md)
- [SimulatedPlayer.md source](https://github.com/MicrosoftDocs/minecraft-creator/blob/main/creator/ScriptAPI/minecraft/server-gametest/SimulatedPlayer.md)

### 3B. Concept + structure pairing
- [GameTests — Wiki](https://wiki.bedrock.dev/scripting/game-tests)
- [game-tests.md source](https://github.com/Bedrock-OSS/bedrock-wiki/blob/wiki/docs/scripting/game-tests.md)
- [GameTest — minecraft.wiki](https://minecraft.wiki/w/GameTest)
- [Add-on — minecraft.wiki](https://minecraft.wiki/w/Add-on)
- [commands/gametest — wiki](https://minecraft.wiki/w/Commands/gametest) + [Fandom mirror](https://minecraft.fandom.com/wiki/Commands/gametest)
- [Get started GameTest — minecraft.net](https://www.minecraft.net/en-us/creator/article/get-started-gametest-framework)

### 3C. Extended mirrors
- [spawnSimulatedPlayer — Jayly](https://jaylydev.github.io/scriptapi-docs/latest/functions/_minecraft_server-gametest.spawnSimulatedPlayer.html)
- [spawnSimulatedPlayer — stirante 1.21.124](https://stirante.com/script/server-gametest/1.0.0-beta.1.21.124-stable/functions/spawnSimulatedPlayer.html)
- [spawnSimulatedPlayer — 8Crafter](https://docs.api.8crafter.com/andexdb/dev/functions/_minecraft_server-gametest.spawnSimulatedPlayer.html)

### 3D. SimulatedPlayer deep dive — every method Verdant uses

Official class page (all methods below live here):

- [SimulatedPlayer Class — Learn](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server-gametest/simulatedplayer?view=minecraft-bedrock-experimental) — attack, breakBlock, disconnect, dropItem, interact, interactWithBlock, jump, lookAtBlock/Entity/Location, move, moveToLocation, moveRelative, respawn, runCommand, setItem, start/stopBreakingBlock, start/stopUsingItem, stopMoving, teleport, useItem, useItemInSlot
- [SimulatedPlayer.md source](https://github.com/MicrosoftDocs/minecraft-creator/blob/main/creator/ScriptAPI/minecraft/server-gametest/SimulatedPlayer.md) — same, markdown for offline read
- [Player — Jayly v26.50](https://jaylydev.github.io/scriptapi-docs/latest/classes/_minecraft_server.Player.html) — parent class: every inherited method (moveToLocation, stopMoving, addTag, sendMessage, dimension, location)

Movement (runtime/navigation.js Navigator + Parkour):

- [SimulatedPlayer Class — Learn](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server-gametest/simulatedplayer?view=minecraft-bedrock-experimental) — `moveToLocation` straight-line, `move` directional, `moveRelative`, `stopMoving`, `jump`, `teleport`
- [Player Object API — LeviLamina LSE](https://lse.levimc.org/apis/GameAPI/Player/) — Simulate Navigate Move, Stop Moving parallels

Combat + interaction (runtime/combat.js, builder.js Hands, looting.js):

- [SimulatedPlayer Class — Learn](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server-gametest/simulatedplayer?view=minecraft-bedrock-experimental) — `attack` target, `interact` / `interactWithBlock`, `startBreakingBlock` / `stopBreakingBlock`, `breakBlock`, `useItem` / `useItemInSlot` / `startUsingItem`, `setItem`, `dropItem`, `lookAtBlock` / `lookAtEntity` / `lookAtLocation`
- [Entity Components list](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/entityreference/examples/componentlist?view=minecraft-bedrock-stable) — knockback, movement context for kite/rush/retreat tuning

Lifecycle — spawn / respawn / disconnect (runtime/host.js, main.js orphan takeover):

- [spawnSimulatedPlayer — Jayly](https://jaylydev.github.io/scriptapi-docs/latest/functions/_minecraft_server-gametest.spawnSimulatedPlayer.html)
- [spawnSimulatedPlayer — stirante 1.21.124](https://stirante.com/script/server-gametest/1.0.0-beta.1.21.124-stable/functions/spawnSimulatedPlayer.html)
- [SimulatedPlayer Class — Learn](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server-gametest/simulatedplayer?view=minecraft-bedrock-experimental) — `respawn`, `disconnect`, `runCommand`

### 3E. GameTest harness — register, maxTicks, structure (host.js 11-23)

- [Test Class — Learn](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server-gametest/test?view=minecraft-bedrock-experimental) — maxTicks, structureName, spawnSimulatedPlayer
- [Test.md source](https://github.com/MicrosoftDocs/minecraft-creator/blob/main/creator/ScriptAPI/minecraft/server-gametest/Test.md)
- [gametest.md source](https://github.com/MicrosoftDocs/minecraft-creator/blob/main/creator/ScriptAPI/minecraft/server-gametest/minecraft-server-gametest.md)
- [Issue #12 — Sims Missing BP Entity Props](https://github.com/microsoft/minecraft-gametests/issues/12) — custom props do not apply to sims

### 3F. Known limits + community bots (why sim dies on reload, ticking, AFK)

- [Simulation / Ticking Areas](https://learn.microsoft.com/en-us/minecraft/creator/documents/simulationrenderdistanceguide?view=minecraft-bedrock-stable) — host must stay ticked or bot freezes
- [Multiplayer Scripts](https://learn.microsoft.com/en-us/minecraft/creator/documents/scripting/multiplayer-scripts?view=minecraft-bedrock-stable) — sims do not survive reload; re-spawn + restore via dynamic props
- [microsoft/minecraft-samples](https://github.com/microsoft/minecraft-samples) — official addon samples incl. GameTest patterns
- [Understudy — Fake Players (CurseForge Bedrock)](https://www.curseforge.com/minecraft-bedrock/addons/understudy) — closest shipping analog: controllable sim players, AFK farms, area loading
- [How I Made FAKE PLAYERS in Bedrock — YouTube](https://www.youtube.com/watch?v=ycjSq0gjtWI) — Understudy showcase, control model to compare vs Verdant directors
- [Fake Players for Bedrock — r/technicalminecraft](https://www.reddit.com/r/technicalminecraft/comments/1l3g2zs/fake_players_for_bedrock/) — community limits discussion
- [Is there /player on Bedrock like Carpet — r/technicalminecraft](https://www.reddit.com/r/technicalminecraft/comments/182zdks/is_there_a_way_to_do_player_on_bedrock_edition/) — AFK / farm use cases
- [duzos/fakeplayer (Java, reference only)](https://github.com/duzos/fakeplayer) — NOT Bedrock; useful only for behavior ideas (wander/sit/sleep), not API
- [senseiwells/PuppetPlayers (Fabric Java, reference only)](https://github.com/senseiwells/PuppetPlayers) — NOT Bedrock; player-tick accuracy ideas only


## 4. World / navigation — core/world.js, core/navigation.js, runtime/navigation.js, world.js, scouting.js

- [Simulation / Ticking Areas](https://learn.microsoft.com/en-us/minecraft/creator/documents/simulationrenderdistanceguide?view=minecraft-bedrock-stable)
- [Improving performance](https://learn.microsoft.com/en-us/minecraft/creator/documents/practices/improvingperformanceandresourceusage?view=minecraft-bedrock-stable)
- [Blocks — bedrock.dev](https://bedrock.dev/docs/stable/Blocks)
- [Block Components — Wiki](https://wiki.bedrock.dev/blocks/block-components.html)
- [Block Event Migration — Wiki](https://wiki.bedrock.dev/blocks/block-event-migration)
- [Dimension Class](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/dimension?view=minecraft-bedrock-stable) — Mojang's structure locator `getGeneratedStructures(location)` (api module 2.4.0-beta / Bedrock 1.21.120+): every generated structure whose footprint contains the sample point — village finding in runtime/village.js is built on it
- [Bedrock Edition Preview 1.21.120.20 — minecraft.wiki](https://minecraft.wiki/w/Bedrock_Edition_Preview_1.21.120.20) — the engine cycle that shipped the structure-locator binding; the manifest bump (1.2.9) targets this
- [Bedrock Edition 26.40 — minecraft.wiki](https://minecraft.wiki/w/Bedrock_Edition_26.40) — `findClosestBiome(biome, location)` renamed to `calculateClosestBiomeFromSeed(location, biome)` (arg order swapped too) — the ladder in runtime/village.js feature-detects both; calling the old name with the wrong order silently returns nothing
- [Dimension.findClosestBiome — Learn](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/dimension/findclosestbiome?view=minecraft-bedrock-experimental) — biome FIRST shape (2.3.0-beta..2.8.0-beta); keep for 1.21.114 reversion support

## 5. Inventory / crafting — runtime/inventory.js, core/recipes.js, equipment.js, looting.js

- [Container Class](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/container?view=minecraft-bedrock-stable)
- [BlockInventoryComponent](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/blockinventorycomponent?view=minecraft-bedrock-stable)
- [Dynamic Properties — experimental](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/blockdynamicpropertiescomponent?view=minecraft-bedrock-experimental&viewFallbackFrom=minecraft-bedrock-stable)
- [item-components.md](https://github.com/Bedrock-OSS/bedrock-wiki/blob/wiki/docs/items/item-components.md)
- [item-event-migration.md](https://github.com/Bedrock-OSS/bedrock-wiki/blob/wiki/docs/items/item-event-migration.md)
- [Scripting 1.18.1.2 — bedrock.dev](https://bedrock.dev/docs/1.18.0.0/1.18.1.2/Scripting)
- [Scripting 1.17.0.2 — bedrock.dev](https://bedrock.dev/docs/1.17.0.0/1.17.0.2/Scripting)
- [Scripting 1.14.30.2 — bedrock.dev](https://bedrock.dev/docs/1.14.0.0/1.14.30.2/Scripting)

## 6. Commands / UI / memory — main.js chat, runtime/ui.js, memory.js

- [Custom Commands Overview](https://learn.microsoft.com/en-us/minecraft/creator/documents/customcommands?view=minecraft-bedrock-stable)
- [Custom Commands — scripting](https://learn.microsoft.com/en-us/minecraft/creator/documents/scripting/custom-commands?view=minecraft-bedrock-stable)
- [Custom Commands — Wiki](https://wiki.bedrock.dev/scripting/custom-commands)

## 7. Debugging / verification — tools/run-all.mjs, gates.mjs, perf

- [debugging-scripts.md source](https://github.com/MicrosoftDocs/minecraft-creator/blob/main/creator/Documents/scripting/debugging-scripts.md)
- [Developer Tools](https://learn.microsoft.com/en-us/minecraft/creator/documents/scripting/developer-tools?view=minecraft-bedrock-stable)
- [Content Error Log](https://learn.microsoft.com/en-us/minecraft/creator/documents/contenterrorlog?view=minecraft-bedrock-stable)
- [Troubleshooting Add-Ons](https://learn.microsoft.com/en-us/minecraft/creator/documents/troubleshootingaddons?view=minecraft-bedrock-stable) + [source](https://github.com/MicrosoftDocs/minecraft-creator/blob/main/creator/Documents/TroubleshootingAddons.md)
- [Troubleshooting JS — Wiki](https://wiki.bedrock.dev/scripting/troubleshooting)
- [Troubleshooting — Wiki](https://wiki.bedrock.dev/guide/troubleshooting)
- [Mojang/minecraft-debugger](https://github.com/Mojang/minecraft-debugger/blob/main/README.md)

## 8. Daily mirrors — fastest lookup

- [Jayly Hub](https://jaylydev.github.io/scriptapi-docs/)
- [Script API v26.40](https://jaylydev.github.io/scriptapi-docs/latest/index.html)
- [Script API v26.30](https://jaylydev.github.io/scriptapi-docs/latest/)
- [@minecraft/server v26.30](https://jaylydev.github.io/scriptapi-docs/latest/modules/_minecraft_server.html)
- [World — Jayly v26.50](https://jaylydev.github.io/scriptapi-docs/latest/classes/_minecraft_server.World.html)
- [Entity — Jayly v26.50](https://jaylydev.github.io/scriptapi-docs/latest/classes/_minecraft_server.Entity.html)
- [scriptapi-docs repo](https://github.com/JaylyDev/scriptapi-docs)

## 9. Videos / plain-English

- [Beginner Guide Scripting — YouTube](https://www.youtube.com/watch?v=-34dn_mKkMA)
- [GameTest Packs 1.18 — YouTube](https://www.youtube.com/watch?v=VvJqDT8CClc)
- [Bedrock Addons — GameServerKings](https://www.gameserverkings.com/knowledge-base/minecraft/bedrock-addons/)

## 10. File map — where to look first

| File | Read |
|---|---|
| manifest.json | Sec 1 dependency + chkmanif, Sec 0.4 versioning |
| scripts/main.js | Sec 2 system.run + Player, Sec 6 commands |
| runtime/host.js + host.mcstructure | Sec 3 all |
| runtime/bot.js | Sec 2 core + engine env + multiplayer |
| runtime/navigation.js, core/navigation.js | Sec 4 ticking + perf |
| runtime/world.js, core/world.js | Sec 4 blocks |
| runtime/inventory.js, core/recipes.js | Sec 5 Container |
| runtime/memory.js, core/memory.js | Sec 5 dynamic props |
| runtime/ui.js | Sec 6 commands |
| tools/ gates + perf | Sec 7 debugging + log + debugger |

## 11. Restructure checklist (from docs)

1. Keep core/ free of @minecraft/* — enforce via tools/gates.mjs (Sec 7).
2. One entry scripts/main.js (Sec 1 module.md).
3. Time-slice A*, cache reads (Sec 4) — keep in perf.test.mjs.
4. Pin dependencies[], bump min_engine_version with game (Sec 1).
5. Document host lifecycle in ARCHITECTURE.md (Sec 3 minecraft.net article).
6. Add VS Code debugger from Mojang/minecraft-debugger (Sec 7).

> Tip: if experimental Learn link 404s, drop query param or use Jayly Sec 8.


