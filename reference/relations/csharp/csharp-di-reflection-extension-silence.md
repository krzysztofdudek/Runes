---
id: csharp-di-reflection-extension-silence
language: csharp
category: dynamic
expectation: silence
cites: "C# — reflection strings (no static type reference); MS Learn — Type.GetType, dependency injection (registration names its types as generic method type arguments)"
---

## Rule

A reflection string (`Type.GetType("MyApp.Pay.Gateway")`) is not a static type reference. A type named ONLY inside a reflection string is not a real static dependency, so no cross-node edge may be emitted, even when that type exists in the graph. Dependency-injection registration is different: `services.AddScoped<IFoo, Foo>()` names its types as type arguments of a generic method, which the compiler binds, so each is a type reference like any other (csharp-generic-method-type-argument-edge). Here neither `IFoo` nor `Foo` is declared in the repository, so they resolve to nothing; only what the container hands out at run time stays invisible. An extension method call on a value (`order.Validate()`) binds at compile time and is resolved when an in-repo extension of that name is in scope (csharp-extension-via-owned-namespace); here none is declared, so it resolves to nothing.

## Files

```csharp path=src/c/Use.cs
using Microsoft.Extensions.DependencyInjection;
class Startup {
  void Configure(IServiceCollection services) { services.AddScoped<IFoo, Foo>(); }
  void R() { var t = System.Type.GetType("MyApp.Pay.Gateway"); }
  void E(object order) { order.Validate(); }
}
```

```csharp path=src/pay/Gateway.cs
namespace MyApp.Pay;
public class Gateway {}
```

## Expect

- silence      # `MyApp.Pay.Gateway` appears only as a reflection STRING → not a static dependency → no edge

## Why

Reflection strings are dynamic: the compiler never sees the dependency, so treating them as static references would invent edges. DI registration type arguments and extension methods are different, because C# binds both statically, which is why they have their own edge cases rather than a place in this silence. An earlier version of this case called `AddScoped<IFoo, Foo>()` statically unresolvable; it is not.
