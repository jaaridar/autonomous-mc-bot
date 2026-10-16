import { CustomCommandParamType } from "@minecraft/server";
import { AbstractCommand } from "Commands/AbstractCommand";
import Env from "Env";
export class DebugModeCommand extends AbstractCommand {
    handler(origin, value) {
        const player = origin.sourceEntity;
        this.handleSet(player, value);
    }
    handleSet(player, value) {
        const oldValue = EntityStore.get(player, "debugMode");
        const newValue = value ?? this.getNewValue(oldValue);
        EntityStore.set(player, "debugMode", newValue);
        this.updateNodeVisibility(player, DebugModeCommand.isEnabled(newValue));
        this.broadcast(newValue, player);
    }
    getNewValue(oldValue) {
        if (DebugModeCommand.isEnabled(oldValue)) return "disabled";
        // Default to reduced debug mode in production
        if (Env === "prod") return "minimal";
        // Default to verbose debug mode in development
        return "verbose";
    }
    static isEnabled(debugMode) {
        return debugMode !== "disabled";
    }
    updateNodeVisibility(player, isEnabled) {
        const eventName = isEnabled ? "gm1_sky:show" : "gm1_sky:hide";
        const dimension = player.dimension;
        for (const node of dimension.getEntities({
            type: "gm1_sky:node"
        })){
            node.triggerEvent(eventName);
        }
    }
    broadcast(debugMode, player) {
        const formattingCode = DebugModeCommand.isEnabled(debugMode) ? "§a" : "§c";
        BroadcastUtil.translate("command.gm1_sky:debug_mode.feedback", [
            formattingCode,
            debugMode
        ], [
            player
        ]);
    }
    constructor(...args){
        super(...args);
        this.name = "gm1_sky:debug";
        this.category = "prod";
        this.cheatsRequired = true;
        this.executionLimit = "players";
        this.runInEarlyExecution = false;
        this.description = "Set the debug mode for AI Players";
        this.optionalParameters = [
            {
                name: "gm1_sky:debug_mode",
                type: CustomCommandParamType.Enum
            }
        ];
        this.enums = {
            "gm1_sky:debug_mode": [
                "disabled",
                "minimal",
                "verbose"
            ]
        };
    }
}

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkRlYnVnTW9kZUNvbW1hbmQudHMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgQ3VzdG9tQ29tbWFuZE9yaWdpbiwgQ3VzdG9tQ29tbWFuZFBhcmFtZXRlciwgQ3VzdG9tQ29tbWFuZFBhcmFtVHlwZSwgUGxheWVyIH0gZnJvbSBcIkBtaW5lY3JhZnQvc2VydmVyXCI7XHJcbmltcG9ydCB7IEFic3RyYWN0Q29tbWFuZCwgQ29tbWFuZENhdGVnb3J5LCBFbnVtcywgRXhlY3V0aW9uTGltaXQgfSBmcm9tIFwiQ29tbWFuZHMvQWJzdHJhY3RDb21tYW5kXCI7XHJcbmltcG9ydCBFbnYgZnJvbSBcIkVudlwiO1xyXG5pbXBvcnQgRGVidWdNb2RlIGZyb20gXCJUeXBpbmcvVHlwZXMvRGVidWdNb2RlXCI7XHJcblxyXG5leHBvcnQgY2xhc3MgRGVidWdNb2RlQ29tbWFuZCBleHRlbmRzIEFic3RyYWN0Q29tbWFuZCB7XHJcbiAgICBwdWJsaWMgcmVhZG9ubHkgbmFtZSA9IFwiZ20xX3NreTpkZWJ1Z1wiO1xyXG4gICAgcHVibGljIHJlYWRvbmx5IGNhdGVnb3J5OiBDb21tYW5kQ2F0ZWdvcnkgPSBcInByb2RcIjtcclxuICAgIHB1YmxpYyByZWFkb25seSBjaGVhdHNSZXF1aXJlZCA9IHRydWU7XHJcbiAgICBwdWJsaWMgcmVhZG9ubHkgZXhlY3V0aW9uTGltaXQ6IEV4ZWN1dGlvbkxpbWl0ID0gXCJwbGF5ZXJzXCI7XHJcbiAgICBwdWJsaWMgcmVhZG9ubHkgcnVuSW5FYXJseUV4ZWN1dGlvbiA9IGZhbHNlO1xyXG4gICAgcHJvdGVjdGVkIHJlYWRvbmx5IGRlc2NyaXB0aW9uID0gXCJTZXQgdGhlIGRlYnVnIG1vZGUgZm9yIEFJIFBsYXllcnNcIjtcclxuICAgIHB1YmxpYyByZWFkb25seSBvcHRpb25hbFBhcmFtZXRlcnM6IEN1c3RvbUNvbW1hbmRQYXJhbWV0ZXJbXSA9IFtcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIG5hbWU6IFwiZ20xX3NreTpkZWJ1Z19tb2RlXCIsXHJcbiAgICAgICAgICAgIHR5cGU6IEN1c3RvbUNvbW1hbmRQYXJhbVR5cGUuRW51bSxcclxuICAgICAgICB9LFxyXG4gICAgXTtcclxuXHJcbiAgICBwdWJsaWMgcmVhZG9ubHkgZW51bXM6IEVudW1zID0ge1xyXG4gICAgICAgIFwiZ20xX3NreTpkZWJ1Z19tb2RlXCI6IFtcImRpc2FibGVkXCIsIFwibWluaW1hbFwiLCBcInZlcmJvc2VcIl0sXHJcbiAgICB9O1xyXG5cclxuICAgIHB1YmxpYyBoYW5kbGVyKG9yaWdpbjogQ3VzdG9tQ29tbWFuZE9yaWdpbiwgdmFsdWU/OiBEZWJ1Z01vZGUpIHtcclxuICAgICAgICBjb25zdCBwbGF5ZXIgPSBvcmlnaW4uc291cmNlRW50aXR5IGFzIFBsYXllcjtcclxuXHJcbiAgICAgICAgdGhpcy5oYW5kbGVTZXQocGxheWVyLCB2YWx1ZSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBoYW5kbGVTZXQocGxheWVyOiBQbGF5ZXIsIHZhbHVlPzogRGVidWdNb2RlKSB7XHJcbiAgICAgICAgY29uc3Qgb2xkVmFsdWUgPSBFbnRpdHlTdG9yZS5nZXQocGxheWVyLCBcImRlYnVnTW9kZVwiKTtcclxuICAgICAgICBjb25zdCBuZXdWYWx1ZSA9IHZhbHVlID8/IHRoaXMuZ2V0TmV3VmFsdWUob2xkVmFsdWUpO1xyXG5cclxuICAgICAgICBFbnRpdHlTdG9yZS5zZXQocGxheWVyLCBcImRlYnVnTW9kZVwiLCBuZXdWYWx1ZSk7XHJcblxyXG4gICAgICAgIHRoaXMudXBkYXRlTm9kZVZpc2liaWxpdHkocGxheWVyLCBEZWJ1Z01vZGVDb21tYW5kLmlzRW5hYmxlZChuZXdWYWx1ZSkpO1xyXG4gICAgICAgIHRoaXMuYnJvYWRjYXN0KG5ld1ZhbHVlLCBwbGF5ZXIpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZ2V0TmV3VmFsdWUob2xkVmFsdWU6IERlYnVnTW9kZSk6IERlYnVnTW9kZSB7XHJcbiAgICAgICAgaWYgKERlYnVnTW9kZUNvbW1hbmQuaXNFbmFibGVkKG9sZFZhbHVlKSkgcmV0dXJuIFwiZGlzYWJsZWRcIjtcclxuXHJcbiAgICAgICAgLy8gRGVmYXVsdCB0byByZWR1Y2VkIGRlYnVnIG1vZGUgaW4gcHJvZHVjdGlvblxyXG4gICAgICAgIGlmIChFbnYgPT09IFwicHJvZFwiKSByZXR1cm4gXCJtaW5pbWFsXCI7XHJcbiAgICAgICAgLy8gRGVmYXVsdCB0byB2ZXJib3NlIGRlYnVnIG1vZGUgaW4gZGV2ZWxvcG1lbnRcclxuICAgICAgICByZXR1cm4gXCJ2ZXJib3NlXCI7XHJcbiAgICB9XHJcblxyXG4gICAgcHVibGljIHN0YXRpYyBpc0VuYWJsZWQoZGVidWdNb2RlOiBEZWJ1Z01vZGUpOiBib29sZWFuIHtcclxuICAgICAgICByZXR1cm4gZGVidWdNb2RlICE9PSBcImRpc2FibGVkXCI7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSB1cGRhdGVOb2RlVmlzaWJpbGl0eShwbGF5ZXI6IFBsYXllciwgaXNFbmFibGVkOiBib29sZWFuKSB7XHJcbiAgICAgICAgY29uc3QgZXZlbnROYW1lID0gaXNFbmFibGVkID8gXCJnbTFfc2t5OnNob3dcIiA6IFwiZ20xX3NreTpoaWRlXCI7XHJcblxyXG4gICAgICAgIGNvbnN0IGRpbWVuc2lvbiA9IHBsYXllci5kaW1lbnNpb247XHJcbiAgICAgICAgZm9yIChjb25zdCBub2RlIG9mIGRpbWVuc2lvbi5nZXRFbnRpdGllcyh7IHR5cGU6IFwiZ20xX3NreTpub2RlXCIgfSkpIHtcclxuICAgICAgICAgICAgbm9kZS50cmlnZ2VyRXZlbnQoZXZlbnROYW1lKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBicm9hZGNhc3QoZGVidWdNb2RlOiBEZWJ1Z01vZGUsIHBsYXllcjogUGxheWVyKSB7XHJcbiAgICAgICAgY29uc3QgZm9ybWF0dGluZ0NvZGUgPSBEZWJ1Z01vZGVDb21tYW5kLmlzRW5hYmxlZChkZWJ1Z01vZGUpID8gXCLCp2FcIiA6IFwiwqdjXCI7XHJcbiAgICAgICAgQnJvYWRjYXN0VXRpbC50cmFuc2xhdGUoXCJjb21tYW5kLmdtMV9za3k6ZGVidWdfbW9kZS5mZWVkYmFja1wiLCBbZm9ybWF0dGluZ0NvZGUsIGRlYnVnTW9kZV0sIFtwbGF5ZXJdKTtcclxuICAgIH1cclxufVxyXG4iXSwibmFtZXMiOlsiQ3VzdG9tQ29tbWFuZFBhcmFtVHlwZSIsIkFic3RyYWN0Q29tbWFuZCIsIkVudiIsIkRlYnVnTW9kZUNvbW1hbmQiLCJoYW5kbGVyIiwib3JpZ2luIiwidmFsdWUiLCJwbGF5ZXIiLCJzb3VyY2VFbnRpdHkiLCJoYW5kbGVTZXQiLCJvbGRWYWx1ZSIsIkVudGl0eVN0b3JlIiwiZ2V0IiwibmV3VmFsdWUiLCJnZXROZXdWYWx1ZSIsInNldCIsInVwZGF0ZU5vZGVWaXNpYmlsaXR5IiwiaXNFbmFibGVkIiwiYnJvYWRjYXN0IiwiZGVidWdNb2RlIiwiZXZlbnROYW1lIiwiZGltZW5zaW9uIiwibm9kZSIsImdldEVudGl0aWVzIiwidHlwZSIsInRyaWdnZXJFdmVudCIsImZvcm1hdHRpbmdDb2RlIiwiQnJvYWRjYXN0VXRpbCIsInRyYW5zbGF0ZSIsIm5hbWUiLCJjYXRlZ29yeSIsImNoZWF0c1JlcXVpcmVkIiwiZXhlY3V0aW9uTGltaXQiLCJydW5JbkVhcmx5RXhlY3V0aW9uIiwiZGVzY3JpcHRpb24iLCJvcHRpb25hbFBhcmFtZXRlcnMiLCJFbnVtIiwiZW51bXMiXSwibWFwcGluZ3MiOiJBQUFBLFNBQXNEQSxzQkFBc0IsUUFBZ0Isb0JBQW9CO0FBQ2hILFNBQVNDLGVBQWUsUUFBZ0QsMkJBQTJCO0FBQ25HLE9BQU9DLFNBQVMsTUFBTTtBQUd0QixPQUFPLE1BQU1DLHlCQUF5QkY7SUFrQjNCRyxRQUFRQyxNQUEyQixFQUFFQyxLQUFpQixFQUFFO1FBQzNELE1BQU1DLFNBQVNGLE9BQU9HLFlBQVk7UUFFbEMsSUFBSSxDQUFDQyxTQUFTLENBQUNGLFFBQVFEO0lBQzNCO0lBRVFHLFVBQVVGLE1BQWMsRUFBRUQsS0FBaUIsRUFBRTtRQUNqRCxNQUFNSSxXQUFXQyxZQUFZQyxHQUFHLENBQUNMLFFBQVE7UUFDekMsTUFBTU0sV0FBV1AsU0FBUyxJQUFJLENBQUNRLFdBQVcsQ0FBQ0o7UUFFM0NDLFlBQVlJLEdBQUcsQ0FBQ1IsUUFBUSxhQUFhTTtRQUVyQyxJQUFJLENBQUNHLG9CQUFvQixDQUFDVCxRQUFRSixpQkFBaUJjLFNBQVMsQ0FBQ0o7UUFDN0QsSUFBSSxDQUFDSyxTQUFTLENBQUNMLFVBQVVOO0lBQzdCO0lBRVFPLFlBQVlKLFFBQW1CLEVBQWE7UUFDaEQsSUFBSVAsaUJBQWlCYyxTQUFTLENBQUNQLFdBQVcsT0FBTztRQUVqRCw4Q0FBOEM7UUFDOUMsSUFBSVIsUUFBUSxRQUFRLE9BQU87UUFDM0IsK0NBQStDO1FBQy9DLE9BQU87SUFDWDtJQUVBLE9BQWNlLFVBQVVFLFNBQW9CLEVBQVc7UUFDbkQsT0FBT0EsY0FBYztJQUN6QjtJQUVRSCxxQkFBcUJULE1BQWMsRUFBRVUsU0FBa0IsRUFBRTtRQUM3RCxNQUFNRyxZQUFZSCxZQUFZLGlCQUFpQjtRQUUvQyxNQUFNSSxZQUFZZCxPQUFPYyxTQUFTO1FBQ2xDLEtBQUssTUFBTUMsUUFBUUQsVUFBVUUsV0FBVyxDQUFDO1lBQUVDLE1BQU07UUFBZSxHQUFJO1lBQ2hFRixLQUFLRyxZQUFZLENBQUNMO1FBQ3RCO0lBQ0o7SUFFUUYsVUFBVUMsU0FBb0IsRUFBRVosTUFBYyxFQUFFO1FBQ3BELE1BQU1tQixpQkFBaUJ2QixpQkFBaUJjLFNBQVMsQ0FBQ0UsYUFBYSxPQUFPO1FBQ3RFUSxjQUFjQyxTQUFTLENBQUMsdUNBQXVDO1lBQUNGO1lBQWdCUDtTQUFVLEVBQUU7WUFBQ1o7U0FBTztJQUN4Rzs7O2FBMURnQnNCLE9BQU87YUFDUEMsV0FBNEI7YUFDNUJDLGlCQUFpQjthQUNqQkMsaUJBQWlDO2FBQ2pDQyxzQkFBc0I7YUFDbkJDLGNBQWM7YUFDakJDLHFCQUErQztZQUMzRDtnQkFDSU4sTUFBTTtnQkFDTkwsTUFBTXhCLHVCQUF1Qm9DLElBQUk7WUFDckM7U0FDSDthQUVlQyxRQUFlO1lBQzNCLHNCQUFzQjtnQkFBQztnQkFBWTtnQkFBVzthQUFVO1FBQzVEOztBQTRDSiJ9