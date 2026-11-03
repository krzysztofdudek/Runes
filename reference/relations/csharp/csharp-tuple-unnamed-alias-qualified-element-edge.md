---
id: csharp-tuple-unnamed-alias-qualified-element-edge
language: csharp
category: usage-site
expectation: edge
cites: "C# spec §7.8 (namespace alias qualifier `S::I`); §8.3.11 (tuple types: an element may be unnamed)"
---

## Rule

An unnamed tuple element beside a named one in a type argument may be written after a using alias (`new List<(int I, S::Core.Customer)>(n)`, `using S = Shop;`). The grammar reads that type argument as comparisons around a tuple expression, and the element as a member access over `S::Core`; it is the type `S::Core.Customer`, rewritten onto the namespace the alias names and read there only, as in a type position. A same-named type of the enclosing namespace is never it, and an extern alias binds nothing.

## Files

```csharp path=src/web/Use.cs
using S = Shop;
namespace Shop.Web;
class C { void M() { var l = new List<(int I, S::Core.Customer)>(4); } }
```

```csharp path=src/core/Customer.cs
namespace Shop.Core;
public class Customer { }
```

```csharp path=src/decoy/Customer.cs
namespace Shop.Web.Core;
public class Customer { }
```

## Expect

- src/web/Use.cs:3 -> node:core     # `S::Core.Customer` is Shop.Core.Customer, never Shop.Web.Core.Customer (node decoy)

## Why

The member-access reading of a tuple element gave nothing after a using alias, while its comment said a member access cannot spell one: the grammar does spell it that way, so the element's type was lost.
