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
 * The aliases a bundler configuration defines, read from its text without running it: one list per `alias` property found, each in the order the bundler tries its keys. `'unknown'` when the text holds an alias the reader cannot follow, so any bare specifier may be mapped: an `alias` anywhere but as a literal object (or, for Vite, a literal array of `{ find, replacement }`) under `resolve` (Vite also `test`) of a configuration object that no other object holds, or in the options of module-resolver in the `plugins` of such an object; module-resolver referenced in any other way, with a `root`, `cwd` or `resolvePath` option, or with options it cannot read; or text the token reader cannot balance. A list is one unknown entry when the alias object, the `resolve` (or `test`) object or the configuration object holds a member that may replace a key the lookup reads: a spread, a computed or escaped key, a method or accessor, a key written twice, or a shorthand of the name the lookup reads.
 *
 * A replacement counts only in these forms; any other is an alias whose key is known and whose target is not:
 * - `path.resolve(__dirname, '<p>', …)` and `path.join(__dirname, '<p>', …)`, with `path` imported from Node's `path` and no `__dirname` declared by the file, and `fileURLToPath(new URL('<p>', import.meta.url))`: `<p>` from the configuration's directory;
 * - a string: for Vite one starting with `/` from the project root, the configuration's directory (unless the file sets a `root`); for Babel one starting with `./` or `../` from module-resolver's working directory, which the reader takes to be the configuration's directory, where Babel runs; for all three a bare string is another request, as the bundler reads it. Vite and webpack resolve a relative string from the importing file, so it is not read.
 */
export function readBundlerAliases(text, kind, configDir) {
    const tokens = tokenize(text);
    if (tokens === undefined)
        return 'unknown';
    const { close, parent } = brackets(tokens);
    const isKey = (i) => (tokens[i].t === 'id' || tokens[i].t === 'str') && tokens[i + 1]?.v === ':' && tokens[i + 1].t === 'punct' && (tokens[i - 1]?.v === '{' || tokens[i - 1]?.v === ',') && tokens[i - 1].t === 'punct';
    const keyOf = (open) => (open >= 2 && tokens[open - 1].v === ':' && isKey(open - 2) ? tokens[open - 2].v : undefined);
    const env = {
        kind,
        configDir,
        pathImported: tokens.some((tok) => tok.t === 'str' && (tok.v === 'path' || tok.v === 'node:path')),
        rootSet: kind === 'vite' && tokens.some((tok, i) => tok.v === 'root' && isKey(i)),
        dirnameDeclared: tokens.some((tok, i) => tok.t === 'id' && tok.v === '__dirname' && declares(tokens, close, parent, i)),
    };
    // The members of each object read once: an object that many `alias` properties share is not read again for each.
    const memberCache = new Map();
    const members = (open) => {
        if (!memberCache.has(open))
            memberCache.set(open, membersOf(tokens, close, open));
        return memberCache.get(open);
    };
    // An object no other object holds: a block (a function body) around it is no object.
    const outermost = (open) => {
        for (let k = parent[open]; k !== -1; k = parent[k])
            if (tokens[k].v === '{' && !isBlock(tokens, k))
                return false;
        return tokens[open].v === '{' && !isBlock(tokens, open);
    };
    // Whether the object holds every member as a key it can read, none of them a shorthand of a name the lookup reads.
    const readable = (open, names) => members(open)?.every((m) => !(m.shorthand && names.includes(m.key))) === true;
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
        if (options === undefined || options.some((m) => m.shorthand || ['root', 'cwd', 'resolvePath'].includes(m.key)))
            return 'unknown';
        // The pair stands in the `plugins` of the configuration itself: `overrides` and `env` apply theirs to some files only.
        const list = parent[i - 1];
        const config = list === -1 ? -1 : parent[list];
        if (list === -1 || tokens[list].v !== '[' || keyOf(list) !== 'plugins' || config === -1 || !outermost(config) || !readable(config, ['plugins']))
            return 'unknown';
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
        if (kind !== 'babel' && (config === -1 || !outermost(config)))
            return 'unknown';
        if (!readable(owner, ['alias']) || (kind !== 'babel' && !readable(config, ['resolve', 'test']))) {
            lists.push([UNKNOWN_KEY]);
            continue;
        }
        const open = i + 2;
        const value = tokens[open];
        const ends = (at) => tokens[at]?.v === ',' || tokens[at]?.v === '}';
        if (value?.v === '{' && ends(close[open] + 1))
            lists.push(objectEntries(tokens, close, open, env));
        else if (kind === 'vite' && value?.v === '[' && ends(close[open] + 1))
            lists.push(arrayEntries(tokens, close, open, env));
        else
            lists.push([{ exact: false, replacement: { kind: 'unknown' } }]);
    }
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
/** The {@link AliasTable} of alias lists that all apply, one list `'unknown'` where a configuration cannot be read; above {@link MAX_ALIAS_LISTS} lists it answers unknown for every specifier. */
export function makeAliasTable(lists) {
    const unknown = { kind: 'unknown' };
    if (lists.length > MAX_ALIAS_LISTS || lists.includes('unknown'))
        return { lookup: () => unknown };
    // For each list: the first entry of each key (exact or not), the first that matches a longer specifier too, and the first unreadable key.
    const indexed = lists.map((entries) => {
        const any = new Map();
        const loose = new Map();
        let firstUnknown = Infinity;
        entries.forEach((entry, k) => {
            if (entry.find === undefined)
                firstUnknown = Math.min(firstUnknown, k);
            else {
                if (!any.has(entry.find))
                    any.set(entry.find, k);
                if (!entry.exact && !loose.has(entry.find))
                    loose.set(entry.find, k);
            }
        });
        return { entries, any, loose, firstUnknown };
    });
    const answers = new Map();
    return {
        lookup(spec) {
            if (answers.has(spec))
                return answers.get(spec);
            const found = [];
            for (const list of indexed) {
                let best = list.any.get(spec) ?? Infinity;
                for (let at = spec.indexOf('/'); at !== -1; at = spec.indexOf('/', at + 1))
                    best = Math.min(best, list.loose.get(spec.slice(0, at)) ?? Infinity);
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
/** The members of an object literal, or undefined when one of them may stand for any key, so a key it reads may be replaced: a spread, a computed, numeric or escaped key, a method or accessor, or a key written twice (which keeps its first place and takes its last value). */
function membersOf(tokens, close, open) {
    const out = [];
    const seen = new Set();
    for (const [start, end] of segments(tokens, close, open)) {
        const key = tokens[start];
        const named = key.t === 'id' || (key.t === 'str' && !key.v.includes('\\'));
        const keyed = named && tokens[start + 1]?.v === ':' && tokens[start + 1].t === 'punct';
        const shorthand = key.t === 'id' && end === start + 1;
        if ((!keyed && !shorthand) || seen.has(key.v))
            return undefined;
        seen.add(key.v);
        out.push({ key: key.v, shorthand, value: start + 2, end });
    }
    return out;
}
/** Whether the brace at `open` opens a block (a function body, an `else`) rather than an object literal. */
function isBlock(tokens, open) {
    const before = tokens[open - 1];
    if (before === undefined)
        return false;
    if (before.t === 'punct')
        return before.v === ')' || (before.v === '>' && tokens[open - 2]?.v === '=');
    return before.t === 'id' && ['else', 'try', 'finally', 'do'].includes(before.v);
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
    if (members === undefined)
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
/** For each opening bracket, the index of its closing one; for each token, the index of the innermost bracket around it (-1 at the top). */
function brackets(tokens) {
    const close = [];
    const parent = [];
    const stack = [];
    tokens.forEach((tok, i) => {
        if (tok.t === 'punct' && (tok.v === '}' || tok.v === ']' || tok.v === ')'))
            close[stack.pop()] = i;
        parent[i] = stack.length === 0 ? -1 : stack[stack.length - 1];
        if (tok.t === 'punct' && (tok.v === '{' || tok.v === '[' || tok.v === '('))
            stack.push(i);
    });
    return { close, parent };
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
