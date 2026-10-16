import V3 from "Helpers/Vectors/V3";
class _FilterUtil {
    /**
     * Creates a filter to check if a player is within a specified radius of a location.
     * @param location - The center location to check against.
     * @param radius - The radius within which the player must be located.
     * @returns A function that takes a player and returns `true` if the player is within the radius, otherwise `false`.
     * @example
     * ```typescript
     * const filter = Filter.playerInRadius(new V3(0, 0, 0), 10);
     * const isPlayerNearby = filter(player);
     * console.log(isPlayerNearby); // true or false
     * ```
     */ static playerInRadius(location, radius) {
        return (player)=>this.locationInSphere(location, radius)(player.location);
    }
    /**
     * Creates a filter to check if a player's Y-coordinate is within a specified range.
     * @param minY - The minimum Y-coordinate (inclusive).
     * @param maxY - The maximum Y-coordinate (inclusive).
     * @returns A function that takes a player and returns `true` if the player's Y-coordinate is within the range, otherwise `false`.
     * @example
     * ```typescript
     * const filter = Filter.playerYInRange(10, 20);
     * const isPlayerInRange = filter(player);
     * console.log(isPlayerInRange); // true or false
     * ```
     */ static playerYInRange(minY, maxY) {
        return (player)=>this.numberInRange(minY, maxY)(player.location.y);
    }
    /**
     * Creates a filter to check if a player's hand is empty.
     * @returns A function that takes a player and returns `true` if the player's hand is empty, otherwise `false`.
     * @example
     * ```typescript
     * const filter = Filter.isHandEmpty();
     * const isHandEmpty = filter(player);
     * console.log(isHandEmpty); // true or false
     * ```
     */ static isHandEmpty() {
        return (player)=>!InventoryUtil.selectedItem(player);
    }
    /**
     * Creates a filter that inverts the result of another filter.
     * @param filter - The filter function to invert.
     * @returns A function that takes an argument and returns the opposite result of the provided filter.
     * @example
     * ```typescript
     * const filter = Filter.inverse(Filter.isHandEmpty());
     * const isHandNotEmpty = filter(player);
     * console.log(isHandNotEmpty); // true or false
     * ```
     */ static inverse(filter) {
        return (arg)=>!filter(arg);
    }
    /**
     * Creates a filter to check if a location is within a sphere of a given radius.
     * @param pivot - The center of the sphere.
     * @param radius - The radius of the sphere.
     * @returns A function that takes a location and returns `true` if the location is within the sphere, otherwise `false`.
     * @example
     * ```typescript
     * const filter = Filter.locationInSphere(new Vector3(0, 0, 0), 5);
     * const isLocationInSphere = filter(new Vector3(1, 1, 1));
     * console.log(isLocationInSphere); // true or false
     * ```
     */ static locationInSphere(pivot, radius) {
        return (location)=>new V3(location).distance(pivot) < radius;
    }
    /**
     * Creates a filter to check if a number is within a specified range.
     * @param min - The minimum value (exclusive).
     * @param max - The maximum value (exclusive).
     * @returns A function that takes a number and returns `true` if the number is within the range, otherwise `false`.
     * @example
     * ```typescript
     * const filter = Filter.numberInRange(5, 10);
     * const isNumberInRange = filter(7);
     * console.log(isNumberInRange); // true
     * ```
     */ static numberInRange(min, max) {
        return (number)=>number > min && number < max;
    }
    /**
     * Creates a filter that passes with a specified probability.
     * @param chance - A number between 0 and 1 representing the probability of passing.
     * @returns A function that returns `true` with the specified probability, otherwise `false`.
     * @example
     * ```typescript
     * const filter = Filter.random(0.5);
     * const result = filter();
     * console.log(result); // true or false (50% chance)
     * ```
     */ static random(chance) {
        return ()=>Math.random() < chance;
    }
    /**
     * Creates a filter to check if the current biome matches a specified biome.
     * @param biome - The biome to check against.
     * @returns A function that always returns `true` if the biome is specified, otherwise `true` by default.
     * @example
     * ```typescript
     * const filter = Filter.isInBiome("plains");
     * const result = filter();
     * console.log(result); // true
     * ```
     */ static isInBiome(biome) {
        return ()=>!!biome || true;
    }
    /**
     * Creates a filter that always returns `true`.
     * @returns A function that always returns `true`.
     * @example
     * ```typescript
     * const filter = Filter.always();
     * console.log(filter()); // true
     * ```
     */ static always() {
        return ()=>true;
    }
    /**
     * Creates a filter that always returns `false`.
     * @returns A function that always returns `false`.
     * @example
     * ```typescript
     * const filter = Filter.never();
     * console.log(filter()); // false
     * ```
     */ static never() {
        return ()=>false;
    }
    /**
     * Filters an array based on a predicate, but returns the original array if no elements match.
     * @param arr - The array to filter.
     * @param predicate - The predicate function to apply to each element.
     * @returns A new array containing the filtered elements, or the original array if no elements match.
     */ static filterUnlessEmpty(arr, predicate) {
        if (arr.length === 1) return arr;
        const filtered = arr.filter(predicate);
        return filtered.length ? filtered : arr;
    }
}
globalThis.Filter = _FilterUtil;

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkZpbHRlclV0aWwudHMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgUGxheWVyLCBWZWN0b3IzIH0gZnJvbSBcIkBtaW5lY3JhZnQvc2VydmVyXCI7XHJcbmltcG9ydCBWMyBmcm9tIFwiSGVscGVycy9WZWN0b3JzL1YzXCI7XHJcblxyXG5jbGFzcyBfRmlsdGVyVXRpbCB7XHJcbiAgICAvKipcclxuICAgICAqIENyZWF0ZXMgYSBmaWx0ZXIgdG8gY2hlY2sgaWYgYSBwbGF5ZXIgaXMgd2l0aGluIGEgc3BlY2lmaWVkIHJhZGl1cyBvZiBhIGxvY2F0aW9uLlxyXG4gICAgICogQHBhcmFtIGxvY2F0aW9uIC0gVGhlIGNlbnRlciBsb2NhdGlvbiB0byBjaGVjayBhZ2FpbnN0LlxyXG4gICAgICogQHBhcmFtIHJhZGl1cyAtIFRoZSByYWRpdXMgd2l0aGluIHdoaWNoIHRoZSBwbGF5ZXIgbXVzdCBiZSBsb2NhdGVkLlxyXG4gICAgICogQHJldHVybnMgQSBmdW5jdGlvbiB0aGF0IHRha2VzIGEgcGxheWVyIGFuZCByZXR1cm5zIGB0cnVlYCBpZiB0aGUgcGxheWVyIGlzIHdpdGhpbiB0aGUgcmFkaXVzLCBvdGhlcndpc2UgYGZhbHNlYC5cclxuICAgICAqIEBleGFtcGxlXHJcbiAgICAgKiBgYGB0eXBlc2NyaXB0XHJcbiAgICAgKiBjb25zdCBmaWx0ZXIgPSBGaWx0ZXIucGxheWVySW5SYWRpdXMobmV3IFYzKDAsIDAsIDApLCAxMCk7XHJcbiAgICAgKiBjb25zdCBpc1BsYXllck5lYXJieSA9IGZpbHRlcihwbGF5ZXIpO1xyXG4gICAgICogY29uc29sZS5sb2coaXNQbGF5ZXJOZWFyYnkpOyAvLyB0cnVlIG9yIGZhbHNlXHJcbiAgICAgKiBgYGBcclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBwbGF5ZXJJblJhZGl1cyhsb2NhdGlvbjogVjMsIHJhZGl1czogbnVtYmVyKSB7XHJcbiAgICAgICAgcmV0dXJuIChwbGF5ZXI6IFBsYXllcikgPT4gdGhpcy5sb2NhdGlvbkluU3BoZXJlKGxvY2F0aW9uLCByYWRpdXMpKHBsYXllci5sb2NhdGlvbik7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBDcmVhdGVzIGEgZmlsdGVyIHRvIGNoZWNrIGlmIGEgcGxheWVyJ3MgWS1jb29yZGluYXRlIGlzIHdpdGhpbiBhIHNwZWNpZmllZCByYW5nZS5cclxuICAgICAqIEBwYXJhbSBtaW5ZIC0gVGhlIG1pbmltdW0gWS1jb29yZGluYXRlIChpbmNsdXNpdmUpLlxyXG4gICAgICogQHBhcmFtIG1heFkgLSBUaGUgbWF4aW11bSBZLWNvb3JkaW5hdGUgKGluY2x1c2l2ZSkuXHJcbiAgICAgKiBAcmV0dXJucyBBIGZ1bmN0aW9uIHRoYXQgdGFrZXMgYSBwbGF5ZXIgYW5kIHJldHVybnMgYHRydWVgIGlmIHRoZSBwbGF5ZXIncyBZLWNvb3JkaW5hdGUgaXMgd2l0aGluIHRoZSByYW5nZSwgb3RoZXJ3aXNlIGBmYWxzZWAuXHJcbiAgICAgKiBAZXhhbXBsZVxyXG4gICAgICogYGBgdHlwZXNjcmlwdFxyXG4gICAgICogY29uc3QgZmlsdGVyID0gRmlsdGVyLnBsYXllcllJblJhbmdlKDEwLCAyMCk7XHJcbiAgICAgKiBjb25zdCBpc1BsYXllckluUmFuZ2UgPSBmaWx0ZXIocGxheWVyKTtcclxuICAgICAqIGNvbnNvbGUubG9nKGlzUGxheWVySW5SYW5nZSk7IC8vIHRydWUgb3IgZmFsc2VcclxuICAgICAqIGBgYFxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHBsYXllcllJblJhbmdlKG1pblk6IG51bWJlciwgbWF4WTogbnVtYmVyKSB7XHJcbiAgICAgICAgcmV0dXJuIChwbGF5ZXI6IFBsYXllcikgPT4gdGhpcy5udW1iZXJJblJhbmdlKG1pblksIG1heFkpKHBsYXllci5sb2NhdGlvbi55KTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIENyZWF0ZXMgYSBmaWx0ZXIgdG8gY2hlY2sgaWYgYSBwbGF5ZXIncyBoYW5kIGlzIGVtcHR5LlxyXG4gICAgICogQHJldHVybnMgQSBmdW5jdGlvbiB0aGF0IHRha2VzIGEgcGxheWVyIGFuZCByZXR1cm5zIGB0cnVlYCBpZiB0aGUgcGxheWVyJ3MgaGFuZCBpcyBlbXB0eSwgb3RoZXJ3aXNlIGBmYWxzZWAuXHJcbiAgICAgKiBAZXhhbXBsZVxyXG4gICAgICogYGBgdHlwZXNjcmlwdFxyXG4gICAgICogY29uc3QgZmlsdGVyID0gRmlsdGVyLmlzSGFuZEVtcHR5KCk7XHJcbiAgICAgKiBjb25zdCBpc0hhbmRFbXB0eSA9IGZpbHRlcihwbGF5ZXIpO1xyXG4gICAgICogY29uc29sZS5sb2coaXNIYW5kRW1wdHkpOyAvLyB0cnVlIG9yIGZhbHNlXHJcbiAgICAgKiBgYGBcclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBpc0hhbmRFbXB0eSgpIHtcclxuICAgICAgICByZXR1cm4gKHBsYXllcjogUGxheWVyKSA9PiAhSW52ZW50b3J5VXRpbC5zZWxlY3RlZEl0ZW0ocGxheWVyKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIENyZWF0ZXMgYSBmaWx0ZXIgdGhhdCBpbnZlcnRzIHRoZSByZXN1bHQgb2YgYW5vdGhlciBmaWx0ZXIuXHJcbiAgICAgKiBAcGFyYW0gZmlsdGVyIC0gVGhlIGZpbHRlciBmdW5jdGlvbiB0byBpbnZlcnQuXHJcbiAgICAgKiBAcmV0dXJucyBBIGZ1bmN0aW9uIHRoYXQgdGFrZXMgYW4gYXJndW1lbnQgYW5kIHJldHVybnMgdGhlIG9wcG9zaXRlIHJlc3VsdCBvZiB0aGUgcHJvdmlkZWQgZmlsdGVyLlxyXG4gICAgICogQGV4YW1wbGVcclxuICAgICAqIGBgYHR5cGVzY3JpcHRcclxuICAgICAqIGNvbnN0IGZpbHRlciA9IEZpbHRlci5pbnZlcnNlKEZpbHRlci5pc0hhbmRFbXB0eSgpKTtcclxuICAgICAqIGNvbnN0IGlzSGFuZE5vdEVtcHR5ID0gZmlsdGVyKHBsYXllcik7XHJcbiAgICAgKiBjb25zb2xlLmxvZyhpc0hhbmROb3RFbXB0eSk7IC8vIHRydWUgb3IgZmFsc2VcclxuICAgICAqIGBgYFxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGludmVyc2U8VD4oZmlsdGVyOiAoYXJnOiBUKSA9PiBib29sZWFuKSB7XHJcbiAgICAgICAgcmV0dXJuIChhcmc6IFQpID0+ICFmaWx0ZXIoYXJnKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIENyZWF0ZXMgYSBmaWx0ZXIgdG8gY2hlY2sgaWYgYSBsb2NhdGlvbiBpcyB3aXRoaW4gYSBzcGhlcmUgb2YgYSBnaXZlbiByYWRpdXMuXHJcbiAgICAgKiBAcGFyYW0gcGl2b3QgLSBUaGUgY2VudGVyIG9mIHRoZSBzcGhlcmUuXHJcbiAgICAgKiBAcGFyYW0gcmFkaXVzIC0gVGhlIHJhZGl1cyBvZiB0aGUgc3BoZXJlLlxyXG4gICAgICogQHJldHVybnMgQSBmdW5jdGlvbiB0aGF0IHRha2VzIGEgbG9jYXRpb24gYW5kIHJldHVybnMgYHRydWVgIGlmIHRoZSBsb2NhdGlvbiBpcyB3aXRoaW4gdGhlIHNwaGVyZSwgb3RoZXJ3aXNlIGBmYWxzZWAuXHJcbiAgICAgKiBAZXhhbXBsZVxyXG4gICAgICogYGBgdHlwZXNjcmlwdFxyXG4gICAgICogY29uc3QgZmlsdGVyID0gRmlsdGVyLmxvY2F0aW9uSW5TcGhlcmUobmV3IFZlY3RvcjMoMCwgMCwgMCksIDUpO1xyXG4gICAgICogY29uc3QgaXNMb2NhdGlvbkluU3BoZXJlID0gZmlsdGVyKG5ldyBWZWN0b3IzKDEsIDEsIDEpKTtcclxuICAgICAqIGNvbnNvbGUubG9nKGlzTG9jYXRpb25JblNwaGVyZSk7IC8vIHRydWUgb3IgZmFsc2VcclxuICAgICAqIGBgYFxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGxvY2F0aW9uSW5TcGhlcmUocGl2b3Q6IFZlY3RvcjMsIHJhZGl1czogbnVtYmVyKSB7XHJcbiAgICAgICAgcmV0dXJuIChsb2NhdGlvbjogVmVjdG9yMykgPT4gbmV3IFYzKGxvY2F0aW9uKS5kaXN0YW5jZShwaXZvdCkgPCByYWRpdXM7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBDcmVhdGVzIGEgZmlsdGVyIHRvIGNoZWNrIGlmIGEgbnVtYmVyIGlzIHdpdGhpbiBhIHNwZWNpZmllZCByYW5nZS5cclxuICAgICAqIEBwYXJhbSBtaW4gLSBUaGUgbWluaW11bSB2YWx1ZSAoZXhjbHVzaXZlKS5cclxuICAgICAqIEBwYXJhbSBtYXggLSBUaGUgbWF4aW11bSB2YWx1ZSAoZXhjbHVzaXZlKS5cclxuICAgICAqIEByZXR1cm5zIEEgZnVuY3Rpb24gdGhhdCB0YWtlcyBhIG51bWJlciBhbmQgcmV0dXJucyBgdHJ1ZWAgaWYgdGhlIG51bWJlciBpcyB3aXRoaW4gdGhlIHJhbmdlLCBvdGhlcndpc2UgYGZhbHNlYC5cclxuICAgICAqIEBleGFtcGxlXHJcbiAgICAgKiBgYGB0eXBlc2NyaXB0XHJcbiAgICAgKiBjb25zdCBmaWx0ZXIgPSBGaWx0ZXIubnVtYmVySW5SYW5nZSg1LCAxMCk7XHJcbiAgICAgKiBjb25zdCBpc051bWJlckluUmFuZ2UgPSBmaWx0ZXIoNyk7XHJcbiAgICAgKiBjb25zb2xlLmxvZyhpc051bWJlckluUmFuZ2UpOyAvLyB0cnVlXHJcbiAgICAgKiBgYGBcclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBudW1iZXJJblJhbmdlKG1pbjogbnVtYmVyLCBtYXg6IG51bWJlcikge1xyXG4gICAgICAgIHJldHVybiAobnVtYmVyOiBudW1iZXIpID0+IG51bWJlciA+IG1pbiAmJiBudW1iZXIgPCBtYXg7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBDcmVhdGVzIGEgZmlsdGVyIHRoYXQgcGFzc2VzIHdpdGggYSBzcGVjaWZpZWQgcHJvYmFiaWxpdHkuXHJcbiAgICAgKiBAcGFyYW0gY2hhbmNlIC0gQSBudW1iZXIgYmV0d2VlbiAwIGFuZCAxIHJlcHJlc2VudGluZyB0aGUgcHJvYmFiaWxpdHkgb2YgcGFzc2luZy5cclxuICAgICAqIEByZXR1cm5zIEEgZnVuY3Rpb24gdGhhdCByZXR1cm5zIGB0cnVlYCB3aXRoIHRoZSBzcGVjaWZpZWQgcHJvYmFiaWxpdHksIG90aGVyd2lzZSBgZmFsc2VgLlxyXG4gICAgICogQGV4YW1wbGVcclxuICAgICAqIGBgYHR5cGVzY3JpcHRcclxuICAgICAqIGNvbnN0IGZpbHRlciA9IEZpbHRlci5yYW5kb20oMC41KTtcclxuICAgICAqIGNvbnN0IHJlc3VsdCA9IGZpbHRlcigpO1xyXG4gICAgICogY29uc29sZS5sb2cocmVzdWx0KTsgLy8gdHJ1ZSBvciBmYWxzZSAoNTAlIGNoYW5jZSlcclxuICAgICAqIGBgYFxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHJhbmRvbShjaGFuY2U6IG51bWJlcikge1xyXG4gICAgICAgIHJldHVybiAoKSA9PiBNYXRoLnJhbmRvbSgpIDwgY2hhbmNlO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQ3JlYXRlcyBhIGZpbHRlciB0byBjaGVjayBpZiB0aGUgY3VycmVudCBiaW9tZSBtYXRjaGVzIGEgc3BlY2lmaWVkIGJpb21lLlxyXG4gICAgICogQHBhcmFtIGJpb21lIC0gVGhlIGJpb21lIHRvIGNoZWNrIGFnYWluc3QuXHJcbiAgICAgKiBAcmV0dXJucyBBIGZ1bmN0aW9uIHRoYXQgYWx3YXlzIHJldHVybnMgYHRydWVgIGlmIHRoZSBiaW9tZSBpcyBzcGVjaWZpZWQsIG90aGVyd2lzZSBgdHJ1ZWAgYnkgZGVmYXVsdC5cclxuICAgICAqIEBleGFtcGxlXHJcbiAgICAgKiBgYGB0eXBlc2NyaXB0XHJcbiAgICAgKiBjb25zdCBmaWx0ZXIgPSBGaWx0ZXIuaXNJbkJpb21lKFwicGxhaW5zXCIpO1xyXG4gICAgICogY29uc3QgcmVzdWx0ID0gZmlsdGVyKCk7XHJcbiAgICAgKiBjb25zb2xlLmxvZyhyZXN1bHQpOyAvLyB0cnVlXHJcbiAgICAgKiBgYGBcclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBpc0luQmlvbWUoYmlvbWU6IHN0cmluZykge1xyXG4gICAgICAgIHJldHVybiAoKSA9PiAhIWJpb21lIHx8IHRydWU7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBDcmVhdGVzIGEgZmlsdGVyIHRoYXQgYWx3YXlzIHJldHVybnMgYHRydWVgLlxyXG4gICAgICogQHJldHVybnMgQSBmdW5jdGlvbiB0aGF0IGFsd2F5cyByZXR1cm5zIGB0cnVlYC5cclxuICAgICAqIEBleGFtcGxlXHJcbiAgICAgKiBgYGB0eXBlc2NyaXB0XHJcbiAgICAgKiBjb25zdCBmaWx0ZXIgPSBGaWx0ZXIuYWx3YXlzKCk7XHJcbiAgICAgKiBjb25zb2xlLmxvZyhmaWx0ZXIoKSk7IC8vIHRydWVcclxuICAgICAqIGBgYFxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGFsd2F5cygpIHtcclxuICAgICAgICByZXR1cm4gKCkgPT4gdHJ1ZTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIENyZWF0ZXMgYSBmaWx0ZXIgdGhhdCBhbHdheXMgcmV0dXJucyBgZmFsc2VgLlxyXG4gICAgICogQHJldHVybnMgQSBmdW5jdGlvbiB0aGF0IGFsd2F5cyByZXR1cm5zIGBmYWxzZWAuXHJcbiAgICAgKiBAZXhhbXBsZVxyXG4gICAgICogYGBgdHlwZXNjcmlwdFxyXG4gICAgICogY29uc3QgZmlsdGVyID0gRmlsdGVyLm5ldmVyKCk7XHJcbiAgICAgKiBjb25zb2xlLmxvZyhmaWx0ZXIoKSk7IC8vIGZhbHNlXHJcbiAgICAgKiBgYGBcclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBuZXZlcigpIHtcclxuICAgICAgICByZXR1cm4gKCkgPT4gZmFsc2U7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBGaWx0ZXJzIGFuIGFycmF5IGJhc2VkIG9uIGEgcHJlZGljYXRlLCBidXQgcmV0dXJucyB0aGUgb3JpZ2luYWwgYXJyYXkgaWYgbm8gZWxlbWVudHMgbWF0Y2guXHJcbiAgICAgKiBAcGFyYW0gYXJyIC0gVGhlIGFycmF5IHRvIGZpbHRlci5cclxuICAgICAqIEBwYXJhbSBwcmVkaWNhdGUgLSBUaGUgcHJlZGljYXRlIGZ1bmN0aW9uIHRvIGFwcGx5IHRvIGVhY2ggZWxlbWVudC5cclxuICAgICAqIEByZXR1cm5zIEEgbmV3IGFycmF5IGNvbnRhaW5pbmcgdGhlIGZpbHRlcmVkIGVsZW1lbnRzLCBvciB0aGUgb3JpZ2luYWwgYXJyYXkgaWYgbm8gZWxlbWVudHMgbWF0Y2guXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgZmlsdGVyVW5sZXNzRW1wdHk8VD4oYXJyOiBUW10sIHByZWRpY2F0ZTogKGl0ZW06IFQpID0+IGJvb2xlYW4pOiBUW10ge1xyXG4gICAgICAgIGlmIChhcnIubGVuZ3RoID09PSAxKSByZXR1cm4gYXJyO1xyXG4gICAgICAgIGNvbnN0IGZpbHRlcmVkID0gYXJyLmZpbHRlcihwcmVkaWNhdGUpO1xyXG4gICAgICAgIHJldHVybiBmaWx0ZXJlZC5sZW5ndGggPyBmaWx0ZXJlZCA6IGFycjtcclxuICAgIH1cclxufVxyXG5cclxuZGVjbGFyZSBnbG9iYWwge1xyXG4gICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXZhclxyXG4gICAgdmFyIEZpbHRlcjogT21pdDx0eXBlb2YgX0ZpbHRlclV0aWwsIFwicHJvdG90eXBlXCI+O1xyXG59XHJcbmdsb2JhbFRoaXMuRmlsdGVyID0gX0ZpbHRlclV0aWw7XHJcbiJdLCJuYW1lcyI6WyJWMyIsIl9GaWx0ZXJVdGlsIiwicGxheWVySW5SYWRpdXMiLCJsb2NhdGlvbiIsInJhZGl1cyIsInBsYXllciIsImxvY2F0aW9uSW5TcGhlcmUiLCJwbGF5ZXJZSW5SYW5nZSIsIm1pblkiLCJtYXhZIiwibnVtYmVySW5SYW5nZSIsInkiLCJpc0hhbmRFbXB0eSIsIkludmVudG9yeVV0aWwiLCJzZWxlY3RlZEl0ZW0iLCJpbnZlcnNlIiwiZmlsdGVyIiwiYXJnIiwicGl2b3QiLCJkaXN0YW5jZSIsIm1pbiIsIm1heCIsIm51bWJlciIsInJhbmRvbSIsImNoYW5jZSIsIk1hdGgiLCJpc0luQmlvbWUiLCJiaW9tZSIsImFsd2F5cyIsIm5ldmVyIiwiZmlsdGVyVW5sZXNzRW1wdHkiLCJhcnIiLCJwcmVkaWNhdGUiLCJsZW5ndGgiLCJmaWx0ZXJlZCIsImdsb2JhbFRoaXMiLCJGaWx0ZXIiXSwibWFwcGluZ3MiOiJBQUNBLE9BQU9BLFFBQVEscUJBQXFCO0FBRXBDLE1BQU1DO0lBQ0Y7Ozs7Ozs7Ozs7O0tBV0MsR0FDRCxPQUFjQyxlQUFlQyxRQUFZLEVBQUVDLE1BQWMsRUFBRTtRQUN2RCxPQUFPLENBQUNDLFNBQW1CLElBQUksQ0FBQ0MsZ0JBQWdCLENBQUNILFVBQVVDLFFBQVFDLE9BQU9GLFFBQVE7SUFDdEY7SUFFQTs7Ozs7Ozs7Ozs7S0FXQyxHQUNELE9BQWNJLGVBQWVDLElBQVksRUFBRUMsSUFBWSxFQUFFO1FBQ3JELE9BQU8sQ0FBQ0osU0FBbUIsSUFBSSxDQUFDSyxhQUFhLENBQUNGLE1BQU1DLE1BQU1KLE9BQU9GLFFBQVEsQ0FBQ1EsQ0FBQztJQUMvRTtJQUVBOzs7Ozs7Ozs7S0FTQyxHQUNELE9BQWNDLGNBQWM7UUFDeEIsT0FBTyxDQUFDUCxTQUFtQixDQUFDUSxjQUFjQyxZQUFZLENBQUNUO0lBQzNEO0lBRUE7Ozs7Ozs7Ozs7S0FVQyxHQUNELE9BQWNVLFFBQVdDLE1BQTJCLEVBQUU7UUFDbEQsT0FBTyxDQUFDQyxNQUFXLENBQUNELE9BQU9DO0lBQy9CO0lBRUE7Ozs7Ozs7Ozs7O0tBV0MsR0FDRCxPQUFjWCxpQkFBaUJZLEtBQWMsRUFBRWQsTUFBYyxFQUFFO1FBQzNELE9BQU8sQ0FBQ0QsV0FBc0IsSUFBSUgsR0FBR0csVUFBVWdCLFFBQVEsQ0FBQ0QsU0FBU2Q7SUFDckU7SUFFQTs7Ozs7Ozs7Ozs7S0FXQyxHQUNELE9BQWNNLGNBQWNVLEdBQVcsRUFBRUMsR0FBVyxFQUFFO1FBQ2xELE9BQU8sQ0FBQ0MsU0FBbUJBLFNBQVNGLE9BQU9FLFNBQVNEO0lBQ3hEO0lBRUE7Ozs7Ozs7Ozs7S0FVQyxHQUNELE9BQWNFLE9BQU9DLE1BQWMsRUFBRTtRQUNqQyxPQUFPLElBQU1DLEtBQUtGLE1BQU0sS0FBS0M7SUFDakM7SUFFQTs7Ozs7Ozs7OztLQVVDLEdBQ0QsT0FBY0UsVUFBVUMsS0FBYSxFQUFFO1FBQ25DLE9BQU8sSUFBTSxDQUFDLENBQUNBLFNBQVM7SUFDNUI7SUFFQTs7Ozs7Ozs7S0FRQyxHQUNELE9BQWNDLFNBQVM7UUFDbkIsT0FBTyxJQUFNO0lBQ2pCO0lBRUE7Ozs7Ozs7O0tBUUMsR0FDRCxPQUFjQyxRQUFRO1FBQ2xCLE9BQU8sSUFBTTtJQUNqQjtJQUVBOzs7OztLQUtDLEdBQ0QsT0FBY0Msa0JBQXFCQyxHQUFRLEVBQUVDLFNBQStCLEVBQU87UUFDL0UsSUFBSUQsSUFBSUUsTUFBTSxLQUFLLEdBQUcsT0FBT0Y7UUFDN0IsTUFBTUcsV0FBV0gsSUFBSWYsTUFBTSxDQUFDZ0I7UUFDNUIsT0FBT0UsU0FBU0QsTUFBTSxHQUFHQyxXQUFXSDtJQUN4QztBQUNKO0FBTUFJLFdBQVdDLE1BQU0sR0FBR25DIn0=