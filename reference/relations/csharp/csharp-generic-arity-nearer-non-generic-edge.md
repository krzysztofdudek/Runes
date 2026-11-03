---
id: csharp-generic-arity-nearer-non-generic-edge
language: csharp
category: usage-site
expectation: edge
cites: "C# spec §7.6.1 (namespace and type names: a name with K type arguments names only a type with K type parameters)"
---

## Rule

`Result<int>` needs a type with one type parameter. `App.Result` (node core), in an enclosing namespace, has none, so C# reads on and binds `Lib.Result<T>` (node lib) through the using.

## Files

```csharp path=src/core/Result.cs
namespace App;
public class Result { }
```

```csharp path=src/lib/Result.cs
namespace Lib;
public class Result<T> { }
```

```csharp path=src/web/Api.cs
using Lib;
namespace App.Web;
public class Api {
  public Result<int> Get() => null;
}
```

## Expect

- src/web/Api.cs:4 -> node:lib      # Result`1, never the nearer non-generic App.Result

## Why

A C# type key carries the arity as the .NET reflection name writes it: `App.Result` for the non-generic type, ``Lib.Result`1`` for `Result<T>`. Without it the nearer `App.Result` bound the generic use, a false edge to node core.
