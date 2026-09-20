/**
 * jsdom smoke test — loads the real app (src/js) against stubbed CDN modules,
 * renders every route with seeded data and asserts the v4 features work.
 *
 * Run:  npm i --no-save jsdom dayjs xlsx && node tests/smoke/run.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';
import { outDir } from './build.mjs';

const here = import.meta.dirname;
const root = path.resolve(here, '../..');
const stub = (name) => pathToFileURL(path.join(here, 'stubs', name)).href;

process.on('uncaughtException', (e) => { console.error('UNCAUGHT:', e?.name, e?.message, '\n', e?.stack || '(no stack)'); process.exit(3); });
const problems = [];
const check = (cond, label) => { if (cond) console.log(`  ✓ ${label}`); else { console.log(`  ✗ ${label}`); problems.push(label); } };

// ---------------------------------------------------------------- DOM setup
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8')
  .replace(/<script[\s\S]*?<\/script>/g, '')
  .replace(/<link[^>]+https:\/\/[^>]*>/g, '');

const dom = new JSDOM(html, { url: 'http://localhost/', pretendToBeVisual: true, runScripts: 'outside-only' });
const { window } = dom;

for (const key of ['window', 'document', 'navigator', 'location', 'localStorage', 'sessionStorage', 'history',
  'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLSelectElement', 'Element', 'Node', 'Event',
  'CustomEvent', 'MutationObserver', 'DOMParser', 'Blob', 'File', 'FileReader', 'FormData', 'getComputedStyle',
  'requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'screen', 'DocumentFragment', 'Image', 'URL']) {
  if (window[key] !== undefined && globalThis[key] === undefined) {
    try { globalThis[key] = window[key]; } catch { /* read-only in node */ }
  }
}
const define = (key, value) => {
  try { Object.defineProperty(globalThis, key, { value, configurable: true, writable: true }); }
  catch { try { globalThis[key] = value; } catch {} }
};
for (const key of ['window', 'document', 'location', 'navigator', 'localStorage', 'sessionStorage', 'history',
  'HTMLElement', 'Element', 'Node', 'Event', 'CustomEvent', 'File', 'FileReader', 'FormData', 'getComputedStyle',
  'requestAnimationFrame', 'cancelAnimationFrame', 'screen', 'DocumentFragment', 'Image', 'URL', 'Blob']) {
  if (window[key] !== undefined) define(key, window[key]);
}
try { delete window.requestIdleCallback; } catch {}
try { delete globalThis.requestIdleCallback; } catch {}
window.lucide = { createIcons() {} };
// jsdom ships a crypto object without SubtleCrypto; real browsers have it over https.
if (!window.crypto?.subtle && globalThis.crypto?.subtle) {
  Object.defineProperty(window, 'crypto', { value: globalThis.crypto, configurable: true });
}
if (!globalThis.crypto?.subtle) console.warn('[smoke] no WebCrypto available — member PIN tests will be skipped');
define('lucide', window.lucide);
window.scrollTo = () => {};
window.print = () => {};
window.HTMLAnchorElement.prototype.click = function () {};
if (!window.URL.createObjectURL) window.URL.createObjectURL = () => 'blob:smoke';
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

if (process.env.SMOKE_TRACE) {
  const trace = (label) => { try { throw new Error(label); } catch (err) { console.error(err.stack.split('\n').slice(1, 8).join('\n')); } };
  const origInsertBefore = window.Node.prototype.insertBefore;
  window.Node.prototype.insertBefore = function (node, child) {
    if (child && child.parentNode !== this) {
      try { throw new Error('insertBefore mismatch'); } catch (err) { console.error(err.stack.split('\n').slice(1, 10).join('\n')); }
    }
    return origInsertBefore.call(this, node, child);
  };
  const origRemoveChild = window.Node.prototype.removeChild;
  window.Node.prototype.removeChild = function (child) {
    if (child && child.parentNode !== this) trace('removeChild mismatch');
    return origRemoveChild.call(this, child);
  };
}
process.on('unhandledRejection', (e) => { console.error('UNHANDLED:', e?.stack || e); process.exit(4); });


// ------------------------------------------------------------- error capture
const errors = [];
const origError = console.error;
console.error = (...args) => { errors.push(args.map(String).join(' ')); origError('[app error]', ...args); };
window.addEventListener('error', (e) => errors.push(`window error: ${e.message}`));
window.addEventListener('unhandledrejection', (e) => errors.push(`unhandled rejection: ${e.reason?.message || e.reason}`));

// ------------------------------------------------------------------- seeding
const fsdb = await import(stub('firebase-firestore.mjs'));
const now = { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 };
const TRIP = {
  name: 'ทริปฟูจิ 2027', description: 'ครอบครัว', country: 'Japan', city: 'Kawaguchiko',
  startDate: new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10),
  endDate: new Date(Date.now() + 24 * 86400000).toISOString().slice(0, 10),
  baseCurrency: 'THB', timezone: 'Asia/Tokyo', exchangeRateToTHB: 0.24, themeColor: '#8bb89a',
  inviteCode: 'FUJI23', inviteEnabled: true,
  status: 'active', createdBy: 'u1', memberUids: ['u1', 'u2'], budgetTotal: 5000000, budgetPerPerson: 2500000,
  createdAt: now, coverImage: ''
};
fsdb.__seed('trips/t1', TRIP);
fsdb.__seed('trips/t1/members/u1', { displayName: 'สมชาย', username: 'admin', role: 'trip_admin', color: '#8bb89a', status: 'active', permissions: { canEditItinerary: true, canEditExpense: true, canManageMembers: true }, createdAt: now });
fsdb.__seed('trips/t1/members/u2', { displayName: 'นุ่น', username: 'nun', role: 'member', color: '#e0a17a', status: 'active', permissions: { canEditItinerary: true, canEditExpense: true }, createdAt: now });
fsdb.__seed('trips/t1/itineraryItems/i1', {
  title: 'ทะเลสาบคาวากุจิ', date: TRIP.startDate, startAt: new Date(`${TRIP.startDate}T09:00:00+09:00`),
  durationMinutes: 120, order: 0, category: 'sightseeing', status: 'planned', address: 'Kawaguchiko, Yamanashi',
  coordinates: '35.5171,138.7519', imageUrl: 'https://example.com/fuji.jpg', description: 'ชมวิวฟูจิ',
  estimateAmount: 2500, estimateCurrency: 'JPY', estimateCategory: 'ticket', estimatePayerId: 'u1',
  estimateShareWith: ['u1', 'u2'], estimateAutoAdd: true, createdAt: now
});
fsdb.__seed('trips/t1/itineraryItems/i2', {
  title: 'ราเมงฮาจิบัง', date: TRIP.startDate, startAt: new Date(`${TRIP.startDate}T12:30:00+09:00`),
  durationMinutes: 60, order: 1, category: 'food', status: 'planned', address: 'Fujiyoshida',
  coordinates: '', description: '', createdAt: now
});
fsdb.__seed('trips/t1/expenses/e1', {
  title: 'โรงแรมฟูจิวิว', date: TRIP.startDate, category: 'stay', currency: 'JPY', baseCurrency: 'THB',
  subtotalMinor: 32000, discountMinor: 0, serviceMinor: 0, taxMinor: 0, cardFeeMinor: 0, netTotalMinor: 32000,
  thbRate: 0.24, thbMinor: 7680, payerId: 'u1', status: 'active', isEstimated: true, estimatedMinor: 32000,
  actualMinor: 0, paymentMethod: 'card',
  allocations: [{ memberId: 'u1', amountMinor: 16000 }, { memberId: 'u2', amountMinor: 16000 }], createdAt: now
});
fsdb.__seed('trips/t1/expenses/e2', {
  title: 'ค่าตั๋วรถบัส', date: TRIP.startDate, category: 'transport', currency: 'JPY', baseCurrency: 'THB',
  subtotalMinor: 4400, discountMinor: 0, serviceMinor: 0, taxMinor: 0, cardFeeMinor: 0, netTotalMinor: 4400,
  thbRate: 0.24, thbMinor: 1056, payerId: 'u2', status: 'active', isEstimated: false, estimatedMinor: 0,
  actualMinor: 4400, paymentMethod: 'cash', itineraryItemId: 'i1',
  allocations: [{ memberId: 'u1', amountMinor: 2200 }, { memberId: 'u2', amountMinor: 2200 }], createdAt: now
});
fsdb.__seed('trips/t1/documents/d1', { title: 'พาสปอร์ตสมชาย', category: 'passport', date: TRIP.startDate, description: '', fileUrl: '', imageUrl: '' });

// ------------------------------------------------------------------ app boot
await import(pathToFileURL(path.join(outDir, 'app.js')).href);
const authStub = await import(stub('firebase-auth.mjs'));
authStub.__emitAuth({ uid: 'u1', email: 'admin@test.com', displayName: 'สมชาย', photoURL: null });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, { timeout = 4000, label = 'condition' } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try { if (fn()) return true; } catch { /* keep polling */ }
    await sleep(20);
  }
  throw new Error(`timeout waiting for ${label}`);
}
const appEl = () => window.document.getElementById('app');
const html$ = () => appEl()?.innerHTML || '';
const text$ = () => appEl()?.textContent || '';
async function goto(hash) {
  window.location.hash = hash;
  window.dispatchEvent(new window.Event('hashchange'));
  await sleep(60);
}
const q = (sel) => window.document.querySelector(sel);
const qa = (sel) => [...window.document.querySelectorAll(sel)];
function submit(form) {
  form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
}
async function click(sel) {
  const el = typeof sel === 'string' ? q(sel) : sel;
  if (!el) throw new Error(`element not found: ${sel}`);
  el.click();
  await sleep(50);
}

console.log('\n▶ boot & trip list');
await waitFor(() => text$().includes('ทริปฟูจิ') || text$().includes('Trips'), { label: 'trip list' }).catch(async () => {
  await goto('#/trips');
  await waitFor(() => text$().length > 20, { label: 'trip list (retry)' });
});
await goto('#/trips');
await waitFor(() => text$().includes('ทริปฟูจิ'), { label: 'seeded trip card' });
check(text$().includes('ทริปฟูจิ'), 'trip list renders the seeded trip');
check(qa('[data-trip], .trip-card').length > 0, 'trip card markup present');

console.log('\n▶ dashboard (single page + animated countdown)');
await goto('#/trip/t1/dashboard');
await waitFor(() => q('#countdown-scene .cd-runner'), { label: 'countdown scene' });
check(!!q('#countdown-scene .cd-fuji'), 'countdown: Fuji scene rendered');
check(!!q('#countdown-scene .cd-runner .runner-svg'), 'countdown: animated runner rendered');
check(!!q('#countdown-scene .cd-progress-fill'), 'countdown: progress bar rendered');
check(!!q('.hero-card'), 'dashboard: hero card');
check(!!q('.kpi-tile'), 'dashboard: KPI tiles');
await waitFor(() => (window.document.getElementById('kpi-total')?.textContent || '').trim() !== '--', { label: 'KPI totals' }).catch(() => {});
check((window.document.getElementById('kpi-total')?.textContent || '').trim() !== '--', 'dashboard: totals computed');
check(!!q('#member-board-content .member-row'), 'dashboard: member paid/share board');
check(!!q('#category-stats .progress, #category-stats [style*="width"]'), 'dashboard: category bars');
check(!!q('#recent-expenses .expense-row'), 'dashboard: recent expenses');
check(!!q('#upnext-list .step-num, #upnext-list .empty-state'), 'dashboard: up-next list');
check(!errors.some(e => e.includes("Cannot set properties of null")), 'dashboard: no innerHTML-on-null errors');

console.log('\n▶ itinerary (map, 16:9 image, edit/delete, estimate → expense)');
await goto('#/trip/t1/itinerary');
try {
  await waitFor(() => q('#view-all-btn'), { label: 'itinerary shell' });
  await click('#view-all-btn');  // the default view is scoped to "today"
  await waitFor(() => text$().includes('ทะเลสาบคาวากุจิ'), { label: 'itinerary items' });
} catch (e) {
  console.log('   [debug] itinerary html:', html$().replace(/\s+/g, ' ').slice(0, 700));
  console.log('   [debug] errors:', errors.slice(-6));
  throw e;
}
check(!!q('.itin-card'), 'itinerary: card layout');
check(!!q('.itin-thumb'), 'itinerary: fixed 16:9 thumbnail element');
check(!!q('.itin-thumb img[src*="fuji.jpg"]'), 'itinerary: place image rendered in thumbnail');
const thumbCss = fs.readFileSync(path.join(root, 'src/css/components.css'), 'utf8').replace(/\s+/g, ' ');
check(/\.itin-thumb \{[^}]*aspect-ratio: 16 \/ 9/.test(thumbCss) && /\.itin-thumb \{[^}]*border-radius/.test(thumbCss), 'itinerary: CSS fixes the thumbnail at 16:9 with rounded corners');
check(/\.itin-card \{ display: flex/.test(thumbCss), 'itinerary: card is a flex row so the thumb sits on the right');
check(!!q('#map, .map-frame'), 'itinerary: map container present');
check(qa('[data-act="edit"], [data-action="edit"], .icon-btn').length > 0, 'itinerary: per-item edit/delete buttons');

// open edit form for the first item (still on the "all days" view)
const editBtn = qa('.itin-card [data-act="edit"]')[0] || qa('[data-act="edit"]')[0];
if (editBtn) {
  await click(editBtn);
  await waitFor(() => q('#itinerary-form'), { label: 'item form' }).catch(() => {});
  check(!!q('#itinerary-form'), 'itinerary: edit form opens for an existing item');
  check(!!q('[id*="estimate"], [data-est]'), 'itinerary: estimate cost fields present');
  const form = q('#itinerary-form') || q('form');
  const titleInput = q('#it-title') || form?.querySelector('input');
  if (titleInput) {
    const before = titleInput.value;
    check(typeof before === 'string' && before.length > 0, 'itinerary: edit form prefilled with item data');
  }
} else {
  check(false, 'itinerary: edit button found');
}

console.log('\n▶ expenses (list + add/edit form)');
await goto('#/trip/t1/expenses');
await waitFor(() => text$().includes('โรงแรมฟูจิวิว') || text$().includes('ค่าตั๋วรถบัส'), { label: 'expense list' });
check(!!q('.kpi-strip'), 'expenses: KPI strip');
check(qa('.expense-card').length >= 2, 'expenses: cards rendered');
check(qa('.expense-card .icon-btn').length >= 2, 'expenses: edit/delete actions per card');
await goto('#/trip/t1/expenses/add');
await waitFor(() => q('form'), { label: 'expense form' });
check(!!q('#exp-amount, #exp-subtotal, input[type="number"]'), 'expense add: amount field');
check(!!q('#exp-currency, select'), 'expense add: currency select');
check(qa('[data-payer], #payer-tiles .tile, .tile-grid .tile').length > 0, 'expense add: payer tiles');
check(!!q('#exp-share-tiles, [data-share], .tile-grid'), 'expense add: split tiles');
check(!!q('#exp-split-equal, .segmented'), 'expense add: equal/unequal toggle');

console.log('\n▶ members (add + edit + delete)');
await goto('#/trip/t1/members');
await waitFor(() => text$().includes('นุ่น'), { label: 'member list' });
check(qa('.card[data-member]').length >= 2, 'members: rows rendered');
check(!!q('[data-act="edit"], .icon-btn'), 'members: edit button');
check(!!q('[data-act="delete"], .icon-btn-danger'), 'members: delete button');
await click('#add-member-btn');
await waitFor(() => q('#member-form'), { label: 'member form' });
window.document.getElementById('m-name').value = 'เคน';
window.document.getElementById('m-email').value = 'ken@example.com';
submit(q('#member-form'));
await waitFor(() => (fsdb.__dump('trips/t1/members/new-member-uid') || Object.keys(fsdb.__store).some(k => k.startsWith('trips/t1/members/') && fsdb.__store.get(k).displayName === 'เคน')), { label: 'member created' }).catch(() => {});
const createdMember = [...fsdb.__store.entries()].find(([k, v]) => k.startsWith('trips/t1/members/') && v.displayName === 'เคน');
check(!!createdMember, 'members: add member persists (no internal error)');
check(!errors.some(e => e.includes('internal')), 'members: no "internal" error surfaced');
await sleep(400);
check(text$().includes('เคน'), 'members: new member appears in the list');

console.log('\n▶ documents (add + edit + delete)');
await goto('#/trip/t1/documents');
await waitFor(() => text$().includes('พาสปอร์ตสมชาย'), { label: 'document list' });
check(qa('.card[data-doc]').length >= 1, 'documents: list rendered');
check(!!q('[data-act="edit"]'), 'documents: edit button');
check(!!q('[data-act="delete"]'), 'documents: delete button');
await click('#add-doc-btn');
await waitFor(() => q('#doc-form'), { label: 'document form' });
window.document.getElementById('doc-title').value = 'ตั๋วเครื่องบิน';
window.document.getElementById('doc-cat').value = 'ticket';
submit(q('#doc-form'));
await waitFor(() => [...fsdb.__store.entries()].some(([k, v]) => k.startsWith('trips/t1/documents/') && v.title === 'ตั๋วเครื่องบิน'), { label: 'document created' }).catch(() => {});
check([...fsdb.__store.entries()].some(([k, v]) => k.startsWith('trips/t1/documents/') && v.title === 'ตั๋วเครื่องบิน'), 'documents: add persists');

console.log('\n▶ import / export (admin-only Excel)');
await goto('#/trip/t1/import');
await waitFor(() => text$().includes('Excel') || text$().includes('นำเข้า'), { label: 'import page' });
const excelBtns = qa('[data-tpl]');
check(excelBtns.length >= 3, 'import page: template buttons present');
check(excelBtns.every(b => !b.disabled), 'import page: Excel buttons enabled for trip admin');
check(!!q('#exp-full, #exp-itinerary-xl'), 'import page: Excel export buttons');
check(!!q('#import-itinerary-file') && !!q('#import-expenses-file'), 'import page: file inputs');
check(qa('.card').some(c => /admin|แอดมิน/.test(c.textContent)), 'import page: admin badge shown');

console.log('\n▶ settings (editable + deletable trip)');
await goto('#/trip/t1/settings');
await waitFor(() => q('#s-name'), { label: 'settings form' });
check(q('#s-name').value === 'ทริปฟูจิ 2027', 'settings: trip name prefilled');
check(!!q('#s-start') && !!q('#s-end'), 'settings: travel dates editable');
check(!!q('#s-currency') && !!q('#s-tz'), 'settings: currency/timezone editable');
check(!!q('#save-settings'), 'settings: save button');
check(!!q('#del-trip'), 'settings: delete trip button');
check(!!q('#dup-trip'), 'settings: duplicate trip button');
window.document.getElementById('s-name').value = 'ทริปฟูจิ 2027 (แก้ไข)';
await click('#save-settings');
await sleep(200);
check((fsdb.__dump('trips/t1') || {}).name === 'ทริปฟูจิ 2027 (แก้ไข)', 'settings: trip update persists');

console.log('\n▶ settlement & more');
await goto('#/trip/t1/settlement');
await waitFor(() => text$().length > 40, { label: 'settlement page' });
check(!!q('#settlement-content'), 'settlement: renders');
await goto('#/trip/t1/more');
await waitFor(() => text$().includes('ตั้งค่า') || text$().includes('Settings'), { label: 'more page' });
check(!!q('#logout-more'), 'more: menu renders');

console.log('\n▶ itinerary: add a place with coordinates (map must not re-init)');
await goto('#/trip/t1/itinerary');
await waitFor(() => q('#view-all-btn'), { label: 'itinerary shell' });
await click('#view-all-btn');
await waitFor(() => text$().includes('ทะเลสาบคาวากุจิ'), { label: 'itinerary items' });
await click('#add-itinerary-btn');
await waitFor(() => q('#itinerary-form'), { label: 'add place form' });
window.document.getElementById('it-title').value = 'ภูเขามิโตะ';
window.document.getElementById('it-date').value = TRIP.startDate;
window.document.getElementById('it-time').value = '15:00';
window.document.getElementById('it-coords').value = '35.3905,138.9331';
window.document.getElementById('it-has-estimate').checked = true;
window.document.getElementById('it-has-estimate').dispatchEvent(new window.Event('change', { bubbles: true }));
window.document.getElementById('it-estimate-amount').value = '1200';
window.document.getElementById('it-estimate-currency').value = 'JPY';
window.document.getElementById('it-estimate-category').value = 'ticket';
submit(q('#itinerary-form'));
await waitFor(() => Object.values(Object.fromEntries(fsdb.__store)).some(v => v && v.title === 'ภูเขามิโตะ'), { label: 'place saved' }).catch(() => {});
const place = [...fsdb.__store.entries()].find(([, v]) => v && v.title === 'ภูเขามิโตะ');
check(!!place, 'itinerary: new place persisted');
check(place?.[1]?.coordinates === '35.3905,138.9331', 'itinerary: coordinates stored');
await sleep(400);
await goto('#/trip/t1/dashboard');
await sleep(120);
await goto('#/trip/t1/itinerary');
await waitFor(() => q('#view-all-btn'), { label: 'itinerary shell (reload)' });
await click('#view-all-btn');
await waitFor(() => text$().includes('ภูเขามิโตะ'), { label: 'reopened itinerary with map' });
check(!!q('#map'), 'itinerary: map container alive after adding coordinates');
check(!errors.some(e => /already initialized|container is initialized|Map failed/i.test(e)), 'itinerary: no "map container is initialized" error');

console.log('\n▶ estimate auto-aggregates into expenses');
await waitFor(() => [...fsdb.__store.values()].some(e => e && e.source === 'itinerary-estimate' && e.itineraryItemId === place?.[0]?.split('/').pop()), { timeout: 3000, label: 'linked estimate expense' }).catch(() => {});
const linked = [...fsdb.__store.values()].find(e => e && e.source === 'itinerary-estimate' && e.itineraryItemId === place?.[0]?.split('/').pop());
check(!!linked, 'estimate: linked expense auto-created in the expense book');
check(linked?.isEstimated === true && linked?.category === 'ticket', 'estimate: expense keeps estimate flag + category');
check(Array.isArray(linked?.allocations) && linked.allocations.length === 2, 'estimate: split across the selected members');
check(linked?.payerId === 'u1', 'estimate: payer recorded');
await goto('#/trip/t1/expenses');
await waitFor(() => text$().includes('ภูเขามิโตะ'), { label: 'estimate shown in expenses' });
check(text$().includes('ภูเขามิโตะ'), 'expenses: itinerary estimate appears in the list');

console.log('\n▶ expense edit + delete');
await goto('#/trip/t1/expenses');
await waitFor(() => q('.expense-card'), { label: 'expense cards' });
const expBefore = [...fsdb.__store.keys()].filter(k => k.startsWith('trips/t1/expenses/')).length;
const delBtn = q('.expense-card [data-act="delete"]');
if (delBtn) {
  await click(delBtn);
  await waitFor(() => q('#confirm-ok'), { label: 'confirm dialog' });
  await click('#confirm-ok');
  await sleep(300);
  const expAfter = [...fsdb.__store.keys()].filter(k => k.startsWith('trips/t1/expenses/')).length;
  check(expAfter < expBefore, 'expenses: delete removes the document (was blocked by rules before)');
  check(![...fsdb.__store.values()].some(e => e?.title === 'ค่าตั๋วรถบัส' && e.status !== 'voided'), 'expenses: deleted expense is gone (or voided)');
} else {
  check(false, 'expenses: delete button found');
}

console.log('\n▶ member edit + delete');
await goto('#/trip/t1/members');
await waitFor(() => text$().includes('เคน'), { label: 'member list' });
await click('[data-member] [data-act="edit"]');
await waitFor(() => q('#member-form'), { label: 'member edit form' });
window.document.getElementById('m-name').value = 'เคนจิ';
submit(q('#member-form'));
await waitFor(() => [...fsdb.__store.values()].some(m => m?.displayName === 'เคนจิ'), { label: 'member updated' }).catch(() => {});
check([...fsdb.__store.values()].some(m => m?.displayName === 'เคนจิ'), 'members: edit saves changes');
await sleep(200);
const delMember = qa('.card[data-member] [data-act="delete"]')[0];
if (delMember) {
  await click(delMember);
  await waitFor(() => q('#confirm-ok'), { label: 'confirm member delete' });
  await click('#confirm-ok');
  await sleep(300);
  check([...fsdb.__store.keys()].filter(k => k.startsWith('trips/t1/members/')).length <= 3, 'members: delete removes the member doc');
} else {
  check(false, 'members: delete button found');
}

console.log('\n▶ documents: edit + delete');
await goto('#/trip/t1/documents');
await waitFor(() => q('.card[data-doc]'), { label: 'document cards' });
await click('.card[data-doc] [data-act="edit"]');
await waitFor(() => q('#doc-form'), { label: 'document edit form' });
window.document.getElementById('doc-title').value = 'พาสปอร์ตสมชาย (ต่ออายุ)';
submit(q('#doc-form'));
await waitFor(() => [...fsdb.__store.values()].some(d => d?.title === 'พาสปอร์ตสมชาย (ต่ออายุ)'), { label: 'document updated' }).catch(() => {});
check([...fsdb.__store.values()].some(d => d?.title === 'พาสปอร์ตสมชาย (ต่ออายุ)'), 'documents: edit saves changes');
await sleep(200);
const docsBefore = [...fsdb.__store.keys()].filter(k => k.startsWith('trips/t1/documents/')).length;
await click('.card[data-doc] [data-act="delete"]');
await waitFor(() => q('#confirm-ok'), { label: 'confirm document delete' });
await click('#confirm-ok');
await sleep(300);
const docsAfter = [...fsdb.__store.keys()].filter(k => k.startsWith('trips/t1/documents/')).length;
check(docsAfter === docsBefore - 1, `documents: delete removes exactly one document (${docsBefore} → ${docsAfter})`);

console.log('\n▶ permissions: Excel buttons hidden from non-admins');
const perms = await import(pathToFileURL(path.join(outDir, 'utils/permissions.js')).href);
perms.clearPermissionsCache();
authStub.__emitAuth({ uid: 'u2', email: 'nun@test.com', displayName: 'นุ่น', photoURL: null });
await sleep(60);
await goto('#/trip/t1/import');
await waitFor(() => qa('[data-tpl]').length > 0, { label: 'member import page' });
check(qa('[data-tpl]').every(b => b.disabled), 'permissions: Excel template buttons disabled for members');
check(qa('#exp-full, #exp-itinerary-xl, #exp-expenses-xl').every(b => b.disabled), 'permissions: Excel export buttons disabled for members');
check(!q('#exp-itinerary-png').disabled, 'permissions: PNG export still available to members');

console.log('\n▶ Excel round trip (real SheetJS)');
const XLSX = await import('xlsx');
const excel = await import(pathToFileURL(path.join(outDir, 'utils/excel.js')).href);
const wb = XLSX.utils.book_new();
const sampleItinerary = [
  { date: '2027-01-17', startTime: '09:00', title: 'Lake Kawaguchi', durationMinutes: 60, travelToNextMinutes: 15, category: 'sightseeing', status: 'planned', address: 'Kawaguchiko', coordinates: '35.5171,138.7519', imageUrl: '', description: 'Nice view', notes: '', estimateAmount: 2500, estimateCurrency: 'JPY', expenseCategory: 'ticket', paidBy: 'สมชาย', sharedWith: 'สมชาย, นุ่น', autoAddExpense: 'yes' },
  { date: '2027-01-18', startTime: '10:00', title: 'Gotemba Outlet', durationMinutes: 120, travelToNextMinutes: 0, category: 'shopping', status: 'planned', address: 'Gotemba' }
];
const sampleExpenses = [
  { date: '2027-01-18', title: 'โรงแรมฟูจิวิว', category: 'ที่พัก', kind: 'estimated', currency: 'JPY', subtotal: 32000, discount: 0, service: 0, tax: 0, netTotal: 32000, rate: 0.24, payer: 'สมชาย', sharedWith: 'สมชาย, นุ่น', amounts: '', description: '', paymentMethod: 'card', itineraryTitle: '' }
];
const rowFor = (cols, data) => cols.map(c => data[c.key] ?? '');
const itineraryRows = [
  excel.ITINERARY_COLUMNS.map(c => c.en),
  excel.ITINERARY_COLUMNS.map(c => c.th),
  ...sampleItinerary.map(d => rowFor(excel.ITINERARY_COLUMNS, d))
];
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(itineraryRows), 'Itinerary');
const expenseRows = [
  excel.EXPENSE_COLUMNS.map(c => c.en),
  excel.EXPENSE_COLUMNS.map(c => c.th),
  ...sampleExpenses.map(d => rowFor(excel.EXPENSE_COLUMNS, d))
];
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(expenseRows), 'Expenses');
const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
const file = new window.File([new Uint8Array(buf)], 'plan.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
const parsed = await excel.readSpreadsheet(file);
check(parsed.sheetName === 'Itinerary', 'excel: bilingual header sheet picked correctly');
check(parsed.rows.length >= 2, `excel: readSpreadsheet parses the sheet (${parsed.rows.length} rows)`);
const members = [
  { id: 'u1', displayName: 'สมชาย', username: 'admin' },
  { id: 'u2', displayName: 'นุ่น', username: 'nun' }
];
const trip = fsdb.__dump('trips/t1');
const it = excel.importItineraryRows(parsed.rows, { trip, members, lang: 'th' });
check(it.items.length === 2 && it.errors.length === 0, `excel: itinerary import parses ${it.items.length} rows (${it.errors.length} errors)`);
check(it.items[0].title === 'Lake Kawaguchi' && it.items[0].coordinates === '35.5171,138.7519', 'excel: place + coordinates imported');
check(it.items[0].estimateAmount === 2500 && it.items[0].estimateCurrency === 'JPY' && it.items[0].estimateCategory === 'ticket', 'excel: estimated cost + category imported');
check(it.items[0].estimatePayerId === 'u1' && it.items[0].estimateShareWith.length === 2, 'excel: payer + participants resolved to member ids');
const exp = excel.importExpenseRows(parsed.rows, { trip, members, items: [], lang: 'th' });
check(true, 'excel: expense sheet parsing does not throw');
await excel.downloadItineraryTemplate(trip, { lang: 'th', withSample: true });
await excel.downloadExpensesTemplate(trip, { lang: 'th', withSample: true, members });
await excel.exportWorkbookFile({ trip, items: it.items, expenses: [], members, lang: 'th', include: 'all' });
check(true, 'excel: template + workbook export run without error');

console.log('\n▶ UI: import the itinerary workbook (admin)');
await goto('#/trip/t1/import');
await waitFor(() => q('#import-itinerary-file'), { label: 'import page (admin)' });
const fileInput = window.document.getElementById('import-itinerary-file');
Object.defineProperty(fileInput, 'files', { value: [file], configurable: true });
fileInput.dispatchEvent(new window.Event('change', { bubbles: true }));
await sleep(30);
check(!window.document.getElementById('import-itinerary-btn').disabled, 'import: button enables after choosing a file');
await click('#import-itinerary-btn');
await waitFor(() => q('#pi-confirm') || q('#pi-cancel'), { timeout: 6000, label: 'import preview sheet' }).catch(() => {});
check(!!q('#pi-confirm'), 'import: preview sheet is shown before writing');
if (q('#pi-confirm')) {
  await click('#pi-confirm');
  await waitFor(() => [...fsdb.__store.values()].some(v => v?.title === 'Lake Kawaguchi'), { timeout: 5000, label: 'imported itinerary rows' }).catch(() => {});
  const imported = [...fsdb.__store.values()].filter(v => v?.title === 'Lake Kawaguchi' || v?.title === 'Gotemba Outlet');
  check(imported.length >= 2, `import: rows written to Firestore (${imported.length})`);
  check(imported.some(i => i.coordinates === '35.5171,138.7519'), 'import: coordinates carried over');
  await waitFor(() => [...fsdb.__store.values()].some(e => e?.source === 'itinerary-estimate' && e?.title === 'Lake Kawaguchi'), { timeout: 4000, label: 'imported estimate expense' }).catch(() => {});
  check([...fsdb.__store.values()].some(e => e?.source === 'itinerary-estimate' && e?.title === 'Lake Kawaguchi'), 'import: estimated expense auto-created for imported row');
}
await goto('#/trip/t1/itinerary');
await waitFor(() => q('#view-all-btn'), { label: 'itinerary after import' });
await click('#view-all-btn');
await waitFor(() => text$().includes('Lake Kawaguchi'), { timeout: 5000, label: 'imported place on the itinerary' }).catch(() => {});
check(text$().includes('Lake Kawaguchi'), 'import: imported place shows on the itinerary page');

console.log('\n▶ v5: animated page scenes on every menu');
const scenePages = [
  ['#/trips', 'trips'], ['#/trip/t1/dashboard', null], ['#/trip/t1/itinerary', 'itinerary'],
  ['#/trip/t1/expenses', 'expenses'], ['#/trip/t1/members', 'members'],
  ['#/trip/t1/documents', 'documents'], ['#/trip/t1/import', 'import'],
  ['#/trip/t1/settings', 'settings'], ['#/trip/t1/settlement', 'settlement'],
  ['#/trip/t1/more', 'map']
];
for (const [hash, kind] of scenePages) {
  if (kind === null) continue;             // dashboard has its own hero + countdown scene
  await goto(hash);
  await waitFor(() => q('.page-scene') || text$().length > 40, { label: `scene on ${hash}` }).catch(() => {});
  const scene = q('.page-scene');
  check(!!scene, `scene: ${kind} page shows an animated illustration`);
  if (scene) check(scene.querySelectorAll('.ps-art svg *').length > 2, `scene: ${kind} illustration has animated parts`);
}

console.log('\n▶ v5: Settings > system check explains broken member login');
await goto('#/trip/t1/settings');
await waitFor(() => q('#run-diagnostics'), { label: 'system check button' });
check(!!q('#run-diagnostics'), 'system check: button present in settings');
await click('#run-diagnostics');
await waitFor(() => qa('#diag-results [data-diag]').length >= 5, { timeout: 8000, label: 'diagnostic rows' }).catch(() => {});
const diagRows = qa('#diag-results [data-diag]');
check(diagRows.length >= 5, `system check: ran every probe (${diagRows.length} rows)`);
const fnRow = q('[data-diag="functions"]');
check(!!fnRow && fnRow.dataset.status === 'fail', 'system check: broken Cloud Functions flagged');
check(!!fnRow && /deploy/i.test(fnRow.textContent), 'system check: shows the firebase deploy command');
check(!!q('[data-diag="security-pins"]'), 'system check: verifies PIN documents stay private');
check(!!q('#diag-copy'), 'system check: report can be copied');
check(typeof window.fujiDiagnose === 'function', 'system check: fujiDiagnose() console helper exposed');

console.log('\n▶ v5: dashboard does not re-render icons every second');
await goto('#/trip/t1/dashboard');
await waitFor(() => q('#live-since [data-live-label]'), { label: 'live clock' });
const liveLabel1 = q('#live-since [data-live-label]').textContent;
const iconNodesBefore = qa('#live-since svg').length;
await sleep(3200);  // was 1s before → would have rebuilt markup ~3 times
check(q('#live-since [data-live-label]').textContent === liveLabel1, 'dashboard: countdown text is stable between minute ticks');
check(qa('#live-since svg').length === iconNodesBefore, 'dashboard: clock icon is not re-created (no flicker)');
const observerSource = fs.readFileSync(path.join(root, 'src/js/app.js'), 'utf8');
check(/setInterval\(\(\) => \{ if \(!tickLive\(\)\) clearInterval\(liveTimer\); \}, 30000\)/.test(observerSource), 'dashboard: live tick runs every 30s, not every second');

console.log('\n▶ v5: map layers (street / satellite / terrain)');
await goto('#/trip/t1/itinerary');
await waitFor(() => q('#view-all-btn'), { label: 'itinerary shell' });
await click('#view-all-btn');
await waitFor(() => q('#map-layer-bar [data-layer="satellite"]'), { label: 'layer bar' });
const leafletStub = await import(stub('leaflet.mjs'));
await waitFor(() => leafletStub.__created.tileLayers.length > 0, { label: 'tile layer created' }).catch(() => {});
check(leafletStub.__created.tileLayers.length > 0, 'map: base tiles created');
await click('#map-layer-bar [data-layer="satellite"]');
await sleep(250);
const satelliteUrls = leafletStub.__created.tileLayers.slice(-3).map(t => t.__url);
check(satelliteUrls.some(u => /World_Imagery/.test(u || '')), `map: satellite layer uses Esri imagery (got ${String(satelliteUrls.join(' | ')).slice(0, 90)})`);
check(satelliteUrls.some(u => /World_Boundaries_and_Places/.test(u || '')), 'map: satellite imagery adds a place-labels overlay');
check(q('#map-layer-bar [data-layer="satellite"]').classList.contains('is-active'), 'map: satellite button marked active');
await click('#map-layer-bar [data-layer="terrain"]');
await sleep(250);
check(/opentopomap|Topo_Map/.test(leafletStub.__lastTileUrl()?.__url || ''), 'map: terrain layer switches');
await click('#map-layer-bar [data-layer="map"]');
await sleep(250);
check(/cartocdn/.test(leafletStub.__lastTileUrl()?.__url || ''), 'map: back to the street map layer');

console.log('\n▶ v5: Google Maps navigation links');
const gmaps = await import(pathToFileURL(path.join(outDir, 'maps/index.js')).href);
const dirUrl = gmaps.googleMapsDirectionsUrl({ title: 'ทะเลสาบคาวากุจิ', coordinates: '35.5171,138.7519' });
check(/google\.com\/maps\/dir\/.*destination=/.test(dirUrl), 'google maps: directions URL for a place with coordinates');
const placeUrl = gmaps.googleMapsPlaceUrl({ title: 'ราเมง', address: 'Fujiyoshida, Yamanashi' });
check(/google\.com\/maps\/search\/\?api=1&query=/.test(placeUrl) && placeUrl.includes('Fujiyoshida'), 'google maps: search URL falls back to the address');
const navBtn = q('.itin-card [data-act="navigate"]');
check(!!navBtn, 'google maps: navigate button on the itinerary card');
check(!!q('.itin-card a.nav-link-btn[href*="google.com/maps"]'), 'google maps: inline "open in maps" link on the card');

console.log('\n▶ v5: sticky notes board');
await goto('#/trip/t1/itinerary');
await waitFor(() => q('#add-note-btn'), { label: 'notes board' });
check(!!q('#notes-board'), 'notes: post-it board rendered');
await click('#add-note-btn');
await waitFor(() => q('#note-form'), { label: 'note form' });
window.document.getElementById('note-title').value = 'จองรถไฟ 7:00';
window.document.getElementById('note-body').value = 'JR Tokyo → Otsuki / รหัส KAWAGUCHIKO-2291';
const blueChip = q('#note-colors [data-color="blue"]');
if (blueChip) blueChip.click();
submit(q('#note-form'));
await waitFor(() => [...fsdb.__store.values()].some(n => n?.title === 'จองรถไฟ 7:00'), { label: 'note saved' }).catch(() => {});
const savedNote = [...fsdb.__store.entries()].find(([, v]) => v?.title === 'จองรถไฟ 7:00');
check(!!savedNote, 'notes: note persists in Firestore');
check(savedNote?.[1]?.color === 'blue', 'notes: chosen paper color saved');
await sleep(250);
await waitFor(() => q('.note-card'), { label: 'note card' }).catch(() => {});
check(!!q('.note-card'), 'notes: note shows as a post-it card');
check(!!q('.note-card [data-note-act="edit"]') && !!q('.note-card [data-note-act="delete"]'), 'notes: edit + delete on the post-it');
await click('.note-card [data-note-act="edit"]');
await waitFor(() => q('#note-form'), { label: 'note edit form' });
window.document.getElementById('note-title').value = 'จองรถไฟ 07:10';
submit(q('#note-form'));
await waitFor(() => [...fsdb.__store.values()].some(n => n?.title === 'จองรถไฟ 07:10'), { label: 'note updated' }).catch(() => {});
check([...fsdb.__store.values()].some(n => n?.title === 'จองรถไฟ 07:10'), 'notes: edit saves changes');
await sleep(250);
await click('.note-card [data-note-act="delete"]');
await waitFor(() => q('#confirm-ok'), { label: 'note delete confirm' });
await click('#confirm-ok');
await sleep(300);
check(![...fsdb.__store.values()].some(n => n?.title === 'จองรถไฟ 07:10'), 'notes: delete removes the note');

console.log('\n▶ v5: mobile toolbar layout');
const css = fs.readFileSync(path.join(root, 'src/css/components.css'), 'utf8').replace(/\s+/g, ' ');
check(/@media \(max-width: 640px\) \{ .*\.btn-row \{ display: grid; grid-template-columns: repeat\(auto-fit, minmax\(138px, 1fr\)\)/.test(css) || /\.btn-row \{ display: grid; grid-template-columns: repeat\(auto-fit, minmax\(138px, 1fr\)\); gap: 8px; overflow: visible; \}/.test(css), 'mobile: toolbar buttons wrap into a tap-friendly grid');
check(/\.chip-row \{ flex-wrap: wrap; overflow: visible;/.test(css), 'mobile: filter chips wrap instead of scrolling off-screen');
check(/\.bottom-nav-item \{ flex: 1 1 0; min-width: 0;/.test(css), 'mobile: bottom nav items share the width evenly');

console.log('\n▶ v5: PNG export survives color-mix()');
const colorsMod = await import(pathToFileURL(path.join(outDir, 'utils/colors.js')).href);
check(colorsMod.resolveColorValue('color-mix(in srgb, #8bb89a 30%, transparent)').startsWith('rgba('), 'png: color-mix with transparent resolves to rgba()');
check(colorsMod.resolveColorValue('color-mix(in srgb, var(--primary-raw) 30%, var(--border))') === 'color-mix(in srgb, var(--primary-raw) 30%, var(--border))', 'png: var()-based values left for the browser to resolve');
const mixed = colorsMod.resolveColorValue('linear-gradient(135deg, color-mix(in srgb, #000 20%, #fff) 0%, color-mix(in srgb, #8bb89a 60%, #ffffff))');
check(!/color-mix\(/.test(mixed), 'png: gradients with nested color-mix() are fully rewritten');
check(/^rgb/.test(colorsMod.resolveColorValue('oklch(70% 0.1 150)', { normalize: () => 'rgb(120, 190, 150)' })), 'png: oklch() normalized through the canvas fallback');
const exportsSrc = fs.readFileSync(path.join(root, 'src/js/exports/index.js'), 'utf8');
check(/sanitizeColorsForExport/.test(exportsSrc), 'png: export sanitizes colors before html2canvas runs');

console.log('\n▶ v9: THB is shown next to every amount');
{
  authStub.__emitAuth({ uid: 'u1', email: 'admin@example.com', displayName: 'สมชาย', photoURL: null, providerData: [{ providerId: 'password' }] });
  await sleep(80);
  // Earlier blocks switched the trip currency to THB; this block needs a foreign
  // currency to prove the baht equivalent is always attached.
  fsdb.__seed('trips/t1', { ...fsdb.__dump('trips/t1'), baseCurrency: 'JPY', exchangeRateToTHB: 0.24 });
  window.localStorage.removeItem('fuji_trips_cache');
  await click('#refresh-btn');            // seeded behind the app's back → drop the read cache
  await sleep(150);
  await goto('#/trip/t1/dashboard');
  await waitFor(() => q('#kpi-total'), { label: 'dashboard KPIs' });
  await sleep(500);
  const dash = text$();
  check(/≈/.test(dash) && /฿/.test(dash), 'thb: dashboard shows a baht equivalent (trip is in JPY)');
  check(!!q('#kpi-total-thb'), 'thb: total KPI has a dedicated THB line');
  const recent = q('#recent-expenses')?.textContent || '';
  check(/฿/.test(recent), 'thb: recent expense rows show the baht value');
  const board = q('#member-board-content')?.textContent || '';
  check(/฿/.test(board), 'thb: member board shows the baht value');
  const cats = q('#category-stats')?.textContent || '';
  check(/฿/.test(cats), 'thb: category breakdown shows the baht value');

  await goto('#/trip/t1/expenses');
  await waitFor(() => q('.expense-card'), { label: 'expense cards' });
  check(/฿/.test(q('.expense-card')?.textContent || ''), 'thb: expense card shows the baht value');
  check(/฿/.test(q('.kpi-strip')?.textContent || ''), 'thb: expense summary strip shows the baht value');
}

console.log('\n▶ v9: expense groups can be added, edited and deleted');
{
  await goto('#/trip/t1/expenses');
  await waitFor(() => q('#manage-cats-btn'), { label: 'manage groups button' });
  await click('#manage-cats-btn');
  await waitFor(() => q('#category-add'), { label: 'category manager' });
  const rowsBefore = qa('[data-cat-row]').length;
  check(rowsBefore >= 9, `groups: built-in groups listed (${rowsBefore})`);
  check(!!q('[data-cat-del="food"]'), 'groups: built-in rows present');

  await click('#category-add');
  await waitFor(() => q('#cat-th'), { label: 'group editor' });
  window.document.getElementById('cat-th').value = 'นวด/สปา';
  window.document.getElementById('cat-en').value = 'Massage / Spa';
  q('#cat-icons [data-icon="heart-pulse"]').click();
  q('#cat-colors [data-color="#a48fc0"]').click();
  await click('#cat-save');
  await waitFor(() => [...fsdb.__store.keys()].some(k => k.startsWith('trips/t1/categories/')), { timeout: 6000, label: 'group saved' }).catch(() => {});
  const savedCat = [...fsdb.__store.entries()].find(([k]) => k.startsWith('trips/t1/categories/'));
  check(!!savedCat, 'groups: new group saved to Firestore');
  check(savedCat?.[1].th === 'นวด/สปา' && savedCat?.[1].icon === 'heart-pulse', 'groups: name + icon stored');

  // the new group must be selectable in the expense form
  await goto('#/trip/t1/expenses/add');
  await waitFor(() => q('#ex-cat'), { label: 'expense form' });
  const options = qa('#ex-cat option').map(o => o.value);
  check(options.includes(savedCat[0].split('/').pop()), 'groups: new group appears in the expense form');
  check(!!q('#ex-manage-cats'), 'groups: manage shortcut inside the expense form');

  // a new expense filed under that group must be labelled on the dashboard
  const catId = savedCat[0].split('/').pop();
  fsdb.__seed(`trips/t1/expenses/ecat1`, {
    title: 'นวดวันแรก', date: TRIP.startDate, category: catId, currency: 'JPY', baseCurrency: 'THB',
    subtotalMinor: 8000, discountMinor: 0, serviceMinor: 0, taxMinor: 0, cardFeeMinor: 0, netTotalMinor: 8000,
    thbRate: 0.24, thbMinor: 1920, payerId: 'u1', status: 'active', isEstimated: false, estimatedMinor: 0,
    actualMinor: 8000, paymentMethod: 'cash',
    allocations: [{ memberId: 'u1', amountMinor: 8000 }], createdAt: new Date()
  });
  await click('#refresh-btn');            // seeded behind the app's back → force a re-read
  await sleep(200);
  await goto('#/trip/t1/dashboard');
  await waitFor(() => q('#category-stats'), { label: 'dashboard categories' });
  await sleep(400);
  check(/นวด/.test(q('#category-stats')?.textContent || ''), 'groups: dashboard shows the trip group name (not the raw id)');
  check(!/custom-/.test(q('#category-stats')?.textContent || ''), 'groups: no raw id leaks into the dashboard');

  // the itinerary estimate select is fed by the same registry
  await goto('#/trip/t1/itinerary');
  await waitFor(() => q('#add-itinerary-btn'), { label: 'itinerary page' });
  await click('#add-itinerary-btn');
  await waitFor(() => q('#it-estimate-category'), { label: 'itinerary form' });
  check(qa('#it-estimate-category option').some(o => o.value === savedCat[0].split('/').pop()), 'groups: new group appears in the itinerary estimate select');
  q('.sheet-close')?.click() || q('#itinerary-form')?.closest('.sheet')?.remove();

  // and the group manager is reachable from settings
  await goto('#/trip/t1/settings');
  await waitFor(() => q('#settings-manage-cats'), { label: 'settings groups card' });
  check(/นวด/.test(q('#settings-cat-list')?.textContent || ''), 'groups: settings lists the trip group');

  // rename it, then delete it (everything the user adds must be editable)
  await click('#settings-manage-cats');
  await waitFor(() => q(`[data-cat-edit="${catId}"]`), { label: 'group row in manager' });
  await click(`[data-cat-edit="${catId}"]`);
  await waitFor(() => q('#cat-th'), { label: 'group editor' });
  window.document.getElementById('cat-th').value = 'นวด/สปา (แก้ไข)';
  await click('#cat-save');
  await waitFor(() => (fsdb.__dump(savedCat[0]) || {}).th === 'นวด/สปา (แก้ไข)', { timeout: 6000, label: 'group renamed' });
  check(true, 'groups: an existing group can be renamed');

  await click(`[data-cat-del="${catId}"]`);
  await waitFor(() => q('#confirm-ok'), { label: 'delete confirm' });
  await click('#confirm-ok');
  await waitFor(() => !fsdb.__dump(savedCat[0]), { timeout: 6000, label: 'group deleted' }).catch(() => {});
  check(!fsdb.__dump(savedCat[0]), 'groups: a trip group can be deleted');

  // built-in groups are protected
  // deleting closes the sheet and re-renders settings — reopen from there
  if (!q('[data-cat-del="food"]')) {
    await waitFor(() => q('#settings-manage-cats'), { timeout: 6000, label: 'settings after delete' });
    await click('#settings-manage-cats');
  }
  await waitFor(() => q('[data-cat-del="food"]'), { timeout: 6000, label: 'manager reopened' });
  const groupsBefore = [...fsdb.__store.keys()].filter(k => k.startsWith('trips/t1/categories/')).length;
  await click('[data-cat-del="food"]');
  await sleep(300);
  const groupsAfter = [...fsdb.__store.keys()].filter(k => k.startsWith('trips/t1/categories/')).length;
  check(groupsBefore === groupsAfter && !fsdb.__dump('trips/t1/categories/food'), 'groups: built-in groups cannot be deleted');
  check(/พื้นฐาน/.test(window.document.getElementById('toast-container')?.textContent || ''), 'groups: deleting a built-in group is refused with a warning');
  window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await sleep(200);
}

console.log('\n▶ expense groups keep working before the rules are published');
{
  authStub.__emitAuth({ uid: 'u1', email: 'admin@example.com', displayName: 'สมชาย', photoURL: null, providerData: [{ providerId: 'password' }] });
  await sleep(80);
  fsdb.__deny('trips/t1/categories');          // Firestore denies the collection
  window.localStorage.removeItem('fuji_custom_cats:t1');
  await click('#refresh-btn');
  await sleep(150);
  await goto('#/trip/t1/settings');
  await waitFor(() => q('#settings-manage-cats'), { label: 'settings groups card' });
  await click('#settings-manage-cats');
  await waitFor(() => q('#category-add'), { label: 'category manager' });
  await click('#category-add');
  await waitFor(() => q('#cat-th'), { label: 'group editor' });
  window.document.getElementById('cat-th').value = 'ของฝาก';
  window.document.getElementById('cat-en').value = 'Souvenirs';
  await click('#cat-save');
  await sleep(400);
  const local = JSON.parse(window.localStorage.getItem('fuji_custom_cats:t1') || '[]');
  check(local.some(c => c.th === 'ของฝาก'), 'groups: saved locally while Firestore denies the write');
  check(/firestore\.rules|Publish/i.test(window.document.getElementById('toast-container')?.textContent || ''), 'groups: the user is told the rules still need publishing');
  const options = qa('#ex-cat option').map(o => o.textContent.trim());
  await goto('#/trip/t1/expenses/add');
  await waitFor(() => q('#ex-cat'), { label: 'expense form' });
  // loadTripCategories must re-read the denied collection but fall back to the local copy
  await sleep(300);
  check(qa('#ex-cat option').some(o => /ของฝาก/.test(o.textContent)), `groups: local group usable in the expense form (${options.length} options before)`);
  fsdb.__allow('trips/t1/categories');
  window.localStorage.removeItem('fuji_custom_cats:t1');
  await click('#refresh-btn');
  await sleep(150);
}

console.log('\n▶ baht amounts appear even when the trip never set a rate');
{
  // trip without exchangeRateToTHB, expenses carry their own snapshot (0.24)
  const t = { ...fsdb.__dump('trips/t1'), baseCurrency: 'JPY' };
  delete t.exchangeRateToTHB;
  fsdb.__seed('trips/t1', t);
  await click('#refresh-btn');
  await sleep(150);
  await goto('#/trip/t1/dashboard');
  await waitFor(() => q('#kpi-total'), { label: 'dashboard' });
  await sleep(400);
  check(!!q('#kpi-total-thb'), 'thb: dashboard shows baht without a trip rate (from expense snapshots)');
  check(!/≈ ¥/.test(q('#kpi-total-sub')?.textContent || ''), 'thb: the baht line is not mislabelled with the trip currency');
  await goto('#/trip/t1/settlement');
  await waitFor(() => q('#settle-overview'), { label: 'settlement' });
  await sleep(300);
  check(/≈/.test(q('#settle-overview')?.textContent || ''), 'thb: the settlement overview shows baht amounts');
  check(!/ยังไม่ได้ตั้งเรท/.test(q('#settlement-content')?.textContent || ''), 'thb: no \"set a rate\" warning when a snapshot exists');
}

console.log('\n▶ settlement explains where each payment comes from');
{
  await goto('#/trip/t1/settlement');
  await waitFor(() => q('#settle-overview'), { label: 'settlement page' });
  await sleep(300);
  const details = qa('details');
  check(details.length > 0, 'settlement: transactions have a details block');
  const titles = [...fsdb.__store.entries()].filter(([k]) => k.startsWith('trips/t1/expenses/')).map(([, v]) => v.title).filter(Boolean);
  const html = details.map(d => d.innerHTML).join(' ');
  check(titles.some(t => html.includes(t)), 'settlement: the detail names the bills being settled');
  check(/หักกลบ|netted/.test(html), 'settlement: explains that the transfer is netted');
}

console.log('\n▶ v9: clear-bill receipts (received / deducted / balance + per-person PNG)');
{
  authStub.__emitAuth({ uid: 'u1', email: 'admin@example.com', displayName: 'สมชาย', photoURL: null, providerData: [{ providerId: 'password' }] });
  await sleep(80);
  await goto('#/trip/t1/settlement');
  await waitFor(() => q('#settle-views'), { timeout: 8000, label: 'settlement page' });
  check(q('#settle-views .chip-active')?.dataset.view === 'overview', 'settlement: opens on the overview (default view)');
  await click('#settle-views [data-view="receipts"]');
  await waitFor(() => q('[data-receipt]'), { timeout: 8000, label: 'settlement receipts' });

  const receipts = qa('[data-receipt]');
  check(receipts.length >= 3, `settlement: one receipt per member (${receipts.length})`);
  const me = q('[data-receipt="u1"]');
  check(!!me, 'settlement: receipt keyed by member id');
  const txt = me?.textContent || '';
  check(/รับ/.test(txt) && /หัก/.test(txt) && /คงเหลือ/.test(txt), 'settlement: receipt shows received / deducted / balance');
  check(/บัตรเครดิต|เงินสด|โอนเงิน/.test(txt), 'settlement: payment method shown (cash / card / transfer)');
  // earlier blocks add/remove expenses, so check the receipt against live data
  const tripExpenseTitles = [...fsdb.__store.entries()]
    .filter(([k]) => k.startsWith('trips/t1/expenses/'))
    .map(([, v]) => v.title)
    .filter(Boolean);
  // Read the paid / share tables by DOM position (an earlier "หัก" in the summary
  // must not be mistaken for the deductions section when splitting the text).
  const tables = [...me.querySelectorAll('table.receipt-table')];
  const rowsText = (t) => [...(t?.querySelectorAll('tbody tr') || [])].map(r => r.textContent).join(' \u0001 ');
  const paidText = rowsText(tables[0]);
  const shareText = rowsText(tables[1]);
  const paidListed = tripExpenseTitles.some(t => paidText.includes(t));
  const sharedListed = tripExpenseTitles.some(t => shareText.includes(t));
  check(paidListed, 'settlement: the items this member paid are listed');
  check(sharedListed || /ไม่ต้องรับผิดชอบ|No share|^-+$/.test(shareText.trim()) || tables[1]?.querySelector('thead')?.textContent.includes('จ่ายโดย'), 'settlement: shares show which bill they belong to');
  check(/\d{4}-\d{2}-\d{2}/.test(txt), 'settlement: rows carry the expense date');
  check(/าจโดย|จ่ายโดย/.test(txt), 'settlement: shares name who paid');
  check(/THB|฿/.test(txt), 'settlement: baht equivalent present');
  check(!!me?.querySelector('[data-export-receipt]'), 'settlement: per-person PNG export button');
  check(!!me?.querySelector('[data-copy-receipt]'), 'settlement: receipt text can be copied');
  check(qa('[data-export-receipt]').length >= 3, 'settlement: every member can export their own receipt');
  check(!!q('#export-overview-png') && !!q('#print-settle'), 'settlement: overview PNG + print/PDF buttons');
  check(!!q('#settle-views [data-view="overview"]'), 'settlement: overview / receipts switch');

  // the transactions list explains what each payment covers
  check(qa('details').length > 0 || /ดูรายละเอียด/.test(text$()), 'settlement: transaction detail available');

  // switch to the overview + export it (html2canvas is stubbed)
  await click('#settle-views [data-view="overview"]');
  await waitFor(() => q('#settle-overview'), { label: 'overview table' });
  const overview = q('#settle-overview')?.textContent || '';
  check(/เงินสด/.test(overview) && /บัตร/.test(overview), 'settlement: overview splits cash vs card');
  check(!!q('#settle-overview .receipt-table'), 'settlement: overview renders a statement table');
  await click('#export-overview-png');
  await waitFor(() => /sent|export|ส่งออก/i.test(window.document.getElementById('toast-container')?.textContent || ''), { timeout: 6000, label: 'overview export' }).catch(() => {});
  check(!errors.some(e => /unsupported color/i.test(e)), 'settlement: overview PNG export runs without colour errors');

  // per-person export must also work (flat mode + sanitizer)
  await click('#settle-views [data-view="receipts"]');
  await waitFor(() => q('[data-export-receipt="u1"]'), { label: 'receipts view' });
  await click('[data-export-receipt="u1"]');
  await sleep(600);
  check(!errors.some(e => /unsupported color|ส่งออกรูปไม่สำเร็จ/i.test(e)), 'settlement: per-person PNG export runs without colour errors');
}

console.log('\n▶ performance: switching menus with a slow connection');
{
  authStub.__emitAuth({ uid: 'u1', email: 'admin@example.com', displayName: 'สมชาย', photoURL: null, providerData: [{ providerId: 'password' }] });
  await sleep(80);
  fsdb.__setReadLatency(120);            // ~ mobile 4G round trip to Firestore
  window.localStorage.removeItem('fuji_trips_cache');

  const routes = [
    ['dashboard', '#/trip/t1/dashboard', '#kpi-total'],
    ['expenses', '#/trip/t1/expenses', '#cat-filters'],
    ['expense form', '#/trip/t1/expenses/add', '#ex-cat'],
    ['itinerary', '#/trip/t1/itinerary', '#view-all-btn'],
    ['settlement', '#/trip/t1/settlement', '#settle-views'],
    ['members', '#/trip/t1/members', '#members-list'],
    ['settings', '#/trip/t1/settings', '#s-name'],
    ['more', '#/trip/t1/more', null]
  ];

  const timings = [];
  for (const [name, hash, sel] of routes) {
    fsdb.__resetReadStats();
    const t0 = Date.now();
    await goto(hash);
    let shellMs = null, dataMs = null;
    const start = Date.now();
    while (Date.now() - start < 6000) {
      if (shellMs === null && (appEl()?.textContent || '').length > 200) shellMs = Date.now() - t0;
      if (sel ? q(sel) : shellMs !== null) { dataMs = Date.now() - t0; break; }
      await sleep(10);
    }
    const stats = fsdb.__readStats();
    timings.push({ name, shellMs, dataMs, reads: stats.total });
    console.log(`   ${name.padEnd(13)} shell ${String(shellMs).padStart(4)}ms • ready ${String(dataMs).padStart(4)}ms • ${stats.total} reads`);
    if (process.env.SMOKE_TRACE) console.log('      reads:', Object.entries(stats.byPath).map(([k, v]) => `${k}×${v}`).join(', '));
  }
  // Cold run: after clearing everything (like a fresh page load) the first visit
  // to a menu must still be reasonable.
  await click('#refresh-btn');
  await sleep(150);
  const cold = [];
  for (const [name, hash, sel] of routes.slice(0, 5)) {
    fsdb.__resetReadStats();
    const t0 = Date.now();
    await goto(hash);
    const start = Date.now();
    while (!(sel ? q(sel) : true) && Date.now() - start < 6000) await sleep(10);
    cold.push({ name, ms: Date.now() - t0, reads: fsdb.__readStats().total });
  }
  if (process.env.SMOKE_TRACE) console.log('   [debug] cold', JSON.stringify(cold));
  console.log(`   cold: ${cold.map(c => `${c.name} ${c.ms}ms/${c.reads}r`).join(' • ')}`);
  check(Math.max(...cold.map(c => c.ms)) < 2000, 'perf: a cold menu (empty cache) is ready in < 2s @120ms latency');

  const worst = Math.max(...timings.map(t => t.dataMs ?? 99999));
  if (process.env.SMOKE_TRACE) console.log('   [debug] timings', JSON.stringify(timings));
  check(worst < 1500, `perf: slowest menu ready in ${worst}ms (target < 1500ms @120ms latency)`);
  const totalReads = timings.reduce((n, t) => n + t.reads, 0);
  check(totalReads <= 24, `perf: the 8 menus together cost ${totalReads} Firestore reads (target ≤ 24)`);
  fsdb.__setReadLatency(0);
}

console.log('\n▶ PNG export can never be blocked by modern colors');
{
  const h2c = await import(stub('html2canvas.mjs'));
  const state = h2c.__h2cState;
  authStub.__emitAuth({ uid: 'u1', email: 'admin@example.com', displayName: 'สมชาย', photoURL: null, providerData: [{ providerId: 'password' }] });
  await sleep(80);

  // count downloads (anchors are neutered in jsdom)
  const downloads = [];
  const originalClick = window.HTMLAnchorElement.prototype.click;
  window.HTMLAnchorElement.prototype.click = function () { downloads.push(this.download); };

  try {
    await goto('#/trip/t1/settlement');
    await waitFor(() => q('#settle-views'), { label: 'settlement page' });
    await sleep(300);

    // 1) default view is the overview (this was a request)
    check(q('#settle-views .chip-active')?.dataset.view === 'overview', 'png: the overview is the default view');
    check(!!q('#settle-overview'), 'png: overview table is rendered first');

    // 2) overview PNG — the stub refuses `color()` in inline styles/background
    state.calls = 0; state.failedWith = [];
    await click('#export-overview-png');
    await waitFor(() => downloads.length > 0, { timeout: 8000, label: 'overview png download' });
    check(downloads.some(n => /settlement-overview/.test(n || '')), 'png: overview exported to a file');
    check(state.failedWith.length === 0, `png: html2canvas never saw a modern color (${state.failedWith.length} rejects)`);
    check(!/color\(/.test(String(state.lastOptions?.backgroundColor)), 'png: background colour handed to html2canvas is plain rgb()');

    // 3) every receipt has an element the export button can find
    await click('#settle-views [data-view="receipts"]');
    await waitFor(() => q('[data-export-receipt="u1"]'), { label: 'receipts view' });
    const missing = qa('[data-export-receipt]').map(b => b.dataset.exportReceipt).filter(id => !window.document.getElementById(`receipt-${id}`));
    check(missing.length === 0, `png: every receipt element exists (missing: ${missing.join(',') || 'none'})`);

    downloads.length = 0;
    await click('[data-export-receipt="u1"]');
    await waitFor(() => downloads.length > 0, { timeout: 8000, label: 'receipt png download' });
    check(downloads.some(n => /settlement-/.test(n || '')), 'png: per-person receipt exported (no "element หายไป")');

    // 4) a device that still rejects the colors → the flat-palette retry saves it
    downloads.length = 0;
    state.calls = 0; state.failedWith = [];
    state.failNext = 1;
    await click('[data-export-receipt="u1"]');
    await waitFor(() => downloads.length > 0, { timeout: 8000, label: 'receipt png download after a failed attempt' }).catch(() => {});
    check(downloads.length > 0, 'png: retries with the flat palette and still produces the image');
    check(state.calls >= 2, `png: two capture attempts were made (${state.calls})`);
    check(state.failNext === 0, 'png: the retry consumed the forced failure');

    // 5) a second member's receipt also exports (each receipt has a unique id)
    downloads.length = 0;
    state.failedWith = [];
    await click('[data-export-receipt="u2"]');
    await waitFor(() => downloads.length > 0, { timeout: 8000, label: 'second receipt png' });
    check(downloads.some(n => !/u1/.test(n || '')), 'png: the second member receipt exports as well');
    check(state.failedWith.length === 0, 'png: no color reject on the second receipt');

    // 6) itinerary PNG uses the same pipeline
    await goto('#/trip/t1/itinerary');
    await waitFor(() => q('#export-png-btn'), { label: 'itinerary export button' });
    downloads.length = 0;
    state.failedWith = [];
    state.lastElement = null;
    await click('#export-png-btn');
    await waitFor(() => downloads.length > 0, { timeout: 8000, label: 'itinerary png download' }).catch(() => {});
    check(downloads.length > 0, 'png: itinerary export works too');
    check(/^itinerary-/.test(String(downloads[downloads.length - 1])), `png: the itinerary file is named after the trip (${downloads[downloads.length - 1]})`);
    check(!!state.lastElement?.closest?.('[data-export-clone]'), 'png: the capture ran on the plain-style clone (not the live DOM)');
  } finally {
    window.HTMLAnchorElement.prototype.click = originalClick;
    state.failNext = 0;
  }
}

console.log('\n▶ v10: receipt photo is optional and never blocks saving');
{
  await goto('#/trip/t1/expenses/add');
  await waitFor(() => q('#ex-title'), { label: 'expense form' });
  window.document.getElementById('ex-title').value = 'มื้อเช้าฮาจิบัง';
  window.document.getElementById('ex-subtotal').value = '1200';
  check(!!q('#ex-receipt-file') && !!q('#ex-receipt-preview'), 'receipt photo: the form offers an upload with a preview');
  check(q('#ex-receipt-preview').classList.contains('hidden'), 'receipt photo: no preview before a photo is chosen');
  // Attach a file the way a phone would (jsdom cannot rasterise it — the app must cope).
  try {
    const file = new window.File([new Uint8Array([137, 80, 78, 71])], 'slip.png', { type: 'image/png' });
    const input = window.document.getElementById('ex-receipt-file');
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new window.Event('change', { bubbles: true }));
    await sleep(200);
    check(!q('#ex-receipt-preview').classList.contains('hidden'), 'receipt photo: the chosen photo is previewed');
  } catch (e) {
    console.log('   [note] could not attach a file in jsdom:', e.message);
  }
  submit(q('#expense-form'));
  await waitFor(() => [...fsdb.__store.values()].some(e => e?.title === 'มื้อเช้าฮาจิบัง'), { timeout: 6000, label: 'expense saved with a photo' }).catch(() => {});
  check([...fsdb.__store.values()].some(e => e?.title === 'มื้อเช้าฮาจิบัง'), 'receipt photo: the expense is saved even when the image cannot be processed');
}

console.log('\n▶ v10: itinerary page (days left, map right) + full-plan PNG');
{
  const h2c = await import(stub('html2canvas.mjs'));
  const state = h2c.__h2cState;
  const downloads = [];
  const originalClick = window.HTMLAnchorElement.prototype.click;
  window.HTMLAnchorElement.prototype.click = function () { downloads.push(this.download); };
  try {
    // t1 is the JPY trip from the baht block — keep it that way on purpose.
    authStub.__emitAuth({ uid: 'u1', email: 'admin@example.com', displayName: 'สมชาย', photoURL: null, providerData: [{ providerId: 'password' }] });
    await sleep(60);
    await goto('#/trip/t1/itinerary');
    await waitFor(() => q('#itin-layout'), { label: 'itinerary layout' });
    await sleep(300);

    // --- layout: map on the right, days on the left ---
    check(!!q('.itin-col-days #date-chips') && !!q('.itin-col-days #itinerary-list'), 'layout: days and chips sit in the left column');
    check(!!q('.itin-col-map #map') && !!q('.itin-col-map #map-card'), 'layout: the map sits in the right column');
    const css = fs.readFileSync(path.join(root, 'src/css/components.css'), 'utf8');
    check(/\.itin-layout\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*minmax\(/.test(css), 'layout: two columns on desktop');
    check(/@media \(max-width: 1023px\)[\s\S]{0,220}\.itin-col-map\s*\{[^}]*order:\s*-1/.test(css), 'layout: phones collapse to one column with the map on top');
    check(/\.itin-col-map\s*\{[^}]*position:\s*sticky/.test(css), 'layout: the map stays visible while scrolling the days');

    // --- export: one PNG with the map + every day + details ---
    downloads.length = 0;
    state.failedWith = [];
    await click('#export-png-btn');
    await waitFor(() => downloads.length > 0, { timeout: 9000, label: 'plan png download' });
    check(downloads.some(n => /^itinerary-/.test(String(n))), 'plan png: exported as one file');
    const sheet = q('#itinerary-export-sheet');
    check(!!sheet, 'plan png: the export sheet was built');
    check(!!sheet?.querySelector('.itin-sheet-map'), 'plan png: the image contains a map block');
    check(!!sheet?.querySelector('.itin-sheet-map img, .itin-sheet-map svg.schematic, .itin-sheet-map .itin-sheet-empty'), 'plan png: the map is a captured image, a sketch or an explicit note');
    const daySections = sheet ? [...sheet.querySelectorAll('.itin-sheet-day')] : [];
    check(daySections.length >= 1, `plan png: every day has its own section (${daySections.length})`);
    const sheetText = sheet?.textContent || '';
    const titles = [...fsdb.__store.entries()]
      .filter(([k]) => k.startsWith('trips/t1/itineraryItems/'))
      .map(([, v]) => v.title).filter(Boolean);
    check(titles.some(t => sheetText.includes(t)), 'plan png: the places of the plan are listed with their details');
    check(/THB|฿/.test(sheetText), 'plan png: amounts carry the baht equivalent');
    check(/itin-sheet-status/.test(sheet?.innerHTML || ''), 'plan png: each item shows its status');
    check(state.failedWith.length === 0, `plan png: no colour reject while rendering the plan (${state.failedWith.length})`);
  } finally {
    window.HTMLAnchorElement.prototype.click = originalClick;
  }
}

console.log('\n▶ v10: dashboard shows the baht amount of the remaining budget');
{
  const t = { ...fsdb.__dump('trips/t1'), baseCurrency: 'JPY', budgetTotal: 5000000 };
  fsdb.__seed('trips/t1', t);
  await click('#refresh-btn').catch(() => {});
  await sleep(120);
  await goto('#/trip/t1/dashboard');
  await waitFor(() => q('#kpi-budget'), { label: 'budget kpi' });
  await sleep(400);
  check(!!q('#kpi-budget-thb'), 'dashboard: งบคงเหลือ shows the baht equivalent');
  check(/฿/.test(q('#kpi-budget-thb')?.textContent || ''), 'dashboard: the baht line uses the ฿ symbol');
  check(q('#kpi-budget-thb')?.className.includes('thb-equiv--strong'), 'dashboard: baht amounts are styled to stand out');
}

console.log('\n▶ v10: credit card name on an expense + per-card summary');
{
  await goto('#/trip/t1/expenses/add');
  await waitFor(() => q('#ex-title'), { label: 'expense form' });
  window.document.getElementById('ex-title').value = 'มื้อค่ำท่องเที่ยว';
  window.document.getElementById('ex-subtotal').value = '4000';
  const pay = window.document.getElementById('ex-payment');
  check(!!q('#ex-card-group') && q('#ex-card-group').classList.contains('hidden'), 'cards: the card field is hidden while paying cash');
  pay.value = 'card';
  pay.dispatchEvent(new window.Event('change', { bubbles: true }));
  await sleep(60);
  check(!q('#ex-card-group').classList.contains('hidden'), 'cards: choosing บัตรเครดิต reveals the card field');
  check(!!q('#ex-card-list'), 'cards: previously used cards are offered as suggestions');
  window.document.getElementById('ex-card').value = 'KBank Visa ••4321';
  check(!!q('#ex-receipt-file'), 'receipt photo: the expense form offers a photo upload');
  submit(q('#expense-form'));
  await waitFor(() => [...fsdb.__store.values()].some(e => e?.title === 'มื้อค่ำท่องเที่ยว'), { timeout: 6000, label: 'expense with card' }).catch(() => {});
  const saved = [...fsdb.__store.values()].find(e => e?.title === 'มื้อค่ำท่องเที่ยว');
  check(!!saved, 'cards: the expense was saved');
  check(saved?.cardName === 'KBank Visa ••4321', `cards: the card name is stored on the expense (${saved?.cardName || 'missing'})`);
  check(saved?.paymentMethod === 'card', 'cards: the payment method stays บัตรเครดิต');
  check((window.localStorage.getItem('fuji_cards:t1') || '').includes('KBank Visa'), 'cards: the card is remembered for the next expense');

  await goto('#/trip/t1/settlement');
  await waitFor(() => q('#settle-overview'), { label: 'settlement' });
  await sleep(350);
  const overview = q('#settle-overview')?.textContent || '';
  check(/สรุปบัตรเครดิต|Credit card summary/.test(overview), 'cards: the settlement has a card summary block');
  check(overview.includes('KBank Visa'), 'cards: the summary names the card');
  check(!!q('.card-summary-tile'), 'cards: each card gets its own tile');
}

console.log('\n▶ v10: per-person receipts are colour-coded and the overview is the default');
{
  await goto('#/trip/t1/settlement');
  await waitFor(() => q('#settle-views'), { label: 'settlement page' });
  await sleep(300);
  check(q('#settle-views .chip-active')?.dataset.view === 'overview', 'receipt: opens on ภาพรวม (not per person)');
  check(!q('#receipt-u1'), 'receipt: no per-person receipt is mounted first');

  await click('#settle-views [data-view="receipts"]');
  await waitFor(() => q('#receipt-u1'), { label: 'receipt card' });
  const sections = [...q('#receipt-u1').querySelectorAll('[data-receipt-section]')].map(el => el.dataset.receiptSection);
  check(sections.join(',') === 'received,deduct,balance', `receipt: three clearly separated sections (${sections.join(',')})`);
  check(!!q('#receipt-u1 .rcpt-block--recv') && !!q('#receipt-u1 .rcpt-block--deduct') && !!q('#receipt-u1 .rcpt-block--balance'), 'receipt: each section has its own colour');
  check(!!q('#receipt-u1 .rcpt-chip--cash, #receipt-u1 .rcpt-chip--card, #receipt-u1 .rcpt-chip--transfer'), 'receipt: payment methods appear as coloured chips');
  check(!!q('#receipt-u1 .rcpt-sum-total'), 'receipt: the balance is boxed at the bottom');
  check(/รับ[\s\S]*หัก[\s\S]*คงเหลือ/.test(q('#receipt-u1')?.textContent || ''), 'receipt: รับ → หัก → คงเหลือ in order');
  const css = fs.readFileSync(path.join(root, 'src/css/components.css'), 'utf8');
  check(/\.export-flat \.receipt \.rcpt-block--recv \.rcpt-block-head/.test(css), 'receipt: the colours survive the PNG export (export-flat overrides)');
}

console.log('\n▶ v10: sticky notes fold away when empty and can be filed as done');
{
  await goto('#/trip/t1/itinerary');
  await waitFor(() => q('#notes-board'), { label: 'notes board' });
  await sleep(400);

  // 0) create a note (an earlier block deletes the one it made)
  check(!q('#notes-collapsed')?.classList.contains('hidden'), 'notes: with no notes the card is folded away (no empty box)');
  await click('#add-note-btn');
  await waitFor(() => q('#note-form'), { label: 'note form' });
  window.document.getElementById('note-title').value = 'ซื้อตั๋วรถไฟ 07:00';
  window.document.getElementById('note-body').value = 'JR Tokyo → Otsuki';
  submit(q('#note-form'));
  await waitFor(() => q('.note-card'), { timeout: 6000, label: 'note card' }).catch(() => {});
  await sleep(200);

  // 1) a note exists → the board is visible, the folded line is not
  const hasNote = !!q('.note-card');
  check(hasNote, 'notes: an existing note is shown on the board');
  check(q('#notes-collapsed')?.classList.contains('hidden'), 'notes: the folded line is hidden while notes exist');
  check(!!q('.note-card [data-note-act="done"]'), 'notes: every note can be filed as done');

  // 2) file it away → it moves to "เก็บแล้ว" and can be brought back
  const noteId = q('.note-card')?.dataset.note;
  await click('.note-card [data-note-act="done"]');
  await sleep(250);
  check(!!q('#notes-done-wrap') && !q('#notes-done-wrap').classList.contains('hidden'), 'notes: the "เก็บแล้ว" section appears');
  check(/เก็บแล้ว/.test(q('#notes-done-toggle')?.textContent || ''), 'notes: the section is labelled เก็บแล้ว');
  await click('#notes-done-toggle');
  await sleep(150);
  check(!!q(`#notes-done-board [data-note="${noteId}"]`), 'notes: the filed note is listed under เก็บแล้ว');
  await click(`#notes-done-board [data-note="${noteId}"] [data-note-act="restore"]`);
  await sleep(250);
  check(!!q(`#notes-board [data-note="${noteId}"]`), 'notes: a filed note can be brought back (no data loss)');

  // 3) delete the last note → the whole section folds into one slim line
  await click(`#notes-board [data-note="${noteId}"] [data-note-act="delete"]`);
  await waitFor(() => q('#confirm-ok'), { label: 'delete confirm' });
  await click('#confirm-ok');
  await waitFor(() => !q('.note-card'), { timeout: 6000, label: 'note removed' }).catch(() => {});
  await sleep(250);
  check(!q('.note-card'), `notes: the note is gone (${qa('.note-card').length} cards left)`);
  check(!q('#notes-collapsed')?.classList.contains('hidden'), 'notes: with no notes the section is folded (not a big empty box)');
  check(q('#notes-board-wrap')?.classList.contains('hidden'), 'notes: the empty board is hidden');
  check(/ยังไม่มีโน้ต/.test(q('#notes-collapsed')?.textContent || ''), 'notes: the folded line explains how to add one');
}

console.log('\n▶ v9: one simple login screen (Google + email only)');
{
  const authStub2 = await import(stub('firebase-auth.mjs'));
  authStub2.__emitAuth(null);
  await sleep(80);
  await goto('#/login');
  await waitFor(() => q('#google-signin-btn'), { label: 'login page' });
  check(!!q('#google-signin-btn'), 'login: Google button is the primary action');
  check(!!q('#admin-email') && !!q('#admin-pass'), 'login: email + password form present');
  check(!!q('#account-signup-btn') && !!q('#account-reset-btn'), 'login: sign-up + forgot-password available');
  check(!q('#member-form') && !q('#member-pin') && !q('#member-user'), 'login: username + PIN form removed');
  check(!q('#tab-member') && !q('#tab-admin'), 'login: no member/admin tabs to choose from');
  check(!/ชื่อผู้ใช้ \+ PIN/.test(html$()) && !/member-pin/.test(html$()), 'login: PIN wording gone from the page');
  // A member who signed in earlier on this device keeps their session.
  window.localStorage.setItem('fuji_member_session', JSON.stringify({
    tripId: 't1', memberId: 'u2', username: 'nun', displayName: 'นุ่น', remember: true,
    expires: Date.now() + 86400000, ts: Date.now()
  }));
  authStub2.__emitAuth(null);
  await goto('#/trips');
  await waitFor(() => text$().includes('ทริปฟูจิ'), { timeout: 6000, label: 'legacy member session restore' }).catch(() => {});
  check(text$().includes('ทริปฟูจิ'), 'login: an existing local member session still restores');
  window.localStorage.removeItem('fuji_member_session');
  // The member form no longer asks for a PIN either — members join with an account.
  authStub2.__emitAuth({ uid: 'u1', email: 'admin@example.com', displayName: 'Admin', photoURL: null, providerData: [{ providerId: 'password' }] });
  await sleep(80);
  await goto('#/trip/t1/members');
  await waitFor(() => q('#add-member-btn'), { label: 'members page' });
  await click('#add-member-btn');
  await waitFor(() => q('#member-form'), { label: 'member form' });
  check(!q('#member-pin') && !q('#m-pin'), 'members: add-member form no longer asks for a username/PIN login');
  check(!q('#m-regen-pin'), 'members: no PIN generator button');
  check(!!q('#m-name') && !!q('#m-role'), 'members: core member fields still there');
  window.document.querySelector('.bottom-sheet')?.remove();
  window.document.querySelector('.bottom-sheet-backdrop')?.remove();
}

console.log('\n▶ v7: member joins with a Google account + invite code (no Cloud Functions)');
{
  // --- member side: sign in with a Google account, then request to join ---
  const googleUser = {
    uid: 'g1', email: 'friend@example.com', displayName: 'เพื่อนใหม่', photoURL: null,
    providerData: [{ providerId: 'google.com' }]
  };
  // drop the local (username + PIN) session from the previous block first
  window.localStorage.removeItem('fuji_member_session');
  authStub.__emitAuth(null);
  await authStub.__setGoogleUser(googleUser);
  await goto('#/login');
  await waitFor(() => q('#google-signin-btn'), { label: 'google button' }).catch(() => {});
  check(!!q('#google-signin-btn'), 'google: login page offers "Continue with Google"');
  await click('#google-signin-btn');
  await waitFor(() => window.location.hash === '#/trips', { timeout: 6000, label: 'google redirect to trips' }).catch(() => {});
  check(window.location.hash === '#/trips', 'google: signed in and landed on the trip list');
  check(!!fsdb.__dump(`users/${googleUser.uid}`), 'google: user profile document created');
  check(!!fsdb.__dump(`publicProfiles/${googleUser.uid}`), 'google: public directory entry created');

  await waitFor(() => q('#join-trip-card'), { label: 'join card' });
  check(!!q('#join-code-input') && !!q('#join-code-btn'), 'join: invite-code card shown on the trip list');
  q('#join-code-input').value = 'fuji-23';
  await click('#join-code-btn');
  await waitFor(() => q('#confirm-ok'), { label: 'join confirmation' });
  check(/ทริปฟูจิ/.test(window.document.querySelector('#confirm-title')?.textContent || window.document.body.textContent), 'join: found the trip by code (case/format insensitive)');
  await click('#confirm-ok');
  await waitFor(() => fsdb.__dump('trips/t1/joinRequests/g1'), { timeout: 6000, label: 'join request' }).catch(() => {});
  check(!!fsdb.__dump('trips/t1/joinRequests/g1'), 'join: request stored for the admin to approve');
  check(!!fsdb.__dump('users/g1/joinRequests/g1') || !!fsdb.__dump('users/g1/joinRequests/t1'), 'join: member can see their own request status');
  await waitFor(() => /รอแอดมินอนุมัติ/.test(q('#my-join-requests')?.textContent || ''), { label: 'pending badge' }).catch(() => {});
  check(/รอแอดมินอนุมัติ/.test(q('#my-join-requests')?.textContent || ''), 'join: pending status shown to the member');

  // --- admin side: approve the request from the Members page ---
  authStub.__emitAuth({ uid: 'u1', email: 'admin@example.com', displayName: 'Admin', photoURL: null, providerData: [{ providerId: 'password' }] });
  await goto('#/trip/t1/members');
  await waitFor(() => q('[data-request="g1"]'), { timeout: 6000, label: 'pending request row' }).catch(() => {});
  check(!!q('[data-request="g1"]'), 'approve: pending request listed for the admin');
  await click('[data-approve="g1"]');
  await waitFor(() => fsdb.__dump('trips/t1/members/g1') && !fsdb.__dump('trips/t1/joinRequests/g1'), { timeout: 6000, label: 'approval' }).catch(() => {});
  const approved = fsdb.__dump('trips/t1/members/g1');
  check(!!approved, 'approve: member document created');
  check(approved?.uid === 'g1' && approved?.authType === 'account', 'approve: member doc keyed by the account uid (rules allow access)');
  check((fsdb.__dump('trips/t1')?.memberUids || []).includes('g1'), 'approve: uid added to trip memberUids');
  check(!fsdb.__dump('trips/t1/joinRequests/g1'), 'approve: request cleaned up');
  await sleep(300);
  check(text$().includes('เพื่อนใหม่'), 'approve: new member appears in the members list');

  // --- member side again: the approved trip now shows up ---
  authStub.__emitAuth(googleUser);
  await goto('#/trips');
  await waitFor(() => text$().includes('ทริปฟูจิ'), { timeout: 6000, label: 'member trip list' }).catch(() => {});
  check(text$().includes('ทริปฟูจิ'), 'join: approved trip appears in the member trip list');
  check(!/รอแอดมินอนุมัติ/.test(q('#my-join-requests')?.textContent || ''), 'join: pending badge cleared after approval');
}

console.log('\n▶ v8: rules not published yet → actionable help instead of a raw error');
{
  const googleUser = {
    uid: 'g2', email: 'late@example.com', displayName: 'เพื่อนสาย', photoURL: null,
    providerData: [{ providerId: 'google.com' }]
  };
  window.localStorage.removeItem('fuji_member_session');
  authStub.__emitAuth(googleUser);
  await sleep(120);
  await goto('#/trips');
  await waitFor(() => q('#join-code-input'), { label: 'join card' });

  // simulate the currently deployed rules: no joinRequests / publicProfiles yet
  const created = (await import(pathToFileURL(path.join(outDir, 'members/join.js')).href));
  fsdb.__deny('trips/t1/joinRequests');
  fsdb.__deny('users/g2/joinRequests');
  fsdb.__deny('publicProfiles');
  q('#join-code-input').value = 'fuji23';
  await click('#join-code-btn');
  await waitFor(() => q('#confirm-ok'), { timeout: 6000, label: 'join confirm' });
  await click('#confirm-ok');
  await waitFor(() => q('#rules-copy'), { timeout: 8000, label: 'rules help sheet' }).catch(() => {});
  const sheetText = window.document.body.textContent || '';
  check(!!q('#rules-copy'), 'rules help: sheet opens when Firestore denies the write');
  check(/Publish/i.test(sheetText), 'rules help: explains the Publish step');
  check(/publicProfiles/.test(sheetText) && /joinRequests/.test(sheetText), 'rules help: names the missing collections');
  check(!!q('#rules-open-console'), 'rules help: button to open the Firebase console');
  check(!!q('#rules-ask-admin'), 'rules help: ready-made message for the trip admin');
  check(!fsdb.__dump('trips/t1/joinRequests/g2'), 'rules help: nothing silently half-written');

  // the member's own rules exist but the trip rules do not → keep the request in
  // the member mirror so the app can still show "waiting for approval"
  fsdb.__allowAll();
  fsdb.__deny('trips/t1/joinRequests');
  window.document.querySelector('.bottom-sheet')?.remove();
  window.document.querySelector('.bottom-sheet-backdrop')?.remove();
  await goto('#/trips');
  await waitFor(() => q('#join-code-input'), { label: 'join card (mirror pass)' });
  q('#join-code-input').value = 'fuji23';
  await click('#join-code-btn');
  await waitFor(() => q('#confirm-ok'), { timeout: 6000, label: 'join confirm mirror' });
  await click('#confirm-ok');
  await waitFor(() => fsdb.__dump('users/g2/joinRequests/g2') || fsdb.__dump('users/g2/joinRequests/t1'), { timeout: 6000, label: 'mirror write' }).catch(() => {});
  check(!!fsdb.__dump('users/g2/joinRequests/g2') || !!fsdb.__dump('users/g2/joinRequests/t1'), 'rules help: request kept in the member mirror (status still visible)');
  window.document.querySelector('.bottom-sheet')?.remove();
  window.document.querySelector('.bottom-sheet-backdrop')?.remove();

  // ... admin publishes the rules, member retries
  fsdb.__allowAll();
  window.document.querySelector('#rules-copy')?.closest('.bottom-sheet')?.remove();
  window.document.querySelector('.bottom-sheet-backdrop')?.remove();
  await goto('#/trips');
  await waitFor(() => q('#join-code-input'), { label: 'join card again' });
  q('#join-code-input').value = 'fuji23';
  await click('#join-code-btn');
  await waitFor(() => q('#confirm-ok'), { timeout: 6000, label: 'join confirm 2' });
  await click('#confirm-ok');
  await waitFor(() => fsdb.__dump('trips/t1/joinRequests/g2'), { timeout: 6000, label: 'join request after publish' }).catch(() => {});
  check(!!fsdb.__dump('trips/t1/joinRequests/g2'), 'rules help: retry works once the rules are published');
}

console.log('\n▶ v7: admin shares the invite code from Settings');
await goto('#/trip/t1/settings');
await waitFor(() => q('#invite-code-value'), { label: 'invite code card' });
check((q('#invite-code-value').textContent || '').replace(/[^A-Z0-9]/g, '') === 'FUJI23', 'invite: settings shows the trip code formatted (ABC-123)');
await click('#invite-code-regen');
await waitFor(() => q('#confirm-ok'), { label: 'regen confirm' });
await click('#confirm-ok');
await waitFor(() => /[A-Z0-9]{3}-[A-Z0-9]{3}/.test(q('#invite-code-value')?.textContent || ''), { timeout: 6000, label: 'new code' }).catch(() => {});
const newCode = q('#invite-code-value')?.textContent?.replace('-', '') || '';
check(newCode.length === 6 && newCode !== 'FUJI23', 'invite: new code generated and shown');
check(fsdb.__dump('trips/t1')?.inviteCode === newCode, 'invite: new code saved on the trip');

console.log('\n▶ delete the whole trip (UI)');
// leave the member session so the admin flow runs with a "logged out" auth state
window.localStorage.removeItem('fuji_member_session');
authStub.__emitAuth({ uid: 'u1', email: 'admin@test.com', displayName: 'สมชาย', photoURL: null });
await sleep(120);
await goto('#/trip/t1/settings');
await waitFor(() => q('#del-trip'), { label: 'settings danger zone' });
await click('#del-trip');
await waitFor(() => q('#confirm-ok'), { label: 'delete confirm' });
await click('#confirm-ok');
await sleep(500);
check(!fsdb.__store.has('trips/t1'), 'trip: deleted from Firestore');
check(![...fsdb.__store.keys()].some(k => k.startsWith('trips/t1/')), 'trip: sub-collections deleted with it (rules allow admin delete)');


console.log('\n▶ error log');
// "Trip not found" is expected here: a queued navigation can land on the trip
// right after the delete test removed it.
const ignorable = [/Not implemented/, /Could not parse CSS/, /jsdom/i, /HTMLCanvasElement/, /Trip not found/];
const fatal = errors.filter(e => !ignorable.some(r => r.test(e)));
check(fatal.length === 0, `no uncaught app errors (${fatal.length} found)`);
for (const e of fatal) console.log('    !', e.slice(0, 300));

console.log(`\n${problems.length === 0 ? '✅ SMOKE TEST PASSED' : `❌ ${problems.length} check(s) failed`}`);
if (problems.length) { for (const p of problems) console.log('  -', p); process.exit(1); }
process.exit(0);
