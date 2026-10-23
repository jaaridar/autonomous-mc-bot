# Verdant Bot — pathfinding & autonomous travel (v1.2.8)

This document covers the wide planner (`scripts/core/pathfinder.js`), how the
navigator uses it (`scripts/runtime/pathfinder.js`, `scripts/runtime/navigation.js`),
the anti-stuck ladder (`scripts/core/anti-stuck.js`,
`scripts/runtime/stuck-recovery.js`) and dimension travel
(`scripts/core/portal.js`, `scripts/runtime/portal-travel.js`,
`scripts/runtime/nether-explore.js`).

## Attribution

The new planner takes its approach from **nox7 / mc-bedrock-script-utilities —
Pathfinder** (Apache-2.0):

<https://github.com/nox7/mc-bedrock-script-utilities/tree/main/Pathfinder>

Specifically adapted:

| Reference concept | Here |
|---|---|
| `AStarOptions` (`LocationsToIgnore`, `TypeIdsToIgnore`, `Tags/TypeIdsToConsiderPassable`, `TypeIdsThatCannotBeJumpedOver`, `AllowYAxisFlood`, `MaximumNodesToConsider`) | `normalizeOptions()` / `DEFAULTS` in `core/pathfinder.js` |
| `BlockSafetyChecker` result (`IsSafe`, `CanSafelyFallFrom`, `CanSafelyJumpOnto`) | `checkSafety()` |
| Open/closed frontier, node budget, "maximum nodes considered" failure | `PathFinder` (heap + `costs` + `closed` + `maxNodes`) |
| `system.runJob` generator yielding | `PathFinder.search()` / `step(budget)` and `BidirectionalPathFinder` equivalents |
| Bidirectional A* meet-in-the-middle | `BidirectionalPathFinder` |
| Debug block visualisation | intentionally omitted (the pack never mutates the world for diagnostics) |

The code is a rewrite for this pack's pure-JS cell model, not a copy: it has no
TypeScript, no `@minecraft/server` imports, and uses the same `read({x,y,z})`
cell shape as `core/navigation.js`. The Apache-2.0 licence and full attribution
are in `THIRD_PARTY_NOTICES.txt`.

## Cell model

`read(p)` returns a cached cell:

```js
{ passable: boolean, support: boolean, hazard: boolean, type: "minecraft:..." }
```

`runtime/world.js` `Terrain.read` provides exactly this, memoised per tick and
invalidated on mining/placing. The planner never touches `Block` handles.

Predicates:

- **standable** — feet and head passable, floor supports, no hazard.
- **checkSafety** — the reference safety check: safe cell, safe fall (bounded,
  with the landing cell), jump-onto headroom, ignore list.
- **hazard** — `hazard === true` or a lava type. Water is never standable.

## Search

`planPath(read, start, goal, options)`:

1. If the horizontal distance ≥ `bidirMinDistance` (24) and `bidirectional` is
   on, run `BidirectionalPathFinder` with the symmetric move subset (walk,
   diagonal, step, shallow drop). It alternates expanding the start and goal
   frontiers, records the best meeting cost, and stops when the open frontiers
   cannot beat it (or at the node budget). Path = forward chain + reversed
   backward chain, minus the duplicated meeting cell.
2. Otherwise — or if bidirectional cannot connect — run `PathFinder` with the
   full move set:

| kind | condition | cost |
|---|---|---|
| `walk` | standable neighbour | 1 |
| `diagonal` | standable, both side cells open (no corner cutting) | 1.414 |
| `step` | one up, headroom, landing standable | 1.6 |
| `drop` / `bigdrop` | open column, floor within `maxDrop` (3) | 1.4 / 2.2 |
| `jump` / `sprintjump` | 1- or 2-block gap with a standable landing and headroom | 3.2 / 4.6 |
| `dig` | soft block in the way, `allowDig`, breakable type, no lava | 9 |
| `bridge` | open gap with no support, `allowBridge`, not over lava | 11 |
| `pillar` | headroom, `allowPillar` (each placement supports the next) | 8 |
| `flood` | `allowYAxisFlood` straight up/down for swim/fly contexts | 2 |

- **Avoid penalties** — `{x,y,z,radius,weight}` points (lava pools, local water)
  add cost inside the radius; they never make a hazard cell standable.
- **Ignore lists** — cells, type ids, and `typeIdsThatCannotBeJumpedOver`
  (fences/walls/panes cannot be jumped over).
- **Heuristic** — octile + vertical weight, multiplied by `heuristicWeight`
  (1.05). Small overestimate = faster searches, still finds sensible routes.
- **Budget** — `maxNodes` (4000 default; the service uses 6000, 9000 forced
  wide). On exhaustion the best node seen is returned as `partial` if it closed
  at least `minProgress` blocks; otherwise the status is `budget`/`unreachable`
  and the caller falls back.
- **Slicing** — `step(n)` expands at most `n` nodes and returns
  `"searching" | "found" | "partial" | "budget" | "unreachable"`. `*search()`
  yields every `yieldEvery` expansions, so a caller can drive it like
  `system.runJob`. `runtime/pathfinder.js` `begin`/`step` is the per-tick form.
- **Smoothing** — collinear walk nodes collapse; a straight line replaces a run
  of walk nodes only when every sampled centre cell (and the corner cells for a
  diagonal) is standable. Non-walk moves are never smoothed.

## Runtime service

`PathfinderService` (`runtime/pathfinder.js`):

- derives options from settings (`parkour`, `bridge`, `pathDig`, `pathBridge`,
  `pathRadius`, `pathNodes`),
- builds a bounded hazard-avoid list (remembered lava pool + a radius-8,
  256-read `scanOres` probe) every 120 ticks,
- caches successful results for 40 ticks (24 entries max),
- one-shot `plan()` for the navigator, `begin()`/`step()` for long searches,
- `breakable(type)` — the conservative soft-block list (never obsidian,
  bedrock, containers, spawners, portals),
- stats for `!bot path` / `!bot status`.

## Navigator handoff

`Navigator.replan()`:

- tower goals keep the legacy tall search;
- goals over 40 blocks (or `forceWide` after a dead end) ask the wide planner
  first, at most every 200 ticks, and not until `wideBannedUntil` expires after
  an impossible result;
- a usable wide path replaces the rolling-horizon path and is executed by the
  existing waypoint loop (`dig` is routed to `Bot.digCell`).

If the wide planner has no path the legacy 24-block search still runs, so the
bot can always fall back to rolling progress.

## Anti-stuck ladder

`StuckWatchdog.observe({tick, pos, distance, ...})` keeps a progress baseline
(distance to the current goal, not raw movement) and a small position sample
window. It classifies, in urgency order: `suffocating`, `lava`, `drowning`,
`swimming`, `caged`, `loop`, `failing`, `unloaded`, `no_path`, `portal_ready`,
`stalled`.

`planRecovery(kind, ctx)` proposes actions filtered by capability (`hasPickaxe`,
`hasBlocks`, `portalNear`, `home`, `food`), then `StuckWatchdog.decide` walks an
escalation ladder with per-action cooldowns:

```
replan
replan_wide / jump
dig_forward / dig_up / pillar_up / bridge_forward
backtrack / change_area
surface / eat
return_home / use_portal
pause
```

- Progress at any point resets the level and the attempt count.
- A failed action escalates immediately and doubles that action's cooldown.
- `maxAttempts` exhaustion triggers an honest `pause` with the reason, instead
  of thrashing.

`runtime/stuck-recovery.js` executes each action with real engine calls:
`Bot.digCell` (front/up blocks, breakable only), `Builder.pillar/bridge/
bridgeDiagonal`, `Navigator` reset + `forceWide`, `navTo` backtrack/relocate,
`Escaper` water escape, `eat`, `travel.enter`, or `blockTask` with `retry`.

The recovery gate runs every 5 ticks and is skipped while a hostile is within
6 blocks or while a travel state owns the tick.

## Dimension travel

`core/portal.js`:

- `scaleToNether` / `scaleToOverworld` (1:8) and `linkedGuess`.
- `portalFrame(base, axis)` — 14 positions, 10 required (corners optional),
  2×3 interior, ignition cell, standing cell.
- `validatePortalFrame(read, base, axis)` — required blocks present, interior
  open; reports missing blocks and a `frameCount`.
- `choosePortalAnchor(read, near, {radius})` — nearest flat 4×5 patch with a
  solid bottom row and a clear standing spot, never lava.
- `chooseArrival(read, target, {radius})` — nearest safe feet+head cell with a
  solid floor; never lava/water; can report `needsDig` for a blocked head (never
  bedrock).
- `findPortalNear` — coarse stride-2 probe plus 5³ refinement (≈1/8 of a cube
  walk).
- `portalAction(obs)` — `walk` / `wait` / `teleport` / `ignite` / `clear` /
  `repair` / `build`.
- `shouldReturnToOverworld` and the nether target scoring/leash helpers.

`runtime/portal-travel.js` states:

```
seek -> gather (obsidian) -> build -> ignite -> ignite_wait
     -> enter -> transit -> arrive -> done
                 |
                 +-> link (remembered origin frame, no obsidian needed)
```

- **seek** uses memory first, then a bounded scan, then an anchor search.
- **gather** hands the tick back to the normal directors (nether/bucket/
  autonomy) and retries when obsidian reaches 10.
- **build** places one real obsidian block per call through `Builder`,
  re-validating each tick. Required blocks are placed first so ten obsidian is
  enough.
- **ignite** requires a real flint and steel / fire charge, looks at the interior
  bottom, uses it, and waits for the portal block to actually appear.
- **enter/transit** walks into the interior. If the engine moves the simulated
  player, `Bot.syncDimension()` calls `onDimensionChange()`; if not, after 50
  ticks the traveller teleports to the 1:8 linked coordinate after finding a
  safe arrival cell.
- **arrive** carves a blocked head, pillars a platform over the void, remembers
  the real Overworld origin frame, and only records a nether portal if one is
  actually within 8 blocks.

`NetherExplorer` then runs on a 20-tick cadence: leave before dying, mine
quartz/gold, prefer fortress/bastion signatures, avoid ghast/hostile groups,
stay within 96 blocks of the arrival point, and end the trip on health/food/
loot/time triggers. `NetherDirector` stops doing overworld portal work while in
the Nether.

## Tests

`tools/pathfinder.test.mjs` (73) and `tools/travel.test.mjs` (88) run offline in
`node tools/run-all.mjs`:

- safety verdicts (flat, lava, bounded fall, ignore, passable override),
- A*/bidirectional agreement, door routing, lava avoidance, sealed goals,
- ignore lists, unjumpable fences, Y-axis flood, dig/bridge/pillar edges,
- node budgets, partial routes, generator slicing, smoothing, heap ordering,
- all anti-stuck classifications, capability filtering, oscillation, cooldowns,
  escalation, exhaustion,
- portal geometry/validation (including optional corners), anchor/arrival
  selection, portal actions, return decisions, nether scoring,
- `PathfinderService` plan/cache/slice/breakable,
- navigator wide-plan adoption + movement orders,
- a full fake-engine Nether round trip: build → light → enter → transit →
  arrive → return via the remembered origin frame.
