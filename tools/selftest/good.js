import { floor, horizontal } from "./math.js";
class A {
    fold(m, tick) {
        return this.wrap(m, tick);
    }
    wrap(m, tick) {
        return m + tick;
    }
    get done() { return horizontal({ x: 0, z: 0 }, { x: 1, z: 1 }) > 2; }
    async sweep(q) {
        const g = (type, pos) => floor(pos);
        return g(1, 2) + floor(q);
    }
}
export function f(p, cb) {
    cb(p);
    return floor(horizontal(p, new A().sweep(p)));
}
