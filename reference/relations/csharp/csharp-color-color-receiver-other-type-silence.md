---
id: csharp-color-color-receiver-other-type-silence
language: csharp
category: trap
expectation: silence
cites: "C# spec §12.8.4 (simple names: locals, parameters and members are found before types), §12.8.7.2 (identical simple names and type names)"
---

## Rule

A value named `Status` whose written type is not `Status` hides the type: `Status.CompareTo(0)` on an `int` property, `Status.Length` on a `string` local and `Status = Status.Next` on a property of another type read the value, and the rule for identical simple names and type names does not apply, so none of them gives an edge to the type `Status` the using imports.

## Files

```csharp path=src/model/Status.cs
namespace App.Model;
public enum Status { Active, Done }
```

```csharp path=src/web/Other.cs
using App.Model;
namespace App.Web;
public class Other {
  public int Status { get; set; }
  public bool A() => Status.CompareTo(0) > 0;
}
```

```csharp path=src/web/Chain.cs
using App.Model;
namespace App.Web;
public class Chain {
  public Sdk.Node Status { get; set; }
  public void B() { Status = Status.Next; }
}
```

```csharp path=src/web/Text.cs
using App.Model;
namespace App.Web;
public class Text {
  public int A() { string Status = "x"; return Status.Length; }
}
```

## Expect

- silence      # an int property, a string local and a property of another type named Status are values; no edge to node model

## Why

Reading the first name of a member access as the type whenever the file declares a value of its name would turn every value named like a type into a false edge; only a value of that very type lets C# read the name as the type.
