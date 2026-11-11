---
id: csharp-this-field-of-other-part-instance-method-silence
language: csharp
category: trap
expectation: silence
cites: "C# spec §15.2.7 (partial declarations: the members of every part are members of the one type); §12.8.14 (this access); §12.8.10.3 (an extension method is considered when no instance method is applicable)"
---

## Rule

`this._config` names the field `_config` of the class, whichever part declares it, exactly as the bare `_config` does. `Page.cs` declares the field as an `IConfig`, whose own `Get(string)` of node core takes the call, so `this._config.Get(key)` in `Page.Render.cs` is no call of the extension `Get(this IConfig, string)` of node ext. The bare `_config.Get(key)` on line 4 gives none either.

## Files

```csharp path=src/core/IConfig.cs
namespace App;
public interface IConfig { object Get(string key); }
```

```csharp path=src/ext/ConfigExtensions.cs
namespace App.Ext;
public static class ConfigExtensions { public static object Get(this App.IConfig c, string key) => null; }
```

```csharp path=src/core/Page.cs
namespace App;
public partial class Page {
  private readonly IConfig _config;
}
```

```csharp path=src/core/Page.Render.cs
using App.Ext;
namespace App;
public partial class Page {
  public object Bare(string key) => _config.Get(key);
  public object Render(string key) => this._config.Get(key);
}
```

## Expect

- src/ext/ConfigExtensions.cs:2 -> node:core
- silence      # src/core/Page.Render.cs:4 and :5 are calls of IConfig's own Get

## Why

The type of `this.<field>` was read only from the calling file, so the call through `this` kept an extension edge that the same call without `this` did not give.
