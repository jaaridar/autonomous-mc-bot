import { world, system, GameMode } from "@minecraft/server";
import { register } from "@minecraft/server-gametest";
import { floor, add, CARDINAL, COMPASS, center, validPosition } from "../core/math.js";
import { Terrain } from "./world.js";
/** Legacy 1.21.114 host is retained remotely, not removed or made beacon-free. */
export class Host {
    constructor() {
        this.pending = false;
        this.generation = 0;
        this.areaCreated = false;
        register("verdant", "host", (test) => {
            this.test = test;
            this.pending = false;
            this.restoreRules();
            if (this.anchor)
                world.setDynamicProperty("verdant:remote_host", JSON.stringify(this.anchor));
            world.sendMessage("§a[Verdant] Remote GameTest host ready.");
            // A spawn requested before the host was up completes by itself.
            // undef-ok: assigned by main.js when spawn is requested early.
            this.onReady?.();
        })
            .maxTicks(630720000)
            .structureName("verdant:host");
    }
    preview(player) {
        let saved;
        try {
            const text = world.getDynamicProperty("verdant:remote_host");
            if (typeof text === "string") {
                const p = JSON.parse(text);
                if (validPosition(p) && p.y >= 64 && p.y <= 315)
                    saved = floor(p);
            }
        }
        catch {
            /* malformed metadata is not executable */
        }
        if (saved) {
            try {
                if (!player.dimension.getBlock(saved)) saved = undefined;
            } catch {
                saved = undefined;
            }
        }
        const origin = floor(player.location);
        const p = saved ?? {
            x: origin.x + 32,
            y: 310,
            z: origin.z + 32,
        };
        if (!validPosition(p))
            throw Error("No valid remote host coordinates near world boundary.");
        this.plan = { owner: player.id, p, reuse: !!saved };
        return { ...p };
    }
    status() {
        return {
            running: !!this.test,
            pending: this.pending,
            position: this.anchor ?? this.plan?.p,
            stored: world.getDynamicProperty("verdant:remote_host") ?? null,
        };
    }
    restoreRules() {
        if (!this.restore)
            return;
        const rules = world.gameRules;
        for (const [k, v] of Object.entries(this.restore))
            try {
                if (rules[k] !== v)
                    rules[k] = v;
            }
            catch (e) {
                console.warn(`[Verdant] Cannot restore gamerule ${k}: ${e}`);
            }
        this.restore = undefined;
    }
    fail(player, dim, message) {
        this.pending = false;
        this.generation++;
        this.restoreRules();
        if (this.areaCreated && !this.test)
            try {
                dim.runCommand("tickingarea remove verdant_host");
                this.areaCreated = false;
            }
            catch {
                /* tell operator below */
            }
        console.warn("[Verdant] Remote host: " + message);
        if (player.isValid)
            player.sendMessage("§c[Verdant] " +
                message +
                " Check Content Log /tickingarea list before retrying.");
    }
    init(player) {
        if (this.test || this.pending)
            throw Error("Host already running or starting.");
        if (player.dimension.id !== "minecraft:overworld")
            throw Error("Initialize in the Overworld.");
        if (!this.plan || this.plan.owner !== player.id)
            this.preview(player);
        const plan = this.plan, at = { ...plan.p }, dim = player.dimension;
        this.anchor = at;
        const rules = world.gameRules;
        this.restore = {};
        for (const k of Object.keys(rules))
            if (["boolean", "number"].includes(typeof rules[k]))
                this.restore[k] = rules[k];
        this.pending = true;
        this.areaCreated = false;
        const run = ++this.generation;
        try {
            // An area left behind by a previous session still exists in the
            // save, and a same-name add would fail: clear ours first.
            try {
                dim.runCommand("tickingarea remove verdant_host");
            }
            catch {
                /* none left behind */
            }
            try {
                dim.runCommand(`tickingarea add circle ${at.x} ${at.y} ${at.z} 1 verdant_host true`);
                this.areaCreated = true;
            }
            catch (e) {
                console.warn("[Verdant] tickingarea add warning: " + e);
            }
        }
        catch (error) {
            this.pending = false;
            this.restoreRules();
            throw error;
        }
        const start = (attempt) => {
            if (run !== this.generation || !this.pending)
                return;
            try {
                // Wait for the region; never attempt a GameTest in an unknown chunk.
                let loaded = false;
                try {
                    loaded = !!dim.getBlock(at);
                }
                catch {
                    loaded = false;
                }
                if (!loaded) {
                    if (attempt >= 20) {
                        this.fail(player, dim, "Remote chunk did not become available.");
                        return;
                    }
                    system.runTimeout(() => start(attempt + 1), 20);
                    return;
                }
                if (!plan.reuse) {
                    try {
                        const top = dim.getTopmostBlock({ x: at.x, z: at.z });
                        if (top && top.location.y + 8 > at.y) {
                            at.y = Math.min(315, top.location.y + 8);
                        }
                    }
                    catch {
                        /* ignore topmost block error; at.y defaults safely */
                    }
                    this.anchor = { ...at };
                }
                try { dim.runCommand("gametest clearall"); } catch {}
                dim.runCommand(`execute positioned ${at.x} ${at.y} ${at.z} run gametest run verdant:host`);
                system.runTimeout(() => this.restoreRules(), 2);
            }
            catch (error) {
                this.fail(player, dim, String(error));
            }
        };
        system.runTimeout(() => start(0), 10);
        system.runTimeout(() => {
            if (run === this.generation && this.pending && !this.test)
                this.fail(player, dim, "Remote GameTest startup timed out.");
        }, 460);
    }
    relative(p) {
        if (!this.test)
            throw Error("Host is not initialized.");
        return this.test.relativeLocation(p);
    }
    spawn(player) {
        if (!this.test)
            throw Error("Host is not ready yet. Try again in a few seconds or use !bot spawn.");
        if (player.dimension.id !== "minecraft:overworld")
            throw Error("This release supports the Overworld only.");
        const terrain = new Terrain(player.dimension), base = floor(player.location);
        let at;
        for (const dist of [2, 1, 3, 4]) {
            for (const d of COMPASS) {
                for (const dy of [0, 1, -1, 2, -2]) {
                    const candidate = {
                        x: base.x + d.x * dist,
                        y: base.y + dy,
                        z: base.z + d.z * dist,
                    };
                    if (terrain.safe(candidate)) {
                        at = candidate;
                        break;
                    }
                }
                if (at) break;
            }
            if (at) break;
        }
        if (!at && terrain.safe(base)) at = base;
        if (!at)
            throw Error("No safe standable spawn position found near you. Move to clear ground.");
        return this.test.spawnSimulatedPlayer(this.relative(center(at)), "Verdant", GameMode.Survival);
    }
}
