/**
 * Dev-only visual preview builder (not part of the app or the test suite).
 *
 * Renders real pages of the app in jsdom (against the smoke-test CDN stubs),
 * dumps their HTML, compiles a Tailwind stylesheet for exactly those pages and
 * opens them in headless Chromium so the design can be reviewed offline —
 * the sandbox has no access to the Tailwind/Lucide CDNs the app normally uses.
 *
 *   node tools/preview/build.mjs            # dump every route
 *   node tools/preview/build.mjs dashboard  # dump one route
 *
 * Output: tools/preview/out/<name>.html  (+ shot.mjs screenshots them)
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';

const here = import.meta.dirname;
const root = path.resolve(here, '../..');
const outDir = path.join(here, 'out');
const buildDir = path.join(root, 'tests', 'smoke', '.build', 'src', 'js');
const stubDir = path.join(root, 'tests', 'smoke', 'stubs');
const stub = (name) => pathToFileURL(path.join(stubDir, name)).href;

fs.mkdirSync(outDir, { recursive: true });

// ------------------------------------------------------------------ DOM setup
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8')
  .replace(/<script[\s\S]*?<\/script>/g, '')
  .replace(/<link[^>]+https:\/\/[^>]*>/g, '');

const dom = new JSDOM(html, { url: 'http://localhost/', pretendToBeVisual: true, runScripts: 'outside-only' });
const { window } = dom;
const define = (key, value) => {
  try { Object.defineProperty(globalThis, key, { value, configurable: true, writable: true }); }
  catch { try { globalThis[key] = value; } catch { /* ignore */ } }
};
// jsdom's Performance self-recurses if it is copied onto the node global, so it
// is deliberately missing from the “force” list below (same as the smoke test).
for (const key of ['window', 'document', 'navigator', 'location', 'localStorage', 'sessionStorage', 'history',
  'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLSelectElement', 'Element', 'Node', 'Event',
  'CustomEvent', 'MutationObserver', 'DOMParser', 'Blob', 'File', 'FileReader', 'FormData', 'getComputedStyle',
  'requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'screen', 'DocumentFragment', 'Image', 'URL']) {
  if (window[key] !== undefined && globalThis[key] === undefined) {
    try { globalThis[key] = window[key]; } catch { /* read-only */ }
  }
}
for (const key of ['window', 'document', 'location', 'navigator', 'localStorage', 'sessionStorage', 'history',
  'HTMLElement', 'Element', 'Node', 'Event', 'CustomEvent', 'File', 'FileReader', 'FormData', 'getComputedStyle',
  'requestAnimationFrame', 'cancelAnimationFrame', 'screen', 'DocumentFragment', 'Image', 'URL', 'Blob']) {
  if (window[key] !== undefined) define(key, window[key]);
}
try { delete window.requestIdleCallback; } catch {}
try { delete globalThis.requestIdleCallback; } catch {}
window.lucide = { createIcons() {} };
define('lucide', window.lucide);
window.scrollTo = () => {};
window.print = () => {};
window.HTMLAnchorElement.prototype.click = function () {};
if (!window.URL.createObjectURL) window.URL.createObjectURL = () => 'blob:preview';
if (!window.URL.revokeObjectURL) window.URL.revokeObjectURL = () => {};
window.matchMedia = window.matchMedia || (() => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
window.Element.prototype.scrollIntoView = function () {};
window.Element.prototype.animate = function () { return { finished: Promise.resolve(), cancel() {}, onfinish: null }; };
window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
window.HTMLCanvasElement.prototype.getContext = () => ({
  fillRect() {}, clearRect() {}, drawImage() {}, getImageData: () => ({ data: [] }), putImageData() {},
  createLinearGradient: () => ({ addColorStop() {} }), setTransform() {}, save() {}, restore() {}, scale() {}
});
window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,';
window.addEventListener('error', (e) => console.error('[window error]', e.message));

// ----------------------------------------------------------------- seeding
const fsdb = await import(stub('firebase-firestore.mjs'));
const now = { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 };
const iso = (offsetDays) => new Date(Date.now() + offsetDays * 86400000).toISOString().slice(0, 10);

const TRIP = {
  name: 'ทริปฟูจิ 2027', description: 'ครอบครัว', country: 'Japan', city: 'Fujikawaguchiko',
  startDate: iso(20), endDate: iso(24), baseCurrency: 'JPY', timezone: 'Asia/Tokyo', exchangeRateToTHB: 0.24,
  themeColor: '#2f6fe4', inviteCode: 'FUJI23', inviteEnabled: true, status: 'active', createdBy: 'u1',
  memberUids: ['u1', 'u2', 'u3'], budgetTotal: 500000, budgetPerPerson: 250000, createdAt: now, coverImage: ''
};
fsdb.__seed('trips/t1', TRIP);
fsdb.__seed('trips/t1/members/u1', { displayName: 'สมชาย', username: 'admin', role: 'trip_admin', color: '#2f6fe4', status: 'active', permissions: { canEditItinerary: true, canEditExpense: true, canManageMembers: true }, createdAt: now });
fsdb.__seed('trips/t1/members/u2', { displayName: 'นุ่น', username: 'nun', role: 'member', color: '#f0ae52', status: 'active', permissions: { canEditItinerary: true, canEditExpense: true }, createdAt: now });
fsdb.__seed('trips/t1/members/u3', { displayName: 'ข้าวหอม', username: 'khaohom', role: 'member', color: '#3f9d94', status: 'active', permissions: { canEditItinerary: true, canEditExpense: true }, createdAt: now });

const items = [
  ['i1', 'บินถึงโตเกียว (ฮาเนดะ)', 0, '09:15', 90, 'transport', 'ท่าอากาศยานฮาเนดะ', '35.5494,139.7798', 0],
  ['i2', 'ขึ้นรถบัสไปคาวากุจิ', 0, '13:00', 120, 'transport', 'สถานีรถบัสชินจูกุ', '35.6896,139.7006', 2200],
  ['i3', 'เช็คอินเรียวกัง', 0, '17:30', 45, 'stay', 'Fujikawaguchiko', '35.5025,138.7519', 32000],
  ['i4', 'ทะเลสาบคาวากุจิ', 1, '08:30', 150, 'sightseeing', 'Lake Kawaguchi', '35.5171,138.7519', 0],
  ['i5', 'ราเมงฮาจิบัง', 1, '12:30', 60, 'food', 'Fujiyoshida', '35.4875,138.8077', 2500],
  ['i6', 'ชมใบไม้แดงที่โอชิโนะฮัคไค', 2, '10:00', 120, 'nature', 'Oshino Hakkai', '35.4605,138.8338', 800],
  ['i7', 'นั่งชิงช้าสวรรค์ / ดื่มชา', 3, '15:00', 90, 'activity', 'Fuji-Q Highland', '35.4872,138.7799', 1800]
];
for (const [id, title, day, time, dur, category, address, coordinates, cost] of items) {
  const date = iso(20 + day);
  fsdb.__seed(`trips/t1/itineraryItems/${id}`, {
    title, date, startAt: new Date(`${date}T${time}:00+09:00`), durationMinutes: dur, travelToNextMinutes: 30,
    order: Number(id.slice(1)), category, status: 'planned', address, coordinates,
    description: '', estimateAmount: cost, estimateCurrency: 'JPY', estimateCategory: category === 'food' ? 'food' : 'ticket',
    estimatePayerId: 'u1', estimateShareWith: ['u1', 'u2', 'u3'], estimateAutoAdd: cost > 0, createdAt: now
  });
}

const expenses = [
  ['e1', 'โรงแรมฟูจิวิว', 0, 'stay', 32000, 'card', 'u1'],
  ['e2', 'ค่าตั๋วรถบัสชินจูกุ', 0, 'transport', 4400, 'cash', 'u2'],
  ['e3', 'มื้อเย็นอิซากายะ', 1, 'food', 8600, 'cash', 'u3'],
  ['e4', 'ค่าเข้าชม + ของที่ระลึก', 2, 'activity', 3200, 'card', 'u1']
];
for (const [id, title, day, category, amount, method, payer] of expenses) {
  fsdb.__seed(`trips/t1/expenses/${id}`, {
    title, date: iso(20 + day), category, currency: 'JPY', baseCurrency: 'JPY',
    subtotalMinor: amount, discountMinor: 0, serviceMinor: 0, taxMinor: 0, cardFeeMinor: 0, netTotalMinor: amount,
    thbRate: 0.24, thbMinor: Math.round(amount * 0.24), payerId: payer, status: 'active', isEstimated: false,
    actualMinor: amount, paymentMethod: method,
    allocations: [{ memberId: 'u1', amountMinor: Math.round(amount / 3) }, { memberId: 'u2', amountMinor: Math.round(amount / 3) }, { memberId: 'u3', amountMinor: amount - 2 * Math.round(amount / 3) }],
    createdAt: now
  });
}

fsdb.__seed('trips/t1/reservations/b1', {
  title: 'TG676 BKK → NRT', type: 'flight', date: iso(20), startTime: '08:15', endTime: '16:00',
  confirmation: 'XT4K9P', provider: 'Thai Airways', from: 'BKK', to: 'NRT', costMinor: 2450000, currency: 'THB',
  status: 'confirmed', address: 'Narita International Airport', notes: '✈ TG676', createdAt: now
});
fsdb.__seed('trips/t1/checklists/c1', {
  title: 'แพ็คกระเป๋า', templateId: 'packing-tropical', createdAt: now,
  items: [
    { id: 'c1a', text: 'พาสปอร์ต', done: true }, { id: 'c1b', text: 'ปลั๊กแปลงไฟ', done: true },
    { id: 'c1c', text: 'พาวเวอร์แบงก์', done: false }, { id: 'c1d', text: 'ยาแก้เมารถ', done: false }
  ]
});
fsdb.__seed('trips/t1/ideas/idea1', { title: 'ทะเลสาบคาวากุจิ', note: 'วิวฟูจิยามเช้า', category: 'sightseeing', votes: ['u2', 'u3'], status: 'idea', createdAt: now });
fsdb.__seed('trips/t1/ideas/idea2', { title: 'ป่าไผ่อาราชิยามะ', note: 'ไปเช้า คนน้อย', category: 'nature', votes: ['u3'], status: 'idea', createdAt: now });
fsdb.__seed('trips/t1/notes/n1', { title: 'รหัส WiFi เรียวกัง', body: 'fuji-2027 / 8888', color: 'amber', updatedAt: now });
fsdb.__seed('trips/t1/documents/d1', { title: 'พาสปอร์ตสมชาย', category: 'passport', date: iso(20), description: '', fileUrl: '', imageUrl: '' });

// ------------------------------------------------------------------ boot
await import(pathToFileURL(path.join(buildDir, 'app.js')).href);
const authStub = await import(stub('firebase-auth.mjs'));
authStub.__emitAuth({ uid: 'u1', email: 'admin@test.com', displayName: 'สมชาย', photoURL: null });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const appEl = () => window.document.getElementById('app');
const text$ = () => appEl()?.textContent || '';
async function waitFor(fn, { timeout = 8000, label = 'condition' } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try { if (fn()) return true; } catch { /* keep polling */ }
    await sleep(25);
  }
  throw new Error(`timeout waiting for ${label}`);
}
async function goto(hash) {
  window.location.hash = hash;
  window.dispatchEvent(new window.Event('hashchange'));
  await sleep(80);
}

// ------------------------------------------------------------------- routes
const only = process.argv[2];
const ROUTES = [
  ['login', '#/login', 900],
  ['trips', '#/trips', 900],
  ['dashboard', '#/trip/t1/dashboard', 1400],
  ['itinerary', '#/trip/t1/itinerary', 1400],
  ['explore', '#/trip/t1/explore', 1200],
  ['calendar', '#/trip/t1/calendar', 1200],
  ['expenses', '#/trip/t1/expenses', 1200],
  ['settlement', '#/trip/t1/settlement', 1200],
  ['members', '#/trip/t1/members', 1000],
  ['bookings', '#/trip/t1/bookings', 1000],
  ['ideas', '#/trip/t1/ideas', 1000],
  ['prep', '#/trip/t1/prep', 1000],
  ['documents', '#/trip/t1/documents', 1000],
  ['import', '#/trip/t1/import', 1000],
  ['more', '#/trip/t1/more', 1000],
  ['settings', '#/trip/t1/settings', 1000]
];

await goto('#/trips');
await waitFor(() => text$().length > 40, { label: 'boot' });

for (const [name, hash, wait] of ROUTES) {
  if (only && only !== name) continue;
  await goto(hash);
  await sleep(wait);
  const doc = window.document;
  const header = doc.getElementById('app-header')?.outerHTML || '';
  const bottomNav = doc.getElementById('bottom-nav')?.outerHTML || '';
  const fab = doc.getElementById('fab')?.outerHTML || '';
  const desktopNav = doc.getElementById('desktop-nav')?.outerHTML || '';
  const main = appEl()?.outerHTML || '';
  const body = `<div id="page">\n${header}\n${desktopNav}\n${main}\n${fab}\n${bottomNav}\n</div>\n<div id="toast-container"></div>`;
  fs.writeFileSync(path.join(outDir, `${name}.html`), body, 'utf8');
  console.log(`saved tools/preview/out/${name}.html (${Math.round(body.length / 1024)} kB)`);
}
process.exit(0);
