---
id: csharp-type-header-outside-nested-types-edge
language: csharp
category: nested
expectation: edge
cites: "C# spec §7.7.1 (the scope of a member declared in a class is its class_body; a type parameter's scope is the class_base, the constraint clauses and the class_body)"
---

## Rule

A type's attributes, its base list and its constraint clauses lie outside its body, where its nested types are not in scope. `[Mark]` names `Shop.MarkAttribute`, and `Command` in the base list and in the constraint names `Shop.Command`, although `Handler` nests a `Command` of its own.

## Files

```csharp path=src/web/Handler.cs
namespace Shop;
[Mark]
public class Handler<T> : IRequest<Command> where T : Command {
  public class Command { }
  public Command Next() => new Command();
}
```

```csharp path=src/core/Shared.cs
namespace Shop;
public class MarkAttribute : System.Attribute { }
public class Command { }
```

## Expect

- src/web/Handler.cs:2 -> node:core      # Shop.MarkAttribute
- src/web/Handler.cs:3 -> node:core      # Shop.Command, in the base list and the constraint; line 5 binds the nested Command

## Why

Reading the type's own nested types in its header gave a nearer reading that bound the file itself, so the true edges to node core were lost.
