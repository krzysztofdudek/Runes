---
id: csharp-global-qualifier-member-access-edge
language: csharp
category: usage-site
expectation: edge
cites: "C# spec §7.8 (global:: alias-qualified name); §12.8.7 (member access — `global::X.M` looks `X` up in the global namespace, and reads further segments only while they name namespaces); Runes issue 174"
---

## Rule

A static member reached through `global::` names its type from the global namespace: `global::Clock.Now()`, `global::Billing.Ledger.Post(…)`, `global::Clock.Zone` and `global::Billing.Ledger.Entries.Clear()` depend on the global `Clock` and on `Billing.Ledger`, never on the same-named types of the enclosing namespace `Shop.Web`. A local or field named `Clock` does not shadow `global::Clock`.

## Files

```csharp path=src/web/Handler.cs
namespace Shop.Web;
class Handler {
  int Clock;
  void Run() {
    var now = global::Clock.Now();
    global::Billing.Ledger.Post(Clock);
    var zone = global::Clock.Zone;
    global::Billing.Ledger.Entries.Clear();
  }
}
```

```csharp path=src/time/Clock.cs
public static class Clock { public static int Now() => 0; public static int Zone; }
```

```csharp path=src/billing/Ledger.cs
namespace Billing;
public static class Ledger { public static void Post(int x) { } public static class Entries { public static void Clear() { } } }
```

```csharp path=src/decoy/Decoys.cs
namespace Shop.Web { public static class Clock { public static int Now() => 0; public static int Zone; } }
namespace Shop.Web.Billing { public static class Ledger { public static void Post(int x) { } } }
```

## Expect

- src/web/Handler.cs:5 -> node:time       # global::Clock.Now() → the global Clock, never Shop.Web.Clock (node:decoy)
- src/web/Handler.cs:6 -> node:billing    # global::Billing.Ledger.Post(…) → Billing.Ledger, never Shop.Web.Billing.Ledger (node:decoy)
- src/web/Handler.cs:7 -> node:time       # global::Clock.Zone → the global Clock; the field Clock does not shadow it
- src/web/Handler.cs:8 -> node:billing    # global::Billing.Ledger.Entries.Clear() → Billing.Ledger

## Why

Generated code (gRPC and protobuf stubs, source generators) writes every type it calls through `global::`; reading nothing there drops each of those calls, and reading them through the enclosing namespaces binds the type the generator stepped past.
