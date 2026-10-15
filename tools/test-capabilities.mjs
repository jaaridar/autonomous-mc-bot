import { analyzeRequirements, decomposeMission, isAnyLog } from "../scripts/core/progression.js";
import { CAPABILITIES, composeCapabilities, evaluateCapability } from "../scripts/core/survival.js";
let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`pass ${name}`); passed++; }
  catch (e) { console.log(`FAIL ${name}: ${e.message}`); failed++; }
}

test("any log detection", () => {
  if (!isAnyLog("minecraft:birch_log")) throw Error("birch should be any log");
  if (!isAnyLog("minecraft:crimson_stem")) throw Error("crimson should be any log");
  if (isAnyLog("minecraft:stone")) throw Error("stone should not be any log");
});

test("goal decomposition wood has hierarchy", () => {
  const tree = decomposeMission("wood");
  if (!tree.children.length) throw Error("wood should have children");
  const flat = tree.flatten();
  const hasAction = flat.some(f => f.node.hierarchy === 6);
  if (!hasAction) throw Error("should have ACTION level");
  const hasPrereq = flat.some(f => f.node.hierarchy === 5);
  if (!hasPrereq) throw Error("should have PREREQUISITE level");
});

test("follow goal has tower+water+gap", () => {
  const tree = decomposeMission("follow");
  const flat = tree.flatten();
  const hasTower = flat.some(f => f.node.id.includes("tower") || f.node.display.includes("pillar"));
  const hasWater = flat.some(f => f.node.id.includes("water") || f.node.id.includes("boat"));
  const hasGap = flat.some(f => f.node.id.includes("gap"));
  if (!hasTower) throw Error("follow should have tower");
  if (!hasWater) throw Error("follow should have water");
  if (!hasGap) throw Error("follow should have gap");
});

test("capabilities compose mixed situations", () => {
  const caps = composeCapabilities({ health: 4, threatCount: 3, hunger: 5, gapSize: 5, verticalDiff: 20, foodCount: 1, inWater: false, belowHazard: false, bombNear: true });
  if (caps.length < 2) throw Error("mixed situation should compose multiple capabilities, got "+caps.length);
  const hasEscape = caps.some(c => c.capability === CAPABILITIES.ESCAPE);
  const hasRetreat = caps.some(c => c.capability === CAPABILITIES.COMBAT_RETREAT);
  if (!hasEscape && !hasRetreat) throw Error("should have escape or retreat");
});

test("any log request analysis", () => {
  const tree = decomposeMission("wood");
  const missing = analyzeRequirements(tree, {}, {});
  if (!missing.length) throw Error("empty inventory should have missing");
  const hasLog = missing.some(m => m.id.includes("log"));
  if (!hasLog) throw Error("should have log missing");
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
