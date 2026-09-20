import { computeCountdown, countdownHeadline } from '../../src/js/components/countdown.js';

function assert(cond, msg) { if (!cond) throw new Error(msg); }

export function testCountdown() {
  console.log('Testing countdown animation logic...');

  const now = new Date('2027-01-01T00:00:00Z');
  const c = computeCountdown({ startDate: '2027-01-11', endDate: '2027-01-15', createdAt: '2026-12-01', now });
  assert(c.phase === 'before', 'Should be in the "before" phase');
  assert(c.days === 10, `Should be 10 days left, got ${c.days}`);
  assert(c.progress > 0 && c.progress < 1, `Progress should be between 0 and 1, got ${c.progress}`);
  console.log('✓ computeCountdown (before trip)');

  // Closer date → higher progress (the runner moves towards Fuji)
  const near = computeCountdown({ startDate: '2027-01-02', endDate: '2027-01-05', createdAt: '2026-12-01', now });
  assert(near.progress > c.progress, 'Closer departure must yield higher progress');
  console.log('✓ progress increases as the date approaches');

  const during = computeCountdown({ startDate: '2026-12-30', endDate: '2027-01-05', now });
  assert(during.phase === 'during', 'Should be "during" the trip');
  assert(during.progress === 1, 'Progress must be 1 during the trip');
  console.log('✓ computeCountdown (during trip)');

  const after = computeCountdown({ startDate: '2026-11-01', endDate: '2026-11-05', now });
  assert(after.phase === 'after', 'Should be "after" the trip');
  console.log('✓ computeCountdown (after trip)');

  const none = computeCountdown({ now });
  assert(none.startDate === null && none.progress === 0, 'No date → safe defaults');
  console.log('✓ computeCountdown (no date)');

  assert(countdownHeadline(c, 'th').includes('10'), 'Thai headline should contain the day count');
  assert(countdownHeadline(c, 'en').includes('10'), 'English headline should contain the day count');
  assert(countdownHeadline(none, 'th').length > 0, 'Missing date must still render a headline');
  console.log('✓ countdownHeadline');

  console.log('All countdown tests passed');
}
