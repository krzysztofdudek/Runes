---
id: csharp-base-class-nested-type-through-derived-name-edge
language: csharp
category: nested
expectation: edge
cites: "C# spec §7.6.1 (in `N.I` with N a type, I is an accessible nested type of N or of its base classes)"
---

## Rule

`Derived.Options` names `Base.Options` of node core: `Derived` of node mid declares no `Options` and inherits the one its base class nests.

## Files

```csharp path=src/core/Base.cs
namespace App;
public class Base { public class Options { } }
```

```csharp path=src/mid/Derived.cs
namespace App;
public class Derived : Base { }
```

```csharp path=src/web/Use.cs
namespace App.Web;
public class Use {
  Derived.Options _o;
}
```

## Expect

- src/mid/Derived.cs:2 -> node:core       # the base class
- src/web/Use.cs:3 -> node:core           # Base+Options, read through Derived

## Why

The type the reference binds is the nested one, wherever the name before the dot found it.
