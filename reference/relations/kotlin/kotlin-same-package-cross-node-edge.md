---
id: kotlin-same-package-cross-node-edge
language: kotlin
category: usage-site
expectation: edge
cites: "Kotlin spec — Packages and imports (same-package names need no import; explicit imports, then the package, then star imports, then default imports)"
---

## Rule

Two files in the same package use each other's declarations without an import. When those files belong to different nodes the dependency is real, and the extractor binds it: a bare simple name in a type position (or a capitalised receiver or callee) gives the candidate `<package>.<Name>`, resolved through the shared JVM namespace to the one file that declares it. The binding follows the language's precedence: an explicit import or alias of the name wins and a declaration of the file itself wins (neither gives a same-package candidate), a type of the package beats a star import and the default imports (so a project `List` of the package shadows `kotlin.collections.List`, as in Kotlin), and a name no file of the package declares binds to nothing, which is what keeps the stdlib names silent.

## Files

```kotlin path=src/a/Order.kt
package com.acme.orders
class Order
```

```kotlin path=src/b/Refund.kt
package com.acme.orders
class Refund(val order: Order)
```

## Expect

- src/b/Refund.kt:2 -> node:a      # same-package use without an import → edge to the node that declares Order

## Why

Without it neither tool sees that `Refund` depends on `Order`, whatever node each lives in.
