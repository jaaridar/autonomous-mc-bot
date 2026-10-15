# Verdant Bot — command reference v0.9.0 Advanced

All commands are chat messages starting with `!bot`. The sender needs `/tag @s add verdant.admin` (one-time). The bot is owned by whoever spawned it; only the owner can command it. Commands are rate-limited to one per 4 ticks (`stop` is exempt). `!bot help` prints this list in-game.

## Setup and lifecycle

| Command | What it does |
|---|---|
| `!bot init` | Optional. Previews the remote GameTest host site (about 4096 blocks away, kept loaded by a ticking area). Nothing is placed yet. |
| `!bot init confirm` | Optional. Creates/updates the host early. `!bot spawn` does this automatically on first use. |
| `!bot spawn` | One-command setup: brings host up if needed, then spawns \"Verdant\" simulated player two blocks from you and starts working by itself (starter kit when unequipped, then auto survival). If a previous session/script reload left the Verdant player online without its brain, spawn takes that one over instead (position and inventory kept; use `!bot remove` first for a fresh body). Restores remembered settings/base/spots. |
| `!bot host` | Shows host status (running/pending/position/stored anchor). |
| `!bot remove` | Disconnects the bot. Refuses while it holds items, equipment, or a tracked furnace has contents. Deposits first. |
| `!bot journal` | Prints the last saved status/journal document (includes advanced stats). |
| `!bot memory` | Prints the persistent memory summary (home, death point, known spots, stored settings). |

## Movement & Parkour

| Command | What it does |
|---|---|
| `!bot follow` | Follows the owner (leash 3). Uses advanced parkour: 1-gap, 2-gap sprint jumps, jump-up, big drops, bridging, pillaring. |
| `!bot guard` | Holds position at anchor where mode started (leash 2). Camps at night. |
| `!bot goto x y z` | Paths to coordinates with advanced navigation, stops on arrival. Handles water via boat, gaps via bridge. |
| `!bot range 32..4096` | Sets exploration home radius (default 256). |
| `!bot base [clear]` | Sets remembered base to bot's current spot (persists across sessions). `clear` forgets it. |

## Work — Mining & Speedrun

| Command | What it does |
|---|---|
| `!bot mine <block> [1..64]` | Mines supported block (oak_log, wheat, iron_ore, diamond_ore, etc). Enhanced: tight 12 -> wide 28 -> explore, watches resource while moving, clears obstructions below (fixes \"can't get below\"), scaffolds to high logs, bridges gaps, collects drops honestly. For ores, uses branch mining + vein clustering. |
| `!bot deepmine <ore> [1..64]` | Explicit deep mining: shaft to best Y (diamond -59, iron 16, etc), branch pattern with optimal spacing, vein clustering via flood-fill, torching, then ascend same route. |
| `!bot craft <item> [1..64]` | Manual craft through recipe adapter. Requires `config crafting on`. |
| `!bot starter` | Milestone run: stone pickaxe -> stone sword -> furnace. Spawn runs this automatically for unequipped bot, then auto survival. |
| `!bot auto` | Survival supervisor: food, defence, tools, furnace, iron gear, armour, torches, opportunistic diamonds, village looting, sheep hunting. Requires `config crafting on`. |
| `!bot speedrun` | **NEW** End-to-end speedrun director: wood (8 logs) -> table -> wooden pick -> cobble 20 -> stone tools -> furnace -> torch -> iron (branch mine 12) -> bucket -> diamond (branch mine 5) -> obsidian 10 -> portal. Uses deepMiner, builder, combat, looting, parkour. |
| `!bot recover` | Walks to recorded death point (up to 256 blocks) and sweeps drops within 12 blocks. Threats interrupt; full inventory stops cleanly. |
| `!bot collect [6..32]` | Sweeps loose `minecraft:item` drops in radius (default 12) around bot's current spot, reports real inventory delta. Idle bot also auto-picks up within 8 blocks. |
| `!bot golem` | Iron golem engagement: hit then step out of reach until swing stops, breaks off when hurt, sweeps iron drop. |
| `!bot hold` | Freezes current task in place (still defends itself). |
| `!bot stop` | Stops everything; pending task discarded. If camp sealed, resuming opens it first. |
| `!bot pause` / `!bot resume` | Pause keeps task; resume continues. |
| `!bot status` | Full status: state, mode, **mission**, HP, threat, position, settings, navigation stats (segments, expansions, blockReads), autonomy phase, speedrun phase, deepMining phase, looting trips, builder status, task block reason. |
| `!bot mission` | One line: exactly what bot is doing now (also attached to problem messages). |
| `!bot stations` | Tracked furnace status (position, pending placement, active job). |
| `!bot releasefurnace` | Releases empty tracked furnace (block stays in world). |

## Inventory & Looting

| Command | What it does |
|---|---|
| `!bot inventory` | Item counts in bot's inventory. |
| `!bot swap` | Swaps your selected stack with bot's (stand within 4 blocks). No items created. |
| `!bot deposit` | Stores bot's inventory into chest/barrel you look at — topping up matching stacks first, then empty slots. Also works beside remembered chest. Rollback-safe. |
| `!bot organize` | Merges partial stacks in bot's inventory (stops current task first). Auto-organize also runs every 200 ticks when >6 partials. |
| `!bot equipment` / `!bot unequip` | Shows equipped gear / moves all equipment back to inventory. |

## Configuration

`!bot config <key> on|off` — settings persist across world reloads.

| Key | Default | Meaning |
|---|---|---|
| `crafting` | off | Allow bot to craft (assisted add-on recipes, real ingredients: tools, furnace, torches, boats, beds once 3 wool of one colour held). Gates `auto`, `starter`, `craft`, `speedrun`, `deepmine`. |
| `defend` | on | Fight/retreat from hostiles using advanced combat tactics (kite/rush/retreat, group handling, crits, strafing). |
| `camp` | on | Night camping (bed or dug-in shelter) while idle/guarding/survival/mine/speedrun. |
| `pickup` | on | While idle, walk over and pick up loose drops within 8 blocks (never hazards). Also opportunistic high-value gathering. |
| `fast` | on | Sprint when safe, always when urgent (fleeing/combat). |
| `parkour` | on | Advanced parkour: 1-block gap, 2-block sprint gap, jump-up, big drops (3 blocks), bridging awareness. |
| `hunting` | on | Forager may hunt animals for food; while roaming, bot chops nearby trees for logs and hunts sheep for wool/mutton. |
| `armor` | on | Auto-equip better armour. |
| `bridge` | on | Allow builder to bridge gaps and pillar out (Navigator + Escaper + Builder). |
| `boat` | on | Allow boat crafting/placing/boarding for water crossings. |
| `loot` | on | Loot chests/barrels with scoring (valuable first, home avoidance), auto survival scouts villages. |
| `deep` | on | Deep mining with DeepMiner (branch + vein clustering) + legacy Miner. |
| `speedrun` | off | Enable speedrun optimizations (auto phase switching). |

## Advanced features v0.9

- **Deep mining**: branchPattern (main corridor + side branches every optimalSpacing), vein clustering via flood-fill BFS, bestYFor Bedrock distributions, obstruction clearing (finds blocks blocking below and clears them instead of blacklisting), scaffold to high logs.
- **Builder**: `placeAt(target, anchor, {sneak, allowHazard, blockType})` with support search, `bridge(dir)` finds neighbor support, `pillar()` jump-place, `scaffoldTo()` for high targets.
- **Combat**: tactics per mob (creeper retreat, skeleton rush, zombie kite, golem pillar, warden flee), threat scoring, group positioning maximizing distance, crit jump window, strafe.
- **Looting**: scored via LOOT_VALUE, valuable >=200, junk filtered, home <48 avoided, withdraw rollback-safe.
- **Parkour**: canJumpGap checks headroom and hazard below, canStepUp, sprintJump for 2-gap, climbIfNeeded for ladder/vine.
- **Resource**: auto organize, opportunistic gathering within 8 blocks, deposit low-value when full.
- **Speedrun**: full progression with DeepMiner integration.
- **Fixes**: mining below now clears obstruction, tree mining scaffolds, mine mode explores instead of idling (fixes \"after mining oat or wood just watch\"), bridging places real blocks with support checks (fixes \"bridging sucks\"), crops added to MINE.

## Safety recap

- No item fabrication, duplication or teleporting: everything observed and moved with rollback-protected transfers.
- Digging refuses cells with water/lava next to them (unless explicitly allowed for bridging), and respects pickaxe tiers.
- Bot never seals shelter with block it cannot dig out again.
- Owner offline, dimension mismatch, or three repeated script errors pause bot instead of continuing.
- Deposits, crafts, withdraws are all-or-nothing; failures say `CRITICAL` and stop for manual inspection.
