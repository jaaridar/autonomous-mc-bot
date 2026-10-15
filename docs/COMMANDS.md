# Verdant Bot — command reference (0.7)

All commands are chat messages starting with `!bot`. The sender needs
`/tag @s add verdant.admin` (one-time). The bot is owned by whoever spawned it;
only the owner can command it. Commands are rate-limited to one per 4 ticks
(`stop` is exempt). `!bot help` prints this list in-game.

## Setup and lifecycle

| Command | What it does |
|---|---|
| `!bot init` | Optional. Previews the remote GameTest host site (about 4096 blocks away, kept loaded by a ticking area). Nothing is placed yet. |
| `!bot init confirm` | Optional. Creates/updates the host early. `!bot spawn` does this automatically on first use. |
| `!bot spawn` | One-command setup: brings the host up if needed, then spawns the "Verdant" simulated player two blocks from you and starts working by itself (starter kit when unequipped, then auto survival). If a previous session/script reload left the Verdant player online without its brain, spawn takes that one over instead (position and inventory kept; use `!bot remove` first for a fresh body). Restores remembered settings/base/spots. |
| `!bot host` | Shows host status (running/pending/position/stored anchor). |
| `!bot remove` | Disconnects the bot. Refuses while it holds items, equipment, or a tracked furnace has contents. Deposits first. |
| `!bot journal` | Prints the last saved status/journal document. |
| `!bot memory` | Prints the persistent memory summary (home, death point, known spots, stored settings). |

## Movement

| Command | What it does |
|---|---|
| `!bot follow` | Follows the owner (leash 3). |
| `!bot guard` | Holds position at the anchor where the mode was started (leash 2). Camps at night. |
| `!bot goto x y z` | Paths to the coordinates, stops on arrival. |
| `!bot range 32..4096` | Sets the exploration home radius (default 256). |
| `!bot base [clear]` | Sets the remembered base to the bot's current spot (persists across sessions; used by exploration, maintenance and foraging). `clear` forgets it. |

## Work

| Command | What it does |
|---|---|
| `!bot mine <block> [1..64]` | Mines a supported block type (e.g. `oak_log`, `iron_ore`). Search escalates tight (10 blocks) → wide (24) → exploring, and keeps watching for the resource while moving; block quotas only complete once the drops are collected (loose items are chased after each break, strays swept). Underground ores start a guarded staircase to the right Y level, run a corridor, and climb the same route back. |
| `!bot craft <item> [1..64]` | Manual craft through the recipe adapter. Requires `config crafting on`. |
| `!bot starter` | Milestone run: stone pickaxe → stone sword → furnace. Spawn runs this automatically for an unequipped bot, then continues into auto survival. |
| `!bot auto` | Survival supervisor: food, defence, tools, furnace station, iron gear, armour, torches, opportunistic diamonds. Requires `config crafting on`. |
| `!bot recover` | Walks to the recorded death point (up to 256 blocks away) and sweeps drops within 12 blocks. Threats interrupt; a full inventory stops it cleanly; despawned drops are reported honestly and the point is cleared. |
| `!bot collect [6..32]` | Sweeps loose `minecraft:item` drops in a radius (default 12) around the bot's current spot: walks over each stack (the engine does the pickup), skips hazards and unreachable stacks, and reports the real inventory delta. Use it after throwing items on the ground, or when the bot is idle it picks up nearby drops on its own. |
| `!bot hold` | Freezes the current task in place (still defends itself). |
| `!bot stop` | Stops everything; the pending task is discarded. If a camp shelter was sealed, resuming opens it first. |
| `!bot pause` / `!bot resume` | Pause keeps the task; resume continues. |
| `!bot status` | Full status: state, mode, **current mission**, HP, threat, position, settings, navigation stats, autonomy phase, task block reason. |
| `!bot mission` | One line: exactly what the bot is doing right now (also attached to problem messages). |
| `!bot stations` | Tracked furnace status (position, pending placement, active job). |
| `!bot releasefurnace` | Releases an empty tracked furnace (the block stays in the world). |

## Inventory

| Command | What it does |
|---|---|
| `!bot inventory` | Item counts in the bot's inventory. |
| `!bot swap` | Swaps your selected stack with the bot's (stand within 4 blocks). No items are created. |
| `!bot deposit` | Stores the bot's inventory into the chest/barrel you are looking at — **topping up matching stacks first**, then empty slots. Also works standing beside a remembered chest. Rollback-safe. |
| `!bot organize` | Merges partial stacks in the bot's inventory (stops the current task first, for safety). |
| `!bot equipment` / `!bot unequip` | Shows equipped gear / moves all equipment back to inventory. |

## Configuration

`!bot config <key> on|off` — settings persist across world reloads.

| Key | Default | Meaning |
|---|---|---|
| `crafting` | off | Allow the bot to craft (assisted add-on recipes, real ingredients: tools, furnace, torches, boats, and beds once 3 wool of one colour are held). Gates `auto`, `starter`, `craft`. |
| `defend` | on | Fight/retreat from hostiles. |
| `camp` | on | Night camping (bed or dug-in shelter) while idle/guarding. |
| `pickup` | on | While idle, walk over and pick up loose dropped items within 6 blocks (never chases hazards). |
| `fast` | on | Sprint when safe. |
| `parkour` | on | One-block gap jumps for escapes and travel. |
| `hunting` | on | Forager may hunt animals for food; while roaming, the bot also chops nearby trees for logs and hunts sheep for wool/mutton. |
| `armor` | on | Auto-equip better armour. |
| `bridge` | on | Escape may place blocks to bridge gaps and pillar out. |
| `boat` | on | Escape may craft/place/board a boat in open water. |
| `loot` | on | Loot chests/barrels near the route; auto survival scouts for villages. |
| `deep` | on | Underground ore mining with the staircase miner. |

## Safety recap

- No item fabrication, duplication or teleporting: everything is observed and
  moved with rollback-protected transfers.
- Digging refuses cells with water or lava next to them, and respects pickaxe
  tiers (wooden=1, stone=2, iron=3, diamond=4, netherite=5).
- The bot never seals a shelter with a block it cannot dig out again.
- Owner offline, dimension mismatch, or three repeated script errors pause the
  bot instead of continuing to mutate the world.
- Deposits and crafts are all-or-nothing; failures say `CRITICAL` and stop for
  manual inspection rather than guessing.
