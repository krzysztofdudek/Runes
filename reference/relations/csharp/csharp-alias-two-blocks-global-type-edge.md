---
id: csharp-alias-two-blocks-global-type-edge
language: csharp
category: nested
expectation: edge
cites: "C# spec §14.5.2 (using alias directives — an alias is in scope in the namespace body that holds its directive); §7.8 (namespace and type names — an alias of a nearer body wins over a type of the global namespace)"
---

## Rule

Two namespace blocks declare an alias `O` each, and the global namespace also declares a type `O`. The alias of the block that holds the use is in scope there and wins over the global type, which gets no edge from either block.

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

```csharp path=src/g/O.cs
public class O { }
```

## Expect

- src/c/Use.cs:1 -> node:x      # block A binds its alias, not the global O
- src/c/Use.cs:2 -> node:y      # block B binds its alias, not the global O

## Why

Judging block A's use against block B's alias puts it out of scope and lets the plain reading bind the global type, an edge the compiler does not bind.
