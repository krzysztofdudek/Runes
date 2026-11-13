---
id: java-on-demand-library-name-outside-silence
language: java
category: builtin
expectation: silence
cites: "JLS SE25 §7.5.2 (type-import-on-demand), §6.4.1 (a type of the package shadows an on-demand import)"
---

## Rule

A simple name the file's package does not declare and an on-demand import of a library can give (`List` under `import java.util.*;`) binds no file of the repository and leaves it: absent, `outside`, as an explicit `import java.util.List;` does. A name that only the repository's own on-demand packages could give and that none of them declares was not followed: absent, `unfollowed`.

## Files

```java path=src/main/java/com/acme/model/Item.java owner=model
package com.acme.model;
public class Item {}
```

```java path=src/main/java/com/acme/app/Order.java owner=app
package com.acme.app;
import java.util.*;
class Order { List<String> lines; }
```

```java path=src/main/java/com/acme/app/Use.java owner=app
package com.acme.app;
import com.acme.model.*;
class Use { Item item; Missing missing; }
```

## Expect

- src/main/java/com/acme/app/Use.java:2 -> node:model
- src/main/java/com/acme/app/Order.java:3 answers absent outside
- src/main/java/com/acme/app/Use.java:3 answers absent unfollowed

## Why

`List` read as a name of the file's own package could not be told from a type of the repository that no file declares, the noise the `java.lang` readings removed for a simple name with no import. `Item` binds nothing on its line because the readers bind a simple name through the package and the on-demand import's own line carries the edge.
