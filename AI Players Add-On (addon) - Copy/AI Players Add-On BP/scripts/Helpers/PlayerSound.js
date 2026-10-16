import { Player } from "@minecraft/server";
class PlayerSound {
    /**
     * Plays a sound for one or more players with the specified options.
     * @param players - A single player or an array of players to play the sound for.
     * @param options - Optional configuration for the sound playback. If not provided, default options will be used.
     */ play(players, options) {
        // merge the options, with the options passed in taking priority.
        const optionsToUse = {
            ...this.options,
            ...options
        };
        const playIfValid = (player)=>{
            if (player.isValid) {
                player.playSound(this.name, optionsToUse);
            }
        };
        if (players instanceof Player) playIfValid(players);
        else players.forEach((player)=>playIfValid(player));
    }
    constructor(name, options){
        this.name = name;
        this.options = options;
    }
}
export { PlayerSound as default };

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIlBsYXllclNvdW5kLnRzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IFBsYXllciwgUGxheWVyU291bmRPcHRpb25zIH0gZnJvbSBcIkBtaW5lY3JhZnQvc2VydmVyXCI7XHJcblxyXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBQbGF5ZXJTb3VuZCB7XHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IoXHJcbiAgICAgICAgcHVibGljIG5hbWU6IHN0cmluZyxcclxuICAgICAgICBwcml2YXRlIHJlYWRvbmx5IG9wdGlvbnM/OiBQbGF5ZXJTb3VuZE9wdGlvbnNcclxuICAgICkge31cclxuXHJcbiAgICAvKipcclxuICAgICAqIFBsYXlzIGEgc291bmQgZm9yIG9uZSBvciBtb3JlIHBsYXllcnMgd2l0aCB0aGUgc3BlY2lmaWVkIG9wdGlvbnMuXHJcbiAgICAgKiBAcGFyYW0gcGxheWVycyAtIEEgc2luZ2xlIHBsYXllciBvciBhbiBhcnJheSBvZiBwbGF5ZXJzIHRvIHBsYXkgdGhlIHNvdW5kIGZvci5cclxuICAgICAqIEBwYXJhbSBvcHRpb25zIC0gT3B0aW9uYWwgY29uZmlndXJhdGlvbiBmb3IgdGhlIHNvdW5kIHBsYXliYWNrLiBJZiBub3QgcHJvdmlkZWQsIGRlZmF1bHQgb3B0aW9ucyB3aWxsIGJlIHVzZWQuXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBwbGF5KHBsYXllcnM6IFBsYXllciB8IFBsYXllcltdLCBvcHRpb25zPzogUGxheWVyU291bmRPcHRpb25zKSB7XHJcbiAgICAgICAgLy8gbWVyZ2UgdGhlIG9wdGlvbnMsIHdpdGggdGhlIG9wdGlvbnMgcGFzc2VkIGluIHRha2luZyBwcmlvcml0eS5cclxuICAgICAgICBjb25zdCBvcHRpb25zVG9Vc2UgPSB7IC4uLnRoaXMub3B0aW9ucywgLi4ub3B0aW9ucyB9O1xyXG5cclxuICAgICAgICBjb25zdCBwbGF5SWZWYWxpZCA9IChwbGF5ZXI6IFBsYXllcikgPT4ge1xyXG4gICAgICAgICAgICBpZiAocGxheWVyLmlzVmFsaWQpIHtcclxuICAgICAgICAgICAgICAgIHBsYXllci5wbGF5U291bmQodGhpcy5uYW1lLCBvcHRpb25zVG9Vc2UpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfTtcclxuXHJcbiAgICAgICAgaWYgKHBsYXllcnMgaW5zdGFuY2VvZiBQbGF5ZXIpIHBsYXlJZlZhbGlkKHBsYXllcnMpO1xyXG4gICAgICAgIGVsc2UgcGxheWVycy5mb3JFYWNoKChwbGF5ZXIpID0+IHBsYXlJZlZhbGlkKHBsYXllcikpO1xyXG4gICAgfVxyXG59XHJcbiJdLCJuYW1lcyI6WyJQbGF5ZXIiLCJQbGF5ZXJTb3VuZCIsInBsYXkiLCJwbGF5ZXJzIiwib3B0aW9ucyIsIm9wdGlvbnNUb1VzZSIsInBsYXlJZlZhbGlkIiwicGxheWVyIiwiaXNWYWxpZCIsInBsYXlTb3VuZCIsIm5hbWUiLCJmb3JFYWNoIl0sIm1hcHBpbmdzIjoiQUFBQSxTQUFTQSxNQUFNLFFBQTRCLG9CQUFvQjtBQUVoRCxNQUFNQztJQU1qQjs7OztLQUlDLEdBQ0QsQUFBT0MsS0FBS0MsT0FBMEIsRUFBRUMsT0FBNEIsRUFBRTtRQUNsRSxpRUFBaUU7UUFDakUsTUFBTUMsZUFBZTtZQUFFLEdBQUcsSUFBSSxDQUFDRCxPQUFPO1lBQUUsR0FBR0EsT0FBTztRQUFDO1FBRW5ELE1BQU1FLGNBQWMsQ0FBQ0M7WUFDakIsSUFBSUEsT0FBT0MsT0FBTyxFQUFFO2dCQUNoQkQsT0FBT0UsU0FBUyxDQUFDLElBQUksQ0FBQ0MsSUFBSSxFQUFFTDtZQUNoQztRQUNKO1FBRUEsSUFBSUYsbUJBQW1CSCxRQUFRTSxZQUFZSDthQUN0Q0EsUUFBUVEsT0FBTyxDQUFDLENBQUNKLFNBQVdELFlBQVlDO0lBQ2pEO0lBdEJBLFlBQ0ksQUFBT0csSUFBWSxFQUNuQixBQUFpQk4sT0FBNEIsQ0FDL0M7YUFGU00sT0FBQUE7YUFDVU4sVUFBQUE7SUFDbEI7QUFvQlA7QUF4QkEsU0FBcUJILHlCQXdCcEIifQ==