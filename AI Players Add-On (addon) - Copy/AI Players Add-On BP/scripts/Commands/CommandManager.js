import Env from "Env";
import CommandRegistry from "./CommandRegistry";
class CommandManager {
    static init(registry) {
        this.registry = registry;
        // Instantiate command classes and collect enums
        for (const Class of CommandRegistry){
            const instance = new Class();
            this.commands.push(instance);
            this.registerEnums(instance.enums, instance.name);
        }
        // Register non-prod commands
        if (Env !== "prod") {
            const devCommands = this.filterByCategory("dev");
            for (const c of devCommands)c.register(this.registry);
        }
        // Register prod commands
        const gameCommands = this.filterByCategory("prod");
        for (const c of gameCommands)c.register(this.registry);
    }
    /**
     * Registers the collected enums with the command registry.
     * @param enums - The array of enums to register.
     */ static registerEnums(enums, source) {
        for(const key in enums){
            const values = enums[key];
            values.sort();
            if (this.registeredEnums[key]) {
                const existingValues = this.registeredEnums[key];
                const differentValues = JSON.stringify(existingValues) !== JSON.stringify(values);
                if (differentValues) {
                    const error = `[CommandManager] "${source}" and "${this.registeredEnumSources[key]}" specify different values for enum "${key}"`;
                    console.error(error);
                }
                continue;
            }
            this.registeredEnums[key] = values;
            this.registeredEnumSources[key] = source;
            this.registry.registerEnum(key, values);
        }
    }
    /**
     * Filters the available command classes by the specified category.
     * @param category - The category to filter by. Can be either `"dev"` or `"game"`.
     * @returns An array of command classes whose category matches the specified value.
     */ static filterByCategory(category) {
        return this.commands.filter((c)=>c.category === category);
    }
}
CommandManager.commands = [];
CommandManager.registeredEnums = {};
CommandManager.registeredEnumSources = {};
export { CommandManager as default };

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkNvbW1hbmRNYW5hZ2VyLnRzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEN1c3RvbUNvbW1hbmRSZWdpc3RyeSB9IGZyb20gXCJAbWluZWNyYWZ0L3NlcnZlclwiO1xyXG5pbXBvcnQgRW52IGZyb20gXCJFbnZcIjtcclxuaW1wb3J0IHsgQWJzdHJhY3RDb21tYW5kLCBDb21tYW5kQ2F0ZWdvcnksIEVudW1zIH0gZnJvbSBcIi4vQWJzdHJhY3RDb21tYW5kXCI7XHJcbmltcG9ydCBDb21tYW5kUmVnaXN0cnkgZnJvbSBcIi4vQ29tbWFuZFJlZ2lzdHJ5XCI7XHJcblxyXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBDb21tYW5kTWFuYWdlciB7XHJcbiAgICBwcml2YXRlIHN0YXRpYyByZWdpc3RyeTogQ3VzdG9tQ29tbWFuZFJlZ2lzdHJ5O1xyXG4gICAgcHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgY29tbWFuZHM6IEFic3RyYWN0Q29tbWFuZFtdID0gW107XHJcbiAgICBwcml2YXRlIHN0YXRpYyByZWFkb25seSByZWdpc3RlcmVkRW51bXM6IEVudW1zID0ge307XHJcbiAgICBwcml2YXRlIHN0YXRpYyByZWFkb25seSByZWdpc3RlcmVkRW51bVNvdXJjZXM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7fTtcclxuXHJcbiAgICBwdWJsaWMgc3RhdGljIGluaXQocmVnaXN0cnk6IEN1c3RvbUNvbW1hbmRSZWdpc3RyeSkge1xyXG4gICAgICAgIHRoaXMucmVnaXN0cnkgPSByZWdpc3RyeTtcclxuXHJcbiAgICAgICAgLy8gSW5zdGFudGlhdGUgY29tbWFuZCBjbGFzc2VzIGFuZCBjb2xsZWN0IGVudW1zXHJcbiAgICAgICAgZm9yIChjb25zdCBDbGFzcyBvZiBDb21tYW5kUmVnaXN0cnkpIHtcclxuICAgICAgICAgICAgY29uc3QgaW5zdGFuY2UgPSBuZXcgQ2xhc3MoKTtcclxuICAgICAgICAgICAgdGhpcy5jb21tYW5kcy5wdXNoKGluc3RhbmNlKTtcclxuICAgICAgICAgICAgdGhpcy5yZWdpc3RlckVudW1zKGluc3RhbmNlLmVudW1zLCBpbnN0YW5jZS5uYW1lKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIFJlZ2lzdGVyIG5vbi1wcm9kIGNvbW1hbmRzXHJcbiAgICAgICAgaWYgKEVudiAhPT0gXCJwcm9kXCIpIHtcclxuICAgICAgICAgICAgY29uc3QgZGV2Q29tbWFuZHMgPSB0aGlzLmZpbHRlckJ5Q2F0ZWdvcnkoXCJkZXZcIik7XHJcbiAgICAgICAgICAgIGZvciAoY29uc3QgYyBvZiBkZXZDb21tYW5kcykgYy5yZWdpc3Rlcih0aGlzLnJlZ2lzdHJ5KTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIFJlZ2lzdGVyIHByb2QgY29tbWFuZHNcclxuICAgICAgICBjb25zdCBnYW1lQ29tbWFuZHMgPSB0aGlzLmZpbHRlckJ5Q2F0ZWdvcnkoXCJwcm9kXCIpO1xyXG4gICAgICAgIGZvciAoY29uc3QgYyBvZiBnYW1lQ29tbWFuZHMpIGMucmVnaXN0ZXIodGhpcy5yZWdpc3RyeSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBSZWdpc3RlcnMgdGhlIGNvbGxlY3RlZCBlbnVtcyB3aXRoIHRoZSBjb21tYW5kIHJlZ2lzdHJ5LlxyXG4gICAgICogQHBhcmFtIGVudW1zIC0gVGhlIGFycmF5IG9mIGVudW1zIHRvIHJlZ2lzdGVyLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIHN0YXRpYyByZWdpc3RlckVudW1zKGVudW1zOiBFbnVtcywgc291cmNlOiBzdHJpbmcpIHtcclxuICAgICAgICBmb3IgKGNvbnN0IGtleSBpbiBlbnVtcykge1xyXG4gICAgICAgICAgICBjb25zdCB2YWx1ZXMgPSBlbnVtc1trZXldO1xyXG5cclxuICAgICAgICAgICAgdmFsdWVzLnNvcnQoKTtcclxuXHJcbiAgICAgICAgICAgIGlmICh0aGlzLnJlZ2lzdGVyZWRFbnVtc1trZXldKSB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBleGlzdGluZ1ZhbHVlcyA9IHRoaXMucmVnaXN0ZXJlZEVudW1zW2tleV07XHJcbiAgICAgICAgICAgICAgICBjb25zdCBkaWZmZXJlbnRWYWx1ZXMgPSBKU09OLnN0cmluZ2lmeShleGlzdGluZ1ZhbHVlcykgIT09IEpTT04uc3RyaW5naWZ5KHZhbHVlcyk7XHJcbiAgICAgICAgICAgICAgICBpZiAoZGlmZmVyZW50VmFsdWVzKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZXJyb3IgPSBgW0NvbW1hbmRNYW5hZ2VyXSBcIiR7c291cmNlfVwiIGFuZCBcIiR7dGhpcy5yZWdpc3RlcmVkRW51bVNvdXJjZXNba2V5XX1cIiBzcGVjaWZ5IGRpZmZlcmVudCB2YWx1ZXMgZm9yIGVudW0gXCIke2tleX1cImA7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcihlcnJvcik7XHJcbiAgICAgICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIHRoaXMucmVnaXN0ZXJlZEVudW1zW2tleV0gPSB2YWx1ZXM7XHJcbiAgICAgICAgICAgIHRoaXMucmVnaXN0ZXJlZEVudW1Tb3VyY2VzW2tleV0gPSBzb3VyY2U7XHJcbiAgICAgICAgICAgIHRoaXMucmVnaXN0cnkucmVnaXN0ZXJFbnVtKGtleSwgdmFsdWVzKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBGaWx0ZXJzIHRoZSBhdmFpbGFibGUgY29tbWFuZCBjbGFzc2VzIGJ5IHRoZSBzcGVjaWZpZWQgY2F0ZWdvcnkuXHJcbiAgICAgKiBAcGFyYW0gY2F0ZWdvcnkgLSBUaGUgY2F0ZWdvcnkgdG8gZmlsdGVyIGJ5LiBDYW4gYmUgZWl0aGVyIGBcImRldlwiYCBvciBgXCJnYW1lXCJgLlxyXG4gICAgICogQHJldHVybnMgQW4gYXJyYXkgb2YgY29tbWFuZCBjbGFzc2VzIHdob3NlIGNhdGVnb3J5IG1hdGNoZXMgdGhlIHNwZWNpZmllZCB2YWx1ZS5cclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBmaWx0ZXJCeUNhdGVnb3J5KGNhdGVnb3J5OiBDb21tYW5kQ2F0ZWdvcnkpIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5jb21tYW5kcy5maWx0ZXIoKGMpID0+IGMuY2F0ZWdvcnkgPT09IGNhdGVnb3J5KTtcclxuICAgIH1cclxufVxyXG4iXSwibmFtZXMiOlsiRW52IiwiQ29tbWFuZFJlZ2lzdHJ5IiwiQ29tbWFuZE1hbmFnZXIiLCJpbml0IiwicmVnaXN0cnkiLCJDbGFzcyIsImluc3RhbmNlIiwiY29tbWFuZHMiLCJwdXNoIiwicmVnaXN0ZXJFbnVtcyIsImVudW1zIiwibmFtZSIsImRldkNvbW1hbmRzIiwiZmlsdGVyQnlDYXRlZ29yeSIsImMiLCJyZWdpc3RlciIsImdhbWVDb21tYW5kcyIsInNvdXJjZSIsImtleSIsInZhbHVlcyIsInNvcnQiLCJyZWdpc3RlcmVkRW51bXMiLCJleGlzdGluZ1ZhbHVlcyIsImRpZmZlcmVudFZhbHVlcyIsIkpTT04iLCJzdHJpbmdpZnkiLCJlcnJvciIsInJlZ2lzdGVyZWRFbnVtU291cmNlcyIsImNvbnNvbGUiLCJyZWdpc3RlckVudW0iLCJjYXRlZ29yeSIsImZpbHRlciJdLCJtYXBwaW5ncyI6IkFBQ0EsT0FBT0EsU0FBUyxNQUFNO0FBRXRCLE9BQU9DLHFCQUFxQixvQkFBb0I7QUFFakMsTUFBTUM7SUFNakIsT0FBY0MsS0FBS0MsUUFBK0IsRUFBRTtRQUNoRCxJQUFJLENBQUNBLFFBQVEsR0FBR0E7UUFFaEIsZ0RBQWdEO1FBQ2hELEtBQUssTUFBTUMsU0FBU0osZ0JBQWlCO1lBQ2pDLE1BQU1LLFdBQVcsSUFBSUQ7WUFDckIsSUFBSSxDQUFDRSxRQUFRLENBQUNDLElBQUksQ0FBQ0Y7WUFDbkIsSUFBSSxDQUFDRyxhQUFhLENBQUNILFNBQVNJLEtBQUssRUFBRUosU0FBU0ssSUFBSTtRQUNwRDtRQUVBLDZCQUE2QjtRQUM3QixJQUFJWCxRQUFRLFFBQVE7WUFDaEIsTUFBTVksY0FBYyxJQUFJLENBQUNDLGdCQUFnQixDQUFDO1lBQzFDLEtBQUssTUFBTUMsS0FBS0YsWUFBYUUsRUFBRUMsUUFBUSxDQUFDLElBQUksQ0FBQ1gsUUFBUTtRQUN6RDtRQUVBLHlCQUF5QjtRQUN6QixNQUFNWSxlQUFlLElBQUksQ0FBQ0gsZ0JBQWdCLENBQUM7UUFDM0MsS0FBSyxNQUFNQyxLQUFLRSxhQUFjRixFQUFFQyxRQUFRLENBQUMsSUFBSSxDQUFDWCxRQUFRO0lBQzFEO0lBRUE7OztLQUdDLEdBQ0QsT0FBZUssY0FBY0MsS0FBWSxFQUFFTyxNQUFjLEVBQUU7UUFDdkQsSUFBSyxNQUFNQyxPQUFPUixNQUFPO1lBQ3JCLE1BQU1TLFNBQVNULEtBQUssQ0FBQ1EsSUFBSTtZQUV6QkMsT0FBT0MsSUFBSTtZQUVYLElBQUksSUFBSSxDQUFDQyxlQUFlLENBQUNILElBQUksRUFBRTtnQkFDM0IsTUFBTUksaUJBQWlCLElBQUksQ0FBQ0QsZUFBZSxDQUFDSCxJQUFJO2dCQUNoRCxNQUFNSyxrQkFBa0JDLEtBQUtDLFNBQVMsQ0FBQ0gsb0JBQW9CRSxLQUFLQyxTQUFTLENBQUNOO2dCQUMxRSxJQUFJSSxpQkFBaUI7b0JBQ2pCLE1BQU1HLFFBQVEsQ0FBQyxrQkFBa0IsRUFBRVQsT0FBTyxPQUFPLEVBQUUsSUFBSSxDQUFDVSxxQkFBcUIsQ0FBQ1QsSUFBSSxDQUFDLHFDQUFxQyxFQUFFQSxJQUFJLENBQUMsQ0FBQztvQkFDaElVLFFBQVFGLEtBQUssQ0FBQ0E7Z0JBQ2xCO2dCQUVBO1lBQ0o7WUFFQSxJQUFJLENBQUNMLGVBQWUsQ0FBQ0gsSUFBSSxHQUFHQztZQUM1QixJQUFJLENBQUNRLHFCQUFxQixDQUFDVCxJQUFJLEdBQUdEO1lBQ2xDLElBQUksQ0FBQ2IsUUFBUSxDQUFDeUIsWUFBWSxDQUFDWCxLQUFLQztRQUNwQztJQUNKO0lBRUE7Ozs7S0FJQyxHQUNELE9BQWNOLGlCQUFpQmlCLFFBQXlCLEVBQUU7UUFDdEQsT0FBTyxJQUFJLENBQUN2QixRQUFRLENBQUN3QixNQUFNLENBQUMsQ0FBQ2pCLElBQU1BLEVBQUVnQixRQUFRLEtBQUtBO0lBQ3REO0FBQ0o7QUE5RHFCNUIsZUFFT0ssV0FBOEIsRUFBRTtBQUZ2Q0wsZUFHT21CLGtCQUF5QixDQUFDO0FBSGpDbkIsZUFJT3lCLHdCQUFnRCxDQUFDO0FBSjdFLFNBQXFCekIsNEJBOERwQiJ9