import { LocationVar } from "BigBrain/Context/LocationVar";
import PathToNodeProcedureData from "Data/BigBrain/Procedures/PathToNodeProcedureData";
import PathToTargetProcedureData from "Data/BigBrain/Procedures/PathToTargetProcedureData";
import V2 from "Helpers/Vectors/V2";
import V3 from "Helpers/Vectors/V3";
import Volume from "Helpers/Vectors/Volume";
import CompositeState from "StateSkeleton/States/CompositeState";
import { ExitType } from "StateSkeleton/Types";
import AsyncUtils from "Utils/AsyncUtils";
import BlockUtils from "Utils/BlockUtils";
import DirectionUtil from "Utils/DirectionUtil";
import { PathToTargetProcedure } from "./PathToTargetProcedure";
const registry = [
    PathToTargetProcedure
];
export class PathToNodeProcedure extends CompositeState {
    setPrimaryLocation(location) {
        if (location && this.primaryLocation?.equals(location)) return;
        this.primaryLocation = location;
        if (this.isActive) this.onPrimaryLocationChanged(location);
    }
    setWithinRadius(radius) {
        this.withinRadius = radius;
    }
    setCanPlaceBlocks(canPlace) {
        this.canPlaceBlocks = canPlace;
    }
    setCanBreakBlocks(canBreak) {
        this.canBreakBlocks = canBreak;
    }
    onPrimaryLocationChanged(location) {
        if (!location) return this.removePrimaryNode();
        if (this.primaryNode?.isValid) {
            const nodeComponent = this.primaryNode.getMobComponent("NodeComponent");
            if (nodeComponent) nodeComponent.updateLocation(location);
            else this.primaryNode.teleport(location);
        } else this.addPrimaryNode(location);
        if (this.secondaryNodes.length === 0) {
            this.updateTarget();
        }
    }
    onEnter(memory) {
        if (memory) this.restoreMemory(memory);
        const pathToTarget = this.getSubstate(PathToTargetProcedure);
        pathToTarget.setCanBreakBlocks(this.canBreakBlocks);
        pathToTarget.setCanPlaceBlocks(this.canPlaceBlocks);
        this.subscribeToPathToTargetSignals(pathToTarget);
        if (this.withinRadius === null) this.withinRadius = PathToNodeProcedureData.WithinRadius;
        if (!this.primaryLocation) return this.broadcastSignal("onComplete");
        this.addPrimaryNode(this.primaryLocation);
        if (this.staircaseLocation && this.staircaseDirection) {
            this.spawnStaircaseNode(this.staircaseLocation);
            pathToTarget.setCanStartStaircase(false);
        }
        this.updateTarget();
    }
    restoreMemory(memory) {
        if (this.primaryLocation) return;
        if (memory.targetLocation) this.primaryLocation = V3.fromSerializedLocation(memory.targetLocation);
        if (memory.staircaseLocation) {
            this.staircaseLocation = V3.fromSerializedLocation(memory.staircaseLocation);
        }
        if (memory.staircaseDirection) {
            this.staircaseDirection = new V2(memory.staircaseDirection.x, memory.staircaseDirection.z);
        }
        if (memory.nextStaircaseStepIsDown !== undefined) {
            this.nextStaircaseStepIsDown = memory.nextStaircaseStepIsDown;
        }
    }
    createMemory() {
        if (!this.primaryLocation) return undefined;
        const memory = {
            targetLocation: this.primaryLocation.toJSON()
        };
        if (this.staircaseLocation && this.staircaseDirection) {
            memory.staircaseLocation = this.staircaseLocation.toJSON();
            memory.staircaseDirection = {
                x: this.staircaseDirection.x,
                z: this.staircaseDirection.z
            };
            memory.nextStaircaseStepIsDown = this.nextStaircaseStepIsDown;
        }
        return memory;
    }
    addPrimaryNode(location) {
        if (!location.dimension) location.setDimension(overworld);
        PathToNodeProcedure.globalNodeIndex++;
        PathToNodeProcedure.globalNodeIndex %= PathToNodeProcedureData.MaxNodeIndex + 1;
        this.nodeIndex = PathToNodeProcedure.globalNodeIndex;
        if (!location.isLoaded()) return;
        const node = EntityUtil.spawnEntity("gm1_sky:node", location, location.dimension);
        EntityStore.setOwner(node, this.context.entity);
        node.setProperty("gm1_sky:node", this.nodeIndex);
        node.addTag("disabled");
        this.context.entity.setProperty("gm1_sky:node", this.nodeIndex);
        this.primaryNode = node;
    }
    addSecondaryNode(location) {
        if (!location.dimension) throw new Error("Invalid location dimension");
        if (!location.isLoaded()) return;
        const node = EntityUtil.spawnEntity("gm1_sky:node", location, location.dimension);
        EntityStore.setOwner(node, this.context.entity);
        node.setProperty("gm1_sky:node", this.nodeIndex);
        node.setProperty("gm1_sky:type", 1);
        node.addTag("disabled");
        this.secondaryNodes.push(node);
        this.updateTarget();
    }
    updateTarget() {
        this.secondaryNodes = this.secondaryNodes.filter((n)=>n.isValid);
        if (this.currentStaircaseNode && !this.currentStaircaseNode.isValid) this.currentStaircaseNode = null;
        const nextSecondary = this.secondaryNodes[0] ?? null;
        const nextStaircase = this.currentStaircaseNode;
        const primary = this.primaryNode;
        if (nextSecondary) {
            nextSecondary.removeTag("disabled");
            if (nextStaircase?.isValid) nextStaircase.addTag("disabled");
            if (primary?.isValid) primary.addTag("disabled");
            const pathToTarget = this.getSubstate(PathToTargetProcedure);
            pathToTarget.setWithinRadius(PathToNodeProcedureData.WithinRadius);
            pathToTarget.setTarget(nextSecondary);
        } else if (nextStaircase) {
            nextStaircase.removeTag("disabled");
            if (primary?.isValid) primary.addTag("disabled");
            const pathToTarget = this.getSubstate(PathToTargetProcedure);
            pathToTarget.setWithinRadius(PathToNodeProcedureData.WithinRadius);
            pathToTarget.setTarget(nextStaircase);
        } else {
            if (primary?.isValid) primary.removeTag("disabled");
            const pathToTarget = this.getSubstate(PathToTargetProcedure);
            pathToTarget.setWithinRadius(this.withinRadius);
            pathToTarget.setTarget(primary);
        }
    }
    onSubstateFailure(_state) {
        //Give up the pathfinding if block placing/breaking is restricted
        if (!this.canPlaceBlocks || !this.canBreakBlocks) return this.broadcastSignal("onFailure");
        this.spawnFailureNode();
    }
    onSubstateComplete(_state) {
        if (this.secondaryNodes.length !== 0) return this.onReachSecondaryNode();
        if (this.currentStaircaseNode) return this.onReachStaircaseNode();
        this.broadcastSignal("onComplete");
    }
    subscribeToPathToTargetSignals(pathToTarget) {
        pathToTarget.subscribeToSignal("onStartStaircase", ()=>this.onStaircaseSignal());
        pathToTarget.subscribeToSignal("onStuck", ()=>{
            this.resetPath(true);
        });
    }
    enterPathToTarget() {
        const pathToTarget = this.getSubstate(PathToTargetProcedure);
        pathToTarget.setCanPlaceBlocks(this.canPlaceBlocks);
        pathToTarget.setCanBreakBlocks(this.canBreakBlocks);
        this.setSubstate(pathToTarget);
        this.subscribeToPathToTargetSignals(pathToTarget);
    }
    onReachSecondaryNode() {
        const node = this.secondaryNodes.shift();
        if (node.isValid) node.remove();
        this.updateTarget();
        this.enterPathToTarget();
    }
    removePrimaryNode() {
        if (!this.primaryNode) return;
        if (this.primaryNode.isValid) this.primaryNode.remove();
        this.primaryNode = null;
    }
    removeAllSecondaryNodes() {
        for (const node of this.secondaryNodes){
            if (node.isValid) node.remove();
        }
        this.secondaryNodes = [];
        this.clearStaircase();
    }
    onExit(exitType) {
        if (exitType === ExitType.Shutdown) return;
        this.removeAllSecondaryNodes();
        this.setPrimaryLocation(null);
        if (exitType === ExitType.Remove) return;
        this.resetPath(false);
    }
    //#region Staircase
    onStaircaseSignal() {
        if (this.currentStaircaseNode?.isValid) return;
        this.initiateStaircase();
        this.updateTarget();
        if (this.currentStaircaseNode) {
            this.getSubstate(PathToTargetProcedure).setCanStartStaircase(false);
        }
    }
    onReachStaircaseNode() {
        if (this.currentStaircaseNode?.isValid) this.currentStaircaseNode.remove();
        this.currentStaircaseNode = null;
        this.advanceStaircase();
        this.updateTarget();
        this.enterPathToTarget();
    }
    initiateStaircase() {
        if (!this.primaryLocation) return;
        const entityLocation = this.context.getValue(LocationVar).clone();
        if (entityLocation.y <= this.primaryLocation.y) return;
        const horizontal = new V2(this.primaryLocation.x - entityLocation.x, this.primaryLocation.z - entityLocation.z);
        const horizontalDist = horizontal.length();
        const verticalDist = entityLocation.y - this.primaryLocation.y;
        if (horizontalDist === 0) {
            // Default to walking north if directly above the primary location
            this.staircaseDirection = new V2(0, -1);
        } else {
            this.staircaseDirection = horizontal.normalize();
        }
        this.nextStaircaseStepIsDown = true;
        const start = entityLocation.clone();
        if (horizontalDist > verticalDist) {
            // More horizontal than vertical: walk toward target until hDist == vDist, then staircase
            const equalizeDist = horizontalDist - verticalDist;
            const result = this.getBestStaircaseDirection(entityLocation, equalizeDist, this.staircaseDirection);
            if (result) {
                this.staircaseDirection = result.direction;
                start.x = result.x;
                start.z = result.z;
            }
            this.staircaseLocation = start;
            this.spawnStaircaseNode(this.staircaseLocation);
        } else if (horizontalDist < verticalDist) {
            // More vertical than horizontal: overshoot past target until hDist == vDist, then staircase back
            const overshootDist = verticalDist - horizontalDist;
            const overshootOrigin = new V3(this.primaryLocation.x, start.y, this.primaryLocation.z).setDimension(overworld);
            const result = this.getBestStaircaseDirection(overshootOrigin, overshootDist, this.staircaseDirection);
            if (result) {
                this.staircaseDirection = result.direction.multiply(-1);
                start.x = result.x;
                start.z = result.z;
            }
            this.staircaseLocation = start;
            this.spawnStaircaseNode(this.staircaseLocation);
        } else {
            // hDist == vDist: start staircasing from current position
            this.staircaseLocation = start;
            this.advanceStaircase();
        }
    }
    advanceStaircase() {
        if (!this.primaryLocation || !this.staircaseLocation || !this.staircaseDirection) return;
        if (this.nextStaircaseStepIsDown) {
            this.staircaseStepDown();
        } else {
            this.staircaseStepForward();
        }
    }
    staircaseStepDown() {
        const isStillAboveTarget = this.staircaseLocation.y > this.primaryLocation.y;
        if (isStillAboveTarget) {
            this.staircaseLocation.subtract(0, 1, 0);
            this.nextStaircaseStepIsDown = false;
            this.spawnStaircaseNode(this.staircaseLocation);
        } else {
            this.clearStaircase();
        }
    }
    staircaseStepForward() {
        this.nextStaircaseStepIsDown = true;
        const remainingHorizontal = new V2(this.primaryLocation.x - this.staircaseLocation.x, this.primaryLocation.z - this.staircaseLocation.z);
        const remainingHorizontalDist = remainingHorizontal.length();
        if (remainingHorizontalDist > 1) {
            const candidateLocation = this.staircaseLocation.clone().add(this.staircaseDirection.x, 0, this.staircaseDirection.z);
            if (!BlockUtils.hasSolidGroundBelow(candidateLocation)) {
                // Can't go horizontal - try stepping down
                this.staircaseStepDown();
                return;
            }
            this.staircaseLocation = candidateLocation;
            this.spawnStaircaseNode(this.staircaseLocation);
        } else {
            // Already horizontally aligned; proceed with the next down step
            this.staircaseStepDown();
        }
    }
    getBestStaircaseDirection(origin, distance, preferred) {
        const candidates = [
            preferred,
            ...DirectionUtil.cardinalDirections
        ];
        for (const direction of candidates){
            const targetX = origin.x + direction.x * distance;
            const targetZ = origin.z + direction.z * distance;
            const targetLocation = new V3(targetX, origin.y, targetZ).setDimension(overworld);
            if (BlockUtils.hasSolidGroundBelow(targetLocation)) {
                return {
                    direction: direction,
                    x: targetX,
                    z: targetZ
                };
            }
        }
        return null;
    }
    spawnStaircaseNode(location) {
        if (!location.dimension) throw new Error("Invalid location dimension");
        if (this.currentStaircaseNode?.isValid) this.currentStaircaseNode.remove();
        if (!location.isLoaded()) return;
        const node = EntityUtil.spawnEntity("gm1_sky:node", location.grid(), location.dimension);
        EntityStore.setOwner(node, this.context.entity);
        node.setProperty("gm1_sky:node", this.nodeIndex);
        node.setProperty("gm1_sky:type", 2);
        node.addTag("disabled");
        this.currentStaircaseNode = node;
    }
    clearStaircase() {
        if (this.currentStaircaseNode?.isValid) this.currentStaircaseNode.remove();
        this.currentStaircaseNode = null;
        this.staircaseLocation = null;
        this.staircaseDirection = null;
        this.getSubstate(PathToTargetProcedure).setCanStartStaircase(true);
    }
    async resetPath(recenter = false) {
        const entity = this.context.entity;
        if (!entity.isValid) return;
        const duration = PathToTargetProcedureData.PathResetSlownessDuration;
        entity.addEffect("minecraft:slowness", duration, {
            amplifier: 255,
            showParticles: false
        });
        if (recenter) {
            const feetLocation = V3.fromEntity(entity, overworld);
            feetLocation.y = Math.round(feetLocation.y);
            const location = feetLocation.grid();
            entity.teleport(location);
        }
        entity.triggerEvent("gm1_sky:reset_path.add");
        await AsyncUtils.delay(1);
        if (!entity.isValid) return;
        entity.triggerEvent("gm1_sky:reset_path.remove");
    }
    /**
     * Spawns a failure node in the direction of the primary location to allow the entity to reroute
     */ spawnFailureNode() {
        this.removeAllSecondaryNodes();
        const center = this.context.getValue(LocationVar).$.grid();
        const targetDirection = this.primaryLocation.$.subtract(center).normalize();
        const perpendicularDirection = targetDirection.$.rotateYaw(Math.PI / 2);
        // Create volume from the AIP in the direction of the target
        const maxLength = PathToNodeProcedureData.FailureNodeOffsetMaxLength;
        const minOffset = perpendicularDirection.$.multiply(-maxLength);
        const maxOffset = perpendicularDirection.$.multiply(maxLength).add(targetDirection.$.multiply(maxLength));
        const nodeVolume = new Volume(minOffset, maxOffset).offset(center);
        // Get a random point in the volume
        const nodeLocation = nodeVolume.randomPoint().grid();
        nodeLocation.setDimension(overworld);
        // Ensure the node is not below the primary location to avoid issues with staircases
        if (nodeLocation.y < this.primaryLocation.y) nodeLocation.y = this.primaryLocation.y;
        // Spawn the secondary node
        this.addSecondaryNode(nodeLocation);
        // Reset the pathfinding state
        this.currentSubstate.enter();
    }
    constructor(...args){
        super(...args);
        this.timeoutDuration = PathToNodeProcedureData.TimeoutDuration;
        this.nodeIndex = -1;
        this.primaryLocation = null;
        this.withinRadius = null;
        this.canPlaceBlocks = true;
        this.canBreakBlocks = true;
        this.primaryNode = null;
        this.secondaryNodes = [];
        this.currentStaircaseNode = null;
        this.staircaseLocation = null;
        this.staircaseDirection = null;
        this.nextStaircaseStepIsDown = true;
    }
}
PathToNodeProcedure.definition = {
    identifier: "procedure:path_to_node",
    priority: PathToNodeProcedureData.Priority,
    registry,
    initialState: PathToTargetProcedure
};
PathToNodeProcedure.globalNodeIndex = 0;

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIlBhdGhUb05vZGVQcm9jZWR1cmUudHMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgRW50aXR5IH0gZnJvbSBcIkBtaW5lY3JhZnQvc2VydmVyXCI7XHJcbmltcG9ydCB7IExvY2F0aW9uVmFyIH0gZnJvbSBcIkJpZ0JyYWluL0NvbnRleHQvTG9jYXRpb25WYXJcIjtcclxuaW1wb3J0IHsgU2VyaWFsaXplZExvY2F0aW9uIH0gZnJvbSBcIkJpZ0JyYWluL1R5cGVzXCI7XHJcbmltcG9ydCBQYXRoVG9Ob2RlUHJvY2VkdXJlRGF0YSBmcm9tIFwiRGF0YS9CaWdCcmFpbi9Qcm9jZWR1cmVzL1BhdGhUb05vZGVQcm9jZWR1cmVEYXRhXCI7XHJcbmltcG9ydCBQYXRoVG9UYXJnZXRQcm9jZWR1cmVEYXRhIGZyb20gXCJEYXRhL0JpZ0JyYWluL1Byb2NlZHVyZXMvUGF0aFRvVGFyZ2V0UHJvY2VkdXJlRGF0YVwiO1xyXG5pbXBvcnQgVjIgZnJvbSBcIkhlbHBlcnMvVmVjdG9ycy9WMlwiO1xyXG5pbXBvcnQgVjMgZnJvbSBcIkhlbHBlcnMvVmVjdG9ycy9WM1wiO1xyXG5pbXBvcnQgVm9sdW1lIGZyb20gXCJIZWxwZXJzL1ZlY3RvcnMvVm9sdW1lXCI7XHJcbmltcG9ydCBBYnN0cmFjdFN0YXRlIGZyb20gXCJTdGF0ZVNrZWxldG9uL1N0YXRlcy9BYnN0cmFjdFN0YXRlXCI7XHJcbmltcG9ydCBDb21wb3NpdGVTdGF0ZSBmcm9tIFwiU3RhdGVTa2VsZXRvbi9TdGF0ZXMvQ29tcG9zaXRlU3RhdGVcIjtcclxuaW1wb3J0IHsgQ29tcG9zaXRlU3RhdGVEZWZpbml0aW9uLCBFeGl0VHlwZSwgU3RhdGVNZW1vcnkgfSBmcm9tIFwiU3RhdGVTa2VsZXRvbi9UeXBlc1wiO1xyXG5pbXBvcnQgQXN5bmNVdGlscyBmcm9tIFwiVXRpbHMvQXN5bmNVdGlsc1wiO1xyXG5pbXBvcnQgQmxvY2tVdGlscyBmcm9tIFwiVXRpbHMvQmxvY2tVdGlsc1wiO1xyXG5pbXBvcnQgRGlyZWN0aW9uVXRpbCBmcm9tIFwiVXRpbHMvRGlyZWN0aW9uVXRpbFwiO1xyXG5pbXBvcnQgeyBQYXRoVG9UYXJnZXRQcm9jZWR1cmUgfSBmcm9tIFwiLi9QYXRoVG9UYXJnZXRQcm9jZWR1cmVcIjtcclxuXHJcbmludGVyZmFjZSBNZW1vcnkgZXh0ZW5kcyBTdGF0ZU1lbW9yeSB7XHJcbiAgICB0YXJnZXRMb2NhdGlvbjogU2VyaWFsaXplZExvY2F0aW9uO1xyXG4gICAgc3RhaXJjYXNlTG9jYXRpb24/OiBTZXJpYWxpemVkTG9jYXRpb247XHJcbiAgICBzdGFpcmNhc2VEaXJlY3Rpb24/OiB7IHg6IG51bWJlcjsgejogbnVtYmVyIH07XHJcbiAgICBuZXh0U3RhaXJjYXNlU3RlcElzRG93bj86IGJvb2xlYW47XHJcbn1cclxuXHJcbmNvbnN0IHJlZ2lzdHJ5ID0gW1BhdGhUb1RhcmdldFByb2NlZHVyZV0gYXMgY29uc3Q7XHJcblxyXG5leHBvcnQgY2xhc3MgUGF0aFRvTm9kZVByb2NlZHVyZSBleHRlbmRzIENvbXBvc2l0ZVN0YXRlPHR5cGVvZiByZWdpc3RyeT4ge1xyXG4gICAgcHVibGljIHN0YXRpYyByZWFkb25seSBkZWZpbml0aW9uOiBDb21wb3NpdGVTdGF0ZURlZmluaXRpb248dHlwZW9mIHJlZ2lzdHJ5PiA9IHtcclxuICAgICAgICBpZGVudGlmaWVyOiBcInByb2NlZHVyZTpwYXRoX3RvX25vZGVcIixcclxuICAgICAgICBwcmlvcml0eTogUGF0aFRvTm9kZVByb2NlZHVyZURhdGEuUHJpb3JpdHksXHJcbiAgICAgICAgcmVnaXN0cnksXHJcbiAgICAgICAgaW5pdGlhbFN0YXRlOiBQYXRoVG9UYXJnZXRQcm9jZWR1cmUsXHJcbiAgICB9O1xyXG5cclxuICAgIHByb3RlY3RlZCB0aW1lb3V0RHVyYXRpb246IG51bWJlciA9IFBhdGhUb05vZGVQcm9jZWR1cmVEYXRhLlRpbWVvdXREdXJhdGlvbjtcclxuXHJcbiAgICBwdWJsaWMgc3RhdGljIGdsb2JhbE5vZGVJbmRleCA9IDA7XHJcblxyXG4gICAgcHJpdmF0ZSBub2RlSW5kZXg6IG51bWJlciA9IC0xO1xyXG4gICAgcHJpdmF0ZSBwcmltYXJ5TG9jYXRpb246IFYzIHwgbnVsbCA9IG51bGw7XHJcbiAgICBwcml2YXRlIHdpdGhpblJhZGl1czogbnVtYmVyIHwgbnVsbCA9IG51bGw7XHJcbiAgICBwcml2YXRlIGNhblBsYWNlQmxvY2tzOiBib29sZWFuID0gdHJ1ZTtcclxuICAgIHByaXZhdGUgY2FuQnJlYWtCbG9ja3M6IGJvb2xlYW4gPSB0cnVlO1xyXG5cclxuICAgIHB1YmxpYyBwcmltYXJ5Tm9kZTogRW50aXR5IHwgbnVsbCA9IG51bGw7XHJcbiAgICBwcml2YXRlIHNlY29uZGFyeU5vZGVzOiBFbnRpdHlbXSA9IFtdO1xyXG5cclxuICAgIHByaXZhdGUgY3VycmVudFN0YWlyY2FzZU5vZGU6IEVudGl0eSB8IG51bGwgPSBudWxsO1xyXG4gICAgcHJpdmF0ZSBzdGFpcmNhc2VMb2NhdGlvbjogVjMgfCBudWxsID0gbnVsbDtcclxuICAgIHByaXZhdGUgc3RhaXJjYXNlRGlyZWN0aW9uOiBWMiB8IG51bGwgPSBudWxsO1xyXG4gICAgcHJpdmF0ZSBuZXh0U3RhaXJjYXNlU3RlcElzRG93bjogYm9vbGVhbiA9IHRydWU7XHJcblxyXG4gICAgcHVibGljIHNldFByaW1hcnlMb2NhdGlvbihsb2NhdGlvbjogVjMgfCBudWxsKTogdm9pZCB7XHJcbiAgICAgICAgaWYgKGxvY2F0aW9uICYmIHRoaXMucHJpbWFyeUxvY2F0aW9uPy5lcXVhbHMobG9jYXRpb24pKSByZXR1cm47XHJcbiAgICAgICAgdGhpcy5wcmltYXJ5TG9jYXRpb24gPSBsb2NhdGlvbjtcclxuICAgICAgICBpZiAodGhpcy5pc0FjdGl2ZSkgdGhpcy5vblByaW1hcnlMb2NhdGlvbkNoYW5nZWQobG9jYXRpb24pO1xyXG4gICAgfVxyXG5cclxuICAgIHB1YmxpYyBzZXRXaXRoaW5SYWRpdXMocmFkaXVzOiBudW1iZXIpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLndpdGhpblJhZGl1cyA9IHJhZGl1cztcclxuICAgIH1cclxuXHJcbiAgICBwdWJsaWMgc2V0Q2FuUGxhY2VCbG9ja3MoY2FuUGxhY2U6IGJvb2xlYW4pOiB2b2lkIHtcclxuICAgICAgICB0aGlzLmNhblBsYWNlQmxvY2tzID0gY2FuUGxhY2U7XHJcbiAgICB9XHJcblxyXG4gICAgcHVibGljIHNldENhbkJyZWFrQmxvY2tzKGNhbkJyZWFrOiBib29sZWFuKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5jYW5CcmVha0Jsb2NrcyA9IGNhbkJyZWFrO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgb25QcmltYXJ5TG9jYXRpb25DaGFuZ2VkKGxvY2F0aW9uOiBWMyB8IG51bGwpOiB2b2lkIHtcclxuICAgICAgICBpZiAoIWxvY2F0aW9uKSByZXR1cm4gdGhpcy5yZW1vdmVQcmltYXJ5Tm9kZSgpO1xyXG5cclxuICAgICAgICBpZiAodGhpcy5wcmltYXJ5Tm9kZT8uaXNWYWxpZCkge1xyXG4gICAgICAgICAgICBjb25zdCBub2RlQ29tcG9uZW50ID0gdGhpcy5wcmltYXJ5Tm9kZS5nZXRNb2JDb21wb25lbnQoXCJOb2RlQ29tcG9uZW50XCIpO1xyXG4gICAgICAgICAgICBpZiAobm9kZUNvbXBvbmVudCkgbm9kZUNvbXBvbmVudC51cGRhdGVMb2NhdGlvbihsb2NhdGlvbik7XHJcbiAgICAgICAgICAgIGVsc2UgdGhpcy5wcmltYXJ5Tm9kZS50ZWxlcG9ydChsb2NhdGlvbik7XHJcbiAgICAgICAgfSBlbHNlIHRoaXMuYWRkUHJpbWFyeU5vZGUobG9jYXRpb24pO1xyXG5cclxuICAgICAgICBpZiAodGhpcy5zZWNvbmRhcnlOb2Rlcy5sZW5ndGggPT09IDApIHtcclxuICAgICAgICAgICAgdGhpcy51cGRhdGVUYXJnZXQoKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJvdGVjdGVkIG9uRW50ZXIobWVtb3J5PzogTWVtb3J5KTogdm9pZCB7XHJcbiAgICAgICAgaWYgKG1lbW9yeSkgdGhpcy5yZXN0b3JlTWVtb3J5KG1lbW9yeSk7XHJcblxyXG4gICAgICAgIGNvbnN0IHBhdGhUb1RhcmdldCA9IHRoaXMuZ2V0U3Vic3RhdGUoUGF0aFRvVGFyZ2V0UHJvY2VkdXJlKTtcclxuICAgICAgICBwYXRoVG9UYXJnZXQuc2V0Q2FuQnJlYWtCbG9ja3ModGhpcy5jYW5CcmVha0Jsb2Nrcyk7XHJcbiAgICAgICAgcGF0aFRvVGFyZ2V0LnNldENhblBsYWNlQmxvY2tzKHRoaXMuY2FuUGxhY2VCbG9ja3MpO1xyXG4gICAgICAgIHRoaXMuc3Vic2NyaWJlVG9QYXRoVG9UYXJnZXRTaWduYWxzKHBhdGhUb1RhcmdldCk7XHJcblxyXG4gICAgICAgIGlmICh0aGlzLndpdGhpblJhZGl1cyA9PT0gbnVsbCkgdGhpcy53aXRoaW5SYWRpdXMgPSBQYXRoVG9Ob2RlUHJvY2VkdXJlRGF0YS5XaXRoaW5SYWRpdXM7XHJcblxyXG4gICAgICAgIGlmICghdGhpcy5wcmltYXJ5TG9jYXRpb24pIHJldHVybiB0aGlzLmJyb2FkY2FzdFNpZ25hbChcIm9uQ29tcGxldGVcIik7XHJcblxyXG4gICAgICAgIHRoaXMuYWRkUHJpbWFyeU5vZGUodGhpcy5wcmltYXJ5TG9jYXRpb24pO1xyXG5cclxuICAgICAgICBpZiAodGhpcy5zdGFpcmNhc2VMb2NhdGlvbiAmJiB0aGlzLnN0YWlyY2FzZURpcmVjdGlvbikge1xyXG4gICAgICAgICAgICB0aGlzLnNwYXduU3RhaXJjYXNlTm9kZSh0aGlzLnN0YWlyY2FzZUxvY2F0aW9uKTtcclxuICAgICAgICAgICAgcGF0aFRvVGFyZ2V0LnNldENhblN0YXJ0U3RhaXJjYXNlKGZhbHNlKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRoaXMudXBkYXRlVGFyZ2V0KCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSByZXN0b3JlTWVtb3J5KG1lbW9yeTogTWVtb3J5KTogdm9pZCB7XHJcbiAgICAgICAgaWYgKHRoaXMucHJpbWFyeUxvY2F0aW9uKSByZXR1cm47XHJcbiAgICAgICAgaWYgKG1lbW9yeS50YXJnZXRMb2NhdGlvbikgdGhpcy5wcmltYXJ5TG9jYXRpb24gPSBWMy5mcm9tU2VyaWFsaXplZExvY2F0aW9uKG1lbW9yeS50YXJnZXRMb2NhdGlvbik7XHJcbiAgICAgICAgaWYgKG1lbW9yeS5zdGFpcmNhc2VMb2NhdGlvbikge1xyXG4gICAgICAgICAgICB0aGlzLnN0YWlyY2FzZUxvY2F0aW9uID0gVjMuZnJvbVNlcmlhbGl6ZWRMb2NhdGlvbihtZW1vcnkuc3RhaXJjYXNlTG9jYXRpb24pO1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAobWVtb3J5LnN0YWlyY2FzZURpcmVjdGlvbikge1xyXG4gICAgICAgICAgICB0aGlzLnN0YWlyY2FzZURpcmVjdGlvbiA9IG5ldyBWMihtZW1vcnkuc3RhaXJjYXNlRGlyZWN0aW9uLngsIG1lbW9yeS5zdGFpcmNhc2VEaXJlY3Rpb24ueik7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmIChtZW1vcnkubmV4dFN0YWlyY2FzZVN0ZXBJc0Rvd24gIT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgICAgICB0aGlzLm5leHRTdGFpcmNhc2VTdGVwSXNEb3duID0gbWVtb3J5Lm5leHRTdGFpcmNhc2VTdGVwSXNEb3duO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcm90ZWN0ZWQgY3JlYXRlTWVtb3J5KCk6IE1lbW9yeSB8IHVuZGVmaW5lZCB7XHJcbiAgICAgICAgaWYgKCF0aGlzLnByaW1hcnlMb2NhdGlvbikgcmV0dXJuIHVuZGVmaW5lZDtcclxuICAgICAgICBjb25zdCBtZW1vcnk6IE1lbW9yeSA9IHsgdGFyZ2V0TG9jYXRpb246IHRoaXMucHJpbWFyeUxvY2F0aW9uLnRvSlNPTigpIH07XHJcbiAgICAgICAgaWYgKHRoaXMuc3RhaXJjYXNlTG9jYXRpb24gJiYgdGhpcy5zdGFpcmNhc2VEaXJlY3Rpb24pIHtcclxuICAgICAgICAgICAgbWVtb3J5LnN0YWlyY2FzZUxvY2F0aW9uID0gdGhpcy5zdGFpcmNhc2VMb2NhdGlvbi50b0pTT04oKTtcclxuICAgICAgICAgICAgbWVtb3J5LnN0YWlyY2FzZURpcmVjdGlvbiA9IHsgeDogdGhpcy5zdGFpcmNhc2VEaXJlY3Rpb24ueCwgejogdGhpcy5zdGFpcmNhc2VEaXJlY3Rpb24ueiB9O1xyXG4gICAgICAgICAgICBtZW1vcnkubmV4dFN0YWlyY2FzZVN0ZXBJc0Rvd24gPSB0aGlzLm5leHRTdGFpcmNhc2VTdGVwSXNEb3duO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gbWVtb3J5O1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgYWRkUHJpbWFyeU5vZGUobG9jYXRpb246IFYzKTogdm9pZCB7XHJcbiAgICAgICAgaWYgKCFsb2NhdGlvbi5kaW1lbnNpb24pIGxvY2F0aW9uLnNldERpbWVuc2lvbihvdmVyd29ybGQpO1xyXG5cclxuICAgICAgICBQYXRoVG9Ob2RlUHJvY2VkdXJlLmdsb2JhbE5vZGVJbmRleCsrO1xyXG4gICAgICAgIFBhdGhUb05vZGVQcm9jZWR1cmUuZ2xvYmFsTm9kZUluZGV4ICU9IFBhdGhUb05vZGVQcm9jZWR1cmVEYXRhLk1heE5vZGVJbmRleCArIDE7XHJcbiAgICAgICAgdGhpcy5ub2RlSW5kZXggPSBQYXRoVG9Ob2RlUHJvY2VkdXJlLmdsb2JhbE5vZGVJbmRleDtcclxuXHJcbiAgICAgICAgaWYgKCFsb2NhdGlvbi5pc0xvYWRlZCgpKSByZXR1cm47XHJcbiAgICAgICAgY29uc3Qgbm9kZSA9IEVudGl0eVV0aWwuc3Bhd25FbnRpdHkoXCJnbTFfc2t5Om5vZGVcIiwgbG9jYXRpb24sIGxvY2F0aW9uLmRpbWVuc2lvbik7XHJcblxyXG4gICAgICAgIEVudGl0eVN0b3JlLnNldE93bmVyKG5vZGUsIHRoaXMuY29udGV4dC5lbnRpdHkpO1xyXG4gICAgICAgIG5vZGUuc2V0UHJvcGVydHkoXCJnbTFfc2t5Om5vZGVcIiwgdGhpcy5ub2RlSW5kZXgpO1xyXG4gICAgICAgIG5vZGUuYWRkVGFnKFwiZGlzYWJsZWRcIik7XHJcblxyXG4gICAgICAgIHRoaXMuY29udGV4dC5lbnRpdHkuc2V0UHJvcGVydHkoXCJnbTFfc2t5Om5vZGVcIiwgdGhpcy5ub2RlSW5kZXgpO1xyXG4gICAgICAgIHRoaXMucHJpbWFyeU5vZGUgPSBub2RlO1xyXG4gICAgfVxyXG5cclxuICAgIHB1YmxpYyBhZGRTZWNvbmRhcnlOb2RlKGxvY2F0aW9uOiBWMyk6IHZvaWQge1xyXG4gICAgICAgIGlmICghbG9jYXRpb24uZGltZW5zaW9uKSB0aHJvdyBuZXcgRXJyb3IoXCJJbnZhbGlkIGxvY2F0aW9uIGRpbWVuc2lvblwiKTtcclxuXHJcbiAgICAgICAgaWYgKCFsb2NhdGlvbi5pc0xvYWRlZCgpKSByZXR1cm47XHJcbiAgICAgICAgY29uc3Qgbm9kZSA9IEVudGl0eVV0aWwuc3Bhd25FbnRpdHkoXCJnbTFfc2t5Om5vZGVcIiwgbG9jYXRpb24sIGxvY2F0aW9uLmRpbWVuc2lvbik7XHJcblxyXG4gICAgICAgIEVudGl0eVN0b3JlLnNldE93bmVyKG5vZGUsIHRoaXMuY29udGV4dC5lbnRpdHkpO1xyXG4gICAgICAgIG5vZGUuc2V0UHJvcGVydHkoXCJnbTFfc2t5Om5vZGVcIiwgdGhpcy5ub2RlSW5kZXgpO1xyXG4gICAgICAgIG5vZGUuc2V0UHJvcGVydHkoXCJnbTFfc2t5OnR5cGVcIiwgMSk7XHJcbiAgICAgICAgbm9kZS5hZGRUYWcoXCJkaXNhYmxlZFwiKTtcclxuXHJcbiAgICAgICAgdGhpcy5zZWNvbmRhcnlOb2Rlcy5wdXNoKG5vZGUpO1xyXG4gICAgICAgIHRoaXMudXBkYXRlVGFyZ2V0KCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSB1cGRhdGVUYXJnZXQoKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5zZWNvbmRhcnlOb2RlcyA9IHRoaXMuc2Vjb25kYXJ5Tm9kZXMuZmlsdGVyKChuKSA9PiBuLmlzVmFsaWQpO1xyXG4gICAgICAgIGlmICh0aGlzLmN1cnJlbnRTdGFpcmNhc2VOb2RlICYmICF0aGlzLmN1cnJlbnRTdGFpcmNhc2VOb2RlLmlzVmFsaWQpIHRoaXMuY3VycmVudFN0YWlyY2FzZU5vZGUgPSBudWxsO1xyXG5cclxuICAgICAgICBjb25zdCBuZXh0U2Vjb25kYXJ5ID0gdGhpcy5zZWNvbmRhcnlOb2Rlc1swXSA/PyBudWxsO1xyXG4gICAgICAgIGNvbnN0IG5leHRTdGFpcmNhc2UgPSB0aGlzLmN1cnJlbnRTdGFpcmNhc2VOb2RlO1xyXG4gICAgICAgIGNvbnN0IHByaW1hcnkgPSB0aGlzLnByaW1hcnlOb2RlITtcclxuXHJcbiAgICAgICAgaWYgKG5leHRTZWNvbmRhcnkpIHtcclxuICAgICAgICAgICAgbmV4dFNlY29uZGFyeS5yZW1vdmVUYWcoXCJkaXNhYmxlZFwiKTtcclxuICAgICAgICAgICAgaWYgKG5leHRTdGFpcmNhc2U/LmlzVmFsaWQpIG5leHRTdGFpcmNhc2UuYWRkVGFnKFwiZGlzYWJsZWRcIik7XHJcbiAgICAgICAgICAgIGlmIChwcmltYXJ5Py5pc1ZhbGlkKSBwcmltYXJ5LmFkZFRhZyhcImRpc2FibGVkXCIpO1xyXG4gICAgICAgICAgICBjb25zdCBwYXRoVG9UYXJnZXQgPSB0aGlzLmdldFN1YnN0YXRlKFBhdGhUb1RhcmdldFByb2NlZHVyZSk7XHJcbiAgICAgICAgICAgIHBhdGhUb1RhcmdldC5zZXRXaXRoaW5SYWRpdXMoUGF0aFRvTm9kZVByb2NlZHVyZURhdGEuV2l0aGluUmFkaXVzKTtcclxuICAgICAgICAgICAgcGF0aFRvVGFyZ2V0LnNldFRhcmdldChuZXh0U2Vjb25kYXJ5KTtcclxuICAgICAgICB9IGVsc2UgaWYgKG5leHRTdGFpcmNhc2UpIHtcclxuICAgICAgICAgICAgbmV4dFN0YWlyY2FzZS5yZW1vdmVUYWcoXCJkaXNhYmxlZFwiKTtcclxuICAgICAgICAgICAgaWYgKHByaW1hcnk/LmlzVmFsaWQpIHByaW1hcnkuYWRkVGFnKFwiZGlzYWJsZWRcIik7XHJcbiAgICAgICAgICAgIGNvbnN0IHBhdGhUb1RhcmdldCA9IHRoaXMuZ2V0U3Vic3RhdGUoUGF0aFRvVGFyZ2V0UHJvY2VkdXJlKTtcclxuICAgICAgICAgICAgcGF0aFRvVGFyZ2V0LnNldFdpdGhpblJhZGl1cyhQYXRoVG9Ob2RlUHJvY2VkdXJlRGF0YS5XaXRoaW5SYWRpdXMpO1xyXG4gICAgICAgICAgICBwYXRoVG9UYXJnZXQuc2V0VGFyZ2V0KG5leHRTdGFpcmNhc2UpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIGlmIChwcmltYXJ5Py5pc1ZhbGlkKSBwcmltYXJ5LnJlbW92ZVRhZyhcImRpc2FibGVkXCIpO1xyXG4gICAgICAgICAgICBjb25zdCBwYXRoVG9UYXJnZXQgPSB0aGlzLmdldFN1YnN0YXRlKFBhdGhUb1RhcmdldFByb2NlZHVyZSk7XHJcbiAgICAgICAgICAgIHBhdGhUb1RhcmdldC5zZXRXaXRoaW5SYWRpdXModGhpcy53aXRoaW5SYWRpdXMhKTtcclxuICAgICAgICAgICAgcGF0aFRvVGFyZ2V0LnNldFRhcmdldChwcmltYXJ5KTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHVibGljIG92ZXJyaWRlIG9uU3Vic3RhdGVGYWlsdXJlKF9zdGF0ZTogQWJzdHJhY3RTdGF0ZSk6IHZvaWQge1xyXG4gICAgICAgIC8vR2l2ZSB1cCB0aGUgcGF0aGZpbmRpbmcgaWYgYmxvY2sgcGxhY2luZy9icmVha2luZyBpcyByZXN0cmljdGVkXHJcbiAgICAgICAgaWYgKCF0aGlzLmNhblBsYWNlQmxvY2tzIHx8ICF0aGlzLmNhbkJyZWFrQmxvY2tzKSByZXR1cm4gdGhpcy5icm9hZGNhc3RTaWduYWwoXCJvbkZhaWx1cmVcIik7XHJcblxyXG4gICAgICAgIHRoaXMuc3Bhd25GYWlsdXJlTm9kZSgpO1xyXG4gICAgfVxyXG5cclxuICAgIHB1YmxpYyBvblN1YnN0YXRlQ29tcGxldGUoX3N0YXRlOiBBYnN0cmFjdFN0YXRlKTogdm9pZCB7XHJcbiAgICAgICAgaWYgKHRoaXMuc2Vjb25kYXJ5Tm9kZXMubGVuZ3RoICE9PSAwKSByZXR1cm4gdGhpcy5vblJlYWNoU2Vjb25kYXJ5Tm9kZSgpO1xyXG4gICAgICAgIGlmICh0aGlzLmN1cnJlbnRTdGFpcmNhc2VOb2RlKSByZXR1cm4gdGhpcy5vblJlYWNoU3RhaXJjYXNlTm9kZSgpO1xyXG5cclxuICAgICAgICB0aGlzLmJyb2FkY2FzdFNpZ25hbChcIm9uQ29tcGxldGVcIik7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBzdWJzY3JpYmVUb1BhdGhUb1RhcmdldFNpZ25hbHMocGF0aFRvVGFyZ2V0OiBQYXRoVG9UYXJnZXRQcm9jZWR1cmUpOiB2b2lkIHtcclxuICAgICAgICBwYXRoVG9UYXJnZXQuc3Vic2NyaWJlVG9TaWduYWwoXCJvblN0YXJ0U3RhaXJjYXNlXCIsICgpID0+IHRoaXMub25TdGFpcmNhc2VTaWduYWwoKSk7XHJcblxyXG4gICAgICAgIHBhdGhUb1RhcmdldC5zdWJzY3JpYmVUb1NpZ25hbChcIm9uU3R1Y2tcIiwgKCkgPT4ge1xyXG4gICAgICAgICAgICB0aGlzLnJlc2V0UGF0aCh0cnVlKTtcclxuICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGVudGVyUGF0aFRvVGFyZ2V0KCk6IHZvaWQge1xyXG4gICAgICAgIGNvbnN0IHBhdGhUb1RhcmdldCA9IHRoaXMuZ2V0U3Vic3RhdGUoUGF0aFRvVGFyZ2V0UHJvY2VkdXJlKTtcclxuICAgICAgICBwYXRoVG9UYXJnZXQuc2V0Q2FuUGxhY2VCbG9ja3ModGhpcy5jYW5QbGFjZUJsb2Nrcyk7XHJcbiAgICAgICAgcGF0aFRvVGFyZ2V0LnNldENhbkJyZWFrQmxvY2tzKHRoaXMuY2FuQnJlYWtCbG9ja3MpO1xyXG4gICAgICAgIHRoaXMuc2V0U3Vic3RhdGUocGF0aFRvVGFyZ2V0KTtcclxuICAgICAgICB0aGlzLnN1YnNjcmliZVRvUGF0aFRvVGFyZ2V0U2lnbmFscyhwYXRoVG9UYXJnZXQpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgb25SZWFjaFNlY29uZGFyeU5vZGUoKTogdm9pZCB7XHJcbiAgICAgICAgY29uc3Qgbm9kZSA9IHRoaXMuc2Vjb25kYXJ5Tm9kZXMuc2hpZnQoKSE7XHJcbiAgICAgICAgaWYgKG5vZGUuaXNWYWxpZCkgbm9kZS5yZW1vdmUoKTtcclxuXHJcbiAgICAgICAgdGhpcy51cGRhdGVUYXJnZXQoKTtcclxuICAgICAgICB0aGlzLmVudGVyUGF0aFRvVGFyZ2V0KCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSByZW1vdmVQcmltYXJ5Tm9kZSgpOiB2b2lkIHtcclxuICAgICAgICBpZiAoIXRoaXMucHJpbWFyeU5vZGUpIHJldHVybjtcclxuICAgICAgICBpZiAodGhpcy5wcmltYXJ5Tm9kZS5pc1ZhbGlkKSB0aGlzLnByaW1hcnlOb2RlLnJlbW92ZSgpO1xyXG4gICAgICAgIHRoaXMucHJpbWFyeU5vZGUgPSBudWxsO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgcmVtb3ZlQWxsU2Vjb25kYXJ5Tm9kZXMoKTogdm9pZCB7XHJcbiAgICAgICAgZm9yIChjb25zdCBub2RlIG9mIHRoaXMuc2Vjb25kYXJ5Tm9kZXMpIHtcclxuICAgICAgICAgICAgaWYgKG5vZGUuaXNWYWxpZCkgbm9kZS5yZW1vdmUoKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy5zZWNvbmRhcnlOb2RlcyA9IFtdO1xyXG4gICAgICAgIHRoaXMuY2xlYXJTdGFpcmNhc2UoKTtcclxuICAgIH1cclxuXHJcbiAgICBwcm90ZWN0ZWQgb25FeGl0KGV4aXRUeXBlOiBFeGl0VHlwZSk6IHZvaWQge1xyXG4gICAgICAgIGlmIChleGl0VHlwZSA9PT0gRXhpdFR5cGUuU2h1dGRvd24pIHJldHVybjtcclxuXHJcbiAgICAgICAgdGhpcy5yZW1vdmVBbGxTZWNvbmRhcnlOb2RlcygpO1xyXG4gICAgICAgIHRoaXMuc2V0UHJpbWFyeUxvY2F0aW9uKG51bGwpO1xyXG5cclxuICAgICAgICBpZiAoZXhpdFR5cGUgPT09IEV4aXRUeXBlLlJlbW92ZSkgcmV0dXJuO1xyXG4gICAgICAgIHRoaXMucmVzZXRQYXRoKGZhbHNlKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyNyZWdpb24gU3RhaXJjYXNlXHJcblxyXG4gICAgcHJpdmF0ZSBvblN0YWlyY2FzZVNpZ25hbCgpOiB2b2lkIHtcclxuICAgICAgICBpZiAodGhpcy5jdXJyZW50U3RhaXJjYXNlTm9kZT8uaXNWYWxpZCkgcmV0dXJuO1xyXG5cclxuICAgICAgICB0aGlzLmluaXRpYXRlU3RhaXJjYXNlKCk7XHJcbiAgICAgICAgdGhpcy51cGRhdGVUYXJnZXQoKTtcclxuXHJcbiAgICAgICAgaWYgKHRoaXMuY3VycmVudFN0YWlyY2FzZU5vZGUpIHtcclxuICAgICAgICAgICAgdGhpcy5nZXRTdWJzdGF0ZShQYXRoVG9UYXJnZXRQcm9jZWR1cmUpLnNldENhblN0YXJ0U3RhaXJjYXNlKGZhbHNlKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBvblJlYWNoU3RhaXJjYXNlTm9kZSgpOiB2b2lkIHtcclxuICAgICAgICBpZiAodGhpcy5jdXJyZW50U3RhaXJjYXNlTm9kZT8uaXNWYWxpZCkgdGhpcy5jdXJyZW50U3RhaXJjYXNlTm9kZS5yZW1vdmUoKTtcclxuICAgICAgICB0aGlzLmN1cnJlbnRTdGFpcmNhc2VOb2RlID0gbnVsbDtcclxuXHJcbiAgICAgICAgdGhpcy5hZHZhbmNlU3RhaXJjYXNlKCk7XHJcbiAgICAgICAgdGhpcy51cGRhdGVUYXJnZXQoKTtcclxuICAgICAgICB0aGlzLmVudGVyUGF0aFRvVGFyZ2V0KCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBpbml0aWF0ZVN0YWlyY2FzZSgpOiB2b2lkIHtcclxuICAgICAgICBpZiAoIXRoaXMucHJpbWFyeUxvY2F0aW9uKSByZXR1cm47XHJcblxyXG4gICAgICAgIGNvbnN0IGVudGl0eUxvY2F0aW9uID0gdGhpcy5jb250ZXh0LmdldFZhbHVlKExvY2F0aW9uVmFyKS5jbG9uZSgpO1xyXG4gICAgICAgIGlmIChlbnRpdHlMb2NhdGlvbi55IDw9IHRoaXMucHJpbWFyeUxvY2F0aW9uLnkpIHJldHVybjtcclxuXHJcbiAgICAgICAgY29uc3QgaG9yaXpvbnRhbCA9IG5ldyBWMih0aGlzLnByaW1hcnlMb2NhdGlvbi54IC0gZW50aXR5TG9jYXRpb24ueCwgdGhpcy5wcmltYXJ5TG9jYXRpb24ueiAtIGVudGl0eUxvY2F0aW9uLnopO1xyXG4gICAgICAgIGNvbnN0IGhvcml6b250YWxEaXN0ID0gaG9yaXpvbnRhbC5sZW5ndGgoKTtcclxuICAgICAgICBjb25zdCB2ZXJ0aWNhbERpc3QgPSBlbnRpdHlMb2NhdGlvbi55IC0gdGhpcy5wcmltYXJ5TG9jYXRpb24ueTtcclxuXHJcbiAgICAgICAgaWYgKGhvcml6b250YWxEaXN0ID09PSAwKSB7XHJcbiAgICAgICAgICAgIC8vIERlZmF1bHQgdG8gd2Fsa2luZyBub3J0aCBpZiBkaXJlY3RseSBhYm92ZSB0aGUgcHJpbWFyeSBsb2NhdGlvblxyXG4gICAgICAgICAgICB0aGlzLnN0YWlyY2FzZURpcmVjdGlvbiA9IG5ldyBWMigwLCAtMSk7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgdGhpcy5zdGFpcmNhc2VEaXJlY3Rpb24gPSBob3Jpem9udGFsLm5vcm1hbGl6ZSgpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdGhpcy5uZXh0U3RhaXJjYXNlU3RlcElzRG93biA9IHRydWU7XHJcbiAgICAgICAgY29uc3Qgc3RhcnQgPSBlbnRpdHlMb2NhdGlvbi5jbG9uZSgpO1xyXG5cclxuICAgICAgICBpZiAoaG9yaXpvbnRhbERpc3QgPiB2ZXJ0aWNhbERpc3QpIHtcclxuICAgICAgICAgICAgLy8gTW9yZSBob3Jpem9udGFsIHRoYW4gdmVydGljYWw6IHdhbGsgdG93YXJkIHRhcmdldCB1bnRpbCBoRGlzdCA9PSB2RGlzdCwgdGhlbiBzdGFpcmNhc2VcclxuICAgICAgICAgICAgY29uc3QgZXF1YWxpemVEaXN0ID0gaG9yaXpvbnRhbERpc3QgLSB2ZXJ0aWNhbERpc3Q7XHJcbiAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IHRoaXMuZ2V0QmVzdFN0YWlyY2FzZURpcmVjdGlvbihlbnRpdHlMb2NhdGlvbiwgZXF1YWxpemVEaXN0LCB0aGlzLnN0YWlyY2FzZURpcmVjdGlvbik7XHJcbiAgICAgICAgICAgIGlmIChyZXN1bHQpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuc3RhaXJjYXNlRGlyZWN0aW9uID0gcmVzdWx0LmRpcmVjdGlvbjtcclxuICAgICAgICAgICAgICAgIHN0YXJ0LnggPSByZXN1bHQueDtcclxuICAgICAgICAgICAgICAgIHN0YXJ0LnogPSByZXN1bHQuejtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgdGhpcy5zdGFpcmNhc2VMb2NhdGlvbiA9IHN0YXJ0O1xyXG4gICAgICAgICAgICB0aGlzLnNwYXduU3RhaXJjYXNlTm9kZSh0aGlzLnN0YWlyY2FzZUxvY2F0aW9uKTtcclxuICAgICAgICB9IGVsc2UgaWYgKGhvcml6b250YWxEaXN0IDwgdmVydGljYWxEaXN0KSB7XHJcbiAgICAgICAgICAgIC8vIE1vcmUgdmVydGljYWwgdGhhbiBob3Jpem9udGFsOiBvdmVyc2hvb3QgcGFzdCB0YXJnZXQgdW50aWwgaERpc3QgPT0gdkRpc3QsIHRoZW4gc3RhaXJjYXNlIGJhY2tcclxuICAgICAgICAgICAgY29uc3Qgb3ZlcnNob290RGlzdCA9IHZlcnRpY2FsRGlzdCAtIGhvcml6b250YWxEaXN0O1xyXG4gICAgICAgICAgICBjb25zdCBvdmVyc2hvb3RPcmlnaW4gPSBuZXcgVjModGhpcy5wcmltYXJ5TG9jYXRpb24ueCwgc3RhcnQueSwgdGhpcy5wcmltYXJ5TG9jYXRpb24ueikuc2V0RGltZW5zaW9uKG92ZXJ3b3JsZCk7XHJcbiAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IHRoaXMuZ2V0QmVzdFN0YWlyY2FzZURpcmVjdGlvbihvdmVyc2hvb3RPcmlnaW4sIG92ZXJzaG9vdERpc3QsIHRoaXMuc3RhaXJjYXNlRGlyZWN0aW9uKTtcclxuICAgICAgICAgICAgaWYgKHJlc3VsdCkge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5zdGFpcmNhc2VEaXJlY3Rpb24gPSByZXN1bHQuZGlyZWN0aW9uLm11bHRpcGx5KC0xKTtcclxuICAgICAgICAgICAgICAgIHN0YXJ0LnggPSByZXN1bHQueDtcclxuICAgICAgICAgICAgICAgIHN0YXJ0LnogPSByZXN1bHQuejtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgdGhpcy5zdGFpcmNhc2VMb2NhdGlvbiA9IHN0YXJ0O1xyXG4gICAgICAgICAgICB0aGlzLnNwYXduU3RhaXJjYXNlTm9kZSh0aGlzLnN0YWlyY2FzZUxvY2F0aW9uKTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAvLyBoRGlzdCA9PSB2RGlzdDogc3RhcnQgc3RhaXJjYXNpbmcgZnJvbSBjdXJyZW50IHBvc2l0aW9uXHJcbiAgICAgICAgICAgIHRoaXMuc3RhaXJjYXNlTG9jYXRpb24gPSBzdGFydDtcclxuICAgICAgICAgICAgdGhpcy5hZHZhbmNlU3RhaXJjYXNlKCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgYWR2YW5jZVN0YWlyY2FzZSgpOiB2b2lkIHtcclxuICAgICAgICBpZiAoIXRoaXMucHJpbWFyeUxvY2F0aW9uIHx8ICF0aGlzLnN0YWlyY2FzZUxvY2F0aW9uIHx8ICF0aGlzLnN0YWlyY2FzZURpcmVjdGlvbikgcmV0dXJuO1xyXG5cclxuICAgICAgICBpZiAodGhpcy5uZXh0U3RhaXJjYXNlU3RlcElzRG93bikge1xyXG4gICAgICAgICAgICB0aGlzLnN0YWlyY2FzZVN0ZXBEb3duKCk7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgdGhpcy5zdGFpcmNhc2VTdGVwRm9yd2FyZCgpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHN0YWlyY2FzZVN0ZXBEb3duKCk6IHZvaWQge1xyXG4gICAgICAgIGNvbnN0IGlzU3RpbGxBYm92ZVRhcmdldCA9IHRoaXMuc3RhaXJjYXNlTG9jYXRpb24hLnkgPiB0aGlzLnByaW1hcnlMb2NhdGlvbiEueTtcclxuICAgICAgICBpZiAoaXNTdGlsbEFib3ZlVGFyZ2V0KSB7XHJcbiAgICAgICAgICAgIHRoaXMuc3RhaXJjYXNlTG9jYXRpb24hLnN1YnRyYWN0KDAsIDEsIDApO1xyXG4gICAgICAgICAgICB0aGlzLm5leHRTdGFpcmNhc2VTdGVwSXNEb3duID0gZmFsc2U7XHJcbiAgICAgICAgICAgIHRoaXMuc3Bhd25TdGFpcmNhc2VOb2RlKHRoaXMuc3RhaXJjYXNlTG9jYXRpb24hKTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICB0aGlzLmNsZWFyU3RhaXJjYXNlKCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgc3RhaXJjYXNlU3RlcEZvcndhcmQoKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5uZXh0U3RhaXJjYXNlU3RlcElzRG93biA9IHRydWU7XHJcblxyXG4gICAgICAgIGNvbnN0IHJlbWFpbmluZ0hvcml6b250YWwgPSBuZXcgVjIoXHJcbiAgICAgICAgICAgIHRoaXMucHJpbWFyeUxvY2F0aW9uIS54IC0gdGhpcy5zdGFpcmNhc2VMb2NhdGlvbiEueCxcclxuICAgICAgICAgICAgdGhpcy5wcmltYXJ5TG9jYXRpb24hLnogLSB0aGlzLnN0YWlyY2FzZUxvY2F0aW9uIS56XHJcbiAgICAgICAgKTtcclxuICAgICAgICBjb25zdCByZW1haW5pbmdIb3Jpem9udGFsRGlzdCA9IHJlbWFpbmluZ0hvcml6b250YWwubGVuZ3RoKCk7XHJcblxyXG4gICAgICAgIGlmIChyZW1haW5pbmdIb3Jpem9udGFsRGlzdCA+IDEpIHtcclxuICAgICAgICAgICAgY29uc3QgY2FuZGlkYXRlTG9jYXRpb24gPSB0aGlzLnN0YWlyY2FzZUxvY2F0aW9uIS5jbG9uZSgpLmFkZCh0aGlzLnN0YWlyY2FzZURpcmVjdGlvbiEueCwgMCwgdGhpcy5zdGFpcmNhc2VEaXJlY3Rpb24hLnopO1xyXG4gICAgICAgICAgICBpZiAoIUJsb2NrVXRpbHMuaGFzU29saWRHcm91bmRCZWxvdyhjYW5kaWRhdGVMb2NhdGlvbikpIHtcclxuICAgICAgICAgICAgICAgIC8vIENhbid0IGdvIGhvcml6b250YWwgLSB0cnkgc3RlcHBpbmcgZG93blxyXG4gICAgICAgICAgICAgICAgdGhpcy5zdGFpcmNhc2VTdGVwRG93bigpO1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHRoaXMuc3RhaXJjYXNlTG9jYXRpb24gPSBjYW5kaWRhdGVMb2NhdGlvbjtcclxuICAgICAgICAgICAgdGhpcy5zcGF3blN0YWlyY2FzZU5vZGUodGhpcy5zdGFpcmNhc2VMb2NhdGlvbiEpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIC8vIEFscmVhZHkgaG9yaXpvbnRhbGx5IGFsaWduZWQ7IHByb2NlZWQgd2l0aCB0aGUgbmV4dCBkb3duIHN0ZXBcclxuICAgICAgICAgICAgdGhpcy5zdGFpcmNhc2VTdGVwRG93bigpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGdldEJlc3RTdGFpcmNhc2VEaXJlY3Rpb24ob3JpZ2luOiBWMywgZGlzdGFuY2U6IG51bWJlciwgcHJlZmVycmVkOiBWMik6IHsgZGlyZWN0aW9uOiBWMjsgeDogbnVtYmVyOyB6OiBudW1iZXIgfSB8IG51bGwge1xyXG4gICAgICAgIGNvbnN0IGNhbmRpZGF0ZXMgPSBbcHJlZmVycmVkLCAuLi5EaXJlY3Rpb25VdGlsLmNhcmRpbmFsRGlyZWN0aW9uc107XHJcbiAgICAgICAgZm9yIChjb25zdCBkaXJlY3Rpb24gb2YgY2FuZGlkYXRlcykge1xyXG4gICAgICAgICAgICBjb25zdCB0YXJnZXRYID0gb3JpZ2luLnggKyBkaXJlY3Rpb24ueCAqIGRpc3RhbmNlO1xyXG4gICAgICAgICAgICBjb25zdCB0YXJnZXRaID0gb3JpZ2luLnogKyBkaXJlY3Rpb24ueiAqIGRpc3RhbmNlO1xyXG4gICAgICAgICAgICBjb25zdCB0YXJnZXRMb2NhdGlvbiA9IG5ldyBWMyh0YXJnZXRYLCBvcmlnaW4ueSwgdGFyZ2V0Wikuc2V0RGltZW5zaW9uKG92ZXJ3b3JsZCk7XHJcbiAgICAgICAgICAgIGlmIChCbG9ja1V0aWxzLmhhc1NvbGlkR3JvdW5kQmVsb3codGFyZ2V0TG9jYXRpb24pKSB7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4geyBkaXJlY3Rpb246IGRpcmVjdGlvbiwgeDogdGFyZ2V0WCwgejogdGFyZ2V0WiB9O1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgc3Bhd25TdGFpcmNhc2VOb2RlKGxvY2F0aW9uOiBWMyk6IHZvaWQge1xyXG4gICAgICAgIGlmICghbG9jYXRpb24uZGltZW5zaW9uKSB0aHJvdyBuZXcgRXJyb3IoXCJJbnZhbGlkIGxvY2F0aW9uIGRpbWVuc2lvblwiKTtcclxuXHJcbiAgICAgICAgaWYgKHRoaXMuY3VycmVudFN0YWlyY2FzZU5vZGU/LmlzVmFsaWQpIHRoaXMuY3VycmVudFN0YWlyY2FzZU5vZGUucmVtb3ZlKCk7XHJcblxyXG4gICAgICAgIGlmICghbG9jYXRpb24uaXNMb2FkZWQoKSkgcmV0dXJuO1xyXG4gICAgICAgIGNvbnN0IG5vZGUgPSBFbnRpdHlVdGlsLnNwYXduRW50aXR5KFwiZ20xX3NreTpub2RlXCIsIGxvY2F0aW9uLmdyaWQoKSwgbG9jYXRpb24uZGltZW5zaW9uISk7XHJcbiAgICAgICAgRW50aXR5U3RvcmUuc2V0T3duZXIobm9kZSwgdGhpcy5jb250ZXh0LmVudGl0eSk7XHJcblxyXG4gICAgICAgIG5vZGUuc2V0UHJvcGVydHkoXCJnbTFfc2t5Om5vZGVcIiwgdGhpcy5ub2RlSW5kZXgpO1xyXG4gICAgICAgIG5vZGUuc2V0UHJvcGVydHkoXCJnbTFfc2t5OnR5cGVcIiwgMik7XHJcbiAgICAgICAgbm9kZS5hZGRUYWcoXCJkaXNhYmxlZFwiKTtcclxuXHJcbiAgICAgICAgdGhpcy5jdXJyZW50U3RhaXJjYXNlTm9kZSA9IG5vZGU7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBjbGVhclN0YWlyY2FzZSgpOiB2b2lkIHtcclxuICAgICAgICBpZiAodGhpcy5jdXJyZW50U3RhaXJjYXNlTm9kZT8uaXNWYWxpZCkgdGhpcy5jdXJyZW50U3RhaXJjYXNlTm9kZS5yZW1vdmUoKTtcclxuXHJcbiAgICAgICAgdGhpcy5jdXJyZW50U3RhaXJjYXNlTm9kZSA9IG51bGw7XHJcbiAgICAgICAgdGhpcy5zdGFpcmNhc2VMb2NhdGlvbiA9IG51bGw7XHJcbiAgICAgICAgdGhpcy5zdGFpcmNhc2VEaXJlY3Rpb24gPSBudWxsO1xyXG4gICAgICAgIHRoaXMuZ2V0U3Vic3RhdGUoUGF0aFRvVGFyZ2V0UHJvY2VkdXJlKS5zZXRDYW5TdGFydFN0YWlyY2FzZSh0cnVlKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGFzeW5jIHJlc2V0UGF0aChyZWNlbnRlcjogYm9vbGVhbiA9IGZhbHNlKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICAgICAgY29uc3QgZW50aXR5ID0gdGhpcy5jb250ZXh0LmVudGl0eTtcclxuICAgICAgICBpZiAoIWVudGl0eS5pc1ZhbGlkKSByZXR1cm47XHJcblxyXG4gICAgICAgIGNvbnN0IGR1cmF0aW9uID0gUGF0aFRvVGFyZ2V0UHJvY2VkdXJlRGF0YS5QYXRoUmVzZXRTbG93bmVzc0R1cmF0aW9uO1xyXG4gICAgICAgIGVudGl0eS5hZGRFZmZlY3QoXCJtaW5lY3JhZnQ6c2xvd25lc3NcIiwgZHVyYXRpb24sIHsgYW1wbGlmaWVyOiAyNTUsIHNob3dQYXJ0aWNsZXM6IGZhbHNlIH0pO1xyXG5cclxuICAgICAgICBpZiAocmVjZW50ZXIpIHtcclxuICAgICAgICAgICAgY29uc3QgZmVldExvY2F0aW9uID0gVjMuZnJvbUVudGl0eShlbnRpdHksIG92ZXJ3b3JsZCk7XHJcbiAgICAgICAgICAgIGZlZXRMb2NhdGlvbi55ID0gTWF0aC5yb3VuZChmZWV0TG9jYXRpb24ueSk7XHJcbiAgICAgICAgICAgIGNvbnN0IGxvY2F0aW9uID0gZmVldExvY2F0aW9uLmdyaWQoKTtcclxuICAgICAgICAgICAgZW50aXR5LnRlbGVwb3J0KGxvY2F0aW9uKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGVudGl0eS50cmlnZ2VyRXZlbnQoXCJnbTFfc2t5OnJlc2V0X3BhdGguYWRkXCIpO1xyXG4gICAgICAgIGF3YWl0IEFzeW5jVXRpbHMuZGVsYXkoMSk7XHJcblxyXG4gICAgICAgIGlmICghZW50aXR5LmlzVmFsaWQpIHJldHVybjtcclxuICAgICAgICBlbnRpdHkudHJpZ2dlckV2ZW50KFwiZ20xX3NreTpyZXNldF9wYXRoLnJlbW92ZVwiKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFNwYXducyBhIGZhaWx1cmUgbm9kZSBpbiB0aGUgZGlyZWN0aW9uIG9mIHRoZSBwcmltYXJ5IGxvY2F0aW9uIHRvIGFsbG93IHRoZSBlbnRpdHkgdG8gcmVyb3V0ZVxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIHNwYXduRmFpbHVyZU5vZGUoKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5yZW1vdmVBbGxTZWNvbmRhcnlOb2RlcygpO1xyXG5cclxuICAgICAgICBjb25zdCBjZW50ZXIgPSB0aGlzLmNvbnRleHQuZ2V0VmFsdWUoTG9jYXRpb25WYXIpLiQuZ3JpZCgpO1xyXG4gICAgICAgIGNvbnN0IHRhcmdldERpcmVjdGlvbiA9IHRoaXMucHJpbWFyeUxvY2F0aW9uIS4kLnN1YnRyYWN0KGNlbnRlcikubm9ybWFsaXplKCk7XHJcbiAgICAgICAgY29uc3QgcGVycGVuZGljdWxhckRpcmVjdGlvbiA9IHRhcmdldERpcmVjdGlvbi4kLnJvdGF0ZVlhdyhNYXRoLlBJIC8gMik7XHJcblxyXG4gICAgICAgIC8vIENyZWF0ZSB2b2x1bWUgZnJvbSB0aGUgQUlQIGluIHRoZSBkaXJlY3Rpb24gb2YgdGhlIHRhcmdldFxyXG4gICAgICAgIGNvbnN0IG1heExlbmd0aCA9IFBhdGhUb05vZGVQcm9jZWR1cmVEYXRhLkZhaWx1cmVOb2RlT2Zmc2V0TWF4TGVuZ3RoO1xyXG4gICAgICAgIGNvbnN0IG1pbk9mZnNldCA9IHBlcnBlbmRpY3VsYXJEaXJlY3Rpb24uJC5tdWx0aXBseSgtbWF4TGVuZ3RoKTtcclxuICAgICAgICBjb25zdCBtYXhPZmZzZXQgPSBwZXJwZW5kaWN1bGFyRGlyZWN0aW9uLiQubXVsdGlwbHkobWF4TGVuZ3RoKS5hZGQodGFyZ2V0RGlyZWN0aW9uLiQubXVsdGlwbHkobWF4TGVuZ3RoKSk7XHJcbiAgICAgICAgY29uc3Qgbm9kZVZvbHVtZSA9IG5ldyBWb2x1bWUobWluT2Zmc2V0LCBtYXhPZmZzZXQpLm9mZnNldChjZW50ZXIpO1xyXG5cclxuICAgICAgICAvLyBHZXQgYSByYW5kb20gcG9pbnQgaW4gdGhlIHZvbHVtZVxyXG4gICAgICAgIGNvbnN0IG5vZGVMb2NhdGlvbiA9IG5vZGVWb2x1bWUucmFuZG9tUG9pbnQoKS5ncmlkKCk7XHJcbiAgICAgICAgbm9kZUxvY2F0aW9uLnNldERpbWVuc2lvbihvdmVyd29ybGQpO1xyXG5cclxuICAgICAgICAvLyBFbnN1cmUgdGhlIG5vZGUgaXMgbm90IGJlbG93IHRoZSBwcmltYXJ5IGxvY2F0aW9uIHRvIGF2b2lkIGlzc3VlcyB3aXRoIHN0YWlyY2FzZXNcclxuICAgICAgICBpZiAobm9kZUxvY2F0aW9uLnkgPCB0aGlzLnByaW1hcnlMb2NhdGlvbiEueSkgbm9kZUxvY2F0aW9uLnkgPSB0aGlzLnByaW1hcnlMb2NhdGlvbiEueTtcclxuXHJcbiAgICAgICAgLy8gU3Bhd24gdGhlIHNlY29uZGFyeSBub2RlXHJcbiAgICAgICAgdGhpcy5hZGRTZWNvbmRhcnlOb2RlKG5vZGVMb2NhdGlvbik7XHJcblxyXG4gICAgICAgIC8vIFJlc2V0IHRoZSBwYXRoZmluZGluZyBzdGF0ZVxyXG4gICAgICAgIHRoaXMuY3VycmVudFN1YnN0YXRlIS5lbnRlcigpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vI2VuZHJlZ2lvblxyXG59XHJcbiJdLCJuYW1lcyI6WyJMb2NhdGlvblZhciIsIlBhdGhUb05vZGVQcm9jZWR1cmVEYXRhIiwiUGF0aFRvVGFyZ2V0UHJvY2VkdXJlRGF0YSIsIlYyIiwiVjMiLCJWb2x1bWUiLCJDb21wb3NpdGVTdGF0ZSIsIkV4aXRUeXBlIiwiQXN5bmNVdGlscyIsIkJsb2NrVXRpbHMiLCJEaXJlY3Rpb25VdGlsIiwiUGF0aFRvVGFyZ2V0UHJvY2VkdXJlIiwicmVnaXN0cnkiLCJQYXRoVG9Ob2RlUHJvY2VkdXJlIiwic2V0UHJpbWFyeUxvY2F0aW9uIiwibG9jYXRpb24iLCJwcmltYXJ5TG9jYXRpb24iLCJlcXVhbHMiLCJpc0FjdGl2ZSIsIm9uUHJpbWFyeUxvY2F0aW9uQ2hhbmdlZCIsInNldFdpdGhpblJhZGl1cyIsInJhZGl1cyIsIndpdGhpblJhZGl1cyIsInNldENhblBsYWNlQmxvY2tzIiwiY2FuUGxhY2UiLCJjYW5QbGFjZUJsb2NrcyIsInNldENhbkJyZWFrQmxvY2tzIiwiY2FuQnJlYWsiLCJjYW5CcmVha0Jsb2NrcyIsInJlbW92ZVByaW1hcnlOb2RlIiwicHJpbWFyeU5vZGUiLCJpc1ZhbGlkIiwibm9kZUNvbXBvbmVudCIsImdldE1vYkNvbXBvbmVudCIsInVwZGF0ZUxvY2F0aW9uIiwidGVsZXBvcnQiLCJhZGRQcmltYXJ5Tm9kZSIsInNlY29uZGFyeU5vZGVzIiwibGVuZ3RoIiwidXBkYXRlVGFyZ2V0Iiwib25FbnRlciIsIm1lbW9yeSIsInJlc3RvcmVNZW1vcnkiLCJwYXRoVG9UYXJnZXQiLCJnZXRTdWJzdGF0ZSIsInN1YnNjcmliZVRvUGF0aFRvVGFyZ2V0U2lnbmFscyIsIldpdGhpblJhZGl1cyIsImJyb2FkY2FzdFNpZ25hbCIsInN0YWlyY2FzZUxvY2F0aW9uIiwic3RhaXJjYXNlRGlyZWN0aW9uIiwic3Bhd25TdGFpcmNhc2VOb2RlIiwic2V0Q2FuU3RhcnRTdGFpcmNhc2UiLCJ0YXJnZXRMb2NhdGlvbiIsImZyb21TZXJpYWxpemVkTG9jYXRpb24iLCJ4IiwieiIsIm5leHRTdGFpcmNhc2VTdGVwSXNEb3duIiwidW5kZWZpbmVkIiwiY3JlYXRlTWVtb3J5IiwidG9KU09OIiwiZGltZW5zaW9uIiwic2V0RGltZW5zaW9uIiwib3ZlcndvcmxkIiwiZ2xvYmFsTm9kZUluZGV4IiwiTWF4Tm9kZUluZGV4Iiwibm9kZUluZGV4IiwiaXNMb2FkZWQiLCJub2RlIiwiRW50aXR5VXRpbCIsInNwYXduRW50aXR5IiwiRW50aXR5U3RvcmUiLCJzZXRPd25lciIsImNvbnRleHQiLCJlbnRpdHkiLCJzZXRQcm9wZXJ0eSIsImFkZFRhZyIsImFkZFNlY29uZGFyeU5vZGUiLCJFcnJvciIsInB1c2giLCJmaWx0ZXIiLCJuIiwiY3VycmVudFN0YWlyY2FzZU5vZGUiLCJuZXh0U2Vjb25kYXJ5IiwibmV4dFN0YWlyY2FzZSIsInByaW1hcnkiLCJyZW1vdmVUYWciLCJzZXRUYXJnZXQiLCJvblN1YnN0YXRlRmFpbHVyZSIsIl9zdGF0ZSIsInNwYXduRmFpbHVyZU5vZGUiLCJvblN1YnN0YXRlQ29tcGxldGUiLCJvblJlYWNoU2Vjb25kYXJ5Tm9kZSIsIm9uUmVhY2hTdGFpcmNhc2VOb2RlIiwic3Vic2NyaWJlVG9TaWduYWwiLCJvblN0YWlyY2FzZVNpZ25hbCIsInJlc2V0UGF0aCIsImVudGVyUGF0aFRvVGFyZ2V0Iiwic2V0U3Vic3RhdGUiLCJzaGlmdCIsInJlbW92ZSIsInJlbW92ZUFsbFNlY29uZGFyeU5vZGVzIiwiY2xlYXJTdGFpcmNhc2UiLCJvbkV4aXQiLCJleGl0VHlwZSIsIlNodXRkb3duIiwiUmVtb3ZlIiwiaW5pdGlhdGVTdGFpcmNhc2UiLCJhZHZhbmNlU3RhaXJjYXNlIiwiZW50aXR5TG9jYXRpb24iLCJnZXRWYWx1ZSIsImNsb25lIiwieSIsImhvcml6b250YWwiLCJob3Jpem9udGFsRGlzdCIsInZlcnRpY2FsRGlzdCIsIm5vcm1hbGl6ZSIsInN0YXJ0IiwiZXF1YWxpemVEaXN0IiwicmVzdWx0IiwiZ2V0QmVzdFN0YWlyY2FzZURpcmVjdGlvbiIsImRpcmVjdGlvbiIsIm92ZXJzaG9vdERpc3QiLCJvdmVyc2hvb3RPcmlnaW4iLCJtdWx0aXBseSIsInN0YWlyY2FzZVN0ZXBEb3duIiwic3RhaXJjYXNlU3RlcEZvcndhcmQiLCJpc1N0aWxsQWJvdmVUYXJnZXQiLCJzdWJ0cmFjdCIsInJlbWFpbmluZ0hvcml6b250YWwiLCJyZW1haW5pbmdIb3Jpem9udGFsRGlzdCIsImNhbmRpZGF0ZUxvY2F0aW9uIiwiYWRkIiwiaGFzU29saWRHcm91bmRCZWxvdyIsIm9yaWdpbiIsImRpc3RhbmNlIiwicHJlZmVycmVkIiwiY2FuZGlkYXRlcyIsImNhcmRpbmFsRGlyZWN0aW9ucyIsInRhcmdldFgiLCJ0YXJnZXRaIiwiZ3JpZCIsInJlY2VudGVyIiwiZHVyYXRpb24iLCJQYXRoUmVzZXRTbG93bmVzc0R1cmF0aW9uIiwiYWRkRWZmZWN0IiwiYW1wbGlmaWVyIiwic2hvd1BhcnRpY2xlcyIsImZlZXRMb2NhdGlvbiIsImZyb21FbnRpdHkiLCJNYXRoIiwicm91bmQiLCJ0cmlnZ2VyRXZlbnQiLCJkZWxheSIsImNlbnRlciIsIiQiLCJ0YXJnZXREaXJlY3Rpb24iLCJwZXJwZW5kaWN1bGFyRGlyZWN0aW9uIiwicm90YXRlWWF3IiwiUEkiLCJtYXhMZW5ndGgiLCJGYWlsdXJlTm9kZU9mZnNldE1heExlbmd0aCIsIm1pbk9mZnNldCIsIm1heE9mZnNldCIsIm5vZGVWb2x1bWUiLCJvZmZzZXQiLCJub2RlTG9jYXRpb24iLCJyYW5kb21Qb2ludCIsImN1cnJlbnRTdWJzdGF0ZSIsImVudGVyIiwidGltZW91dER1cmF0aW9uIiwiVGltZW91dER1cmF0aW9uIiwiZGVmaW5pdGlvbiIsImlkZW50aWZpZXIiLCJwcmlvcml0eSIsIlByaW9yaXR5IiwiaW5pdGlhbFN0YXRlIl0sIm1hcHBpbmdzIjoiQUFDQSxTQUFTQSxXQUFXLFFBQVEsK0JBQStCO0FBRTNELE9BQU9D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