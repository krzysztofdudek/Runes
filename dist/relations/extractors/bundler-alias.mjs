import path from 'node:path';
/** The configuration files read, by name, and the bundler each belongs to. */
export const BUNDLER_CONFIG_FILES = [
    ...['ts', 'js', 'mjs', 'mts', 'cjs'].map((ext) => [`vite.config.${ext}`, 'vite']),
    ...['js', 'ts', 'cjs', 'mjs'].map((ext) => [`webpack.config.${ext}`, 'webpack']),
    ...['js', 'json', 'cjs', 'mjs'].map((ext) => [`babel.config.${ext}`, 'babel']),
    ['.babelrc', 'babel'],
    ['.babelrc.json', 'babel'],
];
/**
 * The aliases a bundler configuration defines, read from its text without running it: one list per `alias` property found, each in the order the bundler tries its keys. The configuration is what the file exports, read as {@link configurationObjects} says; `'unknown'` when it exports anything else, so any bare specifier may be mapped, and when the text holds an alias the reader cannot follow: an `alias` anywhere but as a literal object (or, for Vite, a literal array of `{ find, replacement }`) under the `resolve` (Vite also `test`) of a configuration object, or in the options of module-resolver in the `plugins` of one; module-resolver referenced in any other way, with a `root`, `cwd` or `resolvePath` option, or with options it cannot read; or text the token reader cannot balance. A list is one unknown entry when the alias object holds a member that may replace a key the lookup reads (a spread, a computed or escaped key, a method or accessor, a key written twice, or a shorthand of `alias`), and for each configuration object, whether or not it writes an alias, that may take one from something the reader does not see: a member it cannot read; a spread that a key the lookup reads (`resolve` and `test` for Vite, `resolve` for webpack, `plugins` for Babel) does not follow; an `extends` (webpack, Babel); a `resolve` or `test` that is not a literal object, or one whose own members may hide an `alias` (read as the alias object is); a Babel `plugins` that is not a literal array (or one filtered with `.filter(…)`, which only drops plugins) or that spreads another. A value is literal when it is written there or bound by a name the file declares once with it and never assigns again.
 *
 * A replacement counts only in these forms; any other is an alias whose key is known and whose target is not:
 * - `path.resolve(__dirname, '<p>', …)` and `path.join(__dirname, '<p>', …)`, with `path` imported from Node's `path` and no `__dirname` declared by the file, and `fileURLToPath(new URL('<p>', import.meta.url))`: `<p>` from the configuration's directory;
 * - a string: for Vite one starting with `/` from the project root, the configuration's directory (unless the file sets a `root`); for Babel one starting with `./` or `../` from module-resolver's working directory, which the reader takes to be the configuration's directory, where Babel runs; for all three a bare string is another request, as the bundler reads it. Vite and webpack resolve a relative string from the importing file, so it is not read.
 */
export function readBundlerAliases(text, kind, configDir) {
    const tokens = tokenize(text);
    if (tokens === undefined)
        return 'unknown';
    const { close, open, parent } = brackets(tokens);
    const structure = configurationObjects(tokens, close, open, parent);
    if (structure === 'unknown')
        return 'unknown';
    const configs = structure.objects;
    const isKey = (i) => (tokens[i].t === 'id' || tokens[i].t === 'str') && tokens[i + 1]?.v === ':' && tokens[i + 1].t === 'punct' && (tokens[i - 1]?.v === '{' || tokens[i - 1]?.v === ',') && tokens[i - 1].t === 'punct';
    const keyOf = (at) => (at >= 2 && tokens[at - 1].v === ':' && isKey(at - 2) ? tokens[at - 2].v : undefined);
    const env = {
        kind,
        configDir,
        pathImported: tokens.some((tok) => tok.t === 'str' && (tok.v === 'path' || tok.v === 'node:path')),
        rootSet: kind === 'vite' && tokens.some((tok, i) => tok.v === 'root' && isKey(i)),
        dirnameDeclared: tokens.some((tok, i) => tok.t === 'id' && tok.v === '__dirname' && declares(tokens, close, parent, i)),
    };
    // The members of each object read once: an object that many `alias` properties share is not read again for each.
    const memberCache = new Map();
    const members = (at) => {
        if (!memberCache.has(at))
            memberCache.set(at, membersOf(tokens, close, at));
        return memberCache.get(at);
    };
    // Whether every spread among the members comes before each of the names, which then replaces what the spread wrote.
    const followed = (all, names) => {
        const last = new Map();
        all.forEach((m, k) => {
            if (!m.spread)
                last.set(m.key, k);
        });
        return all.every((m, k) => !m.spread || names.every((name) => (last.get(name) ?? -1) > k));
    };
    // Whether the object holds every member as a key it can read, none of them a shorthand of a name the lookup reads, and every spread before each of those names.
    const readable = (at, names) => {
        const all = members(at);
        return all !== undefined && followed(all, names) && all.every((m) => !(m.shorthand && names.includes(m.key)));
    };
    // Each configuration object whose members may take an alias from something the reader does not see.
    const reads = kind === 'vite' ? ['resolve', 'test'] : kind === 'webpack' ? ['resolve'] : ['plugins'];
    const want = kind === 'babel' ? '[' : '{';
    const literalOf = (m, scope) => {
        const at = m.shorthand ? m.end - 1 : m.value;
        if (at < m.end && tokens[at].t === 'id' && m.end === at + 1) {
            const bound = structure.named(scope, tokens[at].v);
            if (bound === undefined || tokens[bound.at].v !== want || tokens[bound.at].t !== 'punct')
                return undefined;
            return structure.endsDeclaration(filtered(bound.at)) ? bound.at : undefined;
        }
        return at < m.end && tokens[at].v === want && tokens[at].t === 'punct' && filtered(at) === m.end ? at : undefined;
    };
    // Past a Babel `plugins` array, a `.filter(…)` on it, which can only drop a plugin.
    const filtered = (at) => {
        const after = close[at] + 1;
        return kind === 'babel' && tokens[after]?.v === '.' && tokens[after + 1]?.v === 'filter' && tokens[after + 2]?.v === '(' ? close[after + 2] + 1 : after;
    };
    const shownCache = new Map();
    const showsAll = (at) => {
        if (!shownCache.has(at))
            shownCache.set(at, kind === 'babel' ? segments(tokens, close, at).every(([s]) => tokens[s].v !== '...' || tokens[s].t !== 'punct') : readable(at, ['alias']));
        return shownCache.get(at);
    };
    const unread = new Set();
    for (const [config, scope] of configs) {
        const all = members(config);
        const whole = all !== undefined &&
            followed(all, reads) &&
            (kind === 'vite' || all.every((m) => m.spread || m.key !== 'extends')) &&
            all.every((m) => {
                if (m.spread || !reads.includes(m.key))
                    return true;
                const at = literalOf(m, scope);
                return at !== undefined && showsAll(at);
            });
        if (!whole)
            unread.add(config);
    }
    // The configuration objects an alias stands in, which give their list (or an unknown one) through it.
    const covered = new Set();
    // The options objects of module-resolver, written `['module-resolver', { … }]`.
    const resolverOptions = new Set();
    for (let i = 0; i < tokens.length; i++) {
        const tok = tokens[i];
        if (tok.t !== 'str' || (tok.v !== 'module-resolver' && tok.v !== 'babel-plugin-module-resolver'))
            continue;
        const before = tokens[i - 1]?.v;
        const after = tokens[i + 1]?.v;
        if ((before !== '[' && before !== ',') || (after !== ']' && after !== ','))
            return 'unknown';
        // A plugin listed by its name alone takes no options.
        if (before === ',' || after === ']')
            continue;
        const next = tokens[i + 2];
        if (next?.v === ']' || next?.t === 'str')
            continue;
        if (next?.v !== '{' || tokens[close[i + 2] + 1]?.v !== ']')
            return 'unknown';
        const options = members(i + 2);
        if (options === undefined || options.some((m) => m.spread || m.shorthand || ['root', 'cwd', 'resolvePath'].includes(m.key)))
            return 'unknown';
        // The pair stands in the `plugins` of a configuration object itself: `overrides` and `env` apply theirs to some files only.
        const list = parent[i - 1];
        const config = list === -1 ? -1 : parent[list];
        if (list === -1 || tokens[list].v !== '[' || keyOf(list) !== 'plugins' || !configs.has(config) || unread.has(config))
            return 'unknown';
        covered.add(config);
        resolverOptions.add(i + 2);
    }
    const lists = [];
    for (let i = 0; i < tokens.length; i++) {
        if (tokens[i].v !== 'alias' || (tokens[i].t !== 'id' && tokens[i].t !== 'str'))
            continue;
        if (!isKey(i))
            return 'unknown';
        const owner = parent[i];
        const ownerKey = keyOf(owner);
        const placed = kind === 'babel' ? resolverOptions.has(owner) : ownerKey === 'resolve' || (kind === 'vite' && ownerKey === 'test');
        if (!placed)
            return 'unknown';
        const config = parent[owner];
        if (kind !== 'babel' && !configs.has(config))
            return 'unknown';
        if (kind !== 'babel')
            covered.add(config);
        if (!readable(owner, ['alias']) || (kind !== 'babel' && unread.has(config))) {
            lists.push([UNKNOWN_KEY]);
            continue;
        }
        const at = i + 2;
        const value = tokens[at];
        const ends = (k) => tokens[k]?.v === ',' || tokens[k]?.v === '}';
        if (value?.v === '{' && ends(close[at] + 1))
            lists.push(objectEntries(tokens, close, at, env));
        else if (kind === 'vite' && value?.v === '[' && ends(close[at] + 1))
            lists.push(arrayEntries(tokens, close, at, env));
        else
            lists.push([{ exact: false, replacement: { kind: 'unknown' } }]);
    }
    for (const config of unread)
        if (!covered.has(config))
            lists.push([UNKNOWN_KEY]);
    return lists;
}
/** What the aliases make of a bare specifier: the first entry that matches decides, an entry with an unreadable key matches anything, and undefined is no match. */
export function applyBundlerAliases(spec, entries) {
    for (const entry of entries) {
        if (entry.find === undefined)
            return { kind: 'unknown' };
        const matches = spec === entry.find || (!entry.exact && spec.startsWith(`${entry.find}/`));
        if (!matches)
            continue;
        const rest = spec.slice(entry.find.length);
        const { replacement } = entry;
        if (replacement.kind === 'unknown' || rest === '')
            return replacement;
        if (replacement.kind === 'request')
            return { kind: 'request', request: replacement.request + rest };
        return joinInside(replacement.path, rest.slice(1));
    }
    return undefined;
}
/** More alias lists than any configuration writes by hand: a file with more is not read, so a crafted one cannot make each import slow. */
export const MAX_ALIAS_LISTS = 64;
/** Adds the key of entry `k` to the trie under `root`, splitting the edge where the key leaves it. Linear in the length of the key. */
function addKey(root, key, k, exact) {
    let node = root;
    let at = 0;
    while (at < key.length) {
        const first = key[at];
        const child = node.children?.get(first);
        if (child === undefined) {
            const leaf = { label: key, from: at, to: key.length };
            (node.children ??= new Map()).set(first, leaf);
            node = leaf;
            break;
        }
        let same = 1;
        const length = child.to - child.from;
        while (same < length && at + same < key.length && child.label[child.from + same] === key[at + same])
            same++;
        if (same < length) {
            const middle = { label: child.label, from: child.from, to: child.from + same, children: new Map([[child.label[child.from + same], child]]) };
            child.from += same;
            node.children.set(first, middle);
            node = middle;
        }
        else
            node = child;
        at += same;
    }
    node.any ??= k;
    if (!exact)
        node.loose ??= k;
}
/** The {@link AliasTable} of alias lists that all apply, one list `'unknown'` where a configuration cannot be read; above {@link MAX_ALIAS_LISTS} lists it answers unknown for every specifier. */
export function makeAliasTable(lists) {
    const unknown = { kind: 'unknown' };
    if (lists.length > MAX_ALIAS_LISTS || lists.includes('unknown'))
        return { lookup: () => unknown };
    // For each list: a trie of its keys and the first unreadable key. A key is added and a specifier walked by the same UTF-16 code units, the specifier once, so a lookup costs the length of the specifier at most.
    const indexed = lists.map((entries) => {
        const root = { label: '', from: 0, to: 0 };
        let firstUnknown = Infinity;
        entries.forEach((entry, k) => {
            if (entry.find === undefined)
                firstUnknown = Math.min(firstUnknown, k);
            else
                addKey(root, entry.find, k, entry.exact);
        });
        return { entries, root, firstUnknown };
    });
    const answers = new Map();
    return {
        lookup(spec) {
            if (answers.has(spec))
                return answers.get(spec);
            const found = [];
            for (const list of indexed) {
                let best = Infinity;
                let node = list.root;
                let at = 0;
                while (at < spec.length) {
                    const child = node.children?.get(spec[at]);
                    if (child === undefined)
                        break;
                    const length = child.to - child.from;
                    if (at + length > spec.length)
                        break;
                    let same = 1;
                    while (same < length && child.label[child.from + same] === spec[at + same])
                        same++;
                    if (same < length)
                        break;
                    at += length;
                    node = child;
                    if (at === spec.length)
                        best = Math.min(best, node.any ?? Infinity);
                    else if (spec[at] === '/')
                        best = Math.min(best, node.loose ?? Infinity);
                }
                const first = Math.min(best, list.firstUnknown);
                found.push(first === Infinity ? undefined : applyBundlerAliases(spec, [list.entries[first]]));
            }
            const answer = combineAliasAnswers(found);
            answers.set(spec, answer);
            return answer;
        },
    };
}
/** One answer from several alias lists that may all apply: none matching is no match, matches that agree are the answer, matches that differ are unknown. */
export function combineAliasAnswers(answers) {
    const found = answers.filter((a) => a !== undefined);
    if (found.length === 0)
        return undefined;
    const first = JSON.stringify(found[0]);
    return found.every((a) => JSON.stringify(a) === first) ? found[0] : { kind: 'unknown' };
}
// The limits of an expression that ends where a statement does, and of one that may also end at the `,` of the next declarator.
const STATEMENT = -1;
const DECLARATOR = -2;
// The statements whose braces hold a block of the function around them, so a `return` or a declaration there belongs to that function.
const BLOCK_HEADS = new Set(['if', 'for', 'while', 'switch', 'catch', 'with']);
const BLOCK_WORDS = new Set(['else', 'try', 'finally', 'do', 'catch']);
// Words that start a statement or a declaration, which no type annotation holds.
const TYPE_STOPS = new Set(['const', 'let', 'var', 'return', 'export', 'import', 'function', 'class']);
/**
 * The configuration objects of a file: what it exports (`export default …`, `module.exports = …` or `export = …`, or the whole text when it is one object, as a JSON configuration is), read through the forms a configuration is written in: an object literal, an array of them, `defineConfig(…)` of one, a function (an arrow or a function expression, async or not) whose every `return`, or whose expression body, is one, and a name the file declares once with one and never assigns again; any of these in parentheses or followed by a TypeScript `as` or `satisfies`. A function counts only as the export, an element of an exported array or the argument of `defineConfig`, where the bundlers call it. `'unknown'` when the file exports anything else (a merge, another call, a `require`, a member, a condition, a spread), exports twice, or exports nothing the reader can see; a text with no tokens exports no configuration. Linear in the tokens: each expression is read once, and a type annotation is passed over up to the first token no type holds.
 */
function configurationObjects(tokens, close, open, parent) {
    const n = tokens.length;
    const is = (k, v, t = 'punct') => tokens[k]?.v === v && tokens[k].t === t;
    const isAssign = (k) => is(k, '=') && !is(k + 1, '=') && !is(k + 1, '>');
    // For each brace, the scope whose statements it holds: a function body, or any brace that is no statement's block, is its own; a statement's block is the scope around it.
    const home = [];
    const scopeOf = (i) => {
        const p = parent[i];
        return p === -1 ? -1 : (home[p] ?? p);
    };
    const statementBlock = (k) => {
        const before = tokens[k - 1];
        if (before?.t === 'id')
            return BLOCK_WORDS.has(before.v);
        if (before?.t !== 'punct' || before.v !== ')')
            return false;
        const head = open[k - 1] - 1;
        return tokens[head]?.t === 'id' && (BLOCK_HEADS.has(tokens[head].v) || (tokens[head].v === 'await' && is(head - 1, 'for', 'id')));
    };
    for (let k = 0; k < n; k++)
        if (is(k, '{'))
            home[k] = statementBlock(k) ? scopeOf(k) : k;
    // Where a type annotation from `j` on ends, before `stop`: the index of the `=` of an initializer, the `=>` of an arrow or the `{` of a function body it leads to, or -1 when another token ends it first; for 'end', the index of the first token no type holds. Inside `<…>` a `,` or a `=>` belongs to the type.
    const typeEnd = (j, until, stop) => {
        let angle = 0;
        for (; j < stop; j++) {
            const tok = tokens[j];
            if (tok.t === 'id' && TYPE_STOPS.has(tok.v))
                return until === 'end' ? j : -1;
            if (tok.t !== 'punct')
                continue;
            const v = tok.v;
            if (v === '<')
                angle++;
            else if (v === '>')
                angle = Math.max(0, angle - 1);
            else if (v === '=' && is(j + 1, '>')) {
                if (until === '=>' && angle === 0)
                    return j;
                j++;
            }
            else if (v === '=')
                return until === '=' && angle === 0 ? j : until === 'end' ? j : -1;
            else if (v === '{' && until === '{' && angle === 0)
                return j;
            else if (v === '{' || v === '[' || v === '(')
                j = close[j];
            else if (v === ';' || v === '}' || v === ']' || v === ')' || (v === ',' && angle === 0))
                return until === 'end' ? j : -1;
        }
        return until === 'end' ? stop : -1;
    };
    // The declarations (`const`, `let`, `var`) of each scope by name, the names assigned anywhere else, the `return`s of each scope and what the file exports, in one pass.
    const declared = new Map();
    const assigned = new Set();
    const returns = new Map();
    const roots = [];
    for (let i = 0; i < n; i++) {
        const tok = tokens[i];
        if (tok.t !== 'id')
            continue;
        if ((tok.v === 'const' || tok.v === 'let' || tok.v === 'var') && tokens[i + 1]?.t === 'id') {
            const key = `${scopeOf(i)} ${tokens[i + 1].v}`;
            const eq = is(i + 2, ':') ? typeEnd(i + 3, '=', n) : i + 2;
            declared.set(key, declared.has(key) || eq === -1 || !isAssign(eq) ? -1 : eq + 1);
        }
        else if (tok.v === 'return') {
            const scope = scopeOf(i);
            const list = returns.get(scope);
            if (list === undefined)
                returns.set(scope, [i]);
            else
                list.push(i);
        }
        else if (tok.v === 'export' && is(i + 1, 'default', 'id'))
            roots.push(i + 2);
        else if (tok.v === 'export' && isAssign(i + 1))
            roots.push(i + 2);
        else if (tok.v === 'module' && !is(i - 1, '.') && is(i + 1, '.') && is(i + 2, 'exports', 'id') && isAssign(i + 3))
            roots.push(i + 4);
        else if (isAssign(i + 1) && !is(i - 1, '.') && !(tokens[i - 1]?.t === 'id' && ['const', 'let', 'var'].includes(tokens[i - 1].v)))
            assigned.add(tok.v);
    }
    const named = (scope, name) => {
        for (const s of scope === -1 ? [-1] : [scope, -1]) {
            const value = declared.get(`${s} ${name}`);
            if (value !== undefined)
                return value === -1 || assigned.has(name) ? undefined : { at: value, scope: s };
        }
        return undefined;
    };
    // Past the TypeScript `as` and `satisfies` after a value.
    const pastCasts = (e, stop) => {
        while (e < stop && (is(e, 'as', 'id') || is(e, 'satisfies', 'id')))
            e = is(e, 'as', 'id') && is(e + 1, 'const', 'id') ? e + 2 : typeEnd(e + 1, 'end', stop);
        return e;
    };
    // Whether an expression whose last token is just before `e` ends there: exactly at an index, or where a statement (or a declarator) may end.
    const ends = (e, limit) => {
        if (limit >= 0)
            return e === limit;
        const tok = tokens[e];
        if (tok === undefined)
            return true;
        if (tok.t === 'punct')
            return tok.v === ';' || tok.v === '}' || tok.v === ')' || tok.v === ']' || (limit === DECLARATOR && tok.v === ',');
        return tok.t === 'id' && tok.v !== 'in' && tok.v !== 'instanceof';
    };
    // The `=>` after the parameters that open at `paren`, past a return type, or -1.
    const arrowAfter = (paren, stop) => {
        const after = close[paren] + 1;
        if (is(after, '=') && is(after + 1, '>'))
            return after;
        return is(after, ':') ? typeEnd(after + 1, '=>', stop) : -1;
    };
    // The function that starts at `at`: its body, a block or an expression; 'none' when no function starts there, 'bad' when one starts and the reader cannot find its body.
    const functionAt = (at, stop) => {
        let k = at;
        if (is(k, 'async', 'id') && (is(k + 1, 'function', 'id') || is(k + 1, '(') || (tokens[k + 1]?.t === 'id' && is(k + 2, '=') && is(k + 3, '>'))))
            k++;
        if (is(k, 'function', 'id')) {
            k++;
            if (is(k, '*'))
                k++;
            if (tokens[k]?.t === 'id')
                k++;
            if (!is(k, '('))
                return 'bad';
            const after = close[k] + 1;
            const body = is(after, '{') ? after : is(after, ':') ? typeEnd(after + 1, '{', stop) : -1;
            return body === -1 || body >= stop ? 'bad' : { body, block: true };
        }
        let arrow = -1;
        if (tokens[k]?.t === 'id' && is(k + 1, '=') && is(k + 2, '>'))
            arrow = k + 1;
        else if (is(k, '('))
            arrow = arrowAfter(k, stop);
        if (arrow === -1)
            return k === at ? 'none' : 'bad';
        return arrow + 2 >= stop ? 'bad' : { body: arrow + 2, block: is(arrow + 2, '{') };
    };
    if (roots.length > 1)
        return 'unknown';
    const objects = new Map();
    // An expression to read: where it starts, where it must end (an index, or STATEMENT or DECLARATOR), whether a function may stand there, and the scope its names are looked up in.
    const work = [];
    if (roots.length === 1)
        work.push({ start: roots[0], limit: STATEMENT, top: true, scope: -1 });
    else if (n > 0 && is(0, '{') && close[0] === n - 1)
        work.push({ start: 0, limit: STATEMENT, top: false, scope: -1 });
    else if (n > 0)
        return 'unknown';
    const seen = new Set();
    while (work.length > 0) {
        const { start, limit, top, scope } = work.pop();
        if (seen.has(2 * start + (top ? 1 : 0)))
            continue;
        seen.add(2 * start + (top ? 1 : 0));
        const stop = limit >= 0 ? limit : n;
        // The parentheses around the expression, from the outside in, each closing where the next one's expression ends.
        const parens = [];
        let at = start;
        while (is(at, '(') && arrowAfter(at, stop) === -1)
            parens.push(close[at++]);
        if (at >= stop)
            return 'unknown';
        const fn = functionAt(at, stop);
        let end;
        if (fn === 'bad')
            return 'unknown';
        if (fn !== 'none') {
            if (!top)
                return 'unknown';
            if (fn.block) {
                const found = returns.get(fn.body);
                if (found === undefined)
                    return 'unknown';
                for (const r of found)
                    work.push({ start: r + 1, limit: STATEMENT, top: false, scope: fn.body });
                end = close[fn.body] + 1;
            }
            else {
                // An expression body ends where the function does, which the body's own reading checks: at the innermost parenthesis around the function, or at its limit.
                work.push({ start: fn.body, limit: parens.length > 0 ? parens[parens.length - 1] : limit, top: false, scope });
                if (parens.length === 0)
                    continue;
                end = parens[parens.length - 1];
            }
        }
        else if (is(at, '{')) {
            objects.set(at, scope);
            end = close[at] + 1;
        }
        else if (is(at, '[')) {
            for (const [s, e] of segments(tokens, close, at)) {
                if (is(s, '...'))
                    return 'unknown';
                work.push({ start: s, limit: e, top, scope });
            }
            end = close[at] + 1;
        }
        else if (is(at, 'defineConfig', 'id') && is(at + 1, '(')) {
            const args = segments(tokens, close, at + 1);
            if (args.length !== 1 || is(args[0][0], '...'))
                return 'unknown';
            work.push({ start: args[0][0], limit: args[0][1], top, scope });
            end = close[at + 1] + 1;
        }
        else if (tokens[at].t === 'id') {
            const bound = named(scope, tokens[at].v);
            if (bound === undefined)
                return 'unknown';
            work.push({ start: bound.at, limit: DECLARATOR, top, scope: bound.scope });
            end = at + 1;
        }
        else
            return 'unknown';
        end = pastCasts(end, stop);
        for (let k = parens.length - 1; k >= 0; k--) {
            if (end !== parens[k])
                return 'unknown';
            end = pastCasts(parens[k] + 1, stop);
        }
        if (!ends(end, limit))
            return 'unknown';
    }
    return { objects, named, endsDeclaration: (at) => ends(pastCasts(at, n), DECLARATOR) };
}
/** The members of an object literal, or undefined when one of them names a key the reader cannot tell: a computed, numeric or escaped key, a method or accessor, or a key written twice (which keeps its first place and takes its last value). A spread is a member of its own, which may write any key. */
function membersOf(tokens, close, open) {
    const out = [];
    const seen = new Set();
    for (const [start, end] of segments(tokens, close, open)) {
        const key = tokens[start];
        if (key.t === 'punct' && key.v === '...') {
            out.push({ key: '', shorthand: false, spread: true, value: start + 1, end });
            continue;
        }
        const named = key.t === 'id' || (key.t === 'str' && !key.v.includes('\\'));
        const keyed = named && tokens[start + 1]?.v === ':' && tokens[start + 1].t === 'punct';
        const shorthand = key.t === 'id' && end === start + 1;
        if ((!keyed && !shorthand) || seen.has(key.v))
            return undefined;
        seen.add(key.v);
        out.push({ key: key.v, shorthand, spread: false, value: start + 2, end });
    }
    return out;
}
/** Whether the `__dirname` at `i` declares a name of the file's own: a variable, a function or class, an import or destructured binding, an assignment, or a parameter. */
function declares(tokens, close, parent, i) {
    const before = tokens[i - 1];
    const after = tokens[i + 1];
    if (before?.t === 'id' && ['const', 'let', 'var', 'function', 'class', 'as'].includes(before.v))
        return true;
    if (after?.v === '=' && tokens[i + 2]?.v !== '=' && tokens[i + 2]?.v !== '>')
        return true;
    const around = parent[i];
    if (around === -1 || (before?.v !== '(' && before?.v !== ',' && before?.v !== '{'))
        return false;
    const opener = tokens[around - 1];
    if (tokens[around].v === '{')
        return opener?.t === 'id' && ['const', 'let', 'var', 'import'].includes(opener.v);
    if (tokens[around].v !== '(')
        return false;
    const arrow = tokens[close[around] + 1]?.v === '=' && tokens[close[around] + 2]?.v === '>';
    return arrow || opener?.v === 'function' || (opener?.t === 'id' && tokens[around - 2]?.v === 'function');
}
const UNKNOWN_KEY = { exact: false, replacement: { kind: 'unknown' } };
/** The entries of an object literal `{ key: value, … }`, in order. */
function objectEntries(tokens, close, open, env) {
    const members = membersOf(tokens, close, open);
    // A spread writes keys before or over the ones after it, so in an alias object it may decide any specifier.
    if (members === undefined || members.some((m) => m.spread))
        return [UNKNOWN_KEY];
    return members.map((m) => entryOf(m.key, m.shorthand ? { kind: 'unknown' } : replacementOf(tokens, close, m.value, m.end, env), env));
}
/** The entries of Vite's array form `[{ find: '<key>', replacement: <value> }, …]`, in order; a `find` that is no string (a regular expression) or any other property makes an entry with an unreadable key. */
function arrayEntries(tokens, close, open, env) {
    const out = [];
    for (const [start, end] of segments(tokens, close, open)) {
        if (tokens[start].v !== '{' || close[start] !== end - 1) {
            out.push(UNKNOWN_KEY);
            continue;
        }
        let find;
        let replacement;
        let readable = true;
        for (const [s, e] of segments(tokens, close, start)) {
            const name = tokens[s].v;
            const keyed = (tokens[s].t === 'id' || tokens[s].t === 'str') && tokens[s + 1]?.v === ':';
            if (keyed && name === 'find' && find === undefined && e === s + 3 && tokens[s + 2].t === 'str')
                find = tokens[s + 2];
            else if (keyed && name === 'replacement' && replacement === undefined)
                replacement = replacementOf(tokens, close, s + 2, e, env);
            else
                readable = false;
        }
        out.push(readable && find !== undefined && replacement !== undefined ? entryOf(find.v, replacement, env) : UNKNOWN_KEY);
    }
    return out;
}
/** An entry from its key as written: webpack's `name$` matches the name alone and a webpack key with a `*` is a pattern, a Babel key opening with `^` or closing with `$` is a regular expression, and an empty key or one ending in `/` is not read. */
function entryOf(key, replacement, env) {
    let find = key;
    let exact = false;
    if (env.kind === 'webpack' && find.endsWith('$')) {
        find = find.slice(0, -1);
        exact = true;
    }
    if (env.kind === 'babel' && (find.startsWith('^') || find.endsWith('$')))
        return UNKNOWN_KEY;
    if (env.kind === 'webpack' && find.includes('*'))
        return UNKNOWN_KEY;
    if (find === '' || find.endsWith('/') || find.includes('\\'))
        return UNKNOWN_KEY;
    return { find, exact, replacement };
}
/** The target of the value written in tokens `[start, end)`. */
function replacementOf(tokens, close, start, end, env) {
    const unknown = { kind: 'unknown' };
    const at = (k) => (start + k < end ? tokens[start + k] : undefined);
    const is = (k, v, t) => at(k)?.v === v && (t === undefined || at(k).t === t);
    if (end - start === 1 && at(0).t === 'str') {
        const value = at(0).v;
        if (value === '' || value.includes('\\'))
            return unknown;
        if (env.kind === 'vite' && value.startsWith('/') && !value.startsWith('//'))
            return env.rootSet ? unknown : joinInside(env.configDir, value.slice(1));
        if (env.kind === 'babel' && /^\.\.?(?:\/|$)/.test(value))
            return joinInside(env.configDir, value);
        return value.startsWith('.') || value.startsWith('/') || /^[A-Za-z]:/.test(value) ? unknown : { kind: 'request', request: value };
    }
    // path.resolve(__dirname, '<p>', …) and path.join(__dirname, '<p>', …)
    if (env.pathImported && !env.dirnameDeclared && is(0, 'path', 'id') && is(1, '.') && (is(2, 'resolve', 'id') || is(2, 'join', 'id')) && is(3, '(') && close[start + 3] === end - 1 && is(4, '__dirname', 'id')) {
        const parts = [];
        let k = 5;
        while (is(k, ',') && at(k + 1)?.t === 'str') {
            parts.push(at(k + 1).v);
            k += 2;
        }
        if (is(k, ','))
            k++;
        if (start + k !== end - 1 || parts.length === 0)
            return unknown;
        return parts.every((p) => p !== '' && !p.startsWith('/') && !p.includes('\\') && !/^[A-Za-z]:/.test(p)) ? joinInside(env.configDir, parts.join('/')) : unknown;
    }
    // fileURLToPath(new URL('<p>', import.meta.url))
    const urlForm = ['fileURLToPath', '(', 'new', 'URL', '(', '', ',', 'import', '.', 'meta', '.', 'url', ')', ')'];
    if (end - start === urlForm.length && urlForm.every((v, k) => (k === 5 ? at(k).t === 'str' : at(k).v === v && at(k).t !== 'str'))) {
        const value = at(5).v;
        return value === '' || /^[/\\]|[\\%?#:]/.test(value) ? unknown : joinInside(env.configDir, value);
    }
    return unknown;
}
/** A repo-relative path under `base`, or unknown when it climbs out of the repository. */
function joinInside(base, rel) {
    const joined = path.posix.normalize(path.posix.join(base === '' ? '.' : base, rel)).replace(/\/$/, '');
    if (joined === '..' || joined.startsWith('../'))
        return { kind: 'unknown' };
    return { kind: 'path', path: joined === '.' ? '' : joined };
}
/** The comma-separated parts of a bracketed list, as `[start, end)` token ranges, an empty part (a trailing comma) left out. */
function segments(tokens, close, open) {
    const out = [];
    let start = open + 1;
    for (let k = open + 1; k <= close[open]; k++) {
        if (k === close[open] || (tokens[k].v === ',' && tokens[k].t === 'punct')) {
            if (k > start)
                out.push([start, k]);
            start = k + 1;
        }
        else if (close[k] !== undefined)
            k = close[k];
    }
    return out;
}
/** For each opening bracket, the index of its closing one; for each closing bracket, the index of its opening one; for each token, the index of the innermost bracket around it (-1 at the top). */
function brackets(tokens) {
    const close = [];
    const open = [];
    const parent = [];
    const stack = [];
    tokens.forEach((tok, i) => {
        if (tok.t === 'punct' && (tok.v === '}' || tok.v === ']' || tok.v === ')')) {
            open[i] = stack.pop();
            close[open[i]] = i;
        }
        parent[i] = stack.length === 0 ? -1 : stack[stack.length - 1];
        if (tok.t === 'punct' && (tok.v === '{' || tok.v === '[' || tok.v === '('))
            stack.push(i);
    });
    return { close, open, parent };
}
const PAIRS = { '}': '{', ']': '[', ')': '(' };
// After these words an expression starts, so a `/` opens a regular expression rather than dividing.
const BEFORE_EXPRESSION = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do', 'else', 'yield', 'await']);
/**
 * The tokens of JavaScript or TypeScript text, as far as {@link readBundlerAliases} needs them: identifiers, strings (a template with no substitution is a string, one with substitutions a `tpl`), numbers, regular expressions and single punctuators, comments dropped. undefined when the text does not balance: an unterminated string, comment, template or regular expression, or a bracket that closes another kind. Linear in the length of the text.
 */
function tokenize(text) {
    const out = [];
    // The open brackets; a template substitution's `${` is marked `$` so its `}` resumes the template.
    const open = [];
    let i = text.startsWith('#!') ? text.indexOf('\n') : 0;
    if (i === -1)
        return out;
    const n = text.length;
    const regexAllowed = () => {
        const prev = out[out.length - 1];
        if (prev === undefined)
            return true;
        if (prev.t === 'id')
            return BEFORE_EXPRESSION.has(prev.v);
        if (prev.t === 'punct')
            return prev.v !== ')' && prev.v !== ']' && prev.v !== '}';
        return false;
    };
    // A template from `i` (just past a backtick or the `}` that ends a substitution) to its end or its next `${`.
    const template = (from, resumed) => {
        let j = from;
        let raw = '';
        while (j < n && text[j] !== '`') {
            if (text[j] === '\\') {
                raw += text.slice(j, j + 2);
                j += 2;
                continue;
            }
            if (text[j] === '$' && text[j + 1] === '{') {
                if (!resumed)
                    out.push({ t: 'tpl', v: raw });
                open.push('$');
                return j + 2;
            }
            raw += text[j];
            j++;
        }
        if (j >= n)
            return undefined;
        if (!resumed)
            out.push({ t: 'str', v: raw });
        return j + 1;
    };
    while (i < n) {
        const c = text[i];
        if (c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f' || c === '\v' || c === '﻿' || c === ' ' || c === ' ' || c === ' ') {
            i++;
        }
        else if (c === '/' && text[i + 1] === '/') {
            while (i < n && text[i] !== '\n' && text[i] !== '\r')
                i++;
        }
        else if (c === '/' && text[i + 1] === '*') {
            const end = text.indexOf('*/', i + 2);
            if (end === -1)
                return undefined;
            i = end + 2;
        }
        else if (c === '"' || c === "'") {
            let j = i + 1;
            let value = '';
            while (j < n && text[j] !== c) {
                if (text[j] === '\n' || text[j] === '\r')
                    return undefined;
                if (text[j] === '\\') {
                    value += text.slice(j, j + 2);
                    j += 2;
                }
                else
                    value += text[j++];
            }
            if (j >= n)
                return undefined;
            out.push({ t: 'str', v: value });
            i = j + 1;
        }
        else if (c === '`') {
            const next = template(i + 1, false);
            if (next === undefined)
                return undefined;
            i = next;
        }
        else if (c === '/' && regexAllowed()) {
            let j = i + 1;
            let inClass = false;
            while (j < n && (inClass || text[j] !== '/')) {
                if (text[j] === '\n' || text[j] === '\r')
                    return undefined;
                if (text[j] === '\\')
                    j++;
                else if (text[j] === '[')
                    inClass = true;
                else if (text[j] === ']')
                    inClass = false;
                j++;
            }
            if (j >= n)
                return undefined;
            j++;
            while (j < n && /[A-Za-z]/.test(text[j]))
                j++;
            out.push({ t: 'regex', v: text.slice(i, j) });
            i = j;
        }
        else if (/[A-Za-z_$]/.test(c) || c.charCodeAt(0) > 0x7f) {
            let j = i + 1;
            while (j < n && (/[\w$]/.test(text[j]) || text.charCodeAt(j) > 0x7f))
                j++;
            out.push({ t: 'id', v: text.slice(i, j) });
            i = j;
        }
        else if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(text[i + 1] ?? ''))) {
            let j = i + 1;
            while (j < n && /[\w.]/.test(text[j]))
                j++;
            out.push({ t: 'num', v: text.slice(i, j) });
            i = j;
        }
        else if (c === '.' && text[i + 1] === '.' && text[i + 2] === '.') {
            out.push({ t: 'punct', v: '...' });
            i += 3;
        }
        else if (c === '{' || c === '[' || c === '(') {
            open.push(c);
            out.push({ t: 'punct', v: c });
            i++;
        }
        else if (c === '}' || c === ']' || c === ')') {
            const top = open.pop();
            if (top === '$' && c === '}') {
                const next = template(i + 1, true);
                if (next === undefined)
                    return undefined;
                i = next;
                continue;
            }
            if (top !== PAIRS[c])
                return undefined;
            out.push({ t: 'punct', v: c });
            i++;
        }
        else {
            out.push({ t: 'punct', v: c });
            i++;
        }
    }
    return open.length === 0 ? out : undefined;
}
