import { DimensionTypes, system, world } from "@minecraft/server";
import Env from "Env";
import V3 from "Helpers/Vectors/V3";
import MobComponents from "./MobComponentRegistry";
class MobComponentManager {
    /**
     * Initializes the MobComponentManager by registering all mob components,
     * subscribing to relevant world events, and setting up periodic checks and cleanup routines.
     * - Iterates through all available MobComponents, preparing them for registration.
     * - Subscribes to player and entity spawn/load events to register components on new or existing entities.
     * - Iterates through all dimensions to register components on pre-existing entities.
     * - Sets up interval-based checks for stalled entities and periodic cleanup.
     * - Logs the initialization of the script for debugging or auditing purposes.
     */ static init() {
        for(const MobComponentKey in MobComponents){
            const MobComponent = MobComponents[MobComponentKey];
            this.componentsToRegister.push({
                entityTypes: MobComponent.EntityTypes,
                component: MobComponent,
                name: MobComponentKey
            });
            this.entityTypeIdsToRegister = new Set([
                ...this.entityTypeIdsToRegister,
                ...MobComponent.EntityTypes
            ]);
        }
        EventSubscriber.subscribe("WorldAfterEvents", "playerSpawn", ({ player })=>this.register(player));
        EventSubscriber.subscribe("WorldAfterEvents", "entitySpawn", ({ entity })=>this.register(entity));
        EventSubscriber.subscribe("WorldAfterEvents", "entityLoad", ({ entity })=>this.registerPreExisting(entity));
        EventSubscriber.subscribe("WorldBeforeEvents", "playerLeave", ({ player })=>this.destroyComponents(player.id));
        DimensionTypes.getAll().forEach((dimensionType)=>{
            const entities = world.getDimension(dimensionType.typeId).getEntities();
            entities.forEach((entity)=>this.registerPreExisting(entity));
        });
        system.runInterval(()=>{
            this.checkStalledEntities();
        }, 30);
        system.runInterval(()=>this.cleanup(), 10);
    }
    /**
     * Registers an entity that may already exist in the world.
     * @param entity - The entity to register
     */ static registerPreExisting(entity) {
        this.register(entity, true);
    }
    /**
     * Registers an entity with the MobComponentManager, initializing its components if applicable.
     * @param entity - The entity to register.
     * @param preExisting - Optional. Indicates if the entity already existed before registration. Defaults to `false`.
     * @param isWithinRange - Optional. If specified, determines whether the entity is within the required range for registration.
     * @remarks
     * - Only valid entities of types present in `entityTypeIdsToRegister` are considered.
     * - Entities already registered are ignored.
     * - If `isWithinRange` is not provided, it is computed based on the entity's location and dimension.
     * - Non-player entities outside the required range are stalled for later registration.
     * - For eligible entities, component instances are created and associated with the entity.
     * - Emits the `"EntityLoaded"` event upon successful registration.
     */ static register(entity, preExisting = false, isWithinRange) {
        if (!entity.isValid) return;
        if (!this.entityTypeIdsToRegister.has(entity.typeId)) return;
        if (this.entityIdsRegistered.has(entity.id)) return;
        if (isWithinRange === undefined) isWithinRange = this.isWithinRange(entity.location, entity.dimension);
        const neverStall = this.neverStallTypes.includes(entity.typeId);
        if (!isWithinRange && entity.typeId !== "minecraft:player" && !neverStall) {
            this.stalledEntities.add({
                entity,
                location: V3.fromEntity(entity),
                dimension: entity.dimension
            });
            return;
        }
        this.entityIdsRegistered.add(entity.id);
        this.mobComponents[entity.id] = {};
        for (const { entityTypes, component } of this.componentsToRegister){
            if (entityTypes.includes(entity.typeId)) {
                try {
                    const componentInstance = new component(entity, undefined, preExisting);
                    this.mobComponents[entity.id][component.name] = componentInstance;
                } catch (error) {
                    const message = `[${component.name}] Initialization Error (${entity.id}, ${entity.typeId}):`;
                    if (error instanceof Error) console.error(message, "\n", error, "\n", error.stack);
                    else console.error(message, error);
                    continue;
                }
            }
        }
        CustomEvents.emit("EntityLoaded", entity);
    }
    /**
     * Determines whether the specified location is within a certain maximum distance
     * to the closest player in the given dimension.
     * @param location - The 3D vector representing the location to check.
     * @param dimension - The dimension in which to search for players.
     * @returns `true` if the location is within the maximum allowed distance to any player; otherwise, `false`.
     */ static isWithinRange(location, dimension) {
        if (Env === "test") return true; // Don't stall entities in tests since players aren't present
        return PlayersCache.getDistanceToClosestPlayer(location, dimension) <= this.MaxDistanceToPlayer;
    }
    /**
     * Waits for a specified number of ticks.
     * @param time - The number of ticks to wait.
     * @returns A promise that resolves after the specified time.
     */ static async wait(time) {
        return new Promise((resolve)=>system.runTimeout(()=>resolve(), time));
    }
    /**
     * Iterates through all stalled entities and processes them.
     * For each entity in `this.stalledEntities`, this method:
     * - Periodically yields execution to avoid blocking (every 10 entities).
     * - Checks if the entity is still valid using `EntityUtil.isValid`.
     *   - If not valid, removes the entity from `stalledEntities`.
     * - Checks if the entity is within a certain range using `isWithinRange`.
     *   - If not within range, skips further processing.
     * - If valid and within range, registers the entity and removes it from `stalledEntities`.
     * @returns A promise that resolves when all stalled entities have been processed.
     */ static async checkStalledEntities() {
        for(let i = 0; i < this.stalledEntities.size; i++){
            const entry = [
                ...this.stalledEntities
            ][i];
            if (i % 10 === 0) await this.wait(0);
            const isValid = entry.entity.isValid;
            if (!isValid) {
                this.stalledEntities.delete(entry);
                continue;
            }
            const isWithinRange = this.isWithinRange(entry.location, entry.dimension);
            if (!isWithinRange) continue;
            this.register(entry.entity, false, true);
            this.stalledEntities.delete(entry);
        }
    }
    /**
     * Cleans up mob components managed by the MobComponentManager.
     * Iterates through all registered mob components, checking the validity of their associated entities.
     * - If an entity is invalid, its components are destroyed and removed from management.
     * - If an entity is not a player and is outside a specified range, its components are stalled and then destroyed.
     * - Stalled entities are tracked for potential reactivation.
     * Uses DebugTimer to profile execution time for performance monitoring.
     */ static cleanup() {
        DebugTimer.countStart("MCM.cleanup");
        for(const entityId in this.mobComponents){
            const entity = world.getEntity(entityId);
            let shouldDestroy = false;
            let shouldStall = false;
            DebugTimer.countStart("MCM.cleanup.isValid");
            if (!entity?.isValid) {
                shouldDestroy = true;
            } else if (entity.typeId !== "minecraft:player") {
                const location = this.mobComponents[entityId][0]?.entityLocation || entity.location;
                const neverStall = this.neverStallTypes.includes(entity.typeId);
                shouldStall = !this.isWithinRange(location, entity.dimension) && !neverStall;
            }
            DebugTimer.countEnd();
            if (shouldStall) {
                this.stalledEntities.add({
                    entity: entity,
                    location: V3.fromEntity(entity),
                    dimension: entity.dimension
                });
            }
            if (shouldDestroy || shouldStall) {
                this.destroyComponents(entityId);
            }
        }
        DebugTimer.countEnd();
    }
    static destroyComponents(entityId) {
        for(const component in this.mobComponents[entityId]){
            const instance = this.mobComponents[entityId][component];
            instance.destroy();
        }
        delete this.mobComponents[entityId];
        this.entityIdsRegistered.delete(entityId);
    }
    /**
     * Counts the number of registered entities grouped by their type ID.
     * Iterates through all registered mob components, tallies the count for each unique `entityTypeId`,
     * sorts the results in descending order by count, and returns a JSON string containing the total count
     * and the sorted counts per entity type.
     * @returns {string} A JSON string with the total number of entities and the count per entity type, sorted by count.
     */ static countRegisteredEntities() {
        const count = {};
        for(const entityId in this.mobComponents){
            const firstComponent = Object.values(this.mobComponents[entityId])[0];
            const typeId = firstComponent.entityTypeId;
            if (!typeId) continue; // Skip if no valid component or typeId
            if (count[typeId]) count[typeId]++;
            else count[typeId] = 1;
        }
        const sorted = Object.keys(count).sort((a, b)=>count[b] - count[a]);
        const sortedCount = {};
        for (const key of sorted){
            sortedCount[key] = count[key];
        }
        const total = Object.keys(count).reduce((acc, key)=>acc + count[key], 0);
        return `${JSON.stringify({
            total,
            ...sortedCount
        })}`;
    }
    /**
     * Retrieves the specified mob component instance associated with a given entity.
     * @param entity - The entity whose mob component is being requested.
     * @param mobComponentKey - The key identifying the specific mob component. This is the class name of the mob component.
     * @returns The instance of the requested mob component if it exists, otherwise `undefined`.
     */ static getMobComponentOfEntity(entity, mobComponentKey) {
        return this.mobComponents[entity.id][mobComponentKey];
    }
    /**
     * Retrieves all instances of a specific mob component for the given entities.
     * @param mobComponentKey - The key identifying the type of mob component to retrieve. This is the class name of the mob component.
     * @param entities - (Optional) An array of entities to filter by. If not provided, all entities are considered.
     * @returns An array of mob component instances of the specified type for the given entities.
     */ static getMobComponentInstances(mobComponentKey, entities) {
        const instances = [];
        let entityIds;
        if (entities) entityIds = entities.map((entity)=>entity.id);
        else entityIds = Object.keys(this.mobComponents);
        for (const entityId of entityIds){
            const instance = this.mobComponents[entityId][mobComponentKey];
            if (instance) instances.push(instance);
        }
        return instances;
    }
}
MobComponentManager.MaxDistanceToPlayer = 64;
MobComponentManager.componentsToRegister = [];
MobComponentManager.entityTypeIdsToRegister = new Set();
MobComponentManager.entityIdsRegistered = new Set();
MobComponentManager.stalledEntities = new Set();
MobComponentManager.mobComponents = {};
MobComponentManager.neverStallTypes = [
    "gm1_sky:aip"
] // Temporary work around for gametests
;
/**
 * MobComponentManager is responsible for managing the lifecycle and registration of MobComponents on entities.
 * It automatically attaches MobComponents to entities as they spawn or load, manages cleanup, and provides utilities for querying components. */ export { MobComponentManager as default };

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIk1vYkNvbXBvbmVudE1hbmFnZXIudHMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgRGltZW5zaW9uLCBEaW1lbnNpb25UeXBlcywgRW50aXR5LCBzeXN0ZW0sIFZlY3RvcjMsIHdvcmxkIH0gZnJvbSBcIkBtaW5lY3JhZnQvc2VydmVyXCI7XHJcbmltcG9ydCBFbnYgZnJvbSBcIkVudlwiO1xyXG5pbXBvcnQgVjMgZnJvbSBcIkhlbHBlcnMvVmVjdG9ycy9WM1wiO1xyXG5pbXBvcnQgQWJzdHJhY3RNb2JDb21wb25lbnQgZnJvbSBcIi4vQWJzdHJhY3RNb2JDb21wb25lbnRcIjtcclxuaW1wb3J0IE1vYkNvbXBvbmVudHMgZnJvbSBcIi4vTW9iQ29tcG9uZW50UmVnaXN0cnlcIjtcclxuXHJcbmV4cG9ydCB0eXBlIE1vYkNvbXBvbmVudEtleSA9IGtleW9mIHR5cGVvZiBNb2JDb21wb25lbnRzO1xyXG5cclxuZXhwb3J0IHR5cGUgTW9iQ29tcG9uZW50SW5zdGFuY2U8VCBleHRlbmRzIE1vYkNvbXBvbmVudEtleT4gPSBJbnN0YW5jZVR5cGU8KHR5cGVvZiBNb2JDb21wb25lbnRzKVtUXT4gfCB1bmRlZmluZWQ7XHJcblxyXG4vKipcclxuICogTW9iQ29tcG9uZW50TWFuYWdlciBpcyByZXNwb25zaWJsZSBmb3IgbWFuYWdpbmcgdGhlIGxpZmVjeWNsZSBhbmQgcmVnaXN0cmF0aW9uIG9mIE1vYkNvbXBvbmVudHMgb24gZW50aXRpZXMuXHJcbiAqIEl0IGF1dG9tYXRpY2FsbHkgYXR0YWNoZXMgTW9iQ29tcG9uZW50cyB0byBlbnRpdGllcyBhcyB0aGV5IHNwYXduIG9yIGxvYWQsIG1hbmFnZXMgY2xlYW51cCwgYW5kIHByb3ZpZGVzIHV0aWxpdGllcyBmb3IgcXVlcnlpbmcgY29tcG9uZW50cy4gKi9cclxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgTW9iQ29tcG9uZW50TWFuYWdlciB7XHJcbiAgICBwcml2YXRlIHN0YXRpYyByZWFkb25seSBNYXhEaXN0YW5jZVRvUGxheWVyID0gNjQ7XHJcbiAgICBwcml2YXRlIHN0YXRpYyByZWFkb25seSBjb21wb25lbnRzVG9SZWdpc3Rlcjoge1xyXG4gICAgICAgIGVudGl0eVR5cGVzOiBzdHJpbmdbXTtcclxuICAgICAgICBjb21wb25lbnQ6IG5ldyAoZW50aXR5OiBFbnRpdHksIHByb2Nlc3NJbnRlcnZhbD86IG51bWJlciwgcHJlRXhpc3Rpbmc/OiBib29sZWFuKSA9PiBBYnN0cmFjdE1vYkNvbXBvbmVudDtcclxuICAgICAgICBuYW1lOiBzdHJpbmc7XHJcbiAgICB9W10gPSBbXTtcclxuICAgIHByaXZhdGUgc3RhdGljIGVudGl0eVR5cGVJZHNUb1JlZ2lzdGVyID0gbmV3IFNldDxzdHJpbmc+KCk7XHJcbiAgICBwcml2YXRlIHN0YXRpYyByZWFkb25seSBlbnRpdHlJZHNSZWdpc3RlcmVkID0gbmV3IFNldDxzdHJpbmc+KCk7XHJcbiAgICBwcml2YXRlIHN0YXRpYyByZWFkb25seSBzdGFsbGVkRW50aXRpZXMgPSBuZXcgU2V0PHsgZW50aXR5OiBFbnRpdHk7IGxvY2F0aW9uOiBWMzsgZGltZW5zaW9uOiBEaW1lbnNpb24gfT4oKTtcclxuICAgIHB1YmxpYyBzdGF0aWMgbW9iQ29tcG9uZW50czogUmVjb3JkPHN0cmluZywgeyBba2V5IGluIE1vYkNvbXBvbmVudEtleV0/OiBNb2JDb21wb25lbnRJbnN0YW5jZTxrZXk+IH0+ID0ge307XHJcbiAgICBwdWJsaWMgc3RhdGljIG5ldmVyU3RhbGxUeXBlczogc3RyaW5nW10gPSBbXCJnbTFfc2t5OmFpcFwiXTsgLy8gVGVtcG9yYXJ5IHdvcmsgYXJvdW5kIGZvciBnYW1ldGVzdHNcclxuXHJcbiAgICAvKipcclxuICAgICAqIEluaXRpYWxpemVzIHRoZSBNb2JDb21wb25lbnRNYW5hZ2VyIGJ5IHJlZ2lzdGVyaW5nIGFsbCBtb2IgY29tcG9uZW50cyxcclxuICAgICAqIHN1YnNjcmliaW5nIHRvIHJlbGV2YW50IHdvcmxkIGV2ZW50cywgYW5kIHNldHRpbmcgdXAgcGVyaW9kaWMgY2hlY2tzIGFuZCBjbGVhbnVwIHJvdXRpbmVzLlxyXG4gICAgICogLSBJdGVyYXRlcyB0aHJvdWdoIGFsbCBhdmFpbGFibGUgTW9iQ29tcG9uZW50cywgcHJlcGFyaW5nIHRoZW0gZm9yIHJlZ2lzdHJhdGlvbi5cclxuICAgICAqIC0gU3Vic2NyaWJlcyB0byBwbGF5ZXIgYW5kIGVudGl0eSBzcGF3bi9sb2FkIGV2ZW50cyB0byByZWdpc3RlciBjb21wb25lbnRzIG9uIG5ldyBvciBleGlzdGluZyBlbnRpdGllcy5cclxuICAgICAqIC0gSXRlcmF0ZXMgdGhyb3VnaCBhbGwgZGltZW5zaW9ucyB0byByZWdpc3RlciBjb21wb25lbnRzIG9uIHByZS1leGlzdGluZyBlbnRpdGllcy5cclxuICAgICAqIC0gU2V0cyB1cCBpbnRlcnZhbC1iYXNlZCBjaGVja3MgZm9yIHN0YWxsZWQgZW50aXRpZXMgYW5kIHBlcmlvZGljIGNsZWFudXAuXHJcbiAgICAgKiAtIExvZ3MgdGhlIGluaXRpYWxpemF0aW9uIG9mIHRoZSBzY3JpcHQgZm9yIGRlYnVnZ2luZyBvciBhdWRpdGluZyBwdXJwb3Nlcy5cclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBpbml0KCkge1xyXG4gICAgICAgIGZvciAoY29uc3QgTW9iQ29tcG9uZW50S2V5IGluIE1vYkNvbXBvbmVudHMpIHtcclxuICAgICAgICAgICAgY29uc3QgTW9iQ29tcG9uZW50ID0gTW9iQ29tcG9uZW50c1tNb2JDb21wb25lbnRLZXldIGFzIHR5cGVvZiBNb2JDb21wb25lbnQ7XHJcbiAgICAgICAgICAgIHRoaXMuY29tcG9uZW50c1RvUmVnaXN0ZXIucHVzaCh7IGVudGl0eVR5cGVzOiBNb2JDb21wb25lbnQuRW50aXR5VHlwZXMsIGNvbXBvbmVudDogTW9iQ29tcG9uZW50LCBuYW1lOiBNb2JDb21wb25lbnRLZXkgfSk7XHJcbiAgICAgICAgICAgIHRoaXMuZW50aXR5VHlwZUlkc1RvUmVnaXN0ZXIgPSBuZXcgU2V0KFsuLi50aGlzLmVudGl0eVR5cGVJZHNUb1JlZ2lzdGVyLCAuLi5Nb2JDb21wb25lbnQuRW50aXR5VHlwZXNdKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIEV2ZW50U3Vic2NyaWJlci5zdWJzY3JpYmUoXCJXb3JsZEFmdGVyRXZlbnRzXCIsIFwicGxheWVyU3Bhd25cIiwgKHsgcGxheWVyIH0pID0+IHRoaXMucmVnaXN0ZXIocGxheWVyKSk7XHJcbiAgICAgICAgRXZlbnRTdWJzY3JpYmVyLnN1YnNjcmliZShcIldvcmxkQWZ0ZXJFdmVudHNcIiwgXCJlbnRpdHlTcGF3blwiLCAoeyBlbnRpdHkgfSkgPT4gdGhpcy5yZWdpc3RlcihlbnRpdHkpKTtcclxuICAgICAgICBFdmVudFN1YnNjcmliZXIuc3Vic2NyaWJlKFwiV29ybGRBZnRlckV2ZW50c1wiLCBcImVudGl0eUxvYWRcIiwgKHsgZW50aXR5IH0pID0+IHRoaXMucmVnaXN0ZXJQcmVFeGlzdGluZyhlbnRpdHkpKTtcclxuICAgICAgICBFdmVudFN1YnNjcmliZXIuc3Vic2NyaWJlKFwiV29ybGRCZWZvcmVFdmVudHNcIiwgXCJwbGF5ZXJMZWF2ZVwiLCAoeyBwbGF5ZXIgfSkgPT4gdGhpcy5kZXN0cm95Q29tcG9uZW50cyhwbGF5ZXIuaWQpKTtcclxuICAgICAgICBEaW1lbnNpb25UeXBlcy5nZXRBbGwoKS5mb3JFYWNoKChkaW1lbnNpb25UeXBlKSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IGVudGl0aWVzID0gd29ybGQuZ2V0RGltZW5zaW9uKGRpbWVuc2lvblR5cGUudHlwZUlkKS5nZXRFbnRpdGllcygpO1xyXG4gICAgICAgICAgICBlbnRpdGllcy5mb3JFYWNoKChlbnRpdHkpID0+IHRoaXMucmVnaXN0ZXJQcmVFeGlzdGluZyhlbnRpdHkpKTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgc3lzdGVtLnJ1bkludGVydmFsKCgpID0+IHtcclxuICAgICAgICAgICAgdGhpcy5jaGVja1N0YWxsZWRFbnRpdGllcygpO1xyXG4gICAgICAgIH0sIDMwKTtcclxuICAgICAgICBzeXN0ZW0ucnVuSW50ZXJ2YWwoKCkgPT4gdGhpcy5jbGVhbnVwKCksIDEwKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFJlZ2lzdGVycyBhbiBlbnRpdHkgdGhhdCBtYXkgYWxyZWFkeSBleGlzdCBpbiB0aGUgd29ybGQuXHJcbiAgICAgKiBAcGFyYW0gZW50aXR5IC0gVGhlIGVudGl0eSB0byByZWdpc3RlclxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHJlZ2lzdGVyUHJlRXhpc3RpbmcoZW50aXR5OiBFbnRpdHkpIHtcclxuICAgICAgICB0aGlzLnJlZ2lzdGVyKGVudGl0eSwgdHJ1ZSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBSZWdpc3RlcnMgYW4gZW50aXR5IHdpdGggdGhlIE1vYkNvbXBvbmVudE1hbmFnZXIsIGluaXRpYWxpemluZyBpdHMgY29tcG9uZW50cyBpZiBhcHBsaWNhYmxlLlxyXG4gICAgICogQHBhcmFtIGVudGl0eSAtIFRoZSBlbnRpdHkgdG8gcmVnaXN0ZXIuXHJcbiAgICAgKiBAcGFyYW0gcHJlRXhpc3RpbmcgLSBPcHRpb25hbC4gSW5kaWNhdGVzIGlmIHRoZSBlbnRpdHkgYWxyZWFkeSBleGlzdGVkIGJlZm9yZSByZWdpc3RyYXRpb24uIERlZmF1bHRzIHRvIGBmYWxzZWAuXHJcbiAgICAgKiBAcGFyYW0gaXNXaXRoaW5SYW5nZSAtIE9wdGlvbmFsLiBJZiBzcGVjaWZpZWQsIGRldGVybWluZXMgd2hldGhlciB0aGUgZW50aXR5IGlzIHdpdGhpbiB0aGUgcmVxdWlyZWQgcmFuZ2UgZm9yIHJlZ2lzdHJhdGlvbi5cclxuICAgICAqIEByZW1hcmtzXHJcbiAgICAgKiAtIE9ubHkgdmFsaWQgZW50aXRpZXMgb2YgdHlwZXMgcHJlc2VudCBpbiBgZW50aXR5VHlwZUlkc1RvUmVnaXN0ZXJgIGFyZSBjb25zaWRlcmVkLlxyXG4gICAgICogLSBFbnRpdGllcyBhbHJlYWR5IHJlZ2lzdGVyZWQgYXJlIGlnbm9yZWQuXHJcbiAgICAgKiAtIElmIGBpc1dpdGhpblJhbmdlYCBpcyBub3QgcHJvdmlkZWQsIGl0IGlzIGNvbXB1dGVkIGJhc2VkIG9uIHRoZSBlbnRpdHkncyBsb2NhdGlvbiBhbmQgZGltZW5zaW9uLlxyXG4gICAgICogLSBOb24tcGxheWVyIGVudGl0aWVzIG91dHNpZGUgdGhlIHJlcXVpcmVkIHJhbmdlIGFyZSBzdGFsbGVkIGZvciBsYXRlciByZWdpc3RyYXRpb24uXHJcbiAgICAgKiAtIEZvciBlbGlnaWJsZSBlbnRpdGllcywgY29tcG9uZW50IGluc3RhbmNlcyBhcmUgY3JlYXRlZCBhbmQgYXNzb2NpYXRlZCB3aXRoIHRoZSBlbnRpdHkuXHJcbiAgICAgKiAtIEVtaXRzIHRoZSBgXCJFbnRpdHlMb2FkZWRcImAgZXZlbnQgdXBvbiBzdWNjZXNzZnVsIHJlZ2lzdHJhdGlvbi5cclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyByZWdpc3RlcihlbnRpdHk6IEVudGl0eSwgcHJlRXhpc3RpbmcgPSBmYWxzZSwgaXNXaXRoaW5SYW5nZT86IGJvb2xlYW4pIHtcclxuICAgICAgICBpZiAoIWVudGl0eS5pc1ZhbGlkKSByZXR1cm47XHJcblxyXG4gICAgICAgIGlmICghdGhpcy5lbnRpdHlUeXBlSWRzVG9SZWdpc3Rlci5oYXMoZW50aXR5LnR5cGVJZCkpIHJldHVybjtcclxuICAgICAgICBpZiAodGhpcy5lbnRpdHlJZHNSZWdpc3RlcmVkLmhhcyhlbnRpdHkuaWQpKSByZXR1cm47XHJcblxyXG4gICAgICAgIGlmIChpc1dpdGhpblJhbmdlID09PSB1bmRlZmluZWQpIGlzV2l0aGluUmFuZ2UgPSB0aGlzLmlzV2l0aGluUmFuZ2UoZW50aXR5LmxvY2F0aW9uLCBlbnRpdHkuZGltZW5zaW9uKTtcclxuXHJcbiAgICAgICAgY29uc3QgbmV2ZXJTdGFsbCA9IHRoaXMubmV2ZXJTdGFsbFR5cGVzLmluY2x1ZGVzKGVudGl0eS50eXBlSWQpO1xyXG4gICAgICAgIGlmICghaXNXaXRoaW5SYW5nZSAmJiBlbnRpdHkudHlwZUlkICE9PSBcIm1pbmVjcmFmdDpwbGF5ZXJcIiAmJiAhbmV2ZXJTdGFsbCkge1xyXG4gICAgICAgICAgICB0aGlzLnN0YWxsZWRFbnRpdGllcy5hZGQoeyBlbnRpdHksIGxvY2F0aW9uOiBWMy5mcm9tRW50aXR5KGVudGl0eSksIGRpbWVuc2lvbjogZW50aXR5LmRpbWVuc2lvbiB9KTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdGhpcy5lbnRpdHlJZHNSZWdpc3RlcmVkLmFkZChlbnRpdHkuaWQpO1xyXG5cclxuICAgICAgICB0aGlzLm1vYkNvbXBvbmVudHNbZW50aXR5LmlkXSA9IHt9O1xyXG4gICAgICAgIGZvciAoY29uc3QgeyBlbnRpdHlUeXBlcywgY29tcG9uZW50IH0gb2YgdGhpcy5jb21wb25lbnRzVG9SZWdpc3Rlcikge1xyXG4gICAgICAgICAgICBpZiAoZW50aXR5VHlwZXMuaW5jbHVkZXMoZW50aXR5LnR5cGVJZCkpIHtcclxuICAgICAgICAgICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgY29tcG9uZW50SW5zdGFuY2UgPSBuZXcgY29tcG9uZW50KGVudGl0eSwgdW5kZWZpbmVkLCBwcmVFeGlzdGluZyk7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5tb2JDb21wb25lbnRzW2VudGl0eS5pZF1bY29tcG9uZW50Lm5hbWVdID0gY29tcG9uZW50SW5zdGFuY2U7XHJcbiAgICAgICAgICAgICAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IG1lc3NhZ2UgPSBgWyR7Y29tcG9uZW50Lm5hbWV9XSBJbml0aWFsaXphdGlvbiBFcnJvciAoJHtlbnRpdHkuaWR9LCAke2VudGl0eS50eXBlSWR9KTpgO1xyXG4gICAgICAgICAgICAgICAgICAgIGlmIChlcnJvciBpbnN0YW5jZW9mIEVycm9yKSBjb25zb2xlLmVycm9yKG1lc3NhZ2UsIFwiXFxuXCIsIGVycm9yLCBcIlxcblwiLCBlcnJvci5zdGFjayk7XHJcbiAgICAgICAgICAgICAgICAgICAgZWxzZSBjb25zb2xlLmVycm9yKG1lc3NhZ2UsIGVycm9yKTtcclxuICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgQ3VzdG9tRXZlbnRzLmVtaXQoXCJFbnRpdHlMb2FkZWRcIiwgZW50aXR5KTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIERldGVybWluZXMgd2hldGhlciB0aGUgc3BlY2lmaWVkIGxvY2F0aW9uIGlzIHdpdGhpbiBhIGNlcnRhaW4gbWF4aW11bSBkaXN0YW5jZVxyXG4gICAgICogdG8gdGhlIGNsb3Nlc3QgcGxheWVyIGluIHRoZSBnaXZlbiBkaW1lbnNpb24uXHJcbiAgICAgKiBAcGFyYW0gbG9jYXRpb24gLSBUaGUgM0QgdmVjdG9yIHJlcHJlc2VudGluZyB0aGUgbG9jYXRpb24gdG8gY2hlY2suXHJcbiAgICAgKiBAcGFyYW0gZGltZW5zaW9uIC0gVGhlIGRpbWVuc2lvbiBpbiB3aGljaCB0byBzZWFyY2ggZm9yIHBsYXllcnMuXHJcbiAgICAgKiBAcmV0dXJucyBgdHJ1ZWAgaWYgdGhlIGxvY2F0aW9uIGlzIHdpdGhpbiB0aGUgbWF4aW11bSBhbGxvd2VkIGRpc3RhbmNlIHRvIGFueSBwbGF5ZXI7IG90aGVyd2lzZSwgYGZhbHNlYC5cclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBpc1dpdGhpblJhbmdlKGxvY2F0aW9uOiBWZWN0b3IzLCBkaW1lbnNpb246IERpbWVuc2lvbikge1xyXG4gICAgICAgIGlmIChFbnYgPT09IFwidGVzdFwiKSByZXR1cm4gdHJ1ZTsgLy8gRG9uJ3Qgc3RhbGwgZW50aXRpZXMgaW4gdGVzdHMgc2luY2UgcGxheWVycyBhcmVuJ3QgcHJlc2VudFxyXG4gICAgICAgIHJldHVybiBQbGF5ZXJzQ2FjaGUuZ2V0RGlzdGFuY2VUb0Nsb3Nlc3RQbGF5ZXIobG9jYXRpb24sIGRpbWVuc2lvbikgPD0gdGhpcy5NYXhEaXN0YW5jZVRvUGxheWVyO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogV2FpdHMgZm9yIGEgc3BlY2lmaWVkIG51bWJlciBvZiB0aWNrcy5cclxuICAgICAqIEBwYXJhbSB0aW1lIC0gVGhlIG51bWJlciBvZiB0aWNrcyB0byB3YWl0LlxyXG4gICAgICogQHJldHVybnMgQSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgYWZ0ZXIgdGhlIHNwZWNpZmllZCB0aW1lLlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGFzeW5jIHdhaXQodGltZTogbnVtYmVyKSB7XHJcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlPHZvaWQ+KChyZXNvbHZlKSA9PiBzeXN0ZW0ucnVuVGltZW91dCgoKSA9PiByZXNvbHZlKCksIHRpbWUpKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEl0ZXJhdGVzIHRocm91Z2ggYWxsIHN0YWxsZWQgZW50aXRpZXMgYW5kIHByb2Nlc3NlcyB0aGVtLlxyXG4gICAgICogRm9yIGVhY2ggZW50aXR5IGluIGB0aGlzLnN0YWxsZWRFbnRpdGllc2AsIHRoaXMgbWV0aG9kOlxyXG4gICAgICogLSBQZXJpb2RpY2FsbHkgeWllbGRzIGV4ZWN1dGlvbiB0byBhdm9pZCBibG9ja2luZyAoZXZlcnkgMTAgZW50aXRpZXMpLlxyXG4gICAgICogLSBDaGVja3MgaWYgdGhlIGVudGl0eSBpcyBzdGlsbCB2YWxpZCB1c2luZyBgRW50aXR5VXRpbC5pc1ZhbGlkYC5cclxuICAgICAqICAgLSBJZiBub3QgdmFsaWQsIHJlbW92ZXMgdGhlIGVudGl0eSBmcm9tIGBzdGFsbGVkRW50aXRpZXNgLlxyXG4gICAgICogLSBDaGVja3MgaWYgdGhlIGVudGl0eSBpcyB3aXRoaW4gYSBjZXJ0YWluIHJhbmdlIHVzaW5nIGBpc1dpdGhpblJhbmdlYC5cclxuICAgICAqICAgLSBJZiBub3Qgd2l0aGluIHJhbmdlLCBza2lwcyBmdXJ0aGVyIHByb2Nlc3NpbmcuXHJcbiAgICAgKiAtIElmIHZhbGlkIGFuZCB3aXRoaW4gcmFuZ2UsIHJlZ2lzdGVycyB0aGUgZW50aXR5IGFuZCByZW1vdmVzIGl0IGZyb20gYHN0YWxsZWRFbnRpdGllc2AuXHJcbiAgICAgKiBAcmV0dXJucyBBIHByb21pc2UgdGhhdCByZXNvbHZlcyB3aGVuIGFsbCBzdGFsbGVkIGVudGl0aWVzIGhhdmUgYmVlbiBwcm9jZXNzZWQuXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgYXN5bmMgY2hlY2tTdGFsbGVkRW50aXRpZXMoKSB7XHJcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLnN0YWxsZWRFbnRpdGllcy5zaXplOyBpKyspIHtcclxuICAgICAgICAgICAgY29uc3QgZW50cnkgPSBbLi4udGhpcy5zdGFsbGVkRW50aXRpZXNdW2ldO1xyXG5cclxuICAgICAgICAgICAgaWYgKGkgJSAxMCA9PT0gMCkgYXdhaXQgdGhpcy53YWl0KDApO1xyXG4gICAgICAgICAgICBjb25zdCBpc1ZhbGlkID0gZW50cnkuZW50aXR5LmlzVmFsaWQ7XHJcbiAgICAgICAgICAgIGlmICghaXNWYWxpZCkge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5zdGFsbGVkRW50aXRpZXMuZGVsZXRlKGVudHJ5KTtcclxuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICBjb25zdCBpc1dpdGhpblJhbmdlID0gdGhpcy5pc1dpdGhpblJhbmdlKGVudHJ5LmxvY2F0aW9uLCBlbnRyeS5kaW1lbnNpb24pO1xyXG4gICAgICAgICAgICBpZiAoIWlzV2l0aGluUmFuZ2UpIGNvbnRpbnVlO1xyXG5cclxuICAgICAgICAgICAgdGhpcy5yZWdpc3RlcihlbnRyeS5lbnRpdHksIGZhbHNlLCB0cnVlKTtcclxuICAgICAgICAgICAgdGhpcy5zdGFsbGVkRW50aXRpZXMuZGVsZXRlKGVudHJ5KTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBDbGVhbnMgdXAgbW9iIGNvbXBvbmVudHMgbWFuYWdlZCBieSB0aGUgTW9iQ29tcG9uZW50TWFuYWdlci5cclxuICAgICAqIEl0ZXJhdGVzIHRocm91Z2ggYWxsIHJlZ2lzdGVyZWQgbW9iIGNvbXBvbmVudHMsIGNoZWNraW5nIHRoZSB2YWxpZGl0eSBvZiB0aGVpciBhc3NvY2lhdGVkIGVudGl0aWVzLlxyXG4gICAgICogLSBJZiBhbiBlbnRpdHkgaXMgaW52YWxpZCwgaXRzIGNvbXBvbmVudHMgYXJlIGRlc3Ryb3llZCBhbmQgcmVtb3ZlZCBmcm9tIG1hbmFnZW1lbnQuXHJcbiAgICAgKiAtIElmIGFuIGVudGl0eSBpcyBub3QgYSBwbGF5ZXIgYW5kIGlzIG91dHNpZGUgYSBzcGVjaWZpZWQgcmFuZ2UsIGl0cyBjb21wb25lbnRzIGFyZSBzdGFsbGVkIGFuZCB0aGVuIGRlc3Ryb3llZC5cclxuICAgICAqIC0gU3RhbGxlZCBlbnRpdGllcyBhcmUgdHJhY2tlZCBmb3IgcG90ZW50aWFsIHJlYWN0aXZhdGlvbi5cclxuICAgICAqIFVzZXMgRGVidWdUaW1lciB0byBwcm9maWxlIGV4ZWN1dGlvbiB0aW1lIGZvciBwZXJmb3JtYW5jZSBtb25pdG9yaW5nLlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGNsZWFudXAoKSB7XHJcbiAgICAgICAgRGVidWdUaW1lci5jb3VudFN0YXJ0KFwiTUNNLmNsZWFudXBcIik7XHJcbiAgICAgICAgZm9yIChjb25zdCBlbnRpdHlJZCBpbiB0aGlzLm1vYkNvbXBvbmVudHMpIHtcclxuICAgICAgICAgICAgY29uc3QgZW50aXR5ID0gd29ybGQuZ2V0RW50aXR5KGVudGl0eUlkKTtcclxuXHJcbiAgICAgICAgICAgIGxldCBzaG91bGREZXN0cm95ID0gZmFsc2U7XHJcbiAgICAgICAgICAgIGxldCBzaG91bGRTdGFsbCA9IGZhbHNlO1xyXG5cclxuICAgICAgICAgICAgRGVidWdUaW1lci5jb3VudFN0YXJ0KFwiTUNNLmNsZWFudXAuaXNWYWxpZFwiKTtcclxuICAgICAgICAgICAgaWYgKCFlbnRpdHk/LmlzVmFsaWQpIHtcclxuICAgICAgICAgICAgICAgIHNob3VsZERlc3Ryb3kgPSB0cnVlO1xyXG4gICAgICAgICAgICB9IGVsc2UgaWYgKGVudGl0eS50eXBlSWQgIT09IFwibWluZWNyYWZ0OnBsYXllclwiKSB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBsb2NhdGlvbiA9IHRoaXMubW9iQ29tcG9uZW50c1tlbnRpdHlJZF1bMF0/LmVudGl0eUxvY2F0aW9uIHx8IGVudGl0eS5sb2NhdGlvbjtcclxuICAgICAgICAgICAgICAgIGNvbnN0IG5ldmVyU3RhbGwgPSB0aGlzLm5ldmVyU3RhbGxUeXBlcy5pbmNsdWRlcyhlbnRpdHkudHlwZUlkKTtcclxuICAgICAgICAgICAgICAgIHNob3VsZFN0YWxsID0gIXRoaXMuaXNXaXRoaW5SYW5nZShsb2NhdGlvbiwgZW50aXR5LmRpbWVuc2lvbikgJiYgIW5ldmVyU3RhbGw7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgRGVidWdUaW1lci5jb3VudEVuZCgpO1xyXG5cclxuICAgICAgICAgICAgaWYgKHNob3VsZFN0YWxsKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnN0YWxsZWRFbnRpdGllcy5hZGQoeyBlbnRpdHk6IGVudGl0eSEsIGxvY2F0aW9uOiBWMy5mcm9tRW50aXR5KGVudGl0eSEpLCBkaW1lbnNpb246IGVudGl0eSEuZGltZW5zaW9uIH0pO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGlmIChzaG91bGREZXN0cm95IHx8IHNob3VsZFN0YWxsKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmRlc3Ryb3lDb21wb25lbnRzKGVudGl0eUlkKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICBEZWJ1Z1RpbWVyLmNvdW50RW5kKCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHVibGljIHN0YXRpYyBkZXN0cm95Q29tcG9uZW50cyhlbnRpdHlJZDogc3RyaW5nKSB7XHJcbiAgICAgICAgZm9yIChjb25zdCBjb21wb25lbnQgaW4gdGhpcy5tb2JDb21wb25lbnRzW2VudGl0eUlkXSkge1xyXG4gICAgICAgICAgICBjb25zdCBpbnN0YW5jZSA9IHRoaXMubW9iQ29tcG9uZW50c1tlbnRpdHlJZF1bY29tcG9uZW50XTtcclxuICAgICAgICAgICAgaW5zdGFuY2UuZGVzdHJveSgpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBkZWxldGUgdGhpcy5tb2JDb21wb25lbnRzW2VudGl0eUlkXTtcclxuICAgICAgICB0aGlzLmVudGl0eUlkc1JlZ2lzdGVyZWQuZGVsZXRlKGVudGl0eUlkKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIENvdW50cyB0aGUgbnVtYmVyIG9mIHJlZ2lzdGVyZWQgZW50aXRpZXMgZ3JvdXBlZCBieSB0aGVpciB0eXBlIElELlxyXG4gICAgICogSXRlcmF0ZXMgdGhyb3VnaCBhbGwgcmVnaXN0ZXJlZCBtb2IgY29tcG9uZW50cywgdGFsbGllcyB0aGUgY291bnQgZm9yIGVhY2ggdW5pcXVlIGBlbnRpdHlUeXBlSWRgLFxyXG4gICAgICogc29ydHMgdGhlIHJlc3VsdHMgaW4gZGVzY2VuZGluZyBvcmRlciBieSBjb3VudCwgYW5kIHJldHVybnMgYSBKU09OIHN0cmluZyBjb250YWluaW5nIHRoZSB0b3RhbCBjb3VudFxyXG4gICAgICogYW5kIHRoZSBzb3J0ZWQgY291bnRzIHBlciBlbnRpdHkgdHlwZS5cclxuICAgICAqIEByZXR1cm5zIHtzdHJpbmd9IEEgSlNPTiBzdHJpbmcgd2l0aCB0aGUgdG90YWwgbnVtYmVyIG9mIGVudGl0aWVzIGFuZCB0aGUgY291bnQgcGVyIGVudGl0eSB0eXBlLCBzb3J0ZWQgYnkgY291bnQuXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgY291bnRSZWdpc3RlcmVkRW50aXRpZXMoKTogc3RyaW5nIHtcclxuICAgICAgICBjb25zdCBjb3VudCA9IHt9O1xyXG4gICAgICAgIGZvciAoY29uc3QgZW50aXR5SWQgaW4gdGhpcy5tb2JDb21wb25lbnRzKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGZpcnN0Q29tcG9uZW50ID0gT2JqZWN0LnZhbHVlcyh0aGlzLm1vYkNvbXBvbmVudHNbZW50aXR5SWRdKVswXTtcclxuICAgICAgICAgICAgY29uc3QgdHlwZUlkID0gZmlyc3RDb21wb25lbnQuZW50aXR5VHlwZUlkO1xyXG4gICAgICAgICAgICBpZiAoIXR5cGVJZCkgY29udGludWU7IC8vIFNraXAgaWYgbm8gdmFsaWQgY29tcG9uZW50IG9yIHR5cGVJZFxyXG4gICAgICAgICAgICBpZiAoY291bnRbdHlwZUlkXSkgY291bnRbdHlwZUlkXSsrO1xyXG4gICAgICAgICAgICBlbHNlIGNvdW50W3R5cGVJZF0gPSAxO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc3Qgc29ydGVkID0gT2JqZWN0LmtleXMoY291bnQpLnNvcnQoKGEsIGIpID0+IGNvdW50W2JdIC0gY291bnRbYV0pO1xyXG4gICAgICAgIGNvbnN0IHNvcnRlZENvdW50ID0ge307XHJcbiAgICAgICAgZm9yIChjb25zdCBrZXkgb2Ygc29ydGVkKSB7XHJcbiAgICAgICAgICAgIHNvcnRlZENvdW50W2tleV0gPSBjb3VudFtrZXldO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc3QgdG90YWwgPSBPYmplY3Qua2V5cyhjb3VudCkucmVkdWNlKChhY2MsIGtleSkgPT4gYWNjICsgY291bnRba2V5XSwgMCk7XHJcblxyXG4gICAgICAgIHJldHVybiBgJHtKU09OLnN0cmluZ2lmeSh7IHRvdGFsLCAuLi5zb3J0ZWRDb3VudCB9KX1gO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogUmV0cmlldmVzIHRoZSBzcGVjaWZpZWQgbW9iIGNvbXBvbmVudCBpbnN0YW5jZSBhc3NvY2lhdGVkIHdpdGggYSBnaXZlbiBlbnRpdHkuXHJcbiAgICAgKiBAcGFyYW0gZW50aXR5IC0gVGhlIGVudGl0eSB3aG9zZSBtb2IgY29tcG9uZW50IGlzIGJlaW5nIHJlcXVlc3RlZC5cclxuICAgICAqIEBwYXJhbSBtb2JDb21wb25lbnRLZXkgLSBUaGUga2V5IGlkZW50aWZ5aW5nIHRoZSBzcGVjaWZpYyBtb2IgY29tcG9uZW50LiBUaGlzIGlzIHRoZSBjbGFzcyBuYW1lIG9mIHRoZSBtb2IgY29tcG9uZW50LlxyXG4gICAgICogQHJldHVybnMgVGhlIGluc3RhbmNlIG9mIHRoZSByZXF1ZXN0ZWQgbW9iIGNvbXBvbmVudCBpZiBpdCBleGlzdHMsIG90aGVyd2lzZSBgdW5kZWZpbmVkYC5cclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBnZXRNb2JDb21wb25lbnRPZkVudGl0eTxUIGV4dGVuZHMgTW9iQ29tcG9uZW50S2V5PihcclxuICAgICAgICBlbnRpdHk6IEVudGl0eSxcclxuICAgICAgICBtb2JDb21wb25lbnRLZXk6IFRcclxuICAgICk6IE1vYkNvbXBvbmVudEluc3RhbmNlPFQ+IHwgdW5kZWZpbmVkIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5tb2JDb21wb25lbnRzW2VudGl0eS5pZF1bbW9iQ29tcG9uZW50S2V5XTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFJldHJpZXZlcyBhbGwgaW5zdGFuY2VzIG9mIGEgc3BlY2lmaWMgbW9iIGNvbXBvbmVudCBmb3IgdGhlIGdpdmVuIGVudGl0aWVzLlxyXG4gICAgICogQHBhcmFtIG1vYkNvbXBvbmVudEtleSAtIFRoZSBrZXkgaWRlbnRpZnlpbmcgdGhlIHR5cGUgb2YgbW9iIGNvbXBvbmVudCB0byByZXRyaWV2ZS4gVGhpcyBpcyB0aGUgY2xhc3MgbmFtZSBvZiB0aGUgbW9iIGNvbXBvbmVudC5cclxuICAgICAqIEBwYXJhbSBlbnRpdGllcyAtIChPcHRpb25hbCkgQW4gYXJyYXkgb2YgZW50aXRpZXMgdG8gZmlsdGVyIGJ5LiBJZiBub3QgcHJvdmlkZWQsIGFsbCBlbnRpdGllcyBhcmUgY29uc2lkZXJlZC5cclxuICAgICAqIEByZXR1cm5zIEFuIGFycmF5IG9mIG1vYiBjb21wb25lbnQgaW5zdGFuY2VzIG9mIHRoZSBzcGVjaWZpZWQgdHlwZSBmb3IgdGhlIGdpdmVuIGVudGl0aWVzLlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGdldE1vYkNvbXBvbmVudEluc3RhbmNlczxUIGV4dGVuZHMgTW9iQ29tcG9uZW50S2V5Pihtb2JDb21wb25lbnRLZXk6IFQsIGVudGl0aWVzPzogRW50aXR5W10pOiBNb2JDb21wb25lbnRJbnN0YW5jZTxUPltdIHtcclxuICAgICAgICBjb25zdCBpbnN0YW5jZXM6IE1vYkNvbXBvbmVudEluc3RhbmNlPFQ+W10gPSBbXTtcclxuXHJcbiAgICAgICAgbGV0IGVudGl0eUlkczogc3RyaW5nW107XHJcbiAgICAgICAgaWYgKGVudGl0aWVzKSBlbnRpdHlJZHMgPSBlbnRpdGllcy5tYXAoKGVudGl0eSkgPT4gZW50aXR5LmlkKTtcclxuICAgICAgICBlbHNlIGVudGl0eUlkcyA9IE9iamVjdC5rZXlzKHRoaXMubW9iQ29tcG9uZW50cyk7XHJcblxyXG4gICAgICAgIGZvciAoY29uc3QgZW50aXR5SWQgb2YgZW50aXR5SWRzKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGluc3RhbmNlID0gdGhpcy5tb2JDb21wb25lbnRzW2VudGl0eUlkXVttb2JDb21wb25lbnRLZXldO1xyXG4gICAgICAgICAgICBpZiAoaW5zdGFuY2UpIGluc3RhbmNlcy5wdXNoKGluc3RhbmNlKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHJldHVybiBpbnN0YW5jZXM7XHJcbiAgICB9XHJcbn1cclxuIl0sIm5hbWVzIjpbIkRpbWVuc2lvblR5cGVzIiwic3lzdGVtIiwid29ybGQiLCJFbnYiLCJWMyIsIk1vYkNvbXBvbmVudHMiLCJNb2JDb21wb25lbnRNYW5hZ2VyIiwiaW5pdCIsIk1vYkNvbXBvbmVudEtleSIsIk1vYkNvbXBvbmVudCIsImNvbXBvbmVudHNUb1JlZ2lzdGVyIiwicHVzaCIsImVudGl0eVR5cGVzIiwiRW50aXR5VHlwZXMiLCJjb21wb25lbnQiLCJuYW1lIiwiZW50aXR5VHlwZUlkc1RvUmVnaXN0ZXIiLCJTZXQiLCJFdmVudFN1YnNjcmliZXIiLCJzdWJzY3JpYmUiLCJwbGF5ZXIiLCJyZWdpc3RlciIsImVudGl0eSIsInJlZ2lzdGVyUHJlRXhpc3RpbmciLCJkZXN0cm95Q29tcG9uZW50cyIsImlkIiwiZ2V0QWxsIiwiZm9yRWFjaCIsImRpbWVuc2lvblR5cGUiLCJlbnRpdGllcyIsImdldERpbWVuc2lvbiIsInR5cGVJZCIsImdldEVudGl0aWVzIiwicnVuSW50ZXJ2YWwiLCJjaGVja1N0YWxsZWRFbnRpdGllcyIsImNsZWFudXAiLCJwcmVFeGlzdGluZyIsImlzV2l0aGluUmFuZ2UiLCJpc1ZhbGlkIiwiaGFzIiwiZW50aXR5SWRzUmVnaXN0ZXJlZCIsInVuZGVmaW5lZCIsImxvY2F0aW9uIiwiZGltZW5zaW9uIiwibmV2ZXJTdGFsbCIsIm5ldmVyU3RhbGxUeXBlcyIsImluY2x1ZGVzIiwic3RhbGxlZEVudGl0aWVzIiwiYWRkIiwiZnJvbUVudGl0eSIsIm1vYkNvbXBvbmVudHMiLCJjb21wb25lbnRJbnN0YW5jZSIsImVycm9yIiwibWVzc2FnZSIsIkVycm9yIiwiY29uc29sZSIsInN0YWNrIiwiQ3VzdG9tRXZlbnRzIiwiZW1pdCIsIlBsYXllcnNDYWNoZSIsImdldERpc3RhbmNlVG9DbG9zZXN0UGxheWVyIiwiTWF4RGlzdGFuY2VUb1BsYXllciIsIndhaXQiLCJ0aW1lIiwiUHJvbWlzZSIsInJlc29sdmUiLCJydW5UaW1lb3V0IiwiaSIsInNpemUiLCJlbnRyeSIsImRlbGV0ZSIsIkRlYnVnVGltZXIiLCJjb3VudFN0YXJ0IiwiZW50aXR5SWQiLCJnZXRFbnRpdHkiLCJzaG91bGREZXN0cm95Iiwic2hvdWxkU3RhbGwiLCJlbnRpdHlMb2NhdGlvbiIsImNvdW50RW5kIiwiaW5zdGFuY2UiLCJkZXN0cm95IiwiY291bnRSZWdpc3RlcmVkRW50aXRpZXMiLCJjb3VudCIsImZpcnN0Q29tcG9uZW50IiwiT2JqZWN0IiwidmFsdWVzIiwiZW50aXR5VHlwZUlkIiwic29ydGVkIiwia2V5cyIsInNvcnQiLCJhIiwiYiIsInNvcnRlZENvdW50Iiwia2V5IiwidG90YWwiLCJyZWR1Y2UiLCJhY2MiLCJKU09OIiwic3RyaW5naWZ5IiwiZ2V0TW9iQ29tcG9uZW50T2ZFbnRpdHkiLCJtb2JDb21wb25lbnRLZXkiLCJnZXRNb2JDb21wb25lbnRJbnN0YW5jZXMiLCJpbnN0YW5jZXMiLCJlbnRpdHlJZHMiLCJtYXAiXSwibWFwcGluZ3MiOiJBQUFBLFNBQW9CQSxjQUFjLEVBQVVDLE1BQU0sRUFBV0MsS0FBSyxRQUFRLG9CQUFvQjtBQUM5RixPQUFPQyxTQUFTLE1BQU07QUFDdEIsT0FBT0MsUUFBUSxxQkFBcUI7QUFFcEMsT0FBT0MsbUJBQW1CLHlCQUF5QjtBQVNwQyxNQUFNQztJQWFqQjs7Ozs7Ozs7S0FRQyxHQUNELE9BQWNDLE9BQU87UUFDakIsSUFBSyxNQUFNQyxtQkFBbUJILGNBQWU7WUFDekMsTUFBTUksZUFBZUosYUFBYSxDQUFDRyxnQkFBZ0I7WUFDbkQsSUFBSSxDQUFDRSxvQkFBb0IsQ0FBQ0MsSUFBSSxDQUFDO2dCQUFFQyxhQUFhSCxhQUFhSSxXQUFXO2dCQUFFQyxXQUFXTDtnQkFBY00sTUFBTVA7WUFBZ0I7WUFDdkgsSUFBSSxDQUFDUSx1QkFBdUIsR0FBRyxJQUFJQyxJQUFJO21CQUFJLElBQUksQ0FBQ0QsdUJBQXVCO21CQUFLUCxhQUFhSSxXQUFXO2FBQUM7UUFDekc7UUFFQUssZ0JBQWdCQyxTQUFTLENBQUMsb0JBQW9CLGVBQWUsQ0FBQyxFQUFFQyxNQUFNLEVBQUUsR0FBSyxJQUFJLENBQUNDLFFBQVEsQ0FBQ0Q7UUFDM0ZGLGdCQUFnQkMsU0FBUyxDQUFDLG9CQUFvQixlQUFlLENBQUMsRUFBRUcsTUFBTSxFQUFFLEdBQUssSUFBSSxDQUFDRCxRQUFRLENBQUNDO1FBQzNGSixnQkFBZ0JDLFNBQVMsQ0FBQyxvQkFBb0IsY0FBYyxDQUFDLEVBQUVHLE1BQU0sRUFBRSxHQUFLLElBQUksQ0FBQ0MsbUJBQW1CLENBQUNEO1FBQ3JHSixnQkFBZ0JDLFNBQVMsQ0FBQyxxQkFBcUIsZUFBZSxDQUFDLEVBQUVDLE1BQU0sRUFBRSxHQUFLLElBQUksQ0FBQ0ksaUJBQWlCLENBQUNKLE9BQU9LLEVBQUU7UUFDOUd6QixlQUFlMEIsTUFBTSxHQUFHQyxPQUFPLENBQUMsQ0FBQ0M7WUFDN0IsTUFBTUMsV0FBVzNCLE1BQU00QixZQUFZLENBQUNGLGNBQWNHLE1BQU0sRUFBRUMsV0FBVztZQUNyRUgsU0FBU0YsT0FBTyxDQUFDLENBQUNMLFNBQVcsSUFBSSxDQUFDQyxtQkFBbUIsQ0FBQ0Q7UUFDMUQ7UUFFQXJCLE9BQU9nQyxXQUFXLENBQUM7WUFDZixJQUFJLENBQUNDLG9CQUFvQjtRQUM3QixHQUFHO1FBQ0hqQyxPQUFPZ0MsV0FBVyxDQUFDLElBQU0sSUFBSSxDQUFDRSxPQUFPLElBQUk7SUFDN0M7SUFFQTs7O0tBR0MsR0FDRCxPQUFjWixvQkFBb0JELE1BQWMsRUFBRTtRQUM5QyxJQUFJLENBQUNELFFBQVEsQ0FBQ0MsUUFBUTtJQUMxQjtJQUVBOzs7Ozs7Ozs7Ozs7S0FZQyxHQUNELE9BQWNELFNBQVNDLE1BQWMsRUFBRWMsY0FBYyxLQUFLLEVBQUVDLGFBQXVCLEVBQUU7UUFDakYsSUFBSSxDQUFDZixPQUFPZ0IsT0FBTyxFQUFFO1FBRXJCLElBQUksQ0FBQyxJQUFJLENBQUN0Qix1QkFBdUIsQ0FBQ3VCLEdBQUcsQ0FBQ2pCLE9BQU9TLE1BQU0sR0FBRztRQUN0RCxJQUFJLElBQUksQ0FBQ1MsbUJBQW1CLENBQUNELEdBQUcsQ0FBQ2pCLE9BQU9HLEVBQUUsR0FBRztRQUU3QyxJQUFJWSxrQkFBa0JJLFdBQVdKLGdCQUFnQixJQUFJLENBQUNBLGFBQWEsQ0FBQ2YsT0FBT29CLFFBQVEsRUFBRXBCLE9BQU9xQixTQUFTO1FBRXJHLE1BQU1DLGFBQWEsSUFBSSxDQUFDQyxlQUFlLENBQUNDLFFBQVEsQ0FBQ3hCLE9BQU9TLE1BQU07UUFDOUQsSUFBSSxDQUFDTSxpQkFBaUJmLE9BQU9TLE1BQU0sS0FBSyxzQkFBc0IsQ0FBQ2EsWUFBWTtZQUN2RSxJQUFJLENBQUNHLGVBQWUsQ0FBQ0MsR0FBRyxDQUFDO2dCQUFFMUI7Z0JBQVFvQixVQUFVdEMsR0FBRzZDLFVBQVUsQ0FBQzNCO2dCQUFTcUIsV0FBV3JCLE9BQU9xQixTQUFTO1lBQUM7WUFDaEc7UUFDSjtRQUVBLElBQUksQ0FBQ0gsbUJBQW1CLENBQUNRLEdBQUcsQ0FBQzFCLE9BQU9HLEVBQUU7UUFFdEMsSUFBSSxDQUFDeUIsYUFBYSxDQUFDNUIsT0FBT0csRUFBRSxDQUFDLEdBQUcsQ0FBQztRQUNqQyxLQUFLLE1BQU0sRUFBRWIsV0FBVyxFQUFFRSxTQUFTLEVBQUUsSUFBSSxJQUFJLENBQUNKLG9CQUFvQixDQUFFO1lBQ2hFLElBQUlFLFlBQVlrQyxRQUFRLENBQUN4QixPQUFPUyxNQUFNLEdBQUc7Z0JBQ3JDLElBQUk7b0JBQ0EsTUFBTW9CLG9CQUFvQixJQUFJckMsVUFBVVEsUUFBUW1CLFdBQVdMO29CQUMzRCxJQUFJLENBQUNjLGFBQWEsQ0FBQzVCLE9BQU9HLEVBQUUsQ0FBQyxDQUFDWCxVQUFVQyxJQUFJLENBQUMsR0FBR29DO2dCQUNwRCxFQUFFLE9BQU9DLE9BQU87b0JBQ1osTUFBTUMsVUFBVSxDQUFDLENBQUMsRUFBRXZDLFVBQVVDLElBQUksQ0FBQyx3QkFBd0IsRUFBRU8sT0FBT0csRUFBRSxDQUFDLEVBQUUsRUFBRUgsT0FBT1MsTUFBTSxDQUFDLEVBQUUsQ0FBQztvQkFDNUYsSUFBSXFCLGlCQUFpQkUsT0FBT0MsUUFBUUgsS0FBSyxDQUFDQyxTQUFTLE1BQU1ELE9BQU8sTUFBTUEsTUFBTUksS0FBSzt5QkFDNUVELFFBQVFILEtBQUssQ0FBQ0MsU0FBU0Q7b0JBQzVCO2dCQUNKO1lBQ0o7UUFDSjtRQUVBSyxhQUFhQyxJQUFJLENBQUMsZ0JBQWdCcEM7SUFDdEM7SUFFQTs7Ozs7O0tBTUMsR0FDRCxPQUFjZSxjQUFjSyxRQUFpQixFQUFFQyxTQUFvQixFQUFFO1FBQ2pFLElBQUl4QyxRQUFRLFFBQVEsT0FBTyxNQUFNLDZEQUE2RDtRQUM5RixPQUFPd0QsYUFBYUMsMEJBQTBCLENBQUNsQixVQUFVQyxjQUFjLElBQUksQ0FBQ2tCLG1CQUFtQjtJQUNuRztJQUVBOzs7O0tBSUMsR0FDRCxhQUFvQkMsS0FBS0MsSUFBWSxFQUFFO1FBQ25DLE9BQU8sSUFBSUMsUUFBYyxDQUFDQyxVQUFZaEUsT0FBT2lFLFVBQVUsQ0FBQyxJQUFNRCxXQUFXRjtJQUM3RTtJQUVBOzs7Ozs7Ozs7O0tBVUMsR0FDRCxhQUFvQjdCLHVCQUF1QjtRQUN2QyxJQUFLLElBQUlpQyxJQUFJLEdBQUdBLElBQUksSUFBSSxDQUFDcEIsZUFBZSxDQUFDcUIsSUFBSSxFQUFFRCxJQUFLO1lBQ2hELE1BQU1FLFFBQVE7bUJBQUksSUFBSSxDQUFDdEIsZUFBZTthQUFDLENBQUNvQixFQUFFO1lBRTFDLElBQUlBLElBQUksT0FBTyxHQUFHLE1BQU0sSUFBSSxDQUFDTCxJQUFJLENBQUM7WUFDbEMsTUFBTXhCLFVBQVUrQixNQUFNL0MsTUFBTSxDQUFDZ0IsT0FBTztZQUNwQyxJQUFJLENBQUNBLFNBQVM7Z0JBQ1YsSUFBSSxDQUFDUyxlQUFlLENBQUN1QixNQUFNLENBQUNEO2dCQUM1QjtZQUNKO1lBRUEsTUFBTWhDLGdCQUFnQixJQUFJLENBQUNBLGFBQWEsQ0FBQ2dDLE1BQU0zQixRQUFRLEVBQUUyQixNQUFNMUIsU0FBUztZQUN4RSxJQUFJLENBQUNOLGVBQWU7WUFFcEIsSUFBSSxDQUFDaEIsUUFBUSxDQUFDZ0QsTUFBTS9DLE1BQU0sRUFBRSxPQUFPO1lBQ25DLElBQUksQ0FBQ3lCLGVBQWUsQ0FBQ3VCLE1BQU0sQ0FBQ0Q7UUFDaEM7SUFDSjtJQUVBOzs7Ozs7O0tBT0MsR0FDRCxPQUFjbEMsVUFBVTtRQUNwQm9DLFdBQVdDLFVBQVUsQ0FBQztRQUN0QixJQUFLLE1BQU1DLFlBQVksSUFBSSxDQUFDdkIsYUFBYSxDQUFFO1lBQ3ZDLE1BQU01QixTQUFTcEIsTUFBTXdFLFNBQVMsQ0FBQ0Q7WUFFL0IsSUFBSUUsZ0JBQWdCO1lBQ3BCLElBQUlDLGNBQWM7WUFFbEJMLFdBQVdDLFVBQVUsQ0FBQztZQUN0QixJQUFJLENBQUNsRCxRQUFRZ0IsU0FBUztnQkFDbEJxQyxnQkFBZ0I7WUFDcEIsT0FBTyxJQUFJckQsT0FBT1MsTUFBTSxLQUFLLG9CQUFvQjtnQkFDN0MsTUFBTVcsV0FBVyxJQUFJLENBQUNRLGFBQWEsQ0FBQ3VCLFNBQVMsQ0FBQyxFQUFFLEVBQUVJLGtCQUFrQnZELE9BQU9vQixRQUFRO2dCQUNuRixNQUFNRSxhQUFhLElBQUksQ0FBQ0MsZUFBZSxDQUFDQyxRQUFRLENBQUN4QixPQUFPUyxNQUFNO2dCQUM5RDZDLGNBQWMsQ0FBQyxJQUFJLENBQUN2QyxhQUFhLENBQUNLLFVBQVVwQixPQUFPcUIsU0FBUyxLQUFLLENBQUNDO1lBQ3RFO1lBQ0EyQixXQUFXTyxRQUFRO1lBRW5CLElBQUlGLGFBQWE7Z0JBQ2IsSUFBSSxDQUFDN0IsZUFBZSxDQUFDQyxHQUFHLENBQUM7b0JBQUUxQixRQUFRQTtvQkFBU29CLFVBQVV0QyxHQUFHNkMsVUFBVSxDQUFDM0I7b0JBQVVxQixXQUFXckIsT0FBUXFCLFNBQVM7Z0JBQUM7WUFDL0c7WUFDQSxJQUFJZ0MsaUJBQWlCQyxhQUFhO2dCQUM5QixJQUFJLENBQUNwRCxpQkFBaUIsQ0FBQ2lEO1lBQzNCO1FBQ0o7UUFDQUYsV0FBV08sUUFBUTtJQUN2QjtJQUVBLE9BQWN0RCxrQkFBa0JpRCxRQUFnQixFQUFFO1FBQzlDLElBQUssTUFBTTNELGFBQWEsSUFBSSxDQUFDb0MsYUFBYSxDQUFDdUIsU0FBUyxDQUFFO1lBQ2xELE1BQU1NLFdBQVcsSUFBSSxDQUFDN0IsYUFBYSxDQUFDdUIsU0FBUyxDQUFDM0QsVUFBVTtZQUN4RGlFLFNBQVNDLE9BQU87UUFDcEI7UUFDQSxPQUFPLElBQUksQ0FBQzlCLGFBQWEsQ0FBQ3VCLFNBQVM7UUFDbkMsSUFBSSxDQUFDakMsbUJBQW1CLENBQUM4QixNQUFNLENBQUNHO0lBQ3BDO0lBRUE7Ozs7OztLQU1DLEdBQ0QsT0FBY1EsMEJBQWtDO1FBQzVDLE1BQU1DLFFBQVEsQ0FBQztRQUNmLElBQUssTUFBTVQsWUFBWSxJQUFJLENBQUN2QixhQUFhLENBQUU7WUFDdkMsTUFBTWlDLGlCQUFpQkMsT0FBT0MsTUFBTSxDQUFDLElBQUksQ0FBQ25DLGFBQWEsQ0FBQ3VCLFNBQVMsQ0FBQyxDQUFDLEVBQUU7WUFDckUsTUFBTTFDLFNBQVNvRCxlQUFlRyxZQUFZO1lBQzFDLElBQUksQ0FBQ3ZELFFBQVEsVUFBVSx1Q0FBdUM7WUFDOUQsSUFBSW1ELEtBQUssQ0FBQ25ELE9BQU8sRUFBRW1ELEtBQUssQ0FBQ25ELE9BQU87aUJBQzNCbUQsS0FBSyxDQUFDbkQsT0FBTyxHQUFHO1FBQ3pCO1FBRUEsTUFBTXdELFNBQVNILE9BQU9JLElBQUksQ0FBQ04sT0FBT08sSUFBSSxDQUFDLENBQUNDLEdBQUdDLElBQU1ULEtBQUssQ0FBQ1MsRUFBRSxHQUFHVCxLQUFLLENBQUNRLEVBQUU7UUFDcEUsTUFBTUUsY0FBYyxDQUFDO1FBQ3JCLEtBQUssTUFBTUMsT0FBT04sT0FBUTtZQUN0QkssV0FBVyxDQUFDQyxJQUFJLEdBQUdYLEtBQUssQ0FBQ1csSUFBSTtRQUNqQztRQUVBLE1BQU1DLFFBQVFWLE9BQU9JLElBQUksQ0FBQ04sT0FBT2EsTUFBTSxDQUFDLENBQUNDLEtBQUtILE1BQVFHLE1BQU1kLEtBQUssQ0FBQ1csSUFBSSxFQUFFO1FBRXhFLE9BQU8sQ0FBQyxFQUFFSSxLQUFLQyxTQUFTLENBQUM7WUFBRUo7WUFBTyxHQUFHRixXQUFXO1FBQUMsR0FBRyxDQUFDO0lBQ3pEO0lBRUE7Ozs7O0tBS0MsR0FDRCxPQUFjTyx3QkFDVjdFLE1BQWMsRUFDZDhFLGVBQWtCLEVBQ2lCO1FBQ25DLE9BQU8sSUFBSSxDQUFDbEQsYUFBYSxDQUFDNUIsT0FBT0csRUFBRSxDQUFDLENBQUMyRSxnQkFBZ0I7SUFDekQ7SUFFQTs7Ozs7S0FLQyxHQUNELE9BQWNDLHlCQUFvREQsZUFBa0IsRUFBRXZFLFFBQW1CLEVBQTZCO1FBQ2xJLE1BQU15RSxZQUF1QyxFQUFFO1FBRS9DLElBQUlDO1FBQ0osSUFBSTFFLFVBQVUwRSxZQUFZMUUsU0FBUzJFLEdBQUcsQ0FBQyxDQUFDbEYsU0FBV0EsT0FBT0csRUFBRTthQUN2RDhFLFlBQVluQixPQUFPSSxJQUFJLENBQUMsSUFBSSxDQUFDdEMsYUFBYTtRQUUvQyxLQUFLLE1BQU11QixZQUFZOEIsVUFBVztZQUM5QixNQUFNeEIsV0FBVyxJQUFJLENBQUM3QixhQUFhLENBQUN1QixTQUFTLENBQUMyQixnQkFBZ0I7WUFDOUQsSUFBSXJCLFVBQVV1QixVQUFVM0YsSUFBSSxDQUFDb0U7UUFDakM7UUFFQSxPQUFPdUI7SUFDWDtBQUNKO0FBaFFxQmhHLG9CQUNPdUQsc0JBQXNCO0FBRDdCdkQsb0JBRU9JLHVCQUlsQixFQUFFO0FBTlNKLG9CQU9GVSwwQkFBMEIsSUFBSUM7QUFQNUJYLG9CQVFPa0Msc0JBQXNCLElBQUl2QjtBQVJqQ1gsb0JBU095QyxrQkFBa0IsSUFBSTlCO0FBVDdCWCxvQkFVSDRDLGdCQUEwRixDQUFDO0FBVnhGNUMsb0JBV0h1QyxrQkFBNEI7SUFBQztDQUFjLENBQUUsc0NBQXNDOztBQWRyRzs7K0lBRStJLEdBQy9JLFNBQXFCdkMsaUNBZ1FwQiJ9