import { computeCountdown, countdownHeadline, renderCountdownScene } from '../../src/js/components/countdown.js';

function assert(cond, msg) { if (!cond) throw new Error(msg); }

export function testCountdown() {
  console.log('Testing countdown animation logic...');

  const now = new Date('2027-01-01T00:00:00Z');
  const c = computeCountdown({ startDate: '2027-01-11', endDate: '2027-01-15', createdAt: '2026-12-01', now });
  assert(c.phase === 'before', 'Should be in the "before" phase');
  assert(c.days === 10, `Should be 10 days left, got ${c.days}`);
  const dateInTripZone = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Bangkok', day: '2-digit', month: '2-digit', year: 'numeric' }).format(c.startDate);
  assert(dateInTripZone === '11/01/2027', 'date-only trip dates retain their calendar day in the trip timezone');
  assert(c.progress > 0 && c.progress < 1, `Progress should be between 0 and 1, got ${c.progress}`);
  console.log('✓ computeCountdown (before trip)');

  // Closer date → higher progress (the runner moves towards Fuji)
  const near = computeCountdown({ startDate: '2027-01-02', endDate: '2027-01-05', createdAt: '2026-12-01', now });
  assert(near.progress > c.progress, 'Closer departure must yield higher progress');
  console.log('✓ progress increases as the date approaches');
  const createdNow = new Date('2027-01-01T00:00:00Z');
  const departure = new Date('2027-01-11T00:00:00Z');
  const start = computeCountdown({ startDate: departure, createdAt: createdNow, now: createdNow });
  const halfway = computeCountdown({ startDate: departure, createdAt: createdNow, now: new Date('2027-01-06T00:00:00Z') });
  assert(start.progress === 0 && halfway.progress === 0.5, 'progress uses the true creation-to-departure interval');
  const fallback = computeCountdown({ startDate: departure, now: createdNow });
  assert(fallback.planningStartDate.getTime() === departure.getTime() - 180 * 86400000, 'missing creation date uses a labelled 180-day window');
  const reached = computeCountdown({ startDate: departure, createdAt: createdNow, now: departure });
  assert(reached.progress === 1 && reached.phase === 'during', 'departure stays at the end of the countdown track');


  const during = computeCountdown({ startDate: '2026-12-30', endDate: '2027-01-05', now });
  assert(during.phase === 'during', 'Should be "during" the trip');
  assert(during.progress === 1, 'Progress must be 1 during the trip');
  console.log('✓ computeCountdown (during trip)');

  const after = computeCountdown({ startDate: '2026-11-01', endDate: '2026-11-05', now });
  assert(after.phase === 'after', 'Should be "after" the trip');
  assert(computeCountdown({ startDate: '2026-11-01', now }).phase === 'after', 'a one-day trip without an end date finishes after its start day');
  console.log('✓ computeCountdown (after trip)');

  const none = computeCountdown({ now });
  assert(none.startDate === null && none.progress === 0, 'No date → safe defaults');
  console.log('✓ computeCountdown (no date)');

  assert(countdownHeadline(c, 'th').includes('10'), 'Thai headline should contain the day count');
  assert(countdownHeadline(c, 'en').includes('10'), 'English headline should contain the day count');
  assert(countdownHeadline(none, 'th').length > 0, 'Missing date must still render a headline');
  console.log('✓ countdownHeadline');

  const markup = renderCountdownScene({ startDate: new Date(Date.now() + 30 * 86400000), createdAt: new Date(Date.now() - 30 * 86400000) });
  const pct = markup.match(/--cd-progress:(\d+)%/)?.[1];
  assert(pct && markup.includes(`aria-valuenow="${pct}"`) && markup.includes(`width:${pct}%`), 'runner position, fill and accessible value share progress');
  assert(markup.includes('data-cd-runner') && markup.includes('aria-hidden="true"'), 'decorative runner is present');
  assert(markup.includes('cdc-runner-svg') && markup.includes('cdc-cloud--front') && markup.includes('cdc-fuji'), 'Fuji, the animated traveller and clouds share the journey scene');
  assert(!markup.includes('นับถอยหลังสู่วันเดินทาง'), 'the redundant countdown-to-departure line is removed');
  const arrival = renderCountdownScene({ startDate: '2026-12-30', endDate: '2027-01-05', now });
  assert(arrival.includes('is-during') && arrival.includes('cdc-fireworks') && arrival.includes('cdc-celebrate-svg'), 'on departure day the traveller switches to the celebration pose with fireworks');
  assert(!renderCountdownScene({}).includes('data-cd-runner'), 'no date does not show misleading progress');
  const finished = renderCountdownScene({ startDate: new Date(Date.now() - 5 * 86400000), endDate: new Date(Date.now() - 3 * 86400000) });
  assert(finished.includes('is-after') && finished.includes('--cd-progress:100%'), 'finished trip reaches the end of the track');
  console.log('✓ countdown runner markup');

  console.log('All countdown tests passed');
}

export function testTripTimezoneCalendarDays() {
  const c = computeCountdown({ startDate: '2027-01-11', endDate: '2027-01-12', timezone: 'Asia/Tokyo', now: new Date('2026-12-31T15:01:00Z') });
  assert(c.days === 10 && c.phase === 'before', 'Tokyo Jan 1 to Jan 11 is ten calendar days');
  assert(computeCountdown({ startDate: '2027-01-11', endDate: '2027-01-12', timezone: 'Asia/Tokyo', now: new Date('2027-01-12T14:59:59Z') }).phase === 'during', 'end date is inclusive in trip timezone');
  assert(computeCountdown({ startDate: '2027-01-11', endDate: '2027-01-12', timezone: 'Asia/Tokyo', now: new Date('2027-01-12T15:00:00Z') }).phase === 'after', 'trip ends at midnight in Tokyo');
  const dst = computeCountdown({ startDate: '2027-03-13', endDate: '2027-03-15', timezone: 'America/New_York', now: new Date('2027-03-15T03:30:00Z') });
  assert(dst.phase === 'during' && /2/.test(renderCountdownScene({ startDate: '2027-03-13', endDate: '2027-03-15', timezone: 'America/New_York', lang: 'en' }, new Date('2027-03-15T03:30:00Z'))), 'DST does not shift calendar trip day');
  const fall = computeCountdown({ startDate: '2027-11-06', endDate: '2027-11-07', timezone: 'America/New_York', now: new Date('2027-11-08T04:30:00Z') });
  assert(fall.phase === 'during', 'fall DST end date includes its 25th hour');
}

export function testCountdownSubDayFigures() {
  // 10:00 the day before departure in Bangkok: 1 calendar day, 14 hours left.
  const c = computeCountdown({ startDate: '2027-01-11', timezone: 'Asia/Bangkok', now: new Date('2027-01-10T03:00:00Z') });
  assert(c.days === 1 && c.hours === 14, `calendar day + hours to next midnight (${c.days}d ${c.hours}h)`);
  // Just after Bangkok midnight the whole calendar day counts as “1 day left”.
  const earlyMorning = computeCountdown({ startDate: '2027-01-11', timezone: 'Asia/Bangkok', now: new Date('2027-01-09T17:00:01Z') });
  assert(earlyMorning.days === 1 && earlyMorning.hours === 23, `early morning shows the hours of the last full day (${earlyMorning.days}d ${earlyMorning.hours}h)`);
  // 23:00 the night before: still “1 day”, one hour to midnight.
  const lateNight = computeCountdown({ startDate: '2027-01-11', timezone: 'Asia/Bangkok', now: new Date('2027-01-10T16:00:00Z') });
  assert(lateNight.days === 1 && lateNight.hours === 1, `late night shows one hour left of the last day (${lateNight.days}d ${lateNight.hours}h)`);
  // A date-only trip starts at 00:00 in the trip timezone, so the departure day
  // is already “during”, never a 0-day countdown with hours left.
  const same = computeCountdown({ startDate: '2027-01-10', timezone: 'Asia/Bangkok', now: new Date('2027-01-10T03:00:00Z') });
  assert(same.phase === 'during' && same.days === 0, 'the departure day itself is “during the trip”');
}
