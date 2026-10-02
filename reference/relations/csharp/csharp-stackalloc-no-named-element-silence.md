---
id: csharp-stackalloc-no-named-element-silence
language: csharp
category: trap
expectation: silence
cites: "C# — stackalloc operator (an implicitly typed `stackalloc[] { … }` names no element type); §7.6.1 (a simple name inside a generic method names its type parameter first)"
---

## Rule

A `stackalloc` names a type of the repository only through a named element type. A predefined element (`stackalloc int[n]`), an implicitly typed `stackalloc[] { 1, 2 }`, and an element that is a type parameter in scope (`stackalloc T[n]` inside `M<T>()`) name none, even when an imported namespace declares a type `T`.

## Files

```csharp path=src/c/Use.cs
using N;
class C {
  unsafe void M<T>(int n) where T : unmanaged {
    var a = stackalloc int[n];
    var b = stackalloc[] { 1, 2 };
    var c = stackalloc T[n];
  }
}
```

```csharp path=src/n/T.cs
namespace N;
public struct T {}
```

## Expect

- silence      # no `stackalloc` above names a type of the repository

## Why

Reading the element of a `stackalloc` must not turn a predefined type, the implicit form or a type parameter into a dependency.
