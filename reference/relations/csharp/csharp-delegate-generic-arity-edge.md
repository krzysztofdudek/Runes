---
id: csharp-delegate-generic-arity-edge
language: csharp
category: usage-site
expectation: edge
cites: "C# spec §21 (a generic delegate declaration); §7.6.1 (a name with K type arguments names only a type with K type parameters)"
---

## Rule

A generic delegate is declared with its arity, as a generic class is: ``App.Core.Callback`1``. `Callback<int>` names it; the bare `Callback`, which needs a type with no type parameters, does not.

## Files

```csharp path=src/core/Callback.cs
namespace App.Core;
public delegate void Callback<T>(T value);
```

```csharp path=src/web/Use.cs
using App.Core;
namespace App.Web;
public class Use {
  Callback<int> _a;
  Callback _b;
}
```

## Expect

- src/web/Use.cs:4 -> node:core      # Callback<int> names Callback`1; the bare Callback on line 5 names nothing

## Why

The arity belongs to the key of every declared type, a delegate included.
