// The skill catalog.
//
// Every skill the bot can run is imported here, in one explicit list. Order does
// not decide priority (the scheduler scores skills), but it does decide tie-breaks
// inside a category and it makes the catalog readable: this file *is* the answer
// to "what can the bot do?".
//
// Adding a skill:
//   1. create scripts/skills/<category>/<name>.js exporting a defineSkill(...)
//   2. import it below and add it to the right category array
//   3. run `node tools/run-all.mjs` - the skill gate fails if the contract is
//      wrong (id/category mismatch, missing run/plan/verify, duplicate id)
//   4. in-game: `/reload` then `!bot skill run <category>.<name>`

import { SkillRegistry } from "./registry.js";

import { mineBlockSkill } from "./mining/mine-block.js";
import { mineVeinSkill } from "./mining/mine-vein.js";
import { staircaseSkill } from "./mining/staircase.js";
import { branchMineSkill } from "./mining/branch-mine.js";
import { collectDropsSkill } from "./mining/collect-drops.js";

import { reachSkill } from "./parkour/reach.js";
import { bridgeSkill } from "./parkour/bridge.js";
import { pillarUpSkill } from "./parkour/pillar-up.js";
import { descendSkill } from "./parkour/descend.js";
import { swimCrossSkill } from "./parkour/swim-cross.js";

import { meleeMobSkill } from "./combat/melee-mob.js";
import { retreatSkill } from "./combat/retreat.js";
import { bunkerSkill } from "./combat/bunker.js";

import { duelPlayerSkill } from "./pvp/duel-player.js";
import { disengagePlayerSkill } from "./pvp/disengage-player.js";

import { eatSkill } from "./survival/eat.js";
import { escapeLavaSkill } from "./survival/escape-lava.js";
import { escapeWaterSkill } from "./survival/escape-water.js";
import { nightCampSkill } from "./survival/night-camp.js";
import { unstickSkill } from "./survival/unstick.js";

import { chopTreeSkill } from "./gather/chop-tree.js";
import { huntAnimalSkill } from "./gather/hunt-animal.js";

import { craftItemSkill } from "./craft/craft-item.js";
import { smeltItemSkill } from "./craft/smelt-item.js";
import { storeItemsSkill } from "./craft/store-items.js";

import { torchSkill } from "./build/torch.js";

import { followOwnerSkill } from "./explore/follow-owner.js";
import { scoutSkill } from "./explore/scout.js";

import { recoverDeathSkill } from "./meta/recover-death.js";
import { equipGearSkill } from "./meta/equip-gear.js";
import { triageSkill } from "./meta/triage.js";

/**
 * Catalog order by category. Survival first (they are also the highest priority),
 * then combat, then the production skills, then housekeeping.
 */
export const CATALOG = {
    survival: [eatSkill, escapeLavaSkill, escapeWaterSkill, nightCampSkill, unstickSkill],
    combat: [retreatSkill, bunkerSkill, meleeMobSkill],
    pvp: [disengagePlayerSkill, duelPlayerSkill],
    parkour: [reachSkill, descendSkill, pillarUpSkill, bridgeSkill, swimCrossSkill],
    mining: [mineVeinSkill, mineBlockSkill, staircaseSkill, branchMineSkill, collectDropsSkill],
    gather: [chopTreeSkill, huntAnimalSkill],
    craft: [craftItemSkill, smeltItemSkill, storeItemsSkill],
    build: [torchSkill],
    explore: [followOwnerSkill, scoutSkill],
    meta: [recoverDeathSkill, equipGearSkill, triageSkill],
};

/** Build a fresh registry. Pure: no engine, so tests can build one too. */
export function buildRegistry() {
    const registry = new SkillRegistry();
    for (const skills of Object.values(CATALOG))
        registry.addAll(skills);
    const problems = registry.validate();
    if (problems.length)
        throw new Error(`skill catalog is invalid:\n  ${problems.join("\n  ")}`);
    return registry;
}

export { SkillRegistry };
export const SKILL_COUNT = Object.values(CATALOG).reduce((n, list) => n + list.length, 0);
