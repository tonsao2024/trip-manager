import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { debtMapColor, debtMapLabelAngle, layoutDebtMapAmounts, debtMapEdgeRuns } from '../../src/js/utils/debtMap.js';

const here = path.dirname(fileURLToPath(import.meta.url));

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

// v44 (owner: “ชื่อสมาชิกในแผนภาพ ไม่ควรโดนเส้นบัง”): a transfer line is lifted out
// of the way of every member name / role label, instead of being painted through it.
export function testDebtMapEdgeBreaksAroundMemberNames() {
  const edge = { start: { x: 60, y: 250 }, control: { x: 410, y: 150 }, end: { x: 760, y: 250 } };

  // No label in the way → one unbroken run that starts at the payer.
  const plain = debtMapEdgeRuns(edge, [], {});
  assert(plain.length === 1, 'a clear arc is drawn as one run');
  assert(plain[0].startsWith('M60.0,250.0'), 'the run starts at the payer');

  // A member name sits right on the arc → the stroke stops on both sides of it.
  const nameBox = { left: 380, right: 442, top: 175, bottom: 200 };
  const runs = debtMapEdgeRuns(edge, [nameBox], { gap: 5 });
  assert(runs.length === 2, `the arc is cut in two around the name (got ${runs.length})`);
  const points = runs.flatMap(run => run.slice(1).split('L').map(pair => pair.split(',').map(Number)));
  for (const [x, y] of points) {
    assert(x < nameBox.left - 4 || x > nameBox.right + 4 || y < nameBox.top - 4 || y > nameBox.bottom + 4,
      'no drawn point sits on the name');
  }
  // The arrow head must stay on the line: the last run still ends at the receiver.
  const last = runs[runs.length - 1];
  assert(last.trim().endsWith('760.0,250.0'), 'the last run still reaches the receiver');
  assert(runs[0].startsWith('M60.0,250.0'), 'the first run still leaves the payer');
}

// The labels themselves are haloed in the drawing's background colour, and the
// diagram can be exported as a PNG (the two other v44 debt-map requests).
export function testDebtMapLabelsAndExportAreWired() {
  const appSource = readFileSync(path.join(here, '../../src/js/app.js'), 'utf8');
  const css = readFileSync(path.join(here, '../../src/css/components.css'), 'utf8');
  const exportsSource = readFileSync(path.join(here, '../../src/js/exports/index.js'), 'utf8');
  assert(/class="debt-map-label"/.test(appSource), 'the member name and role carry the halo class');
  assert(/\.debt-map-label\s*\{[^}]*paint-order:\s*stroke fill/.test(css), 'the halo is painted behind the glyphs');
  assert(/\.debt-map-label\s*\{[^}]*stroke:\s*var\(--bg-secondary\)/.test(css), 'the halo matches the drawing background');
  assert(/id="export-debt-map-png"/.test(appSource), 'the diagram heading carries an export button');
  assert(/exportSvgToPng\(svg, `debt-map-/.test(appSource), 'the button rasterises the diagram itself');
  assert(/export async function exportSvgToPng/.test(exportsSource), 'the SVG → PNG helper exists');
  assert(/@font-face\{font-family/.test(exportsSource), 'the export embeds the fonts, so Thai labels do not turn into boxes');
  // Real profile photos: the map already draws <image> for a member with a photo,
  // and member rows that predate photos are backfilled from the account directory.
  assert(/hydrateMemberPhotos/.test(appSource), 'the settlement page backfills missing profile photos');
}

export async function testCrowdedDebtMapCalloutsShowEveryAmount() {
  const { layoutDebtMapCallouts } = await import('../../src/js/utils/debtMap.js');
  const edges = Array.from({ length: 15 }, (_, i) => ({ label: `฿${i + 1},234.56` }));
  const placements = edges.map(() => ({ kind: 'none' }));
  const result = layoutDebtMapCallouts(placements, edges, 820);
  assert(result.length === edges.length && result.every(p => p.kind === 'callout'), 'all crowded transfers have a visible amount');
  for (let i = 0; i < result.length; i++) {
    assert(result[i].label === edges[i].label && result[i].box.left > 820, 'amount stays in the separate column');
    if (i) assert(!shares(result[i - 1].box, result[i].box, 4), 'callouts never overlap');
  }
}

export async function testDebtMapPeopleUseEvenPerimeterSpacing() {
  const { debtMapNodeAngles } = await import('../../src/js/utils/debtMap.js');
  const angles = debtMapNodeAngles(24, 600, 300);
  const points = angles.map(a => ({ x: 600 * Math.cos(a), y: 300 * Math.sin(a) }));
  const distances = points.map((p, i) => {
    const next = points[(i + 1) % points.length];
    return Math.hypot(p.x - next.x, p.y - next.y);
  });
  assert(Math.max(...distances) / Math.min(...distances) < 1.06, 'people should not bunch up at ellipse ends');
}

export function testAmountOnlyFallbackStaysOnItsLine() {
  const edge = { start: { x: 20, y: 100 }, control: { x: 200, y: 100 }, end: { x: 380, y: 100 }, label: '฿1,234.00' };
  const [spot] = layoutDebtMapAmounts([edge], [{ left: 0, right: 400, top: 0, bottom: 200 }], { width: 400, height: 200, amountOnly: true });
  assert(spot.kind === 'label', 'full amounts must not become callouts or numbered dots');
  assert(spot.y === 100, 'amount must remain on the transfer line');
}

export function testDesktopDebtMapFitsCardWithoutHorizontalScrolling() {
  const app = readFileSync(path.join(here, '../../src/js/app.js'), 'utf8');
  const css = readFileSync(path.join(here, '../../src/css/dimension.css'), 'utf8');
  const responsive = readFileSync(path.join(here, '../../src/css/refresh.css'), 'utf8');
  assert(app.includes('style="--debt-map-natural-width:${W}px"'), 'natural size is a CSS variable, not a forced inline minimum');
  assert(!app.includes('style="min-width:${W}px"'), 'inline width must not force desktop overflow');
  const desktop = css.slice(css.indexOf('@media (min-width: 1024px)'));
  assert(desktop.includes('.debt-map-scroll-hint { display: none; }'), 'desktop does not ask users to scroll');
  // v46: no stylesheet may impose a minimum width on the drawing any more — that
  // was the rule that made a phone scroll the map sideways instead of fitting it,
  // and it silently overrode the zoom controller's own width.
  assert(!/min-width: var\(--debt-map-natural-width/.test(responsive), 'no layer forces the natural width back onto the SVG');
  assert(!/\.debt-map-svg[^{]*\{[^}]*min-width: 540px/.test(responsive), 'the old 540px SVG floor is gone, so “fit” really fits');
  assert(/\.debt-map-viewport\s*\{[^}]*overflow: auto/.test(css), 'the drawing pans inside its own viewport, never the page');
}

// v45 (owner report 18 Nov 2026: “แผนที่หนี้ ตอนนี้มันกว้างใหญ่เกินไป ต้องสโครล
// หลายรอบ กว่าจะเห็นครบ (ดูในคอม)”): the SVG is scaled to fit its card, so the
// sheet's own size is the reading experience. A sheet wider than the card shrinks
// every label below reading size; a sheet taller than the screen turns one
// diagram into several screens of scrolling. Both are bounded now.
export async function testDebtMapSheetStaysInsideOneDesktopGlance() {
  const { debtMapCanvas } = await import('../../src/js/utils/debtMap.js');
  for (const [people, transfers] of [[2, 1], [4, 6], [6, 15], [8, 28], [10, 45], [12, 66]]) {
    for (let attempt = 0; attempt <= 12; attempt++) {
      const sheet = debtMapCanvas({ people, transfers, attempt });
      assert(sheet.width <= 1200, `${people}p/${transfers}t: the sheet never outgrows the card that shows it (${sheet.width})`);
      assert(sheet.width / sheet.height >= 1.3, `${people}p/${transfers}t: the sheet stays landscape (${sheet.width}×${sheet.height})`);
      assert(sheet.height >= 400, `${people}p/${transfers}t: the sheet keeps enough room for the ring of people (${sheet.height})`);
    }
    // Growth is gentle and stops at the cap instead of inflating forever.
    const grown = debtMapCanvas({ people, transfers, attempt: 1 });
    const capped = debtMapCanvas({ people, transfers, attempt: 12 });
    assert(capped.width >= grown.width, 'a retry never shrinks the sheet');
    assert(capped.canGrow === false, 'at the cap the layout stops retrying');
    assert(capped.width === debtMapCanvas({ people, transfers, attempt: 99 }).width, 'attempts past the cap change nothing');
  }
  // Phones keep their own budget: a natural-size drawing they can scroll sideways.
  const phone = debtMapCanvas({ people: 8, transfers: 28, compact: true, attempt: 6 });
  assert(phone.width <= 1000 && phone.width >= 560, `phone sheets stay scrollable, not endless (${phone.width})`);
}

export async function testDebtMapExpandKeepsTheGenerousSheet() {
  const { debtMapCanvas } = await import('../../src/js/utils/debtMap.js');
  // The expanded view is where a dense map gets room for every amount in full, so
  // it keeps growing well past the on-page cap (the reader pans and zooms it).
  const page = debtMapCanvas({ people: 12, transfers: 66, attempt: 6 });
  const expanded = debtMapCanvas({ people: 12, transfers: 66, attempt: 6, detailed: true });
  assert(expanded.width * expanded.height > page.width * page.height, 'expanding gives the drawing more sheet, not less');
  assert(expanded.width <= 3600, 'even the expanded sheet stays inside a rasterisable size');
  assert(debtMapCanvas({ people: 4, transfers: 6, detailed: true, attempt: 12 }).canGrow === false, 'the expanded sheet stops growing too');
  // v44 behaviour is preserved for the expanded sheet: the old generous formula.
  const legacy = debtMapCanvas({ people: 8, transfers: 28, attempt: 1, detailed: true });
  assert(legacy.width === Math.round(Math.max(900, 8 * 100 + 180) * 1.35), 'the expanded sheet keeps the v44 width formula');
}

// v46 (owner: the fullscreen popup is no longer needed — zoom must work from the
// map on the page, and fit-to-screen is the default everywhere).
export function testDebtMapZoomLivesOnTheCard() {
  const app = readFileSync(path.join(here, '../../src/js/app.js'), 'utf8');
  const css = readFileSync(path.join(here, '../../src/css/dimension.css'), 'utf8');
  assert(/class="debt-map-viewport"[^>]*data-debt-zoom-viewport/.test(app), 'the drawing sits in its own zoom viewport');
  assert(!/id="debt-map-expand"/.test(app), 'there is no full-screen expand step any more');
  assert(!/debt-zoom-modal/.test(app) && !/\.debt-zoom-(modal|controls)\s*\{/.test(css),
    'the full-screen sheet and its styles are gone');
  assert(/data-debt-zoom="in"/.test(app) && /data-debt-zoom="out"/.test(app) && /data-debt-zoom="fit"/.test(app),
    'expand / shrink / fit are on the map card itself');
  assert(/id="export-debt-map-png"/.test(app), 'the PNG export stays available without the sheet');
  assert(/function bindDebtMapZoom/.test(app) && /bindDebtMapZoom\(content\)/.test(app), 'one controller owns zoom, pan and fit');
  // Fit is the default state, not an action the reader has to find first.
  assert(/const fit = \(\) => \{[^}]*fitted = true/.test(app) && /fit\(\);\n    buttons/.test(app), 'the map starts fitted to the screen');
  assert(/aria-pressed="true"/.test(app), 'the fit button announces that it is the current state');
  assert(/touch-action: pan-x pan-y/.test(css), 'pinch-zoom is ours, one-finger scroll still moves the page');
  assert(/\.debt-zoom-btn[^{]*\{[^}]*min-height: 40px/.test(css), 'the zoom buttons are real touch targets');
  assert(/\.debt-map-edge\.is-dimmed/.test(css), 'hovering a transfer row dims the other lines');
}
