import { auth, db, isFirebaseConfigured, onAuthStateChanged, syncState } from './firebase.js';
import { Router } from './router.js';
import { toast } from './components/toast.js';
import { renderFujiMascot, renderEmptyState } from './components/fuji.js';
import { loginAdmin, loginMember, logout, hasStepUpSession } from './auth/index.js';
import { listTrips, getTrip, createTrip } from './trips/index.js';
import { subscribeItinerary, fetchItinerary, addItineraryItem, reorderItinerary, batchUpdateSchedule } from './itinerary/index.js';
import { fetchExpenses, addExpense } from './expenses/index.js';
import { fetchSettlementData, recalculateAndSaveSettlement } from './settlement/index.js';
import { dayjs, getCurrentTimes, formatDate, formatTime, formatDuration, getTripDays, determineUpNextDay } from './utils/date.js';
import { formatCurrency } from './utils/currency.js';
import { calculateSettlement } from './utils/settlement.js';
import { recalculateSchedule, detectOverlaps } from './utils/scheduling.js';
import { escapeHtml } from './utils/sanitize.js';
import { showBottomSheet, showModal } from './components/modal.js';
import { parseCoordinates, getInitials } from './utils/helpers.js';

const appEl = document.getElementById('app');
const headerSubtitle = document.getElementById('header-subtitle');
const desktopNavEl = document.getElementById('desktop-nav');
const bottomNavEl = document.getElementById('bottom-nav');
const fabEl = document.getElementById('fab');
const userAvatarBtn = document.getElementById('user-avatar-btn');
const refreshBtn = document.getElementById('refresh-btn');
const fujiLoaderEl = document.getElementById('fuji-loader');

if (fujiLoaderEl) fujiLoaderEl.innerHTML = renderFujiMascot('loading', 80);

// Live clocks
setInterval(() => {
  const times = getCurrentTimes();
  const bkk = document.getElementById('clock-bkk');
  const tokyo = document.getElementById('clock-tokyo');
  if (bkk) bkk.textContent = `BKK ${times.bangkok.format('HH:mm')}`;
  if (tokyo) tokyo.textContent = `TYO ${times.tokyo.format('HH:mm')}`;
}, 1000);

// Sync status
syncState.subscribe(status => {
  const el = document.getElementById('sync-status');
  if (!el) return;
  const dot = el.querySelector('span');
  const txt = el.querySelector('span:last-child');
  if (status === 'online') { dot.className = 'w-2 h-2 rounded-full bg-emerald-500'; txt.textContent = 'Online'; }
  if (status === 'offline') { dot.className = 'w-2 h-2 rounded-full bg-gray-400'; txt.textContent = 'Offline'; }
  if (status === 'syncing') { dot.className = 'w-2 h-2 rounded-full bg-amber-500 animate-pulse'; txt.textContent = 'Syncing'; }
  if (status === 'failed') { dot.className = 'w-2 h-2 rounded-full bg-red-500'; txt.textContent = 'Sync Failed'; }
});

let currentUser = null;
let currentTripId = localStorage.getItem('fuji_current_trip') || null;
let currentTrip = null;
let unsubscribers = [];

function cleanupSubs() {
  unsubscribers.forEach(fn => { try { fn(); } catch {} });
  unsubscribers = [];
}

function setTrip(tripId) {
  currentTripId = tripId;
  if (tripId) localStorage.setItem('fuji_current_trip', tripId);
  else localStorage.removeItem('fuji_current_trip');
}

function renderDesktopNav() {
  if (!currentTripId) { desktopNavEl.innerHTML = ''; return; }
  const base = `#/trip/${currentTripId}`;
  const items = [
    { label: 'Dashboard', path: `${base}/dashboard`, icon: 'layout-dashboard' },
    { label: 'Itinerary', path: `${base}/itinerary`, icon: 'map-pinned' },
    { label: 'Map', path: `${base}/map`, icon: 'map' },
    { label: 'Expenses', path: `${base}/expenses`, icon: 'wallet' },
    { label: 'Settlement', path: `${base}/settlement`, icon: 'hand-coins' },
    { label: 'Members', path: `${base}/members`, icon: 'users' },
    { label: 'Import/Export', path: `${base}/import`, icon: 'file-up' },
  ];
  desktopNavEl.innerHTML = items.map(i => `<a href="${i.path}" class="chip ${location.hash.includes(i.path) ? 'chip-active' : ''}"><i data-lucide="${i.icon}" class="w-4 h-4"></i>${i.label}</a>`).join('');
  if (window.lucide) lucide.createIcons();
}

function updateBottomNav() {
  if (!currentTripId) return;
  const base = `#/trip/${currentTripId}`;
  bottomNavEl.querySelectorAll('.bottom-nav-item').forEach(btn => {
    const route = btn.getAttribute('data-route').replace('#/trip', base);
    btn.onclick = () => location.hash = route;
    if (location.hash.startsWith(route)) btn.classList.add('active');
    else btn.classList.remove('active');
  });
}

function renderFAB(route) {
  if (!currentTripId) { fabEl.classList.add('hidden'); return; }
  if (route.includes('/itinerary') || route.includes('/expenses')) {
    fabEl.classList.remove('hidden');
    fabEl.onclick = () => {
      if (route.includes('/itinerary')) location.hash = `#/trip/${currentTripId}/itinerary?action=add`;
      if (route.includes('/expenses')) location.hash = `#/trip/${currentTripId}/expenses/add`;
    };
  } else fabEl.classList.add('hidden');
}

// Auth state - skip if not configured
if (!isFirebaseConfigured) {
  console.log('[Auth] Skipping auth listener - Firebase not configured');
  // Ensure config screen shows even if auth is null
  setTimeout(() => renderConfigNeeded(), 50);
} else if (auth) {
  onAuthStateChanged(auth, async user => {
    // Double check config still valid
    if (!isFirebaseConfigured) {
      renderConfigNeeded();
      return;
    }
    currentUser = user;
    if (user) {
      const initial = (user.displayName || user.email || '?')[0].toUpperCase();
      userAvatarBtn.textContent = initial;
      userAvatarBtn.onclick = () => showBottomSheet(`
        <h3 class="font-bold text-lg mb-2">${escapeHtml(user.displayName || user.email || 'User')}</h3>
        <p class="text-sm text-[var(--text-secondary)] mb-4">${escapeHtml(user.email || user.uid)}</p>
        <button id="logout-btn" class="btn btn-secondary w-full">Logout</button>
        <button id="forget-device" class="btn btn-ghost w-full mt-2">ลืมอุปกรณ์นี้</button>
        <button id="clear-cfg-btn" class="btn btn-ghost w-full mt-2 text-[11px]">ล้าง Firebase Config</button>
      `, {});
      setTimeout(() => {
        document.getElementById('logout-btn')?.addEventListener('click', async () => { await logout(); location.hash = '#/login'; });
        document.getElementById('forget-device')?.addEventListener('click', () => { localStorage.clear(); location.reload(); });
        document.getElementById('clear-cfg-btn')?.addEventListener('click', () => { localStorage.removeItem('fuji_firebase_config'); location.reload(); });
      }, 50);
      // If on login, go to trips
      if (location.hash.includes('login')) location.hash = '#/trips';
    } else {
      userAvatarBtn.textContent = '?';
      userAvatarBtn.onclick = () => location.hash = '#/login';
      // Don't auto-redirect if not configured (already handled)
      if (!isFirebaseConfigured) {
        renderConfigNeeded();
        return;
      }
      if (!location.hash.includes('login') && !location.hash.includes('config')) {
        // Only redirect to login if configured
        location.hash = '#/login';
      }
    }
    if (window.lucide) lucide.createIcons();
  });
}

// Routes
const routes = [
  { path: '/login', handler: renderLogin },
  { path: '/trips', handler: renderTripSelector },
  { path: '/trip/:tripId/dashboard', handler: renderDashboard },
  { path: '/trip/:tripId/itinerary', handler: renderItinerary },
  { path: '/trip/:tripId/map', handler: renderMap },
  { path: '/trip/:tripId/expenses', handler: renderExpenses },
  { path: '/trip/:tripId/expenses/add', handler: renderExpenseAdd },
  { path: '/trip/:tripId/settlement', handler: renderSettlement },
  { path: '/trip/:tripId/members', handler: renderMembers },
  { path: '/trip/:tripId/import', handler: renderImportExport },
  { path: '/trip/:tripId/export', handler: renderImportExport },
  { path: '/trip/:tripId/settings', handler: renderSettings },
  { path: '/trip/:tripId/more', handler: renderMore },
];

const router = new Router(routes, '#/login');
router.beforeEach = (matched) => {
  renderDesktopNav();
  updateBottomNav();
  renderFAB(matched.path);
  // FIX: Always show config if not configured, even on /login - prevents Firebase not configured error
  if (!isFirebaseConfigured) {
    console.warn('[Router] Firebase not configured, showing config screen for', matched.path);
    renderConfigNeeded();
    return false;
  }
  if (!currentUser && matched.path !== '/login') {
    location.hash = '#/login';
    return false;
  }
  if (matched.params?.tripId) {
    setTrip(matched.params.tripId);
    renderDesktopNav();
    updateBottomNav();
  }
};

// Early check - show config immediately if not configured, before any auth logic
function earlyConfigCheck() {
  if (!isFirebaseConfigured) {
    console.log('[App] Early check - Firebase not configured, forcing config screen');
    // Wait for DOM
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => renderConfigNeeded());
    } else {
      renderConfigNeeded();
    }
    return true;
  }
  return false;
}
const isEarlyBlocked = earlyConfigCheck();

if (!isEarlyBlocked) {
  router.init();
} else {
  // Still init router but it will be blocked by beforeEach
  router.init();
  // Force render again after a tick to ensure config shows
  setTimeout(() => { if (!isFirebaseConfigured) renderConfigNeeded(); }, 200);
}

refreshBtn?.addEventListener('click', () => {
  syncState.set('syncing');
  setTimeout(() => { syncState.set('online'); toast.success('รีเฟรชข้อมูลล่าสุดแล้ว'); router.handle(); }, 800);
});

// Views
function renderConfigNeeded() {
  const saved = localStorage.getItem('fuji_firebase_config');
  let savedPretty = '';
  try { savedPretty = saved ? JSON.stringify(JSON.parse(saved), null, 2) : ''; } catch { savedPretty = saved || ''; }
  appEl.innerHTML = `
    <div class="max-w-[720px] mx-auto animate-fadeIn">
      <div class="card p-8">
        <div class="text-center mb-6">${renderFujiMascot('normal', 120)}</div>
        <h1 class="text-2xl font-bold mb-2">ตั้งค่า Firebase — วิธี GitHub Pages (ไม่ต้องแก้โค้ด)</h1>
        <p class="text-sm text-[var(--text-secondary)] mb-6">นี่คือวิธีที่แนะนำ: วาง Config ครั้งเดียว เก็บใน Browser ของคุณ (localStorage) ไม่ต้อง push โค้ดใหม่ ปลอดภัยสำหรับ repo public</p>

        <div class="p-4 rounded-xl border mb-6" style="border-color:var(--border); background:var(--bg-secondary);">
          <h3 class="font-bold text-sm mb-2">📍 เอา Config มาจากไหน?</h3>
          <ol class="text-xs leading-6 list-decimal pl-4 space-y-1">
            <li>ไปที่ <a href="https://console.firebase.google.com" target="_blank" class="text-[var(--primary)] underline">Firebase Console</a> > สร้างโปรเจกต์</li>
            <li>Project Settings (⚙️) > General > Your apps > <span class="font-bold">Web app</span> > ถ้ายังไม่มีให้กด Add app > Web</li>
            <li>เลือก <b>Config</b> (ไม่ใช่ CDN) จะได้โค้ดแบบนี้:
              <pre class="mt-2 p-2 bg-[var(--surface)] rounded text-[11px] overflow-auto">const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "xxx.firebaseapp.com",
  projectId: "xxx",
  storageBucket: "xxx.appspot.com",
  messagingSenderId: "123...",
  appId: "1:123:web:abc"
};</pre>
            </li>
            <li>คัดลอกเฉพาะข้างใน <code>{ ... }</code> มาวางด้านล่าง</li>
            <li>อย่าลืมเปิด <b>Auth > Email/Password</b>, <b>Firestore</b>, <b>Storage</b>, <b>Functions (asia-southeast1)</b> แล้ว deploy rules/functions ตาม README</li>
          </ol>
        </div>

        <div class="space-y-5">
          <div class="input-group">
            <label class="input-label">วิธีที่ 1: วาง JSON ทั้งก้อน (เร็วที่สุด)</label>
            <textarea id="cfg-input" class="input min-h-[160px] font-mono text-xs" placeholder='{"apiKey":"...","authDomain":"...","projectId":"...","storageBucket":"...","messagingSenderId":"...","appId":"..."}'>${escapeHtml(savedPretty)}</textarea>
            <span class="input-hint">วาง JSON ที่คัดลอกมาได้เลย ระบบจะตรวจว่าครบ 6 ฟิลด์</span>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-3 p-4 rounded-xl border" style="border-color:var(--border);">
            <h4 class="md:col-span-2 font-bold text-sm">วิธีที่ 2: กรอกแยกฟิลด์ (ถ้าไม่มี JSON)</h4>
            <div class="input-group"><label class="input-label">apiKey</label><input id="cfg-apikey" class="input text-xs"></div>
            <div class="input-group"><label class="input-label">authDomain</label><input id="cfg-auth" class="input text-xs"></div>
            <div class="input-group"><label class="input-label">projectId</label><input id="cfg-project" class="input text-xs"></div>
            <div class="input-group"><label class="input-label">storageBucket</label><input id="cfg-bucket" class="input text-xs"></div>
            <div class="input-group"><label class="input-label">messagingSenderId</label><input id="cfg-sender" class="input text-xs"></div>
            <div class="input-group"><label class="input-label">appId</label><input id="cfg-appid" class="input text-xs"></div>
            <button id="build-json" type="button" class="md:col-span-2 btn btn-secondary btn-sm">รวมเป็น JSON ด้านบน</button>
          </div>

          <div class="flex gap-2">
            <button id="save-cfg" class="btn btn-primary flex-1 btn-lg">💾 บันทึกและรีโหลด</button>
            <button id="clear-cfg" class="btn btn-ghost">ล้าง</button>
          </div>
          <div class="flex gap-2">
            <button id="test-cfg" class="btn btn-secondary flex-1 btn-sm">ทดสอบ JSON</button>
            <button id="copy-example" class="btn btn-secondary flex-1 btn-sm">คัดลอกตัวอย่าง</button>
          </div>
        </div>

        <div class="mt-8 p-4 rounded-xl bg-[var(--bg-secondary)] text-xs leading-relaxed">
          <strong>ทำไมวิธีนี้ปลอดภัยสำหรับ GitHub Pages?</strong><br>
          • Firebase <code>apiKey</code> ไม่ใช่ Secret — มันถูกออกแบบให้อยู่บน client ได้ ปลอดภัยด้วย <code>firestore.rules</code> และ <code>storage.rules</code><br>
          • การเก็บใน <code>localStorage</code> ทำให้ไม่ต้อง commit config ลง repo public<br>
          • ถ้าต้องการให้ทุกคนเข้าเว็บแล้วใช้ได้เลยโดยไม่ต้องตั้งค่า: ให้แก้ <code>src/js/firebase.js</code> ใส่ค่าจริงแล้ว push (ยอมรับได้สำหรับโปรเจกต์ส่วนตัว)<br>
          • Config นี้เก็บเฉพาะใน browser เครื่องนี้ ถ้าเปลี่ยนเครื่อง/ล้าง cache ต้องตั้งใหม่
        </div>

        <div class="mt-4 text-[11px] text-[var(--text-tertiary)]">
          ไฟล์ที่เกี่ยวข้อง: <code>src/js/firebase.js</code> (placeholder), <code>index.html</code> โหลดจาก <code>localStorage key: fuji_firebase_config</code> ก่อน <code>app.js</code><br>
          ดูคู่มือเต็ม: <code>README.md</code> / <code>docs/DEPLOY.md</code>
        </div>
      </div>
    </div>
  `;

  // Fill separate fields from saved
  try {
    const j = saved ? JSON.parse(saved) : {};
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
    set('cfg-apikey', j.apiKey); set('cfg-auth', j.authDomain); set('cfg-project', j.projectId);
    set('cfg-bucket', j.storageBucket); set('cfg-sender', j.messagingSenderId); set('cfg-appid', j.appId);
  } catch {}

  document.getElementById('build-json').onclick = () => {
    const json = {
      apiKey: document.getElementById('cfg-apikey').value.trim(),
      authDomain: document.getElementById('cfg-auth').value.trim(),
      projectId: document.getElementById('cfg-project').value.trim(),
      storageBucket: document.getElementById('cfg-bucket').value.trim(),
      messagingSenderId: document.getElementById('cfg-sender').value.trim(),
      appId: document.getElementById('cfg-appid').value.trim()
    };
    document.getElementById('cfg-input').value = JSON.stringify(json, null, 2);
    toast.success('รวม JSON แล้ว ตรวจสอบด้านบน');
  };

  document.getElementById('test-cfg').onclick = () => {
    try {
      const json = JSON.parse(document.getElementById('cfg-input').value);
      const required = ['apiKey','authDomain','projectId','storageBucket','messagingSenderId','appId'];
      const missing = required.filter(k => !json[k]);
      if (missing.length) throw new Error('ขาดฟิลด์: ' + missing.join(', '));
      toast.success('JSON ถูกต้องครบ 6 ฟิลด์ พร้อมบันทึก');
    } catch (e) { toast.error('JSON ไม่ถูกต้อง: ' + e.message); }
  };

  document.getElementById('copy-example').onclick = async () => {
    const example = `{
  "apiKey": "AIzaSy...",
  "authDomain": "your-project.firebaseapp.com",
  "projectId": "your-project-id",
  "storageBucket": "your-project.appspot.com",
  "messagingSenderId": "1234567890",
  "appId": "1:1234567890:web:abcdef123456"
}`;
    await navigator.clipboard.writeText(example);
    toast.success('คัดลอกตัวอย่างแล้ว แก้ค่าจริงแล้ววาง');
  };

  document.getElementById('clear-cfg').onclick = () => {
    localStorage.removeItem('fuji_firebase_config');
    document.getElementById('cfg-input').value = '';
    ['cfg-apikey','cfg-auth','cfg-project','cfg-bucket','cfg-sender','cfg-appid'].forEach(id => document.getElementById(id).value = '');
    toast.warning('ล้าง config แล้ว');
  };

  document.getElementById('save-cfg').onclick = () => {
    try {
      const raw = document.getElementById('cfg-input').value.trim();
      if (!raw) throw new Error('กรุณาวาง JSON ก่อน');
      const json = JSON.parse(raw);
      const required = ['apiKey','authDomain','projectId','storageBucket','messagingSenderId','appId'];
      for (const k of required) if (!json[k]) throw new Error('ขาด ' + k);
      localStorage.setItem('fuji_firebase_config', JSON.stringify(json));
      toast.success('บันทึกแล้ว กำลังรีโหลด...');
      setTimeout(() => location.reload(), 600);
    } catch (e) { toast.error('บันทึกไม่สำเร็จ: ' + e.message); }
  };
}

function renderLogin() {
  if (!isFirebaseConfigured) {
    return renderConfigNeeded();
  }
  appEl.innerHTML = `
    <div class="min-h-[70vh] grid place-items-center">
      <div class="w-full max-w-[440px]">
        <div class="text-center mb-8">
          ${renderFujiMascot('normal', 140)}
          <h1 class="text-[28px] font-bold mt-4 tracking-tight">Fuji Trip Planner</h1>
          <p class="text-sm text-[var(--text-secondary)] mt-1">วางแผนทริป • หารค่าใช้จ่าย • เคลียร์บิลจบในที่เดียว</p>
        </div>
        <div class="card p-6">
          <div class="segmented mb-6">
            <button data-tab="admin" class="segmented-item active">Admin</button>
            <button data-tab="member" class="segmented-item">Member</button>
          </div>

          <div id="tab-admin">
            <form id="admin-form" class="space-y-4">
              <div class="input-group"><label class="input-label">อีเมล</label><input id="admin-email" class="input" type="email" placeholder="admin@example.com" required></div>
              <div class="input-group"><label class="input-label">รหัสผ่าน</label><input id="admin-pass" class="input" type="password" required></div>
              <label class="flex items-center gap-2 text-sm"><input id="admin-remember" type="checkbox" checked> จดจำอุปกรณ์นี้</label>
              <button class="btn btn-primary w-full btn-lg" type="submit">เข้าสู่ระบบ Admin</button>
            </form>
          </div>

          <div id="tab-member" class="hidden">
            <form id="member-form" class="space-y-4">
              <div class="input-group"><label class="input-label">Trip ID (ถ้ามี)</label><input id="member-trip" class="input" placeholder="เว้นว่างได้ถ้าจำทริปไม่ได้"></div>
              <div class="input-group"><label class="input-label">Username</label><input id="member-user" class="input" placeholder="เช่น fuji_user" required></div>
              <div class="input-group"><label class="input-label">PIN</label><input id="member-pin" class="input" type="password" inputmode="numeric" placeholder="****" required></div>
              <label class="flex items-center gap-2 text-sm"><input id="member-remember" type="checkbox" checked> จดจำอุปกรณ์นี้</label>
              <button class="btn btn-primary w-full btn-lg" type="submit">เข้าสู่ระบบ Member</button>
            </form>
          </div>

          <p class="text-[11px] text-center text-[var(--text-tertiary)] mt-6">การเข้าสู่ระบบ Member ต้องผ่าน Cloud Function ตรวจสอบ PIN แบบ Hash ไม่เก็บ PIN ดิบ</p>
        </div>
      </div>
    </div>
  `;
  const tabs = appEl.querySelectorAll('.segmented-item');
  tabs.forEach(btn => btn.onclick = () => {
    tabs.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    appEl.querySelector('#tab-admin').classList.toggle('hidden', btn.dataset.tab !== 'admin');
    appEl.querySelector('#tab-member').classList.toggle('hidden', btn.dataset.tab !== 'member');
  });

  appEl.querySelector('#admin-form').onsubmit = async (e) => {
    e.preventDefault();
    const email = document.getElementById('admin-email').value;
    const pass = document.getElementById('admin-pass').value;
    const remember = document.getElementById('admin-remember').checked;
    const t = toast.loading('กำลังเข้าสู่ระบบ...');
    try {
      await loginAdmin(email, pass, remember);
      t.close();
      toast.success('เข้าสู่ระบบสำเร็จ');
      location.hash = '#/trips';
    } catch (err) {
      t.close();
      toast.error(err.message || 'Login failed');
    }
  };

  appEl.querySelector('#member-form').onsubmit = async (e) => {
    e.preventDefault();
    const tripId = document.getElementById('member-trip').value.trim() || null;
    const user = document.getElementById('member-user').value.trim();
    const pin = document.getElementById('member-pin').value;
    const remember = document.getElementById('member-remember').checked;
    const t = toast.loading('ตรวจสอบ Username/PIN...');
    try {
      await loginMember(user, pin, tripId, remember);
      t.close();
      toast.success('ยินดีต้อนรับ!');
      location.hash = '#/trips';
    } catch (err) {
      t.close();
      toast.error(err.message || 'Login failed');
    }
  };
  if (window.lucide) lucide.createIcons();
}

async function renderTripSelector() {
  if (!currentUser) return location.hash = '#/login';
  appEl.innerHTML = `<div class="animate-fadeIn"><div class="flex items-center justify-between mb-6"><h1 class="text-2xl font-bold">เลือกทริป</h1><button id="create-trip-btn" class="btn btn-primary"><i data-lucide="plus"></i>สร้างทริปใหม่</button></div><div id="trip-grid" class="grid md:grid-cols-2 lg:grid-cols-3 gap-4"></div></div>`;
  if (window.lucide) lucide.createIcons();

  document.getElementById('create-trip-btn').onclick = () => {
    showBottomSheet(`
      <h3 class="font-bold text-lg mb-4">สร้างทริปใหม่</h3>
      <form id="create-trip-form" class="space-y-4">
        <div class="input-group"><label class="input-label">ชื่อทริป</label><input id="ct-name" class="input" required placeholder="Fuji Autumn 2027"></div>
        <div class="input-group"><label class="input-label">ประเทศ</label><input id="ct-country" class="input" placeholder="Japan"></div>
        <div class="grid grid-cols-2 gap-3">
          <div class="input-group"><label class="input-label">เริ่ม</label><input id="ct-start" class="input" type="date" required></div>
          <div class="input-group"><label class="input-label">สิ้นสุด</label><input id="ct-end" class="input" type="date" required></div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div class="input-group"><label class="input-label">Timezone</label><select id="ct-tz" class="input"><option value="Asia/Bangkok">Asia/Bangkok</option><option value="Asia/Tokyo">Asia/Tokyo</option><option value="Asia/Seoul">Asia/Seoul</option></select></div>
          <div class="input-group"><label class="input-label">Base Currency</label><select id="ct-cur" class="input"><option>THB</option><option>JPY</option><option>USD</option><option>KRW</option></select></div>
        </div>
        <button class="btn btn-primary w-full">สร้างทริป</button>
      </form>
    `);
    setTimeout(() => {
      document.getElementById('create-trip-form').onsubmit = async (e) => {
        e.preventDefault();
        const t = toast.loading('สร้างทริป...');
        try {
          const id = await createTrip({
            name: document.getElementById('ct-name').value,
            country: document.getElementById('ct-country').value,
            startDate: document.getElementById('ct-start').value,
            endDate: document.getElementById('ct-end').value,
            timezone: document.getElementById('ct-tz').value,
            baseCurrency: document.getElementById('ct-cur').value,
            creatorName: currentUser.displayName || currentUser.email
          }, currentUser.uid);
          t.close();
          toast.success('สร้างทริปสำเร็จ');
          location.hash = `#/trip/${id}/dashboard`;
        } catch (err) { t.close(); toast.error(err.message); }
      };
    }, 50);
  };

  const grid = document.getElementById('trip-grid');
  grid.innerHTML = `<div class="skeleton h-32"></div><div class="skeleton h-32"></div><div class="skeleton h-32"></div>`;
  try {
    const trips = await listTrips(currentUser.uid, false);
    if (!trips.length) {
      grid.innerHTML = renderEmptyState({ title: 'ยังไม่มีทริป', desc: 'สร้างทริปแรกเพื่อเริ่มวางแผน', actionHtml: '<button onclick="document.getElementById(\'create-trip-btn\').click()" class="btn btn-primary mt-2">สร้างทริปใหม่</button>' });
      return;
    }
    grid.innerHTML = trips.map(t => `
      <div class="card card-hover p-0 overflow-hidden cursor-pointer" data-trip="${t.id}">
        <div class="h-28" style="background: ${t.themeColor || 'var(--gradient-fuji)'}; background-image: var(--gradient-mesh);"></div>
        <div class="p-4">
          <div class="flex items-start justify-between gap-2">
            <h3 class="font-bold text-[15px] leading-tight">${escapeHtml(t.name)}</h3>
            <span class="badge badge-planned">${escapeHtml(t.status || 'draft')}</span>
          </div>
          <p class="text-xs text-[var(--text-secondary)] mt-1">${escapeHtml(t.country || '')} ${t.city ? '• ' + escapeHtml(t.city) : ''}</p>
          <p class="text-xs mt-2">${t.startDate || ''} → ${t.endDate || ''}</p>
          <div class="flex items-center gap-2 mt-3"><span class="text-[11px] px-2 py-1 rounded-full bg-[var(--bg-secondary)]">${escapeHtml(t.baseCurrency || 'THB')}</span><span class="text-[11px] px-2 py-1 rounded-full bg-[var(--bg-secondary)]">${escapeHtml(t.timezone || '')}</span></div>
        </div>
      </div>
    `).join('');
    grid.querySelectorAll('[data-trip]').forEach(el => el.onclick = () => location.hash = `#/trip/${el.dataset.trip}/dashboard`);
  } catch (e) {
    grid.innerHTML = `<div class="text-sm text-red-500">โหลดทริปไม่สำเร็จ: ${escapeHtml(e.message)}</div>`;
  }
}

async function loadTrip(tripId) {
  if (!tripId) return null;
  try {
    const trip = await getTrip(tripId);
    currentTrip = trip;
    headerSubtitle.textContent = trip.name;
    return trip;
  } catch (e) {
    toast.error('ไม่พบทริปนี้');
    location.hash = '#/trips';
    return null;
  }
}

async function renderDashboard(params) {
  const tripId = params.tripId;
  await loadTrip(tripId);
  cleanupSubs();
  appEl.innerHTML = `
    <div class="animate-fadeIn space-y-6">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div><h1 class="text-2xl font-bold">${escapeHtml(currentTrip?.name || 'Dashboard')}</h1><p class="text-sm text-[var(--text-secondary)]">${currentTrip?.startDate || ''} - ${currentTrip?.endDate || ''} • ${currentTrip?.country || ''}</p></div>
        <div class="flex gap-2"><button id="add-place-quick" class="btn btn-secondary btn-sm">+ สถานที่</button><button id="add-expense-quick" class="btn btn-primary btn-sm">+ ค่าใช้จ่าย</button></div>
      </div>
      <div id="dashboard-grid" class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div class="card-bento card col-span-2"><div class="relative"><p class="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Countdown</p><h3 id="countdown" class="text-2xl font-bold mt-1">--</h3><p id="countdown-sub" class="text-sm text-[var(--text-secondary)] mt-1">--</p></div></div>
        <div class="card-bento card"><p class="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">ค่าใช้จ่ายรวม</p><h3 id="total-expense" class="text-xl font-bold mt-1">--</h3><p class="text-xs text-[var(--text-secondary)]">ฐาน ${currentTrip?.baseCurrency || 'THB'}</p></div>
        <div class="card-bento card"><p class="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">ยอดของคุณ</p><h3 id="my-balance" class="text-xl font-bold mt-1">--</h3><p class="text-xs text-[var(--text-secondary)]">ต้องรับ/จ่าย</p></div>
        <div class="card-bento card col-span-2 lg:col-span-2"><p class="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">กิจกรรมปัจจุบัน</p><div id="current-activity" class="mt-2"><div class="skeleton h-12"></div></div></div>
        <div class="card-bento card col-span-2 lg:col-span-2"><p class="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">สรุป</p><div id="summary-stats" class="mt-2 text-sm space-y-1"><div class="skeleton h-4"></div></div></div>
      </div>
      <div class="card p-4"><h3 class="font-bold mb-3">Up Next</h3><div id="upnext-list"></div></div>
    </div>
  `;

  document.getElementById('add-place-quick').onclick = () => location.hash = `#/trip/${tripId}/itinerary?action=add`;
  document.getElementById('add-expense-quick').onclick = () => location.hash = `#/trip/${tripId}/expenses/add`;

  try {
    const { expenses, members } = await fetchSettlementData(tripId);
    const totalMinor = expenses.reduce((s, e) => s + (e.netTotalMinor || 0), 0);
    document.getElementById('total-expense').textContent = formatCurrency(totalMinor, currentTrip?.baseCurrency || 'THB');
    const { balances } = calculateSettlement(expenses, members.map(m => ({ id: m.id })));
    const myBal = balances.find(b => b.memberId === currentUser.uid);
    document.getElementById('my-balance').textContent = myBal ? formatCurrency(myBal.net, currentTrip?.baseCurrency || 'THB') : formatCurrency(0, currentTrip?.baseCurrency || 'THB');
    document.getElementById('summary-stats').innerHTML = `<div>สมาชิก ${members.length} คน • ค่าใช้จ่าย ${expenses.length} รายการ • เฉลี่ย ${expenses.length ? formatCurrency(Math.round(totalMinor/expenses.length), currentTrip?.baseCurrency||'THB') : '-'}/รายการ</div>`;

    // Countdown
    if (currentTrip?.startDate) {
      const start = dayjs(currentTrip.startDate);
      const now = dayjs();
      const diff = start.diff(now, 'day');
      document.getElementById('countdown').textContent = diff > 0 ? `อีก ${diff} วัน` : diff === 0 ? 'วันนี้!' : `ผ่านมา ${Math.abs(diff)} วัน`;
      document.getElementById('countdown-sub').textContent = formatDate(currentTrip.startDate, 'th', currentTrip.timezone || 'Asia/Bangkok');
    }

    // Itinerary today
    const todayStr = dayjs().format('YYYY-MM-DD');
    const todaysItems = await fetchItinerary(tripId, todayStr);
    const now = dayjs();
    const current = todaysItems.find(it => it.startAt && it.endAt && dayjs(it.startAt).isBefore(now) && dayjs(it.endAt).isAfter(now));
    if (current) {
      const progress = Math.round((now.diff(dayjs(current.startAt)) / dayjs(current.endAt).diff(dayjs(current.startAt))) * 100);
      document.getElementById('current-activity').innerHTML = `
        <div class="font-semibold">${escapeHtml(current.title)}</div>
        <div class="text-xs text-[var(--text-secondary)]">${formatTime(current.startAt, currentTrip.timezone)} - ${formatTime(current.endAt, currentTrip.timezone)} • ${formatDuration(current.durationMinutes)}</div>
        <div class="progress mt-2"><div class="progress-bar" style="width:${progress}%"></div></div>
      `;
    } else {
      document.getElementById('current-activity').innerHTML = `<p class="text-sm text-[var(--text-secondary)]">ไม่มีกิจกรรมขณะนี้</p>`;
    }

    // Up Next list
    const tripDays = getTripDays(currentTrip.startDate, currentTrip.endDate);
    const upNextDay = determineUpNextDay(tripDays, []);
    const upItems = await fetchItinerary(tripId, upNextDay);
    document.getElementById('upnext-list').innerHTML = upItems.length ? upItems.map((it, idx) => `
      <div class="flex gap-3 py-2 border-b last:border-0" style="border-color:var(--border);">
        <div class="w-10 h-10 rounded-full bg-[var(--bg-secondary)] grid place-items-center text-xs font-bold">${idx+1}</div>
        <div><div class="font-medium text-sm">${escapeHtml(it.title)}</div><div class="text-xs text-[var(--text-secondary)]">${formatTime(it.startAt, currentTrip.timezone)} • ${escapeHtml(it.address || '')}</div></div>
      </div>
    `).join('') : `<p class="text-sm text-[var(--text-secondary)]">ไม่มีแผนสำหรับ ${upNextDay || 'วันนี้'}</p>`;

  } catch (e) {
    console.error(e);
    toast.error('โหลด Dashboard ไม่สำเร็จ');
  }
}

async function renderItinerary(params) {
  const tripId = params.tripId;
  await loadTrip(tripId);
  const urlParams = new URLSearchParams(location.hash.split('?')[1] || '');
  const action = urlParams.get('action');

  appEl.innerHTML = `
    <div class="animate-fadeIn">
      <div class="flex items-center justify-between mb-4">
        <h1 class="text-xl font-bold">แผนการเดินทาง</h1>
        <div class="flex gap-2"><button id="edit-mode-btn" class="btn btn-secondary btn-sm">Edit Mode</button><button id="add-itinerary-btn" class="btn btn-primary btn-sm">+ เพิ่มสถานที่</button></div>
      </div>
      <div id="date-chips" class="flex gap-2 overflow-x-auto pb-2 mb-4"></div>
      <div id="itinerary-list" class="space-y-3"></div>
    </div>
  `;

  let selectedDate = dayjs().format('YYYY-MM-DD');
  let editMode = false;
  let items = [];

  const tripDays = currentTrip ? getTripDays(currentTrip.startDate, currentTrip.endDate) : [];
  const chipsEl = document.getElementById('date-chips');
  chipsEl.innerHTML = tripDays.map(d => {
    const ds = dayjs(d).format('YYYY-MM-DD');
    return `<button data-date="${ds}" class="chip ${ds===selectedDate?'chip-active':''}">${dayjs(d).format('DD MMM')}</button>`;
  }).join('');
  chipsEl.querySelectorAll('[data-date]').forEach(btn => btn.onclick = () => {
    selectedDate = btn.dataset.date;
    chipsEl.querySelectorAll('.chip').forEach(c => c.classList.remove('chip-active'));
    btn.classList.add('chip-active');
    loadItems();
  });

  async function loadItems() {
    const listEl = document.getElementById('itinerary-list');
    listEl.innerHTML = `<div class="skeleton h-20"></div><div class="skeleton h-20"></div>`;
    try {
      items = await fetchItinerary(tripId, selectedDate);
      if (!items.length) {
        listEl.innerHTML = renderEmptyState({ title: 'ไม่มีแผนวันนี้', desc: `เพิ่มสถานที่สำหรับ ${selectedDate}`, actionHtml: `<button id="empty-add" class="btn btn-primary btn-sm mt-2">+ เพิ่มสถานที่</button>` });
        document.getElementById('empty-add')?.addEventListener('click', () => showAddModal());
        return;
      }
      listEl.innerHTML = items.map((it, idx) => `
        <div class="card p-4 ${editMode?'cursor-move':''}" data-id="${it.id}" draggable="${editMode}">
          <div class="flex gap-3">
            <div class="w-8 h-8 rounded-full bg-[var(--primary)] text-white grid place-items-center text-xs font-bold flex-shrink-0">${idx+1}</div>
            <div class="flex-1 min-w-0">
              <div class="flex items-start justify-between gap-2">
                <h3 class="font-semibold text-sm leading-tight">${escapeHtml(it.title)}</h3>
                <span class="badge badge-${it.status||'planned'} text-[10px]">${escapeHtml(it.status||'planned')}</span>
              </div>
              <p class="text-xs text-[var(--text-secondary)] mt-1">${formatTime(it.startAt, currentTrip.timezone)} - ${formatTime(it.endAt, currentTrip.timezone)} • ${formatDuration(it.durationMinutes)} ${it.travelToNextMinutes?`• เดินทาง ${formatDuration(it.travelToNextMinutes)}`:''}</p>
              ${it.address ? `<p class="text-xs mt-1 text-[var(--text-tertiary)]">${escapeHtml(it.address)}</p>` : ''}
              ${it.coordinates ? `<div class="flex gap-2 mt-2"><button class="btn btn-ghost btn-sm text-[11px]" data-copy="${escapeHtml(it.coordinates)}">Copy coords</button><a href="https://maps.google.com/?q=${encodeURIComponent(it.coordinates)}" target="_blank" class="btn btn-ghost btn-sm text-[11px]">เปิด Maps</a></div>` : ''}
            </div>
            ${editMode ? `<div class="flex flex-col gap-1"><button class="btn btn-ghost btn-icon w-8 h-8" data-up="${it.id}">↑</button><button class="btn btn-ghost btn-icon w-8 h-8" data-down="${it.id}">↓</button></div>` : ''}
          </div>
        </div>
      `).join('');

      // Drag & Drop with SortableJS lazy
      if (editMode) {
        try {
          const Sortable = (await import('https://esm.sh/sortablejs@1.15.3')).default;
          Sortable.create(listEl, {
            animation: 150,
            onEnd: async (evt) => {
              const newOrder = Array.from(listEl.children).map(el => el.dataset.id);
              const t = toast.loading('กำลังจัดลำดับใหม่...');
              try {
                const res = await reorderItinerary(tripId, selectedDate, newOrder, currentUser.uid);
                if (res.overlaps.length) toast.warning(`พบเวลาทับซ้อน ${res.overlaps.length} รายการ`);
                t.close();
                toast.success('จัดลำดับสำเร็จ');
                loadItems();
              } catch (e) { t.close(); toast.error(e.message); }
            }
          });
        } catch (e) { console.warn('Sortable load failed', e); }
      }

      listEl.querySelectorAll('[data-copy]').forEach(b => b.onclick = () => { navigator.clipboard.writeText(b.dataset.copy); toast.success('คัดลอกพิกัดแล้ว'); });
    } catch (e) { listEl.innerHTML = `<p class="text-sm text-red-500">${escapeHtml(e.message)}</p>`; }
  }

  function showAddModal() {
    showBottomSheet(`
      <h3 class="font-bold text-lg mb-4">เพิ่มสถานที่</h3>
      <form id="itinerary-form" class="space-y-4">
        <div class="input-group"><label class="input-label">ชื่อสถานที่</label><input id="it-title" class="input" required></div>
        <div class="grid grid-cols-2 gap-3">
          <div class="input-group"><label class="input-label">วันที่</label><input id="it-date" class="input" type="date" value="${selectedDate}" required></div>
          <div class="input-group"><label class="input-label">เวลาเริ่ม</label><input id="it-time" class="input" type="time" value="09:00" required></div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div class="input-group"><label class="input-label">ระยะเวลา (นาที)</label><input id="it-duration" class="input" type="number" min="0" value="60"></div>
          <div class="input-group"><label class="input-label">เดินทางไปจุดถัดไป (นาที)</label><input id="it-travel" class="input" type="number" min="0" value="0"></div>
        </div>
        <div class="input-group"><label class="input-label">พิกัด lat,lng</label><input id="it-coords" class="input" placeholder="35.3606,138.7274"></div>
        <div class="input-group"><label class="input-label">ที่อยู่</label><input id="it-address" class="input"></div>
        <div class="input-group"><label class="input-label">หมวดหมู่</label><select id="it-cat" class="input"><option value="sightseeing">เที่ยวชม</option><option value="food">อาหาร</option><option value="transport">เดินทาง</option><option value="stay">ที่พัก</option><option value="general">ทั่วไป</option></select></div>
        <button class="btn btn-primary w-full">บันทึก</button>
      </form>
    `);
    setTimeout(() => {
      document.getElementById('itinerary-form').onsubmit = async (e) => {
        e.preventDefault();
        const t = toast.loading('กำลังบันทึก...');
        try {
          const date = document.getElementById('it-date').value;
          const time = document.getElementById('it-time').value;
          const startAt = new Date(`${date}T${time}`);
          const coords = document.getElementById('it-coords').value.trim();
          if (coords) {
            const parsed = parseCoordinates(coords);
            if (!parsed) throw new Error('พิกัดไม่ถูกต้อง ต้องเป็น lat,lng');
          }
          await addItineraryItem(tripId, {
            title: document.getElementById('it-title').value,
            date,
            startAt,
            durationMinutes: parseInt(document.getElementById('it-duration').value,10),
            travelToNextMinutes: parseInt(document.getElementById('it-travel').value,10),
            coordinates: coords,
            address: document.getElementById('it-address').value,
            category: document.getElementById('it-cat').value
          }, currentUser.uid);
          t.close();
          toast.success('เพิ่มสถานที่สำเร็จ');
          document.querySelector('.bottom-sheet-backdrop')?.click();
          loadItems();
        } catch (err) { t.close(); toast.error(err.message); }
      };
    }, 50);
  }

  document.getElementById('add-itinerary-btn').onclick = showAddModal;
  document.getElementById('edit-mode-btn').onclick = () => {
    editMode = !editMode;
    document.getElementById('edit-mode-btn').textContent = editMode ? 'Exit Edit' : 'Edit Mode';
    document.getElementById('edit-mode-btn').className = editMode ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm';
    loadItems();
  };

  loadItems();

  if (action === 'add') showAddModal();
}

async function renderMap(params) {
  const tripId = params.tripId;
  await loadTrip(tripId);
  appEl.innerHTML = `
    <div class="animate-fadeIn">
      <div class="flex items-center justify-between mb-4"><h1 class="text-xl font-bold">แผนที่</h1><div class="flex gap-2"><select id="map-day-filter" class="input w-auto text-sm"><option value="">ทุกวัน</option></select><button id="fit-bounds" class="btn btn-secondary btn-sm">Fit Bounds</button></div></div>
      <div id="map" class="w-full h-[60vh] md:h-[70vh] rounded-xl overflow-hidden border" style="border-color:var(--border);"></div>
      <p class="text-[11px] text-[var(--text-tertiary)] mt-2">เส้นเชื่อมแสดงลำดับสถานที่ ไม่ใช่เส้นทางนำทางจริง</p>
    </div>
  `;

  const days = currentTrip ? getTripDays(currentTrip.startDate, currentTrip.endDate) : [];
  const filterEl = document.getElementById('map-day-filter');
  filterEl.innerHTML = '<option value="">ทุกวัน</option>' + days.map(d => `<option value="${dayjs(d).format('YYYY-MM-DD')}">${dayjs(d).format('DD MMM')}</option>`).join('');

  let mapInstance = null;
  let leafletLib = null;
  let markers = [];

  async function loadMapData(dayFilter = '') {
    try {
      const { initMap, addItineraryMarkers } = await import('./maps/index.js');
      const res = await initMap('map');
      mapInstance = res.map;
      leafletLib = res.L;
      const items = await fetchItinerary(tripId, dayFilter || null);
      // Generate day colors
      const dayColors = {};
      days.forEach((d, i) => {
        const hue = (i * 60) % 360;
        dayColors[dayjs(d).format('YYYY-MM-DD')] = `hsl(${hue},70%,50%)`;
      });
      // Clear previous markers if any
      markers.forEach(m => { try { mapInstance.removeLayer(m); } catch {} });
      markers = addItineraryMarkers(mapInstance, leafletLib, items, dayColors);
      document.getElementById('fit-bounds').onclick = () => {
        if (markers.length) {
          const latlngs = items.filter(it => it.coordinates).map(it => { const p = parseCoordinates(it.coordinates); return p ? [p.lat, p.lng] : null; }).filter(Boolean);
          if (latlngs.length) mapInstance.fitBounds(latlngs, { padding: [40,40] });
        }
      };
    } catch (e) {
      console.error(e);
      document.getElementById('map').innerHTML = `<div class="grid place-items-center h-full text-sm text-red-500">โหลดแผนที่ไม่สำเร็จ: ${escapeHtml(e.message)}</div>`;
    }
  }

  filterEl.onchange = () => loadMapData(filterEl.value);
  loadMapData();
}

async function renderExpenses(params) {
  const tripId = params.tripId;
  await loadTrip(tripId);
  appEl.innerHTML = `
    <div class="animate-fadeIn">
      <div class="flex items-center justify-between mb-4"><h1 class="text-xl font-bold">ค่าใช้จ่าย</h1><button id="add-expense-btn" class="btn btn-primary btn-sm">+ เพิ่ม</button></div>
      <div class="flex gap-2 overflow-x-auto pb-2 mb-4" id="expense-filters">
        <button class="chip chip-active" data-filter="all">ทั้งหมด</button>
        <button class="chip" data-filter="today">วันนี้</button>
        <button class="chip" data-filter="no-receipt">ไม่มีใบเสร็จ</button>
      </div>
      <div id="expense-list" class="space-y-3"></div>
      <div id="expense-pagination" class="flex justify-center mt-4"><button id="load-more" class="btn btn-secondary btn-sm">โหลดเพิ่ม</button></div>
    </div>
  `;

  document.getElementById('add-expense-btn').onclick = () => location.hash = `#/trip/${tripId}/expenses/add`;

  let lastDoc = null;
  let allExpenses = [];

  async function loadMore(reset = false) {
    if (reset) { lastDoc = null; allExpenses = []; document.getElementById('expense-list').innerHTML = ''; }
    const { items, lastDoc: newLast } = await fetchExpenses(tripId, { pageSize: 20, lastDoc });
    lastDoc = newLast;
    allExpenses = [...allExpenses, ...items];
    const listEl = document.getElementById('expense-list');
    if (!items.length && reset) {
      listEl.innerHTML = renderEmptyState({ title: 'ยังไม่มีค่าใช้จ่าย', desc: 'เพิ่มรายการแรกเพื่อเริ่มติดตาม' });
      return;
    }
    const html = items.map(e => `
      <div class="card p-4">
        <div class="flex justify-between gap-2">
          <div><h3 class="font-semibold text-sm">${escapeHtml(e.title)}</h3><p class="text-xs text-[var(--text-secondary)]">${e.date ? formatDate(e.date, 'th', currentTrip.timezone) : ''} • ${escapeHtml(e.category||'')} • ${escapeHtml(e.paymentMethod||'')}</p></div>
          <div class="text-right"><div class="font-bold text-sm">${formatCurrency(e.netTotalMinor||0, e.currency||'THB')}</div><div class="text-[11px] text-[var(--text-tertiary)]">${escapeHtml(e.currency||'')}</div></div>
        </div>
        <div class="flex gap-2 mt-2"><span class="text-[11px] px-2 py-1 rounded-full bg-[var(--bg-secondary)]">จ่ายโดย ${escapeHtml(e.payerId?.slice(0,6)||'')}</span><span class="text-[11px] px-2 py-1 rounded-full bg-[var(--bg-secondary)]">${(e.allocations||[]).length} คน</span></div>
      </div>
    `).join('');
    if (reset) listEl.innerHTML = html;
    else listEl.insertAdjacentHTML('beforeend', html);
    if (!newLast) document.getElementById('load-more').classList.add('hidden');
    else document.getElementById('load-more').classList.remove('hidden');
  }

  document.getElementById('load-more').onclick = () => loadMore(false);
  await loadMore(true);
}

async function renderExpenseAdd(params) {
  const tripId = params.tripId;
  await loadTrip(tripId);
  // Fetch members for payer selection
  let members = [];
  try {
    const { getDocs, collection } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
    const snap = await getDocs(collection(db, `trips/${tripId}/members`));
    members = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch {}

  appEl.innerHTML = `
    <div class="animate-fadeIn max-w-[720px] mx-auto">
      <h1 class="text-xl font-bold mb-4">เพิ่มค่าใช้จ่าย</h1>
      <form id="expense-form" class="space-y-5 card p-6">
        <div class="input-group"><label class="input-label">ชื่อรายการ</label><input id="ex-title" class="input" required placeholder="เช่น ค่ารถไฟ, อาหารกลางวัน"></div>
        <div class="grid grid-cols-2 gap-3">
          <div class="input-group"><label class="input-label">วันที่</label><input id="ex-date" class="input" type="date" value="${dayjs().format('YYYY-MM-DD')}" required></div>
          <div class="input-group"><label class="input-label">หมวดหมู่</label><select id="ex-cat" class="input"><option value="food">อาหาร</option><option value="transport">เดินทาง</option><option value="stay">ที่พัก</option><option value="activity">กิจกรรม</option><option value="shopping">ช้อปปิ้ง</option><option value="general">ทั่วไป</option></select></div>
        </div>
        <div class="grid grid-cols-3 gap-3">
          <div class="input-group col-span-2"><label class="input-label">ยอดรวมก่อนค่าธรรมเนียม (เช่น 1000)</label><input id="ex-subtotal" class="input" type="number" step="0.01" required></div>
          <div class="input-group"><label class="input-label">สกุลเงิน</label><select id="ex-currency" class="input"><option>THB</option><option>JPY</option><option>USD</option></select></div>
        </div>
        <div class="grid grid-cols-3 gap-3">
          <div class="input-group"><label class="input-label">ส่วนลด</label><input id="ex-discount" class="input" type="number" step="0.01" value="0"></div>
          <div class="input-group"><label class="input-label">Service</label><input id="ex-service" class="input" type="number" step="0.01" value="0"></div>
          <div class="input-group"><label class="input-label">Tax</label><input id="ex-tax" class="input" type="number" step="0.01" value="0"></div>
        </div>
        <div class="input-group"><label class="input-label">Card Fee % (ถ้ามี)</label><input id="ex-cardfee-pct" class="input" type="number" step="0.01" value="0"></div>
        <div id="net-preview" class="p-3 rounded-xl bg-[var(--bg-secondary)] text-sm font-medium">ยอดสุทธิ: --</div>

        <div class="input-group"><label class="input-label">ผู้จ่าย</label><div id="payer-tiles" class="tile-grid"></div></div>
        <div class="input-group"><label class="input-label">วิธีแบ่ง</label><div class="segmented"><button type="button" data-split="equal" class="segmented-item active">หารเท่ากัน</button><button type="button" data-split="unequal" class="segmented-item">ระบุเอง</button><button type="button" data-split="percent" class="segmented-item">เปอร์เซ็นต์</button></div></div>
        <div id="split-area" class="space-y-3"></div>

        <div class="flex gap-3"><button type="button" id="cancel-expense" class="btn btn-secondary flex-1">ยกเลิก</button><button type="submit" id="submit-expense" class="btn btn-primary flex-1">บันทึก</button></div>
      </form>
    </div>
  `;

  let selectedPayer = members[0]?.id || currentUser.uid;
  let splitMethod = 'equal';
  let allocations = [];

  const payerTiles = document.getElementById('payer-tiles');
  payerTiles.innerHTML = members.map(m => `
    <div class="tile ${m.id===selectedPayer?'tile-selected':''}" data-payer="${m.id}">
      <div class="flex items-center gap-2"><div class="avatar w-8 h-8 text-xs" style="background:${m.color||'#6366f1'}">${getInitials(m.displayName)}</div><span class="text-sm font-medium">${escapeHtml(m.displayName)}</span></div>
    </div>
  `).join('');
  payerTiles.querySelectorAll('[data-payer]').forEach(el => el.onclick = () => {
    selectedPayer = el.dataset.payer;
    payerTiles.querySelectorAll('.tile').forEach(t => t.classList.remove('tile-selected'));
    el.classList.add('tile-selected');
    renderSplitArea();
  });

  const netPreview = document.getElementById('net-preview');
  function updateNet() {
    const sub = parseFloat(document.getElementById('ex-subtotal').value) || 0;
    const disc = parseFloat(document.getElementById('ex-discount').value) || 0;
    const serv = parseFloat(document.getElementById('ex-service').value) || 0;
    const tax = parseFloat(document.getElementById('ex-tax').value) || 0;
    const feePct = parseFloat(document.getElementById('ex-cardfee-pct').value) || 0;
    let net = sub - disc + serv + tax;
    net += net * (feePct/100);
    netPreview.textContent = `ยอดสุทธิ: ${net.toFixed(2)} ${document.getElementById('ex-currency').value}`;
    renderSplitArea();
  }
  ['ex-subtotal','ex-discount','ex-service','ex-tax','ex-cardfee-pct','ex-currency'].forEach(id => document.getElementById(id).addEventListener('input', updateNet));
  updateNet();

  function renderSplitArea() {
    const area = document.getElementById('split-area');
    const net = parseFloat(document.getElementById('ex-subtotal').value) || 0;
    const disc = parseFloat(document.getElementById('ex-discount').value) || 0;
    const serv = parseFloat(document.getElementById('ex-service').value) || 0;
    const tax = parseFloat(document.getElementById('ex-tax').value) || 0;
    const feePct = parseFloat(document.getElementById('ex-cardfee-pct').value) || 0;
    let netTotal = net - disc + serv + tax;
    netTotal += netTotal * (feePct/100);
    const netMinor = Math.round(netTotal*100);

    if (splitMethod === 'equal') {
      const count = members.length;
      const each = count ? netTotal / count : 0;
      area.innerHTML = members.map(m => `<div class="flex justify-between text-sm"><span>${escapeHtml(m.displayName)}</span><span>${each.toFixed(2)}</span></div>`).join('');
      allocations = members.map(m => ({ memberId: m.id, amountMinor: Math.floor(netMinor/members.length) }));
      // distribute remainder
      let rem = netMinor - allocations.reduce((s,a)=>s+a.amountMinor,0);
      for (let i=0;i<rem;i++) allocations[i%allocations.length].amountMinor+=1;
    } else if (splitMethod === 'unequal') {
      area.innerHTML = members.map(m => `<div class="flex gap-2 items-center"><span class="text-sm w-24">${escapeHtml(m.displayName)}</span><input data-alloc="${m.id}" class="input flex-1" type="number" step="0.01" placeholder="0.00"></div>`).join('');
      area.querySelectorAll('[data-alloc]').forEach(inp => inp.addEventListener('input', () => {
        const sum = Array.from(area.querySelectorAll('[data-alloc]')).reduce((s, el) => s + (parseFloat(el.value)||0),0);
        netPreview.textContent = `ยอดสุทธิ: ${netTotal.toFixed(2)} | กรอกแล้ว ${sum.toFixed(2)} | เหลือ ${(netTotal-sum).toFixed(2)}`;
        const submitBtn = document.getElementById('submit-expense');
        submitBtn.disabled = Math.abs(sum - netTotal) > 0.01;
      }));
    }
  }

  appEl.querySelectorAll('[data-split]').forEach(btn => btn.onclick = () => {
    appEl.querySelectorAll('[data-split]').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    splitMethod = btn.dataset.split;
    renderSplitArea();
  });

  renderSplitArea();

  document.getElementById('cancel-expense').onclick = () => history.back();
  document.getElementById('expense-form').onsubmit = async (e) => {
    e.preventDefault();
    const submitBtn = document.getElementById('submit-expense');
    submitBtn.disabled = true;
    const t = toast.loading('กำลังบันทึกค่าใช้จ่าย...');
    try {
      const subMinor = Math.round((parseFloat(document.getElementById('ex-subtotal').value)||0)*100);
      const discMinor = Math.round((parseFloat(document.getElementById('ex-discount').value)||0)*100);
      const servMinor = Math.round((parseFloat(document.getElementById('ex-service').value)||0)*100);
      const taxMinor = Math.round((parseFloat(document.getElementById('ex-tax').value)||0)*100);
      const feePct = parseFloat(document.getElementById('ex-cardfee-pct').value)||0;

      if (splitMethod === 'unequal') {
        const inputs = appEl.querySelectorAll('[data-alloc]');
        allocations = Array.from(inputs).map(inp => ({ memberId: inp.dataset.alloc, amountMinor: Math.round((parseFloat(inp.value)||0)*100) }));
      }

      // Step-up check if needed
      if (!hasStepUpSession()) {
        // Show PIN modal
        const pinOk = await new Promise(resolve => {
          showModal(`
            <h3 class="font-bold mb-3">ยืนยันการทำรายการสำคัญ</h3>
            <p class="text-sm text-[var(--text-secondary)] mb-3">กรอก PIN เพื่อยืนยันการเพิ่มค่าใช้จ่าย</p>
            <input id="stepup-pin" class="input" type="password" placeholder="PIN">
            <div class="flex gap-2 mt-4"><button id="cancel-pin" class="btn btn-secondary flex-1">ยกเลิก</button><button id="confirm-pin" class="btn btn-primary flex-1">ยืนยัน</button></div>
          `);
          setTimeout(() => {
            document.getElementById('cancel-pin').onclick = () => { document.querySelector('.bottom-sheet-backdrop')?.remove(); resolve(false); };
            document.getElementById('confirm-pin').onclick = async () => {
              const pin = document.getElementById('stepup-pin').value;
              try {
                const { verifySensitiveActionPin } = await import('./auth/index.js');
                await verifySensitiveActionPin(pin, 'add_expense');
                document.querySelector('.bottom-sheet-backdrop')?.remove();
                resolve(true);
              } catch (err) { toast.error('PIN ไม่ถูกต้อง'); }
            };
          }, 50);
        });
        if (!pinOk) { t.close(); submitBtn.disabled = false; return; }
      }

      await addExpense(tripId, {
        title: document.getElementById('ex-title').value,
        date: document.getElementById('ex-date').value,
        category: document.getElementById('ex-cat').value,
        subtotalMinor: subMinor,
        discountMinor: discMinor,
        serviceMinor: servMinor,
        taxMinor: taxMinor,
        cardFeePercent: feePct,
        currency: document.getElementById('ex-currency').value,
        baseCurrency: currentTrip.baseCurrency,
        payerId: selectedPayer,
        allocations,
        paymentMethod: 'cash'
      }, currentUser.uid);

      t.close();
      toast.success('บันทึกค่าใช้จ่ายสำเร็จ');
      location.hash = `#/trip/${tripId}/expenses`;
    } catch (err) { t.close(); toast.error(err.message); submitBtn.disabled = false; }
  };
}

async function renderSettlement(params) {
  const tripId = params.tripId;
  await loadTrip(tripId);
  appEl.innerHTML = `
    <div class="animate-fadeIn">
      <div class="flex items-center justify-between mb-4"><h1 class="text-xl font-bold">Settlement</h1><button id="recalc-settle" class="btn btn-primary btn-sm">คำนวณใหม่</button></div>
      <div id="settlement-content" class="space-y-4"><div class="skeleton h-32"></div></div>
      <div class="card p-4 mt-4"><h3 class="font-bold mb-2">Export</h3><div class="flex gap-2"><button id="copy-line" class="btn btn-secondary btn-sm">Copy LINE</button><button id="export-png" class="btn btn-secondary btn-sm">Export PNG</button></div></div>
    </div>
  `;

  async function load() {
    const content = document.getElementById('settlement-content');
    try {
      const { expenses, members } = await fetchSettlementData(tripId);
      const membersMap = Object.fromEntries(members.map(m => [m.id, m]));
      const { balances, transactions } = calculateSettlement(expenses, members);
      if (!transactions.length) {
        content.innerHTML = renderEmptyState({ title: 'ไม่มีหนี้ค้าง', desc: 'ทุกคนเคลียร์กันเรียบร้อยแล้ว' });
        return;
      }
      content.innerHTML = `
        <div class="grid md:grid-cols-2 gap-3">
          <div class="card p-4"><h4 class="font-bold text-sm mb-3">ยอดสุทธิต่อคน</h4>${balances.map(b => {
            const m = membersMap[b.memberId];
            return `<div class="flex justify-between text-sm py-1 border-b last:border-0" style="border-color:var(--border)"><span class="flex items-center gap-2"><span class="avatar w-6 h-6 text-[10px]" style="background:${m?.color||'#6366f1'}">${getInitials(m?.displayName||'')}</span>${escapeHtml(m?.displayName||b.memberId.slice(0,6))}</span><span class="${b.net>=0?'text-emerald-600':'text-red-500'} font-medium">${formatCurrency(b.net, currentTrip.baseCurrency)}</span></div>`;
          }).join('')}</div>
          <div class="card p-4"><h4 class="font-bold text-sm mb-3">ธุรกรรมที่ต้องทำ (${transactions.length})</h4><div id="tx-list" class="space-y-2">${transactions.map((tx, idx) => {
            const from = membersMap[tx.from]; const to = membersMap[tx.to];
            return `<div class="flex items-center justify-between p-3 rounded-xl bg-[var(--bg-secondary)]"><div class="flex items-center gap-2"><span class="avatar w-8 h-8 text-xs" style="background:${from?.color||'#ccc'}">${getInitials(from?.displayName||'')}</span><span>→</span><span class="avatar w-8 h-8 text-xs" style="background:${to?.color||'#ccc'}">${getInitials(to?.displayName||'')}</span></div><div class="text-right"><div class="font-bold text-sm">${formatCurrency(tx.amountMinor, currentTrip.baseCurrency)}</div><div class="text-[11px] text-[var(--text-secondary)]">${escapeHtml(from?.displayName||'')} → ${escapeHtml(to?.displayName||'')}</div></div></div>`;
          }).join('')}</div></div>
        </div>
      `;
      document.getElementById('copy-line').onclick = async () => {
        const { copySettlementAsLineText } = await import('./exports/index.js');
        const text = copySettlementAsLineText(transactions, membersMap, currentTrip.baseCurrency);
        await navigator.clipboard.writeText(text);
        toast.success('คัดลอกข้อความสำหรับ LINE แล้ว');
      };
      document.getElementById('export-png').onclick = async () => {
        const { exportToPng } = await import('./exports/index.js');
        await exportToPng('settlement-content', `settlement-${tripId}.png`);
      };
    } catch (e) { content.innerHTML = `<p class="text-sm text-red-500">${escapeHtml(e.message)}</p>`; }
  }

  document.getElementById('recalc-settle').onclick = async () => {
    const t = toast.loading('กำลังคำนวณ Settlement...');
    try { await recalculateAndSaveSettlement(tripId, currentUser.uid); t.close(); toast.success('คำนวณใหม่สำเร็จ'); load(); } catch (e) { t.close(); toast.error(e.message); }
  };

  load();
}

async function renderMembers(params) {
  const tripId = params.tripId;
  await loadTrip(tripId);
  appEl.innerHTML = `
    <div class="animate-fadeIn">
      <div class="flex items-center justify-between mb-4"><h1 class="text-xl font-bold">สมาชิก</h1><button id="add-member-btn" class="btn btn-primary btn-sm">+ เพิ่มสมาชิก</button></div>
      <div id="members-list" class="grid gap-3"></div>
    </div>
  `;

  async function loadMembers() {
    const list = document.getElementById('members-list');
    list.innerHTML = `<div class="skeleton h-16"></div>`;
    try {
      const { getDocs, collection } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
      const snap = await getDocs(collection(db, `trips/${tripId}/members`));
      const members = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      list.innerHTML = members.map(m => `
        <div class="card p-4 flex items-center justify-between">
          <div class="flex items-center gap-3"><div class="avatar" style="background:${m.color||'#6366f1'}">${getInitials(m.displayName)}</div><div><div class="font-semibold text-sm">${escapeHtml(m.displayName)}</div><div class="text-xs text-[var(--text-secondary)]">${escapeHtml(m.role||'member')} • ${escapeHtml(m.status||'active')}</div></div></div>
          <span class="badge badge-planned">${escapeHtml(m.role||'')}</span>
        </div>
      `).join('');
    } catch (e) { list.innerHTML = `<p class="text-sm text-red-500">${escapeHtml(e.message)}</p>`; }
  }

  document.getElementById('add-member-btn').onclick = () => {
    showBottomSheet(`
      <h3 class="font-bold text-lg mb-4">เพิ่มสมาชิก (Username + PIN)</h3>
      <form id="add-member-form" class="space-y-4">
        <div class="input-group"><label class="input-label">Username</label><input id="m-user" class="input" required></div>
        <div class="input-group"><label class="input-label">Display Name</label><input id="m-name" class="input" required></div>
        <div class="input-group"><label class="input-label">PIN (4-12 ตัว)</label><input id="m-pin" class="input" type="password" required></div>
        <div class="input-group"><label class="input-label">Role</label><select id="m-role" class="input"><option value="member">Member</option><option value="trip_admin">Trip Admin</option><option value="viewer">Viewer</option></select></div>
        <button class="btn btn-primary w-full">สร้างบัญชี</button>
      </form>
    `);
    setTimeout(() => {
      document.getElementById('add-member-form').onsubmit = async (e) => {
        e.preventDefault();
        const t = toast.loading('กำลังสร้างบัญชี...');
        try {
          const { getFunctions, httpsCallable } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js');
          const { functions } = await import('./firebase.js');
          const fn = httpsCallable(functions, 'createMemberAccount');
          await fn({
            tripId,
            username: document.getElementById('m-user').value,
            pin: document.getElementById('m-pin').value,
            displayName: document.getElementById('m-name').value,
            role: document.getElementById('m-role').value
          });
          t.close();
          toast.success('สร้างสมาชิกสำเร็จ');
          document.querySelector('.bottom-sheet-backdrop')?.click();
          loadMembers();
        } catch (err) { t.close(); toast.error(err.message); }
      };
    }, 50);
  };

  loadMembers();
}

async function renderImportExport(params) {
  const tripId = params.tripId;
  await loadTrip(tripId);
  appEl.innerHTML = `
    <div class="animate-fadeIn max-w-[720px] mx-auto space-y-6">
      <h1 class="text-xl font-bold">Import / Export</h1>
      <div class="card p-6 space-y-4">
        <h3 class="font-bold">ดาวน์โหลด Template</h3>
        <div class="flex gap-2"><button data-tpl="csv" class="btn btn-secondary btn-sm">CSV</button><button data-tpl="xlsx" class="btn btn-secondary btn-sm">XLSX</button><button data-tpl="json" class="btn btn-secondary btn-sm">JSON</button></div>
      </div>
      <div class="card p-6 space-y-4">
        <h3 class="font-bold">อัปโหลดไฟล์</h3>
        <input id="import-file" type="file" accept=".csv,.xlsx,.xls,.json" class="input">
        <div id="import-preview" class="text-sm"></div>
        <div class="flex gap-2"><button id="validate-import" class="btn btn-secondary">Validate</button><button id="do-import" class="btn btn-primary" disabled>Import</button></div>
      </div>
      <div class="card p-6 space-y-4">
        <h3 class="font-bold">Export ข้อมูล</h3>
        <div class="flex flex-wrap gap-2"><button id="exp-itinerary" class="btn btn-secondary btn-sm">Export Itinerary PNG</button><button id="exp-expenses" class="btn btn-secondary btn-sm">Export Expenses CSV</button></div>
      </div>
    </div>
  `;

  appEl.querySelectorAll('[data-tpl]').forEach(btn => btn.onclick = async () => {
    const { downloadTemplate } = await import('./imports/index.js');
    await downloadTemplate(btn.dataset.tpl);
  });

  let parsedRows = null;
  document.getElementById('validate-import').onclick = async () => {
    const file = document.getElementById('import-file').files[0];
    if (!file) return toast.warning('เลือกไฟล์ก่อน');
    const t = toast.loading('กำลังอ่านไฟล์...');
    try {
      const { parseImportFile, validateItineraryImportRows } = await import('./imports/index.js');
      const rows = await parseImportFile(file);
      const { validRows, errors } = validateItineraryImportRows(Array.isArray(rows) ? rows : [rows]);
      parsedRows = validRows;
      document.getElementById('import-preview').innerHTML = `<p>Valid: ${validRows.length}, Errors: ${errors.length}</p>${errors.length ? `<pre class="mt-2 p-2 bg-[var(--bg-secondary)] rounded text-xs overflow-auto">${escapeHtml(JSON.stringify(errors.slice(0,5), null, 2))}</pre>` : ''}`;
      document.getElementById('do-import').disabled = validRows.length === 0;
      t.close();
      if (errors.length) toast.warning(`พบ ${errors.length} แถวผิดพลาด`);
      else toast.success(`พร้อม Import ${validRows.length} แถว`);
    } catch (e) { t.close(); toast.error(e.message); }
  };

  document.getElementById('do-import').onclick = async () => {
    if (!parsedRows) return;
    const t = toast.loading('กำลัง Import...');
    try {
      const { transformImportRowsToItems } = await import('./imports/index.js');
      const items = transformImportRowsToItems(parsedRows, tripId);
      // Batch write
      const { writeBatch, collection, doc, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
      const { db } = await import('./firebase.js');
      const batch = writeBatch(db);
      for (const it of items) {
        const ref = doc(collection(db, `trips/${tripId}/itineraryItems`));
        batch.set(ref, { ...it, createdBy: currentUser.uid, updatedBy: currentUser.uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), version: 1, status: 'planned' });
      }
      await batch.commit();
      t.close();
      toast.success(`Import ${items.length} รายการสำเร็จ`);
    } catch (e) { t.close(); toast.error(e.message); }
  };
}

async function renderSettings(params) {
  const tripId = params.tripId;
  await loadTrip(tripId);
  appEl.innerHTML = `
    <div class="animate-fadeIn max-w-[640px] mx-auto">
      <h1 class="text-xl font-bold mb-4">Settings</h1>
      <div class="card p-6 space-y-4">
        <div class="input-group"><label class="input-label">ชื่อทริป</label><input id="s-name" class="input" value="${escapeHtml(currentTrip.name)}"></div>
        <div class="input-group"><label class="input-label">Base Currency</label><input id="s-currency" class="input" value="${escapeHtml(currentTrip.baseCurrency)}"></div>
        <div class="input-group"><label class="input-label">Timezone</label><input id="s-tz" class="input" value="${escapeHtml(currentTrip.timezone)}"></div>
        <button id="save-settings" class="btn btn-primary w-full">บันทึก</button>
      </div>
      <div class="card p-6 mt-4">
        <h3 class="font-bold mb-2">Danger Zone</h3>
        <p class="text-xs text-[var(--text-secondary)] mb-3">การเปลี่ยนสถานะทริปต้องยืนยันด้วย PIN</p>
        <select id="trip-status" class="input mb-3"><option value="draft">Draft</option><option value="active">Active</option><option value="completed">Completed</option><option value="archived">Archived</option></select>
        <button id="change-status" class="btn btn-danger w-full">เปลี่ยนสถานะ</button>
      </div>
    </div>
  `;
  document.getElementById('save-settings').onclick = async () => {
    const t = toast.loading('บันทึก...');
    try {
      const { updateTrip } = await import('./trips/index.js');
      await updateTrip(tripId, { name: document.getElementById('s-name').value, baseCurrency: document.getElementById('s-currency').value, timezone: document.getElementById('s-tz').value });
      t.close(); toast.success('บันทึกสำเร็จ');
    } catch (e) { t.close(); toast.error(e.message); }
  };
}

function renderMore(params) {
  const tripId = params.tripId;
  appEl.innerHTML = `
    <div class="animate-fadeIn max-w-[640px] mx-auto space-y-3">
      <h1 class="text-xl font-bold mb-4">More</h1>
      <div class="grid gap-2">
        <a href="#/trip/${tripId}/dashboard" class="card p-4 flex items-center justify-between"><span>Dashboard</span><i data-lucide="chevron-right" class="w-4 h-4"></i></a>
        <a href="#/trip/${tripId}/members" class="card p-4 flex items-center justify-between"><span>Members</span><i data-lucide="chevron-right" class="w-4 h-4"></i></a>
        <a href="#/trip/${tripId}/import" class="card p-4 flex items-center justify-between"><span>Import / Export</span><i data-lucide="chevron-right" class="w-4 h-4"></i></a>
        <a href="#/trip/${tripId}/settings" class="card p-4 flex items-center justify-between"><span>Settings</span><i data-lucide="chevron-right" class="w-4 h-4"></i></a>
        <a href="#/trips" class="card p-4 flex items-center justify-between"><span>สลับทริป</span><i data-lucide="chevron-right" class="w-4 h-4"></i></a>
        <button id="logout-more" class="card p-4 w-full text-left text-red-500">Logout</button>
      </div>
    </div>
  `;
  document.getElementById('logout-more').onclick = async () => { await logout(); location.hash = '#/login'; };
  if (window.lucide) lucide.createIcons();
}

// Initialize icons after load
window.addEventListener('load', () => { if (window.lucide) lucide.createIcons(); });
