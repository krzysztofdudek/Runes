---
id: csharp-using-alias-global-dotted-edge
language: csharp
category: import
expectation: edge
cites: "C# spec §14.5.2 (using alias directives); §7.8 (global:: alias-qualified name)"
---

## Rule

A using alias whose target is a `global::`-qualified dotted name (`using H = global::Shop.Core.Helpers;`) gives the edge to that type from the root, whether or not the alias is used, exactly as `using static global::Shop.Core.Helpers;` does: the qualifier is stripped and the name is read from the global namespace only, never in an enclosing namespace.

## Files

```csharp path=src/c/Use.cs
using H = global::Shop.Core.Helpers;
class C { }
```

```csharp path=src/h/Helpers.cs
namespace Shop.Core;
public static class Helpers { }
```

## Expect

- src/c/Use.cs:1 -> node:h     # the rooted target Shop.Core.Helpers gets its edge at the directive

## Why

Both directives name the type the compiler binds, so the spelling of the root qualifier must not decide whether the file depends on it.
