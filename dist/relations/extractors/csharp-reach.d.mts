import { type FileView } from '../file-view.mjs';
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
 * A file that another project compiles through a `Compile` item outside that project's directory (a linked file) is code of that project too: as a caller it sees what the linking project references, as a target it is seen by it (the linking project is open, so it reaches everything).
 *
 * Every path is matched segment by segment in any case (a Windows or macOS author's spelling builds there). Everything unknown fails OPEN: a reference, a `Directory.Build.*` name or an import that names a file of the repository this reader cannot find opens its project, and the answer then allows the candidate, so the worst case is the answer before this module existed.
 */
/** How one file sees another: `same` (one project), `reachable` (the other file's project is in the caller's closure), `unreachable` (it is not, and the closure is closed), `unknown` (the graph cannot say: no project facts exist for one of the files, or the caller's project reaches an open one, so it may see anything). A consumer that filters candidates keeps `unknown` like `reachable`; only a rule that must tell "the graph shows it" from "nothing is known" reads the difference. */
export type Reach = 'same' | 'reachable' | 'unreachable' | 'unknown';
/** Whether the project of `fromFile` can see the declarations of `targetFile` (repository-relative POSIX paths). See {@link buildCsharpReachability}. */
export type Reachability = (fromFile: string, targetFile: string) => Reach;
/**
 * The reference graph of the C# projects of a repository, as a predicate the resolver asks. `projectRoot` is the repository root the repo-relative `csFiles` are relative to; `options.files`, when given, is the view the project files are found and read through (see `FileView`): a project file the view does not list does not exist; without it the disk under `projectRoot` is read. A file not in `csFiles`, or under no project file, has no project facts, and a pair with such a file is `unknown`. Deterministic: the answer depends only on the files read.
 */
export declare function buildCsharpReachability(projectRoot: string, csFiles: Iterable<string>, options?: {
    files?: FileView;
}): Reachability;
