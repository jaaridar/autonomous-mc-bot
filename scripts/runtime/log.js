/**
 * console.warn rate limiter for the pack.
 *
 * Every console.warn in Bedrock is a native call that formats and writes a
 * content-log line (and draws it on screen when the content log GUI is on).
 * A fault that repeats every tick used to print 20 lines a second for as long
 * as it lasted, which is lag in its own right and buries the first useful
 * message. After install:
 *   - the same message (first 160 chars) prints at most once per 10 s; the
 *     next print says how many were folded in between;
 *   - at most 8 warnings per second get through in total.
 * Nothing is dropped silently forever: a folded message prints again with its
 * count as soon as its 10 s window is over.
 */
const FOLD_TICKS = 200;
const BURST_TICKS = 20;
const BURST_MAX = 8;

export function installWarnThrottle(system) {
    if (console.warn.__verdantThrottled) return;
    const original = console.warn.bind(console);
    const seen = new Map(); // message key -> { at, folded }
    let windowStart = -Infinity, windowCount = 0;
    const throttled = (...args) => {
        let tick = 0;
        try { tick = system.currentTick; } catch { tick = 0; }
        if (typeof tick !== "number") tick = 0;
        let msg;
        try { msg = args.map((a) => (typeof a === "string" ? a : String(a))).join(" "); } catch { msg = "[unprintable warning]"; }
        const key = msg.slice(0, 160);
        const s = seen.get(key);
        if (s && tick - s.at < FOLD_TICKS && tick >= s.at) { s.folded++; return; }
        if (tick - windowStart >= BURST_TICKS || tick < windowStart) { windowStart = tick; windowCount = 0; }
        if (++windowCount > BURST_MAX) {
            if (s) s.folded++;
            return;
        }
        const note = s && s.folded ? ` (+${s.folded} repeats folded)` : "";
        seen.set(key, { at: tick, folded: 0 });
        if (seen.size > 256) seen.delete(seen.keys().next().value);
        original(msg + note);
    };
    throttled.__verdantThrottled = true;
    console.warn = throttled;
}
