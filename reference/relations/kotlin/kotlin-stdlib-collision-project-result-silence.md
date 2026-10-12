---
id: kotlin-stdlib-collision-project-result-silence
language: kotlin
category: trap
expectation: silence
cites: "Kotlin spec — Packages and imports (stdlib collision); research Form B1/F3 (collision trap)"
---

## Rule

A project may declare a type whose simple name collides with an implicit stdlib name — here `com.acme.util.Result` vs the implicit `kotlin.Result`. A file that uses the bare `Result` with no import binds (in Kotlin) the implicit `kotlin.Result`. The extractor gives the bare usage only the same-package candidate `com.acme.app.Result`, which no file declares, so the project `Result` of ANOTHER package is never mis-bound. (Had the file been in `com.acme.util`, the package type would shadow the stdlib one, as in Kotlin, and the extractor would bind it: kotlin-same-package-test-to-main-edge.)

## Files

```kotlin path=src/u/Result.kt
package com.acme.util
class Result
```

```kotlin path=src/c/Use.kt
package com.acme.app
fun f(): Result<Int> = TODO()
```

## Expect

- silence      # bare `Result` usage in another package → no same-package candidate declares it; the project `com.acme.util.Result` is never mis-bound

## Why

The stdlib-collision trap is the single biggest FP source for a bare-name binder; binding a bare name only to the file's own package closes it.
