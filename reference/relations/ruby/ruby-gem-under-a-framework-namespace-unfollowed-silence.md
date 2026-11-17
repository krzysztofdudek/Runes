---
id: ruby-gem-under-a-framework-namespace-unfollowed-silence
language: ruby
category: trap
expectation: silence
cites: "Ruby Kernel#require (searches $LOAD_PATH) https://docs.ruby-lang.org/en/3.4/Kernel.html#method-i-require ; RubyGems name and file conventions (a gem rack-attack is required as rack/attack and declares Rack::Attack) https://guides.rubygems.org/name-your-gem/"
---

## Rule

A gem that lives under a framework's namespace (`rack-attack`, required as `require 'rack/attack'`) declares its own constants under that namespace, though it is not the framework and holds no `lib/rack.rb`. The edge walk takes the framework namespace for external and binds nothing to them, so `classifyUse` asks, for each prefix of the name as written, whether the file that prefix's require name loads declares it: `Rack::Attack` is declared by `lib/rack/attack.rb`, which `require 'rack/attack'` loads, so `Rack::Attack`, `Rack::Attack::Throttle` and any name under them are the repository's that the readers could not follow: absent, `unfollowed`. `Rack::Request` has no such prefix (no `lib/rack.rb`, no `lib/rack/request.rb`): it is the framework's, absent, `outside`.

## Files

```ruby path=lib/rack/attack.rb
module Rack
  class Attack
  end
end
```

```ruby path=lib/rack/attack/throttle.rb
module Rack
  class Attack
    class Throttle
    end
  end
end
```

```ruby path=spec/attack_spec.rb
class AttackSpec
  def a = Rack::Attack.new
  def b = Rack::Attack::Throttle.new
  def c = Rack::Attack::Missing.new
  def d = Rack::Request.new({})
end
```

## Expect

- silence      # a framework namespace never binds in the edge walk
- spec/attack_spec.rb:2 answers absent unfollowed
- spec/attack_spec.rb:3 answers absent unfollowed
- spec/attack_spec.rb:4 answers absent unfollowed
- spec/attack_spec.rb:5 answers absent outside

## Why

The gems named `rack-*`, `rspec-*`, `minitest-*` and `sinatra-*`, and a Rails engine's extensions, all live under a framework's namespace; deciding by the namespace's root alone would read every use of their own constants as one that leaves the repository.
