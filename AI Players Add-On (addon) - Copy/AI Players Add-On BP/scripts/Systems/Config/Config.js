import { ScriptEventSource } from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";
import { ScriptEventRegistry } from "Systems/ScriptEvents/ScriptEventRegistry";
import ConfigRegistry from "./ConfigRegistry";
/**
 * Config provides a UI and API for managing configurable game settings.
 * Use this class to show configuration forms to players and get/set config values. */ class _Config {
    /**
     * Initializes the config system and subscribes to item use events.
     */ static init() {
        this.configData = ConfigRegistry();
        EventSubscriber.subscribe("WorldAfterEvents", "itemUse", (e)=>this.onItemUse(e));
    }
    /**
     * Initializes a modal form for configuring settings based on the provided configuration data.
     * The form is dynamically populated with various input fields (dropdowns, sliders, text fields, toggles)
     * and UI elements (dividers, labels, headers) depending on the type of each configuration entry.
     * @param player - The player for whom the form is being initialized. Used to retrieve default values
     *                 for the configuration entries.
     * Configuration entry types:
     * - **dropdown**: Adds a dropdown menu with options and an optional tooltip.
     * - **slider**: Adds a slider with a range, step value, and an optional tooltip.
     * - **textField**: Adds a text input field with a placeholder and an optional tooltip.
     * - **toggle**: Adds a toggle switch with a default value.
     * - **divider**: Adds a visual separator line.
     * - **label**: Adds descriptive text.
     * - **header**: Adds a section header/title.
     */ static initForm(player) {
        this.form = new ModalFormData().title("Configurables");
        for (const entry of this.configData){
            switch(entry.type){
                case "dropdown":
                    this.form.dropdown(entry.label, entry.options, {
                        defaultValueIndex: entry.getDefaultValue(player),
                        tooltip: entry.tooltip
                    });
                    break;
                case "slider":
                    this.form.slider(entry.label, entry.minimumValue, entry.maximumValue, {
                        defaultValue: entry.getDefaultValue(player),
                        tooltip: entry.tooltip,
                        valueStep: entry.valueStep
                    });
                    break;
                case "textField":
                    this.form.textField(entry.label, entry.placeholderText, {
                        defaultValue: entry.getDefaultValue(player),
                        tooltip: entry.tooltip
                    });
                    break;
                case "toggle":
                    this.form.toggle(entry.label, {
                        defaultValue: entry.getDefaultValue(player)
                    });
                    break;
                case "divider":
                    this.form.divider();
                    break;
                case "label":
                    {
                        this.form.label(entry.label);
                        break;
                    }
                case "header":
                    {
                        this.form.header(entry.label);
                        break;
                    }
            }
        }
    }
    static onItemUse(eventData) {
        if (eventData.itemStack.typeId !== this.configItemTypeId) return;
        if (eventData.source.isSneaking) {
            this.openScriptEventsForm(eventData.source);
        } else {
            this.openConfigForm(eventData.source);
        }
    }
    /**
     * Opens the configuration form for the player.
     * @param player The player who used the item.
     */ static openConfigForm(player) {
        const initialValues = this.getConfigurablesList(player);
        this.initForm(player);
        this.form.show(player).then((data)=>{
            this.onFormSubmit(data, player);
            // compare new values with old values and output the difference
            const newValues = this.getConfigurablesList(player);
            let output = "";
            for(let i = 0; i < initialValues.length; i++){
                if (initialValues[i][1] !== newValues[i][1]) {
                    output += `\n§b${initialValues[i][0]}§r: §c${initialValues[i][1]}§r -> §a${newValues[i][1]}§r`;
                    CustomEvents.emit("ConfigDataChanged", newValues[i][0], this.get(newValues[i][0]));
                }
            }
            if (output.length > 0) {
                BroadcastUtil.debug(`§lConfigurables changed:§r${output}`);
            }
        });
    }
    /**
     * Opens the script events form for the player.
     * @param player The player who used the item.
     */ static openScriptEventsForm(player) {
        const form = new ActionFormData().title("Script Events");
        for(const scriptEventKey in ScriptEventRegistry){
            form.button(scriptEventKey);
        }
        form.show(player).then((data)=>{
            if (typeof data.selection !== "number") return;
            const [key, handler] = Object.entries(ScriptEventRegistry)[data.selection];
            handler({
                id: key,
                sourceEntity: player,
                sourceType: ScriptEventSource.Entity,
                message: ""
            });
        });
    }
    static getConfigurablesList(player) {
        const list = [];
        for (const entry of this.configData){
            // Skip UI-only elements that don't have values
            if (entry.type === "divider" || entry.type === "label" || entry.type === "header") {
                continue;
            }
            let value = entry.getDefaultValue(player);
            if (entry.type === "dropdown") {
                value = entry.options[value];
            } else if (entry.type === "toggle") {
                value = value ? "ON" : "OFF";
            }
            list.push([
                entry.label,
                value
            ]);
        }
        return list;
    }
    static onFormSubmit(data, player) {
        if (!data.formValues) return;
        let formValueIndex = 0;
        for (const entry of this.configData){
            // UI-only elements don't have handlers but have form values
            if (entry.type === "divider" || entry.type === "header") {
                formValueIndex++;
                continue;
            }
            // Call handler for actual config entries
            if (entry.handler && formValueIndex < data.formValues.length) {
                entry.handler(data.formValues[formValueIndex], player);
            }
            formValueIndex++;
        }
    }
    static safeKey(key) {
        return key.replace(/[^a-zA-Z0-9]/g, "");
    }
    /**
     * Gets a config value by key.
     * @param key The config key.
     * @returns The config value.
     */ static get(key) {
        return ConfigFactory.getConfigValue(key);
    }
}
_Config.configItemTypeId = "gm1_sky:configurables";
globalThis.Config = _Config;

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkNvbmZpZy50cyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBJdGVtVXNlQWZ0ZXJFdmVudCwgUGxheWVyLCBTY3JpcHRFdmVudFNvdXJjZSB9IGZyb20gXCJAbWluZWNyYWZ0L3NlcnZlclwiO1xyXG5pbXBvcnQgeyBBY3Rpb25Gb3JtRGF0YSwgTW9kYWxGb3JtRGF0YSwgTW9kYWxGb3JtUmVzcG9uc2UgfSBmcm9tIFwiQG1pbmVjcmFmdC9zZXJ2ZXItdWlcIjtcclxuaW1wb3J0IHsgU2NyaXB0RXZlbnRSZWdpc3RyeSB9IGZyb20gXCJTeXN0ZW1zL1NjcmlwdEV2ZW50cy9TY3JpcHRFdmVudFJlZ2lzdHJ5XCI7XHJcbmltcG9ydCB7IENvbmZpZ0VudHJ5IH0gZnJvbSBcIi4vQ29uZmlnRmFjdG9yeVwiO1xyXG5pbXBvcnQgQ29uZmlnUmVnaXN0cnksIHsgQ29uZmlnUmVnaXN0cnlUeXBlTWFwIH0gZnJvbSBcIi4vQ29uZmlnUmVnaXN0cnlcIjtcclxuXHJcbi8qKlxyXG4gKiBDb25maWcgcHJvdmlkZXMgYSBVSSBhbmQgQVBJIGZvciBtYW5hZ2luZyBjb25maWd1cmFibGUgZ2FtZSBzZXR0aW5ncy5cclxuICogVXNlIHRoaXMgY2xhc3MgdG8gc2hvdyBjb25maWd1cmF0aW9uIGZvcm1zIHRvIHBsYXllcnMgYW5kIGdldC9zZXQgY29uZmlnIHZhbHVlcy4gKi9cclxuY2xhc3MgX0NvbmZpZyB7XHJcbiAgICBwcml2YXRlIHN0YXRpYyBmb3JtOiBNb2RhbEZvcm1EYXRhO1xyXG4gICAgcHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgY29uZmlnSXRlbVR5cGVJZCA9IFwiZ20xX3NreTpjb25maWd1cmFibGVzXCI7XHJcblxyXG4gICAgcHJpdmF0ZSBzdGF0aWMgY29uZmlnRGF0YTogQ29uZmlnRW50cnlbXTtcclxuXHJcbiAgICAvKipcclxuICAgICAqIEluaXRpYWxpemVzIHRoZSBjb25maWcgc3lzdGVtIGFuZCBzdWJzY3JpYmVzIHRvIGl0ZW0gdXNlIGV2ZW50cy5cclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBpbml0KCkge1xyXG4gICAgICAgIHRoaXMuY29uZmlnRGF0YSA9IENvbmZpZ1JlZ2lzdHJ5KCk7XHJcbiAgICAgICAgRXZlbnRTdWJzY3JpYmVyLnN1YnNjcmliZShcIldvcmxkQWZ0ZXJFdmVudHNcIiwgXCJpdGVtVXNlXCIsIChlKSA9PiB0aGlzLm9uSXRlbVVzZShlKSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBJbml0aWFsaXplcyBhIG1vZGFsIGZvcm0gZm9yIGNvbmZpZ3VyaW5nIHNldHRpbmdzIGJhc2VkIG9uIHRoZSBwcm92aWRlZCBjb25maWd1cmF0aW9uIGRhdGEuXHJcbiAgICAgKiBUaGUgZm9ybSBpcyBkeW5hbWljYWxseSBwb3B1bGF0ZWQgd2l0aCB2YXJpb3VzIGlucHV0IGZpZWxkcyAoZHJvcGRvd25zLCBzbGlkZXJzLCB0ZXh0IGZpZWxkcywgdG9nZ2xlcylcclxuICAgICAqIGFuZCBVSSBlbGVtZW50cyAoZGl2aWRlcnMsIGxhYmVscywgaGVhZGVycykgZGVwZW5kaW5nIG9uIHRoZSB0eXBlIG9mIGVhY2ggY29uZmlndXJhdGlvbiBlbnRyeS5cclxuICAgICAqIEBwYXJhbSBwbGF5ZXIgLSBUaGUgcGxheWVyIGZvciB3aG9tIHRoZSBmb3JtIGlzIGJlaW5nIGluaXRpYWxpemVkLiBVc2VkIHRvIHJldHJpZXZlIGRlZmF1bHQgdmFsdWVzXHJcbiAgICAgKiAgICAgICAgICAgICAgICAgZm9yIHRoZSBjb25maWd1cmF0aW9uIGVudHJpZXMuXHJcbiAgICAgKiBDb25maWd1cmF0aW9uIGVudHJ5IHR5cGVzOlxyXG4gICAgICogLSAqKmRyb3Bkb3duKio6IEFkZHMgYSBkcm9wZG93biBtZW51IHdpdGggb3B0aW9ucyBhbmQgYW4gb3B0aW9uYWwgdG9vbHRpcC5cclxuICAgICAqIC0gKipzbGlkZXIqKjogQWRkcyBhIHNsaWRlciB3aXRoIGEgcmFuZ2UsIHN0ZXAgdmFsdWUsIGFuZCBhbiBvcHRpb25hbCB0b29sdGlwLlxyXG4gICAgICogLSAqKnRleHRGaWVsZCoqOiBBZGRzIGEgdGV4dCBpbnB1dCBmaWVsZCB3aXRoIGEgcGxhY2Vob2xkZXIgYW5kIGFuIG9wdGlvbmFsIHRvb2x0aXAuXHJcbiAgICAgKiAtICoqdG9nZ2xlKio6IEFkZHMgYSB0b2dnbGUgc3dpdGNoIHdpdGggYSBkZWZhdWx0IHZhbHVlLlxyXG4gICAgICogLSAqKmRpdmlkZXIqKjogQWRkcyBhIHZpc3VhbCBzZXBhcmF0b3IgbGluZS5cclxuICAgICAqIC0gKipsYWJlbCoqOiBBZGRzIGRlc2NyaXB0aXZlIHRleHQuXHJcbiAgICAgKiAtICoqaGVhZGVyKio6IEFkZHMgYSBzZWN0aW9uIGhlYWRlci90aXRsZS5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBzdGF0aWMgaW5pdEZvcm0ocGxheWVyOiBQbGF5ZXIpIHtcclxuICAgICAgICB0aGlzLmZvcm0gPSBuZXcgTW9kYWxGb3JtRGF0YSgpLnRpdGxlKFwiQ29uZmlndXJhYmxlc1wiKTtcclxuICAgICAgICBmb3IgKGNvbnN0IGVudHJ5IG9mIHRoaXMuY29uZmlnRGF0YSkge1xyXG4gICAgICAgICAgICBzd2l0Y2ggKGVudHJ5LnR5cGUpIHtcclxuICAgICAgICAgICAgICAgIGNhc2UgXCJkcm9wZG93blwiOlxyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZm9ybS5kcm9wZG93bihlbnRyeS5sYWJlbCwgZW50cnkub3B0aW9ucywge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBkZWZhdWx0VmFsdWVJbmRleDogZW50cnkuZ2V0RGVmYXVsdFZhbHVlKHBsYXllciksXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRvb2x0aXA6IGVudHJ5LnRvb2x0aXAsXHJcbiAgICAgICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBjYXNlIFwic2xpZGVyXCI6XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5mb3JtLnNsaWRlcihlbnRyeS5sYWJlbCwgZW50cnkubWluaW11bVZhbHVlLCBlbnRyeS5tYXhpbXVtVmFsdWUsIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgZGVmYXVsdFZhbHVlOiBlbnRyeS5nZXREZWZhdWx0VmFsdWUocGxheWVyKSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgdG9vbHRpcDogZW50cnkudG9vbHRpcCxcclxuICAgICAgICAgICAgICAgICAgICAgICAgdmFsdWVTdGVwOiBlbnRyeS52YWx1ZVN0ZXAsXHJcbiAgICAgICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBjYXNlIFwidGV4dEZpZWxkXCI6XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5mb3JtLnRleHRGaWVsZChlbnRyeS5sYWJlbCwgZW50cnkucGxhY2Vob2xkZXJUZXh0LCB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGRlZmF1bHRWYWx1ZTogZW50cnkuZ2V0RGVmYXVsdFZhbHVlKHBsYXllciksXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRvb2x0aXA6IGVudHJ5LnRvb2x0aXAsXHJcbiAgICAgICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBjYXNlIFwidG9nZ2xlXCI6XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5mb3JtLnRvZ2dsZShlbnRyeS5sYWJlbCwgeyBkZWZhdWx0VmFsdWU6IGVudHJ5LmdldERlZmF1bHRWYWx1ZShwbGF5ZXIpIH0pO1xyXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgY2FzZSBcImRpdmlkZXJcIjpcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmZvcm0uZGl2aWRlcigpO1xyXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgY2FzZSBcImxhYmVsXCI6IHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmZvcm0ubGFiZWwoZW50cnkubGFiZWwpO1xyXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgY2FzZSBcImhlYWRlclwiOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5mb3JtLmhlYWRlcihlbnRyeS5sYWJlbCk7XHJcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBzdGF0aWMgb25JdGVtVXNlKGV2ZW50RGF0YTogSXRlbVVzZUFmdGVyRXZlbnQpIHtcclxuICAgICAgICBpZiAoZXZlbnREYXRhLml0ZW1TdGFjay50eXBlSWQgIT09IHRoaXMuY29uZmlnSXRlbVR5cGVJZCkgcmV0dXJuO1xyXG5cclxuICAgICAgICBpZiAoZXZlbnREYXRhLnNvdXJjZS5pc1NuZWFraW5nKSB7XHJcbiAgICAgICAgICAgIHRoaXMub3BlblNjcmlwdEV2ZW50c0Zvcm0oZXZlbnREYXRhLnNvdXJjZSBhcyBQbGF5ZXIpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHRoaXMub3BlbkNvbmZpZ0Zvcm0oZXZlbnREYXRhLnNvdXJjZSBhcyBQbGF5ZXIpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIE9wZW5zIHRoZSBjb25maWd1cmF0aW9uIGZvcm0gZm9yIHRoZSBwbGF5ZXIuXHJcbiAgICAgKiBAcGFyYW0gcGxheWVyIFRoZSBwbGF5ZXIgd2hvIHVzZWQgdGhlIGl0ZW0uXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgb3BlbkNvbmZpZ0Zvcm0ocGxheWVyOiBQbGF5ZXIpIHtcclxuICAgICAgICBjb25zdCBpbml0aWFsVmFsdWVzID0gdGhpcy5nZXRDb25maWd1cmFibGVzTGlzdChwbGF5ZXIpO1xyXG4gICAgICAgIHRoaXMuaW5pdEZvcm0ocGxheWVyKTtcclxuICAgICAgICB0aGlzLmZvcm0uc2hvdyhwbGF5ZXIpLnRoZW4oKGRhdGEpID0+IHtcclxuICAgICAgICAgICAgdGhpcy5vbkZvcm1TdWJtaXQoZGF0YSwgcGxheWVyKTtcclxuXHJcbiAgICAgICAgICAgIC8vIGNvbXBhcmUgbmV3IHZhbHVlcyB3aXRoIG9sZCB2YWx1ZXMgYW5kIG91dHB1dCB0aGUgZGlmZmVyZW5jZVxyXG4gICAgICAgICAgICBjb25zdCBuZXdWYWx1ZXMgPSB0aGlzLmdldENvbmZpZ3VyYWJsZXNMaXN0KHBsYXllcik7XHJcbiAgICAgICAgICAgIGxldCBvdXRwdXQgPSBcIlwiO1xyXG4gICAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGluaXRpYWxWYWx1ZXMubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICAgICAgICAgIGlmIChpbml0aWFsVmFsdWVzW2ldWzFdICE9PSBuZXdWYWx1ZXNbaV1bMV0pIHtcclxuICAgICAgICAgICAgICAgICAgICBvdXRwdXQgKz0gYFxcbsKnYiR7aW5pdGlhbFZhbHVlc1tpXVswXX3Cp3I6IMKnYyR7aW5pdGlhbFZhbHVlc1tpXVsxXX3Cp3IgLT4gwqdhJHtuZXdWYWx1ZXNbaV1bMV19wqdyYDtcclxuICAgICAgICAgICAgICAgICAgICBDdXN0b21FdmVudHMuZW1pdChcIkNvbmZpZ0RhdGFDaGFuZ2VkXCIsIG5ld1ZhbHVlc1tpXVswXSwgdGhpcy5nZXQobmV3VmFsdWVzW2ldWzBdIGFzIGtleW9mIENvbmZpZ1JlZ2lzdHJ5VHlwZU1hcCkpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGlmIChvdXRwdXQubGVuZ3RoID4gMCkge1xyXG4gICAgICAgICAgICAgICAgQnJvYWRjYXN0VXRpbC5kZWJ1ZyhgwqdsQ29uZmlndXJhYmxlcyBjaGFuZ2VkOsKnciR7b3V0cHV0fWApO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBPcGVucyB0aGUgc2NyaXB0IGV2ZW50cyBmb3JtIGZvciB0aGUgcGxheWVyLlxyXG4gICAgICogQHBhcmFtIHBsYXllciBUaGUgcGxheWVyIHdobyB1c2VkIHRoZSBpdGVtLlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIG9wZW5TY3JpcHRFdmVudHNGb3JtKHBsYXllcjogUGxheWVyKSB7XHJcbiAgICAgICAgY29uc3QgZm9ybSA9IG5ldyBBY3Rpb25Gb3JtRGF0YSgpLnRpdGxlKFwiU2NyaXB0IEV2ZW50c1wiKTtcclxuICAgICAgICBmb3IgKGNvbnN0IHNjcmlwdEV2ZW50S2V5IGluIFNjcmlwdEV2ZW50UmVnaXN0cnkpIHtcclxuICAgICAgICAgICAgZm9ybS5idXR0b24oc2NyaXB0RXZlbnRLZXkpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBmb3JtLnNob3cocGxheWVyKS50aGVuKChkYXRhKSA9PiB7XHJcbiAgICAgICAgICAgIGlmICh0eXBlb2YgZGF0YS5zZWxlY3Rpb24gIT09IFwibnVtYmVyXCIpIHJldHVybjtcclxuICAgICAgICAgICAgY29uc3QgW2tleSwgaGFuZGxlcl0gPSBPYmplY3QuZW50cmllcyhTY3JpcHRFdmVudFJlZ2lzdHJ5KVtkYXRhLnNlbGVjdGlvbl07XHJcbiAgICAgICAgICAgIGhhbmRsZXIoeyBpZDoga2V5LCBzb3VyY2VFbnRpdHk6IHBsYXllciwgc291cmNlVHlwZTogU2NyaXB0RXZlbnRTb3VyY2UuRW50aXR5LCBtZXNzYWdlOiBcIlwiIH0pO1xyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgc3RhdGljIGdldENvbmZpZ3VyYWJsZXNMaXN0KHBsYXllcjogUGxheWVyKSB7XHJcbiAgICAgICAgY29uc3QgbGlzdDogW3N0cmluZywgc3RyaW5nIHwgbnVtYmVyIHwgYm9vbGVhbl1bXSA9IFtdO1xyXG4gICAgICAgIGZvciAoY29uc3QgZW50cnkgb2YgdGhpcy5jb25maWdEYXRhKSB7XHJcbiAgICAgICAgICAgIC8vIFNraXAgVUktb25seSBlbGVtZW50cyB0aGF0IGRvbid0IGhhdmUgdmFsdWVzXHJcbiAgICAgICAgICAgIGlmIChlbnRyeS50eXBlID09PSBcImRpdmlkZXJcIiB8fCBlbnRyeS50eXBlID09PSBcImxhYmVsXCIgfHwgZW50cnkudHlwZSA9PT0gXCJoZWFkZXJcIikge1xyXG4gICAgICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIGxldCB2YWx1ZSA9IGVudHJ5LmdldERlZmF1bHRWYWx1ZShwbGF5ZXIpO1xyXG4gICAgICAgICAgICBpZiAoZW50cnkudHlwZSA9PT0gXCJkcm9wZG93blwiKSB7XHJcbiAgICAgICAgICAgICAgICB2YWx1ZSA9IGVudHJ5Lm9wdGlvbnNbdmFsdWUgYXMgbnVtYmVyXTtcclxuICAgICAgICAgICAgfSBlbHNlIGlmIChlbnRyeS50eXBlID09PSBcInRvZ2dsZVwiKSB7XHJcbiAgICAgICAgICAgICAgICB2YWx1ZSA9IHZhbHVlID8gXCJPTlwiIDogXCJPRkZcIjtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBsaXN0LnB1c2goW2VudHJ5LmxhYmVsLCB2YWx1ZV0pO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gbGlzdDtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHN0YXRpYyBvbkZvcm1TdWJtaXQoZGF0YTogTW9kYWxGb3JtUmVzcG9uc2UsIHBsYXllcjogUGxheWVyKSB7XHJcbiAgICAgICAgaWYgKCFkYXRhLmZvcm1WYWx1ZXMpIHJldHVybjtcclxuXHJcbiAgICAgICAgbGV0IGZvcm1WYWx1ZUluZGV4ID0gMDtcclxuICAgICAgICBmb3IgKGNvbnN0IGVudHJ5IG9mIHRoaXMuY29uZmlnRGF0YSkge1xyXG4gICAgICAgICAgICAvLyBVSS1vbmx5IGVsZW1lbnRzIGRvbid0IGhhdmUgaGFuZGxlcnMgYnV0IGhhdmUgZm9ybSB2YWx1ZXNcclxuICAgICAgICAgICAgaWYgKGVudHJ5LnR5cGUgPT09IFwiZGl2aWRlclwiIHx8IGVudHJ5LnR5cGUgPT09IFwiaGVhZGVyXCIpIHtcclxuICAgICAgICAgICAgICAgIGZvcm1WYWx1ZUluZGV4Kys7XHJcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgLy8gQ2FsbCBoYW5kbGVyIGZvciBhY3R1YWwgY29uZmlnIGVudHJpZXNcclxuICAgICAgICAgICAgaWYgKGVudHJ5LmhhbmRsZXIgJiYgZm9ybVZhbHVlSW5kZXggPCBkYXRhLmZvcm1WYWx1ZXMubGVuZ3RoKSB7XHJcbiAgICAgICAgICAgICAgICBlbnRyeS5oYW5kbGVyKGRhdGEuZm9ybVZhbHVlc1tmb3JtVmFsdWVJbmRleF0gYXMgbmV2ZXIsIHBsYXllcik7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgZm9ybVZhbHVlSW5kZXgrKztcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBzdGF0aWMgc2FmZUtleShrZXk6IHN0cmluZykge1xyXG4gICAgICAgIHJldHVybiBrZXkucmVwbGFjZSgvW15hLXpBLVowLTldL2csIFwiXCIpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogR2V0cyBhIGNvbmZpZyB2YWx1ZSBieSBrZXkuXHJcbiAgICAgKiBAcGFyYW0ga2V5IFRoZSBjb25maWcga2V5LlxyXG4gICAgICogQHJldHVybnMgVGhlIGNvbmZpZyB2YWx1ZS5cclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBnZXQ8SyBleHRlbmRzIGtleW9mIENvbmZpZ1JlZ2lzdHJ5VHlwZU1hcD4oa2V5OiBLKSB7XHJcbiAgICAgICAgcmV0dXJuIENvbmZpZ0ZhY3RvcnkuZ2V0Q29uZmlnVmFsdWUoa2V5KSBhcyBDb25maWdSZWdpc3RyeVR5cGVNYXBbS107XHJcbiAgICB9XHJcbn1cclxuXHJcbmRlY2xhcmUgZ2xvYmFsIHtcclxuICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby12YXJcclxuICAgIHZhciBDb25maWc6IE9taXQ8dHlwZW9mIF9Db25maWcsIFwicHJvdG90eXBlXCI+O1xyXG59XHJcbmdsb2JhbFRoaXMuQ29uZmlnID0gX0NvbmZpZztcclxuIl0sIm5hbWVzIjpbIlNjcmlwdEV2ZW50U291cmNlIiwiQWN0aW9uRm9ybURhdGEiLCJNb2RhbEZvcm1EYXRhIiwiU2NyaXB0RXZlbnRSZWdpc3RyeSIsIkNvbmZpZ1JlZ2lzdHJ5IiwiX0NvbmZpZyIsImluaXQiLCJjb25maWdEYXRhIiwiRXZlbnRTdWJzY3JpYmVyIiwic3Vic2NyaWJlIiwiZSIsIm9uSXRlbVVzZSIsImluaXRGb3JtIiwicGxheWVyIiwiZm9ybSIsInRpdGxlIiwiZW50cnkiLCJ0eXBlIiwiZHJvcGRvd24iLCJsYWJlbCIsIm9wdGlvbnMiLCJkZWZhdWx0VmFsdWVJbmRleCIsImdldERlZmF1bHRWYWx1ZSIsInRvb2x0aXAiLCJzbGlkZXIiLCJtaW5pbXVtVmFsdWUiLCJtYXhpbXVtVmFsdWUiLCJkZWZhdWx0VmFsdWUiLCJ2YWx1ZVN0ZXAiLCJ0ZXh0RmllbGQiLCJwbGFjZWhvbGRlclRleHQiLCJ0b2dnbGUiLCJkaXZpZGVyIiwiaGVhZGVyIiwiZXZlbnREYXRhIiwiaXRlbVN0YWNrIiwidHlwZUlkIiwiY29uZmlnSXRlbVR5cGVJZCIsInNvdXJjZSIsImlzU25lYWtpbmciLCJvcGVuU2NyaXB0RXZlbnRzRm9ybSIsIm9wZW5Db25maWdGb3JtIiwiaW5pdGlhbFZhbHVlcyIsImdldENvbmZpZ3VyYWJsZXNMaXN0Iiwic2hvdyIsInRoZW4iLCJkYXRhIiwib25Gb3JtU3VibWl0IiwibmV3VmFsdWVzIiwib3V0cHV0IiwiaSIsImxlbmd0aCIsIkN1c3RvbUV2ZW50cyIsImVtaXQiLCJnZXQiLCJCcm9hZGNhc3RVdGlsIiwiZGVidWciLCJzY3JpcHRFdmVudEtleSIsImJ1dHRvbiIsInNlbGVjdGlvbiIsImtleSIsImhhbmRsZXIiLCJPYmplY3QiLCJlbnRyaWVzIiwiaWQiLCJzb3VyY2VFbnRpdHkiLCJzb3VyY2VUeXBlIiwiRW50aXR5IiwibWVzc2FnZSIsImxpc3QiLCJ2YWx1ZSIsInB1c2giLCJmb3JtVmFsdWVzIiwiZm9ybVZhbHVlSW5kZXgiLCJzYWZlS2V5IiwicmVwbGFjZSIsIkNvbmZpZ0ZhY3RvcnkiLCJnZXRDb25maWdWYWx1ZSIsImdsb2JhbFRoaXMiLCJDb25maWciXSwibWFwcGluZ3MiOiJBQUFBLFNBQW9DQSxpQkFBaUIsUUFBUSxvQkFBb0I7QUFDakYsU0FBU0MsY0FBYyxFQUFFQyxhQUFhLFFBQTJCLHVCQUF1QjtBQUN4RixTQUFTQyxtQkFBbUIsUUFBUSwyQ0FBMkM7QUFFL0UsT0FBT0Msb0JBQStDLG1CQUFtQjtBQUV6RTs7b0ZBRW9GLEdBQ3BGLE1BQU1DO0lBTUY7O0tBRUMsR0FDRCxPQUFjQyxPQUFPO1FBQ2pCLElBQUksQ0FBQ0MsVUFBVSxHQUFHSDtRQUNsQkksZ0JBQWdCQyxTQUFTLENBQUMsb0JBQW9CLFdBQVcsQ0FBQ0MsSUFBTSxJQUFJLENBQUNDLFNBQVMsQ0FBQ0Q7SUFDbkY7SUFFQTs7Ozs7Ozs7Ozs7Ozs7S0FjQyxHQUNELE9BQWVFLFNBQVNDLE1BQWMsRUFBRTtRQUNwQyxJQUFJLENBQUNDLElBQUksR0FBRyxJQUFJWixnQkFBZ0JhLEtBQUssQ0FBQztRQUN0QyxLQUFLLE1BQU1DLFNBQVMsSUFBSSxDQUFDVCxVQUFVLENBQUU7WUFDakMsT0FBUVMsTUFBTUMsSUFBSTtnQkFDZCxLQUFLO29CQUNELElBQUksQ0FBQ0gsSUFBSSxDQUFDSSxRQUFRLENBQUNGLE1BQU1HLEtBQUssRUFBRUgsTUFBTUksT0FBTyxFQUFFO3dCQUMzQ0MsbUJBQW1CTCxNQUFNTSxlQUFlLENBQUNUO3dCQUN6Q1UsU0FBU1AsTUFBTU8sT0FBTztvQkFDMUI7b0JBQ0E7Z0JBQ0osS0FBSztvQkFDRCxJQUFJLENBQUNULElB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