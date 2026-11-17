// Builds a Rust catalogue case into a throwaway directory that `cargo check --offline` can read: the case's own files, and a directory source of stub crates in place of every registry, alternate-registry and git dependency, so that nothing is fetched and a dependency the case does not provide still resolves. A stub declares the modules and the items the case's own sources import from it (`use name::a::B;`) or name in an expression, and the known macros they take from it (`cfg_if!`, `lazy_static!`, `bitflags!` and a few that stand for a macro whose expansion a case does not read), and nothing else. The manifests are read in every TOML form a case writes a dependency in: a table, a dotted key, an inline table.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/** The lines of a TOML text as its parser reads them: a value that opens a bracket, a brace or a multi-line string goes on to where it closes, and comments are dropped. */
function logicalLines(text) {
  const lines = [];
  let cur = '';
  let depth = 0;
  let quote = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote !== '') {
      if (quote.length === 1 && quote === '"' && ch === '\\') { cur += ch + (text[i + 1] ?? ''); i++; continue; }
      if (text.startsWith(quote, i)) { cur += quote; i += quote.length - 1; quote = ''; continue; }
      cur += ch;
      continue;
    }
    if (ch === '#') { while (i + 1 < text.length && text[i + 1] !== '\n') i++; continue; }
    const triple = text.slice(i, i + 3);
    if (triple === '"""' || triple === "'''") { quote = triple; cur += triple; i += 2; continue; }
    if (ch === '"' || ch === "'") { quote = ch; cur += ch; continue; }
    if (ch === '\n' && depth === 0) { lines.push(cur); cur = ''; continue; }
    if ((ch === '[' || ch === '{') && /=/.test(cur)) depth++;
    else if ((ch === ']' || ch === '}') && depth > 0) depth--;
    cur += ch;
  }
  lines.push(cur);
  return lines;
}

/** `text` split at `sep` where it stands outside quotes, brackets and braces. */
function splitTop(text, sep) {
  const parts = [];
  let depth = 0;
  let quote = '';
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote !== '') { if (ch === '\\' && quote === '"') i++; else if (ch === quote) quote = ''; continue; }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '[' || ch === '{') depth++;
    else if (ch === ']' || ch === '}') depth--;
    else if (ch === sep && depth === 0) { parts.push(text.slice(start, i)); start = i + 1; }
  }
  parts.push(text.slice(start));
  return parts;
}

/** A dotted TOML key (`a."b.c".d`) as its parts. */
const keyParts = (key) => splitTop(key, '.').map((k) => k.trim().replace(/^"(.*)"$|^'(.*)'$/, '$1$2'));

/** The text of a TOML string value, in any of its four forms; undefined for any other value. */
function tomlText(value) {
  const v = value.trim();
  const m = /^"""\n?([\s\S]*)"""$/.exec(v) ?? /^'''\n?([\s\S]*)'''$/.exec(v) ?? /^"((?:[^"\\]|\\.)*)"$/.exec(v) ?? /^'([^']*)'$/.exec(v);
  return m?.[1];
}

/** Every value of a Cargo manifest with the full key path that reaches it, whichever TOML form writes it: `[a.b]` then `c.d = v`, a dotted key above every header, or an inline table, which is opened into its keys. */
export function manifestValues(text) {
  const out = [];
  let table = [];
  const put = (keys, value) => {
    const v = value.trim();
    if (v.startsWith('{') && v.endsWith('}')) {
      const inner = v.slice(1, -1).trim();
      if (inner === '') out.push({ keys, value: v });
      for (const pair of inner === '' ? [] : splitTop(inner, ',')) {
        const eq = splitTop(pair, '=');
        if (eq.length >= 2) put([...keys, ...keyParts(eq[0])], eq.slice(1).join('='));
      }
    } else out.push({ keys, value: v });
  };
  for (const line of logicalLines(text)) {
    const header = /^\s*\[\[?\s*(.+?)\s*\]\]?\s*$/.exec(line);
    if (header && !/=/.test(header[1].replace(/"[^"]*"|'[^']*'/g, ''))) {
      table = keyParts(header[1]);
      out.push({ keys: table, value: undefined });
      continue;
    }
    const eq = splitTop(line, '=');
    if (eq.length >= 2 && eq[0].trim() !== '') put([...table, ...keyParts(eq[0])], eq.slice(1).join('='));
  }
  return out;
}

/** The names a case's manifests depend on that no `path` provides, a `[patch]` entry from git included: the crate name Cargo looks the dependency up under, the lowest version its requirement allows, the repository's URL for a git dependency, the alternate registry, and the names code calls it by (its key, which `package =` can make differ from the crate's name). */
export function externalDependencies(files) {
  const found = new Map();
  for (const f of files.filter((x) => x.path.endsWith('Cargo.toml'))) {
    const specs = new Map();
    for (const { keys, value } of manifestValues(f.code)) {
      const at = keys[0] === 'patch' ? 2 : keys.findIndex((k) => /^(?:dev-|build-)?dependencies$/.test(k)) + 1;
      if (at <= 0 || keys.length <= at) continue;
      const id = keys.slice(0, at + 1).join('\u0000');
      const spec = specs.get(id) ?? { key: keys[at], patch: keys[0] === 'patch', fields: new Map() };
      if (value !== undefined) spec.fields.set(keys.length === at + 1 ? 'version' : keys[at + 1], value);
      specs.set(id, spec);
    }
    for (const { key, patch, fields } of specs.values()) {
      if (fields.has('path') || fields.has('workspace')) continue;
      if (patch && !fields.has('git')) continue;
      const text = (k) => (fields.has(k) ? tomlText(fields.get(k)) : undefined);
      const real = text('package') ?? key;
      const entry = found.get(real) ?? { name: real, versions: new Set(), gits: new Set(), registries: new Set(), keys: new Set() };
      if (text('version') !== undefined) entry.versions.add(lowest(text('version')));
      if (text('git') !== undefined) entry.gits.add(text('git'));
      if (text('registry') !== undefined) entry.registries.add(text('registry'));
      entry.keys.add(key);
      found.set(real, entry);
    }
  }
  for (const entry of found.values()) if (entry.versions.size === 0) entry.versions.add('0.0.0');
  return [...found.values()];
}

/** The version a dependency's one stub crate carries: the highest of the lowest versions its requirements allow, so that a requirement of `1` and a git dependency with none are both met. */
const stubVersion = (dep) => [...dep.versions].sort((a, b) => b.localeCompare(a, 'en', { numeric: true }))[0];

function lowest(requirement) {
  const m = /(\d+)(?:\.(\d+))?(?:\.(\d+))?/.exec(requirement);
  return m ? `${m[1]}.${m[2] ?? 0}.${m[3] ?? 0}` : '0.0.0';
}

/** The items a case's sources import from a crate they call by one of `names`, or name in an expression (`name::a::Foo::bar()`, where `bar` is a function of the type `Foo`), as a tree of modules. */
function importedItems(files, names) {
  const tree = { children: new Map(), items: new Map() };
  const put = (segments, assoc) => {
    let node = tree;
    for (const [i, s] of segments.entries()) {
      if (i === segments.length - 1) {
        if (!node.items.has(s)) node.items.set(s, new Set());
        if (assoc !== undefined) node.items.get(s).add(assoc);
      } else {
        if (!node.children.has(s)) node.children.set(s, { children: new Map(), items: new Map() });
        node = node.children.get(s);
      }
    }
  };
  const expand = (prefix, text) => {
    // `a::{b, c::d}` into the full paths
    const brace = text.indexOf('{');
    if (brace === -1) return [[...prefix, ...text.split('::').map((x) => x.trim()).filter(Boolean)]];
    const head = text.slice(0, brace).split('::').map((x) => x.trim()).filter(Boolean);
    let depth = 0;
    let start = brace + 1;
    const parts = [];
    for (let i = brace + 1; i < text.length; i++) {
      if (text[i] === '{') depth++;
      else if (text[i] === '}') { if (depth === 0) { parts.push(text.slice(start, i)); break; } depth--; }
      else if (text[i] === ',' && depth === 0) { parts.push(text.slice(start, i)); start = i + 1; }
    }
    return parts.filter((p) => p.trim() !== '').flatMap((p) => expand([...prefix, ...head], p.trim()));
  };
  for (const ident of new Set(names.map((n) => n.replace(/-/g, '_')))) {
    for (const f of files.filter((x) => x.path.endsWith('.rs'))) {
      for (const m of f.code.matchAll(new RegExp(`\\b(?:pub\\s+)?use\\s+(?:::)?${ident}::([^;]+);`, 'g'))) {
        for (const p of expand([], m[1].replace(/\s+as\s+\w+/g, ''))) {
          const clean = p.filter((s) => s !== 'self' && s !== '*' && s !== '');
          if (clean.length > 0) put(clean);
        }
      }
      for (const m of f.code.replace(/\buse\s[^;]*;/g, '').matchAll(new RegExp(`(?<![\\w:])${ident}::((?:\\w+::)*\\w+)\\b(?!\\s*!)`, 'g'))) {
        const segments = m[1].split('::');
        const type = segments.findIndex((x) => /^[A-Z]/.test(x));
        if (type === -1) put(segments);
        else put(segments.slice(0, type + 1), segments[type + 1]);
      }
    }
  }
  return tree;
}

/** Items a stub writes as the published crate defines them, where a unit struct would not build: `once_cell::sync::Lazy` is generic and built in a `static`. */
const KNOWN_ITEMS = new Map([
  ['once_cell::sync::Lazy', 'pub struct Lazy<T, F = fn() -> T> { init: F, value: core::marker::PhantomData<T> }\nunsafe impl<T, F> Sync for Lazy<T, F> {}\nimpl<T, F> Lazy<T, F> {\n    pub const fn new(init: F) -> Self { Lazy { init, value: core::marker::PhantomData } }\n}\n'],
]);

/** The macros a stub crate defines when a case takes them from it. `cfg_if!`, `lazy_static!` and `bitflags!` expand as the published crates do for the forms the cases write; the others stand for a crate's macros whose expansion a case says is not read: `define_types!` writes its tokens as items, `decl_mods!` writes a `mod` for each name, and the attribute `#[modules(…)]` (a proc-macro crate) writes one beside its item. */
const KNOWN_MACROS = new Map([
  ['cfg_if', { kind: 'rules', code: `#[macro_export]
macro_rules! cfg_if {
    ($(if #[cfg($meta:meta)] { $($tokens:tt)* }) else * else { $($tokens2:tt)* }) => {
        $crate::cfg_if! { @__items () ; $( ( ($meta) ($($tokens)*) ), )* ( () ($($tokens2)*) ), }
    };
    (if #[cfg($i_met:meta)] { $($i_tokens:tt)* } $(else if #[cfg($e_met:meta)] { $($e_tokens:tt)* })*) => {
        $crate::cfg_if! { @__items () ; ( ($i_met) ($($i_tokens)*) ), $( ( ($e_met) ($($e_tokens)*) ), )* ( () () ), }
    };
    (@__items ($($not:meta,)*) ; ) => {};
    (@__items ($($not:meta,)*) ; ( ($($m:meta),*) ($($tokens:tt)*) ), $($rest:tt)*) => {
        #[cfg(all($($m,)* not(any($($not),*))))] $crate::cfg_if! { @__identity $($tokens)* }
        $crate::cfg_if! { @__items ($($not,)* $($m,)*) ; $($rest)* }
    };
    (@__identity $($tokens:tt)*) => { $($tokens)* };
}
` }],
  ['lazy_static', { kind: 'rules', code: `#[macro_export]
macro_rules! lazy_static {
    ($(#[$attr:meta])* $vis:vis static ref $name:ident : $t:ty = $init:expr; $($rest:tt)*) => {
        $(#[$attr])* $vis static $name: std::sync::LazyLock<$t> = std::sync::LazyLock::new(|| $init);
        $crate::lazy_static! { $($rest)* }
    };
    () => {};
}
` }],
  ['bitflags', { kind: 'rules', code: `#[macro_export]
macro_rules! bitflags {
    ($(#[$attr:meta])* $vis:vis struct $name:ident : $t:ty { $($(#[$fattr:meta])* const $flag:ident = $value:expr;)* }) => {
        $(#[$attr])* $vis struct $name { bits: $t }
        impl $name { $($(#[$fattr])* pub const $flag: $name = $name { bits: $value };)* }
    };
}
` }],
  ['define_types', { kind: 'rules', code: `#[macro_export]
macro_rules! define_types {
    ($($item:item)*) => { $($item)* };
}
` }],
  ['decl_mods', { kind: 'rules', code: `#[macro_export]
macro_rules! decl_mods {
    ($($name:ident),*) => { $(mod $name;)* };
}
` }],
  ['modules', { kind: 'attribute', code: `#[proc_macro_attribute]
pub fn modules(attr: proc_macro::TokenStream, item: proc_macro::TokenStream) -> proc_macro::TokenStream {
    format!("{item} mod {attr};").parse().unwrap()
}
` }],
]);

/** The known macros the case's sources take from a crate they call by one of `names`: through a path (`name::m!`, `#[name::m]`), a `use name::m;`, or a `#[macro_use] extern crate name;` and a bare `m!`. */
function importedMacros(files, names) {
  const text = files.filter((x) => x.path.endsWith('.rs')).map((x) => x.code).join('\n');
  const found = new Set();
  for (const ident of new Set(names.map((n) => n.replace(/-/g, '_')))) {
    const macroUse = new RegExp(`#\\[macro_use\\]\\s*(?:pub\\s+)?extern\\s+crate\\s+${ident}\\b`).test(text);
    for (const [name, macro] of KNOWN_MACROS) {
      const through = new RegExp(`(?:\\buse\\s+(?:::)?${ident}::${name}\\s*;)|(?:\\b${ident}::${name}\\s*!)|(?:#\\[\\s*(?:::)?${ident}::${name}\\b)`).test(text);
      const bare = macroUse && macro.kind === 'rules' && new RegExp(`(?<![\\w:])${name}\\s*!`).test(text);
      if (through || bare) found.add(name);
    }
  }
  return [...found].sort();
}

function render(node, prefix, depth = 0) {
  const pad = '    '.repeat(depth);
  let out = '';
  for (const [item, assoc] of [...node.items].sort()) {
    const known = KNOWN_ITEMS.get([...prefix, item].join('::'));
    const fns = [...assoc].sort().map((f) => `pub fn ${f}() {}`).join(' ');
    out += known !== undefined ? known.replace(/^(?=.)/gm, pad) : /^[A-Z]/.test(item) ? `${pad}pub struct ${item};\n${fns === '' ? '' : `${pad}impl ${item} { ${fns} }\n`}` : `${pad}pub fn ${item}() {}\n`;
  }
  for (const [name, child] of [...node.children].sort()) out += `${pad}pub mod ${name} {\n${render(child, [...prefix, name], depth + 1)}${pad}}\n`;
  return out;
}

/** `text` as a TOML basic string: a backslash in a Windows path would otherwise start an escape. */
const tomlString = (text) => `"${text.replace(/[\\"\u0000-\u001f\u007f]/g, (c) => (c === '\\' || c === '"' ? `\\${c}` : `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`))}"`;

/** The Cargo configuration (`.cargo/config.toml`) that puts the stub crates in `stubs` in place of crates.io and of every git and alternate-registry source of `externals`, and with `nightly` lets the compiler read a `#![feature]`. */
export function cargoConfig(stubs, externals, { nightly = false } = {}) {
  const gits = [...new Set(externals.flatMap((d) => [...d.gits]))];
  const registries = [...new Set(externals.flatMap((d) => [...d.registries]))];
  let config = `[source.crates-io]\nreplace-with = "stubs"\n\n[source.stubs]\ndirectory = ${tomlString(stubs)}\n`;
  gits.forEach((url, i) => { config += `\n[source.git${i}]\ngit = ${tomlString(url)}\nreplace-with = "stubs"\n`; });
  registries.forEach((name) => { config += `\n[registries.${name}]\nindex = "sparse+https://${name}.example/index/"\n\n[source.${name}-src]\nregistry = "sparse+https://${name}.example/index/"\nreplace-with = "stubs"\n`; });
  if (nightly) config += '\n[env]\nRUSTC_BOOTSTRAP = "1"\n';
  return config;
}

/** Writes `files` (`{ path, code }`) under `root` with the stub registry; returns the manifest to check. A git dependency is entered in a `Cargo.lock` beside that manifest, since Cargo reads a git source from a directory only at a locked revision. A case whose source enables a feature of the language (`#![feature(…)]`) builds with `RUSTC_BOOTSTRAP=1`, so the pinned toolchain reads it as a nightly one does. */
export function writeRustFixture(root, files) {
  for (const f of files) {
    mkdirSync(path.dirname(path.join(root, f.path)), { recursive: true });
    writeFileSync(path.join(root, f.path), f.code);
  }
  const externals = externalDependencies(files);
  const stubs = path.join(root, '.stubs');
  for (const dep of externals) {
    const dir = path.join(stubs, dep.name);
    mkdirSync(path.join(dir, 'src'), { recursive: true });
    const version = stubVersion(dep);
    const names = [dep.name, ...(dep.keys ?? [])];
    const macros = importedMacros(files, names).map((m) => KNOWN_MACROS.get(m));
    const procMacro = macros.some((m) => m.kind === 'attribute');
    writeFileSync(path.join(dir, 'Cargo.toml'), `[package]\nname = "${dep.name}"\nversion = "${version}"\nedition = "2021"\n${procMacro ? '\n[lib]\nproc-macro = true\n' : ''}`);
    writeFileSync(path.join(dir, 'src', 'lib.rs'), `${procMacro ? '' : render(importedItems(files, names), [dep.name.replace(/-/g, '_')])}${macros.map((m) => m.code).join('')}`);
    writeFileSync(path.join(dir, '.cargo-checksum.json'), '{"files":{},"package":null}');
  }
  const nightly = files.some((f) => f.path.endsWith('.rs') && /#!\[\s*feature\s*\(/.test(f.code));
  if (externals.length > 0 || nightly) {
    mkdirSync(path.join(root, '.cargo'), { recursive: true });
    writeFileSync(path.join(root, '.cargo', 'config.toml'), cargoConfig(stubs, externals, { nightly }));
  }
  const manifests = files.filter((f) => f.path.endsWith('Cargo.toml')).map((f) => f.path);
  const manifest = manifests.includes('Cargo.toml') ? 'Cargo.toml' : manifests[0];
  const locked = externals.flatMap((d) => [...d.gits].map((url) => `\n[[package]]\nname = "${d.name}"\nversion = "${stubVersion(d)}"\nsource = "git+${url}#${'0'.repeat(40)}"\n`));
  if (locked.length > 0) writeFileSync(path.join(root, path.dirname(manifest), 'Cargo.lock'), `version = 4\n${locked.join('')}`);
  return manifest;
}

/** The Rust toolchain the catalogue's cases build under; CI's test jobs install this version. */
export const PINNED_RUST = '1.99.1';

/** Whether the build tests of the Rust catalogue run: `rustc` and `cargo` are the `--version` lines found (undefined where the tool is missing), `pinned` the version the catalogue builds under, `ci` whether the run is CI. Returns `{ skip }`, false or the reason to skip, and `fail`, the reason the tests fail instead, or undefined. On CI the workflow installs the pinned toolchain, so a missing or different one there is a fault to see, never a reason to skip. */
export function rustToolchainVerdict({ rustc, cargo, pinned, ci }) {
  const reason = rustc === undefined || cargo === undefined
    ? `rustc and cargo ${pinned} are not installed (the test runs where the pinned toolchain is on the PATH)`
    : !rustc.startsWith(`rustc ${pinned} `) || !cargo.startsWith(`cargo ${pinned} `) ? `the Rust catalogue builds under ${pinned}; found ${rustc} and ${cargo}` : undefined;
  if (reason === undefined) return { skip: false, fail: undefined };
  return ci ? { skip: false, fail: `${reason}; on CI the workflow installs the pinned toolchain, so the build tests do not skip there` } : { skip: reason, fail: undefined };
}
