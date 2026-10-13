// Notifications — pure logic (no Firebase, no DOM) so the Node unit suite can
// test the message building, the daily-summary maths and the read/unread rules.
//
// Everything the app shows in the 🔔 bell, writes to Firestore
// (`trips/{tripId}/notifications`) and pushes over Web Push/FCM is built here.
import { toThbMinor, effectiveThbRate, formatCurrency, formatAmount, fromMinor, getCurrencyDecimals } from './currency.js';

/* ------------------------------------------------------------------ types */

export const NOTIFICATION_TYPES = ['expense', 'daily_summary', 'settlement', 'member', 'trip', 'test'];

const TYPE_META = {
  expense: { icon: 'wallet', color: 'var(--primary)', th: 'ค่าใช้จ่ายใหม่', en: 'New expense' },
  daily_summary: { icon: 'calendar-check', color: 'var(--brand-yellow-raw)', th: 'สรุปค่าใช้จ่ายรายวัน', en: 'Daily expense summary' },
  settlement: { icon: 'hand-coins', color: 'var(--success)', th: 'เคลียร์บิล', en: 'Settlement' },
  member: { icon: 'users', color: 'var(--info)', th: 'สมาชิก', en: 'Members' },
  trip: { icon: 'compass', color: 'var(--primary)', th: 'ทริป', en: 'Trip' },
  test: { icon: 'bell-ring', color: 'var(--text-secondary)', th: 'ทดสอบการแจ้งเตือน', en: 'Test notification' }
};

export function notificationMeta(type, lang = 'th') {
  const meta = TYPE_META[type] || TYPE_META.trip;
  return {
    type,
    icon: meta.icon,
    color: meta.color,
    label: lang === 'th' ? meta.th : meta.en
  };
}

export function isNotificationType(type) {
  return NOTIFICATION_TYPES.includes(type);
}

/* ------------------------------------------------------------- date keys */

/** `YYYY-MM-DD` for a moment, in the trip's own timezone (falls back to local). */
export function dayKeyInZone(date = new Date(), timeZone = null) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  if (timeZone) {
    try {
      // en-CA renders ISO-like YYYY-MM-DD.
      return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
    } catch { /* unknown timezone → local */ }
  }
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Local hour (0-23) of a moment inside the trip timezone. */
export function hourInZone(date = new Date(), timeZone = null) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return 0;
  if (timeZone) {
    try {
      return Number(new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', hour12: false }).format(d));
    } catch { /* fall through */ }
  }
  return d.getHours();
}

/** The daily summary has one document per trip and per day — a stable id. */
export function dailySummaryId(day) {
  return `daily-${day}`;
}

export function isDailySummaryId(id) {
  return /^daily-\d{4}-\d{2}-\d{2}$/.test(String(id || ''));
}

/* ---------------------------------------------------------------- money */

/** What one member owes for one expense, in THB minor units. */
export function expenseShareInThb(expense, memberId) {
  if (!expense || !memberId) return 0;
  const net = Number(expense.netTotalMinor) || 0;
  const thb = Number(expense.thbMinor) || 0;
  const alloc = (expense.allocations || []).find(a => a.memberId === memberId);
  if (!alloc) return 0;
  const amount = Number(alloc.amountMinor) || 0;
  if (!net) return 0;
  if (thb) return Math.round(thb * (amount / net));
  return toThbMinor(amount, expense.currency || 'THB', effectiveThbRate(expense, null));
}

/** Total THB of an expense (stored thbMinor, or converted on the fly). */
export function expenseThb(expense) {
  if (!expense) return 0;
  const thb = Number(expense.thbMinor);
  if (Number.isFinite(thb) && thb !== 0) return thb;
  return toThbMinor(Number(expense.netTotalMinor) || 0, expense.currency || 'THB', effectiveThbRate(expense, null));
}

/* -------------------------------------------------------- doc payloads */

/**
 * Doc payload for “someone recorded an expense”.
 * `recipients` = every active member except the author (the author sees their
 * own action in the list without a bell ping).
 */
export function expenseNotificationPayload({ tripId, expense, authorId = '', authorName = '', members = [], lang = 'th' }) {
  if (!expense) return null;
  const currency = expense.currency || 'THB';
  const amountMinor = Number(expense.netTotalMinor) || 0;
  const amount = formatCurrency(amountMinor, currency);
  const who = authorName || (lang === 'th' ? 'เพื่อนในทริป' : 'A trip member');
  const title = expense.title || (lang === 'th' ? 'ค่าใช้จ่าย' : 'Expense');
  return {
    type: 'expense',
    date: expense.date || dayKeyInZone(),
    title: lang === 'th' ? `บันทึกค่าใช้จ่าย: ${title}` : `Expense recorded: ${title}`,
    body: lang === 'th'
      ? `${who} บันทึก ${amount} (${expense.isEstimated ? 'ประมาณการ' : 'จ่ายจริง'})`
      : `${who} recorded ${amount} (${expense.isEstimated ? 'estimate' : 'actual'})`,
    amountMinor,
    currency,
    expenseId: expense.id || null,
    link: expense.id ? `#/trip/${tripId}/expenses/add?id=${expense.id}` : `#/trip/${tripId}/expenses`,
    recipients: (members || [])
      .filter(m => m && m.id && m.id !== authorId && m.status !== 'inactive')
      .map(m => m.id),
    readBy: {},
    createdByName: authorName || ''
  };
}

/**
 * Daily summary of one day, from the trip's own expenses.
 * @returns {null|object} null when that day has no recorded spending.
 */
export function dailySummary({ expenses = [], members = [], day, trip = null, myId = '', lang = 'th', byName = '' }) {
  const list = (expenses || []).filter(e => e && e.status !== 'voided' && e.date === day);
  if (!list.length) return null;

  const totalThbMinor = list.reduce((sum, e) => sum + expenseThb(e), 0);
  const count = list.length;

  const byCategory = new Map();
  for (const e of list) {
    const key = e.category || 'other';
    byCategory.set(key, (byCategory.get(key) || 0) + expenseThb(e));
  }
  const topCategory = [...byCategory.entries()].sort((a, b) => b[1] - a[1])[0] || null;

  const perMember = new Map();
  for (const e of list) {
    for (const a of e.allocations || []) {
      if (!a?.memberId) continue;
      perMember.set(a.memberId, (perMember.get(a.memberId) || 0) + expenseShareInThb(e, a.memberId));
    }
  }
  const nameOf = (id) => members.find(m => m.id === id)?.displayName || id;
  const memberTotals = [...perMember.entries()]
    .map(([memberId, amountThbMinor]) => ({ memberId, name: nameOf(memberId), amountThbMinor }))
    .sort((a, b) => b.amountThbMinor - a.amountThbMinor);

  const myShareThbMinor = perMember.get(myId) || 0;
  const money = (minor) => formatCurrency(minor, 'THB');
  const parts = [
    lang === 'th'
      ? `วันนี้ทั้งทริปใช้จ่าย ${money(totalThbMinor)} จาก ${count} รายการ`
      : `The trip spent ${money(totalThbMinor)} today across ${count} items`
  ];
  if (topCategory) {
    parts.push(lang === 'th'
      ? `หมวดที่ใช้มากสุด: ${topCategory[0]} (${money(topCategory[1])})`
      : `Top category: ${topCategory[0]} (${money(topCategory[1])})`);
  }
  if (myShareThbMinor > 0) {
    parts.push(lang === 'th' ? `ส่วนของคุณ ${money(myShareThbMinor)}` : `Your share ${money(myShareThbMinor)}`);
  }

  return {
    type: 'daily_summary',
    date: day,
    title: lang === 'th' ? `สรุปค่าใช้จ่าย ${day}` : `Expense summary ${day}`,
    body: parts.join(' • '),
    amountMinor: totalThbMinor,
    currency: 'THB',
    count,
    topCategory: topCategory ? { category: topCategory[0], amountThbMinor: topCategory[1] } : null,
    memberTotals,
    myShareThbMinor,
    totalThbMinor,
    link: `#/trip/${trip?.id || ''}/expenses`,
    readBy: {},
    createdByName: byName
  };
}

/** Plain-language line for one member (used by the receipt/detail view). */
export function dailySummaryMemberLine(row, lang = 'th') {
  if (!row) return '';
  const amount = formatCurrency(row.amountThbMinor || 0, 'THB');
  return lang === 'th' ? `${row.name} — ${amount}` : `${row.name} — ${amount}`;
}

/* ------------------------------------------------------------ VAPID key */

/**
 * Check the shape of a Web Push (VAPID) public key for config diagnostics.
 * A real key from Firebase Console → Cloud Messaging → Web Push certificates
 * is the base64url encoding of a 65-byte uncompressed P-256 point: 87
 * characters, starting with "B". It is a PUBLIC key — safe to share/store.
 * @returns {{valid:boolean, reason:string}} reason is '' when valid.
 */
export function validateVapidKey(key, lang = 'th') {
  const th = (a, b) => (lang === 'th' ? a : b);
  const value = String(key || '').trim();
  if (!value) return { valid: false, reason: th('ยังไม่ได้กำหนด VAPID key', 'No VAPID key is configured') };
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    return { valid: false, reason: th('VAPID key มีตัวอักษรที่ใช้ไม่ได้ — ต้องมีเฉพาะตัวอักษร/ตัวเลขและ - _ ไม่มีช่องว่างหรือเครื่องหมายคำพูด', 'The VAPID key contains invalid characters — use only letters, numbers, - and _, with no spaces or quotes') };
  }
  if (!value.startsWith('B') || value.length < 80 || value.length > 95) {
    return { valid: false, reason: th('รูปแบบ VAPID key ไม่ถูกต้อง — คีย์ Web Push จริงยาว 87 ตัวและขึ้นต้นด้วย B (ใช้ “Key pair” ใน Web Push certificates ไม่ใช่ Server key)', 'This does not look like a Web Push key — a real one is 87 characters starting with B (use “Key pair” under Web Push certificates, not the Server key)') };
  }
  return { valid: true, reason: '' };
}

/* --------------------------------------------------------------- prefs */

export const NOTIFY_PREFS_KEY = 'fuji_notify_prefs';

export const NOTIFY_PREFS_DEFAULTS = {
  enabled: true,        // the in-app bell
  expense: true,        // ping me when a new expense is recorded
  dailySummary: true,   // daily expense summary
  settlement: true,     // transfers / clear-the-bill events
  member: true,         // members joining or leaving
  push: false,          // Web Push (needs the Cloud Functions + a VAPID key)
  summaryHour: 20,      // 20:00 in the trip timezone
  hidden: []            // notification ids dismissed on this device
};

export function normalizePrefs(raw = {}) {
  const out = { ...NOTIFY_PREFS_DEFAULTS };
  for (const key of Object.keys(NOTIFY_PREFS_DEFAULTS)) {
    if (raw[key] === undefined || raw[key] === null) continue;
    if (key === 'hidden') out.hidden = Array.isArray(raw.hidden) ? [...new Set(raw.hidden.filter(x => typeof x === 'string'))] : [];
    else if (key === 'summaryHour') {
      const n = Number(raw.summaryHour);
      out.summaryHour = Number.isFinite(n) ? Math.min(23, Math.max(0, Math.round(n))) : NOTIFY_PREFS_DEFAULTS.summaryHour;
    }
    else out[key] = typeof NOTIFY_PREFS_DEFAULTS[key] === 'boolean' ? !!raw[key] : raw[key];
  }
  return out;
}

/** Does this device want notifications of that type at all? */
export function allowsType(prefs, type) {
  const p = normalizePrefs(prefs);
  if (!p.enabled) return false;
  if (type === 'expense') return p.expense;
  if (type === 'daily_summary') return p.dailySummary;
  if (type === 'settlement') return p.settlement;
  if (type === 'member' || type === 'trip') return p.member;
  return true; // test / system always show
}

/* ---------------------------------------------------------------- list */

/** Newest first; tolerant to Timestamps, Dates and ISO strings. */
export function sortNotifications(list = []) {
  return [...list].sort((a, b) => notifMillis(b) - notifMillis(a));
}

export function notifMillis(n) {
  const t = n?.createdAt;
  if (!t) return Number(n?.createdAtMs) || 0;
  if (typeof t === 'number') return t;
  if (typeof t.toMillis === 'function') return t.toMillis();
  if (t.seconds != null) return Number(t.seconds) * 1000;
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

export function isReadBy(notification, uid) {
  return Boolean(uid && notification?.readBy?.[uid]);
}

/** Unread notifications for one account (the author's own entries never ping). */
export function unreadFor(list = [], uid) {
  return list.filter(n => !isReadBy(n, uid));
}

export function unreadCount(list = [], uid) {
  return unreadFor(list, uid).length;
}

/** Notifications this device still wants to see (respects the type toggles). */
export function visibleNotifications(list = [], uid, prefs = NOTIFY_PREFS_DEFAULTS) {
  const p = normalizePrefs(prefs);
  const hidden = new Set(p.hidden || []);
  return sortNotifications(list)
    .filter(n => !hidden.has(n.id))
    .filter(n => allowsType(p, n.type));
}

/** Filter chips of the bell sheet: `type` = null means “all”. */
export function filterNotifications(list = [], type = null) {
  return type ? list.filter(n => n.type === type) : list;
}

export function notificationDayGroup(notification, { today, yesterday } = {}) {
  const day = String(notification?.date || '').slice(0, 10);
  if (today && day === today) return 'today';
  if (yesterday && day === yesterday) return 'yesterday';
  return 'earlier';
}

/** Group a list into Today / Yesterday / Earlier buckets (keeping order). */
export function groupNotifications(list = [], { today, yesterday, lang = 'th' } = {}) {
  const labels = {
    today: lang === 'th' ? 'วันนี้' : 'Today',
    yesterday: lang === 'th' ? 'เมื่อวาน' : 'Yesterday',
    earlier: lang === 'th' ? 'ก่อนหน้านี้' : 'Earlier'
  };
  const buckets = { today: [], yesterday: [], earlier: [] };
  for (const n of sortNotifications(list)) {
    buckets[notificationDayGroup(n, { today, yesterday })].push(n);
  }
  return ['today', 'yesterday', 'earlier']
    .filter(k => buckets[k].length)
    .map(k => ({ key: k, label: labels[k], items: buckets[k] }));
}

/** “2 นาทีที่แล้ว” / “2 minutes ago” — short, tolerant of missing dates. */
export function relativeTime(ts, lang = 'th', now = Date.now()) {
  const ms = typeof ts === 'number' ? ts : notifMillis({ createdAt: ts });
  if (!ms) return '';
  const diff = Math.max(0, now - ms);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return lang === 'th' ? 'เมื่อสักครู่' : 'just now';
  if (mins < 60) return lang === 'th' ? `${mins} นาทีที่แล้ว` : `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return lang === 'th' ? `${hours} ชม.ที่แล้ว` : `${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return lang === 'th' ? `${days} วันที่แล้ว` : `${days} d ago`;
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Grouping key for “one notification per trip per day” jobs. */
export function dedupeKey(type, tripId, day) {
  return `${type}:${tripId}:${day}`;
}

/**
 * Should the daily summary be written right now?
 * True once the trip-local clock passed the preferred hour and that day's
 * summary does not exist yet.
 */
export function shouldWriteDailySummary({ now = new Date(), timeZone = null, summaryHour = 20, existingDay = null, hasSpending = true } = {}) {
  if (!hasSpending) return false;
  const today = dayKeyInZone(now, timeZone);
  if (existingDay === today) return false;
  return hourInZone(now, timeZone) >= Number(summaryHour ?? 20);
}

/** Short “฿1,234.50” for the notification body (kept for tests / exports). */
export function moneyLabel(minor, currency = 'THB') {
  return formatCurrency(Number(minor) || 0, currency);
}

export function amountText(minor, currency = 'THB') {
  const decimals = getCurrencyDecimals(currency);
  const plain = formatAmount(fromMinor(Number(minor) || 0, decimals), decimals);
  return `${currency === 'THB' ? '฿' : ''}${plain}${currency === 'THB' ? '' : ` ${currency}`}`;
}
