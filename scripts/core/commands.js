import { validPosition } from "./math.js";
export function tokens(text) {
    if (text.length > 256)
        throw Error("Command too long.");
    return text.trim().split(/\s+/).filter(Boolean);
}
export function integer(s, min, max, defaultValue) {
    if (s === undefined && defaultValue !== undefined)
        return defaultValue;
    const n = Number(s);
    if (s === undefined || !Number.isInteger(n) || n < min || n > max)
        throw Error(`Expected integer ${min}..${max}.`);
    return n;
}
export function coordinates(a) {
    if (a.length !== 3)
        throw Error("Use three absolute coordinates: x y z.");
    const p = { x: Number(a[0]), y: Number(a[1]), z: Number(a[2]) };
    if (!validPosition(p))
        throw Error("Invalid Overworld coordinates.");
    return p;
}
