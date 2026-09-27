import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'skills');
const FRAGMENTS = ['evidence', 'mcp-first', 'worker-worktree'];

test('skills/ holds the shared fragments, and the package ships them', () => {
  assert.deepEqual(readdirSync(dir).filter((f) => f.endsWith('.md')).map((f) => f.slice(0, -3)).sort(), FRAGMENTS);
  assert.ok(JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).files.includes('skills'));
});

for (const name of FRAGMENTS) {
  test(`fragment ${name}: a vendorable name, LF, one final newline, no markers, no hard wraps, tool-neutral`, () => {
    assert.match(name, /^[A-Za-z0-9_-]+$/, 'the name the vendor tool accepts');
    const text = readFileSync(join(dir, `${name}.md`), 'utf8');
    assert.ok(!text.includes('\r'), 'LF only');
    assert.ok(text.endsWith('\n') && !text.endsWith('\n\n'), 'exactly one final newline');
    assert.ok(!/RUNES:/.test(text), 'no marker inside a fragment');
    assert.ok(!/^#{1,6} /m.test(text), 'no heading: the consumer places the fragment under its own');
    const lines = text.split('\n');
    lines.forEach((line, i) => { if (i > 0 && line && lines[i - 1] && !line.startsWith('- ')) assert.fail(`a line continues the one before it (a hard wrap?): ${line}`); });
    const tools = /\b(yggdrasil|yg|grain|jarl|horde|runes)\b/i.exec(text);
    assert.equal(tools, null, `names a family tool: ${tools?.[0]}`);
  });
}
