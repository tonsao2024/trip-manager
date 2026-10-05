// Unit tests — share/invite helpers (v17).
import {
  appBaseUrl, inviteLink, tripLink, formatCode, inviteMessage, lineShareUrl,
  whatsappShareUrl, telegramShareUrl, tripSummaryText, itineraryText, printPlanUrl,
  SHARE_TARGETS
} from '../../src/js/utils/share.js';

function assert(cond, msg) { if (!cond) throw new Error(msg); }

const GH_PAGES = { origin: 'https://tonsao2024.github.io', pathname: '/trip-manager/' };
const ROOT = { origin: 'https://example.com', pathname: '/' };
const INDEX = { origin: 'https://example.com', pathname: '/trip-manager/index.html' };

const TRIP = {
  id: 't1', name: 'Fuji Autumn 2027', city: 'Fujikawaguchiko', country: 'Japan',
  startDate: '2027-11-10', endDate: '2027-11-14', baseCurrency: 'JPY', inviteCode: 'abc123'
};

export function testUrls() {
  assert(appBaseUrl(GH_PAGES) === 'https://tonsao2024.github.io/trip-manager/', 'keeps the Pages sub-path');
  assert(appBaseUrl(ROOT) === 'https://example.com/', 'root path');
  assert(appBaseUrl(INDEX) === 'https://example.com/trip-manager/', 'index.html is stripped');
  assert(appBaseUrl(null) === '/', 'no location → fallback');

  const link = inviteLink('abc123', GH_PAGES);
  assert(link === 'https://tonsao2024.github.io/trip-manager/#/trips?invite=ABC123', `invite deep link (got ${link})`);
  assert(inviteLink('', GH_PAGES) === appBaseUrl(GH_PAGES), 'no code → plain app link');
  assert(tripLink('t1', 'itinerary', ROOT) === 'https://example.com/#/trip/t1/itinerary', 'trip deep link');
  assert(tripLink('t1', '/calendar', ROOT).endsWith('#/trip/t1/calendar'), 'leading slash trimmed');
  assert(printPlanUrl('t1', ROOT).endsWith('#/trip/t1/itinerary?print=1'), 'print link');
}

export function testCodeFormatting() {
  assert(formatCode('abc123') === 'ABC-123', 'six chars get a dash');
  assert(formatCode('ab-c 12 3') === 'ABC-123', 'junk stripped');
  assert(formatCode('ab12') === 'AB12', 'other lengths stay as they are');
  assert(formatCode('') === '', 'empty');
}

export function testInviteMessage() {
  const th = inviteMessage({ trip: TRIP, inviteCode: 'abc123', inviter: 'Ton', lang: 'th', location: GH_PAGES });
  assert(th.includes('ABC-123'), 'Thai message carries the code');
  assert(th.includes('Fuji Autumn 2027'), 'trip name');
  assert(th.includes('ญี่ปุ่น') === false, 'no country placeholder text');
  assert(th.includes('#/trips?invite=ABC123'), 'invite link inside the message');
  assert(th.includes('โดย Ton'), 'inviter shown');

  const en = inviteMessage({ trip: TRIP, inviteCode: 'abc123', lang: 'en', location: ROOT });
  assert(en.includes('Invite code: ABC-123'), 'English wording');
  assert(en.includes('Fujikawaguchiko, Japan'), 'city + country line');
  assert(en.includes('2027-11-10 → 2027-11-14'), 'dates');

  const bare = inviteMessage({ lang: 'th', location: ROOT });
  assert(bare.includes('ทริปของเรา'), 'falls back to a generic trip name');
}

export function testShareLinks() {
  assert(lineShareUrl('สวัสดี').startsWith('https://line.me/R/msg/text/'), 'LINE share URL');
  assert(decodeURIComponent(lineShareUrl('hi there')).endsWith('hi there'), 'message is encoded');
  assert(whatsappShareUrl('hi').startsWith('https://wa.me/?text='), 'WhatsApp URL');
  assert(telegramShareUrl('hi', 'https://x.y').includes('url=https%3A%2F%2Fx.y'), 'Telegram URL');
  assert(SHARE_TARGETS.length >= 5 && SHARE_TARGETS.every(t => t.id && t.icon && t.th && t.en), 'share targets are labelled');
}

export function testSummaryText() {
  const members = [{ id: 'a' }, { id: 'b' }];
  const items = [
    { date: '2027-11-10', title: 'Arrive' },
    { date: '2027-11-11', title: 'Lake' },
    { date: '2027-11-11', title: 'Onsen' }
  ];
  const expenses = [{ title: 'Train', netTotalMinor: 50000 }, { title: 'Hotel', netTotalMinor: 150000 }];
  const th = tripSummaryText({ trip: TRIP, members, items, expenses, totalMinor: 200000, currency: 'JPY', lang: 'th' });
  assert(th.includes('Fuji Autumn 2027'), 'name');
  assert(th.includes('สมาชิก 2 คน'), 'member count');
  assert(th.includes('จุดหมาย 3 แห่ง'), 'stop count');
  assert(th.includes('(2 วัน)'), 'distinct days');
  assert(th.includes('Train'), 'recent expense titles');
  assert(!th.includes('undefined'), 'no undefined leaking into the text');
  const en = tripSummaryText({ trip: TRIP, members, items, expenses, totalMinor: 200000, lang: 'en' });
  assert(en.includes('2 members') && en.includes('3 places'), 'English summary');
}

export function testItineraryText() {
  const items = [
    { date: '2027-11-11', title: 'Lake Kawaguchi', startAt: '2027-11-11T09:00:00', address: 'Fujikawaguchiko' },
    { date: '2027-11-10', title: 'Arrive Haneda', startAt: '2027-11-10T10:00:00' },
    { date: '2027-11-11', title: 'Onsen', startAt: '2027-11-11T18:00:00' }
  ];
  const text = itineraryText({ trip: TRIP, items, lang: 'th' });
  assert(text.startsWith('🧳 Fuji Autumn 2027'), 'starts with the trip name');
  const day1 = text.indexOf('2027-11-10');
  const day2 = text.indexOf('2027-11-11');
  assert(day1 > -1 && day2 > day1, 'days are in chronological order');
  assert(text.indexOf('09:00 Lake Kawaguchi') < text.indexOf('18:00 Onsen'), 'items sorted by time');
  assert(text.includes('— Fujikawaguchiko'), 'address included');
  const en = itineraryText({ trip: TRIP, items, lang: 'en' });
  assert(en.includes('Day 1') && en.includes('Day 2'), 'English day labels');
  assert(itineraryText({ trip: TRIP, items: [] }).startsWith('🧳'), 'empty plan still renders a header');
}
