import { db, storage, functions, httpsCallable, serverTimestamp, isStorageAvailable } from '../firebase.js';
import { getJoinedTrip, listJoinTargets, forgetJoinTarget } from '../members/join.js';
import { brandPrimary } from '../utils/brand.js';
import { deleteTransfer } from '../settlement/transfers.js';
import { collection, collectionGroup, doc, getDoc, getDocFromServer, getDocs, getDocsFromServer, addDoc, setDoc, updateDoc, deleteDoc, writeBatch, runTransaction, query, where, limit, startAfter, arrayUnion, arrayRemove, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { missingMemberUids, mergeTripsById, tripIdFromMemberPath, isInactiveMember } from '../utils/memberUids.js';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js';
import { compressImage } from '../utils/helpers.js';
import { normalizeCoverPosition } from '../utils/coverPosition.js';
import { generateInviteCode, normalizeInviteCode, isValidInviteCode } from '../utils/invite.js';
import { cachedRead, cacheInvalidate, cacheForget, cacheClear, cacheSet, seedFromPersist, persistSet, persistDelete } from '../utils/datacache.js';

const TRIPS_CACHE_KEY = 'fuji_trips_cache';
const CACHE_TTL = 10 * 60 * 1000;

/**
 * Cached trip list.
 * `uid` makes the cache user-scoped: signing in with another account in the same
 * browser must never show the previous account's trips.
 */
function getCachedTrips(uid = null) {
  try {
    const cached = localStorage.getItem(TRIPS_CACHE_KEY);
    if (!cached) return null;
    const { data, timestamp, uid: cachedUid } = JSON.parse(cached);
    if (uid && cachedUid !== uid) return null;   // per-account cache (legacy entries are ignored)
    if (Date.now() - timestamp > CACHE_TTL) return null;
    return data;
  } catch { return null; }
}

function setCachedTrips(trips, uid = null) {
  try {
    localStorage.setItem(TRIPS_CACHE_KEY, JSON.stringify({ data: trips, timestamp: Date.now(), uid: uid || undefined }));
  } catch {}
}

function getCachedTripsTimestamp() {
  try {
    const cached = localStorage.getItem(TRIPS_CACHE_KEY);
    return cached ? JSON.parse(cached).timestamp : 0;
  } catch { return 0; }
}

// One in-flight refresh per account. Sharing a single promise across users meant
// a second account could be handed the first account's trip list while its own
// read was still running — and then see trips it had never joined.
const tripsRefreshPromises = new Map();
/** Silent re-read of the trip list (used when the cached list is still shown). */
function refreshTripsInBackground(userId, isSuperAdmin) {
  const key = String(userId || 'anon');
  if (tripsRefreshPromises.has(key)) return tripsRefreshPromises.get(key);
  const promise = fetchTripsFromServer(userId, isSuperAdmin)
    .then((trips) => {
      if (!trips?.incomplete) setCachedTrips(trips || [], userId);
      window.dispatchEvent(new CustomEvent('trips:updated', { detail: { userId, trips: trips || [] } }));
      return trips;
    })
    .catch((e) => { console.warn('background trip refresh failed', e?.message || e); return null; })
    .finally(() => { tripsRefreshPromises.delete(key); });
  tripsRefreshPromises.set(key, promise);
  return promise;
}

function clearTripsCacheInternal() {
  try { localStorage.removeItem(TRIPS_CACHE_KEY); } catch {}
}

/** Trip docs live in memory too — menus used to fetch them on every tap. */
const TRIP_TTL = 5 * 60 * 1000;
const tripKey = (tripId) => `trip:${tripId}`;
function invalidateTrip(tripId) {
  cacheForget('trip:');
  cacheForget(`cats:${tripId}`);
  persistDelete('trip:');
  persistDelete(`cats:${tripId}`);
  clearTripsCacheInternal();
}

function invitePreviewData(tripId, trip) {
  return {
    tripId,
    name: String(trip?.name || ''),
    startDate: String(trip?.startDate || ''),
    endDate: String(trip?.endDate || '')
  };
}

function permissionDenied(error) {
  return String(error?.code || '').includes('permission-denied')
    || /missing or insufficient permissions/i.test(String(error?.message || ''));
}

/**
 * A failure that only deploying the current rules/indexes can fix.
 * Used to decide whether the trip list error should tell the user to deploy
 * (`permission-denied`, missing composite/collection-group index) or to check
 * the connection instead — the old single message told everybody both.
 */
function deployFixableFailure(error) {
  const code = String(error?.code || '');
  const message = String(error?.message || '');
  return permissionDenied(error)
    || code.includes('failed-precondition')
    || /requires an index|create.*index|no matching index/i.test(message);
}

async function uniqueInviteCode(except = null) {
  for (let attempt = 0; attempt < 12; attempt++) {
    const candidate = generateInviteCode();
    if (candidate === except) continue;
    try {
      const existing = await getDoc(doc(db, 'publicTripInvites', candidate));
      if (!existing.exists()) return candidate;
    } catch (e) {
      // Before the new rules are published, this collection is not yet readable.
      if (permissionDenied(e)) return candidate;
      throw e;
    }
  }
  throw new Error('รหัสเชิญซ้ำหลายครั้ง — ลองใหม่อีกครั้ง');
}

function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * The trips of this account.
 *
 * When a cached list exists it is returned immediately (the trips menu is the
 * first screen after login) and refreshed in the background, so a slow Firestore
 * query can never hold the screen for up to 3 × 10 s timeouts.
 */
export async function listTrips(userId, isSuperAdmin = false, { maxAgeMs = 2 * 60 * 1000, fresh = false } = {}) {
  if (!db) throw new Error('DB not ready - Firebase not configured');
  if (!userId) throw new Error('User not authenticated');
  if (fresh) return fetchTripsFromServer(userId, isSuperAdmin, { allowCache: false });

  const cached = getCachedTrips(userId);
  if (cached?.length) {
    const age = Date.now() - (getCachedTripsTimestamp() || 0);
    if (age > maxAgeMs) refreshTripsInBackground(userId, isSuperAdmin);
    return cached;
  }

  return fetchTripsFromServer(userId, isSuperAdmin);
}

async function fetchTripsFromServer(userId, isSuperAdmin = false, { allowCache = true } = {}) {
  const cached = allowCache ? getCachedTrips(userId) : null;
  // Every read below is page-by-page, so someone in more than 30 trips still
  // sees the oldest one. A trip list silently cut at 30 looked like lost data.
  //
  // This used to be 8 because the trips `list` rule did exists()+get() on
  // `members/{uid}` for every returned trip and Firestore allows only 10
  // document access calls per query — a member with a few trips then got
  // permission-denied for the *whole* list and saw no trips at all. The rule is
  // now decided from the trip document alone (see firestore.rules), so the page
  // can be a normal size again and the count of trips no longer matters.
  const PAGE = 30;
  const readAllPages = async (baseQuery, label, timeoutMs) => {
    const out = [];
    let cursor = null;
    for (;;) {
      const q = cursor ? query(baseQuery, startAfter(cursor), limit(PAGE)) : query(baseQuery, limit(PAGE));
      const snap = await Promise.race([
        (allowCache ? getDocs : getDocsFromServer)(q),
        new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout ${label}`)), timeoutMs))
      ]);
      out.push(...snap.docs.map(d => ({ id: d.id, ...d.data() })));
      if (snap.docs.length < PAGE) break;
      cursor = snap.docs[snap.docs.length - 1];
      if (!cursor) break;
    }
    return out;
  };

  // Super admin can list all trips; regular users query only their own/member trips
  if (isSuperAdmin) {
    try {
      // Paged as well: a super admin with more than 50 trips was seeing a
      // silently truncated list.
      const allTrips = await readAllPages(query(collection(db, 'trips')), 'all', 4000);
      if (allTrips.length) { setCachedTrips(allTrips, userId); return allTrips; }
    } catch (e) {
      if (e.code === 'permission-denied' && cached?.length) return cached;
    }
  }

  // The sources below are MERGED, never alternatives. The old code returned
  // as soon as one query found something, so a member who had also created a
  // trip (or vice versa) silently lost the other trips — and when the
  // `memberUids` array had drifted from the member documents (see
  // utils/memberUids.js) the member's list came back empty while the admin,
  // reading the member documents, still saw everybody.
  const failures = [];
  const noteFailure = (e) => {
    failures.push(e);
    console.warn('trip list query failed', e?.code || e?.message || e);
  };

  // Source 1: array-contains on memberUids (indexed, scoped to the signed-in user)
  let listedTrips = [];
  try {
    listedTrips = await readAllPages(query(collection(db, 'trips'), where('memberUids', 'array-contains', userId)), 'memberUids', 5000);
  } catch (e) { noteFailure(e); }

  // Source 2: trips this account created (scoped to the signed-in user). A
  // brand-new account has no trips yet — that is an empty list, not an error.
  let createdTrips = [];
  try {
    createdTrips = await readAllPages(query(collection(db, 'trips'), where('createdBy', '==', userId)), 'createdBy', 5000);
  } catch (e) { noteFailure(e); }

  // Source 3: the member documents themselves. `trips/{id}/members/{uid}` is
  // the record the admin sees; finding trips through it makes the list immune
  // to a stale/missing `memberUids` entry. Each candidate is then read as a
  // normal trip document (the rules allow that read for a real member), and a
  // trip found this way gets its `memberUids` entry restored when possible.
  let discoveredTrips = [];
  try {
    const discovery = await discoverTripsByMemberDocs(userId, new Set(
      [...listedTrips, ...createdTrips].map(t => t.id)
    ));
    discoveredTrips = discovery.trips;
    failures.push(...discovery.failures);
  } catch (e) {
    noteFailure(e);
  }

  // Source 4: submitted requests + remembered join targets give us exact trip IDs.
  // Use permission-checked server document reads for those IDs even if list
  // rules/indexes or member discovery failed, and repair `memberUids` on the way.
  const knownTrips = mergeTripsById(listedTrips, createdTrips, discoveredTrips);
  const knownIds = new Set(knownTrips.map(t => t.id));
  const requestTrips = [];
  try {
    const discovery = await discoverTripsFromJoinTargets(userId, knownIds);
    requestTrips.push(...discovery.trips);
    failures.push(...discovery.failures);
  } catch (e) { noteFailure(e); }
  const trips = mergeTripsById(knownTrips, requestTrips);
  if (trips.length) {
    if (failures.length) Object.defineProperty(trips, 'incomplete', { value: true });
    else setCachedTrips(trips, userId);
    return trips;
  }
  if (cached?.length) return cached;
  // A successful creator query is not evidence that the membership query also
  // succeeded. Never label an incomplete lookup as an account with no trips.
  if (failures.length) {
    const error = new Error('Some trips could not be checked');
    error.code = 'trip-list-incomplete';
    error.cause = failures[0];
    // The UI needs to say *what* failed (missing index / denied rules / offline)
    // instead of repeating one message for every cause.
    error.details = failures.map(f => ({ code: f?.code || null, message: String(f?.message || f || '') }));
    error.requiresDeploy = failures.some(deployFixableFailure);
    error.network = !error.requiresDeploy;
    throw error;
  }
  return trips;
}

/**
 * Restore this account's own `memberUids` entry on a trip it can already read.
 * The rules allow exactly one entry — the caller's own — and nothing else, so a
 * member can only ever repair their own listing (see `memberMayRestoreOwnListing`
 * in firestore.rules). Under older rules the write is denied and retried the
 * next time the trip list is loaded.
 */
async function restoreOwnListing(trip, userId) {
  if (!trip?.id || !userId) return false;
  if (Array.isArray(trip.memberUids) && trip.memberUids.includes(userId)) return false;
  try {
    await updateDoc(doc(db, 'trips', trip.id), {
      memberUids: arrayUnion(userId), updatedAt: serverTimestamp()
    });
    trip.memberUids = [...(Array.isArray(trip.memberUids) ? trip.memberUids : []), userId];
    return true;
  } catch (e) {
    console.warn('memberUids self-repair failed (rules not published yet?)', e?.code || e?.message);
    return false;
  }
}

/**
 * Trips found through this account's own join requests (source 4).
 *
 * Only reads: for each remembered/ mirrored trip id, read the trip document
 * from the server. `isTripMember` allows that read exactly when the membership
 * is real (member document present and not inactive), so an approval that
 * landed shows up here even while `memberUids`/indexes are broken, and a
 * request the admin has not approved yet stays invisible.
 */
async function discoverTripsFromJoinTargets(userId, knownIds = new Set()) {
  const trips = [];
  const failures = [];
  if (!db || !userId) return { trips, failures };
  let tripIds = [];
  try {
    tripIds = (await listJoinTargets(userId)).filter(id => !knownIds.has(id));
  } catch (e) {
    console.warn('join targets unavailable', e?.code || e?.message || e);
    return { trips, failures };
  }
  const results = await Promise.allSettled(tripIds.map(id => getJoinedTrip(id, userId)));
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const tripId = tripIds[i];
    if (result.status === 'fulfilled' && result.value) {
      const trip = result.value;
      await restoreOwnListing(trip, userId);
      forgetJoinTarget(userId, tripId);
      trips.push(trip);
    } else if (result.status === 'rejected') {
      failures.push(result.reason);
    }
  }
  return { trips, failures };
}

/**
 * Find trips through this account's member documents (collection group over
 * every `members` subcollection), for member docs whose `memberUids` entry on
 * the trip document is missing. Returns full trip documents; inactive member
 * documents never grant a trip. Best-effort self-repair: a trip found here is
 * missing the caller's uid in `memberUids`, so the entry is restored (the
 * rules allow a member to restore *their own* listing only; under older rules
 * the write is denied and simply retried on the next sign-in).
 */
async function discoverTripsByMemberDocs(userId, knownTripIds = new Set()) {
  if (!db || !userId || typeof collectionGroup !== 'function') {
    return { trips: [], failures: [new Error('Member discovery is unavailable')] };
  }
  const tripIds = new Set(knownTripIds);
  const failures = [];
  const candidates = new Map(); // tripId -> member document data
  // Account members are keyed by `uid`; a local member linked to an account
  // later is found through `authUid` instead (see utils/memberUids.js).
  for (const field of ['uid', 'authUid']) {
    try {
      const snap = await getDocs(query(collectionGroup(db, 'members'), where(field, '==', userId)));
      for (const memberDoc of snap.docs) {
        const data = memberDoc.data() || {};
        // Same definition of “revoked” as the rules and the member roster:
        // `inactive` (current) and the legacy `disabled` spelling.
        if (isInactiveMember(data)) continue;
        const tripId = tripIdFromMemberPath(memberDoc.ref?.path || '');
        if (tripId && !candidates.has(tripId)) candidates.set(tripId, data);
      }
    } catch (e) {
      // One missing index or denied query must not discard results from the other.
      console.warn(`member-document discovery (${field}) unavailable`, e?.code || e?.message || e);
      failures.push(e);
    }
  }

  const trips = [];
  for (const tripId of candidates.keys()) {
    if (tripIds.has(tripId)) continue;
    try {
      const snap = await getDoc(doc(db, 'trips', tripId));
      if (!snap.exists()) continue;
      const trip = { id: snap.id, ...snap.data() };
      trips.push(trip);
      await restoreOwnListing(trip, userId);
    } catch (e) {
      // Not actually readable (inactive/removed member, rules not yet
      // published): skip this candidate, never fail the whole list.
      console.warn('discovered trip not readable', tripId, e?.code || e?.message);
      failures.push(e);
    }
  }
  return { trips, failures };
}

/** Repair missing member UIDs without reviving a removed or inactive member. */
export async function reconcileTripMemberUids(tripId, members) {
  if (!db || !tripId) return [];
  const tripRef = doc(db, 'trips', tripId);
  // Never make an authorization repair from the app's cached trip snapshot.
  const latest = await getDocFromServer(tripRef);
  if (!latest.exists()) throw new Error('ไม่พบทริปที่ต้องการซ่อมรายชื่อ');
  const listed = latest.data().memberUids;
  const candidates = (members || []).filter(member =>
    typeof member.id === 'string' && member.id && !member.id.includes('/') &&
    missingMemberUids(listed, [member]).length > 0
  );
  if (!candidates.length) return [];

  // Re-read candidate documents inside a transaction: if an admin removes or
  // deactivates somebody concurrently, Firestore retries with their new state.
  const added = await runTransaction(db, async (tx) => {
    const tripSnap = await tx.get(tripRef);
    if (!tripSnap.exists()) throw new Error('ไม่พบทริปที่ต้องการซ่อมรายชื่อ');
    const memberSnaps = await Promise.all(candidates.map(member =>
      tx.get(doc(db, 'trips', tripId, 'members', member.id))
    ));
    const current = memberSnaps.filter(snap => snap.exists())
      .map(snap => ({ ...snap.data(), id: snap.id }));
    const missing = missingMemberUids(tripSnap.data().memberUids, current);
    if (missing.length) tx.update(tripRef, {
      memberUids: arrayUnion(...missing), updatedAt: serverTimestamp()
    });
    return missing;
  });
  if (added.length) invalidateTrip(tripId);
  return added;
}

/** New code for a trip that was created before invite codes existed, or to revoke one. */
export async function regenerateInviteCode(tripId) {
  if (!db) throw new Error('DB not ready');
  const tripRef = doc(db, 'trips', tripId);
  const snap = await getDoc(tripRef);
  if (!snap.exists()) throw new Error('Trip not found');
  const previous = snap.data();
  const oldCode = normalizeInviteCode(previous.inviteCode);
  const code = await uniqueInviteCode(oldCode);
  const next = { ...previous, inviteCode: code, inviteEnabled: true };
  const batch = writeBatch(db);
  batch.update(tripRef, { inviteCode: code, inviteEnabled: true, updatedAt: serverTimestamp() });
  if (oldCode && oldCode !== code) {
    try {
      const oldPreview = await getDoc(doc(db, 'publicTripInvites', oldCode));
      if (oldPreview.exists()) batch.delete(doc(db, 'publicTripInvites', oldCode));
    } catch (e) {
      if (!permissionDenied(e)) throw e;
    }
  }
  batch.set(doc(db, 'publicTripInvites', code), invitePreviewData(tripId, next));
  try {
    await batch.commit();
  } catch (e) {
    // Compatibility while an older ruleset is still live. The server lookup
    // lazily backfills the minimal preview after the rules are upgraded.
    if (!permissionDenied(e)) throw e;
    await updateDoc(tripRef, { inviteCode: code, inviteEnabled: true, updatedAt: serverTimestamp() });
  }
  invalidateTrip(tripId);
  return code;
}

export async function setInviteEnabled(tripId, enabled) {
  if (!db) throw new Error('DB not ready');
  const tripRef = doc(db, 'trips', tripId);
  const snap = await getDoc(tripRef);
  if (!snap.exists()) throw new Error('Trip not found');
  const current = snap.data();
  const oldCode = normalizeInviteCode(current.inviteCode);
  const code = oldCode || (enabled ? await uniqueInviteCode() : '');
  const next = { ...current, inviteCode: code || current.inviteCode, inviteEnabled: Boolean(enabled) };
  const batch = writeBatch(db);
  batch.update(tripRef, {
    ...(code && code !== current.inviteCode ? { inviteCode: code } : {}),
    inviteEnabled: Boolean(enabled),
    updatedAt: serverTimestamp()
  });
  if (enabled && code) batch.set(doc(db, 'publicTripInvites', code), invitePreviewData(tripId, next));
  else if (oldCode) {
    try {
      const oldPreview = await getDoc(doc(db, 'publicTripInvites', oldCode));
      if (oldPreview.exists()) batch.delete(doc(db, 'publicTripInvites', oldCode));
    } catch (e) {
      if (!permissionDenied(e)) throw e;
    }
  }
  try {
    await batch.commit();
  } catch (e) {
    if (!permissionDenied(e)) throw e;
    await updateDoc(tripRef, {
      ...(code && code !== current.inviteCode ? { inviteCode: code } : {}),
      inviteEnabled: Boolean(enabled),
      updatedAt: serverTimestamp()
    });
  }
  invalidateTrip(tripId);
}

/** Trip lookup returns only the safe preview document, never a trip list. */
export async function findTripByInviteCode(code) {
  if (!db) throw new Error('DB not ready');
  if (!isValidInviteCode(code)) throw new Error('รหัสเชิญต้องมี 6 ตัวอักษร');
  const norm = normalizeInviteCode(code);
  try {
    const snap = await getDoc(doc(db, 'publicTripInvites', norm));
    if (snap.exists()) {
      const data = snap.data();
      return { id: data.tripId, name: data.name || '', startDate: data.startDate || '', endDate: data.endDate || '' };
    }
  } catch (e) {
    if (!permissionDenied(e)) throw e;
  }
  if (!functions) return null;
  const result = await httpsCallable(functions, 'lookupTripByInviteCode')({ code: norm });
  const trip = result?.data?.trip;
  return trip?.tripId
    ? { id: trip.tripId, name: trip.name || '', startDate: trip.startDate || '', endDate: trip.endDate || '' }
    : null;
}

async function fetchTrip(tripId) {
  if (!db) throw new Error('DB not ready');
  const ref = doc(db, 'trips', tripId);
  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error('Trip not found');
    return { id: snap.id, ...snap.data() };
  } catch (e) {
    // A legacy device-only session has no Firebase Auth token, so it can only
    // show a trip already cached on this device; Firestore reads/writes still require Auth.
    const cached = getCachedTrips()?.find(t => t.id === tripId);
    if (cached && (e.code === 'permission-denied' || /permission/i.test(e.message || ''))) {
      console.warn('getTrip permission-denied → using cached trip', tripId);
      return cached;
    }
    throw e;
  }
}

/**
 * Read one trip. Served from the stale-while-revalidate cache so switching menus
 * is instant; every trip write clears the entry.
 * @param {string} tripId
 * @param {{fresh?: boolean}} [options] `fresh` forces a server read (pull-to-refresh)
 */
export async function getTrip(tripId, { fresh = false } = {}) {
  if (!tripId) throw new Error('Missing trip id');
  const key = tripKey(tripId);
  if (fresh) { cacheForget(key); persistDelete(key); }
  // After a reload the last known trip paints instantly and refreshes behind.
  else seedFromPersist(key);
  const trip = await cachedRead(key, () => fetchTrip(tripId), { maxAgeMs: TRIP_TTL });
  persistSet(key, trip);
  return trip;
}

/** Live trip document updates (dashboard layout, default map, and trip details). */
export function subscribeTrip(tripId, callback, onError = null) {
  if (!db || !tripId || typeof callback !== 'function') return () => {};
  const key = tripKey(tripId);
  return onSnapshot(doc(db, 'trips', tripId), (snap) => {
    if (!snap?.exists?.()) return;
    const trip = { id: snap.id, ...snap.data() };
    cacheSet(key, trip);
    persistSet(key, trip);
    callback(trip);
  }, (err) => {
    console.warn('subscribeTrip failed:', err?.message || err);
    onError?.(err);
  });
}

export async function uploadCoverImage(tripId, fileOrBlob, userId) {
  if (!fileOrBlob) return '';
  if (!storage || !isStorageAvailable) {
    try {
      const blob = fileOrBlob instanceof File ? await compressImage(fileOrBlob, 800, 0.7) : fileOrBlob;
      if (blob.size > 800 * 1024) {
        const extraCompressed = await compressImage(new File([blob], 'cover.webp', { type: 'image/webp' }), 600, 0.6);
        if (extraCompressed.size > 800 * 1024) throw new Error('Image too large');
        return await blobToDataURL(extraCompressed);
      }
      return await blobToDataURL(blob);
    } catch (e) {
      console.warn('Base64 fallback failed:', e);
      return '';
    }
  }
  try {
    let blobToUpload = fileOrBlob;
    if (fileOrBlob instanceof File) {
      blobToUpload = await compressImage(fileOrBlob, 1280, 0.85);
    }
    const fileName = `cover_${Date.now()}.webp`;
    const ref = storageRef(storage, `trips/${tripId}/covers/${fileName}`);
    await uploadBytes(ref, blobToUpload);
    const url = await getDownloadURL(ref);
    return url;
  } catch (e) {
    console.error('Upload cover failed:', e);
    if (e.code && (e.code.includes('storage/') || e.code === 'permission-denied' || e.message.includes('storage'))) {
      try {
        const blob = fileOrBlob instanceof File ? await compressImage(fileOrBlob, 800, 0.7) : fileOrBlob;
        if (blob.size > 800 * 1024) return '';
        return await blobToDataURL(blob);
      } catch (fallbackErr) {
        return '';
      }
    }
    throw new Error('Upload cover failed: ' + e.message);
  }
}

export async function createTrip(data, userId) {
  if (!db) throw new Error('DB not ready');
  if (!userId) throw new Error('User not authenticated');
  if (!data.name || !data.name.trim()) throw new Error('กรุณากรอกชื่อทริป');
  if (!data.startDate || !data.endDate) throw new Error('กรุณาเลือกวันเริ่มและสิ้นสุด');
  
  let coverImageUrl = data.coverImage || data.coverUrl || '';
  let coverFileForUpload = data.coverFile || null;
  let coverBlobForUpload = data.coverBlob || null;
  
  if (data.coverUrl && data.coverUrl.startsWith('http')) {
    coverImageUrl = data.coverUrl;
    coverFileForUpload = null;
    coverBlobForUpload = null;
  }
  
  if ((coverFileForUpload || coverBlobForUpload) && (!storage || !isStorageAvailable)) {
    try {
      const blob = coverBlobForUpload || coverFileForUpload;
      const dataUrl = await blobToDataURL(blob instanceof File ? await compressImage(blob, 800, 0.7) : blob);
      if (dataUrl.length < 900 * 1024) {
        coverImageUrl = dataUrl;
        coverFileForUpload = null;
        coverBlobForUpload = null;
      }
    } catch (e) {
      console.warn('Free tier base64 prep failed:', e);
    }
  }
  
  const payload = {
    name: data.name.trim(),
    description: data.description || '',
    country: data.country || '',
    city: data.city || '',
    startDate: data.startDate,
    endDate: data.endDate,
    timezone: data.timezone || 'Asia/Bangkok',
    baseCurrency: data.baseCurrency || 'THB',
    coverImage: coverImageUrl,
    // v45: a cover crop is stored clamped, so a legacy or duplicated trip can
    // never carry coordinates (or a zoom) the rules would reject.
    ...(data.coverPosition ? { coverPosition: normalizeCoverPosition(data.coverPosition) } : {}),
    themeColor: data.themeColor || brandPrimary(), // brand-locked since v16 (kept for older exports)
    status: 'draft',
    memberUids: [userId],
    // Members join by typing this code; the admin approves the request.
    inviteCode: generateInviteCode(),
    inviteEnabled: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: userId
  };
  
  try {
    let ref = doc(collection(db, 'trips'));
    const createBatch = writeBatch(db);
    createBatch.set(ref, payload);
    createBatch.set(doc(db, 'publicTripInvites', payload.inviteCode), invitePreviewData(ref.id, payload));
    try {
      await createBatch.commit();
    } catch (e) {
      if (!permissionDenied(e)) throw e;
      // The older published rules do not yet define publicTripInvites. Keep trip
      // creation working during the deploy window; the server fallback/backfill
      // adds the preview once the new rules are live.
      ref = await addDoc(collection(db, 'trips'), payload);
    }
    try {
      const memberRef = doc(db, `trips/${ref.id}/members`, userId);
      await setDoc(memberRef, {
        uid: userId,
        displayName: data.creatorName || 'Admin',
        role: 'trip_admin',
        status: 'active',
        color: brandPrimary(), // member colour default (brand blue)
        avatar: '',
        permissions: { canEditItinerary: true, canEditExpense: true, canManageMembers: true },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        order: 0
      });
    } catch (memberErr) {
      console.warn('Member creation failed, but trip created:', memberErr.message);
    }
    
    if (coverFileForUpload || coverBlobForUpload) {
      try {
        const fileToUpload = coverBlobForUpload || coverFileForUpload;
        const url = await uploadCoverImage(ref.id, fileToUpload, userId);
        if (url && url !== coverImageUrl) {
          await updateTrip(ref.id, { coverImage: url });
        }
      } catch (uploadErr) {
        console.warn('Cover upload failed, trip still created:', uploadErr);
      }
    }
    
    clearTripsCacheInternal();
    return ref.id;
  } catch (e) {
    console.error('createTrip error:', e);
    if (e.code === 'permission-denied') {
      throw new Error(`ไม่มีสิทธิ์สร้างทริป - ต้อง deploy Firestore Rules ใหม่\n\nวิธีแก้:\n1. Firebase Console > Firestore > Rules\n2. วาง rules จากไฟล์ firestore.rules ใน repo\n3. Publish\n\nถ้ายังไม่ได้: ใช้ Test mode ชั่วคราว\nallow read, write: if request.auth != null;\n\nError: ${e.message}`);
    }
    throw e;
  }
}

export async function updateTrip(tripId, updates) {
  if (!db) throw new Error('DB not ready');
  const ref = doc(db, 'trips', tripId);
  const affectsInvitePreview = ['name', 'startDate', 'endDate', 'inviteCode', 'inviteEnabled']
    .some(key => Object.prototype.hasOwnProperty.call(updates || {}, key));
  if (!affectsInvitePreview) {
    await updateDoc(ref, { ...updates, updatedAt: serverTimestamp() });
    invalidateTrip(tripId);
    return;
  }

  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Trip not found');
  const previous = snap.data();
  const oldCode = normalizeInviteCode(previous.inviteCode);
  const next = { ...previous, ...(updates || {}) };
  let newCode = normalizeInviteCode(next.inviteCode);
  if (newCode && newCode !== next.inviteCode) next.inviteCode = newCode;
  if (!newCode && next.inviteEnabled !== false) {
    newCode = await uniqueInviteCode();
    next.inviteCode = newCode;
  }
  const oldOpen = Boolean(oldCode && previous.inviteEnabled !== false);
  const newOpen = Boolean(newCode && next.inviteEnabled !== false);
  const tripUpdates = {
    ...updates,
    ...(newCode && newCode !== previous.inviteCode ? { inviteCode: newCode } : {}),
    ...(newOpen ? { inviteEnabled: true } : {}),
    updatedAt: serverTimestamp()
  };
  let removeOldPreview = false;
  if (oldOpen && (!newOpen || oldCode !== newCode)) {
    try { removeOldPreview = (await getDoc(doc(db, 'publicTripInvites', oldCode))).exists(); }
    catch (e) { if (!permissionDenied(e)) throw e; }
  }
  const batch = writeBatch(db);
  batch.update(ref, tripUpdates);
  if (removeOldPreview) batch.delete(doc(db, 'publicTripInvites', oldCode));
  if (newOpen) {
    batch.set(doc(db, 'publicTripInvites', newCode), invitePreviewData(tripId, next));
  }
  try {
    await batch.commit();
  } catch (e) {
    // During rollout an older published ruleset will reject publicTripInvites.
    // Preserve the ordinary trip edit; a later invite lookup lazily backfills it.
    if (!permissionDenied(e)) throw e;
    await updateDoc(ref, tripUpdates);
  }
  invalidateTrip(tripId);
}


/* ------------------------------------------------------------------ *
 * Edit / duplicate / delete
 * ------------------------------------------------------------------ */

const TRIP_SUBCOLLECTIONS = [
  'itineraryItems', 'expenses', 'members', 'documents', 'categories',
  'cards', 'exchangeRates', 'settings', 'imports', 'activityLogs',
  'notes', 'joinRequests', 'settlements', 'comments', 'activity',
  // v16 trip tools
  'checklists', 'ideas', 'reservations',
  // v19: sub-groups (ทีม) live in their own collection — deleting the trip has to
  // take them with it, or orphan team docs would pile up in Firestore.
  'memberGroups',
  // v30: the 🔔 notification feed of the trip
  'notifications'
];

/**
 * Delete a trip plus its sub-collection documents.
 * Sub-collection cleanup is best-effort: the trip doc is removed even if some
 * nested documents cannot be deleted with the currently deployed rules.
 */
export async function deleteTrip(tripId, { onProgress } = {}) {
  if (!db) throw new Error('DB not ready');
  if (!tripId) throw new Error('Missing trip id');
  const warnings = [];
  let publicInviteCode = '';
  try {
    const tripSnap = await getDoc(doc(db, 'trips', tripId));
    if (tripSnap.exists()) publicInviteCode = normalizeInviteCode(tripSnap.data().inviteCode);
  } catch (e) {
    console.warn('[Trips] invite-code lookup before delete failed:', e?.code || e?.message);
  }

  // Guarded transfer records must be removed before membership is cleaned up.
  // Best-effort like the other sub-collections: a failed cleanup must not block
  // deleting the trip itself.
  try {
    const transfers = await getDocs(collection(db, `trips/${tripId}/transfers`));
    for (const transfer of transfers.docs) await deleteTransfer(tripId, transfer.id);
  } catch (e) {
    console.warn('[Trips] transfer cleanup failed:', e?.code || e?.message);
    warnings.push('transfers');
  }

  for (const sub of TRIP_SUBCOLLECTIONS) {
    try {
      onProgress?.(sub);
      const snap = await getDocs(query(collection(db, `trips/${tripId}/${sub}`), limit(300)));
      if (snap.empty) continue;
      let batch = writeBatch(db);
      let n = 0;
      for (const d of snap.docs) {
        if (sub === 'settlements' && d.id === '_transferGuard') continue;
        // Nested line items under expenses
        if (sub === 'expenses') {
          try {
            const lines = await getDocs(collection(db, `trips/${tripId}/expenses/${d.id}/lineItems`));
            for (const l of lines.docs) { try { await deleteDoc(l.ref); } catch {} }
          } catch {}
        }
        batch.delete(d.ref);
        n++;
        if (n % 400 === 0) { await batch.commit(); batch = writeBatch(db); }
      }
      if (n % 400 !== 0) await batch.commit();
    } catch (e) {
      console.warn(`[Trips] cleanup of ${sub} failed:`, e?.code || e?.message);
      warnings.push(sub);
    }
  }

  cacheClear();

  try {
    const finalBatch = writeBatch(db);
    finalBatch.delete(doc(db, `trips/${tripId}/settlements/_transferGuard`));
    if (publicInviteCode) {
      try {
        const preview = await getDoc(doc(db, 'publicTripInvites', publicInviteCode));
        if (preview.exists()) finalBatch.delete(doc(db, 'publicTripInvites', publicInviteCode));
      } catch (e) {
        if (!permissionDenied(e)) throw e;
      }
    }
    finalBatch.delete(doc(db, 'trips', tripId));
    await finalBatch.commit();
  } catch (e) {
    if (e?.code === 'permission-denied') {
      throw new Error('ไม่มีสิทธิ์ลบทริปนี้ — ต้อง deploy Firestore Rules ใหม่ (ให้ trip admin ลบได้)');
    }
    throw e;
  }
  clearTripsCacheInternal();
  return { warnings };
}

/** Copy a trip's settings + itinerary into a brand new trip. */
export async function duplicateTrip(sourceTrip, userId, { nameSuffix = ' (สำเนา)' } = {}) {
  if (!db) throw new Error('DB not ready');
  if (!sourceTrip?.id) throw new Error('ไม่พบทริปต้นฉบับ');
  const newId = await createTrip({
    name: `${sourceTrip.name || 'Trip'}${nameSuffix}`,
    description: sourceTrip.description || '',
    country: sourceTrip.country || '',
    city: sourceTrip.city || '',
    startDate: sourceTrip.startDate,
    endDate: sourceTrip.endDate,
    timezone: sourceTrip.timezone || 'Asia/Bangkok',
    baseCurrency: sourceTrip.baseCurrency || 'THB',
    coverImage: sourceTrip.coverImage || '',
    coverPosition: sourceTrip.coverPosition,
    themeColor: sourceTrip.themeColor || brandPrimary(),
    creatorName: 'Admin'
  }, userId);

  // Copy members (without login accounts) so splitting keeps working
  try {
    const members = await getDocs(collection(db, `trips/${sourceTrip.id}/members`));
    const copiedMembers = [];
    for (const m of members.docs) {
      const { ...data } = m.data();
      await setDoc(doc(db, `trips/${newId}/members`, m.id), data, { merge: true });
      copiedMembers.push({ id: m.id, ...data });
    }
    // createTrip() seeded memberUids with the creator only. Without this the
    // copied member documents exist (the admin sees everyone in the copy) but
    // none of those members can ever see the copied trip in their list.
    const missing = missingMemberUids([userId], copiedMembers);
    if (missing.length) {
      await updateDoc(doc(db, 'trips', newId), {
        memberUids: arrayUnion(...missing), updatedAt: serverTimestamp()
      });
    }
  } catch (e) { console.warn('copy members failed', e?.message); }

  // Copy itinerary items
  try {
    const items = await getDocs(collection(db, `trips/${sourceTrip.id}/itineraryItems`));
    let batch = writeBatch(db);
    let n = 0;
    for (const it of items.docs) {
      const data = { ...it.data() };
      const ref = doc(collection(db, `trips/${newId}/itineraryItems`));
      batch.set(ref, { ...data, createdBy: userId, updatedBy: userId, version: 1 });
      n++;
      if (n % 400 === 0) { await batch.commit(); batch = writeBatch(db); }
    }
    if (n % 400 !== 0) await batch.commit();
  } catch (e) { console.warn('copy itinerary failed', e?.message); }

  clearTripsCacheInternal();
  return newId;
}

function invalidateAfterWrite(tripId) {
  if (tripId) invalidateTrip(tripId); else cacheClear();
}

export async function addMemberUidToTrip(tripId, uid) {
  if (!db) return;
  try { await updateDoc(doc(db, 'trips', tripId), { memberUids: arrayUnion(uid), updatedAt: serverTimestamp() }); } catch (e) { console.warn('addMemberUid failed', e?.message); }
  invalidateAfterWrite(tripId);
}

export async function removeMemberUidFromTrip(tripId, uid) {
  if (!db) return;
  try { await updateDoc(doc(db, 'trips', tripId), { memberUids: arrayRemove(uid), updatedAt: serverTimestamp() }); } catch (e) { console.warn('removeMemberUid failed', e?.message); }
  invalidateAfterWrite(tripId);
}

export function clearTripsCache() { clearTripsCacheInternal(); cacheForget('trip:'); }

/** Drop every cached read (the header Refresh button uses this). */
export function clearAllDataCache() { cacheClear(); clearTripsCacheInternal(); }
