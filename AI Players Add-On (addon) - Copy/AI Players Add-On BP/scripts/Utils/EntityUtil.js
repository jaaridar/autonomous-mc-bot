import { Direction, EntityHealthComponent, EntityTypeFamilyComponent, world } from "@minecraft/server";
import V3 from "Helpers/Vectors/V3";
class _EntityUtil {
    /**
     * Checks whether two entities have an unobstructed line of sight between their eye locations.
     * @param source - The source entity from which the line of sight is being checked.
     * @param target - The target entity to which the line of sight is being checked.
     * @param eyeLevel - The height above the entity's position to consider as the eye level for line of sight calculations.
     * @param raycastOptions - Optional raycast options to customize the visibility check.
     * @returns `true` if there is a clear line of sight between the entities; otherwise, `false`.
     */ static hasLineOfSight(source, target, eyeLevel, raycastOptions) {
        const sourceLocation = V3.fromEntity(source, true).add(0, eyeLevel, 0);
        const targetLocation = V3.fromEntity(target, false).add(0, eyeLevel, 0);
        const direction = targetLocation.clone().subtract(sourceLocation).normalize();
        const distance = sourceLocation.distance(targetLocation);
        if (distance === 0) return true;
        if (!raycastOptions) {
            raycastOptions = {
                includeLiquidBlocks: false,
                includePassableBlocks: false,
                maxDistance: distance
            };
        }
        const result = sourceLocation.dimension.getBlockFromRay(sourceLocation, direction, raycastOptions);
        return result === undefined;
    }
    /**
     * Checks if the target entity is visible from the source location within a specified maximum distance.
     * @param location - The source location from which visibility is being checked.
     * @param target - The target entity to check visibility for.
     * @param maxDistance - The maximum distance within which the target entity should be visible.
     * @returns `true` if the target entity is visible from the source location within the specified distance; otherwise, `false`.
     */ static isVisibleFromLocation(location, target, maxDistance) {
        const offset = V3.fromEntity(target, false).subtract(location);
        const distance = offset.length();
        if (distance === 0) return true;
        const direction = offset.normalize();
        const raycastOptions = {
            maxDistance: maxDistance,
            type: target.typeId
        };
        const entitiesInDirection = location.dimension?.getEntitiesFromRay(location, direction, raycastOptions);
        return entitiesInDirection?.some((result)=>result.entity.id === target.id) ?? false;
    }
    /**
     * Retrieves a list of entities from the specified dimension based on the provided query options.
     * @param query - The query options used to filter the entities to retrieve. See {@link EntityQueryOptions}.
     * @param dimension - The dimension from which to retrieve the entities. Defaults to the overworld dimension.
     * @returns An array of entities that match the query options in the specified dimension.
     */ static getEntities(query, dimension = overworld) {
        DebugTimer.countStart("EntityUtil.getEntities");
        const result = dimension.getEntities(query);
        DebugTimer.countEnd();
        return result;
    }
    /**
     * Retrieves a list of player entities from the cached players.
     * The players are retrieved from the `PlayersCache`
     * and mapped to their corresponding entity objects.
     * @returns An array of player entities.
     */ static getPlayers() {
        DebugTimer.countStart("EntityUtil.getPlayers");
        const result = PlayersCache.getAllPlayerEntities();
        DebugTimer.countEnd();
        return result;
    }
    /**
     * Retrieves the nearest player entity to a specified location within a given dimension.
     * @param location - The 3D vector representing the location to search from.
     * @param dimension - The dimension in which to search for the nearest player. Defaults to the overworld.
     * @param excludePlayerIds - Optional array of player IDs to exclude from the search.
     * @returns The nearest player entity to the specified location, or `undefined` if no players are found.
     */ static getNearestPlayer(location, dimension = overworld, excludePlayerIds) {
        DebugTimer.countStart("EntityUtil.getNearestPlayer");
        const result = PlayersCache.getNearestPlayer(location, dimension, excludePlayerIds)?.entity;
        DebugTimer.countEnd();
        return result;
    }
    /**
     * Retrieves the nearest player entity at a specified dimensional location.
     * @param dimLoc - The dimensional location (`DimLoc`) containing the coordinates and dimension
     * where the nearest player should be searched.
     * @param excludePlayerIds - Optional array of player IDs to exclude from the search.
     * @returns The nearest player's entity at the specified location and dimension, or `undefined`
     * if no player is found.
     */ static getNearestPlayerAtDimLoc(dimLoc, excludePlayerIds) {
        DebugTimer.countStart("EntityUtil.getNearestPlayerAtDimLoc");
        const result = PlayersCache.getNearestPlayer(dimLoc.location, dimLoc.dimension, excludePlayerIds)?.entity;
        DebugTimer.countEnd();
        return result;
    }
    /**
     * Retrieves a list of nearby players within a specified radius from a given location in a specified dimension.
     * @param radius - The radius within which to search for players, in blocks.
     * @param location - The central location to search around, represented as a `Vector3`.
     * @param dimension - The dimension in which to search for players. Defaults to the `overworld` dimension.
     * @param excludePlayerIds - Optional array of player IDs to exclude from the search.
     * @returns An array of player entities found within the specified radius.
     */ static getNearbyPlayers(radius, location, dimension = overworld, excludePlayerIds) {
        DebugTimer.countStart("EntityUtil.getNearbyPlayers");
        const result = PlayersCache.getPlayersInRange(location, radius, dimension).filter((e)=>!excludePlayerIds?.includes(e.id)).map((e)=>e.entity);
        DebugTimer.countEnd();
        return result;
    }
    /**
     * Retrieves a list of nearby player entities within a specified radius at a given dimensional location.
     * @param radius - The radius within which to search for players, in blocks.
     * @param dimLoc - The dimensional location to search around, including the position and dimension.
     * @param excludePlayerIds - Optional array of player IDs to exclude from the search.
     * @returns An array of player entities found within the specified radius at the given dimensional location.
     */ static getNearbyPlayersAtDimLoc(radius, dimLoc, excludePlayerIds) {
        DebugTimer.countStart("EntityUtil.getNearbyPlayersAtDimLoc");
        const result = PlayersCache.getPlayersInRange(dimLoc.location, radius, dimLoc.dimension).filter((e)=>!excludePlayerIds?.includes(e.id)).map((e)=>e.entity);
        DebugTimer.countEnd();
        return result;
    }
    /**
     * Kills all entities matching the specified query in the given dimension.
     * @param query - The query options used to filter the entities to be killed.
     * @param dimension - The dimension in which to search for entities. Defaults to the overworld.
     * @remarks
     * This method retrieves all entities matching the provided query options
     * and invokes the `kill` method on each of them.
     */ static killEntities(query, dimension = overworld) {
        DebugTimer.countStart("EntityUtil.killEntities");
        const entities = this.getEntities(query, dimension);
        for (const entity of entities){
            entity.kill();
        }
        DebugTimer.countEnd();
    }
    /**
     * Removes all entities matching the specified query in the given dimension.
     * @param query - The query options used to filter the entities to be removed.
     * @param dimension - The dimension in which to search for entities. Defaults to the overworld.
     * @remarks
     * This method retrieves all entities matching the provided query in the specified dimension
     * and removes them one by one.
     */ static removeEntities(query, dimension = overworld) {
        DebugTimer.countStart("EntityUtil.removeEntities");
        const entities = this.getEntities(query, dimension);
        for (const entity of entities){
            entity.remove();
        }
        DebugTimer.countEnd();
    }
    /**
     * Spawns an item in the specified dimension at the given location.
     * @param itemStack - The item stack to be spawned.
     * @param location - The 3D vector specifying the location where the item should be spawned.
     * @param dimension - The dimension in which the item should be spawned. Defaults to the overworld.
     * @returns The result of the item spawn operation.
     */ static spawnItem(itemStack, location, dimension = overworld) {
        DebugTimer.countStart("EntityUtil.spawnItem");
        const result = dimension.spawnItem(itemStack, location);
        DebugTimer.countEnd();
        return result;
    }
    /**
     * Spawns an item at a specified dimensional location.
     * @param itemStack - The item stack to be spawned.
     * @param dimLoc - The dimensional location where the item should be spawned.
     *                  This includes both the dimension and the specific location within it.
     * @returns The result of the spawn operation, typically indicating success or failure.
     */ static spawnItemAtDimLoc(itemStack, dimLoc) {
        DebugTimer.countStart("EntityUtil.spawnItemAtDimLoc");
        const result = dimLoc.dimension.spawnItem(itemStack, dimLoc.location);
        DebugTimer.countEnd();
        return result;
    }
    /**
     * Spawns an entity of the specified type at the given location within the specified dimension.
     * @param type - The type of the entity to spawn. This should be a string representing the entity type.
     * @param location - The 3D vector specifying the location where the entity should be spawned.
     * @param dimension - The dimension in which the entity should be spawned. Defaults to the overworld.
     * @param options - Optional query options to filter the spawned entities. See {@link SpawnEntityOptions}.
     * @returns The spawned entity instance.
     * @example
     * ```typescript
     * const location = { x: 10, y: 64, z: 10 };
     * const spawnedEntity = EntityUtil.spawnEntity("minecraft:cow", location);
     * console.log("Entity spawned:", spawnedEntity);
     * ```
     */ static spawnEntity(type, location, dimension = overworld, options) {
        DebugTimer.countStart("EntityUtil.spawnEntity");
        const result = dimension.spawnEntity(type, location, options);
        DebugTimer.countEnd();
        return result;
    }
    /**
     * Spawns an entity of the specified type at the given dimensional location.
     * @param type - The type of the entity to spawn. This should be a string representing the entity type.
     * @param dimLoc - The dimensional location where the entity should be spawned.
     * This includes both the dimension and the location within that dimension.
     * @returns The spawned entity object.
     * @example
     * ```typescript
     * const dimLoc = { dimension: overworld, location: { x: 10, y: 64, z: 10 } };
     * const entity = EntityUtil.spawnEntityAtDimLoc("minecraft:zombie", dimLoc);
     * ```
     */ static spawnEntityAtDimLoc(type, dimLoc) {
        DebugTimer.countStart("EntityUtil.spawnEntityAtDimLoc");
        const result = dimLoc.dimension.spawnEntity(type, dimLoc.location);
        DebugTimer.countEnd();
        return result;
    }
    /**
     * Spawns an entity of the specified type at a given location with a specified rotation in the provided dimension.
     * @param type - The type of the entity to spawn. This should be a string representing the entity type.
     * @param location - A `Vector3` object specifying the position where the entity will be spawned.
     * @param rotation - A `Vector2` object specifying the rotation of the entity after it is spawned.
     * @param dimension - The dimension in which the entity will be spawned. Defaults to the `overworld` dimension.
     * @returns The spawned entity instance.
     * @throws This method may throw an error if the entity cannot be spawned at the specified location or if the type is invalid.
     */ static spawnEntityRotated(type, location, rotation, dimension = overworld) {
        DebugTimer.countStart("EntityUtil.spawnEntityRotated");
        const entity = dimension.spawnEntity(type, location);
        entity.setRotation(rotation);
        return entity;
    }
    /**
     * Spawns an entity of the specified type at the given location with a specified direction in the provided dimension.
     * @param type - The type of the entity to spawn. This should be a string representing the entity type.
     * @param location - The 3D vector specifying the location where the entity will be spawned.
     * @param direction - The direction the entity should face upon spawning. This is converted to a rotation internally.
     * @param dimension - The dimension in which the entity will be spawned. Defaults to the overworld if not specified.
     * @returns The spawned entity.
     * @throws This method may throw an error if the entity cannot be spawned or if the provided parameters are invalid.
     */ static spawnEntityWithDirection(type, location, direction, dimension = overworld) {
        DebugTimer.countStart("EntityUtil.spawnEntityWithDirection");
        const entity = dimension.spawnEntity(type, location);
        const rotation = _EntityUtil.convertDirectionToRotation(direction);
        entity.setRotation(rotation);
        DebugTimer.countEnd();
        return entity;
    }
    /**
     * Spawns multiple entities of a specified type at a given location within a specified dimension.
     * @param type - The identifier of the entity type to spawn.
     * @param amount - The number of entities to spawn.
     * @param location - The 3D vector specifying the location where the entities will be spawned.
     * @param dimension - The dimension in which the entities will be spawned. Defaults to the overworld.
     * @returns An array of spawned entities.
     */ static spawnEntities(type, amount, location, dimension = overworld) {
        DebugTimer.countStart("EntityUtil.spawnEntities");
        const entities = [];
        for(let i = 0; i < amount; i++){
            entities.push(this.spawnEntity(type, location, dimension));
        }
        DebugTimer.countEnd();
        return entities;
    }
    /**
     * Determines whether the given entity is alive.
     * This method checks if the entity is valid and has a health component.
     * It then evaluates whether the entity's current health value is greater
     * than its effective minimum health.
     * @param entity - The entity to check.
     * @returns `true` if the entity is alive, `false` otherwise. Invalid entities return false
     */ static isAlive(entity) {
        DebugTimer.countStart("EntityUtil.isAlive");
        const returnAndEndCount = (result)=>{
            DebugTimer.countEnd();
            return result;
        };
        if (!entity.isValid) return returnAndEndCount(false);
        const healthComponent = entity.getComponent(EntityHealthComponent.componentId);
        if (!healthComponent) return returnAndEndCount(false);
        return returnAndEndCount(healthComponent.currentValue > healthComponent.effectiveMin);
    }
    /**
     * Determines if the given entity belongs to all the specified type families.
     * @param entity - The entity to check for type family membership.
     * @param families - An array of type family names to verify against the entity.
     * @returns A boolean indicating whether the entity belongs to all the specified type families.
     */ static hasFamilies(entity, families) {
        DebugTimer.countStart("EntityUtil.hasFamilies");
        const familyComponent = entity.getComponent(EntityTypeFamilyComponent.componentId);
        const result = familyComponent && families.every((family)=>familyComponent.hasTypeFamily(family));
        DebugTimer.countEnd();
        return result;
    }
    /**
     * Retrieves a player object from the game world by their name.
     * @param name - The name of the player to search for.
     * @returns The player object if found, otherwise `undefined`.
     * @remarks
     * This method uses `world.getAllPlayers()` to fetch all players in the game world
     * and performs a search to find a player whose name matches the provided `name`.
     * Performance may vary depending on the number of players in the game world.
     * Debug timing is recorded using `DebugTimer` to measure execution time.
     */ static getPlayerByName(name) {
        DebugTimer.countStart("EntityUtil.getPlayerByName");
        const result = world.getAllPlayers().find((player)=>player.name === name);
        DebugTimer.countEnd();
        return result;
    }
    /**
     * Retrieves an entity from the game world by its unique identifier.
     * @param id - The unique identifier of the entity to retrieve.
     * @returns The entity object if found, or `undefined` if no entity with the given ID exists.
     * @remarks
     * This method uses the `world.getEntity` function to locate the entity.
     * It also tracks the execution time using `DebugTimer` for performance monitoring.
     */ static getEntityById(id) {
        DebugTimer.countStart("EntityUtil.getEntityById");
        const result = world.getEntity(id);
        DebugTimer.countEnd();
        return result;
    }
    /**
     * Retrieves the names of all players provided.
     * @param players - The array of player entities to extract names from.
     * @returns An array of player names.
     */ static getPlayerNames(players) {
        DebugTimer.countStart("EntityUtil.getPlayerNames");
        const result = players.map((player)=>player.name);
        DebugTimer.countEnd();
        return result;
    }
    /**
     * Sets the spawn point for a given player at the specified location and dimension.
     * @param player - The player whose spawn point is to be set.
     * @param location - The 3D vector representing the coordinates of the spawn point.
     * @param dimension - The dimension where the spawn point is located. Defaults to the overworld.
     */ static setSpawnPoint(player, location, dimension = overworld) {
        player.setSpawnPoint({
            dimension,
            x: location.x,
            y: location.y,
            z: location.z
        });
    }
    /**
     * Converts a given direction into a corresponding rotation object.
     * @param direction - The direction to convert, represented as a `Direction` enum.
     * @returns An object containing the rotation values:
     *          - `x`: The rotation around the X-axis.
     *          - `y`: The rotation around the Y-axis.
     * @example
     * ```typescript
     * const direction = Direction.North;
     * const rotation = EntityUtil.convertDirectionToRotation(direction);
     * console.log(rotation); // Output: { x: 0, y: 180 }
     * ```
     */ static convertDirectionToRotation(direction) {
        switch(direction){
            case Direction.North:
                return {
                    x: 0,
                    y: 180
                };
            case Direction.East:
                return {
                    x: 0,
                    y: -90
                };
            case Direction.South:
                return {
                    x: 0,
                    y: 0
                };
            case Direction.West:
                return {
                    x: 0,
                    y: 90
                };
            case Direction.Up:
                return {
                    x: -90,
                    y: 0
                };
            case Direction.Down:
                return {
                    x: 90,
                    y: 0
                };
            default:
                return {
                    x: 0,
                    y: 0
                };
        }
    }
}
globalThis.EntityUtil = _EntityUtil;

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkVudGl0eVV0aWwudHMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHtcclxuICAgIEJsb2NrUmF5Y2FzdE9wdGlvbnMsXHJcbiAgICBEaW1lbnNpb24sXHJcbiAgICBEaXJlY3Rpb24sXHJcbiAgICBFbnRpdHksXHJcbiAgICBFbnRpdHlIZWFsdGhDb21wb25lbnQsXHJcbiAgICBFbnRpdHlRdWVyeU9wdGlvbnMsXHJcbiAgICBFbnRpdHlUeXBlRmFtaWx5Q29tcG9uZW50LFxyXG4gICAgSXRlbVN0YWNrLFxyXG4gICAgUGxheWVyLFxyXG4gICAgU3Bhd25FbnRpdHlPcHRpb25zLFxyXG4gICAgVmVjdG9yMixcclxuICAgIFZlY3RvcjMsXHJcbiAgICB3b3JsZCxcclxufSBmcm9tIFwiQG1pbmVjcmFmdC9zZXJ2ZXJcIjtcclxuaW1wb3J0IFYzIGZyb20gXCJIZWxwZXJzL1ZlY3RvcnMvVjNcIjtcclxuXHJcbmludGVyZmFjZSBEaW1Mb2Mge1xyXG4gICAgbG9jYXRpb246IFZlY3RvcjM7XHJcbiAgICBkaW1lbnNpb246IERpbWVuc2lvbjtcclxufVxyXG5cclxuY2xhc3MgX0VudGl0eVV0aWwge1xyXG4gICAgLyoqXHJcbiAgICAgKiBDaGVja3Mgd2hldGhlciB0d28gZW50aXRpZXMgaGF2ZSBhbiB1bm9ic3RydWN0ZWQgbGluZSBvZiBzaWdodCBiZXR3ZWVuIHRoZWlyIGV5ZSBsb2NhdGlvbnMuXHJcbiAgICAgKiBAcGFyYW0gc291cmNlIC0gVGhlIHNvdXJjZSBlbnRpdHkgZnJvbSB3aGljaCB0aGUgbGluZSBvZiBzaWdodCBpcyBiZWluZyBjaGVja2VkLlxyXG4gICAgICogQHBhcmFtIHRhcmdldCAtIFRoZSB0YXJnZXQgZW50aXR5IHRvIHdoaWNoIHRoZSBsaW5lIG9mIHNpZ2h0IGlzIGJlaW5nIGNoZWNrZWQuXHJcbiAgICAgKiBAcGFyYW0gZXllTGV2ZWwgLSBUaGUgaGVpZ2h0IGFib3ZlIHRoZSBlbnRpdHkncyBwb3NpdGlvbiB0byBjb25zaWRlciBhcyB0aGUgZXllIGxldmVsIGZvciBsaW5lIG9mIHNpZ2h0IGNhbGN1bGF0aW9ucy5cclxuICAgICAqIEBwYXJhbSByYXljYXN0T3B0aW9ucyAtIE9wdGlvbmFsIHJheWNhc3Qgb3B0aW9ucyB0byBjdXN0b21pemUgdGhlIHZpc2liaWxpdHkgY2hlY2suXHJcbiAgICAgKiBAcmV0dXJucyBgdHJ1ZWAgaWYgdGhlcmUgaXMgYSBjbGVhciBsaW5lIG9mIHNpZ2h0IGJldHdlZW4gdGhlIGVudGl0aWVzOyBvdGhlcndpc2UsIGBmYWxzZWAuXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgaGFzTGluZU9mU2lnaHQoc291cmNlOiBFbnRpdHksIHRhcmdldDogRW50aXR5LCBleWVMZXZlbDogbnVtYmVyLCByYXljYXN0T3B0aW9ucz86IEJsb2NrUmF5Y2FzdE9wdGlvbnMpOiBib29sZWFuIHtcclxuICAgICAgICBjb25zdCBzb3VyY2VMb2NhdGlvbiA9IFYzLmZyb21FbnRpdHkoc291cmNlLCB0cnVlKS5hZGQoMCwgZXllTGV2ZWwsIDApO1xyXG4gICAgICAgIGNvbnN0IHRhcmdldExvY2F0aW9uID0gVjMuZnJvbUVudGl0eSh0YXJnZXQsIGZhbHNlKS5hZGQoMCwgZXllTGV2ZWwsIDApO1xyXG4gICAgICAgIGNvbnN0IGRpcmVjdGlvbiA9IHRhcmdldExvY2F0aW9uLmNsb25lKCkuc3VidHJhY3Qoc291cmNlTG9jYXRpb24pLm5vcm1hbGl6ZSgpO1xyXG4gICAgICAgIGNvbnN0IGRpc3RhbmNlID0gc291cmNlTG9jYXRpb24uZGlzdGFuY2UodGFyZ2V0TG9jYXRpb24pO1xyXG5cclxuICAgICAgICBpZiAoZGlzdGFuY2UgPT09IDApIHJldHVybiB0cnVlO1xyXG5cclxuICAgICAgICBpZiAoIXJheWNhc3RPcHRpb25zKSB7XHJcbiAgICAgICAgICAgIHJheWNhc3RPcHRpb25zID0ge1xyXG4gICAgICAgICAgICAgICAgaW5jbHVkZUxpcXVpZEJsb2NrczogZmFsc2UsXHJcbiAgICAgICAgICAgICAgICBpbmNsdWRlUGFzc2FibGVCbG9ja3M6IGZhbHNlLFxyXG4gICAgICAgICAgICAgICAgbWF4RGlzdGFuY2U6IGRpc3RhbmNlLFxyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc3QgcmVzdWx0ID0gc291cmNlTG9jYXRpb24uZGltZW5zaW9uIS5nZXRCbG9ja0Zyb21SYXkoc291cmNlTG9jYXRpb24sIGRpcmVjdGlvbiwgcmF5Y2FzdE9wdGlvbnMpO1xyXG5cclxuICAgICAgICByZXR1cm4gcmVzdWx0ID09PSB1bmRlZmluZWQ7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBDaGVja3MgaWYgdGhlIHRhcmdldCBlbnRpdHkgaXMgdmlzaWJsZSBmcm9tIHRoZSBzb3VyY2UgbG9jYXRpb24gd2l0aGluIGEgc3BlY2lmaWVkIG1heGltdW0gZGlzdGFuY2UuXHJcbiAgICAgKiBAcGFyYW0gbG9jYXRpb24gLSBUaGUgc291cmNlIGxvY2F0aW9uIGZyb20gd2hpY2ggdmlzaWJpbGl0eSBpcyBiZWluZyBjaGVja2VkLlxyXG4gICAgICogQHBhcmFtIHRhcmdldCAtIFRoZSB0YXJnZXQgZW50aXR5IHRvIGNoZWNrIHZpc2liaWxpdHkgZm9yLlxyXG4gICAgICogQHBhcmFtIG1heERpc3RhbmNlIC0gVGhlIG1heGltdW0gZGlzdGFuY2Ugd2l0aGluIHdoaWNoIHRoZSB0YXJnZXQgZW50aXR5IHNob3VsZCBiZSB2aXNpYmxlLlxyXG4gICAgICogQHJldHVybnMgYHRydWVgIGlmIHRoZSB0YXJnZXQgZW50aXR5IGlzIHZpc2libGUgZnJvbSB0aGUgc291cmNlIGxvY2F0aW9uIHdpdGhpbiB0aGUgc3BlY2lmaWVkIGRpc3RhbmNlOyBvdGhlcndpc2UsIGBmYWxzZWAuXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgaXNWaXNpYmxlRnJvbUxvY2F0aW9uKGxvY2F0aW9uOiBWMywgdGFyZ2V0OiBFbnRpdHksIG1heERpc3RhbmNlOiBudW1iZXIpOiBib29sZWFuIHtcclxuICAgICAgICBjb25zdCBvZmZzZXQgPSBWMy5mcm9tRW50aXR5KHRhcmdldCwgZmFsc2UpLnN1YnRyYWN0KGxvY2F0aW9uKTtcclxuICAgICAgICBjb25zdCBkaXN0YW5jZSA9IG9mZnNldC5sZW5ndGgoKTtcclxuICAgICAgICBpZiAoZGlzdGFuY2UgPT09IDApIHJldHVybiB0cnVlO1xyXG5cclxuICAgICAgICBjb25zdCBkaXJlY3Rpb24gPSBvZmZzZXQubm9ybWFsaXplKCk7XHJcblxyXG4gICAgICAgIGNvbnN0IHJheWNhc3RPcHRpb25zID0ge1xyXG4gICAgICAgICAgICBtYXhEaXN0YW5jZTogbWF4RGlzdGFuY2UsXHJcbiAgICAgICAgICAgIHR5cGU6IHRhcmdldC50eXBlSWQsXHJcbiAgICAgICAgfTtcclxuXHJcbiAgICAgICAgY29uc3QgZW50aXRpZXNJbkRpcmVjdGlvbiA9IGxvY2F0aW9uLmRpbWVuc2lvbj8uZ2V0RW50aXRpZXNGcm9tUmF5KGxvY2F0aW9uLCBkaXJlY3Rpb24sIHJheWNhc3RPcHRpb25zKTtcclxuICAgICAgICByZXR1cm4gZW50aXRpZXNJbkRpcmVjdGlvbj8uc29tZSgocmVzdWx0KSA9PiByZXN1bHQuZW50aXR5LmlkID09PSB0YXJnZXQuaWQpID8/IGZhbHNlO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogUmV0cmlldmVzIGEgbGlzdCBvZiBlbnRpdGllcyBmcm9tIHRoZSBzcGVjaWZpZWQgZGltZW5zaW9uIGJhc2VkIG9uIHRoZSBwcm92aWRlZCBxdWVyeSBvcHRpb25zLlxyXG4gICAgICogQHBhcmFtIHF1ZXJ5IC0gVGhlIHF1ZXJ5IG9wdGlvbnMgdXNlZCB0byBmaWx0ZXIgdGhlIGVudGl0aWVzIHRvIHJldHJpZXZlLiBTZWUge0BsaW5rIEVudGl0eVF1ZXJ5T3B0aW9uc30uXHJcbiAgICAgKiBAcGFyYW0gZGltZW5zaW9uIC0gVGhlIGRpbWVuc2lvbiBmcm9tIHdoaWNoIHRvIHJldHJpZXZlIHRoZSBlbnRpdGllcy4gRGVmYXVsdHMgdG8gdGhlIG92ZXJ3b3JsZCBkaW1lbnNpb24uXHJcbiAgICAgKiBAcmV0dXJucyBBbiBhcnJheSBvZiBlbnRpdGllcyB0aGF0IG1hdGNoIHRoZSBxdWVyeSBvcHRpb25zIGluIHRoZSBzcGVjaWZpZWQgZGltZW5zaW9uLlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGdldEVudGl0aWVzKHF1ZXJ5OiBFbnRpdHlRdWVyeU9wdGlvbnMsIGRpbWVuc2lvbjogRGltZW5zaW9uID0gb3ZlcndvcmxkKSB7XHJcbiAgICAgICAgRGVidWdUaW1lci5jb3VudFN0YXJ0KFwiRW50aXR5VXRpbC5nZXRFbnRpdGllc1wiKTtcclxuXHJcbiAgICAgICAgY29uc3QgcmVzdWx0ID0gZGltZW5zaW9uLmdldEVudGl0aWVzKHF1ZXJ5KTtcclxuICAgICAgICBEZWJ1Z1RpbWVyLmNvdW50RW5kKCk7XHJcbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFJldHJpZXZlcyBhIGxpc3Qgb2YgcGxheWVyIGVudGl0aWVzIGZyb20gdGhlIGNhY2hlZCBwbGF5ZXJzLlxyXG4gICAgICogVGhlIHBsYXllcnMgYXJlIHJldHJpZXZlZCBmcm9tIHRoZSBgUGxheWVyc0NhY2hlYFxyXG4gICAgICogYW5kIG1hcHBlZCB0byB0aGVpciBjb3JyZXNwb25kaW5nIGVudGl0eSBvYmplY3RzLlxyXG4gICAgICogQHJldHVybnMgQW4gYXJyYXkgb2YgcGxheWVyIGVudGl0aWVzLlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGdldFBsYXllcnMoKSB7XHJcbiAgICAgICAgRGVidWdUaW1lci5jb3VudFN0YXJ0KFwiRW50aXR5VXRpbC5nZXRQbGF5ZXJzXCIpO1xyXG4gICAgICAgIGNvbnN0IHJlc3VsdCA9IFBsYXllcnNDYWNoZS5nZXRBbGxQbGF5ZXJFbnRpdGllcygpO1xyXG4gICAgICAgIERlYnVnVGltZXIuY291bnRFbmQoKTtcclxuICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogUmV0cmlldmVzIHRoZSBuZWFyZXN0IHBsYXllciBlbnRpdHkgdG8gYSBzcGVjaWZpZWQgbG9jYXRpb24gd2l0aGluIGEgZ2l2ZW4gZGltZW5zaW9uLlxyXG4gICAgICogQHBhcmFtIGxvY2F0aW9uIC0gVGhlIDNEIHZlY3RvciByZXByZXNlbnRpbmcgdGhlIGxvY2F0aW9uIHRvIHNlYXJjaCBmcm9tLlxyXG4gICAgICogQHBhcmFtIGRpbWVuc2lvbiAtIFRoZSBkaW1lbnNpb24gaW4gd2hpY2ggdG8gc2VhcmNoIGZvciB0aGUgbmVhcmVzdCBwbGF5ZXIuIERlZmF1bHRzIHRvIHRoZSBvdmVyd29ybGQuXHJcbiAgICAgKiBAcGFyYW0gZXhjbHVkZVBsYXllcklkcyAtIE9wdGlvbmFsIGFycmF5IG9mIHBsYXllciBJRHMgdG8gZXhjbHVkZSBmcm9tIHRoZSBzZWFyY2guXHJcbiAgICAgKiBAcmV0dXJucyBUaGUgbmVhcmVzdCBwbGF5ZXIgZW50aXR5IHRvIHRoZSBzcGVjaWZpZWQgbG9jYXRpb24sIG9yIGB1bmRlZmluZWRgIGlmIG5vIHBsYXllcnMgYXJlIGZvdW5kLlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGdldE5lYXJlc3RQbGF5ZXIobG9jYXRpb246IFZlY3RvcjMsIGRpbWVuc2lvbjogRGltZW5zaW9uID0gb3ZlcndvcmxkLCBleGNsdWRlUGxheWVySWRzPzogc3RyaW5nW10pIHtcclxuICAgICAgICBEZWJ1Z1RpbWVyLmNvdW50U3RhcnQoXCJFbnRpdHlVdGlsLmdldE5lYXJlc3RQbGF5ZXJcIik7XHJcbiAgICAgICAgY29uc3QgcmVzdWx0ID0gUGxheWVyc0NhY2hlLmdldE5lYXJlc3RQbGF5ZXIobG9jYXRpb24sIGRpbWVuc2lvbiwgZXhjbHVkZVBsYXllcklkcyk/LmVudGl0eTtcclxuICAgICAgICBEZWJ1Z1RpbWVyLmNvdW50RW5kKCk7XHJcbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFJldHJpZXZlcyB0aGUgbmVhcmVzdCBwbGF5ZXIgZW50aXR5IGF0IGEgc3BlY2lmaWVkIGRpbWVuc2lvbmFsIGxvY2F0aW9uLlxyXG4gICAgICogQHBhcmFtIGRpbUxvYyAtIFRoZSBkaW1lbnNpb25hbCBsb2NhdGlvbiAoYERpbUxvY2ApIGNvbnRhaW5pbmcgdGhlIGNvb3JkaW5hdGVzIGFuZCBkaW1lbnNpb25cclxuICAgICAqIHdoZXJlIHRoZSBuZWFyZXN0IHBsYXllciBzaG91bGQgYmUgc2VhcmNoZWQuXHJcbiAgICAgKiBAcGFyYW0gZXhjbHVkZVBsYXllcklkcyAtIE9wdGlvbmFsIGFycmF5IG9mIHBsYXllciBJRHMgdG8gZXhjbHVkZSBmcm9tIHRoZSBzZWFyY2guXHJcbiAgICAgKiBAcmV0dXJucyBUaGUgbmVhcmVzdCBwbGF5ZXIncyBlbnRpdHkgYXQgdGhlIHNwZWNpZmllZCBsb2NhdGlvbiBhbmQgZGltZW5zaW9uLCBvciBgdW5kZWZpbmVkYFxyXG4gICAgICogaWYgbm8gcGxheWVyIGlzIGZvdW5kLlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGdldE5lYXJlc3RQbGF5ZXJBdERpbUxvYyhkaW1Mb2M6IERpbUxvYywgZXhjbHVkZVBsYXllcklkcz86IHN0cmluZ1tdKSB7XHJcbiAgICAgICAgRGVidWdUaW1lci5jb3VudFN0YXJ0KFwiRW50aXR5VXRpbC5nZXROZWFyZXN0UGxheWVyQXREaW1Mb2NcIik7XHJcbiAgICAgICAgY29uc3QgcmVzdWx0ID0gUGxheWVyc0NhY2hlLmdldE5lYXJlc3RQbGF5ZXIoZGltTG9jLmxvY2F0aW9uLCBkaW1Mb2MuZGltZW5zaW9uLCBleGNsdWRlUGxheWVySWRzKT8uZW50aXR5O1xyXG4gICAgICAgIERlYnVnVGltZXIuY291bnRFbmQoKTtcclxuICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogUmV0cmlldmVzIGEgbGlzdCBvZiBuZWFyYnkgcGxheWVycyB3aXRoaW4gYSBzcGVjaWZpZWQgcmFkaXVzIGZyb20gYSBnaXZlbiBsb2NhdGlvbiBpbiBhIHNwZWNpZmllZCBkaW1lbnNpb24uXHJcbiAgICAgKiBAcGFyYW0gcmFkaXVzIC0gVGhlIHJhZGl1cyB3aXRoaW4gd2hpY2ggdG8gc2VhcmNoIGZvciBwbGF5ZXJzLCBpbiBibG9ja3MuXHJcbiAgICAgKiBAcGFyYW0gbG9jYXRpb24gLSBUaGUgY2VudHJhbCBsb2NhdGlvbiB0byBzZWFyY2ggYXJvdW5kLCByZXByZXNlbnRlZCBhcyBhIGBWZWN0b3IzYC5cclxuICAgICAqIEBwYXJhbSBkaW1lbnNpb24gLSBUaGUgZGltZW5zaW9uIGluIHdoaWNoIHRvIHNlYXJjaCBmb3IgcGxheWVycy4gRGVmYXVsdHMgdG8gdGhlIGBvdmVyd29ybGRgIGRpbWVuc2lvbi5cclxuICAgICAqIEBwYXJhbSBleGNsdWRlUGxheWVySWRzIC0gT3B0aW9uYWwgYXJyYXkgb2YgcGxheWVyIElEcyB0byBleGNsdWRlIGZyb20gdGhlIHNlYXJjaC5cclxuICAgICAqIEByZXR1cm5zIEFuIGFycmF5IG9mIHBsYXllciBlbnRpdGllcyBmb3VuZCB3aXRoaW4gdGhlIHNwZWNpZmllZCByYWRpdXMuXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgZ2V0TmVhcmJ5UGxheWVycyhyYWRpdXM6IG51bWJlciwgbG9jYXRpb246IFZlY3RvcjMsIGRpbWVuc2lvbjogRGltZW5zaW9uID0gb3ZlcndvcmxkLCBleGNsdWRlUGxheWVySWRzPzogc3RyaW5nW10pIHtcclxuICAgICAgICBEZWJ1Z1RpbWVyLmNvdW50U3RhcnQoXCJFbnRpdHlVdGlsLmdldE5lYXJieVBsYXllcnNcIik7XHJcbiAgICAgICAgY29uc3QgcmVzdWx0ID0gUGxheWVyc0NhY2hlLmdldFBsYXllcnNJblJhbmdlKGxvY2F0aW9uLCByYWRpdXMsIGRpbWVuc2lvbilcclxuICAgICAgICAgICAgLmZpbHRlcigoZSkgPT4gIWV4Y2x1ZGVQbGF5ZXJJZHM/LmluY2x1ZGVzKGUuaWQpKVxyXG4gICAgICAgICAgICAubWFwKChlKSA9PiBlLmVudGl0eSk7XHJcbiAgICAgICAgRGVidWdUaW1lci5jb3VudEVuZCgpO1xyXG4gICAgICAgIHJldHVybiByZXN1bHQ7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBSZXRyaWV2ZXMgYSBsaXN0IG9mIG5lYXJieSBwbGF5ZXIgZW50aXRpZXMgd2l0aGluIGEgc3BlY2lmaWVkIHJhZGl1cyBhdCBhIGdpdmVuIGRpbWVuc2lvbmFsIGxvY2F0aW9uLlxyXG4gICAgICogQHBhcmFtIHJhZGl1cyAtIFRoZSByYWRpdXMgd2l0aGluIHdoaWNoIHRvIHNlYXJjaCBmb3IgcGxheWVycywgaW4gYmxvY2tzLlxyXG4gICAgICogQHBhcmFtIGRpbUxvYyAtIFRoZSBkaW1lbnNpb25hbCBsb2NhdGlvbiB0byBzZWFyY2ggYXJvdW5kLCBpbmNsdWRpbmcgdGhlIHBvc2l0aW9uIGFuZCBkaW1lbnNpb24uXHJcbiAgICAgKiBAcGFyYW0gZXhjbHVkZVBsYXllcklkcyAtIE9wdGlvbmFsIGFycmF5IG9mIHBsYXllciBJRHMgdG8gZXhjbHVkZSBmcm9tIHRoZSBzZWFyY2guXHJcbiAgICAgKiBAcmV0dXJucyBBbiBhcnJheSBvZiBwbGF5ZXIgZW50aXRpZXMgZm91bmQgd2l0aGluIHRoZSBzcGVjaWZpZWQgcmFkaXVzIGF0IHRoZSBnaXZlbiBkaW1lbnNpb25hbCBsb2NhdGlvbi5cclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBnZXROZWFyYnlQbGF5ZXJzQXREaW1Mb2MocmFkaXVzOiBudW1iZXIsIGRpbUxvYzogRGltTG9jLCBleGNsdWRlUGxheWVySWRzPzogc3RyaW5nW10pIHtcclxuICAgICAgICBEZWJ1Z1RpbWVyLmNvdW50U3RhcnQoXCJFbnRpdHlVdGlsLmdldE5lYXJieVBsYXllcnNBdERpbUxvY1wiKTtcclxuICAgICAgICBjb25zdCByZXN1bHQgPSBQbGF5ZXJzQ2FjaGUuZ2V0UGxheWVyc0luUmFuZ2UoZGltTG9jLmxvY2F0aW9uLCByYWRpdXMsIGRpbUxvYy5kaW1lbnNpb24pXHJcbiAgICAgICAgICAgIC5maWx0ZXIoKGUpID0+ICFleGNsdWRlUGxheWVySWRzPy5pbmNsdWRlcyhlLmlkKSlcclxuICAgICAgICAgICAgLm1hcCgoZSkgPT4gZS5lbnRpdHkpO1xyXG4gICAgICAgIERlYnVnVGltZXIuY291bnRFbmQoKTtcclxuICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogS2lsbHMgYWxsIGVudGl0aWVzIG1hdGNoaW5nIHRoZSBzcGVjaWZpZWQgcXVlcnkgaW4gdGhlIGdpdmVuIGRpbWVuc2lvbi5cclxuICAgICAqIEBwYXJhbSBxdWVyeSAtIFRoZSBxdWVyeSBvcHRpb25zIHVzZWQgdG8gZmlsdGVyIHRoZSBlbnRpdGllcyB0byBiZSBraWxsZWQuXHJcbiAgICAgKiBAcGFyYW0gZGltZW5zaW9uIC0gVGhlIGRpbWVuc2lvbiBpbiB3aGljaCB0byBzZWFyY2ggZm9yIGVudGl0aWVzLiBEZWZhdWx0cyB0byB0aGUgb3ZlcndvcmxkLlxyXG4gICAgICogQHJlbWFya3NcclxuICAgICAqIFRoaXMgbWV0aG9kIHJldHJpZXZlcyBhbGwgZW50aXRpZXMgbWF0Y2hpbmcgdGhlIHByb3ZpZGVkIHF1ZXJ5IG9wdGlvbnNcclxuICAgICAqIGFuZCBpbnZva2VzIHRoZSBga2lsbGAgbWV0aG9kIG9uIGVhY2ggb2YgdGhlbS5cclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBraWxsRW50aXRpZXMocXVlcnk6IEVudGl0eVF1ZXJ5T3B0aW9ucywgZGltZW5zaW9uOiBEaW1lbnNpb24gPSBvdmVyd29ybGQpIHtcclxuICAgICAgICBEZWJ1Z1RpbWVyLmNvdW50U3RhcnQoXCJFbnRpdHlVdGlsLmtpbGxFbnRpdGllc1wiKTtcclxuICAgICAgICBjb25zdCBlbnRpdGllcyA9IHRoaXMuZ2V0RW50aXRpZXMocXVlcnksIGRpbWVuc2lvbik7XHJcbiAgICAgICAgZm9yIChjb25zdCBlbnRpdHkgb2YgZW50aXRpZXMpIHtcclxuICAgICAgICAgICAgZW50aXR5LmtpbGwoKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgRGVidWdUaW1lci5jb3VudEVuZCgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogUmVtb3ZlcyBhbGwgZW50aXRpZXMgbWF0Y2hpbmcgdGhlIHNwZWNpZmllZCBxdWVyeSBpbiB0aGUgZ2l2ZW4gZGltZW5zaW9uLlxyXG4gICAgICogQHBhcmFtIHF1ZXJ5IC0gVGhlIHF1ZXJ5IG9wdGlvbnMgdXNlZCB0byBmaWx0ZXIgdGhlIGVudGl0aWVzIHRvIGJlIHJlbW92ZWQuXHJcbiAgICAgKiBAcGFyYW0gZGltZW5zaW9uIC0gVGhlIGRpbWVuc2lvbiBpbiB3aGljaCB0byBzZWFyY2ggZm9yIGVudGl0aWVzLiBEZWZhdWx0cyB0byB0aGUgb3ZlcndvcmxkLlxyXG4gICAgICogQHJlbWFya3NcclxuICAgICAqIFRoaXMgbWV0aG9kIHJldHJpZXZlcyBhbGwgZW50aXRpZXMgbWF0Y2hpbmcgdGhlIHByb3ZpZGVkIHF1ZXJ5IGluIHRoZSBzcGVjaWZpZWQgZGltZW5zaW9uXHJcbiAgICAgKiBhbmQgcmVtb3ZlcyB0aGVtIG9uZSBieSBvbmUuXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgcmVtb3ZlRW50aXRpZXMocXVlcnk6IEVudGl0eVF1ZXJ5T3B0aW9ucywgZGltZW5zaW9uOiBEaW1lbnNpb24gPSBvdmVyd29ybGQpIHtcclxuICAgICAgICBEZWJ1Z1RpbWVyLmNvdW50U3RhcnQoXCJFbnRpdHlVdGlsLnJlbW92ZUVudGl0aWVzXCIpO1xyXG4gICAgICAgIGNvbnN0IGVudGl0aWVzID0gdGhpcy5nZXRFbnRpdGllcyhxdWVyeSwgZGltZW5zaW9uKTtcclxuICAgICAgICBmb3IgKGNvbnN0IGVudGl0eSBvZiBlbnRpdGllcykge1xyXG4gICAgICAgICAgICBlbnRpdHkucmVtb3ZlKCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIERlYnVnVGltZXIuY291bnRFbmQoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFNwYXducyBhbiBpdGVtIGluIHRoZSBzcGVjaWZpZWQgZGltZW5zaW9uIGF0IHRoZSBnaXZlbiBsb2NhdGlvbi5cclxuICAgICAqIEBwYXJhbSBpdGVtU3RhY2sgLSBUaGUgaXRlbSBzdGFjayB0byBiZSBzcGF3bmVkLlxyXG4gICAgICogQHBhcmFtIGxvY2F0aW9uIC0gVGhlIDNEIHZlY3RvciBzcGVjaWZ5aW5nIHRoZSBsb2NhdGlvbiB3aGVyZSB0aGUgaXRlbSBzaG91bGQgYmUgc3Bhd25lZC5cclxuICAgICAqIEBwYXJhbSBkaW1lbnNpb24gLSBUaGUgZGltZW5zaW9uIGluIHdoaWNoIHRoZSBpdGVtIHNob3VsZCBiZSBzcGF3bmVkLiBEZWZhdWx0cyB0byB0aGUgb3ZlcndvcmxkLlxyXG4gICAgICogQHJldHVybnMgVGhlIHJlc3VsdCBvZiB0aGUgaXRlbSBzcGF3biBvcGVyYXRpb24uXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgc3Bhd25JdGVtKGl0ZW1TdGFjazogSXRlbVN0YWNrLCBsb2NhdGlvbjogVmVjdG9yMywgZGltZW5zaW9uOiBEaW1lbnNpb24gPSBvdmVyd29ybGQpIHtcclxuICAgICAgICBEZWJ1Z1RpbWVyLmNvdW50U3RhcnQoXCJFbnRpdHlVdGlsLnNwYXduSXRlbVwiKTtcclxuICAgICAgICBjb25zdCByZXN1bHQgPSBkaW1lbnNpb24uc3Bhd25JdGVtKGl0ZW1TdGFjaywgbG9jYXRpb24pO1xyXG4gICAgICAgIERlYnVnVGltZXIuY291bnRFbmQoKTtcclxuICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogU3Bhd25zIGFuIGl0ZW0gYXQgYSBzcGVjaWZpZWQgZGltZW5zaW9uYWwgbG9jYXRpb24uXHJcbiAgICAgKiBAcGFyYW0gaXRlbVN0YWNrIC0gVGhlIGl0ZW0gc3RhY2sgdG8gYmUgc3Bhd25lZC5cclxuICAgICAqIEBwYXJhbSBkaW1Mb2MgLSBUaGUgZGltZW5zaW9uYWwgbG9jYXRpb24gd2hlcmUgdGhlIGl0ZW0gc2hvdWxkIGJlIHNwYXduZWQuXHJcbiAgICAgKiAgICAgICAgICAgICAgICAgIFRoaXMgaW5jbHVkZXMgYm90aCB0aGUgZGltZW5zaW9uIGFuZCB0aGUgc3BlY2lmaWMgbG9jYXRpb24gd2l0aGluIGl0LlxyXG4gICAgICogQHJldHVybnMgVGhlIHJlc3VsdCBvZiB0aGUgc3Bhd24gb3BlcmF0aW9uLCB0eXBpY2FsbHkgaW5kaWNhdGluZyBzdWNjZXNzIG9yIGZhaWx1cmUuXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgc3Bhd25JdGVtQXREaW1Mb2MoaXRlbVN0YWNrOiBJdGVtU3RhY2ssIGRpbUxvYzogRGltTG9jKSB7XHJcbiAgICAgICAgRGVidWdUaW1lci5jb3VudFN0YXJ0KFwiRW50aXR5VXRpbC5zcGF3bkl0ZW1BdERpbUxvY1wiKTtcclxuICAgICAgICBjb25zdCByZXN1bHQgPSBkaW1Mb2MuZGltZW5zaW9uLnNwYXduSXRlbShpdGVtU3RhY2ssIGRpbUxvYy5sb2NhdGlvbik7XHJcbiAgICAgICAgRGVidWdUaW1lci5jb3VudEVuZCgpO1xyXG4gICAgICAgIHJldHVybiByZXN1bHQ7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBTcGF3bnMgYW4gZW50aXR5IG9mIHRoZSBzcGVjaWZpZWQgdHlwZSBhdCB0aGUgZ2l2ZW4gbG9jYXRpb24gd2l0aGluIHRoZSBzcGVjaWZpZWQgZGltZW5zaW9uLlxyXG4gICAgICogQHBhcmFtIHR5cGUgLSBUaGUgdHlwZSBvZiB0aGUgZW50aXR5IHRvIHNwYXduLiBUaGlzIHNob3VsZCBiZSBhIHN0cmluZyByZXByZXNlbnRpbmcgdGhlIGVudGl0eSB0eXBlLlxyXG4gICAgICogQHBhcmFtIGxvY2F0aW9uIC0gVGhlIDNEIHZlY3RvciBzcGVjaWZ5aW5nIHRoZSBsb2NhdGlvbiB3aGVyZSB0aGUgZW50aXR5IHNob3VsZCBiZSBzcGF3bmVkLlxyXG4gICAgICogQHBhcmFtIGRpbWVuc2lvbiAtIFRoZSBkaW1lbnNpb24gaW4gd2hpY2ggdGhlIGVudGl0eSBzaG91bGQgYmUgc3Bhd25lZC4gRGVmYXVsdHMgdG8gdGhlIG92ZXJ3b3JsZC5cclxuICAgICAqIEBwYXJhbSBvcHRpb25zIC0gT3B0aW9uYWwgcXVlcnkgb3B0aW9ucyB0byBmaWx0ZXIgdGhlIHNwYXduZWQgZW50aXRpZXMuIFNlZSB7QGxpbmsgU3Bhd25FbnRpdHlPcHRpb25zfS5cclxuICAgICAqIEByZXR1cm5zIFRoZSBzcGF3bmVkIGVudGl0eSBpbnN0YW5jZS5cclxuICAgICAqIEBleGFtcGxlXHJcbiAgICAgKiBgYGB0eXBlc2NyaXB0XHJcbiAgICAgKiBjb25zdCBsb2NhdGlvbiA9IHsgeDogMTAsIHk6IDY0LCB6OiAxMCB9O1xyXG4gICAgICogY29uc3Qgc3Bhd25lZEVudGl0eSA9IEVudGl0eVV0aWwuc3Bhd25FbnRpdHkoXCJtaW5lY3JhZnQ6Y293XCIsIGxvY2F0aW9uKTtcclxuICAgICAqIGNvbnNvbGUubG9nKFwiRW50aXR5IHNwYXduZWQ6XCIsIHNwYXduZWRFbnRpdHkpO1xyXG4gICAgICogYGBgXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgc3Bhd25FbnRpdHkodHlwZTogc3RyaW5nLCBsb2NhdGlvbjogVmVjdG9yMywgZGltZW5zaW9uOiBEaW1lbnNpb24gPSBvdmVyd29ybGQsIG9wdGlvbnM/OiBTcGF3bkVudGl0eU9wdGlvbnMpIHtcclxuICAgICAgICBEZWJ1Z1RpbWVyLmNvdW50U3RhcnQoXCJFbnRpdHlVdGlsLnNwYXduRW50aXR5XCIpO1xyXG4gICAgICAgIGNvbnN0IHJlc3VsdCA9IGRpbWVuc2lvbi5zcGF3bkVudGl0eSh0eXBlLCBsb2NhdGlvbiwgb3B0aW9ucyk7XHJcbiAgICAgICAgRGVidWdUaW1lci5jb3VudEVuZCgpO1xyXG4gICAgICAgIHJldHVybiByZXN1bHQ7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBTcGF3bnMgYW4gZW50aXR5IG9mIHRoZSBzcGVjaWZpZWQgdHlwZSBhdCB0aGUgZ2l2ZW4gZGltZW5zaW9uYWwgbG9jYXRpb24uXHJcbiAgICAgKiBAcGFyYW0gdHlwZSAtIFRoZSB0eXBlIG9mIHRoZSBlbnRpdHkgdG8gc3Bhd24uIFRoaXMgc2hvdWxkIGJlIGEgc3RyaW5nIHJlcHJlc2VudGluZyB0aGUgZW50aXR5IHR5cGUuXHJcbiAgICAgKiBAcGFyYW0gZGltTG9jIC0gVGhlIGRpbWVuc2lvbmFsIGxvY2F0aW9uIHdoZXJlIHRoZSBlbnRpdHkgc2hvdWxkIGJlIHNwYXduZWQuXHJcbiAgICAgKiBUaGlzIGluY2x1ZGVzIGJvdGggdGhlIGRpbWVuc2lvbiBhbmQgdGhlIGxvY2F0aW9uIHdpdGhpbiB0aGF0IGRpbWVuc2lvbi5cclxuICAgICAqIEByZXR1cm5zIFRoZSBzcGF3bmVkIGVudGl0eSBvYmplY3QuXHJcbiAgICAgKiBAZXhhbXBsZVxyXG4gICAgICogYGBgdHlwZXNjcmlwdFxyXG4gICAgICogY29uc3QgZGltTG9jID0geyBkaW1lbnNpb246IG92ZXJ3b3JsZCwgbG9jYXRpb246IHsgeDogMTAsIHk6IDY0LCB6OiAxMCB9IH07XHJcbiAgICAgKiBjb25zdCBlbnRpdHkgPSBFbnRpdHlVdGlsLnNwYXduRW50aXR5QXREaW1Mb2MoXCJtaW5lY3JhZnQ6em9tYmllXCIsIGRpbUxvYyk7XHJcbiAgICAgKiBgYGBcclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBzcGF3bkVudGl0eUF0RGltTG9jKHR5cGU6IHN0cmluZywgZGltTG9jOiBEaW1Mb2MpIHtcclxuICAgICAgICBEZWJ1Z1RpbWVyLmNvdW50U3RhcnQoXCJFbnRpdHlVdGlsLnNwYXduRW50aXR5QXREaW1Mb2NcIik7XHJcbiAgICAgICAgY29uc3QgcmVzdWx0ID0gZGltTG9jLmRpbWVuc2lvbi5zcGF3bkVudGl0eSh0eXBlLCBkaW1Mb2MubG9jYXRpb24pO1xyXG4gICAgICAgIERlYnVnVGltZXIuY291bnRFbmQoKTtcclxuICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogU3Bhd25zIGFuIGVudGl0eSBvZiB0aGUgc3BlY2lmaWVkIHR5cGUgYXQgYSBnaXZlbiBsb2NhdGlvbiB3aXRoIGEgc3BlY2lmaWVkIHJvdGF0aW9uIGluIHRoZSBwcm92aWRlZCBkaW1lbnNpb24uXHJcbiAgICAgKiBAcGFyYW0gdHlwZSAtIFRoZSB0eXBlIG9mIHRoZSBlbnRpdHkgdG8gc3Bhd24uIFRoaXMgc2hvdWxkIGJlIGEgc3RyaW5nIHJlcHJlc2VudGluZyB0aGUgZW50aXR5IHR5cGUuXHJcbiAgICAgKiBAcGFyYW0gbG9jYXRpb24gLSBBIGBWZWN0b3IzYCBvYmplY3Qgc3BlY2lmeWluZyB0aGUgcG9zaXRpb24gd2hlcmUgdGhlIGVudGl0eSB3aWxsIGJlIHNwYXduZWQuXHJcbiAgICAgKiBAcGFyYW0gcm90YXRpb24gLSBBIGBWZWN0b3IyYCBvYmplY3Qgc3BlY2lmeWluZyB0aGUgcm90YXRpb24gb2YgdGhlIGVudGl0eSBhZnRlciBpdCBpcyBzcGF3bmVkLlxyXG4gICAgICogQHBhcmFtIGRpbWVuc2lvbiAtIFRoZSBkaW1lbnNpb24gaW4gd2hpY2ggdGhlIGVudGl0eSB3aWxsIGJlIHNwYXduZWQuIERlZmF1bHRzIHRvIHRoZSBgb3ZlcndvcmxkYCBkaW1lbnNpb24uXHJcbiAgICAgKiBAcmV0dXJucyBUaGUgc3Bhd25lZCBlbnRpdHkgaW5zdGFuY2UuXHJcbiAgICAgKiBAdGhyb3dzIFRoaXMgbWV0aG9kIG1heSB0aHJvdyBhbiBlcnJvciBpZiB0aGUgZW50aXR5IGNhbm5vdCBiZSBzcGF3bmVkIGF0IHRoZSBzcGVjaWZpZWQgbG9jYXRpb24gb3IgaWYgdGhlIHR5cGUgaXMgaW52YWxpZC5cclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBzcGF3bkVudGl0eVJvdGF0ZWQodHlwZTogc3RyaW5nLCBsb2NhdGlvbjogVmVjdG9yMywgcm90YXRpb246IFZlY3RvcjIsIGRpbWVuc2lvbjogRGltZW5zaW9uID0gb3ZlcndvcmxkKSB7XHJcbiAgICAgICAgRGVidWdUaW1lci5jb3VudFN0YXJ0KFwiRW50aXR5VXRpbC5zcGF3bkVudGl0eVJvdGF0ZWRcIik7XHJcbiAgICAgICAgY29uc3QgZW50aXR5ID0gZGltZW5zaW9uLnNwYXduRW50aXR5KHR5cGUsIGxvY2F0aW9uKTtcclxuICAgICAgICBlbnRpdHkuc2V0Um90YXRpb24ocm90YXRpb24pO1xyXG4gICAgICAgIHJldHVybiBlbnRpdHk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBTcGF3bnMgYW4gZW50aXR5IG9mIHRoZSBzcGVjaWZpZWQgdHlwZSBhdCB0aGUgZ2l2ZW4gbG9jYXRpb24gd2l0aCBhIHNwZWNpZmllZCBkaXJlY3Rpb24gaW4gdGhlIHByb3ZpZGVkIGRpbWVuc2lvbi5cclxuICAgICAqIEBwYXJhbSB0eXBlIC0gVGhlIHR5cGUgb2YgdGhlIGVudGl0eSB0byBzcGF3bi4gVGhpcyBzaG91bGQgYmUgYSBzdHJpbmcgcmVwcmVzZW50aW5nIHRoZSBlbnRpdHkgdHlwZS5cclxuICAgICAqIEBwYXJhbSBsb2NhdGlvbiAtIFRoZSAzRCB2ZWN0b3Igc3BlY2lmeWluZyB0aGUgbG9jYXRpb24gd2hlcmUgdGhlIGVudGl0eSB3aWxsIGJlIHNwYXduZWQuXHJcbiAgICAgKiBAcGFyYW0gZGlyZWN0aW9uIC0gVGhlIGRpcmVjdGlvbiB0aGUgZW50aXR5IHNob3VsZCBmYWNlIHVwb24gc3Bhd25pbmcuIFRoaXMgaXMgY29udmVydGVkIHRvIGEgcm90YXRpb24gaW50ZXJuYWxseS5cclxuICAgICAqIEBwYXJhbSBkaW1lbnNpb24gLSBUaGUgZGltZW5zaW9uIGluIHdoaWNoIHRoZSBlbnRpdHkgd2lsbCBiZSBzcGF3bmVkLiBEZWZhdWx0cyB0byB0aGUgb3ZlcndvcmxkIGlmIG5vdCBzcGVjaWZpZWQuXHJcbiAgICAgKiBAcmV0dXJucyBUaGUgc3Bhd25lZCBlbnRpdHkuXHJcbiAgICAgKiBAdGhyb3dzIFRoaXMgbWV0aG9kIG1heSB0aHJvdyBhbiBlcnJvciBpZiB0aGUgZW50aXR5IGNhbm5vdCBiZSBzcGF3bmVkIG9yIGlmIHRoZSBwcm92aWRlZCBwYXJhbWV0ZXJzIGFyZSBpbnZhbGlkLlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHNwYXduRW50aXR5V2l0aERpcmVjdGlvbih0eXBlOiBzdHJpbmcsIGxvY2F0aW9uOiBWZWN0b3IzLCBkaXJlY3Rpb246IERpcmVjdGlvbiwgZGltZW5zaW9uOiBEaW1lbnNpb24gPSBvdmVyd29ybGQpIHtcclxuICAgICAgICBEZWJ1Z1RpbWVyLmNvdW50U3RhcnQoXCJFbnRpdHlVdGlsLnNwYXduRW50aXR5V2l0aERpcmVjdGlvblwiKTtcclxuICAgICAgICBjb25zdCBlbnRpdHk6IEVudGl0eSA9IGRpbWVuc2lvbi5zcGF3bkVudGl0eSh0eXBlLCBsb2NhdGlvbik7XHJcbiAgICAgICAgY29uc3Qgcm90YXRpb24gPSBfRW50aXR5VXRpbC5jb252ZXJ0RGlyZWN0aW9uVG9Sb3RhdGlvbihkaXJlY3Rpb24pO1xyXG4gICAgICAgIGVudGl0eS5zZXRSb3RhdGlvbihyb3RhdGlvbik7XHJcbiAgICAgICAgRGVidWdUaW1lci5jb3VudEVuZCgpO1xyXG4gICAgICAgIHJldHVybiBlbnRpdHk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBTcGF3bnMgbXVsdGlwbGUgZW50aXRpZXMgb2YgYSBzcGVjaWZpZWQgdHlwZSBhdCBhIGdpdmVuIGxvY2F0aW9uIHdpdGhpbiBhIHNwZWNpZmllZCBkaW1lbnNpb24uXHJcbiAgICAgKiBAcGFyYW0gdHlwZSAtIFRoZSBpZGVudGlmaWVyIG9mIHRoZSBlbnRpdHkgdHlwZSB0byBzcGF3bi5cclxuICAgICAqIEBwYXJhbSBhbW91bnQgLSBUaGUgbnVtYmVyIG9mIGVudGl0aWVzIHRvIHNwYXduLlxyXG4gICAgICogQHBhcmFtIGxvY2F0aW9uIC0gVGhlIDNEIHZlY3RvciBzcGVjaWZ5aW5nIHRoZSBsb2NhdGlvbiB3aGVyZSB0aGUgZW50aXRpZXMgd2lsbCBiZSBzcGF3bmVkLlxyXG4gICAgICogQHBhcmFtIGRpbWVuc2lvbiAtIFRoZSBkaW1lbnNpb24gaW4gd2hpY2ggdGhlIGVudGl0aWVzIHdpbGwgYmUgc3Bhd25lZC4gRGVmYXVsdHMgdG8gdGhlIG92ZXJ3b3JsZC5cclxuICAgICAqIEByZXR1cm5zIEFuIGFycmF5IG9mIHNwYXduZWQgZW50aXRpZXMuXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgc3Bhd25FbnRpdGllcyh0eXBlOiBzdHJpbmcsIGFtb3VudDogbnVtYmVyLCBsb2NhdGlvbjogVmVjdG9yMywgZGltZW5zaW9uOiBEaW1lbnNpb24gPSBvdmVyd29ybGQpIHtcclxuICAgICAgICBEZWJ1Z1RpbWVyLmNvdW50U3RhcnQoXCJFbnRpdHlVdGlsLnNwYXduRW50aXRpZXNcIik7XHJcbiAgICAgICAgY29uc3QgZW50aXRpZXM6IEVudGl0eVtdID0gW107XHJcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBhbW91bnQ7IGkrKykge1xyXG4gICAgICAgICAgICBlbnRpdGllcy5wdXNoKHRoaXMuc3Bhd25FbnRpdHkodHlwZSwgbG9jYXRpb24sIGRpbWVuc2lvbikpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBEZWJ1Z1RpbWVyLmNvdW50RW5kKCk7XHJcbiAgICAgICAgcmV0dXJuIGVudGl0aWVzO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogRGV0ZXJtaW5lcyB3aGV0aGVyIHRoZSBnaXZlbiBlbnRpdHkgaXMgYWxpdmUuXHJcbiAgICAgKiBUaGlzIG1ldGhvZCBjaGVja3MgaWYgdGhlIGVudGl0eSBpcyB2YWxpZCBhbmQgaGFzIGEgaGVhbHRoIGNvbXBvbmVudC5cclxuICAgICAqIEl0IHRoZW4gZXZhbHVhdGVzIHdoZXRoZXIgdGhlIGVudGl0eSdzIGN1cnJlbnQgaGVhbHRoIHZhbHVlIGlzIGdyZWF0ZXJcclxuICAgICAqIHRoYW4gaXRzIGVmZmVjdGl2ZSBtaW5pbXVtIGhlYWx0aC5cclxuICAgICAqIEBwYXJhbSBlbnRpdHkgLSBUaGUgZW50aXR5IHRvIGNoZWNrLlxyXG4gICAgICogQHJldHVybnMgYHRydWVgIGlmIHRoZSBlbnRpdHkgaXMgYWxpdmUsIGBmYWxzZWAgb3RoZXJ3aXNlLiBJbnZhbGlkIGVudGl0aWVzIHJldHVybiBmYWxzZVxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGlzQWxpdmUoZW50aXR5OiBFbnRpdHkpIHtcclxuICAgICAgICBEZWJ1Z1RpbWVyLmNvdW50U3RhcnQoXCJFbnRpdHlVdGlsLmlzQWxpdmVcIik7XHJcbiAgICAgICAgY29uc3QgcmV0dXJuQW5kRW5kQ291bnQgPSAocmVzdWx0OiBib29sZWFuKSA9PiB7XHJcbiAgICAgICAgICAgIERlYnVnVGltZXIuY291bnRFbmQoKTtcclxuICAgICAgICAgICAgcmV0dXJuIHJlc3VsdDtcclxuICAgICAgICB9O1xyXG4gICAgICAgIGlmICghZW50aXR5LmlzVmFsaWQpIHJldHVybiByZXR1cm5BbmRFbmRDb3VudChmYWxzZSk7XHJcbiAgICAgICAgY29uc3QgaGVhbHRoQ29tcG9uZW50ID0gZW50aXR5LmdldENvbXBvbmVudChFbnRpdHlIZWFsdGhDb21wb25lbnQuY29tcG9uZW50SWQpIGFzIEVudGl0eUhlYWx0aENvbXBvbmVudDtcclxuICAgICAgICBpZiAoIWhlYWx0aENvbXBvbmVudCkgcmV0dXJuIHJldHVybkFuZEVuZENvdW50KGZhbHNlKTtcclxuICAgICAgICByZXR1cm4gcmV0dXJuQW5kRW5kQ291bnQoaGVhbHRoQ29tcG9uZW50LmN1cnJlbnRWYWx1ZSA+IGhlYWx0aENvbXBvbmVudC5lZmZlY3RpdmVNaW4pO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogRGV0ZXJtaW5lcyBpZiB0aGUgZ2l2ZW4gZW50aXR5IGJlbG9uZ3MgdG8gYWxsIHRoZSBzcGVjaWZpZWQgdHlwZSBmYW1pbGllcy5cclxuICAgICAqIEBwYXJhbSBlbnRpdHkgLSBUaGUgZW50aXR5IHRvIGNoZWNrIGZvciB0eXBlIGZhbWlseSBtZW1iZXJzaGlwLlxyXG4gICAgICogQHBhcmFtIGZhbWlsaWVzIC0gQW4gYXJyYXkgb2YgdHlwZSBmYW1pbHkgbmFtZXMgdG8gdmVyaWZ5IGFnYWluc3QgdGhlIGVudGl0eS5cclxuICAgICAqIEByZXR1cm5zIEEgYm9vbGVhbiBpbmRpY2F0aW5nIHdoZXRoZXIgdGhlIGVudGl0eSBiZWxvbmdzIHRvIGFsbCB0aGUgc3BlY2lmaWVkIHR5cGUgZmFtaWxpZXMuXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgaGFzRmFtaWxpZXMoZW50aXR5OiBFbnRpdHksIGZhbWlsaWVzOiBzdHJpbmdbXSkge1xyXG4gICAgICAgIERlYnVnVGltZXIuY291bnRTdGFydChcIkVudGl0eVV0aWwuaGFzRmFtaWxpZXNcIik7XHJcbiAgICAgICAgY29uc3QgZmFtaWx5Q29tcG9uZW50ID0gZW50aXR5LmdldENvbXBvbmVudChFbnRpdHlUeXBlRmFtaWx5Q29tcG9uZW50LmNvbXBvbmVudElkKSBhcyBFbnRpdHlUeXBlRmFtaWx5Q29tcG9uZW50O1xyXG4gICAgICAgIGNvbnN0IHJlc3VsdCA9IGZhbWlseUNvbXBvbmVudCAmJiBmYW1pbGllcy5ldmVyeSgoZmFtaWx5KSA9PiBmYW1pbHlDb21wb25lbnQuaGFzVHlwZUZhbWlseShmYW1pbHkpKTtcclxuICAgICAgICBEZWJ1Z1RpbWVyLmNvdW50RW5kKCk7XHJcbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFJldHJpZXZlcyBhIHBsYXllciBvYmplY3QgZnJvbSB0aGUgZ2FtZSB3b3JsZCBieSB0aGVpciBuYW1lLlxyXG4gICAgICogQHBhcmFtIG5hbWUgLSBUaGUgbmFtZSBvZiB0aGUgcGxheWVyIHRvIHNlYXJjaCBmb3IuXHJcbiAgICAgKiBAcmV0dXJucyBUaGUgcGxheWVyIG9iamVjdCBpZiBmb3VuZCwgb3RoZXJ3aXNlIGB1bmRlZmluZWRgLlxyXG4gICAgICogQHJlbWFya3NcclxuICAgICAqIFRoaXMgbWV0aG9kIHVzZXMgYHdvcmxkLmdldEFsbFBsYXllcnMoKWAgdG8gZmV0Y2ggYWxsIHBsYXllcnMgaW4gdGhlIGdhbWUgd29ybGRcclxuICAgICAqIGFuZCBwZXJmb3JtcyBhIHNlYXJjaCB0byBmaW5kIGEgcGxheWVyIHdob3NlIG5hbWUgbWF0Y2hlcyB0aGUgcHJvdmlkZWQgYG5hbWVgLlxyXG4gICAgICogUGVyZm9ybWFuY2UgbWF5IHZhcnkgZGVwZW5kaW5nIG9uIHRoZSBudW1iZXIgb2YgcGxheWVycyBpbiB0aGUgZ2FtZSB3b3JsZC5cclxuICAgICAqIERlYnVnIHRpbWluZyBpcyByZWNvcmRlZCB1c2luZyBgRGVidWdUaW1lcmAgdG8gbWVhc3VyZSBleGVjdXRpb24gdGltZS5cclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBnZXRQbGF5ZXJCeU5hbWUobmFtZTogc3RyaW5nKSB7XHJcbiAgICAgICAgRGVidWdUaW1lci5jb3VudFN0YXJ0KFwiRW50aXR5VXRpbC5nZXRQbGF5ZXJCeU5hbWVcIik7XHJcbiAgICAgICAgY29uc3QgcmVzdWx0ID0gd29ybGQuZ2V0QWxsUGxheWVycygpLmZpbmQoKHBsYXllcikgPT4gcGxheWVyLm5hbWUgPT09IG5hbWUpO1xyXG4gICAgICAgIERlYnVnVGltZXIuY291bnRFbmQoKTtcclxuICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogUmV0cmlldmVzIGFuIGVudGl0eSBmcm9tIHRoZSBnYW1lIHdvcmxkIGJ5IGl0cyB1bmlxdWUgaWRlbnRpZmllci5cclxuICAgICAqIEBwYXJhbSBpZCAtIFRoZSB1bmlxdWUgaWRlbnRpZmllciBvZiB0aGUgZW50aXR5IHRvIHJldHJpZXZlLlxyXG4gICAgICogQHJldHVybnMgVGhlIGVudGl0eSBvYmplY3QgaWYgZm91bmQsIG9yIGB1bmRlZmluZWRgIGlmIG5vIGVudGl0eSB3aXRoIHRoZSBnaXZlbiBJRCBleGlzdHMuXHJcbiAgICAgKiBAcmVtYXJrc1xyXG4gICAgICogVGhpcyBtZXRob2QgdXNlcyB0aGUgYHdvcmxkLmdldEVudGl0eWAgZnVuY3Rpb24gdG8gbG9jYXRlIHRoZSBlbnRpdHkuXHJcbiAgICAgKiBJdCBhbHNvIHRyYWNrcyB0aGUgZXhlY3V0aW9uIHRpbWUgdXNpbmcgYERlYnVnVGltZXJgIGZvciBwZXJmb3JtYW5jZSBtb25pdG9yaW5nLlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGdldEVudGl0eUJ5SWQoaWQ6IHN0cmluZykge1xyXG4gICAgICAgIERlYnVnVGltZXIuY291bnRTdGFydChcIkVudGl0eVV0aWwuZ2V0RW50aXR5QnlJZFwiKTtcclxuICAgICAgICBjb25zdCByZXN1bHQgPSB3b3JsZC5nZXRFbnRpdHkoaWQpO1xyXG4gICAgICAgIERlYnVnVGltZXIuY291bnRFbmQoKTtcclxuICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogUmV0cmlldmVzIHRoZSBuYW1lcyBvZiBhbGwgcGxheWVycyBwcm92aWRlZC5cclxuICAgICAqIEBwYXJhbSBwbGF5ZXJzIC0gVGhlIGFycmF5IG9mIHBsYXllciBlbnRpdGllcyB0byBleHRyYWN0IG5hbWVzIGZyb20uXHJcbiAgICAgKiBAcmV0dXJucyBBbiBhcnJheSBvZiBwbGF5ZXIgbmFtZXMuXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgZ2V0UGxheWVyTmFtZXMocGxheWVyczogUGxheWVyW10pOiBzdHJpbmdbXSB7XHJcbiAgICAgICAgRGVidWdUaW1lci5jb3VudFN0YXJ0KFwiRW50aXR5VXRpbC5nZXRQbGF5ZXJOYW1lc1wiKTtcclxuICAgICAgICBjb25zdCByZXN1bHQgPSBwbGF5ZXJzLm1hcCgocGxheWVyKSA9PiBwbGF5ZXIubmFtZSk7XHJcbiAgICAgICAgRGVidWdUaW1lci5jb3VudEVuZCgpO1xyXG4gICAgICAgIHJldHVybiByZXN1bHQ7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBTZXRzIHRoZSBzcGF3biBwb2ludCBmb3IgYSBnaXZlbiBwbGF5ZXIgYXQgdGhlIHNwZWNpZmllZCBsb2NhdGlvbiBhbmQgZGltZW5zaW9uLlxyXG4gICAgICogQHBhcmFtIHBsYXllciAtIFRoZSBwbGF5ZXIgd2hvc2Ugc3Bhd24gcG9pbnQgaXMgdG8gYmUgc2V0LlxyXG4gICAgICogQHBhcmFtIGxvY2F0aW9uIC0gVGhlIDNEIHZlY3RvciByZXByZXNlbnRpbmcgdGhlIGNvb3JkaW5hdGVzIG9mIHRoZSBzcGF3biBwb2ludC5cclxuICAgICAqIEBwYXJhbSBkaW1lbnNpb24gLSBUaGUgZGltZW5zaW9uIHdoZXJlIHRoZSBzcGF3biBwb2ludCBpcyBsb2NhdGVkLiBEZWZhdWx0cyB0byB0aGUgb3ZlcndvcmxkLlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHNldFNwYXduUG9pbnQocGxheWVyOiBQbGF5ZXIsIGxvY2F0aW9uOiBWZWN0b3IzLCBkaW1lbnNpb246IERpbWVuc2lvbiA9IG92ZXJ3b3JsZCkge1xyXG4gICAgICAgIHBsYXllci5zZXRTcGF3blBvaW50KHsgZGltZW5zaW9uLCB4OiBsb2NhdGlvbi54LCB5OiBsb2NhdGlvbi55LCB6OiBsb2NhdGlvbi56IH0pO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQ29udmVydHMgYSBnaXZlbiBkaXJlY3Rpb24gaW50byBhIGNvcnJlc3BvbmRpbmcgcm90YXRpb24gb2JqZWN0LlxyXG4gICAgICogQHBhcmFtIGRpcmVjdGlvbiAtIFRoZSBkaXJlY3Rpb24gdG8gY29udmVydCwgcmVwcmVzZW50ZWQgYXMgYSBgRGlyZWN0aW9uYCBlbnVtLlxyXG4gICAgICogQHJldHVybnMgQW4gb2JqZWN0IGNvbnRhaW5pbmcgdGhlIHJvdGF0aW9uIHZhbHVlczpcclxuICAgICAqICAgICAgICAgIC0gYHhgOiBUaGUgcm90YXRpb24gYXJvdW5kIHRoZSBYLWF4aXMuXHJcbiAgICAgKiAgICAgICAgICAtIGB5YDogVGhlIHJvdGF0aW9uIGFyb3VuZCB0aGUgWS1heGlzLlxyXG4gICAgICogQGV4YW1wbGVcclxuICAgICAqIGBgYHR5cGVzY3JpcHRcclxuICAgICAqIGNvbnN0IGRpcmVjdGlvbiA9IERpcmVjdGlvbi5Ob3J0aDtcclxuICAgICAqIGNvbnN0IHJvdGF0aW9uID0gRW50aXR5VXRpbC5jb252ZXJ0RGlyZWN0aW9uVG9Sb3RhdGlvbihkaXJlY3Rpb24pO1xyXG4gICAgICogY29uc29sZS5sb2cocm90YXRpb24pOyAvLyBPdXRwdXQ6IHsgeDogMCwgeTogMTgwIH1cclxuICAgICAqIGBgYFxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGNvbnZlcnREaXJlY3Rpb25Ub1JvdGF0aW9uKGRpcmVjdGlvbjogRGlyZWN0aW9uKSB7XHJcbiAgICAgICAgc3dpdGNoIChkaXJlY3Rpb24pIHtcclxuICAgICAgICAgICAgY2FzZSBEaXJlY3Rpb24uTm9ydGg6XHJcbiAgICAgICAgICAgICAgICByZXR1cm4geyB4OiAwLCB5OiAxODAgfTtcclxuICAgICAgICAgICAgY2FzZSBEaXJlY3Rpb24uRWFzdDpcclxuICAgICAgICAgICAgICAgIHJldHVybiB7IHg6IDAsIHk6IC05MCB9O1xyXG4gICAgICAgICAgICBjYXNlIERpcmVjdGlvbi5Tb3V0aDpcclxuICAgICAgICAgICAgICAgIHJldHVybiB7IHg6IDAsIHk6IDAgfTtcclxuICAgICAgICAgICAgY2FzZSBEaXJlY3Rpb24uV2VzdDpcclxuICAgICAgICAgICAgICAgIHJldHVybiB7IHg6IDAsIHk6IDkwIH07XHJcbiAgICAgICAgICAgIGNhc2UgRGlyZWN0aW9uLlVwOlxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgeDogLTkwLCB5OiAwIH07XHJcbiAgICAgICAgICAgIGNhc2UgRGlyZWN0aW9uLkRvd246XHJcbiAgICAgICAgICAgICAgICByZXR1cm4geyB4OiA5MCwgeTogMCB9O1xyXG4gICAgICAgICAgICBkZWZhdWx0OlxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgeDogMCwgeTogMCB9O1xyXG4gICAgICAgIH1cclxuICAgIH1cclxufVxyXG5cclxuZGVjbGFyZSBnbG9iYWwge1xyXG4gICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXZhclxyXG4gICAgdmFyIEVudGl0eVV0aWw6IE9taXQ8dHlwZW9mIF9FbnRpdHlVdGlsLCBcInByb3RvdHlwZVwiPjtcclxufVxyXG5nbG9iYWxUaGlzLkVudGl0eVV0aWwgPSBfRW50aXR5VXRpbDtcclxuIl0sIm5hbWVzIjpbIkRpcmVjdGlvbiIsIkVudGl0eUhlYWx0aENvbXBvbmVudCIsIkVudGl0eVR5cGVGYW1pbHlDb21wb25lbnQiLCJ3b3JsZCIsIlYzIiwiX0VudGl0eVV0aWwiLCJoYXNMaW5lT2ZTaWdodCIsInNvdXJjZSIsInRhcmdldCIsImV5ZUxldmVsIiwicmF5Y2FzdE9wdGlvbnMiLCJzb3VyY2VMb2NhdGlvbiIsImZyb21FbnRpdHkiLCJhZGQiLCJ0YXJnZXRMb2NhdGlvbiIsImRpcmVjdGlvbiIsImNsb25lIiwic3VidHJhY3QiLCJub3JtYWxpemUiLCJkaXN0YW5jZSIsImluY2x1ZGVMaXF1aWRCbG9ja3MiLCJpbmNsdWRlUGFzc2FibGVCbG9ja3MiLCJtYXhEaXN0YW5jZSIsInJlc3VsdCIsImRpbWVuc2lvbiIsImdldEJsb2NrRnJvbVJheSIsInVuZGVmaW5lZCIsImlzVmlzaWJsZUZyb21Mb2NhdGlvbiIsImxvY2F0aW9uIiwib2Zmc2V0IiwibGVuZ3RoIiwidHlwZSIsInR5cGVJZCIsImVudGl0aWVzSW5EaXJlY3Rpb24iLCJnZXRFbnRpdGllc0Zyb21SYXkiLCJzb21lIiwiZW50aXR5IiwiaWQiLCJnZXRFbnRpdGllcyIsInF1ZXJ5Iiwib3ZlcndvcmxkIiwiRGVidWdUaW1lciIsImNvdW50U3RhcnQiLCJjb3VudEVuZCIsImdldFBsYXllcnMiLCJQbGF5ZXJzQ2FjaGUiLCJnZXRBbGxQbGF5ZXJFbnRpdGllcyIsImdldE5lYXJlc3RQbGF5ZXIiLCJleGNsdWRlUGxheWVySWRzIiwiZ2V0TmVhcmVzdFBsYXllckF0RGltTG9jIiwiZGltTG9jIiwiZ2V0TmVhcmJ5UGxheWVycyIsInJhZGl1cyIsImdldFBsYXllcnNJblJhbmdlIiwiZmlsdGVyIiwiZSIsImluY2x1ZGVzIiwibWFwIiwiZ2V0TmVhcmJ5UGxheWVyc0F0RGltTG9jIiwia2lsbEVudGl0aWVzIiwiZW50aXRpZXMiLCJraWxsIiwicmVtb3ZlRW50aXRpZXMiLCJyZW1vdmUiLCJzcGF3bkl0ZW0iLCJpdGVtU3RhY2siLCJzcGF3bkl0ZW1BdERpbUxvYyIsInNwYXduRW50aXR5Iiwib3B0aW9ucyIsInNwYXduRW50aXR5QXREaW1Mb2MiLCJzcGF3bkVudGl0eVJvdGF0ZWQiLCJyb3RhdGlvbiIsInNldFJvdGF0aW9uIiwic3Bhd25FbnRpdHlXaXRoRGlyZWN0aW9uIiwiY29udmVydERpcmVjdGlvblRvUm90YXRpb24iLCJzcGF3bkVudGl0aWVzIiwiYW1vdW50IiwiaSIsInB1c2giLCJpc0FsaXZlIiwicmV0dXJuQW5kRW5kQ291bnQiLCJpc1ZhbGlkIiwiaGVhbHRoQ29tcG9uZW50IiwiZ2V0Q29tcG9uZW50IiwiY29tcG9uZW50SWQiLCJjdXJyZW50VmFsdWUiLCJlZmZlY3RpdmVNaW4iLCJoYXNGYW1pbGllcyIsImZhbWlsaWVzIiwiZmFtaWx5Q29tcG9uZW50IiwiZXZlcnkiLCJmYW1pbHkiLCJoYXNUeXBlRmFtaWx5IiwiZ2V0UGxheWVyQnlOYW1lIiwibmFtZSIsImdldEFsbFBsYXllcnMiLCJmaW5kIiwicGxheWVyIiwiZ2V0RW50aXR5QnlJZCIsImdldEVudGl0eSIsImdldFBsYXllck5hbWVzIiwicGxheWVycyIsInNldFNwYXduUG9pbnQiLCJ4IiwieSIsInoiLCJOb3J0aCIsIkVhc3QiLCJTb3V0aCIsIldlc3QiLCJVcCIsIkRvd24iLCJnbG9iYWxUaGlzIiwiRW50aXR5VXRpbCJdLCJtYXBwaW5ncyI6IkFBQUEsU0FHSUEsU0FBUyxFQUVUQyxxQkFBcUIsRUFFckJDLHlCQUF5QixFQU16QkMsS0FBSyxRQUNGLG9CQUFvQjtBQUMzQixPQUFPQyxRQUFRLHFCQUFxQjtBQU9wQyxNQUFNQztJQUNGOzs7Ozs7O0tBT0MsR0FDRCxPQUFjQyxlQUFlQyxNQUFjLEVBQUVDLE1BQWMsRUFBRUMsUUFBZ0IsRUFBRUMsY0FBb0MsRUFBVztRQUMxSCxNQUFNQyxpQkFBaUJQLEdBQUdRLFVBQVUsQ0FBQ0wsUUFBUSxNQUFNTSxHQUFHLENBQUMsR0FBR0osVUFBVTtRQUNwRSxNQUFNSyxpQkFBaUJWLEdBQUdRLFVBQVUsQ0FBQ0osUUFBUSxPQUFPSyxHQUFHLENBQUMsR0FBR0osVUFBVTtRQUNyRSxNQUFNTSxZQUFZRCxlQUFlRSxLQUFLLEdBQUdDLFFBQVEsQ0FBQ04sZ0JBQWdCTyxTQUFTO1FBQzNFLE1BQU1DLFdBQVdSLGVBQWVRLFFBQVEsQ0FBQ0w7UUFFekMsSUFBSUssYUFBYSxHQUFHLE9BQU87UUFFM0IsSUFBSSxDQUFDVCxnQkFBZ0I7WUFDakJBLGlCQUFpQjtnQkFDYlUscUJBQXFCO2dCQUNyQkMsdUJBQXVCO2dCQUN2QkMsYUFBYUg7WUFDakI7UUFDSjtRQUVBLE1BQU1JLFNBQVNaLGVBQWVhLFNBQVMsQ0FBRUMsZUFBZSxDQUFDZCxnQkFBZ0JJLFdBQVdMO1FBRXBGLE9BQU9hLFdBQVdHO0lBQ3RCO0lBRUE7Ozs7OztLQU1DLEdBQ0QsT0FBY0Msc0JBQXNCQyxRQUFZLEVBQUVwQixNQUFjLEVBQUVjLFdBQW1CLEVBQVc7UUFDNUYsTUFBTU8sU0FBU3pCLEdBQUdRLFVBQVUsQ0FBQ0osUUFBUSxPQUFPUyxRQUFRLENBQUNXO1FBQ3JELE1BQU1ULFdBQVdVLE9BQU9DLE1BQU07UUFDOUIsSUFBSVgsYUFBYSxHQUFHLE9BQU87UUFFM0IsTUFBTUosWUFBWWMsT0FBT1gsU0FBUztRQUVsQyxNQUFNUixpQkFBaUI7WUFDbkJZLGFBQWFBO1lBQ2JTLE1BQU12QixPQUFPd0IsTUFBTTtRQUN2QjtRQUVBLE1BQU1DLHNCQUFzQkwsU0FBU0osU0FBUyxFQUFFVSxtQkFBbUJOLFVBQVViLFdBQVdMO1FBQ3hGLE9BQU91QixxQkFBcUJFLEtBQUssQ0FBQ1osU0FBV0EsT0FBT2EsTUFBTSxDQUFDQyxFQUFFLEtBQUs3QixPQUFPNkIsRUFBRSxLQUFLO0lBQ3BGO0lBRUE7Ozs7O0tBS0MsR0FDRCxPQUFjQyxZQUFZQyxLQUF5QixFQUFFZixZQUF1QmdCLFNBQVMsRUFBRTtRQUNuRkMsV0FBV0MsVUFBVSxDQUFDO1FBRXRCLE1BQU1uQixTQUFTQyxVQUFVYyxXQUFXLENBQUNDO1FBQ3JDRSxXQUFXRSxRQUFRO1FBQ25CLE9BQU9wQjtJQUNYO0lBRUE7Ozs7O0tBS0MsR0FDRCxPQUFjcUIsYUFBYTtRQUN2QkgsV0FBV0MsVUFBVSxDQUFDO1FBQ3RCLE1BQU1uQixTQUFTc0IsYUFBYUMsb0JBQW9CO1FBQ2hETCxXQUFXRSxRQUFRO1FBQ25CLE9BQU9wQjtJQUNYO0lBRUE7Ozs7OztLQU1DLEdBQ0QsT0FBY3dCLGlCQUFpQm5CLFFBQWlCLEVBQUVKLFlBQXVCZ0IsU0FBUyxFQUFFUSxnQkFBMkIsRUFBRTtRQUM3R1AsV0FBV0MsVUFBVSxDQUFDO1FBQ3RCLE1BQU1uQixTQUFTc0IsYUFBYUUsZ0JBQWdCLENBQUNuQixVQUFVSixXQUFXd0IsbUJBQW1CWjtRQUNyRkssV0FBV0UsUUFBUTtRQUNuQixPQUFPcEI7SUFDWDtJQUVBOzs7Ozs7O0tBT0MsR0FDRCxPQUFjMEIseUJBQXlCQyxNQUFjLEVBQUVGLGdCQUEyQixFQUFFO1FBQ2hGUCxXQUFXQyxVQUFVLENBQUM7UUFDdEIsTUFBTW5CLFNBQVNzQixhQUFhRSxnQkFBZ0IsQ0FBQ0csT0FBT3RCLFFBQVEsRUFBRXNCLE9BQU8xQixTQUFTLEVBQUV3QixtQkFBbUJaO1FBQ25HSyxXQUFXRSxRQUFRO1FBQ25CLE9BQU9wQjtJQUNYO0lBRUE7Ozs7Ozs7S0FPQyxHQUNELE9BQWM0QixpQkFBaUJDLE1BQWMsRUFBRXhCLFFBQWlCLEVBQUVKLFlBQXVCZ0IsU0FBUyxFQUFFUSxnQkFBMkIsRUFBRTtRQUM3SFAsV0FBV0MsVUFBVSxDQUFDO1FBQ3RCLE1BQU1uQixTQUFTc0IsYUFBYVEsaUJBQWlCLENBQUN6QixVQUFVd0IsUUFBUTVCLFdBQzNEOEIsTUFBTSxDQUFDLENBQUNDLElBQU0sQ0FBQ1Asa0JBQWtCUSxTQUFTRCxFQUFFbEIsRUFBRSxHQUM5Q29CLEdBQUcsQ0FBQyxDQUFDRixJQUFNQSxFQUFFbkIsTUFBTTtRQUN4QkssV0FBV0UsUUFBUTtRQUNuQixPQUFPcEI7SUFDWDtJQUVBOzs7Ozs7S0FNQyxHQUNELE9BQWNtQyx5QkFBeUJOLE1BQWMsRUFBRUYsTUFBYyxFQUFFRixnQkFBMkIsRUFBRTtRQUNoR1AsV0FBV0MsVUFBVSxDQUFDO1FBQ3RCLE1BQU1uQixTQUFTc0IsYUFBYVEsaUJBQWlCLENBQUNILE9BQU90QixRQUFRLEVBQUV3QixRQUFRRixPQUFPMUIsU0FBUyxFQUNsRjhCLE1BQU0sQ0FBQyxDQUFDQyxJQUFNLENBQUNQLGtCQUFrQlEsU0FBU0QsRUFBRWxCLEVBQUUsR0FDOUNvQixHQUFHLENBQUMsQ0FBQ0YsSUFBTUEsRUFBRW5CLE1BQU07UUFDeEJLLFdBQVdFLFFBQVE7UUFDbkIsT0FBT3BCO0lBQ1g7SUFFQTs7Ozs7OztLQU9DLEdBQ0QsT0FBY29DLGFBQWFwQixLQUF5QixFQUFFZixZQUF1QmdCLFNBQVMsRUFBRTtRQUNwRkMsV0FBV0MsVUFBVSxDQUFDO1FBQ3RCLE1BQU1rQixXQUFXLElBQUksQ0FBQ3RCLFdBQVcsQ0FBQ0MsT0FBT2Y7UUFDekMsS0FBSyxNQUFNWSxVQUFVd0IsU0FBVTtZQUMzQnhCLE9BQU95QixJQUFJO1FBQ2Y7UUFDQXBCLFdBQVdFLFFBQVE7SUFDdkI7SUFFQTs7Ozs7OztLQU9DLEdBQ0QsT0FBY21CLGVBQWV2QixLQUF5QixFQUFFZixZQUF1QmdCLFNBQVMsRUFBRTtRQUN0RkMsV0FBV0MsVUFBVSxDQUFDO1FBQ3RCLE1BQU1rQixXQUFXLElBQUksQ0FBQ3RCLFdBQVcsQ0FBQ0MsT0FBT2Y7UUFDekMsS0FBSyxNQUFNWSxVQUFVd0IsU0FBVTtZQUMzQnhCLE9BQU8yQixNQUFNO1FBQ2pCO1FBQ0F0QixXQUFXRSxRQUFRO0lBQ3ZCO0lBRUE7Ozs7OztLQU1DLEdBQ0QsT0FBY3FCLFVBQVVDLFNBQW9CLEVBQUVyQyxRQUFpQixFQUFFSixZQUF1QmdCLFNBQVMsRUFBRTtRQUMvRkMsV0FBV0MsVUFBVSxDQUFDO1FBQ3RCLE1BQU1uQixTQUFTQyxVQUFVd0MsU0FBUyxDQUFDQyxXQUFXckM7UUFDOUNhLFdBQVdFLFFBQVE7UUFDbkIsT0FBT3BCO0lBQ1g7SUFFQTs7Ozs7O0tBTUMsR0FDRCxPQUFjMkMsa0JBQWtCRCxTQUFvQixFQUFFZixNQUFjLEVBQUU7UUFDbEVULFdBQVdDLFVBQVUsQ0FBQztRQUN0QixNQUFNbkIsU0FBUzJCLE9BQU8xQixTQUFTLENBQUN3QyxTQUFTLENBQUNDLFdBQVdmLE9BQU90QixRQUFRO1FBQ3BFYSxXQUFXRSxRQUFRO1FBQ25CLE9BQU9wQjtJQUNYO0lBRUE7Ozs7Ozs7Ozs7Ozs7S0FhQyxHQUNELE9BQWM0QyxZQUFZcEMsSUFBWSxFQUFFSCxRQUFpQixFQUFFSixZQUF1QmdCLFNBQVMsRUFBRTRCLE9BQTRCLEVBQUU7UUFDdkgzQixXQUFXQyxVQUFVLENBQUM7UUFDdEIsTUFBTW5CLFNBQVNDLFVBQVUyQyxXQUFXLENBQUNwQyxNQUFNSCxVQUFVd0M7UUFDckQzQixXQUFXRSxRQUFRO1FBQ25CLE9BQU9wQjtJQUNYO0lBRUE7Ozs7Ozs7Ozs7O0tBV0MsR0FDRCxPQUFjOEMsb0JBQW9CdEMsSUFBWSxFQUFFbUIsTUFBYyxFQUFFO1FBQzVEVCxXQUFXQyxVQUFVLENBQUM7UUFDdEIsTUFBTW5CLFNBQVMyQixPQUFPMUIsU0FBUyxDQUFDMkMsV0FBVyxDQUFDcEMsTUFBTW1CLE9BQU90QixRQUFRO1FBQ2pFYSxXQUFXRSxRQUFRO1FBQ25CLE9BQU9wQjtJQUNYO0lBRUE7Ozs7Ozs7O0tBUUMsR0FDRCxPQUFjK0MsbUJBQW1CdkMsSUFBWSxFQUFFSCxRQUFpQixFQUFFMkMsUUFBaUIsRUFBRS9DLFlBQXVCZ0IsU0FBUyxFQUFFO1FBQ25IQyxXQUFXQyxVQUFVLENBQUM7UUFDdEIsTUFBTU4sU0FBU1osVUFBVTJDLFdBQVcsQ0FBQ3BDLE1BQU1IO1FBQzNDUSxPQUFPb0MsV0FBVyxDQUFDRDtRQUNuQixPQUFPbkM7SUFDWDtJQUVBOzs7Ozs7OztLQVFDLEdBQ0QsT0FBY3FDLHlCQUF5QjFDLElBQVksRUFBRUgsUUFBaUIsRUFBRWIsU0FBb0IsRUFBRVMsWUFBdUJnQixTQUFTLEVBQUU7UUFDNUhDLFdBQVdDLFVBQVUsQ0FBQztRQUN0QixNQUFNTixTQUFpQlosVUFBVTJDLFdBQVcsQ0FBQ3BDLE1BQU1IO1FBQ25ELE1BQU0yQyxXQUFXbEUsWUFBWXFFLDBCQUEwQixDQUFDM0Q7UUFDeERxQixPQUFPb0MsV0FBVyxDQUFDRDtRQUNuQjlCLFdBQVdFLFFBQVE7UUFDbkIsT0FBT1A7SUFDWDtJQUVBOzs7Ozs7O0tBT0MsR0FDRCxPQUFjdUMsY0FBYzVDLElBQVksRUFBRTZDLE1BQWMsRUFBRWhELFFBQWlCLEVBQUVKLFlBQXVCZ0IsU0FBUyxFQUFFO1FBQzNHQyxXQUFXQyxVQUFVLENBQUM7UUFDdEIsTUFBTWtCLFdBQXFCLEVBQUU7UUFDN0IsSUFBSyxJQUFJaUIsSUFBSSxHQUFHQSxJQUFJRCxRQUFRQyxJQUFLO1lBQzdCakIsU0FBU2tCLElBQUksQ0FBQyxJQUFJLENBQUNYLFdBQVcsQ0FBQ3BDLE1BQU1ILFVBQVVKO1FBQ25EO1FBQ0FpQixXQUFXRSxRQUFRO1FBQ25CLE9BQU9pQjtJQUNYO0lBRUE7Ozs7Ozs7S0FPQyxHQUNELE9BQWNtQixRQUFRM0MsTUFBYyxFQUFFO1FBQ2xDSyxXQUFXQyxVQUFVLENBQUM7UUFDdEIsTUFBTXNDLG9CQUFvQixDQUFDekQ7WUFDdkJrQixXQUFXRSxRQUFRO1lBQ25CLE9BQU9wQjtRQUNYO1FBQ0EsSUFBSSxDQUFDYSxPQUFPNkMsT0FBTyxFQUFFLE9BQU9ELGtCQUFrQjtRQUM5QyxNQUFNRSxrQkFBa0I5QyxPQUFPK0MsWUFBWSxDQUFDbEYsc0JBQXNCbUYsV0FBVztRQUM3RSxJQUFJLENBQUNGLGlCQUFpQixPQUFPRixrQkFBa0I7UUFDL0MsT0FBT0Esa0JBQWtCRSxnQkFBZ0JHLFlBQVksR0FBR0gsZ0JBQWdCSSxZQUFZO0lBQ3hGO0lBRUE7Ozs7O0tBS0MsR0FDRCxPQUFjQyxZQUFZbkQsTUFBYyxFQUFFb0QsUUFBa0IsRUFBRTtRQUMxRC9DLFdBQVdDLFVBQVUsQ0FBQztRQUN0QixNQUFNK0Msa0JBQWtCckQsT0FBTytDLFlBQVksQ0FBQ2pGLDBCQUEwQmtGLFdBQVc7UUFDakYsTUFBTTdELFNBQVNrRSxtQkFBbUJELFNBQVNFLEtBQUssQ0FBQyxDQUFDQyxTQUFXRixnQkFBZ0JHLGFBQWEsQ0FBQ0Q7UUFDM0ZsRCxXQUFXRSxRQUFRO1FBQ25CLE9BQU9wQjtJQUNYO0lBRUE7Ozs7Ozs7OztLQVNDLEdBQ0QsT0FBY3NFLGdCQUFnQkMsSUFBWSxFQUFFO1FBQ3hDckQsV0FBV0MsVUFBVSxDQUFDO1FBQ3RCLE1BQU1uQixTQUFTcEIsTUFBTTRGLGFBQWEsR0FBR0MsSUFBSSxDQUFDLENBQUNDLFNBQVdBLE9BQU9ILElBQUksS0FBS0E7UUFDdEVyRCxXQUFXRSxRQUFRO1FBQ25CLE9BQU9wQjtJQUNYO0lBRUE7Ozs7Ozs7S0FPQyxHQUNELE9BQWMyRSxjQUFjN0QsRUFBVSxFQUFFO1FBQ3BDSSxXQUFXQyxVQUFVLENBQUM7UUFDdEIsTUFBTW5CLFNBQVNwQixNQUFNZ0csU0FBUyxDQUFDOUQ7UUFDL0JJLFdBQVdFLFFBQVE7UUFDbkIsT0FBT3BCO0lBQ1g7SUFFQTs7OztLQUlDLEdBQ0QsT0FBYzZFLGVBQWVDLE9BQWlCLEVBQVk7UUFDdEQ1RCxXQUFXQyxVQUFVLENBQUM7UUFDdEIsTUFBTW5CLFNBQVM4RSxRQUFRNUMsR0FBRyxDQUFDLENBQUN3QyxTQUFXQSxPQUFPSCxJQUFJO1FBQ2xEckQsV0FBV0UsUUFBUTtRQUNuQixPQUFPcEI7SUFDWDtJQUVBOzs7OztLQUtDLEdBQ0QsT0FBYytFLGNBQWNMLE1BQWMsRUFBRXJFLFFBQWlCLEVBQUVKLFlBQXVCZ0IsU0FBUyxFQUFFO1FBQzdGeUQsT0FBT0ssYUFBYSxDQUFDO1lBQUU5RTtZQUFXK0UsR0FBRzNFLFNBQVMyRSxDQUFDO1lBQUVDLEdBQUc1RSxTQUFTNEUsQ0FBQztZQUFFQyxHQUFHN0UsU0FBUzZFLENBQUM7UUFBQztJQUNsRjtJQUVBOzs7Ozs7Ozs7Ozs7S0FZQyxHQUNELE9BQWMvQiwyQkFBMkIzRCxTQUFvQixFQUFFO1FBQzNELE9BQVFBO1lBQ0osS0FBS2YsVUFBVTBHLEtBQUs7Z0JBQ2hCLE9BQU87b0JBQUVILEdBQUc7b0JBQUdDLEdBQUc7Z0JBQUk7WUFDMUIsS0FBS3hHLFVBQVUyRyxJQUFJO2dCQUNmLE9BQU87b0JBQUVKLEdBQUc7b0JBQUdDLEdBQUcsQ0FBQztnQkFBRztZQUMxQixLQUFLeEcsVUFBVTRHLEtBQUs7Z0JBQ2hCLE9BQU87b0JBQUVMLEdBQUc7b0JBQUdDLEdBQUc7Z0JBQUU7WUFDeEIsS0FBS3hHLFVBQVU2RyxJQUFJO2dCQUNmLE9BQU87b0JBQUVOLEdBQUc7b0JBQUdDLEdBQUc7Z0JBQUc7WUFDekIsS0FBS3hHLFVBQVU4RyxFQUFFO2dCQUNiLE9BQU87b0JBQUVQLEdBQUcsQ0FBQztvQkFBSUMsR0FBRztnQkFBRTtZQUMxQixLQUFLeEcsVUFBVStHLElBQUk7Z0JBQ2YsT0FBTztvQkFBRVIsR0FBRztvQkFBSUMsR0FBRztnQkFBRTtZQUN6QjtnQkFDSSxPQUFPO29CQUFFRCxHQUFHO29CQUFHQyxHQUFHO2dCQUFFO1FBQzVCO0lBQ0o7QUFDSjtBQU1BUSxXQUFXQyxVQUFVLEdBQUc1RyJ9