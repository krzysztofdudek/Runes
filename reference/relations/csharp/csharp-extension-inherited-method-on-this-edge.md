---
id: csharp-extension-inherited-method-on-this-edge
language: csharp
category: usage-site
expectation: edge
cites: "C# spec §12.8.10.3 (an extension method is considered only when the normal processing of the invocation finds no applicable instance method)"
---

## Rule

`this.Save()` in `OrderRepo` calls `RepoBase.Save`, inherited from node data, and `this.Flush()` calls the private `Flush` that another part of `OrderRepo` declares. The extensions `Save(this Document)` and `Flush(this Document)` of node docs, in scope through the enclosing namespace, are not considered.

## Files

```csharp path=src/data/RepoBase.cs
namespace App;
public abstract class RepoBase { public void Save() { } }
```

```csharp path=src/docs/DocumentExtensions.cs
namespace App;
public class Document { }
public static class DocumentExtensions {
  public static void Save(this Document d) { }
  public static void Flush(this Document d) { }
}
```

```csharp path=src/web/OrderRepo.Flush.cs
namespace App;
public partial class OrderRepo { void Flush() { } }
```

```csharp path=src/web/OrderRepo.cs
namespace App;
public partial class OrderRepo : RepoBase {
  public void Commit() { this.Save(); }
  public void Close() { this.Flush(); }
}
```

## Expect

- src/web/OrderRepo.cs:2 -> node:data     # the base class; lines 3 and 4 call instance methods

## Why

An inherited method and a private method of another part are both found before any extension method.
