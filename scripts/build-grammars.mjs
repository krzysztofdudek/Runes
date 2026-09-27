// Builds the pinned grammars into a directory with the recipe in dist/grammars (buildGrammars), for Runes' own tests. Consumers call buildGrammars from their own build instead; the package ships no executable.
//
//   node scripts/build-grammars.mjs [--out <dir>] [--only <language>,... | --table]
//
// --table builds the grammars of the Runes language table (what the tests parse with); without --only or --table every pin is built, which needs every npm grammar package installed. --out defaults to .grammars/ (gitignored). RUNES_GRAMMAR_CACHE sets the content-addressed cache (default ~/.cache/runes/grammars), RUNES_GRAMMAR_REBUILD=1 ignores it and re-derives every non-npm grammar, RUNES_GRAMMAR_OFFLINE=1 forbids downloads and source builds.
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildGrammars, LANGUAGES } from '../dist/grammars/index.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
let out = path.join(root, '.grammars');
let only;
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--out') out = path.resolve(argv[++i] ?? '');
  else if (argv[i] === '--only') only = (argv[++i] ?? '').split(',').filter(Boolean);
  else if (argv[i] === '--table') only = Object.keys(LANGUAGES);
  else {
    process.stderr.write(`build-grammars: unknown argument ${argv[i]}\n`);
    process.exit(2);
  }
}
try {
  const built = await buildGrammars({
    outDir: out,
    only,
    resolveFrom: root,
    rebuild: process.env.RUNES_GRAMMAR_REBUILD === '1',
    offline: process.env.RUNES_GRAMMAR_OFFLINE === '1',
    log: (line) => process.stderr.write(`[grammars] ${line}\n`),
  });
  const fresh = built.filter((b) => b.from !== 'out');
  if (fresh.length > 0) process.stderr.write(`[grammars] wrote ${fresh.map((b) => `${b.language} (${b.from})`).join(', ')}\n`);
} catch (err) {
  process.stderr.write(`[grammars] FAIL: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
}
