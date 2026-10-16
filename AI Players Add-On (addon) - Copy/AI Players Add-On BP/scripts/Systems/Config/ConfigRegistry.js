export var ConfigKey;
(function(ConfigKey) {
    ConfigKey["DebugDrawVolumeTriggers"] = "Draw Volume Triggers";
    ConfigKey["DebugDrawVolumeTriggerDistance"] = "Volume Draw Distance from Player";
})(ConfigKey || (ConfigKey = {}));
const ConfigRegistry = ()=>{
    return [
        // General Debug Settings Header
        // Trigger System Settings
        ConfigFactory.label("Trigger System Settings"),
        ConfigFactory.dropdown("Draw Volume Triggers", [
            "No",
            "Only Static",
            "Only Runtime",
            "All"
        ], "No"),
        ConfigFactory.slider("Volume Draw Distance from Player", 5, 100, 5, 30),
        // Divider
        ConfigFactory.divider()
    ];
};
export default ConfigRegistry;

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkNvbmZpZ1JlZ2lzdHJ5LnRzIl0sInNvdXJjZXNDb250ZW50IjpbImV4cG9ydCBlbnVtIENvbmZpZ0tleSB7XHJcbiAgICBEZWJ1Z0RyYXdWb2x1bWVUcmlnZ2VycyA9IFwiRHJhdyBWb2x1bWUgVHJpZ2dlcnNcIixcclxuICAgIERlYnVnRHJhd1ZvbHVtZVRyaWdnZXJEaXN0YW5jZSA9IFwiVm9sdW1lIERyYXcgRGlzdGFuY2UgZnJvbSBQbGF5ZXJcIixcclxufVxyXG5cclxuY29uc3QgQ29uZmlnUmVnaXN0cnkgPSAoKSA9PiB7XHJcbiAgICByZXR1cm4gW1xyXG4gICAgICAgIC8vIEdlbmVyYWwgRGVidWcgU2V0dGluZ3MgSGVhZGVyXHJcblxyXG4gICAgICAgIC8vIFRyaWdnZXIgU3lzdGVtIFNldHRpbmdzXHJcbiAgICAgICAgQ29uZmlnRmFjdG9yeS5sYWJlbChcIlRyaWdnZXIgU3lzdGVtIFNldHRpbmdzXCIpLFxyXG4gICAgICAgIENvbmZpZ0ZhY3RvcnkuZHJvcGRvd24oQ29uZmlnS2V5LkRlYnVnRHJhd1ZvbHVtZVRyaWdnZXJzLCBbXCJOb1wiLCBcIk9ubHkgU3RhdGljXCIsIFwiT25seSBSdW50aW1lXCIsIFwiQWxsXCJdLCBcIk5vXCIpLFxyXG4gICAgICAgIENvbmZpZ0ZhY3Rvcnkuc2xpZGVyKENvbmZpZ0tleS5EZWJ1Z0RyYXdWb2x1bWVUcmlnZ2VyRGlzdGFuY2UsIDUsIDEwMCwgNSwgMzApLFxyXG5cclxuICAgICAgICAvLyBEaXZpZGVyXHJcbiAgICAgICAgQ29uZmlnRmFjdG9yeS5kaXZpZGVyKCksXHJcbiAgICBdO1xyXG59O1xyXG5cclxuZXhwb3J0IHR5cGUgQ29uZmlnUmVnaXN0cnlUeXBlTWFwID0ge1xyXG4gICAgW0sgaW4gUmV0dXJuVHlwZTx0eXBlb2YgQ29uZmlnUmVnaXN0cnk+W251bWJlcl0gYXMgSyBleHRlbmRzIHsgdHlwZTogXCJoZWFkZXJcIiB8IFwibGFiZWxcIiB8IFwiZGl2aWRlclwiIH1cclxuICAgICAgICA/IG5ldmVyXHJcbiAgICAgICAgOiBLIGV4dGVuZHMgeyBsYWJlbDogaW5mZXIgTCB9XHJcbiAgICAgICAgICA/IExcclxuICAgICAgICAgIDogbmV2ZXJdOiBLIGV4dGVuZHMgeyBnZXREZWZhdWx0VmFsdWUoKTogaW5mZXIgVCB9ID8gVCA6IG5ldmVyO1xyXG59O1xyXG5cclxuZXhwb3J0IGRlZmF1bHQgQ29uZmlnUmVnaXN0cnk7XHJcbiJdLCJuYW1lcyI6WyJDb25maWdLZXkiLCJDb25maWdSZWdpc3RyeSIsIkNvbmZpZ0ZhY3RvcnkiLCJsYWJlbCIsImRyb3Bkb3duIiwic2xpZGVyIiwiZGl2aWRlciJdLCJtYXBwaW5ncyI6IjtVQUFZQTs7O0dBQUFBLGNBQUFBO0FBS1osTUFBTUMsaUJBQWlCO0lBQ25CLE9BQU87UUFDSCxnQ0FBZ0M7UUFFaEMsMEJBQTBCO1FBQzFCQyxjQUFjQyxLQUFLLENBQUM7UUFDcEJELGNBQWNFLFFBQVEseUJBQW9DO1lBQUM7WUFBTTtZQUFlO1lBQWdCO1NBQU0sRUFBRTtRQUN4R0YsY0FBY0csTUFBTSxxQ0FBMkMsR0FBRyxLQUFLLEdBQUc7UUFFMUUsVUFBVTtRQUNWSCxjQUFjSSxPQUFPO0tBQ3hCO0FBQ0w7QUFVQSxlQUFlTCxlQUFlIn0=