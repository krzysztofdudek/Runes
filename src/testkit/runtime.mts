/**
 * A consumer's syntax-tree runtime against the grammar manifest's pin: the grammars are built for one `web-tree-sitter` version, and a consumer that declares or installs another one parses with a runtime the grammars were never checked against.
 */

export interface RuntimePinInput {
  /** The grammar manifest (its `runtime` entry is read). */
  manifest: { runtime: { package: string; version: string } };
  /** The consumer's package.json, parsed. */
  packageJson?: { dependencies?: Record<string, string>; devDependencies?: Record<string, string>; peerDependencies?: Record<string, string>; optionalDependencies?: Record<string, string> };
  /** The version actually installed (from node_modules/<package>/package.json), when known. */
  installed?: string | null;
}

/** Every way the consumer departs from the pin: a declared range instead of the exact version, another version, or an installed version that differs. Empty means it matches. */
export function runtimePinProblems(input: RuntimePinInput): string[] {
  const { package: pkg, version } = input.manifest.runtime;
  const p: string[] = [];
  const pj = input.packageJson;
  if (pj) {
    let declared = 0;
    for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'] as const) {
      const v = pj[field]?.[pkg];
      if (v === undefined) continue;
      declared += 1;
      if (v !== version) p.push(`${field}.${pkg} is "${v}"; the grammar manifest pins exactly "${version}"`);
    }
    if (!declared) p.push(`package.json does not declare ${pkg}; the grammar manifest pins ${version}`);
  }
  if (input.installed !== undefined && input.installed !== null && input.installed !== version) p.push(`${pkg} ${input.installed} is installed; the grammar manifest pins ${version}`);
  return p;
}
