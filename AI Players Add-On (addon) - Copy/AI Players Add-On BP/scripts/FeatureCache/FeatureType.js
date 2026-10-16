import CylinderHelper from "FeatureCache/CylinderHelper";
import FeatureCache from "FeatureCache/FeatureCache";
import V3 from "Helpers/Vectors/V3";
import HomeHelper from "Homes/HomeHelper";
class FeatureType {
    get identifier() {
        return this.constructor.identifier;
    }
    buildFeature(type, root, blocks) {
        const subchunkKey = FeatureCache.blockToSubchunk(root).toString();
        const id = `${type}_${this.nextInstanceId++}`;
        return {
            id,
            type,
            root,
            blocks,
            subchunkKey,
            lockedBy: null,
            isRemoved: false
        };
    }
    tryProcessBlock(block, force = false) {
        if (!this.searchBlockTypes.includes(block.typeId)) return null;
        if (this.isProcessed(V3.fromBlock(block, overworld)) && !force) return null;
        const feature = this.processBlock(block);
        if (!feature) return null;
        this.markProcessed(feature.blocks);
        return feature;
    }
    ensureFeature(feature) {
        return feature;
    }
    /** Note: mutates `feature.root` in-place when the original origin block is mined. */ ensureVeinFeature(feature) {
        if (!feature?.root) return null;
        const dimension = feature.root?.dimension ?? overworld;
        const rootBlock = dimension.getBlock(feature.root);
        if (rootBlock && this.searchBlockTypes.includes(rootBlock.typeId)) return feature;
        const newBlocks = [];
        // Find new origin
        for (const blockV3 of feature.blocks){
            const block = dimension.getBlock(blockV3);
            if (!block || !this.searchBlockTypes.includes(block.typeId)) {
                this.featuresByLocation.delete(blockV3.toString());
                continue;
            }
            newBlocks.push(blockV3);
        }
        if (!newBlocks.length) return null;
        feature.blocks = newBlocks;
        feature.root = newBlocks[0];
        return feature;
    }
    // #region Feature Storage
    addFeature(feature) {
        const key = feature.subchunkKey;
        const list = this.featuresBySubchunk.get(key);
        if (list) list.push(feature);
        else this.featuresBySubchunk.set(key, [
            feature
        ]);
        for (const block of feature.blocks)this.featuresByLocation.set(block.toString(), feature);
        this.featuresById.set(feature.id, feature);
    }
    removeFeature(feature) {
        const list = this.featuresBySubchunk.get(feature.subchunkKey);
        if (!list) return false;
        const index = list.findIndex((f)=>f.id === feature.id);
        if (index === -1) return false;
        list.splice(index, 1);
        if (list.length === 0) this.featuresBySubchunk.delete(feature.subchunkKey);
        for (const block of feature.blocks)this.featuresByLocation.delete(block.toString());
        this.featuresById.delete(feature.id);
        return true;
    }
    getFeatures(subchunkKey) {
        return this.featuresBySubchunk.get(subchunkKey) ?? [];
    }
    getFeatureAtLocation(locationKey) {
        return this.featuresByLocation.get(locationKey);
    }
    getFeatureById(id) {
        return this.featuresById.get(id);
    }
    clearFeatures(subchunkKey) {
        const list = this.featuresBySubchunk.get(subchunkKey);
        if (list) {
            for (const feature of list){
                for (const block of feature.blocks)this.featuresByLocation.delete(block.toString());
                this.featuresById.delete(feature.id);
            }
        }
        this.featuresBySubchunk.delete(subchunkKey);
    }
    // #endregion
    // #region Processed Blocks
    isProcessed(location) {
        const subchunkKey = FeatureCache.blockToSubchunk(location).toString();
        return this.processedBlocks.get(subchunkKey)?.has(location.toString()) ?? false;
    }
    markProcessed(locations) {
        for (const location of locations){
            const subchunkKey = FeatureCache.blockToSubchunk(location).toString();
            let set = this.processedBlocks.get(subchunkKey);
            if (!set) {
                set = new Set();
                this.processedBlocks.set(subchunkKey, set);
            }
            set.add(location.toString());
        }
    }
    clearProcessed(subchunkKey) {
        this.processedBlocks.delete(subchunkKey);
    }
    // #endregion
    // #region Nearest
    getNearestUnlockedFeatureInCylinder(center, cylinder) {
        const subchunks = CylinderHelper.getSubchunksInCylinder(center, cylinder, this.featuresBySubchunk);
        let bestFeature = null;
        let bestDistance = Infinity;
        const isInCylinder = (feature)=>this.isFeatureInCylinder(feature, center, cylinder);
        const isInHome = (feature)=>HomeHelper.isFeatureInNearestHome(feature);
        const condition = (feature)=>isInCylinder(feature) && !isInHome(feature);
        for (const { object: subchunk, distance } of subchunks){
            // If the closest possible point in this subchunk is farther than our best feature, stop
            if (bestFeature && distance >= bestDistance) break;
            let candidate;
            do {
                candidate = this.getNearestUnlockedFeatureInSubchunk(center, subchunk, condition);
                if (!candidate) break;
                const ensuredFeature = this.ensureFeature(candidate);
                if (!ensuredFeature) {
                    this.removeFeature(candidate);
                    continue;
                }
                const d = center.distance(ensuredFeature.root);
                if (d < bestDistance) {
                    bestFeature = ensuredFeature;
                    bestDistance = d;
                }
                break;
            }while (candidate)
        }
        return bestFeature;
    }
    isFeatureInCylinder(feature, center, cylinder) {
        const relative = feature.root.$.subtract(center);
        const verticalOffset = relative.y;
        const horizontalDistance = relative.$.setAxis("y", 0).length();
        return horizontalDistance <= cylinder.radius && verticalOffset >= cylinder.yOffsetRange[0] && verticalOffset <= cylinder.yOffsetRange[1];
    }
    /** Gets the nearest unlocked feature in a specific subchunk, optionally including conditions. */ getNearestUnlockedFeatureInSubchunk(center, subchunk, condition) {
        const subchunkKey = subchunk.toString();
        const features = this.getFeatures(subchunkKey);
        let best = null;
        for (const feature of features){
            if (!feature.root) continue;
            if (feature.lockedBy !== null) continue;
            if (condition && !condition(feature)) continue;
            const d = center.distance(feature.root);
            if (!best || d < best.distance) best = {
                object: feature,
                distance: d
            };
        }
        return best?.object ?? null;
    }
    constructor(){
        this.isLazy = false;
        this.processedBlocks = new Map();
        this.featuresBySubchunk = new Map();
        this.featuresByLocation = new Map();
        this.featuresById = new Map();
        this.nextInstanceId = 0;
    }
}
export { FeatureType as default };

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkZlYXR1cmVUeXBlLnRzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEJsb2NrIH0gZnJvbSBcIkBtaW5lY3JhZnQvc2VydmVyXCI7XHJcblxyXG5pbXBvcnQgQ3lsaW5kZXJIZWxwZXIgZnJvbSBcIkZlYXR1cmVDYWNoZS9DeWxpbmRlckhlbHBlclwiO1xyXG5pbXBvcnQgRmVhdHVyZUNhY2hlIGZyb20gXCJGZWF0dXJlQ2FjaGUvRmVhdHVyZUNhY2hlXCI7XHJcbmltcG9ydCBWMyBmcm9tIFwiSGVscGVycy9WZWN0b3JzL1YzXCI7XHJcblxyXG5pbXBvcnQgSG9tZUhlbHBlciBmcm9tIFwiSG9tZXMvSG9tZUhlbHBlclwiO1xyXG5pbXBvcnQgeyBGZWF0dXJlLCBPYmplY3REaXN0YW5jZSwgU2VhcmNoQ3lsaW5kZXIgfSBmcm9tIFwiLi9UeXBlc1wiO1xyXG5cclxuZXhwb3J0IGRlZmF1bHQgYWJzdHJhY3QgY2xhc3MgRmVhdHVyZVR5cGUge1xyXG4gICAgcHVibGljIHJlYWRvbmx5IGlzTGF6eTogYm9vbGVhbiA9IGZhbHNlO1xyXG5cclxuICAgIHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgaWRlbnRpZmllcjogc3RyaW5nO1xyXG4gICAgcHVibGljIGdldCBpZGVudGlmaWVyKCk6IHN0cmluZyB7XHJcbiAgICAgICAgcmV0dXJuICh0aGlzLmNvbnN0cnVjdG9yIGFzIHR5cGVvZiBGZWF0dXJlVHlwZSkuaWRlbnRpZmllcjtcclxuICAgIH1cclxuXHJcbiAgICBwdWJsaWMgYWJzdHJhY3QgcmVhZG9ubHkgc2VhcmNoQmxvY2tUeXBlczogc3RyaW5nW107XHJcblxyXG4gICAgcHJpdmF0ZSByZWFkb25seSBwcm9jZXNzZWRCbG9ja3MgPSBuZXcgTWFwPHN0cmluZywgU2V0PHN0cmluZz4+KCk7XHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGZlYXR1cmVzQnlTdWJjaHVuayA9IG5ldyBNYXA8c3RyaW5nLCBGZWF0dXJlW10+KCk7XHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGZlYXR1cmVzQnlMb2NhdGlvbiA9IG5ldyBNYXA8c3RyaW5nLCBGZWF0dXJlPigpO1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBmZWF0dXJlc0J5SWQgPSBuZXcgTWFwPHN0cmluZywgRmVhdHVyZT4oKTtcclxuICAgIHByaXZhdGUgbmV4dEluc3RhbmNlSWQgPSAwO1xyXG4gICAgcHVibGljIGFic3RyYWN0IHByb2Nlc3NCbG9jayhibG9jazogQmxvY2spOiBGZWF0dXJlIHwgbnVsbDtcclxuXHJcbiAgICBwdWJsaWMgYnVpbGRGZWF0dXJlKHR5cGU6IHN0cmluZywgcm9vdDogVjMsIGJsb2NrczogVjNbXSk6IEZlYXR1cmUge1xyXG4gICAgICAgIGNvbnN0IHN1YmNodW5rS2V5ID0gRmVhdHVyZUNhY2hlLmJsb2NrVG9TdWJjaHVuayhyb290KS50b1N0cmluZygpO1xyXG4gICAgICAgIGNvbnN0IGlkID0gYCR7dHlwZX1fJHt0aGlzLm5leHRJbnN0YW5jZUlkKyt9YDtcclxuICAgICAgICByZXR1cm4ge1xyXG4gICAgICAgICAgICBpZCxcclxuICAgICAgICAgICAgdHlwZSxcclxuICAgICAgICAgICAgcm9vdCxcclxuICAgICAgICAgICAgYmxvY2tzLFxyXG4gICAgICAgICAgICBzdWJjaHVua0tleSxcclxuICAgICAgICAgICAgbG9ja2VkQnk6IG51bGwsXHJcbiAgICAgICAgICAgIGlzUmVtb3ZlZDogZmFsc2UsXHJcbiAgICAgICAgfTtcclxuICAgIH1cclxuXHJcbiAgICBwdWJsaWMgdHJ5UHJvY2Vzc0Jsb2NrKGJsb2NrOiBCbG9jaywgZm9yY2U6IGJvb2xlYW4gPSBmYWxzZSk6IEZlYXR1cmUgfCBudWxsIHtcclxuICAgICAgICBpZiAoIXRoaXMuc2VhcmNoQmxvY2tUeXBlcy5pbmNsdWRlcyhibG9jay50eXBlSWQpKSByZXR1cm4gbnVsbDtcclxuICAgICAgICBpZiAodGhpcy5pc1Byb2Nlc3NlZChWMy5mcm9tQmxvY2soYmxvY2ssIG92ZXJ3b3JsZCkpICYmICFmb3JjZSkgcmV0dXJuIG51bGw7XHJcblxyXG4gICAgICAgIGNvbnN0IGZlYXR1cmUgPSB0aGlzLnByb2Nlc3NCbG9jayhibG9jayk7XHJcbiAgICAgICAgaWYgKCFmZWF0dXJlKSByZXR1cm4gbnVsbDtcclxuXHJcbiAgICAgICAgdGhpcy5tYXJrUHJvY2Vzc2VkKGZlYXR1cmUuYmxvY2tzKTtcclxuICAgICAgICByZXR1cm4gZmVhdHVyZTtcclxuICAgIH1cclxuXHJcbiAgICBwdWJsaWMgZW5zdXJlRmVhdHVyZShmZWF0dXJlOiBGZWF0dXJlKTogRmVhdHVyZSB8IG51bGwge1xyXG4gICAgICAgIHJldHVybiBmZWF0dXJlO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBOb3RlOiBtdXRhdGVzIGBmZWF0dXJlLnJvb3RgIGluLXBsYWNlIHdoZW4gdGhlIG9yaWdpbmFsIG9yaWdpbiBibG9jayBpcyBtaW5lZC4gKi9cclxuICAgIHByb3RlY3RlZCBlbnN1cmVWZWluRmVhdHVyZShmZWF0dXJlOiBGZWF0dXJlKSB7XHJcbiAgICAgICAgaWYgKCFmZWF0dXJlPy5yb290KSByZXR1cm4gbnVsbDtcclxuXHJcbiAgICAgICAgY29uc3QgZGltZW5zaW9uID0gZmVhdHVyZS5yb290Py5kaW1lbnNpb24gPz8gb3ZlcndvcmxkO1xyXG4gICAgICAgIGNvbnN0IHJvb3RCbG9jayA9IGRpbWVuc2lvbi5nZXRCbG9jayhmZWF0dXJlLnJvb3QpO1xyXG4gICAgICAgIGlmIChyb290QmxvY2sgJiYgdGhpcy5zZWFyY2hCbG9ja1R5cGVzLmluY2x1ZGVzKHJvb3RCbG9jay50eXBlSWQpKSByZXR1cm4gZmVhdHVyZTtcclxuXHJcbiAgICAgICAgY29uc3QgbmV3QmxvY2tzOiBWM1tdID0gW107XHJcblxyXG4gICAgICAgIC8vIEZpbmQgbmV3IG9yaWdpblxyXG4gICAgICAgIGZvciAoY29uc3QgYmxvY2tWMyBvZiBmZWF0dXJlLmJsb2Nrcykge1xyXG4gICAgICAgICAgICBjb25zdCBibG9jayA9IGRpbWVuc2lvbi5nZXRCbG9jayhibG9ja1YzKTtcclxuICAgICAgICAgICAgaWYgKCFibG9jayB8fCAhdGhpcy5zZWFyY2hCbG9ja1R5cGVzLmluY2x1ZGVzKGJsb2NrLnR5cGVJZCkpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuZmVhdHVyZXNCeUxvY2F0aW9uLmRlbGV0ZShibG9ja1YzLnRvU3RyaW5nKCkpO1xyXG4gICAgICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgbmV3QmxvY2tzLnB1c2goYmxvY2tWMyk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBpZiAoIW5ld0Jsb2Nrcy5sZW5ndGgpIHJldHVybiBudWxsO1xyXG5cclxuICAgICAgICBmZWF0dXJlLmJsb2NrcyA9IG5ld0Jsb2NrcztcclxuICAgICAgICBmZWF0dXJlLnJvb3QgPSBuZXdCbG9ja3NbMF07XHJcblxyXG4gICAgICAgIHJldHVybiBmZWF0dXJlO1xyXG4gICAgfVxyXG5cclxuICAgIC8vICNyZWdpb24gRmVhdHVyZSBTdG9yYWdlXHJcblxyXG4gICAgcHVibGljIGFkZEZlYXR1cmUoZmVhdHVyZTogRmVhdHVyZSk6IHZvaWQge1xyXG4gICAgICAgIGNvbnN0IGtleSA9IGZlYXR1cmUuc3ViY2h1bmtLZXk7XHJcbiAgICAgICAgY29uc3QgbGlzdCA9IHRoaXMuZmVhdHVyZXNCeVN1YmNodW5rLmdldChrZXkpO1xyXG4gICAgICAgIGlmIChsaXN0KSBsaXN0LnB1c2goZmVhdHVyZSk7XHJcbiAgICAgICAgZWxzZSB0aGlzLmZlYXR1cmVzQnlTdWJjaHVuay5zZXQoa2V5LCBbZmVhdHVyZV0pO1xyXG5cclxuICAgICAgICBmb3IgKGNvbnN0IGJsb2NrIG9mIGZlYXR1cmUuYmxvY2tzKSB0aGlzLmZlYXR1cmVzQnlMb2NhdGlvbi5zZXQoYmxvY2sudG9TdHJpbmcoKSwgZmVhdHVyZSk7XHJcbiAgICAgICAgdGhpcy5mZWF0dXJlc0J5SWQuc2V0KGZlYXR1cmUuaWQsIGZlYXR1cmUpO1xyXG4gICAgfVxyXG5cclxuICAgIHB1YmxpYyByZW1vdmVGZWF0dXJlKGZlYXR1cmU6IEZlYXR1cmUpOiBib29sZWFuIHtcclxuICAgICAgICBjb25zdCBsaXN0ID0gdGhpcy5mZWF0dXJlc0J5U3ViY2h1bmsuZ2V0KGZlYXR1cmUuc3ViY2h1bmtLZXkpO1xyXG4gICAgICAgIGlmICghbGlzdCkgcmV0dXJuIGZhbHNlO1xyXG4gICAgICAgIGNvbnN0IGluZGV4ID0gbGlzdC5maW5kSW5kZXgoKGYpID0+IGYuaWQgPT09IGZlYXR1cmUuaWQpO1xyXG4gICAgICAgIGlmIChpbmRleCA9PT0gLTEpIHJldHVybiBmYWxzZTtcclxuICAgICAgICBsaXN0LnNwbGljZShpbmRleCwgMSk7XHJcbiAgICAgICAgaWYgKGxpc3QubGVuZ3RoID09PSAwKSB0aGlzLmZlYXR1cmVzQnlTdWJjaHVuay5kZWxldGUoZmVhdHVyZS5zdWJjaHVua0tleSk7XHJcblxyXG4gICAgICAgIGZvciAoY29uc3QgYmxvY2sgb2YgZmVhdHVyZS5ibG9ja3MpIHRoaXMuZmVhdHVyZXNCeUxvY2F0aW9uLmRlbGV0ZShibG9jay50b1N0cmluZygpKTtcclxuICAgICAgICB0aGlzLmZlYXR1cmVzQnlJZC5kZWxldGUoZmVhdHVyZS5pZCk7XHJcblxyXG4gICAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgfVxyXG5cclxuICAgIHB1YmxpYyBnZXRGZWF0dXJlcyhzdWJjaHVua0tleTogc3RyaW5nKTogRmVhdHVyZVtdIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5mZWF0dXJlc0J5U3ViY2h1bmsuZ2V0KHN1YmNodW5rS2V5KSA/PyBbXTtcclxuICAgIH1cclxuXHJcbiAgICBwdWJsaWMgZ2V0RmVhdHVyZUF0TG9jYXRpb24obG9jYXRpb25LZXk6IHN0cmluZyk6IEZlYXR1cmUgfCB1bmRlZmluZWQge1xyXG4gICAgICAgIHJldHVybiB0aGlzLmZlYXR1cmVzQnlMb2NhdGlvbi5nZXQobG9jYXRpb25LZXkpO1xyXG4gICAgfVxyXG5cclxuICAgIHB1YmxpYyBnZXRGZWF0dXJlQnlJZChpZDogc3RyaW5nKTogRmVhdHVyZSB8IHVuZGVmaW5lZCB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuZmVhdHVyZXNCeUlkLmdldChpZCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHVibGljIGNsZWFyRmVhdHVyZXMoc3ViY2h1bmtLZXk6IHN0cmluZyk6IHZvaWQge1xyXG4gICAgICAgIGNvbnN0IGxpc3QgPSB0aGlzLmZlYXR1cmVzQnlTdWJjaHVuay5nZXQoc3ViY2h1bmtLZXkpO1xyXG4gICAgICAgIGlmIChsaXN0KSB7XHJcbiAgICAgICAgICAgIGZvciAoY29uc3QgZmVhdHVyZSBvZiBsaXN0KSB7XHJcbiAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IGJsb2NrIG9mIGZlYXR1cmUuYmxvY2tzKSB0aGlzLmZlYXR1cmVzQnlMb2NhdGlvbi5kZWxldGUoYmxvY2sudG9TdHJpbmcoKSk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmZlYXR1cmVzQnlJZC5kZWxldGUoZmVhdHVyZS5pZCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRoaXMuZmVhdHVyZXNCeVN1YmNodW5rLmRlbGV0ZShzdWJjaHVua0tleSk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gI2VuZHJlZ2lvblxyXG5cclxuICAgIC8vICNyZWdpb24gUHJvY2Vzc2VkIEJsb2Nrc1xyXG5cclxuICAgIHB1YmxpYyBpc1Byb2Nlc3NlZChsb2NhdGlvbjogVjMpOiBib29sZWFuIHtcclxuICAgICAgICBjb25zdCBzdWJjaHVua0tleSA9IEZlYXR1cmVDYWNoZS5ibG9ja1RvU3ViY2h1bmsobG9jYXRpb24pLnRvU3RyaW5nKCk7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMucHJvY2Vzc2VkQmxvY2tzLmdldChzdWJjaHVua0tleSk/Lmhhcyhsb2NhdGlvbi50b1N0cmluZygpKSA/PyBmYWxzZTtcclxuICAgIH1cclxuXHJcbiAgICBwdWJsaWMgbWFya1Byb2Nlc3NlZChsb2NhdGlvbnM6IFYzW10pOiB2b2lkIHtcclxuICAgICAgICBmb3IgKGNvbnN0IGxvY2F0aW9uIG9mIGxvY2F0aW9ucykge1xyXG4gICAgICAgICAgICBjb25zdCBzdWJjaHVua0tleSA9IEZlYXR1cmVDYWNoZS5ibG9ja1RvU3ViY2h1bmsobG9jYXRpb24pLnRvU3RyaW5nKCk7XHJcbiAgICAgICAgICAgIGxldCBzZXQgPSB0aGlzLnByb2Nlc3NlZEJsb2Nrcy5nZXQoc3ViY2h1bmtLZXkpO1xyXG4gICAgICAgICAgICBpZiAoIXNldCkge1xyXG4gICAgICAgICAgICAgICAgc2V0ID0gbmV3IFNldCgpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5wcm9jZXNzZWRCbG9ja3Muc2V0KHN1YmNodW5rS2V5LCBzZXQpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHNldC5hZGQobG9jYXRpb24udG9TdHJpbmcoKSk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHB1YmxpYyBjbGVhclByb2Nlc3NlZChzdWJjaHVua0tleTogc3RyaW5nKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5wcm9jZXNzZWRCbG9ja3MuZGVsZXRlKHN1YmNodW5rS2V5KTtcclxuICAgIH1cclxuXHJcbiAgICAvLyAjZW5kcmVnaW9uXHJcblxyXG4gICAgLy8gI3JlZ2lvbiBOZWFyZXN0XHJcblxyXG4gICAgcHVibGljIGdldE5lYXJlc3RVbmxvY2tlZEZlYXR1cmVJbkN5bGluZGVyKGNlbnRlcjogVjMsIGN5bGluZGVyOiBTZWFyY2hDeWxpbmRlcik6IEZlYXR1cmUgfCBudWxsIHtcclxuICAgICAgICBjb25zdCBzdWJjaHVua3MgPSBDeWxpbmRlckhlbHBlci5nZXRTdWJjaHVua3NJbkN5bGluZGVyKGNlbnRlciwgY3lsaW5kZXIsIHRoaXMuZmVhdHVyZXNCeVN1YmNodW5rKTtcclxuXHJcbiAgICAgICAgbGV0IGJlc3RGZWF0dXJlOiBGZWF0dXJlIHwgbnVsbCA9IG51bGw7XHJcbiAgICAgICAgbGV0IGJlc3REaXN0YW5jZSA9IEluZmluaXR5O1xyXG5cclxuICAgICAgICBjb25zdCBpc0luQ3lsaW5kZXIgPSAoZmVhdHVyZTogRmVhdHVyZSkgPT4gdGhpcy5pc0ZlYXR1cmVJbkN5bGluZGVyKGZlYXR1cmUsIGNlbnRlciwgY3lsaW5kZXIpO1xyXG4gICAgICAgIGNvbnN0IGlzSW5Ib21lID0gKGZlYXR1cmU6IEZlYXR1cmUpID0+IEhvbWVIZWxwZXIuaXNGZWF0dXJlSW5OZWFyZXN0SG9tZShmZWF0dXJlKTtcclxuICAgICAgICBjb25zdCBjb25kaXRpb24gPSAoZmVhdHVyZTogRmVhdHVyZSkgPT4gaXNJbkN5bGluZGVyKGZlYXR1cmUpICYmICFpc0luSG9tZShmZWF0dXJlKTtcclxuXHJcbiAgICAgICAgZm9yIChjb25zdCB7IG9iamVjdDogc3ViY2h1bmssIGRpc3RhbmNlIH0gb2Ygc3ViY2h1bmtzKSB7XHJcbiAgICAgICAgICAgIC8vIElmIHRoZSBjbG9zZXN0IHBvc3NpYmxlIHBvaW50IGluIHRoaXMgc3ViY2h1bmsgaXMgZmFydGhlciB0aGFuIG91ciBiZXN0IGZlYXR1cmUsIHN0b3BcclxuICAgICAgICAgICAgaWYgKGJlc3RGZWF0dXJlICYmIGRpc3RhbmNlID49IGJlc3REaXN0YW5jZSkgYnJlYWs7XHJcblxyXG4gICAgICAgICAgICBsZXQgY2FuZGlkYXRlOiBGZWF0dXJlIHwgbnVsbDtcclxuICAgICAgICAgICAgZG8ge1xyXG4gICAgICAgICAgICAgICAgY2FuZGlkYXRlID0gdGhpcy5nZXROZWFyZXN0VW5sb2NrZWRGZWF0dXJlSW5TdWJjaHVuayhjZW50ZXIsIHN1YmNodW5rLCBjb25kaXRpb24pO1xyXG4gICAgICAgICAgICAgICAgaWYgKCFjYW5kaWRhdGUpIGJyZWFrO1xyXG5cclxuICAgICAgICAgICAgICAgIGNvbnN0IGVuc3VyZWRGZWF0dXJlID0gdGhpcy5lbnN1cmVGZWF0dXJlKGNhbmRpZGF0ZSk7XHJcbiAgICAgICAgICAgICAgICBpZiAoIWVuc3VyZWRGZWF0dXJlKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5yZW1vdmVGZWF0dXJlKGNhbmRpZGF0ZSk7XHJcbiAgICAgICAgICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAgICAgY29uc3QgZCA9IGNlbnRlci5kaXN0YW5jZShlbnN1cmVkRmVhdHVyZS5yb290KTtcclxuICAgICAgICAgICAgICAgIGlmIChkIDwgYmVzdERpc3RhbmNlKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgYmVzdEZlYXR1cmUgPSBlbnN1cmVkRmVhdHVyZTtcclxuICAgICAgICAgICAgICAgICAgICBiZXN0RGlzdGFuY2UgPSBkO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIH0gd2hpbGUgKGNhbmRpZGF0ZSk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICByZXR1cm4gYmVzdEZlYXR1cmU7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBpc0ZlYXR1cmVJbkN5bGluZGVyKGZlYXR1cmU6IEZlYXR1cmUsIGNlbnRlcjogVjMsIGN5bGluZGVyOiBTZWFyY2hDeWxpbmRlcik6IGJvb2xlYW4ge1xyXG4gICAgICAgIGNvbnN0IHJlbGF0aXZlID0gZmVhdHVyZS5yb290LiQuc3VidHJhY3QoY2VudGVyKTtcclxuICAgICAgICBjb25zdCB2ZXJ0aWNhbE9mZnNldCA9IHJlbGF0aXZlLnk7XHJcbiAgICAgICAgY29uc3QgaG9yaXpvbnRhbERpc3RhbmNlID0gcmVsYXRpdmUuJC5zZXRBeGlzKFwieVwiLCAwKS5sZW5ndGgoKTtcclxuXHJcbiAgICAgICAgcmV0dXJuIChcclxuICAgICAgICAgICAgaG9yaXpvbnRhbERpc3RhbmNlIDw9IGN5bGluZGVyLnJhZGl1cyAmJlxyXG4gICAgICAgICAgICB2ZXJ0aWNhbE9mZnNldCA+PSBjeWxpbmRlci55T2Zmc2V0UmFuZ2VbMF0gJiZcclxuICAgICAgICAgICAgdmVydGljYWxPZmZzZXQgPD0gY3lsaW5kZXIueU9mZnNldFJhbmdlWzFdXHJcbiAgICAgICAgKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogR2V0cyB0aGUgbmVhcmVzdCB1bmxvY2tlZCBmZWF0dXJlIGluIGEgc3BlY2lmaWMgc3ViY2h1bmssIG9wdGlvbmFsbHkgaW5jbHVkaW5nIGNvbmRpdGlvbnMuICovXHJcbiAgICBwcm90ZWN0ZWQgZ2V0TmVhcmVzdFVubG9ja2VkRmVhdHVyZUluU3ViY2h1bmsoY2VudGVyOiBWMywgc3ViY2h1bms6IFYzLCBjb25kaXRpb24/OiAoZmVhdHVyZTogRmVhdHVyZSkgPT4gYm9vbGVhbik6IEZlYXR1cmUgfCBudWxsIHtcclxuICAgICAgICBjb25zdCBzdWJjaHVua0tleSA9IHN1YmNodW5rLnRvU3RyaW5nKCk7XHJcbiAgICAgICAgY29uc3QgZmVhdHVyZXMgPSB0aGlzLmdldEZlYXR1cmVzKHN1YmNodW5rS2V5KTtcclxuICAgICAgICBsZXQgYmVzdDogT2JqZWN0RGlzdGFuY2U8RmVhdHVyZT4gfCBudWxsID0gbnVsbDtcclxuXHJcbiAgICAgICAgZm9yIChjb25zdCBmZWF0dXJlIG9mIGZlYXR1cmVzKSB7XHJcbiAgICAgICAgICAgIGlmICghZmVhdHVyZS5yb290KSBjb250aW51ZTtcclxuICAgICAgICAgICAgaWYgKGZlYXR1cmUubG9ja2VkQnkgIT09IG51bGwpIGNvbnRpbnVlO1xyXG4gICAgICAgICAgICBpZiAoY29uZGl0aW9uICYmICFjb25kaXRpb24oZmVhdHVyZSkpIGNvbnRpbnVlO1xyXG4gICAgICAgICAgICBjb25zdCBkID0gY2VudGVyLmRpc3RhbmNlKGZlYXR1cmUucm9vdCk7XHJcbiAgICAgICAgICAgIGlmICghYmVzdCB8fCBkIDwgYmVzdC5kaXN0YW5jZSkgYmVzdCA9IHsgb2JqZWN0OiBmZWF0dXJlLCBkaXN0YW5jZTogZCB9O1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gYmVzdD8ub2JqZWN0ID8/IG51bGw7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gI2VuZHJlZ2lvblxyXG59XHJcbiJdLCJuYW1lcyI6WyJDeWxpbmRlckhlbHBlciIsIkZlYXR1cmVDYWNoZSIsIlYzIiwiSG9tZUhlbHBlciIsIkZlYXR1cmVUeXBlIiwiaWRlbnRpZmllciIsImNvbnN0cnVjdG9yIiwiYnVpbGRGZWF0dXJlIiwidHlwZSIsInJvb3QiLCJibG9ja3MiLCJzdWJjaHVua0tleSIsImJsb2NrVG9TdWJjaHVuayIsInRvU3RyaW5nIiwiaWQiLCJuZXh0SW5zdGFuY2VJZCIsImxvY2tlZEJ5IiwiaXNSZW1vdmVkIiwidHJ5UHJvY2Vzc0Jsb2NrIiwiYmxvY2siLCJmb3JjZSIsInNlYXJjaEJsb2NrVHlwZXMiLCJpbmNsdWRlcyIsInR5cGVJZCIsImlzUHJvY2Vzc2VkIiwiZnJvbUJsb2NrIiwib3ZlcndvcmxkIiwiZmVhdHVyZSIsInByb2Nlc3NCbG9jayIsIm1hcmtQcm9jZXNzZWQiLCJlbnN1cmVGZWF0dXJlIiwiZW5zdXJlVmVpbkZlYXR1cmUiLCJkaW1lbnNpb24iLCJyb290QmxvY2siLCJnZXRCbG9jayIsIm5ld0Jsb2NrcyIsImJsb2NrVjMiLCJmZWF0dXJlc0J5TG9jYXRpb24iLCJkZWxldGUiLCJwdXNoIiwibGVuZ3RoIiwiYWRkRmVhdHVyZSIsImtleSIsImxpc3QiLCJmZWF0dXJlc0J5U3ViY2h1bmsiLCJnZXQiLCJzZXQiLCJmZWF0dXJlc0J5SWQiLCJyZW1vdmVGZWF0dXJlIiwiaW5kZXgiLCJmaW5kSW5kZXgiLCJmIiwic3BsaWNlIiwiZ2V0RmVhdHVyZXMiLCJnZXRGZWF0dXJlQXRMb2NhdGlvbiIsImxvY2F0aW9uS2V5IiwiZ2V0RmVhdHVyZUJ5SWQiLCJjbGVhckZlYXR1cmVzIiwibG9jYXRpb24iLCJwcm9jZXNzZWRCbG9ja3MiLCJoYXMiLCJsb2NhdGlvbnMiLCJTZXQiLCJhZGQiLCJjbGVhclByb2Nlc3NlZCIsImdldE5lYXJlc3RVbmxvY2tlZEZlYXR1cmVJbkN5bGluZGVyIiwiY2VudGVyIiwiY3lsaW5kZXIiLCJzdWJjaHVua3MiLCJnZXRTdWJjaHVua3NJbkN5bGluZGVyIiwiYmVzdEZlYXR1cmUiLCJiZXN0RGlzdGFuY2UiLCJJbmZpbml0eSIsImlzSW5DeWxpbmRlciIsImlzRmVhdHVyZUluQ3lsaW5kZXIiLCJpc0luSG9tZSIsImlzRmVhdHVyZUluTmVhcmVzdEhvbWUiLCJjb25kaXRpb24iLCJvYmplY3QiLCJzdWJjaHVuayIsImRpc3RhbmNlIiwiY2FuZGlkYXRlIiwiZ2V0TmVhcmVzdFVubG9ja2VkRmVhdHVyZUluU3ViY2h1bmsiLCJlbnN1cmVkRmVhdHVyZSIsImQiLCJyZWxhdGl2ZSIsIiQiLCJzdWJ0cmFjdCIsInZlcnRpY2FsT2Zmc2V0IiwieSIsImhvcml6b250YWxEaXN0YW5jZSIsInNldEF4aXMiLCJyYWRpdXMiLCJ5T2Zmc2V0UmFuZ2UiLCJmZWF0dXJlcyIsImJlc3QiLCJpc0xhenkiLCJNYXAiXSwibWFwcGluZ3MiOiJBQUVBLE9BQU9BLG9CQUFvQiw4QkFBOEI7QUFDekQsT0FBT0Msa0JBQWtCLDRCQUE0QjtBQUNyRCxPQUFPQyxRQUFRLHFCQUFxQjtBQUVwQyxPQUFPQyxnQkFBZ0IsbUJBQW1CO0FBRzNCLE1BQWVDO0lBSTFCLElBQVdDLGFBQXFCO1FBQzVCLE9BQU8sQUFBQyxJQUFJLENBQUNDLFdBQVcsQ0FBd0JELFVBQVU7SUFDOUQ7SUFXT0UsYUFBYUMsSUFBWSxFQUFFQyxJQUFRLEVBQUVDLE1BQVksRUFBVztRQUMvRCxNQUFNQyxjQUFjVixhQUFhVyxlQUFlLENBQUNILE1BQU1JLFFBQVE7UUFDL0QsTUFBTUMsS0FBSyxDQUFDLEVBQUVOLEtBQUssQ0FBQyxFQUFFLElBQUksQ0FBQ08sY0FBYyxHQUFHLENBQUM7UUFDN0MsT0FBTztZQUNIRDtZQUNBTjtZQUNBQztZQUNBQztZQUNBQztZQUNBSyxVQUFVO1lBQ1ZDLFdBQVc7UUFDZjtJQUNKO0lBRU9DLGdCQUFnQkMsS0FBWSxFQUFFQyxRQUFpQixLQUFLLEVBQWtCO1FBQ3pFLElBQUksQ0FBQyxJQUFJLENBQUNDLGdC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