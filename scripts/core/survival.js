import { id } from "./recipes.js";
export const RAW_TO_COOKED = Object.fromEntries([
    ["beef", "cooked_beef"],
    ["porkchop", "cooked_porkchop"],
    ["chicken", "cooked_chicken"],
    ["mutton", "cooked_mutton"],
    ["rabbit", "cooked_rabbit"],
    ["cod", "cooked_cod"],
    ["salmon", "cooked_salmon"],
].map(([a, b]) => [id(a), id(b)]));
export const EMERGENCY_FOOD = new Set(["beef", "porkchop", "mutton", "rabbit", "cod", "salmon"].map(id));
export const PREY = new Set(["cow", "pig", "sheep", "chicken"].map(id));
export function fuelCount(type, inputs) {
    const seconds = type === id("coal") || type === id("charcoal")
        ? 80
        : type.endsWith("_planks")
            ? 15
            : 0;
    if (!seconds || !Number.isInteger(inputs) || inputs < 1 || inputs > 8)
        throw Error("Unsupported fuel or batch.");
    return Math.ceil((inputs * 10) / seconds);
}
export function smeltOutput(input) {
    return (RAW_TO_COOKED[input] ??
        (input === id("raw_iron")
            ? id("iron_ingot")
            : input.endsWith("_log")
                ? id("charcoal")
                : undefined));
}
