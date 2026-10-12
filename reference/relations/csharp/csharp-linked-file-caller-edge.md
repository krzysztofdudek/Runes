---
id: csharp-linked-file-caller-edge
language: csharp
category: usage-site
expectation: edge
cites: "MSBuild — a Compile item outside the project's directory links the file into that project's compilation; one file can belong to several compilations"
---

## Rule

A file that another project links (`<Compile Include="..\Lib\**\*.cs" />`) is code of that project as well: under `#if NETFRAMEWORK` the linked `Feature.cs` is compiled in Lib.NetFx, which references Legacy, so its `Legacy.Helper` binds there although the project that holds the file does not reference Legacy. The file is read as a caller of every project that links it, and the edge is kept.

## Files

```xml path=src/Lib/Lib.csproj
<Project Sdk="Microsoft.NET.Sdk"></Project>
```

```csharp path=src/Lib/Feature.cs
namespace Lib;
public class Feature {
#if NETFRAMEWORK
  public void Run() { var h = new Legacy.Helper(); }
#endif
}
```

```xml path=src/Lib.NetFx/Lib.NetFx.csproj
<Project Sdk="Microsoft.NET.Sdk">
  <ItemGroup>
    <Compile Include="..\Lib\**\*.cs" />
    <ProjectReference Include="..\Legacy\Legacy.csproj" />
  </ItemGroup>
</Project>
```

```xml path=src/Legacy/Legacy.csproj
<Project Sdk="Microsoft.NET.Sdk"></Project>
```

```csharp path=src/Legacy/Helper.cs
namespace Legacy;
public class Helper { }
```

## Expect

- src/Lib/Feature.cs:4 -> node:Legacy      # Lib.NetFx links Feature.cs and references Legacy

## Why

Opening the linking project covered a linked file as a target but not as a caller, so a reference only the linking project has dropped a real edge.
