import { MolangVariableMap, system } from "@minecraft/server";
import V3 from "Helpers/Vectors/V3";
import { ConfigKey } from "Systems/Config/ConfigRegistry";
import TriggerManager from "./TriggerManager";
export var DebugDrawMode;
(function(DebugDrawMode) {
    /** Do not draw any volume triggers */ DebugDrawMode[DebugDrawMode["No"] = 0] = "No";
    /** Draw only static volume triggers */ DebugDrawMode[DebugDrawMode["OnlyStatic"] = 1] = "OnlyStatic";
    /** Draw only runtime volume triggers */ DebugDrawMode[DebugDrawMode["OnlyRuntime"] = 2] = "OnlyRuntime";
    /** Draw both static and runtime volume triggers */ DebugDrawMode[DebugDrawMode["All"] = 3] = "All";
})(DebugDrawMode || (DebugDrawMode = {}));
class TriggerVolumeDrawer {
    /**
     * Initializes the volume drawer debug visualization.
     * Draws volume outlines every 20 ticks based on config settings.
     */ static init() {
        system.runInterval(()=>this.drawOutlines(), 20);
    }
    /**
     * Determines which volume triggers to visualize and renders them.
     * Filters volumes based on the current debug draw mode configuration.
     * @private
     */ static drawOutlines() {
        const drawMode = Config.get(ConfigKey.DebugDrawVolumeTriggers);
        if (drawMode === 0) return;
        const staticVolumes = drawMode === 1 || drawMode === 3 ? [
            ...TriggerManager.getStaticVolumeTriggers()
        ] : [];
        const runtimeVolumes = drawMode === 2 || drawMode === 3 ? [
            ...TriggerManager.getRuntimeVolumeTriggers()
        ] : [];
        const volumes = [
            ...staticVolumes,
            ...runtimeVolumes
        ];
        for(let i = 0; i < volumes.length; i++){
            const volume = volumes[i];
            // Multiplying by 4 to increase the color variation between volumes,
            // since there can be many volumes in the world and the default color
            // range can look very similar when many volumes are present.
            const color = i * 4 / volumes.length;
            this.drawVolumeOutline(volume.volume, color);
        }
    }
    /**
     * Renders a single volume trigger outline using particle effects.
     *
     * Only renders particles at edges and corners of the volume, and only
     * within configured distance from the nearest player.
     *
     * @param volume - The volume bounds to visualize
     * @param color - Color value (0-1) for the particle tint
     * @private
     */ static drawVolumeOutline(volume, color = 0) {
        const nearestPlayer = EntityUtil.getNearestPlayer(volume.center());
        if (!nearestPlayer) return;
        // Normalize the volume to ensure min/max are correct
        const { min, max } = volume.clean();
        const playerPos = new V3(nearestPlayer.location);
        const distanceToPlayers = Config.get(ConfigKey.DebugDrawVolumeTriggerDistance);
        const halfBlockSize = 0.5;
        const halfBlockColorOffset = 0.2;
        const halfBlockParticleScale = 0.15;
        const fullBlockParticleScale = 0.25;
        for(let x = min.x; x <= max.x; x += halfBlockSize){
            for(let y = min.y; y <= max.y; y += halfBlockSize){
                for(let z = min.z; z <= max.z; z += halfBlockSize){
                    // Calculates the number of axes on which the current position is at the boundary of the volume.
                    // Returns 0 if the position is inside the volume, 1 if on a face, 2 if on an edge, or 3 if at a corner.
                    const atBoundary = [
                        x === min.x || x === max.x,
                        y === min.y || y === max.y,
                        z === min.z || z === max.z
                    ].filter(Boolean).length;
                    if (atBoundary < 2) continue;
                    const pos = new V3(x, y + halfBlockSize, z);
                    if (pos.distance(playerPos) > distanceToPlayers) continue;
                    // Check if any coordinate is at a half step
                    const isHalfStep = x % 1 !== 0 || y % 1 !== 0 || z % 1 !== 0;
                    const molang = new MolangVariableMap();
                    molang.setFloat("variable.color", isHalfStep ? color + halfBlockColorOffset : color);
                    molang.setFloat("variable.scale", isHalfStep ? halfBlockParticleScale : fullBlockParticleScale);
                    this.drawParticle(pos, molang);
                }
            }
        }
    }
    /**
     * Spawns a debug particle at the specified position.
     * @param pos - The world position to spawn the particle
     * @param molang - Optional MolangVariableMap for particle customization (color, scale)
     * @private
     */ static drawParticle(pos, molang) {
        if (molang) overworld.spawnParticle("gm1_sky:static", pos, molang);
        else overworld.spawnParticle("gm1_sky:static", pos);
    }
}
/**
 * Provides debug visualization for volume triggers using particle effects.
 *
 * Draws outlines around trigger volumes based on configuration settings,
 * with color-coded visualization and distance-based rendering optimization.
 *
 * @remarks
 * Controlled by config settings: DebugDrawVolumeTriggers and DebugDrawVolumeTriggerDistance.
 * Particles are only spawned near players to reduce performance impact.
 */ export { TriggerVolumeDrawer as default };

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIlRyaWdnZXJWb2x1bWVEcmF3ZXIudHMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgTW9sYW5nVmFyaWFibGVNYXAsIFZlY3RvcjMsIHN5c3RlbSB9IGZyb20gXCJAbWluZWNyYWZ0L3NlcnZlclwiO1xyXG5pbXBvcnQgVjMgZnJvbSBcIkhlbHBlcnMvVmVjdG9ycy9WM1wiO1xyXG5pbXBvcnQgVm9sdW1lIGZyb20gXCJIZWxwZXJzL1ZlY3RvcnMvVm9sdW1lXCI7XHJcbmltcG9ydCB7IENvbmZpZ0tleSB9IGZyb20gXCJTeXN0ZW1zL0NvbmZpZy9Db25maWdSZWdpc3RyeVwiO1xyXG5pbXBvcnQgVHJpZ2dlck1hbmFnZXIgZnJvbSBcIi4vVHJpZ2dlck1hbmFnZXJcIjtcclxuXHJcbi8qKlxyXG4gKiBDb25maWd1cmF0aW9uIGZvciB3aGljaCB2b2x1bWUgdHJpZ2dlcnMgdG8gdmlzdWFsaXplIGluIGRlYnVnIG1vZGUuXHJcbiAqL1xyXG5leHBvcnQgZW51bSBEZWJ1Z0RyYXdNb2RlIHtcclxuICAgIC8qKiBEbyBub3QgZHJhdyBhbnkgdm9sdW1lIHRyaWdnZXJzICovXHJcbiAgICBObyA9IDAsXHJcbiAgICAvKiogRHJhdyBvbmx5IHN0YXRpYyB2b2x1bWUgdHJpZ2dlcnMgKi9cclxuICAgIE9ubHlTdGF0aWMgPSAxLFxyXG4gICAgLyoqIERyYXcgb25seSBydW50aW1lIHZvbHVtZSB0cmlnZ2VycyAqL1xyXG4gICAgT25seVJ1bnRpbWUgPSAyLFxyXG4gICAgLyoqIERyYXcgYm90aCBzdGF0aWMgYW5kIHJ1bnRpbWUgdm9sdW1lIHRyaWdnZXJzICovXHJcbiAgICBBbGwgPSAzLFxyXG59XHJcblxyXG4vKipcclxuICogUHJvdmlkZXMgZGVidWcgdmlzdWFsaXphdGlvbiBmb3Igdm9sdW1lIHRyaWdnZXJzIHVzaW5nIHBhcnRpY2xlIGVmZmVjdHMuXHJcbiAqXHJcbiAqIERyYXdzIG91dGxpbmVzIGFyb3VuZCB0cmlnZ2VyIHZvbHVtZXMgYmFzZWQgb24gY29uZmlndXJhdGlvbiBzZXR0aW5ncyxcclxuICogd2l0aCBjb2xvci1jb2RlZCB2aXN1YWxpemF0aW9uIGFuZCBkaXN0YW5jZS1iYXNlZCByZW5kZXJpbmcgb3B0aW1pemF0aW9uLlxyXG4gKlxyXG4gKiBAcmVtYXJrc1xyXG4gKiBDb250cm9sbGVkIGJ5IGNvbmZpZyBzZXR0aW5nczogRGVidWdEcmF3Vm9sdW1lVHJpZ2dlcnMgYW5kIERlYnVnRHJhd1ZvbHVtZVRyaWdnZXJEaXN0YW5jZS5cclxuICogUGFydGljbGVzIGFyZSBvbmx5IHNwYXduZWQgbmVhciBwbGF5ZXJzIHRvIHJlZHVjZSBwZXJmb3JtYW5jZSBpbXBhY3QuXHJcbiAqL1xyXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBUcmlnZ2VyVm9sdW1lRHJhd2VyIHtcclxuICAgIC8qKlxyXG4gICAgICogSW5pdGlhbGl6ZXMgdGhlIHZvbHVtZSBkcmF3ZXIgZGVidWcgdmlzdWFsaXphdGlvbi5cclxuICAgICAqIERyYXdzIHZvbHVtZSBvdXRsaW5lcyBldmVyeSAyMCB0aWNrcyBiYXNlZCBvbiBjb25maWcgc2V0dGluZ3MuXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgaW5pdCgpIHtcclxuICAgICAgICBzeXN0ZW0ucnVuSW50ZXJ2YWwoKCkgPT4gdGhpcy5kcmF3T3V0bGluZXMoKSwgMjApO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogRGV0ZXJtaW5lcyB3aGljaCB2b2x1bWUgdHJpZ2dlcnMgdG8gdmlzdWFsaXplIGFuZCByZW5kZXJzIHRoZW0uXHJcbiAgICAgKiBGaWx0ZXJzIHZvbHVtZXMgYmFzZWQgb24gdGhlIGN1cnJlbnQgZGVidWcgZHJhdyBtb2RlIGNvbmZpZ3VyYXRpb24uXHJcbiAgICAgKiBAcHJpdmF0ZVxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIHN0YXRpYyBkcmF3T3V0bGluZXMoKSB7XHJcbiAgICAgICAgY29uc3QgZHJhd01vZGUgPSBDb25maWcuZ2V0KENvbmZpZ0tleS5EZWJ1Z0RyYXdWb2x1bWVUcmlnZ2VycykgYXMgRGVidWdEcmF3TW9kZTtcclxuICAgICAgICBpZiAoZHJhd01vZGUgPT09IERlYnVnRHJhd01vZGUuTm8pIHJldHVybjtcclxuXHJcbiAgICAgICAgY29uc3Qgc3RhdGljVm9sdW1lcyA9XHJcbiAgICAgICAgICAgIGRyYXdNb2RlID09PSBEZWJ1Z0RyYXdNb2RlLk9ubHlTdGF0aWMgfHwgZHJhd01vZGUgPT09IERlYnVnRHJhd01vZGUuQWxsID8gWy4uLlRyaWdnZXJNYW5hZ2VyLmdldFN0YXRpY1ZvbHVtZVRyaWdnZXJzKCldIDogW107XHJcbiAgICAgICAgY29uc3QgcnVudGltZVZvbHVtZXMgPVxyXG4gICAgICAgICAgICBkcmF3TW9kZSA9PT0gRGVidWdEcmF3TW9kZS5Pbmx5UnVudGltZSB8fCBkcmF3TW9kZSA9PT0gRGVidWdEcmF3TW9kZS5BbGwgPyBbLi4uVHJpZ2dlck1hbmFnZXIuZ2V0UnVudGltZVZvbHVtZVRyaWdnZXJzKCldIDogW107XHJcbiAgICAgICAgY29uc3Qgdm9sdW1lcyA9IFsuLi5zdGF0aWNWb2x1bWVzLCAuLi5ydW50aW1lVm9sdW1lc107XHJcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCB2b2x1bWVzLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHZvbHVtZSA9IHZvbHVtZXNbaV07XHJcblxyXG4gICAgICAgICAgICAvLyBNdWx0aXBseWluZyBieSA0IHRvIGluY3JlYXNlIHRoZSBjb2xvciB2YXJpYXRpb24gYmV0d2VlbiB2b2x1bWVzLFxyXG4gICAgICAgICAgICAvLyBzaW5jZSB0aGVyZSBjYW4gYmUgbWFueSB2b2x1bWVzIGluIHRoZSB3b3JsZCBhbmQgdGhlIGRlZmF1bHQgY29sb3JcclxuICAgICAgICAgICAgLy8gcmFuZ2UgY2FuIGxvb2sgdmVyeSBzaW1pbGFyIHdoZW4gbWFueSB2b2x1bWVzIGFyZSBwcmVzZW50LlxyXG4gICAgICAgICAgICBjb25zdCBjb2xvciA9IChpICogNCkgLyB2b2x1bWVzLmxlbmd0aDtcclxuXHJcbiAgICAgICAgICAgIHRoaXMuZHJhd1ZvbHVtZU91dGxpbmUodm9sdW1lLnZvbHVtZSwgY29sb3IpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFJlbmRlcnMgYSBzaW5nbGUgdm9sdW1lIHRyaWdnZXIgb3V0bGluZSB1c2luZyBwYXJ0aWNsZSBlZmZlY3RzLlxyXG4gICAgICpcclxuICAgICAqIE9ubHkgcmVuZGVycyBwYXJ0aWNsZXMgYXQgZWRnZXMgYW5kIGNvcm5lcnMgb2YgdGhlIHZvbHVtZSwgYW5kIG9ubHlcclxuICAgICAqIHdpdGhpbiBjb25maWd1cmVkIGRpc3RhbmNlIGZyb20gdGhlIG5lYXJlc3QgcGxheWVyLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSB2b2x1bWUgLSBUaGUgdm9sdW1lIGJvdW5kcyB0byB2aXN1YWxpemVcclxuICAgICAqIEBwYXJhbSBjb2xvciAtIENvbG9yIHZhbHVlICgwLTEpIGZvciB0aGUgcGFydGljbGUgdGludFxyXG4gICAgICogQHByaXZhdGVcclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBzdGF0aWMgZHJhd1ZvbHVtZU91dGxpbmUodm9sdW1lOiBWb2x1bWUsIGNvbG9yID0gMCkge1xyXG4gICAgICAgIGNvbnN0IG5lYXJlc3RQbGF5ZXIgPSBFbnRpdHlVdGlsLmdldE5lYXJlc3RQbGF5ZXIodm9sdW1lLmNlbnRlcigpKTtcclxuICAgICAgICBpZiAoIW5lYXJlc3RQbGF5ZXIpIHJldHVybjtcclxuXHJcbiAgICAgICAgLy8gTm9ybWFsaXplIHRoZSB2b2x1bWUgdG8gZW5zdXJlIG1pbi9tYXggYXJlIGNvcnJlY3RcclxuICAgICAgICBjb25zdCB7IG1pbiwgbWF4IH0gPSB2b2x1bWUuY2xlYW4oKTtcclxuXHJcbiAgICAgICAgY29uc3QgcGxheWVyUG9zID0gbmV3IFYzKG5lYXJlc3RQbGF5ZXIubG9jYXRpb24pO1xyXG4gICAgICAgIGNvbnN0IGRpc3RhbmNlVG9QbGF5ZXJzID0gQ29uZmlnLmdldChDb25maWdLZXkuRGVidWdEcmF3Vm9sdW1lVHJpZ2dlckRpc3RhbmNlKTtcclxuXHJcbiAgICAgICAgY29uc3QgaGFsZkJsb2NrU2l6ZSA9IDAuNTtcclxuXHJcbiAgICAgICAgY29uc3QgaGFsZkJsb2NrQ29sb3JPZmZzZXQgPSAwLjI7XHJcblxyXG4gICAgICAgIGNvbnN0IGhhbGZCbG9ja1BhcnRpY2xlU2NhbGUgPSAwLjE1O1xyXG4gICAgICAgIGNvbnN0IGZ1bGxCbG9ja1BhcnRpY2xlU2NhbGUgPSAwLjI1O1xyXG5cclxuICAgICAgICBmb3IgKGxldCB4ID0gbWluLng7IHggPD0gbWF4Lng7IHggKz0gaGFsZkJsb2NrU2l6ZSkge1xyXG4gICAgICAgICAgICBmb3IgKGxldCB5ID0gbWluLnk7IHkgPD0gbWF4Lnk7IHkgKz0gaGFsZkJsb2NrU2l6ZSkge1xyXG4gICAgICAgICAgICAgICAgZm9yIChsZXQgeiA9IG1pbi56OyB6IDw9IG1heC56OyB6ICs9IGhhbGZCbG9ja1NpemUpIHtcclxuICAgICAgICAgICAgICAgICAgICAvLyBDYWxjdWxhdGVzIHRoZSBudW1iZXIgb2YgYXhlcyBvbiB3aGljaCB0aGUgY3VycmVudCBwb3NpdGlvbiBpcyBhdCB0aGUgYm91bmRhcnkgb2YgdGhlIHZvbHVtZS5cclxuICAgICAgICAgICAgICAgICAgICAvLyBSZXR1cm5zIDAgaWYgdGhlIHBvc2l0aW9uIGlzIGluc2lkZSB0aGUgdm9sdW1lLCAxIGlmIG9uIGEgZmFjZSwgMiBpZiBvbiBhbiBlZGdlLCBvciAzIGlmIGF0IGEgY29ybmVyLlxyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGF0Qm91bmRhcnkgPSBbeCA9PT0gbWluLnggfHwgeCA9PT0gbWF4LngsIHkgPT09IG1pbi55IHx8IHkgPT09IG1heC55LCB6ID09PSBtaW4ueiB8fCB6ID09PSBtYXguel0uZmlsdGVyKFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBCb29sZWFuXHJcbiAgICAgICAgICAgICAgICAgICAgKS5sZW5ndGg7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIGlmIChhdEJvdW5kYXJ5IDwgMikgY29udGludWU7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHBvcyA9IG5ldyBWMyh4LCB5ICsgaGFsZkJsb2NrU2l6ZSwgeik7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKHBvcy5kaXN0YW5jZShwbGF5ZXJQb3MpID4gZGlzdGFuY2VUb1BsYXllcnMpIGNvbnRpbnVlO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAvLyBDaGVjayBpZiBhbnkgY29vcmRpbmF0ZSBpcyBhdCBhIGhhbGYgc3RlcFxyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGlzSGFsZlN0ZXAgPSB4ICUgMSAhPT0gMCB8fCB5ICUgMSAhPT0gMCB8fCB6ICUgMSAhPT0gMDtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBtb2xhbmcgPSBuZXcgTW9sYW5nVmFyaWFibGVNYXAoKTtcclxuICAgICAgICAgICAgICAgICAgICBtb2xhbmcuc2V0RmxvYXQoXCJ2YXJpYWJsZS5jb2xvclwiLCBpc0hhbGZTdGVwID8gY29sb3IgKyBoYWxmQmxvY2tDb2xvck9mZnNldCA6IGNvbG9yKTtcclxuICAgICAgICAgICAgICAgICAgICBtb2xhbmcuc2V0RmxvYXQoXCJ2YXJpYWJsZS5zY2FsZVwiLCBpc0hhbGZTdGVwID8gaGFsZkJsb2NrUGFydGljbGVTY2FsZSA6IGZ1bGxCbG9ja1BhcnRpY2xlU2NhbGUpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmRyYXdQYXJ0aWNsZShwb3MsIG1vbGFuZyk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBTcGF3bnMgYSBkZWJ1ZyBwYXJ0aWNsZSBhdCB0aGUgc3BlY2lmaWVkIHBvc2l0aW9uLlxyXG4gICAgICogQHBhcmFtIHBvcyAtIFRoZSB3b3JsZCBwb3NpdGlvbiB0byBzcGF3biB0aGUgcGFydGljbGVcclxuICAgICAqIEBwYXJhbSBtb2xhbmcgLSBPcHRpb25hbCBNb2xhbmdWYXJpYWJsZU1hcCBmb3IgcGFydGljbGUgY3VzdG9taXphdGlvbiAoY29sb3IsIHNjYWxlKVxyXG4gICAgICogQHByaXZhdGVcclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBzdGF0aWMgZHJhd1BhcnRpY2xlKHBvczogVmVjdG9yMywgbW9sYW5nPzogTW9sYW5nVmFyaWFibGVNYXApIHtcclxuICAgICAgICBpZiAobW9sYW5nKSBvdmVyd29ybGQuc3Bhd25QYXJ0aWNsZShcImdtMV9za3k6c3RhdGljXCIsIHBvcywgbW9sYW5nKTtcclxuICAgICAgICBlbHNlIG92ZXJ3b3JsZC5zcGF3blBhcnRpY2xlKFwiZ20xX3NreTpzdGF0aWNcIiwgcG9zKTtcclxuICAgIH1cclxufVxyXG4iXSwibmFtZXMiOlsiTW9sYW5nVmFyaWFibGVNYXAiLCJzeXN0ZW0iLCJWMyIsIkNvbmZpZ0tleSIsIlRyaWdnZXJNYW5hZ2VyIiwiRGVidWdEcmF3TW9kZSIsIlRyaWdnZXJWb2x1bWVEcmF3ZXIiLCJpbml0IiwicnVuSW50ZXJ2YWwiLCJkcmF3T3V0bGluZXMiLCJkcmF3TW9kZSIsIkNvbmZpZyIsImdldCIsIkRlYnVnRHJhd1ZvbHVtZVRyaWdnZXJzIiwic3RhdGljVm9sdW1lcyIsImdldFN0YXRpY1ZvbHVtZVRyaWdnZXJzIiwicnVudGltZVZvbHVtZXMiLCJnZXRSdW50aW1lVm9sdW1lVHJpZ2dlcnMiLCJ2b2x1bWVzIiwiaSIsImxlbmd0aCIsInZvbHVtZSIsImNvbG9yIiwiZHJhd1ZvbHVtZU91dGxpbmUiLCJuZWFyZXN0UGxheWVyIiwiRW50aXR5VXRpbCIsImdldE5lYXJlc3RQbGF5ZXIiLCJjZW50ZXIiLCJtaW4iLCJtYXgiLCJjbGVhbiIsInBsYXllclBvcyIsImxvY2F0aW9uIiwiZGlzdGFuY2VUb1BsYXllcnMiLCJEZWJ1Z0RyYXdWb2x1bWVUcmlnZ2VyRGlzdGFuY2UiLCJoYWxmQmxvY2tTaXplIiwiaGFsZkJsb2NrQ29sb3JPZmZzZXQiLCJoYWxmQmxvY2tQYXJ0aWNsZVNjYWxlIiwiZnVsbEJsb2NrUGFydGljbGVTY2FsZSIsIngiLCJ5IiwieiIsImF0Qm91bmRhcnkiLCJmaWx0ZXIiLCJCb29sZWFuIiwicG9zIiwiZGlzdGFuY2UiLCJpc0hhbGZTdGVwIiwibW9sYW5nIiwic2V0RmxvYXQiLCJkcmF3UGFydGljbGUiLCJvdmVyd29ybGQiLCJzcGF3blBhcnRpY2xlIl0sIm1hcHBpbmdzIjoiQUFBQSxTQUFTQSxpQkFBaUIsRUFBV0MsTUFBTSxRQUFRLG9CQUFvQjtBQUN2RSxPQUFPQyxRQUFRLHFCQUFxQjtBQUVwQyxTQUFTQyxTQUFTLFFBQVEsZ0NBQWdDO0FBQzFELE9BQU9DLG9CQUFvQixtQkFBbUI7O1VBS2xDQztJQUNSLG9DQUFvQztJQUVwQyxxQ0FBcUM7SUFFckMsc0NBQXNDO0lBRXRDLGlEQUFpRDtHQVB6Q0Esa0JBQUFBO0FBcUJHLE1BQU1DO0lBQ2pCOzs7S0FHQyxHQUNELE9BQWNDLE9BQU87UUFDakJOLE9BQU9PLFdBQVcsQ0FBQyxJQUFNLElBQUksQ0FBQ0MsWUFBWSxJQUFJO0lBQ2xEO0lBRUE7Ozs7S0FJQyxHQUNELE9BQWVBLGVBQWU7UUFDMUIsTUFBTUMsV0FBV0MsT0FBT0MsR0FBRyxDQUFDVCxVQUFVVSx1QkFBdUI7UUFDN0QsSUFBSUgsZ0JBQStCO1FBRW5DLE1BQU1JLGdCQUNGSixrQkFBeUNBLGlCQUFpQztlQUFJTixlQUFlVyx1QkFBdUI7U0FBRyxHQUFHLEVBQUU7UUFDaEksTUFBTUMsaUJBQ0ZOLGtCQUEwQ0EsaUJBQWlDO2VBQUlOLGVBQWVhLHdCQUF3QjtTQUFHLEdBQUcsRUFBRTtRQUNsSSxNQUFNQyxVQUFVO2VBQUlKO2VBQWtCRTtTQUFlO1FBQ3JELElBQUssSUFBSUcsSUFBSSxHQUFHQSxJQUFJRCxRQUFRRSxNQUFNLEVBQUVELElBQUs7WUFDckMsTUFBTUUsU0FBU0gsT0FBTyxDQUFDQyxFQUFFO1lBRXpC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