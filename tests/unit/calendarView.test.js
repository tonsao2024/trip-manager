// Unit tests — calendar month grid (v17 “ปฏิทินทริป”).
import {
  addDaysISO, parseISODate, isoOf, monthLabel, monthShort, daysInMonth, firstWeekday,
  shiftMonth, buildMonthGrid, defaultMonthFor, tripMonths, itemsForDay, calendarSummary,
  WEEKDAYS_TH, WEEKDAYS_EN
} from '../../src/js/utils/calendarView.js';

function assert(cond, msg) { if (!cond) throw new Error(msg); }

export function testDateMaths() {
  assert(addDaysISO('2026-04-12', 1) === '2026-04-13', 'add one day');
  assert(addDaysISO('2026-04-30', 1) === '2026-05-01', 'month rollover');
  assert(addDaysISO('2026-12-31', 1) === '2027-01-01', 'year rollover');
  assert(addDaysISO('2026-03-01', -1) === '2026-02-28', 'going back over February');
  assert(addDaysISO('2024-03-01', -1) === '2024-02-29', 'leap year');
  assert(addDaysISO('', 1) === '', 'invalid input → empty');
  assert(daysInMonth(2026, 2) === 28 && daysInMonth(2024, 2) === 29, 'February lengths');
  assert(daysInMonth(2026, 4) === 30, 'April');
  assert(firstWeekday(2026, 4) === 3, '1 Apr 2026 is a Wednesday');
  assert(shiftMonth(2026, 1, -1).year === 2025 && shiftMonth(2026, 1, -1).month === 12, 'back over new year');
  assert(shiftMonth(2026, 12, 1).month === 1 && shiftMonth(2026, 12, 1).year === 2027, 'forward over new year');
  assert(shiftMonth(2026, 6, 12).month === 6 && shiftMonth(2026, 6, 12).year === 2027, 'a year ahead');
  assert(isoOf(2026, 4, 5) === '2026-04-05', 'iso padding');
  assert(parseISODate('2026-04-05').day === 5, 'parse');
  assert(monthShort(4, 'th') === 'เม.ย.' && monthShort(4, 'en') === 'Apr', 'month labels');
  assert(monthLabel(2026, 4, 'th').includes('2026') && monthLabel(2026, 4, 'en').startsWith('April'), 'month heading');
}

export function testMonthGrid() {
  const trip = { startDate: '2026-04-12', endDate: '2026-04-18' };
  const items = [
    { date: '2026-04-12', title: 'บินถึงโตเกียว', category: 'transport' },
    { date: '2026-04-12', title: 'เช็คอินโรงแรม', category: 'stay' },
    { date: '2026-04-13', title: 'วัดเซ็นโซจิ', category: 'sightseeing' },
    { date: '2026-04-20', title: 'นอกช่วงทริป', category: 'general' },
    { date: '', title: 'ไม่มีวันที่' }
  ];
  const grid = buildMonthGrid(2026, 4, { trip, items, today: '2026-04-12', lang: 'th' });
  assert(grid.weeks.length === 6, 'always 6 weeks');
  assert(grid.weeks.every(w => w.length === 7), 'always 7 columns');
  assert(grid.label.includes('เมษายน'), 'Thai month label');
  const days = grid.weeks.flat();
  assert(days.length === 42, '42 cells');
  const firstOfMonth = days.find(c => c.inMonth && c.day === 1);
  assert(firstOfMonth.iso === '2026-04-01', 'the 1st is in the grid');
  const start = days.find(c => c.iso === '2026-04-12');
  assert(start.inTrip && start.isToday && start.count === 2, 'trip start = today, 2 items');
  assert(start.pills.length === 2 && start.pills[0].title === 'บินถึงโตเกียว', 'pills carry titles');
  assert(days.find(c => c.iso === '2026-04-18').isLastTripDay, 'last trip day flagged');
  assert(!days.find(c => c.iso === '2026-04-20').inTrip, 'items outside the trip window are not marked');
  assert(days.find(c => c.iso === '2026-04-20').count === 1, '…but the item still shows on the calendar');
  assert(grid.tripDays === 7, `7 trip days inside April (got ${grid.tripDays})`);
  assert(grid.plannedDays === 2, 'two planned days');
  assert(grid.weekdays === WEEKDAYS_TH, 'Thai weekday row');
  const en = buildMonthGrid(2026, 4, { lang: 'en' });
  assert(en.weekdays === WEEKDAYS_EN, 'English weekday row');
  const noTrip = buildMonthGrid(2026, 4, {});
  assert(noTrip.tripDays === 0 && noTrip.plannedDays === 0, 'no trip → no trip days');
}

export function testCellLayout() {
  const items = Array.from({ length: 5 }, (_, i) => ({ date: '2026-04-15', title: `item ${i}` }));
  const grid = buildMonthGrid(2026, 4, { items, maxPills: 3 });
  const cell = grid.weeks.flat().find(c => c.iso === '2026-04-15');
  assert(cell.pills.length === 3, 'only maxPills pills');
  assert(cell.extra === 2, '+N more counter');
  assert(cell.count === 5, 'the real count is kept');
}

export function testDefaultMonthAndTripMonths() {
  const trip = { startDate: '2026-04-28', endDate: '2026-05-03' };
  assert(defaultMonthFor(trip).year === 2026 && defaultMonthFor(trip).month === 4, 'opens on the trip month');
  assert(defaultMonthFor(null, '2026-07-09').month === 7, 'falls back to today');
  const months = tripMonths(trip);
  assert(months.length === 2, 'a trip spanning two months lists both');
  assert(months[0].month === 4 && months[1].month === 5, 'in order');
  assert(tripMonths({ startDate: '2026-04-01', endDate: '2026-04-30' }).length === 1, 'single-month trip');
  assert(tripMonths({}).length === 0, 'no dates → no months');
}

export function testItemsForDay() {
  const items = [
    { date: '2026-04-12', title: 'late', startAt: '2026-04-12T18:00:00.000Z' },
    { date: '2026-04-12', title: 'early', startAt: '2026-04-12T08:00:00.000Z' },
    { date: '2026-04-12', title: 'untimed', order: 1 },
    { date: '2026-04-13', title: 'other day' }
  ];
  const day = itemsForDay(items, '2026-04-12');
  assert(day.length === 3, 'only that day');
  assert(day[0].title === 'early' && day[1].title === 'late', 'sorted by time');
  assert(day[2].title === 'untimed', 'untimed items go last');
  assert(itemsForDay(items, '2026-01-01').length === 0, 'empty day');
}

export function testCalendarSummary() {
  const trip = { startDate: '2026-04-12', endDate: '2026-04-18' };
  const summary = calendarSummary(trip, [{}, {}, {}]);
  assert(summary.days === 7, 'inclusive day count');
  assert(summary.stops === 3, 'stop count');
  assert(calendarSummary({}, []).days === 0, 'no dates → 0 days');
  assert(calendarSummary({ startDate: '2026-04-12', endDate: '2026-04-12' }, []).days === 1, 'one-day trip');
}
