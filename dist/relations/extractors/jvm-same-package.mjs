/**
 * The ordered candidates for one simple name written without an import, in the file's package, or undefined when the name means something else there: a type the file declares, or an import that names it (that import's own hint gives the edge). The caller has already ruled out a type parameter in scope. The candidates are, in order: for each enclosing declaration whose body holds the use (innermost first) and each of its supertypes, the member type the supertype may inherit (`<Super>+<Name>`, which binds only when the supertype is in the repository and declares it), then `<package>.<Name>` through the shared JVM namespace. A package type beats an on-demand import and the default imports, as in both languages. `supertypeLists` holds, innermost first, the supertype names (simple or dotted) of each such declaration.
 */
export function samePackageGroup(scope, name, supertypeLists) {
    if (scope.declared.has(name) || scope.imports.has(name) || scope.importedOther.has(name))
        return undefined;
    const out = [];
    const seenKeys = new Set();
    const add = (symbolKey, samePackage) => {
        if (seenKeys.has(symbolKey))
            return;
        seenKeys.add(symbolKey);
        out.push(samePackage ? { kind: 'symbol', symbolKey, samePackage: true } : { kind: 'symbol', symbolKey });
    };
    for (const supers of supertypeLists) {
        for (const sup of supers) {
            if (sup.includes('.')) {
                add(`${sup}+${name}`, false);
                continue;
            }
            if (scope.declared.has(sup))
                continue;
            const imported = scope.imports.get(sup);
            if (imported !== undefined) {
                add(`${imported}+${name}`, false);
                continue;
            }
            add(`${scope.pkg}.${sup}+${name}`, true);
            for (const p of scope.onDemand)
                add(`${p}.${sup}+${name}`, false);
        }
    }
    add(`${scope.pkg}.${name}`, true);
    return out;
}
/** True for a name written with a capital first letter, the form of a type name in an expression. */
export function isCapitalised(name) {
    return /^\p{Lu}/u.test(name);
}
