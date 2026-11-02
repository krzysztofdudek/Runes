---
id: csharp-alias-separate-dotted-block-edge
language: csharp
category: nested
expectation: edge
cites: "C# spec §14.5.2 (using alias directives — an alias reaches only the compilation unit or namespace body that holds its directive)"
---

## Rule

A block `namespace A.B { }` written apart from `namespace A { using O = X.Order; }` is a body of its own: the alias of the block of `A` does not reach it, even though `A.B` is inside the namespace `A`. The use of `O` there names the global type `O`.

## Files

```csharp path=src/c/Use.cs
namespace A { using O = X.Order; class C { O x; } }
namespace A.B { class D { O y; } }
```

```csharp path=src/x/Order.cs
namespace X;
public class Order { }
```

```csharp path=src/g/O.cs
public class O { }
```

## Expect

- src/c/Use.cs:1 -> node:x      # the directive and the use in the block of A bind X.Order
- src/c/Use.cs:2 -> node:g      # the separate block of A.B has no alias, so O is the global type

## Why

The namespace A.B is nested in A by name only; the compiler gives each block its own using directives, so an alias of a separate block must not reach it.
