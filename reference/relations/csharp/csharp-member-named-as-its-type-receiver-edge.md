---
id: csharp-member-named-as-its-type-receiver-edge
language: csharp
category: usage-site
expectation: edge
cites: "C# spec §12.8.7.2 (identical simple names and type names: where a member and its type share a name, both readings of `E.I` are permitted, so a static member of the type is found)"
---

## Rule

`Item` of node core declares the property `SourceKind SourceKind`. In the derived `Audio`, `SourceKind.Library` names the enum value, through the type `SourceKind` of node model: a member named as its own type hides the type from no member access.

## Files

```csharp path=src/core/Item.cs
namespace App;
public class Item { public SourceKind SourceKind { get; set; } }
```

```csharp path=src/model/SourceKind.cs
namespace App;
public enum SourceKind { Library }
```

```csharp path=src/web/Audio.cs
namespace App;
public class Audio : Item {
  public bool FromLibrary() => SourceKind == SourceKind.Library;
}
```

## Expect

- src/core/Item.cs:2 -> node:model
- src/web/Audio.cs:2 -> node:core
- src/web/Audio.cs:3 -> node:model       # the enum, through its type

## Why

The property and the type are both right readings of the name, and the edge to the type holds for either.
