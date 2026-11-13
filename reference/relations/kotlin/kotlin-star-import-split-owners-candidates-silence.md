---
id: kotlin-star-import-split-owners-candidates-silence
language: kotlin
category: trap
expectation: silence
cites: "Kotlin specification, Packages and imports (star imports); distinct-owner rule of the shared JVM namespace"
---

## Rule

A star import of a package whose top-level declarations two owners hold binds neither owner. The answer is ambiguous and names the declaring files, sorted.

## Files

```kotlin path=k/app/Order.kt
package com.acme.app

class Order
```

```kotlin path=k/other/Clock.kt
package com.acme.app

class Clock
```

```kotlin path=k/use/Use.kt
package com.acme.use

import com.acme.app.*

class Use
```

## Expect

- silence      # com.acme.app is split between the owners app and other
- k/use/Use.kt:3 answers ambiguous k/app/Order.kt, k/other/Clock.kt

## Why

The files let a consumer whose owners are finer than a package judge a star import, which names no type.
