---
id: csharp-extension-enclosing-namespace-beside-using-edge
language: csharp
category: trap
expectation: edge
cites: "C# spec §12.8.10.3 (extension method invocations: the search walks the enclosing namespace declarations outward, and at each one considers the static classes declared in its namespace before those imported by its using directives, the compilation unit last)"
---

## Rule

An enclosing namespace is a nearer level of the extension-method search than the compilation unit. With `using Lib;` at the top of a file, a call `s.Ship()` inside `namespace App.Web` binds `App.Web`'s or, failing that, `App`'s own `Ship` before `Lib.Ship` and before a `Ship` of the global namespace: each of those belongs to the compilation unit's level, which is read last.

## Files

```csharp path=src/c/Use.cs
using Lib;
namespace App.Web
{
    class D { void M(string s) { s.Ship(); } }
}
```

```csharp path=src/app/AppShipping.cs
namespace App;
public static class AppShipping { public static void Ship(this string s) { } }
```

```csharp path=src/lib/LibShipping.cs
namespace Lib;
public static class LibShipping { public static void Ship(this string s) { } }
```

```csharp path=src/global/GlobalShipping.cs
public static class GlobalShipping { public static void Ship(this string s) { } }
```

## Expect

- src/c/Use.cs:4 -> node:app     # App, an enclosing namespace, is read before the compilation unit; never Lib's Ship (node lib) nor the global one (node global)

## Why

Reading the global namespace before the compilation unit's usings must not move it ahead of the enclosing namespaces: the global namespace is the compilation unit's level, the farthest out.
