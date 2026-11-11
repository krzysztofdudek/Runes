---
id: csharp-attribute-both-readings-attribute-classes-silence
language: csharp
category: usage-site
expectation: silence
cites: "C# spec §23.3 (when both readings are attribute classes the attribute is ambiguous, error CS1614)"
---

## Rule

`[Mark]` with the attribute classes `Lib.Mark` of node one and `Lib.MarkAttribute` of node two both in scope: the compiler rejects the attribute (CS1614), so it gives no edge.

## Files

```csharp path=src/one/Mark.cs
namespace Lib;
public class Mark : System.Attribute { }
```

```csharp path=src/two/MarkAttribute.cs
namespace Lib;
public class MarkAttribute : System.Attribute { }
```

```csharp path=src/web/Use.cs
using Lib;
namespace App.Web;
public class Use {
  [Mark] public void Run() { }
}
```

## Expect

- silence

## Why

Neither reading is the one the code means until it writes `[@Mark]` or `[MarkAttribute]`.
