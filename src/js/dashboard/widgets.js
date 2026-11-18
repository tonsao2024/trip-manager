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
 *   2. Add one entry to DASHBOARD_WIDGETS below.
 *   The card then appears in the “เลือกการ์ด” picker, in Arrange mode, and syncs
 *   across devices. New cards are appended after a saved order, so no layout breaks.
 *   tests/unit/dashboard-widgets.test.js fails if the markup and this list disagree.
 */

/** @typedef {{key:string, size:'half'|'full', icon:string, th:string, en:string, hintTh:string, hintEn:string}} DashboardWidget */

/** @type {ReadonlyArray<DashboardWidget>} Default order = the order of this list. */
export const DASHBOARD_WIDGETS = Object.freeze([
  // v38 professional rebalance: pairs always pair, list-heavy cards go full.
  // Flow: glance → KPIs → time → activity → spending → wishlist → people → teams.
  { key: 'countdown', size: 'half', icon: 'timer', th: 'นับถอยหลัง', en: 'Countdown', hintTh: 'เหลือเวลาอีกกี่วันก่อนออกเดินทาง', hintEn: 'Time left before departure' },
  { key: 'weather', size: 'half', icon: 'cloud-sun', th: 'พยากรณ์อากาศ', en: 'Weather', hintTh: 'อากาศที่ปลายทางตามวันที่ไป', hintEn: 'Forecast for the destination' },
  { key: 'kpis', size: 'full', icon: 'gauge', th: 'ตัวเลขสำคัญ', en: 'Key numbers', hintTh: 'ยอดรวม ยอดของฉัน และงบคงเหลือ', hintEn: 'Total, my share and budget left' },
  { key: 'current', size: 'half', icon: 'target', th: 'กิจกรรมตอนนี้', en: 'Happening now', hintTh: 'กิจกรรมที่กำลังดำเนินอยู่', hintEn: 'What is on right now' },
  { key: 'up-next', size: 'half', icon: 'clock', th: 'กิจกรรมถัดไป', en: 'Up next', hintTh: 'กิจกรรมที่กำลังจะถึง', hintEn: 'What comes next' },
  { key: 'bookings', size: 'half', icon: 'ticket', th: 'การจองที่กำลังจะถึง', en: 'Upcoming bookings', hintTh: 'ตั๋ว ที่พัก และการเดินทางที่ใกล้ถึง', hintEn: 'Tickets, stays and transport coming up' },
  { key: 'recent-expenses', size: 'half', icon: 'receipt', th: 'รายการล่าสุด', en: 'Recent expenses', hintTh: 'ค่าใช้จ่ายที่บันทึกล่าสุด', hintEn: 'Latest recorded expenses' },
  { key: 'category', size: 'half', icon: 'pie-chart', th: 'ค่าใช้จ่ายตามหมวด', en: 'Spend by category', hintTh: 'สัดส่วนค่าใช้จ่ายแต่ละหมวด', hintEn: 'Spending split by category' },
  { key: 'estimate', size: 'half', icon: 'bar-chart-3', th: 'ประมาณการ vs จ่ายจริง', en: 'Estimated vs actual', hintTh: 'งบที่ประมาณไว้เทียบกับที่จ่ายจริง', hintEn: 'Planned budget vs actual' },
  // Wishlist and Members pair as standard half-width cards so every list/detail
  // card shares the same column width and bounded height.
  { key: 'ideas', size: 'half', icon: 'lightbulb', th: 'สถานที่ที่อยากไป', en: 'Wishlist', hintTh: 'ไอเดียสถานที่ที่รวบรวมไว้', hintEn: 'Places the group wants to visit' },
  { key: 'members', size: 'half', icon: 'users', th: 'สมาชิก', en: 'Members', hintTh: 'จ่ายไปและรับผิดชอบของแต่ละคน', hintEn: 'Paid and share per person' },
  // Teams spans the full row at the bottom so multiple compact team sub-cards
  // and the whole-trip benchmark sit side-by-side in one balanced row.
  { key: 'teams', size: 'full', icon: 'users-round', th: 'ทีม', en: 'Teams', hintTh: 'ค่าใช้จ่ายต่อคนและรวมของแต่ละทีม', hintEn: 'Cost per person and per team' }
]);

export const DASHBOARD_WIDGET_KEYS = DASHBOARD_WIDGETS.map(w => w.key);

/** Card definition by key, or null. */
export function widgetMeta(key) {
  return DASHBOARD_WIDGETS.find(w => w.key === key) || null;
}

const KNOWN = new Set(DASHBOARD_WIDGET_KEYS);

/**
 * Cards that must always sit side by side (left → right). v44: the owner asked for
 * “การจองที่กำลังจะถึง” (upcoming bookings) to live beside “รายการล่าสุด” (recent
 * expenses) — the two halves of “what is coming / what just happened” — and for
 * that pair to stay shorter than the members card. Pairing them here means an
 * older saved layout inherits the change too, instead of only new trips.
 */
export const DASHBOARD_PAIRS = Object.freeze([Object.freeze(['bookings', 'recent-expenses'])]);

/**
 * Saved order → every known card exactly once. Unknown keys are dropped and cards
 * missing from the saved order (added later) go to the end.
 *
 * This stays a pure clean-up: the document keeps exactly the order the owner
 * arranged. The “these two always sit together” rule is a *display* rule and
 * lives in `pairWidgetRows`, so a save never rewrites someone's arrangement.
 */
export function normalizeWidgetOrder(raw) {
  const kept = Array.isArray(raw) ? [...new Set(raw.map(String).filter(k => KNOWN.has(k)))] : [];
  return [...kept, ...DASHBOARD_WIDGET_KEYS.filter(k => !kept.includes(k))];
}

/** Saved hidden list → unique known keys (no hidden card → []). */
export function normalizeHiddenWidgets(raw) {
  return Array.isArray(raw) ? [...new Set(raw.map(String).filter(k => KNOWN.has(k)))] : [];
}

/**
 * Grid-aware pairing (v44) — the order the board actually lays out.
 *
 * Two rules, in this order:
 *
 *  1. `DASHBOARD_PAIRS`: “การจองที่กำลังจะถึง” is moved to sit immediately before
 *     “รายการล่าสุด”, wherever a saved order had put it (owner: “ย้าย … ขึ้นไป
 *     อยู่กับ รายการล่าสุด”). The stored document is not rewritten — this is how
 *     the board is painted, so a saved layout still belongs to its owner.
 *  2. The board is a two-column grid: half cards fill left→right and a full-width
 *     card starts a new row. If the pair's first card would land in the right
 *     column it splits across two rows again, so it is swapped with the card that
 *     opened that row and the two halves really share a row.
 *
 * Hidden cards never reach the grid, so they are ignored by the column count and
 * keep their place in the returned order.
 *
 * @param {string[]} rawOrder saved (or default) order, unsanitised
 * @param {string[]} [hidden] keys the board does not render
 * @returns {string[]} every card exactly once, pairs sharing a row
 */
export function pairWidgetRows(rawOrder, hidden = []) {
  let order = normalizeWidgetOrder(rawOrder);
  for (const [before, after] of DASHBOARD_PAIRS) {
    const from = order.indexOf(before);
    const to = order.indexOf(after);
    if (from < 0 || to < 0 || from === to - 1) continue;
    order = [...order.slice(0, from), ...order.slice(from + 1)];
    order.splice(order.indexOf(after), 0, before);
  }
  const hiddenSet = new Set(normalizeHiddenWidgets(hidden));
  const visible = order.filter(key => !hiddenSet.has(key));
  const arranged = [];
  let columnsUsed = 0;   // 0 = left column is free, 1 = right column is next
  for (let i = 0; i < visible.length; i++) {
    const key = visible[i];
    const size = widgetMeta(key)?.size || 'half';
    if (size === 'full') {
      arranged.push(key);
      columnsUsed = 0;
      continue;
    }
    const pair = DASHBOARD_PAIRS.find(([first, second]) => first === key && visible[i + 1] === second);
    if (pair && columnsUsed === 1 && arranged.length) {
      // The pair would start on the right: give it the row and send the card it
      // displaced to the left column of the next row (it keeps its neighbour).
      const displaced = arranged.pop();
      arranged.push(key, pair[1], displaced);
      columnsUsed = 1;
      i += 1;                       // pair[1] is already placed
      continue;
    }
    arranged.push(key);
    columnsUsed = columnsUsed === 0 ? 1 : 0;
  }
  // Put the hidden cards back where they were in the saved order.
  let cursor = 0;
  return order.map(key => (hiddenSet.has(key) ? key : arranged[cursor++]));
}
