import { walkScoped } from './scope-walk.mjs';
import { single } from './types.mjs';
import { RUST_MODULES_KNOWN_KEY, rustExternBindingKey, rustExternNameKey, rustConditionalGlobKey, rustGlobKey, rustModuleFileKey, rustModuleKey, rustInlinePathModuleKey, rustPathModuleKey, rustPathModuleNameKey, rustTopLevelItemKey } from './rust-resolve.mjs';
/**
 * Rust dependency extractor.
 *
 * v1 scope = EXISTENCE, not relation type. The unit of an inter-component edge in
 * Rust is the `use` IMPORT: a file brings a path from another module into scope with
 * a `use_declaration`. A dependency edge is therefore established ONLY by a `use`
 * declaration. Usage-site nodes (trait impls, supertrait bounds, fully-qualified
 * calls, type references, struct-literal construction) would only REFINE the
 * relation TYPE of an already-importable target, and v1 does not enforce relation
 * type — so this extractor performs NO usage-site refinement. It emits one path
 * hint per imported path whose specifier is the crate-relative `::`-joined path
 * (e.g. `crate::orders::Order`, `super::util::X`, `self::y`). The resolver
 * (`rust-resolve.ts`) maps that path → a `.rs` file through the crate module tree.
 *
 * GROUPED imports: every item of a use tree is resolved ON ITS OWN, joined to the
 * accumulated prefix. `use crate::{billing::Invoice, orders::Order}` emits
 * `crate::billing::Invoice` and `crate::orders::Order` — two modules, two edges — and
 * `use a::b::{C, D}` emits `a::b::C` and `a::b::D`, which the resolver's longest-match
 * walk binds to the same module file when C and D are items of `a::b` (a same-line
 * duplicate edge collapses downstream). The group prefix alone is never the target of an
 * item that names a deeper path: binding `crate::domain::{billing::X}` to module `domain`
 * would point the edge at the parent node. A `self` item means the prefix module itself
 * and emits the prefix. A nested `scoped_use_list` (`use a::{b::{C}}`) recurses with the
 * deeper prefix.
 *
 * INLINE MODULES are a level of the module tree. Inside `mod tests { … }`, `super` names
 * the module that encloses `tests` (the FILE's own module), not the file module's parent,
 * and `self` names `tests`. Every `self`/`super`-rooted specifier — and a file-backed
 * `mod x;` — emitted from inside inline modules is therefore rebased before it leaves the
 * extractor: each leading `super` first pops one enclosing inline module, and what is left
 * of the inline chain is spliced in after `self` (`mod outer { mod inner; }` →
 * `self::outer::inner`, whose file is `<module dir>/outer/inner.rs`). Only when there are
 * more `super`s than enclosing inline modules does the remainder climb from the file's
 * module. A `#[path]` attribute on an enclosing inline module moves its directory in ways a
 * source-only walk cannot pin, so relative specifiers under one are silenced.
 *
 * RAW IDENTIFIERS: `r#gen` is the identifier `gen` (edition 2024 reserves `gen`, and
 * `cargo fix` rewrites it to `r#gen`). The `r#` prefix is stripped from every segment so
 * `mod r#gen;` and `crate::r#gen::X` probe `gen.rs`, the file rustc loads.
 *
 * EXTERN CRATE: `extern crate name [as alias];` emits `extern::name`, also in a branch of a
 * `cfg_if!` among a module's items, where it binds its name as one outside the macro does. `extern` is a keyword, so
 * no path of the source starts with it: the form says the path names a crate for certain,
 * which in edition 2015 no `use` path does. The resolver binds it only when `name` is an
 * in-repo path dependency of the importing crate or the package's own library; `std`,
 * registry crates and `extern crate self` stay silent. The declaration binds its name (the
 * alias, else the crate) in the module or block that writes it, and nowhere else. A `use`
 * declaration of that same scope whose path starts with the bound name is therefore emitted as
 * `extern::name::as::bound::…`: the crate, and the path as written, which is what an edition
 * 2015 crate reads instead. A `use` in a function body or a block of that scope sees the
 * name too, unless a module or another `use` of a nearer scope binds it; a `use` in an inline
 * module is another module and is emitted as written. For the crate root, whose `extern crate` names
 * reach every module of the crate, `declarations()` records which crate each name stands for.
 *
 * NAMES IN SCOPE: from edition 2018 a `use` path may start with a name in scope where it is
 * written: a module that module declares, or a name another `use` in scope bound. Such a path
 * is emitted as `use::<n>::<the n segments the name stands for>::<the path as written>`
 * (`mod shapes; use shapes::Circle;` → `use::2::self::shapes::shapes::Circle`). `use` is a
 * keyword, so no path of the source starts with it. Edition 2015 reads the path as written.
 *
 * LEADING `::`: `use ::a::X;` is emitted as `a::X`, and never as a name in scope. That is what
 * it means in both readings: the crate root's `a` in edition 2015, where every `use` path
 * starts at the root, and the crate `a` from edition 2018 on, where a bare first segment that
 * the extractor left as written names a crate.
 *
 * GLOB (`use a::b::*`) emits the prefix module `a::b`. RENAMED (`use a::b as c`)
 * strips the alias and emits the real path `a::b`. `pub use` (re-export) is
 * structurally a plain `use` carrying a `visibility_modifier`; the edge is
 * identical, so it is emitted the same way (keyed off the `argument` field, never
 * a child index, so the leading `pub` token does not shift anything).
 *
 * MACROS are invisible: a path appearing inside a `macro_invocation` token_tree is
 * unparsed tokens, never a `use_declaration`, so macro-generated deps are never
 * emitted (the `mod` declarations of a `cfg_if!` aside, see below). EXTERNAL crates (std, serde, …) emit a path hint too, but the resolver
 * returns undefined for any path whose root is not `crate`/`super`/`self` (and not
 * the current crate's own name or an in-repository path dependency) — so they never become a violation.
 *
 * MODULE DECLARATIONS: a file-backed `mod foo;` (a `mod_item` with NO body) declares that
 * submodule `foo` lives in `foo.rs` / `foo/mod.rs` beside the current file's module — a real
 * intra-crate file dependency that crosses a node boundary when that file is mapped to another
 * node. It is emitted as the relative path `self::foo`, which the resolver maps through the
 * module tree exactly like any `self::` import. A `#[path = "…"]` attribute OVERRIDES the
 * conventional location. On a `mod` among the items of the file, outside every inline module,
 * the attribute's path is relative to the directory of the file that writes it, so such a `mod`
 * is emitted as `mod::<that path, normalized>` (`mod::../data/orphan.rs`), which the resolver
 * binds to that file when it exists. `mod` is a keyword, so no path of the source starts with
 * it. Inside an inline module, and under one that carries a `#[path]` itself, the directory the
 * path starts from depends on nesting rules a source-only walk cannot always pin, so such a
 * `mod` is SKIPPED (silence) rather than risk binding the wrong file. An INLINE `mod foo { … }` (with a body)
 * declares no separate file — its contents are walked in place (its own `use`/paths are
 * caught), and the `mod` itself emits nothing.
 *
 * `cfg_if!`: its body is tokens to the grammar, so a `mod x;` in a branch is read from them
 * (`cfgIfModules`). Each branch is the crate's on some target, so every file-backed `mod` of
 * every branch is emitted, from the line of its `mod`, under the rules it follows outside the
 * macro: inside an inline `mod y { … }` written there it is `self::y::x`, and with a `#[path]`
 * attribute on it or on such an inline module it is skipped. Only a `cfg_if!` that stands
 * among the items of a module is read. The modules its branches declare, with or without a body,
 * and the names the `use` declarations there bind are names in scope of that module (NAMES IN
 * SCOPE), as they are written outside the macro, and a glob `use` there may bind any name; the
 * `use` declarations of a branch are not emitted themselves.
 *
 * INLINE PATHS: a fully-qualified path used WITHOUT a `use` — in TYPE position
 * (`field: crate::orders::Order`, `impl crate::traits::T`) a `scoped_type_identifier`, in
 * EXPRESSION position (`crate::logging::Logger::new()`, a `crate::m::macro!()` call) a
 * `scoped_identifier` — is emitted when its ROOT segment is `crate` / `self` / `super`. Those
 * three roots are absolute-within-crate or relative-to-module markers: the path is shadow-free
 * and resolves deterministically through the module tree, so detection is zero false positives.
 * A path rooted at a BARE lowercase identifier (`datacrate::dc()`, `kit::Engine`) names what
 * that name is bound to where the path stands: a name a `use` in scope brought in, a module, an
 * item of the type namespace or an `extern crate` of a block around it or of its module, and
 * failing those a crate of the extern prelude, in every edition. The scopes are read as for a
 * `use` path (NAMES IN SCOPE) and an outer module is not one of them. Where none binds the name,
 * the path is emitted as `in::<the path>` (`in` is a keyword, so no path of the source starts
 * with it), which the resolver binds to a path dependency or the package's own library and to
 * nothing for `std` or a registry crate. Where one binds it, or a glob `use` there may, nothing
 * is emitted: a local module shadows a crate of its name, and a guess would be a false edge.
 * A capitalised first name, `Self` and a primitive type (`u32::MAX`) name a type, a path that
 * starts with `::` starts at the crate root in edition 2015, and a tool's attribute
 * (`#[rustfmt::skip]`) names no crate: none of them is emitted. Only the OUTERMOST scoped node
 * of a chain is read (it carries the complete path); the inner `path` segments are skipped.
 */
/**
 * Render a path-prefix node (`scoped_identifier` | `crate` | `super` | `self` |
 * `identifier`) as a `::`-joined specifier by walking the left-recursive `path`
 * chain down to the leftmost leaf and joining the segment texts in source order.
 *
 * `scoped_identifier` nests via field `path` (the prefix) and field `name` (the
 * final segment). The leftmost leaf is a `crate` / `super` / `self` / `identifier`
 * keyword-or-name node; its `.text` is the first segment. Returns undefined when
 * the structure is unexpected (malformed / error nodes) — silence over a guess. A path that
 * starts with `::` is rendered without it; a `use` knows it from its argument's text.
 */
function pathText(node) {
    const segments = [];
    let cur = node;
    // Descend the `path` chain, collecting the `name` segment at each scoped level.
    while (cur !== null && cur.type === 'scoped_identifier') {
        const nameNode = cur.childForFieldName('name');
        if (nameNode === null)
            return undefined;
        segments.unshift(nameNode.text);
        cur = cur.childForFieldName('path');
    }
    // `cur` is now the leftmost leaf: crate | super | self | identifier, or null for a path
    // that starts with `::` (`::shapes::Circle`), whose first scoped_identifier has no `path`.
    if (cur === null)
        return segments.join('::');
    if (cur.type === 'crate' ||
        cur.type === 'super' ||
        cur.type === 'self' ||
        cur.type === 'identifier') {
        segments.unshift(cur.text);
    }
    else {
        return undefined;
    }
    return segments.length > 0 ? segments.join('::') : undefined;
}
/** The prefix node of a `scoped_use_list` / `use_wildcard`: the path before the
 *  `{ … }` list or the `*`. It is a named child that is one of the path-shaped
 *  node types; the trailing `use_list` is excluded. Returns undefined when absent. */
function prefixNode(parent) {
    for (const c of parent.namedChildren) {
        if (c === null)
            continue;
        if (c.type === 'scoped_identifier' ||
            c.type === 'crate' ||
            c.type === 'super' ||
            c.type === 'self' ||
            c.type === 'identifier') {
            return c;
        }
    }
    return null;
}
/** The `::`-joined text of a `scoped_type_identifier` (`crate::orders::Order`, `kit::Engine`): its `path`
 *  field (a scoped_identifier, a crate/self/super leaf or a bare identifier) joined to its `name` type_identifier.
 *  Returns undefined when the path field is a type (`Outer::Inner` with `Outer` a type identifier, a generic type)
 *  or structurally unexpected. */
function scopedTypePathText(node) {
    const pathNode = node.childForFieldName('path');
    const nameNode = node.childForFieldName('name');
    if (pathNode === null || nameNode === null)
        return undefined;
    const prefix = pathNode.type === 'scoped_identifier' ? pathText(pathNode) : pathNode.type === 'identifier' ? pathNode.text : leafRoot(pathNode);
    if (prefix === undefined)
        return undefined;
    return `${prefix}::${nameNode.text}`;
}
/** The text of a path-ROOT leaf node, but ONLY for the crate-relative roots
 *  (`crate` / `super` / `self`). Any other leaf (a bare `identifier`, a `type_identifier`)
 *  returns undefined so a non-crate-rooted path is not built. */
function leafRoot(node) {
    if (node.type === 'crate' || node.type === 'super' || node.type === 'self')
        return node.text;
    return undefined;
}
/** True when the `::`-path's root segment is a crate-relative marker (`crate`/`self`/`super`),
 *  which no name in scope can shadow. */
function isCrateRelativeRoot(specifier) {
    const root = specifier.split('::', 1)[0];
    return root === 'crate' || root === 'self' || root === 'super';
}
/** Strip the raw-identifier prefix `r#` from one path segment (`r#gen` → `gen`). */
function unraw(segment) {
    return segment.startsWith('r#') ? segment.slice(2) : segment;
}
/** Strip `r#` from every `::` segment of a specifier. */
function unrawPath(specifier) {
    return specifier.split('::').map(unraw).join('::');
}
/** The enclosing inline modules as the names of the chain, outermost first. */
function inlineModChain(scope) {
    const names = [];
    for (let m = scope; m !== null; m = m.outer)
        names.push(m.name);
    names.reverse();
    return { names, unpinned: scope?.unpinned ?? false };
}
/**
 * Rebase a `self`/`super`-rooted specifier emitted from inside the (non-empty) inline
 * modules `names` (outermost first) so it reads relative to the FILE's module, which is what
 * the resolver anchors on. Each leading `super` pops one inline module; the inline modules
 * left over are spliced in after `self`; any `super`s beyond the inline depth climb from the
 * file's module.
 */
function rebaseForInlineMods(specifier, names) {
    const segs = specifier.split('::');
    if (segs[0] === 'self')
        return ['self', ...names, ...segs.slice(1)].join('::');
    let supers = 0;
    while (supers < segs.length && segs[supers] === 'super')
        supers++;
    const rest = segs.slice(supers);
    if (supers <= names.length) {
        return ['self', ...names.slice(0, names.length - supers), ...rest].join('::');
    }
    return [...new Array(supers - names.length).fill('super'), ...rest].join('::');
}
/** True when a `#[path = "…"]` attribute in front of `modItem` overrides its conventional file location. Attributes parse as preceding `attribute_item` siblings; doc comments, comments and other attributes may stand between the attribute and the `mod`, in any order. */
function modHasPathOverride(modItem) {
    return attributesBefore(modItem).some((item) => {
        const id = item.namedChild(0)?.namedChild(0) ?? null;
        return id !== null && id.type === 'identifier' && id.text === 'path';
    });
}
function uses(file) {
    const out = [];
    const seen = new Set();
    // The inline modules around the node being visited, carried down the walk.
    let mods = null;
    // The blocks and item lists around the node being visited, innermost first, carried down the walk.
    let lexical = null;
    // The scopes around the node being visited, by depth: `chain[d]` is the one of depth `d`, for every `d` up to the depth of `lexical`. A deeper entry is a scope the walk has left.
    const chain = [];
    const onChain = (scope) => scope.depth <= (lexical?.depth ?? -1) && chain[scope.depth] === scope;
    // For each name, the scopes around the node being visited whose items bind it in one way, outermost first, one index per way a lookup below reads: each lookup jumps to the scopes that bind its name instead of walking every block around the node, which costs the square of the depth of the file. A scope the walk has left is dropped from the end of a list when the list is next read or added to.
    const byName = () => new Map();
    const usesNamed = byName(); // the names `scopeNames` reads: modules, and the names `use` declarations bind
    const externsNamed = byName(); // those, the crates an `extern crate` binds and the items of the type namespace
    const boundNamed = byName(); // those, and the names of every `extern crate`
    const itemsNamed = byName(); // the items of the type namespace
    const enter = (index, names, scope) => {
        for (const name of new Set(names)) {
            const list = index.get(name);
            if (list === undefined) {
                index.set(name, [scope]);
                continue;
            }
            while (list.length > 0 && !(list[list.length - 1].depth < scope.depth && chain[list[list.length - 1].depth] === list[list.length - 1]))
                list.pop();
            list.push(scope);
        }
    };
    /** The scope a block, the body of a module, an `impl` or a trait, or the file makes for what stands in it, with what its own items bind, entered in the indexes. */
    const scopeOf = (node, module, outer) => {
        const names = scopeNames(node, module);
        const externCrates = externCratesIn(node);
        const externs = new Map(externCrates.flatMap((e) => (e.crate === undefined ? [] : [[e.name, e.crate]])));
        const { items, glob } = scopeTypeNames(node);
        const depth = outer === null ? 0 : outer.depth + 1;
        const scope = { node, module, outer, depth, moduleDepth: module || outer === null ? depth : outer.moduleDepth, glob: glob || (!module && (outer?.glob ?? false)), names, externs, items };
        chain[depth] = scope;
        enter(usesNamed, names.keys(), scope);
        enter(externsNamed, [...externs.keys(), ...names.keys(), ...items], scope);
        enter(boundNamed, [...externCrates.map((e) => e.name), ...names.keys(), ...items], scope);
        enter(itemsNamed, items, scope);
        return scope;
    };
    /** The innermost scope of `index` that binds `name`, from `from` outward to the module around it, for which `accept` holds. */
    const nearest = (index, name, from, accept = () => true) => {
        const list = index.get(name);
        if (from === null || list === undefined)
            return undefined;
        while (list.length > 0 && !onChain(list[list.length - 1]))
            list.pop();
        // The list is a chain of scopes, each inside the one before, so the depths rise along it: the last at most as deep as `from` is the innermost around it.
        let lo = 0;
        let hi = list.length;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (list[mid].depth <= from.depth)
                lo = mid + 1;
            else
                hi = mid;
        }
        for (let i = lo - 1; i >= 0 && list[i].depth >= from.moduleDepth; i--)
            if (accept(list[i]))
                return list[i];
        return undefined;
    };
    // While a `use` declaration is read: the declaration, whose scope's names its path may start with.
    let useDecl = null;
    // Whether that declaration's path starts with `::`: the crate root in edition 2015, a crate from edition 2018 on, and in neither a name in scope.
    let useFromRoot = false;
    /** The path the first segment `name` of a `use` path written in `decl` stands for, when a name in scope there says so: a module the module around it declares (`self::<name>`), or the path another `use` in scope bound to that name. The scopes are the blocks around the declaration, outward, and the module around them; a name of an outer module is not in scope. Undefined when no such name is found, or the `use` declarations found disagree. */
    const inScope = (name, decl, from) => {
        const others = (scope) => (scope.names.get(name) ?? []).filter((n) => n.decl?.id !== decl.id);
        // Only the scope that holds `decl` can bind the name through `decl` alone, so this passes over one scope at most.
        const scope = nearest(usesNamed, name, from, (s) => others(s).length > 0);
        if (scope === undefined)
            return undefined;
        const found = others(scope);
        const one = found.find((n) => n.decl === null) ?? (found.every((n) => n.path === found[0].path) ? found[0] : undefined);
        return one === undefined ? undefined : { name: one, scope };
    };
    /** A `use` path of `decl` with its first segment replaced by what that name stands for in scope, again and again while the path starts with such a name (`use crate::a; use a::b; use b::C;`). A path that starts with `crate`, `self` or `super`, or with a name nothing in scope binds, is returned as it is. */
    const inScopePath = (specifier, decl, scope) => {
        let path = specifier;
        let from = decl;
        let within = scope;
        for (let step = 0; step < 8; step++) {
            const [first, ...rest] = path.split('::');
            if (first === 'crate' || first === 'self' || first === 'super')
                return path;
            const found = inScope(first, from, within);
            if (found === undefined)
                return path;
            path = [found.name.path, ...rest].join('::');
            if (found.name.decl === null)
                return path;
            // The path a `use` bound is read where that `use` stands.
            from = found.name.decl;
            within = found.scope;
        }
        return specifier;
    };
    /** The crate an `extern crate` declaration binds as `name` where `decl`, a `use` declaration, stands: the declaration's own scope, then the blocks around it, outward, and the module around them, the first that binds `name` deciding. A scope where another `use`, a module or another item of the type namespace binds the name hides a declaration farther out, and an outer module is not in scope. */
    const externCrateFor = (name, decl, from) => {
        // A scope that binds the name only through `decl` itself hides nothing; only the scope that holds `decl` can, so this passes over one scope at most.
        const scope = nearest(externsNamed, name, from, (s) => s.externs.has(name) || s.items.has(name) || (s.names.get(name) ?? []).some((n) => n.decl?.id !== decl.id));
        return scope?.externs.get(name);
    };
    /** True when a block around `from`, before the module that holds it, declares an item of the type namespace named `name` (a `mod` in a function body): a `use` path that starts with it names that item, which sits in this file, and no crate, module file or other file. */
    const blockItemNamed = (name, from) => {
        const scope = nearest(itemsNamed, name, from);
        return scope !== undefined && !scope.module;
    };
    const emit = (raw, node) => {
        if (raw === undefined || raw === '')
            return;
        const written = unrawPath(raw);
        let specifier = written;
        const root = specifier.split('::', 1)[0];
        // A `use` path that starts with an item its own block declares names that item from edition 2018 on, and in edition 2015 starts at the crate root whatever a block declares: the path is emitted as `use::1::<block>::<the path as written>`, which the resolver reads as written in 2015 and as no file from 2018 on.
        if (useDecl !== null && !useFromRoot && blockItemNamed(root, lexical)) {
            const line = node.startPosition.row + 1;
            const dedupKey = `${written} block ${line}`;
            if (seen.has(dedupKey))
                return;
            seen.add(dedupKey);
            out.push(single({ kind: 'path', specifier: `use::1::<block>::${written}` }, 'import', line));
            return;
        }
        const crate = useDecl === null ? undefined : externCrateFor(root, useDecl, lexical);
        // From edition 2018 a `use` path may start with a name in scope; what the path means then is emitted in front of the path as written, which is what an edition 2015 crate reads.
        const meant = crate === undefined && useDecl !== null && !useFromRoot ? inScopePath(written, useDecl, lexical) : written;
        if (crate !== undefined)
            specifier = `extern::${crate}::as::${specifier}`;
        else
            specifier = meant;
        const meantRoot = specifier.split('::', 1)[0];
        if (meantRoot === 'self' || meantRoot === 'super') {
            // Relative to the module the node sits in: rebase across enclosing inline modules.
            const chain = inlineModChain(mods);
            if (chain.names.length > 0) {
                if (chain.unpinned && meant === written)
                    return; // a #[path]-relocated (or nameless) inline module → silence
                specifier = chain.unpinned ? written : rebaseForInlineMods(specifier, chain.names);
            }
        }
        if (crate === undefined && meant !== written && specifier !== written) {
            const lead = specifier.split('::').length - (written.split('::').length - 1);
            specifier = `use::${lead}::${specifier.split('::').slice(0, lead).join('::')}::${written}`;
        }
        const line = node.startPosition.row + 1;
        const dedupKey = `${specifier} ${line}`;
        if (seen.has(dedupKey))
            return;
        seen.add(dedupKey);
        out.push(single({ kind: 'path', specifier }, 'import', line));
    };
    /** Whether `name` is bound where a path written outside a `use` stands, so that a path starting with it names no crate of the extern prelude: by a `use` or a module in scope, an item of the type namespace or an `extern crate` of a block around it or of its module, or possibly by a glob `use` there. An outer module is not in scope. */
    const boundInScope = (name, from) => from !== null && (from.glob || nearest(boundNamed, name, from) !== undefined);
    /** Emit an inline path: one rooted at `crate`/`self`/`super` as it is, and one whose first name is lowercase and bound by nothing in scope as `in::<the path>`, a crate of the extern prelude. */
    const emitInline = (specifier, node, inAttribute = false) => {
        if (specifier === undefined || specifier === '')
            return;
        if (isCrateRelativeRoot(specifier)) {
            emit(specifier, node);
            return;
        }
        const first = unraw(specifier.split('::', 1)[0]);
        // A leading `::` starts at the crate root in edition 2015 and at a crate from 2018 on; a capitalised name, `Self` or a primitive names a type; a tool's attribute (`#[rustfmt::skip]`) names no crate.
        if (node.text.startsWith('::') || !/^[a-z_]/.test(first) || PRIMITIVE_TYPES.has(first) || (inAttribute && TOOL_ATTRIBUTES.has(first)))
            return;
        if (boundInScope(first, lexical))
            return;
        const specifierIn = `in::${unrawPath(specifier)}`;
        const line = node.startPosition.row + 1;
        if (seen.has(`${specifierIn} ${line}`))
            return;
        seen.add(`${specifierIn} ${line}`);
        out.push(single({ kind: 'path', specifier: specifierIn }, 'import', line));
    };
    // Resolve one `use` argument node (or a list item) to its specifier and emit.
    // `prefix` is the `::`-joined module prefix accumulated from enclosing
    // scoped_use_lists (empty at the top level). Recurses into nested groups.
    const handleArgument = (arg, prefix) => {
        switch (arg.type) {
            case 'scoped_identifier': {
                const tail = pathText(arg);
                if (tail !== undefined)
                    emit(join(prefix, tail), arg);
                return;
            }
            case 'self': {
                // `prefix::{self}` names the prefix module itself.
                emit(prefix, arg);
                return;
            }
            case 'identifier':
            case 'crate':
            case 'super': {
                emit(join(prefix, arg.text), arg);
                return;
            }
            case 'use_as_clause': {
                // Resolve via the `path` field only; the `alias` is a local binding.
                const p = arg.childForFieldName('path');
                if (p !== null)
                    handleArgument(p, prefix);
                return;
            }
            case 'use_wildcard': {
                // `prefix::*` — emit the prefix module. The wildcard's child is the prefix path.
                const pre = prefixNode(arg);
                if (pre === null) {
                    // bare `use *;` is not valid Rust; nothing to emit.
                    return;
                }
                const tail = pre.type === 'scoped_identifier' ? pathText(pre) : pre.text;
                if (tail !== undefined)
                    emit(join(prefix, tail), arg);
                return;
            }
            case 'scoped_use_list': {
                // `prefix::{ items }` — extend the prefix with this group's path, then resolve EVERY item on its own under that prefix: a path item (`billing::Invoice`) names its own module, never the prefix module. A leading-`::` group with no usable prefix (`use ::{a, b};`) resolves each item from the top level.
                const pre = prefixNode(arg);
                const groupPrefix = pre === null
                    ? prefix
                    : join(prefix, pre.type === 'scoped_identifier' ? pathText(pre) : pre.text);
                if (groupPrefix === undefined)
                    return; // unrenderable prefix → silence
                const list = arg.childForFieldName('list');
                if (list !== null)
                    handleArgument(list, groupPrefix);
                return;
            }
            case 'use_list': {
                // `{ items }` — a group's list, or a brace list with no path prefix at all (`use {a::X, b::Y};`, where it is the argument itself): resolve every item on its own under the current prefix (empty at the top level).
                for (const item of arg.namedChildren) {
                    if (item !== null)
                        handleArgument(item, prefix);
                }
                return;
            }
            default:
                return;
        }
    };
    walkScoped(file.tree.rootNode, { mods: null, lexical: null }, (node, around, parent) => {
        const scope = around.mods;
        mods = scope;
        lexical = around.lexical;
        // A block, the body of a module, an `impl` or a trait, and the file are scopes: what stands in them reads their names first.
        if (node.type === 'source_file' || node.type === 'block' || node.type === 'declaration_list') {
            return { mods: scope, lexical: scopeOf(node, node.type === 'source_file' || parent()?.type === 'mod_item', around.lexical) };
        }
        if (node.type === 'use_declaration') {
            const arg = node.childForFieldName('argument');
            useDecl = node;
            useFromRoot = arg !== null && arg.text.startsWith('::');
            if (arg !== null)
                handleArgument(arg, '');
            useDecl = null;
            return false; // do not descend into the use tree again
        }
        // File-backed `mod foo;` (no body) → the submodule file, addressed as `self::foo`. One with
        // a `#[path]` attribute among the items of the file is the file the attribute names
        // (`mod::<path>`), and is skipped elsewhere; an inline `mod foo { … }` (body present)
        // emits nothing here and is descended into so its own paths are caught.
        if (node.type === 'mod_item') {
            const body = node.childForFieldName('body');
            if (body === null && !modHasPathOverride(node)) {
                const name = node.childForFieldName('name');
                if (name !== null)
                    emit(`self::${name.text}`, node);
            }
            else if (body === null && parent()?.type === 'source_file') {
                for (const file of pathAttributeFiles(node, []))
                    out.push(single({ kind: 'path', specifier: `mod::${file}` }, 'import', node.startPosition.row + 1));
            }
            if (body === null)
                return undefined;
            // An inline module: what sits inside it is read relative to it.
            const name = node.childForFieldName('name')?.text ?? '';
            return { mods: { name: unraw(name), unpinned: (scope?.unpinned ?? false) || name === '' || modHasPathOverride(node), outer: scope }, lexical: around.lexical };
        }
        // `cfg_if! { … }` among the items of a module: each file-backed `mod` in its branches is a module on some target, addressed like one written outside the macro.
        if (node.type === 'macro_invocation') {
            const body = cfgIfBody(node, parent());
            if (body === null)
                return undefined;
            for (const mod of cfgIfModules(body))
                if (!mod.moved)
                    emit(`self::${mod.names.join('::')}`, mod.at);
            for (const e of cfgIfExternCrates(body))
                if (e.crate !== undefined)
                    emit(`extern::${e.crate}`, e.at);
            return false;
        }
        // `extern crate name [as alias];` → `extern::name` (never `self`); the resolver binds it
        // only to an in-repo path dependency or the package's own library.
        if (node.type === 'extern_crate_declaration') {
            const name = node.childForFieldName('name');
            if (name !== null && name.type === 'identifier' && name.text !== 'self')
                emit(`extern::${name.text}`, node);
            return false;
        }
        // Inline FQN in TYPE position — the outermost scoped_type_identifier carries the full path.
        if (node.type === 'scoped_type_identifier' && parent()?.type !== 'scoped_type_identifier') {
            emitInline(scopedTypePathText(node), node);
            return undefined;
        }
        // Inline FQN in EXPRESSION position — the outermost scoped_identifier (a call/macro path,
        // an associated-fn path). Inner scoped_identifiers (incl. the `path` of a
        // scoped_type_identifier) have a scoped parent and are skipped.
        if (node.type === 'scoped_identifier' &&
            parent()?.type !== 'scoped_identifier' &&
            parent()?.type !== 'scoped_type_identifier') {
            emitInline(pathText(node), node, parent()?.type === 'attribute');
            return undefined;
        }
        return undefined;
    });
    return out;
}
/** The names the items of `scope` itself bring into it that a `use` path can start with: each module a module's own scope (`module`) declares, with or without a body, as `self::<name>`, and each name a `use` declaration there binds, as the path it names, those of a branch of a `cfg_if!` among a module's items included (`cfgIfNames`). A `use` that starts with `::` names a crate and is left out, and so is a glob. `r#` is stripped. */
function scopeNames(scope, module) {
    const out = new Map();
    const add = (name, path, decl) => {
        const plain = unraw(name);
        if (plain === '' || plain === '_')
            return;
        const list = out.get(plain);
        if (list === undefined)
            out.set(plain, [{ path, decl }]);
        else
            list.push({ path, decl });
    };
    for (const node of scope.namedChildren) {
        if (node === null)
            continue;
        if (node.type === 'mod_item' && module) {
            const name = node.childForFieldName('name');
            if (name !== null)
                add(name.text, `self::${unraw(name.text)}`, null);
        }
        else if (node.type === 'use_declaration') {
            const arg = node.childForFieldName('argument');
            if (arg === null || arg.text.startsWith('::'))
                continue;
            for (const bound of useBindingPaths(arg, ''))
                add(bound.name, unrawPath(bound.path), node);
        }
        else if (module) {
            const body = cfgIfBodyOf(node, scope);
            if (body !== null)
                for (const bound of cfgIfNames(body).names)
                    add(bound.name, bound.path, bound.at);
        }
    }
    return out;
}
/** The token tree of `node`, an item of `scope`, when it is a `cfg_if!` invocation that `cfgIfBody` reads, written as an item or as a statement; null otherwise. */
function cfgIfBodyOf(node, scope) {
    const call = node.type === 'expression_statement' ? node.namedChild(0) : node;
    return call?.type === 'macro_invocation' ? cfgIfBody(call, call === node ? scope : node) : null;
}
/** The names a `use` argument binds, each with the path it names: the last segment of a path, each member of a group under the group's path, the alias of an `as`, the module a `self` member names. `prefix` is the path of the groups around the argument. */
function useBindingPaths(arg, prefix) {
    switch (arg.type) {
        case 'identifier':
            return [{ name: arg.text, path: join(prefix, arg.text) }];
        case 'scoped_identifier': {
            const path = join(prefix, pathText(arg));
            const name = arg.childForFieldName('name');
            return path === undefined || name === null ? [] : [{ name: name.text, path }];
        }
        case 'self':
            return prefix === '' ? [] : [{ name: prefix.slice(prefix.lastIndexOf(':') + 1), path: prefix }];
        case 'use_as_clause': {
            const alias = arg.childForFieldName('alias');
            const p = arg.childForFieldName('path');
            const inner = p === null ? [] : useBindingPaths(p, prefix);
            return alias === null || inner.length !== 1 ? [] : [{ name: alias.text, path: inner[0].path }];
        }
        case 'scoped_use_list': {
            const pre = prefixNode(arg);
            const groupPrefix = pre === null ? prefix : join(prefix, pre.type === 'scoped_identifier' ? pathText(pre) : pre.text);
            const list = arg.childForFieldName('list');
            return groupPrefix === undefined || list === null ? [] : useBindingPaths(list, groupPrefix);
        }
        case 'use_list':
            return arg.namedChildren.flatMap((c) => (c === null ? [] : useBindingPaths(c, prefix)));
        default:
            // A glob binds names no tree shows; `crate` and `super` alone bind none.
            return [];
    }
}
/** Join a `::`-module prefix with a tail. Empty prefix → the tail itself; undefined
 *  tail → undefined (propagates a resolution failure rather than guessing). */
function join(prefix, tail) {
    if (tail === undefined)
        return undefined;
    if (prefix === '')
        return tail;
    return `${prefix}::${tail}`;
}
/**
 * Top-level declarations — a thin parity layer (Rust resolves dependencies by PATH
 * through the crate module tree, not by a symbol index, so a Rust SymbolTable is not
 * load-bearing). Emits the names of top-level item declarations:
 *   - `struct_item` / `enum_item` / `trait_item` / `function_item` / `mod_item`
 *     (each carries field `name`).
 * Only top-level items (direct children of the file root) are emitted — items nested
 * inside an inline `mod { … }` are same-file detail, not the node's public surface.
 *
 * Beside them, every name the file's top level binds as an item is declared under
 * `rustTopLevelItemKey(name)` (`item:<name>`), read from the parse tree by
 * `topLevelItemNames`: this is what the resolver asks of a crate-root file when an edition
 * 2015 `use` path names one of its items, so a name defined only inside an inline `mod`, a
 * function body, a `const` or `static` initializer, a closure or a `macro_rules!` body is
 * never taken for an item of the root.
 *
 * Every name the file's top level binds with `extern crate` is declared under
 * `rustExternNameKey(name)` (`extern:<name>`), read by `topLevelExternCrates`: beside the
 * items, these are the names a `crate::` path or a path into a dependency can go through in a
 * crate-root file. The crate each such name stands for is declared under
 * `rustExternBindingKey(name, crate)` (`extern:<name>=<crate>`), which lets a path that starts
 * with the name resolve to the crate.
 *
 * Every module whose names a top-level glob `use` brings in is declared under
 * `rustGlobKey(path)` (`glob:<path>`), and under `rustConditionalGlobKey(path)` (`glob?:<path>`)
 * as well when a `cfg` may remove that `use`, read by `topLevelGlobs`: with the item keys of that
 * module's file, this is what tells the resolver that a crate root re-exports a name it does
 * not write.
 *
 * Every module the file declares without a body, whatever stands in front of it, is declared
 * under `rustModuleKey(path)` (`mod:<path>`), and `RUST_MODULES_KNOWN_KEY` (`mods:all`) says
 * that those are all of them, both read by `declaredModules`: this is what tells the resolver
 * that a file whose name fits a path is no module, because no `mod` declares it.
 *
 * Every file the top level of the file loads through a `path` attribute on a `mod` is
 * declared under `rustPathModuleKey(path)` (`pathmod:<path>`), and under
 * `rustPathModuleNameKey(name)` (`pathmod-name:<file name>`) so that it can be found from the
 * loaded file, both read by `pathModules`: a file loaded that way owns its directory as a
 * `mod.rs` does, which is where the resolver then looks for its children.
 *
 * Every module the file places in a file of its own by name alone is declared under
 * `rustModuleFileKey(path, conditional)`, read by `plainModuleFiles`: `modfile:<path>` for a
 * declaration nothing can switch off, `modfile?:<path>` for one under a `cfg`. This is what the
 * resolver asks when it follows a file's module chain up to the crate roots that compile it.
 */
function declarations(file) {
    const out = [];
    const root = file.tree.rootNode;
    for (const node of root.namedChildren) {
        if (node === null)
            continue;
        if (node.type === 'struct_item' ||
            node.type === 'enum_item' ||
            node.type === 'trait_item' ||
            node.type === 'function_item' ||
            node.type === 'mod_item') {
            const nameNode = node.childForFieldName('name');
            if (nameNode !== null) {
                out.push({ symbolKey: nameNode.text, line: node.startPosition.row + 1 });
            }
        }
    }
    for (const { name, line } of topLevelItemNames(root))
        out.push({ symbolKey: rustTopLevelItemKey(name), line });
    for (const { name, crate, line } of topLevelExternCrates(root)) {
        out.push({ symbolKey: rustExternNameKey(name), line });
        if (crate !== undefined)
            out.push({ symbolKey: rustExternBindingKey(name, crate), line });
    }
    for (const { path, line, conditional } of topLevelGlobs(root)) {
        out.push({ symbolKey: rustGlobKey(path), line });
        if (conditional)
            out.push({ symbolKey: rustConditionalGlobKey(path), line });
    }
    for (const { path, line, conditional } of plainModuleFiles(root))
        out.push({ symbolKey: rustModuleFileKey(path, conditional), line });
    const modules = declaredModules(root);
    for (const { path, line } of modules.declared)
        out.push({ symbolKey: rustModuleKey(path), line });
    if (modules.known)
        out.push({ symbolKey: RUST_MODULES_KNOWN_KEY, line: 1 });
    // A `mod` inside an inline module lies in a directory only the reader of the table can place (see `rustInlinePathModuleKey`).
    for (const { path, line, inline } of pathModules(root)) {
        out.push({ symbolKey: inline ? rustInlinePathModuleKey(path) : rustPathModuleKey(path), line });
        out.push({ symbolKey: rustPathModuleNameKey(path.slice(path.lastIndexOf('/') + 1)), line });
    }
    return out;
}
/** The attributes that leave a `mod` where its name puts it: the compiler's own, which rewrite nothing. Any other attribute in front of a `mod` may be a macro that rewrites the item, and a `cfg_attr` there may apply one, or a `path`. A `cfg` moves nothing, but it may remove the item: see `conditional` in `plainModuleFiles`. */
const INERT_MOD_ATTRIBUTES = new Set(['cfg', 'doc', 'allow', 'warn', 'deny', 'forbid', 'expect', 'macro_use', 'deprecated']);
/** The further attributes of the compiler that stand at the head of a file or of an inline module (`#![no_std]`, `#![feature(…)]`). */
const INERT_INNER_ATTRIBUTES = new Set(['no_std', 'no_core', 'no_main', 'no_implicit_prelude', 'no_builtins', 'feature', 'recursion_limit', 'type_length_limit', 'crate_type', 'crate_name', 'windows_subsystem']);
/** The tools whose attributes (`#[rustfmt::skip]`, `#[clippy::…]`) the compiler passes over. */
const TOOL_ATTRIBUTES = new Set(['rustfmt', 'clippy']);
/**
 * The modules a Rust file places in files of their own by their names: each `mod x;` (no body) that is an item of the file itself, or of inline modules nested in it, as the path of the names from the file's own module (`x`, `outer/x`), with `r#` stripped. Rust compiles the file that path names beside the declaring file (`x.rs` or `x/mod.rs`) into every crate that compiles the declaring file, unless a `cfg` removes the declaration.
 *
 * `conditional` is true when a `cfg` may remove the declaration: a `cfg` in front of the `mod` or of an inline module around it, or a `cfg`, or a `cfg_attr` that applies one, at the head of such an inline module or of the file. Whether the predicate holds is not read (`cfg(any())` never does), so a conditional declaration says the file may be compiled, never that it is.
 *
 * Only what the tree proves is listed, so a module missing here is not known to be absent. Left out: a `mod` with an attribute in front of it other than the compiler's own inert ones (a `path`, a `cfg_attr`, an attribute macro), or inside an inline module with one; every `mod` of a file or an inline module whose head holds an inner attribute that is not one of the compiler's or that names a `path`; a `mod` inside a function body, a block or a macro's tokens; and every `mod` of a file the grammar could not parse to the end, where the nesting itself is a guess.
 */
export function plainModuleFiles(root) {
    const out = [];
    if (root.hasError)
        return out;
    const visit = (items, prefix, removable) => {
        const head = items.filter((n) => n !== null && n.type === 'inner_attribute_item');
        if (head.some((n) => !attributeIsInert(n, true)))
            return;
        const here = removable || head.some(attributeIsCfg);
        for (const node of items) {
            if (node === null || node.type !== 'mod_item')
                continue;
            const attributes = attributesBefore(node);
            if (attributes.some((n) => !attributeIsInert(n, false)))
                continue;
            const name = unraw(node.childForFieldName('name')?.text ?? '');
            if (name === '')
                continue;
            const conditional = here || attributes.some(attributeIsCfg);
            const body = node.childForFieldName('body');
            if (body === null)
                out.push({ path: [...prefix, name].join('/'), line: node.startPosition.row + 1, conditional });
            else
                visit(body.namedChildren, [...prefix, name], conditional);
        }
    };
    visit(root.namedChildren, [], false);
    return out;
}
/**
 * Every module a Rust file declares without a body: each `mod x;` that is an item of the file itself or of inline modules nested in it, and each one in a branch of a `cfg_if!` that stands among those items, as the path of its names from the file's own module (`x`, `outer/x`), with `r#` stripped. Whatever stands in front of the `mod` (a `cfg`, a `path` attribute, an attribute macro) is not read: the list says which names are modules with a file of their own, not where the file is.
 *
 * `known` says that the list holds every such module of the file. It is false where a `mod` may exist that the tree does not show: in a file the grammar could not parse to the end, in one whose head holds an inner attribute that is not one of the compiler's, and in one that invokes, among those items or in a `cfg_if!` branch, a macro other than the item macros Runes reads (`ITEM_MACROS`, `cfg_if!`), since a macro can expand to a `mod` or include a file that holds one.
 */
export function declaredModules(root) {
    const declared = [];
    let known = !root.hasError;
    const visit = (items, prefix) => {
        for (const node of items) {
            if (node === null)
                continue;
            if (node.type === 'inner_attribute_item') {
                if (!attributeIsInert(node, true))
                    known = false;
            }
            else if (node.type === 'mod_item') {
                const name = unraw(node.childForFieldName('name')?.text ?? '');
                const body = node.childForFieldName('body');
                if (name === '')
                    known = false;
                else if (body === null)
                    declared.push({ path: [...prefix, name].join('/'), line: node.startPosition.row + 1 });
                else
                    visit(body.namedChildren, [...prefix, name]);
            }
            else {
                const call = node.type === 'expression_statement' ? node.namedChild(0) : node;
                if (call?.type !== 'macro_invocation')
                    continue;
                const macro = call.childForFieldName('macro');
                const macroName = macro?.type === 'scoped_identifier' ? macro.childForFieldName('name')?.text : macro?.text;
                const body = call.namedChildren.find((c) => c?.type === 'token_tree') ?? null;
                if (macroName === 'cfg_if' && body !== null) {
                    for (const mod of cfgIfModules(body))
                        declared.push({ path: [...prefix, ...mod.names].join('/'), line: mod.at.startPosition.row + 1 });
                    if (cfgIfInvokesMacro(body))
                        known = false;
                }
                else if (macroName === undefined || !ITEM_MACROS.has(macroName))
                    known = false;
            }
        }
    };
    visit(root.namedChildren, []);
    return { declared, known };
}
/** Whether a `cfg_if!` body invokes, among the items of its branches, of a `cfg_if!` nested there or of an inline `mod` written there, a macro other than `cfg_if!`, `macro_rules!` and the item macros Runes reads: a name followed by `!`. Nothing inside any other nested token tree (a function body, an attribute, an initializer's group) is an item of those levels. */
function cfgIfInvokesMacro(body) {
    const braced = (tree) => tree !== undefined && tree.type === 'token_tree' && tree.child(0)?.type === '{';
    const items = (tree) => {
        const tokens = tree.children.filter((c) => c !== null);
        for (let i = 0; i < tokens.length; i++) {
            const t = tokens[i];
            if (t.type === '=') {
                while (i + 1 < tokens.length && tokens[i + 1].type !== ';')
                    i++;
            }
            else if (t.type === 'identifier' && tokens[i + 1]?.type === '!') {
                if (t.text === 'cfg_if') {
                    if (branches(tokens[i + 2]))
                        return true;
                }
                else if (t.text !== 'macro_rules' && !ITEM_MACROS.has(t.text))
                    return true;
            }
            else if (!t.isNamed && t.type === 'mod' && braced(tokens[i + 2]) && items(tokens[i + 2]))
                return true;
        }
        return false;
    };
    const branches = (tree) => tree !== undefined && tree.namedChildren.some((c) => c !== null && braced(c) && items(c));
    return branches(body);
}
/**
 * The files a Rust file loads through a `path` attribute on a `mod` without a body that is an item of the file itself, outside every inline module, and the same for a `mod` inside an inline module that carries no `path` attribute of its own, with the names of the inline modules in front of the path (`inline` is true for those, whose directory the reader of the table places): the attribute's string, read as a path with `/` between its parts and normalized (`./imp/../platform/linux.rs` → `platform/linux.rs`; a leading `..` stays). Rust reads it relative to the directory of the file that writes it, and treats the file it names as a mod-rs file, whose own `mod x;` lies beside it. Left out: a `mod` inside an inline module, where the path starts from another directory; one in a macro's tokens; a `cfg_attr` that applies a `path`; and a path that is absolute, empty, or written with an escape or a `\`.
 */
export function pathModules(root, directory = []) {
    const out = [];
    for (const node of root.namedChildren) {
        if (node === null || node.type !== 'mod_item')
            continue;
        // An inline module: the path attribute of a `mod` inside it is relative to the directory of the file with the names of the modules around it added (`outer/loaded.rs`); one that itself carries a `path` attribute moves that directory somewhere this does not follow.
        const body = node.childForFieldName('body');
        if (body !== null) {
            const name = unraw(node.childForFieldName('name')?.text ?? '');
            if (name !== '' && !modHasPathOverride(node))
                out.push(...pathModules(body, [...directory, name]));
            continue;
        }
        for (const path of pathAttributeFiles(node, directory))
            out.push({ path, line: node.startPosition.row + 1, inline: directory.length > 0 });
    }
    return out;
}
/** The files the `path` attributes in front of the `mod` without a body `modItem` name, each read as a path with `/` between its parts, normalized, and with `directory` (the names of the inline modules around the `mod`) in front: `a/b.rs` for `#[path = "./imp/../a//b.rs"]`; a leading `..` stays. Left out: a `path` a `cfg_attr` applies, and a path that is absolute, empty, written with an escape or a `\`, or that ends in `..`. */
function pathAttributeFiles(modItem, directory) {
    const out = [];
    for (const item of attributesBefore(modItem)) {
        const attr = item.namedChild(0);
        const id = attr?.namedChild(0) ?? null;
        const value = attr?.childForFieldName('value') ?? null;
        if (id === null || id.type !== 'identifier' || id.text !== 'path' || value === null || value.type !== 'string_literal')
            continue;
        const text = value.text.slice(1, -1);
        if (text === '' || text.startsWith('/') || text.includes('\\'))
            continue;
        const parts = [...directory];
        for (const part of text.split('/')) {
            if (part === '' || part === '.')
                continue;
            if (part === '..' && parts.length > 0 && parts[parts.length - 1] !== '..')
                parts.pop();
            else
                parts.push(part);
        }
        if (parts.length > 0 && parts[parts.length - 1] !== '..')
            out.push(parts.join('/'));
    }
    return out;
}
/** The attributes written in front of `item`. They parse as preceding `attribute_item` siblings; comments may stand between them. */
function attributesBefore(item) {
    const out = [];
    let sib = item.previousNamedSibling;
    while (sib !== null && (sib.type === 'attribute_item' || sib.type === 'line_comment' || sib.type === 'block_comment')) {
        if (sib.type === 'attribute_item')
            out.push(sib);
        sib = sib.previousNamedSibling;
    }
    return out;
}
/** Whether an attribute may remove what it stands on: a `cfg`, or a `cfg_attr` that applies one (`cfg_attr(a, cfg(b))`, also through a nested `cfg_attr`), read from its tokens, so a comment inside it changes nothing. A `cfg_attr` whose tokens cannot be read counts, which errs toward conditional. */
function attributeIsCfg(item) {
    const attr = item.namedChildren.find((c) => c !== null && c.type === 'attribute') ?? null;
    const id = attr?.namedChild(0) ?? null;
    if (attr === null || id === null || id.type !== 'identifier')
        return false;
    if (id.text === 'cfg')
        return true;
    if (id.text !== 'cfg_attr')
        return false;
    const applied = cfgAttrApplies(attr);
    return applied === undefined || applied.includes('cfg');
}
/** The names of the attributes a `cfg_attr` applies when its predicate holds (see `cfgAttrParts`). */
function cfgAttrApplies(attr) {
    return cfgAttrParts(attr)?.map((p) => p.name);
}
/** The attributes a `cfg_attr` applies when its predicate holds, read from its tokens (`attr` is the `attribute` node, or the token tree of a `cfg_attr` nested in one): each attribute after the predicate, by its path (`cfg`, `path`, `rustfmt::skip`) and with the token tree of its arguments when it has one, and those of a `cfg_attr` nested among them. Comments are passed over. Undefined when the tokens do not read as a predicate followed by attributes. */
function cfgAttrParts(attr) {
    const args = attr.type === 'token_tree' ? attr : attr.childForFieldName('arguments');
    if (args === null || args.type !== 'token_tree')
        return undefined;
    const tokens = args.children.filter((c) => c !== null && c.type !== 'line_comment' && c.type !== 'block_comment').slice(1, -1);
    const parts = [[]];
    for (const t of tokens) {
        if (t.type === ',')
            parts.push([]);
        else
            parts[parts.length - 1].push(t);
    }
    if (parts.length < 2 || parts[0].length === 0)
        return undefined;
    const out = [];
    for (const part of parts.slice(1)) {
        if (part.length === 0)
            continue;
        let i = 0;
        const names = [];
        while (part[i]?.type === 'identifier') {
            names.push(part[i].text);
            if (part[i + 1]?.type !== '::')
                break;
            i += 2;
        }
        if (names.length === 0)
            return undefined;
        const name = names.join('::');
        const after = part[2 * names.length - 1];
        const args = after?.type === 'token_tree' ? after : undefined;
        if (name === 'cfg_attr') {
            const nested = args === undefined ? undefined : cfgAttrParts(args);
            if (nested === undefined)
                return undefined;
            out.push(...nested);
        }
        else
            out.push({ name, args });
    }
    return out;
}
/** Whether an `attribute_item` (in front of an item) or an `inner_attribute_item` (`inner`, at the head of a file or an inline module) is one of the compiler's inert attributes or a tool's. An inner `cfg_attr` is inert unless it applies a `path`, or its tokens cannot be read: no attribute macro stands in that place. */
function attributeIsInert(item, inner) {
    const attr = item.namedChildren.find((c) => c !== null && c.type === 'attribute') ?? null;
    const id = attr?.namedChild(0) ?? null;
    if (id === null)
        return false;
    if (id.type === 'identifier') {
        if (INERT_MOD_ATTRIBUTES.has(id.text))
            return true;
        if (!inner)
            return false;
        if (INERT_INNER_ATTRIBUTES.has(id.text))
            return true;
        const applied = id.text === 'cfg_attr' ? cfgAttrApplies(attr) : undefined;
        return applied !== undefined && !applied.includes('path');
    }
    if (id.type !== 'scoped_identifier')
        return false;
    const tool = id.childForFieldName('path');
    return tool !== null && tool.type === 'identifier' && TOOL_ATTRIBUTES.has(tool.text);
}
/** The item kinds that bind their `name` in the type namespace, where a path's first segment is looked for. */
const TYPE_NAMESPACE_ITEMS = new Set(['mod_item', 'struct_item', 'enum_item', 'union_item', 'trait_item', 'type_item']);
/** The primitive types, whose names start a path to an associated item (`u32::MAX`, `str::from_utf8`) and name no crate. */
const PRIMITIVE_TYPES = new Set(['bool', 'char', 'str', 'u8', 'u16', 'u32', 'u64', 'u128', 'usize', 'i8', 'i16', 'i32', 'i64', 'i128', 'isize', 'f16', 'f32', 'f64', 'f128']);
/** What the items of `scope` itself bind in the type namespace beside what `scopeNames` and `externCratesIn` read: the names of its items of the type namespace, and whether it holds a glob `use`, which can bring in any name, in a branch of a `cfg_if!` among its items too. */
function scopeTypeNames(scope) {
    const items = new Set();
    let glob = false;
    for (const c of scope.namedChildren) {
        if (c !== null && TYPE_NAMESPACE_ITEMS.has(c.type))
            items.add(unraw(c.childForFieldName('name')?.text ?? ''));
        if (c !== null && c.type === 'use_declaration' && c.descendantsOfType('use_wildcard').length > 0)
            glob = true;
        const body = c === null ? null : cfgIfBodyOf(c, scope);
        if (body !== null && cfgIfNames(body).glob)
            glob = true;
    }
    return { items, glob };
}
/** The item kinds whose `name` field a file's top level binds as an item. */
const NAMED_ITEMS = new Set(['struct_item', 'enum_item', 'union_item', 'trait_item', 'type_item', 'function_item', 'function_signature_item', 'const_item', 'static_item', 'mod_item', 'macro_definition']);
/** The item macros whose expansion Runes can read from their tokens: each defines items at the top level of its body (`thread_local!`, `lazy_static!`, `bitflags!`), or, for `cfg_if!`, in each braced branch. A top-level invocation of any other macro defines nothing Runes can tell, so its names stay unknown (a lost edge, never a false one). */
const ITEM_MACROS = new Set(['thread_local', 'lazy_static', 'bitflags']);
/** The keywords that, followed by a name, define an item in a macro's tokens. */
const ITEM_KEYWORDS = new Set(['struct', 'enum', 'union', 'trait', 'type', 'fn', 'const', 'static', 'mod']);
/**
 * Every name the top level of a Rust file binds as an item, read from its parse tree (the `source_file`'s own children, never anything below an item's body): the name of each item it defines (struct, enum, union, trait, type, fn, const, static, mod, `macro_rules!`; for a function with `#[proc_macro_derive(Name, …)]` in front of it the derive `Name` as well as the function), of each item an `extern` block there declares, each name a top-level `use` brings in (the last segment of a path, each member of a group, the alias of an `as`, the module a `self` member names; never a glob), and the items of the known item macros (`ITEM_MACROS`, and `cfg_if!`). A crate bound with `extern crate` is no item a `use` path names and is left out; so is `_`. `r#` is stripped. A part of the file the grammar cannot parse yields nothing.
 */
export function topLevelItemNames(root) {
    const out = [];
    const add = (name, node) => {
        if (name === undefined)
            return;
        const plain = unraw(name);
        if (plain !== '_' && plain !== '')
            out.push({ name: plain, line: node.startPosition.row + 1 });
    };
    for (const node of root.namedChildren) {
        if (node === null)
            continue;
        if (NAMED_ITEMS.has(node.type)) {
            add(node.childForFieldName('name')?.text, node);
            if (node.type === 'function_item')
                add(deriveMacroName(node), node);
        }
        else if (node.type === 'foreign_mod_item') {
            for (const item of node.childForFieldName('body')?.namedChildren ?? []) {
                if (item !== null && item.type !== 'macro_invocation')
                    add(item.childForFieldName('name')?.text, item);
            }
        }
        else if (node.type === 'use_declaration') {
            const arg = node.childForFieldName('argument');
            if (arg !== null)
                for (const name of useBindings(arg, undefined))
                    add(name, node);
        }
        else {
            const call = node.type === 'expression_statement' ? node.namedChild(0) : node;
            if (call?.type !== 'macro_invocation')
                continue;
            const macro = call.childForFieldName('macro');
            const macroName = macro?.type === 'scoped_identifier' ? macro.childForFieldName('name')?.text : macro?.text;
            const body = call.namedChildren.find((c) => c?.type === 'token_tree') ?? null;
            if (body === null || macroName === undefined)
                continue;
            if (macroName === 'cfg_if')
                for (const name of cfgIfItems(body))
                    add(name, node);
            else if (ITEM_MACROS.has(macroName))
                for (const name of tokenItems(body))
                    add(name, node);
        }
    }
    return out;
}
/** The derive macro the function `fn` defines, when a `#[proc_macro_derive(Name, …)]` stands in front of it, or a `cfg_attr` there applies one: `Name`, the attribute's first argument. It is one more item of the crate root, beside the function, which stays an item inside its own crate; the names in `attributes(…)` are helper attributes, no items. Undefined for any other function, and for an attribute whose first argument is no name. */
function deriveMacroName(fn) {
    for (const item of attributesBefore(fn)) {
        const attr = item.namedChildren.find((c) => c !== null && c.type === 'attribute') ?? null;
        const id = attr?.namedChild(0) ?? null;
        if (attr === null || id === null || id.type !== 'identifier')
            continue;
        const args = id.text === 'proc_macro_derive' ? attr.childForFieldName('arguments') : id.text === 'cfg_attr' ? cfgAttrParts(attr)?.find((p) => p.name === 'proc_macro_derive')?.args : undefined;
        if (args === undefined)
            continue;
        const first = args?.namedChildren.find((c) => c !== null && c.type !== 'line_comment' && c.type !== 'block_comment') ?? null;
        return first !== null && first.type === 'identifier' ? first.text : undefined;
    }
    return undefined;
}
/** The crates the top level of a Rust file binds with `extern crate`, read from its parse tree: `name` is the name the declaration binds in the file's module (the alias of `extern crate a as name;`, else the crate) and `crate` the crate it stands for, both with `r#` stripped; `crate` is undefined for `extern crate self as name;`, which names the crate that writes it. `extern crate a as _;` binds none. */
export function topLevelExternCrates(root) {
    return externCratesIn(root);
}
/** The `extern crate` declarations among the items of `scope` itself (a file, the body of an inline module, a block), as `topLevelExternCrates` gives them for a file, those in the branches of a `cfg_if!` among the items of a module included. */
function externCratesIn(scope) {
    const out = [];
    for (const node of scope.namedChildren) {
        const call = node?.type === 'expression_statement' ? node.namedChild(0) : node;
        const body = node !== null && call?.type === 'macro_invocation' ? cfgIfBody(call, call === node ? scope : node) : null;
        if (body !== null)
            out.push(...cfgIfExternCrates(body));
        if (node === null || node.type !== 'extern_crate_declaration')
            continue;
        const crate = node.childForFieldName('name');
        const bound = unraw((node.childForFieldName('alias') ?? crate)?.text ?? '');
        if (bound !== '' && bound !== '_' && bound !== 'self')
            out.push({ name: bound, crate: crate === null || crate.type !== 'identifier' || crate.text === 'self' ? undefined : unraw(crate.text), line: node.startPosition.row + 1 });
    }
    return out;
}
/** The paths of the globs among the top-level `use` declarations of a Rust file, as written and with `r#` stripped (`types` for `pub use types::*;`, `self::a::b` for `use self::a::{b::*, C};`): the modules whose names each glob brings into the file's own module. A `use` that starts with `::` names a crate and is left out. `conditional` is true when a `cfg` in front of the `use`, or a `cfg_attr` there that applies one, may remove it; whether its predicate holds is not read. */
export function topLevelGlobs(root) {
    const out = [];
    const visit = (arg, prefix, line, conditional) => {
        if (arg.type === 'use_wildcard') {
            const pre = prefixNode(arg);
            const path = pre === null ? undefined : join(prefix, pre.type === 'scoped_identifier' ? pathText(pre) : pre.text);
            if (path !== undefined)
                out.push({ path: unrawPath(path), line, conditional });
        }
        else if (arg.type === 'scoped_use_list') {
            const pre = prefixNode(arg);
            const groupPrefix = pre === null ? prefix : join(prefix, pre.type === 'scoped_identifier' ? pathText(pre) : pre.text);
            const list = arg.childForFieldName('list');
            if (groupPrefix !== undefined && list !== null)
                visit(list, groupPrefix, line, conditional);
        }
        else if (arg.type === 'use_list') {
            for (const item of arg.namedChildren)
                if (item !== null)
                    visit(item, prefix, line, conditional);
        }
    };
    for (const node of root.namedChildren) {
        if (node === null || node.type !== 'use_declaration')
            continue;
        const arg = node.childForFieldName('argument');
        if (arg !== null && !arg.text.startsWith('::'))
            visit(arg, '', node.startPosition.row + 1, attributesBefore(node).some(attributeIsCfg));
    }
    return out;
}
/** The names a `use` argument binds. `last` is the last segment of the path of the group it sits in, which a `self` member binds. */
function useBindings(arg, last) {
    switch (arg.type) {
        case 'identifier':
            return [arg.text];
        case 'scoped_identifier': {
            const name = arg.childForFieldName('name');
            return name?.type === 'identifier' ? [name.text] : [];
        }
        case 'self':
            return last === undefined ? [] : [last];
        case 'use_as_clause': {
            const alias = arg.childForFieldName('alias');
            return alias === null ? [] : [alias.text];
        }
        case 'scoped_use_list': {
            const p = arg.childForFieldName('path');
            const segment = p?.type === 'identifier' ? p.text : p?.type === 'scoped_identifier' ? p.childForFieldName('name')?.text : undefined;
            const list = arg.childForFieldName('list');
            return list === null ? [] : useBindings(list, segment);
        }
        case 'use_list':
            return arg.namedChildren.flatMap((c) => (c === null ? [] : useBindings(c, last)));
        default:
            // A glob (`use a::*;`) binds names no tree shows; `crate`, `super` alone bind none.
            return [];
    }
}
/** The token tree of a `cfg_if!` invocation that stands among the items of a module (the file's, or an inline module's), or null for any other node. `parent` is the invocation's parent. */
function cfgIfBody(call, parent) {
    const macro = call.childForFieldName('macro');
    const name = macro?.type === 'scoped_identifier' ? macro.childForFieldName('name')?.text : macro?.text;
    if (name !== 'cfg_if')
        return null;
    const holder = parent?.type === 'expression_statement' ? parent.parent : parent;
    if (holder === null || (holder.type !== 'source_file' && holder.type !== 'declaration_list'))
        return null;
    return call.namedChildren.find((c) => c?.type === 'token_tree') ?? null;
}
/**
 * The file-backed modules a `cfg_if!` body declares: each `mod x;` in a braced branch, in a `cfg_if!` nested in one, and in an inline `mod y { … }` written there, which adds its name in front (`names`, `r#` stripped: `x`, or `y`, `x`). `at` is the `mod` keyword. `moved` is true when a `path` attribute stands in front of the `mod` or of an inline module around it, behind a visibility, comments or other attributes: the file is then not where the names put it. Every branch is listed, since each is the crate's on some target.
 */
export function cfgIfModules(body) {
    const out = [];
    const braced = (tree) => tree !== undefined && tree.type === 'token_tree' && tree.child(0)?.type === '{';
    const branches = (tree, names, moved) => {
        for (const c of tree.namedChildren)
            if (c !== null && braced(c))
                items(c, names, moved);
    };
    const items = (tree, names, moved) => {
        const tokens = tree.children.filter((c) => c !== null && c.type !== 'line_comment' && c.type !== 'block_comment').slice(1, -1);
        for (let i = 0; i < tokens.length; i++) {
            const t = tokens[i];
            const next = tokens[i + 1];
            if (t.type === 'identifier' && t.text === 'cfg_if' && next?.type === '!' && tokens[i + 2]?.type === 'token_tree') {
                branches(tokens[i + 2], names, moved);
                i += 2;
            }
            else if (!t.isNamed && t.type === 'mod' && next?.type === 'identifier') {
                // Back over the visibility (`pub`, `pub(crate)`) to the attributes: `#` and its bracketed tree, one pair each.
                let j = i - 1;
                if (tokens[j]?.type === 'token_tree' && tokens[j - 1]?.type === 'pub')
                    j -= 2;
                else if (tokens[j]?.type === 'pub')
                    j -= 1;
                let path = false;
                for (; j >= 1 && tokens[j].type === 'token_tree' && tokens[j - 1].type === '#'; j -= 2) {
                    const id = tokens[j].namedChild(0);
                    if (id !== null && id.type === 'identifier' && id.text === 'path')
                        path = true;
                }
                const here = [...names, unraw(next.text)];
                const after = tokens[i + 2];
                if (after?.type === ';')
                    out.push({ names: here, at: t, moved: moved || path });
                else if (braced(after))
                    items(after, here, moved || path);
                i += 2;
            }
        }
    };
    branches(body, [], false);
    return out;
}
/** The `extern crate` declarations of a `cfg_if!` body: each in a braced branch or in a `cfg_if!` nested in one, never one inside an inline `mod` or a function body written there, as `topLevelExternCrates` gives them (the name bound, the crate, `r#` stripped, none for `as _` or `self` alone), with `at`, the `extern` token. Every branch is listed, since each is the module's on some target. */
export function cfgIfExternCrates(body) {
    const out = [];
    const braced = (tree) => tree !== undefined && tree.type === 'token_tree' && tree.child(0)?.type === '{';
    const branches = (tree) => {
        for (const c of tree.namedChildren)
            if (c !== null && braced(c))
                items(c);
    };
    const items = (tree) => {
        const tokens = tree.children.filter((c) => c !== null && c.type !== 'line_comment' && c.type !== 'block_comment').slice(1, -1);
        for (let i = 0; i < tokens.length; i++) {
            const t = tokens[i];
            if (t.type === 'identifier' && t.text === 'cfg_if' && tokens[i + 1]?.type === '!' && tokens[i + 2]?.type === 'token_tree') {
                branches(tokens[i + 2]);
                i += 2;
            }
            else if (t.type === 'identifier' && t.text === 'extern' && tokens[i + 1]?.type === 'crate') {
                const target = tokens[i + 2];
                const alias = tokens[i + 3]?.type === 'as' ? tokens[i + 4] : undefined;
                const end = alias === undefined ? i + 3 : i + 5;
                if (tokens[end]?.type !== ';' || (target?.type !== 'identifier' && target?.type !== 'self') || (alias !== undefined && alias.type !== 'identifier' && alias.type !== '_'))
                    continue;
                const crate = target.type === 'identifier' ? unraw(target.text) : undefined;
                const bound = alias === undefined ? (crate ?? '') : alias.type === 'identifier' ? unraw(alias.text) : '';
                if (bound !== '' && bound !== 'self')
                    out.push({ name: bound, crate, line: t.startPosition.row + 1, at: t });
                i = end;
            }
        }
    };
    branches(body);
    return out;
}
/**
 * The names the items of a `cfg_if!` body bring into the module around it, read from its tokens as `scopeNames` reads items: each module a braced branch declares, with or without a body, as `self::<name>` (`at` null), and each name a `use` there binds, as the path it names (`at` its `use` token), those of a `cfg_if!` nested in a branch included, and nothing written inside an inline module, a function body or any other nested token tree there. A `use` that starts with `::` names a crate and is left out; `glob` says that a branch holds a glob `use`. `r#` is stripped.
 */
function cfgIfNames(body) {
    const names = [];
    let glob = false;
    const braced = (tree) => tree !== undefined && tree.type === 'token_tree' && tree.child(0)?.type === '{';
    const branches = (tree) => {
        for (const c of tree.namedChildren)
            if (c !== null && braced(c))
                items(c);
    };
    const items = (tree) => {
        const tokens = innerTokens(tree);
        for (let i = 0; i < tokens.length; i++) {
            const t = tokens[i];
            const next = tokens[i + 1];
            if (t.type === 'identifier' && t.text === 'cfg_if' && next?.type === '!' && tokens[i + 2]?.type === 'token_tree') {
                branches(tokens[i + 2]);
                i += 2;
            }
            else if (!t.isNamed && t.type === 'mod' && next?.type === 'identifier') {
                names.push({ name: unraw(next.text), path: `self::${unraw(next.text)}`, at: null });
                i += 1;
            }
            else if (t.type === 'use') {
                let end = i + 1;
                while (end < tokens.length && tokens[end].type !== ';')
                    end++;
                const tree = tokens.slice(i + 1, end);
                if (tree[0]?.type !== '::') {
                    const read = useTokenBindings(tree, '');
                    glob ||= read.glob;
                    for (const bound of read.bound)
                        names.push({ name: unraw(bound.name), path: unrawPath(bound.path), at: t });
                }
                i = end;
            }
        }
    };
    branches(body);
    return { names: names.filter((n) => n.name !== '' && n.name !== '_'), glob };
}
/** The tokens of a token tree inside its delimiters, comments left out. */
function innerTokens(tree) {
    return tree.children.filter((c) => c !== null && c.type !== 'line_comment' && c.type !== 'block_comment').slice(1, -1);
}
/** The tokens that can be a segment of a `use` path. */
const PATH_SEGMENT_TOKENS = new Set(['identifier', 'crate', 'self', 'super']);
/** The names a `use` tree written as tokens binds, as `useBindingPaths` gives them for one the grammar parsed (the last segment of a path, each member of a group under the group's path, the alias of an `as`, the module a `self` member names), and whether it holds a glob. `tokens` are those between `use` and its `;`, or one member of a group; `prefix` is the path of the groups around them. A form it does not read binds nothing. */
function useTokenBindings(tokens, prefix) {
    const none = { bound: [], glob: false };
    const segments = [];
    let i = 0;
    while (i < tokens.length && PATH_SEGMENT_TOKENS.has(tokens[i].type)) {
        segments.push(tokens[i].text);
        i++;
        if (tokens[i]?.type !== '::')
            break;
        i++;
    }
    const trailing = i > 0 && tokens[i - 1].type === '::';
    const path = join(prefix, segments.join('::'));
    const rest = tokens.slice(i);
    if (segments.length === 0 || trailing) {
        // What follows a `::`, or the whole tree: a glob or a group.
        const group = rest[0];
        if (rest.length !== 1 || group === undefined)
            return none;
        const groupPrefix = segments.length === 0 ? prefix : path;
        if (group.type === '*')
            return { bound: [], glob: true };
        if (group.type !== 'token_tree' || group.child(0)?.type !== '{')
            return none;
        const members = [[]];
        for (const t of innerTokens(group)) {
            if (t.type === ',')
                members.push([]);
            else
                members[members.length - 1].push(t);
        }
        const read = members.filter((m) => m.length > 0).map((m) => useTokenBindings(m, groupPrefix));
        return { bound: read.flatMap((r) => r.bound), glob: read.some((r) => r.glob) };
    }
    const last = segments[segments.length - 1];
    // A `self` member names the group's module; `crate` and `super` alone bind no name.
    const plain = last === 'self' ? (segments.length === 1 && prefix !== '' ? [{ name: prefix.slice(prefix.lastIndexOf(':') + 1), path: prefix }] : []) : last === 'crate' || last === 'super' ? [] : [{ name: last, path: path }];
    if (rest.length === 0)
        return { bound: plain, glob: false };
    const alias = rest[1];
    if (rest.length === 2 && rest[0].type === 'as' && alias !== undefined && (alias.type === 'identifier' || alias.type === '_') && plain.length === 1)
        return { bound: [{ name: alias.text, path: plain[0].path }], glob: false };
    return none;
}
/** The items of a `cfg_if!` body: those of each braced branch (`if #[cfg(…)] { … } else { … }`), a nested `cfg_if!` among them included. */
function cfgIfItems(body) {
    return body.namedChildren.flatMap((c) => (c !== null && c.type === 'token_tree' && c.child(0)?.type === '{' ? tokenItems(c) : []));
}
/**
 * The names a macro's token tree defines at its own level: a keyword of `ITEM_KEYWORDS` followed by a name (`static mut` and `static ref` skipped to the name), `macro_rules! name`, a `use` without a group or a glob (its alias, else its last name), and the items of a nested `cfg_if!`. What follows an `=` up to the `;` is an initializer and is skipped, and nothing inside a nested token tree (a body, an attribute, a group) is read: those are no items of this level.
 */
function tokenItems(tree) {
    const out = [];
    // The tree's own delimiters are its first and last tokens.
    const tokens = tree.children.filter((c) => c !== null).slice(1, -1);
    // `union` is a keyword only in front of an item's name, so the grammar leaves it an identifier.
    const isItemKeyword = (t) => (!t.isNamed && ITEM_KEYWORDS.has(t.type)) || (t.type === 'identifier' && t.text === 'union');
    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (t.type === '=') {
            while (i + 1 < tokens.length && tokens[i + 1].type !== ';')
                i++;
        }
        else if (t.type === 'use') {
            let end = i + 1;
            while (end < tokens.length && tokens[end].type !== ';')
                end++;
            const stmt = tokens.slice(i + 1, end);
            if (!stmt.some((x) => x.type === 'token_tree' || x.type === '*')) {
                const as = stmt.findIndex((x) => x.type === 'as');
                const names = stmt.slice(as + 1).filter((x) => x.type === 'identifier');
                if (names.length > 0)
                    out.push(names[names.length - 1].text);
            }
            i = end;
        }
        else if (isItemKeyword(t)) {
            let j = i + 1;
            while (j < tokens.length && (tokens[j].type === 'mutable_specifier' || (tokens[j].type === 'identifier' && tokens[j].text === 'ref' && tokens[j + 1]?.type === 'identifier')))
                j++;
            if (tokens[j]?.type === 'identifier')
                out.push(tokens[j].text);
        }
        else if (t.type === 'identifier' && (t.text === 'macro_rules' || t.text === 'cfg_if') && tokens[i + 1]?.type === '!') {
            const next = tokens[i + 2];
            if (t.text === 'macro_rules' && next?.type === 'identifier')
                out.push(next.text);
            else if (t.text === 'cfg_if' && next?.type === 'token_tree')
                out.push(...cfgIfItems(next));
        }
    }
    return out;
}
export const rustExtractor = {
    languages: new Set(['rust']),
    rev: 29,
    declarations,
    uses,
};
