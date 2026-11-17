---
id: ruby-framework-entry-file-only-requires-unfollowed-edge
language: ruby
category: trap
expectation: edge
cites: "Ruby Kernel#require (searches $LOAD_PATH) https://docs.ruby-lang.org/en/3.4/Kernel.html#method-i-require ; sinatra's lib/sinatra.rb, which only requires sinatra/main https://github.com/sinatra/sinatra/blob/main/lib/sinatra.rb"
---

## Rule

A framework's entry file may declare nothing and only require the files that do: sinatra's `lib/sinatra.rb` requires `sinatra/main`, and `module Sinatra` is declared in `lib/sinatra/base.rb`. The root's own require name then proves nothing, but a longer prefix of the name does: `require 'sinatra/base'` loads `lib/sinatra/base.rb`, which declares `Sinatra::Base`, so `Sinatra::Base` and any name under it are the repository's that the readers could not follow: absent, `unfollowed`. The entry file's own require binds as any plain require does.

## Files

```ruby path=lib/sinatra.rb
require 'sinatra/base'
```

```ruby path=lib/sinatra/base.rb
module Sinatra
  class Base
  end
end
```

```ruby path=test/app/app_test.rb
class AppTest
  def a = Sinatra::Base.new
  def b = Sinatra::Base::Missing
end
```

## Expect

- lib/sinatra.rb:1 -> node:sinatra
- lib/sinatra.rb:1 answers resolved lib/sinatra/base.rb
- test/app/app_test.rb:2 answers absent unfollowed
- test/app/app_test.rb:3 answers absent unfollowed

## Why

In the sinatra repository about a hundred uses of `Sinatra::Base` and the other constants with a file of their own name would otherwise read as uses that leave the repository, because `lib/sinatra.rb` declares no `Sinatra`.
