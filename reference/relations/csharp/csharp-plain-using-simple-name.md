---
id: csharp-plain-using-simple-name
language: csharp
category: import
expectation: edge
cites: "C# spec §14.5 (using_namespace_directive); §7.8.1 (namespace and type names: the types a using namespace directive imports are read after the members of the namespace whose declaration holds it); MS Learn — using-directive (namespace import); CS0246 (unique import binds)"
---

## Rule

A `using N;` directive imports the types of namespace `N` into the file. An unqualified base name `Type` is then a candidate for `N.Type`, read after the global namespace's own members (the compilation unit is the declaration of the global namespace). Where the global namespace declares no `Type`, a reference to `Type` after `using N;` binds `N.Type`, never a type of the same simple name in a namespace the file does not import. Where the global namespace does declare one, that one wins (the case csharp-using-beside-global-type-edge).

## Files

```csharp path=src/c/Use.cs
using N;
class C : Type { }
```

```csharp path=src/n/Type.cs
namespace N;
public class Type {}
```

```csharp path=src/x/Type.cs
namespace X;
public class Type {}
```

## Expect

- src/c/Use.cs:2 -> node:n      # `using N;` makes bare `Type` bind N.Type (node n), never X.Type (node x), which no using imports

## Why

The control of the case csharp-using-beside-global-type-edge: with no global `Type`, the imported `N.Type` is the binding, and a type of the same simple name in a namespace the file does not import is never chosen.
