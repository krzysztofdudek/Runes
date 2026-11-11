---
id: csharp-extension-beside-instance-method-of-other-shape-edge
language: csharp
category: usage-site
expectation: edge
cites: "C# spec §12.8.10.3 (an extension method is considered when no instance method is applicable); §12.6.4.2 (an applicable function member takes the call's arguments and type arguments)"
---

## Rule

`IConfig` of node core declares `Get(string)`, and node ext adds the generic extension `Get<T>(this IConfig, string)`. `config.Get<Branding>("branding")` writes a type argument the instance method cannot take, so it is the extension's. `config.Get("branding")` on line 6 is the instance method's and gives no edge.

## Files

```csharp path=src/core/IConfig.cs
namespace App;
public interface IConfig { object Get(string key); }
public class Branding { }
```

```csharp path=src/ext/ConfigExtensions.cs
namespace App;
public static class ConfigExtensions { public static T Get<T>(this IConfig c, string key) => (T)c.Get(key); }
```

```csharp path=src/web/Page.cs
namespace App;
public class Page {
  private readonly IConfig _config;
  public object Render() {
    var typed = _config.Get<Branding>("branding");
    return _config.Get("branding");
  }
}
```

## Expect

- src/ext/ConfigExtensions.cs:2 -> node:core
- src/web/Page.cs:3 -> node:core
- src/web/Page.cs:5 -> node:ext        # the generic extension; and node core for Branding
- src/web/Page.cs:5 -> node:core

## Why

An instance method of the same name ends the lookup only when the call fits it; the counts of type arguments and arguments are what the declarations say without their types.
