import AIPData from "Data/AIPData";
import V3 from "Helpers/Vectors/V3";
import BlockUtils from "Utils/BlockUtils";
class HomeHelper {
    static getNearestHome(location, radius = 64) {
        const dimension = location.dimension ?? overworld;
        const markers = dimension.getEntities({
            closest: 1,
            location: location,
            maxDistance: radius,
            type: this.EntityIdentifier
        });
        return markers[0] ?? null;
    }
    static isFeatureInNearestHome(feature) {
        const featureRoot = feature.root;
        const nearestHome = this.getNearestHome(featureRoot);
        if (!nearestHome) return false;
        const blocks = feature.blocks;
        for (const block of blocks){
            const isInHome = block.distance(nearestHome.location) <= AIPData.InHomeRadius;
            if (isInHome) return true;
        }
        return false;
    }
    static getValidHomeSpawnLocation(location) {
        const nearestHome = this.getNearestHome(location);
        if (!nearestHome) return null;
        //Ensure there is room above the bed to prevent suffocation
        const bedLocation = V3.fromEntity(nearestHome, overworld);
        const aboveLocation = bedLocation.$.add(0, 1, 0);
        const aboveBlock = BlockUtils.fromV3(aboveLocation);
        const aboveLocation2 = bedLocation.$.add(0, 2, 0);
        const aboveBlock2 = BlockUtils.fromV3(aboveLocation2);
        if (aboveBlock?.isAir && aboveBlock2?.isAir) {
            return bedLocation;
        }
        //Look for a valid block next to the bed
        const directions = [
            [
                1,
                0,
                0
            ],
            [
                -1,
                0,
                0
            ],
            [
                0,
                0,
                1
            ],
            [
                0,
                0,
                -1
            ]
        ];
        for (const [dx, dy, dz] of directions){
            const adjacentLocation = bedLocation.$.add(dx, dy, dz);
            const adjacentBlock = BlockUtils.fromV3(adjacentLocation);
            const aboveAdjacentLocation = adjacentLocation.$.add(0, 1, 0);
            const aboveAdjacentBlock = BlockUtils.fromV3(aboveAdjacentLocation);
            const hasSolidGroundBelow = BlockUtils.hasSolidGroundBelow(adjacentLocation);
            if (adjacentBlock?.isAir && aboveAdjacentBlock?.isAir && hasSolidGroundBelow) {
                return adjacentLocation;
            }
        }
        //No valid spawn location found around the bed
        return null;
    }
}
HomeHelper.EntityIdentifier = "gm1_sky:home_marker";
export { HomeHelper as default };

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkhvbWVIZWxwZXIudHMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IEFJUERhdGEgZnJvbSBcIkRhdGEvQUlQRGF0YVwiO1xyXG5pbXBvcnQgeyBGZWF0dXJlIH0gZnJvbSBcIkZlYXR1cmVDYWNoZS9UeXBlc1wiO1xyXG5pbXBvcnQgVjMgZnJvbSBcIkhlbHBlcnMvVmVjdG9ycy9WM1wiO1xyXG5pbXBvcnQgQmxvY2tVdGlscyBmcm9tIFwiVXRpbHMvQmxvY2tVdGlsc1wiO1xyXG5cclxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgSG9tZUhlbHBlciB7XHJcbiAgICBwdWJsaWMgc3RhdGljIHJlYWRvbmx5IEVudGl0eUlkZW50aWZpZXIgPSBcImdtMV9za3k6aG9tZV9tYXJrZXJcIjtcclxuXHJcbiAgICBwdWJsaWMgc3RhdGljIGdldE5lYXJlc3RIb21lKGxvY2F0aW9uOiBWMywgcmFkaXVzOiBudW1iZXIgPSA2NCkge1xyXG4gICAgICAgIGNvbnN0IGRpbWVuc2lvbiA9IGxvY2F0aW9uLmRpbWVuc2lvbiA/PyBvdmVyd29ybGQ7XHJcblxyXG4gICAgICAgIGNvbnN0IG1hcmtlcnMgPSBkaW1lbnNpb24uZ2V0RW50aXRpZXMoe1xyXG4gICAgICAgICAgICBjbG9zZXN0OiAxLFxyXG4gICAgICAgICAgICBsb2NhdGlvbjogbG9jYXRpb24sXHJcbiAgICAgICAgICAgIG1heERpc3RhbmNlOiByYWRpdXMsXHJcbiAgICAgICAgICAgIHR5cGU6IHRoaXMuRW50aXR5SWRlbnRpZmllcixcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgcmV0dXJuIG1hcmtlcnNbMF0gPz8gbnVsbDtcclxuICAgIH1cclxuXHJcbiAgICBwdWJsaWMgc3RhdGljIGlzRmVhdHVyZUluTmVhcmVzdEhvbWUoZmVhdHVyZTogRmVhdHVyZSkge1xyXG4gICAgICAgIGNvbnN0IGZlYXR1cmVSb290ID0gZmVhdHVyZS5yb290O1xyXG4gICAgICAgIGNvbnN0IG5lYXJlc3RIb21lID0gdGhpcy5nZXROZWFyZXN0SG9tZShmZWF0dXJlUm9vdCk7XHJcblxyXG4gICAgICAgIGlmICghbmVhcmVzdEhvbWUpIHJldHVybiBmYWxzZTtcclxuXHJcbiAgICAgICAgY29uc3QgYmxvY2tzID0gZmVhdHVyZS5ibG9ja3M7XHJcbiAgICAgICAgZm9yIChjb25zdCBibG9jayBvZiBibG9ja3MpIHtcclxuICAgICAgICAgICAgY29uc3QgaXNJbkhvbWUgPSBibG9jay5kaXN0YW5jZShuZWFyZXN0SG9tZS5sb2NhdGlvbikgPD0gQUlQRGF0YS5JbkhvbWVSYWRpdXM7XHJcbiAgICAgICAgICAgIGlmIChpc0luSG9tZSkgcmV0dXJuIHRydWU7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICB9XHJcblxyXG4gICAgcHVibGljIHN0YXRpYyBnZXRWYWxpZEhvbWVTcGF3bkxvY2F0aW9uKGxvY2F0aW9uOiBWMykge1xyXG4gICAgICAgIGNvbnN0IG5lYXJlc3RIb21lID0gdGhpcy5nZXROZWFyZXN0SG9tZShsb2NhdGlvbik7XHJcbiAgICAgICAgaWYgKCFuZWFyZXN0SG9tZSkgcmV0dXJuIG51bGw7XHJcblxyXG4gICAgICAgIC8vRW5zdXJlIHRoZXJlIGlzIHJvb20gYWJvdmUgdGhlIGJlZCB0byBwcmV2ZW50IHN1ZmZvY2F0aW9uXHJcbiAgICAgICAgY29uc3QgYmVkTG9jYXRpb24gPSBWMy5mcm9tRW50aXR5KG5lYXJlc3RIb21lLCBvdmVyd29ybGQpO1xyXG4gICAgICAgIGNvbnN0IGFib3ZlTG9jYXRpb24gPSBiZWRMb2NhdGlvbi4kLmFkZCgwLCAxLCAwKTtcclxuICAgICAgICBjb25zdCBhYm92ZUJsb2NrID0gQmxvY2tVdGlscy5mcm9tVjMoYWJvdmVMb2NhdGlvbik7XHJcbiAgICAgICAgY29uc3QgYWJvdmVMb2NhdGlvbjIgPSBiZWRMb2NhdGlvbi4kLmFkZCgwLCAyLCAwKTtcclxuICAgICAgICBjb25zdCBhYm92ZUJsb2NrMiA9IEJsb2NrVXRpbHMuZnJvbVYzKGFib3ZlTG9jYXRpb24yKTtcclxuICAgICAgICBpZiAoYWJvdmVCbG9jaz8uaXNBaXIgJiYgYWJvdmVCbG9jazI/LmlzQWlyKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBiZWRMb2NhdGlvbjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vTG9vayBmb3IgYSB2YWxpZCBibG9jayBuZXh0IHRvIHRoZSBiZWRcclxuICAgICAgICBjb25zdCBkaXJlY3Rpb25zID0gW1xyXG4gICAgICAgICAgICBbMSwgMCwgMF0sXHJcbiAgICAgICAgICAgIFstMSwgMCwgMF0sXHJcbiAgICAgICAgICAgIFswLCAwLCAxXSxcclxuICAgICAgICAgICAgWzAsIDAsIC0xXSxcclxuICAgICAgICBdO1xyXG4gICAgICAgIGZvciAoY29uc3QgW2R4LCBkeSwgZHpdIG9mIGRpcmVjdGlvbnMpIHtcclxuICAgICAgICAgICAgY29uc3QgYWRqYWNlbnRMb2NhdGlvbiA9IGJlZExvY2F0aW9uLiQuYWRkKGR4LCBkeSwgZHopO1xyXG4gICAgICAgICAgICBjb25zdCBhZGphY2VudEJsb2NrID0gQmxvY2tVdGlscy5mcm9tVjMoYWRqYWNlbnRMb2NhdGlvbik7XHJcbiAgICAgICAgICAgIGNvbnN0IGFib3ZlQWRqYWNlbnRMb2NhdGlvbiA9IGFkamFjZW50TG9jYXRpb24uJC5hZGQoMCwgMSwgMCk7XHJcbiAgICAgICAgICAgIGNvbnN0IGFib3ZlQWRqYWNlbnRCbG9jayA9IEJsb2NrVXRpbHMuZnJvbVYzKGFib3ZlQWRqYWNlbnRMb2NhdGlvbik7XHJcbiAgICAgICAgICAgIGNvbnN0IGhhc1NvbGlkR3JvdW5kQmVsb3cgPSBCbG9ja1V0aWxzLmhhc1NvbGlkR3JvdW5kQmVsb3coYWRqYWNlbnRMb2NhdGlvbik7XHJcbiAgICAgICAgICAgIGlmIChhZGphY2VudEJsb2NrPy5pc0FpciAmJiBhYm92ZUFkamFjZW50QmxvY2s/LmlzQWlyICYmIGhhc1NvbGlkR3JvdW5kQmVsb3cpIHtcclxuICAgICAgICAgICAgICAgIHJldHVybiBhZGphY2VudExvY2F0aW9uO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvL05vIHZhbGlkIHNwYXduIGxvY2F0aW9uIGZvdW5kIGFyb3VuZCB0aGUgYmVkXHJcbiAgICAgICAgcmV0dXJuIG51bGw7XHJcbiAgICB9XHJcbn1cclxuIl0sIm5hbWVzIjpbIkFJUERhdGEiLCJWMyIsIkJsb2NrVXRpbHMiLCJIb21lSGVscGVyIiwiZ2V0TmVhcmVzdEhvbWUiLCJsb2NhdGlvbiIsInJhZGl1cyIsImRpbWVuc2lvbiIsIm92ZXJ3b3JsZCIsIm1hcmtlcnMiLCJnZXRFbnRpdGllcyIsImNsb3Nlc3QiLCJtYXhEaXN0YW5jZSIsInR5cGUiLCJFbnRpdHlJZGVudGlmaWVyIiwiaXNGZWF0dXJlSW5OZWFyZXN0SG9tZSIsImZlYXR1cmUiLCJmZWF0dXJlUm9vdCIsInJvb3QiLCJuZWFyZXN0SG9tZSIsImJsb2NrcyIsImJsb2NrIiwiaXNJbkhvbWUiLCJkaXN0YW5jZSIsIkluSG9tZVJhZGl1cyIsImdldFZhbGlkSG9tZVNwYXduTG9jYXRpb24iLCJiZWRMb2NhdGlvbiIsImZyb21FbnRpdHkiLCJhYm92ZUxvY2F0aW9uIiwiJCIsImFkZCIsImFib3ZlQmxvY2siLCJmcm9tVjMiLCJhYm92ZUxvY2F0aW9uMiIsImFib3ZlQmxvY2syIiwiaXNBaXIiLCJkaXJlY3Rpb25zIiwiZHgiLCJkeSIsImR6IiwiYWRqYWNlbnRMb2NhdGlvbiIsImFkamFjZW50QmxvY2siLCJhYm92ZUFkamFjZW50TG9jYXRpb24iLCJhYm92ZUFkamFjZW50QmxvY2siLCJoYXNTb2xpZEdyb3VuZEJlbG93Il0sIm1hcHBpbmdzIjoiQUFBQSxPQUFPQSxhQUFhLGVBQWU7QUFFbkMsT0FBT0MsUUFBUSxxQkFBcUI7QUFDcEMsT0FBT0MsZ0JBQWdCLG1CQUFtQjtBQUUzQixNQUFNQztJQUdqQixPQUFjQyxlQUFlQyxRQUFZLEVBQUVDLFNBQWlCLEVBQUUsRUFBRTtRQUM1RCxNQUFNQyxZQUFZRixTQUFTRSxTQUFTLElBQUlDO1FBRXhDLE1BQU1DLFVBQVVGLFVBQVVHLFdBQVcsQ0FBQztZQUNsQ0MsU0FBUztZQUNUTixVQUFVQTtZQUNWTyxhQUFhTjtZQUNiTyxNQUFNLElBQUksQ0FBQ0MsZ0JBQWdCO1FBQy9CO1FBRUEsT0FBT0wsT0FBTyxDQUFDLEVBQUUsSUFBSTtJQUN6QjtJQUVBLE9BQWNNLHVCQUF1QkMsT0FBZ0IsRUFBRTtRQUNuRCxNQUFNQyxjQUFjRCxRQUFRRSxJQUFJO1FBQ2hDLE1BQU1DLGNBQWMsSUFBSSxDQUFDZixjQUFjLENBQUNhO1FBRXhDLElBQUksQ0FBQ0UsYUFBYSxPQUFPO1FBRXpCLE1BQU1DLFNBQVNKLFFBQVFJLE1BQU07UUFDN0IsS0FBSyxNQUFNQyxTQUFTRCxPQUFRO1lBQ3hCLE1BQU1FLFdBQVdELE1BQU1FLFFBQVEsQ0FBQ0osWUFBWWQsUUFBUSxLQUFLTCxRQUFRd0IsWUFBWTtZQUM3RSxJQUFJRixVQUFVLE9BQU87UUFDekI7UUFFQSxPQUFPO0lBQ1g7SUFFQSxPQUFjRywwQkFBMEJwQixRQUFZLEVBQUU7UUFDbEQsTUFBTWMsY0FBYyxJQUFJLENBQUNmLGNBQWMsQ0FBQ0M7UUFDeEMsSUFBSSxDQUFDYyxhQUFhLE9BQU87UUFFekIsMkRBQTJEO1FBQzNELE1BQU1PLGNBQWN6QixHQUFHMEIsVUFBVSxDQUFDUixhQUFhWDtRQUMvQyxNQUFNb0IsZ0JBQWdCRixZQUFZRyxDQUFDLENBQUNDLEdBQUcsQ0FBQyxHQUFHLEdBQUc7UUFDOUMsTUFBTUMsYUFBYTdCLFdBQVc4QixNQUFNLENBQUNKO1FBQ3JDLE1BQU1LLGlCQUFpQlAsWUFBWUcsQ0FBQyxDQUFDQyxHQUFHLENBQUMsR0FBRyxHQUFHO1FBQy9DLE1BQU1JLGNBQWNoQyxXQUFXOEIsTUFBTSxDQUFDQztRQUN0QyxJQUFJRixZQUFZSSxTQUFTRCxhQUFhQyxPQUFPO1lBQ3pDLE9BQU9UO1FBQ1g7UUFFQSx3Q0FBd0M7UUFDeEMsTUFBTVUsYUFBYTtZQUNmO2dCQUFDO2dCQUFHO2dCQUFHO2FBQUU7WUFDVDtnQkFBQyxDQUFDO2dCQUFHO2dCQUFHO2FBQUU7WUFDVjtnQkFBQztnQkFBRztnQkFBRzthQUFFO1lBQ1Q7Z0JBQUM7Z0JBQUc7Z0JBQUcsQ0FBQzthQUFFO1NBQ2I7UUFDRCxLQUFLLE1BQU0sQ0FBQ0MsSUFBSUMsSUFBSUMsR0FBRyxJQUFJSCxXQUFZO1lBQ25DLE1BQU1JLG1CQUFtQmQsWUFBWUcsQ0FBQyxDQUFDQyxHQUFHLENBQUNPLElBQUlDLElBQUlDO1lBQ25ELE1BQU1FLGdCQUFnQnZDLFdBQVc4QixNQUFNLENBQUNRO1lBQ3hDLE1BQU1FLHdCQUF3QkYsaUJBQWlCWCxDQUFDLENBQUNDLEdBQUcsQ0FBQyxHQUFHLEdBQUc7WUFDM0QsTUFBTWEscUJBQXFCekMsV0FBVzhCLE1BQU0sQ0FBQ1U7WUFDN0MsTUFBTUUsc0JBQXNCMUMsV0FBVzBDLG1CQUFtQixDQUFDSjtZQUMzRCxJQUFJQyxlQUFlTixTQUFTUSxvQkFBb0JSLFNBQVNTLHFCQUFxQjtnQkFDMUUsT0FBT0o7WUFDWDtRQUNKO1FBRUEsOENBQThDO1FBQzlDLE9BQU87SUFDWDtBQUNKO0FBbEVxQnJDLFdBQ01XLG1CQUFtQjtBQUQ5QyxTQUFxQlgsd0JBa0VwQiJ9