---
id: csharp-alias-two-blocks-edge
language: csharp
category: nested
expectation: edge
cites: "C# spec §14.5.2 (using alias directives — an alias is in scope in the namespace body that holds its directive)"
---

## Rule

Two namespace blocks of one file may each declare an alias of the same name. Each alias is in scope only inside its own block, so a use of `O` in the first block names the first block's target and a use in the second block names the second block's. The last directive of the file does not win.

## Files

```csharp path=src/c/Use.cs
namespace A { using O = X.Order; class C { O x; } }
namespace B { using O = Y.Order; class D { O y; } }
```

```csharp path=src/x/Order.cs
namespace X;
public class Order { }
```

```csharp path=src/y/Order.cs
namespace Y;
public class Order { }
```

## Expect

- src/c/Use.cs:1 -> node:x      # the directive and the use of O in block A bind X.Order
- src/c/Use.cs:2 -> node:y      # the directive and the use of O in block B bind Y.Order

## Why

One alias map per file lets the later block's alias replace the earlier one, so the first block's use is read against the wrong alias.
