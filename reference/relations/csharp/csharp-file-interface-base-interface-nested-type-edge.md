---
id: csharp-file-interface-base-interface-nested-type-edge
language: csharp
category: nested
expectation: edge
cites: "C# spec §7.6.1 (members of a type, the inherited ones included, are found before the members of a namespace); §18.4.1 (an interface inherits the members of its base interfaces); C# 11 file-local types"
---

## Rule

An interface inherits the nested types of its base interfaces, and a `file` interface does so like any other. Inside `file interface IDerived : IBase`, `Options` names `IBase.Options` of node core before the `Options` the namespace declares in node legacy.

## Files

```csharp path=src/core/IBase.cs
namespace App;
public interface IBase {
  public class Options { }
}
```

```csharp path=src/legacy/Options.cs
namespace App;
public class Options { }
```

```csharp path=src/web/Derived.cs
namespace App;
file interface IDerived : IBase {
  Options Read();
}
```

## Expect

- src/web/Derived.cs:2 -> node:core
- src/web/Derived.cs:3 -> node:core      # IBase.Options, inherited, before the namespace's Options

## Why

Whether a type is an interface was read from a mark only a published interface declares, so a `file` interface was taken for a class, which inherits nothing from the interfaces it lists.
