---
id: csharp-global-qualifier-member-access-silence
language: csharp
category: trap
expectation: silence
cites: "C# spec §7.8 (global:: alias-qualified name — the global namespace only); §12.8.23 (nameof yields a string); Runes issue 174"
---

## Rule

A member reached through `global::` binds nothing when the global namespace declares no such type: `global::Clock.Now()` and `global::Billing.Ledger.Post(0)` inside `namespace Shop.Web` stay silent although `Shop.Web` declares `Clock` and `Billing.Ledger`. A `global::` receiver inside `nameof(…)` produces a string, never a dependency, even when the global type exists.

## Files

```csharp path=src/web/Handler.cs
namespace Shop.Web;
class Handler {
  void Run() {
    global::Clock.Now();
    global::Billing.Ledger.Post(0);
    var name = nameof(global::Audit.Log.Write);
  }
}
```

```csharp path=src/decoy/Decoys.cs
namespace Shop.Web { public static class Clock { public static int Now() => 0; } }
namespace Shop.Web.Billing { public static class Ledger { public static void Post(int x) { } } }
```

```csharp path=src/audit/Log.cs
namespace Audit;
public static class Log { public static void Write() { } }
```

## Expect

- silence      # neither `Clock` nor `Billing.Ledger` is a global type, and nameof(…) names nothing

## Why

Binding a `global::` receiver to the enclosing namespace's type reports the dependency the author wrote `global::` to avoid.
