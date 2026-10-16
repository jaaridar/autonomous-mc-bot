import { world } from "@minecraft/server";
class _BroadcastUtil {
    /**
     * Sends a message to the specified players or to all players in the world.
     * @param message - The message to be sent, supports a string or raw message.
     * @param players - An optional array of players to send the message to. If not provided, the message will be sent to all players in the world.
     */ static say(message, players = null) {
        if (players === null) world.sendMessage(message);
        else {
            for (const player of players){
                player.sendMessage(message);
            }
        }
    }
    /**
     * Translates a localization key into a message and broadcasts it to specified players.
     * @param locKey - The localization key to translate.
     * @param translateWith - An optional array of strings or raw messages to be used as translation parameters.
     * @param players - An optional array of players to broadcast the translated message to.
     * @param prefixFormatting - An optional string to be used as a prefix formatting for the translated message.
     * @example
     * // Simple translate with a key
     * BroadcastUtil.translate("gm1.welcome");
     * @example
     * // Translate with a key and a string in translateWith
     * BroadcastUtil.translate("gm1.points_earned", ["100"]);
     * @example
     * // Translate with a key and prefix
     * BroadcastUtil.translate("gm1.level_up", null, null, "§6[Level Up] ");
     * @example
     * // Translate and send only to specific players
     * BroadcastUtil.translate(
     *   "gm1.welcome",
     *   null,
     *   [player1, player2]
     * );
     * @example
     * // Translate with multiple values, including a nested translation
     * BroadcastUtil.translate(
     *   "gm1.life_lost",
     *   [player.name, { translate: `item.${item.typeId}.name` }]
     * );
     */ static translate(locKey, translateWith = null, players = null, prefixFormatting = null) {
        const mapTranslateWithItem = (item)=>{
            if (typeof item === "string") {
                return {
                    text: item
                };
            } else if (item && typeof item === "object") {
                return item;
            }
            console.warn("Invalid item type in translateWith array:", item);
            return {
                text: String(item)
            };
        };
        const mappedTranslateWith = translateWith ? translateWith.map(mapTranslateWithItem) : undefined;
        const message = {
            rawtext: [
                {
                    text: prefixFormatting ? prefixFormatting : ""
                },
                {
                    translate: locKey,
                    with: translateWith ? {
                        rawtext: mappedTranslateWith
                    } : undefined
                }
            ]
        };
        this.say(message, players);
    }
    /**
     * Logs a message with the prefix and suffix for the dash clipboard tool
     * @param message - The message to be logged.
     * @remarks This can be used in conjuction with logpiler to create tools with dash.
     */ static clipboard(message) {
        console.log(`clipboard-start${message}clipboard-end`);
    }
    /**
     * Logs a debug message.
     * @param message - The message to be logged.
     * @remarks The players needs the "dev" tag to see the message.
     */ static debug(message) {
        DebugTimer.countStart("BroadcastUtil.debug");
        this.say(`§2>§r ${message}`, world.getPlayers().filter((player)=>player.hasTag("dev")));
        DebugTimer.countEnd();
    }
    /**
     * Sets the action bar message for the specified players.
     * If no players are provided, the action bar message will be set for all players in the world.
     * @param message - The message to be displayed on the action bar.
     * @param players - An optional array of players to set the action bar message for. If not provided, the message will be set for all players in the world.
     * @remarks You should probably use the notification system instead of this.
     */ static actionbar(message, players = null) {
        DebugTimer.countStart("BroadcastUtil.actionbar");
        if (players === null) players = world.getPlayers();
        for (const player of players)player.onScreenDisplay.setActionBar(message);
        DebugTimer.countEnd();
    }
    /**
     * Sets the title message for the specified players.
     * @param message - The message to display as the title.
     * @param players - The players to display the title to. If not provided, all players in the world will be used.
     * @param options - The options for displaying the title. If not provided, default options will be used.
     */ static title(message, players = null, options = undefined) {
        DebugTimer.countStart("BroadcastUtil.title");
        if (players === null) players = world.getPlayers();
        for (const player of players)player.onScreenDisplay.setTitle(message, options);
        DebugTimer.countEnd();
    }
    /**
     * Displays a subtitle message to the specified players or all players in the world.
     * @param message - The message to display as a subtitle.
     * @param players - (Optional) The players to display the subtitle to. If not provided, the subtitle will be displayed to all players in the world.
     */ static subtitle(message, players = null) {
        DebugTimer.countStart("BroadcastUtil.subtitle");
        if (players === null) players = world.getPlayers();
        for (const player of players)player.onScreenDisplay.updateSubtitle(message);
        DebugTimer.countEnd();
    }
    /**
     * Sends a JSON.stringify() message to the specified players or to all players in the world.
     * @param data - An array or object to send in chat as a message
     * @param players - An optional array of players to send the message to. If not provided, the message will be sent to all players in the world.
     */ static stringifyData(data, space = 2, players = null) {
        this.say(JSON.stringify(data, null, space), players);
    }
    /**
     * Converts a `CustomCommandOrigin.sourceEntity` to a data type which BroadcastUtil message printing can use.
     * @param target A `CustomCommandOrigin.sourceEntity` entity
     * @returns Either a list of 1 player or null
     */ static devPrintRecipients(target) {
        let sourcePlayer = target;
        if (sourcePlayer === undefined) sourcePlayer = null;
        return sourcePlayer === null ? null : [
            sourcePlayer
        ];
    }
}
globalThis.BroadcastUtil = _BroadcastUtil;

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkJyb2FkY2FzdFV0aWwudHMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgRW50aXR5LCBQbGF5ZXIsIFJhd01lc3NhZ2UsIFRpdGxlRGlzcGxheU9wdGlvbnMsIHdvcmxkIH0gZnJvbSBcIkBtaW5lY3JhZnQvc2VydmVyXCI7XHJcbmltcG9ydCB7IE1heWJlIH0gZnJvbSBcIlR5cGluZy9UeXBlcy9HZW5lcmljVHlwZXNcIjtcclxuaW1wb3J0IHsgTWVzc2FnZSB9IGZyb20gXCIuLi9UeXBpbmcvVHlwZXMvTWVzc2FnZVwiO1xyXG5cclxuY2xhc3MgX0Jyb2FkY2FzdFV0aWwge1xyXG4gICAgLyoqXHJcbiAgICAgKiBTZW5kcyBhIG1lc3NhZ2UgdG8gdGhlIHNwZWNpZmllZCBwbGF5ZXJzIG9yIHRvIGFsbCBwbGF5ZXJzIGluIHRoZSB3b3JsZC5cclxuICAgICAqIEBwYXJhbSBtZXNzYWdlIC0gVGhlIG1lc3NhZ2UgdG8gYmUgc2VudCwgc3VwcG9ydHMgYSBzdHJpbmcgb3IgcmF3IG1lc3NhZ2UuXHJcbiAgICAgKiBAcGFyYW0gcGxheWVycyAtIEFuIG9wdGlvbmFsIGFycmF5IG9mIHBsYXllcnMgdG8gc2VuZCB0aGUgbWVzc2FnZSB0by4gSWYgbm90IHByb3ZpZGVkLCB0aGUgbWVzc2FnZSB3aWxsIGJlIHNlbnQgdG8gYWxsIHBsYXllcnMgaW4gdGhlIHdvcmxkLlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHNheShtZXNzYWdlOiBNZXNzYWdlLCBwbGF5ZXJzOiBNYXliZTxQbGF5ZXJbXT4gPSBudWxsKSB7XHJcbiAgICAgICAgaWYgKHBsYXllcnMgPT09IG51bGwpIHdvcmxkLnNlbmRNZXNzYWdlKG1lc3NhZ2UpO1xyXG4gICAgICAgIGVsc2Uge1xyXG4gICAgICAgICAgICBmb3IgKGNvbnN0IHBsYXllciBvZiBwbGF5ZXJzKSB7XHJcbiAgICAgICAgICAgICAgICBwbGF5ZXIuc2VuZE1lc3NhZ2UobWVzc2FnZSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBUcmFuc2xhdGVzIGEgbG9jYWxpemF0aW9uIGtleSBpbnRvIGEgbWVzc2FnZSBhbmQgYnJvYWRjYXN0cyBpdCB0byBzcGVjaWZpZWQgcGxheWVycy5cclxuICAgICAqIEBwYXJhbSBsb2NLZXkgLSBUaGUgbG9jYWxpemF0aW9uIGtleSB0byB0cmFuc2xhdGUuXHJcbiAgICAgKiBAcGFyYW0gdHJhbnNsYXRlV2l0aCAtIEFuIG9wdGlvbmFsIGFycmF5IG9mIHN0cmluZ3Mgb3IgcmF3IG1lc3NhZ2VzIHRvIGJlIHVzZWQgYXMgdHJhbnNsYXRpb24gcGFyYW1ldGVycy5cclxuICAgICAqIEBwYXJhbSBwbGF5ZXJzIC0gQW4gb3B0aW9uYWwgYXJyYXkgb2YgcGxheWVycyB0byBicm9hZGNhc3QgdGhlIHRyYW5zbGF0ZWQgbWVzc2FnZSB0by5cclxuICAgICAqIEBwYXJhbSBwcmVmaXhGb3JtYXR0aW5nIC0gQW4gb3B0aW9uYWwgc3RyaW5nIHRvIGJlIHVzZWQgYXMgYSBwcmVmaXggZm9ybWF0dGluZyBmb3IgdGhlIHRyYW5zbGF0ZWQgbWVzc2FnZS5cclxuICAgICAqIEBleGFtcGxlXHJcbiAgICAgKiAvLyBTaW1wbGUgdHJhbnNsYXRlIHdpdGggYSBrZXlcclxuICAgICAqIEJyb2FkY2FzdFV0aWwudHJhbnNsYXRlKFwiZ20xLndlbGNvbWVcIik7XHJcbiAgICAgKiBAZXhhbXBsZVxyXG4gICAgICogLy8gVHJhbnNsYXRlIHdpdGggYSBrZXkgYW5kIGEgc3RyaW5nIGluIHRyYW5zbGF0ZVdpdGhcclxuICAgICAqIEJyb2FkY2FzdFV0aWwudHJhbnNsYXRlKFwiZ20xLnBvaW50c19lYXJuZWRcIiwgW1wiMTAwXCJdKTtcclxuICAgICAqIEBleGFtcGxlXHJcbiAgICAgKiAvLyBUcmFuc2xhdGUgd2l0aCBhIGtleSBhbmQgcHJlZml4XHJcbiAgICAgKiBCcm9hZGNhc3RVdGlsLnRyYW5zbGF0ZShcImdtMS5sZXZlbF91cFwiLCBudWxsLCBudWxsLCBcIsKnNltMZXZlbCBVcF0gXCIpO1xyXG4gICAgICogQGV4YW1wbGVcclxuICAgICAqIC8vIFRyYW5zbGF0ZSBhbmQgc2VuZCBvbmx5IHRvIHNwZWNpZmljIHBsYXllcnNcclxuICAgICAqIEJyb2FkY2FzdFV0aWwudHJhbnNsYXRlKFxyXG4gICAgICogICBcImdtMS53ZWxjb21lXCIsXHJcbiAgICAgKiAgIG51bGwsXHJcbiAgICAgKiAgIFtwbGF5ZXIxLCBwbGF5ZXIyXVxyXG4gICAgICogKTtcclxuICAgICAqIEBleGFtcGxlXHJcbiAgICAgKiAvLyBUcmFuc2xhdGUgd2l0aCBtdWx0aXBsZSB2YWx1ZXMsIGluY2x1ZGluZyBhIG5lc3RlZCB0cmFuc2xhdGlvblxyXG4gICAgICogQnJvYWRjYXN0VXRpbC50cmFuc2xhdGUoXHJcbiAgICAgKiAgIFwiZ20xLmxpZmVfbG9zdFwiLFxyXG4gICAgICogICBbcGxheWVyLm5hbWUsIHsgdHJhbnNsYXRlOiBgaXRlbS4ke2l0ZW0udHlwZUlkfS5uYW1lYCB9XVxyXG4gICAgICogKTtcclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyB0cmFuc2xhdGUoXHJcbiAgICAgICAgbG9jS2V5OiBzdHJpbmcsXHJcbiAgICAgICAgdHJhbnNsYXRlV2l0aDogTWF5YmU8KHN0cmluZyB8IFJhd01lc3NhZ2UpW10+ID0gbnVsbCxcclxuICAgICAgICBwbGF5ZXJzOiBNYXliZTxQbGF5ZXJbXT4gPSBudWxsLFxyXG4gICAgICAgIHByZWZpeEZvcm1hdHRpbmc6IE1heWJlPHN0cmluZz4gPSBudWxsXHJcbiAgICApIHtcclxuICAgICAgICBjb25zdCBtYXBUcmFuc2xhdGVXaXRoSXRlbSA9IChpdGVtOiBzdHJpbmcgfCBSYXdNZXNzYWdlKSA9PiB7XHJcbiAgICAgICAgICAgIGlmICh0eXBlb2YgaXRlbSA9PT0gXCJzdHJpbmdcIikge1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgdGV4dDogaXRlbSB9O1xyXG4gICAgICAgICAgICB9IGVsc2UgaWYgKGl0ZW0gJiYgdHlwZW9mIGl0ZW0gPT09IFwib2JqZWN0XCIpIHtcclxuICAgICAgICAgICAgICAgIHJldHVybiBpdGVtO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGNvbnNvbGUud2FybihcIkludmFsaWQgaXRlbSB0eXBlIGluIHRyYW5zbGF0ZVdpdGggYXJyYXk6XCIsIGl0ZW0pO1xyXG4gICAgICAgICAgICByZXR1cm4geyB0ZXh0OiBTdHJpbmcoaXRlbSkgfTtcclxuICAgICAgICB9O1xyXG4gICAgICAgIGNvbnN0IG1hcHBlZFRyYW5zbGF0ZVdpdGggPSB0cmFuc2xhdGVXaXRoID8gdHJhbnNsYXRlV2l0aC5tYXAobWFwVHJhbnNsYXRlV2l0aEl0ZW0pIDogdW5kZWZpbmVkO1xyXG4gICAgICAgIGNvbnN0IG1lc3NhZ2U6IE1lc3NhZ2UgPSB7XHJcbiAgICAgICAgICAgIHJhd3RleHQ6IFtcclxuICAgICAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgICAgICB0ZXh0OiBwcmVmaXhGb3JtYXR0aW5nID8gcHJlZml4Rm9ybWF0dGluZyA6IFwiXCIsXHJcbiAgICAgICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgICAgIHRyYW5zbGF0ZTogbG9jS2V5LFxyXG4gICAgICAgICAgICAgICAgICAgIHdpdGg6IHRyYW5zbGF0ZVdpdGhcclxuICAgICAgICAgICAgICAgICAgICAgICAgPyB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJhd3RleHQ6IG1hcHBlZFRyYW5zbGF0ZVdpdGgsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICA6IHVuZGVmaW5lZCxcclxuICAgICAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgIF0sXHJcbiAgICAgICAgfTtcclxuICAgICAgICB0aGlzLnNheShtZXNzYWdlLCBwbGF5ZXJzKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIExvZ3MgYSBtZXNzYWdlIHdpdGggdGhlIHByZWZpeCBhbmQgc3VmZml4IGZvciB0aGUgZGFzaCBjbGlwYm9hcmQgdG9vbFxyXG4gICAgICogQHBhcmFtIG1lc3NhZ2UgLSBUaGUgbWVzc2FnZSB0byBiZSBsb2dnZWQuXHJcbiAgICAgKiBAcmVtYXJrcyBUaGlzIGNhbiBiZSB1c2VkIGluIGNvbmp1Y3Rpb24gd2l0aCBsb2dwaWxlciB0byBjcmVhdGUgdG9vbHMgd2l0aCBkYXNoLlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGNsaXBib2FyZChtZXNzYWdlOiBzdHJpbmcpIHtcclxuICAgICAgICBjb25zb2xlLmxvZyhgY2xpcGJvYXJkLXN0YXJ0JHttZXNzYWdlfWNsaXBib2FyZC1lbmRgKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIExvZ3MgYSBkZWJ1ZyBtZXNzYWdlLlxyXG4gICAgICogQHBhcmFtIG1lc3NhZ2UgLSBUaGUgbWVzc2FnZSB0byBiZSBsb2dnZWQuXHJcbiAgICAgKiBAcmVtYXJrcyBUaGUgcGxheWVycyBuZWVkcyB0aGUgXCJkZXZcIiB0YWcgdG8gc2VlIHRoZSBtZXNzYWdlLlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGRlYnVnKG1lc3NhZ2U6IHN0cmluZykge1xyXG4gICAgICAgIERlYnVnVGltZXIuY291bnRTdGFydChcIkJyb2FkY2FzdFV0aWwuZGVidWdcIik7XHJcbiAgICAgICAgdGhpcy5zYXkoXHJcbiAgICAgICAgICAgIGDCpzI+wqdyICR7bWVzc2FnZX1gLFxyXG4gICAgICAgICAgICB3b3JsZC5nZXRQbGF5ZXJzKCkuZmlsdGVyKChwbGF5ZXIpID0+IHBsYXllci5oYXNUYWcoXCJkZXZcIikpXHJcbiAgICAgICAgKTtcclxuICAgICAgICBEZWJ1Z1RpbWVyLmNvdW50RW5kKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBTZXRzIHRoZSBhY3Rpb24gYmFyIG1lc3NhZ2UgZm9yIHRoZSBzcGVjaWZpZWQgcGxheWVycy5cclxuICAgICAqIElmIG5vIHBsYXllcnMgYXJlIHByb3ZpZGVkLCB0aGUgYWN0aW9uIGJhciBtZXNzYWdlIHdpbGwgYmUgc2V0IGZvciBhbGwgcGxheWVycyBpbiB0aGUgd29ybGQuXHJcbiAgICAgKiBAcGFyYW0gbWVzc2FnZSAtIFRoZSBtZXNzYWdlIHRvIGJlIGRpc3BsYXllZCBvbiB0aGUgYWN0aW9uIGJhci5cclxuICAgICAqIEBwYXJhbSBwbGF5ZXJzIC0gQW4gb3B0aW9uYWwgYXJyYXkgb2YgcGxheWVycyB0byBzZXQgdGhlIGFjdGlvbiBiYXIgbWVzc2FnZSBmb3IuIElmIG5vdCBwcm92aWRlZCwgdGhlIG1lc3NhZ2Ugd2lsbCBiZSBzZXQgZm9yIGFsbCBwbGF5ZXJzIGluIHRoZSB3b3JsZC5cclxuICAgICAqIEByZW1hcmtzIFlvdSBzaG91bGQgcHJvYmFibHkgdXNlIHRoZSBub3RpZmljYXRpb24gc3lzdGVtIGluc3RlYWQgb2YgdGhpcy5cclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBhY3Rpb25iYXIobWVzc2FnZTogTWVzc2FnZSwgcGxheWVyczogTWF5YmU8UGxheWVyW10+ID0gbnVsbCkge1xyXG4gICAgICAgIERlYnVnVGltZXIuY291bnRTdGFydChcIkJyb2FkY2FzdFV0aWwuYWN0aW9uYmFyXCIpO1xyXG4gICAgICAgIGlmIChwbGF5ZXJzID09PSBudWxsKSBwbGF5ZXJzID0gd29ybGQuZ2V0UGxheWVycygpO1xyXG4gICAgICAgIGZvciAoY29uc3QgcGxheWVyIG9mIHBsYXllcnMpIHBsYXllci5vblNjcmVlbkRpc3BsYXkuc2V0QWN0aW9uQmFyKG1lc3NhZ2UpO1xyXG4gICAgICAgIERlYnVnVGltZXIuY291bnRFbmQoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFNldHMgdGhlIHRpdGxlIG1lc3NhZ2UgZm9yIHRoZSBzcGVjaWZpZWQgcGxheWVycy5cclxuICAgICAqIEBwYXJhbSBtZXNzYWdlIC0gVGhlIG1lc3NhZ2UgdG8gZGlzcGxheSBhcyB0aGUgdGl0bGUuXHJcbiAgICAgKiBAcGFyYW0gcGxheWVycyAtIFRoZSBwbGF5ZXJzIHRvIGRpc3BsYXkgdGhlIHRpdGxlIHRvLiBJZiBub3QgcHJvdmlkZWQsIGFsbCBwbGF5ZXJzIGluIHRoZSB3b3JsZCB3aWxsIGJlIHVzZWQuXHJcbiAgICAgKiBAcGFyYW0gb3B0aW9ucyAtIFRoZSBvcHRpb25zIGZvciBkaXNwbGF5aW5nIHRoZSB0aXRsZS4gSWYgbm90IHByb3ZpZGVkLCBkZWZhdWx0IG9wdGlvbnMgd2lsbCBiZSB1c2VkLlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHRpdGxlKG1lc3NhZ2U6IE1lc3NhZ2UsIHBsYXllcnM6IE1heWJlPFBsYXllcltdPiA9IG51bGwsIG9wdGlvbnM6IFRpdGxlRGlzcGxheU9wdGlvbnMgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQpIHtcclxuICAgICAgICBEZWJ1Z1RpbWVyLmNvdW50U3RhcnQoXCJCcm9hZGNhc3RVdGlsLnRpdGxlXCIpO1xyXG4gICAgICAgIGlmIChwbGF5ZXJzID09PSBudWxsKSBwbGF5ZXJzID0gd29ybGQuZ2V0UGxheWVycygpO1xyXG4gICAgICAgIGZvciAoY29uc3QgcGxheWVyIG9mIHBsYXllcnMpIHBsYXllci5vblNjcmVlbkRpc3BsYXkuc2V0VGl0bGUobWVzc2FnZSwgb3B0aW9ucyk7XHJcbiAgICAgICAgRGVidWdUaW1lci5jb3VudEVuZCgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogRGlzcGxheXMgYSBzdWJ0aXRsZSBtZXNzYWdlIHRvIHRoZSBzcGVjaWZpZWQgcGxheWVycyBvciBhbGwgcGxheWVycyBpbiB0aGUgd29ybGQuXHJcbiAgICAgKiBAcGFyYW0gbWVzc2FnZSAtIFRoZSBtZXNzYWdlIHRvIGRpc3BsYXkgYXMgYSBzdWJ0aXRsZS5cclxuICAgICAqIEBwYXJhbSBwbGF5ZXJzIC0gKE9wdGlvbmFsKSBUaGUgcGxheWVycyB0byBkaXNwbGF5IHRoZSBzdWJ0aXRsZSB0by4gSWYgbm90IHByb3ZpZGVkLCB0aGUgc3VidGl0bGUgd2lsbCBiZSBkaXNwbGF5ZWQgdG8gYWxsIHBsYXllcnMgaW4gdGhlIHdvcmxkLlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHN1YnRpdGxlKG1lc3NhZ2U6IE1lc3NhZ2UsIHBsYXllcnM6IE1heWJlPFBsYXllcltdPiA9IG51bGwpIHtcclxuICAgICAgICBEZWJ1Z1RpbWVyLmNvdW50U3RhcnQoXCJCcm9hZGNhc3RVdGlsLnN1YnRpdGxlXCIpO1xyXG4gICAgICAgIGlmIChwbGF5ZXJzID09PSBudWxsKSBwbGF5ZXJzID0gd29ybGQuZ2V0UGxheWVycygpO1xyXG4gICAgICAgIGZvciAoY29uc3QgcGxheWVyIG9mIHBsYXllcnMpIHBsYXllci5vblNjcmVlbkRpc3BsYXkudXBkYXRlU3VidGl0bGUobWVzc2FnZSk7XHJcbiAgICAgICAgRGVidWdUaW1lci5jb3VudEVuZCgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogU2VuZHMgYSBKU09OLnN0cmluZ2lmeSgpIG1lc3NhZ2UgdG8gdGhlIHNwZWNpZmllZCBwbGF5ZXJzIG9yIHRvIGFsbCBwbGF5ZXJzIGluIHRoZSB3b3JsZC5cclxuICAgICAqIEBwYXJhbSBkYXRhIC0gQW4gYXJyYXkgb3Igb2JqZWN0IHRvIHNlbmQgaW4gY2hhdCBhcyBhIG1lc3NhZ2VcclxuICAgICAqIEBwYXJhbSBwbGF5ZXJzIC0gQW4gb3B0aW9uYWwgYXJyYXkgb2YgcGxheWVycyB0byBzZW5kIHRoZSBtZXNzYWdlIHRvLiBJZiBub3QgcHJvdmlkZWQsIHRoZSBtZXNzYWdlIHdpbGwgYmUgc2VudCB0byBhbGwgcGxheWVycyBpbiB0aGUgd29ybGQuXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgc3RyaW5naWZ5RGF0YShkYXRhOiB1bmtub3duLCBzcGFjZTogbnVtYmVyID0gMiwgcGxheWVyczogTWF5YmU8UGxheWVyW10+ID0gbnVsbCkge1xyXG4gICAgICAgIHRoaXMuc2F5KEpTT04uc3RyaW5naWZ5KGRhdGEsIG51bGwsIHNwYWNlKSwgcGxheWVycyk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBDb252ZXJ0cyBhIGBDdXN0b21Db21tYW5kT3JpZ2luLnNvdXJjZUVudGl0eWAgdG8gYSBkYXRhIHR5cGUgd2hpY2ggQnJvYWRjYXN0VXRpbCBtZXNzYWdlIHByaW50aW5nIGNhbiB1c2UuXHJcbiAgICAgKiBAcGFyYW0gdGFyZ2V0IEEgYEN1c3RvbUNvbW1hbmRPcmlnaW4uc291cmNlRW50aXR5YCBlbnRpdHlcclxuICAgICAqIEByZXR1cm5zIEVpdGhlciBhIGxpc3Qgb2YgMSBwbGF5ZXIgb3IgbnVsbFxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGRldlByaW50UmVjaXBpZW50cyh0YXJnZXQ6IEVudGl0eSB8IHVuZGVmaW5lZCk6IFBsYXllcltdIHwgbnVsbCB7XHJcbiAgICAgICAgbGV0IHNvdXJjZVBsYXllcjogUGxheWVyIHwgdW5kZWZpbmVkIHwgbnVsbCA9IHRhcmdldCBhcyBQbGF5ZXIgfCB1bmRlZmluZWQgfCBudWxsO1xyXG4gICAgICAgIGlmIChzb3VyY2VQbGF5ZXIgPT09IHVuZGVmaW5lZCkgc291cmNlUGxheWVyID0gbnVsbDtcclxuICAgICAgICByZXR1cm4gc291cmNlUGxheWVyID09PSBudWxsID8gbnVsbCA6IFtzb3VyY2VQbGF5ZXJdO1xyXG4gICAgfVxyXG59XHJcblxyXG5kZWNsYXJlIGdsb2JhbCB7XHJcbiAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tdmFyXHJcbiAgICB2YXIgQnJvYWRjYXN0VXRpbDogT21pdDx0eXBlb2YgX0Jyb2FkY2FzdFV0aWwsIFwicHJvdG90eXBlXCI+O1xyXG59XHJcbmdsb2JhbFRoaXMuQnJvYWRjYXN0VXRpbCA9IF9Ccm9hZGNhc3RVdGlsO1xyXG4iXSwibmFtZXMiOlsid29ybGQiLCJfQnJvYWRjYXN0VXRpbCIsInNheSIsIm1lc3NhZ2UiLCJwbGF5ZXJzIiwic2VuZE1lc3NhZ2UiLCJwbGF5ZXIiLCJ0cmFuc2xhdGUiLCJsb2NLZXkiLCJ0cmFuc2xhdGVXaXRoIiwicHJlZml4Rm9ybWF0dGluZyIsIm1hcFRyYW5zbGF0ZVdpdGhJdGVtIiwiaXRlbSIsInRleHQiLCJjb25zb2xlIiwid2FybiIsIlN0cmluZyIsIm1hcHBlZFRyYW5zbGF0ZVdpdGgiLCJtYXAiLCJ1bmRlZmluZWQiLCJyYXd0ZXh0Iiwid2l0aCIsImNsaXBib2FyZCIsImxvZyIsImRlYnVnIiwiRGVidWdUaW1lciIsImNvdW50U3RhcnQiLCJnZXRQbGF5ZXJzIiwiZmlsdGVyIiwiaGFzVGFnIiwiY291bnRFbmQiLCJhY3Rpb25iYXIiLCJvblNjcmVlbkRpc3BsYXkiLCJzZXRBY3Rpb25CYXIiLCJ0aXRsZSIsIm9wdGlvbnMiLCJzZXRUaXRsZSIsInN1YnRpdGxlIiwidXBkYXRlU3VidGl0bGUiLCJzdHJpbmdpZnlEYXRhIiwiZGF0YSIsInNwYWNlIiwiSlNPTiIsInN0cmluZ2lmeSIsImRldlByaW50UmVjaXBpZW50cyIsInRhcmdldCIsInNvdXJjZVBsYXllciIsImdsb2JhbFRoaXMiLCJCcm9hZGNhc3RVdGlsIl0sIm1hcHBpbmdzIjoiQUFBQSxTQUEwREEsS0FBSyxRQUFRLG9CQUFvQjtBQUkzRixNQUFNQztJQUNGOzs7O0tBSUMsR0FDRCxPQUFjQyxJQUFJQyxPQUFnQixFQUFFQyxVQUEyQixJQUFJLEVBQUU7UUFDakUsSUFBSUEsWUFBWSxNQUFNSixNQUFNSyxXQUFXLENBQUNGO2FBQ25DO1lBQ0QsS0FBSyxNQUFNRyxVQUFVRixRQUFTO2dCQUMxQkUsT0FBT0QsV0FBVyxDQUFDRjtZQUN2QjtRQUNKO0lBQ0o7SUFFQTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztLQTRCQyxHQUNELE9BQWNJLFVBQ1ZDLE1BQWMsRUFDZEMsZ0JBQWdELElBQUksRUFDcERMLFVBQTJCLElBQUksRUFDL0JNLG1CQUFrQyxJQUFJLEVB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