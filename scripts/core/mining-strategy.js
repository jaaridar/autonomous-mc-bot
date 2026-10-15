/**
 * Deep mining strategies - pure logic.
 * Provides branch mining patterns, vein clustering, and efficient dig orders.
 */

export const STRATEGIES = {
    STRIP: "strip",
    BRANCH: "branch",
    VEIN: "vein",
    QUARRY: "quarry",
    STAIRCASE: "staircase",
    SPIRAL: "spiral"
};

/**
 * Branch mining pattern: main corridor with side branches every N blocks.
 * Returns array of {x,z} offsets relative to start, in order.
 */
export function branchPattern(length = 64, branchLength = 20, spacing = 4) {
    const path = [];
    let dir = 0; // 0:+x, 1:+z, 2:-x, 3:-z
    let pos = { x: 0, z: 0 };
    const dirs = [{x:1,z:0},{x:0,z:1},{x:-1,z:0},{x:0,z:-1}];
    for (let i = 0; i < length; i++) {
        path.push({ ...pos, kind: "main" });
        if (i % spacing === 0 && i > 0) {
            // left branch
            const left = (dir + 3) % 4;
            for (let b = 1; b <= branchLength; b++) {
                path.push({ x: pos.x + dirs[left].x * b, z: pos.z + dirs[left].z * b, kind: "branch" });
            }
            for (let b = branchLength; b >= 1; b--) {
                path.push({ x: pos.x + dirs[left].x * b, z: pos.z + dirs[left].z * b, kind: "return" });
            }
            // right branch
            const right = (dir + 1) % 4;
            for (let b = 1; b <= branchLength; b++) {
                path.push({ x: pos.x + dirs[right].x * b, z: pos.z + dirs[right].z * b, kind: "branch" });
            }
            for (let b = branchLength; b >= 1; b--) {
                path.push({ x: pos.x + dirs[right].x * b, z: pos.z + dirs[right].z * b, kind: "return" });
            }
        }
        pos.x += dirs[dir].x;
        pos.z += dirs[dir].z;
    }
    return path;
}

/**
 * Quarry pattern: dig out a rectangular area layer by layer.
 */
export function quarryPattern(width = 8, depth = 8) {
    const path = [];
    for (let z = 0; z < depth; z++) {
        const reverse = z % 2 === 1;
        for (let x = 0; x < width; x++) {
            const px = reverse ? width - 1 - x : x;
            path.push({ x: px, z, kind: "dig" });
        }
    }
    return path;
}

/**
 * Vein clustering: given a list of ore positions, cluster them by proximity.
 * Returns clusters sorted by size (largest first).
 */
export function clusterVeins(positions, radius = 4) {
    const clusters = [];
    const visited = new Set();
    const key = (p) => `${p.x},${p.y},${p.z}`;
    for (let i = 0; i < positions.length; i++) {
        if (visited.has(i)) continue;
        const cluster = [positions[i]];
        visited.add(i);
        const queue = [positions[i]];
        while (queue.length) {
            const cur = queue.shift();
            for (let j = 0; j < positions.length; j++) {
                if (visited.has(j)) continue;
                const other = positions[j];
                const dist = Math.hypot(cur.x - other.x, cur.y - other.y, cur.z - other.z);
                if (dist <= radius) {
                    visited.add(j);
                    cluster.push(other);
                    queue.push(other);
                }
            }
        }
        clusters.push(cluster);
    }
    clusters.sort((a,b) => b.length - a.length);
    return clusters;
}

/**
 * Choose best mining Y for a given ore based on Bedrock distributions.
 */
export function bestYFor(oreType) {
    const map = {
        "minecraft:coal": 48,
        "minecraft:raw_iron": 16,
        "minecraft:raw_copper": 48,
        "minecraft:raw_gold": -16,
        "minecraft:diamond": -59,
        "minecraft:redstone": -59,
        "minecraft:lapis_lazuli": 0,
        "minecraft:emerald": 236, // mountain
        "minecraft:ancient_debris": 15, // nether
        "minecraft:cobblestone": 0,
        "minecraft:stone": 0,
        "minecraft:deepslate": -20,
    };
    return map[oreType] ?? -20;
}

/**
 * Efficient dig order for a 2-high tunnel: break top first, then bottom.
 */
export function digOrder(cells) {
    // Sort by y descending (top first) then by distance
    return [...cells].sort((a,b) => b.y - a.y);
}

/**
 * Calculate blocks revealed per block mined for a given spacing.
 * Used to choose spacing for efficiency.
 */
export function efficiencyFor(spacing) {
    // Simplified: 2-high tunnel reveals 8 blocks per 2 mined = 4:1 at spacing 1
    // At spacing 3, reveals 6 new per 2 mined = 3:1 but less overlap
    const revealed = 8 + (spacing - 1) * 2;
    const mined = 2;
    return revealed / mined;
}

export function optimalSpacing(oreType) {
    // Diamonds benefit from wider spacing due to larger veins
    if (oreType === "minecraft:diamond") return 3;
    if (oreType === "minecraft:raw_iron") return 3;
    return 2;
}
