import CompositeState from "./CompositeState";
class UtilitySelectorState extends CompositeState {
    /**
     * Evaluates and transitions to the best substate each active tick.
     */ activeTick() {
        this.transitionToBetterState();
        super.activeTick();
    }
    /**
     * Calculates the best substate and transitions to it if necessary.
     */ transitionToBetterState() {
        const bestState = this.calculateBestState();
        if (!bestState) return;
        // If state is the same, do nothing
        if (this.currentSubstate === bestState) return;
        this.setSubstate(bestState);
    }
    /**
     * Evaluates all substates and determines which has the highest utility.
     * @returns The substate with the highest score, or undefined if no substates exist
     */ calculateBestState() {
        // Find state with the highest priority
        let bestState;
        let bestUtility = -Infinity;
        for (const state of Object.values(this.substates)){
            const stateUtility = state.computeScore();
            this.scores[state.identifier] = stateUtility;
            if (stateUtility === null) continue;
            // If no best state, set this as best
            if (bestState === undefined) {
                bestState = state;
                bestUtility = stateUtility;
                continue;
            }
            // Continue if the utility is lower than highest
            if (stateUtility < bestUtility) continue;
            const bestPriority = bestState.definition.priority ?? 0;
            const statePriority = state.definition.priority ?? 0;
            // Continue if utilities are equal but bestState is greater
            if (stateUtility === bestUtility && bestPriority >= statePriority) continue;
            // Found a better state
            bestState = state;
            bestUtility = stateUtility;
        }
        return bestState;
    }
    constructor(...args){
        super(...args);
        /** Map of state identifiers to their most recent utility scores */ this.scores = {};
    }
}
/**
 * A composite state that automatically selects the best substate based on utility scores.
 *
 * UtilityState evaluates all substates each tick and transitions to the one with
 * the highest score. When scores are equal, priority values break ties.
 *
 * @template Registry - The registry of substate classes
 */ export { UtilitySelectorState as default };

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIlV0aWxpdHlTZWxlY3RvclN0YXRlLnRzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IFN0YXRlUmVnaXN0cnksIFN0YXRlU2NvcmVNYXAgfSBmcm9tIFwiLi4vVHlwZXNcIjtcclxuaW1wb3J0IENvbXBvc2l0ZVN0YXRlIGZyb20gXCIuL0NvbXBvc2l0ZVN0YXRlXCI7XHJcblxyXG4vKipcclxuICogQSBjb21wb3NpdGUgc3RhdGUgdGhhdCBhdXRvbWF0aWNhbGx5IHNlbGVjdHMgdGhlIGJlc3Qgc3Vic3RhdGUgYmFzZWQgb24gdXRpbGl0eSBzY29yZXMuXHJcbiAqXHJcbiAqIFV0aWxpdHlTdGF0ZSBldmFsdWF0ZXMgYWxsIHN1YnN0YXRlcyBlYWNoIHRpY2sgYW5kIHRyYW5zaXRpb25zIHRvIHRoZSBvbmUgd2l0aFxyXG4gKiB0aGUgaGlnaGVzdCBzY29yZS4gV2hlbiBzY29yZXMgYXJlIGVxdWFsLCBwcmlvcml0eSB2YWx1ZXMgYnJlYWsgdGllcy5cclxuICpcclxuICogQHRlbXBsYXRlIFJlZ2lzdHJ5IC0gVGhlIHJlZ2lzdHJ5IG9mIHN1YnN0YXRlIGNsYXNzZXNcclxuICovXHJcbmV4cG9ydCBkZWZhdWx0IGFic3RyYWN0IGNsYXNzIFV0aWxpdHlTZWxlY3RvclN0YXRlPFJlZ2lzdHJ5IGV4dGVuZHMgU3RhdGVSZWdpc3RyeSA9IFN0YXRlUmVnaXN0cnk+IGV4dGVuZHMgQ29tcG9zaXRlU3RhdGU8UmVnaXN0cnk+IHtcclxuICAgIC8qKiBNYXAgb2Ygc3RhdGUgaWRlbnRpZmllcnMgdG8gdGhlaXIgbW9zdCByZWNlbnQgdXRpbGl0eSBzY29yZXMgKi9cclxuICAgIHB1YmxpYyByZWFkb25seSBzY29yZXM6IFN0YXRlU2NvcmVNYXA8UmVnaXN0cnk+ID0ge307XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBFdmFsdWF0ZXMgYW5kIHRyYW5zaXRpb25zIHRvIHRoZSBiZXN0IHN1YnN0YXRlIGVhY2ggYWN0aXZlIHRpY2suXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBvdmVycmlkZSBhY3RpdmVUaWNrKCk6IHZvaWQge1xyXG4gICAgICAgIHRoaXMudHJhbnNpdGlvblRvQmV0dGVyU3RhdGUoKTtcclxuICAgICAgICBzdXBlci5hY3RpdmVUaWNrKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBDYWxjdWxhdGVzIHRoZSBiZXN0IHN1YnN0YXRlIGFuZCB0cmFuc2l0aW9ucyB0byBpdCBpZiBuZWNlc3NhcnkuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgdHJhbnNpdGlvblRvQmV0dGVyU3RhdGUoKTogdm9pZCB7XHJcbiAgICAgICAgY29uc3QgYmVzdFN0YXRlID0gdGhpcy5jYWxjdWxhdGVCZXN0U3RhdGUoKTtcclxuICAgICAgICBpZiAoIWJlc3RTdGF0ZSkgcmV0dXJuO1xyXG5cclxuICAgICAgICAvLyBJZiBzdGF0ZSBpcyB0aGUgc2FtZSwgZG8gbm90aGluZ1xyXG4gICAgICAgIGlmICh0aGlzLmN1cnJlbnRTdWJzdGF0ZSA9PT0gYmVzdFN0YXRlKSByZXR1cm47XHJcbiAgICAgICAgdGhpcy5zZXRTdWJzdGF0ZShiZXN0U3RhdGUpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogRXZhbHVhdGVzIGFsbCBzdWJzdGF0ZXMgYW5kIGRldGVybWluZXMgd2hpY2ggaGFzIHRoZSBoaWdoZXN0IHV0aWxpdHkuXHJcbiAgICAgKiBAcmV0dXJucyBUaGUgc3Vic3RhdGUgd2l0aCB0aGUgaGlnaGVzdCBzY29yZSwgb3IgdW5kZWZpbmVkIGlmIG5vIHN1YnN0YXRlcyBleGlzdFxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIGNhbGN1bGF0ZUJlc3RTdGF0ZSgpOiBJbnN0YW5jZVR5cGU8UmVnaXN0cnlbbnVtYmVyXT4gfCB1bmRlZmluZWQge1xyXG4gICAgICAgIC8vIEZpbmQgc3RhdGUgd2l0aCB0aGUgaGlnaGVzdCBwcmlvcml0eVxyXG4gICAgICAgIGxldCBiZXN0U3RhdGU6IEluc3RhbmNlVHlwZTxSZWdpc3RyeVtudW1iZXJdPiB8IHVuZGVmaW5lZDtcclxuICAgICAgICBsZXQgYmVzdFV0aWxpdHk6IG51bWJlciB8IHVuZGVmaW5lZCA9IC1JbmZpbml0eTtcclxuXHJcbiAgICAgICAgZm9yIChjb25zdCBzdGF0ZSBvZiBPYmplY3QudmFsdWVzPEluc3RhbmNlVHlwZTxSZWdpc3RyeVtudW1iZXJdPj4odGhpcy5zdWJzdGF0ZXMpKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHN0YXRlVXRpbGl0eSA9IHN0YXRlLmNvbXB1dGVTY29yZSgpO1xyXG4gICAgICAgICAgICB0aGlzLnNjb3Jlc1tzdGF0ZS5pZGVudGlmaWVyXSA9IHN0YXRlVXRpbGl0eTtcclxuXHJcbiAgICAgICAgICAgIGlmIChzdGF0ZVV0aWxpdHkgPT09IG51bGwpIGNvbnRpbnVlO1xyXG5cclxuICAgICAgICAgICAgLy8gSWYgbm8gYmVzdCBzdGF0ZSwgc2V0IHRoaXMgYXMgYmVzdFxyXG4gICAgICAgICAgICBpZiAoYmVzdFN0YXRlID09PSB1bmRlZmluZWQpIHtcclxuICAgICAgICAgICAgICAgIGJlc3RTdGF0ZSA9IHN0YXRlO1xyXG4gICAgICAgICAgICAgICAgYmVzdFV0aWxpdHkgPSBzdGF0ZVV0aWxpdHk7XHJcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgLy8gQ29udGludWUgaWYgdGhlIHV0aWxpdHkgaXMgbG93ZXIgdGhhbiBoaWdoZXN0XHJcbiAgICAgICAgICAgIGlmIChzdGF0ZVV0aWxpdHkgPCBiZXN0VXRpbGl0eSkgY29udGludWU7XHJcblxyXG4gICAgICAgICAgICBjb25zdCBiZXN0UHJpb3JpdHkgPSBiZXN0U3RhdGUuZGVmaW5pdGlvbi5wcmlvcml0eSA/PyAwO1xyXG4gICAgICAgICAgICBjb25zdCBzdGF0ZVByaW9yaXR5ID0gc3RhdGUuZGVmaW5pdGlvbi5wcmlvcml0eSA/PyAwO1xyXG5cclxuICAgICAgICAgICAgLy8gQ29udGludWUgaWYgdXRpbGl0aWVzIGFyZSBlcXVhbCBidXQgYmVzdFN0YXRlIGlzIGdyZWF0ZXJcclxuICAgICAgICAgICAgaWYgKHN0YXRlVXRpbGl0eSA9PT0gYmVzdFV0aWxpdHkgJiYgYmVzdFByaW9yaXR5ID49IHN0YXRlUHJpb3JpdHkpIGNvbnRpbnVlO1xyXG5cclxuICAgICAgICAgICAgLy8gRm91bmQgYSBiZXR0ZXIgc3RhdGVcclxuICAgICAgICAgICAgYmVzdFN0YXRlID0gc3RhdGU7XHJcbiAgICAgICAgICAgIGJlc3RVdGlsaXR5ID0gc3RhdGVVdGlsaXR5O1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgcmV0dXJuIGJlc3RTdGF0ZTtcclxuICAgIH1cclxufVxyXG4iXSwibmFtZXMiOlsiQ29tcG9zaXRlU3RhdGUiLCJVdGlsaXR5U2VsZWN0b3JTdGF0ZSIsImFjdGl2ZVRpY2siLCJ0cmFuc2l0aW9uVG9CZXR0ZXJTdGF0ZSIsImJlc3RTdGF0ZSIsImNhbGN1bGF0ZUJlc3RTdGF0ZSIsImN1cnJlbnRTdWJzdGF0ZSIsInNldFN1YnN0YXRlIiwiYmVzdFV0aWxpdHkiLCJJbmZpbml0eSIsInN0YXRlIiwiT2JqZWN0IiwidmFsdWVzIiwic3Vic3RhdGVzIiwic3RhdGVVdGlsaXR5IiwiY29tcHV0ZVNjb3JlIiwic2NvcmVzIiwiaWRlbnRpZmllciIsInVuZGVmaW5lZCIsImJlc3RQcmlvcml0eSIsImRlZmluaXRpb24iLCJwcmlvcml0eSIsInN0YXRlUHJpb3JpdHkiXSwibWFwcGluZ3MiOiJBQUNBLE9BQU9BLG9CQUFvQixtQkFBbUI7QUFVL0IsTUFBZUMsNkJBQTZFRDtJQUl2Rzs7S0FFQyxHQUNELEFBQWdCRSxhQUFtQjtRQUMvQixJQUFJLENBQUNDLHVCQUF1QjtRQUM1QixLQUFLLENBQUNEO0lBQ1Y7SUFFQTs7S0FFQyxHQUNELEFBQVFDLDBCQUFnQztRQUNwQyxNQUFNQyxZQUFZLElBQUksQ0FBQ0Msa0JBQWtCO1FBQ3pDLElBQUksQ0FBQ0QsV0FBVztRQUVoQixtQ0FBbUM7UUFDbkMsSUFBSSxJQUFJLENBQUNFLGVBQWUsS0FBS0YsV0FBVztRQUN4QyxJQUFJLENBQUNHLFdBQVcsQ0FBQ0g7SUFDckI7SUFFQTs7O0tBR0MsR0FDRCxBQUFRQyxxQkFBaUU7UUFDckUsdUNBQXVDO1FBQ3ZDLElBQUlEO1FBQ0osSUFBSUksY0FBa0MsQ0FBQ0M7UUFFdkMsS0FBSyxNQUFNQyxTQUFTQyxPQUFPQyxNQUFNLENBQWlDLElBQUksQ0FBQ0MsU0FBUyxFQUFHO1lBQy9FLE1BQU1DLGVBQWVKLE1BQU1LLFlBQVk7WUFDdkMsSUFBSSxDQUFDQyxNQUFNLENBQUNOLE1BQU1PLFVBQVUsQ0FBQyxHQUFHSDtZQUVoQyxJQUFJQSxpQkFBaUIsTUFBTTtZQUUzQixxQ0FBcUM7WUFDckMsSUFBSVYsY0FBY2MsV0FBVztnQkFDekJkLFlBQVlNO2dCQUNaRixjQUFjTTtnQkFDZDtZQUNKO1lBRUEsZ0RBQWdEO1lBQ2hELElBQUlBLGVBQWVOLGFBQWE7WUFFaEMsTUFBTVcsZUFBZWYsVUFBVWdCLFVBQVUsQ0FBQ0MsUUFBUSxJQUFJO1lBQ3RELE1BQU1DLGdCQUFnQlosTUFBTVUsVUFBVSxDQUFDQyxRQUFRLElBQUk7WUFFbkQsMkRBQTJEO1lBQzNELElBQUlQLGlCQUFpQk4sZUFBZVcsZ0JBQWdCRyxlQUFlO1lBRW5FLHVCQUF1QjtZQUN2QmxCLFlBQVlNO1lBQ1pGLGNBQWNNO1FBQ2xCO1FBRUEsT0FBT1Y7SUFDWDs7O1FBNURBLGlFQUFpRSxRQUNqRFksU0FBa0MsQ0FBQzs7QUE0RHZEO0FBdEVBOzs7Ozs7O0NBT0MsR0FDRCxTQUE4QmYsa0NBOEQ3QiJ9