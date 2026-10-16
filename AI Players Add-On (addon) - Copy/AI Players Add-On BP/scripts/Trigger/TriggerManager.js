import { system, TicksPerSecond } from "@minecraft/server";
import StaticTriggers from "./StaticTriggerRegistry";
import TriggerVolumeDrawer from "./TriggerVolumeDrawer";
class TriggerManager {
    /**
     * Registers a static volume trigger (used internally by StaticTrigger classes).
     * @param volume - The volume bounds
     * @param enterCallback - Optional callback fired when a player enters the volume
     * @param leaveCallback - Optional callback fired when a player leaves the volume
     */ static registerVolume(volume, enterCallback, leaveCallback) {
        // Normalize the volume to ensure min/max are correct
        const normalizedVolume = volume.clone().clean();
        this.staticVolumeTriggers.add({
            players: new Set(),
            volume: normalizedVolume,
            enterCallback,
            leaveCallback
        });
    }
    /**
     * Gets all static trigger classes.
     */ static get Triggers() {
        return StaticTriggers;
    }
    /**
     * Gets an array of all static trigger classes.
     */ static get TriggerArray() {
        return Object.values(StaticTriggers);
    }
    /**
     * Initializes the trigger system, instantiating all static triggers and starting volume processing.
     * Called automatically by Main.ts on world load.
     */ static init() {
        // Initialize Static Triggers
        for(const triggerKey in StaticTriggers){
            const Trigger = StaticTriggers[triggerKey];
            this.staticTriggers.set(triggerKey, new Trigger());
        }
        TriggerVolumeDrawer.init();
        // Process static volume triggers (simple volumes registered via onVolume in StaticTriggers)
        this.processStaticTriggers();
        // Process runtime volume triggers every tick
        this.processRuntimeTriggers();
        // Garbage collector for runtime triggers - runs every 5 minutes
        system.runInterval(()=>{
            this.cleanRuntimeVolumeTriggerPlayers();
        }, 5 * TicksPerSecond * 60);
    }
    /**
     * Processes static volume triggers, checking player positions and firing callbacks as needed.
     */ static processStaticTriggers() {
        system.runInterval(()=>{
            DebugTimer.countStart("TriggerManager.staticVolumeTriggers");
            const players = PlayersCache.players;
            const wiggleroom = 0.5;
            this.cleanStaticVolumeTriggerPlayers();
            for (const trigger of this.staticVolumeTriggers){
                const { volume, dimension, players: playersInVolume, enterCallback, leaveCallback } = trigger;
                for (const player of players){
                    // Check if player is in the correct dimension (if dimension is specified)
                    const inCorrectDimension = !dimension || dimension.id === player.dimension.id;
                    const isInVolume = inCorrectDimension && volume.contains(player.location, wiggleroom);
                    const wasInVolume = playersInVolume.has(player.entity);
                    if (isInVolume && !wasInVolume) {
                        playersInVolume.add(player.entity);
                        enterCallback?.(player.entity, [
                            ...playersInVolume
                        ]);
                    } else if (!isInVolume && wasInVolume) {
                        playersInVolume.delete(player.entity);
                        leaveCallback?.(player.entity, [
                            ...playersInVolume
                        ]);
                    }
                }
            }
            DebugTimer.countEnd();
        }, 1);
    }
    /**
     * Removes disconnected players from all static volume triggers.
     * Uses PlayersCache for efficient validation without native calls.
     * Called every tick by processStaticTriggers.
     * @private
     */ static cleanStaticVolumeTriggerPlayers() {
        for (const { players } of this.staticVolumeTriggers){
            for (const player of players){
                if (!PlayersCache.isCachedPlayer(player)) {
                    players.delete(player);
                }
            }
        }
    }
    /**
     * Processes runtime volume triggers, checking player positions and firing callbacks.
     * Called every tick.
     * @private
     */ static processRuntimeTriggers() {
        system.runInterval(()=>{
            DebugTimer.countStart("TriggerManager.runtimeVolumeTriggers");
            const players = PlayersCache.players;
            for (const { volume, dimension, players: playersInVolume, enterCallback, leaveCallback } of this.runtimeVolumeTriggers.values()){
                for (const player of players){
                    // Check if player is in the correct dimension (if dimension is specified)
                    const inCorrectDimension = !dimension || dimension.id === player.dimension.id;
                    const isInVolume = inCorrectDimension && volume.contains(player.location, 0.5);
                    const wasInVolume = playersInVolume.has(player.entity);
                    if (isInVolume && !wasInVolume) {
                        playersInVolume.add(player.entity);
                        enterCallback?.(player.entity, [
                            ...playersInVolume
                        ]);
                    } else if (!isInVolume && wasInVolume) {
                        playersInVolume.delete(player.entity);
                        leaveCallback?.(player.entity, [
                            ...playersInVolume
                        ]);
                    }
                }
            }
            DebugTimer.countEnd();
        }, 1);
    }
    /**
     * Removes disconnected players from all runtime volume triggers.
     * Uses PlayersCache for efficient validation without native calls.
     * Called every 5 minutes.
     * @private
     */ static cleanRuntimeVolumeTriggerPlayers() {
        for (const volumeTrigger of this.runtimeVolumeTriggers.values()){
            for (const player of volumeTrigger.players){
                if (!PlayersCache.isCachedPlayer(player)) {
                    volumeTrigger.players.delete(player);
                }
            }
        }
    }
    /**
     * Checks if a player has previously entered a volume (for 'once' and 'session' trigger modes).
     * @param player - The player to check
     * @param volumeId - Unique hash identifier of the volume
     * @param persistent - If true, checks persistent storage (for 'once' mode); if false, checks temporary storage (for 'session' mode)
     * @returns True if the player has entered this volume before
     * @private
     */ static hasEnteredVolume(player, volumeId, persistent = false) {
        const enteredVolumes = persistent ? EntityStore.get(player, "EnteredVolumes") : EntityStore.temporary.get(player, "EnteredVolumes");
        return enteredVolumes.includes(volumeId);
    }
    /**
     * Records that a player has entered a volume (for 'once' and 'session' trigger modes).
     * @param player - The player who entered
     * @param volumeId - Unique hash identifier of the volume
     * @param persistent - If true, stores in persistent storage (for 'once' mode); if false, stores in temporary storage (for 'session' mode)
     * @private
     */ static addEnteredVolume(player, volumeId, persistent = false) {
        if (persistent) EntityStore.pushToArray(player, "EnteredVolumes", volumeId);
        else EntityStore.temporary.pushToArray(player, "EnteredVolumes", volumeId);
    }
    /**
     * Registers a runtime volume trigger that can be removed at runtime.
     *
     * Automatically normalizes the volume bounds and prevents duplicate registrations.
     * Supports trigger modes: 'always' (default), 'once' (fires once per player lifetime), and 'session' (fires once per session).
     *
     * @param volumeTrigger - The volume trigger configuration including volume bounds and callbacks
     *
     * @example
     * ```typescript
     * TriggerManager.registerRuntimeVolume({
     *     volume: { min: new V3(0, 64, 0), max: new V3(10, 74, 10) },
     *     trigger: 'once',
     *     enterCallback: (player, playersInVolume) => {
     *         player.sendMessage(`Welcome! ${playersInVolume.length} players in area.`);
     *     },
     *     leaveCallback: (player) => {
     *         player.sendMessage('Goodbye!');
     *     }
     * });
     * ```
     */ static registerRuntimeVolume(volumeTrigger) {
        let enterCallback = volumeTrigger.enterCallback;
        let leaveCallback = volumeTrigger.leaveCallback;
        if (volumeTrigger.trigger && volumeTrigger.trigger !== "always") {
            const volumeId = volumeTrigger.volume.toHash();
            enterCallback = (player, playersInVolume)=>{
                if (this.hasEnteredVolume(player, volumeId, volumeTrigger.trigger === "once")) return;
                if (volumeTrigger.enterCallback) volumeTrigger.enterCallback(player, playersInVolume);
                this.addEnteredVolume(player, volumeId, volumeTrigger.trigger === "once");
            };
            leaveCallback = (player, playersInVolume)=>{
                if (this.hasEnteredVolume(player, volumeId, volumeTrigger.trigger === "once")) return;
                if (volumeTrigger.leaveCallback) volumeTrigger.leaveCallback(player, playersInVolume);
            };
        }
        // Normalize the volume to ensure min/max are correct
        const normalizedVolume = volumeTrigger.volume.clone().clean();
        // Include dimension in ID to prevent collisions across dimensions
        const dimensionId = volumeTrigger.dimension?.id ?? "minecraft:overworld";
        const idFromVolume = `${dimensionId}:${normalizedVolume.toString()}`;
        // Check if a volume with this ID already exists
        if (this.runtimeVolumeTriggers.has(idFromVolume)) {
            console.warn(`[TriggerManager] Runtime volume at ${idFromVolume} is already registered. Skipping duplicate registration.`);
            return;
        }
        this.runtimeVolumeTriggers.set(idFromVolume, {
            id: idFromVolume,
            players: new Set(),
            volume: normalizedVolume,
            enterCallback,
            leaveCallback
        });
    }
    /**
     * Removes a previously registered runtime volume trigger.
     *
     * @param volume - The volume bounds to remove (coordinates will be normalized for matching)
     *
     * @example
     * ```typescript
     * const volume = { min: new V3(0, 64, 0), max: new V3(10, 74, 10) };
     * TriggerManager.removeRuntimeVolume(volume);
     * ```
     */ static removeRuntimeVolume(volume, dimension) {
        // Normalize the volume to match the normalized ID used during registration
        const normalizedVolume = volume.clone().clean();
        // Include dimension in ID to match registration
        const dimensionId = dimension?.id ?? "minecraft:overworld";
        const idFromVolume = `${dimensionId}:${normalizedVolume.toString()}`;
        if (!this.runtimeVolumeTriggers.delete(idFromVolume)) {
            console.warn(`[TriggerManager] No runtime volume found at ${idFromVolume} to remove.`);
        }
    }
    /**
     * Gets a specific static trigger instance by its key.
     * @param trigger - The trigger key from StaticTriggers
     * @returns The trigger instance
     */ static getStaticTrigger(trigger) {
        return this.staticTriggers.get(trigger);
    }
    /**
     * Gets all registered static volume triggers.
     * @returns A set of all static volume triggers
     */ static getStaticVolumeTriggers() {
        return this.staticVolumeTriggers;
    }
    /**
     * Gets all registered runtime volume triggers.
     * @returns An array of all runtime volume triggers
     */ static getRuntimeVolumeTriggers() {
        return [
            ...this.runtimeVolumeTriggers.values()
        ];
    }
}
TriggerManager.staticVolumeTriggers = new Set();
TriggerManager.runtimeVolumeTriggers = new Map();
TriggerManager.staticTriggers = new Map();
/**
 * Central manager for the trigger system, handling both static and runtime volume triggers.
 *
 * Static triggers are defined in StaticTrigger classes and initialized at world load.
 * Runtime triggers can be registered and removed at runtime.
 *
 * @example
 * ```typescript
 * // Get a static trigger instance
 * const myTrigger = TriggerManager.getStaticTrigger('ExampleStaticTrigger');
 *
 * // Register a runtime trigger
 * TriggerManager.registerRuntimeVolume({
 *     volume: { min: new V3(0, 64, 0), max: new V3(10, 74, 10) },
 *     trigger: 'once',
 *     enterCallback: (player) => player.sendMessage('Welcome!')
 * });
 * ```
 */ export { TriggerManager as default };

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIlRyaWdnZXJNYW5hZ2VyLnRzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IERpbWVuc2lvbiwgUGxheWVyLCBzeXN0ZW0sIFRpY2tzUGVyU2Vjb25kIH0gZnJvbSBcIkBtaW5lY3JhZnQvc2VydmVyXCI7XHJcblxyXG5pbXBvcnQgVm9sdW1lIGZyb20gXCJIZWxwZXJzL1ZlY3RvcnMvVm9sdW1lXCI7XHJcbmltcG9ydCBTdGF0aWNUcmlnZ2VycyBmcm9tIFwiLi9TdGF0aWNUcmlnZ2VyUmVnaXN0cnlcIjtcclxuaW1wb3J0IFRyaWdnZXJWb2x1bWVEcmF3ZXIgZnJvbSBcIi4vVHJpZ2dlclZvbHVtZURyYXdlclwiO1xyXG5cclxuLyoqXHJcbiAqIENvbmZpZ3VyYXRpb24gZm9yIGNyZWF0aW5nIGEgcnVudGltZSB2b2x1bWUgdHJpZ2dlci5cclxuICovXHJcbmV4cG9ydCBpbnRlcmZhY2UgUnVudGltZVZvbHVtZVRyaWdnZXIge1xyXG4gICAgLyoqIFRoZSB2b2x1bWUgYm91bmRzIGRlZmluaW5nIHRoZSB0cmlnZ2VyIGFyZWEgKi9cclxuICAgIHZvbHVtZTogVm9sdW1lO1xyXG4gICAgLyoqIFRoZSBkaW1lbnNpb24gaW4gd2hpY2ggdGhlIHRyaWdnZXIgaXMgYWN0aXZlICovXHJcbiAgICBkaW1lbnNpb24/OiBEaW1lbnNpb247XHJcbiAgICAvKiogVHJpZ2dlciBiZWhhdmlvcjogJ2Fsd2F5cycgZmlyZXMgZXZlcnkgdGltZSwgJ29uY2UnIGZpcmVzIG9uY2UgcGVyIHBsYXllciBldmVyLCAnc2Vzc2lvbicgZmlyZXMgb25jZSBwZXIgZ2FtZSBzZXNzaW9uICovXHJcbiAgICB0cmlnZ2VyPzogXCJhbHdheXNcIiB8IFwib25jZVwiIHwgXCJzZXNzaW9uXCI7XHJcbiAgICAvKiogQ2FsbGJhY2sgZXhlY3V0ZWQgd2hlbiBhIHBsYXllciBlbnRlcnMgdGhlIHZvbHVtZSAqL1xyXG4gICAgZW50ZXJDYWxsYmFjaz8ocGxheWVyOiBQbGF5ZXIsIHBsYXllcnNJblZvbHVtZTogUGxheWVyW10pOiB2b2lkO1xyXG4gICAgLyoqIENhbGxiYWNrIGV4ZWN1dGVkIHdoZW4gYSBwbGF5ZXIgbGVhdmVzIHRoZSB2b2x1bWUgKi9cclxuICAgIGxlYXZlQ2FsbGJhY2s/KHBsYXllcjogUGxheWVyLCBwbGF5ZXJzSW5Wb2x1bWU6IFBsYXllcltdKTogdm9pZDtcclxufVxyXG5cclxuLyoqXHJcbiAqIEludGVybmFsIHJlcHJlc2VudGF0aW9uIG9mIGEgcmVnaXN0ZXJlZCBydW50aW1lIHZvbHVtZSB0cmlnZ2VyLlxyXG4gKiBAaW50ZXJuYWxcclxuICovXHJcbmV4cG9ydCBpbnRlcmZhY2UgUnVudGltZVZvbHVtZVRyaWdnZXJSZWdpc3RlcmVkIHtcclxuICAgIC8qKiBVbmlxdWUgaWRlbnRpZmllciBmb3IgdGhpcyB0cmlnZ2VyIGluc3RhbmNlICovXHJcbiAgICBpZDogc3RyaW5nO1xyXG4gICAgLyoqIFRoZSBub3JtYWxpemVkIHZvbHVtZSBib3VuZHMgb2YgdGhlIHRyaWdnZXIgKi9cclxuICAgIHZvbHVtZTogVm9sdW1lO1xyXG4gICAgLyoqIFRoZSBkaW1lbnNpb24gaW4gd2hpY2ggdGhlIHRyaWdnZXIgaXMgYWN0aXZlICovXHJcbiAgICBkaW1lbnNpb24/OiBEaW1lbnNpb247XHJcbiAgICAvKiogU2V0IG9mIHBsYXllcnMgY3VycmVudGx5IGluc2lkZSB0aGUgdm9sdW1lICovXHJcbiAgICBwbGF5ZXJzOiBTZXQ8UGxheWVyPjtcclxuICAgIC8qKiBDYWxsYmFjayBleGVjdXRlZCB3aGVuIGEgcGxheWVyIGVudGVycyB0aGUgdm9sdW1lICovXHJcbiAgICBlbnRlckNhbGxiYWNrPyhwbGF5ZXI6IFBsYXllciwgcGxheWVyc0luVm9sdW1lOiBQbGF5ZXJbXSk6IHZvaWQ7XHJcbiAgICAvKiogQ2FsbGJhY2sgZXhlY3V0ZWQgd2hlbiBhIHBsYXllciBsZWF2ZXMgdGhlIHZvbHVtZSAqL1xyXG4gICAgbGVhdmVDYWxsYmFjaz8ocGxheWVyOiBQbGF5ZXIsIHBsYXllcnNJblZvbHVtZTogUGxheWVyW10pOiB2b2lkO1xyXG59XHJcblxyXG4vKipcclxuICogUmVwcmVzZW50cyBhIHJlZ2lzdGVyZWQgc3RhdGljIHZvbHVtZSB0cmlnZ2VyIHdpdGggaXRzIGNvbmZpZ3VyYXRpb24gYW5kIGN1cnJlbnQgc3RhdGUuXHJcbiAqIEBpbnRlcm5hbFxyXG4gKi9cclxuaW50ZXJmYWNlIFN0YXRpY1ZvbHVtZVRyaWdnZXJSZWdpc3RlcmVkIHtcclxuICAgIC8qKiBUaGUgbm9ybWFsaXplZCB2b2x1bWUgYm91bmRzIG9mIHRoZSB0cmlnZ2VyICovXHJcbiAgICB2b2x1bWU6IFZvbHVtZTtcclxuICAgIC8qKiBUaGUgZGltZW5zaW9uIGluIHdoaWNoIHRoZSB0cmlnZ2VyIGlzIGFjdGl2ZSAqL1xyXG4gICAgZGltZW5zaW9uPzogRGltZW5zaW9uO1xyXG4gICAgLyoqIFNldCBvZiBwbGF5ZXJzIGN1cnJlbnRseSBpbnNpZGUgdGhlIHZvbHVtZSAqL1xyXG4gICAgcGxheWVyczogU2V0PFBsYXllcj47XHJcbiAgICAvKiogQ2FsbGJhY2sgZXhlY3V0ZWQgd2hlbiBhIHBsYXllciBlbnRlcnMgdGhlIHZvbHVtZSAqL1xyXG4gICAgZW50ZXJDYWxsYmFjaz8ocGxheWVyOiBQbGF5ZXIsIHBsYXllcnNJblZvbHVtZTogUGxheWVyW10pOiB2b2lkO1xyXG4gICAgLyoqIENhbGxiYWNrIGV4ZWN1dGVkIHdoZW4gYSBwbGF5ZXIgbGVhdmVzIHRoZSB2b2x1bWUgKi9cclxuICAgIGxlYXZlQ2FsbGJhY2s/KHBsYXllcjogUGxheWVyLCBwbGF5ZXJzSW5Wb2x1bWU6IFBsYXllcltdKTogdm9pZDtcclxufVxyXG5cclxuLyoqXHJcbiAqIENlbnRyYWwgbWFuYWdlciBmb3IgdGhlIHRyaWdnZXIgc3lzdGVtLCBoYW5kbGluZyBib3RoIHN0YXRpYyBhbmQgcnVudGltZSB2b2x1bWUgdHJpZ2dlcnMuXHJcbiAqXHJcbiAqIFN0YXRpYyB0cmlnZ2VycyBhcmUgZGVmaW5lZCBpbiBTdGF0aWNUcmlnZ2VyIGNsYXNzZXMgYW5kIGluaXRpYWxpemVkIGF0IHdvcmxkIGxvYWQuXHJcbiAqIFJ1bnRpbWUgdHJpZ2dlcnMgY2FuIGJlIHJlZ2lzdGVyZWQgYW5kIHJlbW92ZWQgYXQgcnVudGltZS5cclxuICpcclxuICogQGV4YW1wbGVcclxuICogYGBgdHlwZXNjcmlwdFxyXG4gKiAvLyBHZXQgYSBzdGF0aWMgdHJpZ2dlciBpbnN0YW5jZVxyXG4gKiBjb25zdCBteVRyaWdnZXIgPSBUcmlnZ2VyTWFuYWdlci5nZXRTdGF0aWNUcmlnZ2VyKCdFeGFtcGxlU3RhdGljVHJpZ2dlcicpO1xyXG4gKlxyXG4gKiAvLyBSZWdpc3RlciBhIHJ1bnRpbWUgdHJpZ2dlclxyXG4gKiBUcmlnZ2VyTWFuYWdlci5yZWdpc3RlclJ1bnRpbWVWb2x1bWUoe1xyXG4gKiAgICAgdm9sdW1lOiB7IG1pbjogbmV3IFYzKDAsIDY0LCAwKSwgbWF4OiBuZXcgVjMoMTAsIDc0LCAxMCkgfSxcclxuICogICAgIHRyaWdnZXI6ICdvbmNlJyxcclxuICogICAgIGVudGVyQ2FsbGJhY2s6IChwbGF5ZXIpID0+IHBsYXllci5zZW5kTWVzc2FnZSgnV2VsY29tZSEnKVxyXG4gKiB9KTtcclxuICogYGBgXHJcbiAqL1xyXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBUcmlnZ2VyTWFuYWdlciB7XHJcbiAgICBwcml2YXRlIHN0YXRpYyByZWFkb25seSBzdGF0aWNWb2x1bWVUcmlnZ2VycyA9IG5ldyBTZXQ8U3RhdGljVm9sdW1lVHJpZ2dlclJlZ2lzdGVyZWQ+KCk7XHJcbiAgICBwcml2YXRlIHN0YXRpYyByZWFkb25seSBydW50aW1lVm9sdW1lVHJpZ2dlcnMgPSBuZXcgTWFwPHN0cmluZywgUnVudGltZVZvbHVtZVRyaWdnZXJSZWdpc3RlcmVkPigpO1xyXG4gICAgcHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgc3RhdGljVHJpZ2dlcnMgPSBuZXcgTWFwPFxyXG4gICAgICAgIGtleW9mIHR5cGVvZiBTdGF0aWNUcmlnZ2VycyxcclxuICAgICAgICBJbnN0YW5jZVR5cGU8KHR5cGVvZiBTdGF0aWNUcmlnZ2Vycylba2V5b2YgdHlwZW9mIFN0YXRpY1RyaWdnZXJzXT5cclxuICAgID4oKTtcclxuXHJcbiAgICAvKipcclxuICAgICAqIFJlZ2lzdGVycyBhIHN0YXRpYyB2b2x1bWUgdHJpZ2dlciAodXNlZCBpbnRlcm5hbGx5IGJ5IFN0YXRpY1RyaWdnZXIgY2xhc3NlcykuXHJcbiAgICAgKiBAcGFyYW0gdm9sdW1lIC0gVGhlIHZvbHVtZSBib3VuZHNcclxuICAgICAqIEBwYXJhbSBlbnRlckNhbGxiYWNrIC0gT3B0aW9uYWwgY2FsbGJhY2sgZmlyZWQgd2hlbiBhIHBsYXllciBlbnRlcnMgdGhlIHZvbHVtZVxyXG4gICAgICogQHBhcmFtIGxlYXZlQ2FsbGJhY2sgLSBPcHRpb25hbCBjYWxsYmFjayBmaXJlZCB3aGVuIGEgcGxheWVyIGxlYXZlcyB0aGUgdm9sdW1lXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgcmVnaXN0ZXJWb2x1bWUoXHJcbiAgICAgICAgdm9sdW1lOiBWb2x1bWUsXHJcbiAgICAgICAgZW50ZXJDYWxsYmFjaz86IChwbGF5ZXI6IFBsYXllciwgcGxheWVyc0luVm9sdW1lOiBQbGF5ZXJbXSkgPT4gdm9pZCxcclxuICAgICAgICBsZWF2ZUNhbGxiYWNrPzogKHBsYXllcjogUGxheWVyLCBwbGF5ZXJzSW5Wb2x1bWU6IFBsYXllcltdKSA9PiB2b2lkXHJcbiAgICApIHtcclxuICAgICAgICAvLyBOb3JtYWxpemUgdGhlIHZvbHVtZSB0byBlbnN1cmUgbWluL21heCBhcmUgY29ycmVjdFxyXG4gICAgICAgIGNvbnN0IG5vcm1hbGl6ZWRWb2x1bWUgPSB2b2x1bWUuY2xvbmUoKS5jbGVhbigpO1xyXG5cclxuICAgICAgICB0aGlzLnN0YXRpY1ZvbHVtZVRyaWdnZXJzLmFkZCh7XHJcbiAgICAgICAgICAgIHBsYXllcnM6IG5ldyBTZXQoKSxcclxuICAgICAgICAgICAgdm9sdW1lOiBub3JtYWxpemVkVm9sdW1lLFxyXG4gICAgICAgICAgICBlbnRlckNhbGxiYWNrLFxyXG4gICAgICAgICAgICBsZWF2ZUNhbGxiYWNrLFxyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG4gICAgLyoqXHJcbiAgICAgKiBHZXRzIGFsbCBzdGF0aWMgdHJpZ2dlciBjbGFzc2VzLlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGdldCBUcmlnZ2VycygpIHtcclxuICAgICAgICByZXR1cm4gU3RhdGljVHJpZ2dlcnM7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBHZXRzIGFuIGFycmF5IG9mIGFsbCBzdGF0aWMgdHJpZ2dlciBjbGFzc2VzLlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGdldCBUcmlnZ2VyQXJyYXkoKSB7XHJcbiAgICAgICAgcmV0dXJuIE9iamVjdC52YWx1ZXMoU3RhdGljVHJpZ2dlcnMpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogSW5pdGlhbGl6ZXMgdGhlIHRyaWdnZXIgc3lzdGVtLCBpbnN0YW50aWF0aW5nIGFsbCBzdGF0aWMgdHJpZ2dlcnMgYW5kIHN0YXJ0aW5nIHZvbHVtZSBwcm9jZXNzaW5nLlxyXG4gICAgICogQ2FsbGVkIGF1dG9tYXRpY2FsbHkgYnkgTWFpbi50cyBvbiB3b3JsZCBsb2FkLlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGluaXQoKSB7XHJcbiAgICAgICAgLy8gSW5pdGlhbGl6ZSBTdGF0aWMgVHJpZ2dlcnNcclxuICAgICAgICBmb3IgKGNvbnN0IHRyaWdnZXJLZXkgaW4gU3RhdGljVHJpZ2dlcnMpIHtcclxuICAgICAgICAgICAgY29uc3QgVHJpZ2dlciA9IFN0YXRpY1RyaWdnZXJzW3RyaWdnZXJLZXldIGFzICh0eXBlb2YgU3RhdGljVHJpZ2dlcnMpW2tleW9mIHR5cGVvZiBTdGF0aWNUcmlnZ2Vyc107XHJcbiAgICAgICAgICAgIHRoaXMuc3RhdGljVHJpZ2dlcnMuc2V0KHRyaWdnZXJLZXkgYXMga2V5b2YgdHlwZW9mIFN0YXRpY1RyaWdnZXJzLCBuZXcgVHJpZ2dlcigpKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIFRyaWdnZXJWb2x1bWVEcmF3ZXIuaW5pdCgpO1xyXG5cclxuICAgICAgICAvLyBQcm9jZXNzIHN0YXRpYyB2b2x1bWUgdHJpZ2dlcnMgKHNpbXBsZSB2b2x1bWVzIHJlZ2lzdGVyZWQgdmlhIG9uVm9sdW1lIGluIFN0YXRpY1RyaWdnZXJzKVxyXG4gICAgICAgIHRoaXMucHJvY2Vzc1N0YXRpY1RyaWdnZXJzKCk7XHJcblxyXG4gICAgICAgIC8vIFByb2Nlc3MgcnVudGltZSB2b2x1bWUgdHJpZ2dlcnMgZXZlcnkgdGlja1xyXG4gICAgICAgIHRoaXMucHJvY2Vzc1J1bnRpbWVUcmlnZ2VycygpO1xyXG5cclxuICAgICAgICAvLyBHYXJiYWdlIGNvbGxlY3RvciBmb3IgcnVudGltZSB0cmlnZ2VycyAtIHJ1bnMgZXZlcnkgNSBtaW51dGVzXHJcbiAgICAgICAgc3lzdGVtLnJ1bkludGVydmFsKFxyXG4gICAgICAgICAgICAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmNsZWFuUnVudGltZVZvbHVtZVRyaWdnZXJQbGF5ZXJzKCk7XHJcbiAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgIDUgKiBUaWNrc1BlclNlY29uZCAqIDYwXHJcbiAgICAgICAgKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFByb2Nlc3NlcyBzdGF0aWMgdm9sdW1lIHRyaWdnZXJzLCBjaGVja2luZyBwbGF5ZXIgcG9zaXRpb25zIGFuZCBmaXJpbmcgY2FsbGJhY2tzIGFzIG5lZWRlZC5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBzdGF0aWMgcHJvY2Vzc1N0YXRpY1RyaWdnZXJzKCkge1xyXG4gICAgICAgIHN5c3RlbS5ydW5JbnRlcnZhbCgoKSA9PiB7XHJcbiAgICAgICAgICAgIERlYnVnVGltZXIuY291bnRTdGFydChcIlRyaWdnZXJNYW5hZ2VyLnN0YXRpY1ZvbHVtZVRyaWdnZXJzXCIpO1xyXG4gICAgICAgICAgICBjb25zdCBwbGF5ZXJzID0gUGxheWVyc0NhY2hlLnBsYXllcnM7XHJcbiAgICAgICAgICAgIGNvbnN0IHdpZ2dsZXJvb20gPSAwLjU7XHJcbiAgICAgICAgICAgIHRoaXMuY2xlYW5TdGF0aWNWb2x1bWVUcmlnZ2VyUGxheWVycygpO1xyXG4gICAgICAgICAgICBmb3IgKGNvbnN0IHRyaWdnZXIgb2YgdGhpcy5zdGF0aWNWb2x1bWVUcmlnZ2Vycykge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgeyB2b2x1bWUsIGRpbWVuc2lvbiwgcGxheWVyczogcGxheWVyc0luVm9sdW1lLCBlbnRlckNhbGxiYWNrLCBsZWF2ZUNhbGxiYWNrIH0gPSB0cmlnZ2VyO1xyXG5cclxuICAgICAgICAgICAgICAgIGZvciAoY29uc3QgcGxheWVyIG9mIHBsYXllcnMpIHtcclxuICAgICAgICAgICAgICAgICAgICAvLyBDaGVjayBpZiBwbGF5ZXIgaXMgaW4gdGhlIGNvcnJlY3QgZGltZW5zaW9uIChpZiBkaW1lbnNpb24gaXMgc3BlY2lmaWVkKVxyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGluQ29ycmVjdERpbWVuc2lvbiA9ICFkaW1lbnNpb24gfHwgZGltZW5zaW9uLmlkID09PSBwbGF5ZXIuZGltZW5zaW9uLmlkO1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGlzSW5Wb2x1bWUgPSBpbkNvcnJlY3REaW1lbnNpb24gJiYgdm9sdW1lLmNvbnRhaW5zKHBsYXllci5sb2NhdGlvbiwgd2lnZ2xlcm9vbSk7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3Qgd2FzSW5Wb2x1bWUgPSBwbGF5ZXJzSW5Wb2x1bWUuaGFzKHBsYXllci5lbnRpdHkpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICBpZiAoaXNJblZvbHVtZSAmJiAhd2FzSW5Wb2x1bWUpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgcGxheWVyc0luVm9sdW1lLmFkZChwbGF5ZXIuZW50aXR5KTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgZW50ZXJDYWxsYmFjaz8uKHBsYXllci5lbnRpdHksIFsuLi5wbGF5ZXJzSW5Wb2x1bWVdKTtcclxuICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKCFpc0luVm9sdW1lICYmIHdhc0luVm9sdW1lKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHBsYXllcnNJblZvbHVtZS5kZWxldGUocGxheWVyLmVudGl0eSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGxlYXZlQ2FsbGJhY2s/LihwbGF5ZXIuZW50aXR5LCBbLi4ucGxheWVyc0luVm9sdW1lXSk7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIERlYnVnVGltZXIuY291bnRFbmQoKTtcclxuICAgICAgICB9LCAxKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFJlbW92ZXMgZGlzY29ubmVjdGVkIHBsYXllcnMgZnJvbSBhbGwgc3RhdGljIHZvbHVtZSB0cmlnZ2Vycy5cclxuICAgICAqIFVzZXMgUGxheWVyc0NhY2hlIGZvciBlZmZpY2llbnQgdmFsaWRhdGlvbiB3aXRob3V0IG5hdGl2ZSBjYWxscy5cclxuICAgICAqIENhbGxlZCBldmVyeSB0aWNrIGJ5IHByb2Nlc3NTdGF0aWNUcmlnZ2Vycy5cclxuICAgICAqIEBwcml2YXRlXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgc3RhdGljIGNsZWFuU3RhdGljVm9sdW1lVHJpZ2dlclBsYXllcnMoKSB7XHJcbiAgICAgICAgZm9yIChjb25zdCB7IHBsYXllcnMgfSBvZiB0aGlzLnN0YXRpY1ZvbHVtZVRyaWdnZXJzKSB7XHJcbiAgICAgICAgICAgIGZvciAoY29uc3QgcGxheWVyIG9mIHBsYXllcnMpIHtcclxuICAgICAgICAgICAgICAgIGlmICghUGxheWVyc0NhY2hlLmlzQ2FjaGVkUGxheWVyKHBsYXllcikpIHtcclxuICAgICAgICAgICAgICAgICAgICBwbGF5ZXJzLmRlbGV0ZShwbGF5ZXIpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogUHJvY2Vzc2VzIHJ1bnRpbWUgdm9sdW1lIHRyaWdnZXJzLCBjaGVja2luZyBwbGF5ZXIgcG9zaXRpb25zIGFuZCBmaXJpbmcgY2FsbGJhY2tzLlxyXG4gICAgICogQ2FsbGVkIGV2ZXJ5IHRpY2suXHJcbiAgICAgKiBAcHJpdmF0ZVxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIHN0YXRpYyBwcm9jZXNzUnVudGltZVRyaWdnZXJzKCkge1xyXG4gICAgICAgIHN5c3RlbS5ydW5JbnRlcnZhbCgoKSA9PiB7XHJcbiAgICAgICAgICAgIERlYnVnVGltZXIuY291bnRTdGFydChcIlRyaWdnZXJNYW5hZ2VyLnJ1bnRpbWVWb2x1bWVUcmlnZ2Vyc1wiKTtcclxuICAgICAgICAgICAgY29uc3QgcGxheWVycyA9IFBsYXllcnNDYWNoZS5wbGF5ZXJzO1xyXG5cclxuICAgICAgICAgICAgZm9yIChjb25zdCB7XHJcbiAgICAgICAgICAgICAgICB2b2x1bWUsXHJcbiAgICAgICAgICAgICAgICBkaW1lbnNpb24sXHJcbiAgICAgICAgICAgICAgICBwbGF5ZXJzOiBwbGF5ZXJzSW5Wb2x1bWUsXHJcbiAgICAgICAgICAgICAgICBlbnRlckNhbGxiYWNrLFxyXG4gICAgICAgICAgICAgICAgbGVhdmVDYWxsYmFjayxcclxuICAgICAgICAgICAgfSBvZiB0aGlzLnJ1bnRpbWVWb2x1bWVUcmlnZ2Vycy52YWx1ZXMoKSkge1xyXG4gICAgICAgICAgICAgICAgZm9yIChjb25zdCBwbGF5ZXIgb2YgcGxheWVycykge1xyXG4gICAgICAgICAgICAgICAgICAgIC8vIENoZWNrIGlmIHBsYXllciBpcyBpbiB0aGUgY29ycmVjdCBkaW1lbnNpb24gKGlmIGRpbWVuc2lvbiBpcyBzcGVjaWZpZWQpXHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgaW5Db3JyZWN0RGltZW5zaW9uID0gIWRpbWVuc2lvbiB8fCBkaW1lbnNpb24uaWQgPT09IHBsYXllci5kaW1lbnNpb24uaWQ7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgaXNJblZvbHVtZSA9IGluQ29ycmVjdERpbWVuc2lvbiAmJiB2b2x1bWUuY29udGFpbnMocGxheWVyLmxvY2F0aW9uLCAwLjUpO1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHdhc0luVm9sdW1lID0gcGxheWVyc0luVm9sdW1lLmhhcyhwbGF5ZXIuZW50aXR5KTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKGlzSW5Wb2x1bWUgJiYgIXdhc0luVm9sdW1lKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHBsYXllcnNJblZvbHVtZS5hZGQocGxheWVyLmVudGl0eSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGVudGVyQ2FsbGJhY2s/LihwbGF5ZXIuZW50aXR5LCBbLi4ucGxheWVyc0luVm9sdW1lXSk7XHJcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmICghaXNJblZvbHVtZSAmJiB3YXNJblZvbHVtZSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBwbGF5ZXJzSW5Wb2x1bWUuZGVsZXRlKHBsYXllci5lbnRpdHkpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBsZWF2ZUNhbGxiYWNrPy4ocGxheWVyLmVudGl0eSwgWy4uLnBsYXllcnNJblZvbHVtZV0pO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBEZWJ1Z1RpbWVyLmNvdW50RW5kKCk7XHJcbiAgICAgICAgfSwgMSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBSZW1vdmVzIGRpc2Nvbm5lY3RlZCBwbGF5ZXJzIGZyb20gYWxsIHJ1bnRpbWUgdm9sdW1lIHRyaWdnZXJzLlxyXG4gICAgICogVXNlcyBQbGF5ZXJzQ2FjaGUgZm9yIGVmZmljaWVudCB2YWxpZGF0aW9uIHdpdGhvdXQgbmF0aXZlIGNhbGxzLlxyXG4gICAgICogQ2FsbGVkIGV2ZXJ5IDUgbWludXRlcy5cclxuICAgICAqIEBwcml2YXRlXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgc3RhdGljIGNsZWFuUnVudGltZVZvbHVtZVRyaWdnZXJQbGF5ZXJzKCkge1xyXG4gICAgICAgIGZvciAoY29uc3Qgdm9sdW1lVHJpZ2dlciBvZiB0aGlzLnJ1bnRpbWVWb2x1bWVUcmlnZ2Vycy52YWx1ZXMoKSkge1xyXG4gICAgICAgICAgICBmb3IgKGNvbnN0IHBsYXllciBvZiB2b2x1bWVUcmlnZ2VyLnBsYXllcnMpIHtcclxuICAgICAgICAgICAgICAgIGlmICghUGxheWVyc0NhY2hlLmlzQ2FjaGVkUGxheWVyKHBsYXllcikpIHtcclxuICAgICAgICAgICAgICAgICAgICB2b2x1bWVUcmlnZ2VyLnBsYXllcnMuZGVsZXRlKHBsYXllcik7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBDaGVja3MgaWYgYSBwbGF5ZXIgaGFzIHByZXZpb3VzbHkgZW50ZXJlZCBhIHZvbHVtZSAoZm9yICdvbmNlJyBhbmQgJ3Nlc3Npb24nIHRyaWdnZXIgbW9kZXMpLlxyXG4gICAgICogQHBhcmFtIHBsYXllciAtIFRoZSBwbGF5ZXIgdG8gY2hlY2tcclxuICAgICAqIEBwYXJhbSB2b2x1bWVJZCAtIFVuaXF1ZSBoYXNoIGlkZW50aWZpZXIgb2YgdGhlIHZvbHVtZVxyXG4gICAgICogQHBhcmFtIHBlcnNpc3RlbnQgLSBJZiB0cnVlLCBjaGVja3MgcGVyc2lzdGVudCBzdG9yYWdlIChmb3IgJ29uY2UnIG1vZGUpOyBpZiBmYWxzZSwgY2hlY2tzIHRlbXBvcmFyeSBzdG9yYWdlIChmb3IgJ3Nlc3Npb24nIG1vZGUpXHJcbiAgICAgKiBAcmV0dXJucyBUcnVlIGlmIHRoZSBwbGF5ZXIgaGFzIGVudGVyZWQgdGhpcyB2b2x1bWUgYmVmb3JlXHJcbiAgICAgKiBAcHJpdmF0ZVxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIHN0YXRpYyBoYXNFbnRlcmVkVm9sdW1lKHBsYXllcjogUGxheWVyLCB2b2x1bWVJZDogbnVtYmVyLCBwZXJzaXN0ZW50ID0gZmFsc2UpIHtcclxuICAgICAgICBjb25zdCBlbnRlcmVkVm9sdW1lcyA9IHBlcnNpc3RlbnQgPyBFbnRpdHlTdG9yZS5nZXQocGxheWVyLCBcIkVudGVyZWRWb2x1bWVzXCIpIDogRW50aXR5U3RvcmUudGVtcG9yYXJ5LmdldChwbGF5ZXIsIFwiRW50ZXJlZFZvbHVtZXNcIik7XHJcbiAgICAgICAgcmV0dXJuIGVudGVyZWRWb2x1bWVzLmluY2x1ZGVzKHZvbHVtZUlkKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFJlY29yZHMgdGhhdCBhIHBsYXllciBoYXMgZW50ZXJlZCBhIHZvbHVtZSAoZm9yICdvbmNlJyBhbmQgJ3Nlc3Npb24nIHRyaWdnZXIgbW9kZXMpLlxyXG4gICAgICogQHBhcmFtIHBsYXllciAtIFRoZSBwbGF5ZXIgd2hvIGVudGVyZWRcclxuICAgICAqIEBwYXJhbSB2b2x1bWVJZCAtIFVuaXF1ZSBoYXNoIGlkZW50aWZpZXIgb2YgdGhlIHZvbHVtZVxyXG4gICAgICogQHBhcmFtIHBlcnNpc3RlbnQgLSBJZiB0cnVlLCBzdG9yZXMgaW4gcGVyc2lzdGVudCBzdG9yYWdlIChmb3IgJ29uY2UnIG1vZGUpOyBpZiBmYWxzZSwgc3RvcmVzIGluIHRlbXBvcmFyeSBzdG9yYWdlIChmb3IgJ3Nlc3Npb24nIG1vZGUpXHJcbiAgICAgKiBAcHJpdmF0ZVxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIHN0YXRpYyBhZGRFbnRlcmVkVm9sdW1lKHBsYXllcjogUGxheWVyLCB2b2x1bWVJZDogbnVtYmVyLCBwZXJzaXN0ZW50ID0gZmFsc2UpIHtcclxuICAgICAgICBpZiAocGVyc2lzdGVudCkgRW50aXR5U3RvcmUucHVzaFRvQXJyYXkocGxheWVyLCBcIkVudGVyZWRWb2x1bWVzXCIsIHZvbHVtZUlkKTtcclxuICAgICAgICBlbHNlIEVudGl0eVN0b3JlLnRlbXBvcmFyeS5wdXNoVG9BcnJheShwbGF5ZXIsIFwiRW50ZXJlZFZvbHVtZXNcIiwgdm9sdW1lSWQpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogUmVnaXN0ZXJzIGEgcnVudGltZSB2b2x1bWUgdHJpZ2dlciB0aGF0IGNhbiBiZSByZW1vdmVkIGF0IHJ1bnRpbWUuXHJcbiAgICAgKlxyXG4gICAgICogQXV0b21hdGljYWxseSBub3JtYWxpemVzIHRoZSB2b2x1bWUgYm91bmRzIGFuZCBwcmV2ZW50cyBkdXBsaWNhdGUgcmVnaXN0cmF0aW9ucy5cclxuICAgICAqIFN1cHBvcnRzIHRyaWdnZXIgbW9kZXM6ICdhbHdheXMnIChkZWZhdWx0KSwgJ29uY2UnIChmaXJlcyBvbmNlIHBlciBwbGF5ZXIgbGlmZXRpbWUpLCBhbmQgJ3Nlc3Npb24nIChmaXJlcyBvbmNlIHBlciBzZXNzaW9uKS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gdm9sdW1lVHJpZ2dlciAtIFRoZSB2b2x1bWUgdHJpZ2dlciBjb25maWd1cmF0aW9uIGluY2x1ZGluZyB2b2x1bWUgYm91bmRzIGFuZCBjYWxsYmFja3NcclxuICAgICAqXHJcbiAgICAgKiBAZXhhbXBsZVxyXG4gICAgICogYGBgdHlwZXNjcmlwdFxyXG4gICAgICogVHJpZ2dlck1hbmFnZXIucmVnaXN0ZXJSdW50aW1lVm9sdW1lKHtcclxuICAgICAqICAgICB2b2x1bWU6IHsgbWluOiBuZXcgVjMoMCwgNjQsIDApLCBtYXg6IG5ldyBWMygxMCwgNzQsIDEwKSB9LFxyXG4gICAgICogICAgIHRyaWdnZXI6ICdvbmNlJyxcclxuICAgICAqICAgICBlbnRlckNhbGxiYWNrOiAocGxheWVyLCBwbGF5ZXJzSW5Wb2x1bWUpID0+IHtcclxuICAgICAqICAgICAgICAgcGxheWVyLnNlbmRNZXNzYWdlKGBXZWxjb21lISAke3BsYXllcnNJblZvbHVtZS5sZW5ndGh9IHBsYXllcnMgaW4gYXJlYS5gKTtcclxuICAgICAqICAgICB9LFxyXG4gICAgICogICAgIGxlYXZlQ2FsbGJhY2s6IChwbGF5ZXIpID0+IHtcclxuICAgICAqICAgICAgICAgcGxheWVyLnNlbmRNZXNzYWdlKCdHb29kYnllIScpO1xyXG4gICAgICogICAgIH1cclxuICAgICAqIH0pO1xyXG4gICAgICogYGBgXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgcmVnaXN0ZXJSdW50aW1lVm9sdW1lKHZvbHVtZVRyaWdnZXI6IFJ1bnRpbWVWb2x1bWVUcmlnZ2VyKSB7XHJcbiAgICAgICAgbGV0IGVudGVyQ2FsbGJhY2sgPSB2b2x1bWVUcmlnZ2VyLmVudGVyQ2FsbGJhY2s7XHJcbiAgICAgICAgbGV0IGxlYXZlQ2FsbGJhY2sgPSB2b2x1bWVUcmlnZ2VyLmxlYXZlQ2FsbGJhY2s7XHJcblxyXG4gICAgICAgIGlmICh2b2x1bWVUcmlnZ2VyLnRyaWdnZXIgJiYgdm9sdW1lVHJpZ2dlci50cmlnZ2VyICE9PSBcImFsd2F5c1wiKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHZvbHVtZUlkID0gdm9sdW1lVHJpZ2dlci52b2x1bWUudG9IYXNoKCk7XHJcbiAgICAgICAgICAgIGVudGVyQ2FsbGJhY2sgPSAocGxheWVyLCBwbGF5ZXJzSW5Wb2x1bWUpID0+IHtcclxuICAgICAgICAgICAgICAgIGlmICh0aGlzLmhhc0VudGVyZWRWb2x1bWUocGxheWVyLCB2b2x1bWVJZCwgdm9sdW1lVHJpZ2dlci50cmlnZ2VyID09PSBcIm9uY2VcIikpIHJldHVybjtcclxuICAgICAgICAgICAgICAgIGlmICh2b2x1bWVUcmlnZ2VyLmVudGVyQ2FsbGJhY2spIHZvbHVtZVRyaWdnZXIuZW50ZXJDYWxsYmFjayhwbGF5ZXIsIHBsYXllcnNJblZvbHVtZSk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmFkZEVudGVyZWRWb2x1bWUocGxheWVyLCB2b2x1bWVJZCwgdm9sdW1lVHJpZ2dlci50cmlnZ2VyID09PSBcIm9uY2VcIik7XHJcbiAgICAgICAgICAgIH07XHJcblxyXG4gICAgICAgICAgICBsZWF2ZUNhbGxiYWNrID0gKHBsYXllciwgcGxheWVyc0luVm9sdW1lKSA9PiB7XHJcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5oYXNFbnRlcmVkVm9sdW1lKHBsYXllciwgdm9sdW1lSWQsIHZvbHVtZVRyaWdnZXIudHJpZ2dlciA9PT0gXCJvbmNlXCIpKSByZXR1cm47XHJcbiAgICAgICAgICAgICAgICBpZiAodm9sdW1lVHJpZ2dlci5sZWF2ZUNhbGxiYWNrKSB2b2x1bWVUcmlnZ2VyLmxlYXZlQ2FsbGJhY2socGxheWVyLCBwbGF5ZXJzSW5Wb2x1bWUpO1xyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gTm9ybWFsaXplIHRoZSB2b2x1bWUgdG8gZW5zdXJlIG1pbi9tYXggYXJlIGNvcnJlY3RcclxuICAgICAgICBjb25zdCBub3JtYWxpemVkVm9sdW1lID0gdm9sdW1lVHJpZ2dlci52b2x1bWUuY2xvbmUoKS5jbGVhbigpO1xyXG5cclxuICAgICAgICAvLyBJbmNsdWRlIGRpbWVuc2lvbiBpbiBJRCB0byBwcmV2ZW50IGNvbGxpc2lvbnMgYWNyb3NzIGRpbWVuc2lvbnNcclxuICAgICAgICBjb25zdCBkaW1lbnNpb25JZCA9IHZvbHVtZVRyaWdnZXIuZGltZW5zaW9uPy5pZCA/PyBcIm1pbmVjcmFmdDpvdmVyd29ybGRcIjtcclxuICAgICAgICBjb25zdCBpZEZyb21Wb2x1bWUgPSBgJHtkaW1lbnNpb25JZH06JHtub3JtYWxpemVkVm9sdW1lLnRvU3RyaW5nKCl9YDtcclxuXHJcbiAgICAgICAgLy8gQ2hlY2sgaWYgYSB2b2x1bWUgd2l0aCB0aGlzIElEIGFscmVhZHkgZXhpc3RzXHJcbiAgICAgICAgaWYgKHRoaXMucnVudGltZVZvbHVtZVRyaWdnZXJzLmhhcyhpZEZyb21Wb2x1bWUpKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUud2FybihgW1RyaWdnZXJNYW5hZ2VyXSBSdW50aW1lIHZvbHVtZSBhdCAke2lkRnJvbVZvbHVtZX0gaXMgYWxyZWFkeSByZWdpc3RlcmVkLiBTa2lwcGluZyBkdXBsaWNhdGUgcmVnaXN0cmF0aW9uLmApO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB0aGlzLnJ1bnRpbWVWb2x1bWVUcmlnZ2Vycy5zZXQoaWRGcm9tVm9sdW1lLCB7XHJcbiAgICAgICAgICAgIGlkOiBpZEZyb21Wb2x1bWUsXHJcbiAgICAgICAgICAgIHBsYXllcnM6IG5ldyBTZXQoKSxcclxuICAgICAgICAgICAgdm9sdW1lOiBub3JtYWxpemVkVm9sdW1lLFxyXG4gICAgICAgICAgICBlbnRlckNhbGxiYWNrLFxyXG4gICAgICAgICAgICBsZWF2ZUNhbGxiYWNrLFxyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogUmVtb3ZlcyBhIHByZXZpb3VzbHkgcmVnaXN0ZXJlZCBydW50aW1lIHZvbHVtZSB0cmlnZ2VyLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSB2b2x1bWUgLSBUaGUgdm9sdW1lIGJvdW5kcyB0byByZW1vdmUgKGNvb3JkaW5hdGVzIHdpbGwgYmUgbm9ybWFsaXplZCBmb3IgbWF0Y2hpbmcpXHJcbiAgICAgKlxyXG4gICAgICogQGV4YW1wbGVcclxuICAgICAqIGBgYHR5cGVzY3JpcHRcclxuICAgICAqIGNvbnN0IHZvbHVtZSA9IHsgbWluOiBuZXcgVjMoMCwgNjQsIDApLCBtYXg6IG5ldyBWMygxMCwgNzQsIDEwKSB9O1xyXG4gICAgICogVHJpZ2dlck1hbmFnZXIucmVtb3ZlUnVudGltZVZvbHVtZSh2b2x1bWUpO1xyXG4gICAgICogYGBgXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgcmVtb3ZlUnVudGltZVZvbHVtZSh2b2x1bWU6IFZvbHVtZSwgZGltZW5zaW9uPzogRGltZW5zaW9uKSB7XHJcbiAgICAgICAgLy8gTm9ybWFsaXplIHRoZSB2b2x1bWUgdG8gbWF0Y2ggdGhlIG5vcm1hbGl6ZWQgSUQgdXNlZCBkdXJpbmcgcmVnaXN0cmF0aW9uXHJcbiAgICAgICAgY29uc3Qgbm9ybWFsaXplZFZvbHVtZSA9IHZvbHVtZS5jbG9uZSgpLmNsZWFuKCk7XHJcblxyXG4gICAgICAgIC8vIEluY2x1ZGUgZGltZW5zaW9uIGluIElEIHRvIG1hdGNoIHJlZ2lzdHJhdGlvblxyXG4gICAgICAgIGNvbnN0IGRpbWVuc2lvbklkID0gZGltZW5zaW9uPy5pZCA/PyBcIm1pbmVjcmFmdDpvdmVyd29ybGRcIjtcclxuICAgICAgICBjb25zdCBpZEZyb21Wb2x1bWUgPSBgJHtkaW1lbnNpb25JZH06JHtub3JtYWxpemVkVm9sdW1lLnRvU3RyaW5nKCl9YDtcclxuXHJcbiAgICAgICAgaWYgKCF0aGlzLnJ1bnRpbWVWb2x1bWVUcmlnZ2Vycy5kZWxldGUoaWRGcm9tVm9sdW1lKSkge1xyXG4gICAgICAgICAgICBjb25zb2xlLndhcm4oYFtUcmlnZ2VyTWFuYWdlcl0gTm8gcnVudGltZSB2b2x1bWUgZm91bmQgYXQgJHtpZEZyb21Wb2x1bWV9IHRvIHJlbW92ZS5gKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBHZXRzIGEgc3BlY2lmaWMgc3RhdGljIHRyaWdnZXIgaW5zdGFuY2UgYnkgaXRzIGtleS5cclxuICAgICAqIEBwYXJhbSB0cmlnZ2VyIC0gVGhlIHRyaWdnZXIga2V5IGZyb20gU3RhdGljVHJpZ2dlcnNcclxuICAgICAqIEByZXR1cm5zIFRoZSB0cmlnZ2VyIGluc3RhbmNlXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgZ2V0U3RhdGljVHJpZ2dlcjxUIGV4dGVuZHMga2V5b2YgdHlwZW9mIFN0YXRpY1RyaWdnZXJzPih0cmlnZ2VyOiBUKSB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuc3RhdGljVHJpZ2dlcnMuZ2V0KHRyaWdnZXIpIGFzIEluc3RhbmNlVHlwZTwodHlwZW9mIFN0YXRpY1RyaWdnZXJzKVtUXT47XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBHZXRzIGFsbCByZWdpc3RlcmVkIHN0YXRpYyB2b2x1bWUgdHJpZ2dlcnMuXHJcbiAgICAgKiBAcmV0dXJucyBBIHNldCBvZiBhbGwgc3RhdGljIHZvbHVtZSB0cmlnZ2Vyc1xyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGdldFN0YXRpY1ZvbHVtZVRyaWdnZXJzKCkge1xyXG4gICAgICAgIHJldHVybiB0aGlzLnN0YXRpY1ZvbHVtZVRyaWdnZXJzO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogR2V0cyBhbGwgcmVnaXN0ZXJlZCBydW50aW1lIHZvbHVtZSB0cmlnZ2Vycy5cclxuICAgICAqIEByZXR1cm5zIEFuIGFycmF5IG9mIGFsbCBydW50aW1lIHZvbHVtZSB0cmlnZ2Vyc1xyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGdldFJ1bnRpbWVWb2x1bWVUcmlnZ2VycygpIHtcclxuICAgICAgICByZXR1cm4gWy4uLnRoaXMucnVudGltZVZvbHVtZVRyaWdnZXJzLnZhbHVlcygpXTtcclxuICAgIH1cclxufVxyXG4iXSwibmFtZXMiOlsic3lzdGVtIiwiVGlja3NQZXJTZWNvbmQiLCJTdGF0aWNUcmlnZ2VycyIsIlRyaWdnZXJWb2x1bWVEcmF3ZXIiLCJUcmlnZ2VyTWFuYWdlciIsInJlZ2lzdGVyVm9sdW1lIiwidm9sdW1lIiwiZW50ZXJDYWxsYmFjayIsImxlYXZlQ2FsbGJhY2siLCJub3JtYWxpemVkVm9sdW1lIiwiY2xvbmUiLCJjbGVhbiIsInN0YXRpY1ZvbHVtZVRyaWdnZXJzIiwiYWRkIiwicGxheWVycyIsIlNldCIsIlRyaWdnZXJzIiwiVHJpZ2dlckFycmF5IiwiT2JqZWN0IiwidmFsdWVzIiwiaW5pdCIsInRyaWdnZXJLZXkiLCJUcmlnZ2VyIiwic3RhdGljVHJpZ2dlcnMiLCJzZXQiLCJwcm9jZXNzU3RhdGljVHJpZ2dlcnMiLCJwcm9jZXNzUnVudGltZVRyaWdnZXJzIiwicnVuSW50ZXJ2YWwiLCJjbGVhblJ1bnRpbWVWb2x1bWVUcmlnZ2VyUGxheWVycyIsIkRlYnVnVGltZXIiLCJjb3VudFN0YXJ0IiwiUGxheWVyc0NhY2hlIiwid2lnZ2xlcm9vbSIsImNsZWFuU3RhdGljVm9sdW1lVHJpZ2dlclBsYXllcnMiLCJ0cmlnZ2VyIiwiZGltZW5zaW9uIiwicGxheWVyc0luVm9sdW1lIiwicGxheWVyIiwiaW5Db3JyZWN0RGltZW5zaW9uIiwiaWQiLCJpc0luVm9sdW1lIiwiY29udGFpbnMiLCJsb2NhdGlvbiIsIndhc0luVm9sdW1lIiwiaGFzIiwiZW50aXR5IiwiZGVsZXRlIiwiY291bnRFbmQiLCJpc0NhY2hlZFBsYXllciIsInJ1bnRpbWVWb2x1bWVUcmlnZ2VycyIsInZvbHVtZVRyaWdnZXIiLCJoYXNFbnRlcmVkVm9sdW1lIiwidm9sdW1lSWQiLCJwZXJzaXN0ZW50IiwiZW50ZXJlZFZvbHVtZXMiLCJFbnRpdHlTdG9yZSIsImdldCIsInRlbXBvcmFyeSIsImluY2x1ZGVzIiwiYWRkRW50ZXJlZFZvbHVtZSIsInB1c2hUb0FycmF5IiwicmVnaXN0ZXJSdW50aW1lVm9sdW1lIiwidG9IYXNoIiwiZGltZW5zaW9uSWQiLCJpZEZyb21Wb2x1bWUiLCJ0b1N0cmluZyIsImNvbnNvbGUiLCJ3YXJuIiwicmVtb3ZlUnVudGltZVZvbHVtZSIsImdldFN0YXRpY1RyaWdnZXIiLCJnZXRTdGF0aWNWb2x1bWVUcmlnZ2VycyIsImdldFJ1bnRpbWVWb2x1bWVUcmlnZ2VycyIsIk1hcCJdLCJtYXBwaW5ncyI6IkFBQUEsU0FBNEJBLE1BQU0sRUFBRUMsY0FBYyxRQUFRLG9CQUFvQjtBQUc5RSxPQUFPQyxvQkFBb0IsMEJBQTBCO0FBQ3JELE9BQU9DLHlCQUF5Qix3QkFBd0I7QUF5RXpDLE1BQU1DO0lBUWpCOzs7OztLQUtD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