/**
 * Runtime conformance: the tree-sitter runtime and the npm grammar packages a consumer installs must be the versions the grammar manifest pins. Without this, the relation catalogue passing in Runes' CI says nothing about the consumer: the same grammar bytes on another runtime can give other trees.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { findInstalledPackage } from '../../grammars/installed.mjs';
import { loadGrammarManifest } from '../../grammars/build.mjs';
/** Every package whose installed version differs from the manifest's pin, or that is missing, and the runtime WASM when its sha256 differs from the pin. An empty list means the consumer runs the pinned runtime and grammar packages. */
export function checkRuntimePins(options) {
    const manifest = options.manifest ?? loadGrammarManifest();
    const version = (pkg) => (options.versions && Object.hasOwn(options.versions, pkg) ? options.versions[pkg] : findInstalledPackage(options.resolveFrom, pkg)?.version);
    const wanted = [{ package: manifest.runtime.package, role: 'runtime', expected: manifest.runtime.version }];
    if (options.cli === true)
        wanted.push({ package: manifest.cli.package, role: 'cli', expected: manifest.cli.version });
    const only = options.languages === undefined ? undefined : new Set(options.languages);
    if (only !== undefined) {
        const unknown = [...only].filter((l) => !manifest.grammars.some((g) => g.language === l));
        if (unknown.length > 0)
            throw new Error(`checkRuntimePins: the grammar manifest pins no grammar for: ${unknown.join(', ')}`);
    }
    for (const g of manifest.grammars) {
        if (g.source.kind !== 'npm' || (only !== undefined && !only.has(g.language)))
            continue;
        wanted.push({ package: g.source.package, role: g.language, expected: g.source.version });
    }
    const problems = [];
    // The engine bytes: a version string can be right while the WASM is patched, rebuilt or from another release.
    const wasm = options.runtimeWasm ?? (() => {
        const found = findInstalledPackage(options.resolveFrom, manifest.runtime.package);
        return found === undefined ? undefined : path.join(found.dir, 'web-tree-sitter.wasm');
    })();
    const actualWasm = wasm !== undefined && existsSync(wasm) ? createHash('sha256').update(readFileSync(wasm)).digest('hex') : undefined;
    if (actualWasm !== manifest.runtime.wasmSha256) {
        const p = { package: manifest.runtime.package, role: 'runtime wasm', expected: manifest.runtime.wasmSha256 };
        problems.push(actualWasm === undefined ? p : { ...p, installed: actualWasm });
    }
    for (const w of wanted) {
        const installed = version(w.package);
        if (installed !== w.expected)
            problems.push(installed === undefined ? { ...w } : { ...w, installed });
    }
    return problems;
}
/** One line per problem, for an assertion message. */
export function formatRuntimePinReport(problems) {
    if (problems.length === 0)
        return 'runtime pins: every package is the pinned version';
    return problems.map((p) => `${p.package} (${p.role}): pinned ${p.expected}, ${p.installed === undefined ? (p.role === 'runtime wasm' ? 'no web-tree-sitter.wasm found' : 'not installed') : `installed ${p.installed}`}`).join('\n');
}
