import { db, storage, serverTimestamp, isStorageAvailable } from '../firebase.js';
import { collection, doc, getDoc, getDocs, addDoc, setDoc, updateDoc, query, where, limit } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js';
import { compressImage } from '../utils/helpers.js';

const TRIPS_CACHE_KEY = 'fuji_trips_cache';
const CACHE_TTL = 5 * 60 * 1000;

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

function clearTripsCache() {
  try { localStorage.removeItem(TRIPS_CACHE_KEY); } catch {}
}

// Convert blob to base64 data URL for free tier fallback
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
  
  try {
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Timeout loading trips - check Firestore rules')), 8000)
    );
    
    let queryPromise;
    if (isSuperAdmin) {
      queryPromise = getDocs(query(collection(db, 'trips'), limit(30)));
    } else {
      queryPromise = getDocs(query(collection(db, 'trips'), where('memberUids', 'array-contains', userId), limit(30)));
    }
    
    const snap = await Promise.race([queryPromise, timeoutPromise]);
    const trips = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    setCachedTrips(trips);
    return trips;
  } catch (e) {
    console.warn('listTrips primary failed:', e.message, e.code);
    if (cached && cached.length) return cached;
    try {
      const fallback = await getDocs(query(collection(db, 'trips'), where('createdBy', '==', userId), limit(30)));
      const trips = fallback.docs.map(d => ({ id: d.id, ...d.data() }));
      setCachedTrips(trips);
      return trips;
    } catch (fallbackErr) {
      console.error('Fallback failed:', fallbackErr);
    }
    if (e.code === 'permission-denied') {
      throw new Error('❌ ไม่มีสิทธิ์อ่านทริป - deploy Firestore Rules ใหม่\n' + e.message);
    }
    throw e;
  }
}

export async function getTrip(tripId) {
  if (!db) throw new Error('DB not ready');
  const ref = doc(db, 'trips', tripId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Trip not found');
  return { id: snap.id, ...snap.data() };
}

// Upload cover with free tier fallback to base64
export async function uploadCoverImage(tripId, fileOrBlob, userId) {
  if (!fileOrBlob) return '';
  
  // If storage not available (free tier without Storage), return base64 directly
  if (!storage || !isStorageAvailable) {
    console.log('[uploadCoverImage] Storage not available (free tier) - using base64 fallback');
    try {
      const blob = fileOrBlob instanceof File ? await compressImage(fileOrBlob, 800, 0.7) : fileOrBlob;
      // Check size - Firestore limit 1MB per doc, so keep base64 under ~800KB
      if (blob.size > 800 * 1024) {
        console.warn('Image too large for base64 fallback, compressing more');
        const extraCompressed = await compressImage(new File([blob], 'cover.webp', { type: 'image/webp' }), 600, 0.6);
        if (extraCompressed.size > 800 * 1024) {
          throw new Error('Image too large even after compression - will use theme color instead');
        }
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
    console.error('Upload cover failed:', e, e.code);
    // If storage fails (free tier, bucket not found, unauthorized), fallback to base64
    if (e.code && (e.code.includes('storage/') || e.code === 'permission-denied' || e.message.includes('storage'))) {
      console.log('Storage upload failed, trying base64 fallback for free tier');
      try {
        const blob = fileOrBlob instanceof File ? await compressImage(fileOrBlob, 800, 0.7) : fileOrBlob;
        if (blob.size > 800 * 1024) {
          console.warn('Image too large for free tier fallback');
          return '';
        }
        const dataUrl = await blobToDataURL(blob);
        console.log('Using base64 fallback for cover, size:', dataUrl.length);
        return dataUrl;
      } catch (fallbackErr) {
        console.warn('Base64 fallback also failed:', fallbackErr);
        return '';
      }
    }
    throw new Error('Upload cover failed: ' + e.message);
  }
}

export async function createTrip(data, userId) {
  if (!db) throw new Error('DB not ready - Firebase not configured');
  if (!userId) throw new Error('User not authenticated - please login again');
  
  if (!data.name || !data.name.trim()) throw new Error('กรุณากรอกชื่อทริป');
  if (!data.startDate || !data.endDate) throw new Error('กรุณาเลือกวันเริ่มและสิ้นสุด');
  
  // Handle cover image: support URL, file, blob, base64
  let coverImageUrl = data.coverImage || data.coverUrl || '';
  let coverFileForUpload = data.coverFile || null;
  let coverBlobForUpload = data.coverBlob || null;
  
  // If coverUrl provided as image URL, use it directly
  if (data.coverUrl && data.coverUrl.startsWith('http')) {
    coverImageUrl = data.coverUrl;
    coverFileForUpload = null;
    coverBlobForUpload = null;
    console.log('Using cover URL:', coverImageUrl.slice(0,60));
  }
  
  // For free tier without storage, prepare base64 upfront if storage not available
  if ((coverFileForUpload || coverBlobForUpload) && (!storage || !isStorageAvailable)) {
    try {
      const blob = coverBlobForUpload || coverFileForUpload;
      const dataUrl = await blobToDataURL(blob instanceof File ? await compressImage(blob, 800, 0.7) : blob);
      if (dataUrl.length < 900 * 1024) {
        coverImageUrl = dataUrl;
        coverFileForUpload = null;
        coverBlobForUpload = null;
        console.log('Free tier: using base64 cover directly in trip doc');
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
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: userId
  };
  
  try {
    console.log('[createTrip] Creating trip:', payload.name, 'Storage available:', isStorageAvailable, 'Has cover:', !!coverImageUrl || !!coverFileForUpload || !!coverBlobForUpload);
    const ref = await addDoc(collection(db, 'trips'), payload);
    console.log('[createTrip] Trip created:', ref.id);
    
    try {
      const memberRef = doc(db, `trips/${ref.id}/members`, userId);
      await setDoc(memberRef, {
        uid: userId,
        displayName: data.creatorName || 'Admin',
        role: 'trip_admin',
        status: 'active',
        color: payload.themeColor,
        avatar: '🌸',
        permissions: { canEditItinerary: true, canEditExpense: true, canManageMembers: true },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        order: 0
      });
      console.log('[createTrip] Member created');
    } catch (memberErr) {
      console.error('[createTrip] Member creation failed:', memberErr);
      if (memberErr.code !== 'permission-denied') throw memberErr;
    }
    
    // Upload cover if still needed (storage available case)
    if (coverFileForUpload || coverBlobForUpload) {
      try {
        console.log('[createTrip] Uploading cover to Storage...');
        const fileToUpload = coverBlobForUpload || coverFileForUpload;
        const url = await uploadCoverImage(ref.id, fileToUpload, userId);
        if (url && url !== coverImageUrl) {
          console.log('[createTrip] Cover uploaded:', url.substring(0, 50));
          await updateTrip(ref.id, { coverImage: url });
        }
      } catch (uploadErr) {
        console.warn('Cover upload failed, trip still created:', uploadErr);
      }
    }
    
    clearTripsCache();
    return ref.id;
  } catch (e) {
    console.error('createTrip error:', e, e.code);
    if (e.code === 'permission-denied') {
      throw new Error(`❌ ไม่มีสิทธิ์สร้างทริป - deploy Firestore Rules ใหม่\n\nวิธีแก้:\n1. Firebase Console > Firestore > Rules\n2. วาง rules จากไฟล์ firestore.rules\n3. Publish\n\nError: ${e.message}`);
    }
    throw e;
  }
}

export async function updateTrip(tripId, updates) {
  if (!db) throw new Error('DB not ready');
  const ref = doc(db, 'trips', tripId);
  await updateDoc(ref, { ...updates, updatedAt: serverTimestamp() });
  clearTripsCache();
}
