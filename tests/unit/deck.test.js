// v18 — the pure maths behind the Tinder-style receipt deck (Clear-bill page).
import {
  deckOrder, deckStep, deckAt, swipeIntent, swipeTilt, swipePeek, swipeHint,
  deckSummary, deckPositionLabel
} from '../../src/js/utils/deck.js';

function assert(cond, msg) { if (!cond) throw new Error(msg); }
const near = (a, b, eps = 0.01) => Math.abs(a - b) <= eps;

export function testDeckOrder() {
  const list = [
    { memberId: 'b', displayName: 'บี', netMinor: -5000 },
    { memberId: 'a', displayName: 'เอ', netMinor: 100 },
    { memberId: 'c', displayName: 'ซี', netMinor: 9000 },
    { memberId: 'd', displayName: 'ดี', netMinor: -9000 }
  ];
  const ordered = deckOrder(list, { myId: 'a' });
  assert(ordered[0].memberId === 'a', 'my own receipt comes first');
  // then the biggest movement, whatever the sign
  assert(ordered[1].memberId === 'c' || ordered[1].memberId === 'd', 'largest balance next');
  assert(ordered.some(m => m.memberId === 'b'), 'nobody is dropped');
  const tie = deckOrder([
    { memberId: 'x', displayName: 'ZONE', netMinor: 0 },
    { memberId: 'y', displayName: 'Alpha', netMinor: 0 }
  ], {});
  assert(tie[0].displayName === 'Alpha', 'ties fall back to the name');
  assert(deckOrder(null, {}).length === 0, 'null input is safe');
  console.log('✓ deckOrder');
}

export function testDeckNavigation() {
  assert(deckStep(0, 1, 4) === 1, 'forward');
  assert(deckStep(0, -1, 4) === 3, 'backwards wraps to the end');
  assert(deckStep(3, 1, 4) === 0, 'forward wraps to the start');
  assert(deckStep(1, 7, 4) === 0, 'big jumps wrap');
  assert(deckStep(0, 1, 0) === -1, 'an empty deck has no next');
  assert(deckStep('junk', 1, 3) === 1, 'a broken index is treated as the start');

  const list = ['a', 'b', 'c'];
  assert(deckAt(list, 1) === 'b', 'deckAt reads the current card');
  assert(deckAt(list, 9) === 'a', 'out of range wraps instead of throwing');
  assert(deckAt([], 0) === null, 'empty deck');
  assert(deckAt(list, null) === 'a', 'null index is the first card');
  console.log('✓ deckStep / deckAt');
}

export function testSwipeGrammar() {
  const w = 360;
  assert(swipeIntent({ dx: -200, dy: 10, width: w }) === 'next', 'a long left drag is the next person');
  assert(swipeIntent({ dx: 200, dy: -10, width: w }) === 'prev', 'a long right drag is the previous person');
  assert(swipeIntent({ dx: 2, dy: 1, width: w }) === 'open', 'a tap opens the detail');
  assert(swipeIntent({ dx: -30, dy: -220, width: w }) === 'none', 'a vertical scroll is not a swipe');
  assert(swipeIntent({ dx: 0, dy: 300, width: w }) === 'none', 'a vertical drag never opens the sheet');
  assert(swipeIntent({}) === 'open', 'no movement at all is a tap');
  assert(swipeIntent({ dx: -50, dy: 0, width: 100, threshold: 0.2 }) === 'none',
    'the threshold never drops below 60px');

  assert(swipeTilt(0, w) === 0, 'no drag, no tilt');
  assert(swipeTilt(-180, w) < 0, 'dragging left tilts one way');
  assert(swipeTilt(180, w) > 0, 'dragging right tilts the other way');
  assert(Math.abs(swipeTilt(-99999, w)) <= 9, 'the tilt is capped');
  assert(near(swipeTilt(-360, 360), -9), 'a full-width drag hits the cap');

  assert(swipePeek(0) === 1, 'the next card is hidden while nothing is dragged');
  assert(near(swipePeek(1), 0.55), 'a full drag brings it forward');
  assert(swipePeek(2) === swipePeek(1) && swipePeek(-1) === swipePeek(1), 'progress is clamped');
  assert(swipePeek(0.5) > swipePeek(1), 'it fades in monotonically');

  assert(swipeHint(0) === null, 'no hint before the drag starts');
  assert(swipeHint(-80).tone === 'next', 'left → next');
  assert(swipeHint(80).tone === 'prev', 'right → previous');
  assert(swipeHint(-80, { next: 'ถัดไป' }).label === 'ถัดไป', 'labels follow the language');
  console.log('✓ swipeIntent / swipeTilt / swipePeek / swipeHint');
}

export function testDeckSummary() {
  const money = (n) => `฿${(Number(n) || 0) / 100}`;
  const statement = {
    memberId: 'u1', displayName: 'สมชาย ใจดี', color: '#1f6bfb', photoURL: '',
    netMinor: -250000, paidMinor: 400000, owedMinor: 650000,
    paidCount: 3, shareCount: 5, flagged: null,
    items: [
      { title: ' tiket รถไฟ ', amountMinor: -120000, role: 'paid' },
      { title: 'ดินเย็น', amountMinor: -500000, role: 'paid', estimated: true },
      { title: 'ค่าเข้า', amountMinor: 30000, role: 'share' },
      { title: 'คาเฟ่', amountMinor: 20000, role: 'share' },
      { title: 'ของฝาก', amountMinor: 10000, role: 'share' }
    ]
  };
  const sum = deckSummary(statement, { money, lang: 'th', flagged: 2 });
  assert(sum.positive === false, 'a negative net is a debt');
  assert(sum.headline === '฿2500', 'the headline is the balance through the money formatter');
  assert(sum.initials === 'ส', 'the avatar letter is the first character, upper-cased');
  assert(sum.top.length === 3, 'only the three biggest items make the card');
  assert(sum.top[0].title === 'ดินเย็น', 'the biggest item comes first');
  assert(sum.top[0].estimated === true && sum.top[1].estimated === false, 'estimates are marked');
  assert(sum.top.every(i => i.amount.startsWith('฿')), 'amounts go through the money formatter');
  assert(sum.itemCount === 5 && sum.paidCount === 3 && sum.shareCount === 5, 'counts are passed through');
  assert(sum.flagged === 2, 'the page passes the flag count (it comes from comments)');
  assert(sum.settled === false, 'a debtor is not settled');

  const settled = deckSummary({ memberId: 'u2', displayName: 'A', netMinor: 0, items: [] }, { money });
  assert(settled.settled === true, 'nothing owed and nothing to pay = settled');
  assert(settled.top.length === 0 && settled.flagged === 0, 'an empty statement is still a valid summary');
  assert(deckSummary(null, { money }).name === '', 'null statement is safe');
  const flaggedIds = deckSummary({ netMinor: 0, items: [], flaggedIds: ['e1', 'e2'] }, { money });
  assert(flaggedIds.flagged === 2, 'flaggedIds is a valid shape too');
  console.log('✓ deckSummary');
}

export function testDeckPositionLabel() {
  assert(deckPositionLabel(0, 5, 'th') === '1 ของ 5', 'Thai position');
  assert(deckPositionLabel(2, 5, 'en') === '3 of 5', 'English position');
  assert(deckPositionLabel(7, 5, 'th') === '5 ของ 5', 'clamped to the last card');
  assert(deckPositionLabel(-3, 5, 'th') === '1 ของ 5', 'clamped to the first card');
  assert(deckPositionLabel(0, 0, 'th') === '', 'no cards, no label');
  console.log('✓ deckPositionLabel');
}
