import BuildData from "Data/BuildData";
import { MobComponentPlayer } from "../AbstractMobComponent";
class WatermarkComponent extends MobComponentPlayer {
    process() {
        const title = this.getTitle();
        this.entity.onScreenDisplay.setTitle(title);
    }
    getTitle() {
        if (!BuildData.EnableWatermark) return "§r";
        return {
            rawtext: [
                {
                    translate: "build.id"
                },
                {
                    text: "/"
                },
                {
                    text: this.entity.nameTag
                }
            ]
        };
    }
    constructor(entity){
        super(entity, 1);
        if (!BuildData.EnableWatermark) {
            this.destroy();
        }
    }
}
export { WatermarkComponent as default };

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIldhdGVybWFya0NvbXBvbmVudC50cyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBFbnRpdHksIFJhd01lc3NhZ2UgfSBmcm9tIFwiQG1pbmVjcmFmdC9zZXJ2ZXJcIjtcclxuaW1wb3J0IEJ1aWxkRGF0YSBmcm9tIFwiRGF0YS9CdWlsZERhdGFcIjtcclxuaW1wb3J0IHsgTW9iQ29tcG9uZW50UGxheWVyIH0gZnJvbSBcIi4uL0Fic3RyYWN0TW9iQ29tcG9uZW50XCI7XHJcblxyXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBXYXRlcm1hcmtDb21wb25lbnQgZXh0ZW5kcyBNb2JDb21wb25lbnRQbGF5ZXIge1xyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKGVudGl0eTogRW50aXR5KSB7XHJcbiAgICAgICAgc3VwZXIoZW50aXR5LCAxKTtcclxuICAgICAgICBpZiAoIUJ1aWxkRGF0YS5FbmFibGVXYXRlcm1hcmspIHtcclxuICAgICAgICAgICAgdGhpcy5kZXN0cm95KCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHB1YmxpYyBwcm9jZXNzKCkge1xyXG4gICAgICAgIGNvbnN0IHRpdGxlID0gdGhpcy5nZXRUaXRsZSgpO1xyXG4gICAgICAgIHRoaXMuZW50aXR5Lm9uU2NyZWVuRGlzcGxheS5zZXRUaXRsZSh0aXRsZSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBnZXRUaXRsZSgpOiBSYXdNZXNzYWdlIHwgc3RyaW5nIHtcclxuICAgICAgICBpZiAoIUJ1aWxkRGF0YS5FbmFibGVXYXRlcm1hcmspIHJldHVybiBcIsKnclwiO1xyXG4gICAgICAgIHJldHVybiB7IHJhd3RleHQ6IFt7IHRyYW5zbGF0ZTogXCJidWlsZC5pZFwiIH0sIHsgdGV4dDogXCIvXCIgfSwgeyB0ZXh0OiB0aGlzLmVudGl0eS5uYW1lVGFnIH1dIH07XHJcbiAgICB9XHJcbn1cclxuIl0sIm5hbWVzIjpbIkJ1aWxkRGF0YSIsIk1vYkNvbXBvbmVudFBsYXllciIsIldhdGVybWFya0NvbXBvbmVudCIsInByb2Nlc3MiLCJ0aXRsZSIsImdldFRpdGxlIiwiZW50aXR5Iiwib25TY3JlZW5EaXNwbGF5Iiwic2V0VGl0bGUiLCJFbmFibGVXYXRlcm1hcmsiLCJyYXd0ZXh0IiwidHJhbnNsYXRlIiwidGV4dCIsIm5hbWVUYWciLCJkZXN0cm95Il0sIm1hcHBpbmdzIjoiQUFDQSxPQUFPQSxlQUFlLGlCQUFpQjtBQUN2QyxTQUFTQyxrQkFBa0IsUUFBUSwwQkFBMEI7QUFFOUMsTUFBTUMsMkJBQTJCRDtJQVFyQ0UsVUFBVTtRQUNiLE1BQU1DLFFBQVEsSUFBSSxDQUFDQyxRQUFRO1FBQzNCLElBQUksQ0FBQ0MsTUFBTSxDQUFDQyxlQUFlLENBQUNDLFFBQVEsQ0FBQ0o7SUFDekM7SUFFUUMsV0FBZ0M7UUFDcEMsSUFBSSxDQUFDTCxVQUFVUyxlQUFlLEVBQUUsT0FBTztRQUN2QyxPQUFPO1lBQUVDLFNBQVM7Z0JBQUM7b0JBQUVDLFdBQVc7Z0JBQVc7Z0JBQUc7b0JBQUVDLE1BQU07Z0JBQUk7Z0JBQUc7b0JBQUVBLE1BQU0sSUFBSSxDQUFDTixNQUFNLENBQUNPLE9BQU87Z0JBQUM7YUFBRTtRQUFDO0lBQ2hHO0lBZkEsWUFBbUJQLE1BQWMsQ0FBRTtRQUMvQixLQUFLLENBQUNBLFFBQVE7UUFDZCxJQUFJLENBQUNOLFVBQVVTLGVBQWUsRUFBRTtZQUM1QixJQUFJLENBQUNLLE9BQU87UUFDaEI7SUFDSjtBQVdKO0FBakJBLFNBQXFCWixnQ0FpQnBCIn0=