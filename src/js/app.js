import { auth, db, isFirebaseConfigured, onAuthStateChanged, syncState } from './firebase.js';
import { Router } from './router.js';
import { toast } from './components/toast.js';
import { renderFujiMascot, renderEmptyState } from './components/fuji.js';
import { loginAdmin, loginMember, logout, hasStepUpSession } from './auth/index.js';
import { listTrips, getTrip, createTrip } from './trips/index.js';
import { fetchItinerary, addItineraryItem, reorderItinerary } from './itinerary/index.js';
import { fetchExpenses, addExpense } from './expenses/index.js';
import { fetchSettlementData, recalculateAndSaveSettlement } from './settlement/index.js';
import { dayjs, getCurrentTimes, formatDate, formatTime, formatDuration, getTripDays, determineUpNextDay } from './utils/date.js';
import { formatCurrency } from './utils/currency.js';
import { calculateSettlement } from './utils/settlement.js';
import { escapeHtml } from './utils/sanitize.js';
import { showBottomSheet, showModal } from './components/modal.js';
import { parseCoordinates, getInitials, compressImage } from './utils/helpers.js';
import { t, setLang, getLang } from './utils/i18n.js';

const appEl = document.getElementById('app');
const headerSubtitle = document.getElementById('header-subtitle');
const desktopNavEl = document.getElementById('desktop-nav');
const bottomNavEl = document.getElementById('bottom-nav');
const fabEl = document.getElementById('fab');
const userAvatarBtn = document.getElementById('user-avatar-btn');
const refreshBtn = document.getElementById('refresh-btn');
const fujiLoaderEl = document.getElementById('fuji-loader');

if (fujiLoaderEl) fujiLoaderEl.innerHTML = renderFujiMascot('loading', 80);

// --- Clocks optimized ---
function updateClocks() {
  const times = getCurrentTimes();
  const bkk = document.getElementById('clock-bkk');
  const tokyo = document.getElementById('clock-tokyo');
  if (bkk) bkk.textContent = `BKK ${times.bangkok.format('HH:mm')}`;
  if (tokyo) tokyo.textContent = `TYO ${times.tokyo.format('HH:mm')}`;
}
updateClocks();
setInterval(updateClocks, 60000);

// --- Sync status ---
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

// --- Theme handling - cohesive muted pastel ---
const themes = [
  { id: 'sage', name: 'Sage', colors: ['#8bb89a', '#a8c5b5'], icon: '🌿', desc: 'เขียวพาสเทลหลัก' },
  { id: 'fuji', name: 'Fuji Mist', colors: ['#8aa89a', '#b5c5b5'], icon: '🗻', desc: 'ฟูจิหมอกมินิมอล' },
  { id: 'sakura', name: 'Sakura Dust', colors: ['#b89aa0', '#c5b5a0'], icon: '🌸', desc: 'ซากุระฝุ่น' },
  { id: 'ocean', name: 'Ocean Mist', colors: ['#8aa8b5', '#a0b5c5'], icon: '🌊', desc: 'มหาสมุทรหมอก' },
  { id: 'sunset', name: 'Sand', colors: ['#b5a08a', '#c5b5a0'], icon: '🏜️', desc: 'ทรายอบอุ่น' },
  { id: 'lavender', name: 'Fog', colors: ['#9a9ab5', '#b5b5c5'], icon: '🌫️', desc: 'หมอกม่วงเทา' },
];

function applyTheme(colorId) {
  document.documentElement.setAttribute('data-color', colorId);
  localStorage.setItem('fuji_color_theme', colorId);
}

function initTheme() {
  const saved = localStorage.getItem('fuji_color_theme') || 'sage';
  applyTheme(saved);
  const darkSaved = localStorage.getItem('fuji_theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = darkSaved || (prefersDark ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', theme);
  updateDarkIcon();
}

function updateDarkIcon() {
  const btn = document.getElementById('header-dark-btn');
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  if (btn) btn.innerHTML = isDark ? '☀️' : '🌙';
}

function toggleDark() {
  const cur = document.documentElement.getAttribute('data-theme');
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('fuji_theme', next);
  updateDarkIcon();
  toast.success(next === 'dark' ? '🌙 โหมดมืด' : '☀️ โหมดสว่าง');
}

initTheme();

function setTrip(tripId) {
  currentTripId = tripId;
  if (tripId) localStorage.setItem('fuji_current_trip', tripId);
  else localStorage.removeItem('fuji_current_trip');
}

// --- Desktop Nav - FAST, use <a> links no JS delay ---
function renderDesktopNav() {
  if (!currentTripId) { desktopNavEl.innerHTML = ''; return; }
  const base = `#/trip/${currentTripId}`;
  const currentHash = location.hash.split('?')[0];
  const items = [
    { label: t('dashboard'), path: `${base}/dashboard`, icon: 'layout-dashboard' },
    { label: t('itinerary'), path: `${base}/itinerary`, icon: 'map-pinned' },
    { label: t('map'), path: `${base}/map`, icon: 'map' },
    { label: t('expenses'), path: `${base}/expenses`, icon: 'wallet' },
    { label: t('settlement'), path: `${base}/settlement`, icon: 'hand-coins' },
    { label: t('members'), path: `${base}/members`, icon: 'users' },
    { label: t('importExport'), path: `${base}/import`, icon: 'file-up' },
    { label: t('settings'), path: `${base}/settings`, icon: 'settings' },
  ];
  desktopNavEl.innerHTML = items.map(i => {
    const active = currentHash.startsWith(i.path) ? 'chip-active active' : '';
    return `<a href="${i.path}" class="chip menu-item ${active}" data-nav="${i.path}" style="text-decoration:none;"><i data-lucide="${i.icon}" class="w-4 h-4"></i>${i.label}</a>`;
  }).join('');
  if (window.lucide) lucide.createIcons();
}

// --- Bottom Nav - FAST instant navigation ---
function updateBottomNav() {
  if (!currentTripId) return;
  const base = `#/trip/${currentTripId}`;
  const currentHash = location.hash.split('?')[0];
  bottomNavEl.querySelectorAll('.bottom-nav-item').forEach(btn => {
    const originalRoute = btn.getAttribute('data-route'); // e.g. #/trip/dashboard
    const route = originalRoute.replace('#/trip', base);
    btn.setAttribute('data-full-route', route);
    if (currentHash.startsWith(route)) btn.classList.add('active');
    else btn.classList.remove('active');
    // Use immediate navigation, no delay
    btn.onclick = null;
    btn.addEventListener('click', () => {
      location.hash = route;
    }, { once: false });
  });
}

function renderFAB(route) {
  if (!currentTripId) { fabEl.classList.add('hidden'); return; }
  const cleanRoute = route.split('?')[0];
  if (cleanRoute.includes('/itinerary') || cleanRoute.includes('/expenses')) {
    fabEl.classList.remove('hidden');
    fabEl.onclick = () => {
      if (cleanRoute.includes('/itinerary')) location.hash = `#/trip/${currentTripId}/itinerary?action=add`;
      if (cleanRoute.includes('/expenses')) location.hash = `#/trip/${currentTripId}/expenses/add`;
    };
  } else fabEl.classList.add('hidden');
}

// --- Header Controls - dark/light, theme, lang, user name ---
function addHeaderControls() {
  const header = document.getElementById('app-header');
  if (!header) return;
  if (document.getElementById('header-controls')) return;
  
  const rightGroup = header.querySelector('.flex.items-center.gap-1\\.5') || header.querySelector('.flex.items-center.gap-2');
  if (!rightGroup) return;
  
  const controlsDiv = document.createElement('div');
  controlsDiv.id = 'header-controls';
  controlsDiv.className = 'flex items-center gap-1';
  controlsDiv.innerHTML = `
    <button id="header-lang-btn" class="btn btn-ghost btn-sm text-xs font-bold" title="${t('language')}">${getLang() === 'th' ? 'EN' : 'TH'}</button>
    <button id="header-dark-btn" class="btn btn-ghost btn-icon w-9 h-9 text-sm" title="Dark/Light">🌙</button>
    <button id="header-theme-btn" class="btn btn-ghost btn-icon w-9 h-9 text-sm" title="${t('theme')}">🎨</button>
  `;
  
  rightGroup.insertBefore(controlsDiv, rightGroup.firstChild);
  
  document.getElementById('header-lang-btn').onclick = () => {
    const newLang = getLang() === 'th' ? 'en' : 'th';
    setLang(newLang);
    document.getElementById('header-lang-btn').textContent = newLang === 'th' ? 'EN' : 'TH';
    // Re-render without reload
    renderDesktopNav();
    updateBottomNav();
    if (headerSubtitle && currentTrip) headerSubtitle.textContent = currentTrip.name;
    toast.success(newLang === 'th' ? 'เปลี่ยนเป็นไทยแล้ว' : 'Switched to English');
    // Re-render current page
    setTimeout(() => router.handle(), 50);
  };
  
  document.getElementById('header-dark-btn').onclick = toggleDark;
  document.getElementById('header-theme-btn').onclick = showThemePicker;
  
  updateDarkIcon();
}

// Add user name display
function updateUserDisplay(user) {
  // Create or update user name element
  let nameEl = document.getElementById('user-display-name');
  if (!nameEl) {
    const userMenu = document.getElementById('user-menu');
    if (userMenu && userMenu.parentElement) {
      nameEl = document.createElement('div');
      nameEl.id = 'user-display-name';
      nameEl.className = 'hidden md:flex flex-col items-end mr-2 text-right';
      nameEl.innerHTML = `<span class="text-[13px] font-semibold leading-none" id="user-name-text"></span><span class="text-[11px] text-[var(--text-tertiary)]" id="user-email-text"></span>`;
      userMenu.parentElement.insertBefore(nameEl, userMenu);
    }
  }
  if (nameEl) {
    const nameText = document.getElementById('user-name-text');
    const emailText = document.getElementById('user-email-text');
    if (user) {
      nameText.textContent = user.displayName || user.email?.split('@')[0] || 'User';
      emailText.textContent = user.email || user.uid?.slice(0,8) || '';
      nameEl.classList.remove('hidden');
      nameEl.classList.add('md:flex');
    } else {
      nameEl.classList.add('hidden');
    }
  }
}

// --- Auth state ---
if (!isFirebaseConfigured) {
  setTimeout(() => renderConfigNeeded(), 50);
} else if (auth) {
  onAuthStateChanged(auth, async user => {
    if (!isFirebaseConfigured) { renderConfigNeeded(); return; }
    currentUser = user;
    if (user) {
      const initial = (user.displayName || user.email || '?')[0].toUpperCase();
      userAvatarBtn.textContent = initial;
      updateUserDisplay(user);
      userAvatarBtn.onclick = () => showBottomSheet(`
        <div class="space-y-4">
          <div class="flex items-center gap-3">
            <div class="avatar w-12 h-12 text-sm" style="background: var(--gradient-primary);">${initial}</div>
            <div>
              <h3 class="font-bold">${escapeHtml(user.displayName || user.email || 'User')}</h3>
              <p class="text-xs text-[var(--text-secondary)]">${escapeHtml(user.email || user.uid.slice(0,8))}</p>
            </div>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <button id="lang-toggle" class="btn btn-secondary btn-sm">🌐 ${getLang() === 'th' ? 'EN' : 'ไทย'}</button>
            <button id="theme-picker-btn" class="btn btn-secondary btn-sm">🎨 ${t('theme')}</button>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <button id="toggle-dark-sheet" class="btn btn-secondary btn-sm">${document.documentElement.getAttribute('data-theme') === 'dark' ? '☀️ Light' : '🌙 Dark'}</button>
            <button id="user-settings" class="btn btn-secondary btn-sm">⚙️ ${t('settings')}</button>
          </div>
          <button id="logout-btn" class="btn btn-secondary w-full">${t('logout')}</button>
          <button id="forget-device" class="btn btn-ghost w-full text-xs">ลืมอุปกรณ์นี้ / Clear Cache</button>
        </div>
      `, {});
      setTimeout(() => {
        document.getElementById('logout-btn')?.addEventListener('click', async () => { 
          const btn = document.getElementById('logout-btn');
          btn.disabled = true; btn.textContent = '...';
          await logout(); 
          location.hash = '#/login'; 
        });
        document.getElementById('forget-device')?.addEventListener('click', () => { localStorage.clear(); location.reload(); });
        document.getElementById('lang-toggle')?.addEventListener('click', () => {
          const newLang = getLang() === 'th' ? 'en' : 'th';
          setLang(newLang);
          toast.success(newLang === 'th' ? 'ไทย' : 'English');
          document.querySelector('.bottom-sheet-backdrop')?.click();
          setTimeout(() => router.handle(), 100);
        });
        document.getElementById('theme-picker-btn')?.addEventListener('click', () => {
          document.querySelector('.bottom-sheet-backdrop')?.click();
          setTimeout(() => showThemePicker(), 200);
        });
        document.getElementById('toggle-dark-sheet')?.addEventListener('click', () => {
          toggleDark();
          document.getElementById('toggle-dark-sheet').textContent = document.documentElement.getAttribute('data-theme') === 'dark' ? '☀️ Light' : '🌙 Dark';
        });
        document.getElementById('user-settings')?.addEventListener('click', () => {
          document.querySelector('.bottom-sheet-backdrop')?.click();
          if (currentTripId) location.hash = `#/trip/${currentTripId}/settings`;
        });
      }, 10);
      if (location.hash.includes('login')) location.hash = '#/trips';
    } else {
      userAvatarBtn.textContent = '?';
      updateUserDisplay(null);
      userAvatarBtn.onclick = () => location.hash = '#/login';
      if (!isFirebaseConfigured) { renderConfigNeeded(); return; }
      if (!location.hash.includes('login') && !location.hash.includes('config')) location.hash = '#/login';
    }
    if (window.lucide) lucide.createIcons();
  });
}

function showThemePicker() {
  const current = localStorage.getItem('fuji_color_theme') || 'sage';
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  showBottomSheet(`
    <h3 class="font-bold text-lg mb-1">🎨 ${t('theme')}</h3>
    <p class="text-xs text-[var(--text-secondary)] mb-4">เลือกโทนสีมินิมอลน่ารัก ทั้งหมดเป็น muted pastel เข้าพวกกัน</p>
    <div class="theme-grid">
      ${themes.map(th => `
        <button class="theme-option ${current === th.id ? 'active' : ''}" data-theme="${th.id}" style="background: linear-gradient(135deg, ${th.colors[0]}, ${th.colors[1]});" title="${th.name}">
          <span style="position:absolute; bottom:6px; left:50%; transform:translateX(-50%); background:rgba(255,255,255,0.9); padding:2px 8px; border-radius:20px; font-size:10px; font-weight:700; white-space:nowrap;">${th.icon} ${th.name}</span>
        </button>
      `).join('')}
    </div>
    <p class="text-[11px] text-[var(--text-tertiary)] mt-3">💡 ทุกธีมเป็น muted low-saturation เข้าพวกกัน ไม่ฉูดฉาด</p>
    <div class="flex gap-2 mt-6">
      <button id="toggle-dark" class="btn btn-secondary flex-1 btn-sm">${isDark ? '☀️ Light' : '🌙 Dark'}</button>
      <button class="btn btn-ghost flex-1 btn-sm" onclick="document.querySelector('.bottom-sheet-backdrop')?.click()">${t('cancel')}</button>
    </div>
  `);
  setTimeout(() => {
    document.querySelectorAll('.theme-option').forEach(btn => {
      btn.addEventListener('click', () => {
        applyTheme(btn.dataset.theme);
        document.querySelectorAll('.theme-option').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        toast.success(`เปลี่ยนเป็น ${btn.dataset.theme} แล้ว`);
        renderDesktopNav();
      });
    });
    document.getElementById('toggle-dark').addEventListener('click', () => {
      toggleDark();
      document.getElementById('toggle-dark').textContent = document.documentElement.getAttribute('data-theme') === 'dark' ? '☀️ Light' : '🌙 Dark';
    });
  }, 10);
}

// --- Routes ---
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
  if (!isFirebaseConfigured) {
    renderConfigNeeded();
    return false;
  }
  // No heavy animation blocking navigation
  if (matched.params?.tripId) {
    setTrip(matched.params.tripId);
  }
  renderDesktopNav();
  updateBottomNav();
  renderFAB(matched.path);
  if (!currentUser && matched.path !== '/login') {
    location.hash = '#/login';
    return false;
  }
};

function earlyConfigCheck() {
  if (!isFirebaseConfigured) {
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
router.init();
if (isEarlyBlocked) {
  setTimeout(() => { if (!isFirebaseConfigured) renderConfigNeeded(); }, 200);
}
setTimeout(addHeaderControls, 100);

// --- Refresh - instant ---
refreshBtn?.addEventListener('click', () => {
  syncState.set('syncing');
  toast.success(getLang() === 'th' ? 'รีเฟรชแล้ว' : 'Refreshed');
  router.handle();
  setTimeout(() => syncState.set('online'), 300);
});

// --- Views ---
function renderConfigNeeded() {
  const saved = localStorage.getItem('fuji_firebase_config');
  let savedPretty = '';
  try { savedPretty = saved ? JSON.stringify(JSON.parse(saved), null, 2) : ''; } catch { savedPretty = saved || ''; }
  appEl.innerHTML = `
    <div class="max-w-[720px] mx-auto page-enter">
      <div class="card p-8">
        <div class="text-center mb-6">${renderFujiMascot('normal', 120)}</div>
        <h1 class="text-2xl font-bold mb-2" style="font-family: var(--font-display);">ตั้งค่า Firebase 🌿</h1>
        <p class="text-sm text-[var(--text-secondary)] mb-6">วาง Config ครั้งเดียว เก็บใน Browser — โทนพาสเทล muted ทั้งหมดเข้าพวกกันแล้ว!</p>

        <div class="p-4 rounded-xl border mb-6" style="border-color:var(--border); background:var(--bg-secondary);">
          <h3 class="font-bold text-sm mb-2">📍 เอา Config มาจากไหน?</h3>
          <ol class="text-xs leading-6 list-decimal pl-4 space-y-1">
            <li>ไปที่ <a href="https://console.firebase.google.com" target="_blank" class="text-[var(--primary)] underline">Firebase Console</a> > สร้างโปรเจกต์</li>
            <li>Project Settings > Your apps > Web app > Config</li>
            <li>คัดลอก <code>{ ... }</code> มาวางด้านล่าง</li>
          </ol>
        </div>

        <div class="space-y-5">
          <div class="input-group">
            <label class="input-label">🔑 Firebase Config JSON</label>
            <textarea id="cfg-input" class="input min-h-[160px] font-mono text-xs" placeholder='{"apiKey":"...","authDomain":"...","projectId":"...","storageBucket":"...","messagingSenderId":"...","appId":"..."}'>${escapeHtml(savedPretty)}</textarea>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-3 p-4 rounded-xl border" style="border-color:var(--border);">
            <h4 class="md:col-span-2 font-bold text-sm">✏️ กรอกแยกฟิลด์</h4>
            <div class="input-group"><label class="input-label">apiKey</label><input id="cfg-apikey" class="input text-xs"></div>
            <div class="input-group"><label class="input-label">authDomain</label><input id="cfg-auth" class="input text-xs"></div>
            <div class="input-group"><label class="input-label">projectId</label><input id="cfg-project" class="input text-xs"></div>
            <div class="input-group"><label class="input-label">storageBucket</label><input id="cfg-bucket" class="input text-xs"></div>
            <div class="input-group"><label class="input-label">messagingSenderId</label><input id="cfg-sender" class="input text-xs"></div>
            <div class="input-group"><label class="input-label">appId</label><input id="cfg-appid" class="input text-xs"></div>
            <button id="build-json" type="button" class="md:col-span-2 btn btn-secondary btn-sm">รวมเป็น JSON</button>
          </div>

          <div class="flex gap-2">
            <button id="save-cfg" class="btn btn-primary flex-1 btn-lg">💾 บันทึกและรีโหลด</button>
            <button id="clear-cfg" class="btn btn-ghost">ล้าง</button>
          </div>
          <div class="flex gap-2">
            <button id="test-cfg" class="btn btn-secondary flex-1 btn-sm">ทดสอบ</button>
            <button id="copy-example" class="btn btn-secondary flex-1 btn-sm">ตัวอย่าง</button>
          </div>
        </div>

        <div class="mt-6 p-4 rounded-xl bg-[var(--bg-secondary)] text-xs leading-relaxed">
          <strong>🌿 โทนสีใหม่:</strong> ทั้ง 6 ธีมเป็น muted pastel เข้าพวกกันหมดแล้ว (sage, fuji mist, sakura dust, ocean mist, sand, fog) ไม่ฉูดฉาด<br>
          เปลี่ยนธีมได้ที่ปุ่ม 🎨 + โหมดมืดสว่าง 🌙/☀️ มุมขวาบน
        </div>
      </div>
    </div>
  `;

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
    toast.success('รวม JSON แล้ว');
  };

  document.getElementById('test-cfg').onclick = () => {
    try {
      const json = JSON.parse(document.getElementById('cfg-input').value);
      const required = ['apiKey','authDomain','projectId','storageBucket','messagingSenderId','appId'];
      const missing = required.filter(k => !json[k]);
      if (missing.length) throw new Error('ขาด: ' + missing.join(', '));
      toast.success('✅ JSON ถูกต้อง');
    } catch (e) { toast.error('❌ ' + e.message); }
  };

  document.getElementById('copy-example').onclick = async () => {
    const example = `{
  "apiKey": "AIzaSy...",
  "authDomain": "your-project.firebaseapp.com",
  "projectId": "your-project-id",
  "storageBucket": "your-project.appspot.com",
  "messagingSenderId": "1234567890",
  "appId": "1:1234567890:web:abcdef"
}`;
    await navigator.clipboard.writeText(example);
    toast.success('คัดลอกแล้ว');
  };

  document.getElementById('clear-cfg').onclick = () => {
    localStorage.removeItem('fuji_firebase_config');
    document.getElementById('cfg-input').value = '';
    ['cfg-apikey','cfg-auth','cfg-project','cfg-bucket','cfg-sender','cfg-appid'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    toast.warning('ล้างแล้ว');
  };

  document.getElementById('save-cfg').onclick = () => {
    const btn = document.getElementById('save-cfg');
    btn.disabled = true;
    btn.textContent = 'กำลังบันทึก...';
    try {
      const raw = document.getElementById('cfg-input').value.trim();
      if (!raw) throw new Error('กรุณาวาง JSON');
      const json = JSON.parse(raw);
      const required = ['apiKey','authDomain','projectId','storageBucket','messagingSenderId','appId'];
      for (const k of required) if (!json[k]) throw new Error('ขาด ' + k);
      localStorage.setItem('fuji_firebase_config', JSON.stringify(json));
      toast.success('บันทึกแล้ว รีโหลด...');
      setTimeout(() => location.reload(), 600);
    } catch (e) {
      toast.error('❌ ' + e.message);
      btn.disabled = false;
      btn.textContent = '💾 บันทึกและรีโหลด';
    }
  };
}

function renderLogin() {
  if (!isFirebaseConfigured) return renderConfigNeeded();
  const lang = getLang();
  appEl.innerHTML = `
    <div class="min-h-[75vh] grid place-items-center page-enter">
      <div class="w-full max-w-[440px]">
        <div class="text-center mb-8">
          ${renderFujiMascot('normal', 140)}
          <h1 class="text-[32px] font-bold mt-4 tracking-tight" style="font-family: var(--font-display);">${t('appName')}</h1>
          <p class="text-sm text-[var(--text-secondary)] mt-2">${t('tagline')}</p>
          <div class="flex justify-center gap-2 mt-4">
            <button id="login-lang" class="chip text-xs">${lang === 'th' ? '🇹🇭 ไทย' : '🇺🇸 EN'} • ${lang === 'th' ? 'Switch to EN' : 'เปลี่ยนเป็นไทย'}</button>
            <button id="login-theme" class="chip text-xs">🎨 ${t('theme')}</button>
            <button id="login-dark" class="chip text-xs">${document.documentElement.getAttribute('data-theme') === 'dark' ? '☀️ Light' : '🌙 Dark'}</button>
          </div>
        </div>
        <div class="card p-7">
          <div class="segmented mb-6">
            <button data-tab="admin" class="segmented-item active">${t('admin')}</button>
            <button data-tab="member" class="segmented-item">${t('member')}</button>
          </div>

          <div id="tab-admin">
            <form id="admin-form" class="space-y-4">
              <div class="input-group"><label class="input-label">📧 ${t('email')}</label><input id="admin-email" class="input" type="email" placeholder="admin@example.com" required></div>
              <div class="input-group"><label class="input-label">🔑 ${t('password')}</label><input id="admin-pass" class="input" type="password" required></div>
              <label class="flex items-center gap-2 text-sm cursor-pointer"><input id="admin-remember" type="checkbox" checked> ${t('rememberDevice')}</label>
              <button class="btn btn-primary w-full btn-lg" type="submit">${t('loginAdmin')}</button>
            </form>
          </div>

          <div id="tab-member" class="hidden">
            <form id="member-form" class="space-y-4">
              <div class="input-group"><label class="input-label">🗺️ Trip ID</label><input id="member-trip" class="input" placeholder="${lang==='th' ? 'เว้นว่างได้' : 'Optional'}"></div>
              <div class="input-group"><label class="input-label">👤 ${t('username')}</label><input id="member-user" class="input" placeholder="fuji_user" required></div>
              <div class="input-group"><label class="input-label">🔢 ${t('pin')}</label><input id="member-pin" class="input" type="password" inputmode="numeric" placeholder="****" required></div>
              <label class="flex items-center gap-2 text-sm cursor-pointer"><input id="member-remember" type="checkbox" checked> ${t('rememberDevice')}</label>
              <button class="btn btn-primary w-full btn-lg" type="submit">${t('loginMember')}</button>
            </form>
          </div>

          <p class="text-[11px] text-center text-[var(--text-tertiary)] mt-6 leading-relaxed">🔒 Member login ผ่าน Cloud Function<br>🌿 โทน muted pastel ทั้งหมดเข้าพวกกัน</p>
        </div>
      </div>
    </div>
  `;
  
  document.getElementById('login-lang').onclick = () => {
    const newLang = lang === 'th' ? 'en' : 'th';
    setLang(newLang);
    renderLogin();
    toast.success(newLang === 'th' ? 'ไทย' : 'English');
  };
  document.getElementById('login-theme').onclick = showThemePicker;
  document.getElementById('login-dark').onclick = toggleDark;
  
  const tabs = appEl.querySelectorAll('.segmented-item');
  tabs.forEach(btn => btn.addEventListener('click', () => {
    tabs.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    appEl.querySelector('#tab-admin').classList.toggle('hidden', btn.dataset.tab !== 'admin');
    appEl.querySelector('#tab-member').classList.toggle('hidden', btn.dataset.tab !== 'member');
  }));

  appEl.querySelector('#admin-form').onsubmit = async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    const originalText = btn.textContent;
    btn.textContent = lang==='th' ? 'กำลังเข้าสู่ระบบ...' : 'Logging in...';
    const tLoad = toast.loading(lang==='th' ? 'กำลังเข้าสู่ระบบ...' : 'Logging in...');
    try {
      await loginAdmin(document.getElementById('admin-email').value, document.getElementById('admin-pass').value, document.getElementById('admin-remember').checked);
      tLoad.close();
      toast.success(lang==='th' ? 'เข้าสู่ระบบสำเร็จ 🌿' : 'Login success 🌿');
      location.hash = '#/trips';
    } catch (err) {
      tLoad.close();
      toast.error(err.message || 'Login failed');
      btn.disabled = false;
      btn.textContent = originalText;
    }
  };

  appEl.querySelector('#member-form').onsubmit = async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    const originalText = btn.textContent;
    btn.textContent = '...';
    const tLoad = toast.loading('Checking...');
    try {
      await loginMember(document.getElementById('member-user').value.trim(), document.getElementById('member-pin').value, document.getElementById('member-trip').value.trim() || null, document.getElementById('member-remember').checked);
      tLoad.close();
      toast.success(lang==='th' ? 'ยินดีต้อนรับ! 🌸' : 'Welcome! 🌸');
      location.hash = '#/trips';
    } catch (err) {
      tLoad.close();
      toast.error(err.message || 'Login failed');
      btn.disabled = false;
      btn.textContent = originalText;
    }
  };
  if (window.lucide) lucide.createIcons();
}

async function renderTripSelector() {
  if (!isFirebaseConfigured) return renderConfigNeeded();
  if (!currentUser) return location.hash = '#/login';
  
  const lang = getLang();
  appEl.innerHTML = `
    <div class="page-enter">
      <div class="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div>
          <h1 class="text-3xl font-bold tracking-tight" style="font-family: var(--font-display);">${t('selectTrip')} 🌿</h1>
          <p class="text-sm text-[var(--text-secondary)] mt-1">${lang==='th' ? 'เลือกทริปเพื่อเริ่มวางแผนแบบน่ารัก' : 'Choose a trip to start cute planning'}</p>
        </div>
        <button id="create-trip-btn" class="btn btn-primary"><i data-lucide="plus"></i>${t('createTrip')}</button>
      </div>
      <div id="trip-grid" class="grid md:grid-cols-2 lg:grid-cols-3 gap-5"></div>
    </div>
  `;
  if (window.lucide) lucide.createIcons();

  document.getElementById('create-trip-btn').addEventListener('click', () => showCreateTripModal());

  function showCreateTripModal() {
    let coverFile = null;
    
    showBottomSheet(`
      <div class="space-y-5">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-full grid place-items-center text-lg" style="background: var(--primary-light);">🌿</div>
          <div>
            <h3 class="font-bold text-lg" style="font-family: var(--font-display);">${t('createTrip')}</h3>
            <p class="text-xs text-[var(--text-secondary)]">${lang==='th' ? 'สร้างทริปใหม่แบบมินิมอลน่ารัก' : 'Create new cute minimal trip'}</p>
          </div>
        </div>
        
        <form id="create-trip-form" class="space-y-4">
          <div class="input-group"><label class="input-label">✨ ${t('tripName')}</label><input id="ct-name" class="input" required placeholder="${lang==='th' ? 'Fuji Autumn 2027' : 'Fuji Autumn 2027'}"></div>
          
          <div class="input-group">
            <label class="input-label">🖼️ ${t('coverImage')} (optional)</label>
            <div id="cover-preview" class="hidden w-full h-32 rounded-xl overflow-hidden border-2 border-dashed mb-2" style="border-color: var(--border);">
              <img id="cover-img" class="w-full h-full object-cover">
            </div>
            <input id="ct-cover" type="file" accept="image/*" class="input text-sm">
          </div>
          
          <div class="grid grid-cols-2 gap-3">
            <div class="input-group"><label class="input-label">🌍 ${t('country')}</label><input id="ct-country" class="input" placeholder="Japan"></div>
            <div class="input-group"><label class="input-label">🏙️ ${t('city')}</label><input id="ct-city" class="input" placeholder="Fujikawaguchiko"></div>
          </div>
          
          <div class="grid grid-cols-2 gap-3">
            <div class="input-group"><label class="input-label">📅 ${t('startDate')}</label><input id="ct-start" class="input" type="date" required></div>
            <div class="input-group"><label class="input-label">📅 ${t('endDate')}</label><input id="ct-end" class="input" type="date" required></div>
          </div>
          
          <div class="grid grid-cols-2 gap-3">
            <div class="input-group"><label class="input-label">🌐 ${t('timezone')}</label><select id="ct-tz" class="input"><option value="Asia/Bangkok">Asia/Bangkok</option><option value="Asia/Tokyo">Asia/Tokyo</option><option value="Asia/Seoul">Asia/Seoul</option></select></div>
            <div class="input-group"><label class="input-label">💱 ${t('baseCurrency')}</label><select id="ct-cur" class="input"><option>THB</option><option>JPY</option><option>USD</option><option>KRW</option></select></div>
          </div>
          
          <div class="input-group">
            <label class="input-label">🎨 ${t('themeColor')}</label>
            <div class="flex gap-2 flex-wrap">
              ${['#8bb89a','#8aa89a','#b89aa0','#8aa8b5','#b5a08a','#9a9ab5'].map(c => 
                `<button type="button" data-color="${c}" class="w-10 h-10 rounded-full border-2 border-white shadow-sm" style="background:${c};"></button>`
              ).join('')}
            </div>
            <input id="ct-color" type="hidden" value="#8bb89a">
          </div>
          
          <button id="ct-submit" class="btn btn-primary w-full btn-lg">🌿 ${t('createTrip')}</button>
        </form>
      </div>
    `);
    
    // Bind immediately, no setTimeout
    let selectedColor = '#8bb89a';
    document.querySelectorAll('[data-color]').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedColor = btn.dataset.color;
        document.getElementById('ct-color').value = selectedColor;
        document.querySelectorAll('[data-color]').forEach(b => b.style.borderColor = 'white');
        btn.style.borderColor = 'var(--text)';
      });
    });
    const firstColor = document.querySelector('[data-color="#8bb89a"]');
    if (firstColor) firstColor.style.borderColor = 'var(--text)';
    
    document.getElementById('ct-cover').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      coverFile = file;
      const reader = new FileReader();
      reader.onload = (ev) => {
        document.getElementById('cover-img').src = ev.target.result;
        document.getElementById('cover-preview').classList.remove('hidden');
      };
      reader.readAsDataURL(file);
    });
    
    document.getElementById('create-trip-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = document.getElementById('ct-submit');
      submitBtn.disabled = true;
      submitBtn.textContent = lang==='th' ? 'กำลังสร้าง...' : 'Creating...';
      
      const tLoad = toast.loading(lang==='th' ? 'กำลังสร้างทริป...' : 'Creating trip...');
      try {
        const id = await createTrip({
          name: document.getElementById('ct-name').value,
          country: document.getElementById('ct-country').value,
          city: document.getElementById('ct-city').value,
          startDate: document.getElementById('ct-start').value,
          endDate: document.getElementById('ct-end').value,
          timezone: document.getElementById('ct-tz').value,
          baseCurrency: document.getElementById('ct-cur').value,
          themeColor: document.getElementById('ct-color').value,
          coverFile: coverFile,
          creatorName: currentUser.displayName || currentUser.email
        }, currentUser.uid);
        tLoad.close();
        toast.success(lang==='th' ? 'สร้างทริปสำเร็จ 🌿' : 'Trip created 🌿');
        document.querySelector('.bottom-sheet-backdrop')?.click();
        setTimeout(() => location.hash = `#/trip/${id}/dashboard`, 100);
      } catch (err) {
        tLoad.close();
        toast.error(err.message);
        submitBtn.disabled = false;
        submitBtn.textContent = `🌿 ${t('createTrip')}`;
      }
    });
  }

  const grid = document.getElementById('trip-grid');
  grid.innerHTML = `<div class="card p-6 animate-pulse"><div class="skeleton h-24 mb-4"></div><div class="skeleton h-4 mb-2"></div><div class="skeleton h-3"></div></div>`.repeat(3);
  
  try {
    const trips = await listTrips(currentUser.uid, false);
    if (!trips.length) {
      grid.innerHTML = `<div class="col-span-full">${renderEmptyState({ title: t('noTrip'), desc: t('createFirstTrip'), actionHtml: `<button id="empty-create" class="btn btn-primary mt-4">🌿 ${t('createTrip')}</button>` })}</div>`;
      document.getElementById('empty-create')?.addEventListener('click', () => showCreateTripModal());
      return;
    }
    grid.innerHTML = trips.map((trip, idx) => `
      <div class="card card-hover p-0 overflow-hidden cursor-pointer" data-trip="${trip.id}" style="animation-delay: ${idx*0.05}s">
        <div class="h-36 relative overflow-hidden" style="background: ${trip.themeColor || 'var(--gradient-primary)'};">
          ${trip.coverImage ? `<img src="${trip.coverImage}" class="w-full h-full object-cover">` : `<div class="absolute inset-0" style="background: linear-gradient(135deg, ${trip.themeColor || '#8bb89a'} 0%, color-mix(in srgb, ${trip.themeColor || '#8bb89a'} 80%, white) 100%);"></div>`}
          <div class="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent"></div>
          <div class="absolute top-3 right-3"><span class="badge bg-white/90 backdrop-blur text-[10px]">${escapeHtml(trip.status || 'draft')}</span></div>
          <div class="absolute bottom-3 left-3 right-3"><h3 class="font-bold text-white text-[16px] leading-tight drop-shadow-sm" style="font-family: var(--font-display);">${escapeHtml(trip.name)}</h3></div>
        </div>
        <div class="p-4">
          <p class="text-xs text-[var(--text-secondary)]">🌍 ${escapeHtml(trip.country || '')} ${trip.city ? '• ' + escapeHtml(trip.city) : ''}</p>
          <p class="text-xs mt-1">📅 ${trip.startDate || ''} → ${trip.endDate || ''}</p>
          <div class="flex items-center gap-2 mt-3">
            <span class="text-[11px] px-2.5 py-1 rounded-full bg-[var(--bg-secondary)] font-medium">${escapeHtml(trip.baseCurrency || 'THB')}</span>
            <span class="text-[11px] px-2.5 py-1 rounded-full bg-[var(--bg-secondary)]">${escapeHtml(trip.timezone || '')}</span>
          </div>
        </div>
      </div>
    `).join('');
    grid.querySelectorAll('[data-trip]').forEach(el => {
      el.addEventListener('click', () => location.hash = `#/trip/${el.dataset.trip}/dashboard`);
    });
    if (window.lucide) lucide.createIcons();
  } catch (e) {
    grid.innerHTML = `<div class="col-span-full card p-6 text-center"><p class="text-sm text-red-500 mb-3">โหลดทริปไม่สำเร็จ: ${escapeHtml(e.message)}</p><div class="flex gap-2 justify-center"><button id="retry-trips" class="btn btn-primary btn-sm">🔄 Retry</button><button id="clear-cfg-btn" class="btn btn-ghost btn-sm">ล้าง Config</button></div></div>`;
    document.getElementById('retry-trips').addEventListener('click', () => renderTripSelector());
    document.getElementById('clear-cfg-btn').addEventListener('click', () => { localStorage.removeItem('fuji_firebase_config'); location.reload(); });
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
  const lang = getLang();
  appEl.innerHTML = `
    <div class="page-enter space-y-6">
      <div class="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 class="text-3xl font-bold tracking-tight" style="font-family: var(--font-display);">${escapeHtml(currentTrip?.name || 'Dashboard')} 🌿</h1>
          <p class="text-sm text-[var(--text-secondary)] mt-1">📅 ${currentTrip?.startDate || ''} - ${currentTrip?.endDate || ''} • 🌍 ${currentTrip?.country || ''}</p>
        </div>
        <div class="flex gap-2">
          <button id="add-place-quick" class="btn btn-secondary btn-sm">📍 ${t('addPlace')}</button>
          <button id="add-expense-quick" class="btn btn-primary btn-sm">💰 ${t('addExpense')}</button>
        </div>
      </div>
      
      <div id="dashboard-grid" class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div class="card-bento card col-span-2"><p class="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">⏳ ${t('countdown')}</p><h3 id="countdown" class="text-2xl font-bold mt-2" style="font-family: var(--font-display);">--</h3><p id="countdown-sub" class="text-sm text-[var(--text-secondary)] mt-1">--</p></div>
        <div class="card-bento card"><p class="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">💰 ${t('totalExpense')}</p><h3 id="total-expense" class="text-xl font-bold mt-2" style="font-family: var(--font-display);">--</h3><p class="text-xs text-[var(--text-secondary)]">${currentTrip?.baseCurrency || 'THB'}</p></div>
        <div class="card-bento card"><p class="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">👤 ${t('myBalance')}</p><h3 id="my-balance" class="text-xl font-bold mt-2" style="font-family: var(--font-display);">--</h3><p class="text-xs text-[var(--text-secondary)]">${lang==='th' ? 'ต้องรับ/จ่าย' : 'to receive/pay'}</p></div>
        <div class="card-bento card col-span-2 lg:col-span-2"><p class="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">🎯 ${t('currentActivity')}</p><div id="current-activity" class="mt-3"><div class="skeleton h-12"></div></div></div>
        <div class="card-bento card col-span-2 lg:col-span-2"><p class="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">📊 ${lang==='th' ? 'สรุป' : 'Summary'}</p><div id="summary-stats" class="mt-3 text-sm space-y-1"><div class="skeleton h-4"></div></div></div>
      </div>
      
      <div class="card p-5">
        <h3 class="font-bold mb-4" style="font-family: var(--font-display);">✨ ${t('upNext')}</h3>
        <div id="upnext-list"></div>
      </div>
    </div>
  `;

  document.getElementById('add-place-quick').addEventListener('click', () => location.hash = `#/trip/${tripId}/itinerary?action=add`);
  document.getElementById('add-expense-quick').addEventListener('click', () => location.hash = `#/trip/${tripId}/expenses/add`);

  try {
    const { expenses, members } = await fetchSettlementData(tripId);
    const totalMinor = expenses.reduce((s, e) => s + (e.netTotalMinor || 0), 0);
    document.getElementById('total-expense').textContent = formatCurrency(totalMinor, currentTrip?.baseCurrency || 'THB');
    const { balances } = calculateSettlement(expenses, members.map(m => ({ id: m.id })));
    const myBal = balances.find(b => b.memberId === currentUser.uid);
    document.getElementById('my-balance').textContent = myBal ? formatCurrency(myBal.net, currentTrip?.baseCurrency || 'THB') : formatCurrency(0, currentTrip?.baseCurrency || 'THB');
    document.getElementById('summary-stats').innerHTML = `👥 ${members.length} ${lang==='th' ? 'คน' : 'members'} • 💸 ${expenses.length} ${lang==='th' ? 'รายการ' : 'expenses'}`;

    if (currentTrip?.startDate) {
      const start = dayjs(currentTrip.startDate);
      const now = dayjs();
      const diff = start.diff(now, 'day');
      document.getElementById('countdown').textContent = diff > 0 ? (lang==='th' ? `อีก ${diff} วัน 🌸` : `${diff} days left 🌸`) : diff === 0 ? (lang==='th' ? 'วันนี้! 🎉' : 'Today! 🎉') : (lang==='th' ? `ผ่านมา ${Math.abs(diff)} วัน` : `${Math.abs(diff)} days ago`);
      document.getElementById('countdown-sub').textContent = formatDate(currentTrip.startDate, lang, currentTrip.timezone || 'Asia/Bangkok');
    }

    const todayStr = dayjs().format('YYYY-MM-DD');
    const todaysItems = await fetchItinerary(tripId, todayStr);
    const now = dayjs();
    const current = todaysItems.find(it => it.startAt && it.endAt && dayjs(it.startAt).isBefore(now) && dayjs(it.endAt).isAfter(now));
    if (current) {
      const progress = Math.round((now.diff(dayjs(current.startAt)) / dayjs(current.endAt).diff(dayjs(current.startAt))) * 100);
      document.getElementById('current-activity').innerHTML = `<div class="font-semibold">📍 ${escapeHtml(current.title)}</div><div class="text-xs text-[var(--text-secondary)] mt-1">🕐 ${formatTime(current.startAt, currentTrip.timezone)} - ${formatTime(current.endAt, currentTrip.timezone)}</div><div class="progress mt-3"><div class="progress-bar" style="width:${progress}%"></div></div>`;
    } else {
      document.getElementById('current-activity').innerHTML = `<p class="text-sm text-[var(--text-secondary)]">${lang==='th' ? 'ไม่มีกิจกรรมขณะนี้ ☕' : 'No current activity ☕'}</p>`;
    }

    const tripDays = getTripDays(currentTrip.startDate, currentTrip.endDate);
    const upNextDay = determineUpNextDay(tripDays, []);
    const upItems = await fetchItinerary(tripId, upNextDay);
    document.getElementById('upnext-list').innerHTML = upItems.length ? upItems.map((it, idx) => `
      <div class="flex gap-3 py-3 border-b last:border-0" style="border-color:var(--border);">
        <div class="w-8 h-8 rounded-full bg-[var(--primary)] text-white grid place-items-center text-xs font-bold flex-shrink-0">${idx+1}</div>
        <div class="flex-1 min-w-0"><div class="font-medium text-sm">${escapeHtml(it.title)}</div><div class="text-xs text-[var(--text-secondary)]">🕐 ${formatTime(it.startAt, currentTrip.timezone)} • 📍 ${escapeHtml(it.address || '')}</div></div>
      </div>
    `).join('') : `<p class="text-sm text-[var(--text-secondary)]">${lang==='th' ? 'ไม่มีแผนสำหรับ' : 'No plans for'} ${upNextDay || (lang==='th' ? 'วันนี้' : 'today')} 🌿</p>`;

  } catch (e) {
    console.error(e);
    toast.error(lang==='th' ? 'โหลด Dashboard ไม่สำเร็จ' : 'Failed to load dashboard');
  }
}

async function renderItinerary(params) {
  const tripId = params.tripId;
  await loadTrip(tripId);
  const urlParams = new URLSearchParams(location.hash.split('?')[1] || '');
  const action = urlParams.get('action');
  const lang = getLang();

  appEl.innerHTML = `
    <div class="page-enter">
      <div class="flex items-center justify-between mb-6">
        <h1 class="text-2xl font-bold" style="font-family: var(--font-display);">${t('itinerary')} 🗺️</h1>
        <div class="flex gap-2"><button id="edit-mode-btn" class="btn btn-secondary btn-sm">${t('editMode')}</button><button id="add-itinerary-btn" class="btn btn-primary btn-sm">+ ${t('addPlace')}</button></div>
      </div>
      <div id="date-chips" class="flex gap-2 overflow-x-auto pb-3 mb-4"></div>
      <div id="itinerary-list" class="space-y-3"></div>
    </div>
  `;

  let selectedDate = dayjs().format('YYYY-MM-DD');
  let editMode = false;

  const tripDays = currentTrip ? getTripDays(currentTrip.startDate, currentTrip.endDate) : [];
  const chipsEl = document.getElementById('date-chips');
  chipsEl.innerHTML = tripDays.map(d => {
    const ds = dayjs(d).format('YYYY-MM-DD');
    return `<button data-date="${ds}" class="chip ${ds===selectedDate?'chip-active':''}">${dayjs(d).format('DD MMM')}</button>`;
  }).join('');
  chipsEl.querySelectorAll('[data-date]').forEach(btn => btn.addEventListener('click', () => {
    selectedDate = btn.dataset.date;
    chipsEl.querySelectorAll('.chip').forEach(c => c.classList.remove('chip-active'));
    btn.classList.add('chip-active');
    loadItems();
  }));

  async function loadItems() {
    const listEl = document.getElementById('itinerary-list');
    listEl.innerHTML = `<div class="skeleton h-20"></div><div class="skeleton h-20"></div>`;
    try {
      const items = await fetchItinerary(tripId, selectedDate);
      if (!items.length) {
        listEl.innerHTML = renderEmptyState({ title: lang==='th' ? 'ไม่มีแผนวันนี้' : 'No plans today', desc: `${lang==='th' ? 'เพิ่มสถานที่สำหรับ' : 'Add places for'} ${selectedDate} 🌿`, actionHtml: `<button id="empty-add" class="btn btn-primary btn-sm mt-3">+ ${t('addPlace')}</button>` });
        document.getElementById('empty-add')?.addEventListener('click', () => showAddModal());
        return;
      }
      listEl.innerHTML = items.map((it, idx) => `
        <div class="card p-4 ${editMode?'cursor-move':''}" data-id="${it.id}" draggable="${editMode}">
          <div class="flex gap-3">
            <div class="w-8 h-8 rounded-full bg-[var(--primary)] text-white grid place-items-center text-xs font-bold flex-shrink-0">${idx+1}</div>
            <div class="flex-1 min-w-0">
              <div class="flex items-start justify-between gap-2">
                <h3 class="font-semibold text-sm">${escapeHtml(it.title)}</h3>
                <span class="badge badge-${it.status||'planned'} text-[10px]">${escapeHtml(it.status||'planned')}</span>
              </div>
              <p class="text-xs text-[var(--text-secondary)] mt-1">🕐 ${formatTime(it.startAt, currentTrip.timezone)} - ${formatTime(it.endAt, currentTrip.timezone)} • ⏱️ ${formatDuration(it.durationMinutes)}</p>
              ${it.address ? `<p class="text-xs mt-1 text-[var(--text-tertiary)]">📍 ${escapeHtml(it.address)}</p>` : ''}
            </div>
          </div>
        </div>
      `).join('');

      if (editMode) {
        try {
          const Sortable = (await import('https://esm.sh/sortablejs@1.15.3')).default;
          Sortable.create(listEl, {
            animation: 150,
            onEnd: async () => {
              const newOrder = Array.from(listEl.children).map(el => el.dataset.id);
              const tLoad = toast.loading(lang==='th' ? 'กำลังจัดลำดับ...' : 'Reordering...');
              try {
                await reorderItinerary(tripId, selectedDate, newOrder, currentUser.uid);
                tLoad.close();
                toast.success('✅ Reordered');
                loadItems();
              } catch (e) { tLoad.close(); toast.error(e.message); }
            }
          });
        } catch (e) { console.warn('Sortable failed', e); }
      }
    } catch (e) { listEl.innerHTML = `<p class="text-sm text-red-500">${escapeHtml(e.message)}</p>`; }
  }

  function showAddModal() {
    showBottomSheet(`
      <h3 class="font-bold text-lg mb-4" style="font-family: var(--font-display);">📍 ${t('addPlace')}</h3>
      <form id="itinerary-form" class="space-y-4">
        <div class="input-group"><label class="input-label">✨ Place Name</label><input id="it-title" class="input" required></div>
        <div class="grid grid-cols-2 gap-3">
          <div class="input-group"><label class="input-label">📅 Date</label><input id="it-date" class="input" type="date" value="${selectedDate}" required></div>
          <div class="input-group"><label class="input-label">🕐 Start</label><input id="it-time" class="input" type="time" value="09:00" required></div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div class="input-group"><label class="input-label">⏱️ Duration (min)</label><input id="it-duration" class="input" type="number" min="0" value="60"></div>
          <div class="input-group"><label class="input-label">🚶 Travel (min)</label><input id="it-travel" class="input" type="number" min="0" value="0"></div>
        </div>
        <div class="input-group"><label class="input-label">📍 Coordinates lat,lng</label><input id="it-coords" class="input" placeholder="35.3606,138.7274"></div>
        <div class="input-group"><label class="input-label">🏠 Address</label><input id="it-address" class="input"></div>
        <button class="btn btn-primary w-full">💾 ${t('save')}</button>
      </form>
    `);
    document.getElementById('itinerary-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector('button[type="submit"]');
      btn.disabled = true;
      const tLoad = toast.loading('Saving...');
      try {
        const date = document.getElementById('it-date').value;
        const time = document.getElementById('it-time').value;
        const startAt = new Date(`${date}T${time}`);
        const coords = document.getElementById('it-coords').value.trim();
        if (coords) {
          const parsed = parseCoordinates(coords);
          if (!parsed) throw new Error('Invalid coordinates');
        }
        await addItineraryItem(tripId, {
          title: document.getElementById('it-title').value,
          date,
          startAt,
          durationMinutes: parseInt(document.getElementById('it-duration').value,10),
          travelToNextMinutes: parseInt(document.getElementById('it-travel').value,10),
          coordinates: coords,
          address: document.getElementById('it-address').value,
          category: 'general'
        }, currentUser.uid);
        tLoad.close();
        toast.success('✅ Added');
        document.querySelector('.bottom-sheet-backdrop')?.click();
        loadItems();
      } catch (err) { tLoad.close(); toast.error(err.message); btn.disabled = false; }
    });
  }

  document.getElementById('add-itinerary-btn').addEventListener('click', showAddModal);
  document.getElementById('edit-mode-btn').addEventListener('click', () => {
    editMode = !editMode;
    const btn = document.getElementById('edit-mode-btn');
    btn.textContent = editMode ? t('exitEdit') : t('editMode');
    btn.className = editMode ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm';
    loadItems();
  });
  loadItems();
  if (action === 'add') showAddModal();
}

async function renderMap(params) {
  const tripId = params.tripId;
  await loadTrip(tripId);
  const lang = getLang();
  appEl.innerHTML = `
    <div class="page-enter">
      <div class="flex items-center justify-between mb-6"><h1 class="text-2xl font-bold" style="font-family: var(--font-display);">🗺️ ${t('map')}</h1><div class="flex gap-2"><select id="map-day-filter" class="input w-auto text-sm"><option value="">${t('all')}</option></select><button id="fit-bounds" class="btn btn-secondary btn-sm">Fit</button></div></div>
      <div id="map" class="w-full h-[60vh] md:h-[70vh] rounded-xl overflow-hidden border" style="border-color:var(--border);"></div>
      <p class="text-[11px] text-[var(--text-tertiary)] mt-3">${lang==='th' ? 'เส้นเชื่อมแสดงลำดับ ไม่ใช่เส้นทางจริง' : 'Lines show order, not real routing'}</p>
    </div>
  `;

  const days = currentTrip ? getTripDays(currentTrip.startDate, currentTrip.endDate) : [];
  const filterEl = document.getElementById('map-day-filter');
  filterEl.innerHTML = `<option value="">${t('all')}</option>` + days.map(d => `<option value="${dayjs(d).format('YYYY-MM-DD')}">${dayjs(d).format('DD MMM')}</option>`).join('');

  let mapInstance = null;
  let markers = [];

  async function loadMapData(dayFilter = '') {
    try {
      const { initMap, addItineraryMarkers } = await import('./maps/index.js');
      const res = await initMap('map');
      mapInstance = res.map;
      const L = res.L;
      const items = await fetchItinerary(tripId, dayFilter || null);
      const dayColors = {};
      days.forEach((d, i) => {
        const hue = (i * 60) % 360;
        dayColors[dayjs(d).format('YYYY-MM-DD')] = `hsl(${hue},65%,65%)`;
      });
      markers.forEach(m => { try { mapInstance.removeLayer(m); } catch {} });
      markers = addItineraryMarkers(mapInstance, L, items, dayColors);
      document.getElementById('fit-bounds').addEventListener('click', () => {
        if (markers.length) {
          const latlngs = items.filter(it => it.coordinates).map(it => { const p = parseCoordinates(it.coordinates); return p ? [p.lat, p.lng] : null; }).filter(Boolean);
          if (latlngs.length) mapInstance.fitBounds(latlngs, { padding: [40,40] });
        }
      });
    } catch (e) {
      document.getElementById('map').innerHTML = `<div class="grid place-items-center h-full text-sm text-red-500 p-4">Map failed: ${escapeHtml(e.message)}</div>`;
    }
  }
  filterEl.addEventListener('change', () => loadMapData(filterEl.value));
  loadMapData();
}

async function renderExpenses(params) {
  const tripId = params.tripId;
  await loadTrip(tripId);
  appEl.innerHTML = `
    <div class="page-enter">
      <div class="flex items-center justify-between mb-6"><h1 class="text-2xl font-bold" style="font-family: var(--font-display);">💰 ${t('expenses')}</h1><button id="add-expense-btn" class="btn btn-primary btn-sm">+ ${t('addExpense')}</button></div>
      <div class="flex gap-2 overflow-x-auto pb-3 mb-4" id="expense-filters">
        <button class="chip chip-active" data-filter="all">${t('all')}</button>
        <button class="chip" data-filter="today">${t('today')}</button>
        <button class="chip" data-filter="no-receipt">${t('noReceipt')}</button>
      </div>
      <div id="expense-list" class="space-y-3"></div>
      <div id="expense-pagination" class="flex justify-center mt-6"><button id="load-more" class="btn btn-secondary btn-sm">Load more</button></div>
    </div>
  `;

  document.getElementById('add-expense-btn').addEventListener('click', () => location.hash = `#/trip/${tripId}/expenses/add`);

  let lastDoc = null;
  async function loadMore(reset = false) {
    if (reset) { lastDoc = null; document.getElementById('expense-list').innerHTML = ''; }
    const listEl = document.getElementById('expense-list');
    if (reset) listEl.innerHTML = `<div class="skeleton h-20"></div><div class="skeleton h-20"></div>`;
    
    try {
      const { items, lastDoc: newLast } = await fetchExpenses(tripId, { pageSize: 20, lastDoc });
      lastDoc = newLast;
      if (!items.length && reset) {
        listEl.innerHTML = renderEmptyState({ title: getLang()==='th' ? 'ยังไม่มีค่าใช้จ่าย' : 'No expenses', desc: getLang()==='th' ? 'เพิ่มรายการแรก' : 'Add first expense' });
        return;
      }
      const html = items.map(e => `
        <div class="card p-4">
          <div class="flex justify-between gap-2">
            <div><h3 class="font-semibold text-sm">${escapeHtml(e.title)}</h3><p class="text-xs text-[var(--text-secondary)] mt-1">${e.date ? formatDate(e.date, getLang(), currentTrip.timezone) : ''} • ${escapeHtml(e.category||'')}</p></div>
            <div class="text-right"><div class="font-bold text-sm" style="font-family: var(--font-display);">${formatCurrency(e.netTotalMinor||0, e.currency||'THB')}</div></div>
          </div>
        </div>
      `).join('');
      if (reset) listEl.innerHTML = html;
      else listEl.insertAdjacentHTML('beforeend', html);
      const loadMoreBtn = document.getElementById('load-more');
      if (!newLast) loadMoreBtn.classList.add('hidden');
      else loadMoreBtn.classList.remove('hidden');
    } catch (e) {
      listEl.innerHTML = `<p class="text-sm text-red-500 p-4">Error: ${escapeHtml(e.message)}</p>`;
    }
  }
  document.getElementById('load-more').addEventListener('click', () => loadMore(false));
  await loadMore(true);
}

async function renderExpenseAdd(params) {
  const tripId = params.tripId;
  await loadTrip(tripId);
  let members = [];
  try {
    const { getDocs, collection } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
    const snap = await getDocs(collection(db, `trips/${tripId}/members`));
    members = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch {}

  appEl.innerHTML = `
    <div class="page-enter max-w-[720px] mx-auto">
      <h1 class="text-2xl font-bold mb-6" style="font-family: var(--font-display);">💰 ${t('addExpense')}</h1>
      <form id="expense-form" class="space-y-5 card p-6">
        <div class="input-group"><label class="input-label">✨ ${getLang()==='th' ? 'ชื่อรายการ' : 'Title'}</label><input id="ex-title" class="input" required></div>
        <div class="grid grid-cols-2 gap-3">
          <div class="input-group"><label class="input-label">📅 Date</label><input id="ex-date" class="input" type="date" value="${dayjs().format('YYYY-MM-DD')}" required></div>
          <div class="input-group"><label class="input-label">🏷️ Category</label><select id="ex-cat" class="input"><option value="food">🍜 Food</option><option value="transport">🚃 Transport</option><option value="stay">🏨 Stay</option><option value="activity">🎯 Activity</option><option value="shopping">🛍️ Shopping</option><option value="general">📦 General</option></select></div>
        </div>
        <div class="grid grid-cols-3 gap-3">
          <div class="input-group col-span-2"><label class="input-label">💵 Subtotal</label><input id="ex-subtotal" class="input" type="number" step="0.01" required></div>
          <div class="input-group"><label class="input-label">💱 ${t('baseCurrency')}</label><select id="ex-currency" class="input"><option>THB</option><option>JPY</option><option>USD</option></select></div>
        </div>
        <div class="grid grid-cols-3 gap-3">
          <div class="input-group"><label class="input-label">🎟️ Discount</label><input id="ex-discount" class="input" type="number" step="0.01" value="0"></div>
          <div class="input-group"><label class="input-label">💁 Service</label><input id="ex-service" class="input" type="number" step="0.01" value="0"></div>
          <div class="input-group"><label class="input-label">🧾 Tax</label><input id="ex-tax" class="input" type="number" step="0.01" value="0"></div>
        </div>
        <div id="net-preview" class="p-4 rounded-xl bg-[var(--bg-secondary)] text-sm font-bold border" style="border-color: var(--border);">💰 ${t('netTotal')}: --</div>
        <div class="input-group"><label class="input-label">👤 ${t('payer')}</label><div id="payer-tiles" class="tile-grid"></div></div>
        <div class="input-group"><label class="input-label">🔀 ${t('splitMethod')}</label><div class="segmented"><button type="button" data-split="equal" class="segmented-item active">${t('equal')}</button><button type="button" data-split="unequal" class="segmented-item">${t('unequal')}</button></div></div>
        <div id="split-area" class="space-y-3"></div>
        <div class="flex gap-3"><button type="button" id="cancel-expense" class="btn btn-secondary flex-1">${t('cancel')}</button><button type="submit" id="submit-expense" class="btn btn-primary flex-1">💾 ${t('save')}</button></div>
      </form>
    </div>
  `;

  let selectedPayer = members[0]?.id || currentUser.uid;
  let splitMethod = 'equal';
  let allocations = [];

  const payerTiles = document.getElementById('payer-tiles');
  payerTiles.innerHTML = members.map(m => `
    <div class="tile ${m.id===selectedPayer?'tile-selected':''}" data-payer="${m.id}">
      <div class="flex items-center gap-2"><div class="avatar w-8 h-8 text-xs" style="background:${m.color||'#8bb89a'}">${getInitials(m.displayName)}</div><span class="text-sm font-medium">${escapeHtml(m.displayName)}</span></div>
    </div>
  `).join('');
  payerTiles.querySelectorAll('[data-payer]').forEach(el => el.addEventListener('click', () => {
    selectedPayer = el.dataset.payer;
    payerTiles.querySelectorAll('.tile').forEach(t => t.classList.remove('tile-selected'));
    el.classList.add('tile-selected');
    renderSplitArea();
  }));

  const netPreview = document.getElementById('net-preview');
  function updateNet() {
    const sub = parseFloat(document.getElementById('ex-subtotal').value) || 0;
    const disc = parseFloat(document.getElementById('ex-discount').value) || 0;
    const serv = parseFloat(document.getElementById('ex-service').value) || 0;
    const tax = parseFloat(document.getElementById('ex-tax').value) || 0;
    let net = sub - disc + serv + tax;
    netPreview.textContent = `💰 ${t('netTotal')}: ${net.toFixed(2)} ${document.getElementById('ex-currency').value}`;
    renderSplitArea();
  }
  ['ex-subtotal','ex-discount','ex-service','ex-tax','ex-currency'].forEach(id => document.getElementById(id).addEventListener('input', updateNet));
  updateNet();

  function renderSplitArea() {
    const area = document.getElementById('split-area');
    const net = parseFloat(document.getElementById('ex-subtotal').value) || 0;
    const disc = parseFloat(document.getElementById('ex-discount').value) || 0;
    const serv = parseFloat(document.getElementById('ex-service').value) || 0;
    const tax = parseFloat(document.getElementById('ex-tax').value) || 0;
    let netTotal = net - disc + serv + tax;
    const netMinor = Math.round(netTotal*100);

    if (splitMethod === 'equal') {
      const count = members.length;
      const each = count ? netTotal / count : 0;
      area.innerHTML = members.map(m => `<div class="flex justify-between text-sm p-2 rounded-xl bg-[var(--bg-secondary)]"><span>${escapeHtml(m.displayName)}</span><span class="font-bold">${each.toFixed(2)}</span></div>`).join('');
      allocations = members.map(m => ({ memberId: m.id, amountMinor: Math.floor(netMinor/members.length) }));
      let rem = netMinor - allocations.reduce((s,a)=>s+a.amountMinor,0);
      for (let i=0;i<rem;i++) allocations[i%allocations.length].amountMinor+=1;
    } else {
      area.innerHTML = members.map(m => `<div class="flex gap-2 items-center"><span class="text-sm w-24">${escapeHtml(m.displayName)}</span><input data-alloc="${m.id}" class="input flex-1" type="number" step="0.01" placeholder="0.00"></div>`).join('');
    }
  }

  appEl.querySelectorAll('[data-split]').forEach(btn => btn.addEventListener('click', () => {
    appEl.querySelectorAll('[data-split]').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    splitMethod = btn.dataset.split;
    renderSplitArea();
  }));
  renderSplitArea();

  document.getElementById('cancel-expense').addEventListener('click', () => history.back());
  document.getElementById('expense-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = document.getElementById('submit-expense');
    submitBtn.disabled = true;
    const tLoad = toast.loading('Saving expense...');
    try {
      const subMinor = Math.round((parseFloat(document.getElementById('ex-subtotal').value)||0)*100);
      const discMinor = Math.round((parseFloat(document.getElementById('ex-discount').value)||0)*100);
      const servMinor = Math.round((parseFloat(document.getElementById('ex-service').value)||0)*100);
      const taxMinor = Math.round((parseFloat(document.getElementById('ex-tax').value)||0)*100);

      if (splitMethod === 'unequal') {
        allocations = Array.from(appEl.querySelectorAll('[data-alloc]')).map(inp => ({ memberId: inp.dataset.alloc, amountMinor: Math.round((parseFloat(inp.value)||0)*100) }));
      }

      await addExpense(tripId, {
        title: document.getElementById('ex-title').value,
        date: document.getElementById('ex-date').value,
        category: document.getElementById('ex-cat').value,
        subtotalMinor: subMinor,
        discountMinor: discMinor,
        serviceMinor: servMinor,
        taxMinor: taxMinor,
        cardFeePercent: 0,
        currency: document.getElementById('ex-currency').value,
        baseCurrency: currentTrip.baseCurrency,
        payerId: selectedPayer,
        allocations,
        paymentMethod: 'cash'
      }, currentUser.uid);

      tLoad.close();
      toast.success('✅ Saved');
      location.hash = `#/trip/${tripId}/expenses`;
    } catch (err) { tLoad.close(); toast.error(err.message); submitBtn.disabled = false; }
  });
}

async function renderSettlement(params) {
  const tripId = params.tripId;
  await loadTrip(tripId);
  appEl.innerHTML = `
    <div class="page-enter">
      <div class="flex items-center justify-between mb-6"><h1 class="text-2xl font-bold" style="font-family: var(--font-display);">🤝 ${t('settlement')}</h1><button id="recalc-settle" class="btn btn-primary btn-sm">🔄 Recalc</button></div>
      <div id="settlement-content" class="space-y-4"><div class="skeleton h-32"></div></div>
      <div class="card p-5 mt-6"><h3 class="font-bold mb-3">📤 Export</h3><div class="flex gap-2"><button id="copy-line" class="btn btn-secondary btn-sm">📋 ${t('copyLine')}</button><button id="export-png" class="btn btn-secondary btn-sm">🖼️ ${t('exportPng')}</button></div></div>
    </div>
  `;

  async function load() {
    const content = document.getElementById('settlement-content');
    try {
      const { expenses, members } = await fetchSettlementData(tripId);
      const membersMap = Object.fromEntries(members.map(m => [m.id, m]));
      const { balances, transactions } = calculateSettlement(expenses, members);
      if (!transactions.length) {
        content.innerHTML = renderEmptyState({ title: `✨ ${t('noDebt')}`, desc: t('allCleared') });
        return;
      }
      content.innerHTML = `
        <div class="grid md:grid-cols-2 gap-4">
          <div class="card p-5"><h4 class="font-bold text-sm mb-4">💰 ${t('balances')}</h4>${balances.map(b => {
            const m = membersMap[b.memberId];
            return `<div class="flex justify-between text-sm py-2.5 border-b last:border-0" style="border-color:var(--border);"><span>${escapeHtml(m?.displayName||b.memberId.slice(0,6))}</span><span class="${b.net>=0?'text-emerald-600':'text-red-400'} font-bold">${formatCurrency(b.net, currentTrip.baseCurrency)}</span></div>`;
          }).join('')}</div>
          <div class="card p-5"><h4 class="font-bold text-sm mb-4">🔄 ${t('transactions')} (${transactions.length})</h4><div class="space-y-3">${transactions.map(tx => {
            const from = membersMap[tx.from]; const to = membersMap[tx.to];
            return `<div class="flex items-center justify-between p-3 rounded-xl bg-[var(--bg-secondary)] border" style="border-color: var(--border);"><div class="flex items-center gap-2"><span class="avatar w-8 h-8 text-xs" style="background:${from?.color||'#ccc'}">${getInitials(from?.displayName||'')}</span>→<span class="avatar w-8 h-8 text-xs" style="background:${to?.color||'#ccc'}">${getInitials(to?.displayName||'')}</span></div><div class="text-right"><div class="font-bold text-sm">${formatCurrency(tx.amountMinor, currentTrip.baseCurrency)}</div></div></div>`;
          }).join('')}</div></div>
        </div>
      `;
      document.getElementById('copy-line').addEventListener('click', async () => {
        const { copySettlementAsLineText } = await import('./exports/index.js');
        const text = copySettlementAsLineText(transactions, membersMap, currentTrip.baseCurrency);
        await navigator.clipboard.writeText(text);
        toast.success('📋 Copied for LINE');
      });
      document.getElementById('export-png').addEventListener('click', async () => {
        const { exportToPng } = await import('./exports/index.js');
        await exportToPng('settlement-content', `settlement-${tripId}.png`);
      });
    } catch (e) { content.innerHTML = `<p class="text-sm text-red-500 p-4">Error: ${escapeHtml(e.message)}</p>`; }
  }
  document.getElementById('recalc-settle').addEventListener('click', async () => {
    const btn = document.getElementById('recalc-settle');
    btn.disabled = true; btn.textContent = '...';
    const tLoad = toast.loading('Calculating...');
    try { await recalculateAndSaveSettlement(tripId, currentUser.uid); tLoad.close(); toast.success('✅ Recalculated'); load(); } catch (e) { tLoad.close(); toast.error(e.message); } finally { btn.disabled = false; btn.textContent = '🔄 Recalc'; }
  });
  load();
}

async function renderMembers(params) {
  const tripId = params.tripId;
  await loadTrip(tripId);
  appEl.innerHTML = `
    <div class="page-enter">
      <div class="flex items-center justify-between mb-6"><h1 class="text-2xl font-bold" style="font-family: var(--font-display);">👥 ${t('members')}</h1><button id="add-member-btn" class="btn btn-primary btn-sm">+ ${getLang()==='th' ? 'เพิ่มสมาชิก' : 'Add'}</button></div>
      <div id="members-list" class="grid gap-3"></div>
    </div>
  `;

  async function loadMembers() {
    const list = document.getElementById('members-list');
    list.innerHTML = `<div class="skeleton h-16"></div><div class="skeleton h-16"></div>`;
    try {
      const { getDocs, collection } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
      const snap = await getDocs(collection(db, `trips/${tripId}/members`));
      const members = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      list.innerHTML = members.map(m => `
        <div class="card p-4 flex items-center justify-between">
          <div class="flex items-center gap-3"><div class="avatar" style="background:${m.color||'#8bb89a'}">${getInitials(m.displayName)}</div><div><div class="font-semibold text-sm">${escapeHtml(m.displayName)}</div><div class="text-xs text-[var(--text-secondary)]">${escapeHtml(m.role||'member')} • ${escapeHtml(m.status||'active')}</div></div></div>
          <span class="badge badge-planned">${escapeHtml(m.role||'')}</span>
        </div>
      `).join('');
    } catch (e) { list.innerHTML = `<p class="text-sm text-red-500 p-4">${escapeHtml(e.message)}</p>`; }
  }

  document.getElementById('add-member-btn').addEventListener('click', () => {
    showBottomSheet(`
      <h3 class="font-bold text-lg mb-4" style="font-family: var(--font-display);">👥 ${getLang()==='th' ? 'เพิ่มสมาชิก' : 'Add Member'}</h3>
      <form id="add-member-form" class="space-y-4">
        <div class="input-group"><label class="input-label">👤 Username</label><input id="m-user" class="input" required></div>
        <div class="input-group"><label class="input-label">✨ Display Name</label><input id="m-name" class="input" required></div>
        <div class="input-group"><label class="input-label">🔢 PIN (4-12)</label><input id="m-pin" class="input" type="password" required></div>
        <div class="input-group"><label class="input-label">🎭 Role</label><select id="m-role" class="input"><option value="member">Member</option><option value="trip_admin">Trip Admin</option><option value="viewer">Viewer</option></select></div>
        <button class="btn btn-primary w-full">🌿 ${t('add')}</button>
      </form>
    `);
    document.getElementById('add-member-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector('button[type="submit"]');
      btn.disabled = true;
      btn.textContent = 'Creating...';
      const tLoad = toast.loading('Creating member...');
      try {
        const { functions } = await import('./firebase.js');
        const { httpsCallable } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js');
        const fn = httpsCallable(functions, 'createMemberAccount');
        await fn({
          tripId,
          username: document.getElementById('m-user').value,
          pin: document.getElementById('m-pin').value,
          displayName: document.getElementById('m-name').value,
          role: document.getElementById('m-role').value
        });
        tLoad.close();
        toast.success('✅ Member created');
        document.querySelector('.bottom-sheet-backdrop')?.click();
        loadMembers();
      } catch (err) { tLoad.close(); toast.error(err.message); btn.disabled = false; btn.textContent = '🌿 ' + t('add'); }
    });
  });
  loadMembers();
}

async function renderImportExport(params) {
  const tripId = params.tripId;
  await loadTrip(tripId);
  const lang = getLang();
  appEl.innerHTML = `
    <div class="page-enter max-w-[720px] mx-auto space-y-6">
      <h1 class="text-2xl font-bold" style="font-family: var(--font-display);">📦 ${t('importExport')}</h1>
      <div class="card p-6 space-y-4"><h3 class="font-bold">📥 Download Template</h3><div class="flex gap-2"><button data-tpl="csv" class="btn btn-secondary btn-sm">CSV</button><button data-tpl="xlsx" class="btn btn-secondary btn-sm">XLSX</button><button data-tpl="json" class="btn btn-secondary btn-sm">JSON</button></div></div>
      <div class="card p-6 space-y-4"><h3 class="font-bold">📤 Upload File</h3><input id="import-file" type="file" accept=".csv,.xlsx,.xls,.json" class="input"><div id="import-preview" class="text-sm"></div><div class="flex gap-2"><button id="validate-import" class="btn btn-secondary">${lang==='th' ? 'ตรวจสอบ' : 'Validate'}</button><button id="do-import" class="btn btn-primary" disabled>Import</button></div></div>
      <div class="card p-6 space-y-4"><h3 class="font-bold">📤 Export</h3><div class="flex flex-wrap gap-2"><button id="exp-itinerary" class="btn btn-secondary btn-sm">🖼️ Itinerary PNG</button><button id="exp-expenses" class="btn btn-secondary btn-sm">💰 Expenses CSV</button></div></div>
    </div>
  `;

  appEl.querySelectorAll('[data-tpl]').forEach(btn => btn.addEventListener('click', async () => {
    const { downloadTemplate } = await import('./imports/index.js');
    await downloadTemplate(btn.dataset.tpl);
  }));

  let parsedRows = null;
  document.getElementById('validate-import').addEventListener('click', async () => {
    const file = document.getElementById('import-file').files[0];
    if (!file) return toast.warning('Select file first');
    const btn = document.getElementById('validate-import');
    btn.disabled = true;
    const tLoad = toast.loading('Reading file...');
    try {
      const { parseImportFile, validateItineraryImportRows } = await import('./imports/index.js');
      const rows = await parseImportFile(file);
      const { validRows, errors } = validateItineraryImportRows(Array.isArray(rows) ? rows : [rows]);
      parsedRows = validRows;
      document.getElementById('import-preview').innerHTML = `<p>✅ Valid: ${validRows.length}, ❌ Errors: ${errors.length}</p>${errors.length ? `<pre class="mt-2 p-2 bg-[var(--bg-secondary)] rounded text-xs overflow-auto">${escapeHtml(JSON.stringify(errors.slice(0,5), null, 2))}</pre>` : ''}`;
      document.getElementById('do-import').disabled = validRows.length === 0;
      tLoad.close();
      if (errors.length) toast.warning(`${errors.length} errors`);
      else toast.success(`Ready to import ${validRows.length} rows`);
    } catch (e) { tLoad.close(); toast.error(e.message); } finally { btn.disabled = false; }
  });

  document.getElementById('do-import').addEventListener('click', async () => {
    if (!parsedRows) return;
    const btn = document.getElementById('do-import');
    btn.disabled = true;
    const tLoad = toast.loading('Importing...');
    try {
      const { transformImportRowsToItems } = await import('./imports/index.js');
      const items = transformImportRowsToItems(parsedRows, tripId);
      const { writeBatch, collection, doc, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
      const { db } = await import('./firebase.js');
      const batch = writeBatch(db);
      for (const it of items) {
        const ref = doc(collection(db, `trips/${tripId}/itineraryItems`));
        batch.set(ref, { ...it, createdBy: currentUser.uid, updatedBy: currentUser.uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), version: 1, status: 'planned' });
      }
      await batch.commit();
      tLoad.close();
      toast.success(`✅ Imported ${items.length}`);
    } catch (e) { tLoad.close(); toast.error(e.message); } finally { btn.disabled = false; }
  });
}

async function renderSettings(params) {
  const tripId = params.tripId;
  await loadTrip(tripId);
  const lang = getLang();
  const currentColor = localStorage.getItem('fuji_color_theme') || 'sage';
  appEl.innerHTML = `
    <div class="page-enter max-w-[640px] mx-auto space-y-6">
      <h1 class="text-2xl font-bold" style="font-family: var(--font-display);">⚙️ ${t('settings')}</h1>
      <div class="card p-6 space-y-4">
        <div class="input-group"><label class="input-label">✨ ${t('tripName')}</label><input id="s-name" class="input" value="${escapeHtml(currentTrip.name)}"></div>
        <div class="input-group"><label class="input-label">💱 ${t('baseCurrency')}</label><input id="s-currency" class="input" value="${escapeHtml(currentTrip.baseCurrency)}"></div>
        <div class="input-group"><label class="input-label">🌐 ${t('timezone')}</label><input id="s-tz" class="input" value="${escapeHtml(currentTrip.timezone)}"></div>
        <button id="save-settings" class="btn btn-primary w-full">💾 ${t('save')}</button>
      </div>
      
      <div class="card p-6 space-y-4">
        <h3 class="font-bold">🎨 ${t('theme')} + ${lang==='th' ? 'โหมด' : 'Mode'}</h3>
        <p class="text-xs text-[var(--text-secondary)]">ทุกธีมเป็น muted pastel เข้าพวกกัน</p>
        <div class="theme-grid">
          ${themes.map(th => `<button class="theme-option ${currentColor===th.id ? 'active' : ''}" data-theme="${th.id}" style="background: linear-gradient(135deg, ${th.colors[0]}, ${th.colors[1]});"><span style="position:absolute; bottom:6px; left:50%; transform:translateX(-50%); background:rgba(255,255,255,0.9); padding:2px 8px; border-radius:20px; font-size:10px; font-weight:700; white-space:nowrap;">${th.icon} ${th.name}</span></button>`).join('')}
        </div>
        <div class="flex gap-2">
          <button id="toggle-dark" class="btn btn-secondary flex-1 btn-sm">${document.documentElement.getAttribute('data-theme')==='dark' ? '☀️ Light Mode' : '🌙 Dark Mode'}</button>
          <button id="lang-switch" class="btn btn-secondary flex-1 btn-sm">🌐 ${lang==='th' ? 'English' : 'ไทย'}</button>
        </div>
      </div>
      
      <div class="card p-6">
        <h3 class="font-bold mb-2">⚠️ Danger Zone</h3>
        <p class="text-xs text-[var(--text-secondary)] mb-3">${lang==='th' ? 'เปลี่ยนสถานะทริปต้องยืนยัน PIN' : 'Changing status requires PIN'}</p>
        <select id="trip-status" class="input mb-3"><option value="draft">Draft</option><option value="active">Active</option><option value="completed">Completed</option><option value="archived">Archived</option></select>
        <button id="change-status" class="btn btn-danger w-full">Change Status</button>
      </div>
    </div>
  `;
  document.getElementById('save-settings').addEventListener('click', async () => {
    const btn = document.getElementById('save-settings');
    btn.disabled = true;
    const tLoad = toast.loading('Saving...');
    try {
      const { updateTrip } = await import('./trips/index.js');
      await updateTrip(tripId, { name: document.getElementById('s-name').value, baseCurrency: document.getElementById('s-currency').value, timezone: document.getElementById('s-tz').value });
      tLoad.close(); toast.success('✅ Saved');
    } catch (e) { tLoad.close(); toast.error(e.message); } finally { btn.disabled = false; }
  });
  document.querySelectorAll('.theme-option').forEach(btn => {
    btn.addEventListener('click', () => {
      applyTheme(btn.dataset.theme);
      document.querySelectorAll('.theme-option').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      toast.success(`Theme: ${btn.dataset.theme}`);
      renderDesktopNav();
    });
  });
  document.getElementById('toggle-dark').addEventListener('click', () => {
    toggleDark();
    document.getElementById('toggle-dark').textContent = document.documentElement.getAttribute('data-theme')==='dark' ? '☀️ Light Mode' : '🌙 Dark Mode';
  });
  document.getElementById('lang-switch').addEventListener('click', () => {
    const newLang = lang==='th'?'en':'th';
    setLang(newLang);
    toast.success(newLang==='th'?'ไทย':'English');
    renderSettings(params);
    renderDesktopNav();
  });
}

function renderMore(params) {
  const tripId = params.tripId;
  const lang = getLang();
  appEl.innerHTML = `
    <div class="page-enter max-w-[640px] mx-auto space-y-4">
      <h1 class="text-2xl font-bold mb-6" style="font-family: var(--font-display);">✨ ${t('more')}</h1>
      <div class="grid gap-3">
        <a href="#/trip/${tripId}/dashboard" class="card p-4 flex items-center justify-between" style="text-decoration:none; color:inherit;"><span>🏠 ${t('dashboard')}</span><i data-lucide="chevron-right" class="w-4 h-4"></i></a>
        <a href="#/trip/${tripId}/members" class="card p-4 flex items-center justify-between" style="text-decoration:none; color:inherit;"><span>👥 ${t('members')}</span><i data-lucide="chevron-right" class="w-4 h-4"></i></a>
        <a href="#/trip/${tripId}/import" class="card p-4 flex items-center justify-between" style="text-decoration:none; color:inherit;"><span>📦 ${t('importExport')}</span><i data-lucide="chevron-right" class="w-4 h-4"></i></a>
        <a href="#/trip/${tripId}/settings" class="card p-4 flex items-center justify-between" style="text-decoration:none; color:inherit;"><span>⚙️ ${t('settings')}</span><i data-lucide="chevron-right" class="w-4 h-4"></i></a>
        <a href="#/trips" class="card p-4 flex items-center justify-between" style="text-decoration:none; color:inherit;"><span>🔄 ${lang==='th' ? 'สลับทริป' : 'Switch Trip'}</span><i data-lucide="chevron-right" class="w-4 h-4"></i></a>
        <button id="logout-more" class="card p-4 w-full text-left text-red-400">🚪 ${t('logout')}</button>
      </div>
      <div class="card p-4 mt-6">
        <h4 class="font-bold text-sm mb-2">👤 ${currentUser?.displayName || currentUser?.email || 'User'}</h4>
        <p class="text-xs text-[var(--text-secondary)]">${currentUser?.email || ''}</p>
        <p class="text-xs text-[var(--text-tertiary)] mt-1">ID: ${currentUser?.uid?.slice(0,12) || ''}...</p>
      </div>
    </div>
  `;
  document.getElementById('logout-more').addEventListener('click', async () => {
    const btn = document.getElementById('logout-more');
    btn.disabled = true;
    await logout();
    location.hash = '#/login';
  });
  if (window.lucide) lucide.createIcons();
}

window.addEventListener('load', () => { if (window.lucide) lucide.createIcons(); });
window.addEventListener('langchange', () => { renderDesktopNav(); updateBottomNav(); });
window.addEventListener('error', (e) => console.error('Global error', e));
window.addEventListener('unhandledrejection', (e) => { console.error('Unhandled', e); toast.error(e.reason?.message || 'Error'); });
