---
id: csharp-extension-dynamic-parameter-instance-method-silence
language: csharp
category: trap
expectation: silence
cites: "C# spec §8.2.4 (the dynamic type: every type converts implicitly to `dynamic`); §12.8.10.3 (an extension method is considered when no instance method is applicable)"
---

## Rule

A parameter written `dynamic` takes every argument. `ILog` of node core declares `Log(dynamic value)`, so `_log.Log(Kind.A)` is that instance method's call, whatever the argument's type, and no call of the extension `Log(this ILog, Kind)` of node ext.

## Files

```csharp path=src/core/ILog.cs
namespace App;
public enum Kind { A }
public interface ILog { void Log(dynamic value); }
```

```csharp path=src/ext/LogExtensions.cs
namespace App;
public static class LogExtensions { public static void Log(this ILog log, Kind kind) { } }
```

```csharp path=src/core/Page.cs
namespace App;
public class Page {
  private readonly ILog _log;
  public void Render() => _log.Log(Kind.A);
}
```

## Expect

- src/ext/LogExtensions.cs:2 -> node:core
- silence      # src/core/Page.cs:4 is ILog's own Log

## Why

`dynamic` is a plain word to the grammar, so the parameter was read as a type from outside the repository, which takes no enum value, and the extension method kept the call.
