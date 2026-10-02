---
id: csharp-top-level-program-explicit-partial-wins-edge
language: csharp
category: trap
expectation: edge
cites: "C# spec — top-level statements (the synthesized `Program` merges with a `partial class Program` the source declares); MS Learn — integration tests in ASP.NET Core (`public partial class Program { }` exposes the entry point to WebApplicationFactory)"
---

## Rule

A `Program` class the source declares in the global namespace (`public partial class Program { }`, the documented way to expose the entry point to `WebApplicationFactory<Program>`) is the binding of a bare `Program`. The implicit `Program` of another project's top-level statements (an Aspire app host, a worker) is only a fallback, read when no global `Program` is declared anywhere; it never competes with an explicit one.

## Files

```csharp path=src/web/Program.cs
var builder = WebApplication.CreateBuilder(args);
builder.Build().Run();
public partial class Program { }
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

- src/tests/ApiTests.cs:4 -> node:web      # the explicit partial Program of the web node binds; the app host's implicit Program does not compete

## Why

Counting the implicit `Program` as a declaration of its own would give the key two owners here and silence an edge the explicit declaration has always produced.
