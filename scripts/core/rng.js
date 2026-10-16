// Deterministic pseudo-random numbers.
//
// Why this exists: an autonomous bot that behaves differently on every reload
// cannot be debugged, replayed or tested. Every random choice in the pack comes
// from here, seeded from a value the world remembers, so a reload reproduces the
// same decisions and a test can assert them.
//
// The generator is Mulberry32 (migrated from the AI Players Add-On
// Helpers/SeededRandom.js), chosen because it is tiny, fast and passes the usual
// smoke tests for a 32-bit state generator.
//
// Rules that keep determinism real (enforced offline by tools/gates.mjs):
//   - nothing outside this file may call Math.random() or Date.now() for
//     behaviour;
//   - each subsystem draws from its own derived stream, so a skill that draws
//     more numbers cannot shift another subsystem's sequence.

/** Mulberry32. Same seed, same sequence, forever. */
export class Rng {
    constructor(seed = 0) {
        this.seed = (typeof seed === "number" ? seed : hash(seed)) >>> 0;
        this.initial = this.seed;
        this.draws = 0;
    }
    /** Next float in [0, 1). */
    next() {
        this.draws++;
        let t = (this.seed += 0x6d2b79f5);
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    /** Integer in [min, max] inclusive. */
    int(min, max) {
        if (max < min) [min, max] = [max, min];
        return Math.floor(this.next() * (max - min + 1)) + min;
    }
    /** Float in [min, max). */
    float(min, max) {
        return min + this.next() * (max - min);
    }
    /** True with probability p. */
    chance(p) {
        return this.next() < p;
    }
    /** Uniform pick, undefined on an empty list. */
    pick(list) {
        if (!list || list.length === 0)
            return undefined;
        return list[this.int(0, list.length - 1)];
    }
    /** Weighted pick: weights[i] corresponds to list[i]. Deterministic. */
    weighted(list, weightOf = (x) => x.weight ?? 1) {
        if (!list || list.length === 0)
            return undefined;
        let total = 0;
        for (const item of list) total += Math.max(0, weightOf(item));
        if (total <= 0)
            return list[0];
        let roll = this.next() * total;
        for (const item of list) {
            roll -= Math.max(0, weightOf(item));
            if (roll <= 0)
                return item;
        }
        return list[list.length - 1];
    }
    /** Fisher-Yates, in place (migrated behaviour: returns the same array). */
    shuffle(list) {
        for (let i = list.length - 1; i > 0; i--) {
            const j = this.int(0, i);
            [list[i], list[j]] = [list[j], list[i]];
        }
        return list;
    }
    /** A fresh, independent stream for a named subsystem. */
    derive(label) {
        return new Rng(mix(this.seed, hash(String(label))));
    }
    /** Reproduce a state exactly (used by tests and by the replay journal). */
    snapshot() {
        return { seed: this.seed, initial: this.initial, draws: this.draws };
    }
    static restore(snapshot) {
        const rng = new Rng(snapshot.initial ?? 0);
        rng.seed = snapshot.seed >>> 0;
        rng.initial = snapshot.initial >>> 0;
        rng.draws = snapshot.draws ?? 0;
        return rng;
    }
}

/** 32-bit string hash (djb2/xorshift mix), stable across engines. */
export function hash(text) {
    let h = 5381;
    for (let i = 0; i < text.length; i++)
        h = ((h << 5) + h) ^ text.charCodeAt(i);
    h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
    h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
    return (h ^ (h >>> 16)) >>> 0;
}

/** Combine several numbers/strings into one seed. Order matters, by design. */
export function mix(...parts) {
    let h = 0x811c9dc5;
    for (const part of parts) {
        const v = typeof part === "number" ? part >>> 0 : hash(String(part ?? ""));
        h ^= v;
        h = Math.imul(h, 0x01000193);
    }
    return (h ^ (h >>> 13)) >>> 0;
}

/** Seed derived from an ISO date - kept from the upstream migration. */
export function seedFromDate(dateString) {
    return hash(String(dateString).split("T")[0]);
}

/**
 * The seed a session runs on: whatever the world remembered, or a supplied
 * fallback. Storing it in the world is what makes a reload continue the same
 * random stream instead of restarting it.
 */
export const DEFAULT_SEED = 0x5eed_1234;

export function rngFor(seed, ...labels) {
    return new Rng(mix(seed >>> 0, ...labels));
}
