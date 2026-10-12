---
id: java-same-package-no-import-silence
language: java
category: usage-site
expectation: silence
cites: "JLS SE25 §6.3, §7.6 (same-package simple-name visibility); research A2 (C1/C2 in 06-14)"
---

## Rule

A same-package top-level type is referenceable by simple name with NO `import` (JLS §7.6). `class Child extends Parent { Sibling s; }` references `Parent` and `Sibling` declared in sibling files of the same package by BARE SIMPLE NAME, and the extractor does bind them (see java-same-package-test-to-main-edge). Here all three files belong to ONE owner, so each reference resolves to the referencing file's own owner: that is intra-owner, not a relation, and the case expects silence. The cross-owner forms, the shadowing rules and the source-set rule have their own cases (java-same-package-*).

## Files

```java path=src/main/java/com/a/Parent.java
package com.a;
public class Parent {}
```

```java path=src/main/java/com/a/Sibling.java
package com.a;
public class Sibling {}
```

```java path=src/main/java/com/a/Child.java
package com.a;
class Child extends Parent {
  Sibling s;
}
```

## Expect

- silence      # Parent and Sibling resolve, but to the owner of the referencing file: no cross-owner edge

## Why

A reference inside one owner is never a dependency between owners, however it is spelled.
