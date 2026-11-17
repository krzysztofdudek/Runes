import path from 'node:path';
import { walk } from '../../ast/walk.mjs';
import { walkScoped } from './scope-walk.mjs';
import { single } from './types.mjs';
/**
 * TypeScript / TSX / JavaScript dependency extractor.
 *
 * v1 scope = EXISTENCE, not relation type. A dependency edge is established
 * ONLY by a module-specifier-bearing construct: a static import, a re-export
 * with a source, `import x = require(...)`, a `require(...)` call, an
 * `import(...)` with a string-literal specifier (in a value or a type position),
 * `vi.mock('<lit>')` and `jest.mock('<lit>')` with a string-literal path, and the
 * other calls of `vi` and `jest` that take a module's path (`jest.requireActual`,
 * `vi.importActual`, `vi.doMock`, `jest.unmock`, a chained `jest.mock('a').mock('b')`),
 * a module augmentation `declare module '<spec>' { … }`,
 * or `new URL('<lit>', import.meta.url)`. Usage-site nodes (extends, implements, calls,
 * JSX, type references) would only REFINE the relation type of an
 * already-imported binding, and v1 does not enforce relation type — so this
 * extractor performs NO usage-site refinement. It emits exactly one path hint
 * per import-bearing statement.
 *
 * TYPE-ONLY REFERENCES ARE EDGES — ONE RULE FOR EVERY SPELLING. A relation
 * edge records that one node's code depends on another's, and a file that
 * compiles only because another module declares a type depends on that module
 * as much as a file that loads it: change or remove the type and the importer
 * breaks. So a type-only reference gives its edge exactly like a value import:
 * `import type { T } from`, an all-inline `import { type A } from`,
 * `export type { X } from`, `export type * [as ns] from`,
 * `import type X = require(…)`, an `import('…')` in a TYPE position
 * (`typeof import('./x')`, `let v: import('./x').T`, the type side of
 * `as`/`satisfies`, a type argument). A module augmentation
 * `declare module '<spec>' { … }` extends the declarations of the module it
 * names and compiles only against it, so it gives an edge too — when it IS an
 * augmentation: a relative name (TypeScript accepts a relative name only as an
 * augmentation), or any name without a `*` wildcard in a file that is itself a
 * module (a top-level import or export). The same header in a script file is
 * an ambient module declaration: it declares a module's shape instead of
 * depending on one, and stays silent, as does a wildcard pattern
 * (`declare module '*.css'`). Before 6.1.0 the statement forms were silent
 * while the type-position forms emitted; 6.1.0 makes every spelling an edge.
 *
 * Every non-empty specifier is emitted — relative ('./', '../'), root-absolute
 * ('/src/…'), package-internal ('#…') and bare ('@scope/pkg', 'lib/x'). The
 * resolver decides: a bare specifier becomes an edge only when the repository
 * itself defines it (a tsconfig `paths`/`baseUrl` mapping, or an in-repo
 * package.json `name`), and stays silent for an external package. A specifier
 * carrying a URL scheme (`node:path`, `https:`, `virtual:`) is never in-repo
 * and is dropped here.
 *
 * GRAMMAR RECOVERY. A grammar can turn valid modern syntax into an ERROR
 * region that swallows a statement. On the shipped TS/TSX/JS grammars the known
 * case is a re-export with import attributes (`export … from '…' with { … }`),
 * which disappears as a statement in all three; older builds also swallowed the
 * statements after `for (await using …)` and, in .tsx, after an
 * `import('x').T<U>` annotation, and the palette pins that those imports keep
 * their edge. A swallowed import is a real dependency with no edge, so every
 * source line an ERROR node touches is rescanned for a line-anchored
 * import/re-export statement (see `recoverFromErrors`); a recovered type-only
 * statement gives its edge like any other.
 */
/** Strip the surrounding quotes from a `string` node by reading its `string_fragment` child. */
function specifierFromStringNode(stringNode) {
    if (stringNode === null || stringNode.type !== 'string')
        return undefined;
    for (const child of stringNode.namedChildren) {
        if (child !== null && child.type === 'string_fragment')
            return child.text;
    }
    // Empty string literal ('') has no string_fragment child.
    return '';
}
/** Read the specifier from a node that carries a `source` field (import/export/import_require_clause). */
function specifierFromSource(node) {
    return specifierFromStringNode(node.childForFieldName('source'));
}
/**
 * Specifier from a dynamic-import / require ARGUMENT. Accepts a plain `string`
 * literal, OR a no-substitution `template_string` (a backtick literal with no
 * `${…}`) — both are static and statically resolvable, and TS/esbuild/Node treat
 * them identically. An INTERPOLATED template literal is genuinely non-static and
 * yields undefined (skipped), as do identifiers and other non-literal expressions.
 */
function specifierFromCallArg(arg) {
    if (arg.type === 'string')
        return specifierFromStringNode(arg);
    if (arg.type !== 'template_string')
        return undefined;
    let fragment;
    for (const child of arg.namedChildren) {
        if (child === null)
            continue;
        if (child.type === 'template_substitution')
            return undefined; // interpolated → non-static
        if (child.type === 'string_fragment')
            fragment = child.text;
    }
    // Empty template (``) has no string_fragment → ''. emit() ignores ''.
    return fragment ?? '';
}
/** A specifier with a URL scheme (`node:fs`, `https://…`, `virtual:x`, `data:…`) never names a repository file. */
const URL_SCHEME = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;
/** True when a specifier may name a repository file (relative, root-absolute, `#imports` or bare). */
function isCandidateSpecifier(specifier) {
    return specifier !== '' && !URL_SCHEME.test(specifier);
}
/** First argument of a call_expression / new_expression, or null. */
function argumentAt(call, index) {
    const args = call.childForFieldName('arguments');
    if (args === null)
        return null;
    let seen = 0;
    for (const arg of args.namedChildren) {
        if (arg === null || arg.type === 'comment')
            continue;
        if (seen === index)
            return arg;
        seen++;
    }
    return null;
}
// The calls of Vitest's `vi` and Jest's `jest` whose first argument is the path of a module they replace, load or restore.
const MODULE_CALLS = new Map([
    ['vi', new Set(['mock', 'doMock', 'unmock', 'doUnmock', 'importActual', 'importMock'])],
    ['jest', new Set(['mock', 'doMock', 'unmock', 'dontMock', 'deepUnmock', 'setMock', 'requireActual', 'requireMock', 'createMockFromModule'])],
]);
// Jest's module calls that return the `jest` object, so another call can be chained on them; Vitest's return nothing to chain on, and `requireActual` returns the module.
const JEST_CHAINED = new Set(['mock', 'doMock', 'unmock', 'dontMock', 'deepUnmock', 'setMock']);
/** The callee of a call that names a module by its path: `vi.mock(…)`, `jest.requireActual(…)` and the other {@link MODULE_CALLS}, also on a chain of Jest's (`jest.mock('a').mock('b')`). `chains` remembers, by node id, which calls of the file are such a Jest chain, so a long chain is read once. */
function isMockCallee(fn, chains) {
    if (fn.type !== 'member_expression')
        return false;
    const object = fn.childForFieldName('object');
    const property = fn.childForFieldName('property');
    if (object === null || property === null)
        return false;
    const mocker = object.type === 'identifier' ? object.text : isJestChain(object, chains) ? 'jest' : undefined;
    return mocker !== undefined && MODULE_CALLS.get(mocker)?.has(property.text) === true;
}
/** Whether a node is a call of a {@link JEST_CHAINED} method on `jest` or on such a call, which returns the `jest` object. The chain is walked down without recursion, so a long one cannot exhaust the stack. */
function isJestChain(node, chains) {
    const pending = [];
    let answer;
    let at = node;
    while (answer === undefined) {
        if (at === null || at.type !== 'call_expression') {
            answer = false;
            break;
        }
        answer = chains.get(at.id);
        if (answer !== undefined)
            break;
        const fn = at.childForFieldName('function');
        const object = fn?.type === 'member_expression' ? fn.childForFieldName('object') : null;
        const property = fn?.type === 'member_expression' ? fn.childForFieldName('property') : null;
        pending.push(at);
        if (object === null || property === null || !JEST_CHAINED.has(property.text))
            answer = false;
        else if (object.type === 'identifier')
            answer = object.text === 'jest';
        else
            at = object;
    }
    // Every call on the way down is a chain exactly when the innermost one is: a link that is no chained call ended the walk with false.
    for (const call of pending)
        chains.set(call.id, answer);
    return answer;
}
/** True for the expression `import.meta.url`. */
function isImportMetaUrl(node) {
    if (node === null || node.type !== 'member_expression')
        return false;
    const object = node.childForFieldName('object');
    const property = node.childForFieldName('property');
    return object !== null && object.type === 'meta_property' && object.text.replace(/\s+/g, '') === 'import.meta'
        && property !== null && property.text === 'url';
}
/**
 * Line-anchored statement forms rescanned inside ERROR regions. The clause
 * between the keyword and `from` is restricted to the characters an import or
 * re-export clause can hold (identifiers, braces, commas, `*`, whitespace), so
 * an expression or a string that merely contains the word `from` never matches.
 */
const RECOVERY_PATTERNS = [
    // import x from '…' · import { a, type B } from '…' · import * as ns from '…' · import type … · import defer * as …
    // export { a } from '…' · export * from '…' · export * as ns from '…' · export type { … } from '…'
    // A type-only one may carry `with { 'resolution-mode': 'import' }`, which groups 4 and 5 read.
    /^[ \t]*(?:import|export)\b([\w$\s{},*]*?)\bfrom[ \t]*(['"])([^'"\r\n]+)\2(?:\s*(?:with|assert)\s*\{\s*(['"])resolution-mode\4\s*:\s*(['"])(import|require)\5\s*,?\s*\})?/gm,
    // import './side-effect'
    /^[ \t]*import()[ \t]*(['"])([^'"\r\n]+)\2/gm,
    // import x = require('…') · export import x = require('…') · import type x = require('…')
    /^[ \t]*(?:export[ \t]+)?import([ \t]+(?:type[ \t]+)?)[\w$]+[ \t]*=[ \t]*require[ \t]*\([ \t]*(['"])([^'"\r\n]+)\2/gm,
];
/** The call form a `resolution-mode` value stands for: `require` reads as a `require()` does, `import` is `'esm'`, the `import` condition whatever the file and the module setting. Any other value is no mode. */
function modeOf(value) {
    return value === 'require' ? 'require' : value === 'import' ? 'esm' : undefined;
}
/** The mode a `{ 'resolution-mode': '…' }` object names, or undefined. */
function modeOfAttributes(object) {
    if (object === null || object === undefined || object.type !== 'object')
        return undefined;
    // A list of more than the one entry is reported by the compiler, which resolves by the format of the file.
    if (object.namedChildren.filter((c) => c !== null && c.type !== 'comment').length !== 1)
        return undefined;
    for (const pair of object.namedChildren) {
        if (pair === null || pair.type !== 'pair')
            continue;
        if (specifierFromStringNode(pair.childForFieldName('key')) === 'resolution-mode')
            return modeOf(specifierFromStringNode(pair.childForFieldName('value')));
    }
    return undefined;
}
/** The mode the `resolution-mode` attribute of a type-only import declaration names (`import type … from 'x' with { 'resolution-mode': 'import' }`), or undefined. The compiler reads the attribute only where the whole declaration is type-only, so an inline `import { type T }` and a value import carry none. */
function modeOfImportStatement(node) {
    if (node.child(1)?.type !== 'type')
        return undefined;
    const attribute = node.namedChildren.find((c) => c !== null && c.type === 'import_attribute');
    return attribute === null || attribute === undefined ? undefined : modeOfAttributes(attribute.namedChild(0));
}
/** The mode the options of an import type name (`import('x', { with: { 'resolution-mode': 'import' } }).T`), or undefined. */
function modeOfImportType(call) {
    const options = argumentAt(call, 1);
    if (options === null || options.type !== 'object')
        return undefined;
    for (const pair of options.namedChildren) {
        if (pair === null || pair.type !== 'pair')
            continue;
        const key = pair.childForFieldName('key')?.text;
        if (key === 'with' || key === 'assert')
            return modeOfAttributes(pair.childForFieldName('value'));
    }
    return undefined;
}
/** Zero-based rows touched by any ERROR node in the tree (empty for an error-free parse). An ERROR node's rows hold those of every node below it, so the walk does not descend into one: each row is added once per outermost ERROR, not once per nested one. */
function errorRows(root) {
    const rows = new Set();
    if (!root.hasError)
        return rows;
    walk(root, (node) => {
        if (node.type !== 'ERROR')
            return undefined;
        for (let r = node.startPosition.row; r <= node.endPosition.row; r++)
            rows.add(r);
        return false;
    });
    return rows;
}
/**
 * Re-find import/re-export statements the grammar swallowed into an ERROR
 * region. A match counts only when one of the rows it spans is touched by an
 * ERROR node, so a clean parse (the common case) never runs a regex at all and
 * a regex never second-guesses a statement the grammar parsed. Returns
 * (specifier, 1-based line of the statement keyword) pairs.
 */
function recoverFromErrors(file) {
    const rows = errorRows(file.tree.rootNode);
    if (rows.size === 0)
        return [];
    const out = [];
    const content = file.content;
    // Row of every offset, computed lazily from newline positions.
    const lineStarts = [0];
    for (let i = 0; i < content.length; i++)
        if (content.charCodeAt(i) === 10)
            lineStarts.push(i + 1);
    const rowOf = (offset) => {
        let lo = 0;
        let hi = lineStarts.length - 1;
        while (lo < hi) {
            const mid = (lo + hi + 1) >> 1;
            if (lineStarts[mid] <= offset)
                lo = mid;
            else
                hi = mid - 1;
        }
        return lo;
    };
    for (const pattern of RECOVERY_PATTERNS) {
        pattern.lastIndex = 0;
        let m;
        while ((m = pattern.exec(content)) !== null) {
            const keywordOffset = m.index + (m[0].length - m[0].trimStart().length);
            const first = rowOf(keywordOffset);
            const last = rowOf(m.index + m[0].length - 1);
            let touched = false;
            for (let r = first; r <= last && !touched; r++)
                touched = rows.has(r);
            if (!touched)
                continue;
            const mode = m[6] !== undefined && /^\s*type\b/.test(m[1]) ? modeOf(m[6]) : undefined;
            out.push(mode === undefined ? { specifier: m[3], line: first + 1 } : { specifier: m[3], line: first + 1, mode });
        }
    }
    return out;
}
/** True for a pattern ambient module name (`*.css`, `virtual:*`), which names no module. */
function isWildcardModuleName(name) {
    return name.includes('*');
}
/** True when the file is an ES module: a top-level import or export statement. */
function isModuleFile(root) {
    return root.namedChildren.some((c) => c !== null && (c.type === 'import_statement' || c.type === 'export_statement'));
}
/**
 * The specifier of a module augmentation `declare module '<spec>' { … }`, or
 * undefined when the header is an ambient module declaration instead. A relative
 * name is always an augmentation (TypeScript rejects a relative ambient name); any
 * other non-wildcard name is an augmentation only inside a module file.
 */
function augmentationSpecifier(moduleNode, inModuleFile) {
    const name = moduleNode.childForFieldName('name');
    if (name === null || name.type !== 'string')
        return undefined;
    const spec = specifierFromStringNode(name);
    if (spec === undefined || isWildcardModuleName(spec))
        return undefined;
    if (spec.startsWith('.') || inModuleFile)
        return spec;
    return undefined;
}
// The grammar reads `typeof import('x')` and `import('x').T` as call expressions inside these type nodes.
const TYPE_POSITION_ANCESTORS = new Set([
    'type_query',
    'type_annotation',
    'type_predicate',
    'conditional_type',
    'readonly_type',
    'infer_type',
    'index_type_query',
    'lookup_type',
    'parenthesized_type',
    'type_arguments',
    'constraint',
    'default_type',
    'union_type',
    'intersection_type',
    'tuple_type',
    'array_type',
    'generic_type',
    'function_type',
    'object_type',
]);
// Nodes whose first named child is a value or a name and whose other named children are types.
const TYPE_ON_THE_RIGHT = new Set(['type_alias_declaration', 'as_expression', 'satisfies_expression']);
// The grammar cannot read an import type in some places and parses the line as expressions, in an ERROR node or not. Where a token that only introduces a type comes right before the import chain, the chain is a type.
const TYPE_INTRODUCERS = new Set(['keyof', 'is', 'infer', 'readonly', 'unique', '|', '&', '${']);
/** The import() call at the foot of `import('x')`, `import('x').T` or `import('x').T.U`, or undefined when the node is not such a chain. */
function importCallOf(node) {
    let cur = node;
    while (cur !== null && cur.type === 'member_expression')
        cur = cur.childForFieldName('object');
    return cur !== null && cur.type === 'call_expression' && cur.childForFieldName('function')?.type === 'import' ? cur : undefined;
}
/**
 * The import() calls a node's own children make import types where the grammar does not say so: the one type argument of `B<import('x').T>` read as `B < import('x').T > …` (a class heritage, a tagged template, a call, whose `>` and parameters come as an ERROR node beside the comparison, found among the children of the node that holds both), an import chain in the pattern of a parameter, where a parenthesized type `(import('x').T)` was read as an arrow function's parameters, and a chain after a token that only introduces a type inside an ERROR node (`keyof`, a template literal type's `${`).
 */
function misreadImportTypes(node) {
    const found = [];
    const add = (chain) => {
        const call = importCallOf(chain);
        if (call !== undefined)
            found.push(call);
    };
    if (node.type === 'binary_expression' && node.childForFieldName('operator')?.type === '>') {
        const left = node.childForFieldName('left');
        if (left !== null && left.type === 'binary_expression' && left.childForFieldName('operator')?.type === '<')
            add(left.childForFieldName('right'));
    }
    else if (node.type === 'required_parameter' || node.type === 'optional_parameter') {
        add(node.namedChild(0));
    }
    // Only a node that holds an ERROR node can hold either shape below, so a file that parses cleanly lists no children here.
    if (!node.hasError)
        return found;
    const children = node.children;
    for (let i = 1; i < children.length; i++) {
        const before = children[i - 1];
        const here = children[i];
        if (before === null || here === null)
            continue;
        // `g<import('x').T>()`: the `>` and the empty parameters that follow are an ERROR node beside the comparison. Read from the parent, because tree-sitter finds a node's next sibling by searching down from the root.
        if (here.type === 'ERROR' && before.type === 'binary_expression' && here.child(0)?.type === '>' && before.childForFieldName('operator')?.type === '<')
            add(before.childForFieldName('right'));
        if (node.type === 'ERROR' && !before.isNamed && TYPE_INTRODUCERS.has(before.type))
            add(here);
    }
    return found;
}
function uses(file) {
    const out = [];
    const seen = new Set();
    const mockChains = new Map();
    const emitAt = (specifier, line, callForm) => {
        if (specifier === undefined || !isCandidateSpecifier(specifier))
            return;
        const dedupKey = `${specifier}\n${line}\n${callForm ?? ''}`;
        if (seen.has(dedupKey))
            return;
        seen.add(dedupKey);
        out.push(single(callForm === undefined ? { kind: 'path', specifier } : { kind: 'path', specifier, callForm }, 'import', line));
    };
    const emit = (specifier, node, callForm) => emitAt(specifier, node.startPosition.row + 1, callForm);
    const inModuleFile = isModuleFile(file.tree.rootNode);
    // Whether a node lies in a type, carried down the walk: an import('x') there is an import type, which TypeScript resolves by the format of its file as an import statement is, not a dynamic import() call.
    const typeSide = new Set();
    walkScoped(file.tree.rootNode, false, (node, inheritedInType) => {
        const inType = inheritedInType || typeSide.has(node.id);
        if (TYPE_ON_THE_RIGHT.has(node.type))
            for (const c of node.namedChildren.slice(1))
                if (c !== null)
                    typeSide.add(c.id);
        for (const call of misreadImportTypes(node))
            typeSide.add(call.id);
        switch (node.type) {
            case 'import_statement': {
                // Every form gives its edge, type-only ones included (`import type …`,
                // `import { type A }`, `import type x = require('./e')`).
                // `import x = require('./e')` — the source sits on import_require_clause. Every
                // other form carries its source on the statement itself.
                const requireClause = node.namedChildren.find((c) => c !== null && c.type === 'import_require_clause');
                if (requireClause) {
                    emit(specifierFromSource(requireClause), node, 'require');
                    break;
                }
                emit(specifierFromSource(node), node, modeOfImportStatement(node));
                break;
            }
            case 'export_statement': {
                // A `source` field is present ONLY on re-exports (`export ... from '...'`,
                // `export * from '...'`). A local export has none. `export type { … } from`,
                // `export type * from` and an all-inline-type clause give their edge too.
                emit(specifierFromSource(node), node);
                break;
            }
            case 'call_expression': {
                const fn = node.childForFieldName('function');
                if (fn === null)
                    break;
                // Dynamic import: callee is a node of type `import` (not an identifier).
                // Require: callee is an identifier whose text is `require`.
                const isDynamicImport = fn.type === 'import';
                const isRequire = fn.type === 'identifier' && fn.text === 'require';
                const isMock = isMockCallee(fn, mockChains);
                if (!isDynamicImport && !isRequire && !isMock)
                    break;
                // An import type (`typeof import('./x')`, `let v: import('./x').T`) is a
                // dependency like a value-position import() and gives the same edge.
                const arg = argumentAt(node, 0);
                if (arg === null)
                    break;
                // A plain string literal OR a no-substitution template literal yields a
                // static specifier; an interpolated template literal / identifier / other
                // expression is non-literal and skipped (specifierFromCallArg returns undefined).
                emit(specifierFromCallArg(arg), node, isRequire ? 'require' : inType ? modeOfImportType(node) : 'import');
                break;
            }
            case 'module': {
                // `declare module './x' { … }` augments ./x (see augmentationSpecifier).
                emit(augmentationSpecifier(node, inModuleFile), node);
                break;
            }
            case 'new_expression': {
                // `new URL('./worker.js', import.meta.url)` — the asset/worker reference form
                // bundlers (Vite, webpack 5, Parcel, esbuild) resolve relative to the module.
                // URL resolution treats a plain 'worker.js' as relative too, so it is emitted
                // as './worker.js'. Only a literal first argument AND a literal
                // `import.meta.url` base count; any other base is a runtime URL.
                const ctor = node.childForFieldName('constructor');
                if (ctor === null || ctor.type !== 'identifier' || ctor.text !== 'URL')
                    break;
                if (!isImportMetaUrl(argumentAt(node, 1)))
                    break;
                const first = argumentAt(node, 0);
                const spec = first === null ? undefined : specifierFromCallArg(first);
                if (spec === undefined || spec === '' || URL_SCHEME.test(spec) || spec.startsWith('//'))
                    break;
                emit(spec.startsWith('.') || spec.startsWith('/') ? spec : `./${spec}`, node);
                break;
            }
            default:
                break;
        }
        return inType || TYPE_POSITION_ANCESTORS.has(node.type) ? true : undefined;
    });
    for (const { specifier, line, mode } of recoverFromErrors(file)) {
        // The grammar reads a `with` clause that starts on the next line as a statement of its own, so the walk has read the declaration without its mode; the recovery reads it with the mode, and replaces that reading.
        if (mode !== undefined) {
            const bare = out.findIndex((d) => d.line === line && d.candidates.length === 1 && d.candidates[0].kind === 'path' && d.candidates[0].specifier === specifier && d.candidates[0].callForm === undefined);
            if (bare !== -1)
                out.splice(bare, 1);
        }
        emitAt(specifier, line, mode);
    }
    return out;
}
const TOP_LEVEL_DECLARATION_TYPES = new Set([
    'class_declaration',
    'abstract_class_declaration',
    'interface_declaration',
    'function_declaration',
    'enum_declaration',
]);
/** The declarations at module top level, in document order: each one directly under `program`, or wrapped in an `export_statement` that is itself directly under `program`. They are read as the children of those two nodes, never by asking a node for its parent, which tree-sitter answers by searching down from the root, so the cost grows with the size of the file for every declaration asked about. A root that is no `program` (a file the grammar could not read as one) holds none. */
function declarations(file) {
    const out = [];
    const root = file.tree.rootNode;
    if (root.type !== 'program')
        return out;
    const declare = (node) => {
        if (!TOP_LEVEL_DECLARATION_TYPES.has(node.type))
            return;
        const nameNode = node.childForFieldName('name');
        if (nameNode !== null)
            out.push({ symbolKey: nameNode.text, line: node.startPosition.row + 1 });
    };
    for (const child of root.children) {
        if (child === null)
            continue;
        declare(child);
        if (child.type === 'export_statement')
            for (const inner of child.children)
                if (inner !== null)
                    declare(inner);
    }
    return out;
}
export const typescriptExtractor = {
    languages: new Set(['typescript', 'tsx', 'javascript']),
    // rev 5: a type-only import or re-export and an import type that carry the `resolution-mode` attribute carry the mode it names, `require` or `esm`;
    // rev 4: a require() call or `import x = require()` and a dynamic import() (not an import type) carry
    // their call form, which picks the `require` or `import` condition of an `exports` entry;
    // rev 3: every type-only reference gives its edge (statement forms, type-position
    // import(), `import type = require`) and a module augmentation names its module.
    // rev 2: bare/`#`/root-absolute specifiers emit (the resolver decides);
    // `new URL(…, import.meta.url)`; ERROR-region recovery.
    // rev 10: the other calls of `vi` and `jest` that take a module's path, and a chained `jest.mock('a').mock('b')`, give the use `vi.mock` gives.
    rev: 10,
    declarations,
    uses,
};
const SFC_EXTENSIONS = new Set(['.vue', '.svelte']);
/** Elements whose content an HTML tokenizer reads as raw text, where a `<!--` is text. */
const RAW_TEXT_ELEMENTS = new Set(['iframe', 'noembed', 'noframes', 'noscript', 'style', 'textarea', 'title', 'xmp']);
/**
 * The `<script>` elements of a component, in document order. The markup is read as an
 * HTML tokenizer reads it: a `<!--` starts a comment only in markup text, so inside an
 * attribute value, a raw-text element, a Svelte `{…}` expression or a script body it is
 * text. A comment is skipped whole, and a `<!--` with no `-->` after it is text too.
 */
function scriptElements(content, svelte) {
    const elements = [];
    const scriptOpen = /<script\b([^>]*)>/iy;
    const scriptClose = /<\/script\s*>/gi;
    const tagName = /[A-Za-z][^\s/>]*/y;
    let i = 0;
    let inTag = false;
    let quote = '';
    let previous = '';
    let name = '';
    let raw = '';
    let depth = 0;
    let stringQuote = '';
    // A search that finds no `-->` settles it for the rest of the component: no later `<!--` has one either.
    let noClose = false;
    while (i < content.length) {
        if (content[i] === '<') {
            scriptOpen.lastIndex = i;
            const open = scriptOpen.exec(content);
            if (open !== null) {
                const bodyStart = i + open[0].length;
                scriptClose.lastIndex = bodyStart;
                const close = scriptClose.exec(content);
                if (close === null)
                    break;
                elements.push({ attributes: open[1], tagStart: i, bodyStart, bodyEnd: close.index });
                i = close.index + close[0].length;
                inTag = false;
                quote = '';
                raw = '';
                depth = 0;
                stringQuote = '';
                continue;
            }
        }
        const c = content[i];
        if (raw !== '') {
            if (c === '<' && content.slice(i + 1, i + 2 + raw.length).toLowerCase() === `/${raw}`)
                raw = '';
            i++;
        }
        else if (depth > 0) {
            if (stringQuote !== '') {
                if (c === '\\')
                    i++;
                else if (c === stringQuote)
                    stringQuote = '';
            }
            else if (c === '"' || c === "'" || c === '`') {
                stringQuote = c;
            }
            else if (c === '{') {
                depth++;
            }
            else if (c === '}') {
                depth--;
            }
            i++;
        }
        else if (inTag) {
            const before = previous;
            if (!/\s/.test(c))
                previous = c;
            if (quote !== '') {
                if (c === quote)
                    quote = '';
            }
            else if ((c === '"' || c === "'") && before === '=') {
                quote = c;
            }
            else if (svelte && c === '{') {
                depth = 1;
            }
            else if (c === '>') {
                inTag = false;
                raw = RAW_TEXT_ELEMENTS.has(name) ? name : '';
            }
            i++;
        }
        else if (!noClose && content.startsWith('<!--', i)) {
            // `<!-->` and `<!--->` end the comment at once, as HTML reads them.
            const end = content.indexOf('-->', i + 2);
            if (end === -1)
                noClose = true;
            i = end === -1 ? i + 4 : end + 3;
        }
        else if (svelte && c === '{') {
            depth = 1;
            i++;
        }
        else {
            tagName.lastIndex = i + 1;
            const tag = c === '<' ? tagName.exec(content) : null;
            if (tag === null) {
                i++;
            }
            else {
                inTag = true;
                previous = '';
                name = tag[0].toLowerCase();
                i += 1 + tag[0].length;
            }
        }
    }
    return elements;
}
const SRC_ATTRIBUTE = /(?<=\s)src\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/i;
const SRC_RELATIVE = /^\.\.?\/[^"'\\\r\n]*$/;
/**
 * The import an element with a relative `src` and no body stands for, as `import "<src>";`.
 * It is written over the element's own tag, and only where it fits on the line the tag
 * starts on: the view must keep every line of the component where it was.
 */
function srcImport(element, content) {
    if (content.slice(element.bodyStart, element.bodyEnd).trim() !== '')
        return undefined;
    const m = SRC_ATTRIBUTE.exec(element.attributes);
    const src = m?.[1] ?? m?.[2] ?? m?.[3];
    if (src === undefined || !SRC_RELATIVE.test(src))
        return undefined;
    const text = `import "${src}";`;
    const lineEnd = content.indexOf('\n', element.tagStart);
    const roomEnd = Math.min(element.bodyStart, lineEnd === -1 ? content.length : lineEnd);
    return element.tagStart + text.length <= roomEnd ? text : undefined;
}
/**
 * Vue and Svelte single-file components carry their imports in `<script>` blocks
 * (`<script>`, `<script setup lang="ts">`, `<script context="module">`). No shipped
 * grammar parses a whole component, so the relation pass parses a VIEW of it: every
 * byte outside a script body becomes a space (newlines are kept, so every line
 * number is the component's own), and the view is parsed with the TS, TSX or JS
 * grammar the blocks' `lang` names (`ts`/`typescript` → TS, `tsx` → TSX, otherwise
 * JS). Returns null for any other file, or a component with no script block outside
 * its HTML comments. A script element with a `src` and no body stands for the file it
 * names, as an import written over its own tag.
 */
export function sfcScriptView(filePath, content) {
    if (!SFC_EXTENSIONS.has(path.posix.extname(filePath).toLowerCase()))
        return null;
    const elements = scriptElements(content, path.posix.extname(filePath).toLowerCase() === '.svelte');
    if (elements.length === 0)
        return null;
    let language = 'javascript';
    for (const element of elements) {
        const lang = /\blang\s*=\s*["']?([\w-]+)/i.exec(element.attributes)?.[1]?.toLowerCase();
        if (lang === 'tsx')
            language = 'tsx';
        else if ((lang === 'ts' || lang === 'typescript') && language !== 'tsx')
            language = 'typescript';
    }
    let view = '';
    let cursor = 0;
    const blank = (s) => s.replace(/[^\n]/g, ' ');
    for (const element of elements) {
        const injected = srcImport(element, content);
        const head = injected === undefined
            ? blank(content.slice(cursor, element.bodyStart))
            : blank(content.slice(cursor, element.tagStart)) + injected + blank(content.slice(element.tagStart + injected.length, element.bodyStart));
        view += head + content.slice(element.bodyStart, element.bodyEnd);
        cursor = element.bodyEnd;
    }
    view += blank(content.slice(cursor));
    const ext = language === 'typescript' ? '.ts' : language === 'tsx' ? '.tsx' : '.js';
    return { language, parsePath: filePath + ext, content: view };
}
