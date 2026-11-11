---
id: csharp-base-class-nested-type-own-first-edge
language: csharp
category: nested
expectation: edge
cites: "C# spec §7.6.1 (the members of T are read first; a member of a derived class hides the inherited one of that name, §7.7.2.3)"
---

## Rule

``Page` nests its own `Options`, in a part node parts holds, and derives from `PageBase`, which nests one too. The bare `Options` in `Page` is its own nested type; the `Options` of the base class in node core is hidden.

## Files

```csharp path=src/core/PageBase.cs
namespace App;
public class PageBase { public class Options { } }
```

```csharp path=src/parts/Page.Options.cs
namespace App;
public partial class Page { public new class Options { } }
```

```csharp path=src/web/Page.cs
namespace App;
public partial class Page : PageBase {
  Options _o;
}
```

## Expect

- src/web/Page.cs:2 -> node:core          # the base class
- src/web/Page.cs:3 -> node:parts         # Page+Options, the type's own

## Why

A nested type of the class itself is nearer than any its base classes declare.
