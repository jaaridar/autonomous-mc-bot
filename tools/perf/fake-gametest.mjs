// Fake of @minecraft/server-gametest for tools/perf.mjs: registration is a no-op.
const chain = new Proxy(function () { }, { get: () => () => chain, apply: () => chain });
export function register() { return chain; }
export default { register };
