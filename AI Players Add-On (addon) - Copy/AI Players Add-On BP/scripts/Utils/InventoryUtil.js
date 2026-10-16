/* eslint-disable max-lines */ import { Block, EnchantmentTypes, EquipmentSlot, ItemStack, Player } from "@minecraft/server";
class _InventoryUtil {
    /**
     * Retrieves the inventory container of an entity or block.
     * @param source - The entity or block to get the inventory of.
     * @returns The sources' inventory container.
     */ static getContainer(source) {
        DebugTimer.countStart("InventoryUtil.getContainer");
        const container = source.getComponent("minecraft:inventory").container;
        DebugTimer.countEnd();
        return container;
    }
    /**
     * Retrieves the equipment inventory component of an entity.
     * @param entity - The entity to get the equipment of.
     * @returns The entity's equipment inventory component.
     */ static getEquipment(entity) {
        DebugTimer.countStart("InventoryUtil.getEquipment");
        const equipmentComponent = entity.getComponent("equippable");
        DebugTimer.countEnd();
        return equipmentComponent;
    }
    /**
     * Finds all items of a specific type in an entity's inventory and equipment slots.
     * @param entity - The entity to search for the item.
     * @param itemStackId - The id of the item type to find.
     * @param checkEquipment - Whether to check the entity's equipment slots. Defaults to `true`.
     * @returns An array of items of the specified type found in the entity's inventory and equipment slots.
     */ static findItem(entity, itemStackId, checkEquipment = true) {
        DebugTimer.countStart("InventoryUtil.findItem");
        const returnAndEndCount = (result)=>{
            DebugTimer.countEnd();
            return result;
        };
        const itemsFound = [];
        // Check if entity has item in inventory
        const inventory = this.getContainer(entity);
        for(let i = 0; i < inventory.size; i++){
            const itemStack = inventory.getItem(i);
            if (itemStack && itemStack.typeId === itemStackId) {
                itemsFound.push({
                    itemStack,
                    entitySlot: {
                        isEquipment: false,
                        slot: i
                    }
                });
            }
        }
        // Check if entity has item in equipment
        if (!checkEquipment) return returnAndEndCount(itemsFound);
        const equipment = this.getEquipment(entity);
        if (!equipment) return returnAndEndCount(itemsFound);
        for(const slot in EquipmentSlot){
            if (slot === EquipmentSlot.Mainhand) continue; // Skip mainhand because it's in the inventory
            const itemStack = equipment.getEquipment(slot);
            if (itemStack && itemStack.typeId === itemStackId) {
                itemsFound.push({
                    itemStack,
                    entitySlot: {
                        isEquipment: true,
                        slot: slot
                    }
                });
            }
        }
        return returnAndEndCount(itemsFound);
    }
    /**
     * Finds the first item of a specific type in an entity's inventory and equipment slots.
     * @param source - The entity or block to search for the item.
     * @param itemStackId - The id of the item type to find.
     * @param checkEquipment - Whether to check the entity's equipment slots. Defaults to `true`.
     * @returns The first matching item and its slot, or `null` if no matching item is found.
     */ static findFirstItem(source, itemStackId, checkEquipment = true) {
        DebugTimer.countStart("InventoryUtil.findFirstItem");
        const returnAndEndCount = (result)=>{
            DebugTimer.countEnd();
            return result;
        };
        // Check if entity or block has item in inventory
        const inventory = this.getContainer(source);
        if (inventory) {
            for(let i = 0; i < inventory.size; i++){
                const itemStack = inventory.getItem(i);
                if (!itemStack) continue;
                if (itemStackId !== itemStack.typeId) continue;
                return returnAndEndCount({
                    itemStack,
                    entitySlot: {
                        isEquipment: false,
                        slot: i
                    }
                });
            }
        }
        // Check if entity has item in equipment
        if (!checkEquipment || source instanceof Block) return returnAndEndCount(null);
        const equipment = this.getEquipment(source);
        if (equipment) {
            for(const slot in EquipmentSlot){
                if (slot === EquipmentSlot.Mainhand) continue; // Skip mainhand because it's in the inventory
                const itemStack = equipment.getEquipment(slot);
                if (!itemStack) continue;
                if (itemStackId !== itemStack.typeId) continue;
                return returnAndEndCount({
                    itemStack,
                    entitySlot: {
                        isEquipment: true,
                        slot: slot
                    }
                });
            }
        }
        return returnAndEndCount(null);
    }
    /**
     * Counts the total number of items of a specific type in an entity's inventory and equipment slots.
     * @param entity - The entity to count the items for.
     * @param itemStackId - The id of the item type to count.
     * @returns The total number of items of the specified type.
     */ static getItemCount(entity, itemStackId) {
        DebugTimer.countStart("InventoryUtil.getItemCount");
        const foundItems = this.findItem(entity, itemStackId);
        let count = 0;
        for (const foundItem of foundItems){
            count += foundItem.itemStack.amount;
        }
        DebugTimer.countEnd();
        return count;
    }
    /**
     * Checks if an entity has a specific item type in its inventory or equipment slots.
     * @param entity - The entity to check.
     * @param itemStackId - The id of the item type to check for.
     * @returns `true` if the entity has the item, otherwise `false`.
     */ static hasItem(entity, itemStackId) {
        // Check if entity has item in inventory using findItem
        DebugTimer.countStart("InventoryUtil.hasItem");
        const foundItems = this.findItem(entity, itemStackId);
        DebugTimer.countEnd();
        return foundItems.length > 0;
    }
    /** Serializes an `ItemStack` into a string representation.
     * @param itemStack - The `ItemStack` to serialize.
     * @returns A string representation of the `ItemStack`.
     */ static serializeBasicItemStack(itemStack) {
        if (!itemStack) return "empty";
        return `${itemStack.typeId}/${itemStack.amount}`;
    }
    /**
     * Clears all items from an entity's inventory and equipment slots.
     * @param entity - The entity to clear the inventory of.
     * @param clearEquipment - Whether to clear the equipment slots as well. Defaults to `true`.
     */ static clearInventory(entity, clearEquipment = true) {
        // Doesn't use clearInventorySlot or clearEquipmentSlot because it's faster to loop through all slots
        // Clear inventory by looping through all slots
        DebugTimer.countStart("InventoryUtil.clearInventory");
        const inventory = _InventoryUtil.getContainer(entity);
        if (inventory) {
            for(let i = 0; i < inventory.size; i++){
                inventory.setItem(i, undefined);
            }
        }
        // Clear equipment
        const equipment = _InventoryUtil.getEquipment(entity);
        if (equipment && clearEquipment) {
            equipment.setEquipment(EquipmentSlot.Head, undefined);
            equipment.setEquipment(EquipmentSlot.Chest, undefined);
            equipment.setEquipment(EquipmentSlot.Legs, undefined);
            equipment.setEquipment(EquipmentSlot.Feet, undefined);
            equipment.setEquipment(EquipmentSlot.Offhand, undefined);
            equipment.setEquipment(EquipmentSlot.Mainhand, undefined);
        }
        DebugTimer.countEnd();
    }
    /**
     * Clears specific slots in an entity's inventory or equipment.
     * @param entity - The entity to clear the slots of.
     * @param entitySlots - The slots to clear.
     */ static clearSlots(entity, entitySlots) {
        DebugTimer.countStart("InventoryUtil.clearSlots");
        for (const entitySlot of entitySlots){
            this.clearSlot(entity, entitySlot);
        }
        DebugTimer.countEnd();
    }
    /**
     * Clears a specific slot in an entity's inventory or equipment.
     * @param entity - The entity to clear the slot of.
     * @param entitySlot - The slot to clear.
     */ static clearSlot(entity, entitySlot) {
        DebugTimer.countStart("InventoryUtil.clearSlot");
        if (entitySlot.isEquipment) this.clearEquipmentSlot(entity, entitySlot.slot);
        else this.clearInventorySlot(entity, entitySlot.slot);
        DebugTimer.countEnd();
    }
    /**
     * Clears a specific inventory slot of an entity.
     * @param entity - The entity to clear the inventory slot of.
     * @param slot - The inventory slot index to clear.
     */ static clearInventorySlot(entity, slot) {
        DebugTimer.countStart("InventoryUtil.clearInventorySlot");
        const inventory = this.getContainer(entity);
        if (inventory) inventory.setItem(slot, undefined);
        DebugTimer.countEnd();
    }
    /**
     * Clears a specific equipment slot of an entity.
     * @param entity - The entity to clear the equipment slot of.
     * @param slot - The equipment slot to clear.
     */ static clearEquipmentSlot(entity, slot) {
        DebugTimer.countStart("InventoryUtil.clearEquipmentSlot");
        const equipment = this.getEquipment(entity);
        if (equipment) equipment.setEquipment(slot, undefined);
        DebugTimer.countEnd();
    }
    /**
     * Finds and removes a specific item from an entity's inventory.
     * @param entity - The entity to clear the item from.
     * @param itemToRemove - The item stack to clear.
     */ static removeItem(entity, itemToRemove) {
        DebugTimer.countStart("InventoryUtil.removeItem");
        const foundItems = this.findItem(entity, itemToRemove.typeId);
        let amountToRemove = itemToRemove.amount;
        // Loop through and remove amountToRemove items
        for (const foundItem of foundItems){
            const foundItemStack = foundItem.itemStack;
            if (amountToRemove <= 0) break;
            if (amountToRemove >= foundItemStack.amount) {
                amountToRemove -= foundItemStack.amount;
                this.clearSlot(entity, foundItem.entitySlot);
            } else {
                foundItemStack.amount -= amountToRemove;
                amountToRemove = 0;
                this.setItem(entity, foundItemStack, foundItem.entitySlot);
            }
        }
        DebugTimer.countEnd();
    }
    /**
     * @param entity The entity to set the item in
     * @param itemStack The item stack to set
     * @param entitySlot The slot to set the item in
     */ static setItem(entity, itemStack, entitySlot) {
        DebugTimer.countStart("InventoryUtil.setItem");
        if (entitySlot.isEquipment) this.setEquipmentItem(entity, entitySlot.slot, itemStack);
        else this.setInventoryItem(entity, itemStack, entitySlot.slot);
        DebugTimer.countEnd();
    }
    /**
     * Sets an item in the specified inventory slot of an entity.
     * @param entity - The entity whose inventory will be modified.
     * @param itemStack - The item stack to set in the inventory slot.
     * @param slot - The inventory slot index where the item will be placed.
     * @param lockMode - Optional. The lock mode to apply to the item stack.
     */ static setInventoryItem(entity, itemStack, slot, lockMode) {
        DebugTimer.countStart("InventoryUtil.setInventoryItem");
        const inventory = this.getContainer(entity);
        if (inventory) {
            if (lockMode) itemStack.lockMode = lockMode;
            inventory.setItem(slot, itemStack);
            if (entity instanceof Player) this.onPlayerGivenItem(entity, itemStack);
        }
        DebugTimer.countEnd();
    }
    static onPlayerGivenItem(player, itemStack) {
        CustomEvents.emit("PlayerGivenItem", player, itemStack);
    }
    /**
     * Sets the selected slot for a player with the specified item stack and optional lock mode.
     * @param player - The player whose selected slot is to be set.
     * @param itemStack - (Optional) The item stack to set in the selected slot.
     * @param lockMode - (Optional) The lock mode to apply to the item stack.
     */ static setSelectedSlot(player, itemStack, lockMode) {
        DebugTimer.countStart("InventoryUtil.setSelectedSlot");
        const inventory = this.getContainer(player);
        if (inventory) {
            if (itemStack && lockMode) itemStack.lockMode = lockMode;
            inventory.setItem(player.selectedSlotIndex, itemStack);
            if (itemStack) this.onPlayerGivenItem(player, itemStack);
        }
        DebugTimer.countEnd();
    }
    /**
     * Retrieves the item currently held in the offhand slot of the specified entity.
     * @param entity - The entity from which to retrieve the offhand item.
     * @returns The item in the offhand slot, or `undefined` if no item is present or the equipment data is unavailable.
     */ static getOffhandItem(entity) {
        DebugTimer.countStart("InventoryUtil.getOffhandItem");
        const equipment = this.getEquipment(entity);
        const item = equipment.getEquipment(EquipmentSlot.Offhand);
        DebugTimer.countEnd();
        return item;
    }
    /**
     * Sets an item in the specified equipment slot of an entity.
     *   @param entity The entity to set the item in
     *   @param itemStack The item stack to set
     *   @param slot The slot to set the item in
     */ static setEquipmentItem(entity, slot, itemStack) {
        DebugTimer.countStart("InventoryUtil.setEquipmentItem");
        const equipment = this.getEquipment(entity);
        if (!equipment) {
            console.warn(`Entity ${entity.typeId} does not have equipment`);
        } else {
            equipment.setEquipment(slot, itemStack);
            if (entity instanceof Player && itemStack) this.onPlayerGivenItem(entity, itemStack);
        }
        DebugTimer.countEnd();
    }
    /**
     * Gives an item stack to an entity's inventory.
     * @param target The entity or block to give the item to
     * @param itemStack The item stack to give
     * @param lockMode The lock mode to apply to the item stack
     */ static giveItem(target, itemStack, fillExistingStacks = true, lockMode) {
        DebugTimer.countStart("InventoryUtil.giveItem");
        const inventory = this.getContainer(target);
        if (inventory) {
            if (lockMode) itemStack.lockMode = lockMode;
            let remaining = itemStack.amount;
            if (fillExistingStacks) {
                for(let i = 0; i < inventory.size && remaining > 0; i++){
                    const existing = inventory.getItem(i);
                    if (existing?.typeId === itemStack.typeId && existing.amount < itemStack.maxAmount) {
                        const toAdd = Math.min(itemStack.maxAmount - existing.amount, remaining);
                        existing.amount += toAdd;
                        inventory.setItem(i, existing);
                        remaining -= toAdd;
                    }
                }
            }
            if (remaining > 0) {
                itemStack.amount = remaining;
                inventory.addItem(itemStack);
            }
            if (target instanceof Player) this.onPlayerGivenItem(target, itemStack);
            DebugTimer.countEnd();
        }
    }
    /**
     * Gives an array of item stacks to an entity's inventory.
     *   @param entity The entity to give the items to
     *   @param itemStacks The item stacks to give
     */ static giveItems(entity, itemStacks, fillExistingStacks = true, lockMode) {
        DebugTimer.countStart("InventoryUtil.giveItems");
        for (const itemStack of itemStacks){
            this.giveItem(entity, itemStack, fillExistingStacks, lockMode);
        }
        DebugTimer.countEnd();
    }
    /**
     * Tries to transfer an item from a specified slot in a container to the first empty slot in a container.
     * @param target The entity or block to give the item to
     * @param fromSlot The slot of the fromContainer the item is in
     * @param fromContainer The container the item is coming from
     * @return The `ItemStack` that could not be transferred, or `undefined` if the item was moved successfully
     */ static transferItemFromContainer(target, fromSlot, fromContainer) {
        DebugTimer.countStart("InventoryUtil.transferItemToInventory");
        const inventory = this.getContainer(target);
        const untransferred = fromContainer.transferItem(fromSlot, inventory);
        DebugTimer.countEnd();
        return untransferred;
    }
    /**
     * Tries to move an item from an entity's inventory to a specified slot in a container.
     * @param entity The entity to move the item from
     * @param itemStack The item to move
     * @param toSlot The slot in the toContainer to move the item to
     * @param toContainer The container to move the item to
     * @returns true if the item was moved successfully, false if the item was not found in the entity's inventory
     */ static tryMoveItemToContainer(entity, itemStack, toSlot, toContainer) {
        DebugTimer.countStart("InventoryUtil.tryMoveItemToContainer");
        const inventory = this.getContainer(entity);
        const fromSlot = inventory.find(itemStack);
        if (fromSlot === undefined) {
            DebugTimer.countEnd();
            return false;
        }
        const existingItem = inventory.getItem(fromSlot);
        if (existingItem && existingItem.amount > itemStack.amount) {
            existingItem.amount -= itemStack.amount;
            inventory.setItem(fromSlot, existingItem);
            toContainer.setItem(toSlot, itemStack);
        } else {
            inventory.moveItem(fromSlot, toSlot, toContainer);
        }
        DebugTimer.countEnd();
        return true;
    }
    /**
     * Retrieves the currently selected item from the player's inventory.
     * @param player - The player whose selected item is to be retrieved.
     * @returns The `ItemStack` representing the selected item, or `undefined` if no item is selected or the inventory is unavailable.
     */ static selectedItem(player) {
        DebugTimer.countStart("InventoryUtil.selectedItem");
        const inventory = this.getContainer(player);
        const selectedItem = inventory.getItem(player.selectedSlotIndex);
        DebugTimer.countEnd();
        return selectedItem;
    }
    /**
     * Consumes the currently selected item from the player's inventory.
     * If the selected item has a quantity of 1, it removes the item from the selected slot.
     * Otherwise, it decrements the item's quantity by 1 and updates the selected slot.
     * @param player - The player whose selected item is to be consumed.
     * @returns The consumed `ItemStack` if an item was selected, or `undefined` if no item was selected.
     */ static consumeSelectedItem(player) {
        DebugTimer.countStart("InventoryUtil.consumeSelectedItem");
        const item = this.selectedItem(player);
        if (!item) return undefined;
        if (item.amount === 1) this.setSelectedSlot(player, undefined);
        else {
            item.amount--;
            this.setSelectedSlot(player, item);
        }
        DebugTimer.countEnd();
    }
    /**
     * Calculates the number of empty slots in the inventory of the given entity.
     * @param entity - The entity whose inventory is being checked.
     * @returns The number of empty slots in the entity's inventory. Returns 0 if the inventory is unavailable.
     */ static emptySlotsCount(entity) {
        DebugTimer.countStart("InventoryUtil.emptySlotsCount");
        const inventory = this.getContainer(entity);
        DebugTimer.countEnd();
        return inventory.emptySlotsCount ?? 0;
    }
    /** Clears the hotbar slots of a player's inventory
     * @param player The player whose hotbar slots will be cleared
     */ static clearHotbarSlots(player) {
        const hotbarSlots = [];
        for(let i = 0; i < 9; i++)hotbarSlots.push({
            isEquipment: false,
            slot: i
        });
        this.clearSlots(player, hotbarSlots);
    }
    /**
     * Clears a specific hotbar slot of a player's inventory
     * @param player The player whose hotbar slot will be cleared
     * @param slotNumber The hotbar slot number to clear (0-8)
     */ static clearHotbarSlot(player, slotNumber) {
        this.clearSlots(player, [
            {
                isEquipment: false,
                slot: slotNumber
            }
        ]);
    }
    /**
     * Transfers items from one container slot to another container.
     * @param fromContainer - The container to take the item from.
     * @param fromSlot - The slot index in the source container.
     * @param toContainer - The container to give the item to.
     * @param amount - The number of items to transfer, or undefined to transfer all.
     * @returns true if the transfer succeeded, false otherwise.
     */ static transferItemAmount(fromContainer, fromSlot, toContainer, amount) {
        const item = fromContainer.getItem(fromSlot);
        if (!item) return false;
        const amountToTransfer = amount === undefined || item.amount <= amount ? item.amount : amount;
        const partial = item.clone();
        partial.amount = amountToTransfer;
        const overflow = toContainer.addItem(partial);
        if (overflow) return false;
        const remaining = item.amount - amountToTransfer;
        if (remaining > 0) {
            item.amount = remaining;
            fromContainer.setItem(fromSlot, item);
        } else {
            fromContainer.setItem(fromSlot, undefined);
        }
        return true;
    }
    /** Converts the items in a container to an array of item stacks, with `undefined` for empty slots.
     * @param container The container to convert to an array.
     * @returns An array of item stacks representing the contents of the container, with `undefined` for empty slots.
     */ static toArray(container) {
        const items = [];
        for(let i = 0; i < container.size; i++){
            items.push(container.getItem(i));
        }
        return items;
    }
    /**
     * Serializes an ItemStack into a plain object that can be JSON stringified.
     * Captures all relevant properties including name, lore, lock mode, etc.
     */ static serializeItemStack(item) {
        const serialized = {
            typeId: item.typeId,
            amount: item.amount
        };
        if (item.nameTag) serialized.nameTag = item.nameTag;
        if (item.getLore().length > 0) serialized.lore = item.getLore();
        if (item.lockMode) serialized.lockMode = item.lockMode;
        if (item.keepOnDeath) serialized.keepOnDeath = item.keepOnDeath;
        const enchantableComponentId = "minecraft:enchantable";
        if (item.hasComponent(enchantableComponentId)) {
            const enchantable = item.getComponent(enchantableComponentId);
            enchantable?.getEnchantments().forEach((enchantment)=>{
                if (!serialized.enchantments) serialized.enchantments = [];
                serialized.enchantments.push({
                    id: enchantment.type.id,
                    level: enchantment.level
                });
            });
        }
        // Capture dynamic properties if any
        const dynamicProps = item.getDynamicPropertyIds();
        if (dynamicProps.length > 0) {
            serialized.dynamicProperties = {};
            for (const propId of dynamicProps){
                const value = item.getDynamicProperty(propId);
                if (value !== undefined) {
                    serialized.dynamicProperties[propId] = value;
                }
            }
        }
        return serialized;
    }
    /**
     * Deserializes a plain object back into an ItemStack.
     * Reconstructs all properties that were captured during serialization.
     */ static deserializeItemStack(data) {
        const item = new ItemStack(data.typeId, data.amount);
        if (data.nameTag) item.nameTag = data.nameTag;
        if (data.lore) item.setLore(data.lore);
        if (data.lockMode) item.lockMode = data.lockMode;
        if (data.keepOnDeath) item.keepOnDeath = data.keepOnDeath;
        if (data.enchantments) {
            const enchantableComponentId = "minecraft:enchantable";
            const enchantable = item.getComponent(enchantableComponentId);
            if (enchantable) {
                for (const enchantment of data.enchantments){
                    // Strip namespace prefix if present (e.g., "minecraft:sharpness" -> "sharpness")
                    const enchantmentKey = enchantment.id.replace("minecraft:", "");
                    // Look up the enchantment type from the registry
                    const enchantmentType = EnchantmentTypes.get(enchantmentKey);
                    if (enchantmentType) {
                        enchantable.addEnchantment({
                            type: enchantmentType,
                            level: enchantment.level
                        });
                    }
                }
            }
        }
        // Restore dynamic properties
        if (data.dynamicProperties) {
            for (const [key, value] of Object.entries(data.dynamicProperties)){
                item.setDynamicProperty(key, value);
            }
        }
        return item;
    }
}
globalThis.InventoryUtil = _InventoryUtil;

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkludmVudG9yeVV0aWwudHMiXSwic291cmNlc0NvbnRlbnQiOlsiLyogZXNsaW50LWRpc2FibGUgbWF4LWxpbmVzICovXHJcbmltcG9ydCB7XHJcbiAgICBCbG9jayxcclxuICAgIENvbnRhaW5lcixcclxuICAgIEVuY2hhbnRtZW50VHlwZXMsXHJcbiAgICBFbnRpdHksXHJcbiAgICBFbnRpdHlFcXVpcHBhYmxlQ29tcG9uZW50LFxyXG4gICAgRXF1aXBtZW50U2xvdCxcclxuICAgIEl0ZW1Mb2NrTW9kZSxcclxuICAgIEl0ZW1TdGFjayxcclxuICAgIFBsYXllcixcclxuICAgIFZlY3RvcjMsXHJcbn0gZnJvbSBcIkBtaW5lY3JhZnQvc2VydmVyXCI7XHJcblxyXG5leHBvcnQgaW50ZXJmYWNlIEVudGl0eVNsb3Qge1xyXG4gICAgaXNFcXVpcG1lbnQ6IGJvb2xlYW47XHJcbiAgICBzbG90OiBudW1iZXIgfCBFcXVpcG1lbnRTbG90O1xyXG59XHJcblxyXG5leHBvcnQgaW50ZXJmYWNlIFNlcmlhbGl6ZWRJdGVtIHtcclxuICAgIHR5cGVJZDogc3RyaW5nO1xyXG4gICAgYW1vdW50OiBudW1iZXI7XHJcbiAgICBuYW1lVGFnPzogc3RyaW5nO1xyXG4gICAgbG9yZT86IHN0cmluZ1tdO1xyXG4gICAgbG9ja01vZGU/OiBzdHJpbmc7XHJcbiAgICBrZWVwT25EZWF0aD86IGJvb2xlYW47XHJcbiAgICBkeW5hbWljUHJvcGVydGllcz86IFJlY29yZDxzdHJpbmcsIHN0cmluZyB8IG51bWJlciB8IGJvb2xlYW4gfCBWZWN0b3IzPjtcclxuICAgIGVuY2hhbnRtZW50cz86IHsgaWQ6IHN0cmluZzsgbGV2ZWw6IG51bWJlciB9W107XHJcbn1cclxuXHJcbmNsYXNzIF9JbnZlbnRvcnlVdGlsIHtcclxuICAgIC8qKlxyXG4gICAgICogUmV0cmlldmVzIHRoZSBpbnZlbnRvcnkgY29udGFpbmVyIG9mIGFuIGVudGl0eSBvciBibG9jay5cclxuICAgICAqIEBwYXJhbSBzb3VyY2UgLSBUaGUgZW50aXR5IG9yIGJsb2NrIHRvIGdldCB0aGUgaW52ZW50b3J5IG9mLlxyXG4gICAgICogQHJldHVybnMgVGhlIHNvdXJjZXMnIGludmVudG9yeSBjb250YWluZXIuXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgZ2V0Q29udGFpbmVyKHNvdXJjZTogRW50aXR5IHwgQmxvY2spIHtcclxuICAgICAgICBEZWJ1Z1RpbWVyLmNvdW50U3RhcnQoXCJJbnZlbnRvcnlVdGlsLmdldENvbnRhaW5lclwiKTtcclxuICAgICAgICBjb25zdCBjb250YWluZXIgPSBzb3VyY2UuZ2V0Q29tcG9uZW50KFwibWluZWNyYWZ0OmludmVudG9yeVwiKSEuY29udGFpbmVyIGFzIENvbnRhaW5lcjtcclxuICAgICAgICBEZWJ1Z1RpbWVyLmNvdW50RW5kKCk7XHJcbiAgICAgICAgcmV0dXJuIGNvbnRhaW5lcjtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFJldHJpZXZlcyB0aGUgZXF1aXBtZW50IGludmVudG9yeSBjb21wb25lbnQgb2YgYW4gZW50aXR5LlxyXG4gICAgICogQHBhcmFtIGVudGl0eSAtIFRoZSBlbnRpdHkgdG8gZ2V0IHRoZSBlcXVpcG1lbnQgb2YuXHJcbiAgICAgKiBAcmV0dXJucyBUaGUgZW50aXR5J3MgZXF1aXBtZW50IGludmVudG9yeSBjb21wb25lbnQuXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgZ2V0RXF1aXBtZW50KGVudGl0eTogRW50aXR5KSB7XHJcbiAgICAgICAgRGVidWdUaW1lci5jb3VudFN0YXJ0KFwiSW52ZW50b3J5VXRpbC5nZXRFcXVpcG1lbnRcIik7XHJcbiAgICAgICAgY29uc3QgZXF1aXBtZW50Q29tcG9uZW50OiBFbnRpdHlFcXVpcHBhYmxlQ29tcG9uZW50ID0gZW50aXR5LmdldENvbXBvbmVudChcImVxdWlwcGFibGVcIikgYXMgRW50aXR5RXF1aXBwYWJsZUNvbXBvbmVudDtcclxuICAgICAgICBEZWJ1Z1RpbWVyLmNvdW50RW5kKCk7XHJcbiAgICAgICAgcmV0dXJuIGVxdWlwbWVudENvbXBvbmVudDtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEZpbmRzIGFsbCBpdGVtcyBvZiBhIHNwZWNpZmljIHR5cGUgaW4gYW4gZW50aXR5J3MgaW52ZW50b3J5IGFuZCBlcXVpcG1lbnQgc2xvdHMuXHJcbiAgICAgKiBAcGFyYW0gZW50aXR5IC0gVGhlIGVudGl0eSB0byBzZWFyY2ggZm9yIHRoZSBpdGVtLlxyXG4gICAgICogQHBhcmFtIGl0ZW1TdGFja0lkIC0gVGhlIGlkIG9mIHRoZSBpdGVtIHR5cGUgdG8gZmluZC5cclxuICAgICAqIEBwYXJhbSBjaGVja0VxdWlwbWVudCAtIFdoZXRoZXIgdG8gY2hlY2sgdGhlIGVudGl0eSdzIGVxdWlwbWVudCBzbG90cy4gRGVmYXVsdHMgdG8gYHRydWVgLlxyXG4gICAgICogQHJldHVybnMgQW4gYXJyYXkgb2YgaXRlbXMgb2YgdGhlIHNwZWNpZmllZCB0eXBlIGZvdW5kIGluIHRoZSBlbnRpdHkncyBpbnZlbnRvcnkgYW5kIGVxdWlwbWVudCBzbG90cy5cclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBmaW5kSXRlbShlbnRpdHk6IEVudGl0eSwgaXRlbVN0YWNrSWQ6IHN0cmluZywgY2hlY2tFcXVpcG1lbnQgPSB0cnVlKSB7XHJcbiAgICAgICAgRGVidWdUaW1lci5jb3VudFN0YXJ0KFwiSW52ZW50b3J5VXRpbC5maW5kSXRlbVwiKTtcclxuICAgICAgICBjb25zdCByZXR1cm5BbmRFbmRDb3VudCA9IChyZXN1bHQ6IHsgaXRlbVN0YWNrOiBJdGVtU3RhY2s7IGVudGl0eVNsb3Q6IEVudGl0eVNsb3QgfVtdKSA9PiB7XHJcbiAgICAgICAgICAgIERlYnVnVGltZXIuY291bnRFbmQoKTtcclxuICAgICAgICAgICAgcmV0dXJuIHJlc3VsdDtcclxuICAgICAgICB9O1xyXG5cclxuICAgICAgICBjb25zdCBpdGVtc0ZvdW5kOiB7IGl0ZW1TdGFjazogSXRlbVN0YWNrOyBlbnRpdHlTbG90OiBFbnRpdHlTbG90IH1bXSA9IFtdO1xyXG5cclxuICAgICAgICAvLyBDaGVjayBpZiBlbnRpdHkgaGFzIGl0ZW0gaW4gaW52ZW50b3J5XHJcbiAgICAgICAgY29uc3QgaW52ZW50b3J5ID0gdGhpcy5nZXRDb250YWluZXIoZW50aXR5KTtcclxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGludmVudG9yeS5zaXplOyBpKyspIHtcclxuICAgICAgICAgICAgY29uc3QgaXRlbVN0YWNrID0gaW52ZW50b3J5LmdldEl0ZW0oaSk7XHJcbiAgICAgICAgICAgIGlmIChpdGVtU3RhY2sgJiYgaXRlbVN0YWNrLnR5cGVJZCA9PT0gaXRlbVN0YWNrSWQpIHtcclxuICAgICAgICAgICAgICAgIGl0ZW1zRm91bmQucHVzaCh7IGl0ZW1TdGFjaywgZW50aXR5U2xvdDogeyBpc0VxdWlwbWVudDogZmFsc2UsIHNsb3Q6IGkgfSB9KTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gQ2hlY2sgaWYgZW50aXR5IGhhcyBpdGVtIGluIGVxdWlwbWVudFxyXG4gICAgICAgIGlmICghY2hlY2tFcXVpcG1lbnQpIHJldHVybiByZXR1cm5BbmRFbmRDb3VudChpdGVtc0ZvdW5kKTtcclxuXHJcbiAgICAgICAgY29uc3QgZXF1aXBtZW50ID0gdGhpcy5nZXRFcXVpcG1lbnQoZW50aXR5KTtcclxuICAgICAgICBpZiAoIWVxdWlwbWVudCkgcmV0dXJuIHJldHVybkFuZEVuZENvdW50KGl0ZW1zRm91bmQpO1xyXG4gICAgICAgIGZvciAoY29uc3Qgc2xvdCBpbiBFcXVpcG1lbnRTbG90KSB7XHJcbiAgICAgICAgICAgIGlmIChzbG90ID09PSBFcXVpcG1lbnRTbG90Lk1haW5oYW5kKSBjb250aW51ZTsgLy8gU2tpcCBtYWluaGFuZCBiZWNhdXNlIGl0J3MgaW4gdGhlIGludmVudG9yeVxyXG5cclxuICAgICAgICAgICAgY29uc3QgaXRlbVN0YWNrID0gZXF1aXBtZW50LmdldEVxdWlwbWVudChzbG90IGFzIEVxdWlwbWVudFNsb3QpO1xyXG4gICAgICAgICAgICBpZiAoaXRlbVN0YWNrICYmIGl0ZW1TdGFjay50eXBlSWQgPT09IGl0ZW1TdGFja0lkKSB7XHJcbiAgICAgICAgICAgICAgICBpdGVtc0ZvdW5kLnB1c2goeyBpdGVtU3RhY2ssIGVudGl0eVNsb3Q6IHsgaXNFcXVpcG1lbnQ6IHRydWUsIHNsb3Q6IHNsb3QgYXMgRXF1aXBtZW50U2xvdCB9IH0pO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICByZXR1cm4gcmV0dXJuQW5kRW5kQ291bnQoaXRlbXNGb3VuZCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBGaW5kcyB0aGUgZmlyc3QgaXRlbSBvZiBhIHNwZWNpZmljIHR5cGUgaW4gYW4gZW50aXR5J3MgaW52ZW50b3J5IGFuZCBlcXVpcG1lbnQgc2xvdHMuXHJcbiAgICAgKiBAcGFyYW0gc291cmNlIC0gVGhlIGVudGl0eSBvciBibG9jayB0byBzZWFyY2ggZm9yIHRoZSBpdGVtLlxyXG4gICAgICogQHBhcmFtIGl0ZW1TdGFja0lkIC0gVGhlIGlkIG9mIHRoZSBpdGVtIHR5cGUgdG8gZmluZC5cclxuICAgICAqIEBwYXJhbSBjaGVja0VxdWlwbWVudCAtIFdoZXRoZXIgdG8gY2hlY2sgdGhlIGVudGl0eSdzIGVxdWlwbWVudCBzbG90cy4gRGVmYXVsdHMgdG8gYHRydWVgLlxyXG4gICAgICogQHJldHVybnMgVGhlIGZpcnN0IG1hdGNoaW5nIGl0ZW0gYW5kIGl0cyBzbG90LCBvciBgbnVsbGAgaWYgbm8gbWF0Y2hpbmcgaXRlbSBpcyBmb3VuZC5cclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBmaW5kRmlyc3RJdGVtKHNvdXJjZTogRW50aXR5IHwgQmxvY2ssIGl0ZW1TdGFja0lkOiBzdHJpbmcsIGNoZWNrRXF1aXBtZW50ID0gdHJ1ZSkge1xyXG4gICAgICAgIERlYnVnVGltZXIuY291bnRTdGFydChcIkludmVudG9yeVV0aWwuZmluZEZpcnN0SXRlbVwiKTtcclxuICAgICAgICBjb25zdCByZXR1cm5BbmRFbmRDb3VudCA9IChyZXN1bHQ6IHsgaXRlbVN0YWNrOiBJdGVtU3RhY2s7IGVudGl0eVNsb3Q6IEVudGl0eVNsb3QgfSB8IG51bGwpID0+IHtcclxuICAgICAgICAgICAgRGVidWdUaW1lci5jb3VudEVuZCgpO1xyXG4gICAgICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgICAgIH07XHJcblxyXG4gICAgICAgIC8vIENoZWNrIGlmIGVudGl0eSBvciBibG9jayBoYXMgaXRlbSBpbiBpbnZlbnRvcnlcclxuICAgICAgICBjb25zdCBpbnZlbnRvcnkgPSB0aGlzLmdldENvbnRhaW5lcihzb3VyY2UpO1xyXG4gICAgICAgIGlmIChpbnZlbnRvcnkpIHtcclxuICAgICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBpbnZlbnRvcnkuc2l6ZTsgaSsrKSB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBpdGVtU3RhY2sgPSBpbnZlbnRvcnkuZ2V0SXRlbShpKTtcclxuICAgICAgICAgICAgICAgIGlmICghaXRlbVN0YWNrKSBjb250aW51ZTtcclxuICAgICAgICAgICAgICAgIGlmIChpdGVtU3RhY2tJZCAhPT0gaXRlbVN0YWNrLnR5cGVJZCkgY29udGludWU7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gcmV0dXJuQW5kRW5kQ291bnQoeyBpdGVtU3RhY2ssIGVudGl0eVNsb3Q6IHsgaXNFcXVpcG1lbnQ6IGZhbHNlLCBzbG90OiBpIH0gfSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIENoZWNrIGlmIGVudGl0eSBoYXMgaXRlbSBpbiBlcXVpcG1lbnRcclxuICAgICAgICBpZiAoIWNoZWNrRXF1aXBtZW50IHx8IHNvdXJjZSBpbnN0YW5jZW9mIEJsb2NrKSByZXR1cm4gcmV0dXJuQW5kRW5kQ291bnQobnVsbCk7XHJcblxyXG4gICAgICAgIGNvbnN0IGVxdWlwbWVudCA9IHRoaXMuZ2V0RXF1aXBtZW50KHNvdXJjZSk7XHJcbiAgICAgICAgaWYgKGVxdWlwbWVudCkge1xyXG4gICAgICAgICAgICBmb3IgKGNvbnN0IHNsb3QgaW4gRXF1aXBtZW50U2xvdCkge1xyXG4gICAgICAgICAgICAgICAgaWYgKHNsb3QgPT09IEVxdWlwbWVudFNsb3QuTWFpbmhhbmQpIGNvbnRpbnVlOyAvLyBTa2lwIG1haW5oYW5kIGJlY2F1c2UgaXQncyBpbiB0aGUgaW52ZW50b3J5XHJcblxyXG4gICAgICAgICAgICAgICAgY29uc3QgaXRlbVN0YWNrID0gZXF1aXBtZW50LmdldEVxdWlwbWVudChzbG90IGFzIEVxdWlwbWVudFNsb3QpO1xyXG4gICAgICAgICAgICAgICAgaWYgKCFpdGVtU3RhY2spIGNvbnRpbnVlO1xyXG4gICAgICAgICAgICAgICAgaWYgKGl0ZW1TdGFja0lkICE9PSBpdGVtU3RhY2sudHlwZUlkKSBjb250aW51ZTtcclxuXHJcbiAgICAgICAgICAgICAgICByZXR1cm4gcmV0dXJuQW5kRW5kQ291bnQoeyBpdGVtU3RhY2ssIGVudGl0eVNsb3Q6IHsgaXNFcXVpcG1lbnQ6IHRydWUsIHNsb3Q6IHNsb3QgYXMgRXF1aXBtZW50U2xvdCB9IH0pO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICByZXR1cm4gcmV0dXJuQW5kRW5kQ291bnQobnVsbCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBDb3VudHMgdGhlIHRvdGFsIG51bWJlciBvZiBpdGVtcyBvZiBhIHNwZWNpZmljIHR5cGUgaW4gYW4gZW50aXR5J3MgaW52ZW50b3J5IGFuZCBlcXVpcG1lbnQgc2xvdHMuXHJcbiAgICAgKiBAcGFyYW0gZW50aXR5IC0gVGhlIGVudGl0eSB0byBjb3VudCB0aGUgaXRlbXMgZm9yLlxyXG4gICAgICogQHBhcmFtIGl0ZW1TdGFja0lkIC0gVGhlIGlkIG9mIHRoZSBpdGVtIHR5cGUgdG8gY291bnQuXHJcbiAgICAgKiBAcmV0dXJucyBUaGUgdG90YWwgbnVtYmVyIG9mIGl0ZW1zIG9mIHRoZSBzcGVjaWZpZWQgdHlwZS5cclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBnZXRJdGVtQ291bnQoZW50aXR5OiBFbnRpdHksIGl0ZW1TdGFja0lkOiBzdHJpbmcpIHtcclxuICAgICAgICBEZWJ1Z1RpbWVyLmNvdW50U3RhcnQoXCJJbnZlbnRvcnlVdGlsLmdldEl0ZW1Db3VudFwiKTtcclxuICAgICAgICBjb25zdCBmb3VuZEl0ZW1zID0gdGhpcy5maW5kSXRlbShlbnRpdHksIGl0ZW1TdGFja0lkKTtcclxuICAgICAgICBsZXQgY291bnQgPSAwO1xyXG4gICAgICAgIGZvciAoY29uc3QgZm91bmRJdGVtIG9mIGZvdW5kSXRlbXMpIHtcclxuICAgICAgICAgICAgY291bnQgKz0gZm91bmRJdGVtLml0ZW1TdGFjay5hbW91bnQ7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIERlYnVnVGltZXIuY291bnRFbmQoKTtcclxuICAgICAgICByZXR1cm4gY291bnQ7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBDaGVja3MgaWYgYW4gZW50aXR5IGhhcyBhIHNwZWNpZmljIGl0ZW0gdHlwZSBpbiBpdHMgaW52ZW50b3J5IG9yIGVxdWlwbWVudCBzbG90cy5cclxuICAgICAqIEBwYXJhbSBlbnRpdHkgLSBUaGUgZW50aXR5IHRvIGNoZWNrLlxyXG4gICAgICogQHBhcmFtIGl0ZW1TdGFja0lkIC0gVGhlIGlkIG9mIHRoZSBpdGVtIHR5cGUgdG8gY2hlY2sgZm9yLlxyXG4gICAgICogQHJldHVybnMgYHRydWVgIGlmIHRoZSBlbnRpdHkgaGFzIHRoZSBpdGVtLCBvdGhlcndpc2UgYGZhbHNlYC5cclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBoYXNJdGVtKGVudGl0eTogRW50aXR5LCBpdGVtU3RhY2tJZDogc3RyaW5nKSB7XHJcbiAgICAgICAgLy8gQ2hlY2sgaWYgZW50aXR5IGhhcyBpdGVtIGluIGludmVudG9yeSB1c2luZyBmaW5kSXRlbVxyXG4gICAgICAgIERlYnVnVGltZXIuY291bnRTdGFydChcIkludmVudG9yeVV0aWwuaGFzSXRlbVwiKTtcclxuICAgICAgICBjb25zdCBmb3VuZEl0ZW1zID0gdGhpcy5maW5kSXRlbShlbnRpdHksIGl0ZW1TdGFja0lkKTtcclxuICAgICAgICBEZWJ1Z1RpbWVyLmNvdW50RW5kKCk7XHJcbiAgICAgICAgcmV0dXJuIGZvdW5kSXRlbXMubGVuZ3RoID4gMDtcclxuICAgIH1cclxuXHJcbiAgICAvKiogU2VyaWFsaXplcyBhbiBgSXRlbVN0YWNrYCBpbnRvIGEgc3RyaW5nIHJlcHJlc2VudGF0aW9uLlxyXG4gICAgICogQHBhcmFtIGl0ZW1TdGFjayAtIFRoZSBgSXRlbVN0YWNrYCB0byBzZXJpYWxpemUuXHJcbiAgICAgKiBAcmV0dXJucyBBIHN0cmluZyByZXByZXNlbnRhdGlvbiBvZiB0aGUgYEl0ZW1TdGFja2AuXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgc2VyaWFsaXplQmFzaWNJdGVtU3RhY2soaXRlbVN0YWNrOiBJdGVtU3RhY2sgfCB1bmRlZmluZWQpOiBzdHJpbmcge1xyXG4gICAgICAgIGlmICghaXRlbVN0YWNrKSByZXR1cm4gXCJlbXB0eVwiO1xyXG4gICAgICAgIHJldHVybiBgJHtpdGVtU3RhY2sudHlwZUlkfS8ke2l0ZW1TdGFjay5hbW91bnR9YDtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIENsZWFycyBhbGwgaXRlbXMgZnJvbSBhbiBlbnRpdHkncyBpbnZlbnRvcnkgYW5kIGVxdWlwbWVudCBzbG90cy5cclxuICAgICAqIEBwYXJhbSBlbnRpdHkgLSBUaGUgZW50aXR5IHRvIGNsZWFyIHRoZSBpbnZlbnRvcnkgb2YuXHJcbiAgICAgKiBAcGFyYW0gY2xlYXJFcXVpcG1lbnQgLSBXaGV0aGVyIHRvIGNsZWFyIHRoZSBlcXVpcG1lbnQgc2xvdHMgYXMgd2VsbC4gRGVmYXVsdHMgdG8gYHRydWVgLlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGNsZWFySW52ZW50b3J5KGVudGl0eTogRW50aXR5LCBjbGVhckVxdWlwbWVudCA9IHRydWUpIHtcclxuICAgICAgICAvLyBEb2Vzbid0IHVzZSBjbGVhckludmVudG9yeVNsb3Qgb3IgY2xlYXJFcXVpcG1lbnRTbG90IGJlY2F1c2UgaXQncyBmYXN0ZXIgdG8gbG9vcCB0aHJvdWdoIGFsbCBzbG90c1xyXG5cclxuICAgICAgICAvLyBDbGVhciBpbnZlbnRvcnkgYnkgbG9vcGluZyB0aHJvdWdoIGFsbCBzbG90c1xyXG4gICAgICAgIERlYnVnVGltZXIuY291bnRTdGFydChcIkludmVudG9yeVV0aWwuY2xlYXJJbnZlbnRvcnlcIik7XHJcbiAgICAgICAgY29uc3QgaW52ZW50b3J5ID0gX0ludmVudG9yeVV0aWwuZ2V0Q29udGFpbmVyKGVudGl0eSk7XHJcbiAgICAgICAgaWYgKGludmVudG9yeSkge1xyXG4gICAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGludmVudG9yeS5zaXplOyBpKyspIHtcclxuICAgICAgICAgICAgICAgIGludmVudG9yeS5zZXRJdGVtKGksIHVuZGVmaW5lZCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIENsZWFyIGVxdWlwbWVudFxyXG4gICAgICAgIGNvbnN0IGVxdWlwbWVudCA9IF9JbnZlbnRvcnlVdGlsLmdldEVxdWlwbWVudChlbnRpdHkpO1xyXG4gICAgICAgIGlmIChlcXVpcG1lbnQgJiYgY2xlYXJFcXVpcG1lbnQpIHtcclxuICAgICAgICAgICAgZXF1aXBtZW50LnNldEVxdWlwbWVudChFcXVpcG1lbnRTbG90LkhlYWQsIHVuZGVmaW5lZCk7XHJcbiAgICAgICAgICAgIGVxdWlwbWVudC5zZXRFcXVpcG1lbnQoRXF1aXBtZW50U2xvdC5DaGVzdCwgdW5kZWZpbmVkKTtcclxuICAgICAgICAgICAgZXF1aXBtZW50LnNldEVxdWlwbWVudChFcXVpcG1lbnRTbG90LkxlZ3MsIHVuZGVmaW5lZCk7XHJcbiAgICAgICAgICAgIGVxdWlwbWVudC5zZXRFcXVpcG1lbnQoRXF1aXBtZW50U2xvdC5GZWV0LCB1bmRlZmluZWQpO1xyXG4gICAgICAgICAgICBlcXVpcG1lbnQuc2V0RXF1aXBtZW50KEVxdWlwbWVudFNsb3QuT2ZmaGFuZCwgdW5kZWZpbmVkKTtcclxuICAgICAgICAgICAgZXF1aXBtZW50LnNldEVxdWlwbWVudChFcXVpcG1lbnRTbG90Lk1haW5oYW5kLCB1bmRlZmluZWQpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBEZWJ1Z1RpbWVyLmNvdW50RW5kKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBDbGVhcnMgc3BlY2lmaWMgc2xvdHMgaW4gYW4gZW50aXR5J3MgaW52ZW50b3J5IG9yIGVxdWlwbWVudC5cclxuICAgICAqIEBwYXJhbSBlbnRpdHkgLSBUaGUgZW50aXR5IHRvIGNsZWFyIHRoZSBzbG90cyBvZi5cclxuICAgICAqIEBwYXJhbSBlbnRpdHlTbG90cyAtIFRoZSBzbG90cyB0byBjbGVhci5cclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBjbGVhclNsb3RzKGVudGl0eTogRW50aXR5LCBlbnRpdHlTbG90czogRW50aXR5U2xvdFtdKSB7XHJcbiAgICAgICAgRGVidWdUaW1lci5jb3VudFN0YXJ0KFwiSW52ZW50b3J5VXRpbC5jbGVhclNsb3RzXCIpO1xyXG4gICAgICAgIGZvciAoY29uc3QgZW50aXR5U2xvdCBvZiBlbnRpdHlTbG90cykge1xyXG4gICAgICAgICAgICB0aGlzLmNsZWFyU2xvdChlbnRpdHksIGVudGl0eVNsb3QpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBEZWJ1Z1RpbWVyLmNvdW50RW5kKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBDbGVhcnMgYSBzcGVjaWZpYyBzbG90IGluIGFuIGVudGl0eSdzIGludmVudG9yeSBvciBlcXVpcG1lbnQuXHJcbiAgICAgKiBAcGFyYW0gZW50aXR5IC0gVGhlIGVudGl0eSB0byBjbGVhciB0aGUgc2xvdCBvZi5cclxuICAgICAqIEBwYXJhbSBlbnRpdHlTbG90IC0gVGhlIHNsb3QgdG8gY2xlYXIuXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgY2xlYXJTbG90KGVudGl0eTogRW50aXR5LCBlbnRpdHlTbG90OiBFbnRpdHlTbG90KSB7XHJcbiAgICAgICAgRGVidWdUaW1lci5jb3VudFN0YXJ0KFwiSW52ZW50b3J5VXRpbC5jbGVhclNsb3RcIik7XHJcbiAgICAgICAgaWYgKGVudGl0eVNsb3QuaXNFcXVpcG1lbnQpIHRoaXMuY2xlYXJFcXVpcG1lbnRTbG90KGVudGl0eSwgZW50aXR5U2xvdC5zbG90IGFzIEVxdWlwbWVudFNsb3QpO1xyXG4gICAgICAgIGVsc2UgdGhpcy5jbGVhckludmVudG9yeVNsb3QoZW50aXR5LCBlbnRpdHlTbG90LnNsb3QgYXMgbnVtYmVyKTtcclxuICAgICAgICBEZWJ1Z1RpbWVyLmNvdW50RW5kKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBDbGVhcnMgYSBzcGVjaWZpYyBpbnZlbnRvcnkgc2xvdCBvZiBhbiBlbnRpdHkuXHJcbiAgICAgKiBAcGFyYW0gZW50aXR5IC0gVGhlIGVudGl0eSB0byBjbGVhciB0aGUgaW52ZW50b3J5IHNsb3Qgb2YuXHJcbiAgICAgKiBAcGFyYW0gc2xvdCAtIFRoZSBpbnZlbnRvcnkgc2xvdCBpbmRleCB0byBjbGVhci5cclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBjbGVhckludmVudG9yeVNsb3QoZW50aXR5OiBFbnRpdHksIHNsb3Q6IG51bWJlcikge1xyXG4gICAgICAgIERlYnVnVGltZXIuY291bnRTdGFydChcIkludmVudG9yeVV0aWwuY2xlYXJJbnZlbnRvcnlTbG90XCIpO1xyXG4gICAgICAgIGNvbnN0IGludmVudG9yeSA9IHRoaXMuZ2V0Q29udGFpbmVyKGVudGl0eSk7XHJcbiAgICAgICAgaWYgKGludmVudG9yeSkgaW52ZW50b3J5LnNldEl0ZW0oc2xvdCwgdW5kZWZpbmVkKTtcclxuICAgICAgICBEZWJ1Z1RpbWVyLmNvdW50RW5kKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBDbGVhcnMgYSBzcGVjaWZpYyBlcXVpcG1lbnQgc2xvdCBvZiBhbiBlbnRpdHkuXHJcbiAgICAgKiBAcGFyYW0gZW50aXR5IC0gVGhlIGVudGl0eSB0byBjbGVhciB0aGUgZXF1aXBtZW50IHNsb3Qgb2YuXHJcbiAgICAgKiBAcGFyYW0gc2xvdCAtIFRoZSBlcXVpcG1lbnQgc2xvdCB0byBjbGVhci5cclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBjbGVhckVxdWlwbWVudFNsb3QoZW50aXR5OiBFbnRpdHksIHNsb3Q6IEVxdWlwbWVudFNsb3QpIHtcclxuICAgICAgICBEZWJ1Z1RpbWVyLmNvdW50U3RhcnQoXCJJbnZlbnRvcnlVdGlsLmNsZWFyRXF1aXBtZW50U2xvdFwiKTtcclxuICAgICAgICBjb25zdCBlcXVpcG1lbnQgPSB0aGlzLmdldEVxdWlwbWVudChlbnRpdHkpO1xyXG4gICAgICAgIGlmIChlcXVpcG1lbnQpIGVxdWlwbWVudC5zZXRFcXVpcG1lbnQoc2xvdCwgdW5kZWZpbmVkKTtcclxuICAgICAgICBEZWJ1Z1RpbWVyLmNvdW50RW5kKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBGaW5kcyBhbmQgcmVtb3ZlcyBhIHNwZWNpZmljIGl0ZW0gZnJvbSBhbiBlbnRpdHkncyBpbnZlbnRvcnkuXHJcbiAgICAgKiBAcGFyYW0gZW50aXR5IC0gVGhlIGVudGl0eSB0byBjbGVhciB0aGUgaXRlbSBmcm9tLlxyXG4gICAgICogQHBhcmFtIGl0ZW1Ub1JlbW92ZSAtIFRoZSBpdGVtIHN0YWNrIHRvIGNsZWFyLlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHJlbW92ZUl0ZW0oZW50aXR5OiBFbnRpdHksIGl0ZW1Ub1JlbW92ZTogSXRlbVN0YWNrKSB7XHJcbiAgICAgICAgRGVidWdUaW1lci5jb3VudFN0YXJ0KFwiSW52ZW50b3J5VXRpbC5yZW1vdmVJdGVtXCIpO1xyXG4gICAgICAgIGNvbnN0IGZvdW5kSXRlbXMgPSB0aGlzLmZpbmRJdGVtKGVudGl0eSwgaXRlbVRvUmVtb3ZlLnR5cGVJZCk7XHJcbiAgICAgICAgbGV0IGFtb3VudFRvUmVtb3ZlID0gaXRlbVRvUmVtb3ZlLmFtb3VudDtcclxuICAgICAgICAvLyBMb29wIHRocm91Z2ggYW5kIHJlbW92ZSBhbW91bnRUb1JlbW92ZSBpdGVtc1xyXG4gICAgICAgIGZvciAoY29uc3QgZm91bmRJdGVtIG9mIGZvdW5kSXRlbXMpIHtcclxuICAgICAgICAgICAgY29uc3QgZm91bmRJdGVtU3RhY2sgPSBmb3VuZEl0ZW0uaXRlbVN0YWNrO1xyXG4gICAgICAgICAgICBpZiAoYW1vdW50VG9SZW1vdmUgPD0gMCkgYnJlYWs7XHJcblxyXG4gICAgICAgICAgICBpZiAoYW1vdW50VG9SZW1vdmUgPj0gZm91bmRJdGVtU3RhY2suYW1vdW50KSB7XHJcbiAgICAgICAgICAgICAgICBhbW91bnRUb1JlbW92ZSAtPSBmb3VuZEl0ZW1TdGFjay5hbW91bnQ7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmNsZWFyU2xvdChlbnRpdHksIGZvdW5kSXRlbS5lbnRpdHlTbG90KTtcclxuICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgIGZvdW5kSXRlbVN0YWNrLmFtb3VudCAtPSBhbW91bnRUb1JlbW92ZTtcclxuICAgICAgICAgICAgICAgIGFtb3VudFRvUmVtb3ZlID0gMDtcclxuICAgICAgICAgICAgICAgIHRoaXMuc2V0SXRlbShlbnRpdHksIGZvdW5kSXRlbVN0YWNrLCBmb3VuZEl0ZW0uZW50aXR5U2xvdCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgRGVidWdUaW1lci5jb3VudEVuZCgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQHBhcmFtIGVudGl0eSBUaGUgZW50aXR5IHRvIHNldCB0aGUgaXRlbSBpblxyXG4gICAgICogQHBhcmFtIGl0ZW1TdGFjayBUaGUgaXRlbSBzdGFjayB0byBzZXRcclxuICAgICAqIEBwYXJhbSBlbnRpdHlTbG90IFRoZSBzbG90IHRvIHNldCB0aGUgaXRlbSBpblxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHNldEl0ZW0oZW50aXR5OiBFbnRpdHksIGl0ZW1TdGFjazogSXRlbVN0YWNrLCBlbnRpdHlTbG90OiBFbnRpdHlTbG90KSB7XHJcbiAgICAgICAgRGVidWdUaW1lci5jb3VudFN0YXJ0KFwiSW52ZW50b3J5VXRpbC5zZXRJdGVtXCIpO1xyXG4gICAgICAgIGlmIChlbnRpdHlTbG90LmlzRXF1aXBtZW50KSB0aGlzLnNldEVxdWlwbWVudEl0ZW0oZW50aXR5LCBlbnRpdHlTbG90LnNsb3QgYXMgRXF1aXBtZW50U2xvdCwgaXRlbVN0YWNrKTtcclxuICAgICAgICBlbHNlIHRoaXMuc2V0SW52ZW50b3J5SXRlbShlbnRpdHksIGl0ZW1TdGFjaywgZW50aXR5U2xvdC5zbG90IGFzIG51bWJlcik7XHJcbiAgICAgICAgRGVidWdUaW1lci5jb3VudEVuZCgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogU2V0cyBhbiBpdGVtIGluIHRoZSBzcGVjaWZpZWQgaW52ZW50b3J5IHNsb3Qgb2YgYW4gZW50aXR5LlxyXG4gICAgICogQHBhcmFtIGVudGl0eSAtIFRoZSBlbnRpdHkgd2hvc2UgaW52ZW50b3J5IHdpbGwgYmUgbW9kaWZpZWQuXHJcbiAgICAgKiBAcGFyYW0gaXRlbVN0YWNrIC0gVGhlIGl0ZW0gc3RhY2sgdG8gc2V0IGluIHRoZSBpbnZlbnRvcnkgc2xvdC5cclxuICAgICAqIEBwYXJhbSBzbG90IC0gVGhlIGludmVudG9yeSBzbG90IGluZGV4IHdoZXJlIHRoZSBpdGVtIHdpbGwgYmUgcGxhY2VkLlxyXG4gICAgICogQHBhcmFtIGxvY2tNb2RlIC0gT3B0aW9uYWwuIFRoZSBsb2NrIG1vZGUgdG8gYXBwbHkgdG8gdGhlIGl0ZW0gc3RhY2suXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgc2V0SW52ZW50b3J5SXRlbShlbnRpdHk6IEVudGl0eSwgaXRlbVN0YWNrOiBJdGVtU3RhY2ssIHNsb3Q6IG51bWJlciwgbG9ja01vZGU/OiBJdGVtTG9ja01vZGUpIHtcclxuICAgICAgICBEZWJ1Z1RpbWVyLmNvdW50U3RhcnQoXCJJbnZlbnRvcnlVdGlsLnNldEludmVudG9yeUl0ZW1cIik7XHJcbiAgICAgICAgY29uc3QgaW52ZW50b3J5ID0gdGhpcy5nZXRDb250YWluZXIoZW50aXR5KTtcclxuICAgICAgICBpZiAoaW52ZW50b3J5KSB7XHJcbiAgICAgICAgICAgIGlmIChsb2NrTW9kZSkgaXRlbVN0YWNrLmxvY2tNb2RlID0gbG9ja01vZGU7XHJcbiAgICAgICAgICAgIGludmVudG9yeS5zZXRJdGVtKHNsb3QsIGl0ZW1TdGFjayk7XHJcbiAgICAgICAgICAgIGlmIChlbnRpdHkgaW5zdGFuY2VvZiBQbGF5ZXIpIHRoaXMub25QbGF5ZXJHaXZlbkl0ZW0oZW50aXR5LCBpdGVtU3RhY2spO1xyXG4gICAgICAgIH1cclxuICAgICAgICBEZWJ1Z1RpbWVyLmNvdW50RW5kKCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBzdGF0aWMgb25QbGF5ZXJHaXZlbkl0ZW0ocGxheWVyOiBQbGF5ZXIsIGl0ZW1TdGFjazogSXRlbVN0YWNrKSB7XHJcbiAgICAgICAgQ3VzdG9tRXZlbnRzLmVtaXQoXCJQbGF5ZXJHaXZlbkl0ZW1cIiwgcGxheWVyLCBpdGVtU3RhY2spO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogU2V0cyB0aGUgc2VsZWN0ZWQgc2xvdCBmb3IgYSBwbGF5ZXIgd2l0aCB0aGUgc3BlY2lmaWVkIGl0ZW0gc3RhY2sgYW5kIG9wdGlvbmFsIGxvY2sgbW9kZS5cclxuICAgICAqIEBwYXJhbSBwbGF5ZXIgLSBUaGUgcGxheWVyIHdob3NlIHNlbGVjdGVkIHNsb3QgaXMgdG8gYmUgc2V0LlxyXG4gICAgICogQHBhcmFtIGl0ZW1TdGFjayAtIChPcHRpb25hbCkgVGhlIGl0ZW0gc3RhY2sgdG8gc2V0IGluIHRoZSBzZWxlY3RlZCBzbG90LlxyXG4gICAgICogQHBhcmFtIGxvY2tNb2RlIC0gKE9wdGlvbmFsKSBUaGUgbG9jayBtb2RlIHRvIGFwcGx5IHRvIHRoZSBpdGVtIHN0YWNrLlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHNldFNlbGVjdGVkU2xvdChwbGF5ZXI6IFBsYXllciwgaXRlbVN0YWNrPzogSXRlbVN0YWNrLCBsb2NrTW9kZT86IEl0ZW1Mb2NrTW9kZSkge1xyXG4gICAgICAgIERlYnVnVGltZXIuY291bnRTdGFydChcIkludmVudG9yeVV0aWwuc2V0U2VsZWN0ZWRTbG90XCIpO1xyXG4gICAgICAgIGNvbnN0IGludmVudG9yeSA9IHRoaXMuZ2V0Q29udGFpbmVyKHBsYXllcik7XHJcbiAgICAgICAgaWYgKGludmVudG9yeSkge1xyXG4gICAgICAgICAgICBpZiAoaXRlbVN0YWNrICYmIGxvY2tNb2RlKSBpdGVtU3RhY2subG9ja01vZGUgPSBsb2NrTW9kZTtcclxuICAgICAgICAgICAgaW52ZW50b3J5LnNldEl0ZW0ocGxheWVyLnNlbGVjdGVkU2xvdEluZGV4LCBpdGVtU3RhY2spO1xyXG4gICAgICAgICAgICBpZiAoaXRlbVN0YWNrKSB0aGlzLm9uUGxheWVyR2l2ZW5JdGVtKHBsYXllciwgaXRlbVN0YWNrKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgRGVidWdUaW1lci5jb3VudEVuZCgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogUmV0cmlldmVzIHRoZSBpdGVtIGN1cnJlbnRseSBoZWxkIGluIHRoZSBvZmZoYW5kIHNsb3Qgb2YgdGhlIHNwZWNpZmllZCBlbnRpdHkuXHJcbiAgICAgKiBAcGFyYW0gZW50aXR5IC0gVGhlIGVudGl0eSBmcm9tIHdoaWNoIHRvIHJldHJpZXZlIHRoZSBvZmZoYW5kIGl0ZW0uXHJcbiAgICAgKiBAcmV0dXJucyBUaGUgaXRlbSBpbiB0aGUgb2ZmaGFuZCBzbG90LCBvciBgdW5kZWZpbmVkYCBpZiBubyBpdGVtIGlzIHByZXNlbnQgb3IgdGhlIGVxdWlwbWVudCBkYXRhIGlzIHVuYXZhaWxhYmxlLlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGdldE9mZmhhbmRJdGVtKGVudGl0eTogRW50aXR5KSB7XHJcbiAgICAgICAgRGVidWdUaW1lci5jb3VudFN0YXJ0KFwiSW52ZW50b3J5VXRpbC5nZXRPZmZoYW5kSXRlbVwiKTtcclxuICAgICAgICBjb25zdCBlcXVpcG1lbnQgPSB0aGlzLmdldEVxdWlwbWVudChlbnRpdHkpO1xyXG4gICAgICAgIGNvbnN0IGl0ZW0gPSBlcXVpcG1lbnQuZ2V0RXF1aXBtZW50KEVxdWlwbWVudFNsb3QuT2ZmaGFuZCk7XHJcbiAgICAgICAgRGVidWdUaW1lci5jb3VudEVuZCgpO1xyXG4gICAgICAgIHJldHVybiBpdGVtO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogU2V0cyBhbiBpdGVtIGluIHRoZSBzcGVjaWZpZWQgZXF1aXBtZW50IHNsb3Qgb2YgYW4gZW50aXR5LlxyXG4gICAgICogICBAcGFyYW0gZW50aXR5IFRoZSBlbnRpdHkgdG8gc2V0IHRoZSBpdGVtIGluXHJcbiAgICAgKiAgIEBwYXJhbSBpdGVtU3RhY2sgVGhlIGl0ZW0gc3RhY2sgdG8gc2V0XHJcbiAgICAgKiAgIEBwYXJhbSBzbG90IFRoZSBzbG90IHRvIHNldCB0aGUgaXRlbSBpblxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHNldEVxdWlwbWVudEl0ZW0oZW50aXR5OiBFbnRpdHksIHNsb3Q6IEVxdWlwbWVudFNsb3QsIGl0ZW1TdGFjaz86IEl0ZW1TdGFjaykge1xyXG4gICAgICAgIERlYnVnVGltZXIuY291bnRTdGFydChcIkludmVudG9yeVV0aWwuc2V0RXF1aXBtZW50SXRlbVwiKTtcclxuICAgICAgICBjb25zdCBlcXVpcG1lbnQgPSB0aGlzLmdldEVxdWlwbWVudChlbnRpdHkpO1xyXG4gICAgICAgIGlmICghZXF1aXBtZW50KSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUud2FybihgRW50aXR5ICR7ZW50aXR5LnR5cGVJZH0gZG9lcyBub3QgaGF2ZSBlcXVpcG1lbnRgKTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICBlcXVpcG1lbnQuc2V0RXF1aXBtZW50KHNsb3QsIGl0ZW1TdGFjayk7XHJcbiAgICAgICAgICAgIGlmIChlbnRpdHkgaW5zdGFuY2VvZiBQbGF5ZXIgJiYgaXRlbVN0YWNrKSB0aGlzLm9uUGxheWVyR2l2ZW5JdGVtKGVudGl0eSwgaXRlbVN0YWNrKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgRGVidWdUaW1lci5jb3VudEVuZCgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogR2l2ZXMgYW4gaXRlbSBzdGFjayB0byBhbiBlbnRpdHkncyBpbnZlbnRvcnkuXHJcbiAgICAgKiBAcGFyYW0gdGFyZ2V0IFRoZSBlbnRpdHkgb3IgYmxvY2sgdG8gZ2l2ZSB0aGUgaXRlbSB0b1xyXG4gICAgICogQHBhcmFtIGl0ZW1TdGFjayBUaGUgaXRlbSBzdGFjayB0byBnaXZlXHJcbiAgICAgKiBAcGFyYW0gbG9ja01vZGUgVGhlIGxvY2sgbW9kZSB0byBhcHBseSB0byB0aGUgaXRlbSBzdGFja1xyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGdpdmVJdGVtKHRhcmdldDogRW50aXR5IHwgQmxvY2ssIGl0ZW1TdGFjazogSXRlbVN0YWNrLCBmaWxsRXhpc3RpbmdTdGFja3M6IGJvb2xlYW4gPSB0cnVlLCBsb2NrTW9kZT86IEl0ZW1Mb2NrTW9kZSkge1xyXG4gICAgICAgIERlYnVnVGltZXIuY291bnRTdGFydChcIkludmVudG9yeVV0aWwuZ2l2ZUl0ZW1cIik7XHJcbiAgICAgICAgY29uc3QgaW52ZW50b3J5ID0gdGhpcy5nZXRDb250YWluZXIodGFyZ2V0KTtcclxuICAgICAgICBpZiAoaW52ZW50b3J5KSB7XHJcbiAgICAgICAgICAgIGlmIChsb2NrTW9kZSkgaXRlbVN0YWNrLmxvY2tNb2RlID0gbG9ja01vZGU7XHJcblxyXG4gICAgICAgICAgICBsZXQgcmVtYWluaW5nID0gaXRlbVN0YWNrLmFtb3VudDtcclxuXHJcbiAgICAgICAgICAgIGlmIChmaWxsRXhpc3RpbmdTdGFja3MpIHtcclxuICAgICAgICAgICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgaW52ZW50b3J5LnNpemUgJiYgcmVtYWluaW5nID4gMDsgaSsrKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZXhpc3RpbmcgPSBpbnZlbnRvcnkuZ2V0SXRlbShpKTtcclxuICAgICAgICAgICAgICAgICAgICBpZiAoZXhpc3Rpbmc/LnR5cGVJZCA9PT0gaXRlbVN0YWNrLnR5cGVJZCAmJiBleGlzdGluZy5hbW91bnQgPCBpdGVtU3RhY2subWF4QW1vdW50KSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHRvQWRkID0gTWF0aC5taW4oaXRlbVN0YWNrLm1heEFtb3VudCAtIGV4aXN0aW5nLmFtb3VudCwgcmVtYWluaW5nKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgZXhpc3RpbmcuYW1vdW50ICs9IHRvQWRkO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBpbnZlbnRvcnkuc2V0SXRlbShpLCBleGlzdGluZyk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlbWFpbmluZyAtPSB0b0FkZDtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIGlmIChyZW1haW5pbmcgPiAwKSB7XHJcbiAgICAgICAgICAgICAgICBpdGVtU3RhY2suYW1vdW50ID0gcmVtYWluaW5nO1xyXG4gICAgICAgICAgICAgICAgaW52ZW50b3J5LmFkZEl0ZW0oaXRlbVN0YWNrKTtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgaWYgKHRhcmdldCBpbnN0YW5jZW9mIFBsYXllcikgdGhpcy5vblBsYXllckdpdmVuSXRlbSh0YXJnZXQsIGl0ZW1TdGFjayk7XHJcbiAgICAgICAgICAgIERlYnVnVGltZXIuY291bnRFbmQoKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBHaXZlcyBhbiBhcnJheSBvZiBpdGVtIHN0YWNrcyB0byBhbiBlbnRpdHkncyBpbnZlbnRvcnkuXHJcbiAgICAgKiAgIEBwYXJhbSBlbnRpdHkgVGhlIGVudGl0eSB0byBnaXZlIHRoZSBpdGVtcyB0b1xyXG4gICAgICogICBAcGFyYW0gaXRlbVN0YWNrcyBUaGUgaXRlbSBzdGFja3MgdG8gZ2l2ZVxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGdpdmVJdGVtcyhlbnRpdHk6IEVudGl0eSwgaXRlbVN0YWNrczogSXRlbVN0YWNrW10sIGZpbGxFeGlzdGluZ1N0YWNrczogYm9vbGVhbiA9IHRydWUsIGxvY2tNb2RlPzogSXRlbUxvY2tNb2RlKSB7XHJcbiAgICAgICAgRGVidWdUaW1lci5jb3VudFN0YXJ0KFwiSW52ZW50b3J5VXRpbC5naXZlSXRlbXNcIik7XHJcbiAgICAgICAgZm9yIChjb25zdCBpdGVtU3RhY2sgb2YgaXRlbVN0YWNrcykge1xyXG4gICAgICAgICAgICB0aGlzLmdpdmVJdGVtKGVudGl0eSwgaXRlbVN0YWNrLCBmaWxsRXhpc3RpbmdTdGFja3MsIGxvY2tNb2RlKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgRGVidWdUaW1lci5jb3VudEVuZCgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogVHJpZXMgdG8gdHJhbnNmZXIgYW4gaXRlbSBmcm9tIGEgc3BlY2lmaWVkIHNsb3QgaW4gYSBjb250YWluZXIgdG8gdGhlIGZpcnN0IGVtcHR5IHNsb3QgaW4gYSBjb250YWluZXIuXHJcbiAgICAgKiBAcGFyYW0gdGFyZ2V0IFRoZSBlbnRpdHkgb3IgYmxvY2sgdG8gZ2l2ZSB0aGUgaXRlbSB0b1xyXG4gICAgICogQHBhcmFtIGZyb21TbG90IFRoZSBzbG90IG9mIHRoZSBmcm9tQ29udGFpbmVyIHRoZSBpdGVtIGlzIGluXHJcbiAgICAgKiBAcGFyYW0gZnJvbUNvbnRhaW5lciBUaGUgY29udGFpbmVyIHRoZSBpdGVtIGlzIGNvbWluZyBmcm9tXHJcbiAgICAgKiBAcmV0dXJuIFRoZSBgSXRlbVN0YWNrYCB0aGF0IGNvdWxkIG5vdCBiZSB0cmFuc2ZlcnJlZCwgb3IgYHVuZGVmaW5lZGAgaWYgdGhlIGl0ZW0gd2FzIG1vdmVkIHN1Y2Nlc3NmdWxseVxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHRyYW5zZmVySXRlbUZyb21Db250YWluZXIodGFyZ2V0OiBFbnRpdHkgfCBCbG9jaywgZnJvbVNsb3Q6IG51bWJlciwgZnJvbUNvbnRhaW5lcjogQ29udGFpbmVyKTogSXRlbVN0YWNrIHwgdW5kZWZpbmVkIHtcclxuICAgICAgICBEZWJ1Z1RpbWVyLmNvdW50U3RhcnQoXCJJbnZlbnRvcnlVdGlsLnRyYW5zZmVySXRlbVRvSW52ZW50b3J5XCIpO1xyXG5cclxuICAgICAgICBjb25zdCBpbnZlbnRvcnkgPSB0aGlzLmdldENvbnRhaW5lcih0YXJnZXQpO1xyXG4gICAgICAgIGNvbnN0IHVudHJhbnNmZXJyZWQgPSBmcm9tQ29udGFpbmVyLnRyYW5zZmVySXRlbShmcm9tU2xvdCwgaW52ZW50b3J5KTtcclxuICAgICAgICBEZWJ1Z1RpbWVyLmNvdW50RW5kKCk7XHJcbiAgICAgICAgcmV0dXJuIHVudHJhbnNmZXJyZWQ7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBUcmllcyB0byBtb3ZlIGFuIGl0ZW0gZnJvbSBhbiBlbnRpdHkncyBpbnZlbnRvcnkgdG8gYSBzcGVjaWZpZWQgc2xvdCBpbiBhIGNvbnRhaW5lci5cclxuICAgICAqIEBwYXJhbSBlbnRpdHkgVGhlIGVudGl0eSB0byBtb3ZlIHRoZSBpdGVtIGZyb21cclxuICAgICAqIEBwYXJhbSBpdGVtU3RhY2sgVGhlIGl0ZW0gdG8gbW92ZVxyXG4gICAgICogQHBhcmFtIHRvU2xvdCBUaGUgc2xvdCBpbiB0aGUgdG9Db250YWluZXIgdG8gbW92ZSB0aGUgaXRlbSB0b1xyXG4gICAgICogQHBhcmFtIHRvQ29udGFpbmVyIFRoZSBjb250YWluZXIgdG8gbW92ZSB0aGUgaXRlbSB0b1xyXG4gICAgICogQHJldHVybnMgdHJ1ZSBpZiB0aGUgaXRlbSB3YXMgbW92ZWQgc3VjY2Vzc2Z1bGx5LCBmYWxzZSBpZiB0aGUgaXRlbSB3YXMgbm90IGZvdW5kIGluIHRoZSBlbnRpdHkncyBpbnZlbnRvcnlcclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyB0cnlNb3ZlSXRlbVRvQ29udGFpbmVyKGVudGl0eTogRW50aXR5LCBpdGVtU3RhY2s6IEl0ZW1TdGFjaywgdG9TbG90OiBudW1iZXIsIHRvQ29udGFpbmVyOiBDb250YWluZXIpOiBib29sZWFuIHtcclxuICAgICAgICBEZWJ1Z1RpbWVyLmNvdW50U3RhcnQoXCJJbnZlbnRvcnlVdGlsLnRyeU1vdmVJdGVtVG9Db250YWluZXJcIik7XHJcbiAgICAgICAgY29uc3QgaW52ZW50b3J5ID0gdGhpcy5nZXRDb250YWluZXIoZW50aXR5KTtcclxuICAgICAgICBjb25zdCBmcm9tU2xvdCA9IGludmVudG9yeS5maW5kKGl0ZW1TdGFjayk7XHJcbiAgICAgICAgaWYgKGZyb21TbG90ID09PSB1bmRlZmluZWQpIHtcclxuICAgICAgICAgICAgRGVidWdUaW1lci5jb3VudEVuZCgpO1xyXG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBjb25zdCBleGlzdGluZ0l0ZW0gPSBpbnZlbnRvcnkuZ2V0SXRlbShmcm9tU2xvdCk7XHJcbiAgICAgICAgaWYgKGV4aXN0aW5nSXRlbSAmJiBleGlzdGluZ0l0ZW0uYW1vdW50ID4gaXRlbVN0YWNrLmFtb3VudCkge1xyXG4gICAgICAgICAgICBleGlzdGluZ0l0ZW0uYW1vdW50IC09IGl0ZW1TdGFjay5hbW91bnQ7XHJcbiAgICAgICAgICAgIGludmVudG9yeS5zZXRJdGVtKGZyb21TbG90LCBleGlzdGluZ0l0ZW0pO1xyXG4gICAgICAgICAgICB0b0NvbnRhaW5lci5zZXRJdGVtKHRvU2xvdCwgaXRlbVN0YWNrKTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICBpbnZlbnRvcnkubW92ZUl0ZW0oZnJvbVNsb3QsIHRvU2xvdCwgdG9Db250YWluZXIpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBEZWJ1Z1RpbWVyLmNvdW50RW5kKCk7XHJcbiAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBSZXRyaWV2ZXMgdGhlIGN1cnJlbnRseSBzZWxlY3RlZCBpdGVtIGZyb20gdGhlIHBsYXllcidzIGludmVudG9yeS5cclxuICAgICAqIEBwYXJhbSBwbGF5ZXIgLSBUaGUgcGxheWVyIHdob3NlIHNlbGVjdGVkIGl0ZW0gaXMgdG8gYmUgcmV0cmlldmVkLlxyXG4gICAgICogQHJldHVybnMgVGhlIGBJdGVtU3RhY2tgIHJlcHJlc2VudGluZyB0aGUgc2VsZWN0ZWQgaXRlbSwgb3IgYHVuZGVmaW5lZGAgaWYgbm8gaXRlbSBpcyBzZWxlY3RlZCBvciB0aGUgaW52ZW50b3J5IGlzIHVuYXZhaWxhYmxlLlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHNlbGVjdGVkSXRlbShwbGF5ZXI6IFBsYXllcik6IEl0ZW1TdGFjayB8IHVuZGVmaW5lZCB7XHJcbiAgICAgICAgRGVidWdUaW1lci5jb3VudFN0YXJ0KFwiSW52ZW50b3J5VXRpbC5zZWxlY3RlZEl0ZW1cIik7XHJcbiAgICAgICAgY29uc3QgaW52ZW50b3J5ID0gdGhpcy5nZXRDb250YWluZXIocGxheWVyKTtcclxuICAgICAgICBjb25zdCBzZWxlY3RlZEl0ZW0gPSBpbnZlbnRvcnkuZ2V0SXRlbShwbGF5ZXIuc2VsZWN0ZWRTbG90SW5kZXgpO1xyXG4gICAgICAgIERlYnVnVGltZXIuY291bnRFbmQoKTtcclxuXHJcbiAgICAgICAgcmV0dXJuIHNlbGVjdGVkSXRlbTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIENvbnN1bWVzIHRoZSBjdXJyZW50bHkgc2VsZWN0ZWQgaXRlbSBmcm9tIHRoZSBwbGF5ZXIncyBpbnZlbnRvcnkuXHJcbiAgICAgKiBJZiB0aGUgc2VsZWN0ZWQgaXRlbSBoYXMgYSBxdWFudGl0eSBvZiAxLCBpdCByZW1vdmVzIHRoZSBpdGVtIGZyb20gdGhlIHNlbGVjdGVkIHNsb3QuXHJcbiAgICAgKiBPdGhlcndpc2UsIGl0IGRlY3JlbWVudHMgdGhlIGl0ZW0ncyBxdWFudGl0eSBieSAxIGFuZCB1cGRhdGVzIHRoZSBzZWxlY3RlZCBzbG90LlxyXG4gICAgICogQHBhcmFtIHBsYXllciAtIFRoZSBwbGF5ZXIgd2hvc2Ugc2VsZWN0ZWQgaXRlbSBpcyB0byBiZSBjb25zdW1lZC5cclxuICAgICAqIEByZXR1cm5zIFRoZSBjb25zdW1lZCBgSXRlbVN0YWNrYCBpZiBhbiBpdGVtIHdhcyBzZWxlY3RlZCwgb3IgYHVuZGVmaW5lZGAgaWYgbm8gaXRlbSB3YXMgc2VsZWN0ZWQuXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgY29uc3VtZVNlbGVjdGVkSXRlbShwbGF5ZXI6IFBsYXllcik6IEl0ZW1TdGFjayB8IHVuZGVmaW5lZCB7XHJcbiAgICAgICAgRGVidWdUaW1lci5jb3VudFN0YXJ0KFwiSW52ZW50b3J5VXRpbC5jb25zdW1lU2VsZWN0ZWRJdGVtXCIpO1xyXG4gICAgICAgIGNvbnN0IGl0ZW0gPSB0aGlzLnNlbGVjdGVkSXRlbShwbGF5ZXIpO1xyXG4gICAgICAgIGlmICghaXRlbSkgcmV0dXJuIHVuZGVmaW5lZDtcclxuXHJcbiAgICAgICAgaWYgKGl0ZW0uYW1vdW50ID09PSAxKSB0aGlzLnNldFNlbGVjdGVkU2xvdChwbGF5ZXIsIHVuZGVmaW5lZCk7XHJcbiAgICAgICAgZWxzZSB7XHJcbiAgICAgICAgICAgIGl0ZW0uYW1vdW50LS07XHJcbiAgICAgICAgICAgIHRoaXMuc2V0U2VsZWN0ZWRTbG90KHBsYXllciwgaXRlbSk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBEZWJ1Z1RpbWVyLmNvdW50RW5kKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBDYWxjdWxhdGVzIHRoZSBudW1iZXIgb2YgZW1wdHkgc2xvdHMgaW4gdGhlIGludmVudG9yeSBvZiB0aGUgZ2l2ZW4gZW50aXR5LlxyXG4gICAgICogQHBhcmFtIGVudGl0eSAtIFRoZSBlbnRpdHkgd2hvc2UgaW52ZW50b3J5IGlzIGJlaW5nIGNoZWNrZWQuXHJcbiAgICAgKiBAcmV0dXJucyBUaGUgbnVtYmVyIG9mIGVtcHR5IHNsb3RzIGluIHRoZSBlbnRpdHkncyBpbnZlbnRvcnkuIFJldHVybnMgMCBpZiB0aGUgaW52ZW50b3J5IGlzIHVuYXZhaWxhYmxlLlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGVtcHR5U2xvdHNDb3VudChlbnRpdHk6IEVudGl0eSk6IG51bWJlciB7XHJcbiAgICAgICAgRGVidWdUaW1lci5jb3VudFN0YXJ0KFwiSW52ZW50b3J5VXRpbC5lbXB0eVNsb3RzQ291bnRcIik7XHJcbiAgICAgICAgY29uc3QgaW52ZW50b3J5ID0gdGhpcy5nZXRDb250YWluZXIoZW50aXR5KTtcclxuICAgICAgICBEZWJ1Z1RpbWVyLmNvdW50RW5kKCk7XHJcbiAgICAgICAgcmV0dXJuIGludmVudG9yeS5lbXB0eVNsb3RzQ291bnQgPz8gMDtcclxuICAgIH1cclxuXHJcbiAgICAvKiogQ2xlYXJzIHRoZSBob3RiYXIgc2xvdHMgb2YgYSBwbGF5ZXIncyBpbnZlbnRvcnlcclxuICAgICAqIEBwYXJhbSBwbGF5ZXIgVGhlIHBsYXllciB3aG9zZSBob3RiYXIgc2xvdHMgd2lsbCBiZSBjbGVhcmVkXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgY2xlYXJIb3RiYXJTbG90cyhwbGF5ZXI6IFBsYXllcikge1xyXG4gICAgICAgIGNvbnN0IGhvdGJhclNsb3RzOiBFbnRpdHlTbG90W10gPSBbXTtcclxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IDk7IGkrKykgaG90YmFyU2xvdHMucHVzaCh7IGlzRXF1aXBtZW50OiBmYWxzZSwgc2xvdDogaSB9KTtcclxuICAgICAgICB0aGlzLmNsZWFyU2xvdHMocGxheWVyLCBob3RiYXJTbG90cyk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBDbGVhcnMgYSBzcGVjaWZpYyBob3RiYXIgc2xvdCBvZiBhIHBsYXllcidzIGludmVudG9yeVxyXG4gICAgICogQHBhcmFtIHBsYXllciBUaGUgcGxheWVyIHdob3NlIGhvdGJhciBzbG90IHdpbGwgYmUgY2xlYXJlZFxyXG4gICAgICogQHBhcmFtIHNsb3ROdW1iZXIgVGhlIGhvdGJhciBzbG90IG51bWJlciB0byBjbGVhciAoMC04KVxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGNsZWFySG90YmFyU2xvdChwbGF5ZXI6IFBsYXllciwgc2xvdE51bWJlcjogbnVtYmVyKSB7XHJcbiAgICAgICAgdGhpcy5jbGVhclNsb3RzKHBsYXllciwgW3sgaXNFcXVpcG1lbnQ6IGZhbHNlLCBzbG90OiBzbG90TnVtYmVyIH1dKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFRyYW5zZmVycyBpdGVtcyBmcm9tIG9uZSBjb250YWluZXIgc2xvdCB0byBhbm90aGVyIGNvbnRhaW5lci5cclxuICAgICAqIEBwYXJhbSBmcm9tQ29udGFpbmVyIC0gVGhlIGNvbnRhaW5lciB0byB0YWtlIHRoZSBpdGVtIGZyb20uXHJcbiAgICAgKiBAcGFyYW0gZnJvbVNsb3QgLSBUaGUgc2xvdCBpbmRleCBpbiB0aGUgc291cmNlIGNvbnRhaW5lci5cclxuICAgICAqIEBwYXJhbSB0b0NvbnRhaW5lciAtIFRoZSBjb250YWluZXIgdG8gZ2l2ZSB0aGUgaXRlbSB0by5cclxuICAgICAqIEBwYXJhbSBhbW91bnQgLSBUaGUgbnVtYmVyIG9mIGl0ZW1zIHRvIHRyYW5zZmVyLCBvciB1bmRlZmluZWQgdG8gdHJhbnNmZXIgYWxsLlxyXG4gICAgICogQHJldHVybnMgdHJ1ZSBpZiB0aGUgdHJhbnNmZXIgc3VjY2VlZGVkLCBmYWxzZSBvdGhlcndpc2UuXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgdHJhbnNmZXJJdGVtQW1vdW50KGZyb21Db250YWluZXI6IENvbnRhaW5lciwgZnJvbVNsb3Q6IG51bWJlciwgdG9Db250YWluZXI6IENvbnRhaW5lciwgYW1vdW50PzogbnVtYmVyKTogYm9vbGVhbiB7XHJcbiAgICAgICAgY29uc3QgaXRlbSA9IGZyb21Db250YWluZXIuZ2V0SXRlbShmcm9tU2xvdCk7XHJcbiAgICAgICAgaWYgKCFpdGVtKSByZXR1cm4gZmFsc2U7XHJcblxyXG4gICAgICAgIGNvbnN0IGFtb3VudFRvVHJhbnNmZXIgPSBhbW91bnQgPT09IHVuZGVmaW5lZCB8fCBpdGVtLmFtb3VudCA8PSBhbW91bnQgPyBpdGVtLmFtb3VudCA6IGFtb3VudDtcclxuXHJcbiAgICAgICAgY29uc3QgcGFydGlhbCA9IGl0ZW0uY2xvbmUoKTtcclxuICAgICAgICBwYXJ0aWFsLmFtb3VudCA9IGFtb3VudFRvVHJhbnNmZXI7XHJcblxyXG4gICAgICAgIGNvbnN0IG92ZXJmbG93ID0gdG9Db250YWluZXIuYWRkSXRlbShwYXJ0aWFsKTtcclxuICAgICAgICBpZiAob3ZlcmZsb3cpIHJldHVybiBmYWxzZTtcclxuXHJcbiAgICAgICAgY29uc3QgcmVtYWluaW5nID0gaXRlbS5hbW91bnQgLSBhbW91bnRUb1RyYW5zZmVyO1xyXG4gICAgICAgIGlmIChyZW1haW5pbmcgPiAwKSB7XHJcbiAgICAgICAgICAgIGl0ZW0uYW1vdW50ID0gcmVtYWluaW5nO1xyXG4gICAgICAgICAgICBmcm9tQ29udGFpbmVyLnNldEl0ZW0oZnJvbVNsb3QsIGl0ZW0pO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIGZyb21Db250YWluZXIuc2V0SXRlbShmcm9tU2xvdCwgdW5kZWZpbmVkKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBDb252ZXJ0cyB0aGUgaXRlbXMgaW4gYSBjb250YWluZXIgdG8gYW4gYXJyYXkgb2YgaXRlbSBzdGFja3MsIHdpdGggYHVuZGVmaW5lZGAgZm9yIGVtcHR5IHNsb3RzLlxyXG4gICAgICogQHBhcmFtIGNvbnRhaW5lciBUaGUgY29udGFpbmVyIHRvIGNvbnZlcnQgdG8gYW4gYXJyYXkuXHJcbiAgICAgKiBAcmV0dXJucyBBbiBhcnJheSBvZiBpdGVtIHN0YWNrcyByZXByZXNlbnRpbmcgdGhlIGNvbnRlbnRzIG9mIHRoZSBjb250YWluZXIsIHdpdGggYHVuZGVmaW5lZGAgZm9yIGVtcHR5IHNsb3RzLlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHRvQXJyYXkoY29udGFpbmVyOiBDb250YWluZXIpOiAoSXRlbVN0YWNrIHwgdW5kZWZpbmVkKVtdIHtcclxuICAgICAgICBjb25zdCBpdGVtczogKEl0ZW1TdGFjayB8IHVuZGVmaW5lZClbXSA9IFtdO1xyXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgY29udGFpbmVyLnNpemU7IGkrKykge1xyXG4gICAgICAgICAgICBpdGVtcy5wdXNoKGNvbnRhaW5lci5nZXRJdGVtKGkpKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIGl0ZW1zO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogU2VyaWFsaXplcyBhbiBJdGVtU3RhY2sgaW50byBhIHBsYWluIG9iamVjdCB0aGF0IGNhbiBiZSBKU09OIHN0cmluZ2lmaWVkLlxyXG4gICAgICogQ2FwdHVyZXMgYWxsIHJlbGV2YW50IHByb3BlcnRpZXMgaW5jbHVkaW5nIG5hbWUsIGxvcmUsIGxvY2sgbW9kZSwgZXRjLlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHNlcmlhbGl6ZUl0ZW1TdGFjayhpdGVtOiBJdGVtU3RhY2spOiBTZXJpYWxpemVkSXRlbSB7XHJcbiAgICAgICAgY29uc3Qgc2VyaWFsaXplZDogU2VyaWFsaXplZEl0ZW0gPSB7XHJcbiAgICAgICAgICAgIHR5cGVJZDogaXRlbS50eXBlSWQsXHJcbiAgICAgICAgICAgIGFtb3VudDogaXRlbS5hbW91bnQsXHJcbiAgICAgICAgfTtcclxuXHJcbiAgICAgICAgaWYgKGl0ZW0ubmFtZVRhZykgc2VyaWFsaXplZC5uYW1lVGFnID0gaXRlbS5uYW1lVGFnO1xyXG4gICAgICAgIGlmIChpdGVtLmdldExvcmUoKS5sZW5ndGggPiAwKSBzZXJpYWxpemVkLmxvcmUgPSBpdGVtLmdldExvcmUoKTtcclxuICAgICAgICBpZiAoaXRlbS5sb2NrTW9kZSkgc2VyaWFsaXplZC5sb2NrTW9kZSA9IGl0ZW0ubG9ja01vZGU7XHJcbiAgICAgICAgaWYgKGl0ZW0ua2VlcE9uRGVhdGgpIHNlcmlhbGl6ZWQua2VlcE9uRGVhdGggPSBpdGVtLmtlZXBPbkRlYXRoO1xyXG4gICAgICAgIGNvbnN0IGVuY2hhbnRhYmxlQ29tcG9uZW50SWQgPSBcIm1pbmVjcmFmdDplbmNoYW50YWJsZVwiO1xyXG4gICAgICAgIGlmIChpdGVtLmhhc0NvbXBvbmVudChlbmNoYW50YWJsZUNvbXBvbmVudElkKSkge1xyXG4gICAgICAgICAgICBjb25zdCBlbmNoYW50YWJsZSA9IGl0ZW0uZ2V0Q29tcG9uZW50KGVuY2hhbnRhYmxlQ29tcG9uZW50SWQpO1xyXG4gICAgICAgICAgICBlbmNoYW50YWJsZT8uZ2V0RW5jaGFudG1lbnRzKCkuZm9yRWFjaCgoZW5jaGFudG1lbnQpID0+IHtcclxuICAgICAgICAgICAgICAgIGlmICghc2VyaWFsaXplZC5lbmNoYW50bWVudHMpIHNlcmlhbGl6ZWQuZW5jaGFudG1lbnRzID0gW107XHJcbiAgICAgICAgICAgICAgICBzZXJpYWxpemVkLmVuY2hhbnRtZW50cy5wdXNoKHtcclxuICAgICAgICAgICAgICAgICAgICBpZDogZW5jaGFudG1lbnQudHlwZS5pZCxcclxuICAgICAgICAgICAgICAgICAgICBsZXZlbDogZW5jaGFudG1lbnQubGV2ZWwsXHJcbiAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBDYXB0dXJlIGR5bmFtaWMgcHJvcGVydGllcyBpZiBhbnlcclxuICAgICAgICBjb25zdCBkeW5hbWljUHJvcHMgPSBpdGVtLmdldER5bmFtaWNQcm9wZXJ0eUlkcygpO1xyXG4gICAgICAgIGlmIChkeW5hbWljUHJvcHMubGVuZ3RoID4gMCkge1xyXG4gICAgICAgICAgICBzZXJpYWxpemVkLmR5bmFtaWNQcm9wZXJ0aWVzID0ge307XHJcbiAgICAgICAgICAgIGZvciAoY29uc3QgcHJvcElkIG9mIGR5bmFtaWNQcm9wcykge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgdmFsdWUgPSBpdGVtLmdldER5bmFtaWNQcm9wZXJ0eShwcm9wSWQpO1xyXG4gICAgICAgICAgICAgICAgaWYgKHZhbHVlICE9PSB1bmRlZmluZWQpIHtcclxuICAgICAgICAgICAgICAgICAgICBzZXJpYWxpemVkLmR5bmFtaWNQcm9wZXJ0aWVzW3Byb3BJZF0gPSB2YWx1ZTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgcmV0dXJuIHNlcmlhbGl6ZWQ7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBEZXNlcmlhbGl6ZXMgYSBwbGFpbiBvYmplY3QgYmFjayBpbnRvIGFuIEl0ZW1TdGFjay5cclxuICAgICAqIFJlY29uc3RydWN0cyBhbGwgcHJvcGVydGllcyB0aGF0IHdlcmUgY2FwdHVyZWQgZHVyaW5nIHNlcmlhbGl6YXRpb24uXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgZGVzZXJpYWxpemVJdGVtU3RhY2soZGF0YTogU2VyaWFsaXplZEl0ZW0pOiBJdGVtU3RhY2sge1xyXG4gICAgICAgIGNvbnN0IGl0ZW0gPSBuZXcgSXRlbVN0YWNrKGRhdGEudHlwZUlkLCBkYXRhLmFtb3VudCk7XHJcblxyXG4gICAgICAgIGlmIChkYXRhLm5hbWVUYWcpIGl0ZW0ubmFtZVRhZyA9IGRhdGEubmFtZVRhZztcclxuICAgICAgICBpZiAoZGF0YS5sb3JlKSBpdGVtLnNldExvcmUoZGF0YS5sb3JlKTtcclxuICAgICAgICBpZiAoZGF0YS5sb2NrTW9kZSkgaXRlbS5sb2NrTW9kZSA9IGRhdGEubG9ja01vZGUgYXMgSXRlbUxvY2tNb2RlO1xyXG4gICAgICAgIGlmIChkYXRhLmtlZXBPbkRlYXRoKSBpdGVtLmtlZXBPbkRlYXRoID0gZGF0YS5rZWVwT25EZWF0aDtcclxuICAgICAgICBpZiAoZGF0YS5lbmNoYW50bWVudHMpIHtcclxuICAgICAgICAgICAgY29uc3QgZW5jaGFudGFibGVDb21wb25lbnRJZCA9IFwibWluZWNyYWZ0OmVuY2hhbnRhYmxlXCI7XHJcbiAgICAgICAgICAgIGNvbnN0IGVuY2hhbnRhYmxlID0gaXRlbS5nZXRDb21wb25lbnQoZW5jaGFudGFibGVDb21wb25lbnRJZCk7XHJcbiAgICAgICAgICAgIGlmIChlbmNoYW50YWJsZSkge1xyXG4gICAgICAgICAgICAgICAgZm9yIChjb25zdCBlbmNoYW50bWVudCBvZiBkYXRhLmVuY2hhbnRtZW50cykge1xyXG4gICAgICAgICAgICAgICAgICAgIC8vIFN0cmlwIG5hbWVzcGFjZSBwcmVmaXggaWYgcHJlc2VudCAoZS5nLiwgXCJtaW5lY3JhZnQ6c2hhcnBuZXNzXCIgLT4gXCJzaGFycG5lc3NcIilcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBlbmNoYW50bWVudEtleSA9IGVuY2hhbnRtZW50LmlkLnJlcGxhY2UoXCJtaW5lY3JhZnQ6XCIsIFwiXCIpO1xyXG4gICAgICAgICAgICAgICAgICAgIC8vIExvb2sgdXAgdGhlIGVuY2hhbnRtZW50IHR5cGUgZnJvbSB0aGUgcmVnaXN0cnlcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBlbmNoYW50bWVudFR5cGUgPSBFbmNoYW50bWVudFR5cGVzLmdldChlbmNoYW50bWVudEtleSk7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKGVuY2hhbnRtZW50VHlwZSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBlbmNoYW50YWJsZS5hZGRFbmNoYW50bWVudCh7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0eXBlOiBlbmNoYW50bWVudFR5cGUsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBsZXZlbDogZW5jaGFudG1lbnQubGV2ZWwsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gUmVzdG9yZSBkeW5hbWljIHByb3BlcnRpZXNcclxuICAgICAgICBpZiAoZGF0YS5keW5hbWljUHJvcGVydGllcykge1xyXG4gICAgICAgICAgICBmb3IgKGNvbnN0IFtrZXksIHZhbHVlXSBvZiBPYmplY3QuZW50cmllcyhkYXRhLmR5bmFtaWNQcm9wZXJ0aWVzKSkge1xyXG4gICAgICAgICAgICAgICAgaXRlbS5zZXREeW5hbWljUHJvcGVydHkoa2V5LCB2YWx1ZSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHJldHVybiBpdGVtO1xyXG4gICAgfVxyXG59XHJcblxyXG5kZWNsYXJlIGdsb2JhbCB7XHJcbiAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tdmFyXHJcbiAgICB2YXIgSW52ZW50b3J5VXRpbDogT21pdDx0eXBlb2YgX0ludmVudG9yeVV0aWwsIFwicHJvdG90eXBlXCI+O1xyXG59XHJcbmdsb2JhbFRoaXMuSW52ZW50b3J5VXRpbCA9IF9JbnZlbnRvcnlVdGlsO1xyXG4iXSwibmFtZXMiOlsiQmxvY2siLCJFbmNoYW50bWVudFR5cGVzIiwiRXF1aXBtZW50U2xvdCIsIkl0ZW1TdGFjayIsIlBsYXllciIsIl9JbnZlbnRvcnlVdGlsIiwiZ2V0Q29udGFpbmVyIiwic291cmNlIiwiRGVidWdUaW1lciIsImNvdW50U3RhcnQiLCJjb250YWluZXIiLCJnZXRDb21wb25lbnQiLCJjb3VudEVuZCIsImdldEVxdWlwbWVudCIsImVudGl0eSIsImVxdWlwbWVudENvbXBvbmVudCIsImZpbmRJdGVtIiwiaXRlbVN0YWNrSWQiLCJjaGVja0VxdWlwbWVudCIsInJldHVybkFuZEVuZENvdW50IiwicmVzdWx0IiwiaXRlbXNGb3VuZCIsImludmVudG9yeSIsImkiLCJzaXplIiwiaXRlbVN0YWNrIiwiZ2V0SXRlbSIsInR5cGVJZCIsInB1c2giLCJlbnRpdHlTbG90IiwiaXNFcXVpcG1lbnQiLCJzbG90IiwiZXF1aXBtZW50IiwiTWFpbmhhbmQiLCJmaW5kRmlyc3RJdGVtIiwiZ2V0SXRlbUNvdW50IiwiZm91bmRJdGVtcyIsImNvdW50IiwiZm91bmRJdGVtIiwiYW1vdW50IiwiaGFzSXRlbSIsImxlbmd0aCIsInNlcmlhbGl6ZUJhc2ljSXRlbVN0YWNrIiwiY2xlYXJJbnZlbnRvcnkiLCJjbGVhckVxdWlwbWVudCIsInNldEl0ZW0iLCJ1bmRlZmluZWQiLCJzZXRFcXVpcG1lbnQiLCJIZWFkIiwiQ2hlc3QiLCJMZWdzIiwiRmVldCIsIk9mZmhhbmQiLCJjbGVhclNsb3RzIiwiZW50aXR5U2xvdHMiLCJjbGVhclNsb3QiLCJjbGVhckVxdWlwbWVudFNsb3QiLCJjbGVhckludmVudG9yeVNsb3QiLCJyZW1vdmVJdGVtIiwiaXRlbVRvUmVtb3ZlIiwiYW1vdW50VG9SZW1vdmUiLCJmb3VuZEl0ZW1TdGFjayIsInNldEVxdWlwbWVudEl0ZW0iLCJzZXRJbnZlbnRvcnlJdGVtIiwibG9ja01vZGUiLCJvblBsYXllckdpdmVuSXRlbSIsInBsYXllciIsIkN1c3RvbUV2ZW50cyIsImVtaXQiLCJzZXRTZWxlY3RlZFNsb3QiLCJzZWxlY3RlZFNsb3RJbmRleCIsImdldE9mZmhhbmRJdGVtIiwiaXRlbSIsImNvbnNvbGUiLCJ3YXJuIiwiZ2l2ZUl0ZW0iLCJ0YXJnZXQiLCJmaWxsRXhpc3RpbmdTdGFja3MiLCJyZW1haW5pbmciLCJleGlzdGluZyIsIm1heEFtb3VudCIsInRvQWRkIiwiTWF0aCIsIm1pbiIsImFkZEl0ZW0iLCJnaXZlSXRlbXMiLCJpdGVtU3RhY2tzIiwidHJhbnNmZXJJdGVtRnJvbUNvbnRhaW5lciIsImZyb21TbG90IiwiZnJvbUNvbnRhaW5lciIsInVudHJhbnNmZXJyZWQiLCJ0cmFuc2Zlckl0ZW0iLCJ0cnlNb3ZlSXRlbVRvQ29udGFpbmVyIiwidG9TbG90IiwidG9Db250YWluZXIiLCJmaW5kIiwiZXhpc3RpbmdJdGVtIiwibW92ZUl0ZW0iLCJzZWxlY3RlZEl0ZW0iLCJjb25zdW1lU2VsZWN0ZWRJdGVtIiwiZW1wdHlTbG90c0NvdW50IiwiY2xlYXJIb3RiYXJTbG90cyIsImhvdGJhclNsb3RzIiwiY2xlYXJIb3RiYXJTbG90Iiwic2xvdE51bWJlciIsInRyYW5zZmVySXRlbUFtb3VudCIsImFtb3VudFRvVHJhbnNmZXIiLCJwYXJ0aWFsIiwiY2xvbmUiLCJvdmVyZmxvdyIsInRvQXJyYXkiLCJpdGVtcyIsInNlcmlhbGl6ZUl0ZW1TdGFjayIsInNlcmlhbGl6ZWQiLCJuYW1lVGFnIiwiZ2V0TG9yZSIsImxvcmUiLCJrZWVwT25EZWF0aCIsImVuY2hhbnRhYmxlQ29tcG9uZW50SWQiLCJoYXNDb21wb25lbnQiLCJlbmNoYW50YWJsZSIsImdldEVuY2hhbnRtZW50cyIsImZvckVhY2giLCJlbmNoYW50bWVudCIsImVuY2hhbnRtZW50cyIsImlkIiwidHlwZSIsImxldmVsIiwiZHluYW1pY1Byb3BzIiwiZ2V0RHluYW1pY1Byb3BlcnR5SWRzIiwiZHluYW1pY1Byb3BlcnRpZXMiLCJwcm9wSWQiLCJ2YWx1ZSIsImdldER5bmFtaWNQcm9wZXJ0eSIsImRlc2VyaWFsaXplSXRlbVN0YWNrIiwiZGF0YSIsInNldExvcmUiLCJlbmNoYW50bWVudEtleSIsInJlcGxhY2UiLCJlbmNoYW50bWVudFR5cGUiLCJnZXQiLCJhZGRFbmNoYW50bWVudCIsImtleSIsIk9iamVjdCIsImVudHJpZXMiLCJzZXREeW5hbWljUHJvcGVydHkiLCJnbG9iYWxUaGlzIiwiSW52ZW50b3J5VXRpbCJdLCJtYXBwaW5ncyI6IkFBQUEsNEJBQTRCLEdBQzVCLFNBQ0lBLEtBQUssRUFFTEMsZ0JBQWdCLEVBR2hCQyxhQUFhLEVBRWJDLFNBQVMsRUFDVEMsTUFBTSxRQUVILG9CQUFvQjtBQWtCM0IsTUFBTUM7SUFDRjs7OztLQUlDLEdBQ0QsT0FBY0MsYUFBYUMsTUFBc0IsRUFBRTtRQUMvQ0MsV0FBV0MsVUFBVSxDQUFDO1FBQ3RCLE1BQU1DLFlBQVlILE9BQU9JLFlBQVksQ0FBQyx1QkFBd0JELFNBQVM7UUFDdkVGLFdBQVdJLFFBQVE7UUFDbkIsT0FBT0Y7SUFDWDtJQUVBOzs7O0tBSUMsR0FDRCxPQUFjRyxhQUFhQyxNQUFjLEVBQUU7UUFDdkNOLFdBQVdDLFVBQVUsQ0FBQztRQUN0QixNQUFNTSxxQkFBZ0RELE9BQU9ILFlBQVksQ0FBQztRQUMxRUgsV0FBV0ksUUFBUTtRQUNuQixPQUFPRztJQUNYO0lBRUE7Ozs7OztLQU1DLEdBQ0QsT0FBY0MsU0FBU0YsTUFBYyxFQUFFRyxXQUFtQixFQUFFQyxpQkFBaUIsSUFBSSxFQUFFO1FBQy9FVixXQUFXQyxVQUFVLENBQUM7UUFDdEIsTUFBTVUsb0JBQW9CLENBQUNDO1lBQ3ZCWixXQUFXSSxRQUFRO1lBQ25CLE9BQU9RO1FBQ1g7UUFFQSxNQUFNQyxhQUFpRSxFQUFFO1FBRXpFLHdDQUF3QztRQUN4QyxNQUFNQyxZQUFZLElBQUksQ0FBQ2hCLFlBQVksQ0FBQ1E7UUFDcEMsSUFBSyxJQUFJUyxJQUFJLEdBQUdBLElBQUlELFVB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