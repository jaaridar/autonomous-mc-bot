import { CustomCommandParamType, system, TicksPerSecond } from "@minecraft/server";
import { AbstractCommand } from "Commands/AbstractCommand";
export class DebugReportCommand extends AbstractCommand {
    handler(_origin, seconds, context) {
        if (seconds === undefined || isNaN(seconds) || seconds <= 0) {
            DebugTimer.report();
            return;
        }
        console.warn(`(DebugTimer) Clearing current counters and starting a ${seconds} seconds report`);
        if (context) console.warn(`(DebugTimer) Report context ${context}`);
        DebugTimer.clear();
        system.runTimeout(()=>{
            console.warn("(DebugTimer) End");
            DebugTimer.report();
        }, seconds * TicksPerSecond);
    }
    constructor(...args){
        super(...args);
        this.name = "gm1_sky:debug_report";
        this.category = "dev";
        this.cheatsRequired = true;
        this.description = "Prints a debug log to the console.";
        this.optionalParameters = [
            {
                name: "seconds",
                type: CustomCommandParamType.Integer
            },
            {
                name: "context",
                type: CustomCommandParamType.String
            }
        ];
    }
}

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkRlYnVnUmVwb3J0LnRzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEN1c3RvbUNvbW1hbmRPcmlnaW4sIEN1c3RvbUNvbW1hbmRQYXJhbVR5cGUsIHN5c3RlbSwgVGlja3NQZXJTZWNvbmQgfSBmcm9tIFwiQG1pbmVjcmFmdC9zZXJ2ZXJcIjtcclxuaW1wb3J0IHsgQWJzdHJhY3RDb21tYW5kLCBDb21tYW5kQ2F0ZWdvcnkgfSBmcm9tIFwiQ29tbWFuZHMvQWJzdHJhY3RDb21tYW5kXCI7XHJcblxyXG5leHBvcnQgY2xhc3MgRGVidWdSZXBvcnRDb21tYW5kIGV4dGVuZHMgQWJzdHJhY3RDb21tYW5kIHtcclxuICAgIHB1YmxpYyByZWFkb25seSBuYW1lID0gXCJnbTFfc2t5OmRlYnVnX3JlcG9ydFwiO1xyXG4gICAgcHVibGljIHJlYWRvbmx5IGNhdGVnb3J5OiBDb21tYW5kQ2F0ZWdvcnkgPSBcImRldlwiO1xyXG4gICAgcHVibGljIHJlYWRvbmx5IGNoZWF0c1JlcXVpcmVkID0gdHJ1ZTtcclxuICAgIHByb3RlY3RlZCByZWFkb25seSBkZXNjcmlwdGlvbiA9IFwiUHJpbnRzIGEgZGVidWcgbG9nIHRvIHRoZSBjb25zb2xlLlwiO1xyXG4gICAgcHJvdGVjdGVkIHJlYWRvbmx5IG9wdGlvbmFsUGFyYW1ldGVycyA9IFtcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIG5hbWU6IFwic2Vjb25kc1wiLFxyXG4gICAgICAgICAgICB0eXBlOiBDdXN0b21Db21tYW5kUGFyYW1UeXBlLkludGVnZXIsXHJcbiAgICAgICAgfSxcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIG5hbWU6IFwiY29udGV4dFwiLFxyXG4gICAgICAgICAgICB0eXBlOiBDdXN0b21Db21tYW5kUGFyYW1UeXBlLlN0cmluZyxcclxuICAgICAgICB9LFxyXG4gICAgXTtcclxuXHJcbiAgICBwdWJsaWMgaGFuZGxlcihfb3JpZ2luOiBDdXN0b21Db21tYW5kT3JpZ2luLCBzZWNvbmRzOiBudW1iZXIgfCB1bmRlZmluZWQsIGNvbnRleHQ6IHN0cmluZyB8IHVuZGVmaW5lZCkge1xyXG4gICAgICAgIGlmIChzZWNvbmRzID09PSB1bmRlZmluZWQgfHwgaXNOYU4oc2Vjb25kcykgfHwgc2Vjb25kcyA8PSAwKSB7XHJcbiAgICAgICAgICAgIERlYnVnVGltZXIucmVwb3J0KCk7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGNvbnNvbGUud2FybihgKERlYnVnVGltZXIpIENsZWFyaW5nIGN1cnJlbnQgY291bnRlcnMgYW5kIHN0YXJ0aW5nIGEgJHtzZWNvbmRzfSBzZWNvbmRzIHJlcG9ydGApO1xyXG4gICAgICAgIGlmIChjb250ZXh0KSBjb25zb2xlLndhcm4oYChEZWJ1Z1RpbWVyKSBSZXBvcnQgY29udGV4dCAke2NvbnRleHR9YCk7XHJcbiAgICAgICAgRGVidWdUaW1lci5jbGVhcigpO1xyXG4gICAgICAgIHN5c3RlbS5ydW5UaW1lb3V0KCgpID0+IHtcclxuICAgICAgICAgICAgY29uc29sZS53YXJuKFwiKERlYnVnVGltZXIpIEVuZFwiKTtcclxuICAgICAgICAgICAgRGVidWdUaW1lci5yZXBvcnQoKTtcclxuICAgICAgICB9LCBzZWNvbmRzICogVGlja3NQZXJTZWNvbmQpO1xyXG4gICAgfVxyXG59XHJcbiJdLCJuYW1lcyI6WyJDdXN0b21Db21tYW5kUGFyYW1UeXBlIiwic3lzdGVtIiwiVGlja3NQZXJTZWNvbmQiLCJBYnN0cmFjdENvbW1hbmQiLCJEZWJ1Z1JlcG9ydENvbW1hbmQiLCJoYW5kbGVyIiwiX29yaWdpbiIsInNlY29uZHMiLCJjb250ZXh0IiwidW5kZWZpbmVkIiwiaXNOYU4iLCJEZWJ1Z1RpbWVyIiwicmVwb3J0IiwiY29uc29sZSIsIndhcm4iLCJjbGVhciIsInJ1blRpbWVvdXQiLCJuYW1lIiwiY2F0ZWdvcnkiLCJjaGVhdHNSZXF1aXJlZCIsImRlc2NyaXB0aW9uIiwib3B0aW9uYWxQYXJhbWV0ZXJzIiwidHlwZSIsIkludGVnZXIiLCJTdHJpbmciXSwibWFwcGluZ3MiOiJBQUFBLFNBQThCQSxzQkFBc0IsRUFBRUMsTUFBTSxFQUFFQyxjQUFjLFFBQVEsb0JBQW9CO0FBQ3hHLFNBQVNDLGVBQWUsUUFBeUIsMkJBQTJCO0FBRTVFLE9BQU8sTUFBTUMsMkJBQTJCRDtJQWdCN0JFLFFBQVFDLE9BQTRCLEVBQUVDLE9BQTJCLEVBQUVDLE9BQTJCLEVBQUU7UUFDbkcsSUFBSUQsWUFBWUUsYUFBYUMsTUFBTUgsWUFBWUEsV0FBVyxHQUFHO1lBQ3pESSxXQUFXQyxNQUFNO1lBQ2pCO1FBQ0o7UUFFQUMsUUFBUUMsSUFBSSxDQUFDLENBQUMsc0RBQXNELEVBQUVQLFFBQVEsZUFBZSxDQUFDO1FBQzlGLElBQUlDLFNBQVNLLFFBQVFDLElBQUksQ0FBQyxDQUFDLDRCQUE0QixFQUFFTixRQUFRLENBQUM7UUFDbEVHLFdBQVdJLEtBQUs7UUFDaEJkLE9BQU9lLFVBQVUsQ0FBQztZQUNkSCxRQUFRQyxJQUFJLENBQUM7WUFDYkgsV0FBV0MsTUFBTTtRQUNyQixHQUFHTCxVQUFVTDtJQUNqQjs7O2FBNUJnQmUsT0FBTzthQUNQQyxXQUE0QjthQUM1QkMsaUJBQWlCO2FBQ2RDLGNBQWM7YUFDZEMscUJBQXFCO1lBQ3BDO2dCQUNJSixNQUFNO2dCQUNOSyxNQUFNdEIsdUJBQXVCdUIsT0FBTztZQUN4QztZQUNBO2dCQUNJTixNQUFNO2dCQUNOSyxNQUFNdEIsdUJBQXVCd0IsTUFBTTtZQUN2QztTQUNIOztBQWdCTCJ9