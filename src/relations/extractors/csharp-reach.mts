import path from 'node:path';
import { diskFileView, type FileSource, type FileView } from '../file-view.mjs';
import { attributes, stripComments, makeProjectLocator } from './csharp-msbuild.mjs';

/**
 * C# REACHABILITY: which projects the code of one project can see.
 *
 * C# binds a name only to declarations of the compilation itself or of an assembly it references. The extractor reads one file at a time and offers every in-repository declaration of a name as a candidate, so a type or an extension method of a project the calling project cannot reference gave a false edge. The reference graph read here lets the resolver drop those candidates (`ResolverDeps.reach`).
 *
 * A PROJECT is a directory holding a `*.csproj` (several files in one directory are one project); the project of a `.cs` file is the nearest ancestor directory that holds one, as in the global-using scoping. The reference facts of a project come from its project files and from every `Directory.Build.props` and `Directory.Build.targets` above it (all of them: MSBuild imports the nearest and that one commonly imports the next, and reading every one can only add reach):
 *   - `<ProjectReference Include>`: a path relative to the file that holds it (and, in an imported file, to the project too: both readings are taken), or one that starts with `$(MSBuildThisFileDirectory)` or `$(MSBuildProjectDirectory)`; a wildcard is matched against the project files of the repository; a path with any other property is unresolvable, so the project is OPEN;
 *   - `<Reference Include="Name, Version=…">` with or without a `<HintPath>`: the in-repository project whose assembly name (its `<AssemblyName>`, or its file's name) equals the name or the HintPath's file name; no such project: an external assembly, nothing;
 *   - `<PackageReference Include="Id">` naming an in-repository project by its `<PackageId>` or assembly name: a repository that consumes its own packages;
 *   - `<Compile Include>` naming files outside the project's directory, an `<Import>` of a `.projitems` shared project, and an `<Import>` of a path that cannot be resolved (other than the toolchain's own files and the `Directory.Build.*` lookups): the project is OPEN. An import of a file the view holds is read like the project file itself.
 * Conditions are read, never evaluated: every branch counts. References are transitive, as in SDK-style projects (`PrivateAssets` and `DisableTransitiveProjectReferences` are not read: only more reach). An OPEN project reaches everything, and so does every project that reaches an open one.
 *
 * Everything unknown fails OPEN: the answer then allows the candidate, so the worst case is the answer before this module existed.
 */

/** How one file sees another: `same` (one project), `reachable` (the other file's project is in the caller's closure), `unreachable` (it is not, and the closure is closed), `unknown` (the graph cannot say: no project facts exist for one of the files, or the caller's project reaches an open one, so it may see anything). A consumer that filters candidates keeps `unknown` like `reachable`; only a rule that must tell "the graph shows it" from "nothing is known" reads the difference. */
export type Reach = 'same' | 'reachable' | 'unreachable' | 'unknown';

/** Whether the project of `fromFile` can see the declarations of `targetFile` (repository-relative POSIX paths). See {@link buildCsharpReachability}. */
export type Reachability = (fromFile: string, targetFile: string) => Reach;

/** Project file extensions whose references are read (the C# ones are the projects of `.cs` files; the others are links a reference chain may pass through). */
const PROJECT_FILE = /\.(?:cs|fs|vb)proj$/i;

/** The toolchain's own imports (`$(MSBuildToolsPath)\Microsoft.CSharp.targets`): files outside the repository that add no in-repository reference. */
const TOOLCHAIN_PROPERTY = /^\$\((?:MSBuild\w*|VS\w*|NuGet\w*|Microsoft\w*|FrameworkPath|DevEnvDir|WapProjPath)\)/i;

/** The directories a project walk never enters. */
const SKIPPED_DIRS = new Set(['bin', 'obj', 'node_modules']);

/** A path in its one spelling: separators as `/`, `.` and `..` segments folded, no trailing slash. */
function norm(p: string): string {
  return path.posix.normalize(p.replace(/\\/g, '/')).replace(/\/$/, '') || '.';
}

/** A glob (`*`, `**`, `?`) as an anchored, case-insensitive regular expression over normalized paths. */
function globToRegExp(glob: string): RegExp {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        i++;
        if (glob[i + 1] === '/') i++;
        re += '(?:.*/)?';
      } else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`, 'i');
}

/** The names an item's `Include` attribute lists (`;`-separated), trimmed and not empty. */
function includes(attrText: string): string[] {
  const value = attributes(attrText).get('include');
  return value === undefined ? [] : value.split(';').map((s) => s.trim()).filter((s) => s !== '');
}

/** The file name without its directory and extension, of a path in either separator style. */
function stem(p: string): string {
  const base = p.replace(/\\/g, '/').split('/').pop() ?? '';
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(0, dot) : base;
}

/**
 * The reference graph of the C# projects of a repository, as a predicate the resolver asks. `projectRoot` is the repository root the repo-relative `csFiles` are relative to; `options.files`, when given, is the view the project files are found and read through (see `FileView`): a project file the view does not list does not exist; without it the disk under `projectRoot` is read. A file not in `csFiles`, or under no project file, has no project facts, and a pair with such a file is `unknown`. Deterministic: the answer depends only on the files read.
 */
export function buildCsharpReachability(
  projectRoot: string,
  csFiles: Iterable<string>,
  options?: { files?: FileView },
): Reachability {
  const source: FileSource = options?.files ?? diskFileView(projectRoot, false);
  const loc = makeProjectLocator(source);

  const projectOf = new Map<string, string>();
  for (const f of csFiles) {
    const dir = loc.projectDirOf(f);
    if (dir !== null) projectOf.set(f, dir);
  }

  const projectFilesIn = (dir: string): string[] =>
    loc.list(dir).filter((n) => PROJECT_FILE.test(n)).map((n) => (dir === '.' ? n : `${dir}/${n}`));

  /** Every project file of the repository, found by one walk (dot-directories, `bin`, `obj` and `node_modules` skipped), when a wildcard or an assembly name needs them. */
  let allProjects: string[] | undefined;
  const everyProjectFile = (): string[] => {
    if (allProjects !== undefined) return allProjects;
    const out: string[] = [];
    const walk = (dir: string): void => {
      for (const e of source.list(dir) ?? []) {
        const rel = dir === '.' ? e.name : `${dir}/${e.name}`;
        if (e.kind === 'file') {
          if (PROJECT_FILE.test(e.name)) out.push(rel);
        } else if (e.kind === 'dir' && !e.name.startsWith('.') && !SKIPPED_DIRS.has(e.name.toLowerCase())) walk(rel);
      }
    };
    walk('.');
    allProjects = out.sort();
    return allProjects;
  };

  const readText = (rel: string): string => {
    const text = source.read(rel);
    return text === undefined ? '' : stripComments(text);
  };

  /** The names a project answers to for `<Reference>` and `<PackageReference>`: its project file's name, its `<AssemblyName>` and `<PackageId>` values. Lower-cased. */
  const namesOfProject = (projectFile: string): string[] => {
    const text = readText(projectFile);
    const names = [stem(projectFile).toLowerCase()];
    for (const prop of ['AssemblyName', 'PackageId']) {
      const re = new RegExp(`<${prop}\\b[^>]*>([^<]*)</${prop}>`, 'gi');
      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null) {
        const value = m[1].trim().replace(/\$\(MSBuildProjectName\)/gi, stem(projectFile));
        if (value !== '' && !/[$%@]\(/.test(value)) names.push(value.toLowerCase());
      }
    }
    return names;
  };
  let nameIndex: Map<string, Set<string>> | undefined;
  const projectDirsNamed = (name: string): ReadonlySet<string> => {
    if (nameIndex === undefined) {
      nameIndex = new Map();
      for (const file of everyProjectFile()) {
        const dir = path.posix.dirname(file);
        for (const n of namesOfProject(file)) {
          let dirs = nameIndex.get(n);
          if (dirs === undefined) nameIndex.set(n, (dirs = new Set()));
          dirs.add(dir);
        }
      }
    }
    return nameIndex.get(name.toLowerCase()) ?? new Set();
  };

  /** An existing file of the view at `p`, the case of its name matched loosely (Windows authors write the case their file system forgives). */
  const findFile = (p: string): string | undefined => {
    if (p === '.' || p.startsWith('../') || p === '..' || p.startsWith('/')) return undefined;
    if (source.isFile(p)) return p;
    const dir = path.posix.dirname(p);
    const want = path.posix.basename(p).toLowerCase();
    const hit = loc.list(dir).find((n) => n.toLowerCase() === want);
    const found = hit === undefined ? undefined : dir === '.' ? hit : `${dir}/${hit}`;
    return found !== undefined && source.isFile(found) ? found : undefined;
  };

  /** A path an item names, resolved against the directory of the file that holds it, or `unresolved` when it needs a property this reader does not know, or `outside` when it leaves the repository. */
  type Resolved = { kind: 'path'; path: string } | { kind: 'unresolved' } | { kind: 'outside' };
  const resolveItemPath = (raw: string, declDir: string, projectDir: string): Resolved => {
    let value = raw.replace(/\\/g, '/');
    let base = declDir;
    const lead = /^\$\((MSBuildThisFileDirectory|MSBuildProjectDirectory)\)\/?/i.exec(value);
    if (lead !== null) {
      base = lead[1].toLowerCase() === 'msbuildthisfiledirectory' ? declDir : projectDir;
      value = value.slice(lead[0].length);
    }
    if (/[$%@]\(/.test(value)) return { kind: 'unresolved' };
    if (value.startsWith('/') || /^[A-Za-z]:/.test(value)) return { kind: 'outside' };
    const joined = norm(base === '.' ? value : `${base}/${value}`);
    return joined === '..' || joined.startsWith('../') ? { kind: 'outside' } : { kind: 'path', path: joined };
  };
  /**
   * An item's path (a `ProjectReference` or `Compile` `Include`) in every reading MSBuild may give it. MSBuild resolves a relative item path against the project that is being built, whichever imported file holds the item, while a person writing a `Directory.Build.props` often means the props file's own directory: where the two differ both are read, which can only add reach.
   */
  const resolveItemPaths = (raw: string, declDir: string, projectDir: string): Resolved[] => {
    const own = resolveItemPath(raw, declDir, projectDir);
    return declDir === projectDir ? [own] : [own, resolveItemPath(raw, projectDir, projectDir)];
  };

  interface Facts { refs: Set<string>; open: boolean }
  const factsCache = new Map<string, Facts>();
  const factsOf = (projectDir: string): Facts => {
    const hit = factsCache.get(projectDir);
    if (hit !== undefined) return hit;
    const facts: Facts = { refs: new Set(), open: false };
    factsCache.set(projectDir, facts);

    const queue: string[] = [];
    const queued = new Set<string>();
    const enqueue = (file: string): void => {
      if (!queued.has(file)) {
        queued.add(file);
        queue.push(file);
      }
    };
    for (const dir of loc.ancestors(projectDir).reverse()) {
      for (const name of ['Directory.Build.props', 'Directory.Build.targets']) {
        if (loc.list(dir).includes(name)) enqueue(dir === '.' ? name : `${dir}/${name}`);
      }
    }
    for (const f of projectFilesIn(projectDir)) enqueue(f);

    const projectDirPrefix = projectDir === '.' ? '' : `${projectDir}/`;
    for (let i = 0; i < queue.length; i++) {
      const file = queue[i];
      const declDir = path.posix.dirname(file);
      const text = readText(file);
      let m: RegExpExecArray | null;

      const projectRefs = /<ProjectReference\b([^>]*?)\/?>/gi;
      while ((m = projectRefs.exec(text)) !== null) {
        for (const item of includes(m[1])) {
          for (const r of resolveItemPaths(item, declDir, projectDir)) {
            if (r.kind === 'unresolved') facts.open = true;
            else if (r.kind === 'path') {
              if (/[*?]/.test(r.path)) {
                const re = globToRegExp(r.path);
                for (const p of everyProjectFile()) if (re.test(p)) facts.refs.add(path.posix.dirname(p));
              } else {
                const found = findFile(r.path);
                if (found !== undefined && PROJECT_FILE.test(found)) facts.refs.add(path.posix.dirname(found));
              }
            }
          }
        }
      }

      const references = /<Reference\b([^>]*?)(?:\/>|>([\s\S]*?)<\/Reference>)/gi;
      while ((m = references.exec(text)) !== null) {
        const hintPath = m[2] === undefined ? undefined : /<HintPath\b[^>]*>([^<]*)<\/HintPath>/i.exec(m[2])?.[1].trim();
        const names = includes(m[1]).map((s) => s.split(',')[0].trim());
        if (hintPath !== undefined && hintPath !== '') names.push(stem(hintPath));
        for (const name of names) for (const dir of projectDirsNamed(name)) facts.refs.add(dir);
      }

      const packageRefs = /<PackageReference\b([^>]*?)\/?>/gi;
      while ((m = packageRefs.exec(text)) !== null) {
        for (const id of includes(m[1])) for (const dir of projectDirsNamed(id)) facts.refs.add(dir);
      }

      const compiles = /<Compile\b([^>]*?)\/?>/gi;
      while ((m = compiles.exec(text)) !== null) {
        for (const item of includes(m[1])) {
          for (const r of resolveItemPaths(item, declDir, projectDir)) {
            if (r.kind !== 'path') facts.open = true;
            else if (projectDirPrefix !== '' && !`${r.path}/`.startsWith(projectDirPrefix)) facts.open = true;
          }
        }
      }

      const imports = /<Import\b([^>]*?)\/?>/gi;
      while ((m = imports.exec(text)) !== null) {
        const attrs = attributes(m[1]);
        const target = attrs.get('project');
        if (target === undefined || target === '' || attrs.has('sdk') || /^Sdk\.(?:props|targets)$/i.test(target)) continue;
        if (/\.projitems\s*$/i.test(target)) {
          facts.open = true;
          continue;
        }
        if (/GetPath\w*OfFileAbove\b[^)]*Directory\.Build\./i.test(target)) continue;
        const r = resolveItemPath(target, declDir, projectDir);
        if (r.kind === 'unresolved') {
          if (!TOOLCHAIN_PROPERTY.test(target)) facts.open = true;
        } else if (r.kind === 'path') {
          if (/[*?]/.test(r.path)) facts.open = true;
          else {
            const found = findFile(r.path);
            if (found !== undefined) enqueue(found);
          }
        }
      }
    }
    return facts;
  };

  const closureCache = new Map<string, { open: boolean; reaches: Set<string> }>();
  const closureOf = (start: string): { open: boolean; reaches: Set<string> } => {
    const hit = closureCache.get(start);
    if (hit !== undefined) return hit;
    const reaches = new Set<string>([start]);
    let open = false;
    const stack = [start];
    while (stack.length > 0) {
      const facts = factsOf(stack.pop() as string);
      if (facts.open) open = true;
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

  return (fromFile, targetFile) => {
    const from = projectOf.get(fromFile);
    const target = projectOf.get(targetFile);
    if (from === undefined || target === undefined) return 'unknown';
    if (from === target) return 'same';
    const closure = closureOf(from);
    if (closure.reaches.has(target)) return 'reachable';
    return closure.open ? 'unknown' : 'unreachable';
  };
}
