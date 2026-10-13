// Unit tests — notification logic (bell list, daily summary, Web-Push payloads).
// Pure module: no Firebase, no DOM.
import fs from 'node:fs';
import path from 'node:path';
import {
  notificationMeta, isNotificationType,
  dayKeyInZone, hourInZone, dailySummaryId, isDailySummaryId,
  expenseShareInThb, expenseThb,
  expenseNotificationPayload, dailySummary, dailySummaryMemberLine,
  normalizePrefs, NOTIFY_PREFS_DEFAULTS, allowsType,
  sortNotifications, isReadBy, unreadFor, unreadCount, visibleNotifications, filterNotifications,
  groupNotifications, notificationDayGroup, relativeTime, shouldWriteDailySummary, amountText
} from '../../src/js/utils/notifications.js';

function assert(cond, msg) { if (!cond) throw new Error(msg); }
const eq = (a, b, msg) => assert(JSON.stringify(a) === JSON.stringify(b), `${msg}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);

const MEMBERS = [
  { id: 'u1', displayName: 'สมชาย' },
  { id: 'u2', displayName: 'นุ่น' },
  { id: 'u3', displayName: 'เคน', status: 'inactive' }
];

const EXPENSE = {
  id: 'e1', title: 'มื้อเย็นฟูจิ', date: '2026-10-13', category: 'food',
  currency: 'JPY', netTotalMinor: 12000, thbMinor: 2880, isEstimated: false,
  allocations: [{ memberId: 'u1', amountMinor: 6000 }, { memberId: 'u2', amountMinor: 6000 }],
  createdBy: 'u1'
};

/* --------------------------------------------------------------- metadata */

export function testNotificationTypes() {
  assert(isNotificationType('expense'), 'expense is a known type');
  assert(isNotificationType('daily_summary'), 'daily_summary is a known type');
  assert(!isNotificationType('nope'), 'unknown types are rejected');
  const th = notificationMeta('expense', 'th');
  const en = notificationMeta('daily_summary', 'en');
  assert(th.icon && th.label === 'ค่าใช้จ่ายใหม่', 'Thai label for an expense ping');
  assert(en.label === 'Daily expense summary', 'English label for the daily summary');
  assert(notificationMeta('mystery', 'th').icon === 'compass', 'unknown type falls back to a neutral icon');
}

/* ------------------------------------------------------------ date keys */

export function testDayKeysFollowTheTripTimezone() {
  // 2026-10-13 22:30 UTC = 2026-10-14 07:30 in Tokyo
  const late = new Date('2026-10-13T22:30:00Z');
  eq(dayKeyInZone(late, 'Asia/Tokyo'), '2026-10-14', 'Tokyo has already moved to the next day');
  eq(dayKeyInZone(late, 'Asia/Bangkok'), '2026-10-14', 'Bangkok is UTC+7');
  eq(dayKeyInZone(late, 'UTC'), '2026-10-13', 'UTC stays on the 13th');
  eq(dayKeyInZone(late, 'Not/AZone'), '2026-10-13', 'an unknown timezone falls back to UTC/local instead of throwing');
  eq(hourInZone(late, 'Asia/Tokyo'), 7, 'Tokyo hour');
  eq(hourInZone(new Date('2026-10-13T14:05:00Z'), 'Asia/Tokyo'), 23, 'hour wraps inside the day');
  assert(isDailySummaryId(dailySummaryId('2026-10-14')), 'daily summary ids are recognisable');
  assert(dailySummaryId('2026-10-14') === 'daily-2026-10-14', 'daily summary id is stable per day');
  assert(!isDailySummaryId('auto-xyz'), 'other notifications are not daily summaries');
}

/* ---------------------------------------------------------------- money */

export function testExpenseMoneyHelpers() {
  eq(expenseThb(EXPENSE), 2880, 'stored THB wins');
  eq(expenseShareInThb(EXPENSE, 'u1'), 1440, 'half of a two-way split');
  eq(expenseShareInThb(EXPENSE, 'nobody'), 0, 'people outside the bill owe nothing');
  const converted = { currency: 'JPY', netTotalMinor: 10000, allocations: [{ memberId: 'u1', amountMinor: 10000 }], thbRate: 0.25 };
  eq(expenseShareInThb(converted, 'u1'), 250000, 'without thbMinor the rate is used (satang)');
  eq(expenseThb({ thbMinor: 0, netTotalMinor: 0 }), 0, 'zero-safe');
  assert(amountText(123456, 'THB').includes('1,234'), 'amount text formats with separators');
}

/* ------------------------------------------------------- expense payload */

export function testExpenseNotificationPayload() {
  const payload = expenseNotificationPayload({
    tripId: 't1', expense: EXPENSE, authorId: 'u1', authorName: 'สมชาย', members: MEMBERS, lang: 'th'
  });
  assert(payload.type === 'expense', 'type');
  assert(/มื้อเย็นฟูจิ/.test(payload.title), 'the expense title is in the headline');
  assert(/สมชาย/.test(payload.body) && /¥/.test(payload.body), `the author and the amount are in the body (${payload.body})`);
  eq(payload.recipients, ['u2'], 'everybody but the author — inactive members are skipped');
  eq(payload.readBy, {}, 'nothing is read yet');
  assert(payload.link.endsWith('expenses/add?id=e1'), 'the link opens that exact expense');
  eq(payload.expenseId, 'e1', 'expense id kept for routing');
  eq(payload.date, '2026-10-13', 'the trip day of the expense');
  const en = expenseNotificationPayload({ tripId: 't1', expense: EXPENSE, authorId: 'u2', members: MEMBERS, lang: 'en' });
  assert(/Expense recorded/.test(en.title), 'english wording');
  const anonymous = expenseNotificationPayload({ tripId: 't1', expense: EXPENSE, members: MEMBERS, lang: 'th' });
  assert(/เพื่อนในทริป/.test(anonymous.body), 'no author name → neutral wording');
  eq(anonymous.recipients, ['u1', 'u2'], 'no author id → everybody with an account');
  assert(expenseNotificationPayload({ tripId: 't1', expense: null }) === null, 'no expense → no payload');
}

/* -------------------------------------------------------- daily summary */

export function testDailySummary() {
  const day = '2026-10-13';
  const expenses = [
    { ...EXPENSE, id: 'e1', date: day, category: 'food', thbMinor: 2880 },
    { id: 'e2', date: day, title: 'รถบัส', category: 'transport', currency: 'THB', netTotalMinor: 5000, thbMinor: 5000,
      allocations: [{ memberId: 'u1', amountMinor: 3000 }, { memberId: 'u2', amountMinor: 2000 }] },
    { id: 'e3', date: '2026-10-12', title: 'เมื่อวาน', category: 'food', currency: 'THB', netTotalMinor: 9999, thbMinor: 9999,
      allocations: [{ memberId: 'u1', amountMinor: 9999 }] },
    { id: 'e4', date: day, title: 'ยกเลิก', status: 'voided', currency: 'THB', netTotalMinor: 777, thbMinor: 777, allocations: [] }
  ];
  const sum = dailySummary({ expenses, members: MEMBERS, day, trip: { id: 't1' }, myId: 'u2', lang: 'th' });
  eq(sum.count, 2, 'voided rows and other days are excluded');
  eq(sum.totalThbMinor, 7880, 'the day total adds up (THB)');
  eq(sum.myShareThbMinor, 1440 + 2000, 'my share covers both bills (satang)');
  assert(/78\.80/.test(sum.body), `the body carries the day total (${sum.body})`);
  assert(/ส่วนของคุณ/.test(sum.body), 'the body carries my share');
  eq(sum.topCategory.category, 'transport', 'the biggest category of the day');
  eq(sum.memberTotals.map(m => m.memberId), ['u1', 'u2'], 'members sorted by what they owe/share (biggest first)');
  eq(sum.link, '#/trip/t1/expenses', 'the summary opens the expense list');
  eq(sum.readBy, {}, 'fresh summary is unread');
  assert(dailySummaryMemberLine({ name: 'นุ่น', amountThbMinor: 2500 }, 'th').includes('นุ่น'), 'receipt line');
  assert(dailySummary({ expenses: [], members: MEMBERS, day, myId: 'u1' }) === null, 'a day without spending stays quiet');
  assert(dailySummary({ expenses: [{ ...EXPENSE, status: 'voided' }], members: MEMBERS, day, myId: 'u1' }) === null,
    'voided-only day stays quiet');
  const en = dailySummary({ expenses, members: MEMBERS, day, myId: '', lang: 'en' });
  assert(/The trip spent/.test(en.body), 'english wording');
  assert(!/Your share/.test(en.body), 'no share line for a viewer without a member id');
}

/* --------------------------------------------------------------- prefs */

export function testPrefs() {
  const fresh = normalizePrefs({});
  eq(fresh, NOTIFY_PREFS_DEFAULTS, 'missing prefs fall back to the defaults');
  const custom = normalizePrefs({ enabled: false, expense: false, summaryHour: 99, hidden: ['a', 'a', 3] });
  assert(custom.enabled === false && custom.expense === false, 'booleans are kept');
  assert(custom.summaryHour === 23, 'the summary hour is clamped');
  eq(custom.hidden, ['a'], 'hidden ids are filtered to strings');
  eq(normalizePrefs({ summaryHour: 'x' }).summaryHour, 20, 'garbage hour falls back to 20');
  assert(!allowsType({ enabled: false }, 'expense'), 'the master switch wins');
  assert(!allowsType({ expense: false }, 'expense'), 'per-type switch');
  assert(allowsType({ dailySummary: false }, 'expense'), 'other types are unaffected');
  assert(allowsType({ member: false }, 'test'), 'test pings always show');
  assert(!allowsType({}, 'nope') === false, 'system types default to visible');
}

/* ----------------------------------------------------------------- list */

export function testBellListMaths() {
  const list = [
    { id: 'a', type: 'expense', date: '2026-10-13', createdAt: { seconds: 1000 }, readBy: {} },
    { id: 'b', type: 'daily_summary', date: '2026-10-13', createdAt: { seconds: 2000 }, readBy: { u1: true } },
    { id: 'c', type: 'settlement', date: '2026-10-12', createdAt: { seconds: 3000 }, readBy: {} }
  ];
  eq(sortNotifications(list).map(n => n.id), ['c', 'b', 'a'], 'newest first');
  assert(isReadBy(list[1], 'u1') && !isReadBy(list[1], 'u2'), 'read state is per account');
  eq(unreadCount(list, 'u1'), 2, 'two unread for u1');
  eq(unreadCount(list, 'u2'), 3, 'three unread for u2');
  eq(unreadFor(list, 'u1').map(n => n.id).sort(), ['a', 'c'], 'unread list');
  const prefs = normalizePrefs({ dailySummary: false });
  eq(visibleNotifications(list, 'u1', prefs).map(n => n.id), ['c', 'a'], 'the daily summary is hidden by the preference');
  eq(visibleNotifications(list, 'u1', normalizePrefs({ hidden: ['a'] })).map(n => n.id), ['c', 'b'], 'dismissed ids stay gone');
  eq(filterNotifications(list, 'settlement').map(n => n.id), ['c'], 'type filter');
  eq(filterNotifications(list, null).length, 3, 'no filter → everything');
  eq(notificationDayGroup(list[0], { today: '2026-10-13', yesterday: '2026-10-12' }), 'today', 'today bucket');
  eq(notificationDayGroup(list[2], { today: '2026-10-13', yesterday: '2026-10-12' }), 'yesterday', 'yesterday bucket');
  eq(notificationDayGroup({ date: '2026-09-01' }, { today: '2026-10-13', yesterday: '2026-10-12' }), 'earlier', 'older bucket');
  const groups = groupNotifications(list, { today: '2026-10-13', yesterday: '2026-10-12', lang: 'th' });
  eq(groups.map(g => g.key), ['today', 'yesterday'], 'empty buckets are dropped');
  eq(groups[0].label, 'วันนี้', 'Thai bucket label');
  eq(groups[0].items.map(n => n.id), ['b', 'a'], 'items stay newest-first inside the bucket');
}

export function testRelativeTime() {
  const now = Date.UTC(2026, 9, 13, 12, 0, 0);
  assert(relativeTime(now - 30 * 1000, 'th', now) === 'เมื่อสักครู่', 'just now');
  assert(/2 นาที/.test(relativeTime(now - 2 * 60000, 'th', now)), 'minutes');
  assert(/3 ชม/.test(relativeTime(now - 3 * 3600000, 'th', now)), 'hours');
  assert(/2 วัน/.test(relativeTime(now - 2 * 86400000, 'th', now)), 'days');
  assert(/2026-09-01/.test(relativeTime(Date.UTC(2026, 8, 1), 'th', now)), 'far in the past shows a date');
  assert(relativeTime(null, 'th', now) === '', 'missing timestamp is empty, not “Invalid Date”');
  assert(/min ago/.test(relativeTime(now - 120000, 'en', now)), 'english wording');
}

export function testShouldWriteDailySummary() {
  const at = (iso) => new Date(iso);
  assert(!shouldWriteDailySummary({ now: at('2026-10-13T10:00:00Z'), timeZone: 'Asia/Bangkok', summaryHour: 20 }),
    'before the hour → nothing');
  assert(shouldWriteDailySummary({ now: at('2026-10-13T14:00:00Z'), timeZone: 'Asia/Bangkok', summaryHour: 20 }),
    '21:00 Bangkok → write it');
  assert(!shouldWriteDailySummary({ now: at('2026-10-13T14:00:00Z'), timeZone: 'Asia/Bangkok', summaryHour: 20, existingDay: '2026-10-13' }),
    'already written today → nothing');
  assert(shouldWriteDailySummary({ now: at('2026-10-13T14:00:00Z'), timeZone: 'Asia/Bangkok', summaryHour: 20, existingDay: '2026-10-12' }),
    'yesterday’s summary does not block today');
  assert(!shouldWriteDailySummary({ now: at('2026-10-13T14:00:00Z'), timeZone: 'Asia/Bangkok', summaryHour: 20, hasSpending: false }),
    'a day without spending stays quiet');
}

/* ------------------------------------------------- security rules text */

export function testRulesProtectNotificationsAndPermissions() {
  const rules = fs.readFileSync(path.resolve(import.meta.dirname, '../../firestore.rules'), 'utf8');
  const compact = rules.replace(/\s+/g, ' ');
  const has = (re, label) => assert(re.test(compact), label);

  // notifications
  has(/match \/notifications\/\{notificationId\} \{/, 'notifications collection exists');
  has(/allow read: if isTripMember\(tripId\); allow create: if isTripMember\(tripId\)/, 'members read + create notifications');
  has(/createdBy == request\.auth\.uid/, 'a notification is signed by its author');
  has(/affectedKeys\(\)\.hasOnly\(\['readBy'\]\)/, 'only readBy may be updated');
  has(/addedKeys\(\)\.hasOnly\(\[request\.auth\.uid\]\)/, 'a member may only mark their own read state');
  has(/allow delete: if isTripAdmin\(tripId\);/, 'only admins delete notifications');

  // web-push device data stays private
  has(/match \/pushTokens\/\{tokenId\} \{ allow read, write: if isAuthenticated\(\) && request\.auth\.uid == uid; \}/,
    'push tokens are owner-only');
  has(/match \/pushPrefs\/\{docId\} \{ allow read, write: if isAuthenticated\(\) && request\.auth\.uid == uid; \}/,
    'push preferences are owner-only');

  // permission flags are enforced (v30)
  has(/function canEditExpense\(tripId\)/, 'canEditExpense helper');
  has(/function canEditItinerary\(tripId\)/, 'canEditItinerary helper');
  has(/match \/expenses\/\{expenseId\} \{ allow read: if isTripMember\(tripId\); allow create, update, delete: if canEditExpense\(tripId\);/,
    'expenses follow แก้ไขค่าใช้จ่าย');
  has(/match \/itineraryItems\/\{itemId\} \{ allow read: if isTripMember\(tripId\); allow create, update, delete: if canEditItinerary\(tripId\);/,
    'the plan follows แก้ไขแผนการเดินทาง');
  has(/memberRole\(tripId\) != 'viewer'/, 'the viewer role is read-only');
  has(/memberSelfUpdateOnlyProfile/, 'a member may not escalate their own permissions');
  has(/request\.resource\.data\.get\('permissions', \{\}\) == resource\.data\.get\('permissions', \{\}\)/,
    'permissions can only be changed by an admin');
  has(/canManageMembers\(tripId\)/, 'co-admins (จัดการสมาชิก) are honoured');
  has(/function protectsAdminDoc/, 'only a trip admin may touch another admin');
  has(/request\.resource\.data\.get\('inviteCode', ''\) == resource\.data\.get\('inviteCode', ''\)/,
    'rotating the invite code stays admin-only');
  assert(!/match \/loginAccounts\/[\s\S]{0,80}allow read, write: if isAuthenticated/.test(compact),
    'loginAccounts is still unreadable by clients');
}
