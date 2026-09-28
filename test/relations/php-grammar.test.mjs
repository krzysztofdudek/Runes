// Why PHP is parsed with the `php` grammar and not `php_only`. PHP executes only what sits between `<?php` (or `<?=`) and `?>`; everything outside is output, printed verbatim. The `php` grammar models exactly that: text outside the tags is a `text` node, and the PHP inside the tags gets the same syntax nodes php_only gives. php_only reads the whole file as PHP code, so a file without an opening tag, or the HTML around the tags, is read as code: prose that looks like `use A\B;` becomes a dependency PHP never has (a false edge), and a template's HTML becomes syntax errors. The whole PHP catalogue and the PHP extractor tests pass on both grammars (the recorded evidence of issue 467); these cases pin the difference.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { phpExtractor } from '../helpers/internal/relations.mjs';
import { host, parsedFile } from '../helpers/tree-sitter.mjs';

const uses = (code) => host.withParsedFile('t.php', code, (tree) => ({
  hasError: tree.rootNode.hasError,
  uses: phpExtractor.uses(parsedFile('t.php', code, tree, 'php')).map((u) => [u.line, u.candidates.map((c) => c.specifier ?? c.symbolKey).join('|')]),
}));

test('a template: the PHP inside the tags is read, the HTML around it parses clean', async () => {
  const r = await uses('<html><body>\n<?php use App\\Models\\User; ?>\n<p><?= User::find(1)->name ?></p>\n<?php $m = new \\App\\Service\\Mailer(); ?>\n</body></html>\n');
  assert.equal(r.hasError, false);
  assert.deepEqual(r.uses, [[2, 'App\\Models\\User'], [4, 'App\\Service\\Mailer']]);
});

test('text outside the tags is output, never code: no dependency is read from it', async () => {
  assert.deepEqual((await uses('use App\\Legacy\\Thing;\n$x = new \\App\\Old\\Widget();\n')).uses, []);
  const r = await uses('<h1>Docs</h1>\nuse App\\Legacy\\Thing;\n<?php use App\\Real\\Dep; ?>\n');
  assert.equal(r.hasError, false);
  assert.deepEqual(r.uses, [[3, 'App\\Real\\Dep']]);
});

test('an ordinary class file reads the same as before', async () => {
  const r = await uses('<?php\nnamespace App\\Http;\nuse App\\Models\\User;\nclass C extends \\App\\Base {}\n');
  assert.equal(r.hasError, false);
  assert.deepEqual(r.uses, [[3, 'App\\Models\\User'], [4, 'App\\Base']]);
});
