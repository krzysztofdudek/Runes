// One contender for the lock property test: `rounds` increments of the counter file under the lock, each logged as "<who> in" and "<who> out", with a pause between reading and writing so an overlap would lose an update. Mode async runs two holders at once in this process through withLockAsync.
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { withLock, withLockAsync } from '../helpers/internal/fs.mjs';

const [lock, counter, log, roundsText, mode, seedText] = process.argv.slice(2);
const rounds = Number(roundsText);
let seed = Number(seedText) >>> 0;
const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const pauseSync = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const bump = (who) => {
  appendFileSync(log, `${who} in\n`);
  const n = Number(readFileSync(counter, 'utf8'));
  pauseSync(Math.floor(rand() * 3));
  writeFileSync(counter, String(n + 1));
  appendFileSync(log, `${who} out\n`);
};
const options = { waitMs: 60_000 };
if (mode === 'async') {
  const holder = async (h) => {
    for (let i = 0; i < rounds / 2; i += 1) await withLockAsync(lock, async () => { bump(`${process.pid}.${h}`); await new Promise((r) => setTimeout(r, Math.floor(rand() * 2))); }, options);
  };
  await Promise.all([holder(1), holder(2)]);
} else {
  for (let i = 0; i < rounds; i += 1) withLock(lock, () => bump(String(process.pid)), options);
}
