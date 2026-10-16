import { system } from "@minecraft/server";
import TriggerManager from "./TriggerManager";
class AbstractStaticTrigger {
    /**
     * Subscribes to a world event.
     * @param type - The type of event i.e. WorldBeforeEvents, WorldAfterEvents
     * @param event - The event name
     * @param callback - The callback to execute when the event fires
     */ onWorldEvent(type, event, callback) {
        EventSubscriber.subscribe(type, event, callback);
    }
    /**
     * Registers a static volume trigger with optional trigger modes.
     * @param volumeTrigger - The volume trigger configuration
     */ onVolume(volumeTrigger) {
        let enterCallback = volumeTrigger.enterCallback;
        let leaveCallback = volumeTrigger.leaveCallback;
        if (volumeTrigger.trigger && volumeTrigger.trigger !== "always") {
            const volumeId = MathUtil.hash(volumeTrigger.volume.toString());
            enterCallback = (player, playersInVolume)=>{
                if (this.hasEnteredVolume(player, volumeId, volumeTrigger.trigger === "once")) return;
                if (volumeTrigger.enterCallback) volumeTrigger.enterCallback(player, playersInVolume);
            };
            leaveCallback = (player, playersInVolume)=>{
                if (this.hasEnteredVolume(player, volumeId, volumeTrigger.trigger === "once")) return;
                if (volumeTrigger.leaveCallback) volumeTrigger.leaveCallback(player, playersInVolume);
                this.addEnteredVolume(player, volumeId, volumeTrigger.trigger === "once");
            };
        }
        TriggerManager.registerVolume(volumeTrigger.volume, enterCallback, leaveCallback);
    }
    hasEnteredVolume(player, volumeId, persistent = false) {
        const enteredVolumes = persistent ? EntityStore.get(player, "EnteredVolumes") : EntityStore.temporary.get(player, "EnteredVolumes");
        return enteredVolumes.includes(volumeId);
    }
    addEnteredVolume(player, volumeId, persistent = false) {
        if (persistent) EntityStore.pushToArray(player, "EnteredVolumes", volumeId);
        else EntityStore.temporary.pushToArray(player, "EnteredVolumes", volumeId);
    }
    /**
     * Subscribes to a custom game event.
     * @param event - The custom event name
     * @param callback - The callback to execute when the event fires
     */ onCustomEvent(event, callback) {
        CustomEvents.subscribe(event, callback);
    }
    /**
     * Runs a callback function at a specified interval, optionally conditioned by a predicate.
     * @param callback - The function to execute at each interval.
     * @param interval - The time interval (in ticks or milliseconds, depending on the system) between each callback execution.
     * @param condition - An optional function that returns a boolean; if provided, the callback is only executed when this condition returns true.
     * @returns The identifier for the interval runner, which can be used to clear or manage the interval later.
     */ runInterval(callback, interval, condition) {
        const newCallback = condition ? ()=>condition() ? callback() : null : callback;
        const runnerId = system.runInterval(newCallback, interval);
        return runnerId;
    }
    /**
     * Schedules a callback function to be executed after a specified delay.
     * Optionally, the callback will only execute if a provided condition returns true at the time of execution.
     * @param callback - The function to execute after the delay.
     * @param delay - The delay in ticks before executing the callback.
     * @param condition - An optional function that returns a boolean; if provided, the callback is only executed if this returns true.
     * @returns The identifier of the scheduled timeout runner.
     */ runTimeout(callback, delay, condition) {
        const newCallback = condition ? ()=>condition() ? callback() : null : callback;
        const runnerId = system.runTimeout(newCallback, delay);
        return runnerId;
    }
    /**
     * Plays a sound effect after a delay, only if the player is still valid.
     * @param player - The player to play the sound for
     * @param sound - The sound object with a play method
     * @param delay - The delay in ticks before playing
     */ delayedSFX(player, sound, delay) {
        this.runTimeout(()=>{
            sound.play(player);
        }, delay, this.isValidConditional(player));
    }
    /**
     * Schedules a series of callbacks to be executed at specified times, optionally conditioned by a predicate.
     * @param timeline - An object where each key is a time (in ticks) and each value is a callback function to execute at that time. Time 0 executes immediately.
     * @param condition - An optional function that returns a boolean; if provided, the callback will only be executed if this condition is true at the scheduled time.
     * @returns A promise that resolves once the timeline has completed.
     * @example
     * await this.runTimeline({
     *   0: () => this.entity.sendMessage("Immediately!"),
     *   1: () => this.entity.sendMessage("First tick!"),
     *   20: () => this.entity.sendMessage("After 1 second!"),
     *   100: () => this.entity.sendMessage("After 5 seconds!"),
     * });
     */ async runTimeline(timeline, condition) {
        Object.entries(timeline).forEach(([time, callback])=>{
            const delay = Number(time);
            if (delay === 0) {
                if (condition && !condition()) return;
                callback();
                return;
            }
            this.runTimeout(()=>callback(), delay, condition);
        });
        // Wait for the longest timeout to complete before resolving the promise
        await new Promise((resolve)=>{
            const duration = Math.max(...Object.keys(timeline).map((k)=>Number(k))) + 1;
            this.runTimeout(()=>resolve(), duration);
        });
    }
    /**
     * Triggers a camera shake effect for all players.
     * @param intensity - The intensity of the shake
     * @param duration - The duration in seconds
     * @param type - The type of shake ('positional' or 'rotational')
     */ cameraShake(intensity, duration, type) {
        overworld.runCommand(`camerashake add @a ${intensity} ${duration} ${type}`);
    }
    /**
     * Creates a condition function that checks if an entity is still valid.
     * @param entity - The entity to check
     * @returns A function that returns true if the entity is valid
     */ isValidConditional(entity) {
        return ()=>entity.isValid;
    }
    /**
     * Teleports a player with a camera fade effect.
     * @param player - The player to teleport
     * @param location - The destination location
     * @param rotation - Optional rotation at destination
     */ tpWithFade(player, location, rotation) {
        player.addEffect("slowness", 0.7 * 20, {
            amplifier: 10,
            showParticles: false
        });
        player.camera.fade({
            fadeTime: {
                fadeInTime: 0.2,
                fadeOutTime: 0.2,
                holdTime: 0.5
            }
        });
        this.runTimeout(()=>{
            if (!player.isValid) return;
            const ridingComponent = player.getComponent("minecraft:riding");
            if (ridingComponent !== undefined) ridingComponent.entityRidingOn.teleport(location, {
                rotation
            });
            else player.teleport(location, {
                rotation
            });
        }, 5);
    }
    /**
     * Applies a camera fade effect to a player.
     * @param player - The player to apply the fade to
     * @param fadeIn - Fade in duration in seconds
     * @param hold - Hold duration in seconds
     * @param fadeOut - Fade out duration in seconds
     */ cameraFade(player, fadeIn, hold, fadeOut) {
        player.camera.fade({
            fadeTime: {
                fadeInTime: fadeIn,
                fadeOutTime: fadeOut,
                holdTime: hold
            }
        });
    }
    constructor(){
        system.run(()=>{
            this.init();
        });
    }
}
AbstractStaticTrigger.EntityStore = {};
AbstractStaticTrigger.EntityStoreTemporary = {};
AbstractStaticTrigger.WorldStore = {};
export { AbstractStaticTrigger as default };

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIlN0YXRpY1RyaWdnZXJBYnN0cmFjdC50cyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBFbnRpdHksIEVudGl0eVJpZGluZ0NvbXBvbmVudCwgUGxheWVyLCBzeXN0ZW0gfSBmcm9tIFwiQG1pbmVjcmFmdC9zZXJ2ZXJcIjtcclxuaW1wb3J0IFYyIGZyb20gXCJIZWxwZXJzL1ZlY3RvcnMvVjJcIjtcclxuaW1wb3J0IFYzIGZyb20gXCJIZWxwZXJzL1ZlY3RvcnMvVjNcIjtcclxuaW1wb3J0IFZvbHVtZSBmcm9tIFwiSGVscGVycy9WZWN0b3JzL1ZvbHVtZVwiO1xyXG5pbXBvcnQgeyBFdmVudENhbGxiYWNrLCBFdmVudENsYXNzTmFtZSwgRXZlbnROYW1lIH0gZnJvbSBcIlN5c3RlbXMvQ3VzdG9tRXZlbnRzL0V2ZW50U3Vic2NyaWJlclwiO1xyXG5pbXBvcnQgeyBDdXN0b21FdmVudFR5cGVzIH0gZnJvbSBcIlR5cGluZy9UeXBlcy9DdXN0b21FdmVudHNcIjtcclxuaW1wb3J0IFRyaWdnZXJNYW5hZ2VyIGZyb20gXCIuL1RyaWdnZXJNYW5hZ2VyXCI7XHJcblxyXG5pbnRlcmZhY2UgVm9sdW1lVHJpZ2dlciB7XHJcbiAgICB2b2x1bWU6IFZvbHVtZTtcclxuICAgIHRyaWdnZXI/OiBcImFsd2F5c1wiIHwgXCJvbmNlXCIgfCBcInNlc3Npb25cIjtcclxuICAgIGVudGVyQ2FsbGJhY2s/KHBsYXllcjogUGxheWVyLCBwbGF5ZXJzSW5Wb2x1bWU6IFBsYXllcltdKTogdm9pZDtcclxuICAgIGxlYXZlQ2FsbGJhY2s/KHBsYXllcjogUGxheWVyLCBwbGF5ZXJzSW5Wb2x1bWU6IFBsYXllcltdKTogdm9pZDtcclxufVxyXG5cclxuZXhwb3J0IGRlZmF1bHQgYWJzdHJhY3QgY2xhc3MgQWJzdHJhY3RTdGF0aWNUcmlnZ2VyIHtcclxuICAgIHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgRXZlbnRzOiBvYmplY3Q7XHJcbiAgICBwdWJsaWMgc3RhdGljIHJlYWRvbmx5IEVudGl0eVN0b3JlID0ge307XHJcbiAgICBwdWJsaWMgc3RhdGljIHJlYWRvbmx5IEVudGl0eVN0b3JlVGVtcG9yYXJ5ID0ge307XHJcbiAgICBwdWJsaWMgc3RhdGljIHJlYWRvbmx5IFdvcmxkU3RvcmUgPSB7fTtcclxuXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IoKSB7XHJcbiAgICAgICAgc3lzdGVtLnJ1bigoKSA9PiB7XHJcbiAgICAgICAgICAgIHRoaXMuaW5pdCgpO1xyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogU3Vic2NyaWJlcyB0byBhIHdvcmxkIGV2ZW50LlxyXG4gICAgICogQHBhcmFtIHR5cGUgLSBUaGUgdHlwZSBvZiBldmVudCBpLmUuIFdvcmxkQmVmb3JlRXZlbnRzLCBXb3JsZEFmdGVyRXZlbnRzXHJcbiAgICAgKiBAcGFyYW0gZXZlbnQgLSBUaGUgZXZlbnQgbmFtZVxyXG4gICAgICogQHBhcmFtIGNhbGxiYWNrIC0gVGhlIGNhbGxiYWNrIHRvIGV4ZWN1dGUgd2hlbiB0aGUgZXZlbnQgZmlyZXNcclxuICAgICAqL1xyXG5cclxuICAgIHByb3RlY3RlZCBvbldvcmxkRXZlbnQ8Q2xhc3NOYW1lIGV4dGVuZHMgRXZlbnRDbGFzc05hbWUsIE5hbWUgZXh0ZW5kcyBFdmVudE5hbWU8Q2xhc3NOYW1lPj4oXHJcbiAgICAgICAgdHlwZTogQ2xhc3NOYW1lLFxyXG4gICAgICAgIGV2ZW50OiBOYW1lLFxyXG4gICAgICAgIGNhbGxiYWNrOiBFdmVudENhbGxiYWNrPENsYXNzTmFtZSwgTmFtZT5cclxuICAgICkge1xyXG4gICAgICAgIEV2ZW50U3Vic2NyaWJlci5zdWJzY3JpYmUodHlwZSwgZXZlbnQsIGNhbGxiYWNrKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFJlZ2lzdGVycyBhIHN0YXRpYyB2b2x1bWUgdHJpZ2dlciB3aXRoIG9wdGlvbmFsIHRyaWdnZXIgbW9kZXMuXHJcbiAgICAgKiBAcGFyYW0gdm9sdW1lVHJpZ2dlciAtIFRoZSB2b2x1bWUgdHJpZ2dlciBjb25maWd1cmF0aW9uXHJcbiAgICAgKi9cclxuICAgIHByb3RlY3RlZCBvblZvbHVtZSh2b2x1bWVUcmlnZ2VyOiBWb2x1bWVUcmlnZ2VyKSB7XHJcbiAgICAgICAgbGV0IGVudGVyQ2FsbGJhY2sgPSB2b2x1bWVUcmlnZ2VyLmVudGVyQ2FsbGJhY2s7XHJcbiAgICAgICAgbGV0IGxlYXZlQ2FsbGJhY2sgPSB2b2x1bWVUcmlnZ2VyLmxlYXZlQ2FsbGJhY2s7XHJcblxyXG4gICAgICAgIGlmICh2b2x1bWVUcmlnZ2VyLnRyaWdnZXIgJiYgdm9sdW1lVHJpZ2dlci50cmlnZ2VyICE9PSBcImFsd2F5c1wiKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHZvbHVtZUlkID0gTWF0aFV0aWwuaGFzaCh2b2x1bWVUcmlnZ2VyLnZvbHVtZS50b1N0cmluZygpKTtcclxuICAgICAgICAgICAgZW50ZXJDYWxsYmFjayA9IChwbGF5ZXIsIHBsYXllcnNJblZvbHVtZSkgPT4ge1xyXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuaGFzRW50ZXJlZFZvbHVtZShwbGF5ZXIsIHZvbHVtZUlkLCB2b2x1bWVUcmlnZ2VyLnRyaWdnZXIgPT09IFwib25jZVwiKSkgcmV0dXJuO1xyXG4gICAgICAgICAgICAgICAgaWYgKHZvbHVtZVRyaWdnZXIuZW50ZXJDYWxsYmFjaykgdm9sdW1lVHJpZ2dlci5lbnRlckNhbGxiYWNrKHBsYXllciwgcGxheWVyc0luVm9sdW1lKTtcclxuICAgICAgICAgICAgfTtcclxuXHJcbiAgICAgICAgICAgIGxlYXZlQ2FsbGJhY2sgPSAocGxheWVyLCBwbGF5ZXJzSW5Wb2x1bWUpID0+IHtcclxuICAgICAgICAgICAgICAgIGlmICh0aGlzLmhhc0VudGVyZWRWb2x1bWUocGxheWVyLCB2b2x1bWVJZCwgdm9sdW1lVHJpZ2dlci50cmlnZ2VyID09PSBcIm9uY2VcIikpIHJldHVybjtcclxuICAgICAgICAgICAgICAgIGlmICh2b2x1bWVUcmlnZ2VyLmxlYXZlQ2FsbGJhY2spIHZvbHVtZVRyaWdnZXIubGVhdmVDYWxsYmFjayhwbGF5ZXIsIHBsYXllcnNJblZvbHVtZSk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmFkZEVudGVyZWRWb2x1bWUocGxheWVyLCB2b2x1bWVJZCwgdm9sdW1lVHJpZ2dlci50cmlnZ2VyID09PSBcIm9uY2VcIik7XHJcbiAgICAgICAgICAgIH07XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBUcmlnZ2VyTWFuYWdlci5yZWdpc3RlclZvbHVtZSh2b2x1bWVUcmlnZ2VyLnZvbHVtZSwgZW50ZXJDYWxsYmFjaywgbGVhdmVDYWxsYmFjayk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBoYXNFbnRlcmVkVm9sdW1lKHBsYXllcjogUGxheWVyLCB2b2x1bWVJZDogbnVtYmVyLCBwZXJzaXN0ZW50ID0gZmFsc2UpIHtcclxuICAgICAgICBjb25zdCBlbnRlcmVkVm9sdW1lcyA9IHBlcnNpc3RlbnQgPyBFbnRpdHlTdG9yZS5nZXQocGxheWVyLCBcIkVudGVyZWRWb2x1bWVzXCIpIDogRW50aXR5U3RvcmUudGVtcG9yYXJ5LmdldChwbGF5ZXIsIFwiRW50ZXJlZFZvbHVtZXNcIik7XHJcblxyXG4gICAgICAgIHJldHVybiBlbnRlcmVkVm9sdW1lcy5pbmNsdWRlcyh2b2x1bWVJZCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBhZGRFbnRlcmVkVm9sdW1lKHBsYXllcjogUGxheWVyLCB2b2x1bWVJZDogbnVtYmVyLCBwZXJzaXN0ZW50ID0gZmFsc2UpIHtcclxuICAgICAgICBpZiAocGVyc2lzdGVudCkgRW50aXR5U3RvcmUucHVzaFRvQXJyYXkocGxheWVyLCBcIkVudGVyZWRWb2x1bWVzXCIsIHZvbHVtZUlkKTtcclxuICAgICAgICBlbHNlIEVudGl0eVN0b3JlLnRlbXBvcmFyeS5wdXNoVG9BcnJheShwbGF5ZXIsIFwiRW50ZXJlZFZvbHVtZXNcIiwgdm9sdW1lSWQpO1xyXG4gICAgfVxyXG5cclxuICAgIHB1YmxpYyBhYnN0cmFjdCBpbml0KCk6IHZvaWQ7XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBTdWJzY3JpYmVzIHRvIGEgY3VzdG9tIGdhbWUgZXZlbnQuXHJcbiAgICAgKiBAcGFyYW0gZXZlbnQgLSBUaGUgY3VzdG9tIGV2ZW50IG5hbWVcclxuICAgICAqIEBwYXJhbSBjYWxsYmFjayAtIFRoZSBjYWxsYmFjayB0byBleGVjdXRlIHdoZW4gdGhlIGV2ZW50IGZpcmVzXHJcbiAgICAgKi9cclxuICAgIHByb3RlY3RlZCBvbkN1c3RvbUV2ZW50PEN1c3RvbUV2ZW50IGV4dGVuZHMga2V5b2YgQ3VzdG9tRXZlbnRUeXBlcz4oXHJcbiAgICAgICAgZXZlbnQ6IEN1c3RvbUV2ZW50LFxyXG4gICAgICAgIGNhbGxiYWNrOiAoLi4uYXJnczogQ3VzdG9tRXZlbnRUeXBlc1tDdXN0b21FdmVudF0pID0+IHZvaWRcclxuICAgICkge1xyXG4gICAgICAgIEN1c3RvbUV2ZW50cy5zdWJzY3JpYmUoZXZlbnQsIGNhbGxiYWNrKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFJ1bnMgYSBjYWxsYmFjayBmdW5jdGlvbiBhdCBhIHNwZWNpZmllZCBpbnRlcnZhbCwgb3B0aW9uYWxseSBjb25kaXRpb25lZCBieSBhIHByZWRpY2F0ZS5cclxuICAgICAqIEBwYXJhbSBjYWxsYmFjayAtIFRoZSBmdW5jdGlvbiB0byBleGVjdXRlIGF0IGVhY2ggaW50ZXJ2YWwuXHJcbiAgICAgKiBAcGFyYW0gaW50ZXJ2YWwgLSBUaGUgdGltZSBpbnRlcnZhbCAoaW4gdGlja3Mgb3IgbWlsbGlzZWNvbmRzLCBkZXBlbmRpbmcgb24gdGhlIHN5c3RlbSkgYmV0d2VlbiBlYWNoIGNhbGxiYWNrIGV4ZWN1dGlvbi5cclxuICAgICAqIEBwYXJhbSBjb25kaXRpb24gLSBBbiBvcHRpb25hbCBmdW5jdGlvbiB0aGF0IHJldHVybnMgYSBib29sZWFuOyBpZiBwcm92aWRlZCwgdGhlIGNhbGxiYWNrIGlzIG9ubHkgZXhlY3V0ZWQgd2hlbiB0aGlzIGNvbmRpdGlvbiByZXR1cm5zIHRydWUuXHJcbiAgICAgKiBAcmV0dXJucyBUaGUgaWRlbnRpZmllciBmb3IgdGhlIGludGVydmFsIHJ1bm5lciwgd2hpY2ggY2FuIGJlIHVzZWQgdG8gY2xlYXIgb3IgbWFuYWdlIHRoZSBpbnRlcnZhbCBsYXRlci5cclxuICAgICAqL1xyXG4gICAgcHJvdGVjdGVkIHJ1bkludGVydmFsKGNhbGxiYWNrOiAoKSA9PiB2b2lkLCBpbnRlcnZhbDogbnVtYmVyLCBjb25kaXRpb24/OiAoKSA9PiBib29sZWFuKTogbnVtYmVyIHtcclxuICAgICAgICBjb25zdCBuZXdDYWxsYmFjayA9IGNvbmRpdGlvbiA/ICgpID0+IChjb25kaXRpb24oKSA/IGNhbGxiYWNrKCkgOiBudWxsKSA6IGNhbGxiYWNrO1xyXG4gICAgICAgIGNvbnN0IHJ1bm5lcklkID0gc3lzdGVtLnJ1bkludGVydmFsKG5ld0NhbGxiYWNrLCBpbnRlcnZhbCk7XHJcbiAgICAgICAgcmV0dXJuIHJ1bm5lcklkO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogU2NoZWR1bGVzIGEgY2FsbGJhY2sgZnVuY3Rpb24gdG8gYmUgZXhlY3V0ZWQgYWZ0ZXIgYSBzcGVjaWZpZWQgZGVsYXkuXHJcbiAgICAgKiBPcHRpb25hbGx5LCB0aGUgY2FsbGJhY2sgd2lsbCBvbmx5IGV4ZWN1dGUgaWYgYSBwcm92aWRlZCBjb25kaXRpb24gcmV0dXJucyB0cnVlIGF0IHRoZSB0aW1lIG9mIGV4ZWN1dGlvbi5cclxuICAgICAqIEBwYXJhbSBjYWxsYmFjayAtIFRoZSBmdW5jdGlvbiB0byBleGVjdXRlIGFmdGVyIHRoZSBkZWxheS5cclxuICAgICAqIEBwYXJhbSBkZWxheSAtIFRoZSBkZWxheSBpbiB0aWNrcyBiZWZvcmUgZXhlY3V0aW5nIHRoZSBjYWxsYmFjay5cclxuICAgICAqIEBwYXJhbSBjb25kaXRpb24gLSBBbiBvcHRpb25hbCBmdW5jdGlvbiB0aGF0IHJldHVybnMgYSBib29sZWFuOyBpZiBwcm92aWRlZCwgdGhlIGNhbGxiYWNrIGlzIG9ubHkgZXhlY3V0ZWQgaWYgdGhpcyByZXR1cm5zIHRydWUuXHJcbiAgICAgKiBAcmV0dXJucyBUaGUgaWRlbnRpZmllciBvZiB0aGUgc2NoZWR1bGVkIHRpbWVvdXQgcnVubmVyLlxyXG4gICAgICovXHJcbiAgICBwcm90ZWN0ZWQgcnVuVGltZW91dChjYWxsYmFjazogKCkgPT4gdm9pZCwgZGVsYXk6IG51bWJlciwgY29uZGl0aW9uPzogKCkgPT4gYm9vbGVhbik6IG51bWJlciB7XHJcbiAgICAgICAgY29uc3QgbmV3Q2FsbGJhY2sgPSBjb25kaXRpb24gPyAoKSA9PiAoY29uZGl0aW9uKCkgPyBjYWxsYmFjaygpIDogbnVsbCkgOiBjYWxsYmFjaztcclxuICAgICAgICBjb25zdCBydW5uZXJJZCA9IHN5c3RlbS5ydW5UaW1lb3V0KG5ld0NhbGxiYWNrLCBkZWxheSk7XHJcbiAgICAgICAgcmV0dXJuIHJ1bm5lcklkO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogUGxheXMgYSBzb3VuZCBlZmZlY3QgYWZ0ZXIgYSBkZWxheSwgb25seSBpZiB0aGUgcGxheWVyIGlzIHN0aWxsIHZhbGlkLlxyXG4gICAgICogQHBhcmFtIHBsYXllciAtIFRoZSBwbGF5ZXIgdG8gcGxheSB0aGUgc291bmQgZm9yXHJcbiAgICAgKiBAcGFyYW0gc291bmQgLSBUaGUgc291bmQgb2JqZWN0IHdpdGggYSBwbGF5IG1ldGhvZFxyXG4gICAgICogQHBhcmFtIGRlbGF5IC0gVGhlIGRlbGF5IGluIHRpY2tzIGJlZm9yZSBwbGF5aW5nXHJcbiAgICAgKi9cclxuICAgIHByb3RlY3RlZCBkZWxheWVkU0ZYKHBsYXllcjogUGxheWVyLCBzb3VuZDogeyBwbGF5KHBsYXllcjogUGxheWVyKTogdm9pZCB9LCBkZWxheTogbnVtYmVyKSB7XHJcbiAgICAgICAgdGhpcy5ydW5UaW1lb3V0KFxyXG4gICAgICAgICAgICAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICBzb3VuZC5wbGF5KHBsYXllcik7XHJcbiAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgIGRlbGF5LFxyXG4gICAgICAgICAgICB0aGlzLmlzVmFsaWRDb25kaXRpb25hbChwbGF5ZXIpXHJcbiAgICAgICAgKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFNjaGVkdWxlcyBhIHNlcmllcyBvZiBjYWxsYmFja3MgdG8gYmUgZXhlY3V0ZWQgYXQgc3BlY2lmaWVkIHRpbWVzLCBvcHRpb25hbGx5IGNvbmRpdGlvbmVkIGJ5IGEgcHJlZGljYXRlLlxyXG4gICAgICogQHBhcmFtIHRpbWVsaW5lIC0gQW4gb2JqZWN0IHdoZXJlIGVhY2gga2V5IGlzIGEgdGltZSAoaW4gdGlja3MpIGFuZCBlYWNoIHZhbHVlIGlzIGEgY2FsbGJhY2sgZnVuY3Rpb24gdG8gZXhlY3V0ZSBhdCB0aGF0IHRpbWUuIFRpbWUgMCBleGVjdXRlcyBpbW1lZGlhdGVseS5cclxuICAgICAqIEBwYXJhbSBjb25kaXRpb24gLSBBbiBvcHRpb25hbCBmdW5jdGlvbiB0aGF0IHJldHVybnMgYSBib29sZWFuOyBpZiBwcm92aWRlZCwgdGhlIGNhbGxiYWNrIHdpbGwgb25seSBiZSBleGVjdXRlZCBpZiB0aGlzIGNvbmRpdGlvbiBpcyB0cnVlIGF0IHRoZSBzY2hlZHVsZWQgdGltZS5cclxuICAgICAqIEByZXR1cm5zIEEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIG9uY2UgdGhlIHRpbWVsaW5lIGhhcyBjb21wbGV0ZWQuXHJcbiAgICAgKiBAZXhhbXBsZVxyXG4gICAgICogYXdhaXQgdGhpcy5ydW5UaW1lbGluZSh7XHJcbiAgICAgKiAgIDA6ICgpID0+IHRoaXMuZW50aXR5LnNlbmRNZXNzYWdlKFwiSW1tZWRpYXRlbHkhXCIpLFxyXG4gICAgICogICAxOiAoKSA9PiB0aGlzLmVudGl0eS5zZW5kTWVzc2FnZShcIkZpcnN0IHRpY2shXCIpLFxyXG4gICAgICogICAyMDogKCkgPT4gdGhpcy5lbnRpdHkuc2VuZE1lc3NhZ2UoXCJBZnRlciAxIHNlY29uZCFcIiksXHJcbiAgICAgKiAgIDEwMDogKCkgPT4gdGhpcy5lbnRpdHkuc2VuZE1lc3NhZ2UoXCJBZnRlciA1IHNlY29uZHMhXCIpLFxyXG4gICAgICogfSk7XHJcbiAgICAgKi9cclxuICAgIHByb3RlY3RlZCBhc3luYyBydW5UaW1lbGluZSh0aW1lbGluZTogUmVjb3JkPG51bWJlciwgKCkgPT4gdm9pZD4sIGNvbmRpdGlvbj86ICgpID0+IGJvb2xlYW4pIHtcclxuICAgICAgICBPYmplY3QuZW50cmllcyh0aW1lbGluZSkuZm9yRWFjaCgoW3RpbWUsIGNhbGxiYWNrXSkgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBkZWxheSA9IE51bWJlcih0aW1lKTtcclxuXHJcbiAgICAgICAgICAgIGlmIChkZWxheSA9PT0gMCkge1xyXG4gICAgICAgICAgICAgICAgaWYgKGNvbmRpdGlvbiAmJiAhY29uZGl0aW9uKCkpIHJldHVybjtcclxuICAgICAgICAgICAgICAgIGNhbGxiYWNrKCk7XHJcbiAgICAgICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIHRoaXMucnVuVGltZW91dCgoKSA9PiBjYWxsYmFjaygpLCBkZWxheSwgY29uZGl0aW9uKTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgLy8gV2FpdCBmb3IgdGhlIGxvbmdlc3QgdGltZW91dCB0byBjb21wbGV0ZSBiZWZvcmUgcmVzb2x2aW5nIHRoZSBwcm9taXNlXHJcbiAgICAgICAgYXdhaXQgbmV3IFByb21pc2U8dm9pZD4oKHJlc29sdmUpID0+IHtcclxuICAgICAgICAgICAgY29uc3QgZHVyYXRpb24gPSBNYXRoLm1heCguLi5PYmplY3Qua2V5cyh0aW1lbGluZSkubWFwKChrKSA9PiBOdW1iZXIoaykpKSArIDE7XHJcbiAgICAgICAgICAgIHRoaXMucnVuVGltZW91dCgoKSA9PiByZXNvbHZlKCksIGR1cmF0aW9uKTtcclxuICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFRyaWdnZXJzIGEgY2FtZXJhIHNoYWtlIGVmZmVjdCBmb3IgYWxsIHBsYXllcnMuXHJcbiAgICAgKiBAcGFyYW0gaW50ZW5zaXR5IC0gVGhlIGludGVuc2l0eSBvZiB0aGUgc2hha2VcclxuICAgICAqIEBwYXJhbSBkdXJhdGlvbiAtIFRoZSBkdXJhdGlvbiBpbiBzZWNvbmRzXHJcbiAgICAgKiBAcGFyYW0gdHlwZSAtIFRoZSB0eXBlIG9mIHNoYWtlICgncG9zaXRpb25hbCcgb3IgJ3JvdGF0aW9uYWwnKVxyXG4gICAgICovXHJcbiAgICBwcm90ZWN0ZWQgY2FtZXJhU2hha2UoaW50ZW5zaXR5OiBudW1iZXIsIGR1cmF0aW9uOiBudW1iZXIsIHR5cGU6IFwicG9zaXRpb25hbFwiIHwgXCJyb3RhdGlvbmFsXCIpIHtcclxuICAgICAgICBvdmVyd29ybGQucnVuQ29tbWFuZChgY2FtZXJhc2hha2UgYWRkIEBhICR7aW50ZW5zaXR5fSAke2R1cmF0aW9ufSAke3R5cGV9YCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBDcmVhdGVzIGEgY29uZGl0aW9uIGZ1bmN0aW9uIHRoYXQgY2hlY2tzIGlmIGFuIGVudGl0eSBpcyBzdGlsbCB2YWxpZC5cclxuICAgICAqIEBwYXJhbSBlbnRpdHkgLSBUaGUgZW50aXR5IHRvIGNoZWNrXHJcbiAgICAgKiBAcmV0dXJucyBBIGZ1bmN0aW9uIHRoYXQgcmV0dXJucyB0cnVlIGlmIHRoZSBlbnRpdHkgaXMgdmFsaWRcclxuICAgICAqL1xyXG4gICAgcHJvdGVjdGVkIGlzVmFsaWRDb25kaXRpb25hbChlbnRpdHk6IEVudGl0eSkge1xyXG4gICAgICAgIHJldHVybiAoKSA9PiBlbnRpdHkuaXNWYWxpZDtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFRlbGVwb3J0cyBhIHBsYXllciB3aXRoIGEgY2FtZXJhIGZhZGUgZWZmZWN0LlxyXG4gICAgICogQHBhcmFtIHBsYXllciAtIFRoZSBwbGF5ZXIgdG8gdGVsZXBvcnRcclxuICAgICAqIEBwYXJhbSBsb2NhdGlvbiAtIFRoZSBkZXN0aW5hdGlvbiBsb2NhdGlvblxyXG4gICAgICogQHBhcmFtIHJvdGF0aW9uIC0gT3B0aW9uYWwgcm90YXRpb24gYXQgZGVzdGluYXRpb25cclxuICAgICAqL1xyXG4gICAgcHJvdGVjdGVkIHRwV2l0aEZhZGUocGxheWVyOiBQbGF5ZXIsIGxvY2F0aW9uOiBWMywgcm90YXRpb24/OiBWMikge1xyXG4gICAgICAgIHBsYXllci5hZGRFZmZlY3QoXCJzbG93bmVzc1wiLCAwLjcgKiAyMCwgeyBhbXBsaWZpZXI6IDEwLCBzaG93UGFydGljbGVzOiBmYWxzZSB9KTtcclxuICAgICAgICBwbGF5ZXIuY2FtZXJhLmZhZGUoeyBmYWRlVGltZTogeyBmYWRlSW5UaW1lOiAwLjIsIGZhZGVPdXRUaW1lOiAwLjIsIGhvbGRUaW1lOiAwLjUgfSB9KTtcclxuICAgICAgICB0aGlzLnJ1blRpbWVvdXQoKCkgPT4ge1xyXG4gICAgICAgICAgICBpZiAoIXBsYXllci5pc1ZhbGlkKSByZXR1cm47XHJcblxyXG4gICAgICAgICAgICBjb25zdCByaWRpbmdDb21wb25lbnQgPSBwbGF5ZXIuZ2V0Q29tcG9uZW50KFwibWluZWNyYWZ0OnJpZGluZ1wiKSBhcyBFbnRpdHlSaWRpbmdDb21wb25lbnQgfCB1bmRlZmluZWQ7XHJcbiAgICAgICAgICAgIGlmIChyaWRpbmdDb21wb25lbnQgIT09IHVuZGVmaW5lZCkgcmlkaW5nQ29tcG9uZW50LmVudGl0eVJpZGluZ09uLnRlbGVwb3J0KGxvY2F0aW9uLCB7IHJvdGF0aW9uIH0pO1xyXG4gICAgICAgICAgICBlbHNlIHBsYXllci50ZWxlcG9ydChsb2NhdGlvbiwgeyByb3RhdGlvbiB9KTtcclxuICAgICAgICB9LCA1KTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEFwcGxpZXMgYSBjYW1lcmEgZmFkZSBlZmZlY3QgdG8gYSBwbGF5ZXIuXHJcbiAgICAgKiBAcGFyYW0gcGxheWVyIC0gVGhlIHBsYXllciB0byBhcHBseSB0aGUgZmFkZSB0b1xyXG4gICAgICogQHBhcmFtIGZhZGVJbiAtIEZhZGUgaW4gZHVyYXRpb24gaW4gc2Vjb25kc1xyXG4gICAgICogQHBhcmFtIGhvbGQgLSBIb2xkIGR1cmF0aW9uIGluIHNlY29uZHNcclxuICAgICAqIEBwYXJhbSBmYWRlT3V0IC0gRmFkZSBvdXQgZHVyYXRpb24gaW4gc2Vjb25kc1xyXG4gICAgICovXHJcbiAgICBwcm90ZWN0ZWQgY2FtZXJhRmFkZShwbGF5ZXI6IFBsYXllciwgZmFkZUluOiBudW1iZXIsIGhvbGQ6IG51bWJlciwgZmFkZU91dDogbnVtYmVyKSB7XHJcbiAgICAgICAgcGxheWVyLmNhbWVyYS5mYWRlKHsgZmFkZVRpbWU6IHsgZmFkZUluVGltZTogZmFkZUluLCBmYWRlT3V0VGltZTogZmFkZU91dCwgaG9sZFRpbWU6IGhvbGQgfSB9KTtcclxuICAgIH1cclxufVxyXG4iXSwibmFtZXMiOlsic3lzdGVtIiwiVHJpZ2dlck1hbmFnZXIiLCJBYnN0cmFjdFN0YXRpY1RyaWdnZXIiLCJvbldvcmxkRXZlbnQiLCJ0eXBlIiwiZXZlbnQiLCJjYWxsYmFjayIsIkV2ZW50U3Vic2NyaWJlciIsInN1YnNjcmliZSIsIm9uVm9sdW1lIiwidm9sdW1lVHJpZ2dlciIsImVudGVyQ2FsbGJhY2siLCJsZWF2ZUNhbGxiYWNrIiwidHJpZ2dlciIsInZvbHVtZUlkIiwiTWF0aFV0aWwiLCJoYXNoIiwidm9sdW1lIiwidG9TdHJpbmciLCJwbGF5ZXIiLCJwbGF5ZXJzSW5Wb2x1bWUiLCJoYXNFbnRlcmVkVm9sdW1lIiwiYWRkRW50ZXJlZFZvbHVtZSIsInJlZ2lzdGVyVm9sdW1lIiwicGVyc2lzdGVudCIsImVudGVyZWRWb2x1bWVzIiwiRW50aXR5U3RvcmUiLCJnZXQiLCJ0ZW1wb3JhcnkiLCJpbmNsdWRlcyIsInB1c2hUb0FycmF5Iiwib25DdXN0b21FdmVudCIsIkN1c3RvbUV2ZW50cyIsInJ1bkludGVydmFsIiwiaW50ZXJ2YWwiLCJjb25kaXRpb24iLCJuZXdDYWxsYmFjayIsInJ1bm5lcklkIiwicnVuVGltZW91dCIsImRlbGF5IiwiZGVsYXllZFNGWCIsInNvdW5kIiwicGxheSIsImlzVmFsaWRDb25kaXRpb25hbCIsInJ1blRpbWVsaW5lIiwidGltZWxpbmUiLCJPYmplY3QiLCJlbnRyaWVzIiwiZm9yRWFjaCIsInRpbWUiLCJOdW1iZXIiLCJQcm9taXNlIiwicmVzb2x2ZSIsImR1cmF0aW9uIiwiTWF0aCIsIm1heCIsImtleXMiLCJtYXAiLCJrIiwiY2FtZXJhU2hha2UiLCJpbnRlbnNpdHkiLCJvdmVyd29ybGQiLCJydW5Db21tYW5kIiwiZW50aXR5IiwiaXNWYWxpZCIsInRwV2l0aEZhZGUiLCJsb2NhdGlvbiIsInJvdGF0aW9uIiwiYWRkRWZmZWN0IiwiYW1wbGlmaWVyIiwic2hvd1BhcnRpY2xlcyIsImNhbWVyYSIsImZhZGUiLCJmYWRlVGltZSIsImZhZGVJblRpbWUiLCJmYWRlT3V0VGltZSIsImhvbGRUaW1lIiwicmlkaW5nQ29tcG9uZW50IiwiZ2V0Q29tcG9uZW50IiwidW5kZWZpbmVkIiwiZW50aXR5UmlkaW5nT24iLCJ0ZWxlcG9ydCIsImNhbWVyYUZhZGUiLCJmYWRlSW4iLCJob2xkIiwiZmFkZU91dCIsInJ1biIsImluaXQiLCJFbnRpdHlTdG9yZVRlbXBvcmFyeSIsIldvcmxkU3RvcmUiXSwibWFwcGluZ3MiOiJBQUFBLFNBQWdEQSxNQUFNLFFBQVEsb0JBQW9CO0FBTWxGLE9BQU9DLG9CQUFvQixtQkFBbUI7QUFTL0IsTUFBZUM7SUFZMUI7Ozs7O0tBS0MsR0FFRCxBQUFVQyxhQUNOQyxJQUFlLEVBQ2ZDLEtBQVcsRUFDWEMsUUFBd0MsRUFDMUM7UUFDRUMsZ0JBQWdCQyxTQUFTLENBQUNKLE1BQU1DLE9BQU9DO0lBQzNDO0lBRUE7OztLQUdDLEdBQ0QsQUFBVUcsU0FBU0MsYUFBNEIsRUFBRTtRQUM3QyxJQUFJQyxnQkFBZ0JELGNBQWNDLGFBQWE7UUFDL0MsSUFBSUMsZ0JBQWdC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