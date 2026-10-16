import { system } from "@minecraft/server";
class AsyncUtils {
    /**
     * Delays execution for a specified number of ticks.
     *
     * @param ticks - The number of ticks to wait before resolving the promise.
     * @returns A promise that resolves after the specified delay.
     */ static async delay(ticks) {
        return new Promise((resolve)=>system.runTimeout(resolve, ticks));
    }
    /**
     * Attempts to execute a synchronous method repeatedly at a specified interval until it succeeds (does not throw).
     * Returns a promise that resolves with the result of the method once it executes successfully.
     *
     * @template T The return type of the method.
     * @param method The synchronous function to attempt.
     * @param interval The interval in ticks (default is 1) between attempts.
     * @returns A promise that resolves with the result of the method once it succeeds.
     */ static async tryMethod(method, interval = 1) {
        return new Promise((resolve)=>{
            const job = system.runInterval(()=>{
                try {
                    const result = method();
                    system.clearRun(job);
                    resolve(result);
                } catch (e) {}
            }, interval);
        });
    }
    /**
     * Waits asynchronously until the provided condition function returns `true`.
     * Checks the condition at the specified interval (in ticks).
     *
     * @param condition - A function that returns a boolean indicating whether the condition has been met.
     * @param interval - The interval in ticks at which to check the condition. Defaults to 1.
     * @returns A promise that resolves when the condition returns `true`.
     */ static async waitForCondition(condition, interval = 1) {
        return new Promise((resolve)=>{
            const job = system.runInterval(()=>{
                if (condition()) {
                    system.clearRun(job);
                    resolve();
                }
            }, interval);
        });
    }
    /**
     * Waits asynchronously until the provided condition function returns `true`, or until
     * the specified timeout elapses. The interval is always cleared when the promise settles,
     * preventing runInterval job leaks.
     *
     * @param condition - A function that returns a boolean indicating whether the condition has been met.
     * @param maxWaitTicks - The maximum number of ticks to wait before resolving regardless of the condition.
     * @param interval - The interval in ticks at which to check the condition. Defaults to 1.
     * @returns A promise that resolves with `true` if the condition was met, or `false` if the timeout elapsed first.
     */ static async waitForConditionWithTimeout(condition, maxWaitTicks, interval = 1) {
        return new Promise((resolve)=>{
            let elapsed = 0;
            const job = system.runInterval(()=>{
                elapsed += interval;
                if (condition()) {
                    system.clearRun(job);
                    resolve(true);
                } else if (elapsed >= maxWaitTicks) {
                    system.clearRun(job);
                    resolve(false);
                }
            }, interval);
        });
    }
}
export { AsyncUtils as default };

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkFzeW5jVXRpbHMudHMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgc3lzdGVtIH0gZnJvbSBcIkBtaW5lY3JhZnQvc2VydmVyXCI7XHJcblxyXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBBc3luY1V0aWxzIHtcclxuICAgIC8qKlxyXG4gICAgICogRGVsYXlzIGV4ZWN1dGlvbiBmb3IgYSBzcGVjaWZpZWQgbnVtYmVyIG9mIHRpY2tzLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSB0aWNrcyAtIFRoZSBudW1iZXIgb2YgdGlja3MgdG8gd2FpdCBiZWZvcmUgcmVzb2x2aW5nIHRoZSBwcm9taXNlLlxyXG4gICAgICogQHJldHVybnMgQSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgYWZ0ZXIgdGhlIHNwZWNpZmllZCBkZWxheS5cclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBhc3luYyBkZWxheSh0aWNrczogbnVtYmVyKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiBzeXN0ZW0ucnVuVGltZW91dChyZXNvbHZlLCB0aWNrcykpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQXR0ZW1wdHMgdG8gZXhlY3V0ZSBhIHN5bmNocm9ub3VzIG1ldGhvZCByZXBlYXRlZGx5IGF0IGEgc3BlY2lmaWVkIGludGVydmFsIHVudGlsIGl0IHN1Y2NlZWRzIChkb2VzIG5vdCB0aHJvdykuXHJcbiAgICAgKiBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHdpdGggdGhlIHJlc3VsdCBvZiB0aGUgbWV0aG9kIG9uY2UgaXQgZXhlY3V0ZXMgc3VjY2Vzc2Z1bGx5LlxyXG4gICAgICpcclxuICAgICAqIEB0ZW1wbGF0ZSBUIFRoZSByZXR1cm4gdHlwZSBvZiB0aGUgbWV0aG9kLlxyXG4gICAgICogQHBhcmFtIG1ldGhvZCBUaGUgc3luY2hyb25vdXMgZnVuY3Rpb24gdG8gYXR0ZW1wdC5cclxuICAgICAqIEBwYXJhbSBpbnRlcnZhbCBUaGUgaW50ZXJ2YWwgaW4gdGlja3MgKGRlZmF1bHQgaXMgMSkgYmV0d2VlbiBhdHRlbXB0cy5cclxuICAgICAqIEByZXR1cm5zIEEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHdpdGggdGhlIHJlc3VsdCBvZiB0aGUgbWV0aG9kIG9uY2UgaXQgc3VjY2VlZHMuXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgYXN5bmMgdHJ5TWV0aG9kPFQ+KG1ldGhvZDogKCkgPT4gVCwgaW50ZXJ2YWw6IG51bWJlciA9IDEpOiBQcm9taXNlPFQ+IHtcclxuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcclxuICAgICAgICAgICAgY29uc3Qgam9iID0gc3lzdGVtLnJ1bkludGVydmFsKCgpID0+IHtcclxuICAgICAgICAgICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gbWV0aG9kKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgc3lzdGVtLmNsZWFyUnVuKGpvYik7XHJcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZShyZXN1bHQpO1xyXG4gICAgICAgICAgICAgICAgfSBjYXRjaCAoZSkge31cclxuICAgICAgICAgICAgfSwgaW50ZXJ2YWwpO1xyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogV2FpdHMgYXN5bmNocm9ub3VzbHkgdW50aWwgdGhlIHByb3ZpZGVkIGNvbmRpdGlvbiBmdW5jdGlvbiByZXR1cm5zIGB0cnVlYC5cclxuICAgICAqIENoZWNrcyB0aGUgY29uZGl0aW9uIGF0IHRoZSBzcGVjaWZpZWQgaW50ZXJ2YWwgKGluIHRpY2tzKS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gY29uZGl0aW9uIC0gQSBmdW5jdGlvbiB0aGF0IHJldHVybnMgYSBib29sZWFuIGluZGljYXRpbmcgd2hldGhlciB0aGUgY29uZGl0aW9uIGhhcyBiZWVuIG1ldC5cclxuICAgICAqIEBwYXJhbSBpbnRlcnZhbCAtIFRoZSBpbnRlcnZhbCBpbiB0aWNrcyBhdCB3aGljaCB0byBjaGVjayB0aGUgY29uZGl0aW9uLiBEZWZhdWx0cyB0byAxLlxyXG4gICAgICogQHJldHVybnMgQSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgd2hlbiB0aGUgY29uZGl0aW9uIHJldHVybnMgYHRydWVgLlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGFzeW5jIHdhaXRGb3JDb25kaXRpb24oY29uZGl0aW9uOiAoKSA9PiBib29sZWFuLCBpbnRlcnZhbDogbnVtYmVyID0gMSk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBqb2IgPSBzeXN0ZW0ucnVuSW50ZXJ2YWwoKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgaWYgKGNvbmRpdGlvbigpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgc3lzdGVtLmNsZWFyUnVuKGpvYik7XHJcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSgpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9LCBpbnRlcnZhbCk7XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBXYWl0cyBhc3luY2hyb25vdXNseSB1bnRpbCB0aGUgcHJvdmlkZWQgY29uZGl0aW9uIGZ1bmN0aW9uIHJldHVybnMgYHRydWVgLCBvciB1bnRpbFxyXG4gICAgICogdGhlIHNwZWNpZmllZCB0aW1lb3V0IGVsYXBzZXMuIFRoZSBpbnRlcnZhbCBpcyBhbHdheXMgY2xlYXJlZCB3aGVuIHRoZSBwcm9taXNlIHNldHRsZXMsXHJcbiAgICAgKiBwcmV2ZW50aW5nIHJ1bkludGVydmFsIGpvYiBsZWFrcy5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gY29uZGl0aW9uIC0gQSBmdW5jdGlvbiB0aGF0IHJldHVybnMgYSBib29sZWFuIGluZGljYXRpbmcgd2hldGhlciB0aGUgY29uZGl0aW9uIGhhcyBiZWVuIG1ldC5cclxuICAgICAqIEBwYXJhbSBtYXhXYWl0VGlja3MgLSBUaGUgbWF4aW11bSBudW1iZXIgb2YgdGlja3MgdG8gd2FpdCBiZWZvcmUgcmVzb2x2aW5nIHJlZ2FyZGxlc3Mgb2YgdGhlIGNvbmRpdGlvbi5cclxuICAgICAqIEBwYXJhbSBpbnRlcnZhbCAtIFRoZSBpbnRlcnZhbCBpbiB0aWNrcyBhdCB3aGljaCB0byBjaGVjayB0aGUgY29uZGl0aW9uLiBEZWZhdWx0cyB0byAxLlxyXG4gICAgICogQHJldHVybnMgQSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgd2l0aCBgdHJ1ZWAgaWYgdGhlIGNvbmRpdGlvbiB3YXMgbWV0LCBvciBgZmFsc2VgIGlmIHRoZSB0aW1lb3V0IGVsYXBzZWQgZmlyc3QuXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgYXN5bmMgd2FpdEZvckNvbmRpdGlvbldpdGhUaW1lb3V0KFxyXG4gICAgICAgIGNvbmRpdGlvbjogKCkgPT4gYm9vbGVhbixcclxuICAgICAgICBtYXhXYWl0VGlja3M6IG51bWJlcixcclxuICAgICAgICBpbnRlcnZhbDogbnVtYmVyID0gMVxyXG4gICAgKTogUHJvbWlzZTxib29sZWFuPiB7XHJcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XHJcbiAgICAgICAgICAgIGxldCBlbGFwc2VkID0gMDtcclxuICAgICAgICAgICAgY29uc3Qgam9iID0gc3lzdGVtLnJ1bkludGVydmFsKCgpID0+IHtcclxuICAgICAgICAgICAgICAgIGVsYXBzZWQgKz0gaW50ZXJ2YWw7XHJcbiAgICAgICAgICAgICAgICBpZiAoY29uZGl0aW9uKCkpIHtcclxuICAgICAgICAgICAgICAgICAgICBzeXN0ZW0uY2xlYXJSdW4oam9iKTtcclxuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKHRydWUpO1xyXG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChlbGFwc2VkID49IG1heFdhaXRUaWNrcykge1xyXG4gICAgICAgICAgICAgICAgICAgIHN5c3RlbS5jbGVhclJ1bihqb2IpO1xyXG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoZmFsc2UpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9LCBpbnRlcnZhbCk7XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcbn1cclxuIl0sIm5hbWVzIjpbInN5c3RlbSIsIkFzeW5jVXRpbHMiLCJkZWxheSIsInRpY2tzIiwiUHJvbWlzZSIsInJlc29sdmUiLCJydW5UaW1lb3V0IiwidHJ5TWV0aG9kIiwibWV0aG9kIiwiaW50ZXJ2YWwiLCJqb2IiLCJydW5JbnRlcnZhbCIsInJlc3VsdCIsImNsZWFyUnVuIiwiZSIsIndhaXRGb3JDb25kaXRpb24iLCJjb25kaXRpb24iLCJ3YWl0Rm9yQ29uZGl0aW9uV2l0aFRpbWVvdXQiLCJtYXhXYWl0VGlja3MiLCJlbGFwc2VkIl0sIm1hcHBpbmdzIjoiQUFBQSxTQUFTQSxNQUFNLFFBQVEsb0JBQW9CO0FBRTVCLE1BQU1DO0lBQ2pCOzs7OztLQUtDLEdBQ0QsYUFBb0JDLE1BQU1DLEtBQWEsRUFBaUI7UUFDcEQsT0FBTyxJQUFJQyxRQUFRLENBQUNDLFVBQVlMLE9BQU9NLFVBQVUsQ0FBQ0QsU0FBU0Y7SUFDL0Q7SUFFQTs7Ozs7Ozs7S0FRQyxHQUNELGFBQW9CSSxVQUFhQyxNQUFlLEVBQUVDLFdBQW1CLENBQUMsRUFBYztRQUNoRixPQUFPLElBQUlMLFFBQVEsQ0FBQ0M7WUFDaEIsTUFBTUssTUFBTVYsT0FBT1csV0FBVyxDQUFDO2dCQUMzQixJQUFJO29CQUNBLE1BQU1DLFNBQVNKO29CQUNmUixPQUFPYSxRQUFRLENBQUNIO29CQUNoQkwsUUFBUU87Z0JBQ1osRUFBRSxPQUFPRSxHQUFHLENBQUM7WUFDakIsR0FBR0w7UUFDUDtJQUNKO0lBRUE7Ozs7Ozs7S0FPQyxHQUNELGFBQW9CTSxpQkFBaUJDLFNBQXdCLEVBQUVQLFdBQW1CLENBQUMsRUFBaUI7UUFDaEcsT0FBTyxJQUFJTCxRQUFRLENBQUNDO1lBQ2hCLE1BQU1LLE1BQU1WLE9BQU9XLFdBQVcsQ0FBQztnQkFDM0IsSUFBSUssYUFBYTtvQkFDYmhCLE9BQU9hLFFBQVEsQ0FBQ0g7b0JBQ2hCTDtnQkFDSjtZQUNKLEdBQUdJO1FBQ1A7SUFDSjtJQUVBOzs7Ozs7Ozs7S0FTQyxHQUNELGFBQW9CUSw0QkFDaEJELFNBQXdCLEVBQ3hCRSxZQUFvQixFQUNwQlQsV0FBbUIsQ0FBQyxFQUNKO1FBQ2hCLE9BQU8sSUFBSUwsUUFBUSxDQUFDQztZQUNoQixJQUFJYyxVQUFVO1lBQ2QsTUFBTVQsTUFBTVYsT0FBT1csV0FBVyxDQUFDO2dCQUMzQlEsV0FBV1Y7Z0JBQ1gsSUFBSU8sYUFBYTtvQkFDYmhCLE9BQU9hLFFBQVEsQ0FBQ0g7b0JBQ2hCTCxRQUFRO2dCQUNaLE9BQU8sSUFBSWMsV0FBV0QsY0FBYztvQkFDaENsQixPQUFPYSxRQUFRLENBQUNIO29CQUNoQkwsUUFBUTtnQkFDWjtZQUNKLEdBQUdJO1FBQ1A7SUFDSjtBQUNKO0FBaEZBLFNBQXFCUix3QkFnRnBCIn0=