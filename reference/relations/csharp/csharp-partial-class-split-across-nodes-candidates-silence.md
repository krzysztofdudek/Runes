---
id: csharp-partial-class-split-across-nodes-candidates-silence
language: csharp
category: trap
expectation: silence
cites: "C# spec §15.2.7 (partial declarations); distinct-owner rule of the symbol axis"
---

## Rule

A partial type whose parts two owners declare binds neither owner. The answer is ambiguous and names the files of its parts, sorted.

## Files

```csharp path=src/app/Uses.cs
using Shop.People;
class Uses { Customer _c; }
```

```csharp path=src/people/Customer.cs
namespace Shop.People;
public partial class Customer {}
```

```csharp path=src/generated/Customer.g.cs
namespace Shop.People;
public partial class Customer { void Map() {} }
```

## Expect

- silence      # the parts lie in the owners people and generated
- src/app/Uses.cs:2 answers ambiguous src/generated/Customer.g.cs, src/people/Customer.cs

## Why

A consumer that owns generated code apart from the hand-written part can judge the use from the files.
