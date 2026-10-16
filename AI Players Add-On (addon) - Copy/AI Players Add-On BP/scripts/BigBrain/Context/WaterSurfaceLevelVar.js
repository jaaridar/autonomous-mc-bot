import { TicksPerSecond } from "@minecraft/server";
import AIPData from "Data/AIPData";
import EntityContextVar from "StateSkeleton/EntityContextVar";
import { LocationVar } from "./LocationVar";
export class WaterSurfaceLevelVar extends EntityContextVar {
    computeValue() {
        if (!this.entity.isInWater) return null;
        const location = this.context.getValue(LocationVar).$.floor();
        for(let y = location.y; y < location.y + AIPData.MaxSurfaceSearchDistance; y++){
            const block = this.entity.dimension.getBlock({
                x: location.x,
                y,
                z: location.z
            });
            if (block?.typeId !== "minecraft:water") return y - 1;
        }
        return null;
    }
    constructor(...args){
        super(...args);
        this.invalidationDuration = 1 * TicksPerSecond;
        this.isLazy = true;
    }
}
WaterSurfaceLevelVar.identifier = "water_surface_level";

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIldhdGVyU3VyZmFjZUxldmVsVmFyLnRzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IFRpY2tzUGVyU2Vjb25kIH0gZnJvbSBcIkBtaW5lY3JhZnQvc2VydmVyXCI7XHJcbmltcG9ydCBBSVBEYXRhIGZyb20gXCJEYXRhL0FJUERhdGFcIjtcclxuaW1wb3J0IEVudGl0eUNvbnRleHRWYXIgZnJvbSBcIlN0YXRlU2tlbGV0b24vRW50aXR5Q29udGV4dFZhclwiO1xyXG5pbXBvcnQgeyBMb2NhdGlvblZhciB9IGZyb20gXCIuL0xvY2F0aW9uVmFyXCI7XHJcblxyXG5leHBvcnQgY2xhc3MgV2F0ZXJTdXJmYWNlTGV2ZWxWYXIgZXh0ZW5kcyBFbnRpdHlDb250ZXh0VmFyPG51bWJlciB8IG51bGw+IHtcclxuICAgIHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgaWRlbnRpZmllciA9IFwid2F0ZXJfc3VyZmFjZV9sZXZlbFwiO1xyXG5cclxuICAgIHByb3RlY3RlZCByZWFkb25seSBpbnZhbGlkYXRpb25EdXJhdGlvbiA9IDEgKiBUaWNrc1BlclNlY29uZDtcclxuICAgIHByb3RlY3RlZCByZWFkb25seSBpc0xhenkgPSB0cnVlO1xyXG5cclxuICAgIHByb3RlY3RlZCBjb21wdXRlVmFsdWUoKTogbnVtYmVyIHwgbnVsbCB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmVudGl0eS5pc0luV2F0ZXIpIHJldHVybiBudWxsO1xyXG5cclxuICAgICAgICBjb25zdCBsb2NhdGlvbiA9IHRoaXMuY29udGV4dC5nZXRWYWx1ZShMb2NhdGlvblZhcikuJC5mbG9vcigpO1xyXG4gICAgICAgIGZvciAobGV0IHkgPSBsb2NhdGlvbi55OyB5IDwgbG9jYXRpb24ueSArIEFJUERhdGEuTWF4U3VyZmFjZVNlYXJjaERpc3RhbmNlOyB5KyspIHtcclxuICAgICAgICAgICAgY29uc3QgYmxvY2sgPSB0aGlzLmVudGl0eS5kaW1lbnNpb24uZ2V0QmxvY2soeyB4OiBsb2NhdGlvbi54LCB5LCB6OiBsb2NhdGlvbi56IH0pO1xyXG4gICAgICAgICAgICBpZiAoYmxvY2s/LnR5cGVJZCAhPT0gXCJtaW5lY3JhZnQ6d2F0ZXJcIikgcmV0dXJuIHkgLSAxO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgIH1cclxufVxyXG4iXSwibmFtZXMiOlsiVGlja3NQZXJTZWNvbmQiLCJBSVBEYXRhIiwiRW50aXR5Q29udGV4dFZhciIsIkxvY2F0aW9uVmFyIiwiV2F0ZXJTdXJmYWNlTGV2ZWxWYXIiLCJjb21wdXRlVmFsdWUiLCJlbnRpdHkiLCJpc0luV2F0ZXIiLCJsb2NhdGlvbiIsImNvbnRleHQiLCJnZXRWYWx1ZSIsIiQiLCJmbG9vciIsInkiLCJNYXhTdXJmYWNlU2VhcmNoRGlzdGFuY2UiLCJibG9jayIsImRpbWVuc2lvbiIsImdldEJsb2NrIiwieCIsInoiLCJ0eXBlSWQiLCJpbnZhbGlkYXRpb25EdXJhdGlvbiIsImlzTGF6eSIsImlkZW50aWZpZXIiXSwibWFwcGluZ3MiOiJBQUFBLFNBQVNBLGNBQWMsUUFBUSxvQkFBb0I7QUFDbkQsT0FBT0MsYUFBYSxlQUFlO0FBQ25DLE9BQU9DLHNCQUFzQixpQ0FBaUM7QUFDOUQsU0FBU0MsV0FBVyxRQUFRLGdCQUFnQjtBQUU1QyxPQUFPLE1BQU1DLDZCQUE2QkY7SUFNNUJHLGVBQThCO1FBQ3BDLElBQUksQ0FBQyxJQUFJLENBQUNDLE1BQU0sQ0FBQ0MsU0FBUyxFQUFFLE9BQU87UUFFbkMsTUFBTUMsV0FBVyxJQUFJLENBQUNDLE9BQU8sQ0FBQ0MsUUFBUSxDQUFDUCxhQUFhUSxDQUFDLENBQUNDLEtBQUs7UUFDM0QsSUFBSyxJQUFJQyxJQUFJTCxTQUFTSyxDQUFDLEVBQUVBLElBQUlMLFNBQVNLLENBQUMsR0FBR1osUUFBUWEsd0JBQXdCLEVBQUVELElBQUs7WUFDN0UsTUFBTUUsUUFBUSxJQUFJLENBQUNULE1BQU0sQ0FBQ1UsU0FBUyxDQUFDQyxRQUFRLENBQUM7Z0JBQUVDLEdBQUdWLFNBQVNVLENBQUM7Z0JBQUVMO2dCQUFHTSxHQUFHWCxTQUFTVyxDQUFDO1lBQUM7WUFDL0UsSUFBSUosT0FBT0ssV0FBVyxtQkFBbUIsT0FBT1AsSUFBSTtRQUN4RDtRQUNBLE9BQU87SUFDWDs7O2FBWm1CUSx1QkFBdUIsSUFBSXJCO2FBQzNCc0IsU0FBUzs7QUFZaEM7QUFoQmFsQixxQkFDY21CLGFBQWEifQ==