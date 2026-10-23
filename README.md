# Verdant Bot — an autonomous simulated player for Minecraft Bedrock

An experimental scripted survival bot for Minecraft Bedrock (1.21.114). It runs a
real simulated player through the GameTest framework and drives it with a
purpose-built brain: mining, crafting, smelting, foraging, defence, escape,
exploration — and now wide bidirectional pathfinding, an escalating anti-stuck
ladder and fully autonomous Overworld ⇄ Nether travel.

Everything the bot earns is earned in-game. Nothing is fabricated, duplicated or
teleported into the inventory, and every action is verified against the world
before the next step trusts it.

## Requirements

- Minecraft Bedrock **1.21.114** (UWP/Windows tested).
- Experiments enabled: **Beta APIs**; **Cheats** on for the host tools.
- This is an experimental pack: **back up the world first**, and read "Safety
  model" below before pointing it at anything precious.

## Quick start

```
/tag @s add verdant.admin          # one-time operator setup
!bot spawn                         # does everything else: sets up the remote
                                   # host on first use (~20 s), spawns
                                   # "Verdant" next to you already working
!bot status                        # mission + state at a glance
!bot mission                       # just the current objective, one line
!bot follow                        # overrides when you want: follow / guard /
!bot nether                        # build/find a portal, light it, enter, explore
!bot overworld                     # come home (portal, or the linked origin frame)
!bot pause                         # goto / mine / golem / ... ; pause holds
```

Full command reference: [docs/COMMANDS.md](docs/COMMANDS.md).

## Safety model (the part that matters)

The pack is built so a bug costs time, never items or the world:

- **No item fabrication.** Crafting, smelting and deposits move real stacks with
  prepare-then-commit and rollback; a failed commit restores both inventories or
  says `CRITICAL` and stops.
- **Digging refuses hazards.** The miner and camp digger never break a cell with
  lava or water beside it, never open a hole over a drop, and check pickaxe tier
  before touching ore.
- **Shelters are always reopenable.** The bot only seals a camp niche with a
  block it can positively dig back out; otherwise it leaves the wall open.
- **Owner-gated.** No world mutation while the owner is offline or in another
  dimension; commands require the `verdant.admin` tag.
- **Circuit breaker.** Three unhandled script errors pause the bot with the last
  error instead of looping.
- **Honest reporting.** Drops that despawn are reported as gone; "quota met"
  means blocks broken, and the bot says so.

## Persistent memory

The bot remembers a small JSON document across world reloads:

- your base (`!bot base`), chests/barrels, crafting tables and furnaces it has
  walked past, beds and portals, and the **death point** with an inventory
  snapshot.

`!bot memory` shows what is stored. Observation is passive, bounded (a small
sweep once per two seconds) and deduplicated, so it never grows unboundedly and
only writes to disk when something actually changed.

**Important:** simulated players do not survive a world reload. Continuity means:
just `!bot spawn` again — it recreates the host automatically if needed and
restores your settings, base and known spots. Death is handled in place: the bot
auto-respawns, walks back to the death point for the drops, then resumes what it
was doing (drops despawn after about five minutes; it reports honestly what it
found). `!bot recover` still works as a manual command.

## Night camping

While idle or guarding at night, the bot will:

1. place and use a **bed** if one is carried (skipping the night outright), or
2. **dig a two-deep niche** into any safe hillside and seal it behind itself —
   only with a block it can dig back out, never near liquids.

Any hostile within range cancels camping before it starts. If a command or fault
interrupts the bot while sealed, it opens its own wall first, before anything
else. `!bot config camp off` disables the whole behaviour.

## Inventory organisation

- `!bot deposit` now **tops up matching stacks** in the chest first, then uses
  empty slots — a chest stays sorted instead of collecting one stack per trip.
- `!bot organize` merges partial stacks in the bot's own inventory.
- Both are rollback-safe: either the whole move lands, or both sides are
  restored to the exact stacks they held before.

## Loose drops

The bot sees dropped items as `minecraft:item` entities and picks them up the
vanilla way — by walking over them:

- **While idle** it notices drops within 6 blocks and walks over to collect
  them (`!bot config pickup off` disables). It never chases a stack into lava
  or water, and gives up on one that refuses pickup.
- **`!bot collect [6..32]`** sweeps a wider area around the bot's current spot,
  skipping hazards and unreachable stacks, and reports the real inventory
  change — "picked up N item(s)", never a guess.
- Items the bot itself mines or that it drops on death are collected through
  the same walk-over mechanic (mining sweep, `!bot recover`).
- Only items inside loaded chunks are visible; beyond the ticking area and the
  owner's loaded chunks the script cannot see the world at all.

## Pathfinding (v1.2.8)

The navigator keeps its cheap rolling-horizon A* for short walks, and now hands
long trips and dead ends to a second, wider planner inspired by
[nox7's Pathfinder](https://github.com/nox7/mc-bedrock-script-utilities/tree/main/Pathfinder)
(Apache-2.0; see `THIRD_PARTY_NOTICES.txt`):

- **Safety-checked moves.** Every candidate cell is tested the way the reference
  BlockSafetyChecker does: feet and head open, floor solid, no lava/water, safe
  fall depth, jump-onto headroom. Fences/walls/panes can be marked as
  unjumpable; type ids can be ignored or forced passable.
- **Bidirectional A\*.** Long trips search from both ends and meet in the
  middle. If it cannot connect, the unidirectional search takes over with the
  richer move set.
- **Real moves, not just walking.** Walk, diagonal (corner-cut checked), step
  up, drops up to three blocks, one- and two-block gap jumps, dig-through soft
  blocks, bridging and pillaring — each with its own cost, so the route is the
  cheapest one the bot can actually execute.
- **Time-sliced and budgeted.** The core is a generator (`step(budget)` / 
  `*search()`), so a big search can be spread over ticks like `system.runJob`;
  when the node budget runs out it returns its best partial route instead of
  failing.
- **Smoothed, verified waypoints.** Collinear nodes are collapsed and clear
  straight lines are string-pulled, but only when every sampled cell is
  standable.

`!bot path` shows plan/found/partial/failed counts and nodes expanded.
`!bot config pathdig off` / `pathbridge off` stop the planner from proposing
tunnels or bridges; `!bot config parkour off` disables gap jumps.

## Autonomous Nether travel (v1.2.8)

`!bot nether` (or the speedrun director once it has obsidian and ignition) runs
a real trip with no further input:

1. Reuse a remembered portal within 64 blocks, or find a lit one nearby.
2. Otherwise gather 10 obsidian through the normal directors, choose a flat,
   safe 4×5 anchor and build a real frame with real blocks.
3. Light it with flint and steel or a fire charge, and verify the portal block
   appears before walking in.
4. Walk into the interior. If the engine transports the simulated player, the
   bot detects the dimension change; if it does not, the bot uses the portal's
   own coordinate link (overworld ÷ 8, nether × 8) and searches for a safe,
   non-lava landing on the other side.
5. In the Nether it explores within a leash of the arrival point, mines quartz
   and nether gold, looks for fortress/bastion signatures, avoids ghasts and
   lava, and returns when health, food or the trip budget says so.
6. The return trip uses a real nether portal when one exists, otherwise the
   remembered Overworld frame (the exact one it came through), so a trip can
   never strand the bot without obsidian.

Every cache is dimension-aware: on a dimension change the shared `Terrain`
handle is retargeted and cleared, navigation/planner state resets, and the
awareness/structures maps are rebuilt. `!bot config travel off` restores the old
conservative behaviour of pausing when owner and bot are in different
dimensions; the default is to keep working autonomously.

## Never stuck: the recovery ladder

Navigation failures no longer just retry the same thing. The watchdog
(`core/anti-stuck.js`) classifies the situation — suffocating, lava, drowning,
caged, looping between the same cells, no route, unloaded chunks, or a ready
portal — and walks an escalating ladder:

```
replan -> wide replan / jump -> dig forward / dig up / pillar / bridge
       -> backtrack / relocate -> surface / eat -> return home / use portal
       -> honest safe pause
```

Actions have per-action cooldowns, failed actions escalate instead of repeating,
and progress (closing distance, not just moving) resets the ladder. When the
ladder is exhausted the bot says exactly why and pauses instead of thrashing.
`!bot status` includes the current stuck level, kind and last action.

## Performance notes

- Memory writes only when information changed (per-sighting deduplication).
- Terrain reads are cached; planner is time-sliced (A* steps per tick, not a
  blocking search).
- The observer sweep is bounded and staggered across ticks.

## Current limits

- **Overworld and Nether.** The End is not implemented; `!bot travel` accepts
  only overworld/nether and the bot refuses anything else honestly.
- Nether travel assumes the vanilla 1:8 portal link when the engine does not
  transport the simulated player itself. It searches for a safe landing, but it
  cannot guarantee terrain generation around an arbitrary link point — it will
  carve/land on a platform instead.
- Combat is melee with retreat logic; bow/shield work is planned.
- No farming, enchanting, potions or villager trading yet.
- A world reload ends the simulated player; see "Persistent memory".

## Repo layout

```
manifest.json                  pack manifest (script entry: scripts/main.js)
structures/verdant/host.mcstructure   GameTest host structure
scripts/
  main.js                      chat commands, event wiring, tick loop
  core/                        engine-free logic (unit-testable)
    math, commands, policy, recipes, ores, navigation, survival, recovery, transfer, memory,
    pathfinder (safety-checked A*/bidirectional), anti-stuck (recovery ladder), portal (geometry/linking)
  runtime/                     engine-bound components
    bot, drops, scouting, host, navigation, mining, world, inventory, equipment,
    escape, furnace, foraging, exploration, survival, hands, memory,
    pathfinder (wide planner service), portal-travel, stuck-recovery, nether-explore
docs/COMMANDS.md               full command reference
docs/PATHFINDING.md            planner, anti-stuck ladder, portal travel internals
docs/ARCHITECTURE.md           layer map and module contracts
docs/BRAIN.md                  offline planning layer (not the running ladder)
docs/FULL_GAME_SPEEDRUN_ROADMAP.md   what is done and what is still planned
tools/                         self-contained verification suite (node tools/run-all.mjs)
LICENSE (MIT), THIRD_PARTY_NOTICES.txt  (incl. Apache-2.0 for the nox7 Pathfinder)
```

## Development & verification

`tools/` ships a self-contained verification suite — Node 18+, no network and no
dependencies (`@minecraft/*` is stubbed locally). One command runs everything:

```
node tools/run-all.mjs
```

In order: module-goal parse of every file (`parse.mjs` — one invalid line can
silently kill the whole pack in-game, so files are parsed exactly how the engine
parses them), link + evaluate against the stubs (`linkcheck.mjs` — catches
missing exports, import cycles and top-level throws), the no-undef gate
(`undef.mjs` — flags calls to names that were never imported and `this.<field>`
reads that are never assigned; both classes were real shipped crashes), an
import scan (`imports.mjs`), core unit tests (`test.mjs`), the walkable-block
regex guard (`walkable.mjs`) and the drop-flush tests (`flush.mjs`).
`tools/selftest/` holds deliberately broken fixtures; the run requires those to
fail, proving the no-undef gate still catches bugs. `tools/pathfinder.test.mjs`
(73 tests) covers safety checks, bidirectional agreement, ignore/passable/
jump-over options, dig/bridge/pillar edges, budgets, slicing, smoothing and the
anti-stuck ladder. `tools/travel.test.mjs` (88 tests) covers portal geometry and
validation, anchor/arrival selection, travel decisions, the pathfinder service
and navigator handoff, and a full fake-engine build → light → enter → arrive →
return Nether round trip.
