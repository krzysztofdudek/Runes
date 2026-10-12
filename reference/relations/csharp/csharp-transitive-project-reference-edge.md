---
id: csharp-transitive-project-reference-edge
language: csharp
category: usage-site
expectation: edge
cites: "MSBuild — project references are transitive in SDK-style projects"
---

## Rule

Project references are transitive: Tests references Web, Web references Shared, so Tests sees Shared's types and an extension method declared there binds. The closure is read through any number of references and survives a reference cycle between two projects.

## Files

```xml path=src/Shared/Shared.csproj
<Project Sdk="Microsoft.NET.Sdk">
  <ItemGroup>
    <ProjectReference Include="..\Web\Web.csproj" />
  </ItemGroup>
</Project>
```

```csharp path=src/Shared/StringExtensions.cs
namespace Shop.Text;
public static class StringExtensions {
  public static string Slugify(this string value) => value;
}
```

```xml path=src/Web/Web.csproj
<Project Sdk="Microsoft.NET.Sdk">
  <ItemGroup>
    <ProjectReference Include="../Shared/Shared.csproj" />
  </ItemGroup>
</Project>
```

```csharp path=src/Web/Page.cs
namespace Web;
public class Page { }
```

```xml path=src/Tests/Tests.csproj
<Project Sdk="Microsoft.NET.Sdk">
  <ItemGroup>
    <ProjectReference Include="..\Web\Web.csproj" />
  </ItemGroup>
</Project>
```

```csharp path=src/Tests/SlugTests.cs
using Shop.Text;
namespace Tests;
public class SlugTests {
  public string Run(string title) { return title.Slugify(); }
}
```

## Expect

- src/Tests/SlugTests.cs:4 -> node:Shared      # Tests -> Web -> Shared (and Shared -> Web back: a cycle does not loop)

## Why

A closure of direct references only would drop every edge a layered solution has two projects away.
