// Moved from Yggdrasil source/cli/tests/unit/relations/extractors/ruby.test.ts (vitest) to node:test; the assertions are unchanged.
import { describe, it, expect } from '../../helpers/expect.mjs';
import { runExtractor } from '../../helpers/tree-sitter.mjs';
import { rubyExtractor } from '@chrisdudek/runes/relations';
import { SymbolTable } from '@chrisdudek/runes/relations';
import { makeResolver } from '@chrisdudek/runes/relations';
import { withParsedFiles } from '../../helpers/tree-sitter.mjs';
const run = (code)=>runExtractor(rubyExtractor, 'ruby', '.rb', code);
const symbolKeys = (uses)=>uses.flatMap((u)=>u.candidates[0].kind === 'symbol' ? [
            u.candidates[0].symbolKey
        ] : []);
const fallbackKeys = (uses)=>uses.flatMap((u)=>{
        const last = u.candidates[u.candidates.length - 1];
        return last.kind === 'symbol' ? [
            last.symbolKey
        ] : [];
    });
const groups = (uses)=>uses.map((u)=>u.candidates.flatMap((c)=>c.kind === 'symbol' ? [
                c.symbolKey
            ] : []));
const pathSpecs = (uses)=>uses.flatMap((u)=>u.candidates[0].kind === 'path' ? [
            u.candidates[0].specifier
        ] : []);
const rb = (path, code)=>({
        path,
        code,
        language: 'ruby'
    });
describe('ruby extractor — uses() emits PATH hints (require_relative)', ()=>{
    it('emits a path hint with the literal string for require_relative', async ()=>{
        const { uses } = await run("require_relative '../services/order_service'\n");
        expect(uses).toContainEqual(expect.objectContaining({
            candidates: [
                {
                    kind: 'path',
                    specifier: '../services/order_service'
                }
            ],
            kind: 'import'
        }));
    });
    it('carries a 1-based line number for the require_relative hint', async ()=>{
        const { uses } = await run("\n\nrequire_relative './helper'\n");
        const hint = uses.find((u)=>u.candidates[0].kind === 'path');
        expect(hint?.line).toBe(3);
    });
    it('SKIPS a plain `require` of a gem (only require_relative is a path link)', async ()=>{
        const { uses } = await run("require 'json'\nrequire 'order/processor'\n");
        expect(pathSpecs(uses)).toHaveLength(0);
    });
    it('SKIPS require_relative with an interpolated / dynamic argument', async ()=>{
        const { uses } = await run('require_relative "../#{name}"\nrequire_relative File.join("a", "b")\n');
        expect(pathSpecs(uses)).toHaveLength(0);
    });
    it('SKIPS require_relative of an EMPTY string `\'\'` (no string_content → no literal)', async ()=>{
        const { uses } = await run("require_relative ''\n");
        expect(pathSpecs(uses)).toHaveLength(0);
    });
    it('SKIPS a bare `require_relative` with NO argument (args field is null)', async ()=>{
        const { uses } = await run('require_relative\n');
        expect(pathSpecs(uses)).toHaveLength(0);
        expect(uses).toHaveLength(0);
    });
    it('DEDUPES two identical require_relative on the SAME line (path symbol+line key)', async ()=>{
        const { uses } = await run("require_relative 'a'; require_relative 'a'\n");
        expect(pathSpecs(uses).filter((s)=>s === 'a')).toHaveLength(1);
    });
});
describe('ruby extractor — uses() emits SYMBOL hints (constants)', ()=>{
    it('emits the superclass constant for `class C < Base`', async ()=>{
        const { uses } = await run('class OrderService < BaseService\nend\n');
        expect(symbolKeys(uses)).toContain('BaseService');
        expect(symbolKeys(uses)).not.toContain('OrderService');
    });
    it('emits a scope_resolution superclass key, stripping a leading `::`', async ()=>{
        const { uses } = await run('class A < Reporting::Base\nend\nclass B < ::Top::Base\nend\n');
        const keys = symbolKeys(uses);
        expect(keys).toContain('Reporting::Base');
        expect(keys).toContain('Top::Base');
        expect(keys.every((k)=>!k.startsWith('::'))).toBe(true);
    });
    it('emits a symbol per `include` / `extend` / `prepend` module argument', async ()=>{
        const { uses } = await run([
            'class C',
            '  include Loggable',
            '  extend Forwardable',
            '  prepend Tracing::Hook',
            'end',
            ''
        ].join('\n'));
        const keys = fallbackKeys(uses);
        expect(keys).toContain('Loggable');
        expect(keys).toContain('Forwardable');
        expect(keys).toContain('Tracing::Hook');
    });
    it('emits both constants for `include A, B` (multiple modules per call)', async ()=>{
        const { uses } = await run('class C\n  include A, B\nend\n');
        const keys = fallbackKeys(uses);
        expect(keys).toContain('A');
        expect(keys).toContain('B');
    });
    it('emits a scope_resolution used as a value (`Foo::Bar`)', async ()=>{
        const { uses } = await run('x = Payments::Gateway\n');
        expect(symbolKeys(uses)).toContain('Payments::Gateway');
    });
    it('emits a bare constant used as a value (`x = Helper`)', async ()=>{
        const { uses } = await run('x = Helper\n');
        expect(symbolKeys(uses)).toContain('Helper');
    });
    it('emits the receiver constant of a qualified call (`Payments::Gateway.charge`)', async ()=>{
        const { uses } = await run('Payments::Gateway.charge(amount)\n');
        expect(symbolKeys(uses)).toContain('Payments::Gateway');
    });
    it('does NOT emit a symbol for a local-receiver call (`helper.run`, `@repo.save`)', async ()=>{
        const { uses } = await run('helper.run\n@repo.save(x)\nfoo.bar.baz\n');
        expect(symbolKeys(uses)).toHaveLength(0);
    });
    it('does NOT double-count the inner constants of a scope_resolution', async ()=>{
        const { uses } = await run('x = A::B::C\n');
        const keys = symbolKeys(uses);
        expect(keys).toContain('A::B::C');
        expect(keys).not.toContain('A');
        expect(keys).not.toContain('A::B');
        expect(keys.filter((k)=>k === 'A::B::C')).toHaveLength(1);
    });
    it('a `class C` with NO superclass emits NO use (only its own definition)', async ()=>{
        const { uses } = await run('class Foo\nend\n');
        expect(symbolKeys(uses)).toHaveLength(0);
        expect(uses).toHaveLength(0);
    });
    it('emits NO use for a DYNAMIC superclass expression (e.g. `Struct.new(:x)`) — not a constant name', async ()=>{
        const { uses } = await run('class C < Struct.new(:x)\nend\n');
        expect(symbolKeys(uses)).toHaveLength(0);
        expect(uses).toHaveLength(0);
    });
    it('DEDUPES the same constant referenced twice on ONE line (symbol+line key)', async ()=>{
        const { uses } = await run('x = Helper; y = Helper\n');
        const helpers = symbolKeys(uses).filter((k)=>k === 'Helper');
        expect(helpers).toHaveLength(1);
    });
    it('SKIPS an `include` whose argument is a method call (non-constant → constantKey undefined)', async ()=>{
        const { uses } = await run('class C\n  include some_method\nend\n');
        expect(symbolKeys(uses)).toHaveLength(0);
    });
    it('SKIPS an `include` whose argument is a string literal (non-constant)', async ()=>{
        const { uses } = await run('class C\n  include "str"\nend\n');
        expect(symbolKeys(uses)).toHaveLength(0);
    });
    it('does NOT emit the `name` field constant of a module declaration as a use', async ()=>{
        const { uses, declarations } = await run('module App\nend\n');
        expect(symbolKeys(uses)).not.toContain('App');
        expect(symbolKeys(uses)).toHaveLength(0);
        expect(declarations.map((d)=>d.symbolKey)).toContain('App');
    });
    it('does NOT emit the scoped `name` of a `class A::B` declaration as a use', async ()=>{
        const { uses, declarations } = await run('class A::B\nend\n');
        expect(symbolKeys(uses)).toHaveLength(0);
        expect(declarations.map((d)=>d.symbolKey)).toContain('A::B');
    });
});
describe('ruby extractor — declarations() build FQNs from nesting', ()=>{
    it('builds App::Services::OrderService from module nesting', async ()=>{
        const { declarations } = await run([
            'module App',
            '  module Services',
            '    class OrderService',
            '    end',
            '  end',
            'end',
            ''
        ].join('\n'));
        const keys = declarations.map((d)=>d.symbolKey);
        expect(keys).toContain('App');
        expect(keys).toContain('App::Services');
        expect(keys).toContain('App::Services::OrderService');
    });
    it('records a top-level constant assignment as a definition', async ()=>{
        const { declarations } = await run('MAX = 5\nMyAlias = OriginalClass\n');
        const keys = declarations.map((d)=>d.symbolKey);
        expect(keys).toContain('MAX');
        expect(keys).toContain('MyAlias');
    });
    it('qualifies a constant assignment NESTED in a module into a FQN (M::X)', async ()=>{
        const { declarations } = await run('module M\n  X = 1\nend\n');
        const keys = declarations.map((d)=>d.symbolKey);
        expect(keys).toContain('M');
        expect(keys).toContain('M::X');
    });
    it('does NOT record a SCOPED constant assignment (`Foo::BAR = 1`) as a definition', async ()=>{
        const { declarations } = await run('Foo::BAR = 1\n');
        const keys = declarations.map((d)=>d.symbolKey);
        expect(keys).not.toContain('Foo::BAR');
        expect(keys).toHaveLength(0);
    });
    it('carries 1-based line numbers', async ()=>{
        const { declarations } = await run('\nclass Foo\nend\n');
        expect(declarations.find((d)=>d.symbolKey === 'Foo')?.line).toBe(2);
    });
    it('a REOPENED class produces TWO definitions of the same FQN (no dedupe)', async ()=>{
        const { declarations } = await run('class Foo\nend\nclass Foo\nend\n');
        const fooDefs = declarations.filter((d)=>d.symbolKey === 'Foo');
        expect(fooDefs).toHaveLength(2);
        expect(new Set(fooDefs.map((d)=>d.line)).size).toBe(2);
    });
});
describe('ruby SYMBOL-TABLE resolution — unique resolves, reopened silences', ()=>{
    it('a UNIQUE constant resolves through the table to its defining file', async ()=>{
        await withParsedFiles([
            rb('src/a/base_service.rb', 'class BaseService\nend\n'),
            rb('src/b/order_service.rb', 'class OrderService < BaseService\nend\n')
        ], ([fileA, consumer])=>{
            const st = new SymbolTable();
            for (const d of rubyExtractor.declarations(fileA))st.declare('ruby', d.symbolKey, fileA.path);
            expect(st.resolveUnique('ruby', 'BaseService')).toBe('src/a/base_service.rb');
            const importHint = rubyExtractor.uses(consumer).find((u)=>u.candidates[0].kind === 'symbol');
            expect(importHint.candidates[0]).toEqual({
                kind: 'symbol',
                symbolKey: 'BaseService'
            });
            const ownerIndex = {
                ownerOf: (f)=>f === 'src/a/base_service.rb' ? 'a' : undefined
            };
            const resolver = makeResolver({
                ownerIndex: ownerIndex,
                symbolTable: st,
                resolvePathToFile: ()=>undefined
            });
            expect(resolver.resolve(importHint.candidates[0], consumer.path, 'ruby')).toEqual({
                owner: 'a',
                resolvedFile: 'src/a/base_service.rb'
            });
        });
    });
    it('a REOPENED (ambiguous) constant silences — resolveUnique undefined, no flag', async ()=>{
        await withParsedFiles([
            rb('src/x/widget.rb', 'class Widget\nend\n'),
            rb('src/y/widget.rb', 'class Widget\nend\n'),
            rb('src/z/use.rb', 'x = Widget\n')
        ], ([fileX, fileY, consumer])=>{
            const st = new SymbolTable();
            for (const f of [
                fileX,
                fileY
            ]){
                for (const d of rubyExtractor.declarations(f))st.declare('ruby', d.symbolKey, f.path);
            }
            expect(st.resolveUnique('ruby', 'Widget')).toBeUndefined();
            const ownerIndex = {
                ownerOf: (f)=>f.split('/')[1]
            };
            const resolver = makeResolver({
                ownerIndex: ownerIndex,
                symbolTable: st,
                resolvePathToFile: ()=>undefined
            });
            const hint = rubyExtractor.uses(consumer).find((u)=>u.candidates[0].kind === 'symbol');
            expect(resolver.resolve(hint.candidates[0], consumer.path, 'ruby')).toBeUndefined();
        });
    });
});
describe('ruby extractor — registry wiring', ()=>{
    it('declares the ruby language', ()=>{
        expect(rubyExtractor.languages.has('ruby')).toBe(true);
    });
});
describe('ruby extractor — lexical candidates through Module.nesting', ()=>{
    it('a bare constant inside a module body yields the nesting candidate, then the top level', async ()=>{
        const { uses } = await run([
            'module App',
            '  x = Helper',
            'end',
            ''
        ].join('\n'));
        expect(groups(uses)).toEqual([
            [
                'App::Helper',
                'Helper'
            ]
        ]);
        const top = uses[0].candidates[1];
        expect(top.kind === 'symbol' && top.rubyInheritGuard).toBe('Helper');
    });
    it('a superclass is looked up in the OUTER nesting (the scope holding `class`)', async ()=>{
        const { uses } = await run([
            'module App',
            '  class Widget < Base',
            '  end',
            'end',
            ''
        ].join('\n'));
        expect(groups(uses)).toEqual([
            [
                'App::Base',
                'Base'
            ]
        ]);
    });
    it('a mixin is looked up in the body nesting, innermost first', async ()=>{
        const { uses } = await run([
            'module App',
            '  class C',
            '    include Loggable',
            '  end',
            'end',
            ''
        ].join('\n'));
        expect(groups(uses)).toEqual([
            [
                'App::C::Loggable',
                'App::Loggable',
                'Loggable'
            ]
        ]);
    });
    it('an unrooted `A::B` inside a namespace gets nesting candidates anchored at `N::A`', async ()=>{
        const { uses } = await run([
            'module Shop',
            '  class Cart',
            '    Billing::Invoice.new',
            '  end',
            'end',
            ''
        ].join('\n'));
        expect(groups(uses)).toEqual([
            [
                'Shop::Cart::Billing::Invoice',
                'Shop::Billing::Invoice',
                'Billing::Invoice'
            ]
        ]);
        const anchors = uses[0].candidates.map((c)=>c.kind === 'symbol' ? c.rubyAnchor : undefined);
        expect(anchors).toEqual([
            'Shop::Cart::Billing',
            'Shop::Billing',
            undefined
        ]);
    });
    it('a compact `class Shop::Cart` nests only itself (Module.nesting is [Shop::Cart])', async ()=>{
        const { uses } = await run([
            'class Shop::Cart',
            '  def x',
            '    Helper.go',
            '  end',
            'end',
            ''
        ].join('\n'));
        expect(groups(uses)).toEqual([
            [
                'Shop::Cart::Helper',
                'Helper'
            ]
        ]);
    });
    it('a ::-rooted reference is absolute at any depth (key stripped, single candidate)', async ()=>{
        const { uses } = await run([
            'module App',
            '  x = ::TopHelper',
            'end',
            ''
        ].join('\n'));
        expect(groups(uses)).toEqual([
            [
                'TopHelper'
            ]
        ]);
    });
    it('a top-level reference stays a single verbatim candidate (cref is Object)', async ()=>{
        const { uses } = await run([
            'class OrderService < BaseService',
            '  include Loggable',
            'end',
            'x = Helper',
            ''
        ].join('\n'));
        expect(groups(uses)).toEqual([
            [
                'BaseService'
            ],
            [
                'OrderService::Loggable',
                'Loggable'
            ],
            [
                'Helper'
            ]
        ]);
    });
    it('a constant inside a method body of a top-level class is resolved lexically too', async ()=>{
        const { uses } = await run([
            'class Order',
            '  def run',
            '    Helper.go',
            '    ::TopHelper.go',
            '  end',
            'end',
            ''
        ].join('\n'));
        expect(groups(uses)).toEqual([
            [
                'Order::Helper',
                'Helper'
            ],
            [
                'TopHelper'
            ]
        ]);
    });
});
describe('ruby extractor — declarations(): Zeitwerk implicit namespaces', ()=>{
    const declared = async (path, code)=>{
        return withParsedFiles([
            rb(path, code)
        ], ([parsed])=>rubyExtractor.declarations(parsed).map((d)=>d.symbolKey));
    };
    it('a compact declaration whose path matches its full name anchors the outer namespaces', async ()=>{
        expect(await declared('app/models/billing/invoice.rb', 'class Billing::Invoice\nend\n')).toEqual([
            'Billing::Invoice',
            'Billing'
        ]);
    });
    it('underscores every segment (Admin::HTMLParser ↔ admin/html_parser.rb)', async ()=>{
        expect(await declared('lib/admin/html_parser.rb', 'class Admin::HTMLParser\nend\n')).toContain('Admin');
    });
    it('a compact declaration whose path does not match anchors nothing', async ()=>{
        expect(await declared('src/stub/server_stub.rb', 'module Rack::Handler\nend\n')).toEqual([
            'Rack::Handler'
        ]);
        expect(await declared('lib/billing_invoice.rb', 'class Billing::Invoice\nend\n')).toEqual([
            'Billing::Invoice'
        ]);
    });
});
