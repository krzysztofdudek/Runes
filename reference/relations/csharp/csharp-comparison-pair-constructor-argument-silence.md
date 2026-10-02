---
id: csharp-comparison-pair-constructor-argument-silence
language: csharp
category: trap
expectation: silence
cites: "C# spec §6.2.5 (grammar ambiguities); §12.17 (declaration expressions are only `out` arguments and deconstruction targets)"
---

## Rule

The same misparse inside the arguments of an object creation, `new Bounds(i < Count, j > Max)`, is two comparisons and names no type. Only an `out` argument or a deconstruction element declares a variable.

## Files

```csharp path=src/app/Factory.cs
using Shop.Core;
class Factory {
  const int Count = 2;
  const int Max = 3;
  object M(int i, int j) => new Bounds(i < Count, j > Max);
}
```

```csharp path=src/core/Count.cs
namespace Shop.Core;
public class Count {}
```

## Expect

- silence      # `i < Count, j > Max` are two comparisons, not a declaration of type `i<Count, j>`

## Why

A constructor's argument list is parsed like a call's, so it carries the same misparse; the constant `Count` must not bind the type of that name.
