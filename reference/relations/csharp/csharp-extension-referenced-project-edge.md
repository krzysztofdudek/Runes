---
id: csharp-extension-referenced-project-edge
language: csharp
category: usage-site
expectation: edge
cites: "C# spec §12.8.10.3 (extension method invocations); MSBuild — ProjectReference makes the referenced project's types visible"
---

## Rule

The control of csharp-extension-unreferenced-project-silence: the calling project references the project that declares the extension method, so the call binds it and gives the edge.

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
<Project Sdk="Microsoft.NET.Sdk">
  <ItemGroup>
    <ProjectReference Include="..\Shared\Shared.csproj" />
  </ItemGroup>
</Project>
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

- src/Billing/Invoice.cs:5 -> node:Shared      # Billing references Shared

## Why

The filter must lose no real edge: a reference, written the way every SDK-style project writes it, keeps the candidate.
