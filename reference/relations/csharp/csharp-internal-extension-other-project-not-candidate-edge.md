---
id: csharp-internal-extension-other-project-not-candidate-edge
language: csharp
category: trap
expectation: edge
cites: "C# spec §12.8.10.3 (extension method invocations: only accessible methods are candidates); §7.5.2 (an internal class is accessible only within its assembly)"
---

## Rule

Web references Core and Hosting. Both declare an `AddServices` extension in a static class of the global namespace; Hosting's class is `internal`, so its method is not accessible in Web, and `builder.AddServices()` binds Core's.

## Files

```xml path=src/Core/Core.csproj
<Project Sdk="Microsoft.NET.Sdk"></Project>
```

```csharp path=src/Core/Extensions.cs
public static class CoreExtensions
{
    public static void AddServices(this IHostApplicationBuilder builder) { }
}
```

```xml path=src/Hosting/Hosting.csproj
<Project Sdk="Microsoft.NET.Sdk"></Project>
```

```csharp path=src/Hosting/Extensions.cs
internal static class HostingExtensions
{
    public static void AddServices(this IHostApplicationBuilder builder) { }
}
```

```xml path=src/Web/Web.csproj
<Project Sdk="Microsoft.NET.Sdk.Web">
  <ItemGroup>
    <ProjectReference Include="..\Core\Core.csproj" />
    <ProjectReference Include="..\Hosting\Hosting.csproj" />
  </ItemGroup>
</Project>
```

```csharp path=src/Web/Program.cs
var builder = WebApplication.CreateBuilder(args);
builder.AddServices();
```

## Expect

- src/Web/Program.cs:2 -> node:Core      # Hosting's extension class is internal to Hosting

## Why

An internal extension class of a referenced project is the usual way a library keeps its registration helpers to itself; reading it as a candidate made every call of the public one ambiguous.
