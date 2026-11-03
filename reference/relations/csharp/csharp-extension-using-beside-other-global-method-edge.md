---
id: csharp-extension-using-beside-other-global-method-edge
language: csharp
category: trap
expectation: edge
cites: "C# spec §12.8.10.3 (extension method invocations: a level whose static classes declare no eligible method of the called name gives no candidate, and the search goes on to that level's using directives)"
---

## Rule

The global namespace wins over the compilation unit's usings only for a method of the called name. With `using Lib;` at the top of a file and a static class of the global namespace that declares `Pack` but no `Ship`, a call `s.Ship()` binds `Lib`'s `Ship`, whose namespace the using imports.

## Files

```csharp path=src/c/Use.cs
using Lib;
class C { void M(string s) { s.Ship(); } }
```

```csharp path=src/lib/LibShipping.cs
namespace Lib;
public static class LibShipping { public static void Ship(this string s) { } }
```

```csharp path=src/global/GlobalPacking.cs
public static class GlobalPacking { public static void Pack(this string s) { } }
```

## Expect

- src/c/Use.cs:2 -> node:lib     # the global namespace declares no Ship: the compilation unit's `using Lib;` imports it

## Why

The control of the global namespace's place in the order: it is read by method name, so a global static class of other methods hides nothing a using imports.
