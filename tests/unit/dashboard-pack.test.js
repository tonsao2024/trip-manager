import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { packDashboard, balancedColumns, rowsFor, DASH_ROW } from '../../src/js/dashboard/pack.js';
import { DASHBOARD_WIDGET_KEYS } from '../../src/js/dashboard/widgets.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const appSource = fs.readFileSync(path.join(here, '../../src/js/app.js'), 'utf8');
const flatCss = fs.readFileSync(path.join(here, '../../src/css/flat.css'), 'utf8');

function eq(actual, expected, label) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${label}: expected ${b}, got ${a}`);
}
function ok(value, label) { if (!value) throw new Error(label); }

const cards = (...sizes) => sizes.map(([key, height, full = false]) => ({ key, height, full }));

/** Column of a key in the packed result. */
const col = (placed, key) => placed.find(p => p.key === key)?.column;

export function testRowsSnapToTheGrid() {
  eq(rowsFor(240, 14), Math.ceil(254 / 4), 'a card plus its gutter is rounded up to 4px rows');
  eq(rowsFor(0, 14), 4, 'an empty card still takes one row (never 0)');
  eq(rowsFor(undefined), 4, 'missing height does not produce NaN rows');
  eq(DASH_ROW, 4, 'the grid unit matches the CSS `grid-auto-rows`');
}

export function testShortCardDoesNotLeaveAHole() {
  // The owner's case: a one-row booking card (140px) next to a 350px list. In a
  // plain grid the next card starts below the TALL one, leaving 210px of air
  // under the short card; packing lets the shorter column carry on instead.
  const placed = packDashboard(cards(['bookings', 140], ['recent', 350], ['category', 300]));
  const shortCol = col(placed, 'bookings');
  const next = placed.find(p => p.key === 'category');
  const tall = placed.find(p => p.key === 'recent');
  ok(next.column === col(placed, 'bookings'), 'the next card carries on in the short card\'s column');
  ok(next.row < tall.row + tall.span, `it starts above the tall card's bottom instead of waiting for it (${next.row} < ${tall.row + tall.span})`);
  const sums = [1, 2].map(c => placed.filter(p => p.column === c).reduce((n, p) => n + p.span, 0));
  ok(sums[0] > 0 && sums[1] > 0, 'both columns are used');
  // the split is the most even one available in reading order
  eq(sums[0] + sums[1], rowsFor(140) + rowsFor(350) + rowsFor(300), 'every card contributes its own span');
}

export function testEvenBandSplitsDownTheMiddle() {
  // Four equal cards: two per column, both columns starting on the same row, so
  // an even board looks exactly like the old pair grid.
  const placed = packDashboard(cards(['a', 200], ['b', 200], ['c', 200], ['d', 200]));
  eq(placed.filter(p => p.column === 1).length, 2, 'two cards in the left column');
  eq(placed.filter(p => p.column === 2).length, 2, 'two cards in the right column');
  eq(Math.min(...placed.filter(p => p.column === 1).map(p => p.row)), 1, 'the left column starts at the top');
  eq(Math.min(...placed.filter(p => p.column === 2).map(p => p.row)), 1, 'the right column starts at the top too');
}

export function testFullWidthCardStartsANewBand() {
  const placed = packDashboard(cards(['a', 200], ['kpis', 180, true], ['b', 260], ['c', 260]));
  const kpis = placed.find(p => p.key === 'kpis');
  eq(kpis.column, null, 'a full-width card has no column');
  ok(kpis.row > placed.find(p => p.key === 'a').row, 'the full-width card starts below what came before it');
  const bandStart = Math.max(...placed.filter(p => p.key === 'a').map(p => p.row));
  ok(bandStart > 0, 'the band before the full-width card is placed');
  eq([col(placed, 'b'), col(placed, 'c')], [1, 2], 'the band after it starts a fresh two-column pair');
}

export function testOrderIsKeptWithinAColumn() {
  const placed = packDashboard(cards(['a', 200], ['b', 180], ['c', 300], ['d', 240]));
  for (const colNo of [1, 2]) {
    const rows = placed.filter(p => p.column === colNo).map(p => p.row);
    eq(rows, [...rows].sort((x, y) => x - y), `column ${colNo} reads top-down in the saved order`);
  }
  eq(placed.map(p => p.key), ['a', 'b', 'c', 'd'], 'the result keeps the input order');
}

export function testBalancedColumnsIsExact() {
  eq(balancedColumns([]), [], 'no cards → no columns');
  eq(balancedColumns([10]), [false], 'one card stays in the left column');
  eq(balancedColumns([10, 10]), [false, true], 'two equal cards go side by side');
  // contiguous splits of [5,7,5,7,5]: 5|24, 12|17, 17|12, 24|5 → the 17 split wins
  eq(balancedColumns([5, 7, 5, 7, 5]), [false, true, false, true, false], 'the most even split wins (12 vs 17)');
  ok(balancedColumns([5, 7, 5, 7, 5])[0] === false, 'the first card of a band always starts the left column');
}

export function testNoCardsAreLost() {
  const keys = DASHBOARD_WIDGET_KEYS;
  const placed = packDashboard(keys.map((key, i) => ({ key, height: 150 + (i % 4) * 60, full: i % 3 === 0 })));
  eq(placed.map(p => p.key), keys, 'every card is placed, in order');
  ok(placed.every(p => p.span >= 1), 'every card has a positive span');
  eq(packDashboard([]), [], 'an empty board packs to nothing');
  eq(packDashboard(null), [], 'a missing board packs to nothing');
}

export function testCssAndJsAgreeOnTheGrid() {
  ok(/\.dashboard-board\.is-masonry\s*\{[^}]*grid-auto-rows:\s*4px/.test(flatCss),
    'flat.css sizes the packed board in 4px rows (the unit pack.js measures in)');
  ok(/\.dashboard-board\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s.test(flatCss),
    'flat.css gives the board two equal columns');
  ok(/packDashboard\(/.test(appSource) && /getBoundingClientRect\(\)\.height/.test(appSource),
    'app.js measures the real cards and packs them with packDashboard');
  ok(!/grid-auto-flow:\s*dense/.test(flatCss), 'the board relies on the packer, not auto-placement');
}

export function testAddTileIsPlacedAfterPackedCards() {
  ok(/placed\.reduce\(\(end, slot\) => Math\.max\(end, slot\.row \+ slot\.span\)/.test(appSource),
    'add tile starts after the last packed card');
  ok(/addTile\.style\.gridRow = ''/.test(appSource), 'normal flow clears the packed tile position');
  ok(/count\.textContent = String\(dashboardHidden\.size\);[\s\S]*?scheduleDashboardLayout\(\)/.test(appSource),
    'visibility changes repack the board');
}

export function testDesktopToMobileUsesCssBreakpoint() {
  ok(appSource.includes("window.matchMedia('(min-width: 761px)').matches"),
    'desktop packing follows the CSS breakpoint, not stale implicit grid tracks');
}

export function testPackedCardsUseOneGutter() {
  const placed = packDashboard(cards(['a', 200, true], ['b', 100, true]), { gutter: 14 });
  eq(placed[1].row, placed[0].row + placed[0].span,
    'the next card starts after the span, which already includes the gutter');
}
