---
id: kotlin-implicit-stdlib-no-import-silence
language: kotlin
category: builtin
expectation: silence
cites: "Kotlin spec — Packages and imports (implicit stdlib imports); research Form B1/F3"
---

## Rule

Stdlib packages (`kotlin.*`, plus platform `java.lang` on JVM) are implicitly imported into every Kotlin file — `List`, `Pair`, `Result`, `listOf` are usable with NO import line. Such a name gives only the same-package candidate (`com.acme.List`, …); no file of the package declares one, so nothing binds, and a same-named project type of ANOTHER package can never be mis-bound through an implicit stdlib usage. (A project type of the file's own package does shadow the stdlib name in Kotlin, and does bind: kotlin-stdlib-collision-project-result-silence.)

## Files

```kotlin path=src/c/Use.kt
package com.acme
fun f(): List<String> = listOf("a")
val p: Pair<Int, Int> = 1 to 2
fun g(): Result<Int> = Result.success(1)
```

## Expect

- silence      # implicit stdlib names used with no import → no import node → nothing emitted

## Why

Resolving a bare stdlib simple name to an in-graph same-named type of another package is the classic collision FP; only a declaration of the file's own package is a candidate, so it cannot happen.
