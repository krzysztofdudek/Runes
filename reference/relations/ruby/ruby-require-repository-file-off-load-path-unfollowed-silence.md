---
id: ruby-require-repository-file-off-load-path-unfollowed-silence
language: ruby
category: import
expectation: silence
cites: "Ruby Kernel#require (searches $LOAD_PATH; a ./ path is read from the working directory) https://docs.ruby-lang.org/en/3.4/Kernel.html#method-i-require ; RubyGems Gem::Specification#require_paths https://guides.rubygems.org/specification-reference/#require_paths="
---

## Rule

Where the repository holds the file a plain `require` names but the readers cannot know it is on the load path, the use binds nothing and is the repository's: absent, `unfollowed`. `require 'spec_helper'` outside `spec/`, with `spec/spec_helper.rb` in the repository; and `require './lib/foo'` in `bin/run.rb`, which reads `lib/foo.rb` when run from the repository root. A name no such place holds leaves the repository: `require 'zlib'` is absent, `outside`, and so is `require 'helper'` where only the `lib/` of a gemspec under a fixture directory holds `helper.rb`, since a fixture's files are no place a file of the repository is required from, and its gemspec puts its roots on the load path of the files under it only.

## Files

```ruby path=spec/spec_helper.rb
RSPEC_ROOT = 1
```

```ruby path=lib/foo.rb
FOO = 1
```

```ruby path=spec/fixtures/gem/fixture.gemspec
Gem::Specification.new do |spec|
  spec.name = "fixture"
end
```

```ruby path=spec/fixtures/gem/lib/helper.rb
HELPER = 1
```

```ruby path=bin/run.rb
require 'spec_helper'
require './lib/foo'
require 'helper'
require 'zlib'
```

## Expect

- silence      # none of these binds a file on a load path the repository tells
- bin/run.rb:1 answers absent unfollowed
- bin/run.rb:2 answers absent unfollowed
- bin/run.rb:3 answers absent outside
- bin/run.rb:4 answers absent outside

## Why

Answered `outside`, the first two would read as uses of a gem; a consumer that reports what it could not follow must see them as the repository's files that it could not place.
