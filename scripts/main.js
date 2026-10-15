import { world, system, Player, EntityComponentTypes, EquipmentSlot, } from "@minecraft/server";
import { Host } from "./runtime/host.js";
import { Bot } from "./runtime/bot.js";
import { Bag } from "./runtime/inventory.js";
import { Memory } from "./runtime/memory.js";
import { tokens, integer, coordinates } from "./core/commands.js";
import { id } from "./core/recipes.js";
import { distance, floor } from "./core/math.js";
const host = new Host();
const memory = new Memory();
let bot;
let pendingSpawn;
const limits = new Map();
/** Spawn requested before the host finished starting; fired by Host.onReady. */
host.onReady = () => {
    const p = pendingSpawn;
    pendingSpawn = undefined;
    if (!p?.isValid)
        return;
    if (bot?.sim.isValid)
        return; // a bot is already live (e.g. taken over while the host booted)
    try {
        spawnBot(p);
    }
    catch (e) {
        p.sendMessage("§c[Verdant] Auto-spawn failed: " + e.message);
        console.warn("[Verdant] Auto-spawn failed: " + e);
    }
};
/**
 * Shared spawn path: used by !bot spawn and by the automatic spawn that runs
 * when a first-time host finishes starting. The bot starts working on its own
 * (starter kit, then auto survival), so spawn is the only command needed.
 */
function spawnBot(p) {
    if (bot?.sim.isValid)
        throw Error("A Verdant player already exists. Stop/recover it before spawning another.");
    // A script reload, world rejoin or crash can orphan a live Verdant entity:
    // the old brain is gone but the simulated player still stands in the world.
    // Take it over instead of dead-ending the owner ("already exists" with no
    // bot to stop). Position and inventory are kept; !bot remove then !bot
    // spawn gives a fresh one.
    const online = world.getAllPlayers();
    const orphan = online.find((q) => q.name === "Verdant" && q.hasTag("verdant.bot"));
    if (!orphan && online.some((q) => q.name === "Verdant" || q.hasTag("verdant.bot")))
        throw Error("A Verdant player is online but is not a controllable bot; kick it from the player list, then spawn again.");
    let adopted = false;
    if (orphan) {
        if (typeof orphan.moveToLocation !== "function" || typeof orphan.stopMoving !== "function")
            throw Error("The existing Verdant player cannot be controlled from here; leave and re-enter the world, then spawn again.");
        try {
            bot = new Bot(orphan, p.name, host, memory);
        }
        catch (e) {
            bot = undefined;
            throw Error("Could not take over the existing Verdant player (" + e.message + "). Kick it or re-enter the world, then spawn again.");
        }
        adopted = true;
        say(p, "Found the Verdant player left by a previous session or script reload and took it over: position and inventory are kept.");
    }
    else {
        const sim = host.spawn(p);
        bot = new Bot(sim, p.name, host, memory);
    }
    bot.save();
    // Ready out of the box: no gear bootstraps the starter kit and then flows
    // into auto survival; an equipped bot starts auto survival directly.
    const gearless = bot.bag.weapon() < 0 && bot.bag.tool("pickaxe", 0) < 0;
    if (!bot.settings.assistedCrafting) {
        bot.settings.assistedCrafting = true;
        say(p, "Assisted crafting enabled so it can craft its own gear (real ingredients only; !bot config crafting off disables).");
    }
    if (gearless) {
        bot.thenAuto = true;
        bot.setMode("starter");
    }
    else
        bot.setMode("survival");
    bot.save();
    say(p, adopted
        ? (gearless
            ? "Continuing on the taken-over bot: no gear detected, bootstrapping wood -> stone tools -> furnace, then auto survival."
            : "Continuing on the taken-over bot with auto survival. !bot status shows the mission; !bot pause holds it.")
        : (gearless
            ? "Spawned. No gear detected: bootstrapping wood -> stone tools -> furnace, then it continues with auto survival on its own."
            : "Spawned. Auto survival started: it gathers, mines, explores, loots and defends itself. !bot status shows the mission; !bot pause holds it."));
    const remembered = memory.summary();
    if (remembered.home)
        say(p, "Base restored from memory: " + JSON.stringify(remembered.home));
    if (remembered.spotsTotal)
        say(p, `Memory: ${remembered.spotsTotal} known spot(s) ${JSON.stringify(remembered.spots)}.`);
    if (remembered.death)
        say(p, "A death point is remembered; it is fetched automatically after the next death, or use !bot recover now.");
}
const HELP = "!bot init confirm | spawn | follow | guard | goto x y z | mine oak_log 4 | deepmine diamond 5 | auto | speedrun | range 256 | starter | craft stick 1 | base [clear] | recover | collect [6..32] | golem | organize | memory | stop | pause | resume | status | mission | inventory | ui [clear|refresh] | swap | deposit | config crafting/parkour/defend/fast/hunting/armor/bridge/boat/loot/deep/camp/pickup/speedrun on/off | host | equipment | unequip | hold | stations | releasefurnace | remove | journal. v1.2.2 survival-master 80 scenarios: A Falls 1-15 ravine/mountain/cave/water/lava/skeleton/creeper/broken pickaxe/ledge/dark/drowned/spider/lose surface/hunger/deep hole, B Night mobs 16-30 LOS/separate/interrupted/creeper+2 skeletons/spider roof/2 creepers/zombie blocks exit/witch/mob enters shelter/zombie+skeleton/creeper destroys/skeleton knockback/spider+zombie/wooden sword/eating/village, C Resource 31-45 no wood/hunger/sunset/no table/insufficient planks/pickaxe breaks/no coal/food runs out/full inventory/iron no furnace/food across river/dirt logs/bed no wool/wool no wood/weapon durability/food no weapon/valuable loot ravine, D Shelter 46-60 hillside cave/flooded/gravel collapse/cliff/two exits skeleton/lose direction/forest night/river trapped/food outside/self-blocked/dark chamber/hostile enters/village occupied/skeleton arrows/cannot find shelter, E Multi 61-80 critical 4HP 3 skeletons/flooding broken pickaxe/creeper ravine skeleton/fall cave zombies/lava iron sunset/full inventory valuable/no shelter rain/lost forest/water tunnel skeleton/ravine 3HP/shelter destroyed/iron broken pickaxe/village pillager/poison skeletons/water drowned/tool breaks gravel/creeper explosion food/shelter secure food outside/hunger long route/respawn death. Knows every block/item, retains important, lava->portal, adaptive any mob, quick tool #1, arbitrary bridging diagonal/horizontal/up, amazing parkour.";
function say(p, msg) {
    p.sendMessage("§a[Verdant] §r" + msg);
}
function requireBot(p) {
    if (!bot?.sim.isValid)
        throw Error("No active bot.");
    if (bot.ownerName !== p.name)
        throw Error("Only the spawning owner controls this bot.");
    return bot;
}
function command(p, text) {
    if (!p.isValid)
        return;
    try {
        if (!p.hasTag("verdant.admin"))
            throw Error("Operator setup required: /tag @s add verdant.admin");
        const [cmd = "help", ...a] = tokens(text);
        // Stop must never be delayed by rate limiting.
        if (cmd !== "stop") {
            if (system.currentTick - (limits.get(p.name) ?? -100) < 4)
                throw Error("Please wait briefly between commands.");
            limits.set(p.name, system.currentTick);
        }
        if (cmd === "help") {
            say(p, HELP);
            return;
        }
        if (cmd === "host") {
            say(p, JSON.stringify(host.status()));
            return;
        }
        if (cmd === "init") {
            if (a[0] !== "confirm") {
                const at = host.preview(p);
                say(p, `Remote host plan: ${JSON.stringify(at)}. This creates/updates GameTest infrastructure and a ticking area far from you, not a player beacon. A first-time site may move upward to clear terrain. Back up the world; reserve a 12x12x8 area there. Use !bot init confirm to authorize placement.`);
                return;
            }
            host.init(p);
            say(p, "Loading remote host area; wait for ready message (up to about 23 seconds).");
            return;
        }
        if (cmd === "spawn") {
            const orphan = world
                .getAllPlayers()
                .find((q) => q.name === "Verdant" && q.hasTag("verdant.bot"));
            if (!orphan &&
                (bot?.sim.isValid ||
                    world
                        .getAllPlayers()
                        .some((q) => q.name === "Verdant" || q.hasTag("verdant.bot"))))
                throw Error("A Verdant player already exists. Stop/recover it before spawning another.");
            if (!host.status().running) {
                // One-command setup: bring the host up (first run only) and
                // spawn automatically as soon as it reports ready.
                pendingSpawn = p;
                if (!host.status().pending) {
                    try {
                        host.preview(p);
                        host.init(p);
                    }
                    catch (e) {
                        pendingSpawn = undefined;
                        throw e;
                    }
                    say(p, orphan
                        ? "Restarting the remote host (about 20 seconds); your existing Verdant player will be taken over as soon as it is ready."
                        : "First spawn: the remote host is being initialized (one time, about 20 seconds). The bot will spawn next to you when it is ready; keep a safe standing spot.");
                }
                else
                    say(p, "The host is already starting; the bot will spawn next to you when it is ready.");
                return;
            }
            spawnBot(p);
            return;
        }
        if (cmd === "journal") {
            const j = world.getDynamicProperty("verdant:journal");
            say(p, typeof j === "string" ? j : "No saved journal.");
            return;
        }
        const b = requireBot(p);
        switch (cmd) {
            case "base":
                if (a[0] === "clear") {
                    memory.clearHome();
                    say(p, "Base cleared from memory.");
                    break;
                }
                memory.setHome(b.sim.location, b.sim.dimension.id);
                say(p, "Base set: " + JSON.stringify(memory.summary().home) + ". Exploration, maintenance and the forager lead home from here, across sessions.");
                break;
            case "recover":
                b.startRecover();
                say(p, "Recovering drops at the recorded death point. Threats interrupt; a full inventory stops cleanly.");
                break;
            case "collect":
                b.setMode("collect", {
                    anchor: floor(b.sim.location),
                    radius: integer(a[0], 6, 32, 12),
                });
                say(p, `Sweeping loose drops within ${b.goal.radius} blocks of the bot's current spot. Throw items down anywhere in that area; hazards and unreachable stacks are skipped.`);
                break;
            case "golem":
                b.startGolem();
                say(p, "Iron golem engagement started: one hit, then out of reach until it stops swinging; it breaks off when hurt and sweeps the iron drop afterwards.");
                break;
            case "organize": {
                b.stop("Owner organizing inventory");
                say(p, `Merged ${b.bag.organize()} partial stacks in the bot's inventory.`);
                break;
            }
            case "memory":
                say(p, JSON.stringify(memory.summary()));
                break;
            case "hold":
                if (b.paused || b.mode === "idle")
                    b.setMode("guard");
                b.blockTask("Holding task by owner request.", "manual");
                break;
            case "equipment":
                say(p, JSON.stringify(b.equipment.report()));
                break;
            case "unequip":
                b.stop("Owner requested unequip");
                say(p, "Moved " +
                    b.equipment.unequipAll() +
                    " equipped stacks into inventory. Deposit before removal.");
                break;
            case "stop":
                b.stop();
                say(p, "Stopped; pending task discarded.");
                break;
            case "pause":
                b.pause("Paused by owner; task retained.");
                break;
            case "resume":
                b.resume();
                break;
            case "follow":
                b.setMode("follow");
                break;
            case "guard":
                b.setMode("guard");
                break;
            case "goto":
                b.setMode("goto", coordinates(a));
                break;
            case "mine":
                b.startMine(id(a[0] ?? "oak_log"), integer(a[1], 1, 64, 4));
                break;
            case "range":
                b.settings.range = integer(a[0], 32, 4096);
                say(p, "Exploration home radius: " + b.settings.range);
                break;
            case "auto":
                if (!b.settings.assistedCrafting)
                    throw Error("Run !bot config crafting on first, then !bot auto. Autonomous crafting consumes real ingredients.");
                b.setMode("survival");
                say(p, "Survival supervisor started: defence, food, tools and armour progression. Hunting targets unnamed livestock; config hunting off disables it. !bot stop cancels.");
                break;
            case "speedrun":
                if (!b.settings.assistedCrafting)
                    throw Error("Run !bot config crafting on first, then !bot speedrun. End-to-end speedrun: wood->stone->iron->diamond->portal.");
                b.setMode("speedrun");
                say(p, "Speedrun mode started: full progression with deep mining, looting, combat, bridging, parkour. !bot status shows phase.");
                break;
            case "deepmine":
                if (!b.settings.assistedCrafting)
                    throw Error("Run !bot config crafting on first, then !bot deepmine. Deep mining with branch mining and vein clustering.");
                b.startMine(id(a[0] ?? "diamond_ore"), integer(a[1], 1, 64, 5));
                say(p, `Deep mining ${a[0] ?? "diamond_ore"} x${a[1] ?? 5} with branch pattern and vein detection.`);
                break;
            case "starter":
                if (!b.settings.assistedCrafting)
                    throw Error("Enable !bot config crafting on first. This is assisted add-on crafting, not vanilla UI.");
                b.setMode("starter");
                break;
            case "craft":
                b.stop("Manual crafting");
                b.craft(id(a[0] ?? ""), integer(a[1], 1, 64, 1));
                say(p, "Crafted using inventory recipe adapter.");
                break;
            case "status": {
                const s = b.status();
                say(p, `${s.paused ? "PAUSED" : s.state} / ${s.mode} • HP ${s.health}${s.threat ? " • threat " + s.threat.replace("minecraft:", "") : ""}${s.escape ? " • escaping (" + s.escape + ")" : ""}\nMission: ${s.mission}\n${s.reason}\n${JSON.stringify(s.position)}\n${JSON.stringify(s.settings)}\nRoute segments: ${s.navigation.segments}; explored areas: ${s.exploration.areas}\nAutonomy: ${s.autonomy.phase || "inactive"}\nTask: ${s.blocked ? s.blocked.recovery + " / " + s.blocked.reason : "running"}`);
                break;
            }
            case "mission":
                say(p, `${b.paused ? "paused" : b.state} • ${b.mission()}`);
                break;
            case "stations":
                say(p, JSON.stringify(b.autonomy.furnace.status()));
                break;
            case "releasefurnace":
                b.stop("Owner releasing empty furnace");
                b.autonomy.furnace.releaseEmpty();
                say(p, "Empty furnace released; block left in world.");
                break;
            case "inventory":
                say(p, JSON.stringify(b.bag.counts()));
                break;
            case "swap": {
                if (distance(p.location, b.sim.location) > 4 ||
                    p.dimension.id !== b.sim.dimension.id)
                    throw Error("Stand within 4 blocks of the bot.");
                b.stop("Inventory exchange");
                const other = new Bag(p);
                b.bag.container.swapItems(b.sim.selectedSlotIndex, p.selectedSlotIndex, other.container);
                say(p, "Swapped selected stacks; no items created.");
                break;
            }
            case "deposit": {
                if (p.dimension.id !== b.sim.dimension.id ||
                    distance(p.location, b.sim.location) > 5)
                    throw Error("Stand near the bot.");
                const isStore = (x) => x &&
                    [
                        "minecraft:chest",
                        "minecraft:trapped_chest",
                        "minecraft:barrel",
                    ].includes(x.typeId);
                // Prefer the chest being looked at; fall back to a chest the
                // bot has seen before and is standing next to right now.
                let block = p.getBlockFromViewDirection({ maxDistance: 4 })?.block;
                if (!isStore(block) || distance(block.location, b.sim.location) > 4) {
                    const remembered = memory.nearest("chest", b.sim.dimension.id, b.sim.location);
                    const beside = remembered ? b.terrain.block(remembered) : undefined;
                    if (isStore(beside) && distance(beside.location, b.sim.location) <= 4)
                        block = beside;
                }
                if (!isStore(block) || distance(block.location, b.sim.location) > 4)
                    throw Error("Look at a chest/barrel within 4 blocks of both you and bot (or stand beside a remembered chest).");
                const inv = block.getComponent("minecraft:inventory")?.container;
                if (!inv)
                    throw Error("Container not accessible.");
                b.stop("Deposit");
                const r = b.bag.deposit(inv);
                memory.notice("chest", block.location, b.sim.dimension.id, system.currentTick);
                say(p, `Stored ${r.moved} stacks, topping up ${r.merged} matching stacks. Nothing was dropped.`);
                break;
            }
            case "config": {
                if (!["on", "off"].includes(a[1]))
                    throw Error("Use on or off.");
                const value = a[1] === "on";
                if (a[0] === "crafting")
                    b.settings.assistedCrafting = value;
                else if (a[0] === "parkour")
                    b.settings.parkour = value;
                else if (a[0] === "armor")
                    b.settings.armor = value;
                else if (a[0] === "hunting")
                    b.settings.hunting = value;
                else if (a[0] === "fast")
                    b.settings.fast = value;
                else if (a[0] === "defend")
                    b.settings.defend = value;
                else if (a[0] === "bridge")
                    b.settings.bridge = value;
                else if (a[0] === "boat")
                    b.settings.boat = value;
                else if (a[0] === "loot")
                    b.settings.loot = value;
                else if (a[0] === "deep")
                    b.settings.deepMining = value;
                else if (a[0] === "camp")
                    b.settings.camp = value;
                else if (a[0] === "pickup")
                    b.settings.pickup = value;
                else if (a[0] === "speedrun")
                    b.settings.speedrun = value;
                else
                    throw Error("Settings: crafting, parkour, defend, fast, hunting, armor, bridge, boat, loot, deep, camp, pickup, speedrun.");
                b.stop("Configuration changed; choose or resume a task.");
                say(p, JSON.stringify(b.settings));
                break;
            }
            case "remove": {
                if (b.autonomy.furnace.hasItems())
                    throw Error("Tracked furnace may contain items or an active job. !bot stations; reclaim input/fuel/output manually, then !bot releasefurnace before removal.");
                if (b.bag.container.emptySlotsCount !== b.bag.size)
                    throw Error("Deposit ALL inventory first; remove refuses to destroy items.");
                const eq = b.sim.getComponent(EntityComponentTypes.Equippable);
                if ([
                    EquipmentSlot.Head,
                    EquipmentSlot.Chest,
                    EquipmentSlot.Legs,
                    EquipmentSlot.Feet,
                    EquipmentSlot.Offhand,
                ].some((s) => eq?.getEquipment(s)))
                    throw Error("Remove equipment before disconnecting.");
                b.stop("Removed with empty inventory");
                b.sim.disconnect();
                bot = undefined;
                say(p, "Disconnected. The GameTest host remains until world exit.");
                break;
            }
            default:
                throw Error("Unknown command. " + HELP);
        }
    }
    catch (e) {
        say(p, "§c" + String(e));
    }
}
world.beforeEvents.chatSend.subscribe((e) => {
    if (e.message === "!bot" || e.message.startsWith("!bot ")) {
        e.cancel = true;
        const p = e.sender, text = e.message.slice(4);
        system.run(() => command(p, text));
    }
});
system.afterEvents.scriptEventReceive.subscribe((e) => {
    if (e.id !== "verdant:cmd")
        return;
    const p = e.sourceEntity;
    // Reject command-block/server spoofing: only direct player-origin events.
    if (p instanceof Player)
        command(p, e.message);
});
world.afterEvents.entityHurt.subscribe((e) => {
    if (bot?.sim.isValid)
        bot.onHurt(e);
});
world.afterEvents.entityDie.subscribe((e) => {
    if (bot && e.deadEntity.id === bot.sim.id && bot.state !== "dead") {
        // Snapshot the site first: the brain is frozen until it respawns.
        bot.recordDeath();
        memory.flush();
        bot.state = "dead";
        bot.deadSince = system.currentTick;
        bot.respawnTried = false;
        bot.paused = false;
        bot.tell("Bot died. Death point recorded; attempting an automatic respawn.");
        console.warn("[Verdant] Bot died; auto-respawn pipeline started, death point remembered.");
    }
});
world.afterEvents.playerLeave.subscribe((e) => {
    limits.delete(e.playerName);
    if (bot?.ownerName === e.playerName && bot.sim.isValid)
        bot.pause("Owner disconnected.");
});
system.runInterval(() => bot?.tick(), 1);
world.afterEvents.worldLoad.subscribe(() => {
    console.warn("[Verdant 1.1.0] Survival-Master 80 scenarios world-class: A Falls 1-15, B Night mobs 16-30, C Resource 31-45, D Shelter 46-60, E Multi 61-80 critical. Handles ravine flee zombie low HP unknown depth, mountain ledge sunset fall damage darkness, cave tree no torches, water underwater cave oxygen, lava pool immediate hazard, skeleton above cover climb, creeper hole explosion, broken pickaxe, narrow ledge lava balance, deep cave hostile, drowned chase, spider tree, lose surface orientation, empty hunger, too deep pillar, 3 skeletons zombie sunset LOS, 4 zombies building shelter defensive, creeper 2 skeletons block home explosion cover alternate, spider roof skeleton outside multiple angles, 2 creepers narrow entrance simultaneous, zombie blocks exit skeleton above, witch low health potion retreat, mob enters small shelter doorway control, zombie then skeleton joins reassess, creeper destroys entrance terrain changed, skeleton knocks cliff knockback recovery, spider zombie pursue cave chokepoint, hostile group wooden sword disadvantage, attacked while eating cancel/complete, village night zombies secure, resource shortages, shelter failures, multi-risk critical. Knows every block/item, retains important, lava->portal, adaptive any mob, quick tool #1 never bare-hand, arbitrary bridging diagonal/horizontal/up, amazing parkour, death recovery, upskilling main goal.");
    world.sendMessage("§a[Verdant] v1.1.0 survival-master 80 scenarios - !bot spawn to begin. Handles all falls, night mobs, resource shortages, shelter failures, multi-risk critical. Knows every block/item, retains important, lava->portal, quick tool #1.");
});
