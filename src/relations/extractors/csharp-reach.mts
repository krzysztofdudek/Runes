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
 *   - `<Compile Include>` naming files outside the project's directory adds those files, and only those, to the project's compilation (a LINKED file, below); one whose path needs a property this reader does not know, or leaves the repository, could name anything, so the project is OPEN, as it is for an `<Import>` of a `.projitems` shared project and an `<Import>` of a path that cannot be resolved (other than the toolchain's own files and the `Directory.Build.*` lookups). An import of a file the view holds is read like the project file itself.
 *   - `<Compile Remove>`: a file of the project's directory that the item names is in no compilation of that project, so it declares nothing any caller can see. Only a removal that always applies is read: one under a condition (on the item, its `ItemGroup` or a `Choose` branch) or inside a `Target` may not, a file that a `<Compile Include>` of the same project names again is kept, whatever the order, and a project with a `<Compile Include>` this reader cannot place (a path with a property it does not know) keeps every file, because that include may put any of them back.
 * Conditions are read, never evaluated: every branch counts. References are transitive, as in SDK-style projects, and what the compiler is handed decides how far:
 *   - `ReferenceOutputAssembly="false"` on a `ProjectReference` (an attribute or a child element) is a build-order reference: the referenced assembly is not passed to the compiler, so the referencing project sees none of its types. The project's own references are still followed, since the restore graph is not told otherwise;
 *   - `PrivateAssets="all"` on a `ProjectReference` keeps the reference from the projects that reference the referencing project: the referencing project sees the referenced one, its consumers do not;
 *   - a `<Reference>` hands over that one assembly: its types, never the references of the project that builds it, and a consumer of the referencing project does not see it either;
 *   - a metadata value under a `Condition`, or one that needs a property this reader does not know, is not read: the reference stays visible. `DisableTransitiveProjectReferences` is not read either: only more reach.
 * An OPEN project reaches everything, and so does every project that reaches an open one.
 *
 * A file that another project compiles through a `Compile` item outside that project's directory (a linked file) is code of that project too: as a caller it sees what the linking project references, as a target it is seen by the linking project and by every project that reaches it. A linked file under no project file is code of the projects that link it alone. Two files that one compilation holds are `same` to each other.
 *
 * INTERNALS. An internal type is seen only by its own compilation and by the assemblies that compilation names as friends (`InternalsVisibleTo`). A project's friends are read from its `<InternalsVisibleTo Include>` items (in its project files and the `Directory.Build.*` files above it; `$(MSBuildProjectName)` and `$(AssemblyName)` read as the project's names), its `<AssemblyAttribute Include="…InternalsVisibleTo">` items, and the `[assembly: InternalsVisibleTo("…")]` attributes of the C# files it compiles, read only when a caller first asks about that project. A grant this reader cannot name (a property it does not know, a constant instead of a string) names every project, and a pair the graph knows nothing about is visible: the answer fails open here too.
 *
 * Every path is matched segment by segment in any case (a Windows or macOS author's spelling builds there). Everything unknown fails OPEN: a reference, a `Directory.Build.*` name or an import that names a file of the repository this reader cannot find opens its project, and the answer then allows the candidate, so the worst case is the answer before this module existed.
 */

/** How one file sees another: `same` (one project), `reachable` (the other file's project is in the caller's closure), `unreachable` (it is not, and the closure is closed), `unknown` (the graph cannot say: no project facts exist for one of the files, or the caller's project reaches an open one, so it may see anything). A consumer that filters candidates keeps `unknown` like `reachable`; only a rule that must tell "the graph shows it" from "nothing is known" reads the difference. */
export type Reach = 'same' | 'reachable' | 'unreachable' | 'unknown';

/** Whether the project of `fromFile` can see the declarations of `targetFile` (repository-relative POSIX paths). See {@link buildCsharpReachability}. */
export interface Reachability {
  (fromFile: string, targetFile: string): Reach;
  /** Whether `fromFile` may see the internal declarations of `targetFile`: the two share a compilation, or a compilation of the target that the caller's project reaches names the caller's assembly as a friend (`InternalsVisibleTo`). True whenever the graph cannot say. A resolver given a `Reachability` without it reads no declaration as internal. */
  internalsVisible?(fromFile: string, targetFile: string): boolean;
}

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

/** A glob (`*`, `**`, `?`) as an anchored, case-insensitive regular expression over normalized paths. A `**` that ends the glob (`Old/**`) matches every file below, as in MSBuild. */
function globToRegExp(glob: string): RegExp {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        i++;
        if (i + 1 === glob.length) re += '.*';
        else {
          if (glob[i + 1] === '/') i++;
          re += '(?:.*/)?';
        }
      } else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`, 'i');
}

/** The attribute text of an XML start tag up to its end: a quoted value may hold a raw `>` (`Condition="'$(V)' > '10'"`), which ends no tag. */
const ATTRS = `((?:[^>"']|"[^"]*"|'[^']*')*?)`;

/** The value of one piece of an item's metadata, written as an attribute or as a child element (`body` is the item's inner text, when it has one), lower-cased; a child element under its own `Condition`, and a value that needs a property this reader does not know, read as not written, so the answer keeps more reach. The last child element wins, as in MSBuild. */
function metadata(attrText: string, body: string | undefined, name: string): string | undefined {
  let value = attributes(attrText).get(name.toLowerCase());
  if (body !== undefined) {
    const child = new RegExp(`<${name}\\b${ATTRS}>([^<]*)</${name}>`, 'gi');
    let m: RegExpExecArray | null;
    while ((m = child.exec(body)) !== null) if (!attributes(m[1]).has('condition')) value = m[2].trim();
  }
  return value === undefined || /[$%@]\(/.test(value) ? undefined : value.toLowerCase();
}

/** The names an item's `Include` attribute lists (`;`-separated), trimmed and not empty. */
function includes(attrText: string): string[] {
  const value = attributes(attrText).get('include');
  return value === undefined ? [] : value.split(';').map((s) => s.trim()).filter((s) => s !== '');
}

/** True when the item whose start tag is at `index` of `text` may not always apply: it has a `Condition`, or it sits in an `ItemGroup` with one, in a `Choose` branch or in a `Target`. */
function conditional(text: string, index: number, attrText: string): boolean {
  if (attributes(attrText).has('condition')) return true;
  const open: Array<{ name: string; condition: boolean }> = [];
  const tags = new RegExp(`<(\\/?)(ItemGroup|Target|Choose|When|Otherwise)\\b${ATTRS}(\\/?)>`, 'gi');
  let m: RegExpExecArray | null;
  while ((m = tags.exec(text)) !== null && m.index < index) {
    if (m[4] === '/') continue;
    const name = m[2].toLowerCase();
    if (m[1] === '/') {
      const at = open.map((e) => e.name).lastIndexOf(name);
      if (at !== -1) open.length = at;
    } else open.push({ name, condition: attributes(m[3]).has('condition') });
  }
  return open.some((e) => e.condition || e.name !== 'itemgroup');
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

  const files = [...csFiles];
  const known = new Set(files);
  const projectOf = new Map<string, string>();
  for (const f of files) {
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

  /** The `Directory.Build.props` and `Directory.Build.targets` that apply to a project directory, outermost directory first (the names matched in any case, as a Windows author may write them). */
  const directoryBuildFilesOf = (projectDir: string): string[] => {
    const out: string[] = [];
    for (const dir of loc.ancestors(projectDir).reverse()) {
      for (const name of ['directory.build.props', 'directory.build.targets']) {
        const hit = loc.list(dir).find((n) => n.toLowerCase() === name);
        if (hit !== undefined) out.push(dir === '.' ? hit : `${dir}/${hit}`);
      }
    }
    return out;
  };

  /** The names a project answers to for `<Reference>` and `<PackageReference>`: its project file's name, and the `<AssemblyName>` and `<PackageId>` values of its project file and of the `Directory.Build.*` files above it (a company prefix is usually set there). Lower-cased. */
  const namesOfProject = (projectFile: string): string[] => {
    const names = [stem(projectFile).toLowerCase()];
    for (const file of [projectFile, ...directoryBuildFilesOf(path.posix.dirname(projectFile))]) {
      const text = readText(file);
      for (const prop of ['AssemblyName', 'PackageId']) {
        const re = new RegExp(`<${prop}\\b[^>]*>([^<]*)</${prop}>`, 'gi');
        let m: RegExpExecArray | null;
        while ((m = re.exec(text)) !== null) {
          const value = m[1].trim().replace(/\$\(MSBuildProjectName\)/gi, stem(projectFile));
          if (value !== '' && !/[$%@]\(/.test(value)) names.push(value.toLowerCase());
        }
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

  /** An existing file of the view at `p`, every segment (directories and file name) matched loosely in case (Windows and macOS authors write the case their file system forgives), an exact spelling preferred. Returns the file's own spelling, which is what the project directories of the graph are written in. */
  const findFile = (p: string): string | undefined => {
    if (p === '.' || p.startsWith('../') || p === '..' || p.startsWith('/')) return undefined;
    let at = '.';
    for (const want of p.split('/')) {
      const names = loc.list(at);
      const hit = names.includes(want) ? want : names.find((n) => n.toLowerCase() === want.toLowerCase());
      if (hit === undefined) return undefined;
      at = at === '.' ? hit : `${at}/${hit}`;
    }
    return source.isFile(at) ? at : undefined;
  };

  /** A path an item names, resolved against the directory of the file that holds it, or `unresolved` when it needs a property this reader does not know, or `outside` when it leaves the repository. */
  type Resolved = { kind: 'path'; path: string } | { kind: 'unresolved' } | { kind: 'outside' };
  const resolveItemPath = (raw: string, declDir: string, projectDir: string, plainBase: string = declDir): Resolved => {
    let value = raw.replace(/\\/g, '/');
    let base = plainBase;
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

  /** `removed`: the patterns of the project's own files that it takes out of its compilation; `kept`: the patterns its `Compile Include` items name inside its directory, which put a removed file back; `keepsAll`: a `Compile Include` this reader cannot place, which may put any removed file back; `friends`: the lower-cased assembly names the project grants its internals; `everyFriend`: a grant this reader cannot name. */
  /** `types`: the compiler is handed the project's assembly; `follows`: the project's own references count too; `flows`: a project that references the holder sees it as well. */
  interface Ref { types: boolean; follows: boolean; flows: boolean }
  interface Facts { refs: Map<string, Ref>; open: boolean; links: RegExp[]; removed: RegExp[]; kept: RegExp[]; keepsAll: boolean; friends: Set<string>; everyFriend: boolean }
  const factsCache = new Map<string, Facts>();
  const factsOf = (projectDir: string): Facts => {
    const hit = factsCache.get(projectDir);
    if (hit !== undefined) return hit;
    const facts: Facts = { refs: new Map(), open: false, links: [], removed: [], kept: [], keepsAll: false, friends: new Set(), everyFriend: false };
    /** A friend's name as written, its properties read as this project's names; an unknown property names every project. */
    const addFriend = (raw: string): void => {
      const own = projectFilesIn(projectDir);
      let written = [raw.split(',')[0].trim()];
      for (const [prop, values] of [['MSBuildProjectName', own.map(stem)], ['AssemblyName', own.flatMap(namesOfProject)]] as const) {
        const re = new RegExp(`\\$\\(${prop}\\)`, 'gi');
        written = written.flatMap((w) => (w.search(re) === -1 ? [w] : values.map((v) => w.replace(re, v))));
      }
      for (const w of written) {
        if (/[$%@]\(/.test(w)) facts.everyFriend = true;
        else if (w !== '') facts.friends.add(w.toLowerCase());
      }
    };
    /** A reference to a project directory; two items naming it keep the wider of their readings. */
    const addRef = (dir: string, ref: Ref): void => {
      const seen = facts.refs.get(dir);
      facts.refs.set(dir, seen === undefined ? ref : { types: seen.types || ref.types, follows: seen.follows || ref.follows, flows: seen.flows || ref.flows });
    };
    factsCache.set(projectDir, facts);

    const queue: string[] = [];
    const queued = new Set<string>();
    const enqueue = (file: string): void => {
      if (!queued.has(file)) {
        queued.add(file);
        queue.push(file);
      }
    };
    for (const f of directoryBuildFilesOf(projectDir)) enqueue(f);
    for (const f of projectFilesIn(projectDir)) enqueue(f);

    const projectDirPrefix = projectDir === '.' ? '' : `${projectDir}/`;
    for (let i = 0; i < queue.length; i++) {
      const file = queue[i];
      const declDir = path.posix.dirname(file);
      const text = readText(file);
      let m: RegExpExecArray | null;

      const projectRefs = new RegExp(`<ProjectReference\\b${ATTRS}(?:\\/>|>([\\s\\S]*?)<\\/ProjectReference>)`, 'gi');
      while ((m = projectRefs.exec(text)) !== null) {
        const applies = !conditional(text, m.index, m[1]);
        const ref: Ref = {
          types: !(applies && metadata(m[1], m[2], 'ReferenceOutputAssembly') === 'false'),
          follows: true,
          flows: !(applies && (metadata(m[1], m[2], 'PrivateAssets') ?? '').split(';').some((v) => v.trim() === 'all')),
        };
        for (const item of includes(m[1])) {
          // A path that lies in the repository and names no file under any reading is a reference the graph cannot follow (a spelling this reader does not know): the project is open, never silently without it.
          let named = false;
          let found = false;
          for (const r of resolveItemPaths(item, declDir, projectDir)) {
            if (r.kind === 'unresolved') facts.open = true;
            else if (r.kind === 'path') {
              if (/[*?]/.test(r.path)) {
                const re = globToRegExp(r.path);
                for (const p of everyProjectFile()) if (re.test(p)) addRef(path.posix.dirname(p), ref);
              } else {
                named = true;
                const file = findFile(r.path);
                if (file !== undefined) {
                  found = true;
                  if (PROJECT_FILE.test(file)) addRef(path.posix.dirname(file), ref);
                }
              }
            }
          }
          if (named && !found) facts.open = true;
        }
      }

      const references = /<Reference\b([^>]*?)(?:\/>|>([\s\S]*?)<\/Reference>)/gi;
      while ((m = references.exec(text)) !== null) {
        const hintPath = m[2] === undefined ? undefined : /<HintPath\b[^>]*>([^<]*)<\/HintPath>/i.exec(m[2])?.[1].trim();
        // The name is the part before the first comma; an Include that is the assembly's file path (`..\bin\Acme.Api.dll`) names it by the file name.
        const names = includes(m[1]).map((s) => s.split(',')[0].trim()).map((s) => (/[\\/]|\.(?:dll|exe)$/i.test(s) ? stem(s) : s));
        if (hintPath !== undefined && hintPath !== '') names.push(stem(hintPath));
        for (const name of names) for (const dir of projectDirsNamed(name)) addRef(dir, { types: true, follows: false, flows: false });
      }

      const packageRefs = /<PackageReference\b([^>]*?)\/?>/gi;
      while ((m = packageRefs.exec(text)) !== null) {
        for (const id of includes(m[1])) for (const dir of projectDirsNamed(id)) addRef(dir, { types: true, follows: true, flows: true });
      }

      const compiles = new RegExp(`<Compile\\b${ATTRS}\\/?>`, 'gi');
      while ((m = compiles.exec(text)) !== null) {
        for (const item of includes(m[1])) {
          for (const r of resolveItemPaths(item, declDir, projectDir)) {
            if (r.kind !== 'path') {
              facts.open = true;
              if (r.kind === 'unresolved') facts.keepsAll = true;
            } else if (projectDirPrefix !== '' && !`${r.path}/`.startsWith(projectDirPrefix)) facts.links.push(globToRegExp(r.path));
            else facts.kept.push(globToRegExp(r.path));
          }
        }
        const remove = attributes(m[1]).get('remove');
        if (remove === undefined || conditional(text, m.index, m[1])) continue;
        // MSBuild reads an item's relative path against the project being built, whichever imported file holds it; a removal is read in that one way only, because a second reading could take out a file the project compiles.
        for (const item of remove.split(';').map((v) => v.trim()).filter((v) => v !== '')) {
          const r = resolveItemPath(item, declDir, projectDir, projectDir);
          if (r.kind === 'path') facts.removed.push(globToRegExp(r.path));
        }
      }

      const friends = /<InternalsVisibleTo\b([^>]*?)\/?>/gi;
      while ((m = friends.exec(text)) !== null) for (const name of includes(m[1])) addFriend(name);
      const assemblyAttributes = /<AssemblyAttribute\b([^>]*?)(?:\/>|>([\s\S]*?)<\/AssemblyAttribute>)/gi;
      while ((m = assemblyAttributes.exec(text)) !== null) {
        if (!includes(m[1]).some((n) => /(?:^|\.)InternalsVisibleTo(?:Attribute)?$/i.test(n))) continue;
        const parameter = m[2] === undefined ? undefined : /<_Parameter1\b[^>]*>([^<]*)<\/_Parameter1>/i.exec(m[2])?.[1];
        if (parameter === undefined) facts.everyFriend = true;
        else addFriend(parameter);
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
            // An import that is written without a condition and names no file of the repository stops the build, so it is one this reader cannot see; a conditional one (`Exists(...)`) is the author's own optional file.
            else if (!attrs.has('condition')) facts.open = true;
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
    const followed = new Set<string>([start]);
    let open = false;
    const stack = [start];
    while (stack.length > 0) {
      const dirOf = stack.pop() as string;
      const facts = factsOf(dirOf);
      if (facts.open) open = true;
      for (const [dir, ref] of facts.refs) {
        // The start project compiles against all of its references; a project it reaches passes on only the ones that flow.
        if (dirOf !== start && !ref.flows) continue;
        if (ref.types) reaches.add(dir);
        if (ref.follows && !followed.has(dir)) {
          followed.add(dir);
          stack.push(dir);
        }
      }
    }
    const closure = { open, reaches };
    closureCache.set(start, closure);
    return closure;
  };

  /** Every project's `Compile` links that leave its directory, as `[project directory, pattern]`, read once. */
  let linkIndex: Array<[string, RegExp]> | undefined;
  /** The projects, other than the file's own, that compile the file through a `Compile` item outside their directory: the file is also code of each of them, so it sees what they reference. */
  const linkersOf = (file: string, own: string | undefined): string[] => {
    if (linkIndex === undefined) {
      linkIndex = [];
      for (const dir of new Set(everyProjectFile().map((f) => path.posix.dirname(f)))) {
        for (const re of factsOf(dir).links) linkIndex.push([dir, re]);
      }
    }
    return [...new Set(linkIndex.filter(([dir, re]) => dir !== own && re.test(file)).map(([dir]) => dir))];
  };

  /** True when the file's own project compiles it: no `Compile Remove` of the project takes it out, a `Compile Include` of the project names it again, or one the reader cannot place might. */
  const compiledByOwn = (file: string, own: string): boolean => {
    const facts = factsOf(own);
    return facts.keepsAll || !facts.removed.some((re) => re.test(file)) || facts.kept.some((re) => re.test(file));
  };

  /** The projects whose compilation holds the file: its own project unless that project removes it, and every project that links it. Undefined when the graph knows nothing of the file: it is not one of the files the graph was built for, or it lies under no project file and no project links it. */
  const compilations = new Map<string, string[] | undefined>();
  const compilationsOf = (file: string): string[] | undefined => {
    if (compilations.has(file)) return compilations.get(file);
    let out: string[] | undefined;
    if (known.has(file)) {
      const own = projectOf.get(file);
      const linkers = linkersOf(file, own);
      if (own === undefined) out = linkers.length === 0 ? undefined : linkers;
      else out = compiledByOwn(file, own) ? [own, ...linkers] : linkers;
    }
    compilations.set(file, out);
    return out;
  };

  /** The names the assembly of a project directory answers to (see `namesOfProject`), read once. */
  const assemblyNames = new Map<string, string[]>();
  const assemblyNamesIn = (dir: string): string[] => {
    let hit = assemblyNames.get(dir);
    if (hit === undefined) assemblyNames.set(dir, (hit = projectFilesIn(dir).flatMap(namesOfProject)));
    return hit;
  };

  /** The C# files a compilation holds, its own and the ones it links. */
  const filesOfCompilation = new Map<string, string[]>();
  const compiledFiles = (dir: string): string[] => {
    let hit = filesOfCompilation.get(dir);
    if (hit === undefined) filesOfCompilation.set(dir, (hit = files.filter((f) => compilationsOf(f)?.includes(dir) === true)));
    return hit;
  };

  /** Whether the project grants its internals to one of `names`: its MSBuild items, then the assembly attributes of the C# files it compiles. */
  const sourceFriends = new Map<string, { friends: Set<string>; everyFriend: boolean }>();
  const grants = (dir: string, names: readonly string[]): boolean => {
    const facts = factsOf(dir);
    if (facts.everyFriend || names.some((n) => facts.friends.has(n))) return true;
    let found = sourceFriends.get(dir);
    if (found === undefined) {
      found = { friends: new Set(), everyFriend: false };
      sourceFriends.set(dir, found);
      for (const f of compiledFiles(dir)) {
        const text = source.read(f);
        if (text === undefined || !text.includes('InternalsVisibleTo')) continue;
        const attributeLists = /\[\s*assembly\s*:([^\]]*)\]/g;
        let m: RegExpExecArray | null;
        while ((m = attributeLists.exec(text)) !== null) {
          const grantsIn = /\bInternalsVisibleTo(?:Attribute)?\s*\(([^)]*)\)/g;
          let g: RegExpExecArray | null;
          while ((g = grantsIn.exec(m[1])) !== null) {
            const literal = /^\s*@?"([^"]*)"\s*$/.exec(g[1]);
            if (literal === null) found.everyFriend = true;
            else found.friends.add(literal[1].split(',')[0].trim().toLowerCase());
          }
        }
      }
    }
    return found.everyFriend || names.some((n) => found.friends.has(n));
  };

  const reach = ((fromFile: string, targetFile: string): Reach => {
    const callers = compilationsOf(fromFile);
    const targets = compilationsOf(targetFile);
    // A file in no compilation (removed by its project, linked by none): as a target it declares nothing anyone sees; as a caller its references bind nowhere, which the graph cannot say anything about.
    if (callers === undefined || targets === undefined || callers.length === 0) return 'unknown';
    if (targets.length === 0) return 'unreachable';
    if (callers.some((c) => targets.includes(c))) return 'same';
    let open = false;
    for (const root of callers) {
      const closure = closureOf(root);
      if (targets.some((t) => closure.reaches.has(t))) return 'reachable';
      if (closure.open) open = true;
    }
    return open ? 'unknown' : 'unreachable';
  }) as Reachability;

  reach.internalsVisible = (fromFile, targetFile) => {
    const callers = compilationsOf(fromFile);
    const targets = compilationsOf(targetFile);
    if (callers === undefined || targets === undefined || callers.length === 0 || targets.length === 0) return true;
    if (callers.some((c) => targets.includes(c))) return true;
    const reached = targets.filter((t) => callers.some((c) => closureOf(c).reaches.has(t)));
    if (reached.length === 0) return true;
    const names = [...new Set(callers.flatMap(assemblyNamesIn))];
    return reached.some((t) => grants(t, names));
  };
  return reach;
}
