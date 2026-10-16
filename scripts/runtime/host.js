// Where the simulated player comes from - and the one coordinate seam.
//
// @minecraft/server-gametest exports spawnSimulatedPlayer(location, name,
// gameMode). Despite living in the GameTest module it is NOT tied to a
// registered Test: it takes a DimensionLocation in WORLD coordinates and hands
// back a live simulated player (verified against the 1.21.114 typings this
// pack targets). The pack used to reach the same result the long way:
//
//   register a GameTest -> ship a .mcstructure -> keep a ticking area 4096
//   blocks from the owner -> snapshot and restore every game rule -> run
//   `execute positioned ... run gametest run verdant:host` -> and convert
//   every single coordinate through test.relativeLocation()
//
// All of that existed only to get a simulated player handle. It is gone: this
// file is now the whole spawn path - one engine call.
//
// relative() stays as the single seam between the driver and the engine. With
// a test-bound spawn it would convert world coordinates into test coordinates;
// the direct API already speaks world coordinates, so it is the identity. If
// the spawn source ever changes again, it changes here and nowhere else.
import { GameMode, world } from "@minecraft/server";
import { spawnSimulatedPlayer } from "@minecraft/server-gametest";
import { CARDINAL, add, floor } from "../core/math.js";
import { Terrain } from "./world.js";

export const BOT_NAME = "Verdant";
export const BOT_TAG = "verdant.bot";

export class Host {
    constructor() {
        /** The live bot handle, if one has been spawned. */
        this.sim = undefined;
        /** Where it was spawned (informational). */
        this.at = undefined;
        /** True when an upgrade from v1.2.x left the old remote host behind. */
        this.legacy = false;
        this.checkLegacy();
    }

    /**
     * v1.2.x kept a remote host: a ticking area named `verdant_host` and a
     * saved anchor in `verdant:remote_host`. Neither is used any more. The
     * property is dropped here; the ticking area needs a dimension, so it is
     * removed on the next spawn (retireLegacyArea).
     */
    checkLegacy() {
        let stored;
        try {
            stored = world.getDynamicProperty("verdant:remote_host");
        }
        catch {
            return;   // dynamic properties unavailable: nothing to migrate
        }
        if (typeof stored !== "string")
            return;
        this.legacy = true;
        try {
            world.setDynamicProperty("verdant:remote_host", undefined);
        }
        catch (e) {
            console.warn(`[Verdant] Could not clear the old remote-host anchor: ${e}`);
        }
    }

    /** Best effort: an upgraded world should not keep a needless loaded chunk. */
    retireLegacyArea(dimension) {
        if (!this.legacy)
            return;
        this.legacy = false;
        try {
            dimension.runCommand("tickingarea remove verdant_host");
        }
        catch {
            // No area of that name, or commands unavailable - both are fine.
        }
    }

    /**
     * World coordinates in, engine coordinates out. Identity today because the
     * direct spawn API has no test origin to be relative to; kept so that every
     * positional call in the pack has exactly one place to agree on semantics.
     */
    relative(p) {
        return { x: p.x, y: p.y, z: p.z };
    }

    /**
     * Spawn the bot two blocks from `player` on safe ground.
     * Throws with a reason the owner can act on when there is no room or the
     * engine build cannot spawn at all.
     */
    spawn(player) {
        if (typeof spawnSimulatedPlayer !== "function")
            throw Error("This engine build cannot spawn a simulated player: @minecraft/server-gametest 1.0.0-beta on engine 1.21.114 or newer is required.");
        const base = floor(player.location);
        const terrain = new Terrain(player.dimension);
        const at = CARDINAL
            .map((d) => add(base, { x: d.x * 2, y: 0, z: d.z * 2 }))
            .find((q) => terrain.safe(q));
        if (!at)
            throw Error("No safe full-block spawn position two blocks from owner.");
        this.retireLegacyArea(player.dimension);
        const sim = spawnSimulatedPlayer({
            dimension: player.dimension,
            x: at.x + 0.5,
            y: at.y,
            z: at.z + 0.5,
        }, BOT_NAME, GameMode.Survival);
        try {
            sim.addTag(BOT_TAG);
        }
        catch (e) {
            console.warn(`[Verdant] Could not tag the simulated player: ${e}`);
        }
        this.sim = sim;
        this.at = { ...at };
        return sim;
    }

    /**
     * Drop the handle after the driver has disconnected the player (!bot
     * remove). The engine call itself belongs to the driver - this is only
     * bookkeeping, so the pack keeps exactly one module that drives the avatar.
     */
    forget() {
        this.sim = undefined;
        this.at = undefined;
    }

    status() {
        const sim = this.sim;
        let alive = false;
        let where;
        try {
            alive = sim?.isValid === true;
            if (alive)
                where = { x: Math.round(sim.location.x), y: Math.round(sim.location.y), z: Math.round(sim.location.z), dimension: sim.dimension.id };
        }
        catch {
            alive = false;
        }
        return {
            spawned: alive,
            name: BOT_NAME,
            position: where,
            spawnPoint: this.at,
            legacyRemoteHost: this.legacy ? "old area still present; removed on next spawn" : "none",
        };
    }
}
