---
id: csharp-extension-argument-count-fits-edge
language: csharp
category: usage-site
expectation: edge
cites: "C# spec §12.8.10.3 (extension method invocations: the lookup goes on to the next enclosing namespace when a namespace gives no applicable candidate); §12.6.4.2 (applicable function member: a parameter with a default needs no argument, and a `params` parameter takes any number)"
---

## Rule

An extension method takes a call whose arguments, beside the receiver, are at least its parameters without a default and at most all of them, or any number from there on when its last parameter is `params`. Where the extension methods of a nearer namespace cannot take the call, the lookup goes on outward. Node kit declares a `Stamp` of three parameters in the namespace of the calls, `App.Web`, and node lib one of one parameter and an optional second in the imported `App.Lib`. `order.Stamp("a")` and `order.Stamp("a", 2)` fit only lib's, `order.Stamp("a", 2, 3)` is kit's, and `order.Join("a", "b", "c")` fits the `params` method of lib.

## Files

```csharp path=src/core/Order.cs
namespace App;
public sealed class Order { }
```

```csharp path=src/lib/Stamps.cs
namespace App.Lib;
public static class Stamps {
  public static string Stamp(this App.Order o, string text, int size = 1) => text;
  public static string Join(this App.Order o, params string[] parts) => "";
}
```

```csharp path=src/kit/Stamps.cs
namespace App.Web;
public static class Stamps {
  public static string Stamp(this App.Order o, string text, int size, int weight) => text;
}
```

```csharp path=src/web/Page.cs
using App.Lib;
namespace App.Web;
public class Page {
  public string Render(object source) {
    var order = (App.Order)source;
    var one = order.Stamp("a");
    var two = order.Stamp("a", 2);
    var three = order.Stamp("a", 2, 3);
    return order.Join("a", "b", "c");
  }
}
```

## Expect

- src/lib/Stamps.cs:3 -> node:core
- src/lib/Stamps.cs:4 -> node:core
- src/kit/Stamps.cs:3 -> node:core
- src/web/Page.cs:5 -> node:core
- src/web/Page.cs:6 -> node:lib      # one argument: the nearer Stamp of kit cannot take it, lib's can (its second parameter has a default)
- src/web/Page.cs:7 -> node:lib      # two arguments: lib's
- src/web/Page.cs:8 -> node:kit      # three arguments: the nearer one takes them
- src/web/Page.cs:9 -> node:lib      # a params parameter takes any number

## Why

The lookup matched an extension method by its name alone, so the method of the nearer namespace took every call of that name, whatever it passed. Where two owners declare the name at one level, the counts still choose no one: the receiver's type is not read, and the name stays ambiguous.
