// Builds a Rust catalogue case into a throwaway directory that `cargo check --offline` can read: the case's own files, and a directory source of stub crates in place of every registry, alternate-registry and git dependency, so that nothing is fetched and a dependency the case does not provide still resolves. A stub declares the modules and the items the case's own sources import from it (`use name::a::B;`), and nothing else.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/** The names a case's manifests depend on that no `path` provides: the crate name Cargo looks the dependency up under, the lowest version its requirement allows, and the repository's URL for a git dependency. */
export function externalDependencies(files) {
  const found = new Map();
  const add = (name, spec) => {
    if (/\bpath\s*=|\bworkspace\s*=\s*true/.test(spec)) return;
    const real = /\bpackage\s*=\s*"([^"]+)"/.exec(spec)?.[1] ?? name;
    const version = /\bversion\s*=\s*"([^"]+)"/.exec(spec)?.[1] ?? (/^\s*"([^"]+)"\s*$/.exec(spec)?.[1] ?? '0.0.0');
    const git = /\bgit\s*=\s*"([^"]+)"/.exec(spec)?.[1];
    const registry = /\bregistry\s*=\s*"([^"]+)"/.exec(spec)?.[1];
    const entry = found.get(real) ?? { name: real, versions: new Set(), gits: new Set(), registries: new Set() };
    entry.versions.add(lowest(version));
    if (git) entry.gits.add(git);
    if (registry) entry.registries.add(registry);
    found.set(real, entry);
  };
  for (const f of files.filter((x) => x.path.endsWith('Cargo.toml'))) {
    let table = '';
    for (const line of f.code.split('\n')) {
      const header = /^\s*\[\s*([^\]]+?)\s*\]\s*$/.exec(line);
      if (header) {
        table = header[1];
        const sub = /(?:^|\.)(?:dev-|build-)?dependencies\.([\w-]+)$/.exec(table);
        if (sub) add(sub[1], '');
        continue;
      }
      const inDeps = /(?:^|\.)(?:dev-|build-)?dependencies$/.test(table) && !/^patch\b/.test(table);
      const kv = /^\s*([\w-]+)\s*=\s*(.*)$/.exec(line);
      if (inDeps && kv) add(kv[1], kv[2]);
      else if (/(?:^|\.)(?:dev-|build-)?dependencies\.[\w-]+$/.test(table) && kv) {
        const name = /\.([\w-]+)$/.exec(table)[1];
        add(name, `${kv[1]} = ${kv[2]}`);
      }
    }
  }
  return [...found.values()];
}

function lowest(requirement) {
  const m = /(\d+)(?:\.(\d+))?(?:\.(\d+))?/.exec(requirement);
  return m ? `${m[1]}.${m[2] ?? 0}.${m[3] ?? 0}` : '0.0.0';
}

/** The items a case's sources import from the crate `crate`, as a tree of modules. */
function importedItems(files, crate) {
  const tree = { children: new Map(), items: new Set() };
  const ident = crate.replace(/-/g, '_');
  const put = (segments) => {
    let node = tree;
    for (const [i, s] of segments.entries()) {
      if (i === segments.length - 1 && /^[A-Z]/.test(s)) node.items.add(s);
      else if (i === segments.length - 1) node.items.add(s);
      else {
        if (!node.children.has(s)) node.children.set(s, { children: new Map(), items: new Set() });
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
  for (const f of files.filter((x) => x.path.endsWith('.rs'))) {
    for (const m of f.code.matchAll(new RegExp(`\\b(?:pub\\s+)?use\\s+(?:::)?${ident}::([^;]+);`, 'g'))) {
      for (const p of expand([], m[1].replace(/\s+as\s+\w+/g, ''))) {
        const clean = p.filter((s) => s !== 'self' && s !== '*' && s !== '');
        if (clean.length > 0) put(clean);
      }
    }
  }
  return tree;
}

function render(node, depth = 0) {
  const pad = '    '.repeat(depth);
  let out = '';
  for (const item of [...node.items].sort()) out += /^[A-Z]/.test(item) ? `${pad}pub struct ${item};\n` : `${pad}pub fn ${item}() {}\n`;
  for (const [name, child] of [...node.children].sort()) out += `${pad}pub mod ${name} {\n${render(child, depth + 1)}${pad}}\n`;
  return out;
}

/** `text` as a TOML basic string: a backslash in a Windows path would otherwise start an escape. */
const tomlString = (text) => `"${text.replace(/[\\"\u0000-\u001f\u007f]/g, (c) => (c === '\\' || c === '"' ? `\\${c}` : `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`))}"`;

/** The Cargo configuration (`.cargo/config.toml`) that puts the stub crates in `stubs` in place of crates.io and of every git and alternate-registry source of `externals`. */
export function cargoConfig(stubs, externals) {
  const gits = [...new Set(externals.flatMap((d) => [...d.gits]))];
  const registries = [...new Set(externals.flatMap((d) => [...d.registries]))];
  let config = `[source.crates-io]\nreplace-with = "stubs"\n\n[source.stubs]\ndirectory = ${tomlString(stubs)}\n`;
  gits.forEach((url, i) => { config += `\n[source.git${i}]\ngit = ${tomlString(url)}\nreplace-with = "stubs"\n`; });
  registries.forEach((name) => { config += `\n[registries.${name}]\nindex = "sparse+https://${name}.example/index/"\n\n[source.${name}-src]\nregistry = "sparse+https://${name}.example/index/"\nreplace-with = "stubs"\n`; });
  return config;
}

/** Writes `files` (`{ path, code }`) under `root` with the stub registry; returns the manifest to check. */
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
    const version = [...dep.versions][0];
    writeFileSync(path.join(dir, 'Cargo.toml'), `[package]\nname = "${dep.name}"\nversion = "${version}"\nedition = "2021"\n`);
    writeFileSync(path.join(dir, 'src', 'lib.rs'), render(importedItems(files, dep.name)));
    writeFileSync(path.join(dir, '.cargo-checksum.json'), '{"files":{},"package":null}');
  }
  if (externals.length > 0) {
    mkdirSync(path.join(root, '.cargo'), { recursive: true });
    writeFileSync(path.join(root, '.cargo', 'config.toml'), cargoConfig(stubs, externals));
  }
  const manifests = files.filter((f) => f.path.endsWith('Cargo.toml')).map((f) => f.path);
  return manifests.includes('Cargo.toml') ? 'Cargo.toml' : manifests[0];
}

/** Whether the build tests of the Rust catalogue run: `rustc` and `cargo` are the `--version` lines found (undefined where the tool is missing), `pinned` the version the catalogue builds under, `ci` whether the run is CI. Returns `{ skip }`, false or the reason to skip, and `fail`, the reason the tests fail instead, or undefined. */
export function rustToolchainVerdict({ rustc, cargo, pinned, ci }) {
  const reason = rustc === undefined || cargo === undefined
    ? `rustc and cargo ${pinned} are not installed (the test runs where the pinned toolchain is on the PATH)`
    : !rustc.startsWith(`rustc ${pinned} `) || !cargo.startsWith(`cargo ${pinned} `) ? `the Rust catalogue builds under ${pinned}; found ${rustc} and ${cargo}` : undefined;
  return { skip: reason ?? false, fail: undefined };
}
