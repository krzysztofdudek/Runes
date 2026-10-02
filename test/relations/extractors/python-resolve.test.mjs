// Moved from Yggdrasil source/cli/tests/unit/relations/extractors/python-resolve.test.ts (vitest) to node:test; the assertions are unchanged.
import { describe, it, expect } from '../../helpers/expect.mjs';
import { resolvePythonModule } from '../../helpers/internal/relations.mjs';

// `exists` predicate over a fixed set of repo-relative POSIX files.
const known = new Set([
  'src/a/b.py',
  'src/a/__init__.py',
  'src/a/pkg/mod.py',
  'src/a/sib.py',
  'src/pkg/__init__.py',
  'top.py',
]);
const exists = (p) => known.has(p);

describe('resolvePythonModule — absolute', () => {
  it('resolves a module file via an ancestor source root', () => {
    // Importing from src/a/c.py, module `a.b` lives at src/a/b.py (root = src/).
    expect(resolvePythonModule('a.b', 'src/a/c.py', exists)).toBe('src/a/b.py');
  });

  it('resolves a package to its __init__.py', () => {
    expect(resolvePythonModule('pkg', 'src/a/c.py', exists)).toBe('src/pkg/__init__.py');
  });

  it('resolves `from a import b` (last segment is a submodule file)', () => {
    // `from a import b` emits candidate `a.b` → src/a/b.py.
    expect(resolvePythonModule('a.b', 'src/x.py', exists)).toBe('src/a/b.py');
  });

  it('longest-match: `a.b.thing` falls back to the parent module a.b', () => {
    // No src/a/b/thing.py; the parent module a.b (src/a/b.py) is the owning file.
    expect(resolvePythonModule('a.b.thing', 'src/a/c.py', exists)).toBe('src/a/b.py');
  });

  it('resolves a top-level module at the repo root', () => {
    expect(resolvePythonModule('top', 'src/a/c.py', exists)).toBe('top.py');
  });

  it('returns undefined for a stdlib/third-party module (no mapped file)', () => {
    expect(resolvePythonModule('os', 'src/a/c.py', exists)).toBeUndefined();
    expect(resolvePythonModule('requests', 'src/a/c.py', exists)).toBeUndefined();
  });

  it('returns undefined for a non-existent module (no file, no resolvable parent)', () => {
    // `nope.deep`: neither nope/deep.py, nope/deep/__init__.py, nope.py, nor
    // nope/__init__.py exists at any source root → a true resolution miss.
    expect(resolvePythonModule('nope.deep', 'src/a/c.py', exists)).toBeUndefined();
  });

  it('returns undefined for an empty specifier (no module segments)', () => {
    expect(resolvePythonModule('', 'src/a/c.py', exists)).toBeUndefined();
  });

  it('resolves a top-level module when the importing file sits at the repo root', () => {
    // dirname('main.py') === '.', so the ancestor walk starts from the repo root.
    const rootKnown = new Set(['top.py']);
    expect(resolvePythonModule('top', 'main.py', (p) => rootKnown.has(p))).toBe('top.py');
  });

  it('longest-match: `a.nope` falls back to package `a` __init__ (nope may be a symbol there)', () => {
    // Documented behaviour: `from a import nope` where `nope` is not a submodule
    // file resolves to the package a (src/a/__init__.py); the symbol lives inside.
    expect(resolvePythonModule('a.nope', 'src/a/c.py', exists)).toBe('src/a/__init__.py');
  });

  it('returns undefined when the own dir shadows a genuine root (2+ distinct files)', () => {
    // Importing file src/a/b.py does `from b.bar import x`. The genuine root is
    // src/, where b.bar -> src/b/bar.py (a real cross-node target). But the
    // importer's OWN dir src/a/ also "roots" the parent module b -> src/a/b.py
    // (the importing file itself). Two distinct files match across roots, so the
    // absolute resolver must SILENCE (undefined) rather than pick the nearer self.
    const shadow = new Set(['src/a/b.py', 'src/b/bar.py']);
    expect(resolvePythonModule('b.bar', 'src/a/b.py', (p) => shadow.has(p))).toBeUndefined();
  });

  it('returns undefined when an intermediate dir shadows a genuine root', () => {
    // Importing file src/pkg/a/c.py does an absolute `import pkg.mod`. The genuine
    // root is src/ -> src/pkg/mod.py. But the intermediate dir src/pkg/ also roots
    // pkg.mod -> src/pkg/pkg/mod.py. Two distinct files -> silence.
    const shadow = new Set(['src/pkg/pkg/mod.py', 'src/pkg/mod.py']);
    expect(resolvePythonModule('pkg.mod', 'src/pkg/a/c.py', (p) => shadow.has(p))).toBeUndefined();
  });

  it('still resolves a single-root cross-node import (no shadowing file present)', () => {
    // Paired positive: ONLY the genuine target exists (no self-shadow). The legit
    // cross-node edge `from b.bar import x` at the source root must still resolve.
    const clean = new Set(['src/b/bar.py']);
    expect(resolvePythonModule('b.bar', 'src/a/foo.py', (p) => clean.has(p))).toBe('src/b/bar.py');
  });

  describe('exclusion awareness', () => {
    // Same shadow shape as the "own dir shadows a genuine root" test above: two
    // ancestor roots each hold a file matching the same dotted module, so the
    // absolute resolver treats it as genuinely ambiguous and stays silent. An
    // `isExcluded` predicate that marks one of the two matches as graph-excluded
    // must drop it from the ambiguity count BEFORE the silence decision, the same
    // drop-then-decide rule the Go/Java package resolvers already apply.
    const shadow = new Set(['src/a/b.py', 'src/b/bar.py']);
    const shadowExists = (p) => shadow.has(p);

    it('control: with nothing excluded, two distinct roots stay ambiguous — silent', () => {
      expect(resolvePythonModule('b.bar', 'src/a/b.py', shadowExists)).toBeUndefined();
    });

    it('excluding the match that sorts FIRST resolves to the survivor', () => {
      // 'src/a/b.py' < 'src/b/bar.py' lexicographically.
      const isExcluded = (p) => p === 'src/a/b.py';
      expect(resolvePythonModule('b.bar', 'src/a/b.py', shadowExists, isExcluded)).toBe(
        'src/b/bar.py',
      );
    });

    it('excluding the match that sorts LAST resolves to the survivor', () => {
      const isExcluded = (p) => p === 'src/b/bar.py';
      expect(resolvePythonModule('b.bar', 'src/a/b.py', shadowExists, isExcluded)).toBe(
        'src/a/b.py',
      );
    });

    it('excluding an UNRELATED path elsewhere leaves a genuinely ambiguous resolution silent', () => {
      const isExcluded = (p) => p === 'somewhere/else/entirely.py';
      expect(
        resolvePythonModule('b.bar', 'src/a/b.py', shadowExists, isExcluded),
      ).toBeUndefined();
    });
  });

  describe('same-root module/package shadow', () => {
    // ONE source root holds both a module file (mod.py) and a same-named package
    // (mod/__init__.py). Verified against the real interpreter (python3 -c "import
    // lib.mod" with both lib/mod.py and lib/mod/__init__.py present loads the
    // __init__.py): CPython imports the PACKAGE — a regular package outranks a
    // same-named module file at the same root. The per-root candidate list tries
    // the package form first, then the module form, and does not stop at the first
    // EXISTING candidate regardless of exclusion, so excluding the package falls
    // through to the live module file at the very same root.
    const shadow = new Set(['mod.py', 'mod/__init__.py']);
    const shadowExists = (p) => shadow.has(p);

    it('control: with nothing excluded, the package candidate wins over the module-as-file — matches CPython', () => {
      expect(resolvePythonModule('mod', 'x.py', shadowExists)).toBe('mod/__init__.py');
    });

    it('excluding the package falls through to the live module-as-file at the same root', () => {
      const isExcluded = (p) => p === 'mod/__init__.py';
      expect(resolvePythonModule('mod', 'x.py', shadowExists, isExcluded)).toBe('mod.py');
    });

    it('excluding the module-as-file leaves the package resolution unaffected', () => {
      const isExcluded = (p) => p === 'mod.py';
      expect(resolvePythonModule('mod', 'x.py', shadowExists, isExcluded)).toBe('mod/__init__.py');
    });

    it('excluding both leaves the module unresolved', () => {
      const isExcluded = () => true;
      expect(resolvePythonModule('mod', 'x.py', shadowExists, isExcluded)).toBeUndefined();
    });
  });

  describe('module-only and package-only shapes are unaffected by the package-first order', () => {
    // Both shapes this fix must NOT disturb: a bare module file with no same-named
    // package still resolves (the package candidate simply does not exist), and a
    // bare package with no same-named module file still resolves via __init__.py —
    // pinned here as the two "no shadow" counterparts to the shadow tests above.
    it('a module file with no same-named package still resolves', () => {
      const soloModule = new Set(['solo.py']);
      expect(resolvePythonModule('solo', 'x.py', (p) => soloModule.has(p))).toBe('solo.py');
    });

    it('a package with no same-named module file still resolves via __init__.py', () => {
      const soloPackage = new Set(['solo/__init__.py']);
      expect(resolvePythonModule('solo', 'x.py', (p) => soloPackage.has(p))).toBe('solo/__init__.py');
    });
  });
});

describe('resolvePythonModule — relative', () => {
  it('resolves `..pkg.mod` from src/a/b/c.py to src/a/pkg/mod.py', () => {
    expect(resolvePythonModule('..pkg.mod', 'src/a/b/c.py', exists)).toBe('src/a/pkg/mod.py');
  });

  it('resolves `.sib` (one dot, same package) from src/a/x.py to src/a/sib.py', () => {
    expect(resolvePythonModule('.sib', 'src/a/x.py', exists)).toBe('src/a/sib.py');
  });

  it('resolves a bare `.` to the importing package __init__', () => {
    expect(resolvePythonModule('.', 'src/a/x.py', exists)).toBe('src/a/__init__.py');
  });

  it('returns undefined when the relative climb escapes the repo', () => {
    expect(resolvePythonModule('....deep', 'src/a/x.py', exists)).toBeUndefined();
  });

  it('returns undefined when the relative target does not exist', () => {
    expect(resolvePythonModule('.missing', 'src/a/x.py', exists)).toBeUndefined();
  });

  describe('same-root module/package shadow, exclusion-aware', () => {
    // `from .mod import X` from src/a/x.py: base 'src/a', tailPath 'mod', candidates
    // 'src/a/mod/__init__.py' (package) then 'src/a/mod.py' (module) — the same
    // package-then-module priority the absolute resolver uses (verified against the
    // real interpreter — see the absolute resolver's own shadow tests above).
    const shadow = new Set(['src/a/mod.py', 'src/a/mod/__init__.py']);
    const shadowExists = (p) => shadow.has(p);

    it('control: with nothing excluded, the package candidate wins over the module-as-file — matches CPython', () => {
      expect(resolvePythonModule('.mod', 'src/a/x.py', shadowExists)).toBe('src/a/mod/__init__.py');
    });

    it('excluding the package falls through to the live module-as-file at the same root', () => {
      const isExcluded = (p) => p === 'src/a/mod/__init__.py';
      expect(resolvePythonModule('.mod', 'src/a/x.py', shadowExists, isExcluded)).toBe(
        'src/a/mod.py',
      );
    });

    it('excluding the module-as-file leaves the package resolution unaffected', () => {
      const isExcluded = (p) => p === 'src/a/mod.py';
      expect(resolvePythonModule('.mod', 'src/a/x.py', shadowExists, isExcluded)).toBe(
        'src/a/mod/__init__.py',
      );
    });
  });
});

describe('resolvePythonModule — sys.path-like roots', () => {
  it('an ancestor package never roots an absolute import (stdlib name shadowed by app/logging.py)', () => {
    const files = new Set(['app/__init__.py', 'app/logging.py', 'app/api/__init__.py', 'app/api/routes.py']);
    expect(resolvePythonModule('logging', 'app/api/routes.py', (p) => files.has(p))).toBeUndefined();
  });

  it('a namespace sub-directory of a regular package is not a root either', () => {
    // app/api has no __init__.py, but its parent app/ is a regular package.
    const files = new Set(['app/__init__.py', 'app/api/logging.py', 'app/api/routes.py']);
    expect(resolvePythonModule('logging', 'app/api/routes.py', (p) => files.has(p))).toBeUndefined();
  });

  it('the directory above the top-level package still roots the package itself', () => {
    const files = new Set(['app/__init__.py', 'app/logging.py', 'app/api/__init__.py', 'app/api/routes.py']);
    expect(resolvePythonModule('app.logging', 'app/api/routes.py', (p) => files.has(p))).toBe('app/logging.py');
  });

  it('a discovered project root resolves a module that no ancestor roots', () => {
    const files = new Set(['src/core/service.py', 'tests/test_service.py']);
    const roots = () => ['src'];
    expect(resolvePythonModule('core.service', 'tests/test_service.py', (p) => files.has(p), undefined, roots)).toBe(
      'src/core/service.py',
    );
    // without the discovered roots the same import stays silent (the pre-discovery behaviour)
    expect(resolvePythonModule('core.service', 'tests/test_service.py', (p) => files.has(p))).toBeUndefined();
  });

  it('a discovered root never matches a standard-library top-level name', () => {
    const files = new Set(['packages/tools/logging.py', 'packages/tools/json/__init__.py']);
    const roots = () => ['packages/tools'];
    const exists = (p) => files.has(p);
    expect(resolvePythonModule('logging', 'packages/api/src/api/main.py', exists, undefined, roots)).toBeUndefined();
    expect(resolvePythonModule('json.decoder', 'packages/api/src/api/main.py', exists, undefined, roots)).toBeUndefined();
  });

  it('a module found under two discovered roots stays silent (distinct-match rule)', () => {
    const files = new Set(['packages/a/src/util.py', 'packages/b/src/util.py']);
    const roots = () => ['packages/a/src', 'packages/b/src'];
    expect(resolvePythonModule('util', 'apps/web/main.py', (p) => files.has(p), undefined, roots)).toBeUndefined();
  });

  it('a discovered root inside a regular package is ignored', () => {
    const files = new Set(['pkg/__init__.py', 'pkg/sub/mod.py']);
    const roots = () => ['pkg/sub'];
    expect(resolvePythonModule('mod', 'apps/web/main.py', (p) => files.has(p), undefined, roots)).toBeUndefined();
  });
});

describe('resolvePythonModule — a PEP 420 namespace directory is not a sys.path root (issue 009)', () => {
  // acme/ has no __init__.py (a top-level namespace package) and the repository root holds the project's pyproject.toml (flat layout, discovered root ''). Python puts the root on sys.path, never acme/, so `import logging` loads the standard library and `import yaml` the installed library, not acme/logging/ or acme/yaml/.
  const flat = new Set(['acme/core/__init__.py', 'acme/core/service.py', 'acme/logging/__init__.py', 'acme/yaml/__init__.py', 'acme/tool.py']);
  const flatExists = (p) => flat.has(p);
  const flatRoots = () => [''];

  it('a standard-library name from a sub-package never binds to the namespace directory', () => {
    expect(resolvePythonModule('logging', 'acme/core/service.py', flatExists, undefined, flatRoots)).toBeUndefined();
    expect(resolvePythonModule('logging.handlers', 'acme/core/service.py', flatExists, undefined, flatRoots)).toBeUndefined();
  });

  it('an external library name from a sub-package never binds to the namespace directory', () => {
    expect(resolvePythonModule('yaml', 'acme/core/service.py', flatExists, undefined, flatRoots)).toBeUndefined();
  });

  it('control: the namespace package itself still resolves from the project root', () => {
    expect(resolvePythonModule('acme.logging', 'acme/core/service.py', flatExists, undefined, flatRoots)).toBe('acme/logging/__init__.py');
  });

  it('control: the importing script\'s own directory stays a root (python acme/tool.py)', () => {
    expect(resolvePythonModule('logging', 'acme/tool.py', flatExists, undefined, flatRoots)).toBe('acme/logging/__init__.py');
    expect(resolvePythonModule('yaml', 'acme/tool.py', flatExists, undefined, flatRoots)).toBe('acme/yaml/__init__.py');
  });

  it('src layout: a namespace directory under the discovered src/ root is not a root (poetry)', () => {
    const files = new Set(['src/poetry/config/__init__.py', 'src/poetry/config/config.py', 'src/poetry/json/__init__.py']);
    const exists = (p) => files.has(p);
    const roots = () => ['src'];
    expect(resolvePythonModule('json', 'src/poetry/config/config.py', exists, undefined, roots)).toBeUndefined();
    expect(resolvePythonModule('json.JSONDecodeError', 'src/poetry/config/config.py', exists, undefined, roots)).toBeUndefined();
    expect(resolvePythonModule('poetry.json', 'src/poetry/config/config.py', exists, undefined, roots)).toBe('src/poetry/json/__init__.py');
  });

  it('a project nested in the repository: its namespace directory is not a root, the project root is (google-cloud-logging)', () => {
    const files = new Set([
      'packages/gcl/setup.py',
      'packages/gcl/google/cloud/logging/__init__.py',
      'packages/gcl/google/cloud/logging_v2/__init__.py',
      'packages/gcl/google/cloud/logging_v2/client.py',
    ]);
    const exists = (p) => files.has(p);
    const roots = () => ['packages/gcl'];
    const from = 'packages/gcl/google/cloud/logging_v2/client.py';
    expect(resolvePythonModule('logging', from, exists, undefined, roots)).toBeUndefined();
    expect(resolvePythonModule('logging.handlers', from, exists, undefined, roots)).toBeUndefined();
    expect(resolvePythonModule('google.cloud.logging', from, exists, undefined, roots)).toBe('packages/gcl/google/cloud/logging/__init__.py');
  });

  it('without a manifest, a standard-library name binds only at the importer\'s own directory or the repository root', () => {
    const files = new Set(['acme/core/__init__.py', 'acme/core/service.py', 'acme/logging/__init__.py', 'tools/json.py', 'tools/run.py']);
    const exists = (p) => files.has(p);
    expect(resolvePythonModule('logging', 'acme/core/service.py', exists)).toBeUndefined();
    // the importing script's own directory (python tools/run.py) and the repository root (python -m from the root) are first on sys.path
    expect(resolvePythonModule('json', 'tools/run.py', exists)).toBe('tools/json.py');
    const atRoot = new Set(['logging.py', 'acme/core/__init__.py', 'acme/core/service.py']);
    expect(resolvePythonModule('logging', 'acme/core/service.py', (p) => atRoot.has(p))).toBe('logging.py');
  });
});

describe('resolvePythonModule — a pkgutil namespace package shared by several distributions (issue 073)', () => {
  // Two workspace members ship the package `acme` (each with an `acme/__init__.py` that extends `__path__` with pkgutil); only core has `acme/settings.py`. Python finds acme.settings through the extended `__path__`, so the other member's `acme/__init__.py` (the parent-package fallback for `from acme import settings`) must not make the exact module ambiguous.
  const roots = () => ['', 'core/src', 'plugin/src'];
  const base = ['core/src/acme/__init__.py', 'core/src/acme/models/__init__.py', 'core/src/acme/models/user.py', 'plugin/src/acme/__init__.py', 'plugin/src/acme/x.py'];

  it('the exact module at one root wins over a sibling distribution\'s parent package', () => {
    const files = new Set([...base, 'core/src/acme/settings.py']);
    const exists = (p) => files.has(p);
    expect(resolvePythonModule('acme.settings', 'core/src/acme/models/user.py', exists, undefined, roots)).toBe('core/src/acme/settings.py');
    expect(resolvePythonModule('acme.settings', 'plugin/src/acme/x.py', exists, undefined, roots)).toBe('core/src/acme/settings.py');
  });

  it('control: a module found exactly under both roots stays silent', () => {
    const files = new Set([...base, 'core/src/acme/settings.py', 'plugin/src/acme/settings.py']);
    expect(resolvePythonModule('acme.settings', 'core/src/acme/models/user.py', (p) => files.has(p), undefined, roots)).toBeUndefined();
  });

  it('control: a symbol of the module (from acme.settings import DEBUG) still resolves to the module', () => {
    const files = new Set([...base, 'core/src/acme/settings.py']);
    expect(resolvePythonModule('acme.settings.DEBUG', 'core/src/acme/models/user.py', (p) => files.has(p), undefined, roots)).toBe('core/src/acme/settings.py');
  });

  it('control: with no exact module anywhere, the parent packages of both distributions stay ambiguous', () => {
    const files = new Set(base);
    expect(resolvePythonModule('acme.settings', 'core/src/acme/models/user.py', (p) => files.has(p), undefined, roots)).toBeUndefined();
  });

  it('control: with no exact module anywhere, a single parent package is the fallback (from acme import NAME)', () => {
    const files = new Set(['core/src/acme/__init__.py', 'core/src/acme/models/__init__.py', 'core/src/acme/models/user.py']);
    expect(resolvePythonModule('acme.NAME', 'core/src/acme/models/user.py', (p) => files.has(p), undefined, roots)).toBe('core/src/acme/__init__.py');
  });

  it('control: a parent MODULE file at another root still competes with the exact module (it cannot hold a submodule, so sys.path order decides)', () => {
    const files = new Set(['core/src/acme/__init__.py', 'core/src/acme/settings.py', 'plugin/src/acme.py', 'apps/main.py']);
    expect(resolvePythonModule('acme.settings', 'apps/main.py', (p) => files.has(p), undefined, roots)).toBeUndefined();
  });
});
