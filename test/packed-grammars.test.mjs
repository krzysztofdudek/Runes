import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { loadGrammarManifest, verifyGrammarFiles } from '@chrisdudek/runes/grammars';

const root = fileURLToPath(new URL('..', import.meta.url));
const manifest = loadGrammarManifest();
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const nodeTypesFile = (wasmFile) => wasmFile.replace(/\.wasm$/, '.node-types.json');

// Under `npm test` npm names its own entry point; a bare `node --test` finds the npm that ships beside node (bin/../lib on Linux and macOS, the same directory on Windows).
function npmCli() {
  if (process.env.npm_execpath && /npm-cli\.[cm]?js$/.test(process.env.npm_execpath)) return process.env.npm_execpath;
  const dir = path.dirname(process.execPath);
  const found = [path.join(dir, 'node_modules', 'npm', 'bin', 'npm-cli.js'), path.join(dir, '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js')].find((p) => existsSync(p));
  assert.ok(found, `no npm next to ${process.execPath}`);
  return found;
}

function run(file, args, cwd) {
  const r = spawnSync(process.execPath, [file, ...args], { cwd, encoding: 'utf8', timeout: 600_000, maxBuffer: 64 * 1024 * 1024 });
  assert.equal(r.status, 0, `${path.basename(file)} ${args.join(' ')} failed:\n${r.stdout}\n${r.stderr}`);
  return r.stdout;
}

// A tarball as npm writes it: ustar headers, a long name split into prefix and name, and a pax header for a name longer than that.
function untar(bytes, dest) {
  const text = (at, len) => bytes.subarray(at, at + len).toString('utf8').replace(/\0.*$/s, '');
  let longName;
  for (let at = 0; at + 512 <= bytes.length; ) {
    if (bytes[at] === 0) break;
    const size = parseInt(text(at + 124, 12).trim() || '0', 8);
    const type = String.fromCharCode(bytes[at + 156]);
    const prefix = text(at + 345, 155);
    const name = longName ?? (prefix ? `${prefix}/${text(at, 100)}` : text(at, 100));
    const body = bytes.subarray(at + 512, at + 512 + size);
    at += 512 + Math.ceil(size / 512) * 512;
    if (type === 'x') { longName = /(?:^|\n)\d+ path=([^\n]*)\n/.exec(body.toString('utf8'))?.[1]; continue; }
    if (type === 'g') continue;
    longName = undefined;
    const target = path.resolve(dest, name);
    assert.ok(target.startsWith(path.resolve(dest) + path.sep), `the tarball writes outside its folder: ${name}`);
    if (type === '5') { mkdirSync(target, { recursive: true }); continue; }
    if (type !== '0' && type !== '\0') assert.fail(`the tarball holds an entry of type ${type}: ${name}`);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, body);
  }
}

// The npm grammar packages as grammars:package installs them: in a folder of their own, from its lockfile, with no install script.
function installGrammarPackages(npm, dest) {
  mkdirSync(dest, { recursive: true });
  for (const file of ['package.json', 'package-lock.json', '.npmrc']) cpSync(path.join(root, 'grammars', 'npm', file), path.join(dest, file));
  run(npm, ['ci', '--ignore-scripts', '--legacy-peer-deps', '--no-audit', '--no-fund'], dest);
  return dest;
}

// The package as npm publishes it: its own files (the list npm packs from this checkout), the grammar files built into it as the release builds them, packed by npm and unpacked into a fresh folder. Built once for the tests below.
const work = mkdtempSync(path.join(tmpdir(), 'runes-packed-'));
after(() => rmSync(work, { recursive: true, force: true }));
let packing;
function packedPackage() {
  packing ??= (async () => {
    const npm = npmCli();
    const grammarPackages = installGrammarPackages(npm, path.join(work, 'grammar-packages'));
    const listing = JSON.parse(run(npm, ['pack', '--dry-run', '--json'], root))[0].files.map((f) => f.path.replace(/\\/g, '/'));
    const pkgDir = path.join(work, 'source');
    for (const file of listing.filter((p) => !p.startsWith('grammars/built/'))) cpSync(path.join(root, file), path.join(pkgDir, file));
    for (const ignore of ['.gitignore', '.npmignore']) if (existsSync(path.join(root, ignore))) cpSync(path.join(root, ignore), path.join(pkgDir, ignore));
    cpSync(path.join(root, 'grammars', 'npm'), path.join(pkgDir, 'grammars', 'npm'), { recursive: true, filter: (src) => path.basename(src) !== 'node_modules' });
    run(path.join(root, 'scripts', 'build-grammars.mjs'), ['--package', '--out', path.join(pkgDir, 'grammars', 'built'), '--resolve-from', grammarPackages], root);
    const tarballs = path.join(work, 'tarballs');
    mkdirSync(tarballs);
    const packed = JSON.parse(run(npm, ['pack', '--json', '--pack-destination', tarballs], pkgDir))[0];
    const unpacked = path.join(work, 'unpacked');
    untar(gunzipSync(readFileSync(path.join(tarballs, packed.filename))), unpacked);
    return { npm, grammarPackages, files: packed.files.map((f) => f.path.replace(/\\/g, '/')), pkg: path.join(unpacked, 'package') };
  })();
  return packing;
}

// A consumer materializes every pin from the unpacked package with an empty cache, offline, with no grammar package installed where it resolves from: every file must come from the package, with the pinned sha256, and nothing may be compiled or fetched.
test('the packed package carries every pinned grammar, and buildGrammars installs all of them from it offline', { timeout: 900_000 }, async () => {
  const { files, pkg } = await packedPackage();
  const shipped = files.filter((p) => p.startsWith('grammars/built/')).sort();
  assert.deepEqual(shipped, manifest.grammars.flatMap((g) => [`grammars/built/${g.wasmFile}`, `grammars/built/${nodeTypesFile(g.wasmFile)}`]).sort(), 'the tarball holds exactly the two files of each pin');
  assert.deepEqual(files.filter((p) => p.startsWith('grammars/npm/')), [], 'the grammar packages folder is not packed');
  const installed = await import(pathToFileURL(path.join(pkg, 'dist', 'grammars', 'index.mjs')).href);
  const dir = mkdtempSync(path.join(work, 'consumer-'));
  const cacheDir = path.join(dir, 'empty-cache');
  const resolveFrom = path.join(dir, 'empty-project');
  const outDir = path.join(dir, 'consumer-grammars');
  mkdirSync(cacheDir);
  mkdirSync(resolveFrom);
  const built = await installed.buildGrammars({ outDir, cacheDir, resolveFrom, offline: true });
  assert.deepEqual(built.map((b) => [b.language, b.from]), manifest.grammars.map((g) => [g.language, 'shipped']));
  for (const g of manifest.grammars) {
    assert.equal(sha(readFileSync(path.join(outDir, g.wasmFile))), g.sha256.wasm, `${g.language} wasm`);
    assert.equal(sha(readFileSync(path.join(outDir, nodeTypesFile(g.wasmFile)))), g.sha256.nodeTypes, `${g.language} node-types.json`);
  }
  assert.deepEqual(installed.verifyGrammarFiles(outDir), []);
  assert.deepEqual(readdirSync(cacheDir), [], 'nothing was fetched or built into the cache');
  assert.deepEqual(readdirSync(resolveFrom), []);
});

test('the package build of the grammars refuses a folder that holds a file no pin names, and takes no language list', { timeout: 900_000 }, async () => {
  const { grammarPackages } = await packedPackage();
  const script = path.join(root, 'scripts', 'build-grammars.mjs');
  const out = path.join(mkdtempSync(path.join(work, 'stray-')), 'built');
  mkdirSync(out);
  writeFileSync(path.join(out, 'tree-sitter-cobol.wasm'), 'stale');
  const stray = spawnSync(process.execPath, [script, '--package', '--out', out, '--resolve-from', grammarPackages], { cwd: root, encoding: 'utf8', timeout: 600_000 });
  assert.equal(stray.status, 1, stray.stderr);
  assert.match(stray.stderr, /must hold exactly the pinned grammar files, and does not:\n {2}tree-sitter-cobol\.wasm: no pin names it/);
  assert.deepEqual(verifyGrammarFiles(out), [], 'every pin was still built and verified');
  const listed = spawnSync(process.execPath, [script, '--package', '--only', 'go'], { cwd: root, encoding: 'utf8', timeout: 60_000 });
  assert.equal(listed.status, 2);
  assert.match(listed.stderr, /--package builds every pin and takes no --only or --table/);
  const alone = spawnSync(process.execPath, [script, '--resolve-from', grammarPackages], { cwd: root, encoding: 'utf8', timeout: 60_000 });
  assert.equal(alone.status, 2);
  assert.match(alone.stderr, /--resolve-from goes with --package/);
});

test('the grammar files are built when the package is published, never when it is installed, and no install script of a grammar package runs', () => {
  const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts.prepublishOnly, 'npm run grammars:package');
  assert.equal(pkg.scripts['grammars:package'], 'npm ci --ignore-scripts --legacy-peer-deps --prefix grammars/npm && node scripts/build-grammars.mjs --package');
  for (const name of ['preinstall', 'install', 'postinstall', 'prepare', 'preprepare', 'postprepare', 'prepack', 'postpack']) assert.equal(pkg.scripts[name], undefined, `${name} runs on an install from git or on a pack`);
  assert.equal(existsSync(path.join(root, '.npmrc')), false, 'the root install keeps npm\'s defaults');
  const grammarPackages = JSON.parse(readFileSync(path.join(root, 'grammars', 'npm', 'package.json'), 'utf8'));
  assert.equal(grammarPackages.private, true);
  assert.equal(grammarPackages.scripts, undefined);
  assert.deepEqual(grammarPackages.dependencies, Object.fromEntries(manifest.grammars.filter((g) => g.source.kind === 'npm').map((g) => [g.source.package, g.source.version]).sort(([a], [b]) => (a < b ? -1 : 1))), 'the folder installs exactly the npm pins of the manifest');
  assert.match(readFileSync(path.join(root, 'grammars', 'npm', '.npmrc'), 'utf8'), /^ignore-scripts=true$/m);
});
