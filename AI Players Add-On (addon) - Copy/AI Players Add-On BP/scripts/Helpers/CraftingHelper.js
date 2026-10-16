import CraftingTreeData from "Data/CraftingTreeData";
import VirtualInventoryComponent from "Inventory/VirtualInventoryComponent";
class CraftingHelper {
    static doesItemRequireCraftingTable(itemId) {
        const recipe = this.getRecipeForResult(itemId);
        if (!recipe) return false;
        return recipe.requiresCraftingTable;
    }
    static getRecipeForResult(resultId) {
        return CraftingTreeData.Recipes.find((recipe)=>recipe.result.id === resultId) ?? null;
    }
    static canCraftItem(itemId, entity) {
        const recipe = this.getRecipeForResult(itemId);
        if (!recipe) return false;
        return this.canCraftRecipe(recipe, entity);
    }
    static getItemCountForIngredient(entity, ingredient) {
        return this.getItemCountForIngredientId(entity, ingredient.id);
    }
    static getItemCountForIngredientId(entity, ingredientId) {
        const resolved = CraftingHelper.TagResolutions[ingredientId];
        const inventory = VirtualInventoryComponent.get(entity);
        if (resolved) {
            return resolved.reduce((sum, id)=>sum + inventory.countItemType(id), 0);
        }
        return inventory.countItemType(ingredientId);
    }
    static canCraftRecipe(recipe, entity) {
        for (const ingredient of recipe.ingredients){
            if (this.getItemCountForIngredient(entity, ingredient) < ingredient.amount) {
                return false;
            }
        }
        return true;
    }
    // Resolves the concrete item ID from the entity's inventory that satisfies this ingredient. */
    static resolveIngredientId(entity, ingredient) {
        const resolutionOptions = CraftingHelper.TagResolutions[ingredient.id];
        const inventory = VirtualInventoryComponent.get(entity);
        if (resolutionOptions) {
            return resolutionOptions.find((id)=>inventory.countItemType(id) > 0);
        }
        return ingredient.id;
    }
    // Resolves the concrete result ID given the concrete ingredient ID that was consumed. */
    static resolveResultId(resultId, resolvedIngredientId) {
        return CraftingHelper.IngredientToResult[resolvedIngredientId] ?? resultId;
    }
    static getAllLogVariants(woodFamily) {
        return [
            woodFamily.log,
            woodFamily.strippedLog,
            woodFamily.wood,
            woodFamily.strippedWood
        ].filter((v)=>v !== null);
    }
    /**
     * Recursively traverses the recipe tree for item and returns the first base ingredient
     * (one with no crafting recipe) that the entity is missing, or null if none is found.
     */ static getFirstMissingBaseIngredient(item, entity) {
        const recipe = this.getRecipeForResult(item.id);
        if (!recipe) {
            //Base ingredient
            const currentCount = this.getItemCountForIngredientId(entity, item.id);
            const missing = item.amount - currentCount;
            return missing > 0 ? {
                id: item.id,
                amount: missing
            } : null;
        }
        const craftsNeeded = Math.ceil(item.amount / recipe.result.amount);
        for (const ingredient of recipe.ingredients){
            const totalNeeded = craftsNeeded * ingredient.amount;
            const currentCount = this.getItemCountForIngredient(entity, ingredient);
            if (currentCount >= totalNeeded) continue;
            const missingAmount = totalNeeded - currentCount;
            if (!this.getRecipeForResult(ingredient.id)) {
                //Base case
                return {
                    id: ingredient.id,
                    amount: missingAmount
                };
            }
            const base = this.getFirstMissingBaseIngredient({
                id: ingredient.id,
                amount: missingAmount
            }, entity);
            if (base !== null) return base;
        }
        return null;
    }
    /**
     * Returns all ingredients at every level of the crafting tree for the given item's recipe
     * (not the item itself). Includes both intermediate craftables and base ingredients,
     * so a chest can supply whichever level is available and skip unnecessary crafting steps.
     */ static getAllCraftingTreeIngredients(item) {
        const totals = new Map();
        const recipe = this.getRecipeForResult(item.id);
        if (!recipe) {
            totals.set(item.id, item.amount);
        } else {
            const craftsNeeded = Math.ceil(item.amount / recipe.result.amount);
            for (const ingredient of recipe.ingredients){
                CraftingHelper.accumulateAllIngredients({
                    id: ingredient.id,
                    amount: craftsNeeded * ingredient.amount
                }, totals);
            }
        }
        return Array.from(totals.entries()).map(([id, amount])=>({
                id,
                amount
            }));
    }
    static accumulateAllIngredients(item, totals) {
        totals.set(item.id, (totals.get(item.id) ?? 0) + item.amount);
        const recipe = this.getRecipeForResult(item.id);
        if (!recipe) return;
        const craftsNeeded = Math.ceil(item.amount / recipe.result.amount);
        for (const ingredient of recipe.ingredients){
            CraftingHelper.accumulateAllIngredients({
                id: ingredient.id,
                amount: craftsNeeded * ingredient.amount
            }, totals);
        }
    }
    static getRawMaterialFromSmeltedMaterialType(resultId) {
        const rawMaterial = Object.entries(CraftingTreeData.RawMaterialToSmeltedMaterialMap).find(([, smeltedMaterial])=>smeltedMaterial === resultId);
        return rawMaterial ? rawMaterial[0] : null;
    }
}
// Maps tag ingredient IDs to the concrete Minecraft item IDs that satisfy them
CraftingHelper.TagResolutions = {
    "family:logs": CraftingTreeData.WoodFamilies.flatMap(CraftingHelper.getAllLogVariants),
    "family:planks": CraftingTreeData.WoodFamilies.map((family)=>family.planks),
    "family:stone": CraftingTreeData.StoneFamily
};
// Maps a concrete ingredient ID to the concrete result ID it produces when a recipe result uses a tag.
CraftingHelper.IngredientToResult = Object.fromEntries(CraftingTreeData.WoodFamilies.flatMap((family)=>CraftingHelper.getAllLogVariants(family).map((variant)=>[
            variant,
            family.planks
        ])));
export { CraftingHelper as default };

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkNyYWZ0aW5nSGVscGVyLnRzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEVudGl0eSB9IGZyb20gXCJAbWluZWNyYWZ0L3NlcnZlclwiO1xyXG5pbXBvcnQgQ3JhZnRpbmdUcmVlRGF0YSwgeyBJbmdyZWRpZW50LCBSZWNpcGUsIFdvb2RGYW1pbHkgfSBmcm9tIFwiRGF0YS9DcmFmdGluZ1RyZWVEYXRhXCI7XHJcbmltcG9ydCBWaXJ0dWFsSW52ZW50b3J5Q29tcG9uZW50IGZyb20gXCJJbnZlbnRvcnkvVmlydHVhbEludmVudG9yeUNvbXBvbmVudFwiO1xyXG5cclxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgQ3JhZnRpbmdIZWxwZXIge1xyXG4gICAgLy8gTWFwcyB0YWcgaW5ncmVkaWVudCBJRHMgdG8gdGhlIGNvbmNyZXRlIE1pbmVjcmFmdCBpdGVtIElEcyB0aGF0IHNhdGlzZnkgdGhlbVxyXG4gICAgcHVibGljIHN0YXRpYyByZWFkb25seSBUYWdSZXNvbHV0aW9uczogUmVjb3JkPHN0cmluZywgc3RyaW5nW10+ID0ge1xyXG4gICAgICAgIFwiZmFtaWx5OmxvZ3NcIjogQ3JhZnRpbmdUcmVlRGF0YS5Xb29kRmFtaWxpZXMuZmxhdE1hcChDcmFmdGluZ0hlbHBlci5nZXRBbGxMb2dWYXJpYW50cyksXHJcbiAgICAgICAgXCJmYW1pbHk6cGxhbmtzXCI6IENyYWZ0aW5nVHJlZURhdGEuV29vZEZhbWlsaWVzLm1hcCgoZmFtaWx5KSA9PiBmYW1pbHkucGxhbmtzKSxcclxuICAgICAgICBcImZhbWlseTpzdG9uZVwiOiBDcmFmdGluZ1RyZWVEYXRhLlN0b25lRmFtaWx5LFxyXG4gICAgfTtcclxuXHJcbiAgICAvLyBNYXBzIGEgY29uY3JldGUgaW5ncmVkaWVudCBJRCB0byB0aGUgY29uY3JldGUgcmVzdWx0IElEIGl0IHByb2R1Y2VzIHdoZW4gYSByZWNpcGUgcmVzdWx0IHVzZXMgYSB0YWcuXHJcbiAgICBwdWJsaWMgc3RhdGljIHJlYWRvbmx5IEluZ3JlZGllbnRUb1Jlc3VsdDogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IE9iamVjdC5mcm9tRW50cmllcyhcclxuICAgICAgICBDcmFmdGluZ1RyZWVEYXRhLldvb2RGYW1pbGllcy5mbGF0TWFwKChmYW1pbHkpID0+XHJcbiAgICAgICAgICAgIENyYWZ0aW5nSGVscGVyLmdldEFsbExvZ1ZhcmlhbnRzKGZhbWlseSkubWFwKCh2YXJpYW50KSA9PiBbdmFyaWFudCwgZmFtaWx5LnBsYW5rc10pXHJcbiAgICAgICAgKVxyXG4gICAgKTtcclxuXHJcbiAgICBwdWJsaWMgc3RhdGljIGRvZXNJdGVtUmVxdWlyZUNyYWZ0aW5nVGFibGUoaXRlbUlkOiBzdHJpbmcpOiBib29sZWFuIHtcclxuICAgICAgICBjb25zdCByZWNpcGUgPSB0aGlzLmdldFJlY2lwZUZvclJlc3VsdChpdGVtSWQpO1xyXG4gICAgICAgIGlmICghcmVjaXBlKSByZXR1cm4gZmFsc2U7XHJcblxyXG4gICAgICAgIHJldHVybiByZWNpcGUucmVxdWlyZXNDcmFmdGluZ1RhYmxlO1xyXG4gICAgfVxyXG5cclxuICAgIHB1YmxpYyBzdGF0aWMgZ2V0UmVjaXBlRm9yUmVzdWx0KHJlc3VsdElkOiBzdHJpbmcpOiBSZWNpcGUgfCBudWxsIHtcclxuICAgICAgICByZXR1cm4gQ3JhZnRpbmdUcmVlRGF0YS5SZWNpcGVzLmZpbmQoKHJlY2lwZSkgPT4gcmVjaXBlLnJlc3VsdC5pZCA9PT0gcmVzdWx0SWQpID8/IG51bGw7XHJcbiAgICB9XHJcblxyXG4gICAgcHVibGljIHN0YXRpYyBjYW5DcmFmdEl0ZW0oaXRlbUlkOiBzdHJpbmcsIGVudGl0eTogRW50aXR5KTogYm9vbGVhbiB7XHJcbiAgICAgICAgY29uc3QgcmVjaXBlID0gdGhpcy5nZXRSZWNpcGVGb3JSZXN1bHQoaXRlbUlkKTtcclxuICAgICAgICBpZiAoIXJlY2lwZSkgcmV0dXJuIGZhbHNlO1xyXG4gICAgICAgIHJldHVybiB0aGlzLmNhbkNyYWZ0UmVjaXBlKHJlY2lwZSwgZW50aXR5KTtcclxuICAgIH1cclxuXHJcbiAgICBwdWJsaWMgc3RhdGljIGdldEl0ZW1Db3VudEZvckluZ3JlZGllbnQoZW50aXR5OiBFbnRpdHksIGluZ3JlZGllbnQ6IEluZ3JlZGllbnQpOiBudW1iZXIge1xyXG4gICAgICAgIHJldHVybiB0aGlzLmdldEl0ZW1Db3VudEZvckluZ3JlZGllbnRJZChlbnRpdHksIGluZ3JlZGllbnQuaWQpO1xyXG4gICAgfVxyXG5cclxuICAgIHB1YmxpYyBzdGF0aWMgZ2V0SXRlbUNvdW50Rm9ySW5ncmVkaWVudElkKGVudGl0eTogRW50aXR5LCBpbmdyZWRpZW50SWQ6IHN0cmluZyk6IG51bWJlciB7XHJcbiAgICAgICAgY29uc3QgcmVzb2x2ZWQgPSBDcmFmdGluZ0hlbHBlci5UYWdSZXNvbHV0aW9uc1tpbmdyZWRpZW50SWRdO1xyXG4gICAgICAgIGNvbnN0IGludmVudG9yeSA9IFZpcnR1YWxJbnZlbnRvcnlDb21wb25lbnQuZ2V0KGVudGl0eSk7XHJcbiAgICAgICAgaWYgKHJlc29sdmVkKSB7XHJcbiAgICAgICAgICAgIHJldHVybiByZXNvbHZlZC5yZWR1Y2UoKHN1bSwgaWQpID0+IHN1bSArIGludmVudG9yeS5jb3VudEl0ZW1UeXBlKGlkKSwgMCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiBpbnZlbnRvcnkuY291bnRJdGVtVHlwZShpbmdyZWRpZW50SWQpO1xyXG4gICAgfVxyXG5cclxuICAgIHB1YmxpYyBzdGF0aWMgY2FuQ3JhZnRSZWNpcGUocmVjaXBlOiBSZWNpcGUsIGVudGl0eTogRW50aXR5KTogYm9vbGVhbiB7XHJcbiAgICAgICAgZm9yIChjb25zdCBpbmdyZWRpZW50IG9mIHJlY2lwZS5pbmdyZWRpZW50cykge1xyXG4gICAgICAgICAgICBpZiAodGhpcy5nZXRJdGVtQ291bnRGb3JJbmdyZWRpZW50KGVudGl0eSwgaW5ncmVkaWVudCkgPCBpbmdyZWRpZW50LmFtb3VudCkge1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIFJlc29sdmVzIHRoZSBjb25jcmV0ZSBpdGVtIElEIGZyb20gdGhlIGVudGl0eSdzIGludmVudG9yeSB0aGF0IHNhdGlzZmllcyB0aGlzIGluZ3JlZGllbnQuICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHJlc29sdmVJbmdyZWRpZW50SWQoZW50aXR5OiBFbnRpdHksIGluZ3JlZGllbnQ6IEluZ3JlZGllbnQpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xyXG4gICAgICAgIGNvbnN0IHJlc29sdXRpb25PcHRpb25zID0gQ3JhZnRpbmdIZWxwZXIuVGFnUmVzb2x1dGlvbnNbaW5ncmVkaWVudC5pZF07XHJcbiAgICAgICAgY29uc3QgaW52ZW50b3J5ID0gVmlydHVhbEludmVudG9yeUNvbXBvbmVudC5nZXQoZW50aXR5KTtcclxuICAgICAgICBpZiAocmVzb2x1dGlvbk9wdGlvbnMpIHtcclxuICAgICAgICAgICAgcmV0dXJuIHJlc29sdXRpb25PcHRpb25zLmZpbmQoKGlkKSA9PiBpbnZlbnRvcnkuY291bnRJdGVtVHlwZShpZCkgPiAwKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIGluZ3JlZGllbnQuaWQ7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gUmVzb2x2ZXMgdGhlIGNvbmNyZXRlIHJlc3VsdCBJRCBnaXZlbiB0aGUgY29uY3JldGUgaW5ncmVkaWVudCBJRCB0aGF0IHdhcyBjb25zdW1lZC4gKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgcmVzb2x2ZVJlc3VsdElkKHJlc3VsdElkOiBzdHJpbmcsIHJlc29sdmVkSW5ncmVkaWVudElkOiBzdHJpbmcpOiBzdHJpbmcge1xyXG4gICAgICAgIHJldHVybiBDcmFmdGluZ0hlbHBlci5JbmdyZWRpZW50VG9SZXN1bHRbcmVzb2x2ZWRJbmdyZWRpZW50SWRdID8/IHJlc3VsdElkO1xyXG4gICAgfVxyXG5cclxuICAgIHB1YmxpYyBzdGF0aWMgZ2V0QWxsTG9nVmFyaWFudHMod29vZEZhbWlseTogV29vZEZhbWlseSk6IHN0cmluZ1tdIHtcclxuICAgICAgICByZXR1cm4gW3dvb2RGYW1pbHkubG9nLCB3b29kRmFtaWx5LnN0cmlwcGVkTG9nLCB3b29kRmFtaWx5Lndvb2QsIHdvb2RGYW1pbHkuc3RyaXBwZWRXb29kXS5maWx0ZXIoKHYpOiB2IGlzIHN0cmluZyA9PiB2ICE9PSBudWxsKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFJlY3Vyc2l2ZWx5IHRyYXZlcnNlcyB0aGUgcmVjaXBlIHRyZWUgZm9yIGl0ZW0gYW5kIHJldHVybnMgdGhlIGZpcnN0IGJhc2UgaW5ncmVkaWVudFxyXG4gICAgICogKG9uZSB3aXRoIG5vIGNyYWZ0aW5nIHJlY2lwZSkgdGhhdCB0aGUgZW50aXR5IGlzIG1pc3NpbmcsIG9yIG51bGwgaWYgbm9uZSBpcyBmb3VuZC5cclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBnZXRGaXJzdE1pc3NpbmdCYXNlSW5ncmVkaWVudChpdGVtOiBJbmdyZWRpZW50LCBlbnRpdHk6IEVudGl0eSk6IEluZ3JlZGllbnQgfCBudWxsIHtcclxuICAgICAgICBjb25zdCByZWNpcGUgPSB0aGlzLmdldFJlY2lwZUZvclJlc3VsdChpdGVtLmlkKTtcclxuICAgICAgICBpZiAoIXJlY2lwZSkge1xyXG4gICAgICAgICAgICAvL0Jhc2UgaW5ncmVkaWVudFxyXG4gICAgICAgICAgICBjb25zdCBjdXJyZW50Q291bnQgPSB0aGlzLmdldEl0ZW1Db3VudEZvckluZ3JlZGllbnRJZChlbnRpdHksIGl0ZW0uaWQpO1xyXG4gICAgICAgICAgICBjb25zdCBtaXNzaW5nID0gaXRlbS5hbW91bnQgLSBjdXJyZW50Q291bnQ7XHJcbiAgICAgICAgICAgIHJldHVybiBtaXNzaW5nID4gMCA/IHsgaWQ6IGl0ZW0uaWQsIGFtb3VudDogbWlzc2luZyB9IDogbnVsbDtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGNvbnN0IGNyYWZ0c05lZWRlZCA9IE1hdGguY2VpbChpdGVtLmFtb3VudCAvIHJlY2lwZS5yZXN1bHQuYW1vdW50KTtcclxuICAgICAgICBmb3IgKGNvbnN0IGluZ3JlZGllbnQgb2YgcmVjaXBlLmluZ3JlZGllbnRzKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHRvdGFsTmVlZGVkID0gY3JhZnRzTmVlZGVkICogaW5ncmVkaWVudC5hbW91bnQ7XHJcbiAgICAgICAgICAgIGNvbnN0IGN1cnJlbnRDb3VudCA9IHRoaXMuZ2V0SXRlbUNvdW50Rm9ySW5ncmVkaWVudChlbnRpdHksIGluZ3JlZGllbnQpO1xyXG4gICAgICAgICAgICBpZiAoY3VycmVudENvdW50ID49IHRvdGFsTmVlZGVkKSBjb250aW51ZTtcclxuXHJcbiAgICAgICAgICAgIGNvbnN0IG1pc3NpbmdBbW91bnQgPSB0b3RhbE5lZWRlZCAtIGN1cnJlbnRDb3VudDtcclxuICAgICAgICAgICAgaWYgKCF0aGlzLmdldFJlY2lwZUZvclJlc3VsdChpbmdyZWRpZW50LmlkKSkge1xyXG4gICAgICAgICAgICAgICAgLy9CYXNlIGNhc2VcclxuICAgICAgICAgICAgICAgIHJldHVybiB7IGlkOiBpbmdyZWRpZW50LmlkLCBhbW91bnQ6IG1pc3NpbmdBbW91bnQgfTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBjb25zdCBiYXNlID0gdGhpcy5nZXRGaXJzdE1pc3NpbmdCYXNlSW5ncmVkaWVudCh7IGlkOiBpbmdyZWRpZW50LmlkLCBhbW91bnQ6IG1pc3NpbmdBbW91bnQgfSwgZW50aXR5KTtcclxuICAgICAgICAgICAgaWYgKGJhc2UgIT09IG51bGwpIHJldHVybiBiYXNlO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFJldHVybnMgYWxsIGluZ3JlZGllbnRzIGF0IGV2ZXJ5IGxldmVsIG9mIHRoZSBjcmFmdGluZyB0cmVlIGZvciB0aGUgZ2l2ZW4gaXRlbSdzIHJlY2lwZVxyXG4gICAgICogKG5vdCB0aGUgaXRlbSBpdHNlbGYpLiBJbmNsdWRlcyBib3RoIGludGVybWVkaWF0ZSBjcmFmdGFibGVzIGFuZCBiYXNlIGluZ3JlZGllbnRzLFxyXG4gICAgICogc28gYSBjaGVzdCBjYW4gc3VwcGx5IHdoaWNoZXZlciBsZXZlbCBpcyBhdmFpbGFibGUgYW5kIHNraXAgdW5uZWNlc3NhcnkgY3JhZnRpbmcgc3RlcHMuXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgZ2V0QWxsQ3JhZnRpbmdUcmVlSW5ncmVkaWVudHMoaXRlbTogSW5ncmVkaWVudCk6IEluZ3JlZGllbnRbXSB7XHJcbiAgICAgICAgY29uc3QgdG90YWxzID0gbmV3IE1hcDxzdHJpbmcsIG51bWJlcj4oKTtcclxuICAgICAgICBjb25zdCByZWNpcGUgPSB0aGlzLmdldFJlY2lwZUZvclJlc3VsdChpdGVtLmlkKTtcclxuICAgICAgICBpZiAoIXJlY2lwZSkge1xyXG4gICAgICAgICAgICB0b3RhbHMuc2V0KGl0ZW0uaWQsIGl0ZW0uYW1vdW50KTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICBjb25zdCBjcmFmdHNOZWVkZWQgPSBNYXRoLmNlaWwoaXRlbS5hbW91bnQgLyByZWNpcGUucmVzdWx0LmFtb3VudCk7XHJcbiAgICAgICAgICAgIGZvciAoY29uc3QgaW5ncmVkaWVudCBvZiByZWNpcGUuaW5ncmVkaWVudHMpIHtcclxuICAgICAgICAgICAgICAgIENyYWZ0aW5nSGVscGVyLmFjY3VtdWxhdGVBbGxJbmdyZWRpZW50cyh7IGlkOiBpbmdyZWRpZW50LmlkLCBhbW91bnQ6IGNyYWZ0c05lZWRlZCAqIGluZ3JlZGllbnQuYW1vdW50IH0sIHRvdGFscyk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIEFycmF5LmZyb20odG90YWxzLmVudHJpZXMoKSkubWFwKChbaWQsIGFtb3VudF0pID0+ICh7IGlkLCBhbW91bnQgfSkpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgc3RhdGljIGFjY3VtdWxhdGVBbGxJbmdyZWRpZW50cyhpdGVtOiBJbmdyZWRpZW50LCB0b3RhbHM6IE1hcDxzdHJpbmcsIG51bWJlcj4pOiB2b2lkIHtcclxuICAgICAgICB0b3RhbHMuc2V0KGl0ZW0uaWQsICh0b3RhbHMuZ2V0KGl0ZW0uaWQpID8/IDApICsgaXRlbS5hbW91bnQpO1xyXG4gICAgICAgIGNvbnN0IHJlY2lwZSA9IHRoaXMuZ2V0UmVjaXBlRm9yUmVzdWx0KGl0ZW0uaWQpO1xyXG4gICAgICAgIGlmICghcmVjaXBlKSByZXR1cm47XHJcbiAgICAgICAgY29uc3QgY3JhZnRzTmVlZGVkID0gTWF0aC5jZWlsKGl0ZW0uYW1vdW50IC8gcmVjaXBlLnJlc3VsdC5hbW91bnQpO1xyXG4gICAgICAgIGZvciAoY29uc3QgaW5ncmVkaWVudCBvZiByZWNpcGUuaW5ncmVkaWVudHMpIHtcclxuICAgICAgICAgICAgQ3JhZnRpbmdIZWxwZXIuYWNjdW11bGF0ZUFsbEluZ3JlZGllbnRzKHsgaWQ6IGluZ3JlZGllbnQuaWQsIGFtb3VudDogY3JhZnRzTmVlZGVkICogaW5ncmVkaWVudC5hbW91bnQgfSwgdG90YWxzKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHVibGljIHN0YXRpYyBnZXRSYXdNYXRlcmlhbEZyb21TbWVsdGVkTWF0ZXJpYWxUeXBlKHJlc3VsdElkOiBzdHJpbmcpOiBzdHJpbmcgfCBudWxsIHtcclxuICAgICAgICBjb25zdCByYXdNYXRlcmlhbCA9IE9iamVjdC5lbnRyaWVzKENyYWZ0aW5nVHJlZURhdGEuUmF3TWF0ZXJpYWxUb1NtZWx0ZWRNYXRlcmlhbE1hcCkuZmluZChcclxuICAgICAgICAgICAgKFssIHNtZWx0ZWRNYXRlcmlhbF0pID0+IHNtZWx0ZWRNYXRlcmlhbCA9PT0gcmVzdWx0SWRcclxuICAgICAgICApO1xyXG4gICAgICAgIHJldHVybiByYXdNYXRlcmlhbCA/IHJhd01hdGVyaWFsWzBdIDogbnVsbDtcclxuICAgIH1cclxufVxyXG4iXSwibmFtZXMiOlsiQ3JhZnRpbmdUcmVlRGF0YSIsIlZpcnR1YWxJbnZlbnRvcnlDb21wb25lbnQiLCJDcmFmdGluZ0hlbHBlciIsImRvZXNJdGVtUmVxdWlyZUNyYWZ0aW5nVGFibGUiLCJpdGVtSWQiLCJyZWNpcGUiLCJnZXRSZWNpcGVGb3JSZXN1bHQiLCJyZXF1aXJlc0NyYWZ0aW5nVGFibGUiLCJyZXN1bHRJZCIsIlJlY2lwZXMiLCJmaW5kIiwicmVzdWx0IiwiaWQiLCJjYW5DcmFmdEl0ZW0iLCJlbnRpdHkiLCJjYW5DcmFmdFJlY2lwZSIsImdldEl0ZW1Db3VudEZvckluZ3JlZGllbnQiLCJpbmdyZWRpZW50IiwiZ2V0SXRlbUNvdW50Rm9ySW5ncmVkaWVudElkIiwiaW5ncmVkaWVudElkIiwicmVzb2x2ZWQiLCJUYWdSZXNvbHV0aW9ucyIsImludmVudG9yeSIsImdldCIsInJlZHVjZSIsInN1bSIsImNvdW50SXRlbVR5cGUiLCJpbmdyZWRpZW50cyIsImFtb3VudCIsInJlc29sdmVJbmdyZWRpZW50SWQiLCJyZXNvbHV0aW9uT3B0aW9ucyIsInJlc29sdmVSZXN1bHRJZCIsInJlc29sdmVkSW5ncmVkaWVudElkIiwiSW5ncmVkaWVudFRvUmVzdWx0IiwiZ2V0QWxsTG9nVmFyaWFudHMiLCJ3b29kRmFtaWx5IiwibG9nIiwic3RyaXBwZWRMb2ciLCJ3b29kIiwic3RyaXBwZWRXb29kIiwiZmlsdGVyIiwidiIsImdldEZpcnN0TWlzc2luZ0Jhc2VJbmdyZWRpZW50IiwiaXRlbSIsImN1cnJlbnRDb3VudCIsIm1pc3NpbmciLCJjcmFmdHNOZWVkZWQiLCJNYXRoIiwiY2VpbCIsInRvdGFsTmVlZGVkIiwibWlzc2luZ0Ftb3VudCIsImJhc2UiLCJnZXRBbGxDcmFmdGluZ1RyZWVJbmdyZWRpZW50cyIsInRvdGFscyIsIk1hcCIsInNldCIsImFjY3VtdWxhdGVBbGxJbmdyZWRpZW50cyIsIkFycmF5IiwiZnJvbSIsImVudHJpZXMiLCJtYXAiLCJnZXRSYXdNYXRlcmlhbEZyb21TbWVsdGVkTWF0ZXJpYWxUeXBlIiwicmF3TWF0ZXJpYWwiLCJPYmplY3QiLCJSYXdNYXRlcmlhbFRvU21lbHRlZE1hdGVyaWFsTWFwIiwic21lbHRlZE1hdGVyaWFsIiwiV29vZEZhbWlsaWVzIiwiZmxhdE1hcCIsImZhbWlseSIsInBsYW5rcyIsIlN0b25lRmFtaWx5IiwiZnJvbUVudHJpZXMiLCJ2YXJpYW50Il0sIm1hcHBpbmdzIjoiQUFDQSxPQUFPQSxzQkFBMEQsd0JBQXdCO0FBQ3pGLE9BQU9DLCtCQUErQixzQ0FBc0M7QUFFN0QsTUFBTUM7SUFlakIsT0FBY0MsNkJBQTZCQyxNQUFjLEVBQVc7UUFDaEUsTUFBTUMsU0FBUyxJQUFJLENBQUNDLGtCQUFrQixDQUFDRjtRQUN2QyxJQUFJLENBQUNDLFFBQVEsT0FBTztRQUVwQixPQUFPQSxPQUFPRSxxQkFBcUI7SUFDdkM7SUFFQSxPQUFjRCxtQkFBbUJFLFFBQWdCLEVBQWlCO1FBQzlELE9BQU9SLGlCQUFpQlMsT0FBTyxDQUFDQyxJQUFJLENBQUMsQ0FBQ0wsU0FBV0EsT0FBT00sTUFBTSxDQUFDQyxFQUFFLEtBQUtKLGFBQWE7SUFDdkY7SUFFQSxPQUFjSyxhQUFhVCxNQUFjLEVBQUVVLE1BQWMsRUFBVztRQUNoRSxNQUFNVCxTQUFTLElBQUksQ0FBQ0Msa0JBQWtCLENBQUNGO1FBQ3ZDLElBQUksQ0FBQ0MsUUFBUSxPQUFPO1FBQ3BCLE9BQU8sSUFBSSxDQUFDVSxjQUFjLENBQUNWLFFBQVFTO0lBQ3ZDO0lBRUEsT0FBY0UsMEJBQTBCRixNQUFjLEVBQUVHLFVBQXNCLEVBQVU7UUFDcEYsT0FBTyxJQUFJLENBQUNDLDJCQUEyQixDQUFDSixRQUFRRyxXQUFXTCxFQUFFO0lBQ2pFO0lBRUEsT0FBY00sNEJBQTRCSixNQUFjLEVBQUVLLFlBQW9CLEVBQVU7UUFDcEYsTUFBTUMsV0FBV2xCLGVBQWVtQixjQUFjLENBQUNGLGFBQWE7UUFDNUQsTUFBTUcsWUFBWXJC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