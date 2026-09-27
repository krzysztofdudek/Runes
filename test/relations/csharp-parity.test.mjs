// Moved from Yggdrasil source/cli/tests/unit/relations/csharp-parity.test.ts (vitest) to node:test; the assertions are unchanged.
import { describe, it, expect } from '../helpers/expect.mjs';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { withParsedFiles } from '../helpers/tree-sitter.mjs';
import { csharpUses, collectGlobalUsings, collectGlobalUsingAliases, extractCsharpRefs, assembleCsharpCandidates } from '@chrisdudek/runes/relations';
const CATALOGUE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../reference/relations/csharp');
function sectionBody(body, name) {
    const re = new RegExp(`(^|\\n)##\\s+${name}\\s*\\n`);
    const start = re.exec(body);
    if (!start) return undefined;
    const from = start.index + start[0].length;
    const rest = body.slice(from);
    const next = /\n##\s+/.exec(rest);
    return next ? rest.slice(0, next.index) : rest;
}
function loadCsharpSnippets() {
    const out = [];
    for (const entry of readdirSync(CATALOGUE_ROOT, {
        withFileTypes: true
    })){
        if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
        const caseId = entry.name.slice(0, -'.md'.length);
        const text = readFileSync(path.join(CATALOGUE_ROOT, entry.name), 'utf-8');
        const fmMatch = /^---\n([\s\S]*?)\n---\n/.exec(text);
        const body = fmMatch ? text.slice(fmMatch[0].length) : text;
        const filesSection = sectionBody(body, 'Files');
        if (filesSection === undefined) continue;
        const fenceRe = /```csharp\s+path=([^\s`]+)\n([\s\S]*?)```/g;
        let m;
        while((m = fenceRe.exec(filesSection)) !== null){
            out.push({
                caseId,
                filePath: m[1].trim(),
                code: m[2]
            });
        }
    }
    return out;
}
function groupByCase(snippets) {
    const byCase = new Map();
    for (const s of snippets){
        const list = byCase.get(s.caseId) ?? [];
        list.push(s);
        byCase.set(s.caseId, list);
    }
    return byCase;
}
describe('C# extract/assemble parity', ()=>{
    it('assemble(extract(pf), opts) equals csharpUses(pf, opts) for every catalogue snippet', async ()=>{
        const snippets = loadCsharpSnippets();
        expect(snippets.length).toBeGreaterThan(0);
        const byCase = groupByCase(snippets);
        let assertions = 0;
        for (const [, caseSnippets] of byCase){
            await withParsedFiles(caseSnippets.map((s)=>({
                    path: s.filePath,
                    code: s.code,
                    language: 'csharp'
                })), (files)=>{
                const parsed = new Map();
                caseSnippets.forEach((s, i)=>parsed.set(s.filePath, files[i]));
                const globalUsings = new Set();
                const globalAliasMap = new Map();
                for (const s of caseSnippets){
                    const pf = parsed.get(s.filePath);
                    for (const prefix of collectGlobalUsings(pf))globalUsings.add(prefix);
                    for (const [name, fqn] of collectGlobalUsingAliases(pf))globalAliasMap.set(name, fqn);
                }
                const projectGlobalUsings = [
                    ...globalUsings
                ];
                const projectGlobalUsingAliases = [
                    ...globalAliasMap.entries()
                ];
                const optionVariants = [
                    {},
                    {
                        projectGlobalUsings,
                        projectGlobalUsingAliases
                    },
                    {
                        projectGlobalUsings
                    },
                    {
                        projectGlobalUsingAliases
                    }
                ];
                for (const s of caseSnippets){
                    const pf = parsed.get(s.filePath);
                    for (const options of optionVariants){
                        const viaSplit = assembleCsharpCandidates(extractCsharpRefs(pf), options);
                        const viaDirect = csharpUses(pf, options);
                        expect(viaSplit, `parity mismatch for ${s.caseId} / ${s.filePath} with options ${JSON.stringify(options)}`).toEqual(viaDirect);
                        assertions++;
                    }
                }
            });
        }
        expect(assertions).toBeGreaterThan(0);
    });
});
