import { floor } from "./math.js";
export function f(p, cb) {
    const r = horizontal(p, { x: 0 });
    cb(r);
    return floor(p);
}
