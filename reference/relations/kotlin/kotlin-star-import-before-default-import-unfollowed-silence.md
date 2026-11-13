---
id: kotlin-star-import-before-default-import-unfollowed-silence
language: kotlin
category: trap
expectation: silence
cites: "Kotlin specification, Packages and imports (explicit imports, then the file's package, then star imports, then the default imports)"
---

## Rule

Kotlin reads a simple name through the file's star imports before its default imports. A name that a starred package of the repository declares (`Result`, `Pair` of `com.acme.model`) is the repository's even where `kotlin.*` holds the same name, so a use the readers do not bind to it stays one they could not follow: absent, `unfollowed`, never `outside`. A name no starred package of the repository declares and a default package holds (`Charsets`) leaves the repository.

## Files

```kotlin path=k/model/Result.kt
package com.acme.model

sealed class Result
```

```kotlin path=k/model/Pair.kt
package com.acme.model

data class Pair(val a: Int, val b: Int)
```

```kotlin path=k/app/Use.kt
package com.acme.app

import com.acme.model.*

class Use(val r: Result?, val p: Pair?) {
    val c: Charsets? = null
}
```

## Expect

- k/app/Use.kt:3 -> node:model      # the star import of a package one owner declares into
- k/app/Use.kt:5 answers absent unfollowed
- k/app/Use.kt:6 answers absent outside

## Why

The default reading of `Result` said the use left the repository, so a consumer would stay quiet about a use of the repository's own type.
