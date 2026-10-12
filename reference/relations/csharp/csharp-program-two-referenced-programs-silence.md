---
id: csharp-program-two-referenced-programs-silence
language: csharp
category: trap
expectation: silence
cites: "C# spec — a name found in two referenced assemblies is ambiguous (error CS0433)"
---

## Rule

When a project references two projects that both have a global `Program`, one declared (`public partial class Program { }`) and one synthesized from top-level statements, the compiler sees one name defined twice and reports CS0433, so the reference has no binding. The explicit class does not outrank the implicit one across projects: for a reader that cannot tell which the file meant, the reference stays silent.

## Files

```xml path=src/tests/Tests.csproj
<Project Sdk="Microsoft.NET.Sdk">
  <ItemGroup>
    <ProjectReference Include="..\web\Web.csproj" />
    <ProjectReference Include="..\api\Api.csproj" />
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

```xml path=src/api/Api.csproj
<Project Sdk="Microsoft.NET.Sdk.Web"></Project>
```

```csharp path=src/api/Startup.cs
public partial class Program { }
```

## Expect

- silence      # two referenced projects, one global Program each: ambiguous

## Why

Binding the explicit one would be a guess, and a wrong guess is a false edge that blocks the gate.
