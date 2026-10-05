// Unit tests — calendar (.ics) export.
import {
  escapeIcsText, foldIcsLine, icsDate, icsAllDay, buildEvent, buildIcs,
  itineraryToEvents, reservationsToEvents
} from '../../src/js/utils/ics.js';

function assert(cond, msg) { if (!cond) throw new Error(msg); }

export function testEscaping() {
  assert(escapeIcsText('a,b;c\\d') === 'a\\,b\\;c\\\\d', 'commas, semicolons and backslashes are escaped');
  assert(escapeIcsText('line1\nline2') === 'line1\\nline2', 'newlines become \\n');
}

export function testFolding() {
  const long = 'X'.repeat(200);
  const folded = foldIcsLine(long);
  const lines = folded.split('\r\n');
  assert(lines.length >= 3, 'long lines are folded');
  assert(lines.every(l => l.length <= 74), 'no folded line exceeds 74 chars');
  assert(folded.replace(/\r\n /g, '') === long, 'unfolding restores the original value');
  assert(foldIcsLine('short') === 'short', 'short lines untouched');
}

export function testDates() {
  assert(icsDate('2026-03-28', '08:15') === '20260328T081500', 'local date-time stamp');
  assert(icsDate('2026-03-28') === '20260328T000000', 'missing time → midnight');
  assert(icsAllDay('2026-03-28') === '20260328', 'all-day value');
  assert(icsDate('nope') === '', 'invalid date → empty');
}

export function testBuildEvent() {
  const timed = buildEvent({
    uid: 'e1', title: 'วัดเซ็นโซจิ', start: { date: '2026-03-28', time: '09:00' },
    end: { date: '2026-03-28', time: '11:00' }, location: 'Asakusa'
  });
  assert(timed.includes('BEGIN:VEVENT') && timed.includes('END:VEVENT'), 'event envelope');
  assert(timed.includes('DTSTART:20260328T090000'), 'start written');
  assert(timed.includes('DTEND:20260328T110000'), 'end written');
  assert(timed.includes('LOCATION:Asakusa'), 'location written');

  const noEnd = buildEvent({ title: 'X', start: { date: '2026-03-28', time: '09:30' } });
  assert(noEnd.includes('DTEND:20260328T103000'), 'defaults to a one-hour block');

  const allDay = buildEvent({ title: 'X', start: { date: '2026-03-28' }, allDay: true });
  assert(allDay.includes('DTSTART;VALUE=DATE:20260328'), 'all-day events use VALUE=DATE');
}

export function testBuildCalendar() {
  const ics = buildIcs([
    { uid: 'a', title: 'One', start: { date: '2026-03-28', time: '09:00' } },
    { uid: 'b', title: 'Two', start: { date: '2026-03-29' }, allDay: true }
  ], { calendarName: 'ทริปญี่ปุ่น' });
  assert(ics.startsWith('BEGIN:VCALENDAR\r\n'), 'calendar starts correctly');
  assert(ics.trimEnd().endsWith('END:VCALENDAR'), 'calendar ends correctly');
  assert((ics.match(/BEGIN:VEVENT/g) || []).length === 2, 'two events');
  assert(ics.includes('X-WR-CALNAME:ทริปญี่ปุ่น'), 'calendar name kept');
  assert(ics.includes('\r\n'), 'CRLF line endings (RFC 5545)');
  assert(ics.includes('PRODID:-//Fuji Trip Planner'), 'product id set');
}

export function testItineraryEvents() {
  const events = itineraryToEvents([
    { id: 'i1', title: 'ขึ้นเขา', date: '2026-03-28', startAt: '07:30', durationMinutes: 120, address: 'Fuji', estimatedCostMinor: 5000, currency: 'JPY' },
    { id: 'i2', title: 'ไม่มีวัน', date: '' }
  ]);
  assert(events.length === 1, 'items without a date are skipped');
  assert(events[0].start.time === '07:30' && events[0].end.time === '09:30', 'duration respected');
  assert(events[0].description.includes('Fuji'), 'address in the description');
  const allDay = itineraryToEvents([{ id: 'x', title: 'พักผ่อน', date: '2026-03-28' }])[0];
  assert(allDay.allDay === true, 'no start time → all-day event');
}

export function testReservationEvents() {
  const events = reservationsToEvents([
    { id: 'r1', type: 'flight', title: 'TG676', date: '2026-03-28', startTime: '08:15', endTime: '16:00', confirmation: 'ABC123', seat: '12A' }
  ]);
  assert(events.length === 1, 'one event');
  assert(events[0].title.includes('TG676'), 'title kept');
  assert(events[0].description.includes('ABC123') && events[0].description.includes('12A'), 'confirmation + seat in the note');
}

export function testIcs() {
  testEscaping();
  testFolding();
  testDates();
  testBuildEvent();
  testBuildCalendar();
  testItineraryEvents();
  testReservationEvents();
  console.log('All ICS tests passed');
}
