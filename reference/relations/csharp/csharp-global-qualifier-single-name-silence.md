---
id: csharp-global-qualifier-single-name-silence
language: csharp
category: trap
expectation: silence
cites: "C# spec §7.8 (global:: alias-qualified name — `global::I` and `global::I<A>` look `I` up in the global namespace only)"
---

## Rule

`global::Settings` and `global::Box<Order>` name types of the global namespace only. When the global namespace declares no such type, nothing binds, even when an enclosing namespace (`Shop`) declares a `Settings` and a `Box<T>`.

## Files

```csharp path=src/app/Use.cs
namespace Shop.App;
class C {
  global::Settings s;
  global::Box<int> b;
}
```

```csharp path=src/core/Types.cs
namespace Shop;
public class Settings {}
public class Box<T> {}
```

## Expect

- silence      # `global::` skips the enclosing namespace `Shop`; the global namespace declares neither type

## Why

`global::` exists to step past a nearer declaration of the same name; binding the nearer one anyway reports exactly the dependency the author wrote `global::` to avoid.
