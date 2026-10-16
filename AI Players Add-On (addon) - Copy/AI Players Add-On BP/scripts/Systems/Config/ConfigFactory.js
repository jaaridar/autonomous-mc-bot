import { world } from "@minecraft/server";
/**
 * ConfigFactory provides static helpers for creating and managing config entries and values.
 * Use this class to define config UI elements and persist their values.
 */ class _ConfigFactory {
    /**
     * Returns a sanitized key for use as a dynamic property.
     * @param key The key to sanitize.
     * @returns The sanitized key.
     */ static safeKey(key) {
        return key.replace(/[^a-zA-Z0-9]/g, "");
    }
    /**
     * Gets a config value from cache or world properties.
     * @param key The config key.
     * @param defaultValue The default value if not set.
     * @returns The config value.
     */ static get(key, defaultValue) {
        DebugTimer.countStart("this.get");
        const cachedValue = this.cache[key];
        if (cachedValue !== undefined) {
            DebugTimer.countEnd();
            return cachedValue;
        }
        const valueSaved = world.getDynamicProperty(key);
        if (valueSaved === undefined) {
            world.setDynamicProperty(key, defaultValue);
            this.cache[key] = defaultValue;
            DebugTimer.countEnd();
            return defaultValue;
        }
        this.cache[key] = valueSaved;
        DebugTimer.countEnd();
        return valueSaved;
    }
    /**
     * Sets a config value in cache and world properties.
     * @param key The config key.
     * @param value The value to set.
     */ static set(key, value) {
        DebugTimer.countStart("this.set");
        world.setDynamicProperty(key, value);
        this.cache[key] = value;
        DebugTimer.countEnd();
    }
    /**
     * Creates a toggle config entry.
     * @param key The config key.
     * @param defaultValue The default value.
     * @param version The config version.
     */ static toggle(key, defaultValue, version = 0) {
        const safeKey = this.safeKey(key);
        const currentVersion = this.get(`${safeKey}Version`);
        if (currentVersion !== version) {
            this.set(safeKey, defaultValue);
            this.set(`${safeKey}Version`, version);
        }
        return {
            type: "toggle",
            label: key,
            getDefaultValue: ()=>this.get(safeKey, defaultValue),
            handler: (data)=>{
                this.set(safeKey, data);
            }
        };
    }
    /**
     * Creates a dropdown config entry.
     * @param key The config key.
     * @param options The dropdown options.
     * @param defaultValue The default value.
     * @param version The config version.
     */ static dropdown(key, options, defaultValue, version = 0) {
        let index = options.indexOf(defaultValue);
        if (index === -1) {
            console.warn(`Default value for dropdown ${key} is not in the options list. Defaulting to the first option.`);
            index = 0;
        }
        const safeKey = this.safeKey(key);
        const currentVersion = this.get(`${safeKey}Version`);
        if (currentVersion !== version) {
            this.set(safeKey, index);
            this.set(`${safeKey}Version`, version);
        }
        return {
            type: "dropdown",
            label: key,
            options,
            getDefaultValue: ()=>this.get(safeKey, index),
            handler: (data)=>{
                this.set(safeKey, data);
            }
        };
    }
    /**
     * Creates a slider config entry.
     * @param key The config key.
     * @param minimumValue The minimum value.
     * @param maximumValue The maximum value.
     * @param valueStep The step value.
     * @param defaultValue The default value.
     * @param version The config version.
     */ static slider(key, minimumValue, maximumValue, valueStep, defaultValue, version = 0) {
        const safeKey = this.safeKey(key);
        const currentVersion = this.get(`${safeKey}Version`);
        if (currentVersion !== version) {
            this.set(safeKey, defaultValue);
            this.set(`${safeKey}Version`, version);
        }
        return {
            type: "slider",
            label: key,
            minimumValue,
            maximumValue,
            valueStep,
            getDefaultValue: ()=>this.get(safeKey, defaultValue),
            handler: (data)=>{
                this.set(safeKey, data);
            }
        };
    }
    /**
     * Creates a text field config entry.
     * @param key The config key.
     * @param placeholderText The placeholder text.
     * @param defaultValue The default value.
     * @param version The config version.
     */ static textField(key, placeholderText, defaultValue, version = 0) {
        const safeKey = this.safeKey(key);
        const currentVersion = this.get(`${safeKey}Version`);
        if (currentVersion !== version) {
            this.set(safeKey, defaultValue);
            this.set(`${safeKey}Version`, version);
        }
        return {
            type: "textField",
            label: key,
            placeholderText,
            getDefaultValue: ()=>this.get(safeKey, defaultValue),
            handler: (data)=>{
                this.set(safeKey, data);
            }
        };
    }
    /**
     * Gets a config value by key, using safeKey.
     * @param key The config key.
     * @returns The config value.
     */ static getConfigValue(key) {
        const safeKey = this.safeKey(key);
        return this.get(safeKey);
    }
    /**
     * Creates a divider element for visual separation in the config form.
     */ static divider() {
        return {
            type: "divider",
            label: ""
        };
    }
    /**
     * Creates a label element for displaying text in the config form.
     * @param text The text to display.
     */ static label(text) {
        const prefix = "§3>> ";
        const displayText = typeof text === "string" ? prefix + text : prefix + JSON.stringify(text);
        return {
            type: "label",
            label: displayText
        };
    }
    /**
     * Creates a header element for section titles in the config form.
     * @param text The header text to display.
     */ static header(text) {
        const prefix = "§3>> ";
        const displayText = typeof text === "string" ? prefix + text : prefix + JSON.stringify(text);
        return {
            type: "header",
            label: displayText
        };
    }
}
_ConfigFactory.cache = {};
globalThis.ConfigFactory = _ConfigFactory;

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkNvbmZpZ0ZhY3RvcnkudHMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgUGxheWVyLCBSYXdNZXNzYWdlLCB3b3JsZCB9IGZyb20gXCJAbWluZWNyYWZ0L3NlcnZlclwiO1xyXG5pbXBvcnQgeyBDb25maWdSZWdpc3RyeVR5cGVNYXAgfSBmcm9tIFwiU3lzdGVtcy9Db25maWcvQ29uZmlnUmVnaXN0cnlcIjtcclxuXHJcbmludGVyZmFjZSBDb25maWd1cmFibGVEYXRhQWJzdHJhY3Qge1xyXG4gICAgdHlwZTogXCJkcm9wZG93blwiIHwgXCJzbGlkZXJcIiB8IFwidGV4dEZpZWxkXCIgfCBcInRvZ2dsZVwiIHwgXCJkaXZpZGVyXCIgfCBcImxhYmVsXCIgfCBcImhlYWRlclwiO1xyXG4gICAgbGFiZWw6IHN0cmluZztcclxuICAgIGhhbmRsZXI/KGRhdGE6IG51bWJlciB8IGJvb2xlYW4gfCBzdHJpbmcsIHBsYXllcjogUGxheWVyKTogdm9pZDtcclxufVxyXG5cclxuaW50ZXJmYWNlIENvbmZpZ0VudHJ5RHJvcGRvd24gZXh0ZW5kcyBDb25maWd1cmFibGVEYXRhQWJzdHJhY3Qge1xyXG4gICAgdHlwZTogXCJkcm9wZG93blwiO1xyXG4gICAgb3B0aW9uczogc3RyaW5nW107XHJcbiAgICB0b29sdGlwPzogc3RyaW5nIHwgUmF3TWVzc2FnZTtcclxuICAgIGhhbmRsZXIoZGF0YTogbnVtYmVyLCBwbGF5ZXI6IFBsYXllcik6IHZvaWQ7XHJcbiAgICBnZXREZWZhdWx0VmFsdWUocGxheWVyOiBQbGF5ZXIpOiBudW1iZXI7XHJcbn1cclxuXHJcbmludGVyZmFjZSBDb25maWdFbnRyeVNsaWRlciBleHRlbmRzIENvbmZpZ3VyYWJsZURhdGFBYnN0cmFjdCB7XHJcbiAgICB0eXBlOiBcInNsaWRlclwiO1xyXG4gICAgbWluaW11bVZhbHVlOiBudW1iZXI7XHJcbiAgICBtYXhpbXVtVmFsdWU6IG51bWJlcjtcclxuICAgIHZhbHVlU3RlcDogbnVtYmVyO1xyXG4gICAgdG9vbHRpcD86IHN0cmluZyB8IFJhd01lc3NhZ2U7XHJcbiAgICBoYW5kbGVyKGRhdGE6IG51bWJlciwgcGxheWVyOiBQbGF5ZXIpOiB2b2lkO1xyXG4gICAgZ2V0RGVmYXVsdFZhbHVlKHBsYXllcjogUGxheWVyKTogbnVtYmVyO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgQ29uZmlnRW50cnlUZXh0RmllbGQgZXh0ZW5kcyBDb25maWd1cmFibGVEYXRhQWJzdHJhY3Qge1xyXG4gICAgdHlwZTogXCJ0ZXh0RmllbGRcIjtcclxuICAgIHBsYWNlaG9sZGVyVGV4dDogc3RyaW5nO1xyXG4gICAgdG9vbHRpcD86IHN0cmluZyB8IFJhd01lc3NhZ2U7XHJcbiAgICBoYW5kbGVyKGRhdGE6IHN0cmluZywgcGxheWVyOiBQbGF5ZXIpOiB2b2lkO1xyXG4gICAgZ2V0RGVmYXVsdFZhbHVlKHBsYXllcjogUGxheWVyKTogc3RyaW5nO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgQ29uZmlnRW50cnlUb2dnbGUgZXh0ZW5kcyBDb25maWd1cmFibGVEYXRhQWJzdHJhY3Qge1xyXG4gICAgdHlwZTogXCJ0b2dnbGVcIjtcclxuICAgIHRvb2x0aXA/OiBzdHJpbmcgfCBSYXdNZXNzYWdlO1xyXG4gICAgaGFuZGxlcihkYXRhOiBib29sZWFuLCBwbGF5ZXI6IFBsYXllcik6IHZvaWQ7XHJcbiAgICBnZXREZWZhdWx0VmFsdWUocGxheWVyOiBQbGF5ZXIpOiBib29sZWFuO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgQ29uZmlnRW50cnlEaXZpZGVyIGV4dGVuZHMgQ29uZmlndXJhYmxlRGF0YUFic3RyYWN0IHtcclxuICAgIHR5cGU6IFwiZGl2aWRlclwiO1xyXG4gICAgbGFiZWw6IFwiXCI7XHJcbn1cclxuXHJcbmludGVyZmFjZSBDb25maWdFbnRyeUxhYmVsIGV4dGVuZHMgQ29uZmlndXJhYmxlRGF0YUFic3RyYWN0IHtcclxuICAgIHR5cGU6IFwibGFiZWxcIjtcclxuICAgIGxhYmVsOiBzdHJpbmc7XHJcbn1cclxuXHJcbmludGVyZmFjZSBDb25maWdFbnRyeUhlYWRlciBleHRlbmRzIENvbmZpZ3VyYWJsZURhdGFBYnN0cmFjdCB7XHJcbiAgICB0eXBlOiBcImhlYWRlclwiO1xyXG4gICAgbGFiZWw6IHN0cmluZztcclxufVxyXG5cclxuZXhwb3J0IHR5cGUgQ29uZmlnRW50cnkgPVxyXG4gICAgfCBDb25maWdFbnRyeURyb3Bkb3duXHJcbiAgICB8IENvbmZpZ0VudHJ5U2xpZGVyXHJcbiAgICB8IENvbmZpZ0VudHJ5VGV4dEZpZWxkXHJcbiAgICB8IENvbmZpZ0VudHJ5VG9nZ2xlXHJcbiAgICB8IENvbmZpZ0VudHJ5RGl2aWRlclxyXG4gICAgfCBDb25maWdFbnRyeUxhYmVsXHJcbiAgICB8IENvbmZpZ0VudHJ5SGVhZGVyO1xyXG5cclxuLyoqXHJcbiAqIENvbmZpZ0ZhY3RvcnkgcHJvdmlkZXMgc3RhdGljIGhlbHBlcnMgZm9yIGNyZWF0aW5nIGFuZCBtYW5hZ2luZyBjb25maWcgZW50cmllcyBhbmQgdmFsdWVzLlxyXG4gKiBVc2UgdGhpcyBjbGFzcyB0byBkZWZpbmUgY29uZmlnIFVJIGVsZW1lbnRzIGFuZCBwZXJzaXN0IHRoZWlyIHZhbHVlcy5cclxuICovXHJcbmNsYXNzIF9Db25maWdGYWN0b3J5IHtcclxuICAgIC8qKlxyXG4gICAgICogUmV0dXJucyBhIHNhbml0aXplZCBrZXkgZm9yIHVzZSBhcyBhIGR5bmFtaWMgcHJvcGVydHkuXHJcbiAgICAgKiBAcGFyYW0ga2V5IFRoZSBrZXkgdG8gc2FuaXRpemUuXHJcbiAgICAgKiBAcmV0dXJucyBUaGUgc2FuaXRpemVkIGtleS5cclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBzYWZlS2V5KGtleTogc3RyaW5nKSB7XHJcbiAgICAgICAgcmV0dXJuIGtleS5yZXBsYWNlKC9bXmEtekEtWjAtOV0vZywgXCJcIik7XHJcbiAgICB9XHJcblxyXG4gICAgcHVibGljIHN0YXRpYyBjYWNoZTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gPSB7fTtcclxuXHJcbiAgICAvKipcclxuICAgICAqIEdldHMgYSBjb25maWcgdmFsdWUgZnJvbSBjYWNoZSBvciB3b3JsZCBwcm9wZXJ0aWVzLlxyXG4gICAgICogQHBhcmFtIGtleSBUaGUgY29uZmlnIGtleS5cclxuICAgICAqIEBwYXJhbSBkZWZhdWx0VmFsdWUgVGhlIGRlZmF1bHQgdmFsdWUgaWYgbm90IHNldC5cclxuICAgICAqIEByZXR1cm5zIFRoZSBjb25maWcgdmFsdWUuXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgZ2V0PFQgZXh0ZW5kcyBzdHJpbmcgfCBudW1iZXIgfCBib29sZWFuIHwgdW5kZWZpbmVkPihrZXk6IHN0cmluZywgZGVmYXVsdFZhbHVlPzogVCk6IFQge1xyXG4gICAgICAgIERlYnVnVGltZXIuY291bnRTdGFydChcInRoaXMuZ2V0XCIpO1xyXG4gICAgICAgIGNvbnN0IGNhY2hlZFZhbHVlID0gdGhpcy5jYWNoZVtrZXldO1xyXG4gICAgICAgIGlmIChjYWNoZWRWYWx1ZSAhPT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgICAgIERlYnVnVGltZXIuY291bnRFbmQoKTtcclxuICAgICAgICAgICAgcmV0dXJuIGNhY2hlZFZhbHVlIGFzIFQ7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGNvbnN0IHZhbHVlU2F2ZWQgPSB3b3JsZC5nZXREeW5hbWljUHJvcGVydHkoa2V5KSBhcyBUO1xyXG4gICAgICAgIGlmICh2YWx1ZVNhdmVkID09PSB1bmRlZmluZWQpIHtcclxuICAgICAgICAgICAgd29ybGQuc2V0RHluYW1pY1Byb3BlcnR5KGtleSwgZGVmYXVsdFZhbHVlKTtcclxuICAgICAgICAgICAgdGhpcy5jYWNoZVtrZXldID0gZGVmYXVsdFZhbHVlO1xyXG4gICAgICAgICAgICBEZWJ1Z1RpbWVyLmNvdW50RW5kKCk7XHJcbiAgICAgICAgICAgIHJldHVybiBkZWZhdWx0VmFsdWUgYXMgVDtcclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy5jYWNoZVtrZXldID0gdmFsdWVTYXZlZDtcclxuICAgICAgICBEZWJ1Z1RpbWVyLmNvdW50RW5kKCk7XHJcbiAgICAgICAgcmV0dXJuIHZhbHVlU2F2ZWQ7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBTZXRzIGEgY29uZmlnIHZhbHVlIGluIGNhY2hlIGFuZCB3b3JsZCBwcm9wZXJ0aWVzLlxyXG4gICAgICogQHBhcmFtIGtleSBUaGUgY29uZmlnIGtleS5cclxuICAgICAqIEBwYXJhbSB2YWx1ZSBUaGUgdmFsdWUgdG8gc2V0LlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHNldChrZXk6IHN0cmluZywgdmFsdWU6IHN0cmluZyB8IG51bWJlciB8IGJvb2xlYW4pIHtcclxuICAgICAgICBEZWJ1Z1RpbWVyLmNvdW50U3RhcnQoXCJ0aGlzLnNldFwiKTtcclxuICAgICAgICB3b3JsZC5zZXREeW5hbWljUHJvcGVydHkoa2V5LCB2YWx1ZSk7XHJcbiAgICAgICAgdGhpcy5jYWNoZVtrZXldID0gdmFsdWU7XHJcbiAgICAgICAgRGVidWdUaW1lci5jb3VudEVuZCgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQ3JlYXRlcyBhIHRvZ2dsZSBjb25maWcgZW50cnkuXHJcbiAgICAgKiBAcGFyYW0ga2V5IFRoZSBjb25maWcga2V5LlxyXG4gICAgICogQHBhcmFtIGRlZmF1bHRWYWx1ZSBUaGUgZGVmYXVsdCB2YWx1ZS5cclxuICAgICAqIEBwYXJhbSB2ZXJzaW9uIFRoZSBjb25maWcgdmVyc2lvbi5cclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyB0b2dnbGU8S2V5IGV4dGVuZHMgc3RyaW5nPihrZXk6IEtleSwgZGVmYXVsdFZhbHVlOiBib29sZWFuLCB2ZXJzaW9uID0gMCkge1xyXG4gICAgICAgIGNvbnN0IHNhZmVLZXkgPSB0aGlzLnNhZmVLZXkoa2V5KTtcclxuICAgICAgICBjb25zdCBjdXJyZW50VmVyc2lvbiA9IHRoaXMuZ2V0KGAke3NhZmVLZXl9VmVyc2lvbmApO1xyXG4gICAgICAgIGlmIChjdXJyZW50VmVyc2lvbiAhPT0gdmVyc2lvbikge1xyXG4gICAgICAgICAgICB0aGlzLnNldChzYWZlS2V5LCBkZWZhdWx0VmFsdWUpO1xyXG4gICAgICAgICAgICB0aGlzLnNldChgJHtzYWZlS2V5fVZlcnNpb25gLCB2ZXJzaW9uKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHJldHVybiB7XHJcbiAgICAgICAgICAgIHR5cGU6IFwidG9nZ2xlXCIsXHJcbiAgICAgICAgICAgIGxhYmVsOiBrZXkgYXMgS2V5LFxyXG4gICAgICAgICAgICBnZXREZWZhdWx0VmFsdWU6ICgpID0+IHRoaXMuZ2V0KHNhZmVLZXksIGRlZmF1bHRWYWx1ZSksXHJcbiAgICAgICAgICAgIGhhbmRsZXI6IChkYXRhOiBib29sZWFuKSA9PiB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnNldChzYWZlS2V5LCBkYXRhKTtcclxuICAgICAgICAgICAgfSxcclxuICAgICAgICB9IGFzIGNvbnN0O1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQ3JlYXRlcyBhIGRyb3Bkb3duIGNvbmZpZyBlbnRyeS5cclxuICAgICAqIEBwYXJhbSBrZXkgVGhlIGNvbmZpZyBrZXkuXHJcbiAgICAgKiBAcGFyYW0gb3B0aW9ucyBUaGUgZHJvcGRvd24gb3B0aW9ucy5cclxuICAgICAqIEBwYXJhbSBkZWZhdWx0VmFsdWUgVGhlIGRlZmF1bHQgdmFsdWUuXHJcbiAgICAgKiBAcGFyYW0gdmVyc2lvbiBUaGUgY29uZmlnIHZlcnNpb24uXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgZHJvcGRvd248S2V5IGV4dGVuZHMgc3RyaW5nPihrZXk6IEtleSwgb3B0aW9uczogc3RyaW5nW10sIGRlZmF1bHRWYWx1ZTogc3RyaW5nLCB2ZXJzaW9uID0gMCkge1xyXG4gICAgICAgIGxldCBpbmRleCA9IG9wdGlvbnMuaW5kZXhPZihkZWZhdWx0VmFsdWUpO1xyXG4gICAgICAgIGlmIChpbmRleCA9PT0gLTEpIHtcclxuICAgICAgICAgICAgY29uc29sZS53YXJuKGBEZWZhdWx0IHZhbHVlIGZvciBkcm9wZG93biAke2tleX0gaXMgbm90IGluIHRoZSBvcHRpb25zIGxpc3QuIERlZmF1bHRpbmcgdG8gdGhlIGZpcnN0IG9wdGlvbi5gKTtcclxuICAgICAgICAgICAgaW5kZXggPSAwO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc3Qgc2FmZUtleSA9IHRoaXMuc2FmZUtleShrZXkpO1xyXG4gICAgICAgIGNvbnN0IGN1cnJlbnRWZXJzaW9uID0gdGhpcy5nZXQoYCR7c2FmZUtleX1WZXJzaW9uYCk7XHJcbiAgICAgICAgaWYgKGN1cnJlbnRWZXJzaW9uICE9PSB2ZXJzaW9uKSB7XHJcbiAgICAgICAgICAgIHRoaXMuc2V0KHNhZmVLZXksIGluZGV4KTtcclxuICAgICAgICAgICAgdGhpcy5zZXQoYCR7c2FmZUtleX1WZXJzaW9uYCwgdmVyc2lvbik7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICByZXR1cm4ge1xyXG4gICAgICAgICAgICB0eXBlOiBcImRyb3Bkb3duXCIsXHJcbiAgICAgICAgICAgIGxhYmVsOiBrZXkgYXMgS2V5LFxyXG4gICAgICAgICAgICBvcHRpb25zLFxyXG4gICAgICAgICAgICBnZXREZWZhdWx0VmFsdWU6ICgpID0+IHRoaXMuZ2V0KHNhZmVLZXksIGluZGV4KSxcclxuICAgICAgICAgICAgaGFuZGxlcjogKGRhdGE6IG51bWJlcikgPT4ge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5zZXQoc2FmZUtleSwgZGF0YSk7XHJcbiAgICAgICAgICAgIH0sXHJcbiAgICAgICAgfSBhcyBjb25zdDtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIENyZWF0ZXMgYSBzbGlkZXIgY29uZmlnIGVudHJ5LlxyXG4gICAgICogQHBhcmFtIGtleSBUaGUgY29uZmlnIGtleS5cclxuICAgICAqIEBwYXJhbSBtaW5pbXVtVmFsdWUgVGhlIG1pbmltdW0gdmFsdWUuXHJcbiAgICAgKiBAcGFyYW0gbWF4aW11bVZhbHVlIFRoZSBtYXhpbXVtIHZhbHVlLlxyXG4gICAgICogQHBhcmFtIHZhbHVlU3RlcCBUaGUgc3RlcCB2YWx1ZS5cclxuICAgICAqIEBwYXJhbSBkZWZhdWx0VmFsdWUgVGhlIGRlZmF1bHQgdmFsdWUuXHJcbiAgICAgKiBAcGFyYW0gdmVyc2lvbiBUaGUgY29uZmlnIHZlcnNpb24uXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgc2xpZGVyPEtleSBleHRlbmRzIHN0cmluZz4oXHJcbiAgICAgICAga2V5OiBLZXksXHJcbiAgICAgICAgbWluaW11bVZhbHVlOiBudW1iZXIsXHJcbiAgICAgICAgbWF4aW11bVZhbHVlOiBudW1iZXIsXHJcbiAgICAgICAgdmFsdWVTdGVwOiBudW1iZXIsXHJcbiAgICAgICAgZGVmYXVsdFZhbHVlOiBudW1iZXIsXHJcbiAgICAgICAgdmVyc2lvbiA9IDBcclxuICAgICkge1xyXG4gICAgICAgIGNvbnN0IHNhZmVLZXkgPSB0aGlzLnNhZmVLZXkoa2V5KTtcclxuICAgICAgICBjb25zdCBjdXJyZW50VmVyc2lvbiA9IHRoaXMuZ2V0KGAke3NhZmVLZXl9VmVyc2lvbmApO1xyXG4gICAgICAgIGlmIChjdXJyZW50VmVyc2lvbiAhPT0gdmVyc2lvbikge1xyXG4gICAgICAgICAgICB0aGlzLnNldChzYWZlS2V5LCBkZWZhdWx0VmFsdWUpO1xyXG4gICAgICAgICAgICB0aGlzLnNldChgJHtzYWZlS2V5fVZlcnNpb25gLCB2ZXJzaW9uKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHJldHVybiB7XHJcbiAgICAgICAgICAgIHR5cGU6IFwic2xpZGVyXCIsXHJcbiAgICAgICAgICAgIGxhYmVsOiBrZXkgYXMgS2V5LFxyXG4gICAgICAgICAgICBtaW5pbXVtVmFsdWUsXHJcbiAgICAgICAgICAgIG1heGltdW1WYWx1ZSxcclxuICAgICAgICAgICAgdmFsdWVTdGVwLFxyXG4gICAgICAgICAgICBnZXREZWZhdWx0VmFsdWU6ICgpID0+IHRoaXMuZ2V0KHNhZmVLZXksIGRlZmF1bHRWYWx1ZSksXHJcbiAgICAgICAgICAgIGhhbmRsZXI6IChkYXRhOiBudW1iZXIpID0+IHtcclxuICAgICAgICAgICAgICAgIHRoaXMuc2V0KHNhZmVLZXksIGRhdGEpO1xyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgIH0gYXMgY29uc3Q7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBDcmVhdGVzIGEgdGV4dCBmaWVsZCBjb25maWcgZW50cnkuXHJcbiAgICAgKiBAcGFyYW0ga2V5IFRoZSBjb25maWcga2V5LlxyXG4gICAgICogQHBhcmFtIHBsYWNlaG9sZGVyVGV4dCBUaGUgcGxhY2Vob2xkZXIgdGV4dC5cclxuICAgICAqIEBwYXJhbSBkZWZhdWx0VmFsdWUgVGhlIGRlZmF1bHQgdmFsdWUuXHJcbiAgICAgKiBAcGFyYW0gdmVyc2lvbiBUaGUgY29uZmlnIHZlcnNpb24uXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgdGV4dEZpZWxkPEtleSBleHRlbmRzIHN0cmluZz4oa2V5OiBLZXksIHBsYWNlaG9sZGVyVGV4dDogc3RyaW5nLCBkZWZhdWx0VmFsdWU6IHN0cmluZywgdmVyc2lvbiA9IDApIHtcclxuICAgICAgICBjb25zdCBzYWZlS2V5ID0gdGhpcy5zYWZlS2V5KGtleSk7XHJcbiAgICAgICAgY29uc3QgY3VycmVudFZlcnNpb24gPSB0aGlzLmdldChgJHtzYWZlS2V5fVZlcnNpb25gKTtcclxuICAgICAgICBpZiAoY3VycmVudFZlcnNpb24gIT09IHZlcnNpb24pIHtcclxuICAgICAgICAgICAgdGhpcy5zZXQoc2FmZUtleSwgZGVmYXVsdFZhbHVlKTtcclxuICAgICAgICAgICAgdGhpcy5zZXQoYCR7c2FmZUtleX1WZXJzaW9uYCwgdmVyc2lvbik7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICByZXR1cm4ge1xyXG4gICAgICAgICAgICB0eXBlOiBcInRleHRGaWVsZFwiLFxyXG4gICAgICAgICAgICBsYWJlbDoga2V5IGFzIEtleSxcclxuICAgICAgICAgICAgcGxhY2Vob2xkZXJUZXh0LFxyXG4gICAgICAgICAgICBnZXREZWZhdWx0VmFsdWU6ICgpID0+IHRoaXMuZ2V0KHNhZmVLZXksIGRlZmF1bHRWYWx1ZSksXHJcbiAgICAgICAgICAgIGhhbmRsZXI6IChkYXRhOiBzdHJpbmcpID0+IHtcclxuICAgICAgICAgICAgICAgIHRoaXMuc2V0KHNhZmVLZXksIGRhdGEpO1xyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgIH0gYXMgY29uc3Q7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBHZXRzIGEgY29uZmlnIHZhbHVlIGJ5IGtleSwgdXNpbmcgc2FmZUtleS5cclxuICAgICAqIEBwYXJhbSBrZXkgVGhlIGNvbmZpZyBrZXkuXHJcbiAgICAgKiBAcmV0dXJucyBUaGUgY29uZmlnIHZhbHVlLlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGdldENvbmZpZ1ZhbHVlPEsgZXh0ZW5kcyBrZXlvZiBDb25maWdSZWdpc3RyeVR5cGVNYXA+KGtleTogSykge1xyXG4gICAgICAgIGNvbnN0IHNhZmVLZXkgPSB0aGlzLnNhZmVLZXkoa2V5KTtcclxuICAgICAgICByZXR1cm4gdGhpcy5nZXQoc2FmZUtleSkgYXMgQ29uZmlnUmVnaXN0cnlUeXBlTWFwW0tdO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQ3JlYXRlcyBhIGRpdmlkZXIgZWxlbWVudCBmb3IgdmlzdWFsIHNlcGFyYXRpb24gaW4gdGhlIGNvbmZpZyBmb3JtLlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGRpdmlkZXIoKSB7XHJcbiAgICAgICAgcmV0dXJuIHtcclxuICAgICAgICAgICAgdHlwZTogXCJkaXZpZGVyXCIsXHJcbiAgICAgICAgICAgIGxhYmVsOiBcIlwiLFxyXG4gICAgICAgIH0gYXMgY29uc3Q7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBDcmVhdGVzIGEgbGFiZWwgZWxlbWVudCBmb3IgZGlzcGxheWluZyB0ZXh0IGluIHRoZSBjb25maWcgZm9ybS5cclxuICAgICAqIEBwYXJhbSB0ZXh0IFRoZSB0ZXh0IHRvIGRpc3BsYXkuXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgbGFiZWwodGV4dDogc3RyaW5nIHwgUmF3TWVzc2FnZSkge1xyXG4gICAgICAgIGNvbnN0IHByZWZpeCA9IFwiwqczPj4gXCI7XHJcbiAgICAgICAgY29uc3QgZGlzcGxheVRleHQgPSB0eXBlb2YgdGV4dCA9PT0gXCJzdHJpbmdcIiA/IHByZWZpeCArIHRleHQgOiBwcmVmaXggKyBKU09OLnN0cmluZ2lmeSh0ZXh0KTtcclxuICAgICAgICByZXR1cm4ge1xyXG4gICAgICAgICAgICB0eXBlOiBcImxhYmVsXCIsXHJcbiAgICAgICAgICAgIGxhYmVsOiBkaXNwbGF5VGV4dCxcclxuICAgICAgICB9IGFzIGNvbnN0O1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQ3JlYXRlcyBhIGhlYWRlciBlbGVtZW50IGZvciBzZWN0aW9uIHRpdGxlcyBpbiB0aGUgY29uZmlnIGZvcm0uXHJcbiAgICAgKiBAcGFyYW0gdGV4dCBUaGUgaGVhZGVyIHRleHQgdG8gZGlzcGxheS5cclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBoZWFkZXIodGV4dDogc3RyaW5nIHwgUmF3TWVzc2FnZSkge1xyXG4gICAgICAgIGNvbnN0IHByZWZpeCA9IFwiwqczPj4gXCI7XHJcbiAgICAgICAgY29uc3QgZGlzcGxheVRleHQgPSB0eXBlb2YgdGV4dCA9PT0gXCJzdHJpbmdcIiA/IHByZWZpeCArIHRleHQgOiBwcmVmaXggKyBKU09OLnN0cmluZ2lmeSh0ZXh0KTtcclxuICAgICAgICByZXR1cm4ge1xyXG4gICAgICAgICAgICB0eXBlOiBcImhlYWRlclwiLFxyXG4gICAgICAgICAgICBsYWJlbDogZGlzcGxheVRleHQsXHJcbiAgICAgICAgfSBhcyBjb25zdDtcclxuICAgIH1cclxufVxyXG5cclxuZGVjbGFyZSBnbG9iYWwge1xyXG4gICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXZhclxyXG4gICAgdmFyIENvbmZpZ0ZhY3Rvcnk6IE9taXQ8dHlwZW9mIF9Db25maWdGYWN0b3J5LCBcInByb3RvdHlwZVwiPjtcclxufVxyXG5nbG9iYWxUaGlzLkNvbmZpZ0ZhY3RvcnkgPSBfQ29uZmlnRmFjdG9yeTtcclxuIl0sIm5hbWVzIjpbIndvcmxkIiwiX0NvbmZpZ0ZhY3RvcnkiLCJzYWZlS2V5Iiwia2V5IiwicmVwbGFjZSIsImdldCIsImRlZmF1bHRWYWx1ZSIsIkRlYnVnVGltZXIiLCJjb3VudFN0YXJ0IiwiY2FjaGVkVmFsdWUiLCJjYWNoZSIsInVuZGVmaW5lZCIsImNvdW50RW5kIiwidmFsdWVTYXZlZCIsImdldER5bmFtaWNQcm9wZXJ0eSIsInNldER5bmFtaWNQcm9wZXJ0eSIsInNldCIsInZhbHVlIiwidG9nZ2xlIiwidmVyc2lvbiIsImN1cnJlbnRWZXJzaW9uIiwidHlwZSIsImxhYmVsIiwiZ2V0RGVmYXVsdFZhbHVlIiwiaGFuZGxlciIsImRhdGEiLCJkcm9wZG93biIsIm9wdGlvbnMiLCJpbmRleCIsImluZGV4T2YiLCJjb25zb2xlIiwid2FybiIsInNsaWRlciIsIm1pbmltdW1WYWx1ZSIsIm1heGltdW1WYWx1ZSIsInZhbHVlU3RlcCIsInRleHRGaWVsZCIsInBsYWNlaG9sZGVyVGV4dCIsImdldENvbmZpZ1ZhbHVlIiwiZGl2aWRlciIsInRleHQiLCJwcmVmaXgiLCJkaXNwbGF5VGV4dCIsIkpTT04iLCJzdHJpbmdpZnkiLCJoZWFkZXIiLCJnbG9iYWxUaGlzIiwiQ29uZmlnRmFjdG9yeSJdLCJtYXBwaW5ncyI6IkFBQUEsU0FBNkJBLEtBQUssUUFBUSxvQkFBb0I7QUFrRTlEOzs7Q0FHQyxHQUNELE1BQU1DO0lBQ0Y7Ozs7S0FJQyxHQUNELE9BQWNDLFFBQVFDLEdBQVcsRUFBRTtRQUMv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