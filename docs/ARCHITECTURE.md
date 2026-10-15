# Verdant Bot — architecture

Where things live, who owns what, and the rules that keep the bot honest.
If you are adding a feature, find its layer here first.

## Layers

- `scripts/core/` — pure logic. No `@minecraft/server` imports, testable
  offline: math, block policy (MINE table), recipes/refusals, ore levels,
  food tables, the path search, task-fault types, memory schema.
- `scripts/runtime/` — engine adapters and the brain: everything that talks
  to the live simulation. One file per responsibility.
- `scripts/main.js` — commands and the 20 Hz brain pump; modes live in bot.js.

## Runtime module map

| File | Owns |
|---|---|
| `bot.js` | The brain: tick order, mode dispatch, task objects (`m`), combat, escapes, camp/night, death pipeline, crafting orchestration. |
| `navigation.js` | `Navigator`: path planning + following. The only thing that may own long-distance movement. `navTo()` = ring-targeting around awkward goals. |
| `drops.js` | Loose-drop collection. `near()` finds matching item entities, `run()` walks to (and waits on) one, `pushToward()` is the bounded last-resort straight line. |
| `scouting.js` | `Scout`: everything about roaming voluntarily — village detection, frontier scouting, opportunistic foraging (logs, sheep). Runs only in the survival maintain stage. |
| `mining.js` | `Miner`: staircase shafts, corridors, torch placement, cavity bookkeeping. Called by mine-mode; never moves the bot itself. |
| `escape.js` | `Escaper`: water/lava/being-stuck handling, pillaring, bridging, tunneling. Uses nav.lastGoal so escapes aim at the real goal. |
| `survival.js` | `SurvivalDirector`: the gear ladder (stone → iron → armour → extras → maintain) and the food hook. |
| `foraging.js` | `Forager`: hunger-driven animal hunting (physical attacks only). |
| `world.js` | `Terrain` (block reads, danger rules, threats, entity helpers) + `BlockScan` (chunked nearest-first block sweeps). |
| `inventory.js` / `hands.js` / `equipment.js` | Bag model and native-inventory transfers, world interactions (place/use), armour moves. |
| `furnace.js` | Native furnace placement/loading/polling. |
| `host.js` / `memory.js` | Sim lookup/rebinding, persistent memory store. |
| `exploration.js` | `Explorer`: bounded frontier hopping used by scouting and fruitless mine searches. |

## The resource-search ladder (mine mode)

A surface resource task never silently roams. In order:

1. **Tight scan** — 10 blocks (6 underground), every tick, nearest-first.
2. **Wide sweep** — 24 blocks, chunked at 768 cells per brain tick, bounded
   (~12 s); re-arms when the bot has walked somewhere new. One rule
   (`wantedToMine`) drives every radius.
3. **Explore** — `Explorer` hops 12–20 blocks at a time, while a radius-10
   watch runs continuously (re-armed every 10 ticks): the stroll ends the
   moment the resource shows up ("Spotted … while scouting").
4. **Dead end** — explorer reports `blocked`: the bot reports once, walks
   home (peek still running), then pauses with an actionable message
   (`blockTask`, retry kind). After repeated fruitless cycles it stops
   honestly: "Searched everywhere reachable: no X."
5. **Drops** — tree breaks are interrupted only for a drop underfoot; the
   rest is remembered (`m.loot`) and walked by a loot pass (`Drops.flush`)
   the moment the tight scan is done and no trunk log is left — *before* the
   wide sweep, so the bot walks its loot line instead of standing through the
   sweep, and a far target waits its turn. A remembered cell is matched
   within 6 blocks (drops fall to the ground from tall trunks), so nothing is
   silently forgotten while its item is still there; cells with nothing left
   are dropped. Other digs keep chase-per-break. A task cannot finish without
   its items: quota counts the bag, completion sweeps strays. Unreachable
   stacks are blacklisted briefly, never orbited.

## Movement rules

- Long-distance movement is `Navigator`'s. Call `nav.reset()` when you take
  over, or the next caller inherits a stale plan.
- `navTo(goal, tick, leash)` targets walkable cells *around* a point (drops on
  leaves, owner on a ledge) instead of demanding the exact cell.
- `Drops.pushToward()` is the only sanctioned straight-line movement: short
  hops the planner refuses, bounded by the caller's tick budget, never a
  journey.
- Escape is the only tunneling/bridging path; `nav.lastGoal` must point at
  whatever the bot actually wants, not home.

## Honesty contract

- Items are observed and moved with rollback-protected transfers — never
  fabricated, duplicated or teleported.
- `tell()` = chat messages to the owner; `reason` = the HUD line; `blockTask`
  = stop and say why (kinds: `manual` needs the owner, `retry` backs off and
  retries).
- Entity disappearance is the pickup success signal; inventory deltas are the
  quota success signal. Nothing reports success it did not observe.

## Adding a feature

1. Pure logic goes in `core/`, engine touches in `runtime/`.
2. New roaming/collection duties belong in `scouting.js` / `drops.js`; the
   brain only calls `b.scout.step(tick)` / `b.drops.*`.
3. Budget every loop (ticks or attempts) and end with an actionable message —
   no silent loops, no standing still.
4. Run the full verification suite before shipping: `parse.mjs` (parses every
   file in *module goal* — exactly how the engine parses it; one invalid line
   silently kills the whole pack in-game), `linkcheck.mjs` (links and
   evaluates every module with stubbed @minecraft APIs — catches missing
   exports, import cycles and top-level throws), `undef.mjs` (flags calls to
   names never imported/declared — the 0.8.7 `horizontal` crash — and
   `this.<field>` reads never assigned or defined in that file — the 0.8.8
   `this.scan` crash; `// undef-ok:` marks deliberate external callbacks),
   `imports.mjs`, `test.mjs`, `walkable.mjs`.
