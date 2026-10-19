# HANDOFF — VerdantBot mining/survival session (2026-10-18)

Read this first in a new session. Everything below is in the working tree (uncommitted),
gates green, soak-verified unless marked otherwise.

## Verification recipe (run after every change)

```powershell
# class-scope checker: this.x() calls must exist in that class (caught the DeepMiner crash)
node "C:\Users\UP\AppData\Local\Temp\opencode\class-members.mjs" "C:\Users\UP\AppData\Local\Packages\Microsoft.MinecraftUWP_8wekyb3d8bbwe\LocalState\games\com.mojang\behavior_packs\VerdantBot(2)\scripts"

# gates (exit 1 is BY DESIGN: fixture gate. Success line = "all steps passed")
# includes the reload gate: no bare event subscriptions, no leaked timers -> /reload-safe
node tools/run-all.mjs --quick

# offline soak (rebuilds tools/load from scripts/ + stubs). args: ticks dumpEvery mode scenario [dbgFrom dbgTo]
# scenarios: "" (plain survival), mine-iron, follow (owner teleports away twice). TRACE_MOVE=1 traces movers.
node "C:\Users\UP\AppData\Local\Temp\opencode\soak-debug.mjs" 4000 1000 survival mine-iron 1900 2700
```

Stub caveat: unknown member access on stubs THROWS (good). Always verify a flagged method
against the exact d.ts: `C:\Users\UP\AppData\Local\Temp\opencode\mca\srv\package\index.d.ts`
and `...\gt\package\index.d.ts`. Real gametest breakBlock/startBreakingBlock take **Vector3
locations**, not Block objects.

## DONE this session (all verified)

1. **`TypeError: this.track is not a function`** — the in-game crash. `DeepMiner.settle()`
   called `this.track(cell)` but `track()` only existed on `Miner`. Fixed with shared
   module-level `trailTrack(m, cell)` in `scripts/runtime/mining.js`; both classes delegate.
   This crash killed EVERY deep trip at its first step (bot then sat in blocked/defence =
   "lags, does random things").
2. **Shaft strategy** (`mining.js`, `DeepMiner`): straight-down shaft is the default while
   `p.y > site.targetY + 6`; staircase is hazard fallback; sticky `straightBlockedUntil`
   (600 ticks) on lava/cavity/bedrock; `settle()` never turns back into its own hole
   (straight: re-issue drop up to 80 ticks, then park + staircase); `turns >= 2` bail.
   Exposed ore beside the shaft (5 face cells of the next dig) is mined instantly.
3. **Jump spam** — `hop(tick, cell)` on both classes: true step-up only, from ground,
   max 1 per 12 ticks (4 old unguarded `sim.jump()` sites replaced).
4. **Lag** — `maybeCollect` entity query throttled to every 8 ticks (both miners).
5. **Random side-wall digging** — tryBridge fallback now digs ONE face straight ahead in
   `this.dir`, max once per 200 ticks (was: any of 4 CARDINAL walls).
6. **Reach toolkit** — `tryReach(target, m, tick)` in `bot.js`: mine line-of-sight (2 cells),
   scaffold up (once), parkour 1–3 gap (once), bounded `reachTries > 10`; per-target state
   `m.reachFor/reachTries/reachScaffold/reachParkour`. Triggers: nav "failed" (approach),
   nav "running" > 60 ticks without closing distance (approach), nav failed while returning
   to exit (`bot.js` ~2066). Circling fix.
7. **Dropped logs not picked up** — `looting.js` `Drops.near`: `#logs` tasks had no `want`
   so the sweep returned immediately; now generic wood wants accept any wood item; specific
   wants stay specific (fixture-pinned). Drop timeout blacklist 300 → 90 ticks (retry).
8. **Leaf-buried logs** — `bot.js` `woodExposed(cell)`: skip wood whose 6 faces are ALL
   leaves/vine; any other neighbour (air/log/ground) keeps it valid (jungle 2x2 OK).
9. **Escape hand-back loop** — `bot.js` think(): zero-progress "done" from escaper now
   counts `escapeAttempts` and sets `escapeCooldownUntil = tick + 100`; escape branch gated
   on that. No more endless "Handing back to pathfinder." / climb-out alternation.
10. **Creeper box-in** — `bot.js` `sealIn(tick)`: explosive within 7 blocks → sneak + fill
    every open face (N6) with blocks BEFORE escaper runs; already-boxed → keep sneaking.
11. **Stale "Breaking front minecraft:air"** — `mining.js` DeepMiner.tryDirectBreak re-reads
    the cell after breakThrough and skips tracking if now air.
12. **Stub realism** (soak trust): breakBlock accepts Vector3; BLOCK_DROPS table spawns item
    entities on break (stone→cobblestone, ores→raw, etc). Previously EVERY break silently
    failed offline → soak had never tested mining.

Soak proof (iron run, 8k ticks): y=64→17 straight shaft, 400 blocks broken, cobblestone
0→369 collected, branch mining at y=17, ascent back to base y≈64, camp at night, 0 errors.

13. **Climb-out stand-still root cause** — an already-ACTIVE `trapped` escape kept steering
    while `routeAscend` never ran. `bot.js` think() now stands the escape down when a climb
    owns movement (`miner.ascentStarted || deepMiner.ascentStarted || deepMiner.ascending`,
    not suffocating/below hazard); `escape.js` step() caps `kind === "trapped"` at 260 ticks.
    4k-tick iron soak: y=17→33 ascent, route 44→30, no stall.
14. **Head-cell bridge guard** — a 2-high same-column route could bridge the cell the bot's
    head occupied (place→suffocate→break churn). `tryBridge` (Miner+DeepMiner) refuses
    own-floor/head-cell targets; ascendStep detects `footIsHead` and climbs instead.
15. **Follow breakthrough (come-to-me)** — `bot.js` `followBreakthrough(goal, tick)`: reach
    toolkit every 10 ticks (cached `fc.reach`), raw direct-line run every 8 ticks, bridge
    every 30 ticks if canBuild, obstruction-dig/scan every 40 when bag empty. Wired into
    follow() "blocked"/"failed". Soak: owner teleported 38 blocks away twice; bot closed
    to leash (~2.4–3.0 blocks) both times, 0 errors, no stall spam.
16. **Village-first** — `village.js` visited/firstTrip/pendingFirstTrip; `survival.js`
    forces the first raid once tools exist; `bot.js` `villageGateOpen(tick)` gates BOTH
    deep-start sites. User mine/deepmine orders bypass the gate by design.
    (Later 2026-10-18 session: the 9000-tick give-up became a 6000-tick FORCE +
    6000-tick grace — see the "village raid" addendum at the end of this file.)
    Soak proof: survival, no order → stayed y=64 for 4000 ticks (explored for a village,
    never deep-mined); ordered mine-iron still dives immediately.
17. **Look/vision sweep** (`world-awareness.js`) — `lookStep()`: `dimension.getBlockFromRay`
    fan of 8 flat sectors + 4 floor probes (40-block range, liquids included), full
    revolution every 3 awareness ticks; `vision` map + per-sector depth, sightings feed
    villageSpots/chestSpots/ironSpots/diamondSpots/water/lava + importantSpots;
    `sweepEntities()` classifies mobs/players/items (sheep → wool plan); API:
    `openSectors/sectorDepth/sightingTarget/lookReport`. Explorer(bot) hunts fresh
    sightings instead of wandering blind and scores direction choice by sightline length.
18. **Pillar patience** — `builder.pillar` stall guard: 30 ticks with ZERO placements →
    give up (was 200, then 60; lowered again in the live-game session - the stub
    `isOnGround` is always true, so offline the pillar can never place and every extra
    patience tick is pure jump spam). Patient 200 once placements start.
19. **/reload contract** — reload gate green (`run-all --quick`): all 86 files free of bare
    event subscriptions and leaked timers; new sweep code adds no timers/subscriptions.
    Every script stays auto-reloadable via /reload.

## TODO — PRIORITY ORDER for next session

1. **`rebuildRoute()` — blast / cave recovery (user's top ask).** After an explosion/creeper
   blows the path, or the bot falls into a cave: re-verify EACH route cell before walking it
   (`terrain.solid(next)`); if the next cell is air/hazard → rebuild that segment, in order:
   bridge the missing floor (builder) → tunnel line-of-sight walls (digCell) → pillar/scaffold
   up the column → parkour 1–3 gap remnants. Bounded per attempt; trigger also on explosion
   damage / fall without damage, not only nav failure. REUSE tryReach() primitives.
2. **Resume an open shaft instead of re-mining surface dirt.** User: "goes deepmining comes
   back starting mining more dirts". After a deep trip ends, the task re-scans and accepts
   surface-level work. Remember active site (deepMiner.site) + trail per task; re-enter shaft
   or move to the next objective; never re-scan bulk dirt after a deep trip in the same task.
3. ~~**Auto-retry blocked tasks**~~ DONE 2026-10-19 - retry-bounded ladder + deeper recoverTask (see the 2026-10-19 addendum at the end). No follow-up known.
4. **Furnace underground gating** — furnace smelt deep underground currently starts with
   enough logs; prefer exit-first when smelting needs sleep/safety, or only start with
   torch-coal surplus.
5. **Climb-out cave escape in `escape.js` `trapped()`** — mine ceiling p+2 then jump+place
   (open when 2 above air + cardinal safe); wire to survival-master `handleCaveEmptyHunger`
   /`handleHoleTooDeep`; sibling of the deepMiner ascent path.
6. **Tool-craft stall when the table is left behind** — starter soak: after wandering off,
   wooden pickaxe crafted but stone pickaxe delayed: table placed in world, bag has 3 planks
   (<4) + 0 logs, so ensureTable can't make a new one and the goal loops "exploring for
   cobblestone". Fix: recall/reuse `tablePosition` (walk back if < 32) or pick the placed
   table back up; else goal director should queue "1 log/4 planks" gather instead of more cobble.
7. **Lag trims** — `woodExposed()` 6 reads per wood candidate during scans: cache per cell
   per tick; skip entirely for non-wood scans. Profile BlockScan budget after (the sweep adds
   ~4 rays + 1 entity query per 20 ticks).
8. **Cave-exit polish** — ascend after falling off-route: deepMiner.ascend → route exhausted
   path should use rebuildRoute (item 1) toward `site.origin`/trail.
9. **Sealed-shaft soak scenario** — plug the shaft mid-ascent (cap the column above the bot)
   and assert the staircase fallback still reaches the surface.

## Known noise / do not touch

- `git status` shows ~1100 deleted files in bundled "AI Players Add-On BP/RP" — pre-existing,
  not ours.
- `!bot auto` must not be needed twice (item 3); `run-all.mjs --quick` exits 1 by design.
- Single-player auto-grant `verdant.admin` lives in `scripts/main.js` (zero-command spawn).
- "exploring the same corners" in the 48x48 soak world is stub-world size, not a bug.
- Offline pillar never places (stub `isOnGround` always true) — expected; guard gives up at 30.
- Another session edits `tools/` (run-all.mjs, tests.mjs, stubs, install.mjs) concurrently:
  re-run the gate before touching those, and never run `tools/stubs/install.mjs` directly —
  the gate's `installStubs()` is what syncs `scripts/` → `tools/load/` for the soaks.

## Session addendum (2026-10-18) - 1.2.9, village locate, 16 fixes, audit P1

### ENGINE VERSION - IMPORTANT

UPDATE 2026-10-18 (late): the revert below was APPLIED after live diagnosis. The client
is confirmed `Microsoft.MinecraftUWP 1.21.11401.0` (Get-AppxPackage) and refused to load
the 1.21.120/2.4.0-beta manifest (user report: "the pack is not loading"; no script banner
in ContentLog). manifest.json now: header [1,2,9], `min_engine_version [1,21,114]`, dep
`@minecraft/server 2.3.0-beta` - matching the proven-working 1.2.8 manifest byte-for-byte
on deps. When the game updates to 1.21.120+, flip these back (native structure probes
re-enable themselves).

- No code edit was needed: uptime feature-detects (`dim.getGeneratedStructures`),
  probes auto-disable, and village finding uses the corrected
  `findClosestBiome(biome, location)` order. Doc evidence lives in docs/RESOURCES.md Sec 4.

The biome call was silently dead before this session: the pack called
`findClosestBiome(pos, biome, {...})` - wrong order on every engine version.

### Village locate ladder (replaced the "weird village finder")

runtime/village.js `locateVillageBiome()`:
1. PRIMARY (Mojang-provided): `Dimension.getGeneratedStructures(location)`
   (module 2.4.0-beta+, Bedrock 1.21.120+). Coarse 64-block outward-growing probe
   grid (`PROBE_*` constants), negative-cache for missed cells, auto-disable after
   8 consecutive throws; a hit IS a generated village (id matches /village/i).
2. FALLBACK: seed-derived biome patch - `calculateClosestBiomeFromSeed(location, biome)`
   (module 2.9.0), else `findClosestBiome(biome, location)` (2.3.0-beta..2.8.0-beta).
Heavy search throttled to every 600 ticks (village scan interval 40 -> 120).

Offline proof: tools/tests.mjs "village locate ladder" - 12 assertions (probe hit,
footprint containment, throttle identity, arg-order regression guard, throw-disable,
graceful degradation when every finder is missing). Stub gained getGeneratedStructures
(`__harness.setStructure(loc, id, radius)`) plus the two biome call shapes.

### 16 bugs fixed this session (audit ses_eb2655aefffeGbyfBuYxy9An0O + live play)

1. deposit() bridge - raw Container bridged via ad-hoc adapter (inventory.js)
2. front-block/mine tool cases needed exact tier 2/3 rule bumps (bot.js)
3. bed-camp add() NaN guard x2 (bot.js)
4. dead `rule.tier > 0` inner check + dead emptyHand branch removed (bot.js)
5. getCachedThreat() warmed after closure definition (bot.js)
6. threatInfo 3-tick memo grace for non-empty lists (world.js)
7. idle() resets _idleSince when mode != "idle" (bot.js)
8. emptyHand() now starts at slot -1 (inventory.js)
9. tree-mode quota uses Math.max(gained, m.broken) (bot.js)
10. scanOres dropped a wrong predicate-identity cache check (world.js)
11. main.js entityDie handler try/catch + `bot?.sim?.isValid` guard
12. patrol block/settings.patrol dead path - REPORT ONLY (not touched)
13. mine full-inventory re-block - judged misdiagnosed, no change
14. stub Identity: FakeDimension.getGeneratedStructures + engine.structures
15. engine.structures init also in Engine constructor (was only in reset())
16. LIVE: "Cannot climb back to the surface (stuck at Y=19)" - the bot now digs
    its own way out BEFORE asking for help: deepMiner.digToSurface() retries
    pillar/staircase, then cuts a 1x1 pocket into a safe wall and climbs from its
    floor. Pocket cutting respects safeToMineEx: no falling column (gravel/sand)
    overhead, no water/lava in or beside the cut. Bounded 900 ticks without
    height gain, then the honest "needs help" handover (bot.js + mining.js).

### Audit Phase P1 applied

- ui.js: titleraw runCommand actionbar fallback DELETED (dead on every supported
  engine + injection surface via ownerName). setActionBar is the only path.
- looting.js: containers detected via `minecraft:inventory` component presence
  (future-proof), id-table fallback kept; both scan and loot verification.
- core/inventory-model.js maxStack(): native-first via injected resolver;
  runtime/inventory.js registers ItemStack.maxAmount (per-type cache, cap 256);
  regex table stays for offline / constructor-less engines.
- Stub ItemStack.maxAmount now mirrors the 1/16/64 tiers (offline parity).
- verdant:bot slash command NOT shipped (chat !bot parser unchanged): the
  ship decision went unanswered; also the reload gate forbids raw
  .subscribe() outside lifecycle.js, so a scaffold needs that work first.

### Verify

`node tools/run-all.mjs` - all steps passed (86 modules, 4 gates, unit 53 + 12
locator, skills 80, perf 53; negative selftest expected-fail as designed).

## Chest handling v2 (2026-10-18) - "loot all chests, use what matters"

Runtime looting is now a full-drain + use-it pipeline, built on the Script API
container surface:

- DETECT: block.getComponent("minecraft:inventory") presence decides what counts
  as a chest (runtime/looting.js isContainerBlock). Chest, trapped chest, barrel,
  shulker boxes in every colour, and future containers (e.g. copper chest) are
  covered with NO id table to update. Answers cached per typeId (0 extra
  component calls per sweep type after first contact). Ender chest is vetoed on
  both paths: its contents are ender-storage-bound, never block-local, so the
  bot must not plan a trip for it.
- TAKE: core/knowledge.js chooseLoot is a full-drain plan: critical first, then
  stacks that merge into carried partial stacks (zero slot cost - always
  taken), then valuable, then by score; junk rides last and only while the bag
  is roomy (6+ spare slots). New distinct types stop at freeSlots - RESERVE(2)
  so travel drops stay pickable. Whatever does not fit STAYS in the chest
  honestly (the old score > 50 shine threshold left most structure loot there).
  runtime/looting.js lootChest drains ONE withdraw() per distinct type
  (previously one sweep per chosen stack, up to 27 native sweeps per chest).
- USE: after a successful drain, Looting.lootIntegration() runs immediately:
  Equipment.autoEquip() (best armour per slot, rollbacks on engine refusal) and
  ensureWeaponEquipped() (best weapon into hand). Food/block/torch/ore use flows
  through the standing directors on their own cadence; deposits to the owner
  base use the rollback-safe deposit() bridge.

Offline proof: tools/tests.mjs "chest loot planning" (14 assertions - drain
budgets, merge-rides-free, junk roominess split, component-first detection,
ender-chest veto, false positives). `node tools/run-all.mjs` all steps passed.

## Session addendum (2026-10-18, later) — sneak leak, live-game fixes, village raid

### Why the bot "sneaked randomly while mining" (root cause, fixed)

`Builder.placeAt` / `Hands.place` set `sim.isSneaking = true` for `{sneak:true}`
placements (bridges, pillar fills, shelter seals, combat walls - ~30 call sites) and
NEVER restored it. Two consequences, both live-only (the stub `isOnGround` is always
true, so no soak ever felt them):

1. The bot visibly walked around sneaking whenever the last thing it did was place a
   block - the reported "sneaks while mining randomly".
2. `navigation.js` canJump refuses to jump while sneaking (vanilla rule) - after any
   leak the bot could not step up: it ground against steps, kept "Climbing shaft
   (N left) - advanced unbreakable", and every `sim.jump()` was a silent no-op. This
   fed the hop/bounce loops independently of the A* livelock fix.

Fix: sneak is scoped to the placement call (try/finally in both primitives: set before
use, restore the previous value after - a deliberate sneak is never stomped).
`GolemDirector.reset()` also unsneaks on fight end. `escape.pillar` had the same bug
inverted: it set sneak=true and THEN called `sim.jump()`; a sneaking player cannot
jump, so the trapped-pillar escape could stand still. It now clears sneak for the jump
(the airborne placement keeps its own scoped sneak).

### Live-game fixes batch (hops, furnace stare, deep tree scans)

- **Endless jumping during "Climbing shaft (1 left)"**: `hop()` (both miner classes)
  suppresses futile hops - after 2 attempts with no height gain on the same target,
  hop goes quiet and the settle timeouts (25-tick grounded / 80-tick prove-airborne)
  declare blocked → stair/pillar digs. Pillar zero-placement patience 60 → 30.
- **Staring at the furnace while smelting**: new `smeltWait()`/`smeltSweep()` in
  survival.js - during a smelt wait the bot digs nearby coal first (reach-only radius 4,
  ore types only, never the furnace), then iron/copper; skip key + backoff stops
  re-picking rejected cells. Both furnace-wait sites use it.
- **Tree scanning deep underground**: when fuel is missing, the pickaxe is usable and
  y < 60, the fuel fallback now `ensure("minecraft:coal", 2)` instead of planks - no
  "#logs" scans in a shaft. Planks stay the above-ground / no-pickaxe fallback.

### Village raid (user ask: "quick after tools, forced at 5 minutes")

- `village.js`: `VILLAGE_RAID_DEADLINE = 6000` (5 min) + `VILLAGE_RAID_GRACE = 6000`.
  `overdue(tick)` flips `forced` when a known village was deferred past the deadline;
  `pendingFirstTrip` keeps the deep-shaft gate CLOSED while owed and only gives up
  after deadline+grace (no deadlock on a phantom village).
- `survival.js` raid branch: opens as soon as TOOLS exist (any pickaxe tier or a
  weapon) instead of "any wood/cobble"; overdue forces the trip even bare-handed.
- `bot.js` `deepMine()`: when `village.forced` and a shaft is active (survival mode),
  `deepMiner.wantsOut = true` - the current shaft ends at the next safe point and
  ascends; new shafts were already refused by `villageGateOpen`.
- `executeVillageRun` order: travel → **iron golem** → hay/bread → **ALL chests** →
  beds → **iron bucket**.
  - Golem: `GolemDirector.tick(tick, raid=true)` - the raid flag only drops the soft
    "iron is available elsewhere" out; safety scoring is untouched (raid fights still
    require score ≥ 30 AND health > 12; normal mode keeps score > 60). After the golem
    is gone, `sweepDrops()` walks its 3-5 ingot drops until the engine collects them.
  - Chests: repeated `Looting.tick()` sweeps - each drained chest is ignored, so the
    sweep walks on to the next until the village is picked clean.
  - Bucket: with 3+ iron and no bucket, crafts `minecraft:bucket` (recipe already in
    core/recipes.js); if no table is in reach it first obtains/places a crafting table
    via `bot.builder.placeAt` at a cardinal air spot (bounded: gives up after 80 ticks
    so the rest of the raid continues).
- Location finding stays Script-API-native: `getGeneratedStructures` probe ladder →
  `findClosestBiome`/seed fallback (ladder unchanged; force logic added around it).

### Soaks this session

- wood 3000: no plateau, no freeze, errors=0 throws=0.
- mine-iron 4000: continuous ascent y 17→42, route 171→21 left, only 33 jumps total,
  errors=0 throws=0 (old runs wasted the whole climb on hop spam).
- village 4000: raid reached + looted (`visited=true`), then disengaged cleanly,
  errors=0; `givenUp=false`.
- Gate: `node tools/run-all.mjs --quick` → "all steps passed" (86 modules, all suites).

### Live-check notes

- The stub `sim.isSneaking` is a plain field; offline never models "can't jump while
  sneaking", so this leak was invisible to every soak - live re-test the shaft climb.
- The village soak world has no iron golem and no chest: the golem-fight, drop-sweep
  and bucket steps are gate-verified (parse + no-undef) but not soak-exercised - live
  check them on a real village.
- Timing: the raid deadline clock starts when a village is FIRST known
  (probe hit / villager sighting), then 5 minutes - not from world spawn.

## Pack-load incident (2026-10-18, late) - "the pack is not loading"

### Root cause
- Client = `Microsoft.MinecraftUWP 1.21.11401.0`. Its engine resolves
  `@minecraft/server 2.3.0-beta` fine (the 1.2.8 pack loads all day in ContentLog).
- The 1.2.9 tree pinned `min_engine_version [1,21,120]` + `@minecraft/server 2.4.0-beta`;
  a 1.21.114 client refuses to activate the pack -> scripts never load (no banner).
- Fixed: header text 1.21.120 -> 1.21.114, `min_engine_version [1,21,114]`, dep
  `2.3.0-beta`. No code change (structure probes feature-detect). Flip back on 1.21.120+.

### Worlds run their OWN copy of the pack (workflow gotcha)
- Each world keeps a full copy at `minecraftWorlds/<id>/behavior_packs/VerdantBot(2)/`.
  Editing the global workspace does NOT affect any existing world - sync per world.
- The two test worlds (both named "My World": `GIlG3GVSpfA=`, `R-MXmy0oSpg=`) had a stale
  copy AND `world_behavior_packs.json` still referenced [1,2,8] while the folder was 1.2.9.
- Synced `manifest.json` + `scripts/` (robocopy /MIR) into both; bumped both refs to
  [1,2,9]. If a world ever shows the pack missing, re-add it in the world UI once
  (that rewrites the reference).

### Side fix: DisplaySlotId native warning on every load
- ui.js passed the raw string "sidebar" to `sb.setObjectiveAtDisplaySlot(...)`; the engine
  warns "expected type: DisplaySlotId" and the sidebar never set. Now imports
  `DisplaySlotId` and passes `DisplaySlotId.Sidebar` (ui.js:29/58). Stub gained
  `export const DisplaySlotId` so the import scan gate stays green.

### Verified
- Gate: "all steps passed" (86 modules) after the edits.
- Both world manifests byte-identical to global; script markers (VILLAGE_RAID_DEADLINE,
  DisplaySlotId.Sidebar) confirmed in both world copies. Minecraft was closed during writes.
- Seen in the old log: engine "[Watchdog] High memory usage detected" lines at 12:56-12:58
  during 1.2.8 runs - pre-existing, unrelated; note if it returns with the new build.

## Inventory-full incident (2026-10-19) - "Inventory full; nothing consumed" and now stuck

### Root cause
- `core/recipes.js` `craft()` simulates first and throws `Error("Inventory full; nothing
  consumed.")` when the crafted output fits neither an existing stack nor an empty slot
  (the real inventory is untouched - the message just means "no room for the output").
- Callers that do not wrap the throw (`bot.obtain()` -> `case "craft": this.craft(step.item)`,
  user craft paths, ...) bubble it out of the mode tick into the bot.js catch, which calls
  `blockTask(String(error), "manual")` -> banner "Problem: Error: Inventory full; nothing
  consumed. (while autonomous survival ...) Task needs attention" and NO retry: the mission
  parks until the owner notices.

### Fixes
- `runtime/inventory.js`: new `ResourceManager.makeRoom(need)` - merges partial stacks
  (`Bag.organize()`), then sheds WHOLE bulk stacks per `SHED_RULES` (gravel/sand first, then
  stone/deepslate/andesite/diorite/granite/tuff/netherrack/basalt/blackstone, then the dirt
  family; the cobblestone family keeps a 64 floor; never below a 16-placeable bridging
  reserve). `dropStack()` spawns the stack at the bot's feet and shuns the entity in
  `bot.grabIgnore` (30 s) so pickup sweeps do not walk back onto it.
- `organizeIfNeeded()`: when 0 slots are free it now also sheds - heals every
  "Inventory full; organizing and retrying" call site (bot.js 1088/1980/2298/3198,
  survival-master).
- `bot.craft()`: on "Inventory full" -> `makeRoom(1)` -> run the same recipe once more; if
  nothing shed-able or still stuck -> `TaskFault(..., "retry")` so the block retries with
  backoff instead of dead-ending as manual.
- Pickup filters now honor `grabIgnore`: Miner/DeepMiner `maybeCollect` (new `shunnedDrop`
  helper, mining.js), `Drops.near`, `ResourceManager.findOpportunistic`, bot collect mode.
- BONUS bug: `Bag.organize()` now rebinds the merge target. Previously `const target` was
  captured once, so merging 3+ partial stacks recomputed from the original amount and
  silently DELETED the extra units (8x8 cobble merged to 16 instead of 64). deposit/withdraw
  were already correct.

### Verified
- Gate: "all steps passed" (86 modules, undef OK).
- Focused harness test (`%TEMP%\opencode\inv-full-test.mjs`): full bag of junk -> craft sheds
  exactly one stack (gravel, first rule) and succeeds; merge-only path frees a slot with zero
  drops; all-valuable full bag -> TaskFault("retry"), nothing dropped; organizer self-heals a
  dead-full bag. ALL PASS.
- Soaks after the change: survival 2500 and mine-iron 3000 - 0 engine errors, 0 fatal throws
  (deep run broke 432 blocks, collected 431 cobble, ascent active at t=1501).
- Both test worlds re-synced (scripts /MIR + manifest copy); world copies confirmed to carry
  SHED_RULES, the organize fix, and makeRoom.
- Live unstick for an ALREADY-blocked bot: `!bot resume` (`resume()` resets `this.blocked`).
  The new build stops producing manual blocks for this case.

## Blocked-task auto-recovery (2026-10-19) - "must press !bot auto multiple times"

Why the manual presses used to be mandatory:

- The two generic catches in `bot.js` think() / director-mining fed ANY unexpected
  (non-TaskFault) error into `blockTask(reason, "manual")` - parked forever on the
  FIRST engine hiccup, until the owner typed `!bot auto` (which works because
  `setMode()` resets every component) or `!bot resume`.
- Automatic "retry" blocks did resume via `recoverTask()`, but the recovery did not
  drop what the blocked run believed: nav kept the route that ended at the tripping
  cell and the terrain cache kept a stale snapshot, so the task re-blocked fast and
  climbed the backoff ladder (40 -> 80 -> ... -> 1200 ticks) while looking parked.

Fixes (scripts/core/arbiter.js + scripts/runtime/bot.js):

1. `blockedTask()` gains recovery `"retry-bounded"`: same backoff ladder
   (40, 80, ... capped at 1200 ticks) but after MANY_RETRIES (5) consecutive failures
   without progress it caps into an honest manual stop - flagged `capped: true`, tell
   text "Retried N times without progress - stopping retry; needs attention".
   Mirrors the README circuit-breaker spirit ("five successive errors pause") at task
   level, without parking on the first hiccup anymore.
2. think()'s blocked branch re-arms a capped block one fresh bounded round
   (`"retry-bounded"`, attempts reset) every ~2400 ticks of quiet: the world may have
   changed while the bot waited (mob left, liquid settled, drops despawned).
   Genuine owner-decision manuals (equipment CRITICAL rollback, missing component,
   "Assisted crafting must be enabled") have `capped: false` and stay parked - that
   distinction is the whole point: bounded ladders cap, declared manuals never move.
3. `recoverTask()` retries change WHAT is trusted: `nav.reset()` always; from
   attempt 3 on also `terrain.clear()` + `awareness.reset()` so the replan re-probes
   instead of trying the same path again.
4. `blockTask()` decays the attempt ladder after a 2400-tick quiet gap
   (`lastBlockedAt`) so the delay is not pinned at the 1200-tick cap forever, and
   `this.recoveryAttempts` keeps its existing progress-signature reset.

Verified (offline):

- Gate: `node tools/run-all.mjs` - all steps passed (86 modules; unit now has a
  "blocked-task recovery ladder" section, 10 assertions: ladder delays, cap-at-1200,
  5-then-manual for bounded, owners-only for manual, TaskFault default).
- Soaks: survival 2500 and mine-iron 3000 - 0 engine errors, 0 fatal throws.
- Retry-bounded is only produced by the two think() catches; every explicit
  `new TaskFault(..., "retry")` site and the default-`"retry"` blockTask sites keep
  the unbounded retry they always had. Equipment CRITICAL manuals untouched.

## Escape-the-fastest incident (2026-10-19) - "pillar up by mining the block above"

### The gap
- The climb machinery had pillSteps only: `pillarStep` (jump + place, needs an OPEN
  column above) and `stairUpStep` (carve sideways). When the space above the head was
  solid rock and the recorded route was gone (refilled tunnel, blast debris, an erased
  shaft), the pillar could not rise and the only way out was the slow sideways
  staircase - the "digs forever, never comes out" live complaint.

### The move (user's ask)
- New `digUpStep` (mining.js, beside pillarStep): mine the block at F+2 (above the
  head), then pillar-jump into the freed cell; repeat one block at a time. The ceiling
  dig yields the cobble for the next pillar, so a miner with a pickaxe never runs out
  of material mid-climb.
- `climbUp` order is now: open column -> `pillarStep`; roofed column -> `digUpStep`;
  anything else -> `stairUpStep`. All caller chains (ascendStep, routeAscend,
  digToSurface rescue) pick it up unchanged.
- Safety (an opened ceiling is irreversible): refuse lava in the 5 cells above
  (900-tick cooldown via `digUpDisabledUntil`, staircase meanwhile); refuse
  sand/gravel 2+ cells above the ceiling; water at head/ceiling defers to the flooded
  climb; a blacklisted/unbreakable ceiling disables digUp and falls through to the
  staircase. The ceiling block itself may be sand/gravel - breaking it just drops it.
- `digUpCleared` retire: after WE clear a ceiling (or sweep the cobble it dropped),
  reset `pillarDisabledUntil` / `pillarState` / `builder.resetPillar` so a 600-tick
  cooldown a blocked attempt had set cannot stall the column we just opened (observed
  live in the pocket soak: pilOff=2007 recovered to 0 right after the ceiling dig).

### Verified
- Gate: "all steps passed" (86 modules, undef OK).
- Pocket soak (`%TEMP%\opencode\soak-debug.mjs` scenario "pocket"): teleported into a
  hand-carved 1x1x2 pocket in VIRGIN stone at y10, route erased - the only way out is
  digUp. Bot surfaced (maxY 64, task finished idle "guarding UP"), digUp engaged
  (54 ceiling-dig ticks, 212 jumps total), 0 engine errors / 0 fatal throws.
- Seal soak (scenario "seal"): mid-ascent the column above the bot was walled to the
  surface and its route erased; the bot climbed back out (y18 -> surface by ~t2600)
  with the pillar/digUp/stair blend, 0 errors.
- Regressions: mine-iron 4000 and survival 2500 soaks both 0 errors / 0 throws.
- Both test worlds re-synced; `mining.js` and `inventory.js` hashes identical across
  workspace and both world copies.

## Village return + honest mine conclusion (2026-10-19, ~01:50) - "doesn't come back to go village"

Two behavior fixes in `bot.js` (grep by `concludedNoQuota`, `"exhausted"`,
`pendingFirstTrip?.(tick)`):

1. **Village-first shaft exit.** `deepMine()` now ends the ACTIVE shaft at the next
   safe point as soon as the first village trip is OWED (`village.pendingFirstTrip`),
   not only after the 5-minute `forced` flag. New shafts were already refused by
   `villageGateOpen`; this closes the "keeps deep-mining while a known village waits"
   hole. Survival mode only; user `!bot mine/deepmine` orders stay exempt.
2. **Honest shaft conclusion + hand-back.** A deep/shallow ascent finishing WITHOUT
   the quota (no vein / full bag) now returns `"exhausted"` (was `"done"` + a false
   "retrying robustly" and a false "Mining quota complete" later):
   - recorded as "No vein found on that shaft. Climbed out; concluding the shaft.";
   - `mine()` sets `m.concludedNoQuota` and ends the task so directors re-evaluate
     (village-first / next objective) instead of the task re-scanning surface work;
   - director mining reason: "Shaft concluded without the quota; re-evaluating objectives.";
   - command mining stops honestly: "Shaft concluded without the quota (no vein in
     reach). Stopped; reissue the command to retry." The quota-met path is unchanged.

### Verified
- Gate: "all steps passed" (86 modules).
- mine-iron soak 7000: honest conclusion + stop fired at t=5828 after the climb-out;
  0 engine errors / 0 fatal throws.
- survival 3000: 0/0. village 4000: `visited=true`, raid intact, 0/0.
- Worlds `41XyVhZFztw=` (live), `GIlG3GVSpfA=`, `R-MXmy0oSpg=` re-synced - only
  `bot.js` differed; `/reload` (or world re-entry) loads the fixes live.

### Still open (user asks this session, in their words)
- "goes to different shaft" = TODO #2 proper: remember deepMiner.site + trail and
  RE-ENTER the old shaft instead of digging a fresh one.
- "stuck on walking out" = ascent pace; digUp/seal work above is in-tree; needs a
  live log if it still stalls.
- "reaches for the crafting table mid-mine" = survival ladder servicing needs
  (pickaxe about to break -> retool; furnace/torch steps) - for a coherent finite
  mission use `!bot speedrun`; `!bot auto` never finishes by design.

## Return-to-surface walk: bounded fallback (2026-10-19, ~02:15) - "looping in one direction"

Follow-up on the "stuck between walking out, looping in one direction" report.
Root cause: in the `m.returning` branch of `mine()` (`"Returning to surface
entrance along mapped path (N left)"`), the same-level crumb walk had a bounded
skip (200 ticks per crumb) but NO escalation: with one crumb left (or two
non-converging crumbs) the timer re-armed forever while `navTo` kept walking
into the same wall - a silent loop that never handed off to the proven
pillar/digUp climber.

Fix (all in `bot.js`, `m.returning` branch):
1. `m.returnSkips` counter + escalation: after 2 stalled windows (or immediately
   when only the entrance crumb is left), drop the crumb trail entirely and aim
   at the entrance COLUMN ("Trail not converging; climbing straight for the
   entrance column"). The monotonic vertical climb owns height from there, and
   the existing entrance-column branch still falls back to `digToSurface`.
2. If the bot is already at entrance height when that happens, the return ENDS
   honestly ("At the surface but the entrance cell is unreachable; ending the
   return here.") with `m.concludedNoQuota` set correctly, instead of looping.
3. No-height guard on the vertical climb (mirrors routeAscend's 900-tick net):
   a climb that "works" without gaining a block now goes straight to
   `digToSurface` (and blocks for help if even that bails) instead of spinning.
4. Arrival path now sets `m.concludedNoQuota = !met` so the caller's message
   can never claim "quota complete" for an exhausted trip.

### Verified
- Gate: "all steps passed" (86 modules, undef OK).
- mine-iron soak 7000: honest conclusion at t=5828, 0 engine errors / 0 fatal
  throws; return/exit paths exercised up to idle.
- Worlds re-synced: full 86-file refresh (world copies were older revisions);
  hashes now identical across workspace + `41XyVhZFztw=`, `GIlG3GVSpfA=`,
  `R-MXmy0oSpg=`. `/reload` or world re-entry required.

## Efficient-Bot port - 1.3.0 (2026-10-19) - recipes + honest acquisition routes

Ported what fits from github.com/Efficient123/Efficient-Bot (commit 29fff0e7).
Full write-up: docs/MIGRATION.md.

- Data companions (generated, attribution headers): `core/data/recipes-efficient.js`
  (231 crafting-table recipes / 224 outputs, +12 smelt pairs) and
  `core/data/acquire.js` (68 item -> source routes, 16 mob drops). Extractor:
  `tools/migrate/extract-efficient-bot.mjs` (re-run to regenerate; prints skip stats).
- Curation: concrete ids only; pseudo ids (planks/logs/boat/wool/dye, generic
  sign/fence_gate/wooden_door) dropped; typos repaired (darkoak_sign, sugarcane);
  recipes whose output the furnace already produces dropped (ingot loops);
  tool/ore smelts dropped; a block route is offered only when MINE actually
  drops the item (flint stays blocked; apple/melon stay blocked).
- Core: new `core/acquire.js` (mineBlocksFor + acquireRoute with tool gating);
  `craft-plan.js` recipesFor/smeltSource consult the companions (data wins) and
  export `expansionRecipeFor()` in executor shape; `nextStep()` order is
  hand recipe -> GATHER_TIER -> mob route -> expansion recipe -> block route ->
  log fallback -> blocked.
- Runtime: `bot.craft()` falls back to expansionRecipeFor (new items are
  executable, not just plannable); `obtain()` executes the new `acquire` step -
  block routes reuse the miner, mob routes run find/chase/melee/wait-for-drop
  (settings.hunting gate, 2400-tick honest timeout -> blockedTask, counts the
  bag, never assumes kill credit); `cancelWork()` clears the acquire state.
- MINE gained sand/red_sand/clay/moss_block/pointed_dripstone + common flowers
  so the new routes have a real basis.
- Skipped (documented in MIGRATION.md): HPA*/superDistant pathfinding,
  spatialIdentifier, fake mine/place + explore/biomeLoc, stonecutter stations,
  loot/brush routes, engine-facing code (upstream targets 2.8.0-beta/1.26).
- Upstream ships NO LICENSE; only factual data was re-authored, no code copied.

### Verified
- `node tools/run-all.mjs` - all gates + unit + skills + must-fail fixture pass;
  new tests.mjs section "efficient-bot port (recipes, acquire, smelts)":
  32 passed, 0 failed (hygiene, family refs, smelt shadowing, nextStep
  integration, tool gating, honest refusals, planCraft over every output).
- manifest 1.2.9 -> 1.3.0 (name/description updated).
