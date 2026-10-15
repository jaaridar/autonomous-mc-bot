import { world, system } from "@minecraft/server";
import { floor, distance } from "../core/math.js";

/**
 * Verdant UI - Scoreboard + Actionbar + Title for spectating
 * Makes it easy to track what bot is doing
 */
export class UI {
    constructor(bot) {
        this.bot = bot;
        this.lastUpdate = 0;
        this.objective = null;
        this.lastReason = "";
        this.lastMission = "";
        this.scoreboardLines = new Map();
        this.initScoreboard();
    }

    initScoreboard() {
        try {
            const sb = world.scoreboard;
            let obj = sb.getObjective("verdant");
            if (!obj) {
                obj = sb.addObjective("verdant", "Verdant Bot");
            }
            this.objective = obj;
            // Set display slot sidebar if not already
            try {
                sb.setObjectiveAtDisplaySlot("sidebar", { objective: obj });
            } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }
        } catch (e) {
            console.warn("[Verdant UI] Scoreboard init failed: " + e);
        }
    }

    tick(tick) {
        if (tick - this.lastUpdate < 20) return; // action bar every 1 sec
        this.lastUpdate = tick;
        try {
            // Scoreboard every 2 sec and only the lines that changed (see below).
            if (tick - (this.lastBoard ?? -1000) >= 40) { this.lastBoard = tick; this.updateScoreboard(tick); }
            this.updateActionBar(tick);
        } catch (e) {
            // Don't crash bot on UI failure
        }
    }

    updateScoreboard(tick) {
        try {
            const b = this.bot;
            const sb = world.scoreboard;
            let obj = this.objective;
            if (!obj || !obj.isValid) {
                this.shown = undefined; // new objective: everything must be written again
                obj = sb.getObjective("verdant");
                if (!obj) obj = sb.addObjective("verdant", "Verdant Bot");
                this.objective = obj;
                try { sb.setObjectiveAtDisplaySlot("sidebar", { objective: obj }); } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }
            }
            if (!obj) return;

            const sim = b.sim;
            const hp = sim.getComponent("minecraft:health")?.currentValue ?? 20;
            const hunger = sim.getComponent("minecraft:player.hunger")?.currentValue ?? 20;
            const pos = floor(sim.location);
            const counts = b.bag.counts();
            const totalItems = Object.values(counts).reduce((a,c)=>a+c,0);
            const freeSlots = b.bag.container.emptySlotsCount;
            const mode = b.mode;
            const state = b.state;
            const stage = b.autonomy?.stage ?? b.speedrun?.stage ?? 0;
            const threat = b.threat;
            const navReason = b.nav?.reason ?? "";
            const mission = b.mission();
            const reason = b.reason;

            // Clear old scores - remove all participants and re-add
            // Instead of clearing all, we update scores for fake players
            const lines = [];

            // Line 1: Mode + State (score 15 highest)
            lines.push({ name: `§aMode: ${mode} [${state}]`, score: 15 });
            // Line 2: Mission truncated to 30 chars
            const missionShort = mission.length > 32 ? mission.slice(0,29)+"..." : mission;
            lines.push({ name: `§e${missionShort}`, score: 14 });
            // Line 3: Reason truncated
            const reasonShort = reason.length > 32 ? reason.slice(0,29)+"..." : reason;
            lines.push({ name: `§f> ${reasonShort}`, score: 13 });
            // Line 4: Health Hunger
            lines.push({ name: `§cHP:${Math.round(hp)} §6Food:${Math.round(hunger)}`, score: 12 });
            // Line 5: Pos
            lines.push({ name: `§7Pos:${pos.x},${pos.y},${pos.z}`, score: 11 });
            // Line 6: Inventory
            lines.push({ name: `§bInv:${totalItems} Free:${freeSlots}/36`, score: 10 });
            // Line 7: Stage
            if (b.mode === "survival" || b.mode === "starter") {
                lines.push({ name: `§dStage:${stage} ${b.autonomy?.branch ?? ""}`.slice(0,32), score: 9 });
            } else if (b.mode === "speedrun") {
                lines.push({ name: `§dPhase:${b.speedrun?.phase} S:${stage}`.slice(0,32), score: 9 });
            } else {
                lines.push({ name: `§dStage:${stage}`, score: 9 });
            }
            // Line 8: Threat
            if (threat) {
                lines.push({ name: `§4! ${threat.typeId.replace("minecraft:","")} ${Math.round(distance(threat.location, sim.location))}b`, score: 8 });
            } else {
                lines.push({ name: `§2Safe: No threat`, score: 8 });
            }
            // Line 9: Navigation
            if (navReason) {
                const navShort = navReason.length > 28 ? navReason.slice(0,25)+"..." : navReason;
                lines.push({ name: `§7Nav:${navShort}`, score: 7 });
            }
            // Line 10: Explorer / Mining
            if (b.mining) {
                const m = b.mining;
                lines.push({ name: `§6Mine:${m.block} x${m.amount} (${m.broken}/${m.amount})`.slice(0,32), score: 6 });
            } else if (b.explorer?.goal) {
                const g = b.explorer.goal;
                lines.push({ name: `§6Explore:${g.x},${g.y},${g.z}`.slice(0,32), score: 6 });
            }
            // Line 11: Equipment
            const hasWeapon = b.equipment?.hasWeapon() ? "Yes" : "No";
            lines.push({ name: `§7Weapon:${hasWeapon} Armor:${b.equipment?.report ? "Y" : "?"}`, score: 5 });
            // Line 12: Structures
            const topStruct = b.structures?.getTopPriority?.();
            if (topStruct) {
                lines.push({ name: `§eStruct:${topStruct.name} P:${topStruct.priority}`.slice(0,32), score: 4 });
            }
            // Line 13: Boat/Escape
            if (b.escaper?.active) {
                lines.push({ name: `§cEsc:${b.escaper.mode} ${b.escaper.lastReason.slice(0,20)}`.slice(0,32), score: 3 });
            }
            // Line 14: Owner distance
            const owner = b.owner();
            if (owner) {
                const d = Math.round(distance(owner.location, sim.location));
                lines.push({ name: `§aOwner:${b.ownerName} ${d}b`, score: 2 });
            }
            // Line 15: Tick
            lines.push({ name: `§8Log:${b.log.length}`, score: 1 });

            // Diff against what THIS bot wrote last time: remove only our
            // vanished lines and write only new/changed ones. The old code
            // listed every participant, removed everything not in this bot's
            // list (including other bots' lines) and re-set all 15 scores -
            // ~30 synced scoreboard writes per bot per second.
            const prev = this.shown ?? new Map();
            const next = new Map();
            for (const line of lines) next.set(line.name, line.score);
            for (const [name] of prev) {
                if (next.has(name)) continue;
                try { obj.removeParticipant(name); } catch { /* already gone */ }
            }
            for (const [name, score] of next) {
                if (prev.get(name) === score) continue;
                try {
                    obj.setScore(name, score);
                } catch (e) {
                    // Try with a sanitised name if the engine rejects the characters
                    try {
                        const safeName = name.replace(/[^a-zA-Z0-9 :.,_-]/g, "").slice(0, 30);
                        obj.setScore(safeName, score);
                    } catch (e) { /* skip this line */ }
                }
            }
            this.shown = next;

        } catch (e) {
            console.warn("[Verdant UI] Scoreboard update failed: " + e.message);
        }
    }

    updateActionBar(tick) {
        try {
            const b = this.bot;
            const owner = b.owner();
            if (!owner) return;

            const hp = b.sim.getComponent("minecraft:health")?.currentValue ?? 20;
            const hunger = b.sim.getComponent("minecraft:player.hunger")?.currentValue ?? 20;
            const mode = b.mode;
            const reason = b.reason;
            const mission = b.mission();

            // Actionbar shows current action + health
            const actionBar = `§a[${mode}] §f${reason} §c♥${Math.round(hp)} §6🍗${Math.round(hunger)}`;

            try {
                owner.onScreenDisplay.setActionBar(actionBar);
            } catch {
                // Fallback to title for older versions
                try {
                    b.sim.dimension.runCommand(`titleraw @a[name="${b.ownerName}"] actionbar {"rawtext":[{"text":"${actionBar.replace(/"/g, '\\"')}"}]}`);
                } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }
            }

            // If reason changed significantly, also tell in chat every 200 ticks for spectating
            if (tick % 200 === 0) {
                const missionChanged = mission !== this.lastMission;
                const reasonChanged = reason !== this.lastReason;
                if (missionChanged || reasonChanged) {
                    this.lastMission = mission;
                    this.lastReason = reason;
                    // Don't spam chat, only if important
                    if (b.mode === "speedrun" || b.mode === "survival") {
                        // b.tell(`Mission: ${mission} | ${reason}`);
                    }
                }
            }

        } catch (e) { console.warn("[Verdant] "+String(e?.message||e).slice(0,300)); }
    }

    // Enhanced status for !bot status command - also show scoreboard
    getDetailedStatus() {
        const b = this.bot;
        const pos = floor(b.sim.location);
        const counts = b.bag.counts();
        const total = Object.values(counts).reduce((a,c)=>a+c,0);
        const owner = b.owner();
        const ownerDist = owner ? Math.round(distance(owner.location, b.sim.location)) : -1;
        const topStruct = b.structures?.getTopPriority?.();
        const awareness = b.awareness?.summary?.() ?? {};

        return {
            mode: b.mode,
            state: b.state,
            mission: b.mission(),
            reason: b.reason,
            pos: `${pos.x},${pos.y},${pos.z}`,
            health: b.sim.getComponent("minecraft:health")?.currentValue ?? 20,
            hunger: b.sim.getComponent("minecraft:player.hunger")?.currentValue ?? 20,
            inventory: `${total} items, ${b.bag.container.emptySlotsCount} free`,
            owner: `${b.ownerName} ${ownerDist >=0 ? ownerDist+"b away" : "offline"}`,
            navigation: b.nav?.reason ?? "none",
            threat: b.threat ? `${b.threat.typeId} ${Math.round(distance(b.threat.location, b.sim.location))}b` : "none",
            mining: b.mining ? `${b.mining.block} ${b.mining.broken}/${b.mining.amount}` : "none",
            stage: b.autonomy?.stage ?? b.speedrun?.stage ?? 0,
            branch: b.autonomy?.branch ?? b.speedrun?.subPhase ?? "",
            structures: topStruct ? `${topStruct.name} P${topStruct.priority}` : "none",
            awareness: awareness,
            escape: b.escaper?.active ? `${b.escaper.mode}: ${b.escaper.lastReason}` : "inactive",
            log: b.log.slice(-5)
        };
    }
}
