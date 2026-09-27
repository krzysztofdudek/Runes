/**
 * The grammar manifest: exact pins for the tree-sitter runtime and for each grammar, with the sha256 of the built WASM and its node-types.json. Runes keeps the recipe and the pins, never the grammar bytes. The JSON Schema in grammars/manifest.schema.json describes the same shape for editors; this validator is what tests and consumers run, because Runes has no runtime dependencies to run a schema engine with.
 */

export const GRAMMAR_MANIFEST_SCHEMA = 'runes-grammars/1';

export type GrammarSource =
  | { kind: 'npm'; package: string; version: string; path: string }
  | { kind: 'github-release'; repo: string; tag: string; asset: string }
  | { kind: 'git'; repo: string; commit: string; subdir?: string };

export interface GrammarPin {
  /** Language id, unique in the manifest. */
  language: string;
  /** File name the parser resolves, unique in the manifest. */
  wasmFile: string;
  source: GrammarSource;
  sha256: { wasm: string; nodeTypes: string };
  /** Patches applied before a source build, relative to grammars/. */
  patches?: string[];
}

export interface GrammarManifest {
  schema: typeof GRAMMAR_MANIFEST_SCHEMA;
  /** The runtime every consumer must load, at exactly this version. */
  runtime: { package: 'web-tree-sitter'; version: string };
  grammars: GrammarPin[];
}

const EXACT_VERSION = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;
const SHA256 = /^[0-9a-f]{64}$/;
const COMMIT = /^[0-9a-f]{40}$/;
const LANGUAGE = /^[a-z][a-z0-9_-]*$/;
const WASM_FILE = /^[A-Za-z0-9_.-]+\.wasm$/;
const PATCH = /^patches\/[A-Za-z0-9_./-]+\.patch$/;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

function onlyKeys(o: Obj, allowed: string[], where: string, errors: string[]): void {
  for (const k of Object.keys(o)) if (!allowed.includes(k)) errors.push(`${where}: unknown key '${k}'`);
}

/** Returns every problem with a parsed manifest; an empty list means it is valid. */
export function validateGrammarManifest(value: unknown): string[] {
  const errors: string[] = [];
  if (!isObj(value)) return ['manifest: not an object'];
  onlyKeys(value, ['$schema', 'schema', 'runtime', 'grammars'], 'manifest', errors);
  if (value.schema !== GRAMMAR_MANIFEST_SCHEMA) errors.push(`manifest.schema: expected '${GRAMMAR_MANIFEST_SCHEMA}'`);

  const runtime = value.runtime;
  if (!isObj(runtime)) errors.push('manifest.runtime: missing');
  else {
    onlyKeys(runtime, ['package', 'version'], 'manifest.runtime', errors);
    if (runtime.package !== 'web-tree-sitter') errors.push("manifest.runtime.package: expected 'web-tree-sitter'");
    if (typeof runtime.version !== 'string' || !EXACT_VERSION.test(runtime.version)) errors.push('manifest.runtime.version: expected an exact version');
  }

  if (!Array.isArray(value.grammars)) {
    errors.push('manifest.grammars: expected an array');
    return errors;
  }
  const languages = new Set<string>();
  const files = new Set<string>();
  value.grammars.forEach((g: unknown, i: number) => {
    const at = `manifest.grammars[${i}]`;
    if (!isObj(g)) { errors.push(`${at}: not an object`); return; }
    onlyKeys(g, ['language', 'wasmFile', 'source', 'sha256', 'patches'], at, errors);
    if (typeof g.language !== 'string' || !LANGUAGE.test(g.language)) errors.push(`${at}.language: invalid`);
    else if (languages.has(g.language)) errors.push(`${at}.language: duplicate '${g.language}'`);
    else languages.add(g.language);
    if (typeof g.wasmFile !== 'string' || !WASM_FILE.test(g.wasmFile)) errors.push(`${at}.wasmFile: invalid`);
    else if (files.has(g.wasmFile)) errors.push(`${at}.wasmFile: duplicate '${g.wasmFile}'`);
    else files.add(g.wasmFile);

    const s = g.source;
    if (!isObj(s)) errors.push(`${at}.source: missing`);
    else if (s.kind === 'npm') {
      onlyKeys(s, ['kind', 'package', 'version', 'path'], `${at}.source`, errors);
      if (!isStr(s.package)) errors.push(`${at}.source.package: missing`);
      if (typeof s.version !== 'string' || !EXACT_VERSION.test(s.version)) errors.push(`${at}.source.version: expected an exact version`);
      if (!isStr(s.path)) errors.push(`${at}.source.path: missing`);
    } else if (s.kind === 'github-release') {
      onlyKeys(s, ['kind', 'repo', 'tag', 'asset'], `${at}.source`, errors);
      if (typeof s.repo !== 'string' || !/^[^/\s]+\/[^/\s]+$/.test(s.repo)) errors.push(`${at}.source.repo: expected owner/name`);
      if (!isStr(s.tag)) errors.push(`${at}.source.tag: missing`);
      if (!isStr(s.asset)) errors.push(`${at}.source.asset: missing`);
    } else if (s.kind === 'git') {
      onlyKeys(s, ['kind', 'repo', 'commit', 'subdir'], `${at}.source`, errors);
      if (!isStr(s.repo)) errors.push(`${at}.source.repo: missing`);
      if (typeof s.commit !== 'string' || !COMMIT.test(s.commit)) errors.push(`${at}.source.commit: expected a full 40-hex commit`);
      if (s.subdir !== undefined && typeof s.subdir !== 'string') errors.push(`${at}.source.subdir: expected a string`);
    } else errors.push(`${at}.source.kind: expected npm, github-release or git`);

    const h = g.sha256;
    if (!isObj(h)) errors.push(`${at}.sha256: missing`);
    else {
      onlyKeys(h, ['wasm', 'nodeTypes'], `${at}.sha256`, errors);
      if (typeof h.wasm !== 'string' || !SHA256.test(h.wasm)) errors.push(`${at}.sha256.wasm: expected 64 lower-case hex`);
      if (typeof h.nodeTypes !== 'string' || !SHA256.test(h.nodeTypes)) errors.push(`${at}.sha256.nodeTypes: expected 64 lower-case hex`);
    }
    if (g.patches !== undefined) {
      if (!Array.isArray(g.patches)) errors.push(`${at}.patches: expected an array`);
      else g.patches.forEach((p: unknown, j: number) => {
        if (typeof p !== 'string' || !PATCH.test(p)) errors.push(`${at}.patches[${j}]: expected patches/<name>.patch`);
      });
    }
  });
  return errors;
}

/** Parses and validates manifest text; throws with every problem listed. */
export function parseGrammarManifest(text: string): GrammarManifest {
  const value: unknown = JSON.parse(text);
  const errors = validateGrammarManifest(value);
  if (errors.length > 0) throw new Error(`invalid grammar manifest:\n${errors.join('\n')}`);
  return value as GrammarManifest;
}
