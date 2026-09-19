import { auth, db, isFirebaseConfigured, onAuthStateChanged, syncState } from './firebase.js';
import { Router } from './router.js';
import { toast } from './components/toast.js';
import { renderFujiMascot, renderEmptyState } from './components/fuji.js';
import { loginAdmin, loginMember, logout, hasStepUpSession } from './auth/index.js';
import { listTrips, getTrip, createTrip } from './trips/index.js';
import { fetchItinerary, addItineraryItem, reorderItinerary } from './itinerary/index.js';
import { fetchExpenses, addExpense, exportExpensesToJson } from './expenses/index.js';
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

// --- Clocks ---
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

// --- Themes - cohesive muted + gradients ---
const themes = [
  { id: 'sage', name: 'Sage', colors: ['#8bb89a', '#a8c5b5'], icon: '🌿', desc: 'เขียวพาสเทล' },
  { id: 'fuji', name: 'Fuji Mist', colors: ['#8aa89a', '#b5c5b5'], icon: '🗻', desc: 'ฟูจิหมอก' },
  { id: 'sakura', name: 'Sakura Dust', colors: ['#b89aa0', '#c5b5a0'], icon: '🌸', desc: 'ซากุระฝุ่น' },
  { id: 'ocean', name: 'Ocean Mist', colors: ['#8aa8b5', '#a0b5c5'], icon: '🌊', desc: 'มหาสมุทร' },
  { id: 'sunset', name: 'Sand', colors: ['#b5a08a', '#c5b5a0'], icon: '🏜️', desc: 'ทราย' },
  { id: 'lavender', name: 'Fog', colors: ['#9a9ab5', '#b5b5c5'], icon: '🌫️', desc: 'หมอกม่วง' },
  { id: 'forest', name: 'Forest', colors: ['#6b8f79', '#8bb89a'], icon: '🌲', desc: 'ป่าเข้ม' },
  { id: 'dusk', name: 'Dusk', colors: ['#8a7a9a', '#9a8ab5'], icon: '🌆', desc: 'เย็น' },
  { id: 'clay', name: 'Clay', colors: ['#b58a7a', '#c5a08a'], icon: '🧱', desc: 'ดิน' },
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
  toast.success(next === 'dark' ? '🌙 มืด' : '☀️ สว่าง');
}

initTheme();

function setTrip(tripId) {
  currentTripId = tripId;
  if (tripId) localStorage.setItem('fuji_current_trip', tripId);
  else localStorage.removeItem('fuji_current_trip');
}

// --- Desktop Nav - instant ---
function renderDesktopNav() {
  if (!currentTripId) { desktopNavEl.innerHTML = ''; return; }
  const base = `#/trip/${currentTripId}`;
  const currentHash = location.hash.split('?')[0];
  const items = [
    { label: t('dashboard'), path: `${base}/dashboard`, icon: 'layout-dashboard' },
    { label: t('itinerary'), path: `${base}/itinerary`, icon: 'map-pinned' },
    { label: t('expenses'), path: `${base}/expenses`, icon: 'wallet' },
    { label: t('settlement'), path: `${base}/settlement`, icon: 'hand-coins' },
    { label: t('members'), path: `${base}/members`, icon: 'users' },
    { label: 'เอกสาร', path: `${base}/documents`, icon: 'folder' },
    { label: t('settings'), path: `${base}/settings`, icon: 'settings' },
  ];
  desktopNavEl.innerHTML = items.map(i => {
    const active = currentHash.startsWith(i.path) ? 'chip-active active' : '';
    return `<a href="${i.path}" class="chip menu-item ${active}" data-nav="${i.path}" style="text-decoration:none;"><i data-lucide="${i.icon}" class="w-4 h-4"></i>${i.label}</a>`;
  }).join('');
  if (window.lucide) lucide.createIcons();
}

// --- Bottom Nav - instant ---
function updateBottomNav() {
  if (!currentTripId) return;
  const base = `#/trip/${currentTripId}`;
  const currentHash = location.hash.split('?')[0];
  bottomNavEl.querySelectorAll('.bottom-nav-item').forEach(btn => {
    const originalRoute = btn.getAttribute('data-route');
    let route = originalRoute.replace('#/trip', base);
    // Map old /map to itinerary since merged
    if (route.includes('/map')) route = route.replace('/map', '/itinerary');
    btn.setAttribute('data-full-route', route);
    if (currentHash.startsWith(route) || (route.includes('/itinerary') && currentHash.includes('/map'))) btn.classList.add('active');
    else btn.classList.remove('active');
    btn.onclick = () => { location.hash = route; };
  });
}

function renderFAB(route) {
  if (!currentTripId) { fabEl.classList.add('hidden'); return; }
  const cleanRoute = route.split('?')[0];
  if (cleanRoute.includes('/itinerary') || cleanRoute.includes('/expenses') || cleanRoute.includes('/documents')) {
    fabEl.classList.remove('hidden');
    fabEl.onclick = () => {
      if (cleanRoute.includes('/itinerary')) location.hash = `#/trip/${currentTripId}/itinerary?action=add`;
      if (cleanRoute.includes('/expenses')) location.hash = `#/trip/${currentTripId}/expenses/add`;
      if (cleanRoute.includes('/documents')) location.hash = `#/trip/${currentTripId}/documents?action=add`;
    };
  } else fabEl.classList.add('hidden');
}

// --- Header Controls - home, dark/light, theme, lang, user name ---
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
    <a href="#/trips" id="header-home-btn" class="btn btn-ghost btn-icon w-9 h-9 text-sm" title="Home">🏠</a>
    <button id="header-lang-btn" class="btn btn-ghost btn-sm text-xs font-bold" title="${t('language')}">${getLang() === 'th' ? 'EN' : 'TH'}</button>
    <button id="header-dark-btn" class="btn btn-ghost btn-icon w-9 h-9 text-sm" title="Dark/Light">🌙</button>
    <button id="header-theme-btn" class="btn btn-ghost btn-icon w-9 h-9 text-sm" title="${t('theme')}">🎨</button>
  `;
  
  rightGroup.insertBefore(controlsDiv, rightGroup.firstChild);
  
  document.getElementById('header-lang-btn').onclick = () => {
    const newLang = getLang() === 'th' ? 'en' : 'th';
    setLang(newLang);
    document.getElementById('header-lang-btn').textContent = newLang === 'th' ? 'EN' : 'TH';
    renderDesktopNav();
    updateBottomNav();
    if (headerSubtitle && currentTrip) headerSubtitle.textContent = currentTrip.name;
    toast.success(newLang === 'th' ? 'ไทย' : 'English');
    setTimeout(() => router.handle(), 50);
  };
  
  document.getElementById('header-dark-btn').onclick = toggleDark;
  document.getElementById('header-theme-btn').onclick = showThemePicker;
  
  updateDarkIcon();
}

function updateUserDisplay(user) {
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

// --- Password/PIN toggle helper ---
function addPasswordToggle(inputId) {
  const input = document.getElementById(inputId);
  if (!input || input.dataset.toggleAdded) return;
  input.dataset.toggleAdded = '1';
  const wrapper = document.createElement('div');
  wrapper.className = 'relative';
  input.parentNode.insertBefore(wrapper, input);
  wrapper.appendChild(input);
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] hover:text-[var(--text)] p-1';
  btn.innerHTML = '👁️';
  btn.onclick = () => {
    const isPass = input.type === 'password';
    input.type = isPass ? 'text' : 'password';
    btn.innerHTML = isPass ? '🙈' : '👁️';
  };
  wrapper.appendChild(btn);
}

// --- Auth ---
if (!isFirebaseConfigured) {
  setTimeout(() => renderConfigNeeded(), 50);
} else if (auth) {
  onAuthStateChanged(auth, async user => {
    if (!isFirebaseConfigured) { renderConfigNeeded(); return; }
    currentUser = user;
    if (user) {
      const initial = (user.displayName || user.email || '?')[0].toUpperCase();
      userAvatarBtn.textContent = initial;
      if (user.photoURL) {
        userAvatarBtn.innerHTML = `<img src="${user.photoURL}" class="w-full h-full rounded-full object-cover">`;
      }
      updateUserDisplay(user);
      userAvatarBtn.onclick = () => showBottomSheet(`
        <div class="space-y-4">
          <div class="flex items-center gap-3">
            <div class="avatar w-12 h-12 text-sm" style="background: var(--gradient-primary);">${user.photoURL ? `<img src="${user.photoURL}" class="w-full h-full rounded-full object-cover">` : initial}</div>
            <div class="flex-1 min-w-0">
              <h3 class="font-bold truncate">${escapeHtml(user.displayName || user.email || 'User')}</h3>
              <p class="text-xs text-[var(--text-secondary)] truncate">${escapeHtml(user.email || user.uid.slice(0,8))}</p>
            </div>
          </div>
          <div class="card p-3 space-y-3">
            <div class="input-group"><label class="input-label text-xs">Display Name</label><input id="edit-display-name" class="input text-sm" value="${escapeHtml(user.displayName || '')}" placeholder="ชื่อที่แสดง"></div>
            <div class="input-group"><label class="input-label text-xs">Photo URL</label><input id="edit-photo-url" class="input text-sm" value="${escapeHtml(user.photoURL || '')}" placeholder="https://..."></div>
            <button id="save-profile" class="btn btn-primary btn-sm w-full">💾 บันทึกโปรไฟล์</button>
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
          <button id="forget-device" class="btn btn-ghost w-full text-xs">ล้างแคช</button>
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
        document.getElementById('save-profile')?.addEventListener('click', async () => {
          const btn = document.getElementById('save-profile');
          btn.disabled = true;
          const tLoad = toast.loading('Saving profile...');
          try {
            const { updateProfile } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js');
            const newName = document.getElementById('edit-display-name').value.trim();
            const newPhoto = document.getElementById('edit-photo-url').value.trim();
            await updateProfile(auth.currentUser, {
              displayName: newName || null,
              photoURL: newPhoto || null
            });
            tLoad.close();
            toast.success('✅ บันทึกแล้ว');
            document.querySelector('.bottom-sheet-backdrop')?.click();
            setTimeout(() => location.reload(), 500);
          } catch (e) {
            tLoad.close();
            toast.error(e.message);
            btn.disabled = false;
          }
        });
      }, 10);
      if (location.hash.includes('login')) location.hash = '#/trips';
    } else {
      userAvatarBtn.textContent = '?';
      userAvatarBtn.innerHTML = '?';
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
    <p class="text-xs text-[var(--text-secondary)] mb-4">โทน muted pastel + gradient</p>
    <div class="theme-grid">
      ${themes.map(th => `
        <button class="theme-option ${current === th.id ? 'active' : ''}" data-theme="${th.id}" style="background: linear-gradient(135deg, ${th.colors[0]}, ${th.colors[1]});" title="${th.name}">
          <span style="position:absolute; bottom:6px; left:50%; transform:translateX(-50%); background:rgba(255,255,255,0.9); padding:2px 8px; border-radius:20px; font-size:10px; font-weight:700; white-space:nowrap;">${th.icon} ${th.name}</span>
        </button>
      `).join('')}
    </div>
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
        toast.success(`${btn.dataset.theme}`);
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
  { path: '/trip/:tripId/map', handler: renderItinerary }, // merged to itinerary
  { path: '/trip/:tripId/expenses', handler: renderExpenses },
  { path: '/trip/:tripId/expenses/add', handler: renderExpenseAdd },
  { path: '/trip/:tripId/settlement', handler: renderSettlement },
  { path: '/trip/:tripId/members', handler: renderMembers },
  { path: '/trip/:tripId/documents', handler: renderDocuments },
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

refreshBtn?.addEventListener('click', () => {
  syncState.set('syncing');
  toast.success(getLang() === 'th' ? 'รีเฟรชแล้ว' : 'Refreshed');
  router.handle();
  setTimeout(() => syncState.set('online'), 300);
});

// --- Config ---
function renderConfigNeeded() {
  const saved = localStorage.getItem('fuji_firebase_config');
  let savedPretty = '';
  try { savedPretty = saved ? JSON.stringify(JSON.parse(saved), null, 2) : ''; } catch { savedPretty = saved || ''; }
  appEl.innerHTML = `
    <div class="max-w-[720px] mx-auto page-enter">
      <div class="card p-8">
        <div class="text-center mb-6">${renderFujiMascot('normal', 120)}</div>
        <h1 class="text-2xl font-bold mb-2" style="font-family: var(--font-display);">ตั้งค่า Firebase 🌿</h1>
        <p class="text-sm text-[var(--text-secondary)] mb-4">กรอก Firebase Config เพื่อเริ่มใช้งาน</p>
        <div class="space-y-5">
          <div class="input-group">
            <label class="input-label">Firebase Config JSON</label>
            <textarea id="cfg-input" class="input min-h-[160px] font-mono text-xs" placeholder='{"apiKey":"...","authDomain":"...","projectId":"..."}'>${escapeHtml(savedPretty)}</textarea>
          </div>
          <div class="flex gap-2">
            <button id="save-cfg" class="btn btn-primary flex-1 btn-lg">💾 บันทึก</button>
            <button id="clear-cfg" class="btn btn-ghost">ล้าง</button>
          </div>
        </div>
      </div>
    </div>
  `;
  document.getElementById('clear-cfg').onclick = () => {
    localStorage.removeItem('fuji_firebase_config');
    document.getElementById('cfg-input').value = '';
    toast.warning('ล้างแล้ว');
  };
  document.getElementById('save-cfg').onclick = () => {
    const btn = document.getElementById('save-cfg');
    btn.disabled = true;
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
            <button data-tab="member" class="segmented-item active">👤 ${t('member')}</button>
            <button data-tab="admin" class="segmented-item">🔑 ${t('admin')}</button>
          </div>

          <div id="tab-member">
            <form id="member-form" class="space-y-4">
              <div class="input-group"><label class="input-label">🗺️ Trip ID</label><input id="member-trip" class="input" placeholder="${lang==='th' ? 'เว้นว่างได้' : 'Optional'}"></div>
              <div class="input-group"><label class="input-label">👤 ${t('username')}</label><input id="member-user" class="input" placeholder="fuji_user" required></div>
              <div class="input-group"><label class="input-label">🔢 ${t('pin')}</label><input id="member-pin" class="input" type="password" inputmode="numeric" placeholder="****" required></div>
              <label class="flex items-center gap-2 text-sm cursor-pointer"><input id="member-remember" type="checkbox" checked> ${t('rememberDevice')}</label>
              <button class="btn btn-primary w-full btn-lg" type="submit">${t('loginMember')}</button>
            </form>
          </div>

          <div id="tab-admin" class="hidden">
            <form id="admin-form" class="space-y-4">
              <div class="input-group"><label class="input-label">📧 ${t('email')}</label><input id="admin-email" class="input" type="email" placeholder="admin@example.com" required></div>
              <div class="input-group"><label class="input-label">🔑 ${t('password')}</label><input id="admin-pass" class="input" type="password" required></div>
              <label class="flex items-center gap-2 text-sm cursor-pointer"><input id="admin-remember" type="checkbox" checked> ${t('rememberDevice')}</label>
              <button class="btn btn-primary w-full btn-lg" type="submit">${t('loginAdmin')}</button>
            </form>
          </div>

          <p class="text-[11px] text-center text-[var(--text-tertiary)] mt-6 leading-relaxed">🔒 ปลอดภัย • 🌿 มินิมอล</p>
        </div>
      </div>
    </div>
  `;
  
  setTimeout(() => {
    addPasswordToggle('member-pin');
    addPasswordToggle('admin-pass');
  }, 10);
  
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
    setTimeout(() => {
      addPasswordToggle('member-pin');
      addPasswordToggle('admin-pass');
    }, 10);
  }));

  appEl.querySelector('#admin-form').onsubmit = async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]') || e.target.querySelector('button');
    if (!btn) return;
    btn.disabled = true;
    const originalText = btn.textContent;
    btn.textContent = lang==='th' ? 'กำลังเข้าสู่ระบบ...' : 'Logging in...';
    const tLoad = toast.loading(lang==='th' ? 'กำลังเข้าสู่ระบบ...' : 'Logging in...');
    try {
      await loginAdmin(document.getElementById('admin-email').value, document.getElementById('admin-pass').value, document.getElementById('admin-remember').checked);
      tLoad.close();
      toast.success(lang==='th' ? 'สำเร็จ 🌿' : 'Success 🌿');
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
    const btn = e.target.querySelector('button[type="submit"]') || e.target.querySelector('button');
    if (!btn) return;
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
          <p class="text-sm text-[var(--text-secondary)] mt-1">${lang==='th' ? 'เลือกทริปของคุณ' : 'Select your trip'}</p>
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
    let croppedBlob = null;
    let cropperInstance = null;
    let currentAspect = 16/9;
    
    const themeColors = [
      { color: '#8bb89a', name: 'Sage' },
      { color: '#8aa89a', name: 'Fuji' },
      { color: '#a8c5b5', name: 'Moss' },
      { color: '#b5c5b5', name: 'Fog' },
      { color: '#b89aa0', name: 'Sakura' },
      { color: '#c5a8a0', name: 'Clay' },
      { color: '#d4b5a0', name: 'Sand' },
      { color: '#b5a08a', name: 'Sunset' },
      { color: '#8aa8b5', name: 'Ocean' },
      { color: '#a0b5c5', name: 'Sky' },
      { color: '#9a9ab5', name: 'Lavender' },
      { color: '#6b8f79', name: 'Forest' },
    ];
    
    showBottomSheet(`
      <div class="space-y-3">
        <div class="flex items-center gap-2">
          <div class="w-8 h-8 rounded-full grid place-items-center text-sm" style="background: var(--primary-light);">🌿</div>
          <div>
            <h3 class="font-bold text-base" style="font-family: var(--font-display);">${t('createTrip')}</h3>
            <p class="text-[11px] text-[var(--text-secondary)]">${lang==='th' ? 'สร้างทริปใหม่' : 'Create new trip'}</p>
          </div>
        </div>
        
        <form id="create-trip-form" class="space-y-3">
          <div class="input-group"><label class="input-label">✨ ${t('tripName')} *</label><input id="ct-name" class="input" required placeholder="Fuji Autumn 2027" autocomplete="off"></div>
          
          <div class="input-group">
            <label class="input-label">🖼️ ${t('coverImage')}</label>
            <div class="p-3 rounded-xl border-2 border-dashed" style="border-color: var(--border); background: var(--bg-secondary);">
              <div id="cover-dropzone" class="text-center cursor-pointer py-2">
                <div class="text-2xl mb-1">📸</div>
                <p class="text-xs font-medium">คลิกเลือกภาพ</p>
                <p class="text-[10px] text-[var(--text-tertiary)] mt-0.5">JPG/PNG • 10MB • ครอปได้</p>
              </div>
              <input id="ct-cover" type="file" accept="image/*" class="hidden">
              
              <div id="cover-cropper-container" class="hidden mt-3">
                <div class="flex gap-1.5 mb-2 flex-wrap">
                  <span class="text-[11px] font-medium">อัตราส่วน:</span>
                  <button type="button" data-aspect="16/9" class="chip chip-active text-[10px] aspect-btn py-1 px-2">16:9</button>
                  <button type="button" data-aspect="4/3" class="chip text-[10px] aspect-btn py-1 px-2">4:3</button>
                  <button type="button" data-aspect="1" class="chip text-[10px] aspect-btn py-1 px-2">1:1</button>
                  <button type="button" data-aspect="free" class="chip text-[10px] aspect-btn py-1 px-2">Free</button>
                </div>
                <div id="cropper-wrapper" class="w-full rounded-xl overflow-hidden bg-black" style="min-height: 180px; max-height: 260px;"></div>
                <div class="flex gap-2 mt-2">
                  <button type="button" id="crop-confirm" class="btn btn-primary btn-sm flex-1 text-xs">✂️ ครอป</button>
                  <button type="button" id="crop-cancel" class="btn btn-secondary btn-sm text-xs">ยกเลิก</button>
                </div>
              </div>
              
              <div id="cover-preview" class="hidden mt-3">
                <div class="flex items-center justify-between mb-1.5">
                  <span class="text-[11px] font-bold">👁️ ตัวอย่าง</span>
                  <button type="button" id="change-image" class="btn btn-ghost btn-sm text-[10px] h-6">เปลี่ยน</button>
                </div>
                <div class="w-full h-28 rounded-xl overflow-hidden border" style="border-color: var(--border);">
                  <img id="cover-img" class="w-full h-full object-cover">
                </div>
                <p id="cover-info" class="text-[10px] text-[var(--text-tertiary)] mt-1"></p>
              </div>
            </div>
            <div class="input-group mt-2">
              <label class="input-label text-[12px]">🔗 หรือ URL รูปภาพ</label>
              <input id="ct-cover-url" class="input text-sm h-9" placeholder="https://...">
            </div>
          </div>
          
          <div class="grid grid-cols-2 gap-2">
            <div class="input-group"><label class="input-label text-[12px]">🌍 ${t('country')}</label><input id="ct-country" class="input h-9 text-sm" placeholder="Japan" autocomplete="off"></div>
            <div class="input-group"><label class="input-label text-[12px]">🏙️ ${t('city')}</label><input id="ct-city" class="input h-9 text-sm" placeholder="Fujikawaguchiko" autocomplete="off"></div>
          </div>
          
          <div class="grid grid-cols-2 gap-2">
            <div class="input-group"><label class="input-label text-[12px]">📅 ${t('startDate')} *</label><input id="ct-start" class="input h-9 text-sm" type="date" required></div>
            <div class="input-group"><label class="input-label text-[12px]">📅 ${t('endDate')} *</label><input id="ct-end" class="input h-9 text-sm" type="date" required></div>
          </div>
          
          <div class="grid grid-cols-2 gap-2">
            <div class="input-group">
              <label class="input-label text-[12px]">🌐 ${t('timezone')}</label>
              <select id="ct-tz" class="input h-9 text-sm">
                <option value="Asia/Bangkok">Bangkok</option>
                <option value="Asia/Tokyo">Tokyo</option>
                <option value="Asia/Seoul">Seoul</option>
                <option value="Asia/Singapore">Singapore</option>
                <option value="Asia/Hong_Kong">Hong Kong</option>
                <option value="UTC">UTC</option>
              </select>
            </div>
            <div class="input-group">
              <label class="input-label text-[12px]">💱 ${t('baseCurrency')}</label>
              <select id="ct-cur" class="input h-9 text-sm">
                <option value="THB">THB</option>
                <option value="JPY">JPY</option>
                <option value="USD">USD</option>
                <option value="KRW">KRW</option>
                <option value="EUR">EUR</option>
              </select>
            </div>
          </div>
          
          <div class="input-group">
            <label class="input-label text-[12px]">🎨 ${t('themeColor')}</label>
            <div class="grid grid-cols-6 gap-1.5 p-2 rounded-xl" style="background: var(--bg-secondary); border: 1px solid var(--border);">
              ${themeColors.map(c => 
                `<button type="button" data-color="${c.color}" title="${c.name}" class="w-full aspect-square rounded-full border-2 border-white shadow-sm hover:scale-110 transition-transform" style="background:${c.color};"></button>`
              ).join('')}
            </div>
            <div class="flex gap-2 mt-2 items-center">
              <input id="ct-color-custom" type="color" value="#8bb89a" class="w-8 h-8 rounded-full border-2 border-white shadow-sm cursor-pointer flex-shrink-0">
              <input id="ct-color" type="text" value="#8bb89a" class="input flex-1 text-xs font-mono h-8" placeholder="#8bb89a">
              <div id="ct-color-preview" class="w-8 h-8 rounded-full border-2 border-white shadow-sm flex-shrink-0" style="background:#8bb89a;"></div>
            </div>
          </div>
          
          <button id="ct-submit" type="submit" class="btn btn-primary w-full">🌿 ${t('createTrip')}</button>
        </form>
      </div>
    `);
    
    let selectedColor = '#8bb89a';
    const colorInput = document.getElementById('ct-color');
    const colorCustom = document.getElementById('ct-color-custom');
    const colorPreview = document.getElementById('ct-color-preview');
    
    function updateColor(newColor) {
      selectedColor = newColor;
      colorInput.value = newColor;
      colorCustom.value = newColor;
      colorPreview.style.background = newColor;
      document.querySelectorAll('[data-color]').forEach(b => {
        b.style.borderColor = 'white';
        b.style.transform = '';
        if (b.dataset.color.toLowerCase() === newColor.toLowerCase()) {
          b.style.borderColor = 'var(--text)';
          b.style.transform = 'scale(1.15)';
        }
      });
    }
    
    document.querySelectorAll('[data-color]').forEach(btn => {
      btn.addEventListener('click', () => updateColor(btn.dataset.color));
    });
    
    colorCustom.addEventListener('input', (e) => updateColor(e.target.value));
    colorInput.addEventListener('input', (e) => {
      const val = e.target.value;
      if (/^#[0-9A-F]{6}$/i.test(val)) updateColor(val);
    });
    
    updateColor('#8bb89a');
    
    const dropzone = document.getElementById('cover-dropzone');
    const fileInput = document.getElementById('ct-cover');
    const cropperContainer = document.getElementById('cover-cropper-container');
    const cropperWrapper = document.getElementById('cropper-wrapper');
    const previewContainer = document.getElementById('cover-preview');
    const previewImg = document.getElementById('cover-img');
    const coverInfo = document.getElementById('cover-info');
    const coverUrlInput = document.getElementById('ct-cover-url');
    
    coverUrlInput.addEventListener('input', () => {
      const url = coverUrlInput.value.trim();
      if (url && url.startsWith('http')) {
        previewImg.src = url;
        previewContainer.classList.remove('hidden');
        coverInfo.textContent = `🔗 URL: ${url.slice(0,50)}...`;
      }
    });
    
    async function handleFile(file) {
      if (!file) return;
      if (!file.type.startsWith('image/')) {
        toast.error('เลือกไฟล์ภาพเท่านั้น');
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        toast.error('ไฟล์ใหญ่เกิน 10MB');
        return;
      }
      
      coverFile = file;
      coverUrlInput.value = '';
      dropzone.classList.add('hidden');
      previewContainer.classList.add('hidden');
      cropperContainer.classList.remove('hidden');
      
      try {
        const { ImageCropper } = await import('./utils/imageCropper.js');
        if (cropperInstance) cropperInstance.destroy();
        cropperInstance = new ImageCropper({ aspectRatio: currentAspect });
        await cropperInstance.loadFile(file, cropperWrapper);
        toast.success('ลากกรอบเพื่อเลือกส่วนที่ต้องการ');
      } catch (err) {
        console.error('Cropper load failed', err);
        const reader = new FileReader();
        reader.onload = (ev) => {
          previewImg.src = ev.target.result;
          previewContainer.classList.remove('hidden');
          cropperContainer.classList.add('hidden');
        };
        reader.readAsDataURL(file);
      }
    }
    
    dropzone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => handleFile(e.target.files[0]));
    
    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.style.borderColor = 'var(--primary)';
      dropzone.style.background = 'var(--primary-light)';
    });
    dropzone.addEventListener('dragleave', () => {
      dropzone.style.borderColor = '';
      dropzone.style.background = '';
    });
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.style.borderColor = '';
      dropzone.style.background = '';
      const file = e.dataTransfer.files[0];
      handleFile(file);
    });
    
    document.querySelectorAll('.aspect-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        document.querySelectorAll('.aspect-btn').forEach(b => b.classList.remove('chip-active'));
        btn.classList.add('chip-active');
        const aspect = btn.dataset.aspect;
        currentAspect = aspect === 'free' ? null : eval(aspect);
        if (cropperInstance && coverFile) {
          cropperInstance.aspectRatio = currentAspect;
          await cropperInstance.loadFile(coverFile, cropperWrapper);
        }
      });
    });
    
    document.getElementById('crop-confirm').addEventListener('click', async () => {
      if (!cropperInstance) return;
      const btn = document.getElementById('crop-confirm');
      btn.disabled = true;
      btn.textContent = '...';
      try {
        croppedBlob = await cropperInstance.getCroppedBlob('image/webp', 0.85);
        const previewUrl = cropperInstance.getPreviewDataUrl(600);
        previewImg.src = previewUrl;
        previewContainer.classList.remove('hidden');
        cropperContainer.classList.add('hidden');
        coverInfo.textContent = `✅ ครอปแล้ว • ${(croppedBlob.size/1024).toFixed(0)}KB`;
        toast.success('ครอปแล้ว');
      } catch (err) {
        toast.error('ครอปไม่สำเร็จ: ' + err.message);
      } finally {
        btn.disabled = false;
        btn.textContent = '✂️ ครอป';
      }
    });
    
    document.getElementById('crop-cancel').addEventListener('click', () => {
      cropperContainer.classList.add('hidden');
      dropzone.classList.remove('hidden');
      if (cropperInstance) {
        cropperInstance.destroy();
        cropperInstance = null;
      }
    });
    
    document.getElementById('change-image').addEventListener('click', () => {
      previewContainer.classList.add('hidden');
      dropzone.classList.remove('hidden');
      coverFile = null;
      croppedBlob = null;
      fileInput.value = '';
      coverUrlInput.value = '';
    });
    
    document.getElementById('create-trip-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = document.getElementById('ct-submit');
      submitBtn.disabled = true;
      const originalText = submitBtn.textContent;
      submitBtn.textContent = lang==='th' ? 'กำลังสร้าง...' : 'Creating...';
      
      const tLoad = toast.loading(lang==='th' ? 'กำลังสร้างทริป...' : 'Creating trip...');
      try {
        const coverUrl = document.getElementById('ct-cover-url').value.trim();
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
          coverBlob: croppedBlob,
          coverUrl: coverUrl || null,
          creatorName: currentUser.displayName || currentUser.email
        }, currentUser.uid);
        tLoad.close();
        toast.success(lang==='th' ? 'สร้างแล้ว 🌿' : 'Created 🌿');
        document.querySelector('.bottom-sheet-backdrop')?.click();
        if (cropperInstance) cropperInstance.destroy();
        setTimeout(() => location.hash = `#/trip/${id}/dashboard`, 100);
      } catch (err) {
        tLoad.close();
        console.error('Create trip failed', err);
        toast.error(err.message, 8000);
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
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
    console.error('List trips failed', e);
    let msg = e.message;
    let hint = '';
    let showRulesHelp = false;
    
    if (e.code === 'permission-denied' || msg.includes('permission') || msg.includes('Missing') || msg.includes('insufficient')) {
      showRulesHelp = true;
      hint = `
        <div class="text-left mt-3 p-3 rounded-xl bg-amber-50 border border-amber-200 text-[11px] leading-relaxed">
          <strong>⚠️ Firestore Rules ยังไม่ deploy</strong><br>
          ต้อง deploy กฎใหม่ที่ Firebase Console:<br>
          1. ไปที่ <a href="https://console.firebase.google.com" target="_blank" class="underline font-bold">Firebase Console</a> > Firestore > Rules<br>
          2. คัดลอกเนื้อหาจากไฟล์ <code>firestore.rules</code> ใน repo นี้<br>
          3. กด Publish<br>
          <br>
          <strong>หรือชั่วคราว:</strong> ใช้โหมดทดสอบ (Test mode) ใน Rules<br>
          <code class="block mt-1 p-1 bg-white rounded text-[10px]">allow read, write: if request.auth != null;</code>
        </div>
      `;
      msg = 'ไม่มีสิทธิ์เข้าถึง - ต้อง deploy Firestore Rules';
    }
    if (msg.includes('index') || e.code === 'failed-precondition') {
      hint = `<div class="text-left mt-3 p-3 rounded-xl bg-blue-50 border border-blue-200 text-[11px]"><strong>⚠️ ต้องสร้าง Firestore Index</strong><br>ไปที่ <a href="https://console.firebase.google.com" target="_blank" class="underline">Console</a> > Firestore > Indexes > สร้าง index ตามลิงก์ใน error</div>`;
      msg = 'ต้องสร้าง Index - ดูลิงก์ใน Console';
    }
    
    // Try to show cached trips even if permission denied
    try {
      const cached = localStorage.getItem('fuji_trips_cache');
      if (cached) {
        const { data } = JSON.parse(cached);
        if (data && data.length) {
          grid.innerHTML = `
            <div class="col-span-full mb-4 p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs">⚠️ ใช้ข้อมูลจาก cache • ${data.length} ทริป • กดรีเฟรชหลัง deploy Rules</div>
            ${data.map((trip, idx) => `
              <div class="card card-hover p-0 overflow-hidden cursor-pointer" data-trip="${trip.id}" style="animation-delay: ${idx*0.05}s">
                <div class="h-28 relative overflow-hidden" style="background: ${trip.themeColor || '#8bb89a'};">
                  ${trip.coverImage ? `<img src="${trip.coverImage}" class="w-full h-full object-cover">` : ''}
                  <div class="absolute bottom-2 left-3 right-3"><h3 class="font-bold text-white text-sm drop-shadow-sm">${escapeHtml(trip.name)}</h3></div>
                </div>
                <div class="p-3">
                  <p class="text-[11px] text-[var(--text-secondary)]">📅 ${trip.startDate || ''} → ${trip.endDate || ''}</p>
                </div>
              </div>
            `).join('')}
          `;
          grid.querySelectorAll('[data-trip]').forEach(el => {
            el.addEventListener('click', () => location.hash = `#/trip/${el.dataset.trip}/dashboard`);
          });
          // Add retry button below
          const retryDiv = document.createElement('div');
          retryDiv.className = 'col-span-full flex gap-2 justify-center mt-4';
          retryDiv.innerHTML = `<button id="retry-trips" class="btn btn-primary btn-sm">🔄 ลองใหม่หลัง deploy Rules</button>`;
          grid.appendChild(retryDiv);
          document.getElementById('retry-trips').addEventListener('click', () => renderTripSelector());
          return;
        }
      }
    } catch {}
    
    grid.innerHTML = `<div class="col-span-full card p-5 text-center"><p class="text-sm font-bold text-red-500 mb-2">${escapeHtml(msg)}</p>${hint}<div class="flex gap-2 justify-center mt-4"><button id="retry-trips" class="btn btn-primary btn-sm">🔄 ลองใหม่</button><button id="show-rules" class="btn btn-secondary btn-sm">📋 ดู Rules</button><button id="clear-cfg-btn" class="btn btn-ghost btn-sm">ล้าง Config</button></div><p class="text-[10px] text-[var(--text-tertiary)] mt-3">UID: ${currentUser?.uid?.slice(0,8)} • ${currentUser?.email || ''}</p></div>`;
    document.getElementById('retry-trips').addEventListener('click', () => renderTripSelector());
    document.getElementById('clear-cfg-btn').addEventListener('click', () => { localStorage.removeItem('fuji_firebase_config'); location.reload(); });
    document.getElementById('show-rules')?.addEventListener('click', async () => {
      try {
        const res = await fetch('./firestore.rules');
        const rulesText = await res.text();
        showBottomSheet(`
          <h3 class="font-bold mb-3">📋 Firestore Rules - คัดลอกไป deploy</h3>
          <p class="text-xs mb-3">คัดลอกทั้งหมดไปวางใน Firebase Console > Firestore > Rules > Publish</p>
          <pre class="p-3 bg-black text-green-400 rounded-xl text-[10px] overflow-auto max-h-[400px] whitespace-pre-wrap">${escapeHtml(rulesText)}</pre>
          <button class="btn btn-primary w-full mt-3 btn-sm" onclick="navigator.clipboard.writeText(document.querySelector('pre').textContent).then(()=>alert('คัดลอกแล้ว'))">📋 คัดลอก Rules</button>
        `);
      } catch {
        toast.error('โหลด rules ไม่สำเร็จ');
      }
    });
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
          <h1 class="text-3xl font-bold tracking-tight" style="font-family: var(--font-display);">${escapeHtml(currentTrip?.name || 'Dashboard')}</h1>
          <p class="text-sm text-[var(--text-secondary)] mt-1">📅 ${currentTrip?.startDate || ''} - ${currentTrip?.endDate || ''} • 🌍 ${currentTrip?.country || ''}</p>
        </div>
        <div class="flex gap-2">
          <button id="add-place-quick" class="btn btn-secondary btn-sm">📍 ${t('addPlace')}</button>
          <button id="add-expense-quick" class="btn btn-primary btn-sm">💰 ${t('addExpense')}</button>
        </div>
      </div>
      
      <div id="dashboard-grid" class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div class="card-bento card col-span-2"><p class="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">⏳ ${t('countdown')}</p><h3 id="countdown" class="text-2xl font-bold mt-2" style="font-family: var(--font-display);">--</h3><p id="countdown-sub" class="text-sm text-[var(--text-secondary)] mt-1">--</p></div>
        <div class="card-bento card"><p class="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">💰 ${t('totalExpense')}</p><h3 id="total-expense" class="text-xl font-bold mt-2" style="font-family: var(--font-display);">--</h3><p class="text-xs text-[var(--text-secondary)]" id="total-expense-thb"></p></div>
        <div class="card-bento card"><p class="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">👤 ${t('myBalance')}</p><h3 id="my-balance" class="text-xl font-bold mt-2" style="font-family: var(--font-display);">--</h3><p class="text-xs text-[var(--text-secondary)]">${lang==='th' ? 'รับ/จ่าย' : 'receive/pay'}</p></div>
        <div class="card-bento card col-span-2 lg:col-span-2"><p class="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">🎯 ${t('currentActivity')}</p><div id="current-activity" class="mt-3"><div class="skeleton h-12"></div></div></div>
        <div class="card-bento card col-span-2 lg:col-span-2"><p class="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">📊 สรุป</p><div id="summary-stats" class="mt-3 text-sm space-y-1"><div class="skeleton h-4"></div></div></div>
      </div>
      
      <div id="member-board" class="card p-5">
        <h3 class="font-bold mb-4">👥 สมาชิก • ยอดต่อคน</h3>
        <div id="member-board-content" class="space-y-3"><div class="skeleton h-16"></div></div>
      </div>
      
      <div class="grid md:grid-cols-2 gap-4">
        <div class="card p-5">
          <h3 class="font-bold mb-4">📊 ค่าใช้จ่ายตามหมวด</h3>
          <div id="category-stats"><div class="skeleton h-20"></div></div>
        </div>
        <div class="card p-5">
          <h3 class="font-bold mb-4">✨ ${t('upNext')}</h3>
          <div id="upnext-list"></div>
        </div>
      </div>
    </div>
  `;

  document.getElementById('add-place-quick').addEventListener('click', () => location.hash = `#/trip/${tripId}/itinerary?action=add`);
  document.getElementById('add-expense-quick').addEventListener('click', () => location.hash = `#/trip/${tripId}/expenses/add`);

  try {
    const { expenses, members } = await fetchSettlementData(tripId);
    const totalMinor = expenses.reduce((s, e) => s + (e.netTotalMinor || 0), 0);
    document.getElementById('total-expense').textContent = formatCurrency(totalMinor, currentTrip?.baseCurrency || 'THB');
    
    // Calculate THB total if different currency
    const thbTotal = expenses.reduce((s, e) => s + (e.thbMinor || e.netTotalMinor || 0), 0);
    if (currentTrip?.baseCurrency !== 'THB') {
      document.getElementById('total-expense-thb').textContent = `≈ ${formatCurrency(thbTotal, 'THB')}`;
    } else {
      document.getElementById('total-expense-thb').textContent = `${expenses.length} รายการ`;
    }
    
    const { balances } = calculateSettlement(expenses, members.map(m => ({ id: m.id })));
    const myBal = balances.find(b => b.memberId === currentUser.uid);
    document.getElementById('my-balance').textContent = myBal ? formatCurrency(myBal.net, currentTrip?.baseCurrency || 'THB') : formatCurrency(0, currentTrip?.baseCurrency || 'THB');
    document.getElementById('summary-stats').innerHTML = `👥 ${members.length} คน • 💸 ${expenses.length} รายการ • 📅 ${currentTrip ? getTripDays(currentTrip.startDate, currentTrip.endDate).length : 0} วัน`;

    // Member board with round avatars
    const membersMap = Object.fromEntries(members.map(m => [m.id, m]));
    document.getElementById('member-board-content').innerHTML = balances.map(b => {
      const m = membersMap[b.memberId];
      const isMe = b.memberId === currentUser.uid;
      return `
        <div class="flex items-center justify-between p-3 rounded-xl border ${isMe ? 'bg-[var(--primary-light)] border-[var(--primary)]' : 'bg-[var(--bg-secondary)]'}" style="border-color: ${isMe ? 'var(--primary)' : 'var(--border)'};">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-full grid place-items-center text-sm font-bold text-white flex-shrink-0" style="background:${m?.color || '#8bb89a'};">
              ${m?.photoURL ? `<img src="${m.photoURL}" class="w-full h-full rounded-full object-cover">` : getInitials(m?.displayName || 'U')}
            </div>
            <div>
              <div class="font-semibold text-sm flex items-center gap-2">${escapeHtml(m?.displayName || b.memberId.slice(0,6))} ${isMe ? '<span class="text-[10px] px-2 py-0.5 rounded-full bg-[var(--primary)] text-white">คุณ</span>' : ''}</div>
              <div class="text-xs text-[var(--text-secondary)]">${m?.role || 'member'}</div>
            </div>
          </div>
          <div class="text-right">
            <div class="font-bold text-sm ${b.net >= 0 ? 'text-emerald-600' : 'text-red-500'}">${formatCurrency(b.net, currentTrip?.baseCurrency || 'THB')}</div>
            <div class="text-[11px] text-[var(--text-tertiary)]">${b.net >=0 ? 'ได้รับ' : 'จ่ายเพิ่ม'}</div>
          </div>
        </div>
      `;
    }).join('') || `<p class="text-sm text-[var(--text-secondary)]">ไม่มีข้อมูล</p>`;

    // Category stats
    const byCategory = {};
    expenses.forEach(e => {
      const cat = e.category || 'general';
      if (!byCategory[cat]) byCategory[cat] = 0;
      byCategory[cat] += e.netTotalMinor || 0;
    });
    document.getElementById('category-stats').innerHTML = Object.entries(byCategory).map(([cat, total]) => `
      <div class="flex justify-between text-sm py-2 border-b last:border-0" style="border-color: var(--border);">
        <span>${escapeHtml(cat)}</span><span class="font-bold">${formatCurrency(total, currentTrip?.baseCurrency || 'THB')}</span>
      </div>
    `).join('') || `<p class="text-xs text-[var(--text-secondary)]">ไม่มีข้อมูล</p>`;

    if (currentTrip?.startDate) {
      const start = dayjs(currentTrip.startDate);
      const now = dayjs();
      const diff = start.diff(now, 'day');
      document.getElementById('countdown').textContent = diff > 0 ? `อีก ${diff} วัน` : diff === 0 ? 'วันนี้!' : `ผ่านมา ${Math.abs(diff)} วัน`;
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
      document.getElementById('current-activity').innerHTML = `<p class="text-sm text-[var(--text-secondary)]">ไม่มีกิจกรรมตอนนี้</p>`;
    }

    const tripDays = getTripDays(currentTrip.startDate, currentTrip.endDate);
    const upNextDay = determineUpNextDay(tripDays, []);
    const upItems = await fetchItinerary(tripId, upNextDay);
    document.getElementById('upnext-list').innerHTML = upItems.length ? upItems.map((it, idx) => `
      <div class="flex gap-3 py-3 border-b last:border-0" style="border-color:var(--border);">
        <div class="w-8 h-8 rounded-full bg-[var(--primary)] text-white grid place-items-center text-xs font-bold flex-shrink-0">${idx+1}</div>
        <div class="flex-1 min-w-0"><div class="font-medium text-sm">${escapeHtml(it.title)}</div><div class="text-xs text-[var(--text-secondary)]">🕐 ${formatTime(it.startAt, currentTrip.timezone)} • 📍 ${escapeHtml(it.address || '')}</div></div>
      </div>
    `).join('') : `<p class="text-sm text-[var(--text-secondary)]">ไม่มีแผนสำหรับ ${upNextDay || 'วันนี้'}</p>`;

  } catch (e) {
    console.error(e);
    toast.error(getLang()==='th' ? 'โหลด Dashboard ไม่สำเร็จ: ' + e.message : 'Failed: ' + e.message);
    document.getElementById('dashboard-grid').innerHTML = `<div class="col-span-full card p-6 text-center"><p class="text-sm text-red-500">โหลดไม่สำเร็จ: ${escapeHtml(e.message)}</p><button onclick="location.reload()" class="btn btn-secondary btn-sm mt-3">🔄 ลองใหม่</button></div>`;
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
      <div class="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 class="text-2xl font-bold" style="font-family: var(--font-display);">🗺️ ${t('itinerary')}</h1>
        <div class="flex gap-2">
          <button id="view-all-btn" class="btn btn-secondary btn-sm">📅 ทั้งหมด</button>
          <button id="toggle-map-btn" class="btn btn-secondary btn-sm">🗺️ แผนที่</button>
          <button id="export-png-btn" class="btn btn-secondary btn-sm">🖼️ PNG</button>
          <button id="edit-mode-btn" class="btn btn-secondary btn-sm">${t('editMode')}</button>
          <button id="add-itinerary-btn" class="btn btn-primary btn-sm">+ ${t('addPlace')}</button>
        </div>
      </div>
      <div id="map-container" class="hidden mb-6"><div id="map" class="w-full h-[50vh] rounded-xl overflow-hidden border" style="border-color:var(--border);"></div></div>
      <div id="date-chips" class="flex gap-2 overflow-x-auto pb-3 mb-4"></div>
      <div id="itinerary-list" class="space-y-3"></div>
    </div>
  `;

  let selectedDate = urlParams.get('date') || dayjs().format('YYYY-MM-DD');
  let editMode = false;
  let showAll = false;
  let mapVisible = false;
  let mapInstance = null;

  const tripDays = currentTrip ? getTripDays(currentTrip.startDate, currentTrip.endDate) : [];
  const chipsEl = document.getElementById('date-chips');
  chipsEl.innerHTML = tripDays.map(d => {
    const ds = dayjs(d).format('YYYY-MM-DD');
    return `<button data-date="${ds}" class="chip ${ds===selectedDate && !showAll?'chip-active':''}">${dayjs(d).format('DD MMM')}</button>`;
  }).join('');
  chipsEl.querySelectorAll('[data-date]').forEach(btn => btn.addEventListener('click', () => {
    selectedDate = btn.dataset.date;
    showAll = false;
    chipsEl.querySelectorAll('.chip').forEach(c => c.classList.remove('chip-active'));
    btn.classList.add('chip-active');
    loadItems();
  }));

  document.getElementById('view-all-btn').addEventListener('click', () => {
    showAll = !showAll;
    document.getElementById('view-all-btn').textContent = showAll ? '📅 รายวัน' : '📅 ทั้งหมด';
    document.getElementById('view-all-btn').className = showAll ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm';
    if (showAll) chipsEl.querySelectorAll('.chip').forEach(c => c.classList.remove('chip-active'));
    else {
      const activeBtn = chipsEl.querySelector(`[data-date="${selectedDate}"]`);
      if (activeBtn) activeBtn.classList.add('chip-active');
    }
    loadItems();
  });

  document.getElementById('toggle-map-btn').addEventListener('click', async () => {
    mapVisible = !mapVisible;
    const container = document.getElementById('map-container');
    container.classList.toggle('hidden', !mapVisible);
    document.getElementById('toggle-map-btn').className = mapVisible ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm';
    if (mapVisible) {
      setTimeout(() => loadMap(), 100);
    }
  });

  async function loadMap() {
    try {
      const { initMap, addItineraryMarkers } = await import('./maps/index.js');
      const res = await initMap('map');
      mapInstance = res.map;
      const L = res.L;
      const items = await fetchItinerary(tripId, showAll ? null : selectedDate);
      const dayColors = {};
      tripDays.forEach((d, i) => {
        const hue = (i * 60) % 360;
        dayColors[dayjs(d).format('YYYY-MM-DD')] = `hsl(${hue},65%,65%)`;
      });
      addItineraryMarkers(mapInstance, L, items, dayColors);
    } catch (e) {
      document.getElementById('map').innerHTML = `<div class="grid place-items-center h-full text-sm text-red-500 p-4">Map: ${escapeHtml(e.message)}</div>`;
    }
  }

  document.getElementById('export-png-btn').addEventListener('click', async () => {
    const { exportToPng } = await import('./exports/index.js');
    await exportToPng('itinerary-list', `itinerary-${tripId}.png`);
  });

  async function loadItems() {
    const listEl = document.getElementById('itinerary-list');
    listEl.innerHTML = `<div class="skeleton h-20"></div><div class="skeleton h-20"></div>`;
    try {
      let items = [];
      if (showAll) {
        // Fetch all days
        for (const d of tripDays) {
          const dayItems = await fetchItinerary(tripId, dayjs(d).format('YYYY-MM-DD'));
          items.push(...dayItems.map(it => ({ ...it, _day: dayjs(d).format('YYYY-MM-DD') })));
        }
        items.sort((a,b) => new Date(a.startAt) - new Date(b.startAt));
      } else {
        items = await fetchItinerary(tripId, selectedDate);
      }
      
      if (!items.length) {
        listEl.innerHTML = renderEmptyState({ title: lang==='th' ? 'ไม่มีแผน' : 'No plans', desc: `${showAll ? 'ไม่มีแผนทั้งหมด' : `ไม่มีแผนสำหรับ ${selectedDate}`} 🌿`, actionHtml: `<button id="empty-add" class="btn btn-primary btn-sm mt-3">+ ${t('addPlace')}</button>` });
        document.getElementById('empty-add')?.addEventListener('click', () => showAddModal());
        return;
      }
      
      // Group by day if showAll
      if (showAll) {
        const byDay = {};
        items.forEach(it => {
          const day = it._day || it.date;
          if (!byDay[day]) byDay[day] = [];
          byDay[day].push(it);
        });
        listEl.innerHTML = Object.entries(byDay).map(([day, dayItems]) => `
          <div class="mb-6">
            <h3 class="font-bold text-sm mb-3 flex items-center gap-2"><span class="w-8 h-8 rounded-full bg-[var(--primary)] text-white grid place-items-center text-xs">${dayjs(day).format('DD')}</span> ${formatDate(day, lang, currentTrip.timezone)} • ${dayItems.length} ที่</h3>
            <div class="space-y-3">
              ${dayItems.map((it, idx) => renderItemCard(it, idx, editMode)).join('')}
            </div>
          </div>
        `).join('');
      } else {
        listEl.innerHTML = items.map((it, idx) => renderItemCard(it, idx, editMode)).join('');
      }

      function renderItemCard(it, idx, editMode) {
        return `
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
                ${it.imageUrl ? `<div class="mt-2 rounded-xl overflow-hidden border" style="border-color: var(--border);"><img src="${it.imageUrl}" class="w-full h-32 object-cover" onerror="this.style.display='none'"></div>` : ''}
                ${it.coordinates ? `<p class="text-[11px] mt-1 text-[var(--text-tertiary)]">📌 ${escapeHtml(it.coordinates)}</p>` : ''}
              </div>
            </div>
          </div>
        `;
      }

      if (editMode) {
        try {
          const Sortable = (await import('https://esm.sh/sortablejs@1.15.3')).default;
          Sortable.create(listEl, {
            animation: 150,
            onEnd: async () => {
              const newOrder = Array.from(listEl.querySelectorAll('[data-id]')).map(el => el.dataset.id);
              const tLoad = toast.loading(lang==='th' ? 'จัดลำดับ...' : 'Reordering...');
              try {
                await reorderItinerary(tripId, selectedDate, newOrder, currentUser.uid);
                tLoad.close();
                toast.success('✅ จัดแล้ว');
                loadItems();
              } catch (e) { tLoad.close(); toast.error(e.message); }
            }
          });
        } catch (e) { console.warn('Sortable failed', e); }
      }
      if (mapVisible) loadMap();
    } catch (e) { listEl.innerHTML = `<p class="text-sm text-red-500">${escapeHtml(e.message)}</p>`; }
  }

  function showAddModal() {
    showBottomSheet(`
      <h3 class="font-bold text-lg mb-4" style="font-family: var(--font-display);">📍 ${t('addPlace')}</h3>
      <form id="itinerary-form" class="space-y-4">
        <div class="input-group"><label class="input-label">✨ ชื่อสถานที่</label><input id="it-title" class="input" required autocomplete="off"></div>
        <div class="grid grid-cols-2 gap-3">
          <div class="input-group"><label class="input-label">📅 วันที่</label><input id="it-date" class="input" type="date" value="${selectedDate}" required></div>
          <div class="input-group"><label class="input-label">🕐 เริ่ม</label><input id="it-time" class="input" type="time" value="09:00" required></div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div class="input-group"><label class="input-label">⏱️ ระยะเวลา (นาที)</label><input id="it-duration" class="input" type="number" min="0" value="60"></div>
          <div class="input-group"><label class="input-label">🚶 เดินทาง (นาที)</label><input id="it-travel" class="input" type="number" min="0" value="0"></div>
        </div>
        <div class="input-group"><label class="input-label">📍 พิกัด lat,lng</label><input id="it-coords" class="input" placeholder="35.3606,138.7274" autocomplete="off"></div>
        <div class="input-group"><label class="input-label">🏠 ที่อยู่</label><input id="it-address" class="input" autocomplete="off"></div>
        <div class="input-group">
          <label class="input-label">🖼️ รูปภาพ URL</label>
          <input id="it-image-url" class="input" placeholder="https://example.com/image.jpg">
          <div id="it-image-preview" class="hidden mt-2 rounded-xl overflow-hidden border" style="border-color: var(--border);">
            <img id="it-preview-img" class="w-full h-32 object-cover">
          </div>
          <p class="input-hint">ใส่ลิงก์รูปภาพ จะแสดงตัวอย่างอัตโนมัติ</p>
        </div>
        <button class="btn btn-primary w-full">💾 ${t('save')}</button>
      </form>
    `);
    
    const urlInput = document.getElementById('it-image-url');
    const preview = document.getElementById('it-image-preview');
    const previewImg = document.getElementById('it-preview-img');
    urlInput.addEventListener('input', () => {
      const url = urlInput.value.trim();
      if (url && url.startsWith('http')) {
        previewImg.src = url;
        preview.classList.remove('hidden');
        previewImg.onerror = () => preview.classList.add('hidden');
      } else {
        preview.classList.add('hidden');
      }
    });
    
    document.getElementById('itinerary-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector('button[type="submit"]') || e.target.querySelector('button');
      if (!btn) return;
      btn.disabled = true;
      const tLoad = toast.loading('Saving...');
      try {
        const date = document.getElementById('it-date').value;
        const time = document.getElementById('it-time').value;
        const startAt = new Date(`${date}T${time}`);
        const coords = document.getElementById('it-coords').value.trim();
        if (coords) {
          const parsed = parseCoordinates(coords);
          if (!parsed) throw new Error('พิกัดไม่ถูกต้อง');
        }
        await addItineraryItem(tripId, {
          title: document.getElementById('it-title').value,
          date,
          startAt,
          durationMinutes: parseInt(document.getElementById('it-duration').value,10),
          travelToNextMinutes: parseInt(document.getElementById('it-travel').value,10),
          coordinates: coords,
          address: document.getElementById('it-address').value,
          imageUrl: document.getElementById('it-image-url').value.trim(),
          category: 'general'
        }, currentUser.uid);
        tLoad.close();
        toast.success('✅ เพิ่มแล้ว');
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

async function renderExpenses(params) {
  const tripId = params.tripId;
  await loadTrip(tripId);
  appEl.innerHTML = `
    <div class="page-enter">
      <div class="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 class="text-2xl font-bold" style="font-family: var(--font-display);">💰 ${t('expenses')}</h1>
        <div class="flex gap-2">
          <button id="export-expenses" class="btn btn-secondary btn-sm">📤 Export</button>
          <button id="import-expenses-btn" class="btn btn-secondary btn-sm">📥 Import</button>
          <button id="add-expense-btn" class="btn btn-primary btn-sm">+ ${t('addExpense')}</button>
        </div>
      </div>
      <div class="flex gap-2 overflow-x-auto pb-3 mb-4" id="expense-filters">
        <button class="chip chip-active" data-filter="all">${t('all')}</button>
        <button class="chip" data-filter="today">${t('today')}</button>
        <button class="chip" data-filter="no-receipt">${t('noReceipt')}</button>
      </div>
      <div id="expense-list" class="space-y-3"></div>
      <div id="expense-pagination" class="flex justify-center mt-6"><button id="load-more" class="btn btn-secondary btn-sm">โหลดเพิ่ม</button></div>
    </div>
  `;

  document.getElementById('add-expense-btn').addEventListener('click', () => location.hash = `#/trip/${tripId}/expenses/add`);
  document.getElementById('export-expenses').addEventListener('click', async () => {
    const tLoad = toast.loading('Exporting...');
    try {
      const data = await exportExpensesToJson(tripId);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `expenses-${tripId}.json`;
      a.click();
      URL.revokeObjectURL(url);
      tLoad.close();
      toast.success('✅ Exported');
    } catch (e) { tLoad.close(); toast.error(e.message); }
  });
  document.getElementById('import-expenses-btn').addEventListener('click', () => {
    showBottomSheet(`
      <h3 class="font-bold mb-4">📥 Import Expenses</h3>
      <input id="import-file" type="file" accept=".json" class="input mb-3">
      <div id="import-preview" class="text-xs mb-3"></div>
      <button id="do-import-exp" class="btn btn-primary w-full" disabled>Import</button>
      <p class="text-[11px] text-[var(--text-tertiary)] mt-2">รองรับไฟล์ JSON ที่ export จากระบบนี้</p>
    `);
    let parsed = null;
    document.getElementById('import-file').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const text = await file.text();
      try {
        parsed = JSON.parse(text);
        document.getElementById('import-preview').textContent = `พบ ${parsed.length} รายการ`;
        document.getElementById('do-import-exp').disabled = false;
      } catch (err) {
        document.getElementById('import-preview').textContent = 'ไฟล์ไม่ถูกต้อง';
      }
    });
    document.getElementById('do-import-exp').addEventListener('click', async () => {
      if (!parsed) return;
      const btn = document.getElementById('do-import-exp');
      btn.disabled = true;
      const tLoad = toast.loading('Importing...');
      try {
        const { importExpensesFromJson } = await import('./expenses/index.js');
        await importExpensesFromJson(tripId, parsed, currentUser.uid);
        tLoad.close();
        toast.success(`✅ Imported ${parsed.length}`);
        document.querySelector('.bottom-sheet-backdrop')?.click();
        loadMore(true);
      } catch (e) { tLoad.close(); toast.error(e.message); btn.disabled = false; }
    });
  });

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
            <div class="text-right"><div class="font-bold text-sm" style="font-family: var(--font-display);">${formatCurrency(e.netTotalMinor||0, e.currency||'THB')}</div>${e.thbMinor && e.currency !== 'THB' ? `<div class="text-[11px] text-[var(--text-tertiary)]">${formatCurrency(e.thbMinor, 'THB')}</div>` : ''}</div>
          </div>
          ${e.isEstimated ? `<span class="badge badge-planned text-[10px] mt-2">ประมาณการ</span>` : ''}
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
        <div class="input-group"><label class="input-label">✨ ชื่อรายการ</label><input id="ex-title" class="input" required autocomplete="off"></div>
        <div class="grid grid-cols-2 gap-3">
          <div class="input-group"><label class="input-label">📅 วันที่</label><input id="ex-date" class="input" type="date" value="${dayjs().format('YYYY-MM-DD')}" required></div>
          <div class="input-group"><label class="input-label">🏷️ หมวด</label><select id="ex-cat" class="input"><option value="food">🍜 อาหาร</option><option value="transport">🚃 เดินทาง</option><option value="stay">🏨 ที่พัก</option><option value="activity">🎯 กิจกรรม</option><option value="shopping">🛍️ ช้อปปิ้ง</option><option value="general">📦 ทั่วไป</option></select></div>
        </div>
        <div class="grid grid-cols-3 gap-3">
          <div class="input-group col-span-2"><label class="input-label">💵 ยอดรวม</label><input id="ex-subtotal" class="input" type="number" step="0.01" required></div>
          <div class="input-group"><label class="input-label">💱 สกุลเงิน</label><select id="ex-currency" class="input"><option value="THB">THB</option><option value="JPY">JPY</option><option value="USD">USD</option><option value="KRW">KRW</option><option value="EUR">EUR</option></select></div>
        </div>
        <div class="grid grid-cols-3 gap-3">
          <div class="input-group"><label class="input-label">🎟️ ส่วนลด</label><input id="ex-discount" class="input" type="number" step="0.01" value="0"></div>
          <div class="input-group"><label class="input-label">💁 Service</label><input id="ex-service" class="input" type="number" step="0.01" value="0"></div>
          <div class="input-group"><label class="input-label">🧾 Tax</label><input id="ex-tax" class="input" type="number" step="0.01" value="0"></div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div class="input-group"><label class="input-label">💱 เรทเป็น THB</label><input id="ex-thb-rate" class="input" type="number" step="0.0001" value="1"><p class="input-hint">เช่น JPY 0.25 = 1 JPY = 0.25 THB</p></div>
          <div class="input-group"><label class="input-label">📊 ประเภท</label><select id="ex-type" class="input"><option value="actual">จ่ายจริง</option><option value="estimated">ประมาณการ</option></select></div>
        </div>
        <div id="net-preview" class="p-4 rounded-xl bg-[var(--bg-secondary)] text-sm font-bold border" style="border-color: var(--border);">💰 ${t('netTotal')}: --</div>
        <div id="thb-preview" class="p-3 rounded-xl bg-emerald-50 border text-sm" style="border-color: #c5d9cc;">🇹🇭 THB: --</div>
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
      <div class="flex items-center gap-2"><div class="avatar w-8 h-8 text-xs" style="background:${m.color||'#8bb89a'}">${m.photoURL ? `<img src="${m.photoURL}" class="w-full h-full rounded-full object-cover">` : getInitials(m.displayName)}</div><span class="text-sm font-medium">${escapeHtml(m.displayName)}</span></div>
    </div>
  `).join('');
  payerTiles.querySelectorAll('[data-payer]').forEach(el => el.addEventListener('click', () => {
    selectedPayer = el.dataset.payer;
    payerTiles.querySelectorAll('.tile').forEach(t => t.classList.remove('tile-selected'));
    el.classList.add('tile-selected');
    renderSplitArea();
  }));

  const netPreview = document.getElementById('net-preview');
  const thbPreview = document.getElementById('thb-preview');
  function updateNet() {
    const sub = parseFloat(document.getElementById('ex-subtotal').value) || 0;
    const disc = parseFloat(document.getElementById('ex-discount').value) || 0;
    const serv = parseFloat(document.getElementById('ex-service').value) || 0;
    const tax = parseFloat(document.getElementById('ex-tax').value) || 0;
    const rate = parseFloat(document.getElementById('ex-thb-rate').value) || 1;
    let net = sub - disc + serv + tax;
    const cur = document.getElementById('ex-currency').value;
    netPreview.textContent = `💰 ${t('netTotal')}: ${net.toFixed(2)} ${cur}`;
    thbPreview.textContent = `🇹🇭 THB: ${(net * rate).toFixed(2)} THB (เรท ${rate})`;
    renderSplitArea();
  }
  ['ex-subtotal','ex-discount','ex-service','ex-tax','ex-currency','ex-thb-rate'].forEach(id => document.getElementById(id).addEventListener('input', updateNet));
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
    const tLoad = toast.loading('Saving...');
    try {
      const subMinor = Math.round((parseFloat(document.getElementById('ex-subtotal').value)||0)*100);
      const discMinor = Math.round((parseFloat(document.getElementById('ex-discount').value)||0)*100);
      const servMinor = Math.round((parseFloat(document.getElementById('ex-service').value)||0)*100);
      const taxMinor = Math.round((parseFloat(document.getElementById('ex-tax').value)||0)*100);
      const thbRate = parseFloat(document.getElementById('ex-thb-rate').value) || 1;
      const isEstimated = document.getElementById('ex-type').value === 'estimated';
      const cur = document.getElementById('ex-currency').value;
      const net = (parseFloat(document.getElementById('ex-subtotal').value)||0) - (parseFloat(document.getElementById('ex-discount').value)||0) + (parseFloat(document.getElementById('ex-service').value)||0) + (parseFloat(document.getElementById('ex-tax').value)||0);

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
        currency: cur,
        baseCurrency: currentTrip.baseCurrency,
        payerId: selectedPayer,
        allocations,
        paymentMethod: 'cash',
        thbRate,
        thbMinor: Math.round(net * thbRate * 100),
        isEstimated,
        estimatedMinor: isEstimated ? Math.round(net*100) : 0,
        actualMinor: isEstimated ? 0 : Math.round(net*100)
      }, currentUser.uid);

      tLoad.close();
      toast.success('✅ บันทึกแล้ว');
      location.hash = `#/trip/${tripId}/expenses`;
    } catch (err) { tLoad.close(); toast.error(err.message); submitBtn.disabled = false; }
  });
}

async function renderSettlement(params) {
  const tripId = params.tripId;
  await loadTrip(tripId);
  appEl.innerHTML = `
    <div class="page-enter">
      <div class="flex items-center justify-between mb-6"><h1 class="text-2xl font-bold" style="font-family: var(--font-display);">🤝 ${t('settlement')}</h1><button id="recalc-settle" class="btn btn-primary btn-sm">🔄 คำนวณใหม่</button></div>
      <div id="settlement-content" class="space-y-4"><div class="skeleton h-32"></div></div>
      <div class="card p-5 mt-6"><h3 class="font-bold mb-3">📤 Export</h3><div class="flex gap-2"><button id="copy-line" class="btn btn-secondary btn-sm">📋 LINE</button><button id="export-png" class="btn btn-secondary btn-sm">🖼️ PNG</button></div></div>
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
            const isMe = b.memberId === currentUser.uid;
            return `<div class="flex justify-between items-center text-sm py-3 border-b last:border-0 ${isMe ? 'bg-[var(--primary-light)] -mx-2 px-2 rounded-xl font-bold' : ''}" style="border-color:var(--border);"><div class="flex items-center gap-2"><div class="w-8 h-8 rounded-full grid place-items-center text-xs font-bold text-white" style="background:${m?.color||'#8bb89a'}">${m?.photoURL ? `<img src="${m.photoURL}" class="w-full h-full rounded-full object-cover">` : getInitials(m?.displayName||'')}</div><span>${escapeHtml(m?.displayName||b.memberId.slice(0,6))} ${isMe ? '(คุณ)' : ''}</span></div><span class="${b.net>=0?'text-emerald-600':'text-red-400'} font-bold">${formatCurrency(b.net, currentTrip.baseCurrency)}</span></div>`;
          }).join('')}</div>
          <div class="card p-5"><h4 class="font-bold text-sm mb-4">🔄 ${t('transactions')} (${transactions.length})</h4><div class="space-y-3">${transactions.map(tx => {
            const from = membersMap[tx.from]; const to = membersMap[tx.to];
            return `<div class="flex items-center justify-between p-3 rounded-xl bg-[var(--bg-secondary)] border" style="border-color: var(--border);"><div class="flex items-center gap-2"><span class="avatar w-8 h-8 text-xs" style="background:${from?.color||'#ccc'}">${from?.photoURL ? `<img src="${from.photoURL}" class="w-full h-full rounded-full object-cover">` : getInitials(from?.displayName||'')}</span>→<span class="avatar w-8 h-8 text-xs" style="background:${to?.color||'#ccc'}">${to?.photoURL ? `<img src="${to.photoURL}" class="w-full h-full rounded-full object-cover">` : getInitials(to?.displayName||'')}</span><span class="text-xs">${escapeHtml(from?.displayName||'')} → ${escapeHtml(to?.displayName||'')}</span></div><div class="text-right"><div class="font-bold text-sm">${formatCurrency(tx.amountMinor, currentTrip.baseCurrency)}</div></div></div>`;
          }).join('')}</div></div>
        </div>
      `;
      document.getElementById('copy-line').addEventListener('click', async () => {
        const { copySettlementAsLineText } = await import('./exports/index.js');
        const text = copySettlementAsLineText(transactions, membersMap, currentTrip.baseCurrency);
        await navigator.clipboard.writeText(text);
        toast.success('📋 คัดลอกแล้ว');
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
    try { await recalculateAndSaveSettlement(tripId, currentUser.uid); tLoad.close(); toast.success('✅ คำนวณแล้ว'); load(); } catch (e) { tLoad.close(); toast.error(e.message); } finally { btn.disabled = false; btn.textContent = '🔄 คำนวณใหม่'; }
  });
  load();
}

async function renderMembers(params) {
  const tripId = params.tripId;
  await loadTrip(tripId);
  appEl.innerHTML = `
    <div class="page-enter">
      <div class="flex items-center justify-between mb-6"><h1 class="text-2xl font-bold" style="font-family: var(--font-display);">👥 ${t('members')}</h1><button id="add-member-btn" class="btn btn-primary btn-sm">+ เพิ่ม</button></div>
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
          <div class="flex items-center gap-3"><div class="w-10 h-10 rounded-full grid place-items-center text-sm font-bold text-white flex-shrink-0" style="background:${m.color||'#8bb89a'}">${m.photoURL ? `<img src="${m.photoURL}" class="w-full h-full rounded-full object-cover">` : getInitials(m.displayName)}</div><div><div class="font-semibold text-sm">${escapeHtml(m.displayName)} ${m.id === currentUser.uid ? '<span class="text-[10px] px-2 py-0.5 rounded-full bg-[var(--primary)] text-white">คุณ</span>' : ''}</div><div class="text-xs text-[var(--text-secondary)]">${escapeHtml(m.role||'member')} • ${escapeHtml(m.status||'active')}</div></div></div>
          <span class="badge badge-planned">${escapeHtml(m.role||'')}</span>
        </div>
      `).join('');
    } catch (e) { list.innerHTML = `<p class="text-sm text-red-500 p-4">${escapeHtml(e.message)}</p>`; }
  }

  document.getElementById('add-member-btn').addEventListener('click', () => {
    showBottomSheet(`
      <h3 class="font-bold text-lg mb-4" style="font-family: var(--font-display);">👥 เพิ่มสมาชิก</h3>
      <form id="add-member-form" class="space-y-4">
        <div class="input-group"><label class="input-label">👤 Username</label><input id="m-user" class="input" required autocomplete="off"></div>
        <div class="input-group"><label class="input-label">✨ Display Name</label><input id="m-name" class="input" required autocomplete="off"></div>
        <div class="input-group"><label class="input-label">🔢 PIN (4-12)</label><input id="m-pin" class="input" type="password" required></div>
        <div class="input-group"><label class="input-label">🖼️ Photo URL (optional)</label><input id="m-photo" class="input" placeholder="https://..."></div>
        <div class="input-group"><label class="input-label">🎨 Color</label><input id="m-color" type="color" value="#8bb89a" class="w-12 h-12 rounded-full border-2 border-white shadow-sm"></div>
        <div class="input-group"><label class="input-label">🎭 Role</label><select id="m-role" class="input"><option value="member">Member</option><option value="trip_admin">Trip Admin</option><option value="viewer">Viewer</option></select></div>
        <button type="submit" class="btn btn-primary w-full">🌿 ${t('add')}</button>
      </form>
    `);
    setTimeout(() => addPasswordToggle('m-pin'), 10);
    document.getElementById('add-member-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector('button[type="submit"]') || e.target.querySelector('button');
      if (!btn) return;
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
          role: document.getElementById('m-role').value,
          photoURL: document.getElementById('m-photo').value.trim() || null,
          color: document.getElementById('m-color').value
        });
        tLoad.close();
        toast.success('✅ สร้างแล้ว');
        document.querySelector('.bottom-sheet-backdrop')?.click();
        loadMembers();
      } catch (err) { tLoad.close(); toast.error(err.message); btn.disabled = false; btn.textContent = '🌿 ' + t('add'); }
    });
  });
  loadMembers();
}

async function renderDocuments(params) {
  const tripId = params.tripId;
  await loadTrip(tripId);
  const urlParams = new URLSearchParams(location.hash.split('?')[1] || '');
  const action = urlParams.get('action');
  
  appEl.innerHTML = `
    <div class="page-enter">
      <div class="flex items-center justify-between mb-6">
        <h1 class="text-2xl font-bold" style="font-family: var(--font-display);">📁 เอกสารสำคัญ</h1>
        <button id="add-doc-btn" class="btn btn-primary btn-sm">+ เพิ่ม</button>
      </div>
      <div class="flex gap-2 overflow-x-auto pb-3 mb-4" id="doc-filters">
        <button class="chip chip-active" data-cat="all">ทั้งหมด</button>
        <button class="chip" data-cat="passport">พาสปอร์ต</button>
        <button class="chip" data-cat="ticket">ตั๋ว</button>
        <button class="chip" data-cat="hotel">โรงแรม</button>
        <button class="chip" data-cat="insurance">ประกัน</button>
        <button class="chip" data-cat="other">อื่นๆ</button>
      </div>
      <div id="docs-list" class="grid gap-3"></div>
    </div>
  `;
  
  let selectedCat = 'all';
  document.querySelectorAll('#doc-filters [data-cat]').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedCat = btn.dataset.cat;
      document.querySelectorAll('#doc-filters .chip').forEach(c => c.classList.remove('chip-active'));
      btn.classList.add('chip-active');
      loadDocs();
    });
  });
  
  async function loadDocs() {
    const list = document.getElementById('docs-list');
    list.innerHTML = `<div class="skeleton h-20"></div>`;
    try {
      const { getDocs, collection, query, where, orderBy } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
      let q;
      if (selectedCat === 'all') {
        q = query(collection(db, `trips/${tripId}/documents`), orderBy('createdAt', 'desc'));
      } else {
        // Try with category filter, fallback to client filter if index missing
        try {
          q = query(collection(db, `trips/${tripId}/documents`), where('category', '==', selectedCat), orderBy('createdAt', 'desc'));
        } catch {
          q = collection(db, `trips/${tripId}/documents`);
        }
      }
      const snap = await getDocs(q);
      let docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (selectedCat !== 'all') {
        docs = docs.filter(d => d.category === selectedCat);
      }
      docs.sort((a,b) => (b.createdAt?.seconds||0) - (a.createdAt?.seconds||0));
      
      if (!docs.length) {
        list.innerHTML = `<div class="card p-8 text-center"><p class="text-sm text-[var(--text-secondary)]">ไม่มีเอกสารในหมวดนี้</p></div>`;
        return;
      }
      
      list.innerHTML = docs.map(doc => `
        <div class="card p-4">
          <div class="flex gap-3">
            <div class="w-12 h-12 rounded-xl bg-[var(--bg-secondary)] grid place-items-center text-xl flex-shrink-0">
              ${doc.category === 'passport' ? '🛂' : doc.category === 'ticket' ? '🎫' : doc.category === 'hotel' ? '🏨' : doc.category === 'insurance' ? '🛡️' : '📄'}
            </div>
            <div class="flex-1 min-w-0">
              <h3 class="font-semibold text-sm truncate">${escapeHtml(doc.title)}</h3>
              <p class="text-xs text-[var(--text-secondary)] mt-1">${escapeHtml(doc.category)} • ${doc.createdAt ? formatDate(doc.createdAt.seconds ? new Date(doc.createdAt.seconds*1000).toISOString().split('T')[0] : doc.createdAt, getLang(), currentTrip.timezone) : ''}</p>
              ${doc.description ? `<p class="text-xs mt-1">${escapeHtml(doc.description)}</p>` : ''}
              ${doc.fileUrl ? `<a href="${doc.fileUrl}" target="_blank" class="text-xs text-[var(--primary)] underline mt-1 inline-block">🔗 เปิดไฟล์</a>` : ''}
              ${doc.imageUrl ? `<div class="mt-2 rounded-xl overflow-hidden border" style="border-color: var(--border);"><img src="${doc.imageUrl}" class="w-full h-32 object-cover"></div>` : ''}
            </div>
          </div>
        </div>
      `).join('');
    } catch (e) {
      list.innerHTML = `<p class="text-sm text-red-500 p-4">${escapeHtml(e.message)}</p>`;
    }
  }
  
  function showAddDoc() {
    showBottomSheet(`
      <h3 class="font-bold text-lg mb-4">📁 เพิ่มเอกสาร</h3>
      <form id="doc-form" class="space-y-4">
        <div class="input-group"><label class="input-label">📄 ชื่อเอกสาร *</label><input id="doc-title" class="input" required></div>
        <div class="input-group"><label class="input-label">📂 หมวดหมู่</label><select id="doc-cat" class="input"><option value="passport">🛂 พาสปอร์ต</option><option value="ticket">🎫 ตั๋ว</option><option value="hotel">🏨 โรงแรม</option><option value="insurance">🛡️ ประกัน</option><option value="other">📄 อื่นๆ</option></select></div>
        <div class="input-group"><label class="input-label">📝 รายละเอียด</label><textarea id="doc-desc" class="input min-h-[80px]"></textarea></div>
        <div class="input-group"><label class="input-label">🔗 ลิงก์ไฟล์</label><input id="doc-file-url" class="input" placeholder="https://..."></div>
        <div class="input-group"><label class="input-label">🖼️ รูปภาพ URL</label><input id="doc-image-url" class="input" placeholder="https://..."><div id="doc-img-preview" class="hidden mt-2 rounded-xl overflow-hidden border" style="border-color: var(--border);"><img id="doc-preview-img" class="w-full h-32 object-cover"></div></div>
        <button type="submit" class="btn btn-primary w-full">💾 บันทึก</button>
      </form>
    `);
    
    const imgInput = document.getElementById('doc-image-url');
    const preview = document.getElementById('doc-img-preview');
    const previewImg = document.getElementById('doc-preview-img');
    imgInput.addEventListener('input', () => {
      const url = imgInput.value.trim();
      if (url && url.startsWith('http')) {
        previewImg.src = url;
        preview.classList.remove('hidden');
        previewImg.onerror = () => preview.classList.add('hidden');
      } else preview.classList.add('hidden');
    });
    
    document.getElementById('doc-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector('button[type="submit"]') || e.target.querySelector('button');
      if (!btn) return;
      btn.disabled = true;
      const tLoad = toast.loading('Saving...');
      try {
        const { addDoc, collection, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
        await addDoc(collection(db, `trips/${tripId}/documents`), {
          title: document.getElementById('doc-title').value,
          category: document.getElementById('doc-cat').value,
          description: document.getElementById('doc-desc').value,
          fileUrl: document.getElementById('doc-file-url').value.trim(),
          imageUrl: document.getElementById('doc-image-url').value.trim(),
          createdBy: currentUser.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        tLoad.close();
        toast.success('✅ บันทึกแล้ว');
        document.querySelector('.bottom-sheet-backdrop')?.click();
        loadDocs();
      } catch (err) { tLoad.close(); toast.error(err.message); btn.disabled = false; }
    });
  }
  
  document.getElementById('add-doc-btn').addEventListener('click', showAddDoc);
  loadDocs();
  if (action === 'add') showAddDoc();
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
      <div class="card p-6 space-y-4"><h3 class="font-bold">📤 Export</h3><div class="flex flex-wrap gap-2"><button id="exp-itinerary" class="btn btn-secondary btn-sm">🖼️ Itinerary PNG</button><button id="exp-expenses" class="btn btn-secondary btn-sm">💰 Expenses CSV</button><button id="exp-expenses-json" class="btn btn-secondary btn-sm">💰 Expenses JSON</button></div></div>
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
  
  document.getElementById('exp-expenses-json').addEventListener('click', async () => {
    const tLoad = toast.loading('Exporting...');
    try {
      const data = await exportExpensesToJson(tripId);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `expenses-${tripId}.json`;
      a.click();
      URL.revokeObjectURL(url);
      tLoad.close();
      toast.success('✅ Exported JSON');
    } catch (e) { tLoad.close(); toast.error(e.message); }
  });
}

async function renderSettings(params) {
  const tripId = params.tripId;
  await loadTrip(tripId);
  const lang = getLang();
  const currentColor = localStorage.getItem('fuji_color_theme') || 'sage';
  
  // Real currency list with THB rates example
  const currencies = [
    { code: 'THB', name: 'บาทไทย', rate: 1 },
    { code: 'JPY', name: 'เยนญี่ปุ่น', rate: 0.24 },
    { code: 'USD', name: 'ดอลลาร์สหรัฐ', rate: 36.5 },
    { code: 'EUR', name: 'ยูโร', rate: 39.2 },
    { code: 'KRW', name: 'วอนเกาหลี', rate: 0.027 },
    { code: 'SGD', name: 'ดอลลาร์สิงคโปร์', rate: 27.1 },
    { code: 'GBP', name: 'ปอนด์', rate: 45.8 },
    { code: 'CNY', name: 'หยวนจีน', rate: 5.1 },
    { code: 'HKD', name: 'ดอลลาร์ฮ่องกง', rate: 4.67 },
    { code: 'AUD', name: 'ดอลลาร์ออสเตรเลีย', rate: 23.5 },
  ];
  
  const timezones = [
    'Asia/Bangkok', 'Asia/Tokyo', 'Asia/Seoul', 'Asia/Singapore', 'Asia/Hong_Kong', 
    'Asia/Shanghai', 'Asia/Taipei', 'Asia/Manila', 'Asia/Jakarta', 'Asia/Kuala_Lumpur',
    'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'America/New_York', 'America/Los_Angeles', 'Australia/Sydney', 'UTC'
  ];
  
  appEl.innerHTML = `
    <div class="page-enter max-w-[640px] mx-auto space-y-6">
      <h1 class="text-2xl font-bold" style="font-family: var(--font-display);">⚙️ ${t('settings')}</h1>
      <div class="card p-6 space-y-4">
        <div class="input-group"><label class="input-label">✨ ${t('tripName')}</label><input id="s-name" class="input" value="${escapeHtml(currentTrip.name)}"></div>
        <div class="grid grid-cols-2 gap-3">
          <div class="input-group">
            <label class="input-label">💱 ${t('baseCurrency')}</label>
            <select id="s-currency" class="input">
              ${currencies.map(c => `<option value="${c.code}" ${currentTrip.baseCurrency===c.code?'selected':''}>${c.code} - ${c.name}</option>`).join('')}
            </select>
          </div>
          <div class="input-group">
            <label class="input-label">🌐 ${t('timezone')}</label>
            <select id="s-tz" class="input">
              ${timezones.map(tz => `<option value="${tz}" ${currentTrip.timezone===tz?'selected':''}>${tz}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div class="input-group"><label class="input-label">💱 เรทแลกเปลี่ยนเป็น THB</label><input id="s-thb-rate" class="input" type="number" step="0.0001" value="${currentTrip.exchangeRateToTHB || 1}"><p class="input-hint">เช่น 1 ${currentTrip.baseCurrency} = ? THB</p></div>
          <div class="input-group"><label class="input-label">💰 งบประมาณรวม</label><input id="s-budget-total" class="input" type="number" step="0.01" value="${currentTrip.budgetTotal ? (currentTrip.budgetTotal/100) : ''}" placeholder="เช่น 50000"><p class="input-hint">บาท (THB)</p></div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div class="input-group"><label class="input-label">👤 งบต่อคน (ประมาณ)</label><input id="s-budget-per-person" class="input" type="number" step="0.01" value="${currentTrip.budgetPerPerson ? (currentTrip.budgetPerPerson/100) : ''}" placeholder="เช่น 10000"></div>
          <div class="input-group"><label class="input-label">📊 ประเภทงบ</label><select id="s-budget-type" class="input"><option value="total" ${currentTrip.budgetType==='total'?'selected':''}>รวม</option><option value="per_person" ${currentTrip.budgetType==='per_person'?'selected':''}>ต่อคน</option></select></div>
        </div>
        <div id="budget-compare" class="p-3 rounded-xl bg-[var(--bg-secondary)] text-sm border" style="border-color: var(--border);"><div class="skeleton h-4"></div></div>
        <button id="save-settings" class="btn btn-primary w-full">💾 ${t('save')}</button>
      </div>
      
      <div class="card p-6 space-y-4">
        <h3 class="font-bold">🎨 ${t('theme')} + โหมด</h3>
        <div class="theme-grid">
          ${themes.map(th => `<button class="theme-option ${currentColor===th.id ? 'active' : ''}" data-theme="${th.id}" style="background: linear-gradient(135deg, ${th.colors[0]}, ${th.colors[1]});"><span style="position:absolute; bottom:6px; left:50%; transform:translateX(-50%); background:rgba(255,255,255,0.9); padding:2px 8px; border-radius:20px; font-size:10px; font-weight:700; white-space:nowrap;">${th.icon} ${th.name}</span></button>`).join('')}
        </div>
        <div class="flex gap-2">
          <button id="toggle-dark" class="btn btn-secondary flex-1 btn-sm">${document.documentElement.getAttribute('data-theme')==='dark' ? '☀️ Light' : '🌙 Dark'}</button>
          <button id="lang-switch" class="btn btn-secondary flex-1 btn-sm">🌐 ${lang==='th' ? 'English' : 'ไทย'}</button>
        </div>
      </div>
      
      <div class="card p-6">
        <h3 class="font-bold mb-2">⚠️ Danger Zone</h3>
        <p class="text-xs text-[var(--text-secondary)] mb-3">${lang==='th' ? 'เปลี่ยนสถานะต้องยืนยัน' : 'Changing status requires confirmation'}</p>
        <select id="trip-status" class="input mb-3"><option value="draft">Draft</option><option value="active" ${currentTrip.status==='active'?'selected':''}>Active</option><option value="completed">Completed</option><option value="archived">Archived</option></select>
        <button id="change-status" class="btn btn-danger w-full">Change Status</button>
      </div>
    </div>
  `;
  
  async function updateBudgetCompare() {
    try {
      const { expenses } = await fetchSettlementData(tripId);
      const totalMinor = expenses.reduce((s, e) => s + (e.netTotalMinor || 0), 0);
      const budgetTotal = parseFloat(document.getElementById('s-budget-total').value) || 0;
      const budgetPerPerson = parseFloat(document.getElementById('s-budget-per-person').value) || 0;
      const memCount = 5; // estimate, will fetch real later
      let html = `💰 ใช้ไป: ${formatCurrency(totalMinor, currentTrip.baseCurrency || 'THB')}`;
      if (budgetTotal) {
        const diff = budgetTotal*100 - totalMinor;
        html += `<br>📊 งบรวม ${budgetTotal} THB • ${diff>=0 ? `เหลือ ${formatCurrency(diff, 'THB')}` : `เกิน ${formatCurrency(-diff, 'THB')}`}`;
      }
      if (budgetPerPerson) {
        html += `<br>👤 งบต่อคน ${budgetPerPerson} THB`;
      }
      document.getElementById('budget-compare').innerHTML = html;
    } catch {
      document.getElementById('budget-compare').innerHTML = 'โหลดข้อมูลค่าใช้จ่ายไม่สำเร็จ';
    }
  }
  updateBudgetCompare();
  document.getElementById('s-budget-total').addEventListener('input', updateBudgetCompare);
  document.getElementById('s-budget-per-person').addEventListener('input', updateBudgetCompare);
  
  document.getElementById('save-settings').addEventListener('click', async () => {
    const btn = document.getElementById('save-settings');
    btn.disabled = true;
    const tLoad = toast.loading('Saving...');
    try {
      const { updateTrip } = await import('./trips/index.js');
      await updateTrip(tripId, { 
        name: document.getElementById('s-name').value, 
        baseCurrency: document.getElementById('s-currency').value, 
        timezone: document.getElementById('s-tz').value,
        exchangeRateToTHB: parseFloat(document.getElementById('s-thb-rate').value) || 1,
        budgetTotal: Math.round((parseFloat(document.getElementById('s-budget-total').value)||0)*100),
        budgetPerPerson: Math.round((parseFloat(document.getElementById('s-budget-per-person').value)||0)*100),
        budgetType: document.getElementById('s-budget-type').value
      });
      tLoad.close(); toast.success('✅ บันทึกแล้ว');
      await loadTrip(tripId);
    } catch (e) { tLoad.close(); toast.error(e.message); } finally { btn.disabled = false; }
  });
  document.querySelectorAll('.theme-option').forEach(btn => {
    btn.addEventListener('click', () => {
      applyTheme(btn.dataset.theme);
      document.querySelectorAll('.theme-option').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      toast.success(`${btn.dataset.theme}`);
      renderDesktopNav();
    });
  });
  document.getElementById('toggle-dark').addEventListener('click', () => {
    toggleDark();
    document.getElementById('toggle-dark').textContent = document.documentElement.getAttribute('data-theme')==='dark' ? '☀️ Light' : '🌙 Dark';
  });
  document.getElementById('lang-switch').addEventListener('click', () => {
    const newLang = lang==='th'?'en':'th';
    setLang(newLang);
    toast.success(newLang==='th'?'ไทย':'English');
    renderSettings(params);
    renderDesktopNav();
  });
  document.getElementById('change-status').addEventListener('click', async () => {
    const status = document.getElementById('trip-status').value;
    const btn = document.getElementById('change-status');
    btn.disabled = true;
    const tLoad = toast.loading('Changing status...');
    try {
      const { updateTrip } = await import('./trips/index.js');
      await updateTrip(tripId, { status });
      tLoad.close();
      toast.success(`Status: ${status}`);
    } catch (e) { tLoad.close(); toast.error(e.message); } finally { btn.disabled = false; }
  });
}

function renderMore(params) {
  const tripId = params.tripId;
  const lang = getLang();
  appEl.innerHTML = `
    <div class="page-enter max-w-[640px] mx-auto space-y-4">
      <h1 class="text-2xl font-bold mb-6" style="font-family: var(--font-display);">✨ ${t('more')}</h1>
      <div class="grid gap-3">
        <a href="#/trips" class="card p-4 flex items-center justify-between" style="text-decoration:none; color:inherit;"><span>🏠 หน้าหลัก • Trips</span><i data-lucide="chevron-right" class="w-4 h-4"></i></a>
        <a href="#/trip/${tripId}/dashboard" class="card p-4 flex items-center justify-between" style="text-decoration:none; color:inherit;"><span>🏠 ${t('dashboard')}</span><i data-lucide="chevron-right" class="w-4 h-4"></i></a>
        <a href="#/trip/${tripId}/members" class="card p-4 flex items-center justify-between" style="text-decoration:none; color:inherit;"><span>👥 ${t('members')}</span><i data-lucide="chevron-right" class="w-4 h-4"></i></a>
        <a href="#/trip/${tripId}/documents" class="card p-4 flex items-center justify-between" style="text-decoration:none; color:inherit;"><span>📁 เอกสาร</span><i data-lucide="chevron-right" class="w-4 h-4"></i></a>
        <a href="#/trip/${tripId}/import" class="card p-4 flex items-center justify-between" style="text-decoration:none; color:inherit;"><span>📦 ${t('importExport')}</span><i data-lucide="chevron-right" class="w-4 h-4"></i></a>
        <a href="#/trip/${tripId}/settings" class="card p-4 flex items-center justify-between" style="text-decoration:none; color:inherit;"><span>⚙️ ${t('settings')}</span><i data-lucide="chevron-right" class="w-4 h-4"></i></a>
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
