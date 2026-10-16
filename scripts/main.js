import { distance, floor, validPosition } from "./core/math.js";
import { id } from "./core/recipes.js";
import { Bot } from "./runtime/bot.js";
import { Host } from "./runtime/host.js";
import { Bag } from "./runtime/inventory.js";
import { Memory } from "./runtime/memory.js";
import { EntityComponentTypes, EquipmentSlot, Player, system, world } from "@minecraft/server";
/** Chat command parsing helpers (were core/commands.js). */
function tokens(text) {
    if (text.length > 256)
        throw Error("Command too long.");
    return text.trim().split(/\s+/).filter(Boolean);
}
function integer(s, min, max, defaultValue) {
    if (s === undefined && defaultValue !== undefined)
        return defaultValue;
    const n = Number(s);
    if (s === undefined || !Number.isInteger(n) || n < min || n > max)
        throw Error(`Expected integer ${min}..${max}.`);
    return n;
}
function coordinates(a) {
    if (a.length !== 3)
        throw Error("Use three absolute coordinates: x y z.");
    const p = { x: Number(a[0]), y: Number(a[1]), z: Number(a[2]) };
    if (!validPosition(p))
        throw Error("Invalid Overworld coordinates.");
    return p;
}

const host = new Host();
const memory = new Memory();
let bot;
const limits = new Map();
/**
 * Spawn path for !bot spawn. The bot starts working on its own (starter kit,
 * then auto survival), so spawn is the only command needed - there is no host
 * to bring up first, the engine spawns the player directly.
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
const HELP = "!bot spawn | follow | guard | goto x y z | mine oak_log 4 | deepmine diamond 5 | auto | speedrun | range 256 | starter | craft stick 1 | base [clear] | recover | collect [6..32] | golem | organize | memory | stop | pause | resume | status | mission | inventory | ui [clear|refresh] | swap | deposit | config crafting/parkour/defend/fast/hunting/armor/bridge/boat/loot/deep/camp/pickup/speedrun on/off | host | equipment | unequip | hold | stations | releasefurnace | remove | journal. It bootstraps its own gear from real ingredients, then runs auto survival: wood -> stone -> iron, mining, smelting, crafting, exploring, village and chest loot, nether prep, night camping, death recovery, and a live HUD.";
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
            say(p, "No initialization step any more: the engine spawns the simulated player directly, so !bot spawn is all that is needed. (An upgraded world's old remote host area is removed on the next spawn.)");
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
                say(p, "Stopped; task discarded - guarding nearby. Use pause to hold it.");
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
                if (!b.settings.assistedCrafting) {
                    b.settings.assistedCrafting = true;
                    say(p, "Assisted crafting auto-enabled so it can craft its own gear (real ingredients only; !bot config crafting off disables).");
                }
                b.setMode("survival");
                say(p, "Survival supervisor started: defence, food, tools and armour progression. Hunting targets unnamed livestock; config hunting off disables it. !bot stop cancels.");
                break;
            case "speedrun":
                if (!b.settings.assistedCrafting) {
                    b.settings.assistedCrafting = true;
                    say(p, "Assisted crafting auto-enabled so it can craft its own gear (real ingredients only; !bot config crafting off disables).");
                }
                if (!b.settings.speedrun) {
                    b.settings.speedrun = true;
                    say(p, "Speedrun routing enabled: nether prep and no shelter detours (!bot config speedrun off disables).");
                }
                b.setMode("speedrun");
                say(p, "Speedrun started: wood -> stone -> iron -> diamond -> obsidian portal -> flint&steel -> Nether. Watch !bot status for the phase.");
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
                b.avatar.disconnect();
                host.forget();
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
    console.warn("[Verdant] loaded. Type !bot spawn to bring the bot in, !bot help for commands.");
    world.sendMessage("§a[Verdant] v1.2.7 speedrun-fix + ultra-efficient survival-master 80 scenarios - !bot spawn to begin. Handles all falls, night mobs, resource shortages, shelter failures, multi-risk critical. Knows every block/item, retains important, lava->portal, quick tool #1.");
});
