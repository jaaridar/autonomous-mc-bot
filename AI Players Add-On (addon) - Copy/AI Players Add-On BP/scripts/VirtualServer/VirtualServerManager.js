import { system, world } from "@minecraft/server";
import SpawnManager from "AIPSpawner/SpawnManager";
import ServerData from "Data/ServerData";
import GamerTagRandomizerComponent from "GamerTagRandomizer/GamerTagRandomizerComponent";
import V3 from "Helpers/Vectors/V3";
import Main from "Main";
class VirtualServerManager {
    static get serverStatus() {
        return world.getDynamicProperty(this.ServerStatusKey);
    }
    static get lastOnlineTime() {
        return world.getDynamicProperty(this.LastOnlineTimeKey) ?? null;
    }
    static get candidateProfiles() {
        return this.profiles.filter((p)=>p.status === "candidate");
    }
    static get invitedProfiles() {
        return this.profiles.filter((p)=>p.status === "invited");
    }
    static get onlineProfiles() {
        return this.profiles.filter((p)=>p.status === "online");
    }
    static get offlineProfiles() {
        return this.profiles.filter((p)=>p.status === "offline");
    }
    static get friendProfiles() {
        return this.profiles.filter((p)=>p.status !== "candidate");
    }
    static get isAnyProfileOnline() {
        return this.onlineProfiles.length > 0;
    }
    static init() {
        if (this.serverStatus === undefined) {
            world.setDynamicProperty(this.ServerStatusKey, "online");
        }
        this.sessionStartTime = Date.now();
        this.profiles = this.loadFriendProfiles();
        this.onlineProfilesAtSessionStart = [
            ...this.onlineProfiles
        ];
        for (const profile of this.profiles)this.ensureValidProfile(profile);
        this.queueInvitedProfilesToJoin();
        this.generateCandidateProfiles();
        CustomEvents.subscribe("EntityLoaded", this.onEntityLoaded.bind(this));
        EventSubscriber.subscribe("SystemBeforeEvents", "shutdown", this.onBeforeWorldShutdown.bind(this));
        system.runInterval(this.rollRandomStatusChange.bind(this), ServerData.RollRandomStatusChangeInterval);
    }
    static onBeforeWorldShutdown() {
        world.setDynamicProperty(this.LastOnlineTimeKey, Date.now());
        this.saveFriendProfiles();
    }
    static queueInvitedProfilesToJoin() {
        for (const profile of this.invitedProfiles){
            this.queueInvitedProfileToJoin(profile);
        }
    }
    static leaveIfMaxTimeSinceLastSessionHasElapsed(profile) {
        // Only evaluate this once for profiles that were already online when the world session started.
        if (!this.onlineProfilesAtSessionStart.includes(profile)) return;
        this.onlineProfilesAtSessionStart = this.onlineProfilesAtSessionStart.filter((p)=>p !== profile);
        const lastOnlineTime = this.lastOnlineTime;
        if (lastOnlineTime === null) return;
        const timeSinceLastOnline = this.sessionStartTime - lastOnlineTime;
        if (timeSinceLastOnline < ServerData.MaxTimeSinceLastSessionBeforeLeaving * 1000) return;
        this.onProfileLeave(profile, false);
    }
    static changeStatus(profile, status) {
        profile.status = status;
        profile.lastStatusChange = Main.currentTick;
    }
    static hasMetMinStatusTime(profile, minTimeTicks) {
        if (profile.lastStatusChange === undefined) return true;
        return Main.currentTick - profile.lastStatusChange >= minTimeTicks;
    }
    static rollRandomStatusChange() {
        if (this.serverStatus === "offline") return;
        // Roll for a random offline profile to join
        if (Math.random() < ServerData.JoinChancePerInterval) {
            const eligible = this.offlineProfiles.filter((p)=>this.hasMetMinStatusTime(p, ServerData.MinOfflineTimeBeforeJoining));
            const profile = MathUtil.choose(eligible);
            if (profile) return this.onProfileJoin(profile);
        }
        // Roll for a random online profile to leave
        if (Math.random() < ServerData.LeaveChancePerInterval) {
            const eligible = this.onlineProfiles.filter((p)=>this.hasMetMinStatusTime(p, ServerData.MinOnlineTimeBeforeLeaving));
            const profile = MathUtil.choose(eligible);
            if (profile) {
                const entity = this.getEntityFromProfile(profile);
                if (entity && EntityStore.get(entity, "inCoopMode")) return;
                this.onProfileLeave(profile);
            }
        }
    }
    static tryRandomLeaveOnDeath(entity) {
        const profile = this.getProfileFromEntity(entity);
        if (!profile || EntityStore.get(entity, "inCoopMode")) return false;
        if (!this.hasMetMinStatusTime(profile, ServerData.MinOnlineTimeBeforeLeaving)) return false;
        if (Math.random() >= ServerData.LeaveOnDeathChance) return false;
        system.runTimeout(()=>this.onProfileLeave(profile), ServerData.LeaveOnDeathDelay);
        return true;
    }
    static tryRandomLeaveOnUnload(entity) {
        const profile = this.getProfileFromEntity(entity);
        if (!profile || EntityStore.get(entity, "inCoopMode")) return false;
        if (!this.hasMetMinStatusTime(profile, ServerData.MinOnlineTimeBeforeLeaving)) return false;
        if (Math.random() >= ServerData.LeaveOnUnloadChance) return false;
        this.onProfileLeave(profile);
        return true;
    }
    static onEntityLoaded(entity) {
        if (entity.typeId !== "gm1_sky:aip") return;
        if (entity.gameTestData) return;
        const profile = this.ensureOnlineProfileForEntity(entity);
        this.leaveIfMaxTimeSinceLastSessionHasElapsed(profile);
    }
    static anyProfileHasTag(tag) {
        return this.profiles.some((p)=>p.gamerTag === tag);
    }
    static isAtWarningLimit() {
        const memoryTier = system.serverSystemInfo.memoryTier;
        const platformType = WorldStore.get("ServerPlatformType");
        const memoryLimit = ServerData.MemoryTierFriendWarningLimit[memoryTier];
        const platformLimit = platformType ? ServerData.PlatformTypeFriendWarningLimit[platformType] : Infinity;
        const minLimit = Math.min(memoryLimit, platformLimit);
        return this.friendProfiles.length >= minLimit;
    }
    // #region Candidates
    static generateCandidateProfiles() {
        while(this.needsCandidate())this.profiles.push(this.generateCandidateProfile());
    }
    static generateCandidateProfile() {
        const tag = GamerTagRandomizerComponent.pickUniqueTag();
        const icon = this.chooseLeastUsedIcon();
        return {
            gamerTag: tag,
            icon,
            status: "candidate"
        };
    }
    static needsCandidate() {
        // Don't need candidate if we already have max number of candidates
        if (this.candidateProfiles.length >= ServerData.MaximumCandidateProfileCount) return false;
        // Don't need candidate if we already have max number of profiles that could be friends
        if (this.profiles.length >= ServerData.MaximumFriendCount) return false;
        // Otherwise, we need a candidate
        return true;
    }
    static rerollCandidateProfiles() {
        this.profiles = this.profiles.filter((p)=>p.status !== "candidate");
        this.generateCandidateProfiles();
    }
    static chooseLeastUsedIcon() {
        const counts = {};
        for (const profile of this.profiles){
            counts[profile.icon] = (counts[profile.icon] || 0) + 1;
        }
        let leastUsedIcon = null;
        let leastUsedCount = Infinity;
        for (const icon of Object.keys(ServerData.ProfileIcons)){
            const count = counts[icon] || 0;
            if (count >= leastUsedCount) continue;
            leastUsedCount = count;
            leastUsedIcon = icon;
        }
        return leastUsedIcon;
    }
    // #endregion
    // #region Friends
    static saveFriendProfiles() {
        world.setDynamicProperty(this.FriendsKey, JSON.stringify(this.friendProfiles));
    }
    static loadFriendProfiles() {
        const data = world.getDynamicProperty(this.FriendsKey);
        if (!data) return [];
        const profiles = JSON.parse(data);
        return profiles;
    }
    // #endregion
    // #region Events
    static onProfileJoin(profile) {
        if (profile.status === "online") return;
        this.cancelInvitationRunner(profile);
        this.changeStatus(profile, "online");
        BroadcastUtil.translate("multiplayer.player.joined", [
            profile.gamerTag
        ], undefined, ServerData.MultiplayerFeedbackFormatting);
        const serializedAIP = SpawnManager.getSerializedAIP(profile.gamerTag);
        SpawnManager.queueSpawn(serializedAIP);
    }
    static onProfileLeave(profile, shouldBroadcastMessage = true) {
        if (profile.status !== "online") return;
        const entity = this.getEntityFromProfile(profile);
        if (entity) SpawnManager.despawn(entity);
        SpawnManager.leave(profile.gamerTag);
        this.changeStatus(profile, "offline");
        if (shouldBroadcastMessage) {
            BroadcastUtil.translate("multiplayer.player.left", [
                profile.gamerTag
            ], undefined, ServerData.MultiplayerFeedbackFormatting);
        }
    }
    // #endregion
    // #region Invitations
    static inviteCandidateProfile(profile, admin) {
        this.inviteProfile(profile, admin);
        // Replace with new candidate profile to ensure a constant number of candidates
        if (this.needsCandidate()) this.profiles.push(this.generateCandidateProfile());
    }
    static inviteProfile(profile, admin) {
        if (profile.status === "invited" || profile.status === "online") return;
        //Inviting a player automatically sets the server to online
        if (this.serverStatus === "offline") this.setServerOnline();
        this.changeStatus(profile, "invited");
        BroadcastUtil.translate("gm1_sky.admin_tool.common.invitation", [
            profile.gamerTag
        ], [
            admin
        ], ServerData.AdminFeedbackFormatting);
        this.queueInvitedProfileToJoin(profile);
    }
    static queueInvitedProfileToJoin(profile) {
        const delay = MathUtil.randomInt(ServerData.MinDurationBeforeJoining, ServerData.MaxDurationBeforeJoining);
        const run = system.runTimeout(this.onProfileJoin.bind(this, profile), delay);
        this.invitationRuns[profile.gamerTag] = run;
    }
    static cancelProfileInvitation(profile, admin) {
        const adminArg = admin ? [
            admin
        ] : undefined;
        BroadcastUtil.translate("gm1_sky.admin_tool.common.cancel_invitation", [
            profile.gamerTag
        ], adminArg, ServerData.AdminFeedbackFormatting);
        this.cancelInvitationRunner(profile);
        this.changeStatus(profile, "offline");
    }
    static cancelInvitationRunner(profile) {
        const run = this.invitationRuns[profile.gamerTag];
        if (run === undefined) return;
        system.clearRun(run);
        delete this.invitationRuns[profile.gamerTag];
    }
    // #endregion
    // #region Admin Actions
    static kickProfile(profile, admin) {
        BroadcastUtil.translate("commands.kick.success", [
            profile.gamerTag
        ], [
            admin
        ], ServerData.AdminFeedbackFormatting);
        this.onProfileLeave(profile);
    }
    static banProfile(profile, admin) {
        BroadcastUtil.translate("commands.ban.success", [
            profile.gamerTag
        ], [
            admin
        ], ServerData.AdminFeedbackFormatting);
        if (profile.status === "online") this.onProfileLeave(profile);
        if (profile.status === "invited") this.cancelInvitationRunner(profile);
        SpawnManager.deleteSerializedAIP(profile.gamerTag);
        this.profiles = this.profiles.filter((p)=>p.gamerTag !== profile.gamerTag);
        this.generateCandidateProfiles();
    }
    static teleportProfile(profile, admin) {
        const location = V3.fromEntity(admin);
        if (location.dimension?.id !== overworld.id) {
            BroadcastUtil.translate("gm1_sky.admin_tool.common.teleport.dimension_fail", [
                profile.gamerTag
            ], [
                admin
            ], ServerData.AdminFeedbackFormatting);
            return;
        }
        BroadcastUtil.translate("gm1_sky.admin_tool.common.teleport", [
            profile.gamerTag
        ], [
            admin
        ], ServerData.AdminFeedbackFormatting);
        const entity = this.getEntityFromProfile(profile);
        if (entity) {
            const bigBrainComponent = entity.getMobComponent("BigBrainComponent");
            if (!bigBrainComponent) return;
            bigBrainComponent.teleportToLocation(location);
        } else {
            SpawnManager.trySpawnAtLocation(location, profile.gamerTag);
        }
    }
    // #endregion
    // #region Server Status
    static setServerOffline() {
        for (const profile of this.onlineProfiles){
            this.onProfileLeave(profile);
        }
        for (const profile of this.invitedProfiles){
            this.cancelProfileInvitation(profile, undefined);
        }
        world.setDynamicProperty(this.ServerStatusKey, "offline");
        BroadcastUtil.translate("gm1_sky.admin_tool.common.set_server_offline", undefined, undefined, ServerData.AdminFeedbackFormatting);
    }
    static setServerOnline() {
        world.setDynamicProperty(this.ServerStatusKey, "online");
        BroadcastUtil.translate("gm1_sky.admin_tool.common.set_server_online", undefined, undefined, ServerData.AdminFeedbackFormatting);
    }
    // #region Profile-Entity Mapping
    static ensureOnlineProfileForEntity(entity) {
        const tag = EntityStore.get(entity, "gamerTag");
        let profile = this.profiles.find((p)=>p.gamerTag === tag);
        if (profile) {
            this.changeStatus(profile, "online");
            return profile;
        }
        profile = {
            gamerTag: tag,
            icon: this.chooseLeastUsedIcon(),
            status: "online",
            lastStatusChange: Main.currentTick
        };
        this.profiles.push(profile);
        return profile;
    }
    static ensureValidProfile(profile) {
        // Ensure icon still exists
        if (!ServerData.ProfileIcons[profile.icon]) {
            profile.icon = this.chooseLeastUsedIcon();
        }
    }
    static getEntityFromProfile(profile) {
        if (profile.status !== "online") return null;
        const entities = EntityUtil.getEntities({
            type: "gm1_sky:aip"
        });
        for (const entity of entities){
            const tag = EntityStore.get(entity, "gamerTag");
            if (tag === profile.gamerTag) return entity;
        }
        return null;
    }
    static getProfileFromEntity(entity) {
        const tag = EntityStore.get(entity, "gamerTag");
        const profile = this.profiles.find((p)=>p.gamerTag === tag);
        return profile;
    }
    static getProfileFromGamerTag(gamerTag) {
        const profile = this.profiles.find((p)=>p.gamerTag === gamerTag);
        return profile;
    }
}
VirtualServerManager.FriendsKey = "gm1_sky:friends_profiles";
VirtualServerManager.ServerStatusKey = "gm1_sky:server_status";
VirtualServerManager.LastOnlineTimeKey = "gm1_sky:last_online_time";
VirtualServerManager.profiles = [];
VirtualServerManager.invitationRuns = {};
VirtualServerManager.sessionStartTime = Date.now();
VirtualServerManager.onlineProfilesAtSessionStart = [];
export { VirtualServerManager as default };

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIlZpcnR1YWxTZXJ2ZXJNYW5hZ2VyLnRzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEVudGl0eSwgUGxheWVyLCBzeXN0ZW0sIHdvcmxkIH0gZnJvbSBcIkBtaW5lY3JhZnQvc2VydmVyXCI7XHJcbmltcG9ydCBTcGF3bk1hbmFnZXIgZnJvbSBcIkFJUFNwYXduZXIvU3Bhd25NYW5hZ2VyXCI7XHJcbmltcG9ydCBTZXJ2ZXJEYXRhIGZyb20gXCJEYXRhL1NlcnZlckRhdGFcIjtcclxuaW1wb3J0IEdhbWVyVGFnUmFuZG9taXplckNvbXBvbmVudCBmcm9tIFwiR2FtZXJUYWdSYW5kb21pemVyL0dhbWVyVGFnUmFuZG9taXplckNvbXBvbmVudFwiO1xyXG5pbXBvcnQgVjMgZnJvbSBcIkhlbHBlcnMvVmVjdG9ycy9WM1wiO1xyXG5pbXBvcnQgTWFpbiBmcm9tIFwiTWFpblwiO1xyXG5pbXBvcnQgeyBBSVBQcm9maWxlLCBQcm9maWxlSWNvbiwgUHJvZmlsZVN0YXR1cyB9IGZyb20gXCIuL1R5cGVzXCI7XHJcblxyXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBWaXJ0dWFsU2VydmVyTWFuYWdlciB7XHJcbiAgICBwdWJsaWMgc3RhdGljIHJlYWRvbmx5IEZyaWVuZHNLZXkgPSBcImdtMV9za3k6ZnJpZW5kc19wcm9maWxlc1wiO1xyXG4gICAgcHVibGljIHN0YXRpYyByZWFkb25seSBTZXJ2ZXJTdGF0dXNLZXkgPSBcImdtMV9za3k6c2VydmVyX3N0YXR1c1wiO1xyXG4gICAgcHVibGljIHN0YXRpYyByZWFkb25seSBMYXN0T25saW5lVGltZUtleSA9IFwiZ20xX3NreTpsYXN0X29ubGluZV90aW1lXCI7XHJcblxyXG4gICAgcHVibGljIHN0YXRpYyBwcm9maWxlczogQUlQUHJvZmlsZVtdID0gW107XHJcblxyXG4gICAgcHVibGljIHN0YXRpYyBnZXQgc2VydmVyU3RhdHVzKCkge1xyXG4gICAgICAgIHJldHVybiB3b3JsZC5nZXREeW5hbWljUHJvcGVydHkodGhpcy5TZXJ2ZXJTdGF0dXNLZXkpO1xyXG4gICAgfVxyXG5cclxuICAgIHB1YmxpYyBzdGF0aWMgZ2V0IGxhc3RPbmxpbmVUaW1lKCk6IG51bWJlciB8IG51bGwge1xyXG4gICAgICAgIHJldHVybiAod29ybGQuZ2V0RHluYW1pY1Byb3BlcnR5KHRoaXMuTGFzdE9ubGluZVRpbWVLZXkpIGFzIG51bWJlcikgPz8gbnVsbDtcclxuICAgIH1cclxuXHJcbiAgICBwdWJsaWMgc3RhdGljIGludml0YXRpb25SdW5zOiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+ID0ge307XHJcblxyXG4gICAgcHVibGljIHN0YXRpYyBnZXQgY2FuZGlkYXRlUHJvZmlsZXMoKSB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMucHJvZmlsZXMuZmlsdGVyKChwKSA9PiBwLnN0YXR1cyA9PT0gXCJjYW5kaWRhdGVcIik7XHJcbiAgICB9XHJcblxyXG4gICAgcHVibGljIHN0YXRpYyBnZXQgaW52aXRlZFByb2ZpbGVzKCkge1xyXG4gICAgICAgIHJldHVybiB0aGlzLnByb2ZpbGVzLmZpbHRlcigocCkgPT4gcC5zdGF0dXMgPT09IFwiaW52aXRlZFwiKTtcclxuICAgIH1cclxuXHJcbiAgICBwdWJsaWMgc3RhdGljIGdldCBvbmxpbmVQcm9maWxlcygpIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5wcm9maWxlcy5maWx0ZXIoKHApID0+IHAuc3RhdHVzID09PSBcIm9ubGluZVwiKTtcclxuICAgIH1cclxuXHJcbiAgICBwdWJsaWMgc3RhdGljIGdldCBvZmZsaW5lUHJvZmlsZXMoKSB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMucHJvZmlsZXMuZmlsdGVyKChwKSA9PiBwLnN0YXR1cyA9PT0gXCJvZmZsaW5lXCIpO1xyXG4gICAgfVxyXG5cclxuICAgIHB1YmxpYyBzdGF0aWMgZ2V0IGZyaWVuZFByb2ZpbGVzKCkge1xyXG4gICAgICAgIHJldHVybiB0aGlzLnByb2ZpbGVzLmZpbHRlcigocCkgPT4gcC5zdGF0dXMgIT09IFwiY2FuZGlkYXRlXCIpO1xyXG4gICAgfVxyXG5cclxuICAgIHB1YmxpYyBzdGF0aWMgZ2V0IGlzQW55UHJvZmlsZU9ubGluZSgpIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5vbmxpbmVQcm9maWxlcy5sZW5ndGggPiAwO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgc3RhdGljIHNlc3Npb25TdGFydFRpbWU6IG51bWJlciA9IERhdGUubm93KCk7XHJcbiAgICBwcml2YXRlIHN0YXRpYyBvbmxpbmVQcm9maWxlc0F0U2Vzc2lvblN0YXJ0OiBBSVBQcm9maWxlW10gPSBbXTtcclxuXHJcbiAgICBwdWJsaWMgc3RhdGljIGluaXQoKSB7XHJcbiAgICAgICAgaWYgKHRoaXMuc2VydmVyU3RhdHVzID09PSB1bmRlZmluZWQpIHtcclxuICAgICAgICAgICAgd29ybGQuc2V0RHluYW1pY1Byb3BlcnR5KHRoaXMuU2VydmVyU3RhdHVzS2V5LCBcIm9ubGluZVwiKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRoaXMuc2Vzc2lvblN0YXJ0VGltZSA9IERhdGUubm93KCk7XHJcbiAgICAgICAgdGhpcy5wcm9maWxlcyA9IHRoaXMubG9hZEZyaWVuZFByb2ZpbGVzKCk7XHJcbiAgICAgICAgdGhpcy5vbmxpbmVQcm9maWxlc0F0U2Vzc2lvblN0YXJ0ID0gWy4uLnRoaXMub25saW5lUHJvZmlsZXNdO1xyXG4gICAgICAgIGZvciAoY29uc3QgcHJvZmlsZSBvZiB0aGlzLnByb2ZpbGVzKSB0aGlzLmVuc3VyZVZhbGlkUHJvZmlsZShwcm9maWxlKTtcclxuICAgICAgICB0aGlzLnF1ZXVlSW52aXRlZFByb2ZpbGVzVG9Kb2luKCk7XHJcbiAgICAgICAgdGhpcy5nZW5lcmF0ZUNhbmRpZGF0ZVByb2ZpbGVzKCk7XHJcblxyXG4gICAgICAgIEN1c3RvbUV2ZW50cy5zdWJzY3JpYmUoXCJFbnRpdHlMb2FkZWRcIiwgdGhpcy5vbkVudGl0eUxvYWRlZC5iaW5kKHRoaXMpKTtcclxuICAgICAgICBFdmVudFN1YnNjcmliZXIuc3Vic2NyaWJlKFwiU3lzdGVtQmVmb3JlRXZlbnRzXCIsIFwic2h1dGRvd25cIiwgdGhpcy5vbkJlZm9yZVdvcmxkU2h1dGRvd24uYmluZCh0aGlzKSk7XHJcblxyXG4gICAgICAgIHN5c3RlbS5ydW5JbnRlcnZhbCh0aGlzLnJvbGxSYW5kb21TdGF0dXNDaGFuZ2UuYmluZCh0aGlzKSwgU2VydmVyRGF0YS5Sb2xsUmFuZG9tU3RhdHVzQ2hhbmdlSW50ZXJ2YWwpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgc3RhdGljIG9uQmVmb3JlV29ybGRTaHV0ZG93bigpIHtcclxuICAgICAgICB3b3JsZC5zZXREeW5hbWljUHJvcGVydHkodGhpcy5MYXN0T25saW5lVGltZUtleSwgRGF0ZS5ub3coKSk7XHJcbiAgICAgICAgdGhpcy5zYXZlRnJpZW5kUHJvZmlsZXMoKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHN0YXRpYyBxdWV1ZUludml0ZWRQcm9maWxlc1RvSm9pbigpIHtcclxuICAgICAgICBmb3IgKGNvbnN0IHByb2ZpbGUgb2YgdGhpcy5pbnZpdGVkUHJvZmlsZXMpIHtcclxuICAgICAgICAgICAgdGhpcy5xdWV1ZUludml0ZWRQcm9maWxlVG9Kb2luKHByb2ZpbGUpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHN0YXRpYyBsZWF2ZUlmTWF4VGltZVNpbmNlTGFzdFNlc3Npb25IYXNFbGFwc2VkKHByb2ZpbGU6IEFJUFByb2ZpbGUpIHtcclxuICAgICAgICAvLyBPbmx5IGV2YWx1YXRlIHRoaXMgb25jZSBmb3IgcHJvZmlsZXMgdGhhdCB3ZXJlIGFscmVhZHkgb25saW5lIHdoZW4gdGhlIHdvcmxkIHNlc3Npb24gc3RhcnRlZC5cclxuICAgICAgICBpZiAoIXRoaXMub25saW5lUHJvZmlsZXNBdFNlc3Npb25TdGFydC5pbmNsdWRlcyhwcm9maWxlKSkgcmV0dXJuO1xyXG4gICAgICAgIHRoaXMub25saW5lUHJvZmlsZXNBdFNlc3Npb25TdGFydCA9IHRoaXMub25saW5lUHJvZmlsZXNBdFNlc3Npb25TdGFydC5maWx0ZXIoKHApID0+IHAgIT09IHByb2ZpbGUpO1xyXG5cclxuICAgICAgICBjb25zdCBsYXN0T25saW5lVGltZSA9IHRoaXMubGFzdE9ubGluZVRpbWU7XHJcbiAgICAgICAgaWYgKGxhc3RPbmxpbmVUaW1lID09PSBudWxsKSByZXR1cm47XHJcblxyXG4gICAgICAgIGNvbnN0IHRpbWVTaW5jZUxhc3RPbmxpbmUgPSB0aGlzLnNlc3Npb25TdGFydFRpbWUgLSBsYXN0T25saW5lVGltZTtcclxuXHJcbiAgICAgICAgaWYgKHRpbWVTaW5jZUxhc3RPbmxpbmUgPCBTZXJ2ZXJEYXRhLk1heFRpbWVTaW5jZUxhc3RTZXNzaW9uQmVmb3JlTGVhdmluZyAqIDEwMDApIHJldHVybjtcclxuXHJcbiAgICAgICAgdGhpcy5vblByb2ZpbGVMZWF2ZShwcm9maWxlLCBmYWxzZSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBzdGF0aWMgY2hhbmdlU3RhdHVzKHByb2ZpbGU6IEFJUFByb2ZpbGUsIHN0YXR1czogUHJvZmlsZVN0YXR1cykge1xyXG4gICAgICAgIHByb2ZpbGUuc3RhdHVzID0gc3RhdHVzO1xyXG4gICAgICAgIHByb2ZpbGUubGFzdFN0YXR1c0NoYW5nZSA9IE1haW4uY3VycmVudFRpY2s7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBzdGF0aWMgaGFzTWV0TWluU3RhdHVzVGltZShwcm9maWxlOiBBSVBQcm9maWxlLCBtaW5UaW1lVGlja3M6IG51bWJlcik6IGJvb2xlYW4ge1xyXG4gICAgICAgIGlmIChwcm9maWxlLmxhc3RTdGF0dXNDaGFuZ2UgPT09IHVuZGVmaW5lZCkgcmV0dXJuIHRydWU7XHJcbiAgICAgICAgcmV0dXJuIE1haW4uY3VycmVudFRpY2sgLSBwcm9maWxlLmxhc3RTdGF0dXNDaGFuZ2UgPj0gbWluVGltZVRpY2tzO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgc3RhdGljIHJvbGxSYW5kb21TdGF0dXNDaGFuZ2UoKSB7XHJcbiAgICAgICAgaWYgKHRoaXMuc2VydmVyU3RhdHVzID09PSBcIm9mZmxpbmVcIikgcmV0dXJuO1xyXG5cclxuICAgICAgICAvLyBSb2xsIGZvciBhIHJhbmRvbSBvZmZsaW5lIHByb2ZpbGUgdG8gam9pblxyXG4gICAgICAgIGlmIChNYXRoLnJhbmRvbSgpIDwgU2VydmVyRGF0YS5Kb2luQ2hhbmNlUGVySW50ZXJ2YWwpIHtcclxuICAgICAgICAgICAgY29uc3QgZWxpZ2libGUgPSB0aGlzLm9mZmxpbmVQcm9maWxlcy5maWx0ZXIoKHApID0+IHRoaXMuaGFzTWV0TWluU3RhdHVzVGltZShwLCBTZXJ2ZXJEYXRhLk1pbk9mZmxpbmVUaW1lQmVmb3JlSm9pbmluZykpO1xyXG4gICAgICAgICAgICBjb25zdCBwcm9maWxlID0gTWF0aFV0aWwuY2hvb3NlKGVsaWdpYmxlKTtcclxuICAgICAgICAgICAgaWYgKHByb2ZpbGUpIHJldHVybiB0aGlzLm9uUHJvZmlsZUpvaW4ocHJvZmlsZSk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBSb2xsIGZvciBhIHJhbmRvbSBvbmxpbmUgcHJvZmlsZSB0byBsZWF2ZVxyXG4gICAgICAgIGlmIChNYXRoLnJhbmRvbSgpIDwgU2VydmVyRGF0YS5MZWF2ZUNoYW5jZVBlckludGVydmFsKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGVsaWdpYmxlID0gdGhpcy5vbmxpbmVQcm9maWxlcy5maWx0ZXIoKHApID0+IHRoaXMuaGFzTWV0TWluU3RhdHVzVGltZShwLCBTZXJ2ZXJEYXRhLk1pbk9ubGluZVRpbWVCZWZvcmVMZWF2aW5nKSk7XHJcbiAgICAgICAgICAgIGNvbnN0IHByb2ZpbGUgPSBNYXRoVXRpbC5jaG9vc2UoZWxpZ2libGUpO1xyXG4gICAgICAgICAgICBpZiAocHJvZmlsZSkge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgZW50aXR5ID0gdGhpcy5nZXRFbnRpdHlGcm9tUHJvZmlsZShwcm9maWxlKTtcclxuICAgICAgICAgICAgICAgIGlmIChlbnRpdHkgJiYgRW50aXR5U3RvcmUuZ2V0KGVudGl0eSwgXCJpbkNvb3BNb2RlXCIpKSByZXR1cm47XHJcbiAgICAgICAgICAgICAgICB0aGlzLm9uUHJvZmlsZUxlYXZlKHByb2ZpbGUpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHB1YmxpYyBzdGF0aWMgdHJ5UmFuZG9tTGVhdmVPbkRlYXRoKGVudGl0eTogRW50aXR5KTogYm9vbGVhbiB7XHJcbiAgICAgICAgY29uc3QgcHJvZmlsZSA9IHRoaXMuZ2V0UHJvZmlsZUZyb21FbnRpdHkoZW50aXR5KTtcclxuICAgICAgICBpZiAoIXByb2ZpbGUgfHwgRW50aXR5U3RvcmUuZ2V0KGVudGl0eSwgXCJpbkNvb3BNb2RlXCIpKSByZXR1cm4gZmFsc2U7XHJcbiAgICAgICAgaWYgKCF0aGlzLmhhc01ldE1pblN0YXR1c1RpbWUocHJvZmlsZSwgU2VydmVyRGF0YS5NaW5PbmxpbmVUaW1lQmVmb3JlTGVhdmluZykpIHJldHVybiBmYWxzZTtcclxuICAgICAgICBpZiAoTWF0aC5yYW5kb20oKSA+PSBTZXJ2ZXJEYXRhLkxlYXZlT25EZWF0aENoYW5jZSkgcmV0dXJuIGZhbHNlO1xyXG5cclxuICAgICAgICBzeXN0ZW0ucnVuVGltZW91dCgoKSA9PiB0aGlzLm9uUHJvZmlsZUxlYXZlKHByb2ZpbGUpLCBTZXJ2ZXJEYXRhLkxlYXZlT25EZWF0aERlbGF5KTtcclxuICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgIH1cclxuXHJcbiAgICBwdWJsaWMgc3RhdGljIHRyeVJhbmRvbUxlYXZlT25VbmxvYWQoZW50aXR5OiBFbnRpdHkpOiBib29sZWFuIHtcclxuICAgICAgICBjb25zdCBwcm9maWxlID0gdGhpcy5nZXRQcm9maWxlRnJvbUVudGl0eShlbnRpdHkpO1xyXG4gICAgICAgIGlmICghcHJvZmlsZSB8fCBFbnRpdHlTdG9yZS5nZXQoZW50aXR5LCBcImluQ29vcE1vZGVcIikpIHJldHVybiBmYWxzZTtcclxuICAgICAgICBpZiAoIXRoaXMuaGFzTWV0TWluU3RhdHVzVGltZShwcm9maWxlLCBTZXJ2ZXJEYXRhLk1pbk9ubGluZVRpbWVCZWZvcmVMZWF2aW5nKSkgcmV0dXJuIGZhbHNlO1xyXG4gICAgICAgIGlmIChNYXRoLnJhbmRvbSgpID49IFNlcnZlckRhdGEuTGVhdmVPblVubG9hZENoYW5jZSkgcmV0dXJuIGZhbHNlO1xyXG5cclxuICAgICAgICB0aGlzLm9uUHJvZmlsZUxlYXZlKHByb2ZpbGUpO1xyXG4gICAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgc3RhdGljIG9uRW50aXR5TG9hZGVkKGVudGl0eTogRW50aXR5KSB7XHJcbiAgICAgICAgaWYgKGVudGl0eS50eXBlSWQgIT09IFwiZ20xX3NreTphaXBcIikgcmV0dXJuO1xyXG4gICAgICAgIGlmIChlbnRpdHkuZ2FtZVRlc3REYXRhKSByZXR1cm47XHJcbiAgICAgICAgY29uc3QgcHJvZmlsZSA9IHRoaXMuZW5zdXJlT25saW5lUHJvZmlsZUZvckVudGl0eShlbnRpdHkpO1xyXG5cclxuICAgICAgICB0aGlzLmxlYXZlSWZNYXhUaW1lU2luY2VMYXN0U2Vzc2lvbkhhc0VsYXBzZWQocHJvZmlsZSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHVibGljIHN0YXRpYyBhbnlQcm9maWxlSGFzVGFnKHRhZzogc3RyaW5nKTogYm9vbGVhbiB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMucHJvZmlsZXMuc29tZSgocCkgPT4gcC5nYW1lclRhZyA9PT0gdGFnKTtcclxuICAgIH1cclxuXHJcbiAgICBwdWJsaWMgc3RhdGljIGlzQXRXYXJuaW5nTGltaXQoKTogYm9vbGVhbiB7XHJcbiAgICAgICAgY29uc3QgbWVtb3J5VGllciA9IHN5c3RlbS5zZXJ2ZXJTeXN0ZW1JbmZvLm1lbW9yeVRpZXI7XHJcbiAgICAgICAgY29uc3QgcGxhdGZvcm1UeXBlID0gV29ybGRTdG9yZS5nZXQoXCJTZXJ2ZXJQbGF0Zm9ybVR5cGVcIik7XHJcblxyXG4gICAgICAgIGNvbnN0IG1lbW9yeUxpbWl0ID0gU2VydmVyRGF0YS5NZW1vcnlUaWVyRnJpZW5kV2FybmluZ0xpbWl0W21lbW9yeVRpZXJdO1xyXG4gICAgICAgIGNvbnN0IHBsYXRmb3JtTGltaXQgPSBwbGF0Zm9ybVR5cGUgPyBTZXJ2ZXJEYXRhLlBsYXRmb3JtVHlwZUZyaWVuZFdhcm5pbmdMaW1pdFtwbGF0Zm9ybVR5cGVdIDogSW5maW5pdHk7XHJcblxyXG4gICAgICAgIGNvbnN0IG1pbkxpbWl0ID0gTWF0aC5taW4obWVtb3J5TGltaXQsIHBsYXRmb3JtTGltaXQpO1xyXG4gICAgICAgIHJldHVybiB0aGlzLmZyaWVuZFByb2ZpbGVzLmxlbmd0aCA+PSBtaW5MaW1pdDtcclxuICAgIH1cclxuXHJcbiAgICAvLyAjcmVnaW9uIENhbmRpZGF0ZXNcclxuICAgIHB1YmxpYyBzdGF0aWMgZ2VuZXJhdGVDYW5kaWRhdGVQcm9maWxlcygpOiB2b2lkIHtcclxuICAgICAgICB3aGlsZSAodGhpcy5uZWVkc0NhbmRpZGF0ZSgpKSB0aGlzLnByb2ZpbGVzLnB1c2godGhpcy5nZW5lcmF0ZUNhbmRpZGF0ZVByb2ZpbGUoKSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHVibGljIHN0YXRpYyBnZW5lcmF0ZUNhbmRpZGF0ZVByb2ZpbGUoKTogQUlQUHJvZmlsZSB7XHJcbiAgICAgICAgY29uc3QgdGFnID0gR2FtZXJUYWdSYW5kb21pemVyQ29tcG9uZW50LnBpY2tVbmlxdWVUYWcoKTtcclxuICAgICAgICBjb25zdCBpY29uID0gdGhpcy5jaG9vc2VMZWFzdFVzZWRJY29uKCk7XHJcbiAgICAgICAgcmV0dXJuIHsgZ2FtZXJUYWc6IHRhZywgaWNvbiwgc3RhdHVzOiBcImNhbmRpZGF0ZVwiIH07XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBzdGF0aWMgbmVlZHNDYW5kaWRhdGUoKTogYm9vbGVhbiB7XHJcbiAgICAgICAgLy8gRG9uJ3QgbmVlZCBjYW5kaWRhdGUgaWYgd2UgYWxyZWFkeSBoYXZlIG1heCBudW1iZXIgb2YgY2FuZGlkYXRlc1xyXG4gICAgICAgIGlmICh0aGlzLmNhbmRpZGF0ZVByb2ZpbGVzLmxlbmd0aCA+PSBTZXJ2ZXJEYXRhLk1heGltdW1DYW5kaWRhdGVQcm9maWxlQ291bnQpIHJldHVybiBmYWxzZTtcclxuICAgICAgICAvLyBEb24ndCBuZWVkIGNhbmRpZGF0ZSBpZiB3ZSBhbHJlYWR5IGhhdmUgbWF4IG51bWJlciBvZiBwcm9maWxlcyB0aGF0IGNvdWxkIGJlIGZyaWVuZHNcclxuICAgICAgICBpZiAodGhpcy5wcm9maWxlcy5sZW5ndGggPj0gU2VydmVyRGF0YS5NYXhpbXVtRnJpZW5kQ291bnQpIHJldHVybiBmYWxzZTtcclxuICAgICAgICAvLyBPdGhlcndpc2UsIHdlIG5lZWQgYSBjYW5kaWRhdGVcclxuICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgIH1cclxuXHJcbiAgICBwdWJsaWMgc3RhdGljIHJlcm9sbENhbmRpZGF0ZVByb2ZpbGVzKCk6IHZvaWQge1xyXG4gICAgICAgIHRoaXMucHJvZmlsZXMgPSB0aGlzLnByb2ZpbGVzLmZpbHRlcigocCkgPT4gcC5zdGF0dXMgIT09IFwiY2FuZGlkYXRlXCIpO1xyXG4gICAgICAgIHRoaXMuZ2VuZXJhdGVDYW5kaWRhdGVQcm9maWxlcygpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgc3RhdGljIGNob29zZUxlYXN0VXNlZEljb24oKTogUHJvZmlsZUljb24ge1xyXG4gICAgICAgIGNvbnN0IGNvdW50cyA9IHt9IGFzIFJlY29yZDxQcm9maWxlSWNvbiwgbnVtYmVyPjtcclxuICAgICAgICBmb3IgKGNvbnN0IHByb2ZpbGUgb2YgdGhpcy5wcm9maWxlcykge1xyXG4gICAgICAgICAgICBjb3VudHNbcHJvZmlsZS5pY29uXSA9IChjb3VudHNbcHJvZmlsZS5pY29uXSB8fCAwKSArIDE7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBsZXQgbGVhc3RVc2VkSWNvbjogUHJvZmlsZUljb24gfCBudWxsID0gbnVsbDtcclxuICAgICAgICBsZXQgbGVhc3RVc2VkQ291bnQgPSBJbmZpbml0eTtcclxuXHJcbiAgICAgICAgZm9yIChjb25zdCBpY29uIG9mIE9iamVjdC5rZXlzKFNlcnZlckRhdGEuUHJvZmlsZUljb25zKSBhcyBQcm9maWxlSWNvbltdKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGNvdW50ID0gY291bnRzW2ljb25dIHx8IDA7XHJcbiAgICAgICAgICAgIGlmIChjb3VudCA+PSBsZWFzdFVzZWRDb3VudCkgY29udGludWU7XHJcblxyXG4gICAgICAgICAgICBsZWFzdFVzZWRDb3VudCA9IGNvdW50O1xyXG4gICAgICAgICAgICBsZWFzdFVzZWRJY29uID0gaWNvbjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHJldHVybiBsZWFzdFVzZWRJY29uIGFzIFByb2ZpbGVJY29uO1xyXG4gICAgfVxyXG5cclxuICAgIC8vICNlbmRyZWdpb25cclxuXHJcbiAgICAvLyAjcmVnaW9uIEZyaWVuZHNcclxuICAgIHB1YmxpYyBzdGF0aWMgc2F2ZUZyaWVuZFByb2ZpbGVzKCk6IHZvaWQge1xyXG4gICAgICAgIHdvcmxkLnNldER5bmFtaWNQcm9wZXJ0eSh0aGlzLkZyaWVuZHNLZXksIEpTT04uc3RyaW5naWZ5KHRoaXMuZnJpZW5kUHJvZmlsZXMpKTtcclxuICAgIH1cclxuXHJcbiAgICBwdWJsaWMgc3RhdGljIGxvYWRGcmllbmRQcm9maWxlcygpOiBBSVBQcm9maWxlW10ge1xyXG4gICAgICAgIGNvbnN0IGRhdGEgPSB3b3JsZC5nZXREeW5hbWljUHJvcGVydHkodGhpcy5GcmllbmRzS2V5KSBhcyBzdHJpbmc7XHJcbiAgICAgICAgaWYgKCFkYXRhKSByZXR1cm4gW107XHJcblxyXG4gICAgICAgIGNvbnN0IHByb2ZpbGVzID0gSlNPTi5wYXJzZShkYXRhKSBhcyBBSVBQcm9maWxlW107XHJcbiAgICAgICAgcmV0dXJuIHByb2ZpbGVzO1xyXG4gICAgfVxyXG4gICAgLy8gI2VuZHJlZ2lvblxyXG5cclxuICAgIC8vICNyZWdpb24gRXZlbnRzXHJcblxyXG4gICAgcHVibGljIHN0YXRpYyBvblByb2ZpbGVKb2luKHByb2ZpbGU6IEFJUFByb2ZpbGUpIHtcclxuICAgICAgICBpZiAocHJvZmlsZS5zdGF0dXMgPT09IFwib25saW5lXCIpIHJldHVybjtcclxuXHJcbiAgICAgICAgdGhpcy5jYW5jZWxJbnZpdGF0aW9uUnVubmVyKHByb2ZpbGUpO1xyXG4gICAgICAgIHRoaXMuY2hhbmdlU3RhdHVzKHByb2ZpbGUsIFwib25saW5lXCIpO1xyXG4gICAgICAgIEJyb2FkY2FzdFV0aWwudHJhbnNsYXRlKFwibXVsdGlwbGF5ZXIucGxheWVyLmpvaW5lZFwiLCBbcHJvZmlsZS5nYW1lclRhZ10sIHVuZGVmaW5lZCwgU2VydmVyRGF0YS5NdWx0aXBsYXllckZlZWRiYWNrRm9ybWF0dGluZyk7XHJcblxyXG4gICAgICAgIGNvbnN0IHNlcmlhbGl6ZWRBSVAgPSBTcGF3bk1hbmFnZXIuZ2V0U2VyaWFsaXplZEFJUChwcm9maWxlLmdhbWVyVGFnKTtcclxuICAgICAgICBTcGF3bk1hbmFnZXIucXVldWVTcGF3bihzZXJpYWxpemVkQUlQKTtcclxuICAgIH1cclxuXHJcbiAgICBwdWJsaWMgc3RhdGljIG9uUHJvZmlsZUxlYXZlKHByb2ZpbGU6IEFJUFByb2ZpbGUsIHNob3VsZEJyb2FkY2FzdE1lc3NhZ2U6IGJvb2xlYW4gPSB0cnVlKSB7XHJcbiAgICAgICAgaWYgKHByb2ZpbGUuc3RhdHVzICE9PSBcIm9ubGluZVwiKSByZXR1cm47XHJcblxyXG4gICAgICAgIGNvbnN0IGVudGl0eSA9IHRoaXMuZ2V0RW50aXR5RnJvbVByb2ZpbGUocHJvZmlsZSk7XHJcbiAgICAgICAgaWYgKGVudGl0eSkgU3Bhd25NYW5hZ2VyLmRlc3Bhd24oZW50aXR5KTtcclxuXHJcbiAgICAgICAgU3Bhd25NYW5hZ2VyLmxlYXZlKHByb2ZpbGUuZ2FtZXJUYWcpO1xyXG5cclxuICAgICAgICB0aGlzLmNoYW5nZVN0YXR1cyhwcm9maWxlLCBcIm9mZmxpbmVcIik7XHJcbiAgICAgICAgaWYgKHNob3VsZEJyb2FkY2FzdE1lc3NhZ2UpIHtcclxuICAgICAgICAgICAgQnJvYWRjYXN0VXRpbC50cmFuc2xhdGUoXCJtdWx0aXBsYXllci5wbGF5ZXIubGVmdFwiLCBbcHJvZmlsZS5nYW1lclRhZ10sIHVuZGVmaW5lZCwgU2VydmVyRGF0YS5NdWx0aXBsYXllckZlZWRiYWNrRm9ybWF0dGluZyk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8vICNlbmRyZWdpb25cclxuXHJcbiAgICAvLyAjcmVnaW9uIEludml0YXRpb25zXHJcblxyXG4gICAgcHVibGljIHN0YXRpYyBpbnZpdGVDYW5kaWRhdGVQcm9maWxlKHByb2ZpbGU6IEFJUFByb2ZpbGUsIGFkbWluOiBQbGF5ZXIpIHtcclxuICAgICAgICB0aGlzLmludml0ZVByb2ZpbGUocHJvZmlsZSwgYWRtaW4pO1xyXG5cclxuICAgICAgICAvLyBSZXBsYWNlIHdpdGggbmV3IGNhbmRpZGF0ZSBwcm9maWxlIHRvIGVuc3VyZSBhIGNvbnN0YW50IG51bWJlciBvZiBjYW5kaWRhdGVzXHJcbiAgICAgICAgaWYgKHRoaXMubmVlZHNDYW5kaWRhdGUoKSkgdGhpcy5wcm9maWxlcy5wdXNoKHRoaXMuZ2VuZXJhdGVDYW5kaWRhdGVQcm9maWxlKCkpO1xyXG4gICAgfVxyXG5cclxuICAgIHB1YmxpYyBzdGF0aWMgaW52aXRlUHJvZmlsZShwcm9maWxlOiBBSVBQcm9maWxlLCBhZG1pbjogUGxheWVyKSB7XHJcbiAgICAgICAgaWYgKHByb2ZpbGUuc3RhdHVzID09PSBcImludml0ZWRcIiB8fCBwcm9maWxlLnN0YXR1cyA9PT0gXCJvbmxpbmVcIikgcmV0dXJuO1xyXG5cclxuICAgICAgICAvL0ludml0aW5nIGEgcGxheWVyIGF1dG9tYXRpY2FsbHkgc2V0cyB0aGUgc2VydmVyIHRvIG9ubGluZVxyXG4gICAgICAgIGlmICh0aGlzLnNlcnZlclN0YXR1cyA9PT0gXCJvZmZsaW5lXCIpIHRoaXMuc2V0U2VydmVyT25saW5lKCk7XHJcblxyXG4gICAgICAgIHRoaXMuY2hhbmdlU3RhdHVzKHByb2ZpbGUsIFwiaW52aXRlZFwiKTtcclxuXHJcbiAgICAgICAgQnJvYWRjYXN0VXRpbC50cmFuc2xhdGUoXCJnbTFfc2t5LmFkbWluX3Rvb2wuY29tbW9uLmludml0YXRpb25cIiwgW3Byb2ZpbGUuZ2FtZXJUYWddLCBbYWRtaW5dLCBTZXJ2ZXJEYXRhLkFkbWluRmVlZGJhY2tGb3JtYXR0aW5nKTtcclxuXHJcbiAgICAgICAgdGhpcy5xdWV1ZUludml0ZWRQcm9maWxlVG9Kb2luKHByb2ZpbGUpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgc3RhdGljIHF1ZXVlSW52aXRlZFByb2ZpbGVUb0pvaW4ocHJvZmlsZTogQUlQUHJvZmlsZSkge1xyXG4gICAgICAgIGNvbnN0IGRlbGF5ID0gTWF0aFV0aWwucmFuZG9tSW50KFNlcnZlckRhdGEuTWluRHVyYXRpb25CZWZvcmVKb2luaW5nLCBTZXJ2ZXJEYXRhLk1heER1cmF0aW9uQmVmb3JlSm9pbmluZyk7XHJcbiAgICAgICAgY29uc3QgcnVuID0gc3lzdGVtLnJ1blRpbWVvdXQodGhpcy5vblByb2ZpbGVKb2luLmJpbmQodGhpcywgcHJvZmlsZSksIGRlbGF5KTtcclxuICAgICAgICB0aGlzLmludml0YXRpb25SdW5zW3Byb2ZpbGUuZ2FtZXJUYWddID0gcnVuO1xyXG4gICAgfVxyXG5cclxuICAgIHB1YmxpYyBzdGF0aWMgY2FuY2VsUHJvZmlsZUludml0YXRpb24ocHJvZmlsZTogQUlQUHJvZmlsZSwgYWRtaW46IFBsYXllciB8IHVuZGVmaW5lZCkge1xyXG4gICAgICAgIGNvbnN0IGFkbWluQXJnID0gYWRtaW4gPyBbYWRtaW5dIDogdW5kZWZpbmVkO1xyXG4gICAgICAgIEJyb2FkY2FzdFV0aWwudHJhbnNsYXRlKFxyXG4gICAgICAgICAgICBcImdtMV9za3kuYWRtaW5fdG9vbC5jb21tb24uY2FuY2VsX2ludml0YXRpb25cIixcclxuICAgICAgICAgICAgW3Byb2ZpbGUuZ2FtZXJUYWddLFxyXG4gICAgICAgICAgICBhZG1pbkFyZyxcclxuICAgICAgICAgICAgU2VydmVyRGF0YS5BZG1pbkZlZWRiYWNrRm9ybWF0dGluZ1xyXG4gICAgICAgICk7XHJcbiAgICAgICAgdGhpcy5jYW5jZWxJbnZpdGF0aW9uUnVubmVyKHByb2ZpbGUpO1xyXG4gICAgICAgIHRoaXMuY2hhbmdlU3RhdHVzKHByb2ZpbGUsIFwib2ZmbGluZVwiKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHN0YXRpYyBjYW5jZWxJbnZpdGF0aW9uUnVubmVyKHByb2ZpbGU6IEFJUFByb2ZpbGUpIHtcclxuICAgICAgICBjb25zdCBydW4gPSB0aGlzLmludml0YXRpb25SdW5zW3Byb2ZpbGUuZ2FtZXJUYWddO1xyXG4gICAgICAgIGlmIChydW4gPT09IHVuZGVmaW5lZCkgcmV0dXJuO1xyXG4gICAgICAgIHN5c3RlbS5jbGVhclJ1bihydW4pO1xyXG4gICAgICAgIGRlbGV0ZSB0aGlzLmludml0YXRpb25SdW5zW3Byb2ZpbGUuZ2FtZXJUYWddO1xyXG4gICAgfVxyXG4gICAgLy8gI2VuZHJlZ2lvblxyXG5cclxuICAgIC8vICNyZWdpb24gQWRtaW4gQWN0aW9uc1xyXG4gICAgcHVibGljIHN0YXRpYyBraWNrUHJvZmlsZShwcm9maWxlOiBBSVBQcm9maWxlLCBhZG1pbjogUGxheWVyKSB7XHJcbiAgICAgICAgQnJvYWRjYXN0VXRpbC50cmFuc2xhdGUoXCJjb21tYW5kcy5raWNrLnN1Y2Nlc3NcIiwgW3Byb2ZpbGUuZ2FtZXJUYWddLCBbYWRtaW5dLCBTZXJ2ZXJEYXRhLkFkbWluRmVlZGJhY2tGb3JtYXR0aW5nKTtcclxuICAgICAgICB0aGlzLm9uUHJvZmlsZUxlYXZlKHByb2ZpbGUpO1xyXG4gICAgfVxyXG5cclxuICAgIHB1YmxpYyBzdGF0aWMgYmFuUHJvZmlsZShwcm9maWxlOiBBSVBQcm9maWxlLCBhZG1pbjogUGxheWVyKSB7XHJcbiAgICAgICAgQnJvYWRjYXN0VXRpbC50cmFuc2xhdGUoXCJjb21tYW5kcy5iYW4uc3VjY2Vzc1wiLCBbcHJvZmlsZS5nYW1lclRhZ10sIFthZG1pbl0sIFNlcnZlckRhdGEuQWRtaW5GZWVkYmFja0Zvcm1hdHRpbmcpO1xyXG4gICAgICAgIGlmIChwcm9maWxlLnN0YXR1cyA9PT0gXCJvbmxpbmVcIikgdGhpcy5vblByb2ZpbGVMZWF2ZShwcm9maWxlKTtcclxuICAgICAgICBpZiAocHJvZmlsZS5zdGF0dXMgPT09IFwiaW52aXRlZFwiKSB0aGlzLmNhbmNlbEludml0YXRpb25SdW5uZXIocHJvZmlsZSk7XHJcbiAgICAgICAgU3Bhd25NYW5hZ2VyLmRlbGV0ZVNlcmlhbGl6ZWRBSVAocHJvZmlsZS5nYW1lclRhZyk7XHJcbiAgICAgICAgdGhpcy5wcm9maWxlcyA9IHRoaXMucHJvZmlsZXMuZmlsdGVyKChwKSA9PiBwLmdhbWVyVGFnICE9PSBwcm9maWxlLmdhbWVyVGFnKTtcclxuXHJcbiAgICAgICAgdGhpcy5nZW5lcmF0ZUNhbmRpZGF0ZVByb2ZpbGVzKCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHVibGljIHN0YXRpYyB0ZWxlcG9ydFByb2ZpbGUocHJvZmlsZTogQUlQUHJvZmlsZSwgYWRtaW46IFBsYXllcikge1xyXG4gICAgICAgIGNvbnN0IGxvY2F0aW9uID0gVjMuZnJvbUVudGl0eShhZG1pbik7XHJcblxyXG4gICAgICAgIGlmIChsb2NhdGlvbi5kaW1lbnNpb24/LmlkICE9PSBvdmVyd29ybGQuaWQpIHtcclxuICAgICAgICAgICAgQnJvYWRjYXN0VXRpbC50cmFuc2xhdGUoXHJcbiAgICAgICAgICAgICAgICBcImdtMV9za3kuYWRtaW5fdG9vbC5jb21tb24udGVsZXBvcnQuZGltZW5zaW9uX2ZhaWxcIixcclxuICAgICAgICAgICAgICAgIFtwcm9maWxlLmdhbWVyVGFnXSxcclxuICAgICAgICAgICAgICAgIFthZG1pbl0sXHJcbiAgICAgICAgICAgICAgICBTZXJ2ZXJEYXRhLkFkbWluRmVlZGJhY2tGb3JtYXR0aW5nXHJcbiAgICAgICAgICAgICk7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIEJyb2FkY2FzdFV0aWwudHJhbnNsYXRlKFwiZ20xX3NreS5hZG1pbl90b29sLmNvbW1vbi50ZWxlcG9ydFwiLCBbcHJvZmlsZS5nYW1lclRhZ10sIFthZG1pbl0sIFNlcnZlckRhdGEuQWRtaW5GZWVkYmFja0Zvcm1hdHRpbmcpO1xyXG5cclxuICAgICAgICBjb25zdCBlbnRpdHkgPSB0aGlzLmdldEVudGl0eUZyb21Qcm9maWxlKHByb2ZpbGUpO1xyXG5cclxuICAgICAgICBpZiAoZW50aXR5KSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGJpZ0JyYWluQ29tcG9uZW50ID0gZW50aXR5LmdldE1vYkNvbXBvbmVudChcIkJpZ0JyYWluQ29tcG9uZW50XCIpO1xyXG4gICAgICAgICAgICBpZiAoIWJpZ0JyYWluQ29tcG9uZW50KSByZXR1cm47XHJcblxyXG4gICAgICAgICAgICBiaWdCcmFpbkNvbXBvbmVudC50ZWxlcG9ydFRvTG9jYXRpb24obG9jYXRpb24pO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIFNwYXduTWFuYWdlci50cnlTcGF3bkF0TG9jYXRpb24obG9jYXRpb24sIHByb2ZpbGUuZ2FtZXJUYWcpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvLyAjZW5kcmVnaW9uXHJcblxyXG4gICAgLy8gI3JlZ2lvbiBTZXJ2ZXIgU3RhdHVzXHJcbiAgICBwdWJsaWMgc3RhdGljIHNldFNlcnZlck9mZmxpbmUoKSB7XHJcbiAgICAgICAgZm9yIChjb25zdCBwcm9maWxlIG9mIHRoaXMub25saW5lUHJvZmlsZXMpIHtcclxuICAgICAgICAgICAgdGhpcy5vblByb2ZpbGVMZWF2ZShwcm9maWxlKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGZvciAoY29uc3QgcHJvZmlsZSBvZiB0aGlzLmludml0ZWRQcm9maWxlcykge1xyXG4gICAgICAgICAgICB0aGlzLmNhbmNlbFByb2ZpbGVJbnZpdGF0aW9uKHByb2ZpbGUsIHVuZGVmaW5lZCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB3b3JsZC5zZXREeW5hbWljUHJvcGVydHkodGhpcy5TZXJ2ZXJTdGF0dXNLZXksIFwib2ZmbGluZVwiKTtcclxuXHJcbiAgICAgICAgQnJvYWRjYXN0VXRpbC50cmFuc2xhdGUoXCJnbTFfc2t5LmFkbWluX3Rvb2wuY29tbW9uLnNldF9zZXJ2ZXJfb2ZmbGluZVwiLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgU2VydmVyRGF0YS5BZG1pbkZlZWRiYWNrRm9ybWF0dGluZyk7XHJcbiAgICB9XHJcblxyXG4gICAgcHVibGljIHN0YXRpYyBzZXRTZXJ2ZXJPbmxpbmUoKSB7XHJcbiAgICAgICAgd29ybGQuc2V0RHluYW1pY1Byb3BlcnR5KHRoaXMuU2VydmVyU3RhdHVzS2V5LCBcIm9ubGluZVwiKTtcclxuXHJcbiAgICAgICAgQnJvYWRjYXN0VXRpbC50cmFuc2xhdGUoXCJnbTFfc2t5LmFkbWluX3Rvb2wuY29tbW9uLnNldF9zZXJ2ZXJfb25saW5lXCIsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBTZXJ2ZXJEYXRhLkFkbWluRmVlZGJhY2tGb3JtYXR0aW5nKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyAjcmVnaW9uIFByb2ZpbGUtRW50aXR5IE1hcHBpbmdcclxuICAgIHByaXZhdGUgc3RhdGljIGVuc3VyZU9ubGluZVByb2ZpbGVGb3JFbnRpdHkoZW50aXR5OiBFbnRpdHkpOiBBSVBQcm9maWxlIHtcclxuICAgICAgICBjb25zdCB0YWcgPSBFbnRpdHlTdG9yZS5nZXQoZW50aXR5LCBcImdhbWVyVGFnXCIpO1xyXG4gICAgICAgIGxldCBwcm9maWxlID0gdGhpcy5wcm9maWxlcy5maW5kKChwKSA9PiBwLmdhbWVyVGFnID09PSB0YWcpO1xyXG4gICAgICAgIGlmIChwcm9maWxlKSB7XHJcbiAgICAgICAgICAgIHRoaXMuY2hhbmdlU3RhdHVzKHByb2ZpbGUsIFwib25saW5lXCIpO1xyXG4gICAgICAgICAgICByZXR1cm4gcHJvZmlsZTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHByb2ZpbGUgPSB7IGdhbWVyVGFnOiB0YWcsIGljb246IHRoaXMuY2hvb3NlTGVhc3RVc2VkSWNvbigpLCBzdGF0dXM6IFwib25saW5lXCIsIGxhc3RTdGF0dXNDaGFuZ2U6IE1haW4uY3VycmVudFRpY2sgfTtcclxuICAgICAgICB0aGlzLnByb2ZpbGVzLnB1c2gocHJvZmlsZSk7XHJcbiAgICAgICAgcmV0dXJuIHByb2ZpbGU7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBzdGF0aWMgZW5zdXJlVmFsaWRQcm9maWxlKHByb2ZpbGU6IEFJUFByb2ZpbGUpIHtcclxuICAgICAgICAvLyBFbnN1cmUgaWNvbiBzdGlsbCBleGlzdHNcclxuICAgICAgICBpZiAoIVNlcnZlckRhdGEuUHJvZmlsZUljb25zW3Byb2ZpbGUuaWNvbl0pIHtcclxuICAgICAgICAgICAgcHJvZmlsZS5pY29uID0gdGhpcy5jaG9vc2VMZWFzdFVzZWRJY29uKCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHB1YmxpYyBzdGF0aWMgZ2V0RW50aXR5RnJvbVByb2ZpbGUocHJvZmlsZTogQUlQUHJvZmlsZSkge1xyXG4gICAgICAgIGlmIChwcm9maWxlLnN0YXR1cyAhPT0gXCJvbmxpbmVcIikgcmV0dXJuIG51bGw7XHJcblxyXG4gICAgICAgIGNvbnN0IGVudGl0aWVzID0gRW50aXR5VXRpbC5nZXRFbnRpdGllcyh7IHR5cGU6IFwiZ20xX3NreTphaXBcIiB9KTtcclxuICAgICAgICBmb3IgKGNvbnN0IGVudGl0eSBvZiBlbnRpdGllcykge1xyXG4gICAgICAgICAgICBjb25zdCB0YWcgPSBFbnRpdHlTdG9yZS5nZXQoZW50aXR5LCBcImdhbWVyVGFnXCIpO1xyXG4gICAgICAgICAgICBpZiAodGFnID09PSBwcm9maWxlLmdhbWVyVGFnKSByZXR1cm4gZW50aXR5O1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgIH1cclxuXHJcbiAgICBwdWJsaWMgc3RhdGljIGdldFByb2ZpbGVGcm9tRW50aXR5KGVudGl0eTogRW50aXR5KSB7XHJcbiAgICAgICAgY29uc3QgdGFnID0gRW50aXR5U3RvcmUuZ2V0KGVudGl0eSwgXCJnYW1lclRhZ1wiKTtcclxuICAgICAgICBjb25zdCBwcm9maWxlID0gdGhpcy5wcm9maWxlcy5maW5kKChwKSA9PiBwLmdhbWVyVGFnID09PSB0YWcpO1xyXG4gICAgICAgIHJldHVybiBwcm9maWxlO1xyXG4gICAgfVxyXG5cclxuICAgIHB1YmxpYyBzdGF0aWMgZ2V0UHJvZmlsZUZyb21HYW1lclRhZyhnYW1lclRhZzogc3RyaW5nKSB7XHJcbiAgICAgICAgY29uc3QgcHJvZmlsZSA9IHRoaXMucHJvZmlsZXMuZmluZCgocCkgPT4gcC5nYW1lclRhZyA9PT0gZ2FtZXJUYWcpO1xyXG4gICAgICAgIHJldHVybiBwcm9maWxlO1xyXG4gICAgfVxyXG4gICAgLy8gI2VuZHJlZ2lvblxyXG59XHJcbiJdLCJuYW1lcyI6WyJzeXN0ZW0iLCJ3b3JsZCIsIlNwYXduTWFuYWdlciIsIlNlcnZlckRhdGEiLCJHYW1lclRhZ1JhbmRvbWl6ZXJDb21wb25lbnQiLCJWMyIsIk1haW4iLCJWaXJ0dWFsU2VydmVyTWFuYWdlciIsInNlcnZlclN0YXR1cyIsImdldER5bmFtaWNQcm9wZXJ0eSIsIlNlcnZlclN0YXR1c0tleSIsImxhc3RPbmxpbmVUaW1lIiwiTGFzdE9ubGluZVRpbWVLZXkiLCJjYW5kaWRhdGVQcm9maWxlcyIsInByb2ZpbGVzIiwiZmlsdGVyIiwicCIsInN0YXR1cyIsImludml0ZWRQcm9maWxlcyIsIm9ubGluZVByb2ZpbGVzIiwib2ZmbGluZVByb2ZpbGVzIiwiZnJpZW5kUHJvZmlsZXMiLCJpc0FueVByb2ZpbGVPbmxpbmUiLCJsZW5ndGgiLCJpbml0IiwidW5kZWZpbmVkIiwic2V0RHluYW1pY1Byb3BlcnR5Iiwic2Vzc2lvblN0YXJ0VGltZSIsIkRhdGUiLCJub3ciLCJsb2FkRnJpZW5kUHJvZmlsZXMiLCJvbmxpbmVQcm9maWxlc0F0U2Vzc2lvblN0YXJ0IiwicHJvZmlsZSIsImVuc3VyZVZhbGlkUHJvZmlsZSIsInF1ZXVlSW52aXRlZFByb2ZpbGVzVG9Kb2luIiwiZ2VuZXJhdGVDYW5kaWRhdGVQcm9maWxlcyIsIkN1c3RvbUV2ZW50cyIsInN1YnNjcmliZSIsIm9uRW50aXR5TG9hZGVkIiwiYmluZCIsIkV2ZW50U3Vic2NyaWJlciIsIm9uQmVmb3JlV29ybGRTaHV0ZG93biIsInJ1bkludGVydmFsIiwicm9sbFJhbmRvbVN0YXR1c0NoYW5nZSIsIlJvbGxSYW5kb21TdGF0dXNDaGFuZ2VJbnRlcnZhbCIsInNhdmVGcmllbmRQcm9maWxlcyIsInF1ZXVlSW52aXRlZFByb2ZpbGVUb0pvaW4iLCJsZWF2ZUlmTWF4VGltZVNpbmNlTGFzdFNlc3Npb25IYXNFbGFwc2VkIiwiaW5jbHVkZXMiLCJ0aW1lU2luY2VMYXN0T25saW5lIiwiTWF4VGltZVNpbmNlTGFzdFNlc3Npb25CZWZvcmVMZWF2aW5nIiwib25Qcm9maWxlTGVhdmUiLCJjaGFuZ2VTdGF0dXMiLCJsYXN0U3RhdHVzQ2hhbmdlIiwiY3VycmVudFRpY2siLCJoYXNNZXRNaW5TdGF0dXNUaW1lIiwibWluVGltZVRpY2tzIiwiTWF0aCIsInJhbmRvbSIsIkpvaW5DaGFuY2VQZXJJbnRlcnZhbCIsImVsaWdpYmxlIiwiTWluT2ZmbGluZVRpbWVCZWZvcmVKb2luaW5nIiwiTWF0aFV0aWwiLCJjaG9vc2UiLCJvblByb2ZpbGVKb2luIiwiTGVhdmVDaGFuY2VQZXJJbnRlcnZhbCIsIk1pbk9ubGluZVRpbWVCZWZvcmVMZWF2aW5nIiwiZW50aXR5IiwiZ2V0RW50aXR5RnJvbVByb2ZpbGUiLCJFbnRpdHlTdG9yZSIsImdldCIsInRyeVJhbmRvbUxlYXZlT25EZWF0aCIsImdldFByb2ZpbGVGcm9tRW50aXR5IiwiTGVhdmVPbkRlYXRoQ2hhbmNlIiwicnVuVGltZW91dCIsIkxlYXZlT25EZWF0aERlbGF5IiwidHJ5UmFuZG9tTGVhdmVPblVubG9hZCIsIkxlYXZlT25VbmxvYWRDaGFuY2UiLCJ0eXBlSWQiLCJnYW1lVGVzdERhdGEiLCJlbnN1cmVPbmxpbmVQcm9maWxlRm9yRW50aXR5IiwiYW55UHJvZmlsZUhhc1RhZyIsInRhZyIsInNvbWUiLCJnYW1lclRhZyIsImlzQXRXYXJuaW5nTGltaXQiLCJtZW1vcnlUaWVyIiwic2VydmVyU3lzdGVtSW5mbyIsInBsYXRmb3JtVHlwZSIsIldvcmxkU3RvcmUiLCJtZW1vcnlMaW1pdCIsIk1lbW9yeVRpZXJGcmllbmRXYXJuaW5nTGltaXQiLCJwbGF0Zm9ybUxpbWl0IiwiUGxhdGZvcm1UeXBlRnJpZW5kV2FybmluZ0xpbWl0IiwiSW5maW5pdHkiLCJtaW5MaW1pdCIsIm1pbiIsIm5lZWRzQ2FuZGlkYXRlIiwicHVzaCIsImdlbmVyYXRlQ2FuZGlkYXRlUHJvZmlsZSIsInBpY2tVbmlxdWVUYWciLCJpY29uIiwiY2hvb3NlTGVhc3RVc2VkSWNvbiIsIk1heGltdW1DYW5kaWRhdGVQcm9maWxlQ291bnQiLCJNYXhpbXVtRnJpZW5kQ291bnQiLCJyZXJvbGxDYW5kaWRhdGVQcm9maWxlcyIsImNvdW50cyIsImxlYXN0VXNlZEljb24iLCJsZWFzdFVzZWRDb3VudCIsIk9iamVjdCIsImtleXMiLCJQcm9maWxlSWNvbnMiLCJjb3VudCIsIkZyaWVuZHNLZXkiLCJKU09OIiwic3RyaW5naWZ5IiwiZGF0YSIsInBhcnNlIiwiY2FuY2VsSW52aXRhdGlvblJ1bm5lciIsIkJyb2FkY2FzdFV0aWwiLCJ0cmFuc2xhdGUiLCJNdWx0aXBsYXllckZlZWRiYWNrRm9ybWF0dGluZyIsInNlcmlhbGl6ZWRBSVAiLCJnZXRTZXJpYWxpemVkQUlQIiwicXVldWVTcGF3biIsInNob3VsZEJyb2FkY2FzdE1lc3NhZ2UiLCJkZXNwYXduIiwibGVhdmUiLCJpbnZpdGVDYW5kaWRhdGVQcm9maWxlIiwiYWRtaW4iLCJpbnZpdGVQcm9maWxlIiwic2V0U2VydmVyT25saW5lIiwiQWRtaW5GZWVkYmFja0Zvcm1hdHRpbmciLCJkZWxheSIsInJhbmRvbUludCIsIk1pbkR1cmF0aW9uQmVmb3JlSm9pbmluZyIsIk1heER1cmF0aW9uQmVmb3JlSm9pbmluZyIsInJ1biIsImludml0YXRpb25SdW5zIiwiY2FuY2VsUHJvZmlsZUludml0YXRpb24iLCJhZG1pbkFyZyIsImNsZWFyUnVuIiwia2lja1Byb2ZpbGUiLCJiYW5Qcm9maWxlIiwiZGVsZXRlU2VyaWFsaXplZEFJUCIsInRlbGVwb3J0UHJvZmlsZSIsImxvY2F0aW9uIiwiZnJvbUVudGl0eSIsImRpbWVuc2lvbiIsImlkIiwib3ZlcndvcmxkIiwiYmlnQnJhaW5Db21wb25lbnQiLCJnZXRNb2JDb21wb25lbnQiLCJ0ZWxlcG9ydFRvTG9jYXRpb24iLCJ0cnlTcGF3bkF0TG9jYXRpb24iLCJzZXRTZXJ2ZXJPZmZsaW5lIiwiZmluZCIsImVudGl0aWVzIiwiRW50aXR5VXRpbCIsImdldEVudGl0aWVzIiwidHlwZSIsImdldFByb2ZpbGVGcm9tR2FtZXJUYWciXSwibWFwcGluZ3MiOiJBQUFBLFNBQXlCQSxNQUFNLEVBQUVDLEtBQUssUUFBUSxvQkFBb0I7QUFDbEUsT0FBT0Msa0JBQWtCLDBCQUEwQjtBQUNuRCxPQUFPQyxnQkFBZ0Isa0JBQWtCO0FBQ3pDLE9BQU9DLGlDQUFpQyxpREFBaUQ7QUFDekYsT0FBT0MsUUFBUSxxQkFBcUI7QUFDcEMsT0FBT0MsVUFBVSxPQUFPO0FBR1QsTUFBTUM7SUFPakIsV0FBa0JDLGVBQWU7UUFDN0IsT0FBT1AsTUFBTVEsa0JBQWtCLENBQUMsSUFBSSxDQUFDQyxlQUFlO0lBQ3hEO0lBRUEsV0FBa0JDLGlCQUFnQztRQUM5QyxPQUFPLEFBQUNWLE1BQU1RLGtCQUFrQixDQUFDLElBQUksQ0FBQ0csaUJBQWlCLEtBQWdCO0lBQzNFO0lBSUEsV0FBa0JDLG9CQUFvQjtRQUNsQyxPQUFPLElBQUksQ0FBQ0MsUUFBUSxDQUFDQyxNQUFNLENBQUMsQ0FBQ0MsSUFBTUEsRUFBRUMsTUFBTSxLQUFLO0lBQ3BEO0lBRUEsV0FBa0JDLGtCQUFrQjtRQUNoQyxPQUFPLElBQUksQ0FBQ0osUUFBUSxDQUFDQyxNQUFNLENBQUMsQ0FBQ0MsSUFBTUEsRUFBRUMsTUFBTSxLQUFLO0lBQ3BEO0lBRUEsV0FBa0JFLGlCQUFpQjtRQUMvQixPQUFPLElBQUksQ0FBQ0wsUUFBUSxDQUFDQyxNQUFNLENBQUMsQ0FBQ0MsSUFBTUEsRUFBRUMsTUFBTSxLQUFLO0lBQ3BEO0lBRUEsV0FBa0JHLGtCQUFrQjtRQUNoQyxPQUFPLElBQUksQ0FBQ04sUUFBUSxDQUFDQyxNQUFNLENBQUMsQ0FBQ0MsSUFBTUEsRUFBRUMsTUFBTSxLQUFLO0lBQ3BEO0lBRUEsV0FBa0JJLGlCQUFpQjtRQUMvQixPQUFPLElBQUksQ0FBQ1AsUUFBUSxDQUFDQyxNQUFNLENBQUMsQ0FBQ0MsSUFBTUEsRUFBRUMsTUFBTSxLQUFLO0lBQ3BEO0lBRUEsV0FBa0JLLHFCQUFxQjtRQUNuQyxPQUFPLElBQUksQ0FBQ0gsY0FBYyxDQUFDSSxNQUFNLEdBQUc7SUFDeEM7SUFLQSxPQUFjQyxPQUFPO1FBQ2pCLElBQUksSUFBSSxDQUFDaEIsWUFBWSxLQUFLaUIsV0FBVztZQUNqQ3hCLE1BQU15QixrQkFBa0IsQ0FBQyxJQUFJLENBQUNoQixlQUFlLEVBQUU7UUFDbkQ7UUFFQSxJQUFJLENBQUNpQixnQkFBZ0IsR0FBR0MsS0FBS0MsR0FBRztRQUNoQyxJQUFJLENBQUNmLFFBQVEsR0FBRyxJQUFJLENBQUNnQixrQkFBa0I7UUFDdkMsSUFBSSxDQUFDQyw0QkFBNEIsR0FBRztlQUFJLElBQUksQ0FBQ1osY0FBYztTQUFDO1FBQzVELEtBQUssTUFBTWEsV0FBVyxJQUFJLENBQUNsQixRQUFRLENBQUUsSUFBSSxDQUFDbUIsa0JBQWtCLENBQUNEO1FBQzdELElBQUksQ0FBQ0UsMEJBQTBCO1FBQy9CLElBQUksQ0FBQ0MseUJBQXlCO1FBRTlCQyxhQUFhQyxTQUFTLENBQUMsZ0JBQWdCLElBQUksQ0FBQ0MsY0FBYyxDQUFDQyxJQUFJLENBQUMsSUFBSTtRQUNwRUMsZ0JBQWdCSCxTQUFTLENBQUMsc0JBQXNCLFlBQVksSUFBSSxDQUFDSSxxQkFBcUIsQ0FBQ0YsSUFBSSxDQUFDLElBQUk7UUFFaEd2QyxPQUFPMEMsV0FBVyxDQUFDLElBQUksQ0FBQ0Msc0JBQXNCLENBQUNKLElBQUksQ0FBQyxJQUFJLEdBQUdwQyxXQUFXeUMsOEJBQThCO0lBQ3hHO0lBRUEsT0FBZUgsd0JBQXdCO1FBQ25DeEMsTUFBTXlCLGtCQUFrQixDQUFDLElBQUksQ0FBQ2QsaUJBQWlCLEVBQUVnQixLQUFLQyxHQUFHO1FBQ3pELElBQUksQ0FBQ2dCLGtCQUFrQjtJQUMzQjtJQUVBLE9BQWVYLDZCQUE2QjtRQUN4QyxLQUFLLE1BQU1GLFdBQVcsSUFBSSxDQUFDZCxlQUFlLENBQUU7WUFDeEMsSUFBSSxDQUFDNEIseUJBQXlCLENBQUNkO1FBQ25DO0lBQ0o7SUFFQSxPQUFlZSx5Q0FBeUNmLE9BQW1CLEVBQUU7UUFDekUsZ0dBQWdHO1FBQ2hHLElBQUksQ0FBQyxJQUFJLENBQUNELDRCQUE0QixDQUFDaUIsUUFBUSxDQUFDaEIsVUFBVTtRQUMxRCxJQUFJLENBQUNELDRCQUE0QixHQUFHLElBQUksQ0FBQ0EsNEJBQTRCLENBQUNoQixNQUFNLENBQUMsQ0FBQ0MsSUFBTUEsTUFBTWdCO1FBRTFGLE1BQU1yQixpQkFBaUIsSUFBSSxDQUFDQSxjQUFjO1FBQzFDLElBQUlBLG1CQUFtQixNQUFNO1FBRTdCLE1BQU1zQyxzQkFBc0IsSUFBSSxDQUFDdEIsZ0JBQWdCLEdBQUdoQjtRQUVwRCxJQUFJc0Msc0JBQXNCOUMsV0FBVytDLG9DQUFvQyxHQUFHLE1BQU07UUFFbEYsSUFBSSxDQUFDQyxjQUFjLENBQUNuQixTQUFTO0lBQ2pDO0lBRUEsT0FBZW9CLGFBQWFwQixPQUFtQixFQUFFZixNQUFxQixFQUFFO1FBQ3BFZSxRQUFRZixNQUFNLEdBQUdBO1FBQ2pCZSxRQUFRcUIsZ0JBQWdCLEdBQUcvQyxLQUFLZ0QsV0FBVztJQUMvQztJQUVBLE9BQWVDLG9CQUFvQnZCLE9BQW1CLEVBQUV3QixZQUFvQixFQUFXO1FBQ25GLElBQUl4QixRQUFRcUIsZ0JBQWdCLEtBQUs1QixXQUFXLE9BQU87UUFDbkQsT0FBT25CLEtBQUtnRCxXQUFXLEdBQUd0QixRQUFRcUIsZ0JBQWdCLElBQUlHO0lBQzFEO0lBRUEsT0FBZWIseUJBQXlCO1FBQ3BDLElBQUksSUFBSSxDQUFDbkMsWUFBWSxLQUFLLFdBQVc7UUFFckMsNENBQTRDO1FBQzVDLElBQUlpRCxLQUFLQyxNQUFNLEtBQUt2RCxXQUFXd0QscUJBQXFCLEVBQUU7WUFDbEQsTUFBTUMsV0FBVyxJQUFJLENBQUN4QyxlQUFlLENBQUNMLE1BQU0sQ0FBQyxDQUFDQyxJQUFNLElBQUksQ0FBQ3VDLG1CQUFtQixDQUFDdkMsR0FBR2IsV0FBVzBELDJCQUEyQjtZQUN0SCxNQUFNN0IsVUFBVThCLFNBQVNDLE1BQU0sQ0FBQ0g7WUFDaEMsSUFBSTVCLFNBQVMsT0FBTyxJQUFJLENBQUNnQyxhQUFhLENBQUNoQztRQUMzQztRQUVBLDRDQUE0QztRQUM1QyxJQUFJeUIsS0FBS0MsTUFBTSxLQUFLdkQsV0FBVzhELHNCQUFzQixFQUFFO1lBQ25ELE1BQU1MLFdBQVcsSUFBSSxDQUFDekMsY0FBYyxDQUFDSixNQUFNLENBQUMsQ0FBQ0MsSUFBTSxJQUFJLENBQUN1QyxtQkFBbUIsQ0FBQ3ZDLEdBQUdiLFdBQVcrRCwwQkFBMEI7WUFDcEgsTUFBTWxDLFVBQVU4QixTQUFTQyxNQUFNLENBQUNIO1lBQ2hDLElBQUk1QixTQUFTO2dCQUNULE1BQU1tQyxTQUFTLElBQUksQ0FBQ0Msb0JBQW9CLENBQUNwQztnQkFDekMsSUFBSW1DLFVBQVVFLFlBQVlDLEdBQUcsQ0FBQ0gsUUFBUSxlQUFlO2dCQUNyRCxJQUFJLENBQUNoQixjQUFjLENBQUNuQjtZQUN4QjtRQUNKO0lBQ0o7SUFFQSxPQUFjdUMsc0JBQXNCSixNQUFjLEVBQVc7UUFDekQsTUFBTW5DLFVBQVUsSUFBSSxDQUFDd0Msb0JBQW9CLENBQUNMO1FBQzFDLElBQUksQ0FBQ25DLFdBQVdxQyxZQUFZQyxHQUFHLENBQUNILFFBQVEsZUFBZSxPQUFPO1FBQzlELElBQUksQ0FBQyxJQUFJLENBQUNaLG1CQUFtQixDQUFDdkIsU0FBUzdCLFdBQVcrRCwwQkFBMEIsR0FBRyxPQUFPO1FBQ3RGLElBQUlULEtBQUtDLE1BQU0sTUFBTXZELFdBQVdzRSxrQkFBa0IsRUFBRSxPQUFPO1FBRTNEekUsT0FBTzBFLFVBQVUsQ0FBQyxJQUFNLElBQUksQ0FBQ3ZCLGNBQWMsQ0FBQ25CLFVBQVU3QixXQUFXd0UsaUJBQWlCO1FBQ2xGLE9BQU87SUFDWDtJQUVBLE9BQWNDLHVCQUF1QlQsTUFBYyxFQUFXO1FBQzFELE1BQU1uQyxVQUFVLElBQUksQ0FBQ3dDLG9CQUFvQixDQUFDTDtRQUMxQyxJQUFJLENBQUNuQyxXQUFXcUMsWUFBWUMsR0FBRyxDQUFDSCxRQUFRLGVBQWUsT0FBTztRQUM5RCxJQUFJLENBQUMsSUFBSSxDQUFDWixtQkFBbUIsQ0FBQ3ZCLFNBQVM3QixXQUFXK0QsMEJBQTBCLEdBQUcsT0FBTztRQUN0RixJQUFJVCxLQUFLQyxNQUFNLE1BQU12RCxXQUFXMEUsbUJBQW1CLEVBQUUsT0FBTztRQUU1RCxJQUFJLENBQUMxQixjQUFjLENBQUNuQjtRQUNwQixPQUFPO0lBQ1g7SUFFQSxPQUFlTSxlQUFlNkIsTUFBYyxFQUFFO1FBQzFDLElBQUlBLE9BQU9XLE1BQU0sS0FBSyxlQUFlO1FBQ3JDLElBQUlYLE9BQU9ZLFlBQVksRUFBRTtRQUN6QixNQUFNL0MsVUFBVSxJQUFJLENBQUNnRCw0QkFBNEIsQ0FBQ2I7UUFFbEQsSUFBSSxDQUFDcEIsd0NBQXdDLENBQUNmO0lBQ2xEO0lBRUEsT0FBY2lELGlCQUFpQkMsR0FBVyxFQUFXO1FBQ2pELE9BQU8sSUFBSSxDQUFDcEUsUUFBUSxDQUFDcUUsSUFBSSxDQUFDLENBQUNuRSxJQUFNQSxFQUFFb0UsUUFBUSxLQUFLRjtJQUNwRDtJQUVBLE9BQWNHLG1CQUE0QjtRQUN0QyxNQUFNQyxhQUFhdEYsT0FBT3VGLGdCQUFnQixDQUFDRCxVQUFVO1FBQ3JELE1BQU1FLGVBQWVDLFdBQVduQixHQUFHLENBQUM7UUFFcEMsTUFBTW9CLGNBQWN2RixXQUFXd0YsNEJBQTRCLENBQUNMLFdBQVc7UUFDdkUsTUFBTU0sZ0JBQWdCSixlQUFlckYsV0FBVzBGLDhCQUE4QixDQUFDTCxhQUFhLEdBQUdNO1FBRS9GLE1BQU1DLFdBQVd0QyxLQUFLdUMsR0FBRyxDQUFDTixhQUFhRTtRQUN2QyxPQUFPLElBQUksQ0FBQ3ZFLGNBQWMsQ0FBQ0UsTUFBTSxJQUFJd0U7SUFDekM7SUFFQSxxQkFBcUI7SUFDckIsT0FBYzVELDRCQUFrQztRQUM1QyxNQUFPLElBQUksQ0FBQzhELGNBQWMsR0FBSSxJQUFJLENBQUNuRixRQUFRLENBQUNvRixJQUFJLENBQUMsSUFBSSxDQUFDQyx3QkFBd0I7SUFDbEY7SUFFQSxPQUFjQSwyQkFBdUM7UUFDakQsTUFBTWpCLE1BQU05RSw0QkFBNEJnRyxhQUFhO1FBQ3JELE1BQU1DLE9BQU8sSUFBSSxDQUFDQyxtQkFBbUI7UUFDckMsT0FBTztZQUFFbEIsVUFBVUY7WUFBS21CO1lBQU1wRixRQUFRO1FBQVk7SUFDdEQ7SUFFQSxPQUFlZ0YsaUJBQTBCO1FBQ3JDLG1FQUFtRTtRQUNuRSxJQUFJLElBQUksQ0FBQ3BGLGlCQUFpQixDQUFDVSxNQUFNLElBQUlwQixXQUFXb0csNEJBQTRCLEVBQUUsT0FBTztRQUNyRix1RkFBdUY7UUFDdkYsSUFBSSxJQUFJLENBQUN6RixRQUFRLENBQUNTLE1BQU0sSUFBSXBCLFdBQVdxRyxrQkFBa0IsRUFBRSxPQUFPO1FBQ2xFLGlDQUFpQztRQUNqQyxPQUFPO0lBQ1g7SUFFQSxPQUFjQywwQkFBZ0M7UUFDMUMsSUFBSSxDQUFDM0YsUUFBUSxHQUFHLElBQUksQ0FBQ0EsUUFBUSxDQUFDQyxNQUFNLENBQUMsQ0FBQ0MsSUFBTUEsRUFBRUMsTUFBTSxLQUFLO1FBQ3pELElBQUksQ0FBQ2tCLHlCQUF5QjtJQUNsQztJQUVBLE9BQWVtRSxzQkFBbUM7UUFDOUMsTUFBTUksU0FBUyxDQUFDO1FBQ2hCLEtBQUssTUFBTTFFLFdBQVcsSUFBSSxDQUFDbEIsUUFBUSxDQUFFO1lBQ2pDNEYsTUFBTSxDQUFDMUUsUUFBUXFFLElBQUksQ0FBQyxHQUFHLEFBQUNLLENBQUFBLE1BQU0sQ0FBQzFFLFFBQVFxRSxJQUFJLENBQUMsSUFBSSxDQUFBLElBQUs7UUFDekQ7UUFFQSxJQUFJTSxnQkFBb0M7UUFDeEMsSUFBSUMsaUJBQWlCZDtRQUVyQixLQUFLLE1BQU1PLFFBQVFRLE9BQU9DLElBQUksQ0FBQzNHLFdBQVc0RyxZQUFZLEVBQW9CO1lBQ3RFLE1BQU1DLFFBQVFOLE1BQU0sQ0FBQ0wsS0FBSyxJQUFJO1lBQzlCLElBQUlXLFNBQVNKLGdCQUFnQjtZQUU3QkEsaUJBQWlCSTtZQUNqQkwsZ0JBQWdCTjtRQUNwQjtRQUVBLE9BQU9NO0lBQ1g7SUFFQSxhQUFhO0lBRWIsa0JBQWtCO0lBQ2xCLE9BQWM5RCxxQkFBMkI7UUFDckM1QyxNQUFNeUIsa0JBQWtCLENBQUMsSUFBSSxDQUFDdUYsVUFBVSxFQUFFQyxLQUFLQyxTQUFTLENBQUMsSUFBSSxDQUFDOUYsY0FBYztJQUNoRjtJQUVBLE9BQWNTLHFCQUFtQztRQUM3QyxNQUFNc0YsT0FBT25ILE1BQU1RLGtCQUFrQixDQUFDLElBQUksQ0FBQ3dHLFVBQVU7UUFDckQsSUFBSSxDQUFDRyxNQUFNLE9BQU8sRUFBRTtRQUVwQixNQUFNdEcsV0FBV29HLEtBQUtHLEtBQUssQ0FBQ0Q7UUFDNUIsT0FBT3RHO0lBQ1g7SUFDQSxhQUFhO0lBRWIsaUJBQWlCO0lBRWpCLE9BQWNrRCxjQUFjaEMsT0FBbUIsRUFBRTtRQUM3QyxJQUFJQSxRQUFRZixNQUFNLEtBQUssVUFBVTtRQUVqQyxJQUFJLENBQUNxRyxzQkFBc0IsQ0FBQ3RGO1FBQzVCLElBQUksQ0FBQ29CLFlBQVksQ0FBQ3BCLFNBQVM7UUFDM0J1RixjQUFjQyxTQUFTLENBQUMsNkJBQTZCO1lBQUN4RixRQUFRb0QsUUFBUTtTQUFDLEVBQUUzRCxXQUFXdEIsV0FBV3NILDZCQUE2QjtRQUU1SCxNQUFNQyxnQkFBZ0J4SCxhQUFheUgsZ0JBQWdCLENBQUMzRixRQUFRb0QsUUFBUTtRQUNwRWxGLGFBQWEwSCxVQUFVLENBQUNGO0lBQzVCO0lBRUEsT0FBY3ZFLGVBQWVuQixPQUFtQixFQUFFNkYseUJBQWtDLElBQUksRUFBRTtRQUN0RixJQUFJN0YsUUFBUWYsTUFBTSxLQUFLLFVBQVU7UUFFakMsTUFBTWtELFNBQVMsSUFBSSxDQUFDQyxvQkFBb0IsQ0FBQ3BDO1FBQ3pDLElBQUltQyxRQUFRakUsYUFBYTRILE9BQU8sQ0FBQzNEO1FBRWpDakUsYUFBYTZILEtBQUssQ0FBQy9GLFFBQVFvRCxRQUFRO1FBRW5DLElBQUksQ0FBQ2hDLFlBQVksQ0FBQ3BCLFNBQVM7UUFDM0IsSUFBSTZGLHdCQUF3QjtZQUN4Qk4sY0FBY0MsU0FBUyxDQUFDLDJCQUEyQjtnQkFBQ3hGLFFBQVFvRCxRQUFRO2FBQUMsRUFBRTNELFdBQVd0QixXQUFXc0gsNkJBQTZCO1FBQzlIO0lBQ0o7SUFFQSxhQUFhO0lBRWIsc0JBQXNCO0lBRXRCLE9BQWNPLHVCQUF1QmhHLE9BQW1CLEVBQUVpRyxLQUFhLEVBQUU7UUFDckUsSUFBSSxDQUFDQyxhQUFhLENBQUNsRyxTQUFTaUc7UUFFNUIsK0VBQStFO1FBQy9FLElBQUksSUFBSSxDQUFDaEMsY0FBYyxJQUFJLElBQUksQ0FBQ25GLFFBQVEsQ0FBQ29GLElBQUksQ0FBQyxJQUFJLENBQUNDLHdCQUF3QjtJQUMvRTtJQUVBLE9BQWMrQixjQUFjbEcsT0FBbUIsRUFBRWlHLEtBQWEsRUFBRTtRQUM1RCxJQUFJakcsUUFBUWYsTUFBTSxLQUFLLGFBQWFlLFFBQVFmLE1BQU0sS0FBSyxVQUFVO1FBRWpFLDJEQUEyRDtRQUMzRCxJQUFJLElBQUksQ0FBQ1QsWUFBWSxLQUFLLFdBQVcsSUFBSSxDQUFDMkgsZUFBZTtRQUV6RCxJQUFJLENBQUMvRSxZQUFZLENBQUNwQixTQUFTO1FBRTNCdUYsY0FBY0MsU0FBUyxDQUFDLHdDQUF3QztZQUFDeEYsUUFBUW9ELFFBQVE7U0FBQyxFQUFFO1lBQUM2QztTQUFNLEVBQUU5SCxXQUFXaUksdUJBQXVCO1FBRS9ILElBQUksQ0FBQ3RGLHlCQUF5QixDQUFDZDtJQUNuQztJQUVBLE9BQWVjLDBCQUEwQmQsT0FBbUIsRUFBRTtRQUMxRCxNQUFNcUcsUUFBUXZFLFNBQVN3RSxTQUFTLENBQUNuSSxXQUFXb0ksd0JBQXdCLEVBQUVwSSxXQUFXcUksd0JBQXdCO1FBQ3pHLE1BQU1DLE1BQU16SSxPQUFPMEUsVUFBVSxDQUFDLElBQUksQ0FBQ1YsYUFBYSxDQUFDekIsSUFBSSxDQUFDLElBQUksRUFBRVAsVUFBVXFHO1FBQ3RFLElBQUksQ0FBQ0ssY0FBYyxDQUFDMUcsUUFBUW9ELFFBQVEsQ0FBQyxHQUFHcUQ7SUFDNUM7SUFFQSxPQUFjRSx3QkFBd0IzRyxPQUFtQixFQUFFaUcsS0FBeUIsRUFBRTtRQUNsRixNQUFNVyxXQUFXWCxRQUFRO1lBQUNBO1NBQU0sR0FBR3hHO1FBQ25DOEYsY0FBY0MsU0FBUyxDQUNuQiwrQ0FDQTtZQUFDeEYsUUFBUW9ELFFBQVE7U0FBQyxFQUNsQndELFVBQ0F6SSxXQUFXaUksdUJBQXVCO1FBRXRDLElBQUksQ0FBQ2Qsc0JBQXNCLENBQUN0RjtRQUM1QixJQUFJLENBQUNvQixZQUFZLENBQUNwQixTQUFTO0lBQy9CO0lBRUEsT0FBZXNGLHVCQUF1QnRGLE9BQW1CLEVBQUU7UUFDdkQsTUFBTXlHLE1BQU0sSUFBSSxDQUFDQyxjQUFjLENBQUMxRyxRQUFRb0QsUUFBUSxDQUFDO1FBQ2pELElBQUlxRCxRQUFRaEgsV0FBVztRQUN2QnpCLE9BQU82SSxRQUFRLENBQUNKO1FBQ2hCLE9BQU8sSUFBSSxDQUFDQyxjQUFjLENBQUMxRyxRQUFRb0QsUUFBUSxDQUFDO0lBQ2hEO0lBQ0EsYUFBYTtJQUViLHdCQUF3QjtJQUN4QixPQUFjMEQsWUFBWTlHLE9BQW1CLEVBQUVpRyxLQUFhLEVBQUU7UUFDMURWLGNBQWNDLFNBQVMsQ0FBQyx5QkFBeUI7WUFBQ3hGLFFBQVFvRCxRQUFRO1NBQUMsRUFBRTtZQUFDNkM7U0FBTSxFQUFFOUgsV0FBV2lJLHVCQUF1QjtRQUNoSCxJQUFJLENBQUNqRixjQUFjLENBQUNuQjtJQUN4QjtJQUVBLE9BQWMrRyxXQUFXL0csT0FBbUIsRUFBRWlHLEtBQWEsRUFBRTtRQUN6RFYsY0FBY0MsU0FBUyxDQUFDLHdCQUF3QjtZQUFDeEYsUUFBUW9ELFFBQVE7U0FBQyxFQUFFO1lBQUM2QztTQUFNLEVBQUU5SCxXQUFXaUksdUJBQXVCO1FBQy9HLElBQUlwRyxRQUFRZixNQUFNLEtBQUssVUFBVSxJQUFJLENBQUNrQyxjQUFjLENBQUNuQjtRQUNyRCxJQUFJQSxRQUFRZixNQUFNLEtBQUssV0FBVyxJQUFJLENBQUNxRyxzQkFBc0IsQ0FBQ3RGO1FBQzlEOUIsYUFBYThJLG1CQUFtQixDQUFDaEgsUUFBUW9ELFFBQVE7UUFDakQsSUFBSSxDQUFDdEUsUUFBUSxHQUFHLElBQUksQ0FBQ0EsUUFBUSxDQUFDQyxNQUFNLENBQUMsQ0FBQ0MsSUFBTUEsRUFBRW9FLFFBQVEsS0FBS3BELFFBQVFvRCxRQUFRO1FBRTNFLElBQUksQ0FBQ2pELHlCQUF5QjtJQUNsQztJQUVBLE9BQWM4RyxnQkFBZ0JqSCxPQUFtQixFQUFFaUcsS0FBYSxFQUFFO1FBQzlELE1BQU1pQixXQUFXN0ksR0FBRzhJLFVBQVUsQ0FBQ2xCO1FBRS9CLElBQUlpQixTQUFTRSxTQUFTLEVBQUVDLE9BQU9DLFVBQVVELEVBQUUsRUFBRTtZQUN6QzlCLGNBQWNDLFNBQVMsQ0FDbkIscURBQ0E7Z0JBQUN4RixRQUFRb0QsUUFBUTthQUFDLEVBQ2xCO2dCQUFDNkM7YUFBTSxFQUNQOUgsV0FBV2lJLHVCQUF1QjtZQUV0QztRQUNKO1FBRUFiLGNBQWNDLFNBQVMsQ0FBQyxzQ0FBc0M7WUFBQ3hGLFFBQVFvRCxRQUFRO1NBQUMsRUFBRTtZQUFDNkM7U0FBTSxFQUFFOUgsV0FBV2lJLHVCQUF1QjtRQUU3SCxNQUFNakUsU0FBUyxJQUFJLENBQUNDLG9CQUFvQixDQUFDcEM7UUFFekMsSUFBSW1DLFFBQVE7WUFDUixNQUFNb0Ysb0JBQW9CcEYsT0FBT3FGLGVBQWUsQ0FBQztZQUNqRCxJQUFJLENBQUNELG1CQUFtQjtZQUV4QkEsa0JBQWtCRSxrQkFBa0IsQ0FBQ1A7UUFDekMsT0FBTztZQUNIaEosYUFBYXdKLGtCQUFrQixDQUFDUixVQUFVbEgsUUFBUW9ELFFBQVE7UUFDOUQ7SUFDSjtJQUVBLGFBQWE7SUFFYix3QkFBd0I7SUFDeEIsT0FBY3VFLG1CQUFtQjtRQUM3QixLQUFLLE1BQU0zSCxXQUFXLElBQUksQ0FBQ2IsY0FBYyxDQUFFO1lBQ3ZDLElBQUksQ0FBQ2dDLGNBQWMsQ0FBQ25CO1FBQ3hCO1FBRUEsS0FBSyxNQUFNQSxXQUFXLElBQUksQ0FBQ2QsZUFBZSxDQUFFO1lBQ3hDLElBQUksQ0FBQ3lILHVCQUF1QixDQUFDM0csU0FBU1A7UUFDMUM7UUFFQXhCLE1BQU15QixrQkFBa0IsQ0FBQyxJQUFJLENBQUNoQixlQUFlLEVBQUU7UUFFL0M2RyxjQUFjQyxTQUFTLENBQUMsZ0RBQWdEL0YsV0FBV0EsV0FBV3RCLFdBQVdpSSx1QkFBdUI7SUFDcEk7SUFFQSxPQUFjRCxrQkFBa0I7UUFDNUJsSSxNQUFNeUIsa0JBQWtCLENBQUMsSUFBSSxDQUFDaEIsZUFBZSxFQUFFO1FBRS9DNkcsY0FBY0MsU0FBUyxDQUFDLCtDQUErQy9GLFdBQVdBLFdBQVd0QixXQUFXaUksdUJBQXVCO0lBQ25JO0lBRUEsaUNBQWlDO0lBQ2pDLE9BQWVwRCw2QkFBNkJiLE1BQWMsRUFBYztRQUNwRSxNQUFNZSxNQUFNYixZQUFZQyxHQUFHLENBQUNILFFBQVE7UUFDcEMsSUFBSW5DLFVBQVUsSUFBSSxDQUFDbEIsUUFBUSxDQUFDOEksSUFBSSxDQUFDLENBQUM1SSxJQUFNQSxFQUFFb0UsUUFBUSxLQUFLRjtRQUN2RCxJQUFJbEQsU0FBUztZQUNULElBQUksQ0FBQ29CLFlBQVksQ0FBQ3BCLFNBQVM7WUFDM0IsT0FBT0E7UUFDWDtRQUVBQSxVQUFVO1lBQUVvRCxVQUFVRjtZQUFLbUIsTUFBTSxJQUFJLENBQUNDLG1CQUFtQjtZQUFJckYsUUFBUTtZQUFVb0Msa0JBQWtCL0MsS0FBS2dELFdBQVc7UUFBQztRQUNsSCxJQUFJLENBQUN4QyxRQUFRLENBQUNvRixJQUFJLENBQUNsRTtRQUNuQixPQUFPQTtJQUNYO0lBRUEsT0FBZUMsbUJBQW1CRCxPQUFtQixFQUFFO1FBQ25ELDJCQUEyQjtRQUMzQixJQUFJLENBQUM3QixXQUFXNEcsWUFBWSxDQUFDL0UsUUFBUXFFLElBQUksQ0FBQyxFQUFFO1lBQ3hDckUsUUFBUXFFLElBQUksR0FBRyxJQUFJLENBQUNDLG1CQUFtQjtRQUMzQztJQUNKO0lBRUEsT0FBY2xDLHFCQUFxQnBDLE9BQW1CLEVBQUU7UUFDcEQsSUFBSUEsUUFBUWYsTUFBTSxLQUFLLFVBQVUsT0FBTztRQUV4QyxNQUFNNEksV0FBV0MsV0FBV0MsV0FBVyxDQUFDO1lBQUVDLE1BQU07UUFBYztRQUM5RCxLQUFLLE1BQU03RixVQUFVMEYsU0FBVTtZQUMzQixNQUFNM0UsTUFBTWIsWUFBWUMsR0FBRyxDQUFDSCxRQUFRO1lBQ3BDLElBQUllLFFBQVFsRCxRQUFRb0QsUUFBUSxFQUFFLE9BQU9qQjtRQUN6QztRQUNBLE9BQU87SUFDWDtJQUVBLE9BQWNLLHFCQUFxQkwsTUFBYyxFQUFFO1FBQy9DLE1BQU1lLE1BQU1iLFlBQVlDLEdBQUcsQ0FBQ0gsUUFBUTtRQUNwQyxNQUFNbkMsVUFBVSxJQUFJLENBQUNsQixRQUFRLENBQUM4SSxJQUFJLENBQUMsQ0FBQzVJLElBQU1BLEVBQUVvRSxRQUFRLEtBQUtGO1FBQ3pELE9BQU9sRDtJQUNYO0lBRUEsT0FBY2lJLHVCQUF1QjdFLFFBQWdCLEVBQUU7UUFDbkQsTUFBTXBELFVBQVUsSUFBSSxDQUFDbEIsUUFBUSxDQUFDOEksSUFBSSxDQUFDLENBQUM1SSxJQUFNQSxFQUFFb0UsUUFBUSxLQUFLQTtRQUN6RCxPQUFPcEQ7SUFDWDtBQUVKO0FBMVpxQnpCLHFCQUNNMEcsYUFBYTtBQURuQjFHLHFCQUVNRyxrQkFBa0I7QUFGeEJILHFCQUdNSyxvQkFBb0I7QUFIMUJMLHFCQUtITyxXQUF5QixFQUFFO0FBTHhCUCxxQkFlSG1JLGlCQUF5QyxDQUFDO0FBZnZDbkkscUJBeUNGb0IsbUJBQTJCQyxLQUFLQyxHQUFHO0FBekNqQ3RCLHFCQTBDRndCLCtCQUE2QyxFQUFFO0FBMUNsRSxTQUFxQnhCLGtDQTBacEIifQ==