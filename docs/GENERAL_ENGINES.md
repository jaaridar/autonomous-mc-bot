# Verdant Bot — general engines (v1.3.1)

The bot used to answer "what do I do about this mob / this item / this danger?"
with tables and if-chains: 40 mob branches in combat, ~60 handwritten recipes,
80 named survival scenarios. That works until the case is new — a mob the table
has not seen, an item nobody added, two dangers at once.

v1.3.1 replaces the tables with four small engines that take inputs and compute
an answer. Nothing here invents game content: they choose *which* real action to
take, using what the world actually reports.

```
core/mobs.js ─────────┐
core/combat-plan.js ──┤ combat: which fight, in what order, when to leave
core/recipe-book.js ──┤ items: what it is made of, and how to obtain every leaf
core/needs.js ────────┘ survival: which need is most urgent and what fixes it
```

All four are pure (no `@minecraft/*`), which is why they can be tested exhaustively
offline. `tools/general.test.mjs` covers 126 cases.

---

## 1. Mobs: `core/mobs.js`

An entity is described by an **archetype** — how it fights — not by its name:

| archetype | shape | examples |
|---|---|---|
| `melee` | 3 dmg, 1.5 reach, walks at you | zombie, husk, piglin |
| `brute` | heavy hitter | vindicator, wither skeleton |
| `archer` / `crossbow` | projectile, 16-18 reach | skeleton, stray, pillager |
| `bomber` | suicide burst | creeper |
| `leaper` / `poisoner` | fast, closes distance | spider, cave spider |
| `teleporter` | neutral until hit, water-weak | enderman |
| `fire_ranged` / `flying_bomber` | fire / aerial artillery | blaze, ghast |
| `potion` / `summoner` | support that must die first | witch, evoker |
| `turret` / `aquatic` | static or water-bound | shulker, guardian |
| `splitter` / `swarm` | many small bodies | slime, silverfish |
| `heavy` / `boss` | knockback tanks / not a fair fight | ravager, warden, wither |

`describe(typeId)` returns the merged stats, traits (`ranged`, `explosive`,
`flying`, `fire`, `teleport`, `sweep`…), hostility and **drops**. Unknown ids are
inferred, in this order:

1. exact table entry,
2. ordered name patterns (`*_skeleton` → archer, `*_creeper` → bomber, any
   `*dragon*` → boss),
3. the engine's own `type_family` component (`monster` → hostile melee).
4. otherwise passive.

So `mymod:ice_zombie` is a hostile melee mob, `mymod:laser_skeleton` shoots, and
a brand-new hostile with an unrecognisable name is still treated as a monster
because Minecraft itself says it is one.

Hostility is decided the same way in `runtime/world.js::threatInfo`, so modded
hostiles are not invisible to the bot.

## 2. Combat: `core/combat-plan.js`

A fight is arithmetic, so the planner computes it:

* per threat — arrival time (distance ÷ speed), damage per second, whether it can
  hit right now, time to kill it with the weapon actually held;
* for the group — `incomingDps` (with a queueing factor when several melee mobs
  crowd the same target), worst `burst` in range, `ttk`, `ttd`, `confidence`.

Then it returns an **action** and a **stance**:

| action | when | execution |
|---|---|---|
| `engage` | `ttd` comfortably exceeds `ttk` | close, strafe, hit the highest-value target |
| `kite` | contact ×3 without a shield | backpedal while swinging |
| `shield_advance` | ranged pressure and a shield | raise shield, walk the archers down |
| `cover` | ranged pressure, blocks, no shield | build/bake into cover, then peek |
| `tower` | surrounded or flying attackers, blocks | pillar up |
| `retreat` / `flee` | losing the damage race, blast in range, boss | leave along the escape vector |

Kill order is `damage-per-second ÷ time-to-kill`, i.e. kill what hurts most per
second of effort, with proximity as a tie-break. "Multiple mobs at once" needs
no special case: 5 skeletons, 10 zombies, a creeper behind a zombie wall, or 20
mobs in a cave all fall out of the same numbers.

`escapeVector` sums away-from-threat vectors weighted by danger and distance and
prefers a direction the caller says is open — so the bot runs *out* rather than
into a wall. `surrounded` counts bearing sectors and triggers a breakout.

`runtime/combat.js` now executes stances. The only per-mob knowledge left is
*execution detail* (endermen get a low roof, fire mobs get water), and that is
read from traits, not names.

## 3. Recipes: `core/recipe-book.js`

**263 recipes are generated**, not listed:

* `TOOL_SHAPES × TOOL_MATERIALS` → every pickaxe/axe/shovel/sword/hoe in wood,
  stone, iron, gold, diamond and netherite;
* `ARMOR_PIECES × ARMOR_MATERIALS` → every helmet/chestplate/leggings/boots;
* `WOODS` → planks, slabs, stairs, fences, gates, doors, trapdoors, signs,
  pressure plates, buttons (all 12 wood families, including bamboo/crimson/warped);
* `WOOLS` → all 16 beds, carpets and banners;
* blocks and utility: table, chest, furnace, blast furnace, smoker, torch,
  ladder, scaffold, bucket, shears, flint & steel, shield, bow, crossbow, arrows,
  fishing rod, boat, minecart, rail, anvil, blocks of iron/gold/diamond/coal,
  netherite ingot, brewing stand, cauldron, food.

`SMELT` covers ore → ingot, raw → ingot, sand → glass, cobble → stone, clay →
brick, log → charcoal, ancient debris → scrap and all cooked food.

**The acquisition graph** is the part that scales. `plan(item, amount, stock, ctx)`
walks recipes against a *virtual inventory* so a material needed twice is only
gathered once, and returns real steps:

```
bucket (no materials) ->
  gather 1 oak_log -> craft planks -> craft crafting_table -> place table
  -> gather 3 raw_iron -> gather 8 cobblestone -> craft furnace -> place furnace
  -> smelt 3 iron_ingot -> craft bucket
```

Leaves that are not craftable resolve to `gather` (mine/farm), `kill` (mob drop
from `core/mobs.js`) or `loot`, and if nothing applies the plan says
`blocked` with the reason instead of inventing an item. Tags (`#planks`, `#logs`,
`#wool`, `#stone`, `#carbon`) pick whichever member is already held or easiest.

The runtime uses it: `core/recipes.js` merges the generated book into `RECIPES`,
`nextStep()` consults it (so an item the old table forgot is no longer
"unsupported"), and `obtain()` executes a new `smelt` step through the survival
director. `!bot recipe <item>` prints the plan in chat.

## 4. Autonomous Nether expedition: `core/expedition.js` + `runtime/expedition.js`

`!bot auto` already starts survival mode; v1.3.1 adds an expedition director to
that loop, so the bot does not need a manual `!bot nether` command. Every 40
ticks it assesses whether the trip is safe and useful. `core/expedition.js` is
the pure readiness model: it checks health, food, pickaxe tier, ignition, an
obsidian/known-portal/bucket path, hostiles, water/lava/fire/fall, dimension,
trip state, cooldown, and the operator's `autoNether` setting. It returns an
ordered blocker list and a preparation plan. `runtime/expedition.js` only
initiates a trip when that model is ready and the combat planner does not advise
retreat. It delegates portal discovery/build/light/transit/return to the
existing `PortalTraveler` rather than duplicating those mechanisms.

The default readiness threshold is intentionally conservative: health ≥14,
food ≥6 items, a stone-tier-or-better pickaxe, and a real ignition route. A
bucket + water qualifies as a way to make obsidian; otherwise the bot needs 10
obsidian or a known portal. During preparation, survival and its existing
resource/crafting directors remain in charge; the expedition director never
fabricates materials or mines through an unsafe hazard. It does not abandon an
active mining task or walk away from nearby hostiles. Trips are separated by a
cooldown to avoid repeated portal churn. `!bot status` includes readiness,
blockers, provisions, trips and failures; `!bot config nether off` suppresses
autonomous starts (manual `!bot nether` remains available).

The design goal is to remove the human launch step, not to claim guaranteed
success: the Minecraft engine may reject a block interaction, portal transit
may require the travel fallback, and a world can contain an unresolvable
terrain/portal situation. In those cases the existing anti-stuck and travel
retry logic reports the failure; no offline test can prove live-world success.

## 5. Survival: `core/needs.js`

Instead of 80 named scenarios, the engine ranks **needs by severity**:

| need | severity is computed from | satisfier |
|---|---|---|
| breathe | head in water, remaining air | surface |
| lava | standing in / next to lava | climb out, run, cool with water |
| burning | on fire | douse / run |
| falling | fall distance | water clutch / place a block |
| suffocation | head inside a solid block | dig out |
| combat | the combat planner's confidence | disengage |
| heal | missing health, scaled by threats | eat, rest, shelter |
| starving | hunger, worse at low health | eat, hunt, fish |
| exposure | night × exposed × hostiles | shelter / go home |
| darkness | light level while underground | place a torch |
| tooling / unarmed | durability, weapon presence | rearm |
| inventory | free slots | organise |
| lost | anti-stuck level | unstick (its own ladder) |

Three rules make it safe:

* **Capability filtering** — a need whose satisfier cannot be executed is not
  proposed. No food and nothing to hunt means no "eat" plan, rather than a loop.
* **Hysteresis + cooldowns** — it reuses the tested `brain/arbiter.js`, so the bot
  commits to one response instead of flapping between "eat" and "fight".
* **Emergency pre-emption** — drowning, lava and suffocation bypass the hold
  timer.

`runtime/survival-master.js` runs the engine **before** the legacy 80-scenario
chain and only falls through when the engine has nothing to say. That keeps the
old coverage as a backstop while the general path becomes the primary one; the
scenario handlers can be deleted one at a time as the general engine proves it
covers them.

## Adding a case (the point of all this)

| New thing | What to add | Lines |
|---|---|---|
| a mob | an archetype entry, or nothing (name inference) | 0-1 |
| a wood colour / metal tier | one entry in `WOODS` / `TOOL_MATERIALS` | 1 |
| an item | an item in a family, or nothing (it becomes a `gather` leaf) | 0-1 |
| a danger | one `NEEDS` entry: `severity(ctx)` + `satisfy(ctx)` | ~8 |
| a tactic | one action in `planEngagement` + one `case` in the executor | ~10 |

That is the "architecture that handles almost everything": the cases are data,
and anything left over degrades honestly instead of silently failing.
