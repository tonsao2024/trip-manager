import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DASHBOARD_WIDGETS, DASHBOARD_WIDGET_KEYS, normalizeWidgetOrder, normalizeHiddenWidgets
} from '../../src/js/dashboard/widgets.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const appSource = readFileSync(path.join(here, '../../src/js/app.js'), 'utf8');

function eq(actual, expected, label) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${label}: expected ${b}, got ${a}`);
}

/** Default order and card sizes match the first render as well as the picker. */
export function testDashboardRegistryMatchesBoardMarkup() {
  eq(new Set(DASHBOARD_WIDGET_KEYS).size, DASHBOARD_WIDGET_KEYS.length, 'registry keys are unique');
  const markup = [...appSource.matchAll(/<section class="dash-widget dash-widget--(half|full)" data-dashboard-widget="([a-z-]+)">/g)]
    .map(m => ({ size: m[1], key: m[2] }));
  eq(markup, DASHBOARD_WIDGETS.map(({ size, key }) => ({ size, key })), 'board sections match registry order and size');
}

export function testDefaultDashboardGroupsSpendingNearTheTop() {
  const order = normalizeWidgetOrder([]);
  eq(order.slice(0, 6), ['countdown', 'weather', 'kpis', 'teams', 'estimate', 'category'],
    'spending cards follow the trip overview in one group');
  eq(order.indexOf('recent-expenses') - order.indexOf('bookings'), 1, 'default keeps bookings and recent expenses together');
}

export function testDashboardOrderNormalizes() {
  eq(normalizeWidgetOrder(undefined), DASHBOARD_WIDGET_KEYS, 'no saved order → registry order');
  const order = normalizeWidgetOrder(['ideas', 'nope', 'ideas', 'countdown']);
  eq(order.slice(0, 2), ['ideas', 'countdown'], 'saved keys keep their order');
  eq(order.length, DASHBOARD_WIDGET_KEYS.length, 'every card exactly once');
  eq(new Set(order).size, order.length, 'no duplicates');
  eq(order.includes('nope'), false, 'unknown keys dropped');
  eq(normalizeWidgetOrder('oops'), DASHBOARD_WIDGET_KEYS, 'non-array → registry order');
}

export function testSavedDashboardOrdersTakePrecedenceOverDefaultPairs() {
  const saved = ['category', 'recent-expenses', 'teams', 'ideas', 'bookings'];
  eq(normalizeWidgetOrder(saved), [...saved, ...DASHBOARD_WIDGET_KEYS.filter(key => !saved.includes(key))],
    'preserve a custom order even when it splits a default pair');
}

export function testHiddenWidgetsNormalize() {
  eq(normalizeHiddenWidgets(['kpis', 'bogus', 'kpis']), ['kpis'], 'unique known keys only');
  eq(normalizeHiddenWidgets(undefined), [], 'missing → nothing hidden');
  eq(normalizeHiddenWidgets('kpis'), [], 'non-array → nothing hidden');
}
