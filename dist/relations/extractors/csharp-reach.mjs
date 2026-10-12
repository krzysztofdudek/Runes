import path from 'node:path';
import { diskFileView } from '../file-view.mjs';
import { attributes, stripComments, makeProjectLocator } from './csharp-msbuild.mjs';
/** Project file extensions whose references are read (the C# ones are the projects of `.cs` files; the others are links a reference chain may pass through). */
const PROJECT_FILE = /\.(?:cs|fs|vb)proj$/i;
/** The toolchain's own imports (`$(MSBuildToolsPath)\Microsoft.CSharp.targets`): files outside the repository that add no in-repository reference. */
const TOOLCHAIN_PROPERTY = /^\$\((?:MSBuild\w*|VS\w*|NuGet\w*|Microsoft\w*|FrameworkPath|DevEnvDir|WapProjPath)\)/i;
/** The directories a project walk never enters. */
const SKIPPED_DIRS = new Set(['bin', 'obj', 'node_modules']);
/** A path in its one spelling: separators as `/`, `.` and `..` segments folded, no trailing slash. */
function norm(p) {
    return path.posix.normalize(p.replace(/\\/g, '/')).replace(/\/$/, '') || '.';
}
/** A glob (`*`, `**`, `?`) as an anchored, case-insensitive regular expression over normalized paths. */
function globToRegExp(glob) {
    let re = '';
    for (let i = 0; i < glob.length; i++) {
        const c = glob[i];
        if (c === '*') {
            if (glob[i + 1] === '*') {
                i++;
                if (glob[i + 1] === '/')
                    i++;
                re += '(?:.*/)?';
            }
            else
                re += '[^/]*';
        }
        else if (c === '?')
            re += '[^/]';
        else
            re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
    return new RegExp(`^${re}$`, 'i');
}
/** The names an item's `Include` attribute lists (`;`-separated), trimmed and not empty. */
function includes(attrText) {
    const value = attributes(attrText).get('include');
    return value === undefined ? [] : value.split(';').map((s) => s.trim()).filter((s) => s !== '');
}
/** The file name without its directory and extension, of a path in either separator style. */
function stem(p) {
    const base = p.replace(/\\/g, '/').split('/').pop() ?? '';
    const dot = base.lastIndexOf('.');
    return dot > 0 ? base.slice(0, dot) : base;
}
/**
 * The reference graph of the C# projects of a repository, as a predicate the resolver asks. `projectRoot` is the repository root the repo-relative `csFiles` are relative to; `options.files`, when given, is the view the project files are found and read through (see `FileView`): a project file the view does not list does not exist; without it the disk under `projectRoot` is read. A file not in `csFiles`, or under no project file, has no project facts, and a pair with such a file is `unknown`. Deterministic: the answer depends only on the files read.
 */
export function buildCsharpReachability(projectRoot, csFiles, options) {
    const source = options?.files ?? diskFileView(projectRoot, false);
    const loc = makeProjectLocator(source);
    const projectOf = new Map();
    for (const f of csFiles) {
        const dir = loc.projectDirOf(f);
        if (dir !== null)
            projectOf.set(f, dir);
    }
    const projectFilesIn = (dir) => loc.list(dir).filter((n) => PROJECT_FILE.test(n)).map((n) => (dir === '.' ? n : `${dir}/${n}`));
    /** Every project file of the repository, found by one walk (dot-directories, `bin`, `obj` and `node_modules` skipped), when a wildcard or an assembly name needs them. */
    let allProjects;
    const everyProjectFile = () => {
        if (allProjects !== undefined)
            return allProjects;
        const out = [];
        const walk = (dir) => {
            for (const e of source.list(dir) ?? []) {
                const rel = dir === '.' ? e.name : `${dir}/${e.name}`;
                if (e.kind === 'file') {
                    if (PROJECT_FILE.test(e.name))
                        out.push(rel);
                }
                else if (e.kind === 'dir' && !e.name.startsWith('.') && !SKIPPED_DIRS.has(e.name.toLowerCase()))
                    walk(rel);
            }
        };
        walk('.');
        allProjects = out.sort();
        return allProjects;
    };
    const readText = (rel) => {
        const text = source.read(rel);
        return text === undefined ? '' : stripComments(text);
    };
    /** The `Directory.Build.props` and `Directory.Build.targets` that apply to a project directory, outermost directory first (the names matched in any case, as a Windows author may write them). */
    const directoryBuildFilesOf = (projectDir) => {
        const out = [];
        for (const dir of loc.ancestors(projectDir).reverse()) {
            for (const name of ['directory.build.props', 'directory.build.targets']) {
                const hit = loc.list(dir).find((n) => n.toLowerCase() === name);
                if (hit !== undefined)
                    out.push(dir === '.' ? hit : `${dir}/${hit}`);
            }
        }
        return out;
    };
    /** The names a project answers to for `<Reference>` and `<PackageReference>`: its project file's name, and the `<AssemblyName>` and `<PackageId>` values of its project file and of the `Directory.Build.*` files above it (a company prefix is usually set there). Lower-cased. */
    const namesOfProject = (projectFile) => {
        const names = [stem(projectFile).toLowerCase()];
        for (const file of [projectFile, ...directoryBuildFilesOf(path.posix.dirname(projectFile))]) {
            const text = readText(file);
            for (const prop of ['AssemblyName', 'PackageId']) {
                const re = new RegExp(`<${prop}\\b[^>]*>([^<]*)</${prop}>`, 'gi');
                let m;
                while ((m = re.exec(text)) !== null) {
                    const value = m[1].trim().replace(/\$\(MSBuildProjectName\)/gi, stem(projectFile));
                    if (value !== '' && !/[$%@]\(/.test(value))
                        names.push(value.toLowerCase());
                }
            }
        }
        return names;
    };
    let nameIndex;
    const projectDirsNamed = (name) => {
        if (nameIndex === undefined) {
            nameIndex = new Map();
            for (const file of everyProjectFile()) {
                const dir = path.posix.dirname(file);
                for (const n of namesOfProject(file)) {
                    let dirs = nameIndex.get(n);
                    if (dirs === undefined)
                        nameIndex.set(n, (dirs = new Set()));
                    dirs.add(dir);
                }
            }
        }
        return nameIndex.get(name.toLowerCase()) ?? new Set();
    };
    /** An existing file of the view at `p`, every segment (directories and file name) matched loosely in case (Windows and macOS authors write the case their file system forgives), an exact spelling preferred. Returns the file's own spelling, which is what the project directories of the graph are written in. */
    const findFile = (p) => {
        if (p === '.' || p.startsWith('../') || p === '..' || p.startsWith('/'))
            return undefined;
        let at = '.';
        for (const want of p.split('/')) {
            const names = loc.list(at);
            const hit = names.includes(want) ? want : names.find((n) => n.toLowerCase() === want.toLowerCase());
            if (hit === undefined)
                return undefined;
            at = at === '.' ? hit : `${at}/${hit}`;
        }
        return source.isFile(at) ? at : undefined;
    };
    const resolveItemPath = (raw, declDir, projectDir) => {
        let value = raw.replace(/\\/g, '/');
        let base = declDir;
        const lead = /^\$\((MSBuildThisFileDirectory|MSBuildProjectDirectory)\)\/?/i.exec(value);
        if (lead !== null) {
            base = lead[1].toLowerCase() === 'msbuildthisfiledirectory' ? declDir : projectDir;
            value = value.slice(lead[0].length);
        }
        if (/[$%@]\(/.test(value))
            return { kind: 'unresolved' };
        if (value.startsWith('/') || /^[A-Za-z]:/.test(value))
            return { kind: 'outside' };
        const joined = norm(base === '.' ? value : `${base}/${value}`);
        return joined === '..' || joined.startsWith('../') ? { kind: 'outside' } : { kind: 'path', path: joined };
    };
    /**
     * An item's path (a `ProjectReference` or `Compile` `Include`) in every reading MSBuild may give it. MSBuild resolves a relative item path against the project that is being built, whichever imported file holds the item, while a person writing a `Directory.Build.props` often means the props file's own directory: where the two differ both are read, which can only add reach.
     */
    const resolveItemPaths = (raw, declDir, projectDir) => {
        const own = resolveItemPath(raw, declDir, projectDir);
        return declDir === projectDir ? [own] : [own, resolveItemPath(raw, projectDir, projectDir)];
    };
    const factsCache = new Map();
    const factsOf = (projectDir) => {
        const hit = factsCache.get(projectDir);
        if (hit !== undefined)
            return hit;
        const facts = { refs: new Set(), open: false, links: [] };
        factsCache.set(projectDir, facts);
        const queue = [];
        const queued = new Set();
        const enqueue = (file) => {
            if (!queued.has(file)) {
                queued.add(file);
                queue.push(file);
            }
        };
        for (const f of directoryBuildFilesOf(projectDir))
            enqueue(f);
        for (const f of projectFilesIn(projectDir))
            enqueue(f);
        const projectDirPrefix = projectDir === '.' ? '' : `${projectDir}/`;
        for (let i = 0; i < queue.length; i++) {
            const file = queue[i];
            const declDir = path.posix.dirname(file);
            const text = readText(file);
            let m;
            const projectRefs = /<ProjectReference\b([^>]*?)\/?>/gi;
            while ((m = projectRefs.exec(text)) !== null) {
                for (const item of includes(m[1])) {
                    // A path that lies in the repository and names no file under any reading is a reference the graph cannot follow (a spelling this reader does not know): the project is open, never silently without it.
                    let named = false;
                    let found = false;
                    for (const r of resolveItemPaths(item, declDir, projectDir)) {
                        if (r.kind === 'unresolved')
                            facts.open = true;
                        else if (r.kind === 'path') {
                            if (/[*?]/.test(r.path)) {
                                const re = globToRegExp(r.path);
                                for (const p of everyProjectFile())
                                    if (re.test(p))
                                        facts.refs.add(path.posix.dirname(p));
                            }
                            else {
                                named = true;
                                const file = findFile(r.path);
                                if (file !== undefined) {
                                    found = true;
                                    if (PROJECT_FILE.test(file))
                                        facts.refs.add(path.posix.dirname(file));
                                }
                            }
                        }
                    }
                    if (named && !found)
                        facts.open = true;
                }
            }
            const references = /<Reference\b([^>]*?)(?:\/>|>([\s\S]*?)<\/Reference>)/gi;
            while ((m = references.exec(text)) !== null) {
                const hintPath = m[2] === undefined ? undefined : /<HintPath\b[^>]*>([^<]*)<\/HintPath>/i.exec(m[2])?.[1].trim();
                // The name is the part before the first comma; an Include that is the assembly's file path (`..\bin\Acme.Api.dll`) names it by the file name.
                const names = includes(m[1]).map((s) => s.split(',')[0].trim()).map((s) => (/[\\/]|\.(?:dll|exe)$/i.test(s) ? stem(s) : s));
                if (hintPath !== undefined && hintPath !== '')
                    names.push(stem(hintPath));
                for (const name of names)
                    for (const dir of projectDirsNamed(name))
                        facts.refs.add(dir);
            }
            const packageRefs = /<PackageReference\b([^>]*?)\/?>/gi;
            while ((m = packageRefs.exec(text)) !== null) {
                for (const id of includes(m[1]))
                    for (const dir of projectDirsNamed(id))
                        facts.refs.add(dir);
            }
            const compiles = /<Compile\b([^>]*?)\/?>/gi;
            while ((m = compiles.exec(text)) !== null) {
                for (const item of includes(m[1])) {
                    for (const r of resolveItemPaths(item, declDir, projectDir)) {
                        if (r.kind !== 'path')
                            facts.open = true;
                        else if (projectDirPrefix !== '' && !`${r.path}/`.startsWith(projectDirPrefix)) {
                            facts.open = true;
                            facts.links.push(globToRegExp(r.path));
                        }
                    }
                }
            }
            const imports = /<Import\b([^>]*?)\/?>/gi;
            while ((m = imports.exec(text)) !== null) {
                const attrs = attributes(m[1]);
                const target = attrs.get('project');
                if (target === undefined || target === '' || attrs.has('sdk') || /^Sdk\.(?:props|targets)$/i.test(target))
                    continue;
                if (/\.projitems\s*$/i.test(target)) {
                    facts.open = true;
                    continue;
                }
                if (/GetPath\w*OfFileAbove\b[^)]*Directory\.Build\./i.test(target))
                    continue;
                const r = resolveItemPath(target, declDir, projectDir);
                if (r.kind === 'unresolved') {
                    if (!TOOLCHAIN_PROPERTY.test(target))
                        facts.open = true;
                }
                else if (r.kind === 'path') {
                    if (/[*?]/.test(r.path))
                        facts.open = true;
                    else {
                        const found = findFile(r.path);
                        if (found !== undefined)
                            enqueue(found);
                        // An import that is written without a condition and names no file of the repository stops the build, so it is one this reader cannot see; a conditional one (`Exists(...)`) is the author's own optional file.
                        else if (!attrs.has('condition'))
                            facts.open = true;
                    }
                }
            }
        }
        return facts;
    };
    const closureCache = new Map();
    const closureOf = (start) => {
        const hit = closureCache.get(start);
        if (hit !== undefined)
            return hit;
        const reaches = new Set([start]);
        let open = false;
        const stack = [start];
        while (stack.length > 0) {
            const facts = factsOf(stack.pop());
            if (facts.open)
                open = true;
            for (const dir of facts.refs) {
                if (!reaches.has(dir)) {
                    reaches.add(dir);
                    stack.push(dir);
                }
            }
        }
        const closure = { open, reaches };
        closureCache.set(start, closure);
        return closure;
    };
    /** Every project's `Compile` links that leave its directory, as `[project directory, pattern]`, read once. */
    let linkIndex;
    /** The projects, other than the file's own, that compile the file through a `Compile` item outside their directory: the file is also code of each of them, so it sees what they reference. */
    const linkersOf = (file, own) => {
        if (linkIndex === undefined) {
            linkIndex = [];
            for (const dir of new Set(everyProjectFile().map((f) => path.posix.dirname(f)))) {
                for (const re of factsOf(dir).links)
                    linkIndex.push([dir, re]);
            }
        }
        return [...new Set(linkIndex.filter(([dir, re]) => dir !== own && re.test(file)).map(([dir]) => dir))];
    };
    return (fromFile, targetFile) => {
        const from = projectOf.get(fromFile);
        const target = projectOf.get(targetFile);
        if (from === undefined || target === undefined)
            return 'unknown';
        if (from === target)
            return 'same';
        let open = false;
        for (const root of [from, ...linkersOf(fromFile, from)]) {
            const closure = closureOf(root);
            if (closure.reaches.has(target))
                return 'reachable';
            if (closure.open)
                open = true;
        }
        return open ? 'unknown' : 'unreachable';
    };
}
