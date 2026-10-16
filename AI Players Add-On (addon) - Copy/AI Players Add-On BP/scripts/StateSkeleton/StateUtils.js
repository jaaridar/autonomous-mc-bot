import CompositeState from "./States/CompositeState";
class StateUtils {
    /**
     * Generates a Mermaid flowchart diagram for a state machine.
     * @returns A Mermaid flowchart diagram string
     */ static generateMermaidDiagram(rootState) {
        const lines = [
            "flowchart TD"
        ];
        const classes = [];
        // Add root nodes
        const rootLabel = this.getNodeLabel(rootState);
        const rootClass = this.getNodeClass(rootState);
        lines.push(`${this.INDENT}root["${rootLabel}"]`);
        classes.push(`${this.INDENT}class root ${rootClass}`);
        // Add subnodes
        const subNodes = this.generateMermaidSubtree(rootState, rootState.identifier, 1, classes);
        if (subNodes) lines.push(subNodes);
        if (classes.length > 0) lines.push("", ...classes);
        return lines.join("\n");
    }
    /**
     * Recursively generates mermaid diagram nodes for a composite state's substates.
     * @param state - The state to generate diagram nodes for
     * @param parentId - The ID of the parent node in the diagram
     * @param depth - The current depth in the state hierarchy (for indentation)
     * @param classes - Array to accumulate class definitions for states
     * @returns The generated mermaid diagram string for this subtree
     */ static generateMermaidSubtree(state, parentId, depth, classes) {
        if (!this.hasSubstates(state)) return "";
        const lines = [];
        const indent = this.INDENT.repeat(depth);
        for (const StateClass of state.definition.registry){
            const identifier = StateClass.identifier;
            const nodeId = `${parentId}-${identifier}`;
            const substate = state.getSubstate(StateClass);
            const label = this.getNodeLabel(substate);
            const nodeClass = this.getNodeClass(substate);
            lines.push(`${indent}${nodeId}["${label}"]`, `${indent}${parentId} --> ${nodeId}`);
            classes.push(`${indent}class ${nodeId} ${nodeClass}`);
            if (!this.hasSubstates(substate)) continue;
            const diagram = this.generateMermaidSubtree(substate, nodeId, depth + 1, classes);
            if (diagram) lines.push(diagram);
        }
        return lines.join("\n");
    }
    /**
     * Gets the label for a state node in the diagram.
     * @param state - The state to get the label for
     * @returns The label string for the state node
     */ static getNodeLabel(state) {
        const isLocked = state instanceof CompositeState && state.isLocked;
        const lockPrefix = isLocked ? "🔒" : "";
        let label = `${lockPrefix}${state.definition.identifier}`;
        const score = state.computeScore();
        if (score === null) return label;
        const scoreSuffix = `(${score.toFixed(2)})`;
        label = `${label}\n${scoreSuffix}`;
        return label;
    }
    /**
     * Gets the style for a state node in the diagram.
     * @param state - The state to get the style for
     * @returns The style string for the state node
     */ static getNodeClass(state) {
        if (state.isActive) return "active";
        return "inactive";
    }
    /**
     * Type guard to check if a state is a composite state with substates.
     * @param state - The state to check
     * @returns True if the state is a CompositeState with a non-empty registry
     */ static hasSubstates(state) {
        return state instanceof CompositeState && state.definition.registry.length > 0;
    }
    /**
     * Type guard to check if a composite state has an active substate.
     * @param state - The state to check
     * @returns True if the state is a CompositeState with a non-null current substate
     */ static hasCurrentSubstate(state) {
        return state instanceof CompositeState && state.currentSubstate !== null;
    }
}
StateUtils.INDENT = " ".repeat(4);
export { StateUtils as default };

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIlN0YXRlVXRpbHMudHMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IEFic3RyYWN0U3RhdGUgZnJvbSBcIi4vU3RhdGVzL0Fic3RyYWN0U3RhdGVcIjtcclxuaW1wb3J0IENvbXBvc2l0ZVN0YXRlIGZyb20gXCIuL1N0YXRlcy9Db21wb3NpdGVTdGF0ZVwiO1xyXG5cclxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgU3RhdGVVdGlscyB7XHJcbiAgICBwcml2YXRlIHN0YXRpYyByZWFkb25seSBJTkRFTlQgPSBcIiBcIi5yZXBlYXQoNCk7XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBHZW5lcmF0ZXMgYSBNZXJtYWlkIGZsb3djaGFydCBkaWFncmFtIGZvciBhIHN0YXRlIG1hY2hpbmUuXHJcbiAgICAgKiBAcmV0dXJucyBBIE1lcm1haWQgZmxvd2NoYXJ0IGRpYWdyYW0gc3RyaW5nXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgZ2VuZXJhdGVNZXJtYWlkRGlhZ3JhbShyb290U3RhdGU6IEFic3RyYWN0U3RhdGUpOiBzdHJpbmcge1xyXG4gICAgICAgIGNvbnN0IGxpbmVzOiBzdHJpbmdbXSA9IFtcImZsb3djaGFydCBURFwiXTtcclxuICAgICAgICBjb25zdCBjbGFzc2VzOiBzdHJpbmdbXSA9IFtdO1xyXG5cclxuICAgICAgICAvLyBBZGQgcm9vdCBub2Rlc1xyXG4gICAgICAgIGNvbnN0IHJvb3RMYWJlbCA9IHRoaXMuZ2V0Tm9kZUxhYmVsKHJvb3RTdGF0ZSk7XHJcbiAgICAgICAgY29uc3Qgcm9vdENsYXNzID0gdGhpcy5nZXROb2RlQ2xhc3Mocm9vdFN0YXRlKTtcclxuICAgICAgICBsaW5lcy5wdXNoKGAke3RoaXMuSU5ERU5UfXJvb3RbXCIke3Jvb3RMYWJlbH1cIl1gKTtcclxuICAgICAgICBjbGFzc2VzLnB1c2goYCR7dGhpcy5JTkRFTlR9Y2xhc3Mgcm9vdCAke3Jvb3RDbGFzc31gKTtcclxuXHJcbiAgICAgICAgLy8gQWRkIHN1Ym5vZGVzXHJcbiAgICAgICAgY29uc3Qgc3ViTm9kZXMgPSB0aGlzLmdlbmVyYXRlTWVybWFpZFN1YnRyZWUocm9vdFN0YXRlLCByb290U3RhdGUuaWRlbnRpZmllciwgMSwgY2xhc3Nlcyk7XHJcbiAgICAgICAgaWYgKHN1Yk5vZGVzKSBsaW5lcy5wdXNoKHN1Yk5vZGVzKTtcclxuICAgICAgICBpZiAoY2xhc3Nlcy5sZW5ndGggPiAwKSBsaW5lcy5wdXNoKFwiXCIsIC4uLmNsYXNzZXMpO1xyXG5cclxuICAgICAgICByZXR1cm4gbGluZXMuam9pbihcIlxcblwiKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFJlY3Vyc2l2ZWx5IGdlbmVyYXRlcyBtZXJtYWlkIGRpYWdyYW0gbm9kZXMgZm9yIGEgY29tcG9zaXRlIHN0YXRlJ3Mgc3Vic3RhdGVzLlxyXG4gICAgICogQHBhcmFtIHN0YXRlIC0gVGhlIHN0YXRlIHRvIGdlbmVyYXRlIGRpYWdyYW0gbm9kZXMgZm9yXHJcbiAgICAgKiBAcGFyYW0gcGFyZW50SWQgLSBUaGUgSUQgb2YgdGhlIHBhcmVudCBub2RlIGluIHRoZSBkaWFncmFtXHJcbiAgICAgKiBAcGFyYW0gZGVwdGggLSBUaGUgY3VycmVudCBkZXB0aCBpbiB0aGUgc3RhdGUgaGllcmFyY2h5IChmb3IgaW5kZW50YXRpb24pXHJcbiAgICAgKiBAcGFyYW0gY2xhc3NlcyAtIEFycmF5IHRvIGFjY3VtdWxhdGUgY2xhc3MgZGVmaW5pdGlvbnMgZm9yIHN0YXRlc1xyXG4gICAgICogQHJldHVybnMgVGhlIGdlbmVyYXRlZCBtZXJtYWlkIGRpYWdyYW0gc3RyaW5nIGZvciB0aGlzIHN1YnRyZWVcclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBzdGF0aWMgZ2VuZXJhdGVNZXJtYWlkU3VidHJlZShzdGF0ZTogQWJzdHJhY3RTdGF0ZSwgcGFyZW50SWQ6IHN0cmluZywgZGVwdGg6IG51bWJlciwgY2xhc3Nlczogc3RyaW5nW10pOiBzdHJpbmcge1xyXG4gICAgICAgIGlmICghdGhpcy5oYXNTdWJzdGF0ZXMoc3RhdGUpKSByZXR1cm4gXCJcIjtcclxuXHJcbiAgICAgICAgY29uc3QgbGluZXM6IHN0cmluZ1tdID0gW107XHJcbiAgICAgICAgY29uc3QgaW5kZW50ID0gdGhpcy5JTkRFTlQucmVwZWF0KGRlcHRoKTtcclxuXHJcbiAgICAgICAgZm9yIChjb25zdCBTdGF0ZUNsYXNzIG9mIHN0YXRlLmRlZmluaXRpb24ucmVnaXN0cnkpIHtcclxuICAgICAgICAgICAgY29uc3QgaWRlbnRpZmllciA9IFN0YXRlQ2xhc3MuaWRlbnRpZmllcjtcclxuICAgICAgICAgICAgY29uc3Qgbm9kZUlkID0gYCR7cGFyZW50SWR9LSR7aWRlbnRpZmllcn1gO1xyXG4gICAgICAgICAgICBjb25zdCBzdWJzdGF0ZSA9IHN0YXRlLmdldFN1YnN0YXRlKFN0YXRlQ2xhc3MpO1xyXG5cclxuICAgICAgICAgICAgY29uc3QgbGFiZWwgPSB0aGlzLmdldE5vZGVMYWJlbChzdWJzdGF0ZSk7XHJcbiAgICAgICAgICAgIGNvbnN0IG5vZGVDbGFzcyA9IHRoaXMuZ2V0Tm9kZUNsYXNzKHN1YnN0YXRlKTtcclxuXHJcbiAgICAgICAgICAgIGxpbmVzLnB1c2goYCR7aW5kZW50fSR7bm9kZUlkfVtcIiR7bGFiZWx9XCJdYCwgYCR7aW5kZW50fSR7cGFyZW50SWR9IC0tPiAke25vZGVJZH1gKTtcclxuICAgICAgICAgICAgY2xhc3Nlcy5wdXNoKGAke2luZGVudH1jbGFzcyAke25vZGVJZH0gJHtub2RlQ2xhc3N9YCk7XHJcblxyXG4gICAgICAgICAgICBpZiAoIXRoaXMuaGFzU3Vic3RhdGVzKHN1YnN0YXRlKSkgY29udGludWU7XHJcblxyXG4gICAgICAgICAgICBjb25zdCBkaWFncmFtID0gdGhpcy5nZW5lcmF0ZU1lcm1haWRTdWJ0cmVlKHN1YnN0YXRlLCBub2RlSWQsIGRlcHRoICsgMSwgY2xhc3Nlcyk7XHJcbiAgICAgICAgICAgIGlmIChkaWFncmFtKSBsaW5lcy5wdXNoKGRpYWdyYW0pO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgcmV0dXJuIGxpbmVzLmpvaW4oXCJcXG5cIik7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBHZXRzIHRoZSBsYWJlbCBmb3IgYSBzdGF0ZSBub2RlIGluIHRoZSBkaWFncmFtLlxyXG4gICAgICogQHBhcmFtIHN0YXRlIC0gVGhlIHN0YXRlIHRvIGdldCB0aGUgbGFiZWwgZm9yXHJcbiAgICAgKiBAcmV0dXJucyBUaGUgbGFiZWwgc3RyaW5nIGZvciB0aGUgc3RhdGUgbm9kZVxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIHN0YXRpYyBnZXROb2RlTGFiZWwoc3RhdGU6IEFic3RyYWN0U3RhdGUpOiBzdHJpbmcge1xyXG4gICAgICAgIGNvbnN0IGlzTG9ja2VkID0gc3RhdGUgaW5zdGFuY2VvZiBDb21wb3NpdGVTdGF0ZSAmJiBzdGF0ZS5pc0xvY2tlZDtcclxuICAgICAgICBjb25zdCBsb2NrUHJlZml4ID0gaXNMb2NrZWQgPyBcIvCflJJcIiA6IFwiXCI7XHJcbiAgICAgICAgbGV0IGxhYmVsID0gYCR7bG9ja1ByZWZpeH0ke3N0YXRlLmRlZmluaXRpb24uaWRlbnRpZmllcn1gO1xyXG5cclxuICAgICAgICBjb25zdCBzY29yZSA9IHN0YXRlLmNvbXB1dGVTY29yZSgpO1xyXG4gICAgICAgIGlmIChzY29yZSA9PT0gbnVsbCkgcmV0dXJuIGxhYmVsO1xyXG5cclxuICAgICAgICBjb25zdCBzY29yZVN1ZmZpeCA9IGAoJHtzY29yZS50b0ZpeGVkKDIpfSlgO1xyXG4gICAgICAgIGxhYmVsID0gYCR7bGFiZWx9XFxuJHtzY29yZVN1ZmZpeH1gO1xyXG4gICAgICAgIHJldHVybiBsYWJlbDtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEdldHMgdGhlIHN0eWxlIGZvciBhIHN0YXRlIG5vZGUgaW4gdGhlIGRpYWdyYW0uXHJcbiAgICAgKiBAcGFyYW0gc3RhdGUgLSBUaGUgc3RhdGUgdG8gZ2V0IHRoZSBzdHlsZSBmb3JcclxuICAgICAqIEByZXR1cm5zIFRoZSBzdHlsZSBzdHJpbmcgZm9yIHRoZSBzdGF0ZSBub2RlXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgc3RhdGljIGdldE5vZGVDbGFzcyhzdGF0ZTogQWJzdHJhY3RTdGF0ZSk6IHN0cmluZyB7XHJcbiAgICAgICAgaWYgKHN0YXRlLmlzQWN0aXZlKSByZXR1cm4gXCJhY3RpdmVcIjtcclxuICAgICAgICByZXR1cm4gXCJpbmFjdGl2ZVwiO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogVHlwZSBndWFyZCB0byBjaGVjayBpZiBhIHN0YXRlIGlzIGEgY29tcG9zaXRlIHN0YXRlIHdpdGggc3Vic3RhdGVzLlxyXG4gICAgICogQHBhcmFtIHN0YXRlIC0gVGhlIHN0YXRlIHRvIGNoZWNrXHJcbiAgICAgKiBAcmV0dXJucyBUcnVlIGlmIHRoZSBzdGF0ZSBpcyBhIENvbXBvc2l0ZVN0YXRlIHdpdGggYSBub24tZW1wdHkgcmVnaXN0cnlcclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBoYXNTdWJzdGF0ZXMoc3RhdGU6IEFic3RyYWN0U3RhdGUgfCBudWxsKTogc3RhdGUgaXMgQ29tcG9zaXRlU3RhdGUge1xyXG4gICAgICAgIHJldHVybiBzdGF0ZSBpbnN0YW5jZW9mIENvbXBvc2l0ZVN0YXRlICYmIHN0YXRlLmRlZmluaXRpb24ucmVnaXN0cnkubGVuZ3RoID4gMDtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFR5cGUgZ3VhcmQgdG8gY2hlY2sgaWYgYSBjb21wb3NpdGUgc3RhdGUgaGFzIGFuIGFjdGl2ZSBzdWJzdGF0ZS5cclxuICAgICAqIEBwYXJhbSBzdGF0ZSAtIFRoZSBzdGF0ZSB0byBjaGVja1xyXG4gICAgICogQHJldHVybnMgVHJ1ZSBpZiB0aGUgc3RhdGUgaXMgYSBDb21wb3NpdGVTdGF0ZSB3aXRoIGEgbm9uLW51bGwgY3VycmVudCBzdWJzdGF0ZVxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGhhc0N1cnJlbnRTdWJzdGF0ZShzdGF0ZTogQWJzdHJhY3RTdGF0ZSB8IG51bGwpOiBzdGF0ZSBpcyBDb21wb3NpdGVTdGF0ZSB7XHJcbiAgICAgICAgcmV0dXJuIHN0YXRlIGluc3RhbmNlb2YgQ29tcG9zaXRlU3RhdGUgJiYgc3RhdGUuY3VycmVudFN1YnN0YXRlICE9PSBudWxsO1xyXG4gICAgfVxyXG59XHJcbiJdLCJuYW1lcyI6WyJDb21wb3NpdGVTdGF0ZSIsIlN0YXRlVXRpbHMiLCJnZW5lcmF0ZU1lcm1haWREaWFncmFtIiwicm9vdFN0YXRlIiwibGluZXMiLCJjbGFzc2VzIiwicm9vdExhYmVsIiwiZ2V0Tm9kZUxhYmVsIiwicm9vdENsYXNzIiwiZ2V0Tm9kZUNsYXNzIiwicHVzaCIsIklOREVOVCIsInN1Yk5vZGVzIiwiZ2VuZXJhdGVNZXJtYWlkU3VidHJlZSIsImlkZW50aWZpZXIiLCJsZW5ndGgiLCJqb2luIiwic3RhdGUiLCJwYXJlbnRJZCIsImRlcHRoIiwiaGFzU3Vic3RhdGVzIiwiaW5kZW50IiwicmVwZWF0IiwiU3RhdGVDbGFzcyIsImRlZmluaXRpb24iLCJyZWdpc3RyeSIsIm5vZGVJZCIsInN1YnN0YXRlIiwiZ2V0U3Vic3RhdGUiLCJsYWJlbCIsIm5vZGVDbGFzcyIsImRpYWdyYW0iLCJpc0xvY2tlZCIsImxvY2tQcmVmaXgiLCJzY29yZSIsImNvbXB1dGVTY29yZSIsInNjb3JlU3VmZml4IiwidG9GaXhlZCIsImlzQWN0aXZlIiwiaGFzQ3VycmVudFN1YnN0YXRlIiwiY3VycmVudFN1YnN0YXRlIl0sIm1hcHBpbmdzIjoiQUFDQSxPQUFPQSxvQkFBb0IsMEJBQTBCO0FBRXRDLE1BQU1DO0lBR2pCOzs7S0FHQyxHQUNELE9BQWNDLHVCQUF1QkMsU0FBd0IsRUFBVTtRQUNuRSxNQUFNQyxRQUFrQjtZQUFDO1NBQWU7UUFDeEMsTUFBTUMsVUFBb0IsRUFBRTtRQUU1QixpQkFBaUI7UUFDakIsTUFBTUMsWUFBWSxJQUFJLENBQUNDLFlBQVksQ0FBQ0o7UUFDcEMsTUFBTUssWUFB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