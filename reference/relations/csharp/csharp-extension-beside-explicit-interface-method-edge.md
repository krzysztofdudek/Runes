---
id: csharp-extension-beside-explicit-interface-method-edge
language: csharp
category: usage-site
expectation: edge
cites: "C# spec §12.5 (member lookup in a class type reads the class and its base classes, not the interfaces it implements); §18.6.2 (an explicit interface member implementation is reached through the interface alone)"
---

## Rule

`Bus` of node core implements `IBus.Publish` explicitly, so a `Bus` has no method `Publish` of its own. `bus.Publish(e)` on a parameter of type `Bus` is the extension `Publish(this Bus, object)` of node ext.

## Files

```csharp path=src/core/Bus.cs
namespace App;
public interface IBus { void Publish(object e); }
public class Bus : IBus { void IBus.Publish(object e) { } }
```

```csharp path=src/ext/BusExtensions.cs
namespace App;
public static class BusExtensions { public static void Publish(this Bus b, object e) { } }
```

```csharp path=src/web/Handler.cs
namespace App;
public class Handler {
  public void Run(Bus bus, object e) {
    bus.Publish(e);
  }
}
```

## Expect

- src/ext/BusExtensions.cs:2 -> node:core
- src/web/Handler.cs:3 -> node:core
- src/web/Handler.cs:4 -> node:ext        # the extension method

## Why

The interface's method is no member of the class, and the explicit implementation has no name a call on the class can use.
