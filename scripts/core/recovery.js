export class TaskFault extends Error {
    constructor(message, recovery = "manual") {
        super(message);
        this.recovery = recovery;
        this.name = "TaskFault";
    }
}
export function blockedTask(reason, recovery, attempt, tick) {
    return {
        reason,
        recovery: recovery === "retry" && attempt <= 3 ? "retry" : "manual",
        attempt,
        since: tick,
        retryAt: recovery === "retry" && attempt <= 3
            ? tick + 40 * 2 ** (attempt - 1)
            : undefined,
    };
}
