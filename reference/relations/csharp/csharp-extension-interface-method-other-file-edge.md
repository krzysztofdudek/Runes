---
id: csharp-extension-interface-method-other-file-edge
language: csharp
category: usage-site
expectation: edge
cites: "C# spec §12.8.10.3 (an extension method is considered only when the normal processing of the invocation finds no applicable instance method)"
---

## Rule

`_bus.Publish(e)` on a field of type `IBus` calls the interface's method, declared in node core, which `IBus` inherits from `IPublisher`. The extension `Publish(this OutboxContext, object)` of node outbox is not considered, so line 5 gives no edge.

## Files

```csharp path=src/core/IBus.cs
namespace App.Messaging;
public interface IPublisher { void Publish(object e); }
public interface IBus : IPublisher { }
```

```csharp path=src/outbox/OutboxExtensions.cs
namespace App.Messaging;
public class OutboxContext { }
public static class OutboxExtensions { public static void Publish(this OutboxContext c, object e) { } }
```

```csharp path=src/web/Handler.cs
using App.Messaging;
namespace App.Web;
public class Handler {
  private readonly IBus _bus;
  public void Run(object e) { _bus.Publish(e); }
}
```

## Expect

- src/web/Handler.cs:4 -> node:core      # the field's type; line 5 calls an interface method

## Why

An interface's methods, those of its base interfaces included, are instance methods of every value of it.
