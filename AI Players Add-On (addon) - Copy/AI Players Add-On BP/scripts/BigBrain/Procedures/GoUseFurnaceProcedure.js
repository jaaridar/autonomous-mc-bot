/* eslint-disable max-lines */ import { BlockPermutation, ItemStack } from "@minecraft/server";
import { LocationVar } from "BigBrain/Context/LocationVar";
import { SmeltStep } from "BigBrain/Steps/SmeltStep";
import GoUseFurnaceProcedureData from "Data/BigBrain/Procedures/GoUseFurnaceProcedureData";
import CraftingTreeData from "Data/CraftingTreeData";
import RotationHelper from "Helpers/RotationHelper";
import V3 from "Helpers/Vectors/V3";
import VirtualInventoryComponent from "Inventory/VirtualInventoryComponent";
import CompositeState from "StateSkeleton/States/CompositeState";
import { ExitType } from "StateSkeleton/Types";
import BlockUtils from "Utils/BlockUtils";
import { GoBuildBlockProcedure } from "./GoBuildBlockProcedure";
import { PathToNodeProcedure } from "./PathToNodeProcedure";
import { SwapToItemProcedure } from "./SwapToItemProcedure";
import { TryPickupItemsProcedure } from "./TryPickupItemsProcedure";
const registry = [
    GoBuildBlockProcedure,
    PathToNodeProcedure,
    SmeltStep,
    SwapToItemProcedure,
    TryPickupItemsProcedure
];
export class GoUseFurnaceProcedure extends CompositeState {
    setItemToSmelt(item) {
        if (this.isActive) return;
        this.itemToSmelt = item;
    }
    setFurnaceIntent(intent) {
        this.furnaceIntent = intent;
    }
    setShouldWaitForSmeltCompletion(shouldWait) {
        this.shouldWaitForSmeltCompletion = shouldWait;
    }
    setIsInHome(isInHome) {
        this.isInHome = isInHome;
    }
    onEnter(memory) {
        this.ownsFurnace = false;
        this.furnace = null;
        this.insertionPhase = null;
        this.insertionPhaseStartTick = 0;
        this.hasReachedFurnace = false;
        this.isInteractAnimationPlaying = false;
        this.interactAnimationStartTick = 0;
        this.failureReason = null;
        this.hasDroppedItem = false;
        if (memory) {
            this.restoreMemory(memory);
        }
        this.refreshFurnaceOwnership();
        if (!this.ownsFurnace) this.validateExistingOwnedFurnace();
        if (this.furnaceIntent === "smeltItems") {
            if (!this.itemToSmelt) {
                this.broadcastSignal("onFailure");
                return;
            }
            const resultTypeId = CraftingTreeData.RawMaterialToSmeltedMaterialMap[this.itemToSmelt.typeId];
            if (!resultTypeId) {
                //Unknown ore type, cannot smelt
                this.broadcastSignal("onFailure");
                return;
            }
            this.targetResult = new ItemStack(resultTypeId, this.itemToSmelt.amount);
        }
        this.ensureFurnace();
    }
    restoreMemory(memory) {
        if (!this.furnace && memory.furnaceLocation) {
            const location = V3.fromSerializedLocation(memory.furnaceLocation);
            this.furnace = BlockUtils.fromV3(location);
            if (this.furnace && this.furnace.type.id !== GoUseFurnaceProcedure.furnaceId && this.furnace.type.id !== GoUseFurnaceProcedure.litFurnaceId) {
                this.furnace = null;
            }
        }
        if (!this.itemToSmelt && memory.itemToSmelt) {
            this.itemToSmelt = new ItemStack(memory.itemToSmelt.typeId, memory.itemToSmelt.amount);
        }
    }
    createMemory() {
        return {
            itemToSmelt: this.itemToSmelt ? {
                typeId: this.itemToSmelt.typeId,
                amount: this.itemToSmelt.amount
            } : null,
            furnaceLocation: this.furnace ? V3.fromBlock(this.furnace).toJSON() : null
        };
    }
    refreshFurnaceOwnership() {
        if (!this.ownsFurnace) return;
        if (GoUseFurnaceProcedure.isFurnace(this.furnace)) return;
        this.ownsFurnace = false;
    }
    static isFurnace(block) {
        if (!block) return false;
        return block.type.id === GoUseFurnaceProcedure.furnaceId || block.type.id === GoUseFurnaceProcedure.litFurnaceId;
    }
    onExit(_exitType) {
        if (_exitType !== ExitType.Standard) return;
        this.context.entity.setProperty("gm1_sky:is_using_item", "idle");
    }
    onActiveTick() {
        if (this.currentSubstate?.is(PathToNodeProcedure)) this.whilePathing();
        if (this.hasReachedFurnace) {
            if (!this.furnace?.isValid) return this.broadcastSignal("onFailure");
            RotationHelper.lookAtBlock(this.context.entity, this.furnace);
        }
        if (this.insertionPhase !== null) this.tickInsertionPhase();
        if (this.isInteractAnimationPlaying && this.activeTicks - this.interactAnimationStartTick > GoUseFurnaceProcedureData.InteractAnimationDuration) {
            this.context.entity.setProperty("gm1_sky:is_using_item", "idle");
            this.isInteractAnimationPlaying = false;
        }
    }
    playInteractAnimation() {
        this.context.entity.setProperty("gm1_sky:is_using_item", "swinging");
        this.isInteractAnimationPlaying = true;
        this.interactAnimationStartTick = this.activeTicks;
    }
    setupSmelt() {
        if (!this.furnace) return this.broadcastSignal("onFailure");
        this.setSubstate(null);
        this.hasReachedFurnace = true;
        this.playInteractAnimation();
        //Start with removing output so we confirm the smelt is necessary first
        this.beginInsertionPhase("removeOutput");
    }
    beginInsertionPhase(phase) {
        this.insertionPhase = phase;
        this.insertionPhaseStartTick = this.activeTicks;
    }
    getFurnaceContainer() {
        if (!this.furnace) return null;
        return this.furnace.getComponent("minecraft:inventory")?.container ?? null;
    }
    tickInsertionPhase() {
        const elapsed = this.activeTicks - this.insertionPhaseStartTick;
        const furnaceContainer = this.getFurnaceContainer();
        if (!furnaceContainer) {
            this.insertionPhase = null;
            return this.broadcastSignal("onFailure");
        }
        switch(this.insertionPhase){
            case "removeOutput":
                {
                    if (elapsed < GoUseFurnaceProcedureData.RemoveOutputDelay) return;
                    this.insertionPhase = null;
                    if (this.checkIfOutputItemCompletesSmelt(furnaceContainer)) {
                        return this.completeSmelt();
                    }
                    if (this.furnaceIntent === "withdraw") return this.broadcastSignal("onComplete");
                    this.beginInsertionPhase("insertInput");
                    break;
                }
            case "insertInput":
                {
                    if (elapsed < GoUseFurnaceProcedureData.InsertInputDelay) return;
                    if (!this.tryInsertInputItem(furnaceContainer)) {
                        this.insertionPhase = null;
                        return this.broadcastSignal("onFailure");
                    }
                    this.beginInsertionPhase("insertFuel");
                    break;
                }
            case "insertFuel":
                {
                    if (elapsed < GoUseFurnaceProcedureData.InsertFuelDelay) return;
                    if (!this.tryInsertFuel(furnaceContainer, this.targetResult.amount)) {
                        this.insertionPhase = null;
                        this.failureReason = "noFuel";
                        return this.broadcastSignal("onFailure");
                    }
                    this.insertionPhase = null;
                    this.tryStartSmeltStep();
                    break;
                }
        }
    }
    tryStartSmeltStep() {
        if (!this.shouldWaitForSmeltCompletion) return this.broadcastSignal("onComplete");
        const smeltStep = this.getSubstate(SmeltStep);
        this.setSubstate(smeltStep);
    }
    tryInsertInputItem(furnaceContainer) {
        const virtualInventory = VirtualInventoryComponent.get(this.context.entity);
        const currentInputItem = furnaceContainer.getItem(0);
        if (currentInputItem && currentInputItem.amount > 0 && currentInputItem.type.id !== this.itemToSmelt.type.id) {
            //Remove the current item first
            const canPickup = virtualInventory.hasSpaceForItemStack(currentInputItem);
            if (canPickup) {
                virtualInventory.withdrawFromContainerSlot(furnaceContainer, 0);
            } else {
                this.context.entity.dimension.spawnItem(currentInputItem, this.context.entity.location);
                furnaceContainer.setItem(0, undefined);
                this.hasDroppedItem = true;
            }
        }
        //Double check we still have the item in case it was removed from the AIP
        const available = virtualInventory.countItemType(this.itemToSmelt.type.id);
        if (available < this.itemToSmelt.amount) return false;
        virtualInventory.depositItemStackToContainerSlot(this.itemToSmelt, furnaceContainer, 0);
        return true;
    }
    tryInsertFuel(furnaceContainer, amountRemaining) {
        const isFuranceLit = this.furnace.type.id === GoUseFurnaceProcedure.litFurnaceId;
        //Don't need to insert any more fuel
        if (isFuranceLit) return true;
        const virtualInventory = VirtualInventoryComponent.get(this.context.entity);
        const currentFuelItem = furnaceContainer.getItem(1);
        if (currentFuelItem && currentFuelItem.amount > 0) {
            //Furnace is not lit but has something in the fuel slot, remove the current item first
            const canPickup = virtualInventory.hasSpaceForItemStack(currentFuelItem);
            if (canPickup) {
                virtualInventory.withdrawFromContainerSlot(furnaceContainer, 1);
            } else {
                this.context.entity.dimension.spawnItem(currentFuelItem, this.context.entity.location);
                furnaceContainer.setItem(1, undefined);
                this.hasDroppedItem = true;
            }
        }
        const fuelToUse = this.getFuelToUse(amountRemaining);
        if (!fuelToUse) return false;
        virtualInventory.depositItemStackToContainerSlot(fuelToUse, furnaceContainer, 1);
        return true;
    }
    getFuelToUse(amountRemaining) {
        for (const [fuelTypeId, duration] of Object.entries(GoUseFurnaceProcedureData.FuelDurationMap)){
            const needed = Math.ceil(amountRemaining / duration);
            const available = VirtualInventoryComponent.get(this.context.entity).countItemType(fuelTypeId);
            if (available < needed) continue;
            return new ItemStack(fuelTypeId, needed);
        }
        return null;
    }
    checkIfOutputItemCompletesSmelt(furnaceContainer) {
        const currentOutputItem = furnaceContainer.getItem(2);
        if (!currentOutputItem || currentOutputItem.amount <= 0) return false;
        const virtualInventory = VirtualInventoryComponent.get(this.context.entity);
        const canPickup = virtualInventory.hasSpaceForItemStack(currentOutputItem);
        if (canPickup) {
            virtualInventory.withdrawFromContainerSlot(furnaceContainer, 2);
        } else {
            this.context.entity.dimension.spawnItem(currentOutputItem, this.context.entity.location);
            furnaceContainer.setItem(2, undefined);
            this.hasDroppedItem = true;
        }
        if (this.furnaceIntent === "withdraw") {
            this.targetResult = currentOutputItem;
            return true;
        }
        if (currentOutputItem.type.id !== this.targetResult?.type.id) return false;
        const remainingAmount = this.targetResult.amount - currentOutputItem.amount;
        if (remainingAmount <= 0) {
            //The existing output item fulfilled the smelt goal, complete the routine
            return true;
        }
        this.targetResult.amount = remainingAmount;
        return false;
    }
    checkForSmeltingCompletion() {
        //Furnace has been broken
        if (!this.furnace) return "failure";
        const furnaceInventory = this.furnace.getComponent("minecraft:inventory");
        if (!furnaceInventory?.container) return "failure";
        this.playInteractAnimation();
        const inputSlot = furnaceInventory.container.getItem(0);
        //The input item type has been swapped by the player
        if (inputSlot && inputSlot.amount > 0 && inputSlot.type.id !== this.itemToSmelt?.type.id) return "failure";
        const result = furnaceInventory.container.getItem(2);
        if (result && result.type.id === this.targetResult?.type.id && result.amount >= this.targetResult.amount) {
            //Give result
            const virtualInventory = VirtualInventoryComponent.get(this.context.entity);
            const canPickup = virtualInventory.hasSpaceForItemStack(result);
            if (canPickup) {
                virtualInventory.withdrawFromContainerSlot(furnaceInventory.container, 2);
            } else {
                this.context.entity.dimension.spawnItem(result, this.context.entity.location);
                furnaceInventory.container.setItem(2, undefined);
                this.hasDroppedItem = true;
            }
            return "success";
        }
        //Try to insert more fuel in case it has run out
        const amountRemaining = this.targetResult.amount - (result?.amount ?? 0);
        this.tryInsertFuel(furnaceInventory.container, amountRemaining);
        return "incomplete";
    }
    whilePathing() {
        if (this.activeTicks % GoUseFurnaceProcedureData.CanHighlightCheckDuration !== 0) return;
        if (BlockUtils.canHighlightBlock(this.context.entity, this.furnace)) this.onSubstateComplete(this.currentSubstate);
    }
    ensureFurnace() {
        if (this.furnace) {
            this.goToExistingFurnace(this.furnace);
            return;
        }
        const existingFurnace = this.getFurnaceInRange();
        if (existingFurnace) {
            this.goToExistingFurnace(existingFurnace);
            return;
        }
        this.tryBuildNewFurnace();
    }
    tryBuildNewFurnace() {
        const hasFurnaceInInventory = VirtualInventoryComponent.get(this.context.entity).hasItemType(GoUseFurnaceProcedure.furnaceId);
        if (!hasFurnaceInInventory) {
            this.failureReason = "noFurnace";
            this.broadcastSignal("onFailure");
            return;
        }
        const goBuildBlockProcedure = this.getSubstate(GoBuildBlockProcedure);
        goBuildBlockProcedure.setPermutation(BlockPermutation.resolve(GoUseFurnaceProcedure.furnaceId));
        goBuildBlockProcedure.setRemoveFromInventory(true);
        goBuildBlockProcedure.setIsInHome(this.isInHome);
        this.setSubstate(goBuildBlockProcedure);
    }
    validateExistingOwnedFurnace() {
        const furnaceLocation = EntityStore.get(this.context.entity, "ownedFurnaceLocation");
        if (!furnaceLocation) return;
        const location = new V3(furnaceLocation).setDimension(overworld);
        const block = BlockUtils.fromV3(location);
        if (!GoUseFurnaceProcedure.isFurnace(block)) {
            // Furnace was removed externally – clear the key
            EntityStore.set(this.context.entity, "ownedFurnaceLocation", null);
            return;
        }
        this.furnace = block;
        this.ownsFurnace = true;
    }
    clearOwnedFurnace() {
        EntityStore.set(this.context.entity, "ownedFurnaceLocation", null);
        this.furnace = null;
        this.ownsFurnace = false;
    }
    setFurnaceAsOwned(furnaceLocation) {
        this.furnace = BlockUtils.fromV3(furnaceLocation);
        this.ownsFurnace = !!this.furnace;
        EntityStore.set(this.context.entity, "ownedFurnaceLocation", furnaceLocation.toJSON());
    }
    goToExistingFurnace(furnace) {
        if (this.ownsFurnace && this.furnace && !V3.fromBlock(this.furnace, overworld).sharesBlockWith(V3.fromBlock(furnace, overworld))) {
            this.ownsFurnace = false;
        }
        this.furnace = furnace;
        const canUseFurnaceNow = BlockUtils.canHighlightBlock(this.context.entity, furnace);
        if (canUseFurnaceNow) {
            this.setupSmelt();
        } else {
            const pathToNodeProcedure = this.getSubstate(PathToNodeProcedure);
            pathToNodeProcedure.setPrimaryLocation(V3.fromBlock(furnace, overworld));
            pathToNodeProcedure.setCanBreakBlocks(!this.isInHome);
            pathToNodeProcedure.setCanPlaceBlocks(true);
            this.setSubstate(pathToNodeProcedure);
        }
    }
    getFurnaceInRange() {
        const entityLocation = this.context.getValue(LocationVar).$.floor();
        const radius = GoUseFurnaceProcedureData.FurnaceSearchRadius;
        const filter = {
            includeTypes: [
                GoUseFurnaceProcedure.furnaceId
            ]
        };
        const blocks = BlockUtils.getBlocksInVolume(entityLocation, radius, filter);
        if (blocks.getCapacity() === 0) return null;
        const location = blocks.getBlockLocationIterator().next().value;
        if (!location) return null;
        return this.context.entity.dimension.getBlock(location) ?? null;
    }
    completeSmelt() {
        if (this.hasDroppedItem) {
            this.setSubstate(this.getSubstate(TryPickupItemsProcedure));
            return;
        }
        this.holdResultItem();
    }
    holdResultItem() {
        const swapToItem = this.getSubstate(SwapToItemProcedure);
        swapToItem.setItem(this.targetResult);
        swapToItem.setShouldScroll(false);
        swapToItem.setWarmupDuration(GoUseFurnaceProcedureData.DelayBeforeHoldingDuration);
        swapToItem.setHoldDuration(GoUseFurnaceProcedureData.HoldItemDuration);
        this.setSubstate(swapToItem);
    }
    handleAfterPathing() {
        //Make sure the furnace is still valid and not lit by another player
        if (!this.furnace || this.furnace.type.id !== GoUseFurnaceProcedure.furnaceId) {
            this.furnace = null;
            this.ensureFurnace();
            return;
        }
        this.setupSmelt();
    }
    onSubstateComplete(state) {
        if (state.is(GoBuildBlockProcedure)) {
            const furnaceLocation = this.getSubstate(GoBuildBlockProcedure).location;
            this.setFurnaceAsOwned(furnaceLocation);
            this.setupSmelt();
        } else if (state.is(PathToNodeProcedure)) {
            this.handleAfterPathing();
        } else if (state.is(SmeltStep)) {
            const smeltResult = this.checkForSmeltingCompletion();
            switch(smeltResult){
                case "success":
                    this.completeSmelt();
                    break;
                case "failure":
                    this.broadcastSignal("onFailure");
                    break;
                default:
                    this.tryStartSmeltStep();
                    break;
            }
        } else if (state.is(TryPickupItemsProcedure)) {
            this.holdResultItem();
        } else if (state.is(SwapToItemProcedure)) {
            this.broadcastSignal("onComplete");
        }
    }
    onSubstateFailure(state) {
        if (state.is(PathToNodeProcedure)) {
            //Give up and place a furnace instead
            this.tryBuildNewFurnace();
            return;
        }
        this.broadcastSignal("onFailure");
    }
    constructor(...args){
        super(...args);
        this.furnace = null;
        this.ownsFurnace = false;
        this.itemToSmelt = null;
        this.targetResult = null;
        this.hasReachedFurnace = false;
        this.shouldWaitForSmeltCompletion = true;
        this.furnaceIntent = "smeltItems";
        this.hasDroppedItem = false;
        this.isInHome = false;
        this.isInteractAnimationPlaying = false;
        this.interactAnimationStartTick = 0;
        this.failureReason = null;
        this.insertionPhase = null;
        this.insertionPhaseStartTick = 0;
    }
}
GoUseFurnaceProcedure.definition = {
    identifier: "procedure:smelt_items",
    priority: GoUseFurnaceProcedureData.Priority,
    registry,
    initialState: null
};
GoUseFurnaceProcedure.furnaceId = "minecraft:furnace";
GoUseFurnaceProcedure.litFurnaceId = "minecraft:lit_furnace";

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkdvVXNlRnVybmFjZVByb2NlZHVyZS50cyJdLCJzb3VyY2VzQ29udGVudCI6WyIvKiBlc2xpbnQtZGlzYWJsZSBtYXgtbGluZXMgKi9cclxuaW1wb3J0IHsgQmxvY2ssIEJsb2NrRmlsdGVyLCBCbG9ja1Blcm11dGF0aW9uLCBDb250YWluZXIsIEl0ZW1TdGFjayB9IGZyb20gXCJAbWluZWNyYWZ0L3NlcnZlclwiO1xyXG5pbXBvcnQgeyBMb2NhdGlvblZhciB9IGZyb20gXCJCaWdCcmFpbi9Db250ZXh0L0xvY2F0aW9uVmFyXCI7XHJcbmltcG9ydCB7IFNtZWx0U3RlcCB9IGZyb20gXCJCaWdCcmFpbi9TdGVwcy9TbWVsdFN0ZXBcIjtcclxuaW1wb3J0IHsgU2VyaWFsaXplZExvY2F0aW9uIH0gZnJvbSBcIkJpZ0JyYWluL1R5cGVzXCI7XHJcbmltcG9ydCBHb1VzZUZ1cm5hY2VQcm9jZWR1cmVEYXRhIGZyb20gXCJEYXRhL0JpZ0JyYWluL1Byb2NlZHVyZXMvR29Vc2VGdXJuYWNlUHJvY2VkdXJlRGF0YVwiO1xyXG5pbXBvcnQgQ3JhZnRpbmdUcmVlRGF0YSBmcm9tIFwiRGF0YS9DcmFmdGluZ1RyZWVEYXRhXCI7XHJcbmltcG9ydCBSb3RhdGlvbkhlbHBlciBmcm9tIFwiSGVscGVycy9Sb3RhdGlvbkhlbHBlclwiO1xyXG5pbXBvcnQgVjMgZnJvbSBcIkhlbHBlcnMvVmVjdG9ycy9WM1wiO1xyXG5pbXBvcnQgVmlydHVhbEludmVudG9yeUNvbXBvbmVudCBmcm9tIFwiSW52ZW50b3J5L1ZpcnR1YWxJbnZlbnRvcnlDb21wb25lbnRcIjtcclxuaW1wb3J0IEFic3RyYWN0U3RhdGUgZnJvbSBcIlN0YXRlU2tlbGV0b24vU3RhdGVzL0Fic3RyYWN0U3RhdGVcIjtcclxuaW1wb3J0IENvbXBvc2l0ZVN0YXRlIGZyb20gXCJTdGF0ZVNrZWxldG9uL1N0YXRlcy9Db21wb3NpdGVTdGF0ZVwiO1xyXG5pbXBvcnQgeyBDb21wb3NpdGVTdGF0ZURlZmluaXRpb24sIEV4aXRUeXBlLCBTdGF0ZU1lbW9yeSB9IGZyb20gXCJTdGF0ZVNrZWxldG9uL1R5cGVzXCI7XHJcbmltcG9ydCBCbG9ja1V0aWxzIGZyb20gXCJVdGlscy9CbG9ja1V0aWxzXCI7XHJcbmltcG9ydCB7IEdvQnVpbGRCbG9ja1Byb2NlZHVyZSB9IGZyb20gXCIuL0dvQnVpbGRCbG9ja1Byb2NlZHVyZVwiO1xyXG5pbXBvcnQgeyBQYXRoVG9Ob2RlUHJvY2VkdXJlIH0gZnJvbSBcIi4vUGF0aFRvTm9kZVByb2NlZHVyZVwiO1xyXG5pbXBvcnQgeyBTd2FwVG9JdGVtUHJvY2VkdXJlIH0gZnJvbSBcIi4vU3dhcFRvSXRlbVByb2NlZHVyZVwiO1xyXG5pbXBvcnQgeyBUcnlQaWNrdXBJdGVtc1Byb2NlZHVyZSB9IGZyb20gXCIuL1RyeVBpY2t1cEl0ZW1zUHJvY2VkdXJlXCI7XHJcblxyXG5leHBvcnQgdHlwZSBGdXJuYWNlSW50ZW50ID0gXCJzbWVsdEl0ZW1zXCIgfCBcIndpdGhkcmF3XCI7XHJcbnR5cGUgSW5zZXJ0aW9uUGhhc2UgPSBcImluc2VydElucHV0XCIgfCBcImluc2VydEZ1ZWxcIiB8IFwicmVtb3ZlT3V0cHV0XCIgfCBudWxsO1xyXG5cclxuaW50ZXJmYWNlIE1lbW9yeSBleHRlbmRzIFN0YXRlTWVtb3J5IHtcclxuICAgIGl0ZW1Ub1NtZWx0OiB7IHR5cGVJZDogc3RyaW5nOyBhbW91bnQ6IG51bWJlciB9IHwgbnVsbDtcclxuICAgIGZ1cm5hY2VMb2NhdGlvbjogU2VyaWFsaXplZExvY2F0aW9uIHwgbnVsbDtcclxufVxyXG5cclxuY29uc3QgcmVnaXN0cnkgPSBbR29CdWlsZEJsb2NrUHJvY2VkdXJlLCBQYXRoVG9Ob2RlUHJvY2VkdXJlLCBTbWVsdFN0ZXAsIFN3YXBUb0l0ZW1Qcm9jZWR1cmUsIFRyeVBpY2t1cEl0ZW1zUHJvY2VkdXJlXSBhcyBjb25zdDtcclxuXHJcbmV4cG9ydCBjbGFzcyBHb1VzZUZ1cm5hY2VQcm9jZWR1cmUgZXh0ZW5kcyBDb21wb3NpdGVTdGF0ZTx0eXBlb2YgcmVnaXN0cnk+IHtcclxuICAgIHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgZGVmaW5pdGlvbjogQ29tcG9zaXRlU3RhdGVEZWZpbml0aW9uPHR5cGVvZiByZWdpc3RyeT4gPSB7XHJcbiAgICAgICAgaWRlbnRpZmllcjogXCJwcm9jZWR1cmU6c21lbHRfaXRlbXNcIixcclxuICAgICAgICBwcmlvcml0eTogR29Vc2VGdXJuYWNlUHJvY2VkdXJlRGF0YS5Qcmlvcml0eSxcclxuICAgICAgICByZWdpc3RyeSxcclxuICAgICAgICBpbml0aWFsU3RhdGU6IG51bGwsXHJcbiAgICB9O1xyXG5cclxuICAgIHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IGZ1cm5hY2VJZCA9IFwibWluZWNyYWZ0OmZ1cm5hY2VcIjtcclxuICAgIHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IGxpdEZ1cm5hY2VJZCA9IFwibWluZWNyYWZ0OmxpdF9mdXJuYWNlXCI7XHJcblxyXG4gICAgcHVibGljIGZ1cm5hY2U6IEJsb2NrIHwgbnVsbCA9IG51bGw7XHJcbiAgICBwdWJsaWMgb3duc0Z1cm5hY2U6IGJvb2xlYW4gPSBmYWxzZTtcclxuXHJcbiAgICBwcml2YXRlIGl0ZW1Ub1NtZWx0OiBJdGVtU3RhY2sgfCBudWxsID0gbnVsbDtcclxuICAgIHByaXZhdGUgdGFyZ2V0UmVzdWx0OiBJdGVtU3RhY2sgfCBudWxsID0gbnVsbDtcclxuICAgIHByaXZhdGUgaGFzUmVhY2hlZEZ1cm5hY2U6IGJvb2xlYW4gPSBmYWxzZTtcclxuICAgIHByaXZhdGUgc2hvdWxkV2FpdEZvclNtZWx0Q29tcGxldGlvbjogYm9vbGVhbiA9IHRydWU7XHJcbiAgICBwcml2YXRlIGZ1cm5hY2VJbnRlbnQ6IEZ1cm5hY2VJbnRlbnQgPSBcInNtZWx0SXRlbXNcIjtcclxuICAgIHByaXZhdGUgaGFzRHJvcHBlZEl0ZW06IGJvb2xlYW4gPSBmYWxzZTtcclxuICAgIHByaXZhdGUgaXNJbkhvbWU6IGJvb2xlYW4gPSBmYWxzZTtcclxuXHJcbiAgICBwcml2YXRlIGlzSW50ZXJhY3RBbmltYXRpb25QbGF5aW5nOiBib29sZWFuID0gZmFsc2U7XHJcbiAgICBwcml2YXRlIGludGVyYWN0QW5pbWF0aW9uU3RhcnRUaWNrOiBudW1iZXIgPSAwO1xyXG5cclxuICAgIHB1YmxpYyBmYWlsdXJlUmVhc29uOiBcIm5vRnVybmFjZVwiIHwgXCJub0Z1ZWxcIiB8IG51bGwgPSBudWxsO1xyXG5cclxuICAgIHByaXZhdGUgaW5zZXJ0aW9uUGhhc2U6IEluc2VydGlvblBoYXNlID0gbnVsbDtcclxuICAgIHByaXZhdGUgaW5zZXJ0aW9uUGhhc2VTdGFydFRpY2s6IG51bWJlciA9IDA7XHJcblxyXG4gICAgcHVibGljIHNldEl0ZW1Ub1NtZWx0KGl0ZW06IEl0ZW1TdGFjayk6IHZvaWQge1xyXG4gICAgICAgIGlmICh0aGlzLmlzQWN0aXZlKSByZXR1cm47XHJcbiAgICAgICAgdGhpcy5pdGVtVG9TbWVsdCA9IGl0ZW07XHJcbiAgICB9XHJcblxyXG4gICAgcHVibGljIHNldEZ1cm5hY2VJbnRlbnQoaW50ZW50OiBGdXJuYWNlSW50ZW50KTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5mdXJuYWNlSW50ZW50ID0gaW50ZW50O1xyXG4gICAgfVxyXG5cclxuICAgIHB1YmxpYyBzZXRTaG91bGRXYWl0Rm9yU21lbHRDb21wbGV0aW9uKHNob3VsZFdhaXQ6IGJvb2xlYW4pOiB2b2lkIHtcclxuICAgICAgICB0aGlzLnNob3VsZFdhaXRGb3JTbWVsdENvbXBsZXRpb24gPSBzaG91bGRXYWl0O1xyXG4gICAgfVxyXG5cclxuICAgIHB1YmxpYyBzZXRJc0luSG9tZShpc0luSG9tZTogYm9vbGVhbik6IHZvaWQge1xyXG4gICAgICAgIHRoaXMuaXNJbkhvbWUgPSBpc0luSG9tZTtcclxuICAgIH1cclxuXHJcbiAgICBwcm90ZWN0ZWQgb25FbnRlcihtZW1vcnk/OiBNZW1vcnkpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLm93bnNGdXJuYWNlID0gZmFsc2U7XHJcbiAgICAgICAgdGhpcy5mdXJuYWNlID0gbnVsbDtcclxuICAgICAgICB0aGlzLmluc2VydGlvblBoYXNlID0gbnVsbDtcclxuICAgICAgICB0aGlzLmluc2VydGlvblBoYXNlU3RhcnRUaWNrID0gMDtcclxuICAgICAgICB0aGlzLmhhc1JlYWNoZWRGdXJuYWNlID0gZmFsc2U7XHJcbiAgICAgICAgdGhpcy5pc0ludGVyYWN0QW5pbWF0aW9uUGxheWluZyA9IGZhbHNlO1xyXG4gICAgICAgIHRoaXMuaW50ZXJhY3RBbmltYXRpb25TdGFydFRpY2sgPSAwO1xyXG4gICAgICAgIHRoaXMuZmFpbHVyZVJlYXNvbiA9IG51bGw7XHJcbiAgICAgICAgdGhpcy5oYXNEcm9wcGVkSXRlbSA9IGZhbHNlO1xyXG5cclxuICAgICAgICBpZiAobWVtb3J5KSB7XHJcbiAgICAgICAgICAgIHRoaXMucmVzdG9yZU1lbW9yeShtZW1vcnkpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdGhpcy5yZWZyZXNoRnVybmFjZU93bmVyc2hpcCgpO1xyXG5cclxuICAgICAgICBpZiAoIXRoaXMub3duc0Z1cm5hY2UpIHRoaXMudmFsaWRhdGVFeGlzdGluZ093bmVkRnVybmFjZSgpO1xyXG5cclxuICAgICAgICBpZiAodGhpcy5mdXJuYWNlSW50ZW50ID09PSBcInNtZWx0SXRlbXNcIikge1xyXG4gICAgICAgICAgICBpZiAoIXRoaXMuaXRlbVRvU21lbHQpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuYnJvYWRjYXN0U2lnbmFsKFwib25GYWlsdXJlXCIpO1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICBjb25zdCByZXN1bHRUeXBlSWQgPSBDcmFmdGluZ1RyZWVEYXRhLlJhd01hdGVyaWFsVG9TbWVsdGVkTWF0ZXJpYWxNYXBbdGhpcy5pdGVtVG9TbWVsdC50eXBlSWRdO1xyXG4gICAgICAgICAgICBpZiAoIXJlc3VsdFR5cGVJZCkge1xyXG4gICAgICAgICAgICAgICAgLy9Vbmtub3duIG9yZSB0eXBlLCBjYW5ub3Qgc21lbHRcclxuICAgICAgICAgICAgICAgIHRoaXMuYnJvYWRjYXN0U2lnbmFsKFwib25GYWlsdXJlXCIpO1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHRoaXMudGFyZ2V0UmVzdWx0ID0gbmV3IEl0ZW1TdGFjayhyZXN1bHRUeXBlSWQsIHRoaXMuaXRlbVRvU21lbHQuYW1vdW50KTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRoaXMuZW5zdXJlRnVybmFjZSgpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgcmVzdG9yZU1lbW9yeShtZW1vcnk6IE1lbW9yeSk6IHZvaWQge1xyXG4gICAgICAgIGlmICghdGhpcy5mdXJuYWNlICYmIG1lbW9yeS5mdXJuYWNlTG9jYXRpb24pIHtcclxuICAgICAgICAgICAgY29uc3QgbG9jYXRpb24gPSBWMy5mcm9tU2VyaWFsaXplZExvY2F0aW9uKG1lbW9yeS5mdXJuYWNlTG9jYXRpb24pO1xyXG4gICAgICAgICAgICB0aGlzLmZ1cm5hY2UgPSBCbG9ja1V0aWxzLmZyb21WMyhsb2NhdGlvbik7XHJcblxyXG4gICAgICAgICAgICBpZiAoXHJcbiAgICAgICAgICAgICAgICB0aGlzLmZ1cm5hY2UgJiZcclxuICAgICAgICAgICAgICAgIHRoaXMuZnVybmFjZS50eXBlLmlkICE9PSBHb1VzZUZ1cm5hY2VQcm9jZWR1cmUuZnVybmFjZUlkICYmXHJcbiAgICAgICAgICAgICAgICB0aGlzLmZ1cm5hY2UudHlwZS5pZCAhPT0gR29Vc2VGdXJuYWNlUHJvY2VkdXJlLmxpdEZ1cm5hY2VJZFxyXG4gICAgICAgICAgICApIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuZnVybmFjZSA9IG51bGw7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmICghdGhpcy5pdGVtVG9TbWVsdCAmJiBtZW1vcnkuaXRlbVRvU21lbHQpIHtcclxuICAgICAgICAgICAgdGhpcy5pdGVtVG9TbWVsdCA9IG5ldyBJdGVtU3RhY2sobWVtb3J5Lml0ZW1Ub1NtZWx0LnR5cGVJZCwgbWVtb3J5Lml0ZW1Ub1NtZWx0LmFtb3VudCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByb3RlY3RlZCBjcmVhdGVNZW1vcnkoKTogTWVtb3J5IHwgdW5kZWZpbmVkIHtcclxuICAgICAgICByZXR1cm4ge1xyXG4gICAgICAgICAgICBpdGVtVG9TbWVsdDogdGhpcy5pdGVtVG9TbWVsdCA/IHsgdHlwZUlkOiB0aGlzLml0ZW1Ub1NtZWx0LnR5cGVJZCwgYW1vdW50OiB0aGlzLml0ZW1Ub1NtZWx0LmFtb3VudCB9IDogbnVsbCxcclxuICAgICAgICAgICAgZnVybmFjZUxvY2F0aW9uOiB0aGlzLmZ1cm5hY2UgPyBWMy5mcm9tQmxvY2sodGhpcy5mdXJuYWNlKS50b0pTT04oKSA6IG51bGwsXHJcbiAgICAgICAgfTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHJlZnJlc2hGdXJuYWNlT3duZXJzaGlwKCk6IHZvaWQge1xyXG4gICAgICAgIGlmICghdGhpcy5vd25zRnVybmFjZSkgcmV0dXJuO1xyXG4gICAgICAgIGlmIChHb1VzZUZ1cm5hY2VQcm9jZWR1cmUuaXNGdXJuYWNlKHRoaXMuZnVybmFjZSkpIHJldHVybjtcclxuXHJcbiAgICAgICAgdGhpcy5vd25zRnVybmFjZSA9IGZhbHNlO1xyXG4gICAgfVxyXG5cclxuICAgIHB1YmxpYyBzdGF0aWMgaXNGdXJuYWNlKGJsb2NrOiBCbG9jayB8IG51bGwpOiBib29sZWFuIHtcclxuICAgICAgICBpZiAoIWJsb2NrKSByZXR1cm4gZmFsc2U7XHJcblxyXG4gICAgICAgIHJldHVybiBibG9jay50eXBlLmlkID09PSBHb1VzZUZ1cm5hY2VQcm9jZWR1cmUuZnVybmFjZUlkIHx8IGJsb2NrLnR5cGUuaWQgPT09IEdvVXNlRnVybmFjZVByb2NlZHVyZS5saXRGdXJuYWNlSWQ7XHJcbiAgICB9XHJcblxyXG4gICAgcHJvdGVjdGVkIG9uRXhpdChfZXhpdFR5cGU6IEV4aXRUeXBlKTogdm9pZCB7XHJcbiAgICAgICAgaWYgKF9leGl0VHlwZSAhPT0gRXhpdFR5cGUuU3RhbmRhcmQpIHJldHVybjtcclxuXHJcbiAgICAgICAgdGhpcy5jb250ZXh0LmVudGl0eS5zZXRQcm9wZXJ0eShcImdtMV9za3k6aXNfdXNpbmdfaXRlbVwiLCBcImlkbGVcIik7XHJcbiAgICB9XHJcblxyXG4gICAgcHJvdGVjdGVkIG92ZXJyaWRlIG9uQWN0aXZlVGljaygpOiB2b2lkIHtcclxuICAgICAgICBpZiAodGhpcy5jdXJyZW50U3Vic3RhdGU/LmlzKFBhdGhUb05vZGVQcm9jZWR1cmUpKSB0aGlzLndoaWxlUGF0aGluZygpO1xyXG5cclxuICAgICAgICBpZiAodGhpcy5oYXNSZWFjaGVkRnVybmFjZSkge1xyXG4gICAgICAgICAgICBpZiAoIXRoaXMuZnVybmFjZT8uaXNWYWxpZCkgcmV0dXJuIHRoaXMuYnJvYWRjYXN0U2lnbmFsKFwib25GYWlsdXJlXCIpO1xyXG4gICAgICAgICAgICBSb3RhdGlvbkhlbHBlci5sb29rQXRCbG9jayh0aGlzLmNvbnRleHQuZW50aXR5LCB0aGlzLmZ1cm5hY2UhKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmICh0aGlzLmluc2VydGlvblBoYXNlICE9PSBudWxsKSB0aGlzLnRpY2tJbnNlcnRpb25QaGFzZSgpO1xyXG5cclxuICAgICAgICBpZiAoXHJcbiAgICAgICAgICAgIHRoaXMuaXNJbnRlcmFjdEFuaW1hdGlvblBsYXlpbmcgJiZcclxuICAgICAgICAgICAgdGhpcy5hY3RpdmVUaWNrcyAtIHRoaXMuaW50ZXJhY3RBbmltYXRpb25TdGFydFRpY2sgPiBHb1VzZUZ1cm5hY2VQcm9jZWR1cmVEYXRhLkludGVyYWN0QW5pbWF0aW9uRHVyYXRpb25cclxuICAgICAgICApIHtcclxuICAgICAgICAgICAgdGhpcy5jb250ZXh0LmVudGl0eS5zZXRQcm9wZXJ0eShcImdtMV9za3k6aXNfdXNpbmdfaXRlbVwiLCBcImlkbGVcIik7XHJcbiAgICAgICAgICAgIHRoaXMuaXNJbnRlcmFjdEFuaW1hdGlvblBsYXlpbmcgPSBmYWxzZTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBwbGF5SW50ZXJhY3RBbmltYXRpb24oKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5jb250ZXh0LmVudGl0eS5zZXRQcm9wZXJ0eShcImdtMV9za3k6aXNfdXNpbmdfaXRlbVwiLCBcInN3aW5naW5nXCIpO1xyXG4gICAgICAgIHRoaXMuaXNJbnRlcmFjdEFuaW1hdGlvblBsYXlpbmcgPSB0cnVlO1xyXG4gICAgICAgIHRoaXMuaW50ZXJhY3RBbmltYXRpb25TdGFydFRpY2sgPSB0aGlzLmFjdGl2ZVRpY2tzO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgc2V0dXBTbWVsdCgpOiB2b2lkIHtcclxuICAgICAgICBpZiAoIXRoaXMuZnVybmFjZSkgcmV0dXJuIHRoaXMuYnJvYWRjYXN0U2lnbmFsKFwib25GYWlsdXJlXCIpO1xyXG5cclxuICAgICAgICB0aGlzLnNldFN1YnN0YXRlKG51bGwpO1xyXG4gICAgICAgIHRoaXMuaGFzUmVhY2hlZEZ1cm5hY2UgPSB0cnVlO1xyXG4gICAgICAgIHRoaXMucGxheUludGVyYWN0QW5pbWF0aW9uKCk7XHJcblxyXG4gICAgICAgIC8vU3RhcnQgd2l0aCByZW1vdmluZyBvdXRwdXQgc28gd2UgY29uZmlybSB0aGUgc21lbHQgaXMgbmVjZXNzYXJ5IGZpcnN0XHJcbiAgICAgICAgdGhpcy5iZWdpbkluc2VydGlvblBoYXNlKFwicmVtb3ZlT3V0cHV0XCIpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgYmVnaW5JbnNlcnRpb25QaGFzZShwaGFzZTogSW5zZXJ0aW9uUGhhc2UpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLmluc2VydGlvblBoYXNlID0gcGhhc2U7XHJcbiAgICAgICAgdGhpcy5pbnNlcnRpb25QaGFzZVN0YXJ0VGljayA9IHRoaXMuYWN0aXZlVGlja3M7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBnZXRGdXJuYWNlQ29udGFpbmVyKCk6IENvbnRhaW5lciB8IG51bGwge1xyXG4gICAgICAgIGlmICghdGhpcy5mdXJuYWNlKSByZXR1cm4gbnVsbDtcclxuICAgICAgICByZXR1cm4gdGhpcy5mdXJuYWNlLmdldENvbXBvbmVudChcIm1pbmVjcmFmdDppbnZlbnRvcnlcIik/LmNvbnRhaW5lciA/PyBudWxsO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgdGlja0luc2VydGlvblBoYXNlKCk6IHZvaWQge1xyXG4gICAgICAgIGNvbnN0IGVsYXBzZWQgPSB0aGlzLmFjdGl2ZVRpY2tzIC0gdGhpcy5pbnNlcnRpb25QaGFzZVN0YXJ0VGljaztcclxuXHJcbiAgICAgICAgY29uc3QgZnVybmFjZUNvbnRhaW5lciA9IHRoaXMuZ2V0RnVybmFjZUNvbnRhaW5lcigpO1xyXG4gICAgICAgIGlmICghZnVybmFjZUNvbnRhaW5lcikge1xyXG4gICAgICAgICAgICB0aGlzLmluc2VydGlvblBoYXNlID0gbnVsbDtcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuYnJvYWRjYXN0U2lnbmFsKFwib25GYWlsdXJlXCIpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgc3dpdGNoICh0aGlzLmluc2VydGlvblBoYXNlKSB7XHJcbiAgICAgICAgICAgIGNhc2UgXCJyZW1vdmVPdXRwdXRcIjoge1xyXG4gICAgICAgICAgICAgICAgaWYgKGVsYXBzZWQgPCBHb1VzZUZ1cm5hY2VQcm9jZWR1cmVEYXRhLlJlbW92ZU91dHB1dERlbGF5KSByZXR1cm47XHJcbiAgICAgICAgICAgICAgICB0aGlzLmluc2VydGlvblBoYXNlID0gbnVsbDtcclxuICAgICAgICAgICAgICAgIGlmICh0aGlzLmNoZWNrSWZPdXRwdXRJdGVtQ29tcGxldGVzU21lbHQoZnVybmFjZUNvbnRhaW5lcikpIHtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5jb21wbGV0ZVNtZWx0KCk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5mdXJuYWNlSW50ZW50ID09PSBcIndpdGhkcmF3XCIpIHJldHVybiB0aGlzLmJyb2FkY2FzdFNpZ25hbChcIm9uQ29tcGxldGVcIik7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmJlZ2luSW5zZXJ0aW9uUGhhc2UoXCJpbnNlcnRJbnB1dFwiKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGNhc2UgXCJpbnNlcnRJbnB1dFwiOiB7XHJcbiAgICAgICAgICAgICAgICBpZiAoZWxhcHNlZCA8IEdvVXNlRnVybmFjZVByb2NlZHVyZURhdGEuSW5zZXJ0SW5wdXREZWxheSkgcmV0dXJuO1xyXG4gICAgICAgICAgICAgICAgaWYgKCF0aGlzLnRyeUluc2VydElucHV0SXRlbShmdXJuYWNlQ29udGFpbmVyKSkge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuaW5zZXJ0aW9uUGhhc2UgPSBudWxsO1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmJyb2FkY2FzdFNpZ25hbChcIm9uRmFpbHVyZVwiKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIHRoaXMuYmVnaW5JbnNlcnRpb25QaGFzZShcImluc2VydEZ1ZWxcIik7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBjYXNlIFwiaW5zZXJ0RnVlbFwiOiB7XHJcbiAgICAgICAgICAgICAgICBpZiAoZWxhcHNlZCA8IEdvVXNlRnVybmFjZVByb2NlZHVyZURhdGEuSW5zZXJ0RnVlbERlbGF5KSByZXR1cm47XHJcbiAgICAgICAgICAgICAgICBpZiAoIXRoaXMudHJ5SW5zZXJ0RnVlbChmdXJuYWNlQ29udGFpbmVyLCB0aGlzLnRhcmdldFJlc3VsdCEuYW1vdW50KSkge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuaW5zZXJ0aW9uUGhhc2UgPSBudWxsO1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZmFpbHVyZVJlYXNvbiA9IFwibm9GdWVsXCI7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuYnJvYWRjYXN0U2lnbmFsKFwib25GYWlsdXJlXCIpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgdGhpcy5pbnNlcnRpb25QaGFzZSA9IG51bGw7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnRyeVN0YXJ0U21lbHRTdGVwKCk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHRyeVN0YXJ0U21lbHRTdGVwKCk6IHZvaWQge1xyXG4gICAgICAgIGlmICghdGhpcy5zaG91bGRXYWl0Rm9yU21lbHRDb21wbGV0aW9uKSByZXR1cm4gdGhpcy5icm9hZGNhc3RTaWduYWwoXCJvbkNvbXBsZXRlXCIpO1xyXG5cclxuICAgICAgICBjb25zdCBzbWVsdFN0ZXAgPSB0aGlzLmdldFN1YnN0YXRlKFNtZWx0U3RlcCk7XHJcbiAgICAgICAgdGhpcy5zZXRTdWJzdGF0ZShzbWVsdFN0ZXApO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgdHJ5SW5zZXJ0SW5wdXRJdGVtKGZ1cm5hY2VDb250YWluZXI6IENvbnRhaW5lcik6IGJvb2xlYW4ge1xyXG4gICAgICAgIGNvbnN0IHZpcnR1YWxJbnZlbnRvcnkgPSBWaXJ0dWFsSW52ZW50b3J5Q29tcG9uZW50LmdldCh0aGlzLmNvbnRleHQuZW50aXR5KTtcclxuXHJcbiAgICAgICAgY29uc3QgY3VycmVudElucHV0SXRlbSA9IGZ1cm5hY2VDb250YWluZXIuZ2V0SXRlbSgwKTtcclxuICAgICAgICBpZiAoY3VycmVudElucHV0SXRlbSAmJiBjdXJyZW50SW5wdXRJdGVtLmFtb3VudCA+IDAgJiYgY3VycmVudElucHV0SXRlbS50eXBlLmlkICE9PSB0aGlzLml0ZW1Ub1NtZWx0IS50eXBlLmlkKSB7XHJcbiAgICAgICAgICAgIC8vUmVtb3ZlIHRoZSBjdXJyZW50IGl0ZW0gZmlyc3RcclxuICAgICAgICAgICAgY29uc3QgY2FuUGlja3VwID0gdmlydHVhbEludmVudG9yeS5oYXNTcGFjZUZvckl0ZW1TdGFjayhjdXJyZW50SW5wdXRJdGVtKTtcclxuXHJcbiAgICAgICAgICAgIGlmIChjYW5QaWNrdXApIHtcclxuICAgICAgICAgICAgICAgIHZpcnR1YWxJbnZlbnRvcnkud2l0aGRyYXdGcm9tQ29udGFpbmVyU2xvdChmdXJuYWNlQ29udGFpbmVyLCAwKTtcclxuICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuY29udGV4dC5lbnRpdHkuZGltZW5zaW9uLnNwYXduSXRlbShjdXJyZW50SW5wdXRJdGVtLCB0aGlzLmNvbnRleHQuZW50aXR5LmxvY2F0aW9uKTtcclxuICAgICAgICAgICAgICAgIGZ1cm5hY2VDb250YWluZXIuc2V0SXRlbSgwLCB1bmRlZmluZWQpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5oYXNEcm9wcGVkSXRlbSA9IHRydWU7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vRG91YmxlIGNoZWNrIHdlIHN0aWxsIGhhdmUgdGhlIGl0ZW0gaW4gY2FzZSBpdCB3YXMgcmVtb3ZlZCBmcm9tIHRoZSBBSVBcclxuICAgICAgICBjb25zdCBhdmFpbGFibGUgPSB2aXJ0dWFsSW52ZW50b3J5LmNvdW50SXRlbVR5cGUodGhpcy5pdGVtVG9TbWVsdCEudHlwZS5pZCk7XHJcbiAgICAgICAgaWYgKGF2YWlsYWJsZSA8IHRoaXMuaXRlbVRvU21lbHQhLmFtb3VudCkgcmV0dXJuIGZhbHNlO1xyXG5cclxuICAgICAgICB2aXJ0dWFsSW52ZW50b3J5LmRlcG9zaXRJdGVtU3RhY2tUb0NvbnRhaW5lclNsb3QodGhpcy5pdGVtVG9TbWVsdCEsIGZ1cm5hY2VDb250YWluZXIsIDApO1xyXG4gICAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgdHJ5SW5zZXJ0RnVlbChmdXJuYWNlQ29udGFpbmVyOiBDb250YWluZXIsIGFtb3VudFJlbWFpbmluZzogbnVtYmVyKTogYm9vbGVhbiB7XHJcbiAgICAgICAgY29uc3QgaXNGdXJhbmNlTGl0ID0gdGhpcy5mdXJuYWNlIS50eXBlLmlkID09PSBHb1VzZUZ1cm5hY2VQcm9jZWR1cmUubGl0RnVybmFjZUlkO1xyXG5cclxuICAgICAgICAvL0Rvbid0IG5lZWQgdG8gaW5zZXJ0IGFueSBtb3JlIGZ1ZWxcclxuICAgICAgICBpZiAoaXNGdXJhbmNlTGl0KSByZXR1cm4gdHJ1ZTtcclxuXHJcbiAgICAgICAgY29uc3QgdmlydHVhbEludmVudG9yeSA9IFZpcnR1YWxJbnZlbnRvcnlDb21wb25lbnQuZ2V0KHRoaXMuY29udGV4dC5lbnRpdHkpO1xyXG5cclxuICAgICAgICBjb25zdCBjdXJyZW50RnVlbEl0ZW0gPSBmdXJuYWNlQ29udGFpbmVyLmdldEl0ZW0oMSk7XHJcbiAgICAgICAgaWYgKGN1cnJlbnRGdWVsSXRlbSAmJiBjdXJyZW50RnVlbEl0ZW0uYW1vdW50ID4gMCkge1xyXG4gICAgICAgICAgICAvL0Z1cm5hY2UgaXMgbm90IGxpdCBidXQgaGFzIHNvbWV0aGluZyBpbiB0aGUgZnVlbCBzbG90LCByZW1vdmUgdGhlIGN1cnJlbnQgaXRlbSBmaXJzdFxyXG4gICAgICAgICAgICBjb25zdCBjYW5QaWNrdXAgPSB2aXJ0dWFsSW52ZW50b3J5Lmhhc1NwYWNlRm9ySXRlbVN0YWNrKGN1cnJlbnRGdWVsSXRlbSk7XHJcblxyXG4gICAgICAgICAgICBpZiAoY2FuUGlja3VwKSB7XHJcbiAgICAgICAgICAgICAgICB2aXJ0dWFsSW52ZW50b3J5LndpdGhkcmF3RnJvbUNvbnRhaW5lclNsb3QoZnVybmFjZUNvbnRhaW5lciwgMSk7XHJcbiAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmNvbnRleHQuZW50aXR5LmRpbWVuc2lvbi5zcGF3bkl0ZW0oY3VycmVudEZ1ZWxJdGVtLCB0aGlzLmNvbnRleHQuZW50aXR5LmxvY2F0aW9uKTtcclxuICAgICAgICAgICAgICAgIGZ1cm5hY2VDb250YWluZXIuc2V0SXRlbSgxLCB1bmRlZmluZWQpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5oYXNEcm9wcGVkSXRlbSA9IHRydWU7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGNvbnN0IGZ1ZWxUb1VzZSA9IHRoaXMuZ2V0RnVlbFRvVXNlKGFtb3VudFJlbWFpbmluZyk7XHJcbiAgICAgICAgaWYgKCFmdWVsVG9Vc2UpIHJldHVybiBmYWxzZTtcclxuXHJcbiAgICAgICAgdmlydHVhbEludmVudG9yeS5kZXBvc2l0SXRlbVN0YWNrVG9Db250YWluZXJTbG90KGZ1ZWxUb1VzZSwgZnVybmFjZUNvbnRhaW5lciwgMSk7XHJcbiAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBnZXRGdWVsVG9Vc2UoYW1vdW50UmVtYWluaW5nOiBudW1iZXIpOiBJdGVtU3RhY2sgfCBudWxsIHtcclxuICAgICAgICBmb3IgKGNvbnN0IFtmdWVsVHlwZUlkLCBkdXJhdGlvbl0gb2YgT2JqZWN0LmVudHJpZXMoR29Vc2VGdXJuYWNlUHJvY2VkdXJlRGF0YS5GdWVsRHVyYXRpb25NYXApKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IG5lZWRlZCA9IE1hdGguY2VpbChhbW91bnRSZW1haW5pbmcgLyBkdXJhdGlvbik7XHJcbiAgICAgICAgICAgIGNvbnN0IGF2YWlsYWJsZSA9IFZpcnR1YWxJbnZlbnRvcnlDb21wb25lbnQuZ2V0KHRoaXMuY29udGV4dC5lbnRpdHkpLmNvdW50SXRlbVR5cGUoZnVlbFR5cGVJZCk7XHJcbiAgICAgICAgICAgIGlmIChhdmFpbGFibGUgPCBuZWVkZWQpIGNvbnRpbnVlO1xyXG4gICAgICAgICAgICByZXR1cm4gbmV3IEl0ZW1TdGFjayhmdWVsVHlwZUlkLCBuZWVkZWQpO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGNoZWNrSWZPdXRwdXRJdGVtQ29tcGxldGVzU21lbHQoZnVybmFjZUNvbnRhaW5lcjogQ29udGFpbmVyKTogYm9vbGVhbiB7XHJcbiAgICAgICAgY29uc3QgY3VycmVudE91dHB1dEl0ZW0gPSBmdXJuYWNlQ29udGFpbmVyLmdldEl0ZW0oMik7XHJcbiAgICAgICAgaWYgKCFjdXJyZW50T3V0cHV0SXRlbSB8fCBjdXJyZW50T3V0cHV0SXRlbS5hbW91bnQgPD0gMCkgcmV0dXJuIGZhbHNlO1xyXG5cclxuICAgICAgICBjb25zdCB2aXJ0dWFsSW52ZW50b3J5ID0gVmlydHVhbEludmVudG9yeUNvbXBvbmVudC5nZXQodGhpcy5jb250ZXh0LmVudGl0eSk7XHJcbiAgICAgICAgY29uc3QgY2FuUGlja3VwID0gdmlydHVhbEludmVudG9yeS5oYXNTcGFjZUZvckl0ZW1TdGFjayhjdXJyZW50T3V0cHV0SXRlbSk7XHJcblxyXG4gICAgICAgIGlmIChjYW5QaWNrdXApIHtcclxuICAgICAgICAgICAgdmlydHVhbEludmVudG9yeS53aXRoZHJhd0Zyb21Db250YWluZXJTbG90KGZ1cm5hY2VDb250YWluZXIsIDIpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHRoaXMuY29udGV4dC5lbnRpdHkuZGltZW5zaW9uLnNwYXduSXRlbShjdXJyZW50T3V0cHV0SXRlbSwgdGhpcy5jb250ZXh0LmVudGl0eS5sb2NhdGlvbik7XHJcbiAgICAgICAgICAgIGZ1cm5hY2VDb250YWluZXIuc2V0SXRlbSgyLCB1bmRlZmluZWQpO1xyXG4gICAgICAgICAgICB0aGlzLmhhc0Ryb3BwZWRJdGVtID0gdHJ1ZTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmICh0aGlzLmZ1cm5hY2VJbnRlbnQgPT09IFwid2l0aGRyYXdcIikge1xyXG4gICAgICAgICAgICB0aGlzLnRhcmdldFJlc3VsdCA9IGN1cnJlbnRPdXRwdXRJdGVtO1xyXG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmIChjdXJyZW50T3V0cHV0SXRlbS50eXBlLmlkICE9PSB0aGlzLnRhcmdldFJlc3VsdD8udHlwZS5pZCkgcmV0dXJuIGZhbHNlO1xyXG5cclxuICAgICAgICBjb25zdCByZW1haW5pbmdBbW91bnQgPSB0aGlzLnRhcmdldFJlc3VsdCEuYW1vdW50IC0gY3VycmVudE91dHB1dEl0ZW0uYW1vdW50O1xyXG4gICAgICAgIGlmIChyZW1haW5pbmdBbW91bnQgPD0gMCkge1xyXG4gICAgICAgICAgICAvL1RoZSBleGlzdGluZyBvdXRwdXQgaXRlbSBmdWxmaWxsZWQgdGhlIHNtZWx0IGdvYWwsIGNvbXBsZXRlIHRoZSByb3V0aW5lXHJcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLnRhcmdldFJlc3VsdCEuYW1vdW50ID0gcmVtYWluaW5nQW1vdW50O1xyXG5cclxuICAgICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBjaGVja0ZvclNtZWx0aW5nQ29tcGxldGlvbigpOiBcInN1Y2Nlc3NcIiB8IFwiZmFpbHVyZVwiIHwgXCJpbmNvbXBsZXRlXCIge1xyXG4gICAgICAgIC8vRnVybmFjZSBoYXMgYmVlbiBicm9rZW5cclxuICAgICAgICBpZiAoIXRoaXMuZnVybmFjZSkgcmV0dXJuIFwiZmFpbHVyZVwiO1xyXG5cclxuICAgICAgICBjb25zdCBmdXJuYWNlSW52ZW50b3J5ID0gdGhpcy5mdXJuYWNlLmdldENvbXBvbmVudChcIm1pbmVjcmFmdDppbnZlbnRvcnlcIik7XHJcbiAgICAgICAgaWYgKCFmdXJuYWNlSW52ZW50b3J5Py5jb250YWluZXIpIHJldHVybiBcImZhaWx1cmVcIjtcclxuXHJcbiAgICAgICAgdGhpcy5wbGF5SW50ZXJhY3RBbmltYXRpb24oKTtcclxuXHJcbiAgICAgICAgY29uc3QgaW5wdXRTbG90ID0gZnVybmFjZUludmVudG9yeS5jb250YWluZXIuZ2V0SXRlbSgwKTtcclxuICAgICAgICAvL1RoZSBpbnB1dCBpdGVtIHR5cGUgaGFzIGJlZW4gc3dhcHBlZCBieSB0aGUgcGxheWVyXHJcbiAgICAgICAgaWYgKGlucHV0U2xvdCAmJiBpbnB1dFNsb3QuYW1vdW50ID4gMCAmJiBpbnB1dFNsb3QudHlwZS5pZCAhPT0gdGhpcy5pdGVtVG9TbWVsdD8udHlwZS5pZCkgcmV0dXJuIFwiZmFpbHVyZVwiO1xyXG5cclxuICAgICAgICBjb25zdCByZXN1bHQgPSBmdXJuYWNlSW52ZW50b3J5LmNvbnRhaW5lci5nZXRJdGVtKDIpO1xyXG4gICAgICAgIGlmIChyZXN1bHQgJiYgcmVzdWx0LnR5cGUuaWQgPT09IHRoaXMudGFyZ2V0UmVzdWx0Py50eXBlLmlkICYmIHJlc3VsdC5hbW91bnQgPj0gdGhpcy50YXJnZXRSZXN1bHQuYW1vdW50KSB7XHJcbiAgICAgICAgICAgIC8vR2l2ZSByZXN1bHRcclxuICAgICAgICAgICAgY29uc3QgdmlydHVhbEludmVudG9yeSA9IFZpcnR1YWxJbnZlbnRvcnlDb21wb25lbnQuZ2V0KHRoaXMuY29udGV4dC5lbnRpdHkpO1xyXG4gICAgICAgICAgICBjb25zdCBjYW5QaWNrdXAgPSB2aXJ0dWFsSW52ZW50b3J5Lmhhc1NwYWNlRm9ySXRlbVN0YWNrKHJlc3VsdCk7XHJcblxyXG4gICAgICAgICAgICBpZiAoY2FuUGlja3VwKSB7XHJcbiAgICAgICAgICAgICAgICB2aXJ0dWFsSW52ZW50b3J5LndpdGhkcmF3RnJvbUNvbnRhaW5lclNsb3QoZnVybmFjZUludmVudG9yeS5jb250YWluZXIsIDIpO1xyXG4gICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5jb250ZXh0LmVudGl0eS5kaW1lbnNpb24uc3Bhd25JdGVtKHJlc3VsdCwgdGhpcy5jb250ZXh0LmVudGl0eS5sb2NhdGlvbik7XHJcbiAgICAgICAgICAgICAgICBmdXJuYWNlSW52ZW50b3J5LmNvbnRhaW5lci5zZXRJdGVtKDIsIHVuZGVmaW5lZCk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmhhc0Ryb3BwZWRJdGVtID0gdHJ1ZTtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgcmV0dXJuIFwic3VjY2Vzc1wiO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy9UcnkgdG8gaW5zZXJ0IG1vcmUgZnVlbCBpbiBjYXNlIGl0IGhhcyBydW4gb3V0XHJcbiAgICAgICAgY29uc3QgYW1vdW50UmVtYWluaW5nID0gdGhpcy50YXJnZXRSZXN1bHQhLmFtb3VudCAtIChyZXN1bHQ/LmFtb3VudCA/PyAwKTtcclxuICAgICAgICB0aGlzLnRyeUluc2VydEZ1ZWwoZnVybmFjZUludmVudG9yeS5jb250YWluZXIsIGFtb3VudFJlbWFpbmluZyk7XHJcblxyXG4gICAgICAgIHJldHVybiBcImluY29tcGxldGVcIjtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHdoaWxlUGF0aGluZygpOiB2b2lkIHtcclxuICAgICAgICBpZiAodGhpcy5hY3RpdmVUaWNrcyAlIEdvVXNlRnVybmFjZVByb2NlZHVyZURhdGEuQ2FuSGlnaGxpZ2h0Q2hlY2tEdXJhdGlvbiAhPT0gMCkgcmV0dXJuO1xyXG5cclxuICAgICAgICBpZiAoQmxvY2tVdGlscy5jYW5IaWdobGlnaHRCbG9jayh0aGlzLmNvbnRleHQuZW50aXR5LCB0aGlzLmZ1cm5hY2UpKSB0aGlzLm9uU3Vic3RhdGVDb21wbGV0ZSh0aGlzLmN1cnJlbnRTdWJzdGF0ZSEpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZW5zdXJlRnVybmFjZSgpOiB2b2lkIHtcclxuICAgICAgICBpZiAodGhpcy5mdXJuYWNlKSB7XHJcbiAgICAgICAgICAgIHRoaXMuZ29Ub0V4aXN0aW5nRnVybmFjZSh0aGlzLmZ1cm5hY2UpO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBjb25zdCBleGlzdGluZ0Z1cm5hY2UgPSB0aGlzLmdldEZ1cm5hY2VJblJhbmdlKCk7XHJcbiAgICAgICAgaWYgKGV4aXN0aW5nRnVybmFjZSkge1xyXG4gICAgICAgICAgICB0aGlzLmdvVG9FeGlzdGluZ0Z1cm5hY2UoZXhpc3RpbmdGdXJuYWNlKTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdGhpcy50cnlCdWlsZE5ld0Z1cm5hY2UoKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHRyeUJ1aWxkTmV3RnVybmFjZSgpOiB2b2lkIHtcclxuICAgICAgICBjb25zdCBoYXNGdXJuYWNlSW5JbnZlbnRvcnkgPSBWaXJ0dWFsSW52ZW50b3J5Q29tcG9uZW50LmdldCh0aGlzLmNvbnRleHQuZW50aXR5KS5oYXNJdGVtVHlwZShHb1VzZUZ1cm5hY2VQcm9jZWR1cmUuZnVybmFjZUlkKTtcclxuICAgICAgICBpZiAoIWhhc0Z1cm5hY2VJbkludmVudG9yeSkge1xyXG4gICAgICAgICAgICB0aGlzLmZhaWx1cmVSZWFzb24gPSBcIm5vRnVybmFjZVwiO1xyXG4gICAgICAgICAgICB0aGlzLmJyb2FkY2FzdFNpZ25hbChcIm9uRmFpbHVyZVwiKTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc3QgZ29CdWlsZEJsb2NrUHJvY2VkdXJlID0gdGhpcy5nZXRTdWJzdGF0ZShHb0J1aWxkQmxvY2tQcm9jZWR1cmUpO1xyXG4gICAgICAgIGdvQnVpbGRCbG9ja1Byb2NlZHVyZS5zZXRQZXJtdXRhdGlvbihCbG9ja1Blcm11dGF0aW9uLnJlc29sdmUoR29Vc2VGdXJuYWNlUHJvY2VkdXJlLmZ1cm5hY2VJZCkpO1xyXG4gICAgICAgIGdvQnVpbGRCbG9ja1Byb2NlZHVyZS5zZXRSZW1vdmVGcm9tSW52ZW50b3J5KHRydWUpO1xyXG4gICAgICAgIGdvQnVpbGRCbG9ja1Byb2NlZHVyZS5zZXRJc0luSG9tZSh0aGlzLmlzSW5Ib21lKTtcclxuICAgICAgICB0aGlzLnNldFN1YnN0YXRlKGdvQnVpbGRCbG9ja1Byb2NlZHVyZSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHVibGljIHZhbGlkYXRlRXhpc3RpbmdPd25lZEZ1cm5hY2UoKTogdm9pZCB7XHJcbiAgICAgICAgY29uc3QgZnVybmFjZUxvY2F0aW9uID0gRW50aXR5U3RvcmUuZ2V0KHRoaXMuY29udGV4dC5lbnRpdHksIFwib3duZWRGdXJuYWNlTG9jYXRpb25cIik7XHJcbiAgICAgICAgaWYgKCFmdXJuYWNlTG9jYXRpb24pIHJldHVybjtcclxuXHJcbiAgICAgICAgY29uc3QgbG9jYXRpb24gPSBuZXcgVjMoZnVybmFjZUxvY2F0aW9uKS5zZXREaW1lbnNpb24ob3ZlcndvcmxkKTtcclxuICAgICAgICBjb25zdCBibG9jayA9IEJsb2NrVXRpbHMuZnJvbVYzKGxvY2F0aW9uKTtcclxuICAgICAgICBpZiAoIUdvVXNlRnVybmFjZVByb2NlZHVyZS5pc0Z1cm5hY2UoYmxvY2spKSB7XHJcbiAgICAgICAgICAgIC8vIEZ1cm5hY2Ugd2FzIHJlbW92ZWQgZXh0ZXJuYWxseSDigJMgY2xlYXIgdGhlIGtleVxyXG4gICAgICAgICAgICBFbnRpdHlTdG9yZS5zZXQodGhpcy5jb250ZXh0LmVudGl0eSwgXCJvd25lZEZ1cm5hY2VMb2NhdGlvblwiLCBudWxsKTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdGhpcy5mdXJuYWNlID0gYmxvY2s7XHJcbiAgICAgICAgdGhpcy5vd25zRnVybmFjZSA9IHRydWU7XHJcbiAgICB9XHJcblxyXG4gICAgcHVibGljIGNsZWFyT3duZWRGdXJuYWNlKCk6IHZvaWQge1xyXG4gICAgICAgIEVudGl0eVN0b3JlLnNldCh0aGlzLmNvbnRleHQuZW50aXR5LCBcIm93bmVkRnVybmFjZUxvY2F0aW9uXCIsIG51bGwpO1xyXG4gICAgICAgIHRoaXMuZnVybmFjZSA9IG51bGw7XHJcbiAgICAgICAgdGhpcy5vd25zRnVybmFjZSA9IGZhbHNlO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgc2V0RnVybmFjZUFzT3duZWQoZnVybmFjZUxvY2F0aW9uOiBWMyk6IHZvaWQge1xyXG4gICAgICAgIHRoaXMuZnVybmFjZSA9IEJsb2NrVXRpbHMuZnJvbVYzKGZ1cm5hY2VMb2NhdGlvbiEpO1xyXG4gICAgICAgIHRoaXMub3duc0Z1cm5hY2UgPSAhIXRoaXMuZnVybmFjZTtcclxuICAgICAgICBFbnRpdHlTdG9yZS5zZXQodGhpcy5jb250ZXh0LmVudGl0eSwgXCJvd25lZEZ1cm5hY2VMb2NhdGlvblwiLCBmdXJuYWNlTG9jYXRpb24udG9KU09OKCkpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZ29Ub0V4aXN0aW5nRnVybmFjZShmdXJuYWNlOiBCbG9jayk6IHZvaWQge1xyXG4gICAgICAgIGlmICh0aGlzLm93bnNGdXJuYWNlICYmIHRoaXMuZnVybmFjZSAmJiAhVjMuZnJvbUJsb2NrKHRoaXMuZnVybmFjZSwgb3ZlcndvcmxkKS5zaGFyZXNCbG9ja1dpdGgoVjMuZnJvbUJsb2NrKGZ1cm5hY2UsIG92ZXJ3b3JsZCkpKSB7XHJcbiAgICAgICAgICAgIHRoaXMub3duc0Z1cm5hY2UgPSBmYWxzZTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRoaXMuZnVybmFjZSA9IGZ1cm5hY2U7XHJcblxyXG4gICAgICAgIGNvbnN0IGNhblVzZUZ1cm5hY2VOb3cgPSBCbG9ja1V0aWxzLmNhbkhpZ2hsaWdodEJsb2NrKHRoaXMuY29udGV4dC5lbnRpdHksIGZ1cm5hY2UpO1xyXG4gICAgICAgIGlmIChjYW5Vc2VGdXJuYWNlTm93KSB7XHJcbiAgICAgICAgICAgIHRoaXMuc2V0dXBTbWVsdCgpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHBhdGhUb05vZGVQcm9jZWR1cmUgPSB0aGlzLmdldFN1YnN0YXRlKFBhdGhUb05vZGVQcm9jZWR1cmUpO1xyXG4gICAgICAgICAgICBwYXRoVG9Ob2RlUHJvY2VkdXJlLnNldFByaW1hcnlMb2NhdGlvbihWMy5mcm9tQmxvY2soZnVybmFjZSwgb3ZlcndvcmxkKSk7XHJcbiAgICAgICAgICAgIHBhdGhUb05vZGVQcm9jZWR1cmUuc2V0Q2FuQnJlYWtCbG9ja3MoIXRoaXMuaXNJbkhvbWUpO1xyXG4gICAgICAgICAgICBwYXRoVG9Ob2RlUHJvY2VkdXJlLnNldENhblBsYWNlQmxvY2tzKHRydWUpO1xyXG4gICAgICAgICAgICB0aGlzLnNldFN1YnN0YXRlKHBhdGhUb05vZGVQcm9jZWR1cmUpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGdldEZ1cm5hY2VJblJhbmdlKCk6IEJsb2NrIHwgbnVsbCB7XHJcbiAgICAgICAgY29uc3QgZW50aXR5TG9jYXRpb24gPSB0aGlzLmNvbnRleHQuZ2V0VmFsdWUoTG9jYXRpb25WYXIpLiQuZmxvb3IoKTtcclxuICAgICAgICBjb25zdCByYWRpdXMgPSBHb1VzZUZ1cm5hY2VQcm9jZWR1cmVEYXRhLkZ1cm5hY2VTZWFyY2hSYWRpdXM7XHJcbiAgICAgICAgY29uc3QgZmlsdGVyOiBCbG9ja0ZpbHRlciA9IHsgaW5jbHVkZVR5cGVzOiBbR29Vc2VGdXJuYWNlUHJvY2VkdXJlLmZ1cm5hY2VJZF0gfTtcclxuXHJcbiAgICAgICAgY29uc3QgYmxvY2tzID0gQmxvY2tVdGlscy5nZXRCbG9ja3NJblZvbHVtZShlbnRpdHlMb2NhdGlvbiwgcmFkaXVzLCBmaWx0ZXIpO1xyXG5cclxuICAgICAgICBpZiAoYmxvY2tzLmdldENhcGFjaXR5KCkgPT09IDApIHJldHVybiBudWxsO1xyXG5cclxuICAgICAgICBjb25zdCBsb2NhdGlvbiA9IGJsb2Nrcy5nZXRCbG9ja0xvY2F0aW9uSXRlcmF0b3IoKS5uZXh0KCkudmFsdWU7XHJcbiAgICAgICAgaWYgKCFsb2NhdGlvbikgcmV0dXJuIG51bGw7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuY29udGV4dC5lbnRpdHkuZGltZW5zaW9uLmdldEJsb2NrKGxvY2F0aW9uKSA/PyBudWxsO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgY29tcGxldGVTbWVsdCgpOiB2b2lkIHtcclxuICAgICAgICBpZiAodGhpcy5oYXNEcm9wcGVkSXRlbSkge1xyXG4gICAgICAgICAgICB0aGlzLnNldFN1YnN0YXRlKHRoaXMuZ2V0U3Vic3RhdGUoVHJ5UGlja3VwSXRlbXNQcm9jZWR1cmUpKTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdGhpcy5ob2xkUmVzdWx0SXRlbSgpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgaG9sZFJlc3VsdEl0ZW0oKTogdm9pZCB7XHJcbiAgICAgICAgY29uc3Qgc3dhcFRvSXRlbSA9IHRoaXMuZ2V0U3Vic3RhdGUoU3dhcFRvSXRlbVByb2NlZHVyZSk7XHJcbiAgICAgICAgc3dhcFRvSXRlbS5zZXRJdGVtKHRoaXMudGFyZ2V0UmVzdWx0ISk7XHJcbiAgICAgICAgc3dhcFRvSXRlbS5zZXRTaG91bGRTY3JvbGwoZmFsc2UpO1xyXG4gICAgICAgIHN3YXBUb0l0ZW0uc2V0V2FybXVwRHVyYXRpb24oR29Vc2VGdXJuYWNlUHJvY2VkdXJlRGF0YS5EZWxheUJlZm9yZUhvbGRpbmdEdXJhdGlvbik7XHJcbiAgICAgICAgc3dhcFRvSXRlbS5zZXRIb2xkRHVyYXRpb24oR29Vc2VGdXJuYWNlUHJvY2VkdXJlRGF0YS5Ib2xkSXRlbUR1cmF0aW9uKTtcclxuICAgICAgICB0aGlzLnNldFN1YnN0YXRlKHN3YXBUb0l0ZW0pO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgaGFuZGxlQWZ0ZXJQYXRoaW5nKCk6IHZvaWQge1xyXG4gICAgICAgIC8vTWFrZSBzdXJlIHRoZSBmdXJuYWNlIGlzIHN0aWxsIHZhbGlkIGFuZCBub3QgbGl0IGJ5IGFub3RoZXIgcGxheWVyXHJcbiAgICAgICAgaWYgKCF0aGlzLmZ1cm5hY2UgfHwgdGhpcy5mdXJuYWNlLnR5cGUuaWQgIT09IEdvVXNlRnVybmFjZVByb2NlZHVyZS5mdXJuYWNlSWQpIHtcclxuICAgICAgICAgICAgdGhpcy5mdXJuYWNlID0gbnVsbDtcclxuICAgICAgICAgICAgdGhpcy5lbnN1cmVGdXJuYWNlKCk7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRoaXMuc2V0dXBTbWVsdCgpO1xyXG4gICAgfVxyXG5cclxuICAgIHB1YmxpYyBvdmVycmlkZSBvblN1YnN0YXRlQ29tcGxldGUoc3RhdGU6IEFic3RyYWN0U3RhdGUpOiB2b2lkIHtcclxuICAgICAgICBpZiAoc3RhdGUuaXMoR29CdWlsZEJsb2NrUHJvY2VkdXJlKSkge1xyXG4gICAgICAgICAgICBjb25zdCBmdXJuYWNlTG9jYXRpb24gPSB0aGlzLmdldFN1YnN0YXRlKEdvQnVpbGRCbG9ja1Byb2NlZHVyZSkubG9jYXRpb247XHJcbiAgICAgICAgICAgIHRoaXMuc2V0RnVybmFjZUFzT3duZWQoZnVybmFjZUxvY2F0aW9uISk7XHJcbiAgICAgICAgICAgIHRoaXMuc2V0dXBTbWVsdCgpO1xyXG4gICAgICAgIH0gZWxzZSBpZiAoc3RhdGUuaXMoUGF0aFRvTm9kZVByb2NlZHVyZSkpIHtcclxuICAgICAgICAgICAgdGhpcy5oYW5kbGVBZnRlclBhdGhpbmcoKTtcclxuICAgICAgICB9IGVsc2UgaWYgKHN0YXRlLmlzKFNtZWx0U3RlcCkpIHtcclxuICAgICAgICAgICAgY29uc3Qgc21lbHRSZXN1bHQgPSB0aGlzLmNoZWNrRm9yU21lbHRpbmdDb21wbGV0aW9uKCk7XHJcbiAgICAgICAgICAgIHN3aXRjaCAoc21lbHRSZXN1bHQpIHtcclxuICAgICAgICAgICAgICAgIGNhc2UgXCJzdWNjZXNzXCI6XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jb21wbGV0ZVNtZWx0KCk7XHJcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBjYXNlIFwiZmFpbHVyZVwiOlxyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuYnJvYWRjYXN0U2lnbmFsKFwib25GYWlsdXJlXCIpO1xyXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgZGVmYXVsdDpcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnRyeVN0YXJ0U21lbHRTdGVwKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9IGVsc2UgaWYgKHN0YXRlLmlzKFRyeVBpY2t1cEl0ZW1zUHJvY2VkdXJlKSkge1xyXG4gICAgICAgICAgICB0aGlzLmhvbGRSZXN1bHRJdGVtKCk7XHJcbiAgICAgICAgfSBlbHNlIGlmIChzdGF0ZS5pcyhTd2FwVG9JdGVtUHJvY2VkdXJlKSkge1xyXG4gICAgICAgICAgICB0aGlzLmJyb2FkY2FzdFNpZ25hbChcIm9uQ29tcGxldGVcIik7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByb3RlY3RlZCBvblN1YnN0YXRlRmFpbHVyZShzdGF0ZTogQWJzdHJhY3RTdGF0ZSk6IHZvaWQge1xyXG4gICAgICAgIGlmIChzdGF0ZS5pcyhQYXRoVG9Ob2RlUHJvY2VkdXJlKSkge1xyXG4gICAgICAgICAgICAvL0dpdmUgdXAgYW5kIHBsYWNlIGEgZnVybmFjZSBpbnN0ZWFkXHJcbiAgICAgICAgICAgIHRoaXMudHJ5QnVpbGROZXdGdXJuYWNlKCk7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRoaXMuYnJvYWRjYXN0U2lnbmFsKFwib25GYWlsdXJlXCIpO1xyXG4gICAgfVxyXG59XHJcbiJdLCJuYW1lcyI6WyJCbG9ja1Blcm11dGF0aW9uIiwiSXRlbVN0YWNrIiwiTG9jYXRpb25WYXIiLCJTbWVsdFN0ZXAiLCJHb1VzZUZ1cm5hY2VQcm9jZWR1cmVEYXRhIiwiQ3JhZnRpbmdUcmVlRGF0YSIsIlJvdGF0aW9uSGVscGVyIiwiVjMiLCJWaXJ0dWFsSW52ZW50b3J5Q29tcG9uZW50IiwiQ29tcG9zaXRlU3RhdGUiLCJFeGl0VHlwZSIsIkJsb2NrVXRpbHMiLCJHb0J1aWxkQmxvY2tQcm9jZWR1cmUiLCJQYXRoVG9Ob2RlUHJvY2VkdXJlIiwiU3dhcFRvSXRlbVByb2NlZHVyZSIsIlRyeVBpY2t1cEl0ZW1zUHJvY2VkdXJlIiwicmVnaXN0cnkiLCJHb1VzZUZ1cm5hY2VQcm9jZWR1cmUiLCJzZXRJdGVtVG9TbWVsdCIsIml0ZW0iLCJpc0FjdGl2ZSIsIml0ZW1Ub1NtZWx0Iiwic2V0RnVybmFjZUludGVudCIsImludGVudCIsImZ1cm5hY2VJbnRlbnQiLCJzZXRTaG91bGRXYWl0Rm9yU21lbHRDb21wbGV0aW9uIiwic2hvdWxkV2FpdCIsInNob3VsZFdhaXRGb3JTbWVsdENvbXBsZXRpb24iLCJzZXRJc0luSG9tZSIsImlzSW5Ib21lIiwib25FbnRlciIsIm1lbW9yeSIsIm93bnNGdXJuYWNlIiwiZnVybmFjZSIsImluc2VydGlvblBoYXNlIiwiaW5zZXJ0aW9uUGhhc2VTdGFydFRpY2siLCJoYXNSZWFjaGVkRnVybmFjZSIsImlzSW50ZXJhY3RBbmltYXRpb25QbGF5aW5nIiwiaW50ZXJhY3RBbmltYXRpb25TdGFydFRpY2siLCJmYWlsdXJlUmVhc29uIiwiaGFzRHJvcHBlZEl0ZW0iLCJyZXN0b3JlTWVtb3J5IiwicmVmcmVzaEZ1cm5hY2VPd25lcnNoaXAiLCJ2YWxpZGF0ZUV4aXN0aW5nT3duZWRGdXJuYWNlIiwiYnJvYWRjYXN0U2lnbmFsIiwicmVzdWx0VHlwZUlkIiwiUmF3TWF0ZXJpYWxUb1NtZWx0ZWRNYXRlcmlhbE1hcCIsInR5cGVJZCIsInRhcmdldFJlc3VsdCIsImFtb3VudCIsImVuc3VyZUZ1cm5hY2UiLCJmdXJuYWNlTG9jYXRpb24iLCJsb2NhdGlvbiIsImZyb21TZXJpYWxpemVkTG9jYXRpb24iLCJmcm9tVjMiLCJ0eXBlIiwiaWQiLCJmdXJuYWNlSWQiLCJsaXRGdXJuYWNlSWQiLCJjcmVhdGVNZW1vcnkiLCJmcm9tQmxvY2siLCJ0b0pTT04iLCJpc0Z1cm5hY2UiLCJibG9jayIsIm9uRXhpdCIsIl9leGl0VHlwZSIsIlN0YW5kYXJkIiwiY29udGV4dCIsImVudGl0eSIsInNldFByb3BlcnR5Iiwib25BY3RpdmVUaWNrIiwiY3VycmVudFN1YnN0YXRlIiwiaXMiLCJ3aGlsZVBhdGhpbmciLCJpc1ZhbGlkIiwibG9va0F0QmxvY2siLCJ0aWNrSW5zZXJ0aW9uUGhhc2UiLCJhY3RpdmVUaWNrcyIsIkludGVyYWN0QW5pbWF0aW9uRHVyYXRpb24iLCJwbGF5SW50ZXJhY3RBbmltYXRpb24iLCJzZXR1cFNtZWx0Iiwic2V0U3Vic3RhdGUiLCJiZWdpbkluc2VydGlvblBoYXNlIiwicGhhc2UiLCJnZXRGdXJuYWNlQ29udGFpbmVyIiwiZ2V0Q29tcG9uZW50IiwiY29udGFpbmVyIiwiZWxhcHNlZCIsImZ1cm5hY2VDb250YWluZXIiLCJSZW1vdmVPdXRwdXREZWxheSIsImNoZWNrSWZPdXRwdXRJdGVtQ29tcGxldGVzU21lbHQiLCJjb21wbGV0ZVNtZWx0IiwiSW5zZXJ0SW5wdXREZWxheSIsInRyeUluc2VydElucHV0SXRlbSIsIkluc2VydEZ1ZWxEZWxheSIsInRyeUluc2VydEZ1ZWwiLCJ0cnlTdGFydFNtZWx0U3RlcCIsInNtZWx0U3RlcCIsImdldFN1YnN0YXRlIiwidmlydHVhbEludmVudG9yeSIsImdldCIsImN1cnJlbnRJbnB1dEl0ZW0iLCJnZXRJdGVtIiwiY2FuUGlja3VwIiwiaGFzU3BhY2VGb3JJdGVtU3RhY2siLCJ3aXRoZHJhd0Zyb21Db250YWluZXJTbG90IiwiZGltZW5zaW9uIiwic3Bhd25JdGVtIiwic2V0SXRlbSIsInVuZGVmaW5lZCIsImF2YWlsYWJsZSIsImNvdW50SXRlbVR5cGUiLCJkZXBvc2l0SXRlbVN0YWNrVG9Db250YWluZXJTbG90IiwiYW1vdW50UmVtYWluaW5nIiwiaXNGdXJhbmNlTGl0IiwiY3VycmVudEZ1ZWxJdGVtIiwiZnVlbFRvVXNlIiwiZ2V0RnVlbFRvVXNlIiwiZnVlbFR5cGVJZCIsImR1cmF0aW9uIiwiT2JqZWN0IiwiZW50cmllcyIsIkZ1ZWxEdXJhdGlvbk1hcCIsIm5lZWRlZCIsIk1hdGgiLCJjZWlsIiwiY3VycmVudE91dHB1dEl0ZW0iLCJyZW1haW5pbmdBbW91bnQiLCJjaGVja0ZvclNtZWx0aW5nQ29tcGxldGlvbiIsImZ1cm5hY2VJbnZlbnRvcnkiLCJpbnB1dFNsb3QiLCJyZXN1bHQiLCJDYW5IaWdobGlnaHRDaGVja0R1cmF0aW9uIiwiY2FuSGlnaGxpZ2h0QmxvY2siLCJvblN1YnN0YXRlQ29tcGxldGUiLCJnb1RvRXhpc3RpbmdGdXJuYWNlIiwiZXhpc3RpbmdGdXJuYWNlIiwiZ2V0RnVybmFjZUluUmFuZ2UiLCJ0cnlCdWlsZE5ld0Z1cm5hY2UiLCJoYXNGdXJuYWNlSW5JbnZlbnRvcnkiLCJoYXNJdGVtVHlwZSIsImdvQnVpbGRCbG9ja1Byb2NlZHVyZSIsInNldFBlcm11dGF0aW9uIiwicmVzb2x2ZSIsInNldFJlbW92ZUZyb21JbnZlbnRvcnkiLCJFbnRpdHlTdG9yZSIsInNldERpbWVuc2lvbiIsIm92ZXJ3b3JsZCIsInNldCIsImNsZWFyT3duZWRGdXJuYWNlIiwic2V0RnVybmFjZUFzT3duZWQiLCJzaGFyZXNCbG9ja1dpdGgiLCJjYW5Vc2VGdXJuYWNlTm93IiwicGF0aFRvTm9kZVByb2NlZHVyZSIsInNldFByaW1hcnlMb2NhdGlvbiIsInNldENhbkJyZWFrQmxvY2tzIiwic2V0Q2FuUGxhY2VCbG9ja3MiLCJlbnRpdHlMb2NhdGlvbiIsImdldFZhbHVlIiwiJCIsImZsb29yIiwicmFkaXVzIiwiRnVybmFjZVNlYXJjaFJhZGl1cyIsImZpbHRlciIsImluY2x1ZGVUeXBlcyIsImJsb2NrcyIsImdldEJsb2Nrc0luVm9sdW1lIiwiZ2V0Q2FwYWNpdHkiLCJnZXRCbG9ja0xvY2F0aW9uSXRlcmF0b3IiLCJuZXh0IiwidmFsdWUiLCJnZXRCbG9jayIsImhvbGRSZXN1bHRJdGVtIiwic3dhcFRvSXRlbSIsInNldFNob3VsZFNjcm9sbCIsInNldFdhcm11cER1cmF0aW9uIiwiRGVsYXlCZWZvcmVIb2xkaW5nRHVyYXRpb24iLCJzZXRIb2xkRHVyYXRpb24iLCJIb2xkSXRlbUR1cmF0aW9uIiwiaGFuZGxlQWZ0ZXJQYXRoaW5nIiwic3RhdGUiLCJzbWVsdFJlc3VsdCIsIm9uU3Vic3RhdGVGYWlsdXJlIiwiZGVmaW5pdGlvbiIsImlkZW50aWZpZXIiLCJwcmlvcml0eSIsIlByaW9yaXR5IiwiaW5pdGlhbFN0YXRlIl0sIm1hcHBpbmdzIjoiQUFBQSw0QkFBNEIsR0FDNUIsU0FBNkJBLGdCQUFnQixFQUFhQyxTQUFTLFFBQVEsb0JBQW9CO0FBQy9GLFNBQVNDLFdBQVcsUUFBUSwrQkFBK0I7QUFDM0QsU0FBU0MsU0FBUyxRQUFRLDJCQUEyQjtBQUVyRCxPQUFPQywrQkFBK0IscURBQXFEO0FBQzNGLE9BQU9DLHNCQUFzQix3QkFBd0I7QUFDckQsT0FBT0Msb0JBQW9CLHlCQUF5QjtBQUNwRCxPQUFPQyxRQUFRLHFCQUFxQjtBQUNwQyxPQUFPQywrQkFBK0Isc0NBQXNDO0FBRTVFLE9BQU9DLG9CQUFvQixzQ0FBc0M7QUFDakUsU0FBbUNDLFFBQVEsUUFBcUIsc0JBQXNCO0FBQ3RGLE9BQU9DLGdCQUFnQixtQkFBbUI7QUFDMUMsU0FBU0MscUJBQXFCLFFBQVEsMEJBQTBCO0FBQ2hFLFNBQVNDLG1CQUFtQixRQUFRLHdCQUF3QjtBQUM1RCxTQUFTQyxtQkFBbUIsUUFBUSx3QkFBd0I7QUFDNUQsU0FBU0MsdUJBQXVCLFFBQVEsNEJBQTRCO0FBVXBFLE1BQU1DLFdBQVc7SUFBQ0o7SUFBdUJDO0lBQXFCVjtJQUFXVztJQUFxQkM7Q0FBd0I7QUFFdEgsT0FBTyxNQUFNRSw4QkFBOEJSO0lBOEJoQ1MsZUFBZUMsSUFBZSxFQUFRO1FBQ3pDLElBQUksSUFBSSxDQUFDQyxRQUFRLEVB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