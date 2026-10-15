export class TaskFault extends Error {
    constructor(message, recovery = "manual") {
        super(message);
        this.recovery = recovery;
        this.name = "TaskFault";
    }
}
export function blockedTask(reason, recovery, attempt, tick) {
    const retrying = recovery === "retry";
    // Bounded backoff, but never a dead end: retry blocks keep coming back (delay capped at about a minute).
    // Only explicitly manual blocks (owner hold / equipment faults) wait for the owner.
    const delay = Math.min(40 * 2 ** Math.max(0, attempt - 1), 1200);
    return {
        reason,
        recovery: retrying ? "retry" : "manual",
        attempt,
        since: tick,
        retryAt: retrying ? tick + delay : undefined,
    };
}
