import { BlockPermutation } from "@minecraft/server";
import { LocationVar } from "BigBrain/Context/LocationVar";
import CraftItemsProcedureData from "Data/BigBrain/Procedures/CraftItemsProcedureData";
import CraftingHelper from "Helpers/CraftingHelper";
import RotationHelper from "Helpers/RotationHelper";
import V3 from "Helpers/Vectors/V3";
import VirtualInventoryComponent from "Inventory/VirtualInventoryComponent";
import CompositeState from "StateSkeleton/States/CompositeState";
import BlockUtils from "Utils/BlockUtils";
import { CraftItemProcedure } from "./CraftItemProcedure";
import { GoBuildBlockProcedure } from "./GoBuildBlockProcedure";
import { PathToNodeProcedure } from "./PathToNodeProcedure";
const registry = [
    GoBuildBlockProcedure,
    PathToNodeProcedure,
    CraftItemProcedure
];
export class CraftItemsProcedure extends CompositeState {
    setIsInHome(isInHome) {
        this.isInHome = isInHome;
    }
    addItemToQueue(itemId, amount = 1) {
        //Enforce no duplicates in the queue
        if (this.itemQueue.some((entry)=>entry.id === itemId)) return;
        const wasEmpty = this.itemQueue.length === 0;
        this.itemQueue.push(this.createEntry(itemId, amount));
        if (this.isActive && wasEmpty) {
            this.determineNextCraft();
        }
    }
    prependItemToQueue(itemId, amount = 1) {
        //Enforce no duplicates in the queue
        if (this.itemQueue.some((entry)=>entry.id === itemId)) return;
        const wasEmpty = this.itemQueue.length === 0;
        this.itemQueue.unshift(this.createEntry(itemId, amount));
        if (this.isActive && wasEmpty) {
            this.determineNextCraft();
        }
    }
    hasItemInQueue(itemId) {
        return this.itemQueue.some((entry)=>entry.id === itemId);
    }
    removeItemFromQueue(itemId, itemCount) {
        const recipe = CraftingHelper.getRecipeForResult(itemId);
        let craftsToRemove = Math.floor(itemCount / (recipe?.result.amount ?? 1));
        for(let i = 0; i < this.itemQueue.length && craftsToRemove > 0; i++){
            const entry = this.itemQueue[i];
            if (entry.id !== itemId) continue;
            if (entry.remainingCrafts > craftsToRemove) {
                entry.remainingCrafts -= craftsToRemove;
                break;
            } else {
                craftsToRemove -= entry.remainingCrafts;
                this.itemQueue.splice(i, 1);
                i--;
            }
        }
    }
    clearQueue() {
        this.itemQueue.length = 0;
    }
    createEntry(itemId, amount) {
        const recipe = CraftingHelper.getRecipeForResult(itemId);
        const remainingCrafts = Math.ceil(amount / (recipe?.result.amount ?? 1));
        return {
            id: itemId,
            remainingCrafts
        };
    }
    onEnter(memory) {
        this.isCraftingAtTable = false;
        this.craftingTableLocation = null;
        this.ownsCraftingTable = false;
        if (memory) {
            this.restoreMemory(memory);
        }
        this.refreshCraftingTableOwnership();
        if (!this.ownsCraftingTable) this.validateExistingOwnedCraftingTable();
        this.determineNextCraft();
    }
    restoreMemory(memory) {
        if (this.itemQueue.length === 0) {
            for (const entry of memory.itemQueue ?? []){
                this.itemQueue.push(entry);
            }
        }
        if (!this.craftingTableLocation && memory.craftingTableLocation) {
            this.craftingTableLocation = V3.fromSerializedLocation(memory.craftingTableLocation);
        }
    }
    createMemory() {
        return {
            itemQueue: [
                ...this.itemQueue
            ],
            craftingTableLocation: this.craftingTableLocation?.toJSON() ?? null
        };
    }
    refreshCraftingTableOwnership() {
        if (!this.ownsCraftingTable) return;
        if (!this.craftingTableLocation) {
            this.ownsCraftingTable = false;
            return;
        }
        const block = BlockUtils.fromV3(this.craftingTableLocation);
        if (block?.type.id === CraftItemsProcedure.CraftingTableId) return;
        this.ownsCraftingTable = false;
    }
    validateExistingOwnedCraftingTable() {
        const craftingTableLocation = EntityStore.get(this.context.entity, "ownedCraftingTableLocation");
        if (!craftingTableLocation) return;
        const location = new V3(craftingTableLocation).setDimension(overworld);
        const block = BlockUtils.fromV3(location);
        if (block?.type.id !== CraftItemsProcedure.CraftingTableId) {
            EntityStore.set(this.context.entity, "ownedCraftingTableLocation", null);
            return;
        }
        this.craftingTableLocation = location;
        this.ownsCraftingTable = true;
    }
    clearOwnedCraftingTable() {
        EntityStore.set(this.context.entity, "ownedCraftingTableLocation", null);
        this.craftingTableLocation = null;
        this.ownsCraftingTable = false;
    }
    setCraftingTableAsOwned(craftingTableLocation) {
        this.craftingTableLocation = craftingTableLocation;
        this.ownsCraftingTable = true;
        EntityStore.set(this.context.entity, "ownedCraftingTableLocation", craftingTableLocation.toJSON());
    }
    onActiveTick() {
        if (this.currentSubstate?.is(PathToNodeProcedure)) return this.whilePathing();
        if (this.isCraftingAtTable && this.craftingTableLocation) {
            RotationHelper.lookAtLocation(this.context.entity, this.craftingTableLocation);
        } else {
            RotationHelper.lookAtHands(this.context.entity);
        }
    }
    whilePathing() {
        if (this.activeTicks % CraftItemsProcedureData.CanHighlightCheckDuration !== 0) return;
        if (!this.craftingTableLocation) return;
        const block = BlockUtils.fromV3(this.craftingTableLocation);
        if (BlockUtils.canHighlightBlock(this.context.entity, block)) this.onSubstateComplete(this.currentSubstate);
    }
    ensureCraftingTable() {
        const existingTable = this.getCraftingTableInRange();
        if (existingTable) {
            this.goToExistingCraftingTable(existingTable);
            return;
        }
        this.craftOrBuildNewCraftingTable();
    }
    goToExistingCraftingTable(existingTable) {
        if (this.ownsCraftingTable && this.craftingTableLocation && !this.craftingTableLocation.sharesBlockWith(existingTable)) {
            this.ownsCraftingTable = false;
        }
        this.craftingTableLocation = existingTable;
        const block = BlockUtils.fromV3(this.craftingTableLocation);
        const canUseTableNow = block && BlockUtils.canHighlightBlock(this.context.entity, block);
        if (canUseTableNow) {
            this.startNextCraft();
        } else {
            const pathToNodeProcedure = this.getSubstate(PathToNodeProcedure);
            pathToNodeProcedure.setPrimaryLocation(this.craftingTableLocation);
            pathToNodeProcedure.setCanBreakBlocks(!this.isInHome);
            pathToNodeProcedure.setCanPlaceBlocks(true);
            this.setSubstate(pathToNodeProcedure);
        }
    }
    craftOrBuildNewCraftingTable() {
        const hasCraftingTableInInventory = VirtualInventoryComponent.get(this.context.entity).hasItemType(CraftItemsProcedure.CraftingTableId);
        if (!hasCraftingTableInInventory) {
            this.itemQueue.unshift({
                id: CraftItemsProcedure.CraftingTableId,
                remainingCrafts: 1
            });
            this.determineNextCraft();
            return;
        }
        const goBuildBlockProcedure = this.getSubstate(GoBuildBlockProcedure);
        goBuildBlockProcedure.setPermutation(BlockPermutation.resolve(CraftItemsProcedure.CraftingTableId));
        goBuildBlockProcedure.setRemoveFromInventory(true);
        goBuildBlockProcedure.setIsInHome(this.isInHome);
        this.setSubstate(goBuildBlockProcedure);
    }
    getCraftingTableInRange() {
        const entityLocation = this.context.getValue(LocationVar).$.floor();
        const radius = CraftItemsProcedureData.CraftingTableSearchRadius;
        const filter = {
            includeTypes: [
                CraftItemsProcedure.CraftingTableId
            ]
        };
        const blocks = BlockUtils.getBlocksInVolume(entityLocation, radius, filter);
        if (blocks.getCapacity() === 0) return null;
        const location = blocks.getBlockLocationIterator().next().value;
        if (!location) return null;
        return new V3(location).setDimension(overworld);
    }
    determineNextCraft() {
        if (this.itemQueue.length === 0) return this.broadcastSignal("onComplete");
        const entry = this.itemQueue[0];
        const recipe = CraftingHelper.getRecipeForResult(entry.id);
        if (!recipe) return this.broadcastSignal("onFailure");
        const missingIngredients = [];
        let hasMissingBaseIngredient = false;
        for (const ingredient of recipe.ingredients){
            const totalNeeded = entry.remainingCrafts * ingredient.amount;
            const currentCount = CraftingHelper.getItemCountForIngredient(this.context.entity, ingredient);
            if (currentCount >= totalNeeded) continue;
            const ingredientRecipe = CraftingHelper.getRecipeForResult(ingredient.id);
            if (!ingredientRecipe) {
                hasMissingBaseIngredient = true;
                continue; //Base (uncraftable) ingredient missing
            }
            const missingAmount = totalNeeded - currentCount;
            const remainingCrafts = Math.ceil(missingAmount / ingredientRecipe.result.amount);
            missingIngredients.push({
                id: ingredient.id,
                remainingCrafts: remainingCrafts
            });
        }
        if (missingIngredients.length > 0) {
            // Prepend missing ingredients so they are crafted before the current item
            this.itemQueue.unshift(...missingIngredients);
            this.determineNextCraft();
        } else if (hasMissingBaseIngredient) {
            return this.broadcastSignal("onFailure");
        } else {
            this.startNextCraft();
        }
    }
    shouldEnsureCraftingTable() {
        //Already queued to craft a table
        for (const entry of this.itemQueue){
            if (entry.id === CraftItemsProcedure.CraftingTableId) return false;
        }
        //Already have a crafting table
        if (this.craftingTableLocation) {
            const block = BlockUtils.fromV3(this.craftingTableLocation);
            //Block is no longer a crafting table
            if (block?.type.id !== CraftItemsProcedure.CraftingTableId) {
                if (this.ownsCraftingTable) this.clearOwnedCraftingTable();
                else this.craftingTableLocation = null;
                return true;
            }
            //Crafting table is out of reach/line of sight
            if (!BlockUtils.canHighlightBlock(this.context.entity, block)) return true;
            //Table is valid and accessible, no need to ensure
            return false;
        }
        for (const entry of this.itemQueue){
            if (CraftingHelper.doesItemRequireCraftingTable(entry.id)) return true;
        }
        //Item doesn't require a crafting table
        return false;
    }
    startNextCraft() {
        if (this.shouldEnsureCraftingTable()) {
            this.ensureCraftingTable();
            return;
        }
        // peek (shifted only after remainingCrafts hits 0)
        const entry = this.itemQueue[0];
        this.isCraftingAtTable = this.craftingTableLocation !== null;
        this.getSubstate(CraftItemProcedure).setItemId(entry.id);
        this.setSubstate(this.getSubstate(CraftItemProcedure));
    }
    onSubstateComplete(state) {
        if (state.is(GoBuildBlockProcedure)) {
            const craftingTableLocation = this.getSubstate(GoBuildBlockProcedure).location;
            if (craftingTableLocation) this.setCraftingTableAsOwned(craftingTableLocation);
            this.startNextCraft();
        } else if (state.is(PathToNodeProcedure)) {
            this.startNextCraft();
        } else if (state.is(CraftItemProcedure)) {
            const entry = this.itemQueue[0];
            entry.remainingCrafts--;
            if (entry.remainingCrafts > 0) {
                this.startNextCraft();
            } else {
                this.itemQueue.shift();
                if (this.itemQueue.length === 0) {
                    this.broadcastSignal("onComplete");
                } else {
                    this.determineNextCraft();
                }
            }
        }
    }
    onSubstateFailure(state) {
        if (state.is(PathToNodeProcedure)) {
            //Give up and place a crafting table instead
            this.craftOrBuildNewCraftingTable();
            return;
        }
        this.broadcastSignal("onFailure");
    }
    constructor(...args){
        super(...args);
        this.itemQueue = [];
        this.craftingTableLocation = null;
        this.ownsCraftingTable = false;
        this.isCraftingAtTable = false;
        this.isInHome = false;
    }
}
CraftItemsProcedure.definition = {
    identifier: "procedure:craft_items",
    priority: CraftItemsProcedureData.Priority,
    registry,
    initialState: null
};
CraftItemsProcedure.CraftingTableId = "minecraft:crafting_table";

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkNyYWZ0SXRlbXNQcm9jZWR1cmUudHMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgQmxvY2tGaWx0ZXIsIEJsb2NrUGVybXV0YXRpb24gfSBmcm9tIFwiQG1pbmVjcmFmdC9zZXJ2ZXJcIjtcclxuaW1wb3J0IHsgTG9jYXRpb25WYXIgfSBmcm9tIFwiQmlnQnJhaW4vQ29udGV4dC9Mb2NhdGlvblZhclwiO1xyXG5pbXBvcnQgeyBTZXJpYWxpemVkTG9jYXRpb24gfSBmcm9tIFwiQmlnQnJhaW4vVHlwZXNcIjtcclxuaW1wb3J0IENyYWZ0SXRlbXNQcm9jZWR1cmVEYXRhIGZyb20gXCJEYXRhL0JpZ0JyYWluL1Byb2NlZHVyZXMvQ3JhZnRJdGVtc1Byb2NlZHVyZURhdGFcIjtcclxuaW1wb3J0IENyYWZ0aW5nSGVscGVyIGZyb20gXCJIZWxwZXJzL0NyYWZ0aW5nSGVscGVyXCI7XHJcbmltcG9ydCBSb3RhdGlvbkhlbHBlciBmcm9tIFwiSGVscGVycy9Sb3RhdGlvbkhlbHBlclwiO1xyXG5pbXBvcnQgVjMgZnJvbSBcIkhlbHBlcnMvVmVjdG9ycy9WM1wiO1xyXG5pbXBvcnQgVmlydHVhbEludmVudG9yeUNvbXBvbmVudCBmcm9tIFwiSW52ZW50b3J5L1ZpcnR1YWxJbnZlbnRvcnlDb21wb25lbnRcIjtcclxuaW1wb3J0IEFic3RyYWN0U3RhdGUgZnJvbSBcIlN0YXRlU2tlbGV0b24vU3RhdGVzL0Fic3RyYWN0U3RhdGVcIjtcclxuaW1wb3J0IENvbXBvc2l0ZVN0YXRlIGZyb20gXCJTdGF0ZVNrZWxldG9uL1N0YXRlcy9Db21wb3NpdGVTdGF0ZVwiO1xyXG5pbXBvcnQgeyBDb21wb3NpdGVTdGF0ZURlZmluaXRpb24sIFN0YXRlTWVtb3J5IH0gZnJvbSBcIlN0YXRlU2tlbGV0b24vVHlwZXNcIjtcclxuaW1wb3J0IEJsb2NrVXRpbHMgZnJvbSBcIlV0aWxzL0Jsb2NrVXRpbHNcIjtcclxuaW1wb3J0IHsgQ3JhZnRJdGVtUHJvY2VkdXJlIH0gZnJvbSBcIi4vQ3JhZnRJdGVtUHJvY2VkdXJlXCI7XHJcbmltcG9ydCB7IEdvQnVpbGRCbG9ja1Byb2NlZHVyZSB9IGZyb20gXCIuL0dvQnVpbGRCbG9ja1Byb2NlZHVyZVwiO1xyXG5pbXBvcnQgeyBQYXRoVG9Ob2RlUHJvY2VkdXJlIH0gZnJvbSBcIi4vUGF0aFRvTm9kZVByb2NlZHVyZVwiO1xyXG5cclxuZXhwb3J0IGludGVyZmFjZSBDcmFmdFF1ZXVlRW50cnkge1xyXG4gICAgaWQ6IHN0cmluZztcclxuICAgIHJlbWFpbmluZ0NyYWZ0czogbnVtYmVyO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgTWVtb3J5IGV4dGVuZHMgU3RhdGVNZW1vcnkge1xyXG4gICAgaXRlbVF1ZXVlOiBDcmFmdFF1ZXVlRW50cnlbXTtcclxuICAgIGNyYWZ0aW5nVGFibGVMb2NhdGlvbjogU2VyaWFsaXplZExvY2F0aW9uIHwgbnVsbDtcclxufVxyXG5cclxuY29uc3QgcmVnaXN0cnkgPSBbR29CdWlsZEJsb2NrUHJvY2VkdXJlLCBQYXRoVG9Ob2RlUHJvY2VkdXJlLCBDcmFmdEl0ZW1Qcm9jZWR1cmVdIGFzIGNvbnN0O1xyXG5cclxuZXhwb3J0IGNsYXNzIENyYWZ0SXRlbXNQcm9jZWR1cmUgZXh0ZW5kcyBDb21wb3NpdGVTdGF0ZTx0eXBlb2YgcmVnaXN0cnk+IHtcclxuICAgIHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgZGVmaW5pdGlvbjogQ29tcG9zaXRlU3RhdGVEZWZpbml0aW9uPHR5cGVvZiByZWdpc3RyeT4gPSB7XHJcbiAgICAgICAgaWRlbnRpZmllcjogXCJwcm9jZWR1cmU6Y3JhZnRfaXRlbXNcIixcclxuICAgICAgICBwcmlvcml0eTogQ3JhZnRJdGVtc1Byb2NlZHVyZURhdGEuUHJpb3JpdHksXHJcbiAgICAgICAgcmVnaXN0cnksXHJcbiAgICAgICAgaW5pdGlhbFN0YXRlOiBudWxsLFxyXG4gICAgfTtcclxuXHJcbiAgICBwdWJsaWMgc3RhdGljIHJlYWRvbmx5IENyYWZ0aW5nVGFibGVJZCA9IFwibWluZWNyYWZ0OmNyYWZ0aW5nX3RhYmxlXCI7XHJcblxyXG4gICAgcHVibGljIHJlYWRvbmx5IGl0ZW1RdWV1ZTogQ3JhZnRRdWV1ZUVudHJ5W10gPSBbXTtcclxuICAgIHB1YmxpYyBjcmFmdGluZ1RhYmxlTG9jYXRpb246IFYzIHwgbnVsbCA9IG51bGw7XHJcbiAgICBwdWJsaWMgb3duc0NyYWZ0aW5nVGFibGU6IGJvb2xlYW4gPSBmYWxzZTtcclxuICAgIHByaXZhdGUgaXNDcmFmdGluZ0F0VGFibGU6IGJvb2xlYW4gPSBmYWxzZTtcclxuICAgIHByaXZhdGUgaXNJbkhvbWU6IGJvb2xlYW4gPSBmYWxzZTtcclxuXHJcbiAgICBwdWJsaWMgc2V0SXNJbkhvbWUoaXNJbkhvbWU6IGJvb2xlYW4pOiB2b2lkIHtcclxuICAgICAgICB0aGlzLmlzSW5Ib21lID0gaXNJbkhvbWU7XHJcbiAgICB9XHJcblxyXG4gICAgcHVibGljIGFkZEl0ZW1Ub1F1ZXVlKGl0ZW1JZDogc3RyaW5nLCBhbW91bnQ6IG51bWJlciA9IDEpOiB2b2lkIHtcclxuICAgICAgICAvL0VuZm9yY2Ugbm8gZHVwbGljYXRlcyBpbiB0aGUgcXVldWVcclxuICAgICAgICBpZiAodGhpcy5pdGVtUXVldWUuc29tZSgoZW50cnkpID0+IGVudHJ5LmlkID09PSBpdGVtSWQpKSByZXR1cm47XHJcblxyXG4gICAgICAgIGNvbnN0IHdhc0VtcHR5ID0gdGhpcy5pdGVtUXVldWUubGVuZ3RoID09PSAwO1xyXG4gICAgICAgIHRoaXMuaXRlbVF1ZXVlLnB1c2godGhpcy5jcmVhdGVFbnRyeShpdGVtSWQsIGFtb3VudCkpO1xyXG4gICAgICAgIGlmICh0aGlzLmlzQWN0aXZlICYmIHdhc0VtcHR5KSB7XHJcbiAgICAgICAgICAgIHRoaXMuZGV0ZXJtaW5lTmV4dENyYWZ0KCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHB1YmxpYyBwcmVwZW5kSXRlbVRvUXVldWUoaXRlbUlkOiBzdHJpbmcsIGFtb3VudDogbnVtYmVyID0gMSk6IHZvaWQge1xyXG4gICAgICAgIC8vRW5mb3JjZSBubyBkdXBsaWNhdGVzIGluIHRoZSBxdWV1ZVxyXG4gICAgICAgIGlmICh0aGlzLml0ZW1RdWV1ZS5zb21lKChlbnRyeSkgPT4gZW50cnkuaWQgPT09IGl0ZW1JZCkpIHJldHVybjtcclxuXHJcbiAgICAgICAgY29uc3Qgd2FzRW1wdHkgPSB0aGlzLml0ZW1RdWV1ZS5sZW5ndGggPT09IDA7XHJcbiAgICAgICAgdGhpcy5pdGVtUXVldWUudW5zaGlmdCh0aGlzLmNyZWF0ZUVudHJ5KGl0ZW1JZCwgYW1vdW50KSk7XHJcbiAgICAgICAgaWYgKHRoaXMuaXNBY3RpdmUgJiYgd2FzRW1wdHkpIHtcclxuICAgICAgICAgICAgdGhpcy5kZXRlcm1pbmVOZXh0Q3JhZnQoKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHVibGljIGhhc0l0ZW1JblF1ZXVlKGl0ZW1JZDogc3RyaW5nKTogYm9vbGVhbiB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuaXRlbVF1ZXVlLnNvbWUoKGVudHJ5KSA9PiBlbnRyeS5pZCA9PT0gaXRlbUlkKTtcclxuICAgIH1cclxuXHJcbiAgICBwdWJsaWMgcmVtb3ZlSXRlbUZyb21RdWV1ZShpdGVtSWQ6IHN0cmluZywgaXRlbUNvdW50OiBudW1iZXIpOiB2b2lkIHtcclxuICAgICAgICBjb25zdCByZWNpcGUgPSBDcmFmdGluZ0hlbHBlci5nZXRSZWNpcGVGb3JSZXN1bHQoaXRlbUlkKTtcclxuICAgICAgICBsZXQgY3JhZnRzVG9SZW1vdmUgPSBNYXRoLmZsb29yKGl0ZW1Db3VudCAvIChyZWNpcGU/LnJlc3VsdC5hbW91bnQgPz8gMSkpO1xyXG5cclxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMuaXRlbVF1ZXVlLmxlbmd0aCAmJiBjcmFmdHNUb1JlbW92ZSA+IDA7IGkrKykge1xyXG4gICAgICAgICAgICBjb25zdCBlbnRyeSA9IHRoaXMuaXRlbVF1ZXVlW2ldO1xyXG4gICAgICAgICAgICBpZiAoZW50cnkuaWQgIT09IGl0ZW1JZCkgY29udGludWU7XHJcblxyXG4gICAgICAgICAgICBpZiAoZW50cnkucmVtYWluaW5nQ3JhZnRzID4gY3JhZnRzVG9SZW1vdmUpIHtcclxuICAgICAgICAgICAgICAgIGVudHJ5LnJlbWFpbmluZ0NyYWZ0cyAtPSBjcmFmdHNUb1JlbW92ZTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgY3JhZnRzVG9SZW1vdmUgLT0gZW50cnkucmVtYWluaW5nQ3JhZnRzO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5pdGVtUXVldWUuc3BsaWNlKGksIDEpO1xyXG4gICAgICAgICAgICAgICAgaS0tO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHB1YmxpYyBjbGVhclF1ZXVlKCk6IHZvaWQge1xyXG4gICAgICAgIHRoaXMuaXRlbVF1ZXVlLmxlbmd0aCA9IDA7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBjcmVhdGVFbnRyeShpdGVtSWQ6IHN0cmluZywgYW1vdW50OiBudW1iZXIpOiBDcmFmdFF1ZXVlRW50cnkge1xyXG4gICAgICAgIGNvbnN0IHJlY2lwZSA9IENyYWZ0aW5nSGVscGVyLmdldFJlY2lwZUZvclJlc3VsdChpdGVtSWQpO1xyXG4gICAgICAgIGNvbnN0IHJlbWFpbmluZ0NyYWZ0cyA9IE1hdGguY2VpbChhbW91bnQgLyAocmVjaXBlPy5yZXN1bHQuYW1vdW50ID8/IDEpKTtcclxuICAgICAgICByZXR1cm4geyBpZDogaXRlbUlkLCByZW1haW5pbmdDcmFmdHMgfTtcclxuICAgIH1cclxuXHJcbiAgICBwcm90ZWN0ZWQgb25FbnRlcihtZW1vcnk/OiBNZW1vcnkpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLmlzQ3JhZnRpbmdBdFRhYmxlID0gZmFsc2U7XHJcbiAgICAgICAgdGhpcy5jcmFmdGluZ1RhYmxlTG9jYXRpb24gPSBudWxsO1xyXG4gICAgICAgIHRoaXMub3duc0NyYWZ0aW5nVGFibGUgPSBmYWxzZTtcclxuXHJcbiAgICAgICAgaWYgKG1lbW9yeSkge1xyXG4gICAgICAgICAgICB0aGlzLnJlc3RvcmVNZW1vcnkobWVtb3J5KTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRoaXMucmVmcmVzaENyYWZ0aW5nVGFibGVPd25lcnNoaXAoKTtcclxuICAgICAgICBpZiAoIXRoaXMub3duc0NyYWZ0aW5nVGFibGUpIHRoaXMudmFsaWRhdGVFeGlzdGluZ093bmVkQ3JhZnRpbmdUYWJsZSgpO1xyXG4gICAgICAgIHRoaXMuZGV0ZXJtaW5lTmV4dENyYWZ0KCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSByZXN0b3JlTWVtb3J5KG1lbW9yeTogTWVtb3J5KTogdm9pZCB7XHJcbiAgICAgICAgaWYgKHRoaXMuaXRlbVF1ZXVlLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICAgICAgICBmb3IgKGNvbnN0IGVudHJ5IG9mIG1lbW9yeS5pdGVtUXVldWUgPz8gW10pIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuaXRlbVF1ZXVlLnB1c2goZW50cnkpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBpZiAoIXRoaXMuY3JhZnRpbmdUYWJsZUxvY2F0aW9uICYmIG1lbW9yeS5jcmFmdGluZ1RhYmxlTG9jYXRpb24pIHtcclxuICAgICAgICAgICAgdGhpcy5jcmFmdGluZ1RhYmxlTG9jYXRpb24gPSBWMy5mcm9tU2VyaWFsaXplZExvY2F0aW9uKG1lbW9yeS5jcmFmdGluZ1RhYmxlTG9jYXRpb24pO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcm90ZWN0ZWQgY3JlYXRlTWVtb3J5KCk6IE1lbW9yeSB8IHVuZGVmaW5lZCB7XHJcbiAgICAgICAgcmV0dXJuIHtcclxuICAgICAgICAgICAgaXRlbVF1ZXVlOiBbLi4udGhpcy5pdGVtUXVldWVdLFxyXG4gICAgICAgICAgICBjcmFmdGluZ1RhYmxlTG9jYXRpb246IHRoaXMuY3JhZnRpbmdUYWJsZUxvY2F0aW9uPy50b0pTT04oKSA/PyBudWxsLFxyXG4gICAgICAgIH07XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSByZWZyZXNoQ3JhZnRpbmdUYWJsZU93bmVyc2hpcCgpOiB2b2lkIHtcclxuICAgICAgICBpZiAoIXRoaXMub3duc0NyYWZ0aW5nVGFibGUpIHJldHVybjtcclxuICAgICAgICBpZiAoIXRoaXMuY3JhZnRpbmdUYWJsZUxvY2F0aW9uKSB7XHJcbiAgICAgICAgICAgIHRoaXMub3duc0NyYWZ0aW5nVGFibGUgPSBmYWxzZTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuICAgICAgICBjb25zdCBibG9jayA9IEJsb2NrVXRpbHMuZnJvbVYzKHRoaXMuY3JhZnRpbmdUYWJsZUxvY2F0aW9uKTtcclxuICAgICAgICBpZiAoYmxvY2s/LnR5cGUuaWQgPT09IENyYWZ0SXRlbXNQcm9jZWR1cmUuQ3JhZnRpbmdUYWJsZUlkKSByZXR1cm47XHJcblxyXG4gICAgICAgIHRoaXMub3duc0NyYWZ0aW5nVGFibGUgPSBmYWxzZTtcclxuICAgIH1cclxuXHJcbiAgICBwdWJsaWMgdmFsaWRhdGVFeGlzdGluZ093bmVkQ3JhZnRpbmdUYWJsZSgpOiB2b2lkIHtcclxuICAgICAgICBjb25zdCBjcmFmdGluZ1RhYmxlTG9jYXRpb24gPSBFbnRpdHlTdG9yZS5nZXQodGhpcy5jb250ZXh0LmVudGl0eSwgXCJvd25lZENyYWZ0aW5nVGFibGVMb2NhdGlvblwiKTtcclxuICAgICAgICBpZiAoIWNyYWZ0aW5nVGFibGVMb2NhdGlvbikgcmV0dXJuO1xyXG5cclxuICAgICAgICBjb25zdCBsb2NhdGlvbiA9IG5ldyBWMyhjcmFmdGluZ1RhYmxlTG9jYXRpb24pLnNldERpbWVuc2lvbihvdmVyd29ybGQpO1xyXG4gICAgICAgIGNvbnN0IGJsb2NrID0gQmxvY2tVdGlscy5mcm9tVjMobG9jYXRpb24pO1xyXG4gICAgICAgIGlmIChibG9jaz8udHlwZS5pZCAhPT0gQ3JhZnRJdGVtc1Byb2NlZHVyZS5DcmFmdGluZ1RhYmxlSWQpIHtcclxuICAgICAgICAgICAgRW50aXR5U3RvcmUuc2V0KHRoaXMuY29udGV4dC5lbnRpdHksIFwib3duZWRDcmFmdGluZ1RhYmxlTG9jYXRpb25cIiwgbnVsbCk7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRoaXMuY3JhZnRpbmdUYWJsZUxvY2F0aW9uID0gbG9jYXRpb247XHJcbiAgICAgICAgdGhpcy5vd25zQ3JhZnRpbmdUYWJsZSA9IHRydWU7XHJcbiAgICB9XHJcblxyXG4gICAgcHVibGljIGNsZWFyT3duZWRDcmFmdGluZ1RhYmxlKCk6IHZvaWQge1xyXG4gICAgICAgIEVudGl0eVN0b3JlLnNldCh0aGlzLmNvbnRleHQuZW50aXR5LCBcIm93bmVkQ3JhZnRpbmdUYWJsZUxvY2F0aW9uXCIsIG51bGwpO1xyXG4gICAgICAgIHRoaXMuY3JhZnRpbmdUYWJsZUxvY2F0aW9uID0gbnVsbDtcclxuICAgICAgICB0aGlzLm93bnNDcmFmdGluZ1RhYmxlID0gZmFsc2U7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBzZXRDcmFmdGluZ1RhYmxlQXNPd25lZChjcmFmdGluZ1RhYmxlTG9jYXRpb246IFYzKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5jcmFmdGluZ1RhYmxlTG9jYXRpb24gPSBjcmFmdGluZ1RhYmxlTG9jYXRpb247XHJcbiAgICAgICAgdGhpcy5vd25zQ3JhZnRpbmdUYWJsZSA9IHRydWU7XHJcbiAgICAgICAgRW50aXR5U3RvcmUuc2V0KHRoaXMuY29udGV4dC5lbnRpdHksIFwib3duZWRDcmFmdGluZ1RhYmxlTG9jYXRpb25cIiwgY3JhZnRpbmdUYWJsZUxvY2F0aW9uLnRvSlNPTigpKTtcclxuICAgIH1cclxuXHJcbiAgICBwcm90ZWN0ZWQgb3ZlcnJpZGUgb25BY3RpdmVUaWNrKCk6IHZvaWQge1xyXG4gICAgICAgIGlmICh0aGlzLmN1cnJlbnRTdWJzdGF0ZT8uaXMoUGF0aFRvTm9kZVByb2NlZHVyZSkpIHJldHVybiB0aGlzLndoaWxlUGF0aGluZygpO1xyXG5cclxuICAgICAgICBpZiAodGhpcy5pc0NyYWZ0aW5nQXRUYWJsZSAmJiB0aGlzLmNyYWZ0aW5nVGFibGVMb2NhdGlvbikge1xyXG4gICAgICAgICAgICBSb3RhdGlvbkhlbHBlci5sb29rQXRMb2NhdGlvbih0aGlzLmNvbnRleHQuZW50aXR5LCB0aGlzLmNyYWZ0aW5nVGFibGVMb2NhdGlvbik7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgUm90YXRpb25IZWxwZXIubG9va0F0SGFuZHModGhpcy5jb250ZXh0LmVudGl0eSk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgd2hpbGVQYXRoaW5nKCk6IHZvaWQge1xyXG4gICAgICAgIGlmICh0aGlzLmFjdGl2ZVRpY2tzICUgQ3JhZnRJdGVtc1Byb2NlZHVyZURhdGEuQ2FuSGlnaGxpZ2h0Q2hlY2tEdXJhdGlvbiAhPT0gMCkgcmV0dXJuO1xyXG4gICAgICAgIGlmICghdGhpcy5jcmFmdGluZ1RhYmxlTG9jYXRpb24pIHJldHVybjtcclxuXHJcbiAgICAgICAgY29uc3QgYmxvY2sgPSBCbG9ja1V0aWxzLmZyb21WMyh0aGlzLmNyYWZ0aW5nVGFibGVMb2NhdGlvbik7XHJcbiAgICAgICAgaWYgKEJsb2NrVXRpbHMuY2FuSGlnaGxpZ2h0QmxvY2sodGhpcy5jb250ZXh0LmVudGl0eSwgYmxvY2spKSB0aGlzLm9uU3Vic3RhdGVDb21wbGV0ZSh0aGlzLmN1cnJlbnRTdWJzdGF0ZSEpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZW5zdXJlQ3JhZnRpbmdUYWJsZSgpOiB2b2lkIHtcclxuICAgICAgICBjb25zdCBleGlzdGluZ1RhYmxlID0gdGhpcy5nZXRDcmFmdGluZ1RhYmxlSW5SYW5nZSgpO1xyXG4gICAgICAgIGlmIChleGlzdGluZ1RhYmxlKSB7XHJcbiAgICAgICAgICAgIHRoaXMuZ29Ub0V4aXN0aW5nQ3JhZnRpbmdUYWJsZShleGlzdGluZ1RhYmxlKTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdGhpcy5jcmFmdE9yQnVpbGROZXdDcmFmdGluZ1RhYmxlKCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBnb1RvRXhpc3RpbmdDcmFmdGluZ1RhYmxlKGV4aXN0aW5nVGFibGU6IFYzKTogdm9pZCB7XHJcbiAgICAgICAgaWYgKHRoaXMub3duc0NyYWZ0aW5nVGFibGUgJiYgdGhpcy5jcmFmdGluZ1RhYmxlTG9jYXRpb24gJiYgIXRoaXMuY3JhZnRpbmdUYWJsZUxvY2F0aW9uLnNoYXJlc0Jsb2NrV2l0aChleGlzdGluZ1RhYmxlKSkge1xyXG4gICAgICAgICAgICB0aGlzLm93bnNDcmFmdGluZ1RhYmxlID0gZmFsc2U7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB0aGlzLmNyYWZ0aW5nVGFibGVMb2NhdGlvbiA9IGV4aXN0aW5nVGFibGU7XHJcblxyXG4gICAgICAgIGNvbnN0IGJsb2NrID0gQmxvY2tVdGlscy5mcm9tVjModGhpcy5jcmFmdGluZ1RhYmxlTG9jYXRpb24pO1xyXG4gICAgICAgIGNvbnN0IGNhblVzZVRhYmxlTm93ID0gYmxvY2sgJiYgQmxvY2tVdGlscy5jYW5IaWdobGlnaHRCbG9jayh0aGlzLmNvbnRleHQuZW50aXR5LCBibG9jayk7XHJcblxyXG4gICAgICAgIGlmIChjYW5Vc2VUYWJsZU5vdykge1xyXG4gICAgICAgICAgICB0aGlzLnN0YXJ0TmV4dENyYWZ0KCk7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgY29uc3QgcGF0aFRvTm9kZVByb2NlZHVyZSA9IHRoaXMuZ2V0U3Vic3RhdGUoUGF0aFRvTm9kZVByb2NlZHVyZSk7XHJcbiAgICAgICAgICAgIHBhdGhUb05vZGVQcm9jZWR1cmUuc2V0UHJpbWFyeUxvY2F0aW9uKHRoaXMuY3JhZnRpbmdUYWJsZUxvY2F0aW9uKTtcclxuICAgICAgICAgICAgcGF0aFRvTm9kZVByb2NlZHVyZS5zZXRDYW5CcmVha0Jsb2NrcyghdGhpcy5pc0luSG9tZSk7XHJcbiAgICAgICAgICAgIHBhdGhUb05vZGVQcm9jZWR1cmUuc2V0Q2FuUGxhY2VCbG9ja3ModHJ1ZSk7XHJcbiAgICAgICAgICAgIHRoaXMuc2V0U3Vic3RhdGUocGF0aFRvTm9kZVByb2NlZHVyZSk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgY3JhZnRPckJ1aWxkTmV3Q3JhZnRpbmdUYWJsZSgpOiB2b2lkIHtcclxuICAgICAgICBjb25zdCBoYXNDcmFmdGluZ1RhYmxlSW5JbnZlbnRvcnkgPSBWaXJ0dWFsSW52ZW50b3J5Q29tcG9uZW50LmdldCh0aGlzLmNvbnRleHQuZW50aXR5KS5oYXNJdGVtVHlwZShcclxuICAgICAgICAgICAgQ3JhZnRJdGVtc1Byb2NlZHVyZS5DcmFmdGluZ1RhYmxlSWRcclxuICAgICAgICApO1xyXG4gICAgICAgIGlmICghaGFzQ3JhZnRpbmdUYWJsZUluSW52ZW50b3J5KSB7XHJcbiAgICAgICAgICAgIHRoaXMuaXRlbVF1ZXVlLnVuc2hpZnQoeyBpZDogQ3JhZnRJdGVtc1Byb2NlZHVyZS5DcmFmdGluZ1RhYmxlSWQsIHJlbWFpbmluZ0NyYWZ0czogMSB9KTtcclxuICAgICAgICAgICAgdGhpcy5kZXRlcm1pbmVOZXh0Q3JhZnQoKTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc3QgZ29CdWlsZEJsb2NrUHJvY2VkdXJlID0gdGhpcy5nZXRTdWJzdGF0ZShHb0J1aWxkQmxvY2tQcm9jZWR1cmUpO1xyXG4gICAgICAgIGdvQnVpbGRCbG9ja1Byb2NlZHVyZS5zZXRQZXJtdXRhdGlvbihCbG9ja1Blcm11dGF0aW9uLnJlc29sdmUoQ3JhZnRJdGVtc1Byb2NlZHVyZS5DcmFmdGluZ1RhYmxlSWQpKTtcclxuICAgICAgICBnb0J1aWxkQmxvY2tQcm9jZWR1cmUuc2V0UmVtb3ZlRnJvbUludmVudG9yeSh0cnVlKTtcclxuICAgICAgICBnb0J1aWxkQmxvY2tQcm9jZWR1cmUuc2V0SXNJbkhvbWUodGhpcy5pc0luSG9tZSk7XHJcbiAgICAgICAgdGhpcy5zZXRTdWJzdGF0ZShnb0J1aWxkQmxvY2tQcm9jZWR1cmUpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZ2V0Q3JhZnRpbmdUYWJsZUluUmFuZ2UoKTogVjMgfCBudWxsIHtcclxuICAgICAgICBjb25zdCBlbnRpdHlMb2NhdGlvbiA9IHRoaXMuY29udGV4dC5nZXRWYWx1ZShMb2NhdGlvblZhcikuJC5mbG9vcigpO1xyXG4gICAgICAgIGNvbnN0IHJhZGl1cyA9IENyYWZ0SXRlbXNQcm9jZWR1cmVEYXRhLkNyYWZ0aW5nVGFibGVTZWFyY2hSYWRpdXM7XHJcbiAgICAgICAgY29uc3QgZmlsdGVyOiBCbG9ja0ZpbHRlciA9IHsgaW5jbHVkZVR5cGVzOiBbQ3JhZnRJdGVtc1Byb2NlZHVyZS5DcmFmdGluZ1RhYmxlSWRdIH07XHJcblxyXG4gICAgICAgIGNvbnN0IGJsb2NrcyA9IEJsb2NrVXRpbHMuZ2V0QmxvY2tzSW5Wb2x1bWUoZW50aXR5TG9jYXRpb24sIHJhZGl1cywgZmlsdGVyKTtcclxuXHJcbiAgICAgICAgaWYgKGJsb2Nrcy5nZXRDYXBhY2l0eSgpID09PSAwKSByZXR1cm4gbnVsbDtcclxuXHJcbiAgICAgICAgY29uc3QgbG9jYXRpb24gPSBibG9ja3MuZ2V0QmxvY2tMb2NhdGlvbkl0ZXJhdG9yKCkubmV4dCgpLnZhbHVlO1xyXG4gICAgICAgIGlmICghbG9jYXRpb24pIHJldHVybiBudWxsO1xyXG4gICAgICAgIHJldHVybiBuZXcgVjMobG9jYXRpb24pLnNldERpbWVuc2lvbihvdmVyd29ybGQpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZGV0ZXJtaW5lTmV4dENyYWZ0KCk6IHZvaWQge1xyXG4gICAgICAgIGlmICh0aGlzLml0ZW1RdWV1ZS5sZW5ndGggPT09IDApIHJldHVybiB0aGlzLmJyb2FkY2FzdFNpZ25hbChcIm9uQ29tcGxldGVcIik7XHJcblxyXG4gICAgICAgIGNvbnN0IGVudHJ5ID0gdGhpcy5pdGVtUXVldWVbMF07XHJcbiAgICAgICAgY29uc3QgcmVjaXBlID0gQ3JhZnRpbmdIZWxwZXIuZ2V0UmVjaXBlRm9yUmVzdWx0KGVudHJ5LmlkKTtcclxuXHJcbiAgICAgICAgaWYgKCFyZWNpcGUpIHJldHVybiB0aGlzLmJyb2FkY2FzdFNpZ25hbChcIm9uRmFpbHVyZVwiKTtcclxuXHJcbiAgICAgICAgY29uc3QgbWlzc2luZ0luZ3JlZGllbnRzOiBDcmFmdFF1ZXVlRW50cnlbXSA9IFtdO1xyXG4gICAgICAgIGxldCBoYXNNaXNzaW5nQmFzZUluZ3JlZGllbnQgPSBmYWxzZTtcclxuXHJcbiAgICAgICAgZm9yIChjb25zdCBpbmdyZWRpZW50IG9mIHJlY2lwZS5pbmdyZWRpZW50cykge1xyXG4gICAgICAgICAgICBjb25zdCB0b3RhbE5lZWRlZCA9IGVudHJ5LnJlbWFpbmluZ0NyYWZ0cyAqIGluZ3JlZGllbnQuYW1vdW50O1xyXG4gICAgICAgICAgICBjb25zdCBjdXJyZW50Q291bnQgPSBDcmFmdGluZ0hlbHBlci5nZXRJdGVtQ291bnRGb3JJbmdyZWRpZW50KHRoaXMuY29udGV4dC5lbnRpdHksIGluZ3JlZGllbnQpO1xyXG4gICAgICAgICAgICBpZiAoY3VycmVudENvdW50ID49IHRvdGFsTmVlZGVkKSBjb250aW51ZTtcclxuXHJcbiAgICAgICAgICAgIGNvbnN0IGluZ3JlZGllbnRSZWNpcGUgPSBDcmFmdGluZ0hlbHBlci5nZXRSZWNpcGVGb3JSZXN1bHQoaW5ncmVkaWVudC5pZCk7XHJcbiAgICAgICAgICAgIGlmICghaW5ncmVkaWVudFJlY2lwZSkge1xyXG4gICAgICAgICAgICAgICAgaGFzTWlzc2luZ0Jhc2VJbmdyZWRpZW50ID0gdHJ1ZTtcclxuICAgICAgICAgICAgICAgIGNvbnRpbnVlOyAvL0Jhc2UgKHVuY3JhZnRhYmxlKSBpbmdyZWRpZW50IG1pc3NpbmdcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgY29uc3QgbWlzc2luZ0Ftb3VudCA9IHRvdGFsTmVlZGVkIC0gY3VycmVudENvdW50O1xyXG4gICAgICAgICAgICBjb25zdCByZW1haW5pbmdDcmFmdHMgPSBNYXRoLmNlaWwobWlzc2luZ0Ftb3VudCAvIGluZ3JlZGllbnRSZWNpcGUucmVzdWx0LmFtb3VudCk7XHJcbiAgICAgICAgICAgIG1pc3NpbmdJbmdyZWRpZW50cy5wdXNoKHsgaWQ6IGluZ3JlZGllbnQuaWQsIHJlbWFpbmluZ0NyYWZ0czogcmVtYWluaW5nQ3JhZnRzIH0pO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgaWYgKG1pc3NpbmdJbmdyZWRpZW50cy5sZW5ndGggPiAwKSB7XHJcbiAgICAgICAgICAgIC8vIFByZXBlbmQgbWlzc2luZyBpbmdyZWRpZW50cyBzbyB0aGV5IGFyZSBjcmFmdGVkIGJlZm9yZSB0aGUgY3VycmVudCBpdGVtXHJcbiAgICAgICAgICAgIHRoaXMuaXRlbVF1ZXVlLnVuc2hpZnQoLi4ubWlzc2luZ0luZ3JlZGllbnRzKTtcclxuICAgICAgICAgICAgdGhpcy5kZXRlcm1pbmVOZXh0Q3JhZnQoKTtcclxuICAgICAgICB9IGVsc2UgaWYgKGhhc01pc3NpbmdCYXNlSW5ncmVkaWVudCkge1xyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5icm9hZGNhc3RTaWduYWwoXCJvbkZhaWx1cmVcIik7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgdGhpcy5zdGFydE5leHRDcmFmdCgpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHNob3VsZEVuc3VyZUNyYWZ0aW5nVGFibGUoKTogYm9vbGVhbiB7XHJcbiAgICAgICAgLy9BbHJlYWR5IHF1ZXVlZCB0byBjcmFmdCBhIHRhYmxlXHJcbiAgICAgICAgZm9yIChjb25zdCBlbnRyeSBvZiB0aGlzLml0ZW1RdWV1ZSkge1xyXG4gICAgICAgICAgICBpZiAoZW50cnkuaWQgPT09IENyYWZ0SXRlbXNQcm9jZWR1cmUuQ3JhZnRpbmdUYWJsZUlkKSByZXR1cm4gZmFsc2U7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvL0FscmVhZHkgaGF2ZSBhIGNyYWZ0aW5nIHRhYmxlXHJcbiAgICAgICAgaWYgKHRoaXMuY3JhZnRpbmdUYWJsZUxvY2F0aW9uKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGJsb2NrID0gQmxvY2tVdGlscy5mcm9tVjModGhpcy5jcmFmdGluZ1RhYmxlTG9jYXRpb24pO1xyXG5cclxuICAgICAgICAgICAgLy9CbG9jayBpcyBubyBsb25nZXIgYSBjcmFmdGluZyB0YWJsZVxyXG4gICAgICAgICAgICBpZiAoYmxvY2s/LnR5cGUuaWQgIT09IENyYWZ0SXRlbXNQcm9jZWR1cmUuQ3JhZnRpbmdUYWJsZUlkKSB7XHJcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5vd25zQ3JhZnRpbmdUYWJsZSkgdGhpcy5jbGVhck93bmVkQ3JhZnRpbmdUYWJsZSgpO1xyXG4gICAgICAgICAgICAgICAgZWxzZSB0aGlzLmNyYWZ0aW5nVGFibGVMb2NhdGlvbiA9IG51bGw7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgLy9DcmFmdGluZyB0YWJsZSBpcyBvdXQgb2YgcmVhY2gvbGluZSBvZiBzaWdodFxyXG4gICAgICAgICAgICBpZiAoIUJsb2NrVXRpbHMuY2FuSGlnaGxpZ2h0QmxvY2sodGhpcy5jb250ZXh0LmVudGl0eSwgYmxvY2spKSByZXR1cm4gdHJ1ZTtcclxuXHJcbiAgICAgICAgICAgIC8vVGFibGUgaXMgdmFsaWQgYW5kIGFjY2Vzc2libGUsIG5vIG5lZWQgdG8gZW5zdXJlXHJcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGZvciAoY29uc3QgZW50cnkgb2YgdGhpcy5pdGVtUXVldWUpIHtcclxuICAgICAgICAgICAgaWYgKENyYWZ0aW5nSGVscGVyLmRvZXNJdGVtUmVxdWlyZUNyYWZ0aW5nVGFibGUoZW50cnkuaWQpKSByZXR1cm4gdHJ1ZTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vSXRlbSBkb2Vzbid0IHJlcXVpcmUgYSBjcmFmdGluZyB0YWJsZVxyXG4gICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHN0YXJ0TmV4dENyYWZ0KCkge1xyXG4gICAgICAgIGlmICh0aGlzLnNob3VsZEVuc3VyZUNyYWZ0aW5nVGFibGUoKSkge1xyXG4gICAgICAgICAgICB0aGlzLmVuc3VyZUNyYWZ0aW5nVGFibGUoKTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gcGVlayAoc2hpZnRlZCBvbmx5IGFmdGVyIHJlbWFpbmluZ0NyYWZ0cyBoaXRzIDApXHJcbiAgICAgICAgY29uc3QgZW50cnkgPSB0aGlzLml0ZW1RdWV1ZVswXTtcclxuXHJcbiAgICAgICAgdGhpcy5pc0NyYWZ0aW5nQXRUYWJsZSA9IHRoaXMuY3JhZnRpbmdUYWJsZUxvY2F0aW9uICE9PSBudWxsO1xyXG5cclxuICAgICAgICB0aGlzLmdldFN1YnN0YXRlKENyYWZ0SXRlbVByb2NlZHVyZSkuc2V0SXRlbUlkKGVudHJ5LmlkKTtcclxuICAgICAgICB0aGlzLnNldFN1YnN0YXRlKHRoaXMuZ2V0U3Vic3RhdGUoQ3JhZnRJdGVtUHJvY2VkdXJlKSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHVibGljIG92ZXJyaWRlIG9uU3Vic3RhdGVDb21wbGV0ZShzdGF0ZTogQWJzdHJhY3RTdGF0ZSk6IHZvaWQge1xyXG4gICAgICAgIGlmIChzdGF0ZS5pcyhHb0J1aWxkQmxvY2tQcm9jZWR1cmUpKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGNyYWZ0aW5nVGFibGVMb2NhdGlvbiA9IHRoaXMuZ2V0U3Vic3RhdGUoR29CdWlsZEJsb2NrUHJvY2VkdXJlKS5sb2NhdGlvbjtcclxuICAgICAgICAgICAgaWYgKGNyYWZ0aW5nVGFibGVMb2NhdGlvbikgdGhpcy5zZXRDcmFmdGluZ1RhYmxlQXNPd25lZChjcmFmdGluZ1RhYmxlTG9jYXRpb24pO1xyXG4gICAgICAgICAgICB0aGlzLnN0YXJ0TmV4dENyYWZ0KCk7XHJcbiAgICAgICAgfSBlbHNlIGlmIChzdGF0ZS5pcyhQYXRoVG9Ob2RlUHJvY2VkdXJlKSkge1xyXG4gICAgICAgICAgICB0aGlzLnN0YXJ0TmV4dENyYWZ0KCk7XHJcbiAgICAgICAgfSBlbHNlIGlmIChzdGF0ZS5pcyhDcmFmdEl0ZW1Qcm9jZWR1cmUpKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGVudHJ5ID0gdGhpcy5pdGVtUXVldWVbMF07XHJcbiAgICAgICAgICAgIGVudHJ5LnJlbWFpbmluZ0NyYWZ0cy0tO1xyXG4gICAgICAgICAgICBpZiAoZW50cnkucmVtYWluaW5nQ3JhZnRzID4gMCkge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5zdGFydE5leHRDcmFmdCgpO1xyXG4gICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5pdGVtUXVldWUuc2hpZnQoKTtcclxuICAgICAgICAgICAgICAgIGlmICh0aGlzLml0ZW1RdWV1ZS5sZW5ndGggPT09IDApIHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmJyb2FkY2FzdFNpZ25hbChcIm9uQ29tcGxldGVcIik7XHJcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZGV0ZXJtaW5lTmV4dENyYWZ0KCk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJvdGVjdGVkIG9uU3Vic3RhdGVGYWlsdXJlKHN0YXRlOiBBYnN0cmFjdFN0YXRlKTogdm9pZCB7XHJcbiAgICAgICAgaWYgKHN0YXRlLmlzKFBhdGhUb05vZGVQcm9jZWR1cmUpKSB7XHJcbiAgICAgICAgICAgIC8vR2l2ZSB1cCBhbmQgcGxhY2UgYSBjcmFmdGluZyB0YWJsZSBpbnN0ZWFkXHJcbiAgICAgICAgICAgIHRoaXMuY3JhZnRPckJ1aWxkTmV3Q3JhZnRpbmdUYWJsZSgpO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB0aGlzLmJyb2FkY2FzdFNpZ25hbChcIm9uRmFpbHVyZVwiKTtcclxuICAgIH1cclxufVxyXG4iXSwibmFtZXMiOlsiQmxvY2tQZXJtdXRhdGlvbiIsIkxvY2F0aW9uVmFyIiwiQ3JhZnRJdGVtc1Byb2NlZHVyZURhdGEiLCJDcmFmdGluZ0hlbHBlciIsIlJvdGF0aW9uSGVscGVyIiwiVjMiLCJWaXJ0dWFsSW52ZW50b3J5Q29tcG9uZW50IiwiQ29tcG9zaXRlU3RhdGUiLCJCbG9ja1V0aWxzIiwiQ3JhZnRJdGVtUHJvY2VkdXJlIiwiR29CdWlsZEJsb2NrUHJvY2VkdXJlIiwiUGF0aFRvTm9kZVByb2NlZHVyZSIsInJlZ2lzdHJ5IiwiQ3JhZnRJdGVtc1Byb2NlZHVyZSIsInNldElzSW5Ib21lIiwiaXNJbkhvbWUiLCJhZGRJdGVtVG9RdWV1ZSIsIml0ZW1JZCIsImFtb3VudCIsIml0ZW1RdWV1ZSIsInNvbWUiLCJlbnRyeSIsImlkIiwid2FzRW1wdHkiLCJsZW5ndGgiLCJwdXNoIiwiY3JlYXRlRW50cnkiLCJpc0FjdGl2ZSIsImRldGVybWluZU5leHRDcmFmdCIsInByZXBlbmRJdGVtVG9RdWV1ZSIsInVuc2hpZnQiLCJoYXNJdGVtSW5RdWV1ZSIsInJlbW92ZUl0ZW1Gcm9tUXVldWUiLCJpdGVtQ291bnQiLCJyZWNpcGUiLCJnZXRSZWNpcGVGb3JSZXN1bHQiLCJjcmFmdHNUb1JlbW92ZSIsIk1hdGgiLCJmbG9vciIsInJlc3VsdCIsImkiLCJyZW1haW5pbmdDcmFmdHMiLCJzcGxpY2UiLCJjbGVhclF1ZXVlIiwiY2VpbCIsIm9uRW50ZXIiLCJtZW1vcnkiLCJpc0NyYWZ0aW5nQXRUYWJsZSIsImNyYWZ0aW5nVGFibGVMb2NhdGlvbiIsIm93bnNDcmFmdGluZ1RhYmxlIiwicmVzdG9yZU1lbW9yeSIsInJlZnJlc2hDcmFmdGluZ1RhYmxlT3duZXJzaGlwIiwidmFsaWRhdGVFeGlzdGluZ093bmVkQ3JhZnRpbmdUYWJsZSIsImZyb21TZXJpYWxpemVkTG9jYXRpb24iLCJjcmVhdGVNZW1vcnkiLCJ0b0pTT04iLCJibG9jayIsImZyb21WMyIsInR5cGUiLCJDcmFmdGluZ1RhYmxlSWQiLCJFbnRpdHlTdG9yZSIsImdldCIsImNvbnRleHQiLCJlbnRpdHkiLCJsb2NhdGlvbiIsInNldERpbWVuc2lvbiIsIm92ZXJ3b3JsZCIsInNldCIsImNsZWFyT3duZWRDcmFmdGluZ1RhYmxlIiwic2V0Q3JhZnRpbmdUYWJsZUFzT3duZWQiLCJvbkFjdGl2ZVRpY2siLCJjdXJyZW50U3Vic3RhdGUiLCJpcyIsIndoaWxlUGF0aGluZyIsImxvb2tBdExvY2F0aW9uIiwibG9va0F0SGFuZHMiLCJhY3RpdmVUaWNrcyIsIkNhbkhpZ2hsaWdodENoZWNrRHVyYXRpb24iLCJjYW5IaWdobGlnaHRCbG9jayIsIm9uU3Vic3RhdGVDb21wbGV0ZSIsImVuc3VyZUNyYWZ0aW5nVGFibGUiLCJleGlzdGluZ1RhYmxlIiwiZ2V0Q3JhZnRpbmdUYWJsZUluUmFuZ2UiLCJnb1RvRXhpc3RpbmdDcmFmdGluZ1RhYmxlIiwiY3JhZnRPckJ1aWxkTmV3Q3JhZnRpbmdUYWJsZSIsInNoYXJlc0Jsb2NrV2l0aCIsImNhblVzZVRhYmxlTm93Iiwic3RhcnROZXh0Q3JhZnQiLCJwYXRoVG9Ob2RlUHJvY2VkdXJlIiwiZ2V0U3Vic3RhdGUiLCJzZXRQcmltYXJ5TG9jYXRpb24iLCJzZXRDYW5CcmVha0Jsb2NrcyIsInNldENhblBsYWNlQmxvY2tzIiwic2V0U3Vic3RhdGUiLCJoYXNDcmFmdGluZ1RhYmxlSW5JbnZlbnRvcnkiLCJoYXNJdGVtVHlwZSIsImdvQnVpbGRCbG9ja1Byb2NlZHVyZSIsInNldFBlcm11dGF0aW9uIiwicmVzb2x2ZSIsInNldFJlbW92ZUZyb21JbnZlbnRvcnkiLCJlbnRpdHlMb2NhdGlvbiIsImdldFZhbHVlIiwiJCIsInJhZGl1cyIsIkNyYWZ0aW5nVGFibGVTZWFyY2hSYWRpdXMiLCJmaWx0ZXIiLCJpbmNsdWRlVHlwZXMiLCJibG9ja3MiLCJnZXRCbG9ja3NJblZvbHVtZSIsImdldENhcGFjaXR5IiwiZ2V0QmxvY2tMb2NhdGlvbkl0ZXJhdG9yIiwibmV4dCIsInZhbHVlIiwiYnJvYWRjYXN0U2lnbmFsIiwibWlzc2luZ0luZ3JlZGllbnRzIiwiaGFzTWlzc2luZ0Jhc2VJbmdyZWRpZW50IiwiaW5ncmVkaWVudCIsImluZ3JlZGllbnRzIiwidG90YWxOZWVkZWQiLCJjdXJyZW50Q291bnQiLCJnZXRJdGVtQ291bnRGb3JJbmdyZWRpZW50IiwiaW5ncmVkaWVudFJlY2lwZSIsIm1pc3NpbmdBbW91bnQiLCJzaG91bGRFbnN1cmVDcmFmdGluZ1RhYmxlIiwiZG9lc0l0ZW1SZXF1aXJlQ3JhZnRpbmdUYWJsZSIsInNldEl0ZW1JZCIsInN0YXRlIiwic2hpZnQiLCJvblN1YnN0YXRlRmFpbHVyZSIsImRlZmluaXRpb24iLCJpZGVudGlmaWVyIiwicHJpb3JpdHkiLCJQcmlvcml0eSIsImluaXRpYWxTdGF0ZSJdLCJtYXBwaW5ncyI6IkFBQUEsU0FBc0JBLGdCQUFnQixRQUFRLG9CQUFvQjtBQUNsRSxTQUFTQyxXQUFXLFFBQVEsK0JBQStCO0FBRTNELE9BQU9DLDZCQUE2QixtREFBbUQ7QUFDdkYsT0FBT0Msb0JBQW9CLHlCQUF5QjtBQUNwRCxPQUFPQyxvQkFBb0IseUJBQXlCO0FBQ3BELE9BQU9DLFFBQVEscUJBQXFCO0FBQ3BDLE9BQU9DLCtCQUErQixzQ0FBc0M7QUFFNUUsT0FBT0Msb0JBQW9CLHNDQUFzQztBQUVqRSxPQUFPQyxnQkFBZ0IsbUJBQW1CO0FBQzFDLFNBQVNDLGtCQUFrQixRQUFRLHVCQUF1QjtBQUMxRCxTQUFTQyxxQkFBcUIsUUFBUSwwQkFBMEI7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