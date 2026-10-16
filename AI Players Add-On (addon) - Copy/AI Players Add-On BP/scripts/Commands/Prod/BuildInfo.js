import { AbstractCommand } from "Commands/AbstractCommand";
export class BuildInfoCommand extends AbstractCommand {
    handler(origin) {
        BroadcastUtil.say([
            {
                translate: "build.title"
            }
        ], [
            origin.sourceEntity
        ]);
        BroadcastUtil.say([
            {
                translate: "build.versionTitle"
            },
            {
                translate: "build.version"
            },
            {
                text: ", "
            },
            {
                translate: "build.branchTitle"
            },
            {
                translate: "build.branch"
            },
            {
                text: ", "
            },
            {
                translate: "build.idTitle"
            },
            {
                translate: "build.id"
            }
        ], [
            origin.sourceEntity
        ]);
        BroadcastUtil.say([
            {
                translate: "build.commitSHATitle"
            },
            {
                translate: "build.commitSHA"
            }
        ], [
            origin.sourceEntity
        ]);
    }
    constructor(...args){
        super(...args);
        this.name = "gm1_sky:build_info";
        this.category = "prod";
        this.cheatsRequired = false;
        this.description = "Returns the build and versioning information.";
        this.executionLimit = "players";
        this.runInEarlyExecution = true;
    }
}

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkJ1aWxkSW5mby50cyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBDdXN0b21Db21tYW5kT3JpZ2luLCBQbGF5ZXIgfSBmcm9tIFwiQG1pbmVjcmFmdC9zZXJ2ZXJcIjtcclxuaW1wb3J0IHsgQWJzdHJhY3RDb21tYW5kLCBDb21tYW5kQ2F0ZWdvcnksIEV4ZWN1dGlvbkxpbWl0IH0gZnJvbSBcIkNvbW1hbmRzL0Fic3RyYWN0Q29tbWFuZFwiO1xyXG5cclxuZXhwb3J0IGNsYXNzIEJ1aWxkSW5mb0NvbW1hbmQgZXh0ZW5kcyBBYnN0cmFjdENvbW1hbmQge1xyXG4gICAgcHVibGljIHJlYWRvbmx5IG5hbWUgPSBcImdtMV9za3k6YnVpbGRfaW5mb1wiO1xyXG4gICAgcHVibGljIHJlYWRvbmx5IGNhdGVnb3J5OiBDb21tYW5kQ2F0ZWdvcnkgPSBcInByb2RcIjtcclxuICAgIHB1YmxpYyByZWFkb25seSBjaGVhdHNSZXF1aXJlZCA9IGZhbHNlO1xyXG4gICAgcHJvdGVjdGVkIHJlYWRvbmx5IGRlc2NyaXB0aW9uID0gXCJSZXR1cm5zIHRoZSBidWlsZCBhbmQgdmVyc2lvbmluZyBpbmZvcm1hdGlvbi5cIjtcclxuICAgIHByb3RlY3RlZCByZWFkb25seSBleGVjdXRpb25MaW1pdDogRXhlY3V0aW9uTGltaXQgPSBcInBsYXllcnNcIjtcclxuICAgIHByb3RlY3RlZCByZWFkb25seSBydW5JbkVhcmx5RXhlY3V0aW9uID0gdHJ1ZTtcclxuXHJcbiAgICBwdWJsaWMgaGFuZGxlcihvcmlnaW46IEN1c3RvbUNvbW1hbmRPcmlnaW4pIHtcclxuICAgICAgICBCcm9hZGNhc3RVdGlsLnNheShbeyB0cmFuc2xhdGU6IFwiYnVpbGQudGl0bGVcIiB9XSwgW29yaWdpbi5zb3VyY2VFbnRpdHkgYXMgUGxheWVyXSk7XHJcblxyXG4gICAgICAgIEJyb2FkY2FzdFV0aWwuc2F5KFxyXG4gICAgICAgICAgICBbXHJcbiAgICAgICAgICAgICAgICB7IHRyYW5zbGF0ZTogXCJidWlsZC52ZXJzaW9uVGl0bGVcIiB9LFxyXG4gICAgICAgICAgICAgICAgeyB0cmFuc2xhdGU6IFwiYnVpbGQudmVyc2lvblwiIH0sXHJcbiAgICAgICAgICAgICAgICB7IHRleHQ6IFwiLCBcIiB9LFxyXG4gICAgICAgICAgICAgICAgeyB0cmFuc2xhdGU6IFwiYnVpbGQuYnJhbmNoVGl0bGVcIiB9LFxyXG4gICAgICAgICAgICAgICAgeyB0cmFuc2xhdGU6IFwiYnVpbGQuYnJhbmNoXCIgfSxcclxuICAgICAgICAgICAgICAgIHsgdGV4dDogXCIsIFwiIH0sXHJcbiAgICAgICAgICAgICAgICB7IHRyYW5zbGF0ZTogXCJidWlsZC5pZFRpdGxlXCIgfSxcclxuICAgICAgICAgICAgICAgIHsgdHJhbnNsYXRlOiBcImJ1aWxkLmlkXCIgfSxcclxuICAgICAgICAgICAgXSxcclxuICAgICAgICAgICAgW29yaWdpbi5zb3VyY2VFbnRpdHkgYXMgUGxheWVyXVxyXG4gICAgICAgICk7XHJcblxyXG4gICAgICAgIEJyb2FkY2FzdFV0aWwuc2F5KFt7IHRyYW5zbGF0ZTogXCJidWlsZC5jb21taXRTSEFUaXRsZVwiIH0sIHsgdHJhbnNsYXRlOiBcImJ1aWxkLmNvbW1pdFNIQVwiIH1dLCBbb3JpZ2luLnNvdXJjZUVudGl0eSBhcyBQbGF5ZXJdKTtcclxuICAgIH1cclxufVxyXG4iXSwibmFtZXMiOlsiQWJzdHJhY3RDb21tYW5kIiwiQnVpbGRJbmZvQ29tbWFuZCIsImhhbmRsZXIiLCJvcmlnaW4iLCJCcm9hZGNhc3RVdGlsIiwic2F5IiwidHJhbnNsYXRlIiwic291cmNlRW50aXR5IiwidGV4dCIsIm5hbWUiLCJjYXRlZ29yeSIsImNoZWF0c1JlcXVpcmVkIiwiZGVzY3JpcHRpb24iLCJleGVjdXRpb25MaW1pdCIsInJ1bkluRWFybHlFeGVjdXRpb24iXSwibWFwcGluZ3MiOiJBQUNBLFNBQVNBLGVBQWUsUUFBeUMsMkJBQTJCO0FBRTVGLE9BQU8sTUFBTUMseUJBQXlCRDtJQVEzQkUsUUFBUUMsTUFBMkIsRUFBRTtRQUN4Q0MsY0FBY0MsR0FBRyxDQUFDO1lBQUM7Z0JBQUVDLFdBQVc7WUFBYztTQUFFLEVBQUU7WUFBQ0gsT0FBT0ksWUFBWTtTQUFXO1FBRWpGSCxjQUFjQyxHQUFHLENBQ2I7WUFDSTtnQkFBRUMsV0FBVztZQUFxQjtZQUNsQztnQkFBRUEsV0FBVztZQUFnQjtZQUM3QjtnQkFBRUUsTUFBTTtZQUFLO1lBQ2I7Z0JBQUVGLFdBQVc7WUFBb0I7WUFDakM7Z0JBQUVBLFdBQVc7WUFBZTtZQUM1QjtnQkFBRUUsTUFBTTtZQUFLO1lBQ2I7Z0JBQUVGLFdBQVc7WUFBZ0I7WUFDN0I7Z0JBQUVBLFdBQVc7WUFBVztTQUMzQixFQUNEO1lBQUNILE9BQU9JLFlBQVk7U0FBVztRQUduQ0gsY0FBY0MsR0FBRyxDQUFDO1lBQUM7Z0JBQUVDLFdBQVc7WUFBdUI7WUFBRztnQkFBRUEsV0FBVztZQUFrQjtTQUFFLEVBQUU7WUFBQ0gsT0FBT0ksWUFBWTtTQUFXO0lBQ2hJOzs7YUF6QmdCRSxPQUFPO2FBQ1BDLFdBQTRCO2FBQzVCQyxpQkFBaUI7YUFDZEMsY0FBYzthQUNkQyxpQkFBaUM7YUFDakNDLHNCQUFzQjs7QUFxQjdDIn0=