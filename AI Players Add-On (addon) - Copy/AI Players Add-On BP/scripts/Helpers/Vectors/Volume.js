import { BlockVolume, world } from "@minecraft/server";
import V3 from "./V3";
class Volume {
    /**
     * Sets the minimum and maximum points of the volume.
     * @remarks Mutates this instance.
     * @param min The minimum point.
     * @param max The maximum point.
     * @returns The updated volume.
     */ set(min, max) {
        this.min = new V3(min);
        this.max = new V3(max);
        this.clean();
        return this;
    }
    /**
     * Sets the dimension of the volume.
     * @remarks Mutates this instance.
     * @param dimension The dimension to set.
     * @returns The updated volume.
     */ setDimension(dimension) {
        if (typeof dimension === "string") this.dimension = world.getDimension(dimension);
        else this.dimension = dimension;
        return this;
    }
    /**
     * Creates a new Volume instance from a size vector.
     * @param size The size vector.
     * @returns A new Volume instance.
     */ static fromSize(size, isCentered = true) {
        if (!isCentered) return new Volume(V3.Zero, new V3(size));
        const halfSize = new V3(size).divide(2);
        return new Volume(halfSize.clone().multiply(-1), halfSize);
    }
    /**
     * Creates a copy of the volume.
     * @returns A new Volume instance with the same min and max points.
     */ clone() {
        return new Volume(this.min, this.max).setDimension(this.dimension);
    }
    /**
     * Shorthand for cloning the volume.
     */ get $() {
        return this.clone();
    }
    /**
     * Converts the volume to a string representation.
     * @returns A string representation of the volume.
     */ toString() {
        let string = `${this.min.toString()} ${this.max.toString()}`;
        if (this.dimension) string += ` ${this.dimension.id}`;
        return string;
    }
    /**
     * Converts the volume to JSON.
     * @returns The JSON representation of the volume.
     */ toJSON() {
        return {
            min: this.min.toJSON(),
            max: this.max.toJSON(),
            dimension: this.dimension?.id
        };
    }
    /**
     * Converts the volume to a hash value.
     * @returns A hash value representing the volume.
     */ toHash() {
        return MathUtil.hash(this.toString());
    }
    /**
     * Converts the volume to a block volume.
     * @returns The block volume representation of the volume.
     */ toBlockVolume() {
        return new BlockVolume(this.min, this.max);
    }
    /**
     * Gets the size of the volume.
     * @returns The size of the volume as a V3 vector.
     */ size() {
        return this.max.$.subtract(this.min);
    }
    /**
     * Gets the total capacity of the volume.
     * @returns The total capacity of the volume.
     */ capacity() {
        return this.size().product();
    }
    /**
     * Gets the center point of the volume.
     * @returns The center point of the volume as a V3 vector.
     */ center() {
        return this.min.$.add(this.max).divide(2);
    }
    /**
     * Gets a random point within the volume.
     * @returns A random point within the volume as a V3 vector.
     */ randomPoint() {
        return V3.fromRandom(this.min, this.max);
    }
    /**
     * Cleans the vectors and ensures its min and max points are valid.
     * @remarks Mutates this instance.
     * @returns The cleaned volume.
     */ clean() {
        const oldMin = this.min.$.clean();
        const oldMax = this.max.$.clean();
        this.min = oldMin.$.min(oldMax);
        this.max = oldMin.$.max(oldMax);
        // Set dimension as undefined
        this.min.setDimension(undefined);
        this.max.setDimension(undefined);
        return this;
    }
    /**
     * Checks if a point is within the volume.
     * @param point - The point to check.
     * @param wiggle - An optional wiggle factor to allow for slight inaccuracies.
     * @returns True if the point is within the volume, false otherwise.
     */ contains(point, wiggle = 0) {
        return point.x >= this.min.x - wiggle && point.x <= this.max.x + wiggle && point.y >= this.min.y - wiggle && point.y <= this.max.y + wiggle && point.z >= this.min.z - wiggle && point.z <= this.max.z + wiggle;
    }
    /**
     * Snaps the volume to the grid.
     * @remarks Mutates this instance.
     * @returns This volume for chaining.
     */ grid() {
        this.min.grid();
        this.max.grid();
        return this;
    }
    /**
     * Offsets the volume by a given vector.
     * @remarks Mutates this instance.
     * @param offset - The offset vector.
     * @returns This volume for chaining.
     */ offset(offset) {
        this.min.add(offset);
        this.max.add(offset);
        return this;
    }
    constructor(min, max){
        this.set(min, max);
    }
}
export { Volume as default };

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIlZvbHVtZS50cyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBCbG9ja1ZvbHVtZSwgRGltZW5zaW9uLCBWZWN0b3IzLCB3b3JsZCB9IGZyb20gXCJAbWluZWNyYWZ0L3NlcnZlclwiO1xyXG5pbXBvcnQgVjMgZnJvbSBcIi4vVjNcIjtcclxuXHJcbmV4cG9ydCBkZWZhdWx0IGNsYXNzIFZvbHVtZSB7XHJcbiAgICBwdWJsaWMgbWluOiBWMztcclxuICAgIHB1YmxpYyBtYXg6IFYzO1xyXG4gICAgcHVibGljIGRpbWVuc2lvbj86IERpbWVuc2lvbjtcclxuXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IobWluOiBWZWN0b3IzLCBtYXg6IFZlY3RvcjMpIHtcclxuICAgICAgICB0aGlzLnNldChtaW4sIG1heCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBTZXRzIHRoZSBtaW5pbXVtIGFuZCBtYXhpbXVtIHBvaW50cyBvZiB0aGUgdm9sdW1lLlxyXG4gICAgICogQHJlbWFya3MgTXV0YXRlcyB0aGlzIGluc3RhbmNlLlxyXG4gICAgICogQHBhcmFtIG1pbiBUaGUgbWluaW11bSBwb2ludC5cclxuICAgICAqIEBwYXJhbSBtYXggVGhlIG1heGltdW0gcG9pbnQuXHJcbiAgICAgKiBAcmV0dXJucyBUaGUgdXBkYXRlZCB2b2x1bWUuXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzZXQobWluOiBWZWN0b3IzLCBtYXg6IFZlY3RvcjMpOiBWb2x1bWUge1xyXG4gICAgICAgIHRoaXMubWluID0gbmV3IFYzKG1pbik7XHJcbiAgICAgICAgdGhpcy5tYXggPSBuZXcgVjMobWF4KTtcclxuICAgICAgICB0aGlzLmNsZWFuKCk7XHJcbiAgICAgICAgcmV0dXJuIHRoaXM7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBTZXRzIHRoZSBkaW1lbnNpb24gb2YgdGhlIHZvbHVtZS5cclxuICAgICAqIEByZW1hcmtzIE11dGF0ZXMgdGhpcyBpbnN0YW5jZS5cclxuICAgICAqIEBwYXJhbSBkaW1lbnNpb24gVGhlIGRpbWVuc2lvbiB0byBzZXQuXHJcbiAgICAgKiBAcmV0dXJucyBUaGUgdXBkYXRlZCB2b2x1bWUuXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzZXREaW1lbnNpb24oZGltZW5zaW9uPzogRGltZW5zaW9uIHwgc3RyaW5nKTogVm9sdW1lIHtcclxuICAgICAgICBpZiAodHlwZW9mIGRpbWVuc2lvbiA9PT0gXCJzdHJpbmdcIikgdGhpcy5kaW1lbnNpb24gPSB3b3JsZC5nZXREaW1lbnNpb24oZGltZW5zaW9uKTtcclxuICAgICAgICBlbHNlIHRoaXMuZGltZW5zaW9uID0gZGltZW5zaW9uO1xyXG4gICAgICAgIHJldHVybiB0aGlzO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQ3JlYXRlcyBhIG5ldyBWb2x1bWUgaW5zdGFuY2UgZnJvbSBhIHNpemUgdmVjdG9yLlxyXG4gICAgICogQHBhcmFtIHNpemUgVGhlIHNpemUgdmVjdG9yLlxyXG4gICAgICogQHJldHVybnMgQSBuZXcgVm9sdW1lIGluc3RhbmNlLlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGZyb21TaXplKHNpemU6IFZlY3RvcjMsIGlzQ2VudGVyZWQ6IGJvb2xlYW4gPSB0cnVlKTogVm9sdW1lIHtcclxuICAgICAgICBpZiAoIWlzQ2VudGVyZWQpIHJldHVybiBuZXcgVm9sdW1lKFYzLlplcm8sIG5ldyBWMyhzaXplKSk7XHJcblxyXG4gICAgICAgIGNvbnN0IGhhbGZTaXplID0gbmV3IFYzKHNpemUpLmRpdmlkZSgyKTtcclxuICAgICAgICByZXR1cm4gbmV3IFZvbHVtZShoYWxmU2l6ZS5jbG9uZSgpLm11bHRpcGx5KC0xKSwgaGFsZlNpemUpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQ3JlYXRlcyBhIGNvcHkgb2YgdGhlIHZvbHVtZS5cclxuICAgICAqIEByZXR1cm5zIEEgbmV3IFZvbHVtZSBpbnN0YW5jZSB3aXRoIHRoZSBzYW1lIG1pbiBhbmQgbWF4IHBvaW50cy5cclxuICAgICAqL1xyXG4gICAgcHVibGljIGNsb25lKCk6IFZvbHVtZSB7XHJcbiAgICAgICAgcmV0dXJuIG5ldyBWb2x1bWUodGhpcy5taW4sIHRoaXMubWF4KS5zZXREaW1lbnNpb24odGhpcy5kaW1lbnNpb24pO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogU2hvcnRoYW5kIGZvciBjbG9uaW5nIHRoZSB2b2x1bWUuXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBnZXQgJCgpOiBWb2x1bWUge1xyXG4gICAgICAgIHJldHVybiB0aGlzLmNsb25lKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBDb252ZXJ0cyB0aGUgdm9sdW1lIHRvIGEgc3RyaW5nIHJlcHJlc2VudGF0aW9uLlxyXG4gICAgICogQHJldHVybnMgQSBzdHJpbmcgcmVwcmVzZW50YXRpb24gb2YgdGhlIHZvbHVtZS5cclxuICAgICAqL1xyXG4gICAgcHVibGljIHRvU3RyaW5nKCk6IHN0cmluZyB7XHJcbiAgICAgICAgbGV0IHN0cmluZyA9IGAke3RoaXMubWluLnRvU3RyaW5nKCl9ICR7dGhpcy5tYXgudG9TdHJpbmcoKX1gO1xyXG4gICAgICAgIGlmICh0aGlzLmRpbWVuc2lvbikgc3RyaW5nICs9IGAgJHt0aGlzLmRpbWVuc2lvbi5pZH1gO1xyXG4gICAgICAgIHJldHVybiBzdHJpbmc7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBDb252ZXJ0cyB0aGUgdm9sdW1lIHRvIEpTT04uXHJcbiAgICAgKiBAcmV0dXJucyBUaGUgSlNPTiByZXByZXNlbnRhdGlvbiBvZiB0aGUgdm9sdW1lLlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgdG9KU09OKCk6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IHtcclxuICAgICAgICByZXR1cm4ge1xyXG4gICAgICAgICAgICBtaW46IHRoaXMubWluLnRvSlNPTigpLFxyXG4gICAgICAgICAgICBtYXg6IHRoaXMubWF4LnRvSlNPTigpLFxyXG4gICAgICAgICAgICBkaW1lbnNpb246IHRoaXMuZGltZW5zaW9uPy5pZCxcclxuICAgICAgICB9O1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQ29udmVydHMgdGhlIHZvbHVtZSB0byBhIGhhc2ggdmFsdWUuXHJcbiAgICAgKiBAcmV0dXJucyBBIGhhc2ggdmFsdWUgcmVwcmVzZW50aW5nIHRoZSB2b2x1bWUuXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyB0b0hhc2goKTogbnVtYmVyIHtcclxuICAgICAgICByZXR1cm4gTWF0aFV0aWwuaGFzaCh0aGlzLnRvU3RyaW5nKCkpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQ29udmVydHMgdGhlIHZvbHVtZSB0byBhIGJsb2NrIHZvbHVtZS5cclxuICAgICAqIEByZXR1cm5zIFRoZSBibG9jayB2b2x1bWUgcmVwcmVzZW50YXRpb24gb2YgdGhlIHZvbHVtZS5cclxuICAgICAqL1xyXG4gICAgcHVibGljIHRvQmxvY2tWb2x1bWUoKTogQmxvY2tWb2x1bWUge1xyXG4gICAgICAgIHJldHVybiBuZXcgQmxvY2tWb2x1bWUodGhpcy5taW4sIHRoaXMubWF4KTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEdldHMgdGhlIHNpemUgb2YgdGhlIHZvbHVtZS5cclxuICAgICAqIEByZXR1cm5zIFRoZSBzaXplIG9mIHRoZSB2b2x1bWUgYXMgYSBWMyB2ZWN0b3IuXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzaXplKCk6IFYzIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5tYXguJC5zdWJ0cmFjdCh0aGlzLm1pbik7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBHZXRzIHRoZSB0b3RhbCBjYXBhY2l0eSBvZiB0aGUgdm9sdW1lLlxyXG4gICAgICogQHJldHVybnMgVGhlIHRvdGFsIGNhcGFjaXR5IG9mIHRoZSB2b2x1bWUuXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBjYXBhY2l0eSgpOiBudW1iZXIge1xyXG4gICAgICAgIHJldHVybiB0aGlzLnNpemUoKS5wcm9kdWN0KCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBHZXRzIHRoZSBjZW50ZXIgcG9pbnQgb2YgdGhlIHZvbHVtZS5cclxuICAgICAqIEByZXR1cm5zIFRoZSBjZW50ZXIgcG9pbnQgb2YgdGhlIHZvbHVtZSBhcyBhIFYzIHZlY3Rvci5cclxuICAgICAqL1xyXG4gICAgcHVibGljIGNlbnRlcigpOiBWMyB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMubWluLiQuYWRkKHRoaXMubWF4KS5kaXZpZGUoMik7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBHZXRzIGEgcmFuZG9tIHBvaW50IHdpdGhpbiB0aGUgdm9sdW1lLlxyXG4gICAgICogQHJldHVybnMgQSByYW5kb20gcG9pbnQgd2l0aGluIHRoZSB2b2x1bWUgYXMgYSBWMyB2ZWN0b3IuXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyByYW5kb21Qb2ludCgpOiBWMyB7XHJcbiAgICAgICAgcmV0dXJuIFYzLmZyb21SYW5kb20odGhpcy5taW4sIHRoaXMubWF4KTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIENsZWFucyB0aGUgdmVjdG9ycyBhbmQgZW5zdXJlcyBpdHMgbWluIGFuZCBtYXggcG9pbnRzIGFyZSB2YWxpZC5cclxuICAgICAqIEByZW1hcmtzIE11dGF0ZXMgdGhpcyBpbnN0YW5jZS5cclxuICAgICAqIEByZXR1cm5zIFRoZSBjbGVhbmVkIHZvbHVtZS5cclxuICAgICAqL1xyXG4gICAgcHVibGljIGNsZWFuKCk6IFZvbHVtZSB7XHJcbiAgICAgICAgY29uc3Qgb2xkTWluID0gdGhpcy5taW4uJC5jbGVhbigpO1xyXG4gICAgICAgIGNvbnN0IG9sZE1heCA9IHRoaXMubWF4LiQuY2xlYW4oKTtcclxuICAgICAgICB0aGlzLm1pbiA9IG9sZE1pbi4kLm1pbihvbGRNYXgpO1xyXG4gICAgICAgIHRoaXMubWF4ID0gb2xkTWluLiQubWF4KG9sZE1heCk7XHJcbiAgICAgICAgLy8gU2V0IGRpbWVuc2lvbiBhcyB1bmRlZmluZWRcclxuICAgICAgICB0aGlzLm1pbi5zZXREaW1lbnNpb24odW5kZWZpbmVkKTtcclxuICAgICAgICB0aGlzLm1heC5zZXREaW1lbnNpb24odW5kZWZpbmVkKTtcclxuICAgICAgICByZXR1cm4gdGhpcztcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIENoZWNrcyBpZiBhIHBvaW50IGlzIHdpdGhpbiB0aGUgdm9sdW1lLlxyXG4gICAgICogQHBhcmFtIHBvaW50IC0gVGhlIHBvaW50IHRvIGNoZWNrLlxyXG4gICAgICogQHBhcmFtIHdpZ2dsZSAtIEFuIG9wdGlvbmFsIHdpZ2dsZSBmYWN0b3IgdG8gYWxsb3cgZm9yIHNsaWdodCBpbmFjY3VyYWNpZXMuXHJcbiAgICAgKiBAcmV0dXJucyBUcnVlIGlmIHRoZSBwb2ludCBpcyB3aXRoaW4gdGhlIHZvbHVtZSwgZmFsc2Ugb3RoZXJ3aXNlLlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgY29udGFpbnMocG9pbnQ6IFZlY3RvcjMsIHdpZ2dsZTogbnVtYmVyID0gMCk6IGJvb2xlYW4ge1xyXG4gICAgICAgIHJldHVybiAoXHJcbiAgICAgICAgICAgIHBvaW50LnggPj0gdGhpcy5taW4ueCAtIHdpZ2dsZSAmJlxyXG4gICAgICAgICAgICBwb2ludC54IDw9IHRoaXMubWF4LnggKyB3aWdnbGUgJiZcclxuICAgICAgICAgICAgcG9pbnQueSA+PSB0aGlzLm1pbi55IC0gd2lnZ2xlICYmXHJcbiAgICAgICAgICAgIHBvaW50LnkgPD0gdGhpcy5tYXgueSArIHdpZ2dsZSAmJlxyXG4gICAgICAgICAgICBwb2ludC56ID49IHRoaXMubWluLnogLSB3aWdnbGUgJiZcclxuICAgICAgICAgICAgcG9pbnQueiA8PSB0aGlzLm1heC56ICsgd2lnZ2xlXHJcbiAgICAgICAgKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFNuYXBzIHRoZSB2b2x1bWUgdG8gdGhlIGdyaWQuXHJcbiAgICAgKiBAcmVtYXJrcyBNdXRhdGVzIHRoaXMgaW5zdGFuY2UuXHJcbiAgICAgKiBAcmV0dXJucyBUaGlzIHZvbHVtZSBmb3IgY2hhaW5pbmcuXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBncmlkKCk6IFZvbHVtZSB7XHJcbiAgICAgICAgdGhpcy5taW4uZ3JpZCgpO1xyXG4gICAgICAgIHRoaXMubWF4LmdyaWQoKTtcclxuICAgICAgICByZXR1cm4gdGhpcztcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIE9mZnNldHMgdGhlIHZvbHVtZSBieSBhIGdpdmVuIHZlY3Rvci5cclxuICAgICAqIEByZW1hcmtzIE11dGF0ZXMgdGhpcyBpbnN0YW5jZS5cclxuICAgICAqIEBwYXJhbSBvZmZzZXQgLSBUaGUgb2Zmc2V0IHZlY3Rvci5cclxuICAgICAqIEByZXR1cm5zIFRoaXMgdm9sdW1lIGZvciBjaGFpbmluZy5cclxuICAgICAqL1xyXG4gICAgcHVibGljIG9mZnNldChvZmZzZXQ6IFYzKTogVm9sdW1lIHtcclxuICAgICAgICB0aGlzLm1pbi5hZGQob2Zmc2V0KTtcclxuICAgICAgICB0aGlzLm1heC5hZGQob2Zmc2V0KTtcclxuICAgICAgICByZXR1cm4gdGhpcztcclxuICAgIH1cclxufVxyXG4iXSwibmFtZXMiOlsiQmxvY2tWb2x1bWUiLCJ3b3JsZCIsIlYzIiwiVm9sdW1lIiwic2V0IiwibWluIiwibWF4IiwiY2xlYW4iLCJzZXREaW1lbnNpb24iLCJkaW1lbnNpb24iLCJnZXREaW1lbnNpb24iLCJmcm9tU2l6ZSIsInNpemUiLCJpc0NlbnRlcmVkIiwiWmVybyIsImhhbGZTaXplIiwiZGl2aWRlIiwiY2xvbmUiLCJtdWx0aXBseSIsIiQiLCJ0b1N0cmluZyIsInN0cmluZyIsImlkIiwidG9KU09OIiwidG9IYXNoIiwiTWF0aFV0aWwiLCJoYXNoIiwidG9CbG9ja1ZvbHVtZSIsInN1YnRyYWN0IiwiY2FwYWNpdHkiLCJwcm9kdWN0IiwiY2VudGVyIiwiYWRkIiwicmFuZG9tUG9pbnQiLCJmcm9tUmFuZG9tIiwib2xkTWluIiwib2xkTWF4IiwidW5kZWZpbmVkIiwiY29udGFpbnMiLCJwb2ludCIsIndpZ2dsZSIsIngiLCJ5IiwieiIsImdyaWQiLCJvZmZzZXQiXSwibWFwcGluZ3MiOiJBQUFBLFNBQVNBLFdBQVcsRUFBc0JDLEtBQUssUUFBUSxvQkFBb0I7QUFDM0UsT0FBT0MsUUFBUSxPQUFPO0FBRVAsTUFBTUM7SUFTakI7Ozs7OztLQU1DLEdBQ0QsQUFBT0MsSUFBSUMsR0FBWSxFQUFFQyxHQUFZLEVBQVU7UUFDM0MsSUFBSSxDQUFDRCxHQUFHLEdBQUcsSUFBSUgsR0FBR0c7UUFDbEIsSUFBSSxDQUFDQyxHQUFHLEdBQUcsSUFBSUosR0FBR0k7UUFDbEIsSUFBSSxDQUFDQyxLQUFLO1FBQ1YsT0FBTyxJQUFJO0lBQ2Y7SUFFQTs7Ozs7S0FLQyxHQUNELEFBQU9DLGFBQWFDLFNBQThCLEVBQVU7UUFDeEQsSUFBSSxPQUFPQSxjQUFjLFVBQVUsSUFBSSxDQUFDQSxTQUFTLEdBQUdSLE1BQU1TLFlBQVksQ0FBQ0Q7YUFDbEUsSUFBSSxDQUFDQSxTQUFTLEdBQUdBO1FBQ3RCLE9BQU8sSUFBSTtJQUNmO0lBRUE7Ozs7S0FJQyxHQUNELE9BQWNFLFNBQVNDLElBQWEsRUFBRUMsYUFBc0IsSUFBSSxFQUFVO1FBQ3RFLElBQUksQ0FBQ0EsWUFBWSxPQUFPLElBQUlWLE9BQU9ELEdBQUdZLElBQUksRUFBRSxJQUFJWixHQUFHVTtRQUVuRCxNQUFNRyxXQUFXLElBQUliLEdBQUdVLE1BQU1JLE1BQU0sQ0FBQztRQUNyQyxPQUFPLElBQUliLE9BQU9ZLFNBQVNFLEtBQUssR0FBR0MsUUFBUSxDQUFDLENBQUMsSUFBSUg7SUFDckQ7SUFFQTs7O0tBR0MsR0FDRCxBQUFPRSxRQUFnQjtRQUNuQixPQUFPLElBQUlkLE9BQU8sSUFBSSxDQUFDRSxHQUFHLEVB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