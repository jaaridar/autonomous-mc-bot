import { CustomCommandParamType } from "@minecraft/server";
import { AbstractCommand } from "Commands/AbstractCommand";
import FeatureCache from "FeatureCache/FeatureCache";
import MobComponentManager from "MobComponents/MobComponentManager";
export class BrainScanCommand extends AbstractCommand {
    handler(origin, operation) {
        const source = origin.sourceEntity ?? origin.sourceBlock;
        switch(operation){
            case "poll":
                return this.poll();
            case "log":
                return this.log(source.location);
        }
    }
    /**
     * Polls all BigBrain components for their data.
     * @returns The data from the BigBrain components as a CustomCommandResult.
     */ poll() {
        const bigBrainComponents = MobComponentManager.getMobComponentInstances("BigBrainComponent");
        const players = {};
        for (const component of bigBrainComponents){
            if (!component) continue;
            if (!component.entity.isValid) continue;
            const name = component.entity.nameTag;
            players[name] = component.scan();
        }
        const data = {
            players,
            features: FeatureCache.toJSON()
        };
        return this.success(JSON.stringify(data));
    }
    log(location) {
        const query = {
            location: location,
            closest: 1,
            type: "gm1_sky:aip"
        };
        const nearest = EntityUtil.getEntities(query)[0];
        if (!nearest) return this.failure("No AIP found near the specified location");
        const name = EntityStore.get(nearest, "gamerTag");
        const bigBrainComponent = nearest.getMobComponent("BigBrainComponent");
        const scan = bigBrainComponent.scan();
        const reducedScan = {
            name: name,
            tick: Main.currentTick,
            history: scan.history,
            context: scan.context
        };
        console.log(`Brain scan for '${name}':\n`, JSON.stringify(reducedScan, null, 0));
        return this.success(`Logged brain scan for '${name}' to console`);
    }
    constructor(...args){
        super(...args);
        this.name = "gm1_sky:brain_scan";
        this.category = "dev";
        this.cheatsRequired = true;
        this.description = "Used by BrainScan websocket to get data";
        this.mandatoryParameters = [
            {
                name: "gm1_sky:brain_scan.operation",
                type: CustomCommandParamType.Enum
            }
        ];
        this.enums = {
            "gm1_sky:brain_scan.operation": [
                "poll",
                "log"
            ]
        };
    }
}

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkJyYWluU2NhbkNvbW1hbmQudHMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHtcclxuICAgIEN1c3RvbUNvbW1hbmRPcmlnaW4sXHJcbiAgICBDdXN0b21Db21tYW5kUGFyYW1ldGVyLFxyXG4gICAgQ3VzdG9tQ29tbWFuZFBhcmFtVHlwZSxcclxuICAgIEN1c3RvbUNvbW1hbmRSZXN1bHQsXHJcbiAgICBFbnRpdHlRdWVyeU9wdGlvbnMsXHJcbiAgICBWZWN0b3IzLFxyXG59IGZyb20gXCJAbWluZWNyYWZ0L3NlcnZlclwiO1xyXG5pbXBvcnQgQmlnQnJhaW5Db21wb25lbnQgZnJvbSBcIkJpZ0JyYWluL0JpZ0JyYWluQ29tcG9uZW50XCI7XHJcbmltcG9ydCB7IEFic3RyYWN0Q29tbWFuZCwgQ29tbWFuZENhdGVnb3J5LCBFbnVtcyB9IGZyb20gXCJDb21tYW5kcy9BYnN0cmFjdENvbW1hbmRcIjtcclxuaW1wb3J0IEZlYXR1cmVDYWNoZSBmcm9tIFwiRmVhdHVyZUNhY2hlL0ZlYXR1cmVDYWNoZVwiO1xyXG5pbXBvcnQgTW9iQ29tcG9uZW50TWFuYWdlciBmcm9tIFwiTW9iQ29tcG9uZW50cy9Nb2JDb21wb25lbnRNYW5hZ2VyXCI7XHJcbmltcG9ydCB7IEJyYWluU2Nhbk9wZXJhdGlvbiwgUG9sbERhdGEgfSBmcm9tIFwiLi4vLi4vQmlnQnJhaW4vVHlwZXNcIjtcclxuXHJcbmV4cG9ydCBjbGFzcyBCcmFpblNjYW5Db21tYW5kIGV4dGVuZHMgQWJzdHJhY3RDb21tYW5kIHtcclxuICAgIHB1YmxpYyByZWFkb25seSBuYW1lID0gXCJnbTFfc2t5OmJyYWluX3NjYW5cIjtcclxuICAgIHB1YmxpYyByZWFkb25seSBjYXRlZ29yeTogQ29tbWFuZENhdGVnb3J5ID0gXCJkZXZcIjtcclxuICAgIHB1YmxpYyByZWFkb25seSBjaGVhdHNSZXF1aXJlZCA9IHRydWU7XHJcbiAgICBwcm90ZWN0ZWQgcmVhZG9ubHkgZGVzY3JpcHRpb24gPSBcIlVzZWQgYnkgQnJhaW5TY2FuIHdlYnNvY2tldCB0byBnZXQgZGF0YVwiO1xyXG4gICAgcHVibGljIHJlYWRvbmx5IG1hbmRhdG9yeVBhcmFtZXRlcnM6IEN1c3RvbUNvbW1hbmRQYXJhbWV0ZXJbXSA9IFtcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIG5hbWU6IFwiZ20xX3NreTpicmFpbl9zY2FuLm9wZXJhdGlvblwiLFxyXG4gICAgICAgICAgICB0eXBlOiBDdXN0b21Db21tYW5kUGFyYW1UeXBlLkVudW0sXHJcbiAgICAgICAgfSxcclxuICAgIF07XHJcblxyXG4gICAgcHVibGljIHJlYWRvbmx5IGVudW1zOiBFbnVtcyA9IHtcclxuICAgICAgICBcImdtMV9za3k6YnJhaW5fc2Nhbi5vcGVyYXRpb25cIjogW1wicG9sbFwiLCBcImxvZ1wiXSxcclxuICAgIH07XHJcblxyXG4gICAgcHVibGljIGhhbmRsZXIob3JpZ2luOiBDdXN0b21Db21tYW5kT3JpZ2luLCBvcGVyYXRpb246IEJyYWluU2Nhbk9wZXJhdGlvbikge1xyXG4gICAgICAgIGNvbnN0IHNvdXJjZSA9IG9yaWdpbi5zb3VyY2VFbnRpdHkgPz8gb3JpZ2luLnNvdXJjZUJsb2NrITtcclxuXHJcbiAgICAgICAgc3dpdGNoIChvcGVyYXRpb24pIHtcclxuICAgICAgICAgICAgY2FzZSBcInBvbGxcIjpcclxuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLnBvbGwoKTtcclxuICAgICAgICAgICAgY2FzZSBcImxvZ1wiOlxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMubG9nKHNvdXJjZS5sb2NhdGlvbik7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogUG9sbHMgYWxsIEJpZ0JyYWluIGNvbXBvbmVudHMgZm9yIHRoZWlyIGRhdGEuXHJcbiAgICAgKiBAcmV0dXJucyBUaGUgZGF0YSBmcm9tIHRoZSBCaWdCcmFpbiBjb21wb25lbnRzIGFzIGEgQ3VzdG9tQ29tbWFuZFJlc3VsdC5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBwb2xsKCk6IEN1c3RvbUNvbW1hbmRSZXN1bHQge1xyXG4gICAgICAgIGNvbnN0IGJpZ0JyYWluQ29tcG9uZW50cyA9IE1vYkNvbXBvbmVudE1hbmFnZXIuZ2V0TW9iQ29tcG9uZW50SW5zdGFuY2VzKFwiQmlnQnJhaW5Db21wb25lbnRcIik7XHJcblxyXG4gICAgICAgIGNvbnN0IHBsYXllcnM6IFBvbGxEYXRhW1wicGxheWVyc1wiXSA9IHt9O1xyXG5cclxuICAgICAgICBmb3IgKGNvbnN0IGNvbXBvbmVudCBvZiBiaWdCcmFpbkNvbXBvbmVudHMpIHtcclxuICAgICAgICAgICAgaWYgKCFjb21wb25lbnQpIGNvbnRpbnVlO1xyXG4gICAgICAgICAgICBpZiAoIWNvbXBvbmVudC5lbnRpdHkuaXNWYWxpZCkgY29udGludWU7XHJcbiAgICAgICAgICAgIGNvbnN0IG5hbWUgPSBjb21wb25lbnQuZW50aXR5Lm5hbWVUYWc7XHJcbiAgICAgICAgICAgIHBsYXllcnNbbmFtZV0gPSBjb21wb25lbnQuc2NhbigpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc3QgZGF0YTogUG9sbERhdGEgPSB7XHJcbiAgICAgICAgICAgIHBsYXllcnMsXHJcbiAgICAgICAgICAgIGZlYXR1cmVzOiBGZWF0dXJlQ2FjaGUudG9KU09OKCksXHJcbiAgICAgICAgfTtcclxuXHJcbiAgICAgICAgcmV0dXJuIHRoaXMuc3VjY2VzcyhKU09OLnN0cmluZ2lmeShkYXRhKSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBsb2cobG9jYXRpb246IFZlY3RvcjMpOiBDdXN0b21Db21tYW5kUmVzdWx0IHtcclxuICAgICAgICBjb25zdCBxdWVyeTogRW50aXR5UXVlcnlPcHRpb25zID0ge1xyXG4gICAgICAgICAgICBsb2NhdGlvbjogbG9jYXRpb24sXHJcbiAgICAgICAgICAgIGNsb3Nlc3Q6IDEsXHJcbiAgICAgICAgICAgIHR5cGU6IFwiZ20xX3NreTphaXBcIixcclxuICAgICAgICB9O1xyXG4gICAgICAgIGNvbnN0IG5lYXJlc3QgPSBFbnRpdHlVdGlsLmdldEVudGl0aWVzKHF1ZXJ5KVswXTtcclxuICAgICAgICBpZiAoIW5lYXJlc3QpIHJldHVybiB0aGlzLmZhaWx1cmUoXCJObyBBSVAgZm91bmQgbmVhciB0aGUgc3BlY2lmaWVkIGxvY2F0aW9uXCIpO1xyXG5cclxuICAgICAgICBjb25zdCBuYW1lID0gRW50aXR5U3RvcmUuZ2V0KG5lYXJlc3QsIFwiZ2FtZXJUYWdcIik7XHJcbiAgICAgICAgY29uc3QgYmlnQnJhaW5Db21wb25lbnQgPSBuZWFyZXN0LmdldE1vYkNvbXBvbmVudChcIkJpZ0JyYWluQ29tcG9uZW50XCIpISBhcyBCaWdCcmFpbkNvbXBvbmVudDtcclxuICAgICAgICBjb25zdCBzY2FuID0gYmlnQnJhaW5Db21wb25lbnQuc2NhbigpO1xyXG4gICAgICAgIGNvbnN0IHJlZHVjZWRTY2FuID0ge1xyXG4gICAgICAgICAgICBuYW1lOiBuYW1lLFxyXG4gICAgICAgICAgICB0aWNrOiBNYWluLmN1cnJlbnRUaWNrLFxyXG4gICAgICAgICAgICBoaXN0b3J5OiBzY2FuLmhpc3RvcnksXHJcbiAgICAgICAgICAgIGNvbnRleHQ6IHNjYW4uY29udGV4dCxcclxuICAgICAgICB9O1xyXG5cclxuICAgICAgICBjb25zb2xlLmxvZyhgQnJhaW4gc2NhbiBmb3IgJyR7bmFtZX0nOlxcbmAsIEpTT04uc3RyaW5naWZ5KHJlZHVjZWRTY2FuLCBudWxsLCAwKSk7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuc3VjY2VzcyhgTG9nZ2VkIGJyYWluIHNjYW4gZm9yICcke25hbWV9JyB0byBjb25zb2xlYCk7XHJcbiAgICB9XHJcbn1cclxuIl0sIm5hbWVzIjpbIkN1c3RvbUNvbW1hbmRQYXJhbVR5cGUiLCJBYnN0cmFjdENvbW1hbmQiLCJGZWF0dXJlQ2FjaGUiLCJNb2JDb21wb25lbnRNYW5hZ2VyIiwiQnJhaW5TY2FuQ29tbWFuZCIsImhhbmRsZXIiLCJvcmlnaW4iLCJvcGVyYXRpb24iLCJzb3VyY2UiLCJzb3VyY2VFbnRpdHkiLCJzb3VyY2VCbG9jayIsInBvbGwiLCJsb2ciLCJsb2NhdGlvbiIsImJpZ0JyYWluQ29tcG9uZW50cyIsImdldE1vYkNvbXBvbmVudEluc3RhbmNlcyIsInBsYXllcnMiLCJjb21wb25lbnQiLCJlbnRpdHkiLCJpc1ZhbGlkIiwibmFtZSIsIm5hbWVUYWciLCJzY2FuIiwiZGF0YSIsImZlYXR1cmVzIiwidG9KU09OIiwic3VjY2VzcyIsIkpTT04iLCJzdHJpbmdpZnkiLCJxdWVyeSIsImNsb3Nlc3QiLCJ0eXBlIiwibmVhcmVzdCIsIkVudGl0eVV0aWwiLCJnZXRFbnRpdGllcyIsImZhaWx1cmUiLCJFbnRpdHlTdG9yZSIsImdldCIsImJpZ0JyYWluQ29tcG9uZW50IiwiZ2V0TW9iQ29tcG9uZW50IiwicmVkdWNlZFNjYW4iLCJ0aWNrIiwiTWFpbiIsImN1cnJlbnRUaWNrIiwiaGlzdG9yeSIsImNvbnRleHQiLCJjb25zb2xlIiwiY2F0ZWdvcnkiLCJjaGVhdHNSZXF1aXJlZCIsImRlc2NyaXB0aW9uIiwibWFuZGF0b3J5UGFyYW1ldGVycyIsIkVudW0iLCJlbnVtcyJdLCJtYXBwaW5ncyI6IkFBQUEsU0FHSUEsc0JBQXNCLFFBSW5CLG9CQUFvQjtBQUUzQixTQUFTQyxlQUFlLFFBQWdDLDJCQUEyQjtBQUNuRixPQUFPQyxrQkFBa0IsNEJBQTRCO0FBQ3JELE9BQU9DLHlCQUF5QixvQ0FBb0M7QUFHcEUsT0FBTyxNQUFNQyx5QkFBeUJIO0lBZ0IzQkksUUFBUUMsTUFBMkIsRUFBRUMsU0FBNkIsRUFBRTtRQUN2RSxNQUFNQyxTQUFTRixPQUFPRyxZQUFZLElBQUlILE9BQU9JLFdBQVc7UUFFeEQsT0FBUUg7WUFDSixLQUFLO2dCQUNELE9BQU8sSUFBSSxDQUFDSSxJQUFJO1lBQ3BCLEtBQUs7Z0JBQ0QsT0FBTyxJQUFJLENBQUNDLEdBQUcsQ0FBQ0osT0FBT0ssUUFBUTtRQUN2QztJQUNKO0lBRUE7OztLQUdDLEdBQ0QsQUFBUUYsT0FBNEI7UUFDaEMsTUFBTUcscUJBQXFCWCxvQkFBb0JZLHdCQUF3QixDQUFDO1FBRXhFLE1BQU1DLFVBQStCLENBQUM7UUFFdEMsS0FBSyxNQUFNQyxhQUFhSCxtQkFBb0I7WUFDeEMsSUFBSSxDQUFDRyxXQUFXO1lBQ2hCLElBQUksQ0FBQ0EsVUFBVUMsTUFBTSxDQUFDQyxPQUFPLEVBQUU7WUFDL0IsTUFBTUMsT0FBT0gsVUFBVUMsTUFBTSxDQUFDRyxPQUFPO1lBQ3JDTCxPQUFPLENBQUNJLEtBQUssR0FBR0gsVUFBVUssSUFBSTtRQUNsQztRQUVBLE1BQU1DLE9BQWlCO1lBQ25CUDtZQUNBUSxVQUFVdEIsYUFBYXVCLE1BQU07UUFDakM7UUFFQSxPQUFPLElBQUksQ0FBQ0MsT0FBTyxDQUFDQyxLQUFLQyxTQUFTLENBQUNMO0lBQ3ZDO0lBRVFYLElBQUlDLFFBQWlCLEVBQXVCO1FBQ2hELE1BQU1nQixRQUE0QjtZQUM5QmhCLFVBQVVBO1lBQ1ZpQixTQUFTO1lBQ1RDLE1BQU07UUFDVjtRQUNBLE1BQU1DLFVBQVVDLFdBQVdDLFdBQVcsQ0FBQ0wsTUFBTSxDQUFDLEVBQUU7UUFDaEQsSUFBSSxDQUFDRyxTQUFTLE9BQU8sSUFBSSxDQUFDRyxPQUFPLENBQUM7UUFFbEMsTUFBTWYsT0FBT2dCLFlBQVlDLEdBQUcsQ0FBQ0wsU0FBUztRQUN0QyxNQUFNTSxvQkFBb0JOLFFBQVFPLGVBQWUsQ0FBQztRQUNsRCxNQUFNakIsT0FBT2dCLGtCQUFrQmhCLElBQUk7UUFDbkMsTUFBTWtCLGNBQWM7WUFDaEJwQixNQUFNQTtZQUNOcUIsTUFBTUMsS0FBS0MsV0FBVztZQUN0QkMsU0FBU3RCLEtBQUtzQixPQUFPO1lBQ3JCQyxTQUFTdkIsS0FBS3VCLE9BQU87UUFDekI7UUFFQUMsUUFBUWxDLEdBQUcsQ0FBQyxDQUFDLGdCQUFnQixFQUFFUSxLQUFLLElBQUksQ0FBQyxFQUFFTyxLQUFLQyxTQUFTLENBQUNZLGFBQWEsTUFBTTtRQUM3RSxPQUFPLElBQUksQ0FBQ2QsT0FBTyxDQUFDLENBQUMsdUJBQXVCLEVBQUVOLEtBQUssWUFBWSxDQUFDO0lBQ3BFOzs7YUF2RWdCQSxPQUFPO2FBQ1AyQixXQUE0QjthQUM1QkMsaUJBQWlCO2FBQ2RDLGNBQWM7YUFDakJDLHNCQUFnRDtZQUM1RDtnQkFDSTlCLE1BQU07Z0JBQ05XLE1BQU0vQix1QkFBdUJtRCxJQUFJO1lBQ3JDO1NBQ0g7YUFFZUMsUUFBZTtZQUMzQixnQ0FBZ0M7Z0JBQUM7Z0JBQVE7YUFBTTtRQUNuRDs7QUEyREoifQ==