---
id: csharp-alias-colon-colon-generic-middle-arity-edge
language: csharp
category: nested
expectation: edge
cites: "C# spec §7.8.1 (a name with K type arguments names a type with K type parameters); §14.8 (namespace alias qualifiers)"
---

## Rule

In `S::A<int>.B` the middle segment `A<int>` keeps its arity: it names the generic ``A`1`` of the aliased namespace, and `B` its nested type, never the non-generic `A` beside it.

## Files

```csharp path=src/use/Use.cs
using S = App.Lib;
class C {
  S::A<int>.B b;
}
```

```csharp path=src/lib/A.cs
namespace App.Lib;
public class A<T> { public class B { } }
```

```csharp path=src/other/A.cs
namespace App.Lib;
public class A { public class B { } }
```

## Expect

- src/use/Use.cs:3 -> node:lib      # App.Lib.A`1+B; the non-generic App.Lib.A (node other) has the wrong arity

## Why

Pins the arity of a generic middle segment after an alias qualifier, which a false edge to the non-generic type would lose.
