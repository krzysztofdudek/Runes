---
id: java-same-package-kotlin-class-edge
language: java
category: usage-site
expectation: edge
cites: "Kotlin/Java interoperability (one JVM namespace); JLS SE25 §7.6"
---

## Rule

A Java test uses a Kotlin class of its own package by its simple name. Java and Kotlin declare into one JVM namespace, so the same-package candidate `com.a.Order` finds the Kotlin declaration and the edge goes to the owner of the Kotlin file.

## Files

```kotlin path=src/main/kotlin/com/a/Order.kt owner=main
package com.a
class Order
```

```java path=src/test/java/com/a/OrderTest.java owner=tests
package com.a;
class OrderTest {
  Order order = new Order();
}
```

## Expect

- src/test/java/com/a/OrderTest.java:3 -> node:main      # the Kotlin class, no import

## Why

Mixed Java and Kotlin projects keep tests in Java next to Kotlin production code.
