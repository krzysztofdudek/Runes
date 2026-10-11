---
id: csharp-alias-member-codefinition-edge
language: csharp
category: trap
expectation: edge
cites: "C# CS0104-class co-definition (using-alias name competes with an enclosing member of the same name); MS Learn — using-alias directive"
---

## Rule

The directive `using I = N.Thing;` names a real type, so it gives the edge to that
type on its own line whether or not any use of `I` is ambiguous (D3 b, 185). When a
using-alias `I` is in scope AND the enclosing namespace also declares a member named
`I`, the simple name `I` at a use site is ambiguous (a co-definition between the alias
and the enclosing member). The resolver must SILENCE that use rather than bind the
alias target unconditionally, because both meanings exist and committing to either
would be a false positive: `class C : I` gives no edge.

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

- src/c/Use.cs:1 -> node:n     # the directive binds N.Thing; the use `class C : I` on line 3 is silent

## Why

An alias name colliding with a same-named enclosing member is ambiguous at the use
site; binding the alias target there alone would ignore the competing member and risk
the wrong edge. The directive itself is a dependency the compiler checks, so its edge stays.
