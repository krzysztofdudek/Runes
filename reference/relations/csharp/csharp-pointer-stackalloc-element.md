---
id: csharp-pointer-stackalloc-element
language: csharp
category: usage-site
expectation: edge
cites: "C# — unsafe pointer types §23; stackalloc operator; MS Learn — pointer types, stackalloc"
---

## Rule

A pointer type `Foo*` and a `stackalloc Foo[n]` each reference their ELEMENT type `Foo`. The `*` / `stackalloc` wrapper is unwrapped to the element type, which is resolved like any type reference, also when it is qualified. Under `using N;` the bare `Foo` acquires its `N.Foo` candidate. Each form stands on its own line, so neither edge can come from the other.

## Files

```csharp path=src/c/Use.cs
using N;
class C {
  unsafe void M(int n) {
    Foo* p = null;
    var s = stackalloc Foo[n];
    var q = stackalloc N.Qux[4];
  }
}
```

```csharp path=src/n/Foo.cs
namespace N;
public struct Foo {}
public struct Qux {}
```

## Expect

- src/c/Use.cs:4 -> node:n      # `Foo*` pointer element binds N.Foo (node n)
- src/c/Use.cs:5 -> node:n      # `stackalloc Foo[n]` element binds N.Foo (node n)
- src/c/Use.cs:6 -> node:n      # `stackalloc N.Qux[4]` qualified element binds N.Qux (node n)

## Why

The element type under a pointer/`stackalloc` wrapper is a real reference; not unwrapping the wrapper misses the edge. A `var` local initialised by `stackalloc` names its element type nowhere else.
