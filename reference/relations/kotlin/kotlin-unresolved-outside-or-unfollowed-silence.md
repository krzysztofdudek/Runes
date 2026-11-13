---
id: kotlin-unresolved-outside-or-unfollowed-silence
language: kotlin
category: trap
expectation: silence
cites: "Kotlin specification, Packages and imports"
---

## Rule

An import of a package the repository declares nothing in (a library's `kotlinx.coroutines.flow`, the JDK's `java.time`) leaves the repository: absent, `outside`. An import under a package of the repository that names nothing declared points into the repository: absent, `unfollowed`.

## Files

```kotlin path=k/app/Order.kt
package com.acme.app

class Order
```

```kotlin path=k/app/Use.kt
package com.acme.app

import kotlinx.coroutines.flow.Flow
import java.time.Instant
import com.acme.app.Missing

class Use
```

## Expect

- silence      # nothing binds another owner
- k/app/Use.kt:3 answers absent outside
- k/app/Use.kt:4 answers absent outside
- k/app/Use.kt:5 answers absent unfollowed

## Why

The repository declares the package `com.acme.app`, so a name in it that binds no file is one the readers could not follow.
