---
id: kotlin-same-package-test-to-main-edge
language: kotlin
category: usage-site
expectation: edge
cites: "Kotlin spec — Packages and imports; Gradle source sets (src/main/kotlin, src/test/kotlin)"
---

## Rule

A Kotlin test in the package of the class it tests uses it without an import. The test source set sees the main one, so the use is a dependency of the test's owner on the main owner. The package's own `Result` (here a main class) also shadows the stdlib `kotlin.Result` in the test, as in Kotlin, so its use binds too. A call `Owner(...)` and a receiver `Owner.make()` are read as well as a type.

## Files

```kotlin path=src/main/kotlin/com/a/Owner.kt owner=main
package com.a
class Owner {
  companion object { fun make() = Owner() }
}
```

```kotlin path=src/test/kotlin/com/a/OwnerTest.kt owner=tests
package com.a
class OwnerTest {
  val owner: Owner = Owner()
  val made = Owner.make()
  val outcome: Result = Result()
}
```

```kotlin path=src/main/kotlin/com/a/Result.kt owner=main
package com.a
class Result
```

## Expect

- src/test/kotlin/com/a/OwnerTest.kt:3 -> node:main      # type position and constructor call, one edge
- src/test/kotlin/com/a/OwnerTest.kt:4 -> node:main      # capitalised receiver
- src/test/kotlin/com/a/OwnerTest.kt:5 -> node:main      # the package's own `Result` shadows `kotlin.Result`

## Why

A test that depends on its production code needs that relation declared in the graph.
