---
id: csharp-enclosing-nested-type-before-global-alias-edge
language: csharp
category: nested
expectation: edge
cites: "C# spec §7.6.1 (a nested type of an enclosing type is found before any namespace member and any using alias); §14.5.2 (a using alias directive)"
---

## Rule

A project-wide `global using Result = Lib.Result;` and a nested `Handler.Result`: inside `Handler`, `Result` is the nested type. The alias directive itself still names `Lib.Result`.

## Files

```csharp path=src/web/GlobalUsings.cs
global using Result = Lib.Result;
```

```csharp path=src/web/Handler.cs
namespace App.Web;
public class Handler {
  public record Result(int Id);
  public Result Run() => new Result(1);
}
```

```csharp path=src/lib/Result.cs
namespace Lib;
public class Result { }
```

## Expect

- src/web/GlobalUsings.cs:1 -> node:lib      # the alias target; Handler.cs:4 binds Handler+Result, no edge

## Why

An alias of the compilation unit is read after every enclosing namespace, and the nested types of the enclosing types come before all of them.
