import FeatureCacheData from "Data/FeatureCacheData";
import FeatureType from "FeatureCache/FeatureType";
import V3 from "Helpers/Vectors/V3";
import BlockUtils from "Utils/BlockUtils";
class TreeFeatureType extends FeatureType {
    processBlock(block) {
        const tree = this.computeTree(block);
        if (tree.length === 0) return null;
        const root = this.getTreeRoot(tree);
        return this.buildFeature(this.identifier, root, tree);
    }
    getTreeRoot(tree) {
        tree.sort((a, b)=>a.y - b.y);
        return tree[0];
    }
    computeTree(block) {
        let location = V3.fromBlock(block, overworld);
        const tree = [];
        if (!location.isLoaded()) return [];
        // Walk down the tree until we find the base
        // eslint-disable-next-line no-constant-condition
        while(true){
            const block = BlockUtils.fromV3(location);
            if (!block) return [];
            // Base found
            if (this.baseTypes.includes(block.typeId)) break;
            // Return an empty array if we hit a non-log block
            if (!this.searchBlockTypes.includes(block.typeId)) return [];
            location.add(0, -1, 0);
        }
        // Walk up the tree until we find leaves
        // eslint-disable-next-line no-constant-condition
        while(true){
            location = location.add(0, 1, 0);
            const block = BlockUtils.fromV3(location);
            if (!block) return [];
            // Return a successful tree if we hit leaves
            if (this.leafTypes.includes(block.typeId)) return tree;
            // Return an empty array if we hit a non-log block (this is not a tree)
            if (!this.searchBlockTypes.includes(block.typeId)) return [];
            tree.push(location.clone());
        }
    }
    ensureFeature(feature) {
        return this.ensureVeinFeature(feature);
    }
    constructor(...args){
        super(...args);
        this.searchBlockTypes = FeatureCacheData.TreeBlockTypes;
        this.leafTypes = FeatureCacheData.TreeLeafTypes;
        this.baseTypes = FeatureCacheData.TreeBaseTypes;
    }
}
TreeFeatureType.identifier = "tree";
export { TreeFeatureType as default };

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIlRyZWVGZWF0dXJlVHlwZS50cyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBCbG9jayB9IGZyb20gXCJAbWluZWNyYWZ0L3NlcnZlclwiO1xyXG5pbXBvcnQgRmVhdHVyZUNhY2hlRGF0YSBmcm9tIFwiRGF0YS9GZWF0dXJlQ2FjaGVEYXRhXCI7XHJcbmltcG9ydCBGZWF0dXJlVHlwZSBmcm9tIFwiRmVhdHVyZUNhY2hlL0ZlYXR1cmVUeXBlXCI7XHJcbmltcG9ydCB7IEZlYXR1cmUgfSBmcm9tIFwiRmVhdHVyZUNhY2hlL1R5cGVzXCI7XHJcbmltcG9ydCBWMyBmcm9tIFwiSGVscGVycy9WZWN0b3JzL1YzXCI7XHJcbmltcG9ydCBCbG9ja1V0aWxzIGZyb20gXCJVdGlscy9CbG9ja1V0aWxzXCI7XHJcblxyXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBUcmVlRmVhdHVyZVR5cGUgZXh0ZW5kcyBGZWF0dXJlVHlwZSB7XHJcbiAgICBwdWJsaWMgc3RhdGljIHJlYWRvbmx5IGlkZW50aWZpZXIgPSBcInRyZWVcIiBhcyBjb25zdDtcclxuXHJcbiAgICBwdWJsaWMgcmVhZG9ubHkgc2VhcmNoQmxvY2tUeXBlcyA9IEZlYXR1cmVDYWNoZURhdGEuVHJlZUJsb2NrVHlwZXM7XHJcbiAgICBwdWJsaWMgcmVhZG9ubHkgbGVhZlR5cGVzID0gRmVhdHVyZUNhY2hlRGF0YS5UcmVlTGVhZlR5cGVzO1xyXG4gICAgcHVibGljIHJlYWRvbmx5IGJhc2VUeXBlcyA9IEZlYXR1cmVDYWNoZURhdGEuVHJlZUJhc2VUeXBlcztcclxuXHJcbiAgICBwdWJsaWMgcHJvY2Vzc0Jsb2NrKGJsb2NrOiBCbG9jayk6IEZlYXR1cmUgfCBudWxsIHtcclxuICAgICAgICBjb25zdCB0cmVlID0gdGhpcy5jb21wdXRlVHJlZShibG9jayk7XHJcbiAgICAgICAgaWYgKHRyZWUubGVuZ3RoID09PSAwKSByZXR1cm4gbnVsbDtcclxuXHJcbiAgICAgICAgY29uc3Qgcm9vdCA9IHRoaXMuZ2V0VHJlZVJvb3QodHJlZSk7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuYnVpbGRGZWF0dXJlKHRoaXMuaWRlbnRpZmllciwgcm9vdCwgdHJlZSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBnZXRUcmVlUm9vdCh0cmVlOiBWM1tdKTogVjMge1xyXG4gICAgICAgIHRyZWUuc29ydCgoYSwgYikgPT4gYS55IC0gYi55KTtcclxuICAgICAgICByZXR1cm4gdHJlZVswXTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGNvbXB1dGVUcmVlKGJsb2NrOiBCbG9jayk6IFYzW10ge1xyXG4gICAgICAgIGxldCBsb2NhdGlvbiA9IFYzLmZyb21CbG9jayhibG9jaywgb3ZlcndvcmxkKTtcclxuICAgICAgICBjb25zdCB0cmVlOiBWM1tdID0gW107XHJcblxyXG4gICAgICAgIGlmICghbG9jYXRpb24uaXNMb2FkZWQoKSkgcmV0dXJuIFtdO1xyXG5cclxuICAgICAgICAvLyBXYWxrIGRvd24gdGhlIHRyZWUgdW50aWwgd2UgZmluZCB0aGUgYmFzZVxyXG4gICAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1jb25zdGFudC1jb25kaXRpb25cclxuICAgICAgICB3aGlsZSAodHJ1ZSkge1xyXG4gICAgICAgICAgICBjb25zdCBibG9jayA9IEJsb2NrVXRpbHMuZnJvbVYzKGxvY2F0aW9uKTtcclxuICAgICAgICAgICAgaWYgKCFibG9jaykgcmV0dXJuIFtdO1xyXG5cclxuICAgICAgICAgICAgLy8gQmFzZSBmb3VuZFxyXG4gICAgICAgICAgICBpZiAodGhpcy5iYXNlVHlwZXMuaW5jbHVkZXMoYmxvY2sudHlwZUlkKSkgYnJlYWs7XHJcblxyXG4gICAgICAgICAgICAvLyBSZXR1cm4gYW4gZW1wdHkgYXJyYXkgaWYgd2UgaGl0IGEgbm9uLWxvZyBibG9ja1xyXG4gICAgICAgICAgICBpZiAoIXRoaXMuc2VhcmNoQmxvY2tUeXBlcy5pbmNsdWRlcyhibG9jay50eXBlSWQpKSByZXR1cm4gW107XHJcblxyXG4gICAgICAgICAgICBsb2NhdGlvbi5hZGQoMCwgLTEsIDApO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gV2FsayB1cCB0aGUgdHJlZSB1bnRpbCB3ZSBmaW5kIGxlYXZlc1xyXG4gICAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1jb25zdGFudC1jb25kaXRpb25cclxuICAgICAgICB3aGlsZSAodHJ1ZSkge1xyXG4gICAgICAgICAgICBsb2NhdGlvbiA9IGxvY2F0aW9uLmFkZCgwLCAxLCAwKTtcclxuXHJcbiAgICAgICAgICAgIGNvbnN0IGJsb2NrID0gQmxvY2tVdGlscy5mcm9tVjMobG9jYXRpb24pO1xyXG4gICAgICAgICAgICBpZiAoIWJsb2NrKSByZXR1cm4gW107XHJcblxyXG4gICAgICAgICAgICAvLyBSZXR1cm4gYSBzdWNjZXNzZnVsIHRyZWUgaWYgd2UgaGl0IGxlYXZlc1xyXG4gICAgICAgICAgICBpZiAodGhpcy5sZWFmVHlwZXMuaW5jbHVkZXMoYmxvY2sudHlwZUlkKSkgcmV0dXJuIHRyZWU7XHJcblxyXG4gICAgICAgICAgICAvLyBSZXR1cm4gYW4gZW1wdHkgYXJyYXkgaWYgd2UgaGl0IGEgbm9uLWxvZyBibG9jayAodGhpcyBpcyBub3QgYSB0cmVlKVxyXG4gICAgICAgICAgICBpZiAoIXRoaXMuc2VhcmNoQmxvY2tUeXBlcy5pbmNsdWRlcyhibG9jay50eXBlSWQpKSByZXR1cm4gW107XHJcblxyXG4gICAgICAgICAgICB0cmVlLnB1c2gobG9jYXRpb24uY2xvbmUoKSk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHB1YmxpYyBvdmVycmlkZSBlbnN1cmVGZWF0dXJlKGZlYXR1cmU6IEZlYXR1cmUpOiBGZWF0dXJlIHwgbnVsbCB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuZW5zdXJlVmVpbkZlYXR1cmUoZmVhdHVyZSk7XHJcbiAgICB9XHJcbn1cclxuIl0sIm5hbWVzIjpbIkZlYXR1cmVDYWNoZURhdGEiLCJGZWF0dXJlVHlwZSIsIlYzIiwiQmxvY2tVdGlscyIsIlRyZWVGZWF0dXJlVHlwZSIsInByb2Nlc3NCbG9jayIsImJsb2NrIiwidHJlZSIsImNvbXB1dGVUcmVlIiwibGVuZ3RoIiwicm9vdCIsImdldFRyZWVSb290IiwiYnVpbGRGZWF0dXJlIiwiaWRlbnRpZmllciIsInNvcnQiLCJhIiwiYiIsInkiLCJsb2NhdGlvbiIsImZyb21CbG9jayIsIm92ZXJ3b3JsZCIsImlzTG9hZGVkIiwiZnJvbVYzIiwiYmFzZVR5cGVzIiwiaW5jbHVkZXMiLCJ0eXBlSWQiLCJzZWFyY2hCbG9ja1R5cGVzIiwiYWRkIiwibGVhZlR5cGVzIiwicHVzaCIsImNsb25lIiwiZW5zdXJlRmVhdHVyZSIsImZlYXR1cmUiLCJlbnN1cmVWZWluRmVhdHVyZSIsIlRyZWVCbG9ja1R5cGVzIiwiVHJlZUxlYWZUeXBlcyIsIlRyZWVCYXNlVHlwZXMiXSwibWFwcGluZ3MiOiJBQUNBLE9BQU9BLHNCQUFzQix3QkFBd0I7QUFDckQsT0FBT0MsaUJBQWlCLDJCQUEyQjtBQUVuRCxPQUFPQyxRQUFRLHFCQUFxQjtBQUNwQyxPQUFPQyxnQkFBZ0IsbUJBQW1CO0FBRTNCLE1BQU1DLHdCQUF3Qkg7SUFPbENJLGFBQWFDLEtBQVksRUFBa0I7UUFDOUMsTUFBTUMsT0FBTyxJQUFJLENBQUNDLFdBQVcsQ0FBQ0Y7UUFDOUIsSUFBSUMsS0FBS0UsTUFBTSxLQUFLLEdBQUcsT0FBTztRQUU5QixNQUFNQyxPQUFPLElBQUksQ0FBQ0MsV0FBVyxDQUFDSjtRQUM5QixPQUFPLElBQUksQ0FBQ0ssWUFBWSxDQUFDLElBQUksQ0FBQ0MsVUFBVSxFQUFFSCxNQUFNSDtJQUNwRDtJQUVRSSxZQUFZSixJQUFVLEVBQU07UUFDaENBLEtBQUtPLElBQUksQ0FBQyxDQUFDQyxHQUFHQyxJQUFNRCxFQUFFRSxDQUFDLEdBQUdELEVBQUVDLENBQUM7UUFDN0IsT0FBT1YsSUFBSSxDQUFDLEVBQUU7SUFDbEI7SUFFUUMsWUFBWUYsS0FBWSxFQUFRO1FBQ3BDLElBQUlZLFdBQVdoQixHQUFHaUIsU0FBUyxDQUFDYixPQUFPYztRQUNuQyxNQUFNYixPQUFhLEVBQUU7UUFFckIsSUFBSSxDQUFDVyxTQUFTRyxRQUFRLElBQUksT0FBTyxFQUFFO1FBRW5DLDRDQUE0QztRQUM1QyxpREFBaUQ7UUFDakQsTUFBTyxLQUFNO1lBQ1QsTUFBTWYsUUFBUUgsV0FBV21CLE1BQU0sQ0FBQ0o7WUFDaEMsSUFBSSxDQUFDWixPQUFPLE9BQU8sRUFBRTtZQUVyQixhQUFhO1lBQ2IsSUFBSSxJQUFJLENBQUNpQixTQUFTLENBQUNDLFFBQVEsQ0FBQ2xCLE1BQU1tQixNQUFNLEdBQUc7WUFFM0Msa0RBQWtEO1lBQ2xELElBQUksQ0FBQyxJQUFJLENBQUNDLGdCQUFnQixDQUFDRixRQUFRLENBQUNsQixNQUFNbUIsTUFBTSxHQUFHLE9BQU8sRUFBRTtZQUU1RFAsU0FBU1MsR0FBRyxDQUFDLEdBQUcsQ0FBQyxHQUFHO1FBQ3hCO1FBRUEsd0NBQXdDO1FBQ3hDLGlEQUFpRDtRQUNqRCxNQUFPLEtBQU07WUFDVFQsV0FBV0EsU0FBU1MsR0FBRyxDQUFDLEdBQUcsR0FBRztZQUU5QixNQUFNckIsUUFBUUgsV0FBV21CLE1BQU0sQ0FBQ0o7WUFDaEMsSUFBSSxDQUFDWixPQUFPLE9BQU8sRUFBRTtZQUVyQiw0Q0FBNEM7WUFDNUMsSUFBSSxJQUFJLENBQUNzQixTQUFTLENBQUNKLFFBQVEsQ0FBQ2xCLE1BQU1tQixNQUFNLEdBQUcsT0FBT2xCO1lBRWxELHVFQUF1RTtZQUN2RSxJQUFJLENBQUMsSUFBSSxDQUFDbUIsZ0JBQWdCLENBQUNGLFFBQVEsQ0FBQ2xCLE1BQU1tQixNQUFNLEdBQUcsT0FBTyxFQUFFO1lBRTVEbEIsS0FBS3NCLElBQUksQ0FBQ1gsU0FBU1ksS0FBSztRQUM1QjtJQUNKO0lBRWdCQyxjQUFjQyxPQUFnQixFQUFrQjtRQUM1RCxPQUFPLElBQUksQ0FBQ0MsaUJBQWlCLENBQUNEO0lBQ2xDOzs7YUExRGdCTixtQkFBbUIxQixpQkFBaUJrQyxjQUFjO2FBQ2xETixZQUFZNUIsaUJBQWlCbUMsYUFBYTthQUMxQ1osWUFBWXZCLGlCQUFpQm9DLGFBQWE7O0FBeUQ5RDtBQTlEcUJoQyxnQkFDTVMsYUFBYTtBQUR4QyxTQUFxQlQsNkJBOERwQiJ9