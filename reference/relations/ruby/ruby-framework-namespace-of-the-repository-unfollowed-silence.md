---
id: ruby-framework-namespace-of-the-repository-unfollowed-silence
language: ruby
category: trap
expectation: silence
cites: "Ruby constant lookup (lexical scope, then ancestors, then Object) https://docs.ruby-lang.org/en/3.4/syntax/modules_and_classes_rdoc.html"
---

## Rule

The edge walk takes a framework namespace (`Rack`, `Rails`, `RSpec`) for external whatever the repository declares, so inside that framework's own repository a reference to one of its constants binds nothing. The repository declares the namespace, so `classifyUse` answers such a use as the repository's that the readers could not follow: absent, `unfollowed`, written whole (`Rack::Utils`) or bare inside `module Rack` (`Utils`), as it answers any constant under a namespace the repository declares. A core class (`String`) stays Ruby's, though the repository reopens it: absent, `outside`.

## Files

```ruby path=lib/rack/rack.rb
module Rack
end
```

```ruby path=lib/utils/utils.rb
module Rack
  module Utils
  end
end
```

```ruby path=lib/core_ext/string.rb
class String
end
```

```ruby path=lib/content_length/content_length.rb
module Rack
  class ContentLength
    def a = Rack::Utils.escape(1)
    def b = Utils.escape(2)
    def c = String.new
  end
end
```

## Expect

- silence      # a framework namespace never binds in the edge walk
- lib/content_length/content_length.rb:3 answers absent unfollowed
- lib/content_length/content_length.rb:4 answers absent unfollowed
- lib/content_length/content_length.rb:5 answers absent outside

## Why

In the rack repository about two thousand uses of its own `Rack::` constants would otherwise read as uses that leave the repository, and a consumer that reports what it could not follow would stay quiet about all of them, while the same constant written bare inside `module Rack` is reported.
