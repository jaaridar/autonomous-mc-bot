import { BlockTypes, ItemStack } from "@minecraft/server";
import { MineBlockProcedure } from "BigBrain/Procedures/MineBlockProcedure";
import SwapToItemProcedureData from "Data/BigBrain/Procedures/SwapToItemProcedureData";
import VirtualInventoryComponent from "Inventory/VirtualInventoryComponent";
import AbstractMiningTest, { MineBlockTestRoot } from "./AbstractMiningTest";
class PickaxeSelectionTest extends AbstractMiningTest {
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
            inv.setSlot(0, new ItemStack("minecraft:wooden_pickaxe"));
            inv.setSlot(3, new ItemStack("minecraft:iron_pickaxe"));
            // coal_ore is pickaxe-destructible — expect iron_pickaxe in mainhand
            test.setBlockType(BlockTypes.get("minecraft:coal_ore"), {
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
                test.assert(this.holdsItemInMainhand(aip, "minecraft:iron_pickaxe"), "Expected iron_pickaxe in mainhand for coal_ore");
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
        this.identifier = "tool_selection_pickaxe";
        this.structure = "grass";
        this.isCoreTest = true;
    }
}
export { PickaxeSelectionTest as default };

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIlBpY2theGVTZWxlY3Rpb25UZXN0LnRzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEJsb2NrVHlwZXMsIEl0ZW1TdGFjayB9IGZyb20gXCJAbWluZWNyYWZ0L3NlcnZlclwiO1xyXG5pbXBvcnQgeyBUZXN0IH0gZnJvbSBcIkBtaW5lY3JhZnQvc2VydmVyLWdhbWV0ZXN0XCI7XHJcbmltcG9ydCB7IE1pbmVCbG9ja1Byb2NlZHVyZSB9IGZyb20gXCJCaWdCcmFpbi9Qcm9jZWR1cmVzL01pbmVCbG9ja1Byb2NlZHVyZVwiO1xyXG5pbXBvcnQgU3dhcFRvSXRlbVByb2NlZHVyZURhdGEgZnJvbSBcIkRhdGEvQmlnQnJhaW4vUHJvY2VkdXJlcy9Td2FwVG9JdGVtUHJvY2VkdXJlRGF0YVwiO1xyXG5pbXBvcnQgVmlydHVhbEludmVudG9yeUNvbXBvbmVudCBmcm9tIFwiSW52ZW50b3J5L1ZpcnR1YWxJbnZlbnRvcnlDb21wb25lbnRcIjtcclxuaW1wb3J0IHsgVGVzdE5hbWVzcGFjZSwgVGVzdFN0cnVjdHVyZXMgfSBmcm9tIFwiVGVzdC9UeXBlc1wiO1xyXG5pbXBvcnQgQWJzdHJhY3RNaW5pbmdUZXN0LCB7IE1pbmVCbG9ja1Rlc3RSb290IH0gZnJvbSBcIi4vQWJzdHJhY3RNaW5pbmdUZXN0XCI7XHJcblxyXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBQaWNrYXhlU2VsZWN0aW9uVGVzdCBleHRlbmRzIEFic3RyYWN0TWluaW5nVGVzdCB7XHJcbiAgICBwdWJsaWMgcmVhZG9ubHkgbmFtZXNwYWNlOiBUZXN0TmFtZXNwYWNlID0gXCJtaW5pbmdcIjtcclxuICAgIHB1YmxpYyByZWFkb25seSBpZGVudGlmaWVyOiBzdHJpbmcgPSBcInRvb2xfc2VsZWN0aW9uX3BpY2theGVcIjtcclxuICAgIHB1YmxpYyByZWFkb25seSBzdHJ1Y3R1cmU6IFRlc3RTdHJ1Y3R1cmVzID0gXCJncmFzc1wiO1xyXG4gICAgcHJvdGVjdGVkIHJlYWRvbmx5IGlzQ29yZVRlc3Q6IGJvb2xlYW4gPSB0cnVlO1xyXG5cclxuICAgIHByb3RlY3RlZCBydW4odGVzdDogVGVzdCk6IHZvaWQge1xyXG4gICAgICAgIHN1cGVyLnJ1bih0ZXN0KTtcclxuXHJcbiAgICAgICAgY29uc3QgYWlwID0gdGVzdC5zcGF3bihcImdtMV9za3k6YWlwXCIsIHsgeDogMSwgeTogMiwgejogMSB9KTtcclxuICAgICAgICBhaXAuZ2FtZVRlc3REYXRhID0geyByb290OiBNaW5lQmxvY2tUZXN0Um9vdCB9O1xyXG5cclxuICAgICAgICB0ZXN0LnJ1bkFmdGVyRGVsYXkoMSwgKCkgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBiaWdCcmFpbiA9IGFpcC5nZXRNb2JDb21wb25lbnQoXCJCaWdCcmFpbkNvbXBvbmVudFwiKSE7XHJcbiAgICAgICAgICAgIGNvbnN0IG1pbmVCbG9ja1Byb2MgPSBiaWdCcmFpbi5yb290LnN1YnN0YXRlc1tNaW5lQmxvY2tQcm9jZWR1cmUuaWRlbnRpZmllcl0gYXMgTWluZUJsb2NrUHJvY2VkdXJlO1xyXG5cclxuICAgICAgICAgICAgY29uc3QgaW52ID0gVmlydHVhbEludmVudG9yeUNvbXBvbmVudC5nZXQoYWlwKTtcclxuICAgICAgICAgICAgaW52LnNldFNsb3QoMCwgbmV3IEl0ZW1TdGFjayhcIm1pbmVjcmFmdDp3b29kZW5fcGlja2F4ZVwiKSk7XHJcbiAgICAgICAgICAgIGludi5zZXRTbG90KDMsIG5ldyBJdGVtU3RhY2soXCJtaW5lY3JhZnQ6aXJvbl9waWNrYXhlXCIpKTtcclxuXHJcbiAgICAgICAgICAgIC8vIGNvYWxfb3JlIGlzIHBpY2theGUtZGVzdHJ1Y3RpYmxlIOKAlCBleHBlY3QgaXJvbl9waWNrYXhlIGluIG1haW5oYW5kXHJcbiAgICAgICAgICAgIHRlc3Quc2V0QmxvY2tUeXBlKEJsb2NrVHlwZXMuZ2V0KFwibWluZWNyYWZ0OmNvYWxfb3JlXCIpISwgeyB4OiAxLCB5OiAyLCB6OiAyIH0pO1xyXG4gICAgICAgICAgICBtaW5lQmxvY2tQcm9jLnNldEJsb2NrKHRlc3QuZ2V0QmxvY2soeyB4OiAxLCB5OiAyLCB6OiAyIH0pKTtcclxuICAgICAgICAgICAgYmlnQnJhaW4ucm9vdC5zZXRTdWJhZGRyZXNzKE1pbmVCbG9ja1Byb2NlZHVyZS5pZGVudGlmaWVyKTtcclxuXHJcbiAgICAgICAgICAgIC8vIFdhaXQgZm9yIGl0ZW0gdG8gYmUgc2VsZWN0ZWRcclxuICAgICAgICAgICAgY29uc3QgZGVsYXkgPSBTd2FwVG9JdGVtUHJvY2VkdXJlRGF0YS5EZWZhdWx0V2FybXVwRHVyYXRpb24gKyAxO1xyXG4gICAgICAgICAgICB0ZXN0LnJ1bkFmdGVyRGVsYXkoZGVsYXksICgpID0+IHtcclxuICAgICAgICAgICAgICAgIHRlc3QuYXNzZXJ0KHRoaXMuaG9sZHNJdGVtSW5NYWluaGFuZChhaXAsIFwibWluZWNyYWZ0Omlyb25fcGlja2F4ZVwiKSwgXCJFeHBlY3RlZCBpcm9uX3BpY2theGUgaW4gbWFpbmhhbmQgZm9yIGNvYWxfb3JlXCIpO1xyXG5cclxuICAgICAgICAgICAgICAgIHRlc3Quc2V0QmxvY2tUeXBlKEJsb2NrVHlwZXMuZ2V0KFwibWluZWNyYWZ0OmFpclwiKSEsIHsgeDogMSwgeTogMiwgejogMiB9KTtcclxuICAgICAgICAgICAgICAgIHRlc3Quc3VjY2VlZCgpO1xyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICB9KTtcclxuICAgIH1cclxufVxyXG4iXSwibmFtZXMiOlsiQmxvY2tUeXBlcyIsIkl0ZW1TdGFjayIsIk1pbmVCbG9ja1Byb2NlZHVyZSIsIlN3YXBUb0l0ZW1Qcm9jZWR1cmVEYXRhIiwiVmlydHVhbEludmVudG9yeUNvbXBvbmVudCIsIkFic3RyYWN0TWluaW5nVGVzdCIsIk1pbmVCbG9ja1Rlc3RSb290IiwiUGlja2F4ZVNlbGVjdGlvblRlc3QiLCJydW4iLCJ0ZXN0IiwiYWlwIiwic3Bhd24iLCJ4IiwieSIsInoiLCJnYW1lVGVzdERhdGEiLCJyb290IiwicnVuQWZ0ZXJEZWxheSIsImJpZ0JyYWluIiwiZ2V0TW9iQ29tcG9uZW50IiwibWluZUJsb2NrUHJvYyIsInN1YnN0YXRlcyIsImlkZW50aWZpZXIiLCJpbnYiLCJnZXQiLCJzZXRTbG90Iiwic2V0QmxvY2tUeXBlIiwic2V0QmxvY2siLCJnZXRCbG9jayIsInNldFN1YmFkZHJlc3MiLCJkZWxheSIsIkRlZmF1bHRXYXJtdXBEdXJhdGlvbiIsImFzc2VydCIsImhvbGRzSXRlbUluTWFpbmhhbmQiLCJzdWNjZWVkIiwibmFtZXNwYWNlIiwic3RydWN0dXJlIiwiaXNDb3JlVGVzdCJdLCJtYXBwaW5ncyI6IkFBQUEsU0FBU0EsVUFBVSxFQUFFQyxTQUFTLFFBQVEsb0JBQW9CO0FBRTFELFNBQVNDLGtCQUFrQixRQUFRLHlDQUF5QztBQUM1RSxPQUFPQyw2QkFBNkIsbURBQW1EO0FBQ3ZGLE9BQU9DLCtCQUErQixzQ0FBc0M7QUFFNUUsT0FBT0Msc0JBQXNCQyxpQkFBaUIsUUFBUSx1QkFBdUI7QUFFOUQsTUFBTUMsNkJBQTZCRjtJQU1wQ0csSUFBSUMsSUFBVSxFQUFRO1FBQzVCLEtBQUssQ0FBQ0QsSUFBSUM7UUFFVixNQUFNQyxNQUFNRCxLQUFLRSxLQUFLLENBQUMsZUFBZTtZQUFFQyxHQUFHO1lBQUdDLEdBQUc7WUFBR0MsR0FBRztRQUFFO1FBQ3pESixJQUFJSyxZQUFZLEdBQUc7WUFBRUMsTUFBTVY7UUFBa0I7UUFFN0NHLEtBQUtRLGFBQWEsQ0FBQyxHQUFHO1lBQ2xCLE1BQU1DLFdBQVdSLElBQUlTLGVBQWUsQ0FBQztZQUNyQyxNQUFNQyxnQkFBZ0JGLFNBQVNGLElBQUksQ0FBQ0ssU0FBUyxDQUFDbkIsbUJBQW1Cb0IsVUFBVSxDQUFDO1lBRTVFLE1BQU1DLE1BQU1uQiwwQkFBMEJvQixHQUFHLENBQUNkO1lBQzFDYSxJQUFJRSxPQUFPLENBQUMsR0FBRyxJQUFJeEIsVUFBVTtZQUM3QnNCLElBQUlFLE9BQU8sQ0FBQyxHQUFHLElBQUl4QixVQUFVO1lBRTdCLHFFQUFxRTtZQUNyRVEsS0FBS2lCLFlBQVksQ0FBQzFCLFdBQVd3QixHQUFHLENBQUMsdUJBQXdCO2dCQUFFWixHQUFHO2dCQUFHQyxHQUFHO2dCQUFHQyxHQUFHO1lBQUU7WUFDNUVNLGNBQWNPLFFBQVEsQ0FBQ2xCLEtBQUttQixRQUFRLENBQUM7Z0JBQUVoQixHQUFHO2dCQUFHQyxHQUFHO2dCQUFHQyxHQUFHO1lBQUU7WUFDeERJLFNBQVNGLElBQUksQ0FBQ2EsYUFBYSxDQUFDM0IsbUJBQW1Cb0IsVUFBVTtZQUV6RCwrQkFBK0I7WUFDL0IsTUFBTVEsUUFBUTNCLHdCQUF3QjRCLHFCQUFxQixHQUFHO1lBQzlEdEIsS0FBS1EsYUFBYSxDQUFDYSxPQUFPO2dCQUN0QnJCLEtBQUt1QixNQUFNLENBQUMsSUFBSSxDQUFDQyxtQkFBbUIsQ0FBQ3ZCLEtBQUssMkJBQTJCO2dCQUVyRUQsS0FBS2lCLFlBQVksQ0FBQzFCLFdBQVd3QixHQUFHLENBQUMsa0JBQW1CO29CQUFFWixHQUFHO29CQUFHQyxHQUFHO29CQUFHQyxHQUFHO2dCQUFFO2dCQUN2RUwsS0FBS3lCLE9BQU87WUFDaEI7UUFDSjtJQUNKOzs7YUFqQ2dCQyxZQUEyQjthQUMzQmIsYUFBcUI7YUFDckJjLFlBQTRCO2FBQ3pCQyxhQUFzQjs7QUErQjdDO0FBbkNBLFNBQXFCOUIsa0NBbUNwQiJ9