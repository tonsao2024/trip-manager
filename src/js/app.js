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

// --- Icon helpers (Lucide) — replaces all text emoji with real icons ---
const icon = (name, cls = 'w-4 h-4') => `<i data-lucide="${name}" class="${cls}"></i>`;
const spinner = (cls = 'w-4 h-4') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" style="animation: spinFast .9s linear infinite;"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>`;

function hasLucideIcon(name) {
  if (!window.lucide || !window.lucide.icons) return true;
  const pascal = name.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('');
  return !!window.lucide.icons[pascal];
}

// Icon name aliases — lucide renamed some icons between versions; fall back gracefully
const ICON_ALIASES = {
  'loader-2': 'loader-circle',
  'pie-chart': 'chart-pie',
  'bar-chart-3': 'chart-column-increasing',
  'bar-chart-2': 'chart-column',
  'circle-check': 'check-circle',
  'check-circle': 'circle-check',
  'earth': 'globe',
  'replace': 'refresh-cw',
  'scan-search': 'search',
  'lock-keyhole': 'lock',
  'user-round': 'user',
  'train-front': 'train',
  'sliders-horizontal': 'sliders',
  'list-checks': 'list',
  'party-popper': 'gift',
  'concierge-bell': 'bell',
  'receipt-text': 'receipt',
  'folder-plus': 'folder',
  'user-plus': 'user',
  'file-json': 'file-code',
  'image-down': 'download',
  'cloud-off': 'cloud',
  'scroll-text': 'file-text',
  'braces': 'code',
  'languages': 'globe',
  'hand-coins': 'coins'
};

function renderIcons() {
  if (!window.lucide) return;
  try { lucide.createIcons(); } catch (e) { console.warn('createIcons', e); }
  const leftovers = Array.from(document.querySelectorAll('i[data-lucide]'));
  if (!leftovers.length) return;
  // Second pass: try aliases for names missing in this lucide version
  let retried = false;
  leftovers.forEach(el => {
    const name = el.getAttribute('data-lucide') || '';
    if (hasLucideIcon(name)) return;
    const alt = ICON_ALIASES[name];
    if (alt && hasLucideIcon(alt)) { el.setAttribute('data-lucide', alt); retried = true; }
  });
  if (retried) { try { lucide.createIcons(); } catch {} }
  // Remove anything still unresolved so layout never shows empty gaps
  document.querySelectorAll('i[data-lucide]').forEach(el => {
    const name = el.getAttribute('data-lucide') || '';
    if (!hasLucideIcon(name)) el.remove();
  });
}
let iconsQueued = false;
function queueIcons() {
  if (iconsQueued) return;
  iconsQueued = true;
  requestAnimationFrame(() => { iconsQueued = false; renderIcons(); });
}
// Auto-render icons for ALL dynamic content (lists, sheets, async renders)
try {
  new MutationObserver(() => {
    if (document.querySelector('i[data-lucide]')) queueIcons();
  }).observe(document.body, { childList: true, subtree: true });
} catch (e) { console.warn('icon observer failed', e); }

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

// --- Themes v3 — pastel collection + gradient collection ---
const themes = [
  // Pastel (muted, cohesive)
  { id: 'sage', name: 'Sage', type: 'pastel', icon: 'leaf', colors: ['#8bb89a', '#a8c5b5'], desc: 'เขียวพาสเทล' },
  { id: 'fuji', name: 'Fuji Mist', type: 'pastel', icon: 'mountain-snow', colors: ['#8aa89a', '#b5c5b5'], desc: 'ฟูจิหมอก' },
  { id: 'sakura', name: 'Sakura Dust', type: 'pastel', icon: 'flower', colors: ['#b89aa0', '#c5a8a0'], desc: 'ซากุระฝุ่น' },
  { id: 'ocean', name: 'Ocean Mist', type: 'pastel', icon: 'waves', colors: ['#8aa8b5', '#a0b5c5'], desc: 'มหาสมุทร' },
  { id: 'sunset', name: 'Sand', type: 'pastel', icon: 'sun', colors: ['#b5a08a', '#c5b5a0'], desc: 'ทราย' },
  { id: 'lavender', name: 'Fog', type: 'pastel', icon: 'cloud-fog', colors: ['#9a9ab5', '#b5b5c5'], desc: 'หมอกม่วง' },
  { id: 'forest', name: 'Forest', type: 'pastel', icon: 'trees', colors: ['#6b8f79', '#8bb89a'], desc: 'ป่าเข้ม' },
  { id: 'dusk', name: 'Dusk', type: 'pastel', icon: 'sunset', colors: ['#8a7a9a', '#b5a0c5'], desc: 'ยามเย็น' },
  { id: 'clay', name: 'Clay', type: 'pastel', icon: 'layers', colors: ['#b58a7a', '#d4b5a0'], desc: 'ดินเผา' },
  // Gradient (modern & vivid)
  { id: 'aurora', name: 'Aurora', type: 'gradient', icon: 'sparkles', colors: ['#14b8a6', '#8b5cf6'], desc: 'แสงเหนือ' },
  { id: 'sunburst', name: 'Sunburst', type: 'gradient', icon: 'sunrise', colors: ['#f97316', '#ec4899'], desc: 'พระอาทิตย์ขึ้น' },
  { id: 'lagoon', name: 'Lagoon', type: 'gradient', icon: 'droplets', colors: ['#06b6d4', '#3b82f6'], desc: 'ทะเลสาบ' },
  { id: 'berry', name: 'Berry', type: 'gradient', icon: 'heart', colors: ['#ec4899', '#a855f7'], desc: 'เบอร์รี่' },
  { id: 'matcha', name: 'Matcha', type: 'gradient', icon: 'sprout', colors: ['#84cc16', '#22c55e'], desc: 'มัทฉะ' },
  { id: 'midnight', name: 'Midnight', type: 'gradient', icon: 'moon', colors: ['#6366f1', '#1e3a8a'], desc: 'เที่ยงคืน' },
  { id: 'peach', name: 'Peach', type: 'gradient', icon: 'flame', colors: ['#fbbf24', '#fb7185'], desc: 'พีช' },
  { id: 'grape', name: 'Grape', type: 'gradient', icon: 'gem', colors: ['#8b5cf6', '#d946ef'], desc: 'องุ่น' },
];

const MODE_ICONS = { light: 'sun', dark: 'moon', auto: 'monitor' };
const MODE_LABELS = { light: 'สว่าง', dark: 'มืด', auto: 'อัตโนมัติ' };

function getStoredMode() {
  const m = localStorage.getItem('fuji_theme');
  return (m === 'light' || m === 'dark' || m === 'auto') ? m : 'auto';
}
function resolveMode(mode) {
  if (mode === 'dark') return 'dark';
  if (mode === 'light') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
function effectiveTheme() {
  return document.documentElement.getAttribute('data-theme') || 'light';
}
function updateMetaThemeColor() {
  const meta = document.getElementById('meta-theme-color');
  if (!meta) return;
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--primary-raw').trim();
  meta.setAttribute('content', raw || '#8bb89a');
}
function updateModeIcons() {
  const mode = getStoredMode();
  const eff = effectiveTheme();
  const btn = document.getElementById('header-mode-btn');
  if (btn) {
    btn.innerHTML = icon(mode === 'auto' ? 'monitor' : MODE_ICONS[eff], 'w-[17px] h-[17px]');
    btn.title = `โหมด: ${MODE_LABELS[mode]}`;
  }
  document.querySelectorAll('[data-mode-current]').forEach(el => {
    el.innerHTML = eff === 'dark' ? `${icon('moon', 'w-4 h-4')} มืด` : `${icon('sun', 'w-4 h-4')} สว่าง`;
  });
  document.querySelectorAll('.mode-option').forEach(el => {
    el.classList.toggle('active', el.dataset.mode === mode);
  });
}
function applyMode(mode, { silent = false } = {}) {
  localStorage.setItem('fuji_theme', mode);
  document.documentElement.setAttribute('data-theme', resolveMode(mode));
  updateModeIcons();
  updateMetaThemeColor();
  if (!silent) {
    const eff = effectiveTheme();
    toast.success(mode === 'auto'
      ? `โหมดอัตโนมัติ (${eff === 'dark' ? 'มืด' : 'สว่าง'} ตามระบบ)`
      : (eff === 'dark' ? 'ธีมกลางคืน' : 'ธีมสว่าง'));
  }
  // Redraw map tiles if a map is currently open
  document.dispatchEvent(new CustomEvent('themechange', { detail: { mode, eff } }));
}
// Follow system changes while in auto mode
try {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (getStoredMode() === 'auto') applyMode('auto', { silent: true });
  });
} catch {}

function applyTheme(colorId) {
  document.documentElement.setAttribute('data-color', colorId);
  localStorage.setItem('fuji_color_theme', colorId);
  updateMetaThemeColor();
}

function initTheme() {
  const savedColor = localStorage.getItem('fuji_color_theme') || 'sage';
  document.documentElement.setAttribute('data-color', themes.some(t => t.id === savedColor) ? savedColor : 'sage');
  document.documentElement.setAttribute('data-theme', resolveMode(getStoredMode()));
  updateMetaThemeColor();
  // Defer icon updates until DOM/lucide ready
  setTimeout(() => { updateModeIcons(); renderIcons(); }, 120);
}

// Cycle light → dark → auto
function cycleMode() {
  const order = ['light', 'dark', 'auto'];
  const next = order[(order.indexOf(getStoredMode()) + 1) % order.length];
  applyMode(next);
}

// Kept for compatibility with older callers (sheet buttons etc.)
function toggleDark() {
  const eff = effectiveTheme();
  applyMode(eff === 'dark' ? 'light' : 'dark');
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
    { label: getLang() === 'th' ? 'ทริปทั้งหมด' : 'All Trips', path: '#/trips', icon: 'compass', exact: true },
    { label: t('dashboard'), path: `${base}/dashboard`, icon: 'layout-dashboard' },
    { label: t('itinerary'), path: `${base}/itinerary`, icon: 'map-pinned' },
    { label: t('expenses'), path: `${base}/expenses`, icon: 'wallet' },
    { label: t('settlement'), path: `${base}/settlement`, icon: 'hand-coins' },
    { label: t('members'), path: `${base}/members`, icon: 'users' },
    { label: getLang() === 'th' ? 'เอกสาร' : 'Documents', path: `${base}/documents`, icon: 'folder' },
    { label: t('settings'), path: `${base}/settings`, icon: 'settings' },
  ];
  desktopNavEl.innerHTML = items.map(i => {
    const active = currentHash.startsWith(i.path) ? 'chip-active active' : '';
    return `<a href="${i.path}" class="chip menu-item ${active}" data-nav="${i.path}" style="text-decoration:none;">${icon(i.icon, 'w-4 h-4')}${i.label}</a>`;
  }).join('');
  queueIcons();
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

// --- Header Controls - language, light/dark/auto mode, theme picker ---
function addHeaderControls() {
  const header = document.getElementById('app-header');
  if (!header) return;
  if (document.getElementById('header-controls')) return;

  const rightGroup = header.querySelector('.flex.items-center.gap-3') || header.querySelector('#refresh-btn')?.parentElement;
  if (!rightGroup) return;

  const controlsDiv = document.createElement('div');
  controlsDiv.id = 'header-controls';
  controlsDiv.className = 'flex items-center gap-1';
  controlsDiv.innerHTML = `
    <button id="header-lang-btn" class="btn btn-ghost w-9 h-9 text-xs font-extrabold" style="min-height:36px;padding:0;" title="${t('language')}">${getLang() === 'th' ? 'EN' : 'TH'}</button>
    <button id="header-mode-btn" class="btn btn-ghost btn-icon w-9 h-9" title="Light / Dark / Auto">${icon('sun', 'w-[17px] h-[17px]')}</button>
    <button id="header-theme-btn" class="btn btn-ghost btn-icon w-9 h-9" title="${t('theme')}">${icon('palette', 'w-[17px] h-[17px]')}</button>
  `;

  rightGroup.insertBefore(controlsDiv, rightGroup.querySelector('#refresh-btn') || rightGroup.firstChild);

  document.getElementById('header-lang-btn').onclick = () => {
    const newLang = getLang() === 'th' ? 'en' : 'th';
    setLang(newLang);
    document.getElementById('header-lang-btn').textContent = newLang === 'th' ? 'EN' : 'TH';
    renderDesktopNav();
    updateBottomNav();
    if (headerSubtitle && currentTrip) headerSubtitle.textContent = currentTrip.name;
    toast.success(newLang === 'th' ? 'ภาษาไทย' : 'English');
    setTimeout(() => router.handle(), 50);
  };

  document.getElementById('header-mode-btn').onclick = cycleMode;
  document.getElementById('header-theme-btn').onclick = showThemePicker;

  updateModeIcons();
  queueIcons();
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
  input.style.paddingRight = '48px';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'pass-toggle';
  btn.setAttribute('aria-label', 'Show/Hide');
  btn.innerHTML = icon('eye', 'w-[17px] h-[17px]');
  btn.onclick = () => {
    const isPass = input.type === 'password';
    input.type = isPass ? 'text' : 'password';
    btn.innerHTML = icon(isPass ? 'eye-off' : 'eye', 'w-[17px] h-[17px]');
    queueIcons();
  };
  wrapper.appendChild(btn);
  queueIcons();
}

// --- Auth ---
let authReady = false;
let pendingAuthRoute = null;

async function doLogout() {
  // Centralized logout: always clears state and returns to the login screen,
  // even if Firebase signOut() has a network hiccup.
  const tLoad = toast.loading(getLang() === 'th' ? 'กำลังออกจากระบบ...' : 'Signing out...');
  try {
    await logout();
  } catch (e) {
    console.warn('signOut issue (forced local logout):', e);
  }
  currentUser = null;
  currentTrip = null;
  currentTripId = null;
  tLoad.close();
  toast.success(getLang() === 'th' ? 'ออกจากระบบแล้ว' : 'Signed out');
  if (location.hash !== '#/login') location.hash = '#/login';
  setTimeout(() => router.handle(), 60);
}

function openUserSheet(user) {
  const initial = (user.displayName || user.email || '?')[0].toUpperCase();
  const sheet = showBottomSheet(`
    <div class="space-y-4">
      <div class="flex items-center gap-3">
        <div class="avatar w-12 h-12 text-sm" style="background: var(--gradient-primary); width:48px;height:48px;">${user.photoURL ? `<img src="${escapeHtml(user.photoURL)}" class="w-full h-full rounded-full object-cover" alt="">` : escapeHtml(initial)}</div>
        <div class="flex-1 min-w-0">
          <h3 class="font-bold truncate">${escapeHtml(user.displayName || user.email || 'User')}</h3>
          <p class="text-xs text-[var(--text-secondary)] truncate">${escapeHtml(user.email || user.uid.slice(0,8))}</p>
        </div>
      </div>
      <div class="card p-3 space-y-3">
        <div class="input-group"><label class="input-label text-xs">${icon('user', 'w-3.5 h-3.5')} Display Name</label><input id="edit-display-name" class="input text-sm" value="${escapeHtml(user.displayName || '')}" placeholder="ชื่อที่แสดง"></div>
        <div class="input-group"><label class="input-label text-xs">${icon('image', 'w-3.5 h-3.5')} Photo URL</label><input id="edit-photo-url" class="input text-sm" value="${escapeHtml(user.photoURL || '')}" placeholder="https://..."></div>
        <button id="save-profile" class="btn btn-primary btn-sm w-full">${icon('save', 'w-4 h-4')} บันทึกโปรไฟล์</button>
      </div>
      <div class="grid grid-cols-2 gap-2">
        <button id="lang-toggle" class="btn btn-secondary btn-sm">${icon('languages', 'w-4 h-4')} ${getLang() === 'th' ? 'English' : 'ไทย'}</button>
        <button id="theme-picker-btn" class="btn btn-secondary btn-sm">${icon('palette', 'w-4 h-4')} ${t('theme')}</button>
      </div>
      <div class="grid grid-cols-2 gap-2">
        <button id="toggle-dark-sheet" class="btn btn-secondary btn-sm" data-mode-current></button>
        <button id="user-settings" class="btn btn-secondary btn-sm">${icon('settings', 'w-4 h-4')} ${t('settings')}</button>
      </div>
      <button id="logout-btn" class="btn w-full" style="background: var(--danger-bg); color: var(--danger); border: 1.5px solid color-mix(in srgb, var(--danger) 35%, transparent);">${icon('log-out', 'w-4 h-4')} ${t('logout')}</button>
      <button id="forget-device" class="btn btn-ghost w-full text-xs">${icon('eraser', 'w-3.5 h-3.5')} ล้างแคชอุปกรณ์นี้</button>
    </div>
  `, {});
  updateModeIcons();
  queueIcons();

  document.getElementById('logout-btn')?.addEventListener('click', async () => {
    const btn = document.getElementById('logout-btn');
    if (btn) { btn.disabled = true; }
    sheet.close();               // close the sheet FIRST so the UI is never stuck behind it
    await doLogout();
  });
  document.getElementById('forget-device')?.addEventListener('click', () => { localStorage.clear(); location.hash = '#/login'; location.reload(); });
  document.getElementById('lang-toggle')?.addEventListener('click', () => {
    const newLang = getLang() === 'th' ? 'en' : 'th';
    setLang(newLang);
    toast.success(newLang === 'th' ? 'ภาษาไทย' : 'English');
    sheet.close();
    setTimeout(() => router.handle(), 100);
  });
  document.getElementById('theme-picker-btn')?.addEventListener('click', () => {
    sheet.close();
    setTimeout(() => showThemePicker(), 220);
  });
  document.getElementById('toggle-dark-sheet')?.addEventListener('click', () => {
    toggleDark();
  });
  document.getElementById('user-settings')?.addEventListener('click', () => {
    sheet.close();
    if (currentTripId) location.hash = `#/trip/${currentTripId}/settings`;
    else location.hash = '#/trips';
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
      toast.success('บันทึกโปรไฟล์แล้ว');
      sheet.close();
      setTimeout(() => location.reload(), 400);
    } catch (e) {
      tLoad.close();
      toast.error(e.message);
      btn.disabled = false;
    }
  });
}

if (!isFirebaseConfigured) {
  setTimeout(() => renderConfigNeeded(), 50);
} else if (auth) {
  onAuthStateChanged(auth, user => {
    if (!isFirebaseConfigured) { renderConfigNeeded(); return; }
    const wasReady = authReady;
    authReady = true;
    currentUser = user;
    if (user) {
      const initial = (user.displayName || user.email || '?')[0].toUpperCase();
      userAvatarBtn.textContent = initial;
      if (user.photoURL) {
        userAvatarBtn.innerHTML = `<img src="${escapeHtml(user.photoURL)}" class="w-full h-full rounded-full object-cover" alt="">`;
      }
      updateUserDisplay(user);
      userAvatarBtn.onclick = () => openUserSheet(user);
      // Route handling: preserve deep links, only bounce to /trips from login screen
      if (pendingAuthRoute) {
        const target = pendingAuthRoute;
        pendingAuthRoute = null;
        if (location.hash !== target) location.hash = target;
        router.handle();
      } else if (!wasReady) {
        // First auth resolution on page load
        if (!location.hash || location.hash === '#' || location.hash.includes('login')) location.hash = '#/trips';
        else router.handle();
      } else if (location.hash.includes('login')) {
        location.hash = '#/trips';
      }
    } else {
      currentTrip = null;
      currentTripId = null;
      pendingAuthRoute = null;
      userAvatarBtn.textContent = '?';
      updateUserDisplay(null);
      userAvatarBtn.onclick = () => { location.hash = '#/login'; };
      renderDesktopNav();
      if (!location.hash.includes('login') && !location.hash.includes('config')) location.hash = '#/login';
      else router.handle();
    }
    queueIcons();
  });
} else {
  authReady = true;
}

function themeSwatchHtml(th, current) {
  return `
    <button class="theme-option ${current === th.id ? 'active' : ''}" data-theme="${th.id}"
      style="background: linear-gradient(135deg, ${th.colors[0]}, ${th.colors[1]});" title="${th.name} — ${th.desc || ''}">
      <span class="theme-swatch-icon">${icon(th.icon, 'w-4 h-4')}</span>
      <span class="theme-name">${th.name}</span>
    </button>`;
}

function showThemePicker() {
  const current = localStorage.getItem('fuji_color_theme') || 'sage';
  const mode = getStoredMode();
  const pastels = themes.filter(th => th.type !== 'gradient');
  const gradients = themes.filter(th => th.type === 'gradient');
  const sheet = showBottomSheet(`
    <div class="flex items-center gap-3 mb-1">
      <div class="row-icon" style="width:40px;height:40px;border-radius:14px;background:var(--gradient-primary);color:#fff;">${icon('palette', 'w-5 h-5')}</div>
      <div>
        <h3 class="font-bold text-lg leading-tight" style="font-family: var(--font-display);">${t('theme')}</h3>
        <p class="text-xs text-[var(--text-secondary)]">พาสเทล + gradient • สว่าง/มืด/อัตโนมัติ</p>
      </div>
    </div>

    <div class="theme-section-title">${icon('leaf', 'w-3.5 h-3.5')} Pastel</div>
    <div class="theme-grid">${pastels.map(th => themeSwatchHtml(th, current)).join('')}</div>

    <div class="theme-section-title">${icon('sparkles', 'w-3.5 h-3.5')} Gradient</div>
    <div class="theme-grid">${gradients.map(th => themeSwatchHtml(th, current)).join('')}</div>

    <div class="theme-section-title">${icon('contrast', 'w-3.5 h-3.5')} ${getLang() === 'th' ? 'โหมดการแสดงผล' : 'Appearance'}</div>
    <div class="mode-grid">
      <button class="mode-option ${mode === 'light' ? 'active' : ''}" data-mode="light">${icon('sun', 'w-5 h-5')} ${getLang() === 'th' ? 'สว่าง' : 'Light'}</button>
      <button class="mode-option ${mode === 'dark' ? 'active' : ''}" data-mode="dark">${icon('moon', 'w-5 h-5')} ${getLang() === 'th' ? 'มืด' : 'Dark'}</button>
      <button class="mode-option ${mode === 'auto' ? 'active' : ''}" data-mode="auto">${icon('monitor', 'w-5 h-5')} Auto</button>
    </div>

    <button class="btn btn-primary w-full mt-5" id="theme-done">${icon('check', 'w-4 h-4')} ${getLang() === 'th' ? 'เสร็จสิ้น' : 'Done'}</button>
  `);
  updateModeIcons();
  queueIcons();

  sheet.sheet.querySelectorAll('.theme-option').forEach(btn => {
    btn.addEventListener('click', () => {
      applyTheme(btn.dataset.theme);
      sheet.sheet.querySelectorAll('.theme-option').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const th = themes.find(x => x.id === btn.dataset.theme);
      toast.success(th ? `${th.name} • ${th.desc || ''}` : btn.dataset.theme);
      renderDesktopNav();
    });
  });
  sheet.sheet.querySelectorAll('.mode-option').forEach(btn => {
    btn.addEventListener('click', () => {
      applyMode(btn.dataset.mode, { silent: true });
      sheet.sheet.querySelectorAll('.mode-option').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const eff = effectiveTheme();
      toast.success(btn.dataset.mode === 'auto' ? `อัตโนมัติ (${eff === 'dark' ? 'มืด' : 'สว่าง'})` : (eff === 'dark' ? 'ธีมกลางคืน' : 'ธีมสว่าง'));
    });
  });
  document.getElementById('theme-done')?.addEventListener('click', () => sheet.close());
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
  // Wait for Firebase auth to resolve before guarding routes — this prevents
  // deep links (and trip switching right after load) from bouncing to /login.
  if (!authReady && matched.path !== '/login') {
    pendingAuthRoute = location.hash || matched.fullPath;
    appEl.innerHTML = `
      <div class="grid place-items-center py-24 page-enter">
        <div class="text-center">
          <div class="animate-float">${renderFujiMascot('loading', 90)}</div>
          <p class="mt-5 text-sm font-medium text-[var(--text-secondary)] animate-pulse-soft">${getLang() === 'th' ? 'กำลังตรวจสอบการเข้าสู่ระบบ...' : 'Checking your session...'}</p>
        </div>
      </div>`;
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
  if (currentUser && matched.path === '/login') {
    // Already signed in — skip the login screen
    location.hash = '#/trips';
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
        <h1 class="page-title justify-center text-2xl font-bold mb-2">${icon('database', 'w-5 h-5')} ตั้งค่า Firebase</h1>
        <p class="text-sm text-[var(--text-secondary)] mb-4 text-center">กรอก Firebase Config เพื่อเริ่มใช้งาน</p>
        <div class="space-y-5">
          <div class="input-group">
            <label class="input-label">${icon('braces', 'w-3.5 h-3.5')} Firebase Config JSON</label>
            <textarea id="cfg-input" class="input font-mono text-xs" style="min-height:160px;" placeholder='{"apiKey":"...","authDomain":"...","projectId":"..."}'>${escapeHtml(savedPretty)}</textarea>
          </div>
          <div class="flex gap-2">
            <button id="save-cfg" class="btn btn-primary flex-1 btn-lg">${icon('save', 'w-4 h-4')} บันทึก</button>
            <button id="clear-cfg" class="btn btn-ghost">${icon('eraser', 'w-4 h-4')} ล้าง</button>
          </div>
        </div>
      </div>
    </div>
  `;
  queueIcons();
  document.getElementById('clear-cfg').onclick = () => {
    localStorage.removeItem('fuji_firebase_config');
    document.getElementById('cfg-input').value = '';
    toast.warning('ล้างค่าแล้ว');
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
      toast.success('บันทึกแล้ว กำลังรีโหลด...');
      setTimeout(() => location.reload(), 600);
    } catch (e) {
      toast.error(e.message);
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
          <div class="flex justify-center gap-2 mt-4 flex-wrap">
            <button id="login-lang" class="chip text-xs">${icon('languages', 'w-3.5 h-3.5')} ${lang === 'th' ? 'ไทย — Switch to EN' : 'EN — เปลี่ยนเป็นไทย'}</button>
            <button id="login-theme" class="chip text-xs">${icon('palette', 'w-3.5 h-3.5')} ${t('theme')}</button>
            <button id="login-dark" class="chip text-xs" data-mode-current></button>
          </div>
        </div>
        <div class="card card-accent p-7">
          <div class="segmented mb-6">
            <button data-tab="member" class="segmented-item active">${icon('user', 'w-4 h-4')} ${t('member')}</button>
            <button data-tab="admin" class="segmented-item">${icon('shield-check', 'w-4 h-4')} ${t('admin')}</button>
          </div>

          <div id="tab-member">
            <form id="member-form" class="space-y-4">
              <div class="input-group"><label class="input-label">${icon('compass', 'w-3.5 h-3.5')} Trip ID</label><input id="member-trip" class="input" placeholder="${lang==='th' ? 'เว้นว่างได้ (ไม่บังคับ)' : 'Optional'}" autocomplete="off"></div>
              <div class="input-group"><label class="input-label">${icon('user', 'w-3.5 h-3.5')} ${t('username')}</label><input id="member-user" class="input" placeholder="fuji_user" required autocomplete="username"></div>
              <div class="input-group"><label class="input-label">${icon('lock-keyhole', 'w-3.5 h-3.5')} ${t('pin')}</label><input id="member-pin" class="input" type="password" inputmode="numeric" placeholder="••••" required autocomplete="current-password"></div>
              <label class="flex items-center gap-2 text-sm cursor-pointer"><input id="member-remember" type="checkbox" checked class="accent-[var(--primary)] w-4 h-4"> ${t('rememberDevice')}</label>
              <button class="btn btn-primary w-full btn-lg" type="submit">${icon('log-in', 'w-4 h-4')} ${t('loginMember')}</button>
            </form>
          </div>

          <div id="tab-admin" class="hidden">
            <form id="admin-form" class="space-y-4">
              <div class="input-group"><label class="input-label">${icon('mail', 'w-3.5 h-3.5')} ${t('email')}</label><input id="admin-email" class="input" type="email" placeholder="admin@example.com" required autocomplete="email"></div>
              <div class="input-group"><label class="input-label">${icon('key-round', 'w-3.5 h-3.5')} ${t('password')}</label><input id="admin-pass" class="input" type="password" required autocomplete="current-password"></div>
              <label class="flex items-center gap-2 text-sm cursor-pointer"><input id="admin-remember" type="checkbox" checked class="accent-[var(--primary)] w-4 h-4"> ${t('rememberDevice')}</label>
              <button class="btn btn-primary w-full btn-lg" type="submit">${icon('log-in', 'w-4 h-4')} ${t('loginAdmin')}</button>
            </form>
          </div>

          <p class="text-[11px] text-center text-[var(--text-tertiary)] mt-6 leading-relaxed flex items-center justify-center gap-1.5">${icon('shield-check', 'w-3.5 h-3.5')} ${lang==='th' ? 'การเชื่อมต่อปลอดภัย • ข้อมูลซิงก์แบบเรียลไทม์' : 'Secure connection • Realtime sync'}</p>
        </div>
      </div>
    </div>
  `;
  queueIcons();
  updateModeIcons();

  setTimeout(() => {
    addPasswordToggle('member-pin');
    addPasswordToggle('admin-pass');
  }, 10);

  document.getElementById('login-lang').onclick = () => {
    const newLang = lang === 'th' ? 'en' : 'th';
    setLang(newLang);
    renderLogin();
    toast.success(newLang === 'th' ? 'ภาษาไทย' : 'English');
  };
  document.getElementById('login-theme').onclick = showThemePicker;
  document.getElementById('login-dark').onclick = cycleMode;

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
    const btn = e.target.querySelector('button[type="submit"]');
    if (!btn) return;
    btn.disabled = true;
    const originalHtml = btn.innerHTML;
    btn.innerHTML = `${spinner('w-4 h-4')} ${lang==='th' ? 'กำลังเข้าสู่ระบบ...' : 'Logging in...'}`;
    queueIcons();
    const tLoad = toast.loading(lang==='th' ? 'กำลังเข้าสู่ระบบ...' : 'Logging in...');
    try {
      await loginAdmin(document.getElementById('admin-email').value, document.getElementById('admin-pass').value, document.getElementById('admin-remember').checked);
      tLoad.close();
      toast.success(lang==='th' ? 'เข้าสู่ระบบสำเร็จ' : 'Signed in');
      location.hash = '#/trips';
    } catch (err) {
      tLoad.close();
      toast.error(err.message || 'Login failed');
      btn.disabled = false;
      btn.innerHTML = originalHtml;
      queueIcons();
    }
  };

  appEl.querySelector('#member-form').onsubmit = async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    if (!btn) return;
    btn.disabled = true;
    const originalHtml = btn.innerHTML;
    btn.innerHTML = `${spinner('w-4 h-4')} ${lang==='th' ? 'กำลังตรวจสอบ...' : 'Checking...'}`;
    queueIcons();
    const tLoad = toast.loading(lang==='th' ? 'กำลังตรวจสอบ...' : 'Checking...');
    try {
      await loginMember(document.getElementById('member-user').value.trim(), document.getElementById('member-pin').value, document.getElementById('member-trip').value.trim() || null, document.getElementById('member-remember').checked);
      tLoad.close();
      toast.success(lang==='th' ? 'ยินดีต้อนรับ!' : 'Welcome!');
      location.hash = '#/trips';
    } catch (err) {
      tLoad.close();
      toast.error(err.message || 'Login failed');
      btn.disabled = false;
      btn.innerHTML = originalHtml;
      queueIcons();
    }
  };
  queueIcons();
}

async function renderTripSelector() {
  if (!isFirebaseConfigured) return renderConfigNeeded();
  if (!currentUser) { location.hash = '#/login'; return; }

  const lang = getLang();
  if (headerSubtitle) headerSubtitle.textContent = lang === 'th' ? 'ทริปของฉัน' : 'My trips';
  appEl.innerHTML = `
    <div class="page-enter">
      <div class="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div>
          <h1 class="page-title text-3xl font-bold tracking-tight"><span class="title-icon">${icon('compass', 'w-5 h-5')}</span> ${t('selectTrip')}</h1>
          <p class="text-sm text-[var(--text-secondary)] mt-2">${lang==='th' ? 'เลือกทริปของคุณ หรือสร้างทริปใหม่' : 'Select your trip or create a new one'}</p>
        </div>
        <button id="create-trip-btn" class="btn btn-primary">${icon('plus', 'w-4 h-4')} ${t('createTrip')}</button>
      </div>
      <div id="trip-grid" class="grid md:grid-cols-2 lg:grid-cols-3 gap-5"></div>
    </div>
  `;
  queueIcons();

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
      { color: '#b89aa0', name: 'Sakura' },
      { color: '#d4b5a0', name: 'Sand' },
      { color: '#8aa8b5', name: 'Ocean' },
      { color: '#9a9ab5', name: 'Lavender' },
      { color: '#6b8f79', name: 'Forest' },
      { color: '#14b8a6', name: 'Aurora' },
      { color: '#f97316', name: 'Sunburst' },
      { color: '#8b5cf6', name: 'Grape' },
      { color: '#ec4899', name: 'Berry' },
    ];

    const sheet = showBottomSheet(`
      <div class="space-y-3">
        <div class="flex items-center gap-3">
          <div class="row-icon" style="width:40px;height:40px;border-radius:14px;background:var(--gradient-primary);color:#fff;">${icon('compass', 'w-5 h-5')}</div>
          <div>
            <h3 class="font-bold text-base leading-tight" style="font-family: var(--font-display);">${t('createTrip')}</h3>
            <p class="text-[11px] text-[var(--text-secondary)]">${lang==='th' ? 'กรอกข้อมูลทริปใหม่ของคุณ' : 'Fill in your new trip details'}</p>
          </div>
        </div>

        <form id="create-trip-form" class="space-y-3">
          <div class="input-group"><label class="input-label">${icon('sparkles', 'w-3.5 h-3.5')} ${t('tripName')} *</label><input id="ct-name" class="input" required placeholder="Fuji Autumn 2027" autocomplete="off"></div>

          <div class="input-group">
            <label class="input-label">${icon('image', 'w-3.5 h-3.5')} ${t('coverImage')}</label>
            <div class="p-3 rounded-xl border-2 border-dashed" style="border-color: var(--border); background: var(--bg-secondary);">
              <div id="cover-dropzone" class="text-center cursor-pointer py-3 transition-colors">
                <div class="row-icon mx-auto mb-2" style="width:42px;height:42px;">${icon('camera', 'w-5 h-5')}</div>
                <p class="text-xs font-semibold">${lang==='th' ? 'คลิกหรือลากรูปมาวาง' : 'Click or drop an image'}</p>
                <p class="text-[10px] text-[var(--text-tertiary)] mt-0.5">JPG / PNG • ≤ 10MB • ${lang==='th' ? 'ครอปได้' : 'croppable'}</p>
              </div>
              <input id="ct-cover" type="file" accept="image/*" class="hidden">

              <div id="cover-cropper-container" class="hidden mt-3">
                <div class="flex gap-1.5 mb-2 flex-wrap items-center">
                  <span class="text-[11px] font-semibold">${icon('crop', 'w-3.5 h-3.5 inline')} ${lang==='th' ? 'อัตราส่วน' : 'Aspect'}:</span>
                  <button type="button" data-aspect="16/9" class="chip chip-active text-[10px] aspect-btn" style="min-height:28px;padding:4px 10px;">16:9</button>
                  <button type="button" data-aspect="4/3" class="chip text-[10px] aspect-btn" style="min-height:28px;padding:4px 10px;">4:3</button>
                  <button type="button" data-aspect="1" class="chip text-[10px] aspect-btn" style="min-height:28px;padding:4px 10px;">1:1</button>
                  <button type="button" data-aspect="free" class="chip text-[10px] aspect-btn" style="min-height:28px;padding:4px 10px;">Free</button>
                </div>
                <div id="cropper-wrapper" class="w-full rounded-xl overflow-hidden" style="min-height:180px;max-height:260px;background:#000;"></div>
                <div class="flex gap-2 mt-2">
                  <button type="button" id="crop-confirm" class="btn btn-primary btn-sm flex-1 text-xs">${icon('crop', 'w-3.5 h-3.5')} ${lang==='th' ? 'ครอป' : 'Crop'}</button>
                  <button type="button" id="crop-cancel" class="btn btn-secondary btn-sm text-xs">${t('cancel')}</button>
                </div>
              </div>

              <div id="cover-preview" class="hidden mt-3">
                <div class="flex items-center justify-between mb-1.5">
                  <span class="text-[11px] font-bold flex items-center gap-1">${icon('eye', 'w-3.5 h-3.5')} ${lang==='th' ? 'ตัวอย่าง' : 'Preview'}</span>
                  <button type="button" id="change-image" class="btn btn-ghost btn-sm text-[10px]" style="min-height:26px;padding:4px 10px;">${icon('replace', 'w-3 h-3')} ${lang==='th' ? 'เปลี่ยน' : 'Change'}</button>
                </div>
                <div class="w-full h-28 rounded-xl overflow-hidden border" style="border-color: var(--border);">
                  <img id="cover-img" class="w-full h-full object-cover" alt="">
                </div>
                <p id="cover-info" class="text-[10px] text-[var(--text-tertiary)] mt-1"></p>
              </div>
            </div>
            <div class="input-group mt-2">
              <label class="input-label text-[12px]">${icon('link', 'w-3.5 h-3.5')} ${lang==='th' ? 'หรือใส่ URL รูปภาพ' : 'Or image URL'}</label>
              <input id="ct-cover-url" class="input text-sm" style="min-height:38px;" placeholder="https://..." autocomplete="off">
            </div>
          </div>

          <div class="grid grid-cols-2 gap-2">
            <div class="input-group"><label class="input-label text-[12px]">${icon('globe', 'w-3.5 h-3.5')} ${t('country')}</label><input id="ct-country" class="input text-sm" style="min-height:38px;" placeholder="Japan" autocomplete="off"></div>
            <div class="input-group"><label class="input-label text-[12px]">${icon('building-2', 'w-3.5 h-3.5')} ${t('city')}</label><input id="ct-city" class="input text-sm" style="min-height:38px;" placeholder="Fujikawaguchiko" autocomplete="off"></div>
          </div>

          <div class="grid grid-cols-2 gap-2">
            <div class="input-group"><label class="input-label text-[12px]">${icon('calendar', 'w-3.5 h-3.5')} ${t('startDate')} *</label><input id="ct-start" class="input text-sm" style="min-height:38px;" type="date" required></div>
            <div class="input-group"><label class="input-label text-[12px]">${icon('calendar-check', 'w-3.5 h-3.5')} ${t('endDate')} *</label><input id="ct-end" class="input text-sm" style="min-height:38px;" type="date" required></div>
          </div>

          <div class="grid grid-cols-2 gap-2">
            <div class="input-group">
              <label class="input-label text-[12px]">${icon('clock', 'w-3.5 h-3.5')} ${t('timezone')}</label>
              <select id="ct-tz" class="input text-sm" style="min-height:38px;">
                <option value="Asia/Bangkok">Bangkok</option>
                <option value="Asia/Tokyo">Tokyo</option>
                <option value="Asia/Seoul">Seoul</option>
                <option value="Asia/Singapore">Singapore</option>
                <option value="Asia/Hong_Kong">Hong Kong</option>
                <option value="UTC">UTC</option>
              </select>
            </div>
            <div class="input-group">
              <label class="input-label text-[12px]">${icon('banknote', 'w-3.5 h-3.5')} ${t('baseCurrency')}</label>
              <select id="ct-cur" class="input text-sm" style="min-height:38px;">
                <option value="THB">THB</option>
                <option value="JPY">JPY</option>
                <option value="USD">USD</option>
                <option value="KRW">KRW</option>
                <option value="EUR">EUR</option>
              </select>
            </div>
          </div>

          <div class="input-group">
            <label class="input-label text-[12px]">${icon('palette', 'w-3.5 h-3.5')} ${t('themeColor')}</label>
            <div class="grid grid-cols-6 gap-1.5 p-2 rounded-xl" style="background: var(--bg-secondary); border: 1px solid var(--border);">
              ${themeColors.map(c =>
                `<button type="button" data-color="${c.color}" title="${c.name}" class="w-full aspect-square rounded-full border-2 shadow-sm hover:scale-110 transition-transform" style="background:${c.color};border-color:rgba(255,255,255,0.85);"></button>`
              ).join('')}
            </div>
            <div class="flex gap-2 mt-2 items-center">
              <input id="ct-color-custom" type="color" value="#8bb89a" class="w-9 h-9 rounded-full border-2 shadow-sm cursor-pointer flex-shrink-0" style="border-color:rgba(255,255,255,0.85);" title="Custom color">
              <input id="ct-color" type="text" value="#8bb89a" class="input flex-1 text-xs font-mono" style="min-height:36px;" placeholder="#8bb89a">
              <div id="ct-color-preview" class="w-9 h-9 rounded-full border-2 shadow-sm flex-shrink-0" style="background:#8bb89a;border-color:rgba(255,255,255,0.85);"></div>
            </div>
          </div>

          <button id="ct-submit" type="submit" class="btn btn-primary w-full">${icon('plus', 'w-4 h-4')} ${t('createTrip')}</button>
        </form>
      </div>
    `);
    queueIcons();

    let selectedColor = '#8bb89a';
    const colorInput = document.getElementById('ct-color');
    const colorCustom = document.getElementById('ct-color-custom');
    const colorPreview = document.getElementById('ct-color-preview');

    function updateColor(newColor) {
      selectedColor = newColor;
      colorInput.value = newColor;
      colorCustom.value = newColor;
      colorPreview.style.background = newColor;
      document.querySelectorAll('#create-trip-form [data-color]').forEach(b => {
        b.style.borderColor = 'rgba(255,255,255,0.85)';
        b.style.transform = '';
        if (b.dataset.color.toLowerCase() === newColor.toLowerCase()) {
          b.style.borderColor = 'var(--text)';
          b.style.transform = 'scale(1.15)';
        }
      });
    }

    document.querySelectorAll('#create-trip-form [data-color]').forEach(btn => {
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
        coverInfo.textContent = `URL: ${url.slice(0, 50)}...`;
      }
    });

    async function handleFile(file) {
      if (!file) return;
      if (!file.type.startsWith('image/')) {
        toast.error(lang==='th' ? 'เลือกไฟล์ภาพเท่านั้น' : 'Images only');
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        toast.error(lang==='th' ? 'ไฟล์ใหญ่เกิน 10MB' : 'File exceeds 10MB');
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
        toast.success(lang==='th' ? 'ลากกรอบเพื่อเลือกส่วนที่ต้องการ' : 'Drag to crop the area you want');
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
      dropzone.parentElement.style.borderColor = 'var(--primary)';
      dropzone.parentElement.style.background = 'var(--primary-light)';
    });
    dropzone.addEventListener('dragleave', () => {
      dropzone.parentElement.style.borderColor = '';
      dropzone.parentElement.style.background = '';
    });
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.parentElement.style.borderColor = '';
      dropzone.parentElement.style.background = '';
      const file = e.dataTransfer.files[0];
      handleFile(file);
    });

    document.querySelectorAll('.aspect-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        document.querySelectorAll('.aspect-btn').forEach(b => b.classList.remove('chip-active'));
        btn.classList.add('chip-active');
        const aspect = btn.dataset.aspect;
        if (aspect === 'free') currentAspect = null;
        else {
          const [w, h] = aspect.split('/').map(Number);
          currentAspect = w && h ? w / h : null;
        }
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
      try {
        croppedBlob = await cropperInstance.getCroppedBlob('image/webp', 0.85);
        const previewUrl = cropperInstance.getPreviewDataUrl(600);
        previewImg.src = previewUrl;
        previewContainer.classList.remove('hidden');
        cropperContainer.classList.add('hidden');
        coverInfo.textContent = `${lang==='th' ? 'ครอปแล้ว' : 'Cropped'} • ${(croppedBlob.size/1024).toFixed(0)} KB`;
        toast.success(lang==='th' ? 'ครอปเรียบร้อย' : 'Cropped');
      } catch (err) {
        toast.error((lang==='th' ? 'ครอปไม่สำเร็จ: ' : 'Crop failed: ') + err.message);
      } finally {
        btn.disabled = false;
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
      const originalHtml = submitBtn.innerHTML;
      submitBtn.innerHTML = `${spinner('w-4 h-4')} ${lang==='th' ? 'กำลังสร้างทริป...' : 'Creating trip...'}`;
      queueIcons();

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
        toast.success(lang==='th' ? 'สร้างทริปเรียบร้อย' : 'Trip created');
        sheet.close();
        if (cropperInstance) cropperInstance.destroy();
        setTimeout(() => { location.hash = `#/trip/${id}/dashboard`; }, 120);
      } catch (err) {
        tLoad.close();
        console.error('Create trip failed', err);
        toast.error(err.message, undefined, () => submitBtn.click());
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalHtml;
        queueIcons();
      }
    });
  }

  const grid = document.getElementById('trip-grid');
  grid.innerHTML = `<div class="card p-6 animate-pulse-soft"><div class="skeleton h-24 mb-4"></div><div class="skeleton h-4 mb-2"></div><div class="skeleton h-3"></div></div>`.repeat(3);

  const tripCardHtml = (trip, idx, compact = false) => {
    const baseColor = trip.themeColor || '#8bb89a';
    return `
      <div class="card card-hover p-0 overflow-hidden cursor-pointer group" data-trip="${trip.id}" style="animation-delay: ${idx * 0.06}s" role="button" tabindex="0" aria-label="${escapeHtml(trip.name)}">
        <div class="${compact ? 'h-28' : 'h-36'} relative overflow-hidden" style="background: linear-gradient(135deg, ${baseColor}, color-mix(in srgb, ${baseColor} 55%, #ffffff));">
          ${trip.coverImage ? `<img src="${escapeHtml(trip.coverImage)}" class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" alt="" loading="lazy" onerror="this.style.display='none'">` : ''}
          <div class="absolute inset-0" style="background: linear-gradient(to top, rgba(0,0,0,0.42), transparent 55%);"></div>
          ${!compact ? `<div class="absolute top-3 right-3"><span class="badge bg-white/90 backdrop-blur text-[10px]" style="border-color:transparent;color:#333;">${escapeHtml(trip.status || 'draft')}</span></div>` : ''}
          <div class="absolute bottom-3 left-3 right-3"><h3 class="font-bold text-white ${compact ? 'text-sm' : 'text-[16px]'} leading-tight" style="font-family: var(--font-display); text-shadow: 0 1px 6px rgba(0,0,0,0.35);">${escapeHtml(trip.name)}</h3></div>
        </div>
        <div class="${compact ? 'p-3' : 'p-4'}">
          ${(trip.country || trip.city) ? `<p class="meta-line">${icon('globe', 'w-3 h-3')} <span class="truncate">${escapeHtml(trip.country || '')}${trip.city ? ' • ' + escapeHtml(trip.city) : ''}</span></p>` : ''}
          <p class="meta-line ${compact ? 'mt-0.5' : 'mt-1'}">${icon('calendar', 'w-3 h-3')} ${escapeHtml(trip.startDate || '?')} ${icon('arrow-right', 'w-3 h-3')} ${escapeHtml(trip.endDate || '?')}</p>
          ${!compact ? `
          <div class="flex items-center gap-2 mt-3 flex-wrap">
            <span class="text-[11px] px-2.5 py-1 rounded-full bg-[var(--bg-secondary)] font-semibold flex items-center gap-1">${icon('banknote', 'w-3 h-3')} ${escapeHtml(trip.baseCurrency || 'THB')}</span>
            <span class="text-[11px] px-2.5 py-1 rounded-full bg-[var(--bg-secondary)] font-semibold flex items-center gap-1">${icon('clock', 'w-3 h-3')} ${escapeHtml((trip.timezone || '').replace('_', ' '))}</span>
            <span class="text-[11px] px-2.5 py-1 rounded-full font-bold flex items-center gap-1 ml-auto" style="background: var(--primary-light); color: var(--primary-strong);">${icon('log-in', 'w-3 h-3')} ${lang==='th' ? 'เปิดทริป' : 'Open'}</span>
          </div>` : ''}
        </div>
      </div>`;
  };

  const attachTripCards = (root) => {
    root.querySelectorAll('[data-trip]').forEach(el => {
      const go = () => { location.hash = `#/trip/${el.dataset.trip}/dashboard`; };
      el.addEventListener('click', go);
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    });
  };

  try {
    const trips = await listTrips(currentUser.uid, false);
    if (!trips.length) {
      grid.innerHTML = `<div class="col-span-full">${renderEmptyState({
        icon: 'compass',
        title: t('noTrip'),
        desc: t('createFirstTrip'),
        actionHtml: `<button id="empty-create" class="btn btn-primary mt-4">${icon('plus', 'w-4 h-4')} ${t('createTrip')}</button>`
      })}</div>`;
      document.getElementById('empty-create')?.addEventListener('click', () => showCreateTripModal());
      queueIcons();
      return;
    }
    grid.innerHTML = trips.map((trip, idx) => tripCardHtml(trip, idx)).join('');
    attachTripCards(grid);
    queueIcons();
  } catch (e) {
    console.error('List trips failed', e);
    let msg = e.message;
    let hint = '';

    if (e.code === 'permission-denied' || msg.includes('permission') || msg.includes('Missing') || msg.includes('insufficient')) {
      hint = `
        <div class="text-left mt-3 p-3 rounded-xl text-[11px] leading-relaxed" style="background: var(--warning-bg); border: 1px solid color-mix(in srgb, var(--warning) 35%, transparent);">
          <strong class="flex items-center gap-1">${icon('alert-triangle', 'w-3.5 h-3.5')} Firestore Rules ยังไม่ deploy</strong>
          ต้อง deploy กฎใหม่ที่ Firebase Console:<br>
          1. ไปที่ <a href="https://console.firebase.google.com" target="_blank" rel="noopener" class="underline font-bold">Firebase Console</a> &gt; Firestore &gt; Rules<br>
          2. คัดลอกเนื้อหาจากไฟล์ <code>firestore.rules</code> ใน repo นี้<br>
          3. กด Publish
        </div>`;
      msg = 'ไม่มีสิทธิ์เข้าถึง — ต้อง deploy Firestore Rules';
    }
    if (msg.includes('index') || e.code === 'failed-precondition') {
      hint = `<div class="text-left mt-3 p-3 rounded-xl text-[11px]" style="background: var(--info-light); border: 1px solid color-mix(in srgb, var(--info) 35%, transparent);"><strong class="flex items-center gap-1">${icon('database', 'w-3.5 h-3.5')} ต้องสร้าง Firestore Index</strong>รัน <code>firebase deploy --only firestore:indexes</code> หรือไปที่ <a href="https://console.firebase.google.com" target="_blank" rel="noopener" class="underline">Console</a> &gt; Firestore &gt; Indexes</div>`;
      msg = 'ต้องสร้าง Index — ดูคำสั่งใน Console';
    }

    // Show cached trips (still clickable) so trip switching keeps working offline
    try {
      const cached = localStorage.getItem('fuji_trips_cache');
      if (cached) {
        const { data } = JSON.parse(cached);
        if (data && data.length) {
          grid.innerHTML = `
            <div class="col-span-full flex items-start gap-2 p-3 rounded-xl text-xs" style="background: var(--warning-bg); border: 1px solid color-mix(in srgb, var(--warning) 35%, transparent);">
              <span style="color: var(--warning); margin-top:1px;">${icon('cloud-off', 'w-4 h-4')}</span>
              <span>${lang==='th' ? 'แสดงข้อมูลจากแคช' : 'Showing cached trips'} • ${data.length} ${lang==='th' ? 'ทริป' : 'trips'} • ${lang==='th' ? 'กดรีเฟรชหลัง deploy Rules' : 'refresh after deploying Rules'}</span>
            </div>
            ${data.map((trip, idx) => tripCardHtml(trip, idx, true)).join('')}
          `;
          attachTripCards(grid);
          const retryDiv = document.createElement('div');
          retryDiv.className = 'col-span-full flex gap-2 justify-center mt-4';
          retryDiv.innerHTML = `<button id="retry-trips" class="btn btn-primary btn-sm">${icon('refresh-cw', 'w-4 h-4')} ${lang==='th' ? 'ลองใหม่อีกครั้ง' : 'Retry'}</button>`;
          grid.appendChild(retryDiv);
          document.getElementById('retry-trips').addEventListener('click', () => renderTripSelector());
          queueIcons();
          return;
        }
      }
    } catch {}

    grid.innerHTML = `<div class="col-span-full card p-6 text-center">
      <div class="row-icon mx-auto mb-3" style="width:52px;height:52px;border-radius:16px;background:var(--danger-bg);color:var(--danger);">${icon('cloud-off', 'w-6 h-6')}</div>
      <p class="text-sm font-bold mb-1" style="color: var(--danger);">${escapeHtml(msg)}</p>
      ${hint}
      <div class="flex gap-2 justify-center mt-4 flex-wrap">
        <button id="retry-trips" class="btn btn-primary btn-sm">${icon('refresh-cw', 'w-4 h-4')} ${lang==='th' ? 'ลองใหม่' : 'Retry'}</button>
        <button id="show-rules" class="btn btn-secondary btn-sm">${icon('scroll-text', 'w-4 h-4')} ${lang==='th' ? 'ดู Rules' : 'View Rules'}</button>
        <button id="clear-cfg-btn" class="btn btn-ghost btn-sm">${icon('eraser', 'w-4 h-4')} ${lang==='th' ? 'ล้าง Config' : 'Clear Config'}</button>
      </div>
      <p class="text-[10px] text-[var(--text-tertiary)] mt-3">UID: ${currentUser?.uid?.slice(0,8)} • ${escapeHtml(currentUser?.email || '')}</p>
    </div>`;
    document.getElementById('retry-trips').addEventListener('click', () => renderTripSelector());
    document.getElementById('clear-cfg-btn').addEventListener('click', () => { localStorage.removeItem('fuji_firebase_config'); location.reload(); });
    document.getElementById('show-rules')?.addEventListener('click', async () => {
      try {
        const res = await fetch('./firestore.rules');
        const rulesText = await res.text();
        const rulesSheet = showBottomSheet(`
          <h3 class="font-bold mb-2 flex items-center gap-2">${icon('scroll-text', 'w-4 h-4')} Firestore Rules — คัดลอกไป deploy</h3>
          <p class="text-xs mb-3 text-[var(--text-secondary)]">คัดลอกทั้งหมดไปวางใน Firebase Console &gt; Firestore &gt; Rules &gt; Publish</p>
          <pre class="p-3 rounded-xl text-[10px] overflow-auto whitespace-pre-wrap" style="background:#111;color:#8ce8a5;max-height:400px;">${escapeHtml(rulesText)}</pre>
          <button id="copy-rules-btn" class="btn btn-primary w-full mt-3 btn-sm">${icon('copy', 'w-4 h-4')} คัดลอก Rules</button>
        `);
        queueIcons();
        document.getElementById('copy-rules-btn')?.addEventListener('click', async () => {
          try {
            await navigator.clipboard.writeText(rulesText);
            toast.success('คัดลอก Rules แล้ว');
          } catch { toast.error('คัดลอกไม่สำเร็จ'); }
        });
      } catch {
        toast.error('โหลด rules ไม่สำเร็จ');
      }
    });
    queueIcons();
  }
}

async function loadTrip(tripId) {
  if (!tripId) return null;
  try {
    const trip = await getTrip(tripId);
    currentTrip = trip;
    if (headerSubtitle) headerSubtitle.textContent = trip.name;
    return trip;
  } catch (e) {
    const msg = e?.message || String(e);
    console.error('loadTrip failed:', e);
    if (/not found|no-document/i.test(msg) || e?.code === 'not-found') {
      toast.error(getLang() === 'th' ? 'ไม่พบทริปนี้ — อาจถูกลบไปแล้ว' : 'Trip not found — it may have been deleted');
      setTrip(null);
      currentTripId = null;
      location.hash = '#/trips';
    } else {
      toast.error(
        msg + (getLang() === 'th' ? ' — กดปุ่มรีเฟรช (มุมขวาบน) เพื่อลองใหม่' : ' — tap Refresh to retry'),
        getLang() === 'th' ? 'สลับ/โหลดทริปไม่สำเร็จ' : 'Failed to load trip',
        () => router.handle()
      );
      if (headerSubtitle) headerSubtitle.textContent = getLang() === 'th' ? 'โหลดทริปไม่สำเร็จ' : 'Trip load failed';
    }
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
        <div class="min-w-0">
          <h1 class="text-3xl font-bold tracking-tight truncate" style="font-family: var(--font-display);">${escapeHtml(currentTrip?.name || (lang==='th' ? 'แดชบอร์ด' : 'Dashboard'))}</h1>
          <div class="flex items-center gap-3 mt-1.5 flex-wrap text-sm text-[var(--text-secondary)]">
            <span class="meta-line">${icon('calendar', 'w-3.5 h-3.5')} ${escapeHtml(currentTrip?.startDate || '')} ${icon('arrow-right', 'w-3 h-3')} ${escapeHtml(currentTrip?.endDate || '')}</span>
            ${currentTrip?.country ? `<span class="meta-line">${icon('globe', 'w-3.5 h-3.5')} ${escapeHtml(currentTrip.country)}${currentTrip.city ? ' • ' + escapeHtml(currentTrip.city) : ''}</span>` : ''}
          </div>
        </div>
        <div class="btn-row">
          <button id="add-place-quick" class="btn btn-secondary btn-sm">${icon('map-pin', 'w-4 h-4')} ${t('addPlace')}</button>
          <button id="add-expense-quick" class="btn btn-primary btn-sm">${icon('wallet', 'w-4 h-4')} ${t('addExpense')}</button>
        </div>
      </div>

      <div id="dashboard-grid" class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div class="card-bento card card-accent col-span-2"><p class="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)] flex items-center gap-1.5">${icon('hourglass', 'w-3.5 h-3.5')} ${t('countdown')}</p><h3 id="countdown" class="text-2xl font-bold mt-2" style="font-family: var(--font-display);">--</h3><p id="countdown-sub" class="text-sm text-[var(--text-secondary)] mt-1">--</p></div>
        <div class="card-bento card"><p class="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)] flex items-center gap-1.5">${icon('wallet', 'w-3.5 h-3.5')} ${t('totalExpense')}</p><h3 id="total-expense" class="text-xl font-bold mt-2" style="font-family: var(--font-display);">--</h3><p class="text-xs text-[var(--text-secondary)]" id="total-expense-thb"></p></div>
        <div class="card-bento card"><p class="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)] flex items-center gap-1.5">${icon('user-round', 'w-3.5 h-3.5')} ${t('myBalance')}</p><h3 id="my-balance" class="text-xl font-bold mt-2" style="font-family: var(--font-display);">--</h3><p class="text-xs text-[var(--text-secondary)]">${lang==='th' ? 'รับ / จ่าย' : 'receive / pay'}</p></div>
        <div class="card-bento card col-span-2 lg:col-span-2"><p class="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)] flex items-center gap-1.5">${icon('target', 'w-3.5 h-3.5')} ${t('currentActivity')}</p><div id="current-activity" class="mt-3"><div class="skeleton h-12"></div></div></div>
        <div class="card-bento card col-span-2 lg:col-span-2"><p class="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)] flex items-center gap-1.5">${icon('pie-chart', 'w-3.5 h-3.5')} ${lang==='th' ? 'สรุปภาพรวม' : 'Summary'}</p><div id="summary-stats" class="mt-3 text-sm"><div class="skeleton h-4"></div></div></div>
      </div>

      <div id="member-board" class="card p-5">
        <h3 class="font-bold mb-4 flex items-center gap-2"><span class="row-icon" style="width:30px;height:30px;border-radius:10px;">${icon('users', 'w-4 h-4')}</span> ${lang==='th' ? 'สมาชิก • ยอดต่อคน' : 'Members • Balance each'}</h3>
        <div id="member-board-content" class="space-y-3 stagger"><div class="skeleton h-16"></div></div>
      </div>

      <div class="grid md:grid-cols-2 gap-4">
        <div class="card p-5">
          <h3 class="font-bold mb-4 flex items-center gap-2"><span class="row-icon" style="width:30px;height:30px;border-radius:10px;">${icon('bar-chart-3', 'w-4 h-4')}</span> ${lang==='th' ? 'ค่าใช้จ่ายตามหมวด' : 'Expenses by category'}</h3>
          <div id="category-stats"><div class="skeleton h-20"></div></div>
        </div>
        <div class="card p-5">
          <h3 class="font-bold mb-4 flex items-center gap-2"><span class="row-icon" style="width:30px;height:30px;border-radius:10px;">${icon('sparkles', 'w-4 h-4')}</span> ${t('upNext')}</h3>
          <div id="upnext-list" class="stagger"></div>
        </div>
      </div>
    </div>
  `;
  queueIcons();

  document.getElementById('add-place-quick').addEventListener('click', () => location.hash = `#/trip/${tripId}/itinerary?action=add`);
  document.getElementById('add-expense-quick').addEventListener('click', () => location.hash = `#/trip/${tripId}/expenses/add`);

  try {
    const { expenses, members } = await fetchSettlementData(tripId);
    const totalMinor = expenses.reduce((s, e) => s + (e.netTotalMinor || 0), 0);
    document.getElementById('total-expense').textContent = formatCurrency(totalMinor, currentTrip?.baseCurrency || 'THB');

    const thbTotal = expenses.reduce((s, e) => s + (e.thbMinor || e.netTotalMinor || 0), 0);
    if (currentTrip?.baseCurrency !== 'THB') {
      document.getElementById('total-expense-thb').textContent = `≈ ${formatCurrency(thbTotal, 'THB')}`;
    } else {
      document.getElementById('total-expense-thb').textContent = `${expenses.length} ${lang==='th' ? 'รายการ' : 'items'}`;
    }

    const { balances } = calculateSettlement(expenses, members.map(m => ({ id: m.id })));
    const myBal = balances.find(b => b.memberId === currentUser.uid);
    document.getElementById('my-balance').textContent = myBal ? formatCurrency(myBal.net, currentTrip?.baseCurrency || 'THB') : formatCurrency(0, currentTrip?.baseCurrency || 'THB');
    document.getElementById('summary-stats').innerHTML = `
      <div class="flex items-center gap-4 flex-wrap">
        <span class="meta-line text-sm">${icon('users', 'w-4 h-4')} ${members.length} ${lang==='th' ? 'คน' : ''}</span>
        <span class="meta-line text-sm">${icon('receipt', 'w-4 h-4')} ${expenses.length} ${lang==='th' ? 'รายการ' : ''}</span>
        <span class="meta-line text-sm">${icon('calendar-days', 'w-4 h-4')} ${currentTrip ? getTripDays(currentTrip.startDate, currentTrip.endDate).length : 0} ${lang==='th' ? 'วัน' : lang==='th' ? '' : 'days'}</span>
      </div>`;

    // Member board
    const membersMap = Object.fromEntries(members.map(m => [m.id, m]));
    document.getElementById('member-board-content').innerHTML = balances.map(b => {
      const m = membersMap[b.memberId];
      const isMe = b.memberId === currentUser.uid;
      return `
        <div class="flex items-center justify-between p-3 rounded-xl border gap-2 ${isMe ? '' : ''}" style="border-color: ${isMe ? 'color-mix(in srgb, var(--primary-raw) 45%, var(--border))' : 'var(--border)'}; background: ${isMe ? 'var(--primary-light)' : 'var(--bg-secondary)'};">
          <div class="flex items-center gap-3 min-w-0">
            <div class="w-10 h-10 rounded-full grid place-items-center text-sm font-bold text-white flex-shrink-0 overflow-hidden" style="background:${m?.color || 'var(--primary)'};">
              ${m?.photoURL ? `<img src="${escapeHtml(m.photoURL)}" class="w-full h-full rounded-full object-cover" alt="">` : escapeHtml(getInitials(m?.displayName || 'U'))}
            </div>
            <div class="min-w-0">
              <div class="font-semibold text-sm flex items-center gap-2 truncate">${escapeHtml(m?.displayName || b.memberId.slice(0,6))} ${isMe ? `<span class="text-[10px] px-2 py-0.5 rounded-full text-white flex-shrink-0" style="background:var(--gradient-primary);">${lang==='th' ? 'คุณ' : 'You'}</span>` : ''}</div>
              <div class="text-xs text-[var(--text-secondary)]">${escapeHtml(m?.role || 'member')}</div>
            </div>
          </div>
          <div class="text-right flex-shrink-0">
            <div class="font-bold text-sm" style="color: ${b.net >= 0 ? 'var(--success)' : 'var(--danger)'};">${formatCurrency(b.net, currentTrip?.baseCurrency || 'THB')}</div>
            <div class="text-[11px] text-[var(--text-tertiary)]">${b.net >= 0 ? (lang==='th' ? 'ได้รับ' : 'receives') : (lang==='th' ? 'จ่ายเพิ่ม' : 'pays')}</div>
          </div>
        </div>`;
    }).join('') || `<p class="text-sm text-[var(--text-secondary)]">${t('noData')}</p>`;

    // Category stats
    const byCategory = {};
    expenses.forEach(e => {
      const cat = e.category || 'general';
      if (!byCategory[cat]) byCategory[cat] = 0;
      byCategory[cat] += e.netTotalMinor || 0;
    });
    const CAT_ICONS = { food: 'utensils-crossed', transport: 'train-front', stay: 'bed-double', activity: 'ticket', shopping: 'shopping-bag', general: 'package' };
    const catEntries = Object.entries(byCategory).sort((a,b) => b[1] - a[1]);
    const catMax = catEntries[0]?.[1] || 1;
    document.getElementById('category-stats').innerHTML = catEntries.map(([cat, total]) => `
      <div class="py-2">
        <div class="flex justify-between items-center text-sm gap-2">
          <span class="meta-line">${icon(CAT_ICONS[cat] || 'package', 'w-3.5 h-3.5')} ${escapeHtml(cat)}</span>
          <span class="font-bold flex-shrink-0">${formatCurrency(total, currentTrip?.baseCurrency || 'THB')}</span>
        </div>
        <div class="progress mt-1.5" style="height:5px;"><div class="progress-bar" style="width:${Math.max(4, Math.round(total / catMax * 100))}%;"></div></div>
      </div>
    `).join('') || `<p class="text-xs text-[var(--text-secondary)]">${t('noData')}</p>`;

    if (currentTrip?.startDate) {
      const start = dayjs(currentTrip.startDate);
      const now = dayjs();
      const diff = start.diff(now, 'day');
      document.getElementById('countdown').textContent = diff > 0 ? (lang==='th' ? `อีก ${diff} วัน` : `${diff} days to go`) : diff === 0 ? (lang==='th' ? 'วันนี้!' : 'Today!') : (lang==='th' ? `ผ่านมา ${Math.abs(diff)} วัน` : `${Math.abs(diff)} days ago`);
      document.getElementById('countdown-sub').textContent = formatDate(currentTrip.startDate, lang, currentTrip.timezone || 'Asia/Bangkok');
    }

    const todayStr = dayjs().format('YYYY-MM-DD');
    const todaysItems = await fetchItinerary(tripId, todayStr);
    const now = dayjs();
    const current = todaysItems.find(it => it.startAt && it.endAt && dayjs(it.startAt).isBefore(now) && dayjs(it.endAt).isAfter(now));
    if (current) {
      const progress = Math.round((now.diff(dayjs(current.startAt)) / dayjs(current.endAt).diff(dayjs(current.startAt))) * 100);
      document.getElementById('current-activity').innerHTML = `
        <div class="font-semibold flex items-center gap-1.5">${icon('map-pin', 'w-4 h-4')} ${escapeHtml(current.title)}</div>
        <div class="meta-line mt-1">${icon('clock', 'w-3 h-3')} ${formatTime(current.startAt, currentTrip.timezone)} – ${formatTime(current.endAt, currentTrip.timezone)}</div>
        <div class="progress mt-3"><div class="progress-bar" style="width:${progress}%"></div></div>`;
    } else {
      document.getElementById('current-activity').innerHTML = `<p class="text-sm text-[var(--text-secondary)] flex items-center gap-2">${icon('coffee', 'w-4 h-4')} ${lang==='th' ? 'ไม่มีกิจกรรมในขณะนี้' : 'No activity right now'}</p>`;
    }

    const tripDays = getTripDays(currentTrip.startDate, currentTrip.endDate);
    const upNextDay = determineUpNextDay(tripDays, []);
    const upItems = await fetchItinerary(tripId, upNextDay);
    document.getElementById('upnext-list').innerHTML = upItems.length ? upItems.map((it, idx) => `
      <div class="flex gap-3 py-3 border-b last:border-0" style="border-color:var(--border);">
        <div class="step-num">${idx + 1}</div>
        <div class="flex-1 min-w-0">
          <div class="font-medium text-sm truncate">${escapeHtml(it.title)}</div>
          <div class="meta-line mt-0.5">${icon('clock', 'w-3 h-3')} ${formatTime(it.startAt, currentTrip.timezone)}${it.address ? ` • ${icon('map-pin', 'w-3 h-3')} <span class="truncate">${escapeHtml(it.address)}</span>` : ''}</div>
        </div>
      </div>
    `).join('') : `<p class="text-sm text-[var(--text-secondary)]">${lang==='th' ? 'ไม่มีแผนสำหรับ' : 'No plans for'} ${upNextDay || (lang==='th' ? 'วันนี้' : 'today')}</p>`;
    queueIcons();

  } catch (e) {
    console.error(e);
    toast.error(getLang()==='th' ? 'โหลด Dashboard ไม่สำเร็จ: ' + e.message : 'Failed: ' + e.message);
    document.getElementById('dashboard-grid').innerHTML = `<div class="col-span-full card p-6 text-center"><p class="text-sm font-semibold" style="color:var(--danger);">${escapeHtml(e.message)}</p><button id="dash-retry" class="btn btn-secondary btn-sm mt-3">${icon('refresh-cw', 'w-4 h-4')} ${lang==='th' ? 'ลองใหม่' : 'Retry'}</button></div>`;
    document.getElementById('dash-retry')?.addEventListener('click', () => router.handle());
    queueIcons();
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
      <div class="flex flex-wrap items-center justify-between gap-3 mb-5">
        <h1 class="page-title text-2xl font-bold"><span class="title-icon">${icon('map-pinned', 'w-5 h-5')}</span> ${t('itinerary')}</h1>
        <div class="btn-row">
          <button id="view-all-btn" class="btn btn-secondary btn-sm">${icon('calendar-days', 'w-4 h-4')} <span id="view-all-label">${lang==='th' ? 'ดูทั้งหมด' : 'View all'}</span></button>
          <button id="toggle-map-btn" class="btn btn-secondary btn-sm">${icon('map', 'w-4 h-4')} ${lang==='th' ? 'แผนที่' : 'Map'}</button>
          <button id="export-png-btn" class="btn btn-secondary btn-sm">${icon('download', 'w-4 h-4')} PNG</button>
          <button id="edit-mode-btn" class="btn btn-secondary btn-sm">${icon('list-ordered', 'w-4 h-4')} ${t('editMode')}</button>
          <button id="add-itinerary-btn" class="btn btn-primary btn-sm">${icon('plus', 'w-4 h-4')} ${t('addPlace')}</button>
        </div>
      </div>
      <div id="map-container" class="hidden mb-6">
        <div id="map" class="map-frame w-full" style="height:min(50vh, 420px);"></div>
        <p class="text-[10px] text-[var(--text-tertiary)] mt-1.5 flex items-center gap-1">${icon('info', 'w-3 h-3')} ${lang==='th' ? 'แผนที่ OpenStreetMap / CARTO — ไม่ต้องใช้ API key • เส้นประแสดงลำดับสถานที่ (ไม่ใช่เส้นทางจริง)' : 'OpenStreetMap / CARTO — no API key needed • dashed line shows visit order (not real routing)'}</p>
      </div>
      <div id="date-chips" class="chip-row mb-4"></div>
      <div id="itinerary-list" class="space-y-3 stagger"></div>
    </div>
  `;
  queueIcons();

  let selectedDate = urlParams.get('date') || dayjs().format('YYYY-MM-DD');
  let editMode = false;
  let showAll = false;
  let mapVisible = false;
  let mapInstance = null;
  let mapL = null;

  const tripDays = currentTrip ? getTripDays(currentTrip.startDate, currentTrip.endDate) : [];
  const chipsEl = document.getElementById('date-chips');
  chipsEl.innerHTML = tripDays.map((d, i) => {
    const ds = dayjs(d).format('YYYY-MM-DD');
    return `<button data-date="${ds}" class="chip ${ds === selectedDate && !showAll ? 'chip-active' : ''}">${icon('calendar', 'w-3.5 h-3.5')} ${dayjs(d).format('DD MMM')}</button>`;
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
    document.getElementById('view-all-label').textContent = showAll ? (lang==='th' ? 'รายวัน' : 'By day') : (lang==='th' ? 'ดูทั้งหมด' : 'View all');
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

  // Re-style map tiles when light/dark theme changes
  const themeChangeListener = () => {
    if (mapVisible && mapInstance && mapL) {
      import('./maps/index.js').then(m => m.refreshMapTheme?.(mapInstance, mapL)).catch(() => {});
    }
  };
  document.addEventListener('themechange', themeChangeListener);

  async function loadMap() {
    const mapEl = document.getElementById('map');
    if (!mapEl) return;
    mapEl.innerHTML = `<div class="grid place-items-center h-full gap-2 text-sm text-[var(--text-secondary)]"><span class="skeleton" style="width:36px;height:36px;border-radius:50%;"></span> ${lang==='th' ? 'กำลังโหลดแผนที่...' : 'Loading map...'}</div>`;
    try {
      const { initMap, addItineraryMarkers } = await import('./maps/index.js');
      const res = await initMap('map');
      mapInstance = res.map;
      mapL = res.L;
      const items = await fetchItinerary(tripId, showAll ? null : selectedDate);
      const dayColors = {};
      tripDays.forEach((d, i) => {
        const hue = (i * 47) % 360;
        dayColors[dayjs(d).format('YYYY-MM-DD')] = `hsl(${hue},62%,52%)`;
      });
      addItineraryMarkers(mapInstance, mapL, items, dayColors);
    } catch (e) {
      console.error('Map failed', e);
      mapEl.innerHTML = `
        <div class="grid place-items-center h-full text-center p-6 gap-2">
          <div class="row-icon" style="width:44px;height:44px;background:var(--danger-bg);color:var(--danger);">${icon('map', 'w-5 h-5')}</div>
          <p class="text-sm font-semibold" style="color:var(--danger);">${lang==='th' ? 'โหลดแผนที่ไม่สำเร็จ' : 'Map failed to load'}</p>
          <p class="text-xs text-[var(--text-secondary)] max-w-[320px]">${escapeHtml(e.message || '')}</p>
          <button id="map-retry" class="btn btn-secondary btn-sm mt-1">${icon('refresh-cw', 'w-4 h-4')} ${lang==='th' ? 'ลองใหม่' : 'Retry'}</button>
        </div>`;
      document.getElementById('map-retry')?.addEventListener('click', () => loadMap());
      queueIcons();
    }
  }

  document.getElementById('export-png-btn').addEventListener('click', async () => {
    const tLoad = toast.loading(lang==='th' ? 'กำลังส่งออก PNG...' : 'Exporting PNG...');
    try {
      const { exportToPng } = await import('./exports/index.js');
      await exportToPng('itinerary-list', `itinerary-${tripId}.png`);
      tLoad.close();
      toast.success(lang==='th' ? 'ส่งออก PNG แล้ว' : 'PNG exported');
    } catch (e) {
      tLoad.close();
      toast.error(e.message);
    }
  });

  async function loadItems() {
    const listEl = document.getElementById('itinerary-list');
    listEl.innerHTML = `<div class="skeleton h-20"></div><div class="skeleton h-20"></div>`;
    try {
      let items = [];
      if (showAll) {
        // Fetch every day in one query (no composite index needed), group client-side
        items = await fetchItinerary(tripId, null);
        items.sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.order || 0) - (b.order || 0) || new Date(a.startAt) - new Date(b.startAt));
      } else {
        items = await fetchItinerary(tripId, selectedDate);
      }

      if (!items.length) {
        listEl.innerHTML = renderEmptyState({
          icon: 'map-pinned',
          title: lang==='th' ? 'ไม่มีแผนในวันนี้' : 'No plans',
          desc: showAll ? (lang==='th' ? 'เพิ่มสถานที่แรกเข้าไปในทริปเลย' : 'Add the first place to your trip') : (lang==='th' ? `ยังไม่มีแผนสำหรับ ${selectedDate}` : `No plans for ${selectedDate}`),
          actionHtml: `<button id="empty-add" class="btn btn-primary btn-sm mt-3">${icon('plus', 'w-4 h-4')} ${t('addPlace')}</button>`
        });
        document.getElementById('empty-add')?.addEventListener('click', () => showAddModal());
        queueIcons();
        return;
      }

      if (showAll) {
        const byDay = {};
        items.forEach(it => {
          const day = it._day || it.date;
          if (!day) return;
          if (!byDay[day]) byDay[day] = [];
          byDay[day].push(it);
        });
        listEl.innerHTML = Object.entries(byDay).map(([day, dayItems]) => `
          <div class="mb-6">
            <h3 class="font-bold text-sm mb-3 flex items-center gap-2">
              <span class="step-num">${dayjs(day).format('DD')}</span>
              ${formatDate(day, lang, currentTrip?.timezone)}
              <span class="badge badge-planned text-[10px]">${dayItems.length} ${lang==='th' ? 'ที่' : 'places'}</span>
            </h3>
            <div class="space-y-3 stagger">${dayItems.map((it, idx) => renderItemCard(it, idx, editMode)).join('')}</div>
          </div>
        `).join('');
      } else {
        listEl.innerHTML = items.map((it, idx) => renderItemCard(it, idx, editMode)).join('');
      }

      function renderItemCard(it, idx, editMode) {
        return `
          <div class="card card-hover p-4 ${editMode ? 'cursor-move' : ''}" data-id="${it.id}" draggable="${editMode}">
            <div class="flex gap-3">
              <div class="step-num">${idx + 1}</div>
              <div class="flex-1 min-w-0">
                <div class="flex items-start justify-between gap-2">
                  <h3 class="font-semibold text-sm">${escapeHtml(it.title)}</h3>
                  <span class="badge badge-${it.status || 'planned'} text-[10px] flex-shrink-0">${escapeHtml(it.status || 'planned')}</span>
                </div>
                <div class="flex items-center gap-3 flex-wrap mt-1.5">
                  <span class="meta-line">${icon('clock', 'w-3 h-3')} ${formatTime(it.startAt, currentTrip?.timezone)} – ${formatTime(it.endAt, currentTrip?.timezone)}</span>
                  <span class="meta-line">${icon('timer', 'w-3 h-3')} ${formatDuration(it.durationMinutes)}</span>
                  ${(it.travelToNextMinutes > 0) ? `<span class="meta-line">${icon('footprints', 'w-3 h-3')} ${it.travelToNextMinutes} min</span>` : ''}
                </div>
                ${it.address ? `<p class="meta-line mt-1">${icon('map-pin', 'w-3 h-3')} <span class="truncate">${escapeHtml(it.address)}</span></p>` : ''}
                ${it.imageUrl ? `<div class="mt-2 rounded-xl overflow-hidden border" style="border-color: var(--border);"><img src="${escapeHtml(it.imageUrl)}" class="w-full h-36 object-cover" loading="lazy" onerror="this.parentElement.style.display='none'" alt=""></div>` : ''}
                ${it.coordinates ? `<p class="meta-line mt-1 text-[var(--text-tertiary)]">${icon('crosshair', 'w-3 h-3')} ${escapeHtml(it.coordinates)}</p>` : ''}
              </div>
              ${editMode ? `<div class="flex-shrink-0 text-[var(--text-tertiary)] self-center">${icon('grip-vertical', 'w-4 h-4')}</div>` : ''}
            </div>
          </div>`;
      }

      if (editMode) {
        try {
          const Sortable = (await import('https://esm.sh/sortablejs@1.15.3')).default;
          Sortable.create(listEl, {
            animation: 180,
            onEnd: async () => {
              const newOrder = Array.from(listEl.querySelectorAll('[data-id]')).map(el => el.dataset.id);
              const tLoad = toast.loading(lang==='th' ? 'กำลังจัดลำดับ...' : 'Reordering...');
              try {
                await reorderItinerary(tripId, selectedDate, newOrder, currentUser.uid);
                tLoad.close();
                toast.success(lang==='th' ? 'จัดลำดับใหม่แล้ว' : 'Reordered');
                loadItems();
              } catch (e) { tLoad.close(); toast.error(e.message); }
            }
          });
        } catch (e) { console.warn('Sortable failed', e); }
      }
      queueIcons();
      if (mapVisible) loadMap();
    } catch (e) {
      console.error(e);
      listEl.innerHTML = `<div class="card p-5 text-center"><p class="text-sm font-semibold" style="color:var(--danger);">${escapeHtml(e.message)}</p><button id="itin-retry" class="btn btn-secondary btn-sm mt-3">${icon('refresh-cw', 'w-4 h-4')} ${lang==='th' ? 'ลองใหม่' : 'Retry'}</button></div>`;
      document.getElementById('itin-retry')?.addEventListener('click', loadItems);
      queueIcons();
    }
  }

  function showAddModal() {
    const sheet = showBottomSheet(`
      <div class="flex items-center gap-3 mb-4">
        <div class="row-icon" style="width:40px;height:40px;border-radius:14px;background:var(--gradient-primary);color:#fff;">${icon('map-pin', 'w-5 h-5')}</div>
        <div>
          <h3 class="font-bold text-base leading-tight" style="font-family: var(--font-display);">${t('addPlace')}</h3>
          <p class="text-[11px] text-[var(--text-secondary)]">${lang==='th' ? 'เพิ่มสถานที่ลงในแผนการเดินทาง' : 'Add a place to your itinerary'}</p>
        </div>
      </div>
      <form id="itinerary-form" class="space-y-4">
        <div class="input-group"><label class="input-label">${icon('sparkles', 'w-3.5 h-3.5')} ${lang==='th' ? 'ชื่อสถานที่' : 'Place name'} *</label><input id="it-title" class="input" required autocomplete="off" placeholder="${lang==='th' ? 'เช่น ทะเลสาบคาวากุจิโกะ' : 'e.g. Lake Kawaguchi'}"></div>
        <div class="grid grid-cols-2 gap-3">
          <div class="input-group"><label class="input-label">${icon('calendar', 'w-3.5 h-3.5')} ${lang==='th' ? 'วันที่' : 'Date'}</label><input id="it-date" class="input" type="date" value="${selectedDate}" required></div>
          <div class="input-group"><label class="input-label">${icon('clock', 'w-3.5 h-3.5')} ${lang==='th' ? 'เวลาเริ่ม' : 'Start time'}</label><input id="it-time" class="input" type="time" value="09:00" required></div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div class="input-group"><label class="input-label">${icon('timer', 'w-3.5 h-3.5')} ${lang==='th' ? 'ระยะเวลา (นาที)' : 'Duration (min)'}</label><input id="it-duration" class="input" type="number" min="0" value="60"></div>
          <div class="input-group"><label class="input-label">${icon('footprints', 'w-3.5 h-3.5')} ${lang==='th' ? 'เดินทาง (นาที)' : 'Travel (min)'}</label><input id="it-travel" class="input" type="number" min="0" value="0"></div>
        </div>
        <div class="input-group">
          <label class="input-label">${icon('crosshair', 'w-3.5 h-3.5')} ${lang==='th' ? 'พิกัด lat,lng' : 'Coordinates lat,lng'}</label>
          <input id="it-coords" class="input" placeholder="35.3606,138.7274" autocomplete="off">
          <p class="input-hint">${lang==='th' ? 'ใส่พิกัดเพื่อแสดงบนแผนที่' : 'Add coordinates to show on the map'}</p>
        </div>
        <div class="input-group"><label class="input-label">${icon('map-pin', 'w-3.5 h-3.5')} ${lang==='th' ? 'ที่อยู่' : 'Address'}</label><input id="it-address" class="input" autocomplete="off"></div>
        <div class="input-group">
          <label class="input-label">${icon('image', 'w-3.5 h-3.5')} ${lang==='th' ? 'รูปภาพ (URL)' : 'Image (URL)'}</label>
          <input id="it-image-url" class="input" placeholder="https://example.com/image.jpg" autocomplete="off">
          <div id="it-image-preview" class="hidden mt-2 rounded-xl overflow-hidden border" style="border-color: var(--border);">
            <img id="it-preview-img" class="w-full h-32 object-cover" alt="">
          </div>
          <p class="input-hint">${lang==='th' ? 'ใส่ลิงก์รูปภาพ จะแสดงตัวอย่างอัตโนมัติ' : 'Paste an image link for an instant preview'}</p>
        </div>
        <button class="btn btn-primary w-full" type="submit">${icon('save', 'w-4 h-4')} ${t('save')}</button>
      </form>
    `);
    queueIcons();

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
      const btn = e.target.querySelector('button[type="submit"]');
      if (!btn) return;
      btn.disabled = true;
      const tLoad = toast.loading(lang==='th' ? 'กำลังบันทึก...' : 'Saving...');
      try {
        const date = document.getElementById('it-date').value;
        const time = document.getElementById('it-time').value;
        const startAt = new Date(`${date}T${time}`);
        const coords = document.getElementById('it-coords').value.trim();
        if (coords) {
          const parsed = parseCoordinates(coords);
          if (!parsed) throw new Error(lang==='th' ? 'พิกัดไม่ถูกต้อง (ใช้รูปแบบ lat,lng)' : 'Invalid coordinates (use lat,lng)');
        }
        await addItineraryItem(tripId, {
          title: document.getElementById('it-title').value,
          date,
          startAt,
          durationMinutes: parseInt(document.getElementById('it-duration').value, 10),
          travelToNextMinutes: parseInt(document.getElementById('it-travel').value, 10),
          coordinates: coords,
          address: document.getElementById('it-address').value,
          imageUrl: document.getElementById('it-image-url').value.trim(),
          category: 'general'
        }, currentUser.uid);
        tLoad.close();
        toast.success(lang==='th' ? 'เพิ่มสถานที่แล้ว' : 'Place added');
        sheet.close();
        loadItems();
      } catch (err) { tLoad.close(); toast.error(err.message); btn.disabled = false; }
    });
  }

  document.getElementById('add-itinerary-btn').addEventListener('click', showAddModal);
  document.getElementById('edit-mode-btn').addEventListener('click', () => {
    editMode = !editMode;
    const btn = document.getElementById('edit-mode-btn');
    btn.innerHTML = editMode ? `${icon('check', 'w-4 h-4')} ${t('exitEdit')}` : `${icon('list-ordered', 'w-4 h-4')} ${t('editMode')}`;
    btn.className = editMode ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm';
    queueIcons();
    loadItems();
  });
  loadItems();
  if (action === 'add') showAddModal();
}

const EXPENSE_CAT_ICONS = { food: 'utensils-crossed', transport: 'train-front', stay: 'bed-double', activity: 'ticket', shopping: 'shopping-bag', general: 'package' };
const EXPENSE_CATS = [
  { id: 'food', th: 'อาหาร', en: 'Food' },
  { id: 'transport', th: 'เดินทาง', en: 'Transport' },
  { id: 'stay', th: 'ที่พัก', en: 'Stay' },
  { id: 'activity', th: 'กิจกรรม', en: 'Activity' },
  { id: 'shopping', th: 'ช้อปปิ้ง', en: 'Shopping' },
  { id: 'general', th: 'ทั่วไป', en: 'General' },
];

async function renderExpenses(params) {
  const tripId = params.tripId;
  await loadTrip(tripId);
  const lang = getLang();
  appEl.innerHTML = `
    <div class="page-enter">
      <div class="flex flex-wrap items-center justify-between gap-3 mb-5">
        <h1 class="page-title text-2xl font-bold"><span class="title-icon">${icon('wallet', 'w-5 h-5')}</span> ${t('expenses')}</h1>
        <div class="btn-row">
          <button id="export-expenses" class="btn btn-secondary btn-sm">${icon('upload', 'w-4 h-4')} Export</button>
          <button id="import-expenses-btn" class="btn btn-secondary btn-sm">${icon('download', 'w-4 h-4')} Import</button>
          <button id="add-expense-btn" class="btn btn-primary btn-sm">${icon('plus', 'w-4 h-4')} ${t('addExpense')}</button>
        </div>
      </div>
      <div class="chip-row mb-4" id="expense-filters">
        <button class="chip chip-active" data-filter="all">${icon('layers', 'w-3.5 h-3.5')} ${t('all')}</button>
        <button class="chip" data-filter="today">${icon('calendar-check', 'w-3.5 h-3.5')} ${t('today')}</button>
        <button class="chip" data-filter="estimated">${icon('hourglass', 'w-3.5 h-3.5')} ${lang==='th' ? 'ประมาณการ' : 'Estimated'}</button>
      </div>
      <div id="expense-list" class="space-y-3 stagger"></div>
      <div id="expense-pagination" class="flex justify-center mt-6"><button id="load-more" class="btn btn-secondary btn-sm">${icon('chevron-down', 'w-4 h-4')} ${lang==='th' ? 'โหลดเพิ่ม' : 'Load more'}</button></div>
    </div>
  `;
  queueIcons();

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
      toast.success(lang==='th' ? 'ส่งออกไฟล์แล้ว' : 'Exported');
    } catch (e) { tLoad.close(); toast.error(e.message); }
  });
  document.getElementById('import-expenses-btn').addEventListener('click', () => {
    const sheet = showBottomSheet(`
      <div class="flex items-center gap-3 mb-4">
        <div class="row-icon" style="width:40px;height:40px;border-radius:14px;background:var(--gradient-primary);color:#fff;">${icon('download', 'w-5 h-5')}</div>
        <div>
          <h3 class="font-bold text-base leading-tight" style="font-family: var(--font-display);">Import Expenses</h3>
          <p class="text-[11px] text-[var(--text-secondary)]">${lang==='th' ? 'รองรับไฟล์ JSON ที่ export จากระบบนี้' : 'Use a JSON file exported from this app'}</p>
        </div>
      </div>
      <input id="import-file" type="file" accept=".json" class="input mb-3">
      <div id="import-preview" class="text-xs mb-3 text-[var(--text-secondary)]"></div>
      <button id="do-import-exp" class="btn btn-primary w-full" disabled>${icon('upload', 'w-4 h-4')} Import</button>
    `);
    queueIcons();
    let parsed = null;
    document.getElementById('import-file').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const text = await file.text();
      try {
        parsed = JSON.parse(text);
        document.getElementById('import-preview').textContent = `${lang==='th' ? 'พบ' : 'Found'} ${parsed.length} ${lang==='th' ? 'รายการ' : 'items'}`;
        document.getElementById('do-import-exp').disabled = false;
      } catch (err) {
        parsed = null;
        document.getElementById('import-preview').textContent = lang==='th' ? 'ไฟล์ไม่ถูกต้อง' : 'Invalid file';
        document.getElementById('do-import-exp').disabled = true;
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
        toast.success(`${lang==='th' ? 'นำเข้าแล้ว' : 'Imported'} ${parsed.length} ${lang==='th' ? 'รายการ' : 'items'}`);
        sheet.close();
        loadMore(true);
      } catch (e) { tLoad.close(); toast.error(e.message); btn.disabled = false; }
    });
  });

  let lastDoc = null;
  let allLoaded = [];
  let activeFilter = 'all';

  document.querySelectorAll('#expense-filters [data-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      activeFilter = btn.dataset.filter;
      document.querySelectorAll('#expense-filters .chip').forEach(c => c.classList.remove('chip-active'));
      btn.classList.add('chip-active');
      applyFilterRender();
    });
  });

  function filterItems(items) {
    if (activeFilter === 'today') {
      const today = dayjs().format('YYYY-MM-DD');
      return items.filter(e => e.date === today);
    }
    if (activeFilter === 'estimated') return items.filter(e => e.isEstimated);
    return items;
  }

  async function loadMore(reset = false) {
    if (reset) { lastDoc = null; allLoaded = []; }
    const listEl = document.getElementById('expense-list');
    if (reset) listEl.innerHTML = `<div class="skeleton h-20"></div><div class="skeleton h-20"></div>`;

    try {
      const { items, lastDoc: newLast } = await fetchExpenses(tripId, { pageSize: 20, lastDoc });
      lastDoc = newLast;
      allLoaded.push(...items);
      if (!allLoaded.length && reset) {
        listEl.innerHTML = renderEmptyState({
          icon: 'wallet',
          title: lang==='th' ? 'ยังไม่มีค่าใช้จ่าย' : 'No expenses',
          desc: lang==='th' ? 'เพิ่มรายการแรกเพื่อเริ่มติดตามงบประมาณ' : 'Add your first expense to start tracking',
          actionHtml: `<button id="empty-exp-add" class="btn btn-primary btn-sm mt-3">${icon('plus', 'w-4 h-4')} ${t('addExpense')}</button>`
        });
        document.getElementById('empty-exp-add')?.addEventListener('click', () => location.hash = `#/trip/${tripId}/expenses/add`);
        document.getElementById('load-more').classList.add('hidden');
        queueIcons();
        return;
      }
      applyFilterRender();
      const loadMoreBtn0 = document.getElementById('load-more');
      if (!newLast) loadMoreBtn0.classList.add('hidden');
      else loadMoreBtn0.classList.remove('hidden');
    } catch (e) {
      console.error(e);
      const listEl2 = document.getElementById('expense-list');
      listEl2.innerHTML = `<div class="card p-5 text-center"><p class="text-sm font-semibold" style="color:var(--danger);">${escapeHtml(e.message)}</p><button id="exp-retry" class="btn btn-secondary btn-sm mt-3">${icon('refresh-cw', 'w-4 h-4')} ${lang==='th' ? 'ลองใหม่' : 'Retry'}</button></div>`;
      document.getElementById('exp-retry')?.addEventListener('click', () => loadMore(true));
      queueIcons();
    }
  }

  function applyFilterRender() {
    const listEl = document.getElementById('expense-list');
    if (!listEl) return;
    const items = filterItems(allLoaded);
    if (!items.length) {
      listEl.innerHTML = renderEmptyState({
        icon: 'wallet',
        title: activeFilter === 'all' ? (lang==='th' ? 'ยังไม่มีค่าใช้จ่าย' : 'No expenses') : (lang==='th' ? 'ไม่พบรายการตามตัวกรอง' : 'No items match the filter'),
        desc: activeFilter === 'all' ? (lang==='th' ? 'เพิ่มรายการแรกเพื่อเริ่มติดตามงบประมาณ' : 'Add your first expense to start tracking') : '',
        actionHtml: activeFilter === 'all' ? `<button id="empty-exp-add" class="btn btn-primary btn-sm mt-3">${icon('plus', 'w-4 h-4')} ${t('addExpense')}</button>` : ''
      });
      document.getElementById('empty-exp-add')?.addEventListener('click', () => location.hash = `#/trip/${tripId}/expenses/add`);
      queueIcons();
      return;
    }
    const html = items.map(e => {
        const catIcon = EXPENSE_CAT_ICONS[e.category] || 'package';
        const catLabel = EXPENSE_CATS.find(c => c.id === e.category);
        return `
        <div class="card card-hover p-4">
          <div class="flex justify-between gap-3">
            <div class="flex gap-3 min-w-0">
              <div class="row-icon">${icon(catIcon, 'w-4 h-4')}</div>
              <div class="min-w-0">
                <h3 class="font-semibold text-sm truncate">${escapeHtml(e.title)}</h3>
                <div class="meta-line mt-1 flex-wrap">
                  ${e.date ? `<span class="meta-line">${icon('calendar', 'w-3 h-3')} ${formatDate(e.date, lang, currentTrip?.timezone)}</span>` : ''}
                  <span class="badge badge-planned text-[10px]">${lang==='th' && catLabel ? catLabel.th : (catLabel ? catLabel.en : escapeHtml(e.category || 'general'))}</span>
                </div>
              </div>
            </div>
            <div class="text-right flex-shrink-0">
              <div class="font-bold text-sm" style="font-family: var(--font-display);">${formatCurrency(e.netTotalMinor || 0, e.currency || 'THB')}</div>
              ${e.thbMinor && e.currency !== 'THB' ? `<div class="text-[11px] text-[var(--text-tertiary)]">≈ ${formatCurrency(e.thbMinor, 'THB')}</div>` : ''}
              ${e.isEstimated ? `<span class="badge badge-skipped text-[10px] mt-1">${icon('hourglass', 'w-3 h-3')} ${lang==='th' ? 'ประมาณการ' : 'est.'}</span>` : ''}
            </div>
          </div>
        </div>`;
      }).join('');
    listEl.innerHTML = html;
    queueIcons();
  }
  document.getElementById('load-more').addEventListener('click', () => loadMore(false));
  await loadMore(true);
}

async function renderExpenseAdd(params) {
  const tripId = params.tripId;
  await loadTrip(tripId);
  const lang = getLang();
  let members = [];
  try {
    const { getDocs, collection } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
    const snap = await getDocs(collection(db, `trips/${tripId}/members`));
    members = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch {}

  appEl.innerHTML = `
    <div class="page-enter max-w-[720px] mx-auto">
      <h1 class="page-title text-2xl font-bold mb-6"><span class="title-icon">${icon('receipt', 'w-5 h-5')}</span> ${t('addExpense')}</h1>
      <form id="expense-form" class="space-y-5 card card-accent p-6">
        <div class="input-group"><label class="input-label">${icon('sparkles', 'w-3.5 h-3.5')} ${lang==='th' ? 'ชื่อรายการ' : 'Title'} *</label><input id="ex-title" class="input" required autocomplete="off" placeholder="${lang==='th' ? 'เช่น ราเมงมื้อเย็น' : 'e.g. Dinner ramen'}"></div>
        <div class="grid grid-cols-2 gap-3">
          <div class="input-group"><label class="input-label">${icon('calendar', 'w-3.5 h-3.5')} ${lang==='th' ? 'วันที่' : 'Date'}</label><input id="ex-date" class="input" type="date" value="${dayjs().format('YYYY-MM-DD')}" required></div>
          <div class="input-group">
            <label class="input-label">${icon('tag', 'w-3.5 h-3.5')} ${lang==='th' ? 'หมวดหมู่' : 'Category'}</label>
            <select id="ex-cat" class="input">
              ${EXPENSE_CATS.map(c => `<option value="${c.id}">${lang==='th' ? c.th : c.en}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="grid grid-cols-3 gap-3">
          <div class="input-group col-span-2"><label class="input-label">${icon('banknote', 'w-3.5 h-3.5')} ${lang==='th' ? 'ยอดรวม' : 'Subtotal'} *</label><input id="ex-subtotal" class="input" type="number" step="0.01" min="0" required placeholder="0.00"></div>
          <div class="input-group"><label class="input-label">${icon('coins', 'w-3.5 h-3.5')} ${lang==='th' ? 'สกุลเงิน' : 'Currency'}</label><select id="ex-currency" class="input"><option value="THB">THB</option><option value="JPY">JPY</option><option value="USD">USD</option><option value="KRW">KRW</option><option value="EUR">EUR</option></select></div>
        </div>
        <div class="grid grid-cols-3 gap-3">
          <div class="input-group"><label class="input-label">${icon('ticket', 'w-3.5 h-3.5')} ${lang==='th' ? 'ส่วนลด' : 'Discount'}</label><input id="ex-discount" class="input" type="number" step="0.01" min="0" value="0"></div>
          <div class="input-group"><label class="input-label">${icon('concierge-bell', 'w-3.5 h-3.5')} Service</label><input id="ex-service" class="input" type="number" step="0.01" min="0" value="0"></div>
          <div class="input-group"><label class="input-label">${icon('receipt-text', 'w-3.5 h-3.5')} Tax</label><input id="ex-tax" class="input" type="number" step="0.01" min="0" value="0"></div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div class="input-group"><label class="input-label">${icon('arrow-left-right', 'w-3.5 h-3.5')} ${lang==='th' ? 'เรทเป็น THB' : 'Rate to THB'}</label><input id="ex-thb-rate" class="input" type="number" step="0.0001" min="0" value="1"><p class="input-hint">${lang==='th' ? 'เช่น JPY 0.25 = 1 เยน = 0.25 บาท' : 'e.g. JPY 0.25 = 1 JPY → 0.25 THB'}</p></div>
          <div class="input-group"><label class="input-label">${icon('list-checks', 'w-3.5 h-3.5')} ${lang==='th' ? 'ประเภท' : 'Type'}</label><select id="ex-type" class="input"><option value="actual">${lang==='th' ? 'จ่ายจริง' : 'Actual'}</option><option value="estimated">${lang==='th' ? 'ประมาณการ' : 'Estimated'}</option></select></div>
        </div>
        <div id="net-preview" class="p-4 rounded-xl text-sm font-bold border flex items-center gap-2" style="border-color: var(--border); background: var(--bg-secondary);">${icon('calculator', 'w-4 h-4')} ${t('netTotal')}: --</div>
        <div id="thb-preview" class="p-3 rounded-xl border text-sm flex items-center gap-2" style="border-color: color-mix(in srgb, var(--success) 35%, transparent); background: var(--success-bg); color: var(--success);">${icon('banknote', 'w-4 h-4')} THB: --</div>
        <div class="input-group"><label class="input-label">${icon('user', 'w-3.5 h-3.5')} ${t('payer')}</label><div id="payer-tiles" class="tile-grid"></div></div>
        <div class="input-group">
          <label class="input-label">${icon('split', 'w-3.5 h-3.5')} ${t('splitMethod')}</label>
          <div class="segmented">
            <button type="button" data-split="equal" class="segmented-item active">${icon('scale', 'w-4 h-4')} ${t('equal')}</button>
            <button type="button" data-split="unequal" class="segmented-item">${icon('sliders-horizontal', 'w-4 h-4')} ${t('unequal')}</button>
          </div>
        </div>
        <div id="split-area" class="space-y-3"></div>
        <div class="flex gap-3">
          <button type="button" id="cancel-expense" class="btn btn-secondary flex-1">${icon('x', 'w-4 h-4')} ${t('cancel')}</button>
          <button type="submit" id="submit-expense" class="btn btn-primary flex-1">${icon('save', 'w-4 h-4')} ${t('save')}</button>
        </div>
      </form>
    </div>
  `;
  queueIcons();

  let selectedPayer = members[0]?.id || currentUser.uid;
  let splitMethod = 'equal';
  let allocations = [];

  const payerTiles = document.getElementById('payer-tiles');
  payerTiles.innerHTML = members.map(m => `
    <div class="tile ${m.id === selectedPayer ? 'tile-selected' : ''}" data-payer="${m.id}">
      <div class="flex items-center gap-2 min-w-0">
        <div class="avatar w-8 h-8 text-xs" style="background:${m.color || 'var(--primary)'};width:32px;height:32px;">${m.photoURL ? `<img src="${escapeHtml(m.photoURL)}" class="w-full h-full rounded-full object-cover" alt="">` : escapeHtml(getInitials(m.displayName))}</div>
        <span class="text-sm font-medium truncate">${escapeHtml(m.displayName)}</span>
      </div>
    </div>
  `).join('') || `<p class="text-sm text-[var(--text-secondary)]">${lang==='th' ? 'ยังไม่พบสมาชิกในทริปนี้' : 'No members found in this trip'}</p>`;
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
    const net = sub - disc + serv + tax;
    const cur = document.getElementById('ex-currency').value;
    netPreview.innerHTML = `${icon('calculator', 'w-4 h-4')} ${t('netTotal')}: ${net.toFixed(2)} ${cur}`;
    thbPreview.innerHTML = `${icon('banknote', 'w-4 h-4')} THB: ${(net * rate).toFixed(2)} <span class="opacity-70">(${lang==='th' ? 'เรท' : 'rate'} ${rate})</span>`;
    queueIcons();
    renderSplitArea();
  }
  ['ex-subtotal','ex-discount','ex-service','ex-tax','ex-currency','ex-thb-rate'].forEach(id => document.getElementById(id).addEventListener('input', updateNet));
  updateNet();

  function renderSplitArea() {
    const area = document.getElementById('split-area');
    const sub = parseFloat(document.getElementById('ex-subtotal').value) || 0;
    const disc = parseFloat(document.getElementById('ex-discount').value) || 0;
    const serv = parseFloat(document.getElementById('ex-service').value) || 0;
    const tax = parseFloat(document.getElementById('ex-tax').value) || 0;
    const netTotal = sub - disc + serv + tax;
    const netMinor = Math.round(netTotal * 100);

    if (!members.length) { area.innerHTML = ''; allocations = []; return; }

    if (splitMethod === 'equal') {
      const count = members.length;
      const each = count ? netTotal / count : 0;
      area.innerHTML = members.map(m => `
        <div class="flex justify-between items-center text-sm p-2.5 rounded-xl gap-2" style="background: var(--bg-secondary);">
          <span class="flex items-center gap-2 min-w-0">
            <span class="avatar w-7 h-7 text-[10px]" style="background:${m.color || 'var(--primary)'};width:28px;height:28px;border-width:1.5px;">${m.photoURL ? `<img src="${escapeHtml(m.photoURL)}" class="w-full h-full rounded-full object-cover" alt="">` : escapeHtml(getInitials(m.displayName))}</span>
            <span class="truncate">${escapeHtml(m.displayName)}</span>
          </span>
          <span class="font-bold flex-shrink-0">${each.toFixed(2)}</span>
        </div>`).join('');
      allocations = members.map(m => ({ memberId: m.id, amountMinor: Math.floor(netMinor / members.length) }));
      let rem = netMinor - allocations.reduce((s, a) => s + a.amountMinor, 0);
      for (let i = 0; i < rem; i++) allocations[i % allocations.length].amountMinor += 1;
    } else {
      area.innerHTML = members.map(m => `
        <div class="flex gap-2 items-center">
          <span class="text-sm w-28 truncate flex-shrink-0">${escapeHtml(m.displayName)}</span>
          <input data-alloc="${m.id}" class="input flex-1" type="number" step="0.01" min="0" placeholder="0.00">
        </div>`).join('');
      area.innerHTML += `<p class="input-hint">${icon('info', 'w-3 h-3 inline')} ${lang==='th' ? 'ผลรวมต้องเท่ากับยอดสุทธิ' : 'Sum must equal the net total'}</p>`;
    }
    queueIcons();
  }

  appEl.querySelectorAll('[data-split]').forEach(btn => btn.addEventListener('click', () => {
    appEl.querySelectorAll('[data-split]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    splitMethod = btn.dataset.split;
    renderSplitArea();
  }));
  renderSplitArea();

  document.getElementById('cancel-expense').addEventListener('click', () => {
    if (history.length > 1) history.back();
    else location.hash = `#/trip/${tripId}/expenses`;
  });
  document.getElementById('expense-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = document.getElementById('submit-expense');
    submitBtn.disabled = true;
    const tLoad = toast.loading(lang==='th' ? 'กำลังบันทึก...' : 'Saving...');
    try {
      const subMinor = Math.round((parseFloat(document.getElementById('ex-subtotal').value) || 0) * 100);
      const discMinor = Math.round((parseFloat(document.getElementById('ex-discount').value) || 0) * 100);
      const servMinor = Math.round((parseFloat(document.getElementById('ex-service').value) || 0) * 100);
      const taxMinor = Math.round((parseFloat(document.getElementById('ex-tax').value) || 0) * 100);
      const thbRate = parseFloat(document.getElementById('ex-thb-rate').value) || 1;
      const isEstimated = document.getElementById('ex-type').value === 'estimated';
      const cur = document.getElementById('ex-currency').value;
      const net = (parseFloat(document.getElementById('ex-subtotal').value) || 0) - (parseFloat(document.getElementById('ex-discount').value) || 0) + (parseFloat(document.getElementById('ex-service').value) || 0) + (parseFloat(document.getElementById('ex-tax').value) || 0);

      if (splitMethod === 'unequal') {
        allocations = Array.from(appEl.querySelectorAll('[data-alloc]')).map(inp => ({ memberId: inp.dataset.alloc, amountMinor: Math.round((parseFloat(inp.value) || 0) * 100) }));
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
        baseCurrency: currentTrip?.baseCurrency || 'THB',
        payerId: selectedPayer,
        allocations,
        paymentMethod: 'cash',
        thbRate,
        thbMinor: Math.round(net * thbRate * 100),
        isEstimated,
        estimatedMinor: isEstimated ? Math.round(net * 100) : 0,
        actualMinor: isEstimated ? 0 : Math.round(net * 100)
      }, currentUser.uid);

      tLoad.close();
      toast.success(lang==='th' ? 'บันทึกค่าใช้จ่ายแล้ว' : 'Expense saved');
      location.hash = `#/trip/${tripId}/expenses`;
    } catch (err) { tLoad.close(); toast.error(err.message); submitBtn.disabled = false; }
  });
}

async function renderSettlement(params) {
  const tripId = params.tripId;
  await loadTrip(tripId);
  const lang = getLang();
  appEl.innerHTML = `
    <div class="page-enter">
      <div class="flex flex-wrap items-center justify-between gap-3 mb-5">
        <h1 class="page-title text-2xl font-bold"><span class="title-icon">${icon('hand-coins', 'w-5 h-5')}</span> ${t('settlement')}</h1>
        <button id="recalc-settle" class="btn btn-primary btn-sm">${icon('refresh-cw', 'w-4 h-4')} ${lang==='th' ? 'คำนวณใหม่' : 'Recalculate'}</button>
      </div>
      <div id="settlement-content" class="space-y-4"><div class="skeleton h-32"></div></div>
      <div class="card p-5 mt-6">
        <h3 class="font-bold mb-3 flex items-center gap-2">${icon('share-2', 'w-4 h-4')} Export</h3>
        <div class="btn-row">
          <button id="copy-line" class="btn btn-secondary btn-sm">${icon('message-circle', 'w-4 h-4')} ${lang==='th' ? 'คัดลอกส่ง LINE' : 'Copy for LINE'}</button>
          <button id="export-png" class="btn btn-secondary btn-sm">${icon('image', 'w-4 h-4')} PNG</button>
        </div>
      </div>
    </div>
  `;
  queueIcons();

  async function load() {
    const content = document.getElementById('settlement-content');
    try {
      const { expenses, members } = await fetchSettlementData(tripId);
      const membersMap = Object.fromEntries(members.map(m => [m.id, m]));
      const { balances, transactions } = calculateSettlement(expenses, members);
      if (!transactions.length) {
        content.innerHTML = `<div class="card p-4">${renderEmptyState({ icon: 'party-popper', title: t('noDebt'), desc: t('allCleared') })}</div>`;
        queueIcons();
        return;
      }
      content.innerHTML = `
        <div class="grid md:grid-cols-2 gap-4">
          <div class="card p-5">
            <h4 class="font-bold text-sm mb-4 flex items-center gap-2">${icon('scale', 'w-4 h-4')} ${t('balances')}</h4>
            <div class="space-y-1 stagger">
            ${balances.map(b => {
              const m = membersMap[b.memberId];
              const isMe = b.memberId === currentUser.uid;
              return `<div class="flex justify-between items-center text-sm py-2.5 border-b last:border-0 gap-2 ${isMe ? 'font-bold' : ''}" style="border-color:var(--border); ${isMe ? 'background:var(--primary-light); margin:0 -8px; padding:10px 8px; border-radius:12px;' : ''}">
                <div class="flex items-center gap-2 min-w-0">
                  <div class="w-8 h-8 rounded-full grid place-items-center text-xs font-bold text-white flex-shrink-0 overflow-hidden" style="background:${m?.color || 'var(--primary)'}">${m?.photoURL ? `<img src="${escapeHtml(m.photoURL)}" class="w-full h-full rounded-full object-cover" alt="">` : escapeHtml(getInitials(m?.displayName || ''))}</div>
                  <span class="truncate">${escapeHtml(m?.displayName || b.memberId.slice(0,6))} ${isMe ? (lang==='th' ? '(คุณ)' : '(you)') : ''}</span>
                </div>
                <span class="font-bold flex-shrink-0" style="color:${b.net >= 0 ? 'var(--success)' : 'var(--danger)'};">${formatCurrency(b.net, currentTrip?.baseCurrency || 'THB')}</span>
              </div>`;
            }).join('')}
            </div>
          </div>
          <div class="card p-5">
            <h4 class="font-bold text-sm mb-4 flex items-center gap-2">${icon('arrow-left-right', 'w-4 h-4')} ${t('transactions')} <span class="badge badge-planned text-[10px]">${transactions.length}</span></h4>
            <div class="space-y-3 stagger">${transactions.map(tx => {
              const from = membersMap[tx.from]; const to = membersMap[tx.to];
              return `<div class="flex items-center justify-between p-3 rounded-xl gap-2" style="background:var(--bg-secondary); border:1px solid var(--border);">
                <div class="flex items-center gap-2 min-w-0">
                  <span class="avatar w-8 h-8 text-[10px]" style="background:${from?.color || 'var(--primary)'};width:32px;height:32px;">${from?.photoURL ? `<img src="${escapeHtml(from.photoURL)}" class="w-full h-full rounded-full object-cover" alt="">` : escapeHtml(getInitials(from?.displayName || ''))}</span>
                  <span style="color:var(--text-tertiary);">${icon('arrow-right', 'w-4 h-4')}</span>
                  <span class="avatar w-8 h-8 text-[10px]" style="background:${to?.color || 'var(--primary)'};width:32px;height:32px;">${to?.photoURL ? `<img src="${escapeHtml(to.photoURL)}" class="w-full h-full rounded-full object-cover" alt="">` : escapeHtml(getInitials(to?.displayName || ''))}</span>
                  <span class="text-xs truncate">${escapeHtml(from?.displayName || '')} ${icon('arrow-right', 'w-3 h-3 inline')} ${escapeHtml(to?.displayName || '')}</span>
                </div>
                <div class="text-right flex-shrink-0"><div class="font-bold text-sm">${formatCurrency(tx.amountMinor, currentTrip?.baseCurrency || 'THB')}</div></div>
              </div>`;
            }).join('')}</div>
          </div>
        </div>
      `;
      queueIcons();
      document.getElementById('copy-line').addEventListener('click', async () => {
        const { copySettlementAsLineText } = await import('./exports/index.js');
        const text = copySettlementAsLineText(transactions, membersMap, currentTrip?.baseCurrency || 'THB');
        try {
          await navigator.clipboard.writeText(text);
          toast.success(lang==='th' ? 'คัดลอกข้อความสำหรับ LINE แล้ว' : 'Copied for LINE');
        } catch { toast.error(lang==='th' ? 'คัดลอกไม่สำเร็จ' : 'Copy failed'); }
      });
      document.getElementById('export-png').addEventListener('click', async () => {
        const tLoad = toast.loading('Exporting PNG...');
        try {
          const { exportToPng } = await import('./exports/index.js');
          await exportToPng('settlement-content', `settlement-${tripId}.png`);
          tLoad.close();
          toast.success(lang==='th' ? 'ส่งออก PNG แล้ว' : 'PNG exported');
        } catch (e) { tLoad.close(); toast.error(e.message); }
      });
    } catch (e) {
      console.error(e);
      content.innerHTML = `<div class="card p-5 text-center"><p class="text-sm font-semibold" style="color:var(--danger);">${escapeHtml(e.message)}</p><button id="settle-retry" class="btn btn-secondary btn-sm mt-3">${icon('refresh-cw', 'w-4 h-4')} ${lang==='th' ? 'ลองใหม่' : 'Retry'}</button></div>`;
      document.getElementById('settle-retry')?.addEventListener('click', load);
      queueIcons();
    }
  }
  document.getElementById('recalc-settle').addEventListener('click', async () => {
    const btn = document.getElementById('recalc-settle');
    btn.disabled = true;
    const tLoad = toast.loading(lang==='th' ? 'กำลังคำนวณ...' : 'Calculating...');
    try {
      await recalculateAndSaveSettlement(tripId, currentUser.uid);
      tLoad.close();
      toast.success(lang==='th' ? 'คำนวณยอดใหม่แล้ว' : 'Recalculated');
      load();
    } catch (e) { tLoad.close(); toast.error(e.message); }
    finally {
      btn.disabled = false;
      btn.innerHTML = `${icon('refresh-cw', 'w-4 h-4')} ${lang==='th' ? 'คำนวณใหม่' : 'Recalculate'}`;
      queueIcons();
    }
  });
  load();
}

async function renderMembers(params) {
  const tripId = params.tripId;
  await loadTrip(tripId);
  const lang = getLang();
  appEl.innerHTML = `
    <div class="page-enter">
      <div class="flex flex-wrap items-center justify-between gap-3 mb-5">
        <h1 class="page-title text-2xl font-bold"><span class="title-icon">${icon('users', 'w-5 h-5')}</span> ${t('members')}</h1>
        <button id="add-member-btn" class="btn btn-primary btn-sm">${icon('user-plus', 'w-4 h-4')} ${lang==='th' ? 'เพิ่มสมาชิก' : 'Add'}</button>
      </div>
      <div id="members-list" class="grid gap-3 stagger"></div>
    </div>
  `;
  queueIcons();

  const ROLE_ICONS = { super_admin: 'crown', trip_admin: 'shield-check', member: 'user', viewer: 'eye' };

  async function loadMembers() {
    const list = document.getElementById('members-list');
    list.innerHTML = `<div class="skeleton h-16"></div><div class="skeleton h-16"></div>`;
    try {
      const { getDocs, collection } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
      const snap = await getDocs(collection(db, `trips/${tripId}/members`));
      const members = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (!members.length) {
        list.innerHTML = renderEmptyState({ icon: 'users', title: lang==='th' ? 'ยังไม่มีสมาชิก' : 'No members', desc: lang==='th' ? 'เพิ่มสมาชิกเพื่อเริ่มหารค่าใช้จ่าย' : 'Add members to start splitting expenses' });
        queueIcons();
        return;
      }
      list.innerHTML = members.map(m => `
        <div class="card card-hover p-4 flex items-center justify-between gap-3">
          <div class="flex items-center gap-3 min-w-0">
            <div class="w-11 h-11 rounded-full grid place-items-center text-sm font-bold text-white flex-shrink-0 overflow-hidden" style="background:${m.color || 'var(--primary)'}">
              ${m.photoURL ? `<img src="${escapeHtml(m.photoURL)}" class="w-full h-full rounded-full object-cover" alt="">` : escapeHtml(getInitials(m.displayName))}
            </div>
            <div class="min-w-0">
              <div class="font-semibold text-sm flex items-center gap-2">
                <span class="truncate">${escapeHtml(m.displayName)}</span>
                ${m.id === currentUser.uid ? `<span class="text-[10px] px-2 py-0.5 rounded-full text-white flex-shrink-0" style="background:var(--gradient-primary);">${lang==='th' ? 'คุณ' : 'You'}</span>` : ''}
              </div>
              <div class="meta-line mt-0.5">${icon(m.status === 'disabled' ? 'user-x' : 'circle-check', 'w-3 h-3')} ${escapeHtml(m.status || 'active')}${m.username ? ` • ${icon('at-sign', 'w-3 h-3')} ${escapeHtml(m.username)}` : ''}</div>
            </div>
          </div>
          <span class="badge badge-planned flex-shrink-0">${icon(ROLE_ICONS[m.role] || 'user', 'w-3 h-3')} ${escapeHtml(m.role || 'member')}</span>
        </div>
      `).join('');
      queueIcons();
    } catch (e) {
      console.error(e);
      list.innerHTML = `<div class="card p-5 text-center"><p class="text-sm font-semibold" style="color:var(--danger);">${escapeHtml(e.message)}</p><button id="mem-retry" class="btn btn-secondary btn-sm mt-3">${icon('refresh-cw', 'w-4 h-4')} ${lang==='th' ? 'ลองใหม่' : 'Retry'}</button></div>`;
      document.getElementById('mem-retry')?.addEventListener('click', loadMembers);
      queueIcons();
    }
  }

  document.getElementById('add-member-btn').addEventListener('click', () => {
    const sheet = showBottomSheet(`
      <div class="flex items-center gap-3 mb-4">
        <div class="row-icon" style="width:40px;height:40px;border-radius:14px;background:var(--gradient-primary);color:#fff;">${icon('user-plus', 'w-5 h-5')}</div>
        <div>
          <h3 class="font-bold text-base leading-tight" style="font-family: var(--font-display);">${lang==='th' ? 'เพิ่มสมาชิก' : 'Add Member'}</h3>
          <p class="text-[11px] text-[var(--text-secondary)]">${lang==='th' ? 'สร้างบัญชี username + PIN ให้สมาชิก' : 'Create a username + PIN account'}</p>
        </div>
      </div>
      <form id="add-member-form" class="space-y-4">
        <div class="input-group"><label class="input-label">${icon('at-sign', 'w-3.5 h-3.5')} Username *</label><input id="m-user" class="input" required autocomplete="off" placeholder="fuji_user"></div>
        <div class="input-group"><label class="input-label">${icon('user', 'w-3.5 h-3.5')} Display Name *</label><input id="m-name" class="input" required autocomplete="off" placeholder="${lang==='th' ? 'ชื่อที่แสดง' : 'Display name'}"></div>
        <div class="input-group"><label class="input-label">${icon('lock-keyhole', 'w-3.5 h-3.5')} PIN (4–12) *</label><input id="m-pin" class="input" type="password" inputmode="numeric" required autocomplete="new-password"></div>
        <div class="input-group"><label class="input-label">${icon('image', 'w-3.5 h-3.5')} Photo URL <span class="text-[var(--text-tertiary)] font-normal">(${lang==='th' ? 'ไม่บังคับ' : 'optional'})</span></label><input id="m-photo" class="input" placeholder="https://..." autocomplete="off"></div>
        <div class="grid grid-cols-2 gap-3">
          <div class="input-group"><label class="input-label">${icon('palette', 'w-3.5 h-3.5')} ${lang==='th' ? 'สีประจำตัว' : 'Color'}</label><input id="m-color" type="color" value="#8bb89a" class="w-full h-11 rounded-xl cursor-pointer border" style="border-color:var(--border);"></div>
          <div class="input-group"><label class="input-label">${icon('shield', 'w-3.5 h-3.5')} Role</label><select id="m-role" class="input"><option value="member">Member</option><option value="trip_admin">Trip Admin</option><option value="viewer">Viewer</option></select></div>
        </div>
        <button type="submit" class="btn btn-primary w-full">${icon('user-plus', 'w-4 h-4')} ${t('add')}</button>
      </form>
    `);
    queueIcons();
    setTimeout(() => addPasswordToggle('m-pin'), 10);
    document.getElementById('add-member-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector('button[type="submit"]');
      if (!btn) return;
      btn.disabled = true;
      const tLoad = toast.loading(lang==='th' ? 'กำลังสร้างบัญชีสมาชิก...' : 'Creating member...');
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
        toast.success(lang==='th' ? 'สร้างสมาชิกแล้ว' : 'Member created');
        sheet.close();
        loadMembers();
      } catch (err) { tLoad.close(); toast.error(err.message); btn.disabled = false; }
    });
  });
  loadMembers();
}

async function renderDocuments(params) {
  const tripId = params.tripId;
  await loadTrip(tripId);
  const urlParams = new URLSearchParams(location.hash.split('?')[1] || '');
  const action = urlParams.get('action');
  const lang = getLang();

  const DOC_ICONS = { passport: 'contact', ticket: 'ticket', hotel: 'bed-double', insurance: 'shield-check', other: 'file-text' };
  const DOC_CATS = [
    { id: 'all', th: 'ทั้งหมด', en: 'All', icon: 'layout-grid' },
    { id: 'passport', th: 'พาสปอร์ต', en: 'Passport', icon: 'contact' },
    { id: 'ticket', th: 'ตั๋ว', en: 'Tickets', icon: 'ticket' },
    { id: 'hotel', th: 'โรงแรม', en: 'Hotel', icon: 'bed-double' },
    { id: 'insurance', th: 'ประกัน', en: 'Insurance', icon: 'shield-check' },
    { id: 'other', th: 'อื่นๆ', en: 'Other', icon: 'file-text' },
  ];

  appEl.innerHTML = `
    <div class="page-enter">
      <div class="flex flex-wrap items-center justify-between gap-3 mb-5">
        <h1 class="page-title text-2xl font-bold"><span class="title-icon">${icon('folder', 'w-5 h-5')}</span> ${lang === 'th' ? 'เอกสารสำคัญ' : 'Documents'}</h1>
        <button id="add-doc-btn" class="btn btn-primary btn-sm">${icon('plus', 'w-4 h-4')} ${lang === 'th' ? 'เพิ่มเอกสาร' : 'Add'}</button>
      </div>
      <div class="chip-row mb-4" id="doc-filters">
        ${DOC_CATS.map(c => `<button class="chip ${c.id === 'all' ? 'chip-active' : ''}" data-cat="${c.id}">${icon(c.icon, 'w-3.5 h-3.5')} ${lang === 'th' ? c.th : c.en}</button>`).join('')}
      </div>
      <div id="docs-list" class="grid gap-3 stagger"></div>
    </div>
  `;
  queueIcons();

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
    list.innerHTML = `<div class="skeleton h-20"></div><div class="skeleton h-20"></div>`;
    try {
      const { getDocs, collection, query, where } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
      // NOTE: deliberately avoids where()+orderBy() composites — those require a
      // Firestore composite index ("The query requires an index" error).
      // Equality-only query + client-side sorting needs NO index at all.
      let snap;
      try {
        if (selectedCat === 'all') {
          snap = await getDocs(collection(db, `trips/${tripId}/documents`));
        } else {
          snap = await getDocs(query(collection(db, `trips/${tripId}/documents`), where('category', '==', selectedCat)));
        }
      } catch (queryErr) {
        // Ultimate fallback: plain collection read, filter client-side
        console.warn('documents query fallback:', queryErr.message);
        snap = await getDocs(collection(db, `trips/${tripId}/documents`));
      }
      let docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (selectedCat !== 'all') docs = docs.filter(d => d.category === selectedCat);
      docs.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

      if (!docs.length) {
        list.innerHTML = `<div class="col-span-full">${renderEmptyState({
          icon: selectedCat === 'all' ? 'folder' : (DOC_ICONS[selectedCat] || 'file-text'),
          title: lang === 'th' ? 'ยังไม่มีเอกสาร' : 'No documents',
          desc: lang === 'th' ? 'เพิ่มพาสปอร์ต ตั๋ว โรงแรม หรือประกันไว้ที่นี่' : 'Add passports, tickets, hotel or insurance docs here',
          actionHtml: `<button id="empty-add-doc" class="btn btn-primary btn-sm mt-2">${icon('plus', 'w-4 h-4')} ${lang === 'th' ? 'เพิ่มเอกสาร' : 'Add document'}</button>`
        })}</div>`;
        document.getElementById('empty-add-doc')?.addEventListener('click', showAddDoc);
        queueIcons();
        return;
      }

      list.innerHTML = docs.map(doc => {
        const catIcon = DOC_ICONS[doc.category] || 'file-text';
        const catLabel = DOC_CATS.find(c => c.id === doc.category);
        const dateLabel = doc.createdAt
          ? formatDate(doc.createdAt.seconds ? new Date(doc.createdAt.seconds * 1000).toISOString().split('T')[0] : doc.createdAt, lang, currentTrip?.timezone)
          : '';
        return `
        <div class="card card-hover p-4">
          <div class="flex gap-3">
            <div class="row-icon" style="width:46px;height:46px;border-radius:14px;">${icon(catIcon, 'w-5 h-5')}</div>
            <div class="flex-1 min-w-0">
              <div class="flex items-start justify-between gap-2">
                <h3 class="font-semibold text-sm truncate">${escapeHtml(doc.title)}</h3>
                <span class="badge badge-planned text-[10px] flex-shrink-0">${icon(catIcon, 'w-3 h-3')} ${escapeHtml(catLabel ? (lang === 'th' ? catLabel.th : catLabel.en) : (doc.category || ''))}</span>
              </div>
              ${dateLabel ? `<p class="meta-line mt-1">${icon('calendar', 'w-3 h-3')} ${escapeHtml(dateLabel)}</p>` : ''}
              ${doc.description ? `<p class="text-xs mt-1 text-[var(--text-secondary)]">${escapeHtml(doc.description)}</p>` : ''}
              ${doc.fileUrl ? `<a href="${escapeHtml(doc.fileUrl)}" target="_blank" rel="noopener" class="inline-flex items-center gap-1 text-xs font-semibold mt-2" style="color: var(--primary-strong);">${icon('external-link', 'w-3.5 h-3.5')} ${lang === 'th' ? 'เปิดไฟล์' : 'Open file'}</a>` : ''}
              ${doc.imageUrl ? `<div class="mt-2 rounded-xl overflow-hidden border" style="border-color: var(--border);"><img src="${escapeHtml(doc.imageUrl)}" class="w-full h-36 object-cover" loading="lazy" onerror="this.parentElement.style.display='none'" alt=""></div>` : ''}
            </div>
          </div>
        </div>`;
      }).join('');
      queueIcons();
    } catch (e) {
      console.error('loadDocs failed', e);
      let msg = e?.message || String(e);
      if (msg.includes('index') || e?.code === 'failed-precondition') {
        msg = lang === 'th'
          ? 'ต้องสร้าง Firestore Index — รัน `firebase deploy --only firestore:indexes` หรือคลิกลิงก์ใน Console (เวอร์ชันใหม่นี้เลี่ยง index แล้ว กดรีเฟรชเพื่อโหลดใหม่)'
          : 'Firestore index required — deploy firestore:indexes (this version avoids it; refresh to reload)';
      }
      list.innerHTML = `<div class="card p-5 text-center"><p class="text-sm font-semibold" style="color:var(--danger);">${escapeHtml(msg)}</p><button id="docs-retry" class="btn btn-secondary btn-sm mt-3">${icon('refresh-cw', 'w-4 h-4')} ${lang === 'th' ? 'ลองใหม่' : 'Retry'}</button></div>`;
      document.getElementById('docs-retry')?.addEventListener('click', loadDocs);
      queueIcons();
    }
  }

  function showAddDoc() {
    const sheet = showBottomSheet(`
      <div class="flex items-center gap-3 mb-4">
        <div class="row-icon" style="width:40px;height:40px;border-radius:14px;background:var(--gradient-primary);color:#fff;">${icon('folder-plus', 'w-5 h-5')}</div>
        <div>
          <h3 class="font-bold text-base leading-tight" style="font-family: var(--font-display);">${lang === 'th' ? 'เพิ่มเอกสาร' : 'Add Document'}</h3>
          <p class="text-[11px] text-[var(--text-secondary)]">${lang === 'th' ? 'พาสปอร์ต ตั๋ว โรงแรม ประกัน และอื่นๆ' : 'Passport, tickets, hotel, insurance & more'}</p>
        </div>
      </div>
      <form id="doc-form" class="space-y-4">
        <div class="input-group"><label class="input-label">${icon('file-text', 'w-3.5 h-3.5')} ${lang === 'th' ? 'ชื่อเอกสาร' : 'Title'} *</label><input id="doc-title" class="input" required autocomplete="off" placeholder="${lang === 'th' ? 'เช่น พาสปอร์ตสมชาย' : 'e.g. Somchai Passport'}"></div>
        <div class="input-group">
          <label class="input-label">${icon('folder', 'w-3.5 h-3.5')} ${lang === 'th' ? 'หมวดหมู่' : 'Category'}</label>
          <select id="doc-cat" class="input">
            <option value="passport">${lang === 'th' ? 'พาสปอร์ต' : 'Passport'}</option>
            <option value="ticket">${lang === 'th' ? 'ตั๋ว' : 'Ticket'}</option>
            <option value="hotel">${lang === 'th' ? 'โรงแรม' : 'Hotel'}</option>
            <option value="insurance">${lang === 'th' ? 'ประกัน' : 'Insurance'}</option>
            <option value="other">${lang === 'th' ? 'อื่นๆ' : 'Other'}</option>
          </select>
        </div>
        <div class="input-group"><label class="input-label">${icon('align-left', 'w-3.5 h-3.5')} ${lang === 'th' ? 'รายละเอียด' : 'Description'}</label><textarea id="doc-desc" class="input" style="min-height:80px;"></textarea></div>
        <div class="input-group"><label class="input-label">${icon('link', 'w-3.5 h-3.5')} ${lang === 'th' ? 'ลิงก์ไฟล์' : 'File link'}</label><input id="doc-file-url" class="input" placeholder="https://..." autocomplete="off"></div>
        <div class="input-group">
          <label class="input-label">${icon('image', 'w-3.5 h-3.5')} ${lang === 'th' ? 'รูปภาพ (URL)' : 'Image (URL)'}</label>
          <input id="doc-image-url" class="input" placeholder="https://..." autocomplete="off">
          <div id="doc-img-preview" class="hidden mt-2 rounded-xl overflow-hidden border" style="border-color: var(--border);"><img id="doc-preview-img" class="w-full h-32 object-cover" alt=""></div>
        </div>
        <button type="submit" class="btn btn-primary w-full">${icon('save', 'w-4 h-4')} ${t('save')}</button>
      </form>
    `);
    queueIcons();

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
      const btn = e.target.querySelector('button[type="submit"]');
      if (!btn) return;
      btn.disabled = true;
      const tLoad = toast.loading(lang === 'th' ? 'กำลังบันทึก...' : 'Saving...');
      try {
        const { addDoc, collection, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
        await addDoc(collection(db, `trips/${tripId}/documents`), {
          title: document.getElementById('doc-title').value.trim(),
          category: document.getElementById('doc-cat').value,
          description: document.getElementById('doc-desc').value.trim(),
          fileUrl: document.getElementById('doc-file-url').value.trim(),
          imageUrl: document.getElementById('doc-image-url').value.trim(),
          createdBy: currentUser.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        tLoad.close();
        toast.success(lang === 'th' ? 'บันทึกเอกสารแล้ว' : 'Document saved');
        sheet.close();
        loadDocs();
      } catch (err) {
        tLoad.close();
        toast.error(err.message);
        btn.disabled = false;
      }
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
      <h1 class="page-title text-2xl font-bold"><span class="title-icon">${icon('package', 'w-5 h-5')}</span> ${t('importExport')}</h1>
      <div class="card card-accent p-6 space-y-4">
        <h3 class="font-bold flex items-center gap-2">${icon('file-down', 'w-4 h-4')} ${lang==='th' ? 'ดาวน์โหลดเทมเพลต' : 'Download Template'}</h3>
        <div class="btn-row">
          <button data-tpl="csv" class="btn btn-secondary btn-sm">${icon('file-spreadsheet', 'w-4 h-4')} CSV</button>
          <button data-tpl="xlsx" class="btn btn-secondary btn-sm">${icon('table', 'w-4 h-4')} XLSX</button>
          <button data-tpl="json" class="btn btn-secondary btn-sm">${icon('file-json', 'w-4 h-4')} JSON</button>
        </div>
      </div>
      <div class="card p-6 space-y-4">
        <h3 class="font-bold flex items-center gap-2">${icon('upload', 'w-4 h-4')} ${lang==='th' ? 'อัปโหลดไฟล์' : 'Upload File'}</h3>
        <input id="import-file" type="file" accept=".csv,.xlsx,.xls,.json" class="input">
        <div id="import-preview" class="text-sm"></div>
        <div class="btn-row">
          <button id="validate-import" class="btn btn-secondary">${icon('scan-search', 'w-4 h-4')} ${lang==='th' ? 'ตรวจสอบไฟล์' : 'Validate'}</button>
          <button id="do-import" class="btn btn-primary" disabled>${icon('download', 'w-4 h-4')} Import</button>
        </div>
      </div>
      <div class="card p-6 space-y-4">
        <h3 class="font-bold flex items-center gap-2">${icon('download', 'w-4 h-4')} Export</h3>
        <div class="btn-row">
          <button id="exp-itinerary" class="btn btn-secondary btn-sm">${icon('image', 'w-4 h-4')} Itinerary PNG</button>
          <button id="exp-expenses-json" class="btn btn-secondary btn-sm">${icon('file-json', 'w-4 h-4')} Expenses JSON</button>
        </div>
      </div>
    </div>
  `;
  queueIcons();

  appEl.querySelectorAll('[data-tpl]').forEach(btn => btn.addEventListener('click', async () => {
    const tLoad = toast.loading(lang==='th' ? 'กำลังเตรียมไฟล์...' : 'Preparing file...');
    try {
      const { downloadTemplate } = await import('./imports/index.js');
      await downloadTemplate(btn.dataset.tpl);
      tLoad.close();
      toast.success(lang==='th' ? 'ดาวน์โหลดเทมเพลตแล้ว' : 'Template downloaded');
    } catch (e) { tLoad.close(); toast.error(e.message); }
  }));

  let parsedRows = null;
  document.getElementById('validate-import').addEventListener('click', async () => {
    const file = document.getElementById('import-file').files[0];
    if (!file) return toast.warning(lang==='th' ? 'เลือกไฟล์ก่อน' : 'Select a file first');
    const btn = document.getElementById('validate-import');
    btn.disabled = true;
    const tLoad = toast.loading(lang==='th' ? 'กำลังอ่านไฟล์...' : 'Reading file...');
    try {
      const { parseImportFile, validateItineraryImportRows } = await import('./imports/index.js');
      const rows = await parseImportFile(file);
      const { validRows, errors } = validateItineraryImportRows(Array.isArray(rows) ? rows : [rows]);
      parsedRows = validRows;
      document.getElementById('import-preview').innerHTML = `
        <div class="flex items-center gap-3 flex-wrap">
          <span class="badge badge-completed">${icon('check', 'w-3 h-3')} ${validRows.length} valid</span>
          ${errors.length ? `<span class="badge badge-cancelled">${icon('x', 'w-3 h-3')} ${errors.length} errors</span>` : ''}
        </div>
        ${errors.length ? `<pre class="mt-2 p-2 rounded-xl text-xs overflow-auto" style="background:var(--bg-secondary);">${escapeHtml(JSON.stringify(errors.slice(0,5), null, 2))}</pre>` : ''}`;
      document.getElementById('do-import').disabled = validRows.length === 0;
      tLoad.close();
      if (errors.length) toast.warning(`${errors.length} errors`);
      else toast.success(`${lang==='th' ? 'พร้อมนำเข้า' : 'Ready to import'} ${validRows.length} rows`);
      queueIcons();
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
      toast.success(`${lang==='th' ? 'นำเข้าแล้ว' : 'Imported'} ${items.length} ${lang==='th' ? 'รายการ' : 'items'}`);
      location.hash = `#/trip/${tripId}/itinerary`;
    } catch (e) { tLoad.close(); toast.error(e.message); } finally { btn.disabled = false; }
  });

  document.getElementById('exp-itinerary').addEventListener('click', async () => {
    location.hash = `#/trip/${tripId}/itinerary`;
    setTimeout(() => toast.info(lang==='th' ? 'กดปุ่ม PNG ที่หน้าแผนการเดินทาง' : 'Use the PNG button on the itinerary page'), 500);
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
      toast.success(lang==='th' ? 'ส่งออก JSON แล้ว' : 'JSON exported');
    } catch (e) { tLoad.close(); toast.error(e.message); }
  });
}

async function renderSettings(params) {
  const tripId = params.tripId;
  await loadTrip(tripId);
  const lang = getLang();
  const currentColor = localStorage.getItem('fuji_color_theme') || 'sage';
  const mode = getStoredMode();

  const currencies = [
    { code: 'THB', name: lang==='th' ? 'บาทไทย' : 'Thai Baht' },
    { code: 'JPY', name: lang==='th' ? 'เยนญี่ปุ่น' : 'Japanese Yen' },
    { code: 'USD', name: lang==='th' ? 'ดอลลาร์สหรัฐ' : 'US Dollar' },
    { code: 'EUR', name: 'ยูโร / Euro' },
    { code: 'KRW', name: lang==='th' ? 'วอนเกาหลี' : 'Korean Won' },
    { code: 'SGD', name: lang==='th' ? 'ดอลลาร์สิงคโปร์' : 'Singapore Dollar' },
    { code: 'GBP', name: lang==='th' ? 'ปอนด์' : 'Pound' },
    { code: 'CNY', name: lang==='th' ? 'หยวนจีน' : 'Chinese Yuan' },
    { code: 'HKD', name: lang==='th' ? 'ดอลลาร์ฮ่องกง' : 'HK Dollar' },
    { code: 'AUD', name: lang==='th' ? 'ดอลลาร์ออสเตรเลีย' : 'AU Dollar' },
  ];

  const timezones = [
    'Asia/Bangkok', 'Asia/Tokyo', 'Asia/Seoul', 'Asia/Singapore', 'Asia/Hong_Kong',
    'Asia/Shanghai', 'Asia/Taipei', 'Asia/Manila', 'Asia/Jakarta', 'Asia/Kuala_Lumpur',
    'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'America/New_York', 'America/Los_Angeles', 'Australia/Sydney', 'UTC'
  ];

  const pastels = themes.filter(th => th.type !== 'gradient');
  const gradients = themes.filter(th => th.type === 'gradient');

  appEl.innerHTML = `
    <div class="page-enter max-w-[640px] mx-auto space-y-6">
      <h1 class="page-title text-2xl font-bold"><span class="title-icon">${icon('settings', 'w-5 h-5')}</span> ${t('settings')}</h1>

      <div class="card card-accent p-6 space-y-4">
        <h3 class="font-bold flex items-center gap-2">${icon('compass', 'w-4 h-4')} ${lang==='th' ? 'ข้อมูลทริป' : 'Trip details'}</h3>
        <div class="input-group"><label class="input-label">${icon('sparkles', 'w-3.5 h-3.5')} ${t('tripName')}</label><input id="s-name" class="input" value="${escapeHtml(currentTrip?.name || '')}"></div>
        <div class="grid grid-cols-2 gap-3">
          <div class="input-group">
            <label class="input-label">${icon('banknote', 'w-3.5 h-3.5')} ${t('baseCurrency')}</label>
            <select id="s-currency" class="input">
              ${currencies.map(c => `<option value="${c.code}" ${currentTrip?.baseCurrency===c.code?'selected':''}>${c.code} — ${c.name}</option>`).join('')}
            </select>
          </div>
          <div class="input-group">
            <label class="input-label">${icon('clock', 'w-3.5 h-3.5')} ${t('timezone')}</label>
            <select id="s-tz" class="input">
              ${timezones.map(tz => `<option value="${tz}" ${currentTrip?.timezone===tz?'selected':''}>${tz.replace('_',' ')}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div class="input-group"><label class="input-label">${icon('arrow-left-right', 'w-3.5 h-3.5')} ${lang==='th' ? 'เรทแลกเป็น THB' : 'Rate to THB'}</label><input id="s-thb-rate" class="input" type="number" step="0.0001" value="${currentTrip?.exchangeRateToTHB || 1}"><p class="input-hint">1 ${currentTrip?.baseCurrency || 'THB'} = ? THB</p></div>
          <div class="input-group"><label class="input-label">${icon('piggy-bank', 'w-3.5 h-3.5')} ${lang==='th' ? 'งบประมาณรวม' : 'Total budget'}</label><input id="s-budget-total" class="input" type="number" step="0.01" value="${currentTrip?.budgetTotal ? (currentTrip.budgetTotal/100) : ''}" placeholder="50000"><p class="input-hint">THB</p></div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div class="input-group"><label class="input-label">${icon('user', 'w-3.5 h-3.5')} ${lang==='th' ? 'งบต่อคน' : 'Budget / person'}</label><input id="s-budget-per-person" class="input" type="number" step="0.01" value="${currentTrip?.budgetPerPerson ? (currentTrip.budgetPerPerson/100) : ''}" placeholder="10000"></div>
          <div class="input-group"><label class="input-label">${icon('list-checks', 'w-3.5 h-3.5')} ${lang==='th' ? 'ประเภทงบ' : 'Budget type'}</label><select id="s-budget-type" class="input"><option value="total" ${currentTrip?.budgetType==='total'?'selected':''}>${lang==='th' ? 'รวม' : 'Total'}</option><option value="per_person" ${currentTrip?.budgetType==='per_person'?'selected':''}>${lang==='th' ? 'ต่อคน' : 'Per person'}</option></select></div>
        </div>
        <div id="budget-compare" class="p-3 rounded-xl text-sm border" style="background: var(--bg-secondary); border-color: var(--border);"><div class="skeleton h-4"></div></div>
        <button id="save-settings" class="btn btn-primary w-full">${icon('save', 'w-4 h-4')} ${t('save')}</button>
      </div>

      <div class="card p-6 space-y-4">
        <h3 class="font-bold flex items-center gap-2">${icon('palette', 'w-4 h-4')} ${t('theme')}</h3>
        <div class="theme-section-title" style="margin-top:4px;">${icon('leaf', 'w-3.5 h-3.5')} Pastel</div>
        <div class="theme-grid" id="settings-themes-pastel">
          ${pastels.map(th => themeSwatchHtml(th, currentColor)).join('')}
        </div>
        <div class="theme-section-title">${icon('sparkles', 'w-3.5 h-3.5')} Gradient</div>
        <div class="theme-grid" id="settings-themes-gradient">
          ${gradients.map(th => themeSwatchHtml(th, currentColor)).join('')}
        </div>
        <div class="theme-section-title">${icon('contrast', 'w-3.5 h-3.5')} ${lang==='th' ? 'โหมดการแสดงผล' : 'Appearance'}</div>
        <div class="mode-grid" id="settings-modes">
          <button class="mode-option ${mode === 'light' ? 'active' : ''}" data-mode="light">${icon('sun', 'w-5 h-5')} ${lang==='th' ? 'สว่าง' : 'Light'}</button>
          <button class="mode-option ${mode === 'dark' ? 'active' : ''}" data-mode="dark">${icon('moon', 'w-5 h-5')} ${lang==='th' ? 'มืด' : 'Dark'}</button>
          <button class="mode-option ${mode === 'auto' ? 'active' : ''}" data-mode="auto">${icon('monitor', 'w-5 h-5')} Auto</button>
        </div>
        <div class="flex gap-2 pt-2">
          <button id="lang-switch" class="btn btn-secondary flex-1 btn-sm">${icon('languages', 'w-4 h-4')} ${lang==='th' ? 'English' : 'ภาษาไทย'}</button>
        </div>
      </div>

      <div class="card p-6" style="border-color: color-mix(in srgb, var(--danger) 35%, var(--border));">
        <h3 class="font-bold mb-2 flex items-center gap-2" style="color:var(--danger);">${icon('alert-triangle', 'w-4 h-4')} Danger Zone</h3>
        <p class="text-xs text-[var(--text-secondary)] mb-3">${lang==='th' ? 'เปลี่ยนสถานะทริป: draft → active → completed → archived' : 'Change trip status: draft → active → completed → archived'}</p>
        <select id="trip-status" class="input mb-3">
          <option value="draft" ${currentTrip?.status==='draft'?'selected':''}>Draft</option>
          <option value="active" ${currentTrip?.status==='active'?'selected':''}>Active</option>
          <option value="completed" ${currentTrip?.status==='completed'?'selected':''}>Completed</option>
          <option value="archived" ${currentTrip?.status==='archived'?'selected':''}>Archived</option>
        </select>
        <button id="change-status" class="btn btn-danger w-full">${icon('flag', 'w-4 h-4')} ${lang==='th' ? 'เปลี่ยนสถานะ' : 'Change Status'}</button>
      </div>
    </div>
  `;
  queueIcons();

  async function updateBudgetCompare() {
    try {
      const { expenses } = await fetchSettlementData(tripId);
      const totalMinor = expenses.reduce((s, e) => s + (e.netTotalMinor || 0), 0);
      const budgetTotal = parseFloat(document.getElementById('s-budget-total').value) || 0;
      const budgetPerPerson = parseFloat(document.getElementById('s-budget-per-person').value) || 0;
      let html = `<div class="flex items-center gap-2">${icon('wallet', 'w-4 h-4')} <span>${lang==='th' ? 'ใช้ไป' : 'Spent'}: <b>${formatCurrency(totalMinor, currentTrip?.baseCurrency || 'THB')}</b></span></div>`;
      if (budgetTotal) {
        const diff = budgetTotal * 100 - totalMinor;
        const pct = Math.min(100, Math.round(totalMinor / (budgetTotal * 100) * 100));
        html += `<div class="flex items-center gap-2 mt-2">${icon('pie-chart', 'w-4 h-4')} <span>${lang==='th' ? 'งบรวม' : 'Budget'} ${budgetTotal.toLocaleString()} THB • ${diff >= 0 ? (lang==='th' ? `เหลือ ${formatCurrency(diff, 'THB')}` : `${formatCurrency(diff, 'THB')} left`) : (lang==='th' ? `เกิน ${formatCurrency(-diff, 'THB')}` : `${formatCurrency(-diff, 'THB')} over`)} (${pct}%)</span></div><div class="progress mt-2"><div class="progress-bar" style="width:${pct}%; ${diff < 0 ? 'background: var(--danger);' : ''}"></div></div>`;
      }
      if (budgetPerPerson) {
        html += `<div class="flex items-center gap-2 mt-2">${icon('user', 'w-4 h-4')} <span>${lang==='th' ? 'งบต่อคน' : 'Per person'} ${budgetPerPerson.toLocaleString()} THB</span></div>`;
      }
      document.getElementById('budget-compare').innerHTML = html;
      queueIcons();
    } catch {
      document.getElementById('budget-compare').innerHTML = `<span class="text-xs text-[var(--text-tertiary)]">${lang==='th' ? 'โหลดข้อมูลค่าใช้จ่ายไม่สำเร็จ' : 'Could not load expense data'}</span>`;
    }
  }
  updateBudgetCompare();
  document.getElementById('s-budget-total').addEventListener('input', updateBudgetCompare);
  document.getElementById('s-budget-per-person').addEventListener('input', updateBudgetCompare);

  document.getElementById('save-settings').addEventListener('click', async () => {
    const btn = document.getElementById('save-settings');
    btn.disabled = true;
    const tLoad = toast.loading(lang==='th' ? 'กำลังบันทึก...' : 'Saving...');
    try {
      const { updateTrip } = await import('./trips/index.js');
      await updateTrip(tripId, {
        name: document.getElementById('s-name').value,
        baseCurrency: document.getElementById('s-currency').value,
        timezone: document.getElementById('s-tz').value,
        exchangeRateToTHB: parseFloat(document.getElementById('s-thb-rate').value) || 1,
        budgetTotal: Math.round((parseFloat(document.getElementById('s-budget-total').value) || 0) * 100),
        budgetPerPerson: Math.round((parseFloat(document.getElementById('s-budget-per-person').value) || 0) * 100),
        budgetType: document.getElementById('s-budget-type').value
      });
      tLoad.close();
      toast.success(lang==='th' ? 'บันทึกการตั้งค่าแล้ว' : 'Settings saved');
      await loadTrip(tripId);
    } catch (e) { tLoad.close(); toast.error(e.message); } finally { btn.disabled = false; }
  });

  document.querySelectorAll('.theme-option').forEach(btn => {
    btn.addEventListener('click', () => {
      applyTheme(btn.dataset.theme);
      document.querySelectorAll('.theme-option').forEach(b => b.classList.remove('active'));
      document.querySelectorAll(`.theme-option[data-theme="${btn.dataset.theme}"]`).forEach(b => b.classList.add('active'));
      const th = themes.find(x => x.id === btn.dataset.theme);
      toast.success(th ? `${th.name} • ${th.desc || ''}` : btn.dataset.theme);
      renderDesktopNav();
    });
  });
  document.querySelectorAll('#settings-modes .mode-option').forEach(btn => {
    btn.addEventListener('click', () => {
      applyMode(btn.dataset.mode);
      document.querySelectorAll('#settings-modes .mode-option').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
  document.getElementById('lang-switch').addEventListener('click', () => {
    const newLang = lang === 'th' ? 'en' : 'th';
    setLang(newLang);
    toast.success(newLang === 'th' ? 'ภาษาไทย' : 'English');
    renderSettings(params);
    renderDesktopNav();
    updateBottomNav();
  });
  document.getElementById('change-status').addEventListener('click', async () => {
    const status = document.getElementById('trip-status').value;
    const btn = document.getElementById('change-status');
    btn.disabled = true;
    const tLoad = toast.loading(lang==='th' ? 'กำลังเปลี่ยนสถานะ...' : 'Changing status...');
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
  const menuItems = [
    { href: '#/trips', icon: 'compass', label: lang==='th' ? 'สลับทริป / ทริปทั้งหมด' : 'Switch trip / All trips', highlight: true },
    { href: `#/trip/${tripId}/dashboard`, icon: 'layout-dashboard', label: t('dashboard') },
    { href: `#/trip/${tripId}/settlement`, icon: 'hand-coins', label: t('settlement') },
    { href: `#/trip/${tripId}/members`, icon: 'users', label: t('members') },
    { href: `#/trip/${tripId}/documents`, icon: 'folder', label: lang==='th' ? 'เอกสารสำคัญ' : 'Documents' },
    { href: `#/trip/${tripId}/import`, icon: 'package', label: t('importExport') },
    { href: `#/trip/${tripId}/settings`, icon: 'settings', label: t('settings') },
  ];
  appEl.innerHTML = `
    <div class="page-enter max-w-[640px] mx-auto space-y-4">
      <h1 class="page-title text-2xl font-bold"><span class="title-icon">${icon('more-horizontal', 'w-5 h-5')}</span> ${t('more')}</h1>
      <div class="grid gap-3 stagger">
        ${menuItems.map(m => `
          <a href="${m.href}" class="card card-hover p-4 flex items-center justify-between gap-3 group" style="text-decoration:none; color:inherit; ${m.highlight ? 'border-color: color-mix(in srgb, var(--primary-raw) 45%, var(--border));' : ''}">
            <span class="flex items-center gap-3 min-w-0">
              <span class="row-icon" ${m.highlight ? 'style="background:var(--gradient-primary);color:#fff;"' : ''}>${icon(m.icon, 'w-4 h-4')}</span>
              <span class="font-semibold text-sm truncate">${m.label}</span>
            </span>
            <span class="text-[var(--text-tertiary)] group-hover:translate-x-0.5 transition-transform">${icon('chevron-right', 'w-4 h-4')}</span>
          </a>
        `).join('')}
        <button id="logout-more" class="card p-4 w-full flex items-center justify-between gap-3" style="text-decoration:none; border-color: color-mix(in srgb, var(--danger) 40%, var(--border)); background: var(--danger-bg);">
          <span class="flex items-center gap-3" style="color: var(--danger);">
            <span class="row-icon" style="background: transparent; color: var(--danger);">${icon('log-out', 'w-4 h-4')}</span>
            <span class="font-semibold text-sm">${t('logout')}</span>
          </span>
          <span style="color: var(--danger);">${icon('chevron-right', 'w-4 h-4')}</span>
        </button>
      </div>
      <div class="card p-4 mt-6">
        <h4 class="font-bold text-sm mb-1 flex items-center gap-2"><span class="row-icon" style="width:28px;height:28px;border-radius:9px;">${icon('user', 'w-3.5 h-3.5')}</span> ${escapeHtml(currentUser?.displayName || currentUser?.email || 'User')}</h4>
        <p class="text-xs text-[var(--text-secondary)]">${escapeHtml(currentUser?.email || '')}</p>
        <p class="text-[10px] text-[var(--text-tertiary)] mt-1 font-mono">UID: ${escapeHtml(currentUser?.uid?.slice(0,12) || '')}...</p>
      </div>
      <p class="text-center text-[10px] text-[var(--text-tertiary)]">${icon('info', 'w-3 h-3 inline')} ${lang==='th' ? 'แตะโลโก้ Fuji Planner มุมซ้ายบน เพื่อไปหน้ารายการทริป' : 'Tap the Fuji Planner logo (top-left) to reach your trips'}</p>
    </div>
  `;
  document.getElementById('logout-more').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    await doLogout();
  });
  queueIcons();
}

window.addEventListener('load', () => { if (window.lucide) lucide.createIcons(); });
window.addEventListener('langchange', () => { renderDesktopNav(); updateBottomNav(); });
window.addEventListener('error', (e) => console.error('Global error', e));
window.addEventListener('unhandledrejection', (e) => { console.error('Unhandled', e); toast.error(e.reason?.message || 'Error'); });
