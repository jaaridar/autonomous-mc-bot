import AbstractVector from "./AbstractVector";
const keys = [
    "x",
    "y"
];
class V2 extends AbstractVector {
    /** Returns the z component (duplicate of y) */ get z() {
        return this.y;
    }
    /** Sets the z component (duplicate of y) */ set z(value) {
        this.y = value;
    }
    /**
     * Returns a new V2 instance representing the zero vector.
     */ static get Zero() {
        return new this(0);
    }
    /**
     * Returns a new V2 instance representing the unit vector.
     */ static get One() {
        return new this(1);
    }
    /**
     * Parses a string representation of a 2D vector.
     * @param s The string to parse.
     * @returns A new V2 instance.
     */ static fromString(s) {
        const [x, y, dimension] = s.split(" ");
        return new this(parseFloat(x), parseFloat(y)).setDimension(dimension);
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
        return new this(x, y);
    }
    constructor(...args){
        super(keys, ...args);
    }
}
export { V2 as default };

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIlYyLnRzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IFZlY3RvcjIgfSBmcm9tIFwiQG1pbmVjcmFmdC9zZXJ2ZXJcIjtcclxuaW1wb3J0IEFic3RyYWN0VmVjdG9yLCB7IFZDb25zdHJ1Y3RvckFyZ3MgfSBmcm9tIFwiLi9BYnN0cmFjdFZlY3RvclwiO1xyXG5cclxuY29uc3Qga2V5cyA9IFtcInhcIiwgXCJ5XCJdIGFzIGNvbnN0O1xyXG5cclxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgVjIgZXh0ZW5kcyBBYnN0cmFjdFZlY3Rvcjx0eXBlb2Yga2V5cz4ge1xyXG4gICAgcHVibGljIHg6IG51bWJlcjtcclxuICAgIHB1YmxpYyB5OiBudW1iZXI7XHJcblxyXG4gICAgLyoqIFJldHVybnMgdGhlIHogY29tcG9uZW50IChkdXBsaWNhdGUgb2YgeSkgKi9cclxuICAgIHB1YmxpYyBnZXQgeigpOiBudW1iZXIge1xyXG4gICAgICAgIHJldHVybiB0aGlzLnk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFNldHMgdGhlIHogY29tcG9uZW50IChkdXBsaWNhdGUgb2YgeSkgKi9cclxuICAgIHB1YmxpYyBzZXQgeih2YWx1ZTogbnVtYmVyKSB7XHJcbiAgICAgICAgdGhpcy55ID0gdmFsdWU7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBSZXR1cm5zIGEgbmV3IFYyIGluc3RhbmNlIHJlcHJlc2VudGluZyB0aGUgemVybyB2ZWN0b3IuXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgZ2V0IFplcm8oKTogVjIge1xyXG4gICAgICAgIHJldHVybiBuZXcgdGhpcygwKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFJldHVybnMgYSBuZXcgVjIgaW5zdGFuY2UgcmVwcmVzZW50aW5nIHRoZSB1bml0IHZlY3Rvci5cclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBnZXQgT25lKCk6IFYyIHtcclxuICAgICAgICByZXR1cm4gbmV3IHRoaXMoMSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKHg6IG51bWJlciwgeTogbnVtYmVyKTtcclxuICAgIHB1YmxpYyBjb25zdHJ1Y3Rvcih2OiBWZWN0b3IyKTtcclxuICAgIHB1YmxpYyBjb25zdHJ1Y3RvcihuOiBudW1iZXIpO1xyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKC4uLmFyZ3M6IFZDb25zdHJ1Y3RvckFyZ3M8dHlwZW9mIGtleXM+KSB7XHJcbiAgICAgICAgc3VwZXIoa2V5cywgLi4uYXJncyk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBQYXJzZXMgYSBzdHJpbmcgcmVwcmVzZW50YXRpb24gb2YgYSAyRCB2ZWN0b3IuXHJcbiAgICAgKiBAcGFyYW0gcyBUaGUgc3RyaW5nIHRvIHBhcnNlLlxyXG4gICAgICogQHJldHVybnMgQSBuZXcgVjIgaW5zdGFuY2UuXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgZnJvbVN0cmluZyhzOiBzdHJpbmcpIHtcclxuICAgICAgICBjb25zdCBbeCwgeSwgZGltZW5zaW9uXSA9IHMuc3BsaXQoXCIgXCIpO1xyXG4gICAgICAgIHJldHVybiBuZXcgdGhpcyhwYXJzZUZsb2F0KHgpLCBwYXJzZUZsb2F0KHkpKS5zZXREaW1lbnNpb24oZGltZW5zaW9uKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIENyZWF0ZXMgYSBuZXcgVjIgaW5zdGFuY2Ugd2l0aCByYW5kb20gdmFsdWVzIHdpdGhpbiB0aGUgc3BlY2lmaWVkIHJhbmdlLlxyXG4gICAgICogQHBhcmFtIG1pbiBUaGUgbWluaW11bSB2YWx1ZXMgZm9yIHRoZSB2ZWN0b3IgY29tcG9uZW50cy5cclxuICAgICAqIEBwYXJhbSBtYXggVGhlIG1heGltdW0gdmFsdWVzIGZvciB0aGUgdmVjdG9yIGNvbXBvbmVudHMuXHJcbiAgICAgKiBAcmV0dXJucyBBIG5ldyBWMiBpbnN0YW5jZS5cclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBmcm9tUmFuZG9tKG1pbjogVmVjdG9yMiwgbWF4OiBWZWN0b3IyKTogVjI7XHJcbiAgICBwdWJsaWMgc3RhdGljIGZyb21SYW5kb20obWluOiBudW1iZXIsIG1heDogbnVtYmVyKTogVjI7XHJcbiAgICBwdWJsaWMgc3RhdGljIGZyb21SYW5kb20oLi4uYXJnczogW251bWJlciwgbnVtYmVyXSB8IFtWZWN0b3IyLCBWZWN0b3IyXSk6IFYyIHtcclxuICAgICAgICBjb25zdCBtaW4gPSBBYnN0cmFjdFZlY3Rvci5hcmdzVG9WZWN0b3Ioa2V5cywgW2FyZ3NbMF1dKTtcclxuICAgICAgICBjb25zdCBtYXggPSBBYnN0cmFjdFZlY3Rvci5hcmdzVG9WZWN0b3Ioa2V5cywgW2FyZ3NbMV1dKTtcclxuICAgICAgICBjb25zdCB4ID0gTWF0aC5yYW5kb20oKSAqIChtYXgueCAtIG1pbi54KSArIG1pbi54O1xyXG4gICAgICAgIGNvbnN0IHkgPSBNYXRoLnJhbmRvbSgpICogKG1heC55IC0gbWluLnkpICsgbWluLnk7XHJcbiAgICAgICAgcmV0dXJuIG5ldyB0aGlzKHgsIHkpO1xyXG4gICAgfVxyXG59XHJcbiJdLCJuYW1lcyI6WyJBYnN0cmFjdFZlY3RvciIsImtleXMiLCJWMiIsInoiLCJ5IiwidmFsdWUiLCJaZXJvIiwiT25lIiwiZnJvbVN0cmluZyIsInMiLCJ4IiwiZGltZW5zaW9uIiwic3BsaXQiLCJwYXJzZUZsb2F0Iiwic2V0RGltZW5zaW9uIiwiZnJvbVJhbmRvbSIsImFyZ3MiLCJtaW4iLCJhcmdzVG9WZWN0b3IiLCJtYXgiLCJNYXRoIiwicmFuZG9tIl0sIm1hcHBpbmdzIjoiQUFDQSxPQUFPQSxvQkFBMEMsbUJBQW1CO0FBRXBFLE1BQU1DLE9BQU87SUFBQztJQUFLO0NBQUk7QUFFUixNQUFNQyxXQUFXRjtJQUk1Qiw2Q0FBNkMsR0FDN0MsSUFBV0csSUFBWTtRQUNuQixPQUFPLElBQUksQ0FBQ0MsQ0FBQztJQUNqQjtJQUVBLDBDQUEwQyxHQUMxQyxJQUFXRCxFQUFFRSxLQUFhLEVBQUU7UUFDeEIsSUFBSSxDQUFDRCxDQUFDLEdBQUdDO0lBQ2I7SUFFQTs7S0FFQyxHQUNELFdBQWtCQyxPQUFXO1FBQ3pCLE9BQU8sSUFBSSxJQUFJLENBQUM7SUFDcEI7SUFFQTs7S0FFQyxHQUNELFdBQWtCQyxNQUFVO1FBQ3hCLE9BQU8sSUFBSSxJQUFJLENBQUM7SUFDcEI7SUFTQTs7OztLQUlDLEdBQ0QsT0FBY0MsV0FBV0MsQ0FBUyxFQUFFO1FBQ2hDLE1BQU0sQ0FBQ0MsR0FBR04sR0FBR08sVUFBVSxHQUFHRixFQUFFRyxLQUFLLENBQUM7UUFDbEMsT0FBTyxJQUFJLElBQUksQ0FBQ0MsV0FBV0gsSUFBSUcsV0FBV1QsSUFBSVUsWUFBWSxDQUFDSDtJQUMvRDtJQVVBLE9BQWNJLFdBQVcsR0FBR0MsSUFBMkMsRUFBTTtRQUN6RSxNQUFNQyxNQUFNakIsZUFBZWtCLFlBQVksQ0FBQ2pCLE1BQU07WUFBQ2UsSUFBSSxDQUFDLEVBQUU7U0FBQztRQUN2RCxNQUFNRyxNQUFNbkIsZUFBZWtCLFlBQVksQ0FBQ2pCLE1BQU07WUFBQ2UsSUFBSSxDQUFDLEVBQUU7U0FBQztRQUN2RCxNQUFNTixJQUFJVSxLQUFLQyxNQUFNLEtBQU1GLENBQUFBLElBQUlULENBQUMsR0FBR08sSUFBSVAsQ0FBQyxBQUFEQSxJQUFLTyxJQUFJUCxDQUFDO1FBQ2pELE1BQU1OLElBQUlnQixLQUFLQyxNQUFNLEtBQU1GLENBQUFBLElBQUlmLENBQUMsR0FBR2EsSUFBSWIsQ0FBQyxBQUFEQSxJQUFLYSxJQUFJYixDQUFDO1FBQ2pELE9BQU8sSUFBSSxJQUFJLENBQUNNLEdBQUdOO0lBQ3ZCO0lBNUJBLFlBQW1CLEdBQUdZLElBQW1DLENBQUU7UUFDdkQsS0FBSyxDQUFDZixTQUFTZTtJQUNuQjtBQTJCSjtBQTVEQSxTQUFxQmQsZ0JBNERwQiJ9