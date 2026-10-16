import { ItemStack, TicksPerSecond } from "@minecraft/server";
import VirtualInventoryComponent from "Inventory/VirtualInventoryComponent";
import V3 from "Helpers/Vectors/V3";
import AbstractCombatTest from "./AbstractCombatTest";
class MeleeTest extends AbstractCombatTest {
    async run(test) {
        super.run(test);
        const player = this.spawnAIP(test, new V3(1, 2, 1));
        await test.idle(1);
        VirtualInventoryComponent.get(player).giveItem(new ItemStack("minecraft:diamond_sword"));
        const zombies = [
            this.spawnZombie(test, new V3(13, 2, 11)),
            this.spawnZombie(test, new V3(11, 2, 13))
        ];
        test.succeedWhen(()=>{
            for (const zombie of zombies){
                test.assert(!zombie.isValid, "Zombie should be defeated");
            }
        });
    }
    constructor(...args){
        super(...args);
        this.identifier = "melee";
        this.maxTicks = 30 * TicksPerSecond;
    }
}
export { MeleeTest as default };

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIk1lbGVlVGVzdC50cyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBJdGVtU3RhY2ssIFRpY2tzUGVyU2Vjb25kIH0gZnJvbSBcIkBtaW5lY3JhZnQvc2VydmVyXCI7XHJcbmltcG9ydCB7IFRlc3QgfSBmcm9tIFwiQG1pbmVjcmFmdC9zZXJ2ZXItZ2FtZXRlc3RcIjtcclxuaW1wb3J0IFZpcnR1YWxJbnZlbnRvcnlDb21wb25lbnQgZnJvbSBcIkludmVudG9yeS9WaXJ0dWFsSW52ZW50b3J5Q29tcG9uZW50XCI7XHJcbmltcG9ydCBWMyBmcm9tIFwiSGVscGVycy9WZWN0b3JzL1YzXCI7XHJcbmltcG9ydCBBYnN0cmFjdENvbWJhdFRlc3QgZnJvbSBcIi4vQWJzdHJhY3RDb21iYXRUZXN0XCI7XHJcblxyXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBNZWxlZVRlc3QgZXh0ZW5kcyBBYnN0cmFjdENvbWJhdFRlc3Qge1xyXG4gICAgcHVibGljIHJlYWRvbmx5IGlkZW50aWZpZXI6IHN0cmluZyA9IFwibWVsZWVcIjtcclxuICAgIHByb3RlY3RlZCByZWFkb25seSBtYXhUaWNrczogbnVtYmVyID0gMzAgKiBUaWNrc1BlclNlY29uZDtcclxuXHJcbiAgICBwcm90ZWN0ZWQgYXN5bmMgcnVuKHRlc3Q6IFRlc3QpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgICAgICBzdXBlci5ydW4odGVzdCk7XHJcblxyXG4gICAgICAgIGNvbnN0IHBsYXllciA9IHRoaXMuc3Bhd25BSVAodGVzdCwgbmV3IFYzKDEsIDIsIDEpKTtcclxuXHJcbiAgICAgICAgYXdhaXQgdGVzdC5pZGxlKDEpO1xyXG5cclxuICAgICAgICBWaXJ0dWFsSW52ZW50b3J5Q29tcG9uZW50LmdldChwbGF5ZXIpLmdpdmVJdGVtKG5ldyBJdGVtU3RhY2soXCJtaW5lY3JhZnQ6ZGlhbW9uZF9zd29yZFwiKSk7XHJcblxyXG4gICAgICAgIGNvbnN0IHpvbWJpZXMgPSBbdGhpcy5zcGF3blpvbWJpZSh0ZXN0LCBuZXcgVjMoMTMsIDIsIDExKSksIHRoaXMuc3Bhd25ab21iaWUodGVzdCwgbmV3IFYzKDExLCAyLCAxMykpXTtcclxuXHJcbiAgICAgICAgdGVzdC5zdWNjZWVkV2hlbigoKSA9PiB7XHJcbiAgICAgICAgICAgIGZvciAoY29uc3Qgem9tYmllIG9mIHpvbWJpZXMpIHtcclxuICAgICAgICAgICAgICAgIHRlc3QuYXNzZXJ0KCF6b21iaWUuaXNWYWxpZCwgXCJab21iaWUgc2hvdWxkIGJlIGRlZmVhdGVkXCIpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcbn1cclxuIl0sIm5hbWVzIjpbIkl0ZW1TdGFjayIsIlRpY2tzUGVyU2Vjb25kIiwiVmlydHVhbEludmVudG9yeUNvbXBvbmVudCIsIlYzIiwiQWJzdHJhY3RDb21iYXRUZXN0IiwiTWVsZWVUZXN0IiwicnVuIiwidGVzdCIsInBsYXllciIsInNwYXduQUlQIiwiaWRsZSIsImdldCIsImdpdmVJdGVtIiwiem9tYmllcyIsInNwYXduWm9tYmllIiwic3VjY2VlZFdoZW4iLCJ6b21iaWUiLCJhc3NlcnQiLCJpc1ZhbGlkIiwiaWRlbnRpZmllciIsIm1heFRpY2tzIl0sIm1hcHBpbmdzIjoiQUFBQSxTQUFTQSxTQUFTLEVBQUVDLGNBQWMsUUFBUSxvQkFBb0I7QUFFOUQsT0FBT0MsK0JBQStCLHNDQUFzQztBQUM1RSxPQUFPQyxRQUFRLHFCQUFxQjtBQUNwQyxPQUFPQyx3QkFBd0IsdUJBQXVCO0FBRXZDLE1BQU1DLGtCQUFrQkQ7SUFJbkMsTUFBZ0JFLElBQUlDLElBQVUsRUFBaUI7UUFDM0MsS0FBSyxDQUFDRCxJQUFJQztRQUVWLE1BQU1DLFNBQVMsSUFBSSxDQUFDQyxRQUFRLENBQUNGLE1BQU0sSUFBSUosR0FBRyxHQUFHLEdBQUc7UUFFaEQsTUFBTUksS0FBS0csSUFBSSxDQUFDO1FBRWhCUiwwQkFBMEJTLEdBQUcsQ0FBQ0gsUUFBUUksUUFBUSxDQUFDLElBQUlaLFVBQVU7UUFFN0QsTUFBTWEsVUFBVTtZQUFDLElBQUksQ0FBQ0MsV0FBVyxDQUFDUCxNQUFNLElBQUlKLEdBQUcsSUFBSSxHQUFHO1lBQU0sSUFBSSxDQUFDVyxXQUFXLENBQUNQLE1BQU0sSUFBSUosR0FBRyxJQUFJLEdBQUc7U0FBSztRQUV0R0ksS0FBS1EsV0FBVyxDQUFDO1lBQ2IsS0FBSyxNQUFNQyxVQUFVSCxRQUFTO2dCQUMxQk4sS0FBS1UsTUFBTSxDQUFDLENBQUNELE9BQU9FLE9BQU8sRUFBRTtZQUNqQztRQUNKO0lBQ0o7OzthQW5CZ0JDLGFBQXFCO2FBQ2xCQyxXQUFtQixLQUFLbkI7O0FBbUIvQztBQXJCQSxTQUFxQkksdUJBcUJwQiJ9