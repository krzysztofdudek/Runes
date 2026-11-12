// The edges of a C# project do not depend on the order its files are listed in, nor on which file is read first. The cases under reference/relations/csharp/csharp-cyclic-base-*.md hold one order each; here their files are listed in many orders, and the edges stay those of the order the case gives.
import { describe, it, expect } from '../helpers/expect.mjs';
import { random, SEED, seedNote } from '../helpers/prng.mjs';
import { listCases, loadCaseDoc, caseEdges } from './reference-case-runner.mjs';

const ORDERS_PER_CASE = 12;
const edgeKeys = (edges) => edges.map((e) => `${e.fromFile}:${e.line}->${e.owner}`).sort();

describe('csharp: the edges do not depend on the order of the files', () => {
  for (const { id, mdPath } of listCases().filter((c) => c.language === 'csharp' && (c.id.startsWith('csharp-cyclic-base-') || c.id.startsWith('csharp-using-namespace-hidden-')))) {
    it(`${id}: the edges of ${ORDERS_PER_CASE} random orders are those the case lists`, async () => {
      const doc = loadCaseDoc(id, mdPath);
      const draw = random(SEED);
      const expected = edgeKeys(doc.expectEdges);
      expect(expected.length).toBeGreaterThan(0);
      for (let n = 0; n < ORDERS_PER_CASE; n++) {
        const files = [...doc.files];
        for (let i = files.length - 1; i > 0; i--) {
          const j = draw.int(0, i);
          [files[i], files[j]] = [files[j], files[i]];
        }
        expect(edgeKeys(await caseEdges({ ...doc, files })), `order ${files.map((f) => f.path).join(' ')} ${seedNote()}`).toEqual(expected);
      }
    });
  }
});
