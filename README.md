# Verdant Bot — an autonomous simulated player for Minecraft Bedrock

An experimental scripted survival bot for Minecraft Bedrock (1.21.114). It runs a
real simulated player through the GameTest framework and drives it with a
purpose-built brain: mining, crafting, smelting, foraging, defence, escape,
exploration — and now persistent memory, night camping and death recovery.

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

## Performance notes

- Memory writes only when information changed (per-sighting deduplication).
- Terrain reads are cached; planner is time-sliced (A* steps per tick, not a
  blocking search).
- The observer sweep is bounded and staggered across ticks.

## Current limits

- **Overworld only.** Nether/End travel is planned but not implemented; the bot
  pauses rather than guess around dimensions.
- Combat is melee with retreat logic; bow/shield work is planned.
- No farming, enchanting, potions or villager trading yet.
- A world reload ends the simulated player; see "Persistent memory".

## Repo layout

```
manifest.json                  pack manifest (script entry: scripts/main.js)
structures/verdant/host.mcstructure   GameTest host structure
scripts/
  main.js                      chat commands, event wiring, tick loop
  core/                        engine-free logic, 11 modules (unit-testable)
    math, world, knowledge, recipes, arbiter, progression,
    survival, nether, village, combat, memory
  sim/avatar.js                the one owner of the simulated player
  runtime/                     engine-bound components, 20 modules
    bot, world, inventory, navigation, builder, combat, escape,
    survival-master, survival, scouting, world-awareness, looting,
    mining, nether, village, speedrun, equipment, memory, ui, host
docs/ARCHITECTURE.md           layer map, rules, roadmap
docs/COMMANDS.md               full command reference
tools/                         self-contained verification suite (node tools/run-all.mjs)
LICENSE (MIT), THIRD_PARTY_NOTICES.txt
```

## Development & verification

`tools/` ships a self-contained verification suite — Node 18+, no network and no
dependencies (`@minecraft/*` is stubbed locally). One command runs everything:

```
node tools/run-all.mjs
```

In order: the six gates in `gates.mjs` — module-goal parse of every file (one
invalid line can silently kill the whole pack in-game, so files are parsed
exactly how the engine parses them), link + evaluate against the stubs (catches
missing exports, import cycles and top-level throws), the no-undef gate (flags
calls to names that were never imported and `this.<field>` reads that are never
assigned; both classes were real shipped crashes), a missing-import scan, a
component gate (a `<component>.<method>()` call that resolves to nothing — the
class of bug a method-hoisting refactor introduces silently) and an avatar gate
(only `scripts/sim` may drive the simulated player) — then `tests.mjs`
(persistent-memory schema, capabilities and goal decomposition, the
walkable-block regex guard, drop-flush tests), `sim.test.mjs` (the avatar driver
and movement policy against a behavioural fake of the documented
SimulatedPlayer contract) and `perf.test.mjs` (native-call budgets).
`tools/selftest/` holds deliberately broken fixtures; the run requires those to
fail, proving the no-undef gate still catches bugs.
