import { system } from "@minecraft/server";
import { AbstractCommand } from "Commands/AbstractCommand";
export class SkinReportCommand extends AbstractCommand {
    handler(origin) {
        const player = origin.sourceEntity;
        system.run(()=>this.report(player));
    }
    report(player) {
        const query = {
            location: player.location,
            closest: 1,
            type: "gm1_sky:aip"
        };
        const nearest = EntityUtil.getEntities(query)[0];
        if (!nearest) {
            BroadcastUtil.say("§cNo AIP entities found nearby.", [
                player
            ]);
            return;
        }
        const lines = [
            `§eName:        §f${nearest.nameTag}`,
            `§eBodytype:    §f${nearest.getProperty("gm1_sky:bodytype")}`,
            `§eBase:        §f${nearest.getProperty("gm1_sky:base")}`,
            `§eShirt:       §f${nearest.getProperty("gm1_sky:shirt")}`,
            `§ePants:       §f${nearest.getProperty("gm1_sky:pants")}`,
            `§eEyes:        §f${nearest.getProperty("gm1_sky:eyes")}`,
            `§eEyes Color:  §f${nearest.getProperty("gm1_sky:eyes_color")}`,
            `§eMouth:       §f${nearest.getProperty("gm1_sky:mouth")}`,
            `§eMouth Color: §f${nearest.getProperty("gm1_sky:mouth_color")}`,
            `§eHair:        §f${nearest.getProperty("gm1_sky:hair")}`,
            `§eHair Color:  §f${nearest.getProperty("gm1_sky:hair_color")}`
        ];
        BroadcastUtil.say(lines.join("\n"), [
            player
        ]);
    }
    constructor(...args){
        super(...args);
        this.name = "gm1_sky:skin_report";
        this.category = "dev";
        this.cheatsRequired = true;
        this.executionLimit = "players";
        this.description = "Prints the skin randomizer values for the nearest AIP entity";
    }
}

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIlNraW5SZXBvcnRDb21tYW5kLnRzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEN1c3RvbUNvbW1hbmRPcmlnaW4sIEVudGl0eVF1ZXJ5T3B0aW9ucywgUGxheWVyLCBzeXN0ZW0gfSBmcm9tIFwiQG1pbmVjcmFmdC9zZXJ2ZXJcIjtcclxuaW1wb3J0IHsgQWJzdHJhY3RDb21tYW5kLCBDb21tYW5kQ2F0ZWdvcnksIEV4ZWN1dGlvbkxpbWl0IH0gZnJvbSBcIkNvbW1hbmRzL0Fic3RyYWN0Q29tbWFuZFwiO1xyXG5cclxuZXhwb3J0IGNsYXNzIFNraW5SZXBvcnRDb21tYW5kIGV4dGVuZHMgQWJzdHJhY3RDb21tYW5kIHtcclxuICAgIHB1YmxpYyByZWFkb25seSBuYW1lID0gXCJnbTFfc2t5OnNraW5fcmVwb3J0XCI7XHJcbiAgICBwdWJsaWMgcmVhZG9ubHkgY2F0ZWdvcnk6IENvbW1hbmRDYXRlZ29yeSA9IFwiZGV2XCI7XHJcbiAgICBwdWJsaWMgcmVhZG9ubHkgY2hlYXRzUmVxdWlyZWQgPSB0cnVlO1xyXG4gICAgcHVibGljIHJlYWRvbmx5IGV4ZWN1dGlvbkxpbWl0OiBFeGVjdXRpb25MaW1pdCA9IFwicGxheWVyc1wiO1xyXG4gICAgcHJvdGVjdGVkIHJlYWRvbmx5IGRlc2NyaXB0aW9uID0gXCJQcmludHMgdGhlIHNraW4gcmFuZG9taXplciB2YWx1ZXMgZm9yIHRoZSBuZWFyZXN0IEFJUCBlbnRpdHlcIjtcclxuXHJcbiAgICBwdWJsaWMgaGFuZGxlcihvcmlnaW46IEN1c3RvbUNvbW1hbmRPcmlnaW4pIHtcclxuICAgICAgICBjb25zdCBwbGF5ZXIgPSBvcmlnaW4uc291cmNlRW50aXR5IGFzIFBsYXllcjtcclxuICAgICAgICBzeXN0ZW0ucnVuKCgpID0+IHRoaXMucmVwb3J0KHBsYXllcikpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgcmVwb3J0KHBsYXllcjogUGxheWVyKSB7XHJcbiAgICAgICAgY29uc3QgcXVlcnk6IEVudGl0eVF1ZXJ5T3B0aW9ucyA9IHtcclxuICAgICAgICAgICAgbG9jYXRpb246IHBsYXllci5sb2NhdGlvbixcclxuICAgICAgICAgICAgY2xvc2VzdDogMSxcclxuICAgICAgICAgICAgdHlwZTogXCJnbTFfc2t5OmFpcFwiLFxyXG4gICAgICAgIH07XHJcblxyXG4gICAgICAgIGNvbnN0IG5lYXJlc3QgPSBFbnRpdHlVdGlsLmdldEVudGl0aWVzKHF1ZXJ5KVswXTtcclxuXHJcbiAgICAgICAgaWYgKCFuZWFyZXN0KSB7XHJcbiAgICAgICAgICAgIEJyb2FkY2FzdFV0aWwuc2F5KFwiwqdjTm8gQUlQIGVudGl0aWVzIGZvdW5kIG5lYXJieS5cIiwgW3BsYXllcl0pO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBjb25zdCBsaW5lcyA9IFtcclxuICAgICAgICAgICAgYMKnZU5hbWU6ICAgICAgICDCp2Yke25lYXJlc3QubmFtZVRhZ31gLFxyXG4gICAgICAgICAgICBgwqdlQm9keXR5cGU6ICAgIMKnZiR7bmVhcmVzdC5nZXRQcm9wZXJ0eShcImdtMV9za3k6Ym9keXR5cGVcIil9YCxcclxuICAgICAgICAgICAgYMKnZUJhc2U6ICAgICAgICDCp2Yke25lYXJlc3QuZ2V0UHJvcGVydHkoXCJnbTFfc2t5OmJhc2VcIil9YCxcclxuICAgICAgICAgICAgYMKnZVNoaXJ0OiAgICAgICDCp2Yke25lYXJlc3QuZ2V0UHJvcGVydHkoXCJnbTFfc2t5OnNoaXJ0XCIpfWAsXHJcbiAgICAgICAgICAgIGDCp2VQYW50czogICAgICAgwqdmJHtuZWFyZXN0LmdldFByb3BlcnR5KFwiZ20xX3NreTpwYW50c1wiKX1gLFxyXG4gICAgICAgICAgICBgwqdlRXllczogICAgICAgIMKnZiR7bmVhcmVzdC5nZXRQcm9wZXJ0eShcImdtMV9za3k6ZXllc1wiKX1gLFxyXG4gICAgICAgICAgICBgwqdlRXllcyBDb2xvcjogIMKnZiR7bmVhcmVzdC5nZXRQcm9wZXJ0eShcImdtMV9za3k6ZXllc19jb2xvclwiKX1gLFxyXG4gICAgICAgICAgICBgwqdlTW91dGg6ICAgICAgIMKnZiR7bmVhcmVzdC5nZXRQcm9wZXJ0eShcImdtMV9za3k6bW91dGhcIil9YCxcclxuICAgICAgICAgICAgYMKnZU1vdXRoIENvbG9yOiDCp2Yke25lYXJlc3QuZ2V0UHJvcGVydHkoXCJnbTFfc2t5Om1vdXRoX2NvbG9yXCIpfWAsXHJcbiAgICAgICAgICAgIGDCp2VIYWlyOiAgICAgICAgwqdmJHtuZWFyZXN0LmdldFByb3BlcnR5KFwiZ20xX3NreTpoYWlyXCIpfWAsXHJcbiAgICAgICAgICAgIGDCp2VIYWlyIENvbG9yOiAgwqdmJHtuZWFyZXN0LmdldFByb3BlcnR5KFwiZ20xX3NreTpoYWlyX2NvbG9yXCIpfWAsXHJcbiAgICAgICAgXTtcclxuICAgICAgICBCcm9hZGNhc3RVdGlsLnNheShsaW5lcy5qb2luKFwiXFxuXCIpLCBbcGxheWVyXSk7XHJcbiAgICB9XHJcbn1cclxuIl0sIm5hbWVzIjpbInN5c3RlbSIsIkFic3RyYWN0Q29tbWFuZCIsIlNraW5SZXBvcnRDb21tYW5kIiwiaGFuZGxlciIsIm9yaWdpbiIsInBsYXllciIsInNvdXJjZUVudGl0eSIsInJ1biIsInJlcG9ydCIsInF1ZXJ5IiwibG9jYXRpb24iLCJjbG9zZXN0IiwidHlwZSIsIm5lYXJlc3QiLCJFbnRpdHlVdGlsIiwiZ2V0RW50aXRpZXMiLCJCcm9hZGNhc3RVdGlsIiwic2F5IiwibGluZXMiLCJuYW1lVGFnIiwiZ2V0UHJvcGVydHkiLCJqb2luIiwibmFtZSIsImNhdGVnb3J5IiwiY2hlYXRzUmVxdWlyZWQiLCJleGVjdXRpb25MaW1pdCIsImRlc2NyaXB0aW9uIl0sIm1hcHBpbmdzIjoiQUFBQSxTQUEwREEsTUFBTSxRQUFRLG9CQUFvQjtBQUM1RixTQUFTQyxlQUFlLFFBQXlDLDJCQUEyQjtBQUU1RixPQUFPLE1BQU1DLDBCQUEwQkQ7SUFPNUJFLFFBQVFDLE1BQTJCLEVBQUU7UUFDeEMsTUFBTUMsU0FBU0QsT0FBT0UsWUFBWTtRQUNsQ04sT0FBT08sR0FBRyxDQUFDLElBQU0sSUFBSSxDQUFDQyxNQUFNLENBQUNIO0lBQ2pDO0lBRVFHLE9BQU9ILE1BQWMsRUFBRTtRQUMzQixNQUFNSSxRQUE0QjtZQUM5QkMsVUFBVUwsT0FBT0ssUUFBUTtZQUN6QkMsU0FBUztZQUNUQyxNQUFNO1FBQ1Y7UUFFQSxNQUFNQyxVQUFVQyxXQUFXQyxXQUFXLENBQUNOLE1BQU0sQ0FBQyxFQUFFO1FBRWhELElBQUksQ0FBQ0ksU0FBUztZQUNWRyxjQUFjQyxHQUFHLENBQUMsbUNBQW1DO2dCQUFDWjthQUFPO1lBQzdEO1FBQ0o7UUFFQSxNQUFNYSxRQUFRO1lBQ1YsQ0FBQyxpQkFBaUIsRUFBRUwsUUFBUU0sT0FBTyxDQUFDLENBQUM7WUFDckMsQ0FBQyxpQkFBaUIsRUFBRU4sUUFBUU8sV0FBVyxDQUFDLG9CQUFvQixDQUFDO1lBQzdELENBQUMsaUJBQWlCLEVBQUVQLFFBQVFPLFdBQVcsQ0FBQyxnQkFBZ0IsQ0FBQztZQUN6RCxDQUFDLGlCQUFpQixFQUFFUCxRQUFRTyxXQUFXLENBQUMsaUJBQWlCLENBQUM7WUFDMUQsQ0FBQyxpQkFBaUIsRUFBRVAsUUFBUU8sV0FBVyxDQUFDLGlCQUFpQixDQUFDO1lBQzFELENBQUMsaUJBQWlCLEVBQUVQLFFBQVFPLFdBQVcsQ0FBQyxnQkFBZ0IsQ0FBQztZQUN6RCxDQUFDLGlCQUFpQixFQUFFUCxRQUFRTyxXQUFXLENBQUMsc0JBQXNCLENBQUM7WUFDL0QsQ0FBQyxpQkFBaUIsRUFBRVAsUUFBUU8sV0FBVyxDQUFDLGlCQUFpQixDQUFDO1lBQzFELENBQUMsaUJBQWlCLEVBQUVQLFFBQVFPLFdBQVcsQ0FBQyx1QkFBdUIsQ0FBQztZQUNoRSxDQUFDLGlCQUFpQixFQUFFUCxRQUFRTyxXQUFXLENBQUMsZ0JBQWdCLENBQUM7WUFDekQsQ0FBQyxpQkFBaUIsRUFBRVAsUUFBUU8sV0FBVyxDQUFDLHNCQUFzQixDQUFDO1NBQ2xFO1FBQ0RKLGNBQWNDLEdBQUcsQ0FBQ0MsTUFBTUcsSUFBSSxDQUFDLE9BQU87WUFBQ2hCO1NBQU87SUFDaEQ7OzthQXZDZ0JpQixPQUFPO2FBQ1BDLFdBQTRCO2FBQzVCQyxpQkFBaUI7YUFDakJDLGlCQUFpQzthQUM5QkMsY0FBYzs7QUFvQ3JDIn0=