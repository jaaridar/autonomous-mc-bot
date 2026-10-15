# Verdant Bot — architecture v0.9.0 Advanced

Where things live, who owns what, and the rules that keep the bot honest.
If you are adding a feature, find its layer here first.

## Layers

- `scripts/core/` — pure logic. No `@minecraft/server` imports, testable offline:
  - `math.js` — vectors, distance, keys
  - `policy.js` — MINE table, hazards, hostiles, food
  - `recipes.js` — crafting, smelting dependencies
  - `ores.js` — ore Y-levels, bulk detection
  - `navigation.js` — A* search with advanced parkour (1-gap, 2-gap sprint, jump-up, big drops, bridge cost)
  - `blocks.js` — exhaustive Bedrock block taxonomy (passable, solid, falling, hazard, climbable, value scoring, obstruction detection)
  - `combat.js` — mob stats, threat scoring, tactics (kite/rush/retreat/pillar), strafe, crit windows
  - `loot.js` — chest loot scoring, valuable detection, junk filtering, upgrade logic
  - `mining-strategy.js` — branch patterns, quarry, vein clustering, optimal spacing, efficiency calc, best Y
  - `resource.js` — speedrun phases (WOOD/STONE/IRON/DIAMOND/PORTAL), checklist, current phase, next needed
  - `memory.js` — persistent memory schema, prefs sanitization
  - `survival.js` — food fuel tables
  - `recovery.js`, `transfer.js`, `commands.js`

- `scripts/runtime/` — engine adapters and the brain:
  - `bot.js` — the brain v5: tick order, mode dispatch, task objects, integrates all advanced modules, obstruction clearing, scaffolding
  - `navigation.js` — `Navigator`: rolling-horizon A* with parkour + bridging awareness, loop detection, threat avoidance, builder integration
  - `builder.js` — `Builder`: bridging (find support, place with sneak), pillaring (jump-place), scaffolding, torch placement, obstruction clearing
  - `combat.js` — `Combat`: tactical fighting (rush for ranged, retreat for creeper, kite for heavy, group positioning, crit jump, strafe)
  - `looting.js` — `Looting`: scored chest scanning (16 blocks), home avoidance, valuable-first withdraw, village detection via entities
  - `parkour.js` — `Parkour`: gap detection, step-up, sprint jump, ladder/vine climb, bridge assist
  - `deepminer.js` — `DeepMiner`: shaft -> branch (branchPattern) -> vein (clusterVeins flood-fill) -> ascend, with drop collection, torching
  - `mining.js` — `Miner`: legacy staircase + corridor, kept for compatibility, now supplemented by DeepMiner
  - `resource.js` — `ResourceManager`: inventory organization, opportunistic gathering, deposit decisions
  - `speedrun.js` — `SpeedrunDirector`: end-to-end speedrun (wood->stone->iron->diamond->portal), phase tracking
  - `drops.js` — loose-drop collection with entity tracking
  - `scouting.js` — village detection + opportunistic foraging
  - `world.js` — `Terrain` with enhanced scans (storeNear 14 blocks, scanOres, findObstructions, obstructionsBelow, safeToMineEx), `BlockScan`
  - `escape.js` — `Escaper`: water/lava/trapped handling, probes 4 dirs goal-first
  - `survival.js` — `SurvivalDirector`: gear ladder + food
  - `foraging.js` — animal hunting
  - `inventory.js` / `hands.js` / `equipment.js` / `furnace.js` / `host.js` / `memory.js` / `exploration.js`

- `scripts/main.js` — commands and 20 Hz brain pump, handles spawn takeover, rate limiting, new commands: speedrun, deepmine

## Advanced mining flow (v0.9)

1. **Obstruction clearing** — before mining a block below, `Terrain.obstructionsBelow` finds blocks in column; if <=3, they are cleared first via `obstructionClear` state instead of blacklisting target. Fixes "mines block below but can't get below".
2. **Tree scaffolding** — for logs >2 above bot, `Builder.scaffoldTo` pillars up with jump-place.
3. **Deep mining** — `DeepMiner` starts shaft to `bestYFor(ore)`, then branchPattern with spacing `optimalSpacing(ore)`, scans for ores via `Terrain.scanOres`, clusters via `clusterVeins`, mines vein blocks nearest-first, then ascends via recorded route.
4. **Tight scan** — 12 blocks, budget 600 cells/tick, nearest-first.
5. **Wide sweep** — 28 blocks, budget 900, re-arms when moved 10 blocks.
6. **Explore** — `Explorer` hops 12-20, with continuous 12-block watch; now also runs in `mine` mode, not just survival, so bot doesn't idle after wood/oat.
7. **Loot** — tree loot remembered in `m.loot` Map, flushed within 6 blocks before wide sweep.
8. **Drop handling** — `Drops.near` + `run` + `flush`, with `pushToward` for planner-refused hops.

## Movement rules v0.9

- `Navigator` now supports: walk, step, drop, bigdrop (1-3), jump (1-gap), sprintjump (2-gap), jumpup, bridge (cost 8).
- `allowBridge` true when builder has blocks; bridging tries to find solid neighbor support.
- Loop detection: 5+ revisits in 6s or 8-11s travel with <1.5 approach.
- `navTo(goal)` searches rings around goal (compass + 2x + up/down) for standable cells.
- `Builder` owns all placement: `placeAt(target, anchor, {sneak, allowHazard, blockType})`, `bridge(dir)`, `pillar()`, `scaffoldTo()`.
- `Parkour` assists jumps: `canJumpGap`, `canStepUp`, `jump`, `sprintJump`, `climbIfNeeded`.
- `Drops.pushToward` is still only sanctioned straight-line for short hops.

## Combat v0.9

- `Combat.evaluate` scores threats via `combatThreatScore`, picks highest priority within 8 blocks.
- Tactics: `rush` for skeletons (close distance), `retreat` for creepers (<5 blocks), `kite` for heavy melee when hp<=10, `strafe`/`pillar` for golem/ravager, `flee` for warden.
- Crit: jump then hit on way down, window 25 ticks.
- Group: find position maximizing sum distance from all mobs.
- Retreat: uses `groundNear` to find safe spot away from threat, up to 8 blocks, with hazard checks.

## Looting v0.9

- `Looting.scan` every 20 ticks, radius 16, parity optimization.
- `shouldLootChest` checks free slots, home distance <48 = player base, distance >16 = too far.
- `chooseLoot` scores via `LOOT_VALUE`, valuable first, junk filtered.
- `withdraw` uses same rollback-safe transfer as deposit.
- Village detection via `villager/villager_v2/wandering_trader/cat/iron_golem` entities within 64 blocks.

## Resource management v0.9

- `ResourceManager` auto-organizes when >6 partial stacks.
- Opportunistic: scans item entities within 8 blocks, picks high priority (>=50).
- Deposit when low-value items >16 and free slots <5.
- Phases via `currentPhase(counts)`, next needed via `nextNeeded`.

## Speedrun v0.9

- Phases: WOOD (8 logs, table, wooden pick), STONE (20 cobble, stone pick/sword, furnace, 12 torch), IRON (12 raw iron, smelt, iron pick, bucket), DIAMOND (5 diamond, diamond pick), PORTAL (10 obsidian).
- Each phase uses `obtain` which triggers mining/crafting.
- Uses `DeepMiner` for iron/diamond.

## Honesty contract

- Items observed and moved with rollback-protected transfers — never fabricated.
- `tell()` = chat to owner; `reason` = HUD; `blockTask` = stop with kind manual/retry.
- Entity disappearance = pickup success; inventory delta = quota success.

## Adding a feature v0.9

1. Pure logic in `core/`, engine touches in `runtime/`.
2. New modules: follow existing pattern — constructor(bot), tick(tick), reset(), with bounded budgets.
3. Every loop budgeted (ticks or attempts) and ends with actionable message.
4. Run verification: `node tools/run-all.mjs` — must pass parse, linkcheck, undef, imports, core tests, walkable, flush, and selftest must fail.
5. For fast dev: keep core pure, runtime thin, no circular deps, JSDoc comments, small files.
