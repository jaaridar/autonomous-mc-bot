import { TicksPerSecond } from "@minecraft/server";
import FeatureCache from "FeatureCache/FeatureCache";
import V3 from "Helpers/Vectors/V3";
import AbstractFeatureTest from "./AbstractFeatureTest";
class PickNearestVeinTest extends AbstractFeatureTest {
    async run(test) {
        super.run(test);
        // Place a far copper vein and a near copper vein
        const featurePositions = [
            new V3(1, 40, 1),
            new V3(41, 40, 41),
            new V3(1, 40, 41),
            new V3(41, 40, 1),
            new V3(23, 41, 23),
            new V3(23, 35, 23)
        ];
        const origin = new V3(23, 40, 23);
        for (const pos of featurePositions){
            this.createFeature(test, "copper", pos);
        }
        // Wait for feature cache scan to complete
        await test.idle(this.maxTicks - 1);
        const searchOrigin = this.getWorldLocation(test, origin);
        const copperType = FeatureCache.getFeatureType("copper");
        const nearest = copperType.getNearestUnlockedFeatureInCylinder(searchOrigin, {
            radius: 64,
            yOffsetRange: [
                -5,
                0
            ]
        });
        test.assert(nearest !== null, "Expected to find a copper vein");
        const target = featurePositions[featurePositions.length - 1];
        const blockInTargetVein = this.getWorldLocation(test, target).add(new V3(2, 0, 2)); // Get block inside of vein
        let hasBlock = false;
        for (const block of nearest.blocks){
            if (block.sharesBlockWith(blockInTargetVein)) {
                hasBlock = true;
                break;
            }
        }
        test.assert(hasBlock, `Expected nearest vein to be the one at ${target.toString()}`);
        test.succeed();
    }
    constructor(...args){
        super(...args);
        this.namespace = "features";
        this.identifier = "pick_nearest_vein";
        this.structure = "large_bedrock_box";
        this.maxTicks = 5 * TicksPerSecond;
    }
}
export { PickNearestVeinTest as default };

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIlBpY2tOZWFyZXN0VmVpblRlc3QudHMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgVGlja3NQZXJTZWNvbmQgfSBmcm9tIFwiQG1pbmVjcmFmdC9zZXJ2ZXJcIjtcclxuaW1wb3J0IHsgVGVzdCB9IGZyb20gXCJAbWluZWNyYWZ0L3NlcnZlci1nYW1ldGVzdFwiO1xyXG5pbXBvcnQgRmVhdHVyZUNhY2hlIGZyb20gXCJGZWF0dXJlQ2FjaGUvRmVhdHVyZUNhY2hlXCI7XHJcbmltcG9ydCBWMyBmcm9tIFwiSGVscGVycy9WZWN0b3JzL1YzXCI7XHJcbmltcG9ydCB7IFRlc3ROYW1lc3BhY2UsIFRlc3RTdHJ1Y3R1cmVzIH0gZnJvbSBcIlRlc3QvVHlwZXNcIjtcclxuaW1wb3J0IEFic3RyYWN0RmVhdHVyZVRlc3QgZnJvbSBcIi4vQWJzdHJhY3RGZWF0dXJlVGVzdFwiO1xyXG5cclxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgUGlja05lYXJlc3RWZWluVGVzdCBleHRlbmRzIEFic3RyYWN0RmVhdHVyZVRlc3Qge1xyXG4gICAgcHVibGljIHJlYWRvbmx5IG5hbWVzcGFjZTogVGVzdE5hbWVzcGFjZSA9IFwiZmVhdHVyZXNcIjtcclxuICAgIHB1YmxpYyByZWFkb25seSBpZGVudGlmaWVyOiBzdHJpbmcgPSBcInBpY2tfbmVhcmVzdF92ZWluXCI7XHJcbiAgICBwdWJsaWMgcmVhZG9ubHkgc3RydWN0dXJlOiBUZXN0U3RydWN0dXJlcyA9IFwibGFyZ2VfYmVkcm9ja19ib3hcIjtcclxuICAgIHByb3RlY3RlZCBvdmVycmlkZSByZWFkb25seSBtYXhUaWNrcyA9IDUgKiBUaWNrc1BlclNlY29uZDtcclxuXHJcbiAgICBwcm90ZWN0ZWQgYXN5bmMgcnVuKHRlc3Q6IFRlc3QpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgICAgICBzdXBlci5ydW4odGVzdCk7XHJcblxyXG4gICAgICAgIC8vIFBsYWNlIGEgZmFyIGNvcHBlciB2ZWluIGFuZCBhIG5lYXIgY29wcGVyIHZlaW5cclxuICAgICAgICBjb25zdCBmZWF0dXJlUG9zaXRpb25zID0gW1xyXG4gICAgICAgICAgICBuZXcgVjMoMSwgNDAsIDEpLFxyXG4gICAgICAgICAgICBuZXcgVjMoNDEsIDQwLCA0MSksXHJcbiAgICAgICAgICAgIG5ldyBWMygxLCA0MCwgNDEpLFxyXG4gICAgICAgICAgICBuZXcgVjMoNDEsIDQwLCAxKSxcclxuICAgICAgICAgICAgbmV3IFYzKDIzLCA0MSwgMjMpLFxyXG4gICAgICAgICAgICBuZXcgVjMoMjMsIDM1LCAyMyksIC8vIFRoaXMgaXMgdGhlIGNsb3Nlc3Qgb25lIGluIHRoZSBzZWFyY2ggYXJlYVxyXG4gICAgICAgIF07XHJcblxyXG4gICAgICAgIGNvbnN0IG9yaWdpbiA9IG5ldyBWMygyMywgNDAsIDIzKTtcclxuXHJcbiAgICAgICAgZm9yIChjb25zdCBwb3Mgb2YgZmVhdHVyZVBvc2l0aW9ucykge1xyXG4gICAgICAgICAgICB0aGlzLmNyZWF0ZUZlYXR1cmUodGVzdCwgXCJjb3BwZXJcIiwgcG9zKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIFdhaXQgZm9yIGZlYXR1cmUgY2FjaGUgc2NhbiB0byBjb21wbGV0ZVxyXG4gICAgICAgIGF3YWl0IHRlc3QuaWRsZSh0aGlzLm1heFRpY2tzIC0gMSk7XHJcblxyXG4gICAgICAgIGNvbnN0IHNlYXJjaE9yaWdpbiA9IHRoaXMuZ2V0V29ybGRMb2NhdGlvbih0ZXN0LCBvcmlnaW4pO1xyXG4gICAgICAgIGNvbnN0IGNvcHBlclR5cGUgPSBGZWF0dXJlQ2FjaGUuZ2V0RmVhdHVyZVR5cGUoXCJjb3BwZXJcIik7XHJcbiAgICAgICAgY29uc3QgbmVhcmVzdCA9IGNvcHBlclR5cGUuZ2V0TmVhcmVzdFVubG9ja2VkRmVhdHVyZUluQ3lsaW5kZXIoc2VhcmNoT3JpZ2luLCB7IHJhZGl1czogNjQsIHlPZmZzZXRSYW5nZTogWy01LCAwXSB9KTtcclxuXHJcbiAgICAgICAgdGVzdC5hc3NlcnQobmVhcmVzdCAhPT0gbnVsbCwgXCJFeHBlY3RlZCB0byBmaW5kIGEgY29wcGVyIHZlaW5cIik7XHJcblxyXG4gICAgICAgIGNvbnN0IHRhcmdldCA9IGZlYXR1cmVQb3NpdGlvbnNbZmVhdHVyZVBvc2l0aW9ucy5sZW5ndGggLSAxXTtcclxuICAgICAgICBjb25zdCBibG9ja0luVGFyZ2V0VmVpbiA9IHRoaXMuZ2V0V29ybGRMb2NhdGlvbih0ZXN0LCB0YXJnZXQpLmFkZChuZXcgVjMoMiwgMCwgMikpOyAvLyBHZXQgYmxvY2sgaW5zaWRlIG9mIHZlaW5cclxuXHJcbiAgICAgICAgbGV0IGhhc0Jsb2NrID0gZmFsc2U7XHJcbiAgICAgICAgZm9yIChjb25zdCBibG9jayBvZiBuZWFyZXN0IS5ibG9ja3MpIHtcclxuICAgICAgICAgICAgaWYgKGJsb2NrLnNoYXJlc0Jsb2NrV2l0aChibG9ja0luVGFyZ2V0VmVpbikpIHtcclxuICAgICAgICAgICAgICAgIGhhc0Jsb2NrID0gdHJ1ZTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB0ZXN0LmFzc2VydChoYXNCbG9jaywgYEV4cGVjdGVkIG5lYXJlc3QgdmVpbiB0byBiZSB0aGUgb25lIGF0ICR7dGFyZ2V0LnRvU3RyaW5nKCl9YCk7XHJcblxyXG4gICAgICAgIHRlc3Quc3VjY2VlZCgpO1xyXG4gICAgfVxyXG59XHJcbiJdLCJuYW1lcyI6WyJUaWNrc1BlclNlY29uZCIsIkZlYXR1cmVDYWNoZSIsIlYzIiwiQWJzdHJhY3RGZWF0dXJlVGVzdCIsIlBpY2tOZWFyZXN0VmVpblRlc3QiLCJydW4iLCJ0ZXN0IiwiZmVhdHVyZVBvc2l0aW9ucyIsIm9yaWdpbiIsInBvcyIsImNyZWF0ZUZlYXR1cmUiLCJpZGxlIiwibWF4VGlja3MiLCJzZWFyY2hPcmlnaW4iLCJnZXRXb3JsZExvY2F0aW9uIiwiY29wcGVyVHlwZSIsImdldEZlYXR1cmVUeXBlIiwibmVhcmVzdCIsImdldE5lYXJlc3RVbmxvY2tlZEZlYXR1cmVJbkN5bGluZGVyIiwicmFkaXVzIiwieU9mZnNldFJhbmdlIiwiYXNzZXJ0IiwidGFyZ2V0IiwibGVuZ3RoIiwiYmxvY2tJblRhcmdldFZlaW4iLCJhZGQiLCJoYXNCbG9jayIsImJsb2NrIiwiYmxvY2tzIiwic2hhcmVzQmxvY2tXaXRoIiwidG9TdHJpbmciLCJzdWNjZWVkIiwibmFtZXNwYWNlIiwiaWRlbnRpZmllciIsInN0cnVjdHVyZSJdLCJtYXBwaW5ncyI6IkFBQUEsU0FBU0EsY0FBYyxRQUFRLG9CQUFvQjtBQUVuRCxPQUFPQyxrQkFBa0IsNEJBQTRCO0FBQ3JELE9BQU9DLFFBQVEscUJBQXFCO0FBRXBDLE9BQU9DLHlCQUF5Qix3QkFBd0I7QUFFekMsTUFBTUMsNEJBQTRCRDtJQU03QyxNQUFnQkUsSUFBSUMsSUFBVSxFQUFpQjtRQUMzQyxLQUFLLENBQUNELElBQUlDO1FBRVYsaURBQWlEO1FBQ2pELE1BQU1DLG1CQUFtQjtZQUNyQixJQUFJTCxHQUFHLEdBQUcsSUFBSTtZQUNkLElBQUlBLEdBQUcsSUFBSSxJQUFJO1lBQ2YsSUFBSUEsR0FBRyxHQUFHLElBQUk7WUFDZCxJQUFJQSxHQUFHLElBQUksSUFBSTtZQUNmLElBQUlBLEdBQUcsSUFBSSxJQUFJO1lBQ2YsSUFBSUEsR0FBRyxJQUFJLElBQUk7U0FDbEI7UUFFRCxNQUFNTSxTQUFTLElBQUlOLEdBQUcsSUFBSSxJQUFJO1FBRTlCLEtBQUssTUFBTU8sT0FBT0YsaUJBQWtCO1lBQ2hDLElBQUksQ0FBQ0csYUFBYSxDQUFDSixNQUFNLFVBQVVHO1FBQ3ZDO1FBRUEsMENBQTBDO1FBQzFDLE1BQU1ILEtBQUtLLElBQUksQ0FBQyxJQUFJLENBQUNDLFFBQVEsR0FBRztRQUVoQyxNQUFNQyxlQUFlLElBQUksQ0FBQ0MsZ0JBQWdCLENBQUNSLE1BQU1FO1FBQ2pELE1BQU1PLGFBQWFkLGFBQWFlLGNBQWMsQ0FBQztRQUMvQyxNQUFNQyxVQUFVRixXQUFXRyxtQ0FBbUMsQ0FBQ0wsY0FBYztZQUFFTSxRQUFRO1lBQUlDLGNBQWM7Z0JBQUMsQ0FBQztnQkFBRzthQUFFO1FBQUM7UUFFakhkLEtBQUtlLE1BQU0sQ0FBQ0osWUFBWSxNQUFNO1FBRTlCLE1BQU1LLFNBQVNmLGdCQUFnQixDQUFDQSxpQkFBaUJnQixNQUFNLEdBQUcsRUFBRTtRQUM1RCxNQUFNQyxvQkFBb0IsSUFBSSxDQUFDVixnQkFBZ0IsQ0FBQ1IsTUFBTWdCLFFBQVFHLEdBQUcsQ0FBQyxJQUFJdkIsR0FBRyxHQUFHLEdBQUcsS0FBSywyQkFBMkI7UUFFL0csSUFBSXdCLFdBQVc7UUFDZixLQUFLLE1BQU1DLFNBQVNWLFFBQVNXLE1BQU0sQ0FBRTtZQUNqQyxJQUFJRCxNQUFNRSxlQUFlLENBQUNMLG9CQUFvQjtnQkFDMUNFLFdBQVc7Z0JBQ1g7WUFDSjtRQUNKO1FBRUFwQixLQUFLZSxNQUFNLENBQUNLLFVBQVUsQ0FBQyx1Q0FBdUMsRUFBRUosT0FBT1EsUUFBUSxHQUFHLENBQUM7UUFFbkZ4QixLQUFLeUIsT0FBTztJQUNoQjs7O2FBL0NnQkMsWUFBMkI7YUFDM0JDLGFBQXFCO2FBQ3JCQyxZQUE0QjthQUNoQnRCLFdBQVcsSUFBSVo7O0FBNkMvQztBQWpEQSxTQUFxQkksaUNBaURwQiJ9