export const floor = (p) => ({
    x: Math.floor(p.x),
    y: Math.floor(p.y),
    z: Math.floor(p.z),
});
export const add = (a, b) => ({
    x: a.x + b.x,
    y: a.y + b.y,
    z: a.z + b.z,
});
export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
export const horizontal = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export const key = (p) => `${p.x},${p.y},${p.z}`;
export const center = (p) => ({ x: p.x + 0.5, y: p.y, z: p.z + 0.5 });
export const CARDINAL = [
    { x: 1, y: 0, z: 0 },
    { x: -1, y: 0, z: 0 },
    { x: 0, y: 0, z: 1 },
    { x: 0, y: 0, z: -1 },
];
/** Eight flat directions, the four cardinals first so tie-breaks stay predictable. */
export const COMPASS = [
    ...CARDINAL,
    { x: 1, y: 0, z: 1 },
    { x: 1, y: 0, z: -1 },
    { x: -1, y: 0, z: 1 },
    { x: -1, y: 0, z: -1 },
];
export const UP = { x: 0, y: 1, z: 0 };
export const DOWN = { x: 0, y: -1, z: 0 };
/** Unit flat vector pointing from `from` to `to` (cardinal approximation). */
export function away(from, to) {
    const dx = from.x - to.x, dz = from.z - to.z;
    const ax = Math.abs(dx) >= Math.abs(dz) ? Math.sign(dx) : 0;
    const az = ax === 0 ? Math.sign(dz) : 0;
    return { x: ax, y: 0, z: az };
}
export const clamp = (n, lo, hi) => (n < lo ? lo : n > hi ? hi : n);
export function validPosition(p) {
    return (Object.values(p).every(Number.isFinite) &&
        Math.abs(p.x) < 29999900 &&
        Math.abs(p.z) < 29999900 &&
        p.y >= -64 &&
        p.y < 320);
}
