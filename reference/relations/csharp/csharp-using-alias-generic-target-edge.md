---
id: csharp-using-alias-generic-target-edge
language: csharp
category: import
expectation: edge
cites: "C# spec §14.5.2 (using alias directives; C# 12 lets the target be any type, a closed generic among them)"
---

## Rule

A using alias to a closed generic type (`using R = Shop.Core.Repo<Shop.Core.Order>;`) depends on the generic type itself and on each type argument, whether or not the alias is used. The container is named by its plain dotted name, the type arguments stripped as declaration keys carry no arity, and each type argument is a reference of its own.

## Files

```csharp path=src/c/Use.cs
using R = Shop.Core.Repo<Shop.Core.Order>;
class C { }
```

```csharp path=src/r/Repo.cs
namespace Shop.Core;
public class Repo<T> { }
```

```csharp path=src/o/Order.cs
namespace Shop.Core;
public class Order { }
```

## Expect

- src/c/Use.cs:1 -> node:r     # the container Shop.Core.Repo gets its edge although the alias is never used
- src/c/Use.cs:1 -> node:o     # the type argument Shop.Core.Order keeps its edge

## Why

Dropping the container left the alias to a repository type invisible while its argument showed, so a graph could miss the very dependency the directive exists to spell.
