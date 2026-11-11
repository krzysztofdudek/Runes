---
id: csharp-delegate-enclosing-namespace-hides-imported-class-silence
language: csharp
category: trap
expectation: silence
cites: "C# spec §21 (a delegate is a type); §7.6.1 (a member of an enclosing namespace is read before the using directives of the compilation unit)"
---

## Rule

`App.Web.Handler` is a delegate of node web. Inside `App.Web`, the bare `Handler` names it, never `App.Core.Handler` of node core that the using directive imports. The reference is inside its own node, so it gives no edge.

## Files

```csharp path=src/web/Handler.cs
namespace App.Web;
public delegate void Handler(int id);
```

```csharp path=src/web/Bus.cs
using App.Core;
namespace App.Web;
public class Bus {
  Handler _h;
}
```

```csharp path=src/core/Handler.cs
namespace App.Core;
public class Handler { }
```

## Expect

- silence      # Handler is the delegate of the enclosing namespace, in the same node

## Why

Without the delegate among the declared types the import is the only reading left, and the reference binds a class it can never name.
