---
id: java-annotation-use-usage-silence
language: java
category: usage-site
expectation: silence
cites: "JLS SE25 §9.6, §9.7 (annotation use); research F6 (C26 in 06-14)"
---

## Rule

A user-package annotation use `@com.acme.audit.Audit` is a usage site referencing the annotation type, but it carries no import. An annotation written with its package-qualified name has no simple-name form to read, so the extractor emits no hint (a simple-name annotation of the referencing file's own package binds: see java-same-package-qualified-and-annotation-edge).

## Files

```java path=src/main/java/com/acme/audit/Audit.java
package com.acme.audit;
public @interface Audit {}
```

```java path=src/main/java/com/app/C.java
package com.app;
@com.acme.audit.Audit
class C {}
```

## Expect

- silence      # annotation use is a usage site with no import → no hint, even though Audit is in-graph

## Why

A package-qualified annotation name is not a type position; only a simple name of the own package binds.
