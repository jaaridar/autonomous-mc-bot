import { ExitType } from "../Types";
class AbstractState {
    /** Instance accessor for the state definition */ get definition() {
        return this.constructor.definition;
    }
    /** Static accessor for the state identifier */ static get identifier() {
        return this.definition.identifier;
    }
    /** Instance accessor for the state identifier */ get identifier() {
        return this.definition.identifier;
    }
    // #endregion
    // #region Lifecycle
    /**
     * Called when the state becomes active.
     * @remark Override onEnter() instead when implementing a specific state
     */ enter() {
        if (!this.context.entity.isValid) return;
        this.activeTicks = 0;
        this.isActive = true;
        this.timeoutTriggered = false;
        this.triggerEvent("enter");
        this.context.stateComponent.onStateChange(this.absoluteAddress);
        if (this.context.stateComponent.isEnterBlocked) {
            //Block the entry to prevent cascading onEnter calls from causing stack overflow
            this.isActive = false;
            return;
        }
        const data = this.readMemoryFromStore();
        this.onEnter(data);
        this.context.stateComponent.onStateEntered();
    }
    /**
     * Called every tick while this state is active.
     * @remark Override onActiveTick() instead when implementing a specific state
     */ activeTick() {
        this.activeTicks++;
        if (this.timeoutDuration > 0 && !this.timeoutTriggered && this.activeTicks > this.timeoutDuration) {
            this.timeoutTriggered = true;
            this.broadcastSignal("onFailure");
        }
        this.onActiveTick();
    }
    /**
     * Called every tick while this state is inactive.
     * @remark Override onInactiveTick() instead when implementing a specific state
     */ inactiveTick() {
        this.inactiveTicks++;
        this.onInactiveTick();
    }
    /**
     * Called when the state becomes inactive.
     * @remark Override onExit() instead when implementing a specific state
     * @param isShutdown - Whether this exit is due to world shutdown
     */ exit(exitType = ExitType.Standard) {
        const data = this.createMemory();
        if (data && exitType !== ExitType.Remove) this.writeMemoryToStore(data);
        this.onExit(exitType);
        this.inactiveTicks = 0;
        this.isActive = false;
        this.signals = {};
        if (exitType === ExitType.Standard) this.triggerEvent("exit");
    }
    /**
     * Override to handle state entry with deserialized data.
     * @param _memory - Previously serialized state memory, if any
     */ onEnter(_memory) {}
    /**
     * Override to handle state exit.
     * @param _exitType - The type of exit being performed
     */ onExit(_exitType) {}
    /**
     * Override to handle active tick updates.
     */ onActiveTick() {}
    /**
     * Override to handle inactive tick updates.
     */ onInactiveTick() {}
    // #endregion
    // #region Signals
    /**
     * Broadcasts a signal to all subscribers.
     * @param signalName - The name of the signal to broadcast
     */ broadcastSignal(signalName) {
        const subscriptions = this.signals[signalName] ?? [];
        for (const callback of subscriptions)callback();
    }
    /**
     * Subscribes a callback to a signal.
     * @param signalName - The name of the signal to subscribe to
     * @param callback - The function to call when the signal is broadcast
     */ subscribeToSignal(signalName, callback) {
        var _this_signals, _signalName;
        (_this_signals = this.signals)[_signalName = signalName] ?? (_this_signals[_signalName] = []);
        this.signals[signalName].push(callback);
    }
    async waitForSignal(signalName) {
        return new Promise((resolve)=>{
            const callback = ()=>{
                resolve();
            };
            this.subscribeToSignal(signalName, callback);
        });
    }
    /**
     * Handles a signal targeted at a specific state identifier.
     * @param identifier - The target state identifier
     * @param signal - The signal name to broadcast
     * @returns True if this state handled the signal, false otherwise
     */ handleSignal(identifier, signal) {
        // If this state matches the target, trigger the signal
        if (this.identifier === identifier) {
            this.broadcastSignal(signal);
            return true;
        }
        return false;
    }
    // #endregion
    // #region Utils
    /**
     * Triggers an entity event corresponding to this state and operation.
     * @param operation - The type of event (enter, exit, signal)
     * @param data - Optional data to append to the event name
     * @returns True if the event was successfully triggered, false if the event doesn't exist
     */ triggerEvent(operation, data) {
        let event = `${this.identifier}.${operation}`;
        if (data) event += `.${data}`;
        try {
            const entity = this.context.entity;
            if (!entity.isValid) return false;
            entity.triggerEvent(event);
            return true;
        } catch (e) {
            if (e instanceof Error && e.name === "InvalidArgumentError") return false;
            throw e;
        }
    }
    /**
     * Optionally computes a score for this state.
     * @returns The score
     */ computeScore() {
        return null;
    }
    /**
     * Checks if this state is an instance of the given class.
     * @param stateClass - The class to check against
     * @returns True if this state is an instance of the class, false otherwise
     */ is(stateClass) {
        return this instanceof stateClass;
    }
    // #endregion
    // #region Serialization
    /**
     * Gets the dynamic property key for storing serialized state data.
     * @returns The property key unique to this state's address
     */ get storeKey() {
        return `state_skeleton:${this.absoluteAddress}`;
    }
    /**
     * Override to provide data that should be persisted when exiting this state.
     * @returns An object containing data to serialize, or undefined for no persistence
     */ createMemory() {
        return undefined;
    }
    /**
     * Writes memory to entity dynamic properties.
     * @param memory - The data to persist
     */ writeMemoryToStore(memory) {
        this.context.entity.setDynamicProperty(this.storeKey, JSON.stringify(memory));
    }
    /**
     * Reads and deserializes previously stored memory data.
     * @returns The deserialized data object, or undefined if none exists
     */ readMemoryFromStore() {
        const value = this.context.entity.getDynamicProperty(this.storeKey);
        if (typeof value !== "string") return;
        return JSON.parse(value);
    }
    /**
     * Checks if this state has any stored memory.
     * @returns True if memory exists, false otherwise
     */ hasMemory() {
        return this.context.entity.getDynamicPropertyIds().includes(this.storeKey);
    }
    /**
     * Creates a new state instance.
     * @param context - The entity context
     * @param parentAddress - The parent state's address
     */ constructor(context, parentAddress){
        // #endregion
        // #region Initialization
        /** Whether this state is currently active */ this.isActive = false;
        /** Number of ticks since this state last became active */ this.activeTicks = 0;
        /** Number of ticks since this state last became inactive */ this.inactiveTicks = Infinity;
        /** Timeout in ticks. 0 = disabled. If activeTicks exceeds this, broadcasts onFailure once. */ this.timeoutDuration = 0;
        /** Whether the timeout signal has already been broadcast this activation */ this.timeoutTriggered = false;
        /** Map of signal names to their callback subscriptions */ this.signals = {};
        this.context = context;
        this.absoluteAddress = parentAddress ? `${parentAddress}/${this.identifier}` : this.identifier;
        this.context.stateComponent.registerState(this);
    }
}
/**
 * Abstract base class for all states in a hierarchical state machine.
 *
 * AbstractState provides the core functionality for state lifecycle management,
 * signal handling, serialization, and entity event triggering.
 *
 * @template Definition - The state definition type
 * @template Signals - Union type of valid signal names for this state
 */ export { AbstractState as default };

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkFic3RyYWN0U3RhdGUudHMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IEVudGl0eUNvbnRleHQgZnJvbSBcIlN0YXRlU2tlbGV0b24vRW50aXR5Q29udGV4dFwiO1xyXG5pbXBvcnQgeyBDb21tb25TaWduYWxzLCBFdmVudFR5cGUsIEV4aXRUeXBlLCBTaWduYWxDYWxsYmFjaywgU3RhdGVDbGFzcywgU3RhdGVEZWZpbml0aW9uLCBTdGF0ZU1lbW9yeSB9IGZyb20gXCIuLi9UeXBlc1wiO1xyXG5cclxuLyoqXHJcbiAqIEFic3RyYWN0IGJhc2UgY2xhc3MgZm9yIGFsbCBzdGF0ZXMgaW4gYSBoaWVyYXJjaGljYWwgc3RhdGUgbWFjaGluZS5cclxuICpcclxuICogQWJzdHJhY3RTdGF0ZSBwcm92aWRlcyB0aGUgY29yZSBmdW5jdGlvbmFsaXR5IGZvciBzdGF0ZSBsaWZlY3ljbGUgbWFuYWdlbWVudCxcclxuICogc2lnbmFsIGhhbmRsaW5nLCBzZXJpYWxpemF0aW9uLCBhbmQgZW50aXR5IGV2ZW50IHRyaWdnZXJpbmcuXHJcbiAqXHJcbiAqIEB0ZW1wbGF0ZSBEZWZpbml0aW9uIC0gVGhlIHN0YXRlIGRlZmluaXRpb24gdHlwZVxyXG4gKiBAdGVtcGxhdGUgU2lnbmFscyAtIFVuaW9uIHR5cGUgb2YgdmFsaWQgc2lnbmFsIG5hbWVzIGZvciB0aGlzIHN0YXRlXHJcbiAqL1xyXG5leHBvcnQgZGVmYXVsdCBhYnN0cmFjdCBjbGFzcyBBYnN0cmFjdFN0YXRlPERlZmluaXRpb24gZXh0ZW5kcyBTdGF0ZURlZmluaXRpb24gPSBTdGF0ZURlZmluaXRpb24sIFNpZ25hbHMgZXh0ZW5kcyBzdHJpbmcgPSBDb21tb25TaWduYWxzPiB7XHJcbiAgICAvLyAjcmVnaW9uIERlZmluaXRpb25cclxuICAgIC8qKiBTdGF0aWMgZGVmaW5pdGlvbiBjb250YWluaW5nIGlkZW50aWZpZXIgYW5kIHByaW9yaXR5ICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHJlYWRvbmx5IGRlZmluaXRpb246IFN0YXRlRGVmaW5pdGlvbjtcclxuXHJcbiAgICAvKiogSW5zdGFuY2UgYWNjZXNzb3IgZm9yIHRoZSBzdGF0ZSBkZWZpbml0aW9uICovXHJcbiAgICBwdWJsaWMgZ2V0IGRlZmluaXRpb24oKTogRGVmaW5pdGlvbiB7XHJcbiAgICAgICAgcmV0dXJuICh0aGlzLmNvbnN0cnVjdG9yIGFzIHR5cGVvZiBBYnN0cmFjdFN0YXRlKS5kZWZpbml0aW9uIGFzIERlZmluaXRpb247XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFN0YXRpYyBhY2Nlc3NvciBmb3IgdGhlIHN0YXRlIGlkZW50aWZpZXIgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgZ2V0IGlkZW50aWZpZXIoKTogc3RyaW5nIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5kZWZpbml0aW9uLmlkZW50aWZpZXI7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEluc3RhbmNlIGFjY2Vzc29yIGZvciB0aGUgc3RhdGUgaWRlbnRpZmllciAqL1xyXG4gICAgcHVibGljIGdldCBpZGVudGlmaWVyKCk6IHN0cmluZyB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuZGVmaW5pdGlvbi5pZGVudGlmaWVyO1xyXG4gICAgfVxyXG5cclxuICAgIC8vICNlbmRyZWdpb25cclxuXHJcbiAgICAvLyAjcmVnaW9uIEluaXRpYWxpemF0aW9uXHJcbiAgICAvKiogV2hldGhlciB0aGlzIHN0YXRlIGlzIGN1cnJlbnRseSBhY3RpdmUgKi9cclxuICAgIHB1YmxpYyBpc0FjdGl2ZSA9IGZhbHNlO1xyXG5cclxuICAgIC8qKiBOdW1iZXIgb2YgdGlja3Mgc2luY2UgdGhpcyBzdGF0ZSBsYXN0IGJlY2FtZSBhY3RpdmUgKi9cclxuICAgIHB1YmxpYyBhY3RpdmVUaWNrczogbnVtYmVyID0gMDtcclxuXHJcbiAgICAvKiogTnVtYmVyIG9mIHRpY2tzIHNpbmNlIHRoaXMgc3RhdGUgbGFzdCBiZWNhbWUgaW5hY3RpdmUgKi9cclxuICAgIHB1YmxpYyBpbmFjdGl2ZVRpY2tzOiBudW1iZXIgPSBJbmZpbml0eTtcclxuXHJcbiAgICAvKiogVGltZW91dCBpbiB0aWNrcy4gMCA9IGRpc2FibGVkLiBJZiBhY3RpdmVUaWNrcyBleGNlZWRzIHRoaXMsIGJyb2FkY2FzdHMgb25GYWlsdXJlIG9uY2UuICovXHJcbiAgICBwcm90ZWN0ZWQgdGltZW91dER1cmF0aW9uOiBudW1iZXIgPSAwO1xyXG5cclxuICAgIC8qKiBXaGV0aGVyIHRoZSB0aW1lb3V0IHNpZ25hbCBoYXMgYWxyZWFkeSBiZWVuIGJyb2FkY2FzdCB0aGlzIGFjdGl2YXRpb24gKi9cclxuICAgIHByaXZhdGUgdGltZW91dFRyaWdnZXJlZDogYm9vbGVhbiA9IGZhbHNlO1xyXG5cclxuICAgIC8qKiBNYXAgb2Ygc2lnbmFsIG5hbWVzIHRvIHRoZWlyIGNhbGxiYWNrIHN1YnNjcmlwdGlvbnMgKi9cclxuICAgIHByb3RlY3RlZCBzaWduYWxzOiBQYXJ0aWFsPFJlY29yZDxTaWduYWxzIHwgQ29tbW9uU2lnbmFscywgU2lnbmFsQ2FsbGJhY2tbXT4+ID0ge307XHJcblxyXG4gICAgLyoqIFRoZSBlbnRpdHkgY29udGV4dCBwcm92aWRpbmcgc2hhcmVkIGRhdGEgdG8gdGhpcyBzdGF0ZSAqL1xyXG4gICAgcHJvdGVjdGVkIHJlYWRvbmx5IGNvbnRleHQ6IEVudGl0eUNvbnRleHQ7XHJcblxyXG4gICAgLyoqIFRoZSBmdWxsIGFkZHJlc3MgcGF0aCB0byB0aGlzIHN0YXRlIChlLmcuLCBcInJvb3QvY29tYmF0L2F0dGFja1wiKSAqL1xyXG4gICAgcHVibGljIHJlYWRvbmx5IGFic29sdXRlQWRkcmVzczogc3RyaW5nO1xyXG5cclxuICAgIC8qKlxyXG4gICAgICogQ3JlYXRlcyBhIG5ldyBzdGF0ZSBpbnN0YW5jZS5cclxuICAgICAqIEBwYXJhbSBjb250ZXh0IC0gVGhlIGVudGl0eSBjb250ZXh0XHJcbiAgICAgKiBAcGFyYW0gcGFyZW50QWRkcmVzcyAtIFRoZSBwYXJlbnQgc3RhdGUncyBhZGRyZXNzXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBjb25zdHJ1Y3Rvcihjb250ZXh0OiBFbnRpdHlDb250ZXh0LCBwYXJlbnRBZGRyZXNzPzogc3RyaW5nKSB7XHJcbiAgICAgICAgdGhpcy5jb250ZXh0ID0gY29udGV4dDtcclxuICAgICAgICB0aGlzLmFic29sdXRlQWRkcmVzcyA9IHBhcmVudEFkZHJlc3MgPyBgJHtwYXJlbnRBZGRyZXNzfS8ke3RoaXMuaWRlbnRpZmllcn1gIDogdGhpcy5pZGVudGlmaWVyO1xyXG4gICAgICAgIHRoaXMuY29udGV4dC5zdGF0ZUNvbXBvbmVudC5yZWdpc3RlclN0YXRlKHRoaXMpO1xyXG4gICAgfVxyXG4gICAgLy8gI2VuZHJlZ2lvblxyXG5cclxuICAgIC8vICNyZWdpb24gTGlmZWN5Y2xlXHJcbiAgICAvKipcclxuICAgICAqIENhbGxlZCB3aGVuIHRoZSBzdGF0ZSBiZWNvbWVzIGFjdGl2ZS5cclxuICAgICAqIEByZW1hcmsgT3ZlcnJpZGUgb25FbnRlcigpIGluc3RlYWQgd2hlbiBpbXBsZW1lbnRpbmcgYSBzcGVjaWZpYyBzdGF0ZVxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgZW50ZXIoKTogdm9pZCB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmNvbnRleHQuZW50aXR5LmlzVmFsaWQpIHJldHVybjtcclxuXHJcbiAgICAgICAgdGhpcy5hY3RpdmVUaWNrcyA9IDA7XHJcbiAgICAgICAgdGhpcy5pc0FjdGl2ZSA9IHRydWU7XHJcbiAgICAgICAgdGhpcy50aW1lb3V0VHJpZ2dlcmVkID0gZmFsc2U7XHJcblxyXG4gICAgICAgIHRoaXMudHJpZ2dlckV2ZW50KFwiZW50ZXJcIik7XHJcblxyXG4gICAgICAgIHRoaXMuY29udGV4dC5zdGF0ZUNvbXBvbmVudC5vblN0YXRlQ2hhbmdlKHRoaXMuYWJzb2x1dGVBZGRyZXNzKTtcclxuXHJcbiAgICAgICAgaWYgKHRoaXMuY29udGV4dC5zdGF0ZUNvbXBvbmVudC5pc0VudGVyQmxvY2tlZCkge1xyXG4gICAgICAgICAgICAvL0Jsb2NrIHRoZSBlbnRyeSB0byBwcmV2ZW50IGNhc2NhZGluZyBvbkVudGVyIGNhbGxzIGZyb20gY2F1c2luZyBzdGFjayBvdmVyZmxvd1xyXG4gICAgICAgICAgICB0aGlzLmlzQWN0aXZlID0gZmFsc2U7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGNvbnN0IGRhdGEgPSB0aGlzLnJlYWRNZW1vcnlGcm9tU3RvcmUoKTtcclxuICAgICAgICB0aGlzLm9uRW50ZXIoZGF0YSk7XHJcblxyXG4gICAgICAgIHRoaXMuY29udGV4dC5zdGF0ZUNvbXBvbmVudC5vblN0YXRlRW50ZXJlZCgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQ2FsbGVkIGV2ZXJ5IHRpY2sgd2hpbGUgdGhpcyBzdGF0ZSBpcyBhY3RpdmUuXHJcbiAgICAgKiBAcmVtYXJrIE92ZXJyaWRlIG9uQWN0aXZlVGljaygpIGluc3RlYWQgd2hlbiBpbXBsZW1lbnRpbmcgYSBzcGVjaWZpYyBzdGF0ZVxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgYWN0aXZlVGljaygpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLmFjdGl2ZVRpY2tzKys7XHJcblxyXG4gICAgICAgIGlmICh0aGlzLnRpbWVvdXREdXJhdGlvbiA+IDAgJiYgIXRoaXMudGltZW91dFRyaWdnZXJlZCAmJiB0aGlzLmFjdGl2ZVRpY2tzID4gdGhpcy50aW1lb3V0RHVyYXRpb24pIHtcclxuICAgICAgICAgICAgdGhpcy50aW1lb3V0VHJpZ2dlcmVkID0gdHJ1ZTtcclxuICAgICAgICAgICAgdGhpcy5icm9hZGNhc3RTaWduYWwoXCJvbkZhaWx1cmVcIik7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB0aGlzLm9uQWN0aXZlVGljaygpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQ2FsbGVkIGV2ZXJ5IHRpY2sgd2hpbGUgdGhpcyBzdGF0ZSBpcyBpbmFjdGl2ZS5cclxuICAgICAqIEByZW1hcmsgT3ZlcnJpZGUgb25JbmFjdGl2ZVRpY2soKSBpbnN0ZWFkIHdoZW4gaW1wbGVtZW50aW5nIGEgc3BlY2lmaWMgc3RhdGVcclxuICAgICAqL1xyXG4gICAgcHVibGljIGluYWN0aXZlVGljaygpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLmluYWN0aXZlVGlja3MrKztcclxuICAgICAgICB0aGlzLm9uSW5hY3RpdmVUaWNrKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBDYWxsZWQgd2hlbiB0aGUgc3RhdGUgYmVjb21lcyBpbmFjdGl2ZS5cclxuICAgICAqIEByZW1hcmsgT3ZlcnJpZGUgb25FeGl0KCkgaW5zdGVhZCB3aGVuIGltcGxlbWVudGluZyBhIHNwZWNpZmljIHN0YXRlXHJcbiAgICAgKiBAcGFyYW0gaXNTaHV0ZG93biAtIFdoZXRoZXIgdGhpcyBleGl0IGlzIGR1ZSB0byB3b3JsZCBzaHV0ZG93blxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgZXhpdChleGl0VHlwZTogRXhpdFR5cGUgPSBFeGl0VHlwZS5TdGFuZGFyZCk6IHZvaWQge1xyXG4gICAgICAgIGNvbnN0IGRhdGEgPSB0aGlzLmNyZWF0ZU1lbW9yeSgpO1xyXG4gICAgICAgIGlmIChkYXRhICYmIGV4aXRUeXBlICE9PSBFeGl0VHlwZS5SZW1vdmUpIHRoaXMud3JpdGVNZW1vcnlUb1N0b3JlKGRhdGEpO1xyXG5cclxuICAgICAgICB0aGlzLm9uRXhpdChleGl0VHlwZSk7XHJcblxyXG4gICAgICAgIHRoaXMuaW5hY3RpdmVUaWNrcyA9IDA7XHJcbiAgICAgICAgdGhpcy5pc0FjdGl2ZSA9IGZhbHNlO1xyXG4gICAgICAgIHRoaXMuc2lnbmFscyA9IHt9O1xyXG5cclxuICAgICAgICBpZiAoZXhpdFR5cGUgPT09IEV4aXRUeXBlLlN0YW5kYXJkKSB0aGlzLnRyaWdnZXJFdmVudChcImV4aXRcIik7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBPdmVycmlkZSB0byBoYW5kbGUgc3RhdGUgZW50cnkgd2l0aCBkZXNlcmlhbGl6ZWQgZGF0YS5cclxuICAgICAqIEBwYXJhbSBfbWVtb3J5IC0gUHJldmlvdXNseSBzZXJpYWxpemVkIHN0YXRlIG1lbW9yeSwgaWYgYW55XHJcbiAgICAgKi9cclxuICAgIHByb3RlY3RlZCBvbkVudGVyKF9tZW1vcnk/OiBTdGF0ZU1lbW9yeSk6IHZvaWQge31cclxuXHJcbiAgICAvKipcclxuICAgICAqIE92ZXJyaWRlIHRvIGhhbmRsZSBzdGF0ZSBleGl0LlxyXG4gICAgICogQHBhcmFtIF9leGl0VHlwZSAtIFRoZSB0eXBlIG9mIGV4aXQgYmVpbmcgcGVyZm9ybWVkXHJcbiAgICAgKi9cclxuICAgIHByb3RlY3RlZCBvbkV4aXQoX2V4aXRUeXBlOiBFeGl0VHlwZSk6IHZvaWQge31cclxuXHJcbiAgICAvKipcclxuICAgICAqIE92ZXJyaWRlIHRvIGhhbmRsZSBhY3RpdmUgdGljayB1cGRhdGVzLlxyXG4gICAgICovXHJcbiAgICBwcm90ZWN0ZWQgb25BY3RpdmVUaWNrKCk6IHZvaWQge31cclxuXHJcbiAgICAvKipcclxuICAgICAqIE92ZXJyaWRlIHRvIGhhbmRsZSBpbmFjdGl2ZSB0aWNrIHVwZGF0ZXMuXHJcbiAgICAgKi9cclxuICAgIHByb3RlY3RlZCBvbkluYWN0aXZlVGljaygpOiB2b2lkIHt9XHJcbiAgICAvLyAjZW5kcmVnaW9uXHJcblxyXG4gICAgLy8gI3JlZ2lvbiBTaWduYWxzXHJcbiAgICAvKipcclxuICAgICAqIEJyb2FkY2FzdHMgYSBzaWduYWwgdG8gYWxsIHN1YnNjcmliZXJzLlxyXG4gICAgICogQHBhcmFtIHNpZ25hbE5hbWUgLSBUaGUgbmFtZSBvZiB0aGUgc2lnbmFsIHRvIGJyb2FkY2FzdFxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgYnJvYWRjYXN0U2lnbmFsKHNpZ25hbE5hbWU6IGtleW9mIHR5cGVvZiB0aGlzLnNpZ25hbHMpOiB2b2lkIHtcclxuICAgICAgICBjb25zdCBzdWJzY3JpcHRpb25zID0gdGhpcy5zaWduYWxzW3NpZ25hbE5hbWVdID8/IFtdO1xyXG4gICAgICAgIGZvciAoY29uc3QgY2FsbGJhY2sgb2Ygc3Vic2NyaXB0aW9ucykgY2FsbGJhY2soKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFN1YnNjcmliZXMgYSBjYWxsYmFjayB0byBhIHNpZ25hbC5cclxuICAgICAqIEBwYXJhbSBzaWduYWxOYW1lIC0gVGhlIG5hbWUgb2YgdGhlIHNpZ25hbCB0byBzdWJzY3JpYmUgdG9cclxuICAgICAqIEBwYXJhbSBjYWxsYmFjayAtIFRoZSBmdW5jdGlvbiB0byBjYWxsIHdoZW4gdGhlIHNpZ25hbCBpcyBicm9hZGNhc3RcclxuICAgICAqL1xyXG4gICAgcHVibGljIHN1YnNjcmliZVRvU2lnbmFsKHNpZ25hbE5hbWU6IGtleW9mIHR5cGVvZiB0aGlzLnNpZ25hbHMsIGNhbGxiYWNrOiAoKSA9PiB2b2lkKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5zaWduYWxzW3NpZ25hbE5hbWVdID8/PSBbXSBhcyBTaWduYWxDYWxsYmFja1tdO1xyXG4gICAgICAgIHRoaXMuc2lnbmFsc1tzaWduYWxOYW1lXS5wdXNoKGNhbGxiYWNrKTtcclxuICAgIH1cclxuXHJcbiAgICBwdWJsaWMgYXN5bmMgd2FpdEZvclNpZ25hbChzaWduYWxOYW1lOiBrZXlvZiB0eXBlb2YgdGhpcy5zaWduYWxzKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IGNhbGxiYWNrID0gKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgcmVzb2x2ZSgpO1xyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICB0aGlzLnN1YnNjcmliZVRvU2lnbmFsKHNpZ25hbE5hbWUsIGNhbGxiYWNrKTtcclxuICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEhhbmRsZXMgYSBzaWduYWwgdGFyZ2V0ZWQgYXQgYSBzcGVjaWZpYyBzdGF0ZSBpZGVudGlmaWVyLlxyXG4gICAgICogQHBhcmFtIGlkZW50aWZpZXIgLSBUaGUgdGFyZ2V0IHN0YXRlIGlkZW50aWZpZXJcclxuICAgICAqIEBwYXJhbSBzaWduYWwgLSBUaGUgc2lnbmFsIG5hbWUgdG8gYnJvYWRjYXN0XHJcbiAgICAgKiBAcmV0dXJucyBUcnVlIGlmIHRoaXMgc3RhdGUgaGFuZGxlZCB0aGUgc2lnbmFsLCBmYWxzZSBvdGhlcndpc2VcclxuICAgICAqL1xyXG4gICAgcHVibGljIGhhbmRsZVNpZ25hbChpZGVudGlmaWVyOiBzdHJpbmcsIHNpZ25hbDoga2V5b2YgdHlwZW9mIHRoaXMuc2lnbmFscyk6IGJvb2xlYW4ge1xyXG4gICAgICAgIC8vIElmIHRoaXMgc3RhdGUgbWF0Y2hlcyB0aGUgdGFyZ2V0LCB0cmlnZ2VyIHRoZSBzaWduYWxcclxuICAgICAgICBpZiAodGhpcy5pZGVudGlmaWVyID09PSBpZGVudGlmaWVyKSB7XHJcbiAgICAgICAgICAgIHRoaXMuYnJvYWRjYXN0U2lnbmFsKHNpZ25hbCk7XHJcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgfVxyXG4gICAgLy8gI2VuZHJlZ2lvblxyXG5cclxuICAgIC8vICNyZWdpb24gVXRpbHNcclxuICAgIC8qKlxyXG4gICAgICogVHJpZ2dlcnMgYW4gZW50aXR5IGV2ZW50IGNvcnJlc3BvbmRpbmcgdG8gdGhpcyBzdGF0ZSBhbmQgb3BlcmF0aW9uLlxyXG4gICAgICogQHBhcmFtIG9wZXJhdGlvbiAtIFRoZSB0eXBlIG9mIGV2ZW50IChlbnRlciwgZXhpdCwgc2lnbmFsKVxyXG4gICAgICogQHBhcmFtIGRhdGEgLSBPcHRpb25hbCBkYXRhIHRvIGFwcGVuZCB0byB0aGUgZXZlbnQgbmFtZVxyXG4gICAgICogQHJldHVybnMgVHJ1ZSBpZiB0aGUgZXZlbnQgd2FzIHN1Y2Nlc3NmdWxseSB0cmlnZ2VyZWQsIGZhbHNlIGlmIHRoZSBldmVudCBkb2Vzbid0IGV4aXN0XHJcbiAgICAgKi9cclxuICAgIHByb3RlY3RlZCB0cmlnZ2VyRXZlbnQob3BlcmF0aW9uOiBFdmVudFR5cGUsIGRhdGE/OiBzdHJpbmcpOiBib29sZWFuIHtcclxuICAgICAgICBsZXQgZXZlbnQgPSBgJHt0aGlzLmlkZW50aWZpZXJ9LiR7b3BlcmF0aW9ufWA7XHJcbiAgICAgICAgaWYgKGRhdGEpIGV2ZW50ICs9IGAuJHtkYXRhfWA7XHJcblxyXG4gICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGVudGl0eSA9IHRoaXMuY29udGV4dC5lbnRpdHk7XHJcbiAgICAgICAgICAgIGlmICghZW50aXR5LmlzVmFsaWQpIHJldHVybiBmYWxzZTtcclxuICAgICAgICAgICAgZW50aXR5LnRyaWdnZXJFdmVudChldmVudCk7XHJcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcclxuICAgICAgICAgICAgaWYgKGUgaW5zdGFuY2VvZiBFcnJvciAmJiBlLm5hbWUgPT09IFwiSW52YWxpZEFyZ3VtZW50RXJyb3JcIikgcmV0dXJuIGZhbHNlO1xyXG4gICAgICAgICAgICB0aHJvdyBlO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIE9wdGlvbmFsbHkgY29tcHV0ZXMgYSBzY29yZSBmb3IgdGhpcyBzdGF0ZS5cclxuICAgICAqIEByZXR1cm5zIFRoZSBzY29yZVxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgY29tcHV0ZVNjb3JlKCk6IG51bWJlciB8IG51bGwge1xyXG4gICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQ2hlY2tzIGlmIHRoaXMgc3RhdGUgaXMgYW4gaW5zdGFuY2Ugb2YgdGhlIGdpdmVuIGNsYXNzLlxyXG4gICAgICogQHBhcmFtIHN0YXRlQ2xhc3MgLSBUaGUgY2xhc3MgdG8gY2hlY2sgYWdhaW5zdFxyXG4gICAgICogQHJldHVybnMgVHJ1ZSBpZiB0aGlzIHN0YXRlIGlzIGFuIGluc3RhbmNlIG9mIHRoZSBjbGFzcywgZmFsc2Ugb3RoZXJ3aXNlXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBpcyhzdGF0ZUNsYXNzOiBTdGF0ZUNsYXNzKTogYm9vbGVhbiB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMgaW5zdGFuY2VvZiBzdGF0ZUNsYXNzO1xyXG4gICAgfVxyXG4gICAgLy8gI2VuZHJlZ2lvblxyXG5cclxuICAgIC8vICNyZWdpb24gU2VyaWFsaXphdGlvblxyXG4gICAgLyoqXHJcbiAgICAgKiBHZXRzIHRoZSBkeW5hbWljIHByb3BlcnR5IGtleSBmb3Igc3RvcmluZyBzZXJpYWxpemVkIHN0YXRlIGRhdGEuXHJcbiAgICAgKiBAcmV0dXJucyBUaGUgcHJvcGVydHkga2V5IHVuaXF1ZSB0byB0aGlzIHN0YXRlJ3MgYWRkcmVzc1xyXG4gICAgICovXHJcbiAgICBwcml2YXRlIGdldCBzdG9yZUtleSgpOiBzdHJpbmcge1xyXG4gICAgICAgIHJldHVybiBgc3RhdGVfc2tlbGV0b246JHt0aGlzLmFic29sdXRlQWRkcmVzc31gO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogT3ZlcnJpZGUgdG8gcHJvdmlkZSBkYXRhIHRoYXQgc2hvdWxkIGJlIHBlcnNpc3RlZCB3aGVuIGV4aXRpbmcgdGhpcyBzdGF0ZS5cclxuICAgICAqIEByZXR1cm5zIEFuIG9iamVjdCBjb250YWluaW5nIGRhdGEgdG8gc2VyaWFsaXplLCBvciB1bmRlZmluZWQgZm9yIG5vIHBlcnNpc3RlbmNlXHJcbiAgICAgKi9cclxuICAgIHByb3RlY3RlZCBjcmVhdGVNZW1vcnkoKTogU3RhdGVNZW1vcnkgfCB1bmRlZmluZWQge1xyXG4gICAgICAgIHJldHVybiB1bmRlZmluZWQ7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBXcml0ZXMgbWVtb3J5IHRvIGVudGl0eSBkeW5hbWljIHByb3BlcnRpZXMuXHJcbiAgICAgKiBAcGFyYW0gbWVtb3J5IC0gVGhlIGRhdGEgdG8gcGVyc2lzdFxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIHdyaXRlTWVtb3J5VG9TdG9yZShtZW1vcnk6IFN0YXRlTWVtb3J5KTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5jb250ZXh0LmVudGl0eS5zZXREeW5hbWljUHJvcGVydHkodGhpcy5zdG9yZUtleSwgSlNPTi5zdHJpbmdpZnkobWVtb3J5KSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBSZWFkcyBhbmQgZGVzZXJpYWxpemVzIHByZXZpb3VzbHkgc3RvcmVkIG1lbW9yeSBkYXRhLlxyXG4gICAgICogQHJldHVybnMgVGhlIGRlc2VyaWFsaXplZCBkYXRhIG9iamVjdCwgb3IgdW5kZWZpbmVkIGlmIG5vbmUgZXhpc3RzXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgcmVhZE1lbW9yeUZyb21TdG9yZSgpOiBTdGF0ZU1lbW9yeSB8IHVuZGVmaW5lZCB7XHJcbiAgICAgICAgY29uc3QgdmFsdWUgPSB0aGlzLmNvbnRleHQuZW50aXR5LmdldER5bmFtaWNQcm9wZXJ0eSh0aGlzLnN0b3JlS2V5KTtcclxuICAgICAgICBpZiAodHlwZW9mIHZhbHVlICE9PSBcInN0cmluZ1wiKSByZXR1cm47XHJcbiAgICAgICAgcmV0dXJuIEpTT04ucGFyc2UodmFsdWUpIGFzIFN0YXRlTWVtb3J5O1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQ2hlY2tzIGlmIHRoaXMgc3RhdGUgaGFzIGFueSBzdG9yZWQgbWVtb3J5LlxyXG4gICAgICogQHJldHVybnMgVHJ1ZSBpZiBtZW1vcnkgZXhpc3RzLCBmYWxzZSBvdGhlcndpc2VcclxuICAgICAqL1xyXG4gICAgcHVibGljIGhhc01lbW9yeSgpOiBib29sZWFuIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5jb250ZXh0LmVudGl0eS5nZXREeW5hbWljUHJvcGVydHlJZHMoKS5pbmNsdWRlcyh0aGlzLnN0b3JlS2V5KTtcclxuICAgIH1cclxuICAgIC8vICNlbmRyZWdpb25cclxufVxyXG4iXSwibmFtZXMiOlsiRXhpdFR5cGUiLCJBYnN0cmFjdFN0YXRlIiwiZGVmaW5pdGlvbiIsImNvbnN0cnVjdG9yIiwiaWRlbnRpZmllciIsImVudGVyIiwiY29udGV4dCIsImVudGl0eSIsImlzVmFsaWQiLCJhY3RpdmVUaWNrcyIsImlzQWN0aXZlIiwidGltZW91dFRyaWdnZXJlZCIsInRyaWdnZXJFdmVudCIsInN0YXRlQ29tcG9uZW50Iiwib25TdGF0ZUNoYW5nZSIsImFic29sdXRlQWRkcmVzcyIsImlzRW50ZXJCbG9ja2VkIiwiZGF0YSIsInJlYWRNZW1vcnlGcm9tU3RvcmUiLCJvbkVudGVyIiwib25TdGF0ZUVudGVyZWQiLCJhY3RpdmVUaWNrIiwidGltZW91dER1cmF0aW9uIiwiYnJvYWRjYXN0U2lnbmFsIiwib25BY3RpdmVUaWNrIiwiaW5hY3RpdmVUaWNrIiwiaW5hY3RpdmVUaWNrcyIsIm9uSW5hY3RpdmVUaWNrIiwiZXhpdCIsImV4aXRUeXBlIiwiU3RhbmRhcmQiLCJjcmVhdGVNZW1vcnkiLCJSZW1vdmUiLCJ3cml0ZU1lbW9yeVRvU3RvcmUiLCJvbkV4aXQiLCJzaWduYWxzIiwiX21lbW9yeSIsIl9leGl0VHlwZSIsInNpZ25hbE5hbWUiLCJzdWJzY3JpcHRpb25zIiwiY2FsbGJhY2siLCJzdWJzY3JpYmVUb1NpZ25hbCIsInB1c2giLCJ3YWl0Rm9yU2lnbmFsIiwiUHJvbWlzZSIsInJlc29sdmUiLCJoYW5kbGVTaWduYWwiLCJzaWduYWwiLCJvcGVyYXRpb24iLCJldmVudCIsImUiLCJFcnJvciIsIm5hbWUiLCJjb21wdXRlU2NvcmUiLCJpcyIsInN0YXRlQ2xhc3MiLCJzdG9yZUtleSIsInVuZGVmaW5lZCIsIm1lbW9yeSIsInNldER5bmFtaWNQcm9wZXJ0eSIsIkpTT04iLCJzdHJpbmdpZnkiLCJ2YWx1ZSIsImdldER5bmFtaWNQcm9wZXJ0eSIsInBhcnNlIiwiaGFzTWVtb3J5IiwiZ2V0RHluYW1pY1Byb3BlcnR5SWRzIiwiaW5jbHVkZXMiLCJwYXJlbnRBZGRyZXNzIiwiSW5maW5pdHkiLCJyZWdpc3RlclN0YXRlIl0sIm1hcHBpbmdzIjoiQUFDQSxTQUFtQ0EsUUFBUSxRQUFrRSxXQUFXO0FBV3pHLE1BQWVDO0lBSzFCLCtDQUErQyxHQUMvQyxJQUFXQyxhQUF5QjtRQUNoQyxPQUFPLEFBQUMsSUFBSSxDQUFDQyxXQUFXLENBQTBCRCxVQUFVO0lBQ2hFO0lBRUEsNkNBQTZDLEdBQzdDLFdBQWtCRSxhQUFxQjtRQUNuQyxPQUFPLElBQUksQ0FBQ0YsVUFBVSxDQUFDRSxVQUFVO0lBQ3JDO0lBRUEsK0NBQStDLEdBQy9DLElBQVdBLGFBQXFCO1FBQzVCLE9BQU8sSUFBSSxDQUFDRixVQUFVLENBQUNFLFVBQVU7SUFDckM7SUF1Q0EsYUFBYTtJQUViLG9CQUFvQjtJQUNwQjs7O0tBR0MsR0FDRCxBQUFPQyxRQUFjO1FBQ2pCLElBQUksQ0FBQyxJQUFJLENBQUNDLE9BQU8sQ0FBQ0MsTUFBTSxDQUFDQyxPQUFPLEVBQUU7UUFFbEMsSUFBSSxDQUFDQyxXQUFXLEdBQUc7UUFDbkIsSUFBSSxDQUFDQyxRQUFRLEdBQUc7UUFDaEIsSUFBSSxDQUFDQyxnQkFBZ0IsR0FBRztRQUV4QixJQUFJLENBQUNDLFlBQVksQ0FBQztRQUVsQixJQUFJLENBQUNOLE9BQU8sQ0FBQ08sY0FBYyxDQUFDQyxhQUFhLENBQUMsSUFBSSxDQUFDQyxlQUFlO1FBRTlELElBQUksSUFBSSxDQUFDVCxPQUFPLENBQUNPLGNBQWMsQ0FBQ0csY0FBYyxFQUFFO1lBQzVDLGdGQUFnRjtZQUNoRixJQUFJLENBQUNOLFFBQVEsR0FBRztZQUNoQjtRQUNKO1FBRUEsTUFBTU8sT0FBTyxJQUFJLENBQUNDLG1CQUFtQjtRQUNyQyxJQUFJLENBQUNDLE9BQU8sQ0FBQ0Y7UUFFYixJQUFJLENBQUNYLE9BQU8sQ0FBQ08sY0FBYyxDQUFDTyxjQUFjO0lBQzlDO0lBRUE7OztLQUdDLEdBQ0QsQUFBT0MsYUFBbUI7UUFDdEIsSUFBSSxDQUFDWixX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