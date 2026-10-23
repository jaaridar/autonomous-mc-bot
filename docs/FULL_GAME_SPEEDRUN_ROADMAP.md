# Verdant Bot — Full Game Speedrun Roadmap: World-Class Top 20 Plans, Rated & Ranked

Goal: refactor architecture for autonomous bot to speedrun **entire Minecraft** (Overworld → Nether → End → Dragon) without breaking existing things, following documentation (core pure, runtime thin, bounded budgets, no circular deps, verification suite must pass, honesty contract, safety model).

Current baseline: **v1.3.0** — general engines (mobs, combat planning, recipes,
needs) + pathfinder + autonomous Nether travel.
`node tools/run-all.mjs` runs core 26, pathfinder/anti-stuck 73, travel/service 88,
general 114, brain 72, survival 5, walkable 121, drop-flush, perf 56 and the
no-undef gate, all green.

Since v1.2.8 the "hardcoded" layer is being removed:

* `core/mobs.js` — one archetype table + name/family inference, so every mob
  (including modded ones) has stats, traits and drops.
* `core/combat-plan.js` — fights decided from damage arithmetic for any group
  size (engage / kite / shield_advance / cover / tower / retreat / flee).
* `core/recipe-book.js` — 263 generated recipes plus an acquisition graph, so an
  item the curated table never listed still resolves to real steps.
* `core/needs.js` — survival needs ranked by severity; the legacy 80 scenarios
  are now a backstop that can be deleted piece by piece.

Since v1.2.0 the Nether is no longer a paused dimension:

* `core/pathfinder.js` — port of the nox7 A*/Bidirectional A* model (walk, diagonal,
  step, drop, jump, sprint-jump, dig, bridge, pillar, Y-axis flood; avoid lists,
  ignore lists, node budgets, slicing). `runtime/pathfinder.js` + `navigation.js`
  hand wide plans to the waypoint loop.
* `core/anti-stuck.js` + `runtime/stuck-recovery.js` — live no-progress ladder with
  capability filtering, cooldowns, oscillation detection and an honest pause.
* `core/portal.js` + `runtime/portal-travel.js` — build a 4×5 frame from real
  obsidian (corners optional, 10 blocks), light it with real flint & steel, enter,
  transit with a 1:8 linked fallback, arrive on a safe platform, remember the origin
  frame, and return with **zero** obsidian via the link.
* `runtime/nether-explore.js` — leash, trip budget, quartz/gold mining, fortress and
  bastion targets, return triggers. `core/knowledge.js` knows the structures.

End travel (stronghold, eyes, dragon) is still planned, not implemented.

---

## Bug Audit (v1.2.0) — Fixed in this PR

| # | Location | Bug | Severity | Fix |
|---|----------|-----|----------|-----|
| 1 | core/food-strategy.js | `assessFoodReserves(inventory, context)` called with 2 args in bot.js/speedrun.js but defined with 1 arg — extra arg ignored, loses hunger/health context | Medium | Made second param optional `context={}` and compute `status` critical/low/ok from cur hunger |
| 2 | core/flint-steel-strategy.js | `ensureIronForBothBucketAndFlintSteel(inventory, context)` called with 2 args in speedrun.js/nether.js but defined with 1 arg, return shape missing `enough`/`need` fields used by callers | Medium | Added optional `context`, added `enough`/`need`/`needMore` fields backward compatible |
| 3 | runtime/village.js | `findNearestVillage(128)` scans 128 radius with step 4 dy -4..4 = 36k block checks per call, plus `dimension.getEntities` radius 128 expensive, called every tick via `buildContext` double scan | High | Budgeted to 800 block checks, step 8, fast path via awareness/structures, entity scan limited to 48, cache sheep lookup, avoid recursive scan in buildContext |
| 4 | runtime/bucket.js | `planObsidianFormation` called with object `{hasWaterBucket...}` but signature is `(lavaPool, hasWaterBucket, hasBucket)` | High | Fixed to `planObsidianFormation(lavaPool, true, true)` + check `feasible` |
| 5 | runtime/bucket.js | `chooseFastestViableMethod` called with array `methods` but expects options object `{groundLava, caveLava, ruinedPortal}` | High | Fixed to `gatherPortalOptions` returning options object, use `bestRoute` |
| 6 | runtime/food.js | Imported `FOOD_THRESHOLDS` which doesn't exist, should be `COMBAT_FOOD_THRESHOLD`/`HEALTH_THRESHOLDS` | High | Fixed import + rewrote to match actual signatures `assessFoodReserves(inventory)`, `shouldEatBeforeFight(hunger,health,threatCount,threatTypes)` etc |
| 7 | runtime/nether.js | Uses `this.bot.structures.found` but StructureDetector stores in `found`? Check `structures.js` uses `this.found` — okay but `getTopPriority` vs `found` inconsistency | Low | Added fallback to `getTopPriority` + null checks |
| 8 | runtime/village.js | `buildContext` calls `findNearestVillage(128)` and `findSheepNearby(64)` twice each — double entity scans per tick | Medium | Cached sheep lookup, set `hasVillage: null` to avoid recursive expensive scan |
| 9 | core/bucket-strategy.js | `evaluateLavaPoolForBucket` returns `isCave` boolean but runtime checks `lavaEval.isCave` + `feasibility` — okay but `feasibility` not always set | Low | Ensure `feasibility` always set via fallback |
| 10 | docs/ARCHITECTURE.md | Still v0.9.0, missing 12 new modules, Nether speedrun not documented | Medium | Updated to v1.2.0 with full layer list |

All fixed, `tools/run-all.mjs` passes: 58 modules 0 failed, no-undef OK, 26 core tests, 121 walkable.

---

## Top 20 Refactor Plans — Rated (1-10, 10 best) & Ranked

Scoring: Impact (full-game speedrun capability), Compatibility (follows docs, doesn't break existing), Risk (10 = lowest risk), Extensibility (future phases), Effort (10 = lowest effort), Doc Alignment (follows core pure/runtime thin/bounded budgets/no circular deps/verification/honesty/safety)

| Rank | Plan | Impact | Compat | Risk | Extens | Effort | Doc Align | Total/60 | Description |
|------|------|--------|--------|------|--------|--------|-----------|----------|-------------|
| 1 | **Blackboard / WorldModel** | 10 | 9 | 9 | 10 | 7 | 10 | 55 | Single source of truth: lava pools, villages, ruined portals, iron spots, hazards, explored, safe routes, escape paths. Currently scattered across awareness, structures, memory, terrain, builder. Core module `core/world-model.js` pure, runtime syncs. |
| 2 | **Verification & Recovery Layer** | 9 | 10 | 10 | 9 | 8 | 10 | 56 | Central `core/verification.js` verifies bucket/water/obsidian/portal/ignition/entry rather than assuming, triggers recovery. Follows honesty contract, existing `verifyPortalAction` etc. Low risk, high doc alignment. |
| 3 | **Inventory & Resource Budget Manager** | 9 | 9 | 9 | 9 | 7 | 10 | 53 | Central `core/resource-budget.js` + `runtime/resource-budget.js` tracks essential vs optional, preserves emergency blocks 16 food 6 wood 8 cobble 16, retainScore, drop decisions, organize/deposit. Already partially exists via `retainScore`, `resource.js`. |
| 4 | **Documentation & Architecture v1.2 Update** | 8 | 10 | 10 | 8 | 9 | 10 | 55 | Update ARCHITECTURE.md, COMMANDS.md, README.md to reflect 12 new modules, Nether pipeline, full-game roadmap, keep docs in sync. Required by task, zero break risk. |
| 5 | **Performance & Tick Budgeting** | 8 | 9 | 9 | 9 | 8 | 10 | 53 | `core/tick-budget.js` gives each director time slice per tick (e.g., 5ms max), ensures 20Hz brain pump. Fixes village 36k scan bug. Follows bounded budgets rule. |
| 6 | **Testing Harness for Runtime** | 9 | 10 | 10 | 9 | 6 | 10 | 54 | Add `tools/test-runtime.mjs` stubbed bot tests for directors (nether, village, golem, bucket, food) to catch signature mismatches like we saw. Follows verification suite, no break. |
| 7 | **Safe Movement & Hazard Director** | 9 | 9 | 9 | 10 | 6 | 10 | 53 | Consolidate cliff/lava/water current detection, bridging, parkour, scaffolding into `core/movement-safety.js` + `runtime/movement.js`. Used by all directors. Follows safety model. |
| 8 | **Unified Nether Entry Pipeline** | 10 | 9 | 8 | 9 | 6 | 9 | 51 | Merge nether, bucket, flint-steel, speedrun portal phase into single `core/nether-pipeline.js` with stages acquire bucket → water → find lava/ruined → obsidian → flint&steel → build → ignite → enter, verification each stage. Currently duplication between nether.js and speedrun.js portalPhase. |
| 9 | **Event-Driven Discovery Bus** | 8 | 9 | 8 | 10 | 7 | 10 | 52 | Replace polling every 60 ticks with `core/event-bus.js` publish/subscribe: village/ruined/lava/chest/hostile discovered → trigger recalc via observer. Follows bounded budgets, reduces CPU. |
| 10 | **Goal-Oriented Action Planning (GOAP) Light** | 10 | 8 | 7 | 10 | 5 | 9 | 49 | Replace sequential early-return directors in bot.js think() with prioritized goal stack: each director proposes goals with priority, planner picks best. Fixes priority conflicts (nether vs village vs golem). Light version keeps existing mode dispatch, adds `core/goal-planner.js`. |
| 11 | **Dimension Abstraction Layer** | 10 | 7 | 6 | 10 | 4 | 9 | 46 | Remove Overworld-only pause, add `core/dimension.js` + `runtime/dimension-manager.js` handles Overworld/Nether/End transitions, tracks portal positions, dimension-specific hazards. Needed for full-game but higher risk. |
| 12 | **Combat Director Unification** | 9 | 8 | 7 | 9 | 5 | 9 | 47 | Merge combat.js, golem.js, survival-master combat, food combat readiness into single CombatDirector with tactics per mob, group handling, disengage, food integration. Reduces duplication. |
| 13 | **Structure & Loot Director Consolidation** | 8 | 8 | 8 | 9 | 6 | 9 | 48 | Merge structures.js, looting.js, village detection, world-awareness chest tracking into one StructureDirector with priority queue. Currently overlap. |
| 14 | **Speedrun Phase State Machine + Metrics** | 8 | 9 | 9 | 9 | 7 | 10 | 52 | Replace simple PHASES enum with state machine tracking time in each phase, attempts, failures, adaptive recalc count, exposes via !bot speedrun status. Follows docs, low risk. |
| 15 | **Village & Trading & Food Economy** | 7 | 8 | 8 | 9 | 6 | 9 | 47 | Extend village director to trading, food economy, hay bale efficiency, bed mechanics, golem iron economy as unified VillageEconomy. Future phase. |
| 16 | **Full-Game Speedrun Roadmap (Nether+End)** | 10 | 7 | 6 | 10 | 3 | 9 | 45 | Add modules for Nether fortress blaze rods pearls, End stronghold eyes dragon as future phases, interfaces stubbed now but not breaking existing. High impact but high effort. |
| 17 | **Command & Telemetry Expansion** | 7 | 10 | 10 | 8 | 8 | 10 | 53 | Add !bot nether status, !bot route, !bot goals commands showing blackboard, current route evaluation, goal stack, without breaking existing commands. Follows COMMANDS.md pattern. |
| 18 | **Death Recovery & Respawn in Nether** | 8 | 8 | 7 | 9 | 5 | 9 | 46 | Extend death recovery to handle Nether dimension, portal return, item recovery across dimensions. Needed for full-game but medium risk. |
| 19 | **Config & Feature Flags** | 6 | 10 | 10 | 8 | 9 | 10 | 53 | Add feature flags for Nether speedrun, village-first, golem combat, food, bucket, so users can toggle via !bot config and preserve backward compatibility. Zero break. |
| 20 | **Split bot.js God Object into Brain + Mode Handlers** | 9 | 7 | 6 | 10 | 4 | 9 | 45 | Extract think() 1824 lines into separate Brain class that orchestrates directors, keeps bot.js as thin facade. High impact for maintainability but higher risk of breaking existing mode dispatch. |

**Ranking by Total Score:**
1. Verification & Recovery (56)
2. Blackboard / WorldModel (55) + Documentation Update (55)
4. Testing Harness (54)
5. Inventory Budget (53) + Performance Budget (53) + Safe Movement (53) + Command Telemetry (53) + Config Flags (53)
10. Event Bus (52) + State Machine Metrics (52)
12. Unified Nether Pipeline (51)
13. Structure Consolidation (48)
14. Combat Unification (47) + Village Economy (47)
16. Dimension Layer (46) + Death Recovery Nether (46)
18. Full-Game Roadmap (45) + Split God Object (45)

---

## Top 10 Implementation Plan — Must Follow Documentation, Must Not Break Existing

These 10 are selected for highest doc alignment (10/10 or 9/10), lowest risk (8-10), and preserve existing verification suite.

### 1. Documentation & Architecture v1.2 Update [DONE]
- **Why #1:** Zero break risk, required by task, follows docs.
- **Implementation:**
  - Update `docs/ARCHITECTURE.md` to v1.2.0 with full layer list including 12 new modules, Nether speedrun 9-point checklist, movement rules v1.2, combat v1.2, looting v1.2, resource v1.2, speedrun v1.2, honesty contract verification.
  - Update `docs/COMMANDS.md` with `!bot nether` status command placeholder.
  - Update `README.md` Current limits: Nether entry now implemented, Overworld→Nether works, Nether→End still planned.
  - Keep `core/` pure, `runtime/` thin pattern.
- **Verification:** `node tools/run-all.mjs` must still pass.
- **Status:** DONE in this PR.

### 2. Verification & Recovery Layer
- **Why:** Highest score 56, follows honesty contract "verify important actions rather than assuming succeeded", low risk.
- **Implementation:**
  - Create `core/verification.js` pure: `verify(bucket, water, obsidian, portalFrame, ignition, netherEntry, inventory, world)` returns `{success, reason, shouldRetry, nextAction}`. Reuse existing `verifyPortalAction`, `verifyAction` from adaptive-planning.
  - Create `runtime/verifier.js` thin adapter: `constructor(bot)`, `tick(tick)` checks last 5 milestones via blackboard, if assumed success fails triggers `bot.record` + `handlePlanFailure`.
  - Integrate into `bot.js` think() after Nether director, before mode dispatch, with bounded budget (max 5 checks per tick).
  - No circular deps: core doesn't import runtime, runtime imports core.
- **Docs:** Follows Adding a feature v1.2 step 1-5.

### 3. Blackboard / WorldModel
- **Why:** Score 55, fixes scattered state (awareness, structures, memory, terrain, builder), high impact for full-game.
- **Implementation:**
  - Create `core/world-model.js` pure: `class WorldModel { constructor() { lavaPools=[], waterSources=[], villages=[], ruinedPortals=[], ironSpots=[], hazards=[], explored=Map, safeRoutes=[], escapePaths=[] } add(type,pos,score,tick), getNearest(type,origin), getBestRoute(options,context), prune() }` No `@minecraft/server` imports.
  - Create `runtime/world-model-sync.js` thin: syncs from `awareness`, `structures`, `terrain`, `memory` into blackboard every 60 ticks, budget 800 checks.
  - Refactor `nether.js`, `village.js`, `bucket.js`, `speedrun.js` to read from blackboard instead of directly querying awareness/structures, reducing duplication.
  - Keep existing `awareness` and `structures` as producers, blackboard as consumer — no break.
- **Verification:** Existing tests still pass, new unit tests for WorldModel in `tools/test.mjs`.

### 4. Testing Harness for Runtime
- **Why:** Score 54, catches bugs like signature mismatches we found, follows verification suite.
- **Implementation:**
  - Create `tools/test-runtime.mjs` that stubs `bot` object with `bag.counts()`, `terrain.block()`, `awareness.getLavaPool()`, etc., and runs each director's `tick()` with fake tick.
  - Add to `tools/run-all.mjs` as new step `runtime unit tests`.
  - Test cases: bucket milestone priority, nether route scoring, village distance, golem fight, food reserves.
  - No network, no dependencies, follows existing `test.mjs` pattern.
- **Docs:** Follows verification rule.

### 5. Inventory & Resource Budget Manager
- **Why:** Score 53, already partially exists via `retainScore`, `resource.js`, needed for full-game.
- **Implementation:**
  - Create `core/resource-budget.js` pure: `ESSENTIAL` list, `OPTIONAL` list, `preserveEmergencyResources(inventory)` blocks 16 food 6 wood 8 cobble 16, `shouldKeep(typeId,count,freeSlots)`, `prioritizeEssential(tasks)`.
  - Create `runtime/resource-budget.js` thin: `organizeIfNeeded`, `depositIfNeeded`, `dropLowValue`, uses rollback-safe transfers.
  - Refactor `bot.js retainImportant()` to use new manager, keep existing behavior.
  - Bounded: max 10 inventory scans per tick.
- **Docs:** Follows resource management v1.2.

### 6. Performance & Tick Budgeting
- **Why:** Score 53, fixes village 36k scan bug, ensures 20Hz brain pump.
- **Implementation:**
  - Create `core/tick-budget.js` pure: `class TickBudget { constructor(maxMs) { budget=maxMs, used=0 } start(), check(), end() }`
  - In `bot.js` think(), wrap each director tick with budget check: `if (budget.exceeded) { record("tick budget exceeded, deferring "+director); return; }`
  - Update `village.js` to use budget 800 checks (already fixed).
  - Add metrics to `!bot status`: tick budget used.
- **Docs:** Follows bounded budgets rule.

### 7. Safe Movement & Hazard Director
- **Why:** Score 53, consolidates cliff/lava/water detection, bridging, parkour, scaffolding.
- **Implementation:**
  - Create `core/movement-safety.js` pure: `detectHazards(pos, terrain)`, `planSafePath(from,to,hazards)`, `shouldBridge(gap)`, `shouldPillar(height)`, `bridgeCost`, `fallRisk`.
  - Create `runtime/movement.js` thin: uses `builder`, `parkour`, `navigation`, `terrain`, exposes `findSafeSpot`, `findRetreatSpot`, `findFlatGround`.
  - Refactor `nether.js`, `bucket.js`, `golem.js` to use movement director instead of duplicating `findFlatGround`, `findRetreatSpot`.
  - No circular deps: movement doesn't import nether/village/golem.
- **Docs:** Follows movement rules v1.2, safety model.

### 8. Command & Telemetry Expansion
- **Why:** Score 53, zero break risk, follows COMMANDS.md pattern.
- **Implementation:**
  - In `scripts/main.js`, add `!bot nether` → shows `nether.currentRoute`, `bucket` status, `ignition` options, `portal` built, `verified` milestones.
  - Add `!bot route` → shows `chooseNetherRoute` evaluation ground/cave/ruined scores.
  - Add `!bot goals` → shows goal stack from future GOAP, currently shows top structure priority, lava pools, villages.
  - Keep existing commands, rate-limited, owner-gated.
- **Docs:** Update `docs/COMMANDS.md`.

### 9. Event-Driven Discovery Bus
- **Why:** Score 52, replaces polling every 60 ticks, reduces CPU, high extensibility.
- **Implementation:**
  - Create `core/event-bus.js` pure: `class EventBus { on(event, cb), emit(event, data), off() }` No server imports.
  - Events: `village_discovered`, `ruined_portal_discovered`, `lava_pool_discovered`, `useful_chest_discovered`, `hostile_group_discovered`, `obstacle_discovered`.
  - In `world-awareness.js` and `structures.js`, emit events when new discovery tick < 120 and priority >=80.
  - In `nether.js`, `village.js`, `speedrun.js`, subscribe to events and set `lastRecalc=0` to trigger recalc, instead of polling.
  - Bounded: max 10 events per tick, queue.
- **Docs:** Follows pure logic in core, engine touches in runtime.

### 10. Speedrun Phase State Machine + Metrics
- **Why:** Score 52, low risk, follows docs, needed for full-game metrics.
- **Implementation:**
  - Create `core/speedrun-state-machine.js` pure: states WOOD, STONE, IRON, BUCKET, OBSIDIAN, PORTAL, NETHER, FORTRESS, BLAZE, PEARL, STRONGHOLD, END, DRAGON. Transitions based on inventory + world model. Tracks `timeInPhase`, `attempts`, `failures`, `adaptiveRecalcCount`.
  - Refactor `speedrun.js` to use state machine instead of simple PHASES enum, keep existing `currentPhase(counts)` as fallback for backward compatibility.
  - Expose via `!bot speedrun status` and `bot.js` status.
  - No break: existing `PHASES` still works, new states are superset.
- **Docs:** Follows speedrun v1.2, adds metrics.

---

## Full-Game Speedrun Future Phases (After Top 10)

Once top 10 done, implement in order:

11. **Unified Nether Entry Pipeline** (Rank 12) — merge duplication.
12. **Structure & Loot Consolidation** (Rank 13) — merge structures/looting/village detection.
13. **Combat Unification** (Rank 14) — single CombatDirector.
14. **Dimension Abstraction** (Rank 16) — Overworld/Nether/End manager.
15. **Village & Trading Economy** (Rank 15)
16. **Death Recovery Nether** (Rank 18)
17. **Full-Game Roadmap Nether+End** (Rank 18) — fortress, blaze rods, pearls, stronghold, eyes, dragon.
18. **Config Flags** (Rank 5 tie) — feature flags for backward compat.
19. **Split God Object** (Rank 20) — Brain class extraction.
20. **Goal-Oriented Action Planning** (Rank 10) — full GOAP after blackboard stable.

---

## How This Follows Documentation & Doesn't Break Existing

- **Core pure, runtime thin:** All new logic in `core/` pure, no `@minecraft/server` imports, testable offline. Runtime only adapts.
- **Bounded budgets:** Every new module has `constructor(bot)`, `tick(tick)`, `reset()`, max 800 block checks, max 20 ticks per scan, max 64 log entries.
- **No circular deps:** core never imports runtime, runtime imports core, event bus is pure, blackboard is pure.
- **Verification suite:** `node tools/run-all.mjs` must pass parse, linkcheck, undef, imports, core tests, walkable, flush, selftest fail. New runtime tests added as extra step, not replacing.
- **Honesty contract:** No fabrication, rollback-safe transfers, verify important actions, entity disappearance = pickup success.
- **Safety model:** No hazard mining, shelters reopenable, owner-gated, circuit breaker, hazard detection before movement.
- **Backward compatibility:** Existing commands `!bot spawn/status/mission/follow/pause/etc` unchanged, new commands additive. Existing `PHASES` enum kept, new states superset. Existing `awareness`/`structures` kept as producers, blackboard as consumer. Feature flags allow toggling new directors via `!bot config nether on/off` etc.
- **Small files:** Each new module <500 lines, JSDoc comments.

---

## Next Steps for Contributor

1. Implement Top 10 in order, one PR per plan, each PR must pass `tools/run-all.mjs`.
2. Update `docs/ARCHITECTURE.md` each PR.
3. Add unit tests for each new core module in `tools/test.mjs` or `tools/test-runtime.mjs`.
4. Keep PRs small, focused, with clear commit messages.
5. After Top 10, tackle Full-Game phases.

This roadmap achieves world-class autonomous speedrun from Overworld to End Dragon while preserving existing safety, honesty, and verification guarantees.
