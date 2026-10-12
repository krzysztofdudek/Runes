---
id: java-enum-constant-use-usage-silence
language: java
category: usage-site
expectation: silence
cites: "JLS SE25 §8.9 (enum types); research F21 (C36 in 06-14)"
---

## Rule

A qualified enum constant use `com.acme.model.Color.RED` references the enum TYPE `Color` at a usage site, carrying no import. A qualified name starting with a package segment gives no hint.

## Files

```java path=src/main/java/com/acme/model/Color.java
package com.acme.model;
public enum Color { RED, GREEN }
```

```java path=src/main/java/com/app/C.java
package com.app;
class C {
  Object m() { return com.acme.model.Color.RED; }
}
```

## Expect

- silence      # the qualified enum constant use is a usage site with no import → no hint

## Why

A name qualified by its package is an expression-position chain, not a type position, so it is silent.
