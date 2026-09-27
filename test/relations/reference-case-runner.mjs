// Moved from Yggdrasil source/cli/tests/unit/relations/reference-case-runner.ts. The one relation reference-case harness: `runCase('<id>')` is the body of every `it('<id>')` in the matrix suites, and the catalogue (reference/relations/<language>/<id>.md) is its only input.
//
// The runner does not reimplement name resolution. It loads the case, builds an in-memory project from its `## Files`, and drives the real pipeline over the real extractor, symbol table and resolver: the universe symbol table from extractor.declarations(), the C# global-using pre-pass, then the per-reference ordered-candidate walk (resolved: edge and stop; a nearer ambiguous: silence the group; absent: continue). It then asserts every `## Expect` line and that no unexpected cross-owner edge appears, so a case cannot pass while emitting a spurious edge.
//
// Ownership follows the catalogue's `node:<id>` convention: a file at `<root>/<id>/<...>` belongs to `<id>`, the basename of its parent directory. Only the case's source files are owned; any other file (a support file, or a file the resolver finds on disk) is unowned, exactly as an owner index built from one exact mapping per source file answers.
import { readFileSync, readdirSync, existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect } from '../helpers/expect.mjs';
import { withParsedFiles, CATALOGUE_ROOT } from '../helpers/tree-sitter.mjs';
import { getLanguageForExtension, relationLanguageForPath } from '@chrisdudek/runes/grammars';
import {
  extractorForLanguage,
  sfcScriptView,
  csharpUses,
  collectGlobalUsings,
  collectGlobalUsingAliases,
  buildCsharpProjectScopes,
  SymbolTable,
  makeResolver,
  resolveDetectedEdges,
  makeResolvePathToFile,
} from '@chrisdudek/runes/relations';

/** Support-file basenames the path resolvers read but never parse as source. A `## Files` block whose extension has no grammar language is accepted only when its basename is one of these (anything else is a typo and throws). Go reads go.mod (and go.work), PHP reads composer.json, C/C++ reads compile_commands.json, Rust reads Cargo.toml, C# reads Directory.Build.*; the lock and sum files are harmless to materialize. */
const CONFIG_BASENAMES = new Set(['compile_commands.json', 'go.mod', 'go.work', 'go.sum', 'composer.json', 'Cargo.toml', 'Cargo.lock', 'Directory.Build.props', 'Directory.Build.targets']);

/** Support-file extensions accepted the same way: a C# project file scopes global usings to its project and carries `<Using>` items. */
const CONFIG_EXTENSIONS = new Set(['.csproj']);

/** TS/JS project files the TS resolver reads (tsconfig*.json, package.json). They carry a `.json` extension, which maps to the JSON grammar, so they are recognised by basename before the language lookup: materialized for the resolver, never parsed, never owned. */
const TS_CONFIG_BASENAME = /^(?:(?:tsconfig|jsconfig)(?:\.[\w-]+)*\.json|package\.json)$/;

/** The owner a file belongs to: the basename of its parent directory. */
function ownerOfPath(filePath) {
  const segs = filePath.split('/');
  return segs.length >= 2 ? segs[segs.length - 2] : '';
}

/** Parses the YAML-ish frontmatter block (key: value lines only, enough for cases). */
function parseFrontmatter(block) {
  const out = {};
  for (const raw of block.split('\n')) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    out[key] = value;
  }
  return out;
}

/** The text under a `## <name>` heading, up to the next `## ` heading or the end. */
function sectionBody(body, name) {
  const start = new RegExp(`(^|\\n)##\\s+${name}\\s*\\n`).exec(body);
  if (!start) throw new Error(`missing required section ## ${name}`);
  const rest = body.slice(start.index + start[0].length);
  const next = /\n##\s+/.exec(rest);
  return next ? rest.slice(0, next.index) : rest;
}

/** Reads and parses `reference/relations/<language>/<id>.md` into a structured case. */
export function loadCaseDoc(id, mdPath) {
  const text = readFileSync(mdPath, 'utf-8');
  const fmMatch = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!fmMatch) throw new Error(`reference-case ${id}: missing frontmatter block`);
  const fm = parseFrontmatter(fmMatch[1]);
  const language = fm.language;
  if (!language) throw new Error(`reference-case ${id}: frontmatter has no language`);
  const expectation = fm.expectation;
  if (expectation !== 'edge' && expectation !== 'silence') throw new Error(`reference-case ${id}: expectation must be edge|silence, got ${fm.expectation}`);
  const body = text.slice(fmMatch[0].length);

  const files = [];
  const configFiles = [];
  const fenceRe = /```[a-zA-Z+]*\s+path=([^\s`]+)\n([\s\S]*?)```/g;
  const filesSection = sectionBody(body, 'Files');
  let m;
  while ((m = fenceRe.exec(filesSection)) !== null) {
    const fpath = m[1].trim();
    const ext = path.extname(fpath);
    const base = path.posix.basename(fpath);
    // A Vue/Svelte component has no grammar of its own; relation extraction reads its `<script>` view (sfcScriptView), and so does this runner.
    const lang = TS_CONFIG_BASENAME.test(base) ? null : (getLanguageForExtension(ext) ?? sfcScriptView(fpath, m[2])?.language ?? null);
    if (lang) files.push({ path: fpath, language: lang, code: m[2] });
    else if (CONFIG_BASENAMES.has(base) || CONFIG_EXTENSIONS.has(ext) || TS_CONFIG_BASENAME.test(base)) configFiles.push({ path: fpath, code: m[2] });
    else throw new Error(`reference-case ${id}: no language for extension '${ext}' (${fpath})`);
  }
  if (files.length === 0) throw new Error(`reference-case ${id}: ## Files has no path-tagged code blocks`);
  // The relation language, as extraction decides it: a `.h` beside C++ files is C++.
  for (const f of files) {
    const dir = path.posix.dirname(f.path);
    const siblings = [...files, ...configFiles].filter((o) => path.posix.dirname(o.path) === dir).map((o) => path.posix.basename(o.path));
    f.language = relationLanguageForPath(f.path, () => siblings) ?? f.language;
  }

  const expectEdges = [];
  let expectSilence = false;
  for (const raw of sectionBody(body, 'Expect').split('\n')) {
    let line = raw.trim();
    if (line.startsWith('-')) line = line.slice(1).trim();
    if (line === '') continue;
    const stripped = line.replace(/#.*$/, '').trim();
    if (stripped === '') continue;
    if (stripped === 'silence') { expectSilence = true; continue; }
    const edge = /^(\S+):(\d+)\s*->\s*node:(\S+)$/.exec(stripped);
    if (!edge) throw new Error(`reference-case ${id}: unparseable ## Expect line: '${raw.trim()}'`);
    expectEdges.push({ fromFile: edge[1], line: Number(edge[2]), owner: edge[3] });
  }
  if (!expectSilence && expectEdges.length === 0) throw new Error(`reference-case ${id}: ## Expect has neither an edge line nor a 'silence' line`);
  return { id, language, expectation, files, configFiles, expectEdges, expectSilence };
}

/** Every case `.md` of the catalogue: `{ id, language, mdPath }`. */
export function listCases() {
  const out = [];
  for (const dir of readdirSync(CATALOGUE_ROOT, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    for (const f of readdirSync(path.join(CATALOGUE_ROOT, dir.name))) {
      if (f.endsWith('.md')) out.push({ id: f.slice(0, -3), language: dir.name, mdPath: path.join(CATALOGUE_ROOT, dir.name, f) });
    }
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

function locateCaseMd(id) {
  for (const entry of readdirSync(CATALOGUE_ROOT, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const candidate = path.join(CATALOGUE_ROOT, entry.name, `${id}.md`);
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(`reference-case ${id}: no <language>/${id}.md under ${CATALOGUE_ROOT}`);
}

/** Materializes the case's files into a throwaway project root, so the path resolver sees exactly the layout the catalogue documents. The caller removes it. */
function materializeProject(files, configFiles = []) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'runes-refcase-'));
  for (const f of [...files, ...configFiles]) {
    const abs = path.join(root, f.path);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, f.code, 'utf-8');
  }
  return root;
}

/** The cross-owner edges the real pipeline emits for one case: `{ fromFile, line, owner }`. */
export async function caseEdges(doc) {
  return withParsedFiles(
    doc.files.map((f) => {
      // A component is parsed as its script view, under the view's grammar extension.
      const view = sfcScriptView(f.path, f.code);
      return view === null ? { path: f.path, code: f.code, language: f.language } : { path: view.parsePath, code: view.content, language: f.language };
    }),
    async (parsedFiles) => {
      const parsedByPath = new Map();
      doc.files.forEach((f, i) => parsedByPath.set(f.path, { ...parsedFiles[i], path: f.path }));

      // The universe symbol table: extractor.declarations() over every file of the case.
      const symbolTable = new SymbolTable();
      for (const f of doc.files) {
        const extractor = extractorForLanguage(f.language);
        if (!extractor) continue;
        for (const decl of extractor.declarations(parsedByPath.get(f.path))) symbolTable.declare(f.language, decl.symbolKey, f.path);
      }

      const owned = new Map(doc.files.map((f) => [f.path, ownerOfPath(f.path)]));
      const ownerIndex = { ownerOf: (file) => owned.get(file) };

      const projectRoot = materializeProject(doc.files, doc.configFiles);
      try {
        // The C# global-using pre-pass: per-project namespace prefixes and aliases.
        const csharpScopes = buildCsharpProjectScopes(
          projectRoot,
          doc.files.filter((f) => f.language === 'csharp').map((f) => ({
            path: f.path,
            globalPrefixes: collectGlobalUsings(parsedByPath.get(f.path)),
            globalAliases: collectGlobalUsingAliases(parsedByPath.get(f.path)),
          })),
        );
        const resolver = makeResolver({ ownerIndex, symbolTable, resolvePathToFile: makeResolvePathToFile(projectRoot, ownerIndex.ownerOf) });
        const edges = [];
        for (const f of doc.files) {
          const extractor = extractorForLanguage(f.language);
          if (!extractor) continue;
          const parsed = parsedByPath.get(f.path);
          const fromOwner = ownerOfPath(f.path);
          const detected = f.language === 'csharp'
            ? csharpUses(parsed, { projectGlobalUsings: csharpScopes.get(f.path)?.usings ?? [], projectGlobalUsingAliases: csharpScopes.get(f.path)?.aliases ?? [] })
            : extractor.uses(parsed);
          for (const { line, owner } of resolveDetectedEdges(detected, resolver, f.path, f.language)) {
            if (owner !== fromOwner) edges.push({ fromFile: f.path, line, owner });
          }
        }
        return edges;
      } finally {
        rmSync(projectRoot, { recursive: true, force: true });
      }
    },
  );
}

/** Runs one reference case end to end and fails when the documented `## Expect` is not met or an unexpected edge appears. */
export async function runCase(id) {
  const doc = loadCaseDoc(id, locateCaseMd(id));
  const edges = await caseEdges(doc);
  const edgeKey = (e) => `${e.fromFile}:${e.line}->${e.owner}`;
  const actual = new Set(edges.map(edgeKey));
  const expected = new Set(doc.expectEdges.map(edgeKey));
  // One dependency, one report: the same file:line -> owner is never emitted twice.
  const duplicates = edges.map(edgeKey).filter((k, i, all) => all.indexOf(k) !== i);
  expect(duplicates, `case ${id}: edge reported more than once: ${duplicates.join(', ')}`).toHaveLength(0);
  for (const e of doc.expectEdges) expect(actual, `case ${id}: expected edge ${edgeKey(e)} not emitted (got ${[...actual].join(', ') || 'none'})`).toContain(edgeKey(e));
  for (const a of actual) expect(expected, `case ${id}: unexpected cross-owner edge ${a}`).toContain(a);
  if (doc.expectSilence && doc.expectEdges.length === 0) expect(edges, `case ${id}: expected silence but emitted ${edges.map(edgeKey).join(', ')}`).toHaveLength(0);
}
