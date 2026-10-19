# Migration: Efficient-Bot → Verdant

Verdant's acquisition brain had a hole: an item with no recipe and no ore entry
was simply "blocked", even when every player knows where it comes from (killing
a spider yields string; clay digs out of riverbanks). This note records the
port of that knowledge from
[Efficient-Bot](https://github.com/Efficient123/Efficient-Bot) and, just as
importantly, what was deliberately left behind and why.

## Source

| | |
|---|---|
| Repository | `https://github.com/Efficient123/Efficient-Bot` |
| Commit | `29fff0e71fe973bbe48662c187f9cc000834a898` (2026-06-14) |
| Variant | `Bot BP` behavior pack |
| Files used | `scripts/lookupTables/recipes_lookup.js` (468 recipes), `scripts/locations/findAt.js` (item → source table) |
| License | **none shipped** — see below |

### Licensing note

The upstream repository ships **no LICENSE file**, which under default
copyright means all rights reserved. Nothing was copied verbatim: the extractor
reads the two data files, keeps only factual information (which ingredients a
recipe consumes, which blocks/mobs yield an item), and re-emits it in Verdant's
own schema with attribution headers. No JavaScript logic was lifted. The
generated files carry the provenance header, and this document is referenced
from them. If the upstream author adds a license later, revisit this decision.

## What was ported

1. **Recipe expansion** — `scripts/core/data/recipes-efficient.js`
   (generated): 231 crafting-table recipes covering 224 outputs, plus 12 extra
   furnace pairs. Curated per the rules below, then merged *behind* Verdant's
   own data: `craft-plan.js` only consults the expansion when
   `data/recipes.js` has nothing for the item.
2. **Acquisition table** — `scripts/core/data/acquire.js` (generated): 68
   routes, of which 16 are mob drops. `scripts/core/acquire.js` turns a row
   into a decision the runtime can execute, and refuses routes the world cannot
   honour (see curation rules).
3. **`acquire` step** — `nextStep()` now returns
   `{ kind: "acquire", blocks | mobs, count }` for un-craftable items, and
   `bot.obtain()` executes it: block routes re-issue the miner, mob routes run
   an honest find → chase → melee → wait-for-drop loop that only counts a
   success when the bag actually grows.
4. **MINE coverage** — `world.js` learned sand, red sand, clay, moss,
   pointed dripstone and the common flowers so the new block routes have a
   real basis instead of dead data.

## Curation rules (enforced by the extractor)

- Crafting-table recipes only; stonecutter-only variants are not imported.
- `minecraft:planks` / `minecraft:logs` map onto `family:planks` /
  `family:logs`; pseudo items (`boat`, `chest_boat`, `wool`, `wooden_slab`,
  coarsely-typed `dye`) are dropped, generic legacy ids (`sign`,
  `fence_gate`, `wooden_door`) too, and known typos are repaired
  (`darkoak_sign` → `dark_oak_sign`, `sugarcane` → `sugar_cane`).
- Outputs Verdant already knows are left to the existing data; at most two
  variants per output.
- Recipes whose output the furnace already produces are dropped:
  `iron_ingot` from an `iron_block` is a loop (92 ingots need 9 ingots), not a
  recipe.
- Smelt pairs refuse tool recycling (`golden_axe` → nugget would melt the
  bot's own gear) and ore blocks (`coal_ore` → coal shadows the miner, which
  gets the drop directly).
- A block route is only offered when the `MINE` table actually yields the
  item. `flint`, for example, is a chance drop from gravel that the miner does
  not model — it stays honestly blocked rather than sending the bot on an
  endless gravel dig.

## Deliberately not ported

| Upstream feature | Why not |
|---|---|
| HPA* / `superDistant` pathfinding, `spatialIdentifier` | Verdant already ships its own A* `Navigator` + `Explorer`; swapping the path layer wholesale was out of scope for this port. |
| Fake mine/place (`setType`, spawned items), `explore` / `biomeLoc` | Those rely on a different engine surface (and partly on test scaffolding); Verdant performs real mining and real exploration instead. |
| Stonecutter stations, `loot` / `brush` routes | No execution path in Verdant (no brush mechanic, no egg-camping); importing them would add dead data. |
| Engine code, scheduling, `hitEntity`/`kill` internals | Upstream targets `@minecraft/server 2.8.0-beta` / `min_engine 1.26.0`; Verdant ships `2.3.0-beta` / `1.21.114`. None of the engine-facing code was copied. |

## Runtime wiring

- `nextStep()` order: hand recipe → `GATHER_TIER` → **mob route** → **expansion
  recipe** → **block route** → log fallback → blocked. A mob route outranks a
  contrived recipe (string from a spider beats string from a cobweb).
- Tooled routes gate on held tools: obsidian asks for the diamond pickaxe via
  `nextStep(tool)` before the route opens.
- `bot.craft()` falls back to `expansionRecipeFor(item)`, so the new items are
  executable, not just plannable; `obtain()`'s table check understands the
  expansion as well.
- `settings.hunting` off means mob routes refuse up front with an honest
  blocked task; a hunt that cannot find its mob within ~2 minutes also gives up
  with a real reason instead of looping.

## Regenerating

```
node tools/migrate/extract-efficient-bot.mjs "<path to>/Efficient-Bot/Bot BP"
```

The tool rewrites `scripts/core/data/recipes-efficient.js` and
`scripts/core/data/acquire.js` and prints the skip statistics (per curation
rule). Hand edits to those files will be overwritten.

## Tests

`tools/tests.mjs` section *"efficient-bot port (recipes, acquire, smelts)"*
pins the curation invariants (concrete ids only, no smelt shadowing, family
references resolve), the `nextStep` integration (string/bone/clay/sand
acquire steps, chest crafting, tool gating), the honest refusals (flint, the
melon item) and that every expansion output survives `planCraft()` without
throwing. Run the whole suite with `node tools/run-all.mjs`.
