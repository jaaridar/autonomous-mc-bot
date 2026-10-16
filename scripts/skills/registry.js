// Skill registry: what the bot can do, in a fixed order.
//
// Registration order is deterministic (explicit list in ./index.js, then sorted
// by id inside a category) so two runs of the same world pick the same skill.
// The registry is pure: it holds definitions and answers questions about them.

import { CATEGORIES, STATUS } from "./contract.js";

export class SkillRegistry {
    constructor() {
        this.byId = new Map();
        this.order = [];
    }
    add(skill) {
        if (this.byId.has(skill.id))
            throw new Error(`duplicate skill id '${skill.id}'`);
        this.byId.set(skill.id, skill);
        this.order.push(skill);
        return skill;
    }
    addAll(skills) {
        for (const skill of skills)
            this.add(skill);
        return this;
    }
    get(id) { return this.byId.get(id); }
    has(id) { return this.byId.has(id); }
    get size() { return this.byId.size; }
    all() { return [...this.order]; }
    byCategory(category) { return this.order.filter((s) => s.category === category); }
    /** Skills matching a tag or id fragment, for `!bot skill list <query>`. */
    search(query) {
        const q = String(query ?? "").toLowerCase();
        if (!q)
            return this.all();
        return this.order.filter((s) => s.id.toLowerCase().includes(q) || s.tags.some((t) => t.toLowerCase().includes(q)));
    }
    /**
     * Every skill whose hard `requires` passes against this context. `requires`
     * must be cheap: it runs for the whole catalog on candidate ticks.
     */
    viable(ctx) {
        const out = [];
        for (const skill of this.order) {
            let ok = false;
            try { ok = !!skill.requires(ctx); }
            catch (e) { ok = false; }
            if (ok)
                out.push(skill);
        }
        return out;
    }
    categories() {
        return CATEGORIES.map((category) => ({
            category,
            count: this.byCategory(category).length,
        })).filter((x) => x.count > 0);
    }
    /** Integrity check used by the offline gate and by `!bot skill verify`. */
    validate() {
        const problems = [];
        for (const skill of this.order) {
            if (!skill.id.includes("."))
                problems.push(`${skill.id}: id should be '<category>.<name>'`);
            if (skill.id.split(".")[0] !== skill.category)
                problems.push(`${skill.id}: id prefix does not match category '${skill.category}'`);
            if (!(skill.budget > 0))
                problems.push(`${skill.id}: budget must be positive`);
            if (!(skill.cost > 0))
                problems.push(`${skill.id}: cost must be positive`);
            if (typeof skill.run !== "function")
                problems.push(`${skill.id}: no run()`);
            if (typeof skill.plan !== "function")
                problems.push(`${skill.id}: no plan()`);
            if (typeof skill.verify !== "function")
                problems.push(`${skill.id}: no verify()`);
        }
        return problems;
    }
    describe() {
        return this.order.map((s) => ({
            id: s.id,
            category: s.category,
            priority: s.priority,
            budget: s.budget,
            tags: s.tags,
        }));
    }
}

export { STATUS };
