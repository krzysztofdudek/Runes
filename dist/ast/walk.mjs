export function walk(node, visitor) {
    const result = visitor(node);
    if (result === false)
        return;
    for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child !== null)
            walk(child, visitor);
    }
}
export function closest(node, types) {
    const typeSet = typeof types === 'string' ? new Set([types]) : new Set(types);
    let cur = node.parent;
    while (cur !== null) {
        if (typeSet.has(cur.type))
            return cur;
        cur = cur.parent;
    }
    return null;
}
