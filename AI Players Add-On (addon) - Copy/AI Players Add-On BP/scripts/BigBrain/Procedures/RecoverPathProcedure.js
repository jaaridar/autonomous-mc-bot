import { BlockPermutation, ItemStack } from "@minecraft/server";
import { LocationVar } from "BigBrain/Context/LocationVar";
import { PillarBlockLocationsVar } from "BigBrain/Context/PillarBlockLocationsVar";
import RecoverPathProcedureData from "Data/BigBrain/Procedures/RecoverPathProcedureData";
import V3 from "Helpers/Vectors/V3";
import InventoryHelper from "Inventory/InventoryHelper";
import VirtualInventoryComponent from "Inventory/VirtualInventoryComponent";
import CompositeState from "StateSkeleton/States/CompositeState";
import AsyncUtils from "Utils/AsyncUtils";
import BlockUtils from "Utils/BlockUtils";
import { BuildBlockProcedure } from "./BuildBlockProcedure";
import { MineBlockProcedure } from "./MineBlockProcedure";
import { SwapToItemProcedure } from "./SwapToItemProcedure";
const registry = [
    MineBlockProcedure,
    BuildBlockProcedure
];
export class RecoverPathProcedure extends CompositeState {
    setTarget(target) {
        if (this.isActive) return;
        this.targetLocation = target;
    }
    setCanPlaceBlocks(canPlace) {
        this.canPlaceBlocks = canPlace;
    }
    setCanBreakBlocks(canBreak) {
        this.canBreakBlocks = canBreak;
    }
    onEnter() {
        if (!this.targetLocation) return this.broadcastSignal("onComplete");
        this.recoveryFailed = false;
        const action = this.selectRecoverAction();
        this.runRecoveryAction(action);
        const duration = this.context.entity.getMobComponent("MovementComponent")?.isSwimming() ? RecoverPathProcedureData.SwimmingSlownessDuration : RecoverPathProcedureData.SlownessDuration;
        if (duration) this.context.entity.addEffect("minecraft:slowness", duration, {
            amplifier: 255,
            showParticles: false
        });
    }
    selectRecoverAction() {
        const feetLocation = this.getFeetLocation();
        const bodyLocation = feetLocation.$.add(0, 1, 0);
        const yDiff = this.targetLocation.y - feetLocation.y;
        if (BlockUtils.isLikelySolid(BlockUtils.fromV3(bodyLocation)?.permutation)) return "free";
        if (BlockUtils.isLikelySolid(BlockUtils.fromV3(feetLocation)?.permutation)) return "free";
        if (yDiff >= RecoverPathProcedureData.PillarYThreshold) return "pillar";
        if (yDiff <= RecoverPathProcedureData.DigYThreshold) return "dig";
        if (this.findNearbyClosedDoor()) return "openDoor";
        for (const offset of RecoverPathProcedure.TunnelBlockOffsets){
            const blockInFront = this.getBlockInFront(offset.yOffset, offset.forwardMultiplier);
            if (blockInFront && BlockUtils.isLikelyNavigationBlocking(blockInFront.permutation)) return "tunnel";
        }
        if (BlockUtils.isOverrideable(this.getBlockInFront(-1)?.permutation)) return "bridge";
        return null;
    }
    async runRecoveryAction(action) {
        let wasSuccessful = false;
        switch(action){
            case "free":
                wasSuccessful = await this.runFreeAction();
                break;
            case "pillar":
                wasSuccessful = await this.runPillarAction();
                break;
            case "bridge":
                wasSuccessful = await this.runBridgeAction();
                break;
            case "dig":
                wasSuccessful = await this.runDigAction();
                break;
            case "openDoor":
                wasSuccessful = await this.runOpenDoorAction();
                break;
            case "tunnel":
                wasSuccessful = await this.runTunnelAction();
                break;
            case null:
                wasSuccessful = false;
                break;
        }
        if (!this.context.entity.isValid) return;
        this.setSubstate(null);
        if (wasSuccessful && !this.recoveryFailed) {
            this.broadcastSignal("onComplete");
            return;
        }
        this.broadcastSignal("onFailure");
    }
    async runFreeAction() {
        const feetLocation = this.getFeetLocation();
        const blocks = [
            BlockUtils.fromV3(feetLocation),
            BlockUtils.fromV3(feetLocation.$.add(0, 1, 0))
        ];
        for (const b of blocks){
            if (!b || !BlockUtils.isLikelySolid(b.permutation)) continue;
            const mineSucceeded = await this.waitForMineBlock(b);
            if (!mineSucceeded) return false;
        }
        return true;
    }
    async runPillarAction() {
        if (!this.canPlaceBlocks) return false;
        const entity = this.context.entity;
        const feetLocation = this.getFeetLocation();
        feetLocation.y = Math.round(feetLocation.y);
        // Destroy obstructing blocks from top to bottom
        const blocks = [
            BlockUtils.fromV3(feetLocation.$.add(0, 2, 0)),
            BlockUtils.fromV3(feetLocation.$.add(0, 1, 0)),
            BlockUtils.fromV3(feetLocation.$.add(0, 0, 0))
        ];
        let hasMined = false;
        for (const b of blocks){
            if (!this.canBreakBlocks) return false;
            if (!BlockUtils.isMineable(b)) continue;
            const mineSucceeded = await this.waitForMineBlock(b);
            if (!mineSucceeded) return false;
            hasMined = true;
        }
        if (hasMined) await AsyncUtils.delay(RecoverPathProcedureData.PillarBreakImpulseDelay);
        if (!entity.isValid) return false;
        const strength = this.context.entity.getMobComponent("MovementComponent")?.isSwimming() ? RecoverPathProcedureData.SwimmingPillarImpulseStrength : RecoverPathProcedureData.PillarImpulseStrength;
        entity.applyImpulse(new V3(0, strength, 0));
        this.centerEntity();
        await AsyncUtils.waitForConditionWithTimeout(()=>!entity.isValid || entity.location.y >= feetLocation.y + 1, RecoverPathProcedureData.PillarBlockPlaceMaxWait);
        const pathingBlock = this.getPathingBlockPermutation(false);
        this.context.getValue(PillarBlockLocationsVar).push(feetLocation);
        return this.waitForBuildBlock(pathingBlock, feetLocation, true);
    }
    async runBridgeAction() {
        if (!this.canPlaceBlocks) return false;
        const feetLocation = this.getFeetLocation();
        const forward = this.getForwardDirection();
        const bridgeLocation = feetLocation.$.add(forward).subtract(0, 1, 0);
        const currentBlock = BlockUtils.fromV3(bridgeLocation);
        const pathingBlock = this.getPathingBlockPermutation(true);
        if (BlockUtils.isOverrideable(currentBlock?.permutation)) {
            this.context.getValue(PillarBlockLocationsVar).push(bridgeLocation);
            return this.waitForBuildBlock(pathingBlock, bridgeLocation);
        }
        return true;
    }
    async runDigAction() {
        if (!this.canBreakBlocks) return false;
        const feetLocation = this.getFeetLocation();
        const belowBlock = BlockUtils.fromV3(feetLocation.$.add(0, -1, 0));
        this.centerEntity();
        if (!BlockUtils.isMineable(belowBlock)) return true;
        return this.waitForMineBlock(belowBlock);
    }
    async runTunnelAction() {
        if (!this.canBreakBlocks) return false;
        for (const offset of RecoverPathProcedure.TunnelBlockOffsets){
            const block = this.getBlockInFront(offset.yOffset, offset.forwardMultiplier);
            if (!block || !BlockUtils.isLikelyNavigationBlocking(block.permutation)) continue;
            const result = await this.waitForMineBlock(block);
            if (!result) return false;
        }
        return true;
    }
    async runOpenDoorAction() {
        const door = this.findNearbyClosedDoor();
        if (!door) return false;
        this.openDoor(door);
        return true;
    }
    // #region Utils
    async waitForMineBlock(block) {
        if (!this.context.entity.isValid) return false;
        this.setSubstate(null);
        const mineBlock = this.getSubstate(MineBlockProcedure);
        mineBlock.setBlock(block);
        const onComplete = mineBlock.waitForSignal("onComplete").then(()=>true);
        const onFailure = mineBlock.waitForSignal("onFailure").then(()=>false);
        this.setSubstate(mineBlock);
        return Promise.race([
            onComplete,
            onFailure
        ]);
    }
    async waitForBuildBlock(permutation, location, isInstant = false) {
        if (!this.context.entity.isValid) return false;
        this.setSubstate(null);
        const buildBlock = this.getSubstate(BuildBlockProcedure);
        buildBlock.setPermutation(permutation);
        buildBlock.setLocation(location);
        buildBlock.setRemoveFromInventory(true);
        if (isInstant) {
            const swapToItem = buildBlock.getSubstate(SwapToItemProcedure);
            swapToItem.setHoldDuration(0);
            swapToItem.setShouldScroll(false);
            buildBlock.setDelayAfterHolding(0);
        }
        const onComplete = buildBlock.waitForSignal("onComplete").then(()=>true);
        const onFailure = buildBlock.waitForSignal("onFailure").then(()=>false);
        this.setSubstate(buildBlock);
        return Promise.race([
            onComplete,
            onFailure
        ]);
    }
    getPathingBlockPermutation(isBridging) {
        const entity = this.context.entity;
        const pathingItem = InventoryHelper.getBestAvailablePathingBlock(entity, isBridging);
        if (pathingItem) return BlockPermutation.resolve(pathingItem.typeId);
        // Always add dirt to inventory if none found to avoid blocking
        const virtualInventory = VirtualInventoryComponent.get(entity);
        const backupItem = new ItemStack("minecraft:dirt", 32);
        virtualInventory.giveItem(backupItem);
        const newItem = virtualInventory.findItemType(backupItem.typeId);
        if (newItem) return BlockPermutation.resolve(newItem.typeId);
        //Adding dirt failed, inventory was full
        return BlockPermutation.resolve("minecraft:dirt");
    }
    onSubstateFailure(_state) {
        this.recoveryFailed = true;
    }
    getForwardDirection() {
        const feetLocation = this.getFeetLocation();
        const toTarget = this.targetLocation.clone().subtract(feetLocation);
        return toTarget.setAxis("y", 0).dominant().normalize();
    }
    findNearbyClosedDoor() {
        const feetLocation = this.getFeetLocation();
        for (const offset of RecoverPathProcedure.NearbyDoorOffsets){
            const block = BlockUtils.fromV3(feetLocation.$.add(offset));
            if (!this.isOpenableDoorBlock(block)) continue;
            if (!this.isDoorOpen(block)) return block;
        }
        return null;
    }
    isOpenableDoorBlock(block) {
        if (!block?.isValid) return false;
        const type = block.typeId;
        if (type === "minecraft:iron_door") return false;
        return type.endsWith("_door") || type.endsWith("fence_gate");
    }
    isDoorOpen(block) {
        const permutation = block.permutation;
        const openBit = permutation.getState("open_bit");
        return openBit;
    }
    openDoor(block) {
        const updatedPermutation = block.permutation.withState("open_bit", true);
        block.setPermutation(updatedPermutation);
        if (block.typeId.endsWith("_door")) {
            block.dimension.playSound("open.wooden_door", block.location);
        } else if (block.typeId.endsWith("fence_gate")) {
            block.dimension.playSound("open.fence_gate", block.location);
        }
    }
    getBlockInFront(yOffset, forwardMultiplier = 1) {
        const feetLocation = this.getFeetLocation();
        const forward = this.getForwardDirection().multiply(forwardMultiplier);
        const offsetLocation = feetLocation.$.add(forward).add(0, yOffset, 0);
        return BlockUtils.fromV3(offsetLocation) ?? null;
    }
    getFeetLocation() {
        const feetLocation = this.context.getValue(LocationVar).clone();
        // Round in case they are on a non-full block, e.g. a chest
        feetLocation.y = Math.round(feetLocation.y);
        return feetLocation;
    }
    centerEntity() {
        const entity = this.context.entity;
        const location = this.getFeetLocation().grid();
        entity.teleport(location, {
            keepVelocity: true
        });
    }
    constructor(...args){
        super(...args);
        this.recoveryFailed = false;
        this.canPlaceBlocks = true;
        this.canBreakBlocks = true;
    }
}
RecoverPathProcedure.definition = {
    identifier: "procedure:recover_path",
    priority: RecoverPathProcedureData.Priority,
    registry,
    initialState: null
};
RecoverPathProcedure.TunnelBlockOffsets = [
    {
        yOffset: 0,
        forwardMultiplier: 1
    },
    {
        yOffset: 1,
        forwardMultiplier: 1
    },
    {
        yOffset: 0,
        forwardMultiplier: 1.25
    },
    {
        yOffset: 1,
        forwardMultiplier: 1.25
    }
];
//Look for closed doors in the block the entity is in or neighbouring blocks
RecoverPathProcedure.NearbyDoorOffsets = [
    new V3(0, 0, 0),
    new V3(1, 0, 0),
    new V3(-1, 0, 0),
    new V3(0, 0, 1),
    new V3(0, 0, -1),
    new V3(0, 1, 0),
    new V3(1, 1, 0),
    new V3(-1, 1, 0),
    new V3(0, 1, 1),
    new V3(0, 1, -1)
];

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIlJlY292ZXJQYXRoUHJvY2VkdXJlLnRzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEJsb2NrLCBCbG9ja1Blcm11dGF0aW9uLCBJdGVtU3RhY2sgfSBmcm9tIFwiQG1pbmVjcmFmdC9zZXJ2ZXJcIjtcclxuaW1wb3J0IHsgTG9jYXRpb25WYXIgfSBmcm9tIFwiQmlnQnJhaW4vQ29udGV4dC9Mb2NhdGlvblZhclwiO1xyXG5pbXBvcnQgeyBQaWxsYXJCbG9ja0xvY2F0aW9uc1ZhciB9IGZyb20gXCJCaWdCcmFpbi9Db250ZXh0L1BpbGxhckJsb2NrTG9jYXRpb25zVmFyXCI7XHJcbmltcG9ydCBSZWNvdmVyUGF0aFByb2NlZHVyZURhdGEgZnJvbSBcIkRhdGEvQmlnQnJhaW4vUHJvY2VkdXJlcy9SZWNvdmVyUGF0aFByb2NlZHVyZURhdGFcIjtcclxuaW1wb3J0IFYzIGZyb20gXCJIZWxwZXJzL1ZlY3RvcnMvVjNcIjtcclxuaW1wb3J0IEludmVudG9yeUhlbHBlciBmcm9tIFwiSW52ZW50b3J5L0ludmVudG9yeUhlbHBlclwiO1xyXG5pbXBvcnQgVmlydHVhbEludmVudG9yeUNvbXBvbmVudCBmcm9tIFwiSW52ZW50b3J5L1ZpcnR1YWxJbnZlbnRvcnlDb21wb25lbnRcIjtcclxuaW1wb3J0IEFic3RyYWN0U3RhdGUgZnJvbSBcIlN0YXRlU2tlbGV0b24vU3RhdGVzL0Fic3RyYWN0U3RhdGVcIjtcclxuaW1wb3J0IENvbXBvc2l0ZVN0YXRlIGZyb20gXCJTdGF0ZVNrZWxldG9uL1N0YXRlcy9Db21wb3NpdGVTdGF0ZVwiO1xyXG5pbXBvcnQgdHlwZSB7IENvbXBvc2l0ZVN0YXRlRGVmaW5pdGlvbiB9IGZyb20gXCJTdGF0ZVNrZWxldG9uL1R5cGVzXCI7XHJcbmltcG9ydCBBc3luY1V0aWxzIGZyb20gXCJVdGlscy9Bc3luY1V0aWxzXCI7XHJcbmltcG9ydCBCbG9ja1V0aWxzIGZyb20gXCJVdGlscy9CbG9ja1V0aWxzXCI7XHJcbmltcG9ydCB7IEJ1aWxkQmxvY2tQcm9jZWR1cmUgfSBmcm9tIFwiLi9CdWlsZEJsb2NrUHJvY2VkdXJlXCI7XHJcbmltcG9ydCB7IE1pbmVCbG9ja1Byb2NlZHVyZSB9IGZyb20gXCIuL01pbmVCbG9ja1Byb2NlZHVyZVwiO1xyXG5pbXBvcnQgeyBTd2FwVG9JdGVtUHJvY2VkdXJlIH0gZnJvbSBcIi4vU3dhcFRvSXRlbVByb2NlZHVyZVwiO1xyXG5cclxudHlwZSBSZWNvdmVyeUFjdGlvbiA9IFwicGlsbGFyXCIgfCBcImJyaWRnZVwiIHwgXCJkaWdcIiB8IFwidHVubmVsXCIgfCBcImZyZWVcIiB8IFwib3BlbkRvb3JcIjtcclxuXHJcbmludGVyZmFjZSBUdW5uZWxCbG9ja09mZnNldCB7XHJcbiAgICB5T2Zmc2V0OiBudW1iZXI7XHJcbiAgICBmb3J3YXJkTXVsdGlwbGllcjogbnVtYmVyO1xyXG59XHJcblxyXG5jb25zdCByZWdpc3RyeSA9IFtNaW5lQmxvY2tQcm9jZWR1cmUsIEJ1aWxkQmxvY2tQcm9jZWR1cmVdIGFzIGNvbnN0O1xyXG5cclxuZXhwb3J0IGNsYXNzIFJlY292ZXJQYXRoUHJvY2VkdXJlIGV4dGVuZHMgQ29tcG9zaXRlU3RhdGU8dHlwZW9mIHJlZ2lzdHJ5PiB7XHJcbiAgICBwdWJsaWMgc3RhdGljIHJlYWRvbmx5IGRlZmluaXRpb246IENvbXBvc2l0ZVN0YXRlRGVmaW5pdGlvbjx0eXBlb2YgcmVnaXN0cnk+ID0ge1xyXG4gICAgICAgIGlkZW50aWZpZXI6IFwicHJvY2VkdXJlOnJlY292ZXJfcGF0aFwiLFxyXG4gICAgICAgIHByaW9yaXR5OiBSZWNvdmVyUGF0aFByb2NlZHVyZURhdGEuUHJpb3JpdHksXHJcbiAgICAgICAgcmVnaXN0cnksXHJcbiAgICAgICAgaW5pdGlhbFN0YXRlOiBudWxsLFxyXG4gICAgfTtcclxuXHJcbiAgICBwdWJsaWMgc3RhdGljIHJlYWRvbmx5IFR1bm5lbEJsb2NrT2Zmc2V0czogVHVubmVsQmxvY2tPZmZzZXRbXSA9IFtcclxuICAgICAgICB7IHlPZmZzZXQ6IDAsIGZvcndhcmRNdWx0aXBsaWVyOiAxIH0sIC8vIEJsb2NrIGp1c3QgaW4gZnJvbnQgb2YgZmVldFxyXG4gICAgICAgIHsgeU9mZnNldDogMSwgZm9yd2FyZE11bHRpcGxpZXI6IDEgfSwgLy8gQmxvY2sganVzdCBpbiBmcm9udCBvZiBib2R5XHJcbiAgICAgICAgeyB5T2Zmc2V0OiAwLCBmb3J3YXJkTXVsdGlwbGllcjogMS4yNSB9LCAvLyBCbG9jayBzbGlnaHRseSBmdXJ0aGVyIGluIGZyb250IG9mIGZlZXQgKGhhbmRsZSBlZGdlIG9mIGJsb2NrcylcclxuICAgICAgICB7IHlPZmZzZXQ6IDEsIGZvcndhcmRNdWx0aXBsaWVyOiAxLjI1IH0sIC8vIEJsb2NrIHNsaWdodGx5IGZ1cnRoZXIgaW4gZnJvbnQgb2YgYm9keSAoaGFuZGxlIGVkZ2Ugb2YgYmxvY2tzKVxyXG4gICAgXTtcclxuXHJcbiAgICAvL0xvb2sgZm9yIGNsb3NlZCBkb29ycyBpbiB0aGUgYmxvY2sgdGhlIGVudGl0eSBpcyBpbiBvciBuZWlnaGJvdXJpbmcgYmxvY2tzXHJcbiAgICBwcml2YXRlIHN0YXRpYyByZWFkb25seSBOZWFyYnlEb29yT2Zmc2V0czogcmVhZG9ubHkgVjNbXSA9IFtcclxuICAgICAgICBuZXcgVjMoMCwgMCwgMCksXHJcbiAgICAgICAgbmV3IFYzKDEsIDAsIDApLFxyXG4gICAgICAgIG5ldyBWMygtMSwgMCwgMCksXHJcbiAgICAgICAgbmV3IFYzKDAsIDAsIDEpLFxyXG4gICAgICAgIG5ldyBWMygwLCAwLCAtMSksXHJcbiAgICAgICAgbmV3IFYzKDAsIDEsIDApLFxyXG4gICAgICAgIG5ldyBWMygxLCAxLCAwKSxcclxuICAgICAgICBuZXcgVjMoLTEsIDEsIDApLFxyXG4gICAgICAgIG5ldyBWMygwLCAxLCAxKSxcclxuICAgICAgICBuZXcgVjMoMCwgMSwgLTEpLFxyXG4gICAgXSBhcyBjb25zdDtcclxuXHJcbiAgICBwcml2YXRlIHRhcmdldExvY2F0aW9uOiBWMyB8IHVuZGVmaW5lZDtcclxuICAgIHByaXZhdGUgcmVjb3ZlcnlGYWlsZWQgPSBmYWxzZTtcclxuICAgIHByaXZhdGUgY2FuUGxhY2VCbG9ja3MgPSB0cnVlO1xyXG4gICAgcHJpdmF0ZSBjYW5CcmVha0Jsb2NrcyA9IHRydWU7XHJcblxyXG4gICAgcHVibGljIHNldFRhcmdldCh0YXJnZXQ6IFYzKTogdm9pZCB7XHJcbiAgICAgICAgaWYgKHRoaXMuaXNBY3RpdmUpIHJldHVybjtcclxuICAgICAgICB0aGlzLnRhcmdldExvY2F0aW9uID0gdGFyZ2V0O1xyXG4gICAgfVxyXG5cclxuICAgIHB1YmxpYyBzZXRDYW5QbGFjZUJsb2NrcyhjYW5QbGFjZTogYm9vbGVhbik6IHZvaWQge1xyXG4gICAgICAgIHRoaXMuY2FuUGxhY2VCbG9ja3MgPSBjYW5QbGFjZTtcclxuICAgIH1cclxuXHJcbiAgICBwdWJsaWMgc2V0Q2FuQnJlYWtCbG9ja3MoY2FuQnJlYWs6IGJvb2xlYW4pOiB2b2lkIHtcclxuICAgICAgICB0aGlzLmNhbkJyZWFrQmxvY2tzID0gY2FuQnJlYWs7XHJcbiAgICB9XHJcblxyXG4gICAgcHJvdGVjdGVkIG9uRW50ZXIoKTogdm9pZCB7XHJcbiAgICAgICAgaWYgKCF0aGlzLnRhcmdldExvY2F0aW9uKSByZXR1cm4gdGhpcy5icm9hZGNhc3RTaWduYWwoXCJvbkNvbXBsZXRlXCIpO1xyXG4gICAgICAgIHRoaXMucmVjb3ZlcnlGYWlsZWQgPSBmYWxzZTtcclxuICAgICAgICBjb25zdCBhY3Rpb24gPSB0aGlzLnNlbGVjdFJlY292ZXJBY3Rpb24oKTtcclxuICAgICAgICB0aGlzLnJ1blJlY292ZXJ5QWN0aW9uKGFjdGlvbik7XHJcblxyXG4gICAgICAgIGNvbnN0IGR1cmF0aW9uID0gdGhpcy5jb250ZXh0LmVudGl0eS5nZXRNb2JDb21wb25lbnQoXCJNb3ZlbWVudENvbXBvbmVudFwiKT8uaXNTd2ltbWluZygpXHJcbiAgICAgICAgICAgID8gUmVjb3ZlclBhdGhQcm9jZWR1cmVEYXRhLlN3aW1taW5nU2xvd25lc3NEdXJhdGlvblxyXG4gICAgICAgICAgICA6IFJlY292ZXJQYXRoUHJvY2VkdXJlRGF0YS5TbG93bmVzc0R1cmF0aW9uO1xyXG5cclxuICAgICAgICBpZiAoZHVyYXRpb24pIHRoaXMuY29udGV4dC5lbnRpdHkuYWRkRWZmZWN0KFwibWluZWNyYWZ0OnNsb3duZXNzXCIsIGR1cmF0aW9uLCB7IGFtcGxpZmllcjogMjU1LCBzaG93UGFydGljbGVzOiBmYWxzZSB9KTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHNlbGVjdFJlY292ZXJBY3Rpb24oKTogUmVjb3ZlcnlBY3Rpb24gfCBudWxsIHtcclxuICAgICAgICBjb25zdCBmZWV0TG9jYXRpb24gPSB0aGlzLmdldEZlZXRMb2NhdGlvbigpO1xyXG4gICAgICAgIGNvbnN0IGJvZHlMb2NhdGlvbiA9IGZlZXRMb2NhdGlvbi4kLmFkZCgwLCAxLCAwKTtcclxuICAgICAgICBjb25zdCB5RGlmZiA9IHRoaXMudGFyZ2V0TG9jYXRpb24hLnkgLSBmZWV0TG9jYXRpb24ueTtcclxuXHJcbiAgICAgICAgaWYgKEJsb2NrVXRpbHMuaXNMaWtlbHlTb2xpZChCbG9ja1V0aWxzLmZyb21WMyhib2R5TG9jYXRpb24pPy5wZXJtdXRhdGlvbikpIHJldHVybiBcImZyZWVcIjtcclxuICAgICAgICBpZiAoQmxvY2tVdGlscy5pc0xpa2VseVNvbGlkKEJsb2NrVXRpbHMuZnJvbVYzKGZlZXRMb2NhdGlvbik/LnBlcm11dGF0aW9uKSkgcmV0dXJuIFwiZnJlZVwiO1xyXG5cclxuICAgICAgICBpZiAoeURpZmYgPj0gUmVjb3ZlclBhdGhQcm9jZWR1cmVEYXRhLlBpbGxhcllUaHJlc2hvbGQpIHJldHVybiBcInBpbGxhclwiO1xyXG4gICAgICAgIGlmICh5RGlmZiA8PSBSZWNvdmVyUGF0aFByb2NlZHVyZURhdGEuRGlnWVRocmVzaG9sZCkgcmV0dXJuIFwiZGlnXCI7XHJcblxyXG4gICAgICAgIGlmICh0aGlzLmZpbmROZWFyYnlDbG9zZWREb29yKCkpIHJldHVybiBcIm9wZW5Eb29yXCI7XHJcblxyXG4gICAgICAgIGZvciAoY29uc3Qgb2Zmc2V0IG9mIFJlY292ZXJQYXRoUHJvY2VkdXJlLlR1bm5lbEJsb2NrT2Zmc2V0cykge1xyXG4gICAgICAgICAgICBjb25zdCBibG9ja0luRnJvbnQgPSB0aGlzLmdldEJsb2NrSW5Gcm9udChvZmZzZXQueU9mZnNldCwgb2Zmc2V0LmZvcndhcmRNdWx0aXBsaWVyKTtcclxuICAgICAgICAgICAgaWYgKGJsb2NrSW5Gcm9udCAmJiBCbG9ja1V0aWxzLmlzTGlrZWx5TmF2aWdhdGlvbkJsb2NraW5nKGJsb2NrSW5Gcm9udC5wZXJtdXRhdGlvbikpIHJldHVybiBcInR1bm5lbFwiO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgaWYgKEJsb2NrVXRpbHMuaXNPdmVycmlkZWFibGUodGhpcy5nZXRCbG9ja0luRnJvbnQoLTEpPy5wZXJtdXRhdGlvbikpIHJldHVybiBcImJyaWRnZVwiO1xyXG5cclxuICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGFzeW5jIHJ1blJlY292ZXJ5QWN0aW9uKGFjdGlvbjogUmVjb3ZlcnlBY3Rpb24gfCBudWxsKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICAgICAgbGV0IHdhc1N1Y2Nlc3NmdWwgPSBmYWxzZTtcclxuXHJcbiAgICAgICAgc3dpdGNoIChhY3Rpb24pIHtcclxuICAgICAgICAgICAgY2FzZSBcImZyZWVcIjpcclxuICAgICAgICAgICAgICAgIHdhc1N1Y2Nlc3NmdWwgPSBhd2FpdCB0aGlzLnJ1bkZyZWVBY3Rpb24oKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIFwicGlsbGFyXCI6XHJcbiAgICAgICAgICAgICAgICB3YXNTdWNjZXNzZnVsID0gYXdhaXQgdGhpcy5ydW5QaWxsYXJBY3Rpb24oKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIFwiYnJpZGdlXCI6XHJcbiAgICAgICAgICAgICAgICB3YXNTdWNjZXNzZnVsID0gYXdhaXQgdGhpcy5ydW5CcmlkZ2VBY3Rpb24oKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIFwiZGlnXCI6XHJcbiAgICAgICAgICAgICAgICB3YXNTdWNjZXNzZnVsID0gYXdhaXQgdGhpcy5ydW5EaWdBY3Rpb24oKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIFwib3BlbkRvb3JcIjpcclxuICAgICAgICAgICAgICAgIHdhc1N1Y2Nlc3NmdWwgPSBhd2FpdCB0aGlzLnJ1bk9wZW5Eb29yQWN0aW9uKCk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBcInR1bm5lbFwiOlxyXG4gICAgICAgICAgICAgICAgd2FzU3VjY2Vzc2Z1bCA9IGF3YWl0IHRoaXMucnVuVHVubmVsQWN0aW9uKCk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBudWxsOlxyXG4gICAgICAgICAgICAgICAgd2FzU3VjY2Vzc2Z1bCA9IGZhbHNlO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBpZiAoIXRoaXMuY29udGV4dC5lbnRpdHkuaXNWYWxpZCkgcmV0dXJuO1xyXG5cclxuICAgICAgICB0aGlzLnNldFN1YnN0YXRlKG51bGwpO1xyXG4gICAgICAgIGlmICh3YXNTdWNjZXNzZnVsICYmICF0aGlzLnJlY292ZXJ5RmFpbGVkKSB7XHJcbiAgICAgICAgICAgIHRoaXMuYnJvYWRjYXN0U2lnbmFsKFwib25Db21wbGV0ZVwiKTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdGhpcy5icm9hZGNhc3RTaWduYWwoXCJvbkZhaWx1cmVcIik7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBhc3luYyBydW5GcmVlQWN0aW9uKCk6IFByb21pc2U8Ym9vbGVhbj4ge1xyXG4gICAgICAgIGNvbnN0IGZlZXRMb2NhdGlvbiA9IHRoaXMuZ2V0RmVldExvY2F0aW9uKCk7XHJcblxyXG4gICAgICAgIGNvbnN0IGJsb2NrcyA9IFtCbG9ja1V0aWxzLmZyb21WMyhmZWV0TG9jYXRpb24pLCBCbG9ja1V0aWxzLmZyb21WMyhmZWV0TG9jYXRpb24uJC5hZGQoMCwgMSwgMCkpXTtcclxuXHJcbiAgICAgICAgZm9yIChjb25zdCBiIG9mIGJsb2Nrcykge1xyXG4gICAgICAgICAgICBpZiAoIWIgfHwgIUJsb2NrVXRpbHMuaXNMaWtlbHlTb2xpZChiLnBlcm11dGF0aW9uKSkgY29udGludWU7XHJcbiAgICAgICAgICAgIGNvbnN0IG1pbmVTdWNjZWVkZWQgPSBhd2FpdCB0aGlzLndhaXRGb3JNaW5lQmxvY2soYik7XHJcbiAgICAgICAgICAgIGlmICghbWluZVN1Y2NlZWRlZCkgcmV0dXJuIGZhbHNlO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBhc3luYyBydW5QaWxsYXJBY3Rpb24oKTogUHJvbWlzZTxib29sZWFuPiB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmNhblBsYWNlQmxvY2tzKSByZXR1cm4gZmFsc2U7XHJcblxyXG4gICAgICAgIGNvbnN0IGVudGl0eSA9IHRoaXMuY29udGV4dC5lbnRpdHk7XHJcbiAgICAgICAgY29uc3QgZmVldExvY2F0aW9uID0gdGhpcy5nZXRGZWV0TG9jYXRpb24oKTtcclxuICAgICAgICBmZWV0TG9jYXRpb24ueSA9IE1hdGgucm91bmQoZmVldExvY2F0aW9uLnkpO1xyXG5cclxuICAgICAgICAvLyBEZXN0cm95IG9ic3RydWN0aW5nIGJsb2NrcyBmcm9tIHRvcCB0byBib3R0b21cclxuICAgICAgICBjb25zdCBibG9ja3MgPSBbXHJcbiAgICAgICAgICAgIEJsb2NrVXRpbHMuZnJvbVYzKGZlZXRMb2NhdGlvbi4kLmFkZCgwLCAyLCAwKSksXHJcbiAgICAgICAgICAgIEJsb2NrVXRpbHMuZnJvbVYzKGZlZXRMb2NhdGlvbi4kLmFkZCgwLCAxLCAwKSksXHJcbiAgICAgICAgICAgIEJsb2NrVXRpbHMuZnJvbVYzKGZlZXRMb2NhdGlvbi4kLmFkZCgwLCAwLCAwKSksXHJcbiAgICAgICAgXTtcclxuXHJcbiAgICAgICAgbGV0IGhhc01pbmVkID0gZmFsc2U7XHJcbiAgICAgICAgZm9yIChjb25zdCBiIG9mIGJsb2Nrcykge1xyXG4gICAgICAgICAgICBpZiAoIXRoaXMuY2FuQnJlYWtCbG9ja3MpIHJldHVybiBmYWxzZTtcclxuICAgICAgICAgICAgaWYgKCFCbG9ja1V0aWxzLmlzTWluZWFibGUoYikpIGNvbnRpbnVlO1xyXG4gICAgICAgICAgICBjb25zdCBtaW5lU3VjY2VlZGVkID0gYXdhaXQgdGhpcy53YWl0Rm9yTWluZUJsb2NrKGIpO1xyXG4gICAgICAgICAgICBpZiAoIW1pbmVTdWNjZWVkZWQpIHJldHVybiBmYWxzZTtcclxuICAgICAgICAgICAgaGFzTWluZWQgPSB0cnVlO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgaWYgKGhhc01pbmVkKSBhd2FpdCBBc3luY1V0aWxzLmRlbGF5KFJlY292ZXJQYXRoUHJvY2VkdXJlRGF0YS5QaWxsYXJCcmVha0ltcHVsc2VEZWxheSk7XHJcblxyXG4gICAgICAgIGlmICghZW50aXR5LmlzVmFsaWQpIHJldHVybiBmYWxzZTtcclxuXHJcbiAgICAgICAgY29uc3Qgc3RyZW5ndGggPSB0aGlzLmNvbnRleHQuZW50aXR5LmdldE1vYkNvbXBvbmVudChcIk1vdmVtZW50Q29tcG9uZW50XCIpPy5pc1N3aW1taW5nKClcclxuICAgICAgICAgICAgPyBSZWNvdmVyUGF0aFByb2NlZHVyZURhdGEuU3dpbW1pbmdQaWxsYXJJbXB1bHNlU3RyZW5ndGhcclxuICAgICAgICAgICAgOiBSZWNvdmVyUGF0aFByb2NlZHVyZURhdGEuUGlsbGFySW1wdWxzZVN0cmVuZ3RoO1xyXG5cclxuICAgICAgICBlbnRpdHkuYXBwbHlJbXB1bHNlKG5ldyBWMygwLCBzdHJlbmd0aCwgMCkpO1xyXG4gICAgICAgIHRoaXMuY2VudGVyRW50aXR5KCk7XHJcblxyXG4gICAgICAgIGF3YWl0IEFzeW5jVXRpbHMud2FpdEZvckNvbmRpdGlvbldpdGhUaW1lb3V0KFxyXG4gICAgICAgICAgICAoKSA9PiAhZW50aXR5LmlzVmFsaWQgfHwgZW50aXR5LmxvY2F0aW9uLnkgPj0gZmVldExvY2F0aW9uLnkgKyAxLFxyXG4gICAgICAgICAgICBSZWNvdmVyUGF0aFByb2NlZHVyZURhdGEuUGlsbGFyQmxvY2tQbGFjZU1heFdhaXRcclxuICAgICAgICApO1xyXG5cclxuICAgICAgICBjb25zdCBwYXRoaW5nQmxvY2sgPSB0aGlzLmdldFBhdGhpbmdCbG9ja1Blcm11dGF0aW9uKGZhbHNlKTtcclxuXHJcbiAgICAgICAgdGhpcy5jb250ZXh0LmdldFZhbHVlKFBpbGxhckJsb2NrTG9jYXRpb25zVmFyKS5wdXNoKGZlZXRMb2NhdGlvbik7XHJcblxyXG4gICAgICAgIHJldHVybiB0aGlzLndhaXRGb3JCdWlsZEJsb2NrKHBhdGhpbmdCbG9jaywgZmVldExvY2F0aW9uLCB0cnVlKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGFzeW5jIHJ1bkJyaWRnZUFjdGlvbigpOiBQcm9taXNlPGJvb2xlYW4+IHtcclxuICAgICAgICBpZiAoIXRoaXMuY2FuUGxhY2VCbG9ja3MpIHJldHVybiBmYWxzZTtcclxuXHJcbiAgICAgICAgY29uc3QgZmVldExvY2F0aW9uID0gdGhpcy5nZXRGZWV0TG9jYXRpb24oKTtcclxuICAgICAgICBjb25zdCBmb3J3YXJkID0gdGhpcy5nZXRGb3J3YXJkRGlyZWN0aW9uKCk7XHJcbiAgICAgICAgY29uc3QgYnJpZGdlTG9jYXRpb24gPSBmZWV0TG9jYXRpb24uJC5hZGQoZm9yd2FyZCkuc3VidHJhY3QoMCwgMSwgMCk7XHJcbiAgICAgICAgY29uc3QgY3VycmVudEJsb2NrID0gQmxvY2tVdGlscy5mcm9tVjMoYnJpZGdlTG9jYXRpb24pO1xyXG5cclxuICAgICAgICBjb25zdCBwYXRoaW5nQmxvY2sgPSB0aGlzLmdldFBhdGhpbmdCbG9ja1Blcm11dGF0aW9uKHRydWUpO1xyXG4gICAgICAgIGlmIChCbG9ja1V0aWxzLmlzT3ZlcnJpZGVhYmxlKGN1cnJlbnRCbG9jaz8ucGVybXV0YXRpb24pKSB7XHJcbiAgICAgICAgICAgIHRoaXMuY29udGV4dC5nZXRWYWx1ZShQaWxsYXJCbG9ja0xvY2F0aW9uc1ZhcikucHVzaChicmlkZ2VMb2NhdGlvbik7XHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLndhaXRGb3JCdWlsZEJsb2NrKHBhdGhpbmdCbG9jaywgYnJpZGdlTG9jYXRpb24pO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBhc3luYyBydW5EaWdBY3Rpb24oKTogUHJvbWlzZTxib29sZWFuPiB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmNhbkJyZWFrQmxvY2tzKSByZXR1cm4gZmFsc2U7XHJcblxyXG4gICAgICAgIGNvbnN0IGZlZXRMb2NhdGlvbiA9IHRoaXMuZ2V0RmVldExvY2F0aW9uKCk7XHJcbiAgICAgICAgY29uc3QgYmVsb3dCbG9jayA9IEJsb2NrVXRpbHMuZnJvbVYzKGZlZXRMb2NhdGlvbi4kLmFkZCgwLCAtMSwgMCkpO1xyXG4gICAgICAgIHRoaXMuY2VudGVyRW50aXR5KCk7XHJcblxyXG4gICAgICAgIGlmICghQmxvY2tVdGlscy5pc01pbmVhYmxlKGJlbG93QmxvY2spKSByZXR1cm4gdHJ1ZTtcclxuXHJcbiAgICAgICAgcmV0dXJuIHRoaXMud2FpdEZvck1pbmVCbG9jayhiZWxvd0Jsb2NrKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGFzeW5jIHJ1blR1bm5lbEFjdGlvbigpOiBQcm9taXNlPGJvb2xlYW4+IHtcclxuICAgICAgICBpZiAoIXRoaXMuY2FuQnJlYWtCbG9ja3MpIHJldHVybiBmYWxzZTtcclxuXHJcbiAgICAgICAgZm9yIChjb25zdCBvZmZzZXQgb2YgUmVjb3ZlclBhdGhQcm9jZWR1cmUuVHVubmVsQmxvY2tPZmZzZXRzKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGJsb2NrID0gdGhpcy5nZXRCbG9ja0luRnJvbnQob2Zmc2V0LnlPZmZzZXQsIG9mZnNldC5mb3J3YXJkTXVsdGlwbGllcik7XHJcbiAgICAgICAgICAgIGlmICghYmxvY2sgfHwgIUJsb2NrVXRpbHMuaXNMaWtlbHlOYXZpZ2F0aW9uQmxvY2tpbmcoYmxvY2sucGVybXV0YXRpb24pKSBjb250aW51ZTtcclxuICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy53YWl0Rm9yTWluZUJsb2NrKGJsb2NrKTtcclxuICAgICAgICAgICAgaWYgKCFyZXN1bHQpIHJldHVybiBmYWxzZTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgYXN5bmMgcnVuT3BlbkRvb3JBY3Rpb24oKTogUHJvbWlzZTxib29sZWFuPiB7XHJcbiAgICAgICAgY29uc3QgZG9vciA9IHRoaXMuZmluZE5lYXJieUNsb3NlZERvb3IoKTtcclxuICAgICAgICBpZiAoIWRvb3IpIHJldHVybiBmYWxzZTtcclxuXHJcbiAgICAgICAgdGhpcy5vcGVuRG9vcihkb29yKTtcclxuICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgIH1cclxuXHJcbiAgICAvLyAjcmVnaW9uIFV0aWxzXHJcbiAgICBwcml2YXRlIGFzeW5jIHdhaXRGb3JNaW5lQmxvY2soYmxvY2s6IEJsb2NrKTogUHJvbWlzZTxib29sZWFuPiB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmNvbnRleHQuZW50aXR5LmlzVmFsaWQpIHJldHVybiBmYWxzZTtcclxuXHJcbiAgICAgICAgdGhpcy5zZXRTdWJzdGF0ZShudWxsKTtcclxuXHJcbiAgICAgICAgY29uc3QgbWluZUJsb2NrID0gdGhpcy5nZXRTdWJzdGF0ZShNaW5lQmxvY2tQcm9jZWR1cmUpO1xyXG4gICAgICAgIG1pbmVCbG9jay5zZXRCbG9jayhibG9jayk7XHJcbiAgICAgICAgY29uc3Qgb25Db21wbGV0ZSA9IG1pbmVCbG9jay53YWl0Rm9yU2lnbmFsKFwib25Db21wbGV0ZVwiKS50aGVuKCgpID0+IHRydWUpO1xyXG4gICAgICAgIGNvbnN0IG9uRmFpbHVyZSA9IG1pbmVCbG9jay53YWl0Rm9yU2lnbmFsKFwib25GYWlsdXJlXCIpLnRoZW4oKCkgPT4gZmFsc2UpO1xyXG4gICAgICAgIHRoaXMuc2V0U3Vic3RhdGUobWluZUJsb2NrKTtcclxuICAgICAgICByZXR1cm4gUHJvbWlzZS5yYWNlKFtvbkNvbXBsZXRlLCBvbkZhaWx1cmVdKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGFzeW5jIHdhaXRGb3JCdWlsZEJsb2NrKHBlcm11dGF0aW9uOiBCbG9ja1Blcm11dGF0aW9uLCBsb2NhdGlvbjogVjMsIGlzSW5zdGFudDogYm9vbGVhbiA9IGZhbHNlKTogUHJvbWlzZTxib29sZWFuPiB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmNvbnRleHQuZW50aXR5LmlzVmFsaWQpIHJldHVybiBmYWxzZTtcclxuXHJcbiAgICAgICAgdGhpcy5zZXRTdWJzdGF0ZShudWxsKTtcclxuXHJcbiAgICAgICAgY29uc3QgYnVpbGRCbG9jayA9IHRoaXMuZ2V0U3Vic3RhdGUoQnVpbGRCbG9ja1Byb2NlZHVyZSk7XHJcbiAgICAgICAgYnVpbGRCbG9jay5zZXRQZXJtdXRhdGlvbihwZXJtdXRhdGlvbik7XHJcbiAgICAgICAgYnVpbGRCbG9jay5zZXRMb2NhdGlvbihsb2NhdGlvbik7XHJcbiAgICAgICAgYnVpbGRCbG9jay5zZXRSZW1vdmVGcm9tSW52ZW50b3J5KHRydWUpO1xyXG5cclxuICAgICAgICBpZiAoaXNJbnN0YW50KSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHN3YXBUb0l0ZW0gPSBidWlsZEJsb2NrLmdldFN1YnN0YXRlKFN3YXBUb0l0ZW1Qcm9jZWR1cmUpO1xyXG4gICAgICAgICAgICBzd2FwVG9JdGVtLnNldEhvbGREdXJhdGlvbigwKTtcclxuICAgICAgICAgICAgc3dhcFRvSXRlbS5zZXRTaG91bGRTY3JvbGwoZmFsc2UpO1xyXG4gICAgICAgICAgICBidWlsZEJsb2NrLnNldERlbGF5QWZ0ZXJIb2xkaW5nKDApO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc3Qgb25Db21wbGV0ZSA9IGJ1aWxkQmxvY2sud2FpdEZvclNpZ25hbChcIm9uQ29tcGxldGVcIikudGhlbigoKSA9PiB0cnVlKTtcclxuICAgICAgICBjb25zdCBvbkZhaWx1cmUgPSBidWlsZEJsb2NrLndhaXRGb3JTaWduYWwoXCJvbkZhaWx1cmVcIikudGhlbigoKSA9PiBmYWxzZSk7XHJcbiAgICAgICAgdGhpcy5zZXRTdWJzdGF0ZShidWlsZEJsb2NrKTtcclxuICAgICAgICByZXR1cm4gUHJvbWlzZS5yYWNlKFtvbkNvbXBsZXRlLCBvbkZhaWx1cmVdKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGdldFBhdGhpbmdCbG9ja1Blcm11dGF0aW9uKGlzQnJpZGdpbmc6IGJvb2xlYW4pOiBCbG9ja1Blcm11dGF0aW9uIHtcclxuICAgICAgICBjb25zdCBlbnRpdHkgPSB0aGlzLmNvbnRleHQuZW50aXR5O1xyXG4gICAgICAgIGNvbnN0IHBhdGhpbmdJdGVtID0gSW52ZW50b3J5SGVscGVyLmdldEJlc3RBdmFpbGFibGVQYXRoaW5nQmxvY2soZW50aXR5LCBpc0JyaWRnaW5nKTtcclxuICAgICAgICBpZiAocGF0aGluZ0l0ZW0pIHJldHVybiBCbG9ja1Blcm11dGF0aW9uLnJlc29sdmUocGF0aGluZ0l0ZW0udHlwZUlkKTtcclxuXHJcbiAgICAgICAgLy8gQWx3YXlzIGFkZCBkaXJ0IHRvIGludmVudG9yeSBpZiBub25lIGZvdW5kIHRvIGF2b2lkIGJsb2NraW5nXHJcbiAgICAgICAgY29uc3QgdmlydHVhbEludmVudG9yeSA9IFZpcnR1YWxJbnZlbnRvcnlDb21wb25lbnQuZ2V0KGVudGl0eSk7XHJcbiAgICAgICAgY29uc3QgYmFja3VwSXRlbSA9IG5ldyBJdGVtU3RhY2soXCJtaW5lY3JhZnQ6ZGlydFwiLCAzMik7XHJcbiAgICAgICAgdmlydHVhbEludmVudG9yeS5naXZlSXRlbShiYWNrdXBJdGVtKTtcclxuXHJcbiAgICAgICAgY29uc3QgbmV3SXRlbSA9IHZpcnR1YWxJbnZlbnRvcnkuZmluZEl0ZW1UeXBlKGJhY2t1cEl0ZW0udHlwZUlkKTtcclxuICAgICAgICBpZiAobmV3SXRlbSkgcmV0dXJuIEJsb2NrUGVybXV0YXRpb24ucmVzb2x2ZShuZXdJdGVtLnR5cGVJZCk7XHJcblxyXG4gICAgICAgIC8vQWRkaW5nIGRpcnQgZmFpbGVkLCBpbnZlbnRvcnkgd2FzIGZ1bGxcclxuICAgICAgICByZXR1cm4gQmxvY2tQZXJtdXRhdGlvbi5yZXNvbHZlKFwibWluZWNyYWZ0OmRpcnRcIik7XHJcbiAgICB9XHJcblxyXG4gICAgcHJvdGVjdGVkIG9uU3Vic3RhdGVGYWlsdXJlKF9zdGF0ZTogQWJzdHJhY3RTdGF0ZSk6IHZvaWQge1xyXG4gICAgICAgIHRoaXMucmVjb3ZlcnlGYWlsZWQgPSB0cnVlO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZ2V0Rm9yd2FyZERpcmVjdGlvbigpOiBWMyB7XHJcbiAgICAgICAgY29uc3QgZmVldExvY2F0aW9uID0gdGhpcy5nZXRGZWV0TG9jYXRpb24oKTtcclxuICAgICAgICBjb25zdCB0b1RhcmdldCA9IHRoaXMudGFyZ2V0TG9jYXRpb24hLmNsb25lKCkuc3VidHJhY3QoZmVldExvY2F0aW9uKTtcclxuICAgICAgICByZXR1cm4gdG9UYXJnZXQuc2V0QXhpcyhcInlcIiwgMCkuZG9taW5hbnQoKS5ub3JtYWxpemUoKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGZpbmROZWFyYnlDbG9zZWREb29yKCk6IEJsb2NrIHwgbnVsbCB7XHJcbiAgICAgICAgY29uc3QgZmVldExvY2F0aW9uID0gdGhpcy5nZXRGZWV0TG9jYXRpb24oKTtcclxuICAgICAgICBmb3IgKGNvbnN0IG9mZnNldCBvZiBSZWNvdmVyUGF0aFByb2NlZHVyZS5OZWFyYnlEb29yT2Zmc2V0cykge1xyXG4gICAgICAgICAgICBjb25zdCBibG9jayA9IEJsb2NrVXRpbHMuZnJvbVYzKGZlZXRMb2NhdGlvbi4kLmFkZChvZmZzZXQpKTtcclxuICAgICAgICAgICAgaWYgKCF0aGlzLmlzT3BlbmFibGVEb29yQmxvY2soYmxvY2spKSBjb250aW51ZTtcclxuICAgICAgICAgICAgaWYgKCF0aGlzLmlzRG9vck9wZW4oYmxvY2spKSByZXR1cm4gYmxvY2s7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGlzT3BlbmFibGVEb29yQmxvY2soYmxvY2s6IEJsb2NrIHwgbnVsbCk6IGJsb2NrIGlzIEJsb2NrIHtcclxuICAgICAgICBpZiAoIWJsb2NrPy5pc1ZhbGlkKSByZXR1cm4gZmFsc2U7XHJcblxyXG4gICAgICAgIGNvbnN0IHR5cGUgPSBibG9jay50eXBlSWQ7XHJcbiAgICAgICAgaWYgKHR5cGUgPT09IFwibWluZWNyYWZ0Omlyb25fZG9vclwiKSByZXR1cm4gZmFsc2U7XHJcblxyXG4gICAgICAgIHJldHVybiB0eXBlLmVuZHNXaXRoKFwiX2Rvb3JcIikgfHwgdHlwZS5lbmRzV2l0aChcImZlbmNlX2dhdGVcIik7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBpc0Rvb3JPcGVuKGJsb2NrOiBCbG9jayk6IGJvb2xlYW4ge1xyXG4gICAgICAgIGNvbnN0IHBlcm11dGF0aW9uID0gYmxvY2sucGVybXV0YXRpb247XHJcbiAgICAgICAgY29uc3Qgb3BlbkJpdCA9IHBlcm11dGF0aW9uLmdldFN0YXRlKFwib3Blbl9iaXRcIik7XHJcblxyXG4gICAgICAgIHJldHVybiBvcGVuQml0IGFzIGJvb2xlYW47XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBvcGVuRG9vcihibG9jazogQmxvY2spOiB2b2lkIHtcclxuICAgICAgICBjb25zdCB1cGRhdGVkUGVybXV0YXRpb24gPSBibG9jay5wZXJtdXRhdGlvbi53aXRoU3RhdGUoXCJvcGVuX2JpdFwiLCB0cnVlKTtcclxuICAgICAgICBibG9jay5zZXRQZXJtdXRhdGlvbih1cGRhdGVkUGVybXV0YXRpb24pO1xyXG5cclxuICAgICAgICBpZiAoYmxvY2sudHlwZUlkLmVuZHNXaXRoKFwiX2Rvb3JcIikpIHtcclxuICAgICAgICAgICAgYmxvY2suZGltZW5zaW9uLnBsYXlTb3VuZChcIm9wZW4ud29vZGVuX2Rvb3JcIiwgYmxvY2subG9jYXRpb24pO1xyXG4gICAgICAgIH0gZWxzZSBpZiAoYmxvY2sudHlwZUlkLmVuZHNXaXRoKFwiZmVuY2VfZ2F0ZVwiKSkge1xyXG4gICAgICAgICAgICBibG9jay5kaW1lbnNpb24ucGxheVNvdW5kKFwib3Blbi5mZW5jZV9nYXRlXCIsIGJsb2NrLmxvY2F0aW9uKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBnZXRCbG9ja0luRnJvbnQoeU9mZnNldDogbnVtYmVyLCBmb3J3YXJkTXVsdGlwbGllcjogbnVtYmVyID0gMSk6IEJsb2NrIHwgbnVsbCB7XHJcbiAgICAgICAgY29uc3QgZmVldExvY2F0aW9uID0gdGhpcy5nZXRGZWV0TG9jYXRpb24oKTtcclxuICAgICAgICBjb25zdCBmb3J3YXJkID0gdGhpcy5nZXRGb3J3YXJkRGlyZWN0aW9uKCkubXVsdGlwbHkoZm9yd2FyZE11bHRpcGxpZXIpO1xyXG4gICAgICAgIGNvbnN0IG9mZnNldExvY2F0aW9uID0gZmVldExvY2F0aW9uLiQuYWRkKGZvcndhcmQpLmFkZCgwLCB5T2Zmc2V0LCAwKTtcclxuICAgICAgICByZXR1cm4gQmxvY2tVdGlscy5mcm9tVjMob2Zmc2V0TG9jYXRpb24pID8/IG51bGw7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBnZXRGZWV0TG9jYXRpb24oKTogVjMge1xyXG4gICAgICAgIGNvbnN0IGZlZXRMb2NhdGlvbiA9IHRoaXMuY29udGV4dC5nZXRWYWx1ZShMb2NhdGlvblZhcikuY2xvbmUoKTtcclxuICAgICAgICAvLyBSb3VuZCBpbiBjYXNlIHRoZXkgYXJlIG9uIGEgbm9uLWZ1bGwgYmxvY2ssIGUuZy4gYSBjaGVzdFxyXG4gICAgICAgIGZlZXRMb2NhdGlvbi55ID0gTWF0aC5yb3VuZChmZWV0TG9jYXRpb24ueSk7XHJcbiAgICAgICAgcmV0dXJuIGZlZXRMb2NhdGlvbjtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGNlbnRlckVudGl0eSgpOiB2b2lkIHtcclxuICAgICAgICBjb25zdCBlbnRpdHkgPSB0aGlzLmNvbnRleHQuZW50aXR5O1xyXG4gICAgICAgIGNvbnN0IGxvY2F0aW9uID0gdGhpcy5nZXRGZWV0TG9jYXRpb24oKS5ncmlkKCk7XHJcbiAgICAgICAgZW50aXR5LnRlbGVwb3J0KGxvY2F0aW9uLCB7IGtlZXBWZWxvY2l0eTogdHJ1ZSB9KTtcclxuICAgIH1cclxuICAgIC8vICNlbmRyZWdpb25cclxufVxyXG4iXSwibmFtZXMiOlsiQmxvY2tQZXJtdXRhdGlvbiIsIkl0ZW1TdGFjayIsIkxvY2F0aW9uVmFyIiwiUGlsbGFyQmxvY2tMb2NhdGlvbnNWYXIiLCJSZWNvdmVyUGF0aFByb2NlZHVyZURhdGEiLCJWMyIsIkludmVudG9yeUhlbHBlciIsIlZpcnR1YWxJbnZlbnRvcnlDb21wb25lbnQiLCJDb21wb3NpdGVTdGF0ZSIsIkFzeW5jVXRpbHMiLCJCbG9ja1V0aWxzIiwiQnVpbGRCbG9ja1Byb2NlZHVyZSIsIk1pbmVCbG9ja1Byb2NlZHVyZSIsIlN3YXBUb0l0ZW1Qcm9jZWR1cmUiLCJyZWdpc3RyeSIsIlJlY292ZXJQYXRoUHJvY2VkdXJlIiwic2V0VGFyZ2V0IiwidGFyZ2V0IiwiaXNBY3RpdmUiLCJ0YXJnZXRMb2NhdGlvbiIsInNldENhblBsYWNlQmxvY2tzIiwiY2FuUGxhY2UiLCJjYW5QbGFjZUJsb2NrcyIsInNldENhbkJyZWFrQmxvY2tzIiwiY2FuQnJlYWsiLCJjYW5CcmVha0Jsb2NrcyIsIm9uRW50ZXIiLCJicm9hZGNhc3RTaWduYWwiLCJyZWNvdmVyeUZhaWxlZCIsImFjdGlvbiIsInNlbGVjdFJlY292ZXJBY3Rpb24iLCJydW5SZWNvdmVyeUFjdGlvbiIsImR1cmF0aW9uIiwiY29udGV4dCIsImVudGl0eSIsImdldE1vYkNvbXBvbmVudCIsImlzU3dpbW1pbmciLCJTd2ltbWluZ1Nsb3duZXNzRHVyYXRpb24iLCJTbG93bmVzc0R1cmF0aW9uIiwiYWRkRWZmZWN0IiwiYW1wbGlmaWVyIiwic2hvd1BhcnRpY2xlcyIsImZlZXRMb2NhdGlvbiIsImdldEZlZXRMb2NhdGlvbiIsImJvZHlMb2NhdGlvbiIsIiQiLCJhZGQiLCJ5RGlmZiIsInkiLCJpc0xpa2VseVNvbGlkIiwiZnJvbVYzIiwicGVybXV0YXRpb24iLCJQaWxsYXJZVGhyZXNob2xkIiwiRGlnWVRocmVzaG9sZCIsImZpbmROZWFyYnlDbG9zZWREb29yIiwib2Zmc2V0IiwiVHVubmVsQmxvY2tPZmZzZXRzIiwiYmxvY2tJbkZyb250IiwiZ2V0QmxvY2tJbkZyb250IiwieU9mZnNldCIsImZvcndhcmRNdWx0aXBsaWVyIiwiaXNMaWtlbHlOYXZpZ2F0aW9uQmxvY2tpbmciLCJpc092ZXJyaWRlYWJsZSIsIndhc1N1Y2Nlc3NmdWwiLCJydW5GcmVlQWN0aW9uIiwicnVuUGlsbGFyQWN0aW9uIiwicnVuQnJpZGdlQWN0aW9uIiwicnVuRGlnQWN0aW9uIiwicnVuT3BlbkRvb3JBY3Rpb24iLCJydW5UdW5uZWxBY3Rpb24iLCJpc1ZhbGlkIiwic2V0U3Vic3RhdGUiLCJibG9ja3MiLCJiIiwibWluZVN1Y2NlZWRlZCIsIndhaXRGb3JNaW5lQmxvY2siLCJNYXRoIiwicm91bmQiLCJoYXNNaW5lZCIsImlzTWluZWFibGUiLCJkZWxheSIsIlBpbGxhckJyZWFrSW1wdWxzZURlbGF5Iiwic3RyZW5ndGgiLCJTd2ltbWluZ1BpbGxhckltcHVsc2VTdHJlbmd0aCIsIlBpbGxhckltcHVsc2VTdHJlbmd0aCIsImFwcGx5SW1wdWxzZSIsImNlbnRlckVudGl0eSIsIndhaXRGb3JDb25kaXRpb25XaXRoVGltZW91dCIsImxvY2F0aW9uIiwiUGlsbGFyQmxvY2tQbGFjZU1heFdhaXQiLCJwYXRoaW5nQmxvY2siLCJnZXRQYXRoaW5nQmxvY2tQZXJtdXRhdGlvbiIsImdldFZhbHVlIiwicHVzaCIsIndhaXRGb3JCdWlsZEJsb2NrIiwiZm9yd2FyZCIsImdldEZvcndhcmREaXJlY3Rpb24iLCJicmlkZ2VMb2NhdGlvbiIsInN1YnRyYWN0IiwiY3VycmVudEJsb2NrIiwiYmVsb3dCbG9jayIsImJsb2NrIiwicmVzdWx0IiwiZG9vciIsIm9wZW5Eb29yIiwibWluZUJsb2NrIiwiZ2V0U3Vic3RhdGUiLCJzZXRCbG9jayIsIm9uQ29tcGxldGUiLCJ3YWl0Rm9yU2lnbmFsIiwidGhlbiIsIm9uRmFpbHVyZSIsIlByb21pc2UiLCJyYWNlIiwiaXNJbnN0YW50IiwiYnVpbGRCbG9jayIsInNldFBlcm11dGF0aW9uIiwic2V0TG9jYXRpb24iLCJzZXRSZW1vdmVGcm9tSW52ZW50b3J5Iiwic3dhcFRvSXRlbSIsInNldEhvbGREdXJhdGlvbiIsInNldFNob3VsZFNjcm9sbCIsInNldERlbGF5QWZ0ZXJIb2xkaW5nIiwiaXNCcmlkZ2luZyIsInBhdGhpbmdJdGVtIiwiZ2V0QmVzdEF2YWlsYWJsZVBhdGhpbmdCbG9jayIsInJlc29sdmUiLCJ0eXBlSWQiLCJ2aXJ0dWFsSW52ZW50b3J5IiwiZ2V0IiwiYmFja3VwSXRlbSIsImdpdmVJdGVtIiwibmV3SXRlbSIsImZpbmRJdGVtVHlwZSIsIm9uU3Vic3RhdGVGYWlsdXJlIiwiX3N0YXRlIiwidG9UYXJnZXQiLCJjbG9uZSIsInNldEF4aXMiLCJkb21pbmFudCIsIm5vcm1hbGl6ZSIsIk5lYXJieURvb3JPZmZzZXRzIiwiaXNPcGVuYWJsZURvb3JCbG9jayIsImlzRG9vck9wZW4iLCJ0eXBlIiwiZW5kc1dpdGgiLCJvcGVuQml0IiwiZ2V0U3RhdGUiLCJ1cGRhdGVkUGVybXV0YXRpb24iLCJ3aXRoU3RhdGUiLCJkaW1lbnNpb24iLCJwbGF5U291bmQiLCJtdWx0aXBseSIsIm9mZnNldExvY2F0aW9uIiwiZ3JpZCIsInRlbGVwb3J0Iiwia2VlcFZlbG9jaXR5IiwiZGVmaW5pdGlvbiIsImlkZW50aWZpZXIiLCJwcmlvcml0eSIsIlByaW9yaXR5IiwiaW5pdGlhbFN0YXRlIl0sIm1hcHBpbmdzIjoiQUFBQSxTQUFnQkEsZ0JBQWdCLEVBQUVDLFNBQVMsUUFBUSxvQkFBb0I7QUFDdkUsU0FBU0MsV0FBVyxRQUFRLCtCQUErQjtBQUMzRCxTQUFTQyx1QkFBdUIsUUFBUSwyQ0FBMkM7QUFDbkYsT0FBT0MsOEJBQThCLG9EQUFvRDtBQUN6RixPQUFPQyxRQUFRLHFCQUFxQjtBQUNwQyxPQUFPQyxxQkFBcUIsNEJBQTRCO0FBQ3hELE9BQU9DLCtCQUErQixzQ0FBc0M7QUFFNUUsT0FBT0Msb0JBQW9CLHNDQUFzQztBQUVqRSxPQUFPQyxnQkFBZ0IsbUJBQW1CO0FBQzFDLE9BQU9DLGdCQUFnQixtQkFBbUI7QUFDMUMsU0FBU0MsbUJBQW1CLFFBQVEsd0JBQXdCO0FBQzVELFNBQVNDLGtCQUFrQixRQUFRLHVCQUF1QjtBQUMxRCxTQUFTQyxtQkFBbUIsUUFBUSx3QkFBd0I7QUFTNUQsTUFBTUMsV0FBVztJQUFDRjtJQUFvQkQ7Q0FBb0I7QUFFMUQsT0FBTyxNQUFNSSw2QkFBNkJQO0lBa0MvQlEsVUFBVUMsTUFBVSxFQUFRO1FBQy9CLElBQUksSUFBSSxDQUFDQyxRQUFRLEVBQUU7UUFDbkIsSUFBSSxDQUFDQyxjQUFjLEdBQUdGO0lBQzFCO0lBRU9HLGtCQUFrQkMsUUFBaUIsRUFBUTtRQUM5QyxJQUFJLENBQUNDLGNBQWMsR0FBR0Q7SUFDMUI7SUFFT0Usa0JBQWtCQyxRQUFpQixFQUFRO1FBQzlDLElBQUksQ0FBQ0MsY0FBYyxHQUFHRDtJQUMxQjtJQUVVRSxVQUFnQjtRQUN0QixJQUFJLENBQUMsSUFBSSxDQUFD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