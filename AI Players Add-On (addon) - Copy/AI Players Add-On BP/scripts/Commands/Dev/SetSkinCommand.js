import { CustomCommandParamType } from "@minecraft/server";
import { AbstractCommand } from "Commands/AbstractCommand";
import SkinRandomizerComponent from "SkinRandomizer/SkinRandomizerComponent";
export class SetSkinCommand extends AbstractCommand {
    handler(origin, property, value) {
        const player = origin.sourceEntity;
        const query = {
            location: player.location,
            closest: 1,
            type: "gm1_sky:aip"
        };
        const nearest = EntityUtil.getEntities(query)[0];
        if (!nearest) return;
        SkinRandomizerComponent.debugSetSkin(nearest, property, value);
    }
    constructor(...args){
        super(...args);
        this.name = "gm1_sky:set_skin";
        this.category = "dev";
        this.cheatsRequired = true;
        this.executionLimit = "players";
        this.runInEarlyExecution = false;
        this.description = "Overrides a skin property on the nearest AIP entity";
        this.mandatoryParameters = [
            {
                name: "gm1_sky:set_skin.property",
                type: CustomCommandParamType.Enum
            },
            {
                name: "value",
                type: CustomCommandParamType.Integer
            }
        ];
        this.enums = {
            "gm1_sky:set_skin.property": [
                "bodytype",
                "base",
                "shirt",
                "pants",
                "eyes",
                "eyes_color",
                "mouth",
                "mouth_color",
                "hair",
                "hair_color"
            ]
        };
    }
}

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIlNldFNraW5Db21tYW5kLnRzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEN1c3RvbUNvbW1hbmRPcmlnaW4sIEN1c3RvbUNvbW1hbmRQYXJhbWV0ZXIsIEN1c3RvbUNvbW1hbmRQYXJhbVR5cGUsIEVudGl0eVF1ZXJ5T3B0aW9ucywgUGxheWVyIH0gZnJvbSBcIkBtaW5lY3JhZnQvc2VydmVyXCI7XHJcbmltcG9ydCB7IEFic3RyYWN0Q29tbWFuZCwgQ29tbWFuZENhdGVnb3J5LCBFbnVtcywgRXhlY3V0aW9uTGltaXQgfSBmcm9tIFwiQ29tbWFuZHMvQWJzdHJhY3RDb21tYW5kXCI7XHJcbmltcG9ydCBTa2luUmFuZG9taXplckNvbXBvbmVudCBmcm9tIFwiU2tpblJhbmRvbWl6ZXIvU2tpblJhbmRvbWl6ZXJDb21wb25lbnRcIjtcclxuXHJcbmV4cG9ydCBjbGFzcyBTZXRTa2luQ29tbWFuZCBleHRlbmRzIEFic3RyYWN0Q29tbWFuZCB7XHJcbiAgICBwdWJsaWMgcmVhZG9ubHkgbmFtZSA9IFwiZ20xX3NreTpzZXRfc2tpblwiO1xyXG4gICAgcHVibGljIHJlYWRvbmx5IGNhdGVnb3J5OiBDb21tYW5kQ2F0ZWdvcnkgPSBcImRldlwiO1xyXG4gICAgcHVibGljIHJlYWRvbmx5IGNoZWF0c1JlcXVpcmVkID0gdHJ1ZTtcclxuICAgIHB1YmxpYyByZWFkb25seSBleGVjdXRpb25MaW1pdDogRXhlY3V0aW9uTGltaXQgPSBcInBsYXllcnNcIjtcclxuICAgIHB1YmxpYyByZWFkb25seSBydW5JbkVhcmx5RXhlY3V0aW9uID0gZmFsc2U7XHJcbiAgICBwcm90ZWN0ZWQgcmVhZG9ubHkgZGVzY3JpcHRpb24gPSBcIk92ZXJyaWRlcyBhIHNraW4gcHJvcGVydHkgb24gdGhlIG5lYXJlc3QgQUlQIGVudGl0eVwiO1xyXG5cclxuICAgIHB1YmxpYyByZWFkb25seSBtYW5kYXRvcnlQYXJhbWV0ZXJzOiBDdXN0b21Db21tYW5kUGFyYW1ldGVyW10gPSBbXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBuYW1lOiBcImdtMV9za3k6c2V0X3NraW4ucHJvcGVydHlcIixcclxuICAgICAgICAgICAgdHlwZTogQ3VzdG9tQ29tbWFuZFBhcmFtVHlwZS5FbnVtLFxyXG4gICAgICAgIH0sXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBuYW1lOiBcInZhbHVlXCIsXHJcbiAgICAgICAgICAgIHR5cGU6IEN1c3RvbUNvbW1hbmRQYXJhbVR5cGUuSW50ZWdlcixcclxuICAgICAgICB9LFxyXG4gICAgXTtcclxuXHJcbiAgICBwdWJsaWMgcmVhZG9ubHkgZW51bXM6IEVudW1zID0ge1xyXG4gICAgICAgIFwiZ20xX3NreTpzZXRfc2tpbi5wcm9wZXJ0eVwiOiBbXHJcbiAgICAgICAgICAgIFwiYm9keXR5cGVcIixcclxuICAgICAgICAgICAgXCJiYXNlXCIsXHJcbiAgICAgICAgICAgIFwic2hpcnRcIixcclxuICAgICAgICAgICAgXCJwYW50c1wiLFxyXG4gICAgICAgICAgICBcImV5ZXNcIixcclxuICAgICAgICAgICAgXCJleWVzX2NvbG9yXCIsXHJcbiAgICAgICAgICAgIFwibW91dGhcIixcclxuICAgICAgICAgICAgXCJtb3V0aF9jb2xvclwiLFxyXG4gICAgICAgICAgICBcImhhaXJcIixcclxuICAgICAgICAgICAgXCJoYWlyX2NvbG9yXCIsXHJcbiAgICAgICAgXSxcclxuICAgIH07XHJcblxyXG4gICAgcHVibGljIGhhbmRsZXIob3JpZ2luOiBDdXN0b21Db21tYW5kT3JpZ2luLCBwcm9wZXJ0eTogc3RyaW5nLCB2YWx1ZTogbnVtYmVyKSB7XHJcbiAgICAgICAgY29uc3QgcGxheWVyID0gb3JpZ2luLnNvdXJjZUVudGl0eSBhcyBQbGF5ZXI7XHJcblxyXG4gICAgICAgIGNvbnN0IHF1ZXJ5OiBFbnRpdHlRdWVyeU9wdGlvbnMgPSB7XHJcbiAgICAgICAgICAgIGxvY2F0aW9uOiBwbGF5ZXIubG9jYXRpb24sXHJcbiAgICAgICAgICAgIGNsb3Nlc3Q6IDEsXHJcbiAgICAgICAgICAgIHR5cGU6IFwiZ20xX3NreTphaXBcIixcclxuICAgICAgICB9O1xyXG4gICAgICAgIGNvbnN0IG5lYXJlc3QgPSBFbnRpdHlVdGlsLmdldEVudGl0aWVzKHF1ZXJ5KVswXTtcclxuXHJcbiAgICAgICAgaWYgKCFuZWFyZXN0KSByZXR1cm47XHJcblxyXG4gICAgICAgIFNraW5SYW5kb21pemVyQ29tcG9uZW50LmRlYnVnU2V0U2tpbihuZWFyZXN0LCBwcm9wZXJ0eSwgdmFsdWUpO1xyXG4gICAgfVxyXG59XHJcbiJdLCJuYW1lcyI6WyJDdXN0b21Db21tYW5kUGFyYW1UeXBlIiwiQWJzdHJhY3RDb21tYW5kIiwiU2tpblJhbmRvbWl6ZXJDb21wb25lbnQiLCJTZXRTa2luQ29tbWFuZCIsImhhbmRsZXIiLCJvcmlnaW4iLCJwcm9wZXJ0eSIsInZhbHVlIiwicGxheWVyIiwic291cmNlRW50aXR5IiwicXVlcnkiLCJsb2NhdGlvbiIsImNsb3Nlc3QiLCJ0eXBlIiwibmVhcmVzdCIsIkVudGl0eVV0aWwiLCJnZXRFbnRpdGllcyIsImRlYnVnU2V0U2tpbiIsIm5hbWUiLCJjYXRlZ29yeSIsImNoZWF0c1JlcXVpcmVkIiwiZXhlY3V0aW9uTGltaXQiLCJydW5JbkVhcmx5RXhlY3V0aW9uIiwiZGVzY3JpcHRpb24iLCJtYW5kYXRvcnlQYXJhbWV0ZXJzIiwiRW51bSIsIkludGVnZXIiLCJlbnVtcyJdLCJtYXBwaW5ncyI6IkFBQUEsU0FBc0RBLHNCQUFzQixRQUFvQyxvQkFBb0I7QUFDcEksU0FBU0MsZUFBZSxRQUFnRCwyQkFBMkI7QUFDbkcsT0FBT0MsNkJBQTZCLHlDQUF5QztBQUU3RSxPQUFPLE1BQU1DLHVCQUF1QkY7SUFrQ3pCRyxRQUFRQyxNQUEyQixFQUFFQyxRQUFnQixFQUFFQyxLQUFhLEVBQUU7UUFDekUsTUFBTUMsU0FBU0gsT0FBT0ksWUFBWTtRQUVsQyxNQUFNQyxRQUE0QjtZQUM5QkMsVUFBVUgsT0FBT0csUUFBUTtZQUN6QkMsU0FBUztZQUNUQyxNQUFNO1FBQ1Y7UUFDQSxNQUFNQyxVQUFVQyxXQUFXQyxXQUFXLENBQUNOLE1BQU0sQ0FBQyxFQUFFO1FBRWhELElBQUksQ0FBQ0ksU0FBUztRQUVkWix3QkFBd0JlLFlBQVksQ0FBQ0gsU0FBU1IsVUFBVUM7SUFDNUQ7OzthQTlDZ0JXLE9BQU87YUFDUEMsV0FBNEI7YUFDNUJDLGlCQUFpQjthQUNqQkMsaUJBQWlDO2FBQ2pDQyxzQkFBc0I7YUFDbkJDLGNBQWM7YUFFakJDLHNCQUFnRDtZQUM1RDtnQkFDSU4sTUFBTTtnQkFDTkwsTUFBTWIsdUJBQXVCeUIsSUFBSTtZQUNyQztZQUNBO2dCQUNJUCxNQUFNO2dCQUNOTCxNQUFNYix1QkFBdUIwQixPQUFPO1lBQ3hDO1NBQ0g7YUFFZUMsUUFBZTtZQUMzQiw2QkFBNkI7Z0JBQ3pCO2dCQUNBO2dCQUNBO2dCQUNBO2dCQUNBO2dCQUNBO2dCQUNBO2dCQUNBO2dCQUNBO2dCQUNBO2FBQ0g7UUFDTDs7QUFnQkoifQ==