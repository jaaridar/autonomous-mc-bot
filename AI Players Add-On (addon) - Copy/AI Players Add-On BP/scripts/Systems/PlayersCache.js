import { system, world } from "@minecraft/server";
import V3 from "Helpers/Vectors/V3";
class _PlayersCache {
    /**
     * Provides backward compatibility - returns array of all cached players
     */ static get players() {
        return Array.from(this.playersMap.values());
    }
    static init() {
        // Subscribe to player join/leave events
        CustomEvents.subscribe("PlayerJoined", (player)=>{
            this.addPlayer(player);
        });
        // Subscribe to the native leave event to make sure we remove players if they disconnect
        EventSubscriber.subscribe("WorldBeforeEvents", "playerLeave", ({ player })=>this.playersMap.delete(player.id));
        // Initialize cache with current players
        this.initCache();
        // Periodically update mutable fields
        system.runInterval(()=>{
            this.updateMutableFields();
        }, this.UpdateInterval);
    }
    /**
     * Initial cache population - called once at startup
     */ static initCache() {
        DebugTimer.countStart("PlayersCache.updateCache");
        const players = world.getPlayers();
        for (const player of players){
            this.addPlayer(player);
        }
        DebugTimer.countEnd();
    }
    /**
     * Adds a player to the cache immediately when they join
     */ static addPlayer(player) {
        const playerLocation = V3.fromEntity(player);
        const dimension = this.defaultToOverworldForDimension ? overworld : player.dimension;
        this.playersMap.set(player.id, {
            id: player.id,
            name: player.name,
            dimension: dimension,
            location: playerLocation,
            entity: player
        });
    }
    /**
     * Updates only the mutable fields (location, module, and optionally dimension) for existing players
     * Called every UpdateInterval ticks
     */ static updateMutableFields() {
        DebugTimer.countStart("PlayersCache.updateMutableFields");
        for (const cachedPlayer of this.playersMap.values()){
            // Update location if it fails check if the player is valid.
            try {
                cachedPlayer.location = V3.fromEntity(cachedPlayer.entity);
            } catch  {
                if (!cachedPlayer.entity.isValid) {
                    const args = {
                        playerId: cachedPlayer.id,
                        playerName: cachedPlayer.name
                    };
                    console.error(`PlayerCache: Failed to get location for player and they are not valid. Did we fail to remove them on quit? Args = ${JSON.stringify(args)} `);
                    this.playersMap.delete(cachedPlayer.id);
                    continue;
                }
                const args = {
                    playerId: cachedPlayer.id,
                    playerName: cachedPlayer.name
                };
                console.error(`PlayerCache: Failed to get location for valid player. Args = ${JSON.stringify(args)} `);
                continue;
            }
            // Update dimension if not defaulting to overworld
            if (!this.defaultToOverworldForDimension) {
                cachedPlayer.dimension = cachedPlayer.entity.dimension;
            }
        }
        DebugTimer.countEnd();
    }
    static getCount() {
        return this.players.length;
    }
    /**
     * Retrieves a list of players within a specified range of a given location in a specific dimension.
     *
     * @param location - The central location to check for players within range.
     * @param range - The maximum distance from the location to include players.
     * @param dimension - The dimension to filter players by. Only players in this dimension will be considered.
     * @param excludePlayerId - Optional player ID to exclude from the results.
     * @returns An array of players that are within the specified range of the location and in the specified dimension.
     */ static getPlayersInRange(location, range, dimension, excludePlayerId) {
        DebugTimer.countStart("PlayersCache.getPlayersInRange");
        const result = [];
        for (const player of this.playersMap.values()){
            if (dimension && dimension.id !== player.dimension.id) continue;
            if (excludePlayerId && player.id === excludePlayerId) continue;
            if (player.location.distance(location) <= range) {
                result.push(player);
            }
        }
        DebugTimer.countEnd();
        return result;
    }
    /**
     * Finds the nearest player to a given location within a specified dimension.
     *
     * @param location - The location to compare distances against.
     * @param dimension - The dimension to filter players by. Only players in this dimension will be considered.
     * @param excludePlayerIds - Optional array of player IDs to exclude from the search.
     * @returns The nearest player to the specified location within the given dimension, or `null` if no players are found.
     */ static getNearestPlayer(location, dimension, excludePlayerIds) {
        DebugTimer.countStart("PlayersCache.getNearestPlayer");
        let nearestPlayer = null;
        let nearestDistance = Infinity;
        for (const player of this.playersMap.values()){
            if (dimension?.id !== player.dimension.id) continue;
            if (excludePlayerIds?.includes(player.id)) continue;
            const distance = player.location.distance(location);
            if (distance < nearestDistance) {
                nearestDistance = distance;
                nearestPlayer = player;
            }
        }
        DebugTimer.countEnd();
        return nearestPlayer;
    }
    /**
     * Retrieves the nearest player to a specified location within a maximum range in the given dimension.
     *
     * @param location - The location to search around, represented as a `Vector3`.
     * @param maxRange - The maximum distance from the location to consider a player as "nearest".
     * @param dimension - The dimension in which to search for players.
     * @param excludePlayerIds - Optional array of player IDs to exclude from the search.
     * @returns The nearest player within the specified range, or `undefined` if no player is found
     * or if the nearest player is outside the maximum range.
     */ static getNearestPlayerMaxRange(location, maxRange, dimension, excludePlayerIds) {
        DebugTimer.countStart("PlayersCache.getNearestPlayerMaxRange");
        const nearestPlayer = this.getNearestPlayer(location, dimension, excludePlayerIds);
        if (!nearestPlayer) {
            DebugTimer.countEnd();
            return undefined;
        }
        const distance = nearestPlayer.location.distance(location);
        DebugTimer.countEnd();
        return distance <= maxRange ? nearestPlayer : undefined;
    }
    /**
     * Calculates the distance to the closest player from a given location within a specified dimension.
     *
     * @param location - The location from which the distance to the closest player is calculated.
     * @param dimension - The dimension in which the search for the closest player is performed.
     * If the player's dimension does not match this dimension, they are ignored.
     * @param excludePlayerIds - Optional array of player IDs to exclude from the search.
     * @returns The distance to the closest player. If no players are found in the specified dimension, returns `Infinity`.
     */ static getDistanceToClosestPlayer(location, dimension, excludePlayerIds) {
        DebugTimer.countStart("PlayersCache.getDistanceToClosestPlayer");
        let minDistance = Infinity;
        for (const player of this.playersMap.values()){
            if (dimension?.id !== player.dimension.id) continue;
            if (excludePlayerIds?.includes(player.id)) continue;
            minDistance = Math.min(minDistance, player.location.distance(location));
        }
        DebugTimer.countEnd();
        return minDistance;
    }
    /**
     * Retrieves the location of a specified player from the players cache.
     * @param player - The player whose location is to be retrieved.
     * @returns The location of the player if found, otherwise `undefined`.
     */ static getPlayerLocation(player) {
        DebugTimer.countStart("PlayersCache.getPlayerLocation");
        const result = this.playersMap.get(player.id)?.location;
        DebugTimer.countEnd();
        return result;
    }
    /**
     * Retrieves a player by their unique identifier.
     * @param playerId The unique identifier of the player to retrieve.
     * @returns The player object if found, otherwise `undefined`.
     */ static getPlayerById(playerId) {
        DebugTimer.countStart("PlayersCache.getPlayerById");
        const result = this.playersMap.get(playerId);
        DebugTimer.countEnd();
        return result;
    }
    /**
     * Efficiently retrieves all player entities directly from the cache Map.
     * More efficient than using the players getter as it avoids array creation.
     * @returns An array of all cached player entities.
     */ static getAllPlayerEntities() {
        DebugTimer.countStart("PlayersCache.getAllPlayerEntities");
        const result = [];
        for (const playerData of this.playersMap.values()){
            result.push(playerData.entity);
        }
        DebugTimer.countEnd();
        return result;
    }
    /** Checks if a player exists in the cache */ static isCachedPlayer(player) {
        return this.playersMap.has(player.id);
    }
}
_PlayersCache.UpdateInterval = 3;
/**
     * If true, all players are assumed to be in the overworld dimension.
     * This reduces native calls by not fetching player.dimension every update.
     * If false, dimension will be updated every 3 ticks for each player.
     */ _PlayersCache.defaultToOverworldForDimension = false;
_PlayersCache.playersMap = new Map();
globalThis.PlayersCache = _PlayersCache;

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIlBsYXllcnNDYWNoZS50cyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBEaW1lbnNpb24sIFBsYXllciwgc3lzdGVtLCBWZWN0b3IzLCB3b3JsZCB9IGZyb20gXCJAbWluZWNyYWZ0L3NlcnZlclwiO1xyXG5pbXBvcnQgVjMgZnJvbSBcIkhlbHBlcnMvVmVjdG9ycy9WM1wiO1xyXG5cclxuaW50ZXJmYWNlIFBsYXllckNhY2hlRGF0YSB7XHJcbiAgICBpZDogc3RyaW5nO1xyXG4gICAgbmFtZTogc3RyaW5nO1xyXG4gICAgbG9jYXRpb246IFYzO1xyXG4gICAgZGltZW5zaW9uOiBEaW1lbnNpb247XHJcbiAgICBlbnRpdHk6IFBsYXllcjtcclxufVxyXG5cclxuY2xhc3MgX1BsYXllcnNDYWNoZSB7XHJcbiAgICBwdWJsaWMgc3RhdGljIHJlYWRvbmx5IFVwZGF0ZUludGVydmFsID0gMztcclxuXHJcbiAgICAvKipcclxuICAgICAqIElmIHRydWUsIGFsbCBwbGF5ZXJzIGFyZSBhc3N1bWVkIHRvIGJlIGluIHRoZSBvdmVyd29ybGQgZGltZW5zaW9uLlxyXG4gICAgICogVGhpcyByZWR1Y2VzIG5hdGl2ZSBjYWxscyBieSBub3QgZmV0Y2hpbmcgcGxheWVyLmRpbWVuc2lvbiBldmVyeSB1cGRhdGUuXHJcbiAgICAgKiBJZiBmYWxzZSwgZGltZW5zaW9uIHdpbGwgYmUgdXBkYXRlZCBldmVyeSAzIHRpY2tzIGZvciBlYWNoIHBsYXllci5cclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyByZWFkb25seSBkZWZhdWx0VG9PdmVyd29ybGRGb3JEaW1lbnNpb24gPSBmYWxzZTtcclxuXHJcbiAgICBwcml2YXRlIHN0YXRpYyByZWFkb25seSBwbGF5ZXJzTWFwID0gbmV3IE1hcDxzdHJpbmcsIFBsYXllckNhY2hlRGF0YT4oKTtcclxuXHJcbiAgICAvKipcclxuICAgICAqIFByb3ZpZGVzIGJhY2t3YXJkIGNvbXBhdGliaWxpdHkgLSByZXR1cm5zIGFycmF5IG9mIGFsbCBjYWNoZWQgcGxheWVyc1xyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGdldCBwbGF5ZXJzKCk6IFBsYXllckNhY2hlRGF0YVtdIHtcclxuICAgICAgICByZXR1cm4gQXJyYXkuZnJvbSh0aGlzLnBsYXllcnNNYXAudmFsdWVzKCkpO1xyXG4gICAgfVxyXG5cclxuICAgIHB1YmxpYyBzdGF0aWMgaW5pdCgpIHtcclxuICAgICAgICAvLyBTdWJzY3JpYmUgdG8gcGxheWVyIGpvaW4vbGVhdmUgZXZlbnRzXHJcbiAgICAgICAgQ3VzdG9tRXZlbnRzLnN1YnNjcmliZShcIlBsYXllckpvaW5lZFwiLCAocGxheWVyOiBQbGF5ZXIpID0+IHtcclxuICAgICAgICAgICAgdGhpcy5hZGRQbGF5ZXIocGxheWVyKTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgLy8gU3Vic2NyaWJlIHRvIHRoZSBuYXRpdmUgbGVhdmUgZXZlbnQgdG8gbWFrZSBzdXJlIHdlIHJlbW92ZSBwbGF5ZXJzIGlmIHRoZXkgZGlzY29ubmVjdFxyXG4gICAgICAgIEV2ZW50U3Vic2NyaWJlci5zdWJzY3JpYmUoXCJXb3JsZEJlZm9yZUV2ZW50c1wiLCBcInBsYXllckxlYXZlXCIsICh7IHBsYXllciB9KSA9PiB0aGlzLnBsYXllcnNNYXAuZGVsZXRlKHBsYXllci5pZCkpO1xyXG5cclxuICAgICAgICAvLyBJbml0aWFsaXplIGNhY2hlIHdpdGggY3VycmVudCBwbGF5ZXJzXHJcbiAgICAgICAgdGhpcy5pbml0Q2FjaGUoKTtcclxuXHJcbiAgICAgICAgLy8gUGVyaW9kaWNhbGx5IHVwZGF0ZSBtdXRhYmxlIGZpZWxkc1xyXG4gICAgICAgIHN5c3RlbS5ydW5JbnRlcnZhbCgoKSA9PiB7XHJcbiAgICAgICAgICAgIHRoaXMudXBkYXRlTXV0YWJsZUZpZWxkcygpO1xyXG4gICAgICAgIH0sIHRoaXMuVXBkYXRlSW50ZXJ2YWwpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogSW5pdGlhbCBjYWNoZSBwb3B1bGF0aW9uIC0gY2FsbGVkIG9uY2UgYXQgc3RhcnR1cFxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIHN0YXRpYyBpbml0Q2FjaGUoKSB7XHJcbiAgICAgICAgRGVidWdUaW1lci5jb3VudFN0YXJ0KFwiUGxheWVyc0NhY2hlLnVwZGF0ZUNhY2hlXCIpO1xyXG4gICAgICAgIGNvbnN0IHBsYXllcnMgPSB3b3JsZC5nZXRQbGF5ZXJzKCk7XHJcbiAgICAgICAgZm9yIChjb25zdCBwbGF5ZXIgb2YgcGxheWVycykge1xyXG4gICAgICAgICAgICB0aGlzLmFkZFBsYXllcihwbGF5ZXIpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBEZWJ1Z1RpbWVyLmNvdW50RW5kKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBBZGRzIGEgcGxheWVyIHRvIHRoZSBjYWNoZSBpbW1lZGlhdGVseSB3aGVuIHRoZXkgam9pblxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIHN0YXRpYyBhZGRQbGF5ZXIocGxheWVyOiBQbGF5ZXIpIHtcclxuICAgICAgICBjb25zdCBwbGF5ZXJMb2NhdGlvbiA9IFYzLmZyb21FbnRpdHkocGxheWVyKTtcclxuICAgICAgICBjb25zdCBkaW1lbnNpb24gPSB0aGlzLmRlZmF1bHRUb092ZXJ3b3JsZEZvckRpbWVuc2lvbiA/IG92ZXJ3b3JsZCA6IHBsYXllci5kaW1lbnNpb247XHJcblxyXG4gICAgICAgIHRoaXMucGxheWVyc01hcC5zZXQocGxheWVyLmlkLCB7XHJcbiAgICAgICAgICAgIGlkOiBwbGF5ZXIuaWQsXHJcbiAgICAgICAgICAgIG5hbWU6IHBsYXllci5uYW1lLFxyXG4gICAgICAgICAgICBkaW1lbnNpb246IGRpbWVuc2lvbixcclxuICAgICAgICAgICAgbG9jYXRpb246IHBsYXllckxvY2F0aW9uLFxyXG4gICAgICAgICAgICBlbnRpdHk6IHBsYXllcixcclxuICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFVwZGF0ZXMgb25seSB0aGUgbXV0YWJsZSBmaWVsZHMgKGxvY2F0aW9uLCBtb2R1bGUsIGFuZCBvcHRpb25hbGx5IGRpbWVuc2lvbikgZm9yIGV4aXN0aW5nIHBsYXllcnNcclxuICAgICAqIENhbGxlZCBldmVyeSBVcGRhdGVJbnRlcnZhbCB0aWNrc1xyXG4gICAgICovXHJcbiAgICBwcml2YXRlIHN0YXRpYyB1cGRhdGVNdXRhYmxlRmllbGRzKCkge1xyXG4gICAgICAgIERlYnVnVGltZXIuY291bnRTdGFydChcIlBsYXllcnNDYWNoZS51cGRhdGVNdXRhYmxlRmllbGRzXCIpO1xyXG4gICAgICAgIGZvciAoY29uc3QgY2FjaGVkUGxheWVyIG9mIHRoaXMucGxheWVyc01hcC52YWx1ZXMoKSkge1xyXG4gICAgICAgICAgICAvLyBVcGRhdGUgbG9jYXRpb24gaWYgaXQgZmFpbHMgY2hlY2sgaWYgdGhlIHBsYXllciBpcyB2YWxpZC5cclxuICAgICAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgICAgIGNhY2hlZFBsYXllci5sb2NhdGlvbiA9IFYzLmZyb21FbnRpdHkoY2FjaGVkUGxheWVyLmVudGl0eSk7XHJcbiAgICAgICAgICAgIH0gY2F0Y2gge1xyXG4gICAgICAgICAgICAgICAgaWYgKCFjYWNoZWRQbGF5ZXIuZW50aXR5LmlzVmFsaWQpIHtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBhcmdzID0geyBwbGF5ZXJJZDogY2FjaGVkUGxheWVyLmlkLCBwbGF5ZXJOYW1lOiBjYWNoZWRQbGF5ZXIubmFtZSB9O1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGBQbGF5ZXJDYWNoZTogRmFpbGVkIHRvIGdldCBsb2NhdGlvbiBmb3IgcGxheWVyIGFuZCB0aGV5IGFyZSBub3QgdmFsaWQuIERpZCB3ZSBmYWlsIHRvIHJlbW92ZSB0aGVtIG9uIHF1aXQ/IEFyZ3MgPSAke0pTT04uc3RyaW5naWZ5KGFyZ3MpfSBgXHJcbiAgICAgICAgICAgICAgICAgICAgKTtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnBsYXllcnNNYXAuZGVsZXRlKGNhY2hlZFBsYXllci5pZCk7XHJcbiAgICAgICAgICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBjb25zdCBhcmdzID0geyBwbGF5ZXJJZDogY2FjaGVkUGxheWVyLmlkLCBwbGF5ZXJOYW1lOiBjYWNoZWRQbGF5ZXIubmFtZSB9O1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcihgUGxheWVyQ2FjaGU6IEZhaWxlZCB0byBnZXQgbG9jYXRpb24gZm9yIHZhbGlkIHBsYXllci4gQXJncyA9ICR7SlNPTi5zdHJpbmdpZnkoYXJncyl9IGApO1xyXG4gICAgICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIC8vIFVwZGF0ZSBkaW1lbnNpb24gaWYgbm90IGRlZmF1bHRpbmcgdG8gb3ZlcndvcmxkXHJcbiAgICAgICAgICAgIGlmICghdGhpcy5kZWZhdWx0VG9PdmVyd29ybGRGb3JEaW1lbnNpb24pIHtcclxuICAgICAgICAgICAgICAgIGNhY2hlZFBsYXllci5kaW1lbnNpb24gPSBjYWNoZWRQbGF5ZXIuZW50aXR5LmRpbWVuc2lvbjtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICBEZWJ1Z1RpbWVyLmNvdW50RW5kKCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHVibGljIHN0YXRpYyBnZXRDb3VudCgpOiBudW1iZXIge1xyXG4gICAgICAgIHJldHVybiB0aGlzLnBsYXllcnMubGVuZ3RoO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogUmV0cmlldmVzIGEgbGlzdCBvZiBwbGF5ZXJzIHdpdGhpbiBhIHNwZWNpZmllZCByYW5nZSBvZiBhIGdpdmVuIGxvY2F0aW9uIGluIGEgc3BlY2lmaWMgZGltZW5zaW9uLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBsb2NhdGlvbiAtIFRoZSBjZW50cmFsIGxvY2F0aW9uIHRvIGNoZWNrIGZvciBwbGF5ZXJzIHdpdGhpbiByYW5nZS5cclxuICAgICAqIEBwYXJhbSByYW5nZSAtIFRoZSBtYXhpbXVtIGRpc3RhbmNlIGZyb20gdGhlIGxvY2F0aW9uIHRvIGluY2x1ZGUgcGxheWVycy5cclxuICAgICAqIEBwYXJhbSBkaW1lbnNpb24gLSBUaGUgZGltZW5zaW9uIHRvIGZpbHRlciBwbGF5ZXJzIGJ5LiBPbmx5IHBsYXllcnMgaW4gdGhpcyBkaW1lbnNpb24gd2lsbCBiZSBjb25zaWRlcmVkLlxyXG4gICAgICogQHBhcmFtIGV4Y2x1ZGVQbGF5ZXJJZCAtIE9wdGlvbmFsIHBsYXllciBJRCB0byBleGNsdWRlIGZyb20gdGhlIHJlc3VsdHMuXHJcbiAgICAgKiBAcmV0dXJucyBBbiBhcnJheSBvZiBwbGF5ZXJzIHRoYXQgYXJlIHdpdGhpbiB0aGUgc3BlY2lmaWVkIHJhbmdlIG9mIHRoZSBsb2NhdGlvbiBhbmQgaW4gdGhlIHNwZWNpZmllZCBkaW1lbnNpb24uXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgZ2V0UGxheWVyc0luUmFuZ2UobG9jYXRpb246IFZlY3RvcjMsIHJhbmdlOiBudW1iZXIsIGRpbWVuc2lvbjogRGltZW5zaW9uLCBleGNsdWRlUGxheWVySWQ/OiBzdHJpbmcpOiBQbGF5ZXJDYWNoZURhdGFbXSB7XHJcbiAgICAgICAgRGVidWdUaW1lci5jb3VudFN0YXJ0KFwiUGxheWVyc0NhY2hlLmdldFBsYXllcnNJblJhbmdlXCIpO1xyXG4gICAgICAgIGNvbnN0IHJlc3VsdDogUGxheWVyQ2FjaGVEYXRhW10gPSBbXTtcclxuICAgICAgICBmb3IgKGNvbnN0IHBsYXllciBvZiB0aGlzLnBsYXllcnNNYXAudmFsdWVzKCkpIHtcclxuICAgICAgICAgICAgaWYgKGRpbWVuc2lvbiAmJiBkaW1lbnNpb24uaWQgIT09IHBsYXllci5kaW1lbnNpb24uaWQpIGNvbnRpbnVlO1xyXG4gICAgICAgICAgICBpZiAoZXhjbHVkZVBsYXllcklkICYmIHBsYXllci5pZCA9PT0gZXhjbHVkZVBsYXllcklkKSBjb250aW51ZTtcclxuICAgICAgICAgICAgaWYgKHBsYXllci5sb2NhdGlvbi5kaXN0YW5jZShsb2NhdGlvbikgPD0gcmFuZ2UpIHtcclxuICAgICAgICAgICAgICAgIHJlc3VsdC5wdXNoKHBsYXllcik7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgRGVidWdUaW1lci5jb3VudEVuZCgpO1xyXG4gICAgICAgIHJldHVybiByZXN1bHQ7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBGaW5kcyB0aGUgbmVhcmVzdCBwbGF5ZXIgdG8gYSBnaXZlbiBsb2NhdGlvbiB3aXRoaW4gYSBzcGVjaWZpZWQgZGltZW5zaW9uLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBsb2NhdGlvbiAtIFRoZSBsb2NhdGlvbiB0byBjb21wYXJlIGRpc3RhbmNlcyBhZ2FpbnN0LlxyXG4gICAgICogQHBhcmFtIGRpbWVuc2lvbiAtIFRoZSBkaW1lbnNpb24gdG8gZmlsdGVyIHBsYXllcnMgYnkuIE9ubHkgcGxheWVycyBpbiB0aGlzIGRpbWVuc2lvbiB3aWxsIGJlIGNvbnNpZGVyZWQuXHJcbiAgICAgKiBAcGFyYW0gZXhjbHVkZVBsYXllcklkcyAtIE9wdGlvbmFsIGFycmF5IG9mIHBsYXllciBJRHMgdG8gZXhjbHVkZSBmcm9tIHRoZSBzZWFyY2guXHJcbiAgICAgKiBAcmV0dXJucyBUaGUgbmVhcmVzdCBwbGF5ZXIgdG8gdGhlIHNwZWNpZmllZCBsb2NhdGlvbiB3aXRoaW4gdGhlIGdpdmVuIGRpbWVuc2lvbiwgb3IgYG51bGxgIGlmIG5vIHBsYXllcnMgYXJlIGZvdW5kLlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGdldE5lYXJlc3RQbGF5ZXIobG9jYXRpb246IFZlY3RvcjMsIGRpbWVuc2lvbjogRGltZW5zaW9uLCBleGNsdWRlUGxheWVySWRzPzogc3RyaW5nW10pOiBQbGF5ZXJDYWNoZURhdGEgfCBudWxsIHtcclxuICAgICAgICBEZWJ1Z1RpbWVyLmNvdW50U3RhcnQoXCJQbGF5ZXJzQ2FjaGUuZ2V0TmVhcmVzdFBsYXllclwiKTtcclxuICAgICAgICBsZXQgbmVhcmVzdFBsYXllcjogUGxheWVyQ2FjaGVEYXRhIHwgbnVsbCA9IG51bGw7XHJcbiAgICAgICAgbGV0IG5lYXJlc3REaXN0YW5jZSA9IEluZmluaXR5O1xyXG5cclxuICAgICAgICBmb3IgKGNvbnN0IHBsYXllciBvZiB0aGlzLnBsYXllcnNNYXAudmFsdWVzKCkpIHtcclxuICAgICAgICAgICAgaWYgKGRpbWVuc2lvbj8uaWQgIT09IHBsYXllci5kaW1lbnNpb24uaWQpIGNvbnRpbnVlO1xyXG4gICAgICAgICAgICBpZiAoZXhjbHVkZVBsYXllcklkcz8uaW5jbHVkZXMocGxheWVyLmlkKSkgY29udGludWU7XHJcbiAgICAgICAgICAgIGNvbnN0IGRpc3RhbmNlID0gcGxheWVyLmxvY2F0aW9uLmRpc3RhbmNlKGxvY2F0aW9uKTtcclxuICAgICAgICAgICAgaWYgKGRpc3RhbmNlIDwgbmVhcmVzdERpc3RhbmNlKSB7XHJcbiAgICAgICAgICAgICAgICBuZWFyZXN0RGlzdGFuY2UgPSBkaXN0YW5jZTtcclxuICAgICAgICAgICAgICAgIG5lYXJlc3RQbGF5ZXIgPSBwbGF5ZXI7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIERlYnVnVGltZXIuY291bnRFbmQoKTtcclxuICAgICAgICByZXR1cm4gbmVhcmVzdFBsYXllcjtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFJldHJpZXZlcyB0aGUgbmVhcmVzdCBwbGF5ZXIgdG8gYSBzcGVjaWZpZWQgbG9jYXRpb24gd2l0aGluIGEgbWF4aW11bSByYW5nZSBpbiB0aGUgZ2l2ZW4gZGltZW5zaW9uLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBsb2NhdGlvbiAtIFRoZSBsb2NhdGlvbiB0byBzZWFyY2ggYXJvdW5kLCByZXByZXNlbnRlZCBhcyBhIGBWZWN0b3IzYC5cclxuICAgICAqIEBwYXJhbSBtYXhSYW5nZSAtIFRoZSBtYXhpbXVtIGRpc3RhbmNlIGZyb20gdGhlIGxvY2F0aW9uIHRvIGNvbnNpZGVyIGEgcGxheWVyIGFzIFwibmVhcmVzdFwiLlxyXG4gICAgICogQHBhcmFtIGRpbWVuc2lvbiAtIFRoZSBkaW1lbnNpb24gaW4gd2hpY2ggdG8gc2VhcmNoIGZvciBwbGF5ZXJzLlxyXG4gICAgICogQHBhcmFtIGV4Y2x1ZGVQbGF5ZXJJZHMgLSBPcHRpb25hbCBhcnJheSBvZiBwbGF5ZXIgSURzIHRvIGV4Y2x1ZGUgZnJvbSB0aGUgc2VhcmNoLlxyXG4gICAgICogQHJldHVybnMgVGhlIG5lYXJlc3QgcGxheWVyIHdpdGhpbiB0aGUgc3BlY2lmaWVkIHJhbmdlLCBvciBgdW5kZWZpbmVkYCBpZiBubyBwbGF5ZXIgaXMgZm91bmRcclxuICAgICAqIG9yIGlmIHRoZSBuZWFyZXN0IHBsYXllciBpcyBvdXRzaWRlIHRoZSBtYXhpbXVtIHJhbmdlLlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGdldE5lYXJlc3RQbGF5ZXJNYXhSYW5nZShcclxuICAgICAgICBsb2NhdGlvbjogVmVjdG9yMyxcclxuICAgICAgICBtYXhSYW5nZTogbnVtYmVyLFxyXG4gICAgICAgIGRpbWVuc2lvbjogRGltZW5zaW9uLFxyXG4gICAgICAgIGV4Y2x1ZGVQbGF5ZXJJZHM/OiBzdHJpbmdbXVxyXG4gICAgKTogUGxheWVyQ2FjaGVEYXRhIHwgdW5kZWZpbmVkIHtcclxuICAgICAgICBEZWJ1Z1RpbWVyLmNvdW50U3RhcnQoXCJQbGF5ZXJzQ2FjaGUuZ2V0TmVhcmVzdFBsYXllck1heFJhbmdlXCIpO1xyXG4gICAgICAgIGNvbnN0IG5lYXJlc3RQbGF5ZXIgPSB0aGlzLmdldE5lYXJlc3RQbGF5ZXIobG9jYXRpb24sIGRpbWVuc2lvbiwgZXhjbHVkZVBsYXllcklkcyk7XHJcbiAgICAgICAgaWYgKCFuZWFyZXN0UGxheWVyKSB7XHJcbiAgICAgICAgICAgIERlYnVnVGltZXIuY291bnRFbmQoKTtcclxuICAgICAgICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGNvbnN0IGRpc3RhbmNlID0gbmVhcmVzdFBsYXllci5sb2NhdGlvbi5kaXN0YW5jZShsb2NhdGlvbik7XHJcbiAgICAgICAgRGVidWdUaW1lci5jb3VudEVuZCgpO1xyXG4gICAgICAgIHJldHVybiBkaXN0YW5jZSA8PSBtYXhSYW5nZSA/IG5lYXJlc3RQbGF5ZXIgOiB1bmRlZmluZWQ7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBDYWxjdWxhdGVzIHRoZSBkaXN0YW5jZSB0byB0aGUgY2xvc2VzdCBwbGF5ZXIgZnJvbSBhIGdpdmVuIGxvY2F0aW9uIHdpdGhpbiBhIHNwZWNpZmllZCBkaW1lbnNpb24uXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGxvY2F0aW9uIC0gVGhlIGxvY2F0aW9uIGZyb20gd2hpY2ggdGhlIGRpc3RhbmNlIHRvIHRoZSBjbG9zZXN0IHBsYXllciBpcyBjYWxjdWxhdGVkLlxyXG4gICAgICogQHBhcmFtIGRpbWVuc2lvbiAtIFRoZSBkaW1lbnNpb24gaW4gd2hpY2ggdGhlIHNlYXJjaCBmb3IgdGhlIGNsb3Nlc3QgcGxheWVyIGlzIHBlcmZvcm1lZC5cclxuICAgICAqIElmIHRoZSBwbGF5ZXIncyBkaW1lbnNpb24gZG9lcyBub3QgbWF0Y2ggdGhpcyBkaW1lbnNpb24sIHRoZXkgYXJlIGlnbm9yZWQuXHJcbiAgICAgKiBAcGFyYW0gZXhjbHVkZVBsYXllcklkcyAtIE9wdGlvbmFsIGFycmF5IG9mIHBsYXllciBJRHMgdG8gZXhjbHVkZSBmcm9tIHRoZSBzZWFyY2guXHJcbiAgICAgKiBAcmV0dXJucyBUaGUgZGlzdGFuY2UgdG8gdGhlIGNsb3Nlc3QgcGxheWVyLiBJZiBubyBwbGF5ZXJzIGFyZSBmb3VuZCBpbiB0aGUgc3BlY2lmaWVkIGRpbWVuc2lvbiwgcmV0dXJucyBgSW5maW5pdHlgLlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGdldERpc3RhbmNlVG9DbG9zZXN0UGxheWVyKGxvY2F0aW9uOiBWZWN0b3IzLCBkaW1lbnNpb246IERpbWVuc2lvbiwgZXhjbHVkZVBsYXllcklkcz86IHN0cmluZ1tdKTogbnVtYmVyIHtcclxuICAgICAgICBEZWJ1Z1RpbWVyLmNvdW50U3RhcnQoXCJQbGF5ZXJzQ2FjaGUuZ2V0RGlzdGFuY2VUb0Nsb3Nlc3RQbGF5ZXJcIik7XHJcbiAgICAgICAgbGV0IG1pbkRpc3RhbmNlID0gSW5maW5pdHk7XHJcbiAgICAgICAgZm9yIChjb25zdCBwbGF5ZXIgb2YgdGhpcy5wbGF5ZXJzTWFwLnZhbHVlcygpKSB7XHJcbiAgICAgICAgICAgIGlmIChkaW1lbnNpb24/LmlkICE9PSBwbGF5ZXIuZGltZW5zaW9uLmlkKSBjb250aW51ZTtcclxuICAgICAgICAgICAgaWYgKGV4Y2x1ZGVQbGF5ZXJJZHM/LmluY2x1ZGVzKHBsYXllci5pZCkpIGNvbnRpbnVlO1xyXG4gICAgICAgICAgICBtaW5EaXN0YW5jZSA9IE1hdGgubWluKG1pbkRpc3RhbmNlLCBwbGF5ZXIubG9jYXRpb24uZGlzdGFuY2UobG9jYXRpb24pKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgRGVidWdUaW1lci5jb3VudEVuZCgpO1xyXG4gICAgICAgIHJldHVybiBtaW5EaXN0YW5jZTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFJldHJpZXZlcyB0aGUgbG9jYXRpb24gb2YgYSBzcGVjaWZpZWQgcGxheWVyIGZyb20gdGhlIHBsYXllcnMgY2FjaGUuXHJcbiAgICAgKiBAcGFyYW0gcGxheWVyIC0gVGhlIHBsYXllciB3aG9zZSBsb2NhdGlvbiBpcyB0byBiZSByZXRyaWV2ZWQuXHJcbiAgICAgKiBAcmV0dXJucyBUaGUgbG9jYXRpb24gb2YgdGhlIHBsYXllciBpZiBmb3VuZCwgb3RoZXJ3aXNlIGB1bmRlZmluZWRgLlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGdldFBsYXllckxvY2F0aW9uKHBsYXllcjogUGxheWVyKSB7XHJcbiAgICAgICAgRGVidWdUaW1lci5jb3VudFN0YXJ0KFwiUGxheWVyc0NhY2hlLmdldFBsYXllckxvY2F0aW9uXCIpO1xyXG4gICAgICAgIGNvbnN0IHJlc3VsdCA9IHRoaXMucGxheWVyc01hcC5nZXQocGxheWVyLmlkKT8ubG9jYXRpb247XHJcbiAgICAgICAgRGVidWdUaW1lci5jb3VudEVuZCgpO1xyXG4gICAgICAgIHJldHVybiByZXN1bHQ7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBSZXRyaWV2ZXMgYSBwbGF5ZXIgYnkgdGhlaXIgdW5pcXVlIGlkZW50aWZpZXIuXHJcbiAgICAgKiBAcGFyYW0gcGxheWVySWQgVGhlIHVuaXF1ZSBpZGVudGlmaWVyIG9mIHRoZSBwbGF5ZXIgdG8gcmV0cmlldmUuXHJcbiAgICAgKiBAcmV0dXJucyBUaGUgcGxheWVyIG9iamVjdCBpZiBmb3VuZCwgb3RoZXJ3aXNlIGB1bmRlZmluZWRgLlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGdldFBsYXllckJ5SWQocGxheWVySWQ6IHN0cmluZykge1xyXG4gICAgICAgIERlYnVnVGltZXIuY291bnRTdGFydChcIlBsYXllcnNDYWNoZS5nZXRQbGF5ZXJCeUlkXCIpO1xyXG4gICAgICAgIGNvbnN0IHJlc3VsdCA9IHRoaXMucGxheWVyc01hcC5nZXQocGxheWVySWQpO1xyXG4gICAgICAgIERlYnVnVGltZXIuY291bnRFbmQoKTtcclxuICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogRWZmaWNpZW50bHkgcmV0cmlldmVzIGFsbCBwbGF5ZXIgZW50aXRpZXMgZGlyZWN0bHkgZnJvbSB0aGUgY2FjaGUgTWFwLlxyXG4gICAgICogTW9yZSBlZmZpY2llbnQgdGhhbiB1c2luZyB0aGUgcGxheWVycyBnZXR0ZXIgYXMgaXQgYXZvaWRzIGFycmF5IGNyZWF0aW9uLlxyXG4gICAgICogQHJldHVybnMgQW4gYXJyYXkgb2YgYWxsIGNhY2hlZCBwbGF5ZXIgZW50aXRpZXMuXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgZ2V0QWxsUGxheWVyRW50aXRpZXMoKTogUGxheWVyW10ge1xyXG4gICAgICAgIERlYnVnVGltZXIuY291bnRTdGFydChcIlBsYXllcnNDYWNoZS5nZXRBbGxQbGF5ZXJFbnRpdGllc1wiKTtcclxuICAgICAgICBjb25zdCByZXN1bHQ6IFBsYXllcltdID0gW107XHJcbiAgICAgICAgZm9yIChjb25zdCBwbGF5ZXJEYXRhIG9mIHRoaXMucGxheWVyc01hcC52YWx1ZXMoKSkge1xyXG4gICAgICAgICAgICByZXN1bHQucHVzaChwbGF5ZXJEYXRhLmVudGl0eSk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIERlYnVnVGltZXIuY291bnRFbmQoKTtcclxuICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBDaGVja3MgaWYgYSBwbGF5ZXIgZXhpc3RzIGluIHRoZSBjYWNoZSAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBpc0NhY2hlZFBsYXllcihwbGF5ZXI6IFBsYXllcik6IGJvb2xlYW4ge1xyXG4gICAgICAgIHJldHVybiB0aGlzLnBsYXllcnNNYXAuaGFzKHBsYXllci5pZCk7XHJcbiAgICB9XHJcbn1cclxuXHJcbmRlY2xhcmUgZ2xvYmFsIHtcclxuICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby12YXJcclxuICAgIHZhciBQbGF5ZXJzQ2FjaGU6IE9taXQ8dHlwZW9mIF9QbGF5ZXJzQ2FjaGUsIFwicHJvdG90eXBlXCI+O1xyXG59XHJcbmdsb2JhbFRoaXMuUGxheWVyc0NhY2hlID0gX1BsYXllcnNDYWNoZTtcclxuIl0sIm5hbWVzIjpbInN5c3RlbSIsIndvcmxkIiwiVjMiLCJfUGxheWVyc0NhY2hlIiwicGxheWVycyIsIkFycmF5IiwiZnJvbSIsInBsYXllcnNNYXAiLCJ2YWx1ZXMiLCJpbml0IiwiQ3VzdG9tRXZlbnRzIiwic3Vic2NyaWJlIiwicGxheWVyIiwiYWRkUGxheWVyIiwiRXZlbnRTdWJzY3JpYmVyIiwiZGVsZXRlIiwiaWQiLCJpbml0Q2FjaGUiLCJydW5JbnRlcnZhbCIsInVwZGF0ZU11dGFibGVGaWVsZHMiLCJVcGRhdGVJbnRlcnZhbCIsIkRlYnVnVGltZXIiLCJjb3VudFN0YXJ0IiwiZ2V0UGxheWVycyIsImNvdW50RW5kIiwicGxheWVyTG9jYXRpb24iLCJmcm9tRW50aXR5IiwiZGltZW5zaW9uIiwiZGVmYXVsdFRvT3ZlcndvcmxkRm9yRGltZW5zaW9uIiwib3ZlcndvcmxkIiwic2V0IiwibmFtZSIsImxvY2F0aW9uIiwiZW50aXR5IiwiY2FjaGVkUGxheWVyIiwiaXNWYWxpZCIsImFyZ3MiLCJwbGF5ZXJJZCIsInBsYXllck5hbWUiLCJjb25zb2xlIiwiZXJyb3IiLCJKU09OIiwic3RyaW5naWZ5IiwiZ2V0Q291bnQiLCJsZW5ndGgiLCJnZXRQbGF5ZXJzSW5SYW5nZSIsInJhbmdlIiwiZXhjbHVkZVBsYXllcklkIiwicmVzdWx0IiwiZGlzdGFuY2UiLCJwdXNoIiwiZ2V0TmVhcmVzdFBsYXllciIsImV4Y2x1ZGVQbGF5ZXJJZHMiLCJuZWFyZXN0UGxheWVyIiwibmVhcmVzdERpc3RhbmNlIiwiSW5maW5pdHkiLCJpbmNsdWRlcyIsImdldE5lYXJlc3RQbGF5ZXJNYXhSYW5nZSIsIm1heFJhbmdlIiwidW5kZWZpbmVkIiwiZ2V0RGlzdGFuY2VUb0Nsb3Nlc3RQbGF5ZXIiLCJtaW5EaXN0YW5jZSIsIk1hdGgiLCJtaW4iLCJnZXRQbGF5ZXJMb2NhdGlvbiIsImdldCIsImdldFBsYXllckJ5SWQiLCJnZXRBbGxQbGF5ZXJFbnRpdGllcyIsInBsYXllckRhdGEiLCJpc0NhY2hlZFBsYXllciIsImhhcyIsIk1hcCIsImdsb2JhbFRoaXMiLCJQbGF5ZXJzQ2Fj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