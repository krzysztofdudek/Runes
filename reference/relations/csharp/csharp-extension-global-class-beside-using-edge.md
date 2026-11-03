---
id: csharp-extension-global-class-beside-using-edge
language: csharp
category: trap
expectation: edge
cites: "C# spec §12.8.10.3 (extension method invocations: the search walks the enclosing namespace declarations and the compilation unit outward, and at each one considers the static classes declared in its namespace before those imported by its using directives; for the compilation unit that namespace is the global namespace); §7.8.1 (the compilation unit is the declaration of the global namespace)"
---

## Rule

C# searches for an extension method from the innermost enclosing namespace declaration outward, ending with the compilation unit. At each of them it takes the static classes of that namespace first and the static classes its using directives import after them, and the first level with an eligible method decides. The compilation unit's namespace is the global namespace. So with `using Lib;` at the top of a file and a static class of the global namespace declaring `Ship`, a call `s.Ship()` binds the global class's method, never `Lib`'s, both in the compilation unit and inside a namespace body that declares no `Ship` of its own.

## Files

```csharp path=src/c/Use.cs
using Lib;
class C { void M(string s) { s.Ship(); } }
namespace App
{
    class D { void M(string s) { s.Ship(); } }
}
```

```csharp path=src/lib/LibShipping.cs
namespace Lib;
public static class LibShipping { public static void Ship(this string s) { } }
```

```csharp path=src/global/GlobalShipping.cs
public static class GlobalShipping { public static void Ship(this string s) { } }
```

## Expect

- src/c/Use.cs:2 -> node:global     # the global namespace's own GlobalShipping.Ship comes before the compilation unit's `using Lib;`; never Lib's (node lib)
- src/c/Use.cs:5 -> node:global     # App declares no Ship and imports nothing: the compilation unit is next, its global namespace before its usings

## Why

The extension methods the compilation unit's usings import were read before the global namespace, so a call both could bind took the imported method: a false edge to it and a lost edge to the global class.
