---
id: java-meta-annotation-usage-silence
language: java
category: builtin
expectation: silence
cites: "JLS SE25 §7.3, §9.6; research C1 (C11 in 06-14)"
---

## Rule

The meta-annotations `@Override @Deprecated @SuppressWarnings` come from `java.lang` /
`java.lang.annotation` and need no import. Used at a usage site with no
`import_declaration`, each gives only the same-package candidate (`com.app.Override`, …), which no file
declares, so the extractor finds no edge.

## Files

```java path=src/main/java/com/app/C.java
package com.app;
class C {
  @Override @Deprecated @SuppressWarnings("x")
  public String toString() { return ""; }
}
```

## Expect

- silence      # meta-annotations are auto-imported and used at a usage site → no hint

## Why

An annotation with no import binds only to a type of its own package; these are in no package of the repository.
