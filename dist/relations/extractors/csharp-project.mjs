import { diskFileView } from '../file-view.mjs';
import { attributes, stripComments, lastProperty, isCsproj, makeProjectLocator } from './csharp-msbuild.mjs';
/** The implicit global usings the .NET SDKs generate (MS Learn — "Implicit using directives"). */
const IMPLICIT_USINGS_BASE = [
    'System',
    'System.Collections.Generic',
    'System.IO',
    'System.Linq',
    'System.Net.Http',
    'System.Threading',
    'System.Threading.Tasks',
];
const IMPLICIT_USINGS_BY_SDK = new Map([
    ['microsoft.net.sdk.web', [
            'System.Net.Http.Json',
            'Microsoft.AspNetCore.Builder',
            'Microsoft.AspNetCore.Hosting',
            'Microsoft.AspNetCore.Http',
            'Microsoft.AspNetCore.Routing',
            'Microsoft.Extensions.Configuration',
            'Microsoft.Extensions.DependencyInjection',
            'Microsoft.Extensions.Hosting',
            'Microsoft.Extensions.Logging',
        ]],
    ['microsoft.net.sdk.worker', [
            'Microsoft.Extensions.Configuration',
            'Microsoft.Extensions.DependencyInjection',
            'Microsoft.Extensions.Hosting',
            'Microsoft.Extensions.Logging',
        ]],
    ['microsoft.net.sdk.blazorwebassembly', [
            'System.Net.Http.Json',
            'Microsoft.AspNetCore.Components.WebAssembly.Hosting',
            'Microsoft.Extensions.Configuration',
            'Microsoft.Extensions.DependencyInjection',
            'Microsoft.Extensions.Logging',
        ]],
]);
/** Apply the `<Using Include|Remove …>` items of one MSBuild file, in document order. */
function applyUsingItems(xml, items) {
    const re = /<Using\b([^>]*?)\/?>/g;
    let m;
    while ((m = re.exec(xml)) !== null) {
        const attrs = attributes(m[1]);
        const remove = attrs.get('remove');
        if (remove !== undefined) {
            const gone = new Set(remove.split(';').map((s) => s.trim()).filter((s) => s !== ''));
            for (let i = items.length - 1; i >= 0; i--)
                if (gone.has(items[i].include))
                    items.splice(i, 1);
            continue;
        }
        const include = attrs.get('include');
        if (include === undefined)
            continue;
        const alias = attrs.get('alias');
        const isStatic = (attrs.get('static') ?? '').toLowerCase() === 'true';
        for (const name of include.split(';').map((s) => s.trim()).filter((s) => s !== '')) {
            items.push({ include: name, alias: alias === '' ? undefined : alias, isStatic });
        }
    }
}
/**
 * Build the per-file project scope for every C# file. `projectRoot` is the absolute repository
 * root the repo-relative `files[].path` values are relative to. `options.files`, when given, is the view of the repository the project files are found and read through (see `FileView`): a `.csproj` or `Directory.Build.props` the view does not list does not exist; without it the disk under `projectRoot` is read. Deterministic: directory listings
 * are sorted, projects are processed in sorted order, and each returned list is in a stable order.
 */
export function buildCsharpProjectScopes(projectRoot, files, options) {
    const source = options?.files ?? diskFileView(projectRoot, false);
    const { list, projectDirOf, nearestFile } = makeProjectLocator(source);
    const read = (rel) => {
        const text = source.read(rel);
        return text === undefined ? '' : stripComments(text);
    };
    // Group the files by project directory (null = the implicit project of csproj-less files).
    const byProject = new Map();
    for (const f of files) {
        const key = projectDirOf(f.path);
        let group = byProject.get(key);
        if (!group) {
            group = [];
            byProject.set(key, group);
        }
        group.push(f);
    }
    const out = new Map();
    // Keys are distinct, so the default code-unit sort is a total, deterministic order.
    const keys = [...byProject.keys()].sort();
    for (const key of keys) {
        const group = byProject.get(key);
        const usings = new Set();
        const aliases = [];
        const aliasSeen = new Set();
        const addAlias = (name, target) => {
            const k = `${name}\0${target}`;
            if (aliasSeen.has(k))
                return;
            aliasSeen.add(k);
            aliases.push([name, target]);
        };
        if (key !== null) {
            const csprojs = list(key)
                .filter(isCsproj)
                .map((n) => (key === '.' ? n : `${key}/${n}`));
            const props = nearestFile(key, 'Directory.Build.props');
            const targets = nearestFile(key, 'Directory.Build.targets');
            const ordered = [props, ...csprojs, targets].filter((p) => p !== undefined).map(read);
            // Properties first (MSBuild evaluates every property before any item), last value wins.
            let implicit;
            for (const xml of ordered)
                implicit = lastProperty(xml, 'ImplicitUsings') ?? implicit;
            const items = [];
            if (implicit !== undefined && /^(enable|true)$/i.test(implicit)) {
                let sdk = '';
                for (const xml of ordered) {
                    const m = /<Project\b([^>]*)>/i.exec(xml);
                    const s = m ? attributes(m[1]).get('sdk') : undefined;
                    if (s !== undefined && s !== '') {
                        sdk = s.toLowerCase();
                        break;
                    }
                }
                for (const ns of [...IMPLICIT_USINGS_BASE, ...(IMPLICIT_USINGS_BY_SDK.get(sdk) ?? [])]) {
                    items.push({ include: ns, isStatic: false });
                }
            }
            for (const xml of ordered)
                applyUsingItems(xml, items);
            for (const it of items) {
                if (it.isStatic)
                    continue;
                if (it.alias !== undefined)
                    addAlias(it.alias, it.include);
                else
                    usings.add(it.include);
            }
        }
        for (const f of group) {
            for (const p of f.globalPrefixes)
                usings.add(p);
            for (const [name, target] of f.globalAliases)
                addAlias(name, target);
        }
        const scope = { usings: [...usings].sort(), aliases };
        for (const f of group)
            out.set(f.path, scope);
    }
    return out;
}
