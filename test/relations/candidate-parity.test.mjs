// Moved from Yggdrasil source/cli/tests/unit/relations/candidate-parity.test.ts (vitest) to node:test; the assertions are unchanged.
import { describe, it, expect } from '../helpers/expect.mjs';
import { runExtractor } from '../helpers/tree-sitter.mjs';
import { makeResolver } from '@chrisdudek/runes/relations';
import { SymbolTable } from '@chrisdudek/runes/relations';
import { typescriptExtractor } from '@chrisdudek/runes/relations';
import { pythonExtractor } from '@chrisdudek/runes/relations';
import { goExtractor } from '@chrisdudek/runes/relations';
import { javaExtractor } from '@chrisdudek/runes/relations';
import { phpExtractor } from '@chrisdudek/runes/relations';
import { rustExtractor } from '@chrisdudek/runes/relations';
import { cExtractor } from '@chrisdudek/runes/relations';
import { cppExtractor } from '@chrisdudek/runes/relations';
function stubPathResolver(table) {
    return (specifier)=>table.get(specifier);
}
function ownerIndexOf(map) {
    return {
        ownerOf: (f)=>map[f],
        ownerEntryOf: (f)=>map[f] === undefined ? undefined : {
                nodePath: map[f],
                mapping: f,
                kind: 'exact'
            }
    };
}
function referenceEdges(extractor, uses, resolver, fromFile, language) {
    const out = [];
    for (const dep of uses){
        const r = resolver.resolve(dep.candidates[0], fromFile, language);
        if (r) out.push({
            fromFile,
            line: dep.line,
            owner: r.owner
        });
    }
    return out;
}
function walkEdges(uses, resolver, fromFile, language) {
    const out = [];
    for (const dep of uses){
        for (const cand of dep.candidates){
            const outcome = resolver.classify(cand, fromFile, language);
            if (outcome.kind === 'resolved') {
                out.push({
                    fromFile,
                    line: dep.line,
                    owner: outcome.owner
                });
                break;
            }
            if (outcome.kind === 'ambiguous') break;
        }
    }
    return out;
}
const PATH_CASES = [
    {
        language: 'typescript',
        ext: '.ts',
        extractor: typescriptExtractor,
        fromFile: 'src/a/use.ts',
        source: `import { svc } from './svc';\nimport * as u from '../util/u';\nimport bare from 'node:path';\n`,
        pathTable: new Map([
            [
                './svc',
                'src/a/svc.ts'
            ],
            [
                '../util/u',
                'src/util/u.ts'
            ]
        ]),
        ownerMap: {
            'src/a/svc.ts': 'a',
            'src/util/u.ts': 'util'
        }
    },
    {
        language: 'python',
        ext: '.py',
        extractor: pythonExtractor,
        fromFile: 'src/a/use.py',
        source: `import foo.bar\nfrom pkg import sub\nimport os\n`,
        pathTable: new Map([
            [
                'foo.bar',
                'src/foo/bar.py'
            ],
            [
                'pkg',
                'src/pkg/__init__.py'
            ]
        ]),
        ownerMap: {
            'src/foo/bar.py': 'foo',
            'src/pkg/__init__.py': 'pkg'
        }
    },
    {
        language: 'go',
        ext: '.go',
        extractor: goExtractor,
        fromFile: 'src/a/use.go',
        source: `package a\nimport (\n  "example.com/mod/foo"\n  "fmt"\n)\n`,
        pathTable: new Map([
            [
                'example.com/mod/foo',
                'src/foo/foo.go'
            ]
        ]),
        ownerMap: {
            'src/foo/foo.go': 'foo'
        }
    },
    {
        language: 'java',
        ext: '.java',
        extractor: javaExtractor,
        fromFile: 'src/a/Use.java',
        source: `import com.acme.foo.Bar;\nimport com.acme.pkg.*;\nimport java.util.List;\nclass Use {}\n`,
        pathTable: new Map([
            [
                'com.acme.foo.Bar',
                'src/foo/Bar.java'
            ],
            [
                'com.acme.pkg',
                'src/pkg/Anything.java'
            ]
        ]),
        ownerMap: {
            'src/foo/Bar.java': 'foo',
            'src/pkg/Anything.java': 'pkg'
        }
    },
    {
        language: 'php',
        ext: '.php',
        extractor: phpExtractor,
        fromFile: 'src/a/Use.php',
        source: `<?php\nuse App\\Foo\\Bar;\nuse Vendor\\External\\Thing;\nclass Use_ {}\n`,
        pathTable: new Map([
            [
                'App\\Foo\\Bar',
                'src/Foo/Bar.php'
            ]
        ]),
        ownerMap: {
            'src/Foo/Bar.php': 'foo'
        }
    },
    {
        language: 'rust',
        ext: '.rs',
        extractor: rustExtractor,
        fromFile: 'src/a/use.rs',
        source: `use crate::foo::Bar;\nuse std::collections::HashMap;\n`,
        pathTable: new Map([
            [
                'crate::foo::Bar',
                'src/foo/bar.rs'
            ]
        ]),
        ownerMap: {
            'src/foo/bar.rs': 'foo'
        }
    },
    {
        language: 'c',
        ext: '.c',
        extractor: cExtractor,
        fromFile: 'src/a/main.c',
        source: `#include "../foo/foo.h"\n#include <stdio.h>\n`,
        pathTable: new Map([
            [
                '../foo/foo.h',
                'src/foo/foo.h'
            ]
        ]),
        ownerMap: {
            'src/foo/foo.h': 'foo'
        }
    },
    {
        language: 'cpp',
        ext: '.cpp',
        extractor: cppExtractor,
        fromFile: 'src/a/main.cpp',
        source: `#include "../foo/Foo.hpp"\n#include <vector>\n`,
        pathTable: new Map([
            [
                '../foo/Foo.hpp',
                'src/foo/Foo.hpp'
            ]
        ]),
        ownerMap: {
            'src/foo/Foo.hpp': 'foo'
        }
    }
];
describe('candidate-group parity — one-element wrap is byte-identical to the pre-change per-dep path', ()=>{
    for (const c of PATH_CASES){
        it(`${c.language}: every group is one-element and the ordered walk equals resolve(candidates[0])`, async ()=>{
            const { uses } = await runExtractor(c.extractor, c.language, c.ext, c.source);
            expect(uses.length).toBeGreaterThan(0);
            for (const dep of uses){
                expect(dep.candidates).toHaveLength(1);
            }
            const resolver = makeResolver({
                ownerIndex: ownerIndexOf(c.ownerMap),
                symbolTable: new SymbolTable(),
                resolvePathToFile: stubPathResolver(c.pathTable)
            });
            const reference = referenceEdges(c.extractor, uses, resolver, c.fromFile, c.language);
            const walked = walkEdges(uses, resolver, c.fromFile, c.language);
            expect(walked).toEqual(reference);
            expect(walked.length).toBeGreaterThan(0);
        });
    }
});
