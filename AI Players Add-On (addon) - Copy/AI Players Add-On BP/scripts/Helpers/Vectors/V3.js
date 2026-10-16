import { Direction } from "@minecraft/server";
import AbstractVector from "./AbstractVector";
import V2 from "./V2";
const keys = [
    "x",
    "y",
    "z"
];
class V3 extends AbstractVector {
    /**
     * Returns a new V3 instance representing the zero vector.
     */ static get Zero() {
        return new this(0);
    }
    /**
     * Returns a new V3 instance representing the unit vector.
     */ static get One() {
        return new this(1);
    }
    /**
     * Converts the vector to a string.
     * Reimplemented from AbstractVector for performance reasons.
     * @param precision The number of decimal places to include.
     */ toString(precision, includeDimension = true) {
        let x = this.x;
        let y = this.y;
        let z = this.z;
        if (precision !== undefined) {
            x = x.toFixed(precision);
            y = y.toFixed(precision);
            z = z.toFixed(precision);
        }
        const shouldIncludeDimension = includeDimension && this.dimension !== undefined;
        return shouldIncludeDimension ? `${x} ${y} ${z} ${this.dimension.id}` : `${x} ${y} ${z}`;
    }
    /**
     * Parses a string representation of a 3D vector.
     * @param s The string to parse.
     * @returns A new V3 instance.
     */ static fromString(s) {
        const [x, y, z, dimension] = s.split(" ");
        return new this(parseFloat(x), parseFloat(y), parseFloat(z)).setDimension(dimension);
    }
    /**
     * Creates a new V3 instance from an entity's location.
     * @param entity The entity to get the location from.
     * @param dimension Whether to include the entity's dimension.
     * @returns A new V3 instance.
     */ static fromEntity(entity, dimension = true) {
        if (dimension === true) dimension = entity.dimension;
        return new this(entity.location).setDimension(dimension || undefined);
    }
    /**
     * Creates a new V3 instance from a block's location.
     * @param block The block to get the location from.
     * @param dimension Whether to include the block's dimension or the dimension to set.
     * @returns A new V3 instance.
     */ static fromBlock(block, dimension = true) {
        if (dimension === true) dimension = block.dimension;
        return new this(block.location).setDimension(dimension || undefined);
    }
    /**
     * Creates a new V3 instance from a dimension location.
     * @param location The dimension location to convert.
     * @returns A new V3 instance.
     */ static fromSerializedLocation(location) {
        const vector = new this(location);
        if (location.dimension) vector.setDimension(location.dimension);
        return vector;
    }
    /**
     * Creates a new V3 instance from a direction.
     * @param direction The direction to convert.
     * @returns A new V3 instance.
     */ static fromDirection(direction) {
        if (direction === Direction.North) return new this(0, 0, -1);
        if (direction === Direction.South) return new this(0, 0, 1);
        if (direction === Direction.East) return new this(1, 0, 0);
        if (direction === Direction.West) return new this(-1, 0, 0);
        if (direction === Direction.Up) return new this(0, 1, 0);
        if (direction === Direction.Down) return new this(0, -1, 0);
        return this.Zero;
    }
    /**
     * Creates a new V3 instance from yaw and pitch angles.
     * @remarks When pitch is 0, this effectively becomes fromYaw
     * @param yaw The yaw angle in degrees.
     * @param pitch The pitch angle in degrees.
     * @returns A new V3 instance.
     */ static fromYawPitch(yaw, pitch = 0) {
        const radYaw = MathUtil.degreesToRadians(yaw);
        const radPitch = MathUtil.degreesToRadians(pitch);
        const x = -Math.sin(radYaw) * Math.cos(radPitch);
        const y = Math.sin(radPitch);
        const z = Math.cos(radYaw) * Math.cos(radPitch);
        return new this(x, y, z);
    }
    static fromRandom(...args) {
        const min = AbstractVector.argsToVector(keys, [
            args[0]
        ]);
        const max = AbstractVector.argsToVector(keys, [
            args[1]
        ]);
        const x = Math.random() * (max.x - min.x) + min.x;
        const y = Math.random() * (max.y - min.y) + min.y;
        const z = Math.random() * (max.z - min.z) + min.z;
        return new this(x, y, z);
    }
    /**
     * Converts the vector to a 2D rotation representation.
     * @returns A new V2 instance representing the rotation.
     */ toRotation() {
        const yaw = -Math.atan2(this.x, this.z) * (180 / Math.PI);
        const pitch = Math.asin(this.y) * (180 / Math.PI);
        return new V2(pitch, yaw);
    }
    /**
     * Returns the rotation from this vector to another vector.
     * @param otherVector The other vector to get the rotation from.
     * @returns A new V2 instance representing the rotation.
     */ rotationTo(otherVector) {
        return new V3(otherVector).subtract(this).normalize().toRotation();
    }
    /**
     * Snaps the vector to the nearest grid point.
     * @remarks Mutates this instance.
     * @returns This vector for chaining.
     */ grid() {
        return this.floor().add(0.5, 0, 0.5);
    }
    /**
     * Checks if this vector shares a block with another vector.
     * @param otherVector The other vector to check against.
     * @returns True if the vectors share a block, false otherwise.
     */ sharesBlockWith(otherVector) {
        return this.clone().floor().equals(new V3(otherVector).floor());
    }
    /**
     * Computes the cross product of this vector and another vector.
     * @remarks Mutates this instance.
     * @param otherVector The other vector to cross with.
     * @returns This vector for chaining.
     */ cross(otherVector) {
        const x = this.y * otherVector.z - this.z * otherVector.y;
        const y = this.z * otherVector.x - this.x * otherVector.z;
        const z = this.x * otherVector.y - this.y * otherVector.x;
        return this.set(x, y, z);
    }
    /**
     * Checks if this vector is within a volume.
     * @param volume The volume to check against.
     * @param wiggle An optional amount of wiggle room.
     * @returns True if the vector is within the volume, false otherwise.
     */ inVolume(volume, wiggle = 0) {
        return volume.contains(this, wiggle);
    }
    /**
     * Rotates the vector around the Y-axis by the specified angle.
     * @remarks Mutates this instance.
     * @param theta The angle in radians to rotate the vector.
     * @returns The rotated vector.
     */ rotateYaw(theta) {
        const x = this.x * Math.cos(theta) - this.z * Math.sin(theta);
        const z = this.x * Math.sin(theta) + this.z * Math.cos(theta);
        this.x = x;
        this.z = z;
        return this;
    }
    /**
     * Checks if the vector's location is loaded
     * @returns True if the dimension is loaded, false otherwise.
     */ isLoaded() {
        const dimension = this.dimension ?? overworld;
        return dimension.isChunkLoaded(this) ?? false;
    }
    constructor(...args){
        super(keys, ...args);
    }
}
export { V3 as default };

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIlYzLnRzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEJsb2NrLCBEaW1lbnNpb24sIERpcmVjdGlvbiwgRW50aXR5LCBWZWN0b3IzIH0gZnJvbSBcIkBtaW5lY3JhZnQvc2VydmVyXCI7XHJcbmltcG9ydCB7IFNlcmlhbGl6ZWRMb2NhdGlvbiB9IGZyb20gXCJCaWdCcmFpbi9UeXBlc1wiO1xyXG5pbXBvcnQgQWJzdHJhY3RWZWN0b3IsIHsgVkNvbnN0cnVjdG9yQXJncyB9IGZyb20gXCIuL0Fic3RyYWN0VmVjdG9yXCI7XHJcbmltcG9ydCBWMiBmcm9tIFwiLi9WMlwiO1xyXG5pbXBvcnQgVm9sdW1lIGZyb20gXCIuL1ZvbHVtZVwiO1xyXG5cclxuY29uc3Qga2V5cyA9IFtcInhcIiwgXCJ5XCIsIFwielwiXSBhcyBjb25zdDtcclxuXHJcbmV4cG9ydCBkZWZhdWx0IGNsYXNzIFYzIGV4dGVuZHMgQWJzdHJhY3RWZWN0b3I8dHlwZW9mIGtleXM+IHtcclxuICAgIHB1YmxpYyB4OiBudW1iZXI7XHJcbiAgICBwdWJsaWMgeTogbnVtYmVyO1xyXG4gICAgcHVibGljIHo6IG51bWJlcjtcclxuXHJcbiAgICAvKipcclxuICAgICAqIFJldHVybnMgYSBuZXcgVjMgaW5zdGFuY2UgcmVwcmVzZW50aW5nIHRoZSB6ZXJvIHZlY3Rvci5cclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBnZXQgWmVybygpOiBWMyB7XHJcbiAgICAgICAgcmV0dXJuIG5ldyB0aGlzKDApO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogUmV0dXJucyBhIG5ldyBWMyBpbnN0YW5jZSByZXByZXNlbnRpbmcgdGhlIHVuaXQgdmVjdG9yLlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGdldCBPbmUoKTogVjMge1xyXG4gICAgICAgIHJldHVybiBuZXcgdGhpcygxKTtcclxuICAgIH1cclxuXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IoeDogbnVtYmVyLCB5OiBudW1iZXIsIHo6IG51bWJlcik7XHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IodjogVmVjdG9yMyk7XHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IobjogbnVtYmVyKTtcclxuICAgIHB1YmxpYyBjb25zdHJ1Y3RvciguLi5hcmdzOiBWQ29uc3RydWN0b3JBcmdzPHR5cGVvZiBrZXlzPikge1xyXG4gICAgICAgIHN1cGVyKGtleXMsIC4uLmFyZ3MpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQ29udmVydHMgdGhlIHZlY3RvciB0byBhIHN0cmluZy5cclxuICAgICAqIFJlaW1wbGVtZW50ZWQgZnJvbSBBYnN0cmFjdFZlY3RvciBmb3IgcGVyZm9ybWFuY2UgcmVhc29ucy5cclxuICAgICAqIEBwYXJhbSBwcmVjaXNpb24gVGhlIG51bWJlciBvZiBkZWNpbWFsIHBsYWNlcyB0byBpbmNsdWRlLlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgdG9TdHJpbmcocHJlY2lzaW9uPzogbnVtYmVyLCBpbmNsdWRlRGltZW5zaW9uOiBib29sZWFuID0gdHJ1ZSk6IHN0cmluZyB7XHJcbiAgICAgICAgbGV0IHg6IG51bWJlciB8IHN0cmluZyA9IHRoaXMueDtcclxuICAgICAgICBsZXQgeTogbnVtYmVyIHwgc3RyaW5nID0gdGhpcy55O1xyXG4gICAgICAgIGxldCB6OiBudW1iZXIgfCBzdHJpbmcgPSB0aGlzLno7XHJcblxyXG4gICAgICAgIGlmIChwcmVjaXNpb24gIT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgICAgICB4ID0geC50b0ZpeGVkKHByZWNpc2lvbik7XHJcbiAgICAgICAgICAgIHkgPSB5LnRvRml4ZWQocHJlY2lzaW9uKTtcclxuICAgICAgICAgICAgeiA9IHoudG9GaXhlZChwcmVjaXNpb24pO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc3Qgc2hvdWxkSW5jbHVkZURpbWVuc2lvbiA9IGluY2x1ZGVEaW1lbnNpb24gJiYgdGhpcy5kaW1lbnNpb24gIT09IHVuZGVmaW5lZDtcclxuICAgICAgICByZXR1cm4gc2hvdWxkSW5jbHVkZURpbWVuc2lvbiA/IGAke3h9ICR7eX0gJHt6fSAke3RoaXMuZGltZW5zaW9uIS5pZH1gIDogYCR7eH0gJHt5fSAke3p9YDtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFBhcnNlcyBhIHN0cmluZyByZXByZXNlbnRhdGlvbiBvZiBhIDNEIHZlY3Rvci5cclxuICAgICAqIEBwYXJhbSBzIFRoZSBzdHJpbmcgdG8gcGFyc2UuXHJcbiAgICAgKiBAcmV0dXJucyBBIG5ldyBWMyBpbnN0YW5jZS5cclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBmcm9tU3RyaW5nKHM6IHN0cmluZykge1xyXG4gICAgICAgIGNvbnN0IFt4LCB5LCB6LCBkaW1lbnNpb25dID0gcy5zcGxpdChcIiBcIik7XHJcbiAgICAgICAgcmV0dXJuIG5ldyB0aGlzKHBhcnNlRmxvYXQoeCksIHBhcnNlRmxvYXQoeSksIHBhcnNlRmxvYXQoeikpLnNldERpbWVuc2lvbihkaW1lbnNpb24pO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQ3JlYXRlcyBhIG5ldyBWMyBpbnN0YW5jZSBmcm9tIGFuIGVudGl0eSdzIGxvY2F0aW9uLlxyXG4gICAgICogQHBhcmFtIGVudGl0eSBUaGUgZW50aXR5IHRvIGdldCB0aGUgbG9jYXRpb24gZnJvbS5cclxuICAgICAqIEBwYXJhbSBkaW1lbnNpb24gV2hldGhlciB0byBpbmNsdWRlIHRoZSBlbnRpdHkncyBkaW1lbnNpb24uXHJcbiAgICAgKiBAcmV0dXJucyBBIG5ldyBWMyBpbnN0YW5jZS5cclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBmcm9tRW50aXR5KGVudGl0eTogRW50aXR5LCBkaW1lbnNpb246IGJvb2xlYW4gfCBEaW1lbnNpb24gPSB0cnVlKSB7XHJcbiAgICAgICAgaWYgKGRpbWVuc2lvbiA9PT0gdHJ1ZSkgZGltZW5zaW9uID0gZW50aXR5LmRpbWVuc2lvbjtcclxuICAgICAgICByZXR1cm4gbmV3IHRoaXMoZW50aXR5LmxvY2F0aW9uKS5zZXREaW1lbnNpb24oZGltZW5zaW9uIHx8IHVuZGVmaW5lZCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBDcmVhdGVzIGEgbmV3IFYzIGluc3RhbmNlIGZyb20gYSBibG9jaydzIGxvY2F0aW9uLlxyXG4gICAgICogQHBhcmFtIGJsb2NrIFRoZSBibG9jayB0byBnZXQgdGhlIGxvY2F0aW9uIGZyb20uXHJcbiAgICAgKiBAcGFyYW0gZGltZW5zaW9uIFdoZXRoZXIgdG8gaW5jbHVkZSB0aGUgYmxvY2sncyBkaW1lbnNpb24gb3IgdGhlIGRpbWVuc2lvbiB0byBzZXQuXHJcbiAgICAgKiBAcmV0dXJucyBBIG5ldyBWMyBpbnN0YW5jZS5cclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBmcm9tQmxvY2soYmxvY2s6IEJsb2NrLCBkaW1lbnNpb246IGJvb2xlYW4gfCBEaW1lbnNpb24gPSB0cnVlKSB7XHJcbiAgICAgICAgaWYgKGRpbWVuc2lvbiA9PT0gdHJ1ZSkgZGltZW5zaW9uID0gYmxvY2suZGltZW5zaW9uO1xyXG4gICAgICAgIHJldHVybiBuZXcgdGhpcyhibG9jay5sb2NhdGlvbikuc2V0RGltZW5zaW9uKGRpbWVuc2lvbiB8fCB1bmRlZmluZWQpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQ3JlYXRlcyBhIG5ldyBWMyBpbnN0YW5jZSBmcm9tIGEgZGltZW5zaW9uIGxvY2F0aW9uLlxyXG4gICAgICogQHBhcmFtIGxvY2F0aW9uIFRoZSBkaW1lbnNpb24gbG9jYXRpb24gdG8gY29udmVydC5cclxuICAgICAqIEByZXR1cm5zIEEgbmV3IFYzIGluc3RhbmNlLlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGZyb21TZXJpYWxpemVkTG9jYXRpb24obG9jYXRpb246IFNlcmlhbGl6ZWRMb2NhdGlvbik6IFYzIHtcclxuICAgICAgICBjb25zdCB2ZWN0b3IgPSBuZXcgdGhpcyhsb2NhdGlvbik7XHJcbiAgICAgICAgaWYgKGxvY2F0aW9uLmRpbWVuc2lvbikgdmVjdG9yLnNldERpbWVuc2lvbihsb2NhdGlvbi5kaW1lbnNpb24pO1xyXG4gICAgICAgIHJldHVybiB2ZWN0b3I7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBDcmVhdGVzIGEgbmV3IFYzIGluc3RhbmNlIGZyb20gYSBkaXJlY3Rpb24uXHJcbiAgICAgKiBAcGFyYW0gZGlyZWN0aW9uIFRoZSBkaXJlY3Rpb24gdG8gY29udmVydC5cclxuICAgICAqIEByZXR1cm5zIEEgbmV3IFYzIGluc3RhbmNlLlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGZyb21EaXJlY3Rpb24oZGlyZWN0aW9uOiBEaXJlY3Rpb24pOiBWMyB7XHJcbiAgICAgICAgaWYgKGRpcmVjdGlvbiA9PT0gRGlyZWN0aW9uLk5vcnRoKSByZXR1cm4gbmV3IHRoaXMoMCwgMCwgLTEpO1xyXG4gICAgICAgIGlmIChkaXJlY3Rpb24gPT09IERpcmVjdGlvbi5Tb3V0aCkgcmV0dXJuIG5ldyB0aGlzKDAsIDAsIDEpO1xyXG4gICAgICAgIGlmIChkaXJlY3Rpb24gPT09IERpcmVjdGlvbi5FYXN0KSByZXR1cm4gbmV3IHRoaXMoMSwgMCwgMCk7XHJcbiAgICAgICAgaWYgKGRpcmVjdGlvbiA9PT0gRGlyZWN0aW9uLldlc3QpIHJldHVybiBuZXcgdGhpcygtMSwgMCwgMCk7XHJcbiAgICAgICAgaWYgKGRpcmVjdGlvbiA9PT0gRGlyZWN0aW9uLlVwKSByZXR1cm4gbmV3IHRoaXMoMCwgMSwgMCk7XHJcbiAgICAgICAgaWYgKGRpcmVjdGlvbiA9PT0gRGlyZWN0aW9uLkRvd24pIHJldHVybiBuZXcgdGhpcygwLCAtMSwgMCk7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuWmVybztcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIENyZWF0ZXMgYSBuZXcgVjMgaW5zdGFuY2UgZnJvbSB5YXcgYW5kIHBpdGNoIGFuZ2xlcy5cclxuICAgICAqIEByZW1hcmtzIFdoZW4gcGl0Y2ggaXMgMCwgdGhpcyBlZmZlY3RpdmVseSBiZWNvbWVzIGZyb21ZYXdcclxuICAgICAqIEBwYXJhbSB5YXcgVGhlIHlhdyBhbmdsZSBpbiBkZWdyZWVzLlxyXG4gICAgICogQHBhcmFtIHBpdGNoIFRoZSBwaXRjaCBhbmdsZSBpbiBkZWdyZWVzLlxyXG4gICAgICogQHJldHVybnMgQSBuZXcgVjMgaW5zdGFuY2UuXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgZnJvbVlhd1BpdGNoKHlhdzogbnVtYmVyLCBwaXRjaDogbnVtYmVyID0gMCkge1xyXG4gICAgICAgIGNvbnN0IHJhZFlhdyA9IE1hdGhVdGlsLmRlZ3JlZXNUb1JhZGlhbnMoeWF3KTtcclxuICAgICAgICBjb25zdCByYWRQaXRjaCA9IE1hdGhVdGlsLmRlZ3JlZXNUb1JhZGlhbnMocGl0Y2gpO1xyXG4gICAgICAgIGNvbnN0IHggPSAtTWF0aC5zaW4ocmFkWWF3KSAqIE1hdGguY29zKHJhZFBpdGNoKTtcclxuICAgICAgICBjb25zdCB5ID0gTWF0aC5zaW4ocmFkUGl0Y2gpO1xyXG4gICAgICAgIGNvbnN0IHogPSBNYXRoLmNvcyhyYWRZYXcpICogTWF0aC5jb3MocmFkUGl0Y2gpO1xyXG4gICAgICAgIHJldHVybiBuZXcgdGhpcyh4LCB5LCB6KTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIENyZWF0ZXMgYSBuZXcgVjMgaW5zdGFuY2UgZnJvbSByYW5kb20gdmFsdWVzIHdpdGhpbiB0aGUgc3BlY2lmaWVkIHJhbmdlLlxyXG4gICAgICogQHBhcmFtIG1pbiBUaGUgbWluaW11bSB2YWx1ZXMgZm9yIHRoZSB2ZWN0b3IgY29tcG9uZW50cy5cclxuICAgICAqIEBwYXJhbSBtYXggVGhlIG1heGltdW0gdmFsdWVzIGZvciB0aGUgdmVjdG9yIGNvbXBvbmVudHMuXHJcbiAgICAgKiBAcmV0dXJucyBBIG5ldyBWMyBpbnN0YW5jZS5cclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBmcm9tUmFuZG9tKG1pbjogVmVjdG9yMywgbWF4OiBWZWN0b3IzKTogVjM7XHJcbiAgICBwdWJsaWMgc3RhdGljIGZyb21SYW5kb20obWluOiBudW1iZXIsIG1heDogbnVtYmVyKTogVjM7XHJcbiAgICBwdWJsaWMgc3RhdGljIGZyb21SYW5kb20oLi4uYXJnczogW251bWJlciwgbnVtYmVyXSB8IFtWZWN0b3IzLCBWZWN0b3IzXSk6IFYzIHtcclxuICAgICAgICBjb25zdCBtaW4gPSBBYnN0cmFjdFZlY3Rvci5hcmdzVG9WZWN0b3Ioa2V5cywgW2FyZ3NbMF1dKTtcclxuICAgICAgICBjb25zdCBtYXggPSBBYnN0cmFjdFZlY3Rvci5hcmdzVG9WZWN0b3Ioa2V5cywgW2FyZ3NbMV1dKTtcclxuICAgICAgICBjb25zdCB4ID0gTWF0aC5yYW5kb20oKSAqIChtYXgueCAtIG1pbi54KSArIG1pbi54O1xyXG4gICAgICAgIGNvbnN0IHkgPSBNYXRoLnJhbmRvbSgpICogKG1heC55IC0gbWluLnkpICsgbWluLnk7XHJcbiAgICAgICAgY29uc3QgeiA9IE1hdGgucmFuZG9tKCkgKiAobWF4LnogLSBtaW4ueikgKyBtaW4uejtcclxuICAgICAgICByZXR1cm4gbmV3IHRoaXMoeCwgeSwgeik7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBDb252ZXJ0cyB0aGUgdmVjdG9yIHRvIGEgMkQgcm90YXRpb24gcmVwcmVzZW50YXRpb24uXHJcbiAgICAgKiBAcmV0dXJucyBBIG5ldyBWMiBpbnN0YW5jZSByZXByZXNlbnRpbmcgdGhlIHJvdGF0aW9uLlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgdG9Sb3RhdGlvbigpOiBWMiB7XHJcbiAgICAgICAgY29uc3QgeWF3ID0gLU1hdGguYXRhbjIodGhpcy54LCB0aGlzLnopICogKDE4MCAvIE1hdGguUEkpO1xyXG4gICAgICAgIGNvbnN0IHBpdGNoID0gTWF0aC5hc2luKHRoaXMueSkgKiAoMTgwIC8gTWF0aC5QSSk7XHJcbiAgICAgICAgcmV0dXJuIG5ldyBWMihwaXRjaCwgeWF3KTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFJldHVybnMgdGhlIHJvdGF0aW9uIGZyb20gdGhpcyB2ZWN0b3IgdG8gYW5vdGhlciB2ZWN0b3IuXHJcbiAgICAgKiBAcGFyYW0gb3RoZXJWZWN0b3IgVGhlIG90aGVyIHZlY3RvciB0byBnZXQgdGhlIHJvdGF0aW9uIGZyb20uXHJcbiAgICAgKiBAcmV0dXJucyBBIG5ldyBWMiBpbnN0YW5jZSByZXByZXNlbnRpbmcgdGhlIHJvdGF0aW9uLlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgcm90YXRpb25UbyhvdGhlclZlY3RvcjogVmVjdG9yMyk6IFYyIHtcclxuICAgICAgICByZXR1cm4gbmV3IFYzKG90aGVyVmVjdG9yKS5zdWJ0cmFjdCh0aGlzKS5ub3JtYWxpemUoKS50b1JvdGF0aW9uKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBTbmFwcyB0aGUgdmVjdG9yIHRvIHRoZSBuZWFyZXN0IGdyaWQgcG9pbnQuXHJcbiAgICAgKiBAcmVtYXJrcyBNdXRhdGVzIHRoaXMgaW5zdGFuY2UuXHJcbiAgICAgKiBAcmV0dXJucyBUaGlzIHZlY3RvciBmb3IgY2hhaW5pbmcuXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBncmlkKCkge1xyXG4gICAgICAgIHJldHVybiB0aGlzLmZsb29yKCkuYWRkKDAuNSwgMCwgMC41KTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIENoZWNrcyBpZiB0aGlzIHZlY3RvciBzaGFyZXMgYSBibG9jayB3aXRoIGFub3RoZXIgdmVjdG9yLlxyXG4gICAgICogQHBhcmFtIG90aGVyVmVjdG9yIFRoZSBvdGhlciB2ZWN0b3IgdG8gY2hlY2sgYWdhaW5zdC5cclxuICAgICAqIEByZXR1cm5zIFRydWUgaWYgdGhlIHZlY3RvcnMgc2hhcmUgYSBibG9jaywgZmFsc2Ugb3RoZXJ3aXNlLlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc2hhcmVzQmxvY2tXaXRoKG90aGVyVmVjdG9yOiBWZWN0b3IzKTogYm9vbGVhbiB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuY2xvbmUoKS5mbG9vcigpLmVxdWFscyhuZXcgVjMob3RoZXJWZWN0b3IpLmZsb29yKCkpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQ29tcHV0ZXMgdGhlIGNyb3NzIHByb2R1Y3Qgb2YgdGhpcyB2ZWN0b3IgYW5kIGFub3RoZXIgdmVjdG9yLlxyXG4gICAgICogQHJlbWFya3MgTXV0YXRlcyB0aGlzIGluc3RhbmNlLlxyXG4gICAgICogQHBhcmFtIG90aGVyVmVjdG9yIFRoZSBvdGhlciB2ZWN0b3IgdG8gY3Jvc3Mgd2l0aC5cclxuICAgICAqIEByZXR1cm5zIFRoaXMgdmVjdG9yIGZvciBjaGFpbmluZy5cclxuICAgICAqL1xyXG4gICAgcHVibGljIGNyb3NzKG90aGVyVmVjdG9yOiBWZWN0b3IzKTogVjMge1xyXG4gICAgICAgIGNvbnN0IHggPSB0aGlzLnkgKiBvdGhlclZlY3Rvci56IC0gdGhpcy56ICogb3RoZXJWZWN0b3IueTtcclxuICAgICAgICBjb25zdCB5ID0gdGhpcy56ICogb3RoZXJWZWN0b3IueCAtIHRoaXMueCAqIG90aGVyVmVjdG9yLno7XHJcbiAgICAgICAgY29uc3QgeiA9IHRoaXMueCAqIG90aGVyVmVjdG9yLnkgLSB0aGlzLnkgKiBvdGhlclZlY3Rvci54O1xyXG4gICAgICAgIHJldHVybiB0aGlzLnNldCh4LCB5LCB6KTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIENoZWNrcyBpZiB0aGlzIHZlY3RvciBpcyB3aXRoaW4gYSB2b2x1bWUuXHJcbiAgICAgKiBAcGFyYW0gdm9sdW1lIFRoZSB2b2x1bWUgdG8gY2hlY2sgYWdhaW5zdC5cclxuICAgICAqIEBwYXJhbSB3aWdnbGUgQW4gb3B0aW9uYWwgYW1vdW50IG9mIHdpZ2dsZSByb29tLlxyXG4gICAgICogQHJldHVybnMgVHJ1ZSBpZiB0aGUgdmVjdG9yIGlzIHdpdGhpbiB0aGUgdm9sdW1lLCBmYWxzZSBvdGhlcndpc2UuXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBpblZvbHVtZSh2b2x1bWU6IFZvbHVtZSwgd2lnZ2xlOiBudW1iZXIgPSAwKTogYm9vbGVhbiB7XHJcbiAgICAgICAgcmV0dXJuIHZvbHVtZS5jb250YWlucyh0aGlzLCB3aWdnbGUpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogUm90YXRlcyB0aGUgdmVjdG9yIGFyb3VuZCB0aGUgWS1heGlzIGJ5IHRoZSBzcGVjaWZpZWQgYW5nbGUuXHJcbiAgICAgKiBAcmVtYXJrcyBNdXRhdGVzIHRoaXMgaW5zdGFuY2UuXHJcbiAgICAgKiBAcGFyYW0gdGhldGEgVGhlIGFuZ2xlIGluIHJhZGlhbnMgdG8gcm90YXRlIHRoZSB2ZWN0b3IuXHJcbiAgICAgKiBAcmV0dXJucyBUaGUgcm90YXRlZCB2ZWN0b3IuXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyByb3RhdGVZYXcodGhldGE6IG51bWJlcikge1xyXG4gICAgICAgIGNvbnN0IHggPSB0aGlzLnggKiBNYXRoLmNvcyh0aGV0YSkgLSB0aGlzLnogKiBNYXRoLnNpbih0aGV0YSk7XHJcbiAgICAgICAgY29uc3QgeiA9IHRoaXMueCAqIE1hdGguc2luKHRoZXRhKSArIHRoaXMueiAqIE1hdGguY29zKHRoZXRhKTtcclxuICAgICAgICB0aGlzLnggPSB4O1xyXG4gICAgICAgIHRoaXMueiA9IHo7XHJcbiAgICAgICAgcmV0dXJuIHRoaXM7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBDaGVja3MgaWYgdGhlIHZlY3RvcidzIGxvY2F0aW9uIGlzIGxvYWRlZFxyXG4gICAgICogQHJldHVybnMgVHJ1ZSBpZiB0aGUgZGltZW5zaW9uIGlzIGxvYWRlZCwgZmFsc2Ugb3RoZXJ3aXNlLlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgaXNMb2FkZWQoKTogYm9vbGVhbiB7XHJcbiAgICAgICAgY29uc3QgZGltZW5zaW9uID0gdGhpcy5kaW1lbnNpb24gPz8gb3ZlcndvcmxkO1xyXG4gICAgICAgIHJldHVybiBkaW1lbnNpb24uaXNDaHVua0xvYWRlZCh0aGlzKSA/PyBmYWxzZTtcclxuICAgIH1cclxufVxyXG4iXSwibmFtZXMiOlsiRGlyZWN0aW9uIiwiQWJzdHJhY3RWZWN0b3IiLCJWMiIsImtleXMiLCJWMyIsIlplcm8iLCJPbmUiLCJ0b1N0cmluZyIsInByZWNpc2lvbiIsImluY2x1ZGVEaW1lbnNpb24iLCJ4IiwieSIsInoiLCJ1bmRlZmluZWQiLCJ0b0ZpeGVkIiwic2hvdWxkSW5jbHVkZURpbWVuc2lvbiIsImRpbWVuc2lvbiIsImlkIiwiZnJvbVN0cmluZyIsInMiLCJzcGxpdCIsInBhcnNlRmxvYXQiLCJzZXREaW1lbnNpb24iLCJmcm9tRW50aXR5IiwiZW50aXR5IiwibG9jYXRpb24iLCJmcm9tQmxvY2siLCJibG9jayIsImZyb21TZXJpYWxpemVkTG9jYXRpb24iLCJ2ZWN0b3IiLCJmcm9tRGlyZWN0aW9uIiwiZGlyZWN0aW9uIiwiTm9ydGgiLCJTb3V0aCIsIkVhc3QiLCJXZXN0IiwiVXAiLCJEb3duIiwiZnJvbVlhd1BpdGNoIiwieWF3IiwicGl0Y2giLCJyYWRZYXciLCJNYXRoVXRpbCIsImRlZ3JlZXNUb1JhZGlhbnMiLCJyYWRQaXRjaCIsIk1hdGgiLCJzaW4iLCJjb3MiLCJmcm9tUmFuZG9tIiwiYXJncyIsIm1pbiIsImFyZ3NUb1ZlY3RvciIsIm1heCIsInJhbmRvbSIsInRvUm90YXRpb24iLCJhdGFuMiIsIlBJIiwiYXNpbiIsInJvdGF0aW9uVG8iLCJvdGhlclZlY3RvciIsInN1YnRyYWN0Iiwibm9ybWFsaXplIiwiZ3JpZCIsImZsb29yIiwiYWRkIiwic2hhcmVzQmxvY2tXaXRoIiwiY2xvbmUiLCJlcXVhbHMiLCJjcm9zcyIsInNldCIsImluVm9sdW1lIiwidm9sdW1lIiwid2lnZ2xlIiwiY29udGFpbnMiLCJyb3RhdGVZYXciLCJ0aGV0YSIs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