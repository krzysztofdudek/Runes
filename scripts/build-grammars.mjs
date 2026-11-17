// Builds the pinned grammars into a directory with the recipe in dist/grammars (buildGrammars), for Runes' own tests and for the grammar files the published package carries. Consumers call buildGrammars from their own build instead; the package ships no executable.
//
//   node scripts/build-grammars.mjs [--out <dir>] [--only <language>,... | --table | --package [--resolve-from <dir>]]
//
// --table builds the grammars of the Runes language table (what the tests parse with); without --only or --table every pin is built, which needs every npm grammar package installed. --package builds every pin into grammars/built/ (gitignored), the files the published package carries, and then fails unless that directory holds exactly the two pinned files of each pin: the release runs it before the pack, and npm publish runs it again (prepublishOnly, which no install of the package runs). It reads the npm pins from grammars/npm/, a folder of its own that npm run grammars:package installs with no install script, so the root install carries no grammar package beyond the three the tests parse with; --resolve-from names another such folder. --out defaults to .grammars/ (gitignored), or grammars/built/ with --package. RUNES_GRAMMAR_CACHE sets the content-addressed cache (default ~/.cache/runes/grammars), RUNES_GRAMMAR_REBUILD=1 ignores it and re-derives every non-npm grammar, RUNES_GRAMMAR_OFFLINE=1 forbids downloads and source builds.
//
// On Windows a grammar built from source never matches its pin (the Windows wasi-sdk labels its clang differently in the WASM producers section), so buildGrammars refuses the source build there and says so: build on Linux, macOS or WSL and bring the cache over (CI hands the Windows job the Ubuntu job's cache).
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildGrammars, LANGUAGES, loadGrammarManifest, verifyGrammarFiles } from '../dist/grammars/index.mjs';
import { shippedGrammarFilesDir } from '../dist/grammars/build.mjs';
import { syntaxNodeTypesFile } from '../dist/grammars/manifest.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
let out;
let only;
let forPackage = false;
let resolveFrom;
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--out') out = path.resolve(argv[++i] ?? '');
  else if (argv[i] === '--only') only = (argv[++i] ?? '').split(',').filter(Boolean);
  else if (argv[i] === '--table') only = Object.keys(LANGUAGES);
  else if (argv[i] === '--package') forPackage = true;
  else if (argv[i] === '--resolve-from') resolveFrom = path.resolve(argv[++i] ?? '');
  else {
    process.stderr.write(`build-grammars: unknown argument ${argv[i]}\n`);
    process.exit(2);
  }
}
if (forPackage && only !== undefined) {
  process.stderr.write('build-grammars: --package builds every pin and takes no --only or --table\n');
  process.exit(2);
}
if (!forPackage && resolveFrom !== undefined) {
  process.stderr.write('build-grammars: --resolve-from goes with --package\n');
  process.exit(2);
}
resolveFrom ??= forPackage ? path.join(root, 'grammars', 'npm') : root;
out ??= forPackage ? shippedGrammarFilesDir() : path.join(root, '.grammars');
try {
  const built = await buildGrammars({
    outDir: out,
    only,
    resolveFrom,
    rebuild: process.env.RUNES_GRAMMAR_REBUILD === '1',
    offline: process.env.RUNES_GRAMMAR_OFFLINE === '1',
    log: (line) => process.stderr.write(`[grammars] ${line}\n`),
  });
  const fresh = built.filter((b) => b.from !== 'out');
  if (fresh.length > 0) process.stderr.write(`[grammars] wrote ${fresh.map((b) => `${b.language} (${b.from})`).join(', ')}\n`);
  if (forPackage) {
    const pinned = new Set(loadGrammarManifest().grammars.flatMap((g) => [g.wasmFile, syntaxNodeTypesFile(g.wasmFile)]));
    const problems = [
      ...verifyGrammarFiles(out).map((p) => `${p.file}: ${p.problem}`),
      ...readdirSync(out).filter((f) => !pinned.has(f)).map((f) => `${f}: no pin names it`),
    ];
    if (problems.length > 0) throw new Error(`${out} must hold exactly the pinned grammar files, and does not:\n  ${problems.join('\n  ')}`);
    process.stderr.write(`[grammars] ${out} holds the ${pinned.size} pinned files of ${pinned.size / 2} grammars, for the package\n`);
  }
} catch (err) {
  process.stderr.write(`[grammars] FAIL: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
}
