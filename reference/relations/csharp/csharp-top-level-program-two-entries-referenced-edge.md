---
id: csharp-top-level-program-two-entries-referenced-edge
language: csharp
category: trap
expectation: edge
cites: "C# spec — top-level statements (one synthesized `Program` per project); MSBuild — a project sees only the assemblies it references"
---

## Rule

Every project with top-level statements has its own implicit global `Program`, so a solution with a web project and an Aspire app host holds two of them. A test project sees only the one of the project it references: the tests reference Web, so `WebApplicationFactory<Program>` names Web's `Program` and gives the edge to Web, the app host being out of its reach. Where no project file says which entry the tests see, the reference stays silent (csharp-top-level-program-two-entries-silence).

## Files

```xml path=src/web/Web.csproj
<Project Sdk="Microsoft.NET.Sdk.Web"></Project>
```

```csharp path=src/web/Program.cs
var builder = WebApplication.CreateBuilder(args);
builder.Build().Run();
```

```xml path=src/apphost/AppHost.csproj
<Project Sdk="Microsoft.NET.Sdk"></Project>
```

```csharp path=src/apphost/Program.cs
var builder = DistributedApplication.CreateBuilder(args);
builder.Build().Run();
```

```xml path=src/tests/Tests.csproj
<Project Sdk="Microsoft.NET.Sdk">
  <ItemGroup>
    <ProjectReference Include="..\web\Web.csproj" />
  </ItemGroup>
</Project>
```

```csharp path=src/tests/ApiTests.cs
using Microsoft.AspNetCore.Mvc.Testing;
namespace Web.Tests;
public class ApiTests {
  private readonly WebApplicationFactory<Program> _factory = new();
}
```

## Expect

- src/tests/ApiTests.cs:4 -> node:web      # the tests reference Web only: its implicit Program is the one they see

## Why

Aspire, worker and migrator solutions often have several top-level entry points; without the project references the one real test → web dependency was lost to the ambiguity.
