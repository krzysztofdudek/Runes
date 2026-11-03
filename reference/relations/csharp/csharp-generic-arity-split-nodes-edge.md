---
id: csharp-generic-arity-split-nodes-edge
language: csharp
category: usage-site
expectation: edge
cites: "C# spec §7.6.1 (the arity takes part in the lookup); §8.4 (constructed types)"
---

## Rule

`Result` lives in node a and `Result<T>` in node b, in one namespace. `Result` binds node a, and `Result<int>` binds node b.

## Files

```csharp path=src/a/Result.cs
namespace Shop.Results;
public class Result { }
```

```csharp path=src/b/ResultOfT.cs
namespace Shop.Results;
public class Result<T> { }
```

```csharp path=src/app/Uses.cs
using Shop.Results;
class Uses {
  Result _r;
  Result<int> _ri;
}
```

## Expect

- src/app/Uses.cs:3 -> node:a      # Shop.Results.Result
- src/app/Uses.cs:4 -> node:b      # Shop.Results.Result`1

## Why

The `Result` and `Result<T>`, `Entity` and `Entity<TKey>`, `IRepository` and `IRepository<T>` pairs are often split across projects that share a namespace. Two keys without arity were one key declared by two nodes, which silenced both references.
