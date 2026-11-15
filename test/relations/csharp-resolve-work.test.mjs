// How much the C# resolution asks of the symbol table, on a generated project of many files. A reference is read through every using directive of its file, so the questions grow with the directives; the same question asked again for the next reference of the file must not be worked out again.
import { describe, it, expect } from '../helpers/expect.mjs';
import { withParsedFiles } from '../helpers/tree-sitter.mjs';
import { random, SEED, seedNote } from '../helpers/prng.mjs';
import { SymbolTable, makeResolver, extractCsharpRefs, assembleCsharpCandidates, csharpExtractor, buildCsharpReachability, buildCsharpProjectScopes, listedFileView } from '@chrisdudek/runes/relations';

const PROJECTS = 4;
const NAMESPACES = 6;
const FILES_PER_NAMESPACE = 6;
const USINGS = 18;
const USES = 10;

const typeName = (p, n, i) => `Type${p}x${n}x${i}`;

/** A project of `PROJECTS` projects (each referencing the one before it), `NAMESPACES` namespaces each, `FILES_PER_NAMESPACE` files per namespace: every file declares one type, imports `USINGS` namespaces and writes `USES` types of them as fields. */
function generate() {
  const files = {};
  let expectedEdges = 0;
  for (let p = 0; p < PROJECTS; p++) {
    files[`p${p}/P${p}.csproj`] = `<Project Sdk="Microsoft.NET.Sdk"><ItemGroup>${p > 0 ? `<ProjectReference Include="..\\p${p - 1}\\P${p - 1}.csproj" />` : ''}</ItemGroup></Project>`;
    for (let n = 0; n < NAMESPACES; n++) {
      for (let i = 0; i < FILES_PER_NAMESPACE; i++) {
        const usings = [];
        for (let u = 0; u < USINGS; u++) usings.push(`using Shop.P${(p + u) % (p + 1)}.N${(n + u) % NAMESPACES};`);
        const fields = [];
        for (let u = 0; u < USES; u++) {
          const target = [(p + u) % (p + 1), (n + u) % NAMESPACES, (i + u) % FILES_PER_NAMESPACE];
          fields.push(`  private ${typeName(...target)} f${u};`);
          if (target[0] !== p || target[1] !== n || target[2] !== i) expectedEdges++;
        }
        files[`p${p}/N${n}/${typeName(p, n, i)}.cs`] = `${[...new Set(usings)].join('\n')}\nnamespace Shop.P${p}.N${n};\npublic class ${typeName(p, n, i)} {\n${fields.join('\n')}\n}\n`;
      }
    }
  }
  return { files, expectedEdges };
}

/** The questions a table is asked, by method. */
class CountingTable extends SymbolTable {
  asked = { has: 0, defCount: 0, filesFor: 0, hasNamespace: 0 };
  has(language, key) { this.asked.has++; return super.has(language, key); }
  defCount(language, key) { this.asked.defCount++; return super.defCount(language, key); }
  filesFor(language, key) { this.asked.filesFor++; return super.filesFor(language, key); }
  hasNamespace(language, name) { this.asked.hasNamespace++; return super.hasNamespace(language, name); }
}

async function resolveAll(files) {
  const paths = Object.keys(files);
  const cs = paths.filter((p) => p.endsWith('.cs'));
  const view = listedFileView(paths, (p) => files[p]);
  const reach = buildCsharpReachability('/nowhere', cs, { files: view });
  return withParsedFiles(cs.map((path) => ({ path, code: files[path], language: 'csharp' })), (parsed) => {
    const table = new CountingTable();
    const extracts = parsed.map((f) => {
      for (const d of csharpExtractor.declarations(f)) table.declare('csharp', d.symbolKey, f.path);
      return { path: f.path, extract: extractCsharpRefs(f) };
    });
    const ownerOf = (file) => file.split('/').slice(0, -1).join('/');
    const resolver = makeResolver({ ownerIndex: { ownerOf }, symbolTable: table, resolvePathToFile: () => undefined, reach });
    const before = { ...table.asked };
    const edges = [];
    let references = 0;
    for (const { path, extract } of extracts) {
      for (const dep of assembleCsharpCandidates(extract, { projectGlobalUsings: [], projectGlobalUsingAliases: [] })) {
        references++;
        for (const candidate of dep.candidates) {
          const outcome = resolver.classify(candidate, path, 'csharp');
          if (outcome.kind === 'resolved') {
            if (outcome.resolvedFile !== path) edges.push(`${path}:${dep.line}\t${outcome.resolvedFile}`);
            break;
          }
          if (outcome.kind === 'ambiguous') break;
        }
      }
    }
    const asked = Object.fromEntries(Object.entries(table.asked).map(([k, v]) => [k, v - before[k]]));
    return { edges, references, asked, total: Object.values(asked).reduce((a, b) => a + b, 0) };
  });
}

describe('csharp: the work of resolving a project of many files', () => {
  it('asks the symbol table a bounded number of questions per reference, however many using directives a file has', async () => {
    const { files, expectedEdges } = generate();
    const { edges, references, total, asked } = await resolveAll(files);
    expect(edges.length).toBe(expectedEdges);
    expect(references).toBe(PROJECTS * NAMESPACES * FILES_PER_NAMESPACE * USES);
    // Reading each name through each of the file's 18 directives once per reference took about 118 questions per reference; the readings are worked out once per name now, about 15.
    expect(total / references, JSON.stringify(asked)).toBeLessThan(30);
  });

  it('works out a reading again when the table takes a declaration after it was worked out', async () => {
    const table = new SymbolTable();
    const resolver = makeResolver({ ownerIndex: { ownerOf: (file) => file.split('/')[0] }, symbolTable: table, resolvePathToFile: () => undefined });
    const hint = { kind: 'symbol', symbolKey: 'Shop.Late', shadow: ['Gone'] };
    expect(resolver.classify(hint, 'a/Use.cs', 'csharp')).toEqual({ kind: 'absent' });
    table.declare('csharp', 'Shop.Late', 'b/Late.cs');
    expect(resolver.classify(hint, 'a/Use.cs', 'csharp')).toEqual({ kind: 'resolved', owner: 'b', resolvedFile: 'b/Late.cs' });
    table.declare('csharp', 'Gone.Thing', 'c/Thing.cs');
    expect(resolver.classify(hint, 'a/Use.cs', 'csharp')).toEqual({ kind: 'absent' });
  });

  it('works out a reading again when the table takes a declaration, for a hint that has no shadow list', async () => {
    const table = new SymbolTable();
    const resolver = makeResolver({ ownerIndex: { ownerOf: (file) => file.split('/')[0] }, symbolTable: table, resolvePathToFile: () => undefined });
    const hint = { kind: 'symbol', symbolKey: 'Shop.Late' };
    expect(resolver.classify(hint, 'a/Use.cs', 'csharp')).toEqual({ kind: 'absent' });
    table.declare('csharp', 'Shop.Late', 'b/Late.cs');
    expect(resolver.classify(hint, 'a/Use.cs', 'csharp')).toEqual({ kind: 'resolved', owner: 'b', resolvedFile: 'b/Late.cs' });
  });

  it('reads a nested type of a type declared since the name was last asked, on the first lookup after the declaration', () => {
    const table = new SymbolTable();
    const resolver = makeResolver({ ownerIndex: { ownerOf: (file) => file.split('/')[0] }, symbolTable: table, resolvePathToFile: () => undefined });
    expect(resolver.classify({ kind: 'symbol', symbolKey: 'Shop.Other' }, 'a/Use.cs', 'csharp')).toEqual({ kind: 'absent' });
    const hint = { kind: 'symbol', symbolKey: 'Shop.Outer.Inner' };
    expect(resolver.classify(hint, 'a/Use.cs', 'csharp')).toEqual({ kind: 'absent' });
    table.declare('csharp', 'Shop.Outer', 'b/Outer.cs');
    table.declare('csharp', 'Shop.Outer+Inner', 'b/Outer.cs');
    expect(resolver.classify(hint, 'a/Use.cs', 'csharp')).toEqual({ kind: 'resolved', owner: 'b', resolvedFile: 'b/Outer.cs' });
  });
});

const TYPES = 8;
const SPLITS = 24;

/** Files that each declare a type with a nested type, and files that each read two of them as `Outer<n>.Inner`: the first reading of every user is a dotted name whose type may be declared only later. */
function dottedProject() {
  const files = {};
  for (let k = 0; k < TYPES; k++) {
    files[`o${k}/Outer${k}.cs`] = `namespace Shop;\npublic class Outer${k} {\n  public class Inner { }\n}\n`;
    files[`u${k}/User${k}.cs`] = `namespace Shop;\npublic class User${k} {\n  Outer${(k + 1) % TYPES}.Inner a;\n  Outer${(k + 3) % TYPES}.Inner b;\n}\n`;
  }
  return files;
}

describe('csharp: a resolver whose table takes declarations between lookups', () => {
  it('gives after the rest of the declarations the edges of a resolver that met the whole table', async () => {
    const files = dottedProject();
    const paths = Object.keys(files);
    await withParsedFiles(paths.map((path) => ({ path, code: files[path], language: 'csharp' })), (parsed) => {
      const declared = new Map(parsed.map((f) => [f.path, csharpExtractor.declarations(f)]));
      const extracts = parsed.map((f) => ({ path: f.path, extract: extractCsharpRefs(f) }));
      const ownerOf = (file) => file.split('/')[0];
      const edgesOf = (resolver) => {
        const edges = [];
        for (const { path, extract } of extracts) {
          for (const dep of assembleCsharpCandidates(extract, { projectGlobalUsings: [], projectGlobalUsingAliases: [] })) {
            for (const candidate of dep.candidates) {
              const outcome = resolver.classify(candidate, path, 'csharp');
              if (outcome.kind === 'resolved') {
                if (outcome.resolvedFile !== path) edges.push(`${path}:${dep.line}\t${outcome.resolvedFile}`);
                break;
              }
              if (outcome.kind === 'ambiguous') break;
            }
          }
        }
        return edges.sort();
      };
      const declare = (table, list) => list.forEach((path) => declared.get(path).forEach((d) => table.declare('csharp', d.symbolKey, path)));
      const whole = new SymbolTable();
      declare(whole, paths);
      const expected = edgesOf(makeResolver({ ownerIndex: { ownerOf }, symbolTable: whole, resolvePathToFile: () => undefined }));
      expect(expected.length).toBe(TYPES * 2);
      const draw = random(SEED);
      for (let n = 0; n < SPLITS; n++) {
        const first = paths.filter(() => draw.bool());
        const table = new SymbolTable();
        declare(table, first);
        const resolver = makeResolver({ ownerIndex: { ownerOf }, symbolTable: table, resolvePathToFile: () => undefined });
        edgesOf(resolver);
        declare(table, paths.filter((path) => !first.includes(path)));
        expect(edgesOf(resolver), `declared first: ${first.join(' ')} ${seedNote()}`).toEqual(expected);
      }
    });
  });
});

const REPOSITORIES = 1000;
const ORDERS = 3;

/** A random repository of two to four projects, each referencing some of those before it, whose files declare and read types the ways the C# type lookup reads them: base lists (dotted, generic, nested, through an alias, attribute bases), using directives, aliases, global usings and `using static`, partial and nested types, enums, members, attributes, instance calls, extension methods and static calls through a type. */
function randomRepository(draw) {
  const files = {};
  const NAMESPACES = ['App', 'App.Core', 'Lib', 'Lib.Ext'];
  const NAMES = ['Base', 'Item', 'Order', 'Mark', 'Svc', 'Outer'];
  const written = () => {
    const name = draw.pick(NAMES);
    switch (draw.int(0, 6)) {
      case 0: return `${draw.pick(NAMESPACES)}.${name}`;
      case 1: return `${name}<${draw.pick(NAMES)}>`;
      case 2: return 'Outer.Inner';
      case 3: return `M.${name}`;
      case 4: return 'Inner';
      default: return name;
    }
  };
  const projects = draw.int(2, 4);
  for (let p = 0; p < projects; p++) {
    const references = [];
    for (let q = 0; q < p; q++) if (draw.bool(0.7)) references.push(q);
    files[`P${p}/P${p}.csproj`] = `<Project Sdk="Microsoft.NET.Sdk"><ItemGroup>${references.map((q) => `<ProjectReference Include="..\\P${q}\\P${q}.csproj" />`).join('')}</ItemGroup></Project>`;
    for (let f = draw.int(2, 4); f > 0; f--) {
      const lines = [];
      for (let u = draw.int(0, 3); u > 0; u--) lines.push(`using ${draw.pick(NAMESPACES)};`);
      if (draw.bool(0.3)) lines.push(`using M = ${draw.pick(NAMESPACES)};`);
      if (draw.bool(0.2)) lines.push(`using static ${draw.pick(NAMESPACES)}.${draw.pick(NAMES)};`);
      if (draw.bool(0.15)) lines.push(`global using ${draw.pick(NAMESPACES)};`);
      lines.push(`namespace ${draw.pick(NAMESPACES)};`);
      for (let t = draw.int(1, 2); t > 0; t--) {
        const name = draw.pick(NAMES);
        const kind = draw.int(0, 9);
        if (kind === 0) {
          lines.push(`public enum ${name} { Paid, Open }`);
          continue;
        }
        if (kind === 1) {
          lines.push(`public static class ${name}Ext { public static void ${draw.pick(['Run', 'Go'])}(this ${written()} x${draw.bool() ? ', int n' : ''}) { } }`);
          continue;
        }
        const attribute = draw.bool(0.3) ? `[${draw.pick(NAMES)}${draw.bool() ? 'Attribute' : ''}] ` : '';
        const bases = [];
        if (kind === 2) bases.push(draw.pick(['Attribute', 'System.Attribute', 'MarkAttribute']));
        else for (let b = draw.int(0, 2); b > 0; b--) bases.push(written());
        const head = `${attribute}public ${draw.bool(0.3) ? 'partial ' : ''}${kind === 3 ? 'interface' : 'class'} ${kind === 2 ? `${name}Attribute` : name}${bases.length > 0 ? ` : ${bases.join(', ')}` : ''}`;
        const body = [];
        if (draw.bool(0.5)) body.push(`public class Inner${draw.bool(0.3) ? ` : ${written()}` : ''} { public static void Go() { } }`);
        for (let m = draw.int(0, 3); m > 0; m--) {
          const member = draw.pick(['f', 'g', 'Item', 'Svc']);
          switch (draw.int(0, 3)) {
            case 0: body.push(`${draw.pick(['public', 'private', 'protected'])} ${written()} ${member};`); break;
            case 1: body.push(`public ${written()} ${member} { get; set; }`); break;
            case 2: body.push(`${draw.pick(['public', 'private', 'protected'])} void ${draw.pick(['Run', 'Go'])}(${draw.bool() ? `${written()} a` : ''}) { }`); break;
            default: {
              const calls = [];
              for (let c = draw.int(1, 3); c > 0; c--) {
                calls.push(draw.pick([`${member}.${draw.pick(['Run', 'Go'])}(${draw.bool() ? 'Order.Paid' : ''});`, `this.${member}.Go(1);`, `${draw.pick(NAMES)}.Go();`, 'Inner.Go();', 'Outer.Inner.Go();', `${written()} local = default;`, 'x.Run();']));
              }
              body.push(`void M${m}(${written()} x) { ${calls.join(' ')} }`);
            }
          }
        }
        lines.push(`${head} { ${body.join(' ')} }`);
      }
      files[`P${p}/F${f}.cs`] = `${lines.join('\n')}\n`;
    }
  }
  return files;
}

/** The items of `list` left after one of each item of `other` is taken out: a reference that resolves twice to one file counts twice. */
function without(list, other) {
  const rest = [...list];
  for (const item of other) {
    const at = rest.indexOf(item);
    if (at !== -1) rest.splice(at, 1);
  }
  return rest;
}

describe('csharp: a resolver whose table takes declarations between lookups, on random repositories', () => {
  it(`gives the edges of a resolver that met the whole table, on ${REPOSITORIES} random multi-project repositories in ${ORDERS} file orders, each declared in two halves around a resolution`, async () => {
    const draw = random(SEED);
    const ownerOf = (file) => file.split('/').slice(0, -1).join('/');
    let runs = 0;
    const differing = [];
    for (let r = 0; r < REPOSITORIES; r++) {
      const files = randomRepository(draw);
      const paths = Object.keys(files);
      const cs = paths.filter((p) => p.endsWith('.cs'));
      const facts = await withParsedFiles(cs.map((path) => ({ path, code: files[path], language: 'csharp' })), (parsed) => parsed.map((f) => ({ path: f.path, declarations: csharpExtractor.declarations(f), extract: extractCsharpRefs(f) })));
      const view = listedFileView(paths, (p) => files[p]);
      const reach = buildCsharpReachability('/nowhere', cs, { files: view });
      const scopes = buildCsharpProjectScopes('/nowhere', facts.map(({ path, extract }) => ({ path, globalPrefixes: extract.scope.globalPrefixes, globalAliases: [...extract.scope.globalAliases.entries()], globalStatics: extract.scope.globalStatics })), { files: view });
      const detected = facts.map(({ path, extract }) => ({ path, deps: assembleCsharpCandidates(extract, { projectGlobalUsings: scopes.get(path).usings, projectGlobalUsingAliases: scopes.get(path).aliases, projectGlobalStatics: scopes.get(path).statics }) }));
      const edgesOf = (resolver) => {
        const edges = [];
        for (const { path, deps } of detected) {
          for (const dep of deps) {
            for (const candidate of dep.candidates) {
              const outcome = resolver.classify(candidate, path, 'csharp');
              if (outcome.kind === 'resolved') {
                if (outcome.resolvedFile !== path) edges.push(`${path}:${dep.line}\t${outcome.resolvedFile}`);
                break;
              }
              if (outcome.kind === 'ambiguous') break;
            }
          }
        }
        return edges.sort();
      };
      const declare = (table, list) => list.forEach(({ path, declarations }) => declarations.forEach((d) => table.declare('csharp', d.symbolKey, path)));
      for (let o = 0; o < ORDERS; o++) {
        const order = [...facts];
        for (let i = order.length - 1; i > 0; i--) {
          const j = draw.int(0, i);
          [order[i], order[j]] = [order[j], order[i]];
        }
        const whole = new SymbolTable();
        declare(whole, order);
        const expected = edgesOf(makeResolver({ ownerIndex: { ownerOf }, symbolTable: whole, resolvePathToFile: () => undefined, reach }));
        const half = Math.floor(order.length / 2);
        const table = new SymbolTable();
        declare(table, order.slice(0, half));
        const resolver = makeResolver({ ownerIndex: { ownerOf }, symbolTable: table, resolvePathToFile: () => undefined, reach });
        edgesOf(resolver);
        declare(table, order.slice(half));
        const edges = edgesOf(resolver);
        runs++;
        if (edges.join('\n') !== expected.join('\n')) differing.push({ repository: r, order: order.map((x) => x.path), lost: without(expected, edges), gained: without(edges, expected), files });
      }
    }
    expect(runs).toBe(REPOSITORIES * ORDERS);
    const first = differing[0];
    expect(differing.length, first === undefined ? '' : `${differing.length} of ${runs} runs differ; the first, repository ${first.repository}, declared ${first.order.join(' ')}: lost ${JSON.stringify(first.lost)}, gained ${JSON.stringify(first.gained)}, files ${JSON.stringify(first.files)} ${seedNote()}`).toBe(0);
  });
});
