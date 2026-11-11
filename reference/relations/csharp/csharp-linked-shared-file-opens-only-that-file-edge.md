---
id: csharp-linked-shared-file-opens-only-that-file-edge
language: csharp
category: trap
expectation: edge
cites: "MSBuild — a `<Compile Include>` outside the project's directory adds exactly the files it names to the project's compilation; C# spec §12.8.10.3 (extension method invocations: only methods of types the compilation can see)"
---

## Rule

The layout of a microservice solution: EventBusRabbitMQ compiles one shared file, `..\Shared\ActivityExtensions.cs`, through a linked `Compile` item, and Basket.API and OrderProcessor reference EventBusRabbitMQ. Catalog.API and WebApp each declare `AddApplicationServices` in a static class of the global namespace, which C# reads before the usings, but neither of them is referenced by Basket.API or OrderProcessor. The linked item adds the one file to EventBusRabbitMQ and nothing else, so the reference graph stays closed: the two global methods are out of reach, and each `Program.cs` binds its own project's method through its global using.

## Files

```xml path=src/EventBus/EventBus.csproj
<Project Sdk="Microsoft.NET.Sdk"></Project>
```

```xml path=src/EventBusRabbitMQ/EventBusRabbitMQ.csproj
<Project Sdk="Microsoft.NET.Sdk">
  <ItemGroup>
    <Compile Include="..\Shared\ActivityExtensions.cs" Link="ActivityExtensions.cs" />
  </ItemGroup>
  <ItemGroup>
    <ProjectReference Include="..\EventBus\EventBus.csproj" />
  </ItemGroup>
</Project>
```

```csharp path=src/Shared/ActivityExtensions.cs
using System.Diagnostics;
internal static class ActivityExtensions
{
    public static void SetExceptionTags(this Activity activity, Exception ex) { }
}
```

```xml path=src/Basket.API/Basket.API.csproj
<Project Sdk="Microsoft.NET.Sdk.Web">
  <ItemGroup>
    <ProjectReference Include="..\EventBusRabbitMQ\EventBusRabbitMQ.csproj" />
  </ItemGroup>
</Project>
```

```csharp path=src/Basket.API/GlobalUsings.cs
global using eShop.Basket.API.Extensions;
```

```csharp path=src/Basket.API/Extensions/Extensions.cs owner=Basket.API.Extensions
namespace eShop.Basket.API.Extensions;
public static class Extensions
{
    public static void AddApplicationServices(this IHostApplicationBuilder builder) { }
}
```

```csharp path=src/Basket.API/Program.cs
var builder = WebApplication.CreateBuilder(args);
builder.AddApplicationServices();
```

```xml path=src/OrderProcessor/OrderProcessor.csproj
<Project Sdk="Microsoft.NET.Sdk.Worker">
  <ItemGroup>
    <ProjectReference Include="..\EventBusRabbitMQ\EventBusRabbitMQ.csproj" />
  </ItemGroup>
</Project>
```

```csharp path=src/OrderProcessor/GlobalUsings.cs
global using eShop.OrderProcessor.Extensions;
```

```csharp path=src/OrderProcessor/Extensions/Extensions.cs owner=OrderProcessor.Extensions
namespace eShop.OrderProcessor.Extensions;
public static class Extensions
{
    public static void AddApplicationServices(this IHostApplicationBuilder builder) { }
}
```

```csharp path=src/OrderProcessor/Program.cs
var builder = Host.CreateApplicationBuilder(args);
builder.AddApplicationServices();
```

```xml path=src/Catalog.API/Catalog.API.csproj
<Project Sdk="Microsoft.NET.Sdk.Web">
  <ItemGroup>
    <ProjectReference Include="..\EventBusRabbitMQ\EventBusRabbitMQ.csproj" />
  </ItemGroup>
</Project>
```

```csharp path=src/Catalog.API/Extensions/Extensions.cs owner=Catalog.API.Extensions
public static class Extensions
{
    public static void AddApplicationServices(this IHostApplicationBuilder builder) { }
}
```

```xml path=src/WebApp/WebApp.csproj
<Project Sdk="Microsoft.NET.Sdk.Web"></Project>
```

```csharp path=src/WebApp/Extensions/Extensions.cs owner=WebApp.Extensions
public static class Extensions
{
    public static void AddApplicationServices(this IHostApplicationBuilder builder) { }
}
```

## Expect

- src/Basket.API/Program.cs:2 -> node:Basket.API.Extensions             # Catalog.API and WebApp are not referenced
- src/OrderProcessor/Program.cs:2 -> node:OrderProcessor.Extensions     # the same call, the same closed graph

## Why

A linked `Compile` item outside the project's directory made the whole project open, as if it could see every project of the repository, and so did every project that references it. The two global methods then stayed candidates, two owners at the level C# reads first, and both calls lost their edge.
