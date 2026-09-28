// A seeded pseudo-random source for the property tests. Each run draws a fresh seed unless RUNES_PROPERTY_SEED names one, and every failure message carries the seed, so a counterexample found once can be replayed exactly.
export const SEED = Number(process.env.RUNES_PROPERTY_SEED ?? Math.floor(Math.random() * 2 ** 31));

// mulberry32: small, fast, and good enough to spread test cases.
export function random(seed = SEED) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (lo, hi) => lo + Math.floor(next() * (hi - lo + 1));
  const pick = (xs) => xs[int(0, xs.length - 1)];
  const bool = (p = 0.5) => next() < p;
  // Strings that stress a command line: dashes, equals signs, spaces, quotes, backslashes, non-ASCII, the empty string.
  const ALPHABET = ['a', 'b', 'z', '0', '9', '-', '--', '=', ' ', '"', "'", '\\', '/', '.', 'ł', '日', '\t', '*', '?', '$'];
  const word = (max = 6) => Array.from({ length: int(0, max) }, () => pick(ALPHABET)).join('');
  const name = () => pick(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) + Array.from({ length: int(0, 4) }, () => pick(['a', 'x', '1', '-'])).join('').replace(/-+$/, '');
  return { next, int, pick, bool, word, name };
}

export const seedNote = (extra = '') => `(RUNES_PROPERTY_SEED=${SEED}${extra ? `, ${extra}` : ''})`;
