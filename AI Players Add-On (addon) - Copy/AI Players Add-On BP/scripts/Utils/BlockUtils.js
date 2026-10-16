import { BlockVolume, Direction, LiquidType } from "@minecraft/server";
import AIPData from "Data/AIPData";
import BlockHardnessData from "Data/BlockHardnessData";
import BlockMiningData from "Data/BlockMiningData";
import BlockPlacementData from "Data/BlockPlacementData";
import { InventoryData } from "Data/InventoryData";
import V3 from "Helpers/Vectors/V3";
class BlockUtils {
    /**
     * Checks if a block is visible from a certain point.
     * @param point The point from which to check visibility.
     * @param block The block to check visibility for.
     * @param raycastOptions Optional raycast options to customize the visibility check.
     * @returns True if the block is visible from the point, false otherwise.
     */ static isBlockVisible(point, block, raycastOptions) {
        const blockCenter = V3.fromBlock(block, overworld).add(0.5);
        if (!point.dimension) throw new Error("Point must specify a dimension");
        if (blockCenter.dimension.id !== point.dimension.id) return false;
        const d = point.clone().subtract(blockCenter);
        // Back-face culling: only include faces whose normals point toward the point
        const faces = [
            ...d.z >= 0 ? [
                {
                    location: blockCenter.$.add(0, 0, 0.5),
                    direction: Direction.South
                }
            ] : [],
            ...d.z <= 0 ? [
                {
                    location: blockCenter.$.add(0, 0, -0.5),
                    direction: Direction.North
                }
            ] : [],
            ...d.y >= 0 ? [
                {
                    location: blockCenter.$.add(0, 0.5, 0),
                    direction: Direction.Up
                }
            ] : [],
            ...d.y <= 0 ? [
                {
                    location: blockCenter.$.add(0, -0.5, 0),
                    direction: Direction.Down
                }
            ] : [],
            ...d.x >= 0 ? [
                {
                    location: blockCenter.$.add(0.5, 0, 0),
                    direction: Direction.East
                }
            ] : [],
            ...d.x <= 0 ? [
                {
                    location: blockCenter.$.add(-0.5, 0, 0),
                    direction: Direction.West
                }
            ] : []
        ];
        // Sort faces distance to point so the closest face is tested first.
        faces.sort((a, b)=>point.distance(a.location) - point.distance(b.location));
        if (!raycastOptions) {
            raycastOptions = {
                includeLiquidBlocks: false,
                includePassableBlocks: true
            };
        }
        for (const face of faces){
            const directionToFace = face.location.clone().subtract(point).normalize();
            const result = point.dimension.getBlockFromRay(point, directionToFace, raycastOptions);
            if (!result) continue;
            if (result.face !== face.direction) continue;
            const hitLocation = V3.fromBlock(result.block, overworld);
            const sharesBlock = hitLocation.sharesBlockWith(blockCenter);
            // If one face is visible, the block is considered visible
            if (sharesBlock) return true;
        }
        return false;
    }
    /**
     * Checks if a point is within reach of a block.
     * @param point The point to check.
     * @param block The block to check against.
     * @param reach The maximum reach distance.
     * @returns True if the point is within reach of the block, false otherwise.
     */ static isWithinReach(point, block, reach) {
        const distance = point.distance(V3.fromBlock(block, false));
        return distance <= reach;
    }
    /** Checks if a block can be highlighted (interacted with) from the perspective of an entity, taking into account visibility, reachability, and whether the entity is grounded.
     * @param entity The entity from whose perspective to check.
     * @param block The block to check.
     * @returns True if the block can be highlighted, false otherwise.
     */ static canHighlightBlock(entity, block, reach = AIPData.ReachDistance) {
        if (!block) return false;
        const isGrounded = entity.isOnGround;
        if (!isGrounded) return false;
        const eyeLocation = V3.fromEntity(entity, overworld).add(0, AIPData.EyeLevel, 0);
        const isWithinReach = BlockUtils.isWithinReach(eyeLocation, block, reach);
        if (!isWithinReach) return false;
        return BlockUtils.isBlockVisible(eyeLocation, block, {
            includePassableBlocks: false
        });
    }
    /**
     * Computes a vein of locations around the specified block.
     * @remarks a vein is considered to be nearby blocks of the same type
     * @param block The block to compute the vein for.
     * @param squareRadius The radius to search for related blocks.
     * @param maxSize The maximum number of blocks to include in the vein.
     * @returns An array of locations that are part of the vein.
     */ static computeVein(block, squareRadius = 4, maxSize) {
        const blockLocation = V3.fromBlock(block, overworld);
        const blocksInRegion = this.getBlocksInVolume(blockLocation, squareRadius, {
            includeTypes: [
                block.typeId
            ]
        });
        const vein = [];
        for (const location of blocksInRegion.getBlockLocationIterator()){
            vein.push(new V3(location).setDimension(blockLocation.dimension));
            if (maxSize && vein.length >= maxSize) break;
        }
        return vein;
    }
    /**
     * Gets all blocks in a cubic volume centered around a point.
     * @param center The center point of the volume.
     * @param squareRadius The half-length of the sides of the cubic volume.
     * @param query The filter to apply when retrieving blocks.
     * @returns A ListBlockVolume of block locations that are within the specified volume.
     */ static getBlocksInVolume(center, squareRadius, query) {
        const from = new V3(center);
        const min = from.clone().subtract(squareRadius);
        const max = from.clone().add(squareRadius);
        const volume = new BlockVolume(min, max);
        const dimension = center.dimension ?? overworld;
        return dimension.getBlocks(volume, query, true);
    }
    /**
     * Gets the closest block to a point from a list of blocks.
     * @param point The point to check against.
     * @param blocks The list of blocks to search.
     * @returns The closest block to the point, or null if no blocks are found.
     */ static getClosestBlock(point, blocks) {
        let closestBlock = null;
        let closestDist = Infinity;
        for (const block of blocks){
            const dist = V3.fromBlock(block, false).distance(point);
            if (dist >= closestDist) continue;
            closestBlock = block;
            closestDist = dist;
        }
        return closestBlock;
    }
    static sortBlocksByDistance(point, blocks) {
        return blocks.map((block)=>({
                block,
                dist: V3.fromBlock(block, false).distance(point)
            })).sort((a, b)=>a.dist - b.dist).map((entry)=>entry.block);
    }
    /**
     * Converts a 3D vector to a block.
     * @param location The 3D vector to convert.
     * @returns The block at the specified location, or null if no block is found.
     */ static fromV3(location) {
        const dimension = location.dimension ?? overworld;
        try {
            const block = dimension.getBlock(location);
            return block ?? null;
        } catch  {
            return null;
        }
    }
    /**
     * Checks if a block can be successfully harvested with a specified tool.
     * @param block The block to check.
     * @param tool The tool being used.
     * @returns True if the block can be successfully harvested with the specified tool, false otherwise.
     */ static canHarvestBlockWithTool(block, tool) {
        const toolIndex = InventoryData.ToolPriority.findIndex((tier)=>tool.type.id.includes(tier));
        const effectiveToolIndex = toolIndex === -1 ? InventoryData.ToolPriority.length : toolIndex;
        // Blocks which have the `is_pickaxe_item_destructible` tag but can be mined with any tool
        const isPickaxeExempt = BlockMiningData.PickaxeExemptions.has(block.typeId);
        if (isPickaxeExempt) return true;
        for (const [tag, requiredTier] of InventoryData.TierTags){
            if (!block.hasTag(tag)) continue;
            if (effectiveToolIndex > InventoryData.ToolPriority.indexOf(requiredTier)) return false;
        }
        return true;
    }
    /**
     * Computes the number of ticks it will take to break a block with a specified tool, taking into account the block's hardness and whether the tool can successfully harvest the block.
     * @param block The block to be broken.
     * @param tool The tool being used to break the block.
     * @param canHarvest Whether the tool can successfully harvest the block.
     * @returns The number of ticks it will take to break the block.
     */ static computeBreakDuration(block, tool, canHarvest) {
        const baseDuration = canHarvest ? InventoryData.BaseBreakDuration : InventoryData.BaseBreakDurationWithoutProperTool;
        const matchedTier = Object.keys(InventoryData.MiningEfficiency).find((tier)=>tool.type.id.includes(tier));
        const efficiencyMultiplier = matchedTier ? InventoryData.MiningEfficiency[matchedTier] : 1;
        const blockHardness = BlockHardnessData.get(block.typeId);
        const result = baseDuration * blockHardness / efficiencyMultiplier;
        // Return 0 (instant break) and -1 (indestructible)
        if (result <= 0) return result;
        //Return the number of ticks rounded up since partial ticks are not possible
        return Math.ceil(result);
    }
    /** Checks if a block is mineable.
     * @param block The block to check.
     * @returns True if the block is mineable, false otherwise.
     */ static isMineable(block) {
        return block !== null && !block.isAir && !block.isLiquid;
    }
    /**
     * Checks if a block is overrideable.
     * @param permutation The block to check.
     * @returns True if the block is overrideable, false otherwise.
     */ static isOverrideable(permutation, typeId) {
        if (!permutation) return false;
        typeId = typeId ?? permutation.type.id;
        if (BlockPlacementData.FluidBlocks.has(typeId)) return true;
        // Snow layers are overrideable until they form a full block (height 7)
        if (typeId === "minecraft:snow_layer") {
            return permutation.getState("height") < 7;
        }
        return BlockPlacementData.OverrideableBlocks.has(typeId);
    }
    /**
     * Checks if a location has solid (non-overrideable) ground below it.
     * @param location The location to check.
     * @returns True if there is solid ground below the location, false otherwise.
     */ static hasSolidGroundBelow(location) {
        const belowBlock = this.fromV3(location.clone().add(0, -1, 0));
        if (!belowBlock) return false;
        return !this.isOverrideable(belowBlock?.permutation ?? null);
    }
    /**
     * Checks if a block can support a torch being placed on it.
     * @param block The block to check.
     * @returns True if the block can support a torch, false otherwise.
     */ static canSupportTorch(block) {
        if (!block) return false;
        if (block.isAir || block.isLiquid) return false;
        if (BlockPlacementData.BlocksThatCannotSupportTorches.has(block.typeId)) return false;
        // Bottom-half slabs (both old and new state formats)
        if (block.permutation.getState("minecraft:vertical_half") === "bottom") return false;
        if (block.permutation.getState("top_slot_bit") === false) return false;
        // Stairs - only upside-down stairs (solid plane on top) can support torches
        if (block.typeId.endsWith("_stairs")) {
            return block.permutation.getState("upside_down_bit") === true;
        }
        return true;
    }
    /** Checks if a block is likely solid (not air, liquid, or easily destroyed).
     * @param permutation The block to check.
     * @returns True if the block is likely solid, false otherwise.
     * */ static isLikelySolid(permutation) {
        if (!permutation) return false;
        // Likely not solid if overrideable
        if (BlockUtils.isOverrideable(permutation)) return false;
        // Likely not solid if can be destroyed by water
        if (permutation.canBeDestroyedByLiquidSpread(LiquidType.Water)) return false;
        // Likely not solid if not liquid blocking
        if (!permutation.isLiquidBlocking(LiquidType.Water)) return false;
        // Likely not solid if waterlogged
        if (permutation.canContainLiquid(LiquidType.Water)) return false;
        // Otherwise, assume solid
        return true;
    }
    /** Checks if a block is likely to block mob pathfinding.
     * @param permutation The block to check.
     * @returns True if the block is likely to block navigation, false otherwise.
     * */ static isLikelyNavigationBlocking(permutation) {
        if (!permutation) return false;
        // Likely not navigation blocking if overrideable
        if (BlockUtils.isOverrideable(permutation)) return false;
        // Likely not navigation blocking if can be destroyed by water
        if (permutation.canBeDestroyedByLiquidSpread(LiquidType.Water)) return false;
        // Likely not navigation blocking if not liquid blocking
        if (!permutation.isLiquidBlocking(LiquidType.Water)) return false;
        // Otherwise, assume navigation blocking
        return true;
    }
    static getKey(block) {
        return `${block.typeId}:${JSON.stringify(block.permutation.getAllStates())}`;
    }
}
export { BlockUtils as default };

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkJsb2NrVXRpbHMudHMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHtcclxuICAgIEJsb2NrLFxyXG4gICAgQmxvY2tGaWx0ZXIsXHJcbiAgICBCbG9ja1Blcm11dGF0aW9uLFxyXG4gICAgQmxvY2tSYXljYXN0T3B0aW9ucyxcclxuICAgIEJsb2NrVm9sdW1lLFxyXG4gICAgRGlyZWN0aW9uLFxyXG4gICAgRW50aXR5LFxyXG4gICAgSXRlbVN0YWNrLFxyXG4gICAgTGlxdWlkVHlwZSxcclxuICAgIExpc3RCbG9ja1ZvbHVtZSxcclxufSBmcm9tIFwiQG1pbmVjcmFmdC9zZXJ2ZXJcIjtcclxuaW1wb3J0IEFJUERhdGEgZnJvbSBcIkRhdGEvQUlQRGF0YVwiO1xyXG5pbXBvcnQgQmxvY2tIYXJkbmVzc0RhdGEgZnJvbSBcIkRhdGEvQmxvY2tIYXJkbmVzc0RhdGFcIjtcclxuaW1wb3J0IEJsb2NrTWluaW5nRGF0YSBmcm9tIFwiRGF0YS9CbG9ja01pbmluZ0RhdGFcIjtcclxuaW1wb3J0IEJsb2NrUGxhY2VtZW50RGF0YSBmcm9tIFwiRGF0YS9CbG9ja1BsYWNlbWVudERhdGFcIjtcclxuaW1wb3J0IHsgSW52ZW50b3J5RGF0YSB9IGZyb20gXCJEYXRhL0ludmVudG9yeURhdGFcIjtcclxuaW1wb3J0IFYzIGZyb20gXCJIZWxwZXJzL1ZlY3RvcnMvVjNcIjtcclxuXHJcbmludGVyZmFjZSBGYWNlRGlyZWN0aW9uIHtcclxuICAgIGxvY2F0aW9uOiBWMztcclxuICAgIGRpcmVjdGlvbjogRGlyZWN0aW9uO1xyXG59XHJcblxyXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBCbG9ja1V0aWxzIHtcclxuICAgIC8qKlxyXG4gICAgICogQ2hlY2tzIGlmIGEgYmxvY2sgaXMgdmlzaWJsZSBmcm9tIGEgY2VydGFpbiBwb2ludC5cclxuICAgICAqIEBwYXJhbSBwb2ludCBUaGUgcG9pbnQgZnJvbSB3aGljaCB0byBjaGVjayB2aXNpYmlsaXR5LlxyXG4gICAgICogQHBhcmFtIGJsb2NrIFRoZSBibG9jayB0byBjaGVjayB2aXNpYmlsaXR5IGZvci5cclxuICAgICAqIEBwYXJhbSByYXljYXN0T3B0aW9ucyBPcHRpb25hbCByYXljYXN0IG9wdGlvbnMgdG8gY3VzdG9taXplIHRoZSB2aXNpYmlsaXR5IGNoZWNrLlxyXG4gICAgICogQHJldHVybnMgVHJ1ZSBpZiB0aGUgYmxvY2sgaXMgdmlzaWJsZSBmcm9tIHRoZSBwb2ludCwgZmFsc2Ugb3RoZXJ3aXNlLlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGlzQmxvY2tWaXNpYmxlKHBvaW50OiBWMywgYmxvY2s6IEJsb2NrLCByYXljYXN0T3B0aW9ucz86IEJsb2NrUmF5Y2FzdE9wdGlvbnMpOiBib29sZWFuIHtcclxuICAgICAgICBjb25zdCBibG9ja0NlbnRlciA9IFYzLmZyb21CbG9jayhibG9jaywgb3ZlcndvcmxkKS5hZGQoMC41KTtcclxuXHJcbiAgICAgICAgaWYgKCFwb2ludC5kaW1lbnNpb24pIHRocm93IG5ldyBFcnJvcihcIlBvaW50IG11c3Qgc3BlY2lmeSBhIGRpbWVuc2lvblwiKTtcclxuICAgICAgICBpZiAoYmxvY2tDZW50ZXIuZGltZW5zaW9uIS5pZCAhPT0gcG9pbnQuZGltZW5zaW9uLmlkKSByZXR1cm4gZmFsc2U7XHJcblxyXG4gICAgICAgIGNvbnN0IGQgPSBwb2ludC5jbG9uZSgpLnN1YnRyYWN0KGJsb2NrQ2VudGVyKTtcclxuXHJcbiAgICAgICAgLy8gQmFjay1mYWNlIGN1bGxpbmc6IG9ubHkgaW5jbHVkZSBmYWNlcyB3aG9zZSBub3JtYWxzIHBvaW50IHRvd2FyZCB0aGUgcG9pbnRcclxuICAgICAgICBjb25zdCBmYWNlczogRmFjZURpcmVjdGlvbltdID0gW1xyXG4gICAgICAgICAgICAuLi4oZC56ID49IDAgPyBbeyBsb2NhdGlvbjogYmxvY2tDZW50ZXIuJC5hZGQoMCwgMCwgMC41KSwgZGlyZWN0aW9uOiBEaXJlY3Rpb24uU291dGggfV0gOiBbXSksXHJcbiAgICAgICAgICAgIC4uLihkLnogPD0gMCA/IFt7IGxvY2F0aW9uOiBibG9ja0NlbnRlci4kLmFkZCgwLCAwLCAtMC41KSwgZGlyZWN0aW9uOiBEaXJlY3Rpb24uTm9ydGggfV0gOiBbXSksXHJcbiAgICAgICAgICAgIC4uLihkLnkgPj0gMCA/IFt7IGxvY2F0aW9uOiBibG9ja0NlbnRlci4kLmFkZCgwLCAwLjUsIDApLCBkaXJlY3Rpb246IERpcmVjdGlvbi5VcCB9XSA6IFtdKSxcclxuICAgICAgICAgICAgLi4uKGQueSA8PSAwID8gW3sgbG9jYXRpb246IGJsb2NrQ2VudGVyLiQuYWRkKDAsIC0wLjUsIDApLCBkaXJlY3Rpb246IERpcmVjdGlvbi5Eb3duIH1dIDogW10pLFxyXG4gICAgICAgICAgICAuLi4oZC54ID49IDAgPyBbeyBsb2NhdGlvbjogYmxvY2tDZW50ZXIuJC5hZGQoMC41LCAwLCAwKSwgZGlyZWN0aW9uOiBEaXJlY3Rpb24uRWFzdCB9XSA6IFtdKSxcclxuICAgICAgICAgICAgLi4uKGQueCA8PSAwID8gW3sgbG9jYXRpb246IGJsb2NrQ2VudGVyLiQuYWRkKC0wLjUsIDAsIDApLCBkaXJlY3Rpb246IERpcmVjdGlvbi5XZXN0IH1dIDogW10pLFxyXG4gICAgICAgIF07XHJcblxyXG4gICAgICAgIC8vIFNvcnQgZmFjZXMgZGlzdGFuY2UgdG8gcG9pbnQgc28gdGhlIGNsb3Nlc3QgZmFjZSBpcyB0ZXN0ZWQgZmlyc3QuXHJcbiAgICAgICAgZmFjZXMuc29ydCgoYSwgYikgPT4gcG9pbnQuZGlzdGFuY2UoYS5sb2NhdGlvbikgLSBwb2ludC5kaXN0YW5jZShiLmxvY2F0aW9uKSk7XHJcblxyXG4gICAgICAgIGlmICghcmF5Y2FzdE9wdGlvbnMpIHtcclxuICAgICAgICAgICAgcmF5Y2FzdE9wdGlvbnMgPSB7XHJcbiAgICAgICAgICAgICAgICBpbmNsdWRlTGlxdWlkQmxvY2tzOiBmYWxzZSxcclxuICAgICAgICAgICAgICAgIGluY2x1ZGVQYXNzYWJsZUJsb2NrczogdHJ1ZSxcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGZvciAoY29uc3QgZmFjZSBvZiBmYWNlcykge1xyXG4gICAgICAgICAgICBjb25zdCBkaXJlY3Rpb25Ub0ZhY2UgPSBmYWNlLmxvY2F0aW9uLmNsb25lKCkuc3VidHJhY3QocG9pbnQpLm5vcm1hbGl6ZSgpO1xyXG5cclxuICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gcG9pbnQuZGltZW5zaW9uLmdldEJsb2NrRnJvbVJheShwb2ludCwgZGlyZWN0aW9uVG9GYWNlLCByYXljYXN0T3B0aW9ucyk7XHJcblxyXG4gICAgICAgICAgICBpZiAoIXJlc3VsdCkgY29udGludWU7XHJcbiAgICAgICAgICAgIGlmIChyZXN1bHQuZmFjZSAhPT0gZmFjZS5kaXJlY3Rpb24pIGNvbnRpbnVlO1xyXG5cclxuICAgICAgICAgICAgY29uc3QgaGl0TG9jYXRpb24gPSBWMy5mcm9tQmxvY2socmVzdWx0LmJsb2NrLCBvdmVyd29ybGQpO1xyXG4gICAgICAgICAgICBjb25zdCBzaGFyZXNCbG9jayA9IGhpdExvY2F0aW9uLnNoYXJlc0Jsb2NrV2l0aChibG9ja0NlbnRlcik7XHJcblxyXG4gICAgICAgICAgICAvLyBJZiBvbmUgZmFjZSBpcyB2aXNpYmxlLCB0aGUgYmxvY2sgaXMgY29uc2lkZXJlZCB2aXNpYmxlXHJcbiAgICAgICAgICAgIGlmIChzaGFyZXNCbG9jaykgcmV0dXJuIHRydWU7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBDaGVja3MgaWYgYSBwb2ludCBpcyB3aXRoaW4gcmVhY2ggb2YgYSBibG9jay5cclxuICAgICAqIEBwYXJhbSBwb2ludCBUaGUgcG9pbnQgdG8gY2hlY2suXHJcbiAgICAgKiBAcGFyYW0gYmxvY2sgVGhlIGJsb2NrIHRvIGNoZWNrIGFnYWluc3QuXHJcbiAgICAgKiBAcGFyYW0gcmVhY2ggVGhlIG1heGltdW0gcmVhY2ggZGlzdGFuY2UuXHJcbiAgICAgKiBAcmV0dXJucyBUcnVlIGlmIHRoZSBwb2ludCBpcyB3aXRoaW4gcmVhY2ggb2YgdGhlIGJsb2NrLCBmYWxzZSBvdGhlcndpc2UuXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgaXNXaXRoaW5SZWFjaChwb2ludDogVjMsIGJsb2NrOiBCbG9jaywgcmVhY2g6IG51bWJlcik6IGJvb2xlYW4ge1xyXG4gICAgICAgIGNvbnN0IGRpc3RhbmNlID0gcG9pbnQuZGlzdGFuY2UoVjMuZnJvbUJsb2NrKGJsb2NrLCBmYWxzZSkpO1xyXG4gICAgICAgIHJldHVybiBkaXN0YW5jZSA8PSByZWFjaDtcclxuICAgIH1cclxuXHJcbiAgICAvKiogQ2hlY2tzIGlmIGEgYmxvY2sgY2FuIGJlIGhpZ2hsaWdodGVkIChpbnRlcmFjdGVkIHdpdGgpIGZyb20gdGhlIHBlcnNwZWN0aXZlIG9mIGFuIGVudGl0eSwgdGFraW5nIGludG8gYWNjb3VudCB2aXNpYmlsaXR5LCByZWFjaGFiaWxpdHksIGFuZCB3aGV0aGVyIHRoZSBlbnRpdHkgaXMgZ3JvdW5kZWQuXHJcbiAgICAgKiBAcGFyYW0gZW50aXR5IFRoZSBlbnRpdHkgZnJvbSB3aG9zZSBwZXJzcGVjdGl2ZSB0byBjaGVjay5cclxuICAgICAqIEBwYXJhbSBibG9jayBUaGUgYmxvY2sgdG8gY2hlY2suXHJcbiAgICAgKiBAcmV0dXJucyBUcnVlIGlmIHRoZSBibG9jayBjYW4gYmUgaGlnaGxpZ2h0ZWQsIGZhbHNlIG90aGVyd2lzZS5cclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBjYW5IaWdobGlnaHRCbG9jayhlbnRpdHk6IEVudGl0eSwgYmxvY2s6IEJsb2NrIHwgbnVsbCwgcmVhY2g6IG51bWJlciA9IEFJUERhdGEuUmVhY2hEaXN0YW5jZSk6IGJvb2xlYW4ge1xyXG4gICAgICAgIGlmICghYmxvY2spIHJldHVybiBmYWxzZTtcclxuXHJcbiAgICAgICAgY29uc3QgaXNHcm91bmRlZCA9IGVudGl0eS5pc09uR3JvdW5kO1xyXG4gICAgICAgIGlmICghaXNHcm91bmRlZCkgcmV0dXJuIGZhbHNlO1xyXG5cclxuICAgICAgICBjb25zdCBleWVMb2NhdGlvbiA9IFYzLmZyb21FbnRpdHkoZW50aXR5LCBvdmVyd29ybGQpLmFkZCgwLCBBSVBEYXRhLkV5ZUxldmVsLCAwKTtcclxuICAgICAgICBjb25zdCBpc1dpdGhpblJlYWNoID0gQmxvY2tVdGlscy5pc1dpdGhpblJlYWNoKGV5ZUxvY2F0aW9uLCBibG9jaywgcmVhY2gpO1xyXG4gICAgICAgIGlmICghaXNXaXRoaW5SZWFjaCkgcmV0dXJuIGZhbHNlO1xyXG5cclxuICAgICAgICByZXR1cm4gQmxvY2tVdGlscy5pc0Jsb2NrVmlzaWJsZShleWVMb2NhdGlvbiwgYmxvY2ssIHsgaW5jbHVkZVBhc3NhYmxlQmxvY2tzOiBmYWxzZSB9KTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIENvbXB1dGVzIGEgdmVpbiBvZiBsb2NhdGlvbnMgYXJvdW5kIHRoZSBzcGVjaWZpZWQgYmxvY2suXHJcbiAgICAgKiBAcmVtYXJrcyBhIHZlaW4gaXMgY29uc2lkZXJlZCB0byBiZSBuZWFyYnkgYmxvY2tzIG9mIHRoZSBzYW1lIHR5cGVcclxuICAgICAqIEBwYXJhbSBibG9jayBUaGUgYmxvY2sgdG8gY29tcHV0ZSB0aGUgdmVpbiBmb3IuXHJcbiAgICAgKiBAcGFyYW0gc3F1YXJlUmFkaXVzIFRoZSByYWRpdXMgdG8gc2VhcmNoIGZvciByZWxhdGVkIGJsb2Nrcy5cclxuICAgICAqIEBwYXJhbSBtYXhTaXplIFRoZSBtYXhpbXVtIG51bWJlciBvZiBibG9ja3MgdG8gaW5jbHVkZSBpbiB0aGUgdmVpbi5cclxuICAgICAqIEByZXR1cm5zIEFuIGFycmF5IG9mIGxvY2F0aW9ucyB0aGF0IGFyZSBwYXJ0IG9mIHRoZSB2ZWluLlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGNvbXB1dGVWZWluKGJsb2NrOiBCbG9jaywgc3F1YXJlUmFkaXVzOiBudW1iZXIgPSA0LCBtYXhTaXplPzogbnVtYmVyKTogVjNbXSB7XHJcbiAgICAgICAgY29uc3QgYmxvY2tMb2NhdGlvbiA9IFYzLmZyb21CbG9jayhibG9jaywgb3ZlcndvcmxkKTtcclxuICAgICAgICBjb25zdCBibG9ja3NJblJlZ2lvbiA9IHRoaXMuZ2V0QmxvY2tzSW5Wb2x1bWUoYmxvY2tMb2NhdGlvbiwgc3F1YXJlUmFkaXVzLCB7IGluY2x1ZGVUeXBlczogW2Jsb2NrLnR5cGVJZF0gfSk7XHJcbiAgICAgICAgY29uc3QgdmVpbjogVjNbXSA9IFtdO1xyXG5cclxuICAgICAgICBmb3IgKGNvbnN0IGxvY2F0aW9uIG9mIGJsb2Nrc0luUmVnaW9uLmdldEJsb2NrTG9jYXRpb25JdGVyYXRvcigpKSB7XHJcbiAgICAgICAgICAgIHZlaW4ucHVzaChuZXcgVjMobG9jYXRpb24pLnNldERpbWVuc2lvbihibG9ja0xvY2F0aW9uLmRpbWVuc2lvbikpO1xyXG5cclxuICAgICAgICAgICAgaWYgKG1heFNpemUgJiYgdmVpbi5sZW5ndGggPj0gbWF4U2l6ZSkgYnJlYWs7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICByZXR1cm4gdmVpbjtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEdldHMgYWxsIGJsb2NrcyBpbiBhIGN1YmljIHZvbHVtZSBjZW50ZXJlZCBhcm91bmQgYSBwb2ludC5cclxuICAgICAqIEBwYXJhbSBjZW50ZXIgVGhlIGNlbnRlciBwb2ludCBvZiB0aGUgdm9sdW1lLlxyXG4gICAgICogQHBhcmFtIHNxdWFyZVJhZGl1cyBUaGUgaGFsZi1sZW5ndGggb2YgdGhlIHNpZGVzIG9mIHRoZSBjdWJpYyB2b2x1bWUuXHJcbiAgICAgKiBAcGFyYW0gcXVlcnkgVGhlIGZpbHRlciB0byBhcHBseSB3aGVuIHJldHJpZXZpbmcgYmxvY2tzLlxyXG4gICAgICogQHJldHVybnMgQSBMaXN0QmxvY2tWb2x1bWUgb2YgYmxvY2sgbG9jYXRpb25zIHRoYXQgYXJlIHdpdGhpbiB0aGUgc3BlY2lmaWVkIHZvbHVtZS5cclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBnZXRCbG9ja3NJblZvbHVtZShjZW50ZXI6IFYzLCBzcXVhcmVSYWRpdXM6IG51bWJlciwgcXVlcnk6IEJsb2NrRmlsdGVyKTogTGlzdEJsb2NrVm9sdW1lIHtcclxuICAgICAgICBjb25zdCBmcm9tID0gbmV3IFYzKGNlbnRlcik7XHJcbiAgICAgICAgY29uc3QgbWluID0gZnJvbS5jbG9uZSgpLnN1YnRyYWN0KHNxdWFyZVJhZGl1cyk7XHJcbiAgICAgICAgY29uc3QgbWF4ID0gZnJvbS5jbG9uZSgpLmFkZChzcXVhcmVSYWRpdXMpO1xyXG4gICAgICAgIGNvbnN0IHZvbHVtZSA9IG5ldyBCbG9ja1ZvbHVtZShtaW4sIG1heCk7XHJcbiAgICAgICAgY29uc3QgZGltZW5zaW9uID0gY2VudGVyLmRpbWVuc2lvbiA/PyBvdmVyd29ybGQ7XHJcbiAgICAgICAgcmV0dXJuIGRpbWVuc2lvbi5nZXRCbG9ja3Modm9sdW1lLCBxdWVyeSwgdHJ1ZSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBHZXRzIHRoZSBjbG9zZXN0IGJsb2NrIHRvIGEgcG9pbnQgZnJvbSBhIGxpc3Qgb2YgYmxvY2tzLlxyXG4gICAgICogQHBhcmFtIHBvaW50IFRoZSBwb2ludCB0byBjaGVjayBhZ2FpbnN0LlxyXG4gICAgICogQHBhcmFtIGJsb2NrcyBUaGUgbGlzdCBvZiBibG9ja3MgdG8gc2VhcmNoLlxyXG4gICAgICogQHJldHVybnMgVGhlIGNsb3Nlc3QgYmxvY2sgdG8gdGhlIHBvaW50LCBvciBudWxsIGlmIG5vIGJsb2NrcyBhcmUgZm91bmQuXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgZ2V0Q2xvc2VzdEJsb2NrKHBvaW50OiBWMywgYmxvY2tzOiBCbG9ja1tdKTogQmxvY2sgfCBudWxsIHtcclxuICAgICAgICBsZXQgY2xvc2VzdEJsb2NrOiBCbG9jayB8IG51bGwgPSBudWxsO1xyXG4gICAgICAgIGxldCBjbG9zZXN0RGlzdCA9IEluZmluaXR5O1xyXG5cclxuICAgICAgICBmb3IgKGNvbnN0IGJsb2NrIG9mIGJsb2Nrcykge1xyXG4gICAgICAgICAgICBjb25zdCBkaXN0ID0gVjMuZnJvbUJsb2NrKGJsb2NrLCBmYWxzZSkuZGlzdGFuY2UocG9pbnQpO1xyXG4gICAgICAgICAgICBpZiAoZGlzdCA+PSBjbG9zZXN0RGlzdCkgY29udGludWU7XHJcblxyXG4gICAgICAgICAgICBjbG9zZXN0QmxvY2sgPSBibG9jaztcclxuICAgICAgICAgICAgY2xvc2VzdERpc3QgPSBkaXN0O1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgcmV0dXJuIGNsb3Nlc3RCbG9jaztcclxuICAgIH1cclxuXHJcbiAgICBwdWJsaWMgc3RhdGljIHNvcnRCbG9ja3NCeURpc3RhbmNlKHBvaW50OiBWMywgYmxvY2tzOiBCbG9ja1tdKTogQmxvY2tbXSB7XHJcbiAgICAgICAgcmV0dXJuIGJsb2Nrc1xyXG4gICAgICAgICAgICAubWFwKChibG9jaykgPT4gKHsgYmxvY2ssIGRpc3Q6IFYzLmZyb21CbG9jayhibG9jaywgZmFsc2UpLmRpc3RhbmNlKHBvaW50KSB9KSlcclxuICAgICAgICAgICAgLnNvcnQoKGEsIGIpID0+IGEuZGlzdCAtIGIuZGlzdClcclxuICAgICAgICAgICAgLm1hcCgoZW50cnkpID0+IGVudHJ5LmJsb2NrKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIENvbnZlcnRzIGEgM0QgdmVjdG9yIHRvIGEgYmxvY2suXHJcbiAgICAgKiBAcGFyYW0gbG9jYXRpb24gVGhlIDNEIHZlY3RvciB0byBjb252ZXJ0LlxyXG4gICAgICogQHJldHVybnMgVGhlIGJsb2NrIGF0IHRoZSBzcGVjaWZpZWQgbG9jYXRpb24sIG9yIG51bGwgaWYgbm8gYmxvY2sgaXMgZm91bmQuXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgZnJvbVYzKGxvY2F0aW9uOiBWMyk6IEJsb2NrIHwgbnVsbCB7XHJcbiAgICAgICAgY29uc3QgZGltZW5zaW9uID0gbG9jYXRpb24uZGltZW5zaW9uID8/IG92ZXJ3b3JsZDtcclxuXHJcbiAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgY29uc3QgYmxvY2sgPSBkaW1lbnNpb24uZ2V0QmxvY2sobG9jYXRpb24pO1xyXG4gICAgICAgICAgICByZXR1cm4gYmxvY2sgPz8gbnVsbDtcclxuICAgICAgICB9IGNhdGNoIHtcclxuICAgICAgICAgICAgcmV0dXJuIG51bGw7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQ2hlY2tzIGlmIGEgYmxvY2sgY2FuIGJlIHN1Y2Nlc3NmdWxseSBoYXJ2ZXN0ZWQgd2l0aCBhIHNwZWNpZmllZCB0b29sLlxyXG4gICAgICogQHBhcmFtIGJsb2NrIFRoZSBibG9jayB0byBjaGVjay5cclxuICAgICAqIEBwYXJhbSB0b29sIFRoZSB0b29sIGJlaW5nIHVzZWQuXHJcbiAgICAgKiBAcmV0dXJucyBUcnVlIGlmIHRoZSBibG9jayBjYW4gYmUgc3VjY2Vzc2Z1bGx5IGhhcnZlc3RlZCB3aXRoIHRoZSBzcGVjaWZpZWQgdG9vbCwgZmFsc2Ugb3RoZXJ3aXNlLlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGNhbkhhcnZlc3RCbG9ja1dpdGhUb29sKGJsb2NrOiBCbG9jaywgdG9vbDogSXRlbVN0YWNrKTogYm9vbGVhbiB7XHJcbiAgICAgICAgY29uc3QgdG9vbEluZGV4ID0gSW52ZW50b3J5RGF0YS5Ub29sUHJpb3JpdHkuZmluZEluZGV4KCh0aWVyKSA9PiB0b29sLnR5cGUuaWQuaW5jbHVkZXModGllcikpO1xyXG4gICAgICAgIGNvbnN0IGVmZmVjdGl2ZVRvb2xJbmRleCA9IHRvb2xJbmRleCA9PT0gLTEgPyBJbnZlbnRvcnlEYXRhLlRvb2xQcmlvcml0eS5sZW5ndGggOiB0b29sSW5kZXg7XHJcblxyXG4gICAgICAgIC8vIEJsb2NrcyB3aGljaCBoYXZlIHRoZSBgaXNfcGlja2F4ZV9pdGVtX2Rlc3RydWN0aWJsZWAgdGFnIGJ1dCBjYW4gYmUgbWluZWQgd2l0aCBhbnkgdG9vbFxyXG4gICAgICAgIGNvbnN0IGlzUGlja2F4ZUV4ZW1wdCA9IEJsb2NrTWluaW5nRGF0YS5QaWNrYXhlRXhlbXB0aW9ucy5oYXMoYmxvY2sudHlwZUlkKTtcclxuICAgICAgICBpZiAoaXNQaWNrYXhlRXhlbXB0KSByZXR1cm4gdHJ1ZTtcclxuXHJcbiAgICAgICAgZm9yIChjb25zdCBbdGFnLCByZXF1aXJlZFRpZXJdIG9mIEludmVudG9yeURhdGEuVGllclRhZ3MpIHtcclxuICAgICAgICAgICAgaWYgKCFibG9jay5oYXNUYWcodGFnKSkgY29udGludWU7XHJcbiAgICAgICAgICAgIGlmIChlZmZlY3RpdmVUb29sSW5kZXggPiBJbnZlbnRvcnlEYXRhLlRvb2xQcmlvcml0eS5pbmRleE9mKHJlcXVpcmVkVGllcikpIHJldHVybiBmYWxzZTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQ29tcHV0ZXMgdGhlIG51bWJlciBvZiB0aWNrcyBpdCB3aWxsIHRha2UgdG8gYnJlYWsgYSBibG9jayB3aXRoIGEgc3BlY2lmaWVkIHRvb2wsIHRha2luZyBpbnRvIGFjY291bnQgdGhlIGJsb2NrJ3MgaGFyZG5lc3MgYW5kIHdoZXRoZXIgdGhlIHRvb2wgY2FuIHN1Y2Nlc3NmdWxseSBoYXJ2ZXN0IHRoZSBibG9jay5cclxuICAgICAqIEBwYXJhbSBibG9jayBUaGUgYmxvY2sgdG8gYmUgYnJva2VuLlxyXG4gICAgICogQHBhcmFtIHRvb2wgVGhlIHRvb2wgYmVpbmcgdXNlZCB0byBicmVhayB0aGUgYmxvY2suXHJcbiAgICAgKiBAcGFyYW0gY2FuSGFydmVzdCBXaGV0aGVyIHRoZSB0b29sIGNhbiBzdWNjZXNzZnVsbHkgaGFydmVzdCB0aGUgYmxvY2suXHJcbiAgICAgKiBAcmV0dXJucyBUaGUgbnVtYmVyIG9mIHRpY2tzIGl0IHdpbGwgdGFrZSB0byBicmVhayB0aGUgYmxvY2suXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgY29tcHV0ZUJyZWFrRHVyYXRpb24oYmxvY2s6IEJsb2NrLCB0b29sOiBJdGVtU3RhY2ssIGNhbkhhcnZlc3Q6IGJvb2xlYW4pOiBudW1iZXIge1xyXG4gICAgICAgIGNvbnN0IGJhc2VEdXJhdGlvbiA9IGNhbkhhcnZlc3QgPyBJbnZlbnRvcnlEYXRhLkJhc2VCcmVha0R1cmF0aW9uIDogSW52ZW50b3J5RGF0YS5CYXNlQnJlYWtEdXJhdGlvbldpdGhvdXRQcm9wZXJUb29sO1xyXG4gICAgICAgIGNvbnN0IG1hdGNoZWRUaWVyID0gT2JqZWN0LmtleXMoSW52ZW50b3J5RGF0YS5NaW5pbmdFZmZpY2llbmN5KS5maW5kKCh0aWVyKSA9PiB0b29sLnR5cGUuaWQuaW5jbHVkZXModGllcikpO1xyXG4gICAgICAgIGNvbnN0IGVmZmljaWVuY3lNdWx0aXBsaWVyID0gbWF0Y2hlZFRpZXIgPyBJbnZlbnRvcnlEYXRhLk1pbmluZ0VmZmljaWVuY3lbbWF0Y2hlZFRpZXJdIDogMTtcclxuICAgICAgICBjb25zdCBibG9ja0hhcmRuZXNzID0gQmxvY2tIYXJkbmVzc0RhdGEuZ2V0KGJsb2NrLnR5cGVJZCk7XHJcblxyXG4gICAgICAgIGNvbnN0IHJlc3VsdCA9IChiYXNlRHVyYXRpb24gKiBibG9ja0hhcmRuZXNzKSAvIGVmZmljaWVuY3lNdWx0aXBsaWVyO1xyXG4gICAgICAgIC8vIFJldHVybiAwIChpbnN0YW50IGJyZWFrKSBhbmQgLTEgKGluZGVzdHJ1Y3RpYmxlKVxyXG4gICAgICAgIGlmIChyZXN1bHQgPD0gMCkgcmV0dXJuIHJlc3VsdDtcclxuXHJcbiAgICAgICAgLy9SZXR1cm4gdGhlIG51bWJlciBvZiB0aWNrcyByb3VuZGVkIHVwIHNpbmNlIHBhcnRpYWwgdGlja3MgYXJlIG5vdCBwb3NzaWJsZVxyXG4gICAgICAgIHJldHVybiBNYXRoLmNlaWwocmVzdWx0KTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogQ2hlY2tzIGlmIGEgYmxvY2sgaXMgbWluZWFibGUuXHJcbiAgICAgKiBAcGFyYW0gYmxvY2sgVGhlIGJsb2NrIHRvIGNoZWNrLlxyXG4gICAgICogQHJldHVybnMgVHJ1ZSBpZiB0aGUgYmxvY2sgaXMgbWluZWFibGUsIGZhbHNlIG90aGVyd2lzZS5cclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBpc01pbmVhYmxlKGJsb2NrOiBCbG9jayB8IG51bGwpOiBibG9jayBpcyBCbG9jayB7XHJcbiAgICAgICAgcmV0dXJuIGJsb2NrICE9PSBudWxsICYmICFibG9jay5pc0FpciAmJiAhYmxvY2suaXNMaXF1aWQ7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBDaGVja3MgaWYgYSBibG9jayBpcyBvdmVycmlkZWFibGUuXHJcbiAgICAgKiBAcGFyYW0gcGVybXV0YXRpb24gVGhlIGJsb2NrIHRvIGNoZWNrLlxyXG4gICAgICogQHJldHVybnMgVHJ1ZSBpZiB0aGUgYmxvY2sgaXMgb3ZlcnJpZGVhYmxlLCBmYWxzZSBvdGhlcndpc2UuXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgaXNPdmVycmlkZWFibGUocGVybXV0YXRpb246IEJsb2NrUGVybXV0YXRpb24gfCBudWxsIHwgdW5kZWZpbmVkLCB0eXBlSWQ/OiBzdHJpbmcpOiBib29sZWFuIHtcclxuICAgICAgICBpZiAoIXBlcm11dGF0aW9uKSByZXR1cm4gZmFsc2U7XHJcbiAgICAgICAgdHlwZUlkID0gdHlwZUlkID8/IHBlcm11dGF0aW9uLnR5cGUuaWQ7XHJcbiAgICAgICAgaWYgKEJsb2NrUGxhY2VtZW50RGF0YS5GbHVpZEJsb2Nrcy5oYXModHlwZUlkKSkgcmV0dXJuIHRydWU7XHJcblxyXG4gICAgICAgIC8vIFNub3cgbGF5ZXJzIGFyZSBvdmVycmlkZWFibGUgdW50aWwgdGhleSBmb3JtIGEgZnVsbCBibG9jayAoaGVpZ2h0IDcpXHJcbiAgICAgICAgaWYgKHR5cGVJZCA9PT0gXCJtaW5lY3JhZnQ6c25vd19sYXllclwiKSB7XHJcbiAgICAgICAgICAgIHJldHVybiAocGVybXV0YXRpb24uZ2V0U3RhdGUoXCJoZWlnaHRcIikgYXMgbnVtYmVyKSA8IDc7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICByZXR1cm4gQmxvY2tQbGFjZW1lbnREYXRhLk92ZXJyaWRlYWJsZUJsb2Nrcy5oYXModHlwZUlkKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIENoZWNrcyBpZiBhIGxvY2F0aW9uIGhhcyBzb2xpZCAobm9uLW92ZXJyaWRlYWJsZSkgZ3JvdW5kIGJlbG93IGl0LlxyXG4gICAgICogQHBhcmFtIGxvY2F0aW9uIFRoZSBsb2NhdGlvbiB0byBjaGVjay5cclxuICAgICAqIEByZXR1cm5zIFRydWUgaWYgdGhlcmUgaXMgc29saWQgZ3JvdW5kIGJlbG93IHRoZSBsb2NhdGlvbiwgZmFsc2Ugb3RoZXJ3aXNlLlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGhhc1NvbGlkR3JvdW5kQmVsb3cobG9jYXRpb246IFYzKTogYm9vbGVhbiB7XHJcbiAgICAgICAgY29uc3QgYmVsb3dCbG9jayA9IHRoaXMuZnJvbVYzKGxvY2F0aW9uLmNsb25lKCkuYWRkKDAsIC0xLCAwKSk7XHJcbiAgICAgICAgaWYgKCFiZWxvd0Jsb2NrKSByZXR1cm4gZmFsc2U7XHJcbiAgICAgICAgcmV0dXJuICF0aGlzLmlzT3ZlcnJpZGVhYmxlKGJlbG93QmxvY2s/LnBlcm11dGF0aW9uID8/IG51bGwpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQ2hlY2tzIGlmIGEgYmxvY2sgY2FuIHN1cHBvcnQgYSB0b3JjaCBiZWluZyBwbGFjZWQgb24gaXQuXHJcbiAgICAgKiBAcGFyYW0gYmxvY2sgVGhlIGJsb2NrIHRvIGNoZWNrLlxyXG4gICAgICogQHJldHVybnMgVHJ1ZSBpZiB0aGUgYmxvY2sgY2FuIHN1cHBvcnQgYSB0b3JjaCwgZmFsc2Ugb3RoZXJ3aXNlLlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGNhblN1cHBvcnRUb3JjaChibG9jazogQmxvY2sgfCBudWxsKTogYm9vbGVhbiB7XHJcbiAgICAgICAgaWYgKCFibG9jaykgcmV0dXJuIGZhbHNlO1xyXG4gICAgICAgIGlmIChibG9jay5pc0FpciB8fCBibG9jay5pc0xpcXVpZCkgcmV0dXJuIGZhbHNlO1xyXG5cclxuICAgICAgICBpZiAoQmxvY2tQbGFjZW1lbnREYXRhLkJsb2Nrc1RoYXRDYW5ub3RTdXBwb3J0VG9yY2hlcy5oYXMoYmxvY2sudHlwZUlkKSkgcmV0dXJuIGZhbHNlO1xyXG5cclxuICAgICAgICAvLyBCb3R0b20taGFsZiBzbGFicyAoYm90aCBvbGQgYW5kIG5ldyBzdGF0ZSBmb3JtYXRzKVxyXG4gICAgICAgIGlmIChibG9jay5wZXJtdXRhdGlvbi5nZXRTdGF0ZShcIm1pbmVjcmFmdDp2ZXJ0aWNhbF9oYWxmXCIpID09PSBcImJvdHRvbVwiKSByZXR1cm4gZmFsc2U7XHJcbiAgICAgICAgaWYgKGJsb2NrLnBlcm11dGF0aW9uLmdldFN0YXRlKFwidG9wX3Nsb3RfYml0XCIpID09PSBmYWxzZSkgcmV0dXJuIGZhbHNlO1xyXG5cclxuICAgICAgICAvLyBTdGFpcnMgLSBvbmx5IHVwc2lkZS1kb3duIHN0YWlycyAoc29saWQgcGxhbmUgb24gdG9wKSBjYW4gc3VwcG9ydCB0b3JjaGVzXHJcbiAgICAgICAgaWYgKGJsb2NrLnR5cGVJZC5lbmRzV2l0aChcIl9zdGFpcnNcIikpIHtcclxuICAgICAgICAgICAgcmV0dXJuIGJsb2NrLnBlcm11dGF0aW9uLmdldFN0YXRlKFwidXBzaWRlX2Rvd25fYml0XCIpID09PSB0cnVlO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIENoZWNrcyBpZiBhIGJsb2NrIGlzIGxpa2VseSBzb2xpZCAobm90IGFpciwgbGlxdWlkLCBvciBlYXNpbHkgZGVzdHJveWVkKS5cclxuICAgICAqIEBwYXJhbSBwZXJtdXRhdGlvbiBUaGUgYmxvY2sgdG8gY2hlY2suXHJcbiAgICAgKiBAcmV0dXJucyBUcnVlIGlmIHRoZSBibG9jayBpcyBsaWtlbHkgc29saWQsIGZhbHNlIG90aGVyd2lzZS5cclxuICAgICAqICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGlzTGlrZWx5U29saWQocGVybXV0YXRpb246IEJsb2NrUGVybXV0YXRpb24gfCBudWxsIHwgdW5kZWZpbmVkKTogYm9vbGVhbiB7XHJcbiAgICAgICAgaWYgKCFwZXJtdXRhdGlvbikgcmV0dXJuIGZhbHNlO1xyXG4gICAgICAgIC8vIExpa2VseSBub3Qgc29saWQgaWYgb3ZlcnJpZGVhYmxlXHJcbiAgICAgICAgaWYgKEJsb2NrVXRpbHMuaXNPdmVycmlkZWFibGUocGVybXV0YXRpb24pKSByZXR1cm4gZmFsc2U7XHJcbiAgICAgICAgLy8gTGlrZWx5IG5vdCBzb2xpZCBpZiBjYW4gYmUgZGVzdHJveWVkIGJ5IHdhdGVyXHJcbiAgICAgICAgaWYgKHBlcm11dGF0aW9uLmNhbkJlRGVzdHJveWVkQnlMaXF1aWRTcHJlYWQoTGlxdWlkVHlwZS5XYXRlcikpIHJldHVybiBmYWxzZTtcclxuICAgICAgICAvLyBMaWtlbHkgbm90IHNvbGlkIGlmIG5vdCBsaXF1aWQgYmxvY2tpbmdcclxuICAgICAgICBpZiAoIXBlcm11dGF0aW9uLmlzTGlxdWlkQmxvY2tpbmcoTGlxdWlkVHlwZS5XYXRlcikpIHJldHVybiBmYWxzZTtcclxuICAgICAgICAvLyBMaWtlbHkgbm90IHNvbGlkIGlmIHdhdGVybG9nZ2VkXHJcbiAgICAgICAgaWYgKHBlcm11dGF0aW9uLmNhbkNvbnRhaW5MaXF1aWQoTGlxdWlkVHlwZS5XYXRlcikpIHJldHVybiBmYWxzZTtcclxuICAgICAgICAvLyBPdGhlcndpc2UsIGFzc3VtZSBzb2xpZFxyXG4gICAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBDaGVja3MgaWYgYSBibG9jayBpcyBsaWtlbHkgdG8gYmxvY2sgbW9iIHBhdGhmaW5kaW5nLlxyXG4gICAgICogQHBhcmFtIHBlcm11dGF0aW9uIFRoZSBibG9jayB0byBjaGVjay5cclxuICAgICAqIEByZXR1cm5zIFRydWUgaWYgdGhlIGJsb2NrIGlzIGxpa2VseSB0byBibG9jayBuYXZpZ2F0aW9uLCBmYWxzZSBvdGhlcndpc2UuXHJcbiAgICAgKiAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBpc0xpa2VseU5hdmlnYXRpb25CbG9ja2luZyhwZXJtdXRhdGlvbjogQmxvY2tQZXJtdXRhdGlvbiB8IG51bGwgfCB1bmRlZmluZWQpOiBib29sZWFuIHtcclxuICAgICAgICBpZiAoIXBlcm11dGF0aW9uKSByZXR1cm4gZmFsc2U7XHJcbiAgICAgICAgLy8gTGlrZWx5IG5vdCBuYXZpZ2F0aW9uIGJsb2NraW5nIGlmIG92ZXJyaWRlYWJsZVxyXG4gICAgICAgIGlmIChCbG9ja1V0aWxzLmlzT3ZlcnJpZGVhYmxlKHBlcm11dGF0aW9uKSkgcmV0dXJuIGZhbHNlO1xyXG4gICAgICAgIC8vIExpa2VseSBub3QgbmF2aWdhdGlvbiBibG9ja2luZyBpZiBjYW4gYmUgZGVzdHJveWVkIGJ5IHdhdGVyXHJcbiAgICAgICAgaWYgKHBlcm11dGF0aW9uLmNhbkJlRGVzdHJveWVkQnlMaXF1aWRTcHJlYWQoTGlxdWlkVHlwZS5XYXRlcikpIHJldHVybiBmYWxzZTtcclxuICAgICAgICAvLyBMaWtlbHkgbm90IG5hdmlnYXRpb24gYmxvY2tpbmcgaWYgbm90IGxpcXVpZCBibG9ja2luZ1xyXG4gICAgICAgIGlmICghcGVybXV0YXRpb24uaXNMaXF1aWRCbG9ja2luZyhMaXF1aWRUeXBlLldhdGVyKSkgcmV0dXJuIGZhbHNlO1xyXG4gICAgICAgIC8vIE90aGVyd2lzZSwgYXNzdW1lIG5hdmlnYXRpb24gYmxvY2tpbmdcclxuICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgIH1cclxuXHJcbiAgICBwdWJsaWMgc3RhdGljIGdldEtleShibG9jazogQmxvY2spOiBzdHJpbmcge1xyXG4gICAgICAgIHJldHVybiBgJHtibG9jay50eXBlSWR9OiR7SlNPTi5zdHJpbmdpZnkoYmxvY2sucGVybXV0YXRpb24uZ2V0QWxsU3RhdGVzKCkpfWA7XHJcbiAgICB9XHJcbn1cclxuIl0sIm5hbWVzIjpbIkJsb2NrVm9sdW1lIiwiRGlyZWN0aW9uIiwiTGlxdWlkVHlwZSIsIkFJUERhdGEiLCJCbG9ja0hhcmRuZXNzRGF0YSIsIkJsb2NrTWluaW5nRGF0YSIsIkJsb2NrUGxhY2VtZW50RGF0YSIsIkludmVudG9yeURhdGEiLCJWMyIsIkJsb2NrVXRpbHMiLCJpc0Jsb2NrVmlzaWJsZSIsInBvaW50IiwiYmxvY2siLCJyYXljYXN0T3B0aW9ucyIsImJsb2NrQ2VudGVyIiwiZnJvbUJsb2NrIiwib3ZlcndvcmxkIiwiYWRkIiwiZGltZW5zaW9uIiwiRXJyb3IiLCJpZCIsImQiLCJjbG9uZSIsInN1YnRyYWN0IiwiZmFjZXMiLCJ6IiwibG9jYXRpb24iLCIkIiwiZGlyZWN0aW9uIiwiU291dGgiLCJOb3J0aCIsInkiLCJVcCIsIkRvd24iLCJ4IiwiRWFzdCIsIldlc3QiLCJzb3J0IiwiYSIsImIiLCJkaXN0YW5jZSIsImluY2x1ZGVMaXF1aWRCbG9ja3MiLCJpbmNsdWRlUGFzc2FibGVCbG9ja3MiLCJmYWNlIiwiZGlyZWN0aW9uVG9GYWNlIiwibm9ybWFsaXplIiwicmVzdWx0IiwiZ2V0QmxvY2tGcm9tUmF5IiwiaGl0TG9jYXRpb24iLCJzaGFyZXNCbG9jayIsInNoYXJlc0Jsb2NrV2l0aCIsImlzV2l0aGluUmVhY2giLCJyZWFjaCIsImNhbkhpZ2hsaWdodEJsb2NrIiwiZW50aXR5IiwiUmVhY2hEaXN0YW5jZSIsImlzR3JvdW5kZWQiLCJpc09uR3JvdW5kIiwiZXllTG9jYXRpb24iLCJmcm9tRW50aXR5IiwiRXllTGV2ZWwiLCJjb21wdXRlVmVpbiIsInNxdWFyZVJhZGl1cyIsIm1heFNpemUiLCJibG9ja0xvY2F0aW9uIiwiYmxvY2tzSW5SZWdpb24iLCJnZXRCbG9ja3NJblZvbHVtZSIsImluY2x1ZGVUeXBlcyIsInR5cGVJZCIsInZlaW4iLCJnZXRCbG9ja0xvY2F0aW9uSXRlcmF0b3IiLCJwdXNoIiwic2V0RGltZW5zaW9uIiwibGVuZ3RoIiwiY2VudGVyIiwicXVlcnkiLCJmcm9tIiwibWluIiwibWF4Iiwidm9sdW1lIiwiZ2V0QmxvY2tzIiwiZ2V0Q2xvc2VzdEJsb2NrIiwiYmxvY2tzIiwiY2xvc2VzdEJsb2NrIiwiY2xvc2VzdERpc3QiLCJJbmZpbml0eSIsImRpc3QiLCJzb3J0QmxvY2tzQnlEaXN0YW5jZSIsIm1hcCIsImVudHJ5IiwiZnJvbVYzIiwiZ2V0QmxvY2siLCJjYW5IYXJ2ZXN0QmxvY2tXaXRoVG9vbCIsInRvb2wiLCJ0b29sSW5kZXgiLCJUb29sUHJpb3JpdHkiLCJmaW5kSW5kZXgiLCJ0aWVyIiwidHlwZSIsImluY2x1ZGVzIiwiZWZmZWN0aXZlVG9vbEluZGV4IiwiaXNQaWNrYXhlRXhlbXB0IiwiUGlja2F4ZUV4ZW1wdGlvbnMiLCJoYXMiLCJ0YWciLCJyZXF1aXJlZFRpZXIiLCJUaWVyVGFncyIsImhhc1RhZyIsImluZGV4T2YiLCJjb21wdXRlQnJlYWtEdXJhdGlvbiIsImNhbkhhcnZlc3QiLCJiYXNlRHVyYXRpb24iLCJCYXNlQnJlYWtEdXJhdGlvbiIsIkJhc2VCcmVha0R1cmF0aW9uV2l0aG91dFByb3BlclRvb2wiLCJtYXRjaGVkVGllciIsIk9iamVjdCIsImtleXMiLCJNaW5pbmdFZmZpY2llbmN5IiwiZmluZCIsImVmZmljaWVuY3lNdWx0aXBsaWVyIiwiYmxvY2tIYXJkbmVzcyIsImdldCIsIk1hdGgiLCJjZWlsIiwiaXNNaW5lYWJsZSIsImlzQWlyIiwiaXNMaXF1aWQiLCJpc092ZXJyaWRlYWJsZSIsInBlcm11dGF0aW9uIiwiRmx1aWRCbG9ja3MiLCJnZXRTdGF0ZSIsIk92ZXJyaWRlYWJsZUJsb2NrcyIsImhhc1NvbGlkR3JvdW5kQmVsb3ciLCJiZWxvd0Jsb2NrIiwiY2FuU3VwcG9ydFRvcmNoIiwiQmxvY2tzVGhhdENhbm5vdFN1cHBvcnRUb3JjaGVzIiwiZW5kc1dpdGgiLCJpc0xpa2VseVNvbGlkIiwiY2FuQmVEZXN0cm95ZWRCeUxpcXVpZFNwcmVhZCIsIldhdGVyIiwiaXNMaXF1aWRCbG9ja2luZyIsImNhbkNvbnRhaW5MaXF1aWQiLCJpc0xpa2VseU5hdmlnYXRpb25CbG9ja2luZyIsImdldEtleSIsIkpTT04iLCJzdHJpbmdpZnkiLCJnZXRBbGxTdGF0ZXMiXSwibWFwcGluZ3MiOiJBQUFBLFNBS0lBLFdBQVcsRUFDWEMsU0FBUyxFQUdUQyxVQUFVLFFBRVAsb0JBQW9CO0FBQzNCLE9BQU9DLGFBQWEsZUFBZTtBQUNuQyxPQUFPQyx1QkFBdUIseUJBQXlCO0FBQ3ZELE9BQU9DLHFCQUFxQix1QkFBdUI7QUFDbkQsT0FBT0Msd0JBQXdCLDBCQUEwQjtBQUN6RCxTQUFTQyxhQUFhLFFBQVEscUJBQXFCO0FBQ25ELE9BQU9DLFFBQVEscUJBQXFCO0FBT3JCLE1BQU1DO0lBQ2pCOzs7Ozs7S0FNQyxHQUNELE9BQWNDLGVBQWVDLEtBQVMsRUFBRUMsS0FBWSxFQUFFQyxjQUFvQyxFQUFXO1FBQ2pHLE1BQU1DLGNBQWNOLEdBQUdPLFNBQVMsQ0FBQ0gsT0FBT0ksV0FBV0MsR0FBRyxDQUFDO1FBRXZELElBQUksQ0FBQ04sTUFBTU8sU0FBUyxFQUFFLE1BQU0sSUFBSUMsTUFBTTtRQUN0QyxJQUFJTCxZQUFZSSxTQUFTLENBQUVFLEVBQUUsS0FBS1QsTUFBTU8sU0FBUyxDQUFDRSxFQUFFLEVBQUUsT0FBTztRQUU3RCxNQUFNQyxJQUFJVixNQUFNVyxLQUFLLEdBQUdDLFFBQVEsQ0FBQ1Q7UUFFakMsNkVBQTZFO1FBQzdFLE1BQU1VLFFBQXlCO2VBQ3ZCSCxFQUFFSSxDQUFDLElBQUksSUFBSTtnQkFBQztvQkFBRUMsVUFBVVosWUFBWWEsQ0FBQyxDQUFDVixHQUFHLENBQUMsR0FBRyxHQUFHO29CQUFNVyxXQUFXM0IsVUFBVTRCLEtBQUs7Z0JBQUM7YUFBRSxHQUFHLEVBQUU7ZUFDeEZSLEVBQUVJLENBQUMsSUFBSSxJQUFJO2dC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