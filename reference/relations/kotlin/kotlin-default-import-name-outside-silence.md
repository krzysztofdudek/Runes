---
id: kotlin-default-import-name-outside-silence
language: kotlin
category: builtin
expectation: silence
cites: "Kotlin specification, Packages and imports (default imports: kotlin.*, kotlin.annotation.*, kotlin.collections.*, kotlin.comparisons.*, kotlin.io.*, kotlin.ranges.*, kotlin.sequences.*, kotlin.text.*; on the JVM java.lang.* and kotlin.jvm.*)"
---

## Rule

Kotlin imports the names of its default packages into every file, after the file's own package. A simple name of one of them written without an import (`String`, `List`, `Throws`), and an import under `kotlin.` or `java.`, bind no file of the repository and leave it: absent, `outside`. A simple name the package does not declare and no default package holds stays a use the readers could not follow: absent, `unfollowed`.

## Files

```kotlin path=k/app/Order.kt
package com.acme.app

class Order
```

```kotlin path=k/app/Use.kt
package com.acme.app

import kotlin.math.max
import java.time.Instant

class Use(val name: String, val items: List<Order>) {
    @Throws(Exception::class) fun at(): Instant = Instant.now()
    val gone: Gone? = null
}
```

## Expect

- silence      # nothing binds another owner
- k/app/Use.kt:3 answers absent outside
- k/app/Use.kt:4 answers absent outside
- k/app/Use.kt:6 answers absent outside
- k/app/Use.kt:6 answers resolved k/app/Order.kt
- k/app/Use.kt:7 answers absent outside
- k/app/Use.kt:8 answers absent unfollowed

## Why

Read as names of the file's own package, `String` and `List` could not be told from a type of the repository no file declares, so a consumer that reports what it could not follow would flag them in every Kotlin file. A lowercase call such as `listOf(...)` or `println(...)` gives no use at all, so it needs no answer.
