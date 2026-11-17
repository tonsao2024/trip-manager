// Unit tests — the day-schedule repair (continuous times, fixed flight/hotel anchors).
import {
  zonedDateTime, chainDaySchedule, anchorDayEnd, planTripSchedule, scheduleUpdates, DEFAULT_DAY_START
} from '../../src/js/itinerary/scheduleRepair.js';
import { dayjs } from '../../src/js/utils/date.js';

function assert(cond, msg) { if (!cond) throw new Error(msg); }
const hhmm = (date, tz = 'Asia/Tokyo') => dayjs(date).tz(tz).format('HH:mm');
const at = (date, time, tz = 'Asia/Tokyo') => zonedDateTime(date, time, tz).getTime();

export function testChainKeepsOrderAndChainsTimes() {
  const day = [
    { id: 'c', order: 3, startAt: new Date('2026-01-17T05:00:00Z'), durationMinutes: 30, travelToNextMinutes: 10 },
    { id: 'a', order: 1, startAt: new Date('2026-01-17T01:00:00Z'), durationMinutes: 60, travelToNextMinutes: 20 },
    { id: 'b', order: 2, startAt: new Date('2026-01-17T02:00:00Z'), durationMinutes: 45, travelToNextMinutes: 15 }
  ];
  const anchor = zonedDateTime('2026-01-17', '07:00', 'Asia/Tokyo');
  const out = chainDaySchedule(day, anchor);

  assert(out.map(i => i.id).join(',') === 'a,b,c', 'visit order is untouched');
  assert(+out[0].startAt === +anchor, 'the first stop starts at the day anchor');
  assert(+out[0].endAt === +anchor + 60 * 60000, 'its end is start + duration');
  assert(+out[1].startAt === +out[0].endAt + 20 * 60000, 'the next stop starts at end + travel');
  assert(+out[2].startAt === +out[1].endAt + 15 * 60000, 'the chain continues');
  assert(hhmm(out[0].startAt) === '07:00', 'first stop prints 07:00 in Tokyo');
}

export function testEverySightseeingDayStartsAt0700() {
  const items = [
    { id: 'a', date: '2026-01-18', order: 0, startAt: new Date('2026-01-18T03:00:00Z'), durationMinutes: 90, travelToNextMinutes: 15 },
    { id: 'b', date: '2026-01-18', order: 1, startAt: new Date('2026-01-18T04:00:00Z'), durationMinutes: 60, travelToNextMinutes: 0 },
    { id: 'c', date: '2026-01-19', order: 0, startAt: new Date('2026-01-19T03:00:00Z'), durationMinutes: 45, travelToNextMinutes: 0 }
  ];
  const days = planTripSchedule(items, { timezone: 'Asia/Tokyo' });
  assert(days.length === 2, 'two days are planned');
  for (const day of days) {
    assert(hhmm(day.items[0].startAt) === DEFAULT_DAY_START, `${day.date} starts at 07:00 (got ${hhmm(day.items[0].startAt)})`);
  }
  assert(+days[0].items[1].startAt === +days[0].items[0].endAt + 15 * 60000, 'the day stays continuous');
}

export function testFlightDaysUseTheFlightTime() {
  const items = [
    { id: 'f1', date: '2026-01-15', order: 0, durationMinutes: 110, travelToNextMinutes: 0 },
    { id: 'f2', date: '2026-01-16', order: 0, durationMinutes: 320, travelToNextMinutes: 20 },
    { id: 'temple', date: '2026-01-16', order: 1, durationMinutes: 60, travelToNextMinutes: 0 }
  ];
  const flight1 = zonedDateTime('2026-01-15', '20:50', 'Asia/Bangkok');
  const flight2 = zonedDateTime('2026-01-16', '00:25', 'Asia/Ho_Chi_Minh');
  const days = planTripSchedule(items, {
    timezone: 'Asia/Tokyo',
    startOverrides: { '2026-01-15': flight1, '2026-01-16': flight2 }
  });

  const d15 = days.find(d => d.date === '2026-01-15');
  assert(+d15.items[0].startAt === +flight1, 'the 15 Jan flight starts at 20:50 Bangkok');
  assert(hhmm(d15.items[0].startAt, 'Asia/Bangkok') === '20:50', '20:50 in Bangkok');
  assert(hhmm(d15.items[0].endAt, 'Asia/Bangkok') === '22:40', '22:40 in Bangkok');

  const d16 = days.find(d => d.date === '2026-01-16');
  assert(hhmm(d16.items[0].startAt, 'Asia/Ho_Chi_Minh') === '00:25', 'the connection leaves at 00:25 Vietnam time');
  assert(hhmm(d16.items[0].endAt, 'Asia/Tokyo') === '07:45', 'and lands at 07:45 Tokyo time');
  assert(hhmm(d16.items[1].startAt) === '08:05', 'the next stop follows at 07:45 + 20 min travel');
}

export function testHotelCheckinIsPinnedAt2100() {
  const items = [
    { id: 'a', date: '2026-01-22', order: 0, startAt: new Date('2026-01-22T01:00:00Z'), durationMinutes: 60, travelToNextMinutes: 15 },
    { id: 'b', date: '2026-01-22', order: 1, startAt: new Date('2026-01-22T02:00:00Z'), durationMinutes: 90, travelToNextMinutes: 0 },
    { id: 'hotel', date: '2026-01-22', order: 2, startAt: new Date('2026-01-22T03:00:00Z'), durationMinutes: 60, travelToNextMinutes: 0 }
  ];
  const checkin = zonedDateTime('2026-01-22', '21:00', 'Asia/Tokyo');
  const days = planTripSchedule(items, {
    timezone: 'Asia/Tokyo',
    endAnchors: { '2026-01-22': { at: checkin, match: i => i.id === 'hotel' } }
  });
  const day = days[0];
  assert(hhmm(day.items[0].startAt) === '07:00', 'the day still starts at 07:00');
  assert(hhmm(day.items[2].startAt) === '21:00', 'the check-in is pinned at 21:00');
  assert(+day.items[2].endAt === +checkin + 60 * 60000, 'check-in ends one hour later');
  assert(+day.items[1].startAt === +day.items[0].endAt + 15 * 60000, 'stops before the anchor stay chained');
}

export function testAnchoringIsIdempotent() {
  const items = [
    { id: 'a', date: '2026-01-20', order: 0, startAt: new Date('2026-01-20T00:00:00Z'), durationMinutes: 60, travelToNextMinutes: 10 },
    { id: 'b', date: '2026-01-20', order: 1, startAt: new Date('2026-01-20T01:00:00Z'), durationMinutes: 30, travelToNextMinutes: 0 },
    { id: 'h', date: '2026-01-22', order: 0, startAt: new Date('2026-01-22T00:00:00Z'), durationMinutes: 60, travelToNextMinutes: 0 }
  ];
  const opts = {
    timezone: 'Asia/Tokyo',
    endAnchors: { '2026-01-22': { at: zonedDateTime('2026-01-22', '21:00', 'Asia/Tokyo'), match: i => i.id === 'h' } }
  };
  const firstRun = planTripSchedule(items, opts);
  const once = scheduleUpdates(firstRun);
  const secondRun = planTripSchedule(firstRun.flatMap(d => d.items), opts);
  const twice = scheduleUpdates(secondRun);
  assert(once.length === twice.length, 'same number of stops');
  for (let i = 0; i < once.length; i++) {
    assert(+once[i].startAt === +twice[i].startAt && +once[i].endAt === +twice[i].endAt, 're-running keeps every time');
  }
}

export function testAnchorDayEndChainsAfterThePinnedStop() {
  const day = [
    { id: 'a', order: 0, startAt: at('2026-01-22', '07:00'), endAt: at('2026-01-22', '08:00'), durationMinutes: 60, travelToNextMinutes: 10 },
    { id: 'b', order: 1, startAt: at('2026-01-22', '08:10'), endAt: at('2026-01-22', '09:10'), durationMinutes: 60, travelToNextMinutes: 0 }
  ];
  const out = anchorDayEnd(day, { at: at('2026-01-22', '21:00'), match: i => i.id === 'a' });
  assert(+out[0].startAt === at('2026-01-22', '21:00'), 'the matched stop is pinned');
  assert(+out[1].startAt === +out[0].endAt + 10 * 60000, 'later stops follow the pinned one');
}

export function testTimezoneConstruction() {
  assert(+zonedDateTime('2026-01-16', '00:25', 'Asia/Ho_Chi_Minh') === Date.parse('2026-01-15T17:25:00Z'), 'Vietnam is UTC+7');
  assert(+zonedDateTime('2026-01-16', '07:45', 'Asia/Tokyo') === Date.parse('2026-01-15T22:45:00Z'), 'Tokyo is UTC+9');
  const minutes = (zonedDateTime('2026-01-16', '07:45', 'Asia/Tokyo') - zonedDateTime('2026-01-16', '00:25', 'Asia/Ho_Chi_Minh')) / 60000;
  assert(minutes === 320, `the connection takes 5h20m (got ${minutes})`);
}
