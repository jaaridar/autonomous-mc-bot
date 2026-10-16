export const ScriptEventRegistry = {
    // Example event handler
    "gm1:game_event": (eventData)=>{
        const message = eventData.message;
        const args = message.split(/\s+/);
        const eventType = args[0];
        switch(eventType){
            case "example":
                {
                    BroadcastUtil.say(`Example event received: ${message}`);
                    break;
                }
        }
    }
};

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIlNjcmlwdEV2ZW50UmVnaXN0cnkudHMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgU2NyaXB0RXZlbnRDb21tYW5kTWVzc2FnZUFmdGVyRXZlbnQgfSBmcm9tIFwiQG1pbmVjcmFmdC9zZXJ2ZXJcIjtcclxuXHJcbnR5cGUgU2NyaXB0RXZlbnRSZWdpc3RyeSA9IFJlY29yZDxzdHJpbmcsIChldmVudERhdGE6IFNjcmlwdEV2ZW50Q29tbWFuZE1lc3NhZ2VBZnRlckV2ZW50KSA9PiB2b2lkPjtcclxuXHJcbmV4cG9ydCBjb25zdCBTY3JpcHRFdmVudFJlZ2lzdHJ5OiBTY3JpcHRFdmVudFJlZ2lzdHJ5ID0ge1xyXG4gICAgLy8gRXhhbXBsZSBldmVudCBoYW5kbGVyXHJcbiAgICBcImdtMTpnYW1lX2V2ZW50XCI6IChldmVudERhdGEpID0+IHtcclxuICAgICAgICBjb25zdCBtZXNzYWdlID0gZXZlbnREYXRhLm1lc3NhZ2U7XHJcbiAgICAgICAgY29uc3QgYXJncyA9IG1lc3NhZ2Uuc3BsaXQoL1xccysvKTtcclxuICAgICAgICBjb25zdCBldmVudFR5cGUgPSBhcmdzWzBdO1xyXG5cclxuICAgICAgICBzd2l0Y2ggKGV2ZW50VHlwZSkge1xyXG4gICAgICAgICAgICBjYXNlIFwiZXhhbXBsZVwiOiB7XHJcbiAgICAgICAgICAgICAgICBCcm9hZGNhc3RVdGlsLnNheShgRXhhbXBsZSBldmVudCByZWNlaXZlZDogJHttZXNzYWdlfWApO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9LFxyXG59O1xyXG4iXSwibmFtZXMiOlsiU2NyaXB0RXZlbnRSZWdpc3RyeSIsImV2ZW50RGF0YSIsIm1lc3NhZ2UiLCJhcmdzIiwic3BsaXQiLCJldmVudFR5cGUiLCJCcm9hZGNhc3RVdGlsIiwic2F5Il0sIm1hcHBpbmdzIjoiQUFJQSxPQUFPLE1BQU1BLHNCQUEyQztJQUNwRCx3QkFBd0I7SUFDeEIsa0JBQWtCLENBQUNDO1FBQ2YsTUFBTUMsVUFBVUQsVUFBVUMsT0FBTztRQUNqQyxNQUFNQyxPQUFPRCxRQUFRRSxLQUFLLENBQUM7UUFDM0IsTUFBTUMsWUFBWUYsSUFBSSxDQUFDLEVBQUU7UUFFekIsT0FBUUU7WUFDSixLQUFLO2dCQUFXO29CQUNaQyxjQUFjQyxHQUFHLENBQUMsQ0FBQyx3QkFBd0IsRUFBRUwsUUFBUSxDQUFDO29CQUN0RDtnQkFDSjtRQUNKO0lBQ0o7QUFDSixFQUFFIn0=