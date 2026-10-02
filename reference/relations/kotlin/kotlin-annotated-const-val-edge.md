---
id: kotlin-annotated-const-val-edge
language: kotlin
category: trap
expectation: edge
cites: "Kotlin docs — Properties (compile-time constants); Kotlin docs — Object declarations (data objects); Runes issue 018"
---

## Rule

An annotated `const val` at the top level (`@Keep` above `const val`) is read by the shipped grammar as an assignment, and an annotated body-less `data object` as an annotated script expression, both with no ERROR node. The extractor reads each from its leading tokens: the constant is declared (with its file facade) and the object is declared as a type, so imports of both edge.

## Files

```kotlin path=src/cfg/Limits.kt
package com.acme.cfg
@Keep
const val MAX_RETRIES = 3

@Keep
data object Defaults
```

```kotlin path=src/c/Use.kt
package com.acme.app
import com.acme.cfg.MAX_RETRIES
import com.acme.cfg.Defaults
class C
```

## Expect

- src/c/Use.kt:2 -> node:cfg      # the annotated const val is declared
- src/c/Use.kt:3 -> node:cfg      # the annotated data object is declared
