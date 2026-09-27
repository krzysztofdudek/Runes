import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, win32 } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  tokenize, scanSource, listExports, identifierWords, domainWordsIn, parseAllow, runGuard, guardPassed, formatGuardReport, guardConfig, DEFAULT_DOMAIN_WORDS,
} from '@chrisdudek/runes/testkit';
import { relativePosix } from '../dist/testkit/guard/run.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const rules = (src, config) => scanSource(src, 'x.mts', config).map((f) => `${f.rule}:${f.subject}`);

describe('the guard over Runes itself', () => {
  test('src/, tools/ and scripts/ reach no family tool and exports no family domain word', () => {
    const report = runGuard({ root, dirs: ['src', 'tools', 'scripts'] });
    assert.ok(report.files.length > 0);
    assert.ok(guardPassed(report), formatGuardReport(report));
  });
});

describe('tokenize', () => {
  test('drops comments, keeps strings, templates and regex apart from division', () => {
    const toks = tokenize("// import 'yg'\n/* spawn('jarl') */ const a = b / c; const r = /\\/x/g; const s = `p${'q'}r`;");
    assert.ok(!toks.some((t) => t.value === 'yg' || t.value === 'jarl'));
    assert.ok(toks.some((t) => t.type === 'regex' && t.value === '/\\/x/g'));
    assert.deepEqual(toks.filter((t) => t.type === 'template').map((t) => t.value), ['p', 'r']);
    assert.ok(toks.some((t) => t.type === 'string' && t.value === 'q'));
  });

  test('tracks lines across block comments and templates', () => {
    const toks = tokenize('/*\n\n*/\nconst x = `a\nb`;\nfoo');
    assert.equal(toks.find((t) => t.value === 'x').line, 4);
    assert.equal(toks.find((t) => t.value === 'foo').line, 6);
  });
});

describe('rule: import', () => {
  test('flags static, side-effect, re-export, dynamic and require imports of family tools', () => {
    const src = [
      "import { x } from '@chrisdudek/yg';",
      "import '@chrisdudek/grain/engine';",
      "export * from '../jarl/scripts/jarl.mjs';",
      "const h = await import('../../Horde/horde.mjs');",
      "const y = require('./yggdrasil/index.js');",
    ].join('\n');
    assert.deepEqual(rules(src).filter((r) => r.startsWith('import:')), [
      'import:@chrisdudek/yg', 'import:@chrisdudek/grain/engine', 'import:../jarl/scripts/jarl.mjs', 'import:../../Horde/horde.mjs', 'import:./yggdrasil/index.js',
    ]);
  });

  test('require.resolve and import.meta.resolve count as imports', () => {
    const src = "const a = require.resolve('@chrisdudek/grain/package.json');\nconst b = import.meta.resolve('../jarl/record.mjs');\nconst c = path.resolve('x');";
    assert.deepEqual(rules(src), ['import:@chrisdudek/grain/package.json', 'import:../jarl/record.mjs']);
  });

  test('ignores unrelated imports, similar names, and words in comments', () => {
    const src = "// see jarl for details\nimport fs from 'node:fs';\nimport g from './grain-size.mjs';\nimport { walk } from '@chrisdudek/runes/ast';";
    assert.deepEqual(rules(src), []);
  });

  test('self and declared edges are free', () => {
    const src = "import a from '../jarl/record.mjs';\nimport b from '@chrisdudek/yg';\nimport c from '@chrisdudek/horde';";
    assert.deepEqual(rules(src, guardConfig({ self: 'jarl', edges: ['yggdrasil'] })), ['import:@chrisdudek/horde']);
  });
});

describe('rule: spawn', () => {
  test('flags spawn/exec/execFile of a family executable, bare or as a script path', () => {
    const src = [
      "spawn('yg', ['check']);",
      "cp.execSync(`grain survey`);",
      "execFile(process.execPath, [join(dir, 'jarl.mjs'), 'show']);",
      "spawnSync('npx', ['horde', 'status']);",
    ].join('\n');
    assert.deepEqual(rules(src), ['spawn:yg', 'spawn:grain', 'spawn:jarl.mjs', 'spawn:horde']);
  });

  test('catches package and bin paths in any argument, shell operators, Worker, and tagged templates', () => {
    const src = [
      "execFileSync(process.execPath, ['node_modules/@chrisdudek/yg/dist/bin.js', 'check']);",
      "execSync('git status&&grain survey');",
      "new Worker(new URL('../horde/worker.mjs', import.meta.url));",
      'await $`jarl show 1`;',
    ].join('\n');
    assert.deepEqual(rules(src), ['spawn:node_modules/@chrisdudek/yg/dist/bin.js', 'spawn:grain', 'spawn:../horde/worker.mjs', 'spawn:jarl']);
  });

  test('ignores other commands and regex .exec', () => {
    assert.deepEqual(rules("spawn('git', ['status']);\n/jarl/.exec(s);\nexecSync('npm test');"), []);
  });
});

describe('rule: state-path', () => {
  test('flags string literals naming a state directory as a path segment', () => {
    const src = "const a = join(root, '.yggdrasil');\nconst b = `${root}/.jarl/log.md`;\nconst c = 'x/.horde/y';";
    assert.deepEqual(rules(src), ['state-path:.yggdrasil', 'state-path:.jarl', 'state-path:.horde']);
  });

  test('ignores look-alikes and comments', () => {
    assert.deepEqual(rules("// write to .jarl/\nconst a = 'file.grain';\nconst b = '.grainy/x';"), []);
  });
});

describe('rule: export-word', () => {
  test('lists ESM and CommonJS exported names', () => {
    const src = [
      'export function a() {}', 'export async function* b() {}', 'export default class C {}', 'export const d = 1, e = [1, 2];',
      'export const { f, g: h } = obj;', 'export interface I {}', 'export type T = string;', 'export const enum E {}', 'export declare namespace N {}',
      'const j = 1; export { j, j as k, type T as U };', "export * as ns from './x.mjs';", 'exports.l = 1;', 'module.exports.m = 2;', 'module.exports = { n, o: 1, p() {} };',
    ].join('\n');
    assert.deepEqual(listExports(src).map((x) => x.name), ['a', 'b', 'C', 'd', 'e', 'f', 'h', 'I', 'T', 'E', 'N', 'j', 'k', 'U', 'ns', 'l', 'm', 'n', 'o', 'p']);
  });

  test('splits identifiers into words', () => {
    assert.deepEqual(identifierWords('ownerNode'), ['owner', 'node']);
    assert.deepEqual(identifierWords('HTTPTicketLoop2'), ['http', 'ticket', 'loop2']);
    assert.deepEqual(identifierWords('MISSION_ID'), ['mission', 'id']);
  });

  test('flags domain words, with plurals, and honours qualifiers for node', () => {
    assert.deepEqual(domainWordsIn('ownerNode', DEFAULT_DOMAIN_WORDS), ['node']);
    assert.deepEqual(domainWordsIn('listAspects', DEFAULT_DOMAIN_WORDS), ['aspect']);
    assert.deepEqual(domainWordsIn('SyntaxNode', DEFAULT_DOMAIN_WORDS), []);
    assert.deepEqual(domainWordsIn('walkNodes', DEFAULT_DOMAIN_WORDS), []);
    assert.deepEqual(domainWordsIn('nodeCount', DEFAULT_DOMAIN_WORDS), ['node']);
    assert.deepEqual(domainWordsIn('missionTicket', DEFAULT_DOMAIN_WORDS), ['ticket', 'mission']);
    assert.deepEqual(domainWordsIn('withLock', DEFAULT_DOMAIN_WORDS), []);
  });

  test('flags exported names only, never locals', () => {
    assert.deepEqual(rules('const ticketId = 1;\nexport const ownerNode = 2;\nfunction loop() {}'), ['export-word:ownerNode']);
  });

  test('the word list is configurable, and empty turns the rule off', () => {
    const src = 'export const aspectLoop = 1;';
    assert.deepEqual(rules(src, guardConfig({ domainWords: [] })), []);
    assert.deepEqual(rules(src, guardConfig({ domainWords: [{ word: 'aspect' }] })), ['export-word:aspectLoop']);
  });
});

describe('allow file', () => {
  test('parses entries and reasons, rejects malformed lines', () => {
    assert.deepEqual(parseAllow('# c\nsrc/a.mts import @chrisdudek/yg # why\n\nsrc/** export-word\n'), [
      { path: 'src/a.mts', rule: 'import', subject: '@chrisdudek/yg', line: 2, reason: 'why' },
      { path: 'src/**', rule: 'export-word', line: 4 },
    ]);
    assert.throws(() => parseAllow('justonefield'), /line 1/);
  });

  test('silences matching findings and reports stale entries', () => {
    const dir = mkdtempSync(join(tmpdir(), 'runes-guard-'));
    try {
      mkdirSync(join(dir, 'src', 'deep'), { recursive: true });
      writeFileSync(join(dir, 'src', 'a.mts'), "import x from '@chrisdudek/yg';\nexport const ownerNode = 1;\n");
      writeFileSync(join(dir, 'src', 'deep', 'b.mjs'), "spawn('jarl', []);\n");
      writeFileSync(join(dir, 'src', 'readme.md'), "import x from '@chrisdudek/yg';\n");
      let report = runGuard({ root: dir });
      assert.equal(report.files.length, 2);
      assert.deepEqual(report.findings.map((f) => `${f.file}:${f.rule}`), ['src/a.mts:import', 'src/a.mts:export-word', 'src/deep/b.mjs:spawn']);
      assert.equal(guardPassed(report), false);

      writeFileSync(join(dir, 'guard.allow'), 'src/a.mts import @chrisdudek/yg\nsrc/a.mts export-word ownerNode\nsrc/**/*.mjs spawn\nsrc/gone.mts import\n');
      report = runGuard({ root: dir });
      assert.deepEqual(report.findings, []);
      assert.equal(report.allowed.length, 3);
      assert.deepEqual(report.unusedAllow.map((e) => e.path), ['src/gone.mts']);
      assert.equal(guardPassed(report), false);
      assert.match(formatGuardReport(report), /silences nothing/);

      writeFileSync(join(dir, 'guard.allow'), 'src/a.mts import @chrisdudek/grain\n');
      report = runGuard({ root: dir });
      assert.equal(report.findings.length, 3, 'a subject mismatch silences nothing');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('Windows sources and paths', () => {
  test('CRLF source: lines count the same, and a string continued across CRLF does not end early', () => {
    const src = "const a = 'x\\\r\ny';\r\nconst b = 'z';\r\nspawn('jarl', []);\r\nconst t = `a\r\nb`;\r\nexport const ownerNode = 1;\r\n";
    const toks = tokenize(src);
    assert.deepEqual(toks.filter((t) => t.type === 'string').map((t) => [t.value, t.line]), [['xy', 1], ['z', 3], ['jarl', 4]]);
    assert.deepEqual(toks.filter((t) => t.type === 'template').map((t) => t.value), ['a\nb']);
    assert.deepEqual(scanSource(src, 'x.mts').map((f) => `${f.line}:${f.rule}:${f.subject}`), ['4:spawn:jarl', '7:export-word:ownerNode']);
  });

  test('Windows command paths and shims reach the tool: drive letters, backslashes, .cmd, .exe, any case', () => {
    const src = [
      "execFileSync('C:\\\\Users\\\\me\\\\AppData\\\\Roaming\\\\npm\\\\yg.cmd', ['check']);",
      "spawn('Grain.EXE', []);",
      "execSync('npx.cmd jarl show 1');",
    ].join('\n');
    assert.deepEqual(rules(src), ['spawn:C:\\Users\\me\\AppData\\Roaming\\npm\\yg.cmd', 'spawn:Grain.EXE', 'spawn:jarl']);
  });

  test('a backslash path into a state directory is a state-path finding', () => {
    assert.deepEqual(rules("const p = 'C:\\\\repo\\\\.jarl\\\\log.md';\nconst q = '.horde\\\\tickets';"), ['state-path:.jarl', 'state-path:.horde']);
  });

  test('an allow file saved with CRLF parses the same', () => {
    assert.deepEqual(parseAllow('src/a.mts import @chrisdudek/yg # why\r\n\r\nsrc/** export-word\r\n'), [
      { path: 'src/a.mts', rule: 'import', subject: '@chrisdudek/yg', line: 1, reason: 'why' },
      { path: 'src/**', rule: 'export-word', line: 3 },
    ]);
  });

  test('scanned paths are reported with forward slashes under win32 path rules', () => {
    assert.equal(relativePosix('C:\\repo', 'C:\\repo\\src\\deep\\b.mjs', win32), 'src/deep/b.mjs');
    assert.equal(relativePosix('C:\\repo', 'c:\\REPO\\src\\a.mts', win32), 'src/a.mts', 'win32 compares drive and folder case-insensitively');
  });
});
