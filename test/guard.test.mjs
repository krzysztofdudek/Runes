import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  tokenize, scanSource, listExports, identifierWords, domainWordsIn, parseAllow, runGuard, guardPassed, formatGuardReport, guardConfig, DEFAULT_DOMAIN_WORDS,
} from '@chrisdudek/runes/testkit';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const rules = (src, config) => scanSource(src, 'x.mts', config).map((f) => `${f.rule}:${f.subject}`);

describe('the guard over Runes itself', () => {
  test('src/ reaches no family tool and exports no family domain word', () => {
    const report = runGuard({ root });
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
