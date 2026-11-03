---
id: csharp-generic-arity-unbound-typeof-edge
language: csharp
category: usage-site
expectation: edge
cites: "C# spec §12.8.18 (the typeof operator: an unbound generic type name, `Repo<,>`, has the arity of its commas plus one); §7.6.1"
---

## Rule

A control: `typeof(Repo<,>)` names the generic type with two type parameters, which node pair declares, and never `Repo<T>` of node single, in the same namespace.

## Files

```csharp path=src/single/Repo.cs
namespace Data;
public class Repo<T> { }
```

```csharp path=src/pair/Repo.cs
namespace Data;
public class Repo<TKey, TValue> { }
```

```csharp path=src/app/Setup.cs
using Data;
class Setup {
  object M() => typeof(Repo<,>);
}
```

## Expect

- src/app/Setup.cs:3 -> node:pair      # Data.Repo`2

## Why

An unbound generic name is written without its type arguments, so its arity is read from the commas between the brackets.
