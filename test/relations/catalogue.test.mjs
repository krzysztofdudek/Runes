// The relation reference catalogue (reference/relations/<language>/<id>.md, 460 cases) and the matrix suites that run it (extractors/*-name-resolution-matrix.test.mjs, one runCase('<id>') per case) correspond one to one: every case is run by exactly one test and every runCase names a case of its own language. Each case is well formed: its frontmatter, its files and its expectation parse, and its id is its file name.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listCases, loadCaseDoc } from './reference-case-runner.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const cases = listCases();

test('the catalogue holds 460 cases over 12 languages', () => {
  assert.equal(cases.length, 460);
  assert.equal(new Set(cases.map((c) => c.language)).size, 12);
});

test('every case parses, and its id and language match its path', () => {
  for (const c of cases) {
    const text = readFileSync(c.mdPath, 'utf8');
    assert.match(text, new RegExp(`^---\\nid: ${c.id}\\n`), `${c.mdPath}: frontmatter id`);
    const doc = loadCaseDoc(c.id, c.mdPath);
    assert.equal(doc.language, c.language, `${c.id}: frontmatter language`);
  }
});

test('every case is run by exactly one matrix test, and every runCase names a case', () => {
  const dir = path.join(here, 'extractors');
  const runs = new Map();
  for (const f of readdirSync(dir).filter((n) => n.endsWith('-name-resolution-matrix.test.mjs'))) {
    for (const m of readFileSync(path.join(dir, f), 'utf8').matchAll(/runCase\('([^']+)'\)/g)) {
      runs.set(m[1], [...(runs.get(m[1]) ?? []), f]);
    }
  }
  const ids = new Set(cases.map((c) => c.id));
  assert.deepEqual([...runs.keys()].filter((id) => !ids.has(id)), [], 'runCase of an id with no catalogue case');
  assert.deepEqual(cases.filter((c) => !runs.has(c.id)).map((c) => c.id), [], 'catalogue cases no matrix test runs');
  assert.deepEqual([...runs].filter(([, fs]) => fs.length > 1).map(([id]) => id), [], 'cases run more than once');
});
