import { BlockTypes, ItemStack } from "@minecraft/server";
import { MineBlockProcedure } from "BigBrain/Procedures/MineBlockProcedure";
import SwapToItemProcedureData from "Data/BigBrain/Procedures/SwapToItemProcedureData";
import VirtualInventoryComponent from "Inventory/VirtualInventoryComponent";
import AbstractMiningTest, { MineBlockTestRoot } from "./AbstractMiningTest";
class ShovelSelectionTest extends AbstractMiningTest {
    run(test) {
        super.run(test);
        const aip = test.spawn("gm1_sky:aip", {
            x: 1,
            y: 2,
            z: 1
        });
        aip.gameTestData = {
            root: MineBlockTestRoot
        };
        test.runAfterDelay(1, ()=>{
            const bigBrain = aip.getMobComponent("BigBrainComponent");
            const mineBlockProc = bigBrain.root.substates[MineBlockProcedure.identifier];
            const inv = VirtualInventoryComponent.get(aip);
            inv.setSlot(2, new ItemStack("minecraft:wooden_shovel"));
            inv.setSlot(5, new ItemStack("minecraft:iron_shovel"));
            // dirt is shovel-destructible — expect iron_shovel in mainhand
            test.setBlockType(BlockTypes.get("minecraft:dirt"), {
                x: 1,
                y: 2,
                z: 2
            });
            mineBlockProc.setBlock(test.getBlock({
                x: 1,
                y: 2,
                z: 2
            }));
            bigBrain.root.setSubaddress(MineBlockProcedure.identifier);
            // Wait for item to be selected
            const delay = SwapToItemProcedureData.DefaultWarmupDuration + 1;
            test.runAfterDelay(delay, ()=>{
                test.assert(this.holdsItemInMainhand(aip, "minecraft:iron_shovel"), "Expected iron_shovel in mainhand for dirt");
                test.setBlockType(BlockTypes.get("minecraft:air"), {
                    x: 1,
                    y: 2,
                    z: 2
                });
                test.succeed();
            });
        });
    }
    constructor(...args){
        super(...args);
        this.namespace = "mining";
        this.identifier = "tool_selection_shovel";
        this.structure = "grass";
        this.isCoreTest = true;
    }
}
export { ShovelSelectionTest as default };

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIlNob3ZlbFNlbGVjdGlvblRlc3QudHMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgQmxvY2tUeXBlcywgSXRlbVN0YWNrIH0gZnJvbSBcIkBtaW5lY3JhZnQvc2VydmVyXCI7XHJcbmltcG9ydCB7IFRlc3QgfSBmcm9tIFwiQG1pbmVjcmFmdC9zZXJ2ZXItZ2FtZXRlc3RcIjtcclxuaW1wb3J0IHsgTWluZUJsb2NrUHJvY2VkdXJlIH0gZnJvbSBcIkJpZ0JyYWluL1Byb2NlZHVyZXMvTWluZUJsb2NrUHJvY2VkdXJlXCI7XHJcbmltcG9ydCBTd2FwVG9JdGVtUHJvY2VkdXJlRGF0YSBmcm9tIFwiRGF0YS9CaWdCcmFpbi9Qcm9jZWR1cmVzL1N3YXBUb0l0ZW1Qcm9jZWR1cmVEYXRhXCI7XHJcbmltcG9ydCBWaXJ0dWFsSW52ZW50b3J5Q29tcG9uZW50IGZyb20gXCJJbnZlbnRvcnkvVmlydHVhbEludmVudG9yeUNvbXBvbmVudFwiO1xyXG5pbXBvcnQgeyBUZXN0TmFtZXNwYWNlLCBUZXN0U3RydWN0dXJlcyB9IGZyb20gXCJUZXN0L1R5cGVzXCI7XHJcbmltcG9ydCBBYnN0cmFjdE1pbmluZ1Rlc3QsIHsgTWluZUJsb2NrVGVzdFJvb3QgfSBmcm9tIFwiLi9BYnN0cmFjdE1pbmluZ1Rlc3RcIjtcclxuXHJcbmV4cG9ydCBkZWZhdWx0IGNsYXNzIFNob3ZlbFNlbGVjdGlvblRlc3QgZXh0ZW5kcyBBYnN0cmFjdE1pbmluZ1Rlc3Qge1xyXG4gICAgcHVibGljIHJlYWRvbmx5IG5hbWVzcGFjZTogVGVzdE5hbWVzcGFjZSA9IFwibWluaW5nXCI7XHJcbiAgICBwdWJsaWMgcmVhZG9ubHkgaWRlbnRpZmllcjogc3RyaW5nID0gXCJ0b29sX3NlbGVjdGlvbl9zaG92ZWxcIjtcclxuICAgIHB1YmxpYyByZWFkb25seSBzdHJ1Y3R1cmU6IFRlc3RTdHJ1Y3R1cmVzID0gXCJncmFzc1wiO1xyXG4gICAgcHJvdGVjdGVkIHJlYWRvbmx5IGlzQ29yZVRlc3Q6IGJvb2xlYW4gPSB0cnVlO1xyXG5cclxuICAgIHByb3RlY3RlZCBydW4odGVzdDogVGVzdCk6IHZvaWQge1xyXG4gICAgICAgIHN1cGVyLnJ1bih0ZXN0KTtcclxuXHJcbiAgICAgICAgY29uc3QgYWlwID0gdGVzdC5zcGF3bihcImdtMV9za3k6YWlwXCIsIHsgeDogMSwgeTogMiwgejogMSB9KTtcclxuICAgICAgICBhaXAuZ2FtZVRlc3REYXRhID0geyByb290OiBNaW5lQmxvY2tUZXN0Um9vdCB9O1xyXG5cclxuICAgICAgICB0ZXN0LnJ1bkFmdGVyRGVsYXkoMSwgKCkgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBiaWdCcmFpbiA9IGFpcC5nZXRNb2JDb21wb25lbnQoXCJCaWdCcmFpbkNvbXBvbmVudFwiKSE7XHJcbiAgICAgICAgICAgIGNvbnN0IG1pbmVCbG9ja1Byb2MgPSBiaWdCcmFpbi5yb290LnN1YnN0YXRlc1tNaW5lQmxvY2tQcm9jZWR1cmUuaWRlbnRpZmllcl0gYXMgTWluZUJsb2NrUHJvY2VkdXJlO1xyXG5cclxuICAgICAgICAgICAgY29uc3QgaW52ID0gVmlydHVhbEludmVudG9yeUNvbXBvbmVudC5nZXQoYWlwKTtcclxuICAgICAgICAgICAgaW52LnNldFNsb3QoMiwgbmV3IEl0ZW1TdGFjayhcIm1pbmVjcmFmdDp3b29kZW5fc2hvdmVsXCIpKTtcclxuICAgICAgICAgICAgaW52LnNldFNsb3QoNSwgbmV3IEl0ZW1TdGFjayhcIm1pbmVjcmFmdDppcm9uX3Nob3ZlbFwiKSk7XHJcblxyXG4gICAgICAgICAgICAvLyBkaXJ0IGlzIHNob3ZlbC1kZXN0cnVjdGlibGUg4oCUIGV4cGVjdCBpcm9uX3Nob3ZlbCBpbiBtYWluaGFuZFxyXG4gICAgICAgICAgICB0ZXN0LnNldEJsb2NrVHlwZShCbG9ja1R5cGVzLmdldChcIm1pbmVjcmFmdDpkaXJ0XCIpISwgeyB4OiAxLCB5OiAyLCB6OiAyIH0pO1xyXG4gICAgICAgICAgICBtaW5lQmxvY2tQcm9jLnNldEJsb2NrKHRlc3QuZ2V0QmxvY2soeyB4OiAxLCB5OiAyLCB6OiAyIH0pKTtcclxuICAgICAgICAgICAgYmlnQnJhaW4ucm9vdC5zZXRTdWJhZGRyZXNzKE1pbmVCbG9ja1Byb2NlZHVyZS5pZGVudGlmaWVyKTtcclxuXHJcbiAgICAgICAgICAgIC8vIFdhaXQgZm9yIGl0ZW0gdG8gYmUgc2VsZWN0ZWRcclxuICAgICAgICAgICAgY29uc3QgZGVsYXkgPSBTd2FwVG9JdGVtUHJvY2VkdXJlRGF0YS5EZWZhdWx0V2FybXVwRHVyYXRpb24gKyAxO1xyXG4gICAgICAgICAgICB0ZXN0LnJ1bkFmdGVyRGVsYXkoZGVsYXksICgpID0+IHtcclxuICAgICAgICAgICAgICAgIHRlc3QuYXNzZXJ0KHRoaXMuaG9sZHNJdGVtSW5NYWluaGFuZChhaXAsIFwibWluZWNyYWZ0Omlyb25fc2hvdmVsXCIpLCBcIkV4cGVjdGVkIGlyb25fc2hvdmVsIGluIG1haW5oYW5kIGZvciBkaXJ0XCIpO1xyXG5cclxuICAgICAgICAgICAgICAgIHRlc3Quc2V0QmxvY2tUeXBlKEJsb2NrVHlwZXMuZ2V0KFwibWluZWNyYWZ0OmFpclwiKSEsIHsgeDogMSwgeTogMiwgejogMiB9KTtcclxuICAgICAgICAgICAgICAgIHRlc3Quc3VjY2VlZCgpO1xyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICB9KTtcclxuICAgIH1cclxufVxyXG4iXSwibmFtZXMiOlsiQmxvY2tUeXBlcyIsIkl0ZW1TdGFjayIsIk1pbmVCbG9ja1Byb2NlZHVyZSIsIlN3YXBUb0l0ZW1Qcm9jZWR1cmVEYXRhIiwiVmlydHVhbEludmVudG9yeUNvbXBvbmVudCIsIkFic3RyYWN0TWluaW5nVGVzdCIsIk1pbmVCbG9ja1Rlc3RSb290IiwiU2hvdmVsU2VsZWN0aW9uVGVzdCIsInJ1biIsInRlc3QiLCJhaXAiLCJzcGF3biIsIngiLCJ5IiwieiIsImdhbWVUZXN0RGF0YSIsInJvb3QiLCJydW5BZnRlckRlbGF5IiwiYmlnQnJhaW4iLCJnZXRNb2JDb21wb25lbnQiLCJtaW5lQmxvY2tQcm9jIiwic3Vic3RhdGVzIiwiaWRlbnRpZmllciIsImludiIsImdldCIsInNldFNsb3QiLCJzZXRCbG9ja1R5cGUiLCJzZXRCbG9jayIsImdldEJsb2NrIiwic2V0U3ViYWRkcmVzcyIsImRlbGF5IiwiRGVmYXVsdFdhcm11cER1cmF0aW9uIiwiYXNzZXJ0IiwiaG9sZHNJdGVtSW5NYWluaGFuZCIsInN1Y2NlZWQiLCJuYW1lc3BhY2UiLCJzdHJ1Y3R1cmUiLCJpc0NvcmVUZXN0Il0sIm1hcHBpbmdzIjoiQUFBQSxTQUFTQSxVQUFVLEVBQUVDLFNBQVMsUUFBUSxvQkFBb0I7QUFFMUQsU0FBU0Msa0JBQWtCLFFBQVEseUNBQXlDO0FBQzVFLE9BQU9DLDZCQUE2QixtREFBbUQ7QUFDdkYsT0FBT0MsK0JBQStCLHNDQUFzQztBQUU1RSxPQUFPQyxzQkFBc0JDLGlCQUFpQixRQUFRLHVCQUF1QjtBQUU5RCxNQUFNQyw0QkFBNEJGO0lBTW5DRyxJQUFJQyxJQUFVLEVBQVE7UUFDNUIsS0FBSyxDQUFDRCxJQUFJQztRQUVWLE1BQU1DLE1BQU1ELEtBQUtFLEtBQUssQ0FBQyxlQUFlO1lBQUVDLEdBQUc7WUFBR0MsR0FBRztZQUFHQyxHQUFHO1FBQUU7UUFDekRKLElBQUlLLFlBQVksR0FBRztZQUFFQyxNQUFNVjtRQUFrQjtRQUU3Q0csS0FBS1EsYUFBYSxDQUFDLEdBQUc7WUFDbEIsTUFBTUMsV0FBV1IsSUFBSVMsZUFBZSxDQUFDO1lBQ3JDLE1BQU1DLGdCQUFnQkYsU0FBU0YsSUFBSSxDQUFDSyxTQUFTLENBQUNuQixtQkFBbUJvQixVQUFVLENBQUM7WUFFNUUsTUFBTUMsTUFBTW5CLDBCQUEwQm9CLEdBQUcsQ0FBQ2Q7WUFDMUNhLElBQUlFLE9BQU8sQ0FBQyxHQUFHLElBQUl4QixVQUFVO1lBQzdCc0IsSUFBSUUsT0FBTyxDQUFDLEdBQUcsSUFBSXhCLFVBQVU7WUFFN0IsK0RBQStEO1lBQy9EUSxLQUFLaUIsWUFBWSxDQUFDMUIsV0FBV3dCLEdBQUcsQ0FBQyxtQkFBb0I7Z0JBQUVaLEdBQUc7Z0JBQUdDLEdBQUc7Z0JBQUdDLEdBQUc7WUFBRTtZQUN4RU0sY0FBY08sUUFBUSxDQUFDbEIsS0FBS21CLFFBQVEsQ0FBQztnQkFBRWhCLEdBQUc7Z0JBQUdDLEdBQUc7Z0JBQUdDLEdBQUc7WUFBRTtZQUN4REksU0FBU0YsSUFBSSxDQUFDYSxhQUFhLENBQUMzQixtQkFBbUJvQixVQUFVO1lBRXpELCtCQUErQjtZQUMvQixNQUFNUSxRQUFRM0Isd0JBQXdCNEIscUJBQXFCLEdBQUc7WUFDOUR0QixLQUFLUSxhQUFhLENBQUNhLE9BQU87Z0JBQ3RCckIsS0FBS3VCLE1BQU0sQ0FBQyxJQUFJLENBQUNDLG1CQUFtQixDQUFDdkIsS0FBSywwQkFBMEI7Z0JBRXBFRCxLQUFLaUIsWUFBWSxDQUFDMUIsV0FBV3dCLEdBQUcsQ0FBQyxrQkFBbUI7b0JBQUVaLEdBQUc7b0JBQUdDLEdBQUc7b0JBQUdDLEdBQUc7Z0JBQUU7Z0JBQ3ZFTCxLQUFLeUIsT0FBTztZQUNoQjtRQUNKO0lBQ0o7OzthQWpDZ0JDLFlBQTJCO2FBQzNCYixhQUFxQjthQUNyQmMsWUFBNEI7YUFDekJDLGFBQXNCOztBQStCN0M7QUFuQ0EsU0FBcUI5QixpQ0FtQ3BCIn0=