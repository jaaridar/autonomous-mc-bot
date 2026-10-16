import { ItemStack } from "@minecraft/server";
import { NearestHomeVar } from "BigBrain/Context/NearestHomeVar";
import { PathToNodeProcedure } from "BigBrain/Procedures/PathToNodeProcedure";
import { SwapToItemProcedure } from "BigBrain/Procedures/SwapToItemProcedure";
import { DepositItemStep } from "BigBrain/Steps/DepositItemStep";
import { WithdrawItemStep } from "BigBrain/Steps/WithdrawItemStep";
import AIPData from "Data/AIPData";
import GoUseChestProcedureData from "Data/BigBrain/Procedures/GoUseChestProcedureData";
import { InventoryData } from "Data/InventoryData";
import CraftingHelper from "Helpers/CraftingHelper";
import RotationHelper from "Helpers/RotationHelper";
import V3 from "Helpers/Vectors/V3";
import InventoryHelper from "Inventory/InventoryHelper";
import VirtualInventoryComponent from "Inventory/VirtualInventoryComponent";
import CompositeState from "StateSkeleton/States/CompositeState";
import { ExitType } from "StateSkeleton/Types";
import BlockUtils from "Utils/BlockUtils";
const registry = [
    PathToNodeProcedure,
    DepositItemStep,
    WithdrawItemStep,
    SwapToItemProcedure
];
export class GoUseChestProcedure extends CompositeState {
    setIntent(intent) {
        this.intent = intent;
    }
    setNeededIngredients(ingredients) {
        this.neededIngredients = ingredients;
    }
    setChest(chest) {
        this.chest = chest;
    }
    onEnter() {
        this.operations = [];
        this.phases = [];
        this.arrivalTick = null;
        if (!this.isValidChest()) return this.broadcastSignal("onFailure");
        const pathToNode = this.getSubstate(PathToNodeProcedure);
        pathToNode.setPrimaryLocation(V3.fromBlock(this.chest, overworld).grid());
        pathToNode.setWithinRadius(GoUseChestProcedureData.ChestPathRadius);
        pathToNode.setCanBreakBlocks(false);
        pathToNode.setCanPlaceBlocks(true);
        this.setSubstate(pathToNode);
    }
    onExit(exitType) {
        if (exitType === ExitType.Shutdown) return;
        if (this.chestOpener?.isValid) this.chestOpener.remove();
    }
    onActiveTick() {
        if (this.arrivalTick === null) return;
        RotationHelper.lookAtBlock(this.context.entity, this.chest);
        if (Main.currentTick - this.arrivalTick < GoUseChestProcedureData.TransferWarmupTicks) return;
        this.arrivalTick = null;
        this.startTransferringItems();
    }
    isValidChest() {
        return this.chest !== null && this.chest.typeId === "minecraft:chest";
    }
    startTransferringItems() {
        if (!this.isValidChest()) return this.broadcastSignal("onFailure");
        this.queuePhasesFromIntent();
        this.tryExecuteNextOperation();
    }
    spawnChestOpener() {
        const location = V3.fromBlock(this.chest, overworld).add(0, 1, 0);
        if (!location.isLoaded()) return;
        this.chestOpener = EntityUtil.spawnEntity("gm1_sky:chest_opener", location, location.dimension);
    }
    onSubstateComplete(state) {
        if (state.is(PathToNodeProcedure)) {
            this.spawnChestOpener();
            this.setSubstate(null);
            this.arrivalTick = Main.currentTick;
            return;
        }
        if (state.is(DepositItemStep) || state.is(WithdrawItemStep)) {
            this.tryExecuteNextOperation();
        } else if (state.is(SwapToItemProcedure)) {
            this.broadcastSignal("onComplete");
        }
    }
    onSubstateFailure(state) {
        // If a deposit/withdraw fails, skip it and continue with the rest
        if (state.is(DepositItemStep) || state.is(WithdrawItemStep)) {
            return this.tryExecuteNextOperation();
        }
        this.broadcastSignal("onFailure");
    }
    swapToEmptyHand() {
        const swap = this.getSubstate(SwapToItemProcedure);
        swap.setItem(new ItemStack("minecraft:air"));
        swap.setShouldScroll(false);
        this.setSubstate(swap);
    }
    tryExecuteNextOperation() {
        if (!this.isValidChest()) return this.broadcastSignal("onFailure");
        if (this.operations.length === 0) {
            const nextPhase = this.phases.shift();
            if (!nextPhase) return this.swapToEmptyHand();
            nextPhase();
            this.tryExecuteNextOperation();
            return;
        }
        const operation = this.operations.shift();
        if (operation.type === "withdraw") {
            const step = this.getSubstate(WithdrawItemStep);
            step.setChest(this.chest);
            step.setChestSlot(operation.slot);
            step.setAmount(operation.amount ?? null);
            this.setSubstate(step);
        } else {
            const step = this.getSubstate(DepositItemStep);
            step.setChest(this.chest);
            step.setEntitySlot(operation.slot);
            step.setAmount(operation.amount ?? null);
            this.setSubstate(step);
        }
    }
    queuePhasesFromIntent() {
        switch(this.intent){
            case "beforeCrafting":
                this.phases.push(()=>this.queueDepositInferiorGear());
                this.phases.push(()=>this.queueWithdrawBetterGear());
                this.phases.push(()=>this.queueWithdrawCraftingMaterials());
                this.phases.push(()=>this.queueWithdrawEssentialSupplies());
                this.phases.push(()=>this.queueWithdrawMinimumSupplies());
                this.phases.push(()=>this.tryQueueWithdrawTables());
                this.phases.push(()=>this.queueDepositInferiorGear());
                break;
            case "afterCrafting":
                this.phases.push(()=>this.queueDepositInferiorGear());
                this.phases.push(()=>this.queueDepositExtraItems());
                break;
        }
    }
    // #region Withdraw phases
    queueWithdrawBetterGear() {
        const entityBestGear = InventoryHelper.getBestGearInInventory(this.context.entity);
        const chestBestGear = InventoryHelper.getBestGearInInventory(this.chest);
        for (const data of chestBestGear.values()){
            if (InventoryHelper.isBetterGear(data.item, entityBestGear) !== true) continue;
            this.operations.push({
                type: "withdraw",
                slot: data.slot
            });
        }
    }
    queueWithdrawCraftingMaterials() {
        const chestContainer = InventoryUtil.getContainer(this.chest);
        const virtualInventory = VirtualInventoryComponent.get(this.context.entity);
        for (const ingredient of this.neededIngredients){
            const entityCount = virtualInventory.countItemType(ingredient.id);
            let remaining = ingredient.amount - entityCount;
            if (remaining <= 0) continue;
            const ingredientIds = CraftingHelper.TagResolutions[ingredient.id] ?? [
                ingredient.id
            ];
            for(let i = 0; i < chestContainer.size && remaining > 0; i++){
                const chestItem = chestContainer.getItem(i);
                if (!chestItem) continue;
                if (!ingredientIds.includes(chestItem.typeId)) continue;
                this.operations.push({
                    type: "withdraw",
                    slot: i
                });
                remaining -= chestItem.amount;
            }
        }
    }
    queueWithdrawEssentialSupplies() {
        const supplyIds = [
            "minecraft:torch",
            ...Object.keys(InventoryData.FoodPriority)
        ];
        this.queueWithdrawTypes(supplyIds, false);
    }
    queueWithdrawMinimumSupplies() {
        const virtualInventory = VirtualInventoryComponent.get(this.context.entity);
        const itemDeficits = new Map();
        for(const supplyId in GoUseChestProcedureData.MinimumKeepAmounts){
            const minimum = GoUseChestProcedureData.MinimumKeepAmounts[supplyId];
            const entityCount = virtualInventory.countItemType(supplyId);
            const deficit = minimum - entityCount;
            if (deficit <= 0) continue;
            itemDeficits.set(supplyId, deficit);
        }
        this.queueWithdrawTypesByDeficit(itemDeficits);
        const familyDeficits = new Map();
        for(const family in GoUseChestProcedureData.MinimumKeepAmountsFamilies){
            const minimum = GoUseChestProcedureData.MinimumKeepAmountsFamilies[family];
            const entityCount = virtualInventory.countItemTypeOfFamily(family);
            const deficit = minimum - entityCount;
            if (deficit <= 0) continue;
            familyDeficits.set(family, deficit);
        }
        this.queueWithdrawFamiliesByDeficit(familyDeficits);
    }
    tryQueueWithdrawTables() {
        let types = [
            "minecraft:crafting_table",
            "minecraft:furnace"
        ];
        const home = this.context.getValue(NearestHomeVar);
        if (home) {
            const location = V3.fromEntity(home.entity, overworld);
            // Filter out blocks that exist within the home
            types = types.filter((t)=>{
                const hasBlock = BlockUtils.getBlocksInVolume(location, AIPData.InHomeRadius, {
                    includeTypes: [
                        t
                    ]
                }).getCapacity() > 0;
                return !hasBlock;
            });
        }
        this.queueWithdrawTypes(types, true);
    }
    queueWithdrawTypes(types, ignoreIfAlreadyHas) {
        const chestContainer = InventoryUtil.getContainer(this.chest);
        for(let i = 0; i < chestContainer.size; i++){
            const chestItem = chestContainer.getItem(i);
            if (!chestItem) continue;
            if (!types.includes(chestItem.typeId)) continue;
            if (ignoreIfAlreadyHas && VirtualInventoryComponent.get(this.context.entity).hasItemType(chestItem.typeId)) continue;
            this.operations.push({
                type: "withdraw",
                slot: i
            });
        }
    }
    queueWithdrawTypesByDeficit(deficits) {
        if (deficits.size === 0) return;
        const chestContainer = InventoryUtil.getContainer(this.chest);
        for(let i = 0; i < chestContainer.size; i++){
            const chestItem = chestContainer.getItem(i);
            if (!chestItem) continue;
            const remaining = deficits.get(chestItem.typeId);
            if (!remaining || remaining <= 0) continue;
            const amountToWithdraw = Math.min(remaining, chestItem.amount);
            this.operations.push({
                type: "withdraw",
                slot: i,
                amount: amountToWithdraw
            });
            deficits.set(chestItem.typeId, remaining - amountToWithdraw);
        }
    }
    queueWithdrawFamiliesByDeficit(deficits) {
        if (deficits.size === 0) return;
        const chestContainer = InventoryUtil.getContainer(this.chest);
        for(let i = 0; i < chestContainer.size; i++){
            const chestItem = chestContainer.getItem(i);
            if (!chestItem) continue;
            const family = Array.from(deficits.keys()).find((f)=>chestItem.typeId.includes(f));
            if (!family) continue;
            const remaining = deficits.get(family);
            if (remaining <= 0) continue;
            const amountToWithdraw = Math.min(remaining, chestItem.amount);
            this.operations.push({
                type: "withdraw",
                slot: i,
                amount: amountToWithdraw
            });
            deficits.set(family, remaining - amountToWithdraw);
        }
    }
    // #endregion
    // #region Deposit phases
    queueDepositInferiorGear() {
        const entityBestGear = InventoryHelper.getBestGearInInventory(this.context.entity);
        const slots = VirtualInventoryComponent.get(this.context.entity).slots;
        for(const slot in slots){
            const item = slots[slot];
            if (!item) continue;
            if (InventoryHelper.isBetterGear(item, entityBestGear) !== false) continue;
            if (GoUseChestProcedureData.NeverDepositItems.includes(item.typeId)) continue;
            this.operations.push({
                type: "deposit",
                slot: parseInt(slot)
            });
        }
    }
    queueDepositExtraItems() {
        const slots = VirtualInventoryComponent.get(this.context.entity).slots;
        const deposited = new Map();
        const virtualInventory = VirtualInventoryComponent.get(this.context.entity);
        for(const slot in slots){
            const item = slots[slot];
            if (!item) continue;
            // Skip gear items — handled by queueDepositInferiorGear
            if (InventoryHelper.getGearType(item.typeId)) continue;
            if (GoUseChestProcedureData.NeverDepositItems.includes(item.typeId)) continue;
            let minimumKey = item.typeId;
            let minimum = GoUseChestProcedureData.MinimumKeepAmounts[item.typeId] ?? 0;
            if (minimum === 0) {
                const families = GoUseChestProcedureData.MinimumKeepAmountsFamilies;
                const family = Object.keys(families).find((f)=>item.typeId.includes(f));
                if (family) {
                    minimum = families[family];
                    minimumKey = `family:${family}`;
                }
            }
            const entityCount = minimumKey.startsWith("family:") ? virtualInventory.countItemTypeOfFamily(minimumKey.slice("family:".length)) : virtualInventory.countItemType(item.typeId);
            const alreadyDeposited = deposited.get(minimumKey) ?? 0;
            const surplus = entityCount - alreadyDeposited - minimum;
            if (surplus <= 0) continue;
            const amountToDeposit = Math.min(item.amount, surplus);
            this.operations.push({
                type: "deposit",
                slot: parseInt(slot),
                amount: amountToDeposit
            });
            deposited.set(minimumKey, alreadyDeposited + amountToDeposit);
        }
    }
    constructor(...args){
        super(...args);
        this.intent = "afterCrafting";
        this.chest = null;
        this.operations = [];
        this.phases = [];
        this.neededIngredients = [];
        this.chestOpener = null;
        this.arrivalTick = null;
    }
}
GoUseChestProcedure.definition = {
    identifier: "procedure:go_use_chest",
    priority: GoUseChestProcedureData.Priority,
    registry,
    initialState: null
};

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkdvVXNlQ2hlc3RQcm9jZWR1cmUudHMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgQmxvY2ssIEVudGl0eSwgSXRlbVN0YWNrIH0gZnJvbSBcIkBtaW5lY3JhZnQvc2VydmVyXCI7XHJcbmltcG9ydCB7IE5lYXJlc3RIb21lVmFyIH0gZnJvbSBcIkJpZ0JyYWluL0NvbnRleHQvTmVhcmVzdEhvbWVWYXJcIjtcclxuaW1wb3J0IHsgUGF0aFRvTm9kZVByb2NlZHVyZSB9IGZyb20gXCJCaWdCcmFpbi9Qcm9jZWR1cmVzL1BhdGhUb05vZGVQcm9jZWR1cmVcIjtcclxuaW1wb3J0IHsgU3dhcFRvSXRlbVByb2NlZHVyZSB9IGZyb20gXCJCaWdCcmFpbi9Qcm9jZWR1cmVzL1N3YXBUb0l0ZW1Qcm9jZWR1cmVcIjtcclxuaW1wb3J0IHsgRGVwb3NpdEl0ZW1TdGVwIH0gZnJvbSBcIkJpZ0JyYWluL1N0ZXBzL0RlcG9zaXRJdGVtU3RlcFwiO1xyXG5pbXBvcnQgeyBXaXRoZHJhd0l0ZW1TdGVwIH0gZnJvbSBcIkJpZ0JyYWluL1N0ZXBzL1dpdGhkcmF3SXRlbVN0ZXBcIjtcclxuaW1wb3J0IEFJUERhdGEgZnJvbSBcIkRhdGEvQUlQRGF0YVwiO1xyXG5pbXBvcnQgR29Vc2VDaGVzdFByb2NlZHVyZURhdGEgZnJvbSBcIkRhdGEvQmlnQnJhaW4vUHJvY2VkdXJlcy9Hb1VzZUNoZXN0UHJvY2VkdXJlRGF0YVwiO1xyXG5pbXBvcnQgeyBJbmdyZWRpZW50IH0gZnJvbSBcIkRhdGEvQ3JhZnRpbmdUcmVlRGF0YVwiO1xyXG5pbXBvcnQgeyBJbnZlbnRvcnlEYXRhIH0gZnJvbSBcIkRhdGEvSW52ZW50b3J5RGF0YVwiO1xyXG5pbXBvcnQgQ3JhZnRpbmdIZWxwZXIgZnJvbSBcIkhlbHBlcnMvQ3JhZnRpbmdIZWxwZXJcIjtcclxuaW1wb3J0IFJvdGF0aW9uSGVscGVyIGZyb20gXCJIZWxwZXJzL1JvdGF0aW9uSGVscGVyXCI7XHJcbmltcG9ydCBWMyBmcm9tIFwiSGVscGVycy9WZWN0b3JzL1YzXCI7XHJcbmltcG9ydCBJbnZlbnRvcnlIZWxwZXIgZnJvbSBcIkludmVudG9yeS9JbnZlbnRvcnlIZWxwZXJcIjtcclxuaW1wb3J0IFZpcnR1YWxJbnZlbnRvcnlDb21wb25lbnQgZnJvbSBcIkludmVudG9yeS9WaXJ0dWFsSW52ZW50b3J5Q29tcG9uZW50XCI7XHJcbmltcG9ydCBBYnN0cmFjdFN0YXRlIGZyb20gXCJTdGF0ZVNrZWxldG9uL1N0YXRlcy9BYnN0cmFjdFN0YXRlXCI7XHJcbmltcG9ydCBDb21wb3NpdGVTdGF0ZSBmcm9tIFwiU3RhdGVTa2VsZXRvbi9TdGF0ZXMvQ29tcG9zaXRlU3RhdGVcIjtcclxuaW1wb3J0IHsgQ29tcG9zaXRlU3RhdGVEZWZpbml0aW9uLCBFeGl0VHlwZSB9IGZyb20gXCJTdGF0ZVNrZWxldG9uL1R5cGVzXCI7XHJcbmltcG9ydCBCbG9ja1V0aWxzIGZyb20gXCJVdGlscy9CbG9ja1V0aWxzXCI7XHJcblxyXG5leHBvcnQgdHlwZSBDaGVzdEludGVudCA9IFwiYmVmb3JlQ3JhZnRpbmdcIiB8IFwiYWZ0ZXJDcmFmdGluZ1wiO1xyXG5cclxuaW50ZXJmYWNlIENoZXN0T3BlcmF0aW9uIHtcclxuICAgIHR5cGU6IFwid2l0aGRyYXdcIiB8IFwiZGVwb3NpdFwiO1xyXG4gICAgc2xvdDogbnVtYmVyO1xyXG4gICAgYW1vdW50PzogbnVtYmVyO1xyXG59XHJcblxyXG50eXBlIFBoYXNlID0gKCkgPT4gdm9pZDtcclxuXHJcbmNvbnN0IHJlZ2lzdHJ5ID0gW1BhdGhUb05vZGVQcm9jZWR1cmUsIERlcG9zaXRJdGVtU3RlcCwgV2l0aGRyYXdJdGVtU3RlcCwgU3dhcFRvSXRlbVByb2NlZHVyZV0gYXMgY29uc3Q7XHJcblxyXG5leHBvcnQgY2xhc3MgR29Vc2VDaGVzdFByb2NlZHVyZSBleHRlbmRzIENvbXBvc2l0ZVN0YXRlPHR5cGVvZiByZWdpc3RyeT4ge1xyXG4gICAgcHVibGljIHN0YXRpYyByZWFkb25seSBkZWZpbml0aW9uOiBDb21wb3NpdGVTdGF0ZURlZmluaXRpb248dHlwZW9mIHJlZ2lzdHJ5PiA9IHtcclxuICAgICAgICBpZGVudGlmaWVyOiBcInByb2NlZHVyZTpnb191c2VfY2hlc3RcIixcclxuICAgICAgICBwcmlvcml0eTogR29Vc2VDaGVzdFByb2NlZHVyZURhdGEuUHJpb3JpdHksXHJcbiAgICAgICAgcmVnaXN0cnksXHJcbiAgICAgICAgaW5pdGlhbFN0YXRlOiBudWxsLFxyXG4gICAgfTtcclxuXHJcbiAgICBwcml2YXRlIGludGVudDogQ2hlc3RJbnRlbnQgPSBcImFmdGVyQ3JhZnRpbmdcIjtcclxuICAgIHByaXZhdGUgY2hlc3Q6IEJsb2NrIHwgbnVsbCA9IG51bGw7XHJcbiAgICBwcml2YXRlIG9wZXJhdGlvbnM6IENoZXN0T3BlcmF0aW9uW10gPSBbXTtcclxuICAgIHByaXZhdGUgcGhhc2VzOiBQaGFzZVtdID0gW107XHJcbiAgICBwcml2YXRlIG5lZWRlZEluZ3JlZGllbnRzOiBJbmdyZWRpZW50W10gPSBbXTtcclxuICAgIHByaXZhdGUgY2hlc3RPcGVuZXI6IEVudGl0eSB8IG51bGwgPSBudWxsO1xyXG4gICAgcHJpdmF0ZSBhcnJpdmFsVGljazogbnVtYmVyIHwgbnVsbCA9IG51bGw7XHJcblxyXG4gICAgcHVibGljIHNldEludGVudChpbnRlbnQ6IENoZXN0SW50ZW50KTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5pbnRlbnQgPSBpbnRlbnQ7XHJcbiAgICB9XHJcblxyXG4gICAgcHVibGljIHNldE5lZWRlZEluZ3JlZGllbnRzKGluZ3JlZGllbnRzOiBJbmdyZWRpZW50W10pOiB2b2lkIHtcclxuICAgICAgICB0aGlzLm5lZWRlZEluZ3JlZGllbnRzID0gaW5ncmVkaWVudHM7XHJcbiAgICB9XHJcblxyXG4gICAgcHVibGljIHNldENoZXN0KGNoZXN0OiBCbG9jayk6IHZvaWQge1xyXG4gICAgICAgIHRoaXMuY2hlc3QgPSBjaGVzdDtcclxuICAgIH1cclxuXHJcbiAgICBwcm90ZWN0ZWQgb25FbnRlcigpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLm9wZXJhdGlvbnMgPSBbXTtcclxuICAgICAgICB0aGlzLnBoYXNlcyA9IFtdO1xyXG4gICAgICAgIHRoaXMuYXJyaXZhbFRpY2sgPSBudWxsO1xyXG5cclxuICAgICAgICBpZiAoIXRoaXMuaXNWYWxpZENoZXN0KCkpIHJldHVybiB0aGlzLmJyb2FkY2FzdFNpZ25hbChcIm9uRmFpbHVyZVwiKTtcclxuXHJcbiAgICAgICAgY29uc3QgcGF0aFRvTm9kZSA9IHRoaXMuZ2V0U3Vic3RhdGUoUGF0aFRvTm9kZVByb2NlZHVyZSk7XHJcbiAgICAgICAgcGF0aFRvTm9kZS5zZXRQcmltYXJ5TG9jYXRpb24oVjMuZnJvbUJsb2NrKHRoaXMuY2hlc3QhLCBvdmVyd29ybGQpLmdyaWQoKSk7XHJcbiAgICAgICAgcGF0aFRvTm9kZS5zZXRXaXRoaW5SYWRpdXMoR29Vc2VDaGVzdFByb2NlZHVyZURhdGEuQ2hlc3RQYXRoUmFkaXVzKTtcclxuICAgICAgICBwYXRoVG9Ob2RlLnNldENhbkJyZWFrQmxvY2tzKGZhbHNlKTtcclxuICAgICAgICBwYXRoVG9Ob2RlLnNldENhblBsYWNlQmxvY2tzKHRydWUpO1xyXG4gICAgICAgIHRoaXMuc2V0U3Vic3RhdGUocGF0aFRvTm9kZSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJvdGVjdGVkIG9uRXhpdChleGl0VHlwZTogRXhpdFR5cGUpOiB2b2lkIHtcclxuICAgICAgICBpZiAoZXhpdFR5cGUgPT09IEV4aXRUeXBlLlNodXRkb3duKSByZXR1cm47XHJcbiAgICAgICAgaWYgKHRoaXMuY2hlc3RPcGVuZXI/LmlzVmFsaWQpIHRoaXMuY2hlc3RPcGVuZXIucmVtb3ZlKCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJvdGVjdGVkIG9uQWN0aXZlVGljaygpOiB2b2lkIHtcclxuICAgICAgICBpZiAodGhpcy5hcnJpdmFsVGljayA9PT0gbnVsbCkgcmV0dXJuO1xyXG5cclxuICAgICAgICBSb3RhdGlvbkhlbHBlci5sb29rQXRCbG9jayh0aGlzLmNvbnRleHQuZW50aXR5LCB0aGlzLmNoZXN0ISk7XHJcblxyXG4gICAgICAgIGlmIChNYWluLmN1cnJlbnRUaWNrIC0gdGhpcy5hcnJpdmFsVGljayA8IEdvVXNlQ2hlc3RQcm9jZWR1cmVEYXRhLlRyYW5zZmVyV2FybXVwVGlja3MpIHJldHVybjtcclxuXHJcbiAgICAgICAgdGhpcy5hcnJpdmFsVGljayA9IG51bGw7XHJcbiAgICAgICAgdGhpcy5zdGFydFRyYW5zZmVycmluZ0l0ZW1zKCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBpc1ZhbGlkQ2hlc3QoKTogYm9vbGVhbiB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuY2hlc3QgIT09IG51bGwgJiYgdGhpcy5jaGVzdC50eXBlSWQgPT09IFwibWluZWNyYWZ0OmNoZXN0XCI7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBzdGFydFRyYW5zZmVycmluZ0l0ZW1zKCkge1xyXG4gICAgICAgIGlmICghdGhpcy5pc1ZhbGlkQ2hlc3QoKSkgcmV0dXJuIHRoaXMuYnJvYWRjYXN0U2lnbmFsKFwib25GYWlsdXJlXCIpO1xyXG5cclxuICAgICAgICB0aGlzLnF1ZXVlUGhhc2VzRnJvbUludGVudCgpO1xyXG4gICAgICAgIHRoaXMudHJ5RXhlY3V0ZU5leHRPcGVyYXRpb24oKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHNwYXduQ2hlc3RPcGVuZXIoKTogdm9pZCB7XHJcbiAgICAgICAgY29uc3QgbG9jYXRpb24gPSBWMy5mcm9tQmxvY2sodGhpcy5jaGVzdCEsIG92ZXJ3b3JsZCkuYWRkKDAsIDEsIDApO1xyXG5cclxuICAgICAgICBpZiAoIWxvY2F0aW9uLmlzTG9hZGVkKCkpIHJldHVybjtcclxuICAgICAgICB0aGlzLmNoZXN0T3BlbmVyID0gRW50aXR5VXRpbC5zcGF3bkVudGl0eShcImdtMV9za3k6Y2hlc3Rfb3BlbmVyXCIsIGxvY2F0aW9uLCBsb2NhdGlvbi5kaW1lbnNpb24pO1xyXG4gICAgfVxyXG5cclxuICAgIHByb3RlY3RlZCBvblN1YnN0YXRlQ29tcGxldGUoc3RhdGU6IEFic3RyYWN0U3RhdGUpOiB2b2lkIHtcclxuICAgICAgICBpZiAoc3RhdGUuaXMoUGF0aFRvTm9kZVByb2NlZHVyZSkpIHtcclxuICAgICAgICAgICAgdGhpcy5zcGF3bkNoZXN0T3BlbmVyKCk7XHJcbiAgICAgICAgICAgIHRoaXMuc2V0U3Vic3RhdGUobnVsbCk7XHJcbiAgICAgICAgICAgIHRoaXMuYXJyaXZhbFRpY2sgPSBNYWluLmN1cnJlbnRUaWNrO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBpZiAoc3RhdGUuaXMoRGVwb3NpdEl0ZW1TdGVwKSB8fCBzdGF0ZS5pcyhXaXRoZHJhd0l0ZW1TdGVwKSkge1xyXG4gICAgICAgICAgICB0aGlzLnRyeUV4ZWN1dGVOZXh0T3BlcmF0aW9uKCk7XHJcbiAgICAgICAgfSBlbHNlIGlmIChzdGF0ZS5pcyhTd2FwVG9JdGVtUHJvY2VkdXJlKSkge1xyXG4gICAgICAgICAgICB0aGlzLmJyb2FkY2FzdFNpZ25hbChcIm9uQ29tcGxldGVcIik7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByb3RlY3RlZCBvblN1YnN0YXRlRmFpbHVyZShzdGF0ZTogQWJzdHJhY3RTdGF0ZSk6IHZvaWQge1xyXG4gICAgICAgIC8vIElmIGEgZGVwb3NpdC93aXRoZHJhdyBmYWlscywgc2tpcCBpdCBhbmQgY29udGludWUgd2l0aCB0aGUgcmVzdFxyXG4gICAgICAgIGlmIChzdGF0ZS5pcyhEZXBvc2l0SXRlbVN0ZXApIHx8IHN0YXRlLmlzKFdpdGhkcmF3SXRlbVN0ZXApKSB7XHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnRyeUV4ZWN1dGVOZXh0T3BlcmF0aW9uKCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB0aGlzLmJyb2FkY2FzdFNpZ25hbChcIm9uRmFpbHVyZVwiKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHN3YXBUb0VtcHR5SGFuZCgpOiB2b2lkIHtcclxuICAgICAgICBjb25zdCBzd2FwID0gdGhpcy5nZXRTdWJzdGF0ZShTd2FwVG9JdGVtUHJvY2VkdXJlKTtcclxuICAgICAgICBzd2FwLnNldEl0ZW0obmV3IEl0ZW1TdGFjayhcIm1pbmVjcmFmdDphaXJcIikpO1xyXG4gICAgICAgIHN3YXAuc2V0U2hvdWxkU2Nyb2xsKGZhbHNlKTtcclxuICAgICAgICB0aGlzLnNldFN1YnN0YXRlKHN3YXApO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgdHJ5RXhlY3V0ZU5leHRPcGVyYXRpb24oKTogdm9pZCB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmlzVmFsaWRDaGVzdCgpKSByZXR1cm4gdGhpcy5icm9hZGNhc3RTaWduYWwoXCJvbkZhaWx1cmVcIik7XHJcblxyXG4gICAgICAgIGlmICh0aGlzLm9wZXJhdGlvbnMubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IG5leHRQaGFzZSA9IHRoaXMucGhhc2VzLnNoaWZ0KCk7XHJcbiAgICAgICAgICAgIGlmICghbmV4dFBoYXNlKSByZXR1cm4gdGhpcy5zd2FwVG9FbXB0eUhhbmQoKTtcclxuXHJcbiAgICAgICAgICAgIG5leHRQaGFzZSgpO1xyXG5cclxuICAgICAgICAgICAgdGhpcy50cnlFeGVjdXRlTmV4dE9wZXJhdGlvbigpO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBjb25zdCBvcGVyYXRpb24gPSB0aGlzLm9wZXJhdGlvbnMuc2hpZnQoKSE7XHJcblxyXG4gICAgICAgIGlmIChvcGVyYXRpb24udHlwZSA9PT0gXCJ3aXRoZHJhd1wiKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHN0ZXAgPSB0aGlzLmdldFN1YnN0YXRlKFdpdGhkcmF3SXRlbVN0ZXApO1xyXG4gICAgICAgICAgICBzdGVwLnNldENoZXN0KHRoaXMuY2hlc3QhKTtcclxuICAgICAgICAgICAgc3RlcC5zZXRDaGVzdFNsb3Qob3BlcmF0aW9uLnNsb3QpO1xyXG4gICAgICAgICAgICBzdGVwLnNldEFtb3VudChvcGVyYXRpb24uYW1vdW50ID8/IG51bGwpO1xyXG4gICAgICAgICAgICB0aGlzLnNldFN1YnN0YXRlKHN0ZXApO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHN0ZXAgPSB0aGlzLmdldFN1YnN0YXRlKERlcG9zaXRJdGVtU3RlcCk7XHJcbiAgICAgICAgICAgIHN0ZXAuc2V0Q2hlc3QodGhpcy5jaGVzdCEpO1xyXG4gICAgICAgICAgICBzdGVwLnNldEVudGl0eVNsb3Qob3BlcmF0aW9uLnNsb3QpO1xyXG4gICAgICAgICAgICBzdGVwLnNldEFtb3VudChvcGVyYXRpb24uYW1vdW50ID8/IG51bGwpO1xyXG4gICAgICAgICAgICB0aGlzLnNldFN1YnN0YXRlKHN0ZXApO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHF1ZXVlUGhhc2VzRnJvbUludGVudCgpOiB2b2lkIHtcclxuICAgICAgICBzd2l0Y2ggKHRoaXMuaW50ZW50KSB7XHJcbiAgICAgICAgICAgIGNhc2UgXCJiZWZvcmVDcmFmdGluZ1wiOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5waGFzZXMucHVzaCgoKSA9PiB0aGlzLnF1ZXVlRGVwb3NpdEluZmVyaW9yR2VhcigpKTtcclxuICAgICAgICAgICAgICAgIHRoaXMucGhhc2VzLnB1c2goKCkgPT4gdGhpcy5xdWV1ZVdpdGhkcmF3QmV0dGVyR2VhcigpKTtcclxuICAgICAgICAgICAgICAgIHRoaXMucGhhc2VzLnB1c2goKCkgPT4gdGhpcy5xdWV1ZVdpdGhkcmF3Q3JhZnRpbmdNYXRlcmlhbHMoKSk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnBoYXNlcy5wdXNoKCgpID0+IHRoaXMucXVldWVXaXRoZHJhd0Vzc2VudGlhbFN1cHBsaWVzKCkpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5waGFzZXMucHVzaCgoKSA9PiB0aGlzLnF1ZXVlV2l0aGRyYXdNaW5pbXVtU3VwcGxpZXMoKSk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnBoYXNlcy5wdXNoKCgpID0+IHRoaXMudHJ5UXVldWVXaXRoZHJhd1RhYmxlcygpKTtcclxuICAgICAgICAgICAgICAgIHRoaXMucGhhc2VzLnB1c2goKCkgPT4gdGhpcy5xdWV1ZURlcG9zaXRJbmZlcmlvckdlYXIoKSk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBcImFmdGVyQ3JhZnRpbmdcIjpcclxuICAgICAgICAgICAgICAgIHRoaXMucGhhc2VzLnB1c2goKCkgPT4gdGhpcy5xdWV1ZURlcG9zaXRJbmZlcmlvckdlYXIoKSk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnBoYXNlcy5wdXNoKCgpID0+IHRoaXMucXVldWVEZXBvc2l0RXh0cmFJdGVtcygpKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvLyAjcmVnaW9uIFdpdGhkcmF3IHBoYXNlc1xyXG5cclxuICAgIHByaXZhdGUgcXVldWVXaXRoZHJhd0JldHRlckdlYXIoKTogdm9pZCB7XHJcbiAgICAgICAgY29uc3QgZW50aXR5QmVzdEdlYXIgPSBJbnZlbnRvcnlIZWxwZXIuZ2V0QmVzdEdlYXJJbkludmVudG9yeSh0aGlzLmNvbnRleHQuZW50aXR5KTtcclxuICAgICAgICBjb25zdCBjaGVzdEJlc3RHZWFyID0gSW52ZW50b3J5SGVscGVyLmdldEJlc3RHZWFySW5JbnZlbnRvcnkodGhpcy5jaGVzdCEpO1xyXG5cclxuICAgICAgICBmb3IgKGNvbnN0IGRhdGEgb2YgY2hlc3RCZXN0R2Vhci52YWx1ZXMoKSkge1xyXG4gICAgICAgICAgICBpZiAoSW52ZW50b3J5SGVscGVyLmlzQmV0dGVyR2VhcihkYXRhLml0ZW0sIGVudGl0eUJlc3RHZWFyKSAhPT0gdHJ1ZSkgY29udGludWU7XHJcbiAgICAgICAgICAgIHRoaXMub3BlcmF0aW9ucy5wdXNoKHsgdHlwZTogXCJ3aXRoZHJhd1wiLCBzbG90OiBkYXRhLnNsb3QhIH0pO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHF1ZXVlV2l0aGRyYXdDcmFmdGluZ01hdGVyaWFscygpOiB2b2lkIHtcclxuICAgICAgICBjb25zdCBjaGVzdENvbnRhaW5lciA9IEludmVudG9yeVV0aWwuZ2V0Q29udGFpbmVyKHRoaXMuY2hlc3QhKTtcclxuICAgICAgICBjb25zdCB2aXJ0dWFsSW52ZW50b3J5ID0gVmlydHVhbEludmVudG9yeUNvbXBvbmVudC5nZXQodGhpcy5jb250ZXh0LmVudGl0eSk7XHJcblxyXG4gICAgICAgIGZvciAoY29uc3QgaW5ncmVkaWVudCBvZiB0aGlzLm5lZWRlZEluZ3JlZGllbnRzKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGVudGl0eUNvdW50ID0gdmlydHVhbEludmVudG9yeS5jb3VudEl0ZW1UeXBlKGluZ3JlZGllbnQuaWQpO1xyXG4gICAgICAgICAgICBsZXQgcmVtYWluaW5nID0gaW5ncmVkaWVudC5hbW91bnQgLSBlbnRpdHlDb3VudDtcclxuICAgICAgICAgICAgaWYgKHJlbWFpbmluZyA8PSAwKSBjb250aW51ZTtcclxuXHJcbiAgICAgICAgICAgIGNvbnN0IGluZ3JlZGllbnRJZHMgPSBDcmFmdGluZ0hlbHBlci5UYWdSZXNvbHV0aW9uc1tpbmdyZWRpZW50LmlkXSA/PyBbaW5ncmVkaWVudC5pZF07XHJcblxyXG4gICAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGNoZXN0Q29udGFpbmVyLnNpemUgJiYgcmVtYWluaW5nID4gMDsgaSsrKSB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBjaGVzdEl0ZW0gPSBjaGVzdENvbnRhaW5lci5nZXRJdGVtKGkpO1xyXG4gICAgICAgICAgICAgICAgaWYgKCFjaGVzdEl0ZW0pIGNvbnRpbnVlO1xyXG4gICAgICAgICAgICAgICAgaWYgKCFpbmdyZWRpZW50SWRzLmluY2x1ZGVzKGNoZXN0SXRlbS50eXBlSWQpKSBjb250aW51ZTtcclxuXHJcbiAgICAgICAgICAgICAgICB0aGlzLm9wZXJhdGlvbnMucHVzaCh7IHR5cGU6IFwid2l0aGRyYXdcIiwgc2xvdDogaSB9KTtcclxuICAgICAgICAgICAgICAgIHJlbWFpbmluZyAtPSBjaGVzdEl0ZW0uYW1vdW50O1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgcXVldWVXaXRoZHJhd0Vzc2VudGlhbFN1cHBsaWVzKCk6IHZvaWQge1xyXG4gICAgICAgIGNvbnN0IHN1cHBseUlkcyA9IFtcIm1pbmVjcmFmdDp0b3JjaFwiLCAuLi5PYmplY3Qua2V5cyhJbnZlbnRvcnlEYXRhLkZvb2RQcmlvcml0eSldO1xyXG4gICAgICAgIHRoaXMucXVldWVXaXRoZHJhd1R5cGVzKHN1cHBseUlkcywgZmFsc2UpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgcXVldWVXaXRoZHJhd01pbmltdW1TdXBwbGllcygpOiB2b2lkIHtcclxuICAgICAgICBjb25zdCB2aXJ0dWFsSW52ZW50b3J5ID0gVmlydHVhbEludmVudG9yeUNvbXBvbmVudC5nZXQodGhpcy5jb250ZXh0LmVudGl0eSk7XHJcbiAgICAgICAgY29uc3QgaXRlbURlZmljaXRzID0gbmV3IE1hcDxzdHJpbmcsIG51bWJlcj4oKTtcclxuXHJcbiAgICAgICAgZm9yIChjb25zdCBzdXBwbHlJZCBpbiBHb1VzZUNoZXN0UHJvY2VkdXJlRGF0YS5NaW5pbXVtS2VlcEFtb3VudHMpIHtcclxuICAgICAgICAgICAgY29uc3QgbWluaW11bSA9IEdvVXNlQ2hlc3RQcm9jZWR1cmVEYXRhLk1pbmltdW1LZWVwQW1vdW50c1tzdXBwbHlJZF07XHJcbiAgICAgICAgICAgIGNvbnN0IGVudGl0eUNvdW50ID0gdmlydHVhbEludmVudG9yeS5jb3VudEl0ZW1UeXBlKHN1cHBseUlkKTtcclxuICAgICAgICAgICAgY29uc3QgZGVmaWNpdCA9IG1pbmltdW0gLSBlbnRpdHlDb3VudDtcclxuICAgICAgICAgICAgaWYgKGRlZmljaXQgPD0gMCkgY29udGludWU7XHJcblxyXG4gICAgICAgICAgICBpdGVtRGVmaWNpdHMuc2V0KHN1cHBseUlkLCBkZWZpY2l0KTtcclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy5xdWV1ZVdpdGhkcmF3VHlwZXNCeURlZmljaXQoaXRlbURlZmljaXRzKTtcclxuXHJcbiAgICAgICAgY29uc3QgZmFtaWx5RGVmaWNpdHMgPSBuZXcgTWFwPHN0cmluZywgbnVtYmVyPigpO1xyXG4gICAgICAgIGZvciAoY29uc3QgZmFtaWx5IGluIEdvVXNlQ2hlc3RQcm9jZWR1cmVEYXRhLk1pbmltdW1LZWVwQW1vdW50c0ZhbWlsaWVzKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IG1pbmltdW0gPSBHb1VzZUNoZXN0UHJvY2VkdXJlRGF0YS5NaW5pbXVtS2VlcEFtb3VudHNGYW1pbGllc1tmYW1pbHldO1xyXG4gICAgICAgICAgICBjb25zdCBlbnRpdHlDb3VudCA9IHZpcnR1YWxJbnZlbnRvcnkuY291bnRJdGVtVHlwZU9mRmFtaWx5KGZhbWlseSk7XHJcbiAgICAgICAgICAgIGNvbnN0IGRlZmljaXQgPSBtaW5pbXVtIC0gZW50aXR5Q291bnQ7XHJcbiAgICAgICAgICAgIGlmIChkZWZpY2l0IDw9IDApIGNvbnRpbnVlO1xyXG5cclxuICAgICAgICAgICAgZmFtaWx5RGVmaWNpdHMuc2V0KGZhbWlseSwgZGVmaWNpdCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMucXVldWVXaXRoZHJhd0ZhbWlsaWVzQnlEZWZpY2l0KGZhbWlseURlZmljaXRzKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHRyeVF1ZXVlV2l0aGRyYXdUYWJsZXMoKTogdm9pZCB7XHJcbiAgICAgICAgbGV0IHR5cGVzID0gW1wibWluZWNyYWZ0OmNyYWZ0aW5nX3RhYmxlXCIsIFwibWluZWNyYWZ0OmZ1cm5hY2VcIl07XHJcblxyXG4gICAgICAgIGNvbnN0IGhvbWUgPSB0aGlzLmNvbnRleHQuZ2V0VmFsdWUoTmVhcmVzdEhvbWVWYXIpO1xyXG4gICAgICAgIGlmIChob21lKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGxvY2F0aW9uID0gVjMuZnJvbUVudGl0eShob21lLmVudGl0eSwgb3ZlcndvcmxkKTtcclxuXHJcbiAgICAgICAgICAgIC8vIEZpbHRlciBvdXQgYmxvY2tzIHRoYXQgZXhpc3Qgd2l0aGluIHRoZSBob21lXHJcbiAgICAgICAgICAgIHR5cGVzID0gdHlwZXMuZmlsdGVyKCh0KSA9PiB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBoYXNCbG9jayA9IEJsb2NrVXRpbHMuZ2V0QmxvY2tzSW5Wb2x1bWUobG9jYXRpb24sIEFJUERhdGEuSW5Ib21lUmFkaXVzLCB7IGluY2x1ZGVUeXBlczogW3RdIH0pLmdldENhcGFjaXR5KCkgPiAwO1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuICFoYXNCbG9jaztcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB0aGlzLnF1ZXVlV2l0aGRyYXdUeXBlcyh0eXBlcywgdHJ1ZSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBxdWV1ZVdpdGhkcmF3VHlwZXModHlwZXM6IHN0cmluZ1tdLCBpZ25vcmVJZkFscmVhZHlIYXM6IGJvb2xlYW4pOiB2b2lkIHtcclxuICAgICAgICBjb25zdCBjaGVzdENvbnRhaW5lciA9IEludmVudG9yeVV0aWwuZ2V0Q29udGFpbmVyKHRoaXMuY2hlc3QhKTtcclxuXHJcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBjaGVzdENvbnRhaW5lci5zaXplOyBpKyspIHtcclxuICAgICAgICAgICAgY29uc3QgY2hlc3RJdGVtID0gY2hlc3RDb250YWluZXIuZ2V0SXRlbShpKTtcclxuICAgICAgICAgICAgaWYgKCFjaGVzdEl0ZW0pIGNvbnRpbnVlO1xyXG4gICAgICAgICAgICBpZiAoIXR5cGVzLmluY2x1ZGVzKGNoZXN0SXRlbS50eXBlSWQpKSBjb250aW51ZTtcclxuXHJcbiAgICAgICAgICAgIGlmIChpZ25vcmVJZkFscmVhZHlIYXMgJiYgVmlydHVhbEludmVudG9yeUNvbXBvbmVudC5nZXQodGhpcy5jb250ZXh0LmVudGl0eSkuaGFzSXRlbVR5cGUoY2hlc3RJdGVtLnR5cGVJZCkpIGNvbnRpbnVlO1xyXG5cclxuICAgICAgICAgICAgdGhpcy5vcGVyYXRpb25zLnB1c2goeyB0eXBlOiBcIndpdGhkcmF3XCIsIHNsb3Q6IGkgfSk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgcXVldWVXaXRoZHJhd1R5cGVzQnlEZWZpY2l0KGRlZmljaXRzOiBNYXA8c3RyaW5nLCBudW1iZXI+KTogdm9pZCB7XHJcbiAgICAgICAgaWYgKGRlZmljaXRzLnNpemUgPT09IDApIHJldHVybjtcclxuXHJcbiAgICAgICAgY29uc3QgY2hlc3RDb250YWluZXIgPSBJbnZlbnRvcnlVdGlsLmdldENvbnRhaW5lcih0aGlzLmNoZXN0ISk7XHJcblxyXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgY2hlc3RDb250YWluZXIuc2l6ZTsgaSsrKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGNoZXN0SXRlbSA9IGNoZXN0Q29udGFpbmVyLmdldEl0ZW0oaSk7XHJcbiAgICAgICAgICAgIGlmICghY2hlc3RJdGVtKSBjb250aW51ZTtcclxuXHJcbiAgICAgICAgICAgIGNvbnN0IHJlbWFpbmluZyA9IGRlZmljaXRzLmdldChjaGVzdEl0ZW0udHlwZUlkKTtcclxuICAgICAgICAgICAgaWYgKCFyZW1haW5pbmcgfHwgcmVtYWluaW5nIDw9IDApIGNvbnRpbnVlO1xyXG5cclxuICAgICAgICAgICAgY29uc3QgYW1vdW50VG9XaXRoZHJhdyA9IE1hdGgubWluKHJlbWFpbmluZywgY2hlc3RJdGVtLmFtb3VudCk7XHJcbiAgICAgICAgICAgIHRoaXMub3BlcmF0aW9ucy5wdXNoKHsgdHlwZTogXCJ3aXRoZHJhd1wiLCBzbG90OiBpLCBhbW91bnQ6IGFtb3VudFRvV2l0aGRyYXcgfSk7XHJcbiAgICAgICAgICAgIGRlZmljaXRzLnNldChjaGVzdEl0ZW0udHlwZUlkLCByZW1haW5pbmcgLSBhbW91bnRUb1dpdGhkcmF3KTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBxdWV1ZVdpdGhkcmF3RmFtaWxpZXNCeURlZmljaXQoZGVmaWNpdHM6IE1hcDxzdHJpbmcsIG51bWJlcj4pOiB2b2lkIHtcclxuICAgICAgICBpZiAoZGVmaWNpdHMuc2l6ZSA9PT0gMCkgcmV0dXJuO1xyXG5cclxuICAgICAgICBjb25zdCBjaGVzdENvbnRhaW5lciA9IEludmVudG9yeVV0aWwuZ2V0Q29udGFpbmVyKHRoaXMuY2hlc3QhKTtcclxuXHJcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBjaGVzdENvbnRhaW5lci5zaXplOyBpKyspIHtcclxuICAgICAgICAgICAgY29uc3QgY2hlc3RJdGVtID0gY2hlc3RDb250YWluZXIuZ2V0SXRlbShpKTtcclxuICAgICAgICAgICAgaWYgKCFjaGVzdEl0ZW0pIGNvbnRpbnVlO1xyXG5cclxuICAgICAgICAgICAgY29uc3QgZmFtaWx5ID0gQXJyYXkuZnJvbShkZWZpY2l0cy5rZXlzKCkpLmZpbmQoKGYpID0+IGNoZXN0SXRlbS50eXBlSWQuaW5jbHVkZXMoZikpO1xyXG4gICAgICAgICAgICBpZiAoIWZhbWlseSkgY29udGludWU7XHJcblxyXG4gICAgICAgICAgICBjb25zdCByZW1haW5pbmcgPSBkZWZpY2l0cy5nZXQoZmFtaWx5KSE7XHJcbiAgICAgICAgICAgIGlmIChyZW1haW5pbmcgPD0gMCkgY29udGludWU7XHJcblxyXG4gICAgICAgICAgICBjb25zdCBhbW91bnRUb1dpdGhkcmF3ID0gTWF0aC5taW4ocmVtYWluaW5nLCBjaGVzdEl0ZW0uYW1vdW50KTtcclxuICAgICAgICAgICAgdGhpcy5vcGVyYXRpb25zLnB1c2goeyB0eXBlOiBcIndpdGhkcmF3XCIsIHNsb3Q6IGksIGFtb3VudDogYW1vdW50VG9XaXRoZHJhdyB9KTtcclxuICAgICAgICAgICAgZGVmaWNpdHMuc2V0KGZhbWlseSwgcmVtYWluaW5nIC0gYW1vdW50VG9XaXRoZHJhdyk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8vICNlbmRyZWdpb25cclxuXHJcbiAgICAvLyAjcmVnaW9uIERlcG9zaXQgcGhhc2VzXHJcblxyXG4gICAgcHJpdmF0ZSBxdWV1ZURlcG9zaXRJbmZlcmlvckdlYXIoKTogdm9pZCB7XHJcbiAgICAgICAgY29uc3QgZW50aXR5QmVzdEdlYXIgPSBJbnZlbnRvcnlIZWxwZXIuZ2V0QmVzdEdlYXJJbkludmVudG9yeSh0aGlzLmNvbnRleHQuZW50aXR5KTtcclxuICAgICAgICBjb25zdCBzbG90cyA9IFZpcnR1YWxJbnZlbnRvcnlDb21wb25lbnQuZ2V0KHRoaXMuY29udGV4dC5lbnRpdHkpLnNsb3RzO1xyXG5cclxuICAgICAgICBmb3IgKGNvbnN0IHNsb3QgaW4gc2xvdHMpIHtcclxuICAgICAgICAgICAgY29uc3QgaXRlbSA9IHNsb3RzW3Nsb3RdO1xyXG4gICAgICAgICAgICBpZiAoIWl0ZW0pIGNvbnRpbnVlO1xyXG5cclxuICAgICAgICAgICAgaWYgKEludmVudG9yeUhlbHBlci5pc0JldHRlckdlYXIoaXRlbSwgZW50aXR5QmVzdEdlYXIpICE9PSBmYWxzZSkgY29udGludWU7XHJcbiAgICAgICAgICAgIGlmIChHb1VzZUNoZXN0UHJvY2VkdXJlRGF0YS5OZXZlckRlcG9zaXRJdGVtcy5pbmNsdWRlcyhpdGVtLnR5cGVJZCkpIGNvbnRpbnVlO1xyXG5cclxuICAgICAgICAgICAgdGhpcy5vcGVyYXRpb25zLnB1c2goeyB0eXBlOiBcImRlcG9zaXRcIiwgc2xvdDogcGFyc2VJbnQoc2xvdCkgfSk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgcXVldWVEZXBvc2l0RXh0cmFJdGVtcygpOiB2b2lkIHtcclxuICAgICAgICBjb25zdCBzbG90cyA9IFZpcnR1YWxJbnZlbnRvcnlDb21wb25lbnQuZ2V0KHRoaXMuY29udGV4dC5lbnRpdHkpLnNsb3RzO1xyXG4gICAgICAgIGNvbnN0IGRlcG9zaXRlZCA9IG5ldyBNYXA8c3RyaW5nLCBudW1iZXI+KCk7XHJcbiAgICAgICAgY29uc3QgdmlydHVhbEludmVudG9yeSA9IFZpcnR1YWxJbnZlbnRvcnlDb21wb25lbnQuZ2V0KHRoaXMuY29udGV4dC5lbnRpdHkpO1xyXG5cclxuICAgICAgICBmb3IgKGNvbnN0IHNsb3QgaW4gc2xvdHMpIHtcclxuICAgICAgICAgICAgY29uc3QgaXRlbSA9IHNsb3RzW3Nsb3RdO1xyXG4gICAgICAgICAgICBpZiAoIWl0ZW0pIGNvbnRpbnVlO1xyXG5cclxuICAgICAgICAgICAgLy8gU2tpcCBnZWFyIGl0ZW1zIOKAlCBoYW5kbGVkIGJ5IHF1ZXVlRGVwb3NpdEluZmVyaW9yR2VhclxyXG4gICAgICAgICAgICBpZiAoSW52ZW50b3J5SGVscGVyLmdldEdlYXJUeXBlKGl0ZW0udHlwZUlkKSkgY29udGludWU7XHJcbiAgICAgICAgICAgIGlmIChHb1VzZUNoZXN0UHJvY2VkdXJlRGF0YS5OZXZlckRlcG9zaXRJdGVtcy5pbmNsdWRlcyhpdGVtLnR5cGVJZCkpIGNvbnRpbnVlO1xyXG5cclxuICAgICAgICAgICAgbGV0IG1pbmltdW1LZXkgPSBpdGVtLnR5cGVJZDtcclxuICAgICAgICAgICAgbGV0IG1pbmltdW0gPSBHb1VzZUNoZXN0UHJvY2VkdXJlRGF0YS5NaW5pbXVtS2VlcEFtb3VudHNbaXRlbS50eXBlSWRdID8/IDA7XHJcblxyXG4gICAgICAgICAgICBpZiAobWluaW11bSA9PT0gMCkge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgZmFtaWxpZXMgPSBHb1VzZUNoZXN0UHJvY2VkdXJlRGF0YS5NaW5pbXVtS2VlcEFtb3VudHNGYW1pbGllcztcclxuICAgICAgICAgICAgICAgIGNvbnN0IGZhbWlseSA9IE9iamVjdC5rZXlzKGZhbWlsaWVzKS5maW5kKChmKSA9PiBpdGVtLnR5cGVJZC5pbmNsdWRlcyhmKSk7XHJcbiAgICAgICAgICAgICAgICBpZiAoZmFtaWx5KSB7XHJcbiAgICAgICAgICAgICAgICAgICAgbWluaW11bSA9IGZhbWlsaWVzW2ZhbWlseV07XHJcbiAgICAgICAgICAgICAgICAgICAgbWluaW11bUtleSA9IGBmYW1pbHk6JHtmYW1pbHl9YDtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgY29uc3QgZW50aXR5Q291bnQgPSBtaW5pbXVtS2V5LnN0YXJ0c1dpdGgoXCJmYW1pbHk6XCIpXHJcbiAgICAgICAgICAgICAgICA/IHZpcnR1YWxJbnZlbnRvcnkuY291bnRJdGVtVHlwZU9mRmFtaWx5KG1pbmltdW1LZXkuc2xpY2UoXCJmYW1pbHk6XCIubGVuZ3RoKSlcclxuICAgICAgICAgICAgICAgIDogdmlydHVhbEludmVudG9yeS5jb3VudEl0ZW1UeXBlKGl0ZW0udHlwZUlkKTtcclxuXHJcbiAgICAgICAgICAgIGNvbnN0IGFscmVhZHlEZXBvc2l0ZWQgPSBkZXBvc2l0ZWQuZ2V0KG1pbmltdW1LZXkpID8/IDA7XHJcbiAgICAgICAgICAgIGNvbnN0IHN1cnBsdXMgPSBlbnRpdHlDb3VudCAtIGFscmVhZHlEZXBvc2l0ZWQgLSBtaW5pbXVtO1xyXG5cclxuICAgICAgICAgICAgaWYgKHN1cnBsdXMgPD0gMCkgY29udGludWU7XHJcblxyXG4gICAgICAgICAgICBjb25zdCBhbW91bnRUb0RlcG9zaXQgPSBNYXRoLm1pbihpdGVtLmFtb3VudCwgc3VycGx1cyk7XHJcbiAgICAgICAgICAgIHRoaXMub3BlcmF0aW9ucy5wdXNoKHsgdHlwZTogXCJkZXBvc2l0XCIsIHNsb3Q6IHBhcnNlSW50KHNsb3QpLCBhbW91bnQ6IGFtb3VudFRvRGVwb3NpdCB9KTtcclxuICAgICAgICAgICAgZGVwb3NpdGVkLnNldChtaW5pbXVtS2V5LCBhbHJlYWR5RGVwb3NpdGVkICsgYW1vdW50VG9EZXBvc2l0KTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLy8gI2VuZHJlZ2lvblxyXG59XHJcbiJdLCJuYW1lcyI6WyJJdGVtU3RhY2siLCJOZWFyZXN0SG9tZVZhciIsIlBhdGhUb05vZGVQcm9jZWR1cmUiLCJTd2FwVG9JdGVtUHJvY2VkdXJlIiwiRGVwb3NpdEl0ZW1TdGVwIiwiV2l0aGRyYXdJdGVtU3RlcCIsIkFJUERhdGEiLCJHb1VzZUNoZXN0UHJvY2VkdXJlRGF0YSIsIkludmVudG9yeURhdGEiLCJDcmFmdGluZ0hlbHBlciIsIlJvdGF0aW9uSGVscGVyIiwiVjMiLCJJbnZlbnRvcnlIZWxwZXIiLCJWaXJ0dWFsSW52ZW50b3J5Q29tcG9uZW50IiwiQ29tcG9zaXRlU3RhdGUiLCJFeGl0VHlwZSIsIkJsb2NrVXRpbHMiLCJyZWdpc3RyeSIsIkdvVXNlQ2hlc3RQcm9jZWR1cmUiLCJzZXRJbnRlbnQiLCJpbnRlbnQiLCJzZXROZWVkZWRJbmdyZWRpZW50cyIsImluZ3JlZGllbnRzIiwibmVlZGVkSW5ncmVkaWVudHMiLCJzZXRDaGVzdCIsImNoZXN0Iiwib25FbnRlciIsIm9wZXJhdGlvbnMiLCJwaGFzZXMiLCJhcnJpdmFsVGljayIsImlzVmFsaWRDaGVzdCIsImJyb2FkY2FzdFNpZ25hbCIsInBhdGhUb05vZGUiLCJnZXRTdWJzdGF0ZSIsInNldFByaW1hcnlMb2NhdGlvbiIsImZyb21CbG9jayIsIm92ZXJ3b3JsZCIsImdyaWQiLCJzZXRXaXRoaW5SYWRpdXMiLCJDaGVzdFBhdGhSYWRpdXMiLCJzZXRDYW5CcmVha0Jsb2NrcyIsInNldENhblBsYWNlQmxvY2tzIiwic2V0U3Vic3RhdGUiLCJvbkV4aXQiLCJleGl0VHlwZSIsIlNodXRkb3duIiwiY2hlc3RPcGVuZXIiLCJpc1ZhbGlkIiwicmVtb3ZlIiwib25BY3RpdmVUaWNrIiwibG9va0F0QmxvY2siLCJjb250ZXh0IiwiZW50aXR5IiwiTWFpbiIsImN1cnJlbnRUaWNrIiwiVHJhbnNmZXJXYXJtdXBUaWNrcyIsInN0YXJ0VHJhbnNmZXJyaW5nSXRlbXMiLCJ0eXBlSWQiLCJxdWV1ZVBoYXNlc0Zyb21JbnRlbnQiLCJ0cnlFeGVjdXRlTmV4dE9wZXJhdGlvbiIsInNwYXduQ2hlc3RPcGVuZXIiLCJsb2NhdGlvbiIsImFkZCIsImlzTG9hZGVkIiwiRW50aXR5VXRpbCIsInNwYXduRW50aXR5IiwiZGltZW5zaW9uIiwib25TdWJzdGF0ZUNvbXBsZXRlIiwic3RhdGUiLCJpcyIsIm9uU3Vic3RhdGVGYWlsdXJlIiwic3dhcFRvRW1wdHlIYW5kIiwic3dhcCIsInNldEl0ZW0iLCJzZXRTaG91bGRTY3JvbGwiLCJsZW5ndGgiLCJuZXh0UGhhc2UiLCJzaGlmdCIsIm9wZXJhdGlvbiIsInR5cGUiLCJzdGVwIiwic2V0Q2hlc3RTbG90Iiwic2xvdCIsInNldEFtb3VudCIsImFtb3VudCIsInNldEVudGl0eVNsb3QiLCJwdXNoIiwicXVldWVEZXBvc2l0SW5mZXJpb3JHZWFyIiwicXVldWVXaXRoZHJhd0JldHRlckdlYXIiLCJxdWV1ZVdpdGhkcmF3Q3JhZnRpbmdNYXRlcmlhbHMiLCJxdWV1ZVdpdGhkcmF3RXNzZW50aWFsU3VwcGxpZXMiLCJxdWV1ZVdpdGhkcmF3TWluaW11bVN1cHBsaWVzIiwidHJ5UXVldWVXaXRoZHJhd1RhYmxlcyIsInF1ZXVlRGVwb3NpdEV4dHJhSXRlbXMiLCJlbnRpdHlCZXN0R2VhciIsImdldEJlc3RHZWFySW5JbnZlbnRvcnkiLCJjaGVzdEJlc3RHZWFyIiwiZGF0YSIsInZhbHVlcyIsImlzQmV0dGVyR2VhciIsIml0ZW0iLCJjaGVzdENvbnRhaW5lciIsIkludmVudG9yeVV0aWwiLCJnZXRDb250YWluZXIiLCJ2aXJ0dWFsSW52ZW50b3J5IiwiZ2V0IiwiaW5ncmVkaWVudCIsImVudGl0eUNvdW50IiwiY291bnRJdGVtVHlwZSIsImlkIiwicmVtYWluaW5nIiwiaW5ncmVkaWVudElkcyIsIlRhZ1Jlc29sdXRpb25zIiwiaSIsInNpemUiLCJjaGVzdEl0ZW0iLCJnZXRJdGVtIiwiaW5jbHVkZXMiLCJzdXBwbHlJZHMiLCJPYmplY3QiLCJrZXlzIiwiRm9vZFByaW9yaXR5IiwicXVldWVXaXRoZHJhd1R5cGVzIiwiaXRlbURlZmljaXRzIiwiTWFwIiwic3VwcGx5SWQiLCJNaW5pbXVtS2VlcEFtb3VudHMiLCJtaW5pbXVtIiwiZGVmaWNpdCIsInNldCIsInF1ZXVlV2l0aGRyYXdUeXBlc0J5RGVmaWNpdCIsImZhbWlseURlZmljaXRzIiwiZmFtaWx5IiwiTWluaW11bUtlZXBBbW91bnRzRmFtaWxpZXMiLCJjb3VudEl0ZW1UeXBlT2ZGYW1pbHkiLCJxdWV1ZVdpdGhkcmF3RmFtaWxpZXNCeURlZmljaXQiLCJ0eXBlcyIsImhvbWUiLCJnZXRWYWx1ZSIsImZyb21FbnRpdHkiLCJmaWx0ZXIiLCJ0IiwiaGFzQmxvY2siLCJnZXRCbG9ja3NJblZvbHVtZSIsIkluSG9tZVJhZGl1cyIsImluY2x1ZGVUeXBlcyIsImdldENhcGFjaXR5IiwiaWdub3JlSWZBbHJlYWR5SGFzIiwiaGFzSXRlbVR5cGUiLCJkZWZpY2l0cyIsImFtb3VudFRvV2l0aGRyYXciLCJNYXRoIiwibWluIiwiQXJyYXkiLCJmcm9tIiwiZmluZCIsImYiLCJzbG90cyIsIk5ldmVyRGVwb3NpdEl0ZW1zIiwicGFyc2VJbnQiLCJkZXBvc2l0ZWQiLCJnZXRHZWFyVHlwZSIsIm1pbmltdW1LZXkiLCJmYW1pbGllcyIsInN0YXJ0c1dpdGgiLCJzbGljZSIsImFscmVhZHlEZXBvc2l0ZWQiLCJzdXJwbHVzIiwiYW1vdW50VG9EZXBvc2l0IiwiZGVmaW5pdGlvbiIsImlkZW50aWZpZXIiLCJwcmlvcml0eSIsIlByaW9yaXR5IiwiaW5pdGlhbFN0YXRlIl0sIm1hcHBpbmdzIjoiQUFBQSxTQUF3QkEsU0FBUyxRQUFRLG9CQUFvQjtBQUM3RCxTQUFTQyxjQUFjLFFBQVEsa0NBQWtDO0FBQ2pFLFNBQVNDLG1CQUFtQixRQUFRLDBDQUEwQztBQUM5RSxTQUFTQyxtQkFBbUIsUUFBUSwwQ0FBMEM7QUFDOUUsU0FBU0MsZUFBZSxR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