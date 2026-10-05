// ─────────────────────────────────────────────────────────────────────────────
// Sharing — invite links, LINE share, printable plan links and copy-ready
// summaries (Wanderlog’s “collaborate with friends in real time”).
//
// The trip itself already syncs live through Firestore; what was missing is an
// easy way to *get people in*: a deep link that pre-fills the invite code, a
// LINE message, a copy of the summary and a print/PDF view of the plan.
// Pure string builders — no DOM, no Firestore.
// ─────────────────────────────────────────────────────────────────────────────

const APP_PATH_FALLBACK = '/';

/** Base URL of the deployed app (works on GitHub Pages sub-paths too). */
export function appBaseUrl(location_ = typeof location !== 'undefined' ? location : null) {
  if (!location_) return APP_PATH_FALLBACK;
  const path = String(location_.pathname || '/');
  // index.html → keep the folder; hash routes → keep the folder as well
  const dir = path.endsWith('/') ? path : path.replace(/[^/]*$/, '');
  return `${location_.origin}${dir || '/'}`;
}

/** `#/trips?invite=ABC123` — the trip list opens with the code pre-filled. */
export function inviteLink(inviteCode = '', location_ = typeof location !== 'undefined' ? location : null) {
  const code = String(inviteCode || '').trim().toUpperCase();
  if (!code) return appBaseUrl(location_);
  return `${appBaseUrl(location_)}#/trips?invite=${encodeURIComponent(code)}`;
}

/** Deep link straight into one menu of a trip (share a single screen). */
export function tripLink(tripId = '', route = 'dashboard', location_ = typeof location !== 'undefined' ? location : null) {
  if (!tripId) return appBaseUrl(location_);
  const clean = String(route || 'dashboard').replace(/^\/+/, '');
  return `${appBaseUrl(location_)}#/trip/${tripId}/${clean}`;
}

/** Pretty invite code for messages: `ABC-123`. */
export function formatCode(code = '') {
  const raw = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (raw.length === 6) return `${raw.slice(0, 3)}-${raw.slice(3)}`;
  return raw;
}

/**
 * LINE share message for the invite.
 * @param {{trip?:object, inviteCode?:string, inviter?:string, lang?:string, location?:object}} opts
 */
export function inviteMessage({ trip = {}, inviteCode = '', inviter = '', lang = 'th', location: loc = (typeof location !== 'undefined' ? location : null) } = {}) {
  const name = trip?.name || (lang === 'th' ? 'ทริปของเรา' : 'Our trip');
  const when = trip?.startDate && trip?.endDate ? `${trip.startDate} → ${trip.endDate}` : '';
  const where = [trip?.city, trip?.country].filter(Boolean).join(', ');
  const link = inviteLink(inviteCode, loc);
  if (lang === 'th') {
    return [
      `🧳 ชวนเข้าทริป “${name}”`,
      where ? `📍 ${where}` : '',
      when ? `🗓 ${when}` : '',
      inviter ? `👤 โดย ${inviter}` : '',
      '',
      `รหัสเชิญ: ${formatCode(inviteCode)}`,
      `เปิดแอป: ${link}`,
      '',
      'เข้าไปแล้วแชร์ค่าใช้จ่าย ดูแผน และโหวตที่เที่ยวด้วยกันได้เลย'
    ].filter(Boolean).join('\n');
  }
  return [
    `🧳 Join our trip “${name}”`,
    where ? `📍 ${where}` : '',
    when ? `🗓 ${when}` : '',
    inviter ? `👤 from ${inviter}` : '',
    '',
    `Invite code: ${formatCode(inviteCode)}`,
    `Open the app: ${link}`,
    '',
    'Plan together, split costs and vote on places.'
  ].filter(Boolean).join('\n');
}

/** LINE share URL (works on mobile; desktop LINE shows a QR). */
export function lineShareUrl(text = '') {
  return `https://line.me/R/msg/text/?${encodeURIComponent(String(text || ''))}`;
}

/** WhatsApp / Telegram / mail fallbacks. */
export function whatsappShareUrl(text = '') {
  return `https://wa.me/?text=${encodeURIComponent(String(text || ''))}`;
}
export function telegramShareUrl(text = '', url = '') {
  const params = new URLSearchParams();
  if (url) params.set('url', url);
  if (text) params.set('text', text);
  return `https://t.me/share/url?${params.toString()}`;
}

/**
 * Short summary of the trip — copied to the clipboard or pasted into a chat.
 * @param {{trip?:object, members?:Array, items?:Array, expenses?:Array, totalMinor?:number,
 *          currency?:string, lang?:string}} opts
 */
export function tripSummaryText({ trip = {}, members = [], items = [], expenses = [], totalMinor = 0, currency = 'THB', lang = 'th' } = {}) {
  const name = trip?.name || (lang === 'th' ? 'ทริปของเรา' : 'Our trip');
  const where = [trip?.city, trip?.country].filter(Boolean).join(', ');
  const days = new Set(items.map(i => i?.date).filter(Boolean)).size;
  const paid = Number(totalMinor) || 0;
  if (lang === 'th') {
    return [
      `🧳 ${name}`,
      where ? `📍 ${where}` : '',
      trip?.startDate ? `🗓 ${trip.startDate} → ${trip.endDate || ''}` : '',
      `👥 สมาชิก ${members.length} คน`,
      `🗺 จุดหมาย ${items.length} แห่ง${days ? ` (${days} วัน)` : ''}`,
      `💸 ค่าใช้จ่ายรวม ${(paid / 100).toLocaleString('th-TH', { maximumFractionDigits: 2 })} ${currency}`,
      expenses.length ? `🧾 รายการล่าสุด: ${expenses.slice(0, 3).map(e => e?.title).filter(Boolean).join(', ')}` : ''
    ].filter(Boolean).join('\n');
  }
  return [
    `🧳 ${name}`,
    where ? `📍 ${where}` : '',
    trip?.startDate ? `🗓 ${trip.startDate} → ${trip.endDate || ''}` : '',
    `👥 ${members.length} members`,
    `🗺 ${items.length} places${days ? ` over ${days} days` : ''}`,
    `💸 Total ${(paid / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })} ${currency}`,
    expenses.length ? `🧾 Latest: ${expenses.slice(0, 3).map(e => e?.title).filter(Boolean).join(', ')}` : ''
  ].filter(Boolean).join('\n');
}

/**
 * Plain-text day-by-day plan (paste into LINE, a note app or a print dialog).
 */
export function itineraryText({ trip = {}, items = [], lang = 'th' } = {}) {
  const byDate = new Map();
  for (const item of items) {
    const key = String(item?.date || '');
    if (!key) continue;
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key).push(item);
  }
  const dates = [...byDate.keys()].sort();
  const lines = [`🧳 ${trip?.name || ''}`.trim()];
  if (trip?.startDate) lines.push(`${trip.startDate} → ${trip.endDate || ''}`);
  lines.push('');
  dates.forEach((date, idx) => {
    lines.push(`${lang === 'th' ? 'วันที่' : 'Day'} ${idx + 1} • ${date}`);
    const dayItems = byDate.get(date).slice().sort((a, b) => String(a?.startAt || '').localeCompare(String(b?.startAt || '')));
    dayItems.forEach(item => {
      const time = String(item?.startAt || '').slice(11, 16);
      lines.push(`  ${time ? `${time} ` : '• '}${item?.title || ''}${item?.address ? ` — ${item.address}` : ''}`);
    });
    lines.push('');
  });
  return lines.join('\n').trim();
}

/** Where the print/PDF view should point (the browser handles the rest). */
export function printPlanUrl(tripId = '', location_ = typeof location !== 'undefined' ? location : null) {
  return `${tripLink(tripId, 'itinerary', location_)}?print=1`;
}

export const SHARE_TARGETS = [
  { id: 'copy', icon: 'link', th: 'คัดลอกลิงก์เชิญ', en: 'Copy invite link' },
  { id: 'line', icon: 'message-circle', th: 'แชร์ผ่าน LINE', en: 'Share on LINE' },
  { id: 'code', icon: 'key-round', th: 'คัดลอกรหัสเชิญ', en: 'Copy invite code' },
  { id: 'summary', icon: 'clipboard-list', th: 'คัดลอกสรุปทริป', en: 'Copy trip summary' },
  { id: 'plan', icon: 'file-text', th: 'คัดลอกแผนรายวัน', en: 'Copy day-by-day plan' },
  { id: 'print', icon: 'printer', th: 'พิมพ์ / บันทึก PDF', en: 'Print / save as PDF' }
];
