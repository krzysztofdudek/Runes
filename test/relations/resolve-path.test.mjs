// Moved from Yggdrasil source/cli/tests/unit/relations/resolve-path.test.ts (vitest) to node:test; the assertions are unchanged.
import { describe, it, expect, beforeEach, afterEach } from '../helpers/expect.mjs';
import path from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { makeResolvePathToFile } from '@chrisdudek/runes/relations';
describe('makeResolvePathToFile', ()=>{
    let root;
    beforeEach(()=>{
        root = mkdtempSync(path.join(tmpdir(), 'resolve-path-'));
        mkdirSync(path.join(root, 'src', 'b'), {
            recursive: true
        });
        writeFileSync(path.join(root, 'src', 'b', 'bar.ts'), 'export const bar = 1;\n', 'utf-8');
    });
    afterEach(()=>{
        rmSync(root, {
            recursive: true,
            force: true
        });
    });
    it('resolves a relative TypeScript import against a file on disk', ()=>{
        const resolve = makeResolvePathToFile(root);
        expect(resolve('../b/bar.js', 'src/a/foo.ts', 'typescript')).toBe('src/b/bar.ts');
    });
    it('dispatches tsx and javascript through the same TS resolver', ()=>{
        const resolve = makeResolvePathToFile(root);
        expect(resolve('../b/bar.js', 'src/a/foo.tsx', 'tsx')).toBe('src/b/bar.ts');
        expect(resolve('../b/bar.js', 'src/a/foo.js', 'javascript')).toBe('src/b/bar.ts');
    });
    it('returns undefined when the resolved file does not exist on disk', ()=>{
        const resolve = makeResolvePathToFile(root);
        expect(resolve('../b/missing.js', 'src/a/foo.ts', 'typescript')).toBeUndefined();
    });
    it('returns undefined for a bare/external specifier', ()=>{
        const resolve = makeResolvePathToFile(root);
        expect(resolve('zod', 'src/a/foo.ts', 'typescript')).toBeUndefined();
    });
    it('returns undefined for a non-TS language (symbol-resolved or not yet implemented)', ()=>{
        const resolve = makeResolvePathToFile(root);
        expect(resolve('../b/bar.js', 'src/a/foo.py', 'python')).toBeUndefined();
        expect(resolve('../b/bar.js', 'src/a/foo.go', 'go')).toBeUndefined();
        expect(resolve('../b/bar.js', 'src/a/foo.x', '')).toBeUndefined();
    });
});
describe('makeResolvePathToFile — per-language dispatch (disk-backed)', ()=>{
    let root;
    function w(rel, content = '// x\n') {
        const abs = path.join(root, rel);
        mkdirSync(path.dirname(abs), {
            recursive: true
        });
        writeFileSync(abs, content, 'utf-8');
    }
    beforeEach(()=>{
        root = mkdtempSync(path.join(tmpdir(), 'resolve-path-langs-'));
        w('go.mod', '// module manifest\n\nmodule example.com/app\n\ngo 1.21\n');
        w('svc/handler.go', 'package svc\n');
        w('svc/util.go', 'package svc\n');
        w('cmd/main.go', 'package main\n');
        w('cmd/extra.go', 'package main\n');
        w('composer.json', JSON.stringify({
            autoload: {
                'psr-4': {
                    'App\\': 'src/'
                }
            }
        }) + '\n');
        w('src/Payment/Gateway.php', '<?php\n');
        w('app/start.php', '<?php\n');
        w('app/run.php', '<?php\n');
        w('com/foo/Bar.java', 'package com.foo;\n');
        w('com/foo/App.java', 'package com.foo;\n');
        w('com/foo/Baz.java', 'package com.foo;\n');
        w('com/foo/README.md', '# not java\n');
        w('Cargo.toml', '[workspace]\nresolver = "2"\n\n[package]\nname = "my-crate"\nversion = "0.1.0"\n');
        w('src/lib.rs', '// lib\n');
        w('src/orders/mod.rs', '// orders\n');
        w('src/a.rs', '// a\n');
        w('src/b.rs', '// b\n');
        w('crates/core/Cargo.toml', '[package]\nname = "core"\nversion = "0.1.0"\n');
        w('crates/core/src/lib.rs', '// core lib\n');
        w('crates/core/src/x.rs', '// x\n');
        w('crates/core/src/y.rs', '// y\n');
        w('inc/foo.h', '/* h */\n');
        w('csrc/main.c', '#include "../inc/foo.h"\n');
        w('lib/order.rb', '# order\n');
        w('lib/app.rb', "require_relative 'order'\n");
    });
    afterEach(()=>{
        rmSync(root, {
            recursive: true,
            force: true
        });
    });
    it('resolves a Go import through the nearest go.mod module path', ()=>{
        const resolve = makeResolvePathToFile(root);
        expect(resolve('example.com/app/svc', 'cmd/main.go', 'go')).toBe('svc/handler.go');
    });
    it('resolves a Go import from a TOP-LEVEL file (no directory component)', ()=>{
        w('root.go', 'package main\n');
        const resolve = makeResolvePathToFile(root);
        expect(resolve('example.com/app/svc', 'root.go', 'go')).toBe('svc/handler.go');
    });
    it('reads the Go module path once and serves a second file from the cache', ()=>{
        const resolve = makeResolvePathToFile(root);
        expect(resolve('example.com/app/svc', 'cmd/main.go', 'go')).toBe('svc/handler.go');
        expect(resolve('example.com/app/svc', 'cmd/extra.go', 'go')).toBe('svc/handler.go');
    });
    it('resolves a PHP FQN through composer PSR-4, and serves a second file from the cache', ()=>{
        const resolve = makeResolvePathToFile(root);
        expect(resolve('App\\Payment\\Gateway', 'app/start.php', 'php')).toBe('src/Payment/Gateway.php');
        expect(resolve('App\\Payment\\Gateway', 'app/run.php', 'php')).toBe('src/Payment/Gateway.php');
    });
    it('resolves a PHP FQN from a TOP-LEVEL file (no directory component)', ()=>{
        w('root.php', '<?php\n');
        const resolve = makeResolvePathToFile(root);
        expect(resolve('App\\Payment\\Gateway', 'root.php', 'php')).toBe('src/Payment/Gateway.php');
    });
    it('resolves a Java type FQN to its package=dir file', ()=>{
        const resolve = makeResolvePathToFile(root);
        expect(resolve('com.foo.Bar', 'com/foo/App.java', 'java')).toBe('com/foo/Bar.java');
    });
    it('returns undefined for a Java package FQN without isPackage=true (no fall-through)', ()=>{
        const resolve = makeResolvePathToFile(root);
        expect(resolve('com.foo', 'src/Main.java', 'java')).toBeUndefined();
    });
    it('resolves a Java wildcard package import when isPackage=true and all files share one owner', ()=>{
        const ownerOf = (f)=>f.startsWith('com/foo/') && f.endsWith('.java') ? 'foo' : undefined;
        const resolve = makeResolvePathToFile(root, ownerOf);
        expect(resolve('com.foo', 'src/Main.java', 'java', true)).toBe('com/foo/App.java');
    });
    it('silences a Java wildcard package import when files split across two owners', ()=>{
        const ownerOf = (f)=>{
            if (f === 'com/foo/App.java') return 'node-a';
            if (f === 'com/foo/Bar.java') return 'node-b';
            return undefined;
        };
        const resolve = makeResolvePathToFile(root, ownerOf);
        expect(resolve('com.foo', 'src/Main.java', 'java', true)).toBeUndefined();
    });
    it('excluding one file of a split Java wildcard package attributes the import to whichever owner is left', ()=>{
        const ownerOf = (f)=>{
            if (f === 'com/foo/App.java') return 'node-a';
            if (f === 'com/foo/Bar.java') return 'node-b';
            return undefined;
        };
        const isExcluded = (f)=>f === 'com/foo/App.java';
        const resolve = makeResolvePathToFile(root, ownerOf, isExcluded);
        expect(resolve('com.foo', 'src/Main.java', 'java', true)).toBe('com/foo/Bar.java');
    });
    it('excluding the OTHER file of the same split package attributes it to the other owner', ()=>{
        const ownerOf = (f)=>{
            if (f === 'com/foo/App.java') return 'node-a';
            if (f === 'com/foo/Bar.java') return 'node-b';
            return undefined;
        };
        const isExcluded = (f)=>f === 'com/foo/Bar.java';
        const resolve = makeResolvePathToFile(root, ownerOf, isExcluded);
        expect(resolve('com.foo', 'src/Main.java', 'java', true)).toBe('com/foo/App.java');
    });
    it('a Java wildcard package split across THREE owners still silences the import after excluding one member', ()=>{
        const ownerOf = (f)=>{
            if (f === 'com/foo/App.java') return 'node-a';
            if (f === 'com/foo/Bar.java') return 'node-b';
            if (f === 'com/foo/Baz.java') return 'node-c';
            return undefined;
        };
        const isExcluded = (f)=>f === 'com/foo/App.java';
        const resolve = makeResolvePathToFile(root, ownerOf, isExcluded);
        expect(resolve('com.foo', 'src/Main.java', 'java', true)).toBeUndefined();
    });
    it('a Java wildcard package where EVERY file is excluded resolves to no owner', ()=>{
        const ownerOf = (f)=>f.startsWith('com/foo/') && f.endsWith('.java') ? 'foo' : undefined;
        const isExcluded = (f)=>f.startsWith('com/foo/') && f.endsWith('.java');
        const resolve = makeResolvePathToFile(root, ownerOf, isExcluded);
        expect(resolve('com.foo', 'src/Main.java', 'java', true)).toBeUndefined();
    });
    it('picks a NON-EXCLUDED file to represent a single-owner Java package when the lexically-first one is excluded', ()=>{
        const ownerOf = (f)=>f.startsWith('com/foo/') && f.endsWith('.java') ? 'foo' : undefined;
        const isExcluded = (f)=>f === 'com/foo/App.java';
        const resolve = makeResolvePathToFile(root, ownerOf, isExcluded);
        expect(resolve('com.foo', 'src/Main.java', 'java', true)).toBe('com/foo/Bar.java');
    });
    it('a Java wildcard package with NO node owner among its files still resolves to a representative file, not undefined', ()=>{
        const ownerOf = ()=>undefined;
        const resolve = makeResolvePathToFile(root, ownerOf);
        expect(resolve('com.foo', 'src/Main.java', 'java', true)).toBe('com/foo/App.java');
    });
    it('control: a Java wildcard package where EVERY file is excluded still resolves to no owner, even with the no-node-owner fallback', ()=>{
        const ownerOf = ()=>undefined;
        const isExcluded = (f)=>f.startsWith('com/foo/') && f.endsWith('.java');
        const resolve = makeResolvePathToFile(root, ownerOf, isExcluded);
        expect(resolve('com.foo', 'src/Main.java', 'java', true)).toBeUndefined();
    });
    it('resolves a Rust crate path through the nearest Cargo.toml src dir', ()=>{
        const resolve = makeResolvePathToFile(root);
        expect(resolve('crate::orders', 'src/lib.rs', 'rust')).toBe('src/orders/mod.rs');
    });
    it('treats the crate package name (hyphen→underscore) like `crate`', ()=>{
        const resolve = makeResolvePathToFile(root);
        expect(resolve('my_crate::a', 'src/lib.rs', 'rust')).toBe('src/a.rs');
    });
    it('resolves crate-root-relative files from a TOP-LEVEL file (no directory component)', ()=>{
        w('main.rs', 'fn main() {}\n');
        const resolve = makeResolvePathToFile(root);
        expect(resolve('crate::a', 'main.rs', 'rust')).toBe('src/a.rs');
    });
    it('resolves a nested-crate path and serves the crate root from the cache on a second file', ()=>{
        const resolve = makeResolvePathToFile(root);
        expect(resolve('crate::x', 'crates/core/src/lib.rs', 'rust')).toBe('crates/core/src/x.rs');
        expect(resolve('crate::y', 'crates/core/src/y.rs', 'rust')).toBe('crates/core/src/y.rs');
    });
    it('resolves a quoted C/C++ include relative to the including file', ()=>{
        const resolve = makeResolvePathToFile(root);
        expect(resolve('../inc/foo.h', 'csrc/main.c', 'c')).toBe('inc/foo.h');
        expect(resolve('../inc/foo.h', 'csrc/main.cpp', 'cpp')).toBe('inc/foo.h');
    });
    it('resolves a Ruby require_relative relative to the requiring file', ()=>{
        const resolve = makeResolvePathToFile(root);
        expect(resolve('order', 'lib/app.rb', 'ruby')).toBe('lib/order.rb');
    });
});
describe('makeResolvePathToFile — a Cargo.toml [package] section with no `name` line', ()=>{
    it('still resolves the plain `crate::` keyword via srcDir (crateName undefined, no crash)', ()=>{
        const bareRoot = mkdtempSync(path.join(tmpdir(), 'resolve-path-noname-'));
        try {
            mkdirSync(path.join(bareRoot, 'src'), {
                recursive: true
            });
            writeFileSync(path.join(bareRoot, 'Cargo.toml'), '[package]\nversion = "0.1.0"\n', 'utf-8');
            writeFileSync(path.join(bareRoot, 'src', 'lib.rs'), '// lib\n', 'utf-8');
            writeFileSync(path.join(bareRoot, 'src', 'a.rs'), '// a\n', 'utf-8');
            const resolve = makeResolvePathToFile(bareRoot);
            expect(resolve('crate::a', 'src/lib.rs', 'rust')).toBe('src/a.rs');
        } finally{
            rmSync(bareRoot, {
                recursive: true,
                force: true
            });
        }
    });
});
describe('makeResolvePathToFile — a go.mod with no `module` directive (malformed manifest)', ()=>{
    it('resolves to undefined rather than crashing when the nearest go.mod has no module line', ()=>{
        const bareRoot = mkdtempSync(path.join(tmpdir(), 'resolve-path-badmod-'));
        try {
            mkdirSync(path.join(bareRoot, 'vendor'), {
                recursive: true
            });
            writeFileSync(path.join(bareRoot, 'vendor', 'go.mod'), 'go 1.21\n', 'utf-8');
            writeFileSync(path.join(bareRoot, 'vendor', 'lib.go'), 'package lib\n', 'utf-8');
            const resolve = makeResolvePathToFile(bareRoot);
            expect(resolve('example.com/anything', 'vendor/lib.go', 'go')).toBeUndefined();
        } finally{
            rmSync(bareRoot, {
                recursive: true,
                force: true
            });
        }
    });
});
describe('makeResolvePathToFile — absent manifests resolve to undefined', ()=>{
    let root;
    beforeEach(()=>{
        root = mkdtempSync(path.join(tmpdir(), 'resolve-path-bare-'));
        mkdirSync(path.join(root, 'svc'), {
            recursive: true
        });
        mkdirSync(path.join(root, 'app'), {
            recursive: true
        });
        mkdirSync(path.join(root, 'src'), {
            recursive: true
        });
        writeFileSync(path.join(root, 'svc', 'handler.go'), 'package svc\n', 'utf-8');
        writeFileSync(path.join(root, 'app', 'start.php'), '<?php\n', 'utf-8');
        writeFileSync(path.join(root, 'src', 'lib.rs'), '// lib\n', 'utf-8');
    });
    afterEach(()=>{
        rmSync(root, {
            recursive: true,
            force: true
        });
    });
    it('Go import with no go.mod ancestor → undefined', ()=>{
        const resolve = makeResolvePathToFile(root);
        expect(resolve('example.com/app/svc', 'svc/handler.go', 'go')).toBeUndefined();
    });
    it('PHP FQN with no composer.json ancestor → undefined', ()=>{
        const resolve = makeResolvePathToFile(root);
        expect(resolve('App\\Payment\\Gateway', 'app/start.php', 'php')).toBeUndefined();
    });
    it('Rust path with no Cargo.toml ancestor → undefined', ()=>{
        const resolve = makeResolvePathToFile(root);
        expect(resolve('crate::orders', 'src/lib.rs', 'rust')).toBeUndefined();
    });
});
describe('makeResolvePathToFile — Python project roots discovered from manifests', ()=>{
    let root;
    const write = (rel, body = '')=>{
        mkdirSync(path.dirname(path.join(root, rel)), {
            recursive: true
        });
        writeFileSync(path.join(root, rel), body, 'utf-8');
    };
    beforeEach(()=>{
        root = mkdtempSync(path.join(tmpdir(), 'resolve-path-py-'));
    });
    afterEach(()=>{
        rmSync(root, {
            recursive: true,
            force: true
        });
    });
    it('a pyproject.toml makes its src/ child a root (src layout, tests outside src)', ()=>{
        write('pyproject.toml', '[project]\nname = "shop"\n');
        write('src/core/service.py');
        write('tests/test_service.py');
        expect(makeResolvePathToFile(root)('core.service', 'tests/test_service.py', 'python')).toBe('src/core/service.py');
    });
    it('a workspace member without src/ is its own (flat-layout) root', ()=>{
        write('packages/lib/setup.cfg', '[metadata]\nname = lib\n');
        write('packages/lib/lib/__init__.py');
        write('packages/lib/lib/util.py');
        write('packages/api/pyproject.toml', '[project]\nname = "api"\n');
        write('packages/api/src/api/main.py');
        expect(makeResolvePathToFile(root)('lib.util', 'packages/api/src/api/main.py', 'python')).toBe('packages/lib/lib/util.py');
    });
    it('skips virtual environments, hidden directories and dependency trees', ()=>{
        write('.venv/pyvenv.cfg', 'home = /usr/bin\n');
        write('.venv/lib/site-packages/vendored/pyproject.toml');
        write('.venv/lib/site-packages/vendored/src/vendored/x.py');
        write('env/pyvenv.cfg', 'home = /usr/bin\n');
        write('env/pkg/pyproject.toml');
        write('env/pkg/src/envpkg/x.py');
        write('node_modules/pyish/pyproject.toml');
        write('node_modules/pyish/src/pyish/x.py');
        write('app/main.py');
        const resolve = makeResolvePathToFile(root);
        expect(resolve('vendored.x', 'app/main.py', 'python')).toBeUndefined();
        expect(resolve('envpkg.x', 'app/main.py', 'python')).toBeUndefined();
        expect(resolve('pyish.x', 'app/main.py', 'python')).toBeUndefined();
    });
    it('an excluded manifest contributes no root', ()=>{
        write('packages/lib/pyproject.toml');
        write('packages/lib/src/lib/util.py');
        write('packages/api/src/api/main.py');
        const isExcluded = (p)=>p.startsWith('packages/lib/');
        expect(makeResolvePathToFile(root, undefined, isExcluded)('lib.util', 'packages/api/src/api/main.py', 'python')).toBeUndefined();
        expect(makeResolvePathToFile(root)('lib.util', 'packages/api/src/api/main.py', 'python')).toBe('packages/lib/src/lib/util.py');
    });
});
