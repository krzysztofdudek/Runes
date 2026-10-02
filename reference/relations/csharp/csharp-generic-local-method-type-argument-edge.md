---
id: csharp-generic-local-method-type-argument-edge
language: csharp
category: usage-site
expectation: edge
cites: "C# spec — method invocations (the type arguments of a generic method); §12.8.4 (simple names with a type-argument list)"
---

## Rule

A call to a generic method by its simple name, `Resolve<ShopDbContext>()`, carries the same type-argument references as a call through a receiver: each named type argument is a type reference, bound through the enclosing namespaces and the usings. The method name `Resolve` is not a type and is never emitted.

## Files

```csharp path=src/app/OrderTests.cs
using Shop.Core;
abstract class OrderTests {
  protected abstract T Resolve<T>();
  void Arrange() {
    var db = Resolve<ShopDbContext>();
  }
}
```

```csharp path=src/core/ShopDbContext.cs
namespace Shop.Core;
public class ShopDbContext {}
```

## Expect

- src/app/OrderTests.cs:5 -> node:core      # Resolve<ShopDbContext>(): the type argument binds Shop.Core.ShopDbContext

## Why

Test bases and service wrappers resolve dependencies through their own generic helpers; the type argument is the only place the test names the type it depends on.
