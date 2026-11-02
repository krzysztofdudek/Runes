---
id: csharp-alias-colon-colon-in-namespace-edge
language: csharp
category: import
expectation: edge
cites: "C# spec §14.5.2 (using alias directives — the target is resolved in the namespace body that holds the directive); §13.8 (qualified alias member `::`)"
---

## Rule

In `S::Gen<int>` the left of `::` is a using alias, and the alias names the namespace its directive names in the namespace body that holds the directive. Below `namespace App;`, `using S = Core;` names `App.Core` when that namespace has a type in the repository, so `S::Gen<int>` is `App.Core.Gen`, and the global `Core.Gen` gets no edge.

## Files

```csharp path=src/c/Use.cs
namespace App;
using S = Core;
class C { S::Gen<int> g; }
```

```csharp path=src/near/Gen.cs
namespace App.Core;
public class Gen<T> { }
```

```csharp path=src/far/Gen.cs
namespace Core;
public class Gen<T> { }
```

## Expect

- src/c/Use.cs:3 -> node:near      # S names App.Core, so S::Gen is App.Core.Gen

## Why

Rewriting `S` to the root reading of its target binds the global namespace's type whenever the directive's own namespace holds a namespace of the same first name.
