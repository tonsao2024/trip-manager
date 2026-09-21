import { bindMoneyInputs } from './utils/moneyInput.js';
import { expensePayments, validatePayments } from './utils/payments.js';
import { auth, db, isFirebaseConfigured, onAuthStateChanged, syncState } from './firebase.js';
import { Router } from './router.js';
import { toast } from './components/toast.js';
import { renderFujiMascot, renderEmptyState } from './components/fuji.js';
import { loginAdmin, logout, hasStepUpSession } from './auth/index.js';
import { getMemberSession, clearMemberSession } from './auth/memberAuth.js';
import { runSystemDiagnostics, formatDiagnosticsReport, DIAG } from './utils/diagnostics.js';
import { listTrips, getTrip, createTrip, updateTrip, deleteTrip, duplicateTrip, uploadCoverImage, clearTripsCache, clearAllDataCache, regenerateInviteCode } from './trips/index.js';
import {
  signInWithGoogle, completeRedirectSignIn, signUpEmailAccount, sendAccountPasswordReset,
  ensureUserProfile, findProfileByEmail
} from './auth/accountAuth.js';
import {
  findTripByInviteCode, requestToJoin, listJoinRequests, listMyJoinRequests,
  approveJoinRequest, rejectJoinRequest, cancelJoinRequest, addMemberFromProfile
} from './members/join.js';
import { formatInviteCode, isValidInviteCode, normalizeInviteCode } from './utils/invite.js';
import {
  isPermissionError, joinPermissionHelp, adminHelpMessage, fetchRulesText,
  consoleRulesUrl, consoleAuthUrl
} from './utils/rulesHelper.js';
import { fetchItinerary, saveItineraryItem, deleteItineraryItem, reorderItinerary, getItineraryItem, syncItineraryExpense, findLinkedExpense } from './itinerary/index.js';
import {
  fetchExpenses, fetchAllExpenses, addExpense, updateExpense, deleteExpense,
  voidExpense, getExpense, exportExpensesToJson, sumExpenses
} from './expenses/index.js';
import { fetchSettlementData, recalculateAndSaveSettlement } from './settlement/index.js';

import { listMembers, createMember, updateMember, deleteMember, countMemberReferences, mapFunctionError, MEMBER_ROLES } from './members/index.js';
import { dayjs, getCurrentTimes, formatDate, formatTime, formatDuration, getTripDays, determineUpNextDay, parseDurationInput } from './utils/date.js';
import { expensesInThb, convertCurrency, formatCurrency, formatAmount, parseCurrencyInput, moneyHtml, thbPlusLabelHtml, origTextChipHtml, getCurrencyDecimals, toMinor, fromMinor, calculateNetTotal, toThbMinor, resolveTripThbRate, rememberThbRate } from './utils/currency.js';
import { calculateSettlement, buildSettlementStatements, transactionSources, cardSummary, pendingPayerExpenses } from './utils/settlement.js';
import { splitCustom, splitEqual } from './utils/split.js';
import { escapeHtml } from './utils/sanitize.js';
import { showBottomSheet, showModal } from './components/modal.js';
import { confirmAction, promptAction } from './components/confirm.js';
import { mountCountdown, computeCountdown, countdownHeadline } from './components/countdown.js';
import { initReveal, countUp, confetti, celebrateFrom, restagger } from './components/effects.js';
import { resolvePermissions, clearPermissionsCache } from './utils/permissions.js';
import { renderPageScene } from './components/scenes.js';
import { listNotes, createNote, updateNote, deleteNote, NOTE_COLORS, noteColorHex, setNoteArchived, localArchivedIds } from './notes/index.js';
import { googleMapsPlaceUrl, googleMapsDirectionsUrl, BASE_LAYERS, setMapLayer, getStoredLayerId } from './maps/index.js';
import {
  EXPENSE_CATEGORIES, CATEGORY_ICONS, categoryLabel, categoryIcon, categoryColor,
  ITINERARY_CATEGORIES, ITINERARY_STATUSES, normalizeCategory,
  getAllExpenseCategories, getCategoryDef, isCustomCategory, setCustomCategories
} from './utils/categories.js';
import {
  loadTripCategories, saveCategory, deleteCategory, countCategoryUsage,
  localCategoryPending, categoriesLoadDenied,
  CATEGORY_ICON_CHOICES, CATEGORY_COLOR_CHOICES
} from './categories/index.js';
import {
  exportWorkbookFile, readSpreadsheet, importItineraryRows, importExpenseRows,
  downloadItineraryTemplate, downloadExpensesTemplate, exportCsvFile,
  ITINERARY_COLUMNS, EXPENSE_COLUMNS, itineraryItemToRow, expenseToRow
} from './utils/excel.js';
import { parseCoordinates, getInitials, compressImage } from './utils/helpers.js';
import { suggestCards, rememberCard, uploadReceiptImage, tripCards, upsertTripCard, removeTripCard, tripCardLabel, newCardId } from './utils/cards.js';
import { expandStayItems, stayNights, dayEstimateAmount } from './utils/stays.js';
import { moodFaceHtml, budgetMood, balanceMood, estimateMood } from './components/moodface.js';
import { schematicMap, parseLatLng } from './exports/itineraryMap.js';
import { listComments, addComment, deleteComment, commentsByExpense, commentsPending } from './comments/index.js';
import { logActivity, listActivity, activityLabel, activityIcon, lastEditorText, deleteActivityEntries } from './utils/activity.js';
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

/* ================================================================== *
 * Comments — members question a bill from the expense list or from the
 * settlement receipts; the sheet is shared by both pages.
 * ================================================================== */

/** The signed-in user in the shape the comment/activity log expects. */
function actor() {
  return {
    uid: currentUser?.uid || '',
    displayName: currentUserDisplayName() || currentUser?.email || '',
    email: currentUser?.email || '',
    photoURL: currentUser?.photoURL || ''
  };
}

function currentUserDisplayName() {
  const member = currentTripMembers?.find?.(m => m.id === currentUser?.uid);
  return member?.displayName || currentUser?.displayName || '';
}

let currentTripMembers = [];

/** Stamp a moment from a Firestore timestamp / Date / seconds. */
function fmtWhen(stamp, lang = getLang()) {
  const seconds = stamp?.seconds ?? (stamp instanceof Date ? stamp.getTime() / 1000 : Number(stamp) || 0);
  if (!seconds) return '';
  const d = new Date(seconds * 1000);
  const diffMin = Math.round((Date.now() - d.getTime()) / 60000);
  if (diffMin < 1) return lang === 'th' ? 'เมื่อสักครู่' : 'just now';
  if (diffMin < 60) return lang === 'th' ? `${diffMin} นาทีที่แล้ว` : `${diffMin} min ago`;
  if (diffMin < 60 * 24 * 7) {
    const h = Math.round(diffMin / 60);
    return lang === 'th' ? `${h} ชม. ที่แล้ว` : `${h} h ago`;
  }
  return d.toLocaleString(lang === 'th' ? 'th-TH' : 'en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/** "💬 2" badge used on expense rows / receipt lines. */
function commentChip(count, extraClass = '') {
  if (!count) return '';
  return `<span class="comment-chip ${extraClass}">${icon('message-square', 'w-2.5 h-2.5')} ${count}</span>`;
}

/**
 * Comment sheet for one expense (used from the expense list AND the receipts).
 * @param {{tripId:string, expenseId:string, title?:string, amount?:string,
 *          comments?:Array, onChanged?:Function, canDeleteAny?:boolean}} options
 */
function openCommentSheet({ tripId, expenseId, title = '', amount = '', comments = [], onChanged = null, canDeleteAny = false }) {
  const lang = getLang();
  const th = (a, b) => (lang === 'th' ? a : b);
  let items = comments.filter(c => c.expenseId === expenseId);
  const me = actor();

  const rowHtml = (c) => `
    <div class="comment-row" data-comment-row="${c.id}">
      <div class="avatar" style="width:28px;height:28px;font-size:11px;background:${escapeHtml(c.color || 'var(--primary)')};">
        ${c.photoURL ? `<img src="${escapeHtml(c.photoURL)}" class="w-full h-full rounded-full object-cover" alt="">` : escapeHtml(getInitials(c.name || '?'))}
      </div>
      <div class="min-w-0 flex-1">
        <div class="comment-head">
          <b>${escapeHtml(c.name || '—')}</b>
          <span>${escapeHtml(fmtWhen(c.createdAt, lang))}</span>
          ${c.pending ? `<span class="badge badge-current text-[9px]">${th('ในเครื่องนี้','on device')}</span>` : ''}
          ${(canDeleteAny || c.uid === me.uid) ? `<button class="comment-del" data-comment-del="${c.id}" title="${t('delete')}">${icon('trash-2', 'w-3 h-3')}</button>` : ''}
        </div>
        <div class="comment-text">${escapeHtml(c.text)}</div>
      </div>
    </div>`;

  const sheet = showBottomSheet(`
    <div class="space-y-3">
      <div class="flex items-start gap-3">
        <div class="row-icon" style="width:40px;height:40px;border-radius:14px;background:var(--info-light);color:var(--info);">${icon('message-square', 'w-5 h-5')}</div>
        <div class="min-w-0">
          <h3 class="font-bold text-base leading-tight" style="font-family: var(--font-display);">${th('ความเห็น / ทักท้วง','Comment / question')}</h3>
          <p class="text-[11px] text-[var(--text-secondary)] truncate">${escapeHtml(title)}${amount ? ` • ${escapeHtml(amount)}` : ''}</p>
        </div>
      </div>
      <div id="comment-list" class="comment-list"></div>
      <form id="comment-form" class="space-y-2">
        <textarea id="comment-input" class="input" style="min-height:70px;" placeholder="${th('พิมพ์ข้อความ เช่น “รายการนี้หารไม่ถูก หรือจ่ายซ้ำหรือเปล่า?”','e.g. “This split looks off — was it paid twice?”')}"></textarea>
        <button type="submit" id="comment-send" class="btn btn-primary w-full">${icon('send', 'w-4 h-4')} ${th('ส่งความเห็น','Post comment')}</button>
      </form>
    </div>
  `);
  queueIcons();

  const listEl = sheet.sheet.querySelector('#comment-list');
  const renderList = () => {
    if (!listEl) return;
    listEl.innerHTML = items.length
      ? items.map(rowHtml).join('')
      : `<p class="text-[11px] text-[var(--text-tertiary)] text-center py-3">${th('ยังไม่มีความเห็น — เริ่มทักท้วงรายการนี้ได้เลย','No comments yet — start the discussion')}</p>`;
    listEl.querySelectorAll('[data-comment-del]').forEach(btn => btn.addEventListener('click', async () => {
      const id = btn.dataset.commentDel;
      const ok = await confirmAction({ title: th('ลบความเห็นนี้?','Delete this comment?'), confirmText: t('delete'), danger: true, icon: 'trash-2' });
      if (!ok) return;
      const target = items.find(c => c.id === id);
      await deleteComment(tripId, id);
      items = items.filter(c => c.id !== id);
      renderList();
      onChanged?.();
      // The audit trail is written after the UI update — a slow log must never
      // delay (or block) what the user sees.
      logActivity(tripId, { type: 'comment.delete', targetId: expenseId, title, detail: target?.text?.slice(0, 80) || '', user: me }).catch(() => {});
      toast.success(th('ลบความเห็นแล้ว','Comment deleted'));
    }));
    queueIcons();
  };
  renderList();

  sheet.sheet.querySelector('#comment-form')?.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const input = sheet.sheet.querySelector('#comment-input');
    const text = input?.value.trim();
    if (!text) { toast.error(th('พิมพ์ข้อความก่อนส่ง','Type something first')); return; }
    const btn = sheet.sheet.querySelector('#comment-send');
    if (btn) btn.disabled = true;
    try {
      const res = await addComment(tripId, expenseId, text, me);
      items = [...items, { id: res.id, expenseId, text, uid: me.uid, name: me.displayName, photoURL: me.photoURL, pending: !res.synced, createdAt: { seconds: Math.floor(Date.now() / 1000) } }];
      if (input) input.value = '';
      renderList();
      onChanged?.(res);
      // Same rule as above: the log entry goes out after the comment is visible.
      logActivity(tripId, { type: 'comment.create', targetId: expenseId, title, detail: text.slice(0, 80), user: me }).catch(() => {});
      toast.success(res.synced ? th('ส่งความเห็นแล้ว','Comment posted') : th('บันทึกไว้ในเครื่องนี้ (ยังไม่ได้ Publish firestore.rules)','Saved on this device (firestore.rules not published yet)'));
    } catch (e) {
      toast.error(e.message);
    } finally {
      if (btn) btn.disabled = false;
    }
  });
  return sheet;
}

/** The trip's edit history ("ใครแก้ไขล่าสุด"). */
async function openActivitySheet(tripId, { isAdmin = false } = {}) {
  const lang = getLang();
  const th = (a, b) => (lang === 'th' ? a : b);
  const sheet = showBottomSheet(`
    <div class="space-y-3">
      <div class="flex items-center gap-3">
        <div class="row-icon" style="width:40px;height:40px;border-radius:14px;background:var(--bg-secondary);color:var(--text-secondary);">${icon('history', 'w-5 h-5')}</div>
        <div class="min-w-0 flex-1">
          <h3 class="font-bold text-base leading-tight" style="font-family: var(--font-display);">${th('ประวัติการแก้ไข','Activity log')}</h3>
          <p class="text-[11px] text-[var(--text-secondary)]">${th('ใครเพิ่ม/แก้ไข/ลบ อะไร และเมื่อไร','Who added, edited or deleted what')}</p>
        </div>
        ${isAdmin ? `<button id="activity-clear-all" class="btn btn-ghost btn-sm text-[10px]" style="min-height:28px;padding:2px 10px;color:var(--danger);">${icon('trash-2', 'w-3.5 h-3.5')} ${th('ล้างทั้งหมด','Clear all')}</button>` : ''}
      </div>
      <div id="activity-list"><div class="skeleton h-16"></div><div class="skeleton h-16"></div></div>
    </div>
  `);
  queueIcons();
  const box = sheet.sheet.querySelector('#activity-list');
  let entries = await listActivity(tripId, { limitCount: 60 });

  function renderEntries() {
    if (!box) return;
    box.innerHTML = entries.length ? entries.map(e => `
      <div class="activity-row" data-activity-id="${e.id}">
        <div class="activity-icon">${icon(activityIcon(e.type), 'w-3.5 h-3.5')}</div>
        <div class="min-w-0 flex-1">
          <div class="text-xs"><b>${escapeHtml(e.name || '—')}</b> ${escapeHtml(activityLabel(e.type, lang))}${e.title ? ` — ${escapeHtml(e.title)}` : ''}</div>
          ${e.detail ? `<div class="text-[10px] text-[var(--text-tertiary)] truncate">${escapeHtml(e.detail)}</div>` : ''}
          <div class="text-[10px] text-[var(--text-tertiary)]">${escapeHtml(fmtWhen(e.at, lang))}${e.pending ? ` • ${th('ในเครื่องนี้','on device')}` : ''}</div>
        </div>
        ${isAdmin ? `<button class="activity-del-btn" data-activity-del="${e.id}" title="${t('delete')}">${icon('trash-2', 'w-3.5 h-3.5')}</button>` : ''}
      </div>`).join('')
      : `<p class="text-[11px] text-[var(--text-tertiary)] text-center py-4">${th('ยังไม่มีประวัติ','No history yet')}</p>`;

    // Bind individual delete buttons
    box.querySelectorAll('[data-activity-del]').forEach(btn => btn.addEventListener('click', async () => {
      const id = btn.dataset.activityDel;
      const ok = await confirmAction({
        title: th('ลบประวัตินี้?', 'Delete this entry?'),
        confirmText: t('delete'), danger: true, icon: 'trash-2'
      });
      if (!ok) return;
      try {
        await deleteActivityEntries(tripId, [id]);
        entries = entries.filter(e => e.id !== id);
        renderEntries();
        toast.success(th('ลบแล้ว', 'Deleted'));
      } catch (err) { toast.error(err.message); }
    }));
    queueIcons();
  }
  renderEntries();

  // "Clear all" — admin only
  const clearBtn = sheet.sheet.querySelector('#activity-clear-all');
  if (clearBtn && isAdmin) {
    clearBtn.addEventListener('click', async () => {
      const ok = await confirmAction({
        title: th('ล้างประวัติทั้งหมด?', 'Clear all activity?'),
        message: th('รายการประวัติทั้งหมดจะถูกลบออก เพื่อเพิ่มประสิทธิภาพของระบบ', 'All history entries will be removed to improve performance.'),
        confirmText: th('ล้างทั้งหมด', 'Clear all'), danger: true, icon: 'trash-2'
      });
      if (!ok) return;
      const tLoad = toast.loading(th('กำลังลบ...', 'Deleting...'));
      try {
        const ids = entries.map(e => e.id);
        await deleteActivityEntries(tripId, ids);
        entries = [];
        renderEntries();
        tLoad.close();
        toast.success(th('ล้างประวัติทั้งหมดแล้ว', 'All history cleared'));
      } catch (err) { tLoad.close(); toast.error(err.message); }
    });
  }

  return sheet;
}

// --- Render lifecycle + null-safe DOM helpers ---------------------------------
// Every async view captures a render token; when the user navigates away the token
// changes and stale writes are skipped instead of throwing
// "Cannot set properties of null (setting 'innerHTML')".
let renderToken = 0;
function beginRender() { return ++renderToken; }
function isStale(token) { return token !== renderToken; }
function el(id) { return document.getElementById(id); }
function setHtml(id, html) {
  const node = document.getElementById(id);
  if (!node) return null;
  node.innerHTML = html;
  return node;
}
function setText(id, text) {
  const node = document.getElementById(id);
  if (!node) return null;
  node.textContent = text;
  return node;
}
function bind(id, event, handler) {
  const node = document.getElementById(id);
  if (node) node.addEventListener(event, handler);
  return node;
}
function removeChildren(id) {
  const node = document.getElementById(id);
  if (node) node.innerHTML = '';
}

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
  'help-circle': 'circle-help',
  'bed-double': 'bed',
  'calendar-range': 'calendar-days',
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
  const signature = document.querySelectorAll('i[data-lucide]').length;
  if (!signature) return;
  try { lucide.createIcons(); } catch (e) { console.warn('createIcons', e); }
  const leftovers = Array.from(document.querySelectorAll('i[data-lucide]'));
  if (!leftovers.length) return;
  // Safety: from here on we only touch unresolved <i> elements.
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
// Lucide replaces <i data-lucide> with <svg data-lucide>. Those finished nodes must
// never be re-created (that was the "icons flicker non-stop" bug), and a re-render
// must be skipped entirely when nothing is left to convert.
function hasPendingIcons() {
  return !!document.querySelector('i[data-lucide]');
}
// Auto-render icons for ALL dynamic content (lists, sheets, async renders)
let iconObserverQueued = false;
try {
  new MutationObserver((records) => {
    if (iconObserverQueued) return;
    // Only react when <i data-lucide> nodes were actually added — text/timer
    // updates must never trigger an icon pass (that caused flicker + CPU churn).
    const added = records.some(r => [...r.addedNodes].some(n =>
      n.nodeType === 1 && (n.matches?.('i[data-lucide]') || n.querySelector?.('i[data-lucide]'))));
    if (!added) return;
    iconObserverQueued = true;
    requestAnimationFrame(() => { iconObserverQueued = false; renderIcons(); });
  }).observe(document.body, { childList: true, subtree: true });
} catch (e) { console.warn('icon observer failed', e); }

// --- Scroll-reveal + stagger animations for freshly rendered views ---
let revealQueued = false;
try {
  new MutationObserver(() => {
    if (revealQueued) return;
    revealQueued = true;
    requestAnimationFrame(() => {
      revealQueued = false;
      try { if (appEl) initReveal(appEl); } catch (e) { /* ignore */ }
    });
  }).observe(appEl, { childList: true, subtree: true });
} catch (e) { console.warn('reveal observer failed', e); }

// --- Clocks ---
function updateClocks() {
  const times = getCurrentTimes();
  const bkk = document.getElementById('clock-bkk');
  const tokyo = document.getElementById('clock-tokyo');
  const bkkText = `BKK ${times.bangkok.format('HH:mm')}`;
  const tokyoText = `TYO ${times.tokyo.format('HH:mm')}`;
  if (bkk && bkk.textContent !== bkkText) bkk.textContent = bkkText;
  if (tokyo && tokyo.textContent !== tokyoText) tokyo.textContent = tokyoText;
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

  // NOTE: the refresh button lives inside the header's inner flex row, which also
  // matches `.flex.items-center.gap-3` — always anchor on the button's own parent,
  // otherwise insertBefore() throws NotFoundError and the controls never appear.
  const refreshBtnEl = header.querySelector('#refresh-btn');
  const rightGroup = refreshBtnEl?.parentElement || header.querySelector('.flex.items-center.gap-3') || header;
  if (!rightGroup) return;

  const controlsDiv = document.createElement('div');
  controlsDiv.id = 'header-controls';
  controlsDiv.className = 'flex items-center gap-1';
  controlsDiv.innerHTML = `
    <button id="header-lang-btn" class="btn btn-ghost w-9 h-9 text-xs font-extrabold" style="min-height:36px;padding:0;" title="${t('language')}">${getLang() === 'th' ? 'EN' : 'TH'}</button>
    <button id="header-mode-btn" class="btn btn-ghost btn-icon w-9 h-9" title="Light / Dark / Auto">${icon('sun', 'w-[17px] h-[17px]')}</button>
    <button id="header-theme-btn" class="btn btn-ghost btn-icon w-9 h-9" title="${t('theme')}">${icon('palette', 'w-[17px] h-[17px]')}</button>
  `;

  const referenceNode = rightGroup.querySelector('#refresh-btn');
  if (referenceNode && referenceNode.parentElement === rightGroup) rightGroup.insertBefore(controlsDiv, referenceNode);
  else rightGroup.appendChild(controlsDiv);

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
      // Phones show the avatar only: a truncated name + email in the header used
      // to widen the layout viewport, which zoomed the whole page out and cut
      // off the right edge of every screen.
      nameEl.classList.add('hidden', 'md:flex');
      nameEl.title = `${nameText.textContent}${emailText.textContent ? ` • ${emailText.textContent}` : ''}`;
    } else {
      nameEl.classList.add('hidden');
      nameEl.classList.remove('md:flex');
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
  clearMemberSession();
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


/**
 * Members who signed in with a username + PIN (no Cloud Functions) are kept in
 * localStorage — restore the UI state from that session when there is no
 * Firebase Auth user.
 */
function applyMemberSession(session) {
  if (!session?.memberId) return false;
  currentUser = {
    uid: session.memberId,
    displayName: session.displayName || session.username || 'Member',
    email: '',
    photoURL: session.photoURL || null,
    isMemberSession: true
  };
  currentTripId = session.tripId || currentTripId;
  if (currentTripId) { try { localStorage.setItem('fuji_current_trip', currentTripId); } catch {} }
  authReady = true;
  return true;
}

/**
 * Members signed in with a username + PIN have no Firebase Auth token when the
 * Cloud Functions are unavailable, so Firestore rules treat them as guests.
 * Tell them what that means instead of showing mysterious errors.
 */
function renderMemberSessionNotice(on) {
  const box = document.getElementById('member-session-notice');
  if (!box) return;
  if (!on) { box.hidden = true; return; }
  const th = (a, b) => (getLang() === 'th' ? a : b);
  const textEl = document.getElementById('member-session-notice-text');
  if (textEl) {
    textEl.textContent = th(
      'โหมดสมาชิก (ไม่ใช้ Cloud Functions): เข้าสู่ระบบสำเร็จ — ข้อมูลจะแสดงจากที่บันทึกไว้ในเครื่องนี้ ถ้าต้องการซิงก์ข้อมูลให้ deploy Cloud Functions',
      'Member mode (no Cloud Functions): you are signed in — data is read from what is cached on this device. Deploy the Cloud Functions for full sync.'
    );
  }
  box.hidden = false;
  document.getElementById('member-session-notice-close')?.addEventListener('click', () => { box.hidden = true; });
  queueIcons();
}

// Console helper for support: `await fujiDiagnose()` in the browser console prints the
// same report as Settings > ตรวจสอบระบบ (System check).
if (typeof window !== 'undefined') {
  window.fujiDiagnose = async () => {
    const result = await runSystemDiagnostics({ tripId: currentTripId, lang: getLang() });
    if (typeof console.table === 'function') {
      console.table(result.results.map(x => ({ check: x.label, status: x.status, detail: x.detail })));
    }
    console.log(formatDiagnosticsReport({ tripId: currentTripId, lang: getLang(), results: result.results }));
    return result;
  };
}

/**
 * Firestore denied a join/approve action → show exactly what to publish.
 * The member may not own the project, so the sheet also prepares a message they
 * can forward to the trip admin.
 */
async function showRulesHelpSheet({ lang, trip = null, action = 'join' } = {}) {
  const th = (a, b) => (lang === 'th' ? a : b);
  const projectId = (() => { try { return app?.options?.projectId || null; } catch { return null; } })();
  const help = joinPermissionHelp(lang, { projectId, action });

  const sheet = showBottomSheet(`
    <div class="space-y-4">
      <div class="flex items-center gap-3">
        <div class="row-icon" style="width:44px;height:44px;border-radius:14px;background:var(--danger-bg);color:var(--danger);">${icon('shield-alert', 'w-5 h-5')}</div>
        <div>
          <h3 class="font-bold text-base" style="font-family: var(--font-display);">${escapeHtml(help.title)}</h3>
          <p class="text-[11px] text-[var(--text-tertiary)]">Missing or insufficient permissions</p>
        </div>
      </div>
      <p class="text-xs text-[var(--text-secondary)] leading-relaxed">${escapeHtml(help.message)}</p>
      <ol class="text-xs space-y-2 list-decimal pl-5 text-[var(--text-secondary)]">
        ${help.steps.map(step => `<li>${escapeHtml(step)}</li>`).join('')}
      </ol>
      <div class="p-3 rounded-xl" style="background:var(--bg-secondary); border:1px solid var(--border);">
        <p class="text-[11px] font-semibold mb-1">${th('คอลเลกชันที่กฎยังขาด','Collections missing from the rules')}</p>
        <div class="flex flex-wrap gap-1.5">${help.missing.map(m => `<code class="text-[10px] px-2 py-0.5 rounded-md" style="background:var(--surface); border:1px solid var(--border);">${escapeHtml(m)}</code>`).join('')}</div>
      </div>
      <div class="btn-row">
        <button id="rules-copy" class="btn btn-primary btn-sm">${icon('clipboard-copy', 'w-4 h-4')} ${th('คัดลอกกฎทั้งหมด','Copy all rules')}</button>
        <button id="rules-open-console" class="btn btn-secondary btn-sm">${icon('external-link', 'w-4 h-4')} ${th('เปิด Firebase Console','Open Firebase Console')}</button>
      </div>
      <button id="rules-ask-admin" class="btn btn-ghost btn-sm w-full">${icon('send', 'w-4 h-4')} ${th('คัดลอกข้อความส่งให้แอดมินทริป','Copy a message for the trip admin')}</button>
      <div id="rules-status" class="text-[11px] text-[var(--text-tertiary)]"></div>
    </div>
  `);
  queueIcons();

  const status = (msg) => { const el = sheet.sheet.querySelector('#rules-status'); if (el) el.textContent = msg; };
  const copy = (text, okMsg, failMsg) => {
    const done = navigator.clipboard?.writeText?.(text);
    if (done?.then) done.then(() => { status('✅ ' + okMsg); toast.success(okMsg); }).catch(() => status('⚠️ ' + failMsg));
    else status('⚠️ ' + failMsg);
  };

  sheet.sheet.querySelector('#rules-copy').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    status(th('กำลังดึงไฟล์กฎ...','Fetching the rules file...'));
    const text = await fetchRulesText();
    btn.disabled = false;
    if (text) copy(text, th('คัดลอกกฎทั้งหมดแล้ว — ไปวางใน Firebase Console > Rules แล้วกด Publish','Rules copied — paste them in Firebase Console > Rules and press Publish'),
                        th('คัดลอกอัตโนมัติไม่ได้ — กด "เปิด Firebase Console" แล้วคัดลอกจากไฟล์ firestore.rules ในโปรเจกต์','Could not copy — open the console and copy from firestore.rules in the repo'));
    else window.open(help.repoUrl, '_blank', 'noopener');
  });

  sheet.sheet.querySelector('#rules-open-console').addEventListener('click', () => window.open(help.consoleUrl, '_blank', 'noopener'));
  sheet.sheet.querySelector('#rules-ask-admin').addEventListener('click', () => {
    copy(adminHelpMessage(currentUser, trip || currentTrip, lang),
         th('คัดลอกข้อความแล้ว — ส่งใน LINE/แชทให้แอดมินได้เลย','Message copied — send it to the trip admin'),
         th('คัดลอกไม่สำเร็จ','Copy failed'));
  });
}

function renderMemberSessionUi(session) {
  const label = (session.displayName || session.username || 'M')[0]?.toUpperCase() || 'M';
  if (session.photoURL) userAvatarBtn.innerHTML = `<img src="${escapeHtml(session.photoURL)}" class="w-full h-full rounded-full object-cover" alt="">`;
  else userAvatarBtn.textContent = label;
  userAvatarBtn.onclick = () => openUserSheet(currentUser);
  updateUserDisplay(currentUser);
  renderDesktopNav();
  updateBottomNav();
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
      renderMemberSessionNotice(false);
      // Google / email accounts: keep users/{uid} + the public directory in sync.
      if (user.providerData?.some(p => /google|password/.test(p.providerId))) {
        ensureUserProfile(user).catch(e => console.warn('ensureUserProfile failed', e?.message));
      }
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
    } else if (applyMemberSession(getMemberSession())) {
      // Signed in as a member via username + PIN (works without Cloud Functions)
      const session = getMemberSession();
      renderMemberSessionUi(session);
      renderMemberSessionNotice(true);
      if (!location.hash || location.hash === '#' || location.hash.includes('login')) {
        if (pendingAuthRoute) { const target = pendingAuthRoute; pendingAuthRoute = null; location.hash = target; }
        else location.hash = '#/trips';
      }
      router.handle();
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

// Coming back from a Google redirect sign-in (mobile browsers).
if (isFirebaseConfigured && auth) {
  completeRedirectSignIn().then(u => {
    if (u) {
      toast.success(getLang() === 'th' ? `ยินดีต้อนรับ ${u.displayName || u.email}` : `Welcome ${u.displayName || u.email}`);
      if (!location.hash || location.hash.includes('login')) location.hash = '#/trips';
    }
  }).catch(e => toast.error(e.message || 'Google sign-in failed'));
}

// No Firebase Auth session? Restore the local member session (username + PIN).
if (isFirebaseConfigured && !currentUser) {
  const session = getMemberSession();
  if (session) {
    applyMemberSession(session);
    setTimeout(() => {
      renderMemberSessionUi(session);
      renderMemberSessionNotice(true);
      if (location.hash.includes('login')) location.hash = '#/trips';
      else router.handle();
    }, 60);
  }
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
  // Let the previous view release timers / map instances
  try { document.dispatchEvent(new CustomEvent('routechange')); } catch {}
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
  // A manual refresh must really go back to Firestore — drop the read cache first.
  clearAllDataCache();
  clearPermissionsCache();
  toast.success(getLang() === 'th' ? 'รีเฟรชข้อมูลล่าสุดแล้ว' : 'Reloaded from the server');
  router.handle();
  setTimeout(() => syncState.set('online'), 300);
});

/* ---------------------------------------------------------------- *
 * Route progress bar — instant feedback while a menu reads data.
 * ---------------------------------------------------------------- */
const routeProgress = (() => {
  let bar = null;
  let showTimer = null;
  let hideTimer = null;
  function el() {
    if (bar?.isConnected) return bar;
    bar = document.createElement('div');
    bar.id = 'route-progress';
    bar.className = 'route-progress';
    bar.setAttribute('aria-hidden', 'true');
    document.body.appendChild(bar);
    return bar;
  }
  return {
    start() {
      const node = el();
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
      node.classList.remove('is-done');
      // Only appear when the navigation is slow enough to be noticeable.
      showTimer = setTimeout(() => node.classList.add('is-active'), 140);
    },
    end() {
      clearTimeout(showTimer);
      const node = el();
      node.classList.remove('is-active');
      node.classList.add('is-done');
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => node.classList.remove('is-done'), 200);
    }
  };
})();
window.addEventListener('route:start', () => routeProgress.start());
window.addEventListener('route:end', () => routeProgress.end());

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

        <div class="card card-accent p-7 space-y-4">
          <!-- Google first: the recommended way for members on the free plan -->
          <button id="google-signin-btn" class="btn btn-google w-full btn-lg">
            <svg viewBox="0 0 48 48" class="w-5 h-5" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
            ${lang === 'th' ? 'เข้าสู่ระบบด้วยบัญชี Google' : 'Continue with Google'}
          </button>

          <div class="login-or"><span>${lang === 'th' ? 'หรือใช้บัญชีอีเมล' : 'or use an email account'}</span></div>

          <form id="account-form" class="space-y-4">
            <div class="input-group"><label class="input-label">${icon('mail', 'w-3.5 h-3.5')} ${t('email')}</label><input id="admin-email" class="input" type="email" placeholder="you@example.com" required autocomplete="email"></div>
            <div class="input-group"><label class="input-label">${icon('key-round', 'w-3.5 h-3.5')} ${t('password')}</label><input id="admin-pass" class="input" type="password" required autocomplete="current-password"></div>
            <label class="flex items-center gap-2 text-sm cursor-pointer"><input id="admin-remember" type="checkbox" checked class="accent-[var(--primary)] w-4 h-4"> ${t('rememberDevice')}</label>
            <button class="btn btn-primary w-full btn-lg" type="submit">${icon('log-in', 'w-4 h-4')} ${lang==='th' ? 'เข้าสู่ระบบ' : 'Sign in'}</button>
            <div class="btn-row">
              <button type="button" id="account-signup-btn" class="btn btn-secondary btn-sm">${icon('user-plus', 'w-4 h-4')} ${lang==='th' ? 'สมัครบัญชีใหม่' : 'Create account'}</button>
              <button type="button" id="account-reset-btn" class="btn btn-ghost btn-sm">${icon('help-circle', 'w-4 h-4')} ${lang==='th' ? 'ลืมรหัสผ่าน' : 'Forgot password'}</button>
            </div>
          </form>

          <p class="text-[11px] text-center text-[var(--text-tertiary)] leading-relaxed">
            ${lang === 'th'
              ? 'สมาชิกใช้บัญชี Google ของตัวเองได้ — แอดมินทริปเป็นคนอนุมัติให้เข้าร่วมแต่ละทริป'
              : 'Members sign in with their own Google account — the trip admin approves each trip.'}
          </p>
        </div>
      </div>
    </div>
  `;
  queueIcons();
  updateModeIcons();

  setTimeout(() => addPasswordToggle('admin-pass'), 10);

  document.getElementById('login-lang').onclick = () => {
    const newLang = lang === 'th' ? 'en' : 'th';
    setLang(newLang);
    renderLogin();
    toast.success(newLang === 'th' ? 'ภาษาไทย' : 'English');
  };
  document.getElementById('login-theme').onclick = showThemePicker;
  document.getElementById('login-dark').onclick = cycleMode;

  // ---- Google account (recommended for members, works on the free plan) ----
  appEl.querySelector('#google-signin-btn').onclick = async (e) => {
    const btn = e.currentTarget;
    const originalHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `${spinner('w-5 h-5')} ${lang==='th' ? 'กำลังเปิด Google...' : 'Opening Google...'}`;
    queueIcons();
    try {
      const user = await signInWithGoogle(true);
      // null = we were redirected to Google and will come back here
      if (!user) return;
      toast.success(lang==='th' ? `ยินดีต้อนรับ ${user.displayName || user.email}` : `Welcome ${user.displayName || user.email}`);
      location.hash = '#/trips';
    } catch (err) {
      toast.error(err.message || 'Google sign-in failed');
      btn.disabled = false;
      btn.innerHTML = originalHtml;
      queueIcons();
    }
  };

  // ---- Email account: sign up / forgot password ----
  appEl.querySelector('#account-signup-btn').onclick = async () => {
    const email = document.getElementById('admin-email').value.trim();
    const pass = document.getElementById('admin-pass').value;
    const name = await promptAction({
      title: lang==='th' ? 'สมัครบัญชีสมาชิก' : 'Create member account',
      message: lang==='th'
        ? 'กรอกชื่อที่ต้องการให้เพื่อนเห็น แล้วระบบจะสมัครบัญชีให้ด้วยอีเมล/รหัสผ่านที่กรอกไว้ด้านบน'
        : 'Enter the name your friends will see — the account is created with the email/password above.',
      placeholder: lang==='th' ? 'เช่น นุ่น' : 'e.g. Nun',
      confirmText: lang==='th' ? 'สมัคร' : 'Sign up', icon: 'user-plus'
    });
    if (!name) return;
    const tLoad = toast.loading(lang==='th' ? 'กำลังสมัคร...' : 'Creating account...');
    try {
      await signUpEmailAccount(email, pass, name, document.getElementById('admin-remember').checked);
      tLoad.close();
      toast.success(lang==='th' ? 'สมัครสำเร็จ! ขั้นต่อไป: ขอรหัสเชิญทริปจากแอดมิน' : 'Account created! Next: ask the admin for a trip code');
      location.hash = '#/trips';
    } catch (err) {
      tLoad.close();
      toast.error(err.message);
    }
  };

  appEl.querySelector('#account-reset-btn').onclick = async () => {
    const email = document.getElementById('admin-email').value.trim();
    if (!email) { toast.warning(lang==='th' ? 'กรอกอีเมลก่อน' : 'Enter your email first'); return; }
    try {
      await sendAccountPasswordReset(email);
      toast.success(lang==='th' ? `ส่งลิงก์รีเซ็ตรหัสผ่านไปที่ ${email} แล้ว` : `Reset link sent to ${email}`);
    } catch (err) { toast.error(err.message); }
  };

  appEl.querySelector('#account-form').onsubmit = async (e) => {
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

  queueIcons();
}

/* ================================================================== *
 * Trips — list, create, edit (dates/details), duplicate, delete
 * ================================================================== */

const TRIP_THEME_COLORS = [
  { color: '#8bb89a', name: 'Sage' }, { color: '#8aa89a', name: 'Fuji' },
  { color: '#a8c5b5', name: 'Moss' }, { color: '#b89aa0', name: 'Sakura' },
  { color: '#d4b5a0', name: 'Sand' }, { color: '#8aa8b5', name: 'Ocean' },
  { color: '#9a9ab5', name: 'Lavender' }, { color: '#6b8f79', name: 'Forest' },
  { color: '#14b8a6', name: 'Aurora' }, { color: '#f97316', name: 'Sunburst' },
  { color: '#8b5cf6', name: 'Grape' }, { color: '#ec4899', name: 'Berry' },
];

const TRIP_TIMEZONES = [
  'Asia/Bangkok', 'Asia/Tokyo', 'Asia/Seoul', 'Asia/Singapore', 'Asia/Hong_Kong',
  'Asia/Shanghai', 'Asia/Taipei', 'Asia/Manila', 'Asia/Jakarta', 'Asia/Kuala_Lumpur',
  'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'America/New_York', 'America/Los_Angeles',
  'Australia/Sydney', 'UTC'
];

const TRIP_CURRENCIES = ['THB', 'JPY', 'USD', 'EUR', 'KRW', 'SGD', 'GBP', 'CNY', 'HKD', 'AUD', 'TWD', 'VND'];

function openTripForm(existingTrip = null, { onSaved = null } = {}) {
  const lang = getLang();
  const isEdit = !!existingTrip;
  const trip = existingTrip || {};
  let coverFile = null;
  let croppedBlob = null;
  let cropperInstance = null;
  let currentAspect = 16 / 9;

  const options = (list, selected) => list.map(v => `<option value="${v}" ${selected === v ? 'selected' : ''}>${v.replace('_', ' ')}</option>`).join('');
  const currencyOptions = (selected) => TRIP_CURRENCIES.map(c => `<option value="${c}" ${selected === c ? 'selected' : ''}>${c}</option>`).join('');

  const sheet = showBottomSheet(`
    <div class="space-y-3">
      <div class="flex items-center gap-3">
        <div class="row-icon" style="width:40px;height:40px;border-radius:14px;background:var(--gradient-primary);color:#fff;">${icon(isEdit ? 'pencil' : 'compass', 'w-5 h-5')}</div>
        <div class="min-w-0">
          <h3 class="font-bold text-base leading-tight" style="font-family: var(--font-display);">${isEdit ? (lang==='th' ? 'แก้ไขทริป' : 'Edit trip') : t('createTrip')}</h3>
          <p class="text-[11px] text-[var(--text-secondary)]">${isEdit ? (lang==='th' ? 'แก้ชื่อ วันเดินทาง รายละเอียด ฯลฯ' : 'Change name, dates, details…') : (lang==='th' ? 'กรอกข้อมูลทริปใหม่ของคุณ' : 'Fill in your new trip details')}</p>
        </div>
      </div>

      <form id="trip-form" class="space-y-3">
        <div class="input-group"><label class="input-label">${icon('sparkles', 'w-3.5 h-3.5')} ${t('tripName')} *</label><input id="tf-name" class="input" required placeholder="Fuji Autumn 2027" autocomplete="off" value="${escapeHtml(trip.name || '')}"></div>

        <div class="input-group"><label class="input-label">${icon('align-left', 'w-3.5 h-3.5')} ${lang==='th' ? 'รายละเอียดทริป' : 'Description'}</label><textarea id="tf-desc" class="input" style="min-height:70px;" placeholder="${lang==='th' ? 'บันทึกสิ่งที่อยากทำในทริปนี้' : 'What is this trip about?'}">${escapeHtml(trip.description || '')}</textarea></div>

        <div class="input-group">
          <label class="input-label">${icon('image', 'w-3.5 h-3.5')} ${t('coverImage')}</label>
          <div class="p-3 rounded-xl border-2 border-dashed" style="border-color: var(--border); background: var(--bg-secondary);">
            <div id="cover-dropzone" class="text-center cursor-pointer py-3 transition-colors ${trip.coverImage ? 'hidden' : ''}">
              <div class="row-icon mx-auto mb-2" style="width:42px;height:42px;">${icon('camera', 'w-5 h-5')}</div>
              <p class="text-xs font-semibold">${lang==='th' ? 'คลิกหรือลากรูปมาวาง' : 'Click or drop an image'}</p>
              <p class="text-[10px] text-[var(--text-tertiary)] mt-0.5">JPG / PNG • ≤ 10MB • ${lang==='th' ? 'ครอปได้' : 'croppable'}</p>
            </div>
            <input id="tf-cover" type="file" accept="image/*" class="hidden">

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

            <div id="cover-preview" class="${trip.coverImage ? '' : 'hidden'} mt-3">
              <div class="flex items-center justify-between mb-1.5">
                <span class="text-[11px] font-bold flex items-center gap-1">${icon('eye', 'w-3.5 h-3.5')} ${lang==='th' ? 'ตัวอย่าง' : 'Preview'}</span>
                <button type="button" id="change-image" class="btn btn-ghost btn-sm text-[10px]" style="min-height:26px;padding:4px 10px;">${icon('replace', 'w-3 h-3')} ${lang==='th' ? 'เปลี่ยน' : 'Change'}</button>
              </div>
              <div class="w-full h-28 rounded-xl overflow-hidden border" style="border-color: var(--border);">
                <img id="cover-img" class="w-full h-full object-cover" src="${escapeHtml(trip.coverImage || '')}" alt="">
              </div>
              <p id="cover-info" class="text-[10px] text-[var(--text-tertiary)] mt-1"></p>
            </div>
          </div>
          <div class="input-group mt-2">
            <label class="input-label text-[12px]">${icon('link', 'w-3.5 h-3.5')} ${lang==='th' ? 'หรือใส่ URL รูปภาพ' : 'Or image URL'}</label>
            <input id="tf-cover-url" class="input text-sm" style="min-height:38px;" placeholder="https://..." autocomplete="off" value="${trip.coverImage && String(trip.coverImage).startsWith('http') ? escapeHtml(trip.coverImage) : ''}">
          </div>
        </div>

        <div class="grid grid-cols-2 gap-2">
          <div class="input-group"><label class="input-label text-[12px]">${icon('globe', 'w-3.5 h-3.5')} ${t('country')}</label><input id="tf-country" class="input text-sm" style="min-height:38px;" placeholder="Japan" autocomplete="off" value="${escapeHtml(trip.country || '')}"></div>
          <div class="input-group"><label class="input-label text-[12px]">${icon('building-2', 'w-3.5 h-3.5')} ${t('city')}</label><input id="tf-city" class="input text-sm" style="min-height:38px;" placeholder="Fujikawaguchiko" autocomplete="off" value="${escapeHtml(trip.city || '')}"></div>
        </div>

        <div class="grid grid-cols-2 gap-2">
          <div class="input-group"><label class="input-label text-[12px]">${icon('calendar', 'w-3.5 h-3.5')} ${t('startDate')} *</label><input id="tf-start" class="input text-sm" style="min-height:38px;" type="date" required value="${escapeHtml(trip.startDate || '')}"></div>
          <div class="input-group"><label class="input-label text-[12px]">${icon('calendar-check', 'w-3.5 h-3.5')} ${t('endDate')} *</label><input id="tf-end" class="input text-sm" style="min-height:38px;" type="date" required value="${escapeHtml(trip.endDate || '')}"></div>
        </div>

        <div class="grid grid-cols-2 gap-2">
          <div class="input-group">
            <label class="input-label text-[12px]">${icon('clock', 'w-3.5 h-3.5')} ${t('timezone')}</label>
            <select id="tf-tz" class="input text-sm" style="min-height:38px;">${options(TRIP_TIMEZONES, trip.timezone || 'Asia/Bangkok')}</select>
          </div>
          <div class="input-group">
            <label class="input-label text-[12px]">${icon('banknote', 'w-3.5 h-3.5')} ${t('baseCurrency')}</label>
            <select id="tf-cur" class="input text-sm" style="min-height:38px;">${currencyOptions(trip.baseCurrency || 'THB')}</select>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-2">
          <div class="input-group">
            <label class="input-label text-[12px]">${icon('flag', 'w-3.5 h-3.5')} ${lang==='th' ? 'สถานะทริป' : 'Status'}</label>
            <select id="tf-status" class="input text-sm" style="min-height:38px;">
              ${['draft','active','completed','archived'].map(st => `<option value="${st}" ${(trip.status||'draft')===st?'selected':''}>${st}</option>`).join('')}
            </select>
          </div>
          <div class="input-group">
            <label class="input-label text-[12px]">${icon('arrow-left-right', 'w-3.5 h-3.5')} ${lang==='th' ? 'เรทเป็น THB' : 'Rate → THB'}</label>
            <input id="tf-rate" class="input text-sm" style="min-height:38px;" type="number" step="0.0001" min="0" value="${trip.exchangeRateToTHB || 1}">
          </div>
        </div>

        <div class="input-group">
          <label class="input-label text-[12px]">${icon('palette', 'w-3.5 h-3.5')} ${t('themeColor')}</label>
          <div class="grid grid-cols-6 gap-1.5 p-2 rounded-xl" style="background: var(--bg-secondary); border: 1px solid var(--border);">
            ${TRIP_THEME_COLORS.map(c =>
              `<button type="button" data-color="${c.color}" title="${c.name}" class="w-full aspect-square rounded-full border-2 shadow-sm hover:scale-110 transition-transform" style="background:${c.color};border-color:rgba(255,255,255,0.85);"></button>`
            ).join('')}
          </div>
          <div class="flex gap-2 mt-2 items-center">
            <input id="tf-color-custom" type="color" value="${trip.themeColor || '#8bb89a'}" class="w-9 h-9 rounded-full border-2 shadow-sm cursor-pointer flex-shrink-0" style="border-color:rgba(255,255,255,0.85);" title="Custom color">
            <input id="tf-color" type="text" value="${trip.themeColor || '#8bb89a'}" class="input flex-1 text-xs font-mono" style="min-height:36px;" placeholder="#8bb89a">
            <div id="tf-color-preview" class="w-9 h-9 rounded-full border-2 shadow-sm flex-shrink-0" style="background:${trip.themeColor || '#8bb89a'};border-color:rgba(255,255,255,0.85);"></div>
          </div>
        </div>

        <button id="tf-submit" type="submit" class="btn btn-primary w-full">${icon(isEdit ? 'save' : 'plus', 'w-4 h-4')} ${isEdit ? t('save') : t('createTrip')}</button>
        ${isEdit ? `<div class="flex gap-2">
          <button type="button" id="tf-delete" class="btn flex-1" style="background: var(--danger-bg); color: var(--danger); border:1.5px solid color-mix(in srgb, var(--danger) 35%, transparent);">${icon('trash-2', 'w-4 h-4')} ${lang==='th' ? 'ลบทริปนี้' : 'Delete trip'}</button>
          <button type="button" id="tf-duplicate" class="btn btn-secondary flex-1">${icon('copy', 'w-4 h-4')} ${lang==='th' ? 'ทำสำเนาทริป' : 'Duplicate'}</button>
        </div>` : ''}
      </form>
    </div>
  `);
  queueIcons();

  let selectedColor = trip.themeColor || '#8bb89a';
  const colorInput = document.getElementById('tf-color');
  const colorCustom = document.getElementById('tf-color-custom');
  const colorPreview = document.getElementById('tf-color-preview');
  const previewImg = document.getElementById('cover-img');
  const previewContainer = document.getElementById('cover-preview');
  const coverInfo = document.getElementById('cover-info');
  const dropzone = document.getElementById('cover-dropzone');
  const fileInput = document.getElementById('tf-cover');
  const coverUrlInput = document.getElementById('tf-cover-url');
  const cropperContainer = document.getElementById('cover-cropper-container');
  const cropperWrapper = document.getElementById('cropper-wrapper');

  function updateColor(newColor) {
    selectedColor = newColor;
    colorInput.value = newColor;
    colorCustom.value = newColor;
    colorPreview.style.background = newColor;
    document.querySelectorAll('#trip-form [data-color]').forEach(b => {
      b.style.borderColor = 'rgba(255,255,255,0.85)';
      b.style.transform = '';
      if (b.dataset.color.toLowerCase() === String(newColor).toLowerCase()) {
        b.style.borderColor = 'var(--text)';
        b.style.transform = 'scale(1.15)';
      }
    });
  }
  document.querySelectorAll('#trip-form [data-color]').forEach(btn => btn.addEventListener('click', () => updateColor(btn.dataset.color)));
  colorCustom.addEventListener('input', (e) => updateColor(e.target.value));
  colorInput.addEventListener('input', (e) => { if (/^#[0-9A-F]{6}$/i.test(e.target.value)) updateColor(e.target.value); });
  updateColor(selectedColor);

  async function handleFile(file) {
    if (!file) return;
    if (!file.type.startsWith('image/')) return toast.error(lang==='th' ? 'เลือกไฟล์ภาพเท่านั้น' : 'Images only');
    if (file.size > 10 * 1024 * 1024) return toast.error(lang==='th' ? 'ไฟล์ใหญ่เกิน 10MB' : 'File exceeds 10MB');
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
  dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.parentElement.style.borderColor = 'var(--primary)'; });
  dropzone.addEventListener('dragleave', () => { dropzone.parentElement.style.borderColor = ''; });
  dropzone.addEventListener('drop', (e) => { e.preventDefault(); dropzone.parentElement.style.borderColor = ''; handleFile(e.dataTransfer.files[0]); });

  document.querySelectorAll('.aspect-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      document.querySelectorAll('.aspect-btn').forEach(b => b.classList.remove('chip-active'));
      btn.classList.add('chip-active');
      const aspect = btn.dataset.aspect;
      if (aspect === 'free') currentAspect = null;
      else { const [w, h] = aspect.split('/').map(Number); currentAspect = w && h ? w / h : null; }
      if (cropperInstance && coverFile) { cropperInstance.aspectRatio = currentAspect; await cropperInstance.loadFile(coverFile, cropperWrapper); }
    });
  });

  document.getElementById('crop-confirm')?.addEventListener('click', async () => {
    if (!cropperInstance) return;
    const btn = document.getElementById('crop-confirm');
    btn.disabled = true;
    try {
      croppedBlob = await cropperInstance.getCroppedBlob('image/webp', 0.85);
      previewImg.src = cropperInstance.getPreviewDataUrl(600);
      previewContainer.classList.remove('hidden');
      cropperContainer.classList.add('hidden');
      coverInfo.textContent = `${lang==='th' ? 'ครอปแล้ว' : 'Cropped'} • ${(croppedBlob.size/1024).toFixed(0)} KB`;
    } catch (err) { toast.error((lang==='th' ? 'ครอปไม่สำเร็จ: ' : 'Crop failed: ') + err.message); }
    finally { btn.disabled = false; }
  });

  document.getElementById('crop-cancel')?.addEventListener('click', () => {
    cropperContainer.classList.add('hidden');
    dropzone.classList.remove('hidden');
    if (cropperInstance) { cropperInstance.destroy(); cropperInstance = null; }
  });

  document.getElementById('change-image')?.addEventListener('click', () => {
    previewContainer.classList.add('hidden');
    dropzone.classList.remove('hidden');
    coverFile = null; croppedBlob = null;
    fileInput.value = ''; coverUrlInput.value = '';
  });

  coverUrlInput.addEventListener('input', () => {
    const url = coverUrlInput.value.trim();
    if (url && url.startsWith('http')) {
      previewImg.src = url;
      previewContainer.classList.remove('hidden');
      coverInfo.textContent = `URL: ${url.slice(0, 50)}...`;
    }
  });

  document.getElementById('trip-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = document.getElementById('tf-submit');
    submitBtn.disabled = true;
    const originalHtml = submitBtn.innerHTML;
    submitBtn.innerHTML = `${spinner('w-4 h-4')} ${lang==='th' ? 'กำลังบันทึก...' : 'Saving...'}`;
    queueIcons();
    const tLoad = toast.loading(lang==='th' ? 'กำลังบันทึก...' : 'Saving...');
    try {
      const startDate = document.getElementById('tf-start').value;
      const endDate = document.getElementById('tf-end').value;
      if (!startDate || !endDate) throw new Error(lang==='th' ? 'กรุณาเลือกวันเริ่มและสิ้นสุด' : 'Start and end dates are required');
      if (endDate < startDate) throw new Error(lang==='th' ? 'วันสิ้นสุดต้องไม่ก่อนวันเริ่ม' : 'End date must be after start date');
      const coverUrl = document.getElementById('tf-cover-url').value.trim();
      const payload = {
        name: document.getElementById('tf-name').value.trim(),
        description: document.getElementById('tf-desc').value.trim(),
        country: document.getElementById('tf-country').value.trim(),
        city: document.getElementById('tf-city').value.trim(),
        startDate, endDate,
        timezone: document.getElementById('tf-tz').value,
        baseCurrency: document.getElementById('tf-cur').value,
        themeColor: document.getElementById('tf-color').value,
        status: document.getElementById('tf-status').value,
        exchangeRateToTHB: parseFloat(document.getElementById('tf-rate').value) || 1,
        coverFile, coverBlob: croppedBlob,
        coverUrl: coverUrl || null,
        creatorName: currentUser?.displayName || currentUser?.email
      };
      if (!payload.name) throw new Error(lang==='th' ? 'กรุณากรอกชื่อทริป' : 'Trip name is required');

      if (isEdit) {
        await updateTrip(trip.id, {
          name: payload.name,
          description: payload.description,
          country: payload.country,
          city: payload.city,
          startDate: payload.startDate,
          endDate: payload.endDate,
          timezone: payload.timezone,
          baseCurrency: payload.baseCurrency,
          themeColor: payload.themeColor,
          status: payload.status,
          exchangeRateToTHB: payload.exchangeRateToTHB
        });
        if (croppedBlob || coverFile) {
          const url = await uploadCoverImage(trip.id, croppedBlob || coverFile, currentUser.uid);
          if (url) await updateTrip(trip.id, { coverImage: url });
        } else if (coverUrl && coverUrl !== trip.coverImage) {
          await updateTrip(trip.id, { coverImage: coverUrl });
        }
        tLoad.close();
        toast.success(lang==='th' ? 'บันทึกการแก้ไขทริปแล้ว' : 'Trip updated');
        sheet.close();
        if (cropperInstance) cropperInstance.destroy();
        if (onSaved) await onSaved();
        else if (currentTripId === trip.id) await loadTrip(trip.id);
      } else {
        const id = await createTrip(payload, currentUser.uid);
        tLoad.close();
        toast.success(lang==='th' ? 'สร้างทริปเรียบร้อย' : 'Trip created');
        confetti({ y: 160 });
        sheet.close();
        if (cropperInstance) cropperInstance.destroy();
        if (onSaved) await onSaved();
        else setTimeout(() => { location.hash = `#/trip/${id}/dashboard`; }, 160);
      }
    } catch (err) {
      tLoad.close();
      console.error('Trip form failed', err);
      toast.error(err.message, undefined, () => submitBtn.click());
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalHtml;
      queueIcons();
    }
  });

  document.getElementById('tf-duplicate')?.addEventListener('click', async () => {
    const ok = await confirmAction({
      title: lang==='th' ? 'ทำสำเนาทริปนี้?' : 'Duplicate this trip?',
      message: lang==='th' ? 'ระบบจะคัดลอกสมาชิกและแผนการเดินทางทั้งหมดไปยังทริปใหม่ (ไม่รวมค่าใช้จ่าย)' : 'Members and itinerary will be copied into a new trip (expenses are not copied).',
      confirmText: lang==='th' ? 'ทำสำเนา' : 'Duplicate',
      icon: 'copy'
    });
    if (!ok) return;
    const tLoad = toast.loading(lang==='th' ? 'กำลังคัดลอก...' : 'Duplicating...');
    try {
      const newId = await duplicateTrip(trip, currentUser.uid, { nameSuffix: lang==='th' ? ' (สำเนา)' : ' (copy)' });
      tLoad.close();
      toast.success(lang==='th' ? 'ทำสำเนาแล้ว' : 'Duplicated');
      sheet.close();
      location.hash = `#/trip/${newId}/dashboard`;
    } catch (e) { tLoad.close(); toast.error(e.message); }
  });

  document.getElementById('tf-delete')?.addEventListener('click', async () => {
    const ok = await confirmAction({
      title: lang==='th' ? `ลบทริป "${trip.name}" ?` : `Delete "${trip.name}"?`,
      message: lang==='th' ? 'การลบจะลบแผนการเดินทาง ค่าใช้จ่าย สมาชิก เอกสารของทริปนี้ทั้งหมด และไม่สามารถกู้คืนได้' : 'This permanently removes the itinerary, expenses, members and documents of this trip.',
      detail: `Trip ID: <b>${escapeHtml(trip.id)}</b>`,
      confirmText: lang==='th' ? 'ลบทริป' : 'Delete trip',
      danger: true, icon: 'trash-2'
    });
    if (!ok) return;
    const tLoad = toast.loading(lang==='th' ? 'กำลังลบทริป...' : 'Deleting trip...');
    try {
      const res = await deleteTrip(trip.id);
      tLoad.close();
      if (currentTripId === trip.id) setTrip(null);
      toast.success(lang==='th' ? 'ลบทริปแล้ว' : 'Trip deleted');
      sheet.close();
      if (res?.warnings?.length) toast.warning(lang==='th' ? 'ลบข้อมูลย่อยบางส่วนไม่สำเร็จ (ต้อง deploy rules)' : 'Some sub-data could not be deleted (deploy rules)');
      if (onSaved) await onSaved();
      else location.hash = '#/trips';
    } catch (e) { tLoad.close(); toast.error(e.message); }
  });

  return sheet;
}

function openTripActions(trip, { onChanged } = {}) {
  const lang = getLang();
  const sheet = showBottomSheet(`
    <div class="space-y-4">
      <div class="flex items-center gap-3">
        <div class="w-12 h-12 rounded-2xl overflow-hidden flex-shrink-0" style="background: linear-gradient(135deg, ${trip.themeColor || '#8bb89a'}, color-mix(in srgb, ${trip.themeColor || '#8bb89a'} 55%, #fff));">
          ${trip.coverImage ? `<img src="${escapeHtml(trip.coverImage)}" class="w-full h-full object-cover" alt="">` : ''}
        </div>
        <div class="min-w-0">
          <h3 class="font-bold truncate" style="font-family: var(--font-display);">${escapeHtml(trip.name)}</h3>
          <p class="text-[11px] text-[var(--text-secondary)]">${escapeHtml(trip.startDate || '')} → ${escapeHtml(trip.endDate || '')}</p>
        </div>
      </div>
      <div class="grid gap-2">
        <button id="ta-open" class="btn btn-primary w-full">${icon('log-in', 'w-4 h-4')} ${lang==='th' ? 'เปิดทริป' : 'Open trip'}</button>
        <button id="ta-edit" class="btn btn-secondary w-full">${icon('pencil', 'w-4 h-4')} ${lang==='th' ? 'แก้ไขข้อมูลทริป' : 'Edit trip'}</button>
        <button id="ta-dup" class="btn btn-secondary w-full">${icon('copy', 'w-4 h-4')} ${lang==='th' ? 'ทำสำเนาทริป' : 'Duplicate'}</button>
        <button id="ta-id" class="btn btn-ghost w-full text-xs">${icon('clipboard-copy', 'w-3.5 h-3.5')} ${lang==='th' ? 'คัดลอก Trip ID' : 'Copy Trip ID'}</button>
        <button id="ta-del" class="btn w-full" style="background: var(--danger-bg); color: var(--danger); border:1.5px solid color-mix(in srgb, var(--danger) 35%, transparent);">${icon('trash-2', 'w-4 h-4')} ${lang==='th' ? 'ลบทริป' : 'Delete trip'}</button>
      </div>
    </div>
  `);
  queueIcons();
  const closeAll = () => sheet.close();
  document.getElementById('ta-open')?.addEventListener('click', () => { closeAll(); location.hash = `#/trip/${trip.id}/dashboard`; });
  document.getElementById('ta-edit')?.addEventListener('click', () => {
    closeAll();
    setTimeout(() => openTripForm(trip, { onSaved: async () => { await onChanged?.(); } }), 240);
  });
  document.getElementById('ta-dup')?.addEventListener('click', async () => {
    const ok = await confirmAction({
      title: lang==='th' ? 'ทำสำเนาทริปนี้?' : 'Duplicate this trip?',
      message: lang==='th' ? 'คัดลอกสมาชิกและแผนการเดินทางไปยังทริปใหม่' : 'Copies members and itinerary into a new trip.',
      confirmText: lang==='th' ? 'ทำสำเนา' : 'Duplicate', icon: 'copy'
    });
    if (!ok) return;
    const tLoad = toast.loading(lang==='th' ? 'กำลังคัดลอก...' : 'Duplicating...');
    try {
      const newId = await duplicateTrip(trip, currentUser.uid, { nameSuffix: lang==='th' ? ' (สำเนา)' : ' (copy)' });
      tLoad.close();
      closeAll();
      toast.success(lang==='th' ? 'ทำสำเนาแล้ว' : 'Duplicated');
      await onChanged?.();
      location.hash = `#/trip/${newId}/dashboard`;
    } catch (e) { tLoad.close(); toast.error(e.message); }
  });
  document.getElementById('ta-id')?.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(trip.id); toast.success(lang==='th' ? 'คัดลอก Trip ID แล้ว' : 'Trip ID copied'); } catch { toast.error('Copy failed'); }
  });
  document.getElementById('ta-del')?.addEventListener('click', async () => {
    const ok = await confirmAction({
      title: lang==='th' ? `ลบทริป "${trip.name}" ?` : `Delete "${trip.name}"?`,
      message: lang==='th' ? 'ลบแผนการเดินทาง ค่าใช้จ่าย สมาชิก และเอกสารทั้งหมดของทริปนี้ถาวร' : 'Permanently removes itinerary, expenses, members and documents.',
      detail: `Trip ID: <b>${escapeHtml(trip.id)}</b>`,
      confirmText: lang==='th' ? 'ลบทริป' : 'Delete trip', danger: true, icon: 'trash-2'
    });
    if (!ok) return;
    const tLoad = toast.loading(lang==='th' ? 'กำลังลบทริป...' : 'Deleting trip...');
    try {
      const res = await deleteTrip(trip.id);
      tLoad.close();
      if (currentTripId === trip.id) setTrip(null);
      closeAll();
      toast.success(lang==='th' ? 'ลบทริปแล้ว' : 'Trip deleted');
      if (res?.warnings?.length) toast.warning(lang==='th' ? 'ลบข้อมูลย่อยบางส่วนไม่สำเร็จ' : 'Some sub-data could not be deleted');
      await onChanged?.();
    } catch (e) { tLoad.close(); toast.error(e.message); }
  });
}

async function renderTripSelector() {
  if (!isFirebaseConfigured) return renderConfigNeeded();
  if (!currentUser) { location.hash = '#/login'; return; }
  const token = beginRender();
  const lang = getLang();
  if (headerSubtitle) headerSubtitle.textContent = lang === 'th' ? 'ทริปของฉัน' : 'My trips';

  appEl.innerHTML = `
    <div class="page-enter">
      <div class="mb-7">
        ${renderPageScene('trips', { lang, title: `${icon('compass', 'w-5 h-5')} ${t('selectTrip')}`,
          subtitle: lang === 'th' ? 'เลือกทริปที่อยากจัดการ หรือสร้างทริปใหม่' : 'Pick a trip to manage, or create a new one',
          actions: `<button id="create-trip-btn" class="btn btn-primary">${icon('plus', 'w-4 h-4')} ${t('createTrip')}</button>` })}
      </div>
      <div id="trip-grid" class="grid md:grid-cols-2 lg:grid-cols-3 gap-5 mb-5"></div>

      <div class="card p-5 space-y-3" id="join-trip-card">
        <h3 class="font-bold flex items-center gap-2">${icon('ticket', 'w-4 h-4')} ${lang === 'th' ? 'เข้าร่วมทริปด้วยรหัสเชิญ' : 'Join a trip with an invite code'}</h3>
        <p class="text-xs text-[var(--text-secondary)]">${lang === 'th'
          ? 'ขอรหัส 6 ตัวจากแอดมินทริป แล้วส่งคำขอเข้าร่วม — แอดมินกดอนุมัติแล้วคุณจะเห็นทริปนี้ทันที'
          : 'Ask the trip admin for the 6-character code, request to join, and the trip appears here once approved.'}</p>
        <div class="btn-row">
          <input id="join-code-input" class="input font-mono tracking-[0.3em] uppercase" maxlength="7" placeholder="ABC-123" autocomplete="off" aria-label="invite code">
          <button id="join-code-btn" class="btn btn-primary">${icon('log-in', 'w-4 h-4')} ${lang === 'th' ? 'ขอเข้าร่วม' : 'Request to join'}</button>
        </div>
        <div id="my-join-requests" class="space-y-2"></div>
        <div id="profile-rules-notice" class="hidden diag-row" data-status="warn">
          ${icon('shield-alert', 'w-4 h-4 shrink-0')}
          <div class="min-w-0">
            <div class="font-semibold">${lang === 'th' ? 'บัญชีของคุณยังไม่ถูกบันทึกลงไดเรกทอรี' : 'Your account is not in the directory yet'}</div>
            <div class="text-[11px] text-[var(--text-secondary)]">${lang === 'th'
              ? 'แอดมินจะยังค้นหาอีเมลของคุณไม่เจอ — ต้อง Publish Firestore Rules ก่อน'
              : 'The trip admin cannot find your email yet — Firestore rules must be published first.'}</div>
            <button id="profile-rules-help" class="btn btn-ghost btn-sm mt-1">${icon('wrench', 'w-3.5 h-3.5')} ${lang === 'th' ? 'ดูวิธีแก้' : 'How to fix'}</button>
          </div>
        </div>
      </div>
    </div>
  `;
  queueIcons();

  bind('create-trip-btn', 'click', () => openTripForm(null, { onSaved: () => renderTripSelector() }));

  let tripsCache = [];

  // ---- join with an invite code ----
  async function renderMyJoinRequests() {
    const box = document.getElementById('my-join-requests');
    if (!box) return;
    const requests = await listMyJoinRequests(currentUser.uid);
    if (isStale(token)) return;
    // Once the admin approves, the trip shows up in the list — drop the badge.
    const joinedIds = new Set(tripsCache.map(t => t.id));
    const pending = requests.filter(r => !joinedIds.has(r.tripId || r.id));
    box.innerHTML = pending.length ? pending.map(r => `
      <div class="diag-row" data-join-request="${escapeHtml(r.tripId || r.id)}">
        ${icon(r.status === 'rejected' ? 'x-circle' : 'clock', 'w-4 h-4 shrink-0')}
        <div class="min-w-0">
          <div class="font-semibold">${escapeHtml(r.tripName || r.tripId || '')}</div>
          <div class="text-[11px] text-[var(--text-secondary)]">${r.status === 'rejected'
            ? (lang === 'th' ? 'แอดมินปฏิเสธคำขอ' : 'The admin declined this request')
            : (lang === 'th' ? 'รอแอดมินอนุมัติ' : 'Waiting for the admin to approve')}</div>
        </div>
        <button class="btn btn-ghost btn-sm ml-auto" data-cancel-request="${escapeHtml(r.tripId || r.id)}">${lang === 'th' ? 'ยกเลิก' : 'Cancel'}</button>
      </div>`).join('') : '';
    box.querySelectorAll('[data-cancel-request]').forEach(btn => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        try {
          await cancelJoinRequest(btn.dataset.cancelRequest, currentUser.uid);
          toast.info(lang === 'th' ? 'ยกเลิกคำขอแล้ว' : 'Request cancelled');
          renderMyJoinRequests();
        } catch (e) { toast.error(e.message); btn.disabled = false; }
      });
    });
  }

  let foundTrip = null;
  bind('join-code-btn', 'click', async () => {
    const input = document.getElementById('join-code-input');
    const btn = document.getElementById('join-code-btn');
    const code = normalizeInviteCode(input?.value || '');
    if (!isValidInviteCode(code)) {
      toast.warning(lang === 'th' ? 'รหัสเชิญมี 6 ตัวอักษร เช่น ABC-123' : 'The invite code has 6 characters, e.g. ABC-123');
      return;
    }
    btn.disabled = true;
    const tLoad = toast.loading(lang === 'th' ? 'กำลังค้นหาทริป...' : 'Looking for the trip...');
    try {
      const trip = await findTripByInviteCode(code);
      foundTrip = trip;
      tLoad.close();
      if (!trip) {
        toast.error(lang === 'th' ? 'ไม่พบทริปที่ใช้รหัสนี้ — ตรวจรหัสอีกครั้ง' : 'No trip uses this code — please check it');
        btn.disabled = false;
        return;
      }
      if (trip.inviteEnabled === false) {
        toast.error(lang === 'th' ? 'ทริปนี้ปิดรับสมาชิกใหม่แล้ว' : 'This trip is closed for new members');
        btn.disabled = false;
        return;
      }
      if ((trip.memberUids || []).includes(currentUser.uid)) {
        toast.success(lang === 'th' ? 'คุณเป็นสมาชิกทริปนี้อยู่แล้ว' : 'You are already a member of this trip');
        location.hash = `#/trip/${trip.id}/dashboard`;
        return;
      }
      const ok = await confirmAction({
        title: lang === 'th' ? `ขอเข้าร่วม "${trip.name}" ?` : `Join "${trip.name}"?`,
        message: lang === 'th'
          ? 'ระบบจะส่งคำขอไปให้แอดมินทริปอนุมัติ'
          : 'A request will be sent to the trip admin for approval.',
        detail: `${escapeHtml(trip.startDate || '')} → ${escapeHtml(trip.endDate || '')}`,
        confirmText: lang === 'th' ? 'ส่งคำขอ' : 'Send request', icon: 'ticket'
      });
      if (!ok) { btn.disabled = false; return; }
      await requestToJoin(trip, currentUser);
      confetti({ y: 160 });
      toast.success(lang === 'th' ? 'ส่งคำขอแล้ว! รอแอดมินอนุมัติ' : 'Request sent! Waiting for approval');
      input.value = '';
      btn.disabled = false;
      renderMyJoinRequests();
    } catch (e) {
      tLoad.close();
      btn.disabled = false;
      if (isPermissionError(e)) {
        toast.error(lang === 'th' ? 'Firestore Rules ยังไม่อนุญาต — ต้อง Publish กฎก่อน' : 'Firestore rules deny this — publish the rules first');
        await showRulesHelpSheet({ lang, trip: foundTrip, action: 'join' });
      } else {
        toast.error(e.message);
      }
    }
  });

  renderMyJoinRequests();

  const grid = document.getElementById('trip-grid');
  if (!grid) return;
  grid.innerHTML = `<div class="card p-6"><div class="skeleton h-24 mb-4"></div><div class="skeleton h-4 mb-2"></div><div class="skeleton h-3"></div></div>`.repeat(3);

  const tripCardHtml = (trip, idx, compact = false) => {
    const baseColor = trip.themeColor || '#8bb89a';
    const c = computeCountdown({ startDate: trip.startDate, endDate: trip.endDate, createdAt: trip.createdAt });
    const countdownText = trip.startDate
      ? (c.phase === 'before' ? (lang==='th' ? `อีก ${c.days} วัน` : `${c.days} days`) : (c.phase === 'during' ? (lang==='th' ? 'กำลังเดินทาง' : 'On trip') : (lang==='th' ? 'ผ่านมาแล้ว' : 'Past')))
      : '';
    return `
      <div class="card card-hover p-0 overflow-hidden cursor-pointer group trip-card" data-trip="${trip.id}" style="animation-delay: ${idx * 0.06}s" role="button" tabindex="0" aria-label="${escapeHtml(trip.name)}">
        <div class="${compact ? 'h-28' : 'h-36'} relative overflow-hidden" style="background: linear-gradient(135deg, ${baseColor}, color-mix(in srgb, ${baseColor} 55%, #ffffff));">
          ${trip.coverImage ? `<img src="${escapeHtml(trip.coverImage)}" class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" alt="" loading="lazy" onerror="this.style.display='none'">` : ''}
          <div class="absolute inset-0" style="background: linear-gradient(to top, rgba(0,0,0,0.45), transparent 55%);"></div>
          ${!compact ? `<div class="absolute top-3 right-3 flex items-center gap-1.5">
            ${countdownText ? `<span class="badge bg-white/90 backdrop-blur text-[10px]" style="border-color:transparent;color:#333;">${icon('hourglass', 'w-3 h-3')} ${countdownText}</span>` : ''}
            <button class="trip-menu-btn" data-trip-menu="${trip.id}" aria-label="เมนูทริป" title="เมนู">${icon('more-vertical', 'w-4 h-4')}</button>
          </div>` : ''}
          <div class="absolute bottom-3 left-3 right-3"><h3 class="font-bold text-white ${compact ? 'text-sm' : 'text-[16px]'} leading-tight" style="font-family: var(--font-display); text-shadow: 0 1px 6px rgba(0,0,0,0.35);">${escapeHtml(trip.name)}</h3></div>
        </div>
        <div class="${compact ? 'p-3' : 'p-4'}">
          ${(trip.country || trip.city) ? `<p class="meta-line">${icon('globe', 'w-3 h-3')} <span class="truncate">${escapeHtml(trip.country || '')}${trip.city ? ' • ' + escapeHtml(trip.city) : ''}</span></p>` : ''}
          <p class="meta-line ${compact ? 'mt-0.5' : 'mt-1'}">${icon('calendar', 'w-3 h-3')} ${escapeHtml(trip.startDate || '?')} ${icon('arrow-right', 'w-3 h-3')} ${escapeHtml(trip.endDate || '?')}</p>
          ${!compact ? `
          <div class="flex items-center gap-2 mt-3 flex-wrap">
            <span class="text-[11px] px-2.5 py-1 rounded-full bg-[var(--bg-secondary)] font-semibold flex items-center gap-1">${icon('banknote', 'w-3 h-3')} ${escapeHtml(trip.baseCurrency || 'THB')}</span>
            <span class="text-[11px] px-2.5 py-1 rounded-full bg-[var(--bg-secondary)] font-semibold flex items-center gap-1">${icon('users', 'w-3 h-3')} ${(trip.memberUids || []).length || 1}</span>
            <span class="text-[11px] px-2.5 py-1 rounded-full font-bold flex items-center gap-1 ml-auto" style="background: var(--primary-light); color: var(--primary-strong);">${icon('log-in', 'w-3 h-3')} ${lang==='th' ? 'เปิดทริป' : 'Open'}</span>
          </div>` : ''}
        </div>
      </div>`;
  };

  const attachTripCards = (root) => {
    root.querySelectorAll('[data-trip]').forEach(card => {
      const go = () => { location.hash = `#/trip/${card.dataset.trip}/dashboard`; };
      card.addEventListener('click', (e) => { if (e.target.closest('[data-trip-menu]')) return; go(); });
      card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
      const menuBtn = card.querySelector('[data-trip-menu]');
      if (menuBtn) menuBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const trips = await loadTripsForMenus();
        const trip = trips.find(x => x.id === menuBtn.dataset.tripMenu);
        if (trip) openTripActions(trip, { onChanged: () => renderTripSelector() });
      });
    });
  };

  const loadTripsForMenus = async () => tripsCache;

  // A background refresh (SWR) can land while the cached list is on screen.
  const onTripsUpdated = (e) => {
    const fresh = e?.detail;
    if (!Array.isArray(fresh) || !fresh.length) return;
    if (JSON.stringify(fresh.map(t => [t.id, t.updatedAt?.seconds || t.updatedAt])) ===
        JSON.stringify(tripsCache.map(t => [t.id, t.updatedAt?.seconds || t.updatedAt]))) return;
    renderTripSelector();
  };
  window.addEventListener('trips:updated', onTripsUpdated);
  document.addEventListener('routechange', () => window.removeEventListener('trips:updated', onTripsUpdated), { once: true });

  try {
    const trips = await listTrips(currentUser.uid, false);
    if (isStale(token)) return;
    tripsCache = trips;
    if (!trips.length) {
      grid.innerHTML = `<div class="col-span-full">${renderEmptyState({
        icon: 'compass',
        title: t('noTrip'),
        desc: t('createFirstTrip'),
        actionHtml: `<button id="empty-create" class="btn btn-primary mt-4">${icon('plus', 'w-4 h-4')} ${t('createTrip')}</button>`
      })}</div>`;
      bind('empty-create', 'click', () => openTripForm(null, { onSaved: () => renderTripSelector() }));
      queueIcons();
      return;
    }
    grid.innerHTML = trips.map((trip, idx) => tripCardHtml(trip, idx)).join('');
    attachTripCards(grid);
    initReveal(grid);
    queueIcons();
    renderMyJoinRequests();   // hide requests for trips that are already accessible

  // Accounts that could not be written to Firestore (rules not published yet).
  if (window.__fujiProfileDenied) {
    const notice = document.getElementById('profile-rules-notice');
    if (notice) {
      notice.classList.remove('hidden');
      bind('profile-rules-help', 'click', () => showRulesHelpSheet({ lang }));
    }
  }
  } catch (e) {
    if (isStale(token)) return;
    console.error('List trips failed', e);
    let msg = e.message;
    let hint = '';
    if (e.code === 'permission-denied' || msg.includes('permission') || msg.includes('Missing') || msg.includes('insufficient')) {
      hint = `
        <div class="text-left mt-3 p-3 rounded-xl text-[11px] leading-relaxed" style="background: var(--warning-bg); border: 1px solid color-mix(in srgb, var(--warning) 35%, transparent);">
          <strong class="flex items-center gap-1">${icon('alert-triangle', 'w-3.5 h-3.5')} Firestore Rules ยังไม่ deploy</strong>
          ต้อง publish กฎใหม่ที่ Firebase Console &gt; Firestore &gt; Rules<br>
          <button id="trips-rules-help" class="btn btn-secondary btn-sm mt-2">${icon('shield-alert', 'w-4 h-4')} ดูวิธีแก้ทีละขั้น</button>
        </div>`;
      msg = 'ไม่มีสิทธิ์เข้าถึง — ต้อง deploy Firestore Rules';
    }
    if (msg.includes('index') || e.code === 'failed-precondition') {
      hint = `<div class="text-left mt-3 p-3 rounded-xl text-[11px]" style="background: var(--info-light); border: 1px solid color-mix(in srgb, var(--info) 35%, transparent);"><strong class="flex items-center gap-1">${icon('database', 'w-3.5 h-3.5')} ต้องสร้าง Firestore Index</strong>รัน <code>firebase deploy --only firestore:indexes</code></div>`;
      msg = 'ต้องสร้าง Index — ดูคำสั่งใน Console';
    }
    bind('trips-rules-help', 'click', () => showRulesHelpSheet({ lang }));
    try {
      const cached = localStorage.getItem('fuji_trips_cache');
      if (cached) {
        const { data } = JSON.parse(cached);
        if (data?.length) {
          tripsCache = data;
          grid.innerHTML = `
            <div class="col-span-full flex items-start gap-2 p-3 rounded-xl text-xs" style="background: var(--warning-bg); border: 1px solid color-mix(in srgb, var(--warning) 35%, transparent);">
              <span style="color: var(--warning); margin-top:1px;">${icon('cloud-off', 'w-4 h-4')}</span>
              <span>${lang==='th' ? 'แสดงข้อมูลจากแคช' : 'Showing cached trips'} • ${data.length} ${lang==='th' ? 'ทริป' : 'trips'}</span>
            </div>
            ${data.map((trip, idx) => tripCardHtml(trip, idx, true)).join('')}
          `;
          attachTripCards(grid);
          const retryDiv = document.createElement('div');
          retryDiv.className = 'col-span-full flex gap-2 justify-center mt-4';
          retryDiv.innerHTML = `<button id="retry-trips" class="btn btn-primary btn-sm">${icon('refresh-cw', 'w-4 h-4')} ${lang==='th' ? 'ลองใหม่อีกครั้ง' : 'Retry'}</button>`;
          grid.appendChild(retryDiv);
          bind('retry-trips', 'click', () => renderTripSelector());
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
    bind('retry-trips', 'click', () => renderTripSelector());
    bind('clear-cfg-btn', 'click', () => { localStorage.removeItem('fuji_firebase_config'); location.reload(); });
    bind('show-rules', 'click', async () => {
      try {
        const res = await fetch('./firestore.rules');
        const rulesText = await res.text();
        showBottomSheet(`
          <h3 class="font-bold mb-2 flex items-center gap-2">${icon('scroll-text', 'w-4 h-4')} Firestore Rules — คัดลอกไป deploy</h3>
          <p class="text-xs mb-3 text-[var(--text-secondary)]">คัดลอกทั้งหมดไปวางใน Firebase Console &gt; Firestore &gt; Rules &gt; Publish</p>
          <pre class="p-3 rounded-xl text-[10px] overflow-auto whitespace-pre-wrap" style="background:#111;color:#8ce8a5;max-height:400px;">${escapeHtml(rulesText)}</pre>
          <button id="copy-rules-btn" class="btn btn-primary w-full mt-3 btn-sm">${icon('copy', 'w-4 h-4')} คัดลอก Rules</button>
        `);
        queueIcons();
        bind('copy-rules-btn', 'click', async () => {
          try { await navigator.clipboard.writeText(rulesText); toast.success('คัดลอก Rules แล้ว'); }
          catch { toast.error('คัดลอกไม่สำเร็จ'); }
        });
      } catch { toast.error('โหลด rules ไม่สำเร็จ'); }
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
  const token = beginRender();
  const lang = getLang();
  await loadTrip(tripId);
  if (isStale(token)) return;
  const trip = currentTrip;
  const currency = trip?.baseCurrency || 'THB';
  const th = (a, b) => (lang === 'th' ? a : b);

  appEl.innerHTML = `
    <div class="page-enter space-y-5">
      <!-- HERO -->
      <div class="hero-card" style="--hero-color:${trip?.themeColor || 'var(--primary-raw)'};">
        ${trip?.coverImage ? `<img src="${escapeHtml(trip.coverImage)}" class="hero-bg" alt="" onerror="this.style.display='none'">` : ''}
        <div class="hero-overlay"></div>
        <div class="hero-content">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="badge" style="background:rgba(255,255,255,.9);color:#333;border-color:transparent;">${icon('flag', 'w-3 h-3')} ${escapeHtml(trip?.status || 'draft')}</span>
                ${trip?.country ? `<span class="badge" style="background:rgba(255,255,255,.9);color:#333;border-color:transparent;">${icon('globe', 'w-3 h-3')} ${escapeHtml(trip.country)}${trip.city ? ' • ' + escapeHtml(trip.city) : ''}</span>` : ''}
              </div>
              <h1 class="text-3xl font-bold tracking-tight mt-2 truncate" style="font-family: var(--font-display); color:#fff;">${escapeHtml(trip?.name || t('dashboard'))}</h1>
              <div class="flex items-center gap-3 mt-1.5 flex-wrap text-sm" style="color:rgba(255,255,255,.92);">
                <span class="meta-line" style="color:inherit;">${icon('calendar', 'w-3.5 h-3.5')} ${escapeHtml(trip?.startDate || '')} ${icon('arrow-right', 'w-3 h-3')} ${escapeHtml(trip?.endDate || '')}</span>
                <span class="meta-line" style="color:inherit;">${icon('clock', 'w-3.5 h-3.5')} ${escapeHtml((trip?.timezone || '').replace('_',' '))}</span>
              </div>
            </div>
            <div class="btn-row hero-actions">
              <button id="dash-edit-trip" class="btn btn-sm" style="background:rgba(255,255,255,.92);color:#333;border-color:transparent;">${icon('pencil', 'w-4 h-4')} ${th('แก้ไขทริป','Edit trip')}</button>
              <button id="add-place-quick" class="btn btn-sm" style="background:rgba(255,255,255,.92);color:#333;border-color:transparent;">${icon('map-pin', 'w-4 h-4')} ${t('addPlace')}</button>
              <button id="add-expense-quick" class="btn btn-sm btn-primary">${icon('wallet', 'w-4 h-4')} ${t('addExpense')}</button>
            </div>
          </div>
        </div>
      </div>

      <!-- COUNTDOWN ANIMATION -->
      <div class="card p-4 md:p-5">
        <div class="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <h3 class="font-bold flex items-center gap-2"><span class="row-icon" style="width:30px;height:30px;border-radius:10px;">${icon('timer', 'w-4 h-4')}</span> ${t('countdown')} • ${th('วิ่งไปหาฟูจิ','Run to Fuji')}</h3>
          <div id="live-since" class="text-[11px] text-[var(--text-tertiary)] flex items-center gap-1.5">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" class="w-3 h-3" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
            <span data-live-label></span>
          </div>
        </div>
        <div id="countdown-scene"></div>
      </div>

      <!-- KPI TILES -->
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <div class="kpi-tile" data-kpi="total">
          <span class="kpi-icon" style="background: var(--primary-light); color: var(--primary-strong);">${icon('wallet', 'w-4 h-4')}</span>
          <p class="kpi-label">${t('totalExpense')}</p>
          <h3 class="kpi-value" id="kpi-total">--</h3>
          <p class="kpi-sub" id="kpi-total-sub"></p>
        </div>
        <div class="kpi-tile" data-kpi="budget">
          <span class="kpi-mood" id="kpi-budget-mood"></span>
          <span class="kpi-icon" style="background: var(--info-light); color: var(--info);">${icon('piggy-bank', 'w-4 h-4')}</span>
          <p class="kpi-label">${th('งบคงเหลือ','Budget left')}</p>
          <h3 class="kpi-value" id="kpi-budget">--</h3>
          <div class="progress mt-2" style="height:6px;"><div class="progress-bar" id="kpi-budget-bar" style="width:0%;"></div></div>
          <p class="kpi-sub" id="kpi-budget-sub"></p>
        </div>
        <div class="kpi-tile" data-kpi="balance">
          <span class="kpi-mood" id="kpi-balance-mood"></span>
          <span class="kpi-icon" style="background: var(--success-light); color: var(--success);">${icon('scale', 'w-4 h-4')}</span>
          <p class="kpi-label">${t('myBalance')}</p>
          <h3 class="kpi-value" id="kpi-balance">--</h3>
          <p class="kpi-sub" id="kpi-balance-sub"></p>
        </div>
        <div class="kpi-tile" data-kpi="plan">
          <span class="kpi-icon" style="background: var(--warning-light); color: var(--warning);">${icon('map-pinned', 'w-4 h-4')}</span>
          <p class="kpi-label">${th('แผนการเดินทาง','Itinerary')}</p>
          <h3 class="kpi-value" id="kpi-places">--</h3>
          <p class="kpi-sub" id="kpi-places-sub"></p>
        </div>
      </div>

      <!-- MY WALLET: trip total vs MY totals vs MY budget (a request) -->
      <div class="card p-5" id="my-wallet-card">
        <div class="flex items-center justify-between gap-2 mb-3 flex-wrap">
          <h3 class="font-bold flex items-center gap-2">
            <span class="row-icon" style="width:30px;height:30px;border-radius:10px;background:var(--primary-light);color:var(--primary-strong);">${icon('user-round', 'w-4 h-4')}</span>
            ${th('กระเป๋าของฉัน','My wallet')}
            <span class="text-[10px] font-normal text-[var(--text-tertiary)]">${th('ยอดทริปรวม vs ยอดของฉัน vs งบของฉัน','trip total vs my totals vs my budget')}</span>
          </h3>
          <span id="my-wallet-mood"></span>
        </div>
        <div id="my-wallet" class="my-wallet-grid"><div class="skeleton h-16"></div></div>
      </div>

      <!-- TODAY / CURRENT -->
      <div class="grid md:grid-cols-2 gap-4">
        <div class="card p-5">
          <div class="flex items-center justify-between gap-2 mb-3">
            <h3 class="font-bold flex items-center gap-2"><span class="row-icon" style="width:30px;height:30px;border-radius:10px;">${icon('target', 'w-4 h-4')}</span> ${t('currentActivity')}</h3>
            <button id="dash-today-link" class="btn btn-ghost btn-sm text-xs">${icon('calendar-days', 'w-3.5 h-3.5')} ${th('ดูวันนี้','Today')}</button>
          </div>
          <div id="current-activity"><div class="skeleton h-14"></div></div>
          <div class="mt-4 pt-3 border-t" style="border-color:var(--border);">
            <div class="flex items-center justify-between text-xs mb-1.5">
              <span class="meta-line">${icon('plane', 'w-3.5 h-3.5')} ${th('ความคืบหน้าทริป','Trip progress')}</span>
              <span class="font-bold" id="trip-progress-label">--</span>
            </div>
            <div class="progress"><div class="progress-bar" id="trip-progress-bar" style="width:0%;"></div></div>
          </div>
        </div>
        <div class="card p-5">
          <div class="flex items-center justify-between gap-2 mb-3">
            <h3 class="font-bold flex items-center gap-2"><span class="row-icon" style="width:30px;height:30px;border-radius:10px;">${icon('sparkles', 'w-4 h-4')}</span> ${t('upNext')}</h3>
            <button id="dash-itinerary-link" class="btn btn-ghost btn-sm text-xs">${icon('map-pinned', 'w-3.5 h-3.5')} ${th('ดูแผนทั้งหมด','All plans')}</button>
          </div>
          <div id="upnext-list" class="stagger"><div class="skeleton h-14"></div></div>
        </div>
      </div>

      <!-- SPEND BY CATEGORY + PLANNED VS ACTUAL -->
      <div class="grid md:grid-cols-2 gap-4">
        <div class="card p-5">
          <h3 class="font-bold mb-3 flex items-center gap-2"><span class="row-icon" style="width:30px;height:30px;border-radius:10px;">${icon('pie-chart', 'w-4 h-4')}</span> ${th('ค่าใช้จ่ายตามหมวด','Spend by category')}</h3>
          <div id="category-stats"><div class="skeleton h-24"></div></div>
        </div>
        <div class="card p-5">
          <h3 class="font-bold mb-3 flex items-center gap-2"><span class="row-icon" style="width:30px;height:30px;border-radius:10px;">${icon('bar-chart-3', 'w-4 h-4')}</span> ${th('ประมาณการ vs จ่ายจริง','Estimated vs actual')}</h3>
          <div id="estimate-compare"></div>
          <div id="summary-stats" class="mt-4 pt-3 border-t text-sm space-y-1" style="border-color:var(--border);"></div>
        </div>
      </div>

      <!-- MEMBERS -->
      <div class="card p-5">
        <div class="flex items-center justify-between gap-2 mb-4">
          <h3 class="font-bold flex items-center gap-2"><span class="row-icon" style="width:30px;height:30px;border-radius:10px;">${icon('users', 'w-4 h-4')}</span> ${th('สมาชิก • จ่ายไป / ต้องรับผิดชอบ','Members • paid / share')}</h3>
          <button id="dash-members-link" class="btn btn-ghost btn-sm text-xs">${icon('settings-2', 'w-3.5 h-3.5')} ${th('จัดการสมาชิก','Manage')}</button>
        </div>
        <div id="member-board-content" class="space-y-3 stagger"><div class="skeleton h-16"></div></div>
      </div>

      <!-- RECENT EXPENSES -->
      <div class="card p-5">
        <div class="flex items-center justify-between gap-2 mb-3">
          <h3 class="font-bold flex items-center gap-2"><span class="row-icon" style="width:30px;height:30px;border-radius:10px;">${icon('receipt', 'w-4 h-4')}</span> ${th('รายการล่าสุด','Recent expenses')}</h3>
          <button id="dash-expenses-link" class="btn btn-ghost btn-sm text-xs">${icon('wallet', 'w-3.5 h-3.5')} ${th('ดูทั้งหมด','View all')}</button>
        </div>
        <div id="recent-expenses" class="space-y-2 stagger"><div class="skeleton h-12"></div></div>
      </div>
    </div>
  `;
  queueIcons();
  initReveal(appEl);
  if (isStale(token)) return;

  bind('dash-edit-trip', 'click', () => openTripForm(trip, { onSaved: () => renderDashboard(params) }));
  bind('add-place-quick', 'click', () => { location.hash = `#/trip/${tripId}/itinerary?action=add`; });
  bind('add-expense-quick', 'click', () => { location.hash = `#/trip/${tripId}/expenses/add`; });
  bind('dash-itinerary-link', 'click', () => { location.hash = `#/trip/${tripId}/itinerary`; });
  bind('dash-today-link', 'click', () => { location.hash = `#/trip/${tripId}/itinerary?date=${dayjs().format('YYYY-MM-DD')}`; });
  bind('dash-members-link', 'click', () => { location.hash = `#/trip/${tripId}/members`; });
  bind('dash-expenses-link', 'click', () => { location.hash = `#/trip/${tripId}/expenses`; });

  // Countdown scene (independent of Firestore so it always renders)
  const cd = mountCountdown('countdown-scene', {
    startDate: trip?.startDate, endDate: trip?.endDate, createdAt: trip?.createdAt, lang
  });
  document.addEventListener('routechange', () => cd.destroy(), { once: true });
  // Live "time left" text. Written once per minute as plain text — rebuilding the
  // markup (and re-running Lucide) every second made the icons flicker non-stop.
  const tickLive = () => {
    const node = document.getElementById('live-since');
    if (!node) return false;
    const c = computeCountdown({ startDate: trip?.startDate, endDate: trip?.endDate, createdAt: trip?.createdAt, now: new Date() });
    const label = c.phase === 'before'
      ? `${th('เหลืออีก','Left')} ${c.days}${th(' วัน ',' d ')}${String(c.hours).padStart(2,'0')}:${String(c.minutes).padStart(2,'0')}`
      : countdownHeadline(c, lang);
    const target = node.querySelector('[data-live-label]') || node;
    if (target.dataset.label !== label) {
      target.dataset.label = label;
      target.textContent = label;
    }
    return true;
  };
  tickLive();
  const liveTimer = setInterval(() => { if (!tickLive()) clearInterval(liveTimer); }, 30000);
  document.addEventListener('routechange', () => clearInterval(liveTimer), { once: true });

  // Trip progress (independent of Firestore too)
  try {
    const days = getTripDays(trip?.startDate, trip?.endDate);
    const totalDays = days.length || 0;
    const today = dayjs().format('YYYY-MM-DD');
    const idx = days.findIndex(d => dayjs(d).format('YYYY-MM-DD') === today);
    let pct = 0;
    if (trip?.startDate && trip?.endDate) {
      if (dayjs(today).isBefore(dayjs(trip.startDate))) pct = 0;
      else if (dayjs(today).isAfter(dayjs(trip.endDate))) pct = 100;
      else pct = Math.round(((idx + 1) / Math.max(1, totalDays)) * 100);
    }
    setText('trip-progress-label', `${pct}% • ${th('วันที่','Day')} ${idx >= 0 ? idx + 1 : Math.max(1, Math.min(totalDays, 1))}/${totalDays}`);
    const bar = document.getElementById('trip-progress-bar');
    if (bar) requestAnimationFrame(() => { bar.style.width = `${pct}%`; });
  } catch (e) { console.warn('progress', e); }

  /* ---------------- Data sections (each guarded separately) ---------------- */
  let expenses = [], members = [], items = [];

  // Trip groups, money and the itinerary are independent — fetch them together
  // (all three are served from cache on a revisit, so this is instant).
  const [categoriesRes, dataRes, itemsRes] = await Promise.allSettled([
    loadTripCategories(tripId),
    fetchSettlementData(tripId),
    fetchItinerary(tripId, null)
  ]);
  if (isStale(token)) return;

  if (categoriesRes.status === 'rejected') console.warn('dashboard categories failed', categoriesRes.reason);
  if (dataRes.status === 'fulfilled') {
    expenses = dataRes.value.expenses || [];
    members = dataRes.value.members || [];
  } else {
    console.error('dashboard expenses failed', dataRes.reason);
    toast.error(th('โหลดข้อมูลค่าใช้จ่ายไม่สำเร็จ: ', 'Could not load expenses: ') + (dataRes.reason?.message || ''));
  }
  if (itemsRes.status === 'fulfilled') {
    items = itemsRes.value || [];
    items.sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.order || 0) - (b.order || 0));
  } else {
    console.error('dashboard itinerary failed', itemsRes.reason);
  }

  if (isStale(token)) return;

  try {
    renderDashboardData({ tripId, trip, expenses, members, items, currency, lang, token, params });
  } catch (e) {
    console.error('dashboard render failed', e);
    toast.error(th('โหลด Dashboard ไม่สำเร็จ: ', 'Dashboard error: ') + e.message);
    const grid = document.getElementById('dashboard-grid') || document.getElementById('category-stats');
    if (grid) grid.innerHTML = `<div class="col-span-full card p-5 text-center"><p class="text-sm font-semibold" style="color:var(--danger);">${escapeHtml(e.message)}</p><button id="dash-retry" class="btn btn-secondary btn-sm mt-3">${icon('refresh-cw', 'w-4 h-4')} ${th('ลองใหม่','Retry')}</button></div>`;
    bind('dash-retry', 'click', () => router.handle());
    queueIcons();
  }
}

function renderDashboardData({ tripId, trip, expenses, members, items, currency, lang, token, params }) {
  const th = (a, b) => (lang === 'th' ? a : b);
  if (isStale(token)) return;
  const rate = resolveTripThbRate(trip, expenses, currency);
  const originalExpenses = expenses;
  expenses = expensesInThb(expenses, trip);
  const fmt = minor => formatCurrency(minor || 0, 'THB');
  const secondary = minor => currency === 'THB' || !rate ? '' : formatCurrency(convertCurrency(minor, 'THB', currency, 1 / rate), currency);
  const thbTag = minor => origTextChipHtml(secondary(minor));
  const thbOfBudget = secondary;

  const actualMinor = sumExpenses(expenses, { estimatedOnly: false });
  const estimatedMinor = sumExpenses(expenses, { estimatedOnly: true });
  const totalMinor = actualMinor + estimatedMinor;

  // Per-member paid/share totals (My wallet + the member board share these).
  const paidBy = {}, shareBy = {};
  expenses.forEach(e => {
    for (const p of expensePayments(e)) paidBy[p.memberId] = (paidBy[p.memberId] || 0) + p.amountMinor;
    (e.allocations || []).forEach(a => { shareBy[a.memberId] = (shareBy[a.memberId] || 0) + (a.amountMinor || 0); });
  });
  const myId = currentUser.uid;
  const myPaid = paidBy[myId] || 0;
  const myShare = shareBy[myId] || 0;

  /* ---- KPI: total ---- */
  const totalEl = document.getElementById('kpi-total');
  if (totalEl) countUp(totalEl, totalMinor, { formatter: (v) => fmt(Math.round(v)) });
  if (totalEl && currency !== 'THB') {
    // Keep the original trip currency below the baht headline.
    const tag = document.getElementById('kpi-total-thb');
    const label = secondary(totalMinor);
    if (!tag) {
      const span = document.createElement('div');
      span.id = 'kpi-total-thb';
      span.className = 'money-secondary';
      span.textContent = label;
      totalEl.insertAdjacentElement('afterend', span);
    } else tag.textContent = label;
  }
  setHtml('kpi-total-sub', `
    <span class="meta-line">${icon('check-circle', 'w-3 h-3')} ${th('จ่ายจริง','Actual')} ${fmt(actualMinor)}</span>
    <span class="meta-line">${icon('hourglass', 'w-3 h-3')} ${th('ประมาณการ','Estimated')} ${fmt(estimatedMinor)}</span>
    <span class="meta-line" style="color:var(--primary-strong);font-weight:700;">${icon('user', 'w-3 h-3')} ${th('ส่วนของฉัน','My share')} ${fmt(myShare)}${thbTag(myShare)}</span>
    <span class="meta-line">${icon('receipt', 'w-3 h-3')} ${expenses.length} ${th('รายการ','items')}</span>
  `);

  /* ---- KPI: budget ---- */
  const budgetBase = Number(trip?.budgetTotal) > 0
    ? Number(trip.budgetTotal)
    : (Number(trip?.budgetPerPerson) > 0 ? Number(trip.budgetPerPerson) * Math.max(1, members.length) : 0);
  const budget = toThbMinor(budgetBase, currency, rate) || 0;
  const budgetEl = document.getElementById('kpi-budget');
  /** Secondary trip-currency line under a baht KPI. */
  const setKpiThb = (hostEl, id, label) => {
    if (!hostEl) return;
    const shown = /^\s*[฿]|THB/.test(label || '') || currency === 'THB';
    const existing = document.getElementById(id);
    if (!label || shown) { existing?.remove(); return; }
    if (existing) existing.textContent = label;
    else {
      const span = document.createElement('div');
      span.id = id;
      span.className = 'money-secondary';
      span.textContent = label;
      hostEl.insertAdjacentElement('afterend', span);
    }
  };
  if (budget > 0) {
    // Both budget and expenses have been normalized to Thai satang.
    const spend = totalMinor;
    const left = budget - spend;
    if (budgetEl) budgetEl.textContent = fmt(Math.max(0, left));
    const pct = Math.min(100, Math.round((spend / budget) * 100));
    const bar = document.getElementById('kpi-budget-bar');
    if (bar) { bar.style.width = `${pct}%`; if (left < 0) bar.style.background = 'var(--danger)'; }
    // Comparison → animated mood face (a request): the budget "feeling" at a glance.
    const budgetMoodEl = document.getElementById('kpi-budget-mood');
    if (budgetMoodEl) budgetMoodEl.innerHTML = moodFaceHtml(budgetMood(spend, budget), { size: 36, lang });
    // งบคงเหลือต้องเห็นเป็นเงินบาทด้วย (แม้ทริปไม่ตั้งเรต) — a request.
    const leftThb = Math.max(0, left);
    setKpiThb(budgetEl, 'kpi-budget-thb', secondary(leftThb));
    setHtml('kpi-budget-sub', left >= 0
      ? `${th('ใช้ไป','Used')} ${pct}% • ${th('งบ','budget')} ${fmt(budget)}${budget !== totalMinor && thbOfBudget(budget) ? ` (≈ ${thbOfBudget(budget)})` : ''}`
      : `<span style="color:var(--danger);">${th('เกินงบ','Over budget')} ${fmt(-left)}${thbOfBudget(-left) ? ` (≈ ${thbOfBudget(-left)})` : ''}</span>`);
  } else {
    if (budgetEl) budgetEl.textContent = '—';
    setHtml('kpi-budget-sub', `<button id="kpi-set-budget" class="link-btn">${icon('plus', 'w-3 h-3')} ${th('ตั้งงบประมาณ','Set budget')}</button>`);
    bind('kpi-set-budget', 'click', () => { location.hash = `#/trip/${tripId}/settings`; });
    const bar = document.getElementById('kpi-budget-bar');
    if (bar) bar.style.width = '0%';
  }

  /* ---- KPI: my balance ---- */
  let balances = [];
  try {
    balances = calculateSettlement(expenses, members.map(m => ({ id: m.id }))).balances || [];
  } catch (e) { console.warn('settlement calc failed', e); }
  const myBal = balances.find(b => b.memberId === currentUser.uid);
  const balEl = document.getElementById('kpi-balance');
  if (balEl) {
    balEl.textContent = fmt(myBal?.net || 0);
    balEl.style.color = (myBal?.net || 0) >= 0 ? 'var(--success)' : 'var(--danger)';
    const existing = document.getElementById('kpi-balance-thb');
    if (currency !== 'THB') {
      const label = secondary(myBal?.net || 0);
      if (existing) existing.textContent = label;
      else {
        const span = document.createElement('div');
        span.id = 'kpi-balance-thb';
        span.className = 'money-secondary';
        span.textContent = label;
        balEl.insertAdjacentElement('afterend', span);
      }
    } else existing?.remove();
  }
  setHtml('kpi-balance-sub', `<span class="meta-line">${myBal?.net >= 0 ? icon('arrow-down-left', 'w-3 h-3') + ' ' + th('จะได้รับคืน','gets back') : icon('arrow-up-right', 'w-3 h-3') + ' ' + th('ต้องจ่ายเพิ่ม','needs to pay')}</span>`);
  const balMoodEl = document.getElementById('kpi-balance-mood');
  if (balMoodEl) balMoodEl.innerHTML = moodFaceHtml(balanceMood(myBal?.net || 0), { size: 36, lang });

  /* ---- My wallet: trip total vs MY totals vs MY budget (requests #7 + #8) ---- */
  const memberBudgets = (trip?.memberBudgets && typeof trip.memberBudgets === 'object') ? trip.memberBudgets : {};
  const hasOwnBudget = Number(memberBudgets[myId]) > 0;
  const myBudgetBase = hasOwnBudget
    ? Number(memberBudgets[myId])
    : (Number(trip?.budgetPerPerson) > 0 ? Number(trip.budgetPerPerson) : 0);
  const myBudget = toThbMinor(myBudgetBase, currency, rate) || 0;
  const myNet = myBal?.net || 0;
  const myLeft = myBudget - myShare;
  const myPct = myBudget > 0 ? Math.min(100, Math.round((myShare / myBudget) * 100)) : 0;
  setHtml('my-wallet', `
    <div class="my-wallet-tile">
      <span class="my-wallet-label">${icon('globe', 'w-3 h-3')} ${th('ยอดทริปรวม','Trip total')}</span>
      <b class="my-wallet-value">${fmt(totalMinor)}</b>
      ${thbTag(totalMinor)}
      <span class="my-wallet-sub">${th('ทุกใบของทุกคน','everyone, all bills')}</span>
    </div>
    <div class="my-wallet-tile is-me">
      <span class="my-wallet-label">${icon('user', 'w-3 h-3')} ${th('ยอดของฉัน','My total')}</span>
      <b class="my-wallet-value">${fmt(myShare)}</b>
      ${thbTag(myShare)}
      <span class="my-wallet-sub">${th('สำรองจ่ายไป','I fronted')} <b>${fmt(myPaid)}</b>${thbTag(myPaid)}</span>
    </div>
    <div class="my-wallet-tile">
      <span class="my-wallet-label">${icon('scale', 'w-3 h-3')} ${th('คงเหลือของฉัน','My balance')}</span>
      <b class="my-wallet-value" style="color:${myNet >= 0 ? 'var(--success)' : 'var(--danger)'};">${myNet >= 0 ? '+' : '−'}${fmt(Math.abs(myNet))}</b>
      ${thbTag(Math.abs(myNet))}
      <span class="my-wallet-sub">${myNet >= 0 ? th('จะได้รับคืนจากเพื่อน','gets back from the group') : th('ต้องจ่ายคืนให้เพื่อน','owes the group')}</span>
    </div>
    <div class="my-wallet-tile my-wallet-tile--budget">
      <span class="my-wallet-label">${icon('piggy-bank', 'w-3 h-3')} ${th('งบของฉัน','My budget')}${myBudget > 0 && !hasOwnBudget ? ` <i class="my-wallet-default">(${th('ค่าเริ่มต้นต่อคน','default per person')})</i>` : ''}</span>
      ${myBudget > 0 ? `
        <b class="my-wallet-value">${fmt(myBudget)}</b>
        <div class="progress mt-1.5" style="height:6px;"><div class="progress-bar" style="width:${myPct}%; ${myLeft < 0 ? 'background:var(--danger);' : ''}"></div></div>
        <span class="my-wallet-sub">${myLeft >= 0
          ? `${th('ใช้ไป','used')} ${myPct}% • ${th('เหลือ','left')} <b style="color:var(--success);">${fmt(myLeft)}</b>`
          : `<b style="color:var(--danger);">${th('เกินงบส่วนตัว','over personal budget')} ${fmt(-myLeft)}</b>`}${thbTag(myBudget)}</span>
      ` : `
        <b class="my-wallet-value">—</b>
        <span class="my-wallet-sub"><button id="my-wallet-set-budget" class="link-btn">${icon('plus', 'w-3 h-3')} ${th('ตั้งงบของฉัน','Set my budget')}</button></span>
      `}
    </div>
  `);
  bind('my-wallet-set-budget', 'click', () => { location.hash = `#/trip/${tripId}/settings`; });
  const myWalletMood = document.getElementById('my-wallet-mood');
  if (myWalletMood) myWalletMood.innerHTML = moodFaceHtml(myBudget > 0 ? budgetMood(myShare, myBudget) : balanceMood(myNet), { size: 42, lang });

  /* ---- KPI: places ---- */
  const placesEl = document.getElementById('kpi-places');
  if (placesEl) countUp(placesEl, items.length, { formatter: v => String(Math.round(v)) });
  const withCoord = items.filter(i => i.coordinates).length;
  setHtml('kpi-places-sub', `
    <span class="meta-line">${icon('calendar-days', 'w-3 h-3')} ${getTripDays(trip?.startDate, trip?.endDate).length} ${th('วัน','days')}</span>
    <span class="meta-line">${icon('users', 'w-3 h-3')} ${members.length} ${th('คน','people')}</span>
    <span class="meta-line">${icon('crosshair', 'w-3 h-3')} ${withCoord} ${th('มีพิกัด','mapped')}</span>
  `);

  /* ---- Current activity ---- */
  const todayStr = dayjs().format('YYYY-MM-DD');
  const todaysItems = items.filter(i => i.date === todayStr).sort((a, b) => new Date(a.startAt || 0) - new Date(b.startAt || 0));
  const now = dayjs();
  const current = todaysItems.find(i => i.startAt && i.endAt && dayjs(i.startAt).isBefore(now) && dayjs(i.endAt).isAfter(now));
  const nextItem = todaysItems.find(i => i.startAt && dayjs(i.startAt).isAfter(now));
  if (current) {
    const total = Math.max(1, dayjs(current.endAt).diff(dayjs(current.startAt)));
    const progress = Math.min(100, Math.max(2, Math.round((now.diff(dayjs(current.startAt)) / total) * 100)));
    setHtml('current-activity', `
      <div class="p-3 rounded-xl" style="background:var(--primary-light); border:1px solid color-mix(in srgb, var(--primary-raw) 30%, transparent);">
        <div class="flex items-center gap-2 font-semibold text-sm">${icon('map-pin', 'w-4 h-4')} <span class="truncate">${escapeHtml(current.title)}</span>
          <span class="badge badge-current text-[10px] ml-auto">${th('กำลังทำ','now')}</span></div>
        <div class="meta-line mt-1">${icon('clock', 'w-3 h-3')} ${formatTime(current.startAt, trip?.timezone)} – ${formatTime(current.endAt, trip?.timezone)}${current.address ? ` • ${icon('map-pin', 'w-3 h-3')} ${escapeHtml(current.address)}` : ''}</div>
        <div class="progress mt-2.5"><div class="progress-bar progress-striped" style="width:${progress}%"></div></div>
      </div>`);
  } else {
    const upcoming = nextItem || items.find(i => i.date > todayStr);
    setHtml('current-activity', upcoming
      ? `<div class="p-3 rounded-xl" style="background:var(--bg-secondary); border:1px solid var(--border);">
          <div class="meta-line">${icon('coffee', 'w-3.5 h-3.5')} ${th('ยังไม่มีกิจกรรมตอนนี้ • ถัดไป','Nothing now • next')}</div>
          <div class="font-semibold text-sm mt-1 truncate">${escapeHtml(upcoming.title)}</div>
          <div class="meta-line mt-0.5">${icon('calendar', 'w-3 h-3')} ${formatDate(upcoming.date, lang, trip?.timezone)} ${icon('clock', 'w-3 h-3')} ${formatTime(upcoming.startAt, trip?.timezone)}</div>
        </div>`
      : `<p class="text-sm text-[var(--text-secondary)] flex items-center gap-2">${icon('coffee', 'w-4 h-4')} ${th('ยังไม่มีแผนสำหรับวันนี้','No plans for today')}</p>`);
  }

  /* ---- Up next ---- */
  const upcomingList = items.filter(i => i.date >= todayStr).slice(0, 4);
  setHtml('upnext-list', upcomingList.length ? upcomingList.map((it, idx) => `
    <div class="flex gap-3 py-2.5 border-b last:border-0 items-center" style="border-color:var(--border);">
      <div class="step-num">${idx + 1}</div>
      <div class="flex-1 min-w-0">
        <div class="font-medium text-sm truncate">${escapeHtml(it.title)}</div>
        <div class="meta-line mt-0.5">
          ${icon('calendar', 'w-3 h-3')} ${formatDate(it.date, lang, trip?.timezone)}
          ${icon('clock', 'w-3 h-3')} ${formatTime(it.startAt, trip?.timezone)}
          ${it.address ? ` • ${escapeHtml(String(it.address).slice(0, 28))}` : ''}
        </div>
      </div>
      ${Number(it.estimateAmount) > 0 ? `<span class="badge badge-skipped text-[10px]">${moneyHtml(toMinor(Number(it.estimateAmount), getCurrencyDecimals(it.estimateCurrency || currency)), it.estimateCurrency || currency, resolveTripThbRate(trip, originalExpenses, it.estimateCurrency || currency))}</span>` : ''}
    </div>`).join('')
    : renderEmptyState({
      icon: 'map-pinned',
      title: th('ยังไม่มีแผนถัดไป', 'No upcoming plans'),
      desc: th('เพิ่มสถานที่เพื่อเริ่มวางแผน', 'Add a place to start planning'),
      actionHtml: `<button id="upnext-add" class="btn btn-primary btn-sm mt-3">${icon('plus', 'w-4 h-4')} ${t('addPlace')}</button>`
    }));
  bind('upnext-add', 'click', () => { location.hash = `#/trip/${tripId}/itinerary?action=add`; });

  /* ---- Category stats ---- */
  const byCategory = {};
  expenses.forEach(e => {
    const cat = e.category || 'general';
    if (!byCategory[cat]) byCategory[cat] = { actual: 0, estimate: 0, count: 0 };
    if (e.isEstimated) byCategory[cat].estimate += e.netTotalMinor || 0;
    else byCategory[cat].actual += e.netTotalMinor || 0;
    byCategory[cat].count++;
  });
  const catEntries = Object.entries(byCategory).sort((a, b) => (b[1].actual + b[1].estimate) - (a[1].actual + a[1].estimate));
  const catMax = Math.max(1, ...catEntries.map(([, v]) => v.actual + v.estimate));
  const grand = catEntries.reduce((s, [, v]) => s + v.actual + v.estimate, 0) || 1;
  setHtml('category-stats', catEntries.length ? catEntries.map(([cat, v]) => {
    const total = v.actual + v.estimate;
    const pct = Math.round((total / grand) * 100);
    return `
      <div class="py-2">
        <div class="flex justify-between items-center text-sm gap-2">
          <span class="meta-line truncate">${icon(categoryIcon(cat), 'w-3.5 h-3.5')} ${escapeHtml(categoryLabel(cat, lang))} <span class="text-[10px] text-[var(--text-tertiary)]">• ${v.count}</span></span>
          <span class="font-bold flex-shrink-0">${fmt(total)} <span class="text-[10px] font-normal text-[var(--text-tertiary)]">${pct}%</span>${thbTag(total)}</span>
        </div>
        <div class="progress mt-1.5" style="height:6px;">
          <div class="progress-bar progress-striped" style="width:${Math.max(3, Math.round(total / catMax * 100))}%; background:${categoryColor(cat)};"></div>
        </div>
        ${v.estimate ? `<div class="text-[10px] text-[var(--text-tertiary)] mt-0.5">${icon('hourglass', 'w-3 h-3 inline')} ${th('ประมาณการ','est.')} ${fmt(v.estimate)}${v.actual ? ` • ${th('จ่ายจริง','actual')} ${fmt(v.actual)}` : ''}</div>` : ''}
      </div>`;
  }).join('') : `<p class="text-sm text-[var(--text-secondary)]">${t('noData')}</p>`);

  /* ---- Estimated vs actual ---- */
  const estPct = totalMinor ? Math.round((estimatedMinor / totalMinor) * 100) : 0;
  const memberCount = Math.max(1, members.length);
  const estMood = estimateMood(estimatedMinor, totalMinor);
  const estMoodText = estMood === 'think'
    ? th('ยังมีรายการประมาณการรอจ่ายจริงอีกเยอะ — ชวนเพื่อนเคลียร์รายการที่จองไว้', 'A big chunk is still estimated — turn bookings into real payments')
    : estMood === 'meh'
      ? th('เริ่มชัดเจน — ยังมีประมาณการค้างอยู่บ้าง', 'Getting concrete — a few estimates still open')
      : totalMinor > 0
        ? th('เกือบทั้งหมดเป็นยอดจ่ายจริงแล้ว เยี่ยม!', 'Almost everything is actual spending. Nice!')
        : th('ยังไม่มีข้อมูลให้เทียบ', 'Nothing to compare yet');
  setHtml('estimate-compare', `
    <div class="space-y-3">
      <div class="compare-mood-head">
        ${moodFaceHtml(estMood, { size: 44, lang })}
        <span class="compare-mood-text">${estMoodText}</span>
      </div>
      <div>
        <div class="flex justify-between text-xs mb-1"><span class="meta-line">${icon('check-circle', 'w-3.5 h-3.5')} ${th('จ่ายจริงแล้ว','Paid')}</span><b>${thbPlusLabelHtml(actualMinor, secondary(actualMinor))}</b></div>
        <div class="progress" style="height:8px;"><div class="progress-bar" style="width:${totalMinor ? Math.round(actualMinor / totalMinor * 100) : 0}%;"></div></div>
      </div>
      <div>
        <div class="flex justify-between text-xs mb-1"><span class="meta-line">${icon('hourglass', 'w-3.5 h-3.5')} ${th('ประมาณการ/ต้องจอง','Estimated')}</span><b>${thbPlusLabelHtml(estimatedMinor, secondary(estimatedMinor))}</b></div>
        <div class="progress" style="height:8px;"><div class="progress-bar" style="width:${estPct}%; background: var(--warning);"></div></div>
      </div>
      <div class="grid grid-cols-2 gap-2 text-xs">
        <div class="p-2.5 rounded-xl" style="background:var(--bg-secondary);">${icon('user', 'w-3 h-3')} ${th('เฉลี่ย/คน','Avg / person')}<div class="font-bold text-sm mt-0.5">${fmt(Math.round(totalMinor / memberCount))}</div>${thbTag(Math.round(totalMinor / memberCount))}</div>
        <div class="p-2.5 rounded-xl" style="background:var(--bg-secondary);">${icon('calendar-days', 'w-3 h-3')} ${th('เฉลี่ย/วัน','Avg / day')}<div class="font-bold text-sm mt-0.5">${fmt(Math.round(totalMinor / Math.max(1, getTripDays(trip?.startDate, trip?.endDate).length)))}</div>${thbTag(Math.round(totalMinor / Math.max(1, getTripDays(trip?.startDate, trip?.endDate).length)))}</div>
      </div>
    </div>`);

  /* ---- Summary stats ---- */
  const settlement = (() => { try { return calculateSettlement(expenses, members.map(m => ({ id: m.id }))); } catch { return { transactions: [] }; } })();
  setHtml('summary-stats', `
    <div class="flex items-center gap-3 flex-wrap">
      <span class="meta-line text-sm">${icon('users', 'w-4 h-4')} ${members.length} ${th('คน','people')}</span>
      <span class="meta-line text-sm">${icon('receipt', 'w-4 h-4')} ${expenses.length} ${th('รายการ','items')}</span>
      <span class="meta-line text-sm">${icon('hand-coins', 'w-4 h-4')} ${th('ต้องเคลียร์','settlements')} ${settlement.transactions?.length || 0} ${th('รายการ','items')}</span>
    </div>
    ${(settlement.transactions || []).length ? `<button id="dash-go-settlement" class="btn btn-secondary btn-sm mt-2">${icon('hand-coins', 'w-4 h-4')} ${th('ไปเคลียร์บิล','Go to settlement')}</button>` : `<div class="text-xs mt-2" style="color:var(--success);">${icon('check', 'w-3.5 h-3.5 inline')} ${t('allCleared')}</div>`}
  `);
  bind('dash-go-settlement', 'click', () => { location.hash = `#/trip/${tripId}/settlement`; });

  /* ---- Member board ---- */
  const membersMap = Object.fromEntries(members.map(m => [m.id, m]));
  // paidBy / shareBy were computed at the top (My wallet shares them).
  const boardIds = [...new Set([...members.map(m => m.id), ...Object.keys(paidBy), ...Object.keys(shareBy)])];
  setHtml('member-board-content', boardIds.length ? boardIds.map(id => {
    const m = membersMap[id];
    const isMe = id === currentUser.uid;
    const bal = balances.find(b => b.memberId === id)?.net || 0;
    return `
      <div class="member-row ${isMe ? 'is-me' : ''}">
        <div class="flex items-center gap-3 min-w-0">
          <div class="avatar w-10 h-10 text-sm" style="background:${m?.color || 'var(--primary)'};width:40px;height:40px;">
            ${m?.photoURL ? `<img src="${escapeHtml(m.photoURL)}" class="w-full h-full rounded-full object-cover" alt="">` : escapeHtml(getInitials(m?.displayName || 'U'))}
          </div>
          <div class="min-w-0">
            <div class="font-semibold text-sm flex items-center gap-2 truncate">${escapeHtml(m?.displayName || id.slice(0,6))} ${isMe ? `<span class="text-[10px] px-2 py-0.5 rounded-full text-white flex-shrink-0" style="background:var(--gradient-primary);">${th('คุณ','You')}</span>` : ''}</div>
            <div class="text-[11px] text-[var(--text-secondary)]">
              ${th('จ่าย','paid')} ${fmt(paidBy[id] || 0)} • ${th('รับผิดชอบ','share')} ${fmt(shareBy[id] || 0)}
            </div>
            ${thbTag(paidBy[id] || 0)}
          </div>
        </div>
        <div class="text-right flex-shrink-0">
          <div class="font-bold text-sm" style="color:${bal >= 0 ? 'var(--success)' : 'var(--danger)'};">${fmt(bal)}</div>
          ${thbTag(bal)}
          <div class="text-[10px] text-[var(--text-tertiary)]">${bal >= 0 ? th('ได้รับคืน','gets back') : th('ต้องจ่าย','pays')}</div>
        </div>
      </div>`;
  }).join('') : `<p class="text-sm text-[var(--text-secondary)]">${t('noData')}</p>`);

  /* ---- Recent expenses ---- */
  const recent = [...originalExpenses].sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))).slice(0, 5);
  setHtml('recent-expenses', recent.length ? recent.map(e => {
    const payer = expensePayments(e).map(p => membersMap[p.memberId]?.displayName || p.memberId).join(', ');
    return `
      <button class="expense-row" data-expense="${e.id}">
        <span class="row-icon" style="width:34px;height:34px;border-radius:11px;background:color-mix(in srgb, ${categoryColor(e.category)} 18%, transparent);color:${categoryColor(e.category)};">${icon(categoryIcon(e.category), 'w-4 h-4')}</span>
        <span class="min-w-0 flex-1 text-left">
          <span class="block font-semibold text-sm truncate">${escapeHtml(e.title)}</span>
          <span class="block text-[11px] text-[var(--text-secondary)]">${escapeHtml(categoryLabel(e.category, lang))}${payer ? ' • ' + escapeHtml(payer) : ''} • ${escapeHtml(e.date || '')}</span>
        </span>
        <span class="text-right flex-shrink-0">
          ${moneyHtml(e.netTotalMinor || 0, e.currency || currency, e.thbRate || resolveTripThbRate(trip, originalExpenses, e.currency || currency))}
          ${e.isEstimated ? `<span class="badge badge-skipped text-[9px]">${th('ประมาณการ','est.')}</span>` : ''}
        </span>
      </button>`;
  }).join('') : `<p class="text-sm text-[var(--text-secondary)]">${th('ยังไม่มีค่าใช้จ่าย','No expenses yet')}</p>`);
  document.querySelectorAll('#recent-expenses [data-expense]').forEach(btn => btn.addEventListener('click', () => {
    location.hash = `#/trip/${tripId}/expenses/add?id=${btn.dataset.expense}`;
  }));

  queueIcons();
  initReveal(appEl);
}

async function renderItinerary(params) {
  const tripId = params.tripId;
  const token = beginRender();
  const lang = getLang();
  const th = (a, b) => (lang === 'th' ? a : b);
  await loadTrip(tripId);
  if (isStale(token)) return;

  const trip = currentTrip;
  const currency = trip?.baseCurrency || 'THB';
  // Trip groups feed the "estimated cost" select in the add/edit sheet, so load
  // them together with the permissions (one round trip, cached afterwards).
  const [perms, , itineraryExpenses] = await Promise.all([
    resolvePermissions(tripId, trip, currentUser.uid),
    loadTripCategories(tripId).catch(e => console.warn(e)),
    fetchAllExpenses(tripId).catch(() => [])
  ]);
  if (isStale(token)) return;
  const isAdmin = perms.isAdmin;

  const urlParams = new URLSearchParams(location.hash.split('?')[1] || '');
  const action = urlParams.get('action');

  appEl.innerHTML = `
    <div class="page-enter">
      <div class="mb-5">
        ${renderPageScene('itinerary', {
          lang,
          title: `${icon('map-pinned', 'w-5 h-5')} ${t('itinerary')}`,
          subtitle: th('วางแผนสถานที่ • ประมาณการค่าใช้จ่าย • ลากสลับลำดับได้','Plan places • estimate costs • drag to reorder')
        })}
        <div class="btn-row">
          <button id="view-all-btn" class="btn btn-secondary btn-sm">${icon('calendar-days', 'w-4 h-4')} <span id="view-all-label">${th('ดูทั้งหมด','View all')}</span></button>
          <button id="toggle-map-btn" class="btn btn-primary btn-sm">${icon('map', 'w-4 h-4')} ${th('แผนที่','Map')}</button>
          <button id="export-png-btn" class="btn btn-secondary btn-sm" title="${th('PNG ทั้งแผน','Whole-plan PNG')}">${icon('image', 'w-4 h-4')} PNG</button>
          <button id="export-day-png-btn" class="btn btn-secondary btn-sm" title="${th('PNG เฉพาะวันนี้','PNG for one day')}">${icon('calendar-down', 'w-4 h-4')} PNG ${th('รายวัน','per day')}</button>
          ${isAdmin ? `
          <button id="export-excel-btn" class="btn btn-secondary btn-sm">${icon('file-spreadsheet', 'w-4 h-4')} Excel</button>
          <button id="import-excel-btn" class="btn btn-secondary btn-sm">${icon('upload', 'w-4 h-4')} Import</button>` : ''}
          <button id="edit-mode-btn" class="btn btn-secondary btn-sm">${icon('list-ordered', 'w-4 h-4')} ${t('editMode')}</button>
          <button id="add-itinerary-btn" class="btn btn-primary btn-sm">${icon('plus', 'w-4 h-4')} ${t('addPlace')}</button>
        </div>
      </div>

      <div id="itin-layout" class="itin-layout">
        <div class="itin-col-days">
      <div class="card p-4 mb-5" id="notes-card">
        <div class="flex items-center justify-between gap-2 flex-wrap">
          <h3 class="font-bold flex items-center gap-2 text-sm">
            <span class="row-icon" style="width:30px;height:30px;border-radius:10px;background:var(--warning-light);color:var(--warning);">${icon('sticky-note', 'w-4 h-4')}</span>
            ${th('โน้ตติดเตือนความจำ','Sticky notes')}
            <span id="notes-count" class="text-[10px] font-bold px-2 py-0.5 rounded-full" style="background:var(--bg-secondary);">0</span>
          </h3>
          <div class="btn-row">
            <button id="notes-toggle-btn" class="btn btn-ghost btn-sm hidden" title="${th('ย่อ/ขยาย','Collapse / expand')}">${icon('chevron-up', 'w-4 h-4')}</button>
            <button id="add-note-btn" class="btn btn-secondary btn-sm">${icon('plus', 'w-4 h-4')} ${th('เพิ่มโน้ต','Add note')}</button>
          </div>
        </div>
        <!-- No notes yet → the whole section stays folded into one slim line. -->
        <div id="notes-collapsed" class="notes-collapsed hidden">
          ${icon('sticky-note', 'w-4 h-4')}
          <span>${th('ยังไม่มีโน้ต — กด “เพิ่มโน้ต” เพื่อจดเรื่องที่ต้องจำ (จองรถไฟ เบอร์ที่พัก รหัสบุ๊กกิ้ง)','No notes yet — tap “Add note” for reminders (train booking, hotel phone, booking code)')}</span>
        </div>
        <div id="notes-board-wrap" class="hidden">
          <div id="notes-board" class="notes-board mt-3"></div>
          <div id="notes-done-wrap" class="hidden mt-3">
            <button id="notes-done-toggle" class="link-btn text-[11px]"></button>
            <div id="notes-done-board" class="notes-board notes-board--done mt-2 hidden"></div>
          </div>
        </div>
      </div>

        <div id="date-chips" class="chip-row chip-row-scroll mb-4"></div>
        <div id="itinerary-list" class="space-y-3 stagger"></div>
        </div>

        <aside class="itin-col-map">
          <div id="map-card" class="card p-3 mb-5">
            <div id="map-wrap" class="relative rounded-2xl overflow-hidden" style="border:1px solid var(--border);">
              <div id="map" class="map-frame w-full" style="height:min(46vh, 420px);"></div>
              <div class="map-toolbar" id="map-layer-bar">
                <button class="map-tool-btn" data-layer="map">${icon('map', 'w-3.5 h-3.5')} ${th('แผนที่','Map')}</button>
                <button class="map-tool-btn" data-layer="satellite">${icon('satellite', 'w-3.5 h-3.5')} ${th('ดาวเทียม','Satellite')}</button>
                <button class="map-tool-btn" data-layer="terrain">${icon('mountain', 'w-3.5 h-3.5')} ${th('ภูมิประเทศ','Terrain')}</button>
              </div>
              <div id="map-status" class="map-status"><span class="skeleton" style="width:26px;height:26px;border-radius:50%;"></span> <span>${th('กำลังโหลดแผนที่...','Loading map...')}</span></div>
              <div id="map-empty" class="map-status hidden"><div class="text-center px-4">
                <div class="row-icon mx-auto mb-2" style="width:40px;height:40px;">${icon('map-pin', 'w-5 h-5')}</div>
                <p class="text-xs text-[var(--text-secondary)]">${th('เพิ่มพิกัด (lat,lng) ให้สถานที่ เพื่อให้แสดงหมุดบนแผนที่','Add coordinates (lat,lng) to a place to see it here')}</p>
              </div></div>
            </div>
            <div class="flex items-center justify-between gap-2 mt-2 flex-wrap">
              <p class="text-[10px] text-[var(--text-tertiary)] flex items-center gap-1">${icon('info', 'w-3 h-3')} ${th('ไม่ต้องใช้ API key • เส้นประ = ลำดับที่ไป • กดปุ่มนำทางบนการ์ดเพื่อเปิด Google Maps','No API key needed • dashed line = visit order • tap 🧭 on a card to open Google Maps')}</p>
              <div class="flex items-center gap-2">
                <span id="map-count" class="text-[10px] font-bold px-2 py-0.5 rounded-full" style="background:var(--bg-secondary);">0 ${th('หมุด','pins')}</span>
                <button id="map-fit-btn" class="btn btn-ghost btn-sm text-[10px]" style="min-height:26px;padding:2px 8px;">${icon('maximize', 'w-3 h-3')} ${th('พอดีจอ','Fit')}</button>
              </div>
            </div>
          </div>

        </aside>
      </div>

      <div id="itinerary-export-wrap" class="export-sheet-wrap" aria-hidden="true"></div>
    </div>
  `;
  queueIcons();

  let selectedDate = urlParams.get('date') || dayjs().format('YYYY-MM-DD');
  let editMode = false;
  let showAll = false;
  let mapVisible = true;
  let mapReady = false;
  let visibleItems = [];
  let members = [];

  try {
    members = await listMembers(tripId);
    currentTripMembers = members || [];
  } catch (e) { console.warn('members load failed', e?.message); }
  if (isStale(token)) return;

  const tripDays = trip ? getTripDays(trip.startDate, trip.endDate) : [];
  const dayColors = {};
  tripDays.forEach((d, i) => { dayColors[dayjs(d).format('YYYY-MM-DD')] = `hsl(${(i * 47) % 360},62%,52%)`; });

  const chipsEl = document.getElementById('date-chips');
  if (chipsEl) {
    chipsEl.innerHTML = tripDays.map(d => {
      const ds = dayjs(d).format('YYYY-MM-DD');
      return `<button data-date="${ds}" class="chip ${ds === selectedDate && !showAll ? 'chip-active' : ''}">${icon('calendar', 'w-3.5 h-3.5')} ${dayjs(d).format('DD MMM')}</button>`;
    }).join('') + `<button data-date="__all" class="chip ${showAll ? 'chip-active' : ''}">${icon('layers', 'w-3.5 h-3.5')} ${th('ทั้งหมด','All')}</button>`;
    chipsEl.querySelectorAll('[data-date]').forEach(btn => btn.addEventListener('click', () => {
      const ds = btn.dataset.date;
      if (ds === '__all') { showAll = true; }
      else { showAll = false; selectedDate = ds; }
      document.getElementById('view-all-label').textContent = showAll ? th('รายวัน','By day') : th('ดูทั้งหมด','View all');
      document.getElementById('view-all-btn').className = showAll ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm';
      chipsEl.querySelectorAll('.chip').forEach(c => c.classList.remove('chip-active'));
      btn.classList.add('chip-active');
      loadItems();
    }));
  }

  bind('view-all-btn', 'click', () => {
    showAll = !showAll;
    setText('view-all-label', showAll ? th('รายวัน','By day') : th('ดูทั้งหมด','View all'));
    const btn = document.getElementById('view-all-btn');
    if (btn) btn.className = showAll ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm';
    const chips = document.getElementById('date-chips');
    chips?.querySelectorAll('.chip').forEach(c => c.classList.remove('chip-active'));
    if (showAll) chips?.querySelector('[data-date="__all"]')?.classList.add('chip-active');
    else chips?.querySelector(`[data-date="${selectedDate}"]`)?.classList.add('chip-active');
    loadItems();
  });

  bind('toggle-map-btn', 'click', () => {
    mapVisible = !mapVisible;
    const card = document.getElementById('map-card');
    const btn = document.getElementById('toggle-map-btn');
    card?.classList.toggle('hidden', !mapVisible);
    document.getElementById('itin-layout')?.classList.toggle('map-hidden', !mapVisible);
    if (btn) btn.className = mapVisible ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm';
    if (mapVisible) {
      setTimeout(async () => {
        fitMapToViewport();
        const { refreshMapSize } = await import('./maps/index.js');
        refreshMapSize('map');
        await refreshMap(visibleItems, { fit: true });
      }, 120);
    }
  });

  bind('map-fit-btn', 'click', async () => {
    fitMapToViewport();
    const { refreshMapSize } = await import('./maps/index.js');
    refreshMapSize('map');
    await refreshMap(visibleItems, { fit: true });
    fitMapToViewport();
  });

  bind('export-png-btn', 'click', () => exportItineraryPng());
  bind('export-day-png-btn', 'click', () => exportItineraryDayPng(selectedDate));

  function itineraryMoney(items) {
    // Stays contribute only THAT night's share to a day's total (the full price
    // is entered once on the booking itself).
    const estimates = items.map(i => ({ netTotalMinor: toMinor(dayEstimateAmount(i), getCurrencyDecimals(i.estimateCurrency || currency)), currency: i.estimateCurrency || currency, thbRate: resolveTripThbRate(trip, itineraryExpenses, i.estimateCurrency || currency) }));
    try {
      const total = sumExpenses(expensesInThb(estimates, trip));
      const rate = resolveTripThbRate(trip, itineraryExpenses, currency);
      return thbPlusLabelHtml(total, currency !== 'THB' && rate ? formatCurrency(convertCurrency(total, 'THB', currency, 1 / rate), currency) : '');
    } catch { return th('ยังไม่มีเรท THB', 'THB rate needed'); }
  }

  function mapStatus(state, message) {
    const statusEl = document.getElementById('map-status');
    const emptyEl = document.getElementById('map-empty');
    if (!statusEl || !emptyEl) return;
    statusEl.classList.toggle('hidden', state !== 'loading' && state !== 'error');
    emptyEl.classList.toggle('hidden', state !== 'empty');
    if (state === 'error' && message) {
      statusEl.innerHTML = `
        <div class="text-center px-4">
          <div class="row-icon mx-auto mb-2" style="width:40px;height:40px;background:var(--danger-bg);color:var(--danger);">${icon('map', 'w-5 h-5')}</div>
          <p class="text-xs font-semibold" style="color:var(--danger);">${th('โหลดแผนที่ไม่สำเร็จ','Map failed to load')}</p>
          <p class="text-[11px] text-[var(--text-secondary)] mb-2">${escapeHtml(message)}</p>
          <button id="map-retry" class="btn btn-secondary btn-sm">${icon('refresh-cw', 'w-4 h-4')} ${th('ลองใหม่','Retry')}</button>
        </div>`;
      bind('map-retry', 'click', () => refreshMap(visibleItems, { forceRecreate: true }));
    }
  }

  /**
   * "แผนที่พอดีจอเสมอ" — measure the viewport and give the map exactly that
   * height (desktop: fills the sticky column under the toolbar, mobile: a
   * comfortable slice), then tell Leaflet to re-measure its tiles.
   */
  function fitMapToViewport({ refit = false } = {}) {
    const mapEl = document.getElementById('map');
    const col = document.getElementById('itin-layout')?.querySelector('.itin-col-map');
    if (!mapEl || !col || !mapVisible) return;
    const top = Math.max(col.getBoundingClientRect().top, 8);
    const isMobile = window.matchMedia('(max-width: 1023px)').matches;
    const h = isMobile
      ? Math.round(Math.min(Math.max(window.innerHeight * 0.44, 240), 420))
      : Math.round(Math.min(Math.max(window.innerHeight - top - 20, 300), 900));
    mapEl.style.setProperty('--itin-map-h', `${h}px`);
    import('./maps/index.js').then(({ refreshMapSize }) => refreshMapSize('map')).catch(() => {});
    if (refit && visibleItems.some(i => i.coordinates)) refreshMap(visibleItems, { fit: true });
  }

  // Keep the map fitted while the window/orientation changes (debounced).
  let mapFitTimer = null;
  const onViewportChange = () => {
    clearTimeout(mapFitTimer);
    mapFitTimer = setTimeout(() => fitMapToViewport({ refit: true }), 140);
  };
  window.addEventListener('resize', onViewportChange);
  window.addEventListener('orientationchange', onViewportChange);
  const stopViewportWatch = () => {
    clearTimeout(mapFitTimer);
    window.removeEventListener('resize', onViewportChange);
    window.removeEventListener('orientationchange', onViewportChange);
  };
  document.addEventListener('routechange', stopViewportWatch, { once: true });

  /** Re-render the map markers. This NEVER wipes the container node that Leaflet owns. */
  async function refreshMap(items, { fit = false, forceRecreate = false } = {}) {
    if (!mapVisible) return;
    const mapEl = document.getElementById('map');
    if (!mapEl) return;
    // Virtual "back to hotel" nights share the master's pin — draw it once.
    const located = (items || []).filter(i => i.coordinates && !i.virtualStay);
    try {
      mapStatus('loading');
      const { renderItineraryMap, refreshMapSize } = await import('./maps/index.js');
      const res = await renderItineraryMap('map', located, {
        dayColors,
        fitBounds: true,
        forceRecreate
      });
      mapReady = true;
      mapStatus(located.length ? 'ready' : 'empty');
      setText('map-count', `${res.count || 0} ${th('หมุด','pins')}`);
      fitMapToViewport();
      refreshMapSize('map');
      if (fit && located.length) {
        setTimeout(() => refreshMapSize('map'), 200);
      }
    } catch (e) {
      console.error('Map failed', e);
      mapStatus('error', e.message || String(e));
      queueIcons();
    }
  }

  if (mapVisible) setTimeout(() => refreshMap(visibleItems), 220);

  // Re-theme the tiles when the palette/mode changes. Registered once per render
  // but removed on route change so handlers never stack up.
  const onThemeChange = async () => {
    if (mapVisible && mapReady) {
      const { getMap, refreshMapTheme } = await import('./maps/index.js');
      const L = window.L;
      const map = getMap('map');
      if (map && L) refreshMapTheme(map, L);
    }
  };
  document.addEventListener('themechange', onThemeChange);
  document.addEventListener('routechange', () => document.removeEventListener('themechange', onThemeChange), { once: true });

  /* ---------------------- base map switcher (map/satellite/terrain) ---------------------- */
  function paintLayerButtons() {
    const active = getStoredLayerId();
    document.querySelectorAll('#map-layer-bar [data-layer]').forEach(btn => {
      btn.classList.toggle('is-active', btn.dataset.layer === active);
    });
  }
  document.querySelectorAll('#map-layer-bar [data-layer]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const layerId = btn.dataset.layer;
      const { setMapLayer } = await import('./maps/index.js');
      const ok = setMapLayer('map', layerId);
      if (!ok) {
        // Map not created yet → remember the choice and (re)build it
        await refreshMap(visibleItems, { forceRecreate: true });
      }
      paintLayerButtons();
      const def = BASE_LAYERS.find(l => l.id === layerId);
      toast.success(lang === 'th' ? `แสดงแบบ${def?.name || layerId}` : `${def?.en || layerId} view`);
    });
  });
  paintLayerButtons();

  /* ---------------------- sticky notes (post-it board) ---------------------- */
  let notes = [];
  let notesLoaded = false;

  const archivedIds = () => new Set(localArchivedIds(tripId));
  const isArchivedNote = (n) => Boolean(n.archived) || archivedIds().has(n.id);
  let notesFolded = false;      // user collapsed the board
  let doneOpen = false;         // "เก็บแล้ว" list expanded

  function noteCardHtml(n, idx, { archived = false } = {}) {
    const color = noteColorHex(n.color);
    return `
      <div class="note-card ${archived ? 'note-card--done' : ''}" data-note="${n.id}" style="background:${color}; animation-delay:${Math.min(idx * 45, 400)}ms">
        <div class="note-pin">${icon(archived ? 'archive' : 'pin', 'w-3 h-3')}</div>
        ${n.pinned && !archived ? `<div class="note-flag">${icon('pin', 'w-3 h-3')} ${th('ปักหมุด','pinned')}</div>` : ''}
        ${n.title ? `<div class="note-title">${escapeHtml(n.title)}</div>` : ''}
        <div class="note-body">${escapeHtml(n.body || '')}</div>
        <div class="note-meta">
          <span class="note-tag">${icon('calendar', 'w-2.5 h-2.5')} ${n.createdAt?.seconds ? dayjs(n.createdAt.seconds * 1000).format('D MMM') : dayjs().format('D MMM')}</span>
          <span class="note-actions">
            ${archived
              ? `<button data-note-act="restore" data-id="${n.id}" title="${th('นำกลับมา','Bring back')}">${icon('undo-2', 'w-3 h-3')}</button>`
              : `<button data-note-act="done" data-id="${n.id}" title="${th('ทำเสร็จแล้ว — เก็บไว้','Done — file it away')}">${icon('check', 'w-3 h-3')}</button>`}
            <button data-note-act="edit" data-id="${n.id}" title="${t('edit')}">${icon('pencil', 'w-3 h-3')}</button>
            <button data-note-act="delete" data-id="${n.id}" title="${t('delete')}">${icon('trash-2', 'w-3 h-3')}</button>
          </span>
        </div>
      </div>`;
  }

  /** Notes board: hidden while there is nothing to show, archive folded away. */
  function renderNotes() {
    const board = document.getElementById('notes-board');
    if (!board) return;
    const active = notes.filter(n => !isArchivedNote(n));
    const done = notes.filter(n => isArchivedNote(n));
    setText('notes-count', String(active.length));

    const collapsedEl = document.getElementById('notes-collapsed');
    const wrapEl = document.getElementById('notes-board-wrap');
    const toggleBtn = document.getElementById('notes-toggle-btn');
    const doneWrap = document.getElementById('notes-done-wrap');
    const doneBoard = document.getElementById('notes-done-board');
    const doneToggle = document.getElementById('notes-done-toggle');

    // Nothing to show at all → fold the card into a single line (a request).
    const nothingToShow = notesLoaded && notes.length === 0;
    collapsedEl?.classList.toggle('hidden', !nothingToShow);
    wrapEl?.classList.toggle('hidden', nothingToShow || notesFolded);
    toggleBtn?.classList.toggle('hidden', nothingToShow || !notes.length);
    if (toggleBtn) toggleBtn.innerHTML = icon(notesFolded ? 'chevron-down' : 'chevron-up', 'w-4 h-4');
    if (nothingToShow || notesFolded) {
      // Drop the cards from the DOM as well — a folded section must not keep
      // stale notes around (they used to linger after the last one was deleted).
      board.innerHTML = '';
      if (doneBoard) doneBoard.innerHTML = '';
      doneWrap?.classList.add('hidden');
      return;
    }

    if (!notesLoaded) {
      board.innerHTML = `<div class="skeleton" style="height:132px;border-radius:12px;"></div><div class="skeleton" style="height:132px;border-radius:12px;"></div>`;
      return;
    }

    if (!active.length) {
      board.innerHTML = `
        <div class="notes-empty" style="grid-column:1/-1;">
          <div class="row-icon mx-auto mb-2" style="width:38px;height:38px;background:var(--warning-light);color:var(--warning);">${icon('party-popper', 'w-4 h-4')}</div>
          <p class="text-xs font-semibold">${th('ไม่มีโน้ตค้างแล้ว','Nothing left to do')}</p>
          <p class="text-[11px] text-[var(--text-secondary)] mt-1">${th('โน้ตที่เก็บไว้ยังอยู่ใน “เก็บแล้ว” ด้านล่าง กดนำกลับมาได้ทุกเมื่อ','Filed notes stay under “Done” below — bring any of them back any time')}</p>
        </div>`;
    } else {
      const sorted = [...active].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      board.innerHTML = sorted.map((n, idx) => noteCardHtml(n, idx)).join('');
    }

    // --- archived ("เก็บแล้ว") section ---
    doneWrap?.classList.toggle('hidden', !done.length);
    if (doneToggle) doneToggle.innerHTML = `${icon('archive', 'w-3.5 h-3.5')} ${th('เก็บแล้ว','Done')} (${done.length}) ${doneOpen ? '▲' : '▼'}`;
    doneBoard?.classList.toggle('hidden', !doneOpen);
    if (doneBoard && done.length) {
      doneBoard.innerHTML = done.map((n, idx) => noteCardHtml(n, idx, { archived: true })).join('');
    }

    const allCards = [...document.querySelectorAll('#notes-board [data-note-act], #notes-done-board [data-note-act]')];
    allCards.forEach(btn => btn.addEventListener('click', async (ev) => {
      ev.stopPropagation();
      const note = notes.find(x => x.id === btn.dataset.id);
      if (!note) return;
      const act = btn.dataset.noteAct;
      if (act === 'edit') return openNoteForm(note);
      if (act === 'delete') {
        const ok = await confirmAction({
          title: th('ลบโน้ตนี้?', 'Delete this note?'),
          message: note.title || note.body?.slice(0, 60) || '',
          confirmText: t('delete'), danger: true, icon: 'trash-2'
        });
        if (!ok) return;
        try {
          await deleteNote(tripId, note.id);
          toast.success(th('ลบโน้ตแล้ว', 'Note deleted'));
          await loadNotes();
        } catch (e) { toast.error(e.message); }
        return;
      }
      // done / restore — never destructive: it can always be brought back.
      const archived = act === 'done';
      try {
        const res = await setNoteArchived(tripId, note.id, archived, currentUser.uid);
        note.archived = archived;
        toast.success(archived
          ? th('เก็บโน้ตแล้ว — กด “เก็บแล้ว” เพื่อนำกลับมาได้','Filed away — bring it back from “Done”')
          : th('นำโน้ตกลับมาแล้ว','Note restored'));
        if (!res.synced) toast.info(th('เก็บไว้ในเครื่องนี้ (ยังไม่ได้ Publish firestore.rules)','Kept on this device (firestore.rules not published yet)'));
        renderNotes();
      } catch (e) { toast.error(e.message); }
    }));
    queueIcons();
  }

  bind('notes-toggle-btn', 'click', () => { notesFolded = !notesFolded; renderNotes(); });
  bind('notes-done-toggle', 'click', () => { doneOpen = !doneOpen; renderNotes(); });

  async function loadNotes() {
    try {
      notes = await listNotes(tripId);
      notesLoaded = true;
    } catch (e) {
      console.warn('notes load failed', e);
      notesLoaded = true;
      notes = [];
    }
    if (isStale(token)) return;
    renderNotes();
  }

  function openNoteForm(note = null) {
    const isEdit = !!note;
    const n = note || {};
    const sheet = showBottomSheet(`
      <div class="space-y-3">
        <div class="flex items-center gap-3">
          <div class="row-icon" style="width:40px;height:40px;border-radius:14px;background:var(--warning-light);color:var(--warning);">${icon('sticky-note', 'w-5 h-5')}</div>
          <div>
            <h3 class="font-bold text-base leading-tight" style="font-family: var(--font-display);">${isEdit ? th('แก้ไขโน้ต','Edit note') : th('เพิ่มโน้ต','New note')}</h3>
            <p class="text-[11px] text-[var(--text-secondary)]">${th('ข้อความสำคัญที่อยากเห็นทุกครั้งที่เปิดแผน','A reminder you want to see on the itinerary')}</p>
          </div>
        </div>
        <form id="note-form" class="space-y-3">
          <div class="input-group"><label class="input-label">${icon('type', 'w-3.5 h-3.5')} ${th('หัวข้อ','Title')}</label><input id="note-title" class="input" autocomplete="off" value="${escapeHtml(n.title || '')}" placeholder="${th('เช่น ต้องจองรถไฟ 7:00','e.g. Book 7:00 train')}"></div>
          <div class="input-group"><label class="input-label">${icon('align-left', 'w-3.5 h-3.5')} ${th('รายละเอียด','Details')}</label><textarea id="note-body" class="input" style="min-height:96px;" placeholder="${th('รหัสจอง เบอร์โทร ที่อยู่…','Booking code, phone, address…')}">${escapeHtml(n.body || '')}</textarea></div>
          <div class="input-group">
            <label class="input-label">${icon('palette', 'w-3.5 h-3.5')} ${th('สีโพสอิท','Paper color')}</label>
            <div class="flex gap-2 flex-wrap" id="note-colors">
              ${NOTE_COLORS.map(c => `<button type="button" class="chip ${((n.color || 'yellow') === c.id) ? 'chip-active' : ''}" data-color="${c.id}" style="${(n.color || 'yellow') === c.id ? '' : `background:${c.color};color:#3b3527;border-color:transparent;`}">${c.label}</button>`).join('')}
            </div>
          </div>
          <label class="flex items-center gap-2 text-sm cursor-pointer"><input id="note-pinned" type="checkbox" class="accent-[var(--primary)] w-4 h-4" ${n.pinned ? 'checked' : ''}> ${th('ปักหมุดไว้บนสุด','Pin to top')}</label>
          <div class="flex gap-2">
            <button type="submit" id="note-submit" class="btn btn-primary flex-1">${icon('save', 'w-4 h-4')} ${t('save')}</button>
            ${isEdit ? `<button type="button" id="note-delete" class="btn" style="background:var(--danger-bg);color:var(--danger);border:1.5px solid color-mix(in srgb, var(--danger) 35%, transparent);">${icon('trash-2', 'w-4 h-4')}</button>` : ''}
          </div>
        </form>
      </div>
    `);
    queueIcons();

    let color = n.color || 'yellow';
    sheet.sheet.querySelectorAll('#note-colors .chip').forEach(btn => btn.addEventListener('click', () => {
      color = btn.dataset.color;
      sheet.sheet.querySelectorAll('#note-colors .chip').forEach(b => {
        const active = b.dataset.color === color;
        b.classList.toggle('chip-active', active);
        b.style.background = active ? '' : noteColorHex(b.dataset.color);
        b.style.color = active ? '' : '#3b3527';
        b.style.borderColor = active ? '' : 'transparent';
      });
    }));

    bind('note-delete', 'click', async () => {
      sheet.close();
      const ok = await confirmAction({ title: th('ลบโน้ตนี้?', 'Delete this note?'), confirmText: t('delete'), danger: true, icon: 'trash-2' });
      if (!ok) return;
      try { await deleteNote(tripId, n.id); toast.success(th('ลบโน้ตแล้ว','Note deleted')); await loadNotes(); }
      catch (e) { toast.error(e.message); }
    });

    document.getElementById('note-form').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const btn = document.getElementById('note-submit');
      btn.disabled = true;
      const payload = {
        title: document.getElementById('note-title').value.trim(),
        body: document.getElementById('note-body').value.trim(),
        color,
        pinned: document.getElementById('note-pinned').checked
      };
      if (!payload.title && !payload.body) {
        toast.error(th('กรอกหัวข้อหรือรายละเอียดก่อน','Add a title or details'));
        btn.disabled = false;
        return;
      }
      try {
        if (isEdit) await updateNote(tripId, n.id, payload, currentUser.uid);
        else await createNote(tripId, payload, currentUser.uid);
        sheet.close();
        toast.success(isEdit ? th('บันทึกโน้ตแล้ว','Note saved') : th('เพิ่มโน้ตแล้ว','Note added'));
        confetti({ y: 140, count: 14 });
        await loadNotes();
      } catch (e) {
        toast.error(e.message);
        btn.disabled = false;
      }
    });
  }

  bind('add-note-btn', 'click', () => openNoteForm(null));
  loadNotes();

  /* ------------------------- itinerary PNG export ------------------------- */
  // One image with everything: header, the map (real tiles when available,
  // otherwise a schematic), the day legend and every item of every day.
  const STATUS_TONE = {
    planned: '#2563eb', current: '#d97706', completed: '#059669', skipped: '#6b7280', cancelled: '#dc2626'
  };
  // Rate for the baht lines in the exported sheet: trip rate → expense snapshots.
  let exportThbRate = resolveTripThbRate(trip, itineraryExpenses, currency);
  /** Estimated cost of an itinerary item, expressed in the trip currency.
   *  Stay entries carry only THAT night's share (the price is entered once). */
  const estTripMinor = (it) => {
    const amount = dayEstimateAmount(it);
    if (amount <= 0) return 0;
    const code = it.estimateCurrency || currency;
    const minor = toMinor(amount, getCurrencyDecimals(code));
    if (code === currency) return minor;
    const codeRate = resolveTripThbRate(trip, itineraryExpenses, code);
    if (!codeRate || !exportThbRate) return 0;
    return convertCurrency(toThbMinor(minor, code, codeRate), 'THB', currency, 1 / exportThbRate);
  };
  const statusLabel = (it) => {
    const def = ITINERARY_STATUSES.find(st => st.id === (it.status || 'planned'));
    return def ? (lang === 'th' ? def.th : def.en) : (it.status || 'planned');
  };

  /**
   * The printable sheet that becomes the PNG.
   * @param {Array} ordered itinerary items
   * @param {string|null} mapDataUrl captured map image, if any
   * @param {{day?:string|null}} options `day` → export only that day (หนึ่งรูปต่อหนึ่งวัน)
   */
  function itinerarySheetHtml(ordered, mapDataUrl, { day = null } = {}) {
    const isDay = !!day;
    const tripDaysList = tripDays.length ? tripDays.map(d => dayjs(d).format('YYYY-MM-DD')) : [];
    const daysSet = new Set(isDay ? [day] : [...tripDaysList, ...ordered.map(i => i.date).filter(Boolean)]);
    const days = [...daysSet].sort();
    const scoped = isDay ? ordered.filter(i => (i.date || '') === day) : ordered;
    const dayIndex = isDay ? Math.max(tripDaysList.indexOf(day), days.indexOf(day)) + 1 : 0;
    const dayTitle = isDay ? (formatDate(day, lang, trip?.timezone) || day) : '';
    const located = scoped
      .map(i => ({ title: i.title || '', date: i.date || '', ...(parseLatLng(i.coordinates) || {}) }))
      .filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng));

    const estTotal = scoped.reduce((sum, it) => sum + estTripMinor(it), 0);
    const actualTotal = scoped.filter(it => it.expenseId).reduce((sum, it) => sum + estTripMinor(it), 0);

    let mapBlock;
    if (mapDataUrl) {
      mapBlock = `<img src="${mapDataUrl}" alt="map">`;
    } else if (located.length) {
      const { svg, html } = schematicMap(located, { dayColors });
      mapBlock = `<div class="itin-sheet-map-inner">${svg}${html}</div>`;
    } else {
      mapBlock = `<div class="itin-sheet-empty">${th('ยังไม่มีพิกัดในแผนนี้ — เพิ่มพิกัด (lat,lng) ให้สถานที่เพื่อให้มีแผนที่ในรูป', 'No coordinates yet — add (lat,lng) to a place to include a map in the image')}</div>`;
    }

    const legend = located.length ? '' : '';
    const legendItems = days.map((d, i) => `
      <span><i class="itin-sheet-dot" style="background:${dayColors[d] || '#2563eb'};"></i>${th('วันที่','Day')} ${i + 1} • ${dayjs(d).format('DD MMM')}${dayColors[d] ? '' : ''}</span>`).join('');

    const daySections = days.map((day, dayIdx) => {
      const dayItems = scoped.filter(it => (it.date || '') === day);
      const dayEst = dayItems.reduce((sum, it) => sum + estTripMinor(it), 0);
      const rows = dayItems.map((it, idx) => {
        const est = estTripMinor(it);
        const meta = [
          `${formatTime(it.startAt, trip?.timezone)} – ${formatTime(it.endAt, trip?.timezone)}`,
          it.virtualStay ? '' : formatDuration(it.durationMinutes),
          it.isStay ? (it.virtualStay ? th(`กลับเข้าพัก • คืนที่ ${it.stayNight}/${it.stayNights}`, `back to hotel • night ${it.stayNight}/${it.stayNights}`) : th(`พัก ${it.stayNights} คืน`, `${it.stayNights} nights`)) : '',
          categoryLabel(it.category || 'general', lang),
          (!it.virtualStay && it.travelToNextMinutes > 0) ? `${th('เดินทางต่อ','travel')} ${formatDuration(it.travelToNextMinutes)}` : '',
          it.address && !it.virtualStay ? it.address : '',
          it.coordinates && !it.virtualStay ? `${th('พิกัด','coord')} ${it.coordinates}` : ''
        ].filter(Boolean).map(escapeHtml).join(' • ');
        return `
          <tr>
            <td style="width:34px;color:#6b7280;font-weight:700;">${it.virtualStay ? '🏨' : idx + 1}</td>
            <td>
              <div class="itin-sheet-item-title">${escapeHtml(it.title || '')}</div>
              <div class="itin-sheet-item-meta">${meta}</div>
              ${it.notes ? `<div class="itin-sheet-note">${escapeHtml(it.notes)}</div>` : ''}
            </td>
            <td style="width:88px;"><span class="itin-sheet-status">${escapeHtml(statusLabel(it))}</span></td>
            <td class="num" style="width:112px;">${est ? `<span class="itin-sheet-est">${moneyHtml(est, currency, exportThbRate)}</span>` : '<span style="color:#9ca3af;">—</span>'}</td>
          </tr>`;
      }).join('');
      return `
        <section class="itin-sheet-day">
          <div class="itin-sheet-day-head">
            <div class="itin-sheet-day-num" style="background:${dayColors[day] || '#2563eb'};">${dayIdx + 1}</div>
            <div class="itin-sheet-day-title">${escapeHtml(formatDate(day, lang, trip?.timezone) || day)}</div>
            <div class="itin-sheet-day-sub">${dayItems.length} ${th('ที่','places')}${dayEst ? ` • ${moneyHtml(dayEst, currency, exportThbRate)}` : ''}</div>
          </div>
          ${dayItems.length ? `
          <table class="itin-sheet-table">
            <thead><tr>
              <th></th><th>${th('สถานที่ / รายละเอียด','Place / details')}</th><th>${th('สถานะ','Status')}</th><th class="num">${th('ประมาณการ','Estimated')}</th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>` : `<div class="itin-sheet-empty">${th('วันนี้ยังไม่มีแผน','No plans for this day yet')}</div>`}
        </section>`;
    }).join('');

    return `
      <div id="itinerary-export-sheet" class="itin-sheet">
        <header class="itin-sheet-head">
          <div>
            <div class="itin-sheet-kicker">${isDay ? `${th('แผนการเดินทาง','Itinerary')} • ${th('วันที่','Day')} ${dayIndex}` : th('แผนการเดินทาง','Itinerary')}</div>
            <h1>${escapeHtml(trip?.name || '')}</h1>
            ${isDay ? `<div class="itin-sheet-dayline">${escapeHtml(dayTitle)} • ${located.length} ${th('หมุดบนแผนที่','map pins')}</div>` : ''}
            <div class="itin-sheet-meta">
              <span>${icon('calendar-days', 'w-3.5 h-3.5')} <b>${escapeHtml(trip?.startDate || '')}</b> → <b>${escapeHtml(trip?.endDate || '')}</b></span>
              <span>${icon('map-pinned', 'w-3.5 h-3.5')} <b>${ordered.length}</b> ${th('ที่','places')}</span>
              <span>${icon('users', 'w-3.5 h-3.5')} <b>${members.length}</b> ${th('คน','people')}</span>
              <span>${icon('wallet', 'w-3.5 h-3.5')} <b>${escapeHtml(currency)}</b></span>
            </div>
          </div>
          <div class="itin-sheet-stats">
            <div class="itin-sheet-stat">
              <span>${isDay ? th('ประมาณการของวันนี้','Estimated for this day') : th('ประมาณการรวม','Estimated total')}</span>
              ${moneyHtml(estTotal, currency, exportThbRate)}
            </div>
            <div class="itin-sheet-stat">
              <span>${th('ผูกกับค่าใช้จ่ายแล้ว','Linked to expenses')}</span>
              ${moneyHtml(actualTotal, currency, exportThbRate)}
            </div>
          </div>
        </header>

        <section class="itin-sheet-map">
          ${mapBlock}
          <div class="itin-sheet-legend">${legendItems}${legend}</div>
        </section>

        ${daySections || `<div class="itin-sheet-empty">${isDay ? th('วันนี้ยังไม่มีแผน','No plans for this day') : th('ยังไม่มีแผนในทริปนี้','No itinerary items yet')}</div>`}

        <footer class="itin-sheet-foot">
          <span>${escapeHtml(trip?.name || '')} • ${th('สร้างเมื่อ','generated')} ${dayjs().format('D MMM YYYY HH:mm')}</span>
          <span>${isDay ? `${th('แผนของวัน','Plan for')} ${escapeHtml(dayTitle)} • ${scoped.length} ${th('รายการ','items')}` : `${th('แผนการเดินทางทั้งหมด','Full itinerary')} • ${scoped.length} ${th('รายการ','items')}`}</span>
        </footer>
      </div>`;
  }

  /** Everything both export buttons need: items, rate and the live map capture. */
  async function prepareItineraryExport() {
    // Expenses carry the rate snapshots used for the ≈ THB lines (cached read).
    const expenseList = await fetchAllExpenses(tripId).catch(() => []) || [];
    exportThbRate = resolveTripThbRate(trip, expenseList, currency);
    const all = await fetchItinerary(tripId, null).catch(() => visibleItems) || [];
    // Exported sheets show the same expanded plan (hotel on every stay night).
    const ordered = expandStayItems(all).sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.order || 0) - (b.order || 0));
    return ordered;
  }

  /** Wait for every image of the sheet so nothing is captured half-loaded. */
  async function waitForSheetImages(wrap) {
    await Promise.all([...wrap.querySelectorAll('img')].map(img => {
      try { return img.decode ? img.decode().catch(() => {}) : Promise.resolve(); } catch { return Promise.resolve(); }
    }));
  }

  async function exportItineraryPng() {
    const wrap = document.getElementById('itinerary-export-wrap');
    if (!wrap) return;
    const tLoad = toast.loading(th('กำลังสร้างรูปแผนการเดินทาง…', 'Building the itinerary image…'));
    try {
      const { elementToPngDataUrl, exportToPng } = await import('./exports/index.js');
      const ordered = await prepareItineraryExport();

      // The live map is captured first (real tiles), schematic SVG as fallback.
      let mapDataUrl = null;
      const mapEl = document.getElementById('map');
      if (mapVisible && mapEl?.querySelector('.leaflet-tile')) {
        mapDataUrl = await elementToPngDataUrl('map', { flat: false, scale: 2 });
      }

      wrap.innerHTML = itinerarySheetHtml(ordered, mapDataUrl);
      await waitForSheetImages(wrap);
      wrap.classList.add('is-capturing');
      const safeName = String(trip?.name || tripId).replace(/[\\/:*?"<>|\s]+/g, '-').slice(0, 40);
      await exportToPng('itinerary-export-sheet', `itinerary-${safeName}-${dayjs().format('YYYYMMDD')}.png`, { flat: false, scale: 2 });
      tLoad.close();
      toast.success(th('ส่งออกรูปแผนการเดินทางแล้ว', 'Itinerary image exported'));
      confetti({ y: 150, count: 14 });
    } catch (e) {
      tLoad.close();
      toast.error(e?.message || String(e));
    } finally {
      // The sheet stays off-screen so the result can be inspected (and so a
      // retry does not have to rebuild the map capture).
      wrap.classList.remove('is-capturing');
    }
  }

  /**
   * PNG of ONE day (หนึ่งรูปต่อหนึ่งวัน). The map is built from that day's own
   * coordinates so the picture always matches the day it shows.
   */
  async function exportItineraryDayPng(day) {
    const wrap = document.getElementById('itinerary-export-wrap');
    if (!wrap || !day) return;
    const tLoad = toast.loading(th('กำลังสร้างรูปของวันนี้…', 'Building the day image…'));
    try {
      const { elementToPngDataUrl, exportToPng } = await import('./exports/index.js');
      const ordered = await prepareItineraryExport();
      const dayItems = ordered.filter(it => (it.date || '') === day);

      // The live map shows the selected day, so it can be captured as-is.
      let mapDataUrl = null;
      const mapEl = document.getElementById('map');
      const liveMapMatches = !showAll && day === selectedDate && mapVisible && mapEl?.querySelector('.leaflet-tile');
      if (liveMapMatches) mapDataUrl = await elementToPngDataUrl('map', { flat: false, scale: 2 });

      wrap.innerHTML = itinerarySheetHtml(ordered, mapDataUrl, { day });
      await waitForSheetImages(wrap);
      wrap.classList.add('is-capturing');
      const safeName = String(trip?.name || tripId).replace(/[\\/:*?"<>|\s]+/g, '-').slice(0, 40);
      const idx = Math.max(tripDays.map(d => dayjs(d).format('YYYY-MM-DD')).indexOf(day), 0) + 1;
      await exportToPng('itinerary-export-sheet', `itinerary-${safeName}-day${idx}-${day}.png`, { flat: false, scale: 2 });
      tLoad.close();
      toast.success(th('ส่งออกรูปของวันนี้แล้ว', 'Day image exported'));
      confetti({ y: 150, count: 10 });
    } catch (e) {
      tLoad.close();
      toast.error(e?.message || String(e));
    } finally {
      wrap.classList.remove('is-capturing');
    }
  }

  /* ------------------------- list rendering ------------------------- */
  function itemCardHtml(it, idx, { draggable = false } = {}) {
    const cur = it.estimateCurrency || currency;
    const rate = resolveTripThbRate(trip, itineraryExpenses, cur);
    const fullMinor = Number(it.estimateAmount) > 0 ? toMinor(Number(it.estimateAmount), getCurrencyDecimals(cur)) : 0;
    // A stay distributes its price per night — each day only counts that night.
    const dayMinor = it.isStay && it.stayNightMinor != null ? it.stayNightMinor : fullMinor;
    const perNightMinor = it.isStay && it.stayNights > 0 ? Math.round(fullMinor / it.stayNights) : 0;
    const payerName = members.find(m => m.id === it.estimatePayerId)?.displayName;
    const pendingPayer = fullMinor > 0 && (it.estimatePayerPending === true || (!payerName && !(it.estimateShareWith || []).length));
    const sharedNames = (it.estimateShareWith || []).map(id => members.find(m => m.id === id)?.displayName).filter(Boolean);
    const statusDef = ITINERARY_STATUSES.find(st => st.id === (it.status || 'planned'));
    const isVirtual = Boolean(it.virtualStay);
    const isCheckin = it.stayRole === 'checkin';
    const nights = Number(it.stayNights) || 0;
    const title = isVirtual ? `${th('กลับเข้าพัก', 'Back to hotel')} — ${it.title}` : it.title;

    return `
      <div class="itin-card card card-hover ${draggable ? 'cursor-move' : ''} ${isVirtual ? 'itin-card--stay-return' : ''} ${isCheckin ? 'itin-card--stay' : ''}" data-id="${it.id}" draggable="${draggable && !isVirtual}">
        <div class="itin-body">
          <div class="flex items-start gap-3">
            <div class="step-num ${isVirtual ? 'step-num--stay' : ''}">${isVirtual ? icon('bed-double', 'w-3.5 h-3.5') : idx + 1}</div>
            <div class="flex-1 min-w-0">
              <div class="flex items-start justify-between gap-2">
                <h3 class="font-semibold text-sm leading-snug">${escapeHtml(title)}</h3>
                <span class="flex items-center gap-1 flex-shrink-0">
                  ${it.isStay ? `<span class="badge badge-stay text-[10px]">${icon(isVirtual ? 'moon' : 'bed-double', 'w-2.5 h-2.5')} ${isVirtual ? th(`คืนที่ ${it.stayNight}/${nights}`, `night ${it.stayNight}/${nights}`) : th(`พัก ${nights} คืน`, `${nights} nights`)}</span>` : ''}
                  <span class="badge badge-${it.status || 'planned'} text-[10px]">${escapeHtml(statusDef ? (lang==='th'?statusDef.th:statusDef.en) : (it.status || 'planned'))}</span>
                </span>
              </div>
              <div class="flex items-center gap-2 flex-wrap mt-1.5">
                <span class="meta-line">${icon('clock', 'w-3 h-3')} ${formatTime(it.startAt, trip?.timezone)} – ${formatTime(it.endAt, trip?.timezone)}</span>
                ${isVirtual ? '' : `<span class="meta-line">${icon('timer', 'w-3 h-3')} ${formatDuration(it.durationMinutes)}</span>`}
                ${(!isVirtual && it.travelToNextMinutes > 0) ? `<span class="meta-line">${icon('footprints', 'w-3 h-3')} ${formatDuration(it.travelToNextMinutes)}</span>` : ''}
                <span class="badge badge-planned text-[10px]">${icon(categoryIcon(it.category), 'w-2.5 h-2.5')} ${escapeHtml(categoryLabel(it.category || 'general', lang))}</span>
              </div>
              ${isCheckin && it.stayCheckIn && it.stayCheckOut ? `<p class="meta-line mt-1">${icon('calendar-range', 'w-3 h-3')} <span class="truncate">${th('เช็คอิน','Check-in')} ${escapeHtml(it.stayCheckIn)} → ${th('เช็คเอาท์','Check-out')} ${escapeHtml(it.stayCheckOut)}</span></p>` : ''}
              ${it.address && !isVirtual ? `<p class="meta-line mt-1">${icon('map-pin', 'w-3 h-3')} <span class="truncate">${escapeHtml(it.address)}</span></p>` : ''}
              ${(it.coordinates || it.address || it.googleMapsUrl) ? `<a class="nav-link-btn mt-1.5" href="${escapeHtml(googleMapsPlaceUrl(it))}" target="_blank" rel="noopener">${icon('navigation', 'w-3 h-3')} ${th('นำทาง Google Maps','Navigate')}</a>` : ''}
              ${dayMinor ? `
                <div class="estimate-line ${it.isStay ? 'estimate-line--stay' : ''}">
                  ${icon(it.isStay ? 'bed-double' : 'hourglass', 'w-3.5 h-3.5')}
                  <span>${isVirtual ? th('ส่วนของคืนนี้','This night’s share') : th('ประมาณการ','Est.')} <b>${moneyHtml(dayMinor, cur, rate)}</b></span>
                  ${isCheckin && perNightMinor && nights > 1 ? `<span class="text-[10px]">${th('เฉลี่ย','avg')} ${moneyHtml(perNightMinor, cur, rate)} / ${th('คืน','night')}</span>` : ''}
                  ${!it.isStay ? `<span class="text-[10px]">${escapeHtml(categoryLabel(it.estimateCategory || 'general', lang))}${payerName ? ` • ${th('จ่าย','paid by')} ${escapeHtml(payerName)}` : ''}${sharedNames.length ? ` • ${th('หาร','split')} ${sharedNames.length} ${th('คน','pax')}` : ''}</span>` : ''}
                  ${pendingPayer ? `<span class="badge badge-pending text-[9px]">${icon('help-circle', 'w-2.5 h-2.5')} ${th('ยังไม่ระบุเจ้าภาพ','payer TBD')}</span>` : ''}
                  ${it.expenseId && !isVirtual ? `<span class="badge badge-skipped text-[9px]">${th('อยู่ในค่าใช้จ่าย','in expenses')}</span>` : ''}
                </div>` : ''}
            </div>
          </div>
        </div>
        <div class="itin-thumb">
          ${it.imageUrl
            ? `<img src="${escapeHtml(it.imageUrl)}" alt="" loading="lazy" onerror="this.classList.add('hidden'); this.parentElement.classList.add('is-empty');">`
            : `<span class="itin-thumb-ph">${icon(isVirtual || isCheckin ? 'bed-double' : categoryIcon(it.category), 'w-5 h-5')}</span>`}
          <!-- 3-dot menu lives on the photo (was duplicated + unclickable in the action row) -->
          <div class="itin-more-wrap">
            <button type="button" class="itin-thumb-more" data-act="more" data-id="${it.id}" title="${th('เพิ่มเติม','More')}" aria-label="${th('เมนูรายการ','Item menu')}">${icon('more-vertical', 'w-3.5 h-3.5')}</button>
            <div class="itin-more-menu" data-more-menu="${it.id}">
              ${isVirtual ? '' : `<button data-act="status" data-id="${it.id}">${icon('circle-check', 'w-4 h-4')} ${th('เปลี่ยนสถานะ','Change status')}</button>`}
              <button data-act="edit" data-id="${it.id}">${icon('pencil', 'w-4 h-4')} ${isVirtual ? th('แก้ไขการจองพัก','Edit the stay') : t('edit')}</button>
              ${isVirtual ? '' : `<button data-act="delete" data-id="${it.id}" class="is-danger">${icon('trash-2', 'w-4 h-4')} ${t('delete')}</button>`}
            </div>
          </div>
        </div>
      </div>`;
  }

  async function loadItems() {
    const listEl = document.getElementById('itinerary-list');
    if (!listEl) return;
    listEl.innerHTML = `<div class="skeleton h-24"></div><div class="skeleton h-24"></div>`;
    try {
      // Stays expand to one entry per night, so the hotel shows up in the plan
      // on EVERY day of the stay (and each day only counts that night's share).
      let items = expandStayItems(await fetchItinerary(tripId, null));
      if (isStale(token)) return;
      if (!showAll) items = items.filter(i => i.date === selectedDate);
      if (showAll) {
        items.sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.order || 0) - (b.order || 0));
      } else {
        items.sort((a, b) => (a.order || 0) - (b.order || 0) || new Date(a.startAt || 0) - new Date(b.startAt || 0));
      }
      visibleItems = items;

      if (!items.length) {
        listEl.innerHTML = renderEmptyState({
          icon: 'map-pinned',
          title: th('ไม่มีแผนในวันนี้','No plans'),
          desc: showAll ? th('เพิ่มสถานที่แรกเข้าไปในทริปเลย','Add the first place to your trip') : th(`ยังไม่มีแผนสำหรับ ${selectedDate}`, `No plans for ${selectedDate}`),
          actionHtml: `<button id="empty-add" class="btn btn-primary btn-sm mt-3">${icon('plus', 'w-4 h-4')} ${t('addPlace')}</button>`
        });
        bind('empty-add', 'click', () => openItemForm(null, selectedDate));
        queueIcons();
        await refreshMap(items);
        return;
      }

      if (showAll) {
        const byDay = {};
        items.forEach(it => { const day = it.date || 'unknown'; (byDay[day] = byDay[day] || []).push(it); });
        listEl.innerHTML = Object.entries(byDay).map(([day, dayItems]) => `
          <div class="mb-6">
            <h3 class="font-bold text-sm mb-3 flex items-center gap-2">
              <span class="step-num">${dayjs(day).format('DD')}</span>
              ${formatDate(day, lang, trip?.timezone)}
              <span class="badge badge-planned text-[10px]">${dayItems.length} ${th('ที่','places')}</span>
              <span class="text-[10px] text-[var(--text-tertiary)] ml-auto">${itineraryMoney(dayItems)}</span>
              <button class="itin-day-export-btn" data-export-day="${escapeHtml(day)}" title="${th('ส่งออก PNG ของวันนี้','Export this day as a PNG')}">${icon('image', 'w-3.5 h-3.5')} PNG</button>
            </h3>
            <div class="space-y-3 stagger">${dayItems.map((it, idx) => itemCardHtml(it, idx, { draggable: editMode })).join('')}</div>
          </div>
        `).join('');
      } else {
        listEl.innerHTML = items.map((it, idx) => itemCardHtml(it, idx, { draggable: editMode })).join('');
      }

      listEl.querySelectorAll('[data-export-day]').forEach(btn => btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await exportItineraryDayPng(btn.dataset.exportDay);
      }));

      listEl.querySelectorAll('[data-act]').forEach(btn => btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        let item = visibleItems.find(i => i.id === btn.dataset.id);
        if (!item) return;
        // A virtual "back to hotel" night edits/deletes the MASTER stay item.
        if (item.virtualStay) item = { ...item, id: item.masterId };
        if (btn.dataset.act === 'more') {
          // Toggle the dropdown menu for this card. The menu hangs over the
          // cards below, so while it is open the card must sit on top
          // (.card has will-change:transform → its own stacking context).
          const menuId = btn.dataset.id;
          const menu = listEl.querySelector(`[data-more-menu="${menuId}"]`);
          if (!menu) return;
          const card = btn.closest('.itin-card');
          const opening = !menu.classList.contains('is-open');
          // Close any other open menus first
          listEl.querySelectorAll('.itin-more-menu.is-open').forEach(m => {
            if (m !== menu) m.classList.remove('is-open');
            const other = m.closest('.itin-card');
            if (other) other.classList.remove('itin-menu-open');
          });
          if (card) card.classList.toggle('itin-menu-open', opening);
          menu.classList.toggle('is-open', opening);
          return;
        }
        // Close any open dropdown menus before executing an action
        listEl.querySelectorAll('.itin-more-menu.is-open').forEach(m => {
          m.classList.remove('is-open');
          const owner = m.closest('.itin-card');
          if (owner) owner.classList.remove('itin-menu-open');
        });
        if (btn.dataset.act === 'edit') openItemForm(item, item.date);
        if (btn.dataset.act === 'delete') await removeItem(item);
        if (btn.dataset.act === 'status') await changeStatus(item);
      }));

      // Close dropdown menus when tapping anywhere else on the page
      const closeMenus = () => {
        listEl?.querySelectorAll('.itin-more-menu.is-open').forEach(m => {
          m.classList.remove('is-open');
          const owner = m.closest('.itin-card');
          if (owner) owner.classList.remove('itin-menu-open');
        });
      };
      document.addEventListener('click', closeMenus);
      document.addEventListener('routechange', () => document.removeEventListener('click', closeMenus), { once: true });

      if (editMode) {
        try {
          const Sortable = (await import('https://esm.sh/sortablejs@1.15.3')).default;
          Sortable.create(listEl, {
            animation: 180,
            handle: '.itin-card',
            // virtual "กลับเข้าพัก" night cards are not real items — never drag them
            filter: 'button, .itin-card--stay-return',
            onEnd: async () => {
              const newOrder = Array.from(listEl.querySelectorAll('[data-id]'))
                .map(node => node.dataset.id)
                .filter(id => !String(id).includes('@stay-'));
              const tLoad = toast.loading(th('กำลังจัดลำดับ...', 'Reordering...'));
              try {
                await reorderItinerary(tripId, showAll ? null : selectedDate, newOrder, currentUser.uid);
                tLoad.close();
                toast.success(th('จัดลำดับใหม่แล้ว', 'Reordered'));
                loadItems();
              } catch (err) { tLoad.close(); toast.error(err.message); }
            }
          });
        } catch (err) { console.warn('Sortable failed', err); }
      }
      queueIcons();
      initReveal(listEl);
      await refreshMap(items);
    } catch (e) {
      if (isStale(token)) return;
      console.error(e);
      listEl.innerHTML = `<div class="card p-5 text-center"><p class="text-sm font-semibold" style="color:var(--danger);">${escapeHtml(e.message)}</p><button id="itin-retry" class="btn btn-secondary btn-sm mt-3">${icon('refresh-cw', 'w-4 h-4')} ${th('ลองใหม่','Retry')}</button></div>`;
      bind('itin-retry', 'click', loadItems);
      queueIcons();
    }
  }

  async function removeItem(item) {
    const linked = await findLinkedExpense(tripId, item.id).catch(() => null);
    const ok = await confirmAction({
      title: th(`ลบ "${item.title}" ?`, `Delete "${item.title}"?`),
      message: th('ลบสถานที่นี้จากแผนการเดินทาง', 'Remove this place from the itinerary'),
      detail: linked ? th(`รายการประมาณการ "${escapeHtml(linked.title)}" ในหน้าค่าใช้จ่ายจะถูกลบไปด้วย`, `The linked estimated expense will be removed too.`) : '',
      confirmText: t('delete'), danger: true, icon: 'trash-2'
    });
    if (!ok) return;
    const tLoad = toast.loading(th('กำลังลบ...', 'Deleting...'));
    try {
      await deleteItineraryItem(tripId, item.id);
      tLoad.close();
      toast.success(th('ลบแล้ว', 'Deleted'));
      loadItems();
    } catch (e) { tLoad.close(); toast.error(e.message); }
  }

  async function changeStatus(item) {
    const sheet = showBottomSheet(`
      <h3 class="font-bold mb-3 flex items-center gap-2">${icon('circle-check', 'w-4 h-4')} ${th('เปลี่ยนสถานะ','Change status')}</h3>
      <div class="grid gap-2">
        ${ITINERARY_STATUSES.map(st => `
          <button data-status="${st.id}" class="btn ${item.status === st.id ? 'btn-primary' : 'btn-secondary'} w-full justify-start">
            ${icon(st.id === 'completed' ? 'check' : st.id === 'current' ? 'play' : st.id === 'skipped' ? 'skip-forward' : st.id === 'cancelled' ? 'x' : 'clock', 'w-4 h-4')} ${escapeHtml(lang==='th'?st.th:st.en)}
          </button>`).join('')}
      </div>
    `);
    queueIcons();
    sheet.sheet.querySelectorAll('[data-status]').forEach(btn => btn.addEventListener('click', async () => {
      const status = btn.dataset.status;
      sheet.close();
      const tLoad = toast.loading(th('กำลังบันทึก...', 'Saving...'));
      try {
        const { updateItineraryItem } = await import('./itinerary/index.js');
        await updateItineraryItem(tripId, item.id, { status }, currentUser.uid);
        tLoad.close();
        toast.success(th('อัปเดตสถานะแล้ว', 'Status updated'));
        if (status === 'completed') celebrateFrom(document.querySelector(`[data-id="${item.id}"]`));
        loadItems();
      } catch (e) { tLoad.close(); toast.error(e.message); }
    }));
  }

  /* ------------------------- add / edit form ------------------------- */
  function openItemForm(item = null, presetDate = null) {
    const isEdit = !!item;
    const it = item || {};
    const memberTiles = (selectedIds = []) => members.map(m => `
      <button type="button" class="tile ${selectedIds.includes(m.id) ? 'tile-selected' : ''}" data-member="${m.id}" data-role="share">
        <span class="flex items-center gap-2 min-w-0">
          <span class="avatar w-7 h-7 text-[10px]" style="background:${m.color || 'var(--primary)'};width:28px;height:28px;border-width:1.5px;">${m.photoURL ? `<img src="${escapeHtml(m.photoURL)}" class="w-full h-full rounded-full object-cover" alt="">` : escapeHtml(getInitials(m.displayName))}</span>
          <span class="text-xs font-medium truncate">${escapeHtml(m.displayName)}</span>
        </span>
      </button>`).join('') || `<p class="text-xs text-[var(--text-secondary)]">${th('ยังไม่มีสมาชิกในทริป','No members yet')}</p>`;

    const hasEstimate = Number(it.estimateAmount) > 0;
    const isStay = stayNights(it) > 0;
    // Duration & travel can be typed in minutes OR hours — whichever is easier.
    const toUnit = (mins) => { const m = Number(mins) || 0; return m >= 60 ? { unit: 'hr', value: Math.round((m / 60) * 100) / 100 } : { unit: 'min', value: m }; };
    const durInit = toUnit(it.durationMinutes ?? 60);
    const travelInit = toUnit(it.travelToNextMinutes ?? 0);
    const initPayer = it.estimatePayerPending ? '__pending' : (it.estimatePayerId || currentUser.uid);

    const sheet = showBottomSheet(`
      <div class="space-y-3">
        <div class="flex items-center gap-3">
          <div class="row-icon" style="width:40px;height:40px;border-radius:14px;background:var(--gradient-primary);color:#fff;">${icon(isEdit ? 'pencil' : 'map-pin', 'w-5 h-5')}</div>
          <div class="min-w-0">
            <h3 class="font-bold text-base leading-tight" style="font-family: var(--font-display);">${isEdit ? th('แก้ไขสถานที่','Edit place') : t('addPlace')}</h3>
            <p class="text-[11px] text-[var(--text-secondary)]">${isEdit ? escapeHtml(it.title || '') : th('เพิ่มสถานที่ลงในแผนการเดินทาง','Add a place to your itinerary')}</p>
          </div>
        </div>

        <form id="itinerary-form" class="space-y-4">
          <div class="input-group"><label class="input-label">${icon('sparkles', 'w-3.5 h-3.5')} ${th('ชื่อสถานที่','Place name')} *</label><input id="it-title" class="input" required autocomplete="off" placeholder="${th('เช่น ทะเลสาบคาวากุจิโกะ','e.g. Lake Kawaguchi')}" value="${escapeHtml(it.title || '')}"></div>

          <div class="grid grid-cols-2 gap-3">
            <div class="input-group"><label class="input-label">${icon('calendar', 'w-3.5 h-3.5')} ${th('วันที่','Date')} *</label><input id="it-date" class="input" type="date" value="${escapeHtml(it.date || presetDate || selectedDate)}" required></div>
            <div class="input-group"><label class="input-label">${icon('clock', 'w-3.5 h-3.5')} ${th('เวลาเริ่ม','Start time')} *</label><input id="it-time" class="input" type="time" value="${it.startAt ? dayjs(it.startAt).format('HH:mm') : '09:00'}" required></div>
          </div>

          <div class="grid grid-cols-3 gap-3">
            <div class="input-group"><label class="input-label">${icon('timer', 'w-3.5 h-3.5')} ${th('ระยะเวลา','Duration')}</label>
              <div class="unit-input-row">
                <input id="it-duration" class="input" type="number" min="0" step="${durInit.unit === 'hr' ? '0.25' : '1'}" value="${durInit.value}">
                <select id="it-duration-unit" class="input unit-select" aria-label="${th('หน่วย','Unit')}">
                  <option value="min" ${durInit.unit === 'min' ? 'selected' : ''}>${th('นาที','min')}</option>
                  <option value="hr" ${durInit.unit === 'hr' ? 'selected' : ''}>${th('ชั่วโมง','hr')}</option>
                </select>
              </div>
            </div>
            <div class="input-group"><label class="input-label">${icon('footprints', 'w-3.5 h-3.5')} ${th('เดินทางต่อ','Travel')}</label>
              <div class="unit-input-row">
                <input id="it-travel" class="input" type="number" min="0" step="${travelInit.unit === 'hr' ? '0.25' : '1'}" value="${travelInit.value}">
                <select id="it-travel-unit" class="input unit-select" aria-label="${th('หน่วย','Unit')}">
                  <option value="min" ${travelInit.unit === 'min' ? 'selected' : ''}>${th('นาที','min')}</option>
                  <option value="hr" ${travelInit.unit === 'hr' ? 'selected' : ''}>${th('ชั่วโมง','hr')}</option>
                </select>
              </div>
            </div>
            <div class="input-group"><label class="input-label">${icon('flag', 'w-3.5 h-3.5')} ${th('สถานะ','Status')}</label>
              <select id="it-status" class="input">${ITINERARY_STATUSES.map(st => `<option value="${st.id}" ${(it.status || 'planned') === st.id ? 'selected' : ''}>${lang==='th'?st.th:st.en}</option>`).join('')}</select>
            </div>
          </div>

          <!-- Accommodation stay: price entered ONCE, spread over the nights, and
               a "back to hotel" card shows on every day of the stay -->
          <div class="p-3 rounded-xl" style="background: var(--bg-secondary); border:1px solid var(--border);">
            <label class="flex items-center gap-2 text-sm font-bold cursor-pointer">
              <input id="it-is-stay" type="checkbox" class="accent-[var(--primary)] w-4 h-4" ${isStay ? 'checked' : ''}>
              ${icon('bed-double', 'w-3.5 h-3.5')} ${th('เป็นที่พัก (โรงแรม / เรียวกัง)','Accommodation (hotel / ryokan)')}
            </label>
            <p class="input-hint mt-1">${th('กรอกค่าที่พักครั้งเดียว ระบบจะกระจายตามจำนวนคืน และแสดง “กลับเข้าพัก” ในแผนทุกวันที่พัก','Enter the price once — it is spread across the nights and a “back to hotel” card appears on every stay day')}</p>
            <div id="it-stay-fields" class="${isStay ? '' : 'hidden'} space-y-2 mt-2">
              <div class="grid grid-cols-2 gap-2">
                <div class="input-group"><label class="input-label text-[12px]">${icon('log-in', 'w-3.5 h-3.5')} ${th('เช็คอิน (วันไหน)','Check-in')}</label><input id="it-stay-checkin" class="input" type="date" value="${escapeHtml(it.stayCheckIn || it.date || presetDate || selectedDate || '')}"></div>
                <div class="input-group"><label class="input-label text-[12px]">${icon('log-out', 'w-3.5 h-3.5')} ${th('เช็คเอาท์ (ถึงวันไหน)','Check-out')}</label><input id="it-stay-checkout" class="input" type="date" value="${escapeHtml(it.stayCheckOut || '')}"></div>
              </div>
              <p id="it-stay-summary" class="input-hint"></p>
            </div>
          </div>

          <div class="input-group"><label class="input-label">${icon('tag', 'w-3.5 h-3.5')} ${th('หมวดหมู่','Category')}</label>
            <select id="it-category" class="input">${ITINERARY_CATEGORIES.map(c => `<option value="${c.id}" ${(it.category || 'general') === c.id ? 'selected' : ''}>${lang==='th'?c.th:c.en}</option>`).join('')}</select>
          </div>

          <div class="input-group">
            <label class="input-label">${icon('crosshair', 'w-3.5 h-3.5')} ${th('พิกัด lat,lng','Coordinates lat,lng')}</label>
            <div class="flex gap-2">
              <input id="it-coords" class="input flex-1" placeholder="35.3606,138.7274" autocomplete="off" value="${escapeHtml(it.coordinates || '')}">
              <button type="button" id="it-geo" class="btn btn-secondary btn-sm" title="${th('ใช้ตำแหน่งปัจจุบัน','Use my location')}">${icon('locate-fixed', 'w-4 h-4')}</button>
            </div>
            <p class="input-hint">${th('ใส่พิกัดเพื่อให้หมุดแสดงบนแผนที่ทันที','Add coordinates so the pin shows on the map')}</p>
          </div>

          <div class="input-group"><label class="input-label">${icon('map-pin', 'w-3.5 h-3.5')} ${th('ที่อยู่','Address')}</label><input id="it-address" class="input" autocomplete="off" value="${escapeHtml(it.address || '')}"></div>
          <div class="input-group"><label class="input-label">${icon('link', 'w-3.5 h-3.5')} Google Maps URL</label><input id="it-maps-url" class="input" placeholder="https://maps.google.com/?q=..." autocomplete="off" value="${escapeHtml(it.googleMapsUrl || '')}"></div>

          <div class="input-group">
            <label class="input-label">${icon('image', 'w-3.5 h-3.5')} ${th('รูปภาพ (URL)','Image (URL)')}</label>
            <input id="it-image-url" class="input" placeholder="https://example.com/image.jpg" autocomplete="off" value="${escapeHtml(it.imageUrl || '')}">
            <div id="it-image-preview" class="${it.imageUrl ? '' : 'hidden'} mt-2 rounded-xl overflow-hidden border" style="border-color: var(--border);">
              <img id="it-preview-img" class="w-full object-cover" style="aspect-ratio:16/9;" src="${escapeHtml(it.imageUrl || '')}" alt="">
            </div>
            <p class="input-hint">${th('แสดงเป็นรูป 16:9 ทางด้านขวาของการ์ด','Shown as a 16:9 thumbnail on the right of the card')}</p>
          </div>

          <div class="input-group"><label class="input-label">${icon('align-left', 'w-3.5 h-3.5')} ${th('รายละเอียด','Description')}</label><textarea id="it-desc" class="input" style="min-height:70px;">${escapeHtml(it.description || '')}</textarea></div>
          <div class="input-group"><label class="input-label">${icon('sticky-note', 'w-3.5 h-3.5')} ${th('โน้ต','Notes')}</label><textarea id="it-notes" class="input" style="min-height:60px;">${escapeHtml(it.notes || '')}</textarea></div>

          <!-- Estimated cost -->
          <div class="p-3 rounded-xl" style="background: var(--bg-secondary); border:1px solid var(--border);">
            <label class="flex items-center gap-2 text-sm font-bold cursor-pointer">
              <input id="it-has-estimate" type="checkbox" class="accent-[var(--primary)] w-4 h-4" ${hasEstimate ? 'checked' : ''}>
              ${icon('hourglass', 'w-3.5 h-3.5')} ${th('มีค่าใช้จ่าย (ประมาณการ)','Has a cost (estimate)')}
            </label>
            <p class="input-hint mt-1">${th('เช่น ค่าโรงแรมที่ต้องจอง ค่าเข้าชม — ระบบจะดึงไปรวมในหน้าค่าใช้จ่ายให้อัตโนมัติ','e.g. hotel booking or entrance fee — it is added to the expense book automatically')}</p>

            <div id="it-estimate-fields" class="${hasEstimate ? '' : 'hidden'} space-y-3 mt-3">
              <div class="grid grid-cols-3 gap-2">
                <div class="input-group col-span-2"><label class="input-label text-[12px]">${icon('banknote', 'w-3.5 h-3.5')} ${th('จำนวนเงิน','Amount')}</label><input id="it-estimate-amount" class="input money-input" type="text" inputmode="decimal" value="${it.estimateAmount == null ? '' : formatAmount(it.estimateAmount, getCurrencyDecimals(it.estimateCurrency || currency))}" placeholder="0.00"></div>
                <div class="input-group"><label class="input-label text-[12px]">${icon('coins', 'w-3.5 h-3.5')} ${th('สกุลเงิน','Currency')}</label>
                  <select id="it-estimate-currency" class="input">${['THB','JPY','USD','EUR','KRW','TWD','SGD'].map(c => `<option value="${c}" ${(it.estimateCurrency || currency) === c ? 'selected' : ''}>${c}</option>`).join('')}</select>
                </div>
              </div>
              <div class="input-group"><label class="input-label text-[12px]">${icon('tag', 'w-3.5 h-3.5')} ${th('หมวดค่าใช้จ่าย','Expense category')}</label>
                <select id="it-estimate-category" class="input">${getAllExpenseCategories().map(c => `<option value="${c.id}" ${normalizeCategory(it.estimateCategory || 'general') === c.id ? 'selected' : ''}>${lang==='th'?(c.th||c.en):(c.en||c.th)}</option>`).join('')}</select>
              </div>
              <div class="input-group">
                <label class="input-label text-[12px]">${icon('user', 'w-3.5 h-3.5')} ${th('ใครจ่าย','Paid by')}</label>
                <div class="tile-grid" id="it-payer-tiles">
                  <button type="button" class="tile tile-pending ${initPayer === '__pending' ? 'tile-selected' : ''}" data-member="__pending" data-role="payer">
                    <span class="flex items-center gap-2 min-w-0">
                      <span class="avatar w-7 h-7 text-[10px]" style="background:var(--bg-secondary);color:var(--text-secondary);width:28px;height:28px;border:1.5px dashed var(--border);">${icon('help-circle', 'w-3.5 h-3.5')}</span>
                      <span class="text-xs font-medium truncate">${th('ยังไม่ระบุเจ้าภาพ','TBD — no host yet')}</span>
                    </span>
                  </button>
                  ${members.map(m => `
                    <button type="button" class="tile ${(initPayer === m.id) ? 'tile-selected' : ''}" data-member="${m.id}" data-role="payer">
                      <span class="flex items-center gap-2 min-w-0">
                        <span class="avatar w-7 h-7 text-[10px]" style="background:${m.color || 'var(--primary)'};width:28px;height:28px;border-width:1.5px;">${m.photoURL ? `<img src="${escapeHtml(m.photoURL)}" class="w-full h-full rounded-full object-cover" alt="">` : escapeHtml(getInitials(m.displayName))}</span>
                        <span class="text-xs font-medium truncate">${escapeHtml(m.displayName)}</span>
                      </span>
                    </button>`).join('')}
                </div>
                <p class="input-hint">${th('รายการที่กะคร่าวๆ ไว้ก่อนและยังไม่มีใครอาสาสำรองจ่าย — เลือก “ยังไม่ระบุเจ้าภาพ” ได้ ยอดจะไม่ถูกนับเป็นหนี้ของใครจนกว่าจะระบุผู้จ่ายทีหลัง','Rough estimates nobody has fronted yet can stay “TBD” — they are excluded from everybody’s balance until a payer is assigned')}</p>
              </div>
              <div class="input-group">
                <div class="flex items-center justify-between">
                  <label class="input-label text-[12px]">${icon('split', 'w-3.5 h-3.5')} ${th('ใครหารด้วย','Split with')}</label>
                  <button type="button" id="it-share-all" class="btn btn-ghost btn-sm text-[10px]" style="min-height:26px;padding:2px 8px;">${th('เลือกทั้งหมด','Select all')}</button>
                </div>
                <div class="tile-grid" id="it-share-tiles">
                  ${memberTiles(it.estimateShareWith?.length ? it.estimateShareWith : members.map(m => m.id))}
                </div>
                <p class="input-hint">${th('ระบบจะหารเท่ากันในกลุ่มที่เลือก','Split equally between the selected people')}</p>
              </div>
              <label class="flex items-center gap-2 text-xs cursor-pointer">
                <input id="it-auto-add" type="checkbox" class="accent-[var(--primary)] w-4 h-4" ${it.estimateAutoAdd !== false ? 'checked' : ''}>
                ${th('เพิ่มเข้าหมวดค่าใช้จ่ายอัตโนมัติ','Add to the expense book automatically')}
              </label>
            </div>
          </div>

          <div class="flex gap-2">
            <button type="submit" id="it-submit" class="btn btn-primary flex-1">${icon('save', 'w-4 h-4')} ${isEdit ? t('save') : t('add')}</button>
            ${isEdit ? `<button type="button" id="it-delete" class="btn" style="background:var(--danger-bg);color:var(--danger);border:1.5px solid color-mix(in srgb, var(--danger) 35%, transparent);">${icon('trash-2', 'w-4 h-4')}</button>` : ''}
          </div>
        </form>
      </div>
    `);
    queueIcons();

    const estimateToggle = document.getElementById('it-has-estimate');
    estimateToggle.addEventListener('change', () => {
      document.getElementById('it-estimate-fields').classList.toggle('hidden', !estimateToggle.checked);
      updateStaySummary();
    });

    /* ---- accommodation stay (check-in → check-out) ---- */
    const stayToggle = document.getElementById('it-is-stay');
    stayToggle.addEventListener('change', () => {
      document.getElementById('it-stay-fields').classList.toggle('hidden', !stayToggle.checked);
      updateStaySummary();
    });

    function stayNightCount() {
      const ci = document.getElementById('it-stay-checkin')?.value;
      const co = document.getElementById('it-stay-checkout')?.value;
      if (!ci || !co) return 0;
      return dayjs(co).startOf('day').diff(dayjs(ci).startOf('day'), 'day');
    }
    function updateStaySummary() {
      const el = document.getElementById('it-stay-summary');
      if (!el) return;
      const nights = stayNightCount();
      const ci = document.getElementById('it-stay-checkin')?.value;
      const co = document.getElementById('it-stay-checkout')?.value;
      if (nights > 0) {
        const cur = document.getElementById('it-estimate-currency')?.value || currency;
        const amount = parseCurrencyInput(document.getElementById('it-estimate-amount')?.value || '');
        el.innerHTML = `${icon('moon', 'w-3 h-3')} <b>${th(`พัก ${nights} คืน`, `${nights} night(s)`)}</b>` +
          (amount > 0 ? ` • ${th('เฉลี่ย','avg')} <b>${escapeHtml(formatAmount(amount / nights, getCurrencyDecimals(cur)))} ${escapeHtml(cur)}</b> / ${th('คืน','night')} • ${th('ยอดรวมกระจายเท่าๆ กันทุกคืน (เศษปัดเข้าคืนสุดท้าย)','spread evenly across the nights')}` : ` • ${th('เปิด “มีค่าใช้จ่าย” เพื่อกระจายราคาตามคืน','Tick “Has a cost” to spread the price per night')}`);
      } else if (ci || co) {
        el.innerHTML = `<span style="color:var(--danger);">${icon('alert-triangle', 'w-3 h-3')} ${th('วันเช็คเอาท์ต้องหลังวันเช็คอิน','Check-out must be after check-in')}</span>`;
      } else {
        el.textContent = th('เลือกวันเช็คอิน / เช็คเอาท์', 'Pick the check-in / check-out dates');
      }
      queueIcons();
    }
    ['it-stay-checkin', 'it-stay-checkout'].forEach(id => document.getElementById(id)?.addEventListener('change', updateStaySummary));
    document.getElementById('it-estimate-amount')?.addEventListener('input', updateStaySummary);
    document.getElementById('it-estimate-currency')?.addEventListener('change', updateStaySummary);
    updateStaySummary();

    /* ---- duration / travel in minutes OR hours (a request) ---- */
    const bindUnit = (inputId, unitId) => {
      const input = document.getElementById(inputId);
      const sel = document.getElementById(unitId);
      if (!input || !sel) return;
      sel.addEventListener('change', () => {
        const v = Number(input.value) || 0;
        if (sel.value === 'hr') { input.value = v ? Math.round((v / 60) * 100) / 100 : ''; input.step = '0.25'; }
        else { input.value = v ? Math.round(v * 60) : ''; input.step = '1'; }
      });
    };
    bindUnit('it-duration', 'it-duration-unit');
    bindUnit('it-travel', 'it-travel-unit');
    const readMinutes = (inputId, unitId) => parseDurationInput(
      Number(document.getElementById(inputId)?.value) || 0,
      document.getElementById(unitId)?.value === 'hr' ? 'hours' : 'minutes'
    );

    // Live 16:9 preview
    const urlInput = document.getElementById('it-image-url');
    const preview = document.getElementById('it-image-preview');
    const previewImg = document.getElementById('it-preview-img');
    urlInput.addEventListener('input', () => {
      const url = urlInput.value.trim();
      if (url && url.startsWith('http')) {
        previewImg.src = url;
        preview.classList.remove('hidden');
        previewImg.onerror = () => preview.classList.add('hidden');
      } else preview.classList.add('hidden');
    });

    document.getElementById('it-geo')?.addEventListener('click', () => {
      if (!navigator.geolocation) return toast.error(th('เบราว์เซอร์ไม่รองรับ','Geolocation not supported'));
      const tLoad = toast.loading(th('กำลังหาตำแหน่ง...', 'Locating...'));
      navigator.geolocation.getCurrentPosition(
        pos => {
          tLoad.close();
          document.getElementById('it-coords').value = `${pos.coords.latitude.toFixed(5)},${pos.coords.longitude.toFixed(5)}`;
          toast.success(th('ใส่พิกัดแล้ว', 'Coordinates filled'));
        },
        err => { tLoad.close(); toast.error(err.message); },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    });

    bindMoneyInputs(document);
    let payerId = initPayer;   // member id, or '__pending' = ยังไม่ระบุเจ้าภาพ
    let shareIds = it.estimateShareWith?.length ? [...it.estimateShareWith] : members.map(m => m.id);

    document.querySelectorAll('#it-payer-tiles [data-member]').forEach(btn => btn.addEventListener('click', () => {
      payerId = btn.dataset.member;
      document.querySelectorAll('#it-payer-tiles .tile').forEach(t => t.classList.remove('tile-selected'));
      btn.classList.add('tile-selected');
    }));
    document.querySelectorAll('#it-share-tiles [data-member]').forEach(btn => btn.addEventListener('click', () => {
      const id = btn.dataset.member;
      if (shareIds.includes(id)) { shareIds = shareIds.filter(x => x !== id); btn.classList.remove('tile-selected'); }
      else { shareIds.push(id); btn.classList.add('tile-selected'); }
    }));
    bind('it-share-all', 'click', () => {
      const all = members.map(m => m.id);
      const isAll = shareIds.length === all.length;
      shareIds = isAll ? [] : all;
      document.querySelectorAll('#it-share-tiles .tile').forEach(t => t.classList.toggle('tile-selected', !isAll));
    });

    document.getElementById('it-delete')?.addEventListener('click', async () => {
      sheet.close();
      await removeItem(it);
    });

    document.getElementById('itinerary-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('it-submit');
      btn.disabled = true;
      const tLoad = toast.loading(th('กำลังบันทึก...', 'Saving...'));
      try {
        const wantStay = stayToggle.checked;
        let stayCheckIn = '';
        let stayCheckOut = '';
        if (wantStay) {
          stayCheckIn = document.getElementById('it-stay-checkin').value;
          stayCheckOut = document.getElementById('it-stay-checkout').value;
          if (!stayCheckIn || !stayCheckOut) throw new Error(th('กรอกวันเช็คอินและเช็คเอาท์ให้ครบ','Enter both check-in and check-out dates'));
          if (stayNightCount() <= 0) throw new Error(th('วันเช็คเอาท์ต้องหลังวันเช็คอิน','Check-out must be after check-in'));
        }
        // A stay anchors the item on its check-in day.
        const date = wantStay ? stayCheckIn : document.getElementById('it-date').value;
        const time = document.getElementById('it-time').value;
        const startAt = new Date(`${date}T${time || '09:00'}`);
        const coords = document.getElementById('it-coords').value.trim();
        if (coords && !parseCoordinates(coords)) throw new Error(th('พิกัดไม่ถูกต้อง (ใช้รูปแบบ lat,lng)','Invalid coordinates (use lat,lng)'));
        const wantEstimate = estimateToggle.checked;
        const estimateAmount = wantEstimate ? (parseCurrencyInput(document.getElementById('it-estimate-amount').value) || 0) : 0;
        if (wantEstimate && !(estimateAmount > 0)) throw new Error(th('กรอกจำนวนเงินประมาณการ หรือปิดสวิตช์','Enter the estimated amount or turn the switch off'));

        const payload = {
          title: document.getElementById('it-title').value.trim(),
          date,
          startAt,
          durationMinutes: readMinutes('it-duration', 'it-duration-unit') || 60,
          travelToNextMinutes: readMinutes('it-travel', 'it-travel-unit') || 0,
          coordinates: coords,
          address: document.getElementById('it-address').value.trim(),
          googleMapsUrl: document.getElementById('it-maps-url').value.trim(),
          imageUrl: document.getElementById('it-image-url').value.trim(),
          description: document.getElementById('it-desc').value.trim(),
          notes: document.getElementById('it-notes').value.trim(),
          category: document.getElementById('it-category').value,
          status: document.getElementById('it-status').value,
          estimateAmount,
          estimateCurrency: document.getElementById('it-estimate-currency').value,
          estimateCategory: document.getElementById('it-estimate-category').value,
          estimatePayerId: payerId === '__pending' ? '' : payerId,
          estimatePayerPending: payerId === '__pending',
          estimateShareWith: shareIds,
          estimateAutoAdd: document.getElementById('it-auto-add').checked,
          stayCheckIn,
          stayCheckOut
        };
        if (!payload.title) throw new Error(th('กรุณากรอกชื่อสถานที่','Place name is required'));

        await saveItineraryItem(tripId, payload, currentUser.uid, isEdit ? it.id : null, { trip, members });
        tLoad.close();
        toast.success(isEdit ? th('บันทึกการแก้ไขแล้ว','Saved') : th('เพิ่มสถานที่แล้ว','Place added'));
        if (!isEdit) confetti({ y: 160 });
        sheet.close();
        loadItems();
      } catch (err) {
        tLoad.close();
        toast.error(err.message);
        btn.disabled = false;
      }
    });
  }

  /* ------------------------- Excel export / import (admin) ------------------------- */
  bind('export-excel-btn', 'click', async () => {
    const sheet = showBottomSheet(`
      <h3 class="font-bold mb-3 flex items-center gap-2">${icon('file-spreadsheet', 'w-4 h-4')} ${th('ส่งออก Excel','Export Excel')}</h3>
      <p class="text-xs text-[var(--text-secondary)] mb-3">${th('เลือกช่วงข้อมูลที่ต้องการส่งออก','Choose what to export')}</p>
      <div class="grid gap-2">
        <button id="xl-cur" class="btn btn-primary w-full">${icon('map-pinned', 'w-4 h-4')} ${th('แผนการเดินทาง (ที่แสดงอยู่)','Itinerary (current view)')}</button>
        <button id="xl-all" class="btn btn-secondary w-full">${icon('layers', 'w-4 h-4')} ${th('แผนการเดินทางทั้งหมด','All itinerary items')}</button>
        <button id="xl-csv" class="btn btn-secondary w-full">${icon('table', 'w-4 h-4')} CSV (${th('เปิดใน Excel ได้','opens in Excel')})</button>
        <button id="xl-tpl" class="btn btn-ghost w-full">${icon('file-down', 'w-4 h-4')} ${th('ดาวน์โหลดเทมเพลตเปล่า','Blank template')}</button>
      </div>
    `);
    queueIcons();
    const run = async (fn) => {
      const tLoad = toast.loading(th('กำลังสร้างไฟล์...', 'Preparing file...'));
      try { await fn(); tLoad.close(); toast.success(th('ดาวน์โหลดแล้ว','Downloaded')); sheet.close(); }
      catch (e) { tLoad.close(); toast.error(e.message); }
    };
    bind('xl-cur', 'click', () => run(() => exportWorkbookFile({ trip, items: visibleItems, members, lang, include: 'itinerary' })));
    bind('xl-all', 'click', () => run(async () => {
      const all = await fetchItinerary(tripId, null);
      await exportWorkbookFile({ trip, items: all, members, lang, include: 'itinerary' });
    }));
    bind('xl-csv', 'click', () => run(async () => {
      const rows = [ITINERARY_COLUMNS.map(c => c.en), ITINERARY_COLUMNS.map(c => c.th),
        ...visibleItems.map(it => {
          const row = itineraryItemToRow(it, members, lang);
          return ITINERARY_COLUMNS.map(c => row[c.key] ?? '');
        })];
      await exportCsvFile(rows, ITINERARY_COLUMNS, `itinerary-${tripId}.csv`);
    }));
    bind('xl-tpl', 'click', () => run(() => downloadItineraryTemplate(trip, { lang, withSample: true })));
  });

  bind('import-excel-btn', 'click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx,.xls,.csv,.json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const tLoad = toast.loading(th('กำลังอ่านไฟล์...', 'Reading file...'));
      try {
        const { rows } = await readSpreadsheet(file);
        const { items: parsed, errors } = importItineraryRows(rows, { trip, members, lang });
        tLoad.close();
        if (!parsed.length) {
          toast.error(th('ไม่พบข้อมูลที่นำเข้าได้', 'No importable rows found'));
          if (errors.length) console.warn('import errors', errors);
          return;
        }
        const preview = showBottomSheet(`
          <h3 class="font-bold mb-2 flex items-center gap-2">${icon('upload', 'w-4 h-4')} ${th('นำเข้าแผนการเดินทาง','Import itinerary')}</h3>
          <div class="flex gap-2 mb-3 flex-wrap">
            <span class="badge badge-completed">${icon('check', 'w-3 h-3')} ${parsed.length} ${th('รายการพร้อมนำเข้า','ready')}</span>
            ${errors.length ? `<span class="badge badge-cancelled">${icon('x', 'w-3 h-3')} ${errors.length} ${th('แถวมีปัญหา','errors')}</span>` : ''}
          </div>
          <div class="max-h-[240px] overflow-auto rounded-xl border" style="border-color:var(--border);">
            <table class="w-full text-[11px]"><thead style="background:var(--bg-secondary);"><tr>
              <th class="p-2 text-left">${th('วันที่','Date')}</th><th class="p-2 text-left">${th('สถานที่','Place')}</th><th class="p-2 text-right">${th('ประมาณการ','Est.')}</th>
            </tr></thead><tbody>
              ${parsed.slice(0, 40).map(p => `<tr style="border-top:1px solid var(--border);"><td class="p-2">${escapeHtml(p.date)}</td><td class="p-2 truncate">${escapeHtml(p.title)}</td><td class="p-2 text-right">${p.estimateAmount ? escapeHtml(`${p.estimateCurrency} ${p.estimateAmount}`) : '-'}</td></tr>`).join('')}
            </tbody></table>
          </div>
          ${errors.length ? `<details class="mt-2"><summary class="text-xs cursor-pointer text-[var(--danger)]">${th('ดูแถวที่มีปัญหา','See problem rows')}</summary><pre class="mt-1 p-2 rounded-lg text-[10px] overflow-auto" style="background:var(--bg-secondary);max-height:160px;">${escapeHtml(JSON.stringify(errors.slice(0, 10), null, 1))}</pre></details>` : ''}
          <label class="flex items-center gap-2 text-xs mt-3 cursor-pointer">
            <input id="import-sync-expenses" type="checkbox" class="accent-[var(--primary)] w-4 h-4" checked>
            ${th('สร้างรายการประมาณการในหน้าค่าใช้จ่ายด้วย','Also create the estimated expenses')}
          </label>
          <div class="flex gap-2 mt-3">
            <button id="import-cancel" class="btn btn-secondary flex-1">${t('cancel')}</button>
            <button id="import-confirm" class="btn btn-primary flex-1">${icon('check', 'w-4 h-4')} ${th('นำเข้า','Import')}</button>
          </div>
        `);
        queueIcons();
        bind('import-cancel', 'click', () => preview.close());
        bind('import-confirm', 'click', async () => {
          const btn = document.getElementById('import-confirm');
          btn.disabled = true;
          const syncExpenses = document.getElementById('import-sync-expenses')?.checked !== false;
          const tImp = toast.loading(th('กำลังนำเข้า...', 'Importing...'));
          try {
            const { bulkCreateItineraryItems } = await import('./itinerary/index.js');
            const res = await bulkCreateItineraryItems(tripId, parsed, currentUser.uid);
            if (syncExpenses) {
              for (const created of (res.items || [])) {
                if (Number(created.estimateAmount) > 0 && created.estimateAutoAdd !== false) {
                  try { await syncItineraryExpense(tripId, created, { userId: currentUser.uid, trip, members }); } catch {}
                }
              }
            }
            tImp.close();
            preview.close();
            toast.success(th(`นำเข้าสำเร็จ ${res.created} รายการ`, `Imported ${res.created} items`));
            confetti({ y: 140 });
            loadItems();
          } catch (e) { tImp.close(); toast.error(e.message); btn.disabled = false; }
        });
      } catch (e) { tLoad.close(); toast.error(e.message); }
    };
    input.click();
  });

  bind('edit-mode-btn', 'click', () => {
    editMode = !editMode;
    const btn = document.getElementById('edit-mode-btn');
    if (btn) {
      btn.innerHTML = editMode ? `${icon('check', 'w-4 h-4')} ${t('exitEdit')}` : `${icon('list-ordered', 'w-4 h-4')} ${t('editMode')}`;
      btn.className = editMode ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm';
    }
    queueIcons();
    loadItems();
  });

  bind('add-itinerary-btn', 'click', () => openItemForm(null, showAll ? null : selectedDate));
  loadItems();
  if (action === 'add') openItemForm(null, showAll ? null : selectedDate);
}

const EXPENSE_CATS = EXPENSE_CATEGORIES;   // built-ins (kept for Excel/legacy paths)

/* ================================================================== *
 * Expenses — list (edit / delete / filter / Excel)
 * ================================================================== */
async function renderExpenses(params) {
  const tripId = params.tripId;
  const token = beginRender();
  const lang = getLang();
  const th = (a, b) => (lang === 'th' ? a : b);
  await loadTrip(tripId);
  if (isStale(token)) return;
  const trip = currentTrip;
  const currency = trip?.baseCurrency || 'THB';
  // permissions, trip groups and the member list are independent — one round trip
  const [perms, , membersRes, commentsRes] = await Promise.all([
    resolvePermissions(tripId, trip, currentUser.uid),
    loadTripCategories(tripId).catch(e => console.warn(e)),
    listMembers(tripId).catch(e => { console.warn(e); return []; }),
    listComments(tripId).catch(e => { console.warn(e); return []; }),
    fetchAllExpenses(tripId).catch(() => [])
  ]);
  if (isStale(token)) return;
  const isAdmin = perms.isAdmin;

  const members = membersRes || [];
  currentTripMembers = members;
  let tripComments = commentsRes || [];
  let commentMap = commentsByExpense(tripComments);
  if (isStale(token)) return;
  const membersMap = Object.fromEntries(members.map(m => [m.id, m]));

  const urlParams = new URLSearchParams(location.hash.split('?')[1] || '');
  const action = urlParams.get('action');

  appEl.innerHTML = `
    <div class="page-enter">
      <div class="flex flex-wrap items-center justify-between gap-3 mb-5">
        ${renderPageScene('expenses', { lang, title: `${icon('wallet', 'w-5 h-5')} ${t('expenses')}`,
          subtitle: th('บันทึกค่าใช้จ่าย • หารเท่ากัน/ไม่เท่ากัน • ประมาณการจากแผน','Log expenses • split equally or custom • estimates from the plan') })}
        <div class="btn-row">
          ${isAdmin ? `
          <button id="exp-excel-btn" class="btn btn-secondary btn-sm">${icon('file-spreadsheet', 'w-4 h-4')} Excel</button>
          <button id="exp-import-btn" class="btn btn-secondary btn-sm">${icon('upload', 'w-4 h-4')} Import</button>` : ''}
          <button id="export-expenses" class="btn btn-secondary btn-sm">${icon('file-json', 'w-4 h-4')} JSON</button>
          <button id="add-expense-btn" class="btn btn-primary btn-sm">${icon('plus', 'w-4 h-4')} ${t('addExpense')}</button>
        </div>
      </div>

      <div class="kpi-strip mb-4">
        <div class="kpi-mini"><span class="kpi-mini-label">${th('รวมทั้งหมด','Total')}</span><b id="exp-sum-total">--</b></div>
        <div class="kpi-mini"><span class="kpi-mini-label">${th('จ่ายจริง','Actual')}</span><b id="exp-sum-actual">--</b></div>
        <div class="kpi-mini"><span class="kpi-mini-label">${th('ประมาณการ','Estimated')}</span><b id="exp-sum-est">--</b></div>
        <div class="kpi-mini"><span class="kpi-mini-label">${th('รายการ','Items')}</span><b id="exp-sum-count">--</b></div>
      </div>

      <div class="chip-row mb-2" id="expense-filters">
        <button class="chip chip-active" data-filter="all">${icon('layers', 'w-3.5 h-3.5')} ${t('all')}</button>
        <button class="chip" data-filter="today">${icon('calendar-check', 'w-3.5 h-3.5')} ${t('today')}</button>
        <button class="chip" data-filter="estimated">${icon('hourglass', 'w-3.5 h-3.5')} ${th('ประมาณการ','Estimated')}</button>
        <button class="chip" data-filter="actual">${icon('check-circle', 'w-3.5 h-3.5')} ${th('จ่ายจริง','Actual')}</button>
      </div>
      <div class="px-1 mb-2 flex items-center justify-between gap-2 flex-wrap">
        <div class="segmented" id="expense-group-toggle">
          <button type="button" class="segmented-item active" data-group="list">${icon('list', 'w-3.5 h-3.5')} ${th('เรียงรายการ','List')}</button>
          <button type="button" class="segmented-item" data-group="day">${icon('calendar-days', 'w-3.5 h-3.5')} ${th('แยกตามวัน','By day')}</button>
        </div>
        <div class="btn-row">
          <button id="activity-btn" class="link-btn text-[11px]">${icon('history', 'w-3.5 h-3.5')} ${th('ประวัติการแก้ไข','Activity log')}</button>
          <button id="manage-cats-btn" class="link-btn text-[11px]">${icon('settings-2', 'w-3.5 h-3.5')} ${th('จัดการกลุ่มค่าใช้จ่าย','Manage expense groups')}</button>
        </div>
      </div>
      <div class="chip-row mb-4" id="cat-filters">
        <button class="chip chip-active" data-cat="">${icon('layout-grid', 'w-3.5 h-3.5')} ${th('ทุกหมวด','All categories')}</button>
        ${getAllExpenseCategories().map(c => `<button class="chip" data-cat="${c.id}">${icon(c.icon, 'w-3.5 h-3.5')} ${lang==='th'?(c.th||c.en):(c.en||c.th)}</button>`).join('')}
      </div>

      <div id="expense-list" class="space-y-3 stagger"></div>
      <div id="expense-pagination" class="flex justify-center mt-6"><button id="load-more" class="btn btn-secondary btn-sm">${icon('chevron-down', 'w-4 h-4')} ${th('โหลดเพิ่ม','Load more')}</button></div>
    </div>
  `;
  queueIcons();
  initReveal(appEl);

  bind('add-expense-btn', 'click', () => { location.hash = `#/trip/${tripId}/expenses/add`; });
  bind('manage-cats-btn', 'click', () => openCategoryManager(tripId, { onSaved: () => renderExpenses(params) }));

  let lastDoc = null;
  let allLoaded = [];
  let activeFilter = 'all';
  let catFilter = '';
  // How the list is presented: one flat list, or grouped per day (a request).
  let groupMode = localStorage.getItem('fuji_exp_group') === 'day' ? 'day' : 'list';
  applyGroupToggle();

  function applyGroupToggle() {
    document.querySelectorAll('#expense-group-toggle [data-group]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.group === groupMode);
    });
  }

  document.querySelectorAll('#expense-group-toggle [data-group]').forEach(btn => btn.addEventListener('click', () => {
    groupMode = btn.dataset.group === 'day' ? 'day' : 'list';
    try { localStorage.setItem('fuji_exp_group', groupMode); } catch { /* ignore */ }
    applyGroupToggle();
    applyFilterRender();
  }));

  bind('activity-btn', 'click', () => openActivitySheet(tripId, { isAdmin }));

  /** Comment button + badge for one expense row. */
  function commentButton(expenseId) {
    const count = commentMap.get(expenseId)?.length || 0;
    return `<button class="icon-btn ${count ? 'has-comments' : ''}" data-comment="${expenseId}" title="${th('ความเห็น / ทักท้วง','Comment / question')}">
      ${icon('message-square', 'w-3.5 h-3.5')}${count ? `<span class="icon-btn-badge">${count}</span>` : ''}
    </button>`;
  }

  function refreshComments() {
    return listComments(tripId, { })
      .then((list) => { tripComments = list; commentMap = commentsByExpense(list); applyFilterRender(); })
      .catch((e) => console.warn('comments refresh failed', e?.message));
  }

  document.querySelectorAll('#expense-filters [data-filter]').forEach(btn => btn.addEventListener('click', () => {
    activeFilter = btn.dataset.filter;
    document.querySelectorAll('#expense-filters .chip').forEach(c => c.classList.remove('chip-active'));
    btn.classList.add('chip-active');
    applyFilterRender();
  }));
  document.querySelectorAll('#cat-filters [data-cat]').forEach(btn => btn.addEventListener('click', () => {
    catFilter = btn.dataset.cat;
    document.querySelectorAll('#cat-filters .chip').forEach(c => c.classList.remove('chip-active'));
    btn.classList.add('chip-active');
    applyFilterRender();
  }));

  function filterItems(items) {
    let out = items;
    if (activeFilter === 'today') out = out.filter(e => e.date === dayjs().format('YYYY-MM-DD'));
    if (activeFilter === 'estimated') out = out.filter(e => e.isEstimated);
    if (activeFilter === 'actual') out = out.filter(e => !e.isEstimated);
    if (catFilter) out = out.filter(e => (e.category || 'general') === catFilter);
    return out;
  }

  function renderSummary() {
    let normalized;
    try { normalized = expensesInThb(allLoaded, trip); }
    catch (err) {
      ['exp-sum-total', 'exp-sum-actual', 'exp-sum-est'].forEach(id => setHtml(id, `<span class="money-secondary">${escapeHtml(err.message)}</span>`));
      setText('exp-sum-count', String(allLoaded.length));
      return;
    }
    const total = sumExpenses(normalized);
    const actual = sumExpenses(normalized, { estimatedOnly: false });
    const est = sumExpenses(normalized, { estimatedOnly: true });
    const rate = resolveTripThbRate(trip, allLoaded, currency);
    const withThb = minor => thbPlusLabelHtml(minor, currency !== 'THB' && rate ? formatCurrency(convertCurrency(minor, 'THB', currency, 1 / rate), currency) : '');
    setHtml('exp-sum-total', withThb(total));
    setHtml('exp-sum-actual', withThb(actual));
    setHtml('exp-sum-est', withThb(est));
    setText('exp-sum-count', String(allLoaded.length));
  }

  function expenseCardHtml(e) {
    const catLabel = categoryLabel(e.category || 'general', lang);
    const payer = expensePayments(e).map(p => membersMap[p.memberId]?.displayName || p.memberId).join(', ');
    const participants = (e.allocations || []).filter(a => a.amountMinor > 0).length;
    const method = e.paymentMethod === 'card' ? 'card' : e.paymentMethod === 'transfer' ? 'transfer' : 'cash';
    const methodText = method === 'card' ? th('บัตรเครดิต','Card') : method === 'transfer' ? th('โอนเงิน','Transfer') : th('เงินสด','Cash');
    return `
      <div class="expense-card card card-hover" data-expense="${e.id}">
        <div class="row-icon" style="width:44px;height:44px;border-radius:14px;background:color-mix(in srgb, ${categoryColor(e.category)} 16%, transparent);color:${categoryColor(e.category)};">
          ${icon(categoryIcon(e.category), 'w-5 h-5')}
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-start justify-between gap-2">
            <h3 class="font-semibold text-sm truncate">${escapeHtml(e.title)}</h3>
            <div class="text-right flex-shrink-0">
              ${moneyHtml(e.netTotalMinor || 0, e.currency || currency, e.thbRate || resolveTripThbRate(trip, allLoaded, e.currency || currency))}
            </div>
          </div>
          <div class="flex items-center gap-2 flex-wrap mt-1">
            <span class="badge badge-planned text-[10px]">${icon(categoryIcon(e.category), 'w-2.5 h-2.5')} ${escapeHtml(catLabel)}</span>
            ${e.isEstimated ? `<span class="badge badge-skipped text-[10px]">${icon('hourglass', 'w-2.5 h-2.5')} ${th('ประมาณการ','est.')}</span>` : ''}
            ${e.source === 'itinerary-estimate' ? `<span class="badge badge-current text-[10px]">${icon('map-pinned', 'w-2.5 h-2.5')} ${th('จากแผน','from itinerary')}</span>` : ''}
            <span class="meta-line">${icon('calendar', 'w-3 h-3')} ${escapeHtml(e.date || '')}</span>
            ${e.payerPending
              ? `<span class="badge badge-pending text-[10px]" title="${th('ยังไม่รู้ว่าจะใครสำรองจ่าย — ยอดยังไม่ถูกนับเป็นหนี้ของใคร','Nobody is hosting this bill yet — it stays out of balances until assigned')}">${icon('help-circle', 'w-2.5 h-2.5')} ${th('ยังไม่ระบุเจ้าภาพ','payer TBD')}</span>`
              : payer ? `<span class="meta-line">${icon('user', 'w-3 h-3')} ${escapeHtml(payer)}</span>` : ''}
            ${participants ? `<span class="meta-line">${icon('split', 'w-3 h-3')} ${participants} ${th('คน','pax')}</span>` : ''}
            <span class="rcpt-chip rcpt-chip--${method}">${icon(method === 'card' ? 'credit-card' : method === 'transfer' ? 'arrow-left-right' : 'banknote', 'w-2.5 h-2.5')} ${methodText}</span>
            ${e.cardName ? `<span class="rcpt-chip rcpt-chip--card" title="${th('บัตรเครดิต','Card')}">${icon('credit-card', 'w-2.5 h-2.5')} ${escapeHtml(e.cardName)}</span>` : ''}
          </div>
          ${e.description ? `<p class="text-[11px] text-[var(--text-secondary)] mt-1 line-clamp-2">${escapeHtml(e.description)}</p>` : ''}
          ${e.receiptImage ? `<img class="expense-receipt-thumb" src="${escapeHtml(e.receiptImage)}" alt="${th('รูปใบเสร็จ','Receipt photo')}" loading="lazy">` : ''}
          ${(e.updatedByName || e.createdByName) ? `<p class="meta-line mt-1" style="color:var(--text-tertiary);">${icon('history', 'w-3 h-3')} ${escapeHtml(lastEditorText({ ...e, updatedAt: e.updatedByName ? e.updatedAt : null }, lang))}</p>` : ''}
          ${commentMap.get(e.id)?.length ? `<p class="expense-comment-preview">${icon('message-square', 'w-3 h-3')} <b>${escapeHtml(commentMap.get(e.id)[commentMap.get(e.id).length - 1].name || '')}</b>: ${escapeHtml((commentMap.get(e.id)[commentMap.get(e.id).length - 1].text || '').slice(0, 70))}</p>` : ''}
        </div>
        <div class="expense-actions">
          ${commentButton(e.id)}
          <button class="icon-btn" data-act="edit" data-id="${e.id}" title="${t('edit')}">${icon('pencil', 'w-3.5 h-3.5')}</button>
          <button class="icon-btn icon-btn-danger" data-act="delete" data-id="${e.id}" title="${t('delete')}">${icon('trash-2', 'w-3.5 h-3.5')}</button>
        </div>
      </div>`;
  }

  function applyFilterRender() {
    const listEl = document.getElementById('expense-list');
    if (!listEl) return;
    renderSummary();
    const items = filterItems(allLoaded);
    if (!items.length) {
      listEl.innerHTML = renderEmptyState({
        icon: 'wallet',
        title: activeFilter === 'all' && !catFilter ? th('ยังไม่มีค่าใช้จ่าย','No expenses') : th('ไม่พบรายการตามตัวกรอง','No items match the filter'),
        desc: activeFilter === 'all' && !catFilter ? th('เพิ่มรายการแรกเพื่อเริ่มติดตามงบประมาณ','Add your first expense to start tracking') : '',
        actionHtml: activeFilter === 'all' && !catFilter ? `<button id="empty-exp-add" class="btn btn-primary btn-sm mt-3">${icon('plus', 'w-4 h-4')} ${t('addExpense')}</button>` : ''
      });
      bind('empty-exp-add', 'click', () => { location.hash = `#/trip/${tripId}/expenses/add`; });
      queueIcons();
      return;
    }
    if (groupMode === 'day') {
      // Grouped per day: a header per date with the day's total (trip + THB).
      const byDay = new Map();
      for (const e of items) {
        const key = e.date || '—';
        if (!byDay.has(key)) byDay.set(key, []);
        byDay.get(key).push(e);
      }
      const days = [...byDay.keys()].sort((a, b) => String(b).localeCompare(String(a)));
      listEl.innerHTML = days.map(day => {
        const dayItems = byDay.get(day);
        let dayTotal = null;
        try { dayTotal = sumExpenses(expensesInThb(dayItems, trip)); } catch { /* missing rate */ }
        const tripRate = resolveTripThbRate(trip, allLoaded, currency);
        const thbTotal = dayTotal != null && currency !== 'THB' && tripRate ? origTextChipHtml(formatCurrency(convertCurrency(dayTotal, 'THB', currency, 1 / tripRate), currency)) : '';
        return `
          <section class="expense-day" data-day="${escapeHtml(day)}">
            <header class="expense-day-head">
              <span class="expense-day-num">${day === '—' ? icon('calendar-x', 'w-4 h-4') : dayjs(day).format('DD')}</span>
              <div class="min-w-0">
                <div class="expense-day-title">${day === '—' ? th('ไม่ระบุวันที่','No date') : escapeHtml(formatDate(day, lang, trip?.timezone))}</div>
                <div class="expense-day-sub">${dayItems.length} ${th('รายการ','items')}</div>
              </div>
              <div class="expense-day-total">
                <b class="money-primary">${dayTotal == null ? th('ยังไม่มีเรท THB','THB rate needed') : formatCurrency(dayTotal, 'THB')}</b>
                ${thbTotal}
              </div>
            </header>
            <div class="space-y-3 stagger">${dayItems.map(e => expenseCardHtml(e)).join('')}</div>
          </section>`;
      }).join('');
    } else {
      listEl.innerHTML = items.map(e => expenseCardHtml(e)).join('');
    }
    listEl.querySelectorAll('[data-comment]').forEach(btn => btn.addEventListener('click', async (ev) => {
      ev.stopPropagation();
      const id = btn.dataset.comment;
      const exp = allLoaded.find(x => x.id === id);
      openCommentSheet({
        tripId,
        expenseId: id,
        title: exp?.title || '',
        amount: exp ? formatCurrency(exp.netTotalMinor || 0, exp.currency || currency) : '',
        comments: tripComments,
        canDeleteAny: isAdmin,
        onChanged: () => refreshComments()
      });
    }));
    listEl.querySelectorAll('[data-act]').forEach(btn => btn.addEventListener('click', async (ev) => {
      ev.stopPropagation();
      const id = btn.dataset.id;
      if (btn.dataset.act === 'edit') location.hash = `#/trip/${tripId}/expenses/add?id=${id}`;
      else await removeExpense(id);
    }));
    listEl.querySelectorAll('[data-expense]').forEach(card => card.addEventListener('click', (ev) => {
      if (ev.target.closest('[data-act]') || ev.target.closest('[data-comment]')) return;
      location.hash = `#/trip/${tripId}/expenses/add?id=${card.dataset.expense}`;
    }));
    queueIcons();
    initReveal(listEl);
  }

  async function removeExpense(id) {
    const exp = allLoaded.find(e => e.id === id);
    const ok = await confirmAction({
      title: th(`ลบ "${exp?.title || ''}" ?`, `Delete "${exp?.title || ''}"?`),
      message: th('ลบรายการค่าใช้จ่ายนี้ออกจากทริป', 'Remove this expense from the trip'),
      detail: exp ? `${formatCurrency(exp.netTotalMinor || 0, exp.currency || currency)} • ${escapeHtml(exp.date || '')}` : '',
      confirmText: t('delete'), danger: true, icon: 'trash-2'
    });
    if (!ok) return;
    const tLoad = toast.loading(th('กำลังลบ...', 'Deleting...'));
    try {
      const result = await deleteExpense(tripId, id, currentUser.uid);
      await logActivity(tripId, {
        type: 'expense.delete', targetId: id, title: exp?.title || '',
        detail: exp ? `${formatCurrency(exp.netTotalMinor || 0, exp.currency || currency)} • ${result === 'voided' ? th('ซ่อนไว้ (ลบถาวรไม่ได้)','voided') : th('ลบแล้ว','deleted')}` : '',
        user: actor()
      });
      tLoad.close();
      allLoaded = allLoaded.filter(e => e.id !== id);
      if (result === 'voided') toast.warning(th('ลบถาวรไม่ได้ (rules ยังไม่อนุญาต) — ซ่อนรายการนี้แทน', 'Hard delete blocked by rules — the expense was voided instead'));
      else toast.success(th('ลบแล้ว','Deleted'));
      applyFilterRender();
    } catch (e) { tLoad.close(); toast.error(e.message); }
  }

  async function loadMore(reset = false) {
    if (reset) { lastDoc = null; allLoaded = []; }
    const listEl = document.getElementById('expense-list');
    if (reset && listEl) listEl.innerHTML = `<div class="skeleton h-20"></div><div class="skeleton h-20"></div>`;
    try {
      const { items, lastDoc: newLast } = await fetchExpenses(tripId, { pageSize: 30, lastDoc });
      if (isStale(token)) return;
      lastDoc = newLast;
      const seen = new Set(allLoaded.map(e => e.id));
      allLoaded.push(...items.filter(e => !seen.has(e.id)));
      applyFilterRender();
      const loadMoreBtn = document.getElementById('load-more');
      if (loadMoreBtn) loadMoreBtn.classList.toggle('hidden', !newLast);
    } catch (e) {
      if (isStale(token)) return;
      console.error(e);
      const listEl2 = document.getElementById('expense-list');
      if (listEl2) listEl2.innerHTML = `<div class="card p-5 text-center"><p class="text-sm font-semibold" style="color:var(--danger);">${escapeHtml(e.message)}</p><button id="exp-retry" class="btn btn-secondary btn-sm mt-3">${icon('refresh-cw', 'w-4 h-4')} ${th('ลองใหม่','Retry')}</button></div>`;
      bind('exp-retry', 'click', () => loadMore(true));
      queueIcons();
    }
  }

  bind('load-more', 'click', () => loadMore(false));

  bind('export-expenses', 'click', async () => {
    const tLoad = toast.loading(th('กำลังส่งออก...', 'Exporting...'));
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
      toast.success(th('ส่งออกไฟล์แล้ว', 'Exported'));
    } catch (e) { tLoad.close(); toast.error(e.message); }
  });

  bind('exp-excel-btn', 'click', async () => {
    const tLoad = toast.loading(th('กำลังสร้างไฟล์...', 'Preparing file...'));
    try {
      const all = await fetchAllExpenses(tripId);
      await exportWorkbookFile({ trip, expenses: all, members, items: [], lang, include: 'expenses' });
      tLoad.close();
      toast.success(th('ดาวน์โหลดแล้ว', 'Downloaded'));
    } catch (e) { tLoad.close(); toast.error(e.message); }
  });

  bind('exp-import-btn', 'click', () => {
    const inputEl = document.createElement('input');
    inputEl.type = 'file';
    inputEl.accept = '.xlsx,.xls,.csv,.json';
    inputEl.onchange = async () => {
      const file = inputEl.files?.[0];
      if (!file) return;
      const tLoad = toast.loading(th('กำลังอ่านไฟล์...', 'Reading file...'));
      try {
        const { rows } = await readSpreadsheet(file);
        let items = [];
        try { items = await fetchItinerary(tripId, null); } catch {}
        const { expenses: parsed, errors } = importExpenseRows(rows, { trip, members, items, lang });
        tLoad.close();
        if (!parsed.length) {
          toast.error(th('ไม่พบข้อมูลที่นำเข้าได้', 'No importable rows found'));
          return;
        }
        const preview = showBottomSheet(`
          <h3 class="font-bold mb-2 flex items-center gap-2">${icon('upload', 'w-4 h-4')} ${th('นำเข้าค่าใช้จ่าย', 'Import expenses')}</h3>
          <div class="flex gap-2 mb-3 flex-wrap">
            <span class="badge badge-completed">${icon('check', 'w-3 h-3')} ${parsed.length} ${th('รายการพร้อมนำเข้า','ready')}</span>
            ${errors.length ? `<span class="badge badge-cancelled">${icon('x', 'w-3 h-3')} ${errors.length} ${th('แถวมีปัญหา','errors')}</span>` : ''}
          </div>
          <div class="max-h-[220px] overflow-auto rounded-xl border" style="border-color:var(--border);">
            <table class="w-full text-[11px]"><thead style="background:var(--bg-secondary);"><tr>
              <th class="p-2 text-left">${th('วันที่','Date')}</th><th class="p-2 text-left">${th('รายการ','Title')}</th><th class="p-2 text-right">${th('ยอด','Amount')}</th>
            </tr></thead><tbody>
              ${parsed.slice(0, 40).map(p => `<tr style="border-top:1px solid var(--border);"><td class="p-2">${escapeHtml(p.date)}</td><td class="p-2 truncate">${escapeHtml(p.title)}</td><td class="p-2 text-right">${escapeHtml(`${p.currency} ${fromMinor(p.netTotalMinor, getCurrencyDecimals(p.currency)).toLocaleString()}`)}</td></tr>`).join('')}
            </tbody></table>
          </div>
          ${errors.length ? `<details class="mt-2"><summary class="text-xs cursor-pointer text-[var(--danger)]">${th('ดูแถวที่มีปัญหา','See problem rows')}</summary><pre class="mt-1 p-2 rounded-lg text-[10px] overflow-auto" style="background:var(--bg-secondary);max-height:160px;">${escapeHtml(JSON.stringify(errors.slice(0, 10), null, 1))}</pre></details>` : ''}
          <div class="flex gap-2 mt-3">
            <button id="imp-exp-cancel" class="btn btn-secondary flex-1">${t('cancel')}</button>
            <button id="imp-exp-confirm" class="btn btn-primary flex-1">${icon('check', 'w-4 h-4')} ${th('นำเข้า','Import')}</button>
          </div>
        `);
        queueIcons();
        bind('imp-exp-cancel', 'click', () => preview.close());
        bind('imp-exp-confirm', 'click', async () => {
          const btn = document.getElementById('imp-exp-confirm');
          btn.disabled = true;
          const tImp = toast.loading(th('กำลังนำเข้า...', 'Importing...'));
          try {
            const { bulkCreateExpenses } = await import('./expenses/index.js');
            const count = await bulkCreateExpenses(tripId, parsed, currentUser.uid);
            tImp.close();
            preview.close();
            toast.success(th(`นำเข้าสำเร็จ ${count} รายการ`, `Imported ${count} items`));
            confetti({ y: 140 });
            loadMore(true);
          } catch (e) { tImp.close(); toast.error(e.message); btn.disabled = false; }
        });
      } catch (e) { tLoad.close(); toast.error(e.message); }
    };
    inputEl.click();
  });

  await loadMore(true);
  if (action === 'add') location.hash = `#/trip/${tripId}/expenses/add`;
}

/* ================================================================== *
 * Expense editor — add AND edit (all fields editable, deletable)
 * ================================================================== */
async function renderExpenseAdd(params) {
  const editorHash = location.hash;
  const tripId = params.tripId;
  const token = beginRender();
  const lang = getLang();
  const th = (a, b) => (lang === 'th' ? a : b);
  await loadTrip(tripId);
  if (isStale(token)) return;
  const trip = currentTrip;
  const baseCurrency = trip?.baseCurrency || 'THB';

  const urlParams = new URLSearchParams(location.hash.split('?')[1] || '');
  const editId = urlParams.get('id');
  const isEdit = !!editId;

  // Groups / members / itinerary are independent reads (and cached) — fire them
  // together so the form paints after one round trip, not three.
  const [, membersRes, itemsRes, commentsRes, expenseRates] = await Promise.all([
    loadTripCategories(tripId).catch(e => console.warn(e)),
    listMembers(tripId).catch(e => { console.warn(e); return []; }),
    fetchItinerary(tripId, null).catch(e => { console.warn(e); return []; }),
    listComments(tripId).catch(e => { console.warn(e); return []; }),
    fetchAllExpenses(tripId).catch(() => [])
  ]);
  let members = membersRes || [];
  currentTripMembers = members;
  const tripComments = commentsRes || [];
  const commentMapAll = () => commentsByExpense(tripComments);
  let items = itemsRes || [];
  let expense = null;
  if (isEdit) {
    try { expense = await getExpense(tripId, editId); }
    catch (e) { toast.error(e.message); location.hash = `#/trip/${tripId}/expenses`; return; }
  }
  if (isStale(token)) return;

  const e = expense || {};
  const currency = e.currency || baseCurrency;
  const decimals = getCurrencyDecimals(currency);
  const amount = (minor) => (minor ? formatAmount(fromMinor(minor, decimals), decimals) : '');
  const initialPayments = expensePayments(e);
  const initialPayers = new Set(initialPayments.length ? initialPayments.map(p => p.memberId) : [members[0]?.id || currentUser.uid]);

  appEl.innerHTML = `
    <div class="page-enter max-w-[720px] mx-auto">
      <div class="flex items-center justify-between gap-2 mb-5">
        ${renderPageScene('expenses', { lang, title: `${icon('receipt', 'w-5 h-5')} ${isEdit ? th('แก้ไขค่าใช้จ่าย','Edit expense') : t('addExpense')}`,
          subtitle: th('กรอกยอด ผู้จ่าย และคนที่ร่วมหาร','Enter the amount, who paid and who shares it') })}
        <button id="exp-back" class="btn btn-ghost btn-sm">${icon('arrow-left', 'w-4 h-4')} ${th('กลับ','Back')}</button>
      </div>
      ${isEdit ? `<div class="card p-3 mb-3 flex items-center gap-2 text-[11px] no-export" style="background:var(--bg-secondary);">
        ${icon('history', 'w-3.5 h-3.5')}
        <span>${escapeHtml(lastEditorText(e, lang) || th('ยังไม่มีข้อมูลผู้แก้ไข','No editor information yet'))}</span>
        ${(commentMapAll().get(editId) || []).length ? commentChip((commentMapAll().get(editId) || []).length) : ''}
        <button type="button" id="ex-comments-btn" class="link-btn text-[11px] ml-auto">${icon('message-square', 'w-3.5 h-3.5')} ${th('ความเห็น','Comments')}</button>
      </div>` : ''}
      <form id="expense-form" class="card card-accent p-6">
        <!-- 1) รายละเอียดรายการ -->
        <section class="form-section">
          <div class="form-section-head">
            <span class="form-section-icon">${icon('receipt-text', 'w-4 h-4')}</span>
            <h3>${th('รายละเอียดรายการ', 'Item details')}</h3>
          </div>
          <div class="space-y-3">
            <div class="input-group"><label class="input-label">${icon('sparkles', 'w-3.5 h-3.5')} ${th('ชื่อรายการ','Title')} *</label><input id="ex-title" class="input" required autocomplete="off" placeholder="${th('เช่น ราเมงมื้อเย็น','e.g. Dinner ramen')}" value="${escapeHtml(e.title || '')}"></div>

            <div class="grid grid-cols-2 gap-3">
              <div class="input-group"><label class="input-label">${icon('calendar', 'w-3.5 h-3.5')} ${th('วันที่','Date')} *</label><input id="ex-date" class="input" type="date" value="${escapeHtml(e.date || dayjs().format('YYYY-MM-DD'))}" required></div>
              <div class="input-group">
                <label class="input-label flex items-center justify-between">${icon('tag', 'w-3.5 h-3.5')} ${th('กลุ่มค่าใช้จ่าย','Expense group')}
                  <button type="button" id="ex-manage-cats" class="link-btn text-[10px]">${icon('settings-2', 'w-3 h-3')} ${th('จัดการ','Manage')}</button>
                </label>
                <select id="ex-cat" class="input">
                  ${getAllExpenseCategories().map(c => `<option value="${c.id}" ${normalizeCategory(e.category || 'general') === c.id ? 'selected' : ''}>${lang==='th'?(c.th||c.en):(c.en||c.th)}</option>`).join('')}
                </select>
              </div>
            </div>

            <div class="grid grid-cols-2 gap-3">
              <div class="input-group"><label class="input-label">${icon('list-checks', 'w-3.5 h-3.5')} ${th('ประเภท','Type')}</label>
                <select id="ex-type" class="input">
                  <option value="actual" ${!e.isEstimated ? 'selected' : ''}>${th('จ่ายจริง','Actual')}</option>
                  <option value="estimated" ${e.isEstimated ? 'selected' : ''}>${th('ประมาณการ','Estimated')}</option>
                </select>
              </div>
            </div>
          </div>
        </section>

        <!-- 2) จำนวนเงิน -->
        <section class="form-section">
          <div class="form-section-head">
            <span class="form-section-icon">${icon('banknote', 'w-4 h-4')}</span>
            <h3>${th('จำนวนเงิน', 'Amount')}</h3>
          </div>
          <div class="space-y-3">
            <div class="grid grid-cols-3 gap-3">
              <div class="input-group col-span-2"><label class="input-label">${icon('banknote', 'w-3.5 h-3.5')} ${th('ยอดก่อนส่วนลด / VAT / Service Charge','Subtotal before adjustments')} *</label><input id="ex-subtotal" class="input money-input" type="text" inputmode="decimal" required placeholder="0.00" value="${amount(e.subtotalMinor)}"></div>
              <div class="input-group"><label class="input-label">${icon('coins', 'w-3.5 h-3.5')} ${th('สกุลเงิน','Currency')}</label>
                <select id="ex-currency" class="input">${['THB','JPY','USD','EUR','KRW','TWD','SGD','GBP','CNY','HKD','AUD','VND'].map(c => `<option value="${c}" ${currency === c ? 'selected' : ''}>${c}</option>`).join('')}</select>
              </div>
            </div>

            <div class="grid grid-cols-3 gap-3">
              <div class="input-group"><label class="input-label">${icon('ticket', 'w-3.5 h-3.5')} ${th('ส่วนลด','Discount')}</label><input id="ex-discount" class="input money-input" type="text" inputmode="decimal" value="${amount(e.discountMinor) || 0}"></div>
              <div class="input-group"><label class="input-label">${icon('concierge-bell', 'w-3.5 h-3.5')} Service Charge</label><input id="ex-service" class="input money-input" type="text" inputmode="decimal" value="${amount(e.serviceMinor) || 0}"></div>
              <div class="input-group"><label class="input-label">${icon('receipt-text', 'w-3.5 h-3.5')} VAT / Tax</label><input id="ex-tax" class="input money-input" type="text" inputmode="decimal" value="${amount(e.taxMinor) || 0}"></div>
            </div>

              <div class="input-group"><label class="input-label">${icon('arrow-left-right', 'w-3.5 h-3.5')} ${th('เรทเป็น THB','Rate to THB')}</label><input id="ex-thb-rate" class="input" type="number" step="0.0001" min="0" value="${e.thbRate || resolveTripThbRate(trip, expenseRates, currency) || ''}"></div>

            <div id="net-preview" class="p-4 rounded-xl text-sm font-bold border flex items-center gap-2" style="border-color: var(--border); background: var(--bg-secondary);">${icon('calculator', 'w-4 h-4')} ${t('netTotal')}: --</div>
            <div id="thb-preview" class="p-3 rounded-xl border text-sm flex items-center gap-2" style="border-color: color-mix(in srgb, var(--success) 35%, transparent); background: var(--success-bg); color: var(--success);">${icon('banknote', 'w-4 h-4')} THB: --</div>
          </div>
        </section>

        <!-- 3) คนจ่ายและการแบ่ง -->
        <section class="form-section">
          <div class="form-section-head">
            <span class="form-section-icon">${icon('users', 'w-4 h-4')}</span>
            <h3>${th('คนจ่ายและการแบ่งจ่าย', 'Payer & split')}</h3>
          </div>
          <div class="space-y-4">
            <div class="input-group">
              <label class="input-label">${icon('user', 'w-3.5 h-3.5')} ${th('คนจ่าย (เลือกได้หลายคน)','Paid by (select one or more)')} *</label>
              <div id="payer-tiles" class="tile-grid">
                ${members.map(m => `
                  <button type="button" class="tile ${initialPayers.has(m.id) ? 'tile-selected' : ''}" data-payer="${m.id}" title="${escapeHtml(m.displayName)}">
                    <span class="flex items-center gap-2 min-w-0">
                      <span class="avatar w-8 h-8 text-xs" style="background:${m.color || 'var(--primary)'};width:32px;height:32px;">${m.photoURL ? `<img src="${escapeHtml(m.photoURL)}" class="w-full h-full rounded-full object-cover" alt="">` : escapeHtml(getInitials(m.displayName))}</span>
                      <span class="text-sm font-medium truncate">${escapeHtml(m.displayName)}</span>
                    </span>
                  </button>`).join('') || `<p class="text-sm text-[var(--text-secondary)]">${th('ยังไม่พบสมาชิกในทริปนี้','No members found in this trip')}</p>`}
              </div>
            </div>

        <div class="grid grid-cols-2 gap-3">
          <div class="input-group"><label class="input-label">${icon('credit-card', 'w-3.5 h-3.5')} ${th('วิธีจ่าย','Payment method')}</label>
            <select id="ex-payment" class="input">
              <option value="cash" ${(e.paymentMethod || 'cash') === 'cash' ? 'selected' : ''}>${th('เงินสด','Cash')}</option>
              <option value="card" ${e.paymentMethod === 'card' ? 'selected' : ''}>${th('บัตรเครดิต','Card')}</option>
              <option value="transfer" ${e.paymentMethod === 'transfer' ? 'selected' : ''}>${th('โอนเงิน','Transfer')}</option>
            </select>
          </div>
          <div class="input-group" id="ex-card-group">
            <label class="input-label flex items-center justify-between">${icon('credit-card', 'w-3.5 h-3.5')} ${th('บัตรเครดิต','Credit card')}
              <button type="button" id="ex-manage-cards" class="link-btn text-[10px]">${icon('settings-2', 'w-3 h-3')} ${th('จัดการบัตร','Manage cards')}</button>
            </label>
            <!-- Managed dropdown only — the trip's card list prevents random card names -->
            <select id="ex-card" class="input"></select>
            <p class="input-hint">${th('เลือกได้เฉพาะบัตรที่ลงทะเบียนไว้ของทริป — เพิ่ม/แก้ไข/ลบที่ “จัดการบัตร”','Only registered trip cards can be picked — add/edit/delete via “Manage cards”')}</p>
          </div>
        </div>

            <div id="payer-amounts"></div>
            <div class="input-group">
              <div class="flex items-center justify-between">
                <label class="input-label">${icon('split', 'w-3.5 h-3.5')} ${th('ใครหารด้วย','Who shares')}</label>
                <button type="button" id="share-all" class="btn btn-ghost btn-sm text-[10px]" style="min-height:26px;padding:2px 8px;">${th('เลือกทั้งหมด','Select all')}</button>
              </div>
              <div id="share-tiles" class="tile-grid">
                ${members.map(m => `
                  <button type="button" class="tile ${(e.allocations ? (e.allocations.some(a => a.memberId === m.id)) : true) ? 'tile-selected' : ''}" data-share="${m.id}" title="${escapeHtml(m.displayName)}">
                    <span class="flex items-center gap-2 min-w-0">
                      <span class="avatar w-8 h-8 text-xs" style="background:${m.color || 'var(--primary)'};width:32px;height:32px;">${m.photoURL ? `<img src="${escapeHtml(m.photoURL)}" class="w-full h-full rounded-full object-cover" alt="">` : escapeHtml(getInitials(m.displayName))}</span>
                      <span class="text-sm font-medium truncate">${escapeHtml(m.displayName)}</span>
                    </span>
                  </button>`).join('')}
              </div>
            </div>

            <div class="input-group">
              <label class="input-label">${icon('sliders-horizontal', 'w-3.5 h-3.5')} ${t('splitMethod')}</label>
              <div class="segmented">
                <button type="button" data-split="equal" class="segmented-item active">${icon('scale', 'w-4 h-4')} ${t('equal')}</button>
                <button type="button" data-split="unequal" class="segmented-item">${icon('sliders-horizontal', 'w-4 h-4')} ${t('unequal')}</button>
              </div>
            </div>
            <div id="split-area" class="space-y-3"></div>
          </div>
        </section>

        <!-- 4) ข้อมูลเพิ่มเติม -->
        <section class="form-section">
          <div class="form-section-head">
            <span class="form-section-icon">${icon('info', 'w-4 h-4')}</span>
            <h3>${th('หลักฐานและข้อมูลเพิ่มเติม (ไม่บังคับ)', 'Receipt & extra details (optional)')}</h3>
          </div>
          <div class="space-y-3">
        <div class="input-group">
          <label class="input-label">${icon('map-pinned', 'w-3.5 h-3.5')} ${th('ผูกกับแผนการเดินทาง','Linked itinerary place')}</label>
          <select id="ex-itinerary" class="input">
            <option value="">${th('— ไม่ผูก —','— none —')}</option>
            ${items.map(it => `<option value="${it.id}" ${e.itineraryItemId === it.id ? 'selected' : ''}>${escapeHtml(it.date || '')} • ${escapeHtml(it.title)}</option>`).join('')}
          </select>
        </div>


        <div class="input-group">
          <label class="input-label">${icon('image-plus', 'w-3.5 h-3.5')} ${th('รูปใบเสร็จ (ไม่บังคับ)','Receipt photo (optional)')}</label>
          <div class="receipt-upload">
            <div id="ex-receipt-preview" class="receipt-upload-preview ${e.receiptImage ? '' : 'hidden'}">
              ${e.receiptImage ? `<img src="${escapeHtml(e.receiptImage)}" alt="receipt">` : ''}
            </div>
            <div class="btn-row">
              <label class="btn btn-secondary btn-sm" for="ex-receipt-file">${icon('upload', 'w-4 h-4')} ${th('เลือกรูป','Choose photo')}</label>
              <input id="ex-receipt-file" type="file" accept="image/*" class="hidden">
              <button type="button" id="ex-receipt-clear" class="btn btn-ghost btn-sm ${e.receiptImage ? '' : 'hidden'}">${icon('trash-2', 'w-4 h-4')} ${th('ลบรูป','Remove')}</button>
            </div>
          </div>
        </div>

        <div class="input-group"><label class="input-label">${icon('link', 'w-3.5 h-3.5')} ${th('ลิงก์ใบเสร็จ','Receipt URL')}</label><input id="ex-receipt" class="input" placeholder="https://..." value="${escapeHtml(e.receiptUrl || '')}"></div>

        <div class="input-group"><label class="input-label">${icon('align-left', 'w-3.5 h-3.5')} ${th('รายละเอียด','Description')}</label><textarea id="ex-desc" class="input" style="min-height:70px;">${escapeHtml(e.description || '')}</textarea></div>
          </div>
        </section>

        <div class="flex gap-3 form-submit-row">
          ${isEdit ? `<button type="button" id="ex-delete" class="btn" style="background:var(--danger-bg);color:var(--danger);border:1.5px solid color-mix(in srgb, var(--danger) 35%, transparent);">${icon('trash-2', 'w-4 h-4')}</button>` : ''}
          <button type="button" id="cancel-expense" class="btn btn-secondary flex-1">${t('cancel')}</button>
          <button type="submit" id="submit-expense" class="btn btn-primary flex-1">${icon('save', 'w-4 h-4')} ${t('save')}</button>
        </div>
      </form>
    </div>
  `;
  queueIcons();

  // Manage the trip's expense groups straight from the form.
  bind('ex-comments-btn', 'click', () => openCommentSheet({
    tripId,
    expenseId: editId,
    title: e.title || '',
    comments: tripComments,
    onChanged: () => { /* badge refreshes on the next open */ }
  }));

  bind('ex-manage-cats', 'click', () => openCategoryManager(tripId, {
    onSaved: () => {
      const sel = document.getElementById('ex-cat');
      const keep = sel?.value;
      if (sel) {
        sel.innerHTML = getAllExpenseCategories()
          .map(c => `<option value="${c.id}" ${keep === c.id ? 'selected' : ''}>${lang === 'th' ? (c.th || c.en) : (c.en || c.th)}</option>`)
          .join('');
      }
    }
  }));

  /* ---- payment method → managed card dropdown ---- */
  const paymentSel = document.getElementById('ex-payment');
  const cardGroup = document.getElementById('ex-card-group');
  const cardInput = document.getElementById('ex-card');

  /** Fill the dropdown from the trip's managed card list (no free text). */
  function fillCardOptions(keep = '') {
    if (!cardInput) return;
    const cards = tripCards(currentTrip);
    const selected = keep || e.cardName || '';
    const known = cards.some(c => c.name === selected);
    cardInput.innerHTML = `
      <option value="">${cards.length ? th('— เลือกบัตร —', '— pick a card —') : th('— ยังไม่มีบัตรในทริป —', '— no trip cards yet —')}</option>
      ${cards.map(c => `<option value="${escapeHtml(c.name)}" ${c.name === selected ? 'selected' : ''}>${escapeHtml(tripCardLabel(c))}${c.holderId ? ` (${escapeHtml(members.find(m => m.id === c.holderId)?.displayName || '')})` : ''}</option>`).join('')}
      ${selected && !known ? `<option value="${escapeHtml(selected)}" selected>${escapeHtml(selected)} ${th('(ของเดิม)', '(legacy)')}</option>` : ''}
      <option value="__manage">${th('➕ เพิ่ม / จัดการบัตร…', '➕ Add / manage cards…')}</option>`;
  }
  fillCardOptions();

  function openCardsFromForm() {
    openCardManager(tripId, {
      members,
      onSaved: (cards) => fillCardOptions(cardInput?.value === '__manage' ? (cards[cards.length - 1]?.name || '') : cardInput?.value)
    });
  }
  cardInput?.addEventListener('change', () => {
    if (cardInput.value === '__manage') {
      cardInput.value = '';
      openCardsFromForm();
    }
  });
  bind('ex-manage-cards', 'click', openCardsFromForm);

  const syncCardField = () => {
    const isCard = paymentSel?.value === 'card';
    cardGroup?.classList.toggle('hidden', !isCard);
    if (!isCard && cardInput) cardInput.value = '';
  };
  paymentSel?.addEventListener('change', syncCardField);
  syncCardField();

  /* ---- receipt photo (optional): preview now, upload on save ---- */
  let pendingReceiptFile = null;
  let receiptCleared = false;
  const receiptFileInput = document.getElementById('ex-receipt-file');
  const receiptPreview = document.getElementById('ex-receipt-preview');
  const receiptClearBtn = document.getElementById('ex-receipt-clear');

  const setReceiptPreview = (src) => {
    if (!receiptPreview) return;
    receiptPreview.innerHTML = src ? `<img src="${src}" alt="receipt">` : '';
    receiptPreview.classList.toggle('hidden', !src);
    receiptClearBtn?.classList.toggle('hidden', !src);
  };

  receiptFileInput?.addEventListener('change', async () => {
    const file = receiptFileInput.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error(th('เลือกไฟล์รูปภาพเท่านั้น','Pick an image file')); return; }
    if (file.size > 12 * 1024 * 1024) { toast.error(th('รูปใหญ่เกินไป (สูงสุด 12MB)','Image too large (max 12MB)')); return; }
    pendingReceiptFile = file;
    receiptCleared = false;
    try {
      const reader = new FileReader();
      reader.onload = () => setReceiptPreview(String(reader.result));
      reader.readAsDataURL(file);
    } catch { setReceiptPreview(''); }
    toast.success(th('แนบรูปแล้ว — จะอัปโหลดตอนบันทึก','Attached — it uploads when you save'));
  });

  bind('ex-receipt-clear', 'click', () => {
    pendingReceiptFile = null;
    receiptCleared = true;
    if (receiptFileInput) receiptFileInput.value = '';
    setReceiptPreview('');
  });

  const selectedPayers = new Set(initialPayers);
  const payerAmounts = Object.fromEntries(initialPayments.map(p => [p.memberId, formatAmount(fromMinor(p.amountMinor, decimals), decimals)]));
  let selectedShare = new Set(members.filter(m => {
    if (!e.allocations) return true;
    return e.allocations.some(a => a.memberId === m.id);
  }).map(m => m.id));
  let splitMethod = e.splitMethod || (e.allocations?.length ? 'unequal' : 'equal');
  let customAllocations = e.splitInputs || Object.fromEntries((e.allocations || []).map(a => [a.memberId, formatAmount(fromMinor(a.amountMinor, decimals), decimals)]));
  let lockedAllocations = new Set(Object.keys(customAllocations));   // IDs whose custom amount was manually set
  let splitIncludesVatSc = e.splitIncludesVatSc !== false;        // true = custom amounts include VAT/SC, false = exclude

  document.querySelectorAll('#payer-tiles [data-payer]').forEach(btn => btn.addEventListener('click', () => {
    const id = btn.dataset.payer;
    if (selectedPayers.has(id)) { selectedPayers.delete(id); delete payerAmounts[id]; }
    else { selectedPayers.add(id); payerAmounts[id] = ''; }
    btn.classList.toggle('tile-selected', selectedPayers.has(id));
    renderPayers();
  }));

  document.querySelectorAll('#share-tiles [data-share]').forEach(btn => btn.addEventListener('click', () => {
    const id = btn.dataset.share;
    if (selectedShare.has(id)) { selectedShare.delete(id); btn.classList.remove('tile-selected'); }
    else { selectedShare.add(id); btn.classList.add('tile-selected'); }
    renderSplitArea();
  }));

  bind('share-all', 'click', () => {
    const isAll = selectedShare.size === members.length;
    selectedShare = new Set(isAll ? [] : members.map(m => m.id));
    document.querySelectorAll('#share-tiles .tile').forEach(t => t.classList.toggle('tile-selected', !isAll));
    renderSplitArea();
  });

  const netPreview = document.getElementById('net-preview');
  const thbPreview = document.getElementById('thb-preview');

  bindMoneyInputs(document.getElementById('expense-form'));
  document.querySelectorAll('[data-split]').forEach(b => b.classList.toggle('active', b.dataset.split === splitMethod));

  function readValues() {
    const cur = document.getElementById('ex-currency').value;
    const dec = getCurrencyDecimals(cur);
    const read = id => fromMinor(toMinor(parseCurrencyInput(document.getElementById(id).value), dec), dec);
    const sub = read('ex-subtotal'), disc = read('ex-discount'), serv = read('ex-service'), tax = read('ex-tax');
    const rate = cur === 'THB' ? 1 : parseFloat(document.getElementById('ex-thb-rate').value) || 0;
    const net = Math.max(0, sub - disc + serv + tax);
    return { sub, disc, serv, tax, rate, cur, net, netMinor: toMinor(net, getCurrencyDecimals(cur)) };
  }

  function updateNet() {
    const v = readValues();
    document.getElementById('ex-thb-rate').disabled = v.cur === 'THB';
    if (v.cur === 'THB') document.getElementById('ex-thb-rate').value = '1';
    if (netPreview) netPreview.innerHTML = `${icon('calculator', 'w-4 h-4')} ${t('netTotal')}: ${moneyHtml(v.netMinor, v.cur, v.rate)}`;
    if (thbPreview) thbPreview.innerHTML = v.rate > 0 ? `${th('เรท','Rate')}: 1 ${v.cur} = ${formatAmount(v.rate, 4)} THB` : th('กรุณาระบุเรทแลกเป็นเงินบาทก่อนบันทึก','Enter the THB exchange rate before saving');
    renderPayers();
    queueIcons();
    renderSplitArea();
  }

  bind('ex-currency', 'change', () => {
    const cur = document.getElementById('ex-currency').value;
    document.getElementById('ex-thb-rate').value = cur === e.currency && e.thbRate ? e.thbRate : resolveTripThbRate(trip, expenseRates, cur) || '';
    updateNet();
  });

  ['ex-subtotal','ex-discount','ex-service','ex-tax','ex-currency','ex-thb-rate'].forEach(id => {
    const node = document.getElementById(id);
    if (node) node.addEventListener('input', updateNet);
  });

  function renderSplitArea() {
    const area = document.getElementById('split-area');
    if (!area) return;
    const v = readValues();
    const ids = members.filter(m => selectedShare.has(m.id));
    const dec = getCurrencyDecimals(v.cur);
    if (!members.length) { area.innerHTML = ''; return; }
    if (!ids.length) {
      area.innerHTML = `<p class="text-xs" style="color:var(--danger);">${th('เลือกอย่างน้อย 1 คนที่ร่วมหาร','Pick at least one person to share')}</p>`;
      return;
    }
    if (splitMethod === 'equal') {
      const equal = splitEqual(v.netMinor, ids.map(m => m.id));
      area.innerHTML = ids.map(m => `
        <div class="flex justify-between items-center text-sm p-2.5 rounded-xl gap-2" style="background: var(--bg-secondary);">
          <span class="flex items-center gap-2 min-w-0">
            <span class="avatar w-7 h-7 text-[10px]" style="background:${m.color || 'var(--primary)'};width:28px;height:28px;border-width:1.5px;">${escapeHtml(getInitials(m.displayName))}</span>
            <span class="truncate">${escapeHtml(m.displayName)}</span>
          </span>
          <span class="font-bold flex-shrink-0">${moneyHtml(equal.find(a => a.memberId === m.id).amountMinor, v.cur, v.rate)}</span>
        </div>`).join('');
    } else {
      // ---- Custom split ----
      // Show VAT/SC inclusion toggle + auto-distribute inputs
      const vatScToggle = `
        <div class="split-vat-toggle">
          <span class="text-[11px] font-bold flex-shrink-0">${icon('calculator', 'w-3.5 h-3.5')} ${th('ยอดที่กรอก','Amounts')}:</span>
          <div class="segmented" style="flex:1;min-height:28px;">
            <button type="button" data-vatsc="include" class="segmented-item ${splitIncludesVatSc ? 'active' : ''}" style="font-size:11px;padding:4px 8px;">${th('ยอดสุทธิ (รวมทุกอย่างแล้ว)','Final amounts')}</button>
            <button type="button" data-vatsc="exclude" class="segmented-item ${!splitIncludesVatSc ? 'active' : ''}" style="font-size:11px;padding:4px 8px;">${th('ยอดก่อนส่วนลด / VAT / SC','Before adjustments')}</button>
          </div>
        </div>`;

      // Row structure is built ONCE per structural change; while typing we only
      // patch computed values in place (see refreshSplitComputed below).
      const rows = ids.map(m => {
        const isLocked = lockedAllocations.has(m.id);
        const entered = customAllocations[m.id];
        const displayValue = entered !== undefined ? entered : '';
        return `
          <div class="split-row" data-member="${m.id}">
            <div class="split-name">
              <span class="avatar w-7 h-7 text-[10px]" style="background:${m.color || 'var(--primary)'};width:28px;height:28px;border-width:1.5px;flex-shrink:0;">${m.photoURL ? `<img src="${escapeHtml(m.photoURL)}" class="w-full h-full rounded-full object-cover" alt="">` : escapeHtml(getInitials(m.displayName))}</span>
              <span class="truncate text-xs font-medium" title="${escapeHtml(m.displayName)}">${escapeHtml(m.displayName)}</span>
            </div>
            <input data-alloc="${m.id}" aria-label="${escapeHtml(m.displayName)} ${th('ยอดที่กรอก','Entered amount')}" class="input split-input money-input" type="text" inputmode="decimal" step="0.01" min="0" placeholder="0.00" value="${escapeHtml(displayValue)}" style="min-height:36px;padding:6px 10px;font-size:13px;">
            <button type="button" class="split-lock-btn ${isLocked ? 'is-locked' : ''}" data-lock="${m.id}" title="${isLocked ? th('ปลดล็อก — จะถูกระบบกระจายยอดอัตโนมัติ','Unlock — will be auto-distributed') : th('ล็อกยอดนี้ไว้ ไม่ให้ระบบแก้','Lock this amount')}">${icon(isLocked ? 'lock' : 'unlock', 'w-3 h-3')}</button>
            <span class="split-final ${isLocked ? '' : 'split-computed'}" data-alloc-final title="${isLocked ? '' : th('กระจายอัตโนมัติ','Auto-distributed')}">—</span>
          </div>`;
      }).join('');

      // Summary line (its text is patched in place while typing)
      const summaryHint = `
        <div class="split-auto-hint">
          ${icon('info', 'w-3.5 h-3.5')}
          <span data-split-hint></span>
        </div>`;

      area.innerHTML = vatScToggle + `<div class="split-columns"><span>${th('สมาชิก','Member')}</span><span>${th('ยอดที่กรอก','Input')}</span><span></span><span>${th('ยอดสุทธิ','Final share')}</span></div>` + rows + summaryHint + '<div data-split-warning role="alert" aria-live="polite"></div><div data-adjustment-summary class="split-adjustments"></div>';
      bindMoneyInputs(area);

      // Bind VAT/SC toggle — rows stay, only the computed values change
      area.querySelectorAll('[data-vatsc]').forEach(btn => btn.addEventListener('click', () => {
        splitIncludesVatSc = btn.dataset.vatsc === 'include';
        area.querySelectorAll('[data-vatsc]').forEach(b => b.classList.toggle('active', b.dataset.vatsc === (splitIncludesVatSc ? 'include' : 'exclude')));
        refreshSplitComputed();
      }));

      // Bind input changes — auto-distribute remaining.
      // IMPORTANT: do NOT re-render the area here. Rebuilding the HTML on every
      // keystroke destroyed the focused <input> (lost focus + mobile keyboard
      // closed, forcing a re-tap for every single digit).
      area.querySelectorAll('[data-alloc]').forEach(inp => inp.addEventListener('input', () => {
        const id = inp.dataset.alloc;
        const val = inp.value;
        if (val === '' || val === undefined) {
          delete customAllocations[id];
          lockedAllocations.delete(id);
        } else {
          customAllocations[id] = val;
          lockedAllocations.add(id);  // typing fixes this person's share
        }
        refreshSplitComputed();
      }));

      // Bind lock buttons
      area.querySelectorAll('[data-lock]').forEach(btn => btn.addEventListener('click', () => {
        const id = btn.dataset.lock;
        const input = area.querySelector(`[data-alloc="${id}"]`);
        if (lockedAllocations.has(id)) {
          lockedAllocations.delete(id);
          delete customAllocations[id];  // unlock clears the value too
          if (input) input.value = '';
        } else {
          if (input && input.value !== '') customAllocations[id] = input.value;
          lockedAllocations.add(id);
        }
        refreshSplitComputed();
      }));

      refreshSplitComputed();
    }
    queueIcons();
  }

  /**
   * Light-weight update for the custom split: patches the computed per-person
   * values, lock buttons and the summary hint in place. It never touches the
   * <input> elements, so the field being typed keeps focus and the mobile
   * keyboard stays open — no "tap again per digit" problem.
   */
  function refreshSplitComputed() {
    const area = document.getElementById('split-area');
    if (!area || splitMethod !== 'unequal' || !area.querySelector('[data-alloc]')) return;
    const v = readValues();
    const ids = members.filter(m => selectedShare.has(m.id));
    const dec = getCurrencyDecimals(v.cur);
    if (!ids.length) return;
    const computed = computeCustomAllocations(v, ids, dec);
    let enteredSum = 0;
    let unfilledCount = 0;
    ids.forEach(m => {
      const entered = customAllocations[m.id];
      const isEntered = entered !== undefined && entered !== '';
      if (isEntered) enteredSum += (parseCurrencyInput(entered) || 0);
      else if (!lockedAllocations.has(m.id)) unfilledCount++;
      const row = area.querySelector(`.split-row[data-member="${m.id}"]`);
      if (!row) return;
      const finalEl = row.querySelector('[data-alloc-final]');
      if (finalEl) {
        const val = computed[m.id] ?? 0;
        finalEl.innerHTML = moneyHtml(toMinor(val, dec), v.cur, v.rate);
        finalEl.classList.toggle('split-computed', !isEntered);
        finalEl.title = isEntered ? '' : th('กระจายอัตโนมัติ', 'Auto-distributed');
      }
      const lockBtn = row.querySelector('[data-lock]');
      if (lockBtn) {
        const isLocked = lockedAllocations.has(m.id);
        lockBtn.classList.toggle('is-locked', isLocked);
        lockBtn.title = isLocked ? th('ปลดล็อก — จะถูกระบบกระจายยอดอัตโนมัติ', 'Unlock — will be auto-distributed') : th('ล็อกยอดนี้ไว้ ไม่ให้ระบบแก้', 'Lock this amount');
        const want = isLocked ? 'lock' : 'unlock';
        const cur = lockBtn.querySelector('[data-lucide]');
        if (!cur || cur.getAttribute('data-lucide') !== want) {
          lockBtn.innerHTML = icon(want, 'w-3 h-3');
          queueIcons();
        }
      }
    });
    const result = customResult(v, ids);
    const fmt = n => formatCurrency(n, v.cur);
    const hintText = area.querySelector('[data-split-hint]');
    if (hintText) hintText.textContent = `${th('กรอกแล้ว','Entered')} ${fmt(result.enteredMinor)} • ${th('เป้าหมาย','Target')} ${fmt(splitIncludesVatSc ? v.netMinor : toMinor(v.sub, dec))}` + (result.unfilledCount ? ` • ${th('กระจายยอดที่เหลือให้','Remainder shared by')} ${result.unfilledCount} ${th('คน','people')}` : '');
    const warning = area.querySelector('[data-split-warning]');
    warning.className = result.valid ? '' : 'split-warning';
    warning.textContent = result.valid ? '' : `${th('ยอดแบ่งไม่ตรง กรุณาตรวจสอบก่อนบันทึก','Split mismatch — check before saving')} • ${th('ส่วนต่าง','Difference')} ${fmt(Math.abs(result.differenceMinor))}`;
    const summary = area.querySelector('[data-adjustment-summary]');
    summary.innerHTML = splitIncludesVatSc ? '' : `<p>${th('กระจายตามสัดส่วนยอดก่อนปรับของแต่ละคน','Adjustments proportional to each person’s subtotal')}: ${th('ส่วนลด','Discount')} −${fmt(toMinor(v.disc, dec))} · Service Charge +${fmt(toMinor(v.serv, dec))} · VAT +${fmt(toMinor(v.tax, dec))}</p>` + result.rows.map(r => `<div><b>${escapeHtml(members.find(m => m.id === r.memberId)?.displayName || '')}</b><span>${fmt(r.subtotalMinor)} − ${fmt(r.discountMinor)} + ${fmt(r.serviceMinor)} + ${fmt(r.taxMinor)} = <b>${fmt(r.amountMinor)}</b></span></div>`).join('');
  }

  function customResult(v, ids) {
    const dec = getCurrencyDecimals(v.cur);
    return splitCustom({ subtotalMinor: toMinor(v.sub, dec), netTotalMinor: v.netMinor,
      discountMinor: toMinor(v.disc, dec), serviceMinor: toMinor(v.serv, dec), taxMinor: toMinor(v.tax, dec),
      includesAdjustments: splitIncludesVatSc,
      entries: ids.map(m => ({ memberId: m.id, amountMinor: customAllocations[m.id] == null || customAllocations[m.id] === '' ? null : toMinor(parseCurrencyInput(customAllocations[m.id]), dec) })) });
  }

  function computeCustomAllocations(v, ids, dec) {
    return Object.fromEntries(customResult(v, ids).rows.map(r => [r.memberId, fromMinor(r.amountMinor, dec)]));
  }

  function readPayments(v) {
    const ids = [...selectedPayers];
    if (ids.length === 1) return [{ memberId: ids[0], amountMinor: v.netMinor }];
    return ids.map(memberId => ({ memberId, amountMinor: toMinor(parseCurrencyInput(payerAmounts[memberId]), getCurrencyDecimals(v.cur)) }));
  }

  function refreshPayerTotal() {
    const v = readValues();
    const payments = readPayments(v);
    const diff = v.netMinor - payments.reduce((n, p) => n + p.amountMinor, 0);
    const hint = document.getElementById('payer-total-hint');
    if (!hint) return;
    hint.className = validatePayments(v.netMinor, payments) ? 'input-hint' : 'split-warning';
    hint.textContent = `${th('ยอดผู้จ่ายรวม','Total paid')} ${formatCurrency(v.netMinor - diff, v.cur)} / ${formatCurrency(v.netMinor, v.cur)}` + (diff ? ` • ${th('ยอดยังไม่ตรง ส่วนต่าง','Mismatch, difference')} ${formatCurrency(Math.abs(diff), v.cur)}` : ' ✓');
  }

  function renderPayers() {
    const area = document.getElementById('payer-amounts');
    if (!area) return;
    const v = readValues();
    area.innerHTML = `<p class="input-hint">${th('เลือกผู้จ่ายได้หลายคน แล้วระบุยอดที่แต่ละคนจ่ายจริงให้รวมเท่ายอดสุทธิ','Select payers and enter what each paid. Payments must match the net total.')}</p>` + (selectedPayers.size > 1 ? members.filter(m => selectedPayers.has(m.id)).map(m => `<label class="payer-amount-row"><span>${escapeHtml(m.displayName)}</span><input class="input money-input" type="text" inputmode="decimal" data-payment="${m.id}" value="${escapeHtml(payerAmounts[m.id] || '')}" placeholder="0.00"><span>${v.cur}</span></label>`).join('') : '') + '<div id="payer-total-hint" aria-live="polite"></div>';
    bindMoneyInputs(area);
    area.querySelectorAll('[data-payment]').forEach(inp => inp.addEventListener('input', () => { payerAmounts[inp.dataset.payment] = inp.value; refreshPayerTotal(); }));
    refreshPayerTotal();
  }

  document.querySelectorAll('[data-split]').forEach(btn => btn.addEventListener('click', () => {
    document.querySelectorAll('[data-split]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    splitMethod = btn.dataset.split;
    renderSplitArea();
  }));

  updateNet();

  bind('exp-back', 'click', () => { location.hash = `#/trip/${tripId}/expenses`; });
  bind('cancel-expense', 'click', () => { location.hash = `#/trip/${tripId}/expenses`; });

  bind('ex-delete', 'click', async () => {
    const ok = await confirmAction({
      title: th(`ลบ "${e.title}" ?`, `Delete "${e.title}"?`),
      message: th('ลบรายการค่าใช้จ่ายนี้ออกจากทริป', 'Remove this expense from the trip'),
      confirmText: t('delete'), danger: true, icon: 'trash-2'
    });
    if (!ok) return;
    const tLoad = toast.loading(th('กำลังลบ...', 'Deleting...'));
    try {
      await deleteExpense(tripId, editId, currentUser.uid);
      tLoad.close();
      toast.success(th('ลบแล้ว', 'Deleted'));
      location.hash = `#/trip/${tripId}/expenses`;
    } catch (err) { tLoad.close(); toast.error(err.message); }
  });

  document.getElementById('expense-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const submitBtn = document.getElementById('submit-expense');
    submitBtn.disabled = true;
    const tLoad = toast.loading(th('กำลังบันทึก...', 'Saving...'));
    try {
      const v = readValues();
      if (!v.netMinor) throw new Error(th('ยอดรวมต้องมากกว่า 0', 'Amount must be greater than 0'));
      const ids = members.filter(m => selectedShare.has(m.id)).map(m => m.id);
      if (!ids.length) throw new Error(th('เลือกอย่างน้อย 1 คนที่ร่วมหาร', 'Pick at least one person to share'));

      let allocations;
      if (splitMethod === 'equal') {
        allocations = splitEqual(v.netMinor, ids);
      } else {
        const result = customResult(v, members.filter(m => selectedShare.has(m.id)));
        if (!result.valid) throw new Error(th('ยอดแบ่งไม่ตรง กรุณาแก้ไขยอดที่กรอกก่อนบันทึก','Split amounts do not match. Correct the amounts before saving.'));
        allocations = result.rows.map(({ memberId, amountMinor }) => ({ memberId, amountMinor }));
      }
      const payments = readPayments(v);
      if (!validatePayments(v.netMinor, payments)) throw new Error(th('ยอดผู้จ่ายรวมต้องเท่ากับยอดสุทธิ และต้องเลือกผู้จ่ายอย่างน้อย 1 คน','Payments must match the net total. Select at least one payer.'));
      if (v.cur !== 'THB' && (!Number.isFinite(v.rate) || !(v.rate > 0))) throw new Error(th('กรุณาระบุเรทแลกเป็นเงินบาท','Enter the THB exchange rate'));
      if ([v.sub, v.disc, v.serv, v.tax].some(n => n < 0) || v.disc > v.sub) throw new Error(th('ยอดเงินต้องไม่ติดลบ และส่วนลดต้องไม่เกินยอดก่อนปรับ','Amounts must be non-negative and discount cannot exceed subtotal'));
      const payMethod = document.getElementById('ex-payment').value;
      const pickedCard = payMethod === 'card' ? (document.getElementById('ex-card')?.value || '').trim() : '';
      if (payMethod === 'card' && (!pickedCard || pickedCard === '__manage')) {
        throw new Error(th('เลือกบัตรเครดิตจากรายการ หรือเพิ่มบัตรใหม่จากปุ่ม “จัดการบัตร”','Pick a card from the list, or add one via “Manage cards”'));
      }

      const payload = {
        title: document.getElementById('ex-title').value.trim(),
        date: document.getElementById('ex-date').value,
        category: document.getElementById('ex-cat').value,
        description: document.getElementById('ex-desc').value.trim(),
        subtotalMinor: toMinor(v.sub, getCurrencyDecimals(v.cur)),
        discountMinor: toMinor(v.disc, getCurrencyDecimals(v.cur)),
        serviceMinor: toMinor(v.serv, getCurrencyDecimals(v.cur)),
        taxMinor: toMinor(v.tax, getCurrencyDecimals(v.cur)),
        netTotalMinor: v.netMinor,
        currency: v.cur,
        baseCurrency,
        thbRate: v.rate,
        thbMinor: toThbMinor(v.netMinor, v.cur, v.rate),
        isEstimated: document.getElementById('ex-type').value === 'estimated',
        payerId: payments[0].memberId,
        payments,
        splitMethod,
        splitIncludesVatSc,
        splitInputs: customAllocations,
        allocations,
        paymentMethod: payMethod,
        cardName: pickedCard,
        receiptUrl: document.getElementById('ex-receipt').value.trim(),
        itineraryItemId: document.getElementById('ex-itinerary').value || null,
        status: 'active',
        // Saving through this form always has a payer → clears any "TBD host".
        payerPending: false,
        source: e.source || 'manual'
      };
      if (!payload.title) throw new Error(th('กรุณากรอกชื่อรายการ', 'Title is required'));
      let savedId = editId;
      const me = actor();
      // Who wrote it, and what kind of change it was — the audit trail.
      payload.createdByName = me.displayName;
      payload.updatedByName = me.displayName;
      if (isEdit) {
        await updateExpense(tripId, editId, payload, currentUser.uid, me);
      } else {
        savedId = await addExpense(tripId, payload, currentUser.uid, me);
      }
      // Card name → remember locally so the next expense can pick it from a list.
      if (payload.cardName) rememberCard(tripId, payload.cardName);

      // The audit entry is written after the local bookkeeping above, so a slow
      // log write can never delay (or block) the user-visible result.
      await logActivity(tripId, {
        type: isEdit ? 'expense.update' : 'expense.create',
        targetId: savedId,
        title: payload.title,
        detail: `${formatCurrency(payload.netTotalMinor || 0, payload.currency || currency)} • ${payload.date || ''}`,
        user: me
      });

      // Receipt photo: uploaded after save (needs the expense id) and stored on
      // the document. Storage when available, inlined image otherwise.
      if (pendingReceiptFile && savedId) {
        toast.loading(th('กำลังอัปโหลดรูปใบเสร็จ…','Uploading receipt photo…'));
        const res = await uploadReceiptImage(tripId, savedId, pendingReceiptFile);
        if (res.url) {
          await updateExpense(tripId, savedId, { receiptImage: res.url, receiptStorage: res.storage }, currentUser.uid, me);
          if (res.storage === 'inline') toast.info(th('เก็บรูปไว้ในเอกสารของทริปนี้','Photo stored inside the trip document'));
        } else {
          toast.warning(th('อัปโหลดรูปไม่สำเร็จ — บันทึกค่าใช้จ่ายไว้แล้ว','Photo upload failed — the expense was still saved'));
        }
      } else if (isEdit && receiptCleared) {
        await updateExpense(tripId, savedId, { receiptImage: '', receiptStorage: 'none' }, currentUser.uid, me);
      }
      tLoad.close();
      toast.success(isEdit ? th('บันทึกการแก้ไขแล้ว', 'Saved') : th('บันทึกค่าใช้จ่ายแล้ว', 'Expense saved'));
      if (!isEdit) confetti({ y: 150 });
      // Only step back to the list if the form is still on screen: a save that
      // finishes late (log/photo upload) must not yank the user off another page.
      if (location.hash === editorHash) {
        location.hash = `#/trip/${tripId}/expenses`;
      }
    } catch (err) {
      tLoad.close();
      toast.error(err.message);
      submitBtn.disabled = false;
    }
  });
}

async function renderSettlement(params) {
  const tripId = params.tripId;
  const token = beginRender();
  await loadTrip(tripId);
  if (isStale(token)) return;
  const lang = getLang();
  const th = (a, b) => (lang === 'th' ? a : b);
  const trip = currentTrip;
  const currency = trip?.baseCurrency || 'THB';

  appEl.innerHTML = `
    <div class="page-enter">
      <div class="flex flex-wrap items-center justify-between gap-3 mb-5">
        ${renderPageScene('settlement', { lang, title: `${icon('hand-coins', 'w-5 h-5')} ${t('settlement')}`,
          subtitle: th('ใบเสร็จเคลียร์บิล: ใครจ่ายอะไร (เงินสด/บัตร) ใครต้องคืนเท่าไร','Clear-bill receipts: who paid what (cash/card), who owes how much') })}
        <div class="btn-row">
          <button id="recalc-settle" class="btn btn-primary btn-sm">${icon('refresh-cw', 'w-4 h-4')} ${lang==='th' ? 'คำนวณใหม่' : 'Recalculate'}</button>
          <button id="export-overview-png" class="btn btn-secondary btn-sm">${icon('image', 'w-4 h-4')} ${th('ภาพรวม PNG','Overview PNG')}</button>
          <button id="print-settle" class="btn btn-secondary btn-sm">${icon('printer', 'w-4 h-4')} ${th('พิมพ์ / PDF','Print / PDF')}</button>
        </div>
      </div>

      <div class="chip-row mb-4" id="settle-views">
        <button class="chip chip-active" data-view="overview">${icon('scale', 'w-3.5 h-3.5')} ${th('ภาพรวม','Overview')}</button>
        <button class="chip" data-view="receipts">${icon('receipt-text', 'w-3.5 h-3.5')} ${th('ใบเสร็จรายคน','Per-person receipts')}</button>
      </div>

      <div id="settlement-content" class="space-y-4"><div class="skeleton h-32"></div></div>
    </div>
  `;
  queueIcons();

  let state = { expenses: [], members: [], membersMap: {}, statements: [], balances: [], transactions: [] };
  let view = 'overview';   // ภาพรวมเป็นค่าเริ่มต้น (สลับเป็นใบเสร็จรายคนได้)
  let receiptFilter = 'all';  // 'all' = ใบเสร็จทุกคน, หรือ memberId ของคนที่เลือกดู
  let commentsAll = [];       // ความเห็น/ทักท้วงของทั้งทริป (ใช้ในใบเสร็จด้วย)
  let commentMap = new Map();

  const money = (minor) => formatCurrency(minor || 0, 'THB');
  // Same rate resolution as the rest of the app (trip → expense snapshots → saved).
  let thbRate = resolveTripThbRate(trip, [], currency);
  const thbOf = (minor) => {
    return currency === 'THB' || !thbRate ? '' : formatCurrency(convertCurrency(minor, 'THB', currency, 1 / thbRate), currency);
  };
  // v13 dual-currency look: baht headline, trip-currency chip beside it.
  const thbTag = (minor) => origTextChipHtml(thbOf(minor));
  const moneyPair = (minor) => thbPlusLabelHtml(minor || 0, thbOf(minor));
  const methodLabel = (m) => m === 'card' ? th('บัตรเครดิต', 'Card') : m === 'transfer' ? th('โอนเงิน', 'Transfer') : th('เงินสด', 'Cash');
  const methodIcon = (m) => m === 'card' ? 'credit-card' : m === 'transfer' ? 'arrow-left-right' : 'banknote';

  function memberHeader(m, { withAvatar = true } = {}) {
    const isMe = m.memberId === currentUser.uid;
    return `${withAvatar ? `<div class="avatar" style="width:34px;height:34px;background:${escapeHtml(m.color || 'var(--primary)')};font-size:12px;">${m.photoURL ? `<img src="${escapeHtml(m.photoURL)}" class="w-full h-full rounded-full object-cover" alt="">` : escapeHtml(getInitials(m.displayName))}</div>` : ''}
      <div class="min-w-0">
        <div class="font-bold text-sm truncate">${escapeHtml(m.displayName)} ${isMe ? `<span class="text-[10px] px-1.5 py-0.5 rounded-full text-white" style="background:var(--gradient-primary);">${th('คุณ','you')}</span>` : ''}</div>
        <div class="text-[10px] text-[var(--text-tertiary)]">${th('จ่ายจริง','paid')} ${m.paidCount} • ${th('ร่วมหาร','shares')} ${m.shareCount}</div>
      </div>`;
  }

  const commentsFor = (expenseId) => commentMap.get(expenseId) || [];
  /** How many items of this member's receipt carry a comment (flag). */
  function flaggedCount(m) {
    const ids = new Set();
    for (const i of m.items) if (commentsFor(i.expenseId).length) ids.add(i.expenseId);
    return ids.size;
  }
  /**
   * Dispute affordance (v13 redesign): ONE subtle icon button per row instead
   * of a text button under every item. It lights up with a count once the item
   * actually has comments, so "you can dispute this" stays discoverable without
   * cluttering the receipt.
   */
  function disputeButton(expenseId) {
    const list = commentsFor(expenseId);
    return `<button class="rcpt-dispute ${list.length ? 'has-comments' : ''} no-export" data-receipt-comment="${escapeHtml(expenseId)}" title="${th('ทักท้วง / แสดงความเห็นรายการนี้','Dispute / comment on this item')}" aria-label="${th('ทักท้วง','Dispute')}">
      ${icon('message-square', 'w-3.5 h-3.5')}${list.length ? `<span class="rcpt-dispute-count">${list.length}</span>` : ''}
    </button>`;
  }
  /** Existing comments of one item — rendered only when there are any. */
  function commentRows(expenseId) {
    return commentsFor(expenseId).map(c => `
      <div class="rcpt-comment">
        <span class="rcpt-comment-icon">${icon('message-square', 'w-3 h-3')}</span>
        <span><b>${escapeHtml(c.name || '')}</b> ${escapeHtml(c.text)}</span>
      </div>`).join('');
  }
  /** Switch between "everyone's receipts" and one member's receipt. */
  function receiptPickerHtml() {
    if (state.statements.length < 2) return '';
    const totalFlags = state.statements.reduce((n, m) => n + flaggedCount(m), 0);
    const chip = (id, label, count, avatar = '') => `
      <button class="receipt-picker-item ${receiptFilter === id ? 'active' : ''}" data-receipt-filter="${escapeHtml(id)}">
        ${avatar}${avatar ? '' : icon('users', 'w-3.5 h-3.5')}<span>${escapeHtml(label)}</span>
        ${count ? `<span class="count">💬 ${count}</span>` : ''}
      </button>`;
    return `
      <div class="receipt-picker no-export" id="receipt-picker">
        ${chip('all', th('ทุกคน','Everyone'), totalFlags)}
        ${state.statements.map(m => chip(m.memberId, m.displayName, flaggedCount(m),
          `<span class="avatar" style="background:${escapeHtml(m.color || 'var(--primary)')};">${m.photoURL ? `<img src="${escapeHtml(m.photoURL)}" class="w-full h-full rounded-full object-cover" alt="">` : escapeHtml(getInitials(m.displayName))}</span>`)).join('')}
      </div>`;
  }

  /** Paid rows grouped by credit card (so a receipt shows which card was used). */
  function cardTotals(items) {
    const rows = new Map();
    for (const i of items) {
      if (i.method !== 'card' || !i.cardName) continue;
      const key = String(i.cardName).trim();
      const row = rows.get(key) || { card: key, totalMinor: 0, count: 0 };
      row.totalMinor += i.amountMinor || 0;
      row.count += 1;
      rows.set(key, row);
    }
    return [...rows.values()].sort((a, b) => b.totalMinor - a.totalMinor);
  }

  /**
   * Per-person receipt (v13 redesign): the bottom line moves to the top as a
   * hero, item lists become calm compact rows (long lists fold behind "show
   * all"), and the dispute affordance is one subtle 💬 icon per row instead of
   * a text button under every item. Every detail of the old layout is kept.
   */
  function receiptHtml(m) {
    const isMe = m.memberId === currentUser.uid;
    const methods = ['cash', 'card', 'transfer'].filter(k => m.paidByMethod[k] > 0);
    const paidItems = m.items.filter(i => i.role === 'paid');
    const shareItems = m.items.filter(i => i.role === 'share');
    const settled = m.netMinor > 0 && shareItems.length === 0;
    const cards = cardTotals(paidItems);
    const chip = (k) => `<span class="rcpt-chip rcpt-chip--${k}">${icon(methodIcon(k), 'w-3 h-3')} ${methodLabel(k)}</span>`;
    const positive = m.netMinor >= 0;
    const COLLAPSE_AFTER = 5;

    /** One compact item row; rows past COLLAPSE_AFTER fold until "show all". */
    const itemRow = (i, idx, side) => {
      const extra = idx >= COLLAPSE_AFTER;
      const payerNames = (i.payerIds || [i.paidBy]).map(id => state.membersMap[id]?.displayName || id).filter(Boolean).join(', ');
      const sub = side === 'paid'
        ? `${escapeHtml(i.date || '')} • ${methodLabel(i.method)}${i.cardName ? ` • ${escapeHtml(i.cardName)}` : ''}`
        : `${escapeHtml(i.date || '')} • ${th('จ่ายโดย','paid by')} ${escapeHtml(payerNames || '—')} • ${methodLabel(i.method)}`;
      return `
      <div class="rcpt-row ${extra ? 'rcpt-extra' : ''}" ${extra ? 'hidden' : ''}>
        <div class="rcpt-row-main">
          <div class="rcpt-row-title">${escapeHtml(i.title)}
            ${i.estimated ? `<span class="rcpt-mini-badge rcpt-mini-badge--est">${icon('hourglass', 'w-2.5 h-2.5')} ${th('ประมาณการ','est.')}</span>` : ''}
            ${i.hasReceipt ? `<span class="rcpt-mini-badge">${icon('paperclip', 'w-2.5 h-2.5')} ${th('ใบเสร็จ','receipt')}</span>` : ''}
          </div>
          <div class="rcpt-row-sub">${sub}</div>
          ${commentRows(i.expenseId)}
        </div>
        <div class="rcpt-row-side">
          <span class="rcpt-row-amount">${moneyPair(i.amountMinor)}</span>
          ${disputeButton(i.expenseId)}
        </div>
      </div>`;
    };
    const showAllBtn = (count, section) => count > COLLAPSE_AFTER ? `
      <button class="rcpt-showall no-export" data-rcpt-more="${section}" type="button">
        <span data-more-label>${th(`ดูทั้งหมด ${count} รายการ`, `Show all ${count} items`)}</span>
        <span data-less-label class="hidden">${th('ย่อรายการ','Show less')}</span>
        ${icon('chevron-down', 'w-3.5 h-3.5')}
      </button>` : '';

    return `
      <div class="receipt" id="receipt-${escapeHtml(m.memberId)}" data-receipt="${escapeHtml(m.memberId)}">
        <div class="receipt-head">
          <div class="receipt-title">${escapeHtml(t('settlement'))}</div>
          <div class="receipt-sub">${escapeHtml(trip?.name || '')} • ${escapeHtml(trip?.startDate || '')} → ${escapeHtml(trip?.endDate || '')}</div>
        </div>

        <!-- The member's name AND the bottom line are the headline (screen + PNG) -->
        <div class="rcpt-member-bar">
          <div class="avatar" style="background:${escapeHtml(m.color || 'var(--primary)')};">
            ${m.photoURL ? `<img src="${escapeHtml(m.photoURL)}" class="w-full h-full rounded-full object-cover" alt="">` : escapeHtml(getInitials(m.displayName))}
          </div>
          <div class="min-w-0 flex-1">
            <div class="rcpt-member-label">${th('ใบเสร็จของ','Receipt for')}</div>
            <div class="receipt-member-name receipt-member-name--lg">${escapeHtml(m.displayName)}${isMe ? ` <span style="font-size:14px;font-weight:700;color:var(--text-secondary);">(${th('คุณ','you')})</span>` : ''}</div>
            <div class="rcpt-member-sub">${th('จ่ายจริง','paid')} ${m.paidCount} • ${th('ร่วมหาร','shares')} ${m.shareCount}${flaggedCount(m) ? ` • ${icon('message-square', 'w-3 h-3')} ${flaggedCount(m)} ${th('รายการที่ทักท้วง','flagged')}` : ''}</div>
          </div>
          <div class="rcpt-hero ${positive ? 'is-positive' : 'is-negative'}">
            <span class="rcpt-hero-face">${moodFaceHtml(balanceMood(m.netMinor), { size: 40, lang })}</span>
            <div class="min-w-0">
              <div class="rcpt-hero-label">${settled ? th('เคลียร์ครบแล้ว','Fully settled') : positive ? th('จะได้รับคืน','Gets back') : th('ต้องจ่ายคืน','Owes')}</div>
              <div class="rcpt-hero-amount">${positive ? '+' : '−'}${money(Math.abs(m.netMinor))}</div>
              ${thbOf(m.netMinor) ? `<div class="rcpt-hero-sub">≈ ${thbOf(Math.abs(m.netMinor))}</div>` : ''}
            </div>
          </div>
        </div>
        <p class="rcpt-hint no-export">${icon('message-square', 'w-3 h-3')} ${th('แตะไอคอน 💬 ข้างรายการใดก็ได้ เพื่อทักท้วงหรือสอบถาม','Tap the 💬 icon beside any item to dispute or ask about it')}</p>

        <!-- 1) รับ — money this member actually paid (green block) -->
        <section class="rcpt-block rcpt-block--recv" data-receipt-section="received">
          <div class="rcpt-block-head">
            <span class="rcpt-block-icon">${icon('arrow-down-circle', 'w-4 h-4')}</span>
            <span class="rcpt-block-title">${th('รับ — เงินที่จ่ายไป','Received — money this member paid')}</span>
            <span class="rcpt-block-total">${moneyPair(m.paidMinor)}</span>
          </div>
          <div class="rcpt-block-body">
            ${methods.length || cards.length ? `<div class="rcpt-chips-line">
              ${methods.map(k => `<span class="rcpt-method-chip">${chip(k)} <b>${money(m.paidByMethod[k])}</b></span>`).join('')}
              ${cards.map(c => `<span class="rcpt-method-chip rcpt-method-chip--card">${icon('credit-card', 'w-3 h-3')} <span class="truncate">${escapeHtml(c.card)}</span> <b>${money(c.totalMinor)}</b> <i>${c.count} ${th('รายการ','items')}</i></span>`).join('')}
            </div>` : ''}
            ${paidItems.length
              ? paidItems.map((i, idx) => itemRow(i, idx, 'paid')).join('') + showAllBtn(paidItems.length, 'recv')
              : `<p class="rcpt-empty">${th('ยังไม่ได้จ่ายรายการใด','No payments recorded')}</p>`}
            <div class="rcpt-block-total-line"><span>${th('รวมรับ (จ่ายจริง)','Total paid')}</span><b>${moneyPair(m.paidMinor)}</b></div>
          </div>
        </section>

        <!-- 2) หัก — this member's share of everything (rose block) -->
        <section class="rcpt-block rcpt-block--deduct" data-receipt-section="deduct">
          <div class="rcpt-block-head">
            <span class="rcpt-block-icon">${icon('arrow-up-circle', 'w-4 h-4')}</span>
            <span class="rcpt-block-title">${th('หัก — ส่วนที่ต้องรับผิดชอบ','Deductions — this member\'s share')}</span>
            <span class="rcpt-block-total">${moneyPair(m.owedMinor)}</span>
          </div>
          <div class="rcpt-block-body">
            ${shareItems.length
              ? shareItems.map((i, idx) => itemRow(i, idx, 'share')).join('') + showAllBtn(shareItems.length, 'deduct')
              : `<p class="rcpt-empty">${th('ไม่มีส่วนที่ต้องรับผิดชอบ','No shares')}</p>`}
            <div class="rcpt-block-total-line"><span>${th('รวมหัก (ส่วนที่ต้องรับผิดชอบ)','Total share')}</span><b>${moneyPair(m.owedMinor)}</b></div>
          </div>
        </section>

        <!-- 3) คงเหลือ — the answer, blue block -->
        <section class="rcpt-block rcpt-block--balance" data-receipt-section="balance">
          <div class="rcpt-block-head">
            <span class="rcpt-block-icon">${icon('scale', 'w-4 h-4')}</span>
            <span class="rcpt-block-title">${th('คงเหลือ — สรุปสุดท้าย','Balance — the bottom line')}</span>
          </div>
          <div class="rcpt-block-body">
            <div class="rcpt-sum">
              <div class="rcpt-sum-row"><span>${th('รับ','Received')}</span><b>${money(m.paidMinor)}</b></div>
              <div class="rcpt-sum-row"><span>${th('หัก','Deducted')}</span><b>− ${money(m.owedMinor)}</b></div>
              <div class="rcpt-sum-total ${positive ? 'is-positive' : 'is-negative'}">
                <span>${th('คงเหลือ','Balance')}</span>
                <b>${positive ? '+' : '−'}${money(Math.abs(m.netMinor))}</b>
              </div>
              <div class="rcpt-sum-note">${positive
                ? th('จะได้รับคืนจากเพื่อนในทริป','Gets this back from the group')
                : th('ต้องจ่ายคืนให้เพื่อนในทริป','Owes this to the group')}${currency !== 'THB' && thbOf(m.netMinor) ? ` • ${th('ประมาณในสกุลหลัก','approx. in base currency')} ${thbOf(Math.abs(m.netMinor))}` : ''}</div>
            </div>
            ${flaggedCount(m) ? `<div class="rcpt-summary-comments">
              <div class="rcpt-summary-comments-title">${icon('message-square', 'w-3.5 h-3.5')} ${th('มีความเห็น/ข้อทักท้วง','Comments & questions')} • ${flaggedCount(m)} ${th('รายการ','items')}</div>
              ${[...new Set(m.items.map(i => i.expenseId))].filter(id => commentsFor(id).length).map(id => {
                const item = m.items.find(i => i.expenseId === id);
                return `<div class="text-[10.5px] mt-1"><b>${escapeHtml(item?.title || '')}</b></div>
                  ${commentsFor(id).map(c => `<div class="rcpt-comment"><span class="rcpt-comment-icon">${icon('message-square', 'w-3 h-3')}</span><span><b>${escapeHtml(c.name || '')}</b> ${escapeHtml(c.text)}</span></div>`).join('')}`;
              }).join('')}
            </div>` : ''}
          </div>
        </section>

        <div class="receipt-foot">
          ${settled ? `<span class="receipt-stamp">${icon('check-circle-2', 'w-3 h-3')} ${th('เคลียร์ครบแล้ว','Fully settled')}</span><br>` : ''}
          ${currency !== 'THB' && thbRate ? `1 ${escapeHtml(currency)} ≈ ${formatAmount(thbRate, 4)} THB • ` : ''}${th('ออกโดย Fuji Planner','Generated by Fuji Planner')} • ${escapeHtml(new Date().toLocaleString(lang === 'th' ? 'th-TH' : 'en-GB'))}
        </div>

        <div class="btn-row mt-3 no-export">
          <button class="btn btn-secondary btn-sm" data-export-receipt="${escapeHtml(m.memberId)}">${icon('image', 'w-4 h-4')} ${th('PNG ใบเสร็จนี้','PNG this receipt')}</button>
          <button class="btn btn-ghost btn-sm" data-share-receipt="${escapeHtml(m.memberId)}">${icon('share-2', 'w-4 h-4')} ${th('แชร์ให้เพื่อน','Share')}</button>
          <button class="btn btn-ghost btn-sm" data-copy-receipt="${escapeHtml(m.memberId)}">${icon('clipboard-copy', 'w-4 h-4')} ${th('คัดลอกข้อความ','Copy text')}</button>
        </div>
      </div>`;
  }

  function transactionsHtml() {
    if (!state.transactions.length) {
      return `<div class="card p-4">${renderEmptyState({ icon: 'party-popper', title: t('noDebt'), desc: t('allCleared') })}</div>`;
    }
    return `<div class="card p-5" id="tx-card">
      <div class="flex items-center justify-between gap-2 mb-4 flex-wrap">
        <h4 class="font-bold text-sm flex items-center gap-2">${icon('arrow-left-right', 'w-4 h-4')} ${t('transactions')}
          <span class="badge badge-planned text-[10px]">${state.transactions.length}</span></h4>
        <!-- Expand / collapse every breakdown at once (a request) -->
        <div class="btn-row no-export">
          <button class="btn btn-ghost btn-sm tx-tool-btn" data-tx-toggle="open" type="button">${icon('unfold-vertical', 'w-3.5 h-3.5')} ${th('ขยายทั้งหมด','Expand all')}</button>
          <button class="btn btn-ghost btn-sm tx-tool-btn" data-tx-toggle="close" type="button">${icon('fold-vertical', 'w-3.5 h-3.5')} ${th('ย่อทั้งหมด','Collapse all')}</button>
        </div>
      </div>
      <div class="space-y-3 stagger" id="tx-list">${state.transactions.map(tx => {
        const from = state.membersMap[tx.from]; const to = state.membersMap[tx.to];
        const fromStatement = state.statements.find(x => x.memberId === tx.from);
        // The expenses the creditor paid that the debtor shares in — the answer to
        // "จ่ายคืนจากค่าอะไร"; falls back to the member's own share list.
        const details = transactionSources(tx, state.expenses);
        const fallbackDetails = (fromStatement?.items || []).filter(i => i.role === 'share');
        const sourceRows = details.length ? details : fallbackDetails;
        return `<div class="tx-row">
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-2 min-w-0">
              <span class="avatar w-8 h-8 text-[10px]" style="background:${from?.color || 'var(--primary)'};width:32px;height:32px;">${from?.photoURL ? `<img src="${escapeHtml(from.photoURL)}" class="w-full h-full rounded-full object-cover" alt="">` : escapeHtml(getInitials(from?.displayName || ''))}</span>
              <span style="color:var(--text-tertiary);">${icon('arrow-right', 'w-4 h-4')}</span>
              <span class="avatar w-8 h-8 text-[10px]" style="background:${to?.color || 'var(--primary)'};width:32px;height:32px;">${to?.photoURL ? `<img src="${escapeHtml(to.photoURL)}" class="w-full h-full rounded-full object-cover" alt="">` : escapeHtml(getInitials(to?.displayName || ''))}</span>
              <span class="text-xs truncate">${escapeHtml(from?.displayName || '')} → ${escapeHtml(to?.displayName || '')}</span>
            </div>
            <div class="text-right flex-shrink-0">${moneyPair(tx.amountMinor)}</div>
          </div>
          ${sourceRows.length ? `<details class="tx-details mt-2">
            <summary class="text-[11px] cursor-pointer" style="color:var(--text-secondary);">${th('จ่ายคืนจากค่าอะไร','Which bills this settles')} (${sourceRows.length})</summary>
            <div class="tx-sources mt-2">
              ${sourceRows.map(i => {
                const payer = state.membersMap[i.paidBy] || to;
                return `<div class="tx-source-row">
                  <div class="min-w-0">
                    <div class="text-[11.5px] font-bold truncate">${escapeHtml(i.title)}${i.estimated ? ` <span class="rcpt-mini-badge rcpt-mini-badge--est">${th('ประมาณการ','est.')}</span>` : ''}</div>
                    <div class="text-[10px] text-[var(--text-tertiary)]">${escapeHtml(i.date || '')} • ${th('จ่ายโดย','paid by')} ${escapeHtml(payer?.displayName || '')} (${methodLabel(i.method)})</div>
                  </div>
                  <span class="text-[11.5px] font-bold flex-shrink-0">${moneyPair(i.amountMinor)}</span>
                </div>`;
              }).join('')}
            </div>
            <p class="text-[10px] mt-2" style="color:var(--text-tertiary);">${th('ยอดโอนจริงถูกหักกลบกับรายการที่อีกฝ่ายจ่ายให้แล้ว จึงอาจไม่เท่ากับผลรวมข้างบน','The transfer is netted against what the other side already paid, so it may differ from the sum above.')}</p>
          </details>` : ''}
        </div>`;
      }).join('')}</div>
    </div>`;
  }

  /**
   * Items nobody hosts yet ("ยังไม่ระบุเจ้าภาพ") — kept OUT of every balance
   * until a payer is assigned, but always visible here so the group decides.
   */
  function pendingHtml() {
    const pending = pendingPayerExpenses(state.expenses);
    if (!pending.length) return '';
    const total = pending.reduce((s, e) => s + (Number(e.netTotalMinor) || 0), 0);
    return `
      <div class="card p-5" id="settle-pending">
        <div class="flex items-center justify-between gap-2 mb-1 flex-wrap">
          <h4 class="font-bold text-sm flex items-center gap-2">${icon('help-circle', 'w-4 h-4')} ${th('ยังไม่ระบุเจ้าภาพ','Payer not assigned')}
            <span class="badge badge-pending text-[10px]">${pending.length}</span></h4>
          <span class="font-bold text-sm">${moneyPair(total)}</span>
        </div>
        <p class="text-[11px] text-[var(--text-secondary)] mb-3">${th('รายการประมาณการที่ยังไม่มีใครอาสาสำรองจ่าย — ยังไม่ถูกนับในยอดเคลียร์ของใคร จนกว่าจะระบุผู้จ่าย','Estimated items nobody has fronted yet — excluded from everyone’s balance until a payer is assigned')}</p>
        <div class="space-y-2">
          ${pending.map(e => `
            <div class="pending-row">
              <div class="min-w-0 flex-1">
                <div class="text-sm font-bold truncate">${escapeHtml(e.title || '')}</div>
                <div class="text-[10.5px] text-[var(--text-tertiary)]">${escapeHtml(e.date || '')} • ${escapeHtml(categoryLabel(e.category || 'general', lang))} • ${th('หาร','split')} ${(e.allocations || []).filter(a => a.amountMinor > 0).length} ${th('คน','pax')}</div>
              </div>
              <span class="text-sm font-bold flex-shrink-0">${moneyPair(e.netTotalMinor || 0)}</span>
              <button class="btn btn-secondary btn-sm no-export flex-shrink-0" data-assign-payer="${escapeHtml(e.id)}" type="button">${icon('user-plus', 'w-3.5 h-3.5')} ${th('ระบุผู้จ่าย','Assign')}</button>
            </div>`).join('')}
        </div>
      </div>`;
  }

  /** "ค่าใช้จ่ายเกิดขึ้นในบัตรไหนบ้าง" — totals per credit card. */
  function cardsSummaryHtml() {
    const cards = cardSummary(state.expenses, state.membersMap);
    if (!cards.length) {
      return `<div class="mt-4 p-3 rounded-xl text-[11px] flex items-center gap-2" style="background:var(--bg-secondary); color:var(--text-secondary);">
        ${icon('credit-card', 'w-3.5 h-3.5')} ${th('ยังไม่มีรายการที่ระบุชื่อบัตรเครดิต — เพิ่มชื่อบัตรตอนบันทึกค่าใช้จ่าย แล้วสรุปบัตรจะขึ้นที่นี่','No expenses name a credit card yet — add the card name when saving an expense and the summary appears here')}
      </div>`;
    }
    const total = cards.reduce((sum, c) => sum + c.totalMinor, 0);
    return `
      <div class="mt-5">
        <h4 class="font-bold text-sm mb-3 flex items-center gap-2">${icon('credit-card', 'w-4 h-4')} ${th('สรุปบัตรเครดิต','Credit card summary')}
          <span class="badge badge-planned text-[10px]">${cards.length}</span>
        </h4>
        <div class="card-summary-grid">
          ${cards.map(c => `
            <div class="card-summary-tile">
              <div class="card-summary-name">${icon('credit-card', 'w-3.5 h-3.5')} ${escapeHtml(c.card)}</div>
              <div class="card-summary-amount">${money(c.totalMinor)}</div>
              ${currency !== 'THB' && thbOf(c.totalMinor) ? `<div class="card-summary-thb">≈ ${thbOf(c.totalMinor)}</div>` : ''}
              <div class="card-summary-meta">${c.count} ${th('รายการ','items')}${c.estimatedMinor ? ` • ${th('ประมาณการ','est.')} ${money(c.estimatedMinor)}` : ''}${c.holders.length ? ` • ${escapeHtml(c.holders.join(', '))}` : ''}</div>
            </div>`).join('')}
        </div>
        <div class="receipt-line muted mt-2"><span>${th('รวมทุกบัตร','All cards')}</span><span>${money(total)} ${thbTag(total)}</span></div>
      </div>`;
  }

  function overviewHtml() {
    const totalPaid = state.statements.reduce((s, m) => s + m.paidMinor, 0);
    const byMethod = state.statements.reduce((acc, m) => {
      ['cash', 'card', 'transfer'].forEach(k => { acc[k] += m.paidByMethod[k] || 0; });
      return acc;
    }, { cash: 0, card: 0, transfer: 0 });
    return `
      <div class="card p-5" id="settle-overview">
        <h4 class="font-bold text-sm mb-4 flex items-center gap-2">${icon('scale', 'w-4 h-4')} ${th('ภาพรวมทั้งทริป','Trip overview')}</h4>
        <div class="kpi-strip mb-4">
          <div class="kpi-mini"><span class="kpi-mini-label">${th('จ่ายจริงรวม','Total paid')}</span><b>${moneyPair(totalPaid)}</b></div>
          <div class="kpi-mini"><span class="kpi-mini-label">${th('เงินสด','Cash')}</span><b>${moneyPair(byMethod.cash)}</b></div>
          <div class="kpi-mini"><span class="kpi-mini-label">${th('บัตร','Card')}</span><b>${moneyPair(byMethod.card)}</b></div>
          <div class="kpi-mini"><span class="kpi-mini-label">${th('โอน','Transfer')}</span><b>${moneyPair(byMethod.transfer)}</b></div>
        </div>
        <table class="receipt-table">
          <thead><tr>
            <th>${th('สมาชิก','Member')}</th>
            <th class="num">${th('รับ (จ่าย)','Paid')}</th>
            <th class="num">${th('หัก (ส่วนตัว)','Share')}</th>
            <th class="num">${th('คงเหลือ','Balance')}</th>
          </tr></thead>
          <tbody>
            ${state.statements.map(m => `
              <tr>
                <td>${escapeHtml(m.displayName)}</td>
                <td class="num">${moneyPair(m.paidMinor)}</td>
                <td class="num">${moneyPair(m.owedMinor)}</td>
                <td class="num ${m.netMinor >= 0 ? 'receipt-positive' : 'receipt-negative'}"><span class="money-dual"><span class="money-primary" style="color:inherit;">${m.netMinor >= 0 ? '+' : '−'}${money(Math.abs(m.netMinor))}</span>${thbTag(Math.abs(m.netMinor))}</span></td>
              </tr>`).join('')}
          </tbody>
        </table>
        <div class="receipt-line muted"><span>${th('ยอดรวมทุกคน','Everyone together')}</span><span>${money(state.statements.reduce((s, m) => s + m.netMinor, 0))}</span></div>
        ${cardsSummaryHtml()}
      </div>
      ${pendingHtml()}
      ${transactionsHtml()}`;
  }

  /** Reload the trip's comments and repaint the receipts. */
  async function refreshComments() {
    commentsAll = await listComments(tripId, { limitCount: 400 }).catch(() => commentsAll);
    commentMap = commentsByExpense(commentsAll);
    if (view === 'receipts') renderView();
  }

  function bindReceiptActions() {
    document.querySelectorAll('#receipt-picker [data-receipt-filter]').forEach(btn => btn.addEventListener('click', () => {
      receiptFilter = btn.dataset.receiptFilter === 'all' ? 'all' : btn.dataset.receiptFilter;
      renderView();
    }));

    // "ดูทั้งหมด / ย่อรายการ" — long item lists fold inside each receipt block.
    document.querySelectorAll('[data-rcpt-more]').forEach(btn => btn.addEventListener('click', () => {
      const block = btn.closest('.rcpt-block');
      if (!block) return;
      const rows = [...block.querySelectorAll('.rcpt-extra')];
      const expand = rows.some(r => r.hasAttribute('hidden'));
      rows.forEach(r => { if (expand) r.removeAttribute('hidden'); else r.setAttribute('hidden', ''); });
      btn.classList.toggle('is-expanded', expand);
      btn.querySelector('[data-more-label]')?.classList.toggle('hidden', expand);
      btn.querySelector('[data-less-label]')?.classList.toggle('hidden', !expand);
    }));

    // ธุรกรรมที่ต้องทำ — expand / collapse EVERY breakdown at once (a request).
    document.querySelectorAll('[data-tx-toggle]').forEach(btn => btn.addEventListener('click', () => {
      const open = btn.dataset.txToggle === 'open';
      document.querySelectorAll('#settlement-content details.tx-details').forEach(d => { d.open = open; });
    }));

    // "ระบุผู้จ่าย" for items nobody hosts yet → the expense editor.
    document.querySelectorAll('[data-assign-payer]').forEach(btn => btn.addEventListener('click', () => {
      location.hash = `#/trip/${tripId}/expenses/add?id=${encodeURIComponent(btn.dataset.assignPayer)}`;
    }));

    // ทักท้วง/แสดงความเห็นบนรายการในใบเสร็จได้เลย
    document.querySelectorAll('[data-receipt-comment]').forEach(btn => btn.addEventListener('click', async () => {
      const expenseId = btn.dataset.receiptComment;
      const exp = state.expenses.find(e => e.id === expenseId);
      await openCommentSheet({
        tripId,
        expenseId,
        title: exp?.title || '',
        amount: exp ? money(exp.netTotalMinor || 0) : '',
        comments: commentsFor(expenseId),
        canDeleteAny: true,
        onChanged: refreshComments
      });
    }));

    document.querySelectorAll('[data-export-receipt]').forEach(btn => btn.addEventListener('click', async () => {
      const id = btn.dataset.exportReceipt;
      const tLoad = toast.loading(th('กำลังสร้างรูป...', 'Creating image...'));
      try {
        const { exportToPng } = await import('./exports/index.js');
        const statement = state.statements.find(x => x.memberId === id);
        if (!document.getElementById(`receipt-${id}`)) {
          // The overview is on screen — render the receipts again before capturing.
          view = 'receipts';
          receiptFilter = 'all';   // make sure the receipt we capture exists
          document.querySelectorAll('#settle-views .chip').forEach(c => c.classList.toggle('chip-active', c.dataset.view === 'receipts'));
          renderView();
        }
        const hidden = [...document.querySelectorAll('.no-export')];
        hidden.forEach(x => { x.style.visibility = 'hidden'; });
        // The exported image must contain EVERY row — unfold folded items first.
        const folded = [...(document.getElementById(`receipt-${id}`)?.querySelectorAll('.rcpt-extra[hidden]') || [])];
        folded.forEach(r => r.removeAttribute('hidden'));
        try {
          await exportToPng(`receipt-${id}`, `settlement-${(statement?.displayName || id)}.png`);
        } finally {
          hidden.forEach(x => { x.style.visibility = ''; });
          folded.forEach(r => r.setAttribute('hidden', ''));
        }
        tLoad.close();
        toast.success(lang === 'th' ? 'ส่งออกรูปใบเสร็จแล้ว' : 'Receipt image exported');
      } catch (e) {
        tLoad.close();
        toast.error(e.message);
      }
    }));
    const receiptLines = (statement) => [
      `${t('settlement')} — ${statement.displayName}`,
      `${th('รับ (จ่ายไป)','Received')}: ${money(statement.paidMinor)}`,
      `${th('หัก (ส่วนที่ต้องรับผิดชอบ)','Deducted')}: ${money(statement.owedMinor)}`,
      `${th('คงเหลือ','Balance')}: ${money(statement.netMinor)}${thbOf(statement.netMinor) ? ` (≈ ${thbOf(statement.netMinor)})` : ''}`,
      ...statement.items.map(i => `• ${i.role === 'paid' ? '↑' : '↓'} ${i.title} ${money(i.amountMinor)}`)
    ];

    document.querySelectorAll('[data-share-receipt]').forEach(btn => btn.addEventListener('click', async () => {
      const statement = state.statements.find(x => x.memberId === btn.dataset.shareReceipt);
      if (!statement) return;
      const text = receiptLines(statement).join('\n');
      const tShare = toast.loading(th('กำลังเตรียมแชร์...', 'Preparing...'));
      try {
        // Share the PNG itself when the browser allows it, otherwise the text.
        const { exportToPngToCanvas } = await import('./exports/index.js');
        let file = null;
        if (navigator.canShare && exportToPngToCanvas) {
          try {
            const canvas = await exportToPngToCanvas(`receipt-${statement.memberId}`);
            const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
            if (blob) file = new (window.File || Blob)([blob], `settlement-${statement.displayName}.png`, { type: 'image/png' });
          } catch (e) { console.warn('share image failed', e); }
        }
        tShare.close();
        if (file && navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], text, title: `${t('settlement')} — ${statement.displayName}` });
          return;
        }
        if (navigator.share) { await navigator.share({ text }); return; }
        await navigator.clipboard.writeText(text);
        toast.success(th('คัดลอกข้อความใบเสร็จแล้ว', 'Receipt text copied'));
      } catch (e) {
        tShare.close();
        if (e?.name !== 'AbortError') toast.error(th('แชร์ไม่สำเร็จ — คัดลอกข้อความแทน', 'Share failed — copied the text instead'));
        try { await navigator.clipboard.writeText(text); } catch { /* ignore */ }
      }
    }));

    document.querySelectorAll('[data-copy-receipt]').forEach(btn => btn.addEventListener('click', async () => {
      const statement = state.statements.find(x => x.memberId === btn.dataset.copyReceipt);
      if (!statement) return;
      const lines = [
        `${t('settlement')} — ${statement.displayName}`,
        `${th('รับ (จ่ายไป)','Received')}: ${money(statement.paidMinor)}`,
        `${th('หัก (ส่วนที่ต้องรับผิดชอบ)','Deducted')}: ${money(statement.owedMinor)}`,
        `${th('คงเหลือ','Balance')}: ${money(statement.netMinor)}`,
        ...statement.items.map(i => `• ${i.role === 'paid' ? '↑' : '↓'} ${i.title} ${money(i.amountMinor)}`)
      ];
      try {
        await navigator.clipboard.writeText(lines.join('\n'));
        toast.success(th('คัดลอกแล้ว', 'Copied'));
      } catch { toast.error(th('คัดลอกไม่สำเร็จ', 'Copy failed')); }
    }));
  }

  function renderView() {
    const content = document.getElementById('settlement-content');
    if (!content) return;
    if (view === 'overview') {
      content.innerHTML = overviewHtml();
      queueIcons();
      // The overview also shows the pending-payer panel + transactions strip.
      bindReceiptActions();
      return;
    }
    // ใบเสร็จรายคน: ดูของทุกคน หรือเลือกดูทีละคน (ตามที่ขอ — กรองตามชื่อสมาชิก)
    if (receiptFilter !== 'all' && !state.statements.some(m => m.memberId === receiptFilter)) receiptFilter = 'all';
    const visible = receiptFilter === 'all' ? state.statements : state.statements.filter(m => m.memberId === receiptFilter);
    content.innerHTML = `${receiptPickerHtml()}<div class="receipt-grid">${visible.map(receiptHtml).join('')}</div>${pendingHtml()}${transactionsHtml()}`;
    queueIcons();
    bindReceiptActions();
  }

  async function load() {
    const content = document.getElementById('settlement-content');
    if (!content) return;
    try {
      const { expenses, members } = await fetchSettlementData(tripId);
      commentsAll = await listComments(tripId, { limitCount: 400 }).catch(() => []);
      commentMap = commentsByExpense(commentsAll);
      if (!document.getElementById('settlement-content')) return;
      const membersMap = Object.fromEntries(members.map(m => [m.id, m]));
      const normalized = expensesInThb(expenses, trip);
      const { balances, transactions } = calculateSettlement(normalized, members);
      const statements = buildSettlementStatements(normalized, members);
      thbRate = resolveTripThbRate(trip, expenses, currency);
      state = { expenses: normalized, members, membersMap, statements, balances, transactions };
      renderView();
      // No rate anywhere → tell the user how to get the baht column.
      if (currency !== 'THB' && !(thbRate > 0)) {
        const box = document.getElementById('settlement-content');
        if (box) {
          const note = document.createElement('div');
          note.className = 'card p-3 mb-3 text-xs no-export';
          note.innerHTML = `${icon('banknote', 'w-3.5 h-3.5')} ${th('ยังไม่ได้ตั้งเรทแลกเปลี่ยน — ใส่ “เรทแลกเป็น THB” ที่หน้าตั้งค่า เพื่อให้ทุกรายการมีจำนวนเงินบาทกำกับ', 'No exchange rate yet — set “Rate to THB” in Settings to show baht next to every amount')}`;
          box.prepend(note);
          queueIcons();
        }
      }
    } catch (e) {
      console.error(e);
      content.innerHTML = `<div class="card p-5 text-center"><p class="text-sm font-semibold" style="color:var(--danger);">${escapeHtml(e.message)}</p><button id="settle-retry" class="btn btn-secondary btn-sm mt-3">${icon('refresh-cw', 'w-4 h-4')} ${lang==='th' ? 'ลองใหม่' : 'Retry'}</button></div>`;
      document.getElementById('settle-retry')?.addEventListener('click', load);
      queueIcons();
    }
  }

  document.querySelectorAll('#settle-views [data-view]').forEach(btn => btn.addEventListener('click', () => {
    view = btn.dataset.view;
    document.querySelectorAll('#settle-views .chip').forEach(c => c.classList.remove('chip-active'));
    btn.classList.add('chip-active');
    renderView();
  }));

  // The PNG/PDF buttons must always have something to capture, even if the user
  // taps them before the table has finished rendering.
  function ensureExportTarget(id) {
    if (document.getElementById(id)) return document.getElementById(id);
    if (!document.getElementById('settlement-content')) return null;
    renderView();
    return document.getElementById(id);
  }
  function hideNoExport() {
    const list = [...document.querySelectorAll('.no-export')];
    list.forEach(x => { x.style.visibility = 'hidden'; });
    return list;
  }

  bind('export-overview-png', 'click', async () => {
    const tLoad = toast.loading(lang === 'th' ? 'กำลังสร้างรูป...' : 'Creating image...');
    let hidden = [];
    try {
      const { exportToPng } = await import('./exports/index.js');
      const target = view === 'overview' ? 'settle-overview' : 'settlement-content';
      if (!ensureExportTarget(target)) throw new Error(th('ยังไม่มีข้อมูลให้ส่งออก — รอสักครู่แล้วลองใหม่', 'Nothing to export yet — wait a moment and retry'));
      hidden = hideNoExport();
      await exportToPng(target, `settlement-overview-${tripId}.png`);
      tLoad.close();
      toast.success(lang === 'th' ? 'ส่งออก PNG แล้ว' : 'PNG exported');
    } catch (e) {
      tLoad.close();
      toast.error(e.message);
    } finally {
      hidden.forEach(x => { x.style.visibility = ''; });
    }
  });

  bind('print-settle', 'click', async () => {
    const tLoad = toast.loading(lang === 'th' ? 'กำลังสร้าง PDF...' : 'Creating PDF...');
    let hidden = [];
    try {
      const { exportToPdf } = await import('./exports/index.js');
      const target = view === 'overview' ? 'settle-overview' : 'settlement-content';
      if (!ensureExportTarget(target)) throw new Error(th('ยังไม่มีข้อมูลให้พิมพ์ — รอสักครู่แล้วลองใหม่', 'Nothing to print yet — wait a moment and retry'));
      hidden = hideNoExport();
      await exportToPdf(target, `settlement-${tripId}.pdf`);
      tLoad.close();
      toast.success(lang === 'th' ? 'สร้าง PDF แล้ว' : 'PDF created');
    } catch (e) {
      tLoad.close();
      toast.error(e.message);
    } finally {
      hidden.forEach(x => { x.style.visibility = ''; });
    }
  });

  document.getElementById('recalc-settle').addEventListener('click', async () => {
    const btn = document.getElementById('recalc-settle');
    btn.disabled = true;
    const tLoad = toast.loading(lang === 'th' ? 'กำลังคำนวณ...' : 'Calculating...');
    try {
      await recalculateAndSaveSettlement(tripId, currentUser.uid);
      tLoad.close();
      toast.success(lang === 'th' ? 'คำนวณยอดใหม่แล้ว' : 'Recalculated');
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

/**
 * Manage the trip's expense groups. Opened from the expense form or Settings.
 * Built-in groups can be recoloured/re-iconed (kept in the registry for the
 * session); trip-defined groups are stored in Firestore and can be deleted.
 */
async function openCategoryManager(tripId, { onSaved } = {}) {
  const lang = getLang();
  const th = (a, b) => (lang === 'th' ? a : b);

  const sheet = showBottomSheet(`
    <div class="space-y-4">
      <div class="flex items-center gap-3">
        <div class="row-icon" style="width:40px;height:40px;border-radius:14px;background:var(--gradient-primary);color:#fff;">${icon('layout-grid', 'w-5 h-5')}</div>
        <div>
          <h3 class="font-bold text-base" style="font-family: var(--font-display);">${th('จัดการกลุ่มค่าใช้จ่าย','Expense groups')}</h3>
          <p class="text-[11px] text-[var(--text-tertiary)]">${th('เพิ่ม/แก้ไข/ลบกลุ่มของทริปนี้ได้','Add, edit or delete groups for this trip')}</p>
        </div>
      </div>
      <div id="category-note" class="hidden"></div>
      <div id="category-list" class="space-y-2"></div>
      <button id="category-add" class="btn btn-primary w-full">${icon('plus', 'w-4 h-4')} ${th('เพิ่มกลุ่มใหม่','Add a group')}</button>
    </div>
  `);
  queueIcons();

  async function renderList() {
    const box = sheet.sheet.querySelector('#category-list');
    if (!box) return;
    box.innerHTML = `<div class="skeleton h-10"></div>`;
    // Never throws: if Firestore denies the collection (rules not published yet)
    // the manager keeps working with the groups stored on this device.
    await loadTripCategories(tripId, { silent: true });
    const rows = getAllExpenseCategories();
    const offline = categoriesLoadDenied() || localCategoryPending(tripId);
    const note = sheet.sheet.querySelector('#category-note');
    if (note) {
      note.className = offline ? 'text-[11px] p-2.5 rounded-xl mb-2' : 'hidden';
      note.innerHTML = offline
        ? `${icon('alert-triangle', 'w-3.5 h-3.5')} ${th('ยังไม่ได้ Publish firestore.rules — กลุ่มที่เพิ่ม/แก้ตอนนี้จะถูกเก็บไว้ในเครื่องนี้ก่อน แล้วค่อยซิงก์เมื่อกฎพร้อม', 'firestore.rules is not published yet — groups you add now are kept on this device and sync once the rules are live')}`
        : '';
      if (offline) note.style.background = 'var(--bg-secondary)';
      queueIcons();
    }
    box.innerHTML = rows.map(c => `
      <div class="diag-row" data-cat-row="${escapeHtml(c.id)}">
        <span class="row-icon" style="width:32px;height:32px;border-radius:10px;background:${escapeHtml(c.color || 'var(--primary)')}22;color:${escapeHtml(c.color || 'var(--primary)')};">
          ${icon(c.icon || 'package', 'w-4 h-4')}
        </span>
        <div class="min-w-0 flex-1">
          <div class="font-semibold text-xs truncate">${escapeHtml(lang === 'th' ? (c.th || c.en) : (c.en || c.th))}</div>
          <div class="text-[10px] text-[var(--text-tertiary)]">${escapeHtml(c.id)}${isCustomCategory(c.id) ? ` • ${th('กลุ่มของทริป','trip group')}` : ` • ${th('พื้นฐาน','built-in')}`}</div>
        </div>
        <button class="icon-btn" data-cat-edit="${escapeHtml(c.id)}" title="${th('แก้ไข','Edit')}">${icon('pencil', 'w-3.5 h-3.5')}</button>
        <button class="icon-btn icon-btn-danger" data-cat-del="${escapeHtml(c.id)}" title="${th('ลบ','Delete')}">${icon('trash-2', 'w-3.5 h-3.5')}</button>
      </div>`).join('');

    box.querySelectorAll('[data-cat-edit]').forEach(btn => btn.addEventListener('click', () => openEditor(btn.dataset.catEdit)));
    box.querySelectorAll('[data-cat-del]').forEach(btn => btn.addEventListener('click', async () => {
      const id = btn.dataset.catDel;
      if (!isCustomCategory(id)) {
        toast.warning(th('กลุ่มพื้นฐานลบไม่ได้ — แก้ไขชื่อ/สี/ไอคอนได้','Built-in groups cannot be deleted — edit their name/colour/icon instead'));
        return;
      }
      const used = await countCategoryUsage(tripId, id);
      const ok = await confirmAction({
        title: th('ลบกลุ่มนี้?', 'Delete this group?'),
        message: used
          ? th(`มี ${used} รายการใช้กลุ่มนี้อยู่ — รายการจะกลายเป็น "อื่นๆ"`, `${used} expenses use it — they will fall back to "Others"`)
          : th('ยังไม่มีรายการที่ใช้กลุ่มนี้', 'No expense uses this group yet'),
        confirmText: t('delete'), danger: true, icon: 'trash-2'
      });
      if (!ok) return;
      try {
        const res = await deleteCategory(tripId, id);
        if (res?.synced === false) {
          toast.warning(th('ลบออกจากเครื่องนี้แล้ว — ยังไม่ได้ Publish firestore.rules',
            'Removed on this device — firestore.rules is not published yet'));
        } else {
          toast.success(th('ลบกลุ่มแล้ว', 'Group deleted'));
        }
        await renderList();
        await onSaved?.();
      } catch (e) { toast.error(e.message); }
    }));
  }

  function openEditor(id = null) {
    const existing = id ? getCategoryDef(id) : null;
    const isNew = !id;
    const editor = showBottomSheet(`
      <div class="space-y-3">
        <h3 class="font-bold text-base">${isNew ? th('เพิ่มกลุ่มค่าใช้จ่าย','New expense group') : th('แก้ไขกลุ่มค่าใช้จ่าย','Edit expense group')}</h3>
        <div class="grid grid-cols-2 gap-3">
          <div class="input-group"><label class="input-label">${th('ชื่อ (ไทย)','Name (Thai)')}</label><input id="cat-th" class="input" value="${escapeHtml(existing?.th || '')}" placeholder="${th('เช่น ค่ามาสสาจ','e.g. Massage')}"></div>
          <div class="input-group"><label class="input-label">${th('ชื่อ (อังกฤษ)','Name (English)')}</label><input id="cat-en" class="input" value="${escapeHtml(existing?.en || '')}" placeholder="Massage"></div>
        </div>
        <div class="input-group">
          <label class="input-label">${th('ไอคอน','Icon')}</label>
          <div class="chip-row" id="cat-icons" style="max-height:120px; overflow:auto;">
            ${CATEGORY_ICON_CHOICES.map(ic => `<button type="button" class="chip ${((existing?.icon || 'package') === ic) ? 'chip-active' : ''}" data-icon="${ic}">${icon(ic, 'w-3.5 h-3.5')} ${ic.split('-')[0]}</button>`).join('')}
          </div>
        </div>
        <div class="input-group">
          <label class="input-label">${th('สี','Colour')}</label>
          <div class="chip-row" id="cat-colors">
            ${CATEGORY_COLOR_CHOICES.map(col => `<button type="button" class="chip ${((existing?.color || '#9aa79c') === col) ? 'chip-active' : ''}" data-color="${col}" style="background:${col}22; border-color:${col};">${icon('circle', 'w-3 h-3')} ${col}</button>`).join('')}
          </div>
        </div>
        <div id="cat-preview" class="diag-row"></div>
        <div class="flex gap-2">
          <button id="cat-save" class="btn btn-primary flex-1">${icon('save', 'w-4 h-4')} ${t('save')}</button>
          <button id="cat-cancel" class="btn btn-secondary">${t('cancel')}</button>
        </div>
      </div>
    `);
    queueIcons();

    let pick = {
      icon: existing?.icon || 'package',
      color: existing?.color || '#9aa79c'
    };
    const paintPreview = () => {
      const box = editor.sheet.querySelector('#cat-preview');
      const labelTh = editor.sheet.querySelector('#cat-th')?.value || existing?.th || '';
      const labelEn = editor.sheet.querySelector('#cat-en')?.value || existing?.en || '';
      if (!box) return;
      box.innerHTML = `
        <span class="row-icon" style="width:32px;height:32px;border-radius:10px;background:${pick.color}22;color:${pick.color};">${icon(pick.icon, 'w-4 h-4')}</span>
        <div class="min-w-0"><div class="font-semibold text-xs">${escapeHtml(lang === 'th' ? labelTh : labelEn)}</div>
        <div class="text-[10px] text-[var(--text-tertiary)]">${th('ตัวอย่างป้ายในรายการ','Preview in lists')}</div></div>`;
      queueIcons();
    };
    paintPreview();

    editor.sheet.querySelectorAll('#cat-icons [data-icon]').forEach(btn => btn.addEventListener('click', () => {
      pick.icon = btn.dataset.icon;
      editor.sheet.querySelectorAll('#cat-icons .chip').forEach(c => c.classList.remove('chip-active'));
      btn.classList.add('chip-active');
      paintPreview();
    }));
    editor.sheet.querySelectorAll('#cat-colors [data-color]').forEach(btn => btn.addEventListener('click', () => {
      pick.color = btn.dataset.color;
      editor.sheet.querySelectorAll('#cat-colors .chip').forEach(c => c.classList.remove('chip-active'));
      btn.classList.add('chip-active');
      paintPreview();
    }));
    editor.sheet.querySelector('#cat-th').addEventListener('input', paintPreview);
    editor.sheet.querySelector('#cat-en').addEventListener('input', paintPreview);
    editor.sheet.querySelector('#cat-cancel').addEventListener('click', () => editor.close());

    editor.sheet.querySelector('#cat-save').addEventListener('click', async () => {
      const thName = editor.sheet.querySelector('#cat-th').value.trim();
      const enName = editor.sheet.querySelector('#cat-en').value.trim();
      if (!thName && !enName) { toast.warning(th('กรอกชื่อกลุ่มก่อน','Enter a group name first')); return; }
      const tLoad = toast.loading(th('กำลังบันทึก...', 'Saving...'));
      try {
        const saved = await saveCategory(tripId, { th: thName, en: enName, icon: pick.icon, color: pick.color }, { id: id || null });
        tLoad.close();
        if (saved.synced === false) {
          toast.warning(th('บันทึกไว้ในเครื่องนี้แล้ว — ยังไม่ได้ Publish firestore.rules จึงยังไม่ซิงก์ข้ามเครื่อง',
            'Saved on this device — publish firestore.rules to sync it across devices'));
        } else {
          toast.success(th('บันทึกกลุ่มแล้ว', 'Group saved'));
        }
        editor.close();
        await renderList();
        await onSaved?.(saved);
      } catch (e) { tLoad.close(); toast.error(e.message); }
    });
  }

  sheet.sheet.querySelector('#category-add').addEventListener('click', () => openEditor(null));
  await renderList();
  return sheet;
}

/**
 * Manage the trip's credit cards (v13) — one shared list that every expense
 * form picks from (dropdown only), so nobody can type a random card name.
 * Cards live on the trip document (`trip.cards`) and can be added, edited and
 * deleted here or from Settings.
 */
function openCardManager(tripId, { members = [], onSaved = null } = {}) {
  const lang = getLang();
  const th = (a, b) => (lang === 'th' ? a : b);
  let cards = tripCards(currentTrip);
  let editingId = null;

  const holderName = (id) => members.find(m => m.id === id)?.displayName || '';

  const sheet = showBottomSheet(`
    <div class="space-y-4">
      <div class="flex items-center gap-3">
        <div class="row-icon" style="width:40px;height:40px;border-radius:14px;background:var(--gradient-primary);color:#fff;">${icon('credit-card', 'w-5 h-5')}</div>
        <div class="min-w-0">
          <h3 class="font-bold text-base leading-tight" style="font-family: var(--font-display);">${th('บัตรเครดิตของทริป', 'Trip credit cards')}</h3>
          <p class="text-[11px] text-[var(--text-secondary)]">${th('เพิ่ม / แก้ไข / ลบ — ฟอร์มค่าใช้จ่ายจะเลือกได้จากบัตรที่ตั้งไว้เท่านั้น', 'Add / edit / delete — expense forms can only pick from these cards')}</p>
        </div>
      </div>

      <div id="card-list" class="space-y-2"></div>

      <div class="p-3 rounded-xl space-y-3" style="background:var(--bg-secondary); border:1px solid var(--border);">
        <div class="flex items-center justify-between">
          <label class="input-label text-[12px] m-0" id="card-form-title">${icon('plus', 'w-3.5 h-3.5')} ${th('เพิ่มบัตร', 'Add card')}</label>
          <button type="button" id="card-edit-cancel" class="link-btn text-[11px] hidden">${th('ยกเลิกการแก้ไข', 'Cancel edit')}</button>
        </div>
        <div class="input-group"><label class="input-label text-[11px]">${th('ชื่อบัตร', 'Card name')} *</label>
          <input id="card-name" class="input" autocomplete="off" placeholder="${th('เช่น KBank Visa','e.g. KBank Visa')}" maxlength="60"></div>
        <div class="grid grid-cols-2 gap-2">
          <div class="input-group"><label class="input-label text-[11px]">${th('ธนาคาร (ไม่บังคับ)', 'Bank (optional)')}</label>
            <input id="card-bank" class="input" autocomplete="off" placeholder="KBank" maxlength="40"></div>
          <div class="input-group"><label class="input-label text-[11px]">${th('เลข 4 ตัวท้าย', 'Last 4 digits')}</label>
            <input id="card-last4" class="input" inputmode="numeric" maxlength="4" placeholder="4321"></div>
        </div>
        <div class="input-group"><label class="input-label text-[11px]">${icon('user', 'w-3 h-3')} ${th('เจ้าของบัตร', 'Card holder')}</label>
          <select id="card-holder" class="input">
            <option value="">${th('— ไม่ระบุ —', '— none —')}</option>
            ${members.map(m => `<option value="${escapeHtml(m.id)}">${escapeHtml(m.displayName)}</option>`).join('')}
          </select>
        </div>
        <button type="button" id="card-save" class="btn btn-primary w-full">${icon('save', 'w-4 h-4')} <span id="card-save-label">${th('เพิ่มบัตร', 'Add card')}</span></button>
      </div>
    </div>
  `);
  queueIcons();

  function renderList() {
    const list = sheet.sheet.querySelector('#card-list');
    if (!list) return;
    if (!cards.length) {
      list.innerHTML = `<div class="p-3 rounded-xl text-[11px] flex items-center gap-2" style="border:1px dashed var(--border); color:var(--text-secondary);">
        ${icon('credit-card', 'w-3.5 h-3.5')} ${th('ยังไม่มีบัตรในทริปนี้ — เพิ่มบัตรแรกด้านล่าง แล้วทุกฟอร์มจะเลือกจากที่นี่', 'No cards yet — add the first one below')}</div>`;
      queueIcons();
      return;
    }
    list.innerHTML = cards.map(c => `
      <div class="card-row" data-card="${escapeHtml(c.id)}">
        <span class="row-icon" style="width:34px;height:34px;border-radius:11px;background:var(--primary-light);color:var(--primary-strong);flex-shrink:0;">${icon('credit-card', 'w-4 h-4')}</span>
        <div class="min-w-0 flex-1">
          <div class="text-sm font-bold truncate">${escapeHtml(tripCardLabel(c))}</div>
          <div class="text-[10.5px] text-[var(--text-tertiary)] truncate">${[c.bank, holderName(c.id) ? th('เจ้าของ', 'holder') + ': ' + holderName(c.id) : ''].filter(Boolean).join(' • ') || th('ไม่ระบุเจ้าของ', 'no holder')}</div>
        </div>
        <button type="button" class="icon-btn" data-card-edit="${escapeHtml(c.id)}" title="${th('แก้ไข', 'Edit')}">${icon('pencil', 'w-3.5 h-3.5')}</button>
        <button type="button" class="icon-btn icon-btn-danger" data-card-del="${escapeHtml(c.id)}" title="${th('ลบ', 'Delete')}">${icon('trash-2', 'w-3.5 h-3.5')}</button>
      </div>`).join('');
    queueIcons();

    list.querySelectorAll('[data-card-edit]').forEach(btn => btn.addEventListener('click', () => {
      const card = cards.find(c => c.id === btn.dataset.cardEdit);
      if (!card) return;
      editingId = card.id;
      sheet.sheet.querySelector('#card-name').value = card.name;
      sheet.sheet.querySelector('#card-bank').value = card.bank || '';
      sheet.sheet.querySelector('#card-last4').value = card.last4 || '';
      sheet.sheet.querySelector('#card-holder').value = card.holderId || '';
      sheet.sheet.querySelector('#card-form-title').innerHTML = `${icon('pencil', 'w-3.5 h-3.5')} ${th('แก้ไขบัตร', 'Edit card')}`;
      sheet.sheet.querySelector('#card-save-label').textContent = th('บันทึก', 'Save');
      sheet.sheet.querySelector('#card-edit-cancel').classList.remove('hidden');
      queueIcons();
    }));

    list.querySelectorAll('[data-card-del]').forEach(btn => btn.addEventListener('click', async () => {
      const card = cards.find(c => c.id === btn.dataset.cardDel);
      if (!card) return;
      const ok = await confirmAction({
        title: th(`ลบ "${tripCardLabel(card)}" ?`, `Delete "${tripCardLabel(card)}"?`),
        message: th('รายการค่าใช้จ่ายเก่าที่บันทึกด้วยบัตรนี้ยังคงอยู่ (ไม่ถูกลบ)', 'Existing expenses paid with this card stay untouched'),
        confirmText: t('delete'), danger: true, icon: 'trash-2'
      });
      if (!ok) return;
      const next = removeTripCard(cards, card.id);
      try {
        await updateTrip(tripId, { cards: next });
        cards = next;
        if (currentTrip) currentTrip.cards = next;
        if (editingId === card.id) resetForm();
        renderList();
        toast.success(th('ลบบัตรแล้ว', 'Card deleted'));
        onSaved?.(cards);
      } catch (e) { toast.error(e.message); }
    }));
  }

  function resetForm() {
    editingId = null;
    sheet.sheet.querySelector('#card-name').value = '';
    sheet.sheet.querySelector('#card-bank').value = '';
    sheet.sheet.querySelector('#card-last4').value = '';
    sheet.sheet.querySelector('#card-holder').value = '';
    sheet.sheet.querySelector('#card-form-title').innerHTML = `${icon('plus', 'w-3.5 h-3.5')} ${th('เพิ่มบัตร', 'Add card')}`;
    sheet.sheet.querySelector('#card-save-label').textContent = th('เพิ่มบัตร', 'Add card');
    sheet.sheet.querySelector('#card-edit-cancel').classList.add('hidden');
    queueIcons();
  }

  sheet.sheet.querySelector('#card-edit-cancel').addEventListener('click', resetForm);

  sheet.sheet.querySelector('#card-save').addEventListener('click', async () => {
    const name = sheet.sheet.querySelector('#card-name').value.trim();
    if (!name) { toast.error(th('กรอกชื่อบัตรก่อน', 'Enter the card name first')); return; }
    const card = {
      id: editingId || newCardId(),
      name,
      bank: sheet.sheet.querySelector('#card-bank').value.trim(),
      last4: sheet.sheet.querySelector('#card-last4').value.replace(/[^0-9]/g, '').slice(-4),
      holderId: sheet.sheet.querySelector('#card-holder').value
    };
    const next = upsertTripCard(cards, card);
    const btn = sheet.sheet.querySelector('#card-save');
    btn.disabled = true;
    try {
      await updateTrip(tripId, { cards: next });
      cards = next;
      if (currentTrip) currentTrip.cards = next;
      // Keep the local suggestion list in sync (harmless legacy cache).
      rememberCard(tripId, tripCardLabel(card));
      resetForm();
      renderList();
      toast.success(editingId ? th('บันทึกบัตรแล้ว', 'Card saved') : th('เพิ่มบัตรแล้ว', 'Card added'));
      onSaved?.(cards);
    } catch (e) { toast.error(e.message); }
    finally { btn.disabled = false; }
  });

  renderList();
  return sheet;
}

const ROLE_ICONS = { super_admin: 'crown', trip_admin: 'shield-check', member: 'user', viewer: 'eye' };

function openMemberForm(tripId, member = null, { onSaved } = {}) {
  const lang = getLang();
  const th = (a, b) => (lang === 'th' ? a : b);
  const isEdit = !!member;
  const m = member || {};
  const isLocalOnly = (m.authType === 'local') || (!isEdit && false);

  const sheet = showBottomSheet(`
    <div class="space-y-3">
      <div class="flex items-center gap-3">
        <div class="row-icon" style="width:40px;height:40px;border-radius:14px;background:var(--gradient-primary);color:#fff;">${icon(isEdit ? 'user-cog' : 'user-plus', 'w-5 h-5')}</div>
        <div class="min-w-0">
          <h3 class="font-bold text-base leading-tight" style="font-family: var(--font-display);">${isEdit ? th('แก้ไขสมาชิก','Edit member') : th('เพิ่มสมาชิก','Add member')}</h3>
          <p class="text-[11px] text-[var(--text-secondary)]">${isEdit ? escapeHtml(m.displayName || '') : th('กรอกชื่อ แล้วให้สมาชิกเข้าสู่ระบบด้วยบัญชี Google/อีเมลของตัวเอง','Add a name — the member signs in with their own Google/email account')}</p>
        </div>
      </div>
      <form id="member-form" class="space-y-3">
        <div class="input-group"><label class="input-label">${icon('user', 'w-3.5 h-3.5')} ${th('ชื่อที่แสดง','Display name')} *</label><input id="m-name" class="input" required autocomplete="off" value="${escapeHtml(m.displayName || '')}" placeholder="${th('เช่น นุ่น','e.g. Nun')}"></div>
        <div class="input-group">
          <label class="input-label">${icon('mail', 'w-3.5 h-3.5')} ${th('อีเมล (ไม่บังคับ)','Email (optional)')}</label>
          <input id="m-email" class="input" type="email" autocomplete="off" value="${escapeHtml(m.email || '')}" placeholder="friend@example.com">
          <p class="input-hint">${th('สมาชิกเข้าสู่ระบบด้วยบัญชี Google/อีเมลของตัวเอง แล้วขอเข้าร่วมทริปด้วยรหัสเชิญ','Members sign in with their own Google/email account and join with the trip code.')}</p>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div class="input-group"><label class="input-label">${icon('shield', 'w-3.5 h-3.5')} ${th('บทบาท','Role')}</label>
            <select id="m-role" class="input">
              ${MEMBER_ROLES.map(r => `<option value="${r.id}" ${(m.role || 'member') === r.id ? 'selected' : ''}>${lang==='th'?r.th:r.en}</option>`).join('')}
            </select>
          </div>
          <div class="input-group"><label class="input-label">${icon('palette', 'w-3.5 h-3.5')} ${th('สีประจำตัว','Color')}</label><input id="m-color" type="color" value="${m.color || '#8bb89a'}" class="w-full h-11 rounded-xl cursor-pointer border" style="border-color:var(--border);"></div>
        </div>
        <div class="input-group"><label class="input-label">${icon('image', 'w-3.5 h-3.5')} ${th('รูปโปรไฟล์ (URL)','Photo URL')}</label><input id="m-photo" class="input" placeholder="https://..." autocomplete="off" value="${escapeHtml(m.photoURL || '')}"></div>
        ${isEdit ? `
        <div class="input-group"><label class="input-label">${icon('toggle-right', 'w-3.5 h-3.5')} ${th('สถานะ','Status')}</label>
          <select id="m-status" class="input">
            <option value="active" ${(m.status || 'active') === 'active' ? 'selected' : ''}>${th('ใช้งาน','Active')}</option>
            <option value="disabled" ${m.status === 'disabled' ? 'selected' : ''}>${th('ระงับการใช้งาน','Disabled')}</option>
          </select>
        </div>` : ''}
        <div class="p-3 rounded-xl space-y-2" style="background:var(--bg-secondary); border:1px solid var(--border);">
          <p class="text-xs font-bold flex items-center gap-1.5">${icon('key-round', 'w-3.5 h-3.5')} ${th('สิทธิ์การใช้งาน','Permissions')}</p>
          <label class="flex items-center gap-2 text-xs cursor-pointer"><input id="m-perm-itinerary" type="checkbox" class="accent-[var(--primary)] w-4 h-4" ${(m.permissions?.canEditItinerary ?? true) ? 'checked' : ''}> ${th('แก้ไขแผนการเดินทาง','Edit itinerary')}</label>
          <label class="flex items-center gap-2 text-xs cursor-pointer"><input id="m-perm-expense" type="checkbox" class="accent-[var(--primary)] w-4 h-4" ${(m.permissions?.canEditExpense ?? true) ? 'checked' : ''}> ${th('แก้ไขค่าใช้จ่าย','Edit expenses')}</label>
          <label class="flex items-center gap-2 text-xs cursor-pointer"><input id="m-perm-manage" type="checkbox" class="accent-[var(--primary)] w-4 h-4" ${m.permissions?.canManageMembers ? 'checked' : ''}> ${th('จัดการสมาชิก','Manage members')}</label>
        </div>
        <div class="flex gap-2">
          <button type="submit" id="m-submit" class="btn btn-primary flex-1">${icon('save', 'w-4 h-4')} ${isEdit ? t('save') : t('add')}</button>
          ${isEdit ? `<button type="button" id="m-delete" class="btn" style="background:var(--danger-bg);color:var(--danger);border:1.5px solid color-mix(in srgb, var(--danger) 35%, transparent);">${icon('trash-2', 'w-4 h-4')}</button>` : ''}
        </div>
        ${isEdit ? `
          <div class="p-3 rounded-xl text-[11px] flex items-start gap-2" style="background:var(--bg-secondary); border:1px solid var(--border);">
            ${icon('info', 'w-3.5 h-3.5 mt-0.5')}
            <span>${m.authType === 'account'
              ? th('สมาชิกคนนี้ล็อกอินด้วยบัญชี Google/อีเมลของตัวเอง และเข้าถึงทริปนี้ได้ทันที','This member signs in with their own Google/email account and already has access.')
              : th('สมาชิกคนนี้ยังไม่มีบัญชี — ให้เขาสมัครด้วย Google/อีเมล แล้วขอเข้าร่วมด้วยรหัสเชิญ (อนุมัติได้ที่หน้านี้)','This member has no account yet — ask them to sign up with Google/email and join with the trip code.')}</span>
          </div>` : ''}
      </form>
    </div>
  `);
  queueIcons();

  document.getElementById('member-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const btn = document.getElementById('m-submit');
    btn.disabled = true;
    const tLoad = toast.loading(isEdit ? th('กำลังบันทึก...', 'Saving...') : th('กำลังเพิ่มสมาชิก...', 'Adding member...'));
    try {
      const payload = {
        displayName: document.getElementById('m-name').value.trim(),
        email: document.getElementById('m-email')?.value.trim() || '',
        role: document.getElementById('m-role').value,
        color: document.getElementById('m-color').value,
        photoURL: document.getElementById('m-photo').value.trim(),
        permissions: {
          canEditItinerary: document.getElementById('m-perm-itinerary').checked,
          canEditExpense: document.getElementById('m-perm-expense').checked,
          canManageMembers: document.getElementById('m-perm-manage').checked
        }
      };
      if (isEdit) {
        if (document.getElementById('m-status')) payload.status = document.getElementById('m-status').value;
        await updateMember(tripId, m.id, payload);
        tLoad.close();
        toast.success(th('บันทึกแล้ว', 'Saved'));
      } else {
        await createMember(tripId, { ...payload, createdBy: currentUser?.uid }, {
          onNotice: (msg) => toast.warning(msg)
        });
        tLoad.close();
        toast.success(th('เพิ่มสมาชิกแล้ว', 'Member added'));
      }
      sheet.close();
      confetti({ y: 150 });
      await onSaved?.();
    } catch (err) {
      tLoad.close();
      toast.error(err.message || mapFunctionError(err));
      btn.disabled = false;
    }
  });

  bind('m-delete', 'click', async () => {
    sheet.close();
    await removeMemberFlow(tripId, m, onSaved);
  });

  return sheet;
}

async function removeMemberFlow(tripId, member, onSaved) {
  const lang = getLang();
  const th = (a, b) => (lang === 'th' ? a : b);
  const tLoad = toast.loading(th('กำลังตรวจสอบข้อมูล...', 'Checking...'));
  let refs = { expensesPaid: 0, expensesShared: 0, itemsEstimated: 0 };
  try { refs = await countMemberReferences(tripId, member.id); } catch {}
  tLoad.close();
  const used = refs.expensesPaid + refs.expensesShared + refs.itemsEstimated;
  const ok = await confirmAction({
    title: th(`ลบสมาชิก "${member.displayName}" ?`, `Remove "${member.displayName}"?`),
    message: th('สมาชิกจะหายจากรายชื่อและการเลือกในรายการใหม่ ๆ', 'The member disappears from pickers and new expenses.'),
    detail: used
      ? th(`มีข้อมูลอ้างอิง: จ่ายไป ${refs.expensesPaid} รายการ • ร่วมหาร ${refs.expensesShared} รายการ • ประมาณการ ${refs.itemsEstimated} รายการ<br>ยอดที่คำนวณไว้จะยังคงอยู่`,
          `Referenced by: paid ${refs.expensesPaid} • shared ${refs.expensesShared} • estimates ${refs.itemsEstimated}<br>Existing amounts stay untouched.`)
      : th('ยังไม่มีรายการที่อ้างอิงสมาชิกนี้', 'No expenses reference this member yet.'),
    confirmText: th('ลบสมาชิก', 'Remove'),
    danger: true, icon: 'user-x'
  });
  if (!ok) return;
  const tLoad2 = toast.loading(th('กำลังลบ...', 'Removing...'));
  try {
    await deleteMember(tripId, member.id, { uid: member.uid || member.id });
    tLoad2.close();
    toast.success(th('ลบสมาชิกแล้ว', 'Member removed'));
    await onSaved?.();
  } catch (e) { tLoad2.close(); toast.error(e.message); }
}

async function renderMembers(params) {
  const tripId = params.tripId;
  const token = beginRender();
  const lang = getLang();
  const th = (a, b) => (lang === 'th' ? a : b);
  await loadTrip(tripId);
  if (isStale(token)) return;
  const trip = currentTrip;

  let perms = { isAdmin: false, role: 'member' };
  try { perms = await resolvePermissions(tripId, trip, currentUser.uid); } catch {}
  if (isStale(token)) return;

  appEl.innerHTML = `
    <div class="page-enter">
      <div class="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          ${renderPageScene('members', { lang, title: `${icon('users', 'w-5 h-5')} ${t('members')}`,
            subtitle: `${th('บทบาทของคุณ','Your role')}: <b>${escapeHtml(perms.role)}</b> • ${th('สมาชิกล็อกอินด้วย Google/อีเมล แล้วขอเข้าร่วมทริปได้','members sign in with Google/email and request to join')}` })}
        </div>
        <button id="add-member-btn" class="btn btn-primary btn-sm">${icon('user-plus', 'w-4 h-4')} ${th('เพิ่มสมาชิก','Add member')}</button>
      </div>

      <div class="card p-5 space-y-3 mb-5" id="account-members-card">
        <h3 class="font-bold flex items-center gap-2">${icon('user-check', 'w-4 h-4')} ${th('สมาชิกที่ล็อกอินด้วยบัญชี (Google / อีเมล)','Members with an account (Google / email)')}</h3>
        <p class="text-xs text-[var(--text-secondary)]">${th('สมาชิกสมัครบัญชีเองได้ แล้วส่งคำขอเข้าร่วมด้วยรหัสเชิญ — แอดมินกดอนุมัติได้เลย (ไม่ต้องใช้ Cloud Functions)','Members create their own account and ask to join with the invite code — approve them here (no Cloud Functions needed).')}</p>
        <div id="join-requests" class="space-y-2"><div class="skeleton h-10"></div></div>
        <div class="btn-row">
          <button id="add-by-email-btn" class="btn btn-secondary btn-sm">${icon('mail-plus', 'w-4 h-4')} ${th('เพิ่มด้วยอีเมล','Add by email')}</button>
          <button id="refresh-requests-btn" class="btn btn-ghost btn-sm">${icon('refresh-cw', 'w-4 h-4')} ${th('รีเฟรชคำขอ','Refresh requests')}</button>
        </div>
      </div>
      <div id="members-list" class="grid gap-3 stagger"></div>
    </div>
  `;
  queueIcons();

  const canApprove = perms.isAdmin || perms.canManageMembers || perms.role === 'trip_admin';

  async function loadJoinRequests() {
    const box = document.getElementById('join-requests');
    if (!box) return;
    if (!canApprove) {
      box.innerHTML = `<p class="text-[11px] text-[var(--text-tertiary)]">${th('เฉพาะแอดมินทริปเท่านั้นที่ดูคำขอเข้าร่วมได้','Only trip admins can see join requests.')}</p>`;
      return;
    }
    box.innerHTML = `<div class="skeleton h-10"></div>`;
    let requests = [];
    try { requests = await listJoinRequests(tripId); } catch (e) {
      box.innerHTML = `<p class="text-[11px]" style="color:var(--danger);">${escapeHtml(e.message)}</p>`;
      return;
    }
    if (isStale(token)) return;
    const pending = requests.filter(r => r.status !== 'rejected');
    box.innerHTML = pending.length ? pending.map(r => `
      <div class="diag-row" data-request="${escapeHtml(r.uid || r.id)}">
        <div class="w-9 h-9 rounded-full grid place-items-center overflow-hidden flex-shrink-0 text-xs font-bold text-white" style="background:var(--gradient-primary);">
          ${r.photoURL ? `<img src="${escapeHtml(r.photoURL)}" class="w-full h-full object-cover rounded-full" alt="">` : escapeHtml(getInitials(r.displayName || 'M'))}
        </div>
        <div class="min-w-0 flex-1">
          <div class="font-semibold truncate">${escapeHtml(r.displayName || 'Member')}</div>
          <div class="text-[11px] text-[var(--text-secondary)] truncate">${escapeHtml(r.email || '')}</div>
        </div>
        <div class="btn-row" style="grid-template-columns: repeat(2, minmax(0,1fr)); max-width:200px;">
          <button class="btn btn-primary btn-sm" data-approve="${escapeHtml(r.uid || r.id)}">${icon('check', 'w-3.5 h-3.5')} ${th('อนุมัติ','Approve')}</button>
          <button class="btn btn-ghost btn-sm" data-reject="${escapeHtml(r.uid || r.id)}">${th('ปฏิเสธ','Decline')}</button>
        </div>
      </div>`).join('') : `
      <p class="text-[11px] text-[var(--text-tertiary)] flex items-center gap-1.5">${icon('inbox', 'w-3.5 h-3.5')} ${th('ยังไม่มีคำขอเข้าร่วม — แชร์รหัสเชิญให้เพื่อนได้ที่หน้าตั้งค่า','No pending requests — share the invite code from Settings.')}</p>`;

    box.querySelectorAll('[data-approve]').forEach(btn => btn.addEventListener('click', async () => {
      const req = pending.find(x => (x.uid || x.id) === btn.dataset.approve);
      if (!req) return;
      btn.disabled = true;
      const tLoad = toast.loading(th('กำลังเพิ่มสมาชิก...', 'Adding member...'));
      try {
        await approveJoinRequest(tripId, req);
        tLoad.close();
        confetti({ y: 160 });
        toast.success(th(`อนุมัติ ${req.displayName || ''} แล้ว`, `${req.displayName || 'Member'} added`));
        await loadJoinRequests();
        await loadMembersList();
      } catch (e) {
        tLoad.close();
        btn.disabled = false;
        if (isPermissionError(e)) {
          toast.error(th('Firestore Rules ยังไม่อนุญาต — ต้อง Publish กฎก่อน','Firestore rules deny this — publish the rules first'));
          await showRulesHelpSheet({ lang, trip, action: 'approve' });
        } else {
          toast.error(e.message);
        }
      }
    }));

    box.querySelectorAll('[data-reject]').forEach(btn => btn.addEventListener('click', async () => {
      const req = pending.find(x => (x.uid || x.id) === btn.dataset.reject);
      if (!req) return;
      const ok = await confirmAction({
        title: th(`ปฏิเสธคำขอของ "${req.displayName || ''}" ?`, `Decline "${req.displayName || ''}"?`),
        message: th('ผู้ใช้จะเห็นว่าคำขอถูกปฏิเสธ และยังขอใหม่ได้ภายหลัง', 'They will see the request was declined and can ask again later.'),
        confirmText: th('ปฏิเสธ', 'Decline'), danger: true, icon: 'user-x'
      });
      if (!ok) return;
      btn.disabled = true;
      try {
        await rejectJoinRequest(tripId, req);
        toast.info(th('ปฏิเสธคำขอแล้ว', 'Request declined'));
        await loadJoinRequests();
      } catch (e) { toast.error(e.message); btn.disabled = false; }
    }));
  }

  bind('refresh-requests-btn', 'click', () => loadJoinRequests());
  bind('add-by-email-btn', 'click', async () => {
    const email = await promptAction({
      title: th('เพิ่มสมาชิกด้วยอีเมล', 'Add member by email'),
      label: th('อีเมลที่สมาชิกใช้สมัคร', 'The email the member signed up with'),
      placeholder: 'friend@example.com', confirmText: th('ค้นหา', 'Search'), icon: 'mail-plus'
    });
    if (!email) return;
    const tLoad = toast.loading(th('กำลังค้นหา...', 'Searching...'));
    try {
      const profile = await findProfileByEmail(email);
      tLoad.close();
      if (!profile) {
        toast.error(th('ไม่พบบัญชีนี้ — ให้สมาชิกเข้าสู่ระบบด้วย Google/อีเมลอย่างน้อย 1 ครั้งก่อน', 'Account not found — the member must sign in once first.'));
        return;
      }
      const ok = await confirmAction({
        title: th(`เพิ่ม "${profile.displayName || profile.email}" เข้าทริป?`, `Add "${profile.displayName || profile.email}" to this trip?`),
        message: th('สมาชิกจะเข้าถึงข้อมูลทริปนี้ได้ทันที', 'They will get access to this trip immediately.'),
        detail: escapeHtml(profile.email || ''), confirmText: th('เพิ่มเข้าทริป', 'Add to trip'), icon: 'user-plus'
      });
      if (!ok) return;
      const tLoad2 = toast.loading(th('กำลังเพิ่ม...', 'Adding...'));
      await addMemberFromProfile(tripId, profile);
      tLoad2.close();
      confetti({ y: 160 });
      toast.success(th('เพิ่มสมาชิกแล้ว', 'Member added'));
      await loadMembersList();
      await loadJoinRequests();
    } catch (e) {
      tLoad.close();
      if (isPermissionError(e)) {
        toast.error(th('Firestore Rules ยังไม่อนุญาต — ต้อง Publish กฎก่อน','Firestore rules deny this — publish the rules first'));
        await showRulesHelpSheet({ lang, trip, action: 'approve' });
      } else {
        toast.error(e.message);
      }
    }
  });

  loadJoinRequests();

  async function loadMembersList() {
    const list = document.getElementById('members-list');
    if (!list) return;
    list.innerHTML = `<div class="skeleton h-16"></div><div class="skeleton h-16"></div>`;
    try {
      const members = await listMembers(tripId);
      if (isStale(token)) return;
      if (!members.length) {
        list.innerHTML = renderEmptyState({
          icon: 'users',
          title: th('ยังไม่มีสมาชิก','No members'),
          desc: th('เพิ่มสมาชิกเพื่อเริ่มหารค่าใช้จ่าย','Add members to start splitting expenses'),
          actionHtml: `<button id="empty-add-member" class="btn btn-primary btn-sm mt-3">${icon('user-plus', 'w-4 h-4')} ${th('เพิ่มสมาชิก','Add member')}</button>`
        });
        bind('empty-add-member', 'click', () => openMemberForm(tripId, null, { onSaved: loadMembersList }));
        queueIcons();
        return;
      }
      list.innerHTML = members.map(m => `
        <div class="card card-hover p-4 flex items-center justify-between gap-3" data-member="${m.id}">
          <div class="flex items-center gap-3 min-w-0">
            <div class="w-11 h-11 rounded-full grid place-items-center text-sm font-bold text-white flex-shrink-0 overflow-hidden" style="background:${m.color || 'var(--primary)'}">
              ${m.photoURL ? `<img src="${escapeHtml(m.photoURL)}" class="w-full h-full rounded-full object-cover" alt="">` : escapeHtml(getInitials(m.displayName))}
            </div>
            <div class="min-w-0">
              <div class="font-semibold text-sm flex items-center gap-2">
                <span class="truncate">${escapeHtml(m.displayName || 'Member')}</span>
                ${m.id === currentUser.uid ? `<span class="text-[10px] px-2 py-0.5 rounded-full text-white flex-shrink-0" style="background:var(--gradient-primary);">${th('คุณ','You')}</span>` : ''}
              </div>
              <div class="meta-line mt-0.5 flex-wrap">
                ${icon(m.status === 'disabled' ? 'user-x' : 'circle-check', 'w-3 h-3')} ${escapeHtml(m.status || 'active')}
                ${m.username ? ` • ${icon('at-sign', 'w-3 h-3')} ${escapeHtml(m.username)}` : ''}
                ${m.authType === 'account' ? ` • <span style="color:var(--success);">${icon('shield-check','w-3 h-3')} ${th('บัญชี Google/อีเมล','Google/email account')}</span>` : ''}
                ${m.email ? ` • ${escapeHtml(m.email)}` : ''}
                ${m.authType === 'local' ? ` • <span style="color:var(--warning);">${th('ไม่มีล็อกอิน','no login')}</span>` : ''}
              </div>
              <div class="flex items-center gap-1.5 mt-1 flex-wrap">
                <span class="badge badge-planned text-[10px]">${icon(ROLE_ICONS[m.role] || 'user', 'w-2.5 h-2.5')} ${escapeHtml(m.role || 'member')}</span>
                ${m.permissions?.canEditExpense ? `<span class="badge badge-planned text-[10px]">${icon('wallet', 'w-2.5 h-2.5')} ${th('แก้ค่าใช้จ่าย','expenses')}</span>` : ''}
                ${m.permissions?.canManageMembers ? `<span class="badge badge-planned text-[10px]">${icon('shield', 'w-2.5 h-2.5')} ${th('จัดการสมาชิก','manage')}</span>` : ''}
              </div>
            </div>
          </div>
          <div class="flex items-center gap-1 flex-shrink-0">
            <button class="icon-btn" data-act="edit" data-id="${m.id}" title="${t('edit')}">${icon('pencil', 'w-3.5 h-3.5')}</button>
            <button class="icon-btn icon-btn-danger" data-act="delete" data-id="${m.id}" title="${t('delete')}">${icon('trash-2', 'w-3.5 h-3.5')}</button>
          </div>
        </div>
      `).join('');
      list.querySelectorAll('[data-act]').forEach(btn => btn.addEventListener('click', async () => {
        const member = members.find(x => x.id === btn.dataset.id);
        if (!member) return;
        if (btn.dataset.act === 'edit') openMemberForm(tripId, member, { onSaved: loadMembersList });
        else await removeMemberFlow(tripId, member, loadMembersList);
      }));
      queueIcons();
      initReveal(list);
    } catch (e) {
      if (isStale(token)) return;
      console.error(e);
      list.innerHTML = `<div class="card p-5 text-center"><p class="text-sm font-semibold" style="color:var(--danger);">${escapeHtml(e.message)}</p><button id="mem-retry" class="btn btn-secondary btn-sm mt-3">${icon('refresh-cw', 'w-4 h-4')} ${th('ลองใหม่','Retry')}</button></div>`;
      bind('mem-retry', 'click', loadMembersList);
      queueIcons();
    }
  }

  bind('add-member-btn', 'click', () => openMemberForm(tripId, null, { onSaved: loadMembersList }));
  loadMembersList();
}

const DOC_CATS = [
  { id: 'all', th: 'ทั้งหมด', en: 'All', icon: 'layout-grid' },
  { id: 'passport', th: 'พาสปอร์ต', en: 'Passport', icon: 'contact' },
  { id: 'ticket', th: 'ตั๋ว', en: 'Tickets', icon: 'ticket' },
  { id: 'hotel', th: 'โรงแรม', en: 'Hotel', icon: 'bed-double' },
  { id: 'insurance', th: 'ประกัน', en: 'Insurance', icon: 'shield-check' },
  { id: 'booking', th: 'การจอง', en: 'Booking', icon: 'calendar-check' },
  { id: 'other', th: 'อื่นๆ', en: 'Other', icon: 'file-text' },
];
const DOC_ICONS = { passport: 'contact', ticket: 'ticket', hotel: 'bed-double', insurance: 'shield-check', booking: 'calendar-check', other: 'file-text' };

async function renderDocuments(params) {
  const tripId = params.tripId;
  const token = beginRender();
  const lang = getLang();
  const th = (a, b) => (lang === 'th' ? a : b);
  await loadTrip(tripId);
  if (isStale(token)) return;
  const trip = currentTrip;

  const urlParams = new URLSearchParams(location.hash.split('?')[1] || '');
  const action = urlParams.get('action');

  appEl.innerHTML = `
    <div class="page-enter">
      <div class="flex flex-wrap items-center justify-between gap-3 mb-5">
        ${renderPageScene('documents', { lang, title: `${icon('folder', 'w-5 h-5')} ${th('เอกสารสำคัญ','Documents')}`,
          subtitle: th('พาสปอร์ต ตั๋ว โรงแรม ประกัน — เก็บไว้เปิดดูได้ทุกที่','Passports, tickets, hotel and insurance in one place') })}
        <button id="add-doc-btn" class="btn btn-primary btn-sm">${icon('plus', 'w-4 h-4')} ${th('เพิ่มเอกสาร','Add document')}</button>
      </div>
      <div class="chip-row mb-4" id="doc-filters">
        ${DOC_CATS.map(c => `<button class="chip ${c.id === 'all' ? 'chip-active' : ''}" data-cat="${c.id}">${icon(c.icon, 'w-3.5 h-3.5')} ${lang==='th'?c.th:c.en}</button>`).join('')}
      </div>
      <div id="docs-list" class="grid gap-3 stagger"></div>
    </div>
  `;
  queueIcons();
  initReveal(appEl);

  let selectedCat = 'all';
  let docs = [];

  document.querySelectorAll('#doc-filters [data-cat]').forEach(btn => btn.addEventListener('click', () => {
    selectedCat = btn.dataset.cat;
    document.querySelectorAll('#doc-filters .chip').forEach(c => c.classList.remove('chip-active'));
    btn.classList.add('chip-active');
    renderDocs();
  }));

  function renderDocs() {
    const list = document.getElementById('docs-list');
    if (!list) return;
    const filtered = selectedCat === 'all' ? docs : docs.filter(d => d.category === selectedCat);
    if (!filtered.length) {
      list.innerHTML = `<div class="col-span-full">${renderEmptyState({
        icon: selectedCat === 'all' ? 'folder' : (DOC_ICONS[selectedCat] || 'file-text'),
        title: th('ยังไม่มีเอกสาร','No documents'),
        desc: th('เพิ่มพาสปอร์ต ตั๋ว โรงแรม หรือประกันไว้ที่นี่','Add passports, tickets, hotel or insurance docs here'),
        actionHtml: `<button id="empty-add-doc" class="btn btn-primary btn-sm mt-2">${icon('plus', 'w-4 h-4')} ${th('เพิ่มเอกสาร','Add document')}</button>`
      })}</div>`;
      bind('empty-add-doc', 'click', () => openDocForm(null));
      queueIcons();
      return;
    }
    list.innerHTML = filtered.map(doc => {
      const catLabel = DOC_CATS.find(c => c.id === doc.category);
      return `
      <div class="card card-hover p-4" data-doc="${doc.id}">
        <div class="flex gap-3">
          <div class="row-icon" style="width:46px;height:46px;border-radius:14px;">${icon(DOC_ICONS[doc.category] || 'file-text', 'w-5 h-5')}</div>
          <div class="flex-1 min-w-0">
            <div class="flex items-start justify-between gap-2">
              <h3 class="font-semibold text-sm truncate">${escapeHtml(doc.title)}</h3>
              <div class="flex items-center gap-1 flex-shrink-0">
                <span class="badge badge-planned text-[10px]">${icon(DOC_ICONS[doc.category] || 'file-text', 'w-2.5 h-2.5')} ${escapeHtml(catLabel ? (lang==='th'?catLabel.th:catLabel.en) : (doc.category || ''))}</span>
                <button class="icon-btn" data-act="edit" data-id="${doc.id}" title="${t('edit')}">${icon('pencil', 'w-3.5 h-3.5')}</button>
                <button class="icon-btn icon-btn-danger" data-act="delete" data-id="${doc.id}" title="${t('delete')}">${icon('trash-2', 'w-3.5 h-3.5')}</button>
              </div>
            </div>
            ${doc.date ? `<p class="meta-line mt-1">${icon('calendar', 'w-3 h-3')} ${escapeHtml(doc.date)}</p>` : ''}
            ${doc.description ? `<p class="text-xs mt-1 text-[var(--text-secondary)]">${escapeHtml(doc.description)}</p>` : ''}
            ${doc.fileUrl ? `<a href="${escapeHtml(doc.fileUrl)}" target="_blank" rel="noopener" class="inline-flex items-center gap-1 text-xs font-semibold mt-2" style="color: var(--primary-strong);">${icon('external-link', 'w-3.5 h-3.5')} ${th('เปิดไฟล์','Open file')}</a>` : ''}
            ${doc.imageUrl ? `<div class="mt-2 rounded-xl overflow-hidden border" style="border-color: var(--border);"><img src="${escapeHtml(doc.imageUrl)}" class="w-full object-cover" style="aspect-ratio:16/9;" loading="lazy" onerror="this.parentElement.style.display='none'" alt=""></div>` : ''}
          </div>
        </div>
      </div>`;
    }).join('');
    list.querySelectorAll('[data-act]').forEach(btn => btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const doc = docs.find(d => d.id === btn.dataset.id);
      if (!doc) return;
      if (btn.dataset.act === 'edit') openDocForm(doc);
      else await removeDoc(doc);
    }));
    queueIcons();
    initReveal(list);
  }

  async function loadDocs() {
    const list = document.getElementById('docs-list');
    if (!list) return;
    list.innerHTML = `<div class="skeleton h-20"></div><div class="skeleton h-20"></div>`;
    try {
      const { getDocs, collection } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
      const snap = await getDocs(collection(db, `trips/${tripId}/documents`));
      if (isStale(token)) return;
      docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      docs.sort((a, b) => String(b.date || b.createdAt?.seconds || 0).localeCompare(String(a.date || a.createdAt?.seconds || 0)));
      renderDocs();
    } catch (e) {
      if (isStale(token)) return;
      console.error('loadDocs failed', e);
      list.innerHTML = `<div class="card p-5 text-center"><p class="text-sm font-semibold" style="color:var(--danger);">${escapeHtml(e.message)}</p><button id="docs-retry" class="btn btn-secondary btn-sm mt-3">${icon('refresh-cw', 'w-4 h-4')} ${th('ลองใหม่','Retry')}</button></div>`;
      bind('docs-retry', 'click', loadDocs);
      queueIcons();
    }
  }

  async function removeDoc(doc) {
    const ok = await confirmAction({
      title: th(`ลบ "${doc.title}" ?`, `Delete "${doc.title}"?`),
      message: th('ลบเอกสารนี้ออกจากทริป', 'Remove this document from the trip'),
      confirmText: t('delete'), danger: true, icon: 'trash-2'
    });
    if (!ok) return;
    const tLoad = toast.loading(th('กำลังลบ...', 'Deleting...'));
    try {
      const { deleteDoc, doc: fsDoc } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
      await deleteDoc(fsDoc(db, `trips/${tripId}/documents/${doc.id}`));
      tLoad.close();
      toast.success(th('ลบแล้ว', 'Deleted'));
      loadDocs();
    } catch (e) { tLoad.close(); toast.error(e.message); }
  }

  function openDocForm(doc = null) {
    const isEdit = !!doc;
    const d = doc || {};
    const sheet = showBottomSheet(`
      <div class="space-y-3">
        <div class="flex items-center gap-3">
          <div class="row-icon" style="width:40px;height:40px;border-radius:14px;background:var(--gradient-primary);color:#fff;">${icon(isEdit ? 'pencil' : 'folder-plus', 'w-5 h-5')}</div>
          <div>
            <h3 class="font-bold text-base leading-tight" style="font-family: var(--font-display);">${isEdit ? th('แก้ไขเอกสาร','Edit document') : th('เพิ่มเอกสาร','Add document')}</h3>
            <p class="text-[11px] text-[var(--text-secondary)]">${th('พาสปอร์ต ตั๋ว โรงแรม ประกัน และอื่นๆ','Passport, tickets, hotel, insurance & more')}</p>
          </div>
        </div>
        <form id="doc-form" class="space-y-3">
          <div class="input-group"><label class="input-label">${icon('file-text', 'w-3.5 h-3.5')} ${th('ชื่อเอกสาร','Title')} *</label><input id="doc-title" class="input" required autocomplete="off" value="${escapeHtml(d.title || '')}" placeholder="${th('เช่น พาสปอร์ตสมชาย','e.g. Passport')}"></div>
          <div class="grid grid-cols-2 gap-3">
            <div class="input-group"><label class="input-label">${icon('folder', 'w-3.5 h-3.5')} ${th('หมวดหมู่','Category')}</label>
              <select id="doc-cat" class="input">${DOC_CATS.filter(c => c.id !== 'all').map(c => `<option value="${c.id}" ${(d.category || 'other') === c.id ? 'selected' : ''}>${lang==='th'?c.th:c.en}</option>`).join('')}</select>
            </div>
            <div class="input-group"><label class="input-label">${icon('calendar', 'w-3.5 h-3.5')} ${th('วันที่ (ใช้ถึง/หมดอายุ)','Date')}</label><input id="doc-date" class="input" type="date" value="${escapeHtml(d.date || '')}"></div>
          </div>
          <div class="input-group"><label class="input-label">${icon('align-left', 'w-3.5 h-3.5')} ${th('รายละเอียด','Description')}</label><textarea id="doc-desc" class="input" style="min-height:80px;">${escapeHtml(d.description || '')}</textarea></div>
          <div class="input-group"><label class="input-label">${icon('link', 'w-3.5 h-3.5')} ${th('ลิงก์ไฟล์','File link')}</label><input id="doc-file-url" class="input" placeholder="https://..." autocomplete="off" value="${escapeHtml(d.fileUrl || '')}"></div>
          <div class="input-group">
            <label class="input-label">${icon('image', 'w-3.5 h-3.5')} ${th('รูปภาพ (URL)','Image (URL)')}</label>
            <input id="doc-image-url" class="input" placeholder="https://..." autocomplete="off" value="${escapeHtml(d.imageUrl || '')}">
            <div id="doc-img-preview" class="${d.imageUrl ? '' : 'hidden'} mt-2 rounded-xl overflow-hidden border" style="border-color: var(--border);"><img id="doc-preview-img" class="w-full object-cover" style="aspect-ratio:16/9;" src="${escapeHtml(d.imageUrl || '')}" alt=""></div>
          </div>
          <div class="flex gap-2">
            <button type="submit" id="doc-submit" class="btn btn-primary flex-1">${icon('save', 'w-4 h-4')} ${t('save')}</button>
            ${isEdit ? `<button type="button" id="doc-delete" class="btn" style="background:var(--danger-bg);color:var(--danger);border:1.5px solid color-mix(in srgb, var(--danger) 35%, transparent);">${icon('trash-2', 'w-4 h-4')}</button>` : ''}
          </div>
        </form>
      </div>
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

    bind('doc-delete', 'click', async () => { sheet.close(); await removeDoc(d); });

    document.getElementById('doc-form').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const btn = document.getElementById('doc-submit');
      btn.disabled = true;
      const tLoad = toast.loading(th('กำลังบันทึก...', 'Saving...'));
      try {
        const { addDoc, updateDoc, doc: fsDoc, collection, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
        const payload = {
          title: document.getElementById('doc-title').value.trim(),
          category: document.getElementById('doc-cat').value,
          date: document.getElementById('doc-date').value,
          description: document.getElementById('doc-desc').value.trim(),
          fileUrl: document.getElementById('doc-file-url').value.trim(),
          imageUrl: document.getElementById('doc-image-url').value.trim(),
          updatedAt: serverTimestamp()
        };
        if (!payload.title) throw new Error(th('กรุณากรอกชื่อเอกสาร','Title is required'));
        if (isEdit) await updateDoc(fsDoc(db, `trips/${tripId}/documents/${d.id}`), { ...payload, updatedBy: currentUser.uid });
        else await addDoc(collection(db, `trips/${tripId}/documents`), { ...payload, createdBy: currentUser.uid, createdAt: serverTimestamp() });
        tLoad.close();
        toast.success(th('บันทึกแล้ว', 'Saved'));
        sheet.close();
        loadDocs();
      } catch (err) { tLoad.close(); toast.error(err.message); btn.disabled = false; }
    });
  }

  bind('add-doc-btn', 'click', () => openDocForm(null));
  loadDocs();
  if (action === 'add') openDocForm(null);
}

async function renderImportExport(params) {
  const tripId = params.tripId;
  const token = beginRender();
  const lang = getLang();
  const th = (a, b) => (lang === 'th' ? a : b);
  await loadTrip(tripId);
  if (isStale(token)) return;
  const trip = currentTrip;

  const perms = await resolvePermissions(tripId, trip, currentUser.uid);
  if (isStale(token)) return;
  const isAdmin = perms.isAdmin;

  let members = [];
  try { members = await listMembers(tripId); } catch {}
  if (isStale(token)) return;

  appEl.innerHTML = `
    <div class="page-enter max-w-[760px] mx-auto space-y-5">
      <div class="flex items-center justify-between gap-2">
        ${renderPageScene('import', { lang, title: `${icon('package', 'w-5 h-5')} ${t('importExport')}`,
          subtitle: th('เทมเพลต Excel • นำเข้า/ส่งออกแผนและค่าใช้จ่าย (แอดมิน)','Excel templates • import & export itinerary and expenses (admin)') })}
        <span class="badge ${isAdmin ? 'badge-completed' : 'badge-planned'}">${icon(isAdmin ? 'shield-check' : 'eye', 'w-3 h-3')} ${isAdmin ? th('ผู้ดูแลทริป','Admin') : th('สมาชิก','Member')}</span>
      </div>

      ${!isAdmin ? `
        <div class="card p-4 text-xs flex items-start gap-2" style="background: var(--warning-bg); border-color: color-mix(in srgb, var(--warning) 35%, transparent);">
          ${icon('info', 'w-4 h-4')}
          <span>${th('การส่งออก/นำเข้า Excel (เทมเพลตและข้อมูล) เปิดให้เฉพาะผู้ดูแลทริปเท่านั้น — สมาชิกยังส่งออก PNG ได้ตามปกติ','Excel template export/import is available to trip admins only. Members can still export PNG.')}</span>
        </div>` : ''}

      <div class="card card-accent p-5 space-y-4">
        <h3 class="font-bold flex items-center gap-2">${icon('file-down', 'w-4 h-4')} ${th('เทมเพลต Excel','Excel templates')} <span class="badge badge-skipped text-[9px]">${th('แอดมิน','admin')}</span></h3>
        <p class="text-xs text-[var(--text-secondary)]">${th('หัวตารางมีทั้งภาษาอังกฤษและไทย ระบบอ่านได้ทั้งสองแบบ','Headers include English + Thai rows — the importer accepts both.')}</p>
        <div class="btn-row">
          <button data-tpl="itinerary" class="btn btn-secondary btn-sm" ${isAdmin ? '' : 'disabled'}>${icon('map-pinned', 'w-4 h-4')} ${th('เทมเพลตแผนการเดินทาง','Itinerary template')}</button>
          <button data-tpl="expenses" class="btn btn-secondary btn-sm" ${isAdmin ? '' : 'disabled'}>${icon('wallet', 'w-4 h-4')} ${th('เทมเพลตค่าใช้จ่าย','Expenses template')}</button>
          <button data-tpl="full" class="btn btn-secondary btn-sm" ${isAdmin ? '' : 'disabled'}>${icon('layers', 'w-4 h-4')} ${th('เทมเพลตทั้งทริป','Full trip template')}</button>
        </div>
      </div>

      <div class="card p-5 space-y-4">
        <h3 class="font-bold flex items-center gap-2">${icon('upload', 'w-4 h-4')} ${th('นำเข้าข้อมูล','Import')} <span class="badge badge-skipped text-[9px]">${th('แอดมิน','admin')}</span></h3>
        <div class="grid sm:grid-cols-2 gap-3">
          <div class="p-3 rounded-xl" style="background:var(--bg-secondary); border:1px solid var(--border);">
            <p class="text-sm font-semibold flex items-center gap-2">${icon('map-pinned', 'w-4 h-4')} ${th('แผนการเดินทาง','Itinerary')}</p>
            <p class="text-[11px] text-[var(--text-secondary)] mt-1 mb-2">Excel / CSV / JSON ${th('พร้อมสร้างค่าใช้จ่ายประมาณการอัตโนมัติ','with optional auto-created estimated expenses')}</p>
            <input id="import-itinerary-file" type="file" accept=".xlsx,.xls,.csv,.json" class="input text-xs mb-2" ${isAdmin ? '' : 'disabled'}>
            <button id="import-itinerary-btn" class="btn btn-primary btn-sm w-full" disabled>${icon('upload', 'w-4 h-4')} ${th('นำเข้าแผน','Import itinerary')}</button>
          </div>
          <div class="p-3 rounded-xl" style="background:var(--bg-secondary); border:1px solid var(--border);">
            <p class="text-sm font-semibold flex items-center gap-2">${icon('wallet', 'w-4 h-4')} ${th('ค่าใช้จ่าย','Expenses')}</p>
            <p class="text-[11px] text-[var(--text-secondary)] mt-1 mb-2">${th('รวมผู้จ่าย ผู้ร่วมหาร และหมวดหมู่','with payer, participants and categories')}</p>
            <input id="import-expenses-file" type="file" accept=".xlsx,.xls,.csv,.json" class="input text-xs mb-2" ${isAdmin ? '' : 'disabled'}>
            <button id="import-expenses-btn" class="btn btn-primary btn-sm w-full" disabled>${icon('upload', 'w-4 h-4')} ${th('นำเข้าค่าใช้จ่าย','Import expenses')}</button>
          </div>
        </div>
        <div id="import-preview" class="text-sm"></div>
      </div>

      <div class="card p-5 space-y-4">
        <h3 class="font-bold flex items-center gap-2">${icon('download', 'w-4 h-4')} ${th('ส่งออกข้อมูล','Export')}</h3>
        <div class="btn-row">
          <button id="exp-full" class="btn btn-primary btn-sm" ${isAdmin ? '' : 'disabled'}>${icon('file-spreadsheet', 'w-4 h-4')} ${th('Excel ทั้งทริป','Full trip Excel')}</button>
          <button id="exp-itinerary-xl" class="btn btn-secondary btn-sm" ${isAdmin ? '' : 'disabled'}>${icon('map-pinned', 'w-4 h-4')} ${th('แผน (Excel)','Itinerary Excel')}</button>
          <button id="exp-expenses-xl" class="btn btn-secondary btn-sm" ${isAdmin ? '' : 'disabled'}>${icon('wallet', 'w-4 h-4')} ${th('ค่าใช้จ่าย (Excel)','Expenses Excel')}</button>
          <button id="exp-itinerary-csv" class="btn btn-secondary btn-sm" ${isAdmin ? '' : 'disabled'}>${icon('table', 'w-4 h-4')} CSV</button>
        </div>
        <div class="btn-row">
          <button id="exp-itinerary-png" class="btn btn-secondary btn-sm">${icon('image', 'w-4 h-4')} PNG</button>
          <button id="exp-expenses-json" class="btn btn-secondary btn-sm">${icon('file-json', 'w-4 h-4')} JSON</button>
          <button id="exp-print" class="btn btn-ghost btn-sm">${icon('printer', 'w-4 h-4')} ${th('พิมพ์ / PDF','Print / PDF')}</button>
        </div>
      </div>
    </div>
  `;
  queueIcons();
  initReveal(appEl);

  const withLoading = async (label, fn) => {
    const tLoad = toast.loading(label);
    try { const r = await fn(); tLoad.close(); return r; }
    catch (e) { tLoad.close(); toast.error(e.message); return null; }
  };

  appEl.querySelectorAll('[data-tpl]').forEach(btn => btn.addEventListener('click', async () => {
    if (!isAdmin) return toast.warning(th('เฉพาะผู้ดูแลทริป','Admins only'));
    const kind = btn.dataset.tpl;
    const done = await withLoading(th('กำลังเตรียมไฟล์...', 'Preparing file...'), async () => {
      if (kind === 'itinerary') {
        await downloadItineraryTemplate(trip, { lang, withSample: true });
      } else if (kind === 'expenses') {
        await downloadExpensesTemplate(trip, { lang, withSample: true, members });
      } else {
        const items = await fetchItinerary(tripId, null).catch(() => []);
        await exportWorkbookFile({
          trip, items, expenses: [], members, lang, include: 'all',
          filename: `template-full-${tripId}.xlsx`
        });
      }
      return true;
    });
    if (done) toast.success(th('ดาวน์โหลดเทมเพลตแล้ว', 'Template downloaded'));
  }));

  bind('exp-full', 'click', () => withLoading(th('กำลังสร้างไฟล์...', 'Preparing file...'), async () => {
    const [items, expenses] = await Promise.all([
      fetchItinerary(tripId, null).catch(() => []),
      fetchAllExpenses(tripId).catch(() => [])
    ]);
    await exportWorkbookFile({ trip, items, expenses, members, lang, include: 'all' });
    toast.success(th('ส่งออกแล้ว', 'Exported'));
  }));

  bind('exp-itinerary-xl', 'click', () => withLoading(th('กำลังสร้างไฟล์...', 'Preparing file...'), async () => {
    const items = await fetchItinerary(tripId, null).catch(() => []);
    await exportWorkbookFile({ trip, items, members, lang, include: 'itinerary' });
    toast.success(th('ส่งออกแล้ว', 'Exported'));
  }));

  bind('exp-expenses-xl', 'click', () => withLoading(th('กำลังสร้างไฟล์...', 'Preparing file...'), async () => {
    const [expenses, items] = await Promise.all([
      fetchAllExpenses(tripId).catch(() => []),
      fetchItinerary(tripId, null).catch(() => [])
    ]);
    await exportWorkbookFile({ trip, expenses, items, members, lang, include: 'expenses' });
    toast.success(th('ส่งออกแล้ว', 'Exported'));
  }));

  bind('exp-itinerary-csv', 'click', () => withLoading(th('กำลังสร้างไฟล์...', 'Preparing file...'), async () => {
    const items = await fetchItinerary(tripId, null).catch(() => []);
    const rows = [
      ITINERARY_COLUMNS.map(c => c.en),
      ITINERARY_COLUMNS.map(c => c.th),
      ...items.map(it => {
        const row = itineraryItemToRow(it, members, lang);
        return ITINERARY_COLUMNS.map(c => row[c.key] ?? '');
      })
    ];
    await exportCsvFile(rows, ITINERARY_COLUMNS, `itinerary-${tripId}.csv`);
    toast.success(th('ส่งออกแล้ว', 'Exported'));
  }));

  bind('exp-itinerary-png', 'click', () => { location.hash = `#/trip/${tripId}/itinerary`; setTimeout(() => toast.info(th('กดปุ่ม PNG ที่หน้าแผนการเดินทาง', 'Use the PNG button on the itinerary page')), 500); });
  bind('exp-print', 'click', () => window.print());

  bind('exp-expenses-json', 'click', () => withLoading(th('กำลังส่งออก...', 'Exporting...'), async () => {
    const data = await exportExpensesToJson(tripId);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `expenses-${tripId}.json`; a.click();
    URL.revokeObjectURL(url);
    toast.success(th('ส่งออก JSON แล้ว', 'JSON exported'));
  }));

  /* -------- itinerary import -------- */
  const itineraryFile = document.getElementById('import-itinerary-file');
  itineraryFile?.addEventListener('change', () => {
    const btn = document.getElementById('import-itinerary-btn');
    if (btn) btn.disabled = !itineraryFile.files?.[0];
  });
  bind('import-itinerary-btn', 'click', async () => {
    const file = itineraryFile?.files?.[0];
    if (!file) return;
    const tLoad = toast.loading(th('กำลังอ่านไฟล์...', 'Reading file...'));
    try {
      const { rows } = await readSpreadsheet(file);
      const { items: parsed, errors } = importItineraryRows(rows, { trip, members, lang });
      tLoad.close();
      await previewAndImport({
        title: th('นำเข้าแผนการเดินทาง', 'Import itinerary'),
        parsed, errors,
        columns: [th('วันที่','Date'), th('สถานที่','Place'), th('ประมาณการ','Est.')],
        rowFn: p => [p.date, p.title, p.estimateAmount ? `${p.estimateCurrency} ${p.estimateAmount}` : '-'],
        withSyncOption: true,
        onConfirm: async (syncExpenses) => {
          const { bulkCreateItineraryItems } = await import('./itinerary/index.js');
          const res = await bulkCreateItineraryItems(tripId, parsed, currentUser.uid);
          if (syncExpenses) {
            for (const created of (res.items || [])) {
              if (Number(created.estimateAmount) > 0 && created.estimateAutoAdd !== false) {
                try { await syncItineraryExpense(tripId, created, { userId: currentUser.uid, trip, members }); } catch {}
              }
            }
          }
          toast.success(th(`นำเข้าสำเร็จ ${res.created} รายการ`, `Imported ${res.created} items`));
          setTimeout(() => { location.hash = `#/trip/${tripId}/itinerary`; }, 400);
        }
      });
    } catch (e) { tLoad.close(); toast.error(e.message); }
  });

  /* -------- expenses import -------- */
  const expensesFile = document.getElementById('import-expenses-file');
  expensesFile?.addEventListener('change', () => {
    const btn = document.getElementById('import-expenses-btn');
    if (btn) btn.disabled = !expensesFile.files?.[0];
  });
  bind('import-expenses-btn', 'click', async () => {
    const file = expensesFile?.files?.[0];
    if (!file) return;
    const tLoad = toast.loading(th('กำลังอ่านไฟล์...', 'Reading file...'));
    try {
      const { rows } = await readSpreadsheet(file);
      let items = [];
      try { items = await fetchItinerary(tripId, null); } catch {}
      const { expenses: parsed, errors } = importExpenseRows(rows, { trip, members, items, lang });
      tLoad.close();
      await previewAndImport({
        title: th('นำเข้าค่าใช้จ่าย', 'Import expenses'),
        parsed, errors,
        columns: [th('วันที่','Date'), th('รายการ','Title'), th('ยอด','Amount')],
        rowFn: p => [p.date, p.title, `${p.currency} ${fromMinor(p.netTotalMinor, getCurrencyDecimals(p.currency)).toLocaleString()}`],
        onConfirm: async () => {
          const { bulkCreateExpenses } = await import('./expenses/index.js');
          const count = await bulkCreateExpenses(tripId, parsed, currentUser.uid);
          toast.success(th(`นำเข้าสำเร็จ ${count} รายการ`, `Imported ${count} items`));
          setTimeout(() => { location.hash = `#/trip/${tripId}/expenses`; }, 400);
        }
      });
    } catch (e) { tLoad.close(); toast.error(e.message); }
  });

  async function previewAndImport({ title, parsed, errors, columns, rowFn, onConfirm, withSyncOption = false }) {
    if (!parsed.length) {
      toast.error(th('ไม่พบข้อมูลที่นำเข้าได้', 'No importable rows found'));
      const previewEl = document.getElementById('import-preview');
      if (previewEl && errors.length) previewEl.innerHTML = `<pre class="p-2 rounded-xl text-[10px] overflow-auto" style="background:var(--bg-secondary);max-height:200px;">${escapeHtml(JSON.stringify(errors.slice(0, 10), null, 1))}</pre>`;
      return;
    }
    const sheet = showBottomSheet(`
      <h3 class="font-bold mb-2 flex items-center gap-2">${icon('upload', 'w-4 h-4')} ${title}</h3>
      <div class="flex gap-2 mb-3 flex-wrap">
        <span class="badge badge-completed">${icon('check', 'w-3 h-3')} ${parsed.length} ${th('รายการพร้อมนำเข้า','ready')}</span>
        ${errors.length ? `<span class="badge badge-cancelled">${icon('x', 'w-3 h-3')} ${errors.length} ${th('แถวมีปัญหา','errors')}</span>` : ''}
      </div>
      <div class="max-h-[240px] overflow-auto rounded-xl border" style="border-color:var(--border);">
        <table class="w-full text-[11px]">
          <thead style="background:var(--bg-secondary);"><tr>${columns.map((c, i) => `<th class="p-2 ${i === columns.length - 1 ? 'text-right' : 'text-left'}">${escapeHtml(c)}</th>`).join('')}</tr></thead>
          <tbody>${parsed.slice(0, 50).map(p => `<tr style="border-top:1px solid var(--border);">${rowFn(p).map((cell, i) => `<td class="p-2 ${i === columns.length - 1 ? 'text-right' : ''} truncate">${escapeHtml(String(cell ?? ''))}</td>`).join('')}</tr>`).join('')}</tbody>
        </table>
      </div>
      ${errors.length ? `<details class="mt-2"><summary class="text-xs cursor-pointer" style="color:var(--danger);">${th('ดูแถวที่มีปัญหา','See problem rows')}</summary><pre class="mt-1 p-2 rounded-lg text-[10px] overflow-auto" style="background:var(--bg-secondary);max-height:160px;">${escapeHtml(JSON.stringify(errors.slice(0, 10), null, 1))}</pre></details>` : ''}
      ${withSyncOption ? `<label class="flex items-center gap-2 text-xs mt-3 cursor-pointer">
        <input id="pi-sync" type="checkbox" class="accent-[var(--primary)] w-4 h-4" checked>
        ${th('สร้างรายการประมาณการในหน้าค่าใช้จ่ายด้วย','Also create the estimated expenses')}
      </label>` : ''}
      <div class="flex gap-2 mt-3">
        <button id="pi-cancel" class="btn btn-secondary flex-1">${t('cancel')}</button>
        <button id="pi-confirm" class="btn btn-primary flex-1">${icon('check', 'w-4 h-4')} ${th('นำเข้า','Import')}</button>
      </div>
    `);
    queueIcons();
    bind('pi-cancel', 'click', () => sheet.close());
    bind('pi-confirm', 'click', async () => {
      const btn = document.getElementById('pi-confirm');
      btn.disabled = true;
      const sync = document.getElementById('pi-sync')?.checked !== false;
      const tImp = toast.loading(th('กำลังนำเข้า...', 'Importing...'));
      try {
        await onConfirm(sync);
        tImp.close();
        sheet.close();
        confetti({ y: 140 });
      } catch (e) {
        tImp.close();
        toast.error(e.message);
        btn.disabled = false;
      }
    });
  }
}

async function renderSettings(params) {
  const tripId = params.tripId;
  const token = beginRender();
  const lang = getLang();
  const th = (a, b) => (lang === 'th' ? a : b);
  await loadTrip(tripId);
  if (isStale(token)) return;
  const trip = currentTrip;
  const currentColor = localStorage.getItem('fuji_color_theme') || 'sage';
  const mode = getStoredMode();

  let perms = { isAdmin: false, role: 'member' };
  let settingMembers = [];
  await Promise.all([
    loadTripCategories(tripId).catch(e => console.warn(e)),
    resolvePermissions(tripId, trip, currentUser.uid).then(p => { perms = p; }).catch(() => {}),
    listMembers(tripId).then(m => { settingMembers = m || []; }).catch(() => {})
  ]);
  if (isStale(token)) return;
  const budgetDecimals = getCurrencyDecimals(trip?.baseCurrency || 'THB');
  const memberBudgets = (trip?.memberBudgets && typeof trip.memberBudgets === 'object') ? trip.memberBudgets : {};
  const fmtBudgetInput = (minor) => Number(minor) > 0 ? formatAmount(fromMinor(Number(minor), budgetDecimals), budgetDecimals) : '';

  const currencies = [
    { code: 'THB', name: th('บาทไทย', 'Thai Baht') }, { code: 'JPY', name: th('เยนญี่ปุ่น', 'Japanese Yen') },
    { code: 'USD', name: th('ดอลลาร์สหรัฐ', 'US Dollar') }, { code: 'EUR', name: 'ยูโร / Euro' },
    { code: 'KRW', name: th('วอนเกาหลี', 'Korean Won') }, { code: 'SGD', name: th('ดอลลาร์สิงคโปร์', 'Singapore Dollar') },
    { code: 'GBP', name: th('ปอนด์', 'Pound') }, { code: 'CNY', name: th('หยวนจีน', 'Chinese Yuan') },
    { code: 'HKD', name: th('ดอลลาร์ฮ่องกง', 'HK Dollar') }, { code: 'AUD', name: th('ดอลลาร์ออสเตรเลีย', 'AU Dollar') },
    { code: 'TWD', name: th('ดอลลาร์ไต้หวัน', 'Taiwan Dollar') }, { code: 'VND', name: th('ดองเวียดนาม', 'Vietnamese Dong') }
  ];
  const pastels = themes.filter(x => x.type !== 'gradient');
  const gradients = themes.filter(x => x.type === 'gradient');

  appEl.innerHTML = `
    <div class="page-enter max-w-[720px] mx-auto space-y-5">
      <div class="flex items-center justify-between gap-2">
        ${renderPageScene('settings', { lang, title: `${icon('settings', 'w-5 h-5')} ${t('settings')}`,
          subtitle: th('แก้ไขข้อมูลทริป งบประมาณ ธีม และโหมดการแสดงผล','Trip details, budget, theme and appearance') })}
        <span class="badge ${perms.isAdmin ? 'badge-completed' : 'badge-planned'}">${icon(perms.isAdmin ? 'shield-check' : 'eye', 'w-3 h-3')} ${escapeHtml(perms.role)}</span>
      </div>

      <div class="card card-accent p-5 space-y-4">
        <h3 class="font-bold flex items-center gap-2">${icon('compass', 'w-4 h-4')} ${th('ข้อมูลทริป', 'Trip details')}</h3>
        <div class="input-group"><label class="input-label">${icon('sparkles', 'w-3.5 h-3.5')} ${t('tripName')}</label><input id="s-name" class="input" value="${escapeHtml(trip?.name || '')}"></div>
        <div class="input-group"><label class="input-label">${icon('align-left', 'w-3.5 h-3.5')} ${th('รายละเอียด','Description')}</label><textarea id="s-desc" class="input" style="min-height:70px;">${escapeHtml(trip?.description || '')}</textarea></div>
        <div class="grid grid-cols-2 gap-3">
          <div class="input-group"><label class="input-label">${icon('globe', 'w-3.5 h-3.5')} ${t('country')}</label><input id="s-country" class="input" value="${escapeHtml(trip?.country || '')}"></div>
          <div class="input-group"><label class="input-label">${icon('building-2', 'w-3.5 h-3.5')} ${t('city')}</label><input id="s-city" class="input" value="${escapeHtml(trip?.city || '')}"></div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div class="input-group"><label class="input-label">${icon('calendar', 'w-3.5 h-3.5')} ${t('startDate')}</label><input id="s-start" class="input" type="date" value="${escapeHtml(trip?.startDate || '')}"></div>
          <div class="input-group"><label class="input-label">${icon('calendar-check', 'w-3.5 h-3.5')} ${t('endDate')}</label><input id="s-end" class="input" type="date" value="${escapeHtml(trip?.endDate || '')}"></div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div class="input-group">
            <label class="input-label">${icon('banknote', 'w-3.5 h-3.5')} ${t('baseCurrency')}</label>
            <select id="s-currency" class="input">${currencies.map(c => `<option value="${c.code}" ${trip?.baseCurrency === c.code ? 'selected' : ''}>${c.code} — ${c.name}</option>`).join('')}</select>
          </div>
          <div class="input-group">
            <label class="input-label">${icon('clock', 'w-3.5 h-3.5')} ${t('timezone')}</label>
            <select id="s-tz" class="input">${TRIP_TIMEZONES.map(tz => `<option value="${tz}" ${trip?.timezone === tz ? 'selected' : ''}>${tz.replace('_',' ')}</option>`).join('')}</select>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div class="input-group"><label class="input-label">${icon('arrow-left-right', 'w-3.5 h-3.5')} ${th('เรทแลกเป็น THB','Rate to THB')}</label><input id="s-thb-rate" class="input" type="number" step="0.0001" value="${trip?.exchangeRateToTHB || 1}"><p class="input-hint">1 ${trip?.baseCurrency || 'THB'} = ? THB</p></div>
          <div class="input-group"><label class="input-label">${icon('flag', 'w-3.5 h-3.5')} ${th('สถานะทริป','Trip status')}</label>
            <select id="trip-status" class="input">${['draft','active','completed','archived'].map(st => `<option value="${st}" ${(trip?.status || 'draft') === st ? 'selected' : ''}>${st}</option>`).join('')}</select>
          </div>
        </div>
        <div class="input-group">
          <label class="input-label">${icon('image', 'w-3.5 h-3.5')} ${t('coverImage')}</label>
          <div class="rounded-xl overflow-hidden border mb-2" style="border-color:var(--border);">
            <img id="s-cover-preview" class="w-full object-cover" style="aspect-ratio:16/9;" src="${escapeHtml(trip?.coverImage || '')}" onerror="this.style.display='none'" alt="">
          </div>
          <input id="s-cover-url" class="input text-sm" placeholder="https://..." value="${trip?.coverImage && String(trip.coverImage).startsWith('http') ? escapeHtml(trip.coverImage) : ''}">
          <input id="s-cover-file" type="file" accept="image/*" class="input text-xs mt-2">
          <p class="input-hint">${th('อัปโหลดไฟล์ (จะถูกย่อขนาดอัตโนมัติ) หรือวางลิงก์รูป','Upload a file (auto-compressed) or paste an image URL')}</p>
        </div>
        <div class="input-group">
          <label class="input-label">${icon('palette', 'w-3.5 h-3.5')} ${t('themeColor')}</label>
          <div class="flex gap-2 items-center">
            <input id="s-color" type="color" value="${trip?.themeColor || '#8bb89a'}" class="w-11 h-11 rounded-xl cursor-pointer border" style="border-color:var(--border);">
            <input id="s-color-text" class="input flex-1 font-mono text-xs" value="${trip?.themeColor || '#8bb89a'}">
          </div>
        </div>
        <button id="save-settings" class="btn btn-primary w-full">${icon('save', 'w-4 h-4')} ${t('save')}</button>
      </div>

      <div class="card p-5 space-y-4">
        <h3 class="font-bold flex items-center gap-2">${icon('piggy-bank', 'w-4 h-4')} ${th('งบประมาณ','Budget')}</h3>
        <div class="grid grid-cols-2 gap-3">
          <div class="input-group"><label class="input-label">${icon('wallet', 'w-3.5 h-3.5')} ${th('งบประมาณรวม','Total budget')}</label><input id="s-budget-total" class="input money-input" type="text" inputmode="decimal" value="${fmtBudgetInput(trip?.budgetTotal)}" placeholder="50,000"><p class="input-hint">${trip?.baseCurrency || 'THB'} • ${th('งบของทั้งทริป','whole-trip budget')}</p></div>
          <div class="input-group"><label class="input-label">${icon('user', 'w-3.5 h-3.5')} ${th('งบต่อคน (ค่าเริ่มต้น)','Default per person')}</label><input id="s-budget-per-person" class="input money-input" type="text" inputmode="decimal" value="${fmtBudgetInput(trip?.budgetPerPerson)}" placeholder="10,000"><p class="input-hint">${th('ใช้กับคนที่ไม่ได้ตั้งงบ riêng','applies to members without their own budget')}</p></div>
        </div>

        <div class="input-group">
          <label class="input-label">${icon('users', 'w-3.5 h-3.5')} ${th('งบประมาณรายคน','Per-member budgets')}</label>
          <p class="input-hint mb-2">${th('กำหนดงบของแต่ละคนได้เอง — คนที่ไม่มีงบ riêngจะใช้างบต่อคนด้านบน','Set a personal budget for each member — anyone without one uses the default above')}</p>
          <div id="member-budget-rows" class="space-y-2">
            ${settingMembers.map(m => `
              <div class="member-budget-row">
                <span class="avatar" style="width:28px;height:28px;font-size:10px;background:${escapeHtml(m.color || 'var(--primary)')};flex-shrink:0;">${m.photoURL ? `<img src="${escapeHtml(m.photoURL)}" class="w-full h-full rounded-full object-cover" alt="">` : escapeHtml(getInitials(m.displayName))}</span>
                <span class="text-xs font-medium truncate flex-1" title="${escapeHtml(m.displayName)}">${escapeHtml(m.displayName)}</span>
                <input id="s-mbudget-${escapeHtml(m.id)}" class="input money-input member-budget-input" type="text" inputmode="decimal" placeholder="0.00" value="${escapeHtml(fmtBudgetInput(memberBudgets[m.id]))}">
                <span class="text-[10px] text-[var(--text-tertiary)] flex-shrink-0">${escapeHtml(trip?.baseCurrency || 'THB')}</span>
              </div>`).join('') || `<p class="text-xs text-[var(--text-secondary)]">${th('ยังไม่มีสมาชิกในทริป','No members yet')}</p>`}
          </div>
        </div>

        <div id="budget-compare" class="p-3 rounded-xl text-sm border" style="background: var(--bg-secondary); border-color: var(--border);"><div class="skeleton h-4"></div></div>
        <button id="save-budget" class="btn btn-secondary w-full">${icon('save', 'w-4 h-4')} ${th('บันทึกงบประมาณ','Save budget')}</button>
      </div>

      <div class="card p-5 space-y-4">
        <h3 class="font-bold flex items-center gap-2">${icon('palette', 'w-4 h-4')} ${t('theme')}</h3>
        <div class="theme-section-title" style="margin-top:4px;">${icon('leaf', 'w-3.5 h-3.5')} Pastel</div>
        <div class="theme-grid" id="settings-themes-pastel">${pastels.map(x => themeSwatchHtml(x, currentColor)).join('')}</div>
        <div class="theme-section-title">${icon('sparkles', 'w-3.5 h-3.5')} Gradient</div>
        <div class="theme-grid" id="settings-themes-gradient">${gradients.map(x => themeSwatchHtml(x, currentColor)).join('')}</div>
        <div class="theme-section-title">${icon('contrast', 'w-3.5 h-3.5')} ${th('โหมดการแสดงผล','Appearance')}</div>
        <div class="mode-grid" id="settings-modes">
          <button class="mode-option ${mode === 'light' ? 'active' : ''}" data-mode="light">${icon('sun', 'w-5 h-5')} ${th('สว่าง','Light')}</button>
          <button class="mode-option ${mode === 'dark' ? 'active' : ''}" data-mode="dark">${icon('moon', 'w-5 h-5')} ${th('มืด','Dark')}</button>
          <button class="mode-option ${mode === 'auto' ? 'active' : ''}" data-mode="auto">${icon('monitor', 'w-5 h-5')} Auto</button>
        </div>
        <button id="lang-switch" class="btn btn-secondary w-full btn-sm">${icon('languages', 'w-4 h-4')} ${lang === 'th' ? 'English' : 'ภาษาไทย'}</button>
      </div>

      <div class="card p-5 space-y-3" id="expense-groups-card">
        <h3 class="font-bold flex items-center gap-2">${icon('layout-grid', 'w-4 h-4')} ${th('กลุ่มค่าใช้จ่าย','Expense groups')}</h3>
        <p class="text-xs text-[var(--text-secondary)]">${th('เพิ่ม แก้ไขชื่อ/สี/ไอคอน หรือลบกลุ่มของทริปนี้ได้ ทุกหน้าจะใช้กลุ่มใหม่ทันที','Add, rename, recolour or delete groups for this trip — every screen picks them up.')}</p>
        <div id="settings-cat-list" class="flex flex-wrap gap-1.5"></div>
        <button id="settings-manage-cats" class="btn btn-secondary btn-sm w-full">${icon('settings-2', 'w-4 h-4')} ${th('จัดการกลุ่มค่าใช้จ่าย','Manage groups')}</button>
      </div>

      <div class="card p-5 space-y-3" id="trip-cards-card">
        <h3 class="font-bold flex items-center gap-2">${icon('credit-card', 'w-4 h-4')} ${th('บัตรเครดิตของทริป','Trip credit cards')}</h3>
        <p class="text-xs text-[var(--text-secondary)]">${th('ฟอร์มค่าใช้จ่ายจะเลือกบัตรได้จากรายการนี้เท่านั้น — เพิ่ม/แก้ไข/ลบที่นี่ได้ เพื่อป้องกันการกรอกบัตรมั่ว','Expense forms can only pick cards from this list — add/edit/delete here to stop random card names.')}</p>
        <div id="settings-cards-list" class="flex flex-wrap gap-1.5"></div>
        <button id="settings-manage-cards" class="btn btn-secondary btn-sm w-full">${icon('settings-2', 'w-4 h-4')} ${th('จัดการบัตรเครดิต','Manage cards')}</button>
      </div>

      <div class="card p-5 space-y-3" id="invite-card">
        <h3 class="font-bold flex items-center gap-2">${icon('ticket', 'w-4 h-4')} ${th('รหัสเชิญเข้าร่วมทริป','Trip invite code')}</h3>
        <p class="text-xs text-[var(--text-secondary)]">${th('ส่งรหัสนี้ให้เพื่อน — พวกเขาล็อกอินด้วยบัญชี Google/อีเมล แล้วกรอกรหัสเพื่อขอเข้าร่วม จากนั้นกดอนุมัติได้ที่หน้าสมาชิก','Share this code with friends — they sign in with Google/email, enter it to request access, and you approve them on the Members page.')}</p>
        <div class="flex items-center gap-2 flex-wrap">
          <span id="invite-code-value" class="font-mono text-xl font-bold tracking-[0.3em] px-4 py-2 rounded-xl" style="background:var(--bg-secondary); border:1px dashed var(--border);">${escapeHtml(formatInviteCode(trip?.inviteCode) || '—')}</span>
          <button id="invite-code-copy" class="btn btn-secondary btn-sm">${icon('copy', 'w-4 h-4')} ${th('คัดลอก','Copy')}</button>
          <button id="invite-code-regen" class="btn btn-ghost btn-sm">${icon('refresh-cw', 'w-4 h-4')} ${th('สร้างรหัสใหม่','New code')}</button>
        </div>
        <p class="text-[10px] text-[var(--text-tertiary)]">${th('รหัสจะสุ่มใหม่ได้ทุกเมื่อ — คนที่ยังไม่ได้อนุมัติจะใช้รหัสเดิมไม่ได้อีก','You can rotate the code anytime — old codes stop working immediately.')}</p>
      </div>

      <div class="card p-5 space-y-3">
        <h3 class="font-bold flex items-center gap-2">${icon('stethoscope', 'w-4 h-4')} ${th('ตรวจสอบระบบ','System check')}</h3>
        <p class="text-xs text-[var(--text-secondary)]">${th('เช็กว่าล็อกอินสมาชิก, Cloud Functions และ Firestore Rules พร้อมใช้งานไหม (ใช้เวลาไม่กี่วินาที)','Checks member login, Cloud Functions and Firestore rules (a few seconds).')}</p>
        <button id="run-diagnostics" class="btn btn-secondary w-full">${icon('play', 'w-4 h-4')} ${th('เริ่มตรวจสอบ','Run check')}</button>
        <div id="diag-results" class="space-y-2"></div>
      </div>

      <div class="card p-5 space-y-3" style="border-color: color-mix(in srgb, var(--danger) 35%, var(--border));">
        <h3 class="font-bold flex items-center gap-2" style="color:var(--danger);">${icon('alert-triangle', 'w-4 h-4')} ${th('เขตอันตราย','Danger zone')}</h3>
        <p class="text-xs text-[var(--text-secondary)]">${th('ลบทริปจะลบแผนการเดินทาง ค่าใช้จ่าย สมาชิก และเอกสารทั้งหมดอย่างถาวร','Deleting a trip removes its itinerary, expenses, members and documents permanently.')}</p>
        <div class="btn-row">
          <button id="dup-trip" class="btn btn-secondary btn-sm">${icon('copy', 'w-4 h-4')} ${th('ทำสำเนาทริป','Duplicate trip')}</button>
          <button id="del-trip" class="btn btn-sm" style="background:var(--danger);color:#fff;">${icon('trash-2', 'w-4 h-4')} ${th('ลบทริปนี้','Delete this trip')}</button>
        </div>
        <p class="text-[10px] text-[var(--text-tertiary)] font-mono">Trip ID: ${escapeHtml(tripId)}</p>
      </div>
    </div>
  `;
  queueIcons();
  initReveal(appEl);

  const colorInput = document.getElementById('s-color');
  const colorText = document.getElementById('s-color-text');
  colorInput?.addEventListener('input', () => { if (colorText) colorText.value = colorInput.value; });
  colorText?.addEventListener('input', () => { if (/^#[0-9A-F]{6}$/i.test(colorText.value) && colorInput) colorInput.value = colorText.value; });
  bind('s-cover-url', 'input', (e) => {
    const url = e.target.value.trim();
    const preview = document.getElementById('s-cover-preview');
    if (preview && url.startsWith('http')) { preview.src = url; preview.style.display = ''; }
  });
  bind('s-cover-file', 'change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const preview = document.getElementById('s-cover-preview');
      if (preview) { preview.src = ev.target.result; preview.style.display = ''; }
    };
    reader.readAsDataURL(file);
  });

  bindMoneyInputs(document);
  /** Read the per-member budgets currently typed in the form (minor units). */
  function readMemberBudgets() {
    const dec = getCurrencyDecimals(document.getElementById('s-currency').value);
    const out = {};
    for (const m of settingMembers) {
      const v = parseCurrencyInput(document.getElementById(`s-mbudget-${m.id}`)?.value || '');
      if (v > 0) out[m.id] = toMinor(v, dec);
    }
    return out;
  }

  async function updateBudgetCompare() {
    const box = document.getElementById('budget-compare');
    if (!box) return;
    try {
      const { expenses } = await fetchSettlementData(tripId);
      if (isStale(token)) return;
      const normalized = expensesInThb(expenses, trip);
      const totalMinor = sumExpenses(normalized);
      const code = document.getElementById('s-currency').value;
      const dec = getCurrencyDecimals(code);
      const rate = code === 'THB' ? 1 : parseCurrencyInput(document.getElementById('s-thb-rate').value);
      const budgetTotal = parseCurrencyInput(document.getElementById('s-budget-total').value) || 0;
      const budgetPerPerson = parseCurrencyInput(document.getElementById('s-budget-per-person').value) || 0;
      const toThb = (major) => { const v = toThbMinor(toMinor(major, dec), code, rate); return v == null ? 0 : v; };

      // Each member's committed share (their allocations, normalized to THB).
      const shareBy = {};
      for (const exp of normalized) {
        if ((exp.status || 'active') === 'voided') continue;
        for (const a of exp.allocations || []) shareBy[a.memberId] = (shareBy[a.memberId] || 0) + (a.amountMinor || 0);
      }

      let html = `<div class="flex items-center gap-2">${icon('wallet', 'w-4 h-4')} <span>${th('ใช้ไป','Spent')}: <b>${formatCurrency(totalMinor, 'THB')}</b></span></div>`;
      if (budgetTotal) {
        const budgetMinor = toThb(budgetTotal);
        const diff = budgetMinor - totalMinor;
        const pct = budgetMinor > 0 ? Math.min(100, Math.round(totalMinor / budgetMinor * 100)) : 0;
        html += `<div class="flex items-center gap-2 mt-2">${icon('pie-chart', 'w-4 h-4')} <span>${th('งบ','Budget')} ${moneyHtml(toMinor(budgetTotal, dec), code, rate)} • ${diff >= 0 ? th(`เหลือ ${formatCurrency(diff, 'THB')}`, `${formatCurrency(diff, 'THB')} left`) : th(`เกิน ${formatCurrency(-diff, 'THB')}`, `${formatCurrency(-diff, 'THB')} over`)} (${pct}%)</span></div><div class="progress mt-2"><div class="progress-bar" style="width:${pct}%; ${diff < 0 ? 'background: var(--danger);' : ''}"></div></div>`;
      }
      if (budgetPerPerson) html += `<div class="flex items-center gap-2 mt-2">${icon('user', 'w-4 h-4')} <span>${th('งบต่อคน (ค่าเริ่มต้น)','Default per person')} ${moneyHtml(toMinor(budgetPerPerson, dec), code, rate)}</span></div>`;

      /* ---- Consistency checks (a request: the numbers must add up) ---- */
      const memberRows = settingMembers.map(m => {
        const typed = parseCurrencyInput(document.getElementById(`s-mbudget-${m.id}`)?.value || '');
        const own = typed > 0 ? typed : budgetPerPerson;
        return { m, own, typed, spent: shareBy[m.id] || 0 };
      });
      const sumMembers = memberRows.reduce((s, r) => s + (r.typed > 0 ? toThb(r.typed) : 0), 0);
      const checks = [];
      if (budgetTotal && sumMembers > 0) {
        const totalThb = toThb(budgetTotal);
        if (Math.abs(sumMembers - totalThb) > 1) {
          checks.push({ icon: 'alert-triangle', text: `${th('ผลรวมงบรายคน', 'Sum of personal budgets')} <b>${formatCurrency(sumMembers, 'THB')}</b> ${th('ไม่เท่ากับงบรวม', 'does not equal the total budget')} <b>${formatCurrency(totalThb, 'THB')}</b> ${th('(ส่วนต่าง', '(difference')} ${formatCurrency(Math.abs(sumMembers - totalThb), 'THB')})` });
        }
      }
      if (budgetTotal && budgetPerPerson && settingMembers.length) {
        const expected = toThb(budgetPerPerson) * settingMembers.length;
        const totalThb = toThb(budgetTotal);
        if (Math.abs(expected - totalThb) > 1 && sumMembers <= 0) {
          checks.push({ icon: 'info', text: `${th('งบต่อคน ×', 'Per person ×')} ${settingMembers.length} ${th('คน =', ' people =')} <b>${formatCurrency(Math.round(expected), 'THB')}</b> ${th('แต่งบรวมคือ', 'but the total budget is')} <b>${formatCurrency(totalThb, 'THB')}</b>` });
        }
      }
      if (checks.length) {
        html += `<div class="budget-check mt-2">${checks.map(c => `<div class="budget-check-row">${icon(c.icon, 'w-3.5 h-3.5')} <span>${c.text}</span></div>`).join('')}</div>`;
      }

      /* ---- Per-member budget vs their committed share ---- */
      const withBudget = memberRows.filter(r => r.own > 0);
      if (withBudget.length) {
        html += `<div class="budget-member-list mt-3">
          <div class="budget-member-head">${icon('users', 'w-3.5 h-3.5')} ${th('งบรายคน vs ส่วนที่ต้องรับผิดชอบ','Personal budget vs committed share')}</div>
          ${withBudget.map(r => {
            const bThb = toThb(r.own);
            const left = bThb - r.spent;
            const pct = bThb > 0 ? Math.min(100, Math.round(r.spent / bThb * 100)) : 0;
            return `<div class="budget-member-row">
              <span class="budget-member-name">${moodFaceHtml(budgetMood(r.spent, bThb), { size: 22, lang })} ${escapeHtml(r.m.displayName)}${r.typed > 0 ? '' : ` <i>(${th('ค่าเริ่มต้น','default')})</i>`}</span>
              <span class="budget-member-nums">${th('งบ','budget')} <b>${formatCurrency(bThb, 'THB')}</b> • ${th('ใช้','used')} ${formatCurrency(r.spent, 'THB')} • ${left >= 0 ? `${th('เหลือ','left')} <b style="color:var(--success);">${formatCurrency(left, 'THB')}</b>` : `<b style="color:var(--danger);">${th('เกิน','over')} ${formatCurrency(-left, 'THB')}</b>`} (${pct}%)</span>
              <div class="progress" style="height:5px;"><div class="progress-bar" style="width:${pct}%; ${left < 0 ? 'background: var(--danger);' : ''}"></div></div>
            </div>`;
          }).join('')}
        </div>`;
      }
      box.innerHTML = html;
      queueIcons();
    } catch {
      box.innerHTML = `<span class="text-xs text-[var(--text-tertiary)]">${th('โหลดข้อมูลค่าใช้จ่ายไม่สำเร็จ','Could not load expense data')}</span>`;
    }
  }
  updateBudgetCompare();
  bind('s-budget-total', 'input', updateBudgetCompare);
  bind('s-budget-per-person', 'input', updateBudgetCompare);
  settingMembers.forEach(m => {
    const input = document.getElementById(`s-mbudget-${m.id}`);
    input?.addEventListener('input', updateBudgetCompare);
  });

  const saveAll = async (btnId, extra = {}) => {
    const btn = document.getElementById(btnId);
    if (btn) btn.disabled = true;
    const tLoad = toast.loading(th('กำลังบันทึก...', 'Saving...'));
    try {
      const file = document.getElementById('s-cover-file')?.files?.[0];
      const payload = {
        name: document.getElementById('s-name').value.trim(),
        description: document.getElementById('s-desc').value.trim(),
        country: document.getElementById('s-country').value.trim(),
        city: document.getElementById('s-city').value.trim(),
        startDate: document.getElementById('s-start').value,
        endDate: document.getElementById('s-end').value,
        baseCurrency: document.getElementById('s-currency').value,
        timezone: document.getElementById('s-tz').value,
        exchangeRateToTHB: parseFloat(document.getElementById('s-thb-rate').value) || 1,
        themeColor: document.getElementById('s-color').value,
        status: document.getElementById('trip-status').value,
        ...extra
      };
      if (!payload.name) throw new Error(th('กรุณากรอกชื่อทริป', 'Trip name is required'));
      if (payload.startDate && payload.endDate && payload.endDate < payload.startDate) {
        throw new Error(th('วันสิ้นสุดต้องไม่ก่อนวันเริ่ม', 'End date must be after start date'));
      }
      await updateTrip(tripId, payload);
      if (file) {
        const url = await uploadCoverImage(tripId, file, currentUser.uid);
        if (url) await updateTrip(tripId, { coverImage: url });
      } else {
        const coverUrl = document.getElementById('s-cover-url').value.trim();
        if (coverUrl && coverUrl !== trip?.coverImage) await updateTrip(tripId, { coverImage: coverUrl });
      }
      tLoad.close();
      toast.success(th('บันทึกการตั้งค่าแล้ว', 'Settings saved'));
      await loadTrip(tripId);
    } catch (e) { tLoad.close(); toast.error(e.message); }
    finally { if (btn) btn.disabled = false; }
  };

  bind('save-settings', 'click', () => saveAll('save-settings'));
  bind('save-budget', 'click', () => saveAll('save-budget', {
    budgetTotal: toMinor(parseCurrencyInput(document.getElementById('s-budget-total').value), getCurrencyDecimals(document.getElementById('s-currency').value)),
    budgetPerPerson: toMinor(parseCurrencyInput(document.getElementById('s-budget-per-person').value), getCurrencyDecimals(document.getElementById('s-currency').value)),
    memberBudgets: readMemberBudgets()
  }));

  document.querySelectorAll('.theme-option').forEach(btn => btn.addEventListener('click', () => {
    applyTheme(btn.dataset.theme);
    document.querySelectorAll('.theme-option').forEach(b => b.classList.remove('active'));
    document.querySelectorAll(`.theme-option[data-theme="${btn.dataset.theme}"]`).forEach(b => b.classList.add('active'));
    const thm = themes.find(x => x.id === btn.dataset.theme);
    toast.success(thm ? `${thm.name} • ${thm.desc || ''}` : btn.dataset.theme);
    renderDesktopNav();
  }));
  document.querySelectorAll('#settings-modes .mode-option').forEach(btn => btn.addEventListener('click', () => {
    applyMode(btn.dataset.mode);
    document.querySelectorAll('#settings-modes .mode-option').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  }));
  bind('lang-switch', 'click', () => {
    const newLang = lang === 'th' ? 'en' : 'th';
    setLang(newLang);
    toast.success(newLang === 'th' ? 'ภาษาไทย' : 'English');
    renderSettings(params);
    renderDesktopNav();
    updateBottomNav();
  });

  // Expense groups preview (values come from the shared registry).
  (function paintCategoryChips() {
    const box = document.getElementById('settings-cat-list');
    if (!box) return;
    box.innerHTML = getAllExpenseCategories().map(c => `
      <span class="chip text-[10px]" style="background:${escapeHtml(c.color || 'var(--primary)')}22; border-color:${escapeHtml(c.color || 'var(--primary)')};">
        ${icon(c.icon || 'package', 'w-3 h-3')} ${escapeHtml(lang === 'th' ? (c.th || c.en) : (c.en || c.th))}
      </span>`).join('');
    queueIcons();
  })();
  bind('settings-manage-cats', 'click', () => openCategoryManager(tripId, {
    onSaved: () => { loadTripCategories(tripId).then(() => renderSettings(params)); }
  }));

  // Trip credit cards — the managed dropdown source for every expense form.
  function paintCardChips() {
    const box = document.getElementById('settings-cards-list');
    if (!box) return;
    const cards = tripCards(currentTrip);
    box.innerHTML = cards.length ? cards.map(c => `
      <span class="chip text-[10px]" style="background:var(--primary-light); border-color:color-mix(in srgb, var(--primary-raw) 35%, transparent);">
        ${icon('credit-card', 'w-3 h-3')} ${escapeHtml(tripCardLabel(c))}</span>`).join('')
      : `<span class="text-xs text-[var(--text-tertiary)]">${th('ยังไม่มีบัตร — กด “จัดการบัตรเครดิต” เพื่อเพิ่ม','No cards yet — tap “Manage cards” to add the first one')}</span>`;
    queueIcons();
  }
  paintCardChips();
  bind('settings-manage-cards', 'click', () => openCardManager(tripId, {
    members: settingMembers,
    onSaved: (cards) => { if (currentTrip) currentTrip.cards = cards; paintCardChips(); }
  }));

  bind('invite-code-copy', 'click', () => {
    const code = formatInviteCode(trip?.inviteCode || '');
    if (!code) return;
    const copied = navigator.clipboard?.writeText?.(code);
    if (copied?.then) copied.then(() => toast.success(th('คัดลอกรหัสเชิญแล้ว','Invite code copied'))).catch(() => toast.info(code));
    else toast.info(code);
  });

  bind('invite-code-regen', 'click', async () => {
    const ok = await confirmAction({
      title: th('สร้างรหัสเชิญใหม่?', 'Generate a new invite code?'),
      message: th('รหัสเดิมจะใช้ไม่ได้อีก (สมาชิกที่อนุมัติแล้วยังเข้าได้ตามปกติ)', 'The old code stops working (approved members keep access).'),
      confirmText: th('สร้างใหม่', 'Generate'), icon: 'refresh-cw'
    });
    if (!ok) return;
    const tLoad = toast.loading(th('กำลังสร้างรหัสใหม่...', 'Generating...'));
    try {
      const code = await regenerateInviteCode(tripId);
      tLoad.close();
      const el = document.getElementById('invite-code-value');
      if (el) el.textContent = formatInviteCode(code);
      if (currentTrip) currentTrip.inviteCode = code;
      confetti({ y: 150 });
      toast.success(th(`รหัสใหม่: ${formatInviteCode(code)}`, `New code: ${formatInviteCode(code)}`));
    } catch (e) {
      tLoad.close();
      toast.error(e.message);
    }
  });

  bind('run-diagnostics', 'click', async () => {
    const box = document.getElementById('diag-results');
    const btn = document.getElementById('run-diagnostics');
    if (!box || !btn) return;
    btn.disabled = true;
    box.innerHTML = `<div class="diag-row"><span class="diag-dot"></span><span>${th('กำลังตรวจสอบ...','Running checks...')}</span></div>`;
    try {
      const report = await runSystemDiagnostics({ tripId, lang });
      const color = { ok: 'var(--success)', warn: '#d97706', fail: 'var(--danger)' };
      const glyph = { ok: 'check-circle-2', warn: 'alert-circle', fail: 'x-circle' };
      box.innerHTML = report.results.map(r => `
        <div class="diag-row" data-diag="${escapeHtml(r.id)}" data-status="${r.status}">
          <i data-lucide="${glyph[r.status] || 'circle'}" class="w-4 h-4 shrink-0" style="color:${color[r.status] || 'var(--text-secondary)'};"></i>
          <div class="min-w-0">
            <div class="font-semibold" style="color:${color[r.status] || 'inherit'};">${escapeHtml(r.label)}</div>
            <div class="text-[11px] text-[var(--text-secondary)]">${escapeHtml(r.detail || '')}</div>
            ${r.fix ? `<div class="diag-fix">${escapeHtml(r.fix)}</div>` : ''}
          </div>
        </div>`).join('') + `
        <div class="btn-row pt-1">
          <button id="diag-copy" class="btn btn-secondary btn-sm">${icon('clipboard-copy', 'w-4 h-4')} ${th('คัดลอกผลตรวจสอบ','Copy report')}</button>
          <button id="diag-rerun" class="btn btn-ghost btn-sm">${icon('refresh-cw', 'w-4 h-4')} ${th('ตรวจอีกครั้ง','Run again')}</button>
        </div>`;
      queueIcons();
      document.getElementById('diag-copy')?.addEventListener('click', () => {
        const text = formatDiagnosticsReport({ tripId, lang, results: report.results });
        const copied = navigator.clipboard?.writeText?.(text);
        if (copied?.then) copied.then(() => toast.success(th('คัดลอกแล้ว','Copied'))).catch(() => toast.info(text.slice(0, 80)));
        else toast.info(text.slice(0, 80));
      });
      document.getElementById('diag-rerun')?.addEventListener('click', () => document.getElementById('run-diagnostics')?.click());
      toast[report.ok ? 'success' : 'error'](report.ok
        ? th('ระบบพร้อมใช้งาน ✅','All checks passed ✅')
        : th('พบปัญหาที่ต้องแก้ — ดูรายละเอียดด้านล่าง','Problems found — see details below'));
    } catch (e) {
      box.innerHTML = `<div class="diag-row" data-status="fail"><div><div class="font-semibold" style="color:var(--danger);">${escapeHtml(e.message)}</div></div></div>`;
    } finally {
      btn.disabled = false;
    }
  });

  bind('dup-trip', 'click', async () => {
    const ok = await confirmAction({
      title: th('ทำสำเนาทริปนี้?', 'Duplicate this trip?'),
      message: th('คัดลอกสมาชิกและแผนการเดินทางไปยังทริปใหม่', 'Copies members and itinerary into a new trip.'),
      confirmText: th('ทำสำเนา', 'Duplicate'), icon: 'copy'
    });
    if (!ok) return;
    const tLoad = toast.loading(th('กำลังคัดลอก...', 'Duplicating...'));
    try {
      const newId = await duplicateTrip(trip, currentUser.uid, { nameSuffix: th(' (สำเนา)', ' (copy)') });
      tLoad.close();
      toast.success(th('ทำสำเนาแล้ว', 'Duplicated'));
      location.hash = `#/trip/${newId}/dashboard`;
    } catch (e) { tLoad.close(); toast.error(e.message); }
  });

  bind('del-trip', 'click', async () => {
    const ok = await confirmAction({
      title: th(`ลบทริป "${trip?.name}" ?`, `Delete "${trip?.name}"?`),
      message: th('ข้อมูลทั้งหมดของทริปนี้จะถูกลบถาวร รวมถึงแผนการเดินทาง ค่าใช้จ่าย สมาชิก และเอกสาร', 'Everything in this trip will be permanently deleted.'),
      detail: `Trip ID: <b>${escapeHtml(tripId)}</b>`,
      confirmText: th('ลบทริป', 'Delete trip'), danger: true, icon: 'trash-2'
    });
    if (!ok) return;
    const tLoad = toast.loading(th('กำลังลบทริป...', 'Deleting trip...'));
    try {
      const res = await deleteTrip(tripId);
      tLoad.close();
      setTrip(null);
      toast.success(th('ลบทริปแล้ว', 'Trip deleted'));
      if (res?.warnings?.length) toast.warning(th('ลบข้อมูลย่อยบางส่วนไม่สำเร็จ', 'Some sub-data could not be deleted'));
      location.hash = '#/trips';
    } catch (e) { tLoad.close(); toast.error(e.message); }
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
      ${renderPageScene('map', { lang, title: `${icon('more-horizontal', 'w-5 h-5')} ${t('more')}`,
        subtitle: lang === 'th' ? 'เมนูอื่น ๆ ของทริปนี้' : 'Everything else in this trip' })}
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
