---
id: csharp-program-referenced-partial-edge
language: csharp
category: usage-site
expectation: edge
cites: "MSBuild — a project sees only the assemblies it references; C# spec — top-level statements"
---

## Rule

Of the global `Program` classes of a repository, a project binds the one of a project it references, whether that one is declared or synthesized from top-level statements. The tests reference Web only, whose `Program` is the implicit one; Legacy declares `public partial class Program { }` but is out of their reach, and an explicit class no longer outranks an implicit one that is the only one in reach.

## Files

```xml path=src/tests/Tests.csproj
<Project Sdk="Microsoft.NET.Sdk">
  <ItemGroup>
    <ProjectReference Include="..\web\Web.csproj" />
  </ItemGroup>
</Project>
```

```csharp path=src/tests/ApiTests.cs
using Microsoft.AspNetCore.Mvc.Testing;
namespace Tests;
public class ApiTests {
  private readonly WebApplicationFactory<Program> _factory = new();
}
```

```xml path=src/web/Web.csproj
<Project Sdk="Microsoft.NET.Sdk.Web"></Project>
```

```csharp path=src/web/Program.cs
var builder = WebApplication.CreateBuilder(args);
builder.Build().Run();
```

```xml path=src/legacy/Legacy.csproj
<Project Sdk="Microsoft.NET.Sdk"></Project>
```

```csharp path=src/legacy/Program.cs
public partial class Program { }
```

## Expect

- src/tests/ApiTests.cs:4 -> node:web      # the only Program in reach is Web's

## Why

Before the references were read the unreachable explicit class won, so the edge went to the wrong project.
