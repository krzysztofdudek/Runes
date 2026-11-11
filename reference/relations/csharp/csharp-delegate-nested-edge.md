---
id: csharp-delegate-nested-edge
language: csharp
category: nested
expectation: edge
cites: "C# spec §21.2 (a delegate declared in a class is a nested type); §7.6.1"
---

## Rule

`Pipeline.Step` is a delegate nested in a class of node core; `Pipeline.Step` written in node web depends on node core.

## Files

```csharp path=src/core/Pipeline.cs
namespace App.Core;
public class Pipeline { public delegate int Step(int x); }
```

```csharp path=src/web/Use.cs
using App.Core;
namespace App.Web;
public class Use {
  Pipeline.Step _s;
}
```

## Expect

- src/web/Use.cs:4 -> node:core      # Pipeline.Step is a nested delegate type of node core

## Why

A nested delegate publishes the key `App.Core.Pipeline+Step` as a nested class does.
