// Calendar export (.ics) — “ส่งออกปฏิทิน” so the plan/booking can be imported
// into Google Calendar, Apple Calendar or Outlook in one tap.
//
// Pure string building (RFC 5545 subset): no dependency, testable in Node.
//   const ics = buildIcs(events, { calendarName: 'ทริปญี่ปุ่น' })

const CRLF = '\r\n';

/** Escape a text value for ICS: backslash, comma, semicolon, newline. */
export function escapeIcsText(value = '') {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** Fold long lines at 74 chars (RFC 5545 §3.1) with a leading space. */
export function foldIcsLine(line = '') {
  const str = String(line);
  if (str.length <= 74) return str;
  const parts = [];
  let rest = str;
  parts.push(rest.slice(0, 74));
  rest = rest.slice(74);
  while (rest.length) {
    parts.push(' ' + rest.slice(0, 73));
    rest = rest.slice(73);
  }
  return parts.join(CRLF);
}

/** Local date + time → floating ICS timestamp `20260328T081500`. */
export function icsDate(dateStr, timeStr = '') {
  const m = String(dateStr || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return '';
  const [, y, mo, d] = m;
  const t = String(timeStr || '').match(/^(\d{1,2}):(\d{2})/);
  if (!t) return `${y}${mo}${d}T000000`;
  return `${y}${mo}${d}T${String(t[1]).padStart(2, '0')}${t[2]}00`;
}

/** All-day value `VALUE=DATE:20260328`. */
export function icsAllDay(dateStr) {
  const m = String(dateStr || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}${m[2]}${m[3]}` : '';
}

/**
 * One VEVENT. `start`/`end` are `{ date, time }`; when `end` is missing the
 * event becomes a 1-hour block (timed) or an all-day event (no time).
 */
export function buildEvent({ uid = '', title = '', description = '', location = '', start = {}, end = {}, url = '', allDay = false, stamp = '' } = {}) {
  const lines = ['BEGIN:VEVENT'];
  lines.push(`UID:${escapeIcsText(uid || `${Date.now()}-${Math.random().toString(36).slice(2)}@fuji-trip-planner`)}`);
  if (stamp) lines.push(`DTSTAMP:${stamp}`);
  if (allDay || !start.time) {
    lines.push(`DTSTART;VALUE=DATE:${icsAllDay(start.date)}`);
    if (end?.date) lines.push(`DTEND;VALUE=DATE:${icsAllDay(end.date)}`);
  } else {
    lines.push(`DTSTART:${icsDate(start.date, start.time)}`);
    lines.push(`DTEND:${icsDate(end?.date || start.date, end?.time || addHour(start.time))}`);
  }
  lines.push(`SUMMARY:${escapeIcsText(title)}`);
  if (description) lines.push(`DESCRIPTION:${escapeIcsText(description)}`);
  if (location) lines.push(`LOCATION:${escapeIcsText(location)}`);
  if (url) lines.push(`URL:${escapeIcsText(url)}`);
  lines.push('END:VEVENT');
  return lines.map(foldIcsLine).join(CRLF);
}

function addHour(time = '09:00') {
  const m = String(time).match(/^(\d{1,2}):(\d{2})/);
  if (!m) return '10:00';
  const h = (Number(m[1]) + 1) % 24;
  return `${String(h).padStart(2, '0')}:${m[2]}`;
}

/** Wrap events into a full calendar file. */
export function buildIcs(events = [], { calendarName = 'Trip', stamp = '' } = {}) {
  const dtstamp = stamp || new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const head = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Fuji Trip Planner//TH//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcsText(calendarName)}`
  ].map(foldIcsLine).join(CRLF);
  const body = events.map(e => buildEvent({ stamp: dtstamp, ...e })).join(CRLF);
  return [head, body, 'END:VCALENDAR'].filter(Boolean).join(CRLF) + CRLF;
}

/** Itinerary items → calendar events (day plan with start times when known). */
export function itineraryToEvents(items = [], { lang = 'th' } = {}) {
  return (items || [])
    .filter(i => i?.date)
    .map((item, index) => {
      const startTime = item.startAt
        || (item.startAtTimestamp?.toDate ? item.startAtTimestamp.toDate().toTimeString().slice(0, 5) : '');
      const start = { date: item.date, time: startTime };
      const end = item.durationMinutes
        ? { date: item.date, time: addMinutes(startTime || '09:00', item.durationMinutes) }
        : {};
      const description = [
        item.description || '',
        item.address || '',
        item.estimatedCostMinor ? (lang === 'th' ? `ค่าใช้จ่ายประมาณ ${(item.estimatedCostMinor / 100).toLocaleString('th-TH')} ${item.currency || 'THB'}` : `Estimated ${(item.estimatedCostMinor / 100).toLocaleString('en-US')} ${item.currency || 'THB'}`) : ''
      ].filter(Boolean).join('\n');
      return {
        uid: `itin-${item.id || index}@fuji-trip-planner`,
        title: `${item.startAt ? item.startAt + ' ' : ''}${item.title || ''}`.trim(),
        description,
        location: item.address || '',
        start,
        end,
        allDay: !startTime
      };
    });
}

/** Reservations → calendar events (flights/hotels keep their confirmation). */
export function reservationsToEvents(reservations = [], { lang = 'th' } = {}) {
  return (reservations || [])
    .filter(r => r?.date)
    .map((r, index) => {
      const type = r.type || 'other';
      const bits = [
        r.confirmation ? `${lang === 'th' ? 'รหัสยืนยัน' : 'Confirmation'}: ${r.confirmation}` : '',
        r.provider || '',
        r.seat ? `${lang === 'th' ? 'ที่นั่ง' : 'Seat'}: ${r.seat}` : '',
        r.room ? `${lang === 'th' ? 'ห้อง' : 'Room'}: ${r.room}` : '',
        r.phone || '',
        r.notes || ''
      ].filter(Boolean).join('\n');
      const start = { date: r.date, time: r.startTime || '' };
      const end = r.endTime ? { date: r.date, time: r.endTime } : {};
      return {
        uid: `res-${r.id || index}@fuji-trip-planner`,
        title: `[${type}] ${r.title || ''}`.trim(),
        description: bits,
        location: r.address || '',
        url: r.url || '',
        start,
        end,
        allDay: !r.startTime
      };
    });
}

function addMinutes(time = '09:00', minutes = 60) {
  const m = String(time).match(/^(\d{1,2}):(\d{2})/);
  if (!m || !minutes) return addHour(time);
  const total = Number(m[1]) * 60 + Number(m[2]) + Number(minutes);
  const h = Math.floor((total / 60) % 24);
  const mm = total % 60;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/** Trigger a browser download of an .ics file. */
export function downloadIcs(filename, content) {
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.ics') ? filename : `${filename}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
