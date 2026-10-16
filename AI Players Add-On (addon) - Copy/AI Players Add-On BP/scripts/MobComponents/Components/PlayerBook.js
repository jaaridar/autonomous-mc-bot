import { GameMode } from "@minecraft/server";
import _books from "Crimson/books";
import { MobComponentPlayer } from "MobComponents/AbstractMobComponent";
const books = _books;
class PlayerBook extends MobComponentPlayer {
    onItemStartUse(event) {
        const typeId = event.itemStack.typeId.replace("_item", "");
        if (!Object.keys(books).includes(typeId)) return;
        if (this.player.id !== event.source.id) return;
        this.open(typeId);
    }
    onScriptEvent(eventData) {
        if (!this.entity.isValid) return;
        const source = eventData.initiator ?? eventData.sourceEntity;
        if (source?.id !== this.entityId) return;
        this.handleScriptEvent(eventData);
    }
    /** Handle script events related to the book
     * @param eventData The script event data
     */ handleScriptEvent(eventData) {
        switch(eventData.id){
            case "gm1_sky:register_book_open":
                {
                    this.registerOpen();
                    break;
                }
            case "gm1_sky:register_book_close":
                {
                    this.registerClose();
                    break;
                }
            case "gm1_sky:set_book_icon":
                {
                    const [typeId, icon] = eventData.message.split(" ");
                    this.setIcon(typeId, icon);
                    break;
                }
        }
    }
    /** Set the current icon of the book
     * @param typeId The type ID of the book entity
     * @param icon The name of the icon to set
     */ setIcon(typeId, icon) {
        const icons = Object.keys(books[typeId]?.icons);
        if (!icons?.includes(icon)) {
            return console.warn(`Invalid icon ${icon}. Valid icons are: ${icons?.join(", ")}`);
        }
        this.npc.setProperty("gm1_sky:icon", icons.indexOf(icon));
    }
    /** Register the book as open */ registerOpen() {
        this.isBookOpen = true;
    }
    /** Register the book as closed */ registerClose() {
        this.isBookOpen = false;
        this.timeout(()=>{
            if (!this.isBookOpen) this.close();
        }, 1);
    }
    /** Opens the book
     * @param typeId The type ID of the book entity
     */ open(typeId) {
        this.npc = this.player.dimension.spawnEntity(typeId, this.player.location) ?? null;
        if (!this.npc) {
            BroadcastUtil.debug("Failed to spawn book entity.");
            return;
        }
        EntityStore.set(this.npc, "bookUserId", this.player.id);
        this.timeout(()=>{
            if (this.player.getGameMode() === GameMode.Creative) {
                this.player.setGameMode(GameMode.Spectator);
                this.player.teleport(this.npc.location);
            }
            const entryScene = books[typeId]?.entry;
            const command = `/dialogue open @e[type=${typeId},c=1] @s ${entryScene}`;
            this.player.runCommand(command);
        }, 2);
    }
    /** Closes the book */ close() {
        if (this.player.getGameMode() === GameMode.Spectator) this.player.setGameMode(GameMode.Creative);
        this.npc?.remove();
    }
    constructor(entity){
        super(entity);
        this.icons = [];
        this.npc = null;
        this.isBookOpen = false;
        this.player = entity;
        this.onWorldEvent("WorldAfterEvents", "itemStartUse", this.onItemStartUse.bind(this));
        this.onWorldEvent("SystemAfterEvents", "scriptEventReceive", this.onScriptEvent.bind(this));
    }
}
PlayerBook.EntityTypes = [
    "minecraft:player"
];
export { PlayerBook as default };

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIlBsYXllckJvb2sudHMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgRW50aXR5LCBHYW1lTW9kZSwgSXRlbVN0YXJ0VXNlQWZ0ZXJFdmVudCwgUGxheWVyLCBTY3JpcHRFdmVudENvbW1hbmRNZXNzYWdlQWZ0ZXJFdmVudCB9IGZyb20gXCJAbWluZWNyYWZ0L3NlcnZlclwiO1xyXG5pbXBvcnQgX2Jvb2tzIGZyb20gXCJDcmltc29uL2Jvb2tzXCI7XHJcbmltcG9ydCB7IE1vYkNvbXBvbmVudFBsYXllciB9IGZyb20gXCJNb2JDb21wb25lbnRzL0Fic3RyYWN0TW9iQ29tcG9uZW50XCI7XHJcbmNvbnN0IGJvb2tzID0gX2Jvb2tzIGFzIFJlY29yZDxzdHJpbmcsIHsgZW50cnk6IHN0cmluZzsgaWNvbnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gfT47XHJcblxyXG5leHBvcnQgZGVmYXVsdCBhYnN0cmFjdCBjbGFzcyBQbGF5ZXJCb29rIGV4dGVuZHMgTW9iQ29tcG9uZW50UGxheWVyIHtcclxuICAgIHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgRW50aXR5VHlwZXMgPSBbXCJtaW5lY3JhZnQ6cGxheWVyXCJdO1xyXG5cclxuICAgIHB1YmxpYyBpY29uczogc3RyaW5nW10gPSBbXTtcclxuICAgIHB1YmxpYyBwbGF5ZXI6IFBsYXllcjtcclxuICAgIHB1YmxpYyBucGM6IEVudGl0eSB8IG51bGwgPSBudWxsO1xyXG4gICAgcHVibGljIGlzQm9va09wZW46IGJvb2xlYW4gPSBmYWxzZTtcclxuXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IoZW50aXR5OiBFbnRpdHkpIHtcclxuICAgICAgICBzdXBlcihlbnRpdHkpO1xyXG5cclxuICAgICAgICB0aGlzLnBsYXllciA9IGVudGl0eSBhcyBQbGF5ZXI7XHJcblxyXG4gICAgICAgIHRoaXMub25Xb3JsZEV2ZW50KFwiV29ybGRBZnRlckV2ZW50c1wiLCBcIml0ZW1TdGFydFVzZVwiLCB0aGlzLm9uSXRlbVN0YXJ0VXNlLmJpbmQodGhpcykpO1xyXG4gICAgICAgIHRoaXMub25Xb3JsZEV2ZW50KFwiU3lzdGVtQWZ0ZXJFdmVudHNcIiwgXCJzY3JpcHRFdmVudFJlY2VpdmVcIiwgdGhpcy5vblNjcmlwdEV2ZW50LmJpbmQodGhpcykpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgb25JdGVtU3RhcnRVc2UoZXZlbnQ6IEl0ZW1TdGFydFVzZUFmdGVyRXZlbnQpIHtcclxuICAgICAgICBjb25zdCB0eXBlSWQgPSBldmVudC5pdGVtU3RhY2sudHlwZUlkLnJlcGxhY2UoXCJfaXRlbVwiLCBcIlwiKTtcclxuICAgICAgICBpZiAoIU9iamVjdC5rZXlzKGJvb2tzKS5pbmNsdWRlcyh0eXBlSWQpKSByZXR1cm47XHJcbiAgICAgICAgaWYgKHRoaXMucGxheWVyLmlkICE9PSBldmVudC5zb3VyY2UuaWQpIHJldHVybjtcclxuICAgICAgICB0aGlzLm9wZW4odHlwZUlkKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIG9uU2NyaXB0RXZlbnQoZXZlbnREYXRhOiBTY3JpcHRFdmVudENvbW1hbmRNZXNzYWdlQWZ0ZXJFdmVudCkge1xyXG4gICAgICAgIGlmICghdGhpcy5lbnRpdHkuaXNWYWxpZCkgcmV0dXJuO1xyXG5cclxuICAgICAgICBjb25zdCBzb3VyY2UgPSBldmVudERhdGEuaW5pdGlhdG9yID8/IGV2ZW50RGF0YS5zb3VyY2VFbnRpdHk7XHJcbiAgICAgICAgaWYgKHNvdXJjZT8uaWQgIT09IHRoaXMuZW50aXR5SWQpIHJldHVybjtcclxuXHJcbiAgICAgICAgdGhpcy5oYW5kbGVTY3JpcHRFdmVudChldmVudERhdGEpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBIYW5kbGUgc2NyaXB0IGV2ZW50cyByZWxhdGVkIHRvIHRoZSBib29rXHJcbiAgICAgKiBAcGFyYW0gZXZlbnREYXRhIFRoZSBzY3JpcHQgZXZlbnQgZGF0YVxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgaGFuZGxlU2NyaXB0RXZlbnQoZXZlbnREYXRhOiBTY3JpcHRFdmVudENvbW1hbmRNZXNzYWdlQWZ0ZXJFdmVudCkge1xyXG4gICAgICAgIHN3aXRjaCAoZXZlbnREYXRhLmlkKSB7XHJcbiAgICAgICAgICAgIGNhc2UgXCJnbTFfc2t5OnJlZ2lzdGVyX2Jvb2tfb3BlblwiOiB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnJlZ2lzdGVyT3BlbigpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgY2FzZSBcImdtMV9za3k6cmVnaXN0ZXJfYm9va19jbG9zZVwiOiB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnJlZ2lzdGVyQ2xvc2UoKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGNhc2UgXCJnbTFfc2t5OnNldF9ib29rX2ljb25cIjoge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgW3R5cGVJZCwgaWNvbl0gPSBldmVudERhdGEubWVzc2FnZS5zcGxpdChcIiBcIik7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnNldEljb24odHlwZUlkLCBpY29uKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKiBTZXQgdGhlIGN1cnJlbnQgaWNvbiBvZiB0aGUgYm9va1xyXG4gICAgICogQHBhcmFtIHR5cGVJZCBUaGUgdHlwZSBJRCBvZiB0aGUgYm9vayBlbnRpdHlcclxuICAgICAqIEBwYXJhbSBpY29uIFRoZSBuYW1lIG9mIHRoZSBpY29uIHRvIHNldFxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc2V0SWNvbih0eXBlSWQ6IHN0cmluZywgaWNvbjogc3RyaW5nKSB7XHJcbiAgICAgICAgY29uc3QgaWNvbnMgPSBPYmplY3Qua2V5cyhib29rc1t0eXBlSWRdPy5pY29ucyk7XHJcblxyXG4gICAgICAgIGlmICghaWNvbnM/LmluY2x1ZGVzKGljb24pKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBjb25zb2xlLndhcm4oYEludmFsaWQgaWNvbiAke2ljb259LiBWYWxpZCBpY29ucyBhcmU6ICR7aWNvbnM/LmpvaW4oXCIsIFwiKX1gKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRoaXMubnBjIS5zZXRQcm9wZXJ0eShcImdtMV9za3k6aWNvblwiLCBpY29ucy5pbmRleE9mKGljb24pKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogUmVnaXN0ZXIgdGhlIGJvb2sgYXMgb3BlbiAqL1xyXG4gICAgcHVibGljIHJlZ2lzdGVyT3BlbigpIHtcclxuICAgICAgICB0aGlzLmlzQm9va09wZW4gPSB0cnVlO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBSZWdpc3RlciB0aGUgYm9vayBhcyBjbG9zZWQgKi9cclxuICAgIHB1YmxpYyByZWdpc3RlckNsb3NlKCkge1xyXG4gICAgICAgIHRoaXMuaXNCb29rT3BlbiA9IGZhbHNlO1xyXG4gICAgICAgIHRoaXMudGltZW91dCgoKSA9PiB7XHJcbiAgICAgICAgICAgIGlmICghdGhpcy5pc0Jvb2tPcGVuKSB0aGlzLmNsb3NlKCk7XHJcbiAgICAgICAgfSwgMSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIE9wZW5zIHRoZSBib29rXHJcbiAgICAgKiBAcGFyYW0gdHlwZUlkIFRoZSB0eXBlIElEIG9mIHRoZSBib29rIGVudGl0eVxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgb3Blbih0eXBlSWQ6IHN0cmluZykge1xyXG4gICAgICAgIHRoaXMubnBjID0gdGhpcy5wbGF5ZXIuZGltZW5zaW9uLnNwYXduRW50aXR5KHR5cGVJZCwgdGhpcy5wbGF5ZXIubG9jYXRpb24pID8/IG51bGw7XHJcblxyXG4gICAgICAgIGlmICghdGhpcy5ucGMpIHtcclxuICAgICAgICAgICAgQnJvYWRjYXN0VXRpbC5kZWJ1ZyhcIkZhaWxlZCB0byBzcGF3biBib29rIGVudGl0eS5cIik7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIEVudGl0eVN0b3JlLnNldCh0aGlzLm5wYywgXCJib29rVXNlcklkXCIsIHRoaXMucGxheWVyLmlkKTtcclxuXHJcbiAgICAgICAgdGhpcy50aW1lb3V0KCgpID0+IHtcclxuICAgICAgICAgICAgaWYgKHRoaXMucGxheWVyLmdldEdhbWVNb2RlKCkgPT09IEdhbWVNb2RlLkNyZWF0aXZlKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnBsYXllci5zZXRHYW1lTW9kZShHYW1lTW9kZS5TcGVjdGF0b3IpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5wbGF5ZXIudGVsZXBvcnQodGhpcy5ucGMhLmxvY2F0aW9uKTtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgY29uc3QgZW50cnlTY2VuZSA9IGJvb2tzW3R5cGVJZF0/LmVudHJ5O1xyXG4gICAgICAgICAgICBjb25zdCBjb21tYW5kID0gYC9kaWFsb2d1ZSBvcGVuIEBlW3R5cGU9JHt0eXBlSWR9LGM9MV0gQHMgJHtlbnRyeVNjZW5lfWA7XHJcbiAgICAgICAgICAgIHRoaXMucGxheWVyLnJ1bkNvbW1hbmQoY29tbWFuZCk7XHJcbiAgICAgICAgfSwgMik7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIENsb3NlcyB0aGUgYm9vayAqL1xyXG4gICAgcHVibGljIGNsb3NlKCkge1xyXG4gICAgICAgIGlmICh0aGlzLnBsYXllci5nZXRHYW1lTW9kZSgpID09PSBHYW1lTW9kZS5TcGVjdGF0b3IpIHRoaXMucGxheWVyLnNldEdhbWVNb2RlKEdhbWVNb2RlLkNyZWF0aXZlKTtcclxuICAgICAgICB0aGlzLm5wYz8ucmVtb3ZlKCk7XHJcbiAgICB9XHJcbn1cclxuIl0sIm5hbWVzIjpbIkdhbWVNb2RlIiwiX2Jvb2tzIiwiTW9iQ29tcG9uZW50UGxheWVyIiwiYm9va3MiLCJQbGF5ZXJCb29rIiwib25JdGVtU3RhcnRVc2UiLCJldmVudCIsInR5cGVJZCIsIml0ZW1TdGFjayIsInJlcGxhY2UiLCJPYmplY3QiLCJrZXlzIiwiaW5jbHVkZXMiLCJwbGF5ZXIiLCJpZCIsInNvdXJjZSIsIm9wZW4iLCJvblNjcmlwdEV2ZW50IiwiZXZlbnREYXRhIiwiZW50aXR5IiwiaXNWYWxpZCIsImluaXRpYXRvciIsInNvdXJjZUVudGl0eSIsImVudGl0eUlkIiwiaGFuZGxlU2NyaXB0RXZlbnQiLCJyZWdpc3Rlck9wZW4iLCJyZWdpc3RlckNsb3NlIiwiaWNvbiIsIm1lc3NhZ2UiLCJzcGxpdCIsInNldEljb24iLCJpY29ucyIsImNvbnNvbGUiLCJ3YXJuIiwiam9pbiIsIm5wYyIsInNldFByb3BlcnR5IiwiaW5kZXhPZiIsImlzQm9va09wZW4iLCJ0aW1lb3V0IiwiY2xvc2UiLCJkaW1lbnNpb24iLCJzcGF3bkVudGl0eSIsImxvY2F0aW9uIiwiQnJvYWRjYXN0VXRpbCIsImRlYnVnIiwiRW50aXR5U3RvcmUiLCJzZXQiLCJnZXRHYW1lTW9kZSIsIkNyZWF0aXZlIiwic2V0R2FtZU1vZGUiLCJTcGVjdGF0b3IiLCJ0ZWxlcG9ydCIsImVudHJ5U2NlbmUiLCJlbnRyeSIsImNvbW1hbmQiLCJydW5Db21tYW5kIiwicmVtb3ZlIiwib25Xb3JsZEV2ZW50IiwiYmluZCIsIkVudGl0eVR5cGVzIl0sIm1hcHBpbmdzIjoiQUFBQSxTQUFpQkEsUUFBUSxRQUE2RSxvQkFBb0I7QUFDMUgsT0FBT0MsWUFBWSxnQkFBZ0I7QUFDbkMsU0FBU0Msa0JBQWtCLFFBQVEscUNBQXFDO0FBQ3hFLE1BQU1DLFFBQVFGO0FBRUMsTUFBZUcsbUJBQW1CRjtJQWlCckNHLGVBQWVDLEtBQTZCLEVBQUU7UUFDbEQsTUFBTUMsU0FBU0QsTUFBTUUsU0FBUyxDQUFDRCxNQUFNLENBQUNFLE9BQU8sQ0FBQyxTQUFTO1FBQ3ZELElBQUksQ0FBQ0MsT0FBT0MsSUFBSSxDQUFDUixPQUFPUyxRQUFRLENBQUNMLFNBQVM7UUFDMUMsSUFBSSxJQUFJLENBQUNNLE1BQU0sQ0FBQ0MsRUFBRSxLQUFLUixN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