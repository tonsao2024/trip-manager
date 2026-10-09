import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DASHBOARD_WIDGETS, DASHBOARD_WIDGET_KEYS, normalizeWidgetOrder, normalizeHiddenWidgets, widgetMeta
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
