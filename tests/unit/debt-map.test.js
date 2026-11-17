import { debtMapColor, layoutDebtMapAmountLabels, placeDebtMapPill } from '../../src/js/utils/debtMap.js';

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

// v41: the amount of a transfer must stay ON that transfer's own line. The pill
// walks along its arc; when there is no room it comes back null (the UI then
// prints the amount in the numbered list) instead of drifting onto another line.
export function testDebtMapPillStaysOnItsOwnArc() {
  const edge = { start: { x: 100, y: 250 }, control: { x: 410, y: 180 }, end: { x: 720, y: 250 }, width: 90, height: 22 };
  const pill = placeDebtMapPill(edge, [], { width: 820, height: 500 });
  assert(pill, 'an empty canvas always accepts the pill');
  // The returned point must solve the same quadratic curve (it lies on the arc).
  const t = pill.t;
  const onCurve = {
    x: (1 - t) * (1 - t) * edge.start.x + 2 * (1 - t) * t * edge.control.x + t * t * edge.end.x,
    y: (1 - t) * (1 - t) * edge.start.y + 2 * (1 - t) * t * edge.control.y + t * t * edge.end.y
  };
  assert(Math.abs(onCurve.x - pill.x) < 0.001 && Math.abs(onCurve.y - pill.y) < 0.001, 'the pill is anchored on its own arc');
}

export function testDebtMapPillNeverOverlapsAnotherPillOrNode() {
  const edges = Array.from({ length: 6 }, (_, i) => ({
    start: { x: 80 + i * 10, y: 260 }, control: { x: 410, y: 170 + i * 6 }, end: { x: 740 - i * 10, y: 260 }, width: 100, height: 22
  }));
  const obstacles = [{ left: 380, right: 440, top: 240, bottom: 300 }];
  const placed = [];
  for (const edge of edges) {
    const pill = placeDebtMapPill(edge, obstacles.concat(placed), { width: 820, height: 500, gap: 5 });
    if (!pill) continue;
    const box = { left: pill.x - pill.width / 2, right: pill.x + pill.width / 2, top: pill.y - pill.height / 2, bottom: pill.y + pill.height / 2 };
    for (const other of obstacles.concat(placed)) {
      assert(box.right + 5 <= other.left || other.right + 5 <= box.left || box.bottom + 5 <= other.top || other.bottom + 5 <= box.top,
        'a placed pill never touches a node or another pill');
    }
    placed.push(box);
  }
  assert(placed.length >= 2, 'a normal map places more than one pill');
}

export function testDebtMapPillGivesUpInsteadOfDriftingAway() {
  // A 40×40 canvas cannot host a 100px pill: the helper must refuse (null) so the
  // caller can list the amount instead of pinning it to a stranger's line.
  const edge = { start: { x: 5, y: 20 }, control: { x: 20, y: 5 }, end: { x: 35, y: 20 }, width: 100, height: 22 };
  assert(placeDebtMapPill(edge, [], { width: 40, height: 40 }) === null, 'no room → null, never a misplaced tag');
}
