---
id: csharp-alias-target-generic-arity-edge
language: csharp
category: import
expectation: edge
cites: "C# spec §14.5.2 (a using alias directive's target is read in the namespace body that holds it); §7.6.1 (the arity takes part in the lookup)"
---

## Rule

`using R = Result<int>;` inside `namespace App.Web { }`: `App.Result` (node core) is not generic, so the target binds the global `Result<T>` of node gen.

## Files

```csharp path=src/core/Result.cs
namespace App;
public class Result { }
```

```csharp path=src/gen/Result.cs
public class Result<T> { }
```

```csharp path=src/web/Api.cs
namespace App.Web {
  using R = Result<int>;
  public class Api { }
}
```

## Expect

- src/web/Api.cs:2 -> node:gen      # the alias target Result`1

## Why

An alias target kept no arity once its type arguments were stripped, so the nearer non-generic `App.Result` bound it, a false edge to node core.
