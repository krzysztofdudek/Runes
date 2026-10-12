---
id: java-same-package-external-supertype-member-trap
language: java
category: trap
expectation: edge
cites: "JLS SE25 §6.4.1, §8.5 (member types inherited from a supertype shadow a type of the package)"
---

## Rule

KNOWN LIMIT, documented rather than fixed. A class inherits the member types of its supertypes, and an inherited member type shadows a type of the package. When the supertype is outside the repository (`ExternalBase` below) the extractor cannot know which member types it declares, so a simple name that is also a type of the package binds to the package's type. The edge is false exactly when `ExternalBase` really declares a member type `Owner`, and that needs a name collision across a library boundary and a split of the package over another owner. A supertype in the repository is handled (see java-same-package-inherited-member-type-edge).

## Files

```java path=src/main/java/com/a/Owner.java owner=a
package com.a;
public class Owner {}
```

```java path=src/main/java/com/a/Use.java owner=use
package com.a;
class Use extends ExternalBase {
  Owner owner;
}
```

## Expect

- src/main/java/com/a/Use.java:3 -> node:a      # edge assumed; false only when ExternalBase declares its own member type Owner

## Why

Silencing every use in a class with an external supertype would drop most real same-package edges, since most classes extend something from a library.
