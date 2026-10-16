import { CustomCommandParamType, ItemStack } from "@minecraft/server";
import { ProgressAgesProcedure } from "BigBrain/Procedures/ProgressAgesProcedure";
import { AbstractCommand } from "Commands/AbstractCommand";
import AgesData from "Data/AgesData";
import VirtualInventoryComponent from "Inventory/VirtualInventoryComponent";
export class SetAgeCommand extends AbstractCommand {
    handler(origin, age, equip) {
        const source = origin.sourceEntity ?? origin.sourceBlock ?? origin.initiator;
        if (!source) return;
        const query = {
            location: source.location,
            closest: 1,
            type: "gm1_sky:aip"
        };
        const entity = EntityUtil.getEntities(query)[0];
        if (!entity) return;
        const bigBrain = entity.getMobComponent("BigBrainComponent");
        if (!bigBrain) return;
        const progressAgesProcedure = bigBrain.findAll(ProgressAgesProcedure)[0];
        if (!progressAgesProcedure) return;
        progressAgesProcedure.setCurrentAge(age);
        if (equip) this.givePrerequisiteItems(entity, age);
    }
    givePrerequisiteItems(entity, age) {
        const ageIndex = AgesData.AgePriorities.indexOf(age);
        if (ageIndex <= 0) return;
        // Give all previous age's requirements
        for(let i = 0; i < ageIndex; i++){
            const previousAge = AgesData.AgePriorities[i];
            const ageRequirements = AgesData.AgeRequirementsMap[previousAge] ?? [];
            const inventory = VirtualInventoryComponent.get(entity);
            for (const item of ageRequirements){
                inventory.giveItem(new ItemStack(item.id, item.amount));
            }
        }
    }
    constructor(...args){
        super(...args);
        this.name = "gm1_sky:set_age";
        this.category = "dev";
        this.executionLimit = "any";
        this.runInEarlyExecution = false;
        this.description = "Set the passive routine age for the nearest AIP";
        this.mandatoryParameters = [
            {
                name: "gm1_sky:set_age.age",
                type: CustomCommandParamType.Enum
            }
        ];
        this.optionalParameters = [
            {
                name: "equip_prerequisites",
                type: CustomCommandParamType.Boolean
            }
        ];
        this.enums = {
            "gm1_sky:set_age.age": [
                ...AgesData.AgePriorities
            ]
        };
    }
}

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIlNldEFnZUNvbW1hbmQudHMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHtcclxuICAgIEN1c3RvbUNvbW1hbmRPcmlnaW4sXHJcbiAgICBDdXN0b21Db21tYW5kUGFyYW1ldGVyLFxyXG4gICAgQ3VzdG9tQ29tbWFuZFBhcmFtVHlwZSxcclxuICAgIEVudGl0eSxcclxuICAgIEVudGl0eVF1ZXJ5T3B0aW9ucyxcclxuICAgIEl0ZW1TdGFjayxcclxufSBmcm9tIFwiQG1pbmVjcmFmdC9zZXJ2ZXJcIjtcclxuaW1wb3J0IHsgUHJvZ3Jlc3NBZ2VzUHJvY2VkdXJlIH0gZnJvbSBcIkJpZ0JyYWluL1Byb2NlZHVyZXMvUHJvZ3Jlc3NBZ2VzUHJvY2VkdXJlXCI7XHJcbmltcG9ydCB7IEFic3RyYWN0Q29tbWFuZCwgQ29tbWFuZENhdGVnb3J5LCBFbnVtcywgRXhlY3V0aW9uTGltaXQgfSBmcm9tIFwiQ29tbWFuZHMvQWJzdHJhY3RDb21tYW5kXCI7XHJcbmltcG9ydCBBZ2VzRGF0YSBmcm9tIFwiRGF0YS9BZ2VzRGF0YVwiO1xyXG5pbXBvcnQgVmlydHVhbEludmVudG9yeUNvbXBvbmVudCBmcm9tIFwiSW52ZW50b3J5L1ZpcnR1YWxJbnZlbnRvcnlDb21wb25lbnRcIjtcclxuXHJcbnR5cGUgQWdlID0gKHR5cGVvZiBBZ2VzRGF0YS5BZ2VQcmlvcml0aWVzKVtudW1iZXJdO1xyXG5cclxuZXhwb3J0IGNsYXNzIFNldEFnZUNvbW1hbmQgZXh0ZW5kcyBBYnN0cmFjdENvbW1hbmQge1xyXG4gICAgcHVibGljIHJlYWRvbmx5IG5hbWUgPSBcImdtMV9za3k6c2V0X2FnZVwiO1xyXG4gICAgcHVibGljIHJlYWRvbmx5IGNhdGVnb3J5OiBDb21tYW5kQ2F0ZWdvcnkgPSBcImRldlwiO1xyXG4gICAgcHVibGljIHJlYWRvbmx5IGV4ZWN1dGlvbkxpbWl0OiBFeGVjdXRpb25MaW1pdCA9IFwiYW55XCI7XHJcbiAgICBwcm90ZWN0ZWQgcmVhZG9ubHkgcnVuSW5FYXJseUV4ZWN1dGlvbjogYm9vbGVhbiA9IGZhbHNlO1xyXG4gICAgcHJvdGVjdGVkIHJlYWRvbmx5IGRlc2NyaXB0aW9uID0gXCJTZXQgdGhlIHBhc3NpdmUgcm91dGluZSBhZ2UgZm9yIHRoZSBuZWFyZXN0IEFJUFwiO1xyXG5cclxuICAgIHB1YmxpYyByZWFkb25seSBtYW5kYXRvcnlQYXJhbWV0ZXJzOiBDdXN0b21Db21tYW5kUGFyYW1ldGVyW10gPSBbeyBuYW1lOiBcImdtMV9za3k6c2V0X2FnZS5hZ2VcIiwgdHlwZTogQ3VzdG9tQ29tbWFuZFBhcmFtVHlwZS5FbnVtIH1dO1xyXG4gICAgcHVibGljIHJlYWRvbmx5IG9wdGlvbmFsUGFyYW1ldGVyczogQ3VzdG9tQ29tbWFuZFBhcmFtZXRlcltdID0gW3sgbmFtZTogXCJlcXVpcF9wcmVyZXF1aXNpdGVzXCIsIHR5cGU6IEN1c3RvbUNvbW1hbmRQYXJhbVR5cGUuQm9vbGVhbiB9XTtcclxuXHJcbiAgICBwdWJsaWMgcmVhZG9ubHkgZW51bXM6IEVudW1zID0ge1xyXG4gICAgICAgIFwiZ20xX3NreTpzZXRfYWdlLmFnZVwiOiBbLi4uQWdlc0RhdGEuQWdlUHJpb3JpdGllc10sXHJcbiAgICB9O1xyXG5cclxuICAgIHB1YmxpYyBoYW5kbGVyKG9yaWdpbjogQ3VzdG9tQ29tbWFuZE9yaWdpbiwgYWdlOiBzdHJpbmcsIGVxdWlwPzogYm9vbGVhbikge1xyXG4gICAgICAgIGNvbnN0IHNvdXJjZSA9IG9yaWdpbi5zb3VyY2VFbnRpdHkgPz8gb3JpZ2luLnNvdXJjZUJsb2NrID8/IG9yaWdpbi5pbml0aWF0b3I7XHJcbiAgICAgICAgaWYgKCFzb3VyY2UpIHJldHVybjtcclxuXHJcbiAgICAgICAgY29uc3QgcXVlcnk6IEVudGl0eVF1ZXJ5T3B0aW9ucyA9IHtcclxuICAgICAgICAgICAgbG9jYXRpb246IHNvdXJjZS5sb2NhdGlvbixcclxuICAgICAgICAgICAgY2xvc2VzdDogMSxcclxuICAgICAgICAgICAgdHlwZTogXCJnbTFfc2t5OmFpcFwiLFxyXG4gICAgICAgIH07XHJcbiAgICAgICAgY29uc3QgZW50aXR5ID0gRW50aXR5VXRpbC5nZXRFbnRpdGllcyhxdWVyeSlbMF07XHJcbiAgICAgICAgaWYgKCFlbnRpdHkpIHJldHVybjtcclxuXHJcbiAgICAgICAgY29uc3QgYmlnQnJhaW4gPSBlbnRpdHkuZ2V0TW9iQ29tcG9uZW50KFwiQmlnQnJhaW5Db21wb25lbnRcIik7XHJcbiAgICAgICAgaWYgKCFiaWdCcmFpbikgcmV0dXJuO1xyXG5cclxuICAgICAgICBjb25zdCBwcm9ncmVzc0FnZXNQcm9jZWR1cmUgPSBiaWdCcmFpbi5maW5kQWxsKFByb2dyZXNzQWdlc1Byb2NlZHVyZSlbMF07XHJcbiAgICAgICAgaWYgKCFwcm9ncmVzc0FnZXNQcm9jZWR1cmUpIHJldHVybjtcclxuXHJcbiAgICAgICAgcHJvZ3Jlc3NBZ2VzUHJvY2VkdXJlLnNldEN1cnJlbnRBZ2UoYWdlIGFzIEFnZSk7XHJcblxyXG4gICAgICAgIGlmIChlcXVpcCkgdGhpcy5naXZlUHJlcmVxdWlzaXRlSXRlbXMoZW50aXR5LCBhZ2UgYXMgQWdlKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGdpdmVQcmVyZXF1aXNpdGVJdGVtcyhlbnRpdHk6IEVudGl0eSwgYWdlOiBBZ2UpIHtcclxuICAgICAgICBjb25zdCBhZ2VJbmRleCA9IEFnZXNEYXRhLkFnZVByaW9yaXRpZXMuaW5kZXhPZihhZ2UpO1xyXG4gICAgICAgIGlmIChhZ2VJbmRleCA8PSAwKSByZXR1cm47XHJcblxyXG4gICAgICAgIC8vIEdpdmUgYWxsIHByZXZpb3VzIGFnZSdzIHJlcXVpcmVtZW50c1xyXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgYWdlSW5kZXg7IGkrKykge1xyXG4gICAgICAgICAgICBjb25zdCBwcmV2aW91c0FnZSA9IEFnZXNEYXRhLkFnZVByaW9yaXRpZXNbaV07XHJcbiAgICAgICAgICAgIGNvbnN0IGFnZVJlcXVpcmVtZW50cyA9IEFnZXNEYXRhLkFnZVJlcXVpcmVtZW50c01hcFtwcmV2aW91c0FnZV0gPz8gW107XHJcbiAgICAgICAgICAgIGNvbnN0IGludmVudG9yeSA9IFZpcnR1YWxJbnZlbnRvcnlDb21wb25lbnQuZ2V0KGVudGl0eSk7XHJcbiAgICAgICAgICAgIGZvciAoY29uc3QgaXRlbSBvZiBhZ2VSZXF1aXJlbWVudHMpIHtcclxuICAgICAgICAgICAgICAgIGludmVudG9yeS5naXZlSXRlbShuZXcgSXRlbVN0YWNrKGl0ZW0uaWQsIGl0ZW0uYW1vdW50KSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcbn1cclxuIl0sIm5hbWVzIjpbIkN1c3RvbUNvbW1hbmRQYXJhbVR5cGUiLCJJdGVtU3RhY2siLCJQcm9ncmVzc0FnZXNQcm9jZWR1cmUiLCJBYnN0cmFjdENvbW1hbmQiLCJBZ2VzRGF0YSIsIlZpcnR1YWxJbnZlbnRvcnlDb21wb25lbnQiLCJTZXRBZ2VDb21tYW5kIiwiaGFuZGxlciIsIm9yaWdpbiIsImFnZSIsImVxdWlwIiwic291cmNlIiwic291cmNlRW50aXR5Iiwic291cmNlQmxvY2siLCJpbml0aWF0b3IiLCJxdWVyeSIsImxvY2F0aW9uIiwiY2xvc2VzdCIsInR5cGUiLCJlbnRpdHkiLCJFbnRpdHlVdGlsIiwiZ2V0RW50aXRpZXMiLCJiaWdCcmFpbiIsImdldE1vYkNvbXBvbmVudCIsInByb2dyZXNzQWdlc1Byb2NlZHVyZSIsImZpbmRBbGwiLCJzZXRDdXJyZW50QWdlIiwiZ2l2ZVByZXJlcXVpc2l0ZUl0ZW1zIiwiYWdlSW5kZXgiLCJBZ2VQcmlvcml0aWVzIiwiaW5kZXhPZiIsImkiLCJwcmV2aW91c0FnZSIsImFnZVJlcXVpcmVtZW50cyIsIkFnZVJlcXVpcmVtZW50c01hcCIsImludmVudG9yeSIsImdldCIsIml0ZW0iLCJnaXZlSXRlbSIsImlkIiwiYW1vdW50IiwibmFtZSIsImNhdGVnb3J5IiwiZXhlY3V0aW9uTGltaXQiLCJydW5JbkVhcmx5RXhlY3V0aW9uIiwiZGVzY3JpcHRpb24iLCJtYW5kYXRvcnlQYXJhbWV0ZXJzIiwiRW51bSIsIm9wdGlvbmFsUGFyYW1ldGVycyIsIkJvb2xlYW4iLCJlbnVtcyJdLCJtYXBwaW5ncyI6IkFBQUEsU0FHSUEsc0JBQXNCLEVBR3RCQyxTQUFTLFFBQ04sb0JBQW9CO0FBQzNCLFNBQVNDLHFCQUFxQixRQUFRLDRDQUE0QztBQUNsRixTQUFTQyxlQUFlLFFBQWdELDJCQUEyQjtBQUNuRyxPQUFPQyxjQUFjLGdCQUFnQjtBQUNyQyxPQUFPQywrQkFBK0Isc0NBQXNDO0FBSTVFLE9BQU8sTUFBTUMsc0JBQXNCSDtJQWN4QkksUUFBUUMsTUFBMkIsRUFBRUMsR0FBVyxFQUFFQyxLQUFlLEVBQUU7UUFDdEUsTUFBTUMsU0FBU0gsT0FBT0ksWUFBWSxJQUFJSixPQUFPSyxXQUFXLElBQUlMLE9BQU9NLFNBQVM7UUFDNUUsSUFBSSxDQUFDSCxRQUFRO1FBRWIsTUFBTUksUUFBNEI7WUFDOUJDLFVBQVVMLE9BQU9LLFFBQVE7WUFDekJDLFNBQVM7WUFDVEMsTUFBTTtRQUNWO1FBQ0EsTUFBTUMsU0FBU0MsV0FBV0MsV0FBVyxDQUFDTixNQUFNLENBQUMsRUFBRTtRQUMvQyxJQUFJLENBQUNJLFFBQVE7UUFFYixNQUFNRyxXQUFXSCxPQUFPSSxlQUFlLENBQUM7UUFDeEMsSUFBSSxDQUFDRCxVQUFVO1FBRWYsTUFBTUUsd0JBQXdCRixTQUFTRyxPQUFPLENBQUN2QixzQkFBc0IsQ0FBQyxFQUFFO1FBQ3hFLElBQUksQ0FBQ3NCLHVCQUF1QjtRQUU1QkEsc0JBQXNCRSxhQUFhLENBQUNqQjtRQUVwQyxJQUFJQyxPQUFPLElBQUksQ0FBQ2lCLHFCQUFxQixDQUFDUixRQUFRVjtJQUNsRDtJQUVRa0Isc0JBQXNCUixNQUFjLEVBQUVWLEdBQVEsRUFBRTtRQUNwRCxNQUFNbUIsV0FBV3hCLFNBQVN5QixhQUFhLENBQUNDLE9BQU8sQ0FBQ3JCO1FBQ2hELElBQUltQixZQUFZLEdBQUc7UUFFbkIsdUNBQXVDO1FBQ3ZDLElBQUssSUFBSUcsSUFBSSxHQUFHQSxJQUFJSCxVQUFVRyxJQUFLO1lBQy9CLE1BQU1DLGNBQWM1QixTQUFTeUIsYUFBYSxDQUFDRSxFQUFFO1lBQzdDLE1BQU1FLGtCQUFrQjdCLFNBQVM4QixrQkFBa0IsQ0FBQ0YsWUFBWSxJQUFJLEVBQUU7WUFDdEUsTUFBTUcsWUFBWTlCLDBCQUEwQitCLEdBQUcsQ0FBQ2pCO1lBQ2hELEtBQUssTUFBTWtCLFFBQVFKLGdCQUFpQjtnQkFDaENFLFVBQVVHLFFBQVEsQ0FBQyxJQUFJckMsVUFBVW9DLEtBQUtFLEVBQUUsRUFBRUYsS0FBS0csTUFBTTtZQUN6RDtRQUNKO0lBQ0o7OzthQWpEZ0JDLE9BQU87YUFDUEMsV0FBNEI7YUFDNUJDLGlCQUFpQzthQUM5QkMsc0JBQStCO2FBQy9CQyxjQUFjO2FBRWpCQyxzQkFBZ0Q7WUFBQztnQkFBRUwsTUFBTTtnQkFBdUJ2QixNQUFNbEIsdUJBQXVCK0MsSUFBSTtZQUFDO1NBQUU7YUFDcEhDLHFCQUErQztZQUFDO2dCQUFFUCxNQUFNO2dCQUF1QnZCLE1BQU1sQix1QkFBdUJpRCxPQUFPO1lBQUM7U0FBRTthQUV0SEMsUUFBZTtZQUMzQix1QkFBdUI7bUJBQUk5QyxTQUFTeUIsYUFBYTthQUFDO1FBQ3REOztBQXVDSiJ9