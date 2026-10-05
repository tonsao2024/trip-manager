// Unit tests for Smart Scheduling - run with node --test or in browser console
import { recalculateSchedule, detectOverlaps, calculateEndAt, calculateNextStart } from '../../src/js/utils/scheduling.js';
import { dayjs } from '../../src/js/utils/date.js';

function assert(cond, msg) { if (!cond) throw new Error(msg); }

export function testScheduling() {
  console.log('Testing scheduling...');

  const base = new Date('2027-01-17T09:00:00');
  const items = [
    { id: '1', order: 0, startAt: base, durationMinutes: 60, travelToNextMinutes: 15 },
    { id: '2', order: 1, startAt: new Date('2027-01-17T10:15:00'), durationMinutes: 30, travelToNextMinutes: 10 },
    { id: '3', order: 2, startAt: new Date('2027-01-17T10:55:00'), durationMinutes: 45, travelToNextMinutes: 0 }
  ];

  // Change duration of first item
  const recalc = recalculateSchedule(items, '1', { newDuration: 90 });
  assert(recalc[0].durationMinutes === 90, 'Duration should update');
  assert(dayjs(recalc[1].startAt).isSame(dayjs(base).add(90+15, 'minute')), 'Next start should shift');
  console.log('✓ recalculateSchedule duration change');

  // Detect overlap
  const overlapping = [
    { id: 'a', startAt: new Date('2027-01-17T09:00'), endAt: new Date('2027-01-17T10:00') },
    { id: 'b', startAt: new Date('2027-01-17T09:30'), endAt: new Date('2027-01-17T10:30') }
  ];
  const overlaps = detectOverlaps(overlapping);
  assert(overlaps.length === 1, 'Should detect overlap');
  console.log('✓ detectOverlaps');

  // EndAt calculation
  const end = calculateEndAt(base, 60);
  assert(dayjs(end).isSame(dayjs(base).add(60, 'minute')), 'EndAt calc');
  console.log('✓ calculateEndAt');

  // A day that starts with an untimed stop must not fail the reorder
  // (the route optimiser + drag-and-drop both reorder such days).
  const untimed = [
    { id: 'u1', order: 0, startAt: null, durationMinutes: 45, travelToNextMinutes: 15 },
    { id: 'u2', order: 1, startAt: new Date('2027-01-17T10:00:00'), durationMinutes: 30 },
    { id: 'u3', order: 2, startAt: new Date('2027-01-17T11:30:00'), durationMinutes: 20 }
  ];
  const r2 = recalculateSchedule(untimed, 'u2', {});
  assert(!r2[0].startAt, 'the untimed first stop stays untimed');
  assert(dayjs(r2[1].startAt).isSame(dayjs('2027-01-17T10:00:00')), 'each later stop keeps the time the user typed');
  assert(dayjs(r2[1].endAt).isSame(dayjs('2027-01-17T10:30:00')), 'its endAt is still calculated');
  assert(dayjs(r2[2].startAt).isSame(dayjs('2027-01-17T10:30:00')), 'later stops chain from the first known time (10:00 + 30 min)');
  console.log('✓ untimed first stop no longer throws');

  // A timed day keeps chaining exactly as before, untimed stops included.
  const mixed = [
    { id: 'm1', order: 0, startAt: base, durationMinutes: 60, travelToNextMinutes: 15 },
    { id: 'm2', order: 1, startAt: null, durationMinutes: 0, travelToNextMinutes: 10 },
    { id: 'm3', order: 2, startAt: new Date('2027-01-17T12:00:00'), durationMinutes: 30 }
  ];
  const r3 = recalculateSchedule(mixed, 'm1', { newDuration: 90 });
  assert(dayjs(r3[1].startAt).isSame(dayjs(base).add(105, 'minute')), 'an untimed stop is scheduled right after the previous one');
  assert(dayjs(r3[2].startAt).isSame(dayjs(base).add(115, 'minute')), 'chaining continues through it');
  console.log('✓ chaining still works on timed days');

  console.log('All scheduling tests passed');
}

if (typeof window !== 'undefined') window.testScheduling = testScheduling;
