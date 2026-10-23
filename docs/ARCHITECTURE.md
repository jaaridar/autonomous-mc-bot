# Verdant Bot — architecture v1.2.0 Nether Speedrun World-Class

Where things live, who owns what, and the rules that keep the bot honest.
If you are adding a feature, find its layer here first.

## Layers

- `scripts/core/` — pure logic. No `@minecraft/server` imports, testable offline:
  - `math.js` — vectors, distance, keys
  - `policy.js` — MINE table, hazards, hostiles, food
  - `recipes.js` — crafting, smelting dependencies
  - `ores.js` — ore Y-levels, bulk detection
  - `navigation.js` — A* search with advanced parkour (1-gap, 2-gap sprint, jump-up, big drops, bridge cost); ignore-list, soul-sand penalty, fence/wall cannot-jump-over when strictSafety
  - `pathfinder.js` — nox7-style bidirectional A* (meet-in-the-middle), BlockSafetyChecker port, chooseSearchMode, unstuckAction, relabelPath. Engine-free.
  - `blocks.js` — exhaustive Bedrock block taxonomy (passable, solid, falling, hazard, climbable, value scoring, obstruction detection)
  - `combat.js` — mob stats, threat scoring, tactics (kite/rush/retreat/pillar), strafe, crit windows
  - `loot.js` — chest loot scoring, valuable detection, junk filtering, upgrade logic
  - `mining-strategy.js` — branch patterns, quarry, vein clustering, optimal spacing, efficiency calc, best Y
  - `resource.js` — speedrun phases (WOOD/STONE/IRON/DIAMOND/PORTAL), checklist, current phase, next needed
  - `memory.js` — persistent memory schema, prefs sanitization
  - `survival.js` — food fuel tables
  - `recovery.js`, `transfer.js`, `commands.js`
  - **NEW v1.2 Nether Speedrun:**
    - `nether-strategy.js` — ROUTES ground_lava/cave_lava/ruined_portal/gather_ignition, evaluators with score distance size danger water, chooseNetherRoute time/feasibility balance, shouldRecalculate triggers village/ruined/lava_pool/useful_chest/hostile_group/obstacle, planPortalEntry walk-in state machine, verifyPortalAction for 5 milestones
    - `village-strategy.js` — VILLAGE_BENEFITS scores, FOOD_EFFICIENCY hay 90 bread 85, evaluateVillage distance penalty/bonus benefits, shouldCraftBedIndependently 3 wool + 3 planks sheep handling, evaluateVillageVsNetherRoute comparison
    - `golem-strategy.js` — GOLEM_STATS health 100 dmg 14 range 2.5 knockback 1.5 drop 3-5 iron, 5 strategies pillar_3_high/elevated_platform/terrain_hill/doorway_trap/water_bucket, evaluateGolemFight iron deficit health equipment terrain blocks water, chooseBestGolemStrategy, shouldDisengage, collectIronDrops bucket priority
    - `food-strategy.js` — FOOD_VALUES 12 foods, thresholds critical 6 low 10-14 safe 18, assessFoodReserves totalHunger/saturation, shouldEatBeforeFight dangerous fight check, shouldAvoidCombat critical health multiple mobs, prioritizeEscapeCoverSurvival, adjustTacticForHostile 10 mob types, reassessAfterDamage
    - `bucket-strategy.js` — BUCKET_MILESTONE iron 3 priority 95, WATER_MECHANICS obsidian formation, LAVA_MECHANICS source vs flowing, PORTAL_FRAME min 10 full 14, evaluateBucketPriority, evaluateLavaPoolForBucket depth terrain water hostile escape cave warning, planObsidianFormation, planPortalConstruction, chooseFastestViableMethod
    - `flint-steel-strategy.js` — IGNITION_METHODS 5 methods flint_and_steel 95 fire_charge 80 lava_wood 50, evaluateIgnitionOptions inventory+ruined chest, shouldObtainFlintAndSteelBeforePortal prefer before commit when no delay, evaluateRuinedPortalForIgnitionAndObsidian frame completeness crying obsidian replacement, ensureIronForBothBucketAndFlintSteel bucket 3 + 1 iron, planShortestSafeRouteToIgnition, shouldNotWasteTimeSearching
    - `adaptive-planning.js` — ADAPTIVE_TRIGGERS village/ruined/lava/ground/cave/chest/hostile/obstacle/water/iron/gravel/sheep, ESSENTIAL_PROGRESSION wood/stone/iron/bucket/water/obsidian/flint_and_steel/portal/nether_entry vs OPTIONAL diamond/enchanting/redstone, shouldRecalculateAdaptive, prioritizeEssential, shouldAvoidFight, reassessRouteSafety health/terrain/enemies/escape, planBlockUsage bridges/barriers/cover/elevation, handlePlanFailure missing requirement safest alternative, preserveEmergencyResources blocks 16 food 6, verifyAction crafting/bucket/portal/ignition/entry
    - `survival-scenarios.js` — 80 scenarios pure logic A Falls 1-15 B First night 16-30 C Resource shortages 31-45 D Shelter failures 46-60 E Multi-problem 61-80
    - `world-awareness.js` — scoreSurrounding, prioritizeGoal, bridgingPlan, parkourPlan, planDeathRecovery

- `scripts/runtime/` — engine adapters and the brain:
  - `bot.js` — the brain v6: tick order, mode dispatch, task objects, integrates all advanced modules including Nether speedrun world-class: survivalMaster -> quick tool #1 -> death recovery -> food readiness adaptive recalc -> nether director -> village director -> golem director -> food director -> bucket director -> structure loot -> lava pool portal opportunity -> threat eval escape/retreat/eat/combat -> mode dispatch, obstruction clearing, scaffolding, retain important
  - `navigation.js` — `Navigator`: rolling-horizon A* / bidirectional A* (mid-range), parkour + bridging, swim-to-shore instead of failing in water, unstuck (jump/sidestep/pillar/dig), ignore exhausted cells, loop detection, threat avoidance, builder integration
  - `builder.js` — `Builder`: bridging (find support, place with sneak), pillaring (jump-place), scaffolding, torch placement, obstruction clearing, portal frame 4x5 interior 2x3 min 10 full 14
  - `combat.js` — `Combat`: tactical fighting (rush for ranged, retreat for creeper, kite for heavy, group positioning, crit jump, strafe)
  - `looting.js` — `Looting`: scored chest scanning (16 blocks), home avoidance, valuable-first withdraw, village detection via entities
  - `parkour.js` — `Parkour`: gap detection, step-up, sprint jump, ladder/vine climb, bridge assist
  - `deepminer.js` — `DeepMiner`: shaft -> branch (branchPattern) -> vein (clusterVeins flood-fill) -> ascend, with drop collection, torching
  - `mining.js` — `Miner`: legacy staircase + corridor, kept for compatibility, now supplemented by DeepMiner
  - `resource.js` — `ResourceManager`: inventory organization, opportunistic gathering, deposit decisions
  - `speedrun.js` — `SpeedrunDirector` v2.0 Nether speedrun overhaul: primary objective enter Nether quickly reliably without dying, adaptive speedrunner not fixed sequence, continuously compares ground/cave/ruined/gather, village-first, bucket milestone 95, flint steel prefer before commit, verify milestones, chooseNetherRoute, buildContext, executeNetherRoute, buildPortal, enterNether, wood/stone/iron/diamond/portal phases with upskilling retain important
  - `drops.js` — loose-drop collection with entity tracking
  - `scouting.js` — village detection + opportunistic foraging
  - `world.js` — `Terrain` with enhanced scans (storeNear 14 blocks, scanOres, findObstructions, obstructionsBelow, safeToMineEx), `BlockScan`
  - `escape.js` — `Escaper`: water/lava/trapped handling, probes 4 dirs goal-first, combat_escape for 8+ mobs bombNear ranged 6+ enderman low health
  - `survival.js` — `SurvivalDirector`: gear ladder + food
  - `foraging.js` — animal hunting
  - `inventory.js` / `hands.js` / `equipment.js` / `furnace.js` / `host.js` / `memory.js` / `exploration.js`
  - **NEW v1.2 Nether Speedrun:**
    - `nether.js` — `NetherDirector`: world-class Nether entry decision system, bucket milestone check, water fill, ignition prefer-before-commit, evaluateNetherRoutes ground/cave/ruined/missing ignition, executeRoute build_portal_ground_lava/build_portal_cave_lava/repair_ruined_portal/gather_ignition, placeWaterOnLava water+source=obsidian, repairRuinedPortalFrame, buildPortal, ignitePortal, walkIntoPortal (stand in nether_portal, wait for teleport, retry), handleInNether (lava escape, keep working without the owner), tryFillWaterBucket, countObsidianAround, hasCryingObsidianAround, findFlatGround, checkNewDiscoveries, getTimeOfDay
    - `village.js` — `VillageDirector`: village-first strategy, min equipment for safe progression, food beds hay bales crafting loot, food sources best combo accessibility saturation hunger time efficiency, loot useful chests without wasting low-value, beds skip night when useful safe, wool wood craft bed independently sheep handling, compare distance risks vs immediate Nether route, findNearestVillage 128 with budget 800 block checks fast path awareness/structures, tryLocateVillage via /locate when permitted else legit detection, hay bale, bed, sheep, weapon tier
    - `golem.js` — `GolemDirector`: iron golem combat risk management, recognize golem evaluate fighting worthwhile iron equipment health terrain time, only when benefit justifies risk reliable combat plan, understand attack range movement LOS knockback ability reach elevated, evaluate protected elevated position terrain separation, avoid fall damage unexpected block access hostile hazards, reassess health positioning continuously disengage if unsafe, collect iron drops bucket priority, never mandatory if safer faster route, 5 strategies pillar_3_high/elevated_platform/terrain_hill/doorway_trap/water_bucket, hill doorway detection, platform building, retreat spot, safer faster route check
    - `food.js` — `FoodDirector`: food healing combat readiness, maintain sufficient exploration sprinting combat emergency recovery, track hunger health saturation availability replacement, before dangerous fight eat when necessary when safe, avoid critical health insufficient resources unless no safer alternative, prioritize escape cover survival vs multiple hostile unfavorable, recognize every hostile adjust tactics attack pattern range movement environmental advantages, after damage reassess
    - `bucket.js` — `BucketDirector`: bucket major milestone enables ground-level lava pools, once obtained prioritize locating suitable lava pool or evaluating ruined portal, understand water placement lava manipulation portal-frame obsidian formation safe ignition, know how to construct Nether portal fastest viable method, evaluate ground/cave/ruined as alternative not single rigid, account depth accessibility surrounding terrain water availability hostile mobs escape routes, avoid entering cave solely because contains lava if unnecessary danger excessive travel, evaluateBucketPriority, evaluateLavaPoolForBucket, planObsidianFormation, gatherPortalOptions, tryFillWater, makeObsidian
    - `world-awareness.js` — `WorldAwareness`: runtime scanning surroundings remembering important iron ore sheep lava pools structures, tryLocateStructures via /locate when permitted, trackExplored coords visited safe routes escape paths, scanHazards cliffs drops lava water currents before movement jumping sprint-jumping climbing swimming falling block placement safe traversal, scan blockCounts entityCounts distanceMap, rememberSpot, getGoals, getNearest, getLavaPool, getWaterSource, analyzePathTo bridgingPlan parkourPlan, shouldKeep retainScore
    - `structures.js` — `StructureDetector`: detects village/ruined_portal/lava_pool via block signatures, priority queue, loot target, portal opportunity
    - `survival-master.js` — `SurvivalMaster`: 80 scenarios handler A Falls B First night C Resource shortages D Shelter failures E Multi-problem, fall detection, torch placement, shelter sealing

- `scripts/main.js` — commands and 20 Hz brain pump, handles spawn takeover, rate limiting, new commands: speedrun, deepmine, nether status

## Advanced mining flow (v1.2)

1. **Obstruction clearing** — before mining a block below, `Terrain.obstructionsBelow` finds blocks in column; if <=3, they are cleared first via `obstructionClear` state instead of blacklisting target.
2. **Tree scaffolding** — for logs >2 above bot, `Builder.scaffoldTo` pillars up with jump-place.
3. **Deep mining** — `DeepMiner` starts shaft to `bestYFor(ore)`, then branchPattern with spacing `optimalSpacing(ore)`, scans for ores via `Terrain.scanOres`, clusters via `clusterVeins`, mines vein blocks nearest-first, then ascends via recorded route.
4. **Tight scan** — 12 blocks, budget 600 cells/tick, nearest-first.
5. **Wide sweep** — 28 blocks, budget 900, re-arms when moved 10 blocks.
6. **Explore** — `Explorer` hops 12-20, with continuous 12-block watch; now also runs in `mine` mode, not just survival, so bot doesn't idle after wood/oat.
7. **Loot** — tree loot remembered in `m.loot` Map, flushed within 6 blocks before wide sweep.
8. **Drop handling** — `Drops.near` + `run` + `flush`, with `pushToward` for planner-refused hops.
9. **Nether speedrun** — `NetherDirector` + `SpeedrunDirector` v2.0 continuously evaluates ground-level lava pool (bucket+water minimal digging) vs cave lava (only when accessible usable danger travel cost acceptable) vs ruined portal (inspect frame loot determine completing faster than building new) vs alternative nearby resources gather missing ignition portal-building when required, choose best balance time feasibility resource requirements survival probability, recalculate on village/ruined/lava/chest/hostile/obstacle discovery, verify important actions crafting bucket acquisition portal construction ignition Nether entry rather than assuming succeeded.

## Movement rules v1.2

- `Navigator` now supports: walk, step, drop, bigdrop (1-3), jump (1-gap), sprintjump (2-gap), jumpup, bridge (cost 8).
- Mid-range goals (7–radius blocks) use **bidirectional A*** (nox7 Pathfinder); short hops stay direct; long trips stay rolling-horizon unidirectional; towers stay unidirectional.
- Water no longer fails the search: swim to the nearest standable shore toward the goal.
- Unstuck: jump, sidestep, pillar, dig-front, then ignore the exhausted cell and replan (up to 6 retries). Fences/walls are not jump-onto (strictSafety).
- `allowBridge` true when builder has blocks; bridging tries to find solid neighbor support.
- Loop detection: 5+ revisits in 6s or 8-11s travel with <1.5 approach; now unstucks and replans before giving up.
- `navTo(goal)` searches rings around goal (compass + 2x + up/down) for standable cells.
- `Builder` owns all placement: `placeAt(target, anchor, {sneak, allowHazard, blockType})`, `bridge(dir)`, `pillar()`, `scaffoldTo()`, `buildPortalFrame(basePos)` 4x5 interior 2x3 min 10 full 14.
- `Parkour` assists jumps: `canJumpGap`, `canStepUp`, `jump`, `sprintJump`, `climbIfNeeded`.
- `Drops.pushToward` is still only sanctioned straight-line for short hops.
- **NEW:** `WorldAwareness.scanHazards` detects cliffs drops lava water currents before movement, understands jumping sprint-jumping climbing swimming falling block placement safe traversal.

## Combat v1.2

- `Combat.evaluate` scores threats via `combatThreatScore`, picks highest priority within 8 blocks.
- Tactics: `rush` for skeletons (close distance), `retreat` for creepers (<5 blocks), `kite` for heavy melee when hp<=10, `strafe`/`pillar` for golem/ravager, `flee` for warden.
- Crit: jump then hit on way down, window 25 ticks.
- Group: find position maximizing sum distance from all mobs.
- Retreat: uses `groundNear` to find safe spot away from threat, up to 8 blocks, with hazard checks.
- **NEW:** `GolemDirector` 5 strategies pillar_3_high 3 blocks elevated_platform 12 blocks terrain_hill doorway_trap water_bucket, evaluates iron deficit health equipment terrain blocks water, only when benefit justifies risk reliable plan, avoids fall damage unexpected block access hostile environmental hazards, reassess health positioning continuously disengage if unsafe, collect iron drops bucket priority, never mandatory if safer faster route.
- **NEW:** `FoodDirector` maintains sufficient food exploration sprinting combat emergency recovery, tracks hunger health saturation availability replacement, before dangerous fight eat when necessary when safe, avoids critical health insufficient resources unless no safer alternative, prioritizes escape cover survival vs multiple hostile unfavorable, recognizes every hostile adjusts tactics attack pattern range movement environmental advantages, after damage reassess instead blindly continuing plan.

## Looting v1.2

- `Looting.scan` every 20 ticks, radius 16, parity optimization.
- `shouldLootChest` checks free slots, home distance <48 = player base, distance >16 = too far.
- `chooseLoot` scores via `LOOT_VALUE`, valuable first, junk filtered.
- `withdraw` uses same rollback-safe transfer as deposit.
- Village detection via `villager/villager_v2/wandering_trader/cat/iron_golem` entities within 64 blocks.
- **NEW:** `VillageDirector` village-first as soon as min equipment for safe progression, prioritizes villages food beds hay bales crafting loot speedrun advantages, inspects food sources best combo accessibility saturation hunger restoration time efficiency, loots useful chests gather food without wasting low-value, identifies beds skip night when useful safe, if no village/bed obtains wool wood craft bed efficiently hunts sheep wool when necessary wool blocks planks required, does not assume village always best compares distance risks vs immediate Nether route, hay bale at pos 9 wheat = 3 bread best efficiency, budgeted scanning 800 blocks.

## Resource management v1.2

- `ResourceManager` auto-organizes when >6 partial stacks.
- Opportunistic: scans item entities within 8 blocks, picks high priority (>=50).
- Deposit when low-value items >16 and free slots <5.
- Phases via `currentPhase(counts)`, next needed via `nextNeeded`.
- **NEW:** `BucketDirector` bucket major milestone priority 95 enables ground-level lava pools, once obtained prioritizes locating suitable lava pool or evaluating ruined portal, understands water placement lava manipulation portal-frame obsidian formation safe ignition, knows how to construct Nether portal fastest viable method, evaluates ground-level cave ruined as alternative not single rigid, accounts depth accessibility surrounding terrain water availability hostile mobs escape routes when choosing lava pool, avoids entering cave solely because contains lava if unnecessary danger excessive travel.
- **NEW:** `FoodDirector` + `adaptive-planning` preserveEmergencyResources blocks 16 food 6 wood 8 cobblestone 16, retainScore never drop critical progression emergency supplies, drop genuinely unnecessary when needed never essential.

## Speedrun v1.2 Nether Speedrun World-Class

- Primary objective: enter Nether as quickly and reliably as possible without dying — autonomous, intelligent, survival over risk.
- World Awareness & Exploration: continuous awareness entities hostile animals blocks terrain structures hazards resources, identify villages ruined portals lava pools caves ravines early, use /locate when permitted else legit detection via runCommand, evaluate structures usefulness/distance/loot/danger/time cost, track coords explored locations known lava pools safe routes escape paths, detect cliffs drops lava water currents before movement, understand jumping sprint-jumping climbing swimming falling block placement safe traversal.
- Essential Resource Acquisition: gather only required for current stage while collecting useful extras when convenient, know recipes ingredients prerequisites uses essential survival speedrun items, understand tool progression crafting-table furnace inventory material efficiency, acquire wood stone food iron buckets correct order, monitor durability food reserves blocks inventory capacity remaining materials, drop genuinely unnecessary when needed never essential progression emergency supplies.
- Village-First Strategy: as soon as min equipment for safe progression evaluate village vs independent, prioritize villages food beds hay bales crafting loot speedrun advantages, inspect food sources calculate best combo accessibility saturation hunger restoration time efficiency, loot useful chests gather food without wasting low-value, identify beds skip night when useful safe, if no village/bed obtain wool wood craft bed efficiently hunt sheep wool when necessary understand wool blocks planks required, do not assume village always best compare distance risks vs immediate Nether route.
- Iron Golem Combat & Risk Management: recognize golem evaluate fighting worthwhile based iron equipment health terrain time, only attempt when benefit justifies risk reliable combat plan, understand attack range movement LOS knockback ability reach elevated, evaluate protected elevated position or suitable terrain separation, avoid fall damage unexpected block access other hostile environmental hazards, reassess health positioning continuously disengage if unsafe, collect iron drops efficiently prioritize bucket, never mandatory if safer faster route available.
- Food Healing Combat Readiness: maintain sufficient food exploration sprinting combat emergency recovery, track hunger health saturation availability replacement, before dangerous fight eat when necessary when safe, avoid beginning combat critical health insufficient resources unless no safer alternative, prioritize escape cover survival vs multiple hostile unfavorable, recognize every relevant hostile adjust tactics attack pattern range movement environmental advantages, after damage reassess instead blindly continuing plan.
- Bucket Acquisition & Nether Preparation: bucket major milestone enables ground-level lava pools, once obtained prioritize locating suitable lava pool or evaluating ruined portal, understand water placement lava manipulation portal-frame obsidian formation safe ignition, know how to construct Nether portal available resources fastest viable method, evaluate ground-level cave ruined as alternative not single rigid, account depth accessibility surrounding terrain water availability hostile mobs escape routes when choosing lava pool, avoid entering cave solely because contains lava if unnecessary danger excessive travel.
- Flint and Steel & Portal Ignition: prefer obtaining flint and steel before committing to portal location when not creating unnecessary delays, check nearby ruined portals usable obsidian flint and steel fire charges loot, evaluate chest contents portal condition whether repairing faster than new, if unavailable evaluate crafting using iron flint, if flint missing locate gravel obtain using appropriate mining, ensure enough iron remains for flint and steel after bucket unless other ignition available, do not waste time searching if faster reliable ignition already available, if no ignition plan shortest safe route to obtain missing material before committing.
- Nether Entry Decision System: continuously compare ground-level lava pool bucket water minimal digging, cave lava pool only when accessible usable danger travel cost acceptable, ruined portal inspect frame loot determine completing faster than building new, alternative nearby resources gather missing ignition portal-building when required, choose route best balance time feasibility resource requirements survival probability, do not insist original when world provides better alternative.
- Adaptive Planning & Survival Rules: recalculate whenever discovers village ruined portal lava pool useful chest hostile mob group unexpected obstacle, prioritize essential progression over optional exploration unnecessary collection, avoid fights not contributing meaningfully, never assume route safe merely because worked previously reassess current health terrain enemies escape paths, use blocks intelligently bridges barriers emergency cover elevation controlled traversal, when plan fails identify missing requirement select safest efficient alternative, preserve enough resources recover common emergencies, verify important actions crafting bucket acquisition portal construction ignition Nether entry rather than assuming succeeded.
- Final principle: behave like experienced adaptive speedrunner not fixed sequence scripted actions. Objective not collect everything or win every fight — reach Nether efficiently using resources opportunities available in current world while avoiding preventable deaths. Main goal enter nether anyhow prepare itself find resource recipe or in world use any advantage.

## Honesty contract

- Items observed and moved with rollback-protected transfers — never fabricated.
- `tell()` = chat to owner; `reason` = HUD; `blockTask` = stop with kind manual/retry.
- Entity disappearance = pickup success; inventory delta = quota success.
- **NEW:** Verify important actions crafting bucket acquisition portal construction ignition Nether entry rather than assuming succeeded.

## Adding a feature v1.2

1. Pure logic in `core/`, engine touches in `runtime/`.
2. New modules: follow existing pattern — constructor(bot), tick(tick), reset(), with bounded budgets (max 800 block checks, max 20 ticks per scan, max 64 log entries, etc).
3. Every loop budgeted (ticks or attempts) and ends with actionable message.
4. Run verification: `node tools/run-all.mjs` — must pass parse, linkcheck, undef, imports, core tests, walkable, flush, and selftest must fail (proves no-undef gate still catches bugs).
5. For fast dev: keep core pure, runtime thin, no circular deps, JSDoc comments, small files, no item fabrication, rollback-safe transfers, hazard checks before mining, shelters always reopenable, owner-gated, circuit breaker.
6. **NEW:** For Nether speedrun, follow 9-point checklist above, ensure bucket milestone priority 95, village-first evaluation, golem risk management, food healing readiness, flint steel before commit, adaptive recalc on discovery, verify important actions.
