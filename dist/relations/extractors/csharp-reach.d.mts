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
/**
 * The reference graph of the C# projects of a repository, as a predicate the resolver asks. `projectRoot` is the repository root the repo-relative `csFiles` are relative to; `options.files`, when given, is the view the project files are found and read through (see `FileView`): a project file the view does not list does not exist; without it the disk under `projectRoot` is read. A file not in `csFiles`, or under no project file, has no project facts, and a pair with such a file is `unknown`. Deterministic: the answer depends only on the files read.
 */
export declare function buildCsharpReachability(projectRoot: string, csFiles: Iterable<string>, options?: {
    files?: FileView;
}): Reachability;
