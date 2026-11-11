---
id: csharp-explicit-interface-implementation-type-receiver-edge
language: csharp
category: trap
expectation: edge
cites: "C# spec §18.6.2 (explicit interface member implementations: such a member is not accessible through its simple name, only through an interface instance); §12.8.7.1 (member access: a simple name that is no member of the enclosing types is looked up among the namespaces)"
---

## Rule

An explicit interface implementation gives its class no member of that name: `ISettings IHasSettings.Settings => …` is reached through an `IHasSettings` value alone. Inside the class a bare `Settings` therefore finds no member and names the static class `Settings` of node legacy, and `Settings.Get()` is a call through that type.

## Files

```csharp path=src/core/IHasSettings.cs
namespace App;
public interface ISettings { }
public interface IHasSettings { ISettings Settings { get; } }
```

```csharp path=src/legacy/Settings.cs
namespace App;
public static class Settings { public static string Get() => ""; }
```

```csharp path=src/web/C.cs
namespace App;
public class C : IHasSettings {
  ISettings IHasSettings.Settings => null;
  public string Read() => Settings.Get();
}
```

## Expect

- src/web/C.cs:2 -> node:core
- src/web/C.cs:3 -> node:core
- src/web/C.cs:4 -> node:legacy      # no member of C is named Settings: the static class

## Why

The explicit implementation was counted among the names the file declares, so the receiver was read as a value and the call gave no edge.
