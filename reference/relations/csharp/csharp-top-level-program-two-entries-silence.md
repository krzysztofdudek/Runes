---
id: csharp-top-level-program-two-entries-silence
language: csharp
category: trap
expectation: silence
cites: "C# spec — top-level statements (one synthesized `Program` per project); MS Learn — .NET Aspire app host (a second project with top-level statements)"
---

## Rule

Every project with top-level statements has its own implicit global `Program`. When two nodes each hold such a file (a web project and an Aspire app host, a worker and a migrator) and no global `Program` is declared explicitly, the implicit class has two owners, and a bare `Program` reference cannot be bound by name alone: which one the referencing project sees depends on its project references, and this layout has no project files to say. The reference stays silent. (With project files that say which entry the tests reference, it binds that one: csharp-top-level-program-two-entries-referenced-edge.) (An explicit `public partial class Program { }` in one of them binds instead: csharp-top-level-program-explicit-partial-wins-edge.)

## Files

```csharp path=src/web/Program.cs
var builder = WebApplication.CreateBuilder(args);
builder.Build().Run();
```

```csharp path=src/apphost/Program.cs
var builder = DistributedApplication.CreateBuilder(args);
builder.Build().Run();
```

```csharp path=src/tests/ApiTests.cs
using Microsoft.AspNetCore.Mvc.Testing;
namespace Web.Tests;
public class ApiTests {
  private readonly WebApplicationFactory<Program> _factory = new();
}
```

## Expect

- silence      # the implicit Program has two owners (web, apphost) and no explicit one exists → ambiguous → no edge

## Why

Picking either entry point would be a guess, and a wrong guess is a false edge that blocks the gate. Silence loses the real edge only where nothing says which entry the referencing project sees; project files that do say it give the edge (csharp-top-level-program-two-entries-referenced-edge).
