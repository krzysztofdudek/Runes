// Moved from Yggdrasil source/cli/tests/unit/relations/extractors/python-resolve.test.ts (vitest) to node:test; the assertions are unchanged.
import { describe, it, expect } from '../../helpers/expect.mjs';
import { resolvePythonModule } from '@chrisdudek/runes/relations';
const known = new Set([
    'src/a/b.py',
    'src/a/__init__.py',
    'src/a/pkg/mod.py',
    'src/a/sib.py',
    'src/pkg/__init__.py',
    'top.py'
]);
const exists = (p)=>known.has(p);
describe('resolvePythonModule — absolute', ()=>{
    it('resolves a module file via an ancestor source root', ()=>{
        expect(resolvePythonModule('a.b', 'src/a/c.py', exists)).toBe('src/a/b.py');
    });
    it('resolves a package to its __init__.py', ()=>{
        expect(resolvePythonModule('pkg', 'src/a/c.py', exists)).toBe('src/pkg/__init__.py');
    });
    it('resolves `from a import b` (last segment is a submodule file)', ()=>{
        expect(resolvePythonModule('a.b', 'src/x.py', exists)).toBe('src/a/b.py');
    });
    it('longest-match: `a.b.thing` falls back to the parent module a.b', ()=>{
        expect(resolvePythonModule('a.b.thing', 'src/a/c.py', exists)).toBe('src/a/b.py');
    });
    it('resolves a top-level module at the repo root', ()=>{
        expect(resolvePythonModule('top', 'src/a/c.py', exists)).toBe('top.py');
    });
    it('returns undefined for a stdlib/third-party module (no mapped file)', ()=>{
        expect(resolvePythonModule('os', 'src/a/c.py', exists)).toBeUndefined();
        expect(resolvePythonModule('requests', 'src/a/c.py', exists)).toBeUndefined();
    });
    it('returns undefined for a non-existent module (no file, no resolvable parent)', ()=>{
        expect(resolvePythonModule('nope.deep', 'src/a/c.py', exists)).toBeUndefined();
    });
    it('returns undefined for an empty specifier (no module segments)', ()=>{
        expect(resolvePythonModule('', 'src/a/c.py', exists)).toBeUndefined();
    });
    it('resolves a top-level module when the importing file sits at the repo root', ()=>{
        const rootKnown = new Set([
            'top.py'
        ]);
        expect(resolvePythonModule('top', 'main.py', (p)=>rootKnown.has(p))).toBe('top.py');
    });
    it('longest-match: `a.nope` falls back to package `a` __init__ (nope may be a symbol there)', ()=>{
        expect(resolvePythonModule('a.nope', 'src/a/c.py', exists)).toBe('src/a/__init__.py');
    });
    it('returns undefined when the own dir shadows a genuine root (2+ distinct files)', ()=>{
        const shadow = new Set([
            'src/a/b.py',
            'src/b/bar.py'
        ]);
        expect(resolvePythonModule('b.bar', 'src/a/b.py', (p)=>shadow.has(p))).toBeUndefined();
    });
    it('returns undefined when an intermediate dir shadows a genuine root', ()=>{
        const shadow = new Set([
            'src/pkg/pkg/mod.py',
            'src/pkg/mod.py'
        ]);
        expect(resolvePythonModule('pkg.mod', 'src/pkg/a/c.py', (p)=>shadow.has(p))).toBeUndefined();
    });
    it('still resolves a single-root cross-node import (no shadowing file present)', ()=>{
        const clean = new Set([
            'src/b/bar.py'
        ]);
        expect(resolvePythonModule('b.bar', 'src/a/foo.py', (p)=>clean.has(p))).toBe('src/b/bar.py');
    });
    describe('exclusion awareness', ()=>{
        const shadow = new Set([
            'src/a/b.py',
            'src/b/bar.py'
        ]);
        const shadowExists = (p)=>shadow.has(p);
        it('control: with nothing excluded, two distinct roots stay ambiguous — silent', ()=>{
            expect(resolvePythonModule('b.bar', 'src/a/b.py', shadowExists)).toBeUndefined();
        });
        it('excluding the match that sorts FIRST resolves to the survivor', ()=>{
            const isExcluded = (p)=>p === 'src/a/b.py';
            expect(resolvePythonModule('b.bar', 'src/a/b.py', shadowExists, isExcluded)).toBe('src/b/bar.py');
        });
        it('excluding the match that sorts LAST resolves to the survivor', ()=>{
            const isExcluded = (p)=>p === 'src/b/bar.py';
            expect(resolvePythonModule('b.bar', 'src/a/b.py', shadowExists, isExcluded)).toBe('src/a/b.py');
        });
        it('excluding an UNRELATED path elsewhere leaves a genuinely ambiguous resolution silent', ()=>{
            const isExcluded = (p)=>p === 'somewhere/else/entirely.py';
            expect(resolvePythonModule('b.bar', 'src/a/b.py', shadowExists, isExcluded)).toBeUndefined();
        });
    });
    describe('same-root module/package shadow', ()=>{
        const shadow = new Set([
            'mod.py',
            'mod/__init__.py'
        ]);
        const shadowExists = (p)=>shadow.has(p);
        it('control: with nothing excluded, the package candidate wins over the module-as-file — matches CPython', ()=>{
            expect(resolvePythonModule('mod', 'x.py', shadowExists)).toBe('mod/__init__.py');
        });
        it('excluding the package falls through to the live module-as-file at the same root', ()=>{
            const isExcluded = (p)=>p === 'mod/__init__.py';
            expect(resolvePythonModule('mod', 'x.py', shadowExists, isExcluded)).toBe('mod.py');
        });
        it('excluding the module-as-file leaves the package resolution unaffected', ()=>{
            const isExcluded = (p)=>p === 'mod.py';
            expect(resolvePythonModule('mod', 'x.py', shadowExists, isExcluded)).toBe('mod/__init__.py');
        });
        it('excluding both leaves the module unresolved', ()=>{
            const isExcluded = ()=>true;
            expect(resolvePythonModule('mod', 'x.py', shadowExists, isExcluded)).toBeUndefined();
        });
    });
    describe('module-only and package-only shapes are unaffected by the package-first order', ()=>{
        it('a module file with no same-named package still resolves', ()=>{
            const soloModule = new Set([
                'solo.py'
            ]);
            expect(resolvePythonModule('solo', 'x.py', (p)=>soloModule.has(p))).toBe('solo.py');
        });
        it('a package with no same-named module file still resolves via __init__.py', ()=>{
            const soloPackage = new Set([
                'solo/__init__.py'
            ]);
            expect(resolvePythonModule('solo', 'x.py', (p)=>soloPackage.has(p))).toBe('solo/__init__.py');
        });
    });
});
describe('resolvePythonModule — relative', ()=>{
    it('resolves `..pkg.mod` from src/a/b/c.py to src/a/pkg/mod.py', ()=>{
        expect(resolvePythonModule('..pkg.mod', 'src/a/b/c.py', exists)).toBe('src/a/pkg/mod.py');
    });
    it('resolves `.sib` (one dot, same package) from src/a/x.py to src/a/sib.py', ()=>{
        expect(resolvePythonModule('.sib', 'src/a/x.py', exists)).toBe('src/a/sib.py');
    });
    it('resolves a bare `.` to the importing package __init__', ()=>{
        expect(resolvePythonModule('.', 'src/a/x.py', exists)).toBe('src/a/__init__.py');
    });
    it('returns undefined when the relative climb escapes the repo', ()=>{
        expect(resolvePythonModule('....deep', 'src/a/x.py', exists)).toBeUndefined();
    });
    it('returns undefined when the relative target does not exist', ()=>{
        expect(resolvePythonModule('.missing', 'src/a/x.py', exists)).toBeUndefined();
    });
    describe('same-root module/package shadow, exclusion-aware', ()=>{
        const shadow = new Set([
            'src/a/mod.py',
            'src/a/mod/__init__.py'
        ]);
        const shadowExists = (p)=>shadow.has(p);
        it('control: with nothing excluded, the package candidate wins over the module-as-file — matches CPython', ()=>{
            expect(resolvePythonModule('.mod', 'src/a/x.py', shadowExists)).toBe('src/a/mod/__init__.py');
        });
        it('excluding the package falls through to the live module-as-file at the same root', ()=>{
            const isExcluded = (p)=>p === 'src/a/mod/__init__.py';
            expect(resolvePythonModule('.mod', 'src/a/x.py', shadowExists, isExcluded)).toBe('src/a/mod.py');
        });
        it('excluding the module-as-file leaves the package resolution unaffected', ()=>{
            const isExcluded = (p)=>p === 'src/a/mod.py';
            expect(resolvePythonModule('.mod', 'src/a/x.py', shadowExists, isExcluded)).toBe('src/a/mod/__init__.py');
        });
    });
});
describe('resolvePythonModule — sys.path-like roots', ()=>{
    it('an ancestor package never roots an absolute import (stdlib name shadowed by app/logging.py)', ()=>{
        const files = new Set([
            'app/__init__.py',
            'app/logging.py',
            'app/api/__init__.py',
            'app/api/routes.py'
        ]);
        expect(resolvePythonModule('logging', 'app/api/routes.py', (p)=>files.has(p))).toBeUndefined();
    });
    it('a namespace sub-directory of a regular package is not a root either', ()=>{
        const files = new Set([
            'app/__init__.py',
            'app/api/logging.py',
            'app/api/routes.py'
        ]);
        expect(resolvePythonModule('logging', 'app/api/routes.py', (p)=>files.has(p))).toBeUndefined();
    });
    it('the directory above the top-level package still roots the package itself', ()=>{
        const files = new Set([
            'app/__init__.py',
            'app/logging.py',
            'app/api/__init__.py',
            'app/api/routes.py'
        ]);
        expect(resolvePythonModule('app.logging', 'app/api/routes.py', (p)=>files.has(p))).toBe('app/logging.py');
    });
    it('a discovered project root resolves a module that no ancestor roots', ()=>{
        const files = new Set([
            'src/core/service.py',
            'tests/test_service.py'
        ]);
        const roots = ()=>[
                'src'
            ];
        expect(resolvePythonModule('core.service', 'tests/test_service.py', (p)=>files.has(p), undefined, roots)).toBe('src/core/service.py');
        expect(resolvePythonModule('core.service', 'tests/test_service.py', (p)=>files.has(p))).toBeUndefined();
    });
    it('a discovered root never matches a standard-library top-level name', ()=>{
        const files = new Set([
            'packages/tools/logging.py',
            'packages/tools/json/__init__.py'
        ]);
        const roots = ()=>[
                'packages/tools'
            ];
        const exists = (p)=>files.has(p);
        expect(resolvePythonModule('logging', 'packages/api/src/api/main.py', exists, undefined, roots)).toBeUndefined();
        expect(resolvePythonModule('json.decoder', 'packages/api/src/api/main.py', exists, undefined, roots)).toBeUndefined();
    });
    it('a module found under two discovered roots stays silent (distinct-match rule)', ()=>{
        const files = new Set([
            'packages/a/src/util.py',
            'packages/b/src/util.py'
        ]);
        const roots = ()=>[
                'packages/a/src',
                'packages/b/src'
            ];
        expect(resolvePythonModule('util', 'apps/web/main.py', (p)=>files.has(p), undefined, roots)).toBeUndefined();
    });
    it('a discovered root inside a regular package is ignored', ()=>{
        const files = new Set([
            'pkg/__init__.py',
            'pkg/sub/mod.py'
        ]);
        const roots = ()=>[
                'pkg/sub'
            ];
        expect(resolvePythonModule('mod', 'apps/web/main.py', (p)=>files.has(p), undefined, roots)).toBeUndefined();
    });
});
