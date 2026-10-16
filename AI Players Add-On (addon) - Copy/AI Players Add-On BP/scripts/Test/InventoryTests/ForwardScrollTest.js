import { ItemStack, TicksPerSecond } from "@minecraft/server";
import { SwapToItemProcedure } from "BigBrain/Procedures/SwapToItemProcedure";
import V3 from "Helpers/Vectors/V3";
import AbstractHotbarTest, { SwapToItemTestRoot } from "./AbstractHotbarTest";
class ForwardScrollTest extends AbstractHotbarTest {
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
        // Set selected slot to 6 so that forward (6 -> 7 -> 0 -> 1) is shorter than backward (6 -> 5 -> 4 -> 3 -> 2 -> 1)
        hotbar.setSelectedSlot(6);
        const swapToItem = bigBrain.root.substates[SwapToItemProcedure.identifier];
        swapToItem.setItem(new ItemStack("minecraft:iron_sword"));
        bigBrain.root.setSubaddress(SwapToItemProcedure.identifier);
        this.assertScrollRoute(test, hotbar, swapToItem, [
            6,
            7,
            0,
            1
        ]);
    }
    constructor(...args){
        super(...args);
        this.namespace = "inventory";
        this.identifier = "forward_scroll";
        this.isCoreTest = true;
        this.maxTicks = 10 * TicksPerSecond;
    }
}
export { ForwardScrollTest as default };

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkZvcndhcmRTY3JvbGxUZXN0LnRzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEl0ZW1TdGFjaywgVGlja3NQZXJTZWNvbmQgfSBmcm9tIFwiQG1pbmVjcmFmdC9zZXJ2ZXJcIjtcclxuaW1wb3J0IHsgVGVzdCB9IGZyb20gXCJAbWluZWNyYWZ0L3NlcnZlci1nYW1ldGVzdFwiO1xyXG5pbXBvcnQgeyBTd2FwVG9JdGVtUHJvY2VkdXJlIH0gZnJvbSBcIkJpZ0JyYWluL1Byb2NlZHVyZXMvU3dhcFRvSXRlbVByb2NlZHVyZVwiO1xyXG5pbXBvcnQgVjMgZnJvbSBcIkhlbHBlcnMvVmVjdG9ycy9WM1wiO1xyXG5pbXBvcnQgeyBUZXN0TmFtZXNwYWNlIH0gZnJvbSBcIlRlc3QvVHlwZXNcIjtcclxuaW1wb3J0IEFic3RyYWN0SG90YmFyVGVzdCwgeyBTd2FwVG9JdGVtVGVzdFJvb3QgfSBmcm9tIFwiLi9BYnN0cmFjdEhvdGJhclRlc3RcIjtcclxuXHJcbmV4cG9ydCBkZWZhdWx0IGNsYXNzIEZvcndhcmRTY3JvbGxUZXN0IGV4dGVuZHMgQWJzdHJhY3RIb3RiYXJUZXN0IHtcclxuICAgIHB1YmxpYyByZWFkb25seSBuYW1lc3BhY2U6IFRlc3ROYW1lc3BhY2UgPSBcImludmVudG9yeVwiO1xyXG4gICAgcHVibGljIHJlYWRvbmx5IGlkZW50aWZpZXI6IHN0cmluZyA9IFwiZm9yd2FyZF9zY3JvbGxcIjtcclxuICAgIHB1YmxpYyByZWFkb25seSBpc0NvcmVUZXN0OiBib29sZWFuID0gdHJ1ZTtcclxuXHJcbiAgICBwcm90ZWN0ZWQgb3ZlcnJpZGUgcmVhZG9ubHkgbWF4VGlja3M6IG51bWJlciA9IDEwICogVGlja3NQZXJTZWNvbmQ7XHJcblxyXG4gICAgcHJvdGVjdGVkIGFzeW5jIHJ1bih0ZXN0OiBUZXN0KTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICAgICAgc3VwZXIucnVuKHRlc3QpO1xyXG5cclxuICAgICAgICBjb25zdCBhaXAgPSB0aGlzLnNwYXduQUlQKHRlc3QsIG5ldyBWMygxLCAyLCAxKSwgeyByb290OiBTd2FwVG9JdGVtVGVzdFJvb3QgfSk7XHJcbiAgICAgICAgYXdhaXQgdGVzdC5pZGxlKDEpO1xyXG5cclxuICAgICAgICBjb25zdCBiaWdCcmFpbiA9IGFpcC5nZXRNb2JDb21wb25lbnQoXCJCaWdCcmFpbkNvbXBvbmVudFwiKSE7XHJcbiAgICAgICAgY29uc3QgaG90YmFyID0gYWlwLmdldE1vYkNvbXBvbmVudChcIlZpcnR1YWxIb3RiYXJDb21wb25lbnRcIikhO1xyXG5cclxuICAgICAgICB0aGlzLmdpdmVGdWxsR2VhcihhaXApO1xyXG4gICAgICAgIGhvdGJhci51cGRhdGVTbG90c1dpdGhCZXN0SXRlbXMoKTtcclxuXHJcbiAgICAgICAgLy8gU2V0IHNlbGVjdGVkIHNsb3QgdG8gNiBzbyB0aGF0IGZvcndhcmQgKDYgLT4gNyAtPiAwIC0+IDEpIGlzIHNob3J0ZXIgdGhhbiBiYWNrd2FyZCAoNiAtPiA1IC0+IDQgLT4gMyAtPiAyIC0+IDEpXHJcbiAgICAgICAgaG90YmFyLnNldFNlbGVjdGVkU2xvdCg2KTtcclxuXHJcbiAgICAgICAgY29uc3Qgc3dhcFRvSXRlbSA9IGJpZ0JyYWluLnJvb3Quc3Vic3RhdGVzW1N3YXBUb0l0ZW1Qcm9jZWR1cmUuaWRlbnRpZmllcl0gYXMgU3dhcFRvSXRlbVByb2NlZHVyZTtcclxuICAgICAgICBzd2FwVG9JdGVtLnNldEl0ZW0obmV3IEl0ZW1TdGFjayhcIm1pbmVjcmFmdDppcm9uX3N3b3JkXCIpKTtcclxuICAgICAgICBiaWdCcmFpbi5yb290LnNldFN1YmFkZHJlc3MoU3dhcFRvSXRlbVByb2NlZHVyZS5pZGVudGlmaWVyKTtcclxuXHJcbiAgICAgICAgdGhpcy5hc3NlcnRTY3JvbGxSb3V0ZSh0ZXN0LCBob3RiYXIsIHN3YXBUb0l0ZW0sIFs2LCA3LCAwLCAxXSk7XHJcbiAgICB9XHJcbn1cclxuIl0sIm5hbWVzIjpbIkl0ZW1TdGFjayIsIlRpY2tzUGVyU2Vjb25kIiwiU3dhcFRvSXRlbVByb2NlZHVyZSIsIlYzIiwiQWJzdHJhY3RIb3RiYXJUZXN0IiwiU3dhcFRvSXRlbVRlc3RSb290IiwiRm9yd2FyZFNjcm9sbFRlc3QiLCJydW4iLCJ0ZXN0IiwiYWlwIiwic3Bhd25BSVAiLCJyb290IiwiaWRsZSIsImJpZ0JyYWluIiwiZ2V0TW9iQ29tcG9uZW50IiwiaG90YmFyIiwiZ2l2ZUZ1bGxHZWFyIiwidXBkYXRlU2xvdHNXaXRoQmVzdEl0ZW1zIiwic2V0U2VsZWN0ZWRTbG90Iiwic3dhcFRvSXRlbSIsInN1YnN0YXRlcyIsImlkZW50aWZpZXIiLCJzZXRJdGVtIiwic2V0U3ViYWRkcmVzcyIsImFzc2VydFNjcm9sbFJvdXRlIiwibmFtZXNwYWNlIiwiaXNDb3JlVGVzdCIsIm1heFRpY2tzIl0sIm1hcHBpbmdzIjoiQUFBQSxTQUFTQSxTQUFTLEVBQUVDLGNBQWMsUUFBUSxvQkFBb0I7QUFFOUQsU0FBU0MsbUJBQW1CLFFBQVEsMENBQTBDO0FBQzlFLE9BQU9DLFFBQVEscUJBQXFCO0FBRXBDLE9BQU9DLHNCQUFzQkMsa0JBQWtCLFFBQVEsdUJBQXVCO0FBRS9ELE1BQU1DLDBCQUEwQkY7SUFPM0MsTUFBZ0JHLElBQUlDLElBQVUsRUFBaUI7UUFDM0MsS0FBSyxDQUFDRCxJQUFJQztRQUVWLE1BQU1DLE1BQU0sSUFBSSxDQUFDQyxRQUFRLENBQUNGLE1BQU0sSUFBSUwsR0FBRyxHQUFHLEdBQUcsSUFBSTtZQUFFUSxNQUFNTjtRQUFtQjtRQUM1RSxNQUFNRyxLQUFLSSxJQUFJLENBQUM7UUFFaEIsTUFBTUMsV0FBV0osSUFBSUssZUFBZSxDQUFDO1FBQ3JDLE1BQU1DLFNBQVNOLElBQUlLLGVBQWUsQ0FBQztRQUVuQyxJQUFJLENBQUNFLFlBQVksQ0FBQ1A7UUFDbEJNLE9BQU9FLHdCQUF3QjtRQUUvQixrSEFBa0g7UUFDbEhGLE9BQU9HLGVBQWUsQ0FBQztRQUV2QixNQUFNQyxhQUFhTixTQUFTRixJQUFJLENBQUNTLFNBQVMsQ0FBQ2xCLG9CQUFvQm1CLFVBQVUsQ0FBQztRQUMxRUYsV0FBV0csT0FBTyxDQUFDLElBQUl0QixVQUFVO1FBQ2pDYSxTQUFTRixJQUFJLENBQUNZLGFBQWEsQ0FBQ3JCLG9CQUFvQm1CLFVBQVU7UUFFMUQsSUFBSSxDQUFDRyxpQkFBaUIsQ0FBQ2hCLE1BQU1PLFFBQVFJLFlBQVk7WUFBQztZQUFHO1lBQUc7WUFBRztTQUFFO0lBQ2pFOzs7YUExQmdCTSxZQUEyQjthQUMzQkosYUFBcUI7YUFDckJLLGFBQXNCO2FBRVZDLFdBQW1CLEtBQUsxQjs7QUF1QnhEO0FBNUJBLFNBQXFCSywrQkE0QnBCIn0=