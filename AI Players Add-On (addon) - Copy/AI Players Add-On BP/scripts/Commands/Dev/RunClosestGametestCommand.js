import { system } from "@minecraft/server";
import { AbstractCommand } from "Commands/AbstractCommand";
import V3 from "Helpers/Vectors/V3";
import BlockUtils from "Utils/BlockUtils";
export class RunClosestGametestCommand extends AbstractCommand {
    handler(origin) {
        const player = origin.sourceEntity;
        const location = new V3(player.location);
        const closestStructureBlock = this.getClosestStructureBlock(location);
        if (!closestStructureBlock) return this.failure("No structure blocks found nearby");
        system.run(()=>{
            // First try use `gametest runthis`
            const runThisResult = player.runCommand("gametest runthis");
            const runThisSuccess = runThisResult.successCount > 0;
            if (runThisSuccess) return;
            // If fails, run the command at the closest structure block
            player.runCommand(`execute positioned ${closestStructureBlock.toString()} run gametest runthis`);
        });
        return this.success("Gametest found!");
    }
    getClosestStructureBlock(source) {
        const structureBlocks = BlockUtils.getBlocksInVolume(source, 64, {
            includeTypes: [
                "minecraft:command_block"
            ]
        });
        let closest = null;
        for (const location of structureBlocks.getBlockLocationIterator()){
            const blockLocation = new V3(location);
            const dist = blockLocation.distance(source);
            if (closest && dist >= closest.distance) continue;
            closest = {
                object: blockLocation,
                distance: dist
            };
        }
        if (!closest) return null;
        return closest.object;
    }
    constructor(...args){
        super(...args);
        this.name = "gm1_sky:run_closest_gametest";
        this.category = "dev";
        this.description = "Runs the closest gametest to the player.";
        this.executionLimit = "players";
        this.runInEarlyExecution = true;
    }
}

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIlJ1bkNsb3Nlc3RHYW1ldGVzdENvbW1hbmQudHMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgQ3VzdG9tQ29tbWFuZE9yaWdpbiwgUGxheWVyLCBzeXN0ZW0gfSBmcm9tIFwiQG1pbmVjcmFmdC9zZXJ2ZXJcIjtcclxuaW1wb3J0IHsgQWJzdHJhY3RDb21tYW5kLCBDb21tYW5kQ2F0ZWdvcnkgfSBmcm9tIFwiQ29tbWFuZHMvQWJzdHJhY3RDb21tYW5kXCI7XHJcbmltcG9ydCB7IE9iamVjdERpc3RhbmNlIH0gZnJvbSBcIkZlYXR1cmVDYWNoZS9UeXBlc1wiO1xyXG5pbXBvcnQgVjMgZnJvbSBcIkhlbHBlcnMvVmVjdG9ycy9WM1wiO1xyXG5pbXBvcnQgQmxvY2tVdGlscyBmcm9tIFwiVXRpbHMvQmxvY2tVdGlsc1wiO1xyXG5cclxuZXhwb3J0IGNsYXNzIFJ1bkNsb3Nlc3RHYW1ldGVzdENvbW1hbmQgZXh0ZW5kcyBBYnN0cmFjdENvbW1hbmQge1xyXG4gICAgcHVibGljIHJlYWRvbmx5IG5hbWUgPSBcImdtMV9za3k6cnVuX2Nsb3Nlc3RfZ2FtZXRlc3RcIjtcclxuICAgIHB1YmxpYyByZWFkb25seSBjYXRlZ29yeTogQ29tbWFuZENhdGVnb3J5ID0gXCJkZXZcIjtcclxuICAgIHByb3RlY3RlZCByZWFkb25seSBkZXNjcmlwdGlvbiA9IFwiUnVucyB0aGUgY2xvc2VzdCBnYW1ldGVzdCB0byB0aGUgcGxheWVyLlwiO1xyXG4gICAgcHJvdGVjdGVkIHJlYWRvbmx5IGV4ZWN1dGlvbkxpbWl0ID0gXCJwbGF5ZXJzXCIgYXMgY29uc3Q7XHJcbiAgICBwcm90ZWN0ZWQgcmVhZG9ubHkgcnVuSW5FYXJseUV4ZWN1dGlvbiA9IHRydWU7XHJcblxyXG4gICAgcHVibGljIGhhbmRsZXIob3JpZ2luOiBDdXN0b21Db21tYW5kT3JpZ2luKSB7XHJcbiAgICAgICAgY29uc3QgcGxheWVyID0gb3JpZ2luLnNvdXJjZUVudGl0eSBhcyBQbGF5ZXI7XHJcbiAgICAgICAgY29uc3QgbG9jYXRpb24gPSBuZXcgVjMocGxheWVyLmxvY2F0aW9uKTtcclxuXHJcbiAgICAgICAgY29uc3QgY2xvc2VzdFN0cnVjdHVyZUJsb2NrID0gdGhpcy5nZXRDbG9zZXN0U3RydWN0dXJlQmxvY2sobG9jYXRpb24pO1xyXG4gICAgICAgIGlmICghY2xvc2VzdFN0cnVjdHVyZUJsb2NrKSByZXR1cm4gdGhpcy5mYWlsdXJlKFwiTm8gc3RydWN0dXJlIGJsb2NrcyBmb3VuZCBuZWFyYnlcIik7XHJcblxyXG4gICAgICAgIHN5c3RlbS5ydW4oKCkgPT4ge1xyXG4gICAgICAgICAgICAvLyBGaXJzdCB0cnkgdXNlIGBnYW1ldGVzdCBydW50aGlzYFxyXG4gICAgICAgICAgICBjb25zdCBydW5UaGlzUmVzdWx0ID0gcGxheWVyLnJ1bkNvbW1hbmQoXCJnYW1ldGVzdCBydW50aGlzXCIpO1xyXG4gICAgICAgICAgICBjb25zdCBydW5UaGlzU3VjY2VzcyA9IHJ1blRoaXNSZXN1bHQuc3VjY2Vzc0NvdW50ID4gMDtcclxuICAgICAgICAgICAgaWYgKHJ1blRoaXNTdWNjZXNzKSByZXR1cm47XHJcblxyXG4gICAgICAgICAgICAvLyBJZiBmYWlscywgcnVuIHRoZSBjb21tYW5kIGF0IHRoZSBjbG9zZXN0IHN0cnVjdHVyZSBibG9ja1xyXG4gICAgICAgICAgICBwbGF5ZXIucnVuQ29tbWFuZChgZXhlY3V0ZSBwb3NpdGlvbmVkICR7Y2xvc2VzdFN0cnVjdHVyZUJsb2NrLnRvU3RyaW5nKCl9IHJ1biBnYW1ldGVzdCBydW50aGlzYCk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIHJldHVybiB0aGlzLnN1Y2Nlc3MoXCJHYW1ldGVzdCBmb3VuZCFcIik7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBnZXRDbG9zZXN0U3RydWN0dXJlQmxvY2soc291cmNlOiBWMyk6IFYzIHwgbnVsbCB7XHJcbiAgICAgICAgY29uc3Qgc3RydWN0dXJlQmxvY2tzID0gQmxvY2tVdGlscy5nZXRCbG9ja3NJblZvbHVtZShzb3VyY2UsIDY0LCB7XHJcbiAgICAgICAgICAgIGluY2x1ZGVUeXBlczogW1wibWluZWNyYWZ0OmNvbW1hbmRfYmxvY2tcIl0sXHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIGxldCBjbG9zZXN0OiBPYmplY3REaXN0YW5jZTxWMz4gfCBudWxsID0gbnVsbDtcclxuXHJcbiAgICAgICAgZm9yIChjb25zdCBsb2NhdGlvbiBvZiBzdHJ1Y3R1cmVCbG9ja3MuZ2V0QmxvY2tMb2NhdGlvbkl0ZXJhdG9yKCkpIHtcclxuICAgICAgICAgICAgY29uc3QgYmxvY2tMb2NhdGlvbiA9IG5ldyBWMyhsb2NhdGlvbik7XHJcbiAgICAgICAgICAgIGNvbnN0IGRpc3QgPSBibG9ja0xvY2F0aW9uLmRpc3RhbmNlKHNvdXJjZSk7XHJcbiAgICAgICAgICAgIGlmIChjbG9zZXN0ICYmIGRpc3QgPj0gY2xvc2VzdC5kaXN0YW5jZSkgY29udGludWU7XHJcbiAgICAgICAgICAgIGNsb3Nlc3QgPSB7IG9iamVjdDogYmxvY2tMb2NhdGlvbiwgZGlzdGFuY2U6IGRpc3QgfTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmICghY2xvc2VzdCkgcmV0dXJuIG51bGw7XHJcbiAgICAgICAgcmV0dXJuIGNsb3Nlc3Qub2JqZWN0O1xyXG4gICAgfVxyXG59XHJcbiJdLCJuYW1lcyI6WyJzeXN0ZW0iLCJBYnN0cmFjdENvbW1hbmQiLCJWMyIsIkJsb2NrVXRpbHMiLCJSdW5DbG9zZXN0R2FtZXRlc3RDb21tYW5kIiwiaGFuZGxlciIsIm9yaWdpbiIsInBsYXllciIsInNvdXJjZUVudGl0eSIsImxvY2F0aW9uIiwiY2xvc2VzdFN0cnVjdHVyZUJsb2NrIiwiZ2V0Q2xvc2VzdFN0cnVjdHVyZUJsb2NrIiwiZmFpbHVyZSIsInJ1biIsInJ1blRoaXNSZXN1bHQiLCJydW5Db21tYW5kIiwicnVuVGhpc1N1Y2Nlc3MiLCJzdWNjZXNzQ291bnQiLCJ0b1N0cmluZyIsInN1Y2Nlc3MiLCJzb3VyY2UiLCJzdHJ1Y3R1cmVCbG9ja3MiLCJnZXRCbG9ja3NJblZvbHVtZSIsImluY2x1ZGVUeXBlcyIsImNsb3Nlc3QiLCJnZXRCbG9ja0xvY2F0aW9uSXRlcmF0b3IiLCJibG9ja0xvY2F0aW9uIiwiZGlzdCIsImRpc3RhbmNlIiwib2JqZWN0IiwibmFtZSIsImNhdGVnb3J5IiwiZGVzY3JpcHRpb24iLCJleGVjdXRpb25MaW1pdCIsInJ1bkluRWFybHlFeGVjdXRpb24iXSwibWFwcGluZ3MiOiJBQUFBLFNBQXNDQSxNQUFNLFFBQVEsb0JBQW9CO0FBQ3hFLFNBQVNDLGVBQWUsUUFBeUIsMkJBQTJCO0FBRTVFLE9BQU9DLFFBQVEscUJBQXFCO0FBQ3BDLE9BQU9DLGdCQUFnQixtQkFBbUI7QUFFMUMsT0FBTyxNQUFNQyxrQ0FBa0NIO0lBT3BDSSxRQUFRQyxNQUEyQixFQUFFO1FBQ3hDLE1BQU1DLFNBQVNELE9BQU9FLFlBQVk7UUFDbEMsTUFBTUMsV0FBVyxJQUFJUCxHQUFHSyxPQUFPRSxRQUFRO1FBRXZDLE1BQU1DLHdCQUF3QixJQUFJLENBQUNDLHdCQUF3QixDQUFDRjtRQUM1RCxJQUFJLENBQUNDLHVCQUF1QixPQUFPLElBQUksQ0FBQ0UsT0FBTyxDQUFDO1FBRWhEWixPQUFPYSxHQUFHLENBQUM7WUFDUCxtQ0FBbUM7WUFDbkMsTUFBTUMsZ0JBQWdCUCxPQUFPUSxVQUFVLENBQUM7WUFDeEMsTUFBTUMsaUJBQWlCRixjQUFjRyxZQUFZLEdBQUc7WUFDcEQsSUFBSUQsZ0JBQWdCO1lBRXBCLDJEQUEyRDtZQUMzRFQsT0FBT1EsVUFBVSxDQUFDLENBQUMsbUJBQW1CLEVBQUVMLHNCQUFzQlEsUUFBUSxHQUFHLHFCQUFxQixDQUFDO1FBQ25HO1FBRUEsT0FBTyxJQUFJLENBQUNDLE9BQU8sQ0FBQztJQUN4QjtJQUVRUix5QkFBeUJTLE1BQVUsRUFBYTtRQUNwRCxNQUFNQyxrQkFBa0JsQixXQUFXbUIsaUJBQWlCLENBQUNGLFFBQVEsSUFBSTtZQUM3REcsY0FBYztnQkFBQzthQUEwQjtRQUM3QztRQUVBLElBQUlDLFVBQXFDO1FBRXpDLEtBQUssTUFBTWYsWUFBWVksZ0JBQWdCSSx3QkFBd0IsR0FBSTtZQUMvRCxNQUFNQyxnQkFBZ0IsSUFBSXhCLEdBQUdPO1lBQzdCLE1BQU1rQixPQUFPRCxjQUFjRSxRQUFRLENBQUNSO1lBQ3BDLElBQUlJLFdBQVdHLFFBQVFILFFBQVFJLFFBQVEsRUFBRTtZQUN6Q0osVUFBVTtnQkFBRUssUUFBUUg7Z0JBQWVFLFVBQVVEO1lBQUs7UUFDdEQ7UUFFQSxJQUFJLENBQUNILFNBQVMsT0FBTztRQUNyQixPQUFPQSxRQUFRSyxNQUFNO0lBQ3pCOzs7YUExQ2dCQyxPQUFPO2FBQ1BDLFdBQTRCO2FBQ3pCQyxjQUFjO2FBQ2RDLGlCQUFpQjthQUNqQkMsc0JBQXNCOztBQXVDN0MifQ==