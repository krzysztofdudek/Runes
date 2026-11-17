import path from 'node:path';

/** The configurations whose module aliases are read: Vite's `resolve.alias` (and Vitest's `test.alias` in the same file), webpack's `resolve.alias`, and the `alias` option of Babel's module-resolver plugin. */
export type BundlerKind = 'vite' | 'webpack' | 'babel';

/** The configuration files read, by name, and the bundler each belongs to. */
export const BUNDLER_CONFIG_FILES: ReadonlyArray<readonly [string, BundlerKind]> = [
  ...['ts', 'js', 'mjs', 'mts', 'cjs'].map((ext) => [`vite.config.${ext}`, 'vite'] as const),
  ...['js', 'ts', 'cjs', 'mjs'].map((ext) => [`webpack.config.${ext}`, 'webpack'] as const),
  ...['js', 'json', 'cjs', 'mjs'].map((ext) => [`babel.config.${ext}`, 'babel'] as const),
  ['.babelrc', 'babel'],
  ['.babelrc.json', 'babel'],
];

/** What an alias does with a specifier it matches: names a repository path (repo-relative POSIX, `''` the root), hands on another bare request, or does what the reader cannot tell. */
export type AliasAnswer = { kind: 'path'; path: string } | { kind: 'request'; request: string } | { kind: 'unknown' };

/** One alias in the order the bundler tries it. `find` undefined: a key the reader cannot read (a regular expression, a computed key, a spread), which may match any specifier. */
export interface AliasEntry {
  find?: string;
  exact: boolean;
  replacement: AliasAnswer;
}

/**
 * The aliases a bundler configuration defines, read from its text without running it: one list per `alias` property found, each in the order the bundler tries its keys. `'unknown'` when the text holds an alias the reader cannot follow, so any bare specifier may be mapped: an `alias` anywhere but as a literal object (or, for Vite, a literal array of `{ find, replacement }`) under `resolve` (Vite also `test`) or in the options of module-resolver; module-resolver referenced in any other way or with a `root`, `cwd` or `resolvePath` option; or text the token reader cannot balance.
 *
 * A replacement counts only in these forms; any other is an alias whose key is known and whose target is not:
 * - `path.resolve(__dirname, '<p>', …)` and `path.join(__dirname, '<p>', …)`, with `path` imported from Node's `path`, and `fileURLToPath(new URL('<p>', import.meta.url))`: `<p>` from the configuration's directory;
 * - a string: for Vite one starting with `/` from the project root, the configuration's directory (unless the file sets a `root`); for Babel one starting with `./` or `../` from the configuration's directory, module-resolver's working directory; for all three a bare string is another request, as the bundler reads it. Vite and webpack resolve a relative string from the importing file, so it is not read.
 */
export function readBundlerAliases(text: string, kind: BundlerKind, configDir: string): AliasEntry[][] | 'unknown' {
  const tokens = tokenize(text);
  if (tokens === undefined) return 'unknown';
  const { close, parent } = brackets(tokens);
  const isKey = (i: number): boolean => (tokens[i].t === 'id' || tokens[i].t === 'str') && tokens[i + 1]?.v === ':' && tokens[i + 1].t === 'punct' && (tokens[i - 1]?.v === '{' || tokens[i - 1]?.v === ',') && tokens[i - 1].t === 'punct';
  const keyOf = (open: number): string | undefined => (open >= 2 && tokens[open - 1].v === ':' && isKey(open - 2) ? tokens[open - 2].v : undefined);
  const env: ReadEnv = {
    kind,
    configDir,
    pathImported: tokens.some((tok) => tok.t === 'str' && (tok.v === 'path' || tok.v === 'node:path')),
    rootSet: kind === 'vite' && tokens.some((tok, i) => tok.v === 'root' && isKey(i)),
  };

  // The options objects of module-resolver, written `['module-resolver', { … }]`.
  const resolverOptions = new Set<number>();
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (tok.t !== 'str' || (tok.v !== 'module-resolver' && tok.v !== 'babel-plugin-module-resolver')) continue;
    const before = tokens[i - 1]?.v;
    const after = tokens[i + 1]?.v;
    if ((before !== '[' && before !== ',') || (after !== ']' && after !== ',')) return 'unknown';
    // A plugin listed by its name alone takes no options.
    if (before === ',' || after === ']') continue;
    const next = tokens[i + 2];
    if (next?.v === ']' || next?.t === 'str') continue;
    if (next?.v !== '{' || tokens[close[i + 2] + 1]?.v !== ']') return 'unknown';
    for (const [start] of segments(tokens, close, i + 2)) {
      if (!isKey(start) || ['root', 'cwd', 'resolvePath'].includes(tokens[start].v)) return 'unknown';
    }
    resolverOptions.add(i + 2);
  }

  const lists: AliasEntry[][] = [];
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].v !== 'alias' || (tokens[i].t !== 'id' && tokens[i].t !== 'str')) continue;
    if (!isKey(i)) return 'unknown';
    const owner = parent[i];
    const ownerKey = keyOf(owner);
    const placed = kind === 'babel' ? resolverOptions.has(owner) : ownerKey === 'resolve' || (kind === 'vite' && ownerKey === 'test');
    if (!placed) return 'unknown';
    const open = i + 2;
    const value = tokens[open];
    const ends = (at: number): boolean => tokens[at]?.v === ',' || tokens[at]?.v === '}';
    if (value?.v === '{' && ends(close[open] + 1)) lists.push(objectEntries(tokens, close, open, env));
    else if (kind === 'vite' && value?.v === '[' && ends(close[open] + 1)) lists.push(arrayEntries(tokens, close, open, env));
    else lists.push([{ exact: false, replacement: { kind: 'unknown' } }]);
  }
  return lists;
}

/** What the aliases make of a bare specifier: the first entry that matches decides, an entry with an unreadable key matches anything, and undefined is no match. */
export function applyBundlerAliases(spec: string, entries: AliasEntry[]): AliasAnswer | undefined {
  for (const entry of entries) {
    if (entry.find === undefined) return { kind: 'unknown' };
    const matches = spec === entry.find || (!entry.exact && spec.startsWith(`${entry.find}/`));
    if (!matches) continue;
    const rest = spec.slice(entry.find.length);
    const { replacement } = entry;
    if (replacement.kind === 'unknown' || rest === '') return replacement;
    if (replacement.kind === 'request') return { kind: 'request', request: replacement.request + rest };
    return joinInside(replacement.path, rest.slice(1));
  }
  return undefined;
}

/** One answer from several alias lists that may all apply: none matching is no match, matches that agree are the answer, matches that differ are unknown. */
export function combineAliasAnswers(answers: Array<AliasAnswer | undefined>): AliasAnswer | undefined {
  const found = answers.filter((a): a is AliasAnswer => a !== undefined);
  if (found.length === 0) return undefined;
  const first = JSON.stringify(found[0]);
  return found.every((a) => JSON.stringify(a) === first) ? found[0] : { kind: 'unknown' };
}

interface ReadEnv {
  kind: BundlerKind;
  configDir: string;
  pathImported: boolean;
  rootSet: boolean;
}

const UNKNOWN_KEY: AliasEntry = { exact: false, replacement: { kind: 'unknown' } };

/** The entries of an object literal `{ key: value, … }`, in order. */
function objectEntries(tokens: Token[], close: number[], open: number, env: ReadEnv): AliasEntry[] {
  const out: AliasEntry[] = [];
  const seen = new Set<string>();
  for (const [start, end] of segments(tokens, close, open)) {
    const key = tokens[start];
    if (!((key.t === 'id' || key.t === 'str') && tokens[start + 1]?.v === ':' && tokens[start + 1].t === 'punct')) {
      out.push(UNKNOWN_KEY);
      continue;
    }
    // A key written twice keeps its first place and its last value.
    if (seen.has(key.v)) return [UNKNOWN_KEY];
    seen.add(key.v);
    out.push(entryOf(key, replacementOf(tokens, close, start + 2, end, env), env));
  }
  return out;
}

/** The entries of Vite's array form `[{ find: '<key>', replacement: <value> }, …]`, in order; a `find` that is no string (a regular expression) or any other property makes an entry with an unreadable key. */
function arrayEntries(tokens: Token[], close: number[], open: number, env: ReadEnv): AliasEntry[] {
  const out: AliasEntry[] = [];
  for (const [start, end] of segments(tokens, close, open)) {
    if (tokens[start].v !== '{' || close[start] !== end - 1) {
      out.push(UNKNOWN_KEY);
      continue;
    }
    let find: Token | undefined;
    let replacement: AliasAnswer | undefined;
    let readable = true;
    for (const [s, e] of segments(tokens, close, start)) {
      const name = tokens[s].v;
      const keyed = (tokens[s].t === 'id' || tokens[s].t === 'str') && tokens[s + 1]?.v === ':';
      if (keyed && name === 'find' && find === undefined && e === s + 3 && tokens[s + 2].t === 'str') find = tokens[s + 2];
      else if (keyed && name === 'replacement' && replacement === undefined) replacement = replacementOf(tokens, close, s + 2, e, env);
      else readable = false;
    }
    out.push(readable && find !== undefined && replacement !== undefined ? entryOf(find, replacement, env) : UNKNOWN_KEY);
  }
  return out;
}

/** An entry from its key as written: webpack's `name$` matches the name alone, a Babel key opening with `^` or closing with `$` is a regular expression, and an empty key or one ending in `/` is not read. */
function entryOf(key: Token, replacement: AliasAnswer, env: ReadEnv): AliasEntry {
  let find = key.v;
  let exact = false;
  if (env.kind === 'webpack' && find.endsWith('$')) {
    find = find.slice(0, -1);
    exact = true;
  }
  if (env.kind === 'babel' && (find.startsWith('^') || find.endsWith('$'))) return UNKNOWN_KEY;
  if (find === '' || find.endsWith('/') || find.includes('\\')) return UNKNOWN_KEY;
  return { find, exact, replacement };
}

/** The target of the value written in tokens `[start, end)`. */
function replacementOf(tokens: Token[], close: number[], start: number, end: number, env: ReadEnv): AliasAnswer {
  const unknown: AliasAnswer = { kind: 'unknown' };
  const at = (k: number): Token | undefined => (start + k < end ? tokens[start + k] : undefined);
  const is = (k: number, v: string, t?: TokenType): boolean => at(k)?.v === v && (t === undefined || at(k)!.t === t);
  if (end - start === 1 && at(0)!.t === 'str') {
    const value = at(0)!.v;
    if (value === '' || value.includes('\\')) return unknown;
    if (env.kind === 'vite' && value.startsWith('/') && !value.startsWith('//')) return env.rootSet ? unknown : joinInside(env.configDir, value.slice(1));
    if (env.kind === 'babel' && /^\.\.?(?:\/|$)/.test(value)) return joinInside(env.configDir, value);
    return value.startsWith('.') || value.startsWith('/') || /^[A-Za-z]:/.test(value) ? unknown : { kind: 'request', request: value };
  }
  // path.resolve(__dirname, '<p>', …) and path.join(__dirname, '<p>', …)
  if (env.pathImported && is(0, 'path', 'id') && is(1, '.') && (is(2, 'resolve', 'id') || is(2, 'join', 'id')) && is(3, '(') && close[start + 3] === end - 1 && is(4, '__dirname', 'id')) {
    const parts: string[] = [];
    let k = 5;
    while (is(k, ',') && at(k + 1)?.t === 'str') {
      parts.push(at(k + 1)!.v);
      k += 2;
    }
    if (is(k, ',')) k++;
    if (start + k !== end - 1 || parts.length === 0) return unknown;
    return parts.every((p) => p !== '' && !p.startsWith('/') && !p.includes('\\') && !/^[A-Za-z]:/.test(p)) ? joinInside(env.configDir, parts.join('/')) : unknown;
  }
  // fileURLToPath(new URL('<p>', import.meta.url))
  const urlForm = ['fileURLToPath', '(', 'new', 'URL', '(', '', ',', 'import', '.', 'meta', '.', 'url', ')', ')'];
  if (end - start === urlForm.length && urlForm.every((v, k) => (k === 5 ? at(k)!.t === 'str' : at(k)!.v === v && at(k)!.t !== 'str'))) {
    const value = at(5)!.v;
    return value === '' || /^[/\\]|[\\%?#:]/.test(value) ? unknown : joinInside(env.configDir, value);
  }
  return unknown;
}

/** A repo-relative path under `base`, or unknown when it climbs out of the repository. */
function joinInside(base: string, rel: string): AliasAnswer {
  const joined = path.posix.normalize(path.posix.join(base === '' ? '.' : base, rel)).replace(/\/$/, '');
  if (joined === '..' || joined.startsWith('../')) return { kind: 'unknown' };
  return { kind: 'path', path: joined === '.' ? '' : joined };
}

/** The comma-separated parts of a bracketed list, as `[start, end)` token ranges, an empty part (a trailing comma) left out. */
function segments(tokens: Token[], close: number[], open: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let start = open + 1;
  for (let k = open + 1; k <= close[open]; k++) {
    if (k === close[open] || (tokens[k].v === ',' && tokens[k].t === 'punct')) {
      if (k > start) out.push([start, k]);
      start = k + 1;
    } else if (close[k] !== undefined) k = close[k];
  }
  return out;
}

type TokenType = 'id' | 'str' | 'tpl' | 'num' | 'punct' | 'regex';
interface Token {
  t: TokenType;
  v: string;
}

/** For each opening bracket, the index of its closing one; for each token, the index of the innermost bracket around it (-1 at the top). */
function brackets(tokens: Token[]): { close: number[]; parent: number[] } {
  const close: number[] = [];
  const parent: number[] = [];
  const stack: number[] = [];
  tokens.forEach((tok, i) => {
    if (tok.t === 'punct' && (tok.v === '}' || tok.v === ']' || tok.v === ')')) close[stack.pop()!] = i;
    parent[i] = stack.length === 0 ? -1 : stack[stack.length - 1];
    if (tok.t === 'punct' && (tok.v === '{' || tok.v === '[' || tok.v === '(')) stack.push(i);
  });
  return { close, parent };
}

const PAIRS: Record<string, string> = { '}': '{', ']': '[', ')': '(' };
// After these words an expression starts, so a `/` opens a regular expression rather than dividing.
const BEFORE_EXPRESSION = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do', 'else', 'yield', 'await']);

/**
 * The tokens of JavaScript or TypeScript text, as far as {@link readBundlerAliases} needs them: identifiers, strings (a template with no substitution is a string, one with substitutions a `tpl`), numbers, regular expressions and single punctuators, comments dropped. undefined when the text does not balance: an unterminated string, comment, template or regular expression, or a bracket that closes another kind. Linear in the length of the text.
 */
function tokenize(text: string): Token[] | undefined {
  const out: Token[] = [];
  // The open brackets; a template substitution's `${` is marked `$` so its `}` resumes the template.
  const open: string[] = [];
  let i = text.startsWith('#!') ? text.indexOf('\n') : 0;
  if (i === -1) return out;
  const n = text.length;
  const regexAllowed = (): boolean => {
    const prev = out[out.length - 1];
    if (prev === undefined) return true;
    if (prev.t === 'id') return BEFORE_EXPRESSION.has(prev.v);
    if (prev.t === 'punct') return prev.v !== ')' && prev.v !== ']' && prev.v !== '}';
    return false;
  };
  // A template from `i` (just past a backtick or the `}` that ends a substitution) to its end or its next `${`.
  const template = (from: number, resumed: boolean): number | undefined => {
    let j = from;
    let raw = '';
    while (j < n && text[j] !== '`') {
      if (text[j] === '\\') {
        raw += text.slice(j, j + 2);
        j += 2;
        continue;
      }
      if (text[j] === '$' && text[j + 1] === '{') {
        if (!resumed) out.push({ t: 'tpl', v: raw });
        open.push('$');
        return j + 2;
      }
      raw += text[j];
      j++;
    }
    if (j >= n) return undefined;
    if (!resumed) out.push({ t: 'str', v: raw });
    return j + 1;
  };
  while (i < n) {
    const c = text[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f' || c === '\v' || c === '﻿' || c === ' ' || c === ' ' || c === ' ') {
      i++;
    } else if (c === '/' && text[i + 1] === '/') {
      while (i < n && text[i] !== '\n' && text[i] !== '\r') i++;
    } else if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      if (end === -1) return undefined;
      i = end + 2;
    } else if (c === '"' || c === "'") {
      let j = i + 1;
      let value = '';
      while (j < n && text[j] !== c) {
        if (text[j] === '\n' || text[j] === '\r') return undefined;
        if (text[j] === '\\') {
          value += text.slice(j, j + 2);
          j += 2;
        } else value += text[j++];
      }
      if (j >= n) return undefined;
      out.push({ t: 'str', v: value });
      i = j + 1;
    } else if (c === '`') {
      const next = template(i + 1, false);
      if (next === undefined) return undefined;
      i = next;
    } else if (c === '/' && regexAllowed()) {
      let j = i + 1;
      let inClass = false;
      while (j < n && (inClass || text[j] !== '/')) {
        if (text[j] === '\n' || text[j] === '\r') return undefined;
        if (text[j] === '\\') j++;
        else if (text[j] === '[') inClass = true;
        else if (text[j] === ']') inClass = false;
        j++;
      }
      if (j >= n) return undefined;
      j++;
      while (j < n && /[A-Za-z]/.test(text[j])) j++;
      out.push({ t: 'regex', v: text.slice(i, j) });
      i = j;
    } else if (/[A-Za-z_$]/.test(c) || c.charCodeAt(0) > 0x7f) {
      let j = i + 1;
      while (j < n && (/[\w$]/.test(text[j]) || text.charCodeAt(j) > 0x7f)) j++;
      out.push({ t: 'id', v: text.slice(i, j) });
      i = j;
    } else if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(text[i + 1] ?? ''))) {
      let j = i + 1;
      while (j < n && /[\w.]/.test(text[j])) j++;
      out.push({ t: 'num', v: text.slice(i, j) });
      i = j;
    } else if (c === '.' && text[i + 1] === '.' && text[i + 2] === '.') {
      out.push({ t: 'punct', v: '...' });
      i += 3;
    } else if (c === '{' || c === '[' || c === '(') {
      open.push(c);
      out.push({ t: 'punct', v: c });
      i++;
    } else if (c === '}' || c === ']' || c === ')') {
      const top = open.pop();
      if (top === '$' && c === '}') {
        const next = template(i + 1, true);
        if (next === undefined) return undefined;
        i = next;
        continue;
      }
      if (top !== PAIRS[c]) return undefined;
      out.push({ t: 'punct', v: c });
      i++;
    } else {
      out.push({ t: 'punct', v: c });
      i++;
    }
  }
  return open.length === 0 ? out : undefined;
}
