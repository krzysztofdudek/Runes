---
id: csharp-color-color-receiver-edge
language: csharp
category: usage-site
expectation: edge
cites: "C# spec §12.8.7.2 (identical simple names and type names); §12.8.7 (member access through a type)"
---

## Rule

In `Status == Status.Active` and `Status = Status.Done`, where the file also declares a value named `Status` of the type `Status` (a property, a field, a `var` local, an implicitly typed lambda parameter), C# may read the first name of `Status.Active` as the value or as the type, and binds the static member `Active` through the type. Compared with or assigned to the value itself, the member has the value's type, the shape of an enum member or a constant, so each such member access gives the edge to the type; for the `var` local and the lambda parameter it is the file's only reference to `Status`. Read anywhere else, a member beside such a value may be an instance member, which C# reads through the value: `Status.ToString()` gives no edge.

## Files

```csharp path=src/model/Status.cs
namespace App.Model;
public enum Status { Active, Done }
```

```csharp path=src/web/Prop.cs
using App.Model;
namespace App.Web;
public class Prop {
  public Status Status { get; set; }
  public bool A() => Status == Status.Active;
  public void B() { Status = Status.Done; }
  public string D() => Status.ToString();
  public bool E() => Status.Done != Status;
}
```

```csharp path=src/web/Field.cs
using App.Model;
namespace App.Web;
public class Field {
  private App.Model.Status Status;
  public bool A() => Status == Status.Active;
}
```

```csharp path=src/web/Local.cs
using App.Model;
namespace App.Web;
public class Local {
  public bool A() { var Status = Sdk.Factory.Make(); return Status == Status.Active; }
  public void B() { var Status = Sdk.Factory.Make(); Status = Status.Done; }
}
```

```csharp path=src/web/Lambda.cs
using App.Model;
namespace App.Web;
public class Lambda {
  public bool A() => Sdk.Items.Any(Status => Status == Status.Active);
}
```

## Expect

- src/web/Prop.cs:4 -> node:model      # the property's written type
- src/web/Prop.cs:5 -> node:model      # Status.Active beside a property of type Status
- src/web/Prop.cs:6 -> node:model      # Status.Done on the right of an assignment to the property
- src/web/Prop.cs:8 -> node:model      # Status.Done on the left of a comparison with the property; line 7 reads an instance method through the value and gives none
- src/web/Field.cs:4 -> node:model     # the field's written type, qualified
- src/web/Field.cs:5 -> node:model     # Status.Active beside a field of type App.Model.Status
- src/web/Local.cs:4 -> node:model     # beside a var local, whose type C# infers
- src/web/Local.cs:5 -> node:model     # the same in an assignment
- src/web/Lambda.cs:4 -> node:model    # beside an implicitly typed lambda parameter

## Why

The first name of a member access was read as no type wherever the file declares a value of that name, so `Status.Active` beside a value `Status` of the type `Status` gave no edge, and a file whose only use of `Status` sits beside a `var` local or a lambda parameter of that name had no edge to it at all.
