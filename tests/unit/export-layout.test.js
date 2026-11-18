import { exportPageCuts } from '../../src/js/exports/layout.js';
const assert = (value, message) => { if (!value) throw new Error(message); };
export function testPdfCutsDoNotSplitTextOrRows() {
  const ranges = [{ top: 280, bottom: 340 }, { top: 590, bottom: 640 }];
  const cuts = exportPageCuts(1000, 320, ranges);
  assert(cuts[0] === 0 && cuts.at(-1) === 1000, 'all pixels must be included');
  for (let i = 1; i < cuts.length; i++) {
    assert(cuts[i] > cuts[i - 1] && cuts[i] - cuts[i - 1] <= 320, 'page size is bounded and advances');
    assert(!ranges.some(r => r.top < cuts[i] && r.bottom > cuts[i]), 'cut is outside text and rows');
  }
}
export function testPdfOversizedRowStillTerminates() {
  const cuts = exportPageCuts(2500, 800, [{ top: 0, bottom: 2500 }]);
  assert(cuts.join(',') === '0,800,1600,2400,2500', 'oversized rows cannot cause an infinite pagination loop');
}
