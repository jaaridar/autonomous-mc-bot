/**
 * Seeded Random Number Generator
 * Uses a Mulberry32 algorithm for deterministic pseudo-random number generation.
 * Given the same seed, it will always produce the same sequence of random numbers.
 * @example
 * ```typescript
 * const rng = new SeededRandom(12345);
 * const value1 = rng.next(); // Always the same for seed 12345
 * const value2 = rng.nextInt(1, 10); // Random int between 1-10
 * ``` */ export class SeededRandom {
    /**
     * Generate the next random number in the sequence
     * @returns A random number between 0 (inclusive) and 1 (exclusive)
     */ next() {
        let t = this.seed += 0x6d2b79f5;
        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }
    /**
     * Generate a random integer between min (inclusive) and max (inclusive)
     * @param min - Minimum value (inclusive)
     * @param max - Maximum value (inclusive)
     * @returns A random integer
     */ nextInt(min, max) {
        return Math.floor(this.next() * (max - min + 1)) + min;
    }
    /**
     * Shuffle an array in-place using Fisher-Yates algorithm with this RNG
     * @param array - The array to shuffle
     * @returns The shuffled array (same reference)
     */ shuffle(array) {
        for(let i = array.length - 1; i > 0; i--){
            const j = this.nextInt(0, i);
            [array[i], array[j]] = [
                array[j],
                array[i]
            ];
        }
        return array;
    }
    /**
     * Create a seed from a date string
     * @param dateString - ISO date string (YYYY-MM-DD or full ISO)
     * @returns A numeric seed derived from the date
     */ static seedFromDate(dateString) {
        // Extract just the date part (YYYY-MM-DD)
        const datePart = dateString.split("T")[0];
        // Simple hash of the date string
        let hash = 0;
        for(let i = 0; i < datePart.length; i++){
            const char = datePart.charCodeAt(i);
            hash = (hash << 5) - hash + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return Math.abs(hash);
    }
    /**
     * Create a new seeded random number generator
     * @param seed - The seed value (any number)
     */ constructor(seed){
        this.seed = seed >>> 0; // Convert to unsigned 32-bit integer
    }
}

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIlNlZWRlZFJhbmRvbS50cyJdLCJzb3VyY2VzQ29udGVudCI6WyIvKipcclxuICogU2VlZGVkIFJhbmRvbSBOdW1iZXIgR2VuZXJhdG9yXHJcbiAqIFVzZXMgYSBNdWxiZXJyeTMyIGFsZ29yaXRobSBmb3IgZGV0ZXJtaW5pc3RpYyBwc2V1ZG8tcmFuZG9tIG51bWJlciBnZW5lcmF0aW9uLlxyXG4gKiBHaXZlbiB0aGUgc2FtZSBzZWVkLCBpdCB3aWxsIGFsd2F5cyBwcm9kdWNlIHRoZSBzYW1lIHNlcXVlbmNlIG9mIHJhbmRvbSBudW1iZXJzLlxyXG4gKiBAZXhhbXBsZVxyXG4gKiBgYGB0eXBlc2NyaXB0XHJcbiAqIGNvbnN0IHJuZyA9IG5ldyBTZWVkZWRSYW5kb20oMTIzNDUpO1xyXG4gKiBjb25zdCB2YWx1ZTEgPSBybmcubmV4dCgpOyAvLyBBbHdheXMgdGhlIHNhbWUgZm9yIHNlZWQgMTIzNDVcclxuICogY29uc3QgdmFsdWUyID0gcm5nLm5leHRJbnQoMSwgMTApOyAvLyBSYW5kb20gaW50IGJldHdlZW4gMS0xMFxyXG4gKiBgYGAgKi9cclxuZXhwb3J0IGNsYXNzIFNlZWRlZFJhbmRvbSB7XHJcbiAgICBwcml2YXRlIHNlZWQ6IG51bWJlcjtcclxuXHJcbiAgICAvKipcclxuICAgICAqIENyZWF0ZSBhIG5ldyBzZWVkZWQgcmFuZG9tIG51bWJlciBnZW5lcmF0b3JcclxuICAgICAqIEBwYXJhbSBzZWVkIC0gVGhlIHNlZWQgdmFsdWUgKGFueSBudW1iZXIpXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBjb25zdHJ1Y3RvcihzZWVkOiBudW1iZXIpIHtcclxuICAgICAgICB0aGlzLnNlZWQgPSBzZWVkID4+PiAwOyAvLyBDb252ZXJ0IHRvIHVuc2lnbmVkIDMyLWJpdCBpbnRlZ2VyXHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBHZW5lcmF0ZSB0aGUgbmV4dCByYW5kb20gbnVtYmVyIGluIHRoZSBzZXF1ZW5jZVxyXG4gICAgICogQHJldHVybnMgQSByYW5kb20gbnVtYmVyIGJldHdlZW4gMCAoaW5jbHVzaXZlKSBhbmQgMSAoZXhjbHVzaXZlKVxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgbmV4dCgpOiBudW1iZXIge1xyXG4gICAgICAgIGxldCB0ID0gKHRoaXMuc2VlZCArPSAweDZkMmI3OWY1KTtcclxuICAgICAgICB0ID0gTWF0aC5pbXVsKHQgXiAodCA+Pj4gMTUpLCB0IHwgMSk7XHJcbiAgICAgICAgdCBePSB0ICsgTWF0aC5pbXVsKHQgXiAodCA+Pj4gNyksIHQgfCA2MSk7XHJcbiAgICAgICAgcmV0dXJuICgodCBeICh0ID4+PiAxNCkpID4+PiAwKSAvIDQyOTQ5NjcyOTY7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBHZW5lcmF0ZSBhIHJhbmRvbSBpbnRlZ2VyIGJldHdlZW4gbWluIChpbmNsdXNpdmUpIGFuZCBtYXggKGluY2x1c2l2ZSlcclxuICAgICAqIEBwYXJhbSBtaW4gLSBNaW5pbXVtIHZhbHVlIChpbmNsdXNpdmUpXHJcbiAgICAgKiBAcGFyYW0gbWF4IC0gTWF4aW11bSB2YWx1ZSAoaW5jbHVzaXZlKVxyXG4gICAgICogQHJldHVybnMgQSByYW5kb20gaW50ZWdlclxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgbmV4dEludChtaW46IG51bWJlciwgbWF4OiBudW1iZXIpOiBudW1iZXIge1xyXG4gICAgICAgIHJldHVybiBNYXRoLmZsb29yKHRoaXMubmV4dCgpICogKG1heCAtIG1pbiArIDEpKSArIG1pbjtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFNodWZmbGUgYW4gYXJyYXkgaW4tcGxhY2UgdXNpbmcgRmlzaGVyLVlhdGVzIGFsZ29yaXRobSB3aXRoIHRoaXMgUk5HXHJcbiAgICAgKiBAcGFyYW0gYXJyYXkgLSBUaGUgYXJyYXkgdG8gc2h1ZmZsZVxyXG4gICAgICogQHJldHVybnMgVGhlIHNodWZmbGVkIGFycmF5IChzYW1lIHJlZmVyZW5jZSlcclxuICAgICAqL1xyXG4gICAgcHVibGljIHNodWZmbGU8VD4oYXJyYXk6IFRbXSk6IFRbXSB7XHJcbiAgICAgICAgZm9yIChsZXQgaSA9IGFycmF5Lmxlbmd0aCAtIDE7IGkgPiAwOyBpLS0pIHtcclxuICAgICAgICAgICAgY29uc3QgaiA9IHRoaXMubmV4dEludCgwLCBpKTtcclxuICAgICAgICAgICAgW2FycmF5W2ldLCBhcnJheVtqXV0gPSBbYXJyYXlbal0sIGFycmF5W2ldXTtcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIGFycmF5O1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQ3JlYXRlIGEgc2VlZCBmcm9tIGEgZGF0ZSBzdHJpbmdcclxuICAgICAqIEBwYXJhbSBkYXRlU3RyaW5nIC0gSVNPIGRhdGUgc3RyaW5nIChZWVlZLU1NLUREIG9yIGZ1bGwgSVNPKVxyXG4gICAgICogQHJldHVybnMgQSBudW1lcmljIHNlZWQgZGVyaXZlZCBmcm9tIHRoZSBkYXRlXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgc2VlZEZyb21EYXRlKGRhdGVTdHJpbmc6IHN0cmluZyk6IG51bWJlciB7XHJcbiAgICAgICAgLy8gRXh0cmFjdCBqdXN0IHRoZSBkYXRlIHBhcnQgKFlZWVktTU0tREQpXHJcbiAgICAgICAgY29uc3QgZGF0ZVBhcnQgPSBkYXRlU3RyaW5nLnNwbGl0KFwiVFwiKVswXTtcclxuXHJcbiAgICAgICAgLy8gU2ltcGxlIGhhc2ggb2YgdGhlIGRhdGUgc3RyaW5nXHJcbiAgICAgICAgbGV0IGhhc2ggPSAwO1xyXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgZGF0ZVBhcnQubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICAgICAgY29uc3QgY2hhciA9IGRhdGVQYXJ0LmNoYXJDb2RlQXQoaSk7XHJcbiAgICAgICAgICAgIGhhc2ggPSAoaGFzaCA8PCA1KSAtIGhhc2ggKyBjaGFyO1xyXG4gICAgICAgICAgICBoYXNoID0gaGFzaCAmIGhhc2g7IC8vIENvbnZlcnQgdG8gMzItYml0IGludGVnZXJcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHJldHVybiBNYXRoLmFicyhoYXNoKTtcclxuICAgIH1cclxufVxyXG4iXSwibmFtZXMiOlsiU2VlZGVkUmFuZG9tIiwibmV4dCIsInQiLCJzZWVkIiwiTWF0aCIsImltdWwiLCJuZXh0SW50IiwibWluIiwibWF4IiwiZmxvb3IiLCJzaHVmZmxlIiwiYXJyYXkiLCJpIiwibGVuZ3RoIiwiaiIsInNlZWRGcm9tRGF0ZSIsImRhdGVTdHJpbmciLCJkYXRlUGFydCIsInNwbGl0IiwiaGFzaCIsImNoYXIiLCJjaGFyQ29kZUF0IiwiYWJzIl0sIm1hcHBpbmdzIjoiQUFBQTs7Ozs7Ozs7O09BU08sR0FDUCxPQUFPLE1BQU1BO0lBV1Q7OztLQUdDLEdBQ0QsQUFBT0MsT0FBZTtRQUNsQixJQUFJQyxJQUFLLElBQUksQ0FBQ0MsSUFBSSxJQUFJO1FBQ3RCRCxJQUFJRSxLQUFLQyxJQUFJLENBQUNILElBQUtBLE1BQU0sSUFBS0EsSUFBSTtRQUNsQ0EsS0FBS0EsSUFBSUUsS0FBS0MsSUFBSSxDQUFDSCxJQUFLQSxNQUFNLEdBQUlBLElBQUk7UUFDdEMsT0FBTyxBQUFDLENBQUEsQUFBQ0EsQ0FBQUEsSUFBS0EsTUFBTSxFQUFFLE1BQU8sQ0FBQSxJQUFLO0lBQ3RDO0lBRUE7Ozs7O0tBS0MsR0FDRCxBQUFPSSxRQUFRQyxHQUFXLEVBQUVDLEdBQVcsRUFBVTtRQUM3QyxPQUFPSixLQUFLSyxLQUFLLENBQUMsSUFBSSxDQUFDUixJQUFJLEtBQU1PLENBQUFBLE1BQU1ELE1BQU0sQ0FBQSxLQUFNQTtJQUN2RDtJQUVBOzs7O0tBSUMsR0FDRCxBQUFPRyxRQUFXQyxLQUFVLEVBQU87UUFDL0IsSUFBSyxJQUFJQyxJQUFJRCxNQUFNRSxNQUFNLEdBQUcsR0FBR0QsSUFBSSxHQUFHQSxJQUFLO1lBQ3ZDLE1BQU1FLElBQUksSUFBSSxDQUFDUixPQUFPLENBQUMsR0FBR007WUFDMUIsQ0FBQ0QsS0FBSyxDQUFDQyxFQUFFLEVBQUVELEtBQUssQ0FBQ0csRUFBRSxDQUFDLEdBQUc7Z0JBQUNILEtBQUssQ0FBQ0csRUFBRTtnQkFBRUgsS0FBSyxDQUFDQyxFQUFFO2FBQUM7UUFDL0M7UUFDQSxPQUFPRDtJQUNYO0lBRUE7Ozs7S0FJQyxHQUNELE9BQWNJLGFBQWFDLFVBQWtCLEVBQVU7UUFDbkQsMENBQTBDO1FBQzFDLE1BQU1DLFdBQVdELFdBQVdFLEtBQUssQ0FBQyxJQUFJLENBQUMsRUFBRTtRQUV6QyxpQ0FBaUM7UUFDakMsSUFBSUMsT0FBTztRQUNYLElBQUssSUFBSVAsSUFBSSxHQUFHQSxJQUFJSyxTQUFTSixNQUFNLEVBQUVELElBQUs7WUFDdEMsTUFBTVEsT0FBT0gsU0FBU0ksVUFBVSxDQUFDVDtZQUNqQ08sT0FBTyxBQUFDQSxDQUFBQSxRQUFRLENBQUEsSUFBS0EsT0FBT0M7WUFDNUJELE9BQU9BLE9BQU9BLE1BQU0sNEJBQTRCO1FBQ3BEO1FBRUEsT0FBT2YsS0FBS2tCLEdBQUcsQ0FBQ0g7SUFDcEI7SUE1REE7OztLQUdDLEdBQ0QsWUFBbUJoQixJQUFZLENBQUU7UUFDN0IsSUFBSSxDQUFDQSxJQUFJLEdBQUdBLFNBQVMsR0FBRyxxQ0FBcUM7SUFDakU7QUF1REoifQ==