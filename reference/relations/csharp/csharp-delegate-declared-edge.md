---
id: csharp-delegate-declared-edge
language: csharp
category: usage-site
expectation: edge
cites: "C# spec §21 (a delegate declaration declares a type); §7.6.1"
---

## Rule

A delegate declaration declares a type. A field of that delegate type in another node depends on the node that declares it.

## Files

```csharp path=src/core/OrderHandler.cs
namespace App.Core;
public delegate void OrderHandler(int id);
```

```csharp path=src/web/Bus.cs
using App.Core;
namespace App.Web;
public class Bus {
  OrderHandler _h;
}
```

## Expect

- src/web/Bus.cs:4 -> node:core      # the delegate OrderHandler is a type of node core

## Why

A delegate is a type like a class; leaving it out of the declared types loses every edge to it.
