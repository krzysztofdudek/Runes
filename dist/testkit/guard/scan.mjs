/**
 * The four rules of the guard, applied to one file's tokens. Comments and prose never matter: a lexical ban on words is unworkable (relation code says `node` hundreds of times for syntax nodes), so every rule reads code shape: an import specifier, the arguments of a process call, a string literal, an exported name.
 */
import { tokenize } from './tokenize.mjs';
import { DEFAULT_GUARD_CONFIG } from './config.mjs';
const PROCESS_CALLS = new Set(['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork', 'execa', 'execaSync', 'execaNode', 'execaCommand', 'execaCommandSync', 'Worker']);
/** Tags that run their template as a command: zx's `$` and execa's tagged forms. */
const PROCESS_TAGS = new Set(['$', 'execa', 'execaSync', 'execaCommand', 'execaCommandSync']);
const DECL_MODIFIERS = new Set(['default', 'declare', 'async', 'abstract']);
const DECL_KINDS = new Set(['function', 'class', 'const', 'let', 'var', 'interface', 'type', 'enum', 'namespace', 'module', 'using']);
function stripExtension(name) {
    return name.replace(/\.(d\.)?(mts|cts|ts|tsx|mjs|cjs|js|jsx|json|cmd|exe|bat|ps1|sh)$/i, '');
}
function basenameOf(p) {
    const parts = p.split(/[\\/]/);
    return parts[parts.length - 1] ?? '';
}
function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
/** Splits an identifier into lower-case words: camelCase, PascalCase, snake_case, SCREAMING_CASE and digits all split. */
export function identifierWords(name) {
    return name
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
        .split(/[^A-Za-z0-9]+/)
        .filter(Boolean)
        .map((w) => w.toLowerCase());
}
/** The domain terms an identifier carries, after qualifiers are applied. */
export function domainWordsIn(name, terms) {
    const words = identifierWords(name);
    const hits = [];
    for (const term of terms) {
        const forms = [term.word, `${term.word}s`, `${term.word}es`];
        if (!words.some((w) => forms.includes(w)))
            continue;
        if (term.unless && words.some((w) => term.unless.includes(w)))
            continue;
        hits.push(term.word);
    }
    return hits;
}
/** Module specifiers the file imports, re-exports from, dynamically imports, or requires, with their lines. */
export function importSpecifiers(tokens) {
    const out = [];
    for (let k = 0; k < tokens.length; k++) {
        const t = tokens[k];
        const next = tokens[k + 1];
        if (t.type !== 'ident' || !next)
            continue;
        const prev = tokens[k - 1];
        const resolveCall = t.value === 'resolve' && prev && prev.type === 'punct' && prev.value === '.' && next.type === 'punct' && next.value === '(';
        if (resolveCall) {
            // require.resolve('x') and import.meta.resolve('x') name a module as surely as an import does.
            const owner = tokens[k - 2];
            const arg = tokens[k + 2];
            if (owner && owner.type === 'ident' && (owner.value === 'require' || owner.value === 'meta') && arg && (arg.type === 'string' || arg.type === 'template'))
                out.push({ specifier: arg.value, line: arg.line });
            continue;
        }
        if (prev && prev.type === 'punct' && (prev.value === '.' || prev.value === '?.'))
            continue;
        if ((t.value === 'from' || t.value === 'import') && next.type === 'string') {
            out.push({ specifier: next.value, line: next.line });
        }
        else if ((t.value === 'import' || t.value === 'require') && next.type === 'punct' && next.value === '(') {
            const arg = tokens[k + 2];
            if (arg && (arg.type === 'string' || arg.type === 'template'))
                out.push({ specifier: arg.value, line: arg.line });
        }
    }
    return out;
}
/** Names the file exports: ESM declarations and export lists, `export * as`, and CommonJS `exports.x` / `module.exports.x` / `module.exports = { ... }`. */
export function listExports(source) {
    const tokens = typeof source === 'string' ? tokenize(source) : source;
    const out = [];
    const is = (k, type, value) => {
        const t = tokens[k];
        return !!t && t.type === type && (value === undefined || t.value === value);
    };
    // Collects binding names from a destructuring pattern starting at the opening bracket; returns the index after its close.
    const collectPattern = (start) => {
        let depth = 0;
        let k = start;
        for (; k < tokens.length; k++) {
            const t = tokens[k];
            if (t.type === 'punct' && (t.value === '{' || t.value === '['))
                depth++;
            else if (t.type === 'punct' && (t.value === '}' || t.value === ']')) {
                depth--;
                if (depth === 0)
                    return k + 1;
            }
            else if (t.type === 'ident' && !is(k + 1, 'punct', ':')) {
                const before = tokens[k - 1];
                if (before && before.type === 'punct' && before.value === '=')
                    continue;
                out.push({ name: t.value, line: t.line });
            }
        }
        return k;
    };
    for (let k = 0; k < tokens.length; k++) {
        const t = tokens[k];
        if (t.type !== 'ident')
            continue;
        const prev = tokens[k - 1];
        const afterDot = !!prev && prev.type === 'punct' && (prev.value === '.' || prev.value === '?.');
        if (t.value === 'export' && !afterDot) {
            let j = k + 1;
            if (is(j, 'punct', '*')) {
                if (is(j + 1, 'ident', 'as') && is(j + 2, 'ident'))
                    out.push({ name: tokens[j + 2].value, line: tokens[j + 2].line });
                continue;
            }
            if (is(j, 'punct', '{') || (is(j, 'ident', 'type') && is(j + 1, 'punct', '{'))) {
                if (!is(j, 'punct', '{'))
                    j++;
                j++;
                while (j < tokens.length && !is(j, 'punct', '}')) {
                    if (is(j, 'ident', 'type') && is(j + 1, 'ident'))
                        j++;
                    if (is(j, 'ident') || is(j, 'string')) {
                        let nameTok = tokens[j];
                        if (is(j + 1, 'ident', 'as') && (is(j + 2, 'ident') || is(j + 2, 'string'))) {
                            nameTok = tokens[j + 2];
                            j += 2;
                        }
                        if (nameTok.value !== 'default')
                            out.push({ name: nameTok.value, line: nameTok.line });
                    }
                    j++;
                }
                continue;
            }
            while (is(j, 'ident') && DECL_MODIFIERS.has(tokens[j].value))
                j++;
            if (is(j, 'ident', 'const') && is(j + 1, 'ident', 'enum'))
                j++;
            if (!(is(j, 'ident') && DECL_KINDS.has(tokens[j].value)))
                continue;
            const kind = tokens[j].value;
            j++;
            if (is(j, 'punct', '*'))
                j++;
            if (kind === 'const' || kind === 'let' || kind === 'var' || kind === 'using') {
                // Every declarator of the statement, down to its terminating semicolon or the next statement keyword at depth zero.
                let depth = 0;
                let expectName = true;
                for (; j < tokens.length; j++) {
                    const d = tokens[j];
                    if (depth === 0 && expectName) {
                        if (d.type === 'ident')
                            out.push({ name: d.value, line: d.line });
                        else if (d.type === 'punct' && (d.value === '{' || d.value === '[')) {
                            j = collectPattern(j) - 1;
                        }
                        expectName = false;
                        continue;
                    }
                    if (d.type === 'punct' && (d.value === '(' || d.value === '[' || d.value === '{'))
                        depth++;
                    else if (d.type === 'punct' && (d.value === ')' || d.value === ']' || d.value === '}')) {
                        if (depth === 0)
                            break;
                        depth--;
                    }
                    else if (depth === 0 && d.type === 'punct' && d.value === ',')
                        expectName = true;
                    else if (depth === 0 && d.type === 'punct' && d.value === ';')
                        break;
                    else if (depth === 0 && d.type === 'ident' && (d.value === 'export' || d.value === 'import'))
                        break;
                }
                continue;
            }
            if (is(j, 'ident'))
                out.push({ name: tokens[j].value, line: tokens[j].line });
            continue;
        }
        // CommonJS: exports.x = / module.exports.x =
        if (t.value === 'exports' && !afterDot && is(k + 1, 'punct', '.') && is(k + 2, 'ident') && is(k + 3, 'punct', '=')) {
            out.push({ name: tokens[k + 2].value, line: tokens[k + 2].line });
            continue;
        }
        if (t.value === 'module' && !afterDot && is(k + 1, 'punct', '.') && is(k + 2, 'ident', 'exports')) {
            if (is(k + 3, 'punct', '.') && is(k + 4, 'ident') && is(k + 5, 'punct', '=')) {
                out.push({ name: tokens[k + 4].value, line: tokens[k + 4].line });
            }
            else if (is(k + 3, 'punct', '=') && is(k + 4, 'punct', '{')) {
                let depth = 0;
                for (let j = k + 4; j < tokens.length; j++) {
                    const d = tokens[j];
                    if (d.type === 'punct' && (d.value === '{' || d.value === '(' || d.value === '['))
                        depth++;
                    else if (d.type === 'punct' && (d.value === '}' || d.value === ')' || d.value === ']')) {
                        depth--;
                        if (depth === 0)
                            break;
                    }
                    else if (depth === 1 && d.type === 'ident') {
                        const before = tokens[j - 1];
                        const startsEntry = before.type === 'punct' && (before.value === '{' || before.value === ',');
                        if (startsEntry) {
                            const n = tokens[j + 1];
                            const nameTok = d.value === 'async' || d.value === 'get' || d.value === 'set' ? (n && n.type === 'ident' ? n : d) : d;
                            out.push({ name: nameTok.value, line: nameTok.line });
                        }
                    }
                }
            }
        }
    }
    return out;
}
function reachableTools(config) {
    const free = new Set([config.self, ...(config.edges ?? [])].filter(Boolean));
    return config.tools.filter((tool) => !free.has(tool.name));
}
function toolForSpecifier(specifier, tools) {
    const segments = specifier.split(/[\\/]/).filter(Boolean).map((s) => stripExtension(s).toLowerCase());
    return tools.find((tool) => tool.packages.some((p) => specifier === p || specifier.startsWith(`${p}/`)) ||
        segments.some((s) => tool.modules.includes(s) || tool.stateDirs.includes(s)));
}
function toolForCommandWord(word, tools) {
    const base = stripExtension(basenameOf(word)).toLowerCase();
    return tools.find((tool) => tool.commands.includes(base) || tool.modules.includes(base));
}
// A command-line string reaches a tool when one of its words (split on whitespace and shell operators) is the tool's executable or script, or names its package or a module path of it (a bin path under node_modules, for instance).
function commandHit(value, tools) {
    for (const word of value.split(/[\s;&|()<>`]+/).filter(Boolean)) {
        const tool = toolForCommandWord(word, tools) ?? toolForSpecifier(word, tools);
        if (tool)
            return { word, tool };
    }
    return undefined;
}
function stateDirIn(value, tools) {
    for (const tool of tools) {
        for (const dir of tool.stateDirs) {
            const re = new RegExp(`(?:^|[\\\\/\\s'"\`=:])${escapeRegExp(dir)}(?:[\\\\/]|$)`);
            if (re.test(value))
                return { tool, dir };
        }
    }
    return undefined;
}
/** Applies every rule to one file's source text. */
export function scanSource(text, file, config = DEFAULT_GUARD_CONFIG) {
    const tokens = tokenize(text);
    const tools = reachableTools(config);
    const findings = [];
    for (const { specifier, line } of importSpecifiers(tokens)) {
        const tool = toolForSpecifier(specifier, tools);
        if (tool)
            findings.push({ file, line, rule: 'import', subject: specifier, target: tool.name, message: `imports '${specifier}', code of ${tool.name}` });
    }
    for (let k = 0; k < tokens.length; k++) {
        const t = tokens[k];
        if (t.type !== 'ident')
            continue;
        const tagged = tokens[k + 1];
        if (PROCESS_TAGS.has(t.value) && tagged && tagged.type === 'template') {
            // A tagged template runs its static text as a command line; interpolated values stay invisible.
            const hit = commandHit(tagged.value, tools);
            if (hit)
                findings.push({ file, line: tagged.line, rule: 'spawn', subject: hit.word, target: hit.tool.name, message: `${t.value}\`...\` runs '${hit.word}', the executable of ${hit.tool.name}` });
            continue;
        }
        if (!PROCESS_CALLS.has(t.value))
            continue;
        const open = tokens[k + 1];
        if (!open || open.type !== 'punct' || open.value !== '(')
            continue;
        let depth = 0;
        for (let j = k + 1; j < tokens.length; j++) {
            const a = tokens[j];
            if (a.type === 'punct' && (a.value === '(' || a.value === '[' || a.value === '{'))
                depth++;
            else if (a.type === 'punct' && (a.value === ')' || a.value === ']' || a.value === '}')) {
                depth--;
                if (depth === 0)
                    break;
            }
            else if (a.type === 'string' || a.type === 'template') {
                const hit = commandHit(a.value, tools);
                if (hit) {
                    findings.push({ file, line: a.line, rule: 'spawn', subject: hit.word, target: hit.tool.name, message: `${t.value}() runs '${hit.word}', which reaches ${hit.tool.name}` });
                    break;
                }
            }
        }
    }
    for (const t of tokens) {
        if (t.type !== 'string' && t.type !== 'template')
            continue;
        const hit = stateDirIn(t.value, tools);
        if (hit)
            findings.push({ file, line: t.line, rule: 'state-path', subject: hit.dir, target: hit.tool.name, message: `string literal builds a path into ${hit.dir}/, the state of ${hit.tool.name}` });
    }
    for (const { name, line } of listExports(tokens)) {
        for (const word of domainWordsIn(name, config.domainWords)) {
            findings.push({ file, line, rule: 'export-word', subject: name, target: word, message: `exported identifier '${name}' carries the family domain word '${word}'` });
        }
    }
    findings.sort((a, b) => a.line - b.line || a.rule.localeCompare(b.rule));
    return findings;
}
