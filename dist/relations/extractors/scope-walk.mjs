/** Visit `root` and every node below it like `walk`, handing each visit the parent of its node (see `ParentOf`). The walk did not come through the parent of `root` itself: a caller that starts many walks at the children of one wide node, and knows their parent, passes it as `parentOfRoot` instead of leaving it to `root.parent`. */
export function walkWithParent(root, visitor, parentOfRoot) {
    walkScoped(root, null, (node, _scope, parent) => (visitor(node, parent) === false ? false : undefined), parentOfRoot);
}
export function walkScoped(root, initial, visitor, parentOfRoot = () => root.parent) {
    const cursor = root.walk();
    try {
        // scopes[d] is the scope the nodes at depth d inherit (depth 0 is `root`, which inherits `initial`).
        const scopes = [initial];
        // nodes[d] is the node the walk is at on depth d, so the parent of the node being visited is one read away.
        const nodes = [];
        let depth = 0;
        const parent = () => (depth === 0 ? parentOfRoot() : nodes[depth - 1]);
        for (;;) {
            const node = cursor.currentNode;
            nodes[depth] = node;
            const result = visitor(node, scopes[depth], parent);
            if (result !== false && cursor.gotoFirstChild()) {
                scopes[depth + 1] = result === undefined ? scopes[depth] : result;
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
/**
 * The scope every node of `roots` sees, by node id: `seen(node, inherited)` is the scope the node itself is read in (the identity when absent; a scope that depends on which child of its parent a node is resolves here), and `below(node, seen)` the scope its children inherit (the same one when it returns `undefined`). `skip` names the nodes whose children are left out. A lookup is a constant-time read, however deep the node lies, which is what lets a helper that is handed a node a few levels under the one the walk is at read the same scope a climb from it would have found.
 */
export function indexScopes(roots, initial, below, seen, skip) {
    const index = new Map();
    for (const root of roots) {
        walkScoped(root, initial, (node, inherited) => {
            const own = seen === undefined ? inherited : seen(node, inherited);
            index.set(node.id, own);
            if (skip?.(node) === true)
                return false;
            return below(node, own) ?? (own === inherited ? undefined : own);
        });
    }
    return index;
}
