# Verdant Bot — architecture

Where things live, who owns what, and the rules that keep the bot honest.
If you are adding a feature, find its layer here first.

## Layers

```
scripts/main.js     chat commands, event wiring, 20 Hz tick pump  (the only entry point)
scripts/core/       pure logic: no @minecraft/*, unit-testable offline
scripts/runtime/    engine adapters: read the world, move the player, place blocks
tools/              self-contained verification suite (node tools/run-all.mjs)
```

Two rules carry most of the design:

- **core never imports runtime.** Dependencies point one way, so the pure half
  stays testable in plain Node.
- **runtime only adapts.** Decisions (tables, scoring, phases, plans) live in
  core; runtime performs ticks, block reads and native calls.

## core/ — engine-free logic (12 modules)

| Module | Job |
|---|---|
| `math.js` | vectors, distances, block keys, cardinal/compass tables, position validity |
| `world.js` | block taxonomy (passable/solid/falling/hazard), ore Y-levels, MINE table, hostiles/ranged/explosive, food sets, tool tiers, branch-mining patterns |
| `knowledge.js` | item/block info, mob tactics, structure signatures, "retain important" scoring, danger/goal prioritisation, death-recovery plan |
| `recipes.js` | crafting + smelting dependency resolver, food/fuel tables, rollback-safe stack transfer |
| `navigation.js` | A* search with parkour edges (sprint jump, jump-up, big drops, bridge cost) |
| `arbiter.js` | task arbiter (which director acts now) + the `TaskFault`/`blockedTask` contract |
| `progression.js` | goal decomposition (`decomposeMission`), requirement analysis, speedrun phases/checklist |
| `survival.js` | 80 survival scenarios, capability composition, food strategy, adaptive recalculation |
| `nether.js` | Nether route scoring, bucket milestone, obsidian/portal planning, ignition options |
| `village.js` | village-first scoring (food/beds/hay) and iron-golem risk/strategy |
| `combat.js` | mob stats, threat scoring, tactics (kite/rush/retreat/pillar), strafe, crit windows, escape plans |
| `memory.js` | persistent-memory schema, prefs sanitisation, spot dedupe/caps |

## runtime/ — engine adapters (20 components)

| Component | Job |
|---|---|
| `bot.js` | the brain: tick order, mode dispatch, task objects, `think()` integration of every director below |
| `world.js` | `Terrain` (cached block reads, ores, obstructions), `BlockScan`, `RollingSweep`, `threatInfo` |
| `inventory.js` | `Bag` (per-tick inventory snapshot, tools/food counts), deposits/withdraw, organisation, resource decisions |
| `navigation.js` | `Navigator` (rolling-horizon A*, loop detection, threat avoidance) + `Parkour` gap/step/sprint/ladder handling |
| `builder.js` | bridging, pillaring, scaffolding, torch placement, obstruction clearing, portal frame + `Hands` (aim/place/verify) |
| `combat.js` | `Combat` execution: rush ranged, retreat creeper, kite heavies, crit jumps, group positioning |
| `escape.js` | `Escaper`: water/lava/trapped handling, probe order, combat escape |
| `survival-master.js` | the 80-scenario handler: fall, night-combat, resource, shelter and multi-risk responses |
| `survival.js` | `SurvivalDirector` (gear ladder + food), `Forager` (hunting), `FoodDirector` (healing/readiness) |
| `scouting.js` | `Scout` (village/forage sweep) + `Explorer` (frontier walking) |
| `world-awareness.js` | `WorldAwareness` surroundings scan (iron, sheep, lava, water) + `StructureDetector` |
| `looting.js` | `Looting` (scored chest scanning) + `Drops` (loose item pickup, mining-sweep flush) |
| `mining.js` | `Miner` (staircase/corridor) + `DeepMiner` (shaft → branch → vein → ascend) |
| `nether.js` | `NetherDirector`: route choice, water/lava handling, portal build, ignition, entry; `BucketDirector` |
| `village.js` | `VillageDirector` (village-first food/beds/loot) + `GolemDirector` (iron golem fights) |
| `speedrun.js` | `SpeedrunDirector`: wood → stone → iron → diamond → portal phases, milestone verification |
| `equipment.js` | `Equipment` (armour/weapon upkeep) + `Furnace` (smelting station) |
| `memory.js` | `Memory`: loads/saves the persistent JSON document, passive bounded observation |
| `ui.js` | scoreboard/HUD output |
| `host.js` | `Host`: remote GameTest host site, spawn, ticking area, recovery |

## Rules that keep the bot honest

- **No item fabrication.** Crafting, smelting and deposits move real stacks with
  prepare-then-commit and rollback; a failed commit restores both inventories or
  says `CRITICAL` and stops.
- **Digging refuses hazards.** The miner and camp digger never break a cell with
  lava or water beside it, never open a hole over a drop, and check tool tier
  before touching ore.
- **Shelters are always reopenable.** A niche is only sealed with a block the bot
  can positively dig back out.
- **Owner-gated.** No world mutation while the owner is offline or in another
  dimension; commands require the `verdant:admin`/`verdant.admin` tag.
- **Circuit breaker.** Five successive script errors pause the bot with the
  last error; it auto-resumes after 10 seconds instead of dying or looping.
- **Bounded budgets.** Every scan/director has a tick or attempt budget and ends
  with an actionable message; `tell()` = chat, `reason` = HUD, `blockTask` =
  stop with `manual`/`retry`.
- **Honest reporting.** Entity disappearance = pickup success, inventory delta =
  quota success. Items observed and moved, never fabricated.

## Adding a feature

1. Pure logic in `core/`, engine touches in `runtime/`.
2. Runtime components follow the existing shape: `constructor(bot)`, `tick(tick)`,
   `reset()`, bounded budgets.
3. Run `node tools/run-all.mjs` — module-goal parse, link/evaluate against the
   `@minecraft` stubs, no-undef gate, import scan, unit tests, perf tests, and a
   must-fail check that the no-undef gate still catches its own fixtures.

## Verification suite (`tools/`)

| File | Job |
|---|---|
| `run-all.mjs` | rebuilds `tools/load/scripts`, runs every gate in order |
| `gates.mjs` | `parse` (module-goal syntax), `link` (ESM link + evaluate), `undef` (undefined calls + `this.<field>` typos), `imports` (missing paths) |
| `tests.mjs` | persistent-memory schema, capabilities/goal decomposition, WALKABLE regex guard, drop-flush tests |
| `perf.test.mjs` | native-call and A* budgets, equivalence against the frozen v1.2.4 search (`perf/legacy-navigation.mjs`) |
| `selftest/` | deliberately broken fixtures the no-undef gate must reject |

## Roadmap

Ranked by the previous planning pass; none of it is wired in yet, so it stays
here rather than in `scripts/`:

1. **Verification & recovery layer** — one place that verifies bucket, water,
   obsidian, portal, ignition and entry instead of assuming success.
2. **World model / blackboard** — single source of truth for lava pools,
   villages, ruined portals, iron spots, hazards and safe routes, instead of the
   same facts living in awareness, structures, memory and terrain.
3. **Runtime test harness** — stub a `bot` and tick each director, to catch the
   signature mismatches (`assessFoodReserves(inventory, context)` called with two
   arguments) that only showed up in play.
4. **Inventory & resource budget manager** — essentials vs optional in one place.
5. **Full-game phases** — Nether → End → dragon, on top of the existing entry
   pipeline.
6. **Split `bot.js`** — the remaining god object is ~2.8k lines; extract tick
   order and mode dispatch once the items above have tests.
