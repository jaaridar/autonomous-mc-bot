import { ItemStack } from "@minecraft/server";
import AgesData from "Data/AgesData";
import ProgressAgesProcedureData from "Data/BigBrain/Procedures/ProgressAgesProcedureData";
import { InventoryData } from "Data/InventoryData";
import CraftingHelper from "Helpers/CraftingHelper";
import InventoryHelper from "Inventory/InventoryHelper";
import VirtualInventoryComponent from "Inventory/VirtualInventoryComponent";
import Main from "Main";
import CompositeState from "StateSkeleton/States/CompositeState";
import { CraftItemsProcedure } from "./CraftItemsProcedure";
import { GoHomeProcedure } from "./GoHomeProcedure";
import { GoLoggingProcedure } from "./GoLoggingProcedure";
import { GoMiningProcedure } from "./GoMiningProcedure";
import { GoUseChestsProcedure } from "./GoUseChestsProcedure";
import { UseTablesProcedure } from "./UseTablesProcedure";
const registry = [
    GoLoggingProcedure,
    GoMiningProcedure,
    UseTablesProcedure,
    GoHomeProcedure
];
export class ProgressAgesProcedure extends CompositeState {
    get useTablesProcedure() {
        return this.getSubstate(UseTablesProcedure);
    }
    get craftItemsProcedure() {
        return this.useTablesProcedure.getSubstate(CraftItemsProcedure);
    }
    setCanGoHome(canGoHome) {
        this.canGoHome = canGoHome;
    }
    setCanSmelt(canSmelt) {
        this.canSmelt = canSmelt;
    }
    setCanRandomSearch(canSearch) {
        this.canRandomSearch = canSearch;
    }
    setMaxFeatureDistanceFromPlayer(distance) {
        this.maxFeatureDistanceFromPlayer = distance;
    }
    setHomeOrTablesInterval(interval) {
        this.homeOrTablesInterval = interval ?? ProgressAgesProcedureData.DefaultGoHomeOrTablesInterval;
    }
    onEnter(memory) {
        if (memory) this.restoreMemory(memory);
        this.currentAge = EntityStore.get(this.context.entity, "currentAge");
        this.previousAge = EntityStore.get(this.context.entity, "previousAge");
        this.lastInventoryCheckTick = Main.currentTick;
        if (this.currentFeatureType !== null) {
            this.setSubstateForFeatureType(this.currentFeatureType);
            return;
        }
        this.tryAdvanceToNextAge();
        this.tryGoHomeOrUseTables();
    }
    setCurrentAge(age) {
        this.previousAge = this.currentAge;
        EntityStore.set(this.context.entity, "previousAge", this.previousAge);
        this.currentAge = age;
        EntityStore.set(this.context.entity, "currentAge", age);
        this.craftItemsProcedure.clearQueue();
        this.queueMissingItemsForCurrentAge();
        this.forceGoHomeOrTables = true;
    }
    restoreMemory(memory) {
        if (memory.currentFeatureType !== undefined) {
            this.currentFeatureType = memory.currentFeatureType;
        }
        if (memory.lastHomeOrTablesCheckTick !== undefined) {
            this.lastHomeOrTablesCheckTick = memory.lastHomeOrTablesCheckTick;
        }
        if (memory.currentEvergreenTarget !== undefined) {
            this.currentEvergreenTarget = memory.currentEvergreenTarget;
        }
        if (memory.forceGoHomeOrTables !== undefined) {
            this.forceGoHomeOrTables = memory.forceGoHomeOrTables;
        }
    }
    createMemory() {
        return {
            currentFeatureType: this.currentFeatureType,
            lastHomeOrTablesCheckTick: this.lastHomeOrTablesCheckTick,
            currentEvergreenTarget: this.currentEvergreenTarget,
            forceGoHomeOrTables: this.forceGoHomeOrTables
        };
    }
    onActiveTick() {
        if (Main.currentTick - this.lastInventoryCheckTick < ProgressAgesProcedureData.InventoryCheckInterval) return;
        this.lastInventoryCheckTick = Main.currentTick;
        const hasChangedCraftingQueue = this.removeQueuedItemsAlreadyOwned();
        if (hasChangedCraftingQueue) {
            if (this.tryAdvanceToNextAge()) {
                this.craftItemsProcedure.clearQueue();
                this.tryGoHomeOrUseTables();
                return;
            }
        }
        if (this.downgradeAgeIfNecessary()) {
            this.craftItemsProcedure.clearQueue();
            this.tryGoHomeOrUseTables();
        } else {
            this.queuePickaxeIfMissing();
        }
    }
    removeQueuedItemsAlreadyOwned() {
        if (this.isInEvergreenAge()) return false;
        let hasRemovedItems = false;
        const craftItemsProcedure = this.craftItemsProcedure;
        const activeItemId = craftItemsProcedure.isActive ? craftItemsProcedure.itemQueue[0]?.id : null;
        const virtualInventory = VirtualInventoryComponent.get(this.context.entity);
        const bestGear = InventoryHelper.getBestGearInInventory(this.context.entity);
        for (const craft of [
            ...craftItemsProcedure.itemQueue
        ]){
            const id = craft.id;
            if (id === activeItemId) continue;
            if (this.hasBetterGear(id, bestGear)) {
                craftItemsProcedure.removeItemFromQueue(id, 1);
                hasRemovedItems = true;
                continue;
            }
            const count = virtualInventory.countItemType(id);
            const queueCount = craft.remainingCrafts * (CraftingHelper.getRecipeForResult(id)?.result?.amount ?? 1);
            if (count < queueCount) continue;
            craftItemsProcedure.removeItemFromQueue(id, count);
            hasRemovedItems = true;
        }
        return hasRemovedItems;
    }
    onSubstateComplete(state) {
        if (state.is(GoHomeProcedure)) {
            this.tryUseTables();
            return;
        }
        const timeSinceHomeOrTables = Main.currentTick - this.lastHomeOrTablesCheckTick;
        const isNotAtHomeOrTables = state.is(GoLoggingProcedure) || state.is(GoMiningProcedure);
        if (isNotAtHomeOrTables && (timeSinceHomeOrTables >= this.homeOrTablesInterval || this.forceGoHomeOrTables)) {
            this.forceGoHomeOrTables = false;
            return this.tryGoHomeOrUseTables();
        }
        if (state.is(GoLoggingProcedure)) {
            // Reenter logging if not enough time has passed
            const loggingSubstate = this.getSubstate(GoLoggingProcedure);
            loggingSubstate.setCanRandomSearch(this.canRandomSearch);
            this.setSubstate(loggingSubstate);
        } else if (state.is(GoMiningProcedure)) {
            // Reenter mining if not enough time has passed
            const miningSubstate = this.getSubstate(GoMiningProcedure);
            miningSubstate.setPrimaryFeatureType(this.currentFeatureType);
            miningSubstate.setCanRandomSearch(this.canRandomSearch);
            miningSubstate.setMaxFeatureDistanceFromPlayer(this.maxFeatureDistanceFromPlayer);
            this.setSubstate(miningSubstate);
        } else if (state.is(UseTablesProcedure)) {
            // After using tables, see if it can advance to the next age
            this.tryAdvanceToNextAge();
            //Try crafting again
            this.tryUseTables();
        }
    }
    tryAdvanceToNextAge() {
        if (this.isInEvergreenAge() && this.craftItemsProcedure.itemQueue.length === 0) {
            this.currentEvergreenTarget = null;
            return true;
        }
        const currentAgeIndex = AgesData.AgePriorities.indexOf(this.currentAge);
        if (!this.hasCompletedAgeRequirements(this.currentAge)) return false;
        if (this.isPreviousAgeHigherThanCurrent()) {
            this.setCurrentAge(this.previousAge);
            return true;
        }
        if (currentAgeIndex < AgesData.AgePriorities.length - 1) {
            this.setCurrentAge(AgesData.AgePriorities[currentAgeIndex + 1]);
            return true;
        }
        return false;
    }
    isPreviousAgeHigherThanCurrent() {
        if (this.previousAge === null) return false;
        const currentAgeIndex = AgesData.AgePriorities.indexOf(this.currentAge);
        const previousAgeIndex = AgesData.AgePriorities.indexOf(this.previousAge);
        return previousAgeIndex > currentAgeIndex;
    }
    hasCompletedAgeRequirements(age) {
        if (this.isInEvergreenAge()) return false;
        const currentAgeRequirements = this.getAgeRequirements(age);
        const virtualInventory = VirtualInventoryComponent.get(this.context.entity);
        const hasAllItems = currentAgeRequirements.every((item)=>virtualInventory.countItemType(item.id) >= item.amount);
        if (hasAllItems) return true;
        //If it doesn't have the exact items, but has better items, consider it complete
        const bestGear = InventoryHelper.getBestGearInInventory(this.context.entity);
        for (const item of currentAgeRequirements){
            if (!this.hasBetterGear(item.id, bestGear)) return false;
        }
        return true;
    }
    downgradeAgeIfNecessary() {
        //Prevent downgrading while dumping old gear in chests
        if (this.hasActiveSubstateOfType(GoUseChestsProcedure)) return false;
        const currentAgeIndex = AgesData.AgePriorities.indexOf(this.currentAge);
        if (this.shouldForceTorchAge(currentAgeIndex)) {
            this.setCurrentAge("torch");
            return true;
        }
        return this.downgradeToHighestUnfulfilledAge(currentAgeIndex);
    }
    shouldForceTorchAge(currentAgeIndex) {
        const torchAgeIndex = AgesData.AgePriorities.indexOf("torch");
        if (currentAgeIndex <= torchAgeIndex) return false;
        return !this.hasAnyAgeItem("torch");
    }
    downgradeToHighestUnfulfilledAge(currentAgeIndex) {
        let highestAgeWithItems = -1;
        for(let i = AgesData.AgePriorities.length - 1; i >= 0; i--){
            const age = AgesData.AgePriorities[i];
            const hasAnyItem = this.hasAnyAgeItem(age);
            if (hasAnyItem) {
                highestAgeWithItems = i;
                break;
            }
        }
        const targetAgeIndex = Math.min(currentAgeIndex, highestAgeWithItems + 1);
        if (targetAgeIndex === currentAgeIndex) return false;
        this.setCurrentAge(AgesData.AgePriorities[targetAgeIndex]);
        return true;
    }
    hasAnyAgeItem(age) {
        const virtualInventory = VirtualInventoryComponent.get(this.context.entity);
        const currentAgeRequirements = this.getAgeRequirements(age);
        return currentAgeRequirements.some((item)=>virtualInventory.hasItemType(item.id));
    }
    queuePickaxeIfMissing() {
        if (!this.currentFeatureType) return;
        const hasPickaxe = InventoryHelper.hasPickaxeForFeature(this.context.entity, this.currentFeatureType);
        if (hasPickaxe) return;
        const requiredPickaxe = InventoryData.FeatureTypeToRequiredPickaxe[this.currentFeatureType];
        if (!requiredPickaxe) return;
        if (this.craftItemsProcedure.hasItemInQueue(requiredPickaxe)) return;
        this.craftItemsProcedure.prependItemToQueue(requiredPickaxe);
        const useTables = this.getSubstate(UseTablesProcedure);
        useTables.setCanSmelt(this.canSmelt);
        this.setSubstate(useTables);
    }
    tryGoHomeOrUseTables() {
        this.currentFeatureType = null;
        this.lastHomeOrTablesCheckTick = Main.currentTick;
        if (this.canGoHome) {
            this.tryGoHome();
        } else {
            this.tryUseTables();
        }
    }
    tryGoHome() {
        this.setSubstate(this.getSubstate(GoHomeProcedure));
    }
    tryUseTables() {
        this.queueMissingItemsForCurrentAge();
        if (this.craftItemsProcedure.itemQueue.length === 0) return this.broadcastSignal("onFailure");
        const useTables = this.getSubstate(UseTablesProcedure);
        useTables.setCanSmelt(this.canSmelt);
        this.setSubstate(useTables);
    }
    queueMissingItemsForCurrentAge() {
        const isEvergreen = this.isInEvergreenAge();
        const currentAgeRequirements = this.getAgeRequirements(this.currentAge);
        const virtualInventory = VirtualInventoryComponent.get(this.context.entity);
        const bestGear = InventoryHelper.getBestGearInInventory(this.context.entity);
        for (const item of currentAgeRequirements){
            const currentCount = virtualInventory.countItemType(item.id);
            if (this.craftItemsProcedure.hasItemInQueue(item.id)) continue;
            if (!isEvergreen && currentCount >= item.amount) continue;
            if (!isEvergreen && this.hasBetterGear(item.id, bestGear)) continue;
            const queueAmount = isEvergreen ? item.amount : item.amount - currentCount;
            this.craftItemsProcedure.addItemToQueue(item.id, queueAmount);
        }
    }
    hasBetterGear(itemId, bestGear) {
        if (!InventoryHelper.isGear(itemId)) return false;
        const itemStack = new ItemStack(itemId, 1);
        return InventoryHelper.isBetterGear(itemStack, bestGear) === false;
    }
    getAgeRequirements(age) {
        if (age !== "evergreen") return AgesData.AgeRequirementsMap[age] ?? [];
        if (this.currentEvergreenTarget) return [
            this.currentEvergreenTarget
        ];
        const randomIndex = Math.floor(Math.random() * AgesData.EvergreenAgeOptions.length);
        this.currentEvergreenTarget = AgesData.EvergreenAgeOptions[randomIndex];
        return [
            AgesData.EvergreenAgeOptions[randomIndex]
        ];
    }
    isInEvergreenAge() {
        return this.currentAge === "evergreen";
    }
    onSubstateFailure(state) {
        if (state.is(GoHomeProcedure)) {
            this.tryUseTables();
            return;
        }
        if (state.is(UseTablesProcedure)) {
            const missingIngredient = state.missingIngredient;
            if (missingIngredient) {
                const featureType = ProgressAgesProcedureData.IngredientToFeatureType[missingIngredient.id];
                this.currentFeatureType = featureType;
                this.setSubstateForFeatureType(featureType);
                return;
            }
        }
        this.currentFeatureType = null;
        this.setSubstate(null);
        this.broadcastSignal("onFailure");
    }
    setSubstateForFeatureType(featureType) {
        if (featureType === "tree") {
            const loggingSubstate = this.getSubstate(GoLoggingProcedure);
            loggingSubstate.setCanRandomSearch(this.canRandomSearch);
            loggingSubstate.setMaxFeatureDistanceFromPlayer(this.maxFeatureDistanceFromPlayer);
            this.setSubstate(loggingSubstate);
        } else {
            const miningSubstate = this.getSubstate(GoMiningProcedure);
            miningSubstate.setPrimaryFeatureType(featureType);
            miningSubstate.setCanRandomSearch(this.canRandomSearch);
            miningSubstate.setMaxFeatureDistanceFromPlayer(this.maxFeatureDistanceFromPlayer);
            this.setSubstate(miningSubstate);
        }
    }
    constructor(...args){
        super(...args);
        this.currentAge = "wood";
        this.previousAge = null;
        this.currentFeatureType = null;
        this.lastInventoryCheckTick = 0;
        this.lastHomeOrTablesCheckTick = 0;
        this.canGoHome = true;
        this.canSmelt = true;
        this.canRandomSearch = true;
        this.maxFeatureDistanceFromPlayer = null;
        this.homeOrTablesInterval = ProgressAgesProcedureData.DefaultGoHomeOrTablesInterval;
        this.forceGoHomeOrTables = false;
        this.currentEvergreenTarget = null;
    }
}
ProgressAgesProcedure.definition = {
    identifier: "procedure:progress_ages",
    priority: ProgressAgesProcedureData.Priority,
    registry,
    initialState: null
};

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIlByb2dyZXNzQWdlc1Byb2NlZHVyZS50cyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBJdGVtU3RhY2sgfSBmcm9tIFwiQG1pbmVjcmFmdC9zZXJ2ZXJcIjtcclxuaW1wb3J0IEFnZXNEYXRhLCB7IEFnZSB9IGZyb20gXCJEYXRhL0FnZXNEYXRhXCI7XHJcbmltcG9ydCBQcm9ncmVzc0FnZXNQcm9jZWR1cmVEYXRhIGZyb20gXCJEYXRhL0JpZ0JyYWluL1Byb2NlZHVyZXMvUHJvZ3Jlc3NBZ2VzUHJvY2VkdXJlRGF0YVwiO1xyXG5pbXBvcnQgeyBJbnZlbnRvcnlEYXRhIH0gZnJvbSBcIkRhdGEvSW52ZW50b3J5RGF0YVwiO1xyXG5pbXBvcnQgeyBGZWF0dXJlSWRlbnRpZmllciB9IGZyb20gXCJGZWF0dXJlQ2FjaGUvVHlwZXNcIjtcclxuaW1wb3J0IENyYWZ0aW5nSGVscGVyIGZyb20gXCJIZWxwZXJzL0NyYWZ0aW5nSGVscGVyXCI7XHJcbmltcG9ydCBJbnZlbnRvcnlIZWxwZXIgZnJvbSBcIkludmVudG9yeS9JbnZlbnRvcnlIZWxwZXJcIjtcclxuaW1wb3J0IHsgVGllcmVkSXRlbVNsb3REYXRhIH0gZnJvbSBcIkludmVudG9yeS9UeXBlc1wiO1xyXG5pbXBvcnQgVmlydHVhbEludmVudG9yeUNvbXBvbmVudCBmcm9tIFwiSW52ZW50b3J5L1ZpcnR1YWxJbnZlbnRvcnlDb21wb25lbnRcIjtcclxuaW1wb3J0IE1haW4gZnJvbSBcIk1haW5cIjtcclxuaW1wb3J0IEFic3RyYWN0U3RhdGUgZnJvbSBcIlN0YXRlU2tlbGV0b24vU3RhdGVzL0Fic3RyYWN0U3RhdGVcIjtcclxuaW1wb3J0IENvbXBvc2l0ZVN0YXRlIGZyb20gXCJTdGF0ZVNrZWxldG9uL1N0YXRlcy9Db21wb3NpdGVTdGF0ZVwiO1xyXG5pbXBvcnQgeyBDb21wb3NpdGVTdGF0ZURlZmluaXRpb24sIFN0YXRlTWVtb3J5IH0gZnJvbSBcIlN0YXRlU2tlbGV0b24vVHlwZXNcIjtcclxuaW1wb3J0IHsgQ3JhZnRJdGVtc1Byb2NlZHVyZSB9IGZyb20gXCIuL0NyYWZ0SXRlbXNQcm9jZWR1cmVcIjtcclxuaW1wb3J0IHsgR29Ib21lUHJvY2VkdXJlIH0gZnJvbSBcIi4vR29Ib21lUHJvY2VkdXJlXCI7XHJcbmltcG9ydCB7IEdvTG9nZ2luZ1Byb2NlZHVyZSB9IGZyb20gXCIuL0dvTG9nZ2luZ1Byb2NlZHVyZVwiO1xyXG5pbXBvcnQgeyBHb01pbmluZ1Byb2NlZHVyZSB9IGZyb20gXCIuL0dvTWluaW5nUHJvY2VkdXJlXCI7XHJcbmltcG9ydCB7IEdvVXNlQ2hlc3RzUHJvY2VkdXJlIH0gZnJvbSBcIi4vR29Vc2VDaGVzdHNQcm9jZWR1cmVcIjtcclxuaW1wb3J0IHsgVXNlVGFibGVzUHJvY2VkdXJlIH0gZnJvbSBcIi4vVXNlVGFibGVzUHJvY2VkdXJlXCI7XHJcblxyXG5pbnRlcmZhY2UgTWVtb3J5IGV4dGVuZHMgU3RhdGVNZW1vcnkge1xyXG4gICAgY3VycmVudEZlYXR1cmVUeXBlOiBGZWF0dXJlSWRlbnRpZmllciB8IG51bGw7XHJcbiAgICBsYXN0SG9tZU9yVGFibGVzQ2hlY2tUaWNrOiBudW1iZXI7XHJcbiAgICBjdXJyZW50RXZlcmdyZWVuVGFyZ2V0OiB7IGlkOiBzdHJpbmc7IGFtb3VudDogbnVtYmVyIH0gfCBudWxsO1xyXG4gICAgZm9yY2VHb0hvbWVPclRhYmxlczogYm9vbGVhbjtcclxufVxyXG5cclxuY29uc3QgcmVnaXN0cnkgPSBbR29Mb2dnaW5nUHJvY2VkdXJlLCBHb01pbmluZ1Byb2NlZHVyZSwgVXNlVGFibGVzUHJvY2VkdXJlLCBHb0hvbWVQcm9jZWR1cmVdIGFzIGNvbnN0O1xyXG5cclxuZXhwb3J0IGNsYXNzIFByb2dyZXNzQWdlc1Byb2NlZHVyZSBleHRlbmRzIENvbXBvc2l0ZVN0YXRlPHR5cGVvZiByZWdpc3RyeT4ge1xyXG4gICAgcHVibGljIHN0YXRpYyByZWFkb25seSBkZWZpbml0aW9uOiBDb21wb3NpdGVTdGF0ZURlZmluaXRpb248dHlwZW9mIHJlZ2lzdHJ5PiA9IHtcclxuICAgICAgICBpZGVudGlmaWVyOiBcInByb2NlZHVyZTpwcm9ncmVzc19hZ2VzXCIsXHJcbiAgICAgICAgcHJpb3JpdHk6IFByb2dyZXNzQWdlc1Byb2NlZHVyZURhdGEuUHJpb3JpdHksXHJcbiAgICAgICAgcmVnaXN0cnksXHJcbiAgICAgICAgaW5pdGlhbFN0YXRlOiBudWxsLFxyXG4gICAgfTtcclxuXHJcbiAgICBwdWJsaWMgY3VycmVudEFnZTogQWdlID0gXCJ3b29kXCI7XHJcbiAgICBwcml2YXRlIHByZXZpb3VzQWdlOiBBZ2UgfCBudWxsID0gbnVsbDtcclxuICAgIHByaXZhdGUgY3VycmVudEZlYXR1cmVUeXBlOiBGZWF0dXJlSWRlbnRpZmllciB8IG51bGwgPSBudWxsO1xyXG4gICAgcHJpdmF0ZSBsYXN0SW52ZW50b3J5Q2hlY2tUaWNrID0gMDtcclxuICAgIHByaXZhdGUgbGFzdEhvbWVPclRhYmxlc0NoZWNrVGljayA9IDA7XHJcbiAgICBwcml2YXRlIGNhbkdvSG9tZTogYm9vbGVhbiA9IHRydWU7XHJcbiAgICBwcml2YXRlIGNhblNtZWx0OiBib29sZWFuID0gdHJ1ZTtcclxuICAgIHByaXZhdGUgY2FuUmFuZG9tU2VhcmNoOiBib29sZWFuID0gdHJ1ZTtcclxuICAgIHByaXZhdGUgbWF4RmVhdHVyZURpc3RhbmNlRnJvbVBsYXllcjogbnVtYmVyIHwgbnVsbCA9IG51bGw7XHJcbiAgICBwcml2YXRlIGhvbWVPclRhYmxlc0ludGVydmFsOiBudW1iZXIgPSBQcm9ncmVzc0FnZXNQcm9jZWR1cmVEYXRhLkRlZmF1bHRHb0hvbWVPclRhYmxlc0ludGVydmFsO1xyXG4gICAgcHJpdmF0ZSBmb3JjZUdvSG9tZU9yVGFibGVzOiBib29sZWFuID0gZmFsc2U7XHJcbiAgICBwcml2YXRlIGN1cnJlbnRFdmVyZ3JlZW5UYXJnZXQ6IHsgaWQ6IHN0cmluZzsgYW1vdW50OiBudW1iZXIgfSB8IG51bGwgPSBudWxsO1xyXG5cclxuICAgIHB1YmxpYyBnZXQgdXNlVGFibGVzUHJvY2VkdXJlKCk6IFVzZVRhYmxlc1Byb2NlZHVyZSB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0U3Vic3RhdGUoVXNlVGFibGVzUHJvY2VkdXJlKTtcclxuICAgIH1cclxuXHJcbiAgICBwdWJsaWMgZ2V0IGNyYWZ0SXRlbXNQcm9jZWR1cmUoKTogQ3JhZnRJdGVtc1Byb2NlZHVyZSB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMudXNlVGFibGVzUHJvY2VkdXJlLmdldFN1YnN0YXRlKENyYWZ0SXRlbXNQcm9jZWR1cmUpO1xyXG4gICAgfVxyXG5cclxuICAgIHB1YmxpYyBzZXRDYW5Hb0hvbWUoY2FuR29Ib21lOiBib29sZWFuKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5jYW5Hb0hvbWUgPSBjYW5Hb0hvbWU7XHJcbiAgICB9XHJcblxyXG4gICAgcHVibGljIHNldENhblNtZWx0KGNhblNtZWx0OiBib29sZWFuKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5jYW5TbWVsdCA9IGNhblNtZWx0O1xyXG4gICAgfVxyXG5cclxuICAgIHB1YmxpYyBzZXRDYW5SYW5kb21TZWFyY2goY2FuU2VhcmNoOiBib29sZWFuKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5jYW5SYW5kb21TZWFyY2ggPSBjYW5TZWFyY2g7XHJcbiAgICB9XHJcblxyXG4gICAgcHVibGljIHNldE1heEZlYXR1cmVEaXN0YW5jZUZyb21QbGF5ZXIoZGlzdGFuY2U6IG51bWJlciB8IG51bGwpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLm1heEZlYXR1cmVEaXN0YW5jZUZyb21QbGF5ZXIgPSBkaXN0YW5jZTtcclxuICAgIH1cclxuXHJcbiAgICBwdWJsaWMgc2V0SG9tZU9yVGFibGVzSW50ZXJ2YWwoaW50ZXJ2YWw6IG51bWJlciB8IG51bGwpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLmhvbWVPclRhYmxlc0ludGVydmFsID0gaW50ZXJ2YWwgPz8gUHJvZ3Jlc3NBZ2VzUHJvY2VkdXJlRGF0YS5EZWZhdWx0R29Ib21lT3JUYWJsZXNJbnRlcnZhbDtcclxuICAgIH1cclxuXHJcbiAgICBwcm90ZWN0ZWQgb25FbnRlcihtZW1vcnk/OiBTdGF0ZU1lbW9yeSk6IHZvaWQge1xyXG4gICAgICAgIGlmIChtZW1vcnkpIHRoaXMucmVzdG9yZU1lbW9yeShtZW1vcnkgYXMgTWVtb3J5KTtcclxuXHJcbiAgICAgICAgdGhpcy5jdXJyZW50QWdlID0gRW50aXR5U3RvcmUuZ2V0KHRoaXMuY29udGV4dC5lbnRpdHksIFwiY3VycmVudEFnZVwiKTtcclxuICAgICAgICB0aGlzLnByZXZpb3VzQWdlID0gRW50aXR5U3RvcmUuZ2V0KHRoaXMuY29udGV4dC5lbnRpdHksIFwicHJldmlvdXNBZ2VcIik7XHJcblxyXG4gICAgICAgIHRoaXMubGFzdEludmVudG9yeUNoZWNrVGljayA9IE1haW4uY3VycmVudFRpY2s7XHJcblxyXG4gICAgICAgIGlmICh0aGlzLmN1cnJlbnRGZWF0dXJlVHlwZSAhPT0gbnVsbCkge1xyXG4gICAgICAgICAgICB0aGlzLnNldFN1YnN0YXRlRm9yRmVhdHVyZVR5cGUodGhpcy5jdXJyZW50RmVhdHVyZVR5cGUpO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB0aGlzLnRyeUFkdmFuY2VUb05leHRBZ2UoKTtcclxuICAgICAgICB0aGlzLnRyeUdvSG9tZU9yVXNlVGFibGVzKCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHVibGljIHNldEN1cnJlbnRBZ2UoYWdlOiBBZ2UpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLnByZXZpb3VzQWdlID0gdGhpcy5jdXJyZW50QWdlO1xyXG4gICAgICAgIEVudGl0eVN0b3JlLnNldCh0aGlzLmNvbnRleHQuZW50aXR5LCBcInByZXZpb3VzQWdlXCIsIHRoaXMucHJldmlvdXNBZ2UpO1xyXG5cclxuICAgICAgICB0aGlzLmN1cnJlbnRBZ2UgPSBhZ2U7XHJcbiAgICAgICAgRW50aXR5U3RvcmUuc2V0KHRoaXMuY29udGV4dC5lbnRpdHksIFwiY3VycmVudEFnZVwiLCBhZ2UpO1xyXG5cclxuICAgICAgICB0aGlzLmNyYWZ0SXRlbXNQcm9jZWR1cmUuY2xlYXJRdWV1ZSgpO1xyXG4gICAgICAgIHRoaXMucXVldWVNaXNzaW5nSXRlbXNGb3JDdXJyZW50QWdlKCk7XHJcbiAgICAgICAgdGhpcy5mb3JjZUdvSG9tZU9yVGFibGVzID0gdHJ1ZTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHJlc3RvcmVNZW1vcnkobWVtb3J5OiBNZW1vcnkpOiB2b2lkIHtcclxuICAgICAgICBpZiAobWVtb3J5LmN1cnJlbnRGZWF0dXJlVHlwZSAhPT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgICAgIHRoaXMuY3VycmVudEZlYXR1cmVUeXBlID0gbWVtb3J5LmN1cnJlbnRGZWF0dXJlVHlwZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKG1lbW9yeS5sYXN0SG9tZU9yVGFibGVzQ2hlY2tUaWNrICE9PSB1bmRlZmluZWQpIHtcclxuICAgICAgICAgICAgdGhpcy5sYXN0SG9tZU9yVGFibGVzQ2hlY2tUaWNrID0gbWVtb3J5Lmxhc3RIb21lT3JUYWJsZXNDaGVja1RpY2s7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmIChtZW1vcnkuY3VycmVudEV2ZXJncmVlblRhcmdldCAhPT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgICAgIHRoaXMuY3VycmVudEV2ZXJncmVlblRhcmdldCA9IG1lbW9yeS5jdXJyZW50RXZlcmdyZWVuVGFyZ2V0O1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAobWVtb3J5LmZvcmNlR29Ib21lT3JUYWJsZXMgIT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgICAgICB0aGlzLmZvcmNlR29Ib21lT3JUYWJsZXMgPSBtZW1vcnkuZm9yY2VHb0hvbWVPclRhYmxlcztcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJvdGVjdGVkIG92ZXJyaWRlIGNyZWF0ZU1lbW9yeSgpOiBNZW1vcnkge1xyXG4gICAgICAgIHJldHVybiB7XHJcbiAgICAgICAgICAgIGN1cnJlbnRGZWF0dXJlVHlwZTogdGhpcy5jdXJyZW50RmVhdHVyZVR5cGUsXHJcbiAgICAgICAgICAgIGxhc3RIb21lT3JUYWJsZXNDaGVja1RpY2s6IHRoaXMubGFzdEhvbWVPclRhYmxlc0NoZWNrVGljayxcclxuICAgICAgICAgICAgY3VycmVudEV2ZXJncmVlblRhcmdldDogdGhpcy5jdXJyZW50RXZlcmdyZWVuVGFyZ2V0LFxyXG4gICAgICAgICAgICBmb3JjZUdvSG9tZU9yVGFibGVzOiB0aGlzLmZvcmNlR29Ib21lT3JUYWJsZXMsXHJcbiAgICAgICAgfTtcclxuICAgIH1cclxuXHJcbiAgICBwcm90ZWN0ZWQgb25BY3RpdmVUaWNrKCk6IHZvaWQge1xyXG4gICAgICAgIGlmIChNYWluLmN1cnJlbnRUaWNrIC0gdGhpcy5sYXN0SW52ZW50b3J5Q2hlY2tUaWNrIDwgUHJvZ3Jlc3NBZ2VzUHJvY2VkdXJlRGF0YS5JbnZlbnRvcnlDaGVja0ludGVydmFsKSByZXR1cm47XHJcbiAgICAgICAgdGhpcy5sYXN0SW52ZW50b3J5Q2hlY2tUaWNrID0gTWFpbi5jdXJyZW50VGljaztcclxuXHJcbiAgICAgICAgY29uc3QgaGFzQ2hhbmdlZENyYWZ0aW5nUXVldWUgPSB0aGlzLnJlbW92ZVF1ZXVlZEl0ZW1zQWxyZWFkeU93bmVkKCk7XHJcbiAgICAgICAgaWYgKGhhc0NoYW5nZWRDcmFmdGluZ1F1ZXVlKSB7XHJcbiAgICAgICAgICAgIGlmICh0aGlzLnRyeUFkdmFuY2VUb05leHRBZ2UoKSkge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5jcmFmdEl0ZW1zUHJvY2VkdXJlLmNsZWFyUXVldWUoKTtcclxuICAgICAgICAgICAgICAgIHRoaXMudHJ5R29Ib21lT3JVc2VUYWJsZXMoKTtcclxuICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgaWYgKHRoaXMuZG93bmdyYWRlQWdlSWZOZWNlc3NhcnkoKSkge1xyXG4gICAgICAgICAgICB0aGlzLmNyYWZ0SXRlbXNQcm9jZWR1cmUuY2xlYXJRdWV1ZSgpO1xyXG4gICAgICAgICAgICB0aGlzLnRyeUdvSG9tZU9yVXNlVGFibGVzKCk7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgdGhpcy5xdWV1ZVBpY2theGVJZk1pc3NpbmcoKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSByZW1vdmVRdWV1ZWRJdGVtc0FscmVhZHlPd25lZCgpOiBib29sZWFuIHtcclxuICAgICAgICBpZiAodGhpcy5pc0luRXZlcmdyZWVuQWdlKCkpIHJldHVybiBmYWxzZTtcclxuXHJcbiAgICAgICAgbGV0IGhhc1JlbW92ZWRJdGVtcyA9IGZhbHNlO1xyXG4gICAgICAgIGNvbnN0IGNyYWZ0SXRlbXNQcm9jZWR1cmUgPSB0aGlzLmNyYWZ0SXRlbXNQcm9jZWR1cmU7XHJcbiAgICAgICAgY29uc3QgYWN0aXZlSXRlbUlkID0gY3JhZnRJdGVtc1Byb2NlZHVyZS5pc0FjdGl2ZSA/IGNyYWZ0SXRlbXNQcm9jZWR1cmUuaXRlbVF1ZXVlWzBdPy5pZCA6IG51bGw7XHJcbiAgICAgICAgY29uc3QgdmlydHVhbEludmVudG9yeSA9IFZpcnR1YWxJbnZlbnRvcnlDb21wb25lbnQuZ2V0KHRoaXMuY29udGV4dC5lbnRpdHkpO1xyXG4gICAgICAgIGNvbnN0IGJlc3RHZWFyID0gSW52ZW50b3J5SGVscGVyLmdldEJlc3RHZWFySW5JbnZlbnRvcnkodGhpcy5jb250ZXh0LmVudGl0eSk7XHJcblxyXG4gICAgICAgIGZvciAoY29uc3QgY3JhZnQgb2YgWy4uLmNyYWZ0SXRlbXNQcm9jZWR1cmUuaXRlbVF1ZXVlXSkge1xyXG4gICAgICAgICAgICBjb25zdCBpZCA9IGNyYWZ0LmlkO1xyXG4gICAgICAgICAgICBpZiAoaWQgPT09IGFjdGl2ZUl0ZW1JZCkgY29udGludWU7XHJcblxyXG4gICAgICAgICAgICBpZiAodGhpcy5oYXNCZXR0ZXJHZWFyKGlkLCBiZXN0R2VhcikpIHtcclxuICAgICAgICAgICAgICAgIGNyYWZ0SXRlbXNQcm9jZWR1cmUucmVtb3ZlSXRlbUZyb21RdWV1ZShpZCwgMSk7XHJcbiAgICAgICAgICAgICAgICBoYXNSZW1vdmVkSXRlbXMgPSB0cnVlO1xyXG4gICAgICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIGNvbnN0IGNvdW50ID0gdmlydHVhbEludmVudG9yeS5jb3VudEl0ZW1UeXBlKGlkKTtcclxuICAgICAgICAgICAgY29uc3QgcXVldWVDb3VudCA9IGNyYWZ0LnJlbWFpbmluZ0NyYWZ0cyAqIChDcmFmdGluZ0hlbHBlci5nZXRSZWNpcGVGb3JSZXN1bHQoaWQpPy5yZXN1bHQ/LmFtb3VudCA/PyAxKTtcclxuICAgICAgICAgICAgaWYgKGNvdW50IDwgcXVldWVDb3VudCkgY29udGludWU7XHJcblxyXG4gICAgICAgICAgICBjcmFmdEl0ZW1zUHJvY2VkdXJlLnJlbW92ZUl0ZW1Gcm9tUXVldWUoaWQsIGNvdW50KTtcclxuICAgICAgICAgICAgaGFzUmVtb3ZlZEl0ZW1zID0gdHJ1ZTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHJldHVybiBoYXNSZW1vdmVkSXRlbXM7XHJcbiAgICB9XHJcblxyXG4gICAgcHJvdGVjdGVkIG9uU3Vic3RhdGVDb21wbGV0ZShzdGF0ZTogQWJzdHJhY3RTdGF0ZSk6IHZvaWQge1xyXG4gICAgICAgIGlmIChzdGF0ZS5pcyhHb0hvbWVQcm9jZWR1cmUpKSB7XHJcbiAgICAgICAgICAgIHRoaXMudHJ5VXNlVGFibGVzKCk7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGNvbnN0IHRpbWVTaW5jZUhvbWVPclRhYmxlcyA9IE1haW4uY3VycmVudFRpY2sgLSB0aGlzLmxhc3RIb21lT3JUYWJsZXNDaGVja1RpY2s7XHJcbiAgICAgICAgY29uc3QgaXNOb3RBdEhvbWVPclRhYmxlcyA9IHN0YXRlLmlzKEdvTG9nZ2luZ1Byb2NlZHVyZSkgfHwgc3RhdGUuaXMoR29NaW5pbmdQcm9jZWR1cmUpO1xyXG4gICAgICAgIGlmIChpc05vdEF0SG9tZU9yVGFibGVzICYmICh0aW1lU2luY2VIb21lT3JUYWJsZXMgPj0gdGhpcy5ob21lT3JUYWJsZXNJbnRlcnZhbCB8fCB0aGlzLmZvcmNlR29Ib21lT3JUYWJsZXMpKSB7XHJcbiAgICAgICAgICAgIHRoaXMuZm9yY2VHb0hvbWVPclRhYmxlcyA9IGZhbHNlO1xyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy50cnlHb0hvbWVPclVzZVRhYmxlcygpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgaWYgKHN0YXRlLmlzKEdvTG9nZ2luZ1Byb2NlZHVyZSkpIHtcclxuICAgICAgICAgICAgLy8gUmVlbnRlciBsb2dnaW5nIGlmIG5vdCBlbm91Z2ggdGltZSBoYXMgcGFzc2VkXHJcbiAgICAgICAgICAgIGNvbnN0IGxvZ2dpbmdTdWJzdGF0ZSA9IHRoaXMuZ2V0U3Vic3RhdGUoR29Mb2dnaW5nUHJvY2VkdXJlKTtcclxuICAgICAgICAgICAgbG9nZ2luZ1N1YnN0YXRlLnNldENhblJhbmRvbVNlYXJjaCh0aGlzLmNhblJhbmRvbVNlYXJjaCk7XHJcbiAgICAgICAgICAgIHRoaXMuc2V0U3Vic3RhdGUobG9nZ2luZ1N1YnN0YXRlKTtcclxuICAgICAgICB9IGVsc2UgaWYgKHN0YXRlLmlzKEdvTWluaW5nUHJvY2VkdXJlKSkge1xyXG4gICAgICAgICAgICAvLyBSZWVudGVyIG1pbmluZyBpZiBub3QgZW5vdWdoIHRpbWUgaGFzIHBhc3NlZFxyXG4gICAgICAgICAgICBjb25zdCBtaW5pbmdTdWJzdGF0ZSA9IHRoaXMuZ2V0U3Vic3RhdGUoR29NaW5pbmdQcm9jZWR1cmUpO1xyXG4gICAgICAgICAgICBtaW5pbmdTdWJzdGF0ZS5zZXRQcmltYXJ5RmVhdHVyZVR5cGUodGhpcy5jdXJyZW50RmVhdHVyZVR5cGUhKTtcclxuICAgICAgICAgICAgbWluaW5nU3Vic3RhdGUuc2V0Q2FuUmFuZG9tU2VhcmNoKHRoaXMuY2FuUmFuZG9tU2VhcmNoKTtcclxuICAgICAgICAgICAgbWluaW5nU3Vic3RhdGUuc2V0TWF4RmVhdHVyZURpc3RhbmNlRnJvbVBsYXllcih0aGlzLm1heEZlYXR1cmVEaXN0YW5jZUZyb21QbGF5ZXIpO1xyXG4gICAgICAgICAgICB0aGlzLnNldFN1YnN0YXRlKG1pbmluZ1N1YnN0YXRlKTtcclxuICAgICAgICB9IGVsc2UgaWYgKHN0YXRlLmlzKFVzZVRhYmxlc1Byb2NlZHVyZSkpIHtcclxuICAgICAgICAgICAgLy8gQWZ0ZXIgdXNpbmcgdGFibGVzLCBzZWUgaWYgaXQgY2FuIGFkdmFuY2UgdG8gdGhlIG5leHQgYWdlXHJcbiAgICAgICAgICAgIHRoaXMudHJ5QWR2YW5jZVRvTmV4dEFnZSgpO1xyXG4gICAgICAgICAgICAvL1RyeSBjcmFmdGluZyBhZ2FpblxyXG4gICAgICAgICAgICB0aGlzLnRyeVVzZVRhYmxlcygpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHRyeUFkdmFuY2VUb05leHRBZ2UoKTogYm9vbGVhbiB7XHJcbiAgICAgICAgaWYgKHRoaXMuaXNJbkV2ZXJncmVlbkFnZSgpICYmIHRoaXMuY3JhZnRJdGVtc1Byb2NlZHVyZS5pdGVtUXVldWUubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgICAgICAgIHRoaXMuY3VycmVudEV2ZXJncmVlblRhcmdldCA9IG51bGw7XHJcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc3QgY3VycmVudEFnZUluZGV4ID0gQWdlc0RhdGEuQWdlUHJpb3JpdGllcy5pbmRleE9mKHRoaXMuY3VycmVudEFnZSk7XHJcbiAgICAgICAgaWYgKCF0aGlzLmhhc0NvbXBsZXRlZEFnZVJlcXVpcmVtZW50cyh0aGlzLmN1cnJlbnRBZ2UpKSByZXR1cm4gZmFsc2U7XHJcblxyXG4gICAgICAgIGlmICh0aGlzLmlzUHJldmlvdXNBZ2VIaWdoZXJUaGFuQ3VycmVudCgpKSB7XHJcbiAgICAgICAgICAgIHRoaXMuc2V0Q3VycmVudEFnZSh0aGlzLnByZXZpb3VzQWdlISk7XHJcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgaWYgKGN1cnJlbnRBZ2VJbmRleCA8IEFnZXNEYXRhLkFnZVByaW9yaXRpZXMubGVuZ3RoIC0gMSkge1xyXG4gICAgICAgICAgICB0aGlzLnNldEN1cnJlbnRBZ2UoQWdlc0RhdGEuQWdlUHJpb3JpdGllc1tjdXJyZW50QWdlSW5kZXggKyAxXSk7XHJcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgaXNQcmV2aW91c0FnZUhpZ2hlclRoYW5DdXJyZW50KCk6IGJvb2xlYW4ge1xyXG4gICAgICAgIGlmICh0aGlzLnByZXZpb3VzQWdlID09PSBudWxsKSByZXR1cm4gZmFsc2U7XHJcblxyXG4gICAgICAgIGNvbnN0IGN1cnJlbnRBZ2VJbmRleCA9IEFnZXNEYXRhLkFnZVByaW9yaXRpZXMuaW5kZXhPZih0aGlzLmN1cnJlbnRBZ2UpO1xyXG4gICAgICAgIGNvbnN0IHByZXZpb3VzQWdlSW5kZXggPSBBZ2VzRGF0YS5BZ2VQcmlvcml0aWVzLmluZGV4T2YodGhpcy5wcmV2aW91c0FnZSk7XHJcbiAgICAgICAgcmV0dXJuIHByZXZpb3VzQWdlSW5kZXggPiBjdXJyZW50QWdlSW5kZXg7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBoYXNDb21wbGV0ZWRBZ2VSZXF1aXJlbWVudHMoYWdlOiBBZ2UpOiBib29sZWFuIHtcclxuICAgICAgICBpZiAodGhpcy5pc0luRXZlcmdyZWVuQWdlKCkpIHJldHVybiBmYWxzZTtcclxuXHJcbiAgICAgICAgY29uc3QgY3VycmVudEFnZVJlcXVpcmVtZW50cyA9IHRoaXMuZ2V0QWdlUmVxdWlyZW1lbnRzKGFnZSk7XHJcbiAgICAgICAgY29uc3QgdmlydHVhbEludmVudG9yeSA9IFZpcnR1YWxJbnZlbnRvcnlDb21wb25lbnQuZ2V0KHRoaXMuY29udGV4dC5lbnRpdHkpO1xyXG4gICAgICAgIGNvbnN0IGhhc0FsbEl0ZW1zID0gY3VycmVudEFnZVJlcXVpcmVtZW50cy5ldmVyeSgoaXRlbSkgPT4gdmlydHVhbEludmVudG9yeS5jb3VudEl0ZW1UeXBlKGl0ZW0uaWQpID49IGl0ZW0uYW1vdW50KTtcclxuICAgICAgICBpZiAoaGFzQWxsSXRlbXMpIHJldHVybiB0cnVlO1xyXG5cclxuICAgICAgICAvL0lmIGl0IGRvZXNuJ3QgaGF2ZSB0aGUgZXhhY3QgaXRlbXMsIGJ1dCBoYXMgYmV0dGVyIGl0ZW1zLCBjb25zaWRlciBpdCBjb21wbGV0ZVxyXG4gICAgICAgIGNvbnN0IGJlc3RHZWFyID0gSW52ZW50b3J5SGVscGVyLmdldEJlc3RHZWFySW5JbnZlbnRvcnkodGhpcy5jb250ZXh0LmVudGl0eSk7XHJcbiAgICAgICAgZm9yIChjb25zdCBpdGVtIG9mIGN1cnJlbnRBZ2VSZXF1aXJlbWVudHMpIHtcclxuICAgICAgICAgICAgaWYgKCF0aGlzLmhhc0JldHRlckdlYXIoaXRlbS5pZCwgYmVzdEdlYXIpKSByZXR1cm4gZmFsc2U7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGRvd25ncmFkZUFnZUlmTmVjZXNzYXJ5KCk6IGJvb2xlYW4ge1xyXG4gICAgICAgIC8vUHJldmVudCBkb3duZ3JhZGluZyB3aGlsZSBkdW1waW5nIG9sZCBnZWFyIGluIGNoZXN0c1xyXG4gICAgICAgIGlmICh0aGlzLmhhc0FjdGl2ZVN1YnN0YXRlT2ZUeXBlKEdvVXNlQ2hlc3RzUHJvY2VkdXJlKSkgcmV0dXJuIGZhbHNlO1xyXG5cclxuICAgICAgICBjb25zdCBjdXJyZW50QWdlSW5kZXggPSBBZ2VzRGF0YS5BZ2VQcmlvcml0aWVzLmluZGV4T2YodGhpcy5jdXJyZW50QWdlKTtcclxuXHJcbiAgICAgICAgaWYgKHRoaXMuc2hvdWxkRm9yY2VUb3JjaEFnZShjdXJyZW50QWdlSW5kZXgpKSB7XHJcbiAgICAgICAgICAgIHRoaXMuc2V0Q3VycmVudEFnZShcInRvcmNoXCIpO1xyXG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHJldHVybiB0aGlzLmRvd25ncmFkZVRvSGlnaGVzdFVuZnVsZmlsbGVkQWdlKGN1cnJlbnRBZ2VJbmRleCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBzaG91bGRGb3JjZVRvcmNoQWdlKGN1cnJlbnRBZ2VJbmRleDogbnVtYmVyKTogYm9vbGVhbiB7XHJcbiAgICAgICAgY29uc3QgdG9yY2hBZ2VJbmRleCA9IEFnZXNEYXRhLkFnZVByaW9yaXRpZXMuaW5kZXhPZihcInRvcmNoXCIpO1xyXG4gICAgICAgIGlmIChjdXJyZW50QWdlSW5kZXggPD0gdG9yY2hBZ2VJbmRleCkgcmV0dXJuIGZhbHNlO1xyXG5cclxuICAgICAgICByZXR1cm4gIXRoaXMuaGFzQW55QWdlSXRlbShcInRvcmNoXCIpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZG93bmdyYWRlVG9IaWdoZXN0VW5mdWxmaWxsZWRBZ2UoY3VycmVudEFnZUluZGV4OiBudW1iZXIpOiBib29sZWFuIHtcclxuICAgICAgICBsZXQgaGlnaGVzdEFnZVdpdGhJdGVtcyA9IC0xO1xyXG4gICAgICAgIGZvciAobGV0IGkgPSBBZ2VzRGF0YS5BZ2VQcmlvcml0aWVzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGFnZSA9IEFnZXNEYXRhLkFnZVByaW9yaXRpZXNbaV07XHJcbiAgICAgICAgICAgIGNvbnN0IGhhc0FueUl0ZW0gPSB0aGlzLmhhc0FueUFnZUl0ZW0oYWdlKTtcclxuICAgICAgICAgICAgaWYgKGhhc0FueUl0ZW0pIHtcclxuICAgICAgICAgICAgICAgIGhpZ2hlc3RBZ2VXaXRoSXRlbXMgPSBpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGNvbnN0IHRhcmdldEFnZUluZGV4ID0gTWF0aC5taW4oY3VycmVudEFnZUluZGV4LCBoaWdoZXN0QWdlV2l0aEl0ZW1zICsgMSk7XHJcbiAgICAgICAgaWYgKHRhcmdldEFnZUluZGV4ID09PSBjdXJyZW50QWdlSW5kZXgpIHJldHVybiBmYWxzZTtcclxuXHJcbiAgICAgICAgdGhpcy5zZXRDdXJyZW50QWdlKEFnZXNEYXRhLkFnZVByaW9yaXRpZXNbdGFyZ2V0QWdlSW5kZXhdKTtcclxuICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGhhc0FueUFnZUl0ZW0oYWdlOiBBZ2UpOiBib29sZWFuIHtcclxuICAgICAgICBjb25zdCB2aXJ0dWFsSW52ZW50b3J5ID0gVmlydHVhbEludmVudG9yeUNvbXBvbmVudC5nZXQodGhpcy5jb250ZXh0LmVudGl0eSk7XHJcbiAgICAgICAgY29uc3QgY3VycmVudEFnZVJlcXVpcmVtZW50cyA9IHRoaXMuZ2V0QWdlUmVxdWlyZW1lbnRzKGFnZSk7XHJcbiAgICAgICAgcmV0dXJuIGN1cnJlbnRBZ2VSZXF1aXJlbWVudHMuc29tZSgoaXRlbSkgPT4gdmlydHVhbEludmVudG9yeS5oYXNJdGVtVHlwZShpdGVtLmlkKSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBxdWV1ZVBpY2theGVJZk1pc3NpbmcoKTogdm9pZCB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmN1cnJlbnRGZWF0dXJlVHlwZSkgcmV0dXJuO1xyXG5cclxuICAgICAgICBjb25zdCBoYXNQaWNrYXhlID0gSW52ZW50b3J5SGVscGVyLmhhc1BpY2theGVGb3JGZWF0dXJlKHRoaXMuY29udGV4dC5lbnRpdHksIHRoaXMuY3VycmVudEZlYXR1cmVUeXBlKTtcclxuICAgICAgICBpZiAoaGFzUGlja2F4ZSkgcmV0dXJuO1xyXG5cclxuICAgICAgICBjb25zdCByZXF1aXJlZFBpY2theGUgPSBJbnZlbnRvcnlEYXRhLkZlYXR1cmVUeXBlVG9SZXF1aXJlZFBpY2theGVbdGhpcy5jdXJyZW50RmVhdHVyZVR5cGVdO1xyXG4gICAgICAgIGlmICghcmVxdWlyZWRQaWNrYXhlKSByZXR1cm47XHJcblxyXG4gICAgICAgIGlmICh0aGlzLmNyYWZ0SXRlbXNQcm9jZWR1cmUuaGFzSXRlbUluUXVldWUocmVxdWlyZWRQaWNrYXhlKSkgcmV0dXJuO1xyXG5cclxuICAgICAgICB0aGlzLmNyYWZ0SXRlbXNQcm9jZWR1cmUucHJlcGVuZEl0ZW1Ub1F1ZXVlKHJlcXVpcmVkUGlja2F4ZSk7XHJcbiAgICAgICAgY29uc3QgdXNlVGFibGVzID0gdGhpcy5nZXRTdWJzdGF0ZShVc2VUYWJsZXNQcm9jZWR1cmUpO1xyXG4gICAgICAgIHVzZVRhYmxlcy5zZXRDYW5TbWVsdCh0aGlzLmNhblNtZWx0KTtcclxuICAgICAgICB0aGlzLnNldFN1YnN0YXRlKHVzZVRhYmxlcyk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSB0cnlHb0hvbWVPclVzZVRhYmxlcygpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLmN1cnJlbnRGZWF0dXJlVHlwZSA9IG51bGw7XHJcbiAgICAgICAgdGhpcy5sYXN0SG9tZU9yVGFibGVzQ2hlY2tUaWNrID0gTWFpbi5jdXJyZW50VGljaztcclxuXHJcbiAgICAgICAgaWYgKHRoaXMuY2FuR29Ib21lKSB7XHJcbiAgICAgICAgICAgIHRoaXMudHJ5R29Ib21lKCk7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgdGhpcy50cnlVc2VUYWJsZXMoKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSB0cnlHb0hvbWUoKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5zZXRTdWJzdGF0ZSh0aGlzLmdldFN1YnN0YXRlKEdvSG9tZVByb2NlZHVyZSkpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgdHJ5VXNlVGFibGVzKCk6IHZvaWQge1xyXG4gICAgICAgIHRoaXMucXVldWVNaXNzaW5nSXRlbXNGb3JDdXJyZW50QWdlKCk7XHJcblxyXG4gICAgICAgIGlmICh0aGlzLmNyYWZ0SXRlbXNQcm9jZWR1cmUuaXRlbVF1ZXVlLmxlbmd0aCA9PT0gMCkgcmV0dXJuIHRoaXMuYnJvYWRjYXN0U2lnbmFsKFwib25GYWlsdXJlXCIpO1xyXG5cclxuICAgICAgICBjb25zdCB1c2VUYWJsZXMgPSB0aGlzLmdldFN1YnN0YXRlKFVzZVRhYmxlc1Byb2NlZHVyZSk7XHJcbiAgICAgICAgdXNlVGFibGVzLnNldENhblNtZWx0KHRoaXMuY2FuU21lbHQpO1xyXG4gICAgICAgIHRoaXMuc2V0U3Vic3RhdGUodXNlVGFibGVzKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHF1ZXVlTWlzc2luZ0l0ZW1zRm9yQ3VycmVudEFnZSgpOiB2b2lkIHtcclxuICAgICAgICBjb25zdCBpc0V2ZXJncmVlbiA9IHRoaXMuaXNJbkV2ZXJncmVlbkFnZSgpO1xyXG4gICAgICAgIGNvbnN0IGN1cnJlbnRBZ2VSZXF1aXJlbWVudHMgPSB0aGlzLmdldEFnZVJlcXVpcmVtZW50cyh0aGlzLmN1cnJlbnRBZ2UpO1xyXG4gICAgICAgIGNvbnN0IHZpcnR1YWxJbnZlbnRvcnkgPSBWaXJ0dWFsSW52ZW50b3J5Q29tcG9uZW50LmdldCh0aGlzLmNvbnRleHQuZW50aXR5KTtcclxuICAgICAgICBjb25zdCBiZXN0R2VhciA9IEludmVudG9yeUhlbHBlci5nZXRCZXN0R2VhckluSW52ZW50b3J5KHRoaXMuY29udGV4dC5lbnRpdHkpO1xyXG5cclxuICAgICAgICBmb3IgKGNvbnN0IGl0ZW0gb2YgY3VycmVudEFnZVJlcXVpcmVtZW50cykge1xyXG4gICAgICAgICAgICBjb25zdCBjdXJyZW50Q291bnQgPSB2aXJ0dWFsSW52ZW50b3J5LmNvdW50SXRlbVR5cGUoaXRlbS5pZCk7XHJcbiAgICAgICAgICAgIGlmICh0aGlzLmNyYWZ0SXRlbXNQcm9jZWR1cmUuaGFzSXRlbUluUXVldWUoaXRlbS5pZCkpIGNvbnRpbnVlO1xyXG5cclxuICAgICAgICAgICAgaWYgKCFpc0V2ZXJncmVlbiAmJiBjdXJyZW50Q291bnQgPj0gaXRlbS5hbW91bnQpIGNvbnRpbnVlO1xyXG5cclxuICAgICAgICAgICAgaWYgKCFpc0V2ZXJncmVlbiAmJiB0aGlzLmhhc0JldHRlckdlYXIoaXRlbS5pZCwgYmVzdEdlYXIpKSBjb250aW51ZTtcclxuXHJcbiAgICAgICAgICAgIGNvbnN0IHF1ZXVlQW1vdW50ID0gaXNFdmVyZ3JlZW4gPyBpdGVtLmFtb3VudCA6IGl0ZW0uYW1vdW50IC0gY3VycmVudENvdW50O1xyXG4gICAgICAgICAgICB0aGlzLmNyYWZ0SXRlbXNQcm9jZWR1cmUuYWRkSXRlbVRvUXVldWUoaXRlbS5pZCwgcXVldWVBbW91bnQpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGhhc0JldHRlckdlYXIoaXRlbUlkOiBzdHJpbmcsIGJlc3RHZWFyOiBNYXA8c3RyaW5nLCBUaWVyZWRJdGVtU2xvdERhdGE+KTogYm9vbGVhbiB7XHJcbiAgICAgICAgaWYgKCFJbnZlbnRvcnlIZWxwZXIuaXNHZWFyKGl0ZW1JZCkpIHJldHVybiBmYWxzZTtcclxuXHJcbiAgICAgICAgY29uc3QgaXRlbVN0YWNrID0gbmV3IEl0ZW1TdGFjayhpdGVtSWQsIDEpO1xyXG4gICAgICAgIHJldHVybiBJbnZlbnRvcnlIZWxwZXIuaXNCZXR0ZXJHZWFyKGl0ZW1TdGFjaywgYmVzdEdlYXIpID09PSBmYWxzZTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGdldEFnZVJlcXVpcmVtZW50cyhhZ2U6IEFnZSkge1xyXG4gICAgICAgIGlmIChhZ2UgIT09IFwiZXZlcmdyZWVuXCIpIHJldHVybiBBZ2VzRGF0YS5BZ2VSZXF1aXJlbWVudHNNYXBbYWdlXSA/PyBbXTtcclxuXHJcbiAgICAgICAgaWYgKHRoaXMuY3VycmVudEV2ZXJncmVlblRhcmdldCkgcmV0dXJuIFt0aGlzLmN1cnJlbnRFdmVyZ3JlZW5UYXJnZXRdO1xyXG5cclxuICAgICAgICBjb25zdCByYW5kb21JbmRleCA9IE1hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIEFnZXNEYXRhLkV2ZXJncmVlbkFnZU9wdGlvbnMubGVuZ3RoKTtcclxuICAgICAgICB0aGlzLmN1cnJlbnRFdmVyZ3JlZW5UYXJnZXQgPSBBZ2VzRGF0YS5FdmVyZ3JlZW5BZ2VPcHRpb25zW3JhbmRvbUluZGV4XTtcclxuICAgICAgICByZXR1cm4gW0FnZXNEYXRhLkV2ZXJncmVlbkFnZU9wdGlvbnNbcmFuZG9tSW5kZXhdXTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGlzSW5FdmVyZ3JlZW5BZ2UoKTogYm9vbGVhbiB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuY3VycmVudEFnZSA9PT0gXCJldmVyZ3JlZW5cIjtcclxuICAgIH1cclxuXHJcbiAgICBwcm90ZWN0ZWQgb25TdWJzdGF0ZUZhaWx1cmUoc3RhdGU6IEFic3RyYWN0U3RhdGUpOiB2b2lkIHtcclxuICAgICAgICBpZiAoc3RhdGUuaXMoR29Ib21lUHJvY2VkdXJlKSkge1xyXG4gICAgICAgICAgICB0aGlzLnRyeVVzZVRhYmxlcygpO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBpZiAoc3RhdGUuaXMoVXNlVGFibGVzUHJvY2VkdXJlKSkge1xyXG4gICAgICAgICAgICBjb25zdCBtaXNzaW5nSW5ncmVkaWVudCA9IChzdGF0ZSBhcyBVc2VUYWJsZXNQcm9jZWR1cmUpLm1pc3NpbmdJbmdyZWRpZW50O1xyXG4gICAgICAgICAgICBpZiAobWlzc2luZ0luZ3JlZGllbnQpIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGZlYXR1cmVUeXBlID0gUHJvZ3Jlc3NBZ2VzUHJvY2VkdXJlRGF0YS5JbmdyZWRpZW50VG9GZWF0dXJlVHlwZVttaXNzaW5nSW5ncmVkaWVudC5pZF07XHJcbiAgICAgICAgICAgICAgICB0aGlzLmN1cnJlbnRGZWF0dXJlVHlwZSA9IGZlYXR1cmVUeXBlO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5zZXRTdWJzdGF0ZUZvckZlYXR1cmVUeXBlKGZlYXR1cmVUeXBlKTtcclxuICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdGhpcy5jdXJyZW50RmVhdHVyZVR5cGUgPSBudWxsO1xyXG4gICAgICAgIHRoaXMuc2V0U3Vic3RhdGUobnVsbCk7XHJcbiAgICAgICAgdGhpcy5icm9hZGNhc3RTaWduYWwoXCJvbkZhaWx1cmVcIik7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBzZXRTdWJzdGF0ZUZvckZlYXR1cmVUeXBlKGZlYXR1cmVUeXBlOiBGZWF0dXJlSWRlbnRpZmllcik6IHZvaWQge1xyXG4gICAgICAgIGlmIChmZWF0dXJlVHlwZSA9PT0gXCJ0cmVlXCIpIHtcclxuICAgICAgICAgICAgY29uc3QgbG9nZ2luZ1N1YnN0YXRlID0gdGhpcy5nZXRTdWJzdGF0ZShHb0xvZ2dpbmdQcm9jZWR1cmUpO1xyXG4gICAgICAgICAgICBsb2dnaW5nU3Vic3RhdGUuc2V0Q2FuUmFuZG9tU2VhcmNoKHRoaXMuY2FuUmFuZG9tU2VhcmNoKTtcclxuICAgICAgICAgICAgbG9nZ2luZ1N1YnN0YXRlLnNldE1heEZlYXR1cmVEaXN0YW5jZUZyb21QbGF5ZXIodGhpcy5tYXhGZWF0dXJlRGlzdGFuY2VGcm9tUGxheWVyKTtcclxuICAgICAgICAgICAgdGhpcy5zZXRTdWJzdGF0ZShsb2dnaW5nU3Vic3RhdGUpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIGNvbnN0IG1pbmluZ1N1YnN0YXRlID0gdGhpcy5nZXRTdWJzdGF0ZShHb01pbmluZ1Byb2NlZHVyZSk7XHJcbiAgICAgICAgICAgIG1pbmluZ1N1YnN0YXRlLnNldFByaW1hcnlGZWF0dXJlVHlwZShmZWF0dXJlVHlwZSk7XHJcbiAgICAgICAgICAgIG1pbmluZ1N1YnN0YXRlLnNldENhblJhbmRvbVNlYXJjaCh0aGlzLmNhblJhbmRvbVNlYXJjaCk7XHJcbiAgICAgICAgICAgIG1pbmluZ1N1YnN0YXRlLnNldE1heEZlYXR1cmVEaXN0YW5jZUZyb21QbGF5ZXIodGhpcy5tYXhGZWF0dXJlRGlzdGFuY2VGcm9tUGxheWVyKTtcclxuICAgICAgICAgICAgdGhpcy5zZXRTdWJzdGF0ZShtaW5pbmdTdWJzdGF0ZSk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG59XHJcbiJdLCJuYW1lcyI6WyJJdGVtU3RhY2siLCJBZ2VzRGF0YSIsIlByb2dyZXNzQWdlc1Byb2NlZHVyZURhdGEiLCJJbnZlbnRvcnlEYXRhIiwiQ3JhZnRpbmdIZWxwZXIiLCJJbnZlbnRvcnlIZWxwZXIiLCJWaXJ0dWFsSW52ZW50b3J5Q29tcG9uZW50IiwiTWFpbiIsIkNvbXBvc2l0ZVN0YXRlIiwiQ3JhZnRJdGVtc1Byb2NlZHVyZSIsIkdvSG9tZVByb2NlZHVyZSIsIkdvTG9nZ2luZ1Byb2NlZHVyZSIsIkdvTWluaW5nUHJvY2VkdXJlIiwiR29Vc2VDaGVzdHNQcm9jZWR1cmUiLCJVc2VUYWJsZXNQcm9jZWR1cmUiLCJyZWdpc3RyeSIsIlByb2dyZXNzQWdlc1Byb2NlZHVyZSIsInVzZVRhYmxlc1Byb2NlZHVyZSIsImdldFN1YnN0YXRlIiwiY3JhZnRJdGVtc1Byb2NlZHVyZSIsInNldENhbkdvSG9tZSIsImNhbkdvSG9tZSIsInNldENhblNtZWx0IiwiY2FuU21lbHQiLCJzZXRDYW5SYW5kb21TZWFyY2giLCJjYW5TZWFyY2giLCJjYW5SYW5kb21TZWFyY2giLCJzZXRNYXhGZWF0dXJlRGlzdGFuY2VGcm9tUGxheWVyIiwiZGlzdGFuY2UiLCJtYXhGZWF0dXJlRGlzdGFuY2VGcm9tUGxheWVyIiwic2V0SG9tZU9yVGFibGVzSW50ZXJ2YWwiLCJpbnRlcnZhbCIsImhvbWVPclRhYmxlc0ludGVydmFsIiwiRGVmYXVsdEdvSG9tZU9yVGFibGVzSW50ZXJ2YWwiLCJvbkVudGVyIiwibWVtb3J5IiwicmVzdG9yZU1lbW9yeSIsImN1cnJlbnRBZ2UiLCJFbnRpdHlTdG9yZSIsImdldCIsImNvbnRleHQiLCJlbnRpdHkiLCJwcmV2aW91c0FnZSIsImxhc3RJbnZlbnRvcnlDaGVja1RpY2siLCJjdXJyZW50VGljayIsImN1cnJlbnRGZWF0dXJlVHlwZSIsInNldFN1YnN0YXRlRm9yRmVhdHVyZVR5cGUiLCJ0cnlBZHZhbmNlVG9OZXh0QWdlIiwidHJ5R29Ib21lT3JVc2VUYWJsZXMiLCJzZXRDdXJyZW50QWdlIiwiYWdlIiwic2V0IiwiY2xlYXJRdWV1ZSIsInF1ZXVlTWlzc2luZ0l0ZW1zRm9yQ3VycmVudEFnZSIsImZvcmNlR29Ib21lT3JUYWJsZXMiLCJ1bmRlZmluZWQiLCJsYXN0SG9tZU9yVGFibGVzQ2hlY2tUaWNrIiwiY3VycmVudEV2ZXJncmVlblRhcmdldCIsImNyZWF0ZU1lbW9yeSIsIm9uQWN0aXZlVGljayIsIkludmVudG9yeUNoZWNrSW50ZXJ2YWwiLCJoYXNDaGFuZ2VkQ3JhZnRpbmdRdWV1ZSIsInJlbW92ZVF1ZXVlZEl0ZW1zQWxyZWFkeU93bmVkIiwiZG93bmdyYWRlQWdlSWZOZWNlc3NhcnkiLCJxdWV1ZVBpY2theGVJZk1pc3NpbmciLCJpc0luRXZlcmdyZWVuQWdlIiwiaGFzUmVtb3ZlZEl0ZW1zIiwiYWN0aXZlSXRlbUlkIiwiaXNBY3RpdmUiLCJpdGVtUXVldWUiLCJpZCIsInZpcnR1YWxJbnZlbnRvcnkiLCJiZXN0R2VhciIsImdldEJlc3RHZWFySW5JbnZlbnRvcnkiLCJjcmFmdCIsImhhc0JldHRlckdlYXIiLCJyZW1vdmVJdGVtRnJvbVF1ZXVlIiwiY291bnQiLCJjb3VudEl0ZW1UeXBlIiwicXVldWVDb3VudCIsInJlbWFpbmluZ0NyYWZ0cyIsImdldFJlY2lwZUZvclJlc3VsdCIsInJlc3VsdCIsImFtb3VudCIsIm9uU3Vic3RhdGVDb21wbGV0ZSIsInN0YXRlIiwiaXMiLCJ0cnlVc2VUYWJsZXMiLCJ0aW1lU2luY2VIb21lT3JUYWJsZXMiLCJpc05vdEF0SG9tZU9yVGFibGVzIiwibG9nZ2luZ1N1YnN0YXRlIiwic2V0U3Vic3RhdGUiLCJtaW5pbmdTdWJzdGF0ZSIsInNldFByaW1hcnlGZWF0dXJlVHlwZSIsImxlbmd0aCIsImN1cnJlbnRBZ2VJbmRleCIsIkFnZVByaW9yaXRpZXMiLCJpbmRleE9mIiwiaGFzQ29tcGxldGVkQWdlUmVxdWlyZW1lbnRzIiwiaXNQcmV2aW91c0FnZUhpZ2hlclRoYW5DdXJyZW50IiwicHJldmlvdXNBZ2VJbmRleCIsImN1cnJlbnRBZ2VSZXF1aXJlbWVudHMiLCJnZXRBZ2VSZXF1aXJlbWVudHMiLCJoYXNBbGxJdGVtcyIsImV2ZXJ5IiwiaXRlbSIsImhhc0FjdGl2ZVN1YnN0YXRlT2ZUeXBlIiwic2hvdWxkRm9yY2VUb3JjaEFnZSIsImRvd25ncmFkZVRvSGlnaGVzdFVuZnVsZmlsbGVkQWdlIiwidG9yY2hBZ2VJbmRleCIsImhhc0FueUFnZUl0ZW0iLCJoaWdoZXN0QWdlV2l0aEl0ZW1zIiwiaSIsImhhc0FueUl0ZW0iLCJ0YXJnZXRBZ2VJbmRleCIsIk1hdGgiLCJtaW4iLCJzb21lIiwiaGFzSXRlbVR5cGUiLCJoYXNQaWNrYXhlIiwiaGFzUGlja2F4ZUZvckZlYXR1cmUiLCJyZXF1aXJlZFBpY2theGUiLCJGZWF0dXJlVHlwZVRvUmVxdWlyZWRQaWNrYXhlIiwiaGFzSXRlbUluUXVldWUiLCJwcmVwZW5kSXRlbVRvUXVldWUiLCJ1c2VUYWJsZXMiLCJ0cnlHb0hvbWUiLCJicm9hZGNhc3RTaWduYWwiLCJpc0V2ZXJncmVlbiIsImN1cnJlbnRDb3VudCIsInF1ZXVlQW1vdW50IiwiYWRkSXRlbVRvUXVldWUiLCJpdGVtSWQiLCJpc0dlYXIiLCJpdGVtU3RhY2siLCJpc0JldHRlckdlYXIiLCJBZ2VSZXF1aXJlbWVudHNNYXAiLCJyYW5kb21JbmRleCIsImZsb29yIiwicmFuZG9tIiwiRXZlcmdyZWVuQWdlT3B0aW9ucyIsIm9uU3Vic3RhdGVGYWlsdXJlIiwibWlzc2luZ0luZ3JlZGllbnQiLCJmZWF0dXJlVHlwZSIsIkluZ3JlZGllbnRUb0ZlYXR1cmVUeXBlIiwiZGVmaW5pdGlvbiIsImlkZW50aWZpZXIiLCJwcmlvcml0eSIsIlByaW9yaXR5IiwiaW5pdGlhbFN0YXRlIl0sIm1hcHBpbmdzIjoiQUFBQSxTQUFTQSxTQUFTLFFBQVEsb0JBQW9CO0FBQzlDLE9BQU9DLGNBQXVCLGdCQUFnQjtBQUM5QyxPQUFPQywrQkFBK0IscURBQXFEO0FBQzNGLFNBQVNDLGFBQWEsUUFBUSxxQkFBcUI7QUFFbkQsT0FBT0Msb0JBQW9CLHlCQUF5QjtBQUNwRCxPQUFPQyxxQkFBcUIsNEJBQTRCO0FBRXhELE9BQU9DLCtCQUErQixzQ0FBc0M7QUFDNUUsT0FBT0MsVUFBVSxPQUFPO0FBRXhCLE9BQU9DLG9CQUFvQixzQ0FBc0M7QUFFakUsU0FBU0MsbUJBQW1CLFFBQVEsd0JBQXdCO0FBQzVELFNBQVNDLGVBQWUsUUFBUSxvQkFBb0I7QUFDcEQsU0FBU0Msa0JBQWtCLFFBQVEsdUJBQXVCO0FBQzFELFNBQVNDLGlCQUFpQixRQUFRLHNCQUFzQjtBQUN4RCxTQUFTQyxvQkFBb0IsUUFBUSx5QkFBeUI7QUFDOUQsU0FBU0Msa0JBQWtCLFFBQVEsdUJBQXVCO0FBUzFELE1BQU1DLFdBQVc7SUFBQ0o7SUFBb0JDO0lBQW1CRTtJQUFvQko7Q0FBZ0I7QUFFN0YsT0FBTyxNQUFNTSw4QkFBOEJSO0lBcUJ2QyxJQUFXUyxxQkFBeUM7UUFDaEQsT0FBTyxJQUFJLENBQUNDLFdBQVcsQ0FBQ0o7SUFDNUI7SUFFQSxJQUFXSyxzQkFBMkM7UUFDbEQsT0FBTyxJQUFJLENBQUNGLGtCQUFrQixDQUFDQyxXQUFXLENBQUNUO0lBQy9DO0lBRU9XLGFBQWFDLFNBQWtCLEVBQVE7UUFDMUMsSUFBSSxDQUFDQSxTQUFTLEdBQUdBO0lBQ3JCO0lBRU9DLFlBQVlDLFFBQWlCLEVBQVE7UUFDeEMsSUFBSSxDQUFDQSxRQUFRLEdBQUdBO0lB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