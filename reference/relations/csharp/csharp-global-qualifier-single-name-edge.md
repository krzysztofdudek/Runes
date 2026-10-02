---
id: csharp-global-qualifier-single-name-edge
language: csharp
category: usage-site
expectation: edge
cites: "C# spec §7.8 (global:: alias-qualified name — `global::I` looks `I` up in the global namespace only); top-level statements (the synthesized `Program` is a member of the global namespace); MS Learn — integration tests (WebApplicationFactory<Program>)"
---

## Rule

`global::` with a single name after it, `global::Settings` or `global::Program`, names a type of the global namespace and nothing else: the enclosing namespaces are skipped, so `Shop.Settings` or `Shop.Program` never binds, even though a bare `Settings` written in `namespace Shop.Tests` would find them first. A `global::Program` may name the class the compiler synthesizes for a file of top-level statements, which lives in the global namespace.

## Files

```csharp path=src/tests/Fixture.cs
namespace Shop.Tests;
public class Fixture : WebApplicationFactory<global::Program> {
  public global::Settings Config;
}
```

```csharp path=src/web/Program.cs
var app = WebApplication.Create(args);
app.Run();
```

```csharp path=src/legacy/Legacy.cs
namespace Shop;
public class Program { }
public class Settings { }
```

```csharp path=src/config/Settings.cs
public class Settings { }
```

## Expect

- src/tests/Fixture.cs:2 -> node:web        # global::Program is the implicit Program of the top-level statements, not Shop.Program
- src/tests/Fixture.cs:3 -> node:config     # global::Settings is the global Settings, not Shop.Settings

## Why

`WebApplicationFactory<global::Program>` is how an integration-test project inside a namespace that has its own `Program` names the web app's entry class. Reading the name like a bare one bound the nearer namespace's type: a false edge to the wrong node and a missed edge to the right one.
