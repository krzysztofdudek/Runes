---
id: csharp-project-reference-directory-case-edge
language: csharp
category: usage-site
expectation: edge
cites: "MSBuild — a path in a ProjectReference names a file on the author's file system, which on Windows and macOS forgives the case of every directory"
---

## Rule

A `<ProjectReference>` whose directory is spelled in another case than the repository's (`..\shared\Shared.csproj` for the directory `Shared`) still references that project: the build works for the author on a file system that ignores case, and the relation pass reads the same repository on one that does not. The reference graph matches every segment of the path in any case, so Billing reaches Shared and its type binds. A path that names no file of the repository would not close the project: it reads as able to reach everything.

## Files

```xml path=src/Billing/Billing.csproj
<Project Sdk="Microsoft.NET.Sdk">
  <ItemGroup>
    <ProjectReference Include="..\shared\Shared.csproj" />
  </ItemGroup>
</Project>
```

```csharp path=src/Billing/Invoice.cs
using Acme.Shared;
namespace Billing;
public class Invoice {
  public void Stamp() { var c = new Clock(); }
}
```

```xml path=src/Shared/Shared.csproj
<Project Sdk="Microsoft.NET.Sdk"></Project>
```

```csharp path=src/Shared/Clock.cs
namespace Acme.Shared;
public class Clock { }
```

## Expect

- src/Billing/Invoice.cs:4 -> node:Shared      # the reference binds although its directory is spelled shared

## Why

A reference graph that compared directories exactly lost this real edge for every author on Windows or macOS.
