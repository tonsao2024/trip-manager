import { bindMoneyInputs } from './utils/moneyInput.js';
import { expensePayments, validatePayments } from './utils/payments.js';
import { auth, db, isFirebaseConfigured, onAuthStateChanged, syncState } from './firebase.js';
import { Router } from './router.js';
import { toast } from './components/toast.js';
import { renderFujiMascot, renderEmptyState } from './components/fuji.js';
import { logout, hasStepUpSession } from './auth/index.js';
import { getMemberSession, clearMemberSession } from './auth/memberAuth.js';
import { runSystemDiagnostics, formatDiagnosticsReport, DIAG } from './utils/diagnostics.js';
import { listTrips, getTrip, createTrip, updateTrip, deleteTrip, duplicateTrip, uploadCoverImage, clearTripsCache, clearAllDataCache, regenerateInviteCode } from './trips/index.js';
import {
  signInWithGoogle, completeRedirectSignIn,
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
import { fetchItinerary, saveItineraryItem, deleteItineraryItem, reorderItinerary, getItineraryItem, updateItineraryItem, syncItineraryExpense, findLinkedExpense } from './itinerary/index.js';
import {
  fetchExpenses, fetchAllExpenses, addExpense, updateExpense, deleteExpense,
  voidExpense, getExpense, exportExpensesToJson, sumExpenses
} from './expenses/index.js';
import { fetchSettlementData, recalculateAndSaveSettlement } from './settlement/index.js';

import { listMembers, createMember, updateMember, deleteMember, countMemberReferences, mapFunctionError, MEMBER_ROLES } from './members/index.js';
import { dayjs, getCurrentTimes, formatDate, formatTime, formatDuration, getTripDays, determineUpNextDay, parseDurationInput } from './utils/date.js';
import { expensesInThb, convertCurrency, formatCurrency, formatAmount, parseCurrencyInput, moneyHtml, thbPlusLabelHtml, origTextChipHtml, getCurrencyDecimals, toMinor, fromMinor, calculateNetTotal, toThbMinor, resolveTripThbRate, rememberThbRate, distributeBudgetEqually, tripCurrencyList } from './utils/currency.js';
import { calculateSettlement, buildSettlementStatements, transactionSources, cardSummary, pendingPayerExpenses } from './utils/settlement.js';
import { splitCustom, splitEqual, participantsOf, averagePerPerson } from './utils/split.js';
import { escapeHtml } from './utils/sanitize.js';
import { APP_VERSION, APP_VERSION_LABEL, APP_UPDATED_ISO, APP_NAME, APP_AUTHOR, APP_NAME_BY, appUpdatedLabel, appUpdatedShort, appBuildLabel, appFooterLabel, copyrightNote } from './utils/buildInfo.js';
import { BRAND, BRAND_PRIMARY, brandPalette, brandPrimary, memberColors as themeMemberColors, dayHues as themeDayHues, memberColorAt, categoryColorChoices } from './utils/brand.js';
import {
  THEMES, DEFAULT_THEME_ID, CUSTOM_THEME_ID, themeName, applyStoredTheme, applyTheme,
  readStoredTheme, saveTheme, themeVars, buildCustomPalette, mix as mixThemeColor, lighten as lightenThemeColor
} from './utils/themes.js';
import { renderFujiBuddy, fujiBuddyMood, fujiBuddyLine } from './components/mascot.js';
import { deckOrder, deckStep, deckSummary, swipeIntent, swipeTilt, swipePeek, swipeHint, deckPositionLabel } from './utils/deck.js';
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
  getAllExpenseCategories, getCategoryDef, isCustomCategory, setCustomCategories,
  categoryChoices, categoryChoiceLabel, expenseGroupForChoice, placeCategoryForExpense
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
import {
  CHECKLIST_TEMPLATES, checklistProgress, checklistsProgress, itemsFromTemplate, mergeTemplateItems,
  sortChecklistItems, listChecklists, createChecklist, updateChecklist, deleteChecklist, saveChecklistItems
} from './prep/index.js';
import {
  IDEA_STATUSES, ideaStatusDef, listIdeas, createIdea, updateIdea, deleteIdea, voteIdea,
  voteInfo, hasVoted, voteCount, sortIdeas, voterNames, ideasBudget, trendingIdeas, toggleVoteMap,
  ideaImages, normalizeIdeaImages,
  listPendingIdeas, flushPendingIdeas, isLocalIdeaId
} from './ideas/index.js';
import {
  GROUP_COLORS, GROUP_ICONS, listGroups, createGroup, updateGroup, deleteGroup,
  nextGroupName, groupBudgetReport, groupMembers, memberGroupBadges, forgetMemberFromGroups,
  itemGroupIds, groupAttendsItem, placesForGroup
} from './members/groups.js';
import {
  RESERVATION_TYPES, reservationTypeDef, listReservations, createReservation, updateReservation,
  deleteReservation, groupReservationsByDate, upcomingReservations, routeLabel,
  reservationToItineraryPayload, durationBetween, reservationWarnings
} from './reservations/index.js';
import { fetchDailyForecast, forecastForDates, forecastLabel, datesBetween, weatherTip, weatherTone, isForecastRelevant, geocodeCity, searchCities } from './utils/weather.js';
import {
  DESTINATIONS, EXPLORE_CATEGORIES, destinationById, destinationPlaces, searchPlaces,
  matchDestinations, exploreCategoryCounts, suggestForTrip, bestTimeLabel, bestTimeIcon,
  suggestedTime, placeToIdeaPayload, placeToPlanDraft, libraryStats
} from './utils/explore.js';
import { parseConfirmationText, draftToReservation, confidenceLabel } from './utils/bookingImport.js';
import {
  buildMonthGrid, shiftMonth, monthShort, defaultMonthFor, tripMonths, itemsForDay,
  calendarSummary, parseISODate
} from './utils/calendarView.js';
import {
  inviteLink, inviteMessage, lineShareUrl, tripSummaryText, itineraryText,
  printPlanUrl, formatCode, appBaseUrl
} from './utils/share.js';
import { buildIcs, downloadIcs, itineraryToEvents, reservationsToEvents } from './utils/ics.js';
import { hasCoords, coordOf, haversineKm } from './utils/route.js';
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
  'hand-coins': 'coins',
  'hand-pointer': 'pointer',
  'calendar-down': 'calendar-arrow-down',
  'mount-snow': 'mountain-snow'
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

// --- Brand / colour themes (v18) -----------------------------------------
// v17 locked the app to one palette; v18 brings the “ชุดสี” picker back — LINE,
// Facebook, Instagram, a dozen more, and a fully custom palette. A theme only
// writes the brand raw variables on <html> (utils/themes.js) and everything else
// is derived with color-mix() in tokens.css, so light mode, dark mode, the map,
// the day pins and the PNG exports all follow along.
/* Palette defaults live in utils/brand.js, the theme list in utils/themes.js. */

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

/**
 * The build identity lives in utils/buildInfo.js. index.html carries the same
 * values so crawlers/preview images see them without JS; keep them in sync here
 * (and a unit test fails if `app-updated` drifts).
 */
function syncBuildMeta() {
  const meta = document.querySelector('meta[name="app-updated"]');
  if (meta && meta.getAttribute('content') !== APP_UPDATED_ISO) meta.setAttribute('content', APP_UPDATED_ISO);
  const version = document.querySelector('meta[name="app-version"]');
  if (version && version.getAttribute('content') !== APP_VERSION) version.setAttribute('content', APP_VERSION);
  paintAppFooter();
}

/**
 * v18: the footer under every page carries the version, the last-updated date, the
 * live palette and the copyright line. The markup ships in index.html so it is
 * readable before the app boots; this pass replaces those static values with the
 * real ones (and keeps them right after a language or palette change).
 */
function paintAppFooter() {
  const lang = getLang();
  const th = (a, b) => (String(lang).startsWith('th') ? a : b);
  const state = (() => { try { return readStoredTheme(); } catch { return { id: DEFAULT_THEME_ID }; } })();
  const palette = themeName(state?.id, lang) || APP_PALETTE;
  const set = (sel, text) => {
    document.querySelectorAll(sel).forEach(el => { if (text) el.textContent = text; });
  };
  set('#app-footer [data-footer-version]', APP_VERSION_LABEL);
  set('#app-footer [data-footer-updated]', `${th('อัปเดตล่าสุด', 'Updated')} ${appUpdatedShort(lang)}`);
  set('#app-footer [data-footer-palette]', `${th('ชุดสี', 'Palette')} ${palette}`);
  set('#app-footer [data-footer-copyright]', copyrightNote(lang));
  const stamp = document.querySelector('#app-footer [data-build-stamp]');
  if (stamp) {
    // Compact chip: “build 2026-10-06”, full label on hover (v18.2 footer redesign).
    stamp.textContent = `build ${APP_UPDATED_ISO}`;
    stamp.title = appBuildLabel(lang, palette);
  }
  const title = document.getElementById('app-title');
  if (title && /Fuji Planner/i.test(title.textContent)) title.textContent = APP_NAME_BY;
}

function updateMetaThemeColor() {
  const meta = document.getElementById('meta-theme-color');
  if (!meta) return;
  const raw = (brandPalette().blue) || getComputedStyle(document.documentElement).getPropertyValue('--primary-raw').trim();
  meta.setAttribute('content', raw || BRAND_PRIMARY);
  // Keep the browser-tab icon colour in sync with the theme (inline SVG favicon).
  const tint = document.getElementById('favicon-tint');
  if (tint) {
    const pal = brandPalette();
    tint.setAttribute('href', `data:image/svg+xml,${encodeURIComponent(faviconSvg(pal.blue || BRAND_PRIMARY, pal.amber || BRAND.yellow))}`);
  }
}

/** Inline favicon so the tab icon follows the active theme. */
function faviconSvg(primary = '#1f6bfb', accent = '#ffb02e') {
  const p = primary || '#1f6bfb';
  const a = accent || '#ffb02e';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${p}"/><stop offset="1" stop-color="${a}"/></linearGradient></defs>
<rect width="64" height="64" rx="16" fill="url(#g)"/>
<circle cx="45" cy="19" r="8" fill="#fff" opacity=".9"/>
<path d="M8 52 L32 16 L56 52 Z" fill="#fff"/>
<path d="M23 34 L32 16 L41 34 L37 38 L32 31 L27 38 Z" fill="${p}" opacity=".45"/>
<rect x="8" y="54" width="48" height="4" rx="2" fill="#fff" opacity=".85"/>
</svg>`;
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

function initTheme() {
  // v18: apply the saved colour theme (LINE / Facebook / Instagram / custom …)
  // before the first paint, then the light/dark mode on top of it.
  try { applyStoredTheme(); } catch (e) { console.warn('[Theme] apply failed', e?.message); }
  document.documentElement.setAttribute('data-theme', resolveMode(getStoredMode()));
  updateMetaThemeColor();
  syncBuildMeta();
  // Defer icon updates until DOM/lucide ready
  setTimeout(() => { updateModeIcons(); renderIcons(); }, 120);
}

/**
 * Paint a theme and tell the app to redraw (map tiles, day colours, exports).
 * @param {string} id theme id ('sky', 'line', 'insta', 'custom', …)
 * @param {object} custom { primary, accent, intensity } for the custom theme
 */
function chooseTheme(id, custom = null, { silent = false } = {}) {
  const state = applyTheme(id, custom);
  saveTheme({ id: state.id, custom: state.custom });
  updateMetaThemeColor();
  document.dispatchEvent(new CustomEvent('themepalette', { detail: { id: state.id } }));
  document.dispatchEvent(new CustomEvent('themechange', { detail: { mode: getStoredMode(), eff: effectiveTheme(), palette: state.id } }));
  renderDesktopNav();
  paintAppFooter();
  if (!silent) {
    const name = themeName(state.id, getLang());
    toast.success(getLang() === 'th' ? `ใช้ชุดสี ${name}` : `${name} palette applied`);
  }
  return state;
}

/** Theme currently in use (id + custom values). */
function currentTheme() {
  try { return readStoredTheme(); } catch { return { id: DEFAULT_THEME_ID, custom: {} }; }
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
// v18 keeps the top bar short: the trip’s core work only. ชวนไปที่นี่ / การจอง /
// เตรียมตัว / ปฏิทิน were taken out of the menu on request, and ตั้งค่า now lives
// behind the profile picture (top-right) instead of in the menu.
function renderDesktopNav() {
  if (!currentTripId) { desktopNavEl.innerHTML = ''; return; }
  const base = `#/trip/${currentTripId}`;
  const currentHash = location.hash.split('?')[0];
  const items = [
    { label: getLang() === 'th' ? 'ทริปทั้งหมด' : 'All Trips', path: '#/trips', icon: 'compass', exact: true },
    { label: t('dashboard'), path: `${base}/dashboard`, icon: 'layout-dashboard' },
    { label: t('itinerary'), path: `${base}/itinerary`, icon: 'map-pinned' },
    { label: t('ideas'), path: `${base}/ideas`, icon: 'lightbulb' },
    { label: t('expenses'), path: `${base}/expenses`, icon: 'wallet' },
    { label: t('settlement'), path: `${base}/settlement`, icon: 'hand-coins' },
    { label: t('members'), path: `${base}/members`, icon: 'users' },
    { label: getLang() === 'th' ? 'เอกสาร' : 'Documents', path: `${base}/documents`, icon: 'folder' },
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
    <button id="header-mode-btn" class="btn btn-ghost btn-icon w-9 h-9" title="Light / Dark / Auto">${icon('sun', 'w-[17px] h-[17px]')}</button>
  `;

  const referenceNode = rightGroup.querySelector('#refresh-btn');
  if (referenceNode && referenceNode.parentElement === rightGroup) rightGroup.insertBefore(controlsDiv, referenceNode);
  else rightGroup.appendChild(controlsDiv);

  document.getElementById('header-mode-btn').onclick = cycleMode;

  updateModeIcons();
  queueIcons();
}

/** Photo or initials for a signed-in account (settings → account card). */
function avatarInitialHtml(user) {
  const name = user?.displayName || user?.email || '';
  if (user?.photoURL) return `<img src="${escapeHtml(user.photoURL)}" class="w-full h-full rounded-full object-cover" alt="">`;
  return escapeHtml(name ? getInitials(name) : '?');
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

/**
 * The profile picture is the ONLY settings entry point (v18): tapping it opens the
 * trip's settings page — and the account card that lives there. Without a trip
 * (e.g. on the trip list) it falls back to the account sheet.
 */
function openAvatarAction(user = currentUser) {
  if (!user) { location.hash = '#/login'; return; }
  if (currentTripId) {
    const target = `#/trip/${currentTripId}/settings`;
    if (location.hash === target) router.handle();
    else location.hash = target;
    return;
  }
  openUserSheet(user);
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
      <button id="appearance-btn" class="btn btn-secondary btn-sm w-full">${icon('sun-moon', 'w-4 h-4')} ${t('appearance')}</button>
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
  document.getElementById('appearance-btn')?.addEventListener('click', () => {
    sheet.close();
    setTimeout(() => showAppearanceSheet(), 220);
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
 * v18: a denied write on the ideas board / prep / reservations is nearly always
 * “the published rules are older than the app”. A bare `permission-denied` toast
 * taught the user nothing, so route those errors to the rules-help sheet instead.
 * Returns true when the help sheet was shown.
 */
async function notifyWriteDenied(e, { action = 'save', fallback = '' } = {}) {
  if (!isPermissionError(e)) return false;
  try {
    await showRulesHelpSheet({ lang: getLang(), action });
    return true;
  } catch {
    toast.error(fallback || th('ไม่มีสิทธิ์บันทึก (Firestore rules)', 'Missing or insufficient permissions'));
    return true;
  }
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
  userAvatarBtn.onclick = () => openAvatarAction(currentUser);
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
      userAvatarBtn.onclick = () => openAvatarAction(user);
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

/* ================================================================== *
 * Appearance & colour themes (v18)
 *   • a grid of ready-made palettes (LINE / Facebook / Instagram / …)
 *   • a “custom” palette: pick the two brand colours + a vividness slider
 *   • light / dark / auto
 * The picker is a plain HTML + bind helper so the sheet and the Settings page
 * can share it. Everything is applied through utils/themes.js → CSS variables.
 * ================================================================== */

function themeSwatchHtml(colors, size = 16) {
  return `<span class="theme-swatch-row">${colors.filter(Boolean).map(c =>
    `<span class="theme-swatch-dot" style="background:${escapeHtml(c)};width:${size}px;height:${size}px;"></span>`).join('')}</span>`;
}

function themePickerHtml({ idPrefix = 'tp', showModes = true } = {}) {
  const lang = getLang();
  const th = (a, b) => (lang === 'th' ? a : b);
  const active = currentTheme();
  const themes = THEMES.filter(t => t.id !== CUSTOM_THEME_ID);
  const cards = themes.map(t => {
    const art = t.gradient || 'linear-gradient(135deg, ' + t.vars['--grad-1'] + ', ' + t.vars['--grad-2'] + ')';
    return `
    <button type="button" class="theme-card ${active.id === t.id ? 'is-active' : ''}" data-theme-id="${t.id}" title="${escapeHtml(lang === 'th' ? t.hint : t.en)}">
      <span class="theme-card-art" style="background:${escapeHtml(art)}">
        <span class="theme-card-fuji" aria-hidden="true"></span>
        ${themeSwatchHtml([t.vars['--brand-yellow-raw'], t.vars['--brand-mist-raw'], t.vars['--brand-steel-raw']], 9)}
      </span>
      <span class="theme-card-name">${escapeHtml(lang === 'th' ? t.th : t.en)}</span>
      <span class="theme-card-check">${icon('check', 'w-3 h-3')}</span>
    </button>`;
  }).join('');
  const pal = brandPalette();
  const custom = active.custom || {};
  return `
    <div class="theme-picker" data-theme-picker="${idPrefix}">
      <div class="theme-section-title">${icon('palette', 'w-3.5 h-3.5')} ${th('ชุดสีของแอป', 'App colour theme')}
        <span class="theme-current-name">${escapeHtml(themeName(active.id, lang))}</span></div>
      <div class="theme-grid">${cards}
        <button type="button" class="theme-card ${active.id === CUSTOM_THEME_ID ? 'is-active' : ''}" data-theme-id="${CUSTOM_THEME_ID}">
          <span class="theme-card-art theme-card-art--custom" style="background:linear-gradient(135deg, ${escapeHtml(custom.primary || '#1f6bfb')}, ${escapeHtml(custom.accent || '#ffb02e')})">
            <span class="theme-card-fuji" aria-hidden="true"></span>
            <span class="theme-card-plus">${icon('sliders-horizontal', 'w-3.5 h-3.5')}</span>
          </span>
          <span class="theme-card-name">${th('กำหนดเอง…', 'Custom')}</span>
          <span class="theme-card-check">${icon('check', 'w-3 h-3')}</span>
        </button>
      </div>

      <div class="theme-custom ${active.id === CUSTOM_THEME_ID ? '' : 'hidden'}" data-theme-custom>
        <div class="theme-custom-row">
          <label class="theme-custom-label">${icon('droplet', 'w-3.5 h-3.5')} ${th('สีหลัก', 'Primary')}
            <input type="color" class="theme-color-input" data-theme-part="primary" value="${escapeHtml(custom.primary || '#1f6bfb')}">
            <input type="text" class="input text-xs theme-hex-input" data-theme-part-hex="primary" value="${escapeHtml(custom.primary || '#1f6bfb')}" maxlength="7" spellcheck="false">
          </label>
          <label class="theme-custom-label">${icon('sparkles', 'w-3.5 h-3.5')} ${th('สีเน้น', 'Accent')}
            <input type="color" class="theme-color-input" data-theme-part="accent" value="${escapeHtml(custom.accent || '#ffb02e')}">
            <input type="text" class="input text-xs theme-hex-input" data-theme-part-hex="accent" value="${escapeHtml(custom.accent || '#ffb02e')}" maxlength="7" spellcheck="false">
          </label>
        </div>
        <label class="theme-custom-slider">${icon('sun', 'w-3.5 h-3.5')} ${th('ความสดใส', 'Vividness')}
          <input type="range" min="0" max="100" step="5" value="${Number(custom.intensity ?? 72)}" data-theme-part="intensity">
          <output class="theme-slider-out">${Number(custom.intensity ?? 72)}%</output>
        </label>
        <div class="theme-preview-card" style="border-color:${escapeHtml(pal.blue)}44;">
          <span class="badge" style="background:${escapeHtml(pal.blue)};color:#fff;">${th('ปุ่ม', 'Button')}</span>
          <span class="badge" style="background:${escapeHtml(pal.amber)};color:#3f2905;">${th('เน้น', 'Accent')}</span>
          <span class="text-xs font-bold">${th('ตัวอย่างการ์ด', 'Preview card')}</span>
          <span class="text-[11px] text-[var(--text-secondary)]">${th('สีพื้นหลัง/การ์ดปรับตามอัตโนมัติ', 'Surfaces follow automatically')}</span>
        </div>
        <div class="btn-row mt-1">
          <button type="button" class="btn btn-ghost btn-sm" data-theme-reset="${DEFAULT_THEME_ID}">${icon('rotate-ccw', 'w-3.5 h-3.5')} ${th('คืนค่าชุดสีเริ่มต้น', 'Reset to Sky light')}</button>
        </div>
      </div>

      ${showModes ? `
      <div class="theme-section-title">${icon('contrast', 'w-3.5 h-3.5')} ${th('โหมดการแสดงผล', 'Light / dark')}</div>
      <div class="mode-grid">
        <button class="mode-option ${getStoredMode() === 'light' ? 'active' : ''}" data-mode="light">${icon('sun', 'w-5 h-5')} ${th('สว่าง', 'Light')}</button>
        <button class="mode-option ${getStoredMode() === 'dark' ? 'active' : ''}" data-mode="dark">${icon('moon', 'w-5 h-5')} ${th('มืด', 'Dark')}</button>
        <button class="mode-option ${getStoredMode() === 'auto' ? 'active' : ''}" data-mode="auto">${icon('monitor', 'w-5 h-5')} Auto</button>
      </div>` : ''}
    </div>`;
}

/** Wire a theme picker rendered by `themePickerHtml()` inside `root`. */
function bindThemePicker(root, { onChange = null } = {}) {
  if (!root) return;
  const lang = getLang();
  const paintActive = () => {
    const active = currentTheme();
    root.querySelectorAll('[data-theme-id]').forEach(btn => btn.classList.toggle('is-active', btn.dataset.themeId === active.id));
    root.querySelector('[data-theme-custom]')?.classList.toggle('hidden', active.id !== CUSTOM_THEME_ID);
    const label = root.querySelector('.theme-current-name');
    if (label) label.textContent = themeName(active.id, lang);
  };

  const readCustom = (patch = {}) => {
    const state = currentTheme();
    // Starting to tweak a preset theme: seed the custom colours from it, so the
    // first tweak only changes the one colour the user touched.
    const cur = state.id === CUSTOM_THEME_ID ? (state.custom || {})
      : { ...state.custom, primary: state.vars?.['--primary-raw'] || (state.custom || {}).primary, accent: state.vars?.['--brand-yellow-raw'] || (state.custom || {}).accent };
    const next = { ...cur, ...patch };
    if (patch.primary === undefined && root.querySelector('[data-theme-part="primary"]')) next.primary = root.querySelector('[data-theme-part="primary"]').value;
    if (patch.accent === undefined && root.querySelector('[data-theme-part="accent"]')) next.accent = root.querySelector('[data-theme-part="accent"]').value;
    if (patch.intensity === undefined && root.querySelector('[data-theme-part="intensity"]')) next.intensity = Number(root.querySelector('[data-theme-part="intensity"]').value);
    return next;
  };

  root.querySelectorAll('[data-theme-id]').forEach(btn => btn.addEventListener('click', () => {
    const id = btn.dataset.themeId;
    chooseTheme(id, id === CUSTOM_THEME_ID ? readCustom() : null);
    paintActive();
    onChange?.('theme', id);
  }));

  root.querySelectorAll('[data-theme-part]').forEach(input => {
    const ev = input.type === 'range' ? 'input' : 'change';
    input.addEventListener(ev, () => {
      const part = input.dataset.themePart;
      const patch = { [part]: part === 'intensity' ? Number(input.value) : input.value };
      if (part === 'intensity') {
        const out = root.querySelector('.theme-slider-out');
        if (out) out.textContent = `${input.value}%`;
      }
      // Tweaking a colour always switches to the custom theme (a preset is fixed).
      const next = readCustom(patch);
      chooseTheme(CUSTOM_THEME_ID, next, { silent: true });
      const hexInput = patch.primary ? root.querySelector('[data-theme-part-hex="primary"]') : (patch.accent ? root.querySelector('[data-theme-part-hex="accent"]') : null);
      if (hexInput && next[hexInput.dataset.themePartHex]) hexInput.value = next[hexInput.dataset.themePartHex];
      paintActive();
      onChange?.('custom', CUSTOM_THEME_ID);
    });
  });

  root.querySelectorAll('[data-theme-part-hex]').forEach(input => {
    input.addEventListener('change', () => {
      const part = input.dataset.themePartHex;
      const val = String(input.value || '').trim();
      if (!/^#[0-9a-fA-F]{6}$/.test(val)) { input.value = currentTheme().custom?.[part] || ''; return; }
      const colorInput = root.querySelector(`[data-theme-part="${part}"]`);
      if (colorInput) colorInput.value = val.toLowerCase();
      chooseTheme(CUSTOM_THEME_ID, readCustom({ [part]: val.toLowerCase() }));
      paintActive();
      onChange?.('custom', CUSTOM_THEME_ID);
    });
  });

  root.querySelector('[data-theme-reset]')?.addEventListener('click', () => {
    chooseTheme(DEFAULT_THEME_ID, null);
    const fresh = buildCustomPalette({});
    const primary = root.querySelector('[data-theme-part="primary"]');
    const accent = root.querySelector('[data-theme-part="accent"]');
    if (primary) primary.value = fresh['--primary-raw'];
    if (accent) accent.value = fresh['--brand-yellow-raw'];
    paintActive();
    onChange?.('theme', DEFAULT_THEME_ID);
  });

  root.querySelectorAll('.mode-option').forEach(btn => btn.addEventListener('click', () => {
    applyMode(btn.dataset.mode, { silent: true });
    root.querySelectorAll('.mode-option').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    paintActive();
    onChange?.('mode', btn.dataset.mode);
    const eff = effectiveTheme();
    toast.success(btn.dataset.mode === 'auto' ? `อัตโนมัติ (${eff === 'dark' ? 'มืด' : 'สว่าง'})` : (eff === 'dark' ? 'ธีมกลางคืน' : 'ธีมสว่าง'));
  }));
  paintActive();
}

/**
 * Appearance sheet — the colour theme, the light/dark mode and nothing else.
 * Reached from the profile picture (Settings) and from the account sheet.
 */
function showAppearanceSheet() {
  const lang = getLang();
  const sheet = showBottomSheet(`
    <div class="flex items-center gap-3 mb-1">
      <div class="row-icon" style="width:40px;height:40px;border-radius:14px;background:var(--gradient-primary);color:#fff;">${icon('palette', 'w-5 h-5')}</div>
      <div>
        <h3 class="font-bold text-lg leading-tight" style="font-family: var(--font-display);">${t('appearance')}</h3>
        <p class="text-xs text-[var(--text-secondary)]">${lang === 'th' ? 'เลือกชุดสีที่ชอบ แล้วปรับต่อเองได้' : 'Pick a palette — then fine-tune it yourself'}</p>
      </div>
    </div>
    <div class="mt-3">${themePickerHtml({ idPrefix: 'sheet' })}</div>
    <button class="btn btn-primary w-full mt-5" id="theme-done">${icon('check', 'w-4 h-4')} ${lang === 'th' ? 'เสร็จสิ้น' : 'Done'}</button>
  `);
  updateModeIcons();
  queueIcons();
  bindThemePicker(sheet.sheet, { onChange: () => { if (location.hash.includes('/dashboard')) router.handle(); } });
  document.getElementById('theme-done')?.addEventListener('click', () => {
    sheet.close();
    // redraw the current page so JS-side colours (day pins, avatars) refresh
    setTimeout(() => { try { router.handle(); } catch { /* ignore */ } }, 60);
  });
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
  { path: '/trip/:tripId/prep', handler: renderPrep },
  { path: '/trip/:tripId/ideas', handler: renderIdeas },
  { path: '/trip/:tripId/bookings', handler: renderBookings },
  { path: '/trip/:tripId/members', handler: renderMembers },
  { path: '/trip/:tripId/documents', handler: renderDocuments },
  { path: '/trip/:tripId/import', handler: renderImportExport },
  { path: '/trip/:tripId/export', handler: renderImportExport },
  { path: '/trip/:tripId/settings', handler: renderSettings },
  { path: '/trip/:tripId/explore', handler: renderExplore },
  { path: '/trip/:tripId/calendar', handler: renderCalendar },
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
initOfflineStrip();

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
            <button id="login-dark" class="chip text-xs" data-mode-current></button>
          </div>
        </div>

        <div class="card card-accent p-7 space-y-4">
          <!-- Google-only sign-in -->
          <button id="google-signin-btn" class="btn btn-google w-full btn-lg">
            <svg viewBox="0 0 48 48" class="w-5 h-5" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
            เข้าสู่ระบบด้วยบัญชี Google
          </button>

          <div class="login-steps">
            <div class="login-step"><span class="step-num">1</span><span>กดปุ่มด้านบน แล้วเลือกบัญชี Google ของคุณ</span></div>
            <div class="login-step"><span class="step-num">2</span><span>ขอรหัสเชิญทริปจากแอดมิน แล้วกดเข้าร่วม</span></div>
            <div class="login-step"><span class="step-num">3</span><span>เริ่มวางแผนทริปด้วยกันได้เลย</span></div>
          </div>

          <p class="text-[11px] text-center text-[var(--text-tertiary)] leading-relaxed">
            สมาชิกใช้บัญชี Google ของตัวเองได้ — แอดมินทริปเป็นคนอนุมัติให้เข้าร่วมแต่ละทริป
          </p>
        </div>

        <p class="build-stamp text-center" data-build-stamp>
          ${icon('info', 'w-3 h-3')} ${escapeHtml(appBuildLabel(lang))}
        </p>
        </div>
      </div>
    </div>
  `;
  queueIcons();
  updateModeIcons();

  document.getElementById('login-dark').onclick = cycleMode;

  // ---- Google-only sign-in ----
  appEl.querySelector('#google-signin-btn').onclick = async (e) => {
    const btn = e.currentTarget;
    const originalHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `${spinner('w-5 h-5')} กำลังเปิด Google...`;
    queueIcons();
    try {
      const user = await signInWithGoogle(true);
      // null = we were redirected to Google and will come back here
      if (!user) return;
      toast.success(`ยินดีต้อนรับ ${user.displayName || user.email}`);
      location.hash = '#/trips';
    } catch (err) {
      toast.error(err.message || 'เข้าสู่ระบบด้วย Google ไม่สำเร็จ');
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
  const currencyOptions = (selected) => tripCurrencyList(trip).map(c => `<option value="${c}" ${selected === c ? 'selected' : ''}>${c}</option>`).join('');

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

        <button id="tf-submit" type="submit" class="btn btn-primary w-full">${icon(isEdit ? 'save' : 'plus', 'w-4 h-4')} ${isEdit ? t('save') : t('createTrip')}</button>
        ${isEdit ? `<div class="flex gap-2">
          <button type="button" id="tf-delete" class="btn flex-1" style="background: var(--danger-bg); color: var(--danger); border:1.5px solid color-mix(in srgb, var(--danger) 35%, transparent);">${icon('trash-2', 'w-4 h-4')} ${lang==='th' ? 'ลบทริปนี้' : 'Delete trip'}</button>
          <button type="button" id="tf-duplicate" class="btn btn-secondary flex-1">${icon('copy', 'w-4 h-4')} ${lang==='th' ? 'ทำสำเนาทริป' : 'Duplicate'}</button>
        </div>` : ''}
      </form>
    </div>
  `);
  queueIcons();

  const previewImg = document.getElementById('cover-img');
  const previewContainer = document.getElementById('cover-preview');
  const coverInfo = document.getElementById('cover-info');
  const dropzone = document.getElementById('cover-dropzone');
  const fileInput = document.getElementById('tf-cover');
  const coverUrlInput = document.getElementById('tf-cover-url');
  const cropperContainer = document.getElementById('cover-cropper-container');
  const cropperWrapper = document.getElementById('cropper-wrapper');

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
        themeColor: brandPrimary(), // kept in the schema for older exports
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
        <div class="w-12 h-12 rounded-2xl overflow-hidden flex-shrink-0" style="background: var(--gradient-primary);">
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
    const baseColor = 'var(--primary-raw)';
    const c = computeCountdown({ startDate: trip.startDate, endDate: trip.endDate, createdAt: trip.createdAt });
    const countdownText = trip.startDate
      ? (c.phase === 'before' ? (lang==='th' ? `อีก ${c.days} วัน` : `${c.days} days`) : (c.phase === 'during' ? (lang==='th' ? 'กำลังเดินทาง' : 'On trip') : (lang==='th' ? 'ผ่านมาแล้ว' : 'Past')))
      : '';
    return `
      <div class="card card-hover p-0 overflow-hidden cursor-pointer group trip-card" data-trip="${trip.id}" style="animation-delay: ${idx * 0.06}s" role="button" tabindex="0" aria-label="${escapeHtml(trip.name)}">
        <div class="${compact ? 'h-28' : 'h-36'} relative overflow-hidden" style="background: linear-gradient(135deg, var(--primary-raw), color-mix(in srgb, var(--primary-raw) 45%, var(--brand-yellow-raw)));">
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
    <div class="page-enter space-y-5" id="dashboard-view">
      <!-- HERO -->
      <div class="hero-card" style="--hero-color:var(--primary-raw);">
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
              <button id="dash-density-btn" class="btn btn-sm" style="background:rgba(255,255,255,.92);color:#333;border-color:transparent;" title="สลับมุมมองกะทัดรัด/ปกติ">${icon('rows-3', 'w-4 h-4')} <span data-density-label>มุมมองกะทัดรัด</span></button>
            </div>
          </div>
        </div>
      </div>

      <!-- COUNTDOWN ANIMATION -->
      <div class="card p-4 md:p-5">
        <div class="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <h3 class="font-bold flex items-center gap-2"><span class="row-icon" style="width:30px;height:30px;border-radius:10px;background:var(--primary-light);color:var(--primary-strong);">${icon('timer', 'w-4 h-4')}</span> ${t('countdown')}</h3>
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

        <!-- TEAMS live inside the wallet now: per-team cost per person + team total -->
        <div class="dash-subhead">
          <h4>
            <span class="row-icon" style="width:26px;height:26px;border-radius:9px;">${icon('users-round', 'w-3.5 h-3.5')}</span>
            ${th('ทีม • ค่าใช้จ่ายต่อคน / รวมทีม','Teams • cost per person / per team')}
          </h4>
          <button id="dash-teams-link" class="btn btn-ghost btn-sm text-xs">${icon('settings-2', 'w-3.5 h-3.5')} ${th('จัดการทีม','Manage teams')}</button>
        </div>
        <div id="team-board" class="team-board"><div class="skeleton h-16"></div></div>
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

      <!-- MEMBERS + RECENT share one row on desktop (no more full-width sparse cards) -->
      <div class="grid lg:grid-cols-2 gap-4 items-start">
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

      <!-- TRIP TOOLS (v16): prep progress • weather • next booking • top ideas -->
      <div id="dash-tools" class="space-y-5"></div>
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
  bind('dash-teams-link', 'click', () => { location.hash = `#/trip/${tripId}/members`; });

  // Dashboard density: comfortable (default) vs compact — remembered per device.
  const DASH_DENSITY_KEY = 'fuji_dash_density';
  const isDashCompact = () => { try { return localStorage.getItem(DASH_DENSITY_KEY) === 'compact'; } catch { return false; } };
  function applyDashDensity() {
    const compact = isDashCompact();
    document.getElementById('dashboard-view')?.classList.toggle('dash-compact', compact);
    const btn = document.getElementById('dash-density-btn');
    if (btn) {
      btn.classList.toggle('is-active', compact);
      const label = btn.querySelector('[data-density-label]');
      if (label) label.textContent = compact ? 'มุมมองปกติ' : 'มุมมองกะทัดรัด';
    }
  }
  bind('dash-density-btn', 'click', () => {
    try { localStorage.setItem(DASH_DENSITY_KEY, isDashCompact() ? 'comfortable' : 'compact'); } catch {}
    applyDashDensity();
  });
  applyDashDensity();

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
  let expenses = [], members = [], items = [], groups = [];

  // Trip groups, money and the itinerary are independent — fetch them together
  // (all of them are served from cache on a revisit, so this is instant).
  const [categoriesRes, dataRes, itemsRes, groupsRes] = await Promise.allSettled([
    loadTripCategories(tripId),
    fetchSettlementData(tripId),
    fetchItinerary(tripId, null),
    listGroups(tripId)
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
  if (groupsRes.status === 'fulfilled') groups = groupsRes.value || [];
  else console.warn('dashboard groups failed', groupsRes.reason);

  if (isStale(token)) return;

  try {
    renderDashboardData({ tripId, trip, expenses, members, items, groups, currency, lang, token, params });
  } catch (e) {
    console.error('dashboard render failed', e);
    toast.error(th('โหลด Dashboard ไม่สำเร็จ: ', 'Dashboard error: ') + e.message);
    const grid = document.getElementById('dashboard-grid') || document.getElementById('category-stats');
    if (grid) grid.innerHTML = `<div class="col-span-full card p-5 text-center"><p class="text-sm font-semibold" style="color:var(--danger);">${escapeHtml(e.message)}</p><button id="dash-retry" class="btn btn-secondary btn-sm mt-3">${icon('refresh-cw', 'w-4 h-4')} ${th('ลองใหม่','Retry')}</button></div>`;
    bind('dash-retry', 'click', () => router.handle());
    queueIcons();
  }
}

function renderDashboardData({ tripId, trip, expenses, members, items, groups = [], currency, lang, token, params }) {
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
  const budgetCur = trip?.budgetCurrency || 'THB';
  const budget = budgetCur === 'THB' ? budgetBase : (toThbMinor(budgetBase, budgetCur, rate) || 0);
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
  const myBudget = budgetCur === 'THB' ? myBudgetBase : (toThbMinor(myBudgetBase, budgetCur, rate) || 0);
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
    <div class="flex gap-3 py-2.5 border-b last:border-0 items-center dash-clickable dash-upnext" data-ui="${idx}" style="border-color:var(--border);" title="${th('กดเพื่อดูรายละเอียด','Tap for details')}">
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

  /* ---- Category stats: EVERY category the system knows, spend or not ---- */
  const byCategory = {};
  // Seed with every group (built-in + this trip's custom ones) so the board
  // always lists the full system, even categories with no expenses yet.
  getAllExpenseCategories().forEach(c => { byCategory[c.id] = { actual: 0, estimate: 0, count: 0 }; });
  expenses.forEach(e => {
    const cat = e.category || 'general';
    if (!byCategory[cat]) byCategory[cat] = { actual: 0, estimate: 0, count: 0 };
    if (e.isEstimated) byCategory[cat].estimate += e.netTotalMinor || 0;
    else byCategory[cat].actual += e.netTotalMinor || 0;
    byCategory[cat].count++;
  });
  // Spent categories first (biggest → smallest), the empty ones keep system order.
  const catEntries = Object.entries(byCategory).sort((a, b) => {
    const ta = a[1].actual + a[1].estimate;
    const tb = b[1].actual + b[1].estimate;
    if (ta !== tb) return tb - ta;
    if (a[1].count !== b[1].count) return b[1].count - a[1].count;
    return 0;
  });
  const catMax = Math.max(1, ...catEntries.map(([, v]) => v.actual + v.estimate));
  const grand = catEntries.reduce((s, [, v]) => s + v.actual + v.estimate, 0) || 1;
  const spentCats = catEntries.filter(([, v]) => v.actual + v.estimate > 0).length;
  setHtml('category-stats', catEntries.length ? `
    <p class="text-[10px] text-[var(--text-tertiary)] mb-1">${icon('layout-grid', 'w-3 h-3 inline')} ${th(`ครบทุกหมวดในระบบ`, 'All categories in the system')} • ${spentCats}/${catEntries.length} ${th('หมวดมีรายจ่าย', 'with spending')}</p>
    ${catEntries.map(([cat, v]) => {
    const total = v.actual + v.estimate;
    const pct = Math.round((total / grand) * 100);
    const empty = !total;
    return `
      <div class="py-2" style="${empty ? 'opacity:.62;' : ''}">
        <div class="flex justify-between items-center text-sm gap-2">
          <span class="meta-line truncate">${icon(categoryIcon(cat), 'w-3.5 h-3.5')} ${escapeHtml(categoryLabel(cat, lang))} <span class="text-[10px] text-[var(--text-tertiary)]">• ${v.count}</span></span>
          <span class="font-bold flex-shrink-0">${fmt(total)} <span class="text-[10px] font-normal text-[var(--text-tertiary)]">${pct}%</span>${thbTag(total)}</span>
        </div>
        <div class="progress mt-1.5" style="height:6px;">
          <div class="progress-bar progress-striped" style="width:${empty ? 0 : Math.max(3, Math.round(total / catMax * 100))}%; background:${categoryColor(cat)};"></div>
        </div>
        ${v.estimate ? `<div class="text-[10px] text-[var(--text-tertiary)] mt-0.5">${icon('hourglass', 'w-3 h-3 inline')} ${th('ประมาณการ','est.')} ${fmt(v.estimate)}${v.actual ? ` • ${th('จ่ายจริง','actual')} ${fmt(v.actual)}` : ''}</div>` : (empty ? `<div class="text-[10px] text-[var(--text-tertiary)] mt-0.5">${th('ยังไม่มีรายการ','No expenses yet')}</div>` : '')}
      </div>`;
  }).join('')}` : `<p class="text-sm text-[var(--text-secondary)]">${t('noData')}</p>`);

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

  /* ---- Teams (trip sub-groups): cost per person + team total (a request) ----
     Each team shows what its members were charged in total and what that means
     per person, next to the whole trip so the two can be compared at a glance.
     The place count comes from the per-place group picker (“แต่ละสถานที่มีกลุ่ม
     ไหนไปบ้าง”), which is the plan → money link. */
  try {
    const teamBox = document.getElementById('team-board');
    if (teamBox) {
      if (!groups.length) {
        teamBox.innerHTML = `
          <div class="team-empty">
            ${icon('users-round', 'w-5 h-5')}
            <p class="font-semibold text-[12.5px]">${th('ยังไม่มีทีมในทริปนี้','No teams in this trip yet')}</p>
            <p class="text-[11px] text-[var(--text-secondary)]">${th('สร้างกลุ่มย่อย (ทีม) ที่หน้าสมาชิก แล้วแต่ละทีมจะถูกคำนวณค่าใช้จ่ายต่อคน / รวมทีมให้อัตโนมัติ','Create sub-groups (teams) on the Members page and each team’s cost per person / team total is calculated for you')}</p>
            <button id="team-empty-btn" class="btn btn-secondary btn-sm">${icon('plus', 'w-4 h-4')} ${th('ไปสร้างทีม','Create a team')}</button>
          </div>`;
        bind('team-empty-btn', 'click', () => { location.hash = `#/trip/${tripId}/members`; });
      } else {
        const report = groupBudgetReport(groups, expenses, members);
        const perPersonTrip = report.trip.perPersonMinor;
        const teamCard = (g) => {
          const delta = g.perPersonMinor - perPersonTrip;
          const places = placesForGroup(g.id, items).length;
          return `
            <article class="team-card" style="--team-color:${escapeHtml(g.color)};">
              <div class="team-card-head">
                <span class="team-card-name" style="color:${escapeHtml(g.color)};">${icon(g.icon || 'users', 'w-4 h-4')} ${escapeHtml(g.name)}</span>
                <span class="badge badge-planned text-[10px] ml-auto">${icon('users', 'w-2.5 h-2.5')} ${g.memberCount} ${th('คน','pax')}</span>
              </div>
              ${g.note ? `<p class="team-card-note">${escapeHtml(g.note)}</p>` : ''}
              <div class="team-stats">
                <div class="team-stat">
                  <span class="team-stat-label">${th('เฉลี่ย / คน','Per person')}</span>
                  <b>${fmt(g.perPersonMinor)}</b>
                  ${delta ? `<span class="team-delta ${delta > 0 ? 'is-over' : 'is-under'}">${delta > 0 ? '▲' : '▼'} ${fmt(Math.abs(delta))} ${th('เทียบทริป','vs trip')}</span>` : `<span class="team-delta">${th('เท่าค่าเฉลี่ยทริป','on the trip average')}</span>`}
                </div>
                <div class="team-stat">
                  <span class="team-stat-label">${th('รวมทีม','Team total')}</span>
                  <b>${fmt(g.shareMinor)}</b>
                  <span class="team-delta">${th('จ่ายไป','paid')} ${fmt(g.paidMinor)}</span>
                </div>
              </div>
              <div class="team-facts">
                <span>${icon('map-pinned', 'w-3 h-3')} ${places} ${th('สถานที่','places')}</span>
                <span>${icon('receipt', 'w-3 h-3')} ${g.itemCount} ${th('รายการ','items')}</span>
                <span>${icon('scale', 'w-3 h-3')} ${g.netMinor >= 0 ? th('รอรับคืน','owed') : th('ต้องจ่ายเพิ่ม','owes')} ${fmt(Math.abs(g.netMinor))}</span>
              </div>
              <div class="team-members">
                ${g.members.length ? g.members.map(m => `
                  <span class="team-member-chip"><span class="avatar w-5 h-5 text-[9px]" style="background:${escapeHtml(m.color || 'var(--primary)')};width:20px;height:20px;">${m.photoURL ? `<img src="${escapeHtml(m.photoURL)}" class="w-full h-full rounded-full object-cover" alt="">` : escapeHtml(getInitials(m.displayName))}</span>${escapeHtml((m.displayName || '').split(' ')[0])}</span>`).join('')
                  : `<span class="team-card-note">${th('ยังไม่ได้เลือกสมาชิก','No members picked yet')}</span>`}
              </div>
            </article>`;
        };
        teamBox.innerHTML = report.groups.map(teamCard).join('') + `
          <article class="team-card team-card--trip">
            <div class="team-card-head">
              <span class="team-card-name">${icon('users', 'w-4 h-4')} ${th('ทั้งทริป','Whole trip')}</span>
              <span class="badge badge-planned text-[10px] ml-auto">${report.trip.memberCount} ${th('คน','pax')}</span>
            </div>
            <div class="team-stats">
              <div class="team-stat">
                <span class="team-stat-label">${th('เฉลี่ย / คน','Per person')}</span>
                <b>${fmt(report.trip.perPersonMinor)}</b>
                <span class="team-delta">${th('ฐานเปรียบเทียบ','comparison base')}</span>
              </div>
              <div class="team-stat">
                <span class="team-stat-label">${th('รวมทั้งทริป','Trip total')}</span>
                <b>${fmt(report.trip.shareMinor)}</b>
                <span class="team-delta">${th('จ่ายไป','paid')} ${fmt(report.trip.paidMinor)}</span>
              </div>
            </div>
            ${report.ungrouped.length ? `<div class="team-facts"><span>${icon('user-plus', 'w-3 h-3')} ${th('ยังไม่อยู่ในทีม','Not in a team')}: ${report.ungrouped.map(m => escapeHtml(m.displayName || '')).join(', ')}</span></div>` : ''}
          </article>`;
      }
      queueIcons();
    }
  } catch (e) {
    console.warn('team board failed', e?.message);
  }

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
  /* ---- Dashboard inspection popups: every tile/row that pulls transactions
     opens a detail popup with links to the related page. ---- */
  const dashRow = (label, value, sub = '') => `
    <div class="dash-pop-kv"><span>${label}</span><b>${value}</b>${sub}</div>`;
  function openDashPopup({ icon: ic = 'info', title = '', subtitle = '', body = '', links = [] }) {
    const sheet = showBottomSheet(`
      <div class="space-y-3">
        <div class="flex items-start gap-3">
          <div class="row-icon" style="width:42px;height:42px;border-radius:14px;background:var(--gradient-primary);color:#fff;flex-shrink:0;">${icon(ic, 'w-5 h-5')}</div>
          <div class="min-w-0 flex-1">
            <h3 class="font-bold text-base leading-tight" style="font-family: var(--font-display);">${title}</h3>
            ${subtitle ? `<p class="text-xs text-[var(--text-secondary)] mt-0.5">${subtitle}</p>` : ''}
          </div>
        </div>
        ${body}
        ${links.length ? `<div class="grid gap-2">${links.map((l, k) => `
          <button class="btn ${l.primary ? 'btn-primary' : 'btn-secondary'} w-full justify-start" data-dl="${k}">${icon(l.icon || 'arrow-right', 'w-4 h-4')} ${l.label}</button>`).join('')}</div>` : ''}
      </div>
    `);
    queueIcons();
    sheet.sheet.querySelectorAll('[data-dl]').forEach(btn => btn.addEventListener('click', () => {
      const l = links[Number(btn.dataset.dl)];
      sheet.close();
      if (l?.hash) location.hash = l.hash;
      else if (typeof l?.onClick === 'function') l.onClick();
    }));
    // Expense rows inside a popup jump straight to that expense.
    sheet.sheet.querySelectorAll('[data-pop-exp]').forEach(btn => btn.addEventListener('click', () => {
      sheet.close();
      location.hash = `#/trip/${tripId}/expenses/add?id=${btn.dataset.popExp}`;
    }));
    return sheet;
  }
  const dashExpRow = (e) => {
    const payers = expensePayments(e).map(p => membersMap[p.memberId]?.displayName || '').filter(Boolean).join(', ');
    return `<button class="dash-pop-row" data-pop-exp="${e.id}">
      <span class="row-icon" style="width:30px;height:30px;border-radius:10px;background:color-mix(in srgb, ${categoryColor(e.category)} 18%, transparent);color:${categoryColor(e.category)};">${icon(categoryIcon(e.category), 'w-3.5 h-3.5')}</span>
      <span class="min-w-0 flex-1 text-left">
        <span class="block text-xs font-bold truncate">${escapeHtml(e.title || '')}</span>
        <span class="block text-[10px] text-[var(--text-tertiary)]">${escapeHtml(e.date || '')}${payers ? ` • ${escapeHtml(payers)}` : ''}${e.isEstimated ? ` • ${th('ประมาณการ','est.')}` : ''}</span>
      </span>
      <b class="text-xs flex-shrink-0">${escapeHtml(formatCurrency(e.netTotalMinor || 0, e.currency || currency))}</b>
    </button>`;
  };
  const dashExpList = (list, emptyTh = 'ไม่มีรายการในช่วงนี้', emptyEn = 'No items here') =>
    list.length
      ? `<div class="dash-pop-list">${list.map(dashExpRow).join('')}</div>`
      : `<p class="text-xs text-[var(--text-tertiary)]">${th(emptyTh, emptyEn)}</p>`;
  const byDateDesc = (a, b) => String(b.date || '').localeCompare(String(a.date || ''));

  // KPI tiles → breakdown popups.
  document.querySelectorAll('.kpi-tile[data-kpi]').forEach(tile => {
    tile.classList.add('dash-clickable');
    tile.setAttribute('title', th('กดเพื่อดูรายละเอียด', 'Tap for details'));
    tile.addEventListener('click', (ev) => {
      if (ev.target.closest('button, a')) return; // inner actions keep their job
      const kind = tile.dataset.kpi;
      if (kind === 'total') {
        const top = Object.entries(byCategory)
          .map(([cat, v]) => ({ cat, total: v.actual + v.estimate }))
          .filter(x => x.total > 0).sort((a, b) => b.total - a.total).slice(0, 3);
        openDashPopup({
          icon: 'wallet', title: th('ยอดใช้จ่ายรวม', 'Total spending'),
          subtitle: th(`${expenses.length} รายการ • แตะแถวเพื่อดูค่าใช้จ่าย`, `${expenses.length} items • tap a row to open it`),
          body: `<div class="dash-pop-card">
              ${dashRow(`${icon('check-circle', 'w-3.5 h-3.5')} ${th('จ่ายจริง','Actual')}`, fmt(actualMinor))}
              ${dashRow(`${icon('hourglass', 'w-3.5 h-3.5')} ${th('ประมาณการ','Estimated')}`, fmt(estimatedMinor))}
              ${dashRow(`${icon('user', 'w-3.5 h-3.5')} ${th('ส่วนของฉัน','My share')}`, fmt(myShare))}
              ${top.length ? `<div class="dash-pop-sub">${th('หมวดที่ใช้มากสุด','Top categories')}</div>` + top.map(x => dashRow(`${icon(categoryIcon(x.cat), 'w-3.5 h-3.5')} ${escapeHtml(categoryLabel(x.cat, lang))}`, fmt(x.total))).join('') : ''}
            </div>
            ${dashExpList([...originalExpenses].sort(byDateDesc).slice(0, 5))}`,
          links: [
            { label: th('ดูค่าใช้จ่ายทั้งหมด', 'View all expenses'), hash: `#/trip/${tripId}/expenses`, icon: 'wallet', primary: true },
            { label: th('ไปเคลียร์บิล', 'Go to settlement'), hash: `#/trip/${tripId}/settlement`, icon: 'hand-coins' }
          ]
        });
      } else if (kind === 'budget') {
        openDashPopup({
          icon: 'piggy-bank', title: th('งบประมาณทริป', 'Trip budget'),
          body: budget > 0 ? `<div class="dash-pop-card">
              ${dashRow(th('งบทั้งหมด','Budget'), fmt(budget))}
              ${dashRow(th('ใช้ไป','Used'), `${fmt(totalMinor)} • ${Math.min(100, Math.round((totalMinor / budget) * 100))}%`)}
              ${dashRow(th('คงเหลือ','Left'), fmt(Math.max(0, budget - totalMinor)))}
            </div>` : `<p class="text-sm text-[var(--text-secondary)]">${th('ยังไม่ได้ตั้งงบ — ตั้งงบรวม งบต่อคน หรืองบรายคนได้ที่หน้าตั้งค่า','No budget yet — set a trip, per-person or per-member budget in Settings.')}</p>`,
          links: [{ label: th('ตั้งงบประมาณ', 'Set budget'), hash: `#/trip/${tripId}/settings`, icon: 'settings-2', primary: true }]
        });
      } else if (kind === 'balance') {
        const myTx = (settlement.transactions || []).filter(tx => tx.from === myId || tx.to === myId);
        openDashPopup({
          icon: 'scale', title: th('ยอดของฉัน', 'My balance'),
          body: `<div class="dash-pop-card">
              ${dashRow(th('สุทธิ (ได้รับคืน + / ต้องจ่าย −)','Net (+ gets back / − pays)'), `<span style="color:${myNet >= 0 ? 'var(--success)' : 'var(--danger)'};">${fmt(myNet)}</span>`)}
              ${dashRow(th('สำรองจ่ายไป','I fronted'), fmt(myPaid))}
              ${dashRow(th('ส่วนที่ต้องรับผิดชอบ','My share'), fmt(myShare))}
              ${dashRow(th('รายการเคลียร์ที่เกี่ยวกับฉัน','My settlements'), `${myTx.length} ${th('รายการ','items')}`)}
            </div>`,
          links: [
            { label: th('ไปเคลียร์บิล', 'Go to settlement'), hash: `#/trip/${tripId}/settlement`, icon: 'hand-coins', primary: true },
            { label: th('ดูค่าใช้จ่ายทั้งหมด', 'View all expenses'), hash: `#/trip/${tripId}/expenses`, icon: 'wallet' }
          ]
        });
      } else if (kind === 'plan') {
        openDashPopup({
          icon: 'map-pinned', title: th('แผนการเดินทาง', 'Itinerary'),
          body: `<div class="dash-pop-card">
              ${dashRow(th('สถานที่ทั้งหมด','Places'), `${items.length}`)}
              ${dashRow(th('จำนวนวัน','Days'), `${getTripDays(trip?.startDate, trip?.endDate).length}`)}
              ${dashRow(th('สมาชิก','People'), `${members.length}`)}
              ${dashRow(th('มีพิกัดบนแผนที่','Mapped'), `${withCoord}`)}
            </div>`,
          links: [
            { label: th('ดูแผนการเดินทาง', 'View itinerary'), hash: `#/trip/${tripId}/itinerary`, icon: 'map-pinned', primary: true },
            { label: t('addPlace'), hash: `#/trip/${tripId}/itinerary?action=add`, icon: 'plus' }
          ]
        });
      }
    });
  });

  // My wallet tiles → the same numbers, explained.
  document.querySelectorAll('#my-wallet .my-wallet-tile').forEach((tile, wi) => {
    tile.classList.add('dash-clickable');
    tile.setAttribute('title', th('กดเพื่อดูรายละเอียด', 'Tap for details'));
    tile.addEventListener('click', (ev) => {
      if (ev.target.closest('button, a')) return;
      const conf = [
        { icon: 'globe', title: th('ยอดทริปรวม', 'Trip total'), rows: [[th('ทุกคนทุกใบรวมกัน','Everyone, all bills'), fmt(totalMinor)]] },
        { icon: 'user', title: th('ยอดของฉัน', 'My total'), rows: [[th('ส่วนที่ต้องรับผิดชอบ','My share'), fmt(myShare)], [th('สำรองจ่ายไป','I fronted'), fmt(myPaid)]] },
        { icon: 'scale', title: th('คงเหลือของฉัน', 'My balance'), rows: [[myNet >= 0 ? th('จะได้รับคืน','Gets back') : th('ต้องจ่ายคืน','Owes'), fmt(Math.abs(myNet))]] },
        { icon: 'piggy-bank', title: th('งบของฉัน', 'My budget'), rows: myBudget > 0 ? [[th('งบ','Budget'), fmt(myBudget)], [th('ใช้ไป','Used'), `${myPct}%`], [myLeft >= 0 ? th('เหลือ','Left') : th('เกินงบ','Over'), fmt(Math.abs(myLeft))]] : [[th('สถานะ','Status'), th('ยังไม่ได้ตั้งงบ','No budget yet')]] }
      ][wi] || { icon: 'info', title: '', rows: [] };
      openDashPopup({
        icon: conf.icon, title: conf.title,
        body: `<div class="dash-pop-card">${conf.rows.map(([a, b]) => dashRow(a, b)).join('')}</div>`,
        links: wi === 3
          ? [{ label: th('ตั้งงบของฉัน', 'Set my budget'), hash: `#/trip/${tripId}/settings`, icon: 'settings-2', primary: true }]
          : [
            { label: th('ไปเคลียร์บิล', 'Go to settlement'), hash: `#/trip/${tripId}/settlement`, icon: 'hand-coins', primary: true },
            { label: th('ดูค่าใช้จ่ายทั้งหมด', 'View all expenses'), hash: `#/trip/${tripId}/expenses`, icon: 'wallet' }
          ]
      });
    });
  });

  // Current activity → the live item, inspected.
  document.getElementById('current-activity')?.classList.add('dash-clickable');
  document.getElementById('current-activity')?.addEventListener('click', () => {
    const live = current || nextItem || items.find(i => i.date >= todayStr);
    if (!live) {
      openDashPopup({
        icon: 'coffee', title: t('currentActivity'),
        body: `<p class="text-sm text-[var(--text-secondary)]">${th('ยังไม่มีแผนสำหรับวันนี้','No plans for today')}</p>`,
        links: [{ label: t('addPlace'), hash: `#/trip/${tripId}/itinerary?action=add`, icon: 'plus', primary: true }]
      });
      return;
    }
    openDashPopup({
      icon: 'target', title: live.title || t('currentActivity'),
      subtitle: `${formatDate(live.date, lang, trip?.timezone)} • ${formatTime(live.startAt, trip?.timezone)} – ${formatTime(live.endAt, trip?.timezone)}`,
      body: `<div class="dash-pop-card">
          ${live.address ? dashRow(th('สถานที่','Place'), escapeHtml(live.address)) : ''}
          ${dashRow(th('หมวด','Category'), escapeHtml(categoryLabel(live.category || 'general', lang)))}
          ${Number(live.estimateAmount) > 0 ? dashRow(th('ประมาณการ','Estimated'), escapeHtml(formatCurrency(toMinor(Number(live.estimateAmount), getCurrencyDecimals(live.estimateCurrency || currency)), live.estimateCurrency || currency))) : ''}
        </div>`,
      links: [{ label: th('ดูแผนของวันนี้', 'See this day'), hash: `#/trip/${tripId}/itinerary?date=${live.date || todayStr}`, icon: 'calendar-days', primary: true }]
    });
  });

  // Up-next rows → each upcoming place, inspected.
  document.querySelectorAll('#upnext-list .dash-upnext').forEach(row => row.addEventListener('click', () => {
    const it = upcomingList[Number(row.dataset.ui)];
    if (!it) return;
    openDashPopup({
      icon: 'sparkles', title: it.title || t('upNext'),
      subtitle: `${formatDate(it.date, lang, trip?.timezone)} • ${formatTime(it.startAt, trip?.timezone)}`,
      body: `<div class="dash-pop-card">
          ${it.address ? dashRow(th('สถานที่','Place'), escapeHtml(it.address)) : ''}
          ${dashRow(th('หมวด','Category'), escapeHtml(categoryLabel(it.category || 'general', lang)))}
          ${Number(it.estimateAmount) > 0 ? dashRow(th('ประมาณการ','Estimated'), escapeHtml(formatCurrency(toMinor(Number(it.estimateAmount), getCurrencyDecimals(it.estimateCurrency || currency)), it.estimateCurrency || currency))) : ''}
        </div>`,
      links: [{ label: th('ดูแผนของวันนี้', 'See this day'), hash: `#/trip/${tripId}/itinerary?date=${it.date}`, icon: 'calendar-days', primary: true }]
    });
  }));

  // Spend-by-category rows → the category's own transactions.
  document.querySelectorAll('#category-stats .dash-cat-row').forEach(row => row.addEventListener('click', () => {
    const cat = row.dataset.cat;
    const v = byCategory[cat] || { actual: 0, estimate: 0, count: 0 };
    const list = originalExpenses.filter(e => (e.category || 'general') === cat).sort(byDateDesc);
    openDashPopup({
      icon: categoryIcon(cat), title: categoryLabel(cat, lang),
      subtitle: th(`${v.count} รายการ • แตะแถวเพื่อเปิดรายการนั้น`, `${v.count} items • tap a row to open it`),
      body: `<div class="dash-pop-card">
          ${dashRow(th('จ่ายจริง','Actual'), fmt(v.actual))}
          ${dashRow(th('ประมาณการ','Estimated'), fmt(v.estimate))}
          ${dashRow(th('รวม','Total'), fmt(v.actual + v.estimate))}
        </div>
        ${dashExpList(list.slice(0, 6))}`,
      links: [{ label: th('ดูค่าใช้จ่ายทั้งหมด', 'View all expenses'), hash: `#/trip/${tripId}/expenses`, icon: 'wallet', primary: true }]
    });
  }));

  // Estimated-vs-actual block → the two piles, inspected.
  document.getElementById('estimate-compare')?.classList.add('dash-clickable');
  document.getElementById('estimate-compare')?.addEventListener('click', () => {
    openDashPopup({
      icon: 'bar-chart-3', title: th('ประมาณการ vs จ่ายจริง', 'Estimated vs actual'),
      body: `<div class="dash-pop-card">
          ${dashRow(th('จ่ายจริงแล้ว','Paid'), fmt(actualMinor))}
          ${dashRow(th('ประมาณการ/ต้องจอง','Estimated'), fmt(estimatedMinor))}
          ${dashRow(th('เฉลี่ย/คน','Avg / person'), fmt(Math.round(totalMinor / memberCount)))}
        </div>`,
      links: [{ label: th('ดูค่าใช้จ่ายทั้งหมด', 'View all expenses'), hash: `#/trip/${tripId}/expenses`, icon: 'wallet', primary: true }]
    });
  });

  // Member rows → that member's paid / share / net + their bills.
  document.querySelectorAll('#member-board-content .member-row[data-mid]').forEach(row => row.addEventListener('click', () => {
    const mid = row.dataset.mid;
    const m = membersMap[mid];
    const name = m?.displayName || (mid || '').slice(0, 6);
    const bal = balances.find(b => b.memberId === mid)?.net || 0;
    const mine = originalExpenses.filter(e =>
      expensePayments(e).some(p => p.memberId === mid) || (e.allocations || []).some(a => a.memberId === mid)
    ).sort(byDateDesc);
    openDashPopup({
      icon: 'user', title: name,
      subtitle: mid === myId ? th('คุณ • แตะแถวเพื่อเปิดรายการนั้น', 'You • tap a row to open it') : th('แตะแถวเพื่อเปิดรายการนั้น', 'Tap a row to open it'),
      body: `<div class="dash-pop-card">
          ${dashRow(th('จ่ายไป','Paid'), fmt(paidBy[mid] || 0))}
          ${dashRow(th('รับผิดชอบ','Share'), fmt(shareBy[mid] || 0))}
          ${dashRow(bal >= 0 ? th('ได้รับคืน','Gets back') : th('ต้องจ่าย','Pays'), `<span style="color:${bal >= 0 ? 'var(--success)' : 'var(--danger)'};">${fmt(bal)}</span>`)}
        </div>
        ${dashExpList(mine.slice(0, 6))}`,
      links: [
        { label: th('ไปเคลียร์บิล', 'Go to settlement'), hash: `#/trip/${tripId}/settlement`, icon: 'hand-coins', primary: true },
        { label: th('จัดการสมาชิก', 'Manage members'), hash: `#/trip/${tripId}/members`, icon: 'users' }
      ]
    });
  }));

  // Team cards → the team's money, inspected.
  document.querySelectorAll('#team-board .team-card[data-gid]').forEach(card => card.addEventListener('click', () => {
    let report = null;
    try { report = groupBudgetReport(groups, expenses, members); } catch { report = null; }
    if (!report) return;
    const gid = card.dataset.gid;
    const g = gid === '__trip' ? null : (report.groups || []).find(x => x.id === gid);
    const places = gid === '__trip' ? items.length : placesForGroup(gid, items).length;
    const stat = g || report.trip;
    if (!stat) return;
    openDashPopup({
      icon: 'users-round', title: g ? g.name : th('ทั้งทริป', 'Whole trip'),
      subtitle: g?.note ? escapeHtml(g.note) : th('แตะเพื่อจัดการทีมที่หน้าสมาชิก', 'Manage teams on the Members page'),
      body: `<div class="dash-pop-card">
          ${dashRow(th('เฉลี่ย / คน','Per person'), fmt(stat.perPersonMinor))}
          ${dashRow(g ? th('รวมทีม','Team total') : th('รวมทั้งทริป','Trip total'), fmt(stat.shareMinor))}
          ${dashRow(th('จ่ายไป','Paid'), fmt(stat.paidMinor))}
          ${dashRow(th('สถานที่','Places'), `${places}`)}
          ${(g?.members || []).length ? `<div class="dash-pop-sub">${th('สมาชิกในทีม','Team members')}</div><div class="team-members">${g.members.map(m => `<span class="team-member-chip">${escapeHtml(m.displayName || '')}</span>`).join('')}</div>` : ''}
        </div>`,
      links: [{ label: th('จัดการทีม', 'Manage teams'), hash: `#/trip/${tripId}/members`, icon: 'users', primary: true }]
    });
  }));

  // Recent expenses → full inspection before jumping to edit.
  document.querySelectorAll('#recent-expenses [data-expense]').forEach(btn => btn.addEventListener('click', () => {
    const e = originalExpenses.find(x => x.id === btn.dataset.expense);
    if (!e) { location.hash = `#/trip/${tripId}/expenses`; return; }
    const payers = expensePayments(e).map(p => `${membersMap[p.memberId]?.displayName || p.memberId} • ${formatCurrency(p.amountMinor, e.currency || currency)}`);
    const shared = (e.allocations || []).map(a => membersMap[a.memberId]?.displayName || a.memberId).filter(Boolean);
    openDashPopup({
      icon: categoryIcon(e.category), title: e.title || th('ค่าใช้จ่าย', 'Expense'),
      subtitle: `${escapeHtml(categoryLabel(e.category, lang))} • ${escapeHtml(e.date || '')}${e.isEstimated ? ` • ${th('ประมาณการ','estimated')}` : ''}`,
      body: `<div class="dash-pop-card">
          ${dashRow(th('ยอดสุทธิ','Net'), escapeHtml(formatCurrency(e.netTotalMinor || 0, e.currency || currency)))}
          ${payers.length ? dashRow(th('ผู้จ่าย','Paid by'), escapeHtml(payers.join(' · '))) : ''}
          ${shared.length ? dashRow(`${th('หารกัน','Split')} (${shared.length})`, escapeHtml(shared.slice(0, 6).join(', ')) + (shared.length > 6 ? ` +${shared.length - 6}` : '')) : ''}
          ${e.note ? dashRow(th('โน้ต','Note'), escapeHtml(String(e.note).slice(0, 120))) : ''}
        </div>`,
      links: [
        { label: th('แก้ไขรายการ', 'Edit this expense'), hash: `#/trip/${tripId}/expenses/add?id=${e.id}`, icon: 'pencil', primary: true },
        { label: th('ดูค่าใช้จ่ายทั้งหมด', 'View all expenses'), hash: `#/trip/${tripId}/expenses`, icon: 'wallet' }
      ]
    });
  }));

  queueIcons();
  initReveal(appEl);
  // Fire-and-forget: the v16 tools row (prep • weather • bookings • ideas)
  // paints itself as soon as its data arrives.
  paintDashboardTools({ tripId, trip, members: members || [], items: items || [], lang }).catch(e => console.warn('dash tools failed', e?.message));

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
  const [perms, , itineraryExpenses, itineraryGroups] = await Promise.all([
    resolvePermissions(tripId, trip, currentUser.uid),
    loadTripCategories(tripId).catch(e => console.warn(e)),
    fetchAllExpenses(tripId).catch(() => []),
    // Sub-groups (ทีม) are picked per place — “สถานที่นี้มีทีมไหนไปบ้าง”.
    listGroups(tripId).catch(e => { console.warn('groups load failed', e?.message); return []; })
  ]);
  if (isStale(token)) return;
  const isAdmin = perms.isAdmin;
  const tripGroups = itineraryGroups || [];

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
          <!-- v18.2: the Excel *import* tool only exists while edit mode is on -->
          <span id="itin-import-slot" class="contents"></span>` : ''}
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

        <div id="itin-datebar" class="itin-datebar">
          <button id="date-prev-btn" class="btn btn-ghost btn-icon btn-icon-sm itin-date-nav" title="${th('วันก่อนหน้า','Previous day')}" aria-label="${th('วันก่อนหน้า','Previous day')}">${icon('chevron-left', 'w-4 h-4')}</button>
          <div id="date-chips" class="chip-row chip-row-scroll itin-date-chips"></div>
          <button id="date-next-btn" class="btn btn-ghost btn-icon btn-icon-sm itin-date-nav" title="${th('วันถัดไป','Next day')}" aria-label="${th('วันถัดไป','Next day')}">${icon('chevron-right', 'w-4 h-4')}</button>
          <span id="date-pos-label" class="itin-date-pos" hidden></span>
          <button id="date-today-btn" class="btn btn-secondary btn-sm itin-date-today">${icon('locate-fixed', 'w-3.5 h-3.5')} ${th('วันนี้','Today')}</button>
        </div>
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
              <p class="text-[10px] text-[var(--text-tertiary)] flex items-center gap-1">${icon('info', 'w-3 h-3')} ${th('กดการ์ดสถานที่ → แผนที่มุ่งไปที่หมุด • เส้นประ = ลำดับที่ไป • กดปุ่มนำทางบนการ์ดเพื่อเปิด Google Maps','Tap a place card → the map focuses its pin • dashed line = visit order • tap 🧭 on a card to open Google Maps')}</p>
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
  // Live Sortable instances of this page (edit mode only) — see loadItems().
  let sortables = [];
  const destroySortables = () => {
    sortables.forEach(s => { try { s.destroy(); } catch { /* already gone */ } });
    sortables = [];
  };
  document.addEventListener('routechange', destroySortables, { once: true });
  // Set when a card was tapped before the map finished drawing — applied right
  // after the pins land so the map always ends up on the tapped place.
  let pendingFocus = null;
  let members = [];

  try {
    members = await listMembers(tripId);
    currentTripMembers = members || [];
  } catch (e) { console.warn('members load failed', e?.message); }
  if (isStale(token)) return;

  const tripDays = trip ? getTripDays(trip.startDate, trip.endDate) : [];
  const dayColors = {};
  // Day colours follow the True-tone brand: blue → yellow → supporting cool hues,
  // so day 1 is the brand blue and day 2 the brand yellow.
  const dayHues = themeDayHues();
  tripDays.forEach((d, i) => { dayColors[dayjs(d).format('YYYY-MM-DD')] = `hsl(${dayHues[i % dayHues.length]},72%,46%)`; });

  const chipsEl = document.getElementById('date-chips');
  const tripDayStrs = tripDays.map(d => dayjs(d).format('YYYY-MM-DD'));
  /** Single place that keeps the day chips + view-all toggle + position label
   *  in sync, and keeps the active day scrolled into view (long trips). */
  function syncDayUi() {
    setText('view-all-label', showAll ? th('รายวัน','By day') : th('ดูทั้งหมด','View all'));
    const viewBtn = document.getElementById('view-all-btn');
    if (viewBtn) viewBtn.className = showAll ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm';
    const chips = document.getElementById('date-chips');
    chips?.querySelectorAll('.chip').forEach(c => c.classList.remove('chip-active'));
    const active = showAll
      ? chips?.querySelector('[data-date="__all"]')
      : chips?.querySelector(`[data-date="${selectedDate}"]`);
    active?.classList.add('chip-active');
    try { active?.scrollIntoView?.({ block: 'nearest', inline: 'center', behavior: 'smooth' }); } catch { /* cosmetic */ }
    const pos = document.getElementById('date-pos-label');
    if (pos) {
      const idx = tripDayStrs.indexOf(selectedDate);
      if (showAll || idx < 0 || !tripDayStrs.length) pos.hidden = true;
      else {
        pos.hidden = false;
        pos.textContent = `${th('วันที่','Day')} ${idx + 1}/${tripDayStrs.length}`;
      }
    }
  }
  function stepDay(dir) {
    if (!tripDayStrs.length) return;
    showAll = false;
    let idx = tripDayStrs.indexOf(selectedDate);
    if (idx < 0) idx = dir > 0 ? -1 : tripDayStrs.length;
    idx = Math.min(tripDayStrs.length - 1, Math.max(0, idx + dir));
    if (tripDayStrs[idx]) selectedDate = tripDayStrs[idx];
    syncDayUi();
    loadItems();
  }
  if (chipsEl) {
    chipsEl.innerHTML = tripDays.map(d => {
      const ds = dayjs(d).format('YYYY-MM-DD');
      return `<button data-date="${ds}" class="chip ${ds === selectedDate && !showAll ? 'chip-active' : ''}">${icon('calendar', 'w-3.5 h-3.5')} ${dayjs(d).format('DD MMM')}</button>`;
    }).join('') + `<button data-date="__all" class="chip ${showAll ? 'chip-active' : ''}">${icon('layers', 'w-3.5 h-3.5')} ${th('ทั้งหมด','All')}</button>`;
    chipsEl.querySelectorAll('[data-date]').forEach(btn => btn.addEventListener('click', () => {
      const ds = btn.dataset.date;
      if (ds === '__all') { showAll = true; }
      else { showAll = false; selectedDate = ds; }
      syncDayUi();
      loadItems();
    }));
    // Long trips open mid-list — bring the active day into view right away.
    setTimeout(() => {
      try { chipsEl.querySelector('.chip-active')?.scrollIntoView?.({ block: 'nearest', inline: 'center' }); } catch { /* cosmetic */ }
    }, 60);
  }
  syncDayUi();

  bind('view-all-btn', 'click', () => {
    showAll = !showAll;
    syncDayUi();
    loadItems();
  });
  bind('date-prev-btn', 'click', () => stepDay(-1));
  bind('date-next-btn', 'click', () => stepDay(1));
  bind('date-today-btn', 'click', () => {
    if (!tripDayStrs.length) return;
    showAll = false;
    const today = dayjs().format('YYYY-MM-DD');
    if (tripDayStrs.includes(today)) selectedDate = today;
    else {
      // Today is outside the trip — jump to the nearest trip day instead.
      let best = tripDayStrs[0];
      let bestDiff = Infinity;
      for (const ds of tripDayStrs) {
        const diff = Math.abs(dayjs(ds).diff(dayjs(today), 'day'));
        if (diff < bestDiff) { bestDiff = diff; best = ds; }
      }
      selectedDate = best;
    }
    syncDayUi();
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

  /** Weather chips for every day header (Open-Meteo, cached 3 h). */
  async function paintItineraryWeather(scope) {
    const chips = [...(scope || document).querySelectorAll('[data-weather-day]')];
    if (!chips.length || !trip?.startDate) return;
    const today = dayjs().format('YYYY-MM-DD');
    if (!isForecastRelevant(trip.startDate, today)) return;
    const dates = [...new Set(chips.map(c => c.dataset.weatherDay))];
    const located = coordOf((visibleItems || []).find(i => hasCoords(i)));
    const place = located ? { lat: located.lat, lon: located.lng } : (trip.city || trip.country || '');
    if (!place) return;
    const forecast = await fetchDailyForecast(place, { startDate: dates[0], endDate: dates[dates.length - 1] });
    const byDate = new Map(forecastForDates(forecast, dates).map(d => [d.date, d]));
    chips.forEach(chip => {
      const day = byDate.get(chip.dataset.weatherDay);
      if (!day || day.missing) return;
      const tone = weatherTone(day.tone);
      chip.hidden = false;
      chip.style.background = tone.bg;
      chip.style.borderColor = tone.line;
      chip.style.color = tone.fg;
      chip.innerHTML = `${icon(day.icon, 'w-3 h-3')} ${Math.round(day.max ?? 0)}°<small>/${Math.round(day.min ?? 0)}°</small>`;
      chip.title = `${lang === 'th' ? day.labelTh : day.labelEn}${day.rainChance != null ? ` • ${th('ฝน','rain')} ${day.rainChance}%` : ''}`;
      queueIcons();
    });
  }

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

  // When the map scrolls back into view (long "view all" lists), Leaflet must
  // re-measure — otherwise tiles render half-grey.
  try {
    if ('IntersectionObserver' in window) {
      const mapCardEl = document.getElementById('map-card');
      if (mapCardEl) {
        const mapObserver = new IntersectionObserver((entries) => {
          if (entries.some(e => e.isIntersecting) && mapVisible && mapReady) {
            import('./maps/index.js').then(({ refreshMapSize }) => refreshMapSize('map')).catch(() => {});
          }
        }, { threshold: 0.05 });
        mapObserver.observe(mapCardEl);
        document.addEventListener('routechange', () => mapObserver.disconnect(), { once: true });
      }
    }
  } catch { /* cosmetic only */ }

  /** Re-render the map markers. This NEVER wipes the container node that Leaflet owns. */
  async function refreshMap(items, { fit = false, forceRecreate = false } = {}) {
    if (!mapVisible) return;
    const mapEl = document.getElementById('map');
    if (!mapEl) return;
    // Virtual "back to hotel" nights share the master's pin — draw it once.
    const located = (items || []).filter(i => i.coordinates && !i.virtualStay);
    try {
      mapStatus('loading');
      const { renderItineraryMap, refreshMapSize, setMapLang } = await import('./maps/index.js');
      setMapLang('map', lang);   // for the optional place-details labels
      const res = await renderItineraryMap('map', located, {
        dayColors,
        fitBounds: true,
        forceRecreate,
        lang,
        directionsLabel: th('ไปที่นี่', 'Directions')
      });
      mapReady = true;
      mapStatus(located.length ? 'ready' : 'empty');
      setText('map-count', `${res.count || 0} ${th('หมุด','pins')}`);
      fitMapToViewport();
      refreshMapSize('map');
      if (fit && located.length) {
        setTimeout(() => refreshMapSize('map'), 200);
      }
      // A card was tapped while the map was still drawing → head to that pin now.
      if (pendingFocus) {
        const target = pendingFocus;
        pendingFocus = null;
        const { focusItineraryItem } = await import('./maps/index.js');
        setTimeout(() => focusItineraryItem('map', (items || []).length ? items : [target], target.id), 90);
      }
    } catch (e) {
      console.error('Map failed', e);
      mapStatus('error', e.message || String(e));
      queueIcons();
    }
  }

  if (mapVisible) setTimeout(() => refreshMap(visibleItems), 220);

  /**
   * "กดการ์ดสถานที่ → แผนที่มุ่งไปที่หมุดเสมอ" (task #1).
   * Resolves the place (virtual stay nights resolve to their master hotel pin),
   * makes sure the map is on screen, then pans + opens the pin's popup.
   * v18: a place with no coordinates is returned as well — the caller then frames
   * that day on the map instead of doing nothing.
   */
  async function resolveFocusItem(itemId) {
    if (!itemId) return null;
    const local = visibleItems.find(i => i.id === itemId) || visibleItems.find(i => i.masterId === itemId);
    if (local) {
      if (local.coordinates) return local;
      const master = local.masterId ? visibleItems.find(i => i.id === local.masterId) : null;
      if (master?.coordinates) return master;
      return local;   // unpinned — focusItineraryItem falls back to the day's bounds
    }
    // The pin may live on a day that is not currently shown — look in the full plan.
    try {
      const all = await fetchItinerary(tripId, null);
      const masterId = local?.masterId || itemId;
      const found = (all || []).find(i => i.id === itemId) || (all || []).find(i => i.id === masterId);
      if (found) return found;
    } catch { /* offline → fall through */ }
    return null;
  }

  async function focusItemOnMap(itemId) {
    const target = await resolveFocusItem(itemId);
    if (!target) return; // nothing pinned for this place
    // Never leave the user staring at a hidden map.
    if (!mapVisible) {
      mapVisible = true;
      document.getElementById('map-card')?.classList.remove('hidden');
      document.getElementById('itin-layout')?.classList.remove('map-hidden');
      const btn = document.getElementById('toggle-map-btn');
      if (btn) btn.className = 'btn btn-primary btn-sm';
      setTimeout(async () => {
        fitMapToViewport();
        const { refreshMapSize } = await import('./maps/index.js');
        refreshMapSize('map');
      }, 120);
    }
    // On phones the map column sits above the list — bring it into view FIRST so
    // the focus that follows is measured against the final layout (this is what
    // keeps the pin truly centred after a scroll).
    if (window.matchMedia?.('(max-width: 1023px)')?.matches) {
      document.getElementById('map-card')?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
      await new Promise(r => setTimeout(r, 280));
    }
    try {
      const { focusItineraryItem, getMap, refreshMapSize } = await import('./maps/index.js');
      try { refreshMapSize('map'); } catch { /* cosmetic */ }
      // The whole visible day is passed so an unpinned place can still be framed
      // against its neighbours.
      const pool = visibleItems.length ? visibleItems : [target];
      if (!getMap('map') || !focusItineraryItem('map', pool, target.id)) {
        // Map not created yet (or pin not drawn yet) → apply once it is.
        pendingFocus = target;
        if (!mapReady) refreshMap(visibleItems);
      }
    } catch (e) { console.warn('[Itinerary] map focus failed', e?.message); }
  }

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
  // v19 vivid status tones used by the exported sheet (also mirrored in the CSS
  // badges: badge-planned / badge-current / badge-completed / badge-skipped / badge-cancelled).
  const STATUS_TONE = {
    planned: '#1f6bfb', current: '#ef7d00', completed: '#00a86b', skipped: '#8b98ab', cancelled: '#ef2b3d'
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
          (it.virtualStay || it.virtualDeparture) ? '' : formatDuration(it.durationMinutes),
          it.isStay ? (it.virtualDeparture ? th(`เดินทางออกจากที่พัก • หลังคืนที่ ${it.stayNight}/${it.stayNights}`, `leave the hotel • after night ${it.stayNight}/${it.stayNights}`) : (it.virtualStay ? th(`กลับเข้าพัก • คืนที่ ${it.stayNight}/${it.stayNights}`, `back to hotel • night ${it.stayNight}/${it.stayNights}`) : th(`พัก ${it.stayNights} คืน`, `${it.stayNights} nights`))) : '',
          categoryLabel(it.category || 'general', lang),
          (!it.virtualStay && it.travelToNextMinutes > 0) ? `${th('เดินทางต่อ','travel')} ${formatDuration(it.travelToNextMinutes)}` : '',
          it.address && !it.virtualStay ? it.address : '',
          it.coordinates && !it.virtualStay ? `${th('พิกัด','coord')} ${it.coordinates}` : ''
        ].filter(Boolean).map(escapeHtml).join(' • ');
        return `
          <tr>
            <td style="width:34px;color:#6b7280;font-weight:700;">${it.virtualStay ? '🏨' : idx + 1}</td>
            <td>
              <div class="itin-sheet-item-title">${escapeHtml((it.virtualDeparture ? `${th('เดินทางออกจากที่พัก', 'Leave the hotel')} — ` : (it.virtualStay ? `${th('กลับเข้าพัก', 'Back to hotel')} — ` : '')) + (it.title || ''))}</div>
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
  /**
   * v18 (requested): the plan is a sequence, not a pile of cards — so between two
   * consecutive places we draw the travel leg: how long the move takes (from the
   * previous place's “travel to next” field), how far it is, and whether the next
   * start time actually leaves room for it.
   */
  function itinLegHtml(prev, next) {
    if (!prev || !next) return '';
    const mins = Math.max(0, Math.round(Number(prev.travelToNextMinutes) || 0));
    const km = haversineKm(prev, next);
    const prevEnd = prev.endAt || (prev.startAt && prev.durationMinutes
      ? dayjs(prev.startAt).add(Number(prev.durationMinutes) || 0, 'minute').toDate() : null);
    const arriveAt = prevEnd && mins > 0 ? dayjs(prevEnd).add(mins, 'minute') : (prevEnd ? dayjs(prevEnd) : null);
    const nextStart = next.startAt ? dayjs(next.startAt) : null;
    const slackMin = arriveAt && nextStart ? nextStart.diff(arriveAt, 'minute') : null;

    // Nothing to say at all (no travel time, no distance, no times) → no connector.
    if (!mins && !km && slackMin === null) return '';

    const mode = !km ? null : (km <= 0.7 ? 'walk' : km <= 3 ? 'bike' : 'car');
    const modeIcon = mode === 'walk' ? 'footprints' : mode === 'bike' ? 'bike' : 'car';
    const bits = [];
    if (mins > 0) bits.push(`<span class="itin-leg-time">${icon(modeIcon || 'navigation', 'w-3 h-3')} ${th('เดินทาง', 'travel')} <b>${escapeHtml(formatDuration(mins))}</b></span>`);
    else bits.push(`<span class="itin-leg-time">${icon(modeIcon || 'navigation', 'w-3 h-3')} <b>${th('เดินถึงกัน', 'within walking distance')}</b></span>`);
    if (km > 0) bits.push(`<span class="itin-leg-km">${km < 1 ? `${Math.round(km * 1000)} ม.` : `${km.toFixed(1)} กม.`}</span>`);
    if (mins > 0 && arriveAt) {
      bits.push(`<span class="itin-leg-arrive">${th('ถึงราว', 'arrive ~')} <b>${escapeHtml(formatTime(arriveAt.toDate()))}</b></span>`);
    }
    let warn = '';
    if (slackMin !== null && mins > 0) {
      if (slackMin < 0) warn = `<span class="itin-leg-warn">${icon('alert-triangle', 'w-3 h-3')} ${th(`ไม่พอเวลา ${formatDuration(Math.abs(slackMin))}`, `short by ${escapeHtml(formatDuration(Math.abs(slackMin)))}`)}</span>`;
      else if (slackMin <= 15) warn = `<span class="itin-leg-tight">${icon('timer', 'w-3 h-3')} ${th(`เหลือแค่ ${formatDuration(slackMin)}`, `only ${escapeHtml(formatDuration(slackMin))} spare`)}</span>`;
    }
    const stay = prev.durationMinutes ? `<span class="itin-leg-stay">${th('ระยะเวลาเดินทาง', 'travel time')} ${escapeHtml(formatDuration(Number(prev.durationMinutes) || 0))}</span>` : '';
    return `
      <div class="itin-leg ${mins > 0 ? '' : 'itin-leg--near'} ${warn ? 'itin-leg--warn' : ''}" aria-hidden="false">
        <div class="itin-leg-rail"><span class="itin-leg-dot"></span><span class="itin-leg-line"></span></div>
        <div class="itin-leg-body">${bits.join('<span class="itin-leg-sep">•</span>')}${stay}${warn}</div>
      </div>`;
  }

  /** Cards of one day, with the travel legs drawn between them. */
  function dayCardsHtml(list, { draggable = false } = {}) {
    const arr = list || [];
    return arr.map((it, idx) => itemCardHtml(it, idx, { draggable }) + (idx < arr.length - 1 ? itinLegHtml(it, arr[idx + 1]) : '')).join('');
  }

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
    const isReturn = Boolean(it.virtualStay);
    const isDeparture = Boolean(it.virtualDeparture);
    const isVirtual = isReturn || isDeparture;
    const isCheckin = it.stayRole === 'checkin';
    const nights = Number(it.stayNights) || 0;
    const title = isDeparture
      ? `${th('เดินทางออกจากที่พัก', 'Leave the hotel')} — ${it.title}`
      : (isReturn ? `${th('กลับเข้าพัก', 'Back to hotel')} — ${it.title}` : it.title);

    return `
      <div class="itin-card card card-hover ${draggable ? 'cursor-move' : ''} ${isReturn ? 'itin-card--stay-return' : ''} ${isDeparture ? 'itin-card--departure' : ''} ${isCheckin ? 'itin-card--stay' : ''}" data-id="${it.id}" draggable="${draggable && !isVirtual}">
        <div class="itin-body">
          <div class="flex items-start gap-3">
            <div class="step-num ${isVirtual ? 'step-num--stay' : ''}">${isDeparture ? icon('log-out', 'w-3.5 h-3.5') : (isReturn ? icon('bed-double', 'w-3.5 h-3.5') : idx + 1)}</div>
            <div class="flex-1 min-w-0">
              <div class="flex items-start justify-between gap-2">
                <h3 class="font-semibold text-sm leading-snug">${escapeHtml(title)}</h3>
                <span class="flex items-center gap-1 flex-shrink-0">
                  ${it.isStay ? `<span class="badge badge-stay text-[10px]">${icon(isDeparture ? 'sunrise' : (isVirtual ? 'moon' : 'bed-double'), 'w-2.5 h-2.5')} ${isDeparture ? th(`ออกจากที่พัก • หลังคืนที่ ${it.stayNight}/${nights}`, `check-out • after night ${it.stayNight}/${nights}`) : (isVirtual ? th(`คืนที่ ${it.stayNight}/${nights}`, `night ${it.stayNight}/${nights}`) : th(`พัก ${nights} คืน`, `${nights} nights`))}</span>` : ''}
                  <span class="badge badge-${it.status || 'planned'} text-[10px]">${escapeHtml(statusDef ? (lang==='th'?statusDef.th:statusDef.en) : (it.status || 'planned'))}</span>
                </span>
              </div>
              <div class="flex items-center gap-2 flex-wrap mt-1.5">
                <span class="meta-line">${icon('clock', 'w-3 h-3')} ${formatTime(it.startAt, trip?.timezone)} – ${formatTime(it.endAt, trip?.timezone)}</span>
                ${isVirtual ? '' : `<span class="meta-line">${icon('timer', 'w-3 h-3')} ${formatDuration(it.durationMinutes)}</span>`}
                ${(!isVirtual && it.travelToNextMinutes > 0) ? `<span class="meta-line">${icon('footprints', 'w-3 h-3')} ${formatDuration(it.travelToNextMinutes)}</span>` : ''}
                <span class="badge badge-planned text-[10px]">${icon(categoryIcon(it.category), 'w-2.5 h-2.5')} ${escapeHtml(categoryLabel(it.category || 'general', lang))}</span>
                ${groupBadgesHtml(it)}
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
                  ${isVirtual ? '' : `<button type="button" class="badge badge-skipped text-[9px] itin-expense-btn" data-act="expense" data-id="${it.id}">${icon(it.expenseId ? 'pencil' : 'plus', 'w-2.5 h-2.5')} ${it.expenseId ? th('แก้ไขค่าใช้จ่าย','Edit expense') : th('ผูกค่าใช้จ่าย','Link a cost')}</button>`}
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
              ${isVirtual ? '' : `<button data-act="expense" data-id="${it.id}">${icon('receipt', 'w-4 h-4')} ${it.expenseId || dayMinor ? th('แก้ไขค่าใช้จ่าย','Edit expense') : th('เพิ่มค่าใช้จ่าย','Add a cost')}</button>`}
              <button data-act="edit" data-id="${it.id}">${icon('pencil', 'w-4 h-4')} ${isVirtual ? th('แก้ไขการจองพัก','Edit the stay') : t('edit')}</button>
              ${isVirtual ? '' : `<button data-act="delete" data-id="${it.id}" class="is-danger">${icon('trash-2', 'w-4 h-4')} ${t('delete')}</button>`}
            </div>
          </div>
        </div>
      </div>`;
  }

  /**
   * Chips for the sub-groups (ทีม) that go to this place. The picker lives in the
   * place form — “ให้เลือกได้ด้วยว่าแต่ละสถานที่มีกลุ่มไหนไปบ้าง” — and the money
   * analysis (dashboard + expenses) reads it back.
   */
  function groupBadgesHtml(it) {
    if (!tripGroups.length) return '';
    const ids = itemGroupIds(it);
    // No pick at all = everyone goes (the default, and the state of every place
    // created before the picker existed) — shown as one “ทุกทีม” chip.
    const badges = ids.length ? tripGroups.filter(g => ids.includes(g.id)) : tripGroups;
    if (!badges.length) return '';
    if (badges.length === tripGroups.length) {
      return `<span class="badge badge-completed text-[10px]" title="${th('ทุกทีมไปที่นี่','Every team goes here')}">${icon('users-round', 'w-2.5 h-2.5')} ${th('ทุกทีม','all teams')}</span>`;
    }
    return badges.map(g => `<span class="badge text-[10px]" style="background:color-mix(in srgb, ${escapeHtml(g.color)} 18%, var(--surface)); border:1px solid color-mix(in srgb, ${escapeHtml(g.color)} 45%, transparent); color:color-mix(in srgb, ${escapeHtml(g.color)} 72%, var(--text-strong));" title="${th('ทีมที่ไปสถานที่นี้','Teams going here')}">${icon(g.icon || 'users', 'w-2.5 h-2.5')} ${escapeHtml(g.name)}</span>`).join('');
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
              <span class="weather-chip weather-chip--mini" data-weather-day="${escapeHtml(day)}" hidden></span>
              <span class="text-[10px] text-[var(--text-tertiary)] ml-auto">${itineraryMoney(dayItems)}</span>
              <button class="itin-day-export-btn" data-export-day="${escapeHtml(day)}" title="${th('ส่งออก PNG ของวันนี้','Export this day as a PNG')}">${icon('image', 'w-3.5 h-3.5')} PNG</button>
            </h3>
            <div class="space-y-3 stagger" data-day-group="${escapeHtml(day)}">${dayCardsHtml(dayItems, { draggable: editMode })}</div>
          </div>
        `).join('');
      } else {
        listEl.innerHTML = dayCardsHtml(items, { draggable: editMode });
      }

      listEl.querySelectorAll('[data-export-day]').forEach(btn => btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await exportItineraryDayPng(btn.dataset.exportDay);
      }));

      // Weather chips on the day headers (only in the “view all” listing).
      paintItineraryWeather(listEl);

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
        // “แก้ไขค่าใช้จ่าย” opens the SAME form the expenses page uses (a sheet),
        // so a cost is edited identically from the plan and from the money book.
        if (btn.dataset.act === 'expense') await openItemExpenseSheet({
          tripId, item, trip, members, items: visibleItems, lang, onSaved: () => loadItems()
        });
      }));

      // Tapping anywhere on a place card sends the map straight to that pin —
      // every item, every time (buttons/links inside the card keep their own jobs).
      listEl.querySelectorAll('.itin-card').forEach(card => {
        card.addEventListener('click', (e) => {
          if (e.target.closest('a, button, input, textarea, select, label, .itin-more-menu')) return;
          focusItemOnMap(card.dataset.id);
        });
      });

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

      // Drag-to-swap exists ONLY in edit mode (a request). The Sortable instance
      // outlives the innerHTML it was created with, so it used to keep working
      // after edit mode was switched off — every instance is now destroyed before
      // the list is painted, and nothing is created unless edit mode is on.
      destroySortables();
      if (editMode) {
        try {
          const Sortable = (await import('https://esm.sh/sortablejs@1.15.3')).default;
          const wire = (container, day) => {
            sortables.push(Sortable.create(container, {
              animation: 180,
              handle: '.itin-card',
              // virtual "กลับเข้าพัก" night cards are not real items — never drag them
              filter: 'button, .itin-card--stay-return',
              onEnd: async () => {
                const newOrder = Array.from(container.querySelectorAll('[data-id]'))
                  .map(node => node.dataset.id)
                  .filter(id => !String(id).includes('@stay-') && !String(id).includes('@leave-'));
                const tLoad = toast.loading(th('กำลังจัดลำดับ...', 'Reordering...'));
                try {
                  // “ดูทั้งหมด” keeps one list per day, so a drag can never move a
                  // place to another date (that would rewrite the day's timetable).
                  await reorderItinerary(tripId, showAll ? day : selectedDate, newOrder, currentUser.uid);
                  tLoad.close();
                  toast.success(th('จัดลำดับใหม่แล้ว', 'Reordered'));
                  loadItems();
                } catch (err) { tLoad.close(); toast.error(err.message); }
              }
            }));
          };
          const dayGroups = listEl.querySelectorAll('[data-day-group]');
          if (showAll && dayGroups.length) {
            dayGroups.forEach(group => wire(group, group.dataset.dayGroup));
          } else {
            wire(listEl, selectedDate);
          }
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
    // ONE category for both sides (a request): the expense group this place bills
    // into is always derived from the place category, so there is nothing to keep
    // in sync and nothing to choose twice.

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

          <div class="input-group"><label class="input-label">${icon('tag', 'w-3.5 h-3.5')} ${th('หมวดหมู่ (ใช้ได้ทั้งสถานที่และค่าใช้จ่าย)','Category — place and money, one list')}</label>
            <select id="it-category" class="input">${categoryChoices(lang).map(c => `<option value="${c.id}" ${(it.category || 'general') === c.id ? 'selected' : ''}>${escapeHtml(categoryChoiceLabel(c, lang))}</option>`).join('')}</select>
            <p class="input-hint mt-1">${th('เลือกครั้งเดียวจบ — กลุ่มค่าใช้จ่ายของสถานที่นี้จะถูกกำหนดให้อัตโนมัติ ไม่ต้องเลือกซ้ำ','One pick only — the expense group of this place follows automatically, no second field to fill')}
              <span id="it-category-group" class="font-semibold" style="color:var(--primary-strong);"></span></p>
          </div>

          <div class="input-group" id="it-groups-wrap">
            <div class="flex items-center justify-between">
              <label class="input-label">${icon('users-round', 'w-3.5 h-3.5')} ${th('ทีมที่ไปสถานที่นี้','Teams going to this place')}</label>
              <button type="button" id="it-groups-all" class="btn btn-ghost btn-sm text-[10px]" style="min-height:26px;padding:2px 8px;">${th('ทุกทีม','All teams')}</button>
            </div>
            <div class="tile-grid" id="it-group-tiles">
              ${tripGroups.length ? tripGroups.map(g => `
                <button type="button" class="tile ${(it.groupIds || []).includes(g.id) ? 'tile-selected' : ''}" data-group="${g.id}">
                  <span class="flex items-center gap-2 min-w-0">
                    <span class="avatar w-7 h-7 text-[10px]" style="background:${escapeHtml(g.color || 'var(--primary)')};width:28px;height:28px;">${icon(g.icon || 'users', 'w-3.5 h-3.5')}</span>
                    <span class="text-xs font-medium truncate">${escapeHtml(g.name)}</span>
                  </span>
                </button>`).join('')
              : `<p class="text-xs text-[var(--text-secondary)]">${th('ยังไม่มีทีมในทริป — สร้างกลุ่มย่อยได้ที่หน้าสมาชิก แล้วกลับมาเลือกที่นี่','No teams yet — create sub-groups on the Members page, then pick them here')}</p>`}
            </div>
            <p class="input-hint">${th('เลือกได้ว่าทีมไหนไปที่นี่บ้าง (หรือทั้งสองทีม) — ระบบใช้ค่านี้วิเคราะห์ค่าใช้จ่ายต่อทีมในแดชบอร์ดและหน้าค่าใช้จ่าย','Pick which teams go here (or both) — the dashboard and the expenses page use it for the per-team analysis')}</p>
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
            <div class="flex items-center justify-between gap-2 flex-wrap">
              <label class="flex items-center gap-2 text-sm font-bold cursor-pointer">
                <input id="it-has-estimate" type="checkbox" class="accent-[var(--primary)] w-4 h-4" ${hasEstimate ? 'checked' : ''}>
                ${icon('hourglass', 'w-3.5 h-3.5')} ${th('มีค่าใช้จ่าย (ประมาณการ)','Has a cost (estimate)')}
              </label>
              ${it.expenseId ? `<button type="button" id="it-open-expense" class="btn btn-secondary btn-sm">${icon('receipt', 'w-3.5 h-3.5')} ${th('แก้ไขค่าใช้จ่าย (เมนูเดียวกับหน้าค่าใช้จ่าย)','Edit expense (same form as the money page)')}</button>` : ''}
            </div>
            <p class="input-hint mt-1">${th('เช่น ค่าโรงแรมที่ต้องจอง ค่าเข้าชม — กรอกยอดคร่าวๆ ที่นี่ได้ หรือกด “แก้ไขค่าใช้จ่าย” เพื่อกรอกแบบละเอียด (ส่วนลด / VAT / หลายคนจ่าย) ในเมนูเดียวกับหน้าค่าใช้จ่าย','e.g. hotel booking or entrance fee — a rough amount is enough here, or use “Edit expense” to fill in the full form (discount / VAT / several payers) that the money page uses')}</p>

            <div id="it-estimate-fields" class="${hasEstimate ? '' : 'hidden'} space-y-3 mt-3">
              <div class="grid grid-cols-3 gap-2">
                <div class="input-group col-span-2"><label class="input-label text-[12px]">${icon('banknote', 'w-3.5 h-3.5')} ${th('จำนวนเงิน','Amount')}</label><input id="it-estimate-amount" class="input money-input" type="text" inputmode="decimal" value="${it.estimateAmount == null ? '' : formatAmount(it.estimateAmount, getCurrencyDecimals(it.estimateCurrency || currency))}" placeholder="0.00"></div>
                <div class="input-group"><label class="input-label text-[12px]">${icon('coins', 'w-3.5 h-3.5')} ${th('สกุลเงิน','Currency')}</label>
                  <select id="it-estimate-currency" class="input">${tripCurrencyList(trip, [it.estimateCurrency, currency]).map(c => `<option value="${c}" ${(it.estimateCurrency || currency) === c ? 'selected' : ''}>${c}</option>`).join('')}</select>
                </div>
              </div>
              <p class="input-hint">${icon('tag', 'w-3 h-3')} ${th('หมวดค่าใช้จ่ายของรายการนี้มาจาก “หมวดหมู่” ด้านบน — ระบุที่เดียวใช้ทั้งระบบ','This item’s expense group comes from the “Category” field above — one pick, used everywhere')}</p>
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

    /* ---- ONE category (a request): the pick above decides everything ----
       The expense group of the place is derived from it, so the same category is
       never asked for twice and every screen (plan, money, dashboard) reads the
       same value. */
    const catSelect = document.getElementById('it-category');
    const catGroupHint = document.getElementById('it-category-group');
    const paintCategoryGroup = () => {
      if (!catGroupHint) return;
      const groupId = expenseGroupForChoice(catSelect?.value || 'general');
      catGroupHint.textContent = ` → ${lang === 'th' ? 'กลุ่มค่าใช้จ่าย' : 'expense group'}: ${categoryLabel(groupId, lang)}`;
    };
    catSelect?.addEventListener('change', paintCategoryGroup);
    paintCategoryGroup();

    /* ---- teams that go to this place (กลุ่มไหนไปบ้าง) ---- */
    let pickedGroups = itemGroupIds(it);
    const groupTiles = () => document.querySelectorAll('#it-group-tiles [data-group]');
    const syncAllTeams = () => {
      const allBtn = document.getElementById('it-groups-all');
      if (!allBtn) return;
      // Nothing picked = the whole trip goes, so “ทุกทีม” is the selected state.
      const everyone = !pickedGroups.length || (tripGroups.length > 0 && pickedGroups.length === tripGroups.length);
      allBtn.classList.toggle('chip-active', everyone);
    };
    groupTiles().forEach(btn => btn.addEventListener('click', () => {
      const gid = btn.dataset.group;
      if (pickedGroups.includes(gid)) { pickedGroups = pickedGroups.filter(x => x !== gid); btn.classList.remove('tile-selected'); }
      else { pickedGroups.push(gid); btn.classList.add('tile-selected'); }
      syncAllTeams();
    }));
    bind('it-groups-all', 'click', () => {
      pickedGroups = [];
      groupTiles().forEach(t => t.classList.remove('tile-selected'));
      syncAllTeams();
    });
    syncAllTeams();

    /* ---- the linked expense, edited in the SAME form the money page uses ---- */
    bind('it-open-expense', 'click', async () => {
      sheet.close();
      await openItemExpenseSheet({ tripId, item: it, trip, members, items: visibleItems, lang, onSaved: () => loadItems() });
    });

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
          groupIds: [...new Set(pickedGroups)].filter(Boolean),
          estimateAmount,
          estimateCurrency: document.getElementById('it-estimate-currency').value,
          // One category controls both sides (a request) — never a second picker.
          estimateCategory: expenseGroupForChoice(document.getElementById('it-category').value),
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

  /** Excel import — only wired while edit mode is on (a v18.2 request). */
  function openImportExcelDialog() {
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
  }

  /**
   * Excel import lives behind edit mode only: the toolbar stays clean while
   * somebody is reading the plan, and the (destructive) importer is one tap
   * away when edit mode is on. Nothing is painted when the user is not an admin.
   */
  function paintImportTool() {
    const slot = document.getElementById('itin-import-slot');
    if (!slot) return;
    slot.innerHTML = editMode
      ? `<button id="import-excel-btn" class="btn btn-secondary btn-sm">${icon('upload', 'w-4 h-4')} Import</button>`
      : '';
    if (editMode) bind('import-excel-btn', 'click', openImportExcelDialog);
    queueIcons();
  }

  bind('edit-mode-btn', 'click', () => {
    editMode = !editMode;
    const btn = document.getElementById('edit-mode-btn');
    if (btn) {
      btn.innerHTML = editMode ? `${icon('check', 'w-4 h-4')} ${t('exitEdit')}` : `${icon('list-ordered', 'w-4 h-4')} ${t('editMode')}`;
      btn.className = editMode ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm';
    }
    paintImportTool();
    queueIcons();
    loadItems();
  });

  paintImportTool();

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
  // permissions, trip groups, the plan and the member list are independent — one
  // round trip. ORDER MATTERS: the destructuring below reads this array by
  // position, so groups must come before the plan here.
  const [perms, , membersRes, commentsRes, groupsRes, planRes] = await Promise.all([
    resolvePermissions(tripId, trip, currentUser.uid),
    loadTripCategories(tripId).catch(e => console.warn(e)),
    listMembers(tripId).catch(e => { console.warn(e); return []; }),
    listComments(tripId).catch(e => { console.warn(e); return []; }),
    listGroups(tripId).catch(e => { console.warn('groups load failed', e?.message); return []; }),
    fetchItinerary(tripId, null).catch(() => null)
  ]);
  if (isStale(token)) return;
  const isAdmin = perms.isAdmin;
  // Trip sub-groups (ทีม) drive the “เฉลี่ยต่อกลุ่ม → ต่อคน” numbers below, and the
  // plan tells us how many places each group actually goes to.
  const tripGroups = groupsRes || [];
  const planItems = planRes;

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

      <div class="kpi-strip mb-3">
        <div class="kpi-mini"><span class="kpi-mini-label">${th('รวมทั้งหมด','Total')}</span><b id="exp-sum-total">--</b></div>
        <div class="kpi-mini"><span class="kpi-mini-label">${th('จ่ายจริง','Actual')}</span><b id="exp-sum-actual">--</b></div>
        <div class="kpi-mini"><span class="kpi-mini-label">${th('ประมาณการ','Estimated')}</span><b id="exp-sum-est">--</b></div>
        <div class="kpi-mini"><span class="kpi-mini-label">${th('รายการ','Items')}</span><b id="exp-sum-count">--</b></div>
        <div class="kpi-mini"><span class="kpi-mini-label" id="exp-sum-avg-label">${th('เฉลี่ย / กลุ่ม','Avg / group')}</span><b id="exp-sum-avg">--</b><span class="kpi-mini-sub" id="exp-sum-avg-sub"></span></div>
      </div>

      <!-- เฉลี่ยต่อกลุ่ม แล้วแยกเป็นต่อคนของแต่ละกลุ่ม (a request) -->
      <div id="exp-group-avg" class="group-avg-strip mb-4"></div>

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
    // “เฉลี่ยต่อกลุ่ม แล้วแต่ละกลุ่มเฉลี่ยเป็นต่อคน” (a request): the headline is how
    // much ONE group costs (trip total ÷ how many groups there are); the per-person
    // number of the whole trip stays visible as the small line below, and every
    // group's own total + per-person figure is printed by renderGroupAverages().
    const report = groupBudgetReport(tripGroups, normalized, members);
    const groupCount = report.groups.filter(g => g.memberCount > 0).length;
    const shareTotal = report.trip.shareMinor || total;
    const paxCount = participantsOf(normalized).length || (members.length || 0);
    const perPerson = averagePerPerson(shareTotal, paxCount);
    if (groupCount) {
      setText('exp-sum-avg-label', th(`เฉลี่ย / กลุ่ม (${groupCount} กลุ่ม)`, `Avg / group (${groupCount})`));
      setHtml('exp-sum-avg', withThb(Math.round(shareTotal / groupCount)));
      setHtml('exp-sum-avg-sub', paxCount ? th(`ต่อคน ≈ ${formatCurrency(perPerson, 'THB')} • ${paxCount} คน`, `≈ ${formatCurrency(perPerson, 'THB')} / person • ${paxCount} pax`) : '');
    } else {
      setText('exp-sum-avg-label', paxCount ? th(`เฉลี่ย / คน (${paxCount} คน)`, `Avg / person (${paxCount})`) : th('เฉลี่ย / คน', 'Avg / person'));
      setHtml('exp-sum-avg', withThb(perPerson));
      setHtml('exp-sum-avg-sub', th('ยังไม่มีกลุ่ม — สร้างได้ที่หน้าสมาชิก', 'No groups yet — add them on the Members page'));
    }
  }

  /**
   * One card per trip sub-group (ทีม): what the group spent and what that means
   * per person, plus the whole trip as the comparison base. The numbers follow the
   * current filter (day / category / estimated) because the caller passes the same
   * item list the list view prints.
   */
  function renderGroupAverages(items) {
    const box = document.getElementById('exp-group-avg');
    if (!box) return;
    if (!tripGroups.length) { box.innerHTML = ''; return; }
    let normalized = items;
    try { normalized = expensesInThb(items, trip); } catch { /* keep raw minor units */ }
    const report = groupBudgetReport(tripGroups, normalized, members);
    const money = minor => formatCurrency(minor || 0, 'THB');
    const card = (name, iconName, color, totalMinor, perPersonMinor, pax, { trip = false, places = null } = {}) => `
      <div class="group-avg-card ${trip ? 'group-avg-card--trip' : ''}" style="--group-color:${escapeHtml(color || 'var(--primary)')};">
        <span class="group-avg-name" style="color:${trip ? 'var(--text-secondary)' : escapeHtml(color || 'var(--primary)')};">${icon(iconName || 'users', 'w-3 h-3')} ${escapeHtml(name)}</span>
        <b class="group-avg-per">${money(perPersonMinor)}<i>/${th('คน','person')}</i></b>
        <span class="group-avg-total">${th('รวม','total')} ${money(totalMinor)} • ${pax} ${th('คน','pax')}${places != null ? ` • ${places} ${th('ที่','places')}` : ''}</span>
      </div>`;
    box.innerHTML = report.groups.map(g => card(g.name, g.icon, g.color, g.shareMinor, g.perPersonMinor, g.memberCount, { places: groupPlaceCount(g.id) })).join('')
      + card(th('ทั้งทริป','Whole trip'), 'users-round', 'var(--primary)', report.trip.shareMinor, report.trip.perPersonMinor, report.trip.memberCount, { trip: true });
    queueIcons();
  }

  /**
   * How many places of the plan this group goes to. Groups are picked per place
   * (“ให้เลือกได้ด้วยว่าแต่ละสถานที่มีกลุ่มไหนไปบ้าง”), so this is the link between
   * the plan and the money analysis. Returns null while the plan is unknown.
   */
  function groupPlaceCount(groupId) {
    if (!Array.isArray(planItems)) return null;
    return placesForGroup(groupId, planItems).length;
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

  /**
   * “เฉลี่ยต่อกลุ่ม แล้วแต่ละกลุ่มเฉลี่ยเป็นต่อคน” for one slice of the list
   * (a day, or everything the filters show). Per-group numbers come from what the
   * group's members were actually charged (allocations), so an overlapping
   * membership never inflates the trip total.
   */
  function groupAvgFor(sliceItems) {
    let normalized = sliceItems;
    try { normalized = expensesInThb(sliceItems, trip); } catch { /* keep raw minor units */ }
    const report = groupBudgetReport(tripGroups, normalized, members);
    const groupCount = report.groups.filter(g => g.memberCount > 0).length;
    const pax = participantsOf(normalized).length || (members.length || 0);
    const shareTotal = report.trip.shareMinor;
    return {
      report,
      groupCount,
      pax,
      avgPerGroup: groupCount ? Math.round(shareTotal / groupCount) : 0,
      avgPerPerson: pax ? Math.round(shareTotal / pax) : 0
    };
  }

  /** The “avg / group • X / person” chip used by the day headers and the list bar. */
  function avgChipHtml(sliceItems) {
    const g = groupAvgFor(sliceItems);
    if (g.groupCount) {
      return `<span class="expense-avg-chip">${icon('users-round', 'w-3 h-3')} ${th('เฉลี่ย/กลุ่ม', 'avg/group')} <b>${formatCurrency(g.avgPerGroup, 'THB')}</b> • <b>${formatCurrency(g.avgPerPerson, 'THB')}</b>/${th('คน', 'person')} • ${g.groupCount} ${th('กลุ่ม', 'groups')} • ${g.pax} ${th('คน', 'pax')}</span>`;
    }
    return g.pax
      ? `<span class="expense-avg-chip">${th('เฉลี่ย', 'avg')} <b>${formatCurrency(g.avgPerPerson, 'THB')}</b>/${th('คน', 'person')} • ${g.pax} ${th('คน', 'pax')}</span>`
      : '';
  }

  function applyFilterRender() {
    const listEl = document.getElementById('expense-list');
    if (!listEl) return;
    renderSummary();
    const items = filterItems(allLoaded);
    renderGroupAverages(items);
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
                ${dayTotal != null ? avgChipHtml(dayItems) : ''}
              </div>
            </header>
            <div class="space-y-3 stagger">${dayItems.map(e => expenseCardHtml(e)).join('')}</div>
          </section>`;
      }).join('');
    } else {
      // v18 (requested): the flat list shows the same running total that the
      // “แยกตามวัน” view prints per day — so switching views never loses the sum.
      let listTotal = null;
      try { listTotal = sumExpenses(expensesInThb(items, trip)); } catch { /* missing rate */ }
      const listRate = resolveTripThbRate(trip, allLoaded, currency);
      const listThb = listTotal != null && currency !== 'THB' && listRate
        ? origTextChipHtml(formatCurrency(convertCurrency(listTotal, 'THB', currency, 1 / listRate), currency)) : '';
      const dayCount = new Set(items.map(e => e.date).filter(Boolean)).size;
      listEl.innerHTML = `
        <div class="expense-day-total-bar">
          <span>${icon('wallet', 'w-3.5 h-3.5')} ${th('ยอดรวมทั้งทริป (ตามตัวกรองนี้)', 'Trip total (this filter)')}</span>
          <b class="money-primary">${listTotal == null ? th('ยังไม่มีเรท THB', 'THB rate needed') : formatCurrency(listTotal, 'THB')}</b>
          ${listThb}
          ${listTotal == null ? '' : avgChipHtml(items)}
          <i>${items.length} ${th('รายการ', 'items')}${dayCount ? ` • ${dayCount} ${th('วัน', 'days')}` : ''}</i>
        </div>
        ${items.map(e => expenseCardHtml(e)).join('')}`;
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
 * Expense form — ONE form, two homes.
 *
 * The full-page editor (`#/trip/:id/expenses/add`) and the sheet that opens from
 * the plan (“แก้ไขค่าใช้จ่าย” on an itinerary card) render the very same sections,
 * fields, pickers and computed previews — so a cost is written the same way no
 * matter where it is opened from (a request: “แก้ไขจากหน้านี้ให้เมนูเป็นแบบ
 * เดียวกัน”). Everything below is prefix-aware and root-scoped: the page uses the
 * historical `ex-…` ids, the sheet uses `sh-…`, the markup and the wiring are one
 * implementation.
 * ================================================================== */

/**
 * Markup of the four expense sections (+ optional footer row).
 * @returns {string} HTML, ready to drop inside a <form class="expense-form">.
 */
function expenseFormSectionsHtml({
  prefix = '', e = {}, members = [], items = [], trip = null, lang = 'th',
  currency = 'THB', expenseRates = [], lockItinerary = false, showType = true, planLabel = ''
} = {}) {
  const tx = (a, b) => (lang === 'th' ? a : b);
  const p = prefix;
  const decimals = getCurrencyDecimals(currency);
  const amount = (minor) => (minor ? formatAmount(fromMinor(minor, decimals), decimals) : '');
  const initialPayments = expensePayments(e);
  const initialPayers = new Set(initialPayments.length ? initialPayments.map(x => x.memberId) : [members[0]?.id || currentUser.uid]);
  const selectedShare = members.filter(m => (e.allocations ? e.allocations.some(a => a.memberId === m.id) : true));

  return `
        <!-- 1) รายละเอียดรายการ -->
        <section class="form-section">
          <div class="form-section-head">
            <span class="form-section-icon">${icon('receipt-text', 'w-4 h-4')}</span>
            <h3>${tx('รายละเอียดรายการ', 'Item details')}</h3>
          </div>
          <div class="space-y-3">
            <div class="input-group"><label class="input-label">${icon('sparkles', 'w-3.5 h-3.5')} ${tx('ชื่อรายการ','Title')} *</label><input id="${p}ex-title" class="input" required autocomplete="off" placeholder="${tx('เช่น ราเมงมื้อเย็น','e.g. Dinner ramen')}" value="${escapeHtml(e.title || '')}"></div>

            <div class="grid grid-cols-2 gap-3">
              <div class="input-group"><label class="input-label">${icon('calendar', 'w-3.5 h-3.5')} ${tx('วันที่','Date')} *</label><input id="${p}ex-date" class="input" type="date" value="${escapeHtml(e.date || dayjs().format('YYYY-MM-DD'))}" required></div>
              <div class="input-group">
                <label class="input-label flex items-center justify-between">${icon('tag', 'w-3.5 h-3.5')} ${tx('กลุ่มค่าใช้จ่าย','Expense group')}
                  <button type="button" id="${p}ex-manage-cats" class="link-btn text-[10px]">${icon('settings-2', 'w-3 h-3')} ${tx('จัดการ','Manage')}</button>
                </label>
                <select id="${p}ex-cat" class="input">
                  ${getAllExpenseCategories().map(c => `<option value="${c.id}" ${normalizeCategory(e.category || 'general') === c.id ? 'selected' : ''}>${lang==='th'?(c.th||c.en):(c.en||c.th)}</option>`).join('')}
                </select>
              </div>
            </div>

            <div class="grid grid-cols-2 gap-3">
              ${showType ? `<div class="input-group"><label class="input-label">${icon('list-checks', 'w-3.5 h-3.5')} ${tx('ประเภท','Type')}</label>
                <select id="${p}ex-type" class="input">
                  <option value="actual" ${!e.isEstimated ? 'selected' : ''}>${tx('จ่ายจริง','Actual')}</option>
                  <option value="estimated" ${e.isEstimated ? 'selected' : ''}>${tx('ประมาณการ','Estimated')}</option>
                </select>
              </div>` : `<input id="${p}ex-type" type="hidden" value="${e.isEstimated ? 'estimated' : 'actual'}">`}
              ${lockItinerary
                ? `<div class="input-group"><label class="input-label">${icon('map-pinned', 'w-3.5 h-3.5')} ${tx('ผูกกับแผนการเดินทาง','Linked place')}</label>
                     <div class="input trail-input" style="display:flex;align-items:center;gap:6px;">${icon('map-pin', 'w-3.5 h-3.5')} <span class="truncate">${escapeHtml(planLabel || e.itineraryItemTitle || '')}</span></div>
                     <input id="${p}ex-itinerary" type="hidden" value="${escapeHtml(e.itineraryItemId || '')}">
                   </div>`
                : ''}
            </div>
          </div>
        </section>

        <!-- 2) จำนวนเงิน -->
        <section class="form-section">
          <div class="form-section-head">
            <span class="form-section-icon">${icon('banknote', 'w-4 h-4')}</span>
            <h3>${tx('จำนวนเงิน', 'Amount')}</h3>
          </div>
          <div class="space-y-3">
            <div class="grid grid-cols-3 gap-3">
              <div class="input-group col-span-2"><label class="input-label">${icon('banknote', 'w-3.5 h-3.5')} ${tx('ยอดก่อนส่วนลด / VAT / Service Charge','Subtotal before adjustments')} *</label><input id="${p}ex-subtotal" class="input money-input" type="text" inputmode="decimal" required placeholder="0.00" value="${amount(e.subtotalMinor)}"></div>
              <div class="input-group"><label class="input-label">${icon('coins', 'w-3.5 h-3.5')} ${tx('สกุลเงิน','Currency')}</label>
                <select id="${p}ex-currency" class="input">${tripCurrencyList(trip, [e.currency]).map(c => `<option value="${c}" ${currency === c ? 'selected' : ''}>${c}</option>`).join('')}</select>
              </div>
            </div>

            <div class="grid grid-cols-3 gap-3">
              <div class="input-group"><label class="input-label">${icon('ticket', 'w-3.5 h-3.5')} ${tx('ส่วนลด','Discount')}</label><input id="${p}ex-discount" class="input money-input" type="text" inputmode="decimal" value="${amount(e.discountMinor) || 0}"></div>
              <div class="input-group"><label class="input-label">${icon('concierge-bell', 'w-3.5 h-3.5')} Service Charge</label><input id="${p}ex-service" class="input money-input" type="text" inputmode="decimal" value="${amount(e.serviceMinor) || 0}"></div>
              <div class="input-group"><label class="input-label">${icon('receipt-text', 'w-3.5 h-3.5')} VAT / Tax</label><input id="${p}ex-tax" class="input money-input" type="text" inputmode="decimal" value="${amount(e.taxMinor) || 0}"></div>
            </div>

            <div class="input-group"><label class="input-label">${icon('arrow-left-right', 'w-3.5 h-3.5')} ${tx('เรทเป็น THB','Rate to THB')}</label><input id="${p}ex-thb-rate" class="input" type="number" step="0.0001" min="0" value="${e.thbRate || resolveTripThbRate(trip, expenseRates, currency) || ''}"></div>

            <div id="${p}net-preview" class="p-4 rounded-xl text-sm font-bold border flex items-center gap-2" style="border-color: var(--border); background: var(--bg-secondary);">${icon('calculator', 'w-4 h-4')} ${t('netTotal')}: --</div>
            <div id="${p}thb-preview" class="p-3 rounded-xl border text-sm flex items-center gap-2" style="border-color: color-mix(in srgb, var(--success) 35%, transparent); background: var(--success-bg); color: var(--success);">${icon('banknote', 'w-4 h-4')} THB: --</div>
          </div>
        </section>

        <!-- 3) คนจ่ายและการแบ่ง -->
        <section class="form-section">
          <div class="form-section-head">
            <span class="form-section-icon">${icon('users', 'w-4 h-4')}</span>
            <h3>${tx('คนจ่ายและการแบ่งจ่าย', 'Payer & split')}</h3>
          </div>
          <div class="space-y-4">
            <div class="input-group">
              <label class="input-label">${icon('user', 'w-3.5 h-3.5')} ${tx('คนจ่าย (เลือกได้หลายคน)','Paid by (select one or more)')} *</label>
              <div id="${p}payer-tiles" class="tile-grid">
                ${members.map(m => `
                  <button type="button" class="tile ${initialPayers.has(m.id) ? 'tile-selected' : ''}" data-payer="${m.id}" title="${escapeHtml(m.displayName)}">
                    <span class="flex items-center gap-2 min-w-0">
                      <span class="avatar w-8 h-8 text-xs" style="background:${m.color || 'var(--primary)'};width:32px;height:32px;">${m.photoURL ? `<img src="${escapeHtml(m.photoURL)}" class="w-full h-full rounded-full object-cover" alt="">` : escapeHtml(getInitials(m.displayName))}</span>
                      <span class="text-sm font-medium truncate">${escapeHtml(m.displayName)}</span>
                    </span>
                  </button>`).join('') || `<p class="text-sm text-[var(--text-secondary)]">${tx('ยังไม่พบสมาชิกในทริปนี้','No members found in this trip')}</p>`}
              </div>
            </div>

        <div class="grid grid-cols-2 gap-3">
          <div class="input-group"><label class="input-label">${icon('credit-card', 'w-3.5 h-3.5')} ${tx('วิธีจ่าย','Payment method')}</label>
            <select id="${p}ex-payment" class="input">
              <option value="cash" ${(e.paymentMethod || 'cash') === 'cash' ? 'selected' : ''}>${tx('เงินสด','Cash')}</option>
              <option value="card" ${e.paymentMethod === 'card' ? 'selected' : ''}>${tx('บัตรเครดิต','Card')}</option>
              <option value="transfer" ${e.paymentMethod === 'transfer' ? 'selected' : ''}>${tx('โอนเงิน','Transfer')}</option>
            </select>
          </div>
          <div class="input-group" id="${p}ex-card-group">
            <label class="input-label flex items-center justify-between">${icon('credit-card', 'w-3.5 h-3.5')} ${tx('บัตรเครดิต','Credit card')}
              <button type="button" id="${p}ex-manage-cards" class="link-btn text-[10px]">${icon('settings-2', 'w-3 h-3')} ${tx('จัดการบัตร','Manage cards')}</button>
            </label>
            <!-- Managed dropdown only — the trip's card list prevents random card names -->
            <select id="${p}ex-card" class="input"></select>
            <p class="input-hint">${tx('เลือกได้เฉพาะบัตรที่ลงทะเบียนไว้ของทริป — เพิ่ม/แก้ไข/ลบที่ “จัดการบัตร”','Only registered trip cards can be picked — add/edit/delete via “Manage cards”')}</p>
          </div>
        </div>

            <div id="${p}payer-amounts"></div>
            <div class="input-group">
              <div class="flex items-center justify-between">
                <label class="input-label">${icon('split', 'w-3.5 h-3.5')} ${tx('ใครหารด้วย','Who shares')}</label>
                <button type="button" id="${p}share-all" class="btn btn-ghost btn-sm text-[10px]" style="min-height:26px;padding:2px 8px;">${tx('เลือกทั้งหมด','Select all')}</button>
              </div>
              <div id="${p}share-tiles" class="tile-grid">
                ${members.map(m => `
                  <button type="button" class="tile ${selectedShare.some(x => x.id === m.id) ? 'tile-selected' : ''}" data-share="${m.id}" title="${escapeHtml(m.displayName)}">
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
            <div id="${p}split-area" class="space-y-3"></div>
          </div>
        </section>

        <!-- 4) ข้อมูลเพิ่มเติม -->
        <section class="form-section">
          <div class="form-section-head">
            <span class="form-section-icon">${icon('info', 'w-4 h-4')}</span>
            <h3>${tx('หลักฐานและข้อมูลเพิ่มเติม (ไม่บังคับ)', 'Receipt & extra details (optional)')}</h3>
          </div>
          <div class="space-y-3">
        ${lockItinerary ? '' : `<div class="input-group">
          <label class="input-label">${icon('map-pinned', 'w-3.5 h-3.5')} ${tx('ผูกกับแผนการเดินทาง','Linked itinerary place')}</label>
          <select id="${p}ex-itinerary" class="input">
            <option value="">${tx('— ไม่ผูก —','— none —')}</option>
            ${items.map(it => `<option value="${it.id}" ${e.itineraryItemId === it.id ? 'selected' : ''}>${escapeHtml(it.date || '')} • ${escapeHtml(it.title)}</option>`).join('')}
          </select>
        </div>`}


        <div class="input-group">
          <label class="input-label">${icon('image-plus', 'w-3.5 h-3.5')} ${tx('รูปใบเสร็จ (ไม่บังคับ)','Receipt photo (optional)')}</label>
          <div class="receipt-upload">
            <div id="${p}ex-receipt-preview" class="receipt-upload-preview ${e.receiptImage ? '' : 'hidden'}">
              ${e.receiptImage ? `<img src="${escapeHtml(e.receiptImage)}" alt="receipt">` : ''}
            </div>
            <div class="btn-row">
              <label class="btn btn-secondary btn-sm" for="${p}ex-receipt-file">${icon('upload', 'w-4 h-4')} ${tx('เลือกรูป','Choose photo')}</label>
              <input id="${p}ex-receipt-file" type="file" accept="image/*" class="hidden">
              <button type="button" id="${p}ex-receipt-clear" class="btn btn-ghost btn-sm ${e.receiptImage ? '' : 'hidden'}">${icon('trash-2', 'w-4 h-4')} ${tx('ลบรูป','Remove')}</button>
            </div>
          </div>
        </div>

        <div class="input-group"><label class="input-label">${icon('link', 'w-3.5 h-3.5')} ${tx('ลิงก์ใบเสร็จ','Receipt URL')}</label><input id="${p}ex-receipt" class="input" placeholder="https://..." value="${escapeHtml(e.receiptUrl || '')}"></div>

        <div class="input-group"><label class="input-label">${icon('align-left', 'w-3.5 h-3.5')} ${tx('รายละเอียด','Description')}</label><textarea id="${p}ex-desc" class="input" style="min-height:70px;">${escapeHtml(e.description || '')}</textarea></div>
          </div>
        </section>`;
}

/**
 * Wire one expense form (already in the DOM inside `root`) and hand back a small
 * API: read the numbers, validate them and build the Firestore payload.
 *
 * Both callers (the page and the plan's sheet) get exactly the same behaviour —
 * multi-payer amounts, equal/unequal split with auto-distribution, VAT/SC
 * inclusion, managed cards, receipt photo, itinerary link.
 */
function mountExpenseForm({
  root = document, prefix = '', e = {}, members = [], items = [], trip = null,
  tripId = null, currency = 'THB', baseCurrency = 'THB', expenseRates = [], lang = 'th'
} = {}) {
  const tx = (a, b) => (lang === 'th' ? a : b);
  const idOf = (name) => `${prefix}${name}`;
  // jsdom has no global CSS object (and no CSS.escape) — never assume it exists.
  const esc = (name) => (window.CSS && window.CSS.escape ? window.CSS.escape(idOf(name)) : idOf(name));
  const $ = (name) => root.querySelector(`[id="${esc(name)}"]`);
  const on = (name, evt, fn) => { const node = $(name); if (node) node.addEventListener(evt, fn); return node; };

  const decimalsFor = (cur) => getCurrencyDecimals(cur);
  const initialPayments = expensePayments(e);
  const initialPayers = new Set(initialPayments.length ? initialPayments.map(p => p.memberId) : [members[0]?.id || currentUser.uid]);

  /* ---- payment method → managed card dropdown ---- */
  const paymentSel = $('ex-payment');
  const cardGroup = $('ex-card-group');
  const cardInput = $('ex-card');

  function fillCardOptions(keep = '') {
    if (!cardInput) return;
    const cards = tripCards(currentTrip);
    const selected = keep || e.cardName || '';
    const known = cards.some(c => c.name === selected);
    cardInput.innerHTML = `
      <option value="">${cards.length ? tx('— เลือกบัตร —', '— pick a card —') : tx('— ยังไม่มีบัตรในทริป —', '— no trip cards yet —')}</option>
      ${cards.map(c => `<option value="${escapeHtml(c.name)}" ${c.name === selected ? 'selected' : ''}>${escapeHtml(tripCardLabel(c))}${c.holderId ? ` (${escapeHtml(members.find(m => m.id === c.holderId)?.displayName || '')})` : ''}</option>`).join('')}
      ${selected && !known ? `<option value="${escapeHtml(selected)}" selected>${escapeHtml(selected)} ${tx('(ของเดิม)', '(legacy)')}</option>` : ''}
      <option value="__manage">${tx('➕ เพิ่ม / จัดการบัตร…', '➕ Add / manage cards…')}</option>`;
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
  on('ex-manage-cards', 'click', openCardsFromForm);

  const syncCardField = () => {
    const isCard = paymentSel?.value === 'card';
    cardGroup?.classList.toggle('hidden', !isCard);
    if (!isCard && cardInput) cardInput.value = '';
  };
  paymentSel?.addEventListener('change', syncCardField);
  syncCardField();

  /* ---- receipt photo (optional): preview now, upload when the caller saves ---- */
  let pendingReceiptFile = null;
  let receiptCleared = false;
  const receiptFileInput = $('ex-receipt-file');
  const receiptPreview = $('ex-receipt-preview');
  const receiptClearBtn = $('ex-receipt-clear');

  const setReceiptPreview = (src) => {
    if (!receiptPreview) return;
    receiptPreview.innerHTML = src ? `<img src="${src}" alt="receipt">` : '';
    receiptPreview.classList.toggle('hidden', !src);
    receiptClearBtn?.classList.toggle('hidden', !src);
  };

  receiptFileInput?.addEventListener('change', async () => {
    const file = receiptFileInput.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error(tx('เลือกไฟล์รูปภาพเท่านั้น','Pick an image file')); return; }
    if (file.size > 12 * 1024 * 1024) { toast.error(tx('รูปใหญ่เกินไป (สูงสุด 12MB)','Image too large (max 12MB)')); return; }
    pendingReceiptFile = file;
    receiptCleared = false;
    try {
      const reader = new FileReader();
      reader.onload = () => setReceiptPreview(String(reader.result));
      reader.readAsDataURL(file);
    } catch { setReceiptPreview(''); }
    toast.success(tx('แนบรูปแล้ว — จะอัปโหลดตอนบันทึก','Attached — it uploads when you save'));
  });

  on('ex-receipt-clear', 'click', () => {
    pendingReceiptFile = null;
    receiptCleared = true;
    if (receiptFileInput) receiptFileInput.value = '';
    setReceiptPreview('');
  });

  /* ---- state ---- */
  const selectedPayers = new Set(initialPayers);
  const payerAmounts = Object.fromEntries(initialPayments.map(p => [p.memberId, formatAmount(fromMinor(p.amountMinor, decimalsFor(e.currency || currency)), decimalsFor(e.currency || currency))]));
  let selectedShare = new Set(members.filter(m => {
    if (!e.allocations) return true;
    return e.allocations.some(a => a.memberId === m.id);
  }).map(m => m.id));
  // A prefilled expense whose shares are all the same IS an equal split — even when
  // the old document never spelled it out (documents written by the plan don't).
  // Treating it as a hand-made split left the rows disagreeing with a changed total.
  const storedAllocs = (Array.isArray(e.allocations) ? e.allocations : []).filter(a => a && a.memberId);
  const storedNetMinor = Number(e.netTotalMinor) || storedAllocs.reduce((n, a) => n + (Number(a.amountMinor) || 0), 0);
  const storedIsEqual = storedAllocs.length > 0 && storedNetMinor > 0
    && splitEqual(storedNetMinor, storedAllocs.map(a => a.memberId))
      .every(a => storedAllocs.find(x => x.memberId === a.memberId)?.amountMinor === a.amountMinor);
  let splitMethod = e.splitMethod || (e.allocations?.length ? (storedIsEqual ? 'equal' : 'unequal') : 'equal');
  let customAllocations = e.splitInputs || Object.fromEntries((e.allocations || []).map(a => [a.memberId, formatAmount(fromMinor(a.amountMinor, decimalsFor(e.currency || currency)), decimalsFor(e.currency || currency))]));
  let lockedAllocations = new Set(Object.keys(customAllocations));   // IDs whose custom amount was manually set
  let allocationTouched = false;   // did the user type in a custom-split row in THIS session?
  let splitIncludesVatSc = e.splitIncludesVatSc !== false;        // true = custom amounts include VAT/SC, false = exclude

  const shareTiles = () => root.querySelectorAll(`[id="${esc('share-tiles')}"] [data-share]`);
  const payerTiles = () => root.querySelectorAll(`[id="${esc('payer-tiles')}"] [data-payer]`);

  payerTiles().forEach(btn => btn.addEventListener('click', () => {
    const id = btn.dataset.payer;
    if (selectedPayers.has(id)) { selectedPayers.delete(id); delete payerAmounts[id]; }
    else { selectedPayers.add(id); payerAmounts[id] = ''; }
    btn.classList.toggle('tile-selected', selectedPayers.has(id));
    renderPayers();
  }));

  shareTiles().forEach(btn => btn.addEventListener('click', () => {
    const id = btn.dataset.share;
    if (selectedShare.has(id)) { selectedShare.delete(id); btn.classList.remove('tile-selected'); }
    else { selectedShare.add(id); btn.classList.add('tile-selected'); }
    renderSplitArea();
  }));

  on('share-all', 'click', () => {
    const isAll = selectedShare.size === members.length;
    selectedShare = new Set(isAll ? [] : members.map(m => m.id));
    shareTiles().forEach(t => t.classList.toggle('tile-selected', !isAll));
    renderSplitArea();
  });

  const netPreview = $('net-preview');
  const thbPreview = $('thb-preview');

  bindMoneyInputs(root);
  root.querySelectorAll('[data-split]').forEach(b => b.classList.toggle('active', b.dataset.split === splitMethod));

  function readValues() {
    const cur = $('ex-currency').value;
    const dec = decimalsFor(cur);
    const read = name => fromMinor(toMinor(parseCurrencyInput($(name).value), dec), dec);
    const sub = read('ex-subtotal'), disc = read('ex-discount'), serv = read('ex-service'), tax = read('ex-tax');
    const rate = cur === 'THB' ? 1 : parseFloat($('ex-thb-rate').value) || 0;
    const net = Math.max(0, sub - disc + serv + tax);
    return { sub, disc, serv, tax, rate, cur, net, netMinor: toMinor(net, decimalsFor(cur)) };
  }

  function updateNet() {
    const v = readValues();
    $('ex-thb-rate').disabled = v.cur === 'THB';
    if (v.cur === 'THB') $('ex-thb-rate').value = '1';
    if (netPreview) netPreview.innerHTML = `${icon('calculator', 'w-4 h-4')} ${t('netTotal')}: ${moneyHtml(v.netMinor, v.cur, v.rate)}`;
    if (thbPreview) thbPreview.innerHTML = v.rate > 0 ? `${tx('เรท','Rate')}: 1 ${v.cur} = ${formatAmount(v.rate, 4)} THB` : tx('กรุณาระบุเรทแลกเป็นเงินบาทก่อนบันทึก','Enter the THB exchange rate before saving');
    renderPayers();
    queueIcons();
    renderSplitArea();
  }

  on('ex-currency', 'change', () => {
    const cur = $('ex-currency').value;
    $('ex-thb-rate').value = cur === e.currency && e.thbRate ? e.thbRate : resolveTripThbRate(trip, expenseRates, cur) || '';
    updateNet();
  });

  ['ex-subtotal', 'ex-discount', 'ex-service', 'ex-tax', 'ex-currency', 'ex-thb-rate'].forEach(name => {
    const node = $(name);
    if (node) node.addEventListener('input', updateNet);
  });

  function renderSplitArea() {
    const area = $('split-area');
    if (!area) return;
    const v = readValues();
    const ids = members.filter(m => selectedShare.has(m.id));
    const dec = decimalsFor(v.cur);
    if (!members.length) { area.innerHTML = ''; return; }
    if (!ids.length) {
      area.innerHTML = `<p class="text-xs" style="color:var(--danger);">${tx('เลือกอย่างน้อย 1 คนที่ร่วมหาร','Pick at least one person to share')}</p>`;
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
          <span class="text-[11px] font-bold flex-shrink-0">${icon('calculator', 'w-3.5 h-3.5')} ${tx('ยอดที่กรอก','Amounts')}:</span>
          <div class="segmented" style="flex:1;min-height:28px;">
            <button type="button" data-vatsc="include" class="segmented-item ${splitIncludesVatSc ? 'active' : ''}" style="font-size:11px;padding:4px 8px;">${tx('ยอดสุทธิ (รวมทุกอย่างแล้ว)','Final amounts')}</button>
            <button type="button" data-vatsc="exclude" class="segmented-item ${!splitIncludesVatSc ? 'active' : ''}" style="font-size:11px;padding:4px 8px;">${tx('ยอดก่อนส่วนลด / VAT / SC','Before adjustments')}</button>
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
            <input data-alloc="${m.id}" aria-label="${escapeHtml(m.displayName)} ${tx('ยอดที่กรอก','Entered amount')}" class="input split-input money-input" type="text" inputmode="decimal" step="0.01" min="0" placeholder="0.00" value="${escapeHtml(displayValue)}" style="min-height:36px;padding:6px 10px;font-size:13px;">
            <button type="button" class="split-lock-btn ${isLocked ? 'is-locked' : ''}" data-lock="${m.id}" title="${isLocked ? tx('ปลดล็อก — จะถูกระบบกระจายยอดอัตโนมัติ','Unlock — will be auto-distributed') : tx('ล็อกยอดนี้ไว้ ไม่ให้ระบบแก้','Lock this amount')}">${icon(isLocked ? 'lock' : 'unlock', 'w-3 h-3')}</button>
            <span class="split-final ${isLocked ? '' : 'split-computed'}" data-alloc-final title="${isLocked ? '' : tx('กระจายอัตโนมัติ','Auto-distributed')}">—</span>
          </div>`;
      }).join('');

      // Summary line (its text is patched in place while typing)
      const summaryHint = `
        <div class="split-auto-hint">
          ${icon('info', 'w-3.5 h-3.5')}
          <span data-split-hint></span>
        </div>`;

      area.innerHTML = vatScToggle + `<div class="split-columns"><span>${tx('สมาชิก','Member')}</span><span>${tx('ยอดที่กรอก','Input')}</span><span></span><span>${tx('ยอดสุทธิ','Final share')}</span></div>` + rows + summaryHint + '<div data-split-warning role="alert" aria-live="polite"></div><div data-adjustment-summary class="split-adjustments"></div>';
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
        allocationTouched = true;
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
        allocationTouched = true;
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
   * A prefilled custom split is a snapshot of an OLDER total. Until the user touches
   * a row, the entered shares are re-fitted proportionally when the amount changes —
   * so editing the cost of a place is never a dead end (“ยอดแบ่งไม่ตรง”).
   */
  function refitPrefilledAllocations(area, v, ids, dec) {
    if (allocationTouched) return;
    const entered = ids.filter(m => customAllocations[m.id] !== undefined && customAllocations[m.id] !== '');
    if (!entered.length || entered.length !== ids.length) return;   // partial → the auto-distributor handles it
    const target = splitIncludesVatSc ? v.netMinor : toMinor(v.sub, dec);
    const rows = entered.map(m => ({ memberId: m.id, amountMinor: toMinor(parseCurrencyInput(customAllocations[m.id]), dec) }));
    const total = rows.reduce((n, r) => n + r.amountMinor, 0);
    if (!total || total === target) return;
    let put = 0;
    rows.forEach((r, i) => {
      const share = i === rows.length - 1
        ? Math.max(0, target - put)
        : Math.max(0, Math.round((r.amountMinor * target) / total));
      put += share;
      const text = formatAmount(fromMinor(share, dec), dec);
      customAllocations[r.memberId] = text;
      const inp = area.querySelector(`[data-alloc="${r.memberId}"]`);
      if (inp) inp.value = text;
    });
  }

  /**
   * Light-weight update for the custom split: patches the computed per-person
   * values, lock buttons and the summary hint in place. It never touches the
   * <input> elements, so the field being typed keeps focus and the mobile
   * keyboard stays open — no "tap again per digit" problem.
   */
  function refreshSplitComputed() {
    const area = $('split-area');
    if (!area || splitMethod !== 'unequal' || !area.querySelector('[data-alloc]')) return;
    const v = readValues();
    const ids = members.filter(m => selectedShare.has(m.id));
    const dec = decimalsFor(v.cur);
    if (!ids.length) return;
    refitPrefilledAllocations(area, v, ids, dec);
    const computed = computeCustomAllocations(v, ids, dec);
    ids.forEach(m => {
      const entered = customAllocations[m.id];
      const isEntered = entered !== undefined && entered !== '';
      const row = area.querySelector(`.split-row[data-member="${m.id}"]`);
      if (!row) return;
      const finalEl = row.querySelector('[data-alloc-final]');
      if (finalEl) {
        const val = computed[m.id] ?? 0;
        finalEl.innerHTML = moneyHtml(toMinor(val, dec), v.cur, v.rate);
        finalEl.classList.toggle('split-computed', !isEntered);
        finalEl.title = isEntered ? '' : tx('กระจายอัตโนมัติ', 'Auto-distributed');
      }
      const lockBtn = row.querySelector('[data-lock]');
      if (lockBtn) {
        const isLocked = lockedAllocations.has(m.id);
        lockBtn.classList.toggle('is-locked', isLocked);
        lockBtn.title = isLocked ? tx('ปลดล็อก — จะถูกระบบกระจายยอดอัตโนมัติ', 'Unlock — will be auto-distributed') : tx('ล็อกยอดนี้ไว้ ไม่ให้ระบบแก้', 'Lock this amount');
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
    if (hintText) hintText.textContent = `${tx('กรอกแล้ว','Entered')} ${fmt(result.enteredMinor)} • ${tx('เป้าหมาย','Target')} ${fmt(splitIncludesVatSc ? v.netMinor : toMinor(v.sub, dec))}` + (result.unfilledCount ? ` • ${tx('กระจายยอดที่เหลือให้','Remainder shared by')} ${result.unfilledCount} ${tx('คน','people')}` : '');
    const warning = area.querySelector('[data-split-warning]');
    warning.className = result.valid ? '' : 'split-warning';
    warning.textContent = result.valid ? '' : `${tx('ยอดแบ่งไม่ตรง กรุณาตรวจสอบก่อนบันทึก','Split mismatch — check before saving')} • ${tx('ส่วนต่าง','Difference')} ${fmt(Math.abs(result.differenceMinor))}`;
    const summary = area.querySelector('[data-adjustment-summary]');
    summary.innerHTML = splitIncludesVatSc ? '' : `<p>${tx('กระจายตามสัดส่วนยอดก่อนปรับของแต่ละคน','Adjustments proportional to each person’s subtotal')}: ${tx('ส่วนลด','Discount')} −${fmt(toMinor(v.disc, dec))} · Service Charge +${fmt(toMinor(v.serv, dec))} · VAT +${fmt(toMinor(v.tax, dec))}</p>` + result.rows.map(r => `<div><b>${escapeHtml(members.find(m => m.id === r.memberId)?.displayName || '')}</b><span>${fmt(r.subtotalMinor)} − ${fmt(r.discountMinor)} + ${fmt(r.serviceMinor)} + ${fmt(r.taxMinor)} = <b>${fmt(r.amountMinor)}</b></span></div>`).join('');
  }

  function customResult(v, ids) {
    const dec = decimalsFor(v.cur);
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
    return ids.map(memberId => ({ memberId, amountMinor: toMinor(parseCurrencyInput(payerAmounts[memberId]), decimalsFor(v.cur)) }));
  }

  function refreshPayerTotal() {
    const v = readValues();
    const payments = readPayments(v);
    const diff = v.netMinor - payments.reduce((n, p) => n + p.amountMinor, 0);
    const hint = $('payer-total-hint');
    if (!hint) return;
    hint.className = validatePayments(v.netMinor, payments) ? 'input-hint' : 'split-warning';
    hint.textContent = `${tx('ยอดผู้จ่ายรวม','Total paid')} ${formatCurrency(v.netMinor - diff, v.cur)} / ${formatCurrency(v.netMinor, v.cur)}` + (diff ? ` • ${tx('ยอดยังไม่ตรง ส่วนต่าง','Mismatch, difference')} ${formatCurrency(Math.abs(diff), v.cur)}` : ' ✓');
  }

  function renderPayers() {
    const area = $('payer-amounts');
    if (!area) return;
    const v = readValues();
    area.innerHTML = `<p class="input-hint">${tx('เลือกผู้จ่ายได้หลายคน แล้วระบุยอดที่แต่ละคนจ่ายจริงให้รวมเท่ายอดสุทธิ','Select payers and enter what each paid. Payments must match the net total.')}</p>` + (selectedPayers.size > 1 ? members.filter(m => selectedPayers.has(m.id)).map(m => `<label class="payer-amount-row"><span>${escapeHtml(m.displayName)}</span><input class="input money-input" type="text" inputmode="decimal" data-payment="${m.id}" value="${escapeHtml(payerAmounts[m.id] || '')}" placeholder="0.00"><span>${v.cur}</span></label>`).join('') : '') + '<div id="payer-total-hint" aria-live="polite"></div>';
    bindMoneyInputs(area);
    area.querySelectorAll('[data-payment]').forEach(inp => inp.addEventListener('input', () => { payerAmounts[inp.dataset.payment] = inp.value; refreshPayerTotal(); }));
    refreshPayerTotal();
  }

  root.querySelectorAll('[data-split]').forEach(btn => btn.addEventListener('click', () => {
    root.querySelectorAll('[data-split]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    splitMethod = btn.dataset.split;
    renderSplitArea();
  }));

  on('ex-manage-cats', 'click', () => openCategoryManager(tripId, {
    onSaved: () => {
      const sel = $('ex-cat');
      const keep = sel?.value;
      if (sel) {
        sel.innerHTML = getAllExpenseCategories()
          .map(c => `<option value="${c.id}" ${keep === c.id ? 'selected' : ''}>${lang === 'th' ? (c.th || c.en) : (c.en || c.th)}</option>`)
          .join('');
      }
    }
  }));

  updateNet();

  /** Validate everything and hand back the Firestore payload. Throws on error. */
  function collectPayload() {
    const v = readValues();
    if (!v.netMinor) throw new Error(tx('ยอดรวมต้องมากกว่า 0', 'Amount must be greater than 0'));
    const ids = members.filter(m => selectedShare.has(m.id));
    if (!ids.length) throw new Error(tx('เลือกอย่างน้อย 1 คนที่ร่วมหาร', 'Pick at least one person to share'));

    let allocations;
    if (splitMethod === 'equal') {
      allocations = splitEqual(v.netMinor, ids.map(m => m.id));
    } else {
      const result = customResult(v, ids);
      if (!result.valid) throw new Error(tx('ยอดแบ่งไม่ตรง กรุณาแก้ไขยอดที่กรอกก่อนบันทึก','Split amounts do not match. Correct the amounts before saving.'));
      allocations = result.rows.map(({ memberId, amountMinor }) => ({ memberId, amountMinor }));
    }
    const payments = readPayments(v);
    if (!validatePayments(v.netMinor, payments)) throw new Error(tx('ยอดผู้จ่ายรวมต้องเท่ากับยอดสุทธิ และต้องเลือกผู้จ่ายอย่างน้อย 1 คน','Payments must match the net total. Select at least one payer.'));
    if (v.cur !== 'THB' && (!Number.isFinite(v.rate) || !(v.rate > 0))) throw new Error(tx('กรุณาระบุเรทแลกเป็นเงินบาท','Enter the THB exchange rate'));
    if ([v.sub, v.disc, v.serv, v.tax].some(n => n < 0) || v.disc > v.sub) throw new Error(tx('ยอดเงินต้องไม่ติดลบ และส่วนลดต้องไม่เกินยอดก่อนปรับ','Amounts must be non-negative and discount cannot exceed subtotal'));
    const payMethod = $('ex-payment').value;
    const pickedCard = payMethod === 'card' ? ($('ex-card')?.value || '').trim() : '';
    if (payMethod === 'card' && (!pickedCard || pickedCard === '__manage')) {
      throw new Error(tx('เลือกบัตรเครดิตจากรายการ หรือเพิ่มบัตรใหม่จากปุ่ม “จัดการบัตร”','Pick a card from the list, or add one via “Manage cards”'));
    }
    const title = $('ex-title').value.trim();
    if (!title) throw new Error(tx('กรุณากรอกชื่อรายการ', 'Title is required'));
    const curDec = decimalsFor(v.cur);
    return {
      title,
      date: $('ex-date').value,
      category: $('ex-cat').value,
      description: $('ex-desc').value.trim(),
      subtotalMinor: toMinor(v.sub, curDec),
      discountMinor: toMinor(v.disc, curDec),
      serviceMinor: toMinor(v.serv, curDec),
      taxMinor: toMinor(v.tax, curDec),
      netTotalMinor: v.netMinor,
      currency: v.cur,
      baseCurrency,
      thbRate: v.rate,
      thbMinor: toThbMinor(v.netMinor, v.cur, v.rate),
      isEstimated: $('ex-type').value === 'estimated',
      payerId: payments[0].memberId,
      payments,
      splitMethod,
      splitIncludesVatSc,
      splitInputs: customAllocations,
      allocations,
      paymentMethod: payMethod,
      cardName: pickedCard,
      receiptUrl: $('ex-receipt').value.trim(),
      itineraryItemId: $('ex-itinerary')?.value || null,
      status: 'active',
      // Saving through this form always has a payer → clears any "TBD host".
      payerPending: false,
      source: e.source || 'manual'
    };
  }

  return {
    collectPayload,
    readValues,
    refresh: updateNet,
    money: (minor, cur = currency) => formatCurrency(minor || 0, cur),
    takePendingReceipt: () => ({ file: pendingReceiptFile, cleared: receiptCleared }),
    clearPendingReceipt: () => { pendingReceiptFile = null; }
  };
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
      <form id="expense-form" class="expense-form card card-accent p-6">
        ${expenseFormSectionsHtml({ prefix: '', e, members, items, trip, lang, currency, expenseRates })}
        <div class="flex gap-3 form-submit-row">
          ${isEdit ? `<button type="button" id="ex-delete" class="btn" style="background:var(--danger-bg);color:var(--danger);border:1.5px solid color-mix(in srgb, var(--danger) 35%, transparent);">${icon('trash-2', 'w-4 h-4')}</button>` : ''}
          <button type="button" id="cancel-expense" class="btn btn-secondary flex-1">${t('cancel')}</button>
          <button type="submit" id="submit-expense" class="btn btn-primary flex-1">${icon('save', 'w-4 h-4')} ${t('save')}</button>
        </div>
      </form>
    </div>
  `;
  queueIcons();

  const form = mountExpenseForm({
    root: document, prefix: '', e, members, items, trip, tripId, lang,
    currency, baseCurrency, expenseRates
  });

  // Manage the trip's expense groups / comments straight from the form.
  bind('ex-comments-btn', 'click', () => openCommentSheet({
    tripId,
    expenseId: editId,
    title: e.title || '',
    comments: tripComments,
    onChanged: () => { /* badge refreshes on the next open */ }
  }));

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
      const payload = form.collectPayload();
      let savedId = editId;
      const me = actor();
      payload.createdByName = me.displayName;
      payload.updatedByName = me.displayName;
      if (isEdit) {
        await updateExpense(tripId, editId, payload, currentUser.uid, me);
      } else {
        savedId = await addExpense(tripId, payload, currentUser.uid, me);
      }
      // Card name → remember locally so the next expense can pick it from a list.
      if (payload.cardName) rememberCard(tripId, payload.cardName);

      // Linked place → keep the plan's estimate in step with the money book, so
      // the same cost never reads differently on the two screens.
      await syncPlanEstimateFromExpense(tripId, payload, savedId);

      // The audit entry is written after the local bookkeeping above, so a slow
      // log write can never delay (or block) the user-visible result.
      await logActivity(tripId, {
        type: isEdit ? 'expense.update' : 'expense.create',
        targetId: savedId,
        title: payload.title,
        detail: `${formatCurrency(payload.netTotalMinor || 0, payload.currency || currency)} • ${payload.date || ''}`,
        user: me
      });

      // The expense itself is already saved — close the save spinner BEFORE the
      // photo step so a slow upload can never look like "saving" is stuck.
      tLoad.close();

      // Receipt photo: uploaded after save (needs the expense id) and stored on
      // the document. Storage when available, inlined image otherwise.
      const { file: pendingReceiptFile, cleared: receiptCleared } = form.takePendingReceipt();
      if (pendingReceiptFile && savedId) {
        const tUpload = toast.loading(th('กำลังอัปโหลดรูปใบเสร็จ…', 'Uploading receipt photo…'));
        try {
          const res = await uploadReceiptImage(tripId, savedId, pendingReceiptFile);
          if (res.url) {
            await updateExpense(tripId, savedId, { receiptImage: res.url, receiptStorage: res.storage }, currentUser.uid, me);
            if (res.storage === 'inline') toast.info(th('เก็บรูปไว้ในเอกสารของทริปนี้', 'Photo stored inside the trip document'));
          } else {
            toast.warning(th('อัปโหลดรูปไม่สำเร็จ — บันทึกค่าใช้จ่ายไว้แล้ว', 'Photo upload failed — the expense was still saved'));
          }
        } catch (photoErr) {
          // The expense is saved already — a photo failure must never block finishing.
          console.warn('receipt save failed', photoErr);
          toast.warning(th('อัปโหลดรูปใบเสร็จไม่สำเร็จ — บันทึกค่าใช้จ่ายไว้แล้ว', 'Receipt photo failed — the expense was still saved'));
        } finally {
          tUpload.close();
        }
      } else if (isEdit && receiptCleared) {
        try {
          await updateExpense(tripId, savedId, { receiptImage: '', receiptStorage: 'none' }, currentUser.uid, me);
        } catch (e) { console.warn('clear receipt failed', e?.message); }
      }
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

/**
 * One expense, edited from the plan (a request): “แก้ไขค่าใช้จ่าย” on an itinerary
 * card opens the very same form the expenses page uses — inside a bottom sheet —
 * so the fields, the sections, the payers/split widgets and the validation are
 * identical wherever the cost is opened. Saving writes the expense book AND keeps
 * the place's estimate fields in step; a link jumps to the full page editor.
 */
async function openItemExpenseSheet({ tripId, item, trip = null, members = [], items = [], expense: initial = null, lang = 'th', onSaved = null }) {
  const th = (a, b) => (lang === 'th' ? a : b);
  const baseCurrency = trip?.baseCurrency || 'THB';
  let expense = initial;
  if (!expense) {
    const linkedId = item.expenseId || null;
    try {
      expense = (linkedId ? await getExpense(tripId, linkedId) : null) || await findLinkedExpense(tripId, item.id);
    } catch (err) { console.warn('[Plan] linked expense lookup failed', err?.message); }
  }
  const expenseRates = await fetchAllExpenses(tripId).catch(() => []);
  const e = expense || {
    title: item.title || '',
    date: item.date || dayjs().format('YYYY-MM-DD'),
    category: item.estimateCategory || expenseGroupForChoice(item.category || 'general'),
    currency: item.estimateCurrency || baseCurrency,
    subtotalMinor: toMinor(Number(item.estimateAmount) || 0, getCurrencyDecimals(item.estimateCurrency || baseCurrency)),
    isEstimated: true,
    source: 'itinerary-estimate',
    itineraryItemId: item.id,
    paymentMethod: 'cash'
  };

  const sheet = showBottomSheet(`
    <div class="space-y-4">
      <div class="flex items-start gap-3">
        <div class="row-icon" style="width:40px;height:40px;border-radius:14px;background:var(--gradient-primary);color:#fff;">${icon('receipt', 'w-5 h-5')}</div>
        <div class="min-w-0 flex-1">
          <h3 class="font-bold text-base leading-tight" style="font-family: var(--font-display);">${expense ? th('แก้ไขค่าใช้จ่าย','Edit expense') : th('เพิ่มค่าใช้จ่ายให้สถานที่นี้','Add a cost to this place')}</h3>
          <p class="text-[11px] text-[var(--text-secondary)] flex items-center gap-1 flex-wrap">
            ${icon('map-pinned', 'w-3 h-3')} <span class="truncate">${escapeHtml(item.title || '')}</span>
            <span class="badge badge-planned text-[10px]">${th('เมนูเดียวกับหน้าค่าใช้จ่าย','same form as the expenses page')}</span>
          </p>
        </div>
        <button class="btn btn-ghost btn-sm" id="sh-close">${icon('x', 'w-4 h-4')}</button>
      </div>
      <form id="sh-expense-form" class="expense-form">
        ${expenseFormSectionsHtml({ prefix: 'sh-', e, members, items, trip, lang, currency: e.currency || baseCurrency, expenseRates, lockItinerary: true, planLabel: item.title || '' })}
        <div class="btn-row form-submit-row">
          ${expense ? `<button type="button" id="sh-open-page" class="btn btn-ghost btn-sm">${icon('external-link', 'w-3.5 h-3.5')} ${th('เปิดหน้าเต็ม','Open full page')}</button>` : ''}
          <button type="button" id="sh-cancel" class="btn btn-secondary flex-1">${t('cancel')}</button>
          <button type="submit" id="sh-save" class="btn btn-primary flex-1">${icon('save', 'w-4 h-4')} ${t('save')}</button>
        </div>
      </form>
    </div>
  `);
  queueIcons();
  bind('sh-close', 'click', () => sheet.close());
  bind('sh-cancel', 'click', () => sheet.close());
  if (expense) {
    bind('sh-open-page', 'click', () => {
      sheet.close();
      location.hash = `#/trip/${tripId}/expenses/add?id=${expense.id}`;
    });
  }

  const form = mountExpenseForm({
    root: sheet.sheet, prefix: 'sh-', e, members, items, trip, tripId, lang,
    currency: e.currency || baseCurrency, baseCurrency, expenseRates
  });

  document.getElementById('sh-expense-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const btn = document.getElementById('sh-save');
    btn.disabled = true;
    const tLoad = toast.loading(th('กำลังบันทึก...', 'Saving...'));
    try {
      const payload = form.collectPayload();
      payload.itineraryItemId = item.id;
      payload.source = expense?.source || 'itinerary-estimate';
      const me = actor();
      payload.createdByName = me.displayName;
      payload.updatedByName = me.displayName;
      let savedId = expense?.id;
      if (savedId) await updateExpense(tripId, savedId, payload, currentUser.uid, me);
      else savedId = await addExpense(tripId, payload, currentUser.uid, me);
      await syncPlanEstimateFromExpense(tripId, payload, savedId);
      await logActivity(tripId, {
        type: expense ? 'expense.update' : 'expense.create',
        targetId: savedId,
        title: payload.title,
        detail: `${formatCurrency(payload.netTotalMinor || 0, payload.currency || baseCurrency)} • ${payload.date || ''}`,
        user: me
      });

      const { file: pendingReceiptFile } = form.takePendingReceipt();
      if (pendingReceiptFile && savedId) {
        try {
          const res = await uploadReceiptImage(tripId, savedId, pendingReceiptFile);
          if (res.url) await updateExpense(tripId, savedId, { receiptImage: res.url, receiptStorage: res.storage }, currentUser.uid, me);
        } catch (photoErr) { console.warn('receipt save failed', photoErr); }
      }
      form.clearPendingReceipt();
      tLoad.close();
      sheet.close();
      toast.success(th('บันทึกค่าใช้จ่ายแล้ว — แผนอัปเดตตาม','Expense saved — the plan follows'));
      onSaved?.();
    } catch (err) {
      tLoad.close();
      toast.error(err.message);
      btn.disabled = false;
    }
  });
  return sheet;
}

/**
 * Copy a saved expense back onto its linked place (estimate fields + expenseId).
 * The plan keeps its own copy so the card, the day totals and the PNG export stay
 * instant offline, but the numbers always come from the expense book.
 */
async function syncPlanEstimateFromExpense(tripId, payload, expenseId, itemId = null) {
  const target = itemId || payload?.itineraryItemId;
  if (!target || !expenseId) return;
  try {
    const dec = getCurrencyDecimals(payload.currency || 'THB');
    await updateItineraryItem(tripId, target, {
      expenseId,
      estimateAmount: fromMinor(payload.netTotalMinor || 0, dec),
      estimateCurrency: payload.currency || 'THB',
      estimateCategory: payload.category || 'general',
      estimatePayerId: payload.payerId || '',
      estimatePayerPending: payload.payerPending === true,
      estimateShareWith: (payload.allocations || []).map(a => a.memberId),
      estimateAutoAdd: true
    }, currentUser.uid);
  } catch (err) {
    console.warn('[Plan] estimate sync failed', err?.message);
  }
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
        <button class="chip" data-view="debt-map">${icon('map', 'w-3.5 h-3.5')} ${th('แผนที่หนี้','Debt map')}</button>
        <button class="chip" data-view="receipts">${icon('hand', 'w-3.5 h-3.5')} ${th('ใบเสร็จรายคน (ปัดการ์ด)','Receipt cards — swipe')}</button>
        <button class="chip" data-view="receipts-list">${icon('list', 'w-3.5 h-3.5')} ${th('แบบรายการยาว','Long list')}</button>
      </div>

      <div id="settlement-content" class="space-y-4"><div class="skeleton h-32"></div></div>
    </div>
  `;
  queueIcons();

  let state = { expenses: [], members: [], membersMap: {}, statements: [], balances: [], transactions: [] };
  let view = 'overview';   // ภาพรวมเป็นค่าเริ่มต้น (สลับเป็นใบเสร็จรายคนได้)
  let receiptFilter = 'all';  // 'all' = ใบเสร็จทุกคน, หรือ memberId ของคนที่เลือกดู
  // v18: ใบเสร็จรายคนแสดงเป็นการ์ดปัดได้ (Tinder-style) — สลับเป็นรายการยาวได้
  let receiptMode = 'deck';
  // v18.2: “กระทัดรัด” — the detail views can hide the per-item rows and keep
  // only the paid / share / balance answer (remembered per device).
  let receiptDensity = 'full';
  let deckIndex = 0;
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
  /* ---------------- who transfers to whom (the “answer” of the page) -------- */

  /** Transactions of ONE member: what they must send out / receive in. */
  function transfersFor(memberId) {
    const out = state.transactions.filter(t => t.from === memberId);
    const inc = state.transactions.filter(t => t.to === memberId);
    return { out, inc, totalOut: out.reduce((n, t) => n + t.amountMinor, 0), totalIn: inc.reduce((n, t) => n + t.amountMinor, 0) };
  }

  /**
   * “ต้องจ่ายใคร / ได้รับจากใคร” — the one-line answer per member. Rows are
   * tappable (data-settle-person) so the summary opens the full detail screen.
   */
  function transferLinesHtml(memberId, { showNames = true } = {}) {
    const { out, inc } = transfersFor(memberId);
    if (!out.length && !inc.length) {
      return `<p class="settle-answer is-clear">${icon('check-circle-2', 'w-3.5 h-3.5')} ${th('เคลียร์ครบแล้ว — ไม่ต้องโอนให้ใคร','All settled — nothing to transfer')}</p>`;
    }
    const row = (id, amountMinor, direction) => {
      const m = state.membersMap[id] || {};
      return `<button type="button" class="settle-answer-row ${direction} no-export" data-settle-person="${escapeHtml(id)}">
        <span class="settle-answer-dir">${icon(direction === 'out' ? 'arrow-up-right' : 'arrow-down-left', 'w-3.5 h-3.5')}</span>
        ${showNames ? `<span class="avatar" style="width:22px;height:22px;font-size:9px;background:${escapeHtml(m.color || 'var(--primary)')};">${m.photoURL ? `<img src="${escapeHtml(m.photoURL)}" class="w-full h-full rounded-full object-cover" alt="">` : escapeHtml(getInitials(m.displayName || '?'))}</span>` : ''}
        <span class="settle-answer-who">${direction === 'out' ? th('จ่ายให้','Pay') : th('รับจาก','Receive from')} ${escapeHtml(m.displayName || '')}</span>
        <b class="settle-answer-amount">${direction === 'out' ? '−' : '+'}${money(amountMinor)}</b>
        ${icon('chevron-right', 'w-3 h-3')}
      </button>`;
    };
    return `<div class="settle-answers">
      ${out.map(t => row(t.to, t.amountMinor, 'out')).join('')}
      ${inc.map(t => row(t.from, t.amountMinor, 'in')).join('')}
    </div>`;
  }

  /**
   * One person filter for the whole page (v18.2): the old receipt-picker row and
   * the swipe-deck people strip both existed and showed the same names twice —
   * this is now the ONLY picker. It wraps instead of scrolling sideways so every
   * name stays on screen, and carries the net amount + comment count.
   */
  function receiptPickerHtml() {
    if (state.statements.length < 2) return '';
    const totalFlags = state.statements.reduce((n, m) => n + flaggedCount(m), 0);
    const chip = (id, label, { count = 0, avatar = '', netMinor = null, color = '' } = {}) => `
      <button class="receipt-picker-item ${receiptFilter === id ? 'active' : ''}${netMinor == null ? '' : (netMinor >= 0 ? ' is-pos' : ' is-neg')}" data-receipt-filter="${escapeHtml(id)}"${color ? ` style="--picker-color:${escapeHtml(color)};"` : ''}>
        ${avatar}${avatar ? '' : icon('users', 'w-3.5 h-3.5')}<span class="picker-name">${escapeHtml(label)}</span>
        ${netMinor == null ? '' : `<span class="picker-net">${netMinor >= 0 ? '+' : '−'}${money(Math.abs(netMinor))}</span>`}
        ${count ? `<span class="count">${icon('message-square', 'w-2.5 h-2.5')}${count}</span>` : ''}
      </button>`;
    return `
      <div class="receipt-picker receipt-picker--wrap no-export" id="receipt-picker">
        ${chip('all', th('ทุกคน','Everyone'), { count: totalFlags })}
        ${state.statements.map(m => chip(m.memberId, m.displayName, {
          count: flaggedCount(m),
          netMinor: m.netMinor,
          color: m.color || '',
          avatar: `<span class="avatar" style="background:${escapeHtml(m.color || 'var(--primary)')};">${m.photoURL ? `<img src="${escapeHtml(m.photoURL)}" class="w-full h-full rounded-full object-cover" alt="">` : escapeHtml(getInitials(m.displayName))}</span>`
        })).join('')}
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
              <div class="rcpt-sum-transfers">${transferLinesHtml(m.memberId)}</div>
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
          ${currency !== 'THB' && thbRate ? `1 ${escapeHtml(currency)} ≈ ${formatAmount(thbRate, 4)} THB • ` : ''}${th(`ออกโดย ${APP_NAME_BY}`, `Generated by ${APP_NAME_BY}`)} • ${escapeHtml(new Date().toLocaleString(lang === 'th' ? 'th-TH' : 'en-GB'))}
        </div>

        <div class="btn-row mt-3 no-export">
          <button class="btn btn-secondary btn-sm" data-export-receipt="${escapeHtml(m.memberId)}">${icon('image', 'w-4 h-4')} ${th('PNG ใบเสร็จนี้','PNG this receipt')}</button>
          <button class="btn btn-ghost btn-sm" data-share-receipt="${escapeHtml(m.memberId)}">${icon('share-2', 'w-4 h-4')} ${th('แชร์ให้เพื่อน','Share')}</button>
          <button class="btn btn-ghost btn-sm" data-copy-receipt="${escapeHtml(m.memberId)}">${icon('clipboard-copy', 'w-4 h-4')} ${th('คัดลอกข้อความ','Copy text')}</button>
        </div>
      </div>`;
  }

  /** Compact / detailed switch for the receipt views (a v18.2 request). */
  function densityToolbarHtml() {
    return `
      <div class="receipt-toolbar no-export">
        <div class="segmented" id="receipt-density">
          <button type="button" class="segmented-item ${receiptDensity === 'full' ? 'active' : ''}" data-density="full">${icon('rows-3', 'w-3.5 h-3.5')} ${th('ละเอียด','Detailed')}</button>
          <button type="button" class="segmented-item ${receiptDensity === 'compact' ? 'active' : ''}" data-density="compact">${icon('align-justify', 'w-3.5 h-3.5')} ${th('กระทัดรัด','Compact')}</button>
        </div>
        <span class="text-[10.5px] text-[var(--text-tertiary)]">${th('โหมดกระทัดรัดซ่อนรายการย่อย แสดงเฉพาะยอดรับ/หัก/คงเหลือ','Compact hides the item rows and keeps the paid / share / balance answer')}</span>
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
          <div class="tx-row-actions no-export">
            <button class="link-btn text-[11px]" data-settle-person="${escapeHtml(tx.to)}" type="button">${icon('user-round-search', 'w-3 h-3')} ${th('ดูรายละเอียดผู้รับ','Payee details')}</button>
            <button class="link-btn text-[11px]" data-settle-person="${escapeHtml(tx.from)}" type="button">${icon('user-round-search', 'w-3 h-3')} ${th('ดูรายละเอียดผู้จ่าย','Payer details')}</button>
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

  /**
   * “ใครต้องจ่าย ใครได้คืน” — one tap opens that member's detail screen
   * (openSettlePerson). This is the summary the clear-bill page now leads with.
   */
  function netSummaryHtml() {
    if (!state.statements.length) return '';
    const people = [...state.statements].sort((a, b) => Math.abs(b.netMinor) - Math.abs(a.netMinor));
    const owe = people.filter(m => m.netMinor < -1);
    const get = people.filter(m => m.netMinor > 1);
    const totalMove = state.transactions.reduce((n, t) => n + (t.amountMinor || 0), 0);
    return `
      <section class="card p-5" id="settle-net">
        <div class="flex items-center justify-between gap-2 flex-wrap mb-3">
          <h4 class="font-bold text-sm flex items-center gap-2">${icon('arrow-left-right', 'w-4 h-4')} ${th('สรุปการโอน — ใครจ่ายใคร ได้คืนเท่าไร','Transfer summary — who pays whom')}</h4>
          <span class="badge badge-planned text-[10px]">${state.transactions.length} ${th('รายการโอน','transfers')} • ${money(totalMove)}</span>
        </div>
        <div class="net-summary-grid">
          ${people.map(m => `
            <button type="button" class="net-chip ${m.netMinor >= 0 ? 'is-in' : 'is-out'} no-export" data-settle-person="${escapeHtml(m.memberId)}">
              <span class="avatar" style="background:${escapeHtml(m.color || 'var(--primary)')};">${m.photoURL ? `<img src="${escapeHtml(m.photoURL)}" class="w-full h-full rounded-full object-cover" alt="">` : escapeHtml(getInitials(m.displayName))}</span>
              <span class="net-chip-body">
                <span class="net-chip-name">${escapeHtml(m.displayName)}</span>
                <span class="net-chip-state">${Math.abs(m.netMinor) <= 1 ? th('เคลียร์แล้ว','Settled') : m.netMinor > 0 ? th('รับสุทธิ','Gets back') : th('จ่ายสุทธิ','Pays')}</span>
              </span>
              <b class="net-chip-amount">${m.netMinor >= 0 ? '+' : '−'}${money(Math.abs(m.netMinor))}</b>
              ${icon('chevron-right', 'w-3.5 h-3.5')}
            </button>`).join('')}
        </div>
        <div class="net-summary-foot">
          <span>${icon('arrow-down-left', 'w-3 h-3')} ${th('ได้คืนรวม','Total to receive')}: <b>${money(get.reduce((n, m) => n + m.netMinor, 0))}</b></span>
          <span>${icon('arrow-up-right', 'w-3 h-3')} ${th('ต้องจ่ายรวม','Total to pay')}: <b>${money(Math.abs(owe.reduce((n, m) => n + m.netMinor, 0)))}</b></span>
          <span class="net-summary-hint">${th('กดที่ชื่อเพื่อดูรายละเอียด','Tap a name for the details')}</span>
        </div>
      </section>`;
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
              <tr class="receipt-table-row" data-settle-person="${escapeHtml(m.memberId)}" title="${th('กดเพื่อดูรายละเอียด','Tap for details')}">
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
      ${netSummaryHtml()}
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
    // Every “who owes whom” surface opens the person screen (summary → detail).
    document.querySelectorAll('[data-settle-person]').forEach(el => el.addEventListener('click', (e) => {
      if (e.target.closest('[data-assign-payer]')) return;
      const id = el.dataset.settlePerson;
      if (id) openSettlePerson(id);
    }));

    // ละเอียด / กระทัดรัด (persisted, applies to both receipt views + the sheet)
    document.querySelectorAll('#receipt-density [data-density]').forEach(btn => btn.addEventListener('click', () => {
      receiptDensity = btn.dataset.density === 'compact' ? 'compact' : 'full';
      try { localStorage.setItem('fuji_rcpt_density', receiptDensity); } catch { /* ignore */ }
      renderView();
    }));

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
          receiptMode = 'deck';
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

  /* ---------------- v18: ใบเสร็จแบบการ์ดปัด (Tinder-style deck) ---------------- */

  /** The deck always holds every statement — the picker only decides who is on top. */
  function deckList() {
    return deckOrder(state.statements, { myId: currentUser?.uid || null, lang });
  }

  function deckCardHtml(m, idx, total) {
    const sum = deckSummary(m, { money, lang, flagged: flaggedCount(m) });
    const th2 = thbOf(Math.abs(m.netMinor));
    const tone = sum.positive ? 'is-positive' : 'is-negative';
    const chips = ['cash', 'card', 'transfer'].filter(k => m.paidByMethod[k] > 0)
      .map(k => `<span class="rcpt-chip rcpt-chip--${k}">${icon(methodIcon(k), 'w-3 h-3')} ${methodLabel(k)} <b>${money(m.paidByMethod[k])}</b></span>`).join('');
    const topRows = sum.top.length
      ? sum.top.map(i => `
          <div class="rcpt-deck-row">
            <span class="rcpt-deck-row-mark ${i.role === 'paid' ? 'is-in' : 'is-out'}">${icon(i.role === 'paid' ? 'arrow-down-circle' : 'arrow-up-circle', 'w-3 h-3')}</span>
            <span class="rcpt-deck-row-title">${escapeHtml(i.title)}${i.estimated ? ` <i class="rcpt-mini-badge rcpt-mini-badge--est">${th('ประมาณการ', 'est.')}</i>` : ''}</span>
            <span class="rcpt-deck-row-amount">${escapeHtml(i.amount)}</span>
          </div>`).join('')
      : `<p class="rcpt-empty">${th('ยังไม่มีรายการ', 'No items yet')}</p>`;
    return `
      <article class="rcpt-deck-card ${tone}" data-deck-card="${escapeHtml(m.memberId)}" tabindex="0"
               role="button" aria-label="${escapeHtml(m.displayName)}"
               style="--deck-color:${escapeHtml(m.color || 'var(--primary)')};">
        <header class="rcpt-deck-head">
          <div class="avatar" style="background:${escapeHtml(m.color || 'var(--primary)')};">
            ${m.photoURL ? `<img src="${escapeHtml(m.photoURL)}" alt="" class="w-full h-full rounded-full object-cover">` : escapeHtml(sum.initials)}
          </div>
          <div class="min-w-0 flex-1">
            <p class="rcpt-deck-kicker">${th('ใบเสร็จของ', 'Receipt for')} • ${idx + 1}/${total}</p>
            <h4 class="rcpt-deck-name">${escapeHtml(m.displayName)}${m.memberId === currentUser?.uid ? ` <span class="rcpt-deck-you">${th('คุณ', 'you')}</span>` : ''}</h4>
          </div>
          <span class="rcpt-deck-mood">${moodFaceHtml(balanceMood(m.netMinor), { size: 34, lang })}</span>
        </header>
        <div class="rcpt-deck-balance">
          <span class="rcpt-deck-balance-label">${sum.settled ? th('เคลียร์ครบแล้ว', 'All settled') : sum.positive ? th('จะได้รับคืน', 'Gets back') : th('ต้องจ่ายคืน', 'Owes')}</span>
          <strong class="rcpt-deck-balance-value">${sum.positive ? '+' : '−'}${escapeHtml(sum.headline)}</strong>
          ${th2 ? `<span class="rcpt-deck-balance-thb">≈ ${escapeHtml(th2)}</span>` : ''}
        </div>
        <div class="rcpt-deck-totals">
          <span>${th('รับ', 'Paid')} <b>${escapeHtml(sum.paidLabel)}</b> <i>${m.paidCount} ${th('รายการ', 'items')}</i></span>
          <span>${th('หัก', 'Share')} <b>${escapeHtml(sum.owedLabel)}</b> <i>${m.shareCount} ${th('คน', 'pax')}</i></span>
        </div>
        ${chips ? `<div class="rcpt-deck-chips">${chips}</div>` : ''}
        <div class="rcpt-deck-answer">${transferLinesHtml(m.memberId)}</div>
        <div class="rcpt-deck-rows">${topRows}</div>
        ${m.items.length > 3 ? `<button type="button" class="rcpt-deck-more" data-deck-open>${icon('expand', 'w-3.5 h-3.5')} ${th(`ดูรายละเอียดทั้งหมด (${m.items.length} รายการ)`, `Open full receipt (${m.items.length} items)`)}</button>`
          : `<button type="button" class="rcpt-deck-more" data-deck-open>${icon('expand', 'w-3.5 h-3.5')} ${th('ดูรายละเอียด', 'Open details')}</button>`}
        <footer class="rcpt-deck-foot">
          <span class="rcpt-deck-hint">${icon('move-horizontal', 'w-3 h-3')} ${th('ปัดซ้าย/ขวาเพื่อเปลี่ยนคน • แตะการ์ดเพื่อดูรายละเอียด', 'Swipe to switch person • tap for details')}</span>
          ${sum.flagged ? `<span class="rcpt-deck-flag">${icon('message-square', 'w-3 h-3')} ${sum.flagged}</span>` : ''}
        </footer>
      </article>`;
  }

  function deckHtml() {
    const list = deckList();
    if (!list.length) {
      return `<div class="card p-4">${renderEmptyState({ icon: 'receipt-text', title: th('ยังไม่มีใบเสร็จ', 'No receipts yet'), desc: th('เพิ่มค่าใช้จ่ายแล้วกลับมาดูใหม่', 'Add expenses and come back') })}</div>`;
    }
    if (deckIndex >= list.length || deckIndex < 0) deckIndex = 0;
    const current = list[deckIndex];
    const next = list[deckStep(deckIndex, 1, list.length)];
    return `
      <div class="rcpt-deck" id="rcpt-deck">
        ${receiptPickerHtml()}
        <div class="rcpt-deck-stage ${receiptDensity === 'compact' ? 'is-compact' : ''}" id="deck-stage">
          ${deckCardHtml(current, deckIndex, list.length)}
          ${next && list.length > 1 ? `<div class="rcpt-deck-peek" aria-hidden="true">${deckCardHtml(next, deckStep(deckIndex, 1, list.length), list.length)}</div>` : ''}
          <div class="rcpt-deck-badge rcpt-deck-badge--prev" data-deck-badge="prev">${icon('chevron-left', 'w-4 h-4')} <span data-hint-label>${th('คนก่อนหน้า', 'previous')}</span></div>
          <div class="rcpt-deck-badge rcpt-deck-badge--next" data-deck-badge="next"><span data-hint-label>${th('คนถัดไป', 'next')}</span> ${icon('chevron-right', 'w-4 h-4')}</div>
        </div>
        <div class="rcpt-deck-nav no-export">
          <button type="button" class="btn btn-secondary btn-sm" data-deck-step="-1" aria-label="${th('คนก่อนหน้า', 'previous')}">${icon('chevron-left', 'w-4 h-4')}</button>
          <span class="deck-pos" data-deck-pos>${escapeHtml(deckPositionLabel(deckIndex, list.length, lang))}</span>
          <button type="button" class="btn btn-secondary btn-sm" data-deck-step="1" aria-label="${th('คนถัดไป', 'next')}">${icon('chevron-right', 'w-4 h-4')}</button>
          <button type="button" class="btn btn-ghost btn-sm" data-deck-open>${icon('maximize', 'w-3.5 h-3.5')} ${th('รายละเอียด', 'Details')}</button>
          <button type="button" class="btn btn-ghost btn-sm" data-export-receipt="${escapeHtml(current.memberId)}">${icon('image', 'w-3.5 h-3.5')} PNG</button>
          <button type="button" class="btn btn-ghost btn-sm" data-deck-mode="list">${icon('list', 'w-3.5 h-3.5')} ${th('แบบรายการยาว', 'Long list')}</button>
        </div>
        <p class="deck-tip text-[10.5px] text-[var(--text-tertiary)] text-center mt-1">${th('ใช้ปุ่ม ← → บนคีย์บอร์ด หรือลากการ์ดปัดได้', 'Use the ← → keys, or drag the card')}</p>
      </div>`;
  }

  /**
   * “รายละเอียดอีกหน้า” (v18.2): the person screen behind every net chip, debt-map
   * node and transfer row. Answers รับ/จ่ายสุทธิ + who to pay, then links to the
   * full itemised receipt.
   */
  function openSettlePerson(memberId) {
    const m = state.statements.find(x => x.memberId === memberId);
    if (!m) return;
    const { out, inc } = transfersFor(memberId);
    const positive = m.netMinor >= 0;
    const settled = Math.abs(m.netMinor) <= 1;
    const rows = [...out.map(t => ({ t, dir: 'out' })), ...inc.map(t => ({ t, dir: 'in' }))];
    const sheet = showBottomSheet(`
      <div class="space-y-4" id="settle-person">
        <div class="flex items-center gap-3">
          <div class="avatar" style="width:46px;height:46px;font-size:16px;background:${escapeHtml(m.color || 'var(--primary)')};">
            ${m.photoURL ? `<img src="${escapeHtml(m.photoURL)}" class="w-full h-full rounded-full object-cover" alt="">` : escapeHtml(getInitials(m.displayName))}
          </div>
          <div class="min-w-0">
            <h3 class="font-bold text-base leading-tight" style="font-family:var(--font-display);">${escapeHtml(m.displayName)}</h3>
            <p class="text-[11px] text-[var(--text-secondary)]">${th('จ่ายจริง','paid')} ${money(m.paidMinor)} • ${th('ส่วนที่ต้องรับผิดชอบ','share')} ${money(m.owedMinor)}</p>
          </div>
        </div>

        <div class="settle-person-verdict ${settled ? 'is-clear' : positive ? 'is-in' : 'is-out'}">
          <span class="settle-person-verdict-label">${settled ? th('เคลียร์ครบแล้ว','All settled') : positive ? th('รับสุทธิ (ได้คืน)','Net receive') : th('จ่ายสุทธิ (ต้องโอน)','Net pay')}</span>
          <b>${settled ? money(0) : `${positive ? '+' : '−'}${money(Math.abs(m.netMinor))}`}</b>
          ${currency !== 'THB' && thbOf(m.netMinor) ? `<span class="text-[11px]">≈ ${thbOf(Math.abs(m.netMinor))}</span>` : ''}
        </div>

        <div>
          <p class="text-xs font-bold mb-1.5 flex items-center gap-1.5">${icon('list-checks', 'w-3.5 h-3.5')} ${th('ต้องโอนให้ใคร / รับจากใคร','Transfers to make')}</p>
          ${rows.length ? `<div class="settle-answers">
            ${rows.map(({ t, dir }) => {
              const other = state.membersMap[dir === 'out' ? t.to : t.from] || {};
              return `<button type="button" class="settle-answer-row ${dir}" data-settle-person="${escapeHtml(other.id || '')}">
                <span class="settle-answer-dir">${icon(dir === 'out' ? 'arrow-up-right' : 'arrow-down-left', 'w-3.5 h-3.5')}</span>
                <span class="avatar" style="width:22px;height:22px;font-size:9px;background:${escapeHtml(other.color || 'var(--primary)')};">${escapeHtml(getInitials(other.displayName || '?'))}</span>
                <span class="settle-answer-who">${dir === 'out' ? th('โอนให้','Transfer to') : th('รับจาก','Receive from')} ${escapeHtml(other.displayName || '')}</span>
                <b class="settle-answer-amount">${money(t.amountMinor)}</b>
                ${icon('chevron-right', 'w-3 h-3')}
              </button>`;
            }).join('')}
          </div>` : `<p class="settle-answer is-clear">${icon('check-circle-2', 'w-3.5 h-3.5')} ${th('ไม่มีการโอนที่ต้องทำ','Nothing to transfer')}</p>`}
        </div>

        <div class="btn-row">
          <button id="sp-receipt" class="btn btn-primary btn-sm" type="button">${icon('receipt-text', 'w-4 h-4')} ${th('ดูใบเสร็จเต็ม','Full receipt')}</button>
          <button id="sp-copy" class="btn btn-secondary btn-sm" type="button">${icon('clipboard-copy', 'w-4 h-4')} ${th('คัดลอกสรุป','Copy summary')}</button>
          <button id="sp-close" class="btn btn-ghost btn-sm" type="button">${icon('x', 'w-4 h-4')} ${th('ปิด','Close')}</button>
        </div>
      </div>
    `);
    queueIcons();
    const body = sheet.sheet;
    body.querySelectorAll('[data-settle-person]').forEach(btn => btn.addEventListener('click', () => {
      const next = btn.dataset.settlePerson;
      if (!next || next === memberId) return;
      sheet.close();
      setTimeout(() => openSettlePerson(next), 90);
    }));
    body.querySelector('#sp-receipt')?.addEventListener('click', () => {
      sheet.close();
      setTimeout(() => openReceiptDetail(memberId), 90);
    });
    body.querySelector('#sp-copy')?.addEventListener('click', async () => {
      const lines = [
        `${m.displayName} — ${settled ? th('เคลียร์ครบ','settled') : positive ? th('รับสุทธิ','net receive') : th('จ่ายสุทธิ','net pay')} ${money(Math.abs(m.netMinor))}`,
        ...out.map(t => `${th('โอนให้','Pay to')} ${state.membersMap[t.to]?.displayName || ''}: ${money(t.amountMinor)}`),
        ...inc.map(t => `${th('รับจาก','Receive from')} ${state.membersMap[t.from]?.displayName || ''}: ${money(t.amountMinor)}`)
      ];
      try { await navigator.clipboard?.writeText(lines.join('\n')); toast.success(th('คัดลอกแล้ว','Copied')); }
      catch { toast.error(th('คัดลอกไม่ได้','Copy failed')); }
    });
    body.querySelector('#sp-close')?.addEventListener('click', () => sheet.close());
  }

  /** Open the full receipt of one member in a sheet (scrollable, exportable). */
  function openReceiptDetail(memberId) {
    const m = state.statements.find(x => x.memberId === memberId) || deckList()[deckIndex];
    if (!m) return;
    const detail = showBottomSheet(`
      <div class="receipt-detail-head">
        <div class="avatar" style="width:40px;height:40px;background:${escapeHtml(m.color || 'var(--primary)')};">
          ${m.photoURL ? `<img src="${escapeHtml(m.photoURL)}" alt="" class="w-full h-full rounded-full object-cover">` : escapeHtml((m.displayName || '?').trim().charAt(0).toUpperCase())}
        </div>
        <div class="min-w-0">
          <h3 class="font-bold text-base leading-tight" style="font-family:var(--font-display);">${escapeHtml(m.displayName)}</h3>
          <p class="text-[11px] text-[var(--text-secondary)]">${th('ใบเสร็จทั้งหมดของคนนี้', 'This person’s full receipt')} • ${m.items.length} ${th('รายการ', 'items')}</p>
        </div>
        <button class="btn btn-ghost btn-sm no-export" id="rd-close" style="margin-left:auto;">${icon('x', 'w-4 h-4')}</button>
      </div>
      <div class="receipt-toolbar no-export">
        <div class="segmented" id="rd-density">
          <button type="button" class="segmented-item ${receiptDensity === 'full' ? 'active' : ''}" data-rd-density="full">${icon('rows-3', 'w-3.5 h-3.5')} ${th('ละเอียด','Detailed')}</button>
          <button type="button" class="segmented-item ${receiptDensity === 'compact' ? 'active' : ''}" data-rd-density="compact">${icon('align-justify', 'w-3.5 h-3.5')} ${th('กระทัดรัด','Compact')}</button>
        </div>
      </div>
      <div class="settle-person-verdict ${Math.abs(m.netMinor) <= 1 ? 'is-clear' : m.netMinor > 0 ? 'is-in' : 'is-out'}">
        <span class="settle-person-verdict-label">${Math.abs(m.netMinor) <= 1 ? th('เคลียร์ครบแล้ว','All settled') : m.netMinor > 0 ? th('รับสุทธิ (ได้คืน)','Net receive') : th('จ่ายสุทธิ (ต้องโอน)','Net pay')}</span>
        <b>${Math.abs(m.netMinor) <= 1 ? money(0) : `${m.netMinor > 0 ? '+' : '−'}${money(Math.abs(m.netMinor))}`}</b>
      </div>
      <div class="receipt-detail-body ${receiptDensity === 'compact' ? 'is-compact' : ''}" id="receipt-detail-${escapeHtml(m.memberId)}">${receiptHtml(m)}</div>
      <div class="btn-row mt-3 no-export" id="rd-switch"></div>
    `, { className: 'sheet--wide' });
    const all = deckList();
    const switchBar = detail.sheet.querySelector('#rd-switch');
    if (switchBar) {
      switchBar.innerHTML = all.map(x => `
        <button type="button" class="deck-person deck-person--mini ${x.memberId === m.memberId ? 'is-active' : ''}" data-detail-person="${escapeHtml(x.memberId)}">
          <span class="avatar" style="background:${escapeHtml(x.color || 'var(--primary)')};width:24px;height:24px;font-size:10px;">${escapeHtml((x.displayName || '?').trim().charAt(0).toUpperCase())}</span>
        </button>`).join('');
      switchBar.querySelectorAll('[data-detail-person]').forEach(btn => btn.addEventListener('click', () => {
        detail.close();
        const idx = all.findIndex(x => x.memberId === btn.dataset.detailPerson);
        if (idx >= 0) { deckIndex = idx; renderView(); }
        setTimeout(() => openReceiptDetail(btn.dataset.detailPerson), 60);
      }));
    }
    detail.sheet.querySelector('#rd-close')?.addEventListener('click', () => detail.close());
    detail.sheet.querySelectorAll('[data-rd-density]').forEach(btn => btn.addEventListener('click', () => {
      receiptDensity = btn.dataset.rdDensity === 'compact' ? 'compact' : 'full';
      try { localStorage.setItem('fuji_rcpt_density', receiptDensity); } catch { /* ignore */ }
      detail.sheet.querySelectorAll('[data-rd-density]').forEach(x => x.classList.toggle('active', x === btn));
      document.querySelectorAll('.receipt-detail-body').forEach(el => el.classList.toggle('is-compact', receiptDensity === 'compact'));
      // keep the page behind the sheet in sync too
      document.querySelectorAll('.receipt-grid').forEach(el => el.classList.toggle('is-compact', receiptDensity === 'compact'));
      document.querySelectorAll('#deck-stage').forEach(el => el.classList.toggle('is-compact', receiptDensity === 'compact'));
    }));
    bindReceiptActions();
    queueIcons();
  }

  /** Drag / keyboard behaviour for the deck (pointer events, no libraries). */
  function mountDeck() {
    const stage = document.getElementById('deck-stage');
    const deck = document.getElementById('rcpt-deck');
    if (!stage || !deck) return;
    const card = stage.querySelector('[data-deck-card]');
    if (!card) return;

    const go = (delta) => {
      const list = deckList();
      if (!list.length) return;
      deckIndex = deckStep(deckIndex, delta, list.length);
      renderView();
    };
    const open = () => {
      const cur = deckList()[deckIndex];
      if (cur) openReceiptDetail(cur.memberId);
    };

    let dragging = false, startX = 0, startY = 0, dx = 0, dy = 0, moved = false;
    const setTransform = () => {
      const tilt = swipeTilt(dx, stage.clientWidth || 360);
      card.style.transform = `translate(${dx}px, ${dy * 0.25}px) rotate(${tilt}deg)`;
      card.style.transition = 'none';
      const peek = stage.querySelector('.rcpt-deck-peek');
      if (peek) {
        const p = Math.min(1, Math.abs(dx) / Math.max(160, (stage.clientWidth || 360) * 0.6));
        peek.style.transform = `translateY(${10 - p * 10}px) scale(${0.965 + p * 0.035})`;
        // swipePeek() fades the next card IN as the current one leaves
        peek.style.opacity = String(swipePeek(1 - p));
      }
      const hint = swipeHint(dx, { next: th('คนถัดไป', 'next'), prev: th('คนก่อนหน้า', 'previous') });
      ['next', 'prev'].forEach((tone) => {
        const badge = stage.querySelector(`[data-deck-badge="${tone}"]`);
        if (!badge) return;
        badge.classList.toggle('is-on', hint?.tone === tone);
        if (hint?.tone === tone) {
          const label = badge.querySelector('[data-hint-label]');
          if (label) label.textContent = hint.label;
        }
      });
    };
    const resetTransform = () => {
      card.style.transition = 'transform .28s cubic-bezier(.2,.9,.3,1)';
      card.style.transform = '';
      stage.querySelector('.rcpt-deck-peek')?.style.setProperty('transform', '');
      stage.querySelectorAll('[data-deck-badge]').forEach(b => b.classList.remove('is-on'));
    };
    const onDown = (e) => {
      if (e.target.closest('button, a, input, select, textarea, .no-export')) return;
      dragging = true; moved = false;
      startX = e.clientX; startY = e.clientY; dx = 0; dy = 0;
      card.setPointerCapture?.(e.pointerId);
    };
    const onMove = (e) => {
      if (!dragging) return;
      dx = e.clientX - startX; dy = e.clientY - startY;
      if (Math.abs(dx) > 6 || Math.abs(dy) > 6) moved = true;
      if (moved) setTransform();
    };
    const onUp = () => {
      if (!dragging) return;
      dragging = false;
      const intent = swipeIntent({ dx, dy, width: stage.clientWidth || 360 });
      if (intent === 'next' || intent === 'prev') {
        const out = intent === 'next' ? -1 : 1;
        card.style.transition = 'transform .22s ease-in, opacity .22s ease-in';
        card.style.transform = `translate(${out * (window.innerWidth || 600)}px, ${dy * 0.3}px) rotate(${out * 18}deg)`;
        card.style.opacity = '0';
        setTimeout(() => go(out), 130);
      } else if (intent === 'open' || !moved) {
        resetTransform();
        open();
      } else resetTransform();
      dx = 0; dy = 0;
    };
    card.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);

    const onKey = (e) => {
      if (!document.getElementById('rcpt-deck')) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('routechange', () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    }, { once: true });

    deck.querySelectorAll('[data-deck-step]').forEach(btn => btn.addEventListener('click', () => go(Number(btn.dataset.deckStep) || 1)));
    deck.querySelectorAll('[data-deck-open]').forEach(btn => btn.addEventListener('click', (e) => { e.stopPropagation(); open(); }));
    deck.querySelectorAll('[data-deck-mode]').forEach(btn => btn.addEventListener('click', () => {
      receiptMode = btn.dataset.deckMode === 'list' ? 'list' : 'deck';
      try { localStorage.setItem('fuji_receipt_mode', receiptMode); } catch { /* ignore */ }
      renderView();
    }));
    // the tap on the whole card also opens the detail (only when it was a tap)
    card.addEventListener('click', (e) => {
      if (e.target.closest('button, a, .no-export')) return;
      if (moved) return;
      open();
    });
  }

  /** v18.1: Debt map — SVG graph showing who owes whom with amounts on edges */
  function debtMapHtml() {
    const txns = state.transactions || [];
    // v19: take the node colours from the tokens so a re-tone (or a dark theme)
    // never leaves the debt map on an old, muted hex.
    const tokenColor = (name, fallback) => {
      try { return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback; }
      catch { return fallback; }
    };
    const POS = tokenColor('--success', '#00a86b');
    const NEG = tokenColor('--danger', '#ef2b3d');
    if (!txns.length) {
      return `<div class="card p-5">${renderEmptyState({ icon: 'party-popper', title: t('noDebt'), desc: t('allCleared') })}</div>`;
    }
    const members = state.statements || [];
    const membersMap = state.membersMap || {};
    // Arrange members in a circle
    const n = members.length;
    const cx = 300, cy = 250, radius = Math.min(200, 60 + n * 30);
    const positions = {};
    members.forEach((m, i) => {
      const angle = (2 * Math.PI * i / n) - Math.PI / 2;
      positions[m.memberId] = {
        x: cx + radius * Math.cos(angle),
        y: cy + radius * Math.sin(angle),
        member: m
      };
    });
    // Calculate edge offsets to prevent overlapping lines
    // Group transactions between the same pair of members
    const edgeGroups = {};
    txns.forEach(tx => {
      const key = [tx.from, tx.to].sort().join('|');
      if (!edgeGroups[key]) edgeGroups[key] = [];
      edgeGroups[key].push(tx);
    });
    // Render edges with offset curves
    let edgesHtml = '';
    const edgeLabels = [];
    Object.entries(edgeGroups).forEach(([key, txGroup]) => {
      const [a, b] = key.split('|');
      const posA = positions[a], posB = positions[b];
      if (!posA || !posB) return;
      const count = txGroup.length;
      txGroup.forEach((tx, idx) => {
        const fromPos = positions[tx.from];
        const toPos = positions[tx.to];
        if (!fromPos || !toPos) return;
        // Offset perpendicular to the line to avoid overlapping
        const dx = toPos.x - fromPos.x;
        const dy = toPos.y - fromPos.y;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        const nx = -dy / len;
        const ny = dx / len;
        const offset = (idx - (count - 1) / 2) * 18;
        const midX = (fromPos.x + toPos.x) / 2 + nx * offset;
        const midY = (fromPos.y + toPos.y) / 2 + ny * offset;
        // Control point for the curve
        const ctrlX = midX + nx * 20;
        const ctrlY = midY + ny * 20;
        const fromColor = membersMap[tx.from]?.color || 'var(--primary)';
        edgesHtml += `<path d="M${fromPos.x},${fromPos.y} Q${ctrlX},${ctrlY} ${toPos.x},${toPos.y}" 
          fill="none" stroke="${escapeHtml(fromColor)}" stroke-width="2.5" stroke-opacity="0.7"
          marker-end="url(#arrow-${escapeHtml(tx.from?.slice(0,6) || 'x')})"/>`;
        edgeLabels.push({ x: midX, y: midY, amount: tx.amountMinor, from: tx.from, to: tx.to });
      });
    });
    // Render nodes
    let nodesHtml = '';
    members.forEach((m, i) => {
      const pos = positions[m.memberId];
      if (!pos) return;
      const color = m.color || 'var(--primary)';
      const initial = (m.displayName || '?').charAt(0).toUpperCase();
      const isMe = m.memberId === currentUser?.uid;
      nodesHtml += `
        <g class="debt-map-node" data-member="${escapeHtml(m.memberId)}" data-debt-person="${escapeHtml(m.memberId)}" role="button" tabindex="0" style="cursor:pointer;">
          <title>${escapeHtml(m.displayName || '')} • ${m.netMinor >= 0 ? th('รับสุทธิ','net receive') : th('จ่ายสุทธิ','net pay')} ${money(Math.abs(m.netMinor))}</title>
          <circle cx="${pos.x}" cy="${pos.y}" r="28" fill="${escapeHtml(color)}" opacity="0.15"/>
          <circle cx="${pos.x}" cy="${pos.y}" r="22" fill="${escapeHtml(color)}"/>
          <text x="${pos.x}" y="${pos.y + 1}" text-anchor="middle" dominant-baseline="central" 
                fill="#fff" font-size="12" font-weight="900" font-family="var(--font-display)">${escapeHtml(initial)}</text>
          <text x="${pos.x}" y="${pos.y + 38}" text-anchor="middle" fill="var(--text)" 
                font-size="10" font-weight="700" font-family="var(--font-sans)">${escapeHtml(m.displayName || '')}</text>
          ${isMe ? `<text x="${pos.x}" y="${pos.y + 50}" text-anchor="middle" fill="var(--text-tertiary)" font-size="8" font-weight="600">(${th('คุณ','you')})</text>` : ''}
          <text x="${pos.x}" y="${pos.y - 36}" text-anchor="middle"
                fill="${m.netMinor >= 0 ? POS : NEG}" font-size="8.5" font-weight="800"
                font-family="var(--font-sans)">${m.netMinor >= 0 ? th('รับสุทธิ','gets back') : th('จ่ายสุทธิ','pays')}</text>
          <text x="${pos.x}" y="${pos.y - 25}" text-anchor="middle"
                fill="${m.netMinor >= 0 ? POS : NEG}" font-size="9.5" font-weight="800"
                font-family="var(--font-mono)">${m.netMinor >= 0 ? '+' : '−'}${money(Math.abs(m.netMinor))}</text>
        </g>`;
    });
    // Render labels on edges
    let labelsHtml = '';
    // Simple collision avoidance: if labels are too close, shift them
    edgeLabels.forEach((label, idx) => {
      const fromName = (membersMap[label.from]?.displayName || '?').slice(0, 6);
      const toName = (membersMap[label.to]?.displayName || '?').slice(0, 6);
      labelsHtml += `
        <g class="debt-map-label">
          <rect x="${label.x - 42}" y="${label.y - 10}" width="84" height="20" rx="6" 
                fill="var(--surface)" stroke="var(--border)" stroke-width="1" opacity="0.92"/>
          <text x="${label.x}" y="${label.y + 3}" text-anchor="middle" 
                fill="var(--text-strong)" font-size="9" font-weight="800" font-family="var(--font-mono)">${money(label.amount)}</text>
        </g>`;
    });
    // Arrow marker definitions
    let markerDefs = '';
    const uniqueFroms = [...new Set(txns.map(tx => tx.from))];
    uniqueFroms.forEach(uid => {
      const color = membersMap[uid]?.color || 'var(--primary)';
      markerDefs += `<marker id="arrow-${escapeHtml(uid.slice(0,6))}" viewBox="0 0 10 10" refX="9" refY="5" 
        markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 0 0 L 10 5 L 0 10 z" fill="${escapeHtml(color)}" opacity="0.8"/>
      </marker>`;
    });
    const svgWidth = 600;
    const svgHeight = 500;
    return `
      <div class="card p-5">
        <div class="flex items-center justify-between gap-2 mb-3 flex-wrap">
          <h3 class="font-bold flex items-center gap-2">
            <span class="row-icon" style="width:30px;height:30px;border-radius:10px;background:var(--primary-light);color:var(--primary-strong);">${icon('map', 'w-4 h-4')}</span>
            ${th('แผนที่หนี้ — ใครต้องจ่ายใคร','Debt map — who owes whom')}
            <span class="badge badge-planned text-[10px]">${txns.length} ${th('รายการ','transactions')}</span>
          </h3>
          <span class="text-[10px] text-[var(--text-tertiary)]">${th('เส้นและตัวเลขแสดงยอดที่ต้องโอน','Lines and numbers show transfer amounts')}</span>
        </div>
        <div class="debt-map-legend">
          <span class="debt-legend-item is-in">${icon('arrow-down-left', 'w-3 h-3')} ${th('รับสุทธิ (ได้คืน)','Net receive')}</span>
          <span class="debt-legend-item is-out">${icon('arrow-up-right', 'w-3 h-3')} ${th('จ่ายสุทธิ (ต้องโอน)','Net pay')}</span>
          <span class="debt-legend-hint">${icon('pointer', 'w-3 h-3')} ${th('กดที่ชื่อหรือเส้น เพื่อดูรายละเอียด','Tap a name or a line for the details')}</span>
        </div>
        <div class="debt-map-container" style="overflow-x:auto;">
          <svg viewBox="0 0 ${svgWidth} ${svgHeight}" width="100%" style="max-width:${svgWidth}px; min-height:320px; display:block; margin:0 auto;">
            <defs>${markerDefs}</defs>
            ${edgesHtml}
            ${labelsHtml}
            ${nodesHtml}
          </svg>
        </div>
        <div class="mt-3 grid gap-1.5" style="max-width:480px; margin:0 auto;">
          ${txns.map(tx => {
            const fromM = membersMap[tx.from];
            const toM = membersMap[tx.to];
            return `<button type="button" class="debt-tx-row" data-settle-person="${escapeHtml(tx.to)}">
              <span class="avatar" style="width:22px;height:22px;font-size:9px;background:${escapeHtml(fromM?.color || 'var(--primary)')};">${escapeHtml((fromM?.displayName || '?').charAt(0).toUpperCase())}</span>
              <span class="font-semibold truncate">${escapeHtml(fromM?.displayName || '')}</span>
              <span style="color:var(--text-tertiary);">${icon('arrow-right', 'w-3 h-3')}</span>
              <span class="avatar" style="width:22px;height:22px;font-size:9px;background:${escapeHtml(toM?.color || 'var(--primary)')};">${escapeHtml((toM?.displayName || '?').charAt(0).toUpperCase())}</span>
              <span class="font-semibold truncate">${escapeHtml(toM?.displayName || '')}</span>
              <span class="ml-auto font-bold font-mono">${money(tx.amountMinor)}</span>
              ${icon('chevron-right', 'w-3.5 h-3.5')}
            </button>`;
          }).join('')}
        </div>
      </div>
      ${netSummaryHtml()}`;
  }

  /** Debt-map interactions: nodes / rows / summary chips all open a person page. */
  function bindDebtMap() {
    const content = document.getElementById('settlement-content');
    if (!content) return;
    const open = (el) => {
      const id = el.dataset.debtPerson || el.dataset.settlePerson;
      if (id) openSettlePerson(id);
    };
    content.querySelectorAll('[data-debt-person], [data-settle-person]').forEach(el => {
      el.addEventListener('click', () => open(el));
      // the SVG nodes are keyboard reachable (role="button" + tabindex), so Enter
      // and Space must do the same thing as a tap
      el.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        open(el);
      });
    });
  }

  function renderView() {
    const content = document.getElementById('settlement-content');
    if (!content) return;
    if (view === 'debt-map') {
      content.innerHTML = debtMapHtml();
      queueIcons();
      bindDebtMap();
      return;
    }
    if (view === 'overview') {
      content.innerHTML = overviewHtml();
      queueIcons();
      // The overview also shows the pending-payer panel + transactions strip.
      bindReceiptActions();
      return;
    }
    // ใบเสร็จรายคน: การ์ดปัดได้ (ค่าเริ่มต้น v18) หรือรายการยาวแบบเดิม
    if (receiptFilter !== 'all' && !state.statements.some(m => m.memberId === receiptFilter)) receiptFilter = 'all';
    if (view === 'receipts' && receiptMode === 'deck' && state.statements.length) {
      // the picker above the deck also moves the deck to that person
      if (receiptFilter !== 'all') {
        const at = deckList().findIndex(m => m.memberId === receiptFilter);
        if (at >= 0) deckIndex = at;
      }
      const visible = receiptFilter === 'all' ? state.statements : state.statements.filter(m => m.memberId === receiptFilter);
      // ใบเสร็จแบบยาวถูกซ่อนไว้บนจอ แต่ใช้ตอนสั่งพิมพ์ (ทุกใบเสร็จในหน้าเดียว)
      // For a big group that copy is expensive, so beyond 8 people it is built only
      // for whoever is on top of the deck — PNG/PDF export creates the rest on demand.
      const printable = visible.length > 8 && receiptFilter === 'all' ? [visible[deckIndex]].filter(Boolean) : visible;
      content.innerHTML = `${densityToolbarHtml()}${deckHtml()}${pendingHtml()}${transactionsHtml()}<div class="print-only receipt-grid mt-3">${printable.map(receiptHtml).join('')}</div>`;
      queueIcons();
      bindReceiptActions();
      mountDeck();
      return;
    }
    const visible = receiptFilter === 'all' ? state.statements : state.statements.filter(m => m.memberId === receiptFilter);
    content.innerHTML = `${densityToolbarHtml()}${receiptPickerHtml()}<div class="receipt-grid ${receiptDensity === 'compact' ? 'is-compact' : ''}">${visible.map(receiptHtml).join('')}</div>${pendingHtml()}${transactionsHtml()}${state.statements.length ? `<div class="btn-row mt-2"><button class="btn btn-secondary btn-sm" data-deck-mode="deck">${icon('hand', 'w-3.5 h-3.5')} ${th('ดูแบบปัดการ์ด', 'Swipe cards')}</button></div>` : ''}`;
    queueIcons();
    bindReceiptActions();
    content.querySelectorAll('[data-deck-mode]').forEach(btn => btn.addEventListener('click', () => {
      receiptMode = btn.dataset.deckMode === 'deck' ? 'deck' : 'list';
      try { localStorage.setItem('fuji_receipt_mode', receiptMode); } catch { /* ignore */ }
      renderView();
    }));
  }

  async function load() {
    const content = document.getElementById('settlement-content');
    if (!content) return;
    try { receiptMode = localStorage.getItem('fuji_receipt_mode') === 'list' ? 'list' : 'deck'; } catch { /* ignore */ }
    try { receiptDensity = localStorage.getItem('fuji_rcpt_density') === 'compact' ? 'compact' : 'full'; } catch { /* ignore */ }
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
    const wanted = btn.dataset.view;
    receiptMode = wanted === 'receipts-list' ? 'list' : 'deck';
    if (wanted === 'overview') view = 'overview';
    else if (wanted === 'debt-map') view = 'debt-map';
    else view = 'receipts';
    try { localStorage.setItem('fuji_receipt_mode', receiptMode); } catch { /* ignore */ }
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
            ${categoryColorChoices().map(col => `<button type="button" class="chip ${((existing?.color || brandPrimary()) === col) ? 'chip-active' : ''}" data-color="${col}" style="background:${col}22; border-color:${col};">${icon('circle', 'w-3 h-3')} ${col}</button>`).join('')}
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
          <div class="input-group"><label class="input-label">${icon('palette', 'w-3.5 h-3.5')} ${th('สีประจำตัว','Color')}</label><input id="m-color" type="color" value="${m.color || brandPrimary()}" class="w-full h-11 rounded-xl cursor-pointer border" style="border-color:var(--border);"></div>
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
    // A removed member must not linger inside a sub-group chip.
    await forgetMemberFromGroups(tripId, member.id);
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

  // Declared before the page markup: the groups card only renders the “เพิ่มกลุ่ม”
  // button for people who may manage members.
  const canApprove = perms.isAdmin || perms.canManageMembers || perms.role === 'trip_admin';
  const canManageGroups = canApprove;
  // v18.2 — กลุ่มย่อย: a long trip splits into gangs (some fly home early), so
  // the trip can be sliced into named groups for per-group budget analysis.
  let groups = [];
  let memberRows = [];

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
      <div class="card p-5 space-y-3 mb-5" id="groups-card">
        <div class="flex flex-wrap items-start justify-between gap-2">
          <div class="min-w-0">
            <h3 class="font-bold flex items-center gap-2">${icon('users-round', 'w-4 h-4')} ${th('กลุ่มย่อยในทริป','Trip sub-groups')}
              <span class="badge badge-planned text-[10px]" id="groups-count">0</span></h3>
            <p class="text-xs text-[var(--text-secondary)] mt-0.5">${th('จัดแก๊งเพื่อนเป็นกลุ่ม A / B — ใครกลับก่อน ใครมาเที่ยวช่วงหลัง แล้วดูงบประมาณแยกกลุ่มได้','Split the gang into groups A / B — who leaves early, who joins later — and read the budget per group.')}</p>
          </div>
          ${canManageGroups ? `<button id="add-group-btn" class="btn btn-primary btn-sm">${icon('plus', 'w-4 h-4')} ${th('เพิ่มกลุ่ม','New group')}</button>` : ''}
        </div>
        <div id="groups-board" class="groups-board"><div class="skeleton h-16"></div></div>
        <div id="groups-budget"></div>
      </div>

      <div id="members-list" class="grid gap-3 stagger"></div>
    </div>
  `;
  queueIcons();


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
      memberRows = members || [];
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
              ${memberGroupBadges(groups, m.id).length ? `<div class="flex items-center gap-1.5 mt-1 flex-wrap" data-member-groups>
                ${memberGroupBadges(groups, m.id).map(b => `<span class="badge text-[10px]" style="background:color-mix(in srgb, ${escapeHtml(b.color)} 18%, var(--surface)); border:1px solid color-mix(in srgb, ${escapeHtml(b.color)} 45%, transparent); color:color-mix(in srgb, ${escapeHtml(b.color)} 72%, var(--text-strong));">${icon(b.icon || 'users', 'w-2.5 h-2.5')} ${escapeHtml(b.name)}</span>`).join('')}
              </div>` : ''}
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
  if (canManageGroups) bind('add-group-btn', 'click', () => openGroupForm(null));

  /**
   * Render the group cards + the “budget per group” table. Groups are a view on
   * top of the normal expense book: nothing is duplicated, the numbers are the
   * members' own paid/share amounts (see utils/groups.js).
   */
  function paintGroups() {
    const board = document.getElementById('groups-board');
    const budgetBox = document.getElementById('groups-budget');
    const countEl = document.getElementById('groups-count');
    if (!board) return;
    if (countEl) countEl.textContent = String(groups.length);

    if (!groups.length) {
      board.innerHTML = `
        <div class="groups-empty">
          ${icon('users-round', 'w-5 h-5')}
          <div class="min-w-0">
            <p class="text-xs font-bold">${th('ยังไม่มีกลุ่มย่อย','No sub-groups yet')}</p>
            <p class="text-[11px] text-[var(--text-secondary)]">${th('กด “เพิ่มกลุ่ม” เพื่อตั้งกลุ่ม A / B แล้วเลือกสมาชิกในกลุ่ม (แก้ไข/ลบได้ตลอด)','Tap “New group”, name it A / B and pick its members (edit or delete any time).')}</p>
          </div>
        </div>`;
      if (budgetBox) budgetBox.innerHTML = '';
      queueIcons();
      return;
    }

    board.innerHTML = groups.map(g => {
      const people = groupMembers(g, memberRows);
      return `
      <article class="group-card" data-group="${escapeHtml(g.id)}" style="--group-color:${escapeHtml(g.color)};">
        <div class="group-card-head">
          <span class="group-card-icon">${icon(g.icon || 'users', 'w-4 h-4')}</span>
          <div class="min-w-0 flex-1">
            <p class="group-card-name">${escapeHtml(g.name)}</p>
            <p class="group-card-sub">${people.length} ${th('คน','people')}${g.note ? ` • ${escapeHtml(g.note)}` : ''}</p>
          </div>
          ${canManageGroups ? `
          <button class="icon-btn" data-group-act="edit" data-id="${escapeHtml(g.id)}" title="${t('edit')}">${icon('pencil', 'w-3.5 h-3.5')}</button>
          <button class="icon-btn icon-btn-danger" data-group-act="delete" data-id="${escapeHtml(g.id)}" title="${t('delete')}">${icon('trash-2', 'w-3.5 h-3.5')}</button>` : ''}
        </div>
        <div class="group-card-people">
          ${people.length ? people.map(m => `
            <span class="group-person" title="${escapeHtml(m.displayName || '')}">
              <span class="avatar" style="background:${escapeHtml(m.color || 'var(--primary)')};">${m.photoURL ? `<img src="${escapeHtml(m.photoURL)}" class="w-full h-full rounded-full object-cover" alt="">` : escapeHtml(getInitials(m.displayName))}</span>
              <span class="group-person-name">${escapeHtml((m.displayName || '').split(' ')[0])}</span>
            </span>`).join('')
            : `<span class="text-[11px] text-[var(--text-tertiary)]">${th('ยังไม่ได้เลือกสมาชิก','No members picked yet')}</span>`}
        </div>
      </article>`;
    }).join('');

    board.querySelectorAll('[data-group-act]').forEach(btn => btn.addEventListener('click', async () => {
      const group = groups.find(g => g.id === btn.dataset.id);
      if (!group) return;
      if (btn.dataset.groupAct === 'edit') openGroupForm(group);
      else {
        const ok = await confirmAction({
          title: th(`ลบ “${group.name}” ?`, `Delete “${group.name}”?`),
          message: th('สมาชิกในกลุ่มจะไม่ถูกนำออกจากทริป — ลบแค่กลุ่มเท่านั้น','Members stay on the trip — only the group is removed.'),
          confirmText: t('delete'), danger: true, icon: 'trash-2'
        });
        if (!ok) return;
        try {
          await deleteGroup(tripId, group.id);
          toast.success(th('ลบกลุ่มแล้ว','Group deleted'));
          await loadGroups();
        } catch (e) { toast.error(e.message || String(e)); }
      }
    }));

    queueIcons();
    paintGroupBudget();
  }

  /** The comparison table: every group next to the whole trip. */
  async function paintGroupBudget() {
    const box = document.getElementById('groups-budget');
    if (!box || !groups.length) { if (box) box.innerHTML = ''; return; }
    let expenses = [];
    try { expenses = await fetchAllExpenses(tripId); } catch { expenses = []; }
    let normalized = expenses;
    try { normalized = expensesInThb(expenses, trip); } catch { /* keep raw */ }
    const report = groupBudgetReport(groups, normalized, memberRows);
    const cur = 'THB';
    const money = (minor) => formatCurrency(minor || 0, cur);
    const pct = (n) => `${Math.round((n || 0) * 100)}%`;
    box.innerHTML = `
      <div class="group-budget mt-4">
        <div class="flex items-center justify-between gap-2 flex-wrap mb-2">
          <h4 class="font-bold text-sm flex items-center gap-2">${icon('chart-pie', 'w-4 h-4')} ${th('งบประมาณรายกลุ่ม','Budget per group')}</h4>
          <span class="text-[10px] text-[var(--text-tertiary)]">${th('ค่าใช้จ่ายจริง + ประมาณการ (ตามยอดที่หารกัน)','Actual + estimated, by allocation')}</span>
        </div>
        <div class="group-budget-table">
          <div class="group-budget-row group-budget-row--head">
            <span>${th('กลุ่ม','Group')}</span>
            <span>${th('คน','Pax')}</span>
            <span class="num">${th('จ่ายรวม','Paid')}</span>
            <span class="num">${th('ส่วนแบ่ง','Share')}</span>
            <span class="num">${th('เฉลี่ย/คน','Avg / person')}</span>
            <span class="num">${th('% ของทริป','% of trip')}</span>
          </div>
          ${report.groups.map(g => `
            <div class="group-budget-row" style="--group-color:${escapeHtml(g.color)};">
              <span class="group-budget-name">${icon(g.icon || 'users', 'w-3 h-3')} ${escapeHtml(g.name)}</span>
              <span>${g.memberCount}</span>
              <span class="num">${money(g.paidMinor)}</span>
              <span class="num">${money(g.shareMinor)}</span>
              <span class="num strong">${money(g.perPersonMinor)}</span>
              <span class="num">${pct((report.compare.find(c => c.id === g.id) || {}).share)}</span>
            </div>`).join('')}
          <div class="group-budget-row group-budget-row--total">
            <span>${th('ทั้งทริป','Whole trip')}</span>
            <span>${report.trip.memberCount}</span>
            <span class="num">${money(report.trip.paidMinor)}</span>
            <span class="num">${money(report.trip.shareMinor)}</span>
            <span class="num strong">${money(report.trip.perPersonMinor)}</span>
            <span class="num">100%</span>
          </div>
        </div>
        ${report.ungrouped.length ? `<p class="text-[11px] text-[var(--text-secondary)] mt-2">${icon('user-plus', 'w-3 h-3')} ${th('ยังไม่อยู่ในกลุ่ม','Not in any group')}: ${report.ungrouped.map(m => escapeHtml(m.displayName || '')).join(', ')}</p>` : ''}
      </div>`;
    queueIcons();
  }

  async function loadGroups() {
    try { groups = await listGroups(tripId); } catch (e) { console.warn('groups load failed', e?.message); groups = []; }
    if (isStale(token)) return;
    paintGroups();
  }

  /** Create / edit one sub-group (name, colour, icon, members, note). */
  function openGroupForm(group) {
    const isEdit = !!group;
    const g = group || { name: nextGroupName(groups), color: GROUP_COLORS[groups.length % GROUP_COLORS.length], icon: 'users', memberIds: [], note: '' };
    let picked = new Set(g.memberIds);
    const all = memberRows;
    const sheet = showBottomSheet(`
      <div class="space-y-4">
        <div class="flex items-center gap-3">
          <div class="row-icon" style="width:40px;height:40px;border-radius:14px;background:var(--gradient-primary);color:#fff;">${icon('users-round', 'w-5 h-5')}</div>
          <div>
            <h3 class="font-bold text-base" style="font-family: var(--font-display);">${isEdit ? th('แก้ไขกลุ่มย่อย','Edit sub-group') : th('เพิ่มกลุ่มย่อย','New sub-group')}</h3>
            <p class="text-[11px] text-[var(--text-tertiary)]">${th('ตั้งชื่อกลุ่ม แล้วเลือกสมาชิก (เลือกซ้ำได้หลายกลุ่ม)','Name the group, then pick its members (one person can be in several groups).')}</p>
          </div>
        </div>
        <div class="input-group"><label class="input-label">${icon('tag', 'w-3.5 h-3.5')} ${th('ชื่อกลุ่ม','Group name')} *</label>
          <input id="group-name" class="input" value="${escapeHtml(g.name || '')}" placeholder="${th('เช่น กลุ่ม A / กลับก่อน','e.g. Group A / early leavers')}"></div>
        <div class="input-group"><label class="input-label">${icon('palette', 'w-3.5 h-3.5')} ${th('สีประจำกลุ่ม','Group colour')}</label>
          <div class="swatch-row" id="group-colors">
            ${GROUP_COLORS.map(c => `<button type="button" class="swatch ${c === g.color ? 'is-active' : ''}" data-color="${c}" style="--swatch:${c};" aria-label="${c}"></button>`).join('')}
          </div></div>
        <div class="input-group"><label class="input-label">${icon('shapes', 'w-3.5 h-3.5')} ${th('ไอคอน','Icon')}</label>
          <div class="icon-pick-row" id="group-icons">
            ${GROUP_ICONS.map(i => `<button type="button" class="icon-pick ${i === (g.icon || 'users') ? 'is-active' : ''}" data-icon="${i}">${icon(i, 'w-4 h-4')}</button>`).join('')}
          </div></div>
        <div class="input-group"><label class="input-label">${icon('users', 'w-3.5 h-3.5')} ${th('สมาชิกในกลุ่ม','Members')} <span id="group-picked-count" class="text-[10px] text-[var(--text-tertiary)]"></span></label>
          <div class="tile-grid" id="group-tiles">
            ${all.map(m => `
              <button type="button" class="tile ${picked.has(m.id) ? 'tile-selected' : ''}" data-member="${escapeHtml(m.id)}">
                <span class="avatar" style="background:${escapeHtml(m.color || 'var(--primary)')};">${m.photoURL ? `<img src="${escapeHtml(m.photoURL)}" class="w-full h-full rounded-full object-cover" alt="">` : escapeHtml(getInitials(m.displayName))}</span>
                <span class="text-sm truncate">${escapeHtml(m.displayName || '')}</span>
              </button>`).join('') || `<p class="text-[11px] text-[var(--text-tertiary)]">${th('ยังไม่มีสมาชิกในทริป','No members on the trip yet')}</p>`}
          </div></div>
        <div class="input-group"><label class="input-label">${icon('align-left', 'w-3.5 h-3.5')} ${th('โน้ต','Note')}</label>
          <input id="group-note" class="input text-sm" value="${escapeHtml(g.note || '')}" placeholder="${th('เช่น กลับไทยวันที่ 12','e.g. fly home on the 12th')}"></div>
        <div class="flex gap-2">
          <button id="group-cancel" class="btn btn-secondary flex-1">${t('cancel')}</button>
          <button id="group-save" class="btn btn-primary flex-1">${icon('save', 'w-4 h-4')} ${t('save')}</button>
        </div>
      </div>
    `);
    queueIcons();

    // Every control is looked up inside *this* sheet: while an older sheet is
    // still animating out, a plain document.getElementById would wire the new
    // form to the dying copy (dead buttons).
    const form = sheet.sheet;
    let color = g.color;
    let iconName = g.icon || 'users';
    const paintCount = () => {
      const el = form.querySelector('#group-picked-count');
      if (el) el.textContent = picked.size ? `• ${picked.size} ${th('คน','pax')}` : '';
    };
    paintCount();
    form.querySelectorAll('#group-colors [data-color]').forEach(btn => btn.addEventListener('click', () => {
      color = btn.dataset.color;
      form.querySelectorAll('#group-colors .swatch').forEach(x => x.classList.toggle('is-active', x === btn));
    }));
    form.querySelectorAll('#group-icons [data-icon]').forEach(btn => btn.addEventListener('click', () => {
      iconName = btn.dataset.icon;
      form.querySelectorAll('#group-icons .icon-pick').forEach(x => x.classList.toggle('is-active', x === btn));
    }));
    form.querySelectorAll('#group-tiles [data-member]').forEach(btn => btn.addEventListener('click', () => {
      const id = btn.dataset.member;
      if (picked.has(id)) { picked.delete(id); btn.classList.remove('tile-selected'); }
      else { picked.add(id); btn.classList.add('tile-selected'); }
      paintCount();
    }));

    form.querySelector('#group-cancel')?.addEventListener('click', () => sheet.close());
    form.querySelector('#group-save')?.addEventListener('click', async () => {
      const name = String(form.querySelector('#group-name')?.value || '').trim();
      if (!name) return toast.error(th('ต้องมีชื่อกลุ่ม','A group name is required'));
      const payload = { name, color, icon: iconName, memberIds: [...picked], note: String(form.querySelector('#group-note')?.value || '').trim() };
      const btn = form.querySelector('#group-save');
      btn.disabled = true;
      const tLoad = toast.loading(th('กำลังบันทึก...','Saving...'));
      try {
        if (isEdit) await updateGroup(tripId, g.id, payload);
        else await createGroup(tripId, payload, currentUser?.uid);
        tLoad.close();
        sheet.close();
        toast.success(isEdit ? th('บันทึกกลุ่มแล้ว','Group saved') : th('สร้างกลุ่มแล้ว','Group created'));
        await loadGroups();
        await loadMembersList();
      } catch (e) {
        tLoad.close();
        btn.disabled = false;
        toast.error(e.message || String(e));
      }
    });
  }

  loadMembersList();
  loadGroups();
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
        <div class="p-3 rounded-xl" style="background:var(--bg-secondary); border:1px solid var(--border);">
          <p class="text-sm font-semibold flex items-center gap-2">${icon('calendar-plus', 'w-4 h-4')} ${t('exportCalendar')}</p>
          <p class="text-[11px] text-[var(--text-secondary)] mt-1 mb-2">${th('ไฟล์ .ics นำเข้า Google ปฏิทิน / Apple ปฏิทิน ได้ทันที — ทุกคนในทริปส่งออกได้','An .ics file you can import into Google / Apple Calendar — available to every member')}</p>
          <div class="btn-row">
            <button id="ics-all" class="btn btn-secondary btn-sm">${icon('layers', 'w-4 h-4')} ${th('ทั้งทริป','Everything')}</button>
            <button id="ics-itinerary" class="btn btn-secondary btn-sm">${icon('map-pinned', 'w-4 h-4')} ${t('itinerary')}</button>
            <button id="ics-bookings" class="btn btn-secondary btn-sm">${icon('ticket', 'w-4 h-4')} ${t('bookings')}</button>
          </div>
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

  /** Calendar (.ics) export — itinerary, reservations or both. */
  const exportIcs = async (kind) => withLoading(th('กำลังสร้างไฟล์ปฏิทิน...', 'Building the calendar file...'), async () => {
    const [items, reservations] = await Promise.all([
      kind === 'bookings' ? Promise.resolve([]) : fetchItinerary(tripId, null).catch(() => []),
      kind === 'itinerary' ? Promise.resolve([]) : listReservations(tripId).catch(() => [])
    ]);
    const events = [
      ...itineraryToEvents(items, { lang }),
      ...reservationsToEvents(reservations, { lang })
    ];
    if (!events.length) throw new Error(th('ยังไม่มีข้อมูลให้ส่งออก', 'Nothing to export yet'));
    const suffix = kind === 'all' ? 'trip' : kind;
    downloadIcs(`${(trip?.name || 'trip').replace(/\s+/g, '-')}-${suffix}.ics`, buildIcs(events, { calendarName: `${trip?.name || 'Trip'} — ${APP_NAME_BY}` }));
    return events.length;
  });
  bind('ics-all', 'click', async () => { const n = await exportIcs('all'); if (n) toast.success(th(`ส่งออก ${n} กิจกรรมแล้ว`, `Exported ${n} events`)); });
  bind('ics-itinerary', 'click', async () => { const n = await exportIcs('itinerary'); if (n) toast.success(th(`ส่งออก ${n} สถานที่แล้ว`, `Exported ${n} places`)); });
  bind('ics-bookings', 'click', async () => { const n = await exportIcs('bookings'); if (n) toast.success(th(`ส่งออก ${n} การจองแล้ว`, `Exported ${n} bookings`)); });

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

  let perms = { isAdmin: false, role: 'member' };
  let settingMembers = [];
  await Promise.all([
    loadTripCategories(tripId).catch(e => console.warn(e)),
    resolvePermissions(tripId, trip, currentUser.uid).then(p => { perms = p; }).catch(() => {}),
    listMembers(tripId).then(m => { settingMembers = m || []; }).catch(() => {})
  ]);
  if (isStale(token)) return;
  const budgetDecimals = 2; // Budget is always in THB (satang)
  const memberBudgets = (trip?.memberBudgets && typeof trip.memberBudgets === 'object') ? trip.memberBudgets : {};
  const fmtBudgetInput = (minor) => {
    if (!(Number(minor) > 0)) return '';
    const val = fromMinor(Number(minor), budgetDecimals);
    return val % 1 === 0 ? formatAmount(val, 0) : formatAmount(val, budgetDecimals);
  };

  const currencies = [
    { code: 'THB', name: th('บาทไทย', 'Thai Baht') }, { code: 'JPY', name: th('เยนญี่ปุ่น', 'Japanese Yen') },
    { code: 'USD', name: th('ดอลลาร์สหรัฐ', 'US Dollar') }, { code: 'EUR', name: 'ยูโร / Euro' },
    { code: 'KRW', name: th('วอนเกาหลี', 'Korean Won') }, { code: 'SGD', name: th('ดอลลาร์สิงคโปร์', 'Singapore Dollar') },
    { code: 'GBP', name: th('ปอนด์', 'Pound') }, { code: 'CNY', name: th('หยวนจีน', 'Chinese Yuan') },
    { code: 'HKD', name: th('ดอลลาร์ฮ่องกง', 'HK Dollar') }, { code: 'AUD', name: th('ดอลลาร์ออสเตรเลีย', 'AU Dollar') },
    { code: 'TWD', name: th('ดอลลาร์ไต้หวัน', 'Taiwan Dollar') }, { code: 'VND', name: th('ดองเวียดนาม', 'Vietnamese Dong') }
  ];
  // Currencies added for this trip stay selectable as the base currency too.
  tripCurrencyList(trip).forEach(code => {
    if (!currencies.some(c => c.code === code)) currencies.push({ code, name: code });
  });

  appEl.innerHTML = `
    <div class="page-enter max-w-[720px] mx-auto space-y-5">
      <div class="flex items-center justify-between gap-2">
        ${renderPageScene('settings', { lang, title: `${icon('settings', 'w-5 h-5')} ${t('settings')}`,
          subtitle: th('แก้ไขข้อมูลทริป งบประมาณ ธีม และโหมดการแสดงผล','Trip details, budget, theme and appearance') })}
        <span class="badge ${perms.isAdmin ? 'badge-completed' : 'badge-planned'}">${icon(perms.isAdmin ? 'shield-check' : 'eye', 'w-3 h-3')} ${escapeHtml(perms.role)}</span>
      </div>

      <div class="settings-tabs" id="settings-tabs">
        <button class="settings-tab active" data-settings-tab="trip">${icon('compass', 'w-3.5 h-3.5')} ${th('ข้อมูลทริป','Trip')}</button>
        <button class="settings-tab" data-settings-tab="appearance">${icon('palette', 'w-3.5 h-3.5')} ${th('การแสดงผล','Appearance')}</button>
        <button class="settings-tab" data-settings-tab="system">${icon('database', 'w-3.5 h-3.5')} ${th('ระบบ','System')}</button>
        <button class="settings-tab" data-settings-tab="advanced">${icon('settings-2', 'w-3.5 h-3.5')} ${th('เพิ่มเติม','Advanced')}</button>
      </div>

      <div class="card card-accent p-5 space-y-4" data-settings-section="trip">
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
        <!-- Multi-currency: extra currencies this trip spends in + their THB rates -->
        <div class="input-group">
          <label class="input-label">${icon('coins', 'w-3.5 h-3.5')} ${th('สกุลเงินที่ใช้ในทริป (เพิ่มได้)','Currencies used in the trip (add more)')}</label>
          <div id="trip-currency-rows" class="space-y-2"></div>
          <button type="button" id="add-trip-currency" class="btn btn-secondary btn-sm mt-2 text-xs">${icon('plus', 'w-3.5 h-3.5')} ${th('เพิ่มสกุลเงิน','Add currency')}</button>
          <p class="input-hint">${th('เมื่อทริปใช้เงินมากกว่าสกุลหลัก ให้เพิ่มสกุลที่ใช้แล้วตั้งเรท 1 สกุล = กี่ THB ระบบจะใช้แปลงยอดรวม งบประมาณ และรายการประมาณการให้อัตโนมัติ','When the trip spends more than its base currency, add each currency and set how much 1 unit is worth in THB — totals, budgets and estimates convert automatically')}</p>
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
        <button id="save-settings" class="btn btn-primary w-full">${icon('save', 'w-4 h-4')} ${t('save')}</button>
      </div>

      <div class="card p-5 space-y-4" data-settings-section="trip">
        <h3 class="font-bold flex items-center gap-2">${icon('piggy-bank', 'w-4 h-4')} ${th('งบประมาณ (บาท)','Budget (THB)')}</h3>
        <div class="grid grid-cols-2 gap-3">
          <div class="input-group"><label class="input-label">${icon('wallet', 'w-3.5 h-3.5')} ${th('งบประมาณรวม','Total budget')}</label><input id="s-budget-total" class="input money-input" type="text" inputmode="decimal" value="${fmtBudgetInput(trip?.budgetTotal)}" placeholder="50,000"><p class="input-hint">THB (บาท) • ${th('งบของทั้งทริป','whole-trip budget')}</p></div>
          <div class="input-group"><label class="input-label">${icon('user', 'w-3.5 h-3.5')} ${th('งบต่อคน (ค่าเริ่มต้น)','Default per person')}</label><input id="s-budget-per-person" class="input money-input" type="text" inputmode="decimal" value="${fmtBudgetInput(trip?.budgetPerPerson)}" placeholder="10,000"><p class="input-hint">THB (บาท) • ${th('ใช้กับคนที่ไม่ได้ตั้งงบรายคน','applies to members without their own budget')}</p></div>
        </div>

        <div class="input-group">
          <div class="flex items-center justify-between gap-2 mb-1 flex-wrap">
            <label class="input-label mb-0">${icon('users', 'w-3.5 h-3.5')} ${th('งบประมาณรายคน','Per-member budgets')}</label>
            ${settingMembers.length > 0 ? `
              <button type="button" id="btn-distribute-budget" class="btn btn-secondary btn-sm text-xs" style="min-height:30px;padding:4px 10px;gap:5px;">
                ${icon('divide', 'w-3.5 h-3.5')} ${th('กระจายงบเท่ากัน', 'Distribute equally')}
              </button>
            ` : ''}
          </div>
          <p class="input-hint mb-2">${th('กำหนดงบของแต่ละคนได้เอง — คนที่ไม่ได้ตั้งงบรายคนจะใช้างบต่อคนด้านบน หรือกดกระจายงบเท่ากันเพื่อกำหนดงบให้ทุกคน','Set a personal budget for each member — anyone without one uses the default above, or distribute equally to fill for everyone')}</p>
          <div id="member-budget-rows" class="space-y-2">
            ${settingMembers.map(m => `
              <div class="member-budget-row">
                <span class="avatar" style="width:28px;height:28px;font-size:10px;background:${escapeHtml(m.color || 'var(--primary)')};flex-shrink:0;">${m.photoURL ? `<img src="${escapeHtml(m.photoURL)}" class="w-full h-full rounded-full object-cover" alt="">` : escapeHtml(getInitials(m.displayName))}</span>
                <span class="text-xs font-medium truncate flex-1" title="${escapeHtml(m.displayName)}">${escapeHtml(m.displayName)}</span>
                <input id="s-mbudget-${escapeHtml(m.id)}" class="input money-input member-budget-input" type="text" inputmode="decimal" placeholder="0.00" value="${escapeHtml(fmtBudgetInput(memberBudgets[m.id]))}">
                <span class="text-[10px] text-[var(--text-tertiary)] flex-shrink-0 font-medium">THB</span>
              </div>`).join('') || `<p class="text-xs text-[var(--text-secondary)]">${th('ยังไม่มีสมาชิกในทริป','No members yet')}</p>`}
          </div>
        </div>

        <div id="budget-compare" class="p-3 rounded-xl text-sm border" style="background: var(--bg-secondary); border-color: var(--border);"><div class="skeleton h-4"></div></div>
        <button id="save-budget" class="btn btn-secondary w-full">${icon('save', 'w-4 h-4')} ${th('บันทึกงบประมาณ','Save budget')}</button>
      </div>

      <!-- v18: the colour theme picker lives here (LINE / Facebook / IG / custom) -->
      <div class="card p-5 space-y-3" id="settings-appearance-card" data-settings-section="appearance">
        <h3 class="font-bold flex items-center gap-2">${icon('palette', 'w-4 h-4')} ${th('ชุดสี & การแสดงผล','Colour theme & display')}</h3>
        <p class="text-xs text-[var(--text-secondary)]">${th('เลือกธีมที่ถูกใจ แล้วปรับสี/ความสดใสเองได้ — มีผลทุกหน้า รวมถึงโหมดมืดและรูปที่ส่งออก','Pick a palette you like and fine-tune the colours — it applies everywhere, including dark mode and exported images.')}</p>
        ${themePickerHtml({ idPrefix: 'settings' })}
      </div>

      <!-- v18: the profile picture lands here, so the account lives with it -->
      <div class="card p-5 space-y-3" id="settings-account-card" data-settings-section="appearance">
        <h3 class="font-bold flex items-center gap-2">${icon('user-cog', 'w-4 h-4')} ${th('บัญชีและอุปกรณ์','Account & device')}</h3>
        <div class="flex items-center gap-3">
          <div class="avatar" style="width:44px;height:44px;background:var(--gradient-primary);">${avatarInitialHtml(currentUser)}</div>
          <div class="min-w-0 flex-1">
            <p class="text-sm font-bold truncate">${escapeHtml(currentUser?.displayName || currentUser?.email || 'User')}</p>
            <p class="text-[11px] text-[var(--text-tertiary)] truncate">${escapeHtml(currentUser?.email || '')}</p>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-2">
          <button id="account-edit" class="btn btn-secondary btn-sm">${icon('pencil', 'w-3.5 h-3.5')} ${th('แก้ไขโปรไฟล์','Edit profile')}</button>
          <button id="account-appearance" class="btn btn-secondary btn-sm">${icon('sun-moon', 'w-3.5 h-3.5')} ${th('โหมดสว่าง/มืด','Light / dark')}</button>
        </div>
        <div class="grid grid-cols-2 gap-2">
          <button id="account-cache" class="btn btn-ghost btn-sm">${icon('eraser', 'w-3.5 h-3.5')} ${th('ล้างแคชอุปกรณ์','Clear device cache')}</button>
          <button id="account-logout" class="btn btn-sm" style="background:var(--danger-bg);color:var(--danger);border:1.5px solid color-mix(in srgb, var(--danger) 32%, transparent);">${icon('log-out', 'w-3.5 h-3.5')} ${t('logout')}</button>
        </div>
        <p class="text-[10px] text-[var(--text-tertiary)] font-mono">${escapeHtml(currentUser?.uid?.slice(0, 12) || '')}</p>
      </div>

      <div class="card p-5 space-y-3" id="expense-groups-card" data-settings-section="system">
        <h3 class="font-bold flex items-center gap-2">${icon('layout-grid', 'w-4 h-4')} ${th('กลุ่มค่าใช้จ่าย','Expense groups')}</h3>
        <p class="text-xs text-[var(--text-secondary)]">${th('เพิ่ม แก้ไขชื่อ/สี/ไอคอน หรือลบกลุ่มของทริปนี้ได้ ทุกหน้าจะใช้กลุ่มใหม่ทันที','Add, rename, recolour or delete groups for this trip — every screen picks them up.')}</p>
        <div id="settings-cat-list" class="flex flex-wrap gap-1.5"></div>
        <button id="settings-manage-cats" class="btn btn-secondary btn-sm w-full">${icon('settings-2', 'w-4 h-4')} ${th('จัดการกลุ่มค่าใช้จ่าย','Manage groups')}</button>
      </div>

      <div class="card p-5 space-y-3" id="trip-cards-card" data-settings-section="system">
        <h3 class="font-bold flex items-center gap-2">${icon('credit-card', 'w-4 h-4')} ${th('บัตรเครดิตของทริป','Trip credit cards')}</h3>
        <p class="text-xs text-[var(--text-secondary)]">${th('ฟอร์มค่าใช้จ่ายจะเลือกบัตรได้จากรายการนี้เท่านั้น — เพิ่ม/แก้ไข/ลบที่นี่ได้ เพื่อป้องกันการกรอกบัตรมั่ว','Expense forms can only pick cards from this list — add/edit/delete here to stop random card names.')}</p>
        <div id="settings-cards-list" class="flex flex-wrap gap-1.5"></div>
        <button id="settings-manage-cards" class="btn btn-secondary btn-sm w-full">${icon('settings-2', 'w-4 h-4')} ${th('จัดการบัตรเครดิต','Manage cards')}</button>
      </div>

      <div class="card p-5 space-y-3" id="invite-card" data-settings-section="system">
        <h3 class="font-bold flex items-center gap-2">${icon('ticket', 'w-4 h-4')} ${th('รหัสเชิญเข้าร่วมทริป','Trip invite code')}</h3>
        <p class="text-xs text-[var(--text-secondary)]">${th('ส่งรหัสนี้ให้เพื่อน — พวกเขาล็อกอินด้วยบัญชี Google/อีเมล แล้วกรอกรหัสเพื่อขอเข้าร่วม จากนั้นกดอนุมัติได้ที่หน้าสมาชิก','Share this code with friends — they sign in with Google/email, enter it to request access, and you approve them on the Members page.')}</p>
        <div class="flex items-center gap-2 flex-wrap">
          <span id="invite-code-value" class="font-mono text-xl font-bold tracking-[0.3em] px-4 py-2 rounded-xl" style="background:var(--bg-secondary); border:1px dashed var(--border);">${escapeHtml(formatInviteCode(trip?.inviteCode) || '—')}</span>
          <button id="invite-code-copy" class="btn btn-secondary btn-sm">${icon('copy', 'w-4 h-4')} ${th('คัดลอก','Copy')}</button>
          <button id="invite-code-regen" class="btn btn-ghost btn-sm">${icon('refresh-cw', 'w-4 h-4')} ${th('สร้างรหัสใหม่','New code')}</button>
        </div>
        <p class="text-[10px] text-[var(--text-tertiary)]">${th('รหัสจะสุ่มใหม่ได้ทุกเมื่อ — คนที่ยังไม่ได้อนุมัติจะใช้รหัสเดิมไม่ได้อีก','You can rotate the code anytime — old codes stop working immediately.')}</p>
      </div>

      <div class="card p-5 space-y-3" data-settings-section="system">
        <h3 class="font-bold flex items-center gap-2">${icon('stethoscope', 'w-4 h-4')} ${th('ตรวจสอบระบบ','System check')}</h3>
        <p class="text-xs text-[var(--text-secondary)]">${th('เช็กว่าล็อกอินสมาชิก, Cloud Functions และ Firestore Rules พร้อมใช้งานไหม (ใช้เวลาไม่กี่วินาที)','Checks member login, Cloud Functions and Firestore rules (a few seconds).')}</p>
        <button id="run-diagnostics" class="btn btn-secondary w-full">${icon('play', 'w-4 h-4')} ${th('เริ่มตรวจสอบ','Run check')}</button>
        <div id="diag-results" class="space-y-2"></div>
      </div>

      <div class="card p-5 space-y-3" style="border-color: color-mix(in srgb, var(--danger) 35%, var(--border));" data-settings-section="advanced">
        <h3 class="font-bold flex items-center gap-2" style="color:var(--danger);">${icon('alert-triangle', 'w-4 h-4')} ${th('เขตอันตราย','Danger zone')}</h3>
        <p class="text-xs text-[var(--text-secondary)]">${th('ลบทริปจะลบแผนการเดินทาง ค่าใช้จ่าย สมาชิก และเอกสารทั้งหมดอย่างถาวร','Deleting a trip removes its itinerary, expenses, members and documents permanently.')}</p>
        <div class="btn-row">
          <button id="dup-trip" class="btn btn-secondary btn-sm">${icon('copy', 'w-4 h-4')} ${th('ทำสำเนาทริป','Duplicate trip')}</button>
          <button id="del-trip" class="btn btn-sm" style="background:var(--danger);color:#fff;">${icon('trash-2', 'w-4 h-4')} ${th('ลบทริปนี้','Delete this trip')}</button>
        </div>
        <p class="text-[10px] text-[var(--text-tertiary)] font-mono">Trip ID: ${escapeHtml(tripId)}</p>
      </div>

      <div class="card p-5 space-y-2" id="about-card" data-settings-section="advanced">
        <h3 class="font-bold flex items-center gap-2">${icon('info', 'w-4 h-4')} ${th('เกี่ยวกับแอป','About')}</h3>
        <div class="app-wordmark">
          <span class="app-wordmark-logo">${icon('mount-snow', 'w-4 h-4')}</span>
          <span class="min-w-0">
            <span class="app-wordmark-name">${escapeHtml(APP_NAME)}</span>
            <span class="app-wordmark-by">${th('โดย', 'by')} ${escapeHtml(APP_AUTHOR)}</span>
          </span>
        </div>
        <div class="flex items-center gap-2 flex-wrap text-xs">
          <span class="badge badge-planned">${icon('tag', 'w-3 h-3')} ${th('เวอร์ชัน', 'Version')} ${escapeHtml(APP_VERSION_LABEL)}</span>
          <span class="badge badge-completed" data-build-updated>${icon('calendar-check', 'w-3 h-3')} ${escapeHtml(appUpdatedLabel(lang))}</span>
          <span class="badge badge-skipped" data-build-theme>${icon('palette', 'w-3 h-3')} ${escapeHtml(th('ชุดสี', 'Palette'))} ${escapeHtml(themeName(currentTheme().id, lang))}</span>
        </div>
        <div class="about-details" data-build-stamp>
          <div><span>${th('อัปเดตล่าสุด', 'Last updated')}</span><b>${escapeHtml(appUpdatedShort(lang))}</b> <i>(${escapeHtml(APP_UPDATED_ISO)})</i></div>
          <div><span>${th('ชุดสีที่ใช้', 'Active palette')}</span><b>${escapeHtml(themeName(currentTheme().id, lang))}</b> • ${escapeHtml(brandPalette().blue)} / ${escapeHtml(brandPalette().amber)}</div>
          <div><span>${th('เวอร์ชันเว็บ', 'Web build')}</span><b>${escapeHtml(APP_VERSION_LABEL)} · build ${escapeHtml(APP_UPDATED_ISO)}</b></div>
        </div>
        <p class="copyright-line">${icon('copyright', 'w-3 h-3')} ${escapeHtml(copyrightNote(lang))}</p>
        <div class="btn-row">
          <a class="btn btn-secondary btn-sm" href="${appBaseUrl()}demo/" target="_blank" rel="noopener">${icon('external-link', 'w-4 h-4')} ${th('ตัวอย่างฟังก์ชันครบ','Full-feature demo')}</a>
          <a class="btn btn-ghost btn-sm" href="${appBaseUrl()}docs/ARCHITECTURE.md" target="_blank" rel="noopener">${icon('file-text', 'w-4 h-4')} ${th('เอกสารระบบ','Docs')}</a>
        </div>
        <p class="text-[10px] text-[var(--text-tertiary)] font-mono">build ${escapeHtml(APP_UPDATED_ISO)} • ${escapeHtml(APP_VERSION)} • ${escapeHtml(APP_NAME_BY)}</p>
      </div>
    </div>
  `;
  queueIcons();
  initReveal(appEl);

  /* ---- Settings tabs (v18.1) ---- */
  const settingsTabBar = document.getElementById('settings-tabs');
  if (settingsTabBar) {
    const applySettingsTab = (tabId) => {
      settingsTabBar.querySelectorAll('.settings-tab').forEach(t => t.classList.toggle('active', t.dataset.settingsTab === tabId));
      appEl.querySelectorAll('[data-settings-section]').forEach(card => {
        card.style.display = card.dataset.settingsSection === tabId ? '' : 'none';
      });
    };
    settingsTabBar.querySelectorAll('.settings-tab').forEach(tab => {
      tab.addEventListener('click', () => applySettingsTab(tab.dataset.settingsTab));
    });
    applySettingsTab('trip');
  }

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

  /* ---- Extra trip currencies (multi-currency trips) + their THB rates ---- */
  const tripCurHost = document.getElementById('trip-currency-rows');
  const tripCurRowHtml = (code, rate) => {
    const options = tripCurrencyList(trip, [code])
      .map(c => `<option value="${c}" ${c === code ? 'selected' : ''}>${c}</option>`).join('');
    const val = Number(rate) > 0 ? Number(rate) : '';
    return `
      <div class="flex gap-2 items-center trip-currency-row">
        <select class="input flex-1 trip-cur-code" style="min-height:38px;" aria-label="${th('สกุลเงิน','Currency')}">${options}</select>
        <input class="input flex-1 trip-cur-rate" type="number" step="0.0001" min="0" inputmode="decimal" placeholder="1 = ? THB" style="min-height:38px;" value="${val}" aria-label="${th('เรทเป็น THB','Rate to THB')}">
        <button type="button" class="btn btn-ghost btn-sm trip-cur-remove" title="${th('ลบสกุลเงินนี้','Remove this currency')}" style="min-height:36px;">${icon('trash-2', 'w-3.5 h-3.5')}</button>
      </div>`;
  };
  const readTripCurrencyRows = () =>
    [...(tripCurHost?.querySelectorAll('.trip-currency-row') || [])].map(row => ({
      code: String(row.querySelector('.trip-cur-code')?.value || '').trim().toUpperCase(),
      rate: parseFloat(row.querySelector('.trip-cur-rate')?.value) || 0
    }));
  const renderTripCurrencyRows = (rows) => {
    if (!tripCurHost) return;
    tripCurHost.innerHTML = rows.length
      ? rows.map(r => tripCurRowHtml(r.code, r.rate)).join('')
      : `<p class="text-xs text-[var(--text-secondary)]">${th('ยังไม่มีสกุลเงินเพิ่มเติม — ทริปใช้สกุลหลักอย่างเดียว','No extra currencies — the trip uses only its base currency')}</p>`;
    queueIcons();
  };
  renderTripCurrencyRows(
    (trip?.tripCurrencies || []).map(code => ({
      code,
      rate: Number(trip?.currencyRates?.[code]) > 0 ? Number(trip.currencyRates[code]) : resolveTripThbRate(trip, [], code)
    }))
  );
  bind('add-trip-currency', 'click', () => {
    const rows = readTripCurrencyRows();
    const used = new Set(rows.map(r => r.code).filter(Boolean));
    const base = trip?.baseCurrency || 'THB';
    const next = tripCurrencyList(trip).find(c => c !== base && !used.has(c)) || 'JPY';
    const rate = resolveTripThbRate(trip, [], next);
    renderTripCurrencyRows([...rows, { code: next, rate: rate > 0 ? rate : '' }]);
  });
  tripCurHost?.addEventListener('click', (e) => {
    const btn = e.target.closest('.trip-cur-remove');
    if (!btn) return;
    const rowEls = [...tripCurHost.querySelectorAll('.trip-currency-row')];
    const idx = rowEls.indexOf(btn.closest('.trip-currency-row'));
    if (idx < 0) return;
    const rows = readTripCurrencyRows();
    rows.splice(idx, 1);
    renderTripCurrencyRows(rows);
  });
  /** Payload fields for the save buttons: de-duped currencies + their rates. */
  function readTripCurrencyFields() {
    const base = document.getElementById('s-currency')?.value || trip?.baseCurrency || 'THB';
    const byCode = new Map();
    for (const r of readTripCurrencyRows()) {
      if (r.code && r.code !== base) byCode.set(r.code, r);
    }
    return {
      tripCurrencies: [...byCode.keys()],
      currencyRates: Object.fromEntries([...byCode.entries()].map(([code, r]) => [code, r.rate > 0 ? r.rate : 0]))
    };
  }

  /** Read the per-member budgets currently typed in the form (minor units in THB satang). */
  function readMemberBudgets() {
    const out = {};
    for (const m of settingMembers) {
      const v = parseCurrencyInput(document.getElementById(`s-mbudget-${m.id}`)?.value || '');
      if (v > 0) out[m.id] = toMinor(v, 2);
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
      const rate = code === 'THB' ? 1 : parseCurrencyInput(document.getElementById('s-thb-rate').value);
      const budgetTotal = parseCurrencyInput(document.getElementById('s-budget-total').value) || 0;
      const budgetPerPerson = parseCurrencyInput(document.getElementById('s-budget-per-person').value) || 0;
      const budgetTotalMinor = toMinor(budgetTotal, 2);
      const budgetPerPersonMinor = toMinor(budgetPerPerson, 2);
      const secondaryTripCurr = (thbMinor) => (code === 'THB' || !rate ? '' : formatCurrency(convertCurrency(thbMinor, 'THB', code, 1 / rate), code));

      // Each member's committed share (their allocations, normalized to THB).
      const shareBy = {};
      for (const exp of normalized) {
        if ((exp.status || 'active') === 'voided') continue;
        for (const a of exp.allocations || []) shareBy[a.memberId] = (shareBy[a.memberId] || 0) + (a.amountMinor || 0);
      }

      let html = `<div class="flex items-center gap-2">${icon('wallet', 'w-4 h-4')} <span>${th('ใช้ไป','Spent')}: <b>${formatCurrency(totalMinor, 'THB')}</b>${code !== 'THB' && secondaryTripCurr(totalMinor) ? ` <span class="text-xs text-[var(--text-tertiary)]">(≈ ${secondaryTripCurr(totalMinor)})</span>` : ''}</span></div>`;
      if (budgetTotalMinor > 0) {
        const diff = budgetTotalMinor - totalMinor;
        const pct = Math.min(100, Math.round(totalMinor / budgetTotalMinor * 100));
        const origSec = secondaryTripCurr(budgetTotalMinor);
        html += `<div class="flex items-center gap-2 mt-2">${icon('pie-chart', 'w-4 h-4')} <span>${th('งบ','Budget')} ${thbPlusLabelHtml(budgetTotalMinor, origSec)} • ${diff >= 0 ? th(`เหลือ ${formatCurrency(diff, 'THB')}`, `${formatCurrency(diff, 'THB')} left`) : th(`เกิน ${formatCurrency(-diff, 'THB')}`, `${formatCurrency(-diff, 'THB')} over`)} (${pct}%)</span></div><div class="progress mt-2"><div class="progress-bar" style="width:${pct}%; ${diff < 0 ? 'background: var(--danger);' : ''}"></div></div>`;
      }
      if (budgetPerPersonMinor > 0) {
        const origSec = secondaryTripCurr(budgetPerPersonMinor);
        html += `<div class="flex items-center gap-2 mt-2">${icon('user', 'w-4 h-4')} <span>${th('งบต่อคน (ค่าเริ่มต้น)','Default per person')} ${thbPlusLabelHtml(budgetPerPersonMinor, origSec)}</span></div>`;
      }

      /* ---- Consistency checks (a request: the numbers must add up) ---- */
      const memberRows = settingMembers.map(m => {
        const typed = parseCurrencyInput(document.getElementById(`s-mbudget-${m.id}`)?.value || '');
        const own = typed > 0 ? typed : budgetPerPerson;
        return { m, own, typed, spent: shareBy[m.id] || 0 };
      });
      const sumMembers = memberRows.reduce((s, r) => s + (r.typed > 0 ? toMinor(r.typed, 2) : 0), 0);
      const checks = [];
      if (budgetTotalMinor > 0 && sumMembers > 0) {
        if (Math.abs(sumMembers - budgetTotalMinor) > 1) {
          checks.push({ icon: 'alert-triangle', text: `${th('ผลรวมงบรายคน', 'Sum of personal budgets')} <b>${formatCurrency(sumMembers, 'THB')}</b> ${th('ไม่เท่ากับงบรวม', 'does not equal the total budget')} <b>${formatCurrency(budgetTotalMinor, 'THB')}</b> ${th('(ส่วนต่าง', '(difference')} ${formatCurrency(Math.abs(sumMembers - budgetTotalMinor), 'THB')})` });
        }
      }
      if (budgetTotalMinor > 0 && budgetPerPersonMinor > 0 && settingMembers.length) {
        const expected = budgetPerPersonMinor * settingMembers.length;
        if (Math.abs(expected - budgetTotalMinor) > 1 && sumMembers <= 0) {
          checks.push({ icon: 'info', text: `${th('งบต่อคน ×', 'Per person ×')} ${settingMembers.length} ${th('คน =', ' people =')} <b>${formatCurrency(Math.round(expected), 'THB')}</b> ${th('แต่งบรวมคือ', 'but the total budget is')} <b>${formatCurrency(budgetTotalMinor, 'THB')}</b>` });
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
            const bThb = toMinor(r.own, 2);
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
  bind('s-currency', 'change', updateBudgetCompare);
  bind('s-thb-rate', 'input', updateBudgetCompare);
  settingMembers.forEach(m => {
    const input = document.getElementById(`s-mbudget-${m.id}`);
    input?.addEventListener('input', updateBudgetCompare);
  });

  bind('btn-distribute-budget', 'click', async () => {
    if (!settingMembers.length) {
      toast.info(th('ยังไม่มีสมาชิกในทริป', 'No members in this trip yet'));
      return;
    }
    const count = settingMembers.length;
    const totalVal = parseCurrencyInput(document.getElementById('s-budget-total')?.value || '');
    const perPersonVal = parseCurrencyInput(document.getElementById('s-budget-per-person')?.value || '');

    let { perPerson } = distributeBudgetEqually({ total: totalVal, perPerson: perPersonVal, memberCount: count });

    if (!(perPerson > 0)) {
      const existing = settingMembers
        .map(m => parseCurrencyInput(document.getElementById(`s-mbudget-${m.id}`)?.value || ''))
        .find(v => v > 0);
      const input = await promptAction({
        title: th('กระจายงบประมาณรายบุคคล', 'Distribute individual budget'),
        label: th(`ระบุงบประมาณต่อคนสำหรับสมาชิก ${count} คน (บาท)`, `Specify budget per person for ${count} members (THB)`),
        placeholder: '10,000',
        value: existing ? (existing % 1 === 0 ? formatAmount(existing, 0) : formatAmount(existing, 2)) : '',
        confirmText: th('กระจายงบ', 'Distribute'),
        icon: 'divide'
      });
      if (input == null) return;
      const entered = parseCurrencyInput(input);
      if (!(entered > 0)) {
        toast.error(th('กรุณาระบุจำนวนเงินที่มากกว่า 0', 'Please enter an amount greater than 0'));
        return;
      }
      perPerson = entered;
    }

    if (!(perPerson > 0)) return;

    // Check if any member has a differing budget already set
    const hasDifferent = settingMembers.some(m => {
      const v = parseCurrencyInput(document.getElementById(`s-mbudget-${m.id}`)?.value || '');
      return v > 0 && Math.abs(v - perPerson) > 0.01;
    });

    if (hasDifferent) {
      const ok = await confirmAction({
        title: th('กระจายงบประมาณรายบุคคล', 'Distribute individual budget'),
        message: th(
          `ต้องการแทนที่งบของสมาชิกทุกคนเป็นคนละ ${formatCurrency(toMinor(perPerson, 2), 'THB')} ใช่หรือไม่?`,
          `Do you want to set everyone's budget to ${formatCurrency(toMinor(perPerson, 2), 'THB')}?`
        ),
        confirmText: th('กระจายงบเท่ากัน', 'Distribute equally'),
        cancelText: th('ยกเลิก', 'Cancel'),
        icon: 'divide'
      });
      if (!ok) return;
    }

    const formatted = perPerson % 1 === 0 ? formatAmount(perPerson, 0) : formatAmount(perPerson, 2);
    settingMembers.forEach(m => {
      const input = document.getElementById(`s-mbudget-${m.id}`);
      if (input) {
        input.value = formatted;
      }
    });

    const ppInput = document.getElementById('s-budget-per-person');
    if (ppInput) {
      ppInput.value = formatted;
    }

    const totalInput = document.getElementById('s-budget-total');
    if (totalInput && !(parseCurrencyInput(totalInput.value) > 0)) {
      const newTotal = Math.round(perPerson * count * 100) / 100;
      totalInput.value = newTotal % 1 === 0 ? formatAmount(newTotal, 0) : formatAmount(newTotal, 2);
    }

    updateBudgetCompare();
    toast.success(th(
      `กระจายงบคนละ ${formatCurrency(toMinor(perPerson, 2), 'THB')} ให้สมาชิก ${count} คนแล้ว`,
      `Distributed ${formatCurrency(toMinor(perPerson, 2), 'THB')} per person to ${count} members`
    ));
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
        // Extra currencies used in this trip + their THB rates (multi-currency)
        ...readTripCurrencyFields(),
        themeColor: trip?.themeColor || brandPrimary(),
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
    budgetTotal: toMinor(parseCurrencyInput(document.getElementById('s-budget-total').value), 2),
    budgetPerPerson: toMinor(parseCurrencyInput(document.getElementById('s-budget-per-person').value), 2),
    budgetCurrency: 'THB',
    memberBudgets: readMemberBudgets()
  }));

  // Colour theme picker (v18) — palette cards, custom colours, vividness, modes.
  bindThemePicker(document.getElementById('settings-appearance-card'), {
    onChange: () => {
      // Re-paint things JS owns: day colours, avatars, the settings swatches.
      renderDesktopNav();
      const stamp = document.querySelector('#about-card [data-build-stamp]');
      if (stamp) stamp.innerHTML = `${icon('calendar-check', 'w-3.5 h-3.5')} ${escapeHtml(appUpdatedLabel(lang))}`;
      queueIcons();
    }
  });
  updateModeIcons();

  bind('account-edit', 'click', () => openUserSheet(currentUser));
  bind('account-appearance', 'click', () => showAppearanceSheet());
  bind('account-cache', 'click', async () => {
    const ok = await confirmAction({
      title: th('ล้างแคชของอุปกรณ์นี้?', 'Clear this device\'s cache?'),
      message: th('ข้อมูลยังอยู่ใน Firebase — แค่ล้างค่าที่จำไว้ในเครื่อง (ธีมทริป, แคชรายชื่อ, สถานะล็อกอินสมาชิก)', 'Your data stays in Firebase — only what this device remembered is cleared (theme, caches, member session).'),
      confirmText: th('ล้าง', 'Clear'), danger: true, icon: 'eraser'
    });
    if (!ok) return;
    ['fuji_color_theme', 'fuji_map_layer', 'fuji_exp_group', 'fuji_datacache'].forEach(k => { try { localStorage.removeItem(k); } catch {} });
    clearAllDataCache?.();
    toast.success(th('ล้างแคชแล้ว', 'Cache cleared'));
    setTimeout(() => location.reload(), 400);
  });
  bind('account-logout', 'click', async () => { await doLogout(); });

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

/* ================================================================== *
 * Dashboard widgets for the trip tools (v16)
 * Quick tiles → prep progress • weather • next booking • top ideas
 * All data loads in parallel and any widget without data stays hidden.
 * ================================================================== */
async function paintDashboardTools({ tripId, trip, members = [], items = [], lang = getLang() }) {
  const box = document.getElementById('dash-tools');
  if (!box) return;
  const th = (a, b) => (lang === 'th' ? a : b);
  box.innerHTML = `<div class="grid md:grid-cols-3 gap-3">${'<div class="skeleton h-20"></div>'.repeat(3)}</div>`;

  const [lists, ideas, reservations] = await Promise.all([
    listChecklists(tripId).catch(() => []),
    listIdeas(tripId).catch(() => []),
    listReservations(tripId).catch(() => [])
  ]);
  if (!box.isConnected) return;

  const prep = checklistsProgress(lists);
  const openIdeas = ideas.filter(i => i.status !== 'planned');
  const topIdeas = trendingIdeas(ideas, 3);
  const nextOnes = upcomingReservations(reservations, dayjs().format('YYYY-MM-DDTHH:mm'), 2);

  const tile = (href, ic, label, value, sub, { accent = false } = {}) => `
    <a href="${href}" class="card card-hover p-4 tool-tile" style="text-decoration:none; color:inherit;">
      <div class="flex items-center gap-3">
        <span class="row-icon" style="width:40px;height:40px;border-radius:14px;${accent ? 'background:var(--brand-yellow-tint);color:var(--brand-yellow-ink);' : 'background:var(--primary-light);color:var(--primary-strong);'}">${icon(ic, 'w-5 h-5')}</span>
        <span class="min-w-0 flex-1">
          <span class="block text-[10px] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">${label}</span>
          <span class="block text-lg font-bold leading-tight" style="font-family:var(--font-display);">${value}</span>
          <span class="block text-[11px] text-[var(--text-secondary)] truncate">${sub}</span>
        </span>
        ${icon('chevron-right', 'w-4 h-4')}
      </div>
    </a>`;

  const weatherCard = `<div class="card p-5" id="dash-weather-multi"><div class="skeleton h-24"></div></div>`;

  const bookingCard = nextOnes.length ? `
    <div class="card p-5">
      <div class="flex items-center justify-between gap-2 mb-3">
        <h3 class="font-bold flex items-center gap-2"><span class="row-icon" style="width:30px;height:30px;border-radius:10px;background:var(--primary-light);color:var(--primary-strong);">${icon('ticket', 'w-4 h-4')}</span> ${t('bookings')}</h3>
        <a href="#/trip/${tripId}/bookings" class="btn btn-ghost btn-sm text-xs">${th('ดูทั้งหมด','All')}</a>
      </div>
      <div class="space-y-2">
        ${nextOnes.map(r => {
          const rt = reservationTypeDef(r.type);
          const days = dayjs(`${r.date}T${r.startTime || '00:00'}`).diff(dayjs(), 'day');
          return `<div class="flex items-center gap-3 p-2 rounded-xl" style="background:var(--bg-secondary);">
            <span class="row-icon" style="width:32px;height:32px;border-radius:10px;background:${rt.tone}1f;color:${rt.tone};">${icon(rt.icon, 'w-4 h-4')}</span>
            <span class="min-w-0 flex-1">
              <span class="block text-xs font-bold truncate">${escapeHtml(r.title || '')}</span>
              <span class="block text-[10px] text-[var(--text-secondary)]">${escapeHtml(r.date || '')} ${escapeHtml(r.startTime || '')}${days >= 0 ? ` • ${th('อีก','in')} ${days} ${th('วัน','d')}` : ''}</span>
            </span>
            ${r.confirmation ? `<button class="icon-btn" data-dash-copy="${escapeHtml(r.confirmation)}" title="${t('confirmCode')}">${icon('copy', 'w-3.5 h-3.5')}</button>` : ''}
          </div>`;
        }).join('')}
      </div>
    </div>` : '';

  const ideaCard = topIdeas.length ? `
    <div class="card p-5">
      <div class="flex items-center justify-between gap-2 mb-3">
        <h3 class="font-bold flex items-center gap-2"><span class="row-icon" style="width:30px;height:30px;border-radius:10px;background:var(--brand-yellow-tint);color:var(--brand-yellow-ink);">${icon('lightbulb', 'w-4 h-4')}</span> ${t('ideasBoard')}</h3>
        <a href="#/trip/${tripId}/ideas" class="btn btn-ghost btn-sm text-xs">${th('โหวตต่อ','Vote')}</a>
      </div>
      <div class="space-y-2">
        ${topIdeas.map(i => `
          <div class="flex items-center gap-3">
            <span class="vote-pill">${icon('chevron-up', 'w-3 h-3')} ${voteCount(i)}</span>
            <span class="min-w-0 flex-1 text-xs font-semibold truncate">${escapeHtml(i.title || '')}</span>
          </div>`).join('')}
      </div>
    </div>` : '';

  const prepCard = lists.length ? `
    <div class="card p-5">
      <div class="flex items-center justify-between gap-2 mb-3">
        <h3 class="font-bold flex items-center gap-2"><span class="row-icon" style="width:30px;height:30px;border-radius:10px;background:var(--primary-light);color:var(--primary-strong);">${icon('clipboard-check', 'w-4 h-4')}</span> ${t('prep')}</h3>
        <a href="#/trip/${tripId}/prep" class="btn btn-ghost btn-sm text-xs">${th('เปิดลิสต์','Open')}</a>
      </div>
      <p class="text-xs text-[var(--text-secondary)] mb-2">${prep.done}/${prep.total} ${t('items')} • ${prep.remaining} ${th('เหลือ','left')}</p>
      ${toolProgressHtml(prep.percent)}
    </div>` : '';

  box.innerHTML = `
    <div class="grid md:grid-cols-3 gap-3">
      ${tile(`#/trip/${tripId}/prep`, 'clipboard-check', t('prep'), `${prep.percent}%`,
        prep.total ? `${prep.remaining} ${th('รายการที่ยังไม่ติ๊ก','left to tick')}` : th('เริ่มจากเทมเพลตสำเร็จรูป','Start from a template'))}
      ${tile(`#/trip/${tripId}/ideas`, 'lightbulb', t('ideasBoard'), `${openIdeas.length}`,
        openIdeas.length ? th('รอโหวต/ตัดสินใจ','waiting for votes') : th('ชวนทุกคนเสนอสถานที่','Ask the group for places'), { accent: true })}
      ${tile(`#/trip/${tripId}/bookings`, 'ticket', t('bookings'), `${reservations.length}`,
        nextOnes[0] ? th('ถัดไป','Next') + `: ${(nextOnes[0].title || '').slice(0, 20)}` : th('เพิ่มตั๋ว/ที่พัก','Add tickets & hotels'))}
    </div>
    ${(weatherCard || bookingCard || ideaCard || prepCard) ? `<div class="grid md:grid-cols-2 gap-4 mt-4">${weatherCard}${bookingCard}${ideaCard}${prepCard}</div>` : ''}
  `;
  queueIcons();

  box.querySelectorAll('[data-dash-copy]').forEach(btn => btn.addEventListener('click', () => copyToClipboard(btn.dataset.dashCopy)));
  if (weatherCard) paintWeatherWidget(tripId, trip, items, lang);
  initReveal(box);
}

/* ---- Weather widget: today + 7 days, multi-city (Open-Meteo, no key) ---- */
const WX_MAX_CITIES = 5;
const wxKey = (tripId) => `fuji_weather_cities_${tripId}`;
function loadWxCities(tripId) {
  try {
    const raw = JSON.parse(localStorage.getItem(wxKey(tripId)) || '[]');
    if (!Array.isArray(raw)) return [];
    return raw
      .filter(c => c && (c.name || (c.lat != null && c.lon != null)))
      .slice(0, WX_MAX_CITIES)
      .map(c => ({ name: String(c.name || ''), lat: c.lat != null ? Number(c.lat) : null, lon: c.lon != null ? Number(c.lon) : null, admin: c.admin || '', country: c.country || '' }));
  } catch { return []; }
}
function saveWxCities(tripId, cities) {
  try { localStorage.setItem(wxKey(tripId), JSON.stringify((cities || []).slice(0, WX_MAX_CITIES))); } catch { /* private mode */ }
}
function wxCityLabel(c = {}) {
  return [c.name, c.admin || c.country].filter(Boolean).join(' • ');
}

async function paintWeatherWidget(tripId, trip, items = [], lang = getLang()) {
  const el = document.getElementById('dash-weather-multi');
  if (!el) return;
  const th = (a, b) => (lang === 'th' ? a : b);

  let cities = loadWxCities(tripId);
  // First run: seed from the trip city, plus the first pinned plan place when
  // it looks like a different spot — so the widget is useful immediately.
  if (!cities.length) {
    if (trip?.city) {
      try {
        const g = await geocodeCity(trip.city);
        cities.push(g?.lat != null
          ? { name: trip.city, lat: g.lat, lon: g.lon, admin: g.admin || '', country: g.country || '' }
          : { name: trip.city, lat: null, lon: null });
      } catch { cities.push({ name: trip.city, lat: null, lon: null }); }
    }
    const pinned = (items || []).find(i => hasCoords(i));
    if (pinned && cities.length < WX_MAX_CITIES) {
      const p = coordOf(pinned);
      const dup = cities.some(c => c.lat != null && Math.abs(c.lat - p.lat) < 0.05 && Math.abs(c.lon - p.lng) < 0.05);
      if (p && !dup) cities.push({ name: pinned.title || th('จุดในแผน', 'Planned place'), lat: p.lat, lon: p.lng });
    }
    saveWxCities(tripId, cities);
  }
  let activeIdx = 0;
  let loading = true;
  let loadFailed = false;
  let days = [];

  async function loadActive() {
    const city = cities[activeIdx];
    days = [];
    loadFailed = false;
    loading = true;
    paint();
    if (!city) { loading = false; paint(); return; }
    const start = dayjs().format('YYYY-MM-DD');
    const end = dayjs().add(7, 'day').format('YYYY-MM-DD');
    const place = (city.lat != null && city.lon != null) ? { lat: city.lat, lon: city.lon } : (city.name || '');
    try {
      const forecast = await fetchDailyForecast(place, { startDate: start, endDate: end });
      days = forecastForDates(forecast, datesBetween(start, end, 8)).filter(d => !d.missing);
      if (!days.length) loadFailed = true;
    } catch { loadFailed = true; }
    loading = false;
    if (el.isConnected) paint();
  }

  function paint() {
    const city = cities[activeIdx];
    const today = days[0];
    const tone = weatherTone(today?.tone);
    const tip = weatherTip(days, lang);
    el.innerHTML = `
      <div class="flex items-center justify-between gap-2 mb-2 flex-wrap">
        <h3 class="font-bold flex items-center gap-2"><span class="row-icon" style="width:30px;height:30px;border-radius:10px;background:var(--brand-yellow-tint);color:var(--brand-yellow-ink);">${icon('cloud-sun', 'w-4 h-4')}</span> ${t('weather')}</h3>
        <button class="btn btn-ghost btn-sm text-[11px]" data-wx="manage" style="min-height:28px;padding:2px 8px;">${icon('settings-2', 'w-3.5 h-3.5')} ${th('จัดการเมือง', 'Cities')}</button>
      </div>
      ${cities.length > 1 ? `<div class="chip-row chip-row-scroll mb-2">${cities.map((c, k) => `
        <button class="chip ${k === activeIdx ? 'chip-active' : ''}" data-wx="city" data-k="${k}">${escapeHtml(c.name || '?')}</button>`).join('')}</div>` : ''}
      ${loading ? `<div class="skeleton h-24"></div>` : ''}
      ${!loading && !city ? `<div class="wx-empty">
        <p class="text-xs text-[var(--text-secondary)] mb-2">${th('ยังไม่มีเมือง — เพิ่มเมืองแรกเพื่อดูอากาศวันนี้ + 7 วัน', 'No cities yet — add your first city for today + 7 days.')}</p>
        <button class="btn btn-primary btn-sm" data-wx="manage">${icon('plus', 'w-4 h-4')} ${th('เพิ่มเมือง', 'Add city')}</button>
      </div>` : ''}
      ${!loading && city && loadFailed ? `<div class="wx-empty">
        <p class="text-xs font-semibold mb-1">${th('โหลดอากาศไม่สำเร็จ', 'Weather failed to load')}</p>
        <p class="text-[11px] text-[var(--text-tertiary)] mb-2">${th('เช็กเน็ตแล้วลองใหม่', 'Check your connection and retry.')}</p>
        <button class="btn btn-secondary btn-sm" data-wx="retry">${icon('refresh-cw', 'w-4 h-4')} ${th('ลองใหม่', 'Retry')}</button>
      </div>` : ''}
      ${!loading && city && !loadFailed && today ? `
      <div class="wx-today mb-2" style="background:${tone.bg}; border-color:${tone.line}; color:${tone.fg};">
        <div class="min-w-0">
          <p class="wx-today-kicker">${escapeHtml(wxCityLabel(city))} • ${th('วันนี้', 'Today')}</p>
          <p class="wx-today-temp">${Math.round(today.max ?? 0)}°<small> / ${Math.round(today.min ?? 0)}°</small></p>
          <p class="wx-today-desc">${icon(today.icon || 'cloud', '')} ${escapeHtml(forecastLabel(today, lang))}${today.rainChance != null ? ` • ${icon('droplets', '')} ${today.rainChance}%` : ''}</p>
        </div>
        <div class="wx-today-icon">${icon(today.icon || 'cloud', '')}</div>
      </div>
      <div class="weather-strip">
        ${days.slice(1).map(d => {
          const t2 = weatherTone(d.tone);
          return `<div class="weather-chip" style="background:${t2.bg}; border-color:${t2.line}; color:${t2.fg};" title="${escapeHtml(forecastLabel(d, lang))}${d.rainChance != null ? ` • ${d.rainChance}%` : ''}">
            <span class="weather-chip-day">${dayjs(d.date).format('DD MMM')}</span>
            ${icon(d.icon, 'w-4 h-4')}
            <span class="weather-chip-temp">${Math.round(d.max ?? 0)}°<small>${Math.round(d.min ?? 0)}°</small></span>
            ${d.rainChance != null && d.rainChance >= 40 ? `<span class="weather-chip-rain">${icon('droplets', 'w-2.5 h-2.5')}${d.rainChance}%</span>` : ''}
          </div>`;
        }).join('')}
      </div>
      ${tip ? `<p class="text-[11px] text-[var(--text-secondary)] mt-2">${icon('info', 'w-3 h-3')} ${escapeHtml(tip)}</p>` : ''}` : ''}
      <p class="text-[10px] text-[var(--text-tertiary)] mt-2 text-right">Open-Meteo</p>
    `;
    queueIcons();
    el.querySelectorAll('[data-wx]').forEach(btn => btn.addEventListener('click', () => {
      const act = btn.dataset.wx;
      if (act === 'city') { activeIdx = Number(btn.dataset.k) || 0; loadActive(); }
      else if (act === 'retry') loadActive();
      else if (act === 'manage') openWxManager();
    }));
  }

  /** Bottom-sheet city manager: search + add + remove (max 5). */
  function openWxManager() {
    const sheet = showBottomSheet(`
      <div class="space-y-3">
        <div class="flex items-start gap-3">
          <div class="row-icon" style="width:42px;height:42px;border-radius:14px;background:var(--gradient-primary);color:#fff;flex-shrink:0;">${icon('cloud-sun', 'w-5 h-5')}</div>
          <div class="min-w-0">
            <h3 class="font-bold text-base leading-tight" style="font-family: var(--font-display);">${th('เมืองที่ติดตาม', 'Tracked cities')}</h3>
            <p class="text-xs text-[var(--text-secondary)] mt-0.5">${th(`สูงสุด ${WX_MAX_CITIES} เมือง`, `Up to ${WX_MAX_CITIES} cities`)}</p>
          </div>
        </div>
        <div class="input-group" style="margin:0;">
          <div class="relative">
            <input id="wx-search" class="input text-sm" style="padding-left:34px;" placeholder="${th('ค้นหาเมือง… เช่น โตเกียว เชียงใหม่', 'Search cities… e.g. Tokyo, Paris')}" autocomplete="off">
            <span style="position:absolute;left:10px;top:50%;transform:translateY(-50%);color:var(--text-tertiary);">${icon('search', 'w-4 h-4')}</span>
          </div>
        </div>
        <div id="wx-results" class="space-y-1.5"></div>
        <div id="wx-list" class="space-y-1.5"></div>
        <button id="wx-done" class="btn btn-primary w-full">${th('เสร็จ', 'Done')}</button>
      </div>
    `);
    queueIcons();
    const paintList = () => {
      const listEl = sheet.sheet.querySelector('#wx-list');
      if (!listEl) return;
      listEl.innerHTML = cities.length ? cities.map((c, k) => `
        <div class="dash-pop-row" style="cursor:default;">
          <span class="row-icon" style="width:30px;height:30px;border-radius:10px;background:var(--primary-light);color:var(--primary-strong);">${icon('map-pin', 'w-3.5 h-3.5')}</span>
          <span class="min-w-0 flex-1 text-left">
            <span class="block text-xs font-bold truncate">${escapeHtml(c.name || '?')}${k === activeIdx ? ` <span class="text-[10px] font-bold" style="color:var(--primary-strong);">• ${th('กำลังดู', 'viewing')}</span>` : ''}</span>
            <span class="block text-[10px] text-[var(--text-tertiary)] truncate">${escapeHtml([c.admin, c.country].filter(Boolean).join(', ')) || `${Number(c.lat)?.toFixed?.(2) ?? ''} ${Number(c.lon)?.toFixed?.(2) ?? ''}`}</span>
          </span>
          ${k !== activeIdx ? `<button class="btn btn-ghost btn-sm text-[11px]" data-wx-pick="${k}">${th('ดู', 'View')}</button>` : ''}
          <button class="icon-btn" data-wx-del="${k}" aria-label="${th('ลบ', 'Remove')}" style="width:30px;height:30px;">${icon('x', 'w-3.5 h-3.5')}</button>
        </div>`).join('')
        : `<p class="text-xs text-[var(--text-tertiary)]">${th('ยังไม่มีเมือง — ค้นหาด้านบนเพื่อเพิ่ม', 'No cities yet — search above to add one.')}</p>`;
      queueIcons();
      listEl.querySelectorAll('[data-wx-pick]').forEach(b => b.addEventListener('click', () => {
        activeIdx = Number(b.dataset.wxPick) || 0; paintList(); loadActive();
      }));
      listEl.querySelectorAll('[data-wx-del]').forEach(b => b.addEventListener('click', () => {
        const k = Number(b.dataset.wxDel);
        cities.splice(k, 1);
        if (activeIdx >= cities.length) activeIdx = Math.max(0, cities.length - 1);
        saveWxCities(tripId, cities); paintList(); loadActive();
      }));
    };
    paintList();
    const input = sheet.sheet.querySelector('#wx-search');
    const resultsEl = sheet.sheet.querySelector('#wx-results');
    let timer = null;
    let seq = 0;
    input?.addEventListener('input', () => {
      clearTimeout(timer);
      const q = input.value;
      timer = setTimeout(async () => {
        const my = ++seq;
        if (!String(q || '').trim()) { if (resultsEl) resultsEl.innerHTML = ''; return; }
        if (resultsEl) resultsEl.innerHTML = `<p class="text-[11px] text-[var(--text-tertiary)]">${th('กำลังค้นหา…', 'Searching…')}</p>`;
        const hits = await searchCities(q, 6);
        if (my !== seq || !resultsEl?.isConnected) return;
        resultsEl.innerHTML = hits.length ? hits.map((h, k) => `
          <button class="dash-pop-row w-full" data-wx-hit="${k}">
            <span class="row-icon" style="width:30px;height:30px;border-radius:10px;background:var(--bg-secondary);color:var(--text-secondary);">${icon('map-pin', 'w-3.5 h-3.5')}</span>
            <span class="min-w-0 flex-1 text-left">
              <span class="block text-xs font-bold truncate">${escapeHtml(h.name || '')}</span>
              <span class="block text-[10px] text-[var(--text-tertiary)] truncate">${escapeHtml([h.admin, h.country].filter(Boolean).join(', '))}</span>
            </span>
            ${icon('plus', 'w-4 h-4')}
          </button>`).join('')
          : `<p class="text-[11px] text-[var(--text-tertiary)]">${th('ไม่เจอเมืองนี้ — ลองสะกดแบบอังกฤษ', 'No matches — try the English spelling.')}</p>`;
        queueIcons();
        resultsEl.querySelectorAll('[data-wx-hit]').forEach(b => b.addEventListener('click', () => {
          const h = hits[Number(b.dataset.wxHit)];
          if (!h) return;
          if (cities.length >= WX_MAX_CITIES) { toast.error(th(`เพิ่มได้สูงสุด ${WX_MAX_CITIES} เมือง`, `Maximum ${WX_MAX_CITIES} cities`)); return; }
          if (cities.some(c => c.lat != null && Math.abs(c.lat - h.lat) < 0.01 && Math.abs(c.lon - h.lon) < 0.01)) {
            toast.error(th('มีเมืองนี้แล้ว', 'Already added')); return;
          }
          cities.push({ name: h.name, lat: h.lat, lon: h.lon, admin: h.admin || '', country: h.country || '' });
          saveWxCities(tripId, cities);
          activeIdx = cities.length - 1;
          input.value = '';
          resultsEl.innerHTML = '';
          paintList();
          loadActive();
        }));
      }, 400);
    });
    sheet.sheet.querySelector('#wx-done')?.addEventListener('click', () => sheet.close());
  }

  loadActive();
}

/* ================================================================== *
 * Trip tools v16 — เตรียมตัว (checklists) • ไอเดียสถานที่ • การจอง
 * Wanderlog-inspired: packing/to-do lists, an up-voted places board and
 * reservation cards with one-tap “add to the day plan”.
 * ================================================================== */

/* ---------------- shared little helpers ---------------- */

/** <option> list of trip members (optionally with “unassigned”). */
function toolMemberOptions(members = [], selected = '', lang = 'th', { none = '' } = {}) {
  const opts = [];
  if (none) opts.push(`<option value="" ${!selected ? 'selected' : ''}>${escapeHtml(none)}</option>`);
  for (const m of members) {
    opts.push(`<option value="${escapeHtml(m.id)}" ${m.id === selected ? 'selected' : ''}>${escapeHtml(m.displayName || m.name || '')}</option>`);
  }
  return opts.join('');
}

/** <option> list of the trip's days. */
function toolDayOptions(trip, selected = '', lang = getLang(), th = (a) => a) {
  const days = trip ? getTripDays(trip.startDate, trip.endDate) : [];
  if (!days.length) {
    const today = dayjs().format('YYYY-MM-DD');
    return `<option value="${today}" ${today === selected ? 'selected' : ''}>${th('วันนี้','Today')} • ${today}</option>`;
  }
  return days.map((d, i) => {
    const ds = dayjs(d).format('YYYY-MM-DD');
    const label = `${th('วันที่','Day')} ${i + 1} • ${dayjs(d).format('DD MMM')}${ds === dayjs().format('YYYY-MM-DD') ? ` ${th('(วันนี้)','(today)')}` : ''}`;
    return `<option value="${ds}" ${ds === selected ? 'selected' : ''}>${escapeHtml(label)}</option>`;
  }).join('');
}

/** Currency <select> limited to the trip's currencies. */
function toolCurrencyOptions(trip, selected = 'THB') {
  const list = tripCurrencyList(trip || {});
  const codes = list.includes(selected) ? list : [selected, ...list];
  return codes.map(c => `<option value="${c}" ${c === selected ? 'selected' : ''}>${c}</option>`).join('');
}

/** money minor → the editable major-unit string */
function toolAmountValue(minor, currency) {
  const n = fromMinor(Number(minor) || 0, getCurrencyDecimals(currency));
  return Number(n) ? String(n) : '';
}

/** Copy helper (works on http + https, falls back to a hidden textarea). */
async function copyToClipboard(text, okTh = 'คัดลอกแล้ว', okEn = 'Copied') {
  const value = String(text ?? '');
  if (!value) return false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
    } else {
      const ta = document.createElement('textarea');
      ta.value = value;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    toast.success(getLang() === 'th' ? okTh : okEn);
    return true;
  } catch {
    copyFallbackSheet(value, getLang() === 'th' ? okTh : okEn);
    return false;
  }
}

/**
 * Copy can be blocked (http, in-app browsers, iOS webviews).  Instead of an
 * error we show the text in a pre-selected box so a long-press still copies it.
 */
function copyFallbackSheet(text, label = '') {
  const th = (a, b) => (getLang() === 'th' ? a : b);
  const sheet = showBottomSheet(`
    <div class="space-y-3">
      <div class="flex items-start gap-3">
        <div class="row-icon" style="width:42px;height:42px;border-radius:14px;background:var(--brand-yellow-tint);color:var(--brand-yellow-ink);">${icon('clipboard-copy', 'w-5 h-5')}</div>
        <div class="min-w-0">
          <h3 class="font-bold text-base leading-tight" style="font-family: var(--font-display);">${th('คัดลอกอัตโนมัติไม่ได้','Automatic copy is blocked')}</h3>
          <p class="text-xs text-[var(--text-secondary)] mt-0.5">${th('เลือกข้อความด้านล่างแล้วกด “คัดลอก” อีกครั้งได้เลย','The text below is already selected — copy it from the menu')}</p>
        </div>
      </div>
      <div class="input-group">
        <label class="input-label">${icon('link', 'w-3.5 h-3.5')} ${escapeHtml(label || th('ข้อความ','Text'))}</label>
        <textarea id="copy-fallback-text" class="input import-textarea" readonly style="min-height:120px;"></textarea>
      </div>
      <button class="btn btn-primary w-full" id="copy-fallback-close">${th('ปิด','Close')}</button>
    </div>`);
  const ta = sheet.sheet.querySelector('#copy-fallback-text');
  if (ta) { ta.value = text; ta.focus(); ta.select(); try { ta.setSelectionRange(0, text.length); } catch { /* ignore */ } }
  sheet.sheet.querySelector('#copy-fallback-close')?.addEventListener('click', () => sheet.close());
  return sheet;
}

/** Small progress bar used by the prep page + dashboard widget. */
function toolProgressHtml(percent = 0, { tone = 'blue' } = {}) {
  const p = Math.max(0, Math.min(100, Math.round(percent)));
  const bg = tone === 'yellow' ? 'var(--gradient-sun)' : 'var(--gradient-primary)';
  return `<div class="tool-progress" role="progressbar" aria-valuenow="${p}" aria-valuemin="0" aria-valuemax="100">
    <span style="width:${p}%; background:${bg};"></span>
  </div>`;
}

/** Shared “add to the day plan” sheet — used by ideas + bookings. */
function openAddToPlanSheet({ trip, title, subtitle, defaultDate, defaultTime, category, onConfirm }) {
  const lang = getLang();
  const th = (a, b) => (lang === 'th' ? a : b);
  const sheet = showBottomSheet(`
    <div class="space-y-4">
      <div class="flex items-start gap-3">
        <div class="row-icon" style="width:42px;height:42px;border-radius:14px;background:var(--gradient-primary);color:#fff;">${icon('calendar-plus', 'w-5 h-5')}</div>
        <div class="min-w-0">
          <h3 class="font-bold text-base leading-tight" style="font-family: var(--font-display);">${t('addToPlan')}</h3>
          <p class="text-xs text-[var(--text-secondary)] mt-0.5">${escapeHtml(title || '')}</p>
        </div>
      </div>
      ${subtitle ? `<p class="text-[11px] text-[var(--text-secondary)] p-3 rounded-xl" style="background:var(--bg-secondary); border:1px solid var(--border);">${subtitle}</p>` : ''}
      <div class="grid grid-cols-2 gap-3">
        <div class="input-group"><label class="input-label">${icon('calendar', 'w-3.5 h-3.5')} ${th('วัน','Day')}</label>
          <select id="atp-date" class="input">${toolDayOptions(trip, defaultDate || trip?.startDate || '', lang, th)}</select></div>
        <div class="input-group"><label class="input-label">${icon('clock', 'w-3.5 h-3.5')} ${th('เวลาเริ่ม','Start')}</label>
          <input id="atp-time" type="time" class="input" value="${escapeHtml(defaultTime || '09:00')}"></div>
      </div>
      <div class="input-group"><label class="input-label">${icon('layout-grid', 'w-3.5 h-3.5')} ${th('หมวดหมู่','Category')}</label>
        <select id="atp-cat" class="input">${ITINERARY_CATEGORIES.map(c => `<option value="${c.id}" ${c.id === category ? 'selected' : ''}>${escapeHtml(lang === 'th' ? c.th : c.en)}</option>`).join('')}</select></div>
      <div class="flex gap-2">
        <button id="atp-cancel" class="btn btn-secondary flex-1">${t('cancel')}</button>
        <button id="atp-ok" class="btn btn-primary flex-1">${icon('check', 'w-4 h-4')} ${t('addToPlan')}</button>
      </div>
    </div>
  `);
  queueIcons();
  document.getElementById('atp-cancel')?.addEventListener('click', () => sheet.close());
  document.getElementById('atp-ok')?.addEventListener('click', async () => {
    const payload = {
      date: document.getElementById('atp-date')?.value || '',
      startAt: document.getElementById('atp-time')?.value || '',
      category: document.getElementById('atp-cat')?.value || 'general'
    };
    const ok = await onConfirm(payload);
    if (ok !== false) sheet.close();
  });
  return sheet;
}

/* ================================================================== *
 * PREP — checklists (packing + to-do)
 * ================================================================== */
async function renderPrep(params) {
  const tripId = params.tripId;
  const token = beginRender();
  const lang = getLang();
  const th = (a, b) => (lang === 'th' ? a : b);
  await loadTrip(tripId);
  if (isStale(token)) return;
  const trip = currentTrip;

  let members = [];
  try { members = await listMembers(tripId); currentTripMembers = members || []; } catch (e) { console.warn('members load failed', e?.message); }
  if (isStale(token)) return;

  let lists = [];
  let loadError = '';
  try { lists = await listChecklists(tripId); } catch (e) { loadError = e?.message || String(e); }
  if (isStale(token)) return;

  appEl.innerHTML = `
    <div class="page-enter max-w-[860px] mx-auto space-y-5">
      <div class="flex flex-wrap items-start justify-between gap-3">
        ${renderPageScene('prep', {
          lang,
          title: `${icon('clipboard-check', 'w-5 h-5')} ${t('prep')}`,
          subtitle: th('เช็กลิสต์ของที่ต้องเตรียมและสิ่งที่ต้องทำ — ติ๊กได้ ทุกคนเห็นตรงกัน','Packing + to-do checklists — tick as you go, everyone sees the same list')
        })}
        <div class="btn-row">
          <button id="prep-template-btn" class="btn btn-secondary btn-sm">${icon('sparkles', 'w-4 h-4')} ${t('templates')}</button>
          <button id="prep-add-btn" class="btn btn-primary btn-sm">${icon('plus', 'w-4 h-4')} ${t('checklists')}</button>
        </div>
      </div>

      <div class="card card-accent p-5" id="prep-progress"></div>
      ${loadError ? `<div class="card p-4 text-xs" style="background:var(--warning-bg); border-color:color-mix(in srgb, var(--warning) 35%, transparent);">${icon('info', 'w-4 h-4')} ${escapeHtml(loadError)}</div>` : ''}
      <div id="prep-lists" class="space-y-4 stagger"></div>
    </div>
  `;
  queueIcons();

  function paintProgress() {
    const box = document.getElementById('prep-progress');
    if (!box) return;
    const p = checklistsProgress(lists);
    box.innerHTML = `
      <div class="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 class="font-bold flex items-center gap-2">${icon('list-checks', 'w-4 h-4')} ${t('progress')}</h3>
          <p class="text-xs text-[var(--text-secondary)] mt-0.5">${p.done}/${p.total} ${t('items')} • ${th('เสร็จแล้ว','done')} ${p.percent}%</p>
        </div>
        <div class="flex items-center gap-2">
          <span class="badge badge-planned text-[10px]">${p.lists} ${t('checklists')}</span>
          <span class="brand-ribbon">${icon('sparkles', 'w-3 h-3')} ${p.remaining} ${th('เหลือ','left')}</span>
        </div>
      </div>
      <div class="mt-3">${toolProgressHtml(p.percent)}</div>
    `;
    queueIcons();
  }

  function paintLists() {
    const box = document.getElementById('prep-lists');
    if (!box) return;
    if (!lists.length) {
      box.innerHTML = renderEmptyState({
        icon: 'clipboard-check',
        title: th('ยังไม่มีเช็กลิสต์','No checklists yet'),
        desc: th('เริ่มจากเทมเพลตสำเร็จรูป (ทะเล หน้าหนาว งานก่อนเดินทาง ฯลฯ) แล้วปรับได้ตามใจ','Start from a ready template (beach, winter, before-you-go …) and edit it freely'),
        actionHtml: `<button id="prep-empty-template" class="btn btn-primary btn-sm mt-2">${icon('sparkles', 'w-4 h-4')} ${t('useTemplate')}</button>`
      });
      bind('prep-empty-template', 'click', () => openTemplateSheet());
      queueIcons();
      return;
    }
    box.innerHTML = lists.map(list => {
      const p = checklistProgress(list);
      const items = sortChecklistItems(list.items || []);
      return `
      <div class="card p-4" data-list="${list.id}">
        <div class="flex items-start justify-between gap-2 flex-wrap">
          <div class="flex items-center gap-2 min-w-0">
            <span class="row-icon" style="width:36px;height:36px;border-radius:12px;background:${escapeHtml(list.color || brandPrimary())}1f;color:${escapeHtml(list.color || brandPrimary())};">${icon(list.icon || (list.kind === 'todo' ? 'list-checks' : 'luggage'), 'w-4 h-4')}</span>
            <div class="min-w-0">
              <h3 class="font-bold text-sm truncate">${escapeHtml(list.title || '')}</h3>
              <p class="text-[11px] text-[var(--text-secondary)]">${p.done}/${p.total} • ${list.kind === 'todo' ? t('todo') : t('packing')}</p>
            </div>
          </div>
          <div class="flex items-center gap-1">
            <button class="icon-btn" data-act="template" data-id="${list.id}" title="${t('templates')}">${icon('sparkles', 'w-3.5 h-3.5')}</button>
            <button class="icon-btn" data-act="reset" data-id="${list.id}" title="${t('resetChecks')}">${icon('rotate-ccw', 'w-3.5 h-3.5')}</button>
            <button class="icon-btn" data-act="rename" data-id="${list.id}" title="${t('edit')}">${icon('pencil', 'w-3.5 h-3.5')}</button>
            <button class="icon-btn icon-btn-danger" data-act="delete" data-id="${list.id}" title="${t('delete')}">${icon('trash-2', 'w-3.5 h-3.5')}</button>
          </div>
        </div>
        <div class="mt-3">${toolProgressHtml(p.percent, { tone: list.kind === 'todo' ? 'yellow' : 'blue' })}</div>
        <ul class="check-list mt-3">
          ${items.map(item => `
            <li class="check-item ${item.done ? 'is-done' : ''}" data-item="${escapeHtml(item.id)}">
              <button class="check-box" data-act="toggle" data-id="${list.id}" data-item="${escapeHtml(item.id)}" aria-label="toggle">${item.done ? icon('check', 'w-3.5 h-3.5') : ''}</button>
              <span class="check-text" data-act="edit-item" data-id="${list.id}" data-item="${escapeHtml(item.id)}">${escapeHtml(item.text || '')}</span>
              <select class="check-assignee" data-act="assign" data-id="${list.id}" data-item="${escapeHtml(item.id)}" title="${t('assignTo')}">
                ${toolMemberOptions(members, item.assignee || '', lang, { none: th('ไม่ระบุ','—') })}
              </select>
              <button class="icon-btn icon-btn-danger" data-act="remove-item" data-id="${list.id}" data-item="${escapeHtml(item.id)}" title="${t('delete')}">${icon('x', 'w-3 h-3')}</button>
            </li>`).join('')}
        </ul>
        ${p.done ? `<button class="btn btn-ghost btn-sm text-[11px] mt-2" data-act="clear-done" data-id="${list.id}">${icon('eraser', 'w-3.5 h-3.5')} ${t('clearDone')}</button>` : ''}
        <div class="add-item-row mt-2">
          <input class="input text-sm" data-add-input="${list.id}" placeholder="${t('itemPlaceholder')}" autocomplete="off">
          <button class="btn btn-primary btn-sm" data-act="add-item" data-id="${list.id}">${icon('plus', 'w-4 h-4')}</button>
        </div>
      </div>`;
    }).join('');
    queueIcons();
    initReveal(box);
  }

  function findList(id) { return lists.find(l => l.id === id); }

  async function persistItems(list, items, { silent = true } = {}) {
    list.items = items;
    paintLists(); paintProgress();
    try {
      await saveChecklistItems(tripId, list.id, items, currentUser?.uid);
      if (!silent) toast.success(th('บันทึกแล้ว', 'Saved'));
    } catch (e) {
      toast.error(e.message || String(e));
    }
  }

  function bindListActions() {
    const box = document.getElementById('prep-lists');
    if (!box) return;
    box.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const list = findList(btn.dataset.id);
      if (!list) return;
      const act = btn.dataset.act;
      const itemId = btn.dataset.item;

      if (act === 'toggle') {
        const items = (list.items || []).map(i => i.id === itemId ? { ...i, done: !i.done } : i);
        await persistItems(list, items);
        return;
      }
      if (act === 'edit-item') {
        const item = (list.items || []).find(i => i.id === itemId);
        const val = await promptAction({ title: t('edit'), label: th('รายการ','Item'), value: item?.text || '', icon: 'pencil' });
        if (val == null) return;
        const items = (list.items || []).map(i => i.id === itemId ? { ...i, text: String(val).trim() } : i).filter(i => i.text);
        await persistItems(list, items);
        return;
      }
      if (act === 'remove-item') {
        await persistItems(list, (list.items || []).filter(i => i.id !== itemId));
        return;
      }
      if (act === 'assign') return; // handled by change event
      if (act === 'clear-done') {
        await persistItems(list, (list.items || []).filter(i => !i.done));
        return;
      }
      if (act === 'reset') {
        const ok = await confirmAction({ title: t('resetChecks'), message: th('เอาติ๊กถูกออกทั้งหมดในลิสต์นี้','Remove every checkmark in this list'), confirmText: t('resetChecks'), icon: 'rotate-ccw' });
        if (!ok) return;
        await persistItems(list, (list.items || []).map(i => ({ ...i, done: false })));
        return;
      }
      if (act === 'rename') {
        const val = await promptAction({ title: th('เปลี่ยนชื่อเช็กลิสต์','Rename checklist'), label: t('tripName'), value: list.title || '', icon: 'pencil' });
        if (val == null || !String(val).trim()) return;
        list.title = String(val).trim();
        paintLists();
        try { await updateChecklist(tripId, list.id, { title: list.title }, currentUser?.uid); } catch (err) { toast.error(err.message); }
        return;
      }
      if (act === 'template') { openTemplateSheet({ list }); return; }
      if (act === 'delete') {
        const ok = await confirmAction({ title: th(`ลบ “${list.title}” ?`, `Delete “${list.title}”?`), message: th('ลบเช็กลิสต์นี้และรายการทั้งหมด','Delete this checklist and all of its items'), confirmText: t('delete'), danger: true, icon: 'trash-2' });
        if (!ok) return;
        try {
          await deleteChecklist(tripId, list.id);
          lists = lists.filter(l => l.id !== list.id);
          paintLists(); paintProgress();
          toast.success(th('ลบแล้ว', 'Deleted'));
        } catch (err) { toast.error(err.message); }
        return;
      }
      if (act === 'add-item') {
        const input = box.querySelector(`[data-add-input="${list.id}"]`);
        const text = String(input?.value || '').trim();
        if (!text) return;
        input.value = '';
        await persistItems(list, [...(list.items || []), { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`, text, done: false, assignee: null, qty: 1, note: '' }]);
        box.querySelector(`[data-add-input="${list.id}"]`)?.focus();
      }
    });

    box.addEventListener('keydown', async (e) => {
      if (e.key !== 'Enter') return;
      const input = e.target.closest('[data-add-input]');
      if (!input) return;
      e.preventDefault();
      const list = findList(input.dataset.addInput);
      if (!list) return;
      const text = String(input.value || '').trim();
      if (!text) return;
      input.value = '';
      await persistItems(list, [...(list.items || []), { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`, text, done: false, assignee: null, qty: 1, note: '' }]);
      box.querySelector(`[data-add-input="${list.id}"]`)?.focus();
    });

    box.addEventListener('change', async (e) => {
      const sel = e.target.closest('select[data-act="assign"]');
      if (!sel) return;
      const list = findList(sel.dataset.id);
      if (!list) return;
      const items = (list.items || []).map(i => i.id === sel.dataset.item ? { ...i, assignee: sel.value || null } : i);
      await persistItems(list, items);
    });
  }

  /** Template picker — creates a new list, or tops up an existing one. */
  function openTemplateSheet({ list = null } = {}) {
    const sheet = showBottomSheet(`
      <div class="space-y-3">
        <div class="flex items-center gap-3">
          <div class="row-icon" style="width:40px;height:40px;border-radius:14px;background:var(--gradient-sun);color:var(--on-accent);">${icon('sparkles', 'w-5 h-5')}</div>
          <div>
            <h3 class="font-bold text-base" style="font-family: var(--font-display);">${t('templates')}</h3>
            <p class="text-xs text-[var(--text-secondary)]">${list ? th(`เพิ่มรายการจากเทมเพลตเข้า “${list.title}”`, `Add template items into “${list.title}”`) : th('เลือกเทมเพลตเพื่อสร้างเช็กลิสต์ใหม่','Pick a template to create a new checklist')}</p>
          </div>
        </div>
        <div class="space-y-2" id="tpl-list">
          ${CHECKLIST_TEMPLATES.map(tpl => `
            <button class="card card-hover p-3 w-full text-left flex items-center gap-3" data-tpl="${tpl.id}" style="cursor:pointer;">
              <span class="row-icon" style="width:36px;height:36px;border-radius:12px;background:${tpl.color}1f;color:${tpl.color};">${icon(tpl.icon, 'w-4 h-4')}</span>
              <span class="flex-1 min-w-0">
                <span class="block font-semibold text-sm truncate">${escapeHtml(lang === 'th' ? tpl.th : tpl.en)}</span>
                <span class="block text-[11px] text-[var(--text-secondary)]">${tpl.items.length} ${t('items')} • ${tpl.kind === 'todo' ? t('todo') : t('packing')}</span>
              </span>
              ${icon('chevron-right', 'w-4 h-4')}
            </button>`).join('')}
        </div>
        <button id="tpl-cancel" class="btn btn-secondary w-full">${t('cancel')}</button>
      </div>
    `);
    queueIcons();
    document.getElementById('tpl-cancel')?.addEventListener('click', () => sheet.close());
    sheet.sheet.querySelectorAll('[data-tpl]').forEach(btn => btn.addEventListener('click', async () => {
      const tpl = CHECKLIST_TEMPLATES.find(x => x.id === btn.dataset.tpl);
      if (!tpl) return;
      sheet.close();
      const tLoad = toast.loading(th('กำลังเพิ่ม...', 'Adding...'));
      try {
        if (list) {
          await persistItems(list, mergeTemplateItems(list.items || [], tpl.items));
        } else {
          const items = itemsFromTemplate(tpl.items);
          const id = await createChecklist(tripId, {
            title: lang === 'th' ? tpl.th : tpl.en,
            kind: tpl.kind,
            icon: tpl.icon,
            color: tpl.color,
            order: lists.length,
            items
          }, currentUser?.uid);
          lists.push({ id, title: lang === 'th' ? tpl.th : tpl.en, kind: tpl.kind, icon: tpl.icon, color: tpl.color, items });
        }
        tLoad.close();
        paintLists(); paintProgress();
        toast.success(th('เพิ่มเช็กลิสต์แล้ว', 'Checklist added'));
      } catch (e) {
        tLoad.close();
        toast.error(e.message || String(e));
      }
    }));
  }

  bind('prep-add-btn', 'click', async () => {
    const name = await promptAction({ title: th('เช็กลิสต์ใหม่','New checklist'), label: th('ชื่อลิสต์','List name'), placeholder: th('เช่น ของที่ต้องเตรียม','e.g. Packing'), value: '', icon: 'clipboard-check' });
    if (name == null || !String(name).trim()) return;
    const tLoad = toast.loading(th('กำลังสร้าง...', 'Creating...'));
    try {
      const items = [{ id: `${Date.now().toString(36)}`, text: '', done: false, assignee: null }].filter(i => i.text);
      const payload = { title: String(name).trim(), kind: 'packing', icon: 'luggage', color: brandPrimary(), order: lists.length, items: items.length ? items : [{ id: `${Date.now().toString(36)}a`, text: th('รายการแรก','First item'), done: false, assignee: null }] };
      const id = await createChecklist(tripId, payload, currentUser?.uid);
      lists.push({ id, ...payload });
      tLoad.close();
      paintLists(); paintProgress();
    } catch (e) { tLoad.close(); toast.error(e.message || String(e)); }
  });

  bind('prep-template-btn', 'click', () => openTemplateSheet());

  paintProgress();
  paintLists();
  bindListActions();
  initReveal(appEl);
}

/* ================================================================== *
 * IDEAS — places to visit with voting
 * ================================================================== */
async function renderIdeas(params) {
  const tripId = params.tripId;
  const token = beginRender();
  const lang = getLang();
  const th = (a, b) => (lang === 'th' ? a : b);
  await loadTrip(tripId);
  if (isStale(token)) return;
  const trip = currentTrip;

  let members = [];
  try { members = await listMembers(tripId); currentTripMembers = members || []; } catch (e) { console.warn(e?.message); }
  if (isStale(token)) return;

  let ideas = [];
  let loadError = '';
  try { ideas = await listIdeas(tripId); } catch (e) { loadError = e?.message || String(e); }
  if (isStale(token)) return;

  // The day plan, for the “how far is this idea from the plan?” comparison.
  let planItems = [];
  try { planItems = await fetchItinerary(tripId, null).catch(() => []) || []; } catch { planItems = []; }
  if (isStale(token)) return;

  // v18.2: ideas that could not be written to Firestore (old rules) live on this
  // device — count them so the board can say so instead of dropping the text.
  let pendingCount = listPendingIdeas(tripId).length;

  let filter = 'open';
  let sortMode = 'votes';
  const myId = currentUser?.uid || '';

  appEl.innerHTML = `
    <div class="page-enter max-w-[1000px] mx-auto space-y-5">
      <div class="flex flex-wrap items-start justify-between gap-3">
        ${renderPageScene('ideas', {
          lang,
          title: `${icon('lightbulb', 'w-5 h-5')} ${t('ideasBoard')}`,
          subtitle: th('ทุกคนเสนอสถานที่ที่อยากไป แล้วโหวตกัน — อันดับต้น ๆ กดเพิ่มเข้าแผนได้เลย','Anyone can suggest a place, everyone votes — add the winners straight to the plan')
        })}
        <button id="idea-add-btn" class="btn btn-primary btn-sm">${icon('plus', 'w-4 h-4')} ${t('addIdea')}</button>
      </div>

      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3" id="idea-stats"></div>

      <div class="flex items-center justify-between gap-2 flex-wrap">
        <div class="chip-row" id="idea-filters">
          <button class="chip chip-active" data-filter="open">${icon('sparkles', 'w-3.5 h-3.5')} ${th('ยังไม่อยู่ในแผน','Not planned')}</button>
          <button class="chip" data-filter="planned">${icon('calendar-check', 'w-3.5 h-3.5')} ${t('inPlan')}</button>
          <button class="chip" data-filter="all">${icon('layers', 'w-3.5 h-3.5')} ${t('all')}</button>
        </div>
        <select id="idea-sort" class="input text-xs" style="max-width:190px; min-height:36px;">
          <option value="votes">${th('เรียงตามโหวต','Sort: most voted')}</option>
          <option value="newest">${th('ใหม่สุดก่อน','Sort: newest')}</option>
          <option value="alpha">${th('ตามตัวอักษร','Sort: A → Z')}</option>
        </select>
      </div>

      ${loadError ? `<div class="card p-4 text-xs" style="background:var(--warning-bg); border-color:color-mix(in srgb, var(--warning) 35%, transparent);">${icon('info', 'w-4 h-4')} ${escapeHtml(loadError)}</div>` : ''}
      <div id="idea-pending-slot"></div>
      <div class="card p-3" id="ideas-map-card">
        <div class="flex items-center justify-between gap-2 px-1 pb-2 flex-wrap">
          <h3 class="font-bold text-sm flex items-center gap-2">${icon('map', 'w-4 h-4')} ${th('แผนที่ไอเดีย','Ideas map')}</h3>
          <div class="flex items-center gap-2">
            <span id="ideas-map-count" class="text-[10px] font-bold px-2 py-0.5 rounded-full" style="background:var(--bg-secondary);">0 ${th('หมุด','pins')}</span>
            <button id="ideas-map-fit" class="btn btn-ghost btn-sm text-[10px]" style="min-height:26px;padding:2px 8px;">${icon('maximize', 'w-3 h-3')} ${th('พอดีจอ','Fit')}</button>
          </div>
        </div>
        <div id="ideas-map-wrap" class="relative rounded-2xl overflow-hidden" style="border:1px solid var(--border);">
          <div id="ideas-map" class="map-frame w-full" style="height:min(38vh, 320px);"></div>
          <div id="ideas-map-status" class="map-status"><span class="skeleton" style="width:26px;height:26px;border-radius:50%;"></span> <span>${th('กำลังโหลดแผนที่...','Loading map...')}</span></div>
          <div id="ideas-map-empty" class="map-status hidden"><div class="text-center px-4">
            <div class="row-icon mx-auto mb-2" style="width:40px;height:40px;">${icon('map-pin', 'w-5 h-5')}</div>
            <p class="text-xs text-[var(--text-secondary)]">${th('ใส่พิกัด (lat,lng) ให้ไอเดีย เพื่อให้แสดงหมุดบนแผนที่','Add coordinates (lat,lng) to an idea to see it here')}</p>
          </div></div>
        </div>
        <p class="text-[10px] text-[var(--text-tertiary)] flex items-center gap-1 px-1 pt-2">${icon('info', 'w-3 h-3')} ${th('กดปุ่มหมุดบนการ์ด → แผนที่พาไปที่ไอเดียนั้น • หมุดเขียว = อยู่ในแผนแล้ว','Tap the pin button on a card → the map jumps to that idea • green pin = already in the plan')}</p>
      </div>
      <div id="ideas-list" class="grid gap-3 stagger sm:grid-cols-2"></div>
    </div>
  `;
  queueIcons();

  /**
   * Queued-idea banner: the board keeps working while the project's Firestore
   * rules are still the old ones. Explains what happened and offers both the
   * retry and the “how to publish the rules” sheet.
   */
  function paintPending() {
    const slot = document.getElementById('idea-pending-slot');
    if (!slot) return;
    pendingCount = listPendingIdeas(tripId).length;
    if (!pendingCount) { slot.innerHTML = ''; return; }
    slot.innerHTML = `
      <div class="card p-4" id="idea-pending-banner" style="background:var(--warning-bg); border-color:color-mix(in srgb, var(--warning) 42%, transparent);">
        <div class="flex items-start gap-3 flex-wrap">
          <span class="row-icon" style="width:38px;height:38px;border-radius:13px;background:color-mix(in srgb, var(--warning) 20%, #fff);color:var(--warning);flex-shrink:0;">${icon('cloud-off', 'w-4 h-4')}</span>
          <div class="flex-1 min-w-[180px]">
            <p class="text-sm font-bold">${th(`บันทึกไว้ในเครื่องแล้ว ${pendingCount} ไอเดีย — ยังไม่ขึ้นคลาวด์`, `${pendingCount} idea(s) saved on this device — not on the cloud yet`)}</p>
            <p class="text-[11px] mt-0.5 text-[var(--text-secondary)]">${th('Firestore ปฏิเสธการเขียน (กฎที่เผยแพร่อยู่เก่ากว่าโค้ด) — ข้อความไม่หาย ระบบจะซิงก์ให้อัตโนมัติเมื่อกฎถูกอัปเดต','Firestore denied the write (the published rules are older than the app) — nothing is lost, it syncs automatically once the rules are updated.')}</p>
          </div>
          <div class="btn-row">
            <button id="idea-sync-retry" class="btn btn-secondary btn-sm" type="button">${icon('refresh-cw', 'w-3.5 h-3.5')} ${th('ลองซิงก์อีกครั้ง','Retry sync')}</button>
            <button id="idea-rules-help" class="btn btn-primary btn-sm" type="button">${icon('shield-alert', 'w-3.5 h-3.5')} ${th('วิธีแก้กฎ','Fix the rules')}</button>
          </div>
        </div>
      </div>`;
    queueIcons();
    bind('idea-sync-retry', 'click', async () => {
      const tLoad = toast.loading(th('กำลังซิงก์...', 'Syncing...'));
      const left = await flushPendingIdeas(tripId).catch(() => listPendingIdeas(tripId));
      await reloadIdeas();
      tLoad.close();
      if (left.length) toast.info(th('ยังซิงก์ไม่ได้ — กฎ Firestore ยังไม่อนุญาต', 'Still blocked — the Firestore rules have not been updated yet'));
      else toast.success(th('ซิงก์ขึ้นคลาวด์แล้ว', 'Synced to the cloud'));
      paintPending();
    });
    bind('idea-rules-help', 'click', () => showRulesHelpSheet({ lang, trip, action: 'save' }));
  }

  /** Re-read the board (after a sync attempt). */
  async function reloadIdeas() {
    try {
      ideas = await listIdeas(tripId);
      loadError = '';
    } catch (e) { loadError = e?.message || String(e); }
    pendingCount = listPendingIdeas(tripId).length;
    paintStats();
    paintIdeas();
    paintPending();
  }

  function paintStats() {
    const box = document.getElementById('idea-stats');
    if (!box) return;
    const open = ideas.filter(i => i.status !== 'planned');
    const planned = ideas.filter(i => i.status === 'planned');
    const topVotes = sortIdeas(open, 'votes')[0];
    const budget = ideasBudget(open);
    const tiles = [
      { icon: 'lightbulb', label: th('ไอเดียทั้งหมด','Ideas'), value: ideas.length, tone: 'blue' },
      { icon: 'sparkles', label: th('รอตัดสินใจ','Shortlist'), value: open.length, tone: 'yellow' },
      { icon: 'calendar-check', label: t('inPlan'), value: planned.length, tone: 'blue' },
      { icon: 'crown', label: th('โหวตสูงสุด','Top votes'), value: topVotes ? `${voteCount(topVotes)}` : '0', tone: 'yellow' }
    ];
    box.innerHTML = tiles.map(tile => `
      <div class="card p-3 flex items-center gap-2">
        <span class="row-icon" style="width:34px;height:34px;border-radius:12px;${tile.tone === 'yellow' ? 'background:var(--brand-yellow-tint);color:var(--brand-yellow-ink);' : 'background:var(--primary-light);color:var(--primary-strong);'}">${icon(tile.icon, 'w-4 h-4')}</span>
        <span class="min-w-0">
          <span class="block text-[10px] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">${tile.label}</span>
          <span class="block text-lg font-bold" style="font-family:var(--font-display);">${escapeHtml(String(tile.value))}</span>
        </span>
      </div>`).join('') + (budget ? `<p class="col-span-2 sm:col-span-4 text-[11px] text-[var(--text-secondary)]">${icon('coins', 'w-3 h-3')} ${th('งบประมาณรวมของไอเดียที่ยังไม่เข้าแผน','Estimated budget of the unplanned ideas')}: <b>${escapeHtml(formatCurrency(budget, trip?.baseCurrency || 'THB'))}</b></p>` : '');
    queueIcons();
  }

  /** Ideas currently on screen (filter + sort applied) — the map mirrors this. */
  let listedIdeas = [];
  let ideasMapReady = false;

  function ideaKmLabel(km) {
    if (!Number.isFinite(km)) return '';
    return km < 1
      ? `${Math.max(1, Math.round(km * 1000))} ${th('ม.','m')}`
      : `${km.toFixed(km < 10 ? 1 : 0)} ${th('กม.','km')}`;
  }

  /** Closest planned place to an idea (both need coordinates). */
  function nearestPlanFor(idea) {
    if (!hasCoords(idea)) return null;
    let best = null;
    for (const p of planItems) {
      if (!hasCoords(p)) continue;
      const km = haversineKm(idea, p);
      if (!best || km < best.km) best = { km, item: p };
    }
    return best;
  }

  function paintIdeas() {
    const box = document.getElementById('ideas-list');
    if (!box) return;
    const filtered = filter === 'all' ? ideas : ideas.filter(i => (filter === 'planned' ? i.status === 'planned' : i.status !== 'planned'));
    const sorted = sortIdeas(filtered, sortMode, { lang });
    listedIdeas = sorted;
    if (!sorted.length) {
      box.innerHTML = `<div class="col-span-full">${renderEmptyState({
        icon: 'lightbulb',
        title: th('ยังไม่มีไอเดีย','No ideas yet'),
        desc: th('ชวนทุกคนในทริปใส่สถานที่ที่อยากไป แล้วโหวตให้อันดับสูงสุด','Invite the group to drop places they want, then vote for the best'),
        actionHtml: `<button id="idea-empty-add" class="btn btn-primary btn-sm mt-2">${icon('plus', 'w-4 h-4')} ${t('addIdea')}</button>`
      })}</div>`;
      bind('idea-empty-add', 'click', () => openIdeaForm(null));
      queueIcons();
      paintIdeasMap();
      return;
    }
    const planPinned = planItems.some(p => hasCoords(p));
    box.innerHTML = sorted.map((idea, idx) => {
      const info = voteInfo(idea);
      const voted = hasVoted(idea, myId);
      const voters = voterNames(idea, members).slice(0, 4);
      const status = ideaStatusDef(idea.status);
      const queued = idea.pendingSync === true || isLocalIdeaId(idea.id);
      const imgs = ideaImages(idea);
      const pinned = hasCoords(idea);
      const c = pinned ? coordOf(idea) : null;
      const near = nearestPlanFor(idea);
      return `
      <div class="card p-4 idea-card ${queued ? 'is-queued' : ''}" data-idea="${idea.id}">
        <div class="flex items-start gap-3">
          <button class="vote-btn ${voted ? 'is-voted' : ''}" data-act="vote" data-id="${idea.id}" title="${t('vote')}">
            ${icon('chevron-up', 'w-4 h-4')}
            <span>${info.count}</span>
          </button>
          <div class="flex-1 min-w-0">
            <div class="flex items-start justify-between gap-2">
              <h3 class="font-bold text-sm leading-snug min-w-0"><span class="idea-num" title="${th('หมายเลขหมุดบนแผนที่','Pin number on the map')}">${idx + 1}</span> ${escapeHtml(idea.title || '')}</h3>
              <span class="flex items-center gap-1 flex-shrink-0">
                ${queued ? `<span class="badge badge-pending text-[10px]" title="${th('บันทึกในเครื่องนี้ รอซิงก์ขึ้นคลาวด์','Saved on this device, waiting to sync')}">${icon('cloud-off', 'w-2.5 h-2.5')} ${th('รอซิงก์','pending')}</span>` : ''}
                <span class="badge ${idea.status === 'planned' ? 'badge-completed' : 'badge-planned'} text-[10px]">${icon(status.icon, 'w-2.5 h-2.5')} ${lang === 'th' ? status.th : status.en}</span>
              </span>
            </div>
            ${idea.note ? `<p class="text-xs text-[var(--text-secondary)] mt-1">${escapeHtml(idea.note)}</p>` : ''}
            ${imgs.length ? `<div class="idea-imgs mt-2">${imgs.map((u, k) => `
              <button type="button" class="idea-img" data-act="image" data-id="${idea.id}" data-img="${k}" title="${th('กดเพื่อดูรูป','Tap to view')}">
                <img src="${escapeHtml(u)}" alt="" loading="lazy" onerror="this.closest('.idea-img').style.display='none'">
              </button>`).join('')}
              <span class="idea-img-hint">${icon('images', 'w-3 h-3')} ${imgs.length}/3</span>
            </div>` : ''}
            <div class="flex items-center gap-2 flex-wrap mt-1.5">
              <span class="badge badge-planned text-[10px]">${icon(categoryIcon(normalizeCategory(idea.category)), 'w-2.5 h-2.5')} ${escapeHtml(categoryLabel(normalizeCategory(idea.category), lang))}</span>
              ${idea.address ? `<span class="meta-line">${icon('map-pin', 'w-3 h-3')} <span class="truncate" style="max-width:220px;">${escapeHtml(idea.address)}</span></span>` : ''}
              ${Number(idea.estimatedCostMinor) > 0 ? `<span class="badge badge-skipped text-[10px]">${icon('coins', 'w-2.5 h-2.5')} ${escapeHtml(formatCurrency(Number(idea.estimatedCostMinor), idea.currency || trip?.baseCurrency || 'THB'))}</span>` : ''}
            </div>
            ${pinned ? `<button type="button" class="idea-pin-line" data-act="locate" data-id="${idea.id}" title="${th('พาแผนที่ไปที่ไอเดียนั้น','Show on the map')}">${icon('crosshair', 'w-3 h-3')} <span class="font-mono">${c.lat.toFixed(4)}, ${c.lng.toFixed(4)}</span> <span class="idea-pin-go">${th('ดูบนแผนที่','View on map')}</span></button>` : ''}
            ${pinned && near ? `<button type="button" class="idea-near-line" data-act="compare" data-id="${idea.id}" title="${th('เทียบระยะกับแผนแต่ละวัน','Compare with each day')}">${icon('route', 'w-3 h-3')} ${th('ห่างจากแผน','from the plan')} <b>~${ideaKmLabel(near.km)}</b> <span class="truncate" style="max-width:170px;">• ${escapeHtml(near.item.title || '')}</span></button>`
              : (pinned && !planPinned ? `<p class="idea-near-line is-muted">${icon('route', 'w-3 h-3')} ${th('แผนยังไม่มีพิกัดให้เทียบระยะ','The plan has no pins to compare with yet')}</p>` : '')}
            ${voters.length ? `<p class="text-[10px] text-[var(--text-tertiary)] mt-1.5">${icon('users', 'w-3 h-3')} ${escapeHtml(voters.join(', '))}${info.count > voters.length ? ` +${info.count - voters.length}` : ''}</p>` : ''}
            <div class="flex items-center gap-1 flex-wrap mt-2">
              ${idea.url ? `<a class="btn btn-ghost btn-sm text-[11px]" style="min-height:30px;padding:2px 8px;" href="${escapeHtml(idea.url)}" target="_blank" rel="noopener">${icon('external-link', 'w-3.5 h-3.5')} ${th('เปิดลิงก์','Open link')}</a>` : ''}
              ${idea.address ? `<a class="btn btn-ghost btn-sm text-[11px]" style="min-height:30px;padding:2px 8px;" href="${escapeHtml(googleMapsPlaceUrl(idea.address, idea.coordinates))}" target="_blank" rel="noopener">${icon('navigation', 'w-3.5 h-3.5')} ${th('แผนที่','Map')}</a>` : ''}
              ${pinned ? `<button class="btn btn-ghost btn-sm text-[11px]" style="min-height:30px;padding:2px 8px;" data-act="locate" data-id="${idea.id}">${icon('crosshair', 'w-3.5 h-3.5')} ${th('หมุด','Pin')}</button>` : ''}
              ${pinned && planPinned ? `<button class="btn btn-ghost btn-sm text-[11px]" style="min-height:30px;padding:2px 8px;" data-act="compare" data-id="${idea.id}">${icon('git-compare', 'w-3.5 h-3.5')} ${th('เทียบกับแผน','Compare')}</button>` : ''}
              ${idea.status === 'planned'
                ? `<span class="badge badge-completed text-[10px]">${icon('check', 'w-3 h-3')} ${th('อยู่ในแผน','In the plan')}${idea.plannedDate ? ` • ${escapeHtml(idea.plannedDate)}` : ''}</span>`
                : `<button class="btn btn-accent btn-sm text-[11px]" style="min-height:30px;padding:2px 10px;" data-act="plan" data-id="${idea.id}">${icon('calendar-plus', 'w-3.5 h-3.5')} ${t('addToPlan')}</button>`}
              <button class="icon-btn" data-act="edit" data-id="${idea.id}" title="${t('edit')}">${icon('pencil', 'w-3.5 h-3.5')}</button>
              <button class="icon-btn icon-btn-danger" data-act="delete" data-id="${idea.id}" title="${t('delete')}">${icon('trash-2', 'w-3.5 h-3.5')}</button>
            </div>
          </div>
        </div>
      </div>`;
    }).join('');
    queueIcons();
    initReveal(box);
    paintIdeasMap();
  }

  /** Board map mirrors the listed ideas (same order → same numbers). */
  async function paintIdeasMap() {
    const mapEl = document.getElementById('ideas-map');
    if (!mapEl) return;
    const statusEl = document.getElementById('ideas-map-status');
    const emptyEl = document.getElementById('ideas-map-empty');
    try {
      statusEl?.classList.remove('hidden');
      emptyEl?.classList.add('hidden');
      const { renderIdeasMap, refreshMapSize, setMapLang } = await import('./maps/index.js');
      setMapLang('ideas-map', lang);
      const res = await renderIdeasMap('ideas-map', listedIdeas, {
        fitBounds: true,
        lang,
        directionsLabel: th('ไปที่นี่', 'Directions'),
        votesLabel: th('โหวต', 'votes'),
        plannedLabel: th('อยู่ในแผน', 'in the plan')
      });
      ideasMapReady = true;
      statusEl?.classList.add('hidden');
      emptyEl?.classList.toggle('hidden', (res.count || 0) > 0);
      setText('ideas-map-count', `${res.count || 0} ${th('หมุด','pins')}`);
      refreshMapSize('ideas-map');
      setTimeout(() => refreshMapSize('ideas-map'), 450);
    } catch (e) {
      console.warn('[Ideas] map failed', e?.message);
      if (statusEl) {
        statusEl.classList.remove('hidden');
        statusEl.innerHTML = `<div class="text-center px-4">
          <p class="text-xs font-semibold" style="color:var(--danger);">${th('โหลดแผนที่ไม่สำเร็จ','Map failed to load')}</p>
          <button id="ideas-map-retry" class="btn btn-secondary btn-sm mt-2">${icon('refresh-cw', 'w-4 h-4')} ${th('ลองใหม่','Retry')}</button>
        </div>`;
        queueIcons();
        bind('ideas-map-retry', 'click', () => paintIdeasMap());
      }
    }
  }

  /** Jump the board map to one idea's pin (centred, popup open). */
  async function focusIdeaOnMap(ideaId) {
    const idea = ideas.find(i => i.id === ideaId);
    if (!idea || !hasCoords(idea)) return;
    document.getElementById('ideas-map-card')?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
    await new Promise(r => setTimeout(r, 240));
    try {
      const { focusItineraryItem, getMap, refreshMapSize } = await import('./maps/index.js');
      try { refreshMapSize('ideas-map'); } catch { /* cosmetic */ }
      const pool = listedIdeas.length ? listedIdeas : ideas;
      if (!getMap('ideas-map') || !focusItineraryItem('ideas-map', pool, ideaId)) {
        await paintIdeasMap();
        setTimeout(() => { try { focusItineraryItem('ideas-map', pool, ideaId); } catch {} }, 160);
      }
    } catch (e) { console.warn('[Ideas] map focus failed', e?.message); }
  }

  /** Photo viewer for an idea's attached images (max 3). */
  function openIdeaLightbox(idea, startIdx = 0) {
    const imgs = ideaImages(idea);
    if (!imgs.length) return;
    let cur = Math.min(Math.max(0, startIdx | 0), imgs.length - 1);
    const dlg = showModal(`
      <div class="idea-lightbox">
        <div class="flex items-start justify-between gap-2 mb-2">
          <h3 class="font-bold text-sm pr-2 min-w-0 truncate">${icon('images', 'w-4 h-4')} ${escapeHtml(idea.title || '')}</h3>
          <button class="icon-btn flex-shrink-0" data-lb="close" aria-label="${th('ปิด','Close')}">${icon('x', 'w-4 h-4')}</button>
        </div>
        <div class="idea-lightbox-main">
          ${imgs.length > 1 ? `<button class="idea-lightbox-nav" data-lb="prev" aria-label="‹">${icon('chevron-left', 'w-5 h-5')}</button>` : ''}
          <img data-lb="img" src="${escapeHtml(imgs[cur])}" alt="" onerror="this.style.opacity='.25'">
          ${imgs.length > 1 ? `<button class="idea-lightbox-nav" data-lb="next" aria-label="›">${icon('chevron-right', 'w-5 h-5')}</button>` : ''}
        </div>
        <div class="flex items-center justify-between gap-2 mt-2 flex-wrap">
          <span class="text-[11px] font-bold text-[var(--text-tertiary)]" data-lb="count">${cur + 1} / ${imgs.length}</span>
          <a data-lb="open" class="btn btn-ghost btn-sm text-[11px]" href="${escapeHtml(imgs[cur])}" target="_blank" rel="noopener">${icon('external-link', 'w-3.5 h-3.5')} ${th('เปิดรูปต้นฉบับ','Open original')}</a>
        </div>
        ${imgs.length > 1 ? `<div class="idea-lightbox-thumbs">${imgs.map((u, k) => `
          <button data-lb="thumb" data-k="${k}" class="${k === cur ? 'is-active' : ''}"><img src="${escapeHtml(u)}" alt="" loading="lazy" onerror="this.closest('[data-lb=thumb]').style.display='none'"></button>`).join('')}</div>` : ''}
      </div>
    `);
    queueIcons();
    const paint = () => {
      const img = dlg.modal.querySelector('[data-lb="img"]');
      if (img) { img.style.opacity = ''; img.src = imgs[cur]; }
      const open = dlg.modal.querySelector('[data-lb="open"]');
      if (open) open.href = imgs[cur];
      const count = dlg.modal.querySelector('[data-lb="count"]');
      if (count) count.textContent = `${cur + 1} / ${imgs.length}`;
      dlg.modal.querySelectorAll('[data-lb="thumb"]').forEach(b => b.classList.toggle('is-active', Number(b.dataset.k) === cur));
    };
    dlg.modal.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-lb]');
      if (!btn || btn.tagName === 'A') return;
      const act = btn.dataset.lb;
      if (act === 'close') dlg.close();
      if (act === 'prev') { cur = (cur - 1 + imgs.length) % imgs.length; paint(); }
      if (act === 'next') { cur = (cur + 1) % imgs.length; paint(); }
      if (act === 'thumb') { cur = Number(btn.dataset.k) || 0; paint(); }
    });
  }

  /** Per-day distance breakdown: is this idea near any planned day? */
  function openIdeaCompareSheet(idea) {
    const c = coordOf(idea);
    const byDay = {};
    if (c) {
      for (const p of planItems) {
        if (!hasCoords(p) || !p.date) continue;
        const km = haversineKm(idea, p);
        if (!byDay[p.date] || km < byDay[p.date].km) byDay[p.date] = { km, item: p };
      }
    }
    const days = Object.entries(byDay).sort(([a], [b]) => a.localeCompare(b));
    const best = nearestPlanFor(idea);
    const sheet = showBottomSheet(`
      <div class="space-y-3">
        <div class="flex items-start gap-3">
          <div class="row-icon" style="width:42px;height:42px;border-radius:14px;background:var(--gradient-primary);color:#fff;">${icon('git-compare', 'w-5 h-5')}</div>
          <div class="min-w-0">
            <h3 class="font-bold text-base leading-tight" style="font-family: var(--font-display);">${th('เทียบไอเดียกับแผน','Compare with the plan')}</h3>
            <p class="text-xs text-[var(--text-secondary)] mt-0.5 truncate">${escapeHtml(idea.title || '')}${c ? ` • <span class="font-mono">${c.lat.toFixed(4)}, ${c.lng.toFixed(4)}</span>` : ''}</p>
          </div>
        </div>
        ${!c ? `<div class="card p-3 text-xs" style="background:var(--warning-bg);">${icon('crosshair', 'w-4 h-4')} ${th('ไอเดียนี้ยังไม่มีพิกัด — กดแก้ไขแล้วใส่ lat,lng เพื่อเทียบระยะได้','This idea has no pin yet — edit it and add lat,lng to compare distances.')}</div>` : ''}
        ${c && !days.length ? `<div class="card p-3 text-xs" style="background:var(--bg-secondary);">${icon('map-pin', 'w-4 h-4')} ${th('แผนการเดินทางยังไม่มีพิกัด — ใส่พิกัดให้สถานที่ในแผนก่อน แล้วค่อยกลับมาเทียบ','The itinerary has no pins yet — add coordinates to planned places first.')}</div>` : ''}
        ${best ? `<div class="idea-compare-best">
          <span class="idea-compare-best-label">${icon('trophy', 'w-3.5 h-3.5')} ${th('ใกล้แผนที่สุด','Closest to the plan')}</span>
          <b>~${ideaKmLabel(best.km)}</b>
          <span class="truncate">${escapeHtml(best.item.title || '')} • ${escapeHtml(best.item.date || '')}</span>
          ${best.item.date ? `<button class="btn btn-secondary btn-sm" data-day="${escapeHtml(best.item.date)}">${icon('calendar-days', 'w-3.5 h-3.5')} ${th('ดูวันนี้','See day')}</button>` : ''}
        </div>` : ''}
        ${days.length ? `<div class="space-y-1.5">${days.map(([day, v]) => `
          <div class="idea-compare-row">
            <span class="idea-compare-day">${dayjs(day).format('DD MMM')}</span>
            <span class="min-w-0 flex-1">
              <span class="block text-xs font-semibold truncate">${escapeHtml(v.item.title || '')}</span>
              <span class="block text-[10px] text-[var(--text-tertiary)]">${th('ใกล้สุดของวันนี้','nearest this day')}</span>
            </span>
            <b class="text-xs font-bold">~${ideaKmLabel(v.km)}</b>
            <button class="btn btn-ghost btn-sm text-[11px]" data-day="${escapeHtml(day)}">${icon('arrow-right', 'w-3.5 h-3.5')}</button>
          </div>`).join('')}</div>` : ''}
        <div class="flex gap-2">
          <button id="idea-compare-close" class="btn btn-secondary flex-1">${th('ปิด','Close')}</button>
          ${!c ? `<button id="idea-compare-edit" class="btn btn-primary flex-1">${icon('pencil', 'w-4 h-4')} ${th('ใส่พิกัด','Add pin')}</button>` : ''}
        </div>
      </div>
    `);
    queueIcons();
    document.getElementById('idea-compare-close')?.addEventListener('click', () => sheet.close());
    document.getElementById('idea-compare-edit')?.addEventListener('click', () => { sheet.close(); openIdeaForm(idea); });
    sheet.sheet.querySelectorAll('[data-day]').forEach(btn => btn.addEventListener('click', () => {
      sheet.close();
      location.hash = `#/trip/${tripId}/itinerary?date=${btn.dataset.day}`;
    }));
  }

  async function toggleVote(idea) {
    const before = { ...(idea.votes || {}) };
    idea.votes = toggleVoteMap(idea.votes || {}, myId);
    paintIdeas(); paintStats();
    try {
      await voteIdea(tripId, { ...idea, votes: before }, myId);
    } catch (e) {
      idea.votes = before;
      paintIdeas(); paintStats();
      toast.error(e.message || String(e));
    }
  }

  async function planIdea(idea) {
    openAddToPlanSheet({
      trip,
      title: idea.title,
      subtitle: `${icon('info', 'w-3 h-3')} ${Number(idea.estimatedCostMinor) > 0 ? th('ค่าใช้จ่ายประมาณการจะถูกสร้างเป็นรายการประมาณการในสมุดค่าใช้จ่ายด้วย','The estimated cost will also be created as an estimate in the expense book') : th('รายการนี้จะถูกเพิ่มเข้าแผนของวันที่เลือก','This will be added to the day you pick')}`,
      defaultDate: trip?.startDate || '',
      defaultTime: '09:00',
      category: normalizeCategory(idea.category),
      onConfirm: async ({ date, startAt, category }) => {
        const tLoad = toast.loading(th('กำลังเพิ่มเข้าแผน...', 'Adding to the plan...'));
        try {
          const payload = {
            title: idea.title,
            description: idea.note || '',
            date,
            startAt: new Date(`${date}T${startAt || '09:00'}`),
            durationMinutes: 60,
            travelToNextMinutes: 0,
            category,
            address: idea.address || '',
            coordinates: idea.coordinates || '',
            imageUrl: ideaImages(idea)[0] || idea.imageUrl || '',
            notes: idea.url ? `${th('ลิงก์','Link')}: ${idea.url}` : '',
            status: 'planned',
            estimateAmount: Number(idea.estimatedCostMinor) > 0 ? fromMinor(Number(idea.estimatedCostMinor), getCurrencyDecimals(idea.currency || 'THB')) : 0,
            estimateCurrency: idea.estimatedCostMinor ? (idea.currency || trip?.baseCurrency || 'THB') : '',
            estimateCategory: expenseGroupForChoice(idea.category || 'general'),
            estimateShareWith: members.map(m => m.id),
            estimateAutoAdd: true
          };
          const { id } = await saveItineraryItem(tripId, payload, currentUser.uid, null, { trip, members });
          await updateIdea(tripId, idea.id, { status: 'planned', plannedItemId: id, plannedDate: date }, currentUser.uid);
          idea.status = 'planned';
          idea.plannedItemId = id;
          idea.plannedDate = date;
          tLoad.close();
          toast.success(th('เพิ่มเข้าแผนแล้ว', 'Added to the plan'));
          logActivity(tripId, { type: 'itinerary', targetId: id, title: idea.title, detail: th('เพิ่มจากไอเดียสถานที่','Added from the ideas board'), user: actor() }).catch(() => {});
          paintIdeas(); paintStats();
        } catch (e) {
          tLoad.close();
          toast.error(e.message || String(e));
          return false;
        }
        return true;
      }
    });
  }

  function openIdeaForm(idea) {
    const isEdit = !!idea;
    const sheet = showBottomSheet(`
      <div class="space-y-4">
        <div class="flex items-center gap-3">
          <div class="row-icon" style="width:40px;height:40px;border-radius:14px;background:var(--gradient-primary);color:#fff;">${icon('lightbulb', 'w-5 h-5')}</div>
          <h3 class="font-bold text-base" style="font-family: var(--font-display);">${isEdit ? t('edit') : t('addIdea')}</h3>
        </div>
        <div class="input-group"><label class="input-label">${icon('sparkles', 'w-3.5 h-3.5')} ${th('ชื่อสถานที่','Place name')} *</label>
          <input id="idea-title" class="input" value="${escapeHtml(idea?.title || '')}" placeholder="${th('เช่น ทะเลสาบคาวากุจิ','e.g. Lake Kawaguchi')}"></div>
        <div class="input-group"><label class="input-label">${icon('align-left', 'w-3.5 h-3.5')} ${th('โน้ต / เหตุผลที่อยากไป','Note')}</label>
          <textarea id="idea-note" class="input" style="min-height:70px;" placeholder="${th('ทำไมถึงอยากไป เปิดกี่โมง ฯลฯ','Why go, opening hours, tips…')}">${escapeHtml(idea?.note || '')}</textarea></div>
        <div class="input-group"><label class="input-label">${icon('link', 'w-3.5 h-3.5')} ${th('ลิงก์','Link')}</label>
          <input id="idea-url" class="input text-sm" value="${escapeHtml(idea?.url || '')}" placeholder="https://..."></div>
        <div class="input-group"><label class="input-label">${icon('images', 'w-3.5 h-3.5')} ${th('รูปภาพ (ลิงก์ URL สูงสุด 3 รูป)','Photos (up to 3 URLs)')}</label>
          <div class="grid gap-2">
            ${[0, 1, 2].map(k => `
            <input id="idea-img-${k + 1}" class="input text-sm font-mono" value="${escapeHtml((ideaImages(idea || {})[k]) || '')}" placeholder="https://${th('ลิงก์รูปที่','image link ')}${k + 1} • https://..." autocomplete="off">`).join('')}
          </div>
          <div id="idea-img-previews" class="idea-form-previews"></div>
          <p class="input-hint">${th('วางลิงก์รูป (https://...) สูงสุด 3 รูป — สมาชิกกดดูรูปใหญ่ได้จากการ์ด','Paste up to 3 image links (https://...) — members tap the card to view them full-size.')}</p></div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div class="input-group"><label class="input-label">${icon('map-pin', 'w-3.5 h-3.5')} ${th('ที่อยู่','Address')}</label>
            <input id="idea-address" class="input text-sm" value="${escapeHtml(idea?.address || '')}" placeholder="${th('ที่อยู่หรือชื่อสถานที่','Address or place')}"></div>
          <div class="input-group"><label class="input-label">${icon('crosshair', 'w-3.5 h-3.5')} ${th('พิกัด (lat,lng)','Coordinates')}</label>
            <input id="idea-coords" class="input text-sm font-mono" value="${escapeHtml(idea?.coordinates ? `${idea.coordinates.lat ?? idea.coordinates.latitude},${idea.coordinates.lng ?? idea.coordinates.longitude}` : '')}" placeholder="35.5171,138.7519"></div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div class="input-group"><label class="input-label">${icon('layout-grid', 'w-3.5 h-3.5')} ${th('หมวดหมู่','Category')}</label>
            <select id="idea-cat" class="input">${categoryChoices(lang).map(c => `<option value="${c.id}" ${normalizeCategory(idea?.category) === c.id ? 'selected' : ''}>${escapeHtml(categoryChoiceLabel(c, lang))}</option>`).join('')}</select></div>
          <div class="input-group"><label class="input-label">${icon('coins', 'w-3.5 h-3.5')} ${th('ค่าใช้จ่ายประมาณ','Estimated cost')}</label>
            <div class="flex gap-2">
              <input id="idea-cost" class="input money-input flex-1" type="text" inputmode="decimal" value="${escapeHtml(toolAmountValue(idea?.estimatedCostMinor, idea?.currency || trip?.baseCurrency || 'THB'))}" placeholder="0">
              <select id="idea-cur" class="input" style="max-width:92px;">${toolCurrencyOptions(trip, idea?.currency || trip?.baseCurrency || 'THB')}</select>
            </div></div>
        </div>
        <div class="flex gap-2">
          <button id="idea-cancel" class="btn btn-secondary flex-1">${t('cancel')}</button>
          <button id="idea-save" class="btn btn-primary flex-1">${icon('save', 'w-4 h-4')} ${t('save')}</button>
        </div>
      </div>
    `);
    queueIcons();
    bindMoneyInputs(sheet.sheet);
    // Live thumbnails for the 3 photo URL fields.
    const ideaImgPreview = () => {
      const wrap = sheet.sheet.querySelector('#idea-img-previews');
      if (!wrap) return;
      const urls = [1, 2, 3]
        .map(k => String(sheet.sheet.querySelector(`#idea-img-${k}`)?.value || '').trim())
        .filter(u => /^https?:\/\//i.test(u));
      wrap.innerHTML = urls.map(u => `<span class="idea-form-preview"><img src="${escapeHtml(u)}" alt="" loading="lazy" onerror="this.parentElement.style.display='none'"></span>`).join('');
    };
    sheet.sheet.querySelectorAll('#idea-img-1, #idea-img-2, #idea-img-3').forEach(inp => inp.addEventListener('input', ideaImgPreview));
    ideaImgPreview();
    document.getElementById('idea-cancel')?.addEventListener('click', () => sheet.close());
    document.getElementById('idea-save')?.addEventListener('click', async () => {
      const title = String(document.getElementById('idea-title')?.value || '').trim();
      if (!title) return toast.error(th('ต้องมีชื่อสถานที่', 'Place name is required'));
      const cur = document.getElementById('idea-cur')?.value || 'THB';
      const cost = parseCurrencyInput(document.getElementById('idea-cost')?.value || '') || 0;
      const imageUrls = normalizeIdeaImages([1, 2, 3].map(k => document.getElementById(`idea-img-${k}`)?.value || ''));
      const payload = {
        title,
        note: String(document.getElementById('idea-note')?.value || '').trim(),
        url: String(document.getElementById('idea-url')?.value || '').trim(),
        address: String(document.getElementById('idea-address')?.value || '').trim(),
        category: document.getElementById('idea-cat')?.value || 'sightseeing',
        coordinates: parseCoordinates(document.getElementById('idea-coords')?.value || ''),
        imageUrls,
        imageUrl: imageUrls[0] || '',
        estimatedCostMinor: toMinor(cost, getCurrencyDecimals(cur)),
        currency: cur
      };
      const tLoad = toast.loading(th('กำลังบันทึก...', 'Saving...'));
      try {
        if (isEdit) {
          await updateIdea(tripId, idea.id, payload, currentUser?.uid);
          Object.assign(idea, payload);
        } else {
          const id = await createIdea(tripId, payload, currentUser?.uid);
          const local = isLocalIdeaId(id);
          ideas.push({
            id, ...payload, status: 'idea', pendingSync: local,
            votes: currentUser?.uid ? { [currentUser.uid]: true } : {}
          });
          tLoad.close();
          sheet.close();
          toast.success(local
            ? th('บันทึกในเครื่องแล้ว — รอซิงก์ขึ้นคลาวด์ (กฎ Firestore ยังไม่อนุญาต)', 'Saved on this device — waiting to sync (Firestore rules still deny writes)')
            : th('บันทึกแล้ว', 'Saved'));
          paintPending();
          paintIdeas(); paintStats();
          return;
        }
        tLoad.close();
        sheet.close();
        toast.success(th('บันทึกแล้ว', 'Saved'));
        paintPending();
        paintIdeas(); paintStats();
      } catch (e) {
        tLoad.close();
        if (!await notifyWriteDenied(e, { fallback: e?.message || String(e) })) toast.error(e.message || String(e));
      }
    });
    setTimeout(() => document.getElementById('idea-title')?.focus(), 250);
  }

  async function removeIdea(idea) {
    const ok = await confirmAction({
      title: th(`ลบ “${idea.title}” ?`, `Delete “${idea.title}”?`),
      message: th('ไอเดียนี้จะถูกเอาออกจากบอร์ด','This idea will be removed from the board'),
      confirmText: t('delete'), danger: true, icon: 'trash-2'
    });
    if (!ok) return;
    try {
      await deleteIdea(tripId, idea.id);
      ideas = ideas.filter(i => i.id !== idea.id);
      paintIdeas(); paintStats();
      toast.success(th('ลบแล้ว', 'Deleted'));
    } catch (e) { toast.error(e.message || String(e)); }
  }

  document.getElementById('idea-filters')?.querySelectorAll('[data-filter]').forEach(btn => btn.addEventListener('click', () => {
    filter = btn.dataset.filter;
    document.getElementById('idea-filters')?.querySelectorAll('.chip').forEach(c => c.classList.remove('chip-active'));
    btn.classList.add('chip-active');
    paintIdeas();
  }));
  bind('idea-sort', 'change', (e) => { sortMode = e.target.value; paintIdeas(); });
  bind('idea-add-btn', 'click', () => openIdeaForm(null));

  document.getElementById('ideas-list')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const idea = ideas.find(i => i.id === btn.dataset.id);
    if (!idea) return;
    if (btn.dataset.act === 'vote') await toggleVote(idea);
    if (btn.dataset.act === 'plan') await planIdea(idea);
    if (btn.dataset.act === 'edit') openIdeaForm(idea);
    if (btn.dataset.act === 'delete') await removeIdea(idea);
  });

  paintStats();
  paintIdeas();
  paintPending();
  initReveal(appEl);
}

/* ================================================================== *
 * BOOKINGS — reservations (flights, trains, hotels, cars, …)
 * ================================================================== */
async function renderBookings(params) {
  const tripId = params.tripId;
  const token = beginRender();
  const lang = getLang();
  const th = (a, b) => (lang === 'th' ? a : b);
  await loadTrip(tripId);
  if (isStale(token)) return;
  const trip = currentTrip;

  let members = [];
  try { members = await listMembers(tripId); currentTripMembers = members || []; } catch (e) { console.warn(e?.message); }
  if (isStale(token)) return;

  let reservations = [];
  let loadError = '';
  try { reservations = await listReservations(tripId); } catch (e) { loadError = e?.message || String(e); }
  if (isStale(token)) return;

  let typeFilter = 'all';
  const nowStamp = dayjs().format('YYYY-MM-DDTHH:mm');

  appEl.innerHTML = `
    <div class="page-enter max-w-[900px] mx-auto space-y-5">
      <div class="flex flex-wrap items-start justify-between gap-3">
        ${renderPageScene('bookings', {
          lang,
          title: `${icon('ticket', 'w-5 h-5')} ${t('reservations')}`,
          subtitle: th('ตั๋วเครื่องบิน รถไฟ โรงแรม รถเช่า — เก็บรหัสยืนยันไว้เปิดดูได้ทันที','Flights, trains, hotels, cars — every confirmation code one tap away')
        })}
        <div class="btn-row">
          <button id="booking-ics-btn" class="btn btn-secondary btn-sm">${icon('calendar-plus', 'w-4 h-4')} ${t('exportCalendar')}</button>
          <button id="booking-import-btn" class="btn btn-secondary btn-sm">${icon('mail-plus', 'w-4 h-4')} ${th('นำเข้าจากอีเมล','Import e-mail')}</button>
          <button id="booking-add-btn" class="btn btn-primary btn-sm">${icon('plus', 'w-4 h-4')} ${t('addBooking')}</button>
        </div>
      </div>

      <div class="card card-accent p-4" id="booking-next"></div>

      <div class="chip-row" id="booking-filters">
        <button class="chip chip-active" data-type="all">${icon('layers', 'w-3.5 h-3.5')} ${t('all')}</button>
        ${RESERVATION_TYPES.map(rt => {
          const count = reservations.filter(r => r.type === rt.id).length;
          return `<button class="chip" data-type="${rt.id}">${icon(rt.icon, 'w-3.5 h-3.5')} ${escapeHtml(lang === 'th' ? rt.th : rt.en)}${count ? ` (${count})` : ''}</button>`;
        }).join('')}
      </div>

      ${loadError ? `<div class="card p-4 text-xs" style="background:var(--warning-bg); border-color:color-mix(in srgb, var(--warning) 35%, transparent);">${icon('info', 'w-4 h-4')} ${escapeHtml(loadError)}</div>` : ''}
      <div id="bookings-list" class="space-y-5 stagger"></div>
    </div>
  `;
  queueIcons();

  function paintNext() {
    const box = document.getElementById('booking-next');
    if (!box) return;
    const upcoming = upcomingReservations(reservations, nowStamp, 1)[0];
    if (!upcoming) {
      box.innerHTML = `<div class="flex items-center gap-3">
        <span class="row-icon" style="width:38px;height:38px;border-radius:12px;">${icon('calendar-clock', 'w-4 h-4')}</span>
        <div>
          <p class="text-xs font-bold">${th('ยังไม่มีการจองถัดไป','No upcoming booking')}</p>
          <p class="text-[11px] text-[var(--text-secondary)]">${th('เพิ่มตั๋ว/ที่พัก แล้วระบบจะเตือนลำดับถัดไปไว้ตรงนี้','Add a ticket or hotel and the next one shows up here')}</p>
        </div>
      </div>`;
      queueIcons();
      return;
    }
    const rt = reservationTypeDef(upcoming.type);
    const countdown = dayjs(`${upcoming.date}T${upcoming.startTime || '00:00'}`).diff(dayjs(), 'day');
    box.innerHTML = `
      <div class="flex items-center gap-3 flex-wrap">
        <span class="row-icon" style="width:40px;height:40px;border-radius:14px;background:var(--primary-light);color:var(--primary-strong);">${icon(rt.icon, 'w-5 h-5')}</span>
        <div class="flex-1 min-w-0">
          <p class="text-[10px] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">${th('การจองถัดไป','Next booking')} ${countdown >= 0 ? `• ${th('อีก','in')} ${countdown} ${th('วัน','day(s)')}` : ''}</p>
          <p class="font-bold text-sm truncate">${escapeHtml(upcoming.title || '')}</p>
          <p class="text-[11px] text-[var(--text-secondary)]">${escapeHtml(upcoming.date || '')} ${escapeHtml(upcoming.startTime || '')} ${upcoming.confirmation ? `• ${t('confirmCode')}: <b>${escapeHtml(upcoming.confirmation)}</b>` : ''}</p>
        </div>
        <button class="btn btn-secondary btn-sm" data-copy="${escapeHtml(upcoming.confirmation || '')}">${icon('copy', 'w-3.5 h-3.5')} ${th('คัดลอกรหัส','Copy code')}</button>
      </div>`;
    queueIcons();
  }

  function paintList() {
    const box = document.getElementById('bookings-list');
    if (!box) return;
    const filtered = typeFilter === 'all' ? reservations : reservations.filter(r => r.type === typeFilter);
    if (!filtered.length) {
      box.innerHTML = renderEmptyState({
        icon: 'ticket',
        title: th('ยังไม่มีการจอง','No reservations yet'),
        desc: th('เพิ่มตั๋วเครื่องบิน รถไฟ โรงแรม หรือร้านอาหาร พร้อมรหัสยืนยันและค่าใช้จ่าย','Add flights, trains, hotels or restaurants with the confirmation code and price'),
        actionHtml: `<button id="booking-empty-add" class="btn btn-primary btn-sm mt-2">${icon('plus', 'w-4 h-4')} ${t('addBooking')}</button>`
      });
      bind('booking-empty-add', 'click', () => openBookingForm(null));
      queueIcons();
      return;
    }
    const groups = groupReservationsByDate(filtered);
    box.innerHTML = groups.map(group => `
      <div>
        <h3 class="font-bold text-sm mb-2 flex items-center gap-2">
          <span class="step-num">${group.date === 'unscheduled' ? icon('calendar-x', 'w-3 h-3') : dayjs(group.date).format('DD')}</span>
          ${group.date === 'unscheduled' ? th('ยังไม่ระบุวัน','Unscheduled') : formatDate(group.date, lang, trip?.timezone)}
          <span class="badge badge-planned text-[10px]">${group.items.length}</span>
        </h3>
        <div class="space-y-3">
          ${group.items.map(r => {
            const rt = reservationTypeDef(r.type);
            const route = routeLabel(r);
            const warnings = reservationWarnings(r);
            return `
            <div class="card p-4 booking-card" data-booking="${r.id}">
              <div class="flex items-start gap-3">
                <span class="row-icon" style="width:42px;height:42px;border-radius:14px;background:${rt.tone}1f;color:${rt.tone};">${icon(rt.icon, 'w-5 h-5')}</span>
                <div class="flex-1 min-w-0">
                  <div class="flex items-start justify-between gap-2">
                    <div class="min-w-0">
                      <h4 class="font-bold text-sm truncate">${escapeHtml(r.title || '')}</h4>
                      <p class="text-[11px] text-[var(--text-secondary)]">
                        ${icon('clock', 'w-3 h-3')} ${escapeHtml(r.startTime || '--:--')}${r.endTime ? ` – ${escapeHtml(r.endTime)}` : ''}
                        ${r.provider ? ` • ${escapeHtml(r.provider)}` : ''}
                      </p>
                    </div>
                    <span class="badge badge-planned text-[10px] flex-shrink-0">${escapeHtml(lang === 'th' ? rt.th : rt.en)}</span>
                  </div>
                  ${route ? `<p class="meta-line mt-1">${icon('arrow-left-right', 'w-3 h-3')} ${escapeHtml(route)}</p>` : ''}
                  <div class="flex items-center gap-2 flex-wrap mt-2">
                    ${r.confirmation ? `<button class="chip text-[11px] chip-accent" data-copy="${escapeHtml(r.confirmation)}" title="${t('copied')}">${icon('hash', 'w-3 h-3')} ${escapeHtml(r.confirmation)} ${icon('copy', 'w-3 h-3')}</button>` : ''}
                    ${r.seat ? `<span class="badge badge-planned text-[10px]">${icon('armchair', 'w-2.5 h-2.5')} ${escapeHtml(r.seat)}</span>` : ''}
                    ${r.room ? `<span class="badge badge-planned text-[10px]">${icon('door-open', 'w-2.5 h-2.5')} ${escapeHtml(r.room)}</span>` : ''}
                    ${Number(r.costMinor) > 0 ? `<span class="badge badge-skipped text-[10px]">${icon('coins', 'w-2.5 h-2.5')} ${escapeHtml(formatCurrency(Number(r.costMinor), r.currency || 'THB'))}</span>` : ''}
                    ${r.linkedItemId ? `<span class="badge badge-completed text-[10px]">${icon('check', 'w-2.5 h-2.5')} ${t('inPlan')}</span>` : ''}
                  </div>
                  ${r.address ? `<p class="text-[11px] text-[var(--text-secondary)] mt-1.5">${icon('map-pin', 'w-3 h-3')} ${escapeHtml(r.address)}</p>` : ''}
                  ${r.notes ? `<p class="text-[11px] text-[var(--text-secondary)] mt-1">${escapeHtml(r.notes)}</p>` : ''}
                  ${warnings.length ? `<p class="text-[10px] mt-1.5" style="color:var(--warning);">${icon('alert-triangle', 'w-3 h-3')} ${escapeHtml(warnings.map(w => lang === 'th' ? w.th : w.en).join(' • '))}</p>` : ''}
                  <div class="flex items-center gap-1 flex-wrap mt-2">
                    ${r.url ? `<a class="btn btn-ghost btn-sm text-[11px]" style="min-height:30px;padding:2px 8px;" href="${escapeHtml(r.url)}" target="_blank" rel="noopener">${icon('external-link', 'w-3.5 h-3.5')} ${th('เปิดลิงก์','Open link')}</a>` : ''}
                    ${r.address ? `<a class="btn btn-ghost btn-sm text-[11px]" style="min-height:30px;padding:2px 8px;" href="${escapeHtml(googleMapsPlaceUrl(r.address, r.coordinates))}" target="_blank" rel="noopener">${icon('navigation', 'w-3.5 h-3.5')} ${th('แผนที่','Map')}</a>` : ''}
                    ${r.phone ? `<a class="btn btn-ghost btn-sm text-[11px]" style="min-height:30px;padding:2px 8px;" href="tel:${escapeHtml(r.phone)}">${icon('phone', 'w-3.5 h-3.5')} ${escapeHtml(r.phone)}</a>` : ''}
                    ${!r.linkedItemId ? `<button class="btn btn-accent btn-sm text-[11px]" style="min-height:30px;padding:2px 10px;" data-act="plan" data-id="${r.id}">${icon('calendar-plus', 'w-3.5 h-3.5')} ${t('addToPlan')}</button>` : ''}
                    <button class="icon-btn" data-act="edit" data-id="${r.id}" title="${t('edit')}">${icon('pencil', 'w-3.5 h-3.5')}</button>
                    <button class="icon-btn icon-btn-danger" data-act="delete" data-id="${r.id}" title="${t('delete')}">${icon('trash-2', 'w-3.5 h-3.5')}</button>
                  </div>
                </div>
              </div>
            </div>`;
          }).join('')}
        </div>
      </div>
    `).join('');
    queueIcons();
    initReveal(box);
  }

  async function planBooking(r) {
    const rt = reservationTypeDef(r.type);
    openAddToPlanSheet({
      trip,
      title: r.title,
      subtitle: `${icon('info', 'w-3 h-3')} ${th('ระบบจะใส่รหัสยืนยันและเวลาไว้ในรายละเอียดของแผนด้วย','The confirmation code and times are copied into the itinerary note')}`,
      defaultDate: r.date || trip?.startDate || '',
      defaultTime: r.startTime || '09:00',
      category: ['hotel'].includes(rt.id) ? 'stay' : (['flight', 'train', 'bus', 'ferry', 'car'].includes(rt.id) ? 'transport' : 'activity'),
      onConfirm: async ({ date, startAt, category }) => {
        const tLoad = toast.loading(th('กำลังเพิ่มเข้าแผน...', 'Adding to the plan...'));
        try {
          const payload = reservationToItineraryPayload(r, { date, startAt, order: 999 });
          payload.startAt = new Date(`${date}T${startAt || r.startTime || '09:00'}`);
          payload.durationMinutes = durationBetween(startAt || r.startTime, r.endTime) || payload.durationMinutes || 60;
          payload.category = category || payload.category;
          payload.estimateAmount = Number(r.costMinor) > 0 ? fromMinor(Number(r.costMinor), getCurrencyDecimals(r.currency || 'THB')) : 0;
          payload.estimateCurrency = Number(r.costMinor) > 0 ? (r.currency || 'THB') : '';
          payload.estimateShareWith = members.map(m => m.id);
          payload.estimateAutoAdd = true;
          const { id } = await saveItineraryItem(tripId, payload, currentUser.uid, null, { trip, members });
          await updateReservation(tripId, r.id, { linkedItemId: id }, currentUser?.uid);
          r.linkedItemId = id;
          tLoad.close();
          toast.success(th('เพิ่มเข้าแผนแล้ว', 'Added to the plan'));
          paintList(); paintNext();
        } catch (e) {
          tLoad.close();
          toast.error(e.message || String(e));
          return false;
        }
        return true;
      }
    });
  }

  function openBookingForm(existing) {
    const isEdit = !!existing;
    const sheet = showBottomSheet(`
      <div class="space-y-4">
        <div class="flex items-center gap-3">
          <div class="row-icon" style="width:40px;height:40px;border-radius:14px;background:var(--gradient-primary);color:#fff;">${icon('ticket', 'w-5 h-5')}</div>
          <h3 class="font-bold text-base" style="font-family: var(--font-display);">${isEdit ? t('edit') : t('addBooking')}</h3>
        </div>
        <div class="input-group"><label class="input-label">${icon('layout-grid', 'w-3.5 h-3.5')} ${th('ประเภท','Type')}</label>
          <select id="bk-type" class="input">${RESERVATION_TYPES.map(rt => `<option value="${rt.id}" ${reservationTypeDef(existing?.type).id === rt.id ? 'selected' : ''}>${escapeHtml(lang === 'th' ? rt.th : rt.en)}</option>`).join('')}</select></div>
        <div class="input-group"><label class="input-label">${icon('sparkles', 'w-3.5 h-3.5')} ${th('ชื่อรายการ','Title')} *</label>
          <input id="bk-title" class="input" value="${escapeHtml(existing?.title || '')}" placeholder="${th('เช่น TG676 BKK→NRT','e.g. TG676 BKK→NRT')}"></div>
        <div class="grid grid-cols-2 gap-3">
          <div class="input-group"><label class="input-label">${icon('building', 'w-3.5 h-3.5')} ${th('ผู้ให้บริการ','Provider')}</label>
            <input id="bk-provider" class="input text-sm" value="${escapeHtml(existing?.provider || '')}" placeholder="${th('สายการบิน / โรงแรม','Airline / hotel')}"></div>
          <div class="input-group"><label class="input-label">${icon('hash', 'w-3.5 h-3.5')} ${t('confirmCode')}</label>
            <input id="bk-confirm" class="input text-sm font-mono" value="${escapeHtml(existing?.confirmation || '')}" placeholder="ABC123"></div>
        </div>
        <div class="grid grid-cols-3 gap-2">
          <div class="input-group"><label class="input-label">${icon('calendar', 'w-3.5 h-3.5')} ${th('วัน','Date')}</label>
            <input id="bk-date" type="date" class="input text-sm" value="${escapeHtml(existing?.date || trip?.startDate || '')}"></div>
          <div class="input-group"><label class="input-label">${icon('clock', 'w-3.5 h-3.5')} ${th('เริ่ม','Start')}</label>
            <input id="bk-start" type="time" class="input text-sm" value="${escapeHtml(existing?.startTime || '')}"></div>
          <div class="input-group"><label class="input-label">${icon('clock', 'w-3.5 h-3.5')} ${th('สิ้นสุด','End')}</label>
            <input id="bk-end" type="time" class="input text-sm" value="${escapeHtml(existing?.endTime || '')}"></div>
        </div>
        <div class="grid grid-cols-2 gap-3" id="bk-route-row">
          <div class="input-group"><label class="input-label">${icon('plane-takeoff', 'w-3.5 h-3.5')} ${th('จาก','From')}</label>
            <input id="bk-from" class="input text-sm" value="${escapeHtml(existing?.from || '')}" placeholder="BKK"></div>
          <div class="input-group"><label class="input-label">${icon('plane-landing', 'w-3.5 h-3.5')} ${th('ไป','To')}</label>
            <input id="bk-to" class="input text-sm" value="${escapeHtml(existing?.to || '')}" placeholder="NRT"></div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div class="input-group"><label class="input-label">${icon('armchair', 'w-3.5 h-3.5')} ${th('ที่นั่ง / ชั้น','Seat / class')}</label>
            <input id="bk-seat" class="input text-sm" value="${escapeHtml(existing?.seat || '')}" placeholder="12A"></div>
          <div class="input-group"><label class="input-label">${icon('door-open', 'w-3.5 h-3.5')} ${th('ห้อง / ประเภทห้อง','Room')}</label>
            <input id="bk-room" class="input text-sm" value="${escapeHtml(existing?.room || '')}" placeholder="Deluxe"></div>
        </div>
        <div class="input-group"><label class="input-label">${icon('map-pin', 'w-3.5 h-3.5')} ${th('ที่อยู่','Address')}</label>
          <input id="bk-address" class="input text-sm" value="${escapeHtml(existing?.address || '')}" placeholder="${th('ที่อยู่สนามบิน/โรงแรม','Airport / hotel address')}"></div>
        <div class="grid grid-cols-2 gap-3">
          <div class="input-group"><label class="input-label">${icon('phone', 'w-3.5 h-3.5')} ${th('เบอร์โทร','Phone')}</label>
            <input id="bk-phone" class="input text-sm" value="${escapeHtml(existing?.phone || '')}" placeholder="+66 ..."></div>
          <div class="input-group"><label class="input-label">${icon('link', 'w-3.5 h-3.5')} ${th('ลิงก์','Link')}</label>
            <input id="bk-url" class="input text-sm" value="${escapeHtml(existing?.url || '')}" placeholder="https://..."></div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div class="input-group"><label class="input-label">${icon('coins', 'w-3.5 h-3.5')} ${th('ค่าใช้จ่าย','Cost')}</label>
            <input id="bk-cost" class="input money-input" type="text" inputmode="decimal" value="${escapeHtml(toolAmountValue(existing?.costMinor, existing?.currency || trip?.baseCurrency || 'THB'))}" placeholder="0"></div>
          <div class="input-group"><label class="input-label">${icon('banknote', 'w-3.5 h-3.5')} ${th('สกุลเงิน','Currency')}</label>
            <select id="bk-currency" class="input">${toolCurrencyOptions(trip, existing?.currency || trip?.baseCurrency || 'THB')}</select></div>
        </div>
        <div class="input-group"><label class="input-label">${icon('align-left', 'w-3.5 h-3.5')} ${th('โน้ต','Notes')}</label>
          <textarea id="bk-notes" class="input" style="min-height:64px;">${escapeHtml(existing?.notes || '')}</textarea></div>
        <div class="flex gap-2">
          <button id="bk-cancel" class="btn btn-secondary flex-1">${t('cancel')}</button>
          <button id="bk-save" class="btn btn-primary flex-1">${icon('save', 'w-4 h-4')} ${t('save')}</button>
        </div>
      </div>
    `);
    queueIcons();
    bindMoneyInputs(sheet.sheet);
    document.getElementById('bk-cancel')?.addEventListener('click', () => sheet.close());
    document.getElementById('bk-save')?.addEventListener('click', async () => {
      const title = String(document.getElementById('bk-title')?.value || '').trim();
      if (!title) return toast.error(th('ต้องมีชื่อรายการจอง', 'A booking title is required'));
      const cur = document.getElementById('bk-currency')?.value || 'THB';
      const payload = {
        type: document.getElementById('bk-type')?.value || 'other',
        title,
        provider: String(document.getElementById('bk-provider')?.value || '').trim(),
        confirmation: String(document.getElementById('bk-confirm')?.value || '').trim(),
        date: document.getElementById('bk-date')?.value || '',
        startTime: document.getElementById('bk-start')?.value || '',
        endTime: document.getElementById('bk-end')?.value || '',
        from: String(document.getElementById('bk-from')?.value || '').trim(),
        to: String(document.getElementById('bk-to')?.value || '').trim(),
        seat: String(document.getElementById('bk-seat')?.value || '').trim(),
        room: String(document.getElementById('bk-room')?.value || '').trim(),
        address: String(document.getElementById('bk-address')?.value || '').trim(),
        phone: String(document.getElementById('bk-phone')?.value || '').trim(),
        url: String(document.getElementById('bk-url')?.value || '').trim(),
        costMinor: toMinor(parseCurrencyInput(document.getElementById('bk-cost')?.value || '') || 0, getCurrencyDecimals(cur)),
        currency: cur,
        notes: String(document.getElementById('bk-notes')?.value || '').trim()
      };
      const tLoad = toast.loading(th('กำลังบันทึก...', 'Saving...'));
      try {
        if (isEdit) {
          await updateReservation(tripId, existing.id, payload, currentUser?.uid);
          Object.assign(existing, payload);
        } else {
          const id = await createReservation(tripId, payload, currentUser?.uid);
          reservations.push({ id, ...payload });
        }
        tLoad.close();
        sheet.close();
        toast.success(th('บันทึกแล้ว', 'Saved'));
        logActivity(tripId, { type: 'trip', targetId: existing?.id || payload.title, title: payload.title, detail: th('บันทึกการจอง','Reservation saved'), user: actor() }).catch(() => {});
        paintList(); paintNext();
      } catch (e) { tLoad.close(); toast.error(e.message || String(e)); }
    });
    setTimeout(() => document.getElementById('bk-title')?.focus(), 250);
  }

  async function removeBooking(r) {
    const ok = await confirmAction({
      title: th(`ลบ “${r.title}” ?`, `Delete “${r.title}”?`),
      message: th('การจองนี้จะถูกเอาออก (แผนที่เชื่อมไว้ไม่ถูกลบ)','This booking will be removed (a linked itinerary item stays)'),
      confirmText: t('delete'), danger: true, icon: 'trash-2'
    });
    if (!ok) return;
    try {
      await deleteReservation(tripId, r.id);
      reservations = reservations.filter(x => x.id !== r.id);
      paintList(); paintNext();
      toast.success(th('ลบแล้ว', 'Deleted'));
    } catch (e) { toast.error(e.message || String(e)); }
  }

  document.getElementById('booking-filters')?.querySelectorAll('[data-type]').forEach(btn => btn.addEventListener('click', () => {
    typeFilter = btn.dataset.type;
    document.getElementById('booking-filters')?.querySelectorAll('.chip').forEach(c => c.classList.remove('chip-active'));
    btn.classList.add('chip-active');
    paintList();
  }));

  function bindBookingActions(container) {
    container?.addEventListener('click', async (e) => {
      const copyBtn = e.target.closest('[data-copy]');
      if (copyBtn) { copyToClipboard(copyBtn.dataset.copy); return; }
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const r = reservations.find(x => x.id === btn.dataset.id);
      if (!r) return;
      if (btn.dataset.act === 'edit') openBookingForm(r);
      if (btn.dataset.act === 'plan') await planBooking(r);
      if (btn.dataset.act === 'delete') await removeBooking(r);
    });
  }
  bindBookingActions(document.getElementById('bookings-list'));
  bindBookingActions(document.getElementById('booking-next'));

  bind('booking-add-btn', 'click', () => openBookingForm(null));
  bind('booking-import-btn', 'click', () => openBookingImport(tripId, { onSaved: () => renderBookings(params) }));
  bind('booking-ics-btn', 'click', () => {
    if (!reservations.length) return toast.error(th('ยังไม่มีการจองให้ส่งออก', 'No reservations to export'));
    const events = reservationsToEvents(reservations, { lang });
    downloadIcs(`${(trip?.name || 'trip').replace(/\s+/g, '-')}-bookings.ics`, buildIcs(events, { calendarName: `${trip?.name || 'Trip'} — ${t('reservations')}` }));
    toast.success(th('ส่งออกไฟล์ปฏิทินแล้ว', 'Calendar file exported'));
  });

  paintNext();
  paintList();
  initReveal(appEl);
}

/* ================================================================== *
 * EXPLORE — curated place guides (v17)
 * “Add places from guides with 1 click” — the Wanderlog feature our
 * app was still missing. Each place can go to the voting board or
 * straight into the day plan, with the typical cost pre-filled.
 * ================================================================== */
async function renderExplore(params) {
  const tripId = params.tripId;
  const token = beginRender();
  const lang = getLang();
  const th = (a, b) => (lang === 'th' ? a : b);
  await loadTrip(tripId);
  if (isStale(token)) return;
  const trip = currentTrip;
  const baseCurrency = trip?.baseCurrency || 'THB';

  let members = [];
  let items = [];
  let ideas = [];
  let expenses = [];
  await Promise.all([
    listMembers(tripId).then(m => { members = m || []; currentTripMembers = members; }).catch(() => {}),
    fetchItinerary(tripId).then(i => { items = i || []; }).catch(() => {}),
    listIdeas(tripId).then(i => { ideas = i || []; }).catch(() => {}),
    fetchAllExpenses(tripId).then(e => { expenses = e || []; }).catch(() => {})
  ]);
  if (isStale(token)) return;

  const matches = matchDestinations(trip, 4);
  const exploreParams = new URLSearchParams(location.hash.split('?')[1] || '');
  const wantedDest = exploreParams.get('dest');
  let destId = (wantedDest && destinationById(wantedDest)) ? wantedDest : (matches[0]?.destination?.id || DESTINATIONS[0].id);
  let category = exploreParams.get('category') || 'all';
  let query = exploreParams.get('q') || '';
  const stats = libraryStats();

  /** place price in the trip currency when a rate is known (else 0). */
  function rateToBase(fromCurrency) {
    const from = String(fromCurrency || baseCurrency).toUpperCase();
    const base = String(baseCurrency).toUpperCase();
    if (from === base) return 1;
    const toThb = resolveTripThbRate(trip, expenses, from);
    if (!(toThb > 0)) return null;
    if (base === 'THB') return toThb;
    const baseToThb = resolveTripThbRate(trip, expenses, base);
    if (!(baseToThb > 0)) return null;
    return toThb / baseToThb;
  }

  function costChip(place) {
    if (!Number(place.cost)) return `<span class="place-chip">${icon('circle-slash', 'w-3 h-3')} ${th('ฟรี', 'Free')}</span>`;
    const own = formatCurrency(toMinor(Number(place.cost), getCurrencyDecimals(place.currency)), place.currency);
    const rate = rateToBase(place.currency);
    const converted = rate ? formatCurrency(toMinor(Number(place.cost) * rate, getCurrencyDecimals(baseCurrency)), baseCurrency) : '';
    return `<span class="place-chip place-chip--cost">${icon('coins', 'w-3 h-3')} ${escapeHtml(own)}${converted && place.currency !== baseCurrency ? ` <span style="opacity:.75">≈ ${escapeHtml(converted)}</span>` : ''}</span>`;
  }

  appEl.innerHTML = `
    <div class="page-enter max-w-[1100px] mx-auto space-y-5" id="explore-root">
      ${renderPageScene('explore', {
        lang,
        title: `${icon('compass', 'w-5 h-5')} ${th('ชวนไปที่นี่','Explore places')}`,
        subtitle: th(`ไกด์แนะนำสถานที่ ${stats.places} แห่งใน ${stats.destinations} เมือง — กดครั้งเดียวเพิ่มเข้าแผนหรือให้ทั้งทีมโหวต`,
                    `${stats.places} hand-picked places in ${stats.destinations} cities — one tap to plan or to let the group vote`)
      })}

      <div class="explore-hero">
        <div class="flex items-start justify-between gap-3 flex-wrap" id="explore-hero"></div>
        <div class="explore-search mt-3">
          ${icon('search', 'w-4 h-4')}
          <input id="explore-search" class="input" placeholder="${th('ค้นหาสถานที่ในไกด์…','Search the guides…')}" value="${escapeHtml(query)}">
        </div>
      </div>

      <div class="flex items-center gap-2 flex-wrap">
        <div class="chip-row flex-1" id="explore-cats"></div>
        <select id="explore-dest" class="input text-xs" style="max-width:210px;min-height:38px;">
          ${DESTINATIONS.map(d => `<option value="${d.id}" ${d.id === destId ? 'selected' : ''}>${escapeHtml(lang === 'th' ? `${d.cityTh} • ${d.countryTh}` : `${d.city} • ${d.country}`)}</option>`).join('')}
        </select>
      </div>

      <section id="explore-reco"></section>
      <section>
        <h3 class="font-bold text-sm mb-2 flex items-center gap-2">
          <span class="row-icon" style="width:28px;height:28px;border-radius:10px;">${icon('layout-grid', 'w-4 h-4')}</span>
          ${th('สถานที่ทั้งหมด','All places')} <span id="explore-count" class="badge badge-planned text-[10px]">0</span>
        </h3>
        <div id="explore-list" class="guide-grid"></div>
      </section>

      <p class="text-[10px] text-[var(--text-tertiary)] text-center">
        ${icon('info', 'w-3 h-3 inline')}
        ${th('ไกด์ชุดนี้เก็บไว้ในแอป ใช้ได้แม้ไม่มีเน็ต • เพิ่มเมือง/สถานที่ของทีมเองได้ในหน้า “ไอเดียสถานที่”',
             'The guides ship with the app and work offline • Add your own places on the ideas board')}
      </p>
    </div>
  `;
  queueIcons();

  function pool() {
    const dest = destinationById(destId);
    const base = searchPlaces(query, { destinationId: query ? (destId || null) : destId }).map(r => r.place);
    const list = base.filter(p => category === 'all' || p.category === category);
    return list;
  }

  function paintReco() {
    const box = document.getElementById('explore-reco');
    if (!box) return;
    const recos = suggestForTrip({
      places: destinationPlaces(destId),
      itinerary: items,
      ideas,
      limit: 6
    });
    if (!recos.length) { box.innerHTML = ''; return; }
    box.innerHTML = `
      <h3 class="font-bold text-sm mb-2 flex items-center gap-2">
        <span class="row-icon" style="width:28px;height:28px;border-radius:10px;background:var(--brand-yellow-tint);color:var(--brand-yellow-ink);">${icon('wand-sparkles', 'w-4 h-4')}</span>
        ${th('แนะนำสำหรับทริปนี้','Suggested for this trip')}
        <span class="text-[10px] text-[var(--text-tertiary)] font-medium">${th('เรียงจากใกล้จุดที่วางไว้','ranked by distance to your plan')}</span>
      </h3>
      <div class="reco-strip">
        ${recos.map(r => `
          <div class="reco-card">
            <span class="place-chip" style="background:var(--primary-light);color:var(--primary-strong);border-color:transparent;">${icon(categoryIcon(r.place.category), 'w-3 h-3')} ${escapeHtml(categoryLabel(r.place.category, lang))}</span>
            <b class="mt-1.5">${escapeHtml(lang === 'th' ? r.place.name.th : r.place.name.en)}</b>
            <p>${escapeHtml(lang === 'th' ? r.reasonTh : r.reasonEn)}</p>
            <div class="flex gap-2 mt-2">
              <button class="btn btn-primary btn-sm flex-1" style="min-height:32px;font-size:11.5px;" data-plan="${r.place.id}" data-dest="${destId}">${icon('calendar-plus', 'w-3.5 h-3.5')} ${t('addToPlan')}</button>
              <button class="btn btn-secondary btn-sm" style="min-height:32px;font-size:11.5px;" data-idea="${r.place.id}" data-dest="${destId}" title="${th('เก็บเป็นไอเดีย','Save as idea')}">${icon('lightbulb', 'w-3.5 h-3.5')}</button>
            </div>
          </div>`).join('')}
      </div>`;
    queueIcons();
  }

  function paintCats() {
    const box = document.getElementById('explore-cats');
    if (!box) return;
    const all = destinationPlaces(destId);
    const counts = exploreCategoryCounts(all);
    box.innerHTML = counts.map(c => `
      <button class="chip ${category === c.id ? 'chip-active' : ''}" data-cat="${c.id}">
        ${icon(c.icon, 'w-3.5 h-3.5')} ${escapeHtml(lang === 'th' ? c.th : c.en)} <span style="opacity:.7">${c.count}</span>
      </button>`).join('');
    queueIcons();
  }

  function paintList() {
    const box = document.getElementById('explore-list');
    if (!box) return;
    const places = pool();
    const countEl = document.getElementById('explore-count');
    if (countEl) countEl.textContent = String(places.length);
    if (!places.length) {
      box.innerHTML = `<div class="col-span-full">${renderEmptyState({
        icon: 'search-x',
        title: th('ไม่พบสถานที่ที่ตรงกับคำค้น','No place matches that search'),
        desc: th('ลองคำอื่น หรือเลือกเมืองอื่นจากรายการด้านบน','Try another keyword or pick a different city above')
      })}</div>`;
      queueIcons();
      return;
    }
    box.innerHTML = places.map((place, idx) => `
      <div class="place-card" data-place="${place.id}">
        <span class="place-thumb ${idx % 3 === 1 ? 'place-thumb--amber' : idx % 3 === 2 ? 'place-thumb--sky' : ''}">${icon(categoryIcon(place.category), 'w-6 h-6')}</span>
        <div class="place-body">
          <div class="place-title">${escapeHtml(lang === 'th' ? place.name.th : place.name.en)}</div>
          <p class="place-desc">${escapeHtml(lang === 'th' ? place.note.th : place.note.en)}</p>
          <div class="place-meta">
            <span class="place-chip">${icon('map-pin', 'w-3 h-3')} ${escapeHtml(place.area || '')}</span>
            <span class="place-chip">${icon(bestTimeIcon(place.best), 'w-3 h-3')} ${escapeHtml(bestTimeLabel(place.best, lang))}</span>
            <span class="place-chip">${icon('clock', 'w-3 h-3')} ${Math.round((Number(place.durationMinutes) || 60) / 60 * 10) / 10} ${th('ชม.','h')}</span>
            ${costChip(place)}
          </div>
          <div class="place-actions">
            <button class="btn btn-primary btn-sm" style="min-height:32px;font-size:11.5px;" data-plan="${place.id}" data-dest="${destId}">${icon('calendar-plus', 'w-3.5 h-3.5')} ${t('addToPlan')}</button>
            <button class="btn btn-secondary btn-sm" style="min-height:32px;font-size:11.5px;" data-idea="${place.id}" data-dest="${destId}">${icon('lightbulb', 'w-3.5 h-3.5')} ${th('เก็บเป็นไอเดีย','Save as idea')}</button>
            <a class="btn btn-ghost btn-sm" style="min-height:32px;font-size:11.5px;" href="${escapeHtml(googleMapsPlaceUrl(place.area, place.coordinates))}" target="_blank" rel="noopener">${icon('navigation', 'w-3.5 h-3.5')} ${t('map')}</a>
          </div>
        </div>
      </div>`).join('');
    queueIcons();
  }

  function repaint() { paintCats(); paintList(); queueIcons(); }

  function findPlace(placeId, fromDestId) {
    return destinationPlaces(fromDestId || destId).find(p => p.id === placeId) || null;
  }

  async function saveAsIdea(place) {
    if (!place) return;
    const tLoad = toast.loading(th('กำลังบันทึกเป็นไอเดีย...', 'Saving as an idea…'));
    try {
      await createIdea(tripId, placeToIdeaPayload(place, { baseCurrency, rate: rateToBase(place.currency) }), currentUser?.uid || null);
      ideas.push({ title: place.name.th, status: 'idea' });
      tLoad.close();
      toast.success(th('เก็บเข้าบอร์ดไอเดียแล้ว — ให้ทีมโหวตได้เลย', 'Saved to the ideas board — the group can vote now'));
      celebrateFrom(null);
      paintReco();
    } catch (e) {
      tLoad.close();
      toast.error(e.message || String(e));
    }
  }

  function planPlace(place) {
    if (!place) return;
    openAddToPlanSheet({
      trip,
      title: lang === 'th' ? place.name.th : place.name.en,
      subtitle: `${icon('info', 'w-3 h-3')} ${escapeHtml(th(`ไกด์แนะนำ: ${lang === 'th' ? place.note.th : place.note.en}`, `Guide tip: ${place.note.en}`))}`,
      defaultDate: trip?.startDate || '',
      defaultTime: suggestedTime(place),
      category: normalizeCategory(place.category),
      onConfirm: async ({ date, startAt, category: cat }) => {
        const tLoad = toast.loading(th('กำลังเพิ่มเข้าแผน...', 'Adding to the plan…'));
        try {
          const rate = rateToBase(place.currency);
          const draft = placeToPlanDraft(place, { date, startAt, category: cat, baseCurrency, rate });
          const payload = {
            title: draft.title,
            description: draft.description,
            date: draft.date,
            startAt: new Date(`${draft.date}T${draft.startAt || '09:00'}`),
            durationMinutes: draft.durationMinutes,
            travelToNextMinutes: 0,
            category: draft.category,
            address: draft.address,
            coordinates: draft.coordinates || '',
            notes: th('เพิ่มจากไกด์ Explore (v17)', 'Added from the Explore guide (v17)'),
            status: 'planned',
            estimateAmount: rate ? Number(place.cost) || 0 : 0,
            estimateCurrency: rate ? (place.currency || baseCurrency) : '',
            estimateCategory: expenseGroupForChoice(place.category || 'general'),
            estimateShareWith: members.map(m => m.id),
            estimateAutoAdd: true
          };
          const { id } = await saveItineraryItem(tripId, payload, currentUser?.uid || null, null, { trip, members });
          items.push({ id, title: draft.title, date: draft.date, coordinates: draft.coordinates || '', category: draft.category });
          logActivity(tripId, { type: 'itinerary', targetId: id, title: draft.title, detail: th('เพิ่มจากไกด์ Explore', 'Added from the Explore guide'), user: actor() }).catch(() => {});
          tLoad.close();
          toast.success(th('เพิ่มเข้าแผนแล้ว', 'Added to the plan'));
          celebrateFrom(null);
          paintReco();
        } catch (e) {
          tLoad.close();
          toast.error(e.message || String(e));
          return false;
        }
        return true;
      }
    });
  }

  function paintHero() {
    const box = document.getElementById('explore-hero');
    if (!box) return;
    const dest = destinationById(destId);
    const chips = [...matches];
    if (!chips.some(c => c.destination.id === destId)) {
      const current = destinationById(destId);
      if (current) chips.unshift({ destination: current, score: 0 });
    }
    box.innerHTML = `
      <div class="min-w-0">
        <span class="eh-chip">${icon('sparkles', 'w-3 h-3')} ${th('ไกด์พร้อมใช้','Ready-made guide')}</span>
        <h2 class="text-lg sm:text-xl mt-2 leading-tight">${escapeHtml(th('ที่เที่ยวที่คัดมาแล้วสำหรับทริปนี้','Places picked for this trip'))}</h2>
        <p class="text-[12px] mt-1" style="color:rgba(255,255,255,.86)">${escapeHtml(dest ? (lang === 'th' ? dest.tagline.th : dest.tagline.en) : '')}</p>
      </div>
      <div class="flex items-center gap-2 flex-wrap">
        ${chips.map(c => `
          <button class="eh-chip" data-dest-chip="${c.destination.id}" style="${c.destination.id === destId ? 'background:rgba(255,255,255,.36);' : ''}">
            ${icon('map-pin', 'w-3 h-3')} ${escapeHtml(lang === 'th' ? c.destination.cityTh : c.destination.city)}
          </button>`).join('')}
      </div>`;
    queueIcons();
    box.querySelectorAll('[data-dest-chip]').forEach(btn => btn.addEventListener('click', (e) => {
      const id = e.currentTarget.getAttribute('data-dest-chip');
      if (!id || id === destId) return;
      destId = id; category = 'all';
      const destSel = document.getElementById('explore-dest');
      if (destSel) destSel.value = id;
      paintHero(); paintReco(); repaint();
    }));
  }

  paintHero(); paintReco(); repaint();
  bind('explore-cats', 'click', (e) => {
    const btn = e.target.closest('[data-cat]');
    if (!btn) return;
    category = btn.getAttribute('data-cat');
    repaint();
  });
  document.getElementById('explore-dest')?.addEventListener('change', (e) => { destId = e.target.value; repaint(); paintReco(); });
  document.getElementById('explore-search')?.addEventListener('input', (e) => { query = e.target.value.trim(); paintList(); });
  // delegated: the card list is re-painted on every filter/search, so the
  // buttons must be handled from the page root instead of bound one by one
  bind('explore-root', 'click', (e) => {
    const planBtn = e.target.closest('[data-plan]');
    if (planBtn) {
      planPlace(findPlace(planBtn.getAttribute('data-plan'), planBtn.getAttribute('data-dest') || destId));
      return;
    }
    const ideaBtn = e.target.closest('[data-idea]');
    if (ideaBtn) saveAsIdea(findPlace(ideaBtn.getAttribute('data-idea'), ideaBtn.getAttribute('data-dest') || destId));
  });
}

/* ================================================================== *
 * CALENDAR — the plan on a month grid (v17)
 * ================================================================== */
async function renderCalendar(params) {
  const tripId = params.tripId;
  const token = beginRender();
  const lang = getLang();
  const th = (a, b) => (lang === 'th' ? a : b);
  await loadTrip(tripId);
  if (isStale(token)) return;
  const trip = currentTrip;
  const urlParams = new URLSearchParams(location.hash.split('?')[1] || '');
  const autoPrint = urlParams.get('print') === '1';

  let items = [];
  try { items = await fetchItinerary(tripId); } catch (e) { console.warn(e?.message); }
  if (isStale(token)) return;

  const months = tripMonths(trip);
  const fallback = defaultMonthFor(trip);
  let view = months[0] || fallback;
  let selected = trip?.startDate || '';
  const summary = calendarSummary(trip, items);
  const today = dayjs().format('YYYY-MM-DD');

  appEl.innerHTML = `
    <div class="page-enter max-w-[1000px] mx-auto space-y-5">
      ${renderPageScene('calendar', {
        lang,
        title: `${icon('calendar-days', 'w-5 h-5')} ${th('ปฏิทินทริป','Trip calendar')}`,
        subtitle: th(`${summary.days} วัน • ${summary.stops} จุดหมาย — เห็นภาพรวมทั้งเดือนในหน้าเดียว`,
                    `${summary.days} days • ${summary.stops} stops — the whole month at a glance`)
      })}

      <div class="card p-3 flex items-center justify-between gap-2 flex-wrap no-print">
        <div class="flex items-center gap-1">
          <button id="cal-prev" class="icon-btn" title="${th('เดือนก่อน','Previous month')}">${icon('chevron-left', 'w-4 h-4')}</button>
          <b id="cal-label" class="text-sm px-2" style="font-family:var(--font-display);min-width:132px;text-align:center;display:inline-block;"></b>
          <button id="cal-next" class="icon-btn" title="${th('เดือนถัดไป','Next month')}">${icon('chevron-right', 'w-4 h-4')}</button>
          <button id="cal-today" class="btn btn-ghost btn-sm">${th('วันนี้','Today')}</button>
        </div>
        <div class="btn-row">
          ${months.map(m => `<button class="chip" data-month="${m.year}-${m.month}">${escapeHtml(monthShort(m.month, lang))}</button>`).join('')}
          <a class="btn btn-secondary btn-sm" href="#/trip/${tripId}/itinerary">${icon('list-ordered', 'w-4 h-4')} ${th('แบบไทม์ไลน์','Timeline')}</a>
          <button id="cal-print" class="btn btn-primary btn-sm">${icon('printer', 'w-4 h-4')} ${th('พิมพ์ / PDF','Print / PDF')}</button>
        </div>
      </div>

      <div class="card p-3 sm:p-4">
        <div class="cal-grid mb-1" id="cal-weekdays"></div>
        <div class="cal-grid" id="cal-grid"></div>
        <div class="cal-legend mt-3">
          <span>${icon('square', 'w-3 h-3 inline')} ${th('วันของทริป','Trip day')}</span>
          <span><span class="cal-pill" style="display:inline-block;">${th('มีแผน','planned')}</span></span>
          <span>${icon('circle-dot', 'w-3 h-3 inline')} ${th('วันนี้','Today')}</span>
        </div>
      </div>

      <div id="cal-detail"></div>
    </div>
  `;
  queueIcons();

  function paint() {
    const grid = buildMonthGrid(view.year, view.month, { trip, items, today, lang, maxPills: 3 });
    const label = document.getElementById('cal-label');
    if (label) label.textContent = grid.label;
    const weekdays = document.getElementById('cal-weekdays');
    if (weekdays) weekdays.innerHTML = grid.weekdays.map(w => `<div class="cal-head">${escapeHtml(w)}</div>`).join('');
    const box = document.getElementById('cal-grid');
    if (!box) return;
    box.innerHTML = grid.weeks.map(week => week.map(cell => {
      const cls = ['cal-cell'];
      if (!cell.inMonth) cls.push('is-outside');
      if (cell.inTrip) cls.push('is-trip');
      if (cell.isToday) cls.push('is-today');
      const pills = cell.pills.map((p, i) => `<span class="cal-pill ${i === 1 ? 'cal-pill--amber' : i === 2 ? 'cal-pill--mist' : ''}">${escapeHtml(String(p.title).slice(0, 22))}</span>`).join('');
      return `<button class="${cls.join(' ')}" data-day="${cell.iso}">
        <span class="cal-day">${cell.inMonth ? cell.day : `<span style="opacity:.6">${cell.day}</span>`}</span>
        ${pills}
        ${cell.extra ? `<span class="cal-more">+${cell.extra} ${th('รายการ','more')}</span>` : ''}
      </button>`;
    }).join('')).join('');
    queueIcons();
  }

  function paintDetail() {
    const box = document.getElementById('cal-detail');
    if (!box) return;
    if (!selected) { box.innerHTML = ''; return; }
    const dayItems = itemsForDay(items, selected);
    const dayIdx = Math.max(0, (trip?.startDate ? dayjs(selected).diff(dayjs(trip.startDate), 'day') : 0));
    box.innerHTML = `
      <div class="card p-4">
        <div class="flex items-center justify-between gap-2 flex-wrap mb-3">
          <h3 class="font-bold text-sm flex items-center gap-2">
            <span class="step-num">${dayjs(selected).format('DD')}</span>
            ${escapeHtml(formatDate(selected, lang, trip?.timezone))}
            <span class="badge badge-planned text-[10px]">${th('วันที่','Day')} ${dayIdx + 1}</span>
          </h3>
          <div class="btn-row">
            <a class="btn btn-secondary btn-sm" href="#/trip/${tripId}/itinerary?date=${selected}">${icon('map-pinned', 'w-4 h-4')} ${th('เปิดในแผน','Open in the plan')}</a>
            <button class="btn btn-accent btn-sm" id="cal-add">${icon('plus', 'w-4 h-4')} ${t('addPlace')}</button>
          </div>
        </div>
        ${dayItems.length ? `<div class="space-y-2">${dayItems.map(i => `
          <div class="flex items-center gap-3 p-2.5 rounded-2xl" style="background:var(--bg-secondary);border:1px solid var(--border-light);">
            <span class="text-[11px] font-mono font-bold w-12 flex-shrink-0" style="color:var(--primary-strong);">${escapeHtml(String(i.startAt || '').slice(11, 16) || '--:--')}</span>
            <span class="row-icon" style="width:28px;height:28px;border-radius:10px;">${icon(categoryIcon(normalizeCategory(i.category)), 'w-3.5 h-3.5')}</span>
            <span class="min-w-0 flex-1">
              <b class="block text-[13px] truncate">${escapeHtml(i.title || '')}</b>
              ${i.address ? `<span class="text-[11px] text-[var(--text-secondary)] truncate block">${escapeHtml(i.address)}</span>` : ''}
            </span>
            ${i.coordinates ? `<a class="icon-btn" href="${escapeHtml(googleMapsPlaceUrl(i.address, i.coordinates))}" target="_blank" rel="noopener" title="${t('map')}">${icon('navigation', 'w-3.5 h-3.5')}</a>` : ''}
          </div>`).join('')}</div>`
        : renderEmptyState({
            icon: 'calendar-x',
            title: th('วันนี้ยังไม่มีแผน','Nothing planned for this day'),
            desc: th('กด “เพิ่มสถานที่” เพื่อเริ่มใส่อย่างแรกของวันนี้','Tap “Add place” to start filling this day'),
            actionHtml: `<button id="cal-empty-add" class="btn btn-primary btn-sm mt-2">${icon('plus', 'w-4 h-4')} ${t('addPlace')}</button>`
          })}
      </div>`;
    queueIcons();
    bind('cal-add', 'click', () => { location.hash = `#/trip/${tripId}/itinerary?action=add&date=${selected}`; });
    bind('cal-empty-add', 'click', () => { location.hash = `#/trip/${tripId}/itinerary?action=add&date=${selected}`; });
  }

  bind('cal-prev', 'click', () => { view = shiftMonth(view.year, view.month, -1); paint(); });
  bind('cal-next', 'click', () => { view = shiftMonth(view.year, view.month, 1); paint(); });
  bind('cal-today', 'click', () => { const t = dayjs().format('YYYY-MM-DD'); selected = t; view = { year: Number(t.slice(0, 4)), month: Number(t.slice(5, 7)) }; paint(); paintDetail(); });
  bind('cal-print', 'click', () => window.print());
  document.querySelectorAll('[data-month]').forEach(btn => btn.addEventListener('click', (e) => {
    const [y, m] = e.currentTarget.getAttribute('data-month').split('-').map(Number);
    view = { year: y, month: m }; paint();
  }));
  bind('cal-grid', 'click', (e) => {
    const cell = e.target.closest('[data-day]');
    if (!cell) return;
    selected = cell.getAttribute('data-day');
    const parsed = parseISODate(selected);
    if (parsed && (parsed.year !== view.year || parsed.month !== view.month)) view = { year: parsed.year, month: parsed.month };
    paint(); paintDetail();
  });

  paint(); paintDetail();
  if (autoPrint) setTimeout(() => window.print(), 700);
}

/* ================================================================== *
 * SHARE — invite link, LINE, summary & print (v17)
 * ================================================================== */
async function openShareSheet(trip = null) {
  const lang = getLang();
  const th = (a, b) => (lang === 'th' ? a : b);
  const t0 = trip || currentTrip;
  if (!t0?.id) { toast.error(th('ยังไม่มีทริปที่เลือก', 'No trip selected')); return; }
  const tripId = t0.id;
  const code = t0.inviteCode || '';
  const link = inviteLink(code);
  const message = inviteMessage({ trip: t0, inviteCode: code, inviter: currentUserDisplayName(), lang });

  const sheet = showBottomSheet(`
    <div class="space-y-4">
      <div class="flex items-start gap-3">
        <div class="row-icon" style="width:42px;height:42px;border-radius:14px;background:var(--gradient-primary);color:#fff;">${icon('share-2', 'w-5 h-5')}</div>
        <div class="min-w-0">
          <h3 class="font-bold text-base leading-tight" style="font-family: var(--font-display);">${th('ชวนเพื่อนเข้าทริป','Invite your friends')}</h3>
          <p class="text-xs text-[var(--text-secondary)] mt-0.5">${th('ทุกคนเห็นแผนเดียวกันแบบเรียลไทม์ — แชร์ค่าใช้จ่ายและโหวตที่เที่ยวได้ทันที','Everyone sees the same plan live — split costs and vote on places together')}</p>
        </div>
      </div>

      <div class="card p-4 text-center" style="background:var(--surface-2);">
        <p class="text-[11px] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">${th('รหัสเชิญเข้าร่วมทริป','Trip invite code')}</p>
        <p class="share-code my-1">${escapeHtml(formatCode(code) || '—')}</p>
        <p class="text-[11px] text-[var(--text-secondary)]">${th('ให้เพื่อนล็อกอิน แล้วกรอกรหัสนี้ที่หน้า “ทริปของฉัน”','Ask them to sign in and type this code on “My trips”')}</p>
      </div>

      <div class="share-grid">
        <button class="share-tile" data-share="copy">${icon('link', 'w-4 h-4')} ${th('คัดลอกลิงก์เชิญ','Copy invite link')}</button>
        <button class="share-tile" data-share="line">${icon('message-circle', 'w-4 h-4')} ${th('แชร์ผ่าน LINE','Share on LINE')}</button>
        <button class="share-tile" data-share="code">${icon('key-round', 'w-4 h-4')} ${th('คัดลอกรหัส','Copy code')}</button>
        <button class="share-tile" data-share="message">${icon('clipboard-list', 'w-4 h-4')} ${th('คัดลอกข้อความชวน','Copy invite message')}</button>
        <button class="share-tile" data-share="summary">${icon('receipt-text', 'w-4 h-4')} ${th('คัดลอกสรุปทริป','Copy trip summary')}</button>
        <button class="share-tile" data-share="plan">${icon('file-text', 'w-4 h-4')} ${th('คัดลอกแผนรายวัน','Copy day-by-day plan')}</button>
      </div>

      <div class="flex gap-2">
        <button class="btn btn-secondary flex-1" data-share="print">${icon('printer', 'w-4 h-4')} ${th('พิมพ์ / บันทึก PDF','Print / save PDF')}</button>
        <button class="btn btn-secondary flex-1" id="share-native">${icon('smartphone', 'w-4 h-4')} ${th('แชร์…','Share…')}</button>
      </div>
      <p class="text-[10px] text-[var(--text-tertiary)] text-center">${icon('shield-check', 'w-3 h-3 inline')} ${th('ลิงก์ชี้มาที่แอปนี้ — คนที่ไม่มีสิทธิ์จะเข้าได้เฉพาะหน้าเข้าสู่ระบบ','The link points at this app — people without access only reach the sign-in screen')}</p>
    </div>
  `);
  queueIcons();

  async function summaryText() {
    let members = []; let items = []; let expenses = [];
    try { members = await listMembers(tripId); } catch {}
    try { items = await fetchItinerary(tripId); } catch {}
    try { expenses = await fetchAllExpenses(tripId); } catch {}
    const total = expenses.filter(e => e.status !== 'voided').reduce((sum, e) => sum + (Number(e.netTotalMinor) || 0), 0);
    return tripSummaryText({ trip: t0, members, items, expenses, totalMinor: total, currency: t0.baseCurrency || 'THB', lang });
  }
  async function planText() {
    let items = [];
    try { items = await fetchItinerary(tripId); } catch {}
    let members = [];
    try { members = await listMembers(tripId); } catch {}
    return itineraryText({ trip: t0, items, members, lang });
  }

  sheet.sheet.querySelectorAll('[data-share]').forEach(btn => btn.addEventListener('click', async (e) => {
    const kind = e.currentTarget.getAttribute('data-share');
    if (kind === 'copy') return copyToClipboard(link, 'คัดลอกลิงก์เชิญแล้ว', 'Invite link copied');
    if (kind === 'code') return copyToClipboard(formatCode(code), 'คัดลอกรหัสเชิญแล้ว', 'Invite code copied');
    if (kind === 'message') return copyToClipboard(message, 'คัดลอกข้อความชวนแล้ว', 'Invite message copied');
    if (kind === 'line') { window.open(lineShareUrl(message), '_blank', 'noopener'); return; }
    if (kind === 'summary') return copyToClipboard(await summaryText(), 'คัดลอกสรุปทริปแล้ว', 'Trip summary copied');
    if (kind === 'plan') return copyToClipboard(await planText(), 'คัดลอกแผนรายวันแล้ว', 'Day-by-day plan copied');
    if (kind === 'print') { sheet.close(); location.hash = printPlanUrl(tripId).replace(/^.*#/, '#'); return; }
  }));

  bind('share-native', 'click', async () => {
    if (navigator.share) {
      try { await navigator.share({ title: t0.name || 'Trip', text: message, url: link }); return; } catch { /* cancelled */ }
    } else {
      copyToClipboard(message);
    }
  });
}

/* ================================================================== *
 * BOOKING IMPORT — paste a confirmation e-mail (v17)
 * ================================================================== */
function openBookingImport(tripId, { onSaved = null } = {}) {
  const lang = getLang();
  const th = (a, b) => (lang === 'th' ? a : b);
  const currency = currentTrip?.baseCurrency || 'THB';
  let draft = null;

  const sheet = showBottomSheet(`
    <div class="space-y-4">
      <div class="flex items-start gap-3">
        <div class="row-icon" style="width:42px;height:42px;border-radius:14px;background:var(--gradient-duo);color:#fff;">${icon('mail-plus', 'w-5 h-5')}</div>
        <div class="min-w-0">
          <h3 class="font-bold text-base leading-tight" style="font-family: var(--font-display);">${th('นำเข้าจากอีเมลยืนยันการจอง','Import from a confirmation e-mail')}</h3>
          <p class="text-xs text-[var(--text-secondary)] mt-0.5">${th('คัดลอกข้อความจากอีเมล/แอปจอง แล้ววางที่นี่ ระบบจะอ่านวันเวลา รหัส และราคาให้','Paste the text of a booking e-mail — the app reads the dates, codes and price for you')}</p>
        </div>
      </div>

      <div class="import-drop">
        <div class="input-group">
          <label class="input-label">${icon('clipboard-paste', 'w-3.5 h-3.5')} ${th('ข้อความยืนยันการจอง','Confirmation text')}</label>
          <textarea id="bi-text" class="input import-textarea" placeholder="${th('วางข้อความอีเมลตรงนี้…','Paste the e-mail text here…')}"></textarea>
        </div>
        <div class="flex gap-2 mt-2">
          <button class="btn btn-secondary btn-sm" id="bi-sample">${icon('wand-2', 'w-4 h-4')} ${th('ใส่ตัวอย่าง','Use a sample')}</button>
          <button class="btn btn-primary btn-sm flex-1" id="bi-parse">${icon('scan-text', 'w-4 h-4')} ${th('อ่านข้อความ','Read the text')}</button>
        </div>
      </div>

      <div id="bi-result"></div>

      <div class="flex gap-2">
        <button class="btn btn-secondary flex-1" id="bi-cancel">${t('cancel')}</button>
        <button class="btn btn-primary flex-1" id="bi-save" disabled>${icon('save', 'w-4 h-4')} ${th('บันทึกเป็นการจอง','Save booking')}</button>
      </div>
      <p class="text-[10px] text-[var(--text-tertiary)] text-center">${icon('lock', 'w-3 h-3 inline')} ${th('ข้อความถูกอ่านในเครื่องคุณเท่านั้น ไม่ถูกส่งไปที่ไหน','The text is parsed on your device only — nothing is uploaded')}</p>
    </div>
  `);
  queueIcons();

  const sample = th(
    `การยืนยันการจอง — Thai Airways
เที่ยวบิน TG 615
จาก: Bangkok (BKK) ถึง: Tokyo (NRT)
วันที่ 12 เม.ย. 2569 เวลา 07:45 - 15:20
ที่นั่ง 32A | Confirmation: XT4K9P
ผู้โดยสาร: SOMCHAI P.
ราคารวม 24,500 THB`,
    `Booking confirmation — Thai Airways
Flight TG 615
From: Bangkok (BKK) To: Tokyo (NRT)
Date 12 Apr 2026 07:45 - 15:20
Seat 32A | Confirmation: XT4K9P
Passenger: SOMCHAI P.
Total 24,500 THB`
  );

  function paintResult() {
    const box = document.getElementById('bi-result');
    const saveBtn = document.getElementById('bi-save');
    if (!box) return;
    if (!draft) { box.innerHTML = ''; if (saveBtn) saveBtn.disabled = true; return; }
    const tone = confidenceLabel(draft.confidence);
    const toneVar = tone.tone === 'success' ? 'var(--success)' : tone.tone === 'warning' ? 'var(--warning)' : 'var(--danger)';
    box.innerHTML = `
      <div class="card p-3" style="border-color:color-mix(in srgb, ${toneVar} 40%, var(--border));">
        <div class="flex items-center justify-between gap-2 mb-2">
          <b class="text-xs">${icon('scan-text', 'w-3.5 h-3.5 inline')} ${th('พบข้อมูล','Recognised')}</b>
          <span class="badge text-[10px]" style="background:color-mix(in srgb, ${toneVar} 14%, transparent); color:${toneVar}; border-color:color-mix(in srgb, ${toneVar} 30%, transparent);">${escapeHtml(lang === 'th' ? tone.th : tone.en)} • ${draft.confidence}%</span>
        </div>
        <div class="space-y-1.5">
          ${draft.recognised.map(r => `<div class="parsed-row"><span>${escapeHtml(r.label)}</span><b>${escapeHtml(r.value)}</b></div>`).join('')}
        </div>
      </div>`;
    queueIcons();
    if (saveBtn) saveBtn.disabled = !draft.title;
  }

  bind('bi-sample', 'click', () => {
    const ta = document.getElementById('bi-text');
    if (ta) { ta.value = sample; }
  });
  bind('bi-parse', 'click', () => {
    const text = String(document.getElementById('bi-text')?.value || '');
    if (!text.trim()) return toast.error(th('วางข้อความก่อน แล้วกดอ่าน', 'Paste the text first'));
    draft = parseConfirmationText(text, { baseCurrency: currency, fallbackDate: currentTrip?.startDate || '' });
    paintResult();
    if (!draft.recognised.length) toast.warning(th('อ่านไม่เจอข้อมูล — ลองวางข้อความให้ครบขึ้น', 'Nothing recognised — try pasting more of the e-mail'));
    else toast.success(th(`อ่านได้ ${draft.recognised.length} ฟิลด์`, `Found ${draft.recognised.length} fields`));
  });
  bind('bi-cancel', 'click', () => sheet.close());
  bind('bi-save', 'click', async () => {
    if (!draft) return;
    const tLoad = toast.loading(th('กำลังบันทึก...', 'Saving…'));
    try {
      const payload = draftToReservation(draft, { baseCurrency: currency });
      await createReservation(tripId, payload, currentUser?.uid || null);
      tLoad.close();
      toast.success(th('บันทึกการจองจากอีเมลแล้ว', 'Booking imported'));
      celebrateFrom(null);
      sheet.close();
      if (typeof onSaved === 'function') onSaved(payload);
    } catch (e) {
      tLoad.close();
      toast.error(e.message || String(e));
    }
  });
}

/* ================================================================== *
 * Offline strip — “no wifi, no problem” (v17)
 * ================================================================== */
function initOfflineStrip() {
  const wrap = document.getElementById('offline-strip-wrap');
  if (!wrap) return;
  const paint = () => {
    const offline = (typeof navigator !== 'undefined' && navigator.onLine === false) || syncState.status === 'offline';
    if (!offline) { wrap.hidden = true; wrap.innerHTML = ''; return; }
    wrap.hidden = false;
    wrap.innerHTML = `
      <div class="offline-strip">
        ${icon('wifi-off', 'w-4 h-4')}
        <span class="flex-1 min-w-0">${getLang() === 'th'
          ? 'ออฟไลน์อยู่ — ยังดู/แก้แผนได้ ข้อมูลจะซิงก์ให้เองเมื่อกลับมาออนไลน์'
          : 'You are offline — you can keep editing; changes sync when you are back online'}</span>
        <button class="btn btn-ghost btn-sm" id="offline-retry">${icon('refresh-cw', 'w-3.5 h-3.5')} ${getLang() === 'th' ? 'ลองใหม่' : 'Retry'}</button>
      </div>`;
    queueIcons();
    bind('offline-retry', 'click', () => location.reload());
  };
  window.addEventListener('online', paint);
  window.addEventListener('offline', paint);
  try { syncState.subscribe(paint); } catch { /* older build */ }
  paint();
}

function renderMore(params) {
  const tripId = params.tripId;
  const lang = getLang();
  // v18: ชวนไปที่นี่ / การจอง / เตรียมตัว / ปฏิทินทริป were removed from the menus,
  // and ตั้งค่า is only reachable through the profile picture (top-right).
  const menuItems = [
    { href: '#/trips', icon: 'compass', label: lang==='th' ? 'สลับทริป / ทริปทั้งหมด' : 'Switch trip / All trips', highlight: true },
    { href: `#/trip/${tripId}/dashboard`, icon: 'layout-dashboard', label: t('dashboard') },
    { href: `#/trip/${tripId}/settlement`, icon: 'hand-coins', label: t('settlement') },
    { href: `#/trip/${tripId}/members`, icon: 'users', label: t('members') },
    { href: `#/trip/${tripId}/ideas`, icon: 'lightbulb', label: t('ideas') },
    { href: `#/trip/${tripId}/documents`, icon: 'folder', label: lang==='th' ? 'เอกสารสำคัญ' : 'Documents' },
    { href: `#/trip/${tripId}/import`, icon: 'package', label: t('importExport') },
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
        <button id="share-more" class="card card-hover p-4 w-full flex items-center justify-between gap-3" style="text-decoration:none; border-color: color-mix(in srgb, var(--primary-raw) 30%, var(--border));">
          <span class="flex items-center gap-3">
            <span class="row-icon" style="background:var(--gradient-primary); color:#fff;">${icon('share-2', 'w-4 h-4')}</span>
            <span class="font-semibold text-sm">${lang==='th' ? 'ชวนเพื่อนเข้าทริป / แชร์' : 'Invite friends / share'}</span>
          </span>
          <span style="color: var(--primary-strong);">${icon('chevron-right', 'w-4 h-4')}</span>
        </button>
        <a href="${appBaseUrl()}demo/" target="_blank" rel="noopener" class="card card-hover p-4 flex items-center justify-between gap-3" style="text-decoration:none; color:inherit; border-color: color-mix(in srgb, var(--brand-yellow-raw) 45%, var(--border));">
          <span class="flex items-center gap-3 min-w-0">
            <span class="row-icon" style="background:var(--brand-yellow-tint); color:var(--brand-yellow-ink);">${icon('sparkles', 'w-4 h-4')}</span>
            <span class="min-w-0">
              <span class="font-semibold text-sm block">${lang==='th' ? 'ตัวอย่างฟังก์ชันครบ (demo)' : 'Full-feature demo'}</span>
              <span class="text-[10.5px] text-[var(--text-tertiary)] block">${lang==='th' ? 'เปิดทริปตัวอย่างพร้อมข้อมูลครบ ไม่ต้องล็อกอิน' : 'Sample trip with data — no sign-in needed'}</span>
            </span>
          </span>
          <span class="text-[var(--text-tertiary)]">${icon('external-link', 'w-4 h-4')}</span>
        </a>
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
      <p class="text-center text-[10px] text-[var(--text-tertiary)]">${icon('info', 'w-3 h-3 inline')} ${lang==='th' ? 'แตะโลโก้ซ้ายบนเพื่อไปหน้ารายการทริป • แตะรูปโปรไฟล์ขวาบนเพื่อเปิด “ตั้งค่า”' : 'Tap the logo (top-left) for your trips • tap the profile picture (top-right) for Settings'}</p>
      <p class="build-stamp text-center" data-build-stamp>
        ${icon('sparkles', 'w-3 h-3')} ${escapeHtml(appBuildLabel(lang))}
      </p>
    </div>
  `;
  bind('share-more', 'click', () => openShareSheet(currentTrip));
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
window.addEventListener('unhandledrejection', (e) => { console.error('Unhandled', e); toast.error(e.reason?.message || 'Error'); });
