---
id: csharp-generic-method-type-argument-edge
language: csharp
category: usage-site
expectation: edge
cites: "C# spec — method invocations (the type arguments of a generic method); §8.4 (constructed types); MS Learn — dependency injection (AddScoped<TService, TImplementation>), GetRequiredService<T>"
---

## Rule

A type named only in the type-argument list of a generic METHOD is a type reference, exactly like a type argument of a generic type. The compiler binds it: `services.AddScoped<IOrderRepository, SqlOrderRepository>()`, `sp.GetRequiredService<ShopDbContext>()`, `Substitute.For<IClock>()` and `System.Array.Empty<Order>()` each depend statically on the named types. Under `using Shop.Core;` the bare argument acquires the `Shop.Core.<Name>` candidate and binds the node that declares it. Only the type arguments are references; the method's own name is never read as a type (csharp-generic-method-name-not-a-type-silence).

## Files

```csharp path=src/app/Startup.cs
using Microsoft.Extensions.DependencyInjection;
using Shop.Core;
using Shop.Infrastructure;
class Startup {
  void Configure(IServiceCollection services) {
    services.AddScoped<IOrderRepository, SqlOrderRepository>();
  }
  object Resolve(System.IServiceProvider sp) {
    return sp.GetRequiredService<ShopDbContext>();
  }
  object Fake() {
    return Substitute.For<IClock>();
  }
  object None() {
    return System.Array.Empty<Order>();
  }
}
```

```csharp path=src/core/Types.cs
namespace Shop.Core;
public interface IOrderRepository {}
public interface IClock {}
public class Order {}
```

```csharp path=src/infra/Persistence.cs
namespace Shop.Infrastructure;
public class SqlOrderRepository {}
public class ShopDbContext {}
```

## Expect

- src/app/Startup.cs:6 -> node:core      # AddScoped<IOrderRepository, …>: the service type binds Shop.Core.IOrderRepository
- src/app/Startup.cs:6 -> node:infra     # AddScoped<…, SqlOrderRepository>: the implementation type binds Shop.Infrastructure.SqlOrderRepository
- src/app/Startup.cs:9 -> node:infra     # GetRequiredService<ShopDbContext>() on a value receiver
- src/app/Startup.cs:12 -> node:core     # Substitute.For<IClock>() on a type-name receiver
- src/app/Startup.cs:15 -> node:core     # System.Array.Empty<Order>() on a qualified receiver

## Why

Dependency-injection registration, service location, mocks and generic factories are the most common places a C# composition root names another project's types, and in Clean Architecture code the registration `AddScoped<IUser, CurrentUser>()` is often the only line where the web project names them. Missing these hid real undeclared dependencies.
