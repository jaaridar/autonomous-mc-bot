/**
 * SpatialHashGrid2D is a utility class for efficient spatial partitioning and lookup in 2D space.
 * This class allows you to quickly insert and query data associated with locations or volumes in a 2D grid.
 * It is useful for optimizing spatial queries, such as finding all objects within a certain range.
 * Use `SpatialHashGrid.fromLocationEntries` to create a grid from point data, or `SpatialHashGrid.fromVolumeEntries` for volume data.
 * @example
 * ```ts
 * // Create a grid with cell size 10 from point entries
 * const grid = SpatialHashGrid.fromLocationEntries(10, [
 *   { location: { x: 5, y: 0, z: 5 }, data: "foo" },
 *   { location: { x: 15, y: 0, z: 15 }, data: "bar" }
 * ]);
 * // Query for entries near (10, 10) within a range of 5
 * const results = grid.getEntriesAt(10, 10, 5);
 * ``` */ class _SpatialHashGrid {
    /**
     * Creates a spatial hash grid from an array of point entries.
     * @param cellSize - The size of each grid cell.
     * @param entries - Array of entries with a location and associated data.
     * @returns A new instance of SpatialHashGrid2D.
     */ static fromLocationEntries(cellSize, entries) {
        const grid = new _SpatialHashGrid(cellSize);
        grid.fillHashLocation(entries);
        return grid;
    }
    /**
     * Creates a spatial hash grid from an array of volume entries.
     * @param cellSize - The size of each grid cell.
     * @param entries - Array of entries with a volume and associated data.
     * @returns A new instance of SpatialHashGrid2D.
     */ static fromVolumeEntries(cellSize, entries) {
        const grid = new _SpatialHashGrid(cellSize);
        grid.fillHash(entries);
        return grid;
    }
    /**
     * Retrieves all entries within a given range of the specified (x, y) coordinate.
     * @param x - The x coordinate to query.
     * @param y - The y coordinate to query.
     * @param range - The search range (default is 0, which returns only the cell containing (x, y)).
     * @returns An array of data entries found within the specified range.
     */ getEntriesAt(x, y, range = 0) {
        const entries = new Set();
        const minX = x - range;
        const minY = y - range;
        const maxX = x + range;
        const maxY = y + range;
        for(let i = minX; i < maxX; i += this.cellSize){
            for(let j = minY; j < maxY; j += this.cellSize){
                const key = this.hashKey(i, j);
                const set = this.hashMap.get(key);
                if (set) {
                    for (const entry of set){
                        entries.add(entry);
                    }
                }
            }
        }
        return Array.from(entries);
    }
    fillHash(entries) {
        for (const entry of entries){
            const { min, max } = entry.volume;
            for(let x = min.x; x < max.x; x += this.cellSize){
                for(let z = min.z; z < max.z; z += this.cellSize){
                    this.addEntry(x, z, entry.data);
                }
            }
        }
    }
    fillHashLocation(entries) {
        for (const entry of entries){
            const { x: x, z: z } = entry.location;
            this.addEntry(x, z, entry.data);
        }
    }
    addEntry(x, y, data) {
        const key = this.hashKey(x, y);
        const set = this.hashMap.get(key);
        if (set) set.add(data);
        else this.hashMap.set(key, new Set([
            data
        ]));
    }
    hashKey(x, y) {
        const width = Math.floor(x / this.cellSize);
        const height = Math.floor(y / this.cellSize);
        return width + height * 100000;
    }
    constructor(cellSize){
        this.hashMap = new Map();
        this.cellSize = cellSize;
    }
}
globalThis.SpatialHashGrid = _SpatialHashGrid;
export { };

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIlNwYXRpYWxIYXNoR3JpZDJELnRzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IFZlY3RvcjMgfSBmcm9tIFwiQG1pbmVjcmFmdC9zZXJ2ZXJcIjtcclxuaW1wb3J0IFZvbHVtZSBmcm9tIFwiSGVscGVycy9WZWN0b3JzL1ZvbHVtZVwiO1xyXG5cclxuZXhwb3J0IGludGVyZmFjZSBTdGF0aWNWb2x1bWVFbnRyeTxUPiB7XHJcbiAgICB2b2x1bWU6IFZvbHVtZTtcclxuICAgIGRhdGE6IFQ7XHJcbn1cclxuXHJcbmV4cG9ydCBpbnRlcmZhY2UgU3RhdGljTG9jYXRpb25FbnRyeTxUPiB7XHJcbiAgICBsb2NhdGlvbjogVmVjdG9yMztcclxuICAgIGRhdGE6IFQ7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBTcGF0aWFsSGFzaEdyaWQyRCBpcyBhIHV0aWxpdHkgY2xhc3MgZm9yIGVmZmljaWVudCBzcGF0aWFsIHBhcnRpdGlvbmluZyBhbmQgbG9va3VwIGluIDJEIHNwYWNlLlxyXG4gKiBUaGlzIGNsYXNzIGFsbG93cyB5b3UgdG8gcXVpY2tseSBpbnNlcnQgYW5kIHF1ZXJ5IGRhdGEgYXNzb2NpYXRlZCB3aXRoIGxvY2F0aW9ucyBvciB2b2x1bWVzIGluIGEgMkQgZ3JpZC5cclxuICogSXQgaXMgdXNlZnVsIGZvciBvcHRpbWl6aW5nIHNwYXRpYWwgcXVlcmllcywgc3VjaCBhcyBmaW5kaW5nIGFsbCBvYmplY3RzIHdpdGhpbiBhIGNlcnRhaW4gcmFuZ2UuXHJcbiAqIFVzZSBgU3BhdGlhbEhhc2hHcmlkLmZyb21Mb2NhdGlvbkVudHJpZXNgIHRvIGNyZWF0ZSBhIGdyaWQgZnJvbSBwb2ludCBkYXRhLCBvciBgU3BhdGlhbEhhc2hHcmlkLmZyb21Wb2x1bWVFbnRyaWVzYCBmb3Igdm9sdW1lIGRhdGEuXHJcbiAqIEBleGFtcGxlXHJcbiAqIGBgYHRzXHJcbiAqIC8vIENyZWF0ZSBhIGdyaWQgd2l0aCBjZWxsIHNpemUgMTAgZnJvbSBwb2ludCBlbnRyaWVzXHJcbiAqIGNvbnN0IGdyaWQgPSBTcGF0aWFsSGFzaEdyaWQuZnJvbUxvY2F0aW9uRW50cmllcygxMCwgW1xyXG4gKiAgIHsgbG9jYXRpb246IHsgeDogNSwgeTogMCwgejogNSB9LCBkYXRhOiBcImZvb1wiIH0sXHJcbiAqICAgeyBsb2NhdGlvbjogeyB4OiAxNSwgeTogMCwgejogMTUgfSwgZGF0YTogXCJiYXJcIiB9XHJcbiAqIF0pO1xyXG4gKiAvLyBRdWVyeSBmb3IgZW50cmllcyBuZWFyICgxMCwgMTApIHdpdGhpbiBhIHJhbmdlIG9mIDVcclxuICogY29uc3QgcmVzdWx0cyA9IGdyaWQuZ2V0RW50cmllc0F0KDEwLCAxMCwgNSk7XHJcbiAqIGBgYCAqL1xyXG5jbGFzcyBfU3BhdGlhbEhhc2hHcmlkPFQ+IHtcclxuICAgIHByaXZhdGUgcmVhZG9ubHkgaGFzaE1hcCA9IG5ldyBNYXA8bnVtYmVyLCBTZXQ8VD4+KCk7XHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGNlbGxTaXplOiBudW1iZXI7XHJcblxyXG4gICAgcHJpdmF0ZSBjb25zdHJ1Y3RvcihjZWxsU2l6ZTogbnVtYmVyKSB7XHJcbiAgICAgICAgdGhpcy5jZWxsU2l6ZSA9IGNlbGxTaXplO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQ3JlYXRlcyBhIHNwYXRpYWwgaGFzaCBncmlkIGZyb20gYW4gYXJyYXkgb2YgcG9pbnQgZW50cmllcy5cclxuICAgICAqIEBwYXJhbSBjZWxsU2l6ZSAtIFRoZSBzaXplIG9mIGVhY2ggZ3JpZCBjZWxsLlxyXG4gICAgICogQHBhcmFtIGVudHJpZXMgLSBBcnJheSBvZiBlbnRyaWVzIHdpdGggYSBsb2NhdGlvbiBhbmQgYXNzb2NpYXRlZCBkYXRhLlxyXG4gICAgICogQHJldHVybnMgQSBuZXcgaW5zdGFuY2Ugb2YgU3BhdGlhbEhhc2hHcmlkMkQuXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgZnJvbUxvY2F0aW9uRW50cmllczxUPihjZWxsU2l6ZTogbnVtYmVyLCBlbnRyaWVzOiBTdGF0aWNMb2NhdGlvbkVudHJ5PFQ+W10pIHtcclxuICAgICAgICBjb25zdCBncmlkID0gbmV3IF9TcGF0aWFsSGFzaEdyaWQ8VD4oY2VsbFNpemUpO1xyXG4gICAgICAgIGdyaWQuZmlsbEhhc2hMb2NhdGlvbihlbnRyaWVzKTtcclxuICAgICAgICByZXR1cm4gZ3JpZDtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIENyZWF0ZXMgYSBzcGF0aWFsIGhhc2ggZ3JpZCBmcm9tIGFuIGFycmF5IG9mIHZvbHVtZSBlbnRyaWVzLlxyXG4gICAgICogQHBhcmFtIGNlbGxTaXplIC0gVGhlIHNpemUgb2YgZWFjaCBncmlkIGNlbGwuXHJcbiAgICAgKiBAcGFyYW0gZW50cmllcyAtIEFycmF5IG9mIGVudHJpZXMgd2l0aCBhIHZvbHVtZSBhbmQgYXNzb2NpYXRlZCBkYXRhLlxyXG4gICAgICogQHJldHVybnMgQSBuZXcgaW5zdGFuY2Ugb2YgU3BhdGlhbEhhc2hHcmlkMkQuXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgZnJvbVZvbHVtZUVudHJpZXM8VD4oY2VsbFNpemU6IG51bWJlciwgZW50cmllczogU3RhdGljVm9sdW1lRW50cnk8VD5bXSkge1xyXG4gICAgICAgIGNvbnN0IGdyaWQgPSBuZXcgX1NwYXRpYWxIYXNoR3JpZDxUPihjZWxsU2l6ZSk7XHJcbiAgICAgICAgZ3JpZC5maWxsSGFzaChlbnRyaWVzKTtcclxuICAgICAgICByZXR1cm4gZ3JpZDtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFJldHJpZXZlcyBhbGwgZW50cmllcyB3aXRoaW4gYSBnaXZlbiByYW5nZSBvZiB0aGUgc3BlY2lmaWVkICh4LCB5KSBjb29yZGluYXRlLlxyXG4gICAgICogQHBhcmFtIHggLSBUaGUgeCBjb29yZGluYXRlIHRvIHF1ZXJ5LlxyXG4gICAgICogQHBhcmFtIHkgLSBUaGUgeSBjb29yZGluYXRlIHRvIHF1ZXJ5LlxyXG4gICAgICogQHBhcmFtIHJhbmdlIC0gVGhlIHNlYXJjaCByYW5nZSAoZGVmYXVsdCBpcyAwLCB3aGljaCByZXR1cm5zIG9ubHkgdGhlIGNlbGwgY29udGFpbmluZyAoeCwgeSkpLlxyXG4gICAgICogQHJldHVybnMgQW4gYXJyYXkgb2YgZGF0YSBlbnRyaWVzIGZvdW5kIHdpdGhpbiB0aGUgc3BlY2lmaWVkIHJhbmdlLlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgZ2V0RW50cmllc0F0KHg6IG51bWJlciwgeTogbnVtYmVyLCByYW5nZTogbnVtYmVyID0gMCk6IFRbXSB7XHJcbiAgICAgICAgY29uc3QgZW50cmllcyA9IG5ldyBTZXQ8VD4oKTtcclxuICAgICAgICBjb25zdCBtaW5YID0geCAtIHJhbmdlO1xyXG4gICAgICAgIGNvbnN0IG1pblkgPSB5IC0gcmFuZ2U7XHJcbiAgICAgICAgY29uc3QgbWF4WCA9IHggKyByYW5nZTtcclxuICAgICAgICBjb25zdCBtYXhZID0geSArIHJhbmdlO1xyXG5cclxuICAgICAgICBmb3IgKGxldCBpID0gbWluWDsgaSA8IG1heFg7IGkgKz0gdGhpcy5jZWxsU2l6ZSkge1xyXG4gICAgICAgICAgICBmb3IgKGxldCBqID0gbWluWTsgaiA8IG1heFk7IGogKz0gdGhpcy5jZWxsU2l6ZSkge1xyXG4gICAgICAgICAgICAgICAgY29uc3Qga2V5ID0gdGhpcy5oYXNoS2V5KGksIGopO1xyXG4gICAgICAgICAgICAgICAgY29uc3Qgc2V0ID0gdGhpcy5oYXNoTWFwLmdldChrZXkpO1xyXG4gICAgICAgICAgICAgICAgaWYgKHNldCkge1xyXG4gICAgICAgICAgICAgICAgICAgIGZvciAoY29uc3QgZW50cnkgb2Ygc2V0KSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGVudHJpZXMuYWRkKGVudHJ5KTtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHJldHVybiBBcnJheS5mcm9tKGVudHJpZXMpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZmlsbEhhc2goZW50cmllczogU3RhdGljVm9sdW1lRW50cnk8VD5bXSkge1xyXG4gICAgICAgIGZvciAoY29uc3QgZW50cnkgb2YgZW50cmllcykge1xyXG4gICAgICAgICAgICBjb25zdCB7IG1pbiwgbWF4IH0gPSBlbnRyeS52b2x1bWU7XHJcblxyXG4gICAgICAgICAgICBmb3IgKGxldCB4ID0gbWluLng7IHggPCBtYXgueDsgeCArPSB0aGlzLmNlbGxTaXplKSB7XHJcbiAgICAgICAgICAgICAgICBmb3IgKGxldCB6ID0gbWluLno7IHogPCBtYXguejsgeiArPSB0aGlzLmNlbGxTaXplKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5hZGRFbnRyeSh4LCB6LCBlbnRyeS5kYXRhKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGZpbGxIYXNoTG9jYXRpb24oZW50cmllczogU3RhdGljTG9jYXRpb25FbnRyeTxUPltdKSB7XHJcbiAgICAgICAgZm9yIChjb25zdCBlbnRyeSBvZiBlbnRyaWVzKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHsgeDogeCwgejogeiB9ID0gZW50cnkubG9jYXRpb247XHJcbiAgICAgICAgICAgIHRoaXMuYWRkRW50cnkoeCwgeiwgZW50cnkuZGF0YSk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgYWRkRW50cnkoeDogbnVtYmVyLCB5OiBudW1iZXIsIGRhdGE6IFQpIHtcclxuICAgICAgICBjb25zdCBrZXkgPSB0aGlzLmhhc2hLZXkoeCwgeSk7XHJcbiAgICAgICAgY29uc3Qgc2V0ID0gdGhpcy5oYXNoTWFwLmdldChrZXkpO1xyXG4gICAgICAgIGlmIChzZXQpIHNldC5hZGQoZGF0YSk7XHJcbiAgICAgICAgZWxzZSB0aGlzLmhhc2hNYXAuc2V0KGtleSwgbmV3IFNldChbZGF0YV0pKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGhhc2hLZXkoeDogbnVtYmVyLCB5OiBudW1iZXIpIHtcclxuICAgICAgICBjb25zdCB3aWR0aCA9IE1hdGguZmxvb3IoeCAvIHRoaXMuY2VsbFNpemUpO1xyXG4gICAgICAgIGNvbnN0IGhlaWdodCA9IE1hdGguZmxvb3IoeSAvIHRoaXMuY2VsbFNpemUpO1xyXG4gICAgICAgIHJldHVybiB3aWR0aCArIGhlaWdodCAqIDEwMDAwMDtcclxuICAgIH1cclxufVxyXG5cclxuZGVjbGFyZSBnbG9iYWwge1xyXG4gICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXZhclxyXG4gICAgdmFyIFNwYXRpYWxIYXNoR3JpZDogT21pdDx0eXBlb2YgX1NwYXRpYWxIYXNoR3JpZCwgXCJwcm90b3R5cGVcIj47XHJcbn1cclxuZ2xvYmFsVGhpcy5TcGF0aWFsSGFzaEdyaWQgPSBfU3BhdGlhbEhhc2hHcmlkO1xyXG4iXSwibmFtZXMiOlsiX1NwYXRpYWxIYXNoR3JpZCIsImZyb21Mb2NhdGlvbkVudHJpZXMiLCJjZWxsU2l6ZSIsImVudHJpZXMiLCJncmlkIiwiZmlsbEhhc2hMb2NhdGlvbiIsImZyb21Wb2x1bWVFbnRyaWVzIiwiZmlsbEhhc2giLCJnZXRFbnRyaWVzQXQiLCJ4IiwieSIsInJhbmdlIiwiU2V0IiwibWluWCIsIm1pblkiLCJtYXhYIiwibWF4WSIsImkiLCJqIiwia2V5IiwiaGFzaEtleSIsInNldCIsImhhc2hNYXAiLCJnZXQiLCJlbnRyeSIsImFkZCIsIkFycmF5IiwiZnJvbSIsIm1pbiIsIm1heCIsInZvbHVtZSIsInoiLCJhZGRFbnRyeSIsImRhdGEiLCJsb2NhdGlvbiIsIndpZHRoIiwiTWF0aCIsImZsb29yIiwiaGVpZ2h0IiwiTWFwIiwiZ2xvYmFsVGhpcyIsIlNwYXRpYWxIYXNoR3JpZCJdLCJtYXBwaW5ncyI6IkFBYUE7Ozs7Ozs7Ozs7Ozs7O09BY08sR0FDUCxNQUFNQTtJQVFGOzs7OztL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