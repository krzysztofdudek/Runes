---
id: ruby-framework-with-no-root-file-unfollowed-silence
language: ruby
category: trap
expectation: silence
cites: "Ruby Kernel#require (searches $LOAD_PATH) https://docs.ruby-lang.org/en/3.4/Kernel.html#method-i-require ; rspec-core, required as rspec/core, with no lib/rspec.rb https://github.com/rspec/rspec-core/tree/main/lib"
---

## Rule

A part of a framework split into several gems may hold no file for the namespace's root: rspec-core is required as `require 'rspec/core'` and has no `lib/rspec.rb`. Each prefix of the name is read through the file its require name loads, the namespace lowercased (`RSpec`, `rspec`) and every later name underscored (`RakeTask`, `rake_task`): `RSpec::Core::RakeTask` is declared by `lib/rspec/core/rake_task.rb`, so it is the repository's that the readers could not follow: absent, `unfollowed`, written in a rake file outside `lib/`, whose load path is `lib/`. `RSpec::Mocks` belongs to another gem, and no file of the repository answers its require name: absent, `outside`.

## Files

```ruby path=lib/rspec/core/rake_task.rb
module RSpec
  module Core
    class RakeTask
    end
  end
end
```

```ruby path=tasks/spec.rake
RSpec::Core::RakeTask.new(:spec)
RSpec::Mocks.setup
```

## Expect

- silence      # a framework namespace never binds in the edge walk
- tasks/spec.rake:1 answers absent unfollowed
- tasks/spec.rake:2 answers absent outside

## Why

rspec-core, rspec-mocks, rspec-expectations and rspec-support each declare their part of `RSpec` and none holds `lib/rspec.rb`; deciding by the namespace's root alone would read every use of their own constants as one that leaves the repository.
