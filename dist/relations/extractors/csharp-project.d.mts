/**
 * C# PROJECT SCOPING of global usings (M6/M7).
 *
 * A `global using N;` (or `global using A = N.T;`) applies to every file of the PROJECT that
 * declares it — the compilation unit an MSBuild `.csproj` builds — and to nothing else. A
 * repository usually holds several projects (Api, Worker, Domain, Tests…), each with its own
 * `GlobalUsings.cs`. Aggregating every file's global usings repo-wide leaks one project's imports
 * into another: a bare name in Worker that really binds to an external package could bind to a
 * type Api imports globally, a false edge; and two projects defining the same global alias name
 * would collide last-writer-wins, an order-dependent wrong edge.
 *
 * So the project of a C# file is the NEAREST ancestor directory (the file's own directory
 * included, up to the repository root) that contains a `*.csproj`. Global usings and global
 * aliases are aggregated per project and applied only to that project's files. A project also
 * contributes the global usings MSBuild itself generates from its project files:
 *   - `<Using Include="N" />` items (with `Alias="A"` a global alias; `Static="true"` imports
 *     static members and is not a namespace import, so it is skipped), and `<Using Remove="N" />`
 *     removing an earlier item — read from the nearest `Directory.Build.props`, then the
 *     `.csproj` file(s), then the nearest `Directory.Build.targets`, in MSBuild's import order;
 *   - the SDK's implicit usings when `<ImplicitUsings>` is `enable`/`true`: the namespaces the
 *     .NET SDK named by `<Project Sdk="…">` generates. They are external namespaces, so they only
 *     ever bind an in-repo type the repository itself declares inside them (for example an
 *     extension class put in `Microsoft.Extensions.DependencyInjection`, the ASP.NET convention).
 *
 * Files under no `.csproj` at all (loose sources, or a repository that keeps no project files
 * in the tree) share ONE implicit project, which is what the pass did for every file before
 * project scoping — the behaviour for such a layout is unchanged.
 *
 * The XML reading is deliberately narrow — the `<Using>` items and the two properties — and never
 * evaluates MSBuild conditions or imports beyond the two auto-imported `Directory.Build.*` files.
 * An item hidden behind a condition is still read, which can only add a namespace candidate that
 * resolves to nothing unless the namespace really declares the type; it cannot invent an alias
 * collision the compiler would reject.
 */
/** One C# file's own global-using facts (from its cached extract). */
export interface CsharpGlobalFacts {
    /** Repo-relative POSIX path of the `.cs` file. */
    path: string;
    /** Namespace prefixes of the file's own `global using N;` directives. */
    globalPrefixes: readonly string[];
    /** `[alias, target]` pairs of the file's own `global using A = N.T;` directives. */
    globalAliases: Iterable<readonly [string, string]>;
}
/** The project-wide scope injected into a file's candidate assembly. */
export interface CsharpProjectScope {
    /** Every global namespace import of the file's project (declared in sources or in MSBuild). */
    usings: string[];
    /** Every global alias of the file's project; one name may appear with 2+ targets (ambiguous). */
    aliases: Array<[string, string]>;
}
/**
 * Build the per-file project scope for every C# file. `projectRoot` is the absolute repository
 * root the repo-relative `files[].path` values are relative to. Deterministic: directory listings
 * are sorted, projects are processed in sorted order, and each returned list is in a stable order.
 */
export declare function buildCsharpProjectScopes(projectRoot: string, files: readonly CsharpGlobalFacts[]): Map<string, CsharpProjectScope>;
