---
id: csharp-generic-method-name-not-a-type-silence
language: csharp
category: trap
expectation: silence
cites: "C# spec — method invocations (the method group is looked up among members, not types); §12.8.4 (simple names)"
---

## Rule

In a generic method call `Option<int>()` or `b.Validator<int>()`, the name before the type-argument list is a METHOD, not a type. Only the type arguments are type references. A type of the same name declared in another node (`Shop.Core.Option`, `Shop.Core.Validator`) must not be bound through the method name, even under `using Shop.Core;`. Here the type arguments are predefined types, so nothing is referenced.

## Files

```csharp path=src/app/Use.cs
using Shop.Core;
class Use {
  T Option<T>() => default;
  void M(Builder b) {
    Option<int>();
    b.Validator<int>();
  }
}
```

```csharp path=src/core/Types.cs
namespace Shop.Core;
public class Option {}
public class Validator {}
```

## Expect

- silence      # the method names Option and Validator are not type references; the type arguments are predefined

## Why

A generic type's base name is a reference (`Repository<Order>` depends on `Repository`), so treating a generic method name the same way would turn every call to a method named like a type into a false edge.
