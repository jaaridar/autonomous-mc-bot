import { AbstractCommand } from "Commands/AbstractCommand";
export class RemoveAllCommand extends AbstractCommand {
    handler(origin) {
        const player = origin.sourceEntity;
        if (!player) return;
        const dimension = player.dimension;
        const entities = dimension.getEntities();
        for (const entity of entities){
            if (entity.typeId === "minecraft:player") continue;
            entity.remove();
        }
    }
    constructor(...args){
        super(...args);
        this.name = "gm1_sky:remove_all";
        this.category = "dev";
        this.description = "Remove all non-player entities in the world";
        this.runInEarlyExecution = false;
    }
}

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIlJlbW92ZUFsbENvbW1hbmQudHMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgQ3VzdG9tQ29tbWFuZE9yaWdpbiB9IGZyb20gXCJAbWluZWNyYWZ0L3NlcnZlclwiO1xyXG5pbXBvcnQgeyBBYnN0cmFjdENvbW1hbmQsIENvbW1hbmRDYXRlZ29yeSB9IGZyb20gXCJDb21tYW5kcy9BYnN0cmFjdENvbW1hbmRcIjtcclxuXHJcbmV4cG9ydCBjbGFzcyBSZW1vdmVBbGxDb21tYW5kIGV4dGVuZHMgQWJzdHJhY3RDb21tYW5kIHtcclxuICAgIHB1YmxpYyByZWFkb25seSBuYW1lID0gXCJnbTFfc2t5OnJlbW92ZV9hbGxcIjtcclxuICAgIHB1YmxpYyByZWFkb25seSBjYXRlZ29yeTogQ29tbWFuZENhdGVnb3J5ID0gXCJkZXZcIjtcclxuICAgIHByb3RlY3RlZCByZWFkb25seSBkZXNjcmlwdGlvbiA9IFwiUmVtb3ZlIGFsbCBub24tcGxheWVyIGVudGl0aWVzIGluIHRoZSB3b3JsZFwiO1xyXG4gICAgcHJvdGVjdGVkIHJ1bkluRWFybHlFeGVjdXRpb24gPSBmYWxzZTtcclxuXHJcbiAgICBwdWJsaWMgaGFuZGxlcihvcmlnaW46IEN1c3RvbUNvbW1hbmRPcmlnaW4pIHtcclxuICAgICAgICBjb25zdCBwbGF5ZXIgPSBvcmlnaW4uc291cmNlRW50aXR5O1xyXG4gICAgICAgIGlmICghcGxheWVyKSByZXR1cm47XHJcblxyXG4gICAgICAgIGNvbnN0IGRpbWVuc2lvbiA9IHBsYXllci5kaW1lbnNpb247XHJcbiAgICAgICAgY29uc3QgZW50aXRpZXMgPSBkaW1lbnNpb24uZ2V0RW50aXRpZXMoKTtcclxuICAgICAgICBmb3IgKGNvbnN0IGVudGl0eSBvZiBlbnRpdGllcykge1xyXG4gICAgICAgICAgICBpZiAoZW50aXR5LnR5cGVJZCA9PT0gXCJtaW5lY3JhZnQ6cGxheWVyXCIpIGNvbnRpbnVlO1xyXG4gICAgICAgICAgICBlbnRpdHkucmVtb3ZlKCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG59XHJcbiJdLCJuYW1lcyI6WyJBYnN0cmFjdENvbW1hbmQiLCJSZW1vdmVBbGxDb21tYW5kIiwiaGFuZGxlciIsIm9yaWdpbiIsInBsYXllciIsInNvdXJjZUVudGl0eSIsImRpbWVuc2lvbiIsImVudGl0aWVzIiwiZ2V0RW50aXRpZXMiLCJlbnRpdHkiLCJ0eXBlSWQiLCJyZW1vdmUiLCJuYW1lIiwiY2F0ZWdvcnkiLCJkZXNjcmlwdGlvbiIsInJ1bkluRWFybHlFeGVjdXRpb24iXSwibWFwcGluZ3MiOiJBQUNBLFNBQVNBLGVBQWUsUUFBeUIsMkJBQTJCO0FBRTVFLE9BQU8sTUFBTUMseUJBQXlCRDtJQU0zQkUsUUFBUUMsTUFBMkIsRUFBRTtRQUN4QyxNQUFNQyxTQUFTRCxPQUFPRSxZQUFZO1FBQ2xDLElBQUksQ0FBQ0QsUUFBUTtRQUViLE1BQU1FLFlBQVlGLE9BQU9FLFNBQVM7UUFDbEMsTUFBTUMsV0FBV0QsVUFBVUUsV0FBVztRQUN0QyxLQUFLLE1BQU1DLFVBQVVGLFNBQVU7WUFDM0IsSUFBSUUsT0FBT0MsTUFBTSxLQUFLLG9CQUFvQjtZQUMxQ0QsT0FBT0UsTUFBTTtRQUNqQjtJQUNKOzs7YUFmZ0JDLE9BQU87YUFDUEMsV0FBNEI7YUFDekJDLGNBQWM7YUFDdkJDLHNCQUFzQjs7QUFhcEMifQ==