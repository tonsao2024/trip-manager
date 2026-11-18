/**
 * Dashboard card registry: the one list of cards a trip dashboard can show.
 *
 * Which cards are shown, and their order, are stored on the trip document
 * (`dashboardHidden` and `dashboardLayout`), so every member sees the same board.
 *
 * Adding a card (about five minutes):
 *   1. Add a `<section class="dash-widget dash-widget--half|full" data-dashboard-widget="KEY">`
 *      block to the board markup in renderDashboard (app.js), and fill it in from
 *      the data code there.
 *   2. Add one entry to DASHBOARD_WIDGETS below, in the same order as the markup.
 *   The card then appears in the “เลือกการ์ด” picker, in Arrange mode, and syncs
 *   across devices. New cards are appended after a saved order, so no layout breaks.
 *   tests/unit/dashboard-widgets.test.js fails if the markup and this list disagree.
 */

/** @typedef {{key:string, size:'half'|'full', icon:string, th:string, en:string, hintTh:string, hintEn:string}} DashboardWidget */

/** @type {ReadonlyArray<DashboardWidget>} Default order = the order of this list. */
export const DASHBOARD_WIDGETS = Object.freeze([
  // After the trip overview, keep the spending summary and breakdowns together.
  { key: 'countdown', size: 'half', icon: 'timer', th: 'นับถอยหลัง', en: 'Countdown', hintTh: 'เหลือเวลาอีกกี่วันก่อนออกเดินทาง', hintEn: 'Time left before departure' },
  { key: 'weather', size: 'half', icon: 'cloud-sun', th: 'พยากรณ์อากาศ', en: 'Weather', hintTh: 'อากาศที่ปลายทางตามวันที่ไป', hintEn: 'Forecast for the destination' },
  { key: 'kpis', size: 'full', icon: 'gauge', th: 'ตัวเลขสำคัญ', en: 'Key numbers', hintTh: 'ยอดรวม ยอดของฉัน และงบคงเหลือ', hintEn: 'Total, my share and budget left' },
  { key: 'teams', size: 'full', icon: 'users-round', th: 'ทีม', en: 'Teams', hintTh: 'ค่าใช้จ่ายต่อคนและรวมของแต่ละทีม', hintEn: 'Cost per person and per team' },
  { key: 'estimate', size: 'half', icon: 'bar-chart-3', th: 'ประมาณการเทียบจ่ายจริง', en: 'Estimated vs actual', hintTh: 'งบที่ประมาณไว้เทียบกับที่จ่ายจริง', hintEn: 'Planned budget vs actual' },
  { key: 'category', size: 'half', icon: 'pie-chart', th: 'ค่าใช้จ่ายตามหมวด', en: 'Spend by category', hintTh: 'สัดส่วนค่าใช้จ่ายแต่ละหมวด', hintEn: 'Spending split by category' },
  { key: 'current', size: 'half', icon: 'target', th: 'กิจกรรมตอนนี้', en: 'Happening now', hintTh: 'กิจกรรมที่กำลังดำเนินอยู่', hintEn: 'What is on right now' },
  { key: 'up-next', size: 'half', icon: 'clock', th: 'กิจกรรมถัดไป', en: 'Up next', hintTh: 'กิจกรรมที่กำลังจะถึง', hintEn: 'What comes next' },
  { key: 'bookings', size: 'half', icon: 'ticket', th: 'การจองที่กำลังจะถึง', en: 'Upcoming bookings', hintTh: 'ตั๋ว ที่พัก และการเดินทางที่ใกล้ถึง', hintEn: 'Tickets, stays and transport coming up' },
  { key: 'recent-expenses', size: 'half', icon: 'receipt', th: 'รายการล่าสุด', en: 'Recent expenses', hintTh: 'ค่าใช้จ่ายที่บันทึกล่าสุด', hintEn: 'Latest recorded expenses' },
  { key: 'ideas', size: 'half', icon: 'lightbulb', th: 'สถานที่ที่อยากไป', en: 'Wishlist', hintTh: 'ไอเดียสถานที่ที่รวบรวมไว้', hintEn: 'Places the group wants to visit' },
  { key: 'members', size: 'half', icon: 'users', th: 'สมาชิก', en: 'Members', hintTh: 'จ่ายไปและรับผิดชอบของแต่ละคน', hintEn: 'Paid and share per person' }
]);

export const DASHBOARD_WIDGET_KEYS = DASHBOARD_WIDGETS.map(w => w.key);

const KNOWN = new Set(DASHBOARD_WIDGET_KEYS);
const knownKeys = (raw) => Array.isArray(raw) ? [...new Set(raw.filter(k => KNOWN.has(k)))] : [];

/**
 * Saved order → every known card exactly once. Unknown keys are dropped and cards
 * missing from the saved order (added later) go to the end. An empty or missing
 * list uses the default; otherwise the manager's order takes precedence.
 */
export function normalizeWidgetOrder(raw) {
  const kept = knownKeys(raw);
  return [...kept, ...DASHBOARD_WIDGET_KEYS.filter(k => !kept.includes(k))];
}

/** Saved hidden list → unique known keys (no hidden card → []). */
export function normalizeHiddenWidgets(raw) {
  return knownKeys(raw);
}
