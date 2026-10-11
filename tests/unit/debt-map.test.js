import { debtMapColor, layoutDebtMapAmountLabels } from '../../src/js/utils/debtMap.js';

function assert(condition, message) { if (!condition) throw new Error(message); }

const bounds = label => ({
  left: label.x - label.width / 2,
  right: label.x + label.width / 2,
  top: label.y - label.height / 2,
  bottom: label.y + label.height / 2
});

function assertNoLabelOverlap(positions, spacing = 5) {
  for (let i = 0; i < positions.length; i++) {
    const a = bounds(positions[i]);
    for (let j = i + 1; j < positions.length; j++) {
      const b = bounds(positions[j]);
      const separated = a.right + spacing <= b.left || b.right + spacing <= a.left ||
        a.bottom + spacing <= b.top || b.bottom + spacing <= a.top;
      assert(separated, `amount tags ${i} and ${j} overlap`);
    }
  }
}

export function testDebtMapTransferColoursStayDistinct() {
  const colors = Array.from({ length: 24 }, (_, i) => debtMapColor(i));
  assert(new Set(colors).size === colors.length, 'adjacent transfers must have distinct hues');
  assert(colors.every(color => /^hsl\(\d+ 76% 43%\)$/.test(color)), 'transfer colours use the high-contrast palette');
}

export function testDebtMapLabelsNeverOverlapAndAvoidMemberLabels() {
  const edges = Array.from({ length: 18 }, (_, i) => ({
    start: { x: 70, y: 245 },
    control: { x: 410, y: 90 + (i % 3) * 8 },
    end: { x: 750, y: 245 },
    label: `฿${(i + 1) * 12345}`
  }));
  const obstacles = [{ left: 360, right: 460, top: 185, bottom: 260 }];
  const result = layoutDebtMapAmountLabels(edges, obstacles, { width: 820, height: 500 });
  assert(result.positions.length === edges.length, 'each transfer receives an amount tag');
  assertNoLabelOverlap(result.positions);
  for (const label of result.positions.filter(item => !item.fallback)) {
    assert(!obstacles.some(obstacle => {
      const box = bounds(label);
      return !(box.right + 5 <= obstacle.left || obstacle.right + 5 <= box.left ||
        box.bottom + 5 <= obstacle.top || obstacle.bottom + 5 <= box.top);
    }), 'an on-map amount tag must avoid member labels');
  }
}

export function testCrowdedDebtMapMovesTagsToDedicatedNonOverlappingRows() {
  const edges = Array.from({ length: 10 }, (_, i) => ({
    start: { x: 26, y: 24 }, control: { x: 70, y: 24 }, end: { x: 114, y: 24 }, label: `$${i + 1}`
  }));
  const result = layoutDebtMapAmountLabels(edges, [], { width: 140, height: 48 });
  assert(result.positions.some(item => item.fallback), 'dense maps use fallback rows when the drawing has no space');
  assert(result.height > 48, 'the SVG canvas expands to fit every fallback row');
  assertNoLabelOverlap(result.positions);
}
