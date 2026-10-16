import { world } from "@minecraft/server";
class AbstractVector {
    /**
     * Sets the values of the vector from the provided arguments.
     * @remarks Mutates this instance.
     */ set(...args) {
        const v = AbstractVector.argsToVector(this.keys, args);
        for (const key of this.keys)this[key] = v[key];
        return this;
    }
    /**
     * Creates a new instance of the vector with the provided arguments.
     */ create(...args) {
        return new this.constructor(...args);
    }
    /**
     * Converts the provided arguments into a interface vector.
     * @param keys The keys for the vector.
     * @param args The arguments to convert.
     */ static argsToVector(keys, args) {
        const vector = {};
        const n = args[0];
        // If arg length matches keys length, convert directly
        if (args.length === keys.length) {
            for (const [i, key] of keys.entries())vector[key] = args[i];
        } else if (args.length === 1 && typeof n === "number") {
            for (const key of keys)vector[key] = n;
        } else if (args.length === 1 && this.isVector(keys, n)) {
            const v = n;
            for (const key of keys)vector[key] = v[key];
        } else {
            for (const key of keys)vector[key] = 0;
        }
        return vector;
    }
    /**
     * Checks if the provided object is a vector.
     * @param keys The keys for the vector.
     * @param obj The object to check.
     */ static isVector(keys, obj) {
        // Has all keys
        const asVector = obj;
        return keys.every((key)=>typeof asVector[key] === "number");
    }
    /**
     * Clones the vector.
     */ clone() {
        const v = this.create(this);
        v.dimension = this.dimension;
        return v;
    }
    /**
     * Shorthand for cloning the vector.
     */ get $() {
        return this.clone();
    }
    // #endregion
    // #region To other values
    /**
     * Converts the vector to a hash.
     */ toHash() {
        return MathUtil.hash(this.toString());
    }
    /**
     * Converts the vector to a string.
     * @param precision The number of decimal places to include.
     */ toString(precision) {
        let string = "";
        for(let i = 0; i < this.keys.length; i++){
            const v = this[this.keys[i]];
            string += (i === 0 ? "" : " ") + (precision !== undefined ? v.toFixed(precision) : v);
        }
        if (this.dimension !== undefined) string += ` ${this.dimension.id}`;
        return string;
    }
    /**
     * Converts the vector to JSON
     * @returns The JSON representation of the vector.
     */ toJSON() {
        const json = {};
        for (const key of this.keys)json[key] = this[key];
        if (this.dimension !== undefined) json.dimension = this.dimension.id;
        return json;
    }
    /**
     * Returns the length of the vector.
     */ length() {
        return Math.sqrt(this.squareLength());
    }
    /**
     * Returns the square length of the vector.
     */ squareLength() {
        return this.values().reduce((sum, v)=>sum + v * v, 0);
    }
    /**
     * Returns the product of the vector.
     */ product() {
        return this.values().reduce((prod, v)=>prod * v, 1);
    }
    /**
     * Returns the sum of the vector.
     */ sum() {
        return this.values().reduce((sum, v)=>sum + v, 0);
    }
    /**
     * Returns the dot product of the vector with another vector.
     * @param otherVector The other vector.
     */ dot(otherVector) {
        return this.clone().multiply(otherVector).sum();
    }
    // #endregion
    // #region Unary Operations
    /**
     * Returns the absolute value of the vector.
     * @remarks Mutates this instance.
     */ abs() {
        return this.map(Math.abs);
    }
    /**
     * Normalizes the vector.
     * @remarks Mutates this instance.
     */ normalize() {
        return this.divide(this.length());
    }
    /**
     * Floors the vector.
     * @remarks Mutates this instance.
     */ floor() {
        return this.map(Math.floor);
    }
    /**
     * Rounds the vector down to the nearest step.
     * @remarks Mutates this instance.
     * @param step The step size.
     */ roundDownToStep(step) {
        return this.map((n)=>MathUtil.roundDownToStep(n, step));
    }
    /**
     * Rounds the vector up to the nearest step.
     * @remarks Mutates this instance.
     * @param step The step size.
     */ roundUpToStep(step) {
        return this.map((n)=>MathUtil.roundUpToStep(n, step));
    }
    /**
     * Rounds the vector to the nearest step.
     * @remarks Mutates this instance.
     * @param step The step size.
     */ round(precision) {
        return this.map((n)=>MathUtil.roundTo(n, precision));
    }
    // #endregion
    // #region Binary Operations
    /**
     * Adds the vector to another vector or scalar.
     * @remarks Mutates this instance.
     * @param other The other vector or scalar.
     */ add(...args) {
        const v = AbstractVector.argsToVector(this.keys, args);
        for (const key of this.keys)this[key] += v[key];
        return this;
    }
    /**
     * Subtracts another vector or scalar from the vector.
     * @remarks Mutates this instance.
     * @param other The other vector or scalar.
     */ subtract(...args) {
        const v = AbstractVector.argsToVector(this.keys, args);
        for (const key of this.keys)this[key] -= v[key];
        return this;
    }
    /**
     * Multiplies the vector by another vector or scalar.
     * @remarks Mutates this instance.
     * @param other The other vector or scalar.
     */ multiply(...args) {
        const v = AbstractVector.argsToVector(this.keys, args);
        for (const key of this.keys)this[key] *= v[key];
        return this;
    }
    /**
     * Divides the vector by another vector or scalar.
     * @remarks Mutates this instance.
     * @param other The other vector or scalar.
     */ divide(...args) {
        const v = AbstractVector.argsToVector(this.keys, args);
        for (const key of this.keys)this[key] /= v[key];
        return this.clean();
    }
    // #endregion
    // #region Vector operations
    /**
     * Checks if the vector is equal to another vector.
     * @param otherVector The other vector to compare to.
     */ equals(otherVector) {
        for (const key of this.keys)if (this[key] !== otherVector[key]) return false;
        return true;
    }
    /**
     * Returns the euclidean distance between the vector and another vector.
     * @param otherVector The other vector to get the distance from.
     */ distance(otherVector) {
        return this.clone().subtract(otherVector).length();
    }
    /**
     * Returns the taxicab distance between the vector and another vector.
     * @param otherVector The other vector to get the distance from.
     */ taxicabDistance(otherVector) {
        return this.clone().subtract(otherVector).abs().sum();
    }
    /**
     * Returns true if the vector is face-adjacent (taxicab distance of 1) to another vector.
     * @param otherVector The other vector to check against.
     */ isAdjacentTo(otherVector) {
        return this.taxicabDistance(otherVector) === 1;
    }
    /**
     * Returns the closest vector from an array of vectors to this vector.
     * @param vectors The array of vectors to search through.
     */ closest(vectors) {
        let nearest = vectors[0];
        let nearestDistance = this.distance(nearest);
        for (const vector of vectors.splice(1)){
            const currentDistance = this.distance(vector);
            if (currentDistance >= nearestDistance) continue;
            nearest = vector;
            nearestDistance = currentDistance;
        }
        return nearest;
    }
    /**
     * Returns the minimum vector between the vector and another vector.
     * @remarks Mutates this instance.
     * @param otherVector The other vector to compare to.
     */ min(otherVector) {
        return this.map((value, k)=>Math.min(value, otherVector[k]));
    }
    /**
     * Returns the maximum vector between the vector and another vector.
     * @remarks Mutates this instance.
     * @param otherVector The other vector to compare to.
     */ max(otherVector) {
        return this.map((value, k)=>Math.max(value, otherVector[k]));
    }
    /**
     * Mutates and returns the vector by linearly interpolating between the vector and another vector.
     * @remarks Mutates this instance.
     * @param target The target vector.
     * @param t The interpolation factor (0 to 1).
     */ lerp(target, t) {
        return this.add(...this.create(target).subtract(this).multiply(t).values());
    }
    /**
     * Mutates and returns a vector where only the dominant axis is preserved.
     * The dominant axis is the axis with the largest absolute value.
     * @remarks Mutates this instance.
     */ dominant() {
        let dominant = this.keys[0];
        for (const key of this.keys){
            if (Math.abs(this[key]) < Math.abs(this[dominant])) continue;
            dominant = key;
        }
        return this.map((_, k)=>k === dominant ? this[k] : 0);
    }
    // #region
    // #region Helpers
    /**
     * Returns the values of the vector as an array.
     */ values() {
        const vectorArray = [];
        for (const key of this.keys)vectorArray.push(this[key]);
        return vectorArray;
    }
    /**
     * Maps the vector to a new vector using the given function.
     * @remarks Mutates this instance.
     * @param f The mapping function.
     */ map(f) {
        for (const key of this.keys)this[key] = f(this[key], key);
        return this;
    }
    /**
     * Cleans the vector by removing NaN values.
     * @remarks Mutates this instance.
     */ clean() {
        for (const key of this.keys){
            if (isNaN(this[key])) this[key] = 0;
        }
        return this;
    }
    /**
     * Sets a single component of the vector by key.
     * @remarks Mutates this instance.
     * @param axis The key to set.
     * @param value The value to assign.
     */ setAxis(axis, value) {
        return this.map((n, k)=>k === axis ? value : n);
    }
    /**
     * Adds a value to a single component of the vector by key.
     * @remarks Mutates this instance.
     * @param axis The key to add to.
     * @param value The value to add.
     */ addAxis(axis, value) {
        return this.map((n, k)=>k === axis ? n + value : n);
    }
    /**
     * Sets the dimension of the vector.
     * @remarks Mutates this instance.
     * @param dimension The dimension to set.
     */ setDimension(dimension) {
        if (typeof dimension === "string") {
            this.dimension = Main.dimensions[dimension];
            this.dimension ?? (this.dimension = world.getDimension(dimension));
        } else this.dimension = dimension;
        return this;
    }
    // #region Constructor
    constructor(keys, ...args){
        this.keys = keys;
        return this.set(...args);
    }
}
export { AbstractVector as default };

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkFic3RyYWN0VmVjdG9yLnRzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IERpbWVuc2lvbiwgd29ybGQgfSBmcm9tIFwiQG1pbmVjcmFmdC9zZXJ2ZXJcIjtcclxuaW1wb3J0IHsgU2VyaWFsaXplZExvY2F0aW9uIH0gZnJvbSBcIkJpZ0JyYWluL1R5cGVzXCI7XHJcblxyXG4vLyBHZW5lcmF0ZXMgaW50ZXJmYWNlIGZyb20gbGlzdCBvZiBrZXlzXHJcbnR5cGUgS2V5c1RvSW50ZXJmYWNlPFQgZXh0ZW5kcyByZWFkb25seSBzdHJpbmdbXSwgVj4gPSB7IFtLIGluIFRbbnVtYmVyXV06IFYgfTtcclxuLy8gR2VuZXJhdGVzIG9iamVjdCB3aXRoIFZlY3RvciB2YWx1ZXMgYmFzZWQgb24gdGhlIGFycmF5XHJcbnR5cGUgVmVjdG9yPFQgZXh0ZW5kcyByZWFkb25seSBzdHJpbmdbXT4gPSBLZXlzVG9JbnRlcmZhY2U8VCwgbnVtYmVyPjtcclxuLy8gR2VuZXJhdGVzIG9iamVjdCB3aXRoIG51bWVyaWMgdmFsdWVzIGJhc2VkIG9uIGxlbmd0aCBvZiBhcnJheVxyXG50eXBlIEtleXNUb0FycmF5PFQgZXh0ZW5kcyByZWFkb25seSB1bmtub3duW10sIFY+ID0geyBbSyBpbiBrZXlvZiBUXTogViB9O1xyXG5cclxuLy8gQ29uc3RydWN0b3IgYXJndW1lbnRzIGZvciBWZWN0b3JcclxuZXhwb3J0IHR5cGUgVkNvbnN0cnVjdG9yQXJnczxUIGV4dGVuZHMgcmVhZG9ubHkgc3RyaW5nW10+ID0gW251bWJlciB8IFZlY3RvcjxUPl0gfCBLZXlzVG9BcnJheTxULCBudW1iZXI+O1xyXG5cclxuZXhwb3J0IGRlZmF1bHQgYWJzdHJhY3QgY2xhc3MgQWJzdHJhY3RWZWN0b3I8SyBleHRlbmRzIHJlYWRvbmx5IHN0cmluZ1tdPiB7XHJcbiAgICAvLyBUaGUga2V5cyBmb3IgdGhlIHZlY3RvclxyXG4gICAgcHJvdGVjdGVkIHJlYWRvbmx5IGtleXM6IEs7XHJcblxyXG4gICAgcHVibGljIGRpbWVuc2lvbjogRGltZW5zaW9uIHwgdW5kZWZpbmVkO1xyXG5cclxuICAgIC8vICNyZWdpb24gQ29uc3RydWN0b3JcclxuICAgIHB1YmxpYyBjb25zdHJ1Y3RvcihrZXlzOiBLLCAuLi5hcmdzOiBWQ29uc3RydWN0b3JBcmdzPEs+KSB7XHJcbiAgICAgICAgdGhpcy5rZXlzID0ga2V5cztcclxuICAgICAgICByZXR1cm4gdGhpcy5zZXQoLi4uYXJncyk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBTZXRzIHRoZSB2YWx1ZXMgb2YgdGhlIHZlY3RvciBmcm9tIHRoZSBwcm92aWRlZCBhcmd1bWVudHMuXHJcbiAgICAgKiBAcmVtYXJrcyBNdXRhdGVzIHRoaXMgaW5zdGFuY2UuXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzZXQoLi4uYXJnczogVkNvbnN0cnVjdG9yQXJnczxLPik6IHR5cGVvZiB0aGlzIHtcclxuICAgICAgICBjb25zdCB2ID0gQWJzdHJhY3RWZWN0b3IuYXJnc1RvVmVjdG9yKHRoaXMua2V5cywgYXJncyk7XHJcbiAgICAgICAgZm9yIChjb25zdCBrZXkgb2YgdGhpcy5rZXlzKSB0aGlzW2tleV0gPSB2W2tleV07XHJcblxyXG4gICAgICAgIHJldHVybiB0aGlzO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQ3JlYXRlcyBhIG5ldyBpbnN0YW5jZSBvZiB0aGUgdmVjdG9yIHdpdGggdGhlIHByb3ZpZGVkIGFyZ3VtZW50cy5cclxuICAgICAqL1xyXG4gICAgcHJvdGVjdGVkIGNyZWF0ZSguLi5hcmdzOiBWQ29uc3RydWN0b3JBcmdzPEs+KTogdHlwZW9mIHRoaXMge1xyXG4gICAgICAgIHJldHVybiBuZXcgKHRoaXMuY29uc3RydWN0b3IgYXMgbmV3ICguLi5hcmdzOiBWQ29uc3RydWN0b3JBcmdzPEs+KSA9PiB0aGlzKSguLi5hcmdzKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIENvbnZlcnRzIHRoZSBwcm92aWRlZCBhcmd1bWVudHMgaW50byBhIGludGVyZmFjZSB2ZWN0b3IuXHJcbiAgICAgKiBAcGFyYW0ga2V5cyBUaGUga2V5cyBmb3IgdGhlIHZlY3Rvci5cclxuICAgICAqIEBwYXJhbSBhcmdzIFRoZSBhcmd1bWVudHMgdG8gY29udmVydC5cclxuICAgICAqL1xyXG4gICAgcHJvdGVjdGVkIHN0YXRpYyBhcmdzVG9WZWN0b3I8VCBleHRlbmRzIHJlYWRvbmx5IHN0cmluZ1tdLCBWID0gVmVjdG9yPFQ+PihrZXlzOiBULCBhcmdzOiBWQ29uc3RydWN0b3JBcmdzPFQ+KTogViB7XHJcbiAgICAgICAgY29uc3QgdmVjdG9yID0ge30gYXMgUmVjb3JkPHN0cmluZywgbnVtYmVyPjtcclxuICAgICAgICBjb25zdCBuID0gYXJnc1swXTtcclxuXHJcbiAgICAgICAgLy8gSWYgYXJnIGxlbmd0aCBtYXRjaGVzIGtleXMgbGVuZ3RoLCBjb252ZXJ0IGRpcmVjdGx5XHJcbiAgICAgICAgaWYgKGFyZ3MubGVuZ3RoID09PSBrZXlzLmxlbmd0aCkge1xyXG4gICAgICAgICAgICBmb3IgKGNvbnN0IFtpLCBrZXldIG9mIGtleXMuZW50cmllcygpKSB2ZWN0b3Jba2V5XSA9IChhcmdzIGFzIHVua25vd24gYXMgbnVtYmVyW10pW2ldO1xyXG4gICAgICAgIH1cclxuICAgICAgICAvLyBJZiBhIHNpbmdsZSBudW1iZXIgaXMgcGFzc2VkLCBmaWxsIHdpdGggdGhhdCBudW1iZXJcclxuICAgICAgICBlbHNlIGlmIChhcmdzLmxlbmd0aCA9PT0gMSAmJiB0eXBlb2YgbiA9PT0gXCJudW1iZXJcIikge1xyXG4gICAgICAgICAgICBmb3IgKGNvbnN0IGtleSBvZiBrZXlzKSB2ZWN0b3Jba2V5XSA9IG47XHJcbiAgICAgICAgfVxyXG4gICAgICAgIC8vIElmIGEgc2luZ2xlIHZlY3RvciBvZiBhcHByb3ByaWF0ZSBsZW5ndGggaXMgcGFzc2VkLCBjb3B5IGl0cyB2YWx1ZXNcclxuICAgICAgICBlbHNlIGlmIChhcmdzLmxlbmd0aCA9PT0gMSAmJiB0aGlzLmlzVmVjdG9yKGtleXMsIG4pKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHYgPSBuIGFzIFJlY29yZDxzdHJpbmcsIG51bWJlcj47XHJcbiAgICAgICAgICAgIGZvciAoY29uc3Qga2V5IG9mIGtleXMpIHZlY3RvcltrZXldID0gdltrZXldO1xyXG4gICAgICAgIH1cclxuICAgICAgICAvLyBPdGhlcndpc2UsIHJldHVybiBhIHplcm8gdmVjdG9yXHJcbiAgICAgICAgZWxzZSB7XHJcbiAgICAgICAgICAgIGZvciAoY29uc3Qga2V5IG9mIGtleXMpIHZlY3RvcltrZXldID0gMDtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHJldHVybiB2ZWN0b3IgYXMgVjtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIENoZWNrcyBpZiB0aGUgcHJvdmlkZWQgb2JqZWN0IGlzIGEgdmVjdG9yLlxyXG4gICAgICogQHBhcmFtIGtleXMgVGhlIGtleXMgZm9yIHRoZSB2ZWN0b3IuXHJcbiAgICAgKiBAcGFyYW0gb2JqIFRoZSBvYmplY3QgdG8gY2hlY2suXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgaXNWZWN0b3I8VCBleHRlbmRzIHJlYWRvbmx5IHN0cmluZ1tdLCBWID0gVmVjdG9yPFQ+PihrZXlzOiBULCBvYmo6IHVua25vd24pOiBvYmogaXMgViB7XHJcbiAgICAgICAgLy8gSGFzIGFsbCBrZXlzXHJcbiAgICAgICAgY29uc3QgYXNWZWN0b3IgPSBvYmogYXMgVjtcclxuICAgICAgICByZXR1cm4ga2V5cy5ldmVyeSgoa2V5KSA9PiB0eXBlb2YgYXNWZWN0b3Jba2V5XSA9PT0gXCJudW1iZXJcIik7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBDbG9uZXMgdGhlIHZlY3Rvci5cclxuICAgICAqL1xyXG4gICAgcHVibGljIGNsb25lKCk6IHRoaXMge1xyXG4gICAgICAgIGNvbnN0IHYgPSB0aGlzLmNyZWF0ZSh0aGlzIGFzIHVua25vd24gYXMgVmVjdG9yPEs+KTtcclxuICAgICAgICB2LmRpbWVuc2lvbiA9IHRoaXMuZGltZW5zaW9uO1xyXG4gICAgICAgIHJldHVybiB2O1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogU2hvcnRoYW5kIGZvciBjbG9uaW5nIHRoZSB2ZWN0b3IuXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBnZXQgJCgpOiB0aGlzIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5jbG9uZSgpO1xyXG4gICAgfVxyXG4gICAgLy8gI2VuZHJlZ2lvblxyXG5cclxuICAgIC8vICNyZWdpb24gVG8gb3RoZXIgdmFsdWVzXHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBDb252ZXJ0cyB0aGUgdmVjdG9yIHRvIGEgaGFzaC5cclxuICAgICAqL1xyXG4gICAgcHVibGljIHRvSGFzaCgpIHtcclxuICAgICAgICByZXR1cm4gTWF0aFV0aWwuaGFzaCh0aGlzLnRvU3RyaW5nKCkpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQ29udmVydHMgdGhlIHZlY3RvciB0byBhIHN0cmluZy5cclxuICAgICAqIEBwYXJhbSBwcmVjaXNpb24gVGhlIG51bWJlciBvZiBkZWNpbWFsIHBsYWNlcyB0byBpbmNsdWRlLlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgdG9TdHJpbmcocHJlY2lzaW9uPzogbnVtYmVyKTogc3RyaW5nIHtcclxuICAgICAgICBsZXQgc3RyaW5nID0gXCJcIjtcclxuXHJcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLmtleXMubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICAgICAgY29uc3QgdiA9IHRoaXNbdGhpcy5rZXlzW2ldXTtcclxuICAgICAgICAgICAgc3RyaW5nICs9IChpID09PSAwID8gXCJcIiA6IFwiIFwiKSArIChwcmVjaXNpb24gIT09IHVuZGVmaW5lZCA/IHYudG9GaXhlZChwcmVjaXNpb24pIDogdik7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBpZiAodGhpcy5kaW1lbnNpb24gIT09IHVuZGVmaW5lZCkgc3RyaW5nICs9IGAgJHt0aGlzLmRpbWVuc2lvbi5pZH1gO1xyXG5cclxuICAgICAgICByZXR1cm4gc3RyaW5nO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQ29udmVydHMgdGhlIHZlY3RvciB0byBKU09OXHJcbiAgICAgKiBAcmV0dXJucyBUaGUgSlNPTiByZXByZXNlbnRhdGlvbiBvZiB0aGUgdmVjdG9yLlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgdG9KU09OKCk6IFNlcmlhbGl6ZWRMb2NhdGlvbiB7XHJcbiAgICAgICAgY29uc3QganNvbjogUGFydGlhbDxTZXJpYWxpemVkTG9jYXRpb24+ID0ge307XHJcbiAgICAgICAgZm9yIChjb25zdCBrZXkgb2YgdGhpcy5rZXlzKSBqc29uW2tleV0gPSB0aGlzW2tleV07XHJcbiAgICAgICAgaWYgKHRoaXMuZGltZW5zaW9uICE9PSB1bmRlZmluZWQpIGpzb24uZGltZW5zaW9uID0gdGhpcy5kaW1lbnNpb24uaWQ7XHJcbiAgICAgICAgcmV0dXJuIGpzb24gYXMgU2VyaWFsaXplZExvY2F0aW9uO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogUmV0dXJucyB0aGUgbGVuZ3RoIG9mIHRoZSB2ZWN0b3IuXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBsZW5ndGgoKTogbnVtYmVyIHtcclxuICAgICAgICByZXR1cm4gTWF0aC5zcXJ0KHRoaXMuc3F1YXJlTGVuZ3RoKCkpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogUmV0dXJucyB0aGUgc3F1YXJlIGxlbmd0aCBvZiB0aGUgdmVjdG9yLlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3F1YXJlTGVuZ3RoKCk6IG51bWJlciB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMudmFsdWVzKCkucmVkdWNlKChzdW0sIHYpID0+IHN1bSArIHYgKiB2LCAwKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFJldHVybnMgdGhlIHByb2R1Y3Qgb2YgdGhlIHZlY3Rvci5cclxuICAgICAqL1xyXG4gICAgcHVibGljIHByb2R1Y3QoKTogbnVtYmVyIHtcclxuICAgICAgICByZXR1cm4gdGhpcy52YWx1ZXMoKS5yZWR1Y2UoKHByb2QsIHYpID0+IHByb2QgKiB2LCAxKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFJldHVybnMgdGhlIHN1bSBvZiB0aGUgdmVjdG9yLlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3VtKCk6IG51bWJlciB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMudmFsdWVzKCkucmVkdWNlKChzdW0sIHYpID0+IHN1bSArIHYsIDApO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogUmV0dXJucyB0aGUgZG90IHByb2R1Y3Qgb2YgdGhlIHZlY3RvciB3aXRoIGFub3RoZXIgdmVjdG9yLlxyXG4gICAgICogQHBhcmFtIG90aGVyVmVjdG9yIFRoZSBvdGhlciB2ZWN0b3IuXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBkb3Q8ViBleHRlbmRzIFZlY3RvcjxLPj4ob3RoZXJWZWN0b3I6IFYpOiBudW1iZXIge1xyXG4gICAgICAgIHJldHVybiB0aGlzLmNsb25lKCkubXVsdGlwbHkob3RoZXJWZWN0b3IpLnN1bSgpO1xyXG4gICAgfVxyXG4gICAgLy8gI2VuZHJlZ2lvblxyXG5cclxuICAgIC8vICNyZWdpb24gVW5hcnkgT3BlcmF0aW9uc1xyXG4gICAgLyoqXHJcbiAgICAgKiBSZXR1cm5zIHRoZSBhYnNvbHV0ZSB2YWx1ZSBvZiB0aGUgdmVjdG9yLlxyXG4gICAgICogQHJlbWFya3MgTXV0YXRlcyB0aGlzIGluc3RhbmNlLlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgYWJzKCk6IHRoaXMge1xyXG4gICAgICAgIHJldHVybiB0aGlzLm1hcChNYXRoLmFicyk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBOb3JtYWxpemVzIHRoZSB2ZWN0b3IuXHJcbiAgICAgKiBAcmVtYXJrcyBNdXRhdGVzIHRoaXMgaW5zdGFuY2UuXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBub3JtYWxpemUoKSB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuZGl2aWRlKHRoaXMubGVuZ3RoKCkpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogRmxvb3JzIHRoZSB2ZWN0b3IuXHJcbiAgICAgKiBAcmVtYXJrcyBNdXRhdGVzIHRoaXMgaW5zdGFuY2UuXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBmbG9vcigpIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5tYXAoTWF0aC5mbG9vcik7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBSb3VuZHMgdGhlIHZlY3RvciBkb3duIHRvIHRoZSBuZWFyZXN0IHN0ZXAuXHJcbiAgICAgKiBAcmVtYXJrcyBNdXRhdGVzIHRoaXMgaW5zdGFuY2UuXHJcbiAgICAgKiBAcGFyYW0gc3RlcCBUaGUgc3RlcCBzaXplLlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgcm91bmREb3duVG9TdGVwKHN0ZXA6IG51bWJlcikge1xyXG4gICAgICAgIHJldHVybiB0aGlzLm1hcCgobikgPT4gTWF0aFV0aWwucm91bmREb3duVG9TdGVwKG4sIHN0ZXApKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFJvdW5kcyB0aGUgdmVjdG9yIHVwIHRvIHRoZSBuZWFyZXN0IHN0ZXAuXHJcbiAgICAgKiBAcmVtYXJrcyBNdXRhdGVzIHRoaXMgaW5zdGFuY2UuXHJcbiAgICAgKiBAcGFyYW0gc3RlcCBUaGUgc3RlcCBzaXplLlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgcm91bmRVcFRvU3RlcChzdGVwOiBudW1iZXIpIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5tYXAoKG4pID0+IE1hdGhVdGlsLnJvdW5kVXBUb1N0ZXAobiwgc3RlcCkpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogUm91bmRzIHRoZSB2ZWN0b3IgdG8gdGhlIG5lYXJlc3Qgc3RlcC5cclxuICAgICAqIEByZW1hcmtzIE11dGF0ZXMgdGhpcyBpbnN0YW5jZS5cclxuICAgICAqIEBwYXJhbSBzdGVwIFRoZSBzdGVwIHNpemUuXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyByb3VuZChwcmVjaXNpb246IG51bWJlcikge1xyXG4gICAgICAgIHJldHVybiB0aGlzLm1hcCgobikgPT4gTWF0aFV0aWwucm91bmRUbyhuLCBwcmVjaXNpb24pKTtcclxuICAgIH1cclxuICAgIC8vICNlbmRyZWdpb25cclxuXHJcbiAgICAvLyAjcmVnaW9uIEJpbmFyeSBPcGVyYXRpb25zXHJcbiAgICAvKipcclxuICAgICAqIEFkZHMgdGhlIHZlY3RvciB0byBhbm90aGVyIHZlY3RvciBvciBzY2FsYXIuXHJcbiAgICAgKiBAcmVtYXJrcyBNdXRhdGVzIHRoaXMgaW5zdGFuY2UuXHJcbiAgICAgKiBAcGFyYW0gb3RoZXIgVGhlIG90aGVyIHZlY3RvciBvciBzY2FsYXIuXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBhZGQoLi4uYXJnczogVkNvbnN0cnVjdG9yQXJnczxLPik6IHRoaXMge1xyXG4gICAgICAgIGNvbnN0IHYgPSBBYnN0cmFjdFZlY3Rvci5hcmdzVG9WZWN0b3IodGhpcy5rZXlzLCBhcmdzKTtcclxuICAgICAgICBmb3IgKGNvbnN0IGtleSBvZiB0aGlzLmtleXMpIHRoaXNba2V5XSArPSB2W2tleV07XHJcbiAgICAgICAgcmV0dXJuIHRoaXM7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBTdWJ0cmFjdHMgYW5vdGhlciB2ZWN0b3Igb3Igc2NhbGFyIGZyb20gdGhlIHZlY3Rvci5cclxuICAgICAqIEByZW1hcmtzIE11dGF0ZXMgdGhpcyBpbnN0YW5jZS5cclxuICAgICAqIEBwYXJhbSBvdGhlciBUaGUgb3RoZXIgdmVjdG9yIG9yIHNjYWxhci5cclxuICAgICAqL1xyXG4gICAgcHVibGljIHN1YnRyYWN0PFQgZXh0ZW5kcyBLPiguLi5hcmdzOiBWQ29uc3RydWN0b3JBcmdzPFQ+KTogdGhpcyB7XHJcbiAgICAgICAgY29uc3QgdiA9IEFic3RyYWN0VmVjdG9yLmFyZ3NUb1ZlY3Rvcih0aGlzLmtleXMsIGFyZ3MpO1xyXG4gICAgICAgIGZvciAoY29uc3Qga2V5IG9mIHRoaXMua2V5cykgdGhpc1trZXldIC09IHZba2V5XTtcclxuICAgICAgICByZXR1cm4gdGhpcztcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIE11bHRpcGxpZXMgdGhlIHZlY3RvciBieSBhbm90aGVyIHZlY3RvciBvciBzY2FsYXIuXHJcbiAgICAgKiBAcmVtYXJrcyBNdXRhdGVzIHRoaXMgaW5zdGFuY2UuXHJcbiAgICAgKiBAcGFyYW0gb3RoZXIgVGhlIG90aGVyIHZlY3RvciBvciBzY2FsYXIuXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBtdWx0aXBseSguLi5hcmdzOiBWQ29uc3RydWN0b3JBcmdzPEs+KTogdGhpcyB7XHJcbiAgICAgICAgY29uc3QgdiA9IEFic3RyYWN0VmVjdG9yLmFyZ3NUb1ZlY3Rvcih0aGlzLmtleXMsIGFyZ3MpO1xyXG4gICAgICAgIGZvciAoY29uc3Qga2V5IG9mIHRoaXMua2V5cykgdGhpc1trZXldICo9IHZba2V5XTtcclxuICAgICAgICByZXR1cm4gdGhpcztcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIERpdmlkZXMgdGhlIHZlY3RvciBieSBhbm90aGVyIHZlY3RvciBvciBzY2FsYXIuXHJcbiAgICAgKiBAcmVtYXJrcyBNdXRhdGVzIHRoaXMgaW5zdGFuY2UuXHJcbiAgICAgKiBAcGFyYW0gb3RoZXIgVGhlIG90aGVyIHZlY3RvciBvciBzY2FsYXIuXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBkaXZpZGUoLi4uYXJnczogVkNvbnN0cnVjdG9yQXJnczxLPik6IHRoaXMge1xyXG4gICAgICAgIGNvbnN0IHYgPSBBYnN0cmFjdFZlY3Rvci5hcmdzVG9WZWN0b3IodGhpcy5rZXlzLCBhcmdzKTtcclxuICAgICAgICBmb3IgKGNvbnN0IGtleSBvZiB0aGlzLmtleXMpIHRoaXNba2V5XSAvPSB2W2tleV07XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuY2xlYW4oKTtcclxuICAgIH1cclxuICAgIC8vICNlbmRyZWdpb25cclxuXHJcbiAgICAvLyAjcmVnaW9uIFZlY3RvciBvcGVyYXRpb25zXHJcbiAgICAvKipcclxuICAgICAqIENoZWNrcyBpZiB0aGUgdmVjdG9yIGlzIGVxdWFsIHRvIGFub3RoZXIgdmVjdG9yLlxyXG4gICAgICogQHBhcmFtIG90aGVyVmVjdG9yIFRoZSBvdGhlciB2ZWN0b3IgdG8gY29tcGFyZSB0by5cclxuICAgICAqL1xyXG4gICAgcHVibGljIGVxdWFscyhvdGhlclZlY3RvcjogVmVjdG9yPEs+KTogYm9vbGVhbiB7XHJcbiAgICAgICAgZm9yIChjb25zdCBrZXkgb2YgdGhpcy5rZXlzKSBpZiAodGhpc1trZXldICE9PSBvdGhlclZlY3RvcltrZXldKSByZXR1cm4gZmFsc2U7XHJcbiAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBSZXR1cm5zIHRoZSBldWNsaWRlYW4gZGlzdGFuY2UgYmV0d2VlbiB0aGUgdmVjdG9yIGFuZCBhbm90aGVyIHZlY3Rvci5cclxuICAgICAqIEBwYXJhbSBvdGhlclZlY3RvciBUaGUgb3RoZXIgdmVjdG9yIHRvIGdldCB0aGUgZGlzdGFuY2UgZnJvbS5cclxuICAgICAqL1xyXG4gICAgcHVibGljIGRpc3RhbmNlKG90aGVyVmVjdG9yOiBWZWN0b3I8Sz4pOiBudW1iZXIge1xyXG4gICAgICAgIHJldHVybiB0aGlzLmNsb25lKCkuc3VidHJhY3Qob3RoZXJWZWN0b3IpLmxlbmd0aCgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogUmV0dXJucyB0aGUgdGF4aWNhYiBkaXN0YW5jZSBiZXR3ZWVuIHRoZSB2ZWN0b3IgYW5kIGFub3RoZXIgdmVjdG9yLlxyXG4gICAgICogQHBhcmFtIG90aGVyVmVjdG9yIFRoZSBvdGhlciB2ZWN0b3IgdG8gZ2V0IHRoZSBkaXN0YW5jZSBmcm9tLlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgdGF4aWNhYkRpc3RhbmNlKG90aGVyVmVjdG9yOiBWZWN0b3I8Sz4pOiBudW1iZXIge1xyXG4gICAgICAgIHJldHVybiB0aGlzLmNsb25lKCkuc3VidHJhY3Qob3RoZXJWZWN0b3IpLmFicygpLnN1bSgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogUmV0dXJucyB0cnVlIGlmIHRoZSB2ZWN0b3IgaXMgZmFjZS1hZGphY2VudCAodGF4aWNhYiBkaXN0YW5jZSBvZiAxKSB0byBhbm90aGVyIHZlY3Rvci5cclxuICAgICAqIEBwYXJhbSBvdGhlclZlY3RvciBUaGUgb3RoZXIgdmVjdG9yIHRvIGNoZWNrIGFnYWluc3QuXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBpc0FkamFjZW50VG8ob3RoZXJWZWN0b3I6IFZlY3RvcjxLPik6IGJvb2xlYW4ge1xyXG4gICAgICAgIHJldHVybiB0aGlzLnRheGljYWJEaXN0YW5jZShvdGhlclZlY3RvcikgPT09IDE7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBSZXR1cm5zIHRoZSBjbG9zZXN0IHZlY3RvciBmcm9tIGFuIGFycmF5IG9mIHZlY3RvcnMgdG8gdGhpcyB2ZWN0b3IuXHJcbiAgICAgKiBAcGFyYW0gdmVjdG9ycyBUaGUgYXJyYXkgb2YgdmVjdG9ycyB0byBzZWFyY2ggdGhyb3VnaC5cclxuICAgICAqL1xyXG4gICAgcHVibGljIGNsb3Nlc3QodmVjdG9yczogVmVjdG9yPEs+W10pOiBWZWN0b3I8Sz4gfCB1bmRlZmluZWQge1xyXG4gICAgICAgIGxldCBuZWFyZXN0OiBWZWN0b3I8Sz4gPSB2ZWN0b3JzWzBdO1xyXG4gICAgICAgIGxldCBuZWFyZXN0RGlzdGFuY2UgPSB0aGlzLmRpc3RhbmNlKG5lYXJlc3QpO1xyXG5cclxuICAgICAgICBmb3IgKGNvbnN0IHZlY3RvciBvZiB2ZWN0b3JzLnNwbGljZSgxKSkge1xyXG4gICAgICAgICAgICBjb25zdCBjdXJyZW50RGlzdGFuY2UgPSB0aGlzLmRpc3RhbmNlKHZlY3Rvcik7XHJcbiAgICAgICAgICAgIGlmIChjdXJyZW50RGlzdGFuY2UgPj0gbmVhcmVzdERpc3RhbmNlKSBjb250aW51ZTtcclxuICAgICAgICAgICAgbmVhcmVzdCA9IHZlY3RvcjtcclxuICAgICAgICAgICAgbmVhcmVzdERpc3RhbmNlID0gY3VycmVudERpc3RhbmNlO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgcmV0dXJuIG5lYXJlc3Q7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBSZXR1cm5zIHRoZSBtaW5pbXVtIHZlY3RvciBiZXR3ZWVuIHRoZSB2ZWN0b3IgYW5kIGFub3RoZXIgdmVjdG9yLlxyXG4gICAgICogQHJlbWFya3MgTXV0YXRlcyB0aGlzIGluc3RhbmNlLlxyXG4gICAgICogQHBhcmFtIG90aGVyVmVjdG9yIFRoZSBvdGhlciB2ZWN0b3IgdG8gY29tcGFyZSB0by5cclxuICAgICAqL1xyXG4gICAgcHVibGljIG1pbihvdGhlclZlY3RvcjogVmVjdG9yPEs+KTogdGhpcyB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMubWFwKCh2YWx1ZSwgaykgPT4gTWF0aC5taW4odmFsdWUsIG90aGVyVmVjdG9yW2tdKSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBSZXR1cm5zIHRoZSBtYXhpbXVtIHZlY3RvciBiZXR3ZWVuIHRoZSB2ZWN0b3IgYW5kIGFub3RoZXIgdmVjdG9yLlxyXG4gICAgICogQHJlbWFya3MgTXV0YXRlcyB0aGlzIGluc3RhbmNlLlxyXG4gICAgICogQHBhcmFtIG90aGVyVmVjdG9yIFRoZSBvdGhlciB2ZWN0b3IgdG8gY29tcGFyZSB0by5cclxuICAgICAqL1xyXG4gICAgcHVibGljIG1heChvdGhlclZlY3RvcjogVmVjdG9yPEs+KTogdGhpcyB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMubWFwKCh2YWx1ZSwgaykgPT4gTWF0aC5tYXgodmFsdWUsIG90aGVyVmVjdG9yW2tdKSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBNdXRhdGVzIGFuZCByZXR1cm5zIHRoZSB2ZWN0b3IgYnkgbGluZWFybHkgaW50ZXJwb2xhdGluZyBiZXR3ZWVuIHRoZSB2ZWN0b3IgYW5kIGFub3RoZXIgdmVjdG9yLlxyXG4gICAgICogQHJlbWFya3MgTXV0YXRlcyB0aGlzIGluc3RhbmNlLlxyXG4gICAgICogQHBhcmFtIHRhcmdldCBUaGUgdGFyZ2V0IHZlY3Rvci5cclxuICAgICAqIEBwYXJhbSB0IFRoZSBpbnRlcnBvbGF0aW9uIGZhY3RvciAoMCB0byAxKS5cclxuICAgICAqL1xyXG4gICAgcHVibGljIGxlcnAodGFyZ2V0OiBWZWN0b3I8Sz4sIHQ6IG51bWJlcik6IHRoaXMge1xyXG4gICAgICAgIHJldHVybiB0aGlzLmFkZChcclxuICAgICAgICAgICAgLi4udGhpcy5jcmVhdGUodGFyZ2V0KVxyXG4gICAgICAgICAgICAgICAgLnN1YnRyYWN0KHRoaXMgYXMgVmVjdG9yPEs+KVxyXG4gICAgICAgICAgICAgICAgLm11bHRpcGx5KHQpXHJcbiAgICAgICAgICAgICAgICAudmFsdWVzKClcclxuICAgICAgICApO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogTXV0YXRlcyBhbmQgcmV0dXJucyBhIHZlY3RvciB3aGVyZSBvbmx5IHRoZSBkb21pbmFudCBheGlzIGlzIHByZXNlcnZlZC5cclxuICAgICAqIFRoZSBkb21pbmFudCBheGlzIGlzIHRoZSBheGlzIHdpdGggdGhlIGxhcmdlc3QgYWJzb2x1dGUgdmFsdWUuXHJcbiAgICAgKiBAcmVtYXJrcyBNdXRhdGVzIHRoaXMgaW5zdGFuY2UuXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBkb21pbmFudCgpOiB0aGlzIHtcclxuICAgICAgICBsZXQgZG9taW5hbnQ6IHN0cmluZyA9IHRoaXMua2V5c1swXTtcclxuICAgICAgICBmb3IgKGNvbnN0IGtleSBvZiB0aGlzLmtleXMpIHtcclxuICAgICAgICAgICAgaWYgKE1hdGguYWJzKHRoaXNba2V5XSkgPCBNYXRoLmFicyh0aGlzW2RvbWluYW50XSkpIGNvbnRpbnVlO1xyXG4gICAgICAgICAgICBkb21pbmFudCA9IGtleTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHJldHVybiB0aGlzLm1hcCgoXywgaykgPT4gKGsgPT09IGRvbWluYW50ID8gdGhpc1trXSA6IDApKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyAjcmVnaW9uXHJcblxyXG4gICAgLy8gI3JlZ2lvbiBIZWxwZXJzXHJcbiAgICAvKipcclxuICAgICAqIFJldHVybnMgdGhlIHZhbHVlcyBvZiB0aGUgdmVjdG9yIGFzIGFuIGFycmF5LlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgdmFsdWVzPFQgPSBLZXlzVG9BcnJheTxLLCBudW1iZXI+PigpOiBUIHtcclxuICAgICAgICBjb25zdCB2ZWN0b3JBcnJheTogVFtdID0gW107XHJcbiAgICAgICAgZm9yIChjb25zdCBrZXkgb2YgdGhpcy5rZXlzKSB2ZWN0b3JBcnJheS5wdXNoKHRoaXNba2V5XSk7XHJcbiAgICAgICAgcmV0dXJuIHZlY3RvckFycmF5IGFzIFQ7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBNYXBzIHRoZSB2ZWN0b3IgdG8gYSBuZXcgdmVjdG9yIHVzaW5nIHRoZSBnaXZlbiBmdW5jdGlvbi5cclxuICAgICAqIEByZW1hcmtzIE11dGF0ZXMgdGhpcyBpbnN0YW5jZS5cclxuICAgICAqIEBwYXJhbSBmIFRoZSBtYXBwaW5nIGZ1bmN0aW9uLlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgbWFwKGY6IChuOiBudW1iZXIsIGs6IHN0cmluZykgPT4gbnVtYmVyKTogdGhpcyB7XHJcbiAgICAgICAgZm9yIChjb25zdCBrZXkgb2YgdGhpcy5rZXlzKSB0aGlzW2tleV0gPSBmKHRoaXNba2V5XSwga2V5KTtcclxuICAgICAgICByZXR1cm4gdGhpcztcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIENsZWFucyB0aGUgdmVjdG9yIGJ5IHJlbW92aW5nIE5hTiB2YWx1ZXMuXHJcbiAgICAgKiBAcmVtYXJrcyBNdXRhdGVzIHRoaXMgaW5zdGFuY2UuXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBjbGVhbigpOiB0aGlzIHtcclxuICAgICAgICBmb3IgKGNvbnN0IGtleSBvZiB0aGlzLmtleXMpIHtcclxuICAgICAgICAgICAgaWYgKGlzTmFOKHRoaXNba2V5XSkpIHRoaXNba2V5XSA9IDA7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiB0aGlzO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogU2V0cyBhIHNpbmdsZSBjb21wb25lbnQgb2YgdGhlIHZlY3RvciBieSBrZXkuXHJcbiAgICAgKiBAcmVtYXJrcyBNdXRhdGVzIHRoaXMgaW5zdGFuY2UuXHJcbiAgICAgKiBAcGFyYW0gYXhpcyBUaGUga2V5IHRvIHNldC5cclxuICAgICAqIEBwYXJhbSB2YWx1ZSBUaGUgdmFsdWUgdG8gYXNzaWduLlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc2V0QXhpcyhheGlzOiBLW251bWJlcl0sIHZhbHVlOiBudW1iZXIpOiB0aGlzIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5tYXAoKG4sIGspID0+IChrID09PSBheGlzID8gdmFsdWUgOiBuKSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBBZGRzIGEgdmFsdWUgdG8gYSBzaW5nbGUgY29tcG9uZW50IG9mIHRoZSB2ZWN0b3IgYnkga2V5LlxyXG4gICAgICogQHJlbWFya3MgTXV0YXRlcyB0aGlzIGluc3RhbmNlLlxyXG4gICAgICogQHBhcmFtIGF4aXMgVGhlIGtleSB0byBhZGQgdG8uXHJcbiAgICAgKiBAcGFyYW0gdmFsdWUgVGhlIHZhbHVlIHRvIGFkZC5cclxuICAgICAqL1xyXG4gICAgcHVibGljIGFkZEF4aXMoYXhpczogS1tudW1iZXJdLCB2YWx1ZTogbnVtYmVyKTogdGhpcyB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMubWFwKChuLCBrKSA9PiAoayA9PT0gYXhpcyA/IG4gKyB2YWx1ZSA6IG4pKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFNldHMgdGhlIGRpbWVuc2lvbiBvZiB0aGUgdmVjdG9yLlxyXG4gICAgICogQHJlbWFya3MgTXV0YXRlcyB0aGlzIGluc3RhbmNlLlxyXG4gICAgICogQHBhcmFtIGRpbWVuc2lvbiBUaGUgZGltZW5zaW9uIHRvIHNldC5cclxuICAgICAqL1xyXG4gICAgcHVibGljIHNldERpbWVuc2lvbihkaW1lbnNpb24/OiBEaW1lbnNpb24gfCBzdHJpbmcpOiB0aGlzIHtcclxuICAgICAgICBpZiAodHlwZW9mIGRpbWVuc2lvbiA9PT0gXCJzdHJpbmdcIikge1xyXG4gICAgICAgICAgICB0aGlzLmRpbWVuc2lvbiA9IE1haW4uZGltZW5zaW9uc1tkaW1lbnNpb25dO1xyXG4gICAgICAgICAgICB0aGlzLmRpbWVuc2lvbiA/Pz0gd29ybGQuZ2V0RGltZW5zaW9uKGRpbWVuc2lvbik7XHJcbiAgICAgICAgfSBlbHNlIHRoaXMuZGltZW5zaW9uID0gZGltZW5zaW9uO1xyXG4gICAgICAgIHJldHVybiB0aGlzO1xyXG4gICAgfVxyXG5cclxuICAgIC8vICNlbmRyZWdpb25cclxufVxyXG4iXSwibmFtZXMiOlsid29ybGQiLCJBYnN0cmFjdFZlY3RvciIsInNldCIsImFyZ3MiLCJ2IiwiYXJnc1RvVmVjdG9yIiwia2V5cyIsImtleSIsImNyZWF0ZSIsImNvbnN0cnVjdG9yIiwidmVjdG9yIiwibiIsImxlbmd0aCIsImkiLCJlbnRyaWVzIiwiaXNWZWN0b3IiLCJvYmoiLCJhc1ZlY3RvciIsImV2ZXJ5IiwiY2xvbmUiLCJkaW1lbnNpb24iLCIkIiwidG9IYXNoIiwiTWF0aFV0aWwiLCJoYXNoIiwidG9TdHJpbmciLCJwcmVjaXNpb24iLCJzdHJpbmciLCJ1bmRlZmluZWQiLCJ0b0ZpeGVkIiwiaWQiLCJ0b0pTT04iLCJqc29uIiwiTWF0aCIsInNxcnQiLCJzcXVhcmVMZW5ndGgiLCJ2YWx1ZXMiLCJyZWR1Y2UiLCJzdW0iLCJwcm9kdWN0IiwicHJvZCIsImRvdCIsIm90aGVyVmVjdG9yIiwibXVsdGlwbHkiLCJhYnMiLCJtYXAiLCJub3JtYWxpemUiLCJkaXZpZGUiLCJmbG9vciIsInJvdW5kRG93blRvU3RlcCIsInN0ZXAiLCJyb3VuZFVwVG9TdGVwIiwicm91bmQiLCJyb3VuZFRvIiwiYWRkIiwic3VidHJhY3QiLCJjbGVhbiIsImVxdWFscyIsImRpc3RhbmNlIiwidGF4aWNhYkRpc3RhbmNlIiwiaXNBZGphY2VudFRvIiwiY2xvc2VzdCIsInZlY3RvcnMiLCJuZWFyZXN0IiwibmVhcmVzdERpc3RhbmNlIiwic3BsaWNlIiwiY3VycmVudERpc3RhbmNlIiwibWluIiwidmFsdWUiLCJrIiwibWF4IiwibGVycCIsInRhcmdldCIsInQiLCJkb21pbmFudCIsIl8iLCJ2ZWN0b3JBcnJheSIsInB1c2giLCJmIiwiaXNOYU4iLCJzZXRBeGlzIiwiYXhpcyIsImFkZEF4aXMiLCJzZXREaW1lbnNpb24iLCJNYWluIiwiZGltZW5zaW9ucyIsImdldERpbWVuc2lvbiJdLCJtYXBwaW5ncyI6IkFBQUEsU0FBb0JBLEtBQUssUUFBUSxvQkFBb0I7QUFhdEMsTUFBZUM7SUFZMUI7OztLQUdDLEdBQ0QsQUFBT0MsSUFBSSxHQUFHQyxJQUF5QixFQUFlO1FBQ2xELE1BQU1DLElBQUlILGVBQWVJLFlBQVksQ0FBQyxJQUFJLENBQUNDLElBQUksRUFBRUg7UUFDakQsS0FBSyxNQUFNSSxPQUFPLElBQUksQ0FBQ0QsSUFBSSxDQUFFLElBQUksQ0FBQ0MsSUFBSSxHQUFHSCxDQUFDLENBQUNHLElBQUk7UUFFL0MsT0FBTyxJQUFJO0lBQ2Y7SUFFQTs7S0FFQyxHQUNELEFBQVVDLE9BQU8sR0FBR0wsSUFBeUIsRUFBZTtRQUN4RCxPQUFPLElBQUssSUFBSSxD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