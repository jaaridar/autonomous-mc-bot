// Fixture: must FAIL the module-scope gate.
//
// Script API 2.x evaluates this module before the world is loaded, so reading
// the time here would not throw loudly - it would quietly answer nothing, or
// throw inside the pack's own import and take the whole pack down with it.
// Real work belongs in world.afterEvents.worldLoad.subscribe(() => { ... }).
import { world } from "@minecraft/server";

world.sendMessage("this line runs before the world exists");

export function alsoWrong() {
    return world.getTimeOfDay();
}
