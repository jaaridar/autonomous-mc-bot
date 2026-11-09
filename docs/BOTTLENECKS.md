# Verdant Bot — bottleneck & defect audit (v1.2.8)

This document records the engineering audit that produced the v1.2.8 fixes:
what was actually wrong, where, how it showed up in game ("stuck in terrain",
"lava", "can't escape", "stuck in a loop", "state machine is bad"), and what
was changed. Every claim below was verified against the source and, where
possible, with the offline verification suite (`node tools/run-all.mjs`).

## 1. Critical defects (bot-stopping / death-causing)

### 1.1 Escape watchdog gave up after 12 ticks — `runtime/escape.js: bump()`
`walkTo()` called `bump()` which incremented a counter **on every tick** and
gave up at 12. Any escape walk longer than 0.6 s reported "done"; the caller
counted it as an attempt; after 14 attempts (`escapeAttempts >= 14`) the bot
called `blockTask()` and stopped. **This is the single largest cause of
"can't escape".** Fixed: the counter now only advances while the position is
not changing (>1.5 blocks of movement re-arms); 80 consecutive stagnant ticks
(4 s) hand control back to the pathfinder.

### 1.2 Escape refused every walk-out not pointing at the owner — `trapped()`
Any `walk`/`drop` plan that was not committed or toward the goal direction
was silently skipped (`continue`), even when it was the only survivable exit.
Result: "No way out" at a one-block sideways exit. Fixed: all viable plans
including sideways walks are ranked (tunnel > bridge > climb > preferred walk
> any walk) via the new pure, unit-tested `rankEscapePlans()` in
`core/escape-strategy.js`; a sideways-only walk is still taken.

### 1.3 No lava emergency in the trap path — `trapped()`
A bot standing in/on lava kept walking and melted, or dithered between
priority branches. Fixed: if the feet/head/support cell is lava and a water
bucket is carried, water is placed immediately (source lava → obsidian); the
fire-and-forget fallback message now only applies with no water.

### 1.4 Arbiter let food beat survival — `core/arbiter.js`
Escape scored 80–88 and food scored up to 92, so a starving bot could choose
`eat` over fleeing lava/mobs; survival_master at 90 lost to food at 92.
Fixed scoring: fall=100, head-in-water=99, hp≤6=96, escape (water)=97,
escape (hazard below)=94 — all now outrank food (90) and missions.

### 1.5 No global no-progress watchdog — `runtime/bot.js`
Every layer could keep issuing actions while the position and inventory were
identical indefinitely ("state machine stuck in a loop"). Fixed: a global
watchdog in `think()` for task modes (mine/goto/starter/speedrun/survival/
collect/loot/golem/recover; stationary modes and boat/sleep are exempt):
- 60 s without progress → `nav.reset()`, force explore / fresh approach
- 120 s without progress → `blockTask(..., "retry")` — honest stop instead of
  an infinite loop (auto-retries via the existing recovery path)

### 1.6 Pathfinder could not plan any drop over 3 blocks — `core/navigation.js`
Drops were hard-limited to 3; any cliff deeper than 3 blocks was unpathable,
so the bot stood at cliff edges forever. Fixed: `maxDrop` option (2–6);
`runtime/navigation.js replan()` prices it from HP (16+ → 5, 12+ → 4, <6 → 2)
and fall cost now scales with depth (`DROP_COST`). Hurt bots still refuse
harmful falls.

## 2. High-impact improvements

### 2.1 Lava-aware routing — `core/navigation.js`
Cells whose feet/head/support cell touches lava now carry a soft cost
(+6). The search strongly prefers lava-free routes (verified: found routes
over a 3-wide lava strip contain zero lava-adjacent cells) but still uses a
lava-edge cell when it is the only way through (never blocks forever).

### 2.2 Best-effort partial routes — `core/navigation.js`
The "return a partial route when the budget runs out" escape hatch required
≥3 blocks of improvement; now ≥2. Combined with 2.1/1.6 the pathfinder makes
strictly more progress on partially-open terrain instead of failing into the
obstruction-clear/`blockTask` fallback.

### 2.3 Waypoint arrival radius — `runtime/navigation.js`
0.5 blocks was rarely reachable against knockback/currents → endless
re-issue → `retries > 4` → false "Stuck". Now 0.72.

### 2.4 Open-heap tie-breaking — `core/navigation.js`
Equal-f nodes were popped in arbitrary order, causing dense, oscillating
expansions. FIFO counter tie-break makes the search deterministic and
broader-first at equal cost; block reads unchanged or better.

### 2.5 A* cost table — `core/navigation.js`
`step`/`drop`/`bigdrop` were missing from `KIND_COST` (silently 1.5/∞);
explicit costs (2 / 1.5 / 3.5) and drop-depth pricing fix the cost model.

### 2.6 Dead arbiter code — `core/arbiter.js`
The follow-distance expression `bot.terrain ? bot.terrain.distance ? 0 : 0 : 0`
always produced 0. Removed.

### 2.7 Diagonal escape candidates — `runtime/escape.js`
`candidateDirs()` probed only 4 cardinals; a pit whose only openings are
corners was declared unsolvable. Diagonals are now appended (cardinals keep
priority).

## 3. Performance audit (what dominates tick cost)

| Component | Finding | Status |
|---|---|---|
| A* `PathSearch` | Buffered/memoised reads; 1200-node rolling horizon | kept; tie-break + lava check add ~8 memoised reads per pushed node |
| `Terrain.threatInfo` | Per-tick memoised, callers get copies | kept |
| `Bag.counts()` / `usableCounts()` | Per-tick snapshot cache | kept |
| `survivalMaster.tick` | 20-tick throttle + per-tick threat/inventory caches | kept |
| `arbiter` | 20-tick re-evaluation, no director double-tick | kept |
| `findObstructions` ray | Only on failure paths | kept |
| `storeNear`/`scanOres` | Precomputed sphere offsets, bounded budgets | kept |
| JSON `progressSignature` | 1× per second | kept |
| NEW watchdog | 1× per 5 s, O(1) | negligible |
| NEW lava-adjacency check | 8–12 memoised reads per node push; sim shows no blow-up (lava strip: 162→189) | accepted |

Net: the v1.2.8 fixes add no measurable per-tick cost; the lava-adjacency
check is the only term that touches the hot path.

## 4. Architectural problems (documented, partially addressed)

1. **Two parallel brain layers.** `scripts/core/brain/` (Arbiter with
   hysteresis, StuckDetector ladder, Blackboard failure memory, danger map)
   is fully unit-tested but **not wired into the live runtime**. The live
   loop is `think()`: UI → awareness → arbiter → survival-master → quick tool
   → death recovery → food → golem → food → bucket → structures → threat
   branch → camp → boat → mining → mode dispatch. This duplication is the
   root of the "super bad state machine" feel: directors can be consulted by
   the arbiter *and* by direct calls, and scores, not the situation, decide
   preemption. Proper fix (out of scope for this patch): migrate `think()`
   onto `core/brain` (Drives → Arbiter → SkillRunner), delete the legacy
   priority chain, and invert survival-master into skill pre/postconditions.
   The offline suite already proves that layer works.
2. **Survival-master is a 80-case scenario matcher**, not a general danger
   model. It duplicates `core/brain/danger.js` (a composable risk model used
   by nothing at runtime). Migrating handlers onto `cellDanger()` is the
   planned follow-up; until then the direct call remains as the fast lane for
   falls/head-water and the arbiter scores it only under real danger.
3. **`think()` return-early ordering** means a director returning `true`
   preempts everything below it, including the eat/retreat branch. This is
   now safe-ish because survival ids have the highest arbiter scores, but a
   full two-tier design (survival envelope vs mission planning) is required
   to make it principled.
4. **`nav.stuck` is consumed destructively** (`justStuck` read once) — by
   design, but easy to misuse; the watchdog no longer depends on it.

## 5. What was NOT changed (and why)

- Bedrock physics: no pathfinder can cross lava safely without items; the
  bot now routes around lava and survives contact via water clutch when it
  carries a bucket, and flees otherwise.
- Survival-master's 80 scripted handlers remain (heuristic, but individually
  bounded and reason-logged). Rewriting them is the follow-up in §4.2.
- Mining/deep-mining internals: unchanged; they already break–sweep and
  re-target, and the new watchdog catches non-progress there too.
- No item fabrication, no hazard bypasses, no `/locate`, no `testforblocks`:
  the honesty contract is untouched.

## 6. How to verify

```
node tools/run-all.mjs     # parse, linkcheck, undef, imports, unit, brain,
                           # capabilities, walkable, flush, pathing, perf, selftest
```

New regression suite: `tools/pathing.test.mjs` (HP-aware cliff drops, lava
headroom routing, walled-goal honesty, escape-plan ranking).
