---
id: csharp-top-level-program-implicit-class-edge
language: csharp
category: usage-site
expectation: edge
cites: "C# spec — top-level statements (the compiler synthesizes the entry-point class `Program` in the global namespace, C# 10 and later); MS Learn — integration tests in ASP.NET Core (WebApplicationFactory<Program>)"
---

## Rule

A file with top-level statements compiles into a class named `Program` in the global namespace, although the source declares no such type. The file publishes that implicit class at its first statement as a fallback: a bare `Program` binds it when no explicit global `Program` (`public partial class Program { }`) is declared anywhere, which always takes precedence (csharp-top-level-program-explicit-partial-wins-edge). A test project's `WebApplicationFactory<Program>` therefore binds the web project's entry point.

## Files

```csharp path=src/web/Program.cs
var builder = WebApplication.CreateBuilder(args);
var app = builder.Build();
app.Run();
```

```csharp path=src/tests/ApiTests.cs
using Microsoft.AspNetCore.Mvc.Testing;
namespace Web.Tests;
public class ApiTests {
  private readonly WebApplicationFactory<Program> _factory = new();
}
```

## Expect

- src/tests/ApiTests.cs:4 -> node:web      # WebApplicationFactory<Program>: the implicit Program of the web project's top-level statements

## Why

`WebApplicationFactory<Program>` is the standard entry of ASP.NET Core integration tests, and `Program` is often the only web type a test project names. Two top-level `Program` files in different nodes stay ambiguous and silent when no project file says which one the referencing project sees (csharp-top-level-program-two-entries-silence), and bind the referenced one when it does (csharp-top-level-program-two-entries-referenced-edge).
