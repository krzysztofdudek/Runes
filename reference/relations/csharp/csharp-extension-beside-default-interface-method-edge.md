---
id: csharp-extension-beside-default-interface-method-edge
language: csharp
category: usage-site
expectation: edge
cites: "C# spec §12.5 (member lookup in a class type does not read the interfaces the class implements); the C# 8 default interface methods proposal (a default implementation is a member of the interface, not of the implementing class)"
---

## Rule

`ILog` of node core gives `Write` a default body, and `FileLog` implements `ILog` without declaring `Write`. A default interface method is no member of the class, so `log.Write("x")` on a parameter of type `FileLog` is the extension `Write(this FileLog, string)` of node ext.

## Files

```csharp path=src/core/ILog.cs
namespace App;
public interface ILog { void Write(string text) { } }
public class FileLog : ILog { }
```

```csharp path=src/ext/LogExtensions.cs
namespace App;
public static class LogExtensions { public static void Write(this FileLog l, string text) { } }
```

```csharp path=src/web/Job.cs
namespace App;
public class Job {
  public void Run(FileLog log) {
    log.Write("x");
  }
}
```

## Expect

- src/ext/LogExtensions.cs:2 -> node:core
- src/web/Job.cs:3 -> node:core
- src/web/Job.cs:4 -> node:ext            # the extension method

## Why

Only a receiver typed as the interface finds the interface's own method.
