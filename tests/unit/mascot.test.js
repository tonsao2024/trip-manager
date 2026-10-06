// v18 — the dashboard mascot: the mood is derived from the trip, not invented.
import { renderFujiBuddy, fujiBuddyMood, fujiBuddyLine, BUDDY_MOODS } from '../../src/js/components/mascot.js';

function assert(cond, msg) { if (!cond) throw new Error(msg); }

export function testMascotMood() {
  assert(fujiBuddyMood({ overBudget: true, unsettledMinor: 5, daysToStart: 1 }) === 'worry', 'over budget wins');
  assert(fujiBuddyMood({ unsettledMinor: 1, daysToStart: 1 }) === 'wallet', 'unsettled bills come next');
  assert(fujiBuddyMood({ daysToStart: 3 }) === 'cheer', 'three days out is a celebration');
  assert(fujiBuddyMood({ daysToStart: 0 }) === 'cheer', 'today is included');
  assert(fujiBuddyMood({ daysToStart: 90, hour: 23 }) === 'sleepy', 'late night is sleepy');
  assert(fujiBuddyMood({ daysToStart: 90, hour: 4 }) === 'sleepy', 'and so is very early morning');
  assert(fujiBuddyMood({ daysToStart: 90, hour: 12, hasPlan: false }) === 'chill', 'an empty plan is calm');
  assert(fujiBuddyMood({ daysToStart: 90, hour: 12, hasPlan: true }) === 'happy', 'a planned trip is happy');
  assert(fujiBuddyMood({ daysToStart: -5, hour: 12, hasPlan: true }) === 'happy', 'a past trip is not negative');
  assert(fujiBuddyMood({ hour: 12 }) === 'chill', 'a day with nothing planned is calm');
  assert(BUDDY_MOODS.includes(fujiBuddyMood()), 'no data at all still answers with a real mood');
  console.log('✓ fujiBuddyMood');
}

export function testMascotMarkup() {
  const html = renderFujiBuddy({ mood: 'cheer', size: 150, id: 'dash-buddy', tagline: 'ไปเที่ยวกัน!' });
  assert(html.includes('class="fuji-buddy mood-cheer"'), 'the mood is a class so CSS can animate it');
  assert(html.includes('data-mood="cheer"'), 'and on the element for the tap handler');
  assert(html.includes('id="dash-buddy"'), 'the id is honoured (the page paints it after load)');
  assert(html.includes('<svg') && html.includes('viewBox='), 'it is inline SVG, no image request');
  assert(html.includes('width:150px'), 'the size is respected');
  assert(html.includes('fuji-buddy-speech') && html.includes('ไปเที่ยวกัน!'), 'a tagline becomes a speech bubble');
  assert(html.includes('role="img"') && html.includes('tabindex="0"'), 'it is announced and tappable');
  assert(!html.includes('<img'), 'nothing external is loaded');

  const fallback = renderFujiBuddy({ mood: 'nonsense' });
  assert(fallback.includes('mood-happy') && fallback.includes('data-mood="happy"'), 'an unknown mood falls back');
  assert(!renderFujiBuddy({}).includes('fuji-buddy-speech'), 'no tagline, no bubble');
  console.log('✓ renderFujiBuddy');
}

export function testMascotLines() {
  const moods = Array.isArray(BUDDY_MOODS) ? BUDDY_MOODS : ['happy', 'cheer', 'chill', 'sleepy', 'worry', 'wallet'];
  for (const mood of moods) {
    for (const lang of ['th', 'en']) {
      const line = fujiBuddyLine(mood, lang);
      assert(typeof line === 'string' && line.length > 4, `${mood}/${lang} has something to say`);
      assert(!/[<>"]/.test(line), `${mood}/${lang} is plain text (it is inserted as HTML)`);
    }
  }
  assert(typeof fujiBuddyLine('unknown-mood', 'th') === 'string', 'an unknown mood still speaks');
  console.log(`✓ fujiBuddyLine (${moods.length} moods × 2 languages)`);
}
