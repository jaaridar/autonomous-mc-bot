// Fixture: `world` is used as a receiver but never imported, so the line throws
// a ReferenceError the moment it runs. The undef gate must reject this file.
export function clock() {
    return world.getTimeOfDay();
}
