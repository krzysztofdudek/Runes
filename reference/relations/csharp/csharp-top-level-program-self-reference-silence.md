---
id: csharp-top-level-program-self-reference-silence
language: csharp
category: trap
expectation: silence
cites: "C# spec — top-level statements (the synthesized `Program` is a member of the global namespace, found before any other reading); §7.6 (namespace and type names — the global namespace's own members before using directives); MS Learn — user secrets (AddUserSecrets<Program>)"
---

## Rule

Inside a file of top-level statements, a bare `Program` (`AddUserSecrets<Program>()`, `typeof(Program)`, `Program.Helper()`) names that file's own implicit class: the compiler finds it in the global namespace before any using or any other project's type. It binds nothing else, even when another node declares an explicit global `public partial class Program { }`.

## Files

```csharp path=src/web/Program.cs
var builder = WebApplication.CreateBuilder(args);
builder.Build().Run();
public partial class Program { }
```

```csharp path=src/worker/Program.cs
var builder = Host.CreateApplicationBuilder(args);
builder.Configuration.AddUserSecrets<Program>();
var asm = typeof(Program).Assembly;
builder.Build().Run();
```

## Expect

- silence      # the worker's `Program` is its own implicit class, not the web node's explicit partial Program

## Why

A worker, a migrator or an app host routinely names its own entry class (user secrets, logging categories, assembly lookups). Reading that as the web project's `Program` would invent a worker → web dependency. Another file of the same project naming `Program` (`ILogger<Program>` in a class file) still needs the project-reference graph to tell the two classes apart, which is not read here.
