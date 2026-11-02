---
id: csharp-alias-member-codefinition-edge
language: csharp
category: trap
expectation: edge
cites: "C# spec §7.8 (namespace and type names — a name is looked up in each enclosing namespace, innermost first, and in a namespace the members come before the usings of its body); §14.5.2 (using alias directives)"
---

## Rule

The directive `using I = N.Thing;` names a real type, so it gives the edge to that
type on its own line whether or not any use of `I` is hidden. The alias sits in the
compilation unit, and the use sits in `namespace App;`, which declares a member named
`I`. Lookup reads the namespace `App` before the compilation unit, so the member
`App.I` wins and `class C : I` gives the edge to `App.I`, not to `N.Thing`. Only an
alias and a member of the same body conflict (CS0576, the case csharp-alias-same-body-member-edge).

## Files

```csharp path=src/c/Use.cs
using I = N.Thing;
namespace App;
class C : I { }
```

```csharp path=src/n/Thing.cs
namespace N;
public class Thing {}
```

```csharp path=src/app/I.cs
namespace App;
public class I {}
```

## Expect

- src/c/Use.cs:1 -> node:n     # the directive binds N.Thing
- src/c/Use.cs:3 -> node:app   # the use `class C : I` binds the nearer member App.I, not the alias target

## Why

Binding the alias target at the use site would ignore the nearer member the compiler
binds first and add an edge to a type the use does not name.
