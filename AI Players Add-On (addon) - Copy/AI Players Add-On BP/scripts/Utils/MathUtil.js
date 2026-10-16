/**
 * MathUtil provides static math utility functions for common calculations, randomization, and vector/rotation conversions. */ class _MathUtil {
    /**
     * Clamps a value between min and max.
     */ static clamp(value, min, max) {
        return Math.min(Math.max(value, min), max);
    }
    /**
     * Computes the logarithm of a value with a given base.
     */ static log(value, base) {
        if (value <= 0) return 0;
        return Math.log(value) / Math.log(base);
    }
    /**
     * Linearly interpolates between a and b by alpha.
     */ static lerp(a, b, alpha) {
        return a + alpha * (b - a);
    }
    /**
     * Linearly interpolates between two angles, handling 360° wraparound.
     * Takes the shortest path between angles.
     * @param startAngle The starting angle in degrees.
     * @param targetAngle The target angle in degrees.
     * @param alpha Interpolation factor (0-1).
     * @returns The interpolated angle in the range [0, 360).
     */ static lerpAngle(startAngle, targetAngle, alpha) {
        // Normalize angles to [0, 360) to handle arbitrary input ranges
        startAngle = this.posMod(startAngle, 360);
        targetAngle = this.posMod(targetAngle, 360);
        // Calculate shortest delta (handles wraparound)
        let delta = targetAngle - startAngle;
        if (delta > 180) delta -= 360;
        else if (delta < -180) delta += 360;
        // Interpolate and normalize result
        return this.posMod(startAngle + delta * alpha, 360);
    }
    /**
     * Snaps a number to the nearest step in a range.
     */ static snapNumber(number, stepsCount, max) {
        const step = max / stepsCount;
        return Math.round(number / step) * step;
    }
    /**
     * Checks if a value is within a range.
     */ static isInRange(value, min, max) {
        return value >= min && value <= max;
    }
    /**
     * Returns true with the given probability (0-1).
     */ static chance(chance) {
        return Math.random() < chance;
    }
    /**
     * Returns a random float between min and max.
     */ static random(min, max) {
        return Math.random() * (max - min) + min;
    }
    /**
     * Returns a random integer between min and max.
     */ static randomInt(min, max) {
        return Math.round(this.random(min, max));
    }
    /**
     * Returns a random sign (-1 or 1).
     */ static randomSign() {
        return Math.random() < 0.5 ? -1 : 1;
    }
    /**
     * Chooses a random element from an array.
     */ static choose(array) {
        const length = array.length - 1;
        const choice = Math.round(_MathUtil.random(0, length));
        return array[choice];
    }
    /**
     * Chooses a random key from a record, weighted by the values (which represent weights).
     * @param record The record containing keys and their corresponding weights.
     * @returns A randomly selected key based on the weights.
     */ static getWeightedRandom(record) {
        const list = Object.keys(record);
        const weights = Object.values(record);
        const totalWeights = weights.reduce((sum, weight)=>sum + weight, 0);
        const roll = MathUtil.random(0, totalWeights);
        let cumulativeWeight = 0;
        for(let i = 0; i < list.length; i++){
            cumulativeWeight += weights[i];
            if (roll < cumulativeWeight) return list[i];
        }
        return list[list.length - 1];
    }
    /**
     * Maps a value from one range to another.
     */ static rangeMap(input, input_min, input_max, output_min, output_max) {
        return output_min + (output_max - output_min) / (input_max - input_min) * (input - input_min);
    }
    /**
     * Hashes a string to a number.
     */ static hash(str) {
        return str.split("").reduce((a, b)=>{
            a = (a << 5) - a + b.charCodeAt(0);
            return a & a;
        }, 0);
    }
    /**
     * Hashes a string to a positive integer.
     */ static hashPositiveInt(str) {
        return Math.abs(this.hash(str));
    }
    /**
     * Hashes a string to a float in [0, 1].
     */ static hash01(str) {
        return Math.abs(this.hash(str)) / 2147483647;
    }
    /**
     * Checks if a value is within a range (alias for isInRange).
     */ static withinRange(input, min, max) {
        if (input >= min && input <= max) return true;
        return false;
    }
    /**
     * Rounds a number down to the nearest step.
     * @param num number to round
     * @param step step to round to
     * @returns
     */ static roundDownToStep(num, step) {
        return Math.floor(num / step) * step;
    }
    /**
     * Rounds a number up to the nearest step.
     * @param num number to round
     * @param step step to round to
     * @returns
     */ static roundUpToStep(num, step) {
        return Math.ceil(num / step) * step;
    }
    /**
     * Eases a value using an ease-in-out sine function.
     * @param x value between 0 and 1
     * @returns eased value between 0 and 1
     */ static easeInOutSine(x) {
        return -(Math.cos(Math.PI * x) - 1) / 2;
    }
    /**
     * Derivative of easeInOutSine - returns the rate of change (speed) at point x.
     * @param x value between 0 and 1
     * @returns rate of change at x
     */ static easeInOutSineDerivative(x) {
        return Math.PI / 2 * Math.sin(Math.PI * x);
    }
    /**
     * Converts degrees to radians.
     * @param degrees angle in degrees
     * @returns angle in radians
     */ static degreesToRadians(degrees) {
        return degrees * Math.PI / 180;
    }
    /**
     * Converts radians to degrees.
     * @param radians angle in radians
     * @returns angle in degrees
     */ static radiansToDegrees(radians) {
        return radians * 180 / Math.PI;
    }
    /**
     * Rounds a number to a specified number of decimal places.
     * @param n number to round
     * @param precision number of decimal places
     * @returns rounded number
     */ static roundTo(n, precision) {
        const factor = Math.pow(10, precision);
        return Math.round(n * factor) / factor;
    }
    /**
     * Computes the positive modulus of a value.
     * @param value The value to compute the modulus for.
     * @param modulus The modulus to use.
     * @returns The positive modulus of the value.
     */ static posMod(value, modulus) {
        return (value % modulus + modulus) % modulus;
    }
}
globalThis.MathUtil = _MathUtil;
// This resolves a TS error that occurs when you use "declare" without any imports or exports
export { };

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIk1hdGhVdGlsLnRzIl0sInNvdXJjZXNDb250ZW50IjpbIi8qKlxyXG4gKiBNYXRoVXRpbCBwcm92aWRlcyBzdGF0aWMgbWF0aCB1dGlsaXR5IGZ1bmN0aW9ucyBmb3IgY29tbW9uIGNhbGN1bGF0aW9ucywgcmFuZG9taXphdGlvbiwgYW5kIHZlY3Rvci9yb3RhdGlvbiBjb252ZXJzaW9ucy4gKi9cclxuY2xhc3MgX01hdGhVdGlsIHtcclxuICAgIC8qKlxyXG4gICAgICogQ2xhbXBzIGEgdmFsdWUgYmV0d2VlbiBtaW4gYW5kIG1heC5cclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBjbGFtcCh2YWx1ZTogbnVtYmVyLCBtaW46IG51bWJlciwgbWF4OiBudW1iZXIpIHtcclxuICAgICAgICByZXR1cm4gTWF0aC5taW4oTWF0aC5tYXgodmFsdWUsIG1pbiksIG1heCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBDb21wdXRlcyB0aGUgbG9nYXJpdGhtIG9mIGEgdmFsdWUgd2l0aCBhIGdpdmVuIGJhc2UuXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgbG9nKHZhbHVlOiBudW1iZXIsIGJhc2U6IG51bWJlcikge1xyXG4gICAgICAgIGlmICh2YWx1ZSA8PSAwKSByZXR1cm4gMDtcclxuICAgICAgICByZXR1cm4gTWF0aC5sb2codmFsdWUpIC8gTWF0aC5sb2coYmFzZSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBMaW5lYXJseSBpbnRlcnBvbGF0ZXMgYmV0d2VlbiBhIGFuZCBiIGJ5IGFscGhhLlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGxlcnAoYTogbnVtYmVyLCBiOiBudW1iZXIsIGFscGhhOiBudW1iZXIpIHtcclxuICAgICAgICByZXR1cm4gYSArIGFscGhhICogKGIgLSBhKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIExpbmVhcmx5IGludGVycG9sYXRlcyBiZXR3ZWVuIHR3byBhbmdsZXMsIGhhbmRsaW5nIDM2MMKwIHdyYXBhcm91bmQuXHJcbiAgICAgKiBUYWtlcyB0aGUgc2hvcnRlc3QgcGF0aCBiZXR3ZWVuIGFuZ2xlcy5cclxuICAgICAqIEBwYXJhbSBzdGFydEFuZ2xlIFRoZSBzdGFydGluZyBhbmdsZSBpbiBkZWdyZWVzLlxyXG4gICAgICogQHBhcmFtIHRhcmdldEFuZ2xlIFRoZSB0YXJnZXQgYW5nbGUgaW4gZGVncmVlcy5cclxuICAgICAqIEBwYXJhbSBhbHBoYSBJbnRlcnBvbGF0aW9uIGZhY3RvciAoMC0xKS5cclxuICAgICAqIEByZXR1cm5zIFRoZSBpbnRlcnBvbGF0ZWQgYW5nbGUgaW4gdGhlIHJhbmdlIFswLCAzNjApLlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGxlcnBBbmdsZShzdGFydEFuZ2xlOiBudW1iZXIsIHRhcmdldEFuZ2xlOiBudW1iZXIsIGFscGhhOiBudW1iZXIpOiBudW1iZXIge1xyXG4gICAgICAgIC8vIE5vcm1hbGl6ZSBhbmdsZXMgdG8gWzAsIDM2MCkgdG8gaGFuZGxlIGFyYml0cmFyeSBpbnB1dCByYW5nZXNcclxuICAgICAgICBzdGFydEFuZ2xlID0gdGhpcy5wb3NNb2Qoc3RhcnRBbmdsZSwgMzYwKTtcclxuICAgICAgICB0YXJnZXRBbmdsZSA9IHRoaXMucG9zTW9kKHRhcmdldEFuZ2xlLCAzNjApO1xyXG5cclxuICAgICAgICAvLyBDYWxjdWxhdGUgc2hvcnRlc3QgZGVsdGEgKGhhbmRsZXMgd3JhcGFyb3VuZClcclxuXHJcbiAgICAgICAgbGV0IGRlbHRhID0gdGFyZ2V0QW5nbGUgLSBzdGFydEFuZ2xlO1xyXG4gICAgICAgIGlmIChkZWx0YSA+IDE4MCkgZGVsdGEgLT0gMzYwO1xyXG4gICAgICAgIGVsc2UgaWYgKGRlbHRhIDwgLTE4MCkgZGVsdGEgKz0gMzYwO1xyXG5cclxuICAgICAgICAvLyBJbnRlcnBvbGF0ZSBhbmQgbm9ybWFsaXplIHJlc3VsdFxyXG4gICAgICAgIHJldHVybiB0aGlzLnBvc01vZChzdGFydEFuZ2xlICsgZGVsdGEgKiBhbHBoYSwgMzYwKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFNuYXBzIGEgbnVtYmVyIHRvIHRoZSBuZWFyZXN0IHN0ZXAgaW4gYSByYW5nZS5cclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBzbmFwTnVtYmVyKG51bWJlcjogbnVtYmVyLCBzdGVwc0NvdW50OiBudW1iZXIsIG1heDogbnVtYmVyKSB7XHJcbiAgICAgICAgY29uc3Qgc3RlcCA9IG1heCAvIHN0ZXBzQ291bnQ7XHJcbiAgICAgICAgcmV0dXJuIE1hdGgucm91bmQobnVtYmVyIC8gc3RlcCkgKiBzdGVwO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQ2hlY2tzIGlmIGEgdmFsdWUgaXMgd2l0aGluIGEgcmFuZ2UuXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgaXNJblJhbmdlKHZhbHVlOiBudW1iZXIsIG1pbjogbnVtYmVyLCBtYXg6IG51bWJlcikge1xyXG4gICAgICAgIHJldHVybiB2YWx1ZSA+PSBtaW4gJiYgdmFsdWUgPD0gbWF4O1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogUmV0dXJucyB0cnVlIHdpdGggdGhlIGdpdmVuIHByb2JhYmlsaXR5ICgwLTEpLlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGNoYW5jZShjaGFuY2U6IG51bWJlcikge1xyXG4gICAgICAgIHJldHVybiBNYXRoLnJhbmRvbSgpIDwgY2hhbmNlO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogUmV0dXJucyBhIHJhbmRvbSBmbG9hdCBiZXR3ZWVuIG1pbiBhbmQgbWF4LlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHJhbmRvbShtaW46IG51bWJlciwgbWF4OiBudW1iZXIpIHtcclxuICAgICAgICByZXR1cm4gTWF0aC5yYW5kb20oKSAqIChtYXggLSBtaW4pICsgbWluO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogUmV0dXJucyBhIHJhbmRvbSBpbnRlZ2VyIGJldHdlZW4gbWluIGFuZCBtYXguXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgcmFuZG9tSW50KG1pbjogbnVtYmVyLCBtYXg6IG51bWJlcikge1xyXG4gICAgICAgIHJldHVybiBNYXRoLnJvdW5kKHRoaXMucmFuZG9tKG1pbiwgbWF4KSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBSZXR1cm5zIGEgcmFuZG9tIHNpZ24gKC0xIG9yIDEpLlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHJhbmRvbVNpZ24oKSB7XHJcbiAgICAgICAgcmV0dXJuIE1hdGgucmFuZG9tKCkgPCAwLjUgPyAtMSA6IDE7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBDaG9vc2VzIGEgcmFuZG9tIGVsZW1lbnQgZnJvbSBhbiBhcnJheS5cclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBjaG9vc2U8VD4oYXJyYXk6IFRbXSkge1xyXG4gICAgICAgIGNvbnN0IGxlbmd0aCA9IGFycmF5Lmxlbmd0aCAtIDE7XHJcbiAgICAgICAgY29uc3QgY2hvaWNlID0gTWF0aC5yb3VuZChfTWF0aFV0aWwucmFuZG9tKDAsIGxlbmd0aCkpO1xyXG4gICAgICAgIHJldHVybiBhcnJheVtjaG9pY2VdO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQ2hvb3NlcyBhIHJhbmRvbSBrZXkgZnJvbSBhIHJlY29yZCwgd2VpZ2h0ZWQgYnkgdGhlIHZhbHVlcyAod2hpY2ggcmVwcmVzZW50IHdlaWdodHMpLlxyXG4gICAgICogQHBhcmFtIHJlY29yZCBUaGUgcmVjb3JkIGNvbnRhaW5pbmcga2V5cyBhbmQgdGhlaXIgY29ycmVzcG9uZGluZyB3ZWlnaHRzLlxyXG4gICAgICogQHJldHVybnMgQSByYW5kb21seSBzZWxlY3RlZCBrZXkgYmFzZWQgb24gdGhlIHdlaWdodHMuXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgZ2V0V2VpZ2h0ZWRSYW5kb208VCBleHRlbmRzIHN0cmluZz4ocmVjb3JkOiBSZWNvcmQ8VCwgbnVtYmVyPikge1xyXG4gICAgICAgIGNvbnN0IGxpc3QgPSBPYmplY3Qua2V5cyhyZWNvcmQpIGFzIFRbXTtcclxuICAgICAgICBjb25zdCB3ZWlnaHRzID0gT2JqZWN0LnZhbHVlcyhyZWNvcmQpIGFzIG51bWJlcltdO1xyXG5cclxuICAgICAgICBjb25zdCB0b3RhbFdlaWdodHMgPSB3ZWlnaHRzLnJlZHVjZSgoc3VtLCB3ZWlnaHQpID0+IHN1bSArIHdlaWdodCwgMCk7XHJcbiAgICAgICAgY29uc3Qgcm9sbCA9IE1hdGhVdGlsLnJhbmRvbSgwLCB0b3RhbFdlaWdodHMpO1xyXG4gICAgICAgIGxldCBjdW11bGF0aXZlV2VpZ2h0ID0gMDtcclxuXHJcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBsaXN0Lmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgICAgIGN1bXVsYXRpdmVXZWlnaHQgKz0gd2VpZ2h0c1tpXTtcclxuICAgICAgICAgICAgaWYgKHJvbGwgPCBjdW11bGF0aXZlV2VpZ2h0KSByZXR1cm4gbGlzdFtpXTtcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIGxpc3RbbGlzdC5sZW5ndGggLSAxXTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIE1hcHMgYSB2YWx1ZSBmcm9tIG9uZSByYW5nZSB0byBhbm90aGVyLlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHJhbmdlTWFwKGlucHV0OiBudW1iZXIsIGlucHV0X21pbjogbnVtYmVyLCBpbnB1dF9tYXg6IG51bWJlciwgb3V0cHV0X21pbjogbnVtYmVyLCBvdXRwdXRfbWF4KSB7XHJcbiAgICAgICAgcmV0dXJuIG91dHB1dF9taW4gKyAoKG91dHB1dF9tYXggLSBvdXRwdXRfbWluKSAvIChpbnB1dF9tYXggLSBpbnB1dF9taW4pKSAqIChpbnB1dCAtIGlucHV0X21pbik7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBIYXNoZXMgYSBzdHJpbmcgdG8gYSBudW1iZXIuXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgaGFzaChzdHI6IHN0cmluZykge1xyXG4gICAgICAgIHJldHVybiBzdHIuc3BsaXQoXCJcIikucmVkdWNlKChhLCBiKSA9PiB7XHJcbiAgICAgICAgICAgIGEgPSAoYSA8PCA1KSAtIGEgKyBiLmNoYXJDb2RlQXQoMCk7XHJcbiAgICAgICAgICAgIHJldHVybiBhICYgYTtcclxuICAgICAgICB9LCAwKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEhhc2hlcyBhIHN0cmluZyB0byBhIHBvc2l0aXZlIGludGVnZXIuXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgaGFzaFBvc2l0aXZlSW50KHN0cjogc3RyaW5nKSB7XHJcbiAgICAgICAgcmV0dXJuIE1hdGguYWJzKHRoaXMuaGFzaChzdHIpKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEhhc2hlcyBhIHN0cmluZyB0byBhIGZsb2F0IGluIFswLCAxXS5cclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBoYXNoMDEoc3RyOiBzdHJpbmcpIHtcclxuICAgICAgICByZXR1cm4gTWF0aC5hYnModGhpcy5oYXNoKHN0cikpIC8gMjE0NzQ4MzY0NztcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIENoZWNrcyBpZiBhIHZhbHVlIGlzIHdpdGhpbiBhIHJhbmdlIChhbGlhcyBmb3IgaXNJblJhbmdlKS5cclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyB3aXRoaW5SYW5nZShpbnB1dDogbnVtYmVyLCBtaW46IG51bWJlciwgbWF4OiBudW1iZXIpIHtcclxuICAgICAgICBpZiAoaW5wdXQgPj0gbWluICYmIGlucHV0IDw9IG1heCkgcmV0dXJuIHRydWU7XHJcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogUm91bmRzIGEgbnVtYmVyIGRvd24gdG8gdGhlIG5lYXJlc3Qgc3RlcC5cclxuICAgICAqIEBwYXJhbSBudW0gbnVtYmVyIHRvIHJvdW5kXHJcbiAgICAgKiBAcGFyYW0gc3RlcCBzdGVwIHRvIHJvdW5kIHRvXHJcbiAgICAgKiBAcmV0dXJuc1xyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHJvdW5kRG93blRvU3RlcChudW06IG51bWJlciwgc3RlcDogbnVtYmVyKTogbnVtYmVyIHtcclxuICAgICAgICByZXR1cm4gTWF0aC5mbG9vcihudW0gLyBzdGVwKSAqIHN0ZXA7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBSb3VuZHMgYSBudW1iZXIgdXAgdG8gdGhlIG5lYXJlc3Qgc3RlcC5cclxuICAgICAqIEBwYXJhbSBudW0gbnVtYmVyIHRvIHJvdW5kXHJcbiAgICAgKiBAcGFyYW0gc3RlcCBzdGVwIHRvIHJvdW5kIHRvXHJcbiAgICAgKiBAcmV0dXJuc1xyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHJvdW5kVXBUb1N0ZXAobnVtOiBudW1iZXIsIHN0ZXA6IG51bWJlcik6IG51bWJlciB7XHJcbiAgICAgICAgcmV0dXJuIE1hdGguY2VpbChudW0gLyBzdGVwKSAqIHN0ZXA7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBFYXNlcyBhIHZhbHVlIHVzaW5nIGFuIGVhc2UtaW4tb3V0IHNpbmUgZnVuY3Rpb24uXHJcbiAgICAgKiBAcGFyYW0geCB2YWx1ZSBiZXR3ZWVuIDAgYW5kIDFcclxuICAgICAqIEByZXR1cm5zIGVhc2VkIHZhbHVlIGJldHdlZW4gMCBhbmQgMVxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGVhc2VJbk91dFNpbmUoeDogbnVtYmVyKTogbnVtYmVyIHtcclxuICAgICAgICByZXR1cm4gLShNYXRoLmNvcyhNYXRoLlBJICogeCkgLSAxKSAvIDI7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBEZXJpdmF0aXZlIG9mIGVhc2VJbk91dFNpbmUgLSByZXR1cm5zIHRoZSByYXRlIG9mIGNoYW5nZSAoc3BlZWQpIGF0IHBvaW50IHguXHJcbiAgICAgKiBAcGFyYW0geCB2YWx1ZSBiZXR3ZWVuIDAgYW5kIDFcclxuICAgICAqIEByZXR1cm5zIHJhdGUgb2YgY2hhbmdlIGF0IHhcclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBlYXNlSW5PdXRTaW5lRGVyaXZhdGl2ZSh4OiBudW1iZXIpOiBudW1iZXIge1xyXG4gICAgICAgIHJldHVybiAoTWF0aC5QSSAvIDIpICogTWF0aC5zaW4oTWF0aC5QSSAqIHgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQ29udmVydHMgZGVncmVlcyB0byByYWRpYW5zLlxyXG4gICAgICogQHBhcmFtIGRlZ3JlZXMgYW5nbGUgaW4gZGVncmVlc1xyXG4gICAgICogQHJldHVybnMgYW5nbGUgaW4gcmFkaWFuc1xyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGRlZ3JlZXNUb1JhZGlhbnMoZGVncmVlczogbnVtYmVyKTogbnVtYmVyIHtcclxuICAgICAgICByZXR1cm4gKGRlZ3JlZXMgKiBNYXRoLlBJKSAvIDE4MDtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIENvbnZlcnRzIHJhZGlhbnMgdG8gZGVncmVlcy5cclxuICAgICAqIEBwYXJhbSByYWRpYW5zIGFuZ2xlIGluIHJhZGlhbnNcclxuICAgICAqIEByZXR1cm5zIGFuZ2xlIGluIGRlZ3JlZXNcclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyByYWRpYW5zVG9EZWdyZWVzKHJhZGlhbnM6IG51bWJlcik6IG51bWJlciB7XHJcbiAgICAgICAgcmV0dXJuIChyYWRpYW5zICogMTgwKSAvIE1hdGguUEk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBSb3VuZHMgYSBudW1iZXIgdG8gYSBzcGVjaWZpZWQgbnVtYmVyIG9mIGRlY2ltYWwgcGxhY2VzLlxyXG4gICAgICogQHBhcmFtIG4gbnVtYmVyIHRvIHJvdW5kXHJcbiAgICAgKiBAcGFyYW0gcHJlY2lzaW9uIG51bWJlciBvZiBkZWNpbWFsIHBsYWNlc1xyXG4gICAgICogQHJldHVybnMgcm91bmRlZCBudW1iZXJcclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyByb3VuZFRvKG46IG51bWJlciwgcHJlY2lzaW9uOiBudW1iZXIpOiBudW1iZXIge1xyXG4gICAgICAgIGNvbnN0IGZhY3RvciA9IE1hdGgucG93KDEwLCBwcmVjaXNpb24pO1xyXG4gICAgICAgIHJldHVybiBNYXRoLnJvdW5kKG4gKiBmYWN0b3IpIC8gZmFjdG9yO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQ29tcHV0ZXMgdGhlIHBvc2l0aXZlIG1vZHVsdXMgb2YgYSB2YWx1ZS5cclxuICAgICAqIEBwYXJhbSB2YWx1ZSBUaGUgdmFsdWUgdG8gY29tcHV0ZSB0aGUgbW9kdWx1cyBmb3IuXHJcbiAgICAgKiBAcGFyYW0gbW9kdWx1cyBUaGUgbW9kdWx1cyB0byB1c2UuXHJcbiAgICAgKiBAcmV0dXJucyBUaGUgcG9zaXRpdmUgbW9kdWx1cyBvZiB0aGUgdmFsdWUuXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgcG9zTW9kKHZhbHVlOiBudW1iZXIsIG1vZHVsdXM6IG51bWJlcik6IG51bWJlciB7XHJcbiAgICAgICAgcmV0dXJuICgodmFsdWUgJSBtb2R1bHVzKSArIG1vZHVsdXMpICUgbW9kdWx1cztcclxuICAgIH1cclxufVxyXG5kZWNsYXJlIGdsb2JhbCB7XHJcbiAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tdmFyXHJcbiAgICB2YXIgTWF0aFV0aWw6IE9taXQ8dHlwZW9mIF9NYXRoVXRpbCwgXCJwcm90b3R5cGVcIj47XHJcbn1cclxuZ2xvYmFsVGhpcy5NYXRoVXRpbCA9IF9NYXRoVXRpbDtcclxuXHJcbi8vIFRoaXMgcmVzb2x2ZXMgYSBUUyBlcnJvciB0aGF0IG9jY3VycyB3aGVuIHlvdSB1c2UgXCJkZWNsYXJlXCIgd2l0aG91dCBhbnkgaW1wb3J0cyBvciBleHBvcnRzXHJcbmV4cG9ydCB7fTtcclxuIl0sIm5hbWVzIjpbIl9NYXRoVXRpbCIsImNsYW1wIiwidmFsdWUiLCJtaW4iLCJtYXgiLCJNYXRoIiwibG9nIiwiYmFzZSIsImxlcnAiLCJhIiwiYiIsImFscGhhIiwibGVycEFuZ2xlIiwic3RhcnRBbmdsZSIsInRhcmdldEFuZ2xlIiwicG9zTW9kIiwiZGVsdGEiLCJzbmFwTnVtYmVyIiwibnVtYmVyIiwic3RlcHNDb3VudCIsInN0ZXAiLCJyb3VuZCIsImlzSW5SYW5nZSIsImNoYW5jZSIsInJhbmRvbSIsInJhbmRvbUludCIsInJhbmRvbVNpZ24iLCJjaG9vc2UiLCJhcnJheSIsImxlbmd0aCIsImNob2ljZSIsImdldFdlaWdodGVkUmFuZG9tIiwicmVjb3JkIiwibGlzdCIsIk9iamVjdCIsImtleXMiLCJ3ZWlnaHRzIiwidmFsdWVzIiwidG90YWxXZWlnaHRzIiwicmVkdWNlIiwic3VtIiwid2VpZ2h0Iiwicm9sbCIsIk1hdGhVdGlsIiwiY3VtdWxhdGl2ZVdlaWdodCIsImkiLCJyYW5nZU1hcCIsImlucHV0IiwiaW5wdXRfbWluIiwiaW5wdXRfbWF4Iiwib3V0cHV0X21pbiIsIm91dHB1dF9tYXgiLCJoYXNoIiwic3RyIiwic3BsaXQiLCJjaGFyQ29kZUF0IiwiaGFzaFBvc2l0aXZlSW50IiwiYWJzIiwiaGFzaDAxIiwid2l0aGluUmFuZ2UiLCJyb3VuZERvd25Ub1N0ZXAiLCJudW0iLCJmbG9vciIsInJvdW5kVXBUb1N0ZXAiLCJjZWlsIiwiZWFzZUluT3V0U2luZSIsIngiLCJjb3MiLCJQSSIsImVhc2VJbk91dFNpbmVEZXJpdmF0aXZlIiwic2luIiwiZGVncmVlc1RvUmFkaWFucyIsImRlZ3JlZXMiLCJyYWRpYW5zVG9EZWdyZWVzIiwicmFkaWFucyIsInJv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