// Notifications — Firestore layer.
//
//   trips/{tripId}/notifications/{id}   the bell list every member can read
//   users/{uid}/pushPrefs/current       what this account wants pushed (FCM)
//   users/{uid}/pushTokens/{token}      this device's Web-Push registration
//
// Writes are best-effort: a failed notification must NEVER break the action the
// user was doing (saving an expense, recording a transfer, …).
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
    console.warn('[Notifications] saving push prefs failed', e?.code || e?.message);
    return false;
  }
}

export async function loadServerPrefs(uid) {
  if (!db || !uid) return null;
  try {
    const snap = await getDoc(doc(db, `users/${uid}/pushPrefs/current`));
    return snap.exists() ? snap.data() : null;
  } catch (e) {
    console.warn('[Notifications] reading push prefs failed', e?.code || e?.message);
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
    console.warn('[Notifications] saving the push token failed', e?.code || e?.message);
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
    console.warn('[Notifications] removing the push token failed', e?.code || e?.message);
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
  return cachedRead(key, async () => {
    const snap = await getDocs(query(notificationsCol(tripId), orderBy('createdAt', 'desc'), limit(max)));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }, { maxAgeMs: 60 * 1000 });
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
      onNext(list);
    }, (err) => {
      console.warn('[Notifications] live listener failed', err?.code || err?.message);
      onError?.(err);
    });
    return () => { stopped = true; try { unsub(); } catch { /* already gone */ } };
  } catch (e) {
    console.warn('[Notifications] could not subscribe', e?.message);
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
      return id;
    }
    const ref = await addDoc(notificationsCol(tripId), body);
    cacheForget(`notifs:${tripId}`);
    return ref.id;
  } catch (e) {
    console.warn('[Notifications] write failed', e?.code || e?.message);
    return null;
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
    console.warn('[Notifications] mark read failed', e?.code || e?.message);
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
    console.warn('[Notifications] mark-all-read failed', e?.code || e?.message);
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
    console.warn('[Notifications] delete failed', e?.code || e?.message);
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
    console.warn('[Notifications] reading trip settings failed', e?.code || e?.message);
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
    console.warn('[Notifications] recipient lookup failed', e?.code || e?.message);
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
    console.warn('[Notifications] expense ping failed', e?.message);
    return null;
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
  const existing = await getDoc(doc(db, `trips/${tripId}/${COLLECTION}/${id}`)).catch(() => null);
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
    console.warn('[Notifications] transfer ping failed', e?.message);
    return null;
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
