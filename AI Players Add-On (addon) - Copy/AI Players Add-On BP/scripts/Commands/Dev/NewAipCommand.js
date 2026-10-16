import { CustomCommandParamType, system } from "@minecraft/server";
import { AbstractCommand } from "Commands/AbstractCommand";
import AgesData from "Data/AgesData";
export class NewAipCommand extends AbstractCommand {
    handler(origin, removePrevious = true, age) {
        const player = origin.sourceEntity;
        if (removePrevious) {
            const existing = EntityUtil.getEntities({
                type: "gm1_sky:aip"
            });
            for (const entity of existing)entity.remove();
        }
        const aip = EntityUtil.spawnEntity("gm1_sky:aip", player.location, player.dimension);
        if (!age) return;
        system.runTimeout(()=>{
            aip.runCommand(`gm1_sky:set_age ${age} true`);
        }, 1);
    }
    constructor(...args){
        super(...args);
        this.name = "gm1_sky:new_aip";
        this.category = "dev";
        this.executionLimit = "players";
        this.runInEarlyExecution = false;
        this.description = "Spawn a new AIP, optionally removing the previous one and setting its age";
        this.optionalParameters = [
            {
                name: "remove_previous",
                type: CustomCommandParamType.Boolean
            },
            {
                name: "gm1_sky:new_aip.age",
                type: CustomCommandParamType.Enum
            }
        ];
        this.enums = {
            "gm1_sky:new_aip.age": [
                ...AgesData.AgePriorities
            ]
        };
    }
}

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIk5ld0FpcENvbW1hbmQudHMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgQ3VzdG9tQ29tbWFuZE9yaWdpbiwgQ3VzdG9tQ29tbWFuZFBhcmFtZXRlciwgQ3VzdG9tQ29tbWFuZFBhcmFtVHlwZSwgUGxheWVyLCBzeXN0ZW0gfSBmcm9tIFwiQG1pbmVjcmFmdC9zZXJ2ZXJcIjtcclxuaW1wb3J0IHsgQWJzdHJhY3RDb21tYW5kLCBDb21tYW5kQ2F0ZWdvcnksIEVudW1zLCBFeGVjdXRpb25MaW1pdCB9IGZyb20gXCJDb21tYW5kcy9BYnN0cmFjdENvbW1hbmRcIjtcclxuaW1wb3J0IEFnZXNEYXRhIGZyb20gXCJEYXRhL0FnZXNEYXRhXCI7XHJcblxyXG5leHBvcnQgY2xhc3MgTmV3QWlwQ29tbWFuZCBleHRlbmRzIEFic3RyYWN0Q29tbWFuZCB7XHJcbiAgICBwdWJsaWMgcmVhZG9ubHkgbmFtZSA9IFwiZ20xX3NreTpuZXdfYWlwXCI7XHJcbiAgICBwdWJsaWMgcmVhZG9ubHkgY2F0ZWdvcnk6IENvbW1hbmRDYXRlZ29yeSA9IFwiZGV2XCI7XHJcbiAgICBwdWJsaWMgcmVhZG9ubHkgZXhlY3V0aW9uTGltaXQ6IEV4ZWN1dGlvbkxpbWl0ID0gXCJwbGF5ZXJzXCI7XHJcbiAgICBwcm90ZWN0ZWQgcmVhZG9ubHkgcnVuSW5FYXJseUV4ZWN1dGlvbiA9IGZhbHNlO1xyXG4gICAgcHJvdGVjdGVkIHJlYWRvbmx5IGRlc2NyaXB0aW9uID0gXCJTcGF3biBhIG5ldyBBSVAsIG9wdGlvbmFsbHkgcmVtb3ZpbmcgdGhlIHByZXZpb3VzIG9uZSBhbmQgc2V0dGluZyBpdHMgYWdlXCI7XHJcblxyXG4gICAgcHVibGljIHJlYWRvbmx5IG9wdGlvbmFsUGFyYW1ldGVyczogQ3VzdG9tQ29tbWFuZFBhcmFtZXRlcltdID0gW1xyXG4gICAgICAgIHsgbmFtZTogXCJyZW1vdmVfcHJldmlvdXNcIiwgdHlwZTogQ3VzdG9tQ29tbWFuZFBhcmFtVHlwZS5Cb29sZWFuIH0sXHJcbiAgICAgICAgeyBuYW1lOiBcImdtMV9za3k6bmV3X2FpcC5hZ2VcIiwgdHlwZTogQ3VzdG9tQ29tbWFuZFBhcmFtVHlwZS5FbnVtIH0sXHJcbiAgICBdO1xyXG5cclxuICAgIHB1YmxpYyByZWFkb25seSBlbnVtczogRW51bXMgPSB7XHJcbiAgICAgICAgXCJnbTFfc2t5Om5ld19haXAuYWdlXCI6IFsuLi5BZ2VzRGF0YS5BZ2VQcmlvcml0aWVzXSxcclxuICAgIH07XHJcblxyXG4gICAgcHVibGljIGhhbmRsZXIob3JpZ2luOiBDdXN0b21Db21tYW5kT3JpZ2luLCByZW1vdmVQcmV2aW91czogYm9vbGVhbiA9IHRydWUsIGFnZT86IHN0cmluZykge1xyXG4gICAgICAgIGNvbnN0IHBsYXllciA9IG9yaWdpbi5zb3VyY2VFbnRpdHkgYXMgUGxheWVyO1xyXG5cclxuICAgICAgICBpZiAocmVtb3ZlUHJldmlvdXMpIHtcclxuICAgICAgICAgICAgY29uc3QgZXhpc3RpbmcgPSBFbnRpdHlVdGlsLmdldEVudGl0aWVzKHsgdHlwZTogXCJnbTFfc2t5OmFpcFwiIH0pO1xyXG4gICAgICAgICAgICBmb3IgKGNvbnN0IGVudGl0eSBvZiBleGlzdGluZykgZW50aXR5LnJlbW92ZSgpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc3QgYWlwID0gRW50aXR5VXRpbC5zcGF3bkVudGl0eShcImdtMV9za3k6YWlwXCIsIHBsYXllci5sb2NhdGlvbiwgcGxheWVyLmRpbWVuc2lvbik7XHJcblxyXG4gICAgICAgIGlmICghYWdlKSByZXR1cm47XHJcbiAgICAgICAgc3lzdGVtLnJ1blRpbWVvdXQoKCkgPT4ge1xyXG4gICAgICAgICAgICBhaXAucnVuQ29tbWFuZChgZ20xX3NreTpzZXRfYWdlICR7YWdlfSB0cnVlYCk7XHJcbiAgICAgICAgfSwgMSk7XHJcbiAgICB9XHJcbn1cclxuIl0sIm5hbWVzIjpbIkN1c3RvbUNvbW1hbmRQYXJhbVR5cGUiLCJzeXN0ZW0iLCJBYnN0cmFjdENvbW1hbmQiLCJBZ2VzRGF0YSIsIk5ld0FpcENvbW1hbmQiLCJoYW5kbGVyIiwib3JpZ2luIiwicmVtb3ZlUHJldmlvdXMiLCJhZ2UiLCJwbGF5ZXIiLCJzb3VyY2VFbnRpdHkiLCJleGlzdGluZyIsIkVudGl0eVV0aWwiLCJnZXRFbnRpdGllcyIsInR5cGUiLCJlbnRpdHkiLCJyZW1vdmUiLCJhaXAiLCJzcGF3bkVudGl0eSIsImxvY2F0aW9uIiwiZGltZW5zaW9uIiwicnVuVGltZW91dCIsInJ1bkNvbW1hbmQiLCJuYW1lIiwiY2F0ZWdvcnkiLCJleGVjdXRpb25MaW1pdCIsInJ1bkluRWFybHlFeGVjdXRpb24iLCJkZXNjcmlwdGlvbiIsIm9wdGlvbmFsUGFyYW1ldGVycyIsIkJvb2xlYW4iLCJFbnVtIiwiZW51bXMiLCJBZ2VQcmlvcml0aWVzIl0sIm1hcHBpbmdzIjoiQUFBQSxTQUFzREEsc0JBQXNCLEVBQVVDLE1BQU0sUUFBUSxvQkFBb0I7QUFDeEgsU0FBU0MsZUFBZSxRQUFnRCwyQkFBMkI7QUFDbkcsT0FBT0MsY0FBYyxnQkFBZ0I7QUFFckMsT0FBTyxNQUFNQyxzQkFBc0JGO0lBZ0J4QkcsUUFBUUMsTUFBMkIsRUFBRUMsaUJBQTBCLElBQUksRUFBRUMsR0FBWSxFQUFFO1FBQ3RGLE1BQU1DLFNBQVNILE9BQU9JLFlBQVk7UUFFbEMsSUFBSUgsZ0JBQWdCO1lBQ2hCLE1BQU1JLFdBQVdDLFdBQVdDLFdBQVcsQ0FBQztnQkFBRUMsTUFBTTtZQUFjO1lBQzlELEtBQUssTUFBTUMsVUFBVUosU0FBVUksT0FBT0MsTUFBTTtRQUNoRDtRQUVBLE1BQU1DLE1BQU1MLFdBQVdNLFdBQVcsQ0FBQyxlQUFlVCxPQUFPVSxRQUFRLEVBQUVWLE9BQU9XLFNBQVM7UUFFbkYsSUFBSSxDQUFDWixLQUFLO1FBQ1ZQLE9BQU9vQixVQUFVLENBQUM7WUFDZEosSUFBSUssVUFBVSxDQUFDLENBQUMsZ0JBQWdCLEVBQUVkLElBQUksS0FBSyxDQUFDO1FBQ2hELEdBQUc7SUFDUDs7O2FBN0JnQmUsT0FBTzthQUNQQyxXQUE0QjthQUM1QkMsaUJBQWlDO2FBQzlCQyxzQkFBc0I7YUFDdEJDLGNBQWM7YUFFakJDLHFCQUErQztZQUMzRDtnQkFBRUwsTUFBTTtnQkFBbUJULE1BQU1kLHVCQUF1QjZCLE9BQU87WUFBQztZQUNoRTtnQkFBRU4sTUFBTTtnQkFBdUJULE1BQU1kLHVCQUF1QjhCLElBQUk7WUFBQztTQUNwRTthQUVlQyxRQUFlO1lBQzNCLHVCQUF1QjttQkFBSTVCLFNBQVM2QixhQUFhO2FBQUM7UUFDdEQ7O0FBaUJKIn0=