import { db, storage, serverTimestamp, isStorageAvailable } from '../firebase.js';
import { collection, doc, getDoc, getDocs, addDoc, setDoc, updateDoc, deleteDoc, writeBatch, query, where, limit, arrayUnion, arrayRemove } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js';
import { compressImage } from '../utils/helpers.js';
import { generateInviteCode } from '../utils/invite.js';

const TRIPS_CACHE_KEY = 'fuji_trips_cache';
const CACHE_TTL = 10 * 60 * 1000;

function getCachedTrips() {
  try {
    const cached = localStorage.getItem(TRIPS_CACHE_KEY);
    if (!cached) return null;
    const { data, timestamp } = JSON.parse(cached);
    if (Date.now() - timestamp > CACHE_TTL) return null;
    return data;
  } catch { return null; }
}

function setCachedTrips(trips) {
  try {
    localStorage.setItem(TRIPS_CACHE_KEY, JSON.stringify({ data: trips, timestamp: Date.now() }));
  } catch {}
}

function clearTripsCacheInternal() {
  try { localStorage.removeItem(TRIPS_CACHE_KEY); } catch {}
}

function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export async function listTrips(userId, isSuperAdmin = false) {
  if (!db) throw new Error('DB not ready - Firebase not configured');
  if (!userId) throw new Error('User not authenticated');
  
  const cached = getCachedTrips();
  
  const tryQuery = async (q, label) => {
    try {
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error(`Timeout ${label} - check Firestore rules & indexes`)), 10000)
      );
      const snap = await Promise.race([getDocs(q), timeoutPromise]);
      const trips = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (trips.length) setCachedTrips(trips);
      return trips;
    } catch (e) {
      console.warn(`listTrips ${label} failed:`, e.message, e.code);
      throw e;
    }
  };
  
  // Try 1: array-contains
  try {
    const q = query(collection(db, 'trips'), where('memberUids', 'array-contains', userId), limit(30));
    const trips = await tryQuery(q, 'memberUids');
    return trips;
  } catch (e) {
    if (e.code === 'permission-denied' && cached?.length) return cached;
  }
  
  // Try 2: createdBy
  try {
    const q = query(collection(db, 'trips'), where('createdBy', '==', userId), limit(30));
    const trips = await tryQuery(q, 'createdBy');
    return trips;
  } catch (e) {
    if (e.code === 'permission-denied' && cached?.length) return cached;
  }
  
  // Try 3: all trips permissive (new rules allow list for auth)
  try {
    const q = query(collection(db, 'trips'), limit(50));
    const allTrips = await tryQuery(q, 'all');
    const filtered = allTrips.filter(t => t.memberUids?.includes(userId) || t.createdBy === userId);
    if (filtered.length) return filtered;
    if (allTrips.length) return allTrips; // permissive mode
  } catch (e) {
    console.warn('listTrips all failed', e.message);
  }
  
  if (cached?.length) return cached;
  
  throw new Error('ไม่มีสิทธิ์เข้าถึง - ต้อง deploy Firestore Rules ใหม่ที่ Firebase Console > Firestore > Rules > วาง firestore.rules > Publish');
}

/** New code for a trip that was created before invite codes existed, or to revoke one. */
export async function regenerateInviteCode(tripId) {
  if (!db) throw new Error('DB not ready');
  const code = generateInviteCode();
  await updateDoc(doc(db, 'trips', tripId), { inviteCode: code, inviteEnabled: true, updatedAt: serverTimestamp() });
  return code;
}

export async function setInviteEnabled(tripId, enabled) {
  if (!db) throw new Error('DB not ready');
  await updateDoc(doc(db, 'trips', tripId), { inviteEnabled: Boolean(enabled), updatedAt: serverTimestamp() });
}

/** Trip lookup by invite code (used by the join page). */
export async function findTripByInviteCode(code) {
  if (!db) throw new Error('DB not ready');
  const snap = await getDocs(query(collection(db, 'trips'), where('inviteCode', '==', code), limit(1)));
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data() };
}

export async function getTrip(tripId) {
  if (!db) throw new Error('DB not ready');
  const ref = doc(db, 'trips', tripId);
  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error('Trip not found');
    return { id: snap.id, ...snap.data() };
  } catch (e) {
    // Members who signed in with a username + PIN but without a Firebase Auth
    // token (Cloud Functions missing) fall back to the locally cached trip.
    const cached = getCachedTrips()?.find(t => t.id === tripId);
    if (cached && (e.code === 'permission-denied' || /permission/i.test(e.message || ''))) {
      console.warn('getTrip permission-denied → using cached trip', tripId);
      return cached;
    }
    throw e;
  }
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
    themeColor: data.themeColor || '#8bb89a',
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
    const ref = await addDoc(collection(db, 'trips'), payload);
    try {
      const memberRef = doc(db, `trips/${ref.id}/members`, userId);
      await setDoc(memberRef, {
        uid: userId,
        displayName: data.creatorName || 'Admin',
        role: 'trip_admin',
        status: 'active',
        color: payload.themeColor,
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
  await updateDoc(ref, { ...updates, updatedAt: serverTimestamp() });
  clearTripsCacheInternal();
}


/* ------------------------------------------------------------------ *
 * Edit / duplicate / delete
 * ------------------------------------------------------------------ */

const TRIP_SUBCOLLECTIONS = [
  'itineraryItems', 'expenses', 'members', 'documents', 'categories',
  'cards', 'exchangeRates', 'settings', 'imports', 'activityLogs'
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

  for (const sub of TRIP_SUBCOLLECTIONS) {
    try {
      onProgress?.(sub);
      const snap = await getDocs(query(collection(db, `trips/${tripId}/${sub}`), limit(300)));
      if (snap.empty) continue;
      let batch = writeBatch(db);
      let n = 0;
      for (const d of snap.docs) {
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

  try {
    await deleteDoc(doc(db, 'trips', tripId));
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
    themeColor: sourceTrip.themeColor || '#8bb89a',
    creatorName: 'Admin'
  }, userId);

  // Copy members (without login accounts) so splitting keeps working
  try {
    const members = await getDocs(collection(db, `trips/${sourceTrip.id}/members`));
    for (const m of members.docs) {
      const { ...data } = m.data();
      await setDoc(doc(db, `trips/${newId}/members`, m.id), data, { merge: true });
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

export async function addMemberUidToTrip(tripId, uid) {
  if (!db) return;
  try { await updateDoc(doc(db, 'trips', tripId), { memberUids: arrayUnion(uid), updatedAt: serverTimestamp() }); } catch (e) { console.warn('addMemberUid failed', e?.message); }
}

export async function removeMemberUidFromTrip(tripId, uid) {
  if (!db) return;
  try { await updateDoc(doc(db, 'trips', tripId), { memberUids: arrayRemove(uid), updatedAt: serverTimestamp() }); } catch (e) { console.warn('removeMemberUid failed', e?.message); }
}

export function clearTripsCache() { clearTripsCacheInternal(); }
