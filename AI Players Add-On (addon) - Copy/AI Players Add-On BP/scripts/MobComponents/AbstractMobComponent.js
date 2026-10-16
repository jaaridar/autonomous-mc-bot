import { system } from "@minecraft/server";
class AbstractMobComponent {
    /**
     * Called internally to handle the recurring process loop for this component.
     * Tracks performance and manages the process interval and stop flag.
     * Override `process()` in subclasses for custom logic.
     * Not intended to be called directly.
     */ preProcess() {
        if (this.isDestroyed) return;
        DebugTimer.countStart(`MB.preProcess.${this.constructor.name}`);
        try {
            if (this.entity.isValid) this.process();
        } catch (error) {
            const message = `[${this.constructor.name}] Processing Error (${this.entity.id}, ${this.entity.typeId}):`;
            if (error instanceof Error) console.error(message, "\n", error, "\n", error.stack);
            else console.error(message, error);
        }
        if (this.processInterval !== null) {
            this.runnerId = system.runTimeout(()=>this.preProcess(), this.processInterval);
        }
        DebugTimer.countEnd();
    }
    /**
     * Subscribes to a world event of a specific type and event name, and registers a callback to be invoked when the event occurs.
     * @template ClassName - The type of the event class.
     * @template Name - The name of the event, constrained by the event class.
     * @param type - The class of the event to subscribe to.
     * @param callback - The function to be called when the event is triggered.
     * @param event - The specific event name to listen for.
     * * @param options - Optional filter/options object for the event subscription.
     * @protected
     */ onWorldEvent(type, event, callback, options) {
        this.worldSubscriptions.push([
            type,
            event,
            EventSubscriber.subscribe(type, event, callback, options),
            options
        ]);
    }
    /**
     * Subscribes to a specified game event and registers a callback to be invoked when the event occurs.
     * The subscription is tracked internally for later cleanup.
     * @template GameEvent - The key of the event in the `GameEvents` interface.
     * @param event - The name of the game event to subscribe to.
     * @param callback - The function to call when the event is triggered. Receives the event arguments as parameters.
     */ onGameEvent(event, callback) {
        this.gameSubscriptions.push([
            event,
            callback
        ]);
        CustomEvents.subscribe(event, callback);
    }
    /**
     * Runs a callback function at a specified interval, optionally conditioned by a predicate.
     * @param callback - The function to execute at each interval.
     * @param interval - The time interval (in ticks or milliseconds, depending on the system) between each callback execution.
     * @param condition - An optional function that returns a boolean; if provided, the callback is only executed when this condition returns true.
     * @returns The identifier for the interval runner, which can be used to clear or manage the interval later.
     */ interval(callback, interval, condition) {
        const newCallback = condition ? ()=>condition() ? callback() : null : callback;
        const runnerId = system.runInterval(newCallback, interval);
        this.runnerIds.push(runnerId);
        return runnerId;
    }
    /**
     * Schedules a callback function to be executed after a specified delay.
     * Optionally, the callback will only execute if a provided condition returns true at the time of execution.
     * @param callback - The function to execute after the delay.
     * @param delay - The delay in ticks before executing the callback.
     * @param condition - An optional function that returns a boolean; if provided, the callback is only executed if this returns true.
     * @returns The identifier of the scheduled timeout runner.
     */ timeout(callback, delay, condition) {
        const newCallback = condition ? ()=>condition() ? callback() : null : callback;
        const runnerId = system.runTimeout(newCallback, delay);
        this.runnerIds.push(runnerId);
        return runnerId;
    }
    /**
     * Schedules a series of callbacks to be executed at specified times, optionally conditioned by a predicate.
     * @param timeline - An object where each key is a time (in ticks) and each value is a callback function to execute at that time.
     * @param condition - An optional function that returns a boolean; if provided, the callback will only be executed if this condition is true at the scheduled time.
     * @returns A promise that resolves once the timeline has completed.
     * @example
     * this.timeline({
     *   1: () => this.entity.send_message("First tick!"),
     *   20: () => this.entity.send_message("After 1 second!"),
     *   100: () => this.entity.send_message("After 5 seconds!")
     * });
     */ async timeline(timeline, condition) {
        Object.entries(timeline).forEach(([time, callback])=>{
            // Multiplying by 1 below to fix a type conversion error, don't ask why it does not work without.
            this.timeout(()=>callback(), time * 1, condition);
        });
        await new Promise((resolve)=>{
            // Find the duration of the timeline through longest time key
            const duration = Math.max(...Object.keys(timeline).map((k)=>Number(k))) + 1;
            this.timeout(()=>resolve(), duration);
        });
    }
    /**
     * Processes the component's logic.
     * This method is intended to be overridden by subclasses to implement
     * specific processing behavior for the mob component. By default, it performs no action.
     */ process() {}
    /**
     * Determines whether the current tick, offset by this component's internal ID, is a multiple of the given number.
     * @param n - The interval to check against (must be a positive integer).
     * @returns `true` if the sum of the current tick and this component's internal ID is divisible by `n`, otherwise `false`.
     */ isCurrentTickNth(n) {
        const timeStampt = Main.currentTick + this.intId;
        return timeStampt % n === 0;
    }
    /**
     * Cleans up all resources and subscriptions associated with this component.
     * - Unsubscribes from all world and game events.
     * - Clears all scheduled runner tasks.
     * - Resets the main runner ID to null.
     * This method should be called when the component is no longer needed to prevent memory leaks and unintended behavior.
     */ destroy() {
        this.worldSubscriptions.forEach(([type, event, id, options])=>{
            EventSubscriber.unsubscribe(type, event, id, options);
        });
        this.gameSubscriptions.forEach(([event, callback])=>{
            CustomEvents.unsubscribe(event, callback);
        });
        this.runnerIds.forEach((runnerId)=>system.clearRun(runnerId));
        if (typeof this.runnerId === "number") system.clearRun(this.runnerId);
        this.runnerId = null;
        this.isDestroyed = true;
    }
    constructor(entity, processInterval, _preExisting = false){
        this.runnerId = null;
        this.processInterval = null;
        this.intId = 0;
        this.worldSubscriptions = [];
        this.gameSubscriptions = [];
        this.runnerIds = [];
        this.isDestroyed = false;
        this.entity = entity;
        this.entityId = entity.id;
        this.entityTypeId = entity.typeId;
        this.processInterval = processInterval;
        this.intId = MathUtil.hashPositiveInt(this.entityId);
        if (this.processInterval) {
            this.runnerId = system.runTimeout(()=>this.preProcess(), this.processInterval);
        }
    }
}
AbstractMobComponent.EntityStore = {};
AbstractMobComponent.EntityStoreTemporary = {};
AbstractMobComponent.WorldStore = {};
/**
 * Base class for handling Minecraft entity logic and lifecycle.
 * Provides common functionality for managing entity references, event subscriptions,
 * timed processes, and cleanup. Designed to be extended for specific entity types
 * or behaviors. Supports both persistent and temporary entity storage, and offers
 * utility methods for scheduling, validation, and event handling.
 * @property static EntityTypes - The supported entity types for this component.
 * @property static Events - The events this component can handle.
 * @property entity - The entity instance managed by this component.
 * @property entityId - The unique identifier for the entity.
 * @property entityTypeId - The type identifier for the entity.
 * @property runnerId - The ID of the current scheduled process, if any.
 * @property processInterval - The interval (in ticks) for scheduled processing.
 * @example
 * ```ts
 * class MyComponent extends MobComponent {
 *   process() {
 *     // Custom logic
 *   }
 * }
 * ``` */ export { AbstractMobComponent as default };
/**
 * MobComponentPlayer is a specialized MobComponent for handling player entities.
 * It automatically defines the entity type as "minecraft:player" and provides a reference to the player entity.
 * @property static EntityTypes - The supported entity types for this component.
 * @property entity - The player entity or a reference to it.
 * @property entityF - The player entity, fully typed as Player. */ export class MobComponentPlayer extends AbstractMobComponent {
}
MobComponentPlayer.EntityTypes = [
    "minecraft:player"
];

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkFic3RyYWN0TW9iQ29tcG9uZW50LnRzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEVudGl0eSwgUGxheWVyLCBzeXN0ZW0gfSBmcm9tIFwiQG1pbmVjcmFmdC9zZXJ2ZXJcIjtcclxuaW1wb3J0IHsgRXZlbnRDYWxsYmFjaywgRXZlbnRDbGFzc05hbWUsIEV2ZW50TmFtZSwgRXZlbnRTdWJzY3JpYmVPcHRpb25zIH0gZnJvbSBcIlN5c3RlbXMvQ3VzdG9tRXZlbnRzL0V2ZW50U3Vic2NyaWJlclwiO1xyXG5pbXBvcnQgeyBDdXN0b21FdmVudFR5cGVzIH0gZnJvbSBcIlR5cGluZy9UeXBlcy9DdXN0b21FdmVudHNcIjtcclxuaW1wb3J0IHsgTWF5YmUgfSBmcm9tIFwiVHlwaW5nL1R5cGVzL0dlbmVyaWNUeXBlc1wiO1xyXG5cclxuLyoqXHJcbiAqIEJhc2UgY2xhc3MgZm9yIGhhbmRsaW5nIE1pbmVjcmFmdCBlbnRpdHkgbG9naWMgYW5kIGxpZmVjeWNsZS5cclxuICogUHJvdmlkZXMgY29tbW9uIGZ1bmN0aW9uYWxpdHkgZm9yIG1hbmFnaW5nIGVudGl0eSByZWZlcmVuY2VzLCBldmVudCBzdWJzY3JpcHRpb25zLFxyXG4gKiB0aW1lZCBwcm9jZXNzZXMsIGFuZCBjbGVhbnVwLiBEZXNpZ25lZCB0byBiZSBleHRlbmRlZCBmb3Igc3BlY2lmaWMgZW50aXR5IHR5cGVzXHJcbiAqIG9yIGJlaGF2aW9ycy4gU3VwcG9ydHMgYm90aCBwZXJzaXN0ZW50IGFuZCB0ZW1wb3JhcnkgZW50aXR5IHN0b3JhZ2UsIGFuZCBvZmZlcnNcclxuICogdXRpbGl0eSBtZXRob2RzIGZvciBzY2hlZHVsaW5nLCB2YWxpZGF0aW9uLCBhbmQgZXZlbnQgaGFuZGxpbmcuXHJcbiAqIEBwcm9wZXJ0eSBzdGF0aWMgRW50aXR5VHlwZXMgLSBUaGUgc3VwcG9ydGVkIGVudGl0eSB0eXBlcyBmb3IgdGhpcyBjb21wb25lbnQuXHJcbiAqIEBwcm9wZXJ0eSBzdGF0aWMgRXZlbnRzIC0gVGhlIGV2ZW50cyB0aGlzIGNvbXBvbmVudCBjYW4gaGFuZGxlLlxyXG4gKiBAcHJvcGVydHkgZW50aXR5IC0gVGhlIGVudGl0eSBpbnN0YW5jZSBtYW5hZ2VkIGJ5IHRoaXMgY29tcG9uZW50LlxyXG4gKiBAcHJvcGVydHkgZW50aXR5SWQgLSBUaGUgdW5pcXVlIGlkZW50aWZpZXIgZm9yIHRoZSBlbnRpdHkuXHJcbiAqIEBwcm9wZXJ0eSBlbnRpdHlUeXBlSWQgLSBUaGUgdHlwZSBpZGVudGlmaWVyIGZvciB0aGUgZW50aXR5LlxyXG4gKiBAcHJvcGVydHkgcnVubmVySWQgLSBUaGUgSUQgb2YgdGhlIGN1cnJlbnQgc2NoZWR1bGVkIHByb2Nlc3MsIGlmIGFueS5cclxuICogQHByb3BlcnR5IHByb2Nlc3NJbnRlcnZhbCAtIFRoZSBpbnRlcnZhbCAoaW4gdGlja3MpIGZvciBzY2hlZHVsZWQgcHJvY2Vzc2luZy5cclxuICogQGV4YW1wbGVcclxuICogYGBgdHNcclxuICogY2xhc3MgTXlDb21wb25lbnQgZXh0ZW5kcyBNb2JDb21wb25lbnQge1xyXG4gKiAgIHByb2Nlc3MoKSB7XHJcbiAqICAgICAvLyBDdXN0b20gbG9naWNcclxuICogICB9XHJcbiAqIH1cclxuICogYGBgICovXHJcbmV4cG9ydCBkZWZhdWx0IGFic3RyYWN0IGNsYXNzIEFic3RyYWN0TW9iQ29tcG9uZW50IHtcclxuICAgIHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgRW50aXR5VHlwZXM6IHN0cmluZ1tdO1xyXG4gICAgcHVibGljIHN0YXRpYyByZWFkb25seSBFdmVudHM6IG9iamVjdDtcclxuICAgIHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgRW50aXR5U3RvcmUgPSB7fTtcclxuICAgIHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgRW50aXR5U3RvcmVUZW1wb3JhcnkgPSB7fTtcclxuICAgIHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgV29ybGRTdG9yZSA9IHt9O1xyXG4gICAgcHVibGljIGVudGl0eTogRW50aXR5O1xyXG4gICAgcHVibGljIGVudGl0eUlkOiBzdHJpbmc7XHJcbiAgICBwdWJsaWMgZW50aXR5VHlwZUlkOiBzdHJpbmc7XHJcbiAgICBwdWJsaWMgcnVubmVySWQ6IE1heWJlPG51bWJlcj4gPSBudWxsO1xyXG4gICAgcHVibGljIHByb2Nlc3NJbnRlcnZhbDogTWF5YmU8bnVtYmVyPiA9IG51bGw7XHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGludElkOiBudW1iZXIgPSAwO1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSB3b3JsZFN1YnNjcmlwdGlvbnM6IFt0eXBlOiBFdmVudENsYXNzTmFtZSwgZXZlbnQ6IHN0cmluZywgY2FsbGJhY2s6IG51bWJlciwgb3B0aW9ucz86IHVua25vd25dW10gPSBbXTtcclxuICAgIHByaXZhdGUgcmVhZG9ubHkgZ2FtZVN1YnNjcmlwdGlvbnM6IFtldmVudDoga2V5b2YgQ3VzdG9tRXZlbnRUeXBlcywgY2FsbGJhY2s6ICguLi5hcmdzOiBuZXZlcikgPT4gdm9pZF1bXSA9IFtdO1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBydW5uZXJJZHM6IG51bWJlcltdID0gW107XHJcblxyXG4gICAgcHVibGljIGlzRGVzdHJveWVkID0gZmFsc2U7XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKGVudGl0eTogRW50aXR5LCBwcm9jZXNzSW50ZXJ2YWw/OiBNYXliZTxudW1iZXI+LCBfcHJlRXhpc3RpbmcgPSBmYWxzZSkge1xyXG4gICAgICAgIHRoaXMuZW50aXR5ID0gZW50aXR5O1xyXG4gICAgICAgIHRoaXMuZW50aXR5SWQgPSBlbnRpdHkuaWQ7XHJcbiAgICAgICAgdGhpcy5lbnRpdHlUeXBlSWQgPSBlbnRpdHkudHlwZUlkO1xyXG4gICAgICAgIHRoaXMucHJvY2Vzc0ludGVydmFsID0gcHJvY2Vzc0ludGVydmFsO1xyXG4gICAgICAgIHRoaXMuaW50SWQgPSBNYXRoVXRpbC5oYXNoUG9zaXRpdmVJbnQodGhpcy5lbnRpdHlJZCk7XHJcblxyXG4gICAgICAgIGlmICh0aGlzLnByb2Nlc3NJbnRlcnZhbCkge1xyXG4gICAgICAgICAgICB0aGlzLnJ1bm5lcklkID0gc3lzdGVtLnJ1blRpbWVvdXQoKCkgPT4gdGhpcy5wcmVQcm9jZXNzKCksIHRoaXMucHJvY2Vzc0ludGVydmFsKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBDYWxsZWQgaW50ZXJuYWxseSB0byBoYW5kbGUgdGhlIHJlY3VycmluZyBwcm9jZXNzIGxvb3AgZm9yIHRoaXMgY29tcG9uZW50LlxyXG4gICAgICogVHJhY2tzIHBlcmZvcm1hbmNlIGFuZCBtYW5hZ2VzIHRoZSBwcm9jZXNzIGludGVydmFsIGFuZCBzdG9wIGZsYWcuXHJcbiAgICAgKiBPdmVycmlkZSBgcHJvY2VzcygpYCBpbiBzdWJjbGFzc2VzIGZvciBjdXN0b20gbG9naWMuXHJcbiAgICAgKiBOb3QgaW50ZW5kZWQgdG8gYmUgY2FsbGVkIGRpcmVjdGx5LlxyXG4gICAgICovXHJcbiAgICBwcm90ZWN0ZWQgcHJlUHJvY2VzcygpIHtcclxuICAgICAgICBpZiAodGhpcy5pc0Rlc3Ryb3llZCkgcmV0dXJuO1xyXG5cclxuICAgICAgICBEZWJ1Z1RpbWVyLmNvdW50U3RhcnQoYE1CLnByZVByb2Nlc3MuJHt0aGlzLmNvbnN0cnVjdG9yLm5hbWV9YCk7XHJcblxyXG4gICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgIGlmICh0aGlzLmVudGl0eS5pc1ZhbGlkKSB0aGlzLnByb2Nlc3MoKTtcclxuICAgICAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgICAgICBjb25zdCBtZXNzYWdlID0gYFske3RoaXMuY29uc3RydWN0b3IubmFtZX1dIFByb2Nlc3NpbmcgRXJyb3IgKCR7dGhpcy5lbnRpdHkuaWR9LCAke3RoaXMuZW50aXR5LnR5cGVJZH0pOmA7XHJcbiAgICAgICAgICAgIGlmIChlcnJvciBpbnN0YW5jZW9mIEVycm9yKSBjb25zb2xlLmVycm9yKG1lc3NhZ2UsIFwiXFxuXCIsIGVycm9yLCBcIlxcblwiLCBlcnJvci5zdGFjayk7XHJcbiAgICAgICAgICAgIGVsc2UgY29uc29sZS5lcnJvcihtZXNzYWdlLCBlcnJvcik7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBpZiAodGhpcy5wcm9jZXNzSW50ZXJ2YWwgIT09IG51bGwpIHtcclxuICAgICAgICAgICAgdGhpcy5ydW5uZXJJZCA9IHN5c3RlbS5ydW5UaW1lb3V0KCgpID0+IHRoaXMucHJlUHJvY2VzcygpLCB0aGlzLnByb2Nlc3NJbnRlcnZhbCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBEZWJ1Z1RpbWVyLmNvdW50RW5kKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBTdWJzY3JpYmVzIHRvIGEgd29ybGQgZXZlbnQgb2YgYSBzcGVjaWZpYyB0eXBlIGFuZCBldmVudCBuYW1lLCBhbmQgcmVnaXN0ZXJzIGEgY2FsbGJhY2sgdG8gYmUgaW52b2tlZCB3aGVuIHRoZSBldmVudCBvY2N1cnMuXHJcbiAgICAgKiBAdGVtcGxhdGUgQ2xhc3NOYW1lIC0gVGhlIHR5cGUgb2YgdGhlIGV2ZW50IGNsYXNzLlxyXG4gICAgICogQHRlbXBsYXRlIE5hbWUgLSBUaGUgbmFtZSBvZiB0aGUgZXZlbnQsIGNvbnN0cmFpbmVkIGJ5IHRoZSBldmVudCBjbGFzcy5cclxuICAgICAqIEBwYXJhbSB0eXBlIC0gVGhlIGNsYXNzIG9mIHRoZSBldmVudCB0byBzdWJzY3JpYmUgdG8uXHJcbiAgICAgKiBAcGFyYW0gY2FsbGJhY2sgLSBUaGUgZnVuY3Rpb24gdG8gYmUgY2FsbGVkIHdoZW4gdGhlIGV2ZW50IGlzIHRyaWdnZXJlZC5cclxuICAgICAqIEBwYXJhbSBldmVudCAtIFRoZSBzcGVjaWZpYyBldmVudCBuYW1lIHRvIGxpc3RlbiBmb3IuXHJcbiAgICAgKiAqIEBwYXJhbSBvcHRpb25zIC0gT3B0aW9uYWwgZmlsdGVyL29wdGlvbnMgb2JqZWN0IGZvciB0aGUgZXZlbnQgc3Vic2NyaXB0aW9uLlxyXG4gICAgICogQHByb3RlY3RlZFxyXG4gICAgICovXHJcbiAgICBwcm90ZWN0ZWQgb25Xb3JsZEV2ZW50PENsYXNzTmFtZSBleHRlbmRzIEV2ZW50Q2xhc3NOYW1lLCBOYW1lIGV4dGVuZHMgRXZlbnROYW1lPENsYXNzTmFtZT4+KFxyXG4gICAgICAgIHR5cGU6IENsYXNzTmFtZSxcclxuICAgICAgICBldmVudDogTmFtZSxcclxuICAgICAgICBjYWxsYmFjazogRXZlbnRDYWxsYmFjazxDbGFzc05hbWUsIE5hbWU+LFxyXG4gICAgICAgIG9wdGlvbnM/OiBFdmVudFN1YnNjcmliZU9wdGlvbnM8Q2xhc3NOYW1lLCBOYW1lPlxyXG4gICAgKSB7XHJcbiAgICAgICAgdGhpcy53b3JsZFN1YnNjcmlwdGlvbnMucHVzaChbdHlwZSwgZXZlbnQgYXMgc3RyaW5nLCBFdmVudFN1YnNjcmliZXIuc3Vic2NyaWJlKHR5cGUsIGV2ZW50LCBjYWxsYmFjaywgb3B0aW9ucyksIG9wdGlvbnNdKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFN1YnNjcmliZXMgdG8gYSBzcGVjaWZpZWQgZ2FtZSBldmVudCBhbmQgcmVnaXN0ZXJzIGEgY2FsbGJhY2sgdG8gYmUgaW52b2tlZCB3aGVuIHRoZSBldmVudCBvY2N1cnMuXHJcbiAgICAgKiBUaGUgc3Vic2NyaXB0aW9uIGlzIHRyYWNrZWQgaW50ZXJuYWxseSBmb3IgbGF0ZXIgY2xlYW51cC5cclxuICAgICAqIEB0ZW1wbGF0ZSBHYW1lRXZlbnQgLSBUaGUga2V5IG9mIHRoZSBldmVudCBpbiB0aGUgYEdhbWVFdmVudHNgIGludGVyZmFjZS5cclxuICAgICAqIEBwYXJhbSBldmVudCAtIFRoZSBuYW1lIG9mIHRoZSBnYW1lIGV2ZW50IHRvIHN1YnNjcmliZSB0by5cclxuICAgICAqIEBwYXJhbSBjYWxsYmFjayAtIFRoZSBmdW5jdGlvbiB0byBjYWxsIHdoZW4gdGhlIGV2ZW50IGlzIHRyaWdnZXJlZC4gUmVjZWl2ZXMgdGhlIGV2ZW50IGFyZ3VtZW50cyBhcyBwYXJhbWV0ZXJzLlxyXG4gICAgICovXHJcbiAgICBwcm90ZWN0ZWQgb25HYW1lRXZlbnQ8R2FtZUV2ZW50IGV4dGVuZHMga2V5b2YgQ3VzdG9tRXZlbnRUeXBlcz4oXHJcbiAgICAgICAgZXZlbnQ6IEdhbWVFdmVudCxcclxuICAgICAgICBjYWxsYmFjazogKC4uLmFyZ3M6IEN1c3RvbUV2ZW50VHlwZXNbR2FtZUV2ZW50XSkgPT4gdm9pZFxyXG4gICAgKSB7XHJcbiAgICAgICAgdGhpcy5nYW1lU3Vic2NyaXB0aW9ucy5wdXNoKFtldmVudCwgY2FsbGJhY2tdKTtcclxuICAgICAgICBDdXN0b21FdmVudHMuc3Vic2NyaWJlKGV2ZW50LCBjYWxsYmFjayk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBSdW5zIGEgY2FsbGJhY2sgZnVuY3Rpb24gYXQgYSBzcGVjaWZpZWQgaW50ZXJ2YWwsIG9wdGlvbmFsbHkgY29uZGl0aW9uZWQgYnkgYSBwcmVkaWNhdGUuXHJcbiAgICAgKiBAcGFyYW0gY2FsbGJhY2sgLSBUaGUgZnVuY3Rpb24gdG8gZXhlY3V0ZSBhdCBlYWNoIGludGVydmFsLlxyXG4gICAgICogQHBhcmFtIGludGVydmFsIC0gVGhlIHRpbWUgaW50ZXJ2YWwgKGluIHRpY2tzIG9yIG1pbGxpc2Vjb25kcywgZGVwZW5kaW5nIG9uIHRoZSBzeXN0ZW0pIGJldHdlZW4gZWFjaCBjYWxsYmFjayBleGVjdXRpb24uXHJcbiAgICAgKiBAcGFyYW0gY29uZGl0aW9uIC0gQW4gb3B0aW9uYWwgZnVuY3Rpb24gdGhhdCByZXR1cm5zIGEgYm9vbGVhbjsgaWYgcHJvdmlkZWQsIHRoZSBjYWxsYmFjayBpcyBvbmx5IGV4ZWN1dGVkIHdoZW4gdGhpcyBjb25kaXRpb24gcmV0dXJucyB0cnVlLlxyXG4gICAgICogQHJldHVybnMgVGhlIGlkZW50aWZpZXIgZm9yIHRoZSBpbnRlcnZhbCBydW5uZXIsIHdoaWNoIGNhbiBiZSB1c2VkIHRvIGNsZWFyIG9yIG1hbmFnZSB0aGUgaW50ZXJ2YWwgbGF0ZXIuXHJcbiAgICAgKi9cclxuICAgIHByb3RlY3RlZCBpbnRlcnZhbChjYWxsYmFjazogKCkgPT4gdm9pZCwgaW50ZXJ2YWw6IG51bWJlciwgY29uZGl0aW9uPzogKCkgPT4gYm9vbGVhbikge1xyXG4gICAgICAgIGNvbnN0IG5ld0NhbGxiYWNrID0gY29uZGl0aW9uID8gKCkgPT4gKGNvbmRpdGlvbigpID8gY2FsbGJhY2soKSA6IG51bGwpIDogY2FsbGJhY2s7XHJcbiAgICAgICAgY29uc3QgcnVubmVySWQgPSBzeXN0ZW0ucnVuSW50ZXJ2YWwobmV3Q2FsbGJhY2ssIGludGVydmFsKTtcclxuICAgICAgICB0aGlzLnJ1bm5lcklkcy5wdXNoKHJ1bm5lcklkKTtcclxuICAgICAgICByZXR1cm4gcnVubmVySWQ7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBTY2hlZHVsZXMgYSBjYWxsYmFjayBmdW5jdGlvbiB0byBiZSBleGVjdXRlZCBhZnRlciBhIHNwZWNpZmllZCBkZWxheS5cclxuICAgICAqIE9wdGlvbmFsbHksIHRoZSBjYWxsYmFjayB3aWxsIG9ubHkgZXhlY3V0ZSBpZiBhIHByb3ZpZGVkIGNvbmRpdGlvbiByZXR1cm5zIHRydWUgYXQgdGhlIHRpbWUgb2YgZXhlY3V0aW9uLlxyXG4gICAgICogQHBhcmFtIGNhbGxiYWNrIC0gVGhlIGZ1bmN0aW9uIHRvIGV4ZWN1dGUgYWZ0ZXIgdGhlIGRlbGF5LlxyXG4gICAgICogQHBhcmFtIGRlbGF5IC0gVGhlIGRlbGF5IGluIHRpY2tzIGJlZm9yZSBleGVjdXRpbmcgdGhlIGNhbGxiYWNrLlxyXG4gICAgICogQHBhcmFtIGNvbmRpdGlvbiAtIEFuIG9wdGlvbmFsIGZ1bmN0aW9uIHRoYXQgcmV0dXJucyBhIGJvb2xlYW47IGlmIHByb3ZpZGVkLCB0aGUgY2FsbGJhY2sgaXMgb25seSBleGVjdXRlZCBpZiB0aGlzIHJldHVybnMgdHJ1ZS5cclxuICAgICAqIEByZXR1cm5zIFRoZSBpZGVudGlmaWVyIG9mIHRoZSBzY2hlZHVsZWQgdGltZW91dCBydW5uZXIuXHJcbiAgICAgKi9cclxuICAgIHByb3RlY3RlZCB0aW1lb3V0KGNhbGxiYWNrOiAoKSA9PiB2b2lkLCBkZWxheTogbnVtYmVyLCBjb25kaXRpb24/OiAoKSA9PiBib29sZWFuKSB7XHJcbiAgICAgICAgY29uc3QgbmV3Q2FsbGJhY2sgPSBjb25kaXRpb24gPyAoKSA9PiAoY29uZGl0aW9uKCkgPyBjYWxsYmFjaygpIDogbnVsbCkgOiBjYWxsYmFjaztcclxuICAgICAgICBjb25zdCBydW5uZXJJZCA9IHN5c3RlbS5ydW5UaW1lb3V0KG5ld0NhbGxiYWNrLCBkZWxheSk7XHJcbiAgICAgICAgdGhpcy5ydW5uZXJJZHMucHVzaChydW5uZXJJZCk7XHJcbiAgICAgICAgcmV0dXJuIHJ1bm5lcklkO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogU2NoZWR1bGVzIGEgc2VyaWVzIG9mIGNhbGxiYWNrcyB0byBiZSBleGVjdXRlZCBhdCBzcGVjaWZpZWQgdGltZXMsIG9wdGlvbmFsbHkgY29uZGl0aW9uZWQgYnkgYSBwcmVkaWNhdGUuXHJcbiAgICAgKiBAcGFyYW0gdGltZWxpbmUgLSBBbiBvYmplY3Qgd2hlcmUgZWFjaCBrZXkgaXMgYSB0aW1lIChpbiB0aWNrcykgYW5kIGVhY2ggdmFsdWUgaXMgYSBjYWxsYmFjayBmdW5jdGlvbiB0byBleGVjdXRlIGF0IHRoYXQgdGltZS5cclxuICAgICAqIEBwYXJhbSBjb25kaXRpb24gLSBBbiBvcHRpb25hbCBmdW5jdGlvbiB0aGF0IHJldHVybnMgYSBib29sZWFuOyBpZiBwcm92aWRlZCwgdGhlIGNhbGxiYWNrIHdpbGwgb25seSBiZSBleGVjdXRlZCBpZiB0aGlzIGNvbmRpdGlvbiBpcyB0cnVlIGF0IHRoZSBzY2hlZHVsZWQgdGltZS5cclxuICAgICAqIEByZXR1cm5zIEEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIG9uY2UgdGhlIHRpbWVsaW5lIGhhcyBjb21wbGV0ZWQuXHJcbiAgICAgKiBAZXhhbXBsZVxyXG4gICAgICogdGhpcy50aW1lbGluZSh7XHJcbiAgICAgKiAgIDE6ICgpID0+IHRoaXMuZW50aXR5LnNlbmRfbWVzc2FnZShcIkZpcnN0IHRpY2shXCIpLFxyXG4gICAgICogICAyMDogKCkgPT4gdGhpcy5lbnRpdHkuc2VuZF9tZXNzYWdlKFwiQWZ0ZXIgMSBzZWNvbmQhXCIpLFxyXG4gICAgICogICAxMDA6ICgpID0+IHRoaXMuZW50aXR5LnNlbmRfbWVzc2FnZShcIkFmdGVyIDUgc2Vjb25kcyFcIilcclxuICAgICAqIH0pO1xyXG4gICAgICovXHJcbiAgICBwcm90ZWN0ZWQgYXN5bmMgdGltZWxpbmUodGltZWxpbmU6IFJlY29yZDxudW1iZXIsICgpID0+IHZvaWQ+LCBjb25kaXRpb24/OiAoKSA9PiBib29sZWFuKSB7XHJcbiAgICAgICAgT2JqZWN0LmVudHJpZXModGltZWxpbmUpLmZvckVhY2goKFt0aW1lLCBjYWxsYmFja10pID0+IHtcclxuICAgICAgICAgICAgLy8gTXVsdGlwbHlpbmcgYnkgMSBiZWxvdyB0byBmaXggYSB0eXBlIGNvbnZlcnNpb24gZXJyb3IsIGRvbid0IGFzayB3aHkgaXQgZG9lcyBub3Qgd29yayB3aXRob3V0LlxyXG4gICAgICAgICAgICB0aGlzLnRpbWVvdXQoKCkgPT4gY2FsbGJhY2soKSwgKHRpbWUgYXMgdW5rbm93biBhcyBudW1iZXIpICogMSwgY29uZGl0aW9uKTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgYXdhaXQgbmV3IFByb21pc2U8dm9pZD4oKHJlc29sdmUpID0+IHtcclxuICAgICAgICAgICAgLy8gRmluZCB0aGUgZHVyYXRpb24gb2YgdGhlIHRpbWVsaW5lIHRocm91Z2ggbG9uZ2VzdCB0aW1lIGtleVxyXG4gICAgICAgICAgICBjb25zdCBkdXJhdGlvbiA9IE1hdGgubWF4KC4uLk9iamVjdC5rZXlzKHRpbWVsaW5lKS5tYXAoKGspID0+IE51bWJlcihrKSkpICsgMTtcclxuICAgICAgICAgICAgdGhpcy50aW1lb3V0KCgpID0+IHJlc29sdmUoKSwgZHVyYXRpb24pO1xyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogUHJvY2Vzc2VzIHRoZSBjb21wb25lbnQncyBsb2dpYy5cclxuICAgICAqIFRoaXMgbWV0aG9kIGlzIGludGVuZGVkIHRvIGJlIG92ZXJyaWRkZW4gYnkgc3ViY2xhc3NlcyB0byBpbXBsZW1lbnRcclxuICAgICAqIHNwZWNpZmljIHByb2Nlc3NpbmcgYmVoYXZpb3IgZm9yIHRoZSBtb2IgY29tcG9uZW50LiBCeSBkZWZhdWx0LCBpdCBwZXJmb3JtcyBubyBhY3Rpb24uXHJcbiAgICAgKi9cclxuXHJcbiAgICBwdWJsaWMgcHJvY2VzcygpIHt9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBEZXRlcm1pbmVzIHdoZXRoZXIgdGhlIGN1cnJlbnQgdGljaywgb2Zmc2V0IGJ5IHRoaXMgY29tcG9uZW50J3MgaW50ZXJuYWwgSUQsIGlzIGEgbXVsdGlwbGUgb2YgdGhlIGdpdmVuIG51bWJlci5cclxuICAgICAqIEBwYXJhbSBuIC0gVGhlIGludGVydmFsIHRvIGNoZWNrIGFnYWluc3QgKG11c3QgYmUgYSBwb3NpdGl2ZSBpbnRlZ2VyKS5cclxuICAgICAqIEByZXR1cm5zIGB0cnVlYCBpZiB0aGUgc3VtIG9mIHRoZSBjdXJyZW50IHRpY2sgYW5kIHRoaXMgY29tcG9uZW50J3MgaW50ZXJuYWwgSUQgaXMgZGl2aXNpYmxlIGJ5IGBuYCwgb3RoZXJ3aXNlIGBmYWxzZWAuXHJcbiAgICAgKi9cclxuICAgIHByb3RlY3RlZCBpc0N1cnJlbnRUaWNrTnRoKG46IG51bWJlcikge1xyXG4gICAgICAgIGNvbnN0IHRpbWVTdGFtcHQgPSBNYWluLmN1cnJlbnRUaWNrICsgdGhpcy5pbnRJZDtcclxuICAgICAgICByZXR1cm4gdGltZVN0YW1wdCAlIG4gPT09IDA7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBDbGVhbnMgdXAgYWxsIHJlc291cmNlcyBhbmQgc3Vic2NyaXB0aW9ucyBhc3NvY2lhdGVkIHdpdGggdGhpcyBjb21wb25lbnQuXHJcbiAgICAgKiAtIFVuc3Vic2NyaWJlcyBmcm9tIGFsbCB3b3JsZCBhbmQgZ2FtZSBldmVudHMuXHJcbiAgICAgKiAtIENsZWFycyBhbGwgc2NoZWR1bGVkIHJ1bm5lciB0YXNrcy5cclxuICAgICAqIC0gUmVzZXRzIHRoZSBtYWluIHJ1bm5lciBJRCB0byBudWxsLlxyXG4gICAgICogVGhpcyBtZXRob2Qgc2hvdWxkIGJlIGNhbGxlZCB3aGVuIHRoZSBjb21wb25lbnQgaXMgbm8gbG9uZ2VyIG5lZWRlZCB0byBwcmV2ZW50IG1lbW9yeSBsZWFrcyBhbmQgdW5pbnRlbmRlZCBiZWhhdmlvci5cclxuICAgICAqL1xyXG4gICAgcHVibGljIGRlc3Ryb3koKSB7XHJcbiAgICAgICAgdGhpcy53b3JsZFN1YnNjcmlwdGlvbnMuZm9yRWFjaCgoW3R5cGUsIGV2ZW50LCBpZCwgb3B0aW9uc10pID0+IHtcclxuICAgICAgICAgICAgRXZlbnRTdWJzY3JpYmVyLnVuc3Vic2NyaWJlKHR5cGUsIGV2ZW50IGFzIHVua25vd24gYXMgbmV2ZXIsIGlkLCBvcHRpb25zIGFzIG5ldmVyKTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgdGhpcy5nYW1lU3Vic2NyaXB0aW9ucy5mb3JFYWNoKChbZXZlbnQsIGNhbGxiYWNrXSkgPT4ge1xyXG4gICAgICAgICAgICBDdXN0b21FdmVudHMudW5zdWJzY3JpYmUoZXZlbnQsIGNhbGxiYWNrKTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgdGhpcy5ydW5uZXJJZHMuZm9yRWFjaCgocnVubmVySWQpID0+IHN5c3RlbS5jbGVhclJ1bihydW5uZXJJZCkpO1xyXG5cclxuICAgICAgICBpZiAodHlwZW9mIHRoaXMucnVubmVySWQgPT09IFwibnVtYmVyXCIpIHN5c3RlbS5jbGVhclJ1bih0aGlzLnJ1bm5lcklkKTtcclxuICAgICAgICB0aGlzLnJ1bm5lcklkID0gbnVsbDtcclxuICAgICAgICB0aGlzLmlzRGVzdHJveWVkID0gdHJ1ZTtcclxuICAgIH1cclxufVxyXG5cclxuLyoqXHJcbiAqIE1vYkNvbXBvbmVudFBsYXllciBpcyBhIHNwZWNpYWxpemVkIE1vYkNvbXBvbmVudCBmb3IgaGFuZGxpbmcgcGxheWVyIGVudGl0aWVzLlxyXG4gKiBJdCBhdXRvbWF0aWNhbGx5IGRlZmluZXMgdGhlIGVudGl0eSB0eXBlIGFzIFwibWluZWNyYWZ0OnBsYXllclwiIGFuZCBwcm92aWRlcyBhIHJlZmVyZW5jZSB0byB0aGUgcGxheWVyIGVudGl0eS5cclxuICogQHByb3BlcnR5IHN0YXRpYyBFbnRpdHlUeXBlcyAtIFRoZSBzdXBwb3J0ZWQgZW50aXR5IHR5cGVzIGZvciB0aGlzIGNvbXBvbmVudC5cclxuICogQHByb3BlcnR5IGVudGl0eSAtIFRoZSBwbGF5ZXIgZW50aXR5IG9yIGEgcmVmZXJlbmNlIHRvIGl0LlxyXG4gKiBAcHJvcGVydHkgZW50aXR5RiAtIFRoZSBwbGF5ZXIgZW50aXR5LCBmdWxseSB0eXBlZCBhcyBQbGF5ZXIuICovXHJcbmV4cG9ydCBjbGFzcyBNb2JDb21wb25lbnRQbGF5ZXIgZXh0ZW5kcyBBYnN0cmFjdE1vYkNvbXBvbmVudCB7XHJcbiAgICBwdWJsaWMgc3RhdGljIHJlYWRvbmx5IEVudGl0eVR5cGVzID0gW1wibWluZWNyYWZ0OnBsYXllclwiXTtcclxuICAgIGRlY2xhcmUgcHVibGljIGVudGl0eTogUGxheWVyO1xyXG59XHJcbiJdLCJuYW1lcyI6WyJzeXN0ZW0iLCJBYnN0cmFjdE1vYkNvbXBvbmVudCIsInByZVByb2Nlc3MiLCJpc0Rlc3Ryb3llZCIsIkRlYnVnVGltZXIiLCJjb3VudFN0YXJ0IiwiY29uc3RydWN0b3IiLCJuYW1lIiwiZW50aXR5IiwiaXNWYWxpZCIsInByb2Nlc3MiLCJlcnJvciIsIm1lc3NhZ2UiLCJpZCIsInR5cGVJZCIsIkVycm9yIiwiY29uc29sZSIsInN0YWNrIiwicHJvY2Vzc0ludGVydmFsIiwicnVubmVySWQiLCJydW5UaW1lb3V0IiwiY291bnRFbmQiLCJvbldvcmxkRXZlbnQiLCJ0eXBlIiwiZXZlbnQiLCJjYWxsYmFjayIsIm9wdGlvbnMiLCJ3b3JsZFN1YnNjcmlwdGlvbnMiLCJwdXNoIiwiRXZlbnRTdWJzY3JpYmVyIiwic3Vic2NyaWJlIiwib25HYW1lRXZlbnQiLCJnYW1lU3Vic2NyaXB0aW9ucyIsIkN1c3RvbUV2ZW50cyIsImludGVydmFsIiwiY29uZGl0aW9uIiwibmV3Q2FsbGJhY2siLCJydW5JbnRlcnZhbCIsInJ1bm5lcklkcyIsInRpbWVvdXQiLCJkZWxheSIsInRpbWVsaW5lIiwiT2JqZWN0IiwiZW50cmllcyIsImZvckVhY2giLCJ0aW1lIiwiUHJvbWlzZSIsInJlc29sdmUiLCJkdXJhdGlvbiIsIk1hdGgiLCJtYXgiLCJrZXlzIiwibWFwIiwiayIsIk51bWJlciIsImlzQ3VycmVudFRpY2tOdGgiLCJuIiwidGltZVN0YW1wdCIsIk1haW4iLCJjdXJyZW50VGljayIsImludElkIiwiZGVzdHJveSIsInVuc3Vic2NyaWJlIiwiY2xlYXJSdW4iLCJfcHJlRXhpc3RpbmciLCJlbnRpdHlJZCIsImVudGl0eVR5cGVJZCIsIk1hdGhVdGlsIiwiaGFzaFBvc2l0aXZlSW50IiwiRW50aXR5U3RvcmUiLCJFbnRpdHlTdG9yZVRlbXBvcmFyeSIsIldvcmxkU3RvcmUiLCJNb2JDb21wb25lbnRQbGF5ZXIiLCJFbnRpdHlUeXBlcyJdLCJtYXBwaW5ncyI6IkFBQUEsU0FBeUJBLE1BQU0sUUFBUSxvQkFBb0I7QUEwQjVDLE1BQWVDO0lBOEIxQjs7Ozs7S0FLQyxHQUNELEFBQVVDLGFBQWE7UUFDbkIsSUFBSSxJQUFJLENBQUNDLFdBQVcsRUFBRTtRQUV0QkMsV0FBV0MsVUFBVSxDQUFDLENBQUMsY0FBYyxFQUFFLElBQUksQ0FBQ0MsV0FBVyxDQUFDQyxJQUFJLENBQUMsQ0FBQztRQUU5RCxJQUFJO1lBQ0EsSUFBSSxJQUFJLENBQUNDLE1BQU0sQ0FBQ0MsT0FBTyxFQUFFLElBQUksQ0FBQ0MsT0FBTztRQUN6QyxFQUFFLE9BQU9DLE9BQU87WUFDWixNQUFN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