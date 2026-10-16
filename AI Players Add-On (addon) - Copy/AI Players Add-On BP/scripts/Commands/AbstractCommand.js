import { CommandPermissionLevel, CustomCommandStatus, system } from "@minecraft/server";
/**
 * Abstract base class for defining custom commands.
 * @remarks
 * This class provides a template for creating commands with required metadata,
 * such as name, description, permission level, and handler function. It
 * includes optional properties for cheats requirement and command parameters.
 * Subclasses must implement all abstract members. It also allows you to define
 * enums, which will be automatically registered by the CommandManager
 * @example
 * ```typescript
 * class MyCommand extends AbstractCommand {
 *   protected name = "my_namespace:mycommand";
 *   protected description = "Does something special";
 *   protected permissionLevel = CommandPermissionLevel.Operator;
 *   public handler(origin, ...args) {  };
 *   public category = "dev";
 *   public enums = {
 *     "gm1:my_enum": ["value1", "value2", "value3"],
 *   }
 * }
 * ``` */ export class AbstractCommand {
    /**
     * Registers the command with the provided command registry.
     * @param registry - The command registry to register this command with. This wraps {@link CustomCommandRegistry}.
     */ register(registry) {
        registry.registerCommand({
            name: this.name,
            description: this.description,
            permissionLevel: this.permissionLevel,
            cheatsRequired: this.cheatsRequired,
            mandatoryParameters: this.mandatoryParameters,
            optionalParameters: this.optionalParameters
        }, this.beforeHandler.bind(this));
    }
    /**
     * @remarks
     * The function that is called before the command handler.
     */ beforeHandler(...args) {
        const isEntity = args[0].sourceEntity !== undefined;
        const isPlayer = isEntity && args[0].sourceEntity?.typeId !== "minecraft:player";
        if (this.executionLimit === "entities" && !isEntity) {
            return this.failure("This command can only be executed by entities.");
        }
        if (this.executionLimit === "players" && isPlayer) {
            return this.failure("This command can only be executed by players.");
        }
        if (this.runInEarlyExecution) return this.handler(...args) ?? this.defaultResult;
        system.run(()=>this.handler(...args));
        return this.defaultResult;
    }
    /**
     * @remarks
     * Returns a failure result.
     */ failure(message) {
        return {
            status: CustomCommandStatus.Failure,
            message
        };
    }
    /**
     * @remarks
     * Returns a success result.
     */ success(message) {
        return {
            status: CustomCommandStatus.Success,
            message
        };
    }
    constructor(){
        // Optional properties with defaults
        /**
     * @remarks
     * The permission level required to execute the command.
     */ this.permissionLevel = CommandPermissionLevel.GameDirectors;
        /**
     * @remarks
     * Cheats must be enabled to run this command.
     */ this.cheatsRequired = true;
        /**
     * @remarks
     * List of mandatory command parameters.
     */ this.mandatoryParameters = [];
        /**
     * @remarks
     * List of optional command parameters.
     */ this.optionalParameters = [];
        /**
     * @remarks
     * If true, run the handle callback immediately, rather than at the end of the tick
     */ this.runInEarlyExecution = true;
        /**
     * @remarks
     * The default result to return if no other result is specified.
     */ this.defaultResult = this.success();
        /**
     * @remarks
     * Who can execute the command. Can be "any", "entities", or "player".
     */ this.executionLimit = "any";
        /**
     * @remarks
     * Registers enums for the command with the provided command registry.
     */ this.enums = {};
    }
}

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkFic3RyYWN0Q29tbWFuZC50cyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQge1xyXG4gICAgQ29tbWFuZFBlcm1pc3Npb25MZXZlbCxcclxuICAgIEN1c3RvbUNvbW1hbmQsXHJcbiAgICBDdXN0b21Db21tYW5kT3JpZ2luLFxyXG4gICAgQ3VzdG9tQ29tbWFuZFBhcmFtZXRlcixcclxuICAgIEN1c3RvbUNvbW1hbmRSZWdpc3RyeSxcclxuICAgIEN1c3RvbUNvbW1hbmRSZXN1bHQsXHJcbiAgICBDdXN0b21Db21tYW5kU3RhdHVzLFxyXG4gICAgc3lzdGVtLFxyXG59IGZyb20gXCJAbWluZWNyYWZ0L3NlcnZlclwiO1xyXG5cclxuLyoqXHJcbiAqIFJlcHJlc2VudHMgdGhlIGNhdGVnb3J5IG9mIGEgY29tbWFuZC5cclxuICogRGV2IGNvbW1hbmRzIGFyZSBpbnRlbmRlZCBmb3IgZGV2ZWxvcG1lbnQgYW5kIGRlYnVnZ2luZyBwdXJwb3Nlcy5cclxuICogR2FtZSBjb21tYW5kcyBhcmUgaW50ZW5kZWQgZm9yIGdhbWVwbGF5LXJlbGF0ZWQgZnVuY3Rpb25hbGl0eS5cclxuICovXHJcbmV4cG9ydCB0eXBlIENvbW1hbmRDYXRlZ29yeSA9IFwiZGV2XCIgfCBcInByb2RcIjtcclxuXHJcbmV4cG9ydCB0eXBlIEVudW1zID0gUmVjb3JkPHN0cmluZywgc3RyaW5nW10+O1xyXG5leHBvcnQgdHlwZSBDb21tYW5kQ2xhc3MgPSBuZXcgKCkgPT4gQWJzdHJhY3RDb21tYW5kO1xyXG5cclxuZXhwb3J0IHR5cGUgRXhlY3V0aW9uTGltaXQgPSBcImFueVwiIHwgXCJlbnRpdGllc1wiIHwgXCJwbGF5ZXJzXCI7XHJcblxyXG4vKipcclxuICogQWJzdHJhY3QgYmFzZSBjbGFzcyBmb3IgZGVmaW5pbmcgY3VzdG9tIGNvbW1hbmRzLlxyXG4gKiBAcmVtYXJrc1xyXG4gKiBUaGlzIGNsYXNzIHByb3ZpZGVzIGEgdGVtcGxhdGUgZm9yIGNyZWF0aW5nIGNvbW1hbmRzIHdpdGggcmVxdWlyZWQgbWV0YWRhdGEsXHJcbiAqIHN1Y2ggYXMgbmFtZSwgZGVzY3JpcHRpb24sIHBlcm1pc3Npb24gbGV2ZWwsIGFuZCBoYW5kbGVyIGZ1bmN0aW9uLiBJdFxyXG4gKiBpbmNsdWRlcyBvcHRpb25hbCBwcm9wZXJ0aWVzIGZvciBjaGVhdHMgcmVxdWlyZW1lbnQgYW5kIGNvbW1hbmQgcGFyYW1ldGVycy5cclxuICogU3ViY2xhc3NlcyBtdXN0IGltcGxlbWVudCBhbGwgYWJzdHJhY3QgbWVtYmVycy4gSXQgYWxzbyBhbGxvd3MgeW91IHRvIGRlZmluZVxyXG4gKiBlbnVtcywgd2hpY2ggd2lsbCBiZSBhdXRvbWF0aWNhbGx5IHJlZ2lzdGVyZWQgYnkgdGhlIENvbW1hbmRNYW5hZ2VyXHJcbiAqIEBleGFtcGxlXHJcbiAqIGBgYHR5cGVzY3JpcHRcclxuICogY2xhc3MgTXlDb21tYW5kIGV4dGVuZHMgQWJzdHJhY3RDb21tYW5kIHtcclxuICogICBwcm90ZWN0ZWQgbmFtZSA9IFwibXlfbmFtZXNwYWNlOm15Y29tbWFuZFwiO1xyXG4gKiAgIHByb3RlY3RlZCBkZXNjcmlwdGlvbiA9IFwiRG9lcyBzb21ldGhpbmcgc3BlY2lhbFwiO1xyXG4gKiAgIHByb3RlY3RlZCBwZXJtaXNzaW9uTGV2ZWwgPSBDb21tYW5kUGVybWlzc2lvbkxldmVsLk9wZXJhdG9yO1xyXG4gKiAgIHB1YmxpYyBoYW5kbGVyKG9yaWdpbiwgLi4uYXJncykgeyAgfTtcclxuICogICBwdWJsaWMgY2F0ZWdvcnkgPSBcImRldlwiO1xyXG4gKiAgIHB1YmxpYyBlbnVtcyA9IHtcclxuICogICAgIFwiZ20xOm15X2VudW1cIjogW1widmFsdWUxXCIsIFwidmFsdWUyXCIsIFwidmFsdWUzXCJdLFxyXG4gKiAgIH1cclxuICogfVxyXG4gKiBgYGAgKi9cclxuZXhwb3J0IGFic3RyYWN0IGNsYXNzIEFic3RyYWN0Q29tbWFuZCB7XHJcbiAgICAvKipcclxuICAgICAqIEByZW1hcmtzXHJcbiAgICAgKiBUaGUgbmFtZSBvZiB0aGUgY29tbWFuZC4gQSBuYW1lc3BhY2UgaXMgcmVxdWlyZWQuXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBhYnN0cmFjdCByZWFkb25seSBuYW1lOiBDdXN0b21Db21tYW5kW1wibmFtZVwiXTtcclxuICAgIC8qKlxyXG4gICAgICogQHJlbWFya3NcclxuICAgICAqIENvbW1hbmQgZGVzY3JpcHRpb24gYXMgc2VlbiBvbiB0aGUgY29tbWFuZCBsaW5lLlxyXG4gICAgICovXHJcbiAgICBwcm90ZWN0ZWQgYWJzdHJhY3QgcmVhZG9ubHkgZGVzY3JpcHRpb246IEN1c3RvbUNvbW1hbmRbXCJkZXNjcmlwdGlvblwiXTtcclxuICAgIC8qKlxyXG4gICAgICogQHJlbWFya3NcclxuICAgICAqIFRoZSBjYXRlZ29yeSBvZiB0aGUgY29tbWFuZCwgdXNlZCBmb3IgZ3JvdXBpbmcgY29tbWFuZHMgaW4gdGhlIGNvbW1hbmQgbGlzdC5cclxuICAgICAqL1xyXG4gICAgcHVibGljIGFic3RyYWN0IHJlYWRvbmx5IGNhdGVnb3J5OiBDb21tYW5kQ2F0ZWdvcnk7XHJcbiAgICAvKipcclxuICAgICAqIEByZW1hcmtzXHJcbiAgICAgKiBUaGUgY2FsbGJhY2sgZnVuY3Rpb24gdGhhdCB3aWxsIGJlIGNhbGxlZCB3aGVuIHRoZSBjb21tYW5kIGlzIGV4ZWN1dGVkLlxyXG4gICAgICovXHJcbiAgICBwcm90ZWN0ZWQgYWJzdHJhY3QgaGFuZGxlcihvcmlnaW46IEN1c3RvbUNvbW1hbmRPcmlnaW4sIC4uLmFyZ3M6IHVua25vd25bXSk6IEN1c3RvbUNvbW1hbmRSZXN1bHQgfCB1bmRlZmluZWQgfCB2b2lkO1xyXG5cclxuICAgIC8vIE9wdGlvbmFsIHByb3BlcnRpZXMgd2l0aCBkZWZhdWx0c1xyXG4gICAgLyoqXHJcbiAgICAgKiBAcmVtYXJrc1xyXG4gICAgICogVGhlIHBlcm1pc3Npb24gbGV2ZWwgcmVxdWlyZWQgdG8gZXhlY3V0ZSB0aGUgY29tbWFuZC5cclxuICAgICAqL1xyXG4gICAgcHJvdGVjdGVkIHJlYWRvbmx5IHBlcm1pc3Npb25MZXZlbDogQ29tbWFuZFBlcm1pc3Npb25MZXZlbCA9IENvbW1hbmRQZXJtaXNzaW9uTGV2ZWwuR2FtZURpcmVjdG9ycztcclxuICAgIC8qKlxyXG4gICAgICogQHJlbWFya3NcclxuICAgICAqIENoZWF0cyBtdXN0IGJlIGVuYWJsZWQgdG8gcnVuIHRoaXMgY29tbWFuZC5cclxuICAgICAqL1xyXG4gICAgcHJvdGVjdGVkIHJlYWRvbmx5IGNoZWF0c1JlcXVpcmVkPzogYm9vbGVhbiA9IHRydWU7XHJcbiAgICAvKipcclxuICAgICAqIEByZW1hcmtzXHJcbiAgICAgKiBMaXN0IG9mIG1hbmRhdG9yeSBjb21tYW5kIHBhcmFtZXRlcnMuXHJcbiAgICAgKi9cclxuICAgIHByb3RlY3RlZCByZWFkb25seSBtYW5kYXRvcnlQYXJhbWV0ZXJzOiBDdXN0b21Db21tYW5kUGFyYW1ldGVyW10gPSBbXTtcclxuICAgIC8qKlxyXG4gICAgICogQHJlbWFya3NcclxuICAgICAqIExpc3Qgb2Ygb3B0aW9uYWwgY29tbWFuZCBwYXJhbWV0ZXJzLlxyXG4gICAgICovXHJcbiAgICBwcm90ZWN0ZWQgcmVhZG9ubHkgb3B0aW9uYWxQYXJhbWV0ZXJzOiBDdXN0b21Db21tYW5kUGFyYW1ldGVyW10gPSBbXTtcclxuICAgIC8qKlxyXG4gICAgICogQHJlbWFya3NcclxuICAgICAqIElmIHRydWUsIHJ1biB0aGUgaGFuZGxlIGNhbGxiYWNrIGltbWVkaWF0ZWx5LCByYXRoZXIgdGhhbiBhdCB0aGUgZW5kIG9mIHRoZSB0aWNrXHJcbiAgICAgKi9cclxuICAgIHByb3RlY3RlZCByZWFkb25seSBydW5JbkVhcmx5RXhlY3V0aW9uOiBib29sZWFuID0gdHJ1ZTtcclxuICAgIC8qKlxyXG4gICAgICogQHJlbWFya3NcclxuICAgICAqIFRoZSBkZWZhdWx0IHJlc3VsdCB0byByZXR1cm4gaWYgbm8gb3RoZXIgcmVzdWx0IGlzIHNwZWNpZmllZC5cclxuICAgICAqL1xyXG4gICAgcHJvdGVjdGVkIHJlYWRvbmx5IGRlZmF1bHRSZXN1bHQ6IEN1c3RvbUNvbW1hbmRSZXN1bHQgPSB0aGlzLnN1Y2Nlc3MoKTtcclxuICAgIC8qKlxyXG4gICAgICogQHJlbWFya3NcclxuICAgICAqIFdobyBjYW4gZXhlY3V0ZSB0aGUgY29tbWFuZC4gQ2FuIGJlIFwiYW55XCIsIFwiZW50aXRpZXNcIiwgb3IgXCJwbGF5ZXJcIi5cclxuICAgICAqL1xyXG4gICAgcHJvdGVjdGVkIHJlYWRvbmx5IGV4ZWN1dGlvbkxpbWl0OiBFeGVjdXRpb25MaW1pdCA9IFwiYW55XCI7XHJcbiAgICAvKipcclxuICAgICAqIEByZW1hcmtzXHJcbiAgICAgKiBSZWdpc3RlcnMgZW51bXMgZm9yIHRoZSBjb21tYW5kIHdpdGggdGhlIHByb3ZpZGVkIGNvbW1hbmQgcmVnaXN0cnkuXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyByZWFkb25seSBlbnVtczogRW51bXMgPSB7fTtcclxuXHJcbiAgICAvKipcclxuICAgICAqIFJlZ2lzdGVycyB0aGUgY29tbWFuZCB3aXRoIHRoZSBwcm92aWRlZCBjb21tYW5kIHJlZ2lzdHJ5LlxyXG4gICAgICogQHBhcmFtIHJlZ2lzdHJ5IC0gVGhlIGNvbW1hbmQgcmVnaXN0cnkgdG8gcmVnaXN0ZXIgdGhpcyBjb21tYW5kIHdpdGguIFRoaXMgd3JhcHMge0BsaW5rIEN1c3RvbUNvbW1hbmRSZWdpc3RyeX0uXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyByZWdpc3RlcihyZWdpc3RyeTogQ3VzdG9tQ29tbWFuZFJlZ2lzdHJ5KSB7XHJcbiAgICAgICAgcmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKFxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICBuYW1lOiB0aGlzLm5hbWUsXHJcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogdGhpcy5kZXNjcmlwdGlvbixcclxuICAgICAgICAgICAgICAgIHBlcm1pc3Npb25MZXZlbDogdGhpcy5wZXJtaXNzaW9uTGV2ZWwsXHJcbiAgICAgICAgICAgICAgICBjaGVhdHNSZXF1aXJlZDogdGhpcy5jaGVhdHNSZXF1aXJlZCxcclxuICAgICAgICAgICAgICAgIG1hbmRhdG9yeVBhcmFtZXRlcnM6IHRoaXMubWFuZGF0b3J5UGFyYW1ldGVycyxcclxuICAgICAgICAgICAgICAgIG9wdGlvbmFsUGFyYW1ldGVyczogdGhpcy5vcHRpb25hbFBhcmFtZXRlcnMsXHJcbiAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgIHRoaXMuYmVmb3JlSGFuZGxlci5iaW5kKHRoaXMpXHJcbiAgICAgICAgKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEByZW1hcmtzXHJcbiAgICAgKiBUaGUgZnVuY3Rpb24gdGhhdCBpcyBjYWxsZWQgYmVmb3JlIHRoZSBjb21tYW5kIGhhbmRsZXIuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgYmVmb3JlSGFuZGxlciguLi5hcmdzOiBQYXJhbWV0ZXJzPHR5cGVvZiB0aGlzLmhhbmRsZXI+KSB7XHJcbiAgICAgICAgY29uc3QgaXNFbnRpdHkgPSBhcmdzWzBdLnNvdXJjZUVudGl0eSAhPT0gdW5kZWZpbmVkO1xyXG4gICAgICAgIGNvbnN0IGlzUGxheWVyID0gaXNFbnRpdHkgJiYgYXJnc1swXS5zb3VyY2VFbnRpdHk/LnR5cGVJZCAhPT0gXCJtaW5lY3JhZnQ6cGxheWVyXCI7XHJcbiAgICAgICAgaWYgKHRoaXMuZXhlY3V0aW9uTGltaXQgPT09IFwiZW50aXRpZXNcIiAmJiAhaXNFbnRpdHkpIHtcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuZmFpbHVyZShcIlRoaXMgY29tbWFuZCBjYW4gb25seSBiZSBleGVjdXRlZCBieSBlbnRpdGllcy5cIik7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBpZiAodGhpcy5leGVjdXRpb25MaW1pdCA9PT0gXCJwbGF5ZXJzXCIgJiYgaXNQbGF5ZXIpIHtcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuZmFpbHVyZShcIlRoaXMgY29tbWFuZCBjYW4gb25seSBiZSBleGVjdXRlZCBieSBwbGF5ZXJzLlwiKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmICh0aGlzLnJ1bkluRWFybHlFeGVjdXRpb24pIHJldHVybiB0aGlzLmhhbmRsZXIoLi4uYXJncykgPz8gdGhpcy5kZWZhdWx0UmVzdWx0O1xyXG5cclxuICAgICAgICBzeXN0ZW0ucnVuKCgpID0+IHRoaXMuaGFuZGxlciguLi5hcmdzKSk7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuZGVmYXVsdFJlc3VsdDtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEByZW1hcmtzXHJcbiAgICAgKiBSZXR1cm5zIGEgZmFpbHVyZSByZXN1bHQuXHJcbiAgICAgKi9cclxuICAgIHByb3RlY3RlZCBmYWlsdXJlKG1lc3NhZ2U/OiBzdHJpbmcpIHtcclxuICAgICAgICByZXR1cm4geyBzdGF0dXM6IEN1c3RvbUNvbW1hbmRTdGF0dXMuRmFpbHVyZSwgbWVzc2FnZSB9O1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQHJlbWFya3NcclxuICAgICAqIFJldHVybnMgYSBzdWNjZXNzIHJlc3VsdC5cclxuICAgICAqL1xyXG4gICAgcHJvdGVjdGVkIHN1Y2Nlc3MobWVzc2FnZT86IHN0cmluZykge1xyXG4gICAgICAgIHJldHVybiB7IHN0YXR1czogQ3VzdG9tQ29tbWFuZFN0YXR1cy5TdWNjZXNzLCBtZXNzYWdlIH07XHJcbiAgICB9XHJcbn1cclxuIl0sIm5hbWVzIjpbIkNvbW1hbmRQZXJtaXNzaW9uTGV2ZWwiLCJDdXN0b21Db21tYW5kU3RhdHVzIiwic3lzdGVtIiwiQWJzdHJhY3RDb21tYW5kIiwicmVnaXN0ZXIiLCJyZWdpc3RyeSIsInJlZ2lzdGVyQ29tbWFuZCIsIm5hbWUiLCJkZXNjcmlwdGlvbiIsInBlcm1pc3Npb25MZXZlbCIsImNoZWF0c1JlcXVpcmVkIiwibWFuZGF0b3J5UGFyYW1ldGVycyIsIm9wdGlvbmFsUGFyYW1ldGVycyIsImJlZm9yZUhhbmRsZXIiLCJiaW5kIiwiYXJncyIsImlzRW50aXR5Iiwic291cmNlRW50aXR5IiwidW5kZWZpbmVkIiwiaXNQbGF5ZXIiLCJ0eXBlSWQiLCJleGVjdXRpb25MaW1pdCIsImZhaWx1cmUiLCJydW5JbkVhcmx5RXhlY3V0aW9uIiwiaGFuZGxlciIsImRlZmF1bHRSZXN1bHQiLCJydW4iLCJtZXNzYWdlIiwic3RhdHVzIiwiRmFpbHVyZSIsInN1Y2Nlc3MiLCJTdWNjZXNzIiwiR2FtZURpcmVjdG9ycyIsImVudW1zIl0sIm1hcHBpbmdzIjoiQUFBQSxTQUNJQSxzQkFBc0IsRUFNdEJDLG1CQUFtQixFQUNuQkMsTUFBTSxRQUNILG9CQUFvQjtBQWMzQjs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7T0FvQk8sR0FDUCxPQUFPLE1BQWVDO0lBZ0VsQjs7O0tBR0MsR0FDRCxBQUFPQyxTQUFTQyxRQUErQixFQUFFO1FBQzdDQSxTQUFTQyxlQUFlLENBQ3BCO1lBQ0lDLE1BQU0sSUFBSSxDQUFDQSxJQUFJO1lBQ2ZDLGFBQWEsSUFBSSxDQUFDQSxXQUFXO1lBQzdCQyxpQkFBaUIsSUFBSSxDQUFDQSxlQUFlO1lBQ3JDQyxnQkFBZ0IsSUFBSSxDQUFDQSxjQUFjO1lBQ25DQyxxQkFBcUIsSUFBSSxDQUFDQSxtQkFBbUI7WUFDN0NDLG9CQUFvQixJQUFJLENBQUNBLGtCQUFrQjtRQUMvQyxHQUNBLElBQUksQ0FBQ0MsYUFBYSxDQUFDQyxJQUFJLENBQUMsSUFBSTtJQUVwQztJQUVBOzs7S0FHQyxHQUNELEFBQVFELGNBQWMsR0FBR0UsSUFBcUMsRUFBRTtRQUM1RCxNQUFNQyxXQUFXRCxJQUFJLENBQUMsRUFBRSxDQUFDRSxZQUFZLEtBQUtDO1FBQzFDLE1BQU1DLFdBQVdILFlBQVlELElBQUksQ0FBQyxFQUFFLENBQUNFLFlBQVksRUFBRUcsV0FBVztRQUM5RCxJQUFJLElBQUksQ0FBQ0MsY0FBYyxLQUFLLGNBQWMsQ0FBQ0wsVUFBVTtZQUNqRCxPQUFPLElBQUksQ0FBQ00sT0FBTyxDQUFDO1FBQ3hCO1FBRUEsSUFBSSxJQUFJLENBQUNELGNBQWMsS0FBSyxhQUFhRixVQUFVO1lBQy9DLE9BQU8sSUFBSSxDQUFDRyxPQUFPLENBQUM7UUFDeEI7UUFFQSxJQUFJLElBQUksQ0FBQ0MsbUJBQW1CLEVBQUUsT0FBTyxJQUFJLENBQUNDLE9BQU8sSUFBSVQsU0FBUyxJQUFJLENBQUNVLGFBQWE7UUFFaEZ2QixPQUFPd0IsR0FBRyxDQUFDLElBQU0sSUFBSSxDQUFDRixPQUFPLElBQUlUO1FBQ2pDLE9BQU8sSUFBSSxDQUFDVSxhQUFhO0lBQzdCO0lBRUE7OztLQUdDLEdBQ0QsQUFBVUgsUUFBUUssT0FBZ0IsRUFBRTtRQUNoQyxPQUFPO1lBQUVDLFFBQVEzQixvQkFBb0I0QixPQUFPO1lBQUVGO1FBQVE7SUFDMUQ7SUFFQTs7O0tBR0MsR0FDRCxBQUFVRyxRQUFRSCxPQUFnQixFQUFFO1FBQ2hDLE9BQU87WUFBRUMsUUFBUTNCLG9CQUFvQjhCLE9BQU87WUFBRUo7UUFBUTtJQUMxRDs7UUEvRkEsb0NBQW9DO1FBQ3BDOzs7S0FHQyxRQUNrQmxCLGtCQUEwQ1QsdUJBQXVCZ0MsYUFBYTtRQUNqRzs7O0tBR0MsUUFDa0J0QixpQkFBMkI7UUFDOUM7OztLQUdDLFFBQ2tCQyxzQkFBZ0QsRUFBRTtRQUNyRTs7O0tBR0MsUUFDa0JDLHFCQUErQyxFQUFFO1FBQ3BFOzs7S0FHQyxRQUNrQlcsc0JBQStCO1FBQ2xEOzs7S0FHQyxRQUNrQkUsZ0JBQXFDLElBQUksQ0FBQ0ssT0FBTztRQUNwRTs7O0tBR0MsUUFDa0JULGlCQUFpQztRQUNwRDs7O0tBR0MsUUFDZVksUUFBZSxDQUFDOztBQXdEcEMifQ==