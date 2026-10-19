// Efficient-Bot port: where an item comes from when no recipe exists.
//
// tools/migrate/extract-efficient-bot.mjs produced core/data/acquire.js from
// Efficient-Bot's findAt table: per item, a method (mine / strip / kill), the
// blocks or mobs involved, biomes, a Y hint and the tool the route expects.
// This module turns that data into a decision the runtime can act on - and it
// refuses routes the world cannot honour. A block route exists only when the
// MINE table actually yields the item, so "flint" (a chance gravel drop the
// miner does not model) stays honestly blocked instead of sending the bot on
// an endless gravel dig. A tooled route that lacks its pickaxe returns the
// tool as `needTool` so the caller can craft the tool first.
//
// Pure: no engine, no inventory, no randomness.

import { ACQUIRE } from "./data/acquire.js";
import { MINE, toolTier } from "./world.js";

const TOOL_SUFFIXES = ["_pickaxe", "_axe", "_shovel"];

/** Concrete blocks whose mining drop is exactly `item`. */
export function mineBlocksFor(item) {
    const out = [];
    for (const [block, rule] of Object.entries(MINE)) {
        if (block === "#logs" || !rule?.drops) continue;
        if (rule.drops === item) out.push(block);
    }
    return out;
}

/**
 * Normalised route for `item`, or null when there is no honest one.
 *
 * Returns one of:
 *   { kind: "mob",   method: "kill", mobs, item, needTool: null }
 *   { kind: "block", method: "mine"|"strip", blocks, item, tool, needTool }
 * `needTool` is set when the required tool is missing from `stock`; the caller
 * should obtain the tool first and then retry the route.
 */
export function acquireRoute(item, stock = {}) {
    const route = ACQUIRE[item];
    if (!route) return null;
    if (route.kind === "mob") {
        if (route.method !== "kill" || route.targets.length === 0) return null;
        return { kind: "mob", method: "kill", mobs: route.targets.slice(), item, tool: null, needTool: null };
    }
    const blocks = mineBlocksFor(item);
    if (blocks.length === 0) return null;
    const tool = route.tool ?? null;
    if (tool) {
        const suffix = TOOL_SUFFIXES.find((s) => tool.endsWith(s));
        if (suffix) {
            const tier = toolTier(tool);
            const ok = Object.entries(stock).some(([type, n]) => n > 0 && type.endsWith(suffix) && toolTier(type) >= tier);
            if (!ok) return { kind: "block", method: route.method, blocks, item, tool, needTool: tool };
        }
    }
    return { kind: "block", method: route.method, blocks, item, tool, needTool: null };
}
