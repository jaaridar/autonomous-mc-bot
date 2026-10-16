// Spatial index for "what is near me" queries.
//
// Migrated from the AI Players Add-On Helpers/SpatialHashGrid2D.js and extended
// to three dimensions. Scanning is the bot's most expensive habit: a cave sweep
// that compares every ore against every other ore is quadratic, and the same
// quadratic pattern creeps into threat ranking, drop pickup and vein grouping.
// A uniform grid turns those into "look at the few buckets that can matter".
//
// The grid is pure data: no engine imports, no allocation per query beyond the
// result array, deterministic iteration order (insertion order per cell).

const key = (cx, cy, cz) => `${cx},${cy},${cz}`;

export class SpatialGrid {
    constructor(cellSize = 8) {
        if (!(cellSize > 0))
            throw new Error("SpatialGrid needs a positive cell size");
        this.cellSize = cellSize;
        this.cells = new Map();
        this.count = 0;
    }
    cellOf(v) { return Math.floor(v / this.cellSize); }
    insert(point, data = point) {
        const k = key(this.cellOf(point.x), this.cellOf(point.y ?? 0), this.cellOf(point.z));
        let bucket = this.cells.get(k);
        if (!bucket) {
            bucket = [];
            this.cells.set(k, bucket);
        }
        bucket.push({ point, data });
        this.count++;
        return data;
    }
    remove(data) {
        for (const [k, bucket] of this.cells) {
            const i = bucket.findIndex((entry) => entry.data === data);
            if (i >= 0) {
                bucket.splice(i, 1);
                if (bucket.length === 0)
                    this.cells.delete(k);
                this.count--;
                return true;
            }
        }
        return false;
    }
    /** Everything within `range` blocks of the point (cube query, then distance filter). */
    near(point, range = 0, { filter, limit } = {}) {
        const out = [];
        const cs = this.cellSize;
        const minX = this.cellOf(point.x - range);
        const maxX = this.cellOf(point.x + range);
        const minY = this.cellOf((point.y ?? 0) - range);
        const maxY = this.cellOf((point.y ?? 0) + range);
        const minZ = this.cellOf(point.z - range);
        const maxZ = this.cellOf(point.z + range);
        for (let cx = minX; cx <= maxX; cx++) {
            for (let cy = minY; cy <= maxY; cy++) {
                for (let cz = minZ; cz <= maxZ; cz++) {
                    const bucket = this.cells.get(key(cx, cy, cz));
                    if (!bucket)
                        continue;
                    for (const entry of bucket) {
                        if (range > 0 && distance(entry.point, point) > range)
                            continue;
                        if (filter && !filter(entry.data, entry.point))
                            continue;
                        out.push(entry.data);
                        if (limit && out.length >= limit)
                            return out;
                    }
                }
            }
        }
        return out;
    }
    /** Nearest entry to a point within `range`, or undefined. */
    nearest(point, range = 0, filter) {
        let best;
        let bestDistance = Infinity;
        for (const data of this.near(point, range, { filter })) {
            const d = distance(data, point);
            if (d < bestDistance) {
                bestDistance = d;
                best = data;
            }
        }
        return best;
    }
    /** Order entries by distance from a point, nearest first (stable). */
    sortedByDistance(point, entries) {
        return entries
            .map((entry, index) => ({ entry, index, d: distance(entry, point) }))
            .sort((a, b) => (a.d - b.d) || (a.index - b.index))
            .map((x) => x.entry);
    }
    clear() {
        this.cells.clear();
        this.count = 0;
    }
}

/** Squared distance is enough for ranking and avoids a sqrt per comparison. */
export function distanceSquared(a, b) {
    const dx = a.x - b.x;
    const dy = (a.y ?? 0) - (b.y ?? 0);
    const dz = a.z - b.z;
    return dx * dx + dy * dy + dz * dz;
}

export function distance(a, b) {
    return Math.sqrt(distanceSquared(a, b));
}

/**
 * Group nearby positions into clusters (ore veins, tree canopies, drop piles).
 * Breadth-first over the grid so a cluster costs one bucket lookup per member
 * instead of one scan per block.
 *
 * @param points positions to group
 * @param radius maximum step between two blocks of the same cluster
 * @param options.link optional (a, b) => boolean to reject a merge (e.g. ore type)
 */
export function clusterPoints(points, radius = 1, { link, maxSize = 512 } = {}) {
    const grid = new SpatialGrid(Math.max(1, radius));
    for (const point of points) grid.insert(point, point);
    const seen = new Set();
    const clusters = [];
    for (const start of points) {
        const startKey = `${start.x},${start.y ?? 0},${start.z}`;
        if (seen.has(startKey))
            continue;
        const cluster = [];
        const queue = [start];
        seen.add(startKey);
        while (queue.length && cluster.length < maxSize) {
            const point = queue.shift();
            cluster.push(point);
            for (const neighbour of grid.near(point, radius)) {
                const k = `${neighbour.x},${neighbour.y ?? 0},${neighbour.z}`;
                if (seen.has(k))
                    continue;
                if (link && !link(point, neighbour))
                    continue;
                seen.add(k);
                queue.push(neighbour);
            }
        }
        clusters.push(cluster);
    }
    return clusters;
}
