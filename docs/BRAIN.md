# Brain layer (`scripts/core/brain/`)

Engine-free decision machinery that replaces "a priority chain of directors + 80 scripted scenarios"
with composable parts. Everything here is pure JS (no `@minecraft/*`), covered by
`tools/brain.test.mjs` (unit tests, a toy-world simulator, 4000-case fuzz) and runs in `node tools/run-all.mjs`.

**Status: built and verified offline. NOT yet wired into `runtime/bot.js`.** The running bot behaves as
before plus the Phase-0 fixes. See "Integration" for exactly what is left and why it needs in-game testing.

> **v1.2.8 note — the runtime got its own versions of two of these parts.**
> `scripts/core/pathfinder.js` + `scripts/runtime/pathfinder.js` now supply the wide
> A*/bidirectional planner and the navigator handoff, and
> `scripts/core/anti-stuck.js` + `scripts/runtime/stuck-recovery.js` supply a live
> escalation ladder (replan → replan_wide/jump → dig/pillar/bridge → backtrack →
> surface/eat → home/portal → honest pause). They are wired into `Bot.tick()` and
> exercised by `tools/pathfinder.test.mjs` and `tools/travel.test.mjs`.
> This file's `brain/` layer is still the offline planner, and `brain/stuck.js` is
> still not the running no-progress ladder — do not read the two as the same code.
> `runtime/portal-travel.js` also owns Nether entry/return now, so item 6 below
> ("delete the duplicate Nether planner") is still open for `speedrun.js` only.

## Parts

| File | Job |
|---|---|
| `results.js` | One result contract: `running` / `success` / `failed(reason)`. Reasons: no_path, no_target, tool_tier_too_low, hazard, timeout, postcondition_failed, rule_violation … |
| `blackboard.js` | Memory of what was tried. Failed methods get escalating bans (1, 2, 4 … 20 min). *Situational* failures (no_target/no_path) are forgotten when the bot relocates; *chronic* ones (tool tier, hazard, timeout) keep demoting the method. Bounded, serialisable. |
| `danger.js` | One risk model instead of scenarios: fall (HP-aware, water landing), lava (adjacent too), water/drowning, mobs (ranged/explosive), darkness, suffocation → `cellDanger`, `pathPenalty` (for A*), `safestStep`, `assessHazards`. Unknown positions are refused, never scored as safe. |
| `rules.js` | Short list of inviolable rules (no mining beside lava, no opening 5+ drops, no fighting at ≤6 HP with no exit, keep the escape-block reserve, no long dark trips while hurt). Checked before a skill starts; cannot be outvoted by utilities. |
| `skills.js` | `defineSkill` + `SkillRunner`: precondition, rule check, tick budget, exception→failure, and a **postcondition check when a skill claims success** ("crafted it" must mean the item is in the inventory). `SKILL_CATALOG` is the contract the runtime must implement. |
| `goals.js` | Overworld progression as data (`PROGRESSION`) and an item table where every item has several acquisition methods (explore, dig down, loot, smelt-instead, charcoal-instead-of-coal …). |
| `planner.js` | Resolves a goal to the next leaf skill; on failure the blackboard bans that method so the next call picks another. Exploration has a budget (6 fruitless relocations) so "explore" cannot loop. When nothing is left it returns `blocked` with an explanation. |
| `arbiter.js` + `drives.js` | Utility selection with hysteresis (minimum hold + switch margin), emergency pre-emption, failure cooldown. Drives: escape_hazard, survive_combat, eat, recover_health, get_shelter, manage_inventory, restock_escape_kit, unstick, pursue_goal. |
| `stuck.js` | No-progress ladder: replan → change area → dig out → go home → safe pause + report. Oscillation (A-B-A-B) caught within ~a minute. |

## What the tests actually show (toy world, not Minecraft)

* Desert start (no trees): explores 3×, then chops; completes the whole ladder to a diamond pickaxe (40 steps).
* Trees visible but unreachable: `no_path` → relocate → retry succeeds (10 steps to a wooden pickaxe).
* Impossible goal (every method failing): returns `blocked` + explanation after 17 steps, not a loop.
* Arbiter: ~1000 switches (argmax each tick) → a small fraction with hysteresis on the same noisy input.
* Mutation check: breaking the explore budget, the postcondition check, arbiter hysteresis, situational-ban
  clearing, the lava rule, or the stuck ladder each makes the suite fail.

## Integration (remaining work — needs in-game validation)

1. **State builder** (`runtime/brain-state.js`): read-only snapshot from `Bot`: `inv` (normalise
   `minecraft:oak_log`/`*_planks` → `log`/`planks`), `known` (from `awareness`/`structures`/memory),
   `nearTable`, `nearFurnace`, `sheltered`, `hasBed`, `night`, hazards via `assessHazards`.
2. **Skill bindings** (each wrapped in `defineSkill` with a real `post` check). Existing code to bind:

| Brain skill | Existing runtime entry point |
|---|---|
| craft | `bot.craft()` / `bot.obtain()` |
| ensure_table | `bot.placeTable()` |
| ensure_furnace, smelt | `bot.autonomy.furnace.place()`, `bot.autonomy.produce()` |
| chop_tree, mine_stone, mine_ore | `bot.startMine()` + `Miner` (tree mode) |
| branch_mine, dig_down_safe | `DeepMiner` / `bot.deepMine()` |
| explore | `Explorer` / `bot.scout.step()` |
| hunt | `Forager` |
| loot_structure | `bot.startLoot()` / `Looting` |
| eat | `bot.eat()` |
| sleep, seal_shelter | `bot.camp()` |
| light_area | `bot.placeTorch()` |
| fight / flee | `bot.fight()` / `bot.retreat()`, `Escaper` |
| water_clutch | `SurvivalMaster.waterClutch()` |
| pillar_up, bridge | `Builder` (signatures unverified) |
| go_home, recover_death | `nav.go(home)`, `bot.startRecover()` |

3. **Replace the `think()` director chain** with `Arbiter.select(DRIVES…)`; each existing director becomes
   a behavior reporting `Result`s (use `coerce()` for legacy `true/false` returns while migrating).
4. **Feed `cellDanger` into `Navigator`'s A*** as an edge penalty (`pathPenalty`).
5. **Stuck ladder**: count a running furnace job, sleeping, or camping as progress, otherwise a legitimate
   80-second smelt would trip level 1.
6. Delete the duplicate Nether planner (`speedrun.js` vs `nether.js`) once the goal planner owns it.
7. Convert the 80 `survival-scenarios` into regression fixtures: given a context, assert the chosen response is acceptable.

## Not possible from here

* Running Minecraft: nothing in this layer has been exercised in-game.
* An LLM strategist: to my knowledge `@minecraft/server-net` (HTTP) is Dedicated-Server-only, not the
  Windows client this pack targets. Verify before designing around it.
