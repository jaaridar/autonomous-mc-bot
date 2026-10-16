import { BlockTypes, ItemStack, ItemTypes, TicksPerSecond } from "@minecraft/server";
import { MineBlockProcedure } from "BigBrain/Procedures/MineBlockProcedure";
import VirtualInventoryComponent from "Inventory/VirtualInventoryComponent";
import AbstractMiningTest, { MineBlockTestRoot } from "./AbstractMiningTest";
class BlockDropFailureTest extends AbstractMiningTest {
    run(test) {
        super.run(test);
        // Spawn the AIP
        const aip = test.spawn("gm1_sky:aip", {
            x: 1,
            y: 2,
            z: 1
        });
        aip.gameTestData = {
            root: MineBlockTestRoot
        };
        // Wait a tick for BigBrainComponent to initialize with MineBlockTestRoot
        test.runAfterDelay(1, ()=>{
            const bigBrain = aip.getMobComponent("BigBrainComponent");
            // Give the AIP inventory items
            VirtualInventoryComponent.get(aip).setSlot(0, new ItemStack("minecraft:wooden_pickaxe"));
            // Place an iron ore block for the AIP to mine
            test.setBlockType(BlockTypes.get("minecraft:iron_ore"), {
                x: 1,
                y: 3,
                z: 2
            });
            const ironOre = test.getBlock({
                x: 1,
                y: 3,
                z: 2
            });
            // Enter the MineBlockProcedure with the iron ore block set as the target
            const mineBlockProc = bigBrain.root.substates[MineBlockProcedure.identifier];
            mineBlockProc.setBlock(ironOre);
            bigBrain.root.setSubaddress(MineBlockProcedure.identifier);
            // Poll each tick until the AIP has mined the block
            test.succeedWhen(()=>{
                test.assertBlockPresent(BlockTypes.get("minecraft:iron_ore"), {
                    x: 1,
                    y: 3,
                    z: 2
                }, false);
                test.assertItemEntityPresent(ItemTypes.get("minecraft:raw_iron"), {
                    x: 1,
                    y: 3,
                    z: 2
                }, 1, false);
            });
        });
    }
    constructor(...args){
        super(...args);
        this.namespace = "mining";
        this.identifier = "block_drop_failure";
        this.structure = "grass";
        this.maxTicks = 10 * TicksPerSecond;
        this.isCoreTest = true;
    }
}
export { BlockDropFailureTest as default };

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkJsb2NrRHJvcEZhaWx1cmVUZXN0LnRzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEJsb2NrVHlwZXMsIEl0ZW1TdGFjaywgSXRlbVR5cGVzLCBUaWNrc1BlclNlY29uZCB9IGZyb20gXCJAbWluZWNyYWZ0L3NlcnZlclwiO1xyXG5pbXBvcnQgeyBUZXN0IH0gZnJvbSBcIkBtaW5lY3JhZnQvc2VydmVyLWdhbWV0ZXN0XCI7XHJcbmltcG9ydCB7IE1pbmVCbG9ja1Byb2NlZHVyZSB9IGZyb20gXCJCaWdCcmFpbi9Qcm9jZWR1cmVzL01pbmVCbG9ja1Byb2NlZHVyZVwiO1xyXG5pbXBvcnQgVmlydHVhbEludmVudG9yeUNvbXBvbmVudCBmcm9tIFwiSW52ZW50b3J5L1ZpcnR1YWxJbnZlbnRvcnlDb21wb25lbnRcIjtcclxuaW1wb3J0IHsgVGVzdE5hbWVzcGFjZSwgVGVzdFN0cnVjdHVyZXMgfSBmcm9tIFwiVGVzdC9UeXBlc1wiO1xyXG5pbXBvcnQgQWJzdHJhY3RNaW5pbmdUZXN0LCB7IE1pbmVCbG9ja1Rlc3RSb290IH0gZnJvbSBcIi4vQWJzdHJhY3RNaW5pbmdUZXN0XCI7XHJcblxyXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBCbG9ja0Ryb3BGYWlsdXJlVGVzdCBleHRlbmRzIEFic3RyYWN0TWluaW5nVGVzdCB7XHJcbiAgICBwdWJsaWMgcmVhZG9ubHkgbmFtZXNwYWNlOiBUZXN0TmFtZXNwYWNlID0gXCJtaW5pbmdcIjtcclxuICAgIHB1YmxpYyByZWFkb25seSBpZGVudGlmaWVyOiBzdHJpbmcgPSBcImJsb2NrX2Ryb3BfZmFpbHVyZVwiO1xyXG4gICAgcHVibGljIHJlYWRvbmx5IHN0cnVjdHVyZTogVGVzdFN0cnVjdHVyZXMgPSBcImdyYXNzXCI7XHJcbiAgICBwcm90ZWN0ZWQgb3ZlcnJpZGUgcmVhZG9ubHkgbWF4VGlja3M6IG51bWJlciA9IDEwICogVGlja3NQZXJTZWNvbmQ7XHJcbiAgICBwcm90ZWN0ZWQgcmVhZG9ubHkgaXNDb3JlVGVzdDogYm9vbGVhbiA9IHRydWU7XHJcblxyXG4gICAgcHJvdGVjdGVkIHJ1bih0ZXN0OiBUZXN0KTogdm9pZCB7XHJcbiAgICAgICAgc3VwZXIucnVuKHRlc3QpO1xyXG5cclxuICAgICAgICAvLyBTcGF3biB0aGUgQUlQXHJcbiAgICAgICAgY29uc3QgYWlwID0gdGVzdC5zcGF3bihcImdtMV9za3k6YWlwXCIsIHsgeDogMSwgeTogMiwgejogMSB9KTtcclxuICAgICAgICBhaXAuZ2FtZVRlc3REYXRhID0geyByb290OiBNaW5lQmxvY2tUZXN0Um9vdCB9O1xyXG5cclxuICAgICAgICAvLyBXYWl0IGEgdGljayBmb3IgQmlnQnJhaW5Db21wb25lbnQgdG8gaW5pdGlhbGl6ZSB3aXRoIE1pbmVCbG9ja1Rlc3RSb290XHJcbiAgICAgICAgdGVzdC5ydW5BZnRlckRlbGF5KDEsICgpID0+IHtcclxuICAgICAgICAgICAgY29uc3QgYmlnQnJhaW4gPSBhaXAuZ2V0TW9iQ29tcG9uZW50KFwiQmlnQnJhaW5Db21wb25lbnRcIikhO1xyXG5cclxuICAgICAgICAgICAgLy8gR2l2ZSB0aGUgQUlQIGludmVudG9yeSBpdGVtc1xyXG4gICAgICAgICAgICBWaXJ0dWFsSW52ZW50b3J5Q29tcG9uZW50LmdldChhaXApLnNldFNsb3QoMCwgbmV3IEl0ZW1TdGFjayhcIm1pbmVjcmFmdDp3b29kZW5fcGlja2F4ZVwiKSk7XHJcblxyXG4gICAgICAgICAgICAvLyBQbGFjZSBhbiBpcm9uIG9yZSBibG9jayBmb3IgdGhlIEFJUCB0byBtaW5lXHJcbiAgICAgICAgICAgIHRlc3Quc2V0QmxvY2tUeXBlKEJsb2NrVHlwZXMuZ2V0KFwibWluZWNyYWZ0Omlyb25fb3JlXCIpISwgeyB4OiAxLCB5OiAzLCB6OiAyIH0pO1xyXG4gICAgICAgICAgICBjb25zdCBpcm9uT3JlID0gdGVzdC5nZXRCbG9jayh7IHg6IDEsIHk6IDMsIHo6IDIgfSk7XHJcblxyXG4gICAgICAgICAgICAvLyBFbnRlciB0aGUgTWluZUJsb2NrUHJvY2VkdXJlIHdpdGggdGhlIGlyb24gb3JlIGJsb2NrIHNldCBhcyB0aGUgdGFyZ2V0XHJcbiAgICAgICAgICAgIGNvbnN0IG1pbmVCbG9ja1Byb2MgPSBiaWdCcmFpbi5yb290LnN1YnN0YXRlc1tNaW5lQmxvY2tQcm9jZWR1cmUuaWRlbnRpZmllcl0gYXMgTWluZUJsb2NrUHJvY2VkdXJlO1xyXG4gICAgICAgICAgICBtaW5lQmxvY2tQcm9jLnNldEJsb2NrKGlyb25PcmUpO1xyXG4gICAgICAgICAgICBiaWdCcmFpbi5yb290LnNldFN1YmFkZHJlc3MoTWluZUJsb2NrUHJvY2VkdXJlLmlkZW50aWZpZXIpO1xyXG5cclxuICAgICAgICAgICAgLy8gUG9sbCBlYWNoIHRpY2sgdW50aWwgdGhlIEFJUCBoYXMgbWluZWQgdGhlIGJsb2NrXHJcbiAgICAgICAgICAgIHRlc3Quc3VjY2VlZFdoZW4oKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgdGVzdC5hc3NlcnRCbG9ja1ByZXNlbnQoQmxvY2tUeXBlcy5nZXQoXCJtaW5lY3JhZnQ6aXJvbl9vcmVcIikhLCB7IHg6IDEsIHk6IDMsIHo6IDIgfSwgZmFsc2UpO1xyXG4gICAgICAgICAgICAgICAgdGVzdC5hc3NlcnRJdGVtRW50aXR5UHJlc2VudChJdGVtVHlwZXMuZ2V0KFwibWluZWNyYWZ0OnJhd19pcm9uXCIpISwgeyB4OiAxLCB5OiAzLCB6OiAyIH0sIDEsIGZhbHNlKTtcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcbn1cclxuIl0sIm5hbWVzIjpbIkJsb2NrVHlwZXMiLCJJdGVtU3RhY2siLCJJdGVtVHlwZXMiLCJUaWNrc1BlclNlY29uZCIsIk1pbmVCbG9ja1Byb2NlZHVyZSIsIlZpcnR1YWxJbnZlbnRvcnlDb21wb25lbnQiLCJBYnN0cmFjdE1pbmluZ1Rlc3QiLCJNaW5lQmxvY2tUZXN0Um9vdCIsIkJsb2NrRHJvcEZhaWx1cmVUZXN0IiwicnVuIiwidGVzdCIsImFpcCIsInNwYXduIiwieCIsInkiLCJ6IiwiZ2FtZVRlc3REYXRhIiwicm9vdCIsInJ1bkFmdGVyRGVsYXkiLCJiaWdCcmFpbiIsImdldE1vYkNvbXBvbmVudCIsImdldCIsInNldFNsb3QiLCJzZXRCbG9ja1R5cGUiLCJpcm9uT3JlIiwiZ2V0QmxvY2siLCJtaW5lQmxvY2tQcm9jIiwic3Vic3RhdGVzIiwiaWRlbnRpZmllciIsInNldEJsb2NrIiwic2V0U3ViYWRkcmVzcyIsInN1Y2NlZWRXaGVuIiwiYXNzZXJ0QmxvY2tQcmVzZW50IiwiYXNzZXJ0SXRlbUVudGl0eVByZXNlbnQiLCJuYW1lc3BhY2UiLCJzdHJ1Y3R1cmUiLCJtYXhUaWNrcyIsImlzQ29yZVRlc3QiXSwibWFwcGluZ3MiOiJBQUFBLFNBQVNBLFVBQVUsRUFBRUMsU0FBUyxFQUFFQyxTQUFTLEVBQUVDLGNBQWMsUUFBUSxvQkFBb0I7QUFFckYsU0FBU0Msa0JBQWtCLFFBQVEseUNBQXlDO0FBQzVFLE9BQU9DLCtCQUErQixzQ0FBc0M7QUFFNUUsT0FBT0Msc0JBQXNCQyxpQkFBaUIsUUFBUSx1QkFBdUI7QUFFOUQsTUFBTUMsNkJBQTZCRjtJQU9wQ0csSUFBSUMsSUFBVSxFQUFRO1FBQzVCLEtBQUssQ0FBQ0QsSUFBSUM7UUFFVixnQkFBZ0I7UUFDaEIsTUFBTUMsTUFBTUQsS0FBS0UsS0FBSyxDQUFDLGVBQWU7WUFBRUMsR0FBRztZQUFHQyxHQUFHO1lBQUdDLEdBQUc7UUFBRTtRQUN6REosSUFBSUssWUFBWSxHQUFHO1lBQUVDLE1BQU1WO1FBQWtCO1FBRTdDLHlFQUF5RTtRQUN6RUcsS0FBS1EsYUFBYSxDQUFDLEdBQUc7WUFDbEIsTUFBTUMsV0FBV1IsSUFBSVMsZUFBZSxDQUFDO1lBRXJDLCtCQUErQjtZQUMvQmYsMEJBQTBCZ0IsR0FBRyxDQUFDVixLQUFLVyxPQUFPLENBQUMsR0FBRyxJQUFJckIsVUFBVTtZQUU1RCw4Q0FBOEM7WUFDOUNTLEtBQUthLFlBQVksQ0FBQ3ZCLFdBQVdxQixHQUFHLENBQUMsdUJBQXdCO2dCQUFFUixHQUFHO2dCQUFHQyxHQUFHO2dCQUFHQyxHQUFHO1lBQUU7WUFDNUUsTUFBTVMsVUFBVWQsS0FBS2UsUUFBUSxDQUFDO2dCQUFFWixHQUFHO2dCQUFHQyxHQUFHO2dCQUFHQyxHQUFHO1lBQUU7WUFFakQseUVBQXlFO1lBQ3pFLE1BQU1XLGdCQUFnQlAsU0FBU0YsSUFBSSxDQUFDVSxTQUFTLENBQUN2QixtQkFBbUJ3QixVQUFVLENBQUM7WUFDNUVGLGNBQWNHLFFBQVEsQ0FBQ0w7WUFDdkJMLFNBQVNGLElBQUksQ0FBQ2EsYUFBYSxDQUFDMUIsbUJBQW1Cd0IsVUFBVTtZQUV6RCxtREFBbUQ7WUFDbkRsQixLQUFLcUIsV0FBVyxDQUFDO2dCQUNickIsS0FBS3NCLGtCQUFrQixDQUFDaEMsV0FBV3FCLEdBQUcsQ0FBQyx1QkFBd0I7b0JBQUVSLEdBQUc7b0JBQUdDLEdBQUc7b0JBQUdDLEdBQUc7Z0JBQUUsR0FBRztnQkFDckZMLEtBQUt1Qix1QkFBdUIsQ0FBQy9CLFVBQVVtQixHQUFHLENBQUMsdUJBQXdCO29CQUFFUixHQUFHO29CQUFHQyxHQUFHO29CQUFHQyxHQUFHO2dCQUFFLEdBQUcsR0FBRztZQUNoRztRQUNKO0lBQ0o7OzthQW5DZ0JtQixZQUEyQjthQUMzQk4sYUFBcUI7YUFDckJPLFlBQTRCO2FBQ2hCQyxXQUFtQixLQUFLakM7YUFDakNrQyxhQUFzQjs7QUFnQzdDO0FBckNBLFNBQXFCN0Isa0NBcUNwQiJ9