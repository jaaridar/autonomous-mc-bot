class A {
    constructor() {
        this.ok = 1;
    }
    go() {
        this.ok++;
        this.missing.next(2);
        return this.wrap(this.ok);
    }
    wrap(x) { return x; }
    get done() { return this.ok > 0; }
}
