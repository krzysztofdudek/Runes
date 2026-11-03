---
id: csharp-base-list-outside-nested-types-edge
language: csharp
category: nested
expectation: edge
cites: "C# spec §7.7.1 (the scope of a member declared in a class is its class_body, which the class_base is not part of)"
---

## Rule

`class Handler : Command { class Command { } }`: the base list is outside the body of `Handler`, so `Command` there names `Shop.Command` of node core, never the nested `Handler.Command`.

## Files

```csharp path=src/web/Handler.cs
namespace Shop;
public class Handler : Command {
  public class Command { }
}
```

```csharp path=src/core/Command.cs
namespace Shop;
public class Command { }
```

## Expect

- src/web/Handler.cs:2 -> node:core      # the base class Shop.Command

## Why

A type cannot derive from its own nested type; the base list reads the scope around the type.
