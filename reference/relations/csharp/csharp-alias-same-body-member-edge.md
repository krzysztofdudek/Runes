---
id: csharp-alias-same-body-member-edge
language: csharp
category: trap
expectation: edge
cites: "C# spec §14.5.2 (using alias directives — an alias name is unique in its namespace body and conflicts with a member of that namespace, CS0576); §7.8 (namespace and type names)"
---

## Rule

When the compilation unit has a using alias `I` and the global namespace also declares a type `I`, the alias and the type are in the same body: C# reports CS0576, and the simple name `I` has two meanings. The resolver silences the use rather than bind either: `class C : I` gives no edge. The directive itself still gives the edge to its target.

## Files

```csharp path=src/c/Use.cs
using I = N.Thing;
class C : I { }
```

```csharp path=src/n/Thing.cs
namespace N;
public class Thing {}
```

```csharp path=src/g/I.cs
public class I {}
```

## Expect

- src/c/Use.cs:1 -> node:n     # the directive binds N.Thing; the use on line 2 is silent

## Why

An alias and a type of the same body share one name; the nearer-namespace order does not separate them, so the use is ambiguous and no edge is the safe answer.
