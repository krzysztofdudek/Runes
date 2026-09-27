/**
 * Runtime conformance: the tree-sitter runtime and the npm grammar packages a consumer installs must be the versions the grammar manifest pins. Without this, the relation catalogue passing in Runes' CI says nothing about the consumer: the same grammar bytes on another runtime can give other trees.
 */
import { findInstalledPackage } from '../../grammars/installed.mjs';
import { loadGrammarManifest } from '../../grammars/build.mjs';
import type { GrammarManifest } from '../../grammars/manifest.mjs';

export interface RuntimePinOptions {
  /** Directory the packages are resolved from, as from a file in it (usually the consumer's package root). */
  resolveFrom: string;
  /** The manifest to check against; the shipped one when absent. */
  manifest?: GrammarManifest;
  /** Languages whose npm grammar packages must be installed at their pinned version; every npm-sourced pin when absent. */
  languages?: readonly string[];
  /** Also check tree-sitter-cli, which a consumer needs only when it builds grammars from source. */
  cli?: boolean;
  /** Versions known without resolving, by package name: a vendored runtime, for example, whose version is recorded beside the copy. */
  versions?: Readonly<Record<string, string>>;
}

export interface RuntimePinProblem {
  package: string;
  /** What needs it: `runtime`, `cli`, or the grammar's language id. */
  role: string;
  expected: string;
  /** The installed version; absent when the package is not installed. */
  installed?: string;
}

/** Every package whose installed version differs from the manifest's pin, or that is missing. An empty list means the consumer runs the pinned runtime and grammar packages. */
export function checkRuntimePins(options: RuntimePinOptions): RuntimePinProblem[] {
  const manifest = options.manifest ?? loadGrammarManifest();
  const version = (pkg: string): string | undefined => (options.versions && Object.hasOwn(options.versions, pkg) ? options.versions[pkg] : findInstalledPackage(options.resolveFrom, pkg)?.version);
  const wanted: Array<{ package: string; role: string; expected: string }> = [{ package: manifest.runtime.package, role: 'runtime', expected: manifest.runtime.version }];
  if (options.cli === true) wanted.push({ package: manifest.cli.package, role: 'cli', expected: manifest.cli.version });
  const only = options.languages === undefined ? undefined : new Set(options.languages);
  if (only !== undefined) {
    const unknown = [...only].filter((l) => !manifest.grammars.some((g) => g.language === l));
    if (unknown.length > 0) throw new Error(`checkRuntimePins: the grammar manifest pins no grammar for: ${unknown.join(', ')}`);
  }
  for (const g of manifest.grammars) {
    if (g.source.kind !== 'npm' || (only !== undefined && !only.has(g.language))) continue;
    wanted.push({ package: g.source.package, role: g.language, expected: g.source.version });
  }
  const problems: RuntimePinProblem[] = [];
  for (const w of wanted) {
    const installed = version(w.package);
    if (installed !== w.expected) problems.push(installed === undefined ? { ...w } : { ...w, installed });
  }
  return problems;
}

/** One line per problem, for an assertion message. */
export function formatRuntimePinReport(problems: readonly RuntimePinProblem[]): string {
  if (problems.length === 0) return 'runtime pins: every package is the pinned version';
  return problems.map((p) => `${p.package} (${p.role}): pinned ${p.expected}, ${p.installed === undefined ? 'not installed' : `installed ${p.installed}`}`).join('\n');
}
