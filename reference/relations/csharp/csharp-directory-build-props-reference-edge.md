---
id: csharp-directory-build-props-reference-edge
language: csharp
category: usage-site
expectation: edge
cites: "MSBuild — Directory.Build.props is imported by every project below it, and its items are the project's own"
---

## Rule

A `<ProjectReference>` written in a `Directory.Build.props` applies to every project under it: MSBuild imports the file into each of them. Billing's project file says nothing about Common, but the props file above it does, so Billing reaches Common and the extension method declared there binds. MSBuild resolves a relative item path of an imported file against the project that is being built; it is the `$(MSBuildThisFileDirectory)` prefix, as written here, that makes the path relative to the props file.

## Files

```xml path=src/Directory.Build.props
<Project>
  <ItemGroup>
    <ProjectReference Include="$(MSBuildThisFileDirectory)Common\Common.csproj" />
  </ItemGroup>
</Project>
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

```xml path=src/Billing/Billing.csproj
<Project Sdk="Microsoft.NET.Sdk"></Project>
```

```csharp path=src/Billing/Invoice.cs
using Shop.Common;
namespace Billing;
public class Invoice {
  public void Mix(List<int> lines) { lines.Shuffle(); }
}
```

## Expect

- src/Billing/Invoice.cs:4 -> node:Common      # the reference comes from the props file above Billing

## Why

Solutions put the references every project shares into one props file; reading only the project files would lose all of them.
