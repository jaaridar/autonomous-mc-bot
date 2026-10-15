/** Move existing items; no output is fabricated. Synchronous rollback, not crash-atomic. */
export function transfer(from, slot, to, target, amount) {
    if (from === to && slot === target)
        throw Error("Same transfer slot.");
    const a = from.get(slot), b = to.get(target);
    if (!a || !Number.isInteger(amount) || amount < 1 || amount > a.amount)
        throw Error("Invalid transfer amount.");
    if (b && (!to.stackable(a, b) || b.amount + amount > b.maxAmount))
        throw Error("Destination cannot accept stack.");
    if (!b && amount > a.maxAmount)
        throw Error("Destination capacity exceeded.");
    const nextA = a.amount === amount ? undefined : from.clone(a, a.amount - amount);
    const nextB = b ? to.clone(b, b.amount + amount) : to.clone(a, amount);
    try {
        from.set(slot, nextA);
        to.set(target, nextB);
    }
    catch (error) {
        let failed = false;
        try {
            from.set(slot, a);
        }
        catch {
            failed = true;
        }
        try {
            to.set(target, b);
        }
        catch {
            failed = true;
        }
        if (failed)
            throw Error("CRITICAL transfer rollback failure; stop and inspect both inventories.");
        throw error;
    }
}
export function destination(inv, item, amount) {
    for (let i = 0; i < inv.size; i++) {
        const s = inv.get(i);
        if (s && inv.stackable(s, item) && s.amount + amount <= s.maxAmount)
            return i;
    }
    for (let i = 0; i < inv.size; i++)
        if (!inv.get(i))
            return i;
    return -1;
}
