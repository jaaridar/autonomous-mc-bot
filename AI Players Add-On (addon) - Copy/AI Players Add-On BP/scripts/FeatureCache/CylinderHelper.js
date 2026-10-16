import FeatureCacheData from "Data/FeatureCacheData";
import V3 from "Helpers/Vectors/V3";
import Volume from "Helpers/Vectors/Volume";
class CylinderHelper {
    /** Offsets where `max(|dx|, |dy|, |dz|) === shell` — the surface of a hollow cube, computed once and reused. */ static getShellOffsets(shell) {
        const cached = CylinderHelper.shellOffsetCache[shell];
        if (cached) return cached;
        const offsets = [];
        for(let dx = -shell; dx <= shell; dx++){
            for(let dy = -shell; dy <= shell; dy++){
                const base = Math.max(Math.abs(dx), Math.abs(dy));
                for(let dz = -shell; dz <= shell; dz++){
                    if (Math.max(base, Math.abs(dz)) === shell) offsets.push([
                        dx,
                        dy,
                        dz
                    ]);
                }
            }
        }
        CylinderHelper.shellOffsetCache[shell] = offsets;
        return offsets;
    }
    /** If the subchunk is populated, adds it to `results` with its closest-possible distance to `ctx.center`.
     * Using raw numbers rather than V3 for perf reasons
     */ static tryAddSubchunk(x, y, z, ctx, results) {
        // Skip subchunks with no features before doing any distance math or allocation
        const key = `${x} ${y} ${z} minecraft:overworld`;
        if (!ctx.featuresBySubchunk.has(key)) return;
        const subchunkMinX = x * ctx.size;
        const subchunkMinY = y * ctx.size;
        const subchunkMinZ = z * ctx.size;
        const subchunkMaxX = subchunkMinX + ctx.size - 1;
        const subchunkMaxY = subchunkMinY + ctx.size - 1;
        const subchunkMaxZ = subchunkMinZ + ctx.size - 1;
        const closestX = Math.min(Math.max(ctx.center.x, subchunkMinX), subchunkMaxX);
        const closestY = Math.min(Math.max(ctx.center.y, subchunkMinY), subchunkMaxY);
        const closestZ = Math.min(Math.max(ctx.center.z, subchunkMinZ), subchunkMaxZ);
        const dx = ctx.center.x - closestX;
        const dy = ctx.center.y - closestY;
        const dz = ctx.center.z - closestZ;
        // Closest possible distance to any point in the subchunk
        const minDistance = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const subchunk = new V3(x, y, z).setDimension(overworld);
        results.push({
            object: subchunk,
            distance: minDistance
        });
    }
    /** Collects every populated subchunk exactly at Chebyshev distance `shell` from `centerSubchunk`, clamped to bounds. */ static collectShell(shell, centerSubchunk, ctx, results) {
        const { min, max } = ctx.bounds;
        for (const [dx, dy, dz] of CylinderHelper.getShellOffsets(shell)){
            const x = centerSubchunk.x + dx;
            const y = centerSubchunk.y + dy;
            const z = centerSubchunk.z + dz;
            if (x < min.x || x > max.x || y < min.y || y > max.y || z < min.z || z > max.z) continue;
            CylinderHelper.tryAddSubchunk(x, y, z, ctx, results);
        }
    }
    /** Yields populated subchunks within the cylinder, nearest-shell-first, expanding outward from `center`. */ static *getSubchunksInCylinder(center, cylinder, featuresBySubchunk) {
        const size = FeatureCacheData.SubchunkSize;
        const centerSubchunk = center.$.divide(size).floor();
        const shellRadius = Math.ceil(cylinder.radius / size);
        const yMin = Math.max(Math.floor((center.y + cylinder.yOffsetRange[0]) / size), Math.floor(FeatureCacheData.ScanMinHeight / size));
        const yMax = Math.min(Math.ceil((center.y + cylinder.yOffsetRange[1]) / size), Math.ceil(FeatureCacheData.ScanMaxHeight / size));
        if (yMin > yMax) return;
        const ctx = {
            center,
            size,
            featuresBySubchunk,
            bounds: new Volume({
                x: centerSubchunk.x - shellRadius,
                y: yMin,
                z: centerSubchunk.z - shellRadius
            }, {
                x: centerSubchunk.x + shellRadius,
                y: yMax,
                z: centerSubchunk.z + shellRadius
            })
        };
        // Largest Chebyshev distance that could still contain an in-bound subchunk
        const maxShell = Math.max(shellRadius, centerSubchunk.y - yMin, yMax - centerSubchunk.y, 0);
        for(let shell = 0; shell <= maxShell; shell++){
            const shellSubchunks = [];
            CylinderHelper.collectShell(shell, centerSubchunk, ctx, shellSubchunks);
            if (shellSubchunks.length === 0) continue;
            shellSubchunks.sort((a, b)=>a.distance - b.distance);
            yield* shellSubchunks;
        }
    }
}
/** Relative (dx, dy, dz) offsets sitting exactly on a shell's surface, cached by shell radius. */ CylinderHelper.shellOffsetCache = [];
export { CylinderHelper as default };

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkN5bGluZGVySGVscGVyLnRzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBGZWF0dXJlQ2FjaGVEYXRhIGZyb20gXCJEYXRhL0ZlYXR1cmVDYWNoZURhdGFcIjtcclxuaW1wb3J0IFYzIGZyb20gXCJIZWxwZXJzL1ZlY3RvcnMvVjNcIjtcclxuaW1wb3J0IFZvbHVtZSBmcm9tIFwiSGVscGVycy9WZWN0b3JzL1ZvbHVtZVwiO1xyXG5cclxuaW1wb3J0IHsgRmVhdHVyZSwgT2JqZWN0RGlzdGFuY2UsIFNlYXJjaEN5bGluZGVyIH0gZnJvbSBcIi4vVHlwZXNcIjtcclxuXHJcbi8qKiBTaGFyZWQsIHJlYWQtb25seSBzZWFyY2ggcGFyYW1ldGVycyB0aHJlYWRlZCB0aHJvdWdoIHRoZSBzaGVsbC1jb2xsZWN0aW9uIGhlbHBlcnMgYmVsb3cuICovXHJcbmludGVyZmFjZSBTdWJjaHVua1NlYXJjaENvbnRleHQge1xyXG4gICAgY2VudGVyOiBWMztcclxuICAgIHNpemU6IG51bWJlcjtcclxuICAgIGZlYXR1cmVzQnlTdWJjaHVuazogTWFwPHN0cmluZywgRmVhdHVyZVtdPjtcclxuICAgIGJvdW5kczogVm9sdW1lO1xyXG59XHJcblxyXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBDeWxpbmRlckhlbHBlciB7XHJcbiAgICAvKiogUmVsYXRpdmUgKGR4LCBkeSwgZHopIG9mZnNldHMgc2l0dGluZyBleGFjdGx5IG9uIGEgc2hlbGwncyBzdXJmYWNlLCBjYWNoZWQgYnkgc2hlbGwgcmFkaXVzLiAqL1xyXG4gICAgcHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgc2hlbGxPZmZzZXRDYWNoZTogW251bWJlciwgbnVtYmVyLCBudW1iZXJdW11bXSA9IFtdO1xyXG5cclxuICAgIC8qKiBPZmZzZXRzIHdoZXJlIGBtYXgofGR4fCwgfGR5fCwgfGR6fCkgPT09IHNoZWxsYCDigJQgdGhlIHN1cmZhY2Ugb2YgYSBob2xsb3cgY3ViZSwgY29tcHV0ZWQgb25jZSBhbmQgcmV1c2VkLiAqL1xyXG4gICAgcHJpdmF0ZSBzdGF0aWMgZ2V0U2hlbGxPZmZzZXRzKHNoZWxsOiBudW1iZXIpOiByZWFkb25seSBbbnVtYmVyLCBudW1iZXIsIG51bWJlcl1bXSB7XHJcbiAgICAgICAgY29uc3QgY2FjaGVkID0gQ3lsaW5kZXJIZWxwZXIuc2hlbGxPZmZzZXRDYWNoZVtzaGVsbF07XHJcbiAgICAgICAgaWYgKGNhY2hlZCkgcmV0dXJuIGNhY2hlZDtcclxuXHJcbiAgICAgICAgY29uc3Qgb2Zmc2V0czogW251bWJlciwgbnVtYmVyLCBudW1iZXJdW10gPSBbXTtcclxuICAgICAgICBmb3IgKGxldCBkeCA9IC1zaGVsbDsgZHggPD0gc2hlbGw7IGR4KyspIHtcclxuICAgICAgICAgICAgZm9yIChsZXQgZHkgPSAtc2hlbGw7IGR5IDw9IHNoZWxsOyBkeSsrKSB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBiYXNlID0gTWF0aC5tYXgoTWF0aC5hYnMoZHgpLCBNYXRoLmFicyhkeSkpO1xyXG4gICAgICAgICAgICAgICAgZm9yIChsZXQgZHogPSAtc2hlbGw7IGR6IDw9IHNoZWxsOyBkeisrKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKE1hdGgubWF4KGJhc2UsIE1hdGguYWJzKGR6KSkgPT09IHNoZWxsKSBvZmZzZXRzLnB1c2goW2R4LCBkeSwgZHpdKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgQ3lsaW5kZXJIZWxwZXIuc2hlbGxPZmZzZXRDYWNoZVtzaGVsbF0gPSBvZmZzZXRzO1xyXG4gICAgICAgIHJldHVybiBvZmZzZXRzO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBJZiB0aGUgc3ViY2h1bmsgaXMgcG9wdWxhdGVkLCBhZGRzIGl0IHRvIGByZXN1bHRzYCB3aXRoIGl0cyBjbG9zZXN0LXBvc3NpYmxlIGRpc3RhbmNlIHRvIGBjdHguY2VudGVyYC5cclxuICAgICAqIFVzaW5nIHJhdyBudW1iZXJzIHJhdGhlciB0aGFuIFYzIGZvciBwZXJmIHJlYXNvbnNcclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBzdGF0aWMgdHJ5QWRkU3ViY2h1bmsoeDogbnVtYmVyLCB5OiBudW1iZXIsIHo6IG51bWJlciwgY3R4OiBTdWJjaHVua1NlYXJjaENvbnRleHQsIHJlc3VsdHM6IE9iamVjdERpc3RhbmNlPFYzPltdKTogdm9pZCB7XHJcbiAgICAgICAgLy8gU2tpcCBzdWJjaHVua3Mgd2l0aCBubyBmZWF0dXJlcyBiZWZvcmUgZG9pbmcgYW55IGRpc3RhbmNlIG1hdGggb3IgYWxsb2NhdGlvblxyXG4gICAgICAgIGNvbnN0IGtleSA9IGAke3h9ICR7eX0gJHt6fSBtaW5lY3JhZnQ6b3ZlcndvcmxkYDtcclxuICAgICAgICBpZiAoIWN0eC5mZWF0dXJlc0J5U3ViY2h1bmsuaGFzKGtleSkpIHJldHVybjtcclxuXHJcbiAgICAgICAgY29uc3Qgc3ViY2h1bmtNaW5YID0geCAqIGN0eC5zaXplO1xyXG4gICAgICAgIGNvbnN0IHN1YmNodW5rTWluWSA9IHkgKiBjdHguc2l6ZTtcclxuICAgICAgICBjb25zdCBzdWJjaHVua01pblogPSB6ICogY3R4LnNpemU7XHJcblxyXG4gICAgICAgIGNvbnN0IHN1YmNodW5rTWF4WCA9IHN1YmNodW5rTWluWCArIGN0eC5zaXplIC0gMTtcclxuICAgICAgICBjb25zdCBzdWJjaHVua01heFkgPSBzdWJjaHVua01pblkgKyBjdHguc2l6ZSAtIDE7XHJcbiAgICAgICAgY29uc3Qgc3ViY2h1bmtNYXhaID0gc3ViY2h1bmtNaW5aICsgY3R4LnNpemUgLSAxO1xyXG5cclxuICAgICAgICBjb25zdCBjbG9zZXN0WCA9IE1hdGgubWluKE1hdGgubWF4KGN0eC5jZW50ZXIueCwgc3ViY2h1bmtNaW5YKSwgc3ViY2h1bmtNYXhYKTtcclxuICAgICAgICBjb25zdCBjbG9zZXN0WSA9IE1hdGgubWluKE1hdGgubWF4KGN0eC5jZW50ZXIueSwgc3ViY2h1bmtNaW5ZKSwgc3ViY2h1bmtNYXhZKTtcclxuICAgICAgICBjb25zdCBjbG9zZXN0WiA9IE1hdGgubWluKE1hdGgubWF4KGN0eC5jZW50ZXIueiwgc3ViY2h1bmtNaW5aKSwgc3ViY2h1bmtNYXhaKTtcclxuXHJcbiAgICAgICAgY29uc3QgZHggPSBjdHguY2VudGVyLnggLSBjbG9zZXN0WDtcclxuICAgICAgICBjb25zdCBkeSA9IGN0eC5jZW50ZXIueSAtIGNsb3Nlc3RZO1xyXG4gICAgICAgIGNvbnN0IGR6ID0gY3R4LmNlbnRlci56IC0gY2xvc2VzdFo7XHJcblxyXG4gICAgICAgIC8vIENsb3Nlc3QgcG9zc2libGUgZGlzdGFuY2UgdG8gYW55IHBvaW50IGluIHRoZSBzdWJjaHVua1xyXG4gICAgICAgIGNvbnN0IG1pbkRpc3RhbmNlID0gTWF0aC5zcXJ0KGR4ICogZHggKyBkeSAqIGR5ICsgZHogKiBkeik7XHJcblxyXG4gICAgICAgIGNvbnN0IHN1YmNodW5rID0gbmV3IFYzKHgsIHksIHopLnNldERpbWVuc2lvbihvdmVyd29ybGQpO1xyXG4gICAgICAgIHJlc3VsdHMucHVzaCh7IG9iamVjdDogc3ViY2h1bmssIGRpc3RhbmNlOiBtaW5EaXN0YW5jZSB9KTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogQ29sbGVjdHMgZXZlcnkgcG9wdWxhdGVkIHN1YmNodW5rIGV4YWN0bHkgYXQgQ2hlYnlzaGV2IGRpc3RhbmNlIGBzaGVsbGAgZnJvbSBgY2VudGVyU3ViY2h1bmtgLCBjbGFtcGVkIHRvIGJvdW5kcy4gKi9cclxuICAgIHByaXZhdGUgc3RhdGljIGNvbGxlY3RTaGVsbChzaGVsbDogbnVtYmVyLCBjZW50ZXJTdWJjaHVuazogVjMsIGN0eDogU3ViY2h1bmtTZWFyY2hDb250ZXh0LCByZXN1bHRzOiBPYmplY3REaXN0YW5jZTxWMz5bXSk6IHZvaWQge1xyXG4gICAgICAgIGNvbnN0IHsgbWluLCBtYXggfSA9IGN0eC5ib3VuZHM7XHJcblxyXG4gICAgICAgIGZvciAoY29uc3QgW2R4LCBkeSwgZHpdIG9mIEN5bGluZGVySGVscGVyLmdldFNoZWxsT2Zmc2V0cyhzaGVsbCkpIHtcclxuICAgICAgICAgICAgY29uc3QgeCA9IGNlbnRlclN1YmNodW5rLnggKyBkeDtcclxuICAgICAgICAgICAgY29uc3QgeSA9IGNlbnRlclN1YmNodW5rLnkgKyBkeTtcclxuICAgICAgICAgICAgY29uc3QgeiA9IGNlbnRlclN1YmNodW5rLnogKyBkejtcclxuICAgICAgICAgICAgaWYgKHggPCBtaW4ueCB8fCB4ID4gbWF4LnggfHwgeSA8IG1pbi55IHx8IHkgPiBtYXgueSB8fCB6IDwgbWluLnogfHwgeiA+IG1heC56KSBjb250aW51ZTtcclxuXHJcbiAgICAgICAgICAgIEN5bGluZGVySGVscGVyLnRyeUFkZFN1YmNodW5rKHgsIHksIHosIGN0eCwgcmVzdWx0cyk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKiBZaWVsZHMgcG9wdWxhdGVkIHN1YmNodW5rcyB3aXRoaW4gdGhlIGN5bGluZGVyLCBuZWFyZXN0LXNoZWxsLWZpcnN0LCBleHBhbmRpbmcgb3V0d2FyZCBmcm9tIGBjZW50ZXJgLiAqL1xyXG4gICAgcHVibGljIHN0YXRpYyAqZ2V0U3ViY2h1bmtzSW5DeWxpbmRlcihcclxuICAgICAgICBjZW50ZXI6IFYzLFxyXG4gICAgICAgIGN5bGluZGVyOiBTZWFyY2hDeWxpbmRlcixcclxuICAgICAgICBmZWF0dXJlc0J5U3ViY2h1bms6IE1hcDxzdHJpbmcsIEZlYXR1cmVbXT5cclxuICAgICk6IEdlbmVyYXRvcjxPYmplY3REaXN0YW5jZTxWMz4+IHtcclxuICAgICAgICBjb25zdCBzaXplID0gRmVhdHVyZUNhY2hlRGF0YS5TdWJjaHVua1NpemU7XHJcbiAgICAgICAgY29uc3QgY2VudGVyU3ViY2h1bmsgPSBjZW50ZXIuJC5kaXZpZGUoc2l6ZSkuZmxvb3IoKTtcclxuICAgICAgICBjb25zdCBzaGVsbFJhZGl1cyA9IE1hdGguY2VpbChjeWxpbmRlci5yYWRpdXMgLyBzaXplKTtcclxuXHJcbiAgICAgICAgY29uc3QgeU1pbiA9IE1hdGgubWF4KE1hdGguZmxvb3IoKGNlbnRlci55ICsgY3lsaW5kZXIueU9mZnNldFJhbmdlWzBdKSAvIHNpemUpLCBNYXRoLmZsb29yKEZlYXR1cmVDYWNoZURhdGEuU2Nhbk1pbkhlaWdodCAvIHNpemUpKTtcclxuICAgICAgICBjb25zdCB5TWF4ID0gTWF0aC5taW4oTWF0aC5jZWlsKChjZW50ZXIueSArIGN5bGluZGVyLnlPZmZzZXRSYW5nZVsxXSkgLyBzaXplKSwgTWF0aC5jZWlsKEZlYXR1cmVDYWNoZURhdGEuU2Nhbk1heEhlaWdodCAvIHNpemUpKTtcclxuICAgICAgICBpZiAoeU1pbiA+IHlNYXgpIHJldHVybjtcclxuXHJcbiAgICAgICAgY29uc3QgY3R4OiBTdWJjaHVua1NlYXJjaENvbnRleHQgPSB7XHJcbiAgICAgICAgICAgIGNlbnRlcixcclxuICAgICAgICAgICAgc2l6ZSxcclxuICAgICAgICAgICAgZmVhdHVyZXNCeVN1YmNodW5rLFxyXG4gICAgICAgICAgICBib3VuZHM6IG5ldyBWb2x1bWUoXHJcbiAgICAgICAgICAgICAgICB7IHg6IGNlbnRlclN1YmNodW5rLnggLSBzaGVsbFJhZGl1cywgeTogeU1pbiwgejogY2VudGVyU3ViY2h1bmsueiAtIHNoZWxsUmFkaXVzIH0sXHJcbiAgICAgICAgICAgICAgICB7IHg6IGNlbnRlclN1YmNodW5rLnggKyBzaGVsbFJhZGl1cywgeTogeU1heCwgejogY2VudGVyU3ViY2h1bmsueiArIHNoZWxsUmFkaXVzIH1cclxuICAgICAgICAgICAgKSxcclxuICAgICAgICB9O1xyXG5cclxuICAgICAgICAvLyBMYXJnZXN0IENoZWJ5c2hldiBkaXN0YW5jZSB0aGF0IGNvdWxkIHN0aWxsIGNvbnRhaW4gYW4gaW4tYm91bmQgc3ViY2h1bmtcclxuICAgICAgICBjb25zdCBtYXhTaGVsbCA9IE1hdGgubWF4KHNoZWxsUmFkaXVzLCBjZW50ZXJTdWJjaHVuay55IC0geU1pbiwgeU1heCAtIGNlbnRlclN1YmNodW5rLnksIDApO1xyXG5cclxuICAgICAgICBmb3IgKGxldCBzaGVsbCA9IDA7IHNoZWxsIDw9IG1heFNoZWxsOyBzaGVsbCsrKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHNoZWxsU3ViY2h1bmtzOiBPYmplY3REaXN0YW5jZTxWMz5bXSA9IFtdO1xyXG4gICAgICAgICAgICBDeWxpbmRlckhlbHBlci5jb2xsZWN0U2hlbGwoc2hlbGwsIGNlbnRlclN1YmNodW5rLCBjdHgsIHNoZWxsU3ViY2h1bmtzKTtcclxuXHJcbiAgICAgICAgICAgIGlmIChzaGVsbFN1YmNodW5rcy5sZW5ndGggPT09IDApIGNvbnRpbnVlO1xyXG4gICAgICAgICAgICBzaGVsbFN1YmNodW5rcy5zb3J0KChhLCBiKSA9PiBhLmRpc3RhbmNlIC0gYi5kaXN0YW5jZSk7XHJcbiAgICAgICAgICAgIHlpZWxkKiBzaGVsbFN1YmNodW5rcztcclxuICAgICAgICB9XHJcbiAgICB9XHJcbn1cclxuIl0sIm5hbWVzIjpbIkZlYXR1cmVDYWNoZURhdGEiLCJWMyIsIlZvbHVtZSIsIkN5bGluZGVySGVscGVyIiwiZ2V0U2hlbGxPZmZzZXRzIiwic2hlbGwiLCJjYWNoZWQiLCJzaGVsbE9mZnNldENhY2hlIiwib2Zmc2V0cyIsImR4IiwiZHkiLCJiYXNlIiwiTWF0aCIsIm1heCIsImFicyIsImR6IiwicHVzaCIsInRyeUFkZFN1YmNodW5rIiwieCIsInkiLCJ6IiwiY3R4IiwicmVzdWx0cyIsImtleSIsImZlYXR1cmVzQnlTdWJjaHVuayIsImhhcyIsInN1YmNodW5rTWluWCIsInNpemUiLCJzdWJjaHVua01pblkiLCJzdWJjaHVua01pbloiLCJzdWJjaHVua01heFgiLCJzdWJjaHVua01heFkiLCJzdWJjaHVua01heFoiLCJjbG9zZXN0WCIsIm1pbiIsImNlbnRlciIsImNsb3Nlc3RZIiwiY2xvc2VzdFoiLCJtaW5EaXN0YW5jZSIsInNxcnQiLCJzdWJjaHVuayIsInNldERpbWVuc2lvbiIsIm92ZXJ3b3JsZCIsIm9iamVjdCIsImRpc3RhbmNlIiwiY29sbGVjdFNoZWxsIiwiY2VudGVyU3ViY2h1bmsiLCJib3VuZHMiLCJnZXRTdWJjaHVua3NJbkN5bGluZGVyIiwiY3lsaW5kZXIiLCJTdWJjaHVua1NpemUiLCIkIiwiZGl2aWRlIiwiZmxvb3IiLCJzaGVsbFJhZGl1cyIsImNlaWwiLCJyYWRpdXMiLCJ5TWluIiwieU9mZnNldFJhbmdlIiwiU2Nhbk1pbkhlaWdodCIsInlNYXgiLCJTY2FuTWF4SGVpZ2h0IiwibWF4U2hlbGwiLCJzaGVsbFN1YmNodW5rcyIsImxlbmd0aCIsInNvcnQiLCJhIiwiYiJdLCJtYXBwaW5ncyI6IkFBQUEsT0FBT0Esc0JBQXNCLHdCQUF3QjtBQUNyRCxPQUFPQyxRQUFRLHFCQUFxQjtBQUNwQyxPQUFPQyxZQUFZLHlCQUF5QjtBQVk3QixNQUFNQztJQUlqQiw4R0FBOEcsR0FDOUcsT0FBZUMsZ0JBQWdCQyxLQUFhLEVBQXVDO1FBQy9FLE1BQU1DLFNBQVNILGVBQWVJLGdCQUFnQixDQUFDRixNQUFNO1FBQ3JELElBQUlDLFFBQVEsT0FBT0E7UUFFbkIsTUFBTUUsVUFBc0MsRUFBRTtRQUM5QyxJQUFLLElBQUlDLEtBQUssQ0FBQ0osT0FBT0ksTUFBTUosT0FBT0ksS0FBTTtZQUNyQyxJQUFLLElBQUlDLEtBQUssQ0FBQ0wsT0FBT0ssTUFBTUwsT0FBT0ssS0FBTTtnQkFDckMsTUFBTUMsT0FBT0MsS0FBS0MsR0FBRyxDQUFDRCxLQUFLRSxHQUFHLENBQUNMLEtBQUtHLEtBQUtFLEdBQUcsQ0FBQ0o7Z0JBQzdDLElBQUssSUFBSUssS0FBSyxDQUFDVixPQUFPVSxNQUFNVixPQUFPVSxLQUFNO29CQUNyQyxJQUFJSCxLQUFLQyxHQUFHLENBQUNGLE1BQU1DLEtBQUtFLEdBQUcsQ0FBQ0MsU0FBU1YsT0FBT0csUUFBUVEsSUFBSSxDQUFDO3dCQUFDUDt3QkFBSUM7d0JBQUlLO3FCQUFHO2dCQUN6RTtZQUNKO1FBQ0o7UUFFQVosZUFBZUksZ0JBQWdCLENBQUNGLE1BQU0sR0FBR0c7UUFDekMsT0FBT0E7SUFDWDtJQUVBOztL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