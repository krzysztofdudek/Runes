---
id: csharp-enclosing-nested-type-before-namespace-silence
language: csharp
category: nested
expectation: silence
cites: "C# spec §7.6.1 (namespace and type names: the nested types of each enclosing type are read before any namespace member)"
---

## Rule

Inside `CreateOrder.Handler`, the bare `Command` names the nested type `CreateOrder.Command` of the enclosing type, which C# finds before the member `App.Command` of an enclosing namespace. This is the vertical-slice layout: a static class per feature with a nested `Command`, `Query`, `Handler` and `Result`.

## Files

```csharp path=src/web/CreateOrder.cs
namespace App.Web;
public static class CreateOrder {
  public record Command(int Id);
  public class Handler { public void Handle(Command c) { } }
}
```

```csharp path=src/shared/Command.cs
namespace App;
public class Command { }
```

## Expect

- silence      # Command binds CreateOrder+Command in node web

## Why

The reference reads the nested types of `CreateOrder.Handler` and then of `CreateOrder` (`App.Web.CreateOrder+Handler+Command`, `App.Web.CreateOrder+Command`) before `App.Web.Command` and `App.Command`. The nested reading binds the file's own type, so no edge leaves node web, where reading the namespaces first gave a false edge to node shared from every feature that nests a `Command`.
