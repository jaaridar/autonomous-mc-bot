import { ItemStack, TicksPerSecond } from "@minecraft/server";
import { SwapToItemProcedure } from "BigBrain/Procedures/SwapToItemProcedure";
import V3 from "Helpers/Vectors/V3";
import AbstractHotbarTest, { SwapToItemTestRoot } from "./AbstractHotbarTest";
class BackwardScrollTest extends AbstractHotbarTest {
    async run(test) {
        super.run(test);
        const aip = this.spawnAIP(test, new V3(1, 2, 1), {
            root: SwapToItemTestRoot
        });
        await test.idle(1);
        const bigBrain = aip.getMobComponent("BigBrainComponent");
        const hotbar = aip.getMobComponent("VirtualHotbarComponent");
        this.giveFullGear(aip);
        hotbar.updateSlotsWithBestItems();
        // Set selected slot to 1 so that backward (1 -> 0 -> 7 -> 6) is shorter than forward (1 -> 2 -> 3 -> 4 -> 5 -> 6)
        hotbar.setSelectedSlot(1);
        const swapToItem = bigBrain.root.substates[SwapToItemProcedure.identifier];
        swapToItem.setItem(new ItemStack("minecraft:torch"));
        bigBrain.root.setSubaddress(SwapToItemProcedure.identifier);
        this.assertScrollRoute(test, hotbar, swapToItem, [
            1,
            0,
            7,
            6
        ]);
    }
    constructor(...args){
        super(...args);
        this.namespace = "inventory";
        this.identifier = "backward_scroll";
        this.structure = "grass";
        this.maxTicks = 10 * TicksPerSecond;
    }
}
export { BackwardScrollTest as default };

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkJhY2t3YXJkU2Nyb2xsVGVzdC50cyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBJdGVtU3RhY2ssIFRpY2tzUGVyU2Vjb25kIH0gZnJvbSBcIkBtaW5lY3JhZnQvc2VydmVyXCI7XHJcbmltcG9ydCB7IFRlc3QgfSBmcm9tIFwiQG1pbmVjcmFmdC9zZXJ2ZXItZ2FtZXRlc3RcIjtcclxuaW1wb3J0IHsgU3dhcFRvSXRlbVByb2NlZHVyZSB9IGZyb20gXCJCaWdCcmFpbi9Qcm9jZWR1cmVzL1N3YXBUb0l0ZW1Qcm9jZWR1cmVcIjtcclxuaW1wb3J0IFYzIGZyb20gXCJIZWxwZXJzL1ZlY3RvcnMvVjNcIjtcclxuaW1wb3J0IHsgVGVzdE5hbWVzcGFjZSwgVGVzdFN0cnVjdHVyZXMgfSBmcm9tIFwiVGVzdC9UeXBlc1wiO1xyXG5pbXBvcnQgQWJzdHJhY3RIb3RiYXJUZXN0LCB7IFN3YXBUb0l0ZW1UZXN0Um9vdCB9IGZyb20gXCIuL0Fic3RyYWN0SG90YmFyVGVzdFwiO1xyXG5cclxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgQmFja3dhcmRTY3JvbGxUZXN0IGV4dGVuZHMgQWJzdHJhY3RIb3RiYXJUZXN0IHtcclxuICAgIHB1YmxpYyByZWFkb25seSBuYW1lc3BhY2U6IFRlc3ROYW1lc3BhY2UgPSBcImludmVudG9yeVwiO1xyXG4gICAgcHVibGljIHJlYWRvbmx5IGlkZW50aWZpZXI6IHN0cmluZyA9IFwiYmFja3dhcmRfc2Nyb2xsXCI7XHJcbiAgICBwdWJsaWMgcmVhZG9ubHkgc3RydWN0dXJlOiBUZXN0U3RydWN0dXJlcyA9IFwiZ3Jhc3NcIjtcclxuICAgIHByb3RlY3RlZCBvdmVycmlkZSByZWFkb25seSBtYXhUaWNrczogbnVtYmVyID0gMTAgKiBUaWNrc1BlclNlY29uZDtcclxuXHJcbiAgICBwcm90ZWN0ZWQgYXN5bmMgcnVuKHRlc3Q6IFRlc3QpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgICAgICBzdXBlci5ydW4odGVzdCk7XHJcblxyXG4gICAgICAgIGNvbnN0IGFpcCA9IHRoaXMuc3Bhd25BSVAodGVzdCwgbmV3IFYzKDEsIDIsIDEpLCB7IHJvb3Q6IFN3YXBUb0l0ZW1UZXN0Um9vdCB9KTtcclxuICAgICAgICBhd2FpdCB0ZXN0LmlkbGUoMSk7XHJcblxyXG4gICAgICAgIGNvbnN0IGJpZ0JyYWluID0gYWlwLmdldE1vYkNvbXBvbmVudChcIkJpZ0JyYWluQ29tcG9uZW50XCIpITtcclxuICAgICAgICBjb25zdCBob3RiYXIgPSBhaXAuZ2V0TW9iQ29tcG9uZW50KFwiVmlydHVhbEhvdGJhckNvbXBvbmVudFwiKSE7XHJcblxyXG4gICAgICAgIHRoaXMuZ2l2ZUZ1bGxHZWFyKGFpcCk7XHJcbiAgICAgICAgaG90YmFyLnVwZGF0ZVNsb3RzV2l0aEJlc3RJdGVtcygpO1xyXG5cclxuICAgICAgICAvLyBTZXQgc2VsZWN0ZWQgc2xvdCB0byAxIHNvIHRoYXQgYmFja3dhcmQgKDEgLT4gMCAtPiA3IC0+IDYpIGlzIHNob3J0ZXIgdGhhbiBmb3J3YXJkICgxIC0+IDIgLT4gMyAtPiA0IC0+IDUgLT4gNilcclxuICAgICAgICBob3RiYXIuc2V0U2VsZWN0ZWRTbG90KDEpO1xyXG5cclxuICAgICAgICBjb25zdCBzd2FwVG9JdGVtID0gYmlnQnJhaW4ucm9vdC5zdWJzdGF0ZXNbU3dhcFRvSXRlbVByb2NlZHVyZS5pZGVudGlmaWVyXSBhcyBTd2FwVG9JdGVtUHJvY2VkdXJlO1xyXG4gICAgICAgIHN3YXBUb0l0ZW0uc2V0SXRlbShuZXcgSXRlbVN0YWNrKFwibWluZWNyYWZ0OnRvcmNoXCIpKTtcclxuICAgICAgICBiaWdCcmFpbi5yb290LnNldFN1YmFkZHJlc3MoU3dhcFRvSXRlbVByb2NlZHVyZS5pZGVudGlmaWVyKTtcclxuXHJcbiAgICAgICAgdGhpcy5hc3NlcnRTY3JvbGxSb3V0ZSh0ZXN0LCBob3RiYXIsIHN3YXBUb0l0ZW0sIFsxLCAwLCA3LCA2XSk7XHJcbiAgICB9XHJcbn1cclxuIl0sIm5hbWVzIjpbIkl0ZW1TdGFjayIsIlRpY2tzUGVyU2Vjb25kIiwiU3dhcFRvSXRlbVByb2NlZHVyZSIsIlYzIiwiQWJzdHJhY3RIb3RiYXJUZXN0IiwiU3dhcFRvSXRlbVRlc3RSb290IiwiQmFja3dhcmRTY3JvbGxUZXN0IiwicnVuIiwidGVzdCIsImFpcCIsInNwYXduQUlQIiwicm9vdCIsImlkbGUiLCJiaWdCcmFpbiIsImdldE1vYkNvbXBvbmVudCIsImhvdGJhciIsImdpdmVGdWxsR2VhciIsInVwZGF0ZVNsb3RzV2l0aEJlc3RJdGVtcyIsInNldFNlbGVjdGVkU2xvdCIsInN3YXBUb0l0ZW0iLCJzdWJzdGF0ZXMiLCJpZGVudGlmaWVyIiwic2V0SXRlbSIsInNldFN1YmFkZHJlc3MiLCJhc3NlcnRTY3JvbGxSb3V0ZSIsIm5hbWVzcGFjZSIsInN0cnVjdHVyZSIsIm1heFRpY2tzIl0sIm1hcHBpbmdzIjoiQUFBQSxTQUFTQSxTQUFTLEVBQUVDLGNBQWMsUUFBUSxvQkFBb0I7QUFFOUQsU0FBU0MsbUJBQW1CLFFBQVEsMENBQTBDO0FBQzlFLE9BQU9DLFFBQVEscUJBQXFCO0FBRXBDLE9BQU9DLHNCQUFzQkMsa0JBQWtCLFFBQVEsdUJBQXVCO0FBRS9ELE1BQU1DLDJCQUEyQkY7SUFNNUMsTUFBZ0JHLElBQUlDLElBQVUsRUFBaUI7UUFDM0MsS0FBSyxDQUFDRCxJQUFJQztRQUVWLE1BQU1DLE1BQU0sSUFBSSxDQUFDQyxRQUFRLENBQUNGLE1BQU0sSUFBSUwsR0FBRyxHQUFHLEdBQUcsSUFBSTtZQUFFUSxNQUFNTjtRQUFtQjtRQUM1RSxNQUFNRyxLQUFLSSxJQUFJLENBQUM7UUFFaEIsTUFBTUMsV0FBV0osSUFBSUssZUFBZSxDQUFDO1FBQ3JDLE1BQU1DLFNBQVNOLElBQUlLLGVBQWUsQ0FBQztRQUVuQyxJQUFJLENBQUNFLFlBQVksQ0FBQ1A7UUFDbEJNLE9BQU9FLHdCQUF3QjtRQUUvQixrSEFBa0g7UUFDbEhGLE9BQU9HLGVBQWUsQ0FBQztRQUV2QixNQUFNQyxhQUFhTixTQUFTRixJQUFJLENBQUNTLFNBQVMsQ0FBQ2xCLG9CQUFvQm1CLFVBQVUsQ0FBQztRQUMxRUYsV0FBV0csT0FBTyxDQUFDLElBQUl0QixVQUFVO1FBQ2pDYSxTQUFTRixJQUFJLENBQUNZLGFBQWEsQ0FBQ3JCLG9CQUFvQm1CLFVBQVU7UUFFMUQsSUFBSSxDQUFDRyxpQkFBaUIsQ0FBQ2hCLE1BQU1PLFFBQVFJLFlBQVk7WUFBQztZQUFHO1lBQUc7WUFBRztTQUFFO0lBQ2pFOzs7YUF6QmdCTSxZQUEyQjthQUMzQkosYUFBcUI7YUFDckJLLFlBQTRCO2FBQ2hCQyxXQUFtQixLQUFLMUI7O0FBdUJ4RDtBQTNCQSxTQUFxQkssZ0NBMkJwQiJ9