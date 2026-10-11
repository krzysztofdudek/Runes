---
id: csharp-nameof-no-edge-silence
language: csharp
category: dynamic
expectation: silence
cites: "C# — nameof operator (string-valued); C# 14 unbound-generic nameof; MS Learn — nameof"
---

## Rule

`nameof(X)` evaluates to the STRING `"X"`; its canonical purpose is to produce a
name without taking a hard dependency on the type. Inside `nameof` a simple name binds
a member, a local or an inherited member before it binds a type, and an inherited member
is invisible to a one-file reading (a C# property named like its type is common). So an
edge from `nameof(X)` could be false, and `nameof` is treated like a string producer: it
emits no type edge, whether its operand is a type, a local, a member, or the C# 14 unbound
form `nameof(List<>)`. This is the documented silence of 185 (D3 b): the alias directive
`using F = A.B.Foo;` gives its edge, `nameof(Foo)` does not.

## Files

```csharp path=src/c/Use.cs
using N;
class C { void M() { var n = nameof(X); } }
```

```csharp path=src/n/X.cs
namespace N;
public class X {}
```

## Expect

- silence      # `nameof(X)` yields a string, not a static type dependency → no edge

## Why

Binding a type edge from `nameof` would invent a dependency the language deliberately
avoids; silencing it preserves zero false positives.
