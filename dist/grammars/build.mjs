/**
 * The grammar build recipe: turns manifest pins into the two files a parser loads, `<wasmFile>` and `<name>.node-types.json`, and writes a file only after its bytes were hashed and matched against the pin, whatever its source (see `GrammarSource`). Built and downloaded files land in a content-addressed cache named by their sha256 and are re-hashed on every read: a warm cache needs no network and no toolchain, and a damaged entry is evicted, never written out. Source builds are byte-reproducible (the same bytes from Linux x64 and macOS arm64), so the pinned sha256 is also the reproducibility check.
 *
 * This runs at build time, never at run time: it downloads, checks out repositories and runs the tree-sitter CLI. A consumer calls it from its own build or test script; `@chrisdudek/runes` itself ships no executable.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findInstalledPackage } from './installed.mjs';
import { parseGrammarManifest, syntaxNodeTypesFile } from './manifest.mjs';
/** The shipped grammars/ directory: the manifest, its schema and the patches. */
export function shippedGrammarsDir() {
    return fileURLToPath(new URL('../../grammars/', import.meta.url));
}
/** The shipped grammar manifest, parsed and validated. */
export function loadGrammarManifest() {
    return parseGrammarManifest(readFileSync(path.join(shippedGrammarsDir(), 'manifest.json'), 'utf8'));
}
const REPIN_HINT = 'If the pin in the grammar manifest was changed on purpose, set the sha256 to the value above after reviewing the grammar change (the node-types.json diff and the full relation test suite); otherwise what was read, downloaded or built is not the pinned grammar.';
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
function verifyPinned(what, bytes, expected) {
    const actual = sha256(bytes);
    if (actual !== expected)
        throw new Error(`grammar pin mismatch for ${what}: expected sha256 ${expected}, got ${actual}. Nothing was written. ${REPIN_HINT}`);
    return bytes;
}
function readVerified(file, expected) {
    if (!existsSync(file))
        return undefined;
    const bytes = readFileSync(file);
    return sha256(bytes) === expected ? bytes : undefined;
}
function readCache(cacheDir, expected, log) {
    const p = path.join(cacheDir, expected);
    if (!existsSync(p))
        return undefined;
    const bytes = readFileSync(p);
    if (sha256(bytes) === expected)
        return bytes;
    rmSync(p, { force: true });
    log(`evicted a damaged cache entry ${p}`);
    return undefined;
}
function writeAtomicFile(file, bytes) {
    mkdirSync(path.dirname(file), { recursive: true });
    const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.tmp`);
    writeFileSync(tmp, bytes);
    renameSync(tmp, file);
}
async function download(url) {
    // Three attempts: a release asset or a raw file behind a CDN fails transiently now and then, and a build should not.
    let last;
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            const res = await fetch(url, { redirect: 'follow' });
            if (res.ok)
                return Buffer.from(await res.arrayBuffer());
            last = new Error(`HTTP ${res.status}`);
            if (res.status < 500 && res.status !== 429)
                break;
        }
        catch (err) {
            last = err;
        }
        await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
    throw new Error(`grammar download failed: ${url} -> ${last instanceof Error ? last.message : String(last)}`);
}
function git(cwd, args) {
    execFileSync('git', ['-c', 'advice.detachedHead=false', '-c', 'core.autocrlf=false', ...args], { cwd, stdio: ['ignore', 'ignore', 'inherit'] });
}
function checkout(dir, repo, commit) {
    mkdirSync(dir, { recursive: true });
    git(dir, ['init', '-q', '.']);
    git(dir, ['fetch', '-q', '--depth', '1', repo, commit]);
    git(dir, ['checkout', '-q', 'FETCH_HEAD']);
}
function treeSitterCli(resolveFrom, wanted) {
    const found = findInstalledPackage(resolveFrom, 'tree-sitter-cli');
    if (found === undefined)
        throw new Error(`building a grammar from source needs tree-sitter-cli ${wanted} installed (a devDependency of the building package).`);
    const bin = path.join(found.dir, process.platform === 'win32' ? 'tree-sitter.exe' : 'tree-sitter');
    const version = execFileSync(bin, ['--version'], { encoding: 'utf8' }).trim().split(/\s+/)[1];
    if (version !== wanted)
        throw new Error(`the grammar manifest pins tree-sitter-cli ${wanted}, but ${version} is installed: install the pinned version.`);
    return bin;
}
function buildFromSource(pin, source, cli, patchesRoot) {
    const work = mkdtempSync(path.join(os.tmpdir(), 'runes-grammar-'));
    try {
        const repoDir = path.join(work, 'repo');
        checkout(repoDir, pin.repo, pin.commit);
        for (const patch of source.patches ?? [])
            git(repoDir, ['apply', path.join(patchesRoot, patch)]);
        for (const dep of source.deps ?? [])
            checkout(path.join(repoDir, dep.path), dep.repo, dep.commit);
        const grammarDir = path.join(repoDir, source.dir);
        if (source.generate)
            execFileSync(cli, ['generate'], { cwd: grammarDir, stdio: ['ignore', 'ignore', 'inherit'] });
        const out = path.join(work, 'out.wasm');
        execFileSync(cli, ['build', '--wasm', '-o', out, grammarDir], { cwd: repoDir, stdio: ['ignore', 'ignore', 'inherit'] });
        return { wasm: readFileSync(out), nodeTypes: readFileSync(path.join(grammarDir, 'src', 'node-types.json')) };
    }
    finally {
        rmSync(work, { recursive: true, force: true });
    }
}
const rawNodeTypesUrl = (pin) => `https://raw.githubusercontent.com/${pin.repo.replace(/^https:\/\/github\.com\//, '')}/${pin.commit}/src/node-types.json`;
/**
 * Builds (or fetches, or copies) the pinned grammars into `outDir`, verified by sha256. Every requested grammar is materialized before anything is written, so a failing pin leaves no partial set behind. A grammar whose two files already sit in `outDir` with the pinned bytes is left as it is.
 */
export async function buildGrammars(options) {
    const manifest = options.manifest ?? loadGrammarManifest();
    const log = options.log ?? (() => { });
    const cacheDir = options.cacheDir ?? process.env.RUNES_GRAMMAR_CACHE ?? path.join(os.homedir(), '.cache', 'runes', 'grammars');
    const patchesRoot = options.patchesRoot ?? shippedGrammarsDir();
    const resolveFrom = path.resolve(options.resolveFrom ?? process.cwd());
    const only = options.only === undefined ? undefined : new Set(options.only);
    const pins = manifest.grammars.filter((g) => only === undefined || only.has(g.language));
    if (only !== undefined) {
        const missing = [...only].filter((l) => !manifest.grammars.some((g) => g.language === l));
        if (missing.length > 0)
            throw new Error(`the grammar manifest pins no grammar for: ${missing.join(', ')}`);
    }
    let cli;
    const outputs = [];
    for (const pin of pins) {
        const what = (file) => `${pin.language} (${file})`;
        const outWasm = path.join(options.outDir, pin.wasmFile);
        const outTypes = path.join(options.outDir, syntaxNodeTypesFile(pin.wasmFile));
        const inOut = { wasm: readVerified(outWasm, pin.sha256.wasm), nodeTypes: readVerified(outTypes, pin.sha256.nodeTypes) };
        if (inOut.wasm && inOut.nodeTypes && !options.rebuild) {
            outputs.push({ pin, wasm: inOut.wasm, nodeTypes: inOut.nodeTypes, from: 'out' });
            continue;
        }
        const src = pin.source;
        if (src.kind === 'npm') {
            const found = findInstalledPackage(resolveFrom, src.package);
            if (found === undefined)
                throw new Error(`grammar ${pin.language}: the npm package ${src.package}@${src.version} is not installed where it is resolved from (${resolveFrom}).`);
            const installed = found.version;
            if (installed !== src.version)
                throw new Error(`grammar ${pin.language}: ${src.package}@${installed} is installed, but its pin is ${src.version}. A 0.x grammar minor can rename or restructure node types, so a bump is reviewed, not taken silently.`);
            const dir = found.dir;
            outputs.push({
                pin,
                wasm: verifyPinned(what('wasm'), readFileSync(path.join(dir, src.wasmPath)), pin.sha256.wasm),
                nodeTypes: verifyPinned(what('node-types.json'), readFileSync(path.join(dir, src.nodeTypesPath)), pin.sha256.nodeTypes),
                from: 'npm',
            });
            continue;
        }
        if (!options.rebuild) {
            const wasm = readCache(cacheDir, pin.sha256.wasm, log);
            const nodeTypes = readCache(cacheDir, pin.sha256.nodeTypes, log);
            if (wasm && nodeTypes) {
                outputs.push({ pin, wasm, nodeTypes, from: 'cache' });
                continue;
            }
        }
        if (options.offline)
            throw new Error(`grammar ${pin.language} is not in the cache (${cacheDir}) and offline mode forbids fetching or building it.`);
        let files;
        let from;
        if (src.kind === 'github-release') {
            log(`downloading ${pin.language} ${pin.version ?? ''} from ${src.url}`);
            files = { wasm: await download(src.url), nodeTypes: await download(rawNodeTypesUrl(pin)) };
            from = 'download';
        }
        else {
            cli ??= treeSitterCli(resolveFrom, manifest.cli.version);
            log(`building ${pin.language} from ${pin.repo} at ${pin.commit} with tree-sitter-cli ${manifest.cli.version}`);
            files = buildFromSource(pin, src, cli, patchesRoot);
            from = 'source';
        }
        verifyPinned(what('wasm'), files.wasm, pin.sha256.wasm);
        verifyPinned(what('node-types.json'), files.nodeTypes, pin.sha256.nodeTypes);
        writeAtomicFile(path.join(cacheDir, pin.sha256.wasm), files.wasm);
        writeAtomicFile(path.join(cacheDir, pin.sha256.nodeTypes), files.nodeTypes);
        outputs.push({ pin, ...files, from });
    }
    for (const o of outputs) {
        if (o.from === 'out')
            continue;
        writeAtomicFile(path.join(options.outDir, o.pin.wasmFile), o.wasm);
        writeAtomicFile(path.join(options.outDir, syntaxNodeTypesFile(o.pin.wasmFile)), o.nodeTypes);
    }
    log(`${outputs.length} pinned grammars in ${options.outDir} (wasm + node-types.json, sha256-verified)`);
    return outputs.map((o) => ({ language: o.pin.language, wasmFile: o.pin.wasmFile, from: o.from }));
}
/**
 * Checks grammar files a consumer ships or loads against the manifest: every requested pin's WASM and node-types.json must exist in `dir` with the pinned sha256. Returns the problems; an empty list means the directory holds exactly the pinned bytes.
 */
export function verifyGrammarFiles(dir, options = {}) {
    const manifest = options.manifest ?? loadGrammarManifest();
    const only = options.only === undefined ? undefined : new Set(options.only);
    const problems = [];
    for (const pin of manifest.grammars) {
        if (only !== undefined && !only.has(pin.language))
            continue;
        for (const [file, expected] of [[pin.wasmFile, pin.sha256.wasm], [syntaxNodeTypesFile(pin.wasmFile), pin.sha256.nodeTypes]]) {
            const p = path.join(dir, file);
            if (!existsSync(p)) {
                problems.push({ language: pin.language, file, problem: 'missing', expected });
                continue;
            }
            const actual = sha256(readFileSync(p));
            if (actual !== expected)
                problems.push({ language: pin.language, file, problem: 'mismatch', expected, actual });
        }
    }
    return problems;
}
