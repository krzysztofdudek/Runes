// Moved from Yggdrasil source/cli/tests/unit/relations/extractors/ruby-resolve.test.ts (vitest) to node:test; the assertions are unchanged.
import { describe, it, expect, beforeEach, afterEach } from '../../helpers/expect.mjs';
import path from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { makeResolvePathToFile, listedFileView } from '@chrisdudek/runes/relations';
import { gemspecRequirePaths } from '../../helpers/internal/relations.mjs';

// Ruby's `require_relative '<lit>'` resolves relative to the requiring file's directory,
// `.rb` appended. These tests build a real temp tree and drive the production
// makeResolvePathToFile (disk-backed existence) through the `ruby` branch.

describe('resolveRubyRequireRelative via makeResolvePathToFile (disk-backed)', () => {
  let root;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'ruby-resolve-'));
    mkdirSync(path.join(root, 'app', 'services'), { recursive: true });
    mkdirSync(path.join(root, 'app', 'models'), { recursive: true });
    writeFileSync(path.join(root, 'app', 'services', 'order_service.rb'), '# order\n', 'utf-8');
    writeFileSync(path.join(root, 'app', 'models', 'helper.rb'), '# helper\n', 'utf-8');
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("resolves a sibling require_relative './helper'", () => {
    const resolve = makeResolvePathToFile(root);
    expect(resolve('./helper', 'app/models/order.rb', 'ruby')).toBe('app/models/helper.rb');
  });

  it('resolves a bare relative name (no leading ./) appending .rb', () => {
    const resolve = makeResolvePathToFile(root);
    expect(resolve('helper', 'app/models/order.rb', 'ruby')).toBe('app/models/helper.rb');
  });

  it("resolves a parent-directory require_relative '../services/order_service'", () => {
    const resolve = makeResolvePathToFile(root);
    expect(resolve('../services/order_service', 'app/models/order.rb', 'ruby')).toBe(
      'app/services/order_service.rb',
    );
  });

  it('honors an explicit .rb extension without doubling it', () => {
    const resolve = makeResolvePathToFile(root);
    expect(resolve('./helper.rb', 'app/models/order.rb', 'ruby')).toBe('app/models/helper.rb');
  });

  it('MISS → undefined for a non-existent target (silence)', () => {
    const resolve = makeResolvePathToFile(root);
    expect(resolve('./nonexistent', 'app/models/order.rb', 'ruby')).toBeUndefined();
  });

  it('MISS → undefined when the relative path escapes the repo root', () => {
    const resolve = makeResolvePathToFile(root);
    expect(resolve('../../../etc/passwd', 'app/models/order.rb', 'ruby')).toBeUndefined();
  });
});

describe('a plain require, looked up on the repository\'s load path', () => {
  const resolverOf = (contents, isExcluded) => makeResolvePathToFile('/nonexistent', undefined, isExcluded, { files: listedFileView(Object.keys(contents), (p) => contents[p]) });
  const req = (r, specifier, from = 'app/a.rb') => r(specifier, from, 'ruby', false, undefined, 'require');
  const why = (r, specifier, from = 'app/a.rb') => r.explainMiss(specifier, from, 'ruby', false, undefined, 'require');

  it('binds the file under lib/ or a gemspec\'s require_paths, never beside the requiring file', () => {
    const r = resolverOf({ 'app/a.rb': '', 'app/json.rb': '', 'lib/shop/cart.rb': '', 'gems/b/b.gemspec': 'Gem::Specification.new { |s| s.require_paths = %w[src ext] }', 'gems/b/src/b/core.rb': '', 'gems/b/ext/b/native.rb': '', 'gems/b/lib/b/old.rb': '' });
    expect(req(r, 'shop/cart')).toBe('lib/shop/cart.rb');
    expect(req(r, 'shop/cart.rb')).toBe('lib/shop/cart.rb');
    expect(req(r, 'b/core')).toBe('gems/b/src/b/core.rb');
    expect(req(r, 'b/native')).toBe('gems/b/ext/b/native.rb');
    // The gemspec names its roots, so its own lib/ is none of them; the repository still holds the file, on a load path the readers cannot know.
    expect(req(r, 'b/old')).toBeUndefined();
    expect(why(r, 'b/old')).toBe('unfollowed');
    // A plain require never binds beside the requiring file, though a file there makes it the repository's.
    expect(req(r, 'json')).toBeUndefined();
    expect(why(r, 'json')).toBe('unfollowed');
    expect(why(r, 'json', 'lib/shop/cart.rb')).toBe('outside');
    expect(why(r, 'zlib')).toBe('outside');
    // A require_relative of the same literal still resolves beside the file.
    expect(r('json', 'app/a.rb', 'ruby')).toBe('app/json.rb');
  });
  it('a name two roots hold binds neither and names both; an excluded file is the repository\'s', () => {
    const r = resolverOf({ 'lib/x/y.rb': '', 'gems/c/c.gemspec': 'spec.require_path = "lib"', 'gems/c/lib/x/y.rb': '', 'lib/gen/z.rb': '' }, (f) => f.startsWith('lib/gen/'));
    expect(req(r, 'x/y')).toBeUndefined();
    expect(why(r, 'x/y')).toEqual({ split: ['gems/c/lib/x/y.rb', 'lib/x/y.rb'] });
    expect(req(r, 'gen/z')).toBeUndefined();
    expect(why(r, 'gen/z')).toBe('unfollowed');
  });
  it('binds nothing for a name that is absolute, empty or climbs out of its root or the repository', () => {
    const r = resolverOf({ 'lib/a.rb': '', 'top.rb': '', 'gems/d/d.gemspec': 's.require_paths = ["..", "../../../out"]', 'gems/d/inner.rb': '' });
    expect(req(r, '../../top')).toBeUndefined();
    expect(req(r, '/abs/x')).toBeUndefined();
    expect(req(r, 'C:\\x')).toBeUndefined();
    expect(req(r, '')).toBeUndefined();
    expect(why(r, '../../top')).toBe('outside');
    expect(why(r, '/abs/x')).toBe('outside');
    expect(why(r, '../x/../../y')).toBe('outside');
    // A gemspec's root may lie above its directory (`..` from gems/d is gems/), never above the repository.
    expect(req(r, 'd/inner')).toBe('gems/d/inner.rb');
  });
  it('a ./ or ../ path is read from the requiring file\'s directory, and a ./ path from the repository root is the repository\'s', () => {
    const r = resolverOf({ 'test/cgi/test.ru': '', 'test/test_request.rb': '', 'lib/foo.rb': '', 'bin/run.rb': '', 'bin/helper.rb': '' });
    expect(req(r, '../test_request', 'test/cgi/test.ru')).toBe('test/test_request.rb');
    expect(req(r, './helper', 'bin/run.rb')).toBe('bin/helper.rb');
    expect(req(r, './lib/foo', 'bin/run.rb')).toBeUndefined();
    expect(why(r, './lib/foo', 'bin/run.rb')).toBe('unfollowed');
    // A path that stays inside the repository is the repository's, as the same path in a require_relative is; one that climbs out leaves it.
    expect(why(r, './lib/gone', 'bin/run.rb')).toBe('unfollowed');
    expect(why(r, '../test_gone', 'test/cgi/test.ru')).toBe('unfollowed');
    expect(why(r, '../../../gone', 'test/cgi/test.ru')).toBe('outside');
    // The working directory is unknown: where the requiring file's directory and the repository root both hold the path, neither binds.
    const both = resolverOf({ 'bin/run.rb': '', 'bin/helper.rb': '', 'helper.rb': '' });
    expect(req(both, './helper', 'bin/run.rb')).toBeUndefined();
    expect(why(both, './helper', 'bin/run.rb')).toBe('unfollowed');
  });
  it('a file under spec/ or test/ has that directory on its load path, as RSpec and Rails\' test runs put it there', () => {
    const r = resolverOf({ 'spec/spec_helper.rb': '', 'spec/models/user_spec.rb': '', 'test/test_helper.rb': '', 'test/unit/a_test.rb': '', 'lib/tasks/x.rb': '', 'gems/g/spec/spec_helper.rb': '', 'gems/g/spec/g_spec.rb': '' });
    expect(req(r, 'spec_helper', 'spec/models/user_spec.rb')).toBe('spec/spec_helper.rb');
    expect(req(r, 'test_helper', 'test/unit/a_test.rb')).toBe('test/test_helper.rb');
    expect(req(r, 'spec_helper', 'gems/g/spec/g_spec.rb')).toBe('gems/g/spec/spec_helper.rb');
    // Outside spec/, the readers cannot know the load path, and the repository holds the file twice.
    expect(req(r, 'spec_helper', 'lib/tasks/x.rb')).toBeUndefined();
    expect(why(r, 'spec_helper', 'lib/tasks/x.rb')).toBe('unfollowed');
    // A test directory inside lib/ is part of the library's tree, no load-path root.
    const inLib = resolverOf({ 'lib/foo/test/runner.rb': '', 'lib/foo/test/json.rb': '', 'test/lib/t.rb': '', 'test/helper.rb': '' });
    expect(req(inLib, 'json', 'lib/foo/test/runner.rb')).toBeUndefined();
    expect(req(inLib, 'helper', 'test/lib/t.rb')).toBe('test/helper.rb');
  });
  it('a gemspec under a test or fixture directory puts its roots on the load path of the files under it only', () => {
    const r = resolverOf({ 'spec/fixtures/gem/fixture.gemspec': '', 'spec/fixtures/gem/lib/helper.rb': '', 'spec/fixtures/gem/bin/run.rb': '', 'app/x.rb': '', 'gems/real/real.gemspec': '', 'gems/real/lib/real.rb': '' });
    expect(req(r, 'helper', 'spec/fixtures/gem/bin/run.rb')).toBe('spec/fixtures/gem/lib/helper.rb');
    // A fixture's files are no place a file of the repository is required from.
    expect(req(r, 'helper', 'app/x.rb')).toBeUndefined();
    expect(why(r, 'helper', 'app/x.rb')).toBe('outside');
    expect(req(r, 'real', 'app/x.rb')).toBe('gems/real/lib/real.rb');
    expect(req(r, 'real', 'spec/fixtures/gem/bin/run.rb')).toBe('gems/real/lib/real.rb');
  });
  it('reads require_paths as a gemspec writes it, and RubyGems\' default lib/ otherwise', () => {
    expect(gemspecRequirePaths('spec.require_paths = ["lib", \'ext\']')).toEqual(['lib', 'ext']);
    expect(gemspecRequirePaths('s.require_paths = %w[lib  ext]')).toEqual(['lib', 'ext']);
    expect(gemspecRequirePaths('s.require_paths = %w(src)')).toEqual(['src']);
    expect(gemspecRequirePaths('s.require_paths = %W{src}')).toEqual(['src']);
    expect(gemspecRequirePaths('s.require_paths = %w<src>')).toEqual(['src']);
    expect(gemspecRequirePaths('s.require_path = "src"')).toEqual(['src']);
    expect(gemspecRequirePaths('s.require_paths = paths_from_env')).toEqual(['lib']);
    expect(gemspecRequirePaths('s.require_paths = []')).toEqual(['lib']);
    expect(gemspecRequirePaths('Gem::Specification.new do |s| s.name = "x" end')).toEqual(['lib']);
  });
});
