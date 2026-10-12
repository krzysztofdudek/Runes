---
id: csharp-unresolved-msbuild-property-reaches-everything-edge
language: csharp
category: dynamic
expectation: edge
cites: "MSBuild — properties are evaluated by the build; a path built from one cannot be read from the file alone"
---

## Rule

A reference path that uses an MSBuild property other than the two the file itself fixes (`$(MSBuildThisFileDirectory)`, `$(MSBuildProjectDirectory)`) cannot be resolved without evaluating the build: `$(RepoRoot)` may be defined in a props file, on the command line or in the environment. The project that holds it is read as open: it may reference anything, so no candidate is dropped for it, and nothing real is lost. The reading errs towards more reach, never less.

## Files

```xml path=src/Billing/Billing.csproj
<Project Sdk="Microsoft.NET.Sdk">
  <ItemGroup>
    <ProjectReference Include="$(RepoRoot)src\Common\Common.csproj" />
  </ItemGroup>
</Project>
```

```csharp path=src/Billing/Invoice.cs
using Shop.Common;
namespace Billing;
public class Invoice {
  public void Mix(List<int> lines) { lines.Shuffle(); }
}
```

```xml path=src/Common/Common.csproj
<Project Sdk="Microsoft.NET.Sdk"></Project>
```

```csharp path=src/Common/ListExtensions.cs
namespace Shop.Common;
public static class ListExtensions {
  public static void Shuffle<T>(this IList<T> items) { }
}
```

## Expect

- src/Billing/Invoice.cs:4 -> node:Common      # Billing is open: the unresolved $(RepoRoot) may well point at Common

## Why

A filter that guessed would trade a false edge for a false green; the one cost of reading a project as open is that its false edges stay, as they were before the reference graph was read.
