---
id: csharp-extension-unreferenced-project-silence
language: csharp
category: trap
expectation: silence
cites: "C# spec §12.8.10.3 (extension method invocations: only methods of types the compilation can see); MSBuild — a project sees only the assemblies it references"
---

## Rule

An extension method binds only when its declaring assembly is one the calling project references, directly or through a reference of a reference. Shared declares `AddRange` in the namespace `System.Collections.Generic`, which every file imports, but Billing has no reference to Shared: its `_lines.AddRange(more)` on a `List<string>` is the framework's method, and the call gives no edge. The same extension in a project Billing references does give one (csharp-extension-referenced-project-edge).

## Files

```xml path=src/Shared/Shared.csproj
<Project Sdk="Microsoft.NET.Sdk"></Project>
```

```csharp path=src/Shared/CollectionExtensions.cs
namespace System.Collections.Generic;
public static class CollectionExtensions {
  public static void AddRange<T>(this ICollection<T> target, IEnumerable<T> items) { }
}
```

```xml path=src/Billing/Billing.csproj
<Project Sdk="Microsoft.NET.Sdk"></Project>
```

```csharp path=src/Billing/Invoice.cs
using System.Collections.Generic;
namespace Billing;
public class Invoice {
  private readonly List<string> _lines = new();
  public void Add(IEnumerable<string> more) { _lines.AddRange(more); }
}
```

## Expect

- silence      # Billing has no reference to Shared, so Shared's AddRange is not a candidate

## Why

Without the reference filter this was a false, unsuppressible undeclared dependency Billing → Shared on every call of a framework method whose name an in-repository extension shares.
