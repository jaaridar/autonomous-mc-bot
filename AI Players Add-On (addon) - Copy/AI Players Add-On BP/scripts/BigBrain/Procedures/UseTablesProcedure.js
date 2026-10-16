import { ItemStack } from "@minecraft/server";
import { NearestHomeVar } from "BigBrain/Context/NearestHomeVar";
import { CraftItemsProcedure } from "BigBrain/Procedures/CraftItemsProcedure";
import { GoUseChestsProcedure } from "BigBrain/Procedures/GoUseChestsProcedure";
import { GoUseFurnaceProcedure } from "BigBrain/Procedures/GoUseFurnaceProcedure";
import AIPData from "Data/AIPData";
import GoUseFurnaceProcedureData from "Data/BigBrain/Procedures/GoUseFurnaceProcedureData";
import UseTablesProcedureData from "Data/BigBrain/Procedures/UseTablesProcedureData";
import CraftingHelper from "Helpers/CraftingHelper";
import InventoryHelper from "Inventory/InventoryHelper";
import VirtualInventoryComponent from "Inventory/VirtualInventoryComponent";
import CompositeState from "StateSkeleton/States/CompositeState";
import BlockUtils from "Utils/BlockUtils";
import { MineBlocksProcedure } from "./MineBlocksProcedure";
const registry = [
    CraftItemsProcedure,
    GoUseFurnaceProcedure,
    GoUseChestsProcedure,
    MineBlocksProcedure
];
export class UseTablesProcedure extends CompositeState {
    setCanSmelt(canSmelt) {
        this.canSmelt = canSmelt;
    }
    isInHome() {
        const nearestHome = this.context.getValue(NearestHomeVar);
        if (!nearestHome) return false;
        return nearestHome.distance <= AIPData.InHomeRadius;
    }
    onEnter() {
        this.missingIngredient = null;
        this.afterChestAction = null;
        this.afterFurnaceAction = null;
        this.pendingExitSignal = null;
        const isInHome = this.isInHome();
        if (isInHome) {
            this.afterFurnaceAction = "startUsingChests";
            const goUseFurnace = this.getSubstate(GoUseFurnaceProcedure);
            goUseFurnace.setFurnaceIntent("withdraw");
            this.setSubstate(goUseFurnace);
        } else {
            this.setSubstate(this.getSubstate(CraftItemsProcedure));
        }
    }
    onSubstateComplete(state) {
        if (state.is(GoUseChestsProcedure)) this.handleAfterChest();
        else if (state.is(CraftItemsProcedure)) this.finishWithSignal("onComplete");
        else if (state.is(GoUseFurnaceProcedure)) this.handleAfterSmelt(true);
        else if (state.is(MineBlocksProcedure)) this.handleAfterMining();
    }
    onSubstateFailure(state) {
        if (state.is(GoUseChestsProcedure)) this.handleAfterChest();
        else if (state.is(CraftItemsProcedure)) this.handleCraftFailure();
        else if (state.is(GoUseFurnaceProcedure)) this.handleAfterSmelt(false);
        else if (state.is(MineBlocksProcedure)) {
            this.setSubstate(null);
            if (this.pendingExitSignal) {
                const signal = this.pendingExitSignal;
                this.pendingExitSignal = null;
                return this.broadcastSignal(signal);
            }
            this.broadcastSignal("onFailure");
        } else this.tryCleanUpTablesAndExitWithSignal("onFailure");
    }
    handleAfterMining() {
        this.setSubstate(null);
        if (this.tryDestroyCraftingTable()) return;
        if (this.pendingExitSignal) {
            const signal = this.pendingExitSignal;
            this.pendingExitSignal = null;
            return this.finishWithSignal(signal);
        }
    }
    handleAfterChest() {
        const action = this.afterChestAction;
        this.afterChestAction = null;
        switch(action){
            case "startCrafting":
                this.startCrafting();
                break;
            case "startUsingFurnace":
                if (this.tryStartExtraSmelt()) return;
                this.tryCleanUpTablesAndExitWithSignal("onComplete");
                break;
            case "onComplete":
                this.tryCleanUpTablesAndExitWithSignal("onComplete");
                break;
            case "onFailure":
                this.tryCleanUpTablesAndExitWithSignal("onFailure");
                break;
        }
    }
    startCrafting() {
        const craftItems = this.getSubstate(CraftItemsProcedure);
        craftItems.setIsInHome(this.isInHome());
        this.setSubstate(craftItems);
    }
    handleAfterSmelt(wasSuccessful) {
        const action = this.afterFurnaceAction;
        this.afterFurnaceAction = null;
        switch(action){
            case "startUsingChests":
                this.afterChestAction = "startCrafting";
                // eslint-disable-next-line no-case-declarations
                const goUseChest = this.getSubstate(GoUseChestsProcedure);
                goUseChest.setIntent("beforeCrafting");
                goUseChest.setNeededIngredients(this.resolveNeededIngredients());
                this.setSubstate(goUseChest);
                break;
            case "startCrafting":
                if (!wasSuccessful) return this.handleSmeltFailure();
                this.startCrafting();
                break;
            case "onComplete":
                this.tryCleanUpTablesAndExitWithSignal("onComplete");
                break;
        }
    }
    tryStartExtraSmelt() {
        const bestItemToSmelt = InventoryHelper.getBestItemToSmelt(this.context.entity);
        if (!bestItemToSmelt) return false;
        this.afterFurnaceAction = "onComplete";
        const smeltSubstate = this.getSubstate(GoUseFurnaceProcedure);
        smeltSubstate.setIsInHome(this.isInHome());
        smeltSubstate.setShouldWaitForSmeltCompletion(false);
        smeltSubstate.setItemToSmelt(bestItemToSmelt);
        smeltSubstate.setFurnaceIntent("smeltItems");
        this.setSubstate(smeltSubstate);
        return true;
    }
    finishWithSignal(signal) {
        if (!this.isInHome()) return this.tryCleanUpTablesAndExitWithSignal(signal);
        this.afterChestAction = signal === "onComplete" ? "startUsingFurnace" : "onFailure";
        const goUseChest = this.getSubstate(GoUseChestsProcedure);
        goUseChest.setIntent("afterCrafting");
        this.setSubstate(goUseChest);
    }
    handleCraftFailure() {
        const craftingSubstate = this.getSubstate(CraftItemsProcedure);
        const failedEntry = craftingSubstate.itemQueue[0];
        if (!failedEntry) return this.fail(null);
        const recipe = CraftingHelper.getRecipeForResult(failedEntry.id);
        const resultAmount = recipe?.result.amount ?? 1;
        const totalAmount = failedEntry.remainingCrafts * resultAmount;
        const resultItem = {
            id: failedEntry.id,
            amount: totalAmount
        };
        const missingIngredient = CraftingHelper.getFirstMissingBaseIngredient(resultItem, this.context.entity);
        if (missingIngredient === null) return this.fail(null);
        const oreToSmelt = this.getOreToSmelt(missingIngredient);
        if (oreToSmelt && this.canSmelt) {
            this.afterFurnaceAction = "startCrafting";
            const smeltingSubstate = this.getSubstate(GoUseFurnaceProcedure);
            smeltingSubstate.setIsInHome(this.isInHome());
            smeltingSubstate.setItemToSmelt(oreToSmelt);
            smeltingSubstate.setShouldWaitForSmeltCompletion(true);
            smeltingSubstate.setFurnaceIntent("smeltItems");
            this.setSubstate(smeltingSubstate);
            return;
        }
        this.fail(missingIngredient);
    }
    handleSmeltFailure() {
        const smeltState = this.getSubstate(GoUseFurnaceProcedure);
        switch(smeltState.failureReason){
            case "noFurnace":
                this.getSubstate(CraftItemsProcedure).prependItemToQueue("minecraft:furnace");
                this.startCrafting();
                break;
            case "noFuel":
                this.fail({
                    id: "minecraft:coal",
                    amount: 1
                });
                break;
            default:
                this.finishWithSignal("onFailure");
                break;
        }
    }
    getOreToSmelt(ingredient) {
        const oreType = CraftingHelper.getRawMaterialFromSmeltedMaterialType(ingredient.id);
        if (!oreType) return null;
        if (VirtualInventoryComponent.get(this.context.entity).countItemType(oreType) < ingredient.amount) return null;
        return new ItemStack(oreType, ingredient.amount);
    }
    resolveNeededIngredients() {
        const totals = new Map();
        this.resolveNeededCraftingIngredients(totals);
        const totalSmeltsNeeded = this.resolveNeededOres(totals);
        this.resolveNeededFuel(totals, totalSmeltsNeeded);
        return Array.from(totals.entries()).map(([id, amount])=>({
                id,
                amount
            }));
    }
    resolveNeededCraftingIngredients(totals) {
        for (const entry of this.getSubstate(CraftItemsProcedure).itemQueue){
            const recipe = CraftingHelper.getRecipeForResult(entry.id);
            const amount = entry.remainingCrafts * recipe.result.amount;
            const ingredients = CraftingHelper.getAllCraftingTreeIngredients({
                id: entry.id,
                amount
            });
            for (const { id, amount } of ingredients){
                const currentTotal = totals.get(id) ?? 0;
                totals.set(id, currentTotal + amount);
            }
        }
    }
    resolveNeededOres(totals) {
        let totalSmeltsNeeded = 0;
        for (const [id, amount] of [
            ...totals.entries()
        ]){
            const oreType = CraftingHelper.getRawMaterialFromSmeltedMaterialType(id);
            if (!oreType) continue;
            totals.set(oreType, (totals.get(oreType) ?? 0) + amount);
            totalSmeltsNeeded += amount;
        }
        return totalSmeltsNeeded;
    }
    resolveNeededFuel(totals, totalSmeltsNeeded) {
        if (totalSmeltsNeeded <= 0) return;
        const fuelEntries = Object.entries(GoUseFurnaceProcedureData.FuelDurationMap);
        for (const [fuelTypeId, fuelDuration] of fuelEntries){
            const fuelIngredient = {
                id: fuelTypeId,
                amount: Math.ceil(totalSmeltsNeeded / fuelDuration)
            };
            totals.set(fuelIngredient.id, (totals.get(fuelIngredient.id) ?? 0) + fuelIngredient.amount);
        }
    }
    fail(missingIngredient) {
        this.missingIngredient = missingIngredient;
        this.finishWithSignal("onFailure");
    }
    tryCleanUpTablesAndExitWithSignal(signal) {
        //Already destroying a table
        if (this.getSubstate(MineBlocksProcedure).isActive) return;
        if (this.tryDestroyFurnace() || this.tryDestroyCraftingTable()) {
            this.pendingExitSignal = signal;
            return;
        }
        this.setSubstate(null);
        this.broadcastSignal(signal);
    }
    tryDestroyFurnace() {
        if (this.isInHome()) return false;
        const goUseFurnace = this.getSubstate(GoUseFurnaceProcedure);
        if (!goUseFurnace.ownsFurnace) goUseFurnace.validateExistingOwnedFurnace();
        if (!goUseFurnace.ownsFurnace || !goUseFurnace.furnace) return false;
        if (!GoUseFurnaceProcedure.isFurnace(goUseFurnace.furnace)) return false;
        const mineBlocksProcedure = this.getSubstate(MineBlocksProcedure);
        mineBlocksProcedure.setBlocks([
            goUseFurnace.furnace
        ]);
        goUseFurnace.clearOwnedFurnace();
        this.setSubstate(mineBlocksProcedure);
        return true;
    }
    tryDestroyCraftingTable() {
        if (this.isInHome()) return false;
        const craftItemsProcedure = this.getSubstate(CraftItemsProcedure);
        if (!craftItemsProcedure.ownsCraftingTable) craftItemsProcedure.validateExistingOwnedCraftingTable();
        if (!craftItemsProcedure.ownsCraftingTable || !craftItemsProcedure.craftingTableLocation) return false;
        const craftingTableBlock = BlockUtils.fromV3(craftItemsProcedure.craftingTableLocation);
        if (!craftingTableBlock || craftingTableBlock.type.id !== CraftItemsProcedure.CraftingTableId) return false;
        const mineBlocksProcedure = this.getSubstate(MineBlocksProcedure);
        mineBlocksProcedure.setBlocks([
            craftingTableBlock
        ]);
        craftItemsProcedure.clearOwnedCraftingTable();
        this.setSubstate(mineBlocksProcedure);
        return true;
    }
    constructor(...args){
        super(...args);
        this.missingIngredient = null;
        this.afterChestAction = null;
        this.afterFurnaceAction = null;
        this.canSmelt = true;
        this.pendingExitSignal = null;
    }
}
UseTablesProcedure.definition = {
    identifier: "procedure:use_tables",
    priority: UseTablesProcedureData.Priority,
    registry,
    initialState: null
};

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIlVzZVRhYmxlc1Byb2NlZHVyZS50cyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBJdGVtU3RhY2sgfSBmcm9tIFwiQG1pbmVjcmFmdC9zZXJ2ZXJcIjtcclxuaW1wb3J0IHsgTmVhcmVzdEhvbWVWYXIgfSBmcm9tIFwiQmlnQnJhaW4vQ29udGV4dC9OZWFyZXN0SG9tZVZhclwiO1xyXG5pbXBvcnQgeyBDcmFmdEl0ZW1zUHJvY2VkdXJlIH0gZnJvbSBcIkJpZ0JyYWluL1Byb2NlZHVyZXMvQ3JhZnRJdGVtc1Byb2NlZHVyZVwiO1xyXG5pbXBvcnQgeyBHb1VzZUNoZXN0c1Byb2NlZHVyZSB9IGZyb20gXCJCaWdCcmFpbi9Qcm9jZWR1cmVzL0dvVXNlQ2hlc3RzUHJvY2VkdXJlXCI7XHJcbmltcG9ydCB7IEdvVXNlRnVybmFjZVByb2NlZHVyZSB9IGZyb20gXCJCaWdCcmFpbi9Qcm9jZWR1cmVzL0dvVXNlRnVybmFjZVByb2NlZHVyZVwiO1xyXG5pbXBvcnQgQUlQRGF0YSBmcm9tIFwiRGF0YS9BSVBEYXRhXCI7XHJcbmltcG9ydCBHb1VzZUZ1cm5hY2VQcm9jZWR1cmVEYXRhIGZyb20gXCJEYXRhL0JpZ0JyYWluL1Byb2NlZHVyZXMvR29Vc2VGdXJuYWNlUHJvY2VkdXJlRGF0YVwiO1xyXG5pbXBvcnQgVXNlVGFibGVzUHJvY2VkdXJlRGF0YSBmcm9tIFwiRGF0YS9CaWdCcmFpbi9Qcm9jZWR1cmVzL1VzZVRhYmxlc1Byb2NlZHVyZURhdGFcIjtcclxuaW1wb3J0IHsgSW5ncmVkaWVudCB9IGZyb20gXCJEYXRhL0NyYWZ0aW5nVHJlZURhdGFcIjtcclxuaW1wb3J0IENyYWZ0aW5nSGVscGVyIGZyb20gXCJIZWxwZXJzL0NyYWZ0aW5nSGVscGVyXCI7XHJcbmltcG9ydCBJbnZlbnRvcnlIZWxwZXIgZnJvbSBcIkludmVudG9yeS9JbnZlbnRvcnlIZWxwZXJcIjtcclxuaW1wb3J0IFZpcnR1YWxJbnZlbnRvcnlDb21wb25lbnQgZnJvbSBcIkludmVudG9yeS9WaXJ0dWFsSW52ZW50b3J5Q29tcG9uZW50XCI7XHJcbmltcG9ydCBBYnN0cmFjdFN0YXRlIGZyb20gXCJTdGF0ZVNrZWxldG9uL1N0YXRlcy9BYnN0cmFjdFN0YXRlXCI7XHJcbmltcG9ydCBDb21wb3NpdGVTdGF0ZSBmcm9tIFwiU3RhdGVTa2VsZXRvbi9TdGF0ZXMvQ29tcG9zaXRlU3RhdGVcIjtcclxuaW1wb3J0IHsgQ29tcG9zaXRlU3RhdGVEZWZpbml0aW9uIH0gZnJvbSBcIlN0YXRlU2tlbGV0b24vVHlwZXNcIjtcclxuaW1wb3J0IEJsb2NrVXRpbHMgZnJvbSBcIlV0aWxzL0Jsb2NrVXRpbHNcIjtcclxuaW1wb3J0IHsgTWluZUJsb2Nrc1Byb2NlZHVyZSB9IGZyb20gXCIuL01pbmVCbG9ja3NQcm9jZWR1cmVcIjtcclxuXHJcbi8qKlxyXG4gKiBXaGVuIGF0IGhvbWUgdGhlIEFJUCBmb2xsb3dzIHRoaXMgZmxvdzpcclxuICogV2l0aGRyYXcgZnJvbSBmdXJuYWNlIC0+IHdpdGhkcmF3IGZyb20gY2hlc3QgLT4gY3JhZnRpbmcgbG9vcCAoaW5jbHVkaW5nIHNtZWx0aW5nIGFzIG5lZWRlZCkgLT4gZGVwb3NpdCBpbiBjaGVzdCAtPiBzdGFydCBhbiBleHRyYSBzbWVsdFxyXG4gKiBXaGVuIG5vdCBhdCBob21lIGl0IG9ubHkgZG9lcyB0aGUgY3JhZnRpbmcgbG9vcCAoaW5jbHVkaW5nIHNtZWx0aW5nIGFzIG5lZWRlZClcclxuICovXHJcbnR5cGUgQWZ0ZXJDaGVzdEFjdGlvbiA9IFwic3RhcnRDcmFmdGluZ1wiIHwgXCJzdGFydFVzaW5nRnVybmFjZVwiIHwgXCJvbkNvbXBsZXRlXCIgfCBcIm9uRmFpbHVyZVwiO1xyXG50eXBlIEFmdGVyVXNlRnVybmFjZUFjdGlvbiA9IFwic3RhcnRVc2luZ0NoZXN0c1wiIHwgXCJzdGFydENyYWZ0aW5nXCIgfCBcIm9uQ29tcGxldGVcIjtcclxuXHJcbmNvbnN0IHJlZ2lzdHJ5ID0gW0NyYWZ0SXRlbXNQcm9jZWR1cmUsIEdvVXNlRnVybmFjZVByb2NlZHVyZSwgR29Vc2VDaGVzdHNQcm9jZWR1cmUsIE1pbmVCbG9ja3NQcm9jZWR1cmVdIGFzIGNvbnN0O1xyXG5cclxuZXhwb3J0IGNsYXNzIFVzZVRhYmxlc1Byb2NlZHVyZSBleHRlbmRzIENvbXBvc2l0ZVN0YXRlPHR5cGVvZiByZWdpc3RyeT4ge1xyXG4gICAgcHVibGljIHN0YXRpYyByZWFkb25seSBkZWZpbml0aW9uOiBDb21wb3NpdGVTdGF0ZURlZmluaXRpb248dHlwZW9mIHJlZ2lzdHJ5PiA9IHtcclxuICAgICAgICBpZGVudGlmaWVyOiBcInByb2NlZHVyZTp1c2VfdGFibGVzXCIsXHJcbiAgICAgICAgcHJpb3JpdHk6IFVzZVRhYmxlc1Byb2NlZHVyZURhdGEuUHJpb3JpdHksXHJcbiAgICAgICAgcmVnaXN0cnksXHJcbiAgICAgICAgaW5pdGlhbFN0YXRlOiBudWxsLFxyXG4gICAgfTtcclxuXHJcbiAgICBwdWJsaWMgbWlzc2luZ0luZ3JlZGllbnQ6IEluZ3JlZGllbnQgfCBudWxsID0gbnVsbDtcclxuICAgIHByaXZhdGUgYWZ0ZXJDaGVzdEFjdGlvbjogQWZ0ZXJDaGVzdEFjdGlvbiB8IG51bGwgPSBudWxsO1xyXG4gICAgcHJpdmF0ZSBhZnRlckZ1cm5hY2VBY3Rpb246IEFmdGVyVXNlRnVybmFjZUFjdGlvbiB8IG51bGwgPSBudWxsO1xyXG4gICAgcHJpdmF0ZSBjYW5TbWVsdDogYm9vbGVhbiA9IHRydWU7XHJcbiAgICBwcml2YXRlIHBlbmRpbmdFeGl0U2lnbmFsOiBcIm9uQ29tcGxldGVcIiB8IFwib25GYWlsdXJlXCIgfCBudWxsID0gbnVsbDtcclxuXHJcbiAgICBwdWJsaWMgc2V0Q2FuU21lbHQoY2FuU21lbHQ6IGJvb2xlYW4pOiB2b2lkIHtcclxuICAgICAgICB0aGlzLmNhblNtZWx0ID0gY2FuU21lbHQ7XHJcbiAgICB9XHJcblxyXG4gICAgcHJvdGVjdGVkIGlzSW5Ib21lKCk6IGJvb2xlYW4ge1xyXG4gICAgICAgIGNvbnN0IG5lYXJlc3RIb21lID0gdGhpcy5jb250ZXh0LmdldFZhbHVlKE5lYXJlc3RIb21lVmFyKTtcclxuICAgICAgICBpZiAoIW5lYXJlc3RIb21lKSByZXR1cm4gZmFsc2U7XHJcbiAgICAgICAgcmV0dXJuIG5lYXJlc3RIb21lLmRpc3RhbmNlIDw9IEFJUERhdGEuSW5Ib21lUmFkaXVzO1xyXG4gICAgfVxyXG5cclxuICAgIHByb3RlY3RlZCBvbkVudGVyKCk6IHZvaWQge1xyXG4gICAgICAgIHRoaXMubWlzc2luZ0luZ3JlZGllbnQgPSBudWxsO1xyXG4gICAgICAgIHRoaXMuYWZ0ZXJDaGVzdEFjdGlvbiA9IG51bGw7XHJcbiAgICAgICAgdGhpcy5hZnRlckZ1cm5hY2VBY3Rpb24gPSBudWxsO1xyXG4gICAgICAgIHRoaXMucGVuZGluZ0V4aXRTaWduYWwgPSBudWxsO1xyXG5cclxuICAgICAgICBjb25zdCBpc0luSG9tZSA9IHRoaXMuaXNJbkhvbWUoKTtcclxuXHJcbiAgICAgICAgaWYgKGlzSW5Ib21lKSB7XHJcbiAgICAgICAgICAgIHRoaXMuYWZ0ZXJGdXJuYWNlQWN0aW9uID0gXCJzdGFydFVzaW5nQ2hlc3RzXCI7XHJcbiAgICAgICAgICAgIGNvbnN0IGdvVXNlRnVybmFjZSA9IHRoaXMuZ2V0U3Vic3RhdGUoR29Vc2VGdXJuYWNlUHJvY2VkdXJlKTtcclxuICAgICAgICAgICAgZ29Vc2VGdXJuYWNlLnNldEZ1cm5hY2VJbnRlbnQoXCJ3aXRoZHJhd1wiKTtcclxuICAgICAgICAgICAgdGhpcy5zZXRTdWJzdGF0ZShnb1VzZUZ1cm5hY2UpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHRoaXMuc2V0U3Vic3RhdGUodGhpcy5nZXRTdWJzdGF0ZShDcmFmdEl0ZW1zUHJvY2VkdXJlKSk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByb3RlY3RlZCBvblN1YnN0YXRlQ29tcGxldGUoc3RhdGU6IEFic3RyYWN0U3RhdGUpOiB2b2lkIHtcclxuICAgICAgICBpZiAoc3RhdGUuaXMoR29Vc2VDaGVzdHNQcm9jZWR1cmUpKSB0aGlzLmhhbmRsZUFmdGVyQ2hlc3QoKTtcclxuICAgICAgICBlbHNlIGlmIChzdGF0ZS5pcyhDcmFmdEl0ZW1zUHJvY2VkdXJlKSkgdGhpcy5maW5pc2hXaXRoU2lnbmFsKFwib25Db21wbGV0ZVwiKTtcclxuICAgICAgICBlbHNlIGlmIChzdGF0ZS5pcyhHb1VzZUZ1cm5hY2VQcm9jZWR1cmUpKSB0aGlzLmhhbmRsZUFmdGVyU21lbHQodHJ1ZSk7XHJcbiAgICAgICAgZWxzZSBpZiAoc3RhdGUuaXMoTWluZUJsb2Nrc1Byb2NlZHVyZSkpIHRoaXMuaGFuZGxlQWZ0ZXJNaW5pbmcoKTtcclxuICAgIH1cclxuXHJcbiAgICBwcm90ZWN0ZWQgb25TdWJzdGF0ZUZhaWx1cmUoc3RhdGU6IEFic3RyYWN0U3RhdGUpOiB2b2lkIHtcclxuICAgICAgICBpZiAoc3RhdGUuaXMoR29Vc2VDaGVzdHNQcm9jZWR1cmUpKSB0aGlzLmhhbmRsZUFmdGVyQ2hlc3QoKTtcclxuICAgICAgICBlbHNlIGlmIChzdGF0ZS5pcyhDcmFmdEl0ZW1zUHJvY2VkdXJlKSkgdGhpcy5oYW5kbGVDcmFmdEZhaWx1cmUoKTtcclxuICAgICAgICBlbHNlIGlmIChzdGF0ZS5pcyhHb1VzZUZ1cm5hY2VQcm9jZWR1cmUpKSB0aGlzLmhhbmRsZUFmdGVyU21lbHQoZmFsc2UpO1xyXG4gICAgICAgIGVsc2UgaWYgKHN0YXRlLmlzKE1pbmVCbG9ja3NQcm9jZWR1cmUpKSB7XHJcbiAgICAgICAgICAgIHRoaXMuc2V0U3Vic3RhdGUobnVsbCk7XHJcbiAgICAgICAgICAgIGlmICh0aGlzLnBlbmRpbmdFeGl0U2lnbmFsKSB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBzaWduYWwgPSB0aGlzLnBlbmRpbmdFeGl0U2lnbmFsO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5wZW5kaW5nRXhpdFNpZ25hbCA9IG51bGw7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5icm9hZGNhc3RTaWduYWwoc2lnbmFsKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB0aGlzLmJyb2FkY2FzdFNpZ25hbChcIm9uRmFpbHVyZVwiKTtcclxuICAgICAgICB9IGVsc2UgdGhpcy50cnlDbGVhblVwVGFibGVzQW5kRXhpdFdpdGhTaWduYWwoXCJvbkZhaWx1cmVcIik7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBoYW5kbGVBZnRlck1pbmluZygpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLnNldFN1YnN0YXRlKG51bGwpO1xyXG4gICAgICAgIGlmICh0aGlzLnRyeURlc3Ryb3lDcmFmdGluZ1RhYmxlKCkpIHJldHVybjtcclxuXHJcbiAgICAgICAgaWYgKHRoaXMucGVuZGluZ0V4aXRTaWduYWwpIHtcclxuICAgICAgICAgICAgY29uc3Qgc2lnbmFsID0gdGhpcy5wZW5kaW5nRXhpdFNpZ25hbDtcclxuICAgICAgICAgICAgdGhpcy5wZW5kaW5nRXhpdFNpZ25hbCA9IG51bGw7XHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmZpbmlzaFdpdGhTaWduYWwoc2lnbmFsKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBoYW5kbGVBZnRlckNoZXN0KCk6IHZvaWQge1xyXG4gICAgICAgIGNvbnN0IGFjdGlvbiA9IHRoaXMuYWZ0ZXJDaGVzdEFjdGlvbjtcclxuICAgICAgICB0aGlzLmFmdGVyQ2hlc3RBY3Rpb24gPSBudWxsO1xyXG5cclxuICAgICAgICBzd2l0Y2ggKGFjdGlvbikge1xyXG4gICAgICAgICAgICBjYXNlIFwic3RhcnRDcmFmdGluZ1wiOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5zdGFydENyYWZ0aW5nKCk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBcInN0YXJ0VXNpbmdGdXJuYWNlXCI6XHJcbiAgICAgICAgICAgICAgICBpZiAodGhpcy50cnlTdGFydEV4dHJhU21lbHQoKSkgcmV0dXJuO1xyXG4gICAgICAgICAgICAgICAgdGhpcy50cnlDbGVhblVwVGFibGVzQW5kRXhpdFdpdGhTaWduYWwoXCJvbkNvbXBsZXRlXCIpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgXCJvbkNvbXBsZXRlXCI6XHJcbiAgICAgICAgICAgICAgICB0aGlzLnRyeUNsZWFuVXBUYWJsZXNBbmRFeGl0V2l0aFNpZ25hbChcIm9uQ29tcGxldGVcIik7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBcIm9uRmFpbHVyZVwiOlxyXG4gICAgICAgICAgICAgICAgdGhpcy50cnlDbGVhblVwVGFibGVzQW5kRXhpdFdpdGhTaWduYWwoXCJvbkZhaWx1cmVcIik7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBzdGFydENyYWZ0aW5nKCk6IHZvaWQge1xyXG4gICAgICAgIGNvbnN0IGNyYWZ0SXRlbXMgPSB0aGlzLmdldFN1YnN0YXRlKENyYWZ0SXRlbXNQcm9jZWR1cmUpO1xyXG4gICAgICAgIGNyYWZ0SXRlbXMuc2V0SXNJbkhvbWUodGhpcy5pc0luSG9tZSgpKTtcclxuICAgICAgICB0aGlzLnNldFN1YnN0YXRlKGNyYWZ0SXRlbXMpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgaGFuZGxlQWZ0ZXJTbWVsdCh3YXNTdWNjZXNzZnVsOiBib29sZWFuKTogdm9pZCB7XHJcbiAgICAgICAgY29uc3QgYWN0aW9uID0gdGhpcy5hZnRlckZ1cm5hY2VBY3Rpb247XHJcbiAgICAgICAgdGhpcy5hZnRlckZ1cm5hY2VBY3Rpb24gPSBudWxsO1xyXG5cclxuICAgICAgICBzd2l0Y2ggKGFjdGlvbikge1xyXG4gICAgICAgICAgICBjYXNlIFwic3RhcnRVc2luZ0NoZXN0c1wiOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5hZnRlckNoZXN0QWN0aW9uID0gXCJzdGFydENyYWZ0aW5nXCI7XHJcbiAgICAgICAgICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tY2FzZS1kZWNsYXJhdGlvbnNcclxuICAgICAgICAgICAgICAgIGNvbnN0IGdvVXNlQ2hlc3QgPSB0aGlzLmdldFN1YnN0YXRlKEdvVXNlQ2hlc3RzUHJvY2VkdXJlKTtcclxuICAgICAgICAgICAgICAgIGdvVXNlQ2hlc3Quc2V0SW50ZW50KFwiYmVmb3JlQ3JhZnRpbmdcIik7XHJcbiAgICAgICAgICAgICAgICBnb1VzZUNoZXN0LnNldE5lZWRlZEluZ3JlZGllbnRzKHRoaXMucmVzb2x2ZU5lZWRlZEluZ3JlZGllbnRzKCkpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5zZXRTdWJzdGF0ZShnb1VzZUNoZXN0KTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIFwic3RhcnRDcmFmdGluZ1wiOlxyXG4gICAgICAgICAgICAgICAgaWYgKCF3YXNTdWNjZXNzZnVsKSByZXR1cm4gdGhpcy5oYW5kbGVTbWVsdEZhaWx1cmUoKTtcclxuICAgICAgICAgICAgICAgIHRoaXMuc3RhcnRDcmFmdGluZygpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgXCJvbkNvbXBsZXRlXCI6XHJcbiAgICAgICAgICAgICAgICB0aGlzLnRyeUNsZWFuVXBUYWJsZXNBbmRFeGl0V2l0aFNpZ25hbChcIm9uQ29tcGxldGVcIik7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSB0cnlTdGFydEV4dHJhU21lbHQoKTogYm9vbGVhbiB7XHJcbiAgICAgICAgY29uc3QgYmVzdEl0ZW1Ub1NtZWx0ID0gSW52ZW50b3J5SGVscGVyLmdldEJlc3RJdGVtVG9TbWVsdCh0aGlzLmNvbnRleHQuZW50aXR5KTtcclxuICAgICAgICBpZiAoIWJlc3RJdGVtVG9TbWVsdCkgcmV0dXJuIGZhbHNlO1xyXG5cclxuICAgICAgICB0aGlzLmFmdGVyRnVybmFjZUFjdGlvbiA9IFwib25Db21wbGV0ZVwiO1xyXG4gICAgICAgIGNvbnN0IHNtZWx0U3Vic3RhdGUgPSB0aGlzLmdldFN1YnN0YXRlKEdvVXNlRnVybmFjZVByb2NlZHVyZSk7XHJcbiAgICAgICAgc21lbHRTdWJzdGF0ZS5zZXRJc0luSG9tZSh0aGlzLmlzSW5Ib21lKCkpO1xyXG4gICAgICAgIHNtZWx0U3Vic3RhdGUuc2V0U2hvdWxkV2FpdEZvclNtZWx0Q29tcGxldGlvbihmYWxzZSk7XHJcbiAgICAgICAgc21lbHRTdWJzdGF0ZS5zZXRJdGVtVG9TbWVsdChiZXN0SXRlbVRvU21lbHQpO1xyXG4gICAgICAgIHNtZWx0U3Vic3RhdGUuc2V0RnVybmFjZUludGVudChcInNtZWx0SXRlbXNcIik7XHJcbiAgICAgICAgdGhpcy5zZXRTdWJzdGF0ZShzbWVsdFN1YnN0YXRlKTtcclxuICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGZpbmlzaFdpdGhTaWduYWwoc2lnbmFsOiBcIm9uQ29tcGxldGVcIiB8IFwib25GYWlsdXJlXCIpOiB2b2lkIHtcclxuICAgICAgICBpZiAoIXRoaXMuaXNJbkhvbWUoKSkgcmV0dXJuIHRoaXMudHJ5Q2xlYW5VcFRhYmxlc0FuZEV4aXRXaXRoU2lnbmFsKHNpZ25hbCk7XHJcblxyXG4gICAgICAgIHRoaXMuYWZ0ZXJDaGVzdEFjdGlvbiA9IHNpZ25hbCA9PT0gXCJvbkNvbXBsZXRlXCIgPyBcInN0YXJ0VXNpbmdGdXJuYWNlXCIgOiBcIm9uRmFpbHVyZVwiO1xyXG4gICAgICAgIGNvbnN0IGdvVXNlQ2hlc3QgPSB0aGlzLmdldFN1YnN0YXRlKEdvVXNlQ2hlc3RzUHJvY2VkdXJlKTtcclxuICAgICAgICBnb1VzZUNoZXN0LnNldEludGVudChcImFmdGVyQ3JhZnRpbmdcIik7XHJcbiAgICAgICAgdGhpcy5zZXRTdWJzdGF0ZShnb1VzZUNoZXN0KTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGhhbmRsZUNyYWZ0RmFpbHVyZSgpOiB2b2lkIHtcclxuICAgICAgICBjb25zdCBjcmFmdGluZ1N1YnN0YXRlID0gdGhpcy5nZXRTdWJzdGF0ZShDcmFmdEl0ZW1zUHJvY2VkdXJlKTtcclxuICAgICAgICBjb25zdCBmYWlsZWRFbnRyeSA9IGNyYWZ0aW5nU3Vic3RhdGUuaXRlbVF1ZXVlWzBdO1xyXG4gICAgICAgIGlmICghZmFpbGVkRW50cnkpIHJldHVybiB0aGlzLmZhaWwobnVsbCk7XHJcblxyXG4gICAgICAgIGNvbnN0IHJlY2lwZSA9IENyYWZ0aW5nSGVscGVyLmdldFJlY2lwZUZvclJlc3VsdChmYWlsZWRFbnRyeS5pZCk7XHJcbiAgICAgICAgY29uc3QgcmVzdWx0QW1vdW50ID0gcmVjaXBlPy5yZXN1bHQuYW1vdW50ID8/IDE7XHJcbiAgICAgICAgY29uc3QgdG90YWxBbW91bnQgPSBmYWlsZWRFbnRyeS5yZW1haW5pbmdDcmFmdHMgKiByZXN1bHRBbW91bnQ7XHJcbiAgICAgICAgY29uc3QgcmVzdWx0SXRlbTogSW5ncmVkaWVudCA9IHsgaWQ6IGZhaWxlZEVudHJ5LmlkLCBhbW91bnQ6IHRvdGFsQW1vdW50IH07XHJcbiAgICAgICAgY29uc3QgbWlzc2luZ0luZ3JlZGllbnQgPSBDcmFmdGluZ0hlbHBlci5nZXRGaXJzdE1pc3NpbmdCYXNlSW5ncmVkaWVudChyZXN1bHRJdGVtLCB0aGlzLmNvbnRleHQuZW50aXR5KTtcclxuXHJcbiAgICAgICAgaWYgKG1pc3NpbmdJbmdyZWRpZW50ID09PSBudWxsKSByZXR1cm4gdGhpcy5mYWlsKG51bGwpO1xyXG5cclxuICAgICAgICBjb25zdCBvcmVUb1NtZWx0ID0gdGhpcy5nZXRPcmVUb1NtZWx0KG1pc3NpbmdJbmdyZWRpZW50KTtcclxuICAgICAgICBpZiAob3JlVG9TbWVsdCAmJiB0aGlzLmNhblNtZWx0KSB7XHJcbiAgICAgICAgICAgIHRoaXMuYWZ0ZXJGdXJuYWNlQWN0aW9uID0gXCJzdGFydENyYWZ0aW5nXCI7XHJcbiAgICAgICAgICAgIGNvbnN0IHNtZWx0aW5nU3Vic3RhdGUgPSB0aGlzLmdldFN1YnN0YXRlKEdvVXNlRnVybmFjZVByb2NlZHVyZSk7XHJcbiAgICAgICAgICAgIHNtZWx0aW5nU3Vic3RhdGUuc2V0SXNJbkhvbWUodGhpcy5pc0luSG9tZSgpKTtcclxuICAgICAgICAgICAgc21lbHRpbmdTdWJzdGF0ZS5zZXRJdGVtVG9TbWVsdChvcmVUb1NtZWx0KTtcclxuICAgICAgICAgICAgc21lbHRpbmdTdWJzdGF0ZS5zZXRTaG91bGRXYWl0Rm9yU21lbHRDb21wbGV0aW9uKHRydWUpO1xyXG4gICAgICAgICAgICBzbWVsdGluZ1N1YnN0YXRlLnNldEZ1cm5hY2VJbnRlbnQoXCJzbWVsdEl0ZW1zXCIpO1xyXG4gICAgICAgICAgICB0aGlzLnNldFN1YnN0YXRlKHNtZWx0aW5nU3Vic3RhdGUpO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB0aGlzLmZhaWwobWlzc2luZ0luZ3JlZGllbnQpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgaGFuZGxlU21lbHRGYWlsdXJlKCk6IHZvaWQge1xyXG4gICAgICAgIGNvbnN0IHNtZWx0U3RhdGUgPSB0aGlzLmdldFN1YnN0YXRlKEdvVXNlRnVybmFjZVByb2NlZHVyZSk7XHJcbiAgICAgICAgc3dpdGNoIChzbWVsdFN0YXRlLmZhaWx1cmVSZWFzb24pIHtcclxuICAgICAgICAgICAgY2FzZSBcIm5vRnVybmFjZVwiOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5nZXRTdWJzdGF0ZShDcmFmdEl0ZW1zUHJvY2VkdXJlKS5wcmVwZW5kSXRlbVRvUXVldWUoXCJtaW5lY3JhZnQ6ZnVybmFjZVwiKTtcclxuICAgICAgICAgICAgICAgIHRoaXMuc3RhcnRDcmFmdGluZygpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgXCJub0Z1ZWxcIjpcclxuICAgICAgICAgICAgICAgIHRoaXMuZmFpbCh7IGlkOiBcIm1pbmVjcmFmdDpjb2FsXCIsIGFtb3VudDogMSB9KTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBkZWZhdWx0OlxyXG4gICAgICAgICAgICAgICAgdGhpcy5maW5pc2hXaXRoU2lnbmFsKFwib25GYWlsdXJlXCIpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZ2V0T3JlVG9TbWVsdChpbmdyZWRpZW50OiBJbmdyZWRpZW50KTogSXRlbVN0YWNrIHwgbnVsbCB7XHJcbiAgICAgICAgY29uc3Qgb3JlVHlwZSA9IENyYWZ0aW5nSGVscGVyLmdldFJhd01hdGVyaWFsRnJvbVNtZWx0ZWRNYXRlcmlhbFR5cGUoaW5ncmVkaWVudC5pZCk7XHJcbiAgICAgICAgaWYgKCFvcmVUeXBlKSByZXR1cm4gbnVsbDtcclxuICAgICAgICBpZiAoVmlydHVhbEludmVudG9yeUNvbXBvbmVudC5nZXQodGhpcy5jb250ZXh0LmVudGl0eSkuY291bnRJdGVtVHlwZShvcmVUeXBlKSA8IGluZ3JlZGllbnQuYW1vdW50KSByZXR1cm4gbnVsbDtcclxuICAgICAgICByZXR1cm4gbmV3IEl0ZW1TdGFjayhvcmVUeXBlLCBpbmdyZWRpZW50LmFtb3VudCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSByZXNvbHZlTmVlZGVkSW5ncmVkaWVudHMoKTogSW5ncmVkaWVudFtdIHtcclxuICAgICAgICBjb25zdCB0b3RhbHMgPSBuZXcgTWFwPHN0cmluZywgbnVtYmVyPigpO1xyXG5cclxuICAgICAgICB0aGlzLnJlc29sdmVOZWVkZWRDcmFmdGluZ0luZ3JlZGllbnRzKHRvdGFscyk7XHJcblxyXG4gICAgICAgIGNvbnN0IHRvdGFsU21lbHRzTmVlZGVkID0gdGhpcy5yZXNvbHZlTmVlZGVkT3Jlcyh0b3RhbHMpO1xyXG5cclxuICAgICAgICB0aGlzLnJlc29sdmVOZWVkZWRGdWVsKHRvdGFscywgdG90YWxTbWVsdHNOZWVkZWQpO1xyXG5cclxuICAgICAgICByZXR1cm4gQXJyYXkuZnJvbSh0b3RhbHMuZW50cmllcygpKS5tYXAoKFtpZCwgYW1vdW50XSkgPT4gKHsgaWQsIGFtb3VudCB9KSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSByZXNvbHZlTmVlZGVkQ3JhZnRpbmdJbmdyZWRpZW50cyh0b3RhbHM6IE1hcDxzdHJpbmcsIG51bWJlcj4pOiB2b2lkIHtcclxuICAgICAgICBmb3IgKGNvbnN0IGVudHJ5IG9mIHRoaXMuZ2V0U3Vic3RhdGUoQ3JhZnRJdGVtc1Byb2NlZHVyZSkuaXRlbVF1ZXVlKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHJlY2lwZSA9IENyYWZ0aW5nSGVscGVyLmdldFJlY2lwZUZvclJlc3VsdChlbnRyeS5pZCk7XHJcbiAgICAgICAgICAgIGNvbnN0IGFtb3VudCA9IGVudHJ5LnJlbWFpbmluZ0NyYWZ0cyAqIHJlY2lwZSEucmVzdWx0LmFtb3VudDtcclxuICAgICAgICAgICAgY29uc3QgaW5ncmVkaWVudHMgPSBDcmFmdGluZ0hlbHBlci5nZXRBbGxDcmFmdGluZ1RyZWVJbmdyZWRpZW50cyh7IGlkOiBlbnRyeS5pZCwgYW1vdW50IH0pO1xyXG4gICAgICAgICAgICBmb3IgKGNvbnN0IHsgaWQsIGFtb3VudCB9IG9mIGluZ3JlZGllbnRzKSB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBjdXJyZW50VG90YWwgPSB0b3RhbHMuZ2V0KGlkKSA/PyAwO1xyXG4gICAgICAgICAgICAgICAgdG90YWxzLnNldChpZCwgY3VycmVudFRvdGFsICsgYW1vdW50KTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHJlc29sdmVOZWVkZWRPcmVzKHRvdGFsczogTWFwPHN0cmluZywgbnVtYmVyPik6IG51bWJlciB7XHJcbiAgICAgICAgbGV0IHRvdGFsU21lbHRzTmVlZGVkID0gMDtcclxuICAgICAgICBmb3IgKGNvbnN0IFtpZCwgYW1vdW50XSBvZiBbLi4udG90YWxzLmVudHJpZXMoKV0pIHtcclxuICAgICAgICAgICAgY29uc3Qgb3JlVHlwZSA9IENyYWZ0aW5nSGVscGVyLmdldFJhd01hdGVyaWFsRnJvbVNtZWx0ZWRNYXRlcmlhbFR5cGUoaWQpO1xyXG4gICAgICAgICAgICBpZiAoIW9yZVR5cGUpIGNvbnRpbnVlO1xyXG5cclxuICAgICAgICAgICAgdG90YWxzLnNldChvcmVUeXBlLCAodG90YWxzLmdldChvcmVUeXBlKSA/PyAwKSArIGFtb3VudCk7XHJcbiAgICAgICAgICAgIHRvdGFsU21lbHRzTmVlZGVkICs9IGFtb3VudDtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHJldHVybiB0b3RhbFNtZWx0c05lZWRlZDtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHJlc29sdmVOZWVkZWRGdWVsKHRvdGFsczogTWFwPHN0cmluZywgbnVtYmVyPiwgdG90YWxTbWVsdHNOZWVkZWQ6IG51bWJlcik6IHZvaWQge1xyXG4gICAgICAgIGlmICh0b3RhbFNtZWx0c05lZWRlZCA8PSAwKSByZXR1cm47XHJcblxyXG4gICAgICAgIGNvbnN0IGZ1ZWxFbnRyaWVzID0gT2JqZWN0LmVudHJpZXMoR29Vc2VGdXJuYWNlUHJvY2VkdXJlRGF0YS5GdWVsRHVyYXRpb25NYXApO1xyXG5cclxuICAgICAgICBmb3IgKGNvbnN0IFtmdWVsVHlwZUlkLCBmdWVsRHVyYXRpb25dIG9mIGZ1ZWxFbnRyaWVzKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGZ1ZWxJbmdyZWRpZW50OiBJbmdyZWRpZW50ID0geyBpZDogZnVlbFR5cGVJZCwgYW1vdW50OiBNYXRoLmNlaWwodG90YWxTbWVsdHNOZWVkZWQgLyBmdWVsRHVyYXRpb24pIH07XHJcbiAgICAgICAgICAgIHRvdGFscy5zZXQoZnVlbEluZ3JlZGllbnQuaWQsICh0b3RhbHMuZ2V0KGZ1ZWxJbmdyZWRpZW50LmlkKSA/PyAwKSArIGZ1ZWxJbmdyZWRpZW50LmFtb3VudCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZmFpbChtaXNzaW5nSW5ncmVkaWVudDogSW5ncmVkaWVudCB8IG51bGwpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLm1pc3NpbmdJbmdyZWRpZW50ID0gbWlzc2luZ0luZ3JlZGllbnQ7XHJcbiAgICAgICAgdGhpcy5maW5pc2hXaXRoU2lnbmFsKFwib25GYWlsdXJlXCIpO1xyXG4gICAgfVxyXG5cclxuICAgIHB1YmxpYyB0cnlDbGVhblVwVGFibGVzQW5kRXhpdFdpdGhTaWduYWwoc2lnbmFsOiBcIm9uQ29tcGxldGVcIiB8IFwib25GYWlsdXJlXCIpOiB2b2lkIHtcclxuICAgICAgICAvL0FscmVhZHkgZGVzdHJveWluZyBhIHRhYmxlXHJcbiAgICAgICAgaWYgKHRoaXMuZ2V0U3Vic3RhdGUoTWluZUJsb2Nrc1Byb2NlZHVyZSkuaXNBY3RpdmUpIHJldHVybjtcclxuXHJcbiAgICAgICAgaWYgKHRoaXMudHJ5RGVzdHJveUZ1cm5hY2UoKSB8fCB0aGlzLnRyeURlc3Ryb3lDcmFmdGluZ1RhYmxlKCkpIHtcclxuICAgICAgICAgICAgdGhpcy5wZW5kaW5nRXhpdFNpZ25hbCA9IHNpZ25hbDtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdGhpcy5zZXRTdWJzdGF0ZShudWxsKTtcclxuICAgICAgICB0aGlzLmJyb2FkY2FzdFNpZ25hbChzaWduYWwpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgdHJ5RGVzdHJveUZ1cm5hY2UoKTogYm9vbGVhbiB7XHJcbiAgICAgICAgaWYgKHRoaXMuaXNJbkhvbWUoKSkgcmV0dXJuIGZhbHNlO1xyXG5cclxuICAgICAgICBjb25zdCBnb1VzZUZ1cm5hY2UgPSB0aGlzLmdldFN1YnN0YXRlKEdvVXNlRnVybmFjZVByb2NlZHVyZSk7XHJcbiAgICAgICAgaWYgKCFnb1VzZUZ1cm5hY2Uub3duc0Z1cm5hY2UpIGdvVXNlRnVybmFjZS52YWxpZGF0ZUV4aXN0aW5nT3duZWRGdXJuYWNlKCk7XHJcbiAgICAgICAgaWYgKCFnb1VzZUZ1cm5hY2Uub3duc0Z1cm5hY2UgfHwgIWdvVXNlRnVybmFjZS5mdXJuYWNlKSByZXR1cm4gZmFsc2U7XHJcbiAgICAgICAgaWYgKCFHb1VzZUZ1cm5hY2VQcm9jZWR1cmUuaXNGdXJuYWNlKGdvVXNlRnVybmFjZS5mdXJuYWNlKSkgcmV0dXJuIGZhbHNlO1xyXG5cclxuICAgICAgICBjb25zdCBtaW5lQmxvY2tzUHJvY2VkdXJlID0gdGhpcy5nZXRTdWJzdGF0ZShNaW5lQmxvY2tzUHJvY2VkdXJlKTtcclxuICAgICAgICBtaW5lQmxvY2tzUHJvY2VkdXJlLnNldEJsb2NrcyhbZ29Vc2VGdXJuYWNlLmZ1cm5hY2VdKTtcclxuICAgICAgICBnb1VzZUZ1cm5hY2UuY2xlYXJPd25lZEZ1cm5hY2UoKTtcclxuICAgICAgICB0aGlzLnNldFN1YnN0YXRlKG1pbmVCbG9ja3NQcm9jZWR1cmUpO1xyXG4gICAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgdHJ5RGVzdHJveUNyYWZ0aW5nVGFibGUoKTogYm9vbGVhbiB7XHJcbiAgICAgICAgaWYgKHRoaXMuaXNJbkhvbWUoKSkgcmV0dXJuIGZhbHNlO1xyXG4gICAgICAgIGNvbnN0IGNyYWZ0SXRlbXNQcm9jZWR1cmUgPSB0aGlzLmdldFN1YnN0YXRlKENyYWZ0SXRlbXNQcm9jZWR1cmUpO1xyXG4gICAgICAgIGlmICghY3JhZnRJdGVtc1Byb2NlZHVyZS5vd25zQ3JhZnRpbmdUYWJsZSkgY3JhZnRJdGVtc1Byb2NlZHVyZS52YWxpZGF0ZUV4aXN0aW5nT3duZWRDcmFmdGluZ1RhYmxlKCk7XHJcbiAgICAgICAgaWYgKCFjcmFmdEl0ZW1zUHJvY2VkdXJlLm93bnNDcmFmdGluZ1RhYmxlIHx8ICFjcmFmdEl0ZW1zUHJvY2VkdXJlLmNyYWZ0aW5nVGFibGVMb2NhdGlvbikgcmV0dXJuIGZhbHNlO1xyXG5cclxuICAgICAgICBjb25zdCBjcmFmdGluZ1RhYmxlQmxvY2sgPSBCbG9ja1V0aWxzLmZyb21WMyhjcmFmdEl0ZW1zUHJvY2VkdXJlLmNyYWZ0aW5nVGFibGVMb2NhdGlvbik7XHJcbiAgICAgICAgaWYgKCFjcmFmdGluZ1RhYmxlQmxvY2sgfHwgY3JhZnRpbmdUYWJsZUJsb2NrLnR5cGUuaWQgIT09IENyYWZ0SXRlbXNQcm9jZWR1cmUuQ3JhZnRpbmdUYWJsZUlkKSByZXR1cm4gZmFsc2U7XHJcblxyXG4gICAgICAgIGNvbnN0IG1pbmVCbG9ja3NQcm9jZWR1cmUgPSB0aGlzLmdldFN1YnN0YXRlKE1pbmVCbG9ja3NQcm9jZWR1cmUpO1xyXG4gICAgICAgIG1pbmVCbG9ja3NQcm9jZWR1cmUuc2V0QmxvY2tzKFtjcmFmdGluZ1RhYmxlQmxvY2tdKTtcclxuICAgICAgICBjcmFmdEl0ZW1zUHJvY2VkdXJlLmNsZWFyT3duZWRDcmFmdGluZ1RhYmxlKCk7XHJcbiAgICAgICAgdGhpcy5zZXRTdWJzdGF0ZShtaW5lQmxvY2tzUHJvY2VkdXJlKTtcclxuICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgIH1cclxufVxyXG4iXSwibmFtZXMiOlsiSXRlbVN0YWNrIiwiTmVhcmVzdEhvbWVWYXIiLCJDcmFmdEl0ZW1zUHJvY2VkdXJlIiwiR29Vc2VDaGVzdHNQcm9jZWR1cmUiLCJHb1VzZUZ1cm5hY2VQcm9jZWR1cmUiLCJBSVBEYXRhIiwiR29Vc2VGdXJuYWNlUHJvY2VkdXJlRGF0YSIsIlVzZVRhYmxlc1Byb2NlZHVyZURhdGEiLCJDcmFmdGluZ0hlbHBlciIsIkludmVudG9yeUhlbHBlciIsIlZpcnR1YWxJbnZlbnRvcnlDb21wb25lbnQiLCJDb21wb3NpdGVTdGF0ZSIsIkJsb2NrVXRpbHMiLCJNaW5lQmxvY2tzUHJvY2VkdXJlIiwicmVnaXN0cnkiLCJVc2VUYWJsZXNQcm9jZWR1cmUiLCJzZXRDYW5TbWVsdCIsImNhblNtZWx0IiwiaXNJbkhvbWUiLCJuZWFyZXN0SG9tZSIsImNvbnRleHQiLCJnZXRWYWx1ZSIsImRpc3RhbmNlIiwiSW5Ib21lUmFkaXVzIiwib25FbnRlciIsIm1pc3NpbmdJbmdyZWRpZW50IiwiYWZ0ZXJDaGVzdEFjdGlvbiIsImFmdGVyRnVybmFjZUFjdGlvbiIsInBlbmRpbmdFeGl0U2lnbmFsIiwiZ29Vc2VGdXJuYWNlIiwiZ2V0U3Vic3RhdGUiLCJzZXRGdXJuYWNlSW50ZW50Iiwic2V0U3Vic3RhdGUiLCJvblN1YnN0YXRlQ29tcGxldGUiLCJzdGF0ZSIsImlzIiwiaGFuZGxlQWZ0ZXJDaGVzdCIsImZpbmlzaFdpdGhTaWduYWwiLCJoYW5kbGVBZnRlclNtZWx0IiwiaGFuZGxlQWZ0ZXJNaW5pbmciLCJvblN1YnN0YXRlRmFpbHVyZSIsImhhbmRsZUNyYWZ0RmFpbHVyZSIsInNpZ25hbCIsImJyb2FkY2FzdFNpZ25hbCIsInRyeUNsZWFuVXBUYWJsZXNBbmRFeGl0V2l0aFNpZ25hbCIsInRyeURlc3Ryb3lDcmFmdGluZ1RhYmxlIiwiYWN0aW9uIiwic3RhcnRDcmFmdGluZyIsInRyeVN0YXJ0RXh0cmFTbWVsdCIsImNyYWZ0SXRlbXMiLCJzZXRJc0luSG9tZSIsIndhc1N1Y2Nlc3NmdWwiLCJnb1VzZUNoZXN0Iiwic2V0SW50ZW50Iiwic2V0TmVlZGVkSW5ncmVkaWVudHMiLCJyZXNvbHZlTmVlZGVkSW5ncmVkaWVudHMiLCJoYW5kbGVTbWVsdEZhaWx1cmUiLCJiZXN0SXRlbVRvU21lbHQiLCJnZXRCZXN0SXRlbVRvU21lbHQiLCJlbnRpdHkiLCJzbWVsdFN1YnN0YXRlIiwic2V0U2hvdWxkV2FpdEZvclNtZWx0Q29tcGxldGlvbiIsInNldEl0ZW1Ub1NtZWx0IiwiY3JhZnRpbmdTdWJzdGF0ZSIsImZhaWxlZEVudHJ5IiwiaXRlbVF1ZXVlIiwiZmFpbCIsInJlY2lwZSIsImdldFJlY2lwZUZvclJlc3VsdCIsImlkIiwicmVzdWx0QW1vdW50IiwicmVzdWx0IiwiYW1vdW50IiwidG90YWxBbW91bnQiLCJyZW1haW5pbmdDcmFmdHMiLCJyZXN1bHRJdGVtIiwiZ2V0Rmlyc3RNaXNzaW5nQmFzZUluZ3JlZGllbnQiLCJvcmVUb1NtZWx0IiwiZ2V0T3JlVG9TbWVsdCIsInNtZWx0aW5nU3Vic3RhdGUiLCJzbWVsdFN0YXRlIiwiZmFpbHVyZVJlYXNvbiIsInByZXBlbmRJdGVtVG9RdWV1ZSIsImluZ3JlZGllbnQiLCJvcmVUeXBlIiwiZ2V0UmF3TWF0ZXJpYWxGcm9tU21lbHRlZE1hdGVyaWFsVHlwZSIsImdldCIsImNvdW50SXRlbVR5cGUiLCJ0b3RhbHMiLCJNYXAiLCJyZXNvbHZlTmVlZGVkQ3JhZnRpbmdJbmdyZWRpZW50cyIsInRvdGFsU21lbHRzTmVlZGVkIiwicmVzb2x2ZU5lZWRlZE9yZXMiLCJyZXNvbHZlTmVlZGVkRnVlbCIsIkFycmF5IiwiZnJvbSIsImVudHJpZXMiLCJtYXAiLCJlbnRyeSIsImluZ3JlZGllbnRzIiwiZ2V0QWxsQ3JhZnRpbmdUcmVlSW5ncmVkaWVudHMiLCJjdXJyZW50VG90YWwiLCJzZXQiLCJmdWVsRW50cmllcyIsIk9iamVjdCIsIkZ1ZWxEdXJhdGlvbk1hcCIsImZ1ZWxUeXBlSWQiLCJmdWVsRHVyYXRpb24iLCJmdWVsSW5ncmVkaWVudCIsIk1hdGgiLCJjZWlsIiwiaXNBY3RpdmUiLCJ0cnlEZXN0cm95RnVybmFjZSIsIm93bnNGdXJuYWNlIiwidmFsaWRhdGVFeGlzdGluZ093bmVkRnVybmFjZSIsImZ1cm5hY2UiLCJpc0Z1cm5hY2UiLCJtaW5lQmxvY2tzUHJvY2VkdXJlIiwic2V0QmxvY2tzIiwiY2xlYXJPd25lZEZ1cm5hY2UiLCJjcmFmdEl0ZW1zUHJvY2VkdXJlIiwib3duc0NyYWZ0aW5nVGFibGUiLCJ2YWxpZGF0ZUV4aXN0aW5nT3duZWRDcmFmdGluZ1RhYmxlIiwiY3JhZnRpbmdUYWJsZUxvY2F0aW9uIiwiY3JhZnRpbmdUYWJsZUJsb2NrIiwiZnJvbVYzIiwidHlwZSIsIkNyYWZ0aW5nVGFibGVJZCIsImNsZWFyT3duZWRDcmFmdGluZ1RhYmxlIiwiZGVmaW5pdGlvbiIsImlkZW50aWZpZXIiLCJwcmlvcml0eSIsIlByaW9yaXR5IiwiaW5pdGlhbFN0YXRl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