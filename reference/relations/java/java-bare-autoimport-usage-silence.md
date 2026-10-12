---
id: java-bare-autoimport-usage-silence
language: java
category: builtin
expectation: silence
cites: "JLS SE25 §7.3 (automatic java.lang import); research C1 (C10 in 06-14)"
---

## Rule

Every compilation unit implicitly imports every public type of `java.lang`
(JLS §7.3). A bare `String s;` / `Object o;` / `extends Exception` / `throws Exception`
has NO import line. Each name gives only the same-package candidate (`com.app.String`, …), and
no file of the repository declares one, so nothing binds: the name is never read through
`java.lang`, and a repository type of that name in another package is never mistaken for it.

## Files

```java path=src/main/java/com/app/C.java
package com.app;
class C extends Exception {
  String s;
  Object o;
  void m() throws Exception { @Override int x = 0; }
}
```

## Expect

- silence      # no import, and no type of package com.app named like a java.lang type → nothing binds

## Why

Auto-imported java.lang names appear with no import; they can only bind to a same-named type of
the file's own package (which would shadow them in Java too), and there is none.
