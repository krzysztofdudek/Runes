---
id: csharp-global-alias-cross-project-collision-edge
language: csharp
category: trap
expectation: edge
cites: "C# spec §14.5 (global using alias directives are project-wide); CS1537 (duplicate alias within one compilation)"
---

## Rule

When the pass cannot tell projects apart (no `.csproj` in the tree, so every file shares one implicit project) and two files define the same global alias name with different targets, each directive still names its own real type, so each directive gives its edge (D3 b, 185). The alias has no single binding for a use, so every reference led by that alias stays silent. Neither target is picked for a use.

## Files

```csharp path=src/billing/GlobalUsings.cs
global using Money = Billing.Model.Money;
```

```csharp path=src/shipping/GlobalUsings.cs
global using Money = Shipping.Model.Money;
```

```csharp path=src/billing/Invoice.cs
namespace Billing;
public class Invoice { Money _total; }
```

```csharp path=src/bmodel/Money.cs
namespace Billing.Model;
public class Money {}
```

```csharp path=src/smodel/Money.cs
namespace Shipping.Model;
public class Money {}
```

## Expect

- src/billing/GlobalUsings.cs:1 -> node:bmodel    # the directive names Billing.Model.Money
- src/shipping/GlobalUsings.cs:1 -> node:smodel   # the directive names Shipping.Model.Money
# `Money _total` in Invoice.cs has two project-wide alias targets → ambiguous → no edge (never last-writer-wins)

## Why

Last-writer-wins bound Billing's `Money` to `Shipping.Model.Money` (node smodel), a wrong target that depended on file order. Inside one real project the duplicate alias is a compile error, so in practice the collision means two projects the tool could not separate. Silence is the only answer that cannot be wrong. With project files present, csharp-global-alias-per-project-edge binds each project's own alias.
