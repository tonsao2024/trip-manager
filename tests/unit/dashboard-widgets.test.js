import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DASHBOARD_WIDGETS, DASHBOARD_WIDGET_KEYS, DASHBOARD_PAIRS, normalizeWidgetOrder, normalizeHiddenWidgets,
  widgetMeta, pairWidgetRows
} from '../../src/js/dashboard/widgets.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const appSource = readFileSync(path.join(here, '../../src/js/app.js'), 'utf8');

function eq(actual, expected, label) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${label}: expected ${b}, got ${a}`);
}

/** Every card in the registry has a board section with the same size, and no section is unregistered. */
export function testDashboardRegistryMatchesBoardMarkup() {
  eq(new Set(DASHBOARD_WIDGET_KEYS).size, DASHBOARD_WIDGET_KEYS.length, 'registry keys are unique');
  const markup = [...appSource.matchAll(/<section class="dash-widget dash-widget--(half|full)" data-dashboard-widget="([a-z-]+)">/g)]
    .map(m => ({ size: m[1], key: m[2] }));
  eq(markup.map(m => m.key).sort(), [...DASHBOARD_WIDGET_KEYS].sort(), 'board sections = registry keys');
  for (const w of DASHBOARD_WIDGETS) {
    const section = markup.find(m => m.key === w.key);
    eq(section?.size, w.size, `size of ${w.key}`);
    if (!['half', 'full'].includes(w.size)) throw new Error(`bad size for ${w.key}`);
  }
}

export function testDashboardOrderNormalizes() {
  eq(normalizeWidgetOrder(undefined), DASHBOARD_WIDGET_KEYS, 'no saved order → registry order (existing layouts unchanged)');
  const order = normalizeWidgetOrder(['ideas', 'nope', 'ideas', 'countdown']);
  eq(order.slice(0, 2), ['ideas', 'countdown'], 'saved keys keep their order');
  eq(order.length, DASHBOARD_WIDGET_KEYS.length, 'every card exactly once');
  eq(new Set(order).size, order.length, 'no duplicates');
  eq(order.includes('nope'), false, 'unknown keys dropped');
  eq(normalizeWidgetOrder('oops'), DASHBOARD_WIDGET_KEYS, 'non-array → registry order');
}

export function testHiddenWidgetsNormalize() {
  eq(normalizeHiddenWidgets(['kpis', 'bogus', 'kpis']), ['kpis'], 'unique known keys only');
  eq(normalizeHiddenWidgets(undefined), [], 'missing → nothing hidden');
  eq(normalizeHiddenWidgets('kpis'), [], 'non-array → nothing hidden');
  eq(widgetMeta('bookings')?.size, 'half', 'widgetMeta finds a card');
  eq(widgetMeta('nope'), null, 'widgetMeta returns null for unknown keys');
}

/** Where the two-column board will put each card (the grid fills left → right). */
function boardRows(order) {
  const rows = [];
  let row = [];
  for (const key of order) {
    if (widgetMeta(key)?.size === 'full') {
      if (row.length) rows.push(row);
      rows.push([key]);
      row = [];
      continue;
    }
    row.push(key);
    if (row.length === 2) { rows.push(row); row = []; }
  }
  if (row.length) rows.push(row);
  return rows;
}

const columnOf = (order, key) => {
  const rows = boardRows(order);
  const index = rows.findIndex(keys => keys.includes(key));
  return { row: index, col: rows[index]?.indexOf(key) ?? -1, rows };
};

// v44 (owner: “ย้าย การจองที่กำลังจะถึง ขึ้นไปอยู่กับ รายการล่าสุด”): the two halves of
// “what is coming / what just happened” always share one row — even in a layout the
// owner saved before the rule existed, and even when a full-width card is in front.
export function testBookingsAlwaysPairsWithRecentExpenses() {
  const pair = DASHBOARD_PAIRS.find(([a, b]) => a === 'bookings' && b === 'recent-expenses');
  eq(pair, ['bookings', 'recent-expenses'], 'the pair is registered left → right');
  const defaultOrder = DASHBOARD_WIDGET_KEYS;
  eq(defaultOrder.indexOf('recent-expenses') - defaultOrder.indexOf('bookings'), 1, 'the default order already pairs them');

  const layouts = [
    undefined,
    ['ideas', 'recent-expenses', 'kpis', 'bookings', 'countdown'],          // saved apart, pair in the right column
    ['countdown', 'weather', 'kpis', 'current', 'bookings', 'recent-expenses'],
    ['recent-expenses', 'ideas', 'countdown', 'weather', 'kpis', 'bookings'],
    [...DASHBOARD_WIDGET_KEYS].reverse(),
    ['members', 'teams', 'bookings', 'ideas', 'recent-expenses', 'kpis']
  ];
  for (const saved of layouts) {
    for (const hidden of [[], ['ideas'], ['category', 'estimate'], ['kpis', 'current', 'up-next', 'countdown', 'weather']]) {
      const visible = pairWidgetRows(saved, hidden).filter(key => !normalizeHiddenWidgets(hidden).includes(key));
      const a = columnOf(visible, 'bookings');
      const b = columnOf(visible, 'recent-expenses');
      eq(a.row, b.row, `bookings + recent-expenses share a row (saved ${JSON.stringify(saved)}, hidden ${JSON.stringify(hidden)})`);
      eq([a.col, b.col], [0, 1], 'bookings is the left half and recent-expenses the right half');
    }
  }
}

export function testPairingLeavesTheSavedDocumentAlone() {
  const dragged = [...DASHBOARD_WIDGET_KEYS].reverse();
  eq(normalizeWidgetOrder(dragged), dragged, 'a saved order is stored exactly as the owner arranged it');
  eq(pairWidgetRows(dragged).length, DASHBOARD_WIDGET_KEYS.length, 'every card is still painted once');
  eq(new Set(pairWidgetRows(dragged)).size, DASHBOARD_WIDGET_KEYS.length, 'no card is painted twice');
  const once = pairWidgetRows(dragged, ['ideas']);
  eq(new Set(pairWidgetRows(once, ['ideas'])), new Set(once), 're-painting a paired board changes nothing');
}
