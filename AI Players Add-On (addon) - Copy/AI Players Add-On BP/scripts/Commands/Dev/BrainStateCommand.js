import { CustomCommandParamType, system } from "@minecraft/server";
import { AbstractCommand } from "Commands/AbstractCommand";
export class BrainStateCommand extends AbstractCommand {
    handler(_origin, entities, address, lock = true) {
        for (const entity of entities)this.handleEntity(entity, address, lock);
    }
    handleEntity(entity, address, lock) {
        const bigBrainComponent = entity.getMobComponent("BigBrainComponent");
        if (!bigBrainComponent) return;
        // Strip root/ from the address
        if (address.startsWith("root/")) address = address.slice(5);
        system.run(()=>{
            bigBrainComponent.root.unlock();
            bigBrainComponent.root.setSubaddress(address, lock);
        });
    }
    constructor(...args){
        super(...args);
        this.name = "gm1_sky:brain_state";
        this.category = "dev";
        this.cheatsRequired = true;
        this.description = "Set the state of a BigBrain component";
        this.mandatoryParameters = [
            {
                name: "entity",
                type: CustomCommandParamType.EntitySelector
            },
            {
                name: "address",
                type: CustomCommandParamType.String
            }
        ];
        this.optionalParameters = [
            {
                name: "lock",
                type: CustomCommandParamType.Boolean
            }
        ];
    }
}

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkJyYWluU3RhdGVDb21tYW5kLnRzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEN1c3RvbUNvbW1hbmRPcmlnaW4sIEN1c3RvbUNvbW1hbmRQYXJhbWV0ZXIsIEN1c3RvbUNvbW1hbmRQYXJhbVR5cGUsIEVudGl0eSwgc3lzdGVtIH0gZnJvbSBcIkBtaW5lY3JhZnQvc2VydmVyXCI7XHJcbmltcG9ydCB7IEFic3RyYWN0Q29tbWFuZCwgQ29tbWFuZENhdGVnb3J5IH0gZnJvbSBcIkNvbW1hbmRzL0Fic3RyYWN0Q29tbWFuZFwiO1xyXG5cclxuZXhwb3J0IGNsYXNzIEJyYWluU3RhdGVDb21tYW5kIGV4dGVuZHMgQWJzdHJhY3RDb21tYW5kIHtcclxuICAgIHB1YmxpYyByZWFkb25seSBuYW1lID0gXCJnbTFfc2t5OmJyYWluX3N0YXRlXCI7XHJcbiAgICBwdWJsaWMgcmVhZG9ubHkgY2F0ZWdvcnk6IENvbW1hbmRDYXRlZ29yeSA9IFwiZGV2XCI7XHJcbiAgICBwdWJsaWMgcmVhZG9ubHkgY2hlYXRzUmVxdWlyZWQgPSB0cnVlO1xyXG4gICAgcHJvdGVjdGVkIHJlYWRvbmx5IGRlc2NyaXB0aW9uID0gXCJTZXQgdGhlIHN0YXRlIG9mIGEgQmlnQnJhaW4gY29tcG9uZW50XCI7XHJcbiAgICBwdWJsaWMgcmVhZG9ubHkgbWFuZGF0b3J5UGFyYW1ldGVyczogQ3VzdG9tQ29tbWFuZFBhcmFtZXRlcltdID0gW1xyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbmFtZTogXCJlbnRpdHlcIixcclxuICAgICAgICAgICAgdHlwZTogQ3VzdG9tQ29tbWFuZFBhcmFtVHlwZS5FbnRpdHlTZWxlY3RvcixcclxuICAgICAgICB9LFxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbmFtZTogXCJhZGRyZXNzXCIsXHJcbiAgICAgICAgICAgIHR5cGU6IEN1c3RvbUNvbW1hbmRQYXJhbVR5cGUuU3RyaW5nLFxyXG4gICAgICAgIH0sXHJcbiAgICBdO1xyXG5cclxuICAgIHB1YmxpYyByZWFkb25seSBvcHRpb25hbFBhcmFtZXRlcnM6IEN1c3RvbUNvbW1hbmRQYXJhbWV0ZXJbXSA9IFtcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIG5hbWU6IFwibG9ja1wiLFxyXG4gICAgICAgICAgICB0eXBlOiBDdXN0b21Db21tYW5kUGFyYW1UeXBlLkJvb2xlYW4sXHJcbiAgICAgICAgfSxcclxuICAgIF07XHJcblxyXG4gICAgcHVibGljIGhhbmRsZXIoX29yaWdpbjogQ3VzdG9tQ29tbWFuZE9yaWdpbiwgZW50aXRpZXM6IEVudGl0eVtdLCBhZGRyZXNzOiBzdHJpbmcsIGxvY2s6IGJvb2xlYW4gPSB0cnVlKSB7XHJcbiAgICAgICAgZm9yIChjb25zdCBlbnRpdHkgb2YgZW50aXRpZXMpIHRoaXMuaGFuZGxlRW50aXR5KGVudGl0eSwgYWRkcmVzcywgbG9jayk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBoYW5kbGVFbnRpdHkoZW50aXR5OiBFbnRpdHksIGFkZHJlc3M6IHN0cmluZywgbG9jazogYm9vbGVhbik6IHZvaWQge1xyXG4gICAgICAgIGNvbnN0IGJpZ0JyYWluQ29tcG9uZW50ID0gZW50aXR5LmdldE1vYkNvbXBvbmVudChcIkJpZ0JyYWluQ29tcG9uZW50XCIpO1xyXG4gICAgICAgIGlmICghYmlnQnJhaW5Db21wb25lbnQpIHJldHVybjtcclxuICAgICAgICAvLyBTdHJpcCByb290LyBmcm9tIHRoZSBhZGRyZXNzXHJcbiAgICAgICAgaWYgKGFkZHJlc3Muc3RhcnRzV2l0aChcInJvb3QvXCIpKSBhZGRyZXNzID0gYWRkcmVzcy5zbGljZSg1KTtcclxuXHJcbiAgICAgICAgc3lzdGVtLnJ1bigoKSA9PiB7XHJcbiAgICAgICAgICAgIGJpZ0JyYWluQ29tcG9uZW50LnJvb3QudW5sb2NrKCk7XHJcbiAgICAgICAgICAgIGJpZ0JyYWluQ29tcG9uZW50LnJvb3Quc2V0U3ViYWRkcmVzcyhhZGRyZXNzLCBsb2NrKTtcclxuICAgICAgICB9KTtcclxuICAgIH1cclxufVxyXG4iXSwibmFtZXMiOlsiQ3VzdG9tQ29tbWFuZFBhcmFtVHlwZSIsInN5c3RlbSIsIkFic3RyYWN0Q29tbWFuZCIsIkJyYWluU3RhdGVDb21tYW5kIiwiaGFuZGxlciIsIl9vcmlnaW4iLCJlbnRpdGllcyIsImFkZHJlc3MiLCJsb2NrIiwiZW50aXR5IiwiaGFuZGxlRW50aXR5IiwiYmlnQnJhaW5Db21wb25lbnQiLCJnZXRNb2JDb21wb25lbnQiLCJzdGFydHNXaXRoIiwic2xpY2UiLCJydW4iLCJyb290IiwidW5sb2NrIiwic2V0U3ViYWRkcmVzcyIsIm5hbWUiLCJjYXRlZ29yeSIsImNoZWF0c1JlcXVpcmVkIiwiZGVzY3JpcHRpb24iLCJtYW5kYXRvcnlQYXJhbWV0ZXJzIiwidHlwZSIsIkVudGl0eVNlbGVjdG9yIiwiU3RyaW5nIiwib3B0aW9uYWxQYXJhbWV0ZXJzIiwiQm9vbGVhbiJdLCJtYXBwaW5ncyI6IkFBQUEsU0FBc0RBLHNCQUFzQixFQUFVQyxNQUFNLFFBQVEsb0JBQW9CO0FBQ3hILFNBQVNDLGVBQWUsUUFBeUIsMkJBQTJCO0FBRTVFLE9BQU8sTUFBTUMsMEJBQTBCRDtJQXVCNUJFLFFBQVFDLE9BQTRCLEVBQUVDLFFBQWtCLEVBQUVDLE9BQWUsRUFBRUMsT0FBZ0IsSUFBSSxFQUFFO1FBQ3BHLEtBQUssTUFBTUMsVUFBVUgsU0FBVSxJQUFJLENBQUNJLFlBQVksQ0FBQ0QsUUFBUUYsU0FBU0M7SUFDdEU7SUFFUUUsYUFBYUQsTUFBYyxFQUFFRixPQUFlLEVBQUVDLElBQWEsRUFBUTtRQUN2RSxNQUFNRyxvQkFBb0JGLE9BQU9HLGVBQWUsQ0FBQztRQUNqRCxJQUFJLENBQUNELG1CQUFtQjtRQUN4QiwrQkFBK0I7UUFDL0IsSUFBSUosUUFBUU0sVUFBVSxDQUFDLFVBQVVOLFVBQVVBLFFBQVFPLEtBQUssQ0FBQztRQUV6RGIsT0FBT2MsR0FBRyxDQUFDO1lBQ1BKLGtCQUFrQkssSUFBSSxDQUFDQyxNQUFNO1lBQzdCTixrQkFBa0JLLElBQUksQ0FBQ0UsYUFBYSxDQUFDWCxTQUFTQztRQUNsRDtJQUNKOzs7YUFwQ2dCVyxPQUFPO2FBQ1BDLFdBQTRCO2FBQzVCQyxpQkFBaUI7YUFDZEMsY0FBYzthQUNqQkMsc0JBQWdEO1lBQzVEO2dCQUNJSixNQUFNO2dCQUNOSyxNQUFNeEIsdUJBQXVCeUIsY0FBYztZQUMvQztZQUNBO2dCQUNJTixNQUFNO2dCQUNOSyxNQUFNeEIsdUJBQXVCMEIsTUFBTTtZQUN2QztTQUNIO2FBRWVDLHFCQUErQztZQUMzRDtnQkFDSVIsTUFBTTtnQkFDTkssTUFBTXhCLHVCQUF1QjRCLE9BQU87WUFDeEM7U0FDSDs7QUFpQkwifQ==