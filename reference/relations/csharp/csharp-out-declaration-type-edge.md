---
id: csharp-out-declaration-type-edge
language: csharp
category: usage-site
expectation: edge
cites: "C# spec §12.17 (declaration expressions — `out T x` and typed deconstruction)"
---

## Rule

A declaration expression names its type: an `out Order found` argument and a typed deconstruction `(Order first, Customer second) = …` each declare a variable of a named type, a real type reference. Under `using Shop.Core;` the bare type binds `Shop.Core.Order`. `out var found` names no type.

## Files

```csharp path=src/app/Lookup.cs
using Shop.Core;
class Lookup {
  bool Find(Cache cache) {
    return cache.TryGet("id", out Order found);
  }
  void Split(Cache cache) {
    (Customer first, int count) = cache.Pair();
    cache.TryGet("id", out var other);
  }
}
```

```csharp path=src/core/Types.cs
namespace Shop.Core;
public class Order {}
public class Customer {}
```

## Expect

- src/app/Lookup.cs:4 -> node:core      # out Order found: the declared type binds Shop.Core.Order
- src/app/Lookup.cs:7 -> node:core      # (Customer first, int count) = …: typed deconstruction binds Shop.Core.Customer

## Why

`TryGet(…, out T x)` and `TryParse` patterns are common, and the `out` declaration is often the only place a caller names the type it receives.
