---
id: csharp-alias-target-outer-using-static-edge
language: csharp
category: nested
expectation: edge
cites: "C# spec §14.5.4 (a using static directive imports the nested types of the type it names); §14.5.2 (a using alias target is resolved with the using directives of an enclosing namespace declaration taking part); §7.8.1 (namespace and type names)"
---

## Rule

A `using static` directive imports the nested types of its type, and inside an enclosing namespace block it takes part in the lookup of a using alias target as a plain using does, at its own namespace. In `namespace A { using static Lib.Holder; namespace B { using I = Inner; } }` the target of `I` is the nested type `Lib.Holder.Inner`, never a global `Inner` beside it.

## Files

```csharp path=src/a/Use.cs
namespace A
{
    using static Lib.Holder;
    namespace B
    {
        using I = Inner;
        class C { I i; }
    }
}
```

```csharp path=src/lib/Holder.cs
namespace Lib;
public static class Holder { public class Inner { } }
```

```csharp path=src/global/Inner.cs
public class Inner { }
```

## Expect

- src/a/Use.cs:3 -> node:lib      # the using static target Lib.Holder
- src/a/Use.cs:6 -> node:lib      # the directive of I reads its target the same way
- src/a/Use.cs:7 -> node:lib      # the use of I binds Lib.Holder.Inner; the global Inner (node global) is never it

## Why

The using static directives of an enclosing block were not read for an alias target, so the lookup went on to the global namespace and bound a global type of the same name.
