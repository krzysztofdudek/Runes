---
id: csharp-global-alias-beside-block-alias-edge
language: csharp
category: import
expectation: edge
cites: "C# spec §14.5.2 (using alias directives — an alias reaches only the body that holds it); C# 10 global using alias (§14.5, project-wide scope)"
---

## Rule

A `global using O = ...;` alias is project-wide, and an alias `O` declared inside one namespace block reaches only that block. A use of `O` outside that block still names the project-wide alias.

## Files

```csharp path=src/g/Globals.cs
global using O = Y.Order;
```

```csharp path=src/c/Use.cs
namespace A { using O = X.Order; class C { O x; } }
namespace B { class D { O y; } }
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

- src/g/Globals.cs:1 -> node:y      # the directive names Y.Order
- src/c/Use.cs:1 -> node:x          # the block alias wins inside block A
- src/c/Use.cs:2 -> node:y          # outside block A the project-wide alias is the one in scope

## Why

Letting an alias of one block hide the project-wide alias everywhere in the file drops the edge.
