import { system } from "@minecraft/server";
// const a = Object.getOwnPropertyNames(Date.prototype);
// console.warn([...a.values()].join("\n"));
const dateClock = ()=>new Date().getTime() * 1000;
const firstTick = system.currentTick;
/**
 * DebugTimer is a utility for timing and profiling code execution.
 * Use this class to measure performance of code blocks, count events, and generate reports.
 * @example
 * ```ts
 * DebugTimer.countStart("myEvent");
 * // ... code ...
 * DebugTimer.countEnd();
 * ``` */ class _DebugTimer {
    static get now() {
        return dateClock();
    }
    /**
     * Starts a timer for the given ID.
     * @param id - The timer ID.
     */ static time(id) {
        _DebugTimer.timers[id] = this.now;
    }
    /**
     * Logs the elapsed time for the given ID with a description.
     * @param id - The timer ID.
     * @param description - Description of the timed code.
     */ static timeLog(id, description) {
        if (!_DebugTimer.isOn) return;
        if (!_DebugTimer.timers[id]) {
            return console.warn(`Timer ${id} not found`);
        }
        console.warn(`Timer §2${id} §a§l${description} §rtook §b§l${this.now - _DebugTimer.timers[id]}§r microseconds`);
        _DebugTimer.timers[id] = this.now;
    }
    /**
     * Starts counting an event occurrence for profiling.
     * @param id - The event ID.
     */ static countStart(id) {
        if (!_DebugTimer.isOn) return;
        // Check if parent was skipped - if so, skip this too
        const parentSkipped = _DebugTimer.skipStack[_DebugTimer.skipStack.length - 1] ?? false;
        // Apply sampling (skip this execution?)
        // Note: when samplingRate === 1, we always profile and skip the Math.random() check for performance.
        const shouldSkip = parentSkipped || _DebugTimer.samplingRate < 1 && Math.random() > _DebugTimer.samplingRate;
        _DebugTimer.countersStack.push(id);
        _DebugTimer.skipStack.push(shouldSkip);
        if (shouldSkip) return;
        _DebugTimer.countersCache[id] = this.now;
    }
    /**
     * Ends counting an event occurrence and records the time.
     */ static countEnd() {
        if (!_DebugTimer.isOn) return;
        if (_DebugTimer.countersStack.length === 0) {
            console.warn("DebugTimer.countEnd() called without matching countStart()");
            return;
        }
        const id = _DebugTimer.countersStack.pop();
        const skipped = _DebugTimer.skipStack.pop();
        if (skipped) return; // Don't record skipped executions
        const timeElapsed = this.now - _DebugTimer.countersCache[id];
        const multiplier = 1 / _DebugTimer.samplingRate;
        if (!_DebugTimer.counters[id]) {
            _DebugTimer.counters[id] = {
                count: multiplier,
                time: timeElapsed * multiplier,
                timeExclusive: timeElapsed * multiplier,
                minTime: timeElapsed,
                maxTime: timeElapsed
            };
        } else {
            _DebugTimer.counters[id].count += multiplier;
            _DebugTimer.counters[id].time += timeElapsed * multiplier;
            _DebugTimer.counters[id].timeExclusive += (timeElapsed - (_DebugTimer.countersCacheExclusive[id] || 0)) * multiplier;
            _DebugTimer.counters[id].minTime = Math.min(_DebugTimer.counters[id].minTime, timeElapsed);
            _DebugTimer.counters[id].maxTime = Math.max(_DebugTimer.counters[id].maxTime, timeElapsed);
            _DebugTimer.countersCacheExclusive[id] = 0;
        }
        const stackId = _DebugTimer.countersStack[_DebugTimer.countersStack.length - 1];
        if (stackId !== undefined && !skipped && !_DebugTimer.skipStack[_DebugTimer.skipStack.length - 1]) {
            _DebugTimer.countersCacheExclusive[stackId] = (_DebugTimer.countersCacheExclusive[stackId] || 0) + timeElapsed;
        }
    }
    /**
     * Clears all timers and counters.
     */ static clear() {
        _DebugTimer.timers = {};
        _DebugTimer.countersCache = {};
        _DebugTimer.countersCacheExclusive = {};
        _DebugTimer.counters = {};
        _DebugTimer.countersStack = [];
        _DebugTimer.skipStack = [];
    }
    /**
     * Prints a report of all timers and counters to the console.
     */ static report() {
        console.warn(_DebugTimer.generateTableReport());
    }
    /**
     * Generates structured report data suitable for logging and analysis.
     * @returns Object containing counters array and metadata.
     */ static generateReport() {
        const sortedEntries = Object.entries(_DebugTimer.counters).sort((a, b)=>b[1].time - a[1].time);
        const ticksSinceStart = system.currentTick - firstTick;
        return {
            counters: sortedEntries.map(([id, counter])=>({
                    id,
                    count: counter.count,
                    timeMs: Number((counter.time / 1000).toFixed(2)),
                    timeExclusiveMs: Number((counter.timeExclusive / 1000).toFixed(2)),
                    timeDiffMs: Number(((counter.time - counter.timeExclusive) / 1000).toFixed(2)),
                    averageMs: Number((counter.time / ticksSinceStart / 1000).toFixed(3)),
                    countsPerTick: Number((counter.count / ticksSinceStart).toFixed(2)),
                    minMs: Number((counter.minTime / 1000).toFixed(3)),
                    maxMs: Number((counter.maxTime / 1000).toFixed(3))
                })),
            metadata: {
                ticksSinceStart,
                currentTick: system.currentTick,
                totalCounters: sortedEntries.length,
                samplingRate: _DebugTimer.samplingRate
            }
        };
    }
    /**
     * Gets the top N counters sorted by total time as structured objects.
     * @param n - Number of top entries to return.
     * @returns Array of counter objects with structured data.
     */ static getTopCounters(n) {
        const report = _DebugTimer.generateReport();
        return report.counters.slice(0, n);
    }
    /**
     * Generates a formatted table report of all timers and counters.
     * @returns The report as a string.
     */ static generateTableReport() {
        const sortedEntries = Object.entries(_DebugTimer.counters).sort((a, b)=>b[1].time - a[1].time);
        let report = "```";
        report += "DebugTimer report:\n";
        if (_DebugTimer.samplingRate < 1) {
            report += `(Sampling ${(_DebugTimer.samplingRate * 100).toFixed(1)}% of executions - counts and times are estimates)\n`;
        }
        report += "Counters:\n";
        report += "| ID                                       | Count | CPT     | Time      | Time Excl | Time Diff | Average   |\n";
        report += "|------------------------------------------|-------|---------|-----------|-----------|-----------|-----------|\n";
        for (const [id, counter] of sortedEntries){
            report += `| ${id.padEnd(40)} `;
            report += `| ${counter.count.toString().padStart(5)} `;
            report += `| ${(counter.count / (system.currentTick - firstTick)).toFixed(2).padStart(7)} `;
            report += `| ${(counter.time / 1000).toString().padStart(7)}ms `;
            report += `| ${(counter.timeExclusive / 1000).toString().padStart(7)}ms `;
            report += `| ${(counter.time / 1000 - counter.timeExclusive / 1000).toString().padStart(7)}ms `;
            report += `| ${(counter.time / (system.currentTick - firstTick) / 1000).toFixed(3).padStart(7)}ms |\n`;
        }
        report += "```";
        return report;
    }
}
_DebugTimer.isOn = false;
/**
     * Sampling rate for profiling as a percentage (0-1).
     * 1.0 = profile 100% of executions (default)
     * 0.1 = profile 10% of executions
     * 0.01 = profile 1% of executions
     */ _DebugTimer.samplingRate = 1.0;
_DebugTimer.timers = {};
_DebugTimer.countersCache = {};
_DebugTimer.countersCacheExclusive = {};
_DebugTimer.counters = {};
_DebugTimer.countersStack = [];
_DebugTimer.skipStack = [] // Track if current execution is being profiled
;
globalThis.DebugTimer = _DebugTimer;

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkRlYnVnVGltZXIudHMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgc3lzdGVtIH0gZnJvbSBcIkBtaW5lY3JhZnQvc2VydmVyXCI7XHJcblxyXG4vLyBjb25zdCBhID0gT2JqZWN0LmdldE93blByb3BlcnR5TmFtZXMoRGF0ZS5wcm90b3R5cGUpO1xyXG4vLyBjb25zb2xlLndhcm4oWy4uLmEudmFsdWVzKCldLmpvaW4oXCJcXG5cIikpO1xyXG5cclxuY29uc3QgZGF0ZUNsb2NrOiAoKSA9PiBudW1iZXIgPSAoKSA9PiBuZXcgRGF0ZSgpLmdldFRpbWUoKSAqIDEwMDA7XHJcbmNvbnN0IGZpcnN0VGljayA9IHN5c3RlbS5jdXJyZW50VGljaztcclxuXHJcbi8qKlxyXG4gKiBEZWJ1Z1RpbWVyIGlzIGEgdXRpbGl0eSBmb3IgdGltaW5nIGFuZCBwcm9maWxpbmcgY29kZSBleGVjdXRpb24uXHJcbiAqIFVzZSB0aGlzIGNsYXNzIHRvIG1lYXN1cmUgcGVyZm9ybWFuY2Ugb2YgY29kZSBibG9ja3MsIGNvdW50IGV2ZW50cywgYW5kIGdlbmVyYXRlIHJlcG9ydHMuXHJcbiAqIEBleGFtcGxlXHJcbiAqIGBgYHRzXHJcbiAqIERlYnVnVGltZXIuY291bnRTdGFydChcIm15RXZlbnRcIik7XHJcbiAqIC8vIC4uLiBjb2RlIC4uLlxyXG4gKiBEZWJ1Z1RpbWVyLmNvdW50RW5kKCk7XHJcbiAqIGBgYCAqL1xyXG5jbGFzcyBfRGVidWdUaW1lciB7XHJcbiAgICBwcml2YXRlIHN0YXRpYyBnZXQgbm93KCk6IG51bWJlciB7XHJcbiAgICAgICAgcmV0dXJuIGRhdGVDbG9jaygpO1xyXG4gICAgfVxyXG5cclxuICAgIHB1YmxpYyBzdGF0aWMgaXNPbiA9IGZhbHNlO1xyXG5cclxuICAgIC8qKlxyXG4gICAgICogU2FtcGxpbmcgcmF0ZSBmb3IgcHJvZmlsaW5nIGFzIGEgcGVyY2VudGFnZSAoMC0xKS5cclxuICAgICAqIDEuMCA9IHByb2ZpbGUgMTAwJSBvZiBleGVjdXRpb25zIChkZWZhdWx0KVxyXG4gICAgICogMC4xID0gcHJvZmlsZSAxMCUgb2YgZXhlY3V0aW9uc1xyXG4gICAgICogMC4wMSA9IHByb2ZpbGUgMSUgb2YgZXhlY3V0aW9uc1xyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHNhbXBsaW5nUmF0ZSA9IDEuMDtcclxuXHJcbiAgICBwcml2YXRlIHN0YXRpYyB0aW1lcnMgPSB7fSBhcyBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+O1xyXG4gICAgcHJpdmF0ZSBzdGF0aWMgY291bnRlcnNDYWNoZSA9IHt9IGFzIFJlY29yZDxzdHJpbmcsIG51bWJlcj47XHJcbiAgICBwcml2YXRlIHN0YXRpYyBjb3VudGVyc0NhY2hlRXhjbHVzaXZlID0ge30gYXMgUmVjb3JkPHN0cmluZywgbnVtYmVyPjtcclxuICAgIHByaXZhdGUgc3RhdGljIGNvdW50ZXJzID0ge30gYXMgUmVjb3JkPFxyXG4gICAgICAgIHN0cmluZyxcclxuICAgICAgICB7IGNvdW50OiBudW1iZXI7IHRpbWU6IG51bWJlcjsgdGltZUV4Y2x1c2l2ZTogbnVtYmVyOyBtaW5UaW1lOiBudW1iZXI7IG1heFRpbWU6IG51bWJlciB9XHJcbiAgICA+O1xyXG5cclxuICAgIHByaXZhdGUgc3RhdGljIGNvdW50ZXJzU3RhY2sgPSBbXSBhcyBzdHJpbmdbXTtcclxuICAgIHByaXZhdGUgc3RhdGljIHNraXBTdGFjayA9IFtdIGFzIGJvb2xlYW5bXTsgLy8gVHJhY2sgaWYgY3VycmVudCBleGVjdXRpb24gaXMgYmVpbmcgcHJvZmlsZWRcclxuXHJcbiAgICAvKipcclxuICAgICAqIFN0YXJ0cyBhIHRpbWVyIGZvciB0aGUgZ2l2ZW4gSUQuXHJcbiAgICAgKiBAcGFyYW0gaWQgLSBUaGUgdGltZXIgSUQuXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgdGltZShpZDogc3RyaW5nKSB7XHJcbiAgICAgICAgX0RlYnVnVGltZXIudGltZXJzW2lkXSA9IHRoaXMubm93O1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogTG9ncyB0aGUgZWxhcHNlZCB0aW1lIGZvciB0aGUgZ2l2ZW4gSUQgd2l0aCBhIGRlc2NyaXB0aW9uLlxyXG4gICAgICogQHBhcmFtIGlkIC0gVGhlIHRpbWVyIElELlxyXG4gICAgICogQHBhcmFtIGRlc2NyaXB0aW9uIC0gRGVzY3JpcHRpb24gb2YgdGhlIHRpbWVkIGNvZGUuXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgdGltZUxvZyhpZDogc3RyaW5nLCBkZXNjcmlwdGlvbjogc3RyaW5nKSB7XHJcbiAgICAgICAgaWYgKCFfRGVidWdUaW1lci5pc09uKSByZXR1cm47XHJcbiAgICAgICAgaWYgKCFfRGVidWdUaW1lci50aW1lcnNbaWRdKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBjb25zb2xlLndhcm4oYFRpbWVyICR7aWR9IG5vdCBmb3VuZGApO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc29sZS53YXJuKGBUaW1lciDCpzIke2lkfSDCp2HCp2wke2Rlc2NyaXB0aW9ufSDCp3J0b29rIMKnYsKnbCR7dGhpcy5ub3cgLSBfRGVidWdUaW1lci50aW1lcnNbaWRdfcKnciBtaWNyb3NlY29uZHNgKTtcclxuICAgICAgICBfRGVidWdUaW1lci50aW1lcnNbaWRdID0gdGhpcy5ub3c7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBTdGFydHMgY291bnRpbmcgYW4gZXZlbnQgb2NjdXJyZW5jZSBmb3IgcHJvZmlsaW5nLlxyXG4gICAgICogQHBhcmFtIGlkIC0gVGhlIGV2ZW50IElELlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGNvdW50U3RhcnQoaWQ6IHN0cmluZykge1xyXG4gICAgICAgIGlmICghX0RlYnVnVGltZXIuaXNPbikgcmV0dXJuO1xyXG5cclxuICAgICAgICAvLyBDaGVjayBpZiBwYXJlbnQgd2FzIHNraXBwZWQgLSBpZiBzbywgc2tpcCB0aGlzIHRvb1xyXG4gICAgICAgIGNvbnN0IHBhcmVudFNraXBwZWQgPSBfRGVidWdUaW1lci5za2lwU3RhY2tbX0RlYnVnVGltZXIuc2tpcFN0YWNrLmxlbmd0aCAtIDFdID8/IGZhbHNlO1xyXG5cclxuICAgICAgICAvLyBBcHBseSBzYW1wbGluZyAoc2tpcCB0aGlzIGV4ZWN1dGlvbj8pXHJcbiAgICAgICAgLy8gTm90ZTogd2hlbiBzYW1wbGluZ1JhdGUgPT09IDEsIHdlIGFsd2F5cyBwcm9maWxlIGFuZCBza2lwIHRoZSBNYXRoLnJhbmRvbSgpIGNoZWNrIGZvciBwZXJmb3JtYW5jZS5cclxuICAgICAgICBjb25zdCBzaG91bGRTa2lwID0gcGFyZW50U2tpcHBlZCB8fCAoX0RlYnVnVGltZXIuc2FtcGxpbmdSYXRlIDwgMSAmJiBNYXRoLnJhbmRvbSgpID4gX0RlYnVnVGltZXIuc2FtcGxpbmdSYXRlKTtcclxuXHJcbiAgICAgICAgX0RlYnVnVGltZXIuY291bnRlcnNTdGFjay5wdXNoKGlkKTtcclxuICAgICAgICBfRGVidWdUaW1lci5za2lwU3RhY2sucHVzaChzaG91bGRTa2lwKTtcclxuXHJcbiAgICAgICAgaWYgKHNob3VsZFNraXApIHJldHVybjtcclxuXHJcbiAgICAgICAgX0RlYnVnVGltZXIuY291bnRlcnNDYWNoZVtpZF0gPSB0aGlzLm5vdztcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEVuZHMgY291bnRpbmcgYW4gZXZlbnQgb2NjdXJyZW5jZSBhbmQgcmVjb3JkcyB0aGUgdGltZS5cclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBjb3VudEVuZCgpIHtcclxuICAgICAgICBpZiAoIV9EZWJ1Z1RpbWVyLmlzT24pIHJldHVybjtcclxuICAgICAgICBpZiAoX0RlYnVnVGltZXIuY291bnRlcnNTdGFjay5sZW5ndGggPT09IDApIHtcclxuICAgICAgICAgICAgY29uc29sZS53YXJuKFwiRGVidWdUaW1lci5jb3VudEVuZCgpIGNhbGxlZCB3aXRob3V0IG1hdGNoaW5nIGNvdW50U3RhcnQoKVwiKTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuICAgICAgICBjb25zdCBpZCA9IF9EZWJ1Z1RpbWVyLmNvdW50ZXJzU3RhY2sucG9wKCkgYXMgc3RyaW5nO1xyXG4gICAgICAgIGNvbnN0IHNraXBwZWQgPSBfRGVidWdUaW1lci5za2lwU3RhY2sucG9wKCkgYXMgYm9vbGVhbjtcclxuXHJcbiAgICAgICAgaWYgKHNraXBwZWQpIHJldHVybjsgLy8gRG9uJ3QgcmVjb3JkIHNraXBwZWQgZXhlY3V0aW9uc1xyXG5cclxuICAgICAgICBjb25zdCB0aW1lRWxhcHNlZCA9IHRoaXMubm93IC0gX0RlYnVnVGltZXIuY291bnRlcnNDYWNoZVtpZF07XHJcbiAgICAgICAgY29uc3QgbXVsdGlwbGllciA9IDEgLyBfRGVidWdUaW1lci5zYW1wbGluZ1JhdGU7XHJcblxyXG4gICAgICAgIGlmICghX0RlYnVnVGltZXIuY291bnRlcnNbaWRdKSB7XHJcbiAgICAgICAgICAgIF9EZWJ1Z1RpbWVyLmNvdW50ZXJzW2lkXSA9IHtcclxuICAgICAgICAgICAgICAgIGNvdW50OiBtdWx0aXBsaWVyLFxyXG4gICAgICAgICAgICAgICAgdGltZTogdGltZUVsYXBzZWQgKiBtdWx0aXBsaWVyLFxyXG4gICAgICAgICAgICAgICAgdGltZUV4Y2x1c2l2ZTogdGltZUVsYXBzZWQgKiBtdWx0aXBsaWVyLFxyXG4gICAgICAgICAgICAgICAgbWluVGltZTogdGltZUVsYXBzZWQsXHJcbiAgICAgICAgICAgICAgICBtYXhUaW1lOiB0aW1lRWxhcHNlZCxcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICBfRGVidWdUaW1lci5jb3VudGVyc1tpZF0uY291bnQgKz0gbXVsdGlwbGllcjtcclxuICAgICAgICAgICAgX0RlYnVnVGltZXIuY291bnRlcnNbaWRdLnRpbWUgKz0gdGltZUVsYXBzZWQgKiBtdWx0aXBsaWVyO1xyXG4gICAgICAgICAgICBfRGVidWdUaW1lci5jb3VudGVyc1tpZF0udGltZUV4Y2x1c2l2ZSArPSAodGltZUVsYXBzZWQgLSAoX0RlYnVnVGltZXIuY291bnRlcnNDYWNoZUV4Y2x1c2l2ZVtpZF0gfHwgMCkpICogbXVsdGlwbGllcjtcclxuICAgICAgICAgICAgX0RlYnVnVGltZXIuY291bnRlcnNbaWRdLm1pblRpbWUgPSBNYXRoLm1pbihfRGVidWdUaW1lci5jb3VudGVyc1tpZF0ubWluVGltZSwgdGltZUVsYXBzZWQpO1xyXG4gICAgICAgICAgICBfRGVidWdUaW1lci5jb3VudGVyc1tpZF0ubWF4VGltZSA9IE1hdGgubWF4KF9EZWJ1Z1RpbWVyLmNvdW50ZXJzW2lkXS5tYXhUaW1lLCB0aW1lRWxhcHNlZCk7XHJcbiAgICAgICAgICAgIF9EZWJ1Z1RpbWVyLmNvdW50ZXJzQ2FjaGVFeGNsdXNpdmVbaWRdID0gMDtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGNvbnN0IHN0YWNrSWQgPSBfRGVidWdUaW1lci5jb3VudGVyc1N0YWNrW19EZWJ1Z1RpbWVyLmNvdW50ZXJzU3RhY2subGVuZ3RoIC0gMV07XHJcbiAgICAgICAgaWYgKHN0YWNrSWQgIT09IHVuZGVmaW5lZCAmJiAhc2tpcHBlZCAmJiAhX0RlYnVnVGltZXIuc2tpcFN0YWNrW19EZWJ1Z1RpbWVyLnNraXBTdGFjay5sZW5ndGggLSAxXSkge1xyXG4gICAgICAgICAgICBfRGVidWdUaW1lci5jb3VudGVyc0NhY2hlRXhjbHVzaXZlW3N0YWNrSWRdID0gKF9EZWJ1Z1RpbWVyLmNvdW50ZXJzQ2FjaGVFeGNsdXNpdmVbc3RhY2tJZF0gfHwgMCkgKyB0aW1lRWxhcHNlZDtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBDbGVhcnMgYWxsIHRpbWVycyBhbmQgY291bnRlcnMuXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgY2xlYXIoKSB7XHJcbiAgICAgICAgX0RlYnVnVGltZXIudGltZXJzID0ge307XHJcbiAgICAgICAgX0RlYnVnVGltZXIuY291bnRlcnNDYWNoZSA9IHt9O1xyXG4gICAgICAgIF9EZWJ1Z1RpbWVyLmNvdW50ZXJzQ2FjaGVFeGNsdXNpdmUgPSB7fTtcclxuICAgICAgICBfRGVidWdUaW1lci5jb3VudGVycyA9IHt9O1xyXG4gICAgICAgIF9EZWJ1Z1RpbWVyLmNvdW50ZXJzU3RhY2sgPSBbXTtcclxuICAgICAgICBfRGVidWdUaW1lci5za2lwU3RhY2sgPSBbXTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFByaW50cyBhIHJlcG9ydCBvZiBhbGwgdGltZXJzIGFuZCBjb3VudGVycyB0byB0aGUgY29uc29sZS5cclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyByZXBvcnQoKSB7XHJcbiAgICAgICAgY29uc29sZS53YXJuKF9EZWJ1Z1RpbWVyLmdlbmVyYXRlVGFibGVSZXBvcnQoKSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBHZW5lcmF0ZXMgc3RydWN0dXJlZCByZXBvcnQgZGF0YSBzdWl0YWJsZSBmb3IgbG9nZ2luZyBhbmQgYW5hbHlzaXMuXHJcbiAgICAgKiBAcmV0dXJucyBPYmplY3QgY29udGFpbmluZyBjb3VudGVycyBhcnJheSBhbmQgbWV0YWRhdGEuXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgZ2VuZXJhdGVSZXBvcnQoKSB7XHJcbiAgICAgICAgY29uc3Qgc29ydGVkRW50cmllcyA9IE9iamVjdC5lbnRyaWVzKF9EZWJ1Z1RpbWVyLmNvdW50ZXJzKS5zb3J0KChhLCBiKSA9PiBiWzFdLnRpbWUgLSBhWzFdLnRpbWUpO1xyXG4gICAgICAgIGNvbnN0IHRpY2tzU2luY2VTdGFydCA9IHN5c3RlbS5jdXJyZW50VGljayAtIGZpcnN0VGljaztcclxuXHJcbiAgICAgICAgcmV0dXJuIHtcclxuICAgICAgICAgICAgY291bnRlcnM6IHNvcnRlZEVudHJpZXMubWFwKChbaWQsIGNvdW50ZXJdKSA9PiAoe1xyXG4gICAgICAgICAgICAgICAgaWQsXHJcbiAgICAgICAgICAgICAgICBjb3VudDogY291bnRlci5jb3VudCxcclxuICAgICAgICAgICAgICAgIHRpbWVNczogTnVtYmVyKChjb3VudGVyLnRpbWUgLyAxMDAwKS50b0ZpeGVkKDIpKSxcclxuICAgICAgICAgICAgICAgIHRpbWVFeGNsdXNpdmVNczogTnVtYmVyKChjb3VudGVyLnRpbWVFeGNsdXNpdmUgLyAxMDAwKS50b0ZpeGVkKDIpKSxcclxuICAgICAgICAgICAgICAgIHRpbWVEaWZmTXM6IE51bWJlcigoKGNvdW50ZXIudGltZSAtIGNvdW50ZXIudGltZUV4Y2x1c2l2ZSkgLyAxMDAwKS50b0ZpeGVkKDIpKSxcclxuICAgICAgICAgICAgICAgIGF2ZXJhZ2VNczogTnVtYmVyKChjb3VudGVyLnRpbWUgLyB0aWNrc1NpbmNlU3RhcnQgLyAxMDAwKS50b0ZpeGVkKDMpKSxcclxuICAgICAgICAgICAgICAgIGNvdW50c1BlclRpY2s6IE51bWJlcigoY291bnRlci5jb3VudCAvIHRpY2tzU2luY2VTdGFydCkudG9GaXhlZCgyKSksXHJcbiAgICAgICAgICAgICAgICBtaW5NczogTnVtYmVyKChjb3VudGVyLm1pblRpbWUgLyAxMDAwKS50b0ZpeGVkKDMpKSxcclxuICAgICAgICAgICAgICAgIG1heE1zOiBOdW1iZXIoKGNvdW50ZXIubWF4VGltZSAvIDEwMDApLnRvRml4ZWQoMykpLFxyXG4gICAgICAgICAgICB9KSksXHJcbiAgICAgICAgICAgIG1ldGFkYXRhOiB7XHJcbiAgICAgICAgICAgICAgICB0aWNrc1NpbmNlU3RhcnQsXHJcbiAgICAgICAgICAgICAgICBjdXJyZW50VGljazogc3lzdGVtLmN1cnJlbnRUaWNrLFxyXG4gICAgICAgICAgICAgICAgdG90YWxDb3VudGVyczogc29ydGVkRW50cmllcy5sZW5ndGgsXHJcbiAgICAgICAgICAgICAgICBzYW1wbGluZ1JhdGU6IF9EZWJ1Z1RpbWVyLnNhbXBsaW5nUmF0ZSxcclxuICAgICAgICAgICAgfSxcclxuICAgICAgICB9O1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogR2V0cyB0aGUgdG9wIE4gY291bnRlcnMgc29ydGVkIGJ5IHRvdGFsIHRpbWUgYXMgc3RydWN0dXJlZCBvYmplY3RzLlxyXG4gICAgICogQHBhcmFtIG4gLSBOdW1iZXIgb2YgdG9wIGVudHJpZXMgdG8gcmV0dXJuLlxyXG4gICAgICogQHJldHVybnMgQXJyYXkgb2YgY291bnRlciBvYmplY3RzIHdpdGggc3RydWN0dXJlZCBkYXRhLlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGdldFRvcENvdW50ZXJzKG46IG51bWJlcikge1xyXG4gICAgICAgIGNvbnN0IHJlcG9ydCA9IF9EZWJ1Z1RpbWVyLmdlbmVyYXRlUmVwb3J0KCk7XHJcbiAgICAgICAgcmV0dXJuIHJlcG9ydC5jb3VudGVycy5zbGljZSgwLCBuKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEdlbmVyYXRlcyBhIGZvcm1hdHRlZCB0YWJsZSByZXBvcnQgb2YgYWxsIHRpbWVycyBhbmQgY291bnRlcnMuXHJcbiAgICAgKiBAcmV0dXJucyBUaGUgcmVwb3J0IGFzIGEgc3RyaW5nLlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGdlbmVyYXRlVGFibGVSZXBvcnQoKSB7XHJcbiAgICAgICAgY29uc3Qgc29ydGVkRW50cmllcyA9IE9iamVjdC5lbnRyaWVzKF9EZWJ1Z1RpbWVyLmNvdW50ZXJzKS5zb3J0KChhLCBiKSA9PiBiWzFdLnRpbWUgLSBhWzFdLnRpbWUpO1xyXG5cclxuICAgICAgICBsZXQgcmVwb3J0ID0gXCJgYGBcIjtcclxuICAgICAgICByZXBvcnQgKz0gXCJEZWJ1Z1RpbWVyIHJlcG9ydDpcXG5cIjtcclxuICAgICAgICBpZiAoX0RlYnVnVGltZXIuc2FtcGxpbmdSYXRlIDwgMSkge1xyXG4gICAgICAgICAgICByZXBvcnQgKz0gYChTYW1wbGluZyAkeyhfRGVidWdUaW1lci5zYW1wbGluZ1JhdGUgKiAxMDApLnRvRml4ZWQoMSl9JSBvZiBleGVjdXRpb25zIC0gY291bnRzIGFuZCB0aW1lcyBhcmUgZXN0aW1hdGVzKVxcbmA7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICByZXBvcnQgKz0gXCJDb3VudGVyczpcXG5cIjtcclxuICAgICAgICByZXBvcnQgKz0gXCJ8IElEICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfCBDb3VudCB8IENQVCAgICAgfCBUaW1lICAgICAgfCBUaW1lIEV4Y2wgfCBUaW1lIERpZmYgfCBBdmVyYWdlICAgfFxcblwiO1xyXG4gICAgICAgIHJlcG9ydCArPSBcInwtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS18LS0tLS0tLXwtLS0tLS0tLS18LS0tLS0tLS0tLS18LS0tLS0tLS0tLS18LS0tLS0tLS0tLS18LS0tLS0tLS0tLS18XFxuXCI7XHJcbiAgICAgICAgZm9yIChjb25zdCBbaWQsIGNvdW50ZXJdIG9mIHNvcnRlZEVudHJpZXMpIHtcclxuICAgICAgICAgICAgcmVwb3J0ICs9IGB8ICR7aWQucGFkRW5kKDQwKX0gYDtcclxuICAgICAgICAgICAgcmVwb3J0ICs9IGB8ICR7Y291bnRlci5jb3VudC50b1N0cmluZygpLnBhZFN0YXJ0KDUpfSBgO1xyXG4gICAgICAgICAgICByZXBvcnQgKz0gYHwgJHsoY291bnRlci5jb3VudCAvIChzeXN0ZW0uY3VycmVudFRpY2sgLSBmaXJzdFRpY2spKS50b0ZpeGVkKDIpLnBhZFN0YXJ0KDcpfSBgO1xyXG4gICAgICAgICAgICByZXBvcnQgKz0gYHwgJHsoY291bnRlci50aW1lIC8gMTAwMCkudG9TdHJpbmcoKS5wYWRTdGFydCg3KX1tcyBgO1xyXG4gICAgICAgICAgICByZXBvcnQgKz0gYHwgJHsoY291bnRlci50aW1lRXhjbHVzaXZlIC8gMTAwMCkudG9TdHJpbmcoKS5wYWRTdGFydCg3KX1tcyBgO1xyXG4gICAgICAgICAgICByZXBvcnQgKz0gYHwgJHsoY291bnRlci50aW1lIC8gMTAwMCAtIGNvdW50ZXIudGltZUV4Y2x1c2l2ZSAvIDEwMDApLnRvU3RyaW5nKCkucGFkU3RhcnQoNyl9bXMgYDtcclxuICAgICAgICAgICAgcmVwb3J0ICs9IGB8ICR7KGNvdW50ZXIudGltZSAvIChzeXN0ZW0uY3VycmVudFRpY2sgLSBmaXJzdFRpY2spIC8gMTAwMCkudG9GaXhlZCgzKS5wYWRTdGFydCg3KX1tcyB8XFxuYDtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHJlcG9ydCArPSBcImBgYFwiO1xyXG4gICAgICAgIHJldHVybiByZXBvcnQ7XHJcbiAgICB9XHJcbn1cclxuXHJcbmRlY2xhcmUgZ2xvYmFsIHtcclxuICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby12YXJcclxuICAgIHZhciBEZWJ1Z1RpbWVyOiBPbWl0PHR5cGVvZiBfRGVidWdUaW1lciwgXCJwcm90b3R5cGVcIj47XHJcbn1cclxuZ2xvYmFsVGhpcy5EZWJ1Z1RpbWVyID0gX0RlYnVnVGltZXI7XHJcbiJdLCJuYW1lcyI6WyJzeXN0ZW0iLCJkYXRlQ2xvY2siLCJEYXRlIiwiZ2V0VGltZSIsImZpcnN0VGljayIsImN1cnJlbnRUaWNrIiwiX0RlYnVnVGltZXIiLCJub3ciLCJ0aW1lIiwiaWQiLCJ0aW1lcnMiLCJ0aW1lTG9nIiwiZGVzY3JpcHRpb24iLCJpc09uIiwiY29uc29sZSIsIndhcm4iLCJjb3VudFN0YXJ0IiwicGFyZW50U2tpcHBlZCIsInNraXBTdGFjayIsImxlbmd0aCIsInNob3VsZFNraXAiLCJzYW1wbGluZ1JhdGUiLCJNYXRoIiwicmFuZG9tIiwiY291bnRlcnNTdGFjayIsInB1c2giLCJjb3VudGVyc0NhY2hlIiwiY291bnRFbmQiLCJwb3AiLCJza2lwcGVkIiwidGltZUVsYXBzZWQiLCJtdWx0aXBsaWVyIiwiY291bnRlcnMiLCJjb3VudCIsInRpbWVFeGNsdXNpdmUiLCJtaW5UaW1lIiwibWF4VGltZSIsImNvdW50ZXJzQ2FjaGVFeGNsdXNpdmUiLCJtaW4iLCJtYXgiLCJzdGFja0lkIiwidW5kZWZpbmVkIiwiY2xlYXIiLCJyZXBvcnQiLCJnZW5lcmF0ZVRhYmxlUmVwb3J0IiwiZ2VuZXJhdGVSZXBvcnQiLCJzb3J0ZWRFbnRyaWVzIiwiT2JqZWN0IiwiZW50cmllcyIsInNvcnQiLCJhIiwiYiIsInRpY2tzU2luY2VTdGFydCIsIm1hcCIsImNvdW50ZXIiLCJ0aW1lTXMiLCJOdW1iZXIiLCJ0b0ZpeGVkIiwidGltZUV4Y2x1c2l2ZU1zIiwidGltZURpZmZNcyIsImF2ZXJhZ2VNcyIsImNvdW50c1BlclRpY2siLCJtaW5NcyIsIm1heE1zIiwibWV0YWRhdGEiLCJ0b3RhbENvdW50ZXJzIiwiZ2V0VG9wQ291bnRlcnMiLCJuIiwic2xpY2UiLCJwYWRFbmQiLCJ0b1N0cmluZyIsInBhZFN0YXJ0IiwiZ2xvYmFsVGhpcyIsIkRlYnVnVGltZXIiXSwibWFwcGluZ3MiOiJBQUFBLFNBQVNBLE1BQU0sUUFBUSxvQkFBb0I7QUFFM0Msd0RBQXdEO0FBQ3hELDRDQUE0QztBQUU1QyxNQUFNQyxZQUEwQixJQUFNLElBQUlDLE9BQU9DLE9BQU8sS0FBSztBQUM3RCxNQUFNQyxZQUFZSixPQUFPSyxXQUFXO0FBRXBDOzs7Ozs7OztPQVFPLEdBQ1AsTUFBTUM7SUFDRixXQUFtQkMsTUFBYztRQUM3QixPQUFPTjtJQUNYO0lBdUJBOzs7S0FHQyxHQUNELE9BQWNPLEtBQUtDLEVBQVUsRUFBRTtRQUMzQkgsWUFBWUksTUFBTSxDQUFDRCxHQUFHLEdBQUcsSUFBSSxDQUFDRixHQUFHO0lBQ3JDO0lBRUE7Ozs7S0FJQyxHQUNELE9BQWNJLFFBQVFGLEVBQVUsRUFBRUcsV0FBbUIsRUFBRTtRQUNuRCxJQUFJLENBQUNOLFlBQVlPLElBQUksRUFBRTtRQUN2QixJQUFJLENBQUNQLFlBQVlJLE1BQU0sQ0FBQ0QsR0FBRyxFQUFFO1lBQ3pCLE9BQU9LLFFBQVFDLElBQUksQ0FBQyxDQUFDLE1BQU0sRUFBRU4sR0FBRyxVQUFVLENBQUM7UUFDL0M7UUFFQUssUUFBUUMsSUFBSSxDQUFDLENBQUMsUUFBUSxFQUFFTixH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