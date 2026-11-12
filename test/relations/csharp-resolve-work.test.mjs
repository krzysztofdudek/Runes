// How much the C# resolution asks of the symbol table, on a generated project of many files. A reference is read through every using directive of its file, so the questions grow with the directives; the same question asked again for the next reference of the file must not be worked out again.
import { describe, it, expect } from '../helpers/expect.mjs';
import { withParsedFiles } from '../helpers/tree-sitter.mjs';
import { SymbolTable, makeResolver, extractCsharpRefs, assembleCsharpCandidates, csharpExtractor, buildCsharpReachability, listedFileView } from '@chrisdudek/runes/relations';

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
});
