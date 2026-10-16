import { CustomCommandParamType } from "@minecraft/server";
import { AbstractCommand } from "Commands/AbstractCommand";
import DebugRoutineData from "Data/BigBrain/Routines/DebugRoutineData";
export class ToggleDebugRoutineCommand extends AbstractCommand {
    handler(_origin, value) {
        const newValue = value ?? !DebugRoutineData.IsEnabled;
        DebugRoutineData.IsEnabled = newValue;
        const stateText = newValue ? "Enabled" : "Disabled";
        const stateCode = newValue ? "§a" : "§c";
        BroadcastUtil.say(`${stateCode}${stateText} Debug Routine`);
    }
    constructor(...args){
        super(...args);
        this.name = "gm1_sky:debug_routine";
        this.category = "dev";
        this.cheatsRequired = true;
        this.description = "Toggles the debug routine";
        this.optionalParameters = [
            {
                name: "value",
                type: CustomCommandParamType.Boolean
            }
        ];
    }
}

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIlRvZ2dsZURlYnVnUm91dGluZUNvbW1hbmQudHMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgQ3VzdG9tQ29tbWFuZE9yaWdpbiwgQ3VzdG9tQ29tbWFuZFBhcmFtZXRlciwgQ3VzdG9tQ29tbWFuZFBhcmFtVHlwZSB9IGZyb20gXCJAbWluZWNyYWZ0L3NlcnZlclwiO1xyXG5pbXBvcnQgeyBBYnN0cmFjdENvbW1hbmQsIENvbW1hbmRDYXRlZ29yeSB9IGZyb20gXCJDb21tYW5kcy9BYnN0cmFjdENvbW1hbmRcIjtcclxuaW1wb3J0IERlYnVnUm91dGluZURhdGEgZnJvbSBcIkRhdGEvQmlnQnJhaW4vUm91dGluZXMvRGVidWdSb3V0aW5lRGF0YVwiO1xyXG5cclxuZXhwb3J0IGNsYXNzIFRvZ2dsZURlYnVnUm91dGluZUNvbW1hbmQgZXh0ZW5kcyBBYnN0cmFjdENvbW1hbmQge1xyXG4gICAgcHVibGljIHJlYWRvbmx5IG5hbWUgPSBcImdtMV9za3k6ZGVidWdfcm91dGluZVwiO1xyXG4gICAgcHVibGljIHJlYWRvbmx5IGNhdGVnb3J5OiBDb21tYW5kQ2F0ZWdvcnkgPSBcImRldlwiO1xyXG4gICAgcHVibGljIHJlYWRvbmx5IGNoZWF0c1JlcXVpcmVkID0gdHJ1ZTtcclxuICAgIHByb3RlY3RlZCByZWFkb25seSBkZXNjcmlwdGlvbiA9IFwiVG9nZ2xlcyB0aGUgZGVidWcgcm91dGluZVwiO1xyXG4gICAgcHVibGljIHJlYWRvbmx5IG9wdGlvbmFsUGFyYW1ldGVyczogQ3VzdG9tQ29tbWFuZFBhcmFtZXRlcltdID0gW1xyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbmFtZTogXCJ2YWx1ZVwiLFxyXG4gICAgICAgICAgICB0eXBlOiBDdXN0b21Db21tYW5kUGFyYW1UeXBlLkJvb2xlYW4sXHJcbiAgICAgICAgfSxcclxuICAgIF07XHJcblxyXG4gICAgcHVibGljIGhhbmRsZXIoX29yaWdpbjogQ3VzdG9tQ29tbWFuZE9yaWdpbiwgdmFsdWU/OiBib29sZWFuKSB7XHJcbiAgICAgICAgY29uc3QgbmV3VmFsdWUgPSB2YWx1ZSA/PyAhRGVidWdSb3V0aW5lRGF0YS5Jc0VuYWJsZWQ7XHJcbiAgICAgICAgRGVidWdSb3V0aW5lRGF0YS5Jc0VuYWJsZWQgPSBuZXdWYWx1ZTtcclxuXHJcbiAgICAgICAgY29uc3Qgc3RhdGVUZXh0ID0gbmV3VmFsdWUgPyBcIkVuYWJsZWRcIiA6IFwiRGlzYWJsZWRcIjtcclxuICAgICAgICBjb25zdCBzdGF0ZUNvZGUgPSBuZXdWYWx1ZSA/IFwiwqdhXCIgOiBcIsKnY1wiO1xyXG4gICAgICAgIEJyb2FkY2FzdFV0aWwuc2F5KGAke3N0YXRlQ29kZX0ke3N0YXRlVGV4dH0gRGVidWcgUm91dGluZWApO1xyXG4gICAgfVxyXG59XHJcbiJdLCJuYW1lcyI6WyJDdXN0b21Db21tYW5kUGFyYW1UeXBlIiwiQWJzdHJhY3RDb21tYW5kIiwiRGVidWdSb3V0aW5lRGF0YSIsIlRvZ2dsZURlYnVnUm91dGluZUNvbW1hbmQiLCJoYW5kbGVyIiwiX29yaWdpbiIsInZhbHVlIiwibmV3VmFsdWUiLCJJc0VuYWJsZWQiLCJzdGF0ZVRleHQiLCJzdGF0ZUNvZGUiLCJCcm9hZGNhc3RVdGlsIiwic2F5IiwibmFtZSIsImNhdGVnb3J5IiwiY2hlYXRzUmVxdWlyZWQiLCJkZXNjcmlwdGlvbiIsIm9wdGlvbmFsUGFyYW1ldGVycyIsInR5cGUiLCJCb29sZWFuIl0sIm1hcHBpbmdzIjoiQUFBQSxTQUFzREEsc0JBQXNCLFFBQVEsb0JBQW9CO0FBQ3hHLFNBQVNDLGVBQWUsUUFBeUIsMkJBQTJCO0FBQzVFLE9BQU9DLHNCQUFzQiwwQ0FBMEM7QUFFdkUsT0FBTyxNQUFNQyxrQ0FBa0NGO0lBWXBDRyxRQUFRQyxPQUE0QixFQUFFQyxLQUFlLEVBQUU7UUFDMUQsTUFBTUMsV0FBV0QsU0FBUyxDQUFDSixpQkFBaUJNLFNBQVM7UUFDckROLGlCQUFpQk0sU0FBUyxHQUFHRDtRQUU3QixNQUFNRSxZQUFZRixXQUFXLFlBQVk7UUFDekMsTUFBTUcsWUFBWUgsV0FBVyxPQUFPO1FBQ3BDSSxjQUFjQyxHQUFHLENBQUMsQ0FBQyxFQUFFRixVQUFVLEVBQUVELFVBQVUsY0FBYyxDQUFDO0lBQzlEOzs7YUFsQmdCSSxPQUFPO2FBQ1BDLFdBQTRCO2FBQzVCQyxpQkFBaUI7YUFDZEMsY0FBYzthQUNqQkMscUJBQStDO1lBQzNEO2dCQUNJSixNQUFNO2dCQUNOSyxNQUFNbEIsdUJBQXVCbUIsT0FBTztZQUN4QztTQUNIOztBQVVMIn0=