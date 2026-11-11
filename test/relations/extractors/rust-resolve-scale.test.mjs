// The Rust questions the resolver asks of the pass's symbol table are answered in time that does not grow with the package. Nearly every file declares some keys (`mods:all`, and the item a common `use` brings in), so a question that searched the list of such a key would make the pass grow with the square of the package's files. The bound is the one the wide-node tests use: the ratio of two sizes, not seconds.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { makeResolvePathToFile, SymbolTable, listedFileView } from '@chrisdudek/runes/relations';

const FILES = 16_000;
const PER_DIR = 100;
const QUARTER = 0.25;
const MAX_RATIO = 8;
// The quarter's resolution takes some tens of milliseconds, where a timer's jitter is a large share of it.
const FLOOR_MS = 50;
const READS = 2;

// A package of about `count` files: `src/lib.rs` brings in `Arc`, each directory's `mod.rs` declares its files and defines `helper` beside a leftover `helper.rs` it does not declare, and every file brings in `Arc` and `Missing`, which the root does not bind. Each file asks for the three, as the extractor's declarations would let the resolver answer them.
const build = (count) => {
  const table = new SymbolTable();
  const paths = ['Cargo.toml', 'src/lib.rs'];
  const asks = [];
  const declare = (file, ...keys) => keys.forEach((k) => table.declare('rust', k, file));
  declare('src/lib.rs', 'mods:all', 'item:Arc');
  for (let d = 0; paths.length < count; d++) {
    const dir = `src/d${d}`;
    declare('src/lib.rs', `mod:d${d}`, `modfile:d${d}`);
    paths.push(`${dir}/mod.rs`, `${dir}/helper.rs`);
    declare(`${dir}/mod.rs`, 'mods:all', 'item:helper');
    declare(`${dir}/helper.rs`, 'mods:all');
    for (let f = 0; f < PER_DIR - 2 && paths.length < count; f++) {
      const file = `${dir}/f${f}.rs`;
      paths.push(file);
      declare(`${dir}/mod.rs`, `mod:f${f}`, `modfile:f${f}`);
      declare(file, 'mods:all', 'item:Arc', 'item:Missing', `item:Item${f}`);
      asks.push([file, `${dir}/mod.rs`]);
    }
  }
  const files = new Map(paths.map((p) => [p, p === 'Cargo.toml' ? '[package]\nname = "big"\nedition = "2021"\n' : '']));
  return { table, files, asks };
};

const timed = (count) => {
  const { table, files, asks } = build(count);
  const resolve = makeResolvePathToFile('/nonexistent', undefined, undefined, { files: listedFileView(files.keys(), (p) => files.get(p)) });
  const start = performance.now();
  for (const [file, parent] of asks) {
    assert.equal(resolve('crate::Arc', file, 'rust', false, table), 'src/lib.rs');
    assert.equal(resolve('super::helper', file, 'rust', false, table), parent);
    assert.equal(resolve('crate::Missing', file, 'rust', false, table), undefined);
  }
  return performance.now() - start;
};

// The fastest of a few reads: the noise on a read only ever adds to it.
const best = (count) => Math.min(...Array.from({ length: READS }, () => timed(count)));

describe('the Rust questions of a pass grow linearly with the package', () => {
  it(`a package of ${FILES} Rust files resolves within ${MAX_RATIO} times its quarter`, () => {
    const quarter = best(FILES * QUARTER);
    const full = best(FILES);
    assert.ok(full < MAX_RATIO * Math.max(quarter, FLOOR_MS), `a quarter of the package took ${Math.round(quarter)} ms, the whole of it ${Math.round(full)} ms: over ${MAX_RATIO} times`);
  });
});
