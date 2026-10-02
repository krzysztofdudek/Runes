---
id: kotlin-annotated-annotation-class-edge
language: kotlin
category: trap
expectation: edge
cites: "Kotlin docs — Annotations (declaring an annotation, meta-annotations); Dagger — Qualifiers; Runes issue 018"
---

## Rule

An annotation class that carries meta-annotations and has neither a parameter list nor a body (a Dagger or Hilt qualifier, a JUnit marker) is ordinary Kotlin 1.x, but the shipped tree-sitter-kotlin grammar reads it at the top level as an annotated script expression, with no ERROR node. The same happens to an annotated enum with one entry and an annotated `data object`, `expect class` or `const val`. The extractor reads such a declaration from its leading tokens, as it reads a damaged one, so the file declares the annotation and an import of it edges.

## Files

```kotlin path=src/di/Qualifiers.kt
package com.acme.di
import javax.inject.Qualifier

@Qualifier
@Retention(AnnotationRetention.RUNTIME)
annotation class Payments
```

```kotlin path=src/pay/Single.kt
package com.acme.pay
@Serializable
enum class Single {
  ONLY
}
```

```kotlin path=src/c/Use.kt
package com.acme.app
import com.acme.di.Payments
import com.acme.pay.Single
class C
```

## Expect

- src/c/Use.kt:2 -> node:di       # the meta-annotated annotation class is declared
- src/c/Use.kt:3 -> node:pay      # the annotated enum with one entry is declared

## Why

Before the fix both files declared nothing, so the two imports found no declaring file and stayed silent: every qualifier module looked independent of its users.
