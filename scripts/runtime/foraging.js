import { TaskFault } from "../core/arbiter.js";
import { center, distance, floor } from "../core/math.js";
import { PREY, RAW_TO_COOKED } from "../core/recipes.js";
import { FOOD } from "../core/world.js";
import { Explorer } from "./exploration.js";
export function allowedPrey(e) {
    return (e.isValid &&
        PREY.has(e.typeId) &&
        !e.nameTag &&
        !e.hasTag("verdant.protected") &&
        !e.getComponent("minecraft:tameable")?.isTamed &&
        !e.hasComponent("minecraft:is_baby"));
}
/** Physical pickup and reach-gated hunting. Never gives/destroys entities via commands. */
export class Forager {
    constructor(sim, bag, terrain, nav) {
        this.sim = sim;
        this.bag = bag;
        this.terrain = terrain;
        this.nav = nav;
        this.targetSince = 0;
        this.lastAttack = 0;
        this.lastSeenLoot = 0;
        this.blocked = new Map();
        this.explorer = new Explorer();
        this.started = 0;
        this.lootWaitUntil = 0;
        this.reason = "";
    }
    reset() {
        this.target = undefined;
        this.started = 0;
        this.lootWaitUntil = 0;
        this.explorer.reset();
    }
    step(tick, home, range, hunting) {
        if (!this.started)
            this.started = tick;
        if (tick - this.started > 6000)
            throw new TaskFault("No accessible food after five minutes. Supply food or move to a different habitat.", "retry");
        const food = this.sim.dimension
            .getEntities({
            type: "minecraft:item",
            location: this.sim.location,
            maxDistance: 12,
        })
            .find((e) => {
            const item = e.getComponent("minecraft:item")?.itemStack;
            return (!!item &&
                (FOOD.has(item.typeId) || !!RAW_TO_COOKED[item.typeId]) &&
                (this.blocked.get(e.id) ?? 0) < tick &&
                this.terrain.safe(e.location));
        });
        if (food) {
            this.reason = "Collecting observed food drops.";
            if (distance(food.location, this.sim.location) < 1.2) {
                this.nav.reset();
                if (!this.lastSeenLoot)
                    this.lastSeenLoot = tick;
                if (tick - this.lastSeenLoot > 60) {
                    this.blocked.set(food.id, tick + 400);
                    this.lastSeenLoot = 0;
                }
                return;
            }
            this.lastSeenLoot = 0;
            if (this.nav.go(center(floor(food.location)), tick) === "failed")
                this.blocked.set(food.id, tick + 400);
            return;
        }
        if (this.target &&
            (!allowedPrey(this.target) ||
                (this.target.getComponent("minecraft:health")?.currentValue ?? 1) <= 0)) {
            this.target = undefined;
            this.lootWaitUntil = tick + 20;
            this.nav.reset();
        }
        if (tick < this.lootWaitUntil) {
            this.reason = "Waiting for native drops.";
            return;
        }
        if (this.target && tick - this.targetSince > 600) {
            this.blocked.set(this.target.id, tick + 1200);
            this.target = undefined;
            this.nav.reset();
        }
        if (!this.target && hunting) {
            this.target = this.sim.dimension
                .getEntities({ location: this.sim.location, maxDistance: 20 })
                .filter((e) => allowedPrey(e) && (this.blocked.get(e.id) ?? 0) < tick)
                .sort((a, b) => distance(a.location, this.sim.location) -
                distance(b.location, this.sim.location))[0];
            this.targetSince = tick;
        }
        if (this.target) {
            const target = this.target;
            this.reason = "Hunting " + target.typeId;
            if (distance(this.sim.location, target.location) > 2.8) {
                if (this.nav.go(target.location, tick) === "failed") {
                    this.blocked.set(target.id, tick + 1200);
                    this.target = undefined;
                }
                return;
            }
            this.nav.reset();
            if (!this.terrain.line(this.sim.getHeadLocation(), target.getHeadLocation())) {
                this.blocked.set(target.id, tick + 200);
                this.target = undefined;
                return;
            }
            if (tick - this.lastAttack >= 10) {
                this.bag.tool("sword") || this.bag.tool("axe");
                this.sim.lookAtEntity(target);
                if (allowedPrey(target))
                    this.sim.attackEntity(target);
                this.lastAttack = tick;
            }
            return;
        }
        this.reason = hunting
            ? "Exploring for reachable food animals/drops."
            : "Exploring for food drops; hunting disabled.";
        if (this.explorer.step(this.sim.location, home, tick, this.terrain, this.nav, range) === "blocked")
            throw new TaskFault("No safe food-search frontier.", "retry");
        if (this.blocked.size > 96)
            this.blocked.delete(this.blocked.keys().next().value);
    }
}
