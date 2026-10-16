import { BlockTypes, ItemStack, TicksPerSecond } from "@minecraft/server";
import { MineBlockProcedure } from "BigBrain/Procedures/MineBlockProcedure";
import VirtualInventoryComponent from "Inventory/VirtualInventoryComponent";
import AbstractMiningTest, { MineBlockTestRoot } from "./AbstractMiningTest";
class BlockDropSuccessTest extends AbstractMiningTest {
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
            VirtualInventoryComponent.get(aip).setSlot(0, new ItemStack("minecraft:stone_pickaxe"));
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
            // Poll each tick until the AIP has mined the block and raw_iron has dropped
            test.succeedWhen(()=>{
                test.assertBlockPresent(BlockTypes.get("minecraft:iron_ore"), {
                    x: 1,
                    y: 3,
                    z: 2
                }, false);
                test.assert(VirtualInventoryComponent.get(aip).hasItemType("minecraft:raw_iron"), "AIP should have raw iron in their inventory");
            });
        });
    }
    constructor(...args){
        super(...args);
        this.namespace = "mining";
        this.identifier = "block_drop_success";
        this.structure = "grass";
        this.maxTicks = 10 * TicksPerSecond;
        this.isCoreTest = true;
    }
}
export { BlockDropSuccessTest as default };

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkJsb2NrRHJvcFN1Y2Nlc3NUZXN0LnRzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEJsb2NrVHlwZXMsIEl0ZW1TdGFjaywgVGlja3NQZXJTZWNvbmQgfSBmcm9tIFwiQG1pbmVjcmFmdC9zZXJ2ZXJcIjtcclxuaW1wb3J0IHsgVGVzdCB9IGZyb20gXCJAbWluZWNyYWZ0L3NlcnZlci1nYW1ldGVzdFwiO1xyXG5pbXBvcnQgeyBNaW5lQmxvY2tQcm9jZWR1cmUgfSBmcm9tIFwiQmlnQnJhaW4vUHJvY2VkdXJlcy9NaW5lQmxvY2tQcm9jZWR1cmVcIjtcclxuaW1wb3J0IFZpcnR1YWxJbnZlbnRvcnlDb21wb25lbnQgZnJvbSBcIkludmVudG9yeS9WaXJ0dWFsSW52ZW50b3J5Q29tcG9uZW50XCI7XHJcbmltcG9ydCB7IFRlc3ROYW1lc3BhY2UsIFRlc3RTdHJ1Y3R1cmVzIH0gZnJvbSBcIlRlc3QvVHlwZXNcIjtcclxuaW1wb3J0IEFic3RyYWN0TWluaW5nVGVzdCwgeyBNaW5lQmxvY2tUZXN0Um9vdCB9IGZyb20gXCIuL0Fic3RyYWN0TWluaW5nVGVzdFwiO1xyXG5cclxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgQmxvY2tEcm9wU3VjY2Vzc1Rlc3QgZXh0ZW5kcyBBYnN0cmFjdE1pbmluZ1Rlc3Qge1xyXG4gICAgcHVibGljIHJlYWRvbmx5IG5hbWVzcGFjZTogVGVzdE5hbWVzcGFjZSA9IFwibWluaW5nXCI7XHJcbiAgICBwdWJsaWMgcmVhZG9ubHkgaWRlbnRpZmllcjogc3RyaW5nID0gXCJibG9ja19kcm9wX3N1Y2Nlc3NcIjtcclxuICAgIHB1YmxpYyByZWFkb25seSBzdHJ1Y3R1cmU6IFRlc3RTdHJ1Y3R1cmVzID0gXCJncmFzc1wiO1xyXG4gICAgcHJvdGVjdGVkIG92ZXJyaWRlIHJlYWRvbmx5IG1heFRpY2tzOiBudW1iZXIgPSAxMCAqIFRpY2tzUGVyU2Vjb25kO1xyXG4gICAgcHJvdGVjdGVkIHJlYWRvbmx5IGlzQ29yZVRlc3Q6IGJvb2xlYW4gPSB0cnVlO1xyXG5cclxuICAgIHByb3RlY3RlZCBydW4odGVzdDogVGVzdCk6IHZvaWQge1xyXG4gICAgICAgIHN1cGVyLnJ1bih0ZXN0KTtcclxuXHJcbiAgICAgICAgLy8gU3Bhd24gdGhlIEFJUFxyXG4gICAgICAgIGNvbnN0IGFpcCA9IHRlc3Quc3Bhd24oXCJnbTFfc2t5OmFpcFwiLCB7IHg6IDEsIHk6IDIsIHo6IDEgfSk7XHJcbiAgICAgICAgYWlwLmdhbWVUZXN0RGF0YSA9IHsgcm9vdDogTWluZUJsb2NrVGVzdFJvb3QgfTtcclxuXHJcbiAgICAgICAgLy8gV2FpdCBhIHRpY2sgZm9yIEJpZ0JyYWluQ29tcG9uZW50IHRvIGluaXRpYWxpemUgd2l0aCBNaW5lQmxvY2tUZXN0Um9vdFxyXG4gICAgICAgIHRlc3QucnVuQWZ0ZXJEZWxheSgxLCAoKSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IGJpZ0JyYWluID0gYWlwLmdldE1vYkNvbXBvbmVudChcIkJpZ0JyYWluQ29tcG9uZW50XCIpITtcclxuXHJcbiAgICAgICAgICAgIC8vIEdpdmUgdGhlIEFJUCBpbnZlbnRvcnkgaXRlbXNcclxuICAgICAgICAgICAgVmlydHVhbEludmVudG9yeUNvbXBvbmVudC5nZXQoYWlwKS5zZXRTbG90KDAsIG5ldyBJdGVtU3RhY2soXCJtaW5lY3JhZnQ6c3RvbmVfcGlja2F4ZVwiKSk7XHJcblxyXG4gICAgICAgICAgICAvLyBQbGFjZSBhbiBpcm9uIG9yZSBibG9jayBmb3IgdGhlIEFJUCB0byBtaW5lXHJcbiAgICAgICAgICAgIHRlc3Quc2V0QmxvY2tUeXBlKEJsb2NrVHlwZXMuZ2V0KFwibWluZWNyYWZ0Omlyb25fb3JlXCIpISwgeyB4OiAxLCB5OiAzLCB6OiAyIH0pO1xyXG4gICAgICAgICAgICBjb25zdCBpcm9uT3JlID0gdGVzdC5nZXRCbG9jayh7IHg6IDEsIHk6IDMsIHo6IDIgfSk7XHJcblxyXG4gICAgICAgICAgICAvLyBFbnRlciB0aGUgTWluZUJsb2NrUHJvY2VkdXJlIHdpdGggdGhlIGlyb24gb3JlIGJsb2NrIHNldCBhcyB0aGUgdGFyZ2V0XHJcbiAgICAgICAgICAgIGNvbnN0IG1pbmVCbG9ja1Byb2MgPSBiaWdCcmFpbi5yb290LnN1YnN0YXRlc1tNaW5lQmxvY2tQcm9jZWR1cmUuaWRlbnRpZmllcl0gYXMgTWluZUJsb2NrUHJvY2VkdXJlO1xyXG4gICAgICAgICAgICBtaW5lQmxvY2tQcm9jLnNldEJsb2NrKGlyb25PcmUpO1xyXG4gICAgICAgICAgICBiaWdCcmFpbi5yb290LnNldFN1YmFkZHJlc3MoTWluZUJsb2NrUHJvY2VkdXJlLmlkZW50aWZpZXIpO1xyXG5cclxuICAgICAgICAgICAgLy8gUG9sbCBlYWNoIHRpY2sgdW50aWwgdGhlIEFJUCBoYXMgbWluZWQgdGhlIGJsb2NrIGFuZCByYXdfaXJvbiBoYXMgZHJvcHBlZFxyXG4gICAgICAgICAgICB0ZXN0LnN1Y2NlZWRXaGVuKCgpID0+IHtcclxuICAgICAgICAgICAgICAgIHRlc3QuYXNzZXJ0QmxvY2tQcmVzZW50KEJsb2NrVHlwZXMuZ2V0KFwibWluZWNyYWZ0Omlyb25fb3JlXCIpISwgeyB4OiAxLCB5OiAzLCB6OiAyIH0sIGZhbHNlKTtcclxuICAgICAgICAgICAgICAgIHRlc3QuYXNzZXJ0KFxyXG4gICAgICAgICAgICAgICAgICAgIFZpcnR1YWxJbnZlbnRvcnlDb21wb25lbnQuZ2V0KGFpcCkuaGFzSXRlbVR5cGUoXCJtaW5lY3JhZnQ6cmF3X2lyb25cIiksXHJcbiAgICAgICAgICAgICAgICAgICAgXCJBSVAgc2hvdWxkIGhhdmUgcmF3IGlyb24gaW4gdGhlaXIgaW52ZW50b3J5XCJcclxuICAgICAgICAgICAgICAgICk7XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG59XHJcbiJdLCJuYW1lcyI6WyJCbG9ja1R5cGVzIiwiSXRlbVN0YWNrIiwiVGlja3NQZXJTZWNvbmQiLCJNaW5lQmxvY2tQcm9jZWR1cmUiLCJWaXJ0dWFsSW52ZW50b3J5Q29tcG9uZW50IiwiQWJzdHJhY3RNaW5pbmdUZXN0IiwiTWluZUJsb2NrVGVzdFJvb3QiLCJCbG9ja0Ryb3BTdWNjZXNzVGVzdCIsInJ1biIsInRlc3QiLCJhaXAiLCJzcGF3biIsIngiLCJ5IiwieiIsImdhbWVUZXN0RGF0YSIsInJvb3QiLCJydW5BZnRlckRlbGF5IiwiYmlnQnJhaW4iLCJnZXRNb2JDb21wb25lbnQiLCJnZXQiLCJzZXRTbG90Iiwic2V0QmxvY2tUeXBlIiwiaXJvbk9yZSIsImdldEJsb2NrIiwibWluZUJsb2NrUHJvYyIsInN1YnN0YXRlcyIsImlkZW50aWZpZXIiLCJzZXRCbG9jayIsInNldFN1YmFkZHJlc3MiLCJzdWNjZWVkV2hlbiIsImFzc2VydEJsb2NrUHJlc2VudCIsImFzc2VydCIsImhhc0l0ZW1UeXBlIiwibmFtZXNwYWNlIiwic3RydWN0dXJlIiwibWF4VGlja3MiLCJpc0NvcmVUZXN0Il0sIm1hcHBpbmdzIjoiQUFBQSxTQUFTQSxVQUFVLEVBQUVDLFNBQVMsRUFBRUMsY0FBYyxRQUFRLG9CQUFvQjtBQUUxRSxTQUFTQyxrQkFBa0IsUUFBUSx5Q0FBeUM7QUFDNUUsT0FBT0MsK0JBQStCLHNDQUFzQztBQUU1RSxPQUFPQyxzQkFBc0JDLGlCQUFpQixRQUFRLHVCQUF1QjtBQUU5RCxNQUFNQyw2QkFBNkJGO0lBT3BDRyxJQUFJQyxJQUFVLEVBQVE7UUFDNUIsS0FBSyxDQUFDRCxJQUFJQztRQUVWLGdCQUFnQjtRQUNoQixNQUFNQyxNQUFNRCxLQUFLRSxLQUFLLENBQUMsZUFBZTtZQUFFQyxHQUFHO1lBQUdDLEdBQUc7WUFBR0MsR0FBRztRQUFFO1FBQ3pESixJQUFJSyxZQUFZLEdBQUc7WUFBRUMsTUFBTVY7UUFBa0I7UUFFN0MseUVBQXlFO1FBQ3pFRyxLQUFLUSxhQUFhLENBQUMsR0FBRztZQUNsQixNQUFNQyxXQUFXUixJQUFJUyxlQUFlLENBQUM7WUFFckMsK0JBQStCO1lBQy9CZiwwQkFBMEJnQixHQUFHLENBQUNWLEtBQUtXLE9BQU8sQ0FBQyxHQUFHLElBQUlwQixVQUFVO1lBRTVELDhDQUE4QztZQUM5Q1EsS0FBS2EsWUFBWSxDQUFDdEIsV0FBV29CLEdBQUcsQ0FBQyx1QkFBd0I7Z0JBQUVSLEdBQUc7Z0JBQUdDLEdBQUc7Z0JBQUdDLEdBQUc7WUFBRTtZQUM1RSxNQUFNUyxVQUFVZCxLQUFLZSxRQUFRLENBQUM7Z0JBQUVaLEdBQUc7Z0JBQUdDLEdBQUc7Z0JBQUdDLEdBQUc7WUFBRTtZQUVqRCx5RUFBeUU7WUFDekUsTUFBTVcsZ0JBQWdCUCxTQUFTRixJQUFJLENBQUNVLFNBQVMsQ0FBQ3ZCLG1CQUFtQndCLFVBQVUsQ0FBQztZQUM1RUYsY0FBY0csUUFBUSxDQUFDTDtZQUN2QkwsU0FBU0YsSUFBSSxDQUFDYSxhQUFhLENBQUMxQixtQkFBbUJ3QixVQUFVO1lBRXpELDRFQUE0RTtZQUM1RWxCLEtBQUtxQixXQUFXLENBQUM7Z0JBQ2JyQixLQUFLc0Isa0JBQWtCLENBQUMvQixXQUFXb0IsR0FBRyxDQUFDLHVCQUF3QjtvQkFBRVIsR0FBRztvQkFBR0MsR0FBRztvQkFBR0MsR0FBRztnQkFBRSxHQUFHO2dCQUNyRkwsS0FBS3VCLE1BQU0sQ0FDUDVCLDBCQUEwQmdCLEdBQUcsQ0FBQ1YsS0FBS3VCLFdBQVcsQ0FBQyx1QkFDL0M7WUFFUjtRQUNKO0lBQ0o7OzthQXRDZ0JDLFlBQTJCO2FBQzNCUCxhQUFxQjthQUNyQlEsWUFBNEI7YUFDaEJDLFdBQW1CLEtBQUtsQzthQUNqQ21DLGFBQXNCOztBQW1DN0M7QUF4Q0EsU0FBcUI5QixrQ0F3Q3BCIn0=