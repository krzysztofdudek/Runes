---
id: csharp-enclosing-nested-type-before-using-silence
language: csharp
category: nested
expectation: silence
cites: "C# spec §7.6.1 (the nested types of each enclosing type are read before the namespaces and the using directives)"
---

## Rule

Inside `GetOrder`, the bare `Result` names the nested `GetOrder.Result`, never `App.Shared.Result` that `using App.Shared;` imports, in a type position (the return type) and in `new Result(1)`.

## Files

```csharp path=src/web/GetOrder.cs
using App.Shared;
namespace App.Web;
public static class GetOrder {
  public record Result(int Id);
  public static Result Run() => new Result(1);
}
```

```csharp path=src/shared/Result.cs
namespace App.Shared;
public class Result { }
```

## Expect

- silence      # Result binds GetOrder+Result in node web

## Why

A using directive is the farthest reading of a simple name; the nested types of the enclosing types are the nearest, after the type parameters.
