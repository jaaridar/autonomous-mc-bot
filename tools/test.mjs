import { fromJson, toJson, blank, upsertSpot, nearestSpot, removeSpot, setDeath, setHome, summary, sanitize } from "./load/scripts/core/memory.js";
let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) pass++; else { fail++; console.log("FAIL: " + name); } };

// garbage input never throws
check("garbage null", JSON.stringify(fromJson(null)) === JSON.stringify(blank()));
check("garbage text", JSON.stringify(fromJson("not json{")) === JSON.stringify(blank()));
check("garbage array", JSON.stringify(fromJson("[1,2,3]")) === JSON.stringify(blank()));
check("garbage object", fromJson(JSON.stringify({ x: "evil", spots: [{ kind: "lava", x: 0, y: 0, z: 0 }] })).spots.length === 0);

// upsert dedupe
const s = blank();
check("first notice", upsertSpot(s, { kind: "chest", dim: "minecraft:overworld", x: 1, y: 64, z: 2, t: 100 }) === true);
check("same again", upsertSpot(s, { kind: "chest", dim: "minecraft:overworld", x: 1, y: 64, z: 2, t: 200 }) === false);
check("spots kept", s.spots.length === 1);
check("different kind same cell", upsertSpot(s, { kind: "furnace", dim: "minecraft:overworld", x: 1, y: 64, z: 2, t: 200 }) === true);
check("invalid kind refused", upsertSpot(s, { kind: "nuke", dim: "minecraft:overworld", x: 5, y: 64, z: 5, t: 1 }) === false);
check("invalid pos refused", upsertSpot(s, { kind: "chest", dim: "minecraft:overworld", x: NaN, y: 64, z: 5, t: 1 }) === false);

// nearest
upsertSpot(s, { kind: "chest", dim: "minecraft:overworld", x: 100, y: 64, z: 100, t: 10 });
const n = nearestSpot(s, "chest", "minecraft:overworld", { x: 90, y: 64, z: 100 });
check("nearest picks close", n && n.x === 100);
const nd = nearestSpot(s, "chest", "minecraft:nether", { x: 90, y: 64, z: 100 });
check("nearest respects dimension", nd === undefined);

// removal
check("remove existing", removeSpot(s, "chest", "minecraft:overworld", { x: 1, y: 64, z: 2 }) === true);
check("remove missing", removeSpot(s, "chest", "minecraft:overworld", { x: 1, y: 64, z: 2 }) === false);

// roundtrip through json
const s2 = fromJson(toJson(s));
check("roundtrip spots", s2.spots.length === 2);
check("roundtrip kinds", s2.spots.some((o) => o.kind === "furnace") && s2.spots.some((o) => o.kind === "chest"));

// prefs whitelist + clamps
const s3 = sanitize({ prefs: { camp: false, range: 9000, evil: true, parkour: "yes" }, v: 99 });
check("prefs keep bool", s3.prefs && s3.prefs.camp === false);
check("prefs clamp range", s3.prefs && s3.prefs.range === undefined);
check("prefs drop unknown", s3.prefs && s3.prefs.evil === undefined && s3.prefs.parkour === undefined);

// death + home
check("death set", setDeath(s3, { x: 10, y: 70, z: 10 }, "minecraft:overworld", 500, { "minecraft:diamond": 3, bad: -1, worse: "x" }) === true);
check("death items filtered", Object.keys(s3.death.items).length === 1);
check("home set", (setHome(s3, { x: 1, y: 2, z: 3 }, "minecraft:overworld"), s3.home.x === 1));

// caps
const s4 = blank();
for (let i = 0; i < 200; i++) upsertSpot(s4, { kind: "chest", dim: "minecraft:overworld", x: i, y: 64, z: 0, t: i });
check("cap enforced", s4.spots.length <= 96);
check("cap keeps newest", s4.spots.every((o) => o.t >= 200 - 96));

// summary
const sum = summary(s4);
check("summary spots counted", sum.spots.chest === s4.spots.length);
check("summary total", sum.spotsTotal === s4.spots.length);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
