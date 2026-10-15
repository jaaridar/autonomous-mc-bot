export const STATUS = Object.freeze({ RUNNING: "running", SUCCESS: "success", FAILED: "failed" });

export const REASON = Object.freeze({
    NO_PATH: "no_path",
    NO_TARGET: "no_target",
    TOOL_TIER: "tool_tier_too_low",
    TOOL_BROKEN: "tool_broken",
    HAZARD: "hazard",
    INVENTORY_FULL: "inventory_full",
    MISSING_ITEM: "missing_item",
    TIMEOUT: "timeout",
    PRECONDITION: "precondition_failed",
    POSTCONDITION: "postcondition_failed",
    UNSAFE: "rule_violation",
    INTERRUPTED: "interrupted",
    UNKNOWN: "unknown",
});

export const running = (info = "") => ({ status: STATUS.RUNNING, info });
export const success = (info = "") => ({ status: STATUS.SUCCESS, info });
export const failed = (reason = REASON.UNKNOWN, detail = "") => ({ status: STATUS.FAILED, reason, detail });

export const isRunning = (r) => r?.status === STATUS.RUNNING;
export const isSuccess = (r) => r?.status === STATUS.SUCCESS;
export const isFailed = (r) => r?.status === STATUS.FAILED;

export function coerce(r) {
    if (r && typeof r === "object" && "status" in r) return r;
    if (r === true) return running("legacy:true");
    if (r === false || r === undefined || r === null) return failed(REASON.UNKNOWN, "legacy:falsy");
    if (r === "done") return success("legacy:done");
    if (r === "failed") return failed(REASON.UNKNOWN, "legacy:failed");
    return running(String(r));
}
