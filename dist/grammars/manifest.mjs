/**
 * The grammar manifest: exact pins for the tree-sitter runtime, the tree-sitter CLI that builds grammars from source, and each grammar, with the sha256 of the built WASM and its node-types.json. Runes keeps the recipe and the pins, never the grammar bytes. The JSON Schema in grammars/manifest.schema.json describes the same shape for editors; this validator is what tests and consumers run, because Runes has no runtime dependencies to run a schema engine with.
 */
export const GRAMMAR_MANIFEST_SCHEMA = 'runes-grammars/1';
const EXACT_VERSION = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;
const SHA256 = /^[0-9a-f]{64}$/;
const COMMIT = /^[0-9a-f]{40}$/;
const LANGUAGE = /^[a-z][a-z0-9_-]*$/;
const WASM_FILE = /^[A-Za-z0-9_.-]+\.wasm$/;
const PATCH = /^patches\/[A-Za-z0-9_.-]+\.patch$/;
const HTTPS = /^https:\/\/\S+$/;
const REL_PATH = /^(?!\/)(?!.*(^|\/)\.\.(\/|$))[A-Za-z0-9_./@-]+$/;
const isObj = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v) => typeof v === 'string' && v.length > 0;
function onlyKeys(o, allowed, where, errors) {
    for (const k of Object.keys(o))
        if (!allowed.includes(k))
            errors.push(`${where}: unknown key '${k}'`);
}
function exactPin(o, pkg, where, errors, extraKeys = []) {
    if (!isObj(o)) {
        errors.push(`${where}: missing`);
        return;
    }
    onlyKeys(o, ['package', 'version', ...extraKeys], where, errors);
    if (o.package !== pkg)
        errors.push(`${where}.package: expected '${pkg}'`);
    if (typeof o.version !== 'string' || !EXACT_VERSION.test(o.version))
        errors.push(`${where}.version: expected an exact version`);
}
/** Returns every problem with a parsed manifest; an empty list means it is valid. */
export function validateGrammarManifest(value) {
    const errors = [];
    if (!isObj(value))
        return ['manifest: not an object'];
    onlyKeys(value, ['$schema', 'schema', 'runtime', 'cli', 'grammars'], 'manifest', errors);
    if (value.schema !== GRAMMAR_MANIFEST_SCHEMA)
        errors.push(`manifest.schema: expected '${GRAMMAR_MANIFEST_SCHEMA}'`);
    exactPin(value.runtime, 'web-tree-sitter', 'manifest.runtime', errors, ['wasmSha256']);
    if (isObj(value.runtime) && (typeof value.runtime.wasmSha256 !== 'string' || !SHA256.test(value.runtime.wasmSha256)))
        errors.push('manifest.runtime.wasmSha256: expected 64 lower-case hex');
    exactPin(value.cli, 'tree-sitter-cli', 'manifest.cli', errors);
    const cliVersion = isObj(value.cli) ? value.cli.version : undefined;
    if (!Array.isArray(value.grammars)) {
        errors.push('manifest.grammars: expected an array');
        return errors;
    }
    const languages = new Set();
    const files = new Set();
    value.grammars.forEach((g, i) => {
        const at = `manifest.grammars[${i}]`;
        if (!isObj(g)) {
            errors.push(`${at}: not an object`);
            return;
        }
        onlyKeys(g, ['language', 'wasmFile', 'repo', 'commit', 'version', 'cli', 'abi', 'source', 'sha256', 'note'], at, errors);
        if (typeof g.language !== 'string' || !LANGUAGE.test(g.language))
            errors.push(`${at}.language: invalid`);
        else if (languages.has(g.language))
            errors.push(`${at}.language: duplicate '${g.language}'`);
        else
            languages.add(g.language);
        if (typeof g.wasmFile !== 'string' || !WASM_FILE.test(g.wasmFile))
            errors.push(`${at}.wasmFile: invalid`);
        else if (files.has(g.wasmFile))
            errors.push(`${at}.wasmFile: duplicate '${g.wasmFile}'`);
        else
            files.add(g.wasmFile);
        if (g.repo !== undefined && (typeof g.repo !== 'string' || !HTTPS.test(g.repo)))
            errors.push(`${at}.repo: expected an https URL`);
        if (g.commit !== undefined && (typeof g.commit !== 'string' || !COMMIT.test(g.commit)))
            errors.push(`${at}.commit: expected a full 40-hex commit`);
        for (const k of ['version', 'cli', 'note'])
            if (g[k] !== undefined && !isStr(g[k]))
                errors.push(`${at}.${k}: expected a string`);
        if (g.abi !== undefined && (typeof g.abi !== 'number' || !Number.isInteger(g.abi)))
            errors.push(`${at}.abi: expected an integer`);
        const s = g.source;
        if (!isObj(s))
            errors.push(`${at}.source: missing`);
        else if (s.kind === 'npm') {
            onlyKeys(s, ['kind', 'package', 'version', 'wasmPath', 'nodeTypesPath'], `${at}.source`, errors);
            if (!isStr(s.package))
                errors.push(`${at}.source.package: missing`);
            if (typeof s.version !== 'string' || !EXACT_VERSION.test(s.version))
                errors.push(`${at}.source.version: expected an exact version`);
            if (typeof s.wasmPath !== 'string' || !REL_PATH.test(s.wasmPath))
                errors.push(`${at}.source.wasmPath: expected a relative path inside the package`);
            if (typeof s.nodeTypesPath !== 'string' || !REL_PATH.test(s.nodeTypesPath))
                errors.push(`${at}.source.nodeTypesPath: expected a relative path inside the package`);
        }
        else if (s.kind === 'github-release') {
            onlyKeys(s, ['kind', 'url'], `${at}.source`, errors);
            if (typeof s.url !== 'string' || !HTTPS.test(s.url))
                errors.push(`${at}.source.url: expected an https URL`);
            if (g.repo === undefined)
                errors.push(`${at}.repo: required for a github-release source (node-types.json is read from it)`);
            if (g.commit === undefined)
                errors.push(`${at}.commit: required for a github-release source`);
        }
        else if (s.kind === 'source') {
            onlyKeys(s, ['kind', 'dir', 'generate', 'patches', 'deps'], `${at}.source`, errors);
            if (typeof s.dir !== 'string' || !REL_PATH.test(s.dir))
                errors.push(`${at}.source.dir: expected a relative path inside the repository`);
            if (typeof s.generate !== 'boolean')
                errors.push(`${at}.source.generate: expected a boolean`);
            if (g.repo === undefined)
                errors.push(`${at}.repo: required for a source build`);
            if (g.commit === undefined)
                errors.push(`${at}.commit: required for a source build`);
            if (g.cli !== cliVersion)
                errors.push(`${at}.cli: a source build must name the manifest's cli.version (${String(cliVersion)})`);
            if (s.patches !== undefined) {
                if (!Array.isArray(s.patches))
                    errors.push(`${at}.source.patches: expected an array`);
                else
                    s.patches.forEach((p, j) => {
                        if (typeof p !== 'string' || !PATCH.test(p))
                            errors.push(`${at}.source.patches[${j}]: expected patches/<name>.patch`);
                    });
            }
            if (s.deps !== undefined) {
                if (!Array.isArray(s.deps))
                    errors.push(`${at}.source.deps: expected an array`);
                else
                    s.deps.forEach((d, j) => {
                        const dat = `${at}.source.deps[${j}]`;
                        if (!isObj(d)) {
                            errors.push(`${dat}: not an object`);
                            return;
                        }
                        onlyKeys(d, ['path', 'repo', 'commit'], dat, errors);
                        if (typeof d.path !== 'string' || !REL_PATH.test(d.path))
                            errors.push(`${dat}.path: expected a relative path`);
                        if (typeof d.repo !== 'string' || !HTTPS.test(d.repo))
                            errors.push(`${dat}.repo: expected an https URL`);
                        if (typeof d.commit !== 'string' || !COMMIT.test(d.commit))
                            errors.push(`${dat}.commit: expected a full 40-hex commit`);
                    });
            }
        }
        else
            errors.push(`${at}.source.kind: expected npm, github-release or source`);
        const h = g.sha256;
        if (!isObj(h))
            errors.push(`${at}.sha256: missing`);
        else {
            onlyKeys(h, ['wasm', 'nodeTypes'], `${at}.sha256`, errors);
            if (typeof h.wasm !== 'string' || !SHA256.test(h.wasm))
                errors.push(`${at}.sha256.wasm: expected 64 lower-case hex`);
            if (typeof h.nodeTypes !== 'string' || !SHA256.test(h.nodeTypes))
                errors.push(`${at}.sha256.nodeTypes: expected 64 lower-case hex`);
        }
    });
    return errors;
}
/** Parses and validates manifest text; throws with every problem listed. */
export function parseGrammarManifest(text) {
    const value = JSON.parse(text);
    const errors = validateGrammarManifest(value);
    if (errors.length > 0)
        throw new Error(`invalid grammar manifest:\n${errors.join('\n')}`);
    return value;
}
/** The node-types.json file name written beside a grammar's WASM: `tree-sitter-go.wasm` gives `tree-sitter-go.node-types.json`. */
export function syntaxNodeTypesFile(wasmFile) {
    return wasmFile.replace(/\.wasm$/, '.node-types.json');
}
