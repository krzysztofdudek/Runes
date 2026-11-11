---
id: csharp-compile-remove-beside-unresolved-include-edge
language: csharp
category: trap
expectation: edge
cites: "MSBuild — a `<Compile Include>` added after a `<Compile Remove>` puts the files it names back into the compilation; a property such as `$(TargetPlatform)` is known only when the project is built"
---

## Rule

The per-platform layout: App removes `Platform/**` from its default items and puts one platform's folder back with `<Compile Include="Platform/$(TargetPlatform)/**/*.cs" />`. A reader that does not evaluate `$(TargetPlatform)` cannot tell which folder comes back, so it cannot take any file under `Platform/` out of the compilation: `Clipboard` in App and in Web, which references App, binds the platform file.

## Files

```xml path=src/App/App.csproj
<Project Sdk="Microsoft.NET.Sdk">
  <ItemGroup>
    <Compile Remove="Platform/**" />
    <Compile Include="Platform/$(TargetPlatform)/**/*.cs" />
  </ItemGroup>
</Project>
```

```csharp path=src/App/Platform/Windows/Clipboard.cs
namespace App;
public class Clipboard { }
```

```csharp path=src/App/Api.cs
namespace App;
public class Api {
  Clipboard _c;
}
```

```xml path=src/Web/Web.csproj
<Project Sdk="Microsoft.NET.Sdk">
  <ItemGroup>
    <ProjectReference Include="..\App\App.csproj" />
  </ItemGroup>
</Project>
```

```csharp path=src/Web/Page.cs
namespace App;
public class Page {
  Clipboard _c;
}
```

## Expect

- src/App/Api.cs:3 -> node:Windows      # the include may put Platform/Windows back
- src/Web/Page.cs:3 -> node:Windows     # and Web sees what App compiles

## Why

Reading the removal as certain beside an include this reader cannot place took every platform file out of the compilation and lost both edges, where an unknown must fail open.
