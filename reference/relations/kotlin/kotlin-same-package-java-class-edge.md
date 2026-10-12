---
id: kotlin-same-package-java-class-edge
language: kotlin
category: usage-site
expectation: edge
cites: "Kotlin/Java interoperability (one JVM namespace)"
---

## Rule

A Kotlin test uses a Java class of its own package by its simple name. Java and Kotlin declare into one JVM namespace, so the same-package candidate `com.a.Order` finds the Java declaration and the edge goes to the owner of the Java file.

## Files

```java path=src/main/java/com/a/Order.java owner=main
package com.a;
public class Order {}
```

```kotlin path=src/test/kotlin/com/a/OrderTest.kt owner=tests
package com.a
class OrderTest {
  val order = Order()
}
```

## Expect

- src/test/kotlin/com/a/OrderTest.kt:3 -> node:main      # the Java class, no import

## Why

Mixed Kotlin and Java projects test Java production code from Kotlin tests.
