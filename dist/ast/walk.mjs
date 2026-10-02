/**
 * Visit `node` and every node below it, depth-first in document order; a visitor that returns `false` skips the children of the node it was given. The traversal moves a tree cursor (first child, next sibling, parent), each step constant time, so the walk is linear in the number of nodes: `node.child(i)` counts from the first child on every call, which made a node with tens of thousands of direct children (the ERROR node a binary or foreign file parses into) cost the square of that number.
 */
export function walk(node, visitor) {
    const cursor = node.walk();
    try {
        // Depth below `node`, so the walk never steps onto a sibling or the parent of the node it was given.
        let depth = 0;
        for (;;) {
            if (visitor(cursor.currentNode) !== false && cursor.gotoFirstChild()) {
                depth++;
                continue;
            }
            while (depth > 0 && !cursor.gotoNextSibling()) {
                cursor.gotoParent();
                depth--;
            }
            if (depth === 0)
                return;
        }
    }
    finally {
        cursor.delete();
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
