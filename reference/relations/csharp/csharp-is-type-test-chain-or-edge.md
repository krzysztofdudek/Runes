---
id: csharp-is-type-test-chain-or-edge
language: csharp
category: usage-site
expectation: edge
cites: "C# — the `is` type test and the `||` operator; MS Learn — patterns (a type pattern after `is`)"
---

## Rule

`x is A || x is B` tests two types, and each is a reference: the type of the first test gives its edge as well as the type of the second, whatever the grammar makes of the `||` between them. A chain of three or more tests gives an edge for each.

## Files

```csharp path=src/c/Use.cs
using N;
class C {
  bool M(object o) => o is First || o is Second;
  bool P(object o) => o is First || o is Second || o is Third;
}
```

```csharp path=src/first/First.cs
namespace N;
public class First {}
```

```csharp path=src/second/Second.cs
namespace N;
public class Second {}
```

```csharp path=src/third/Third.cs
namespace N;
public class Third {}
```

## Expect

- src/c/Use.cs:3 -> node:first      # the first test of the chain
- src/c/Use.cs:3 -> node:second      # the second test
- src/c/Use.cs:4 -> node:first      # the first test of a chain of three
- src/c/Use.cs:4 -> node:second      # the middle test
- src/c/Use.cs:4 -> node:third      # the last test

## Why

The grammar reads `o is First || o is Second` as a type test whose right-hand side is a constant pattern holding the `||` expression, so the first type was taken for a constant of the expression and gave no edge.
