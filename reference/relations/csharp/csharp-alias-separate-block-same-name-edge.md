---
id: csharp-alias-separate-block-same-name-edge
language: csharp
category: nested
expectation: edge
cites: "C# spec §14.5.2 (using alias directives — an alias reaches only the compilation unit or namespace body that holds its directive)"
---

## Rule

A using alias is in scope in the namespace body that holds its directive, not in every body of the same namespace name. When a file writes `namespace A` twice as separate blocks, the alias of the first reaches only the first, so the use of `O` in the second block does not see it and names the global type `O`.

## Files

```csharp path=src/c/Use.cs
namespace A { using O = X.Order; class C { O x; } }
namespace A { class D { O y; } }
```

```csharp path=src/x/Order.cs
namespace X;
public class Order { }
```

```csharp path=src/g/O.cs
public class O { }
```

## Expect

- src/c/Use.cs:1 -> node:x      # the directive and the use in the first block bind X.Order
- src/c/Use.cs:2 -> node:g      # the second block has no alias, so O is the global type

## Why

Matching an alias to a use by the namespace name lets the alias leak into a separate block of the same namespace and hide the global type the compiler binds there.
