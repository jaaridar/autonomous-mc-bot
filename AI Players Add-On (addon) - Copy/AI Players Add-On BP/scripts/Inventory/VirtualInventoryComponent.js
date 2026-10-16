import { EntityComponentTypes, TicksPerSecond } from "@minecraft/server";
import AIPData from "Data/AIPData";
import { InventoryData } from "Data/InventoryData";
import AbstractMobComponent from "MobComponents/AbstractMobComponent";
class VirtualInventoryComponent extends AbstractMobComponent {
    onEntityDie(event) {
        const ownerTag = `gm1_sky:owner.${this.entity.nameTag}`;
        const nearbyItems = this.entity.dimension.getEntities({
            location: event.deadEntity.location,
            type: "minecraft:item",
            maxDistance: AIPData.DeathItemTaggingRadius
        });
        for (const item of nearbyItems)item.addTag(ownerTag);
    }
    onEntityItemPickupBefore(event) {
        // Prevent pick up while dying
        const health = this.entity.getComponent(EntityComponentTypes.Health)?.currentValue;
        if (health === 0) event.cancel = true;
        // Prevent pick up if it has gm1_sky:thrown tag
        const isThrown = event.item.hasTag("gm1_sky:thrown");
        if (isThrown) event.cancel = true;
    }
    onEntityItemPickupAfter() {
        this.refreshSlots();
        if (this.hasChangedThisTick && !this.hasPickedUpThisTick) {
            this.entity.dimension.playSound("random.pop", this.entity.location, {
                pitch: 2,
                volume: 0.5
            });
        }
        this.hasPickedUpThisTick = true;
    }
    static get(entity) {
        return entity.getMobComponent("VirtualInventoryComponent");
    }
    process() {
        if (Main.currentTick % VirtualInventoryComponent.InvalidationInterval === 0) this.refreshSlots();
        if (this.hasChangedThisTick) {
            this.hasChangedThisTick = false;
            CustomEvents.emit("AIPInventoryChanged", this.entity);
        }
        this.hasPickedUpThisTick = false;
    }
    // #REGION Syncing
    refreshSlots() {
        this.typeIdToSlots.clear();
        const size = this.inventory.size;
        for(let i = 0; i < size; i++){
            const item = this.inventory.getItem(i);
            this.slots[i] = item;
            if (!item) continue;
            const slots = this.typeIdToSlots.get(item.typeId);
            if (slots) slots.push(i);
            else this.typeIdToSlots.set(item.typeId, [
                i
            ]);
        }
        const newHash = this.hashSlots();
        if (this.currentHash === newHash) return;
        this.currentHash = newHash;
        this.hasChangedThisTick = true;
    }
    hashSlots() {
        const raw = this.slots.map((item)=>InventoryUtil.serializeBasicItemStack(item)).join("|");
        return MathUtil.hash(raw);
    }
    // #ENDREGION
    // #REGION Reading
    getSlot(slot) {
        return this.slots[slot];
    }
    findItemType(itemType) {
        const slots = this.typeIdToSlots.get(itemType);
        if (!slots) return undefined;
        return this.slots[slots[0]];
    }
    countItemType(itemType) {
        const slots = this.typeIdToSlots.get(itemType);
        if (!slots) return 0;
        let count = 0;
        for (const slot of slots)count += this.slots[slot].amount;
        return count;
    }
    countItemTypeOfFamily(family) {
        let count = 0;
        for (const item of this.slots){
            if (!item) continue;
            if (item.typeId.includes(family)) count += item.amount;
        }
        return count;
    }
    hasItemType(itemType) {
        return this.findItemType(itemType) !== undefined;
    }
    hasItemStack(itemStack) {
        const serialized = InventoryUtil.serializeBasicItemStack(itemStack);
        for (const item of this.slots){
            if (!item) continue;
            if (serialized === InventoryUtil.serializeBasicItemStack(item)) return true;
        }
        return false;
    }
    hasSpaceForItemStack(itemStack) {
        let remaining = itemStack.amount;
        for(const slot in this.slots){
            const existing = this.slots[slot];
            // Return true if there's an empty slot
            if (!existing) return true;
            // If the item type doesn't match, skip
            if (existing.typeId !== itemStack.typeId) continue;
            const newAmount = existing.amount + remaining;
            // Return true if the item can stack in this slot
            if (newAmount <= itemStack.maxAmount) return true;
            // Reduce remaining by how many items can fit in this slot
            remaining -= itemStack.maxAmount - existing.amount;
            // If there are no more items remaining to fit, return true
            if (remaining <= 0) return true;
        }
        return false;
    }
    // #ENDREGION
    // #REGION Writing
    giveItem(itemStack) {
        const result = this.inventory.addItem(itemStack);
        this.refreshSlots();
        return result;
    }
    setSlot(slot, itemStack) {
        this.inventory.setItem(slot, itemStack);
        this.refreshSlots();
    }
    setSlots(slots) {
        for(let i = 0; i < this.inventory.size; i++){
            const item = slots[i];
            this.inventory.setItem(i, item);
        }
        this.refreshSlots();
    }
    clearSlot(slot) {
        this.setSlot(slot, undefined);
    }
    removeItem(itemStack) {
        InventoryUtil.removeItem(this.entity, itemStack);
        this.refreshSlots();
    }
    depositSlotToContainer(slot, container, count) {
        const success = InventoryUtil.transferItemAmount(this.inventory, slot, container, count);
        this.refreshSlots();
        return success;
    }
    depositItemStackToContainerSlot(itemStack, container, toSlot) {
        const result = InventoryUtil.tryMoveItemToContainer(this.entity, itemStack, toSlot, container);
        if (result) this.refreshSlots();
        return result;
    }
    withdrawFromContainerSlot(source, slot, count) {
        const success = InventoryUtil.transferItemAmount(source, slot, this.inventory, count);
        this.refreshSlots();
        return success;
    }
    /**
     * Merges partial stacks of the same item type in an entity's inventory and compacts them to the earliest slots.
     * E.g. if two slots each have 1 stone, they get merged into a single stack of 2, and all items are moved to the earliest slots.
     */ mergeAndCompact() {
        // Merge partial stacks of the same type, only comparing slots that share a type
        for (const slotsOfType of this.typeIdToSlots.values()){
            for(let a = 0; a < slotsOfType.length; a++){
                const source = this.slots[slotsOfType[a]];
                if (!source || source.amount >= source.maxAmount) continue;
                for(let b = a + 1; b < slotsOfType.length; b++){
                    const targetSlot = slotsOfType[b];
                    const target = this.slots[targetSlot];
                    if (!target?.isStackableWith(source)) continue;
                    const toMove = Math.min(target.amount, source.maxAmount - source.amount);
                    source.amount += toMove;
                    if (toMove >= target.amount) this.slots[targetSlot] = undefined;
                    else target.amount -= toMove;
                    if (source.amount >= source.maxAmount) break;
                }
            }
        }
        // Compact items to the earliest slots (remove gaps)
        const compacted = new Array(this.slots.length).fill(undefined);
        let writeIndex = 0;
        for (const item of this.slots)if (item) compacted[writeIndex++] = item;
        for(let i = 0; i < compacted.length; i++)this.slots[i] = compacted[i];
        this.setSlots(this.slots);
    }
    constructor(entity){
        super(entity, 1);
        this.slots = new Array(InventoryData.MaxInventorySlots).fill(undefined);
        this.typeIdToSlots = new Map();
        this.currentHash = 0;
        this.hasPickedUpThisTick = false;
        this.hasChangedThisTick = false;
        this.inventory = InventoryUtil.getContainer(entity);
        this.refreshSlots();
        const eventOptions = {
            entityFilter: {
                name: this.entity.nameTag
            }
        };
        this.onWorldEvent("WorldAfterEvents", "entityItemPickup", this.onEntityItemPickupAfter.bind(this), eventOptions);
        this.onWorldEvent("WorldBeforeEvents", "entityItemPickup", this.onEntityItemPickupBefore.bind(this), eventOptions);
        this.onWorldEvent("WorldAfterEvents", "entityDie", this.onEntityDie.bind(this), {
            entities: [
                this.entity
            ]
        });
    }
}
VirtualInventoryComponent.EntityTypes = [
    "gm1_sky:aip"
];
VirtualInventoryComponent.InvalidationInterval = 1 * TicksPerSecond;
export { VirtualInventoryComponent as default };

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIlZpcnR1YWxJbnZlbnRvcnlDb21wb25lbnQudHMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHtcclxuICAgIENvbnRhaW5lcixcclxuICAgIEVudGl0eSxcclxuICAgIEVudGl0eUNvbXBvbmVudFR5cGVzLFxyXG4gICAgRW50aXR5RGllQWZ0ZXJFdmVudCxcclxuICAgIEVudGl0eUl0ZW1QaWNrdXBCZWZvcmVFdmVudCxcclxuICAgIEVudGl0eUl0ZW1QaWNrdXBFdmVudE9wdGlvbnMsXHJcbiAgICBJdGVtU3RhY2ssXHJcbiAgICBUaWNrc1BlclNlY29uZCxcclxufSBmcm9tIFwiQG1pbmVjcmFmdC9zZXJ2ZXJcIjtcclxuaW1wb3J0IEFJUERhdGEgZnJvbSBcIkRhdGEvQUlQRGF0YVwiO1xyXG5pbXBvcnQgeyBJbnZlbnRvcnlEYXRhIH0gZnJvbSBcIkRhdGEvSW52ZW50b3J5RGF0YVwiO1xyXG5pbXBvcnQgQWJzdHJhY3RNb2JDb21wb25lbnQgZnJvbSBcIk1vYkNvbXBvbmVudHMvQWJzdHJhY3RNb2JDb21wb25lbnRcIjtcclxuaW1wb3J0IHsgSW52ZW50b3J5QXJyYXkgfSBmcm9tIFwiLi9UeXBlc1wiO1xyXG5cclxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgVmlydHVhbEludmVudG9yeUNvbXBvbmVudCBleHRlbmRzIEFic3RyYWN0TW9iQ29tcG9uZW50IHtcclxuICAgIHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgRW50aXR5VHlwZXM6IHN0cmluZ1tdID0gW1wiZ20xX3NreTphaXBcIl07XHJcbiAgICBwdWJsaWMgc3RhdGljIHJlYWRvbmx5IEludmFsaWRhdGlvbkludGVydmFsID0gMSAqIFRpY2tzUGVyU2Vjb25kO1xyXG5cclxuICAgIHB1YmxpYyByZWFkb25seSBzbG90czogSW52ZW50b3J5QXJyYXkgPSBuZXcgQXJyYXkoSW52ZW50b3J5RGF0YS5NYXhJbnZlbnRvcnlTbG90cykuZmlsbCh1bmRlZmluZWQpO1xyXG4gICAgcHVibGljIHJlYWRvbmx5IHR5cGVJZFRvU2xvdHMgPSBuZXcgTWFwPHN0cmluZywgbnVtYmVyW10+KCk7XHJcblxyXG4gICAgcHVibGljIGN1cnJlbnRIYXNoID0gMDtcclxuICAgIHByaXZhdGUgaGFzUGlja2VkVXBUaGlzVGljayA9IGZhbHNlO1xyXG4gICAgcHJpdmF0ZSBoYXNDaGFuZ2VkVGhpc1RpY2sgPSBmYWxzZTtcclxuXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGludmVudG9yeTogQ29udGFpbmVyO1xyXG5cclxuICAgIHB1YmxpYyBjb25zdHJ1Y3RvcihlbnRpdHk6IEVudGl0eSkge1xyXG4gICAgICAgIHN1cGVyKGVudGl0eSwgMSk7XHJcblxyXG4gICAgICAgIHRoaXMuaW52ZW50b3J5ID0gSW52ZW50b3J5VXRpbC5nZXRDb250YWluZXIoZW50aXR5KTtcclxuXHJcbiAgICAgICAgdGhpcy5yZWZyZXNoU2xvdHMoKTtcclxuXHJcbiAgICAgICAgY29uc3QgZXZlbnRPcHRpb25zOiBFbnRpdHlJdGVtUGlja3VwRXZlbnRPcHRpb25zID0geyBlbnRpdHlGaWx0ZXI6IHsgbmFtZTogdGhpcy5lbnRpdHkubmFtZVRhZyB9IH07XHJcblxyXG4gICAgICAgIHRoaXMub25Xb3JsZEV2ZW50KFwiV29ybGRBZnRlckV2ZW50c1wiLCBcImVudGl0eUl0ZW1QaWNrdXBcIiwgdGhpcy5vbkVudGl0eUl0ZW1QaWNrdXBBZnRlci5iaW5kKHRoaXMpLCBldmVudE9wdGlvbnMpO1xyXG4gICAgICAgIHRoaXMub25Xb3JsZEV2ZW50KFwiV29ybGRCZWZvcmVFdmVudHNcIiwgXCJlbnRpdHlJdGVtUGlja3VwXCIsIHRoaXMub25FbnRpdHlJdGVtUGlja3VwQmVmb3JlLmJpbmQodGhpcyksIGV2ZW50T3B0aW9ucyk7XHJcbiAgICAgICAgdGhpcy5vbldvcmxkRXZlbnQoXCJXb3JsZEFmdGVyRXZlbnRzXCIsIFwiZW50aXR5RGllXCIsIHRoaXMub25FbnRpdHlEaWUuYmluZCh0aGlzKSwgeyBlbnRpdGllczogW3RoaXMuZW50aXR5XSB9KTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIG9uRW50aXR5RGllKGV2ZW50OiBFbnRpdHlEaWVBZnRlckV2ZW50KTogdm9pZCB7XHJcbiAgICAgICAgY29uc3Qgb3duZXJUYWcgPSBgZ20xX3NreTpvd25lci4ke3RoaXMuZW50aXR5Lm5hbWVUYWd9YDtcclxuICAgICAgICBjb25zdCBuZWFyYnlJdGVtcyA9IHRoaXMuZW50aXR5LmRpbWVuc2lvbi5nZXRFbnRpdGllcyh7XHJcbiAgICAgICAgICAgIGxvY2F0aW9uOiBldmVudC5kZWFkRW50aXR5LmxvY2F0aW9uLFxyXG4gICAgICAgICAgICB0eXBlOiBcIm1pbmVjcmFmdDppdGVtXCIsXHJcbiAgICAgICAgICAgIG1heERpc3RhbmNlOiBBSVBEYXRhLkRlYXRoSXRlbVRhZ2dpbmdSYWRpdXMsXHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIGZvciAoY29uc3QgaXRlbSBvZiBuZWFyYnlJdGVtcykgaXRlbS5hZGRUYWcob3duZXJUYWcpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgb25FbnRpdHlJdGVtUGlja3VwQmVmb3JlKGV2ZW50OiBFbnRpdHlJdGVtUGlja3VwQmVmb3JlRXZlbnQpIHtcclxuICAgICAgICAvLyBQcmV2ZW50IHBpY2sgdXAgd2hpbGUgZHlpbmdcclxuICAgICAgICBjb25zdCBoZWFsdGggPSB0aGlzLmVudGl0eS5nZXRDb21wb25lbnQoRW50aXR5Q29tcG9uZW50VHlwZXMuSGVhbHRoKT8uY3VycmVudFZhbHVlO1xyXG4gICAgICAgIGlmIChoZWFsdGggPT09IDApIGV2ZW50LmNhbmNlbCA9IHRydWU7XHJcblxyXG4gICAgICAgIC8vIFByZXZlbnQgcGljayB1cCBpZiBpdCBoYXMgZ20xX3NreTp0aHJvd24gdGFnXHJcbiAgICAgICAgY29uc3QgaXNUaHJvd24gPSBldmVudC5pdGVtLmhhc1RhZyhcImdtMV9za3k6dGhyb3duXCIpO1xyXG4gICAgICAgIGlmIChpc1Rocm93bikgZXZlbnQuY2FuY2VsID0gdHJ1ZTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIG9uRW50aXR5SXRlbVBpY2t1cEFmdGVyKCkge1xyXG4gICAgICAgIHRoaXMucmVmcmVzaFNsb3RzKCk7XHJcblxyXG4gICAgICAgIGlmICh0aGlzLmhhc0NoYW5nZWRUaGlzVGljayAmJiAhdGhpcy5oYXNQaWNrZWRVcFRoaXNUaWNrKSB7XHJcbiAgICAgICAgICAgIHRoaXMuZW50aXR5LmRpbWVuc2lvbi5wbGF5U291bmQoXCJyYW5kb20ucG9wXCIsIHRoaXMuZW50aXR5LmxvY2F0aW9uLCB7IHBpdGNoOiAyLCB2b2x1bWU6IDAuNSB9KTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRoaXMuaGFzUGlja2VkVXBUaGlzVGljayA9IHRydWU7XHJcbiAgICB9XHJcblxyXG4gICAgcHVibGljIHN0YXRpYyBnZXQoZW50aXR5OiBFbnRpdHkpOiBWaXJ0dWFsSW52ZW50b3J5Q29tcG9uZW50IHtcclxuICAgICAgICByZXR1cm4gZW50aXR5LmdldE1vYkNvbXBvbmVudChcIlZpcnR1YWxJbnZlbnRvcnlDb21wb25lbnRcIikhO1xyXG4gICAgfVxyXG5cclxuICAgIHB1YmxpYyBwcm9jZXNzKCkge1xyXG4gICAgICAgIGlmIChNYWluLmN1cnJlbnRUaWNrICUgVmlydHVhbEludmVudG9yeUNvbXBvbmVudC5JbnZhbGlkYXRpb25JbnRlcnZhbCA9PT0gMCkgdGhpcy5yZWZyZXNoU2xvdHMoKTtcclxuXHJcbiAgICAgICAgaWYgKHRoaXMuaGFzQ2hhbmdlZFRoaXNUaWNrKSB7XHJcbiAgICAgICAgICAgIHRoaXMuaGFzQ2hhbmdlZFRoaXNUaWNrID0gZmFsc2U7XHJcbiAgICAgICAgICAgIEN1c3RvbUV2ZW50cy5lbWl0KFwiQUlQSW52ZW50b3J5Q2hhbmdlZFwiLCB0aGlzLmVudGl0eSk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB0aGlzLmhhc1BpY2tlZFVwVGhpc1RpY2sgPSBmYWxzZTtcclxuICAgIH1cclxuXHJcbiAgICAvLyAjUkVHSU9OIFN5bmNpbmdcclxuICAgIHByaXZhdGUgcmVmcmVzaFNsb3RzKCk6IHZvaWQge1xyXG4gICAgICAgIHRoaXMudHlwZUlkVG9TbG90cy5jbGVhcigpO1xyXG5cclxuICAgICAgICBjb25zdCBzaXplID0gdGhpcy5pbnZlbnRvcnkuc2l6ZTtcclxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHNpemU7IGkrKykge1xyXG4gICAgICAgICAgICBjb25zdCBpdGVtID0gdGhpcy5pbnZlbnRvcnkuZ2V0SXRlbShpKTtcclxuICAgICAgICAgICAgdGhpcy5zbG90c1tpXSA9IGl0ZW07XHJcbiAgICAgICAgICAgIGlmICghaXRlbSkgY29udGludWU7XHJcblxyXG4gICAgICAgICAgICBjb25zdCBzbG90cyA9IHRoaXMudHlwZUlkVG9TbG90cy5nZXQoaXRlbS50eXBlSWQpO1xyXG4gICAgICAgICAgICBpZiAoc2xvdHMpIHNsb3RzLnB1c2goaSk7XHJcbiAgICAgICAgICAgIGVsc2UgdGhpcy50eXBlSWRUb1Nsb3RzLnNldChpdGVtLnR5cGVJZCwgW2ldKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGNvbnN0IG5ld0hhc2ggPSB0aGlzLmhhc2hTbG90cygpO1xyXG4gICAgICAgIGlmICh0aGlzLmN1cnJlbnRIYXNoID09PSBuZXdIYXNoKSByZXR1cm47XHJcblxyXG4gICAgICAgIHRoaXMuY3VycmVudEhhc2ggPSBuZXdIYXNoO1xyXG4gICAgICAgIHRoaXMuaGFzQ2hhbmdlZFRoaXNUaWNrID0gdHJ1ZTtcclxuICAgIH1cclxuXHJcbiAgICBwdWJsaWMgaGFzaFNsb3RzKCk6IG51bWJlciB7XHJcbiAgICAgICAgY29uc3QgcmF3ID0gdGhpcy5zbG90cy5tYXAoKGl0ZW0pID0+IEludmVudG9yeVV0aWwuc2VyaWFsaXplQmFzaWNJdGVtU3RhY2soaXRlbSkpLmpvaW4oXCJ8XCIpO1xyXG4gICAgICAgIHJldHVybiBNYXRoVXRpbC5oYXNoKHJhdyk7XHJcbiAgICB9XHJcbiAgICAvLyAjRU5EUkVHSU9OXHJcblxyXG4gICAgLy8gI1JFR0lPTiBSZWFkaW5nXHJcbiAgICBwdWJsaWMgZ2V0U2xvdChzbG90OiBudW1iZXIpOiBJdGVtU3RhY2sgfCB1bmRlZmluZWQge1xyXG4gICAgICAgIHJldHVybiB0aGlzLnNsb3RzW3Nsb3RdO1xyXG4gICAgfVxyXG5cclxuICAgIHB1YmxpYyBmaW5kSXRlbVR5cGUoaXRlbVR5cGU6IHN0cmluZyk6IEl0ZW1TdGFjayB8IHVuZGVmaW5lZCB7XHJcbiAgICAgICAgY29uc3Qgc2xvdHMgPSB0aGlzLnR5cGVJZFRvU2xvdHMuZ2V0KGl0ZW1UeXBlKTtcclxuICAgICAgICBpZiAoIXNsb3RzKSByZXR1cm4gdW5kZWZpbmVkO1xyXG4gICAgICAgIHJldHVybiB0aGlzLnNsb3RzW3Nsb3RzWzBdXTtcclxuICAgIH1cclxuXHJcbiAgICBwdWJsaWMgY291bnRJdGVtVHlwZShpdGVtVHlwZTogc3RyaW5nKTogbnVtYmVyIHtcclxuICAgICAgICBjb25zdCBzbG90cyA9IHRoaXMudHlwZUlkVG9TbG90cy5nZXQoaXRlbVR5cGUpO1xyXG4gICAgICAgIGlmICghc2xvdHMpIHJldHVybiAwO1xyXG5cclxuICAgICAgICBsZXQgY291bnQgPSAwO1xyXG4gICAgICAgIGZvciAoY29uc3Qgc2xvdCBvZiBzbG90cykgY291bnQgKz0gdGhpcy5zbG90c1tzbG90XSEuYW1vdW50O1xyXG4gICAgICAgIHJldHVybiBjb3VudDtcclxuICAgIH1cclxuXHJcbiAgICBwdWJsaWMgY291bnRJdGVtVHlwZU9mRmFtaWx5KGZhbWlseTogc3RyaW5nKTogbnVtYmVyIHtcclxuICAgICAgICBsZXQgY291bnQgPSAwO1xyXG4gICAgICAgIGZvciAoY29uc3QgaXRlbSBvZiB0aGlzLnNsb3RzKSB7XHJcbiAgICAgICAgICAgIGlmICghaXRlbSkgY29udGludWU7XHJcbiAgICAgICAgICAgIGlmIChpdGVtLnR5cGVJZC5pbmNsdWRlcyhmYW1pbHkpKSBjb3VudCArPSBpdGVtLmFtb3VudDtcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIGNvdW50O1xyXG4gICAgfVxyXG5cclxuICAgIHB1YmxpYyBoYXNJdGVtVHlwZShpdGVtVHlwZTogc3RyaW5nKTogYm9vbGVhbiB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuZmluZEl0ZW1UeXBlKGl0ZW1UeXBlKSAhPT0gdW5kZWZpbmVkO1xyXG4gICAgfVxyXG5cclxuICAgIHB1YmxpYyBoYXNJdGVtU3RhY2soaXRlbVN0YWNrOiBJdGVtU3RhY2spOiBib29sZWFuIHtcclxuICAgICAgICBjb25zdCBzZXJpYWxpemVkID0gSW52ZW50b3J5VXRpbC5zZXJpYWxpemVCYXNpY0l0ZW1TdGFjayhpdGVtU3RhY2spO1xyXG4gICAgICAgIGZvciAoY29uc3QgaXRlbSBvZiB0aGlzLnNsb3RzKSB7XHJcbiAgICAgICAgICAgIGlmICghaXRlbSkgY29udGludWU7XHJcbiAgICAgICAgICAgIGlmIChzZXJpYWxpemVkID09PSBJbnZlbnRvcnlVdGlsLnNlcmlhbGl6ZUJhc2ljSXRlbVN0YWNrKGl0ZW0pKSByZXR1cm4gdHJ1ZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgfVxyXG5cclxuICAgIHB1YmxpYyBoYXNTcGFjZUZvckl0ZW1TdGFjayhpdGVtU3RhY2s6IEl0ZW1TdGFjayk6IGJvb2xlYW4ge1xyXG4gICAgICAgIGxldCByZW1haW5pbmcgPSBpdGVtU3RhY2suYW1vdW50O1xyXG5cclxuICAgICAgICBmb3IgKGNvbnN0IHNsb3QgaW4gdGhpcy5zbG90cykge1xyXG4gICAgICAgICAgICBjb25zdCBleGlzdGluZyA9IHRoaXMuc2xvdHNbc2xvdF07XHJcbiAgICAgICAgICAgIC8vIFJldHVybiB0cnVlIGlmIHRoZXJlJ3MgYW4gZW1wdHkgc2xvdFxyXG4gICAgICAgICAgICBpZiAoIWV4aXN0aW5nKSByZXR1cm4gdHJ1ZTtcclxuICAgICAgICAgICAgLy8gSWYgdGhlIGl0ZW0gdHlwZSBkb2Vzbid0IG1hdGNoLCBza2lwXHJcbiAgICAgICAgICAgIGlmIChleGlzdGluZy50eXBlSWQgIT09IGl0ZW1TdGFjay50eXBlSWQpIGNvbnRpbnVlO1xyXG5cclxuICAgICAgICAgICAgY29uc3QgbmV3QW1vdW50ID0gZXhpc3RpbmcuYW1vdW50ICsgcmVtYWluaW5nO1xyXG4gICAgICAgICAgICAvLyBSZXR1cm4gdHJ1ZSBpZiB0aGUgaXRlbSBjYW4gc3RhY2sgaW4gdGhpcyBzbG90XHJcbiAgICAgICAgICAgIGlmIChuZXdBbW91bnQgPD0gaXRlbVN0YWNrLm1heEFtb3VudCkgcmV0dXJuIHRydWU7XHJcblxyXG4gICAgICAgICAgICAvLyBSZWR1Y2UgcmVtYWluaW5nIGJ5IGhvdyBtYW55IGl0ZW1zIGNhbiBmaXQgaW4gdGhpcyBzbG90XHJcbiAgICAgICAgICAgIHJlbWFpbmluZyAtPSBpdGVtU3RhY2subWF4QW1vdW50IC0gZXhpc3RpbmcuYW1vdW50O1xyXG5cclxuICAgICAgICAgICAgLy8gSWYgdGhlcmUgYXJlIG5vIG1vcmUgaXRlbXMgcmVtYWluaW5nIHRvIGZpdCwgcmV0dXJuIHRydWVcclxuICAgICAgICAgICAgaWYgKHJlbWFpbmluZyA8PSAwKSByZXR1cm4gdHJ1ZTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgIH1cclxuICAgIC8vICNFTkRSRUdJT05cclxuXHJcbiAgICAvLyAjUkVHSU9OIFdyaXRpbmdcclxuICAgIHB1YmxpYyBnaXZlSXRlbShpdGVtU3RhY2s6IEl0ZW1TdGFjayk6IEl0ZW1TdGFjayB8IHVuZGVmaW5lZCB7XHJcbiAgICAgICAgY29uc3QgcmVzdWx0ID0gdGhpcy5pbnZlbnRvcnkuYWRkSXRlbShpdGVtU3RhY2spO1xyXG4gICAgICAgIHRoaXMucmVmcmVzaFNsb3RzKCk7XHJcbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcclxuICAgIH1cclxuXHJcbiAgICBwdWJsaWMgc2V0U2xvdChzbG90OiBudW1iZXIsIGl0ZW1TdGFjazogSXRlbVN0YWNrIHwgdW5kZWZpbmVkKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5pbnZlbnRvcnkuc2V0SXRlbShzbG90LCBpdGVtU3RhY2spO1xyXG5cclxuICAgICAgICB0aGlzLnJlZnJlc2hTbG90cygpO1xyXG4gICAgfVxyXG5cclxuICAgIHB1YmxpYyBzZXRTbG90cyhzbG90czogSW52ZW50b3J5QXJyYXkpOiB2b2lkIHtcclxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMuaW52ZW50b3J5LnNpemU7IGkrKykge1xyXG4gICAgICAgICAgICBjb25zdCBpdGVtID0gc2xvdHNbaV07XHJcbiAgICAgICAgICAgIHRoaXMuaW52ZW50b3J5LnNldEl0ZW0oaSwgaXRlbSk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMucmVmcmVzaFNsb3RzKCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHVibGljIGNsZWFyU2xvdChzbG90OiBudW1iZXIpIHtcclxuICAgICAgICB0aGlzLnNldFNsb3Qoc2xvdCwgdW5kZWZpbmVkKTtcclxuICAgIH1cclxuXHJcbiAgICBwdWJsaWMgcmVtb3ZlSXRlbShpdGVtU3RhY2s6IEl0ZW1TdGFjaykge1xyXG4gICAgICAgIEludmVudG9yeVV0aWwucmVtb3ZlSXRlbSh0aGlzLmVudGl0eSwgaXRlbVN0YWNrKTtcclxuICAgICAgICB0aGlzLnJlZnJlc2hTbG90cygpO1xyXG4gICAgfVxyXG5cclxuICAgIHB1YmxpYyBkZXBvc2l0U2xvdFRvQ29udGFpbmVyKHNsb3Q6IG51bWJlciwgY29udGFpbmVyOiBDb250YWluZXIsIGNvdW50PzogbnVtYmVyKTogYm9vbGVhbiB7XHJcbiAgICAgICAgY29uc3Qgc3VjY2VzcyA9IEludmVudG9yeVV0aWwudHJhbnNmZXJJdGVtQW1vdW50KHRoaXMuaW52ZW50b3J5LCBzbG90LCBjb250YWluZXIsIGNvdW50KTtcclxuICAgICAgICB0aGlzLnJlZnJlc2hTbG90cygpO1xyXG4gICAgICAgIHJldHVybiBzdWNjZXNzO1xyXG4gICAgfVxyXG5cclxuICAgIHB1YmxpYyBkZXBvc2l0SXRlbVN0YWNrVG9Db250YWluZXJTbG90KGl0ZW1TdGFjazogSXRlbVN0YWNrLCBjb250YWluZXI6IENvbnRhaW5lciwgdG9TbG90OiBudW1iZXIpOiBib29sZWFuIHtcclxuICAgICAgICBjb25zdCByZXN1bHQgPSBJbnZlbnRvcnlVdGlsLnRyeU1vdmVJdGVtVG9Db250YWluZXIodGhpcy5lbnRpdHksIGl0ZW1TdGFjaywgdG9TbG90LCBjb250YWluZXIpO1xyXG4gICAgICAgIGlmIChyZXN1bHQpIHRoaXMucmVmcmVzaFNsb3RzKCk7XHJcbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcclxuICAgIH1cclxuXHJcbiAgICBwdWJsaWMgd2l0aGRyYXdGcm9tQ29udGFpbmVyU2xvdChzb3VyY2U6IENvbnRhaW5lciwgc2xvdDogbnVtYmVyLCBjb3VudD86IG51bWJlcik6IGJvb2xlYW4ge1xyXG4gICAgICAgIGNvbnN0IHN1Y2Nlc3MgPSBJbnZlbnRvcnlVdGlsLnRyYW5zZmVySXRlbUFtb3VudChzb3VyY2UsIHNsb3QsIHRoaXMuaW52ZW50b3J5LCBjb3VudCk7XHJcbiAgICAgICAgdGhpcy5yZWZyZXNoU2xvdHMoKTtcclxuICAgICAgICByZXR1cm4gc3VjY2VzcztcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIE1lcmdlcyBwYXJ0aWFsIHN0YWNrcyBvZiB0aGUgc2FtZSBpdGVtIHR5cGUgaW4gYW4gZW50aXR5J3MgaW52ZW50b3J5IGFuZCBjb21wYWN0cyB0aGVtIHRvIHRoZSBlYXJsaWVzdCBzbG90cy5cclxuICAgICAqIEUuZy4gaWYgdHdvIHNsb3RzIGVhY2ggaGF2ZSAxIHN0b25lLCB0aGV5IGdldCBtZXJnZWQgaW50byBhIHNpbmdsZSBzdGFjayBvZiAyLCBhbmQgYWxsIGl0ZW1zIGFyZSBtb3ZlZCB0byB0aGUgZWFybGllc3Qgc2xvdHMuXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBtZXJnZUFuZENvbXBhY3QoKTogdm9pZCB7XHJcbiAgICAgICAgLy8gTWVyZ2UgcGFydGlhbCBzdGFja3Mgb2YgdGhlIHNhbWUgdHlwZSwgb25seSBjb21wYXJpbmcgc2xvdHMgdGhhdCBzaGFyZSBhIHR5cGVcclxuICAgICAgICBmb3IgKGNvbnN0IHNsb3RzT2ZUeXBlIG9mIHRoaXMudHlwZUlkVG9TbG90cy52YWx1ZXMoKSkge1xyXG4gICAgICAgICAgICBmb3IgKGxldCBhID0gMDsgYSA8IHNsb3RzT2ZUeXBlLmxlbmd0aDsgYSsrKSB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBzb3VyY2UgPSB0aGlzLnNsb3RzW3Nsb3RzT2ZUeXBlW2FdXTtcclxuICAgICAgICAgICAgICAgIGlmICghc291cmNlIHx8IHNvdXJjZS5hbW91bnQgPj0gc291cmNlLm1heEFtb3VudCkgY29udGludWU7XHJcblxyXG4gICAgICAgICAgICAgICAgZm9yIChsZXQgYiA9IGEgKyAxOyBiIDwgc2xvdHNPZlR5cGUubGVuZ3RoOyBiKyspIHtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCB0YXJnZXRTbG90ID0gc2xvdHNPZlR5cGVbYl07XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdGFyZ2V0ID0gdGhpcy5zbG90c1t0YXJnZXRTbG90XTtcclxuICAgICAgICAgICAgICAgICAgICBpZiAoIXRhcmdldD8uaXNTdGFja2FibGVXaXRoKHNvdXJjZSkpIGNvbnRpbnVlO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICBjb25zdCB0b01vdmUgPSBNYXRoLm1pbih0YXJnZXQuYW1vdW50LCBzb3VyY2UubWF4QW1vdW50IC0gc291cmNlLmFtb3VudCk7XHJcbiAgICAgICAgICAgICAgICAgICAgc291cmNlLmFtb3VudCArPSB0b01vdmU7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIGlmICh0b01vdmUgPj0gdGFyZ2V0LmFtb3VudCkgdGhpcy5zbG90c1t0YXJnZXRTbG90XSA9IHVuZGVmaW5lZDtcclxuICAgICAgICAgICAgICAgICAgICBlbHNlIHRhcmdldC5hbW91bnQgLT0gdG9Nb3ZlO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICBpZiAoc291cmNlLmFtb3VudCA+PSBzb3VyY2UubWF4QW1vdW50KSBicmVhaztcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gQ29tcGFjdCBpdGVtcyB0byB0aGUgZWFybGllc3Qgc2xvdHMgKHJlbW92ZSBnYXBzKVxyXG4gICAgICAgIGNvbnN0IGNvbXBhY3RlZDogSW52ZW50b3J5QXJyYXkgPSBuZXcgQXJyYXkodGhpcy5zbG90cy5sZW5ndGgpLmZpbGwodW5kZWZpbmVkKTtcclxuICAgICAgICBsZXQgd3JpdGVJbmRleCA9IDA7XHJcbiAgICAgICAgZm9yIChjb25zdCBpdGVtIG9mIHRoaXMuc2xvdHMpIGlmIChpdGVtKSBjb21wYWN0ZWRbd3JpdGVJbmRleCsrXSA9IGl0ZW07XHJcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBjb21wYWN0ZWQubGVuZ3RoOyBpKyspIHRoaXMuc2xvdHNbaV0gPSBjb21wYWN0ZWRbaV07XHJcblxyXG4gICAgICAgIHRoaXMuc2V0U2xvdHModGhpcy5zbG90cyk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gI0VORFJFR0lPTlxyXG59XHJcbiJdLCJuYW1lcyI6WyJFbnRpdHlDb21wb25lbnRUeXBlcyIsIlRpY2tzUGVyU2Vjb25kIiwiQUlQRGF0YSIsIkludmVudG9yeURhdGEiLCJBYnN0cmFjdE1vYkNvbXBvbmVudCIsIlZpcnR1YWxJbnZlbnRvcnlDb21wb25lbnQiLCJvbkVudGl0eURpZSIsImV2ZW50Iiwib3duZXJUYWciLCJlbnRpdHkiLCJuYW1lVGFnIiwibmVhcmJ5SXRlbXMiLCJkaW1lbnNpb24iLCJnZXRFbnRpdGllcyIsImxvY2F0aW9uIiwiZGVhZEVudGl0eSIsInR5cGUiLCJtYXhEaXN0YW5jZSIsIkRlYXRoSXRlbVRhZ2dpbmdSYWRpdXMiLCJpdGVtIiwiYWRkVGFnIiwib25FbnRpdHlJdGVtUGlja3VwQmVmb3JlIiwiaGVhbHRoIiwiZ2V0Q29tcG9uZW50IiwiSGVhbHRoIiwiY3VycmVudFZhbHVlIiwiY2FuY2VsIiwiaXNUaHJvd24iLCJoYXNUYWciLCJvbkVudGl0eUl0ZW1QaWNrdXBBZnRlciIsInJlZnJlc2hTbG90cyIsImhhc0NoYW5nZWRUaGlzVGljayIsImhhc1BpY2tlZFVwVGhpc1RpY2siLCJwbGF5U291bmQiLCJwaXRjaCIsInZvbHVtZSIsImdldCIsImdldE1vYkNvbXBvbmVudCIsInByb2Nlc3MiLCJNYWluIiwiY3VycmVudFRpY2siLCJJbnZhbGlkYXRpb25JbnRlcnZhbCIsIkN1c3RvbUV2ZW50cyIsImVtaXQiLCJ0eXBlSWRUb1Nsb3RzIiwiY2xlYXIiLCJzaXplIiwiaW52ZW50b3J5IiwiaSIsImdldEl0ZW0iLCJzbG90cyIsInR5cGVJZCIsInB1c2giLCJzZXQiLCJuZXdIYXNoIiwiaGFzaFNsb3RzIiwiY3VycmVudEhhc2giLCJyYXciLCJtYXAiLCJJbnZlbnRvcnlVdGlsIiwic2VyaWFsaXplQmFzaWNJdGVtU3RhY2siLCJqb2luIiwiTWF0aFV0aWwiLCJoYXNoIiwiZ2V0U2xvdCIsInNsb3QiLCJmaW5kSXRlbVR5cGUiLCJpdGVtVHlwZSIsInVuZGVmaW5lZCIsImNvdW50SXRlbVR5cGUiLCJjb3VudCIsImFtb3VudCIsImNvdW50SXRlbVR5cGVPZkZhbWlseSIsImZhbWlseSIsImluY2x1ZGVzIiwiaGFzSXRlbVR5cGUiLCJoYXNJdGVtU3RhY2siLCJpdGVtU3RhY2siLCJzZXJpYWxpemVkIiwiaGFzU3BhY2VGb3JJdGVtU3RhY2siLCJyZW1haW5pbmciLCJleGlzdGluZyIsIm5ld0Ftb3VudCIsIm1heEFtb3VudCIsImdpdmVJdGVtIiwicmVzdWx0IiwiYWRkSXRlbSIsInNldFNsb3QiLCJzZXRJdGVtIiwic2V0U2xvdHMiLCJjbGVhclNsb3QiLCJyZW1vdmVJdGVtIiwiZGVwb3NpdFNsb3RUb0NvbnRhaW5lciIsImNvbnRhaW5lciIsInN1Y2Nlc3MiLCJ0cmFuc2Zlckl0ZW1BbW91bnQiLCJkZXBvc2l0SXRlbVN0YWNrVG9Db250YWluZXJTbG90IiwidG9TbG90IiwidHJ5TW92ZUl0ZW1Ub0NvbnRhaW5lciIsIndpdGhkcmF3RnJvbUNvbnRhaW5lclNsb3QiLCJzb3VyY2UiLCJtZXJnZUFuZENvbXBhY3QiLCJzbG90c09mVHlwZSIsInZhbHVlcyIsImEiLCJsZW5ndGgiLCJiIiwidGFyZ2V0U2xvdCIsInRhcmdldCIsImlzU3RhY2thYmxlV2l0aCIsInRvTW92ZSIsIk1hdGgiLCJtaW4iLCJjb21wYWN0ZWQiLCJBcnJheSIsImZpbGwiLCJ3cml0ZUluZGV4IiwiTWF4SW52ZW50b3J5U2xvdHMiLCJNYXAiLCJnZXRDb250YWluZXIiLCJldmVudE9wdGlvbnMiLCJlbnRpdHlGaWx0ZXIiLCJuYW1lIiwib25Xb3JsZEV2ZW50IiwiYmluZCIsImVudGl0aWVzIiwiRW50aXR5VHlwZXMiXSwibWFwcGluZ3MiOiJBQUFBLFNBR0lBLG9CQUFvQixFQUtwQkMsY0FBYyxRQUNYLG9CQUFvQjtBQUMzQixPQUFPQyxhQUFhLGVBQWU7QUFDbkMsU0FBU0MsYUFBYSxRQUFRLHFCQUFxQjtBQUNuRCxPQUFPQywwQkFBMEIscUNBQXFDO0FBR3ZELE1BQU1DLGtDQUFrQ0Q7SUEyQjNDRSxZQUFZQyxLQUEwQixFQUFRO1FBQ2xELE1BQU1DLFdBQVcsQ0FBQyxjQUFjLEVBQUUsSUFBSSxDQUFDQyxNQUFNLENBQUNDLE9BQU8sQ0FBQyxDQUFDO1FBQ3ZELE1BQU1DLGNBQWMsSUFBSSxDQUFDRixNQUFNLENBQUNHLFNBQVMsQ0FBQ0MsV0FBVyxDQUFDO1lBQ2xEQyxVQUFVUCxNQUFNUSxVQUFVLENBQUNELFFBQVE7WUFDbkNFLE1BQU07WUFDTkMsYUFBYWYsUUFBUWdCLHNCQUFzQjtRQUMvQztRQUVBLEtBQUssTUFBTUMsUUFBUVIsWUFBYVEsS0FBS0MsTUFBTSxDQUFDWjtJQUNoRDtJQUVRYSx5QkFBeUJkLEtBQWtDLEVBQUU7UUFDakUsOEJBQThCO1FBQzlC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