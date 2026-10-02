---
id: csharp-out-declaration-qualified-type-edge
language: csharp
category: usage-site
expectation: edge
cites: "C# spec §12.17 (declaration expressions — `out T x` and typed deconstruction); §7.6.1 (namespace and type names — a qualified name with type arguments)"
---

## Rule

A declaration expression whose type is a qualified generic name names that type and each of its type arguments: `out Shop.Core.Box<Order> found` and a deconstruction element `(Shop.Core.Box<Customer> pair, int count) = …` each declare a variable of a real type. Only a declaration expression that declares nothing (the parser's reading of a comparison pair, csharp-comparison-pair-qualified-argument-silence) is ignored.

## Files

```csharp path=src/app/Lookup.cs
using Shop.Core;
class Lookup {
  bool Find(Cache cache) {
    return cache.TryGet("id", out Shop.Core.Box<Order> found);
  }
  void Split(Cache cache) {
    (Shop.Core.Box<Customer> pair, int count) = cache.Pair();
  }
}
```

```csharp path=src/core/Types.cs
namespace Shop.Core;
public class Box<T> {}
public class Order {}
public class Customer {}
```

## Expect

- src/app/Lookup.cs:4 -> node:core      # out Shop.Core.Box<Order> found: Box and Order bind Shop.Core
- src/app/Lookup.cs:7 -> node:core      # (Shop.Core.Box<Customer> pair, …) = …: Box and Customer bind Shop.Core

## Why

Ignoring a declaration expression that declares nothing must not swallow the qualified generic types of the ones that do.
