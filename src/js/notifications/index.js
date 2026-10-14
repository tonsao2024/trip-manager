// Notifications — Firestore layer.
//
//   trips/{tripId}/notifications/{id}   the bell list every member can read
//   users/{uid}/pushPrefs/current       what this account wants pushed (FCM)
//   users/{uid}/pushTokens/{token}      this device's Web-Push registration
//
// Writes are best-effort: a failed notification must NEVER break the action the
// user was doing (saving an expense, recording a transfer, …). They are *not*
// silent, though: every failure is pushed to `onNotifyHealth` listeners so the
// UI can say which layer is broken (rules / auth / functions / push / network)
// and how to fix it — see utils/notifications.js → classifyNotifyError.
import { db, serverTimestamp } from '../firebase.js';
import {
  collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc, writeBatch,
  query, orderBy, limit, onSnapshot
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { cachedRead, cacheForget } from '../utils/datacache.js';
import { notifyPrefsStore } from './prefs.js';
import {
  expenseNotificationPayload, dailySummary, dailySummaryId, NOTIFY_PREFS_DEFAULTS,
  normalizePrefs, dayKeyInZone, hourInZone, isDailySummaryId
} from '../utils/notifications.js';

export { NOTIFY_PREFS_DEFAULTS, normalizePrefs } from '../utils/notifications.js';

const COLLECTION = 'notifications';
const MAX_KEPT = 120;   // per trip — the bell shows the newest 50

/* ------------------------------------------------------- health reporting */

/**
 * One channel for “did a read/write work?”, so the UI can *say* something when
 * the answer is no.
 *
 * The user report that made this necessary: “ไม่มีข้อความเลย” — an empty bell
 * with no reason. Every read/write below is still best-effort (a failed
 * notification must never break saving an expense) but the failure is now
 * surfaced to whoever listens instead of only reaching `console.warn`.
 *
 * @param {(event:{ok:boolean, op:string, kind:'read'|'write', tripId:string|null, error:any})=>void} listener
 * @returns {() => void} unsubscribe
 */
const healthListeners = new Set();

export function onNotifyHealth(listener) {
  if (typeof listener !== 'function') return () => {};
  healthListeners.add(listener);
  return () => { healthListeners.delete(listener); };
}

function emitHealth(event) {
  for (const listener of [...healthListeners]) {
    try { listener(event); } catch { /* a broken listener must never break the caller */ }
  }
}

/** Report a failed operation (`kind` tells reads and writes apart for the UI). */
function notifyFailed(error, op, kind, tripId = null) {
  if (error) console.warn(`[Notifications] ${op} failed`, error?.code || error?.message || error);
  emitHealth({ ok: false, op, kind, tripId, error });
  return null;
}

function notifyOk(op, kind, tripId = null) {
  emitHealth({ ok: true, op, kind, tripId, error: null });
  return null;
}

/* ------------------------------------------------------------------ prefs */

/** Preferences of this device (localStorage; mirrors `users/{uid}/pushPrefs`). */
export function readNotifyPrefs() {
  return notifyPrefsStore.read();
}

export function writeNotifyPrefs(patch = {}) {
  return notifyPrefsStore.write(patch);
}

export function clearNotifyPrefs() {
  return notifyPrefsStore.clear();
}

/** Push-relevant prefs of an account, readable by the Cloud Functions. */
export async function saveServerPrefs(uid, prefs = {}) {
  if (!db || !uid) return false;
  const p = normalizePrefs(prefs);
  try {
    await setDoc(doc(db, `users/${uid}/pushPrefs/current`), {
      push: !!p.push,
      enabled: !!p.enabled,
      expense: !!p.expense,
      dailySummary: !!p.dailySummary,
      settlement: !!p.settlement,
      member: !!p.member,
      summaryHour: Number(p.summaryHour) || 20,
      updatedAt: serverTimestamp()
    }, { merge: true });
    return true;
  } catch (e) {
    notifyFailed(e, 'save-prefs', 'write');
    return false;
  }
}

export async function loadServerPrefs(uid) {
  if (!db || !uid) return null;
  try {
    const snap = await getDoc(doc(db, `users/${uid}/pushPrefs/current`));
    return snap.exists() ? snap.data() : null;
  } catch (e) {
    notifyFailed(e, 'load-prefs', 'read');
    return null;
  }
}

/* -------------------------------------------------------------- push tokens */

/** Remember this device's FCM/Web-Push token so the server can reach it. */
export async function registerPushToken(uid, token, meta = {}) {
  if (!db || !uid || !token) return false;
  const id = String(token).slice(0, 120).replace(/[^A-Za-z0-9_.:-]/g, '_');
  try {
    await setDoc(doc(db, `users/${uid}/pushTokens/${id}`), {
      token,
      platform: meta.platform || 'web',
      userAgent: String(meta.userAgent || '').slice(0, 200),
      tripIds: Array.isArray(meta.tripIds) ? meta.tripIds : [],
      enabled: true,
      updatedAt: serverTimestamp()
    }, { merge: true });
    return true;
  } catch (e) {
    notifyFailed(e, 'push-token', 'write');
    return false;
  }
}

export async function removePushToken(uid, token) {
  if (!db || !uid || !token) return false;
  const id = String(token).slice(0, 120).replace(/[^A-Za-z0-9_.:-]/g, '_');
  try {
    await deleteDoc(doc(db, `users/${uid}/pushTokens/${id}`));
    return true;
  } catch (e) {
    notifyFailed(e, 'push-token', 'write');
    return false;
  }
}

/* ------------------------------------------------------------- the bell list */

function notificationsCol(tripId) {
  return collection(db, `trips/${tripId}/${COLLECTION}`);
}

export async function listNotifications(tripId, { max = 50 } = {}) {
  if (!db || !tripId) return [];
  const key = `notifs:${tripId}`;
  try {
    const list = await cachedRead(key, async () => {
      const snap = await getDocs(query(notificationsCol(tripId), orderBy('createdAt', 'desc'), limit(max)));
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }, { maxAgeMs: 60 * 1000 });
    notifyOk('list', 'read', tripId);
    return list;
  } catch (e) {
    notifyFailed(e, 'list', 'read', tripId);
    throw e;   // callers keep their own fallback; the failure is reported either way
  }
}

/** Live list — the bell updates the moment somebody records an expense. */
export function subscribeNotifications(tripId, onNext, { onError = null } = {}) {
  if (!db || !tripId) return () => {};
  let stopped = false;
  const q = query(notificationsCol(tripId), orderBy('createdAt', 'desc'), limit(50));
  try {
    const unsub = onSnapshot(q, (snap) => {
      if (stopped) return;
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      cacheForget(`notifs:${tripId}`);
      notifyOk('subscribe', 'read', tripId);
      onNext(list);
    }, (err) => {
      notifyFailed(err, 'subscribe', 'read', tripId);
      onError?.(err);
    });
    return () => { stopped = true; try { unsub(); } catch { /* already gone */ } };
  } catch (e) {
    notifyFailed(e, 'subscribe', 'read', tripId);
    return () => {};
  }
}

/** Write one notification document. Never throws. */
export async function publishNotification(tripId, payload, { id = null } = {}) {
  if (!db || !tripId || !payload) return null;
  try {
    const body = {
      ...payload,
      readBy: payload.readBy || {},
      createdAt: serverTimestamp()
    };
    if (id) {
      await setDoc(doc(db, `trips/${tripId}/${COLLECTION}/${id}`), body, { merge: true });
      cacheForget(`notifs:${tripId}`);
      notifyOk('publish', 'write', tripId);
      return id;
    }
    const ref = await addDoc(notificationsCol(tripId), body);
    cacheForget(`notifs:${tripId}`);
    notifyOk('publish', 'write', tripId);
    return ref.id;
  } catch (e) {
    return notifyFailed(e, 'publish', 'write', tripId);
  }
}

export async function markRead(tripId, notification, uid) {
  if (!db || !tripId || !notification?.id || !uid) return false;
  if (notification.readBy?.[uid]) return true;
  try {
    await updateDoc(doc(db, `trips/${tripId}/${COLLECTION}/${notification.id}`),
      { readBy: { ...(notification.readBy || {}), [uid]: true } });
    cacheForget(`notifs:${tripId}`);
    return true;
  } catch (e) {
    notifyFailed(e, 'mark-read', 'write', tripId);
    return false;
  }
}

export async function markAllRead(tripId, list = [], uid) {
  if (!db || !tripId || !uid) return 0;
  const unread = list.filter(n => n?.id && !n.readBy?.[uid]);
  if (!unread.length) return 0;
  try {
    const batch = writeBatch(db);
    for (const n of unread) {
      batch.update(doc(db, `trips/${tripId}/${COLLECTION}/${n.id}`),
        { readBy: { ...(n.readBy || {}), [uid]: true } });
    }
    await batch.commit();
    cacheForget(`notifs:${tripId}`);
    return unread.length;
  } catch (e) {
    notifyFailed(e, 'mark-all-read', 'write', tripId);
    return 0;
  }
}

/** Only trip admins may delete (the rules enforce the same thing). */
export async function deleteNotification(tripId, id) {
  if (!db || !tripId || !id) return false;
  try {
    await deleteDoc(doc(db, `trips/${tripId}/${COLLECTION}/${id}`));
    cacheForget(`notifs:${tripId}`);
    return true;
  } catch (e) {
    notifyFailed(e, 'delete', 'write', tripId);
    return false;
  }
}

/** Best-effort cleanup so the collection cannot grow forever. */
export async function pruneNotifications(tripId, list = [], { keep = MAX_KEPT } = {}) {
  if (!db || !tripId || list.length <= keep) return 0;
  const doomed = [...list]
    .sort((a, b) => new Date(a.createdAt?.seconds ? a.createdAt.seconds * 1000 : a.createdAt || 0)
      - new Date(b.createdAt?.seconds ? b.createdAt.seconds * 1000 : b.createdAt || 0))
    .slice(0, list.length - keep);
  let removed = 0;
  for (const n of doomed) {
    if (isDailySummaryId(n.id)) continue; // daily summaries are the history — keep them
    if (await deleteNotification(tripId, n.id)) removed += 1;
  }
  return removed;
}

/* ----------------------------------------------------------- trip settings */

/** Trip-wide notification settings (admin-writable, member-readable). */
export async function loadTripNotifySettings(tripId) {
  if (!db || !tripId) return {};
  try {
    const snap = await getDoc(doc(db, `trips/${tripId}/settings/notifications`));
    return snap.exists() ? snap.data() : {};
  } catch (e) {
    notifyFailed(e, 'trip-settings', 'read', tripId);
    return {};
  }
}

export async function saveTripNotifySettings(tripId, patch = {}) {
  if (!db || !tripId) throw new Error('DB not ready');
  await setDoc(doc(db, `trips/${tripId}/settings/notifications`), {
    ...patch,
    updatedAt: serverTimestamp()
  }, { merge: true });
  return true;
}

/* ------------------------------------------------------------- producers */

/** Every member of the trip except the author (uses the trip doc, 1 cached read). */
export async function recipientIds(tripId, { exclude = [] } = {}) {
  if (!db || !tripId) return [];
  try {
    const trip = await cachedRead(`trip:${tripId}`, async () => {
      const snap = await getDoc(doc(db, 'trips', tripId));
      return snap.exists() ? { id: snap.id, ...snap.data() } : null;
    }, { maxAgeMs: 5 * 60 * 1000 });
    const ids = new Set(Array.isArray(trip?.memberUids) ? trip.memberUids : []);
    if (trip?.createdBy) ids.add(trip.createdBy);
    exclude.filter(Boolean).forEach(id => ids.delete(id));
    return [...ids];
  } catch (e) {
    notifyFailed(e, 'recipients', 'read', tripId);
    return [];
  }
}

/**
 * “บันทึกค่าใช้จ่ายแล้ว” → ping every other member of the trip.
 * Called after a successful expense write (see expenses/index.js).
 */
export async function notifyExpenseCreated(tripId, { expense, author = {}, members = null, lang = 'th' } = {}) {
  if (!db || !tripId || !expense) return null;
  const prefs = readNotifyPrefs();
  // Only “notifications off for this device” stops the message being written:
  // the recipients filter by their OWN preferences (bell + push).
  if (!prefs.enabled) return null;
  try {
    let list = members;
    if (!list) {
      const ids = await recipientIds(tripId, { exclude: [author.id] });
      list = ids.map(id => ({ id }));
    }
    const payload = expenseNotificationPayload({
      tripId, expense, authorId: author.id || '', authorName: author.name || '', members: list, lang
    });
    if (!payload) return null;
    return await publishNotification(tripId, { ...payload, createdBy: author.id || expense.createdBy || null });
  } catch (e) {
    return notifyFailed(e, 'expense-ping', 'write', tripId);
  }
}

/**
 * Daily expense summary — one document per trip per day, written by whichever
 * client opens the trip first after the summary hour (Cloud Functions write the
 * same document when the app stays closed).
 */
export async function ensureDailySummary(tripId, { expenses = [], members = [], trip = null, uid = '', lang = 'th', byName = '', prefs = null } = {}) {
  if (!db || !tripId || !uid) return null;
  const p = prefs ? normalizePrefs(prefs) : readNotifyPrefs();
  // The document is the trip's shared history — every device filters what it
  // shows/notifies with its own preferences.
  if (!p.enabled) return null;
  const timeZone = trip?.timezone || null;
  const today = dayKeyInZone(new Date(), timeZone);
  const settings = await loadTripNotifySettings(tripId).catch(() => ({}));
  const summaryHour = Number(settings.summaryHour ?? p.summaryHour) || 0;
  if (hourInZone(new Date(), timeZone) < summaryHour) return null;

  const id = dailySummaryId(today);
  const existing = await getDoc(doc(db, `trips/${tripId}/${COLLECTION}/${id}`))
    .catch((e) => { notifyFailed(e, 'daily-summary', 'read', tripId); return null; });
  if (existing?.exists?.()) return { id, created: false };

  const summary = dailySummary({ expenses, members, day: today, trip, myId: uid, lang, byName });
  if (!summary) return null;   // nothing was spent that day → stay quiet
  const recipients = members.length ? members.filter(m => m.status !== 'inactive').map(m => m.id) : await recipientIds(tripId);
  const written = await publishNotification(tripId, { ...summary, recipients, createdBy: uid }, { id });
  return written ? { id: written, created: true, summary } : null;
}

/** “จ่ายแล้ว” — the member who receives the money gets a heads-up. */
export async function notifyTransferRecorded(tripId, { transfer, memberNameOf = (id) => id, author = {}, lang = 'th' } = {}) {
  if (!db || !tripId || !transfer) return null;
  const prefs = readNotifyPrefs();
  if (!prefs.enabled) return null;
  try {
    const amount = `฿${(Number(transfer.amountMinor || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const from = memberNameOf(transfer.fromId) || transfer.fromId;
    const to = memberNameOf(transfer.toId) || transfer.toId;
    return await publishNotification(tripId, {
      type: 'settlement',
      date: dayKeyInZone(),
      title: lang === 'th' ? `บันทึกการโอน ${amount}` : `Transfer recorded ${amount}`,
      body: lang === 'th' ? `${from} โอนให้ ${to} แล้ว — อัปเดตยอดเคลียร์บิล` : `${from} paid ${to} — settlement updated`,
      amountMinor: Number(transfer.amountMinor) || 0,
      currency: 'THB',
      link: `#/trip/${tripId}/settlement`,
      recipients: [transfer.fromId, transfer.toId].filter(Boolean),
      readBy: {},
      createdBy: author.id || null,
      createdByName: author.name || ''
    });
  } catch (e) {
    return notifyFailed(e, 'transfer-ping', 'write', tripId);
  }
}

/** Settings → “ส่งการแจ้งเตือนทดสอบ” (in-app + Web Push when it is enabled). */
export async function sendTestNotification(tripId, { uid, name = '', lang = 'th' } = {}) {
  const day = dayKeyInZone();
  return publishNotification(tripId, {
    type: 'test',
    date: day,
    title: lang === 'th' ? 'ทดสอบการแจ้งเตือน ✅' : 'Test notification ✅',
    body: lang === 'th'
      ? 'ถ้าคุณเห็นข้อความนี้ การแจ้งเตือนในแอปทำงานแล้ว — และจะเด้งเป็น Web Push ด้วยถ้าเปิดไว้'
      : 'If you can read this, in-app notifications work — and Web Push will fire too when it is enabled.',
    link: `#/trip/${tripId}/dashboard`,
    recipients: [uid].filter(Boolean),
    readBy: {},
    createdBy: uid,
    createdByName: name
  });
}

/* --------------------------------------------------------------- self test */

/**
 * Write → read → delete probe used by Settings → ตรวจสอบระบบ.
 *
 * Answers *which* layer is dead instead of a bare true/false:
 *   read  — the exact query the bell uses (`orderBy createdAt desc`), so a
 *           `permission-denied` here means the published rules have no
 *           `trips/{tripId}/notifications` block (or the session has no auth).
 *   write — one temporary document; only trip admins may delete it, so the
 *           write probe is skipped (`write: null`) for everybody else.
 *
 * @returns {Promise<{read:{ok:boolean,code:string,message:string}, write:null|{ok:boolean,code:string,message:string}, cleaned:boolean}>}
 */
export async function probeNotifications(tripId, { uid = '', canDelete = false, lang = 'th' } = {}) {
  const out = { read: { ok: false, code: '', message: '' }, write: null, cleaned: true };
  if (!db || !tripId) {
    out.read.message = lang === 'th' ? 'ยังไม่มีฐานข้อมูล/ทริปให้ตรวจ' : 'No database/trip to check';
    return out;
  }

  try {
    await getDocs(query(notificationsCol(tripId), orderBy('createdAt', 'desc'), limit(1)));
    out.read = { ok: true, code: '', message: '' };
  } catch (e) {
    out.read = { ok: false, code: String(e?.code || ''), message: String(e?.message || e || '') };
  }

  if (!canDelete) return out;   // the probe document must stay removable

  try {
    const ref = await addDoc(notificationsCol(tripId), {
      type: 'diagnostic',
      date: dayKeyInZone(),
      title: lang === 'th' ? 'ตรวจสอบระบบ: ทดสอบการแจ้งเตือน (ลบอัตโนมัติ)' : 'System check: notification test (auto-deleted)',
      body: lang === 'th'
        ? 'ข้อความนี้ถูกสร้างโดยหน้าตรวจสอบระบบ และจะถูกลบทันที — ถ้าคุณเห็นค้างอยู่ แสดงว่าการลบไม่ผ่านสิทธิ์'
        : 'This document was created by the System check and is deleted immediately — if you can still see it, deleting failed.',
      recipients: [],
      readBy: {},
      createdBy: uid || null,
      createdAt: serverTimestamp()
    });
    out.write = { ok: true, code: '', message: '' };
    try {
      await deleteDoc(ref);
      cacheForget(`notifs:${tripId}`);
    } catch (e) {
      out.cleaned = false;
      out.write.message = String(e?.message || e || '');
    }
  } catch (e) {
    out.write = { ok: false, code: String(e?.code || ''), message: String(e?.message || e || '') };
  }
  return out;
}
