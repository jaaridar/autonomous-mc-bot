import AbstractMobComponent from "MobComponents/AbstractMobComponent";
import VirtualServerManager from "VirtualServer/VirtualServerManager";
import GamerTagRandomizerData from "./GamerTagRandomizerData";
class GamerTagRandomizerComponent extends AbstractMobComponent {
    static pickUniqueTag() {
        let tag;
        do {
            tag = GamerTagRandomizerComponent.pickTag();
        }while (VirtualServerManager.anyProfileHasTag(tag))
        return tag;
    }
    static pickTag() {
        const type = MathUtil.getWeightedRandom(GamerTagRandomizerData.TypeWeights);
        switch(type){
            case "Presets":
                return MathUtil.choose(GamerTagRandomizerData.Presets);
            case "Staff":
                return MathUtil.choose(GamerTagRandomizerData.Staff);
            default:
                return GamerTagRandomizerComponent.generateTag();
        }
    }
    static generateTag() {
        const parts = {
            adjective: "",
            underscore: "",
            noun: "",
            number: ""
        };
        // Adjective
        if (Math.random() < GamerTagRandomizerData.Chances.Adjective) {
            parts["adjective"] = GamerTagRandomizerComponent.generateAdjective();
            // Underscore (only if adjective is generated)
            if (Math.random() < GamerTagRandomizerData.Chances.Underscore) {
                parts["underscore"] = GamerTagRandomizerComponent.generateUnderscore();
            }
        }
        // Noun
        parts["noun"] = GamerTagRandomizerComponent.generateNoun();
        // Number
        if (Math.random() < GamerTagRandomizerData.Chances.Number) {
            parts["number"] = GamerTagRandomizerComponent.generateSafeNumber();
        }
        let gamerTagWithoutNumbers = `${parts["adjective"]}${parts["underscore"]}${parts["noun"]}`;
        // Truncate to max length without numbers
        if (gamerTagWithoutNumbers.length > GamerTagRandomizerData.MaxLengthWithoutNumbers) {
            gamerTagWithoutNumbers = gamerTagWithoutNumbers.substring(0, GamerTagRandomizerData.MaxLengthWithoutNumbers);
        }
        let gamerTag = `${gamerTagWithoutNumbers}${parts["number"]}`;
        // Truncate to max length overall
        if (gamerTag.length > GamerTagRandomizerData.MaxLengthWithNumbers) {
            gamerTag = gamerTag.substring(0, GamerTagRandomizerData.MaxLengthWithNumbers);
        }
        // Apply modifiers
        if (Math.random() < GamerTagRandomizerData.Chances.ApplyUpperCase) {
            gamerTag = this.applyUpperCase(gamerTag);
        }
        if (Math.random() < GamerTagRandomizerData.Chances.ApplyLeetspeak) {
            gamerTag = this.applyLeetspeak(gamerTag, GamerTagRandomizerData.Chances.LeetspeakChancePerChar);
        }
        return gamerTag;
    }
    static generateAdjective() {
        return MathUtil.choose(GamerTagRandomizerData.Adjectives);
    }
    static generateNoun() {
        return MathUtil.choose(GamerTagRandomizerData.Nouns);
    }
    static generateUnderscore() {
        if (Math.random() < GamerTagRandomizerData.Chances.DoubleUnderscore) return "__";
        return "_";
    }
    static generateSafeNumber() {
        let number;
        do {
            number = GamerTagRandomizerComponent.generateNumber();
        }while (GamerTagRandomizerData.UnsafeNumbers.includes(Number(number)))
        return number.toString();
    }
    static generateNumber() {
        const numberRange = MathUtil.getWeightedRandom(GamerTagRandomizerData.NumberRangeWeights);
        switch(numberRange){
            case "birthYear":
                return GamerTagRandomizerComponent.generateBirthYear();
            case "0-9":
                return MathUtil.randomInt(0, 9).toString();
            case "10-99":
                return MathUtil.randomInt(10, 99).toString();
            case "100-999":
                return MathUtil.randomInt(100, 999).toString();
            default:
                return MathUtil.randomInt(1000, 9999).toString();
        }
    }
    static generateBirthYear() {
        const min = GamerTagRandomizerData.BirthYearRange.min;
        const max = GamerTagRandomizerData.BirthYearRange.max;
        return MathUtil.randomInt(min, max).toString();
    }
    static applyLeetspeak(word, perCharChance) {
        let result = "";
        let startingIndex = 0;
        if (!GamerTagRandomizerData.CanStartWithNumber) {
            startingIndex = 1;
            result += word.charAt(0); // Keep the first character unchanged if it can't start with a number
        }
        for(let i = startingIndex; i < word.length; i++){
            const char = word.charAt(i);
            if (Math.random() < perCharChance) {
                const leetspeakMap = GamerTagRandomizerData.LeetspeakMap;
                result += leetspeakMap[char] ?? char;
            } else {
                result += char;
            }
        }
        return result;
    }
    static applyUpperCase(word) {
        return word.toUpperCase();
    }
    constructor(entity, processInterval, preExisting){
        super(entity, processInterval, preExisting);
        if (preExisting) return;
        if (EntityStore.get(entity, "gamerTag") !== "") return;
        const tag = GamerTagRandomizerComponent.pickUniqueTag();
        this.entity.nameTag = tag;
        EntityStore.set(this.entity, "gamerTag", tag);
    }
}
GamerTagRandomizerComponent.EntityTypes = [
    "gm1_sky:aip"
];
export { GamerTagRandomizerComponent as default };

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkdhbWVyVGFnUmFuZG9taXplckNvbXBvbmVudC50cyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBFbnRpdHkgfSBmcm9tIFwiQG1pbmVjcmFmdC9zZXJ2ZXJcIjtcclxuaW1wb3J0IEFic3RyYWN0TW9iQ29tcG9uZW50IGZyb20gXCJNb2JDb21wb25lbnRzL0Fic3RyYWN0TW9iQ29tcG9uZW50XCI7XHJcbmltcG9ydCBWaXJ0dWFsU2VydmVyTWFuYWdlciBmcm9tIFwiVmlydHVhbFNlcnZlci9WaXJ0dWFsU2VydmVyTWFuYWdlclwiO1xyXG5pbXBvcnQgR2FtZXJUYWdSYW5kb21pemVyRGF0YSBmcm9tIFwiLi9HYW1lclRhZ1JhbmRvbWl6ZXJEYXRhXCI7XHJcblxyXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBHYW1lclRhZ1JhbmRvbWl6ZXJDb21wb25lbnQgZXh0ZW5kcyBBYnN0cmFjdE1vYkNvbXBvbmVudCB7XHJcbiAgICBwdWJsaWMgc3RhdGljIEVudGl0eVR5cGVzOiBzdHJpbmdbXSA9IFtcImdtMV9za3k6YWlwXCJdO1xyXG5cclxuICAgIHB1YmxpYyBjb25zdHJ1Y3RvcihlbnRpdHk6IEVudGl0eSwgcHJvY2Vzc0ludGVydmFsOiBudW1iZXIsIHByZUV4aXN0aW5nOiBib29sZWFuKSB7XHJcbiAgICAgICAgc3VwZXIoZW50aXR5LCBwcm9jZXNzSW50ZXJ2YWwsIHByZUV4aXN0aW5nKTtcclxuXHJcbiAgICAgICAgaWYgKHByZUV4aXN0aW5nKSByZXR1cm47XHJcbiAgICAgICAgaWYgKEVudGl0eVN0b3JlLmdldChlbnRpdHksIFwiZ2FtZXJUYWdcIikgIT09IFwiXCIpIHJldHVybjtcclxuXHJcbiAgICAgICAgY29uc3QgdGFnID0gR2FtZXJUYWdSYW5kb21pemVyQ29tcG9uZW50LnBpY2tVbmlxdWVUYWcoKTtcclxuICAgICAgICB0aGlzLmVudGl0eS5uYW1lVGFnID0gdGFnO1xyXG4gICAgICAgIEVudGl0eVN0b3JlLnNldCh0aGlzLmVudGl0eSwgXCJnYW1lclRhZ1wiLCB0YWcpO1xyXG4gICAgfVxyXG5cclxuICAgIHB1YmxpYyBzdGF0aWMgcGlja1VuaXF1ZVRhZygpOiBzdHJpbmcge1xyXG4gICAgICAgIGxldCB0YWc6IHN0cmluZztcclxuICAgICAgICBkbyB7XHJcbiAgICAgICAgICAgIHRhZyA9IEdhbWVyVGFnUmFuZG9taXplckNvbXBvbmVudC5waWNrVGFnKCk7XHJcbiAgICAgICAgfSB3aGlsZSAoVmlydHVhbFNlcnZlck1hbmFnZXIuYW55UHJvZmlsZUhhc1RhZyh0YWcpKTtcclxuXHJcbiAgICAgICAgcmV0dXJuIHRhZztcclxuICAgIH1cclxuXHJcbiAgICBwdWJsaWMgc3RhdGljIHBpY2tUYWcoKSB7XHJcbiAgICAgICAgY29uc3QgdHlwZSA9IE1hdGhVdGlsLmdldFdlaWdodGVkUmFuZG9tKEdhbWVyVGFnUmFuZG9taXplckRhdGEuVHlwZVdlaWdodHMpO1xyXG5cclxuICAgICAgICBzd2l0Y2ggKHR5cGUpIHtcclxuICAgICAgICAgICAgY2FzZSBcIlByZXNldHNcIjpcclxuICAgICAgICAgICAgICAgIHJldHVybiBNYXRoVXRpbC5jaG9vc2UoR2FtZXJUYWdSYW5kb21pemVyRGF0YS5QcmVzZXRzKTtcclxuICAgICAgICAgICAgY2FzZSBcIlN0YWZmXCI6XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gTWF0aFV0aWwuY2hvb3NlKEdhbWVyVGFnUmFuZG9taXplckRhdGEuU3RhZmYpO1xyXG4gICAgICAgICAgICBkZWZhdWx0OlxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIEdhbWVyVGFnUmFuZG9taXplckNvbXBvbmVudC5nZW5lcmF0ZVRhZygpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwdWJsaWMgc3RhdGljIGdlbmVyYXRlVGFnKCkge1xyXG4gICAgICAgIGNvbnN0IHBhcnRzID0ge1xyXG4gICAgICAgICAgICBhZGplY3RpdmU6IFwiXCIsXHJcbiAgICAgICAgICAgIHVuZGVyc2NvcmU6IFwiXCIsXHJcbiAgICAgICAgICAgIG5vdW46IFwiXCIsXHJcbiAgICAgICAgICAgIG51bWJlcjogXCJcIixcclxuICAgICAgICB9O1xyXG5cclxuICAgICAgICAvLyBBZGplY3RpdmVcclxuICAgICAgICBpZiAoTWF0aC5yYW5kb20oKSA8IEdhbWVyVGFnUmFuZG9taXplckRhdGEuQ2hhbmNlcy5BZGplY3RpdmUpIHtcclxuICAgICAgICAgICAgcGFydHNbXCJhZGplY3RpdmVcIl0gPSBHYW1lclRhZ1JhbmRvbWl6ZXJDb21wb25lbnQuZ2VuZXJhdGVBZGplY3RpdmUoKTtcclxuXHJcbiAgICAgICAgICAgIC8vIFVuZGVyc2NvcmUgKG9ubHkgaWYgYWRqZWN0aXZlIGlzIGdlbmVyYXRlZClcclxuICAgICAgICAgICAgaWYgKE1hdGgucmFuZG9tKCkgPCBHYW1lclRhZ1JhbmRvbWl6ZXJEYXRhLkNoYW5jZXMuVW5kZXJzY29yZSkge1xyXG4gICAgICAgICAgICAgICAgcGFydHNbXCJ1bmRlcnNjb3JlXCJdID0gR2FtZXJUYWdSYW5kb21pemVyQ29tcG9uZW50LmdlbmVyYXRlVW5kZXJzY29yZSgpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBOb3VuXHJcbiAgICAgICAgcGFydHNbXCJub3VuXCJdID0gR2FtZXJUYWdSYW5kb21pemVyQ29tcG9uZW50LmdlbmVyYXRlTm91bigpO1xyXG5cclxuICAgICAgICAvLyBOdW1iZXJcclxuICAgICAgICBpZiAoTWF0aC5yYW5kb20oKSA8IEdhbWVyVGFnUmFuZG9taXplckRhdGEuQ2hhbmNlcy5OdW1iZXIpIHtcclxuICAgICAgICAgICAgcGFydHNbXCJudW1iZXJcIl0gPSBHYW1lclRhZ1JhbmRvbWl6ZXJDb21wb25lbnQuZ2VuZXJhdGVTYWZlTnVtYmVyKCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBsZXQgZ2FtZXJUYWdXaXRob3V0TnVtYmVycyA9IGAke3BhcnRzW1wiYWRqZWN0aXZlXCJdfSR7cGFydHNbXCJ1bmRlcnNjb3JlXCJdfSR7cGFydHNbXCJub3VuXCJdfWA7XHJcblxyXG4gICAgICAgIC8vIFRydW5jYXRlIHRvIG1heCBsZW5ndGggd2l0aG91dCBudW1iZXJzXHJcbiAgICAgICAgaWYgKGdhbWVyVGFnV2l0aG91dE51bWJlcnMubGVuZ3RoID4gR2FtZXJUYWdSYW5kb21pemVyRGF0YS5NYXhMZW5ndGhXaXRob3V0TnVtYmVycykge1xyXG4gICAgICAgICAgICBnYW1lclRhZ1dpdGhvdXROdW1iZXJzID0gZ2FtZXJUYWdXaXRob3V0TnVtYmVycy5zdWJzdHJpbmcoMCwgR2FtZXJUYWdSYW5kb21pemVyRGF0YS5NYXhMZW5ndGhXaXRob3V0TnVtYmVycyk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBsZXQgZ2FtZXJUYWcgPSBgJHtnYW1lclRhZ1dpdGhvdXROdW1iZXJzfSR7cGFydHNbXCJudW1iZXJcIl19YDtcclxuXHJcbiAgICAgICAgLy8gVHJ1bmNhdGUgdG8gbWF4IGxlbmd0aCBvdmVyYWxsXHJcbiAgICAgICAgaWYgKGdhbWVyVGFnLmxlbmd0aCA+IEdhbWVyVGFnUmFuZG9taXplckRhdGEuTWF4TGVuZ3RoV2l0aE51bWJlcnMpIHtcclxuICAgICAgICAgICAgZ2FtZXJUYWcgPSBnYW1lclRhZy5zdWJzdHJpbmcoMCwgR2FtZXJUYWdSYW5kb21pemVyRGF0YS5NYXhMZW5ndGhXaXRoTnVtYmVycyk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBBcHBseSBtb2RpZmllcnNcclxuICAgICAgICBpZiAoTWF0aC5yYW5kb20oKSA8IEdhbWVyVGFnUmFuZG9taXplckRhdGEuQ2hhbmNlcy5BcHBseVVwcGVyQ2FzZSkge1xyXG4gICAgICAgICAgICBnYW1lclRhZyA9IHRoaXMuYXBwbHlVcHBlckNhc2UoZ2FtZXJUYWcpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAoTWF0aC5yYW5kb20oKSA8IEdhbWVyVGFnUmFuZG9taXplckRhdGEuQ2hhbmNlcy5BcHBseUxlZXRzcGVhaykge1xyXG4gICAgICAgICAgICBnYW1lclRhZyA9IHRoaXMuYXBwbHlMZWV0c3BlYWsoZ2FtZXJUYWcsIEdhbWVyVGFnUmFuZG9taXplckRhdGEuQ2hhbmNlcy5MZWV0c3BlYWtDaGFuY2VQZXJDaGFyKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHJldHVybiBnYW1lclRhZztcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHN0YXRpYyBnZW5lcmF0ZUFkamVjdGl2ZSgpOiBzdHJpbmcge1xyXG4gICAgICAgIHJldHVybiBNYXRoVXRpbC5jaG9vc2UoR2FtZXJUYWdSYW5kb21pemVyRGF0YS5BZGplY3RpdmVzKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHN0YXRpYyBnZW5lcmF0ZU5vdW4oKTogc3RyaW5nIHtcclxuICAgICAgICByZXR1cm4gTWF0aFV0aWwuY2hvb3NlKEdhbWVyVGFnUmFuZG9taXplckRhdGEuTm91bnMpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgc3RhdGljIGdlbmVyYXRlVW5kZXJzY29yZSgpOiBzdHJpbmcge1xyXG4gICAgICAgIGlmIChNYXRoLnJhbmRvbSgpIDwgR2FtZXJUYWdSYW5kb21pemVyRGF0YS5DaGFuY2VzLkRvdWJsZVVuZGVyc2NvcmUpIHJldHVybiBcIl9fXCI7XHJcbiAgICAgICAgcmV0dXJuIFwiX1wiO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgc3RhdGljIGdlbmVyYXRlU2FmZU51bWJlcigpOiBzdHJpbmcge1xyXG4gICAgICAgIGxldCBudW1iZXI6IHN0cmluZztcclxuICAgICAgICBkbyB7XHJcbiAgICAgICAgICAgIG51bWJlciA9IEdhbWVyVGFnUmFuZG9taXplckNvbXBvbmVudC5nZW5lcmF0ZU51bWJlcigpO1xyXG4gICAgICAgIH0gd2hpbGUgKEdhbWVyVGFnUmFuZG9taXplckRhdGEuVW5zYWZlTnVtYmVycy5pbmNsdWRlcyhOdW1iZXIobnVtYmVyKSkpO1xyXG4gICAgICAgIHJldHVybiBudW1iZXIudG9TdHJpbmcoKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHN0YXRpYyBnZW5lcmF0ZU51bWJlcigpOiBzdHJpbmcge1xyXG4gICAgICAgIGNvbnN0IG51bWJlclJhbmdlID0gTWF0aFV0aWwuZ2V0V2VpZ2h0ZWRSYW5kb20oR2FtZXJUYWdSYW5kb21pemVyRGF0YS5OdW1iZXJSYW5nZVdlaWdodHMpO1xyXG5cclxuICAgICAgICBzd2l0Y2ggKG51bWJlclJhbmdlKSB7XHJcbiAgICAgICAgICAgIGNhc2UgXCJiaXJ0aFllYXJcIjpcclxuICAgICAgICAgICAgICAgIHJldHVybiBHYW1lclRhZ1JhbmRvbWl6ZXJDb21wb25lbnQuZ2VuZXJhdGVCaXJ0aFllYXIoKTtcclxuICAgICAgICAgICAgY2FzZSBcIjAtOVwiOlxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIE1hdGhVdGlsLnJhbmRvbUludCgwLCA5KS50b1N0cmluZygpO1xyXG4gICAgICAgICAgICBjYXNlIFwiMTAtOTlcIjpcclxuICAgICAgICAgICAgICAgIHJldHVybiBNYXRoVXRpbC5yYW5kb21JbnQoMTAsIDk5KS50b1N0cmluZygpO1xyXG4gICAgICAgICAgICBjYXNlIFwiMTAwLTk5OVwiOlxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIE1hdGhVdGlsLnJhbmRvbUludCgxMDAsIDk5OSkudG9TdHJpbmcoKTtcclxuICAgICAgICAgICAgZGVmYXVsdDpcclxuICAgICAgICAgICAgICAgIHJldHVybiBNYXRoVXRpbC5yYW5kb21JbnQoMTAwMCwgOTk5OSkudG9TdHJpbmcoKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBzdGF0aWMgZ2VuZXJhdGVCaXJ0aFllYXIoKSB7XHJcbiAgICAgICAgY29uc3QgbWluID0gR2FtZXJUYWdSYW5kb21pemVyRGF0YS5CaXJ0aFllYXJSYW5nZS5taW47XHJcbiAgICAgICAgY29uc3QgbWF4ID0gR2FtZXJUYWdSYW5kb21pemVyRGF0YS5CaXJ0aFllYXJSYW5nZS5tYXg7XHJcbiAgICAgICAgcmV0dXJuIE1hdGhVdGlsLnJhbmRvbUludChtaW4sIG1heCkudG9TdHJpbmcoKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHN0YXRpYyBhcHBseUxlZXRzcGVhayh3b3JkOiBzdHJpbmcsIHBlckNoYXJDaGFuY2U6IG51bWJlcikge1xyXG4gICAgICAgIGxldCByZXN1bHQgPSBcIlwiO1xyXG4gICAgICAgIGxldCBzdGFydGluZ0luZGV4ID0gMDtcclxuXHJcbiAgICAgICAgaWYgKCFHYW1lclRhZ1JhbmRvbWl6ZXJEYXRhLkNhblN0YXJ0V2l0aE51bWJlcikge1xyXG4gICAgICAgICAgICBzdGFydGluZ0luZGV4ID0gMTtcclxuICAgICAgICAgICAgcmVzdWx0ICs9IHdvcmQuY2hhckF0KDApOyAvLyBLZWVwIHRoZSBmaXJzdCBjaGFyYWN0ZXIgdW5jaGFuZ2VkIGlmIGl0IGNhbid0IHN0YXJ0IHdpdGggYSBudW1iZXJcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGZvciAobGV0IGkgPSBzdGFydGluZ0luZGV4OyBpIDwgd29yZC5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgICAgICBjb25zdCBjaGFyID0gd29yZC5jaGFyQXQoaSk7XHJcbiAgICAgICAgICAgIGlmIChNYXRoLnJhbmRvbSgpIDwgcGVyQ2hhckNoYW5jZSkge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgbGVldHNwZWFrTWFwID0gR2FtZXJUYWdSYW5kb21pemVyRGF0YS5MZWV0c3BlYWtNYXA7XHJcbiAgICAgICAgICAgICAgICByZXN1bHQgKz0gbGVldHNwZWFrTWFwW2NoYXIgYXMga2V5b2YgdHlwZW9mIGxlZXRzcGVha01hcF0gPz8gY2hhcjtcclxuICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgIHJlc3VsdCArPSBjaGFyO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgc3RhdGljIGFwcGx5VXBwZXJDYXNlKHdvcmQ6IHN0cmluZykge1xyXG4gICAgICAgIHJldHVybiB3b3JkLnRvVXBwZXJDYXNlKCk7XHJcbiAgICB9XHJcbn1cclxuIl0sIm5hbWVzIjpbIkFic3RyYWN0TW9iQ29tcG9uZW50IiwiVmlydHVhbFNlcnZlck1hbmFnZXIiLCJHYW1lclRhZ1JhbmRvbWl6ZXJEYXRhIiwiR2FtZXJUYWdSYW5kb21pemVyQ29tcG9uZW50IiwicGlja1VuaXF1ZVRhZyIsInRhZyIsInBpY2tUYWciLCJhbnlQcm9maWxlSGFzVGFnIiwidHlwZSIsIk1hdGhVdGlsIiwiZ2V0V2VpZ2h0ZWRSYW5kb20iLCJUeXBlV2VpZ2h0cyIsImNob29zZSIsIlByZXNldHMiLCJTdGFmZiIsImdlbmVyYXRlVGFnIiwicGFydHMiLCJhZGplY3RpdmUiLCJ1bmRlcnNjb3JlIiwibm91biIsIm51bWJlciIsIk1hdGgiLCJyYW5kb20iLCJDaGFuY2VzIiwiQWRqZWN0aXZlIiwiZ2VuZXJhdGVBZGplY3RpdmUiLCJVbmRlcnNjb3JlIiwiZ2VuZXJhdGVVbmRlcnNjb3JlIiwiZ2VuZXJhdGVOb3VuIiwiTnVtYmVyIiwiZ2VuZXJhdGVTYWZlTnVtYmVyIiwiZ2FtZXJUYWdXaXRob3V0TnVtYmVycyIsImxlbmd0aCIsIk1heExlbmd0aFdpdGhvdXROdW1iZXJzIiwic3Vic3RyaW5nIiwiZ2FtZXJUYWciLCJNYXhMZW5ndGhXaXRoTnVtYmVycyIsIkFwcGx5VXBwZXJDYXNlIiwiYXBwbHlVcHBlckNhc2UiLCJBcHBseUxlZXRzcGVhayIsImFwcGx5TGVldHNwZWFrIiwiTGVldHNwZWFrQ2hhbmNlUGVyQ2hhciIsIkFkamVjdGl2ZXMiLCJOb3VucyIsIkRvdWJsZVVuZGVyc2NvcmUiLCJnZW5lcmF0ZU51bWJlciIsIlVuc2FmZU51bWJlcnMiLCJpbmNsdWRlcyIsInRvU3RyaW5nIiwibnVtYmVyUmFuZ2UiLCJOdW1iZXJSYW5nZVdlaWdodHMiLCJnZW5lcmF0ZUJpcnRoWWVhciIsInJhbmRvbUludCIsIm1pbiIsIkJpcnRoWWVhclJhbmdlIiwibWF4Iiwid29yZCIsInBlckNoYXJDaGFuY2UiLCJyZXN1bHQiLCJzdGFydGluZ0luZGV4IiwiQ2FuU3RhcnRXaXRoTnVtYmVyIiwiY2hhckF0IiwiaSIsImNoYXIiLCJsZWV0c3BlYWtNYXAiLCJMZWV0c3BlYWtNYXAiLCJ0b1VwcGVyQ2FzZSIsImVudGl0eSIsInByb2Nlc3NJbnRlcnZhbCIsInByZUV4aXN0aW5nIiwiRW50aXR5U3RvcmUiLCJnZXQiLCJuYW1lVGFnIiwic2V0IiwiRW50aXR5VHlwZXMiXSwibWFwcGluZ3MiOiJBQUNBLE9BQU9BLDBCQUEwQixxQ0FBcUM7QUFDdEUsT0FBT0MsMEJBQTBCLHFDQUFxQztBQUN0RSxPQUFPQyw0QkFBNEIsMkJBQTJCO0FBRS9DLE1BQU1DLG9DQUFvQ0g7SUFjckQsT0FBY0ksZ0JBQXdCO1FBQ2xDLElBQUlDO1FBQ0osR0FBRztZQUNDQSxNQUFNRiw0QkFBNEJHLE9BQU87UUFDN0MsUUFBU0wscUJBQXFCTSxnQkFBZ0IsQ0FBQ0YsS0FBTTtRQUVyRCxPQUFPQTtJQUNYO0lBRUEsT0FBY0MsVUFBVTtRQUNwQixNQUFNRSxPQUFPQyxTQUFTQyxpQkFBaUIsQ0FBQ1IsdUJBQXVCUyxXQUFXO1FBRTFFLE9BQVFIO1lBQ0osS0FBSztnQkFDRCxPQUFPQyxTQUFTRyxNQUFNLENBQUNWLHVCQUF1QlcsT0FBTztZQUN6RCxLQUFLO2dCQUNELE9BQU9KLFNBQVNHLE1BQU0sQ0FBQ1YsdUJBQXVCWSxLQUFLO1lBQ3ZEO2dCQUNJLE9BQU9YLDRCQUE0QlksV0FBVztRQUN0RDtJQUNKO0lBRUEsT0FBY0EsY0FBYztRQUN4QixNQUFNQyxRQUFRO1lBQ1ZDLFdBQVc7WUFDWEMsWUFBWTtZQUNaQyxNQUFNO1lBQ05DLFFBQVE7UUFDWjtRQUVBLFlBQVk7UUFDWixJQUFJQyxLQUFLQyxNQUFNLEtBQUtwQix1QkFBdUJxQixPQUFPLENBQUNDLFNBQVMsRUFBRTtZQUMxRFIsS0FBSyxDQUFDLFlBQVks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