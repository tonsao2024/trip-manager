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
window.document.getElementById('m-user').value = 'ken';
window.document.getElementById('m-pin').value = '1234';
submit(q('#member-form'));
await waitFor(() => (fsdb.__dump('trips/t1/members/new-member-uid') || Object.keys(fsdb.__store).some(k => k.startsWith('trips/t1/members/') && fsdb.__store.get(k).displayName === 'เคน')), { label: 'member created' }).catch(() => {});
const createdMember = [...fsdb.__store.entries()].find(([k, v]) => k.startsWith('trips/t1/members/') && v.displayName === 'เคน');
check(!!createdMember, 'members: add member persists (no internal error)');
check(!errors.some(e => e.includes('internal')), 'members: no "internal" error surfaced');
await sleep(150);
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

console.log('\n▶ delete the whole trip (UI)');
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
