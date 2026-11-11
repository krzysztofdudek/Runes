---
id: csharp-extension-constant-argument-instance-method-silence
language: csharp
category: trap
expectation: silence
cites: "C# spec §10.2.11 (implicit constant expression conversions: a constant of type `int` converts to `byte`, `short` and the other integral types when its value is in their range); §12.8.10.3"
---

## Rule

A constant converts by its value, not by its type alone: `const int Max = 5` converts to `byte`. `ILib` of node core declares `Set(byte value)`, which therefore takes `_lib.Set(Max)` and `_lib.Set(local)`, and neither is a call of the extension `Set(this ILib, int)` of node ext. A constant's written type says nothing certain about the parameters that take it.

## Files

```csharp path=src/core/ILib.cs
namespace App;
public interface ILib { void Set(byte value); }
```

```csharp path=src/ext/LibExtensions.cs
namespace App;
public static class LibExtensions { public static void Set(this ILib lib, int value) { } }
```

```csharp path=src/core/Page.cs
namespace App;
public class Page {
  private const int Max = 5;
  private readonly ILib _lib;
  public void Render() {
    const int local = 7;
    _lib.Set(Max);
    _lib.Set(local);
  }
}
```

## Expect

- src/ext/LibExtensions.cs:2 -> node:core
- silence      # src/core/Page.cs:7 and :8 are ILib's own Set

## Why

A constant field was read as a variable of its written type, and an `int` variable converts to no `byte`, so the instance method was refused and the extension method kept the call.
