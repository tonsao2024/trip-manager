import { debtMapColor, debtMapLabelAngle, layoutDebtMapAmounts } from '../../src/js/utils/debtMap.js';

function assert(condition, message) { if (!condition) throw new Error(message); }

const bezier = (edge, t) => {
  const inverse = 1 - t;
  return {
    x: inverse * inverse * edge.start.x + 2 * inverse * t * edge.control.x + t * t * edge.end.x,
    y: inverse * inverse * edge.start.y + 2 * inverse * t * edge.control.y + t * t * edge.end.y
  };
};

const shares = (a, b, spacing = 0) => !(
  a.right + spacing <= b.left || b.right + spacing <= a.left ||
  a.bottom + spacing <= b.top || b.bottom + spacing <= a.top
);

export function testDebtMapTransferColoursStayDistinct() {
  const colors = Array.from({ length: 24 }, (_, i) => debtMapColor(i));
  assert(new Set(colors).size === colors.length, 'adjacent transfers must have distinct hues');
  assert(colors.every(color => /^hsl\(\d+ 76% 43%\)$/.test(color)), 'transfer colours use the high-contrast palette');
}

// v42 (owner report: “ตัวเลขบังรายชื่อคนจ่าย”): the amount is printed ALONG its
// own line. The placer returns the curve parameter and the tangent angle, so the
// SVG can rotate the plate with the arc — the label must sit exactly on that arc.
export function testDebtMapAmountRidesItsOwnArc() {
  const edge = { start: { x: 100, y: 250 }, control: { x: 410, y: 150 }, end: { x: 720, y: 250 }, label: '฿45,338.16' };
  const [spot] = layoutDebtMapAmounts([edge], [], { width: 820, height: 500 });
  assert(spot.kind === 'label', 'an empty canvas always accepts the plate');
  const onCurve = bezier(edge, spot.t);
  assert(Math.abs(onCurve.x - spot.x) < 0.001 && Math.abs(onCurve.y - spot.y) < 0.001, 'the plate is anchored on its own arc');

  // The plate is rotated with the line, and never upside-down.
  const angle = debtMapLabelAngle(edge, spot.t);
  assert(Math.abs(angle - spot.angle) < 0.001, 'the returned angle is the tangent angle');
  assert(angle > -90 && angle <= 90, 'the plate text stays upright');
  // The tangent's own sign decides the tilt: a rising segment reads bottom-left →
  // top-right (−°) and a falling one the other way, never upside-down.
  const risingEdge = { start: { x: 100, y: 300 }, control: { x: 410, y: 150 }, end: { x: 720, y: 300 } };
  const fallingEdge = { start: { x: 100, y: 150 }, control: { x: 410, y: 300 }, end: { x: 720, y: 150 } };
  assert(debtMapLabelAngle(risingEdge, 0.3) < 0, 'a rising arc tilts the plate up to the right');
  assert(debtMapLabelAngle(fallingEdge, 0.3) > 0, 'a falling arc tilts the plate down to the right');

  // A label wide enough for the amount, but never absurdly wide.
  assert(spot.width >= 60 && spot.width <= 220, 'the plate is sized to the amount text');
  assert(spot.box && spot.box.left < spot.x && spot.box.right > spot.x, 'the collision box is centred on the plate');
}

export function testDebtMapAmountsAvoidMemberLabelsAndEachOther() {
  const edges = Array.from({ length: 14 }, (_, i) => ({
    start: { x: 90 + (i % 4) * 30, y: 300 },
    control: { x: 410, y: 120 + (i % 5) * 14 },
    end: { x: 730 - (i % 3) * 25, y: 300 },
    label: `฿${(i + 1) * 1234}.56`
  }));
  // Member name/role labels are solid obstacles (two people at the top, one low).
  const obstacles = [
    { left: 340, right: 470, top: 40, bottom: 88 },
    { left: 640, right: 780, top: 96, bottom: 150 },
    { left: 60, right: 180, top: 318, bottom: 366 }
  ];
  const result = layoutDebtMapAmounts(edges, obstacles, { width: 820, height: 500 });
  assert(result.length === edges.length, 'every transfer receives a placement');
  assert(result.every(item => ['label', 'number', 'none'].includes(item.kind)), 'placements use one of the three kinds');

  const plates = result.filter(item => item.kind === 'label');
  assert(plates.length > 0, 'a map with room prints at least some amounts on the drawing');
  for (const plate of plates) {
    for (const obstacle of obstacles) {
      assert(!shares(plate.box, obstacle, 3), 'an on-map amount must never touch a member name');
    }
    assert(plate.box.left >= 7 && plate.box.right <= 813 && plate.box.top >= 7 && plate.box.bottom <= 493,
      'a plate stays inside the drawing');
  }
  for (let i = 0; i < plates.length; i++) {
    for (let j = i + 1; j < plates.length; j++) {
      assert(!shares(plates[i].box, plates[j].box, 3), 'two amount plates never overlap');
    }
  }

  // Numbered dots also keep clear of the people; each still carries its amount
  // so the numbered list below the drawing can print it.
  for (const dot of result.filter(item => item.kind === 'number')) {
    assert(!obstacles.some(obstacle => shares(dot.box, obstacle, 3)), 'a numbered dot must not sit on a name');
    assert(dot.label.startsWith('฿'), 'a numbered dot still knows its amount');
  }
}

// A dense drawing never invents room: it drops to numbered dots and, when even a
// dot cannot fit, to nothing at all (the numbered list still shows the amount).
export function testCrowdedDebtMapFallsBackToNumbers() {
  const edges = Array.from({ length: 10 }, (_, i) => ({
    start: { x: 5, y: 20 }, control: { x: 30, y: 20 }, end: { x: 55, y: 20 }, label: `฿${i + 1}.00`
  }));
  const result = layoutDebtMapAmounts(edges, [], { width: 60, height: 40 });
  assert(result.every(item => item.kind !== 'label'), 'a tiny drawing has no room for amount plates');
  assert(result.some(item => item.kind === 'number'), 'transfers keep a numbered dot when the plate does not fit');
  assert(result.every(item => item.x >= 0 && item.x <= 60 && item.y >= 0 && item.y <= 40), 'every placement stays inside the drawing');

  const boxed = result.filter(item => item.box);
  for (let i = 0; i < boxed.length; i++) {
    for (let j = i + 1; j < boxed.length; j++) {
      assert(!shares(boxed[i].box, boxed[j].box, 2), 'number dots never overlap each other');
    }
  }

  // Impossible canvas → the transfer reports “none” instead of drawing off-screen.
  const hopeless = layoutDebtMapAmounts(
    [{ start: { x: 0, y: 0 }, control: { x: 1, y: 1 }, end: { x: 2, y: 2 }, label: '฿1.00' }],
    [],
    { width: 20, height: 20 }
  );
  assert(hopeless[0].kind === 'none', 'a broken canvas degrades to the list instead of throwing');
  assert(hopeless[0].box === null, 'a “none” placement has no collision box');
}
